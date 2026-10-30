// Markets's service worker: its price alerts and evening wraps (functions/_markets.js alertTick, wrapTick), with the
// count of them on the app's icon; and the app's own files, kept so it opens at once and offline (below).
// (the icon's badge: how many of Markets's notifications are still waiting to be seen)
const badge = async () => {
  if (!self.navigator.setAppBadge) return;
  const n = (await self.registration.getNotifications().catch(() => [])).length;
  await (n ? self.navigator.setAppBadge(n) : self.navigator.clearAppBadge()).catch(() => {});
};
self.addEventListener("push", (e) => {
  let n = {};
  try { n = e.data ? e.data.json() : {}; } catch (_) { n = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(n.title || "Markets", { body: n.body || "", tag: n.tag || undefined, renotify: !!n.tag, icon: "./icon-192.png", badge: "./icon-192.png", data: { url: n.url || "./" } }).then(badge));
});
self.addEventListener("notificationclose", (e) => e.waitUntil(badge()));
// the browser renewed this phone's subscription by itself: the alerts move to the new one
self.addEventListener("pushsubscriptionchange", (e) => {
  e.waitUntil((async () => {
    const was = e.oldSubscription?.endpoint;
    if (!was) return;
    let sub = e.newSubscription;
    if (!sub) {
      const { key } = await (await fetch("/api/markets/push-key", { credentials: "same-origin" })).json();
      const raw = atob(key.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((key.length + 3) % 4));
      sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, (c) => c.charCodeAt(0)) });
    }
    await fetch("/api/markets/push-move", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ was, sub: sub.toJSON() }) });
  })().catch(() => {}));
});
// a tap opens the stock it's about (or brings an open copy forward and shows it there)
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(badge());
  let url = new URL(e.notification.data?.url || "./", self.registration.scope).href;
  if (!url.startsWith(self.registration.scope)) url = self.registration.scope;
  e.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of open) if (c.url.startsWith(self.registration.scope) && "focus" in c) { c.postMessage({ type: "markets:open", url }); return c.focus(); }
    return self.clients.openWindow(url);
  })());
});

// ---- the app's own files, kept here: so it opens at once, and with no network at all ----
// Each is served from here, and asked after as it is (by its ETag); where any has changed, the whole set's fetched
// again together (never a mix of two versions), and the app's told. Only the app's files: never the API. The page itself
// is the one exception: it comes from the network while there is one (what's kept, offline or after three seconds), as
// an iPhone takes what it says of the status bar from the page that's open as it's added to the Home Screen, and a
// page kept from before said otherwise.
const SHELL = "markets-app-2";
const FILES = ["./", "theme.js", "styles.css", "app.js", "account.js", "charts.js", "income.js", "desk.js", "manifest.webmanifest", "icon.svg", "icon-180.png", "icon-192.png", "inflite.svg"];
const at = (f) => new URL(f, self.registration.scope).href;
const isFile = (u, scope) => u.pathname.startsWith(scope.pathname) && !u.pathname.slice(scope.pathname.length).includes("/") && /\.(js|css|webmanifest|svg|png)$/.test(u.pathname);
const tagOf = (res) => res.headers.get("etag") || "";
async function fill() {
  const got = await Promise.all(FILES.map((f) => fetch(at(f), { cache: "no-cache" }).then((res) => (res.ok ? res.arrayBuffer().then((b) => [f, b, res]) : null), () => null)));
  if (got.some((g) => !g)) throw new Error("Markets: not every file came");
  const c = await caches.open(SHELL);
  await Promise.all(got.map(([f, b, res]) => c.put(at(f), new Response(b, { status: res.status, headers: res.headers }))));
}
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(fill().catch(() => {})); });
// (the updater every app shares, about to load a new version: every file fetched afresh first, then told: IFL.updates)
self.addEventListener("message", (e) => { if (e.data?.ifl === "renew") e.waitUntil(fill().catch(() => {}).then(() => e.ports[0]?.postMessage({ ifl: "renewed" }))); });
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith("markets-app-") && k !== SHELL) await caches.delete(k);
  await self.clients.claim();
})()));
let renewing = null;
function renew() {
  return (renewing ||= fill().then(async () => {
    for (const c of await self.clients.matchAll({ type: "window" })) c.postMessage({ type: "markets:new" });
  }, () => {}).finally(() => { renewing = null; }));
}
async function served(e, key) {
  const c = await caches.open(SHELL), hit = await c.match(key);
  const now = fetch(e.request.mode === "navigate" ? key : e.request, { cache: "no-cache" });
  if (!hit) {
    const res = await now;
    if (res.ok && res.type === "basic") await c.put(key, res.clone());
    return res;
  }
  e.waitUntil(now.then((res) => { if (res.ok && tagOf(res) && tagOf(hit) && tagOf(res) !== tagOf(hit)) return renew(); }, () => {}));
  return hit;
}
// (the page: fresh where it can be, a change in it renewing the rest, as above)
async function page(e, key) {
  const c = await caches.open(SHELL), hit = await c.match(key);
  try {
    const res = await Promise.race([fetch(key, { cache: "no-cache" }), new Promise((_, no) => setTimeout(() => no(new Error("slow")), hit ? 3000 : 20000))]);
    if (!res.ok) return hit || res;
    if (!hit) { if (res.type === "basic") e.waitUntil(c.put(key, res.clone())); }
    else if (tagOf(res) && tagOf(hit) && tagOf(res) !== tagOf(hit)) e.waitUntil(renew());
    return res;
  } catch (err) { if (hit) return hit; throw err; }
}
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url), scope = new URL(self.registration.scope);
  if (r.method !== "GET" || u.origin !== scope.origin || u.pathname.includes("/api/")) return;
  if (r.mode === "navigate") { if (u.pathname === scope.pathname || u.pathname === scope.pathname + "index.html") e.respondWith(page(e, at("./"))); return; }
  if (isFile(u, scope)) e.respondWith(served(e, u.origin + u.pathname));
});
