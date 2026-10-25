// InFlight service worker: shows push notifications and opens the right chat
// when one is tapped, and keeps a copy of the app so it opens with no signal.
//
// The page is always asked of the network first (so a new version arrives as
// soon as it's out); only if there's no answer within a few seconds, or no
// signal at all, does the copy from last time open instead. The app's files
// are fingerprinted (?v=…, see functions/pigeon/_middleware.js) and never
// change, so those come from the copy whenever it has them. Nothing from the
// API is ever kept here: messages stay sealed in the app's own storage.

const SHELL = "inflight-shell-v2", PAGE = "/pigeon/", WAIT = 4000;        // (v2: drops copies kept before files were checked against their fingerprint)

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith("inflight-shell") && k !== SHELL) await caches.delete(k);
  // the page is asked for as the phone starts this worker, not once it's started (a cold open is that much sooner)
  try { await self.registration.navigationPreload?.enable(); } catch (_) {}
  await self.clients.claim();
})()));

const ours = (u) => u.origin === self.location.origin && u.pathname.startsWith("/pigeon/") && !u.pathname.startsWith("/pigeon/mail");

self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET") return;
  let u; try { u = new URL(r.url); } catch (_) { return; }
  if (!ours(u)) return;
  if (r.mode === "navigate" && (u.pathname === "/pigeon/" || u.pathname === "/pigeon/index.html")) return e.respondWith(page(e, r));
  if (r.mode === "navigate") return e.respondWith(asked(e, r));        // (any other page: the answer already asked for, not a second ask)
  if (u.searchParams.has("v") && /\.(js|css)$/.test(u.pathname)) return e.respondWith(file(r));
});

// a page as the phone asked for it while this worker started (navigation preload), or asked for now
const asked = (e, r) => Promise.resolve(e.preloadResponse).then((p) => p || fetch(r));
// the page: the network if it answers in time, else last time's copy
async function page(e, r) {
  const net = asked(e, r);
  // keeping this copy outlasts the answer (which may already be last time's): asked for now, while it still can be
  e.waitUntil(net.then(async (res) => {
    if (!res.ok || !(res.headers.get("Content-Type") || "").includes("text/html")) return;
    const copy = res.clone(), c = await caches.open(SHELL);
    await c.put(PAGE, copy.clone()); await prune(c, await copy.text());
  }).catch(() => {}));
  try {
    return await Promise.race([net, new Promise((_, no) => setTimeout(() => no(new Error("slow")), WAIT))]);
  } catch (_) {
    const kept = await caches.match(PAGE).catch(() => null);
    if (kept) return kept;
    return net;                                  // nothing kept yet: keep waiting for the network (or its error)
  }
}
// a fingerprinted file: kept for good once fetched, if the server vouches that it's
// the file that fingerprint names (it says so with "immutable"; anything else is
// used this once and asked for again next time)
async function file(r) {
  try {
    const c = await caches.open(SHELL), hit = await c.match(r);
    if (hit) return hit;
    const res = await fetch(r, { cache: "reload" });
    if (res.ok && /immutable/.test(res.headers.get("Cache-Control") || "")) c.put(r, res.clone()).catch(() => {});
    return res;
  } catch (_) { return fetch(r); }
}
// only the files the newest page uses are kept
async function prune(c, html) {
  // (the files under PAGE: "/pigeon/x.js?v=…", or "/x.js?v=…" at chat.georgefarrowgreen.com)
  const want = new Set([...html.matchAll(new RegExp(PAGE + "[\\w./-]+\\.(?:js|css)\\?v=\\w+", "g"))].map((m) => m[0]));
  for (const req of await c.keys()) {
    const u = new URL(req.url);
    if (u.pathname === PAGE) continue;
    // a module's own imports aren't in the page; keep any file whose name the page still uses at some version only if it's that version
    const key = u.pathname + u.search;
    const named = [...want].some((w) => w.startsWith(u.pathname + "?"));
    if (named && !want.has(key)) await c.delete(req);
  }
}

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : "" }; }
  // an open app catches up at once (a pigeon that changed course is redrawn on its map straight away)
  e.waitUntil(self.clients.matchAll({ type: "window" }).then((cs) => cs.forEach((c) => c.postMessage({ inflight: "sync" }))).catch(() => {}));
  e.waitUntil(self.registration.showNotification(d.title || "InFlight", {
    body: d.body || "A pigeon has landed.",
    icon: "/pigeon/icon-192.png",
    badge: "/pigeon/badge-96.png",                // (Android draws this small, from its shape alone: the white pigeon)
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: { url: d.url || "/pigeon/" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "/pigeon/", self.location.origin);
  if (url.origin !== self.location.origin || !url.pathname.startsWith("/pigeon/")) return;
  e.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    // the app itself (not the live tracker, nor a page inside another)
    const app = open.find((c) => c.frameType !== "nested" && [PAGE, PAGE + "index.html"].includes(new URL(c.url).pathname));
    if (app) { app.postMessage({ inflight: "open", hash: url.hash }); return app.focus(); }
    return self.clients.openWindow(url.href);
  })());
});
