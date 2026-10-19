// Weather's offline copy: the app's own files, fresh from the network when it
// answers within a few seconds, from here when it doesn't. Always fresh: the
// browser's own cache is skipped (Cloudflare tells it to keep files for hours,
// which would mix a new page with old styles and scripts), and a page given the
// kept copy gets the rest of its files from here too, so they match. The forecast
// itself is kept by the page (data.js), never here. And its notifications: rain
// alerts and the morning briefing (functions/_wxpush.js).
const CACHE = "wx-27";
const SHELL = ["./", "./styles.css", "./app.js", "./data.js", "./insights.js", "./format.js", "./codes.js", "./climate.js", "./sky.js", "./charts.js", "./icons.js", "./skill.js", "./radar.js", "./rainmap.js", "./mapgl.js", "./mapstyle.js", "./mapleaf.js", "./official.js", "./manifest.webmanifest", "./icon.svg", "./icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })))).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
const keptFor = new Set();       // the pages given the kept copy
self.addEventListener("fetch", (e) => {
  const req = e.request, u = new URL(req.url), page = req.mode === "navigate";
  if (req.method !== "GET" || u.origin !== self.location.origin || u.pathname.startsWith("/api/")) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const kept = await cache.match(req, { ignoreSearch: true }) || (page ? await cache.match("./") : null);
    if (kept && !page && keptFor.has(e.clientId)) return kept;
    // (a page's own request can't take options; it's never kept by the browser anyway)
    // (a page is kept under the one address, not each link's own: those would pile up, and say where you've looked)
    const net = (page ? fetch(req) : fetch(req, { cache: "no-cache" })).then((r) => { if (r.ok && r.type === "basic") cache.put(page ? "./" : req, r.clone()); return r; });
    if (!kept) return net;
    // the network, unless it's slow or down
    const res = await Promise.race([net.catch(() => kept), new Promise((ok) => setTimeout(() => ok(kept), page ? 3500 : 8000))]);
    if (page && res === kept && e.resultingClientId) keptFor.add(e.resultingClientId);
    return res;
  })());
});

// a notification: { title, body, tag, url }
self.addEventListener("push", (e) => {
  let n = {};
  try { n = e.data ? e.data.json() : {}; } catch (_) { n = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(n.title || "Weather", { body: n.body || "", tag: n.tag || undefined, renotify: n.tag === "rain", icon: "./icon-192.png", badge: "./icon-192.png", data: { url: n.url || "./" } }));
});
// a tap opens the app on the place the notification was about (or brings an open copy forward)
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  let url = new URL(e.notification.data?.url || "./", self.registration.scope).href;
  if (!url.startsWith(self.registration.scope)) url = self.registration.scope;      // (only ever this app's own pages)
  e.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of open) if (c.url.startsWith(self.registration.scope) && "focus" in c) { await c.focus(); return c.navigate ? c.navigate(url) : null; }
    return self.clients.openWindow(url);
  })());
});

// the browser replaced this phone's subscription by itself: tell the server, so the notifications follow it
self.addEventListener("pushsubscriptionchange", (e) => {
  e.waitUntil((async () => {
    const was = e.oldSubscription?.endpoint;
    if (!was) return;
    let sub = e.newSubscription;
    if (!sub) {
      const { key } = await (await fetch("/api/weather/key")).json();
      const raw = atob(key.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((key.length + 3) % 4));
      sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, (c) => c.charCodeAt(0)) });
    }
    await fetch("/api/weather/move", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ was, sub: sub.toJSON() }) });
  })().catch(() => {}));
});
