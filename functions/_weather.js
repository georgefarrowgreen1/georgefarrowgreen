// Weather for InFlight's pigeons. At take-off the server asks Open-Meteo (free,
// no key) for the wind at a few points along each route; the part of it
// blowing the pigeon's way speeds it up, and a headwind slows it down. Only
// points along the route are sent, never who's flying. If the forecast doesn't
// answer quickly, the pigeon simply flies at its usual speed.
//
// Storms slow it too: it sits out thunder, picks its way through heavy rain,
// snow and fog, and fights gales. The worst spot along the way is kept (what
// and where, never who) so the phone can say "Delayed 40 min by storms over
// the Alps".
//
// WEATHER_URL: tests only.

import { SPEED_KMH, gcPoint } from "./_pigeon.js";

const POINTS = [0.1, 0.3, 0.5, 0.7, 0.9];      // where along the route to look
const MIN_F = 0.6, MAX_F = 1.6;                  // even a gale only does so much (over the whole way)
const GALE = 60;                                 // gusts (km/h) a pigeon has to fight

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
// wx: the spot that changed its speed most, { k: what, lat, lon }, or null }.
export async function windsFor(env, routes) {
  const calm = routes.map(() => ({ wind: null, f: 1, wx: null }));
  if (!routes.length || env.WEATHER_OFF) return calm;
  const pts = [];
  routes.forEach(([aLat, aLon, bLat, bLon], i) => {
    for (const f of POINTS) {
      const [lat, lon] = gcPoint(aLat, aLon, bLat, bLon, f), [nLat, nLon] = gcPoint(aLat, aLon, bLat, bLon, Math.min(1, f + 0.02));
      pts.push({ i, lat: Math.round(lat * 100) / 100, lon: Math.round(((lon + 540) % 360 - 180) * 100) / 100, head: bearing(lat, lon, nLat, nLon) });
    }
  });
  let data;
  try {
    const u = new URL(`${env.WEATHER_URL || "https://api.open-meteo.com"}/v1/forecast`);
    u.searchParams.set("latitude", pts.map((p) => p.lat).join(",")); u.searchParams.set("longitude", pts.map((p) => p.lon).join(","));
    u.searchParams.set("current", "wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code"); u.searchParams.set("wind_speed_unit", "kmh");
    const res = await fetch(u, { signal: AbortSignal.timeout(2500), headers: { Accept: "application/json" } });
    if (!res.ok) return calm;
    data = await res.json();
  } catch (_) { return calm; }
  const list = Array.isArray(data) ? data : [data];
  if (list.length !== pts.length) return calm;
  const sum = routes.map(() => ({ tail: 0, slow: 0, n: 0, lo: null, hi: null }));
  list.forEach((w, k) => {
    const speed = Number(w?.current?.wind_speed_10m), from = Number(w?.current?.wind_direction_10m);
    if (!Number.isFinite(speed) || !Number.isFinite(from)) return;
    // wind_direction is where it blows from; the pigeon gains what blows its way
    const tail = speed * Math.cos(((from + 180) - pts[k].head) * r);
    const sky = skyAt(Number(w.current.weather_code) || 0, Number(w.current.wind_gusts_10m) || 0);
    // each point stands for an equal stretch of the route: add up the time it takes
    const f = Math.min(MAX_F, Math.max(0.4, ((SPEED_KMH + tail) / SPEED_KMH) * sky.keep)), s = sum[pts[k].i];
    s.tail += tail; s.slow += 1 / f; s.n++;
    const k2 = f >= 1 ? "tailwind" : sky.k || "headwind";
    const here = { f, k: k2, lat: pts[k].lat, lon: pts[k].lon };
    if (!s.lo || f < s.lo.f) s.lo = here;
    if (!s.hi || f > s.hi.f) s.hi = here;
  });
  return sum.map(({ tail, slow, n, lo, hi }) => {
    if (!n) return { wind: null, f: 1, wx: null };
    const f = Math.min(MAX_F, Math.max(MIN_F, n / slow)), worst = f < 1 ? lo : hi;   // the spot that did most of it
    return { wind: Math.round(tail / n), f, wx: Math.abs(Math.log(worst.f)) >= 0.05 ? { k: worst.k, lat: worst.lat, lon: worst.lon } : null };
  });
}
