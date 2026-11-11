import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import type { Request } from 'express';
import multer from 'multer';
import type { Container } from '../container';
import { Perfil, RotulosEstado } from '../domain/enums';
import { ErroNaoAutorizado, ErroValidacao } from '../domain/errors';
import { combinarDataHora, formatarData, formatarDataInput, formatarHora } from '../lib/date';
import {
  enviarCsv,
  enviarIcs,
  enviarPdf,
  gerarCsv,
  gerarIcs,
  gerarPdf,
} from '../lib/exportacao';
import { paginacaoDaQuery } from '../lib/pagination';
import { asyncHandler } from '../middleware/asyncHandler';
import { exigirPerfil } from '../middleware/auth';
import { csrfDepoisDoUpload } from '../middleware/csrf';
import { RealizarConsultaCommand } from '../patterns/command/ConsultasCommands';
import {
  dataDaQuery,
  navegacaoAgenda,
  textoDaQuery,
  urlSemPagina,
  vistaDaQuery,
} from './helpers';

async function medicoAtual(req: Request, container: Container) {
  return container.medicos.obterPorUtilizadorId(req.session.utilizador!.id);
}

const pastaDocumentos = path.join(__dirname, '..', '..', 'public', 'uploads', 'documentos');
fs.mkdirSync(pastaDocumentos, { recursive: true });

const uploadDocumento = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, pastaDocumentos),
    filename: (_req, file, cb) => {
      const extensao = path.extname(file.originalname).toLowerCase() || '.pdf';
      cb(null, `${Date.now()}-${randomUUID()}${extensao}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const permitidos = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!permitidos.includes(file.mimetype)) {
      cb(new ErroValidacao('Envie um ficheiro PDF, JPG ou PNG.'));
      return;
    }
    cb(null, true);
  },
});

export function rotasMedico(container: Container): Router {
  const router = Router();
  router.use(exigirPerfil(Perfil.MEDICO));

  router.get(
    '/dashboard',
    asyncHandler(async (req, res) => {
      const medico = await medicoAtual(req, container);
      const hoje = new Date();
      const [agendaHoje, agendaSemana, proximas, todas] = await Promise.all([
        container.agenda.agendaDoDia(medico.id, hoje),
        container.agenda.agendaSemanal(medico.id, hoje),
        container.agenda.proximasConsultas(medico.id, 8),
        container.consultas.listar({ medicoId: medico.id, limite: 300 }),
      ]);

      const estatisticas = {
        total: todas.length,
        realizadas: todas.filter((c) => c.estado === 'REALIZADA').length,
        canceladas: todas.filter((c) => c.estado === 'CANCELADA').length,
        pendentes: todas.filter((c) => c.estado === 'PENDENTE').length,
        hoje: agendaHoje.length,
      };

      res.render('medico/dashboard', {
        titulo: 'Painel do medico',
        medico,
        agendaHoje,
        agendaSemana,
        proximas,
        estatisticas,
        hoje: formatarDataInput(hoje),
      });
    }),
  );

  router.get(
    '/agenda',
    asyncHandler(async (req, res) => {
      const medico = await medicoAtual(req, container);
      const data = dataDaQuery(req.query.data);
      const vista = vistaDaQuery(req.query.vista);
      const navegacao = navegacaoAgenda(data, vista);

      const dados: Record<string, unknown> = {
        titulo:
          vista === 'semana'
            ? 'Agenda semanal'
            : vista === 'mes'
              ? 'Agenda mensal'
              : 'Agenda diária',
        medico,
        vista,
        navegacao,
        dataSelecionada: formatarDataInput(data),
      };

      if (vista === 'semana') {
        dados.dias = await container.agenda.agendaSemanal(medico.id, data);
      } else if (vista === 'mes') {
        dados.mes = await container.agenda.agendaMensal(medico.id, data);
      } else {
        const [consultas, slots] = await Promise.all([
          container.agenda.agendaDoDia(medico.id, data),
          container.agenda.gerarSlots(medico.id, data),
        ]);
        dados.consultas = consultas;
        dados.slots = slots;
      }

      res.render('medico/agenda', dados);
    }),
  );

  router.get(
    '/consultas/exportar.csv',
    asyncHandler(async (req, res) => {
      const medico = await medicoAtual(req, container);
      const consultas = await container.consultas.listar({
        medicoId: medico.id,
        estado: textoDaQuery(req.query.estado),
        limite: 5000,
      });
      const csv = gerarCsv(
        consultas.map((consulta) => ({
          data: formatarData(consulta.inicio),
          hora: formatarHora(consulta.inicio),
          paciente: consulta.paciente.utilizador.nome,
          especialidade: consulta.especialidade?.nome ?? 'Consulta geral',
          estado: RotulosEstado[consulta.estado as keyof typeof RotulosEstado],
          motivo: consulta.motivo ?? '',
        })),
        [
          { chave: 'data', rotulo: 'Data' },
          { chave: 'hora', rotulo: 'Hora' },
          { chave: 'paciente', rotulo: 'Paciente' },
          { chave: 'especialidade', rotulo: 'Especialidade' },
          { chave: 'estado', rotulo: 'Estado' },
          { chave: 'motivo', rotulo: 'Motivo' },
        ],
      );
      enviarCsv(res, `consultas-${formatarDataInput(new Date())}.csv`, csv);
    }),
  );

  router.get(
    '/consultas/exportar.pdf',
    asyncHandler(async (req, res) => {
      const medico = await medicoAtual(req, container);
      const consultas = await container.consultas.listar({
        medicoId: medico.id,
        estado: textoDaQuery(req.query.estado),
        limite: 5000,
      });
      const pdf = await gerarPdf({
        titulo: 'Histórico de consultas',
        subtitulo: `${medico.utilizador.nome} · ${consultas.length} registo(s)`,
        resumo: [
          { rotulo: 'Realizadas', valor: String(consultas.filter((c) => c.estado === 'REALIZADA').length) },
          { rotulo: 'Confirmadas', valor: String(consultas.filter((c) => c.estado === 'CONFIRMADA').length) },
          { rotulo: 'Canceladas', valor: String(consultas.filter((c) => c.estado === 'CANCELADA').length) },
        ],
        tabelas: [
          {
            titulo: 'Consultas',
            colunas: [
              { rotulo: 'Data', largura: 70 },
              { rotulo: 'Hora', largura: 45 },
              { rotulo: 'Paciente', largura: 150 },
              { rotulo: 'Especialidade', largura: 120 },
              { rotulo: 'Estado', largura: 75 },
            ],
            linhas: consultas.map((consulta) => [
              formatarData(consulta.inicio),
              formatarHora(consulta.inicio),
              consulta.paciente.utilizador.nome,
              consulta.especialidade?.nome ?? 'Consulta geral',
              RotulosEstado[consulta.estado as keyof typeof RotulosEstado],
            ]),
          },
        ],
        notas: ['Documento gerado automaticamente pelo MediAgenda.'],
      });
      enviarPdf(res, `consultas-${formatarDataInput(new Date())}.pdf`, pdf);
    }),
  );

  router.get(
    '/consultas/exportar.ics',
    asyncHandler(async (req, res) => {
      const medico = await medicoAtual(req, container);
      const consultas = await container.consultas.listar({
        medicoId: medico.id,
        desde: new Date(),
        limite: 5000,
      });
      const ics = gerarIcs(
        consultas
          .filter((consulta) => consulta.estado !== 'CANCELADA')
          .map((consulta) => ({
            id: consulta.id,
            inicio: consulta.inicio,
            fim: consulta.fim,
            titulo: `Consulta · ${consulta.paciente.utilizador.nome}`,
            descricao: `${consulta.especialidade?.nome ?? 'Consulta geral'}${consulta.motivo ? ` · ${consulta.motivo}` : ''}`,
            localizacao: medico.localizacao,
          })),
        `Agenda de ${medico.utilizador.nome}`,
      );
      enviarIcs(res, `agenda-${formatarDataInput(new Date())}.ics`, ics);
    }),
  );

  router.post(
    '/consultas/:id/realizar',
    asyncHandler(async (req, res) => {
      const medico = await medicoAtual(req, container);
      const consulta = await container.consultas.obterPorId(req.params.id);
      if (consulta.medicoId !== medico.id) throw new ErroNaoAutorizado();

      await new RealizarConsultaCommand(container.consultas, {
        consultaId: consulta.id,
        atorId: req.session.utilizador!.id,
        atorPerfil: Perfil.MEDICO,
      }).executar();

      req.session.flash = { tipo: 'success', mensagem: 'Consulta marcada como realizada.' };
      res.redirect(req.get('referer') ?? '/medico/agenda');
    }),
  );

  router.get(
    '/lista-espera',
    asyncHandler(async (req, res) => {
      const medico = await medicoAtual(req, container);
      const pedidos = await container.listaEspera.listarAtivas(medico.id);
      res.render('medico/lista-espera', {
        titulo: 'Lista de espera',
        medico,
        pedidos,
      });
    }),
  );

  router.get(
    '/disponibilidade',
    asyncHandler(async (req, res) => {
      const medico = await medicoAtual(req, container);
      res.render('medico/disponibilidade', {
        titulo: 'Disponibilidade',
        medico,
      });
    }),
  );

  router.post(
    '/disponibilidade',
    asyncHandler(async (req, res) => {
      const medico = await medicoAtual(req, container);
      const corpo = req.body as Record<string, string>;
      const disponibilidades: Array<{ diaSemana: number; horaInicio: string; horaFim: string }> = [];

      for (let dia = 0; dia <= 6; dia += 1) {
        for (const sufixo of ['', '2']) {
          const inicio = corpo[`inicio${sufixo}_${dia}`];
          const fim = corpo[`fim${sufixo}_${dia}`];
          if (inicio && fim) {
            disponibilidades.push({ diaSemana: dia, horaInicio: inicio, horaFim: fim });
          }
        }
      }

      await container.agenda.definirDisponibilidade(medico.id, disponibilidades);
      req.session.flash = {
        tipo: 'success',
        mensagem: 'Disponibilidade actualizada. Novas marcacoes ja respeitam estes horarios.',
      };
      res.redirect('/medico/disponibilidade');
    }),
  );

  router.get(
    '/bloqueios',
    asyncHandler(async (req, res) => {
      const medico = await medicoAtual(req, container);
      const bloqueios = await container.agenda.listarBloqueios(medico.id);
      res.render('medico/bloqueios', {
        titulo: 'Bloqueios e ferias',
        medico,
        bloqueios,
      });
    }),
  );

  router.post(
    '/bloqueios',
    asyncHandler(async (req, res) => {
      const medico = await medicoAtual(req, container);
      const { inicio, fim, motivo } = req.body as Record<string, string>;
      await container.agenda.bloquearPeriodo(
        medico.id,
        combinarDataHora(inicio.slice(0, 10), inicio.slice(11, 16)),
        combinarDataHora(fim.slice(0, 10), fim.slice(11, 16)),
        motivo,
      );
      req.session.flash = { tipo: 'success', mensagem: 'Bloqueio registado.' };
      res.redirect('/medico/bloqueios');
    }),
  );

  router.post(
    '/bloqueios/:id/remover',
    asyncHandler(async (req, res) => {
      const medico = await medicoAtual(req, container);
      await container.agenda.removerBloqueio(req.params.id, medico.id);
      req.session.flash = { tipo: 'success', mensagem: 'Bloqueio removido.' };
      res.redirect('/medico/bloqueios');
    }),
  );

  router.get(
    '/consultas',
    asyncHandler(async (req, res) => {
      const medico = await medicoAtual(req, container);
      const pagina = await container.consultas.listarPaginado(
        {
          medicoId: medico.id,
          estado: textoDaQuery(req.query.estado),
        },
        paginacaoDaQuery(req.query, 15),
      );
      res.render('medico/consultas', {
        titulo: 'Histórico de consultas',
        medico,
        consultas: pagina.itens,
        paginacao: pagina,
        urlBase: urlSemPagina(req),
        filtros: { estado: textoDaQuery(req.query.estado) ?? '' },
      });
    }),
  );

  router.get(
    '/pacientes/:id/historico',
    asyncHandler(async (req, res) => {
      const medico = await medicoAtual(req, container);
      const paciente = await container.pacientes.obterPorId(req.params.id);
      const consultas = await container.consultas.listar({
        medicoId: medico.id,
        pacienteId: paciente.id,
        limite: 200,
      });

      if (!consultas.length) {
        throw new ErroNaoAutorizado('Não tem histórico de consultas com este paciente.');
      }

      const documentos = await container.documentos.listarPorMedico(medico.id, paciente.id);

      res.render('medico/paciente-historico', {
        titulo: `Histórico de ${paciente.utilizador.nome}`,
        medico,
        paciente,
        consultas,
        documentos,
      });
    }),
  );

  router.get(
    '/documentos',
    asyncHandler(async (req, res) => {
      const medico = await medicoAtual(req, container);
      const documentos = await container.documentos.listarPorMedico(medico.id);
      res.render('medico/documentos', {
        titulo: 'Documentos clínicos',
        medico,
        documentos,
      });
    }),
  );

  router.post(
    '/pacientes/:id/documentos',
    uploadDocumento.single('ficheiro'),
    csrfDepoisDoUpload,
    asyncHandler(async (req, res) => {
      const medico = await medicoAtual(req, container);
      const paciente = await container.pacientes.obterPorId(req.params.id);
      const corpo = req.body as Record<string, string>;

      try {
        await container.documentos.criar(medico.id, {
          pacienteId: paciente.id,
          consultaId: corpo.consultaId || null,
          tipo: corpo.tipo || 'NOTA',
          titulo: corpo.titulo || '',
          conteudo: corpo.conteudo || null,
          ficheiro: req.file
            ? {
                nome: req.file.originalname,
                caminho: req.file.path,
                tipo: req.file.mimetype,
              }
            : null,
        });
      } catch (erro) {
        if (req.file) fs.rm(req.file.path, { force: true }, () => undefined);
        throw erro;
      }

      req.session.flash = { tipo: 'success', mensagem: 'Documento clínico registado.' };
      res.redirect(`/medico/pacientes/${paciente.id}/historico`);
    }),
  );

  router.get(
    '/documentos/:id/ficheiro',
    asyncHandler(async (req, res) => {
      const medico = await medicoAtual(req, container);
      const documento = await container.documentos.obter(req.params.id);
      if (documento.medicoId !== medico.id) throw new ErroNaoAutorizado();

      const caminho = container.documentos.caminhoAbsoluto(documento);
      if (!caminho || !fs.existsSync(caminho)) {
        throw new ErroNaoAutorizado('O ficheiro deste documento já não está disponível.');
      }
      res.download(caminho, documento.ficheiroNome ?? path.basename(caminho));
    }),
  );

  router.post(
    '/documentos/:id/remover',
    asyncHandler(async (req, res) => {
      const medico = await medicoAtual(req, container);
      await container.documentos.remover(req.params.id, medico.id);
      req.session.flash = { tipo: 'info', mensagem: 'Documento removido.' };
      res.redirect(req.get('referer') ?? '/medico/documentos');
    }),
  );

  router.get(
    '/perfil',
    asyncHandler(async (req, res) => {
      const medico = await medicoAtual(req, container);
      const especialidades = await container.especialidades.listar();
      res.render('medico/perfil', {
        titulo: 'O meu perfil',
        medico,
        especialidades,
      });
    }),
  );

  router.post(
    '/perfil',
    asyncHandler(async (req, res) => {
      const medico = await medicoAtual(req, container);
      const corpo = req.body as Record<string, string>;
      const especialidadeIds = Array.isArray(corpo.especialidadeIds)
        ? corpo.especialidadeIds
        : corpo.especialidadeIds
          ? [corpo.especialidadeIds]
          : [];

      await container.medicos.atualizar(medico.id, {
        numeroRegisto: corpo.numeroRegisto,
        telefone: corpo.telefone,
        localizacao: corpo.localizacao,
        bio: corpo.bio,
        duracaoConsultaMinutos: Number(corpo.duracaoConsultaMinutos || 60),
        maxConsultasDia: Number(corpo.maxConsultasDia || 10),
        ...(especialidadeIds.length ? { especialidadeIds } : {}),
      });

      await container.auth.atualizarPreferencias(req.session.utilizador!.id, {
        nome: corpo.nome,
        telefone: corpo.telefone,
        preferenciaNotificacao: corpo.preferenciaNotificacao,
      });

      if (corpo.nome) req.session.utilizador!.nome = corpo.nome;
      req.session.flash = { tipo: 'success', mensagem: 'Perfil actualizado.' };
      res.redirect('/medico/perfil');
    }),
  );

  router.post(
    '/password',
    asyncHandler(async (req, res) => {
      await container.auth.alterarPassword(
        req.session.utilizador!.id,
        req.body.atual ?? '',
        req.body.nova ?? '',
      );
      req.session.utilizador!.passwordChangedAt = new Date().toISOString();
      req.session.flash = { tipo: 'success', mensagem: 'Palavra-passe alterada.' };
      res.redirect('/medico/perfil');
    }),
  );

  return router;
}
