// Weather's own API (the forecast itself comes straight from Open-Meteo, in the browser).
//   GET  /api/weather/where        roughly where you are, from your connection (Cloudflare's guess,
//                                  to the city), so a first visit opens on somewhere near without
//                                  asking for your location. Nothing is kept.
//   GET  /api/weather/obs          the nearest airport's daily highs and lows (functions/_wxobs.js)
//   GET  /api/weather/warnings     official warnings for a place, from its weather service (functions/_wxwarn.js)
//   GET  /api/weather/key          the key push subscriptions are made with
//   POST /api/weather/subscribe    rain alerts, official warnings and a morning briefing for your places (functions/_wxpush.js)
//   POST /api/weather/unsubscribe
//   POST /api/weather/leave           a device signed out of its account elsewhere: its notifications its own
//   GET  /api/weather/me           the site's account, as Weather has it: who, and your places, settings and
//   PUT  /api/weather/me           notifications kept with it (functions/_wxacct.js)
//   POST /api/weather/handback     signed in on the account's page, for Weather: its code swapped for the sign-in
//   POST /api/weather/signout
//   POST /api/weather/move         a phone's subscription replaced by its browser (weather/sw.js)
//   POST /api/weather/tick         send what's due (the scheduler: .github/workflows/weather-tick.yml)
//   GET  /api/weather/email-off    the link at the foot of Weather's emails: a button (GET only shows it, so mail
//   POST /api/weather/email-off    scanners that follow links turn nothing off); POST turns them off, and is the mail
//                                  app's own one-click Unsubscribe too (RFC 8058)
// Each connection can only ask so often (the shared database and Open-Meteo's quota are for everyone).
import { HttpError, limit, clientIp, HOUR, db, safeEqual, UUID_RE, logError, readCapped } from "../../_pigeon.js";
import { tickAuthOk } from "../../_notify.js";
import { linkOrigin } from "../../_email.js";
import { unsubscribe, moveSub, wxTick, maybeWxTick, publicKey, leaveAny } from "../../_wxpush.js";
import { ACCOUNT_ROUTES, subscribeHere, setMail } from "../../_wxacct.js";
import { isWeather } from "../../_wxapp.js";
import { obsFor } from "../../_wxobs.js";
import { warningsAt } from "../../_wxwarn.js";

// (an answer is data for this site's own pages, and nothing else: not to be framed, run, or read by another site)
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains", "Referrer-Policy": "no-referrer" } });

function where(request) {
  const cf = request.cf || {}, lat = Number(cf.latitude), lon = Number(cf.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return json({ error: "Unknown." }, 404);
  const name = cf.city || cf.region || cf.country || "Near you";
  const region = [cf.city ? cf.region : null, cf.country].filter(Boolean).join(", ");
  return json({ name, region, lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100, tz: cf.timezone || null });
}
// a page of this site asking (another site can't sign phones up); and where the browser carries the site's sign-in, it
// must say where it's from (as every browser does for these)
function sameOrigin(request) {
  const o = request.headers.get("Origin");
  if ((o && o !== new URL(request.url).origin) || (!o && /(^|;\s*)(__Secure-)?account=/.test(request.headers.get("Cookie") || ""))) throw new HttpError(403, "Not allowed.");
}
// a small JSON object, or nothing
async function body(request) {
  const text = new TextDecoder().decode(await readCapped(request, 8192, "Too big."));
  let b; try { b = JSON.parse(text || "{}"); } catch (_) { throw new HttpError(400, "Bad request."); }
  if (!b || typeof b !== "object" || Array.isArray(b)) throw new HttpError(400, "Bad request.");
  return b;
}
// ?lat=…&lon=… → [lat, lon], to two decimal places (about a kilometre)
function placeOf(request) {
  const q = new URL(request.url).searchParams, lat = Number(q.get("lat")), lon = Number(q.get("lon"));
  if (!q.has("lat") || !q.has("lon") || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new HttpError(400, "Bad place.");
  return [Math.round(lat * 100) / 100, Math.round(lon * 100) / 100];
}
// The page an email's turn-off link opens, in Weather's own look (its icon: at the root of Weather's address, else
// under /weather/)
function offPage(request, env, title, msg, form = "") {
  const app = isWeather(new URL(request.url), env) ? "/" : "/weather/";
  return new Response(`<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta name="color-scheme" content="light dark"><title>Weather Emails</title>
<style>
  :root{--bg:#f2f2f7;--label:#1c1c1e;--label-2:#6e6e73;--tint:#1f63d6}
  @media (prefers-color-scheme:dark){:root{--bg:#1c1c1f;--label:#f5f5f7;--label-2:#a1a1a6;--tint:#5aa0fa}}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px;background:var(--bg);color:var(--label);font:17px/1.35 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;letter-spacing:-.41px;-webkit-font-smoothing:antialiased}
  main{width:100%;max-width:380px;display:flex;flex-direction:column;align-items:center;text-align:center}
  img{width:88px;height:88px;border-radius:22px;box-shadow:0 10px 30px -10px rgba(43,105,222,.5);margin-bottom:22px}
  h1{margin:0 0 10px;font-size:28px;line-height:34px;font-weight:700;letter-spacing:.2px}
  p{margin:0 0 26px;color:var(--label-2);font-size:17px;line-height:23px;text-wrap:balance}
  form{width:100%}
  .btn{display:flex;align-items:center;justify-content:center;width:100%;min-height:52px;border:0;border-radius:999px;background:var(--tint);color:#fff;font:600 17px -apple-system,BlinkMacSystemFont,system-ui,sans-serif;text-decoration:none;cursor:pointer}
  .btn.plain{background:none;color:var(--tint);margin-top:6px}
</style></head>
<body><main><img src="${app}icon-192.png" alt=""><h1>${title}</h1><p>${msg}</p>${form || `<a class="btn" href="${app}">Open Weather</a>`}</main></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" } });
}
// whose emails the link's for: the account, and its own token (the one its other emails' links have: functions/_notify.js)
async function offUser(env, request) {
  const q = new URL(request.url).searchParams, id = q.get("u") || "", tok = q.get("t") || "";
  const u = UUID_RE.test(id) && tok ? await (await db(env)).prepare("SELECT id, unsub FROM pg_users WHERE id = ?").bind(id).first() : null;
  return u && u.unsub && safeEqual(u.unsub, tok) ? u : null;
}
const OFF_GONE = "This link doesn’t work any more. You can turn Weather’s emails off in its Settings, under Notifications.";
const ROUTES = {
  "GET where": ({ request }) => where(request),
  "GET obs": async ({ request, env }) => {
    const [lat, lon] = placeOf(request);
    await limit(env, `wxobs:${clientIp(request)}`, 60, HOUR);
    return json(await obsFor(env, lat, lon));
  },
  "GET warnings": async ({ request, env }) => {
    const [lat, lon] = placeOf(request);
    await limit(env, `wxwarn:${clientIp(request)}`, 120, HOUR);
    // (the feeds are taken a few minutes at a time anyway: the phone keeps its answer as long, rather than asking again,
    // and this server writing down each ask, as it opens and comes back to the app)
    const r = json(await warningsAt(env, lat, lon)); r.headers.set("Cache-Control", "private, max-age=180"); return r;
  },
  "GET key": async ({ env }) => json({ key: await publicKey(env) }),
  "POST subscribe": async ({ request, env }) => { sameOrigin(request); await limit(env, `wxsub:${clientIp(request)}`, 30, HOUR); return json(await subscribeHere(request, env, await body(request))); },
  "POST unsubscribe": async ({ request, env }) => { sameOrigin(request); return json(await unsubscribe(env, (await body(request)).endpoint)); },
  "POST leave": async ({ request, env }) => { sameOrigin(request); await limit(env, `wxsub:${clientIp(request)}`, 30, HOUR); return json(await leaveAny(env, (await body(request)).endpoint)); },
  "POST move": async ({ request, env }) => { sameOrigin(request); await limit(env, `wxsub:${clientIp(request)}`, 30, HOUR); return json(await moveSub(env, await body(request))); },
  "POST tick": async ({ request, env }) => { tickAuthOk(request, env, env.WEATHER_TICK_SECRET || env.PIGEON_TICK_SECRET); return json(await wxTick(env, Date.now(), linkOrigin(request))); },
  "GET email-off": async ({ request, env }) => {
    await limit(env, `wxoff:${clientIp(request)}`, 60, HOUR);
    if (!(await offUser(env, request))) return offPage(request, env, "Link expired", OFF_GONE);
    const q = new URL(request.url).search.replace(/"/g, "");
    return offPage(request, env, "Turn off Weather’s emails?", "You won’t get warnings or the morning briefing by email. Notifications on your phone aren’t affected.",
      `<form method="post" action="/api/weather/email-off${q}"><button class="btn">Turn Off Emails</button></form><a class="btn plain" href="${isWeather(new URL(request.url), env) ? "/" : "/weather/"}">Keep Them On</a>`);
  },
  "POST email-off": async ({ request, env }) => {
    await limit(env, `wxoff:${clientIp(request)}`, 60, HOUR);
    const u = await offUser(env, request);
    if (!u) return offPage(request, env, "Link expired", OFF_GONE);
    await setMail(env, u.id, { warn: false, brief: false });
    return offPage(request, env, "Emails turned off", "Weather won’t email you any more. You can turn them back on any time in its Settings, under Notifications.");
  },
  // (the account's only at Weather's own address: not the site's, nor a preview's)
  ...Object.fromEntries(Object.entries(ACCOUNT_ROUTES).map(([k, fn]) => [k, (ctx) => (isWeather(new URL(ctx.request.url), ctx.env) ? fn(ctx) : json({ error: "Not found." }, 404))])),
};

export async function onRequest(ctx) {
  const parts = [].concat(ctx.params.path || []), route = ROUTES[`${ctx.request.method} ${parts.join("/")}`];
  if (!route) return json({ error: "Not found." }, 404);
  // (the site's traffic keeps Weather's notifications going between the scheduler's late ticks: functions/_wxpush.js)
  if (ctx.env.DB && parts[0] !== "tick") ctx.waitUntil(maybeWxTick(ctx.env, linkOrigin(ctx.request)).catch((e) => logError(ctx.env, "weather tick (traffic)", e)));
  try { return await route(ctx); }
  catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    await logError(ctx.env, "weather api", e);
    return json({ error: "Something went wrong." }, 500);
  }
}
