// What the weather actually did, for checking forecasts against: the nearest
// airport's weather reports (METAR, from the US Aviation Weather Center: free,
// worldwide). Their service keeps only about a week, so each day's high and
// low is kept here (D1, wx_obs) as it's seen, and the record grows to six
// weeks the more the app is used near that airport. weather/skill.js does the
// comparing, on the phone.
//
// AWC_URL: tests only.

import { obsDays } from "../weather/skill.js";
import { wxdb } from "./_wxpush.js";

const UA = { "User-Agent": "georgefarrowgreen-weather/1.0 (+https://weather.georgefarrowgreen.com)", Accept: "application/json" };
const KEEP_DAYS = 46, NEAR_KM = 40;
const rad = Math.PI / 180;
const km = (a, b, c, d) => 12742 * Math.asin(Math.sqrt(Math.sin((c - a) * rad / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin((d - b) * rad / 2) ** 2));
// "London/Heathrow Intl" → "London Heathrow International"
const tidy = (s = "") => s.replace(/\//g, " ").replace(/\bArpt\b/g, "Airport").replace(/\bIntl\b/g, "International").replace(/\bAfb\b/gi, "Air Force Base").replace(/\s+/g, " ").trim();

async function cachedJSON(url, ttl) {
  const cache = typeof caches !== "undefined" && caches.default ? caches.default : null, key = new Request(url);
  if (cache) { const hit = await cache.match(key); if (hit) return hit.json(); }
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`aviationweather ${r.status}`);
  const text = await r.text();
  if (cache) await cache.put(key, new Response(text, { headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${ttl}` } }));
  return text ? JSON.parse(text) : [];
}

// { station: { id, name, lat, lon, km } | null, days: { "YYYY-MM-DD": { tmax, tmin } } } for a place; off: its UTC offset (s)
export async function obsFor(env, lat, lon, off) {
  const base = env.AWC_URL || "https://aviationweather.gov";
  const D = await wxdb(env);
  let near = [];
  try {
    const list = await cachedJSON(`${base}/api/data/stationinfo?bbox=${(lat - 0.4).toFixed(2)},${(lon - 0.6).toFixed(2)},${(lat + 0.4).toFixed(2)},${(lon + 0.6).toFixed(2)}&format=json`, 7 * 86400);
    near = (Array.isArray(list) ? list : []).filter((s) => (s.siteType || []).includes("METAR") && (s.icaoId || s.id))
      .map((s) => ({ id: String(s.icaoId || s.id).slice(0, 8), name: tidy(s.site), lat: s.lat, lon: s.lon, km: km(lat, lon, s.lat, s.lon) }))
      .filter((s) => s.km <= NEAR_KM).sort((a, b) => a.km - b.km).slice(0, 3);
  } catch (e) { console.error("weather obs: stations", e && e.message); }
  const since = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
  if (Math.random() < 0.05) await D.prepare("DELETE FROM wx_obs WHERE day < ?").bind(since).run();
  // the nearest airport that reports round the clock (small ones close at night)
  for (const [i, st] of near.entries()) {
    try {
      const fresh = obsDays(await cachedJSON(`${base}/api/data/metar?ids=${encodeURIComponent(st.id)}&format=json&hours=360`, 3600), off);
      const rows = Object.entries(fresh);
      if (rows.length) await D.batch(rows.map(([day, x]) => D.prepare("INSERT OR REPLACE INTO wx_obs (station, day, tmax, tmin, n) VALUES (?, ?, ?, ?, ?)").bind(st.id, day, x.tmax, x.tmin, x.n)));
    } catch (e) { console.error("weather obs: reports", st.id, e && e.message); }
    const { results } = await D.prepare("SELECT day, tmax, tmin FROM wx_obs WHERE station = ? AND day >= ? ORDER BY day").bind(st.id, since).all();
    if (results.length >= 3 || i === near.length - 1) {
      return { station: { id: st.id, name: st.name, lat: st.lat, lon: st.lon, km: Math.round(st.km) }, days: Object.fromEntries(results.map((r) => [r.day, { tmax: r.tmax, tmin: r.tmin }])) };
    }
  }
  return { station: null, days: {} };
}
