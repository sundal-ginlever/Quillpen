const CACHE_NAME = 'quillpen-cache-v1';
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/css/main.css',
  '/js/app.js',
  '/js/state.js',
  '/js/sync.js',
  '/js/interaction.js',
  '/js/toolbar.js',
  '/js/events.js',
  '/js/config.js',
  '/js/utils.js',
  '/js/undo.js',
  '/js/camera.js',
  '/js/canvas-manager.js',
  '/js/connections.js',
  '/js/export.js',
  '/js/minimap.js',
  '/js/pwa.js',
  '/js/search.js',
  '/js/share.js',
  '/js/supabase.js',
  '/js/grid.js',
  '/js/widgets/core.js',
  '/js/widgets/memo.js',
  '/js/widgets/sketch.js',
  '/js/widgets/spreadsheet.js',
  '/js/widgets/image.js',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(URLS_TO_CACHE);
    })
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  
  if (req.url.startsWith('http') && !req.url.includes(self.location.origin)) {
    event.respondWith(
      caches.match(req).then(cachedRes => {
        const fetchPromise = fetch(req).then(networkRes => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open('quillpen-dynamic-v1').then(cache => cache.put(req, clone));
          }
          return networkRes;
        }).catch(() => cachedRes);
        return cachedRes || fetchPromise;
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(response => {
      return response || fetch(req).then(networkRes => {
        if (networkRes && networkRes.status === 200) {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return networkRes;
      });
    }).catch(() => caches.match('/index.html'))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
