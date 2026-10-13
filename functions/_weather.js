// Weather for InFlight's pigeons. At take-off the server asks Open-Meteo (free,
// no key) for the wind at a few points along each route; the part of it
// blowing the pigeon's way speeds it up, and a headwind slows it down. Only
// points along the route are sent, never who's flying. If the forecast doesn't
// answer quickly, the pigeon simply flies at its usual speed.
//
// WEATHER_URL: tests only.

import { SPEED_KMH, gcPoint } from "./_pigeon.js";

const POINTS = [0.1, 0.3, 0.5, 0.7, 0.9];      // where along the route to look
const MIN_F = 0.6, MAX_F = 1.6;                  // even a gale only does so much
const r = Math.PI / 180;

// which way you face, flying from a toward b (degrees, 0 = north)
function bearing(aLat, aLon, bLat, bLon) {
  const y = Math.sin((bLon - aLon) * r) * Math.cos(bLat * r);
  const x = Math.cos(aLat * r) * Math.sin(bLat * r) - Math.sin(aLat * r) * Math.cos(bLat * r) * Math.cos((bLon - aLon) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}
// Wind on several routes at once (one request). routes: [[fromLat, fromLon, toLat, toLon], ...]
// Returns, for each, { wind: average tailwind in km/h (negative: headwind), f: speed factor }.
export async function windsFor(env, routes) {
  const calm = routes.map(() => ({ wind: null, f: 1 }));
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
    u.searchParams.set("current", "wind_speed_10m,wind_direction_10m"); u.searchParams.set("wind_speed_unit", "kmh");
    const res = await fetch(u, { signal: AbortSignal.timeout(2500), headers: { Accept: "application/json" } });
    if (!res.ok) return calm;
    data = await res.json();
  } catch (_) { return calm; }
  const list = Array.isArray(data) ? data : [data];
  if (list.length !== pts.length) return calm;
  const sum = routes.map(() => ({ tail: 0, n: 0 }));
  list.forEach((w, k) => {
    const speed = Number(w?.current?.wind_speed_10m), from = Number(w?.current?.wind_direction_10m);
    if (!Number.isFinite(speed) || !Number.isFinite(from)) return;
    // wind_direction is where it blows from; the pigeon gains what blows its way
    const tail = speed * Math.cos(((from + 180) - pts[k].head) * r);
    sum[pts[k].i].tail += tail; sum[pts[k].i].n++;
  });
  return sum.map(({ tail, n }) => {
    if (!n) return { wind: null, f: 1 };
    const wind = Math.round(tail / n);
    return { wind, f: Math.min(MAX_F, Math.max(MIN_F, (SPEED_KMH + wind) / SPEED_KMH)) };
  });
}
