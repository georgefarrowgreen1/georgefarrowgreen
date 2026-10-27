// Solar: when the sun's coming out on your panels today, and how long for. Open-Meteo's sunlight on a surface at your
// roof's pitch, facing its way (global tilted irradiance, W/m², each hour's the hour up to its time); a sunny spell is
// an hour or more with at least half the day's best on the roof, and enough to be worth it (MIN_W, about a fifth of
// what panels are rated at). Said from two hours before the spell until it ends; nothing otherwise. Pure, like
// insights.js, but for the fetch.

import { HOUR, dayStart } from "./format.js";

// the way a roof faces, as Open-Meteo has it: degrees from south, west positive
export const FACES = [["S", "South", 0], ["SW", "South-west", 45], ["W", "West", 90], ["NW", "North-west", 135], ["N", "North", 180], ["NE", "North-east", -135], ["E", "East", -90], ["SE", "South-east", -45]];
export const PITCHES = [0, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60];
export const MIN_W = 200;
const LEAD = 2 * HOUR;

export const solarQuery = (lat, lon, faces = "S", pitch = 35) =>
  new URLSearchParams({ latitude: lat.toFixed(4), longitude: lon.toFixed(4), hourly: "global_tilted_irradiance", tilt: String(pitch), azimuth: String((FACES.find((x) => x[0] === faces) || FACES[0])[2]), forecast_days: "2", timezone: "auto" }).toString();
// [{ t (wall ms, the hour's end), w (W/m²) }]
export function shapeSolar(j, parseWall) {
  const h = j?.hourly || {};
  return (h.time || []).map((t, i) => ({ t: parseWall(t), w: h.global_tilted_irradiance?.[i] ?? 0 }));
}

// Today's spell still to come or under way, if it's to be said yet: { start, end, peak (the middle of its best hour),
// on (under way), hours (today's daylight ones, each { t, v: share of the day's best }), best } or null
export function sunSpell(hours, now) {
  const d0 = dayStart(now), today = hours.filter((x) => x.t > d0 && x.t <= d0 + 24 * HOUR);
  const best = Math.max(0, ...today.map((x) => x.w));
  if (best < MIN_W) return null;
  const cut = Math.max(MIN_W, best / 2), runs = [];
  for (const x of today) {
    if (x.w < cut) continue;
    const r = runs[runs.length - 1];
    if (r && r.end === x.t - HOUR) { r.end = x.t; r.hours.push(x); } else runs.push({ start: x.t - HOUR, end: x.t, hours: [x] });
  }
  const r = runs.find((x) => x.end > now);
  if (!r || now < r.start - LEAD) return null;
  const top = r.hours.reduce((a, x) => (x.w > a.w ? x : a));
  const lit = today.filter((x) => x.w > 5);
  return { start: r.start, end: r.end, peak: top.t - HOUR / 2, on: now >= r.start, best,
    hours: lit.map((x) => ({ t: x.t, v: x.w / best, in: x.t > r.start && x.t <= r.end })) };
}

// The card's words: { title, text }
export function solarSay(s, now, f) {
  if (s.on) {
    const text = Math.abs(now - s.peak) <= HOUR ? "Your panels are near their best for today." : now < s.peak ? `At their best around ${f.time(s.peak)}.` : "A good time to use power.";
    return { title: `Sunny now, until about ${f.said(s.end)}`, text };
  }
  return { title: `Sun coming out from about ${f.time(s.start)}`, text: `Your panels should work well until about ${f.said(s.end)}, at their best around ${f.time(s.peak)}. A good time for the washing machine.` };
}
