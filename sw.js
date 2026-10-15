/* AleStudio service worker — offline app shell.
 * Bump CACHE_VERSION whenever any precached file changes, so installed
 * copies pick up the new version. */
const CACHE_VERSION = 'v2';
const CACHE_NAME = `alestudio-${CACHE_VERSION}`;
const CACHE_PREFIX = 'alestudio-';

/* ==========================================================================
 * PRECACHE — app shell, relative URLs only (resolved against the SW scope).
 * UI AGENT: if you add js/views/*.js (or any other static file), append it
 * here and bump CACHE_VERSION.
 * ========================================================================== */
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/base.css',
  './css/app.css',
  './js/app.js',
  './js/db.js',
  './js/classify.js',
  './js/media.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
];
/* ============================ END PRECACHE ================================ */

const INDEX_URL = new URL('./index.html', self.registration.scope).href;

// Icons are not needed to run the app offline; everything else is.
function isOptional(url) {
  return url.startsWith('./icons/');
}

// Safari refuses to answer a navigation with a response that followed a redirect
// (hosts with "pretty URLs" redirect ./index.html to ./). Store a clean copy.
async function withoutRedirect(response) {
  if (!response.redirected) return response;
  return new Response(await response.blob(), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

// Required files must all be cached or the install fails as a whole, so the
// browser retries it on the next visit instead of keeping an incomplete shell.
async function precacheOne(cache, url) {
  try {
    const response = await fetch(new Request(url, { cache: 'reload' }));
    if (!response || !response.ok) throw new Error('Precache failed (' + (response && response.status) + '): ' + url);
    await cache.put(url, await withoutRedirect(response));
  } catch (err) {
    if (!isOptional(url)) throw err;
    // Optional file: skip it, it will be cached on first use.
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(PRECACHE.map((url) => precacheOne(cache, url)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

function isCacheable(response) {
  return Boolean(response) && response.status === 200 && response.type === 'basic';
}

async function fetchAndUpdate(request, cache) {
  const response = await fetch(request);
  if (isCacheable(response)) {
    // Ignore quota errors: the response is still returned to the page.
    withoutRedirect(response.clone())
      .then((copy) => cache.put(request, copy))
      .catch(() => {});
  }
  return response;
}

async function staleWhileRevalidate(event) {
  const request = event.request;
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
  const network = fetchAndUpdate(request, cache);

  if (cached) {
    // Serve from cache now, refresh in the background.
    event.waitUntil(network.catch(() => {}));
    return cached;
  }

  try {
    return await network;
  } catch (err) {
    if (request.mode === 'navigate') {
      const fallback = (await cache.match(INDEX_URL)) || (await cache.match('./'));
      if (fallback) return fallback;
    }
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Never touch non-GET requests.
  if (request.method !== 'GET') return;

  // Only same-origin http(s): this also leaves blob:, data: and extensions alone.
  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (url.origin !== self.location.origin) return;

  // Range requests (media streaming) go straight to the network.
  if (request.headers.has('range')) return;

  event.respondWith(staleWhileRevalidate(event));
});
