/**
 * BOKK TV — Service Worker PWA (Cache App Shell & Mode Offline)
 * v4 — Correction définitive chargement chaînes & Network-First
 */

const CACHE_NAME = 'bokk-tv-shell-v5';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/matches.js',
  '/epg-data.js',
  '/epg.js',
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
  // les proxies (/proxy?), les segments (.ts, .m3u8) ni les requêtes API
  if (
    url.pathname.includes('/proxy') ||
    url.pathname.endsWith('.ts') ||
    url.pathname.endsWith('.m3u8') ||
    url.searchParams.has('url') ||
    url.hostname !== self.location.hostname ||
    event.request.method !== 'GET'
  ) {
    return; // Laisser passer sans intercepter
  }

  // RÈGLE 2 : Les fichiers JS/CSS critiques → Network-First TOUJOURS
  // (jamais servir une vieille version depuis le cache)
  const criticalFiles = [
    'channels.js', 'app.js', 'epg.js', 'epg-data.js', 'epg_data.json', 'matches.js', 'style.css', 'index.html'
  ];
  const isCritical = criticalFiles.some(f => url.pathname.endsWith(f));

  if (isCritical) {
    // Network First — le cache n'est qu'un filet de secours
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' })
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              // Stocker la version sans query string pour éviter les doublons
              const cacheKey = new Request(url.origin + url.pathname);
              cache.put(cacheKey, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Fallback cache si offline
          const cacheKey = new Request(url.origin + url.pathname);
          return caches.match(cacheKey);
        })
    );
    return;
  }

  // Autres ressources statiques (images, fonts...) → Cache First
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      });
    })
  );
});
