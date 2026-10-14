// Weather for InFlight's pigeons. At take-off the server asks Open-Meteo (free,
// no key) for the wind at a few points along each route; the part of it
// blowing the pigeon's way speeds it up, and a headwind slows it down. Only
// points along the route are sent, never who's flying. If the forecast doesn't
// answer quickly, the pigeon simply flies at its usual speed. The points are
// snapped to a quarter-degree grid (about 28 km) first, and each square's
// weather is kept for 10 minutes, so Open-Meteo never sees where a route
// starts or ends, and a busy sky asks it once.
//
// Storms slow it too: it sits out thunder, picks its way through heavy rain,
// snow and fog, and fights gales. The worst spot along the way is kept (what
// and where, never who) so the phone can say "Delayed 40 min by storms over
// the Alps".
//
// Before you send, the next day's forecast along the way says whether it's
// worth waiting for the weather to clear (forecastFor); a pigeon booked to
// land later flies through the weather forecast for when it takes off.
//
// WEATHER_URL: tests only.

import { HOUR, SPEED_KMH, gcPoint, db, chunks } from "./_pigeon.js";

const POINTS = [0.1, 0.3, 0.5, 0.7, 0.9];      // where along the route to look
const MIN_F = 0.6, MAX_F = 1.6;                  // even a gale only does so much (over the whole way)
const GALE = 60;                                 // gusts (km/h) a pigeon has to fight
const CELL = 0.25, WX_TTL = 10 * 60e3;           // the grid points are snapped to, and how long a square's weather is kept
const snap = (v) => Math.round(v / CELL) * CELL;

// What the sky is doing at one point (WMO weather code, gusts), and how much
// of its speed a pigeon keeps flying through it.
export function skyAt(code, gust) {
  let k = null, keep = 1;
  if (code >= 95) [k, keep] = ["storms", 0.7];
  else if (code === 75 || code === 86) [k, keep] = ["snow", 0.8];
  else if ((code >= 71 && code <= 77) || code === 85) [k, keep] = ["snow", 0.9];
  else if (code === 65 || code === 67 || code === 82) [k, keep] = ["rain", 0.85];
  else if ((code >= 61 && code <= 66) || code === 80 || code === 81) [k, keep] = ["rain", 0.93];
  else if (code === 45 || code === 48) [k, keep] = ["fog", 0.9];
  if (gust >= GALE) { keep *= 0.9; k = k || "gales"; }
  return { k, keep };
}
const r = Math.PI / 180;

// which way you face, flying from a toward b (degrees, 0 = north)
function bearing(aLat, aLon, bLat, bLon) {
  const y = Math.sin((bLon - aLon) * r) * Math.cos(bLat * r);
  const x = Math.cos(aLat * r) * Math.sin(bLat * r) - Math.sin(aLat * r) * Math.cos(bLat * r) * Math.cos((bLon - aLon) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}
// Wind on several routes at once (one request). routes: [[fromLat, fromLon, toLat, toLon], ...]
// Returns, for each, { wind: average tailwind in km/h (negative: headwind), f: speed factor,
// wx: the spot that changed its speed most, { k: what, lat, lon, at: how far along (0 to 1) }, or null }.
// The points looked at along each route, snapped to the grid, and which way the pigeon faces there.
function pointsOf(routes) {
  const pts = [];
  routes.forEach(([aLat, aLon, bLat, bLon], i) => {
    for (const f of POINTS) {
      const [lat, lon] = gcPoint(aLat, aLon, bLat, bLon, f), [nLat, nLon] = gcPoint(aLat, aLon, bLat, bLon, Math.min(1, f + 0.02));
      const sl = Math.max(-90, Math.min(90, snap(lat))), so = snap((lon + 540) % 360 - 180);
      pts.push({ i, f, lat: sl, lon: so === -180 ? 180 : so, head: bearing(lat, lon, nLat, nLon) });
    }
  });
  return pts;
}
const key = (p) => `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;
// What the weather at those points (w[k]: Open-Meteo's wind, gusts and weather
// code at pts[k]) does to each route.
function tally(routes, pts, list) {
  const sum = routes.map(() => ({ tail: 0, slow: 0, n: 0, lo: null, hi: null }));
  list.forEach((w, k) => {
    const speed = Number(w?.wind_speed_10m), from = Number(w?.wind_direction_10m);
    if (w?.wind_speed_10m == null || w?.wind_direction_10m == null || !Number.isFinite(speed) || !Number.isFinite(from)) return;
    // wind_direction is where it blows from; the pigeon gains what blows its way
    const tail = speed * Math.cos(((from + 180) - pts[k].head) * r);
    const sky = skyAt(Number(w.weather_code) || 0, Number(w.wind_gusts_10m) || 0);
    // each point stands for an equal stretch of the route: add up the time it takes
    const f = Math.min(MAX_F, Math.max(0.4, ((SPEED_KMH + tail) / SPEED_KMH) * sky.keep)), s = sum[pts[k].i];
    s.tail += tail; s.slow += 1 / f; s.n++;
    const k2 = f >= 1 ? "tailwind" : sky.k || "headwind";
    const here = { f, k: k2, lat: pts[k].lat, lon: pts[k].lon, at: pts[k].f };
    if (!s.lo || f < s.lo.f) s.lo = here;
    if (!s.hi || f > s.hi.f) s.hi = here;
  });
  return sum.map(({ tail, slow, n, lo, hi }) => {
    if (!n) return { wind: null, f: 1, wx: null };
    const f = Math.min(MAX_F, Math.max(MIN_F, n / slow)), worst = f < 1 ? lo : hi;   // the spot that did most of it
    return { wind: Math.round(tail / n), f, wx: Math.abs(Math.log(worst.f)) >= 0.05 ? { k: worst.k, lat: worst.lat, lon: worst.lon, at: worst.at } : null };
  });
}
export async function windsFor(env, routes) {
  const calm = routes.map(() => ({ wind: null, f: 1, wx: null }));
  if (!routes.length || env.WEATHER_OFF) return calm;
  const pts = pointsOf(routes);
  const cells = [...new Map(pts.map((p) => [key(p), p])).values()], got = new Map();
  // squares asked about lately (tests change the weather between pigeons, so they skip this)
  const D = await db(env), t = Date.now(), ttl = env.WEATHER_URL ? 0 : WX_TTL;
  if (ttl) for (const part of chunks(cells.map(key), 90)) {
    const { results } = await D.prepare(`SELECT cell, w FROM pg_wxcache WHERE at > ? AND cell IN (${part.map(() => "?").join(",")})`).bind(t - ttl, ...part).all();
    for (const row of results) try { got.set(row.cell, JSON.parse(row.w)); } catch (_) {}
  }
  const ask = cells.filter((p) => !got.has(key(p)));
  if (ask.length) {
    let data;
    try {
      const u = new URL(`${env.WEATHER_URL || "https://api.open-meteo.com"}/v1/forecast`);
      u.searchParams.set("latitude", ask.map((p) => p.lat).join(",")); u.searchParams.set("longitude", ask.map((p) => p.lon).join(","));
      u.searchParams.set("current", "wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code"); u.searchParams.set("wind_speed_unit", "kmh");
      const res = await fetch(u, { signal: AbortSignal.timeout(2500), headers: { Accept: "application/json" } });
      if (!res.ok) return calm;
      data = await res.json();
    } catch (_) { return calm; }
    const fresh = Array.isArray(data) ? data : [data];
    if (fresh.length !== ask.length) return calm;
    const keep = [];
    ask.forEach((p, k) => {
      const c = fresh[k]?.current; if (!c) return;
      const w = { current: { wind_speed_10m: c.wind_speed_10m, wind_direction_10m: c.wind_direction_10m, wind_gusts_10m: c.wind_gusts_10m, weather_code: c.weather_code } };
      got.set(key(p), w); keep.push(D.prepare("INSERT OR REPLACE INTO pg_wxcache (cell, at, w) VALUES (?, ?, ?)").bind(key(p), t, JSON.stringify(w)));
    });
    if (keep.length) await D.batch(keep).catch(() => {});
  }
  return tally(routes, pts, pts.map((p) => got.get(key(p))?.current));
}

// The weather along each route for the next `hours`, hour by hour, from
// Open-Meteo's forecast: for each route a list of { at (the hour), wind, f, wx },
// as windsFor would find it then; null if the forecast didn't answer. The same
// squares of sky (never who's flying), and an hour's forecast for a set of
// squares is kept for everyone for half an hour.
export async function forecastFor(env, routes, hours = 24) {
  const none = routes.map(() => null);
  if (!routes.length || env.WEATHER_OFF) return none;
  const pts = pointsOf(routes), cells = [...new Map(pts.map((p) => [key(p), p])).values()];
  const h0 = Math.floor(Date.now() / HOUR) * HOUR;
  const cache = typeof caches !== "undefined" && !env.WEATHER_URL ? caches.default : null;
  const ck = new Request(`https://inflight-forecast.cache/v1/${h0}/${hours}/${cells.map(key).sort().join(";")}`);
  let list = null;
  try { const hit = cache && await cache.match(ck); if (hit) list = await hit.json(); } catch (_) {}
  if (!list) {
    try {
      const u = new URL(`${env.WEATHER_URL || "https://api.open-meteo.com"}/v1/forecast`);
      u.searchParams.set("latitude", cells.map((p) => p.lat).join(",")); u.searchParams.set("longitude", cells.map((p) => p.lon).join(","));
      u.searchParams.set("hourly", "wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code"); u.searchParams.set("forecast_hours", String(hours));
      u.searchParams.set("timeformat", "unixtime"); u.searchParams.set("wind_speed_unit", "kmh");
      const res = await fetch(u, { signal: AbortSignal.timeout(3000), headers: { Accept: "application/json" } });
      if (!res.ok) return none;
      const d = await res.json(); list = (Array.isArray(d) ? d : [d]).map((x) => x?.hourly || null);
    } catch (_) { return none; }
    if (list.length !== cells.length || !Array.isArray(list[0]?.time)) return none;
    if (cache) await cache.put(ck, new Response(JSON.stringify(list), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=1800" } })).catch(() => {});
  }
  const byCell = new Map(cells.map((p, k) => [key(p), list[k]])), times = list[0].time, out = routes.map(() => []);
  for (let h = 0; h < times.length; h++) {
    const ws = pts.map((p) => { const H = byCell.get(key(p)); return H && { wind_speed_10m: H.wind_speed_10m?.[h], wind_direction_10m: H.wind_direction_10m?.[h], wind_gusts_10m: H.wind_gusts_10m?.[h], weather_code: H.weather_code?.[h] }; });
    tally(routes, pts, ws).forEach((x, i) => out[i].push({ at: times[h] * 1000, ...x }));
  }
  return out;
}
// The forecast hour a time falls in (or null: beyond the forecast).
export const hourOf = (fc, t) => (fc || []).find((x) => t >= x.at && t < x.at + HOUR) || null;
