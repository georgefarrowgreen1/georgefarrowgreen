// The forecast: asked of Open-Meteo (free, no key) straight from your phone,
// shaped into the one form the insights and the page use, and kept on the
// phone so the app opens instantly (and offline) with what it last knew.
//
//   forecast     the best forecast for the spot: now, 15-minute rain for 4 hours, hourly, 16 days
//   models       six of the world's big models side by side, to see if they agree
//   ensemble     ECMWF's 51-run ensemble: how wide the possibilities are
//   air          air quality and pollen
//   climate      30 years of this place's days (once per place, kept for a year)
//   warnings     official warnings, from the place's own weather service (asked by this site's server:
//                functions/_wxwarn.js)
//
// Nothing about you is sent beyond the spot asked about (and, to name where you are, your position
// as your phone gives it: BigDataCloud's free service is for exactly that, and only that). Data by
// Open-Meteo.com (CC BY 4.0).

import { parseWall, keyOf, HOUR } from "./format.js";
import { compactClimate, climateSpan } from "./climate.js";
import { MODELS, shapePrevious, skillFrom, MIN_DAYS } from "./skill.js";
export { MODELS };

const API = {
  forecast: "https://api.open-meteo.com/v1/forecast",
  ensemble: "https://ensemble-api.open-meteo.com/v1/ensemble",
  air: "https://air-quality-api.open-meteo.com/v1/air-quality",
  archive: "https://archive-api.open-meteo.com/v1/archive",
  previous: "https://previous-runs-api.open-meteo.com/v1/forecast",
  geocode: "https://geocoding-api.open-meteo.com/v1/search",
  reverse: "https://api.bigdatacloud.net/data/reverse-geocode-client",
  reverse2: "https://nominatim.openstreetmap.org/reverse",
};
const CURRENT = "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,dew_point_2m,visibility,uv_index";
const HOURLY = "temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,precipitation_probability,precipitation,rain,showers,snowfall,snow_depth,weather_code,pressure_msl,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,is_day,cape,lifted_index,freezing_level_height,vapour_pressure_deficit,sunshine_duration";
const DAILY = "weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,daylight_duration,sunshine_duration,uv_index_max,precipitation_sum,rain_sum,showers_sum,snowfall_sum,precipitation_hours,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,shortwave_radiation_sum,et0_fao_evapotranspiration";
const MODEL_DAILY = "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max,weather_code";

/* ---------- shaping ---------- */
const num = (v) => (v == null || Number.isNaN(Number(v)) ? null : Number(v));
const col = (o, k, i) => (o && Array.isArray(o[k]) ? num(o[k][i]) : null);
const QUARTER = 15 * 60e3;

export function shapeForecast(j, place = {}) {
  const h = j.hourly || {}, d = j.daily || {}, m = j.minutely_15 || {}, c = j.current || {};
  const hourly = (h.time || []).map((t, i) => ({
    t: parseWall(t), temp: col(h, "temperature_2m", i), feels: col(h, "apparent_temperature", i), rh: col(h, "relative_humidity_2m", i),
    dew: col(h, "dew_point_2m", i), pop: col(h, "precipitation_probability", i), precip: col(h, "precipitation", i) ?? 0,
    rain: col(h, "rain", i), showers: col(h, "showers", i), snow: col(h, "snowfall", i) ?? 0, snowDepth: col(h, "snow_depth", i),
    code: col(h, "weather_code", i) ?? 0, pressure: col(h, "pressure_msl", i), cloud: col(h, "cloud_cover", i),
    cloudLow: col(h, "cloud_cover_low", i), cloudMid: col(h, "cloud_cover_mid", i), cloudHigh: col(h, "cloud_cover_high", i),
    vis: col(h, "visibility", i), wind: col(h, "wind_speed_10m", i), dir: col(h, "wind_direction_10m", i), gust: col(h, "wind_gusts_10m", i),
    uv: col(h, "uv_index", i), isDay: col(h, "is_day", i) === 1, cape: col(h, "cape", i), li: col(h, "lifted_index", i),
    fz: col(h, "freezing_level_height", i), vpd: col(h, "vapour_pressure_deficit", i), sun: col(h, "sunshine_duration", i),
  })).filter((x) => x.temp != null);
  const daily = (d.time || []).map((t, i) => ({
    date: parseWall(t), key: t, code: col(d, "weather_code", i) ?? 0, tmax: col(d, "temperature_2m_max", i), tmin: col(d, "temperature_2m_min", i),
    fmax: col(d, "apparent_temperature_max", i), fmin: col(d, "apparent_temperature_min", i),
    sunrise: d.sunrise?.[i] ? parseWall(d.sunrise[i]) : null, sunset: d.sunset?.[i] ? parseWall(d.sunset[i]) : null,
    daylight: col(d, "daylight_duration", i), sunshine: col(d, "sunshine_duration", i), uvMax: col(d, "uv_index_max", i),
    precip: col(d, "precipitation_sum", i) ?? 0, rain: col(d, "rain_sum", i), showers: col(d, "showers_sum", i), snow: col(d, "snowfall_sum", i) ?? 0,
    precipHours: col(d, "precipitation_hours", i), popMax: col(d, "precipitation_probability_max", i),
    windMax: col(d, "wind_speed_10m_max", i), gustMax: col(d, "wind_gusts_10m_max", i), dir: col(d, "wind_direction_10m_dominant", i),
    radiation: col(d, "shortwave_radiation_sum", i), et0: col(d, "et0_fao_evapotranspiration", i),
  })).filter((x) => x.tmax != null);
  // (a quarter hour's rain is the 15 minutes up to its time, as Open-Meteo gives it: each is kept by when it starts)
  const minutely = (m.time || []).map((t, i) => ({ t: parseWall(t) - QUARTER, precip: col(m, "precipitation", i) ?? 0, code: col(m, "weather_code", i) ?? 0 }));
  const current = c.time ? {
    t: parseWall(c.time), temp: num(c.temperature_2m), feels: num(c.apparent_temperature), rh: num(c.relative_humidity_2m), dew: num(c.dew_point_2m),
    precip: num(c.precipitation) ?? 0, code: num(c.weather_code) ?? 0, cloud: num(c.cloud_cover), pressure: num(c.pressure_msl),
    wind: num(c.wind_speed_10m), dir: num(c.wind_direction_10m), gust: num(c.wind_gusts_10m), vis: num(c.visibility), uv: num(c.uv_index), isDay: num(c.is_day) === 1,
  } : null;
  return {
    place: { name: place.name || "", region: place.region || "", lat: place.lat ?? j.latitude, lon: place.lon ?? j.longitude, tz: j.timezone, tzAbbr: j.timezone_abbreviation, offset: j.utc_offset_seconds ?? 0, elevation: j.elevation },
    current, minutely, hourly, daily,
  };
}

// six models' daily figures → { list: [[id, name, about]], days: { key: [{ id, name, tmax, tmin, precip, gust, code }] } }
export function shapeModels(j) {
  const d = j?.daily; if (!d?.time) return null;
  const days = {}, list = MODELS.filter(([id]) => Array.isArray(d[`temperature_2m_max_${id}`]) && d[`temperature_2m_max_${id}`].some((v) => v != null));
  d.time.forEach((t, i) => {
    days[t] = list.map(([id, name]) => ({ id, name, tmax: col(d, `temperature_2m_max_${id}`, i), tmin: col(d, `temperature_2m_min_${id}`, i), precip: col(d, `precipitation_sum_${id}`, i), gust: col(d, `wind_gusts_10m_max_${id}`, i), code: col(d, `weather_code_${id}`, i) }))
      .filter((x) => x.tmax != null);
  });
  return list.length ? { list, days } : null;
}

// the ensemble's runs → the spread of temperature each hour, the share of runs wet each hour, and each day's spread
const q = (s, p) => { if (!s.length) return null; const i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); };
export function shapeEnsemble(j) {
  const h = j?.hourly; if (!h?.time) return null;
  const tKeys = Object.keys(h).filter((k) => /^temperature_2m(_member\d+)?$/.test(k)), pKeys = Object.keys(h).filter((k) => /^precipitation(_member\d+)?$/.test(k));
  if (tKeys.length < 5) return null;
  const hourly = [], byDay = {};
  h.time.forEach((t, i) => {
    const temps = tKeys.map((k) => num(h[k][i])).filter((v) => v != null).sort((a, b) => a - b);
    const rains = pKeys.map((k) => num(h[k][i])).filter((v) => v != null);
    if (!temps.length) return;
    const w = parseWall(t), key = t.slice(0, 10);
    hourly.push({ t: w, p10: q(temps, 0.1), p50: q(temps, 0.5), p90: q(temps, 0.9), wet: rains.length ? rains.filter((v) => v >= 0.1).length / rains.length : null });
    const day = byDay[key] || (byDay[key] = { n: 0, max: {}, min: {}, rain: {} });
    day.n++;
    tKeys.forEach((k) => { const v = num(h[k][i]); if (v == null) return; day.max[k] = Math.max(day.max[k] ?? -99, v); day.min[k] = Math.min(day.min[k] ?? 99, v); });
    pKeys.forEach((k) => { const v = num(h[k][i]); if (v != null) day.rain[k] = (day.rain[k] ?? 0) + v; });
  });
  const days = {};
  for (const [key, d] of Object.entries(byDay)) {
    if (d.n < 4) continue;       // (past six days out the ensemble is 3- then 6-hourly)
    const mx = Object.values(d.max).sort((a, b) => a - b), mn = Object.values(d.min).sort((a, b) => a - b), rs = Object.values(d.rain).sort((a, b) => a - b);
    days[key] = { tmaxP10: q(mx, 0.1), tmaxP50: q(mx, 0.5), tmaxP90: q(mx, 0.9), tminP10: q(mn, 0.1), tminP90: q(mn, 0.9), wet: rs.length ? rs.filter((v) => v >= 1).length / rs.length : null, rainP50: q(rs, 0.5), rainP90: q(rs, 0.9), members: mx.length };
  }
  return { hourly, days, members: tKeys.length };
}

export function shapeAir(j) {
  if (!j?.hourly?.time) return null;
  const h = j.hourly, c = j.current || {};
  return {
    current: c.time ? { t: parseWall(c.time), eaqi: num(c.european_aqi), usaqi: num(c.us_aqi), pm25: num(c.pm2_5), pm10: num(c.pm10), o3: num(c.ozone), no2: num(c.nitrogen_dioxide) } : null,
    hourly: h.time.map((t, i) => ({
      t: parseWall(t), eaqi: col(h, "european_aqi", i), usaqi: col(h, "us_aqi", i), pm25: col(h, "pm2_5", i), pm10: col(h, "pm10", i),
      alder: col(h, "alder_pollen", i), birch: col(h, "birch_pollen", i), grass: col(h, "grass_pollen", i), mugwort: col(h, "mugwort_pollen", i), olive: col(h, "olive_pollen", i), ragweed: col(h, "ragweed_pollen", i),
    })),
  };
}

/* ---------- asking ---------- */
const r4 = (v) => Math.round(v * 1e4) / 1e4;
async function getJSON(url, ms = 12000, tries = 2) {
  for (let k = 1; ; k++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { Accept: "application/json" } });
      if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e; }
      return await res.json();
    } catch (e) {
      // a dropped connection or a hiccup at their end is worth one more go; being turned away (4xx) isn't
      if (k >= tries || (e.status && e.status < 500)) throw e;
      await new Promise((ok) => setTimeout(ok, 1200));
    }
  }
}
const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v != null)).toString();

// the forecast's question (the server asks the same one for notifications: functions/_wxpush.js); lat and lon may be lists
export const forecastQuery = (lat, lon, days = 16) => qs({ latitude: [].concat(lat).map(r4).join(","), longitude: [].concat(lon).map(r4).join(","), current: CURRENT, minutely_15: "precipitation,weather_code", forecast_minutely_15: 17, hourly: HOURLY, daily: DAILY, past_days: 1, forecast_days: days, timezone: "auto" });
// just what a rain alert needs: the next four hours of rain, by the quarter hour (the server asks this every ten minutes)
// (both ask for 17 quarters: the first is the one just gone)
export const rainQuery = (lat, lon) => qs({ latitude: [].concat(lat).map(r4).join(","), longitude: [].concat(lon).map(r4).join(","), current: "precipitation,weather_code", minutely_15: "precipitation,weather_code", forecast_minutely_15: 17, timezone: "auto" });
export const fetchForecast = (lat, lon) => getJSON(`${API.forecast}?${forecastQuery(lat, lon)}`);
export const fetchModels = (lat, lon) => getJSON(`${API.forecast}?${qs({ latitude: r4(lat), longitude: r4(lon), models: MODELS.map((m) => m[0]).join(","), daily: MODEL_DAILY, forecast_days: 10, timezone: "auto" })}`);
export const fetchEnsemble = (lat, lon) => getJSON(`${API.ensemble}?${qs({ latitude: r4(lat), longitude: r4(lon), models: "ecmwf_ifs025", hourly: "temperature_2m,precipitation", forecast_days: 10, timezone: "auto" })}`, 15000);
export const fetchAir = (lat, lon) => getJSON(`${API.air}?${qs({ latitude: r4(lat), longitude: r4(lon), current: "european_aqi,us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide", hourly: "european_aqi,us_aqi,pm2_5,pm10,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen", forecast_days: 5, timezone: "auto" })}`);
// (ERA5-Land's temperatures, with ERA5 where it has none: one consistent record over the 30 years, rather than the
// archive's best match, which splices ERA5, ERA5-Land and the 9 km model from 2017 and shifts normals and records)
export const fetchClimate = (lat, lon, nowW) => { const s = climateSpan(nowW); return getJSON(`${API.archive}?${qs({ latitude: r4(lat), longitude: r4(lon), start_date: s.start, end_date: s.end, daily: "temperature_2m_max,temperature_2m_min,precipitation_sum", models: "era5_seamless", timezone: "auto" })}`, 30000, 1); };

// Official warnings for a place (this site's server asks its weather service: functions/_wxwarn.js)
export async function fetchWarnings(lat, lon) {
  const r = await fetch(`/api/weather/warnings?${qs({ lat: (Math.round(lat * 100) / 100).toFixed(2), lon: (Math.round(lon * 100) / 100).toFixed(2) })}`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`warnings ${r.status}`);
  return r.json();
}

// Search for a place by name
export async function searchPlaces(name) {
  const j = await getJSON(`${API.geocode}?${qs({ name, count: 8, language: "en", format: "json" })}`, 8000);
  return (j.results || []).map((r) => ({ name: r.name, region: [r.admin1, r.country].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(", "), country: r.country_code, lat: r.latitude, lon: r.longitude }));
}
// A name for where a phone is (BigDataCloud's free lookup, made for exactly this)
// A place's name from its position: BigDataCloud, or if that doesn't answer (or a blocker stops it),
// OpenStreetMap's Nominatim (only then, as it asks to be used lightly)
// live: a position just given by the phone (BigDataCloud's free service takes only those: a kept one goes to
// Nominatim alone)
export async function nameOf(lat, lon, { live = true } = {}) {
  if (live) try {
    const j = await getJSON(`${API.reverse}?${qs({ latitude: r4(lat), longitude: r4(lon), localityLanguage: "en" })}`, 6000);
    const name = j.locality && j.city && j.locality.length <= j.city.length + 12 && !/^(City of|Borough of|London Borough)/.test(j.locality) ? j.locality : j.city || j.locality || j.principalSubdivision;
    if (name) return { name, region: [j.city !== name ? j.city : null, j.countryCode === "GB" ? j.principalSubdivision : j.countryName].filter(Boolean).join(", ") };
  } catch (_) { /* the other, below */ }
  try {
    const j = await getJSON(`${API.reverse2}?${qs({ format: "jsonv2", lat: r4(lat), lon: r4(lon), zoom: 14, "accept-language": "en" })}`, 8000, 1), a = j.address || {};
    const name = a.town || a.village || a.hamlet || a.suburb || a.city || a.municipality || a.county;
    return name ? { name, region: [a.city && a.city !== name ? a.city : null, a.country_code === "gb" ? a.state : a.country].filter(Boolean).join(", ") } : null;
  } catch (_) { return null; }
}

/* ---------- kept on the phone ---------- */
const store = {
  get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (_) {} },
};
export { store };
export const cell = (lat, lon) => `${(Math.round(lat * 10) / 10).toFixed(1)},${(Math.round(lon * 10) / 10).toFixed(1)}`;
// what's kept for a place, at a glance (for the list of places): { temp, code, isDay, at } or null
export function peek(place) {
  const c = store.get(`wx:${cell(place.lat, place.lon)}`)?.forecast;
  return c?.j?.current ? { temp: c.j.current.temperature_2m, code: c.j.current.weather_code, isDay: c.j.current.is_day === 1, at: c.at } : null;
}
// how long each kind is good for
const TTL = { forecast: 10 * 60e3, models: 60 * 60e3, ensemble: 60 * 60e3, air: 60 * 60e3, warnings: 5 * 60e3 };

// Load everything for a place. onUpdate(wx, { partial, stale }) is called as each piece arrives
// (first with whatever's kept, if anything), so the page fills in as fast as it can.
export async function load(place, onUpdate, { force = false } = {}) {
  const id = cell(place.lat, place.lon), key = `wx:${id}`, stored = store.get(key), kept = stored && typeof stored === "object" ? stored : {};
  const raw = { ...kept };
  const fresh = (k) => !force && kept[k] && Date.now() - kept[k].at < TTL[k];
  const build = () => {
    if (!raw.forecast) return null;
    const wx = shapeForecast(raw.forecast.j, place);
    wx.fetchedAt = raw.forecast.at;
    wx.models = raw.models ? shapeModels(raw.models.j) : null;
    wx.ensemble = raw.ensemble ? raw.ensemble.s || shapeEnsemble(raw.ensemble.j) : null;
    wx.air = raw.air ? shapeAir(raw.air.j) : null;
    wx.official = Array.isArray(raw.warnings?.j?.warnings) ? raw.warnings.j.warnings : null;
    wx.climate = climateFor(place);
    wx.skill = skillKept(place);
    return wx;
  };
  // what's kept from before, straight away (unless it's damaged: then it's dropped, and the network's asked)
  if (raw.forecast) {
    let wx = null;
    try { wx = build(); } catch (_) { for (const o of [raw, kept]) for (const k of Object.keys(o)) delete o[k]; store.del(key); store.del(`skill2:${id}`); }
    if (wx) onUpdate(wx, { partial: true, stale: !fresh("forecast") });
  }
  const save = () => {
    if (!store.set(key, raw)) { pruneCache(key); store.set(key, raw); }
  };
  const get = async (k, fn) => {
    if (fresh(k)) return;
    try {
      const j = await fn(place.lat, place.lon);
      // the ensemble is big (51 runs): only its summary is kept
      raw[k] = k === "ensemble" ? { at: Date.now(), s: shapeEnsemble(j) } : { at: Date.now(), j };
      save(); onUpdate(build(), { partial: k !== "forecast", stale: false });
    }
    catch (e) { if (k === "forecast") throw e; }
  };
  // the forecast first (the page needs it); the rest alongside
  const main = get("forecast", fetchForecast);
  const extras = Promise.all([get("models", fetchModels), get("ensemble", fetchEnsemble), get("air", fetchAir), get("warnings", fetchWarnings)]);
  try { await main; } catch (e) { if (!raw.forecast) throw e; onUpdate(build(), { partial: false, stale: true, error: e }); }
  await extras;
  // the climate, once a year per place, in the background (it's a lot to ask for)
  climateSoon(place, (c) => { if (c !== null && raw.forecast) onUpdate(build(), { partial: false, stale: false }); });
  // how the models have done here, twice a day per place, in the background too
  if (raw.forecast) loadSkill(place).then((k) => { if (k) onUpdate(build(), { partial: false, stale: false }); });
  return build();
}
// keep only the newest few places' forecasts when the phone's storage fills
function pruneCache(except) {
  try {
    const ks = Object.keys(localStorage).filter((k) => k.startsWith("wx:") && k !== except);
    const aged = ks.map((k) => ({ k, at: store.get(k)?.forecast?.at || 0 })).sort((a, b) => a.at - b.at);
    for (const { k } of aged.slice(0, Math.max(1, aged.length - 4))) store.del(k);
  } catch (_) {}
}

// (what earlier versions kept, on a record since replaced: cleared once)
try { for (const k of Object.keys(localStorage)) if (k.startsWith("clim:") || k.startsWith("skill:")) localStorage.removeItem(k); } catch (_) {}
const climateMemo = new Map();
export function climateFor(place) {
  const id = cell(place.lat, place.lon);
  if (climateMemo.has(id)) return climateMemo.get(id);
  const c = store.get(`clim2:${id}`);
  if (c?.data) { climateMemo.set(id, c.data); return c.data; }
  return null;
}
// The climate's a big ask (thirty years: Open-Meteo counts it as about 235 of the 600 requests a minute it allows
// each phone), so it's asked for once a place has been on screen a few seconds, and only one in any 70 seconds
// (looking through several new places can't use up the minute and stop the forecasts coming)
let climateAt = 0, climateWait = null;
function climateSoon(place, then) {
  clearTimeout(climateWait);
  const kept = store.get(`clim2:${cell(place.lat, place.lon)}`);
  if (kept?.data && Date.now() - kept.at < 365 * 864e5) return;
  climateWait = setTimeout(() => { climateAt = Date.now(); loadClimate(place).then(then); }, Math.max(3000, climateAt + 70e3 - Date.now()));
}
async function loadClimate(place) {
  const id = cell(place.lat, place.lon), k = `clim2:${id}`, kept = store.get(k);
  if (kept?.data && Date.now() - kept.at < 365 * 864e5) return null;
  if (kept?.failedAt && Date.now() - kept.failedAt < 6 * 3600e3) return null;   // asked recently and turned away: wait
  try {
    const data = compactClimate(await fetchClimate(place.lat, place.lon, Date.now()));
    if (!data) throw new Error("empty");
    climateMemo.set(id, data);
    if (!store.set(k, { at: Date.now(), data })) {
      // no room: make some by dropping other places' climates
      for (const o of Object.keys(localStorage).filter((x) => x.startsWith("clim2:") && x !== k)) store.del(o);
      store.set(k, { at: Date.now(), data });
    }
    return data;
  } catch (_) {
    store.set(k, { ...(kept || {}), failedAt: Date.now() });
    return false;       // (so the page can say it'll try later)
  }
}

/* ---------- how the models have done here ---------- */
// { at, station: { id, name, km } | null, obsDays, skill | null } — kept for 12 hours per place
const SKILL_TTL = 12 * 3600e3;
export const skillKept = (place) => store.get(`skill2:${cell(place.lat, place.lon)}`);
async function loadSkill(place) {
  const k = `skill2:${cell(place.lat, place.lon)}`, kept = store.get(k);
  if (kept && Date.now() - kept.at < (kept.failed ? 3 * 3600e3 : SKILL_TTL)) return null;
  try {
    // what happened, at the nearest airport (the server collects and keeps these)
    const r = await fetch(`/api/weather/obs?${qs({ lat: (Math.round(place.lat * 100) / 100).toFixed(2), lon: (Math.round(place.lon * 100) / 100).toFixed(2) })}`, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`obs ${r.status}`);
    const o = await r.json(), n = Object.keys(o.days || {}).length;
    let skill = null;
    if (o.station && n >= MIN_DAYS) {
      // what each model said beforehand, there (past forecasts reach back as far as the reports do)
      const back = Math.min(60, Math.ceil((Date.now() - Date.parse(Object.keys(o.days).sort()[0])) / 864e5) + 2);
      const j = await getJSON(`${API.previous}?${qs({ latitude: r4(o.station.lat), longitude: r4(o.station.lon), hourly: "temperature_2m_previous_day1,temperature_2m_previous_day3", models: MODELS.map((m) => m[0]).join(","), past_days: back, forecast_days: 1, timezone: "auto" })}`, 20000, 1);
      skill = skillFrom(shapePrevious(j), o.days);
    }
    const v = { at: Date.now(), station: o.station || null, obsDays: n, skill };
    store.set(k, v);
    return v;
  } catch (_) {
    store.set(k, { ...(kept || {}), at: Date.now(), failed: true });
    return null;
  }
}

export const hourMs = HOUR;
export const dayKey = keyOf;
