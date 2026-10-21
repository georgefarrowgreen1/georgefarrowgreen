// Weather's own copy of itself, which is what makes it open at once (and offline): each version's files, fetched
// together as it's installed, so a page and its scripts and styles always match, and given from here straight away,
// with no wait on the network. A new version is looked for as the app's opened (app.js), installed alongside, and
// started on there and then (or the next time it's opened: app.js). Anything of its own not kept yet is fetched (the
// browser's own cache skipped, so it's never an old copy) and kept with this version. The map's libraries (vendor/),
// which change far less often, are kept apart, across versions (LIBS: renamed when they're updated). The forecast
// itself is kept by the page (data.js), never here. And its notifications: rain alerts and the morning briefing
// (functions/_wxpush.js).
const CACHE = "wx-53", LIBS = "wx-libs-maplibre-6.12.0-leaflet-1.9.4";
const SHELL = ["./", "./styles.css", "./app.js", "./data.js", "./insights.js", "./format.js", "./codes.js", "./climate.js", "./sky.js", "./charts.js", "./icons.js", "./skill.js", "./radar.js", "./rainmap.js", "./radarmix.js", "./mapgl.js", "./mapstyle.js", "./mapleaf.js", "./official.js", "./agree.js", "./manifest.webmanifest", "./icon.svg", "./icon-192.png"];

// (all of it or none: a version that couldn't all be fetched, on a poor connection say, isn't started, so the last
// whole one carries on, offline too, and it's tried again next time)
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== LIBS).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request, u = new URL(req.url), page = req.mode === "navigate";
  if (req.method !== "GET" || u.origin !== self.location.origin || u.pathname.startsWith("/api/")) return;
  e.respondWith((async () => {
    // (a page is kept under the one address, not each link's own: those would pile up, and say where you've looked)
    const cache = await caches.open(u.pathname.includes("/vendor/") ? LIBS : CACHE), key = page ? "./" : req;
    const kept = await cache.match(key, { ignoreSearch: true });
    if (kept) return kept;
    // (a page's own request can't take options; it's never kept by the browser anyway)
    const res = await (page ? fetch(req) : fetch(req, { cache: "no-cache" }));
    if (res.ok && res.type === "basic") cache.put(key, res.clone());
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
