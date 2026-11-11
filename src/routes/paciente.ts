import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import type { Request } from 'express';
import { env } from '../config/env';
import type { Container } from '../container';
import { Perfil, RotulosEstado } from '../domain/enums';
import { ErroNaoAutorizado } from '../domain/errors';
import { formatarData, formatarDataInput, formatarHora } from '../lib/date';
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
import { CancelarConsultaCommand } from '../patterns/command/ConsultasCommands';
import { esquemaListaEspera, validarEsquema } from '../validation';
import { textoDaQuery, urlSemPagina } from './helpers';

async function pacienteAtual(req: Request, container: Container) {
  return container.pacientes.obterPorUtilizadorId(req.session.utilizador!.id);
}

export function rotasPaciente(container: Container): Router {
  const router = Router();
  router.use(exigirPerfil(Perfil.PACIENTE));

  router.get(
    '/dashboard',
    asyncHandler(async (req, res) => {
      const paciente = await pacienteAtual(req, container);
      const [estatisticas, consultas, especialidades] = await Promise.all([
        container.pacientes.estatisticas(paciente.id),
        container.consultas.listar({ pacienteId: paciente.id, limite: 10 }),
        container.especialidades.listar(),
      ]);

      const proximas = consultas
        .filter(
          (consulta) =>
            consulta.inicio >= new Date() &&
            (consulta.estado === 'PENDENTE' || consulta.estado === 'CONFIRMADA'),
        )
        .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());

      res.render('paciente/dashboard', {
        titulo: 'A minha area',
        paciente,
        estatisticas,
        proximas,
        recentes: consultas.slice(0, 5),
        especialidades,
      });
    }),
  );

  router.get(
    '/consultas',
    asyncHandler(async (req, res) => {
      const paciente = await pacienteAtual(req, container);
      const [pagina, especialidades] = await Promise.all([
        container.consultas.listarPaginado(
          {
            pacienteId: paciente.id,
            estado: textoDaQuery(req.query.estado),
            especialidadeId: textoDaQuery(req.query.especialidade),
          },
          paginacaoDaQuery(req.query, 10),
        ),
        container.especialidades.listar(),
      ]);

      res.render('paciente/consultas', {
        titulo: 'As minhas consultas',
        paciente,
        consultas: pagina.itens,
        paginacao: pagina,
        urlBase: urlSemPagina(req),
        especialidades,
        filtros: {
          estado: textoDaQuery(req.query.estado) ?? '',
          especialidade: textoDaQuery(req.query.especialidade) ?? '',
        },
      });
    }),
  );

  router.get(
    '/consultas/exportar.csv',
    asyncHandler(async (req, res) => {
      const paciente = await pacienteAtual(req, container);
      const consultas = await container.consultas.listar({
        pacienteId: paciente.id,
        estado: textoDaQuery(req.query.estado),
        especialidadeId: textoDaQuery(req.query.especialidade),
        limite: 5000,
      });
      const csv = gerarCsv(
        consultas.map((consulta) => ({
          data: formatarData(consulta.inicio),
          hora: formatarHora(consulta.inicio),
          medico: consulta.medico.utilizador.nome,
          especialidade: consulta.especialidade?.nome ?? 'Consulta geral',
          estado: RotulosEstado[consulta.estado as keyof typeof RotulosEstado],
          motivo: consulta.motivo ?? '',
        })),
        [
          { chave: 'data', rotulo: 'Data' },
          { chave: 'hora', rotulo: 'Hora' },
          { chave: 'medico', rotulo: 'Médico' },
          { chave: 'especialidade', rotulo: 'Especialidade' },
          { chave: 'estado', rotulo: 'Estado' },
          { chave: 'motivo', rotulo: 'Motivo' },
        ],
      );
      enviarCsv(res, `minhas-consultas-${formatarDataInput(new Date())}.csv`, csv);
    }),
  );

  router.get(
    '/consultas/exportar.pdf',
    asyncHandler(async (req, res) => {
      const paciente = await pacienteAtual(req, container);
      const consultas = await container.consultas.listar({
        pacienteId: paciente.id,
        estado: textoDaQuery(req.query.estado),
        especialidadeId: textoDaQuery(req.query.especialidade),
        limite: 5000,
      });
      const pdf = await gerarPdf({
        titulo: 'As minhas consultas',
        subtitulo: `${paciente.utilizador.nome} · ${consultas.length} registo(s)`,
        resumo: [
          { rotulo: 'Realizadas', valor: String(consultas.filter((c) => c.estado === 'REALIZADA').length) },
          { rotulo: 'Confirmadas', valor: String(consultas.filter((c) => c.estado === 'CONFIRMADA').length) },
          { rotulo: 'Pendentes', valor: String(consultas.filter((c) => c.estado === 'PENDENTE').length) },
        ],
        tabelas: [
          {
            titulo: 'Histórico',
            colunas: [
              { rotulo: 'Data', largura: 70 },
              { rotulo: 'Hora', largura: 45 },
              { rotulo: 'Médico', largura: 150 },
              { rotulo: 'Especialidade', largura: 120 },
              { rotulo: 'Estado', largura: 75 },
            ],
            linhas: consultas.map((consulta) => [
              formatarData(consulta.inicio),
              formatarHora(consulta.inicio),
              consulta.medico.utilizador.nome,
              consulta.especialidade?.nome ?? 'Consulta geral',
              RotulosEstado[consulta.estado as keyof typeof RotulosEstado],
            ]),
          },
        ],
      });
      enviarPdf(res, `minhas-consultas-${formatarDataInput(new Date())}.pdf`, pdf);
    }),
  );

  router.get(
    '/consultas/exportar.ics',
    asyncHandler(async (req, res) => {
      const paciente = await pacienteAtual(req, container);
      const consultas = await container.consultas.listar({
        pacienteId: paciente.id,
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
            titulo: `Consulta com ${consulta.medico.utilizador.nome}`,
            descricao: consulta.especialidade?.nome ?? 'Consulta geral',
            localizacao: consulta.medico.localizacao,
          })),
        'As minhas consultas',
      );
      enviarIcs(res, `minhas-consultas-${formatarDataInput(new Date())}.ics`, ics);
    }),
  );

  router.post(
    '/consultas',
    asyncHandler(async (req, res) => {
      const paciente = await pacienteAtual(req, container);
      const corpo = req.body as Record<string, string>;

      const consulta = await container.facade.marcar({
        pacienteId: paciente.id,
        medicoId: corpo.medicoId,
        especialidadeId: corpo.especialidadeId || null,
        data: corpo.data,
        hora: corpo.hora,
        motivo: corpo.motivo || null,
        atorId: req.session.utilizador!.id,
        atorPerfil: Perfil.PACIENTE,
      });

      const link = `${env.appUrl}/confirmar/${consulta.confirmacaoToken}`;
      const demonstracao = env.nodeEnv !== 'production' ? ` (demonstração: ${link})` : '';
      req.session.flash = {
        tipo: 'success',
        mensagem: `Marcação registada como pendente. Confirme no e-mail dentro de 2 horas.${demonstracao}`,
      };
      res.redirect('/paciente/consultas');
    }),
  );

  router.post(
    '/consultas/:id/cancelar',
    asyncHandler(async (req, res) => {
      const paciente = await pacienteAtual(req, container);
      const consulta = await container.consultas.obterPorId(req.params.id);
      if (consulta.pacienteId !== paciente.id) throw new ErroNaoAutorizado();

      await new CancelarConsultaCommand(container.consultas, {
        consultaId: consulta.id,
        atorId: req.session.utilizador!.id,
        atorPerfil: Perfil.PACIENTE,
        motivo: req.body.motivo ?? '',
      }).executar();

      req.session.flash = { tipo: 'success', mensagem: 'Consulta cancelada.' };
      res.redirect('/paciente/consultas');
    }),
  );

  router.post(
    '/consultas/:id/reagendar',
    asyncHandler(async (req, res) => {
      const paciente = await pacienteAtual(req, container);
      const consulta = await container.consultas.obterPorId(req.params.id);
      if (consulta.pacienteId !== paciente.id) throw new ErroNaoAutorizado();

      await container.facade.reagendar({
        consultaId: consulta.id,
        medicoId: consulta.medicoId,
        data: req.body.data,
        hora: req.body.hora,
        atorId: req.session.utilizador!.id,
        atorPerfil: Perfil.PACIENTE,
      });

      req.session.flash = { tipo: 'success', mensagem: 'Consulta reagendada com sucesso.' };
      res.redirect('/paciente/consultas');
    }),
  );

  router.post(
    '/consultas/:id/avaliar',
    asyncHandler(async (req, res) => {
      const paciente = await pacienteAtual(req, container);
      const consulta = await container.consultas.obterPorId(req.params.id);
      if (consulta.pacienteId !== paciente.id) throw new ErroNaoAutorizado();

      await container.avaliacoes.avaliar(
        consulta.id,
        paciente.id,
        Number(req.body.estrelas),
        req.body.comentario ?? null,
      );

      req.session.flash = { tipo: 'success', mensagem: 'Obrigado pela sua avaliacao!' };
      res.redirect('/paciente/consultas');
    }),
  );

  router.get(
    '/lista-espera',
    asyncHandler(async (req, res) => {
      const paciente = await pacienteAtual(req, container);
      const [pedidos, medicos, especialidades] = await Promise.all([
        container.listaEspera.listarPorPaciente(paciente.id),
        container.medicos.listar(),
        container.especialidades.listar(),
      ]);
      res.render('paciente/lista-espera', {
        titulo: 'Lista de espera',
        paciente,
        pedidos,
        medicos,
        especialidades,
        medicoPreSelecionado: textoDaQuery(req.query.medicoId) ?? '',
        dataPreferida: textoDaQuery(req.query.data) ?? '',
      });
    }),
  );

  router.post(
    '/lista-espera',
    asyncHandler(async (req, res) => {
      const paciente = await pacienteAtual(req, container);
      const dados = validarEsquema(esquemaListaEspera, req.body);
      await container.listaEspera.inscrever(paciente.id, {
        medicoId: dados.medicoId,
        especialidadeId: dados.especialidadeId || null,
        dataPreferida: dados.dataPreferida || null,
        periodo: dados.periodo || null,
      });
      req.session.flash = {
        tipo: 'success',
        mensagem: 'Pedido registado. A clínica entra em contacto assim que surgir uma vaga.',
      };
      res.redirect('/paciente/lista-espera');
    }),
  );

  router.post(
    '/lista-espera/:id/cancelar',
    asyncHandler(async (req, res) => {
      const paciente = await pacienteAtual(req, container);
      await container.listaEspera.cancelar(req.params.id, paciente.id);
      req.session.flash = { tipo: 'info', mensagem: 'Pedido de lista de espera cancelado.' };
      res.redirect('/paciente/lista-espera');
    }),
  );

  router.get(
    '/documentos',
    asyncHandler(async (req, res) => {
      const paciente = await pacienteAtual(req, container);
      const documentos = await container.documentos.listarPorPaciente(paciente.id);
      res.render('paciente/documentos', {
        titulo: 'Documentos clínicos',
        paciente,
        documentos,
      });
    }),
  );

  router.get(
    '/documentos/:id/ficheiro',
    asyncHandler(async (req, res) => {
      const paciente = await pacienteAtual(req, container);
      const documento = await container.documentos.obter(req.params.id);
      if (documento.pacienteId !== paciente.id) throw new ErroNaoAutorizado();

      const caminho = container.documentos.caminhoAbsoluto(documento);
      if (!caminho || !fs.existsSync(caminho)) {
        throw new ErroNaoAutorizado('O ficheiro deste documento já não está disponível.');
      }
      res.download(caminho, documento.ficheiroNome ?? path.basename(caminho));
    }),
  );

  router.get(
    '/perfil',
    asyncHandler(async (req, res) => {
      const paciente = await pacienteAtual(req, container);
      const estatisticas = await container.pacientes.estatisticas(paciente.id);
      res.render('paciente/perfil', {
        titulo: 'O meu perfil',
        paciente,
        estatisticas,
        hoje: formatarDataInput(new Date()),
      });
    }),
  );

  router.post(
    '/perfil',
    asyncHandler(async (req, res) => {
      const paciente = await pacienteAtual(req, container);
      const corpo = req.body as Record<string, string>;
      await container.pacientes.atualizar(paciente.id, {
        nome: corpo.nome,
        telefone: corpo.telefone,
        endereco: corpo.endereco,
        dataNascimento: corpo.dataNascimento,
        preferenciaNotificacao: corpo.preferenciaNotificacao,
      });
      await container.auth.atualizarPreferencias(req.session.utilizador!.id, {
        nome: corpo.nome,
        telefone: corpo.telefone,
        preferenciaNotificacao: corpo.preferenciaNotificacao,
      });
      req.session.utilizador!.nome = corpo.nome || req.session.utilizador!.nome;
      req.session.flash = { tipo: 'success', mensagem: 'Perfil actualizado.' };
      res.redirect('/paciente/perfil');
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
      res.redirect('/paciente/perfil');
    }),
  );

  return router;
}
