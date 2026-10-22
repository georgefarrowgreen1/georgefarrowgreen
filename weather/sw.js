// Weather's own copy of itself, which is what makes it open at once (and offline): each version's files, fetched
// together as it's installed, so a page and its scripts and styles always match, and given from here straight away,
// with no wait on the network. A new version is looked for as the app's opened (app.js), installed alongside, and
// started on there and then (or the next time it's opened: app.js). Anything of its own not kept yet is fetched (the
// browser's own cache skipped, so it's never an old copy) and kept with this version. The map's libraries (vendor/),
// which change far less often, are kept apart, across versions (LIBS: renamed when they're updated). The forecast
// itself is kept by the page (data.js), never here. And its notifications: rain alerts and the morning briefing
// (functions/_wxpush.js).
const CACHE = "wx-64", LIBS = "wx-libs-maplibre-6.12.0-leaflet-1.9.4";
const SHELL = ["./", "./styles.css", "./app.js", "./data.js", "./insights.js", "./format.js", "./codes.js", "./climate.js", "./sky.js", "./charts.js", "./icons.js", "./skill.js", "./radar.js", "./rainmap.js", "./radarmix.js", "./radarwork.js", "./mapgl.js", "./mapstyle.js", "./mapleaf.js", "./official.js", "./agree.js", "./account.js", "./manifest.webmanifest", "./icon.svg", "./icon-192.png"];

// Each file's fingerprint (SHA-256, base64), and the page marked with its version (index.html app-version): written by
// .tools/wxshell.mjs, checked by the tests. As it's installed, every file fetched is checked against them, so a phone
// only ever keeps a whole version: straight after a release, a server can hand out a mix of the old and the new for a
// moment, and kept, that mix would stay (an old radar.js in a new page, say) until the next.
const SUMS = {"./styles.css":"rIQ5FEauEWAdxqy72UW1kuTxVY9PVBJp+UpV8Drp1us=","./app.js":"AILiW1QZZ8loedCJn0bfttxoZlh/GxmCXBKRDnDdmaI=","./data.js":"8tparKF+n9FeCukgVBb2cwu1Hq9Xka/81MoMwmW1XIo=","./insights.js":"KnNBffTytajX6XBHQjrABPV6jF0CrV4HA0ExaWp00Oc=","./format.js":"66QoA5l590GLjJhiY+zt9579ElvnQPEWjD/tsDRjzUk=","./codes.js":"PHbbg+X5K7QHQ1W6W01b5Uwwzo2F+C4XTe66wcl4WEA=","./climate.js":"/s5LWNYNCwtbHzaRNXGVThLSqmRnsBY52fbvAU64NcM=","./sky.js":"EoIVxUSsCs8vhhIJiMiyMXsAZDB0fX9DuupXEXNb1E4=","./charts.js":"rl2oInROyjJ3YC8UKwePYuyebmy0UpT/d6Br1b+BC3w=","./icons.js":"daHVEiVbL28DTiJLhQiJyUhbUh+IYxxMpaCJik6HQWw=","./skill.js":"OrlD82LcGyGa38PtjDKQ30o1rcrIc1hMLdvdThq8/JI=","./radar.js":"lqOh5ciPuFZNBCPc9f1NwX/JUUWcgsSWp+TXZeDtEhg=","./rainmap.js":"+cYq+an5fufvDITDryfGFpaLwwxldKdwsAYT5gyHpHw=","./radarmix.js":"3dzLtoup0LZ6h82r0+uhHflaAhOR4+w/4ISzoiKIxlU=","./radarwork.js":"2SK0PwHcMjDdkAIeSxB64CDr6hNmLY2U0sDA/LPyHX0=","./mapgl.js":"U1eWnVwzVakbWsMUTKojySjGEKYDGwhVV0UBuZDw1WY=","./mapstyle.js":"osMN3spikruD4/zLawoAoxUkpAPE/wnzXxL+Qfnm+1k=","./mapleaf.js":"pVQhks/T/zwCWnRaqEkHNrFc8IxNLgOEZnWOf/kQBDE=","./official.js":"MBuFZNOiZcpKKkDtx0wAdXNSHQB9gTsifrzihmSGyPM=","./agree.js":"rZ/1Zsu8eMFq29fTzFwX8f+yZ5lfCGO0o8MwnB1IWwc=","./account.js":"q0Xq8OAwBFR50Tt5CzuV28kUG8SFuZOHyj7TARaqf2U=","./manifest.webmanifest":"9HNM4pGFRMMXh2W2fTLh9y+sv0KqeaPpbO46fSbH1UQ=","./icon.svg":"Mfwc5OH4F6BLd/7oUJGzE93BUHpdA9pP8ngJdHx/4GE=","./icon-192.png":"XB9hcjlwHuXlvCewcQrfsEaciriz+kH8TaL/9PN19eE="};
const sum = async (buf) => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest("SHA-256", buf))));
// (all of it or none: a version that couldn't all be fetched whole, on a poor connection or mid-release say, isn't
// started, so the last whole one carries on, offline too, and it's tried again next time)
self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const got = await Promise.all(SHELL.map(async (u) => {
      const res = await fetch(new Request(u, { cache: "reload" }));
      if (!res.ok) throw new Error(`${u}: ${res.status}`);
      const body = await res.clone().arrayBuffer();
      const whole = u === "./" ? new TextDecoder().decode(body).includes(`name="app-version" content="${CACHE}"`) : !SUMS[u] || (await sum(body)) === SUMS[u];
      if (!whole) throw new Error(`${u} isn't ${CACHE}'s`);
      return [u, res];
    }));
    const c = await caches.open(CACHE);
    await Promise.all(got.map(([u, res]) => c.put(u, res)));
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== LIBS).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request, u = new URL(req.url), page = req.mode === "navigate";
  if (req.method !== "GET" || u.origin !== self.location.origin || u.pathname.startsWith("/api/")) return;
  e.respondWith((async () => {
    // (a page is kept under the one address, not each link's own: those would pile up, and say where you've looked)
    const cache = await caches.open(u.pathname.includes("/vendor/") ? LIBS : CACHE), key = page ? "./" : req;
    const kept = await cache.match(key, { ignoreSearch: true });
    if (kept) return kept;
    // (a page's own request can't take options; it's never kept by the browser anyway)
    const res = await (page ? fetch(req) : fetch(req, { cache: "no-cache" }));
    if (res.ok && res.type === "basic") cache.put(key, res.clone());
    return res;
  })());
});

// a notification: { title, body, tag, url }
self.addEventListener("push", (e) => {
  let n = {};
  try { n = e.data ? e.data.json() : {}; } catch (_) { n = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(n.title || "Weather", { body: n.body || "", tag: n.tag || undefined, renotify: n.tag === "rain", icon: "./icon-192.png", badge: "./icon-192.png", data: { url: n.url || "./" } }));
});
// a tap opens the app on the place the notification was about (or brings an open copy forward)
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  let url = new URL(e.notification.data?.url || "./", self.registration.scope).href;
  if (!url.startsWith(self.registration.scope)) url = self.registration.scope;      // (only ever this app's own pages)
  e.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of open) if (c.url.startsWith(self.registration.scope) && "focus" in c) { await c.focus(); return c.navigate ? c.navigate(url) : null; }
    return self.clients.openWindow(url);
  })());
});

// the browser replaced this phone's subscription by itself: tell the server, so the notifications follow it
self.addEventListener("pushsubscriptionchange", (e) => {
  e.waitUntil((async () => {
    const was = e.oldSubscription?.endpoint;
    if (!was) return;
    let sub = e.newSubscription;
    if (!sub) {
      const { key } = await (await fetch("/api/weather/key")).json();
      const raw = atob(key.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((key.length + 3) % 4));
      sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, (c) => c.charCodeAt(0)) });
    }
    await fetch("/api/weather/move", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ was, sub: sub.toJSON() }) });
  })().catch(() => {}));
});
