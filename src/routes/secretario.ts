import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import type { Container } from '../container';
import { Perfil, RotulosEstado } from '../domain/enums';
import { ErroValidacao } from '../domain/errors';
import {
  combinarDataHora,
  fimDoDia,
  formatarData,
  formatarDataInput,
  formatarHora,
  inicioDoDia,
} from '../lib/date';
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
import { validarEsquema, esquemaCriarUtilizador } from '../validation';
import {
  CancelarConsultaCommand,
  RealizarConsultaCommand,
} from '../patterns/command/ConsultasCommands';
import {
  dataDaQuery,
  navegacaoAgenda,
  textoDaQuery,
  urlSemPagina,
  vistaDaQuery,
} from './helpers';

export function rotasSecretario(container: Container): Router {
  const router = Router();
  router.use(exigirPerfil(Perfil.SECRETARIO));

  router.get(
    '/dashboard',
    asyncHandler(async (_req, res) => {
      const hoje = new Date();
      const [consultasHoje, recentes, pacientes, medicos, especialidades] = await Promise.all([
        container.consultas.listar({
          desde: inicioDoDia(hoje),
          ate: fimDoDia(hoje),
          limite: 100,
        }),
        container.consultas.listar({ limite: 15 }),
        container.pacientes.listar(),
        container.medicos.listar(),
        container.especialidades.listar(),
      ]);

      res.render('secretario/dashboard', {
        titulo: 'Painel da secretaria',
        consultasHoje: consultasHoje.sort((a, b) => a.inicio.getTime() - b.inicio.getTime()),
        recentes,
        pacientes,
        medicos,
        especialidades,
        hoje: formatarDataInput(hoje),
      });
    }),
  );

  router.get(
    '/pacientes',
    asyncHandler(async (req, res) => {
      const pagina = await container.pacientes.listarPaginado(
        textoDaQuery(req.query.busca),
        paginacaoDaQuery(req.query, 15),
      );
      res.render('secretario/pacientes', {
        titulo: 'Pacientes',
        pacientes: pagina.itens,
        paginacao: pagina,
        urlBase: urlSemPagina(req),
        busca: textoDaQuery(req.query.busca) ?? '',
      });
    }),
  );

  router.post(
    '/pacientes',
    asyncHandler(async (req, res) => {
      const corpo = req.body as Record<string, string>;
      const password = `Medi@${randomBytes(4).toString('hex')}`;

      const { utilizador } = await container.auth.registar({
        nome: corpo.nome,
        email: corpo.email,
        password,
        perfil: Perfil.PACIENTE,
        telefone: corpo.telefone,
        preferenciaNotificacao: corpo.preferenciaNotificacao || 'EMAIL',
        paciente: {
          dataNascimento: corpo.dataNascimento,
          telefone: corpo.telefone,
          endereco: corpo.endereco,
        },
        confirmarAutomaticamente: true,
      });

      req.session.flash = {
        tipo: 'success',
        mensagem: `Paciente ${utilizador.nome} criado. Credenciais iniciais: ${utilizador.email} / ${password}`,
      };
      res.redirect('/secretario/pacientes');
    }),
  );

  router.post(
    '/pacientes/:id',
    asyncHandler(async (req, res) => {
      const corpo = req.body as Record<string, string>;
      await container.pacientes.atualizar(req.params.id, {
        nome: corpo.nome,
        telefone: corpo.telefone,
        endereco: corpo.endereco,
        dataNascimento: corpo.dataNascimento,
        preferenciaNotificacao: corpo.preferenciaNotificacao,
      });
      req.session.flash = { tipo: 'success', mensagem: 'Dados do paciente actualizados.' };
      res.redirect('/secretario/pacientes');
    }),
  );

  router.get(
    '/medicos',
    asyncHandler(async (_req, res) => {
      const [medicos, especialidades] = await Promise.all([
        container.medicos.listar(),
        container.especialidades.listar(true),
      ]);
      res.render('secretario/medicos', {
        titulo: 'Médicos',
        medicos,
        especialidades,
      });
    }),
  );

  router.post(
    '/medicos',
    asyncHandler(async (req, res) => {
      // Contas de médicos são criadas pela secretaria com credenciais iniciais
      // geradas automaticamente, que o médico deve trocar no primeiro acesso.
      const corpo = validarEsquema(esquemaCriarUtilizador, req.body);
      const password = corpo.password || `Medi@${randomBytes(4).toString('hex')}`;

      const { utilizador } = await container.auth.registar({
        nome: corpo.nome,
        email: corpo.email,
        password,
        perfil: Perfil.MEDICO,
        telefone: corpo.telefone || null,
        preferenciaNotificacao: corpo.preferenciaNotificacao,
        confirmarAutomaticamente: true,
        medico: {
          numeroRegisto: corpo.numeroRegisto,
          telefone: corpo.telefone ?? '',
          localizacao: corpo.localizacao,
          bio: corpo.bio || null,
          especialidadeIds: corpo.especialidadeId ? [corpo.especialidadeId] : [],
          duracaoConsultaMinutos: corpo.duracaoConsultaMinutos,
          maxConsultasDia: corpo.maxConsultasDia,
        },
      });

      req.session.flash = {
        tipo: 'success',
        mensagem: `Médico ${utilizador.nome} criado. Credenciais iniciais: ${utilizador.email} / ${password}`,
      };
      res.redirect('/secretario/medicos');
    }),
  );

  router.get(
    '/agendas',
    asyncHandler(async (req, res) => {
      const medicos = await container.medicos.listar();
      const pacientes = await container.pacientes.listar();
      const especialidades = await container.especialidades.listar();
      const medicoId = textoDaQuery(req.query.medicoId) ?? medicos[0]?.id;
      const data = dataDaQuery(req.query.data);
      const vista = vistaDaQuery(req.query.vista);

      const medico = medicoId ? await container.medicos.obterPorId(medicoId) : null;
      const dados: Record<string, unknown> = {
        titulo: 'Agendas dos médicos',
        medicos,
        pacientes,
        especialidades,
        medico,
        medicoId: medicoId ?? '',
        vista,
        navegacao: navegacaoAgenda(data, vista),
        dataSelecionada: formatarDataInput(data),
      };

      if (medico && vista === 'semana') {
        dados.dias = await container.agenda.agendaSemanal(medico.id, data);
      } else if (medico && vista === 'mes') {
        dados.mes = await container.agenda.agendaMensal(medico.id, data);
      } else {
        const [slots, consultas] = medico
          ? await Promise.all([
              container.agenda.gerarSlots(medico.id, data),
              container.agenda.agendaDoDia(medico.id, data),
            ])
          : [[], []];
        dados.slots = slots;
        dados.consultas = consultas;
      }

      res.render('secretario/agendas', dados);
    }),
  );

  router.get(
    '/lista-espera',
    asyncHandler(async (req, res) => {
      const [pedidos, medicos] = await Promise.all([
        container.listaEspera.listarAtivas(textoDaQuery(req.query.medicoId)),
        container.medicos.listar(),
      ]);
      res.render('secretario/lista-espera', {
        titulo: 'Lista de espera',
        pedidos,
        medicos,
        filtroMedicoId: textoDaQuery(req.query.medicoId) ?? '',
      });
    }),
  );

  router.post(
    '/lista-espera/:id/cancelar',
    asyncHandler(async (req, res) => {
      await container.listaEspera.cancelar(req.params.id);
      req.session.flash = { tipo: 'info', mensagem: 'Pedido removido da lista de espera.' };
      res.redirect('/secretario/lista-espera');
    }),
  );

  router.get(
    '/consultas/exportar.csv',
    asyncHandler(async (req, res) => {
      const consultas = await container.consultas.listar({
        estado: textoDaQuery(req.query.estado),
        medicoId: textoDaQuery(req.query.medicoId),
        limite: 5000,
      });
      const csv = gerarCsv(
        consultas.map((consulta) => ({
          data: formatarData(consulta.inicio),
          hora: formatarHora(consulta.inicio),
          paciente: consulta.paciente.utilizador.nome,
          medico: consulta.medico.utilizador.nome,
          especialidade: consulta.especialidade?.nome ?? 'Consulta geral',
          estado: RotulosEstado[consulta.estado as keyof typeof RotulosEstado],
          motivo: consulta.motivo ?? '',
        })),
        [
          { chave: 'data', rotulo: 'Data' },
          { chave: 'hora', rotulo: 'Hora' },
          { chave: 'paciente', rotulo: 'Paciente' },
          { chave: 'medico', rotulo: 'Médico' },
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
      const consultas = await container.consultas.listar({
        estado: textoDaQuery(req.query.estado),
        medicoId: textoDaQuery(req.query.medicoId),
        limite: 5000,
      });
      const pdf = await gerarPdf({
        titulo: 'Todas as consultas',
        subtitulo: `${consultas.length} registo(s)`,
        resumo: [
          { rotulo: 'Confirmadas', valor: String(consultas.filter((c) => c.estado === 'CONFIRMADA').length) },
          { rotulo: 'Pendentes', valor: String(consultas.filter((c) => c.estado === 'PENDENTE').length) },
          { rotulo: 'Realizadas', valor: String(consultas.filter((c) => c.estado === 'REALIZADA').length) },
        ],
        tabelas: [
          {
            titulo: 'Consultas',
            colunas: [
              { rotulo: 'Data', largura: 65 },
              { rotulo: 'Hora', largura: 40 },
              { rotulo: 'Paciente', largura: 120 },
              { rotulo: 'Médico', largura: 120 },
              { rotulo: 'Estado', largura: 70 },
            ],
            linhas: consultas.map((consulta) => [
              formatarData(consulta.inicio),
              formatarHora(consulta.inicio),
              consulta.paciente.utilizador.nome,
              consulta.medico.utilizador.nome,
              RotulosEstado[consulta.estado as keyof typeof RotulosEstado],
            ]),
          },
        ],
      });
      enviarPdf(res, `consultas-${formatarDataInput(new Date())}.pdf`, pdf);
    }),
  );

  router.get(
    '/consultas/exportar.ics',
    asyncHandler(async (req, res) => {
      const consultas = await container.consultas.listar({
        medicoId: textoDaQuery(req.query.medicoId),
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
            descricao: `${consulta.medico.utilizador.nome} · ${consulta.especialidade?.nome ?? 'Consulta geral'}`,
            localizacao: consulta.medico.localizacao,
          })),
        'Consultas da clínica',
      );
      enviarIcs(res, `consultas-${formatarDataInput(new Date())}.ics`, ics);
    }),
  );

  router.post(
    '/marcar',
    asyncHandler(async (req, res) => {
      const corpo = req.body as Record<string, string>;
      if (!corpo.pacienteId) throw new ErroValidacao('Selecione o paciente.');

      const consulta = await container.facade.marcar({
        pacienteId: corpo.pacienteId,
        medicoId: corpo.medicoId,
        especialidadeId: corpo.especialidadeId || null,
        data: corpo.data,
        hora: corpo.hora,
        motivo: corpo.motivo || null,
        atorId: req.session.utilizador!.id,
        atorPerfil: Perfil.SECRETARIO,
      });

      req.session.flash = {
        tipo: 'success',
        mensagem: `Consulta marcada para ${consulta.paciente.utilizador.nome} (estado pendente ate confirmacao).`,
      };
      res.redirect(
        `/secretario/agendas?medicoId=${consulta.medicoId}&data=${corpo.data}`,
      );
    }),
  );

  router.get(
    '/consultas',
    asyncHandler(async (req, res) => {
      const [pagina, medicos] = await Promise.all([
        container.consultas.listarPaginado(
          {
            estado: textoDaQuery(req.query.estado),
            medicoId: textoDaQuery(req.query.medicoId),
          },
          paginacaoDaQuery(req.query, 20),
        ),
        container.medicos.listar(),
      ]);

      res.render('secretario/consultas', {
        titulo: 'Todas as consultas',
        consultas: pagina.itens,
        paginacao: pagina,
        urlBase: urlSemPagina(req),
        medicos,
        filtros: {
          estado: textoDaQuery(req.query.estado) ?? '',
          medicoId: textoDaQuery(req.query.medicoId) ?? '',
        },
      });
    }),
  );

  router.post(
    '/consultas/:id/cancelar',
    asyncHandler(async (req, res) => {
      await new CancelarConsultaCommand(container.consultas, {
        consultaId: req.params.id,
        atorId: req.session.utilizador!.id,
        atorPerfil: Perfil.SECRETARIO,
        motivo: req.body.motivo ?? '',
      }).executar();
      req.session.flash = { tipo: 'success', mensagem: 'Consulta cancelada.' };
      res.redirect(req.get('referer') ?? '/secretario/consultas');
    }),
  );

  router.post(
    '/consultas/:id/reagendar',
    asyncHandler(async (req, res) => {
      const consulta = await container.consultas.obterPorId(req.params.id);
      await container.facade.reagendar({
        consultaId: consulta.id,
        medicoId: consulta.medicoId,
        data: req.body.data,
        hora: req.body.hora,
        atorId: req.session.utilizador!.id,
        atorPerfil: Perfil.SECRETARIO,
      });
      req.session.flash = { tipo: 'success', mensagem: 'Consulta reagendada.' };
      res.redirect(req.get('referer') ?? '/secretario/consultas');
    }),
  );

  router.post(
    '/consultas/:id/realizar',
    asyncHandler(async (req, res) => {
      await new RealizarConsultaCommand(container.consultas, {
        consultaId: req.params.id,
        atorId: req.session.utilizador!.id,
        atorPerfil: Perfil.SECRETARIO,
      }).executar();
      req.session.flash = { tipo: 'success', mensagem: 'Consulta marcada como realizada.' };
      res.redirect(req.get('referer') ?? '/secretario/consultas');
    }),
  );

  router.post(
    '/consultas/:id/bloquear',
    asyncHandler(async (req, res) => {
      const consulta = await container.consultas.obterPorId(req.params.id);
      await container.agenda.bloquearPeriodo(
        consulta.medicoId,
        combinarDataHora(req.body.inicio.slice(0, 10), req.body.inicio.slice(11, 16)),
        combinarDataHora(req.body.fim.slice(0, 10), req.body.fim.slice(11, 16)),
        req.body.motivo ?? 'Bloqueio definido pela secretaria',
      );
      req.session.flash = { tipo: 'success', mensagem: 'Bloqueio registado.' };
      res.redirect(req.get('referer') ?? '/secretario/agendas');
    }),
  );

  return router;
}
