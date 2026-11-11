/**
 * Cópia de segurança da base SQLite e dos uploads.
 *
 *   npm run db:backup
 *   npm run db:backup -- --manter=30
 *
 * A base é copiada com VACUUM INTO (cópia consistente mesmo com a aplicação
 * a correr). Os uploads são copiados para a mesma pasta de backup e é gerado
 * um manifesto com tamanhos e hash SHA-256.
 */
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

function argumento(nome, padrao) {
  const prefixo = `--${nome}=`;
  const encontrado = process.argv.find((valor) => valor.startsWith(prefixo));
  return encontrado ? encontrado.slice(prefixo.length) : padrao;
}

const raiz = process.cwd();
const manter = Math.max(1, Number(argumento('manter', process.env.BACKUP_RETENCAO ?? 14)) || 14);
const pastaBackups = path.resolve(raiz, argumento('destino', process.env.BACKUP_DIR ?? 'backups'));

function caminhoBaseDados() {
  const url = process.env.DATABASE_URL ?? 'file:./dev.db';
  if (!url.startsWith('file:')) {
    throw new Error('Este script apenas copia bases SQLite (DATABASE_URL=file:...).');
  }
  const caminho = url.slice('file:'.length);
  if (path.isAbsolute(caminho)) return caminho;
  // Os caminhos relativos do Prisma são resolvidos a partir de prisma/.
  return path.resolve(raiz, 'prisma', caminho);
}

function dataParaPasta(data) {
  return data.toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
}

function hashFicheiro(caminho) {
  return createHash('sha256').update(readFileSync(caminho)).digest('hex');
}

const origem = caminhoBaseDados();
if (!existsSync(origem)) {
  console.error(`Base de dados não encontrada: ${origem}`);
  process.exit(1);
}

const agora = new Date();
const nome = `mediagenda-${dataParaPasta(agora)}`;
const destino = path.join(pastaBackups, nome);
mkdirSync(destino, { recursive: true });

const ficheiroBackup = path.join(destino, 'mediagenda.db');
const prisma = new PrismaClient({
  datasources: { db: { url: `file:${origem}` } },
});

try {
  const caminhoSql = ficheiroBackup.replace(/'/g, "''");
  await prisma.$executeRawUnsafe(`VACUUM INTO '${caminhoSql}'`);
} finally {
  await prisma.$disconnect();
}

const uploadsOrigem = path.join(raiz, 'public', 'uploads');
const uploadsDestino = path.join(destino, 'uploads');
if (existsSync(uploadsOrigem)) {
  cpSync(uploadsOrigem, uploadsDestino, { recursive: true });
}

const manifesto = {
  criadoEm: agora.toISOString(),
  baseDadosOrigem: origem,
  baseDadosBackup: 'mediagenda.db',
  baseDadosBytes: statSync(ficheiroBackup).size,
  baseDadosSha256: hashFicheiro(ficheiroBackup),
  uploadsIncluidos: existsSync(uploadsOrigem),
  versaoAplicacao: process.env.APP_VERSION ?? '1.0.0',
};
writeFileSync(path.join(destino, 'manifest.json'), `${JSON.stringify(manifesto, null, 2)}\n`, 'utf8');

// Retenção: mantém apenas as pastas mais recentes.
const existentes = readdirSync(pastaBackups, { withFileTypes: true })
  .filter((entrada) => entrada.isDirectory() && entrada.name.startsWith('mediagenda-'))
  .map((entrada) => entrada.name)
  .sort()
  .reverse();

for (const antiga of existentes.slice(manter)) {
  rmSync(path.join(pastaBackups, antiga), { recursive: true, force: true });
  console.log(`Removido backup antigo: ${antiga}`);
}

console.log('');
console.log(`Backup criado em ${destino}`);
console.log(`  Base: ${(manifesto.baseDadosBytes / 1024 / 1024).toFixed(2)} MB`);
console.log(`  SHA-256: ${manifesto.baseDadosSha256}`);
console.log(`  Uploads: ${manifesto.uploadsIncluidos ? 'incluídos' : 'sem pasta de uploads'}`);
console.log(`  Retenção: ${manter} cópia(s)`);
