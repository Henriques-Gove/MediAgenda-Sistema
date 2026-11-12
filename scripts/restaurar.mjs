/**
 * Restauro de uma copia de seguranca PostgreSQL.
 *
 *   npm run db:restore -- backups/mediagenda-20261112-120000 --confirmar
 *
 * Pare a aplicacao antes de executar. A base atual e guardada em
 * backups/antes-restauro-* e o backup e validado por SHA-256.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

try {
  process.loadEnvFile(path.resolve(process.cwd(), '.env'));
} catch {
  // .env opcional: em producao as variaveis vem do ambiente.
}

const argumentos = process.argv.slice(2);
const confirmar = argumentos.includes('--confirmar');
const ignorarHash = argumentos.includes('--ignorar-hash');
const origemArg = argumentos.find((valor) => !valor.startsWith('--'));

if (!origemArg || !confirmar) {
  console.error('Utilizacao: npm run db:restore -- <pasta-do-backup> --confirmar');
  console.error('Pare a aplicacao antes de restaurar.');
  process.exit(1);
}

const raiz = process.cwd();
const origem = path.resolve(raiz, origemArg);
const backupDb = path.join(origem, 'mediagenda.dump');
const url = process.env.DATABASE_URL;

if (!url || !/^postgres(ql)?:\/\//.test(url)) {
  console.error('Defina DATABASE_URL com uma connection string PostgreSQL.');
  process.exit(1);
}

if (!existsSync(backupDb)) {
  console.error(`Nao foi encontrado ${backupDb}`);
  process.exit(1);
}

function hashFicheiro(caminho) {
  return createHash('sha256').update(readFileSync(caminho)).digest('hex');
}

const manifestoPath = path.join(origem, 'manifest.json');
if (existsSync(manifestoPath) && !ignorarHash) {
  const manifesto = JSON.parse(readFileSync(manifestoPath, 'utf8'));
  const hashAtual = hashFicheiro(backupDb);
  if (manifesto.baseDadosSha256 && manifesto.baseDadosSha256 !== hashAtual) {
    console.error('O hash do backup nao corresponde ao manifesto. Use --ignorar-hash apenas se souber o que esta a fazer.');
    process.exit(1);
  }
}

const ligacao = new URL(url);
const utilizador = decodeURIComponent(ligacao.username || 'postgres');
const baseDados = ligacao.pathname.replace(/^\//, '') || 'postgres';

function existeComando(comando) {
  const resultado = spawnSync(comando, ['--version'], { stdio: 'ignore' });
  return resultado.status === 0;
}

function restaurar() {
  if (existeComando('pg_restore')) {
    const resultado = spawnSync(
      'pg_restore',
      ['--clean', '--if-exists', '--no-owner', '--no-privileges', `--dbname=${url}`, backupDb],
      { stdio: 'inherit' },
    );
    if (resultado.status !== 0) throw new Error('pg_restore falhou.');
    return 'pg_restore';
  }

  if (existeComando('docker')) {
    const resultado = spawnSync(
      'docker',
      [
        'compose',
        'exec',
        '-T',
        'db',
        'pg_restore',
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-privileges',
        '-U',
        utilizador,
        '-d',
        baseDados,
      ],
      { cwd: raiz, stdio: ['pipe', 'inherit', 'inherit'], input: readFileSync(backupDb) },
    );
    if (resultado.status !== 0) throw new Error('pg_restore no contentor falhou.');
    return 'docker compose exec db pg_restore';
  }

  throw new Error('pg_restore nao encontrado. Instale o cliente PostgreSQL ou use "docker compose".');
}

const pastaSeguranca = path.resolve(
  raiz,
  'backups',
  `antes-restauro-${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '')}`,
);
mkdirSync(pastaSeguranca, { recursive: true });

try {
  console.log('A guardar a base atual antes de restaurar...');
  const atual = path.join(pastaSeguranca, 'mediagenda.dump');
  if (existeComando('pg_dump')) {
    spawnSync('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', `--file=${atual}`, `--dbname=${url}`], {
      stdio: 'inherit',
    });
  }
} catch {
  console.warn('Nao foi possivel guardar a base atual; a continuar com o restauro.');
}

const ferramenta = restaurar();

const uploadsOrigem = path.join(origem, 'uploads');
if (existsSync(uploadsOrigem)) {
  cpSync(uploadsOrigem, path.join(raiz, 'public', 'uploads'), { recursive: true, force: true });
}

console.log('');
console.log(`Backup restaurado com ${ferramenta}`);
console.log(`  Base: ${ligacao.hostname}:${ligacao.port || 5432}/${baseDados}`);
console.log(`  Tamanho: ${(statSync(backupDb).size / 1024 / 1024).toFixed(2)} MB`);
console.log('  Inicie a aplicacao e confirme o acesso antes de retomar o servico.');
