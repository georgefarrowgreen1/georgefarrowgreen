// Weather's offline copy: the app's own files, fresh from the network when it
// answers within a few seconds, from here when it doesn't. The forecast itself
// is kept by the page (data.js), never here.
const CACHE = "wx-1";
const SHELL = ["./", "./styles.css", "./app.js", "./data.js", "./insights.js", "./format.js", "./codes.js", "./climate.js", "./sky.js", "./charts.js", "./icons.js", "./manifest.webmanifest", "./icon.svg", "./icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== "GET" || u.origin !== self.location.origin || u.pathname.startsWith("/api/")) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const net = fetch(req).then((r) => { if (r.ok && r.type === "basic") cache.put(req, r.clone()); return r; });
    const kept = await cache.match(req, { ignoreSearch: true }) || (req.mode === "navigate" ? await cache.match("./") : null);
    if (!kept) return net;
    // the network, unless it's slow or down
    return Promise.race([net.catch(() => kept), new Promise((ok) => setTimeout(() => ok(kept), 3500))]);
  })());
});
