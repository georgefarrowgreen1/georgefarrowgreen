// status.inflite.ai's service worker: only for updates without an account (the page's Get updates). A push shows its
// notification; a tap opens the page at what it's about, in a window that's already open if there is one.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("push", (e) => {
  let d;
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: "InFlite Status", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "InFlite Status", {
    body: d.body || "", tag: d.tag || "status", icon: new URL("icon-180.png", self.registration.scope).href, badge: new URL("icon-180.png", self.registration.scope).href, data: { url: d.url || self.registration.scope },
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(self.registration.scope);
  // Status notifications identify incidents by fragment. Keep legacy subscriptions
  // working when a notification carries the new canonical status page address.
  try {
    const destination = new URL(e.notification.data?.url || url.href, url);
    if (destination.origin === url.origin || (destination.origin === "https://inflite.ai" && destination.pathname === "/status/")) {
      url.hash = destination.hash;
    }
  } catch { /* Fall back to the status overview. */ }
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window" });
    const w = wins.find((client) => {
      const page = new URL(client.url);
      return client.frameType !== "nested" && page.origin === url.origin &&
        (page.pathname === url.pathname || page.pathname === url.pathname + "index.html");
    });
    if (w) { await w.focus(); return w.navigate ? w.navigate(url.href).catch(() => w.postMessage({ go: url.hash })) : w.postMessage({ go: url.hash }); }
    return self.clients.openWindow(url.href);
  })());
});
