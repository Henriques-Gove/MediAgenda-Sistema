/**
 * Copia de seguranca da base PostgreSQL e dos uploads.
 *
 *   npm run db:backup
 *   npm run db:backup -- --manter=30
 *
 * Usa `pg_dump` (formato custom, restauravel com `pg_restore`). Se o comando
 * nao estiver instalado no computador, tenta executa-lo dentro do servico
 * "db" do docker-compose. Os uploads sao copiados para a mesma pasta e e
 * gerado um manifesto com tamanhos e hash SHA-256.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
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

try {
  process.loadEnvFile(path.resolve(process.cwd(), '.env'));
} catch {
  // .env opcional: em producao as variaveis vem do ambiente.
}

function argumento(nome, padrao) {
  const prefixo = `--${nome}=`;
  const encontrado = process.argv.find((valor) => valor.startsWith(prefixo));
  return encontrado ? encontrado.slice(prefixo.length) : padrao;
}

const raiz = process.cwd();
const manter = Math.max(1, Number(argumento('manter', process.env.BACKUP_RETENCAO ?? 14)) || 14);
const pastaBackups = path.resolve(raiz, argumento('destino', process.env.BACKUP_DIR ?? 'backups'));
const url = process.env.DATABASE_URL;

if (!url || !/^postgres(ql)?:\/\//.test(url)) {
  console.error('Defina DATABASE_URL com uma connection string PostgreSQL.');
  process.exit(1);
}

const ligacao = new URL(url);
const utilizador = decodeURIComponent(ligacao.username || 'postgres');
const baseDados = ligacao.pathname.replace(/^\//, '') || 'postgres';

function dataParaPasta(data) {
  return data.toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
}

function hashFicheiro(caminho) {
  return createHash('sha256').update(readFileSync(caminho)).digest('hex');
}

function existeComando(comando) {
  const resultado = spawnSync(comando, ['--version'], { stdio: 'ignore' });
  return resultado.status === 0;
}

function executarDump(ficheiro) {
  if (existeComando('pg_dump')) {
    const resultado = spawnSync(
      'pg_dump',
      ['--format=custom', '--no-owner', '--no-privileges', `--file=${ficheiro}`, `--dbname=${url}`],
      { stdio: 'inherit' },
    );
    if (resultado.status !== 0) throw new Error('pg_dump falhou.');
    return 'pg_dump';
  }

  if (existeComando('docker')) {
    const verificacao = spawnSync('docker', ['compose', 'ps', '--status', 'running', 'db'], {
      cwd: raiz,
      encoding: 'utf8',
    });
    if (verificacao.status === 0 && verificacao.stdout.includes('db')) {
      const resultado = spawnSync(
        'docker',
        [
          'compose',
          'exec',
          '-T',
          'db',
          'pg_dump',
          '--format=custom',
          '--no-owner',
          '--no-privileges',
          '-U',
          utilizador,
          '-d',
          baseDados,
        ],
        { cwd: raiz, stdio: ['ignore', 'pipe', 'inherit'] },
      );
      if (resultado.status !== 0) throw new Error('pg_dump no contentor falhou.');
      writeFileSync(ficheiro, resultado.stdout);
      return 'docker compose exec db pg_dump';
    }
  }

  throw new Error(
    'pg_dump nao encontrado. Instale o cliente PostgreSQL ou arranque a base com "docker compose up -d db".',
  );
}

const agora = new Date();
const nome = `mediagenda-${dataParaPasta(agora)}`;
const destino = path.join(pastaBackups, nome);
mkdirSync(destino, { recursive: true });

const ficheiroBackup = path.join(destino, 'mediagenda.dump');
const ferramenta = executarDump(ficheiroBackup);

const uploadsOrigem = path.join(raiz, 'public', 'uploads');
const uploadsDestino = path.join(destino, 'uploads');
if (existsSync(uploadsOrigem)) {
  cpSync(uploadsOrigem, uploadsDestino, { recursive: true });
}

const manifesto = {
  criadoEm: agora.toISOString(),
  motor: 'postgresql',
  ferramenta,
  baseDadosOrigem: `${ligacao.hostname}:${ligacao.port || 5432}/${baseDados}`,
  baseDadosBackup: 'mediagenda.dump',
  baseDadosBytes: statSync(ficheiroBackup).size,
  baseDadosSha256: hashFicheiro(ficheiroBackup),
  uploadsIncluidos: existsSync(uploadsOrigem),
  versaoAplicacao: process.env.APP_VERSION ?? '1.0.0',
};
writeFileSync(path.join(destino, 'manifest.json'), `${JSON.stringify(manifesto, null, 2)}\n`, 'utf8');

// Retencao: mantem apenas as pastas mais recentes.
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
console.log(`  Base: ${(manifesto.baseDadosBytes / 1024 / 1024).toFixed(2)} MB (${ferramenta})`);
console.log(`  SHA-256: ${manifesto.baseDadosSha256}`);
console.log(`  Uploads: ${manifesto.uploadsIncluidos ? 'incluidos' : 'sem pasta de uploads'}`);
console.log(`  Retencao: ${manter} copia(s)`);
