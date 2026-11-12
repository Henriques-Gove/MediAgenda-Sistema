import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { env } from '../config/env';
import type { Container } from '../container';
import { Perfil } from '../domain/enums';
import { combinarDataHora, formatarDataInput } from '../lib/date';
import { asyncHandler } from '../middleware/asyncHandler';
import { limiteLogin, limiteRecuperacao, limiteRegisto } from '../middleware/security';
import { ConfirmarConsultaCommand } from '../patterns/command/ConsultasCommands';
import {
  esquemaLogin,
  esquemaRecuperacao,
  esquemaRegistoPaciente,
  esquemaReporPassword,
  esquema2FA,
  validarEsquema,
} from '../validation';
import { dataDaQuery, destinoPorPerfil, nextSeguro, numeroDaQuery, textoDaQuery } from './helpers';

interface UtilizadorSessao {
  id: string;
  nome: string;
  email: string;
  perfil: string;
  passwordChangedAt?: string;
  twoFactorEnabled?: boolean;
}

function regenerarSessao(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((erro) => (erro ? reject(erro) : resolve()));
  });
}

/**
 * Grava a sessão antes de responder com um redirecionamento.
 *
 * O express-session grava a sessão no fim da resposta, mas os navegadores
 * seguem o redirecionamento assim que recebem os cabeçalhos. Sem esta espera,
 * o pedido seguinte (ex.: o painel) pode chegar antes de a sessão estar na
 * base de dados e o utilizador era reenviado para o login.
 */
function guardarSessao(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((erro) => (erro ? reject(erro) : resolve()));
  });
}

async function iniciarSessao(
  req: Request,
  res: Response,
  utilizador: UtilizadorSessao,
  destino: string,
): Promise<void> {
  await regenerarSessao(req);
  req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  req.session.utilizador = {
    id: utilizador.id,
    nome: utilizador.nome,
    email: utilizador.email,
    perfil: utilizador.perfil,
    passwordChangedAt: utilizador.passwordChangedAt ?? new Date().toISOString(),
    twoFactorEnabled: utilizador.twoFactorEnabled ?? false,
  };
  req.session.flash = {
    tipo: 'success',
    mensagem: `Bem-vindo de volta, ${utilizador.nome.split(' ')[0]}!`,
  };
  await guardarSessao(req);
  res.redirect(destino);
}

export function rotasPublicas(container: Container): Router {
  const router = Router();

  router.get('/', (req, res) => {
    // A entrada no sistema passa sempre pelo login; quem já tem sessão vai
    // diretamente para o painel do seu perfil.
    if (req.session.utilizador) {
      res.redirect(destinoPorPerfil(req.session.utilizador.perfil));
      return;
    }
    res.redirect('/login');
  });

  router.get(
    '/inicio',
    asyncHandler(async (_req, res) => {
      const [especialidades, medicos] = await Promise.all([
        container.especialidades.listar(),
        container.medicos.listar(),
      ]);
      res.render('home', {
        titulo: 'Inicio',
        especialidades,
        medicos: medicos.slice(0, 3),
        totalMedicos: medicos.length,
      });
    }),
  );

  router.get('/offline', (_req, res) => {
    res.render('offline', { titulo: 'Sem ligação' });
  });

  router.get(
    '/pesquisa',
    asyncHandler(async (req, res) => {
      const utilizador = req.session.utilizador;
      const q = (textoDaQuery(req.query.q) ?? '').trim();

      if (!utilizador) {
        return res.redirect(q ? `/medicos?busca=${encodeURIComponent(q)}` : '/medicos');
      }

      const termo = q.toLocaleLowerCase('pt-PT');
      const atalhos = [
        { titulo: 'Painel', descricao: 'Resumo da sua atividade', href: destinoPorPerfil(utilizador.perfil), icone: 'bi-grid-1x2' },
        ...(utilizador.perfil === Perfil.PACIENTE
          ? [
              { titulo: 'As minhas consultas', descricao: 'Histórico e próximas marcações', href: '/paciente/consultas', icone: 'bi-calendar2-check' },
              { titulo: 'Marcar consulta', descricao: 'Encontrar médico e horário', href: '/medicos', icone: 'bi-calendar2-plus' },
              { titulo: 'Lista de espera', descricao: 'Ser avisado quando surgir vaga', href: '/paciente/lista-espera', icone: 'bi-hourglass-split' },
              { titulo: 'Documentos', descricao: 'Ficheiros clínicos partilhados', href: '/paciente/documentos', icone: 'bi-folder2-open' },
              { titulo: 'Perfil', descricao: 'Dados pessoais e contactos', href: '/paciente/perfil', icone: 'bi-person-gear' },
            ]
          : []),
        ...(utilizador.perfil === Perfil.MEDICO
          ? [
              { titulo: 'Agenda', descricao: 'Consultas do dia, semana e mês', href: '/medico/agenda', icone: 'bi-calendar3' },
              { titulo: 'Consultas', descricao: 'Histórico e estados', href: '/medico/consultas', icone: 'bi-calendar2-check' },
              { titulo: 'Disponibilidade', descricao: 'Horários de atendimento', href: '/medico/disponibilidade', icone: 'bi-clock' },
              { titulo: 'Bloqueios', descricao: 'Férias e ausências', href: '/medico/bloqueios', icone: 'bi-calendar-x' },
              { titulo: 'Documentos', descricao: 'Documentos clínicos', href: '/medico/documentos', icone: 'bi-folder2-open' },
            ]
          : []),
        ...(utilizador.perfil === Perfil.SECRETARIO
          ? [
              { titulo: 'Agendas', descricao: 'Agenda de todos os médicos', href: '/secretario/agendas', icone: 'bi-calendar2-week' },
              { titulo: 'Pacientes', descricao: 'Registar e consultar pacientes', href: '/secretario/pacientes', icone: 'bi-people' },
              { titulo: 'Médicos', descricao: 'Equipa clínica', href: '/secretario/medicos', icone: 'bi-person-badge' },
              { titulo: 'Consultas', descricao: 'Marcações e estados', href: '/secretario/consultas', icone: 'bi-calendar2-check' },
              { titulo: 'Lista de espera', descricao: 'Pedidos e sugestões', href: '/secretario/lista-espera', icone: 'bi-hourglass-split' },
            ]
          : []),
        ...(utilizador.perfil === Perfil.ADMINISTRADOR
          ? [
              { titulo: 'Utilizadores', descricao: 'Contas e perfis', href: '/admin/utilizadores', icone: 'bi-people' },
              { titulo: 'Médicos', descricao: 'Equipa clínica', href: '/admin/medicos', icone: 'bi-person-badge' },
              { titulo: 'Especialidades', descricao: 'Catálogo da clínica', href: '/admin/especialidades', icone: 'bi-tags' },
              { titulo: 'Relatórios', descricao: 'Ocupação e cancelamentos', href: '/admin/relatorios', icone: 'bi-bar-chart' },
              { titulo: 'Sistema em direto', descricao: 'Eventos e regras', href: '/admin/sistema', icone: 'bi-activity' },
              { titulo: 'Registos', descricao: 'Histórico de operações', href: '/admin/auditoria', icone: 'bi-journal-text' },
            ]
          : []),
        { titulo: 'Segurança', descricao: 'Palavra-passe e sessões', href: '/conta/seguranca', icone: 'bi-shield-lock' },
      ];

      const atalhosFiltrados = termo
        ? atalhos.filter((atalho) =>
            `${atalho.titulo} ${atalho.descricao}`.toLocaleLowerCase('pt-PT').includes(termo),
          )
        : atalhos;

      let medicos: Awaited<ReturnType<typeof container.medicos.listar>> = [];
      let especialidades: Awaited<ReturnType<typeof container.especialidades.listar>> = [];
      let pacientes: Awaited<ReturnType<typeof container.pacientes.listar>> = [];

      if (termo) {
        const [todosMedicos, todasEspecialidades] = await Promise.all([
          container.medicos.listar({ busca: q }),
          container.especialidades.listar(),
        ]);

        medicos = todosMedicos.slice(0, 6);
        especialidades = todasEspecialidades
          .filter((especialidade) =>
            `${especialidade.nome} ${especialidade.descricao ?? ''}`
              .toLocaleLowerCase('pt-PT')
              .includes(termo),
          )
          .slice(0, 6);

        if (utilizador.perfil === Perfil.ADMINISTRADOR || utilizador.perfil === Perfil.SECRETARIO) {
          pacientes = (await container.pacientes.listar(q)).slice(0, 6);
        }
      }

      const totalResultados =
        atalhosFiltrados.length + medicos.length + especialidades.length + pacientes.length;

      res.render('pesquisa', {
        titulo: 'Pesquisar',
        termo: q,
        atalhos: atalhosFiltrados.slice(0, 8),
        medicos,
        especialidades,
        pacientes,
        totalResultados,
        perfil: utilizador.perfil,
      });
    }),
  );

  router.get(
    '/medicos',
    asyncHandler(async (req, res) => {
      const [especialidades, medicos] = await Promise.all([
        container.especialidades.listar(),
        container.medicos.listar({
          busca: textoDaQuery(req.query.busca),
          especialidadeId: textoDaQuery(req.query.especialidade),
          localizacao: textoDaQuery(req.query.localizacao),
          avaliacaoMinima: numeroDaQuery(req.query.avaliacao),
        }),
      ]);
      res.render('medicos/lista', {
        titulo: 'Pesquisar medicos',
        especialidades,
        medicos,
        filtros: {
          busca: textoDaQuery(req.query.busca) ?? '',
          especialidade: textoDaQuery(req.query.especialidade) ?? '',
          localizacao: textoDaQuery(req.query.localizacao) ?? '',
          avaliacao: textoDaQuery(req.query.avaliacao) ?? '',
        },
      });
    }),
  );

  router.get(
    '/medicos/:id',
    asyncHandler(async (req, res) => {
      const medico = await container.medicos.obterPorId(req.params.id);
      const data = dataDaQuery(req.query.data);
      const [slots, avaliacoes, media, proximasVagas] = await Promise.all([
        container.agenda.gerarSlots(medico.id, data),
        container.avaliacoes.listarPorMedico(medico.id, 8),
        container.avaliacoes.media(medico.id),
        container.agenda.proximasVagas(medico.id, 6),
      ]);

      res.render('medicos/detalhe', {
        titulo: medico.utilizador.nome,
        medico,
        slots,
        dataSelecionada: formatarDataInput(data),
        avaliacoes,
        media,
        proximasVagas,
      });
    }),
  );

  router.get('/login', (req, res) => {
    if (req.session.utilizador) {
      res.redirect(destinoPorPerfil(req.session.utilizador.perfil));
      return;
    }
    if (req.session.pending2fa) {
      res.redirect('/login/2fa');
      return;
    }
    res.render('auth/login', { titulo: 'Entrar', next: nextSeguro(req.query.next, '') });
  });

  router.post(
    '/login',
    limiteLogin,
    asyncHandler(async (req, res) => {
      const { email, password, next } = validarEsquema(esquemaLogin, req.body);
      try {
        const utilizador = await container.auth.autenticar(email, password, req.ip);
        const destino = nextSeguro(next, destinoPorPerfil(utilizador.perfil));

        if (utilizador.twoFactorEnabled) {
          await regenerarSessao(req);
          req.session.pending2fa = {
            id: utilizador.id,
            nome: utilizador.nome,
            email: utilizador.email,
            perfil: utilizador.perfil,
            passwordChangedAt: utilizador.passwordChangedAt,
            next: destino,
          };
          req.session.flash = {
            tipo: 'info',
            mensagem: 'Introduza o código de seis dígitos da sua aplicação de autenticação.',
          };
          await guardarSessao(req);
          res.redirect('/login/2fa');
          return;
        }

        await iniciarSessao(req, res, utilizador, destino);
      } catch (erro) {
        req.session.flash = {
          tipo: 'danger',
          mensagem: erro instanceof Error ? erro.message : 'Falha ao iniciar sessão.',
        };
        req.session.valores = { email };
        res.redirect('/login');
      }
    }),
  );

  router.get('/login/2fa', (req, res) => {
    if (!req.session.pending2fa) {
      res.redirect('/login');
      return;
    }
    res.render('auth/2fa', { titulo: 'Verificação em dois passos' });
  });

  router.post(
    '/login/2fa',
    limiteLogin,
    asyncHandler(async (req, res) => {
      const pendente = req.session.pending2fa;
      if (!pendente) {
        res.redirect('/login');
        return;
      }
      const { token } = validarEsquema(esquema2FA, req.body);
      const valido = await container.auth.validar2FA(pendente.id, token);
      if (!valido) {
        req.session.flash = {
          tipo: 'danger',
          mensagem: 'Código inválido ou expirado. Tente novamente.',
        };
        res.redirect('/login/2fa');
        return;
      }
      const destino = pendente.next ?? destinoPorPerfil(pendente.perfil);
      await iniciarSessao(req, res, { ...pendente, twoFactorEnabled: true }, destino);
    }),
  );

  router.get(
    '/registo',
    asyncHandler(async (_req, res) => {
      res.render('auth/registo', { titulo: 'Criar conta' });
    }),
  );

  router.post(
    '/registo',
    limiteRegisto,
    asyncHandler(async (req, res) => {
      // O registo público destina-se apenas a pacientes. Contas da equipa
      // (médicos e secretaria) são criadas pela secretaria ou pelo administrador.
      const corpo = validarEsquema(esquemaRegistoPaciente, req.body);

      const { utilizador, tokenConfirmacao } = await container.auth.registar({
        nome: corpo.nome,
        email: corpo.email,
        password: corpo.password,
        perfil: Perfil.PACIENTE,
        telefone: corpo.telefone || null,
        preferenciaNotificacao: corpo.preferenciaNotificacao,
        aceiteTermos: corpo.aceiteTermos,
        confirmarAutomaticamente: !env.exigirConfirmacaoEmail,
        paciente: {
          dataNascimento: corpo.dataNascimento,
          telefone: corpo.telefone,
          endereco: corpo.endereco,
        },
      });

      const link =
        tokenConfirmacao && env.nodeEnv !== 'production'
          ? ` Link de confirmação (demonstração): ${env.appUrl}/confirmar-email/${tokenConfirmacao}`
          : '';
      req.session.flash = {
        tipo: 'success',
        mensagem: tokenConfirmacao
          ? `Conta criada com sucesso. Confirme o e-mail para iniciar sessão.${link}`
          : `Conta criada com sucesso, ${utilizador.nome.split(' ')[0]}. Já pode iniciar sessão.`,
      };
      req.session.utilizador = undefined;
      res.redirect('/login');
    }),
  );

  router.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
  });

  router.get(
    '/confirmar-email/:token',
    asyncHandler(async (req, res) => {
      await container.auth.confirmarEmail(req.params.token);
      req.session.flash = {
        tipo: 'success',
        mensagem: 'E-mail confirmado. Ja pode iniciar sessao.',
      };
      res.redirect('/login');
    }),
  );

  // Link enviado por e-mail para confirmar a marcacao (RN-07).
  router.get(
    '/confirmar/:token',
    asyncHandler(async (req, res) => {
      const consulta = await container.consultas.obterPorToken(req.params.token);
      if (!consulta) {
        req.session.flash = {
          tipo: 'danger',
          mensagem: 'Link de confirmacao invalido ou ja utilizado.',
        };
        res.redirect('/');
        return;
      }

      const comando = new ConfirmarConsultaCommand(container.consultas, {
        consultaId: consulta.id,
        atorId: consulta.paciente.utilizadorId,
        atorPerfil: Perfil.PACIENTE,
      });

      try {
        await comando.executar();
        req.session.flash = {
          tipo: 'success',
          mensagem: 'Consulta confirmada com sucesso. Obrigado!',
        };
      } catch (erro) {
        req.session.flash = {
          tipo: 'danger',
          mensagem: erro instanceof Error ? erro.message : 'Nao foi possivel confirmar.',
        };
      }

      if (req.session.utilizador?.perfil === Perfil.PACIENTE) {
        res.redirect('/paciente/consultas');
      } else {
        res.redirect('/login');
      }
    }),
  );

  router.get('/recuperar', (_req, res) => {
    res.render('auth/recuperar', { titulo: 'Recuperar palavra-passe' });
  });

  router.post(
    '/recuperar',
    limiteRecuperacao,
    asyncHandler(async (req, res) => {
      const { email } = validarEsquema(esquemaRecuperacao, req.body);
      const token = await container.auth.solicitarRecuperacao(email);
      const extra =
        token && env.nodeEnv !== 'production'
          ? ` Link (demonstracao): ${env.appUrl}/repor-password/${token}`
          : '';
      req.session.flash = {
        tipo: 'info',
        mensagem: `Se o e-mail existir, enviaremos instrucoes de recuperacao.${extra}`,
      };
      res.redirect('/login');
    }),
  );

  router.get('/repor-password/:token', (req, res) => {
    res.render('auth/repor', { titulo: 'Nova palavra-passe', token: req.params.token });
  });

  router.post(
    '/repor-password/:token',
    asyncHandler(async (req, res) => {
      const { password } = validarEsquema(esquemaReporPassword, req.body);
      await container.auth.redefinirPassword(req.params.token, password);
      req.session.flash = {
        tipo: 'success',
        mensagem: 'Palavra-passe redefinida. Inicie sessão com as novas credenciais.',
      };
      res.redirect('/login');
    }),
  );

  router.get('/sobre', (_req, res) => {
    res.render('sobre', { titulo: 'Sobre o MediAgenda' });
  });

  router.get('/termos', (_req, res) => {
    res.render('legal/termos', { titulo: 'Termos de utilização' });
  });

  router.get('/privacidade', (_req, res) => {
    res.render('legal/privacidade', { titulo: 'Política de privacidade' });
  });

  router.get('/consentimento', (_req, res) => {
    res.render('legal/consentimento', { titulo: 'Consentimento para dados de saúde' });
  });

  return router;
}
