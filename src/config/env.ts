import path from 'node:path';

try {
  process.loadEnvFile(path.resolve(process.cwd(), '.env'));
} catch {
  // .env e opcional quando as variaveis ja estao definidas no ambiente.
}

function numero(valor: string | undefined, padrao: number): number {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : padrao;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: numero(process.env.PORT, 3000),
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',
  sessionSecret: process.env.SESSION_SECRET ?? 'mediagenda-dev-secret',
  locale: process.env.LOCALE ?? 'pt-PT',
  logLevel: (process.env.LOG_LEVEL ?? 'info').toLowerCase(),
  cookieSecure:
    process.env.COOKIE_SECURE === 'true' ||
    (process.env.COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production'),
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: numero(process.env.SMTP_PORT, 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? 'MediAgenda <no-reply@mediagenda.co.mz>',
  },
  sms: {
    url: process.env.SMS_API_URL ?? '',
    apiKey: process.env.SMS_API_KEY ?? '',
    from: process.env.SMS_FROM ?? 'MediAgenda',
  },
  isTest: process.env.NODE_ENV === 'test',
  limitePedidosDesativado: process.env.RATE_LIMIT_DISABLED === '1',
};

export type Env = typeof env;
