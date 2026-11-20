// Markets's service worker: its price alerts and evening wraps (functions/_markets.js alertTick, wrapTick), with the
// count of them on the app's icon; and the app's own files, kept so it opens at once and offline (below).
// (the icon's badge: how many of Markets's notifications are still waiting to be seen)
const badge = async () => {
  if (!self.navigator.setAppBadge) return;
  const n = (await self.registration.getNotifications().catch(() => [])).length;
  await (n ? self.navigator.setAppBadge(n) : self.navigator.clearAppBadge()).catch(() => {});
};
self.addEventListener("push", (e) => {
  let n;
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
const SHELL = "markets-app-2.46.7";
const FILES = ["cash.js", "cash-store.js", "cashview.js", "./", "theme.js", "styles.css", "app.js", "account.js", "charts.js", "income.js", "stories.js", "desk.js", "send.js", "session.js", "live.js", "manifest.webmanifest", "icon.svg", "icon-180.png", "icon-192.png", "inflite.svg"];
const at = (f) => new URL(f, self.registration.scope).href;
const shellURLs = new Set(FILES.map(at));
const staticFiles = new Set([...FILES, "inflite.svg", "icon-512.png", "icon-maskable-512.png"]);
const isFile = (u, scope) => !u.search && u.pathname.startsWith(scope.pathname) && staticFiles.has(u.pathname.slice(scope.pathname.length));
const cacheable = res => res.status === 200 && res.type === "basic" && !res.redirected &&
  !/(?:^|,)\s*no-store\b/i.test(res.headers.get("Cache-Control") || "");
const tagOf = (res) => res.headers.get("etag") || "";
let filling = null;
function fill() {
  // addAll commits the whole set atomically and streams the bodies through the browser.
  if (!filling) {
    const requests = FILES.map(file => new Request(at(file), {
      cache: "no-cache", credentials: "omit", redirect: "error"
    }));
    filling = caches.open(SHELL).then(cache => cache.addAll(requests)).finally(() => { filling = null; });
  }
  return filling;
}
self.addEventListener("install", e => e.waitUntil(fill().then(() => self.skipWaiting())));
self.addEventListener("message", e => {
  if (e.data?.ifl === "renew") e.waitUntil(fill().then(() => e.ports[0]?.postMessage({ ifl: "renewed" })));
});
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
  const c = await caches.open(SHELL).catch(() => null), hit = await c?.match(key).catch(() => null);
  const freshFile = () => fetch(e.request, { cache: "no-cache", credentials: "omit", redirect: "error" });
  if (!hit) {
    // (one of the set missing while the rest is kept, say a file new in this version, or one the browser let go: the whole
    // set fetched again together first, and this one served from it, never one new file beside the others kept from
    // before (a new app.js asking an old account.js for what it hasn't got). Where that can't be done, as before)
    if (c && shellURLs.has(key) && (await c.keys().catch(() => [])).length) {
      await (renewing ||= fill().finally(() => { renewing = null; })).catch(() => {});
      const fresh = await c.match(key).catch(() => null);
      if (fresh) return fresh;
    }
    const res = await freshFile();
    if (c && cacheable(res)) e.waitUntil(c.put(key, res.clone()).catch(() => {}));
    return res;
  }
  const tag = tagOf(hit);
  if (tag) e.waitUntil((async () => {
    let res = await fetch(key, {
      method: "HEAD", cache: "no-cache", credentials: "omit", redirect: "error",
      headers: { "If-None-Match": tag }
    });
    if (res.status === 304) return;
    if (res.status === 405 || res.status === 501 || (res.ok && !tagOf(res))) {
      res = await freshFile();
      res.body?.cancel().catch(() => {});
    }
    if (res.ok && tagOf(res) && tagOf(res) !== tag) await renew();
  })().catch(() => {}));
  return hit;
}
// (the page: fresh where it can be, a change in it renewing the rest, as above)
async function page(e, key) {
  const c = await caches.open(SHELL).catch(() => null), hit = await c?.match(key).catch(() => null);
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), hit ? 3000 : 20000);
  try {
    const res = await fetch(key, { cache: "no-cache", credentials: "omit", signal: controller.signal });
    if (!res.ok) return res.status >= 500 && hit ? hit : res;
    if (!hit) { if (c && cacheable(res)) e.waitUntil(c.put(key, res.clone()).catch(() => {})); }
    else if (tagOf(res) && tagOf(hit) && tagOf(res) !== tagOf(hit)) e.waitUntil(renew());
    return res;
  } catch (err) { if (hit) return hit; throw err; }
  finally { clearTimeout(deadline); }
}
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url), scope = new URL(self.registration.scope);
  if (r.method !== "GET" || r.headers.has("Authorization") || r.headers.has("Range") || u.origin !== scope.origin || u.pathname.includes("/api/")) return;
  if (r.mode === "navigate") { if (u.pathname === scope.pathname || u.pathname === scope.pathname + "index.html") e.respondWith(page(e, at("./"))); return; }
  if (isFile(u, scope)) e.respondWith(served(e, u.origin + u.pathname));
});
