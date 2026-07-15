const CACHE_NAME = 'quran-memorizer-v15';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './logo.jpg',
  './hadith-data.js',
  './quran-complete-data.js',
  './manifest.json'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME && !key.includes('audio')) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  
  // Stale-While-Revalidate for app shell assets
  const isAsset = ASSETS.some(asset => {
    const cleanAsset = asset.replace('./', '');
    return e.request.url.endsWith(cleanAsset) || (cleanAsset === '' && e.request.url.endsWith('/'));
  });

  if (isAsset) {
    e.respondWith(
      caches.open(CACHE_NAME).then(cache => {
        return cache.match(e.request).then(cachedResponse => {
          const fetchPromise = fetch(e.request).then(networkResponse => {
            cache.put(e.request, networkResponse.clone());
            return networkResponse;
          }).catch(() => cachedResponse);
          return cachedResponse || fetchPromise;
        });
      })
    );
  } else {
    e.respondWith(
      caches.match(e.request).then(response => {
        return response || fetch(e.request);
      })
    );
  }
});
