// Weather's own copy of itself, which is what makes it open at once (and offline): each version's files, fetched
// together as it's installed, so a page and its scripts and styles always match, and given from here straight away,
// with no wait on the network. A new version is looked for as the app's opened (app.js), installed alongside, and
// started on there and then (or the next time it's opened: app.js). Anything of its own not kept yet is fetched (the
// browser's own cache skipped, so it's never an old copy) and kept with this version. The map's libraries (vendor/),
// which change far less often, are kept apart, across versions (LIBS: renamed when they're updated). The forecast
// itself is kept by the page (data.js), never here. And its notifications: rain alerts and the morning briefing
// (functions/_wxpush.js).
const CACHE = "wx-2.13.4", LIBS = "wx-libs-maplibre-6.12.0-leaflet-1.9.4-public";
// (the sky's colour at its top as it last was, kept by the page (app.js sky), written into the page as it's given here, as
// its theme-color: an iPhone tints the strip behind its status bar with the page's theme-color as it arrives, and takes
// no notice of it changed after; kept apart, across versions)
const TINT = "wx-tint";
const SHELL = ["./", "./early.js", "./styles.css", "./boot.js", "./app.js", "./location.js", "./detail.js", "./settings.js", "./data.js", "./insights.js", "./format.js", "./codes.js", "./climate.js", "./sky.js", "./charts.js", "./icons.js", "./skill.js", "./radar.js", "./radarrain.js", "./rainmap.js", "./radarmix.js", "./radarwork.js", "./mapgl.js", "./mapstyle.js", "./mapleaf.js", "./official.js", "./agree.js", "./solar.js", "./account.js", "./send.js", "./manifest.webmanifest", "./icon.svg", "./icon-192.png"];

// Each file's fingerprint (SHA-256, base64), and the page marked with its version (index.html app-version): written by
// .tools/wxshell.mjs, checked by the tests. As it's installed, every file fetched is checked against them, so a phone
// only ever keeps a whole version: straight after a release, a server can hand out a mix of the old and the new for a
// moment, and kept, that mix would stay (an old radar.js in a new page, say) until the next.
const SUMS = {"./early.js":"GeWYkfeEtGth/EvvZ+CynY8no/hJJA22rW1VeosJf14=","./styles.css":"Q0GEPCQEuXE4VdB2y/YcPgsGTNh4mI0lWm/4f9A/Y3E=","./boot.js":"0625VwnuhklBncp/LM1Z8ocwHyUTSNSrB/NYFrKDeBM=","./app.js":"zGrZhEs/ouoNnVcFLzCrdABiUVf1Za5twJ3MLjJ3HBU=","./location.js":"rmCxSTYGQL0qGToGQwpSwt0ztIS+FT6USDoJnzI9Lk4=","./detail.js":"wc8d6B7ha9M3DPa8jBoJYeXUL8g61RI8AhmG61RhfLs=","./settings.js":"yhHCQK5oJKFDyd/ntLuRzvgYxnJGpCM6pz70yp7DXJ0=","./data.js":"eCOCL8Jz5C8RK8GtKwmegDuzzMtjkmlwY/9Frup6tMg=","./insights.js":"hJpUqqlkMOqd/3c16ZC9UbSnNU1UAdzTNMM48JFDa9M=","./format.js":"jn8oG8NB6xCRakbYdd80Tt++uLxVF2avsEIHiSZDsL4=","./codes.js":"dllq/dnHuCOWsS6RTwkqDkR4kYsp1Cf3vHCz7RjoxMA=","./climate.js":"OYnesUonPix6ndrjmBSQSqTaDFbolSKe1DDOQXu+l9w=","./sky.js":"RecpRXnB4LaQS+csAbFTHoWZEbi+XIdwa/ON2rw1lhw=","./charts.js":"Yej8rJUbUu+zV1HZyKxk+kdyI9srIX7yRXsBLY4FerQ=","./icons.js":"pgIfYXOImmUYOMiuNh2PL4hx1eKY5iVop3sa0tES7I0=","./skill.js":"gkAM68aJWQi1UFM2T07Q3SV5lwxyUf+CkCN2PRJBXfI=","./radar.js":"6Hz1uY5D/tliet9mUAEGwZZJt8ubFO8OrSV6ckW7ic0=","./radarrain.js":"BxlKFxSebY7aevLvv6USs5dt4F+XYVdlnwONFuUNpc8=","./rainmap.js":"AbdC5/JghsAuJIWgKlhwtl+putW40xbw521LbZJ28Ak=","./radarmix.js":"oQbg1m7vmQZtUHrU9ltZHUgEVcBB+A01unX+FJMGYjs=","./radarwork.js":"SWTcX26JnER0wRubKmKdd6X+UOPh0eG63ZAFaCLIK18=","./mapgl.js":"Mj7Jh4ccLWTtszJqdqNUso8ZO5kmQgzFPkHHynHGTLs=","./mapstyle.js":"l98jKbYlemzdupyKkH+kAX650NA7KRzOsC59n2or4i4=","./mapleaf.js":"fc9mrpGVtp3R/8p8zP2rVZtYdvl5Klas4+KXjRRYl9g=","./official.js":"klGkZyNJCWbPf3CJtoZhtrYdXyJmOnMEODO8NQ4/kec=","./agree.js":"axi1t0IPY9qi2texIqP/4OnyU7gzD2/dOZfJ40jDi4I=","./solar.js":"/HqTx8LIQm2x79Wx4sWPDv5rjr7LmD6H8NhZRVeKaGs=","./account.js":"wA6hUOAiHwcYjjv43L0RV6HoKP/cRqaxxyPJANh6kj0=","./send.js":"zJ9ZrBX4DGnRkOxgHZySTYlp4FYt7rKR4Wismp/syBk=","./manifest.webmanifest":"23Anp9S8qC7GlLB69suHk7PJ8JfhFoqBuJCYAyI+skE=","./icon.svg":"Mfwc5OH4F6BLd/7oUJGzE93BUHpdA9pP8ngJdHx/4GE=","./icon-192.png":"XB9hcjlwHuXlvCewcQrfsEaciriz+kH8TaL/9PN19eE="};
const sum = async (buf) => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest("SHA-256", buf))));
// (all of it or none: a version that couldn't all be fetched whole, on a poor connection or mid-release say, isn't
// started, so the last whole one carries on, offline too, and it's tried again next time)
// (the updater every app shares, about to load a new version: a new version's worker is installed with all its files
// before it's asked this, so there's nothing more to fetch: IFL.updates)
self.addEventListener("message", (e) => { if (e.data?.ifl === "renew") e.ports[0]?.postMessage({ ifl: "renewed" }); });
self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    // (each file as the browser has it already, if it does, not even checked with the server: the page has just been
    // sent most of them, and a version before had many the same; only one that isn't this version's, by its
    // fingerprint (the page: by its version), or isn't to hand, is fetched, checked with the server first; and one
    // with no fingerprint always is)
    const take = async (u, cache) => {
      const res = await fetch(new Request(u, { cache, credentials: "omit", redirect: "error" }));
      if (!publicWeatherFile(u, res)) throw new Error(`${u}: unusable shell response`);
      const body = await res.clone().arrayBuffer();
      const whole = u === "./" ? new TextDecoder().decode(body).includes(`name="app-version" content="${CACHE}"`) : !SUMS[u] || (await sum(body)) === SUMS[u];
      return whole ? res : null;
    };
    const got = await Promise.all(SHELL.map(async (u) => {
      const res = (u === "./" || SUMS[u] ? await take(u, "force-cache").catch(() => null) : null) || (await take(u, "no-cache"));
      if (!res) throw new Error(`${u} isn't ${CACHE}'s`);
      return [u, res];
    }));
    const c = await caches.open(CACHE);
    await Promise.all(got.map(([u, res]) => c.put(u, res)));
    await self.skipWaiting();
  })());
});
// (a new version started: the last ones' copies let go, Weather's own alone (wx-…): at InFlite's hub, Weather shares its
// address with Today, Chats and the rest, each keeping copies of its own beside Weather's, which are theirs to keep)
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("wx-") && k !== CACHE && k !== LIBS && k !== TINT).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
function publicWeatherFile(path, response) {
  if (!response || response.status !== 200 || response.redirected ||
      /(?:^|,)\s*no-store\b/i.test(response.headers.get("Cache-Control") || "")) return false;
  const type = (response.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (/\.m?js$/.test(path)) return /^(?:application|text)\/(?:javascript|ecmascript)$/.test(type);
  if (path.endsWith(".css")) return type === "text/css";
  if (path === "./") return type === "text/html";
  if (path.endsWith(".webmanifest")) return type === "application/manifest+json" || type === "application/json";
  return type.startsWith("image/");
}
const weatherFiles = new Set([
  ...SHELL.map(file => file.slice(2)), "inflite.svg", "alerts.js",
  "icon-180.png", "icon-512.png", "icon-maskable-512.png", "og.jpg"
]);
const mapFiles = new Set([
  "vendor/leaflet.css", "vendor/leaflet.js", "vendor/maplibre-gl.css",
  "vendor/maplibre-gl.mjs", "vendor/maplibre-gl-worker.mjs", "vendor/maplibre-gl-shared.mjs"
]);
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url), scope = new URL(self.registration.scope);
  if (req.method !== "GET" || req.headers.has("Authorization") || req.headers.has("Range") || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const path = url.pathname.slice(scope.pathname.length), page = req.mode === "navigate";
  const library = mapFiles.has(path);
  if (page ? path !== "" && path !== "index.html" : !path || url.search || !(library || weatherFiles.has(path))) return;
  e.respondWith((async () => {
    // Location parameters belong to the open page. Only fetch and keep its public shell.
    const key = page ? scope.href : url.href;
    const cache = await caches.open(library ? LIBS : CACHE).catch(() => null);
    const kept = await cache?.match(key).catch(() => null);
    const file = page ? "./" : path;
    if (publicWeatherFile(file, kept)) return page ? tinted(kept) : kept;
    const res = await fetch(key, { cache: "no-cache", credentials: "omit", redirect: "error" });
    if (cache && res.type === "basic" && publicWeatherFile(file, res)) {
      e.waitUntil(cache.put(key, res.clone()).catch(() => {}));
    }
    return page && res.ok ? tinted(res) : res;
  })());
});

// (the page, its theme-color the sky's as it last was, if there's one kept)
async function tinted(res) {
  try {
    const t = await (await (await caches.open(TINT)).match(new URL("./tint", self.registration.scope)))?.text();
    if (!["#101210", "#f8f9f6"].includes(t)) return res;
    const html = (await res.clone().text()).replace(/<meta name="theme-color"[^>]*>/g, (meta) =>
      meta.replace(/content="[^"]*"/, `content="${meta.includes('(prefers-color-scheme: dark)') ? '#101210' : '#f8f9f6'}"`));
    const headers = new Headers(res.headers); headers.delete("content-length");
    return new Response(html, { status: res.status, statusText: res.statusText, headers });
  } catch (_) { return res; }
}

// a notification: { title, body, tag, url }
// (one taking the place of another with its tag, still showing, comes with its sound all the same: rain on its way, a
// warning raised to amber)
self.addEventListener("push", (e) => {
  let n = {};
  try { n = e.data ? e.data.json() : {}; } catch (_) { n = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(n.title || "Weather", { body: n.body || "", tag: n.tag || undefined, renotify: n.tag === "rain" || /^warn:/.test(n.tag || ""), icon: "./icon-192.png", badge: "./icon-192.png", data: { url: n.url || "./" } }));
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
