// TerraLearn Service Worker (PWA & Offline Support)
const CACHE_VERSION = 'data-8d4e24f679';
const STATIC_CACHE = `terralearn-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `terralearn-runtime-${CACHE_VERSION}`;

// Precached core assets required for offline boot
const PRECACHE_ASSETS = [
  './',
  'index.html',
  'favicon.svg',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable.svg',
  'textures/water-mask.png',
  'textures/earth-dark.jpg',
  'textures/earth-day.jpg',
  'textures/earth-atlas.jpg',
  'textures/clouds.png',
  'data/search-index.json',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then(cache => {
        return cache.addAll(PRECACHE_ASSETS).catch(err => {
          console.warn('[SW] Precache warning:', err);
        });
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  const allowedCaches = new Set([STATIC_CACHE, RUNTIME_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then(keys => {
        return Promise.all(
          keys.filter(key => !allowedCaches.has(key)).map(key => caches.delete(key)),
        );
      })
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;

  // Only handle GET requests with HTTP/HTTPS protocols
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // 1. Navigation requests (HTML documents) -> Network-First with Cache Fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached =
            (await caches.match(request)) ||
            (await caches.match('./')) ||
            (await caches.match('index.html'));
          if (cached) return cached;
          return new Response('TerraLearn offline – please reconnect.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }),
    );
    return;
  }

  // 2. Heavy & immutable static assets -> Cache-First
  const isCacheFirstAsset =
    url.pathname.includes('/textures/') ||
    url.pathname.includes('/data/') ||
    url.pathname.includes('/assets/') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg');

  if (isCacheFirstAsset) {
    event.respondWith(
      caches.match(request).then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(RUNTIME_CACHE).then(cache => cache.put(request, copy));
          }
          return networkResponse;
        });
      }),
    );
    return;
  }

  // 3. All other requests -> Network with fallback to cache
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request)),
  );
});
