/* ---------- the Moon ----------
   Anyone can set themselves on the Moon (My Profile → Location → On the Moon):
   a spot on its surface, picked from named sites or anywhere on a map of it.
   While you're there, your spot on Earth isn't kept at all.

   Only a lunar pigeon reaches the Moon, or leaves it. There are two:
   - Lunar: about 3 days each way, like Apollo (3 a day, from their own loft)
   - Lunar Express: about a day (1 a day)
   The trip is as long as the Moon is far away that day: it swings between about
   356,000 and 406,000 km over a month, worked out here from its orbit (Meeus,
   Astronomical Algorithms ch. 47, the larger terms: good to a few hundred km).
   From one spot on the Moon to another, a pigeon bounds over the surface in the
   low gravity: no air, no wind, no weather.

   A flight to or from the Moon keeps none of the usual Earth places on its row
   (from_lat … to_lon are NULL), so routing, weather, ships, flyovers, the
   passport's countries and the live tracker's dots all pass it by. Its ends are
   in `moon` instead: { k: "trip" | "surface", from, to, dist } with each end
   { b: "earth" | "moon", lat, lon, place }. An Earth end is kept only to the
   half degree (about 50 km): plenty to draw it leaving the planet. */
import { DAY, HOUR, MIN, HttpError, haversineKm } from "./_pigeon.js";

export const MOON_R = 1737.4, EARTH_R = 6371, MEAN_KM = 384400;

// [name, lat, lon] in selenographic degrees (east positive). The far side is past ±90° longitude.
export const SITES = [
  ["Tranquility Base", 0.67, 23.47], ["Sea of Tranquility", 8.5, 31.4], ["Tycho", -43.31, -11.36], ["Copernicus", 9.62, -20.08],
  ["Shackleton", -89.67, 129.78], ["Sea of Rains", 32.8, -15.6], ["Sea of Serenity", 28.0, 17.5], ["Ocean of Storms", 18.4, -57.4],
  ["Hadley Rille", 26.13, 3.63], ["Taurus–Littrow", 20.19, 30.77], ["Plato", 51.6, -9.4], ["Kepler", 8.1, -38.0],
  ["Aristarchus", 23.7, -47.4], ["Sea of Crises", 17.0, 59.1], ["Fra Mauro", -3.65, -17.47], ["Descartes Highlands", -8.97, 15.5],
  ["Sea of Nectar", -15.2, 35.5], ["Sea of Clouds", -21.3, -16.6], ["Sea of Fertility", -7.8, 51.3], ["Sea of Cold", 56.0, 1.4],
  ["Von Kármán", -44.4, 176.2], ["Tsiolkovskiy", -20.4, 129.1], ["Sea of Moscow", 27.3, 147.9], ["Daedalus", -5.9, 179.4],
  ["Apollo Basin", -36.1, -151.8], ["Korolev", -4.0, -157.4], ["Hertzsprung", 2.6, -129.2], ["Peary", 88.6, 33.0],
];
export const farSide = (lon) => Math.abs(lon) > 90;
export const lunarKm = (aLat, aLon, bLat, bLon) => haversineKm(aLat, aLon, bLat, bLon) * (MOON_R / EARTH_R);

// The name for a spot: a site within 120 km, else "near" the closest
export function siteName(lat, lon) {
  let best = null, d = Infinity;
  for (const s of SITES) { const k = lunarKm(lat, lon, s[1], s[2]); if (k < d) { d = k; best = s; } }
  return d <= 120 ? best[0] : `Near ${best[0]}`;
}
export const moonPlace = (lat, lon) => `${siteName(lat, lon)}, the Moon`;

// A spot on the Moon from the phone, kept to a tenth of a degree (about 3 km), named here
export function cleanMoon(b) {
  const lat = Number(b?.lat), lon = Number(b?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new HttpError(400, "That spot on the Moon isn’t valid.");
  const r = (x) => Math.round(x * 10) / 10;
  return { lat: r(lat), lon: r(lon), place: moonPlace(r(lat), r(lon)) };
}

/* ---- where the Moon is ---- */
const rad = Math.PI / 180, cos = (d) => Math.cos(d * rad), sin = (d) => Math.sin(d * rad);
function args(t) {
  const T = (t / 864e5 + 2440587.5 - 2451545) / 36525;
  return { D: 297.8501921 + 445267.1114034 * T, M: 357.5291092 + 35999.0502909 * T, Mp: 134.9633964 + 477198.8675055 * T, F: 93.2720950 + 483202.0175233 * T };
}
// centre to centre, in km
export function moonKm(t) {
  const { D, M, Mp, F } = args(t);
  return 385000.56 + (-20905355 * cos(Mp) - 3699111 * cos(2 * D - Mp) - 2955968 * cos(2 * D) - 569925 * cos(2 * Mp) + 48888 * cos(M) - 3149 * cos(2 * F)
    + 246158 * cos(2 * D - 2 * Mp) - 152138 * cos(2 * D - M - Mp) - 170733 * cos(2 * D + Mp) - 204586 * cos(2 * D - M) - 129620 * cos(M - Mp)
    + 108743 * cos(D) + 104755 * cos(M + Mp)) / 1000;
}

/* ---- lunar pigeons ---- */
// trip: Earth to Moon at the mean distance; kmh: bounding over the surface (their lofts: LUNAR_LOFTS)
export const LUNAR = {
  lunar: { name: "lunar", trip: 3 * DAY, kmh: 160 },
  lunarx: { name: "lunar express", trip: DAY, kmh: 480 },
};
export const isLunar = (k) => Object.hasOwn(LUNAR, k);
const coarse = (x) => Math.round(x * 2) / 2;
// one end of a flight: where someone is now
export function endOf(p) {
  if (p.moon) { const m = typeof p.moon === "string" ? JSON.parse(p.moon) : p.moon; return { b: "moon", lat: m.lat, lon: m.lon, place: p.place || moonPlace(m.lat, m.lon) }; }
  return p.lat == null ? null : { b: "earth", lat: coarse(p.lat), lon: coarse(p.lon), place: p.place || null };
}
// How a lunar pigeon goes from one end to the other, leaving at t: { k, km, ms, dist }
export function lunarFlight(kind, from, to, t, speed = 1) {
  const p = LUNAR[kind];
  if (from.b === "moon" && to.b === "moon") {
    const km = lunarKm(from.lat, from.lon, to.lat, to.lon);
    return { k: "surface", km: Math.round(km), ms: Math.round(Math.max(10 * MIN, (km / (p.kmh * speed)) * HOUR)), dist: null };
  }
  const dist = Math.round(moonKm(t));
  return { k: "trip", km: Math.round(dist - EARTH_R - MOON_R), ms: Math.round((p.trip * dist) / MEAN_KM / speed), dist };
}
export const moonView = (row) => { try { return row.moon ? JSON.parse(row.moon) : null; } catch (_) { return null; } };
