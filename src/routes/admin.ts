import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import type { Container } from '../container';
import { Perfil, RotulosEstado } from '../domain/enums';
import {
  combinarDataHora,
  fimDoDia,
  formatarData,
  formatarDataInput,
  formatarHora,
  inicioDoDia,
} from '../lib/date';
import { enviarCsv, enviarPdf, gerarCsv, gerarPdf } from '../lib/exportacao';
import { paginacaoDaQuery } from '../lib/pagination';
import { eventBus } from '../events/EventBus';
import { asyncHandler } from '../middleware/asyncHandler';
import { exigirPerfil } from '../middleware/auth';
import { validarEsquema, esquemaCriarUtilizador } from '../validation';
import { textoDaQuery, urlSemPagina } from './helpers';

function intervaloDaQuery(query: Record<string, unknown>): { desde: Date; ate: Date } {
  const ate = typeof query.ate === 'string' && query.ate
    ? fimDoDia(combinarDataHora(query.ate, '00:00'))
    : new Date();
  const desde = typeof query.desde === 'string' && query.desde
    ? inicioDoDia(combinarDataHora(query.desde, '00:00'))
    : new Date(ate.getTime() - 30 * 86_400_000);
  return { desde, ate };
}

export function rotasAdmin(container: Container): Router {
  const router = Router();
  router.use(exigirPerfil(Perfil.ADMINISTRADOR));

  router.get(
    '/dashboard',
    asyncHandler(async (_req, res) => {
      const desde = new Date(Date.now() - 30 * 86_400_000);
      const [resumo, hoje, notificacoes, avaliacoes] = await Promise.all([
        container.relatorios.resumo(desde, new Date()),
        container.relatorios.indicadoresHoje(),
        container.notificacoes.listarRecentes(8),
        container.avaliacoes.listarRecentes(5),
      ]);

      res.render('admin/dashboard', {
        titulo: 'Painel do administrador',
        resumo,
        hoje,
        notificacoes,
        avaliacoes,
        eventos: container.relatorioHandler.snapshot(),
      });
    }),
  );

  router.get(
    '/sistema',
    asyncHandler(async (_req, res) => {
      const desde = new Date(Date.now() - 30 * 86_400_000);
      const resumo = await container.relatorios.resumo(desde, new Date());

      res.render('admin/sistema', {
        titulo: 'Sistema em direto',
        resumo,
        eventos: eventBus.historico(25),
        consumidores: eventBus.observadoresDe('*').map((observador) => observador.nome),
      });
    }),
  );

  router.get('/sistema/eventos.json', (_req, res) => {
    res.json({
      geradoEm: new Date().toISOString(),
      eventos: eventBus.historico(25),
    });
  });

  router.get(
    '/especialidades',
    asyncHandler(async (_req, res) => {
      const especialidades = await container.especialidades.listar(true);
      res.render('admin/especialidades', {
        titulo: 'Especialidades',
        especialidades,
      });
    }),
  );

  router.post(
    '/especialidades',
    asyncHandler(async (req, res) => {
      const corpo = req.body as Record<string, string>;
      await container.especialidades.criar({
        nome: corpo.nome,
        descricao: corpo.descricao || null,
        duracaoPadraoMinutos: Number(corpo.duracaoPadraoMinutos || 60),
      });
      req.session.flash = { tipo: 'success', mensagem: 'Especialidade criada.' };
      res.redirect('/admin/especialidades');
    }),
  );

  router.post(
    '/especialidades/:id',
    asyncHandler(async (req, res) => {
      const corpo = req.body as Record<string, string>;
      await container.especialidades.atualizar(req.params.id, {
        nome: corpo.nome,
        descricao: corpo.descricao || null,
        duracaoPadraoMinutos: Number(corpo.duracaoPadraoMinutos || 60),
        ativa: corpo.ativa === 'on' || corpo.ativa === 'true',
      });
      req.session.flash = { tipo: 'success', mensagem: 'Especialidade actualizada.' };
      res.redirect('/admin/especialidades');
    }),
  );

  router.post(
    '/especialidades/:id/desativar',
    asyncHandler(async (req, res) => {
      await container.especialidades.desativar(req.params.id);
      req.session.flash = { tipo: 'success', mensagem: 'Especialidade desactivada.' };
      res.redirect('/admin/especialidades');
    }),
  );

  router.get(
    '/medicos',
    asyncHandler(async (_req, res) => {
      const [medicos, especialidades] = await Promise.all([
        container.medicos.listarTodos(),
        container.especialidades.listar(true),
      ]);
      res.render('admin/medicos', {
        titulo: 'Gestao de medicos',
        medicos,
        especialidades,
      });
    }),
  );

  router.post(
    '/medicos',
    asyncHandler(async (req, res) => {
      const corpo = req.body as Record<string, string>;
      const especialidadeIds = Array.isArray(corpo.especialidadeIds)
        ? corpo.especialidadeIds
        : corpo.especialidadeIds
          ? [corpo.especialidadeIds]
          : [];

      const { utilizador } = await container.auth.registar({
        nome: corpo.nome,
        email: corpo.email,
        password: corpo.password,
        perfil: Perfil.MEDICO,
        telefone: corpo.telefone,
        preferenciaNotificacao: 'EMAIL',
        medico: {
          numeroRegisto: corpo.numeroRegisto,
          telefone: corpo.telefone,
          localizacao: corpo.localizacao,
          bio: corpo.bio || null,
          especialidadeIds,
          duracaoConsultaMinutos: Number(corpo.duracaoConsultaMinutos || 60),
          maxConsultasDia: Number(corpo.maxConsultasDia || 10),
        },
        confirmarAutomaticamente: true,
      });

      req.session.flash = {
        tipo: 'success',
        mensagem: `Medico ${utilizador.nome} criado com a conta ${utilizador.email}.`,
      };
      res.redirect('/admin/medicos');
    }),
  );

  router.post(
    '/medicos/:id',
    asyncHandler(async (req, res) => {
      const corpo = req.body as Record<string, string>;
      const especialidadeIds = Array.isArray(corpo.especialidadeIds)
        ? corpo.especialidadeIds
        : corpo.especialidadeIds
          ? [corpo.especialidadeIds]
          : [];

      await container.medicos.atualizar(req.params.id, {
        numeroRegisto: corpo.numeroRegisto,
        telefone: corpo.telefone,
        localizacao: corpo.localizacao,
        bio: corpo.bio,
        duracaoConsultaMinutos: Number(corpo.duracaoConsultaMinutos || 60),
        maxConsultasDia: Number(corpo.maxConsultasDia || 10),
        ...(especialidadeIds.length ? { especialidadeIds } : {}),
      });
      req.session.flash = { tipo: 'success', mensagem: 'Dados do medico actualizados.' };
      res.redirect('/admin/medicos');
    }),
  );

  router.post(
    '/medicos/:id/desativar',
    asyncHandler(async (req, res) => {
      const total = await container.medicos.desativar(
        req.params.id,
        req.session.utilizador!.id,
      );
      req.session.flash = {
        tipo: 'warning',
        mensagem: `Médico desativado. ${total} consulta(s) futura(s) cancelada(s) e pacientes notificados.`,
      };
      res.redirect('/admin/medicos');
    }),
  );

  router.post(
    '/medicos/:id/reativar',
    asyncHandler(async (req, res) => {
      await container.medicos.reativar(req.params.id);
      req.session.flash = { tipo: 'success', mensagem: 'Medico reactivado.' };
      res.redirect('/admin/medicos');
    }),
  );

  router.get(
    '/utilizadores',
    asyncHandler(async (req, res) => {
      const [pagina, especialidades] = await Promise.all([
        container.auth.listarUtilizadoresPaginado(
          {
            perfil: textoDaQuery(req.query.perfil),
            busca: textoDaQuery(req.query.busca),
          },
          paginacaoDaQuery(req.query, 15),
        ),
        container.especialidades.listar(true),
      ]);
      res.render('admin/utilizadores', {
        titulo: 'Utilizadores',
        utilizadores: pagina.itens,
        paginacao: pagina,
        urlBase: urlSemPagina(req),
        especialidades,
        filtros: {
          perfil: textoDaQuery(req.query.perfil) ?? '',
          busca: textoDaQuery(req.query.busca) ?? '',
        },
      });
    }),
  );

  router.post(
    '/utilizadores',
    asyncHandler(async (req, res) => {
      // O administrador cria contas de qualquer perfil. A secretaria só pode ser
      // criada aqui; as contas começam confirmadas e com palavra-passe inicial
      // gerada automaticamente (a menos que o administrador indique uma).
      const corpo = validarEsquema(esquemaCriarUtilizador, req.body);
      const password = corpo.password || `Medi@${randomBytes(4).toString('hex')}`;

      const { utilizador } = await container.auth.registar({
        nome: corpo.nome,
        email: corpo.email,
        password,
        perfil: corpo.perfil as Perfil,
        telefone: corpo.telefone || null,
        preferenciaNotificacao: corpo.preferenciaNotificacao,
        confirmarAutomaticamente: true,
        aceiteTermos: true,
        paciente:
          corpo.perfil === 'PACIENTE'
            ? {
                dataNascimento: corpo.dataNascimento,
                telefone: corpo.telefone ?? '',
                endereco: corpo.endereco,
              }
            : undefined,
        medico:
          corpo.perfil === 'MEDICO'
            ? {
                numeroRegisto: corpo.numeroRegisto,
                telefone: corpo.telefone ?? '',
                localizacao: corpo.localizacao,
                bio: corpo.bio || null,
                especialidadeIds: corpo.especialidadeId ? [corpo.especialidadeId] : [],
                duracaoConsultaMinutos: corpo.duracaoConsultaMinutos,
                maxConsultasDia: corpo.maxConsultasDia,
              }
            : undefined,
      });

      req.session.flash = {
        tipo: 'success',
        mensagem: `Conta de ${utilizador.nome} criada. Credenciais iniciais: ${utilizador.email} / ${password}`,
      };
      res.redirect('/admin/utilizadores');
    }),
  );

  router.post(
    '/utilizadores/:id/activar',
    asyncHandler(async (req, res) => {
      await container.auth.definirAtivo(req.params.id, true);
      req.session.flash = { tipo: 'success', mensagem: 'Utilizador activado.' };
      res.redirect('/admin/utilizadores');
    }),
  );

  router.post(
    '/utilizadores/:id/desactivar',
    asyncHandler(async (req, res) => {
      await container.auth.definirAtivo(req.params.id, false);
      req.session.flash = { tipo: 'warning', mensagem: 'Utilizador desactivado.' };
      res.redirect('/admin/utilizadores');
    }),
  );

  router.post(
    '/utilizadores/:id/promover',
    asyncHandler(async (req, res) => {
      const { perfil } = req.body;
      const validos = ['PACIENTE', 'MEDICO', 'SECRETARIO', 'ADMINISTRADOR'];
      if (!perfil || !validos.includes(perfil)) {
        req.session.flash = { tipo: 'danger', mensagem: 'Perfil invalido.' };
        res.redirect('/admin/utilizadores');
        return;
      }
      await container.auth.definirPerfil(req.params.id, perfil as Perfil);
      req.session.flash = { tipo: 'success', mensagem: 'Perfil do utilizador actualizado.' };
      res.redirect('/admin/utilizadores');
    }),
  );

  router.get(
    '/relatorios',
    asyncHandler(async (req, res) => {
      const { desde, ate } = intervaloDaQuery(req.query);
      const resumo = await container.relatorios.resumo(desde, ate);
      res.render('admin/relatorios', {
        titulo: 'Relatorios e estatisticas',
        resumo,
        desde: formatarDataInput(desde),
        ate: formatarDataInput(ate),
      });
    }),
  );

  router.get(
    '/relatorios/exportar.pdf',
    asyncHandler(async (req, res) => {
      const { desde, ate } = intervaloDaQuery(req.query);
      const resumo = await container.relatorios.resumo(desde, ate);
      const pdf = await gerarPdf({
        titulo: 'Relatório de atividade',
        subtitulo: `${formatarData(desde)} a ${formatarData(ate)}`,
        resumo: [
          { rotulo: 'Total de consultas', valor: String(resumo.totalConsultas) },
          { rotulo: 'Realizadas', valor: String(resumo.realizadas) },
          { rotulo: 'Confirmadas', valor: String(resumo.confirmadas) },
          { rotulo: 'Canceladas', valor: `${resumo.canceladas} (${resumo.taxaCancelamento}%)` },
          { rotulo: 'Taxa de ocupação', valor: `${resumo.taxaOcupacao}%` },
          { rotulo: 'Médicos ativos', valor: String(resumo.medicosAtivos) },
        ],
        tabelas: [
          {
            titulo: 'Consultas por especialidade',
            colunas: [
              { rotulo: 'Especialidade', largura: 250 },
              { rotulo: 'Total', largura: 100 },
              { rotulo: '%', largura: 100 },
            ],
            linhas: resumo.consultasPorEspecialidade.map((item) => [
              item.especialidade,
              String(item.total),
              resumo.totalConsultas
                ? `${((item.total / resumo.totalConsultas) * 100).toFixed(1)}%`
                : '0%',
            ]),
          },
          {
            titulo: 'Satisfação por médico',
            colunas: [
              { rotulo: 'Médico', largura: 250 },
              { rotulo: 'Média', largura: 100 },
              { rotulo: 'Avaliações', largura: 100 },
            ],
            linhas: resumo.satisfacaoPorMedico.map((item) => [
              item.medico,
              item.media ? item.media.toFixed(1) : 'Sem avaliações',
              String(item.total),
            ]),
          },
          {
            titulo: 'Consultas por mês',
            colunas: [
              { rotulo: 'Mês', largura: 250 },
              { rotulo: 'Total', largura: 100 },
            ],
            linhas: resumo.consultasPorMes.map((item) => [item.mes, String(item.total)]),
          },
        ],
        notas: ['Relatório gerado automaticamente pelo MediAgenda.'],
      });
      enviarPdf(res, `relatorio-${formatarDataInput(desde)}-${formatarDataInput(ate)}.pdf`, pdf);
    }),
  );

  router.get(
    '/relatorios/exportar.csv',
    asyncHandler(async (req, res) => {
      const { desde, ate } = intervaloDaQuery(req.query);
      const consultas = await container.consultas.listar({ desde, ate, limite: 5000 });
      const csv = gerarCsv(
        consultas.map((consulta) => ({
          data: formatarData(consulta.inicio),
          hora: formatarHora(consulta.inicio),
          paciente: consulta.paciente.utilizador.nome,
          medico: consulta.medico.utilizador.nome,
          especialidade: consulta.especialidade?.nome ?? 'Consulta geral',
          estado: RotulosEstado[consulta.estado as keyof typeof RotulosEstado],
        })),
        [
          { chave: 'data', rotulo: 'Data' },
          { chave: 'hora', rotulo: 'Hora' },
          { chave: 'paciente', rotulo: 'Paciente' },
          { chave: 'medico', rotulo: 'Médico' },
          { chave: 'especialidade', rotulo: 'Especialidade' },
          { chave: 'estado', rotulo: 'Estado' },
        ],
      );
      enviarCsv(res, `relatorio-${formatarDataInput(desde)}-${formatarDataInput(ate)}.csv`, csv);
    }),
  );

  router.get(
    '/auditoria',
    asyncHandler(async (req, res) => {
      const desde = textoDaQuery(req.query.desde);
      const pagina = await container.auditoria.listarPaginado(
        {
          acao: textoDaQuery(req.query.acao),
          desde: desde ? inicioDoDia(combinarDataHora(desde, '00:00')) : undefined,
        },
        paginacaoDaQuery(req.query, 20),
      );
      res.render('admin/auditoria', {
        titulo: 'Auditoria',
        registos: pagina.itens,
        paginacao: pagina,
        urlBase: urlSemPagina(req),
        filtros: {
          acao: textoDaQuery(req.query.acao) ?? '',
          desde: desde ?? '',
        },
      });
    }),
  );

  router.get(
    '/notificacoes',
    asyncHandler(async (req, res) => {
      const pagina = await container.notificacoes.listarRecentesPaginado(
        paginacaoDaQuery(req.query, 20),
      );
      res.render('admin/notificacoes', {
        titulo: 'Notificações enviadas',
        notificacoes: pagina.itens,
        paginacao: pagina,
        urlBase: urlSemPagina(req),
      });
    }),
  );

  router.get(
    '/avaliacoes',
    asyncHandler(async (req, res) => {
      const pagina = await container.avaliacoes.listarRecentesPaginado(
        paginacaoDaQuery(req.query, 15),
      );
      res.render('admin/avaliacoes', {
        titulo: 'Avaliações',
        avaliacoes: pagina.itens,
        paginacao: pagina,
        urlBase: urlSemPagina(req),
      });
    }),
  );

  router.get(
    '/configuracoes',
    asyncHandler(async (_req, res) => {
      res.render('admin/configuracoes', {
        titulo: 'Configuracoes do sistema',
        configuracoes: container.config.todos(),
        diasActivos: container.config.obterDiasFuncionamento(),
      });
    }),
  );

  router.post(
    '/configuracoes',
    asyncHandler(async (req, res) => {
      const corpo = req.body as Record<string, string | string[]>;
      const dias = corpo.dias;
      const diasTexto = Array.isArray(dias) ? dias.join(',') : dias ?? '1,2,3,4,5';

      const chaves = [
        'horario_abertura',
        'horario_fecho',
        'antecedencia_minima_horas',
        'limite_cancelamento_horas',
        'max_consultas_paciente_medico',
        'expiracao_confirmacao_horas',
        'nome_clinica',
      ];

      for (const chave of chaves) {
        const valor = corpo[chave];
        if (typeof valor === 'string' && valor.trim()) {
          await container.config.definir(chave, valor.trim());
        }
      }
      await container.config.definir('dias_funcionamento', diasTexto);

      req.session.flash = {
        tipo: 'success',
        mensagem: 'Configuracoes actualizadas. Todos os servicos usam a mesma instancia (Singleton).',
      };
      res.redirect('/admin/configuracoes');
    }),
  );

  return router;
}
