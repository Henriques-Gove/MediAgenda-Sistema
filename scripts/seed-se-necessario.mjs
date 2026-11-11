// Executa o seed apenas quando a base de dados está vazia.
// Chamado pelo comando de arranque no Render, antes de `npm start`.
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const total = await prisma.utilizador.count();
  if (total === 0) {
    console.log('Base de dados vazia — a carregar os dados de demonstração…');
    const resultado = spawnSync('npx', ['tsx', 'prisma/seed.ts'], { stdio: 'inherit', shell: true });
    if (resultado.status !== 0) {
      console.error('O seed falhou (a aplicação continua a arrancar).');
    }
  } else {
    console.log(`Base de dados já tem ${total} utilizadores — seed ignorado.`);
  }
} catch (erro) {
  console.error('Não foi possível verificar a base de dados:', erro.message);
} finally {
  await prisma.$disconnect();
}
