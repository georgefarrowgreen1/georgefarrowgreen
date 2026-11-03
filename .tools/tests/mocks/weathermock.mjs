// Stand-in for Open-Meteo: a steady westerly (from 270°), 40 km/h, everywhere.
import http from 'http';
import { appendFileSync } from 'fs';
const [,, log] = process.argv;
let past = null;   // past: the weather of the days gone by, as Fitness's pastWet asks it (past_days ≥ 28, hourly precipitation and weather codes): null or 'dry' (every hour dry), 'wet' (every hour wet), or { wet: ['YYYY-MM-DD' or a weekday, 0 Sunday to 6, …], hours: [from, to] (UTC hours; all day if not given) }
let kp = 2, eonet = [], earthDown = false, ens = null, shower = null;   // shower: { cell: [lat, lon, r°], quarters } heavy rain in the 15-minute forecast only, for its first quarters   // ens: { sd } km/h of disagreement between the ensemble's members (null: no ensemble)   // the Earth's stand-ins: NOAA's Kp (every 3 hours), NASA EONET's open events
let speed = 40, from = 270, down = false, pattern = '', clearAfter = null, cell = null, lane = null, startAfter = null, aloft = 1, metDown = false, cellWx = null, aloft80 = null, aloft180 = null, jet = null;   // jet: { sp, from } the wind 250 hPa up (the jet stream)   // the wind 80 and 180 m up, as multiples of the ground's (default: as 120 m)
   // cellWx: { code, cape, rain } inside the cells instead of a thunderstorm
   // metDown: MET Norway's stand-in fails too
   // aloft: the wind 120 m up, as a multiple of the ground's (null: not given)   // startAfter: hours until the pattern's weather arrives (clear now)
   // lane: a latitude north of which a westerly blows hard (pattern 'lane'), calm south of it
   // cell: [lat, lon, radius°] of thunderstorms (pattern 'cell')   // clearAfter: hours until the pattern's weather clears (hourly forecasts)
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/mode') { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => { const m = JSON.parse(Buffer.concat(c).toString() || '{}'); ({ speed = speed, from = from, down = down, pattern = pattern } = m); clearAfter = m.clearAfter ?? null; cell = m.cell ?? null; lane = m.lane ?? null; startAfter = m.startAfter ?? null; aloft = 'aloft' in m ? m.aloft : 1; metDown = !!m.metDown; cellWx = m.cellWx ?? null; aloft80 = m.aloft80 ?? null; aloft180 = m.aloft180 ?? null; jet = m.jet ?? null; kp = m.kp ?? 2; eonet = m.eonet ?? []; earthDown = !!m.earthDown; ens = m.ens ?? null; shower = m.shower ?? null; past = m.past ?? null; res.end('ok'); }); return; }
  appendFileSync(log, JSON.stringify({ path: u.pathname, q: Object.fromEntries(u.searchParams), headers: req.headers }) + '\n');
  if (u.pathname === '/products/noaa-planetary-k-index-forecast.json') {
    if (earthDown) { res.writeHead(500); return res.end(); }
    const h0 = Math.floor(Date.now() / 10800e3) * 10800e3, rows = [['time_tag', 'kp', 'observed', 'noaa_scale']];
    for (let i = -8; i < 24; i++) rows.push([new Date(h0 + i * 10800e3).toISOString().slice(0, 19).replace('T', ' '), String(kp), i < 0 ? 'observed' : 'predicted', null]);
    res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(rows));
  }
  if (u.pathname === '/v1/ensemble') {
    if (!ens) { res.writeHead(404); return res.end(); }
    const lats = String(u.searchParams.get('latitude')).split(','), n = Number(u.searchParams.get('forecast_hours') || 48), h0 = Math.floor(Date.now() / 3600e3) * 3600;
    const one = (k) => { const hourly = { time: Array.from({ length: n }, (_, h) => h0 + h * 3600), wind_speed_10m: Array(n).fill(speed), wind_direction_10m: Array(n).fill(from) };
      for (let m = 1; m <= 30; m++) { const sp = Math.max(0, speed + ens.sd * Math.sin(m * 2.399 + k)); hourly[`wind_speed_10m_member${String(m).padStart(2, '0')}`] = Array(n).fill(sp); hourly[`wind_direction_10m_member${String(m).padStart(2, '0')}`] = Array(n).fill(from); }
      return { latitude: 0, longitude: 0, hourly }; };
    res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(lats.length > 1 ? lats.map((_, k) => one(k)) : one(0)));
  }
  if (u.pathname === '/api/v3/events') {
    if (earthDown) { res.writeHead(500); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ title: 'EONET Events', events: eonet }));
  }
  const met = u.pathname.startsWith('/weatherapi/');                 // MET Norway's locationforecast (one point)
  if (met ? metDown : down) { res.writeHead(500); return res.end(); }
  const lats = (u.searchParams.get('latitude') || u.searchParams.get('lat') || '').split(','), lons = (u.searchParams.get('longitude') || u.searchParams.get('lon') || '').split(',');
  // (the days gone by, for Fitness's pastWet: past_days=56 with hourly precipitation and weather codes, each hour wet or dry
  // by the pattern POST /mode { past } set; the zone GMT)
  if (!met && !pattern.startsWith('share-') && Number(u.searchParams.get('past_days')) >= 28 && /precipitation|weather_code/.test(u.searchParams.get('hourly') || '')) {
    res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(lats.length === 1 ? pastOne(u, 0, lats, lons) : lats.map((_, i) => pastOne(u, i, lats, lons))));
  }
  // (Send to a Friend's patterns, 'share-…': a whole forecast of their own, shareOne below)
  if (!met && pattern.startsWith('share-')) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(lats.length === 1 ? shareOne(u, 0, lats, lons) : lats.map((_, i) => shareOne(u, i, lats, lons)))); }
  // pattern 'swirl': wind that varies from place to place, for the wind map
  const at = (i) => pattern === 'lane' ? (lats[i] >= lane ? { sp: 80, fr: 270 } : { sp: 0, fr: 270 }) : pattern === 'swirl' ? { sp: 12 + 30 * Math.abs(Math.sin(lats[i] * Math.PI / 25)), fr: (270 + 70 * Math.sin(lons[i] * Math.PI / 18) + 50 * Math.cos(lats[i] * Math.PI / 12) + 360) % 360 } : { sp: speed, fr: from };
  // pattern 'alps-storm': still air, but thunderstorms over the Alps
  const CODES = { 'alps-storm': [95, 75], 'alps-rain': [65, 30], 'alps-snow': [75, 20], 'alps-fog': [45, 0], 'alps-gales': [0, 80] };
  const inOne = (c, i) => Math.hypot(lats[i] - c[0], (lons[i] - c[1]) * Math.cos(c[0] * Math.PI / 180)) <= c[2];
  const inCell = (i) => pattern === 'cell' && cell && (Array.isArray(cell[0]) ? cell.some((c) => inOne(c, i)) : inOne(cell, i));   // (cell: one [lat, lon, r], or a list of them)
  const sky = (i) => inCell(i) ? (cellWx ? { code: cellWx.code ?? 0, gust: cellWx.gust ?? 0 } : { code: 95, gust: 75 }) : CODES[pattern] && lats[i] >= 44 && lats[i] <= 48.5 && lons[i] >= 4 && lons[i] <= 17 ? { code: CODES[pattern][0], gust: CODES[pattern][1] } : { code: 0, gust: 0 };
  // rain (mm in 15 minutes): a band over the Alps for the alps patterns, heaviest in the middle
  const RAIN = { 'alps-storm': 3, 'alps-rain': 1.6, 'alps-snow': 0.8, 'grid-rain': 2.5 };
  const rain = (i) => RAIN[pattern] ? Math.max(0, RAIN[pattern] * (1 - Math.hypot((lats[i] - 46.5) / 2.2, (lons[i] - 11) / 5))) : 0;
  // hourly forecasts (forecast_hours from this hour): the pattern's weather until clearAfter, then clear skies
  const hours = Number(u.searchParams.get('forecast_hours') || 0), h0 = Math.floor(Date.now() / 3600e3) * 3600;
  const skyH = (i, h) => ((clearAfter != null && h >= clearAfter) || (startAfter != null && h < startAfter) ? { code: 0, gust: 0 } : sky(i));
  const skyNow = (i) => (startAfter ? { code: 0, gust: 0 } : sky(i));
  const hourly = (i) => (u.searchParams.get('hourly') ? { hourly: { time: Array.from({ length: hours }, (_, h) => h0 + h * 3600), wind_speed_10m: Array.from({ length: hours }, () => at(i).sp),
    wind_direction_10m: Array.from({ length: hours }, () => at(i).fr), ...(aloft == null ? {} : { wind_speed_120m: Array.from({ length: hours }, () => at(i).sp * aloft), wind_direction_120m: Array.from({ length: hours }, () => at(i).fr),
      wind_speed_80m: Array.from({ length: hours }, () => at(i).sp * (aloft80 ?? aloft)), wind_direction_80m: Array.from({ length: hours }, () => at(i).fr), wind_speed_180m: Array.from({ length: hours }, () => at(i).sp * (aloft180 ?? aloft)), wind_direction_180m: Array.from({ length: hours }, () => at(i).fr) }), ...(jet ? { wind_speed_250hPa: Array.from({ length: hours }, () => jet.sp), wind_direction_250hPa: Array.from({ length: hours }, () => jet.from) } : {}), wind_gusts_10m: Array.from({ length: hours }, (_, h) => skyH(i, h).gust), weather_code: Array.from({ length: hours }, (_, h) => skyH(i, h).code),
    temperature_2m: Array.from({ length: hours }, (_, h) => (inCell(i) && cellWx?.temp != null && skyH(i, h).code === (cellWx.code ?? 0) ? cellWx.temp : 15)),
    cape: Array.from({ length: hours }, (_, h) => (inCell(i) && cellWx && skyH(i, h).code === (cellWx.code ?? 0) ? cellWx.cape ?? 0 : 0)), precipitation: Array.from({ length: hours }, (_, h) => (inCell(i) && cellWx && skyH(i, h).code === (cellWx.code ?? 0) ? cellWx.rain ?? 0 : 0)) } } : {});
  // the 15-minute forecast (when asked): as the hour's weather, but for a shower in its first quarters
  const q15 = (i) => { const n = Number(u.searchParams.get('forecast_minutely_15') || 0); if (!u.searchParams.get('minutely_15') || !n) return {};
    const q0 = Math.floor(Date.now() / 900e3) * 900, wet = (q) => shower && q < shower.quarters && inOne(shower.cell, i);
    return { minutely_15: { time: Array.from({ length: n }, (_, q) => q0 + q * 900), weather_code: Array.from({ length: n }, (_, q) => (wet(q) ? 65 : skyH(i, Math.floor(((q0 + q * 900) - Math.floor(q0 / 3600) * 3600) / 3600)).code)), precipitation: Array.from({ length: n }, (_, q) => (wet(q) ? 2 : 0)) } }; };
  const one = (i) => ({ latitude: +lats[i], longitude: +lons[i], ...hourly(i), ...q15(i), current: { time: '2026-10-13T12:00', interval: 900, wind_speed_10m: at(i).sp, wind_direction_10m: at(i).fr, ...(aloft == null ? {} : { wind_speed_120m: at(i).sp * aloft, wind_direction_120m: at(i).fr, wind_speed_80m: at(i).sp * (aloft80 ?? aloft), wind_direction_80m: at(i).fr, wind_speed_180m: at(i).sp * (aloft180 ?? aloft), wind_direction_180m: at(i).fr }), ...(jet ? { wind_speed_250hPa: jet.sp, wind_direction_250hPa: jet.from } : {}), wind_gusts_10m: skyNow(i).gust, weather_code: skyNow(i).code, temperature_2m: inCell(i) && cellWx?.temp != null && !startAfter ? cellWx.temp : 15, cape: inCell(i) && cellWx && !startAfter ? cellWx.cape ?? 0 : 0, precipitation: startAfter ? 0 : inCell(i) && cellWx ? (cellWx.rain ?? 0) / 4 : rain(i) } });
  if (met) {
    const sym = (c) => (c >= 95 ? 'heavyrainandthunder' : c === 75 ? 'heavysnow' : c === 65 ? 'heavyrain' : c === 45 ? 'fog' : 'clearsky_day');
    const timeseries = Array.from({ length: 72 }, (_, h) => ({ time: new Date((h0 + h * 3600) * 1000).toISOString().replace('.000', ''),
      data: { instant: { details: { wind_speed: at(0).sp / 3.6, wind_from_direction: at(0).fr, air_temperature: inCell(0) && cellWx?.temp != null ? cellWx.temp : 15, wind_speed_of_gust: skyH(0, h).gust / 3.6 } },
        next_1_hours: { summary: { symbol_code: sym(skyH(0, h).code) }, details: { precipitation_amount: skyH(0, h).code >= 61 ? 4 : 0 } } } }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ type: 'Feature', properties: { timeseries } }));
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(lats.length === 1 ? one(0) : lats.map((_, i) => one(i))));
}).listen(8796, '127.0.0.1').keepAliveTimeout = 120e3;   // (longer than tests leave a connection idle)

// The days gone by (Fitness's pastWet, for Today's habit rule): every hour from midnight GMT past_days ago to the end of
// forecast_days, each wet or dry by the past pattern (/mode { past }), in the forecast's own form
function pastOne(u, i, lats, lons) {
  const q = u.searchParams, H = 3600e3, D = 864e5, n = (Number(q.get('past_days')) + Number(q.get('forecast_days') || 7)) * 24;
  const h0 = Math.floor(Date.now() / D) * D - Number(q.get('past_days')) * D, unix = q.get('timeformat') === 'unixtime';
  const wetAt = (ms) => {
    if (past === 'wet') return true;
    if (!past || past === 'dry' || typeof past !== 'object') return false;
    const d = new Date(ms), day = d.toISOString().slice(0, 10), hr = d.getUTCHours(), [from, to] = Array.isArray(past.hours) ? past.hours : [0, 24];
    return (past.wet || []).some((w) => w === day || w === d.getUTCDay()) && hr >= from && hr < to;
  };
  const ts = Array.from({ length: n }, (_, h) => h0 + h * H), out = { latitude: +lats[i], longitude: +lons[i], timezone: 'GMT', timezone_abbreviation: 'GMT', utc_offset_seconds: 0, hourly: { time: ts.map((ms) => (unix ? ms / 1000 : new Date(ms).toISOString().slice(0, 16))) } };
  for (const k of String(q.get('hourly') || '').split(',').filter(Boolean)) out.hourly[k] = ts.map((ms) => (k === 'precipitation' ? (wetAt(ms) ? 1.5 : 0) : k === 'weather_code' ? (wetAt(ms) ? 63 : 1) : k === 'is_day' ? 1 : /^temperature|^apparent/.test(k) ? 14 : 0));
  return out;
}

// Send to a Friend (sharecard, shareask, shareplan): the same weather at every place, in the forecast's own form (each
// variable asked for, hourly, daily, now and by the quarter hour; times in UTC, the zone it says it's in).
//   'share-wet'         raining now and all day, everywhere
//   'share-dry-window'  dry 10:00–12:00 every day, wet the rest (so two friends' best time is 10:00–12:00)
//   'share-rain-at'     dry now, raining from startAfter hours ahead (2 if not given)
function shareOne(u, i, lats, lons) {
  const q = u.searchParams, t = Date.now(), H = 3600e3, D = 864e5;
  const wetAt = (ms) => pattern === 'share-wet' ? true : pattern === 'share-dry-window' ? !(new Date(ms).getUTCHours() >= 10 && new Date(ms).getUTCHours() < 12) : pattern === 'share-rain-at' ? ms >= t + (startAfter ?? 2) * H : false;
  const unix = q.get('timeformat') === 'unixtime' || q.get('forecast_hours') != null;
  const when = (ms, day) => (unix ? Math.floor(ms / 1000) : new Date(ms).toISOString().slice(0, day ? 10 : 16));
  const v = (k, ms, wet) => {
    const dayH = new Date(ms).getUTCHours(), day = dayH >= 7 && dayH < 17;
    if (/^temperature/.test(k)) return wet ? 12 : 15; if (/^apparent/.test(k)) return wet ? 10 : 14;
    if (k === 'relative_humidity_2m') return wet ? 95 : 70; if (k === 'dew_point_2m') return 9;
    if (k === 'precipitation_probability') return wet ? 90 : 5; if (k === 'precipitation') return wet ? 2 : 0; if (k === 'snowfall') return 0;
    if (k === 'weather_code') return wet ? 63 : 1; if (k === 'pressure_msl') return 1015; if (/^cloud_cover/.test(k)) return wet ? 95 : 15;
    if (k === 'visibility') return wet ? 5000 : 20000; if (/^wind_speed/.test(k)) return 10; if (/^wind_direction/.test(k)) return 270; if (/^wind_gusts/.test(k)) return 20;
    if (k === 'uv_index') return day ? 1 : 0; if (k === 'is_day') return day ? 1 : 0; if (k === 'cape') return 0; if (k === 'lifted_index') return 2;
    if (k === 'vapour_pressure_deficit') return 0.5; if (k === 'sunshine_duration') return day && !wet ? 3600 : 0;
    return 0;
  };
  const vars = (name) => String(q.get(name) || '').split(',').filter(Boolean);
  const out = { latitude: +lats[i], longitude: +lons[i], timezone: 'GMT', timezone_abbreviation: 'GMT', utc_offset_seconds: 0, elevation: 10 };
  if (vars('hourly').length) {
    const fh = q.get('forecast_hours'), past = Number(q.get('past_days') || 0), days = Number(q.get('forecast_days') || 7);
    const h0 = fh != null ? Math.floor(t / H) * H : Math.floor(t / D) * D - past * D, n = fh != null ? Number(fh) : (past + days) * 24;
    const ts = Array.from({ length: n }, (_, h) => h0 + h * H);
    out.hourly = { time: ts.map((ms) => when(ms)) };
    for (const k of vars('hourly')) out.hourly[k] = ts.map((ms) => v(k, ms, wetAt(ms)));
  }
  if (vars('daily').length) {
    const past = Number(q.get('past_days') || 0), days = Number(q.get('forecast_days') || 7), d0 = Math.floor(t / D) * D - past * D;
    const ds = Array.from({ length: past + days }, (_, d) => d0 + d * D), wetDay = (ms) => Array.from({ length: 24 }, (_, h) => wetAt(ms + h * H)).filter(Boolean).length;
    out.daily = { time: ds.map((ms) => when(ms, true)) };
    for (const k of vars('daily')) out.daily[k] = ds.map((ms) => {
      const w = wetDay(ms);
      if (k === 'sunrise') return when(ms + 7 * H); if (k === 'sunset') return when(ms + 17 * H);
      if (k === 'weather_code') return w ? 63 : 1; if (k === 'temperature_2m_max' || k === 'apparent_temperature_max') return 16; if (k === 'temperature_2m_min' || k === 'apparent_temperature_min') return 9;
      if (k === 'daylight_duration') return 36000; if (k === 'sunshine_duration') return (10 - Math.min(10, w)) * 3600; if (k === 'uv_index_max') return 2;
      if (k === 'precipitation_sum') return w * 2; if (k === 'precipitation_hours') return w; if (k === 'precipitation_probability_max') return w ? 90 : 5;
      if (k === 'wind_speed_10m_max') return 15; if (k === 'wind_gusts_10m_max') return 25; if (k === 'wind_direction_10m_dominant') return 270;
      return 0;
    });
  }
  if (vars('current').length) {
    const q0 = Math.floor(t / 900e3) * 900e3;
    out.current = { time: when(q0), interval: 900 };
    for (const k of vars('current')) out.current[k] = v(k, t, wetAt(t)) / (k === 'precipitation' ? 4 : 1);
  }
  if (vars('minutely_15').length) {
    // (each quarter's rain is the 15 minutes up to its time, as Open-Meteo has it)
    const q0 = Math.floor(t / 900e3) * 900e3, n = Number(q.get('forecast_minutely_15') || 17), qs = Array.from({ length: n }, (_, k) => q0 + k * 900e3);
    out.minutely_15 = { time: qs.map((ms) => when(ms + 900e3)) };
    for (const k of vars('minutely_15')) out.minutely_15[k] = qs.map((ms) => (k === 'precipitation' ? (wetAt(ms) ? 0.5 : 0) : v(k, ms, wetAt(ms))));
  }
  return out;
}
