// chat.inflite.ai: Chat, the app at the address's root.
// weather.inflite.ai: Weather, the same way (functions/_wxapp.js).
// fitness.inflite.ai: Fitness, the same way (functions/_fitapp.js).
// markets.inflite.ai: Markets, the same way (functions/_mktapp.js).
// account.inflite.ai: the account's own page, the same way (functions/_acctapp.js).
// (inflite.ai itself is kept for something else: not this project's.)
// The apps' old addresses on georgefarrowgreen.com (chat., weather., fitness., account.): on to the new ones, signed in
// still (functions/_hop.js). Every other address carries straight on (the home page).
import { serveApp, isChat, notFound } from "./_app.js";
import { oldApp, appOrigin, homeSite } from "./_sites.js";
import { hop, hopTo } from "./_hop.js";
import { cookieToken } from "./_account.js";
import { HttpError } from "./_http.js";
import { isWeather, weatherHost } from "./_wxapp.js";
import { isFitness, fitnessHost } from "./_fitapp.js";
import { isMarkets, marketsHost } from "./_mktapp.js";
import { isAccount, accountHost } from "./_acctapp.js";
import { accountPage } from "./_pigeon.js";
import { homePage } from "./_home.js";
import { assets } from "./_min.js";

export async function onRequest(ctx) {
  const url = new URL(ctx.request.url);
  // The repo root is the static output (wrangler.toml), so the source, notes and dotfiles are in it too.
  // They aren't part of the site. The asset server decodes and tidies a path before it looks, so this
  // checks the same path it will look for (/%62lokk/, //blokk/ and /%2Etools/ all mean the real thing).
  if (PRIVATE.test(plainPath(url.pathname))) return notFound();
  // An address written oddly (/%77eather/, //account/, a backslash) is sent to its plain self, so it's routed as that: the
  // per-app routes go by the address as written, and the asset server by its plain form, so /%77eather/ would otherwise be
  // Weather's page here, on the home page's origin, under its rules. (One that can't be read as an address isn't one.)
  if (!url.pathname.startsWith("/api/")) {
    const plain = plainPath(url.pathname);
    if (/%[^0-9a-f]|%[0-9a-f](?![0-9a-f])/i.test(url.pathname)) return notFound();
    if (plain !== url.pathname) return Response.redirect(new URL(plain + url.search, url).href, 301);
  }
  // the sign-in carried from one site to the other (functions/_hop.js)
  const step = /^\/api\/hop\/(start|issue|finish)$/.exec(url.pathname);
  if (step) {
    try { return await hop(ctx.request, ctx.env, step[1]); }
    catch (e) { if (e instanceof HttpError) return new Response(e.message, { status: e.status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } }); throw e; }
  }
  // the passkeys are georgefarrowgreen.com's: the apps on inflite.ai may use them (WebAuthn's related origins)
  if (url.pathname === "/.well-known/webauthn" && url.hostname === homeSite(ctx.env))
    return new Response(JSON.stringify({ origins: ["chat", "account", "weather", "fitness", "markets"].map((a) => appOrigin(a, ctx.env, ctx.request)) }),
      { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" } });
  // an app's old address: on to its new one
  const was = oldApp(url.hostname, ctx.env);
  if (was) return movedOn(ctx, url, was);
  if (isWeather(url, ctx.env)) return weatherHost(ctx, url);
  if (isFitness(url, ctx.env)) return fitnessHost(ctx, url);
  if (isMarkets(url, ctx.env)) return marketsHost(ctx, url);
  if (isAccount(url, ctx.env)) return accountHost(ctx, url);
  if (!isChat(url, ctx.env)) {
    // (the emails' pictures, every app's, are at /mail/ now: emails sent before still ask for them here)
    if (url.pathname.startsWith("/pigeon/mail/v2/")) return Response.redirect(`${url.origin}/mail/${url.pathname.slice(16)}`, 301);
    // (Chat's old admin dashboard: Admin's on the admin's account page now)
    if (/^\/pigeon\/admin(\/|$)/.test(url.pathname)) return Response.redirect(`${accountPage(ctx.request, ctx.env)}/#admin`, 302);
    // (the apps' icons, for the home page's Apps: kept with each app, and Weather's own address is its own host; asked
    // with the browser's own request, so a browser asking about the copy it has is told it's the same, kept a day more)
    if (APP_ICONS[url.pathname]) {
      const r = await ctx.env.ASSETS.fetch(new Request(new URL(APP_ICONS[url.pathname], url), ctx.request)), out = new Response(r.body, r);
      if (r.ok || r.status === 304) out.headers.set("Cache-Control", "public, max-age=86400");
      return out;
    }
    // (the home page's own script and styles minified, as every app's: functions/_min.js)
    const res = /^\/(app\.js|styles\.css)$/.test(url.pathname) && ["GET", "HEAD"].includes(ctx.request.method) ? await assets(ctx.env).fetch(ctx.request) : await ctx.next();
    // (the home page, with its words in it: functions/_home.js)
    if (!url.pathname.startsWith("/api/")) return homePage(ctx, url, res);
    // (the site's own API answers: never taken for anything but what they say they are)
    if (res.headers.get("X-Content-Type-Options")) return res;
    const r = new Response(res.body, res); r.headers.set("X-Content-Type-Options", "nosniff"); return r;
  }
  // here, only Chat's own API: the site's (its owner's sign-in, its content) stays on georgefarrowgreen.com
  if (url.pathname.startsWith("/api/")) return url.pathname.startsWith("/api/pigeon/") ? ctx.next() : notFound();
  // (Chat's admin: on the admin's account page)
  if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) return Response.redirect(`${accountPage(ctx.request, ctx.env)}/#admin`, 302);
  // an old address on the new host (a link from before, a notification): the same place, at the root
  if (url.pathname === "/pigeon" || url.pathname.startsWith("/pigeon/")) {
    const to = new URL(url); to.pathname = url.pathname.slice(7) || "/";
    return Response.redirect(to.href, 301);
  }
  // everything else is the app: /x is /pigeon/x
  if (/^\/handover(\.html)?$/.test(url.pathname)) return notFound();   // (the old address's, not this one's)
  const path = "/pigeon" + (url.pathname === "/index.html" ? "/" : url.pathname);
  const res = await assets(ctx.env).fetch(new Request(new URL(path + url.search, url), ctx.request));
  return serveApp(ctx, res, path, true);
}

// An app's old address (chat.georgefarrowgreen.com, and so on): every page on to the same place at its new one, signed
// in still (a hop, if the browser was signed in here); its service worker, a stand-in that only shows the notifications
// still sent to this address's subscription (so a phone that hasn't moved yet still gets them), and opens them at the
// new address; its API as before for a page that's still open from before, until it's reloaded
async function movedOn(ctx, url, app) {
  if (url.pathname.startsWith("/api/")) {
    if (app === "weather") return weatherHost(ctx, url);
    if (app === "fitness") return fitnessHost(ctx, url);
    if (app === "account") return accountHost(ctx, url);
    return url.pathname.startsWith("/api/pigeon/") ? ctx.next() : notFound();
  }
  if (url.pathname === "/sw.js") return forwardWorker(app, appOrigin(app, ctx.env, ctx.request));
  const to = appOrigin(app, ctx.env, ctx.request) + url.pathname + url.search;
  const nav = ctx.request.method === "GET" && ctx.request.headers.get("Sec-Fetch-Dest") !== "script";
  return Response.redirect(nav && cookieToken(ctx.request, ctx.env) ? hopTo(to, ctx.request, ctx.env) : to, 302);
}
const NAMES = { chat: "Chat", weather: "Weather", fitness: "Fitness", account: "Account" };
// (prefix: where the old one's pages were: Chat's under /pigeon/ on the home page)
export function forwardWorker(app, to, prefix = "") {
  const js = `// ${NAMES[app]} has moved to ${to}. This worker stands in for the old one at this address: it shows the notifications
// still sent here, opens them at the new address, and keeps nothing (so the pages here go on to the new one).
const TO = ${JSON.stringify(to)}, NAME = ${JSON.stringify(NAMES[app])}, PREFIX = ${JSON.stringify(prefix)};
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => { for (const k of await caches.keys()) await caches.delete(k); await self.clients.claim(); })()));
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || NAME, { body: d.body || "", tag: d.tag || undefined, renotify: !!d.tag, icon: TO + "/icon-192.png", badge: TO + "/icon-192.png", data: { url: d.url || "" } }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const u = new URL(e.notification.data?.url || "./", self.registration.scope);
  let to = TO + "/";
  if (u.origin === self.location.origin) to = TO + (PREFIX && u.pathname.startsWith(PREFIX) ? u.pathname.slice(PREFIX.length - 1) : u.pathname) + u.search + u.hash;
  else if (u.origin === TO) to = u.href;
  e.waitUntil(self.clients.openWindow(to));
});
`;
  return new Response(js, { headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache", "Service-Worker-Allowed": "/" } });
}

const APP_ICONS = { "/apps/inflight.png": "/pigeon/icon-180.png", "/apps/weather.png": "/weather/icon-180.png", "/apps/fitness.png": "/fitness/icon-180.png", "/apps/markets.png": "/markets/icon-180.png" };
const PRIVATE = /^\/(\.(?!well-known\/)|blokk(\/|$)|block(\/|$)|workers(\/|$)|min(\/|$)|readme\.md$|wrangler\.toml$)/i;
function plainPath(p) {
  for (let i = 0; i < 4; i++) { let d; try { d = decodeURIComponent(p); } catch (_) { break; } if (d === p) break; p = d; }
  p = p.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  try { return new URL(p, "http://x").pathname.replace(/\/{2,}/g, "/"); } catch (_) { return p; }
}
