// Precision Fit Studio's service worker: the app keeps working with no connection (a studio's Wi-Fi drops). Every file
// is asked for fresh first, so an update shows on the next opening; the copy kept is only for when there's no answer.
// (Never the sign-in's answers, api/: those are always the server's.)
const CACHE = 'pr-fitting-3';
const SHELL = ['./', 'styles.css', 'app.js', 'logo.png', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png',
  'fonts/barlow-400.woff2', 'fonts/barlow-500.woff2', 'fonts/barlow-600.woff2', 'fonts/barlow-700.woff2',
  'fonts/barlow-condensed-600.woff2', 'fonts/barlow-condensed-700.woff2', 'fonts/barlow-condensed-700i.woff2',
  'fonts/barlow-condensed-800.woff2', 'fonts/barlow-condensed-800i.woff2', 'vendor/html2canvas.min.js', 'vendor/jspdf.umd.min.js?v=4.2.1'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('pr-fitting-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const r = e.request;
  const u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== self.location.origin || u.pathname.includes('/api/')) return;
  e.respondWith(fetch(r).then((res) => {
    if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(r, copy)); }
    return res;
  }).catch(() => caches.match(r, { ignoreSearch: true }).then((m) => m || (r.mode === 'navigate' ? caches.match('./') : Response.error()))));
});
