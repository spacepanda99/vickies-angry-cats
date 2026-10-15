// Offline support once installed. Online, always fetch fresh files (no stale copies);
// the cache is only the fallback for when the phone has no connection.
const CACHE = 'angry-cats-v75';
const FILES = ['./', './index.html', './backdrop.js', './game.js', './matter.min.js', './manifest.json', './icon-192.png', './icon-512.png', './music-menu.ogg', './music-game.ogg', './jingle-win.ogg', './jingle-lose.ogg', './fonts/fonts.css', './fonts/Fredoka-500.woff2', './fonts/Fredoka-700.woff2', './fonts/LuckiestGuy-400.woff2', './fonts/Bangers-400.woff2', './fonts/Chewy-400.woff2', './fonts/DancingScript-700.woff2'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
