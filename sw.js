const CACHE_NAME = 'teovoz-pwa-v3'; // Increased version
const STATIC_ASSETS = [
  './',
  './index.html',
  './biografia.html',
  './business.html',
  './episode.html',
  './favorites.html',
  './health.html',
  './historiauniversal.html',
  './history.html',
  './love.html',
  './mind.html',
  './miniserie.html',
  './miniserieBlacklist.html',
  './money.html',
  './notifications.html',
  './privacy.html',
  './productivity.html',
  './requests.html',
  './search.html',
  './spirituality.html',
  './index.tsx',
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
      // Intentamos cachear todos
      return Promise.all(
        STATIC_ASSETS.map(url =>
          fetch(url).then(res => {
            if (res.ok) return cache.put(url, res);
          }).catch(() => { })
        )
      );
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

  // 0. Audio (Network Only - Bypass SW)
  if (url.pathname.endsWith('.mp3') || url.pathname.endsWith('.m4a') || url.pathname.endsWith('.wav') || event.request.destination === 'audio') {
    return;
  }

  // 1. Navegación HTML (Stale-While-Revalidate) - OPTIMIZACIÓN CLAVE
  // Muestra caché casi instantáneo, luego actualiza en background
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const networkFetch = fetch(event.request).then(res => {
          if (res && res.ok) {
            const cloned = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
          }
          return res;
        }).catch(() => null);

        // Devolver caché si existe, si no esperar network
        return cached || networkFetch;
      })
    );
    return;
  }

  // 1.5 Assets Estáticos (Cache First)
  // JS, CSS, imágenes de la UI
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

  // 2. Librerías (Stale-While-Revalidate)
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

  // 3. Imágenes de Episodios (Cache First)
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

  // 4. RSS y Proxies (Stale-While-Revalidate) - OPTIMIZACIÓN: Muestra viejo mientras carga nuevo
  if (url.href.includes('corsproxy') || url.href.includes('allorigins') || url.href.includes('rss')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const networkFetch = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const cloned = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
          }
          return networkResponse;
        }).catch(() => null);

        return cached || networkFetch;
      })
    );
    return;
  }

  // Fallback genérico
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});