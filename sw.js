// Service Worker limpio sin Firebase Messaging


const CACHE_NAME = 'teovoz-pwa-v3';
const STATIC_ASSETS = [
  './index.html',
  'https://cdn.tailwindcss.com',
  'https://lucide.dev/favicon.ico'
];

// Dominios que consideramos infraestructura crítica
const CRITICAL_DOMAINS = [
  'esm.sh',
  'lucide-react',
  'google-analytics'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
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

  // 0. Estrategia para Audio (Network Only - Bypass SW)
  // Crucial para Android 15: Dejar que el navegador maneje el streaming nativo sin intermediarios
  if (url.pathname.endsWith('.mp3') || url.pathname.endsWith('.m4a') || url.pathname.endsWith('.wav') || event.request.destination === 'audio') {
    return; // Bypass Service Worker entirely
  }

  // 1. Estrategia para Assets Estáticos (Cache First)
  const isStatic = STATIC_ASSETS.some(asset => {
    if (asset.startsWith('http')) return event.request.url === asset;
    return url.pathname.endsWith(asset.replace('./', ''));
  });

  if (isStatic || url.hostname.includes('lucide.dev')) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
    return;
  }

  // 2. Estrategia para Librerías (Stale-While-Revalidate)
  if (CRITICAL_DOMAINS.some(domain => url.hostname.includes(domain))) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const cloned = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
          }
          return networkResponse;
        });
        return cached || fetchPromise;
      })
    );
    return;
  }

  // 3. Estrategia para Imágenes de Episodios (Cache First)
  if (event.request.destination === 'image' || url.href.includes('mzstatic') || url.href.includes('anchor')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          if (response && response.ok) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
          }
          return response;
        }).catch(() => null);
      })
    );
    return;
  }

  // 4. Estrategia para RSS y Proxies (Network First, Fallback to Cache)
  if (url.href.includes('corsproxy') || url.href.includes('allorigins') || url.href.includes('rss')) {
    event.respondWith(
      fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.ok) {
          const cloned = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
        }
        return networkResponse;
      }).catch(() => {
        return caches.match(event.request);
      })
    );
    return;
  }

  // Fallback genérico
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});