/**
 * BOKK TV — Service Worker PWA (Cache App Shell & Mode Offline)
 */

const CACHE_NAME = 'bokk-tv-shell-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/matches.js',
  '/channels.js',
  '/hls.min.js',
  '/mpegts.js',
  '/favicon.png',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[BOKK TV PWA] Erreur pré-cache non bloquante :', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // RÈGLE CRUCIALE : Ne JAMAIS intercepter ni cacher les flux vidéo en direct,
  // les proxies (/proxy?), les segments (.ts, .m3u8) ni les requêtes API ESPN/CORS
  if (
    url.pathname.includes('/proxy') ||
    url.pathname.endsWith('.ts') ||
    url.pathname.endsWith('.m3u8') ||
    url.searchParams.has('url') ||
    url.hostname.includes('espn.com') ||
    url.hostname.includes('acan.group') ||
    url.hostname.includes('novatv.xyz') ||
    url.hostname.includes('megatv5074.com') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  // Network First pour le HTML / JS / CSS avec fallback Cache pour vitesse maximale
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});
