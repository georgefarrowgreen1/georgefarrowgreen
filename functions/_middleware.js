// chat.georgefarrowgreen.com: InFlight's new address, the app at the site's root.
// weather.georgefarrowgreen.com: Weather, the same way (functions/_wxapp.js).
// account.georgefarrowgreen.com: the account's own page, the same way (functions/_acctapp.js).
// Every other address carries straight on (the site, and InFlight at /pigeon/).
import { serveApp, isChat, notFound } from "./_app.js";
import { isWeather, weatherHost } from "./_wxapp.js";
import { isAccount, accountHost } from "./_acctapp.js";
import { accountPage } from "./_pigeon.js";
import { homePage } from "./_home.js";

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
  if (isWeather(url, ctx.env)) return weatherHost(ctx, url);
  if (isAccount(url, ctx.env)) return accountHost(ctx, url);
  if (!isChat(url, ctx.env)) {
    // (the emails' pictures, every app's, are at /mail/ now: emails sent before still ask for them here)
    if (url.pathname.startsWith("/pigeon/mail/v2/")) return Response.redirect(`${url.origin}/mail/${url.pathname.slice(16)}`, 301);
    // (InFlight's old admin dashboard: Admin's on the admin's account page now)
    if (/^\/pigeon\/admin(\/|$)/.test(url.pathname)) return Response.redirect(`${accountPage(ctx.request, ctx.env)}/#admin`, 302);
    // (the apps' icons, for the home page's Apps: kept with each app, and Weather's own address is its own host)
    if (APP_ICONS[url.pathname]) {
      const r = await ctx.env.ASSETS.fetch(new Request(new URL(APP_ICONS[url.pathname], url))), out = new Response(r.body, r);
      if (r.ok) out.headers.set("Cache-Control", "public, max-age=86400");
      return out;
    }
    const res = await ctx.next();
    // (the home page, with its words in it: functions/_home.js)
    if (!url.pathname.startsWith("/api/")) return homePage(ctx, url, res);
    // (the site's own API answers: never taken for anything but what they say they are)
    if (res.headers.get("X-Content-Type-Options")) return res;
    const r = new Response(res.body, res); r.headers.set("X-Content-Type-Options", "nosniff"); return r;
  }
  // here, only InFlight's own API: the site's (its owner's sign-in, its content) stays on georgefarrowgreen.com
  if (url.pathname.startsWith("/api/")) return url.pathname.startsWith("/api/pigeon/") ? ctx.next() : notFound();
  // (InFlight's admin: on the admin's account page)
  if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) return Response.redirect(`${accountPage(ctx.request, ctx.env)}/#admin`, 302);
  // an old address on the new host (a link from before, a notification): the same place, at the root
  if (url.pathname === "/pigeon" || url.pathname.startsWith("/pigeon/")) {
    const to = new URL(url); to.pathname = url.pathname.slice(7) || "/";
    return Response.redirect(to.href, 301);
  }
  // everything else is the app: /x is /pigeon/x
  if (/^\/handover(\.html)?$/.test(url.pathname)) return notFound();   // (the old address's, not this one's)
  const path = "/pigeon" + (url.pathname === "/index.html" ? "/" : url.pathname);
  const res = await ctx.env.ASSETS.fetch(new Request(new URL(path + url.search, url), ctx.request));
  return serveApp(ctx, res, path, true);
}

const APP_ICONS = { "/apps/inflight.png": "/pigeon/icon-180.png", "/apps/weather.png": "/weather/icon-180.png" };
const PRIVATE = /^\/(\.(?!well-known\/)|blokk(\/|$)|block(\/|$)|readme\.md$|wrangler\.toml$)/i;
function plainPath(p) {
  for (let i = 0; i < 4; i++) { let d; try { d = decodeURIComponent(p); } catch (_) { break; } if (d === p) break; p = d; }
  p = p.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  try { return new URL(p, "http://x").pathname.replace(/\/{2,}/g, "/"); } catch (_) { return p; }
}
