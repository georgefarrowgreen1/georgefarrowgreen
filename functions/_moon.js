/* ---------- off the Earth: the Moon, Mars and low Earth orbit ----------
   Anyone can live on the Moon or on Mars (My Profile → Location): a spot on it,
   from named sites or anywhere on a map. While they're there, their spot on Earth
   isn't kept at all.

   Only space pigeons fly off the Earth, each from a loft of its own:
   - Lunar (3 a day, about 3 days, like Apollo) and Lunar Express (1 a day, about
     a day): to, from or across the Moon. The trip is as long as the Moon is far
     away that day; across the Moon they bound over the surface.
   - Laser (5 a day): anything to or from Mars, at the speed of light, so 3 to 22
     minutes as the planets move round the Sun; across Mars, by an orbiter overhead.
   - Orbital (2 a day): Earth to Earth, by way of low Earth orbit. It comes down on
     the first pass within reach of its friend: hours, however near or far.
   The numbers are pigeon/space.js, shared with the phone so both agree.

   A space flight keeps none of the usual Earth places on its row (from_lat …
   to_lon are NULL), so routing, weather, ships, flyovers, the passport's countries
   and the live tracker's dots all pass it by. Its ends (and an orbit's path) are in
   `moon`: { k: "trip" | "surface" | "laser" | "orbit", from, to, dist, … } with each
   end { b: "earth" | "moon" | "mars", lat, lon, place }. An Earth end is kept only to
   the half degree (about 50 km): plenty to draw it. */
import { HttpError } from "./_pigeon.js";
import { BODIES, SPACE, placeOn, spaceFlight, spaceKinds, bodyOf, SPACE_MARKS } from "../pigeon/space.js";

export { spaceFlight, spaceKinds, SPACE_MARKS };
export const isSpace = (k) => Object.hasOwn(SPACE, k);
export const SPACE_NAME = { lunar: "lunar", lunarx: "lunar express", laser: "laser", orbital: "orbital" };

// A spot on the Moon or Mars from the phone, kept to a tenth of a degree (about 3 km), named here
export function cleanMoon(b) {
  const lat = Number(b?.lat), lon = Number(b?.lon), body = b?.body === "mars" ? "mars" : "moon";
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new HttpError(400, `That spot on ${BODIES[body].name} isn’t valid.`);
  const r = (x) => Math.round(x * 10) / 10;
  return { b: body, lat: r(lat), lon: r(lon), place: placeOn(r(lat), r(lon), body) };
}
const coarse = (x) => Math.round(x * 2) / 2;
// one end of a flight: where someone is now
export function endOf(p) {
  if (p.moon) { const m = typeof p.moon === "string" ? JSON.parse(p.moon) : p.moon, b = m.b === "mars" ? "mars" : "moon"; return { b, lat: m.lat, lon: m.lon, place: p.place || placeOn(m.lat, m.lon, b) }; }
  return p.lat == null ? null : { b: "earth", lat: coarse(p.lat), lon: coarse(p.lon), place: p.place || null };
}
export const offEarth = (p) => !!p?.moon;
export const moonView = (row) => { try { return row.moon ? JSON.parse(row.moon) : null; } catch (_) { return null; } };
// what a space flight stamps in the passport: the body it went to or from (an orbit: orbit itself)
export function spacePlace(mn) {
  if (mn.k === "orbit") return "Low Earth Orbit";
  return bodyOf(mn.from) === "mars" || bodyOf(mn.to) === "mars" ? "Mars" : "the Moon";
}
