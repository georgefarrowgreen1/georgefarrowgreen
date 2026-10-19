// Weather's own API (the forecast itself comes straight from Open-Meteo, in the browser).
//   GET  /api/weather/where        roughly where you are, from your connection (Cloudflare's guess,
//                                  to the city), so a first visit opens on somewhere near without
//                                  asking for your location. Nothing is kept.
//   GET  /api/weather/obs          the nearest airport's daily highs and lows (functions/_wxobs.js)
//   GET  /api/weather/key          the key push subscriptions are made with
//   POST /api/weather/subscribe    rain alerts and a morning briefing for a place (functions/_wxpush.js)
//   POST /api/weather/unsubscribe
//   POST /api/weather/move         a phone's subscription replaced by its browser (weather/sw.js)
//   POST /api/weather/tick         send what's due (the scheduler: .github/workflows/weather-tick.yml)
// Each connection can only ask so often (the shared database and Open-Meteo's quota are for everyone).
import { HttpError, limit, clientIp, HOUR } from "../../_pigeon.js";
import { tickAuthOk } from "../../_notify.js";
import { subscribe, unsubscribe, moveSub, wxTick, publicKey } from "../../_wxpush.js";
import { obsFor } from "../../_wxobs.js";

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
// a page of this site asking (another site can't sign phones up)
function sameOrigin(request) {
  const o = request.headers.get("Origin");
  if (o && o !== new URL(request.url).origin) throw new HttpError(403, "Not allowed.");
}
// a small JSON object, or nothing
async function body(request) {
  if (Number(request.headers.get("Content-Length")) > 8192) throw new HttpError(413, "Too big.");
  const text = await request.text();
  if (text.length > 8192) throw new HttpError(413, "Too big.");
  let b; try { b = JSON.parse(text || "{}"); } catch (_) { throw new HttpError(400, "Bad request."); }
  if (!b || typeof b !== "object" || Array.isArray(b)) throw new HttpError(400, "Bad request.");
  return b;
}
const ROUTES = {
  "GET where": ({ request }) => where(request),
  "GET obs": async ({ request, env }) => {
    const q = new URL(request.url).searchParams, lat = Number(q.get("lat")), lon = Number(q.get("lon"));
    if (!q.has("lat") || !q.has("lon") || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new HttpError(400, "Bad place.");
    await limit(env, `wxobs:${clientIp(request)}`, 60, HOUR);
    return json(await obsFor(env, Math.round(lat * 100) / 100, Math.round(lon * 100) / 100));
  },
  "GET key": async ({ env }) => json({ key: await publicKey(env) }),
  "POST subscribe": async ({ request, env }) => { sameOrigin(request); await limit(env, `wxsub:${clientIp(request)}`, 30, HOUR); return json(await subscribe(env, await body(request))); },
  "POST unsubscribe": async ({ request, env }) => { sameOrigin(request); return json(await unsubscribe(env, (await body(request)).endpoint)); },
  "POST move": async ({ request, env }) => { sameOrigin(request); await limit(env, `wxsub:${clientIp(request)}`, 30, HOUR); return json(await moveSub(env, await body(request))); },
  "POST tick": async ({ request, env }) => { tickAuthOk(request, env, env.WEATHER_TICK_SECRET || env.PIGEON_TICK_SECRET); return json(await wxTick(env)); },
};

export async function onRequest(ctx) {
  const parts = [].concat(ctx.params.path || []), route = ROUTES[`${ctx.request.method} ${parts.join("/")}`];
  if (!route) return json({ error: "Not found." }, 404);
  try { return await route(ctx); }
  catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error("weather api", e && (e.stack || e.message));
    return json({ error: "Something went wrong." }, 500);
  }
}
