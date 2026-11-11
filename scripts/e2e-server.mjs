/**
 * Servidor dedicado aos testes E2E.
 *
 * Recria uma base SQLite isolada (prisma/e2e.db), aplica os dados de
 * demonstração e arranca a aplicação compilada. Assim os testes nunca tocam
 * na base de desenvolvimento.
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const raiz = process.cwd();
const porta = Number(process.env.E2E_PORT ?? 3102);
const appUrl = `http://127.0.0.1:${porta}`;
const ambiente = {
  ...process.env,
  NODE_ENV: 'development',
  PORT: String(porta),
  APP_URL: appUrl,
  DATABASE_URL: 'file:./e2e.db',
  SESSION_SECRET: 'mediagenda-e2e-secret',
  COOKIE_SECURE: 'false',
  LOG_LEVEL: 'warn',
};

const servidorCompilado = path.join(raiz, 'dist', 'server.js');
if (!existsSync(servidorCompilado)) {
  console.error('Compile a aplicação antes dos testes E2E: npm run build');
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
