/* Offline shell for the trip tracker.
 *
 * The rule that keeps this from stranding anyone on an old build:
 *   - the page itself and version.json always go to the network first
 *   - versioned assets (…?v=123) are cached hard, because a new deploy gives
 *     them new URLs, so a stale copy can never be served by accident
 *   - Firebase and Google are never cached — live data must stay live
 */
const CACHE = 'trip-shell-__BUILD__';

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* On localhost the shell is a nuisance rather than a feature: it serves the
   app.js you edited a minute ago and makes every change look like it did not
   land. Caching is for the deployed site, where URLs carry a build stamp. */
const DEV = ['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname);

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (DEV) return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // Firebase, Google: straight through
  if (url.pathname.endsWith('/version.json')) return;       // must always be fresh

  const isDoc = req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('/index.html');

  if (isDoc) {
    /* network first, so a new build is picked up the moment there is signal,
       with the cached copy as the offline fallback */
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const c = await caches.open(CACHE);
        c.put(req, fresh.clone());
        return fresh;
      } catch {
        return (await caches.match(req)) || (await caches.match('./')) ||
          new Response('Offline and nothing cached yet.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }

  /* everything else: serve from cache if we have it, otherwise fetch and keep it */
  event.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
      return res;
    } catch (e) {
      return hit || Response.error();
    }
  })());
});
