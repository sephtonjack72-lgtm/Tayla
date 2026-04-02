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

const BUILD = '2026-03-15T10:00:00'; //  update this string on every deploy
const CACHE_NAME = 'tayla-v25-' + BUILD;

const PRECACHE_ASSETS = [
  '/Tayla/',
  '/Tayla/index.html',
  '/Tayla/style.css',
  '/Tayla/app.js',
  '/Tayla/manifest.json',
  '/Tayla/icon-192.png',
  '/Tayla/icon-512.png',
];

// URLs that should always go straight to network - never cache
const NETWORK_ONLY = [
  'supabase.co',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'jsdelivr.net',
];

//  INSTALL 
// Pre-cache all core assets. skipWaiting() so the new SW
// takes over immediately rather than waiting for all tabs to close.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

//  ACTIVATE 
// Delete any old caches, then claim all open clients so the
// new SW controls them without requiring a page reload.
// After claiming, post an UPDATE_READY message so the app
// can show a "Tap to refresh" toast.
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
        // Notify all open tabs that a new version is ready
        return self.clients.matchAll({ type: 'window' }).then(clients => {
          clients.forEach(client => client.postMessage({ type: 'UPDATE_READY' }));
        });
      })
  );
});

//  FETCH 
// Network-only for external services.
// Stale-while-revalidate for all app shell assets:
//   1. Respond from cache immediately if available
//   2. Always fetch fresh in the background
//   3. Update the cache with the fresh response
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = event.request.url;

  // Pass through network-only URLs untouched
  if (NETWORK_ONLY.some(domain => url.includes(domain))) return;

  event.respondWith(staleWhileRevalidate(event.request));
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  // Always kick off a network fetch in the background
  const networkFetch = fetch(request)
    .then(response => {
      if (response && response.status === 200 && response.type !== 'opaque') {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null); // network failure - silently ignore, we have cache

  // Return cache hit instantly; if no cache yet, wait for network
  return cached || networkFetch || caches.match('/Tayla/index.html');
}

//  MESSAGE 
// Allow the page to trigger skipWaiting via the "Refresh" toast button.
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
