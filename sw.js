const CACHE_NAME = 'teovoz-native-v2';
const STATIC_ASSETS = [
  './',
  './index.html',
  './icon.png',
  './manifest.json'
];

// Dominios que deben ignorarse totalmente (evitar errores de CORS/Adblock en SW)
const EXCLUDED_DOMAINS = [
  'google-analytics.com',
  'googletagmanager.com',
  'firestore.googleapis.com',
  'firebaseremoteconfig.googleapis.com',
  'firebaseinstallations.googleapis.com'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(e => console.log('TEOVOZ: Cache inicial parcial'));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Omitir dominios excluidos (dejar que el navegador los maneje directamente)
  if (EXCLUDED_DOMAINS.some(domain => url.hostname.includes(domain))) {
    return;
  }

  // 1. ESTRATEGIA PARA LA SHELL (HTML/JS/CSS locales)
  if (event.request.mode === 'navigate' || url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const cloned = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
          }
          return networkResponse;
        }).catch(() => cached);

        return cached || fetchPromise;
      })
    );
    return;
  }

  // 2. ESTRATEGIA PARA IMÁGENES
  if (event.request.destination === 'image' || url.href.includes('mzstatic') || url.href.includes('anchor')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          if (response && response.ok) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
          }
          return response;
        }).catch(() => new Response('', { status: 404 }));
      })
    );
    return;
  }

  // 3. RSS Y APIs EXTERNAS: Stale-While-Revalidate
  if (url.href.includes('corsproxy') || url.href.includes('allorigins')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          const fetchPromise = fetch(event.request).then((networkResponse) => {
            if (networkResponse && networkResponse.ok) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => cachedResponse);

          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }
});