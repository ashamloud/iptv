/**
 * BOKK TV — Service Worker PWA (Cache App Shell & Mode Offline)
 * v16 — Network-First absolu pour la racine / et index.html, auto-refresh des mises à jour
 */

const CACHE_NAME = 'bokk-tv-shell-v23';
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
  // les proxies (/proxy?), l'administration secrète (/adminee), les segments (.ts, .m3u8) ni les requêtes API
  if (
    url.pathname.includes('/proxy') ||
    url.pathname.includes('/adminee') ||
    url.pathname.endsWith('.ts') ||
    url.pathname.endsWith('.m3u8') ||
    url.searchParams.has('url') ||
    url.hostname !== self.location.hostname ||
    event.request.method !== 'GET'
  ) {
    return; // Laisser passer directement au serveur sans intercepter
  }

  // RÈGLE 2 : Les fichiers critiques (racine /, index.html, JS et CSS) → Network-First TOUJOURS
  // L'utilisateur doit TOUJOURS voir la version en ligne la plus récente instantanément
  const criticalFiles = [
    '/', 'index.html', 'channels.js', 'app.js', 'epg.js', 'epg-data.js', 'epg_data.json', 'matches.js', 'style.css'
  ];
  const isCritical = url.pathname === '/' || criticalFiles.some(f => url.pathname.endsWith(f));

  if (isCritical) {
    // Network First — le cache n'est qu'un filet de secours en cas de perte de connexion
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' })
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              const cacheKey = new Request(url.origin + url.pathname);
              cache.put(cacheKey, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Fallback cache si totalement offline
          const cacheKey = new Request(url.origin + url.pathname);
          return caches.match(cacheKey).then(cached => cached || caches.match('/'));
        })
    );
    return;
  }

  // Autres ressources statiques (images, fonts...) → Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => null);

      return cached || fetchPromise;
    })
  );
});
