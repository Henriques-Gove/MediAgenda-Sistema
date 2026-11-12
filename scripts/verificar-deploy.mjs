/**
 * Verifica se o site publicado esta a correr a versao mais recente do codigo.
 *
 * Uso:
 *   npm run deploy:verificar
 *   npm run deploy:verificar -- https://outro-endereco.onrender.com
 *
 * O servidor expoe o commit em /health (variavel RENDER_GIT_COMMIT no Render),
 * pelo que e possivel comparar com o commit local sem abrir o painel.
 */
import { spawnSync } from 'node:child_process';

const endereco = (process.argv[2] ?? process.env.APP_URL ?? 'https://mediagenda-sistema.onrender.com').replace(/\/$/, '');

function commitLocal() {
  const resultado = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' });
  return resultado.status === 0 ? resultado.stdout.trim() : 'desconhecido';
}

async function pedir(caminho, tentativas = 2) {
  for (let tentativa = 1; tentativa <= tentativas; tentativa += 1) {
    try {
      const resposta = await fetch(`${endereco}${caminho}`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(90_000),
        headers: { 'user-agent': 'mediagenda-verificador-deploy' },
      });
      return resposta;
    } catch (erro) {
      if (tentativa === tentativas) throw erro;
      console.log(`  Sem resposta (tentativa ${tentativa}). O plano gratuito do Render pode estar a acordar...`);
    }
  }
  throw new Error('sem resposta');
}

const local = commitLocal();
console.log('');
console.log(`  Endereco: ${endereco}`);
console.log(`  Commit local: ${local}`);
console.log('');

let saude;
try {
  const resposta = await pedir('/health');
  saude = await resposta.json();
} catch (erro) {
  console.error(`  O site nao respondeu: ${erro.message}`);
  process.exit(1);
}

console.log(`  Estado: ${saude.estado ?? '?'} | Ambiente: ${saude.ambiente ?? '?'} | Base de dados: ${saude.baseDados ?? '?'}`);
console.log(`  Commit publicado: ${saude.commit ?? 'nao exposto (versao antiga do codigo)'}`);

let temMarcadoresNovos = false;
try {
  const resposta = await pedir('/login');
  const html = await resposta.text();
  const temContasDemo = /Contas de demonstra/i.test(html);
  const temFundoAnimado = /auth-bg-video/.test(html);
  temMarcadoresNovos = temFundoAnimado && !temContasDemo;
  console.log(`  Login: fundo animado=${temFundoAnimado ? 'sim' : 'nao'} | contas de demonstracao=${temContasDemo ? 'sim' : 'nao'}`);
} catch {
  console.log('  Nao foi possivel ler a pagina de login.');
}

const publicado = saude.commit ?? null;
const atualizado = publicado ? publicado === local : temMarcadoresNovos;

console.log('');
if (atualizado) {
  console.log('  Resultado: o site esta ATUALIZADO com o codigo mais recente.');
} else {
  console.log('  Resultado: o site esta DESATUALIZADO.');
  console.log('  No painel do Render: Manual Deploy -> Deploy latest commit.');
  console.log('  Se o deploy falhar, consulte os registos do build antes de repetir.');
}
console.log('');
process.exit(atualizado ? 0 : 2);
