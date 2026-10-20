// Made-up Open-Meteo answers for the Weather app's end-to-end test (wxapp.mjs), shaped exactly
// like the real ones, for a spot in London around the time the test runs (in UTC, so the
// clocks changing never moves an hour). A scenario adds weather worth talking about:
//   rainIn   minutes until a shower (an hour of it)       frost   below freezing tonight
//   gust     km/h, tomorrow afternoon                     uv      a peak UV today
import { sunAt, skyDay } from "../../../weather/sky.js";

const H = 3600e3, D = 864e5, LAT = 51.5072, LON = -0.1276;
const iso = (t) => new Date(t).toISOString().slice(0, 16), day = (t) => new Date(t).toISOString().slice(0, 10);

export function forecast(now, sc = {}) {
  const start = Math.floor(now / D) * D - D, hours = [], rainAt = sc.rainIn != null ? now + sc.rainIn * 60e3 : null;
  for (let t = start; t < start + 17 * D; t += H) {
    const hh = new Date(t).getUTCHours(), k = Math.floor((t - start) / D) - 1;
    let temp = 11 + 4 * Math.sin(((hh - 9) / 24) * 2 * Math.PI), precip = 0, code = 2, gust = 25, cloud = 50, uv = Math.max(0, sunAt(t + H / 2, LAT, LON).alt / 12);
    if (sc.frost && k === 1 && hh <= 7) temp = -2;
    if (sc.gust && k === 1 && hh >= 13 && hh <= 16) gust = sc.gust;
    if (sc.uv && k === 0) uv = Math.max(0, sc.uv * Math.sin(((hh - 6) / 13) * Math.PI));
    if (rainAt != null && t + H > rainAt && t < rainAt + H) { precip = 2; code = 63; cloud = 100; }
    if (k === 3) { precip = hh >= 9 && hh < 18 ? 1.5 : 0; code = precip ? 63 : 3; cloud = 95; }
    hours.push({ t, temp, feels: temp - 2, precip, code, gust, cloud, uv, isDay: sunAt(t + H / 2, LAT, LON).alt > 0 });
  }
  const col = (f) => hours.map(f);
  const daily = { time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [], apparent_temperature_max: [], apparent_temperature_min: [], sunrise: [], sunset: [], daylight_duration: [], sunshine_duration: [], uv_index_max: [], precipitation_sum: [], rain_sum: [], showers_sum: [], snowfall_sum: [], precipitation_hours: [], precipitation_probability_max: [], wind_speed_10m_max: [], wind_gusts_10m_max: [], wind_direction_10m_dominant: [], shortwave_radiation_sum: [], et0_fao_evapotranspiration: [] };
  for (let d0 = start; d0 < start + 17 * D; d0 += D) {
    const hs = hours.filter((x) => x.t >= d0 && x.t < d0 + D), s = skyDay(d0, LAT, LON);
    daily.time.push(day(d0)); daily.weather_code.push(Math.max(...hs.map((x) => x.code)));
    daily.temperature_2m_max.push(Math.max(...hs.map((x) => x.temp))); daily.temperature_2m_min.push(Math.min(...hs.map((x) => x.temp)));
    daily.apparent_temperature_max.push(Math.max(...hs.map((x) => x.feels))); daily.apparent_temperature_min.push(Math.min(...hs.map((x) => x.feels)));
    daily.sunrise.push(iso(s.sunrise)); daily.sunset.push(iso(s.sunset)); daily.daylight_duration.push((s.sunset - s.sunrise) / 1000);
    daily.sunshine_duration.push(hs.filter((x) => x.isDay && !x.precip).length * 1800); daily.uv_index_max.push(Math.max(...hs.map((x) => x.uv)));
    const p = hs.reduce((a, x) => a + x.precip, 0);
    daily.precipitation_sum.push(p); daily.rain_sum.push(p); daily.showers_sum.push(0); daily.snowfall_sum.push(0);
    daily.precipitation_hours.push(hs.filter((x) => x.precip).length); daily.precipitation_probability_max.push(p ? 90 : 10);
    daily.wind_speed_10m_max.push(18); daily.wind_gusts_10m_max.push(Math.max(...hs.map((x) => x.gust))); daily.wind_direction_10m_dominant.push(240);
    daily.shortwave_radiation_sum.push(8); daily.et0_fao_evapotranspiration.push(1.5);
  }
  const cur = hours.find((x) => x.t <= now && now < x.t + H);
  const q0 = Math.floor(now / 900e3) * 900e3, mins = Array.from({ length: 17 }, (_, i) => q0 + i * 900e3);
  const wetQ = (t) => rainAt != null && t > rainAt && t - 900e3 < rainAt + H;      // (the quarter up to t has some of the hour's rain)
  return {
    latitude: LAT, longitude: LON, timezone: "UTC", timezone_abbreviation: "UTC", utc_offset_seconds: 0, elevation: 20,
    current: { time: iso(q0), temperature_2m: cur.temp, relative_humidity_2m: 70, apparent_temperature: cur.feels, is_day: cur.isDay ? 1 : 0, precipitation: 0, weather_code: cur.code, cloud_cover: cur.cloud, pressure_msl: 1016, wind_speed_10m: 15, wind_direction_10m: 240, wind_gusts_10m: cur.gust, dew_point_2m: 6, visibility: 24000, uv_index: cur.uv },
    // (as Open-Meteo gives them: each quarter hour's rain is the 15 minutes up to its time)
    minutely_15: { time: mins.map(iso), precipitation: mins.map((t) => (wetQ(t) ? 0.5 : 0)), weather_code: mins.map((t) => (wetQ(t) ? 63 : 2)) },
    hourly: {
      time: col((x) => iso(x.t)), temperature_2m: col((x) => x.temp), apparent_temperature: col((x) => x.feels), relative_humidity_2m: col(() => 70), dew_point_2m: col(() => 6),
      precipitation_probability: col((x) => (x.precip ? 90 : 10)), precipitation: col((x) => x.precip), rain: col((x) => x.precip), showers: col(() => 0), snowfall: col(() => 0), snow_depth: col(() => 0),
      weather_code: col((x) => x.code), pressure_msl: col(() => 1016), cloud_cover: col((x) => x.cloud), cloud_cover_low: col((x) => x.cloud / 2), cloud_cover_mid: col(() => 30), cloud_cover_high: col(() => 40),
      visibility: col(() => 24000), wind_speed_10m: col(() => 15), wind_direction_10m: col(() => 240), wind_gusts_10m: col((x) => x.gust), uv_index: col((x) => x.uv), is_day: col((x) => (x.isDay ? 1 : 0)),
      cape: col(() => 0), lifted_index: col(() => null), freezing_level_height: col(() => 1500), vapour_pressure_deficit: col(() => 0.7), sunshine_duration: col((x) => (x.isDay && !x.precip ? 1800 : 0)),
    },
    daily,
  };
}
export function models(now, sc = {}) {
  const start = Math.floor(now / D) * D, d = { time: [] };
  const ids = ["ecmwf_ifs", "ukmo_seamless", "gfs_seamless", "icon_seamless", "meteofrance_seamless", "gem_seamless"];
  for (let k = 0; k < 10; k++) d.time.push(day(start + k * D));
  ids.forEach((id, j) => {
    // they agree for a few days, then fall apart on day 4
    d[`temperature_2m_max_${id}`] = d.time.map((_, k) => (k === 4 ? 9 + j * 1.6 : 15 + j * 0.1));
    // (and agree with the forecast on a frosty night: it's one of them)
    d[`temperature_2m_min_${id}`] = d.time.map((_, k) => (sc.frost && k === 1 ? -2 : 7));
    d[`precipitation_sum_${id}`] = d.time.map((_, k) => (k === 4 ? (j % 2 ? 6 : 0) : k === 2 ? 12 : 0));
    d[`wind_gusts_10m_max_${id}`] = d.time.map(() => 30);
    d[`weather_code_${id}`] = d.time.map(() => 3);
  });
  return { latitude: LAT, longitude: LON, timezone: "UTC", utc_offset_seconds: 0, daily: d };
}
export function ensemble(now, sc = {}) {
  const start = Math.floor(now / D) * D, h = { time: [] };
  for (let t = start; t < start + 10 * D; t += H) h.time.push(iso(t));
  // (wet where the forecast's wet, in nine of ten runs: the ensembles agree with it, as they would)
  const fc = forecast(now, sc).hourly, wetAt = new Set(fc.time.filter((_, i) => fc.precipitation[i] > 0));
  // (two of the ensembles, as Open-Meteo names them asked for together: ECMWF's 51 runs and GFS's 31; ten of ECMWF's and
  // six of GFS's bring a little rain through the next three days: 41 of 51 and 25 of 31 stay dry, whatever the hour,
  // which with each system its say is 81%)
  for (const [sys, runs, wet] of [["ecmwf_ifs025_ensemble", 51, 10], ["ncep_gefs025", 31, 6]]) for (let m = 0; m < runs; m++) {
    const sfx = `${m ? `_member${String(m).padStart(2, "0")}` : ""}_${sys}`;
    // (each system's runs spread alike: ±1° now, widening further ahead)
    h[`temperature_2m${sfx}`] = h.time.map((s, i) => 11 + 4 * Math.sin(((i % 24 - 9) / 24) * 2 * Math.PI) + (m / (runs - 1) - 0.5) * 2 * (1 + i / 48));
    h[`precipitation${sfx}`] = h.time.map((s, i) => (wetAt.has(s) ? (m < runs * 0.9 ? 1.5 : 0) : m >= 1 && m <= wet && i < 72 ? 0.3 : 0));
  }
  return { latitude: LAT, longitude: LON, timezone: "UTC", utc_offset_seconds: 0, hourly: h };
}
export function air(now) {
  const start = Math.floor(now / H) * H - 24 * H, time = [];
  for (let t = start; t < start + 5 * D; t += H) time.push(iso(t));
  return { current: { time: iso(Math.floor(now / H) * H), european_aqi: 18, us_aqi: 20, pm2_5: 4, pm10: 9, ozone: 50, nitrogen_dioxide: 8 },
    hourly: { time, european_aqi: time.map(() => 18), us_aqi: time.map(() => 20), pm2_5: time.map(() => 4), pm10: time.map(() => 9), alder_pollen: time.map(() => 0), birch_pollen: time.map(() => 0), grass_pollen: time.map(() => 2), mugwort_pollen: time.map(() => 0), olive_pollen: time.map(() => 0), ragweed_pollen: time.map(() => 0) } };
}
// thirty years of London-ish days, the same every run
export function archive(now) {
  const y1 = new Date(now).getUTCFullYear() - 1, time = [], tmax = [], tmin = [], rain = [];
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let t = Date.UTC(y1 - 29, 0, 1); t <= Date.UTC(y1, 11, 31); t += D) {
    const d = new Date(t), doy = (t - Date.UTC(d.getUTCFullYear(), 0, 1)) / D, s = Math.sin(((doy - 110) / 365.25) * 2 * Math.PI);
    time.push(day(t)); tmax.push(+(15 + 8 * s + (rnd() - 0.5) * 8).toFixed(1)); tmin.push(+(7 + 6 * s + (rnd() - 0.5) * 7).toFixed(1)); rain.push(rnd() < 0.45 ? +(rnd() * 8).toFixed(1) : 0);
  }
  return { latitude: LAT, longitude: LON, timezone: "UTC", daily: { time, temperature_2m_max: tmax, temperature_2m_min: tmin, precipitation_sum: rain } };
}
// the sea (Open-Meteo's marine forecast, its nearest sea cell): for Bacton, on the Norfolk coast, a cell 10 km off it;
// anywhere else, the nearest is far out (as for London: the Thames estuary's mouth, too far to be its sea)
export const BACTON = { lat: 52.86, lon: 1.47 };
export function marine(now, url) {
  const q = new URL(url).searchParams, near = Math.abs(+q.get("latitude") - BACTON.lat) < 0.05 && Math.abs(+q.get("longitude") - BACTON.lon) < 0.05;
  const start = Math.floor(now / D) * D, time = [];
  for (let t = start; t < start + 7 * D; t += H) time.push(iso(t));
  // (the tide: a semi-diurnal 12.42-hour swing of 1.6 m either way; waves building to 1.4 m tomorrow afternoon)
  const at = (s) => Date.parse(`${s}:00Z`);
  return { latitude: near ? 52.95 : 51.45, longitude: near ? 1.5 : 1.2, timezone: "UTC", utc_offset_seconds: 0,
    hourly: { time, wave_height: time.map((s) => +(0.6 + 0.8 * Math.max(0, Math.sin(((at(s) - start - 30 * H) / (12 * H)) * Math.PI))).toFixed(2)),
      wave_direction: time.map(() => 45), wave_period: time.map(() => 6.5), sea_surface_temperature: time.map(() => 14.2),
      sea_level_height_msl: time.map((s) => +(1.6 * Math.cos(((at(s) - start - 3 * H) / (12.42 * H)) * 2 * Math.PI)).toFixed(2)) } };
}
