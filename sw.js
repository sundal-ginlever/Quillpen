const CACHE_NAME = 'quillpen-cache-v3';
const DYNAMIC_CACHE_NAME = 'quillpen-dynamic-v1';
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/css/main.css',
  '/css/journal.css',
  '/js/app.js',
  '/js/journal/journal.js',
  '/js/journal/journal-state.js',
  '/js/journal/journal-storage.js',
  '/js/journal/journal-render.js',
  '/js/journal/journal-config.js',
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
  '/js/auth.js',
  '/js/guide.js',
  '/js/help.js',
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
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;

  // 캐시는 GET 요청만 지원 (Supabase REST POST/PATCH 등은 그대로 통과)
  if (req.method !== 'GET') return;

  // 외부 CDN 등 크로스 오리진: 캐시 우선 + 백그라운드 갱신
  if (req.url.startsWith('http') && !req.url.includes(self.location.origin)) {
    event.respondWith(
      caches.match(req).then(cachedRes => {
        const fetchPromise = fetch(req).then(networkRes => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(DYNAMIC_CACHE_NAME).then(cache => cache.put(req, clone));
          }
          return networkRes;
        }).catch(() => cachedRes);
        return cachedRes || fetchPromise;
      })
    );
    return;
  }

  // 동일 오리진: stale-while-revalidate — 캐시로 즉시 응답하되 항상 네트워크로 최신본을 받아 캐시 갱신
  // (배포 후 새 버전이 사용자에게 전달되지 않던 문제 해결)
  event.respondWith(
    caches.match(req).then(cachedRes => {
      const fetchPromise = fetch(req).then(networkRes => {
        if (networkRes && networkRes.status === 200) {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return networkRes;
      }).catch(() => cachedRes || caches.match('/index.html'));
      return cachedRes || fetchPromise;
    })
  );
});

self.addEventListener('activate', event => {
  const KEEP = [CACHE_NAME, DYNAMIC_CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (!KEEP.includes(cacheName)) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});
