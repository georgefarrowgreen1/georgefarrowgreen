/* ---------- where somewhere is, in words ----------
   "France", "the English Channel", "the North Atlantic": the same names the
   map in the app uses (the same coastline and the same lists), so a push about
   a moment over Belgium says what the map would. */
import { LAND } from "../pigeon/land.js";
import { COUNTRIES, SEAS } from "../pigeon/countries.js";
import { haversineKm } from "./_pigeon.js";

let rings = null;
// the coastline as rings of [lon, lat] (unwrapped so none jumps the date line), each with its box
function land() {
  if (rings) return rings;
  rings = LAND.split(";").map((r) => {
    const a = r.split(",").map((n) => n / 2);
    for (let i = 2; i < a.length; i += 2) { while (a[i] - a[i - 2] > 180) a[i] -= 360; while (a[i] - a[i - 2] < -180) a[i] += 360; }
    if (a.length > 4 && Math.abs(a[a.length - 2] - a[0]) > 180) a.push(a[a.length - 2], a[1] < 0 ? -90 : 90, a[0], a[1] < 0 ? -90 : 90);
    let west = Infinity; for (let i = 0; i < a.length; i += 2) if (a[i] < west) west = a[i];
    if (west < -180) { const turn = Math.ceil((-180 - west) / 360) * 360; for (let i = 0; i < a.length; i += 2) a[i] += turn; }
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < a.length; i += 2) { x0 = Math.min(x0, a[i]); x1 = Math.max(x1, a[i]); y0 = Math.min(y0, a[i + 1]); y1 = Math.max(y1, a[i + 1]); }
    return { a, box: [x0, y0, x1, y1] };
  });
  return rings;
}
export function onLand(lat, lon) {
  let inside = false;
  for (const { a, box } of land()) for (const o of [0, 360, -360]) {
    const x = lon + o; if (x < box[0] || x > box[2] || lat < box[1] || lat > box[3]) continue;
    for (let i = 0, j = a.length - 2; i < a.length; j = i, i += 2) {
      const xi = a[i], yi = a[i + 1], xj = a[j], yj = a[j + 1];
      if ((yi > lat) !== (yj > lat) && x < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}
// the nearest country's middle (bigger countries reach further): "land" when none is near
export function countryNear(lat, lon) {
  lon = ((lon + 540) % 360) - 180;
  let best = null, bd = Infinity;
  for (const [name, la, lo, tier] of COUNTRIES) { const d = haversineKm(lat, lon, la, lo) / [0, 3.2, 1.8, 1][tier]; if (d < bd) { bd = d; best = name; } }
  return best && bd < 1500 ? (/^(United|Netherlands|Philippines|Central|Dominican|UAE)/.test(best) ? "the " + best : best) : "land";
}
// that, or the sea it's in
export function placeName(lat, lon) {
  lon = ((lon + 540) % 360) - 180;
  if (onLand(lat, lon)) return countryNear(lat, lon);
  const sea = SEAS.find(([, s, n, w, e]) => lat >= s && lat <= n && lon >= w && lon <= e); if (sea) return sea[0];
  if (lat > 66) return "the Arctic Ocean";
  if (lat < -60) return "the Southern Ocean";
  const atl = lon >= (lat > 15 ? -85 : lat > 8 ? -80 : -70) && lon < 20 && !(lat < -35 && lon > 20);
  if (atl) return lat >= 0 ? "the North Atlantic" : "the South Atlantic";
  if (lon >= 20 && lon < 147 && lat < 25) return "the Indian Ocean";
  return lat >= 0 ? "the North Pacific" : "the South Pacific";
}
