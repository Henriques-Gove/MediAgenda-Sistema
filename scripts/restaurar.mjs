/**
 * Restauro de uma cópia de segurança.
 *
 *   npm run db:restore -- backups/mediagenda-20261111-120000 --confirmar
 *
 * Pare a aplicação antes de executar. A base atual é guardada em
 * backups/antes-restauro-* e o backup é validado por SHA-256 e
 * PRAGMA integrity_check.
 */
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const argumentos = process.argv.slice(2);
const confirmar = argumentos.includes('--confirmar');
const ignorarHash = argumentos.includes('--ignorar-hash');
const origemArg = argumentos.find((valor) => !valor.startsWith('--'));

if (!origemArg || !confirmar) {
  console.error('Utilização: npm run db:restore -- <pasta-do-backup> --confirmar');
  console.error('Pare a aplicação antes de restaurar.');
  process.exit(1);
}

const raiz = process.cwd();
const origem = path.resolve(raiz, origemArg);
const backupDb = path.join(origem, 'mediagenda.db');

if (!existsSync(backupDb)) {
  console.error(`Não foi encontrado ${backupDb}`);
  process.exit(1);
}

function caminhoBaseDados() {
  const url = process.env.DATABASE_URL ?? 'file:./dev.db';
  if (!url.startsWith('file:')) {
    throw new Error('Este script apenas restaura bases SQLite (DATABASE_URL=file:...).');
  }
  const caminho = url.slice('file:'.length);
  return path.isAbsolute(caminho) ? caminho : path.resolve(raiz, 'prisma', caminho);
}

function hashFicheiro(caminho) {
  return createHash('sha256').update(readFileSync(caminho)).digest('hex');
}

const manifestoPath = path.join(origem, 'manifest.json');
if (existsSync(manifestoPath) && !ignorarHash) {
  const manifesto = JSON.parse(readFileSync(manifestoPath, 'utf8'));
  const hashAtual = hashFicheiro(backupDb);
  if (manifesto.baseDadosSha256 && manifesto.baseDadosSha256 !== hashAtual) {
    console.error('O hash do backup não corresponde ao manifesto. Use --ignorar-hash apenas se souber o que está a fazer.');
    process.exit(1);
  }
}

const destino = caminhoBaseDados();
const pastaSeguranca = path.resolve(
  raiz,
  'backups',
  `antes-restauro-${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '')}`,
);
mkdirSync(pastaSeguranca, { recursive: true });

if (existsSync(destino)) {
  copyFileSync(destino, path.join(pastaSeguranca, 'mediagenda.db'));
  console.log(`Base atual guardada em ${pastaSeguranca}`);
}

mkdirSync(path.dirname(destino), { recursive: true });
copyFileSync(backupDb, destino);

const uploadsOrigem = path.join(origem, 'uploads');
if (existsSync(uploadsOrigem)) {
  cpSync(uploadsOrigem, path.join(raiz, 'public', 'uploads'), { recursive: true, force: true });
}

const prisma = new PrismaClient({
  datasources: { db: { url: `file:${destino}` } },
});
try {
  const resultado = await prisma.$queryRawUnsafe('PRAGMA integrity_check');
  const estado = Array.isArray(resultado) ? resultado[0]?.integrity_check : 'desconhecido';
  if (estado !== 'ok') {
    console.error(`A base restaurada não passou na verificação de integridade: ${estado}`);
    process.exitCode = 1;
  } else {
    console.log('');
    console.log(`Backup restaurado em ${destino}`);
    console.log(`  Integridade: ok`);
    console.log(`  Tamanho: ${(statSync(destino).size / 1024 / 1024).toFixed(2)} MB`);
    console.log('  Inicie a aplicação e confirme o acesso antes de retomar o serviço.');
  }
} finally {
  await prisma.$disconnect();
}
