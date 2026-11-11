/**
 * Teste de carga mínimo para verificar que as páginas públicas respondem
 * dentro de limites aceitáveis. Requer a aplicação a correr.
 *
 *   BASE_URL=http://127.0.0.1:3101 npm run test:load
 */
import autocannon from 'autocannon';

const base = (process.env.BASE_URL ?? 'http://127.0.0.1:3101').replace(/\/$/, '');
const duracao = Number(process.env.LOAD_DURATION ?? 10);
const ligacoes = Number(process.env.LOAD_CONNECTIONS ?? 20);
const latenciaMaximaP99 = Number(process.env.LOAD_MAX_P99_MS ?? 1500);

async function esperarServidor(tentativas = 30) {
  for (let tentativa = 1; tentativa <= tentativas; tentativa += 1) {
    try {
      const resposta = await fetch(`${base}/health`);
      if (resposta.ok) return;
    } catch {
      // servidor ainda a arrancar
    }
    await new Promise((resolver) => setTimeout(resolver, 1_000));
  }
  throw new Error(`O servidor em ${base} não respondeu a /health.`);
}

function correrCarga(url) {
  return new Promise((resolver, rejeitar) => {
    autocannon(
      {
        url,
        connections: ligacoes,
        duration: duracao,
        pipelining: 1,
        timeout: 15,
      },
      (erro, resultado) => {
        if (erro) rejeitar(erro);
        else resolver(resultado);
      },
    );
  });
}

await esperarServidor();

const alvos = ['/', '/medicos', '/login', '/health'];
let falhas = 0;

for (const alvo of alvos) {
  const resultado = await correrCarga(`${base}${alvo}`);
  const p99 = resultado.latency.p99;
  const problemas = [];
  if (resultado.errors > 0) problemas.push(`${resultado.errors} erro(s)`);
  if (resultado.non2xx > 0) problemas.push(`${resultado.non2xx} resposta(s) não-2xx`);
  if (resultado.timeouts > 0) problemas.push(`${resultado.timeouts} timeout(s)`);
  if (p99 > latenciaMaximaP99) problemas.push(`p99 ${p99} ms > ${latenciaMaximaP99} ms`);

  console.log(
    `${problemas.length ? 'ERRO' : 'OK  '} ${alvo} | ${resultado.requests.average.toFixed(1)} req/s | ` +
      `p50 ${resultado.latency.p50} ms | p99 ${p99} ms | não-2xx ${resultado.non2xx}`,
  );
  if (problemas.length) {
    console.log(`     ${problemas.join('; ')}`);
    falhas += 1;
  }
}

if (falhas) {
  console.error(`\n${falhas} alvo(s) fora dos limites.`);
  process.exit(1);
}

console.log('\nTeste de carga concluído dentro dos limites.');
