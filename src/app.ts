import path from 'node:path';
import express, { type Express } from 'express';
import session from 'express-session';
import methodOverride from 'method-override';
import expressLayouts from 'express-ejs-layouts';
import { env } from './config/env';
import { criarContainer, registarObservadores, type Container } from './container';
import { CoresEstado, DiasSemana, Perfil, RotulosEstado } from './domain/enums';
import { idiomasDisponiveis, normalizarIdioma, traduzir } from './i18n';
import {
  adicionarDias,
  formatarData,
  formatarDataHora,
  formatarDataInput,
  formatarDiaCurto,
  formatarDiaSemana,
  formatarHora,
  formatarHoraInput,
  formatarMes,
  idade,
  mesmoDia,
  mesmoMes,
} from './lib/date';
import { prisma } from './lib/prisma';
import { PrismaSessionStore } from './lib/PrismaSessionStore';
import { carregarUtilizador, exigirPasswordEmDia } from './middleware/auth';
import { csrf } from './middleware/csrf';
import { tratarErros } from './middleware/errorHandler';
import { flash } from './middleware/flash';
import { registarPedidos } from './middleware/requestLogger';
import { segurancaHttp } from './middleware/security';
import { rotasAdmin } from './routes/admin';
import { rotasApi } from './routes/api';
import { rotasConta } from './routes/conta';
import { rotasMedico } from './routes/medico';
import { rotasPaciente } from './routes/paciente';
import { rotasPublicas } from './routes/publico';
import { rotasSecretario } from './routes/secretario';

export interface Aplicacao {
  app: Express;
  container: Container;
}

export async function criarAplicacao(): Promise<Aplicacao> {
  const container = criarContainer();
  await container.config.carregar();
  registarObservadores(container);

  const app = express();
  app.disable('x-powered-by');
  if (env.nodeEnv === 'production') app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use(expressLayouts);
  app.set('layout', 'layout');

  app.use(segurancaHttp());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(methodOverride('_method'));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Verificação de saúde para orquestradores, balanceadores e monitorização.
  // Inclui o commit publicado para ser possível confirmar que o deploy está atualizado.
  const commitPublicado = (process.env.RENDER_GIT_COMMIT ?? process.env.GIT_COMMIT ?? 'local').slice(0, 7);
  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({
        estado: 'ok',
        servico: 'mediagenda',
        versao: process.env.APP_VERSION ?? '1.0.0',
        commit: commitPublicado,
        ambiente: env.nodeEnv,
        uptimeSegundos: Math.round(process.uptime()),
        baseDados: 'ok',
      });
    } catch {
      res.status(503).json({
        estado: 'indisponivel',
        servico: 'mediagenda',
        baseDados: 'erro',
      });
    }
  });

  const sessionStore = env.isTest ? undefined : new PrismaSessionStore();
  app.use(
    session({
      name: 'mediagenda.sid',
      secret: env.sessionSecret,
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.cookieSecure,
        maxAge: 8 * 60 * 60 * 1000,
      },
    }),
  );

  app.use(registarPedidos);
  app.use(csrf);
  app.use(flash);
  app.use(carregarUtilizador);
  app.use(exigirPasswordEmDia);

  app.use((req, res, next) => {
    const idioma = normalizarIdioma(env.locale);
    Object.assign(res.locals, {
      idioma,
      idiomasDisponiveis,
      t: (chave: string, parametros?: Record<string, string | number>) =>
        traduzir(chave, idioma, parametros),
      formatarData,
      formatarDataHora,
      formatarDataInput,
      formatarDiaCurto,
      formatarDiaSemana,
      formatarHora,
      formatarHoraInput,
      formatarMes,
      idade,
      mesmoDia,
      mesmoMes,
      adicionarDias,
      rotulosEstado: RotulosEstado,
      coresEstado: CoresEstado,
      diasSemana: DiasSemana,
      Perfil,
      ano: new Date().getFullYear(),
      caminho: req.path,
      query: req.query,
      configNome: container.config.obter('nome_clinica'),
    });
    next();
  });

  app.use('/', rotasPublicas(container));
  app.use('/conta', rotasConta(container));
  app.use('/paciente', rotasPaciente(container));
  app.use('/medico', rotasMedico(container));
  app.use('/secretario', rotasSecretario(container));
  app.use('/admin', rotasAdmin(container));
  app.use('/api', rotasApi(container));

  app.use((_req, res) => {
    res.status(404).render('errors/404', { titulo: 'Pagina nao encontrada' });
  });

  app.use(tratarErros);

  return { app, container };
}
