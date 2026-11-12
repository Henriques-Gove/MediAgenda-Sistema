/* MediAgenda — service worker
 * Estratégia: cache dos assets estáticos e página offline. As páginas
 * autenticadas nunca são guardadas em cache, para evitar que dados clínicos
 * fiquem acessíveis num dispositivo partilhado.
 */
const VERSAO = 'mediagenda-v2';
const CACHE_ESTATICOS = `${VERSAO}-estaticos`;
const CACHE_PAGINAS = `${VERSAO}-paginas`;

const ASSETS = [
  '/css/styles.css',
  '/css/dashboard.css',
  '/vendor/bootstrap/bootstrap.min.css',
  '/vendor/bootstrap/bootstrap.bundle.min.js',
  '/vendor/bootstrap-icons/bootstrap-icons.min.css',
  '/vendor/bootstrap-icons/fonts/bootstrap-icons.woff2',
  '/favicon.svg',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    Promise.all([
      caches.open(CACHE_ESTATICOS).then((cache) => cache.addAll(ASSETS)),
      caches.open(CACHE_PAGINAS).then((cache) => cache.add('/offline')),
    ])
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((chaves) =>
        Promise.all(
          chaves
            .filter((chave) => !chave.startsWith(VERSAO))
            .map((chave) => caches.delete(chave)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function ehAssetEstatico(url) {
  return (
    url.pathname.startsWith('/css/') ||
    url.pathname.startsWith('/vendor/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/favicon.svg' ||
    url.pathname === '/manifest.webmanifest'
  );
}

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;

  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;

  // Assets: cache primeiro, com atualização em segundo plano.
  if (ehAssetEstatico(url)) {
    evento.respondWith(
      caches.open(CACHE_ESTATICOS).then(async (cache) => {
        const guardado = await cache.match(pedido);
        const rede = fetch(pedido)
          .then((resposta) => {
            if (resposta.ok) cache.put(pedido, resposta.clone());
            return resposta;
          })
          .catch(() => null);
        return guardado ?? (await rede) ?? new Response('', { status: 504 });
      }),
    );
    return;
  }

  // Navegação: rede primeiro; se falhar, página offline (sem cache de HTML privado).
  if (pedido.mode === 'navigate') {
    evento.respondWith(
      fetch(pedido).catch(async () => {
        const cache = await caches.open(CACHE_PAGINAS);
        const offline = await cache.match('/offline');
        return offline ?? new Response('Está sem ligação à internet.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }),
    );
  }
});
