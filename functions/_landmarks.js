/* ---------- landmark postmarks ----------
   A pigeon that flies within sight of somewhere famous picks up its postmark:
   on the letter (both of you see it once it lands), and in its sender's
   collection. "Within sight" is a few miles for a building, more for a
   mountain or a canyon. Worked out once per flight, alongside the passport,
   from the way it really flew (great circles, turns and stopovers).

   [id, name, lat, lon, km, kind]: kind picks the postmark's drawing. */
import { haversineKm } from "./_pigeon.js";
import { SPACE_MARKS } from "../pigeon/space.js";

export const LANDMARKS = [
  // Britain and Ireland
  ["bigben", "Big Ben", 51.5007, -0.1246, 6, "tower"],
  ["towerbridge", "Tower Bridge", 51.5055, -0.0754, 5, "bridge"],
  ["stonehenge", "Stonehenge", 51.1789, -1.8262, 8, "monument"],
  ["edinburgh", "Edinburgh Castle", 55.9486, -3.1999, 6, "castle"],
  ["dover", "the White Cliffs of Dover", 51.1343, 1.3567, 10, "cliff"],
  ["causeway", "the Giant’s Causeway", 55.2408, -6.5116, 10, "cliff"],
  ["snowdon", "Snowdon", 53.0685, -4.0763, 12, "mountain"],
  ["bennevis", "Ben Nevis", 56.7969, -5.0036, 12, "mountain"],
  ["angelnorth", "the Angel of the North", 54.9141, -1.5895, 5, "monument"],
  ["norwichcath", "Norwich Cathedral", 52.6319, 1.3006, 4, "tower"],
  ["yorkminster", "York Minster", 53.9620, -1.0819, 4, "tower"],
  ["cliffsmoher", "the Cliffs of Moher", 52.9715, -9.4309, 10, "cliff"],
  // Europe
  ["eiffel", "the Eiffel Tower", 48.8584, 2.2945, 6, "tower"],
  ["montstmichel", "Mont-Saint-Michel", 48.6361, -1.5115, 8, "castle"],
  ["montblanc", "Mont Blanc", 45.8326, 6.8652, 20, "mountain"],
  ["matterhorn", "the Matterhorn", 45.9763, 7.6586, 15, "mountain"],
  ["colosseum", "the Colosseum", 41.8902, 12.4922, 5, "monument"],
  ["pisa", "the Leaning Tower of Pisa", 43.7230, 10.3966, 5, "tower"],
  ["venice", "Venice", 45.4408, 12.3155, 8, "bridge"],
  ["vesuvius", "Vesuvius", 40.8210, 14.4260, 15, "mountain"],
  ["sagrada", "the Sagrada Família", 41.4036, 2.1744, 5, "tower"],
  ["alhambra", "the Alhambra", 37.1761, -3.5881, 6, "castle"],
  ["brandenburg", "the Brandenburg Gate", 52.5163, 13.3777, 5, "monument"],
  ["neuschwanstein", "Neuschwanstein Castle", 47.5576, 10.7498, 8, "castle"],
  ["acropolis", "the Acropolis", 37.9715, 23.7257, 6, "monument"],
  ["hagiasophia", "Hagia Sophia", 41.0086, 28.9802, 5, "dome"],
  ["redsquare", "Red Square", 55.7539, 37.6208, 6, "dome"],
  ["atomium", "the Atomium", 50.8949, 4.3415, 5, "monument"],
  ["windmills", "the Kinderdijk windmills", 51.8838, 4.6371, 6, "monument"],
  ["littlemermaid", "the Little Mermaid", 55.6929, 12.5993, 5, "monument"],
  ["prague", "Prague Castle", 50.0909, 14.4005, 5, "castle"],
  ["belem", "the Belém Tower", 38.6916, -9.2160, 5, "tower"],
  ["etna", "Mount Etna", 37.7510, 14.9934, 20, "mountain"],
  ["santorini", "Santorini", 36.3932, 25.4615, 12, "cliff"],
  ["fjords", "the Geirangerfjord", 62.1049, 7.0941, 15, "cliff"],
  ["iceland", "Skógafoss", 63.5321, -19.5114, 12, "falls"],
  // Africa and the Middle East
  ["pyramids", "the Pyramids of Giza", 29.9792, 31.1342, 10, "pyramid"],
  ["petra", "Petra", 30.3285, 35.4444, 10, "monument"],
  ["burjkhalifa", "the Burj Khalifa", 25.1972, 55.2744, 8, "tower"],
  ["kilimanjaro", "Kilimanjaro", -3.0674, 37.3556, 30, "mountain"],
  ["tablemtn", "Table Mountain", -33.9628, 18.4098, 15, "mountain"],
  ["victoriafalls", "Victoria Falls", -17.9243, 25.8572, 12, "falls"],
  ["sahara", "the Sahara’s great dunes", 23.4162, 25.6628, 150, "dunes"],
  ["marrakech", "the Koutoubia, Marrakech", 31.6237, -7.9937, 6, "tower"],
  // Asia and Oceania
  ["tajmahal", "the Taj Mahal", 27.1751, 78.0421, 8, "dome"],
  ["everest", "Everest", 27.9881, 86.9250, 40, "mountain"],
  ["greatwall", "the Great Wall", 40.4319, 116.5704, 15, "wall"],
  ["forbidden", "the Forbidden City", 39.9163, 116.3972, 6, "castle"],
  ["fuji", "Mount Fuji", 35.3606, 138.7274, 30, "mountain"],
  ["angkor", "Angkor Wat", 13.4125, 103.8670, 10, "monument"],
  ["marinabay", "Marina Bay Sands", 1.2834, 103.8607, 5, "tower"],
  ["petronas", "the Petronas Towers", 3.1579, 101.7116, 6, "tower"],
  ["halong", "Ha Long Bay", 20.9101, 107.1839, 20, "cliff"],
  ["operahouse", "the Sydney Opera House", -33.8568, 151.2153, 6, "monument"],
  ["uluru", "Uluru", -25.3444, 131.0369, 20, "mountain"],
  ["milford", "Milford Sound", -44.6414, 167.8974, 15, "cliff"],
  // The Americas
  ["liberty", "the Statue of Liberty", 40.6892, -74.0445, 6, "monument"],
  ["empirestate", "the Empire State Building", 40.7484, -73.9857, 5, "tower"],
  ["goldengate", "the Golden Gate Bridge", 37.8199, -122.4783, 6, "bridge"],
  ["grandcanyon", "the Grand Canyon", 36.1069, -112.1129, 40, "canyon"],
  ["niagara", "Niagara Falls", 43.0896, -79.0849, 10, "falls"],
  ["rushmore", "Mount Rushmore", 43.8791, -103.4591, 8, "mountain"],
  ["cntower", "the CN Tower", 43.6426, -79.3871, 6, "tower"],
  ["spaceneedle", "the Space Needle", 47.6205, -122.3493, 5, "tower"],
  ["christ", "Christ the Redeemer", -22.9519, -43.2105, 8, "monument"],
  ["machupicchu", "Machu Picchu", -13.1631, -72.5450, 10, "mountain"],
  ["chichen", "Chichén Itzá", 20.6843, -88.5678, 8, "pyramid"],
  ["iguazu", "the Iguazú Falls", -25.6953, -54.4367, 12, "falls"],
  ["aconcagua", "Aconcagua", -32.6532, -70.0109, 30, "mountain"],
];
// and off the Earth (pigeon/space.js): the Moon's and Mars's, earned by landing there or bounding past
const OFF_EARTH = SPACE_MARKS.map(([id, name, , lat, lon, km, kind]) => [id, name, lat, lon, km, kind]);
const BY = new Map([...LANDMARKS, ...OFF_EARTH].map((l) => [l[0], l]));
export const landmark = (id) => BY.get(id);

// How close a great-circle leg a→b comes to a point, and how far along it that is (km)
const R = 6371, rad = Math.PI / 180;
function bearing(aLat, aLon, bLat, bLon) {
  const p1 = aLat * rad, p2 = bLat * rad, dl = (bLon - aLon) * rad;
  return Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl));
}
export function nearestOnLeg(aLat, aLon, bLat, bLon, lat, lon) {
  const len = haversineKm(aLat, aLon, bLat, bLon), d13 = haversineKm(aLat, aLon, lat, lon);
  if (len < 0.01) return { km: d13, at: 0 };
  const dt = bearing(aLat, aLon, lat, lon) - bearing(aLat, aLon, bLat, bLon);
  if (Math.cos(dt) < 0) return { km: d13, at: 0 };                                    // behind where it set off
  const xt = Math.asin(Math.max(-1, Math.min(1, Math.sin(d13 / R) * Math.sin(dt)))) * R;
  const along = Math.acos(Math.max(-1, Math.min(1, Math.cos(d13 / R) / Math.cos(xt / R)))) * R;
  if (along > len) return { km: haversineKm(bLat, bLon, lat, lon), at: len };          // past where it landed
  return { km: Math.abs(xt), at: along };
}
// The landmarks a pigeon's way passed, in the order it passed them (not those where it
// set off: a Londoner's pigeons don't collect Big Ben every time; where it lands counts)
export function marksAlong(stops) {
  const hits = [];
  let base = 0;
  for (let i = 0; i < stops.length - 1; i++) {
    const [aLat, aLon] = stops[i], [bLat, bLon] = stops[i + 1];
    for (const l of LANDMARKS) {
      if (hits.some((h) => h.id === l[0]) || haversineKm(stops[0][0], stops[0][1], l[2], l[3]) <= l[4]) continue;   // not the ones at home
      const n = nearestOnLeg(aLat, aLon, bLat, bLon, l[2], l[3]);
      if (n.km <= l[4]) hits.push({ id: l[0], at: base + n.at });
    }
    base += haversineKm(aLat, aLon, bLat, bLon);
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.id);
}

// Each flight's postmarks (pg_stamped.marks), for the letters a chat shows
export async function marksFor(D, ids) {
  const out = new Map();
  if (!ids.length) return out;
  const { results } = await D.prepare("SELECT id, at, marks FROM pg_stamped WHERE marks IS NOT NULL AND id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(ids)).all();
  for (const r of results) { try { const m = JSON.parse(r.marks); if (m.length) out.set(r.id, m.map((id) => markView(id, r.at)).filter(Boolean)); } catch (_) {} }
  return out;
}
export const markView = (id, at, n) => { const l = landmark(id); return l ? { id, name: l[1], kind: l[5], at, ...(n ? { n } : {}) } : null; };
// Your collection: each landmark your pigeons have flown past, first time first
export async function postmarksFor(D, uid) {
  const { results } = await D.prepare("SELECT mark, first_at, n FROM pg_postmarks WHERE user_id = ? ORDER BY first_at DESC").bind(uid).all();
  return { marks: results.map((r) => markView(r.mark, r.first_at, r.n)).filter(Boolean), of: LANDMARKS.length + OFF_EARTH.length };
}
