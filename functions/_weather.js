// Weather for InFlight's pigeons. At take-off the server asks Open-Meteo (free,
// no key) for the wind at a few points along each route (120 m up, where
// pigeons fly, rather than at the ground); the part of it
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

import { HOUR, SPEED_KMH, gcPoint, db, chunks, haversineKm } from "./_pigeon.js";

// where along a route to look: a point every SAMPLE_KM or so (each in the middle of
// its stretch), POINTS_LEAST to POINTS_MOST of them, so a storm can't slip between
// What's asked of Open-Meteo: the wind where pigeons fly (120 m up; 10 m if that's
// missing), the gusts and the weather
const WIND_VARS = "wind_speed_120m,wind_direction_120m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code";
const SAMPLE_KM = 200, POINTS_LEAST = 5, POINTS_MOST = 12;
export const pointsFor = (km) => { const n = Math.min(POINTS_MOST, Math.max(POINTS_LEAST, Math.ceil(km / SAMPLE_KM))); return Array.from({ length: n }, (_, k) => (k + 0.5) / n); };
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
// (a route can bend: a path of points, sampled by distance along it)
function pointsOf(routes) {
  const pts = [];
  routes.forEach((route, i) => {
    const path = route.length === 4 && typeof route[0] === "number" ? [[route[0], route[1]], [route[2], route[3]]] : route;
    for (const f of pointsFor(lenOf(path))) {
      const [lat, lon] = alongPath(path, f), [nLat, nLon] = alongPath(path, Math.min(1, f + 0.02));
      const sl = Math.max(-90, Math.min(90, snap(lat))), so = snap((lon + 540) % 360 - 180);
      pts.push({ i, f, lat: sl, lon: so === -180 ? 180 : so, head: bearing(lat, lon, nLat, nLon) });
    }
  });
  return pts;
}
// the point a fraction f of the way along a path (by distance)
export function alongPath(path, f) {
  const seg = []; let total = 0;
  for (let k = 0; k < path.length - 1; k++) { const d = haversineKm(path[k][0], path[k][1], path[k + 1][0], path[k + 1][1]); seg.push(d); total += d; }
  let want = f * total;
  for (let k = 0; k < seg.length; k++) {
    if (want <= seg[k] || k === seg.length - 1) return gcPoint(path[k][0], path[k][1], path[k + 1][0], path[k + 1][1], seg[k] ? Math.min(1, want / seg[k]) : 0);
    want -= seg[k];
  }
  return [path[0][0], path[0][1]];
}
const key = (p) => `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;
// What the weather at those points (w[k]: Open-Meteo's wind, gusts and weather
// code at pts[k]) does to each route.
// One point's weather (as Open-Meteo gives it) for a pigeon heading `head`
// (degrees): its pace there (× its usual), the tailwind (km/h), and what the
// sky is doing (k). null if there's no weather for it.
export function paceAt(w, head) {
  const [sp, dir] = w?.wind_speed_120m != null && w?.wind_direction_120m != null ? [w.wind_speed_120m, w.wind_direction_120m] : [w?.wind_speed_10m, w?.wind_direction_10m];
  const speed = Number(sp), from = Number(dir);
  if (sp == null || dir == null || !Number.isFinite(speed) || !Number.isFinite(from)) return null;
  // wind_direction is where it blows from; the pigeon gains what blows its way
  const tail = speed * Math.cos(((from + 180) - head) * r);
  const sky = skyAt(Number(w.weather_code) || 0, Number(w.wind_gusts_10m) || 0);
  return { f: Math.min(MAX_F, Math.max(0.4, ((SPEED_KMH + tail) / SPEED_KMH) * sky.keep)), tail, k: sky.k };
}
function tally(routes, pts, list) {
  const sum = routes.map(() => ({ tail: 0, slow: 0, n: 0, lo: null, hi: null, storms: 0, storm: null }));
  list.forEach((w, k) => {
    const pace = paceAt(w, pts[k].head); if (!pace) return;
    const { tail, f } = pace, sky = { k: pace.k }, s = sum[pts[k].i];
    // each point stands for an equal stretch of the route: add up the time it takes
    s.tail += tail; s.slow += 1 / f; s.n++;
    if (sky.k === "storms") { s.storms++; if (!s.storm) s.storm = { lat: pts[k].lat, lon: pts[k].lon, at: pts[k].f }; }
    const k2 = f >= 1 ? "tailwind" : sky.k || "headwind";
    const here = { f, k: k2, lat: pts[k].lat, lon: pts[k].lon, at: pts[k].f };
    if (!s.lo || f < s.lo.f) s.lo = here;
    if (!s.hi || f > s.hi.f) s.hi = here;
  });
  return sum.map(({ tail, slow, n, lo, hi, storms, storm }) => {
    if (!n) return { wind: null, f: 1, wx: null, storms: 0, storm: null };
    const f = Math.min(MAX_F, Math.max(MIN_F, n / slow)), worst = f < 1 ? lo : hi;   // the spot that did most of it
    return { wind: Math.round(tail / n), f, wx: Math.abs(Math.log(worst.f)) >= 0.05 ? { k: worst.k, lat: worst.lat, lon: worst.lon, at: worst.at } : null, storms, storm };
  });
}
export async function windsFor(env, routes) {
  const calm = routes.map(() => ({ wind: null, f: 1, wx: null, storms: 0, storm: null }));
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
      u.searchParams.set("current", WIND_VARS); u.searchParams.set("wind_speed_unit", "kmh");
      const res = await fetch(u, { signal: AbortSignal.timeout(2500), headers: { Accept: "application/json" } });
      if (!res.ok) return calm;
      data = await res.json();
    } catch (_) { return calm; }
    const fresh = Array.isArray(data) ? data : [data];
    if (fresh.length !== ask.length) return calm;
    const keep = [];
    ask.forEach((p, k) => {
      const c = fresh[k]?.current; if (!c) return;
      const w = { current: Object.fromEntries(WIND_VARS.split(",").map((k) => [k, c[k]])) };
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
  const list = await hourlyFor(env, cells, hours);
  if (!list) return none;
  const byCell = new Map(cells.map((p, k) => [key(p), list[k]])), times = list[0].time, out = routes.map(() => []);
  for (let h = 0; h < times.length; h++) {
    const ws = pts.map((p) => hourAt(byCell.get(key(p)), h));
    tally(routes, pts, ws).forEach((x, i) => out[i].push({ at: times[h] * 1000, ...x }));
  }
  return out;
}
// One square's weather in hour h of its forecast
const hourAt = (H, h) => H && h >= 0 && h < H.time.length ? Object.fromEntries(WIND_VARS.split(",").map((k) => [k, H[k]?.[h]])) : null;
// Open-Meteo's forecast for some squares, hour by hour from this hour, `hours`
// of it: a list matching `cells` (null if it didn't answer). Kept for everyone
// for half an hour; asked a hundred squares at a time.
const ASK_EACH = 100;
async function hourlyFor(env, cells, hours) {
  const h0 = Math.floor(Date.now() / HOUR) * HOUR;
  const cache = typeof caches !== "undefined" && !env.WEATHER_URL ? caches.default : null;
  const parts = await Promise.all(chunks(cells, ASK_EACH).map(async (part) => {
    const ck = new Request(`https://inflight-forecast.cache/v1/${h0}/${hours}/${part.map(key).sort().join(";")}`);
    try { const hit = cache && await cache.match(ck); if (hit) { const kept = await hit.json(); const by = new Map(kept); return part.map((p) => by.get(key(p)) || null); } } catch (_) {}
    let list;
    try {
      const u = new URL(`${env.WEATHER_URL || "https://api.open-meteo.com"}/v1/forecast`);
      u.searchParams.set("latitude", part.map((p) => p.lat).join(",")); u.searchParams.set("longitude", part.map((p) => p.lon).join(","));
      u.searchParams.set("hourly", WIND_VARS); u.searchParams.set("forecast_hours", String(hours));
      u.searchParams.set("timeformat", "unixtime"); u.searchParams.set("wind_speed_unit", "kmh");
      const res = await fetch(u, { signal: AbortSignal.timeout(3000), headers: { Accept: "application/json" } });
      if (!res.ok) return null;
      const d = await res.json(); list = (Array.isArray(d) ? d : [d]).map((x) => x?.hourly || null);
    } catch (_) { return null; }
    if (list.length !== part.length || !list.every((x) => Array.isArray(x?.time))) return null;
    if (cache) await cache.put(ck, new Response(JSON.stringify(part.map((p, k) => [key(p), list[k]])), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=1800" } })).catch(() => {});
    return list;
  }));
  return parts.some((x) => !x) ? null : parts.flat();
}

// ---- the weather as the pigeon will meet it ----
// A pigeon on a long flight meets each stretch of sky hours after it leaves,
// so each point along its way is judged by the forecast for the hour it gets
// there (as far as FORECAST_HOURS ahead; past that, it isn't counted).
export const FORECAST_HOURS = 96;
const lenOf = (path) => { let k = 0; for (let i = 0; i < path.length - 1; i++) k += haversineKm(path[i][0], path[i][1], path[i + 1][0], path[i + 1][1]); return k; };
// The forecast along some paths, until `until`: { at(i, start, kmh) } gives
// path i's weather (as windsFor would) flown from `start` at kmh; null if the
// forecast didn't answer.
export async function skyAlong(env, paths, until) {
  if (!paths.length || env.WEATHER_OFF) return null;
  const pts = pointsOf(paths), cells = [...new Map(pts.map((p) => [key(p), p])).values()];
  const h0 = Math.floor(Date.now() / HOUR) * HOUR, hours = Math.min(FORECAST_HOURS, Math.max(1, Math.ceil((until - h0) / HOUR) + 1));
  const list = await hourlyFor(env, cells, hours);
  if (!list) return null;
  const byCell = new Map(cells.map((p, k) => [key(p), list[k]])), kms = paths.map(lenOf);
  return {
    at(i, start, kmh) {
      const mine = pts.filter((p) => p.i === i).map((p) => ({ ...p, i: 0 }));
      const ws = mine.map((p) => {
        const H = byCell.get(key(p)), eta = start + ((p.f * kms[i]) / kmh) * HOUR;
        return H ? hourAt(H, Math.max(0, Math.floor((eta - H.time[0] * 1000) / HOUR))) : null;
      });
      return tally([paths[i]], mine, ws)[0];
    },
  };
}
// The forecast at some points (each [lat, lon]), until `until`: { at(i, when) }
// gives point i's weather (as Open-Meteo has it) in the hour `when` falls in;
// null if the forecast didn't answer.
export async function skyAtPoints(env, pts, until) {
  if (!pts.length || env.WEATHER_OFF) return null;
  const snapped = pts.map(([lat, lon]) => { const so = snap((lon + 540) % 360 - 180); return { lat: Math.max(-90, Math.min(90, snap(lat))), lon: so === -180 ? 180 : so }; });
  const cells = [...new Map(snapped.map((p) => [key(p), p])).values()];
  const h0 = Math.floor(Date.now() / HOUR) * HOUR, hours = Math.min(FORECAST_HOURS, Math.max(1, Math.ceil((until - h0) / HOUR) + 1));
  const list = await hourlyFor(env, cells, hours);
  if (!list) return null;
  const byCell = new Map(cells.map((p, k) => [key(p), list[k]]));
  return { at: (i, when) => { const H = byCell.get(key(snapped[i])); return H ? hourAt(H, Math.max(0, Math.floor((when - H.time[0] * 1000) / HOUR))) : null; } };
}
// The weather along each of some flights ({ path, start, kmh }), as it will
// meet it. All in the next hour: the sky as it is now (windsFor). The forecast
// down: the sky now for those leaving now, calm for any leaving later.
export async function windsAlong(env, flights) {
  const t = Date.now(), paths = flights.map((f) => f.path), ends = flights.map((f) => f.start + (lenOf(f.path) / f.kmh) * HOUR);
  const soon = (f) => f.start <= t + HOUR;
  if (flights.every(soon) && Math.max(...ends) <= t + HOUR) return windsFor(env, paths);
  const sky = await skyAlong(env, paths, Math.max(...ends)).catch(() => null);
  if (sky) return flights.map((f, i) => sky.at(i, f.start, f.kmh));
  const now = await windsFor(env, paths);
  return flights.map((f, i) => (soon(f) ? now[i] : { wind: null, f: 1, wx: null, storms: 0, storm: null }));
}
// The forecast hour a time falls in (or null: beyond the forecast).
export const hourOf = (fc, t) => (fc || []).find((x) => t >= x.at && t < x.at + HOUR) || null;
