// status.inflite.ai's service worker: only for updates without an account (the page's Get updates). A push shows its
// notification; a tap opens the page at what it's about, in a window that's already open if there is one.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: "InFlite Status", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "InFlite Status", {
    body: d.body || "", tag: d.tag || "status", icon: "/icon-180.png", badge: "/icon-180.png", data: { url: d.url || "/" },
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "/", self.location.origin);
  if (url.origin !== self.location.origin) url.href = self.location.origin + "/";
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const w = wins.find((c) => new URL(c.url).origin === url.origin);
    if (w) { await w.focus(); return w.navigate ? w.navigate(url.href).catch(() => w.postMessage({ go: url.hash })) : w.postMessage({ go: url.hash }); }
    return self.clients.openWindow(url.href);
  })());
});
