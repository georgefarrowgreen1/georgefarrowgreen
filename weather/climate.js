// This time of year, here: thirty years of daily highs, lows and rain (ERA5,
// through Open-Meteo's archive), so a forecast can be put in context: how
// unusual a day is, how close to a record, how wet a week is against normal.
//
// Kept compact (a start date and three arrays) and fetched once per place.

import { DAY, parseWall, keyOf } from "./format.js";

const WINDOW = 7;            // days either side of a date that count as "this time of year"

// Open-Meteo's archive answer → { start, tmax, tmin, rain, years }
export function compactClimate(json) {
  const d = json?.daily;
  if (!d || !Array.isArray(d.time) || !d.time.length) return null;
  const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
  const years = [+d.time[0].slice(0, 4), +d.time[d.time.length - 1].slice(0, 4)];
  return { start: d.time[0], tmax: d.temperature_2m_max.map(r1), tmin: d.temperature_2m_min.map(r1), rain: d.precipitation_sum.map(r1), years };
}

// day of the year of each stored day (worked out once per climate, kept alongside it)
const doys = new WeakMap();
function doyList(c) {
  let list = doys.get(c);
  if (!list) {
    const s = parseWall(c.start);
    list = { doy: new Int16Array(c.tmax.length), year: new Int16Array(c.tmax.length), md: new Int16Array(c.tmax.length) };
    for (let i = 0; i < c.tmax.length; i++) {
      const d = new Date(s + i * DAY), y = d.getUTCFullYear();
      list.doy[i] = Math.floor((Date.UTC(y, d.getUTCMonth(), d.getUTCDate()) - Date.UTC(y, 0, 1)) / DAY);
      list.year[i] = y; list.md[i] = d.getUTCMonth() * 100 + d.getUTCDate();
    }
    doys.set(c, list);
  }
  return list;
}
const doyOf = (w) => { const d = new Date(w); return Math.floor((w - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY); };
function quant(sorted, q) {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}
function stats(vals) {
  const s = vals.filter((v) => v != null).sort((a, b) => a - b);
  if (!s.length) return null;
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return { mean, p05: quant(s, 0.05), p10: quant(s, 0.1), p25: quant(s, 0.25), p50: quant(s, 0.5), p75: quant(s, 0.75), p90: quant(s, 0.9), p95: quant(s, 0.95), sorted: s };
}

// What's normal around a date (wall ms of the day), and the records for the date itself
export function climateOn(c, w) {
  if (!c) return null;
  const L = doyList(c), target = doyOf(w), d = new Date(w), md = d.getUTCMonth() * 100 + d.getUTCDate();
  const hi = [], lo = [], rain = [];
  let recHi = null, recLo = null, wetDays = 0, rainDays = 0;
  for (let i = 0; i < c.tmax.length; i++) {
    let dd = Math.abs(L.doy[i] - target); dd = Math.min(dd, 365 - dd);
    if (dd > WINDOW) continue;
    if (c.tmax[i] != null) hi.push(c.tmax[i]);
    if (c.tmin[i] != null) lo.push(c.tmin[i]);
    if (c.rain[i] != null) { rain.push(c.rain[i]); rainDays++; if (c.rain[i] >= 1) wetDays++; }
    if (L.md[i] === md) {
      if (c.tmax[i] != null && (!recHi || c.tmax[i] > recHi.v)) recHi = { v: c.tmax[i], year: L.year[i] };
      if (c.tmin[i] != null && (!recLo || c.tmin[i] < recLo.v)) recLo = { v: c.tmin[i], year: L.year[i] };
    }
  }
  if (!hi.length) return null;
  const rainMean = rain.length ? rain.reduce((a, b) => a + b, 0) / rain.length : null;
  const frost = lo.length ? lo.filter((v) => v <= 0).length / lo.length : null;       // (the share of nights that freeze)
  return { years: c.years, tmax: stats(hi), tmin: stats(lo), wet: rainDays ? wetDays / rainDays : null, rainMean, frost, recordHigh: recHi, recordLow: recLo };
}

// What's unusual here at any time of year, for warnings that suit the place (insights.js): its summer's warmest tenth
// of days and warmest hundredth (its summer: the warmest 13 weeks of its year, wherever they fall), the warmest tenth
// of its summer nights, the coldest tenth of its winter nights (its coldest 13 weeks), and its wettest hundredth of
// days. { hot, veryHot, warmNight, bitter, heavyDay } in °C and mm, worked out once per climate; null without one
const extremesOf = new WeakMap();
export function extremes(c) {
  if (!c) return null;
  if (extremesOf.has(c)) return extremesOf.get(c);
  const L = doyList(c);
  // each day of the year's average, then the 91 days about the warmest (or coldest) of them
  const byDay = (vals) => {
    const s = new Float64Array(366), n = new Int32Array(366);
    for (let i = 0; i < vals.length; i++) if (vals[i] != null) { s[L.doy[i]] += vals[i]; n[L.doy[i]]++; }
    return Array.from(s, (v, k) => (n[k] ? v / n[k] : null));
  };
  const season = (means, warmest) => {
    let best = null, mid = 0;
    for (let k = 0; k < 365; k++) {
      let sum = 0, n = 0;
      for (let j = -45; j <= 45; j++) { const v = means[(k + j + 365) % 365]; if (v != null) { sum += v; n++; } }
      if (n && (best == null || (warmest ? sum / n > best : sum / n < best))) { best = sum / n; mid = k; }
    }
    return (doy) => { const dd = Math.abs(doy - mid); return Math.min(dd, 365 - dd) <= 45; };
  };
  const summer = season(byDay(c.tmax), true), winter = season(byDay(c.tmin), false);
  const days = [], nights = [], cold = [], rain = [];
  for (let i = 0; i < c.tmax.length; i++) {
    if (summer(L.doy[i])) { if (c.tmax[i] != null) days.push(c.tmax[i]); if (c.tmin[i] != null) nights.push(c.tmin[i]); }
    if (winter(L.doy[i]) && c.tmin[i] != null) cold.push(c.tmin[i]);
    if (c.rain[i] != null) rain.push(c.rain[i]);
  }
  for (const a of [days, nights, cold, rain]) a.sort((x, y) => x - y);
  const out = days.length && nights.length && cold.length
    ? { hot: quant(days, 0.9), veryHot: quant(days, 0.99), warmNight: quant(nights, 0.9), bitter: quant(cold, 0.1), heavyDay: rain.length ? quant(rain, 0.99) : null }
    : null;
  extremesOf.set(c, out);
  return out;
}

// where v falls among sorted values: 0 to 100 (the share below it, ties counted half)
export function rankIn(sorted, v) {
  if (!sorted?.length || v == null) return null;
  let below = 0, same = 0;
  for (const x of sorted) { if (x < v) below++; else if (x === v) same++; else break; }
  return (100 * (below + same / 2)) / sorted.length;
}

// The same date a year ago (or n years ago), if it's in the record
export function yearsAgo(c, w, n = 1) {
  if (!c) return null;
  const d = new Date(w), then = Date.UTC(d.getUTCFullYear() - n, d.getUTCMonth(), d.getUTCDate());
  const i = Math.round((then - parseWall(c.start)) / DAY);
  if (i < 0 || i >= c.tmax.length) return null;
  return { key: keyOf(then), tmax: c.tmax[i], tmin: c.tmin[i], rain: c.rain[i] };
}

// The years an archive should cover: the latest 30 whole years it has (ERA5 runs about a week behind)
export function climateSpan(nowW) {
  const y = new Date(nowW).getUTCFullYear() - 1;
  return { start: `${y - 29}-01-01`, end: `${y}-12-31` };
}
