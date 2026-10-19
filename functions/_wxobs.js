// What the weather actually did, for checking forecasts against: the nearest
// airport's weather reports (METAR, from the US Aviation Weather Center: free,
// worldwide). Their service gives at most 400 reports at a time (about a week
// at a big airport, which reports every half hour), so each day's high and low,
// and its hours (temperature, dew point, wind, gusts), are kept here (D1,
// wx_obs) as they're seen, and the record grows to six weeks the more the app
// is used near that airport. weather/skill.js does the comparing, on the phone.
//
// Each day is the airport's own (its UTC offset, from Open-Meteo), whoever
// asks; and only reports just fetched from the Aviation Weather Center are
// written (the same reports again would change nothing). The tick clears out
// days older than six weeks (functions/_wxpush.js).
//
// AWC_URL, WXAPP_URL: tests only.

import { obsDays } from "../weather/skill.js";
import { wxdb } from "./_wxpush.js";

const UA = { "User-Agent": "georgefarrowgreen-weather/1.0 (+https://weather.georgefarrowgreen.com)", Accept: "application/json" };
const KEEP_DAYS = 46, NEAR_KM = 40;
const rad = Math.PI / 180;
const km = (a, b, c, d) => 12742 * Math.asin(Math.sqrt(Math.sin((c - a) * rad / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin((d - b) * rad / 2) ** 2));
// "London/Heathrow Intl" → "London Heathrow International"
const tidy = (s = "") => s.replace(/\//g, " ").replace(/\bArpt\b/g, "Airport").replace(/\bIntl\b/g, "International").replace(/\bAfb\b/gi, "Air Force Base").replace(/\s+/g, " ").trim();

// { data, fresh }: fresh when it's just come from the source rather than the cache
async function cachedJSON(url, ttl) {
  const cache = typeof caches !== "undefined" && caches.default ? caches.default : null, key = new Request(url);
  if (cache) { const hit = await cache.match(key); if (hit) return { data: await hit.json(), fresh: false }; }
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`${new URL(url).hostname} ${r.status}`);
  const text = await r.text();
  if (cache) await cache.put(key, new Response(text, { headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${ttl}` } }));
  return { data: text ? JSON.parse(text) : [], fresh: true };
}
// the airport's own clock (seconds from UTC), so each day's high and low is for its own day
async function offsetAt(env, st) {
  try {
    const { data } = await cachedJSON(`${env.WXAPP_URL || "https://api.open-meteo.com"}/v1/forecast?latitude=${st.lat.toFixed(2)}&longitude=${st.lon.toFixed(2)}&daily=weather_code&forecast_days=1&timezone=auto`, 6 * 3600);
    if (Number.isFinite(data?.utc_offset_seconds)) return data.utc_offset_seconds;
  } catch (e) { console.error("weather obs: clock", e && e.message); }
  return Math.round(st.lon / 15) * 3600;                    // (the Sun's, near enough)
}

// a day's hours as kept (24 of [temp, dew, wind, gust] or null), or null if they're not, or not as they should be
function hoursOf(text) {
  try { const h = text ? JSON.parse(text) : null; return Array.isArray(h) && h.length === 24 && h.every((x) => x === null || (Array.isArray(x) && x.length === 4 && x.every((v) => v === null || Number.isFinite(v)))) ? h : null; } catch (_) { return null; }
}
// { station: { id, name, lat, lon, km } | null, days: { "YYYY-MM-DD": { tmax, tmin, hours? } } } for a place
export async function obsFor(env, lat, lon) {
  const base = env.AWC_URL || "https://aviationweather.gov";
  const D = await wxdb(env);
  let near = [];
  try {
    const { data: list } = await cachedJSON(`${base}/api/data/stationinfo?bbox=${(lat - 0.4).toFixed(2)},${(lon - 0.6).toFixed(2)},${(lat + 0.4).toFixed(2)},${(lon + 0.6).toFixed(2)}&format=json`, 7 * 86400);
    near = (Array.isArray(list) ? list : []).filter((s) => (s.siteType || []).includes("METAR") && (s.icaoId || s.id) && Number.isFinite(s.lat) && Number.isFinite(s.lon))
      .map((s) => ({ id: String(s.icaoId || s.id).slice(0, 8), name: tidy(String(s.site || "")).slice(0, 80), lat: s.lat, lon: s.lon, km: km(lat, lon, s.lat, s.lon) }))
      .filter((s) => s.km <= NEAR_KM).sort((a, b) => a.km - b.km).slice(0, 3);
  } catch (e) { console.error("weather obs: stations", e && e.message); }
  const since = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
  // the nearest airport that reports round the clock (small ones close at night)
  for (const [i, st] of near.entries()) {
    try {
      const { data, fresh } = await cachedJSON(`${base}/api/data/metar?ids=${encodeURIComponent(st.id)}&format=json&hours=360`, 3600);
      if (fresh) {
        const rows = Object.entries(obsDays(data, await offsetAt(env, st)));
        if (rows.length) await D.batch(rows.map(([day, x]) => D.prepare("INSERT OR REPLACE INTO wx_obs (station, day, tmax, tmin, n, hours) VALUES (?, ?, ?, ?, ?, ?)").bind(st.id, day, x.tmax, x.tmin, x.n, JSON.stringify(x.hours))));
      }
    } catch (e) { console.error("weather obs: reports", st.id, e && e.message); }
    const { results } = await D.prepare("SELECT day, tmax, tmin, hours FROM wx_obs WHERE station = ? AND day >= ? ORDER BY day").bind(st.id, since).all();
    if (results.length >= 3 || i === near.length - 1) {
      return { station: { id: st.id, name: st.name, lat: st.lat, lon: st.lon, km: Math.round(st.km) }, days: Object.fromEntries(results.map((r) => [r.day, { tmax: r.tmax, tmin: r.tmin, ...(hoursOf(r.hours) ? { hours: hoursOf(r.hours) } : {}) }])) };
    }
  }
  return { station: null, days: {} };
}
