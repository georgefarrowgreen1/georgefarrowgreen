// The weather for a ride, for Fitness's Today: the week ahead, hour by hour, where you ride. Where: the first
// of your places in Weather (kept with the same account: functions/_wxacct.js), else roughly where you're connecting
// from (Cloudflare's guess, to the city). The forecast is Open-Meteo's, as Weather's is, cached a while for each place
// (to about a kilometre), so many opens of the app ask it once. The phone works out the best time from it, and Rhythm the wet days
// (fitness/besttime.js); nothing is kept here. Chat's plans for two ask for a place's week the same way (hoursAt).
// WXAPP_URL: tests only (a stand-in for Open-Meteo).
import { kept } from "./_wxacct.js";

const HOURS = "temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,is_day";
const TTL = 30 * 60;
const r1 = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 10) / 10);

async function cachedJSON(url) {
  const cache = typeof caches !== "undefined" && caches.default ? caches.default : null, key = new Request(url);
  if (cache) { const hit = await cache.match(key); if (hit) return hit.json(); }
  const r = await fetch(url, { headers: { "User-Agent": "inflite.ai Fitness" }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`forecast ${r.status}`);
  const text = await r.text();
  if (cache) await cache.put(key, new Response(text, { headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${TTL}` } }));
  return JSON.parse(text);
}

// → { place: { name }, offset (seconds from UTC, the place's clock), hours: [{ t, temp, feels, pop, rain, code, wind,
//   gust, dir, day }] }, or { place: null } where there's nowhere to go on
export async function rideWeather(env, userId, request) {
  const saved = (await kept(env, userId).catch(() => null))?.data?.places?.[0];
  const cf = request.cf || {};
  const place = saved ? { name: saved.name, lat: saved.lat, lon: saved.lon }
    : Number.isFinite(Number(cf.latitude)) && Number.isFinite(Number(cf.longitude)) ? { name: cf.city || cf.region || "Near you", lat: Number(cf.latitude), lon: Number(cf.longitude), rough: true } : null;
  if (!place) return { place: null };
  const { offset, hours } = await hoursAt(env, place.lat, place.lon);
  return { place: { name: place.name, rough: !!place.rough }, offset, hours };
}

// A place's week, hour by hour (to about a kilometre, kept a while for it): also Chat's plans for two (functions/_share.js
// together), each person's place asked for on its own. → { offset, hours } as rideWeather has them
export async function hoursAt(env, lat, lon) {
  const base = env.WXAPP_URL || "https://api.open-meteo.com";
  const d = await cachedJSON(`${base}/v1/forecast?latitude=${Number(lat).toFixed(2)}&longitude=${Number(lon).toFixed(2)}&hourly=${HOURS}&forecast_days=7&timezone=auto&timeformat=unixtime&wind_speed_unit=kmh`);
  const H = d?.hourly || {}, t = Array.isArray(H.time) ? H.time : [];
  const hours = t.slice(0, 168).map((s, i) => ({ t: s * 1000, temp: r1(H.temperature_2m?.[i]), feels: r1(H.apparent_temperature?.[i]), pop: r1(H.precipitation_probability?.[i]),
    rain: r1(H.precipitation?.[i]), code: H.weather_code?.[i] ?? null, wind: r1(H.wind_speed_10m?.[i]), gust: r1(H.wind_gusts_10m?.[i]), dir: H.wind_direction_10m?.[i] ?? null, day: H.is_day?.[i] === 1 }));
  return { offset: Number(d?.utc_offset_seconds) || 0, hours };
}

// Whether each of the last 56 days was wet or dry at a place, hour by hour (Today First's habit rule, functions/
// _todayacts.js habitRide: a weekday's ride counts toward the habit only on the days it could have been ridden). Contract:
// → { "YYYY-MM-DD": { [hour]: true (wet) | false (dry) } } for the last 56 days on the place's own clock, or null when
// it isn't known. Open-Meteo's forecast address with past_days=56 and hourly=precipitation,weather_code, kept a day for
// each 0.05° cell, not charged to Weather's allowance (as hoursAt isn't). t: now (ms).
// (B0's stub: unknown, always. Batch F writes it; the name and arguments stay.)
export async function pastWet(env, lat, lon, t) {
  return null;
}
