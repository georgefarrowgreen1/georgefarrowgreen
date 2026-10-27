// Fitness's service worker: its morning notification (functions/_fitpush.js), and the app's own files, kept so it opens
// at once and offline (below).
self.addEventListener("push", (e) => {
  let n = {};
  try { n = e.data ? e.data.json() : {}; } catch (_) { n = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(n.title || "Fitness", { body: n.body || "", tag: n.tag || undefined, icon: "./icon-192.png", badge: "./icon-192.png", data: { url: n.url || "./" } }));
});
// a tap opens the app on Today (or brings an open copy forward)
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  let url = new URL(e.notification.data?.url || "./", self.registration.scope).href;
  if (!url.startsWith(self.registration.scope)) url = self.registration.scope;      // (only ever this app's own pages)
  e.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of open) if (c.url.startsWith(self.registration.scope) && "focus" in c) return c.focus();
    return self.clients.openWindow(url);
  })());
});

// ---- the app's own files, kept here: so it opens at once, and with no network at all ----
// Each is served from here, and asked after as it is (by its ETag, a few bytes when it's the same); where any has
// changed, the whole set's fetched again together (never a mix of two versions), and the app's told: it opens afresh
// (app.js). Only the app's files: never the API, nothing of yours (your record and files are the app's own copies,
// gone as you sign out).
const SHELL = "fitness-app-1";
const FILES = ["./", "theme.js", "styles.css", "app.js", "ui.js", "charts.js", "workouts.js", "load.js", "sample.js", "formats.js", "fit.js", "account.js", "rhythm.js",
  "progress.js", "map.js", "mapstyle.js", "besttime.js", "efforts.js", "today.js", "plan.js", "progressview.js", "activities.js", "todaycalc.js", "reader.js", "share.js",
  "manifest.webmanifest", "icon.svg", "icon-180.png", "icon-192.png"];
const at = (f) => new URL(f, self.registration.scope).href;
// (a file of the app's, by its address: its code, styles, manifest and pictures, each directly in its folder; not the
// map's library, Weather's, which the browser keeps for a week itself, and is no use offline without its tiles)
const isFile = (u, scope) => u.pathname.startsWith(scope.pathname) && !u.pathname.slice(scope.pathname.length).includes("/") && /\.(js|css|webmanifest|svg|png)$/.test(u.pathname);
const tagOf = (res) => res.headers.get("etag") || "";

async function fill() {
  const c = await caches.open(SHELL);
  await Promise.all(FILES.map((f) => fetch(at(f), { cache: "no-cache" }).then((res) => (res.ok ? c.put(at(f), res) : null), () => null)));
}
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(fill()); });
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith("fitness-app-") && k !== SHELL) await caches.delete(k);
  await self.clients.claim();
})()));

// a new version found: all of it fetched again, then the app told, once however many files had changed
let renewing = null;
function renew() {
  return (renewing ||= fill().then(async () => {
    for (const c of await self.clients.matchAll({ type: "window" })) c.postMessage({ type: "fitness:new" });
  }).finally(() => { renewing = null; }));
}
async function served(e, key) {
  const c = await caches.open(SHELL), hit = await c.match(key);
  const now = fetch(e.request.mode === "navigate" ? key : e.request, { cache: "no-cache" });
  if (!hit) {
    const res = await now;
    if (res.ok && res.type === "basic") await c.put(key, res.clone());
    return res;
  }
  // (served as kept; meanwhile asked after: changed, and the new version's fetched)
  e.waitUntil(now.then((res) => { if (res.ok && tagOf(res) && tagOf(hit) && tagOf(res) !== tagOf(hit)) return renew(); }, () => {}));
  return hit;
}
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url), scope = new URL(self.registration.scope);
  if (r.method !== "GET" || u.origin !== scope.origin || u.pathname.includes("/api/")) return;
  if (r.mode === "navigate") { if (u.pathname === scope.pathname || u.pathname === scope.pathname + "index.html") e.respondWith(served(e, at("./"))); return; }
  if (isFile(u, scope)) e.respondWith(served(e, u.origin + u.pathname));
});
