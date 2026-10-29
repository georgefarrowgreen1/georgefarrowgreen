// Weather for Chat's pigeons. At take-off the server asks Open-Meteo (free,
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
// The Earth too (_earth.js): each point's weather says if there's volcanic ash
// or wildfire smoke there (hz: gone around, like storms), and how much of its
// pace a magnetic storm leaves a pigeon there (mag).
//
// WEATHER_URL: tests only.

import { HOUR, SPEED_KMH, gcPoint, db, chunks, haversineKm } from "./_pigeon.js";
import { earthFor, hazardAt, kpAt, magKeep } from "./_earth.js";

// where along a route to look: a point every SAMPLE_KM or so (each in the middle of
// its stretch), POINTS_LEAST to POINTS_MOST of them, so a storm can't slip between
// What's asked of Open-Meteo: the wind where pigeons fly (80, 120 and 180 m up; 10 m if
// those are missing), the gusts and the weather, how unstable (CAPE) and wet the air is, and how warm;
// and the jet stream's wind (250 hPa, about 10 km up), which only rockets fly high enough to ride
const WIND_VARS = "wind_speed_120m,wind_direction_120m,wind_speed_80m,wind_direction_80m,wind_speed_180m,wind_direction_180m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,cape,precipitation,temperature_2m,wind_speed_250hPa,wind_direction_250hPa";
// Rockets (9× a pigeon's pace) climb to the jet stream when it blows their way: anything this fast
export const JET_KMH = SPEED_KMH * 8, JET_ALT = 10000;
const SAMPLE_KM = 200, POINTS_LEAST = 5, POINTS_MOST = 12;
export const pointsFor = (km) => { const n = Math.min(POINTS_MOST, Math.max(POINTS_LEAST, Math.ceil(km / SAMPLE_KM))); return Array.from({ length: n }, (_, k) => (k + 0.5) / n); };
const MIN_F = 0.6, MAX_F = 1.6;                  // even a gale only does so much (over the whole way)
const GALE = 60;                                 // gusts (km/h) a pigeon has to fight
const CELL = 0.25, WX_TTL = 10 * 60e3;           // the grid points are snapped to, and how long a square's weather is kept
const snap = (v) => Math.round(v / CELL) * CELL;

// What the sky is doing at one point (WMO weather code, gusts, and how
// unstable and wet the air is), and how much of its speed a pigeon keeps
// flying through it. Thunderstorms are the weather code's, or air unstable
// enough for them (CAPE, J/kg) with rain falling; hail is worse still; rain
// is heavy by the weather code or by how much is falling (mm an hour).
// And the cold and heat (°C): ice on its wings in freezing fog or freezing rain
// (gone around and sheltered from, like storms), and slower in fierce heat or
// bitter cold.
const STORM_CAPE = 1500, STORM_RAIN = 1, HEAVY_RAIN = 4;
const HOT = [[40, 0.75], [35, 0.85]], COLD = [[-20, 0.8], [-10, 0.9]];
const SEVERE = new Set(["storms", "hail", "icing", "ash", "smoke"]);
export const isSevere = (k) => SEVERE.has(k);              // what a pigeon goes around, or shelters from
export function skyAt(code, gust, cape = 0, rain = 0, temp = null) {
  let k = null, keep = 1;
  const icy = code === 48 || code === 56 || code === 57 || code === 66 || code === 67 || (code === 45 && temp != null && temp <= 0);
  if (code === 96 || code === 99) [k, keep] = ["hail", 0.6];
  else if (code >= 95 || (cape >= STORM_CAPE && rain >= STORM_RAIN)) [k, keep] = ["storms", 0.7];
  else if (icy) [k, keep] = ["icing", 0.7];
  else if (code === 75 || code === 86) [k, keep] = ["snow", 0.8];
  else if ((code >= 71 && code <= 77) || code === 85) [k, keep] = ["snow", 0.9];
  else if (code === 65 || code === 67 || code === 82 || rain >= HEAVY_RAIN) [k, keep] = ["rain", 0.85];
  else if ((code >= 61 && code <= 66) || code === 80 || code === 81) [k, keep] = ["rain", 0.93];
  else if (code === 45 || code === 48) [k, keep] = ["fog", 0.9];
  if (gust >= GALE) { keep *= 0.9; k = k || "gales"; }
  if (temp != null) {
    const hot = HOT.find(([c]) => temp >= c), cold = COLD.find(([c]) => temp <= c);
    if (hot) { keep *= hot[1]; k = k || "heat"; } else if (cold) { keep *= cold[1]; k = k || "cold"; }
  }
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
// A pigeon flies at whichever height (80, 120 or 180 m up) has the kindest
// wind there: climbing to catch a tailwind, or keeping low out of a headwind
// (alt: the height it chose; 120 m if they're all the same). Only the wind at
// the ground, if that's all there is. A rocket (high) can climb on up to the
// jet stream (JET_ALT) when that's kinder still.
const HEIGHTS = [120, 80, 180];
export function paceAt(w, head, high = false) {
  if (!w) return null;
  // wind_direction is where it blows from; the pigeon gains what blows its way
  const tailAt = (sp, dir) => (sp == null || dir == null || !Number.isFinite(Number(sp)) || !Number.isFinite(Number(dir)) ? null : Number(sp) * Math.cos(((Number(dir) + 180) - head) * r));
  let tail = null, alt = null;
  for (const h of HEIGHTS) { const t = tailAt(w[`wind_speed_${h}m`], w[`wind_direction_${h}m`]); if (t != null && (tail == null || t > tail + 1)) { tail = t; alt = h; } }
  if (tail == null) { tail = tailAt(w.wind_speed_10m, w.wind_direction_10m); alt = null; }
  if (high) { const jet = tailAt(w.wind_speed_250hPa, w.wind_direction_250hPa); if (jet != null && (tail == null || jet > tail + 5)) { tail = jet; alt = JET_ALT; } }
  if (tail == null) return null;
  const temp = w.temperature_2m == null || !Number.isFinite(Number(w.temperature_2m)) ? null : Number(w.temperature_2m);
  const sky = skyAt(Number(w.weather_code) || 0, Number(w.wind_gusts_10m) || 0, Number(w.cape) || 0, Number(w.precipitation) || 0, temp);
  // volcanic ash or wildfire smoke (as bad as storms, and gone around the same), and a magnetic storm (it wanders)
  if (w.hz) { sky.keep *= 0.7; if (!isSevere(sky.k)) sky.k = w.hz; }
  if (w.mag > 0 && w.mag < 1) { sky.keep *= w.mag; sky.k = sky.k || "magnetic"; }
  return { f: Math.min(MAX_F, Math.max(0.4, ((SPEED_KMH + tail) / SPEED_KMH) * sky.keep)), tail, k: sky.k, alt };
}
// One point's weather with the Earth's part in it: ash or smoke there, and a magnetic storm then
export function withEarth(h, E, lat, lon, when) {
  if (!h || !E) return h;
  const hz = hazardAt(E, lat, lon), mag = magKeep(kpAt(E, when), lat);
  return hz || mag < 1 ? { ...h, ...(hz ? { hz } : {}), ...(mag < 1 ? { mag } : {}) } : h;
}
// (where a wind was met higher or lower than usual, so the card can say it climbed for it)
export const altOf = (spot) => (spot.alt && spot.alt !== 120 && (spot.k === "tailwind" || spot.k === "headwind") ? { alt: spot.alt } : {});
// (high: which routes are flown by rockets, high enough for the jet stream)
function tally(routes, pts, list, high = []) {
  const sum = routes.map(() => ({ tail: 0, slow: 0, n: 0, lo: null, hi: null, storms: 0, storm: null }));
  list.forEach((w, k) => {
    const pace = paceAt(w, pts[k].head, !!high[pts[k].i]); if (!pace) return;
    const { tail, f } = pace, sky = { k: pace.k }, s = sum[pts[k].i];
    // each point stands for an equal stretch of the route: add up the time it takes
    s.tail += tail; s.slow += 1 / f; s.n++;
    if (isSevere(sky.k)) { s.storms++; if (!s.storm) s.storm = { lat: pts[k].lat, lon: pts[k].lon, at: pts[k].f, k: sky.k }; }        // (which: storms, hail or icing)
    const k2 = f >= 1 ? "tailwind" : sky.k || "headwind";
    const here = { f, k: k2, lat: pts[k].lat, lon: pts[k].lon, at: pts[k].f, alt: pace.alt };
    if (!s.lo || f < s.lo.f) s.lo = here;
    if (!s.hi || f > s.hi.f) s.hi = here;
  });
  return sum.map(({ tail, slow, n, lo, hi, storms, storm }) => {
    if (!n) return { wind: null, f: 1, wx: null, storms: 0, storm: null };
    const f = Math.min(MAX_F, Math.max(MIN_F, n / slow)), worst = f < 1 ? lo : hi;   // the spot that did most of it
    return { wind: Math.round(tail / n), f, wx: Math.abs(Math.log(worst.f)) >= 0.05 ? { k: worst.k, lat: worst.lat, lon: worst.lon, at: worst.at, ...altOf(worst) } : null, storms, storm };
  });
}
export async function windsFor(env, routes, high = []) {
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
      if (res.ok) data = await res.json();
    } catch (_) {}
    // Open-Meteo didn't answer: the hour now from MET Norway's forecast
    const fromMet = !data;
    if (!data) { const met = await metFor(env, ask, 1).catch(() => null); if (!met) return calm; data = met.map((H) => (H ? { current: hourAt(H, 0) } : {})); }
    const fresh = Array.isArray(data) ? data : [data];
    if (fresh.length !== ask.length) return calm;
    const keep = [];
    ask.forEach((p, k) => {
      const c = fresh[k]?.current; if (!c) return;
      const w = { current: Object.fromEntries(WIND_VARS.split(",").map((k) => [k, c[k]])) };
      if (c.precipitation != null && !fromMet) w.current.precipitation = c.precipitation * 4;   // (now: the last 15 minutes', as an hour's)
      got.set(key(p), w); keep.push(D.prepare("INSERT OR REPLACE INTO pg_wxcache (cell, at, w) VALUES (?, ?, ?)").bind(key(p), t, JSON.stringify(w)));
    });
    if (keep.length) await D.batch(keep).catch(() => {});
  }
  const E = await earthFor(env).catch(() => null);
  return tally(routes, pts, pts.map((p) => withEarth(got.get(key(p))?.current, E, p.lat, p.lon, t)), high);
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
  const [list, E] = await Promise.all([hourlyFor(env, cells, hours), earthFor(env).catch(() => null)]);
  if (!list) return none;
  const byCell = new Map(cells.map((p, k) => [key(p), list[k]])), times = list[0].time, out = routes.map(() => []);
  for (let h = 0; h < times.length; h++) {
    const ws = pts.map((p) => withEarth(hourAt(byCell.get(key(p)), h), E, p.lat, p.lon, times[h] * 1000));
    tally(routes, pts, ws).forEach((x, i) => out[i].push({ at: times[h] * 1000, ...x }));
  }
  return out;
}
// One square's weather in hour h of its forecast
const VARS = WIND_VARS.split(",");
const hourAt = (H, h) => { if (!H || h < 0 || h >= H.time.length) return null; const w = {}; for (const k of VARS) w[k] = H[k]?.[h]; return w; };
// The weather at a moment: its hour's, with the quarter-hour's rain and weather in it for
// the next couple of hours (Open-Meteo's 15-minute forecast), so a shower that's passing
// is met, or missed, as it will be
const QUARTER = 15 * 60e3;
function weatherAt(H, when) {
  const w = hourAt(H, Math.max(0, Math.floor((when - H.time[0] * 1000) / HOUR)));
  const Q = H.q15, q = Q?.time?.length ? Math.floor((when - Q.time[0] * 1000) / QUARTER) : -1;
  if (!w || q < 0 || q >= Q.time.length) return w;
  const code = Q.weather_code?.[q], rain = Q.precipitation?.[q];
  return { ...w, ...(code != null ? { weather_code: code } : {}), ...(rain != null ? { precipitation: rain * 4 } : {}) };    // (a quarter's rain, as an hour's)
}
// Open-Meteo's forecast for some squares, hour by hour from this hour, `hours`
// of it: a list matching `cells` (null if it didn't answer). Kept for everyone
// for half an hour; asked a hundred squares at a time.
const ASK_EACH = 100;
const Q15_VARS = "precipitation,weather_code", Q15_N = 8;                 // the next two hours, a quarter at a time
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
      u.searchParams.set("minutely_15", Q15_VARS); u.searchParams.set("forecast_minutely_15", String(Q15_N));
      u.searchParams.set("timeformat", "unixtime"); u.searchParams.set("wind_speed_unit", "kmh");
      const res = await fetch(u, { signal: AbortSignal.timeout(3000), headers: { Accept: "application/json" } });
      if (!res.ok) return null;
      const d = await res.json(); list = (Array.isArray(d) ? d : [d]).map((x) => (x?.hourly ? { ...x.hourly, ...(x.minutely_15?.time ? { q15: x.minutely_15 } : {}) } : null));
    } catch (_) { return null; }
    if (list.length !== part.length || !list.every((x) => Array.isArray(x?.time))) return null;
    if (cache) await cache.put(ck, new Response(JSON.stringify(part.map((p, k) => [key(p), list[k]])), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=1800" } })).catch(() => {});
    return list;
  }));
  if (!parts.some((x) => !x)) return parts.flat();
  // Open-Meteo didn't answer: MET Norway's forecast instead, for as many squares as it can be asked about
  return metFor(env, cells, hours).catch(() => null);
}

// ---- when Open-Meteo is down: MET Norway ----
// The Norwegian Meteorological Institute's free forecast (api.met.no), asked
// one point at a time, so only MET_MOST squares (spread evenly; the rest go
// without), named as its terms ask. Given in Open-Meteo's shape, hour by hour
// from this hour (its later hours are 6-hourly: each hour takes the last
// forecast before it). It has no wind 120 m up: the wind at the ground does.
// MET_URL: tests only.
const MET_MOST = 40, MET_UA = "Chat/1.0 (https://chat.inflite.ai/)";
// its weather symbols as WMO weather codes
const metCode = (s = "") => /thunder/.test(s) ? 95 : /heavysnow/.test(s) ? 75 : /snow/.test(s) ? 71 : /sleet/.test(s) ? 67 : /heavyrain/.test(s) ? 65 : /rain/.test(s) ? 61 : /fog/.test(s) ? 45 : 0;
async function metFor(env, cells, hours) {
  const h0 = Math.floor(Date.now() / HOUR) * HOUR, times = Array.from({ length: hours }, (_, h) => (h0 + h * HOUR) / 1000);
  const n = Math.min(cells.length, MET_MOST), pick = [...new Set(Array.from({ length: n }, (_, k) => Math.floor((k * cells.length) / n)))];
  const out = cells.map(() => null);
  await Promise.all(pick.map(async (k) => {
    try {
      const u = new URL(`${env.MET_URL || "https://api.met.no"}/weatherapi/locationforecast/2.0/complete`);
      u.searchParams.set("lat", String(cells[k].lat)); u.searchParams.set("lon", String(cells[k].lon));
      const res = await fetch(u, { signal: AbortSignal.timeout(4000), headers: { "User-Agent": MET_UA, Accept: "application/json" } });
      if (res.ok) out[k] = metHourly(await res.json(), times);
    } catch (_) {}
  }));
  return out.some(Boolean) ? out : null;
}
function metHourly(d, times) {
  const ts = (d?.properties?.timeseries || []).map((x) => {
    const one = x.data?.next_1_hours, six = x.data?.next_6_hours, next = one || six;
    return { t: Date.parse(x.time) / 1000, i: x.data?.instant?.details || {}, sym: next?.summary?.symbol_code, mm: next?.details?.precipitation_amount != null ? next.details.precipitation_amount / (one ? 1 : 6) : null };
  }).filter((x) => Number.isFinite(x.t)).sort((a, b) => a.t - b.t);
  if (!ts.length) return null;
  const at = times.map((t) => ts.filter((x) => x.t <= t).at(-1) || ts[0]);
  const ms = (v) => (v == null ? null : Math.round(v * 36) / 10);    // m/s → km/h
  return { time: times, wind_speed_10m: at.map((x) => ms(x.i.wind_speed)), wind_direction_10m: at.map((x) => x.i.wind_from_direction ?? null),
    wind_gusts_10m: at.map((x) => ms(x.i.wind_speed_of_gust) ?? 0), weather_code: at.map((x) => metCode(x.sym)),
    temperature_2m: at.map((x) => x.i.air_temperature ?? null), precipitation: at.map((x) => x.mm) };
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
  const [list, E] = await Promise.all([hourlyFor(env, cells, hours), earthFor(env).catch(() => null)]);
  if (!list) return null;
  const byCell = new Map(cells.map((p, k) => [key(p), list[k]])), kms = paths.map(lenOf);
  return {
    at(i, start, kmh) {
      const mine = pts.filter((p) => p.i === i).map((p) => ({ ...p, i: 0 }));
      const ws = mine.map((p) => {
        const H = byCell.get(key(p)), eta = start + ((p.f * kms[i]) / kmh) * HOUR;
        return H ? withEarth(weatherAt(H, eta), E, p.lat, p.lon, eta) : null;
      });
      return tally([paths[i]], mine, ws, [kmh >= JET_KMH])[0];
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
  const [list, E] = await Promise.all([hourlyFor(env, cells, hours), earthFor(env).catch(() => null)]);
  if (!list) return null;
  const byCell = new Map(cells.map((p, k) => [key(p), list[k]]));
  // (each square's weather at each quarter hour worked out once: a plan asks the same ones many times over)
  const keys = snapped.map(key), seen = new Map();
  return { until, at: (i, when) => {
    const H = byCell.get(keys[i]); if (!H) return null;
    const m = `${keys[i]}|${Math.floor(when / QUARTER)}`;
    if (seen.has(m)) return seen.get(m);
    const w = withEarth(weatherAt(H, when), E, snapped[i].lat, snapped[i].lon, when); seen.set(m, w); return w;
  } };
}
// The weather along each of some flights ({ path, start, kmh }), as it will
// meet it. All in the next hour: the sky as it is now (windsFor). The forecast
// down: the sky now for those leaving now, calm for any leaving later.
export async function windsAlong(env, flights) {
  const t = Date.now(), paths = flights.map((f) => f.path), ends = flights.map((f) => f.start + (lenOf(f.path) / f.kmh) * HOUR);
  const soon = (f) => f.start <= t + HOUR;
  const high = flights.map((f) => f.kmh >= JET_KMH);
  if (flights.every(soon) && Math.max(...ends) <= t + HOUR) return windsFor(env, paths, high);
  const sky = await skyAlong(env, paths, Math.max(...ends)).catch(() => null);
  if (sky) return flights.map((f, i) => sky.at(i, f.start, f.kmh));
  const now = await windsFor(env, paths, high);
  return flights.map((f, i) => (soon(f) ? now[i] : { wind: null, f: 1, wx: null, storms: 0, storm: null }));
}
// The forecast hour a time falls in (or null: beyond the forecast).
export const hourOf = (fc, t) => (fc || []).find((x) => t >= x.at && t < x.at + HOUR) || null;

// ---- how sure a landing time is ----
// Open-Meteo's ensemble forecast (free, no key, as the rest): the same model run
// many times over from slightly different starts. Where its members agree about
// the wind along the way, a landing time is sure; where they don't, it could be
// a good deal sooner or later. ensembleFor asks for the wind at a few points
// along a way (the same quarter-degree squares as ever); spreadOf says how much
// the flight's length varies across the members, as a share of it (the
// standard deviation over the mean), or null if it can't say. ENSEMBLE_URL: tests only.
const ENS_POINTS = 8, ENS_MEMBERS_LEAST = 5;
export async function ensembleFor(env, path, hours) {
  if (env.WEATHER_OFF || !path?.length) return null;
  const km = lenOf(path), all = pointsFor(km), step = Math.max(1, Math.ceil(all.length / ENS_POINTS));
  const fs = all.filter((_, i) => i % step === 0);
  const pts = fs.map((f) => {
    const [lat, lon] = alongPath(path, f), [nLat, nLon] = alongPath(path, Math.min(1, f + 0.02)), so = snap((lon + 540) % 360 - 180);
    return { f, lat: Math.max(-90, Math.min(90, snap(lat))), lon: so === -180 ? 180 : so, head: bearing(lat, lon, nLat, nLon) };
  });
  const h0 = Math.floor(Date.now() / HOUR) * HOUR, n = Math.min(168, Math.max(2, Math.ceil(hours) + 2));
  const cache = typeof caches !== "undefined" && !env.ENSEMBLE_URL ? caches.default : null;
  const ck = new Request(`https://inflight-ensemble.cache/v1/${h0}/${n}/${pts.map(key).join(";")}`);
  let list = null;
  try { const hit = cache && await cache.match(ck); if (hit) list = await hit.json(); } catch (_) {}
  if (!list) {
    try {
      const u = new URL(`${env.ENSEMBLE_URL || "https://ensemble-api.open-meteo.com"}/v1/ensemble`);
      u.searchParams.set("latitude", pts.map((p) => p.lat).join(",")); u.searchParams.set("longitude", pts.map((p) => p.lon).join(","));
      u.searchParams.set("hourly", "wind_speed_10m,wind_direction_10m"); u.searchParams.set("models", "icon_seamless");
      u.searchParams.set("forecast_hours", String(n)); u.searchParams.set("timeformat", "unixtime"); u.searchParams.set("wind_speed_unit", "kmh");
      const res = await fetch(u, { signal: AbortSignal.timeout(3000), headers: { Accept: "application/json" } });
      if (!res.ok) return null;
      const d = await res.json(); list = (Array.isArray(d) ? d : [d]).map((x) => x?.hourly || null);
    } catch (_) { return null; }
    if (list.length !== pts.length || !list.every((x) => Array.isArray(x?.time))) return null;
    if (cache) await cache.put(ck, new Response(JSON.stringify(list), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" } })).catch(() => {});
  }
  return { km, pts, list };
}
export function spreadOf(E, start, kmh) {
  if (!E) return null;
  const members = Object.keys(E.list[0]).filter((k) => /^wind_speed_10m(_member\d+)?$/.test(k)).map((k) => k.slice("wind_speed_10m".length));
  if (members.length < ENS_MEMBERS_LEAST) return null;
  const durs = [];
  for (const m of members) {
    let sum = 0, n = 0;
    E.pts.forEach((p, i) => {
      const H = E.list[i], h = Math.floor((start + ((p.f * E.km) / kmh) * HOUR - H.time[0] * 1000) / HOUR);
      const sp = H[`wind_speed_10m${m}`]?.[h], dir = H[`wind_direction_10m${m}`]?.[h];
      if (sp == null || dir == null) return;
      const tail = Number(sp) * Math.cos(((Number(dir) + 180) - p.head) * r);
      sum += 1 / Math.min(MAX_F, Math.max(0.4, (SPEED_KMH + tail) / SPEED_KMH)); n++;
    });
    if (n) durs.push(sum / n);
  }
  if (durs.length < ENS_MEMBERS_LEAST) return null;
  const mean = durs.reduce((a, b) => a + b, 0) / durs.length, sd = Math.sqrt(durs.reduce((a, b) => a + (b - mean) ** 2, 0) / durs.length);
  return Math.round(Math.min(0.3, Math.max(0.005, sd / mean)) * 1e4) / 1e4;
}
