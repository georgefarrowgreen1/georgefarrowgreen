// Weather's own copy of itself, which is what makes it open at once (and offline): each version's files, fetched
// together as it's installed, so a page and its scripts and styles always match, and given from here straight away,
// with no wait on the network. A new version is looked for as the app's opened (app.js), installed alongside, and
// started on there and then (or the next time it's opened: app.js). Anything of its own not kept yet is fetched (the
// browser's own cache skipped, so it's never an old copy) and kept with this version. The map's libraries (vendor/),
// which change far less often, are kept apart, across versions (LIBS: renamed when they're updated). The forecast
// itself is kept by the page (data.js), never here. And its notifications: rain alerts and the morning briefing
// (functions/_wxpush.js).
const CACHE = "wx-122", LIBS = "wx-libs-maplibre-6.12.0-leaflet-1.9.4";
// (the sky's colour at its top as it last was, kept by the page (app.js sky), written into the page as it's given here, as
// its theme-color: an iPhone tints the strip behind its status bar with the page's theme-color as it arrives, and takes
// no notice of it changed after; kept apart, across versions)
const TINT = "wx-tint";
const SHELL = ["./", "./early.js", "./styles.css", "./boot.js", "./app.js", "./detail.js", "./settings.js", "./data.js", "./insights.js", "./format.js", "./codes.js", "./climate.js", "./sky.js", "./charts.js", "./icons.js", "./skill.js", "./radar.js", "./rainmap.js", "./radarmix.js", "./radarwork.js", "./mapgl.js", "./mapstyle.js", "./mapleaf.js", "./official.js", "./agree.js", "./solar.js", "./account.js", "./manifest.webmanifest", "./icon.svg", "./icon-192.png"];

// Each file's fingerprint (SHA-256, base64), and the page marked with its version (index.html app-version): written by
// .tools/wxshell.mjs, checked by the tests. As it's installed, every file fetched is checked against them, so a phone
// only ever keeps a whole version: straight after a release, a server can hand out a mix of the old and the new for a
// moment, and kept, that mix would stay (an old radar.js in a new page, say) until the next.
const SUMS = {"./early.js":"QwZutt1hzVF2gfANycNFJlkoXKIFSgdwVaDoM9oVA/4=","./styles.css":"AJ0whW0rXC5EH/hDC8fQyuSRF3cj1SBfmr3um7zK+wM=","./boot.js":"ELKWJjWZkNCpR7f14Qc1UBD+W/wmeQauPhSlsD/sXvg=","./app.js":"WigxN5GzoG+ag5mulg7eaf8dt+rP32al6h9N7IKqgEc=","./detail.js":"yO3ZO2sMSbuCa+3xOyZDXZqEg/lOLrFjMVSmGD5xs3o=","./settings.js":"qeJ/GMzYEavIDExi+uteFb+nVBOOt7FOfEwCwWamPzM=","./data.js":"pXymaONjZNWdeZ11e64rwK+eWudCn26dOwFi1yvKDR4=","./insights.js":"nx5oPBQaZBoa6BoiI1a+L+0za9SXWXSBCt2NXTuCbvg=","./format.js":"66QoA5l590GLjJhiY+zt9579ElvnQPEWjD/tsDRjzUk=","./codes.js":"Qw+P/tk+Fm4B4HZQYs6Sw5I3tf+OfSI1zR8gwfQ5GAQ=","./climate.js":"vvS04Tl+urBQYmy5sOxnbMVAsse8becd7y/4sl93GFc=","./sky.js":"EoIVxUSsCs8vhhIJiMiyMXsAZDB0fX9DuupXEXNb1E4=","./charts.js":"j1dj+Q6r34AJ8hwsaUqC4mp1akaOBuvvN7GrHLl64mI=","./icons.js":"wM9mGeSi50m1pmyLjLM+FqS543CCh0gZdBRo63c5RGY=","./skill.js":"OrlD82LcGyGa38PtjDKQ30o1rcrIc1hMLdvdThq8/JI=","./radar.js":"9lu4P8GpP3UV2OHkn2SB1Nmg9Ag0a0cbxGVWk2T+wwM=","./rainmap.js":"cEwzJr+XFXLpPOKydSMpleqMg4D6V7ZfdZ/r2rR8gTo=","./radarmix.js":"3dzLtoup0LZ6h82r0+uhHflaAhOR4+w/4ISzoiKIxlU=","./radarwork.js":"wTSrwvIQFeaVK+0JhMLYNMz6qlOivvdRa4K7CRGKtj8=","./mapgl.js":"WYXpQGPHK3/NnVmEboRmuIH5gxt+rSMwMUgWLUO0TE0=","./mapstyle.js":"IQzVk7pxetkcD610NxcDDBwexOatE9ZUztWU0ZkhKiI=","./mapleaf.js":"pVQhks/T/zwCWnRaqEkHNrFc8IxNLgOEZnWOf/kQBDE=","./official.js":"MBuFZNOiZcpKKkDtx0wAdXNSHQB9gTsifrzihmSGyPM=","./agree.js":"0v3AvNHf+LqpuOB9ib6sW/FX1nhELM0WBcuFFC7Gym4=","./solar.js":"ppxEOzvANRbjhTufd83PThvXjRmLq4eI8bbhfeW+8rM=","./account.js":"fSkJPsBfdl0jvOwApRPDnN514aloK/4pN0UVOxwXLVg=","./manifest.webmanifest":"9HNM4pGFRMMXh2W2fTLh9y+sv0KqeaPpbO46fSbH1UQ=","./icon.svg":"Mfwc5OH4F6BLd/7oUJGzE93BUHpdA9pP8ngJdHx/4GE=","./icon-192.png":"XB9hcjlwHuXlvCewcQrfsEaciriz+kH8TaL/9PN19eE="};
const sum = async (buf) => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest("SHA-256", buf))));
// (all of it or none: a version that couldn't all be fetched whole, on a poor connection or mid-release say, isn't
// started, so the last whole one carries on, offline too, and it's tried again next time)
self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const got = await Promise.all(SHELL.map(async (u) => {
      // (checked with the server, not fetched afresh: a file the page has just been sent comes back as "the same", not a
      // second time; each is still checked against its fingerprint below)
      const res = await fetch(new Request(u, { cache: "no-cache" }));
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
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== LIBS && k !== TINT).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request, u = new URL(req.url), page = req.mode === "navigate";
  if (req.method !== "GET" || u.origin !== self.location.origin || u.pathname.startsWith("/api/")) return;
  e.respondWith((async () => {
    // (a page is kept under the one address, not each link's own: those would pile up, and say where you've looked)
    const cache = await caches.open(u.pathname.includes("/vendor/") ? LIBS : CACHE), key = page ? "./" : req;
    const kept = await cache.match(key, { ignoreSearch: true });
    if (kept) return page ? tinted(kept) : kept;
    // (a page's own request can't take options; it's never kept by the browser anyway)
    const res = await (page ? fetch(req) : fetch(req, { cache: "no-cache" }));
    if (res.ok && res.type === "basic") cache.put(key, res.clone());
    return page && res.ok ? tinted(res) : res;
  })());
});

// (the page, its theme-color the sky's as it last was, if there's one kept)
async function tinted(res) {
  try {
    const t = await (await (await caches.open(TINT)).match(new URL("./tint", self.registration.scope)))?.text();
    if (!/^#[0-9a-f]{6}$/i.test(t || "")) return res;
    const html = (await res.clone().text()).replace(/(<meta name="theme-color" content=")[^"]*(")/, `$1${t}$2`);
    const headers = new Headers(res.headers); headers.delete("content-length");
    return new Response(html, { status: res.status, statusText: res.statusText, headers });
  } catch (_) { return res; }
}

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
