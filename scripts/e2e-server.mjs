/**
 * Servidor dedicado aos testes E2E.
 *
 * Recria um schema PostgreSQL isolado (por omissao "e2e"), aplica os dados de
 * demonstracao e arranca a aplicacao compilada. Assim os testes nunca tocam
 * no schema de desenvolvimento nem em producao.
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const raiz = process.cwd();

try {
  process.loadEnvFile(path.join(raiz, '.env'));
} catch {
  // .env opcional (em CI usam-se as variaveis do servico).
}

const porta = Number(process.env.E2E_PORT ?? 3102);
const appUrl = `http://127.0.0.1:${porta}`;
const baseDados = new URL(
  process.env.DATABASE_URL ??
    'postgresql://mediagenda:mediagenda@127.0.0.1:5432/mediagenda?schema=public',
);
baseDados.searchParams.set('schema', 'e2e');

const ambiente = {
  ...process.env,
  NODE_ENV: 'development',
  PORT: String(porta),
  APP_URL: appUrl,
  DATABASE_URL: process.env.DATABASE_URL_E2E ?? baseDados.toString(),
  SESSION_SECRET: 'mediagenda-e2e-secret',
  COOKIE_SECURE: 'false',
  LOG_LEVEL: 'warn',
  RATE_LIMIT_DISABLED: '1',
};

const servidorCompilado = path.join(raiz, 'dist', 'server.js');
if (!existsSync(servidorCompilado)) {
  console.error('Compile a aplicacao antes dos testes E2E: npm run build');
  process.exit(1);
}

if (process.env.E2E_SKIP_DB !== '1') {
  console.log('[e2e] A preparar a base de dados de testes...');
  execSync('npx prisma db push --force-reset --skip-generate', {
    cwd: raiz,
    env: ambiente,
    stdio: 'inherit',
  });
  execSync('npx tsx prisma/seed.ts', {
    cwd: raiz,
    env: ambiente,
    stdio: 'inherit',
  });
}

Object.assign(process.env, ambiente);

const require = createRequire(import.meta.url);
require(servidorCompilado);
