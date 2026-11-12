/**
 * Prepara o ambiente local do MediAgenda.
 *
 * Passos: gerar o cliente Prisma (se necessário), sincronizar o schema com a
 * base de dados e carregar os dados de demonstração.
 *
 * Notas:
 * - O cliente Prisma só é regenerado quando ainda não existe (ou com --forcar),
 *   porque no Windows o `prisma generate` falha com EPERM enquanto o servidor
 *   de desenvolvimento mantém query_engine-windows.dll.node aberto.
 * - O `prisma db push` é executado com --skip-generate pela mesma razão.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const raiz = process.cwd();
const caminhoPrisma = join(raiz, 'node_modules', 'prisma', 'build', 'index.js');
const caminhoTsx = join(raiz, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const clienteGerado = existsSync(join(raiz, 'node_modules', '.prisma', 'client', 'index.js'));
const forcar = process.argv.includes('--forcar');

if (!existsSync(caminhoPrisma) || !existsSync(caminhoTsx)) {
  console.error('');
  console.error('  Dependencias em falta. Execute primeiro: npm install');
  console.error('');
  process.exit(1);
}

function executar(script, argumentos) {
  return spawnSync(process.execPath, [script, ...argumentos], {
    cwd: raiz,
    encoding: 'utf8',
    env: process.env,
  });
}

function mostrar(resultado) {
  if (resultado.stdout) process.stdout.write(resultado.stdout);
  if (resultado.stderr) process.stderr.write(resultado.stderr);
}

function falhouPorBloqueioDeFicheiro(saida) {
  return /EPERM|EBUSY|operation not permitted|resource busy/i.test(saida);
}

function ajudaFicheiroBloqueado() {
  console.error('');
  console.error('  O cliente Prisma nao pode ser regenerado porque um processo Node');
  console.error('  esta a usar a base de dados (normalmente o servidor de desenvolvimento).');
  console.error('');
  console.error('  Como resolver:');
  console.error('    1. No terminal onde corre "npm run dev", prima Ctrl+C.');
  console.error('    2. Feche tambem as tarefas de depuracao do VS Code (F5).');
  console.error('    3. Volte a executar: npm run setup');
  console.error('');
  console.error('  Nota: se o cliente Prisma ja estiver gerado, pode simplesmente');
  console.error('  correr "npm run dev" - o setup so e necessario na primeira vez.');
  console.error('');
}

console.log('');
console.log('  MediAgenda - preparacao do ambiente local');
console.log('');

if (clienteGerado && !forcar) {
  console.log('  [1/3] Cliente Prisma ja gerado - a saltar (use --forcar para regenerar).');
} else {
  console.log('  [1/3] A gerar o cliente Prisma...');
  const gerar = executar(caminhoPrisma, ['generate']);
  if (gerar.status !== 0) {
    const saida = `${gerar.stdout ?? ''}${gerar.stderr ?? ''}`;
    if (falhouPorBloqueioDeFicheiro(saida)) {
      ajudaFicheiroBloqueado();
    } else {
      mostrar(gerar);
      console.error('  Falha ao gerar o cliente Prisma.');
    }
    process.exit(1);
  }
}

console.log('  [2/3] A sincronizar o schema com a base de dados...');
const sincronizar = executar(caminhoPrisma, ['db', 'push', '--skip-generate']);
mostrar(sincronizar);
if (sincronizar.status !== 0) {
  console.error('  Falha ao sincronizar a base de dados. Verifique DATABASE_URL no ficheiro .env.');
  process.exit(1);
}

console.log('  [3/3] A carregar dados de demonstracao...');
const seed = executar(caminhoTsx, ['prisma/seed.ts']);
mostrar(seed);
if (seed.status !== 0) {
  console.error('  Falha ao carregar os dados de demonstracao.');
  process.exit(1);
}

console.log('');
console.log('  Ambiente pronto. Arranque com: npm run dev');
console.log('  Aplicacao: http://localhost:3101');
console.log('');
