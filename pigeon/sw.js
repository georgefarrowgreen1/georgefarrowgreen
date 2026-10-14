// InFlight service worker: shows push notifications and opens the right chat
// when one is tapped. It deliberately handles no fetches, so pages always come
// straight from the network (see functions/_inflight.js).
//
// The app is at /pigeon/ at the old address and at the root of its own
// (chat.georgefarrowgreen.com); notifications name /pigeon/, so at its own
// address they open the root.
const ROOT = new URL(self.registration.scope).pathname;
const isApp = (path) => (ROOT === "/" ? path === "/" : path.startsWith("/pigeon/") && !path.startsWith("/pigeon/admin"));

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : "" }; }
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
  if (ROOT === "/" && !url.pathname.startsWith("/pigeon/admin")) url.pathname = "/";
  e.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const app = open.find((c) => isApp(new URL(c.url).pathname));
    if (app) { app.postMessage({ inflight: "open", hash: url.hash }); return app.focus(); }
    return self.clients.openWindow(url.href);
  })());
});
