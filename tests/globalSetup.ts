import { execSync } from 'node:child_process';
import path from 'node:path';
import { urlBaseDados } from './urlBaseDados';

/**
 * Cria/recria o schema PostgreSQL usado exclusivamente pelos testes.
 * O schema "test" fica na mesma base configurada em DATABASE_URL.
 */
export default function globalSetup(): void {
  const raiz = path.resolve(__dirname, '..');

  execSync('npx prisma db push --force-reset --skip-generate', {
    cwd: raiz,
    stdio: 'pipe',
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? urlBaseDados('test'),
    },
  });
}
