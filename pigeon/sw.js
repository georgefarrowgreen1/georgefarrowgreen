// InFlight service worker: shows push notifications and opens the right chat
// when one is tapped. It deliberately handles no fetches, so pages always come
// straight from the network (see functions/pigeon/_middleware.js).

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
  e.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const app = open.find((c) => new URL(c.url).pathname.startsWith("/pigeon/") && !new URL(c.url).pathname.startsWith("/pigeon/admin"));
    if (app) { app.postMessage({ inflight: "open", hash: url.hash }); return app.focus(); }
    return self.clients.openWindow(url.href);
  })());
});
