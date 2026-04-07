/* ===========================================================
   TAYLA - SERVICE WORKER
   -------------------------------------------------------
   Strategy: Stale-While-Revalidate for app shell assets.
   - Serve from cache immediately (fast / offline-capable)
   - Fetch fresh copy in background, update cache
   - On new SW activation, notify the page to prompt reload
   - Update this BUILD constant on every deploy to force
     the browser to detect a new SW version.
=========================================================== */

const BUILD = '2026-04-07T10:00:00'; //  update this string on every deploy
const CACHE_NAME = 'tayla-v29-' + BUILD;

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// URLs that should always go straight to network - never cache
const NETWORK_ONLY = [
  'supabase.co',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'jsdelivr.net',
];

//  INSTALL 
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

//  ACTIVATE 
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
      .then(() => {
        return self.clients.matchAll({ type: 'window' }).then(clients => {
          clients.forEach(client => client.postMessage({ type: 'UPDATE_READY' }));
        });
      })
  );
});

//  FETCH 
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = event.request.url;

  if (NETWORK_ONLY.some(domain => url.includes(domain))) return;

  event.respondWith(staleWhileRevalidate(event.request));
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then(response => {
      if (response && response.status === 200 && response.type !== 'opaque') {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  return cached || networkFetch || caches.match('/index.html');
}

//  MESSAGE 
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
