// The Earth itself, for InFlight's pigeons, from two free sources with no key:
//
// - Magnetic storms: NOAA's Space Weather Prediction Center publishes the
//   planetary K index (Kp, 0 to 9), observed and forecast three days ahead.
//   Homing pigeons steer partly by the Earth's magnetic field, and real ones
//   do get lost in magnetic storms, more so nearer the poles. From Kp 5 (a G1
//   storm) a pigeon wanders a little and flies slower, the further from the
//   equator the more (magKeep).
// - Volcanoes and wildfires: NASA's EONET lists the natural events open now,
//   with where they are. A pigeon goes around volcanic ash (HAZARD_KM.volcanoes
//   around an erupting volcano) and wildfire smoke, just as it goes around
//   storms (the weather marks those points "ash" or "smoke": _weather.js).
//
// The server asks (never a phone), and keeps both for everyone for half an
// hour; if either doesn't answer, pigeons fly as if all were calm. Only these
// global lists are fetched: nothing about who's flying, or where, is sent.
// SWPC_URL, EONET_URL: tests only.

import { HOUR, haversineKm } from "./_pigeon.js";

const KEEP = 30 * 60e3, KEEP_FAILED = 5 * 60e3, UA = "InFlight/1.0 (https://georgefarrowgreen.com/pigeon/)";
export const MAG_KP = 5;
// how much ash or smoke a pigeon keeps clear of (km from the volcano or the fire)
export const HAZARD_KM = { volcanoes: 120, wildfires: 40 };
const KIND = { volcanoes: "ash", wildfires: "smoke" };

// The K index at a time: the three-hour block it falls in (null if unknown)
export function kpAt(E, t) {
  let kp = null;
  for (const [at, k] of E?.kp || []) { if (at > t) break; if (t - at < 3 * HOUR) kp = k; }
  return kp;
}
// How much of its pace a pigeon keeps at latitude `lat` in a magnetic storm of Kp `kp`:
// nothing lost below Kp 5, nor near the equator; up to 22% lost in the strongest, nearest the poles
export function magKeep(kp, lat) {
  if (!(kp >= MAG_KP)) return 1;
  const w = Math.min(1, Math.max(0, (Math.abs(lat) - 35) / 25));
  return Math.round((1 - w * Math.min(0.22, 0.06 + (kp - MAG_KP) * 0.04)) * 1000) / 1000;
}
// What's in the air at a point: "ash" near an erupting volcano, "smoke" near a wildfire, or null
export function hazardAt(E, lat, lon) {
  let hit = null;
  for (const h of E?.hz || []) {
    if (Math.abs(h.lat - lat) * 111 > h.km) continue;
    if (haversineKm(lat, lon, h.lat, h.lon) <= h.km) { if (h.k === "ash") return "ash"; hit = "smoke"; }
  }
  return hit;
}
// The hazard nearest a point, if it's in one: { k, name, lat, lon } (for saying which volcano)
export function hazardNear(E, lat, lon) {
  let best = null, bd = Infinity;
  for (const h of E?.hz || []) { const d = haversineKm(lat, lon, h.lat, h.lon); if (d <= h.km * 1.5 && d < bd) { best = h; bd = d; } }
  return best && { k: best.k, name: best.name, lat: best.lat, lon: best.lon };
}

// ---- asking ----
let memo = null;                       // { at, E }: this worker's copy
export async function earthFor(env) {
  const t = Date.now();
  if (env.EARTH_OFF) return { kp: [], hz: [] };
  const test = !!(env.SWPC_URL || env.EONET_URL), cache = typeof caches !== "undefined" && !test ? caches.default : null;
  if (memo && !test && t - memo.at < (memo.failed ? KEEP_FAILED : KEEP)) return memo.E;          // (tests change the sky between pigeons: never kept)
  const ck = new Request(`https://inflight-earth.cache/v1/${Math.floor(t / KEEP)}`);
  try { const hit = cache && await cache.match(ck); if (hit) { const E = await hit.json(); memo = { at: t, E }; return E; } } catch (_) {}
  const [kp, hz] = await Promise.all([kpList(env).catch(() => null), hazards(env).catch(() => null)]);
  const E = { kp: kp || [], hz: hz || [] };
  memo = { at: t, E, failed: !kp || !hz };
  if (cache && kp && hz) await cache.put(ck, new Response(JSON.stringify(E), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=1800" } })).catch(() => {});
  return E;
}
export const earthForget = () => { memo = null; };          // (tests)
const get = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(3000), headers: { Accept: "application/json", "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
};
// NOAA's three-day Kp, as [[at (ms), kp], ...] in time order. It comes as rows
// under a header row (["time_tag", "kp", ...]), or as objects: either will do.
async function kpList(env) {
  const d = await get(`${env.SWPC_URL || "https://services.swpc.noaa.gov"}/products/noaa-planetary-k-index-forecast.json`);
  if (!Array.isArray(d)) return null;
  const head = Array.isArray(d[0]) ? d[0].map(String) : null, ti = head ? head.indexOf("time_tag") : -1, ki = head ? head.indexOf("kp") : -1;
  const rows = (head ? d.slice(1).map((r) => [r[ti], r[ki]]) : d.map((r) => [r?.time_tag, r?.kp ?? r?.kp_index]))
    .map(([tt, k]) => [Date.parse(String(tt).replace(" ", "T").replace(/(T[\d:]+)$/, "$1Z")), Number(k)])
    .filter(([at, k]) => Number.isFinite(at) && Number.isFinite(k) && k >= 0 && k <= 9);
  return rows.sort((a, b) => a[0] - b[0]);
}
// NASA EONET's open volcanoes and wildfires: [{ k: "ash" | "smoke", name, lat, lon, km }]
async function hazards(env) {
  // (the comma between categories as it is: EONET doesn't read it encoded)
  const d = await get(`${env.EONET_URL || "https://eonet.gsfc.nasa.gov"}/api/v3/events?status=open&category=volcanoes,wildfires&days=20`);
  const out = [];
  for (const e of d?.events || []) {
    const cat = (e.categories || []).map((c) => c.id).find((c) => KIND[c]); if (!cat) continue;
    const g = (e.geometry || []).at(-1); if (!g) continue;
    let lon, lat;
    if (g.type === "Point") [lon, lat] = g.coordinates;
    else if (g.type === "Polygon" && g.coordinates?.[0]?.length) { const ring = g.coordinates[0]; lon = ring.reduce((a, p) => a + p[0], 0) / ring.length; lat = ring.reduce((a, p) => a + p[1], 0) / ring.length; }
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    // a big fire (EONET gives its size in acres, when it knows) smokes further
    const acres = g.magnitudeUnit === "acres" ? Number(g.magnitudeValue) || 0 : 0;
    const km = cat === "wildfires" ? Math.min(100, HAZARD_KM.wildfires + Math.sqrt(acres) * 0.05) : HAZARD_KM.volcanoes;
    out.push({ k: KIND[cat], name: String(e.title || "").replace(/,.*$/, "").slice(0, 60), lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100, km: Math.round(km) });
  }
  return out.slice(0, 1500);
}
