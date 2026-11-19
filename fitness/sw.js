// Fitness's service worker: its morning notification (functions/_fitpush.js), and the app's own files, kept so it opens
// at once and offline (below).
self.addEventListener("push", (e) => {
  let n;
  try { n = e.data ? e.data.json() : {}; } catch (_) { n = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(n.title || "Fitness", { body: n.body || "", tag: n.tag || undefined, icon: "./icon-192.png", badge: "./icon-192.png", data: { url: n.url || "./" } }));
});
// the browser renewed this phone's subscription by itself: the morning notification moves to the new one, so it carries
// on without Fitness being opened first (signed in: the page's cookie goes with it)
self.addEventListener("pushsubscriptionchange", (e) => {
  e.waitUntil((async () => {
    const was = e.oldSubscription?.endpoint;
    if (!was) return;
    let sub = e.newSubscription;
    if (!sub) {
      const { key } = await (await fetch("/api/fitness/push-key", { credentials: "same-origin" })).json();
      const raw = atob(key.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((key.length + 3) % 4));
      sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, (c) => c.charCodeAt(0)) });
    }
    await fetch("/api/fitness/push-move", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ was, sub: sub.toJSON() }) });
  })().catch(() => {}));
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
const SHELL = "fitness-app-2.46.6";
const FILES = ["rhythm2-client.js", "rhythm2-view.js", "rhythm2-standalone.js", "rhythm2.js", "routes-live.js", "routes-account.js", "routes-geometry.js", "route-plan.js", "routes-data.js", "routes-catalog.js", "routes-store.js", "routes-model.js", "routes-demo.js", "routes-plan.js", "routes-preview.js", "routes.css", "routes-preview.css", "routes-demo", "./", "theme.js", "styles.css", "app.js", "ui.js", "charts.js", "workouts.js", "load.js", "sample.js", "formats.js", "fit.js", "account.js", "rhythm.js",
  "progress.js", "map.js", "mapstyle.js", "besttime.js", "efforts.js", "today.js", "plan.js", "progressview.js", "activities.js", "todaycalc.js", "reader.js", "share.js", "send.js", "invites.js",
  "manifest.webmanifest", "icon.svg", "icon-180.png", "icon-192.png"];
const at = (f) => new URL(f, self.registration.scope).href;
// (a file of the app's, by its address: its code, styles, manifest and pictures, each directly in its folder; not the
// map's library, Weather's, which the browser keeps for a week itself, and is no use offline without its tiles)
const shellURLs = new Set(FILES.map(at));
const staticFiles = new Set([...FILES, "inflite.svg", "icon-512.png", "icon-maskable-512.png"]);
const isFile = (u, scope) => !u.search && u.pathname.startsWith(scope.pathname) && staticFiles.has(u.pathname.slice(scope.pathname.length));
const cacheable = res => res.status === 200 && res.type === "basic" && !res.redirected &&
  !/(?:^|,)\s*no-store\b/i.test(res.headers.get("Cache-Control") || "");
const tagOf = (res) => res.headers.get("etag") || "";

// (all of them, or none: each fetched first, and kept only once every one has come, whole; one that couldn't be fetched
// (a poor connection, a release half out) leaves the set kept as it was, to be tried again the next time)
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
  for (const k of await caches.keys()) if (k.startsWith("fitness-app-") && k !== SHELL) await caches.delete(k);
  await self.clients.claim();
})()));

// a new version found: all of it fetched again, then the app told, once however many files had changed
let renewing = null;
function renew() {
  return (renewing ||= fill().then(async () => {
    for (const c of await self.clients.matchAll({ type: "window" })) c.postMessage({ type: "fitness:new" });
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
  // (served as kept; meanwhile asked after: changed, and the new version's fetched)
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
// (the page itself: from the network while there is one, what's kept offline or after three seconds, as an iPhone takes
// what it says of the status bar from the page that's open as it's added to the Home Screen, and a page kept from before
// could say otherwise; a change in it renews the rest, as a changed file does)
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
  if (r.mode === "navigate") {
    if (u.pathname === scope.pathname || u.pathname === scope.pathname + "index.html") e.respondWith(page(e, at("./")));
    else if (u.pathname === scope.pathname + "routes-demo") e.respondWith(page(e, at("routes-demo")));
    return;
  }
  if (isFile(u, scope)) e.respondWith(served(e, u.origin + u.pathname));
});
