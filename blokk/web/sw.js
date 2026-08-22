/* Shell cache. API responses are never cached — a stale approval queue is
   worse than a spinner, because you would be deciding on facts that moved.

   The shell is network-first with cache as fallback, so shipping a UI change
   lands on the phone at the next load rather than waiting for someone to
   remember to bump a version string. The version below only names the box
   old caches get swept out of. */
const VERSION = '2026-08-22';
const SHELL = `blokk-shell-${VERSION}`;
const FILES = ['/', '/index.html', '/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL)
    .then(c => c.addAll(FILES).catch(()=>{}))   // a missing file must not block install
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(k => Promise.all(k.filter(x => x !== SHELL).map(x => caches.delete(x))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/')) return;             // always live
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(r => {
        // Keep the shell fresh for the next time the Mac is asleep.
        if (r.ok) { const copy = r.clone(); caches.open(SHELL).then(c => c.put(e.request, copy)); }
        return r;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('/')))
  );
});
