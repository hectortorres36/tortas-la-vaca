const CACHE = 'tortas-la-vaca-v1';

const PRECACHE = [
  './',
  './index.html',
  './logo.jpeg',
];

// Instalar: guardar assets principales en cache
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// Activar: borrar caches viejos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: sirve desde cache inmediatamente, actualiza en segundo plano
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(event.request);

      const fetchAndCache = fetch(event.request)
        .then(response => {
          if (response && (response.ok || response.type === 'opaque')) {
            cache.put(event.request, response.clone());
          }
          return response;
        })
        .catch(() => null);

      // Si esta en cache: sirve rapido y actualiza de fondo
      if (cached) {
        fetchAndCache;
        return cached;
      }

      // No esta en cache: espera la red
      const networkResponse = await fetchAndCache;
      if (networkResponse) return networkResponse;

      // Sin red y sin cache: devuelve el menu guardado
      if (event.request.mode === 'navigate') {
        return cache.match('./index.html');
      }
    })
  );
});
