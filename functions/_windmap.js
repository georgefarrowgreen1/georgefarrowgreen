// The wind map: a grid of the wind now (10 m above the ground), and how hard
// it's raining (mm an hour, for the radar), over whatever
// part of the world the map is showing, for the app to animate. Asked of
// Open-Meteo through InFlight, so it never learns who is looking or where
// they are; only a box of the world, snapped to a grid and shared by
// everyone looking at the same place in the same hour (cached).
//
// WEATHER_URL: tests only.

import { HOUR, HttpError, json, requireUser, limit } from "./_pigeon.js";

const STEPS = [0.25, 0.5, 1, 2, 3, 5, 8, 10, 15, 20, 24, 30, 36, 45];
// Open-Meteo counts every point as a call (10,000 a day), so the grid is
// small (blended smoothly on the phone) and kept for three hours.
const MAX = 13;                                   // points along each side, at most
const KEEP = 3 * HOUR;
const r = Math.PI / 180;

async function windGrid({ request, env }) {
  const u = await requireUser(request, env);
  await limit(env, "windmap:" + u.id, 300, 60 * 60e3);
  const q = new URL(request.url).searchParams, num = (k) => Number(q.get(k));
  let [s, n, w, e] = ["s", "n", "w", "e"].map(num);
  if (![s, n, w, e].every(Number.isFinite) || n <= s || e <= w) throw new HttpError(400, "That part of the map didn’t make sense.");
  s = Math.max(-84, s); n = Math.min(84, n); if (e - w > 360) e = w + 360;
  // the coarsest-but-fine-enough step, and the box snapped out to it (one step of margin)
  const step = STEPS.find((st) => (n - s) / st + 4 <= MAX && Math.min(360 / st + 1, (e - w) / st + 4) <= MAX) || 45;
  const s0 = Math.max(-84, Math.floor(s / step) * step - step), n0 = Math.min(84, Math.ceil(n / step) * step + step);
  const w0 = Math.floor(w / step) * step - step, e0 = Math.min(w0 + 360, Math.ceil(e / step) * step + step);
  const rows = Math.round((n0 - s0) / step) + 1, cols = Math.round((e0 - w0) / step) + 1;
  const hour = Math.floor(Date.now() / KEEP) * 3;
  const key = new Request(`https://inflight-wind.cache/v2/${s0}/${w0}/${step}/${rows}/${cols}/${hour}`);
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const hit = cache && await cache.match(key).catch(() => null);
  if (hit) return new Response(hit.body, { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  // a square of sky not asked for this hour: Open-Meteo is asked, within a share for each person and for everyone
  try { await limit(env, "windmiss:" + u.id, 60, 60 * 60e3); await limit(env, "windmiss:all", 600, 60 * 60e3); }
  catch (_) { throw new HttpError(503, "The wind map isn’t available right now."); }
  const lats = [], lons = [];
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) { lats.push(+(s0 + i * step).toFixed(2)); lons.push(+((((w0 + j * step) + 540) % 360) - 180).toFixed(2)); }
  let list;
  try {
    const url = new URL(`${env.WEATHER_URL || "https://api.open-meteo.com"}/v1/forecast`);
    url.searchParams.set("latitude", lats.join(",")); url.searchParams.set("longitude", lons.join(","));
    url.searchParams.set("current", "wind_speed_10m,wind_direction_10m,precipitation"); url.searchParams.set("wind_speed_unit", "kmh");
    const res = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(String(res.status));
    const d = await res.json(); list = Array.isArray(d) ? d : [d];
    if (list.length !== lats.length) throw new Error("short");
  } catch (_) { throw new HttpError(503, "The wind map isn’t available right now."); }
  // u: towards the east, v: towards the north (km/h); direction is where it blows from
  const U = [], V = [], P = [];
  for (const p of list) {
    const mm = Number(p?.current?.precipitation); P.push(Number.isFinite(mm) && mm > 0 ? Math.round(mm * 40) / 10 : 0);   // (the last 15 minutes' rain, as a rate)
    const sp = Number(p?.current?.wind_speed_10m), from = Number(p?.current?.wind_direction_10m);
    const ok = Number.isFinite(sp) && Number.isFinite(from), to = (from + 180) * r;
    U.push(ok ? Math.round(sp * Math.sin(to) * 10) / 10 : 0); V.push(ok ? Math.round(sp * Math.cos(to) * 10) / 10 : 0);
  }
  const body = JSON.stringify({ s: s0, w: w0, step, rows, cols, u: U, v: V, p: P, hour });
  if (cache) await cache.put(key, new Response(body, { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=10800" } })).catch(() => {});
  return new Response(body, { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

export const WINDMAP_ROUTES = { "GET wind-grid": windGrid };
