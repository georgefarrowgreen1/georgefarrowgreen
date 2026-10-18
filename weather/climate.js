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
  return { years: c.years, tmax: stats(hi), tmin: stats(lo), wet: rainDays ? wetDays / rainDays : null, rainMean, recordHigh: recHi, recordLow: recLo };
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
