/* ============================================================
   sw.js — Service Worker (PWA)
   Cachea la app completa para que funcione 100 % sin conexión
   en el navegador de Android, como una app nativa.
   ============================================================ */
const VERSION = 'nebula-v3';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './libs/three.module.js',
  './css/style.css',
  './js/main.js',
  './js/game.js',
  './js/world.js',
  './js/models.js',
  './js/audio.js',
  './js/input.js',
  './assets/icons/icon.png',
  './assets/fonts/orbitron-latin-500-normal.woff2',
  './assets/fonts/orbitron-latin-700-normal.woff2',
  './assets/fonts/orbitron-latin-900-normal.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request)
          .then((res) => {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(e.request, copy));
            return res;
          })
          .catch(() => caches.match('./index.html'))
    )
  );
});
