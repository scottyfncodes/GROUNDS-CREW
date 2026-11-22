// GROUNDS CREW service worker: the park works offline once it has been opened. Network first, so a new
// release is always what you get when you are online; the cache is only the fallback.
const CACHE = 'grounds-crew-v5';
const SHELL = ['./', 'index.html', 'styles.css', 'manifest.webmanifest', 'src/main.js', 'src/config.js', 'src/geometry.js', 'src/surface.js', 'src/routes.js', 'src/sim.js', 'src/gameday.js', 'src/sprites.js', 'src/render.js', 'src/audio.js', 'src/ui.js', 'src/input.js', 'src/save.js', 'src/season.js', 'src/rng.js', 'src/design.js', 'src/postcard.js',
  'fonts/alfa-slab-one-latin-400-normal.woff2', 'fonts/barlow-condensed-latin-400-normal.woff2', 'fonts/barlow-condensed-latin-600-normal.woff2'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()).catch(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))));
});
