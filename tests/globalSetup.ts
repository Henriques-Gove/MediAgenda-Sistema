import { execSync } from 'node:child_process';
import path from 'node:path';

/**
 * Cria/recria a base de dados SQLite usada exclusivamente pelos testes.
 * O caminho e relativo ao schema Prisma (prisma/test.db).
 */
export default function globalSetup(): void {
  const raiz = path.resolve(__dirname, '..');

  execSync('npx prisma db push --force-reset --skip-generate', {
    cwd: raiz,
    stdio: 'pipe',
    env: {
      ...process.env,
      DATABASE_URL: 'file:./test.db',
    },
  });
}
