// A ride's weather, for Today's cards (Today First, spec §7.3): the hours across the ride (functions/_fitwx.js hoursAt,
// fitness/besttime.js isWet and hourScore), whether the roads are wet (a wet hour in the three before it starts), a
// jacket (feels-like under the ride's limit, or a 30% chance of rain in its first hour), and the words for it.
//   rideWx(env, u, ride: { start, stop, secs, sport }, t) → { out, roads, jacket, words, short, wind, hours } or null
//     (no place, no forecast). Where: the first of your places in Weather (functions/_wxacct.js), as Fitness's best time
//     is worked out for it; the forecast is hoursAt's, kept a while for the place, so the Fitness card's look at the
//     same place asks Open-Meteo nothing more.
//   rideWxOf(wx: { offset, hours }, ride, { tz }) → the same from a week's hours already had (pure)
// out: the feels-like (°C) in the hour the ride starts; roads: "wet" | "dry" (null with no hours before it known);
// jacket: true or false; words: "light rain at first, clearing by 18:00", short: "light rain at first", wind: "light
// wind" (each lower case, to go inside a sentence); hours: [{ t, temp, feels, pop, rain, wet, wind }] across the ride.
import { kept } from "./_wxacct.js";
import { hoursAt } from "./_fitwx.js";
import { isWet, LIMITS } from "../fitness/besttime.js";

const HOUR = 3600e3;
const r1 = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 10) / 10);
const CLOCK = new Map();
const clockOf = (tz) => CLOCK.get(tz) || CLOCK.set(tz, new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })).get(tz);
// (a moment on the clock: the account's zone where it's known, else the place's offset)
const hmOf = (tz, offset) => (ms) => {
  if (tz) { try { return clockOf(tz).format(new Date(ms)); } catch (_) {} }
  const d = new Date(ms + (offset || 0) * 1000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

// how wet, in a word: snow and storms by their code, rain by how much falls in the wettest hour
function rainWord(hs) {
  if (hs.some((h) => h.code != null && h.code >= 95)) return "storms";
  if (hs.some((h) => h.code != null && ((h.code >= 71 && h.code <= 77) || h.code === 85 || h.code === 86))) return "snow";
  const most = Math.max(0, ...hs.map((h) => h.rain ?? 0));
  return most >= 4 ? "heavy rain" : most >= 1 ? "rain" : "light rain";
}
function windWord(hs) {
  const w = hs.map((h) => h.wind).filter((v) => v != null), gust = Math.max(0, ...hs.map((h) => h.gust ?? 0));
  if (!w.length) return null;
  const avg = w.reduce((a, b) => a + b, 0) / w.length;
  const how = avg < 6 ? "still" : avg < 15 ? "light wind" : avg < 25 ? "breezy" : avg < 38 ? "windy" : "very windy";
  return gust > 45 && avg >= 6 ? `${how}, gusty` : how;
}

export function rideWxOf(wx, ride, { tz = null } = {}) {
  if (!ride || !Number.isFinite(ride.start) || !Number.isFinite(ride.stop) || ride.stop <= ride.start) return null;
  const hours = (Array.isArray(wx?.hours) ? wx.hours : []).filter((h) => h && Number.isFinite(h.t)).sort((a, b) => a.t - b.t);
  const across = hours.filter((h) => h.t + HOUR > ride.start && h.t < ride.stop);
  if (!across.length) return null;
  const a = LIMITS[ride.sport === "run" ? "run" : "ride"], hm = hmOf(tz, wx?.offset), first = across[0];
  const feels = first.feels ?? first.temp ?? null;
  // the roads: a wet hour in the three before the start (the start's own hour too, rain as you set out)
  const before = hours.filter((h) => h.t < ride.start && h.t + HOUR > ride.start - 3 * HOUR);
  const roads = before.length ? (before.some(isWet) ? "wet" : "dry") : null;
  // a jacket: cold to start in, or rain likely in the first hour
  const firstHour = hours.filter((h) => h.t + HOUR > ride.start && h.t < ride.start + HOUR);
  const jacket = (feels != null && feels < a.tmin) || firstHour.some((h) => (h.pop ?? 0) >= 30);
  // the words across the ride: dry throughout, wet at first and then clearing, dry and then wet, or wet throughout
  const wet = across.map(isWet), n = wet.filter(Boolean).length, wind = windWord(across);
  let short, words;
  if (!n) { short = "dry throughout"; words = short; }
  else if (n === wet.length) { short = `${rainWord(across)} throughout`; words = short; }
  else {
    const flips = wet.reduce((k, w, i) => k + (i && w !== wet[i - 1] ? 1 : 0), 0), word = rainWord(across.filter(isWet));
    if (flips > 1) { short = `${word} on and off`; words = short; }
    else if (wet[0]) { const dryAt = across[wet.indexOf(false)].t; short = `${word} at first`; words = `${short}, clearing by ${hm(dryAt)}`; }
    else { const wetAt = across[wet.indexOf(true)].t; short = `dry until ${hm(wetAt)}`; words = `${short}, then ${word}`; }
  }
  return {
    out: r1(feels), roads, jacket, words, short, wind,
    hours: across.map((h) => ({ t: h.t, temp: r1(h.temp), feels: r1(h.feels), pop: h.pop == null ? null : Math.round(h.pop), rain: r1(h.rain), wet: isWet(h), wind: r1(h.wind) })),
  };
}

export async function rideWx(env, u, ride, t) {
  if (!ride || !Number.isFinite(ride.start) || !Number.isFinite(ride.stop) || ride.stop <= ride.start) return null;
  const p = (await kept(env, u.id).catch(() => null))?.data?.places?.[0];
  if (!p || !Number.isFinite(+p.lat) || !Number.isFinite(+p.lon)) return null;
  const wx = await hoursAt(env, +p.lat, +p.lon).catch(() => null);
  if (!wx?.hours?.length) return null;
  return rideWxOf(wx, ride, { tz: ride.tz || null });
}
