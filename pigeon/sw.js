// InFlight service worker: shows push notifications and opens the right chat
// when one is tapped, and keeps a copy of the app so it opens with no signal.
//
// The page is always asked of the network first (so a new version arrives as
// soon as it's out); only if there's no answer within a few seconds, or no
// signal at all, does the copy from last time open instead. The app's files
// are fingerprinted (?v=…, see functions/pigeon/_middleware.js) and never
// change, so those come from the copy whenever it has them. Nothing from the
// API is ever kept here: messages stay sealed in the app's own storage.

const SHELL = "inflight-shell-v1", PAGE = "/pigeon/", WAIT = 4000;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith("inflight-shell") && k !== SHELL) await caches.delete(k);
  await self.clients.claim();
})()));

const ours = (u) => u.origin === self.location.origin && u.pathname.startsWith("/pigeon/") && !u.pathname.startsWith("/pigeon/admin") && !u.pathname.startsWith("/pigeon/mail");

self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET") return;
  let u; try { u = new URL(r.url); } catch (_) { return; }
  if (!ours(u)) return;
  if (r.mode === "navigate" && (u.pathname === "/pigeon/" || u.pathname === "/pigeon/index.html")) return e.respondWith(page(e, r));
  if (u.searchParams.has("v") && /\.(js|css)$/.test(u.pathname)) return e.respondWith(file(r));
});

// the page: the network if it answers in time, else last time's copy
async function page(e, r) {
  const net = fetch(r).then(async (res) => {
    if (res.ok && (res.headers.get("Content-Type") || "").includes("text/html")) {
      const copy = res.clone();
      e.waitUntil((async () => { const c = await caches.open(SHELL); await c.put(PAGE, copy.clone()); await prune(c, await copy.text()); })().catch(() => {}));
    }
    return res;
  });
  try {
    return await Promise.race([net, new Promise((_, no) => setTimeout(() => no(new Error("slow")), WAIT))]);
  } catch (_) {
    const kept = await caches.match(PAGE).catch(() => null);
    if (kept) return kept;
    return net;                                  // nothing kept yet: keep waiting for the network (or its error)
  }
}
// a fingerprinted file: kept for good once fetched
async function file(r) {
  try {
    const c = await caches.open(SHELL), hit = await c.match(r);
    if (hit) return hit;
    const res = await fetch(r);
    if (res.ok) c.put(r, res.clone()).catch(() => {});
    return res;
  } catch (_) { return fetch(r); }
}
// only the files the newest page uses are kept
async function prune(c, html) {
  const want = new Set([...html.matchAll(/\/pigeon\/[\w./-]+\.(?:js|css)\?v=[\w]+/g)].map((m) => m[0]));
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
    badge: "/pigeon/icon-192.png",
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
    const app = open.find((c) => new URL(c.url).pathname.startsWith("/pigeon/") && !new URL(c.url).pathname.startsWith("/pigeon/admin"));
    if (app) { app.postMessage({ inflight: "open", hash: url.hash }); return app.focus(); }
    return self.clients.openWindow(url.href);
  })());
});
