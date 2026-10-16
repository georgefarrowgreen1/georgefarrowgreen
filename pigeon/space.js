// InFlight — space: the Moon, Mars and low Earth orbit, worked out the same way on the
// phone (pigeon/moon.js draws them) and on the server (functions/_moon.js), so both
// agree on every time. Pure numbers: nothing here touches the page.
//
//   The Moon: where it is (Meeus, Astronomical Algorithms ch. 47, the larger terms),
//     its phase, whether a spot on it is in daylight (a lunar day is 29.5 Earth days),
//     and the Earth's shadow (a lunar eclipse).
//   Mars: where it is (JPL's Keplerian elements for the planets, good for 1800–2050),
//     so how long light takes to cross (3 to 22 minutes), and the time of day there.
//   Orbit: a pigeon launched into low Earth orbit (400 km up, a lap every 92 minutes)
//     that comes down the next time its path passes over a friend.

export const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
export const MOON_R = 1737.4, EARTH_R = 6371, MARS_R = 3389.5, MEAN_KM = 384400, AU = 149597870.7, C_KMS = 299792.458;
const rad = Math.PI / 180, cos = (d) => Math.cos(d * rad), sin = (d) => Math.sin(d * rad), norm = (d) => ((d % 360) + 360) % 360;

/* ---------- places on the Moon and Mars ---------- */
// [name, lat, lon] (east positive). The Moon's far side is past ±90°.
export const SITES = [
  ["Tranquility Base", 0.67, 23.47], ["Sea of Tranquility", 8.5, 31.4], ["Tycho", -43.31, -11.36], ["Copernicus", 9.62, -20.08],
  ["Shackleton", -89.67, 129.78], ["Sea of Rains", 32.8, -15.6], ["Sea of Serenity", 28.0, 17.5], ["Ocean of Storms", 18.4, -57.4],
  ["Hadley Rille", 26.13, 3.63], ["Taurus–Littrow", 20.19, 30.77], ["Plato", 51.6, -9.4], ["Kepler", 8.1, -38.0],
  ["Aristarchus", 23.7, -47.4], ["Sea of Crises", 17.0, 59.1], ["Fra Mauro", -3.65, -17.47], ["Descartes Highlands", -8.97, 15.5],
  ["Sea of Nectar", -15.2, 35.5], ["Sea of Clouds", -21.3, -16.6], ["Sea of Fertility", -7.8, 51.3], ["Sea of Cold", 56.0, 1.4],
  ["Von Kármán", -44.4, 176.2], ["Tsiolkovskiy", -20.4, 129.1], ["Sea of Moscow", 27.3, 147.9], ["Daedalus", -5.9, 179.4],
  ["Apollo Basin", -36.1, -151.8], ["Korolev", -4.0, -157.4], ["Hertzsprung", 2.6, -129.2], ["Peary", 88.6, 33.0],
];
export const MARS_SITES = [
  ["Jezero Crater", 18.38, 77.58], ["Gale Crater", -5.4, 137.8], ["Olympus Mons", 18.65, -133.8], ["Valles Marineris", -13.9, -59.2],
  ["Hellas Basin", -42.4, 70.5], ["Utopia Planitia", 46.7, 117.5], ["Elysium Mons", 25.0, 147.2], ["Gusev Crater", -14.5, 175.4],
  ["Meridiani Planum", -1.9, -5.5], ["Arsia Mons", -8.3, -120.1], ["Pavonis Mons", 1.5, -112.8], ["Syrtis Major", 8.4, 69.5],
  ["Acidalia Planitia", 46.7, -22.0], ["Chryse Planitia", 22.5, -50.0], ["North Polar Cap", 85.0, 0.0], ["South Polar Cap", -85.0, 0.0],
];
export const ABOUT = {
  "Tranquility Base": "Apollo 11, 1969", "Tycho": "A bright young crater", "Copernicus": "The crater on every map", "Shackleton": "The south pole, in shadow",
  "Hadley Rille": "Apollo 15, by a winding valley", "Taurus–Littrow": "Apollo 17, the last visit", "Plato": "A dark, flat-floored crater", "Fra Mauro": "Apollo 14",
  "Descartes Highlands": "Apollo 16", "Aristarchus": "The brightest spot on the Moon", "Von Kármán": "Chang’e 4, first on the far side", "Tsiolkovskiy": "A dark crater, far side",
  "Sea of Moscow": "A far-side sea", "Daedalus": "Dead centre of the far side", "Korolev": "A huge far-side basin", "Peary": "Near the north pole",
  "Jezero Crater": "Perseverance’s old lake bed", "Gale Crater": "Curiosity’s mountain", "Olympus Mons": "The tallest volcano anywhere", "Valles Marineris": "A canyon as wide as America",
  "Hellas Basin": "The deepest point on Mars", "Utopia Planitia": "Viking 2 and Zhurong", "Elysium Mons": "A volcano on the plains", "Gusev Crater": "Spirit’s home",
  "Meridiani Planum": "Opportunity’s plain", "Arsia Mons": "A shield volcano", "Pavonis Mons": "On the equator", "Syrtis Major": "The dark mark you see by telescope",
  "Acidalia Planitia": "The Martian’s landing site", "Chryse Planitia": "Viking 1, 1976", "North Polar Cap": "Water ice and dust", "South Polar Cap": "Dry ice in winter",
};
export const BODIES = { moon: { name: "the Moon", R: MOON_R, sites: SITES }, mars: { name: "Mars", R: MARS_R, sites: MARS_SITES } };
export const bodyOf = (p) => (p?.b === "mars" ? "mars" : p?.b === "moon" ? "moon" : "earth");
export const farSide = (lon) => Math.abs(lon) > 90;
function hav(aLat, aLon, bLat, bLon, R) {
  const dLat = (bLat - aLat) * rad, dLon = (bLon - aLon) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, s)));
}
export const earthKm = (aLat, aLon, bLat, bLon) => hav(aLat, aLon, bLat, bLon, EARTH_R);
export const lunarKm = (aLat, aLon, bLat, bLon) => hav(aLat, aLon, bLat, bLon, MOON_R);
export const surfaceKm = (body, a, b) => hav(a.lat, a.lon, b.lat, b.lon, BODIES[body]?.R || EARTH_R);
// the name for a spot on a body: a site within 120 km (200 on Mars), else "Near" the closest
export function siteName(lat, lon, body = "moon") {
  const B = BODIES[body] || BODIES.moon, within = body === "mars" ? 200 : 120;
  let best = null, d = Infinity;
  for (const s of B.sites) { const k = hav(lat, lon, s[1], s[2], B.R); if (k < d) { d = k; best = s; } }
  return d <= within ? best[0] : `Near ${best[0]}`;
}
export const placeOn = (lat, lon, body = "moon") => `${siteName(lat, lon, body)}, ${BODIES[body]?.name || "the Moon"}`;

/* ---------- the Moon ---------- */
// (in Terrestrial Time, ~69 s ahead of the clock: the Moon moves its own width in an hour, so it counts)
const centuries = (t) => ((t + 69e3) / 864e5 + 2440587.5 - 2451545) / 36525;
function args(t) {
  const T = centuries(t);
  return { T, D: 297.8501921 + 445267.1114034 * T, M: 357.5291092 + 35999.0502909 * T, Mp: 134.9633964 + 477198.8675055 * T, F: 93.2720950 + 483202.0175233 * T };
}
// centre to centre, km
export function moonKm(t) {
  const { D, M, Mp, F } = args(t);
  return 385000.56 + (-20905355 * cos(Mp) - 3699111 * cos(2 * D - Mp) - 2955968 * cos(2 * D) - 569925 * cos(2 * Mp) + 48888 * cos(M) - 3149 * cos(2 * F)
    + 246158 * cos(2 * D - 2 * Mp) - 152138 * cos(2 * D - M - Mp) - 170733 * cos(2 * D + Mp) - 204586 * cos(2 * D - M) - 129620 * cos(M - Mp)
    + 108743 * cos(D) + 104755 * cos(M + Mp)) / 1000;
}
// Where the Moon is on the sky (Meeus, Astronomical Algorithms, ch. 47: the terms down to a few
// thousandths of a degree) and the Sun (ch. 25), so the Earth's shadow falls where it really does.
// Each row: multiples of D, M, M′, F, then the size in millionths of a degree.
const LON = [[0,0,1,0,6288774],[2,0,-1,0,1274027],[2,0,0,0,658314],[0,0,2,0,213618],[0,1,0,0,-185116],[0,0,0,2,-114332],[2,0,-2,0,58793],[2,-1,-1,0,57066],
  [2,0,1,0,53322],[2,-1,0,0,45758],[0,1,-1,0,-40923],[1,0,0,0,-34720],[0,1,1,0,-30383],[2,0,0,-2,15327],[0,0,1,2,-12528],[0,0,1,-2,10980],[4,0,-1,0,10675],
  [0,0,3,0,10034],[4,0,-2,0,8548],[2,1,-1,0,-7888],[2,1,0,0,-6766],[1,0,-1,0,-5163],[1,1,0,0,4987],[2,-1,1,0,4036],[2,0,2,0,3994],[4,0,0,0,3861],[2,0,-3,0,3665],
  [0,1,-2,0,-2689],[2,0,-1,2,-2602],[2,-1,-2,0,2390],[1,0,1,0,-2348],[2,-2,0,0,2236],[0,1,2,0,-2120],[0,2,0,0,-2069],[2,-2,-1,0,2048],[2,0,1,-2,-1773],
  [2,0,0,2,-1595],[4,-1,-1,0,1215],[0,0,2,2,-1110],[3,0,-1,0,-892],[2,1,1,0,-810],[4,-1,-2,0,759],[0,2,-1,0,-713],[2,2,-1,0,-700],[2,1,-2,0,691],[2,-1,0,-2,596],
  [4,0,1,0,549],[0,0,4,0,537],[4,-1,0,0,520],[1,0,-2,0,-487],[2,1,0,-2,-399],[0,0,2,-2,-381],[1,1,1,0,351],[3,0,-2,0,-340],[4,0,-3,0,330],[2,-1,2,0,327],
  [0,2,1,0,-323],[1,1,-1,0,299],[2,0,3,0,294]];
const LAT = [[0,0,0,1,5128122],[0,0,1,1,280602],[0,0,1,-1,277693],[2,0,0,-1,173237],[2,0,-1,1,55413],[2,0,-1,-1,46271],[2,0,0,1,32573],[0,0,2,1,17198],
  [2,0,1,-1,9266],[0,0,2,-1,8822],[2,-1,0,-1,8216],[2,0,-2,-1,4324],[2,0,1,1,4200],[2,1,0,-1,-3359],[2,-1,-1,1,2463],[2,-1,0,1,2211],[2,-1,-1,-1,2065],
  [0,1,-1,-1,-1870],[4,0,-1,-1,1828],[0,1,0,1,-1794],[0,0,0,3,-1749],[0,1,-1,1,-1565],[1,0,0,1,-1491],[0,1,1,1,-1475],[0,1,1,-1,-1410],[0,1,0,-1,-1344],
  [1,0,0,-1,-1335],[0,0,3,1,1107],[4,0,0,-1,1021],[4,0,-1,1,833]];
function moonSky(t) {
  const { T, D, M, Mp, F } = args(t), E = 1 - 0.002516 * T - 0.0000074 * T * T, Lp = 218.3164477 + 481267.88123421 * T;
  const A1 = 119.75 + 131.849 * T, A2 = 53.09 + 479264.29 * T, A3 = 313.45 + 481266.484 * T;
  const sum = (rows, f) => rows.reduce((a, [d, m, mp, ff, k]) => a + k * E ** Math.abs(m) * f(d * D + m * M + mp * Mp + ff * F), 0);
  const l = sum(LON, sin) + 3958 * sin(A1) + 1962 * sin(Lp - F) + 318 * sin(A2);
  const b = sum(LAT, sin) - 2235 * sin(Lp) + 382 * sin(A3) + 175 * sin(A1 - F) + 175 * sin(A1 + F) + 127 * sin(Lp - Mp) - 115 * sin(Lp + Mp);
  return { lon: norm(Lp + l / 1e6), lat: b / 1e6 };
}
// the Sun: its longitude (as we see it, a moment late with its light) and how far, in AU
function sunSky(t) {
  const T = centuries(t), L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T, M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * sin(M) + (0.019993 - 0.000101 * T) * sin(2 * M) + 0.000289 * sin(3 * M);
  const e = 0.016708634 - 0.000042037 * T, R = (1.000001018 * (1 - e * e)) / (1 + e * cos(M + C));
  return { lon: norm(L0 + C - 0.00569), R };
}
// how far round from the Sun the Moon is, seen from Earth (0: new, 180: full), and how far above or below its path
function elong(t) {
  const m = moonSky(t), s = sunSky(t);
  return { e: norm(m.lon - s.lon), beta: m.lat, sun: s };
}
export function moonPhase(t) {
  const { e } = elong(t), lit = (1 - cos(e)) / 2, waxing = e < 180;
  const name = lit < 0.03 ? "New Moon" : lit > 0.97 ? "Full Moon" : lit < 0.47 ? (waxing ? "Waxing Crescent" : "Waning Crescent")
    : lit <= 0.53 ? (waxing ? "First Quarter" : "Last Quarter") : waxing ? "Waxing Gibbous" : "Waning Gibbous";
  return { lit, waxing, name };
}
// the Earth as seen from the Moon: always the opposite phase
export function earthPhase(t) {
  const { lit, waxing } = moonPhase(t), e = 1 - lit;
  const name = e < 0.03 ? "New Earth" : e > 0.97 ? "Full Earth" : e < 0.47 ? "Crescent Earth" : e <= 0.53 ? "Half Earth" : "Gibbous Earth";
  return { lit: e, waxing: !waxing, name };
}
export const nearFar = (km) => (km < 365000 ? "close this week" : km > 400000 ? "far away this week" : "");
export const SUPERMOON_KM = 362000;
// In the Earth's shadow (a lunar eclipse): any of the Moon inside the umbra, the dark core. Its size
// that night comes from how far off the Moon and the Sun are (with the 2% the air adds, as the
// almanacs do); then it's whether the Moon's disc reaches into it.
export function inShadow(t) {
  const { e, beta, sun } = elong(t), km = moonKm(t);
  const par = Math.asin(6378.14 / km) / rad, moonR = Math.asin(1737.4 / km) / rad;
  const umbra = 1.02 * (0.99834 * par - 0.26656 / sun.R + 0.002443 / sun.R);
  const sep = Math.acos(Math.max(-1, Math.min(1, cos(beta) * cos(e - 180)))) / rad;
  return sep < umbra + moonR;
}
// the first moment between a and b the Moon is in the Earth's shadow (to the minute), or null
export function eclipseBetween(a, b) {
  if (!(b > a)) return null;
  // only near full Moon: skip ahead quickly otherwise
  for (let t = a; t <= b; ) {
    const { e } = elong(t);
    if (Math.abs(180 - e) > 4) { t += Math.max(10 * MIN, ((Math.abs(180 - e) - 3) / 16) * DAY); continue; }     // (the Moon moves under 16° a day)
    if (inShadow(t)) {
      // (looked at every 5 minutes, the shallowest eclipse lasts an hour; then back to the minute it began)
      let lo = Math.max(a, t - 5 * MIN), hi = t;
      if (inShadow(lo)) return { at: lo };
      while (hi - lo > MIN) { const mid = (lo + hi) / 2; if (inShadow(mid)) hi = mid; else lo = mid; }
      return { at: Math.round(hi / MIN) * MIN };
    }
    t += 5 * MIN;
  }
  return null;
}
// where on the Moon the Sun is overhead: its longitude (it slides west 12° a day; latitude stays within 1.5°)
const subsolar = (t) => norm(180 - elong(t).e + 180) - 180;
// Day or night at a spot on the Moon, and when that changes: { day, next }
export function lunarDay(lat, lon, t) {
  const la = Math.max(-89.9, Math.min(89.9, lat)), up = (tt) => cos(la) * cos(lon - subsolar(tt)) > 0.0001;     // (at a pole the Sun only skims the horizon)
  const day = up(t);
  let x = t; for (let i = 0; i < 31 * 24 && up(x) === day; i++) x += HOUR;
  return { day, next: x };
}
// Mars: the time of day at a longitude (Mars Coordinated Time, a sol is 24h 39m), and when the Sun next rises or sets
const SOL = 1.0274912517 * DAY;
export function marsClock(lon, t) {
  const msd = (t / 864e5 + 2440587.5 + 69.184 / 86400 - 2405522.0028779) / 1.0274912517;
  const h = (((24 * msd + lon / 15) % 24) + 24) % 24, day = h >= 6 && h < 18;
  const toNext = ((day ? 18 - h : (h < 6 ? 6 - h : 30 - h)) / 24) * SOL;
  return { h, day, next: t + toNext, hm: `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.floor((h % 1) * 60)).padStart(2, "0")}` };
}

/* ---------- Mars and the Earth round the Sun ---------- */
// [a, e, I, L, long. perihelion, long. node] at J2000, and per century (JPL, Standish)
const EL = {
  earth: [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0], [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0]],
  mars: [[1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891], [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
};
function helio(p, t) {
  const T = (t / 864e5 + 2440587.5 - 2451545) / 36525, [e0, r] = EL[p];
  const [a, e, I, L, wb, O] = e0.map((x, i) => x + r[i] * T);
  const M = norm(L - wb) * rad, w = (wb - O) * rad, Ir = I * rad, Or = O * rad;
  let E = M; for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const x1 = a * (Math.cos(E) - e), y1 = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(Or), sO = Math.sin(Or), cI = Math.cos(Ir), sI = Math.sin(Ir);
  return [(cw * cO - sw * sO * cI) * x1 + (-sw * cO - cw * sO * cI) * y1, (cw * sO + sw * cO * cI) * x1 + (-sw * sO + cw * cO * cI) * y1, sw * sI * x1 + cw * sI * y1];
}
export function marsKm(t) { const a = helio("earth", t), b = helio("mars", t); return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * AU; }
// the Sun–Earth–Mars angle (degrees): under 2°, the Sun is in the way (solar conjunction)
export function marsElong(t) {
  const a = helio("earth", t), b = helio("mars", t), d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], s = [-a[0], -a[1], -a[2]];
  return Math.acos((d[0] * s[0] + d[1] * s[1] + d[2] * s[2]) / (Math.hypot(...d) * Math.hypot(...s))) / rad;
}
// light time, ms
export const lightMs = (km) => (km / C_KMS) * 1000;

/* ---------- pigeons through space ---------- */
// lunar: Earth to Moon at the mean distance (and across it, bounding); laser: anything to or from Mars, at the
// speed of light; orbital: Earth to Earth, by way of low Earth orbit
export const SPACE = {
  lunar: { name: "Lunar", trip: 3 * DAY, kmh: 160, max: 3 },
  lunarx: { name: "Lunar Express", trip: DAY, kmh: 480, max: 1 },
  laser: { name: "Laser", max: 5 },
  orbital: { name: "Orbital", max: 2 },
};
// what may carry a message between two ends ({ b, lat, lon }): the space pigeons for it, or null (an Earth one)
export function spaceKinds(a, b) {
  const x = bodyOf(a), y = bodyOf(b);
  if (x === "mars" || y === "mars") return ["laser"];
  if (x === "moon" || y === "moon") return ["lunar", "lunarx"];
  return null;
}
// How a space pigeon goes from one end to the other, leaving at t: { k, km, ms, dist, ...its way }
export function spaceFlight(kind, from, to, t, speed = 1) {
  const x = bodyOf(from), y = bodyOf(to);
  if (kind === "laser") {
    if (x === "mars" && y === "mars") return { k: "laser", km: Math.round(2 * 17000), ms: Math.max(1000, Math.round(lightMs(2 * 17000))), dist: 17000, relay: true };   // (by an orbiter overhead)
    const d = marsKm(t) + (x === "moon" || y === "moon" ? 0 : 0);
    return { k: "laser", km: Math.round(d), ms: Math.round(lightMs(d)), dist: Math.round(d) };
  }
  if (kind === "orbital") return orbitFlight(from, to, t);
  const p = SPACE[kind];
  if (x === "moon" && y === "moon") {
    const km = lunarKm(from.lat, from.lon, to.lat, to.lon);
    return { k: "surface", km: Math.round(km), ms: Math.round(Math.max(10 * MIN, (km / (p.kmh * speed)) * HOUR)), dist: null };
  }
  const dist = Math.round(moonKm(t));
  return { k: "trip", km: Math.round(dist - EARTH_R - MOON_R), ms: Math.round((p.trip * dist) / MEAN_KM / speed), dist };
}

// A pigeon that followed someone to another world flies in legs (functions/_follow.js): its last leg
// is `moon` itself (from mn.t0, else when it was sent), and the one before, if any, is mn.prev (to mn.t0).
// The leg in the air at t, with its own times, and `then`: the leg still to come.
export function legOf(mn, sentAt, deliverAt, t) {
  if (mn?.prev && t < mn.t0) return { mn: mn.prev, from: mn.prev.t0 ?? sentAt, to: mn.t0, then: mn };
  return { mn, from: mn?.t0 ?? sentAt, to: deliverAt, then: null };
}
export const spaceLegs = (mn, sentAt, deliverAt) =>
  mn?.prev ? [{ mn: mn.prev, from: mn.prev.t0 ?? sentAt, to: mn.t0 }, { mn, from: mn.t0, to: deliverAt }] : [{ mn, from: mn?.t0 ?? sentAt, to: deliverAt }];

/* ---------- low Earth orbit ---------- */
// climb: lift-off to orbit; reach: how far to one side it can glide coming down (as a winged
// spacecraft can), since its path only passes right over a given spot every few days
export const ORBIT = { alt: 400, climb: 10 * MIN, descend: 12 * MIN, reach: 900 };
const MU = 398600.4418, SIDEREAL = 86164.0905;
export const orbitPeriod = () => 2 * Math.PI * Math.sqrt((EARTH_R + ORBIT.alt) ** 3 / MU) * 1000;      // ms (about 92.4 minutes)
// where its path is over the ground, tau ms after reaching orbit
export function orbitAt(o, tau) {
  const u = o.u0 + (360 * tau) / o.T, la = Math.asin(sin(o.i) * sin(u)) / rad;
  const lo = o.node + Math.atan2(cos(o.i) * sin(u), cos(u)) / rad - (360 * tau) / (SIDEREAL * 1000);
  return [la, ((((lo + 180) % 360) + 360) % 360) - 180];      // (laps drift it far west: always back within ±180°)
}
// Launched from one friend (heading north-east into an orbit tilted just enough to pass over both), it
// comes down on the first pass within reach of the other (one less than 20 minutes in is too soon), and
// glides the rest of the way: 12 minutes, and a minute more for every 130 km to one side
export function orbitFlight(from, to, t) {
  const T = orbitPeriod(), i = Math.min(97, Math.max(Math.abs(from.lat), Math.abs(to.lat)) + 8);
  const u0 = Math.asin(Math.max(-1, Math.min(1, sin(from.lat) / sin(i)))) / rad;
  const node = from.lon - Math.atan2(cos(i) * sin(u0), cos(u0)) / rad;
  const o = { i: Math.round(i * 100) / 100, u0, node, T };
  let best = null;
  for (let tau = 20 * MIN; tau <= DAY; tau += 20e3) {
    const [la, lo] = orbitAt(o, tau), d = earthKm(la, lo, to.lat, to.lon);
    if (!best || d < best.d) best = { d, tau };
    if (d < ORBIT.reach) {
      // (the nearest point of this pass, not the first one in reach)
      for (let k = tau + 20e3; k < tau + 10 * MIN; k += 20e3) { const q = orbitAt(o, k), dk = earthKm(q[0], q[1], to.lat, to.lon); if (dk < best.d) best = { d: dk, tau: k }; else break; }
      break;
    }
  }
  const down = best.tau, glide = Math.round(ORBIT.descend + (best.d / 130) * MIN), ms = ORBIT.climb + down + glide;
  return { k: "orbit", km: Math.round(((2 * Math.PI * (EARTH_R + ORBIT.alt)) * down) / T + best.d), ms: Math.round(ms), dist: null, i: o.i, u0: o.u0, node: o.node, T, down, glide, laps: Math.round((down / T) * 10) / 10 };
}
// where an orbital pigeon is at time t (ms after it left): [lat, lon, phase] — climbing, in orbit, coming down
export function orbitWhere(mn, el) {
  const o = { i: mn.i, u0: mn.u0, node: mn.node, T: mn.T };
  if (el <= ORBIT.climb) return [mn.from.lat, mn.from.lon, "climb"];
  const tau = el - ORBIT.climb;
  if (tau <= mn.down) return [...orbitAt(o, tau), "orbit"];
  const [la, lo] = orbitAt(o, mn.down), f = Math.min(1, (tau - mn.down) / (mn.glide || ORBIT.descend));
  return [la + (mn.to.lat - la) * f, lo + (((mn.to.lon - lo + 540) % 360) - 180) * f, "down"];
}

/* ---------- the moments of a trip ---------- */
// How far along the way it is (0 to 1) a fraction f of the time in: quick away from Earth, slowing as
// Earth's pull holds it back (the other way round coming home)
const P = 1.45;
export const distAt = (mn, f) => (mn.k !== "trip" ? f : mn.from.b === "earth" ? 1 - (1 - f) ** P : f ** P);
const timeAt = (mn, s) => (mn.k !== "trip" ? s : mn.from.b === "earth" ? 1 - (1 - s) ** (1 / P) : s ** (1 / P));
// points along a great circle between two spots: [lat, lon]
export function arc(a, b, n) {
  const v = (la, lo) => [Math.cos(la * rad) * Math.cos(lo * rad), Math.cos(la * rad) * Math.sin(lo * rad), Math.sin(la * rad)];
  const A = v(a.lat, a.lon), B = v(b.lat, b.lon), w = Math.acos(Math.min(1, Math.max(-1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2]))), out = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n; if (w < 1e-9) { out.push([a.lat, a.lon]); continue; }
    const s1 = Math.sin((1 - f) * w) / Math.sin(w), s2 = Math.sin(f * w) / Math.sin(w);
    const x = s1 * A[0] + s2 * B[0], y = s1 * A[1] + s2 * B[1], z = s1 * A[2] + s2 * B[2];
    out.push([Math.atan2(z, Math.hypot(x, y)) / rad, Math.atan2(y, x) / rad]);
  }
  return out;
}
const fmtLight = (ms) => (ms < 60e3 ? `${(ms / 1000).toFixed(ms < 10e3 ? 1 : 0)} seconds` : `${Math.floor(ms / 60e3)} min ${Math.round((ms % 60e3) / 1000)} s`);
// The moments of a trip, in order: { at, done, icon, text, tell } (tell: worth a notification).
// where(lat, lon): a name for a spot on Earth (the phone's map has one; the server gives none)
export function spaceMoments(mn, sentAt, deliverAt, t, where = null) {
  const T = deliverAt - sentAt, at = (f) => sentAt + Math.max(0, Math.min(1, f)) * T, out = [];
  const add = (f, icon, text, tell = false) => out.push({ at: at(f), icon, text, tell });
  const nm = (e) => (e?.place ? e.place.replace(/, (the Moon|Mars)$/, "") : e?.b === "moon" ? "the Moon" : e?.b === "mars" ? "Mars" : "Earth");
  if (mn.k === "laser") {
    const ms = T;
    add(0, "up", mn.relay ? `Fired up to an orbiter from ${nm(mn.from)}` : `Fired from ${nm(mn.from)} at the speed of light`);
    if (!mn.relay && mn.from.b === "earth") add(1.28e3 / ms, "moon", "Past the Moon’s orbit, 1.3 seconds out");
    if (!mn.relay) add(0.5, "dist", `Halfway: ${fmtLight(ms / 2)} out`);
    add(1, "check", mn.relay ? `Down to ${nm(mn.to)}` : `Caught at ${nm(mn.to)}, ${fmtLight(ms)} later`);
  } else if (mn.k === "orbit") {
    const toT = (ms) => ms / T;
    add(0, "up", `Lifted off from ${nm(mn.from)}`);
    add(toT(ORBIT.climb), "globe", `In orbit, ${Math.round(ORBIT.alt * 0.621371)} miles up, at 17,000 mph`, true);
    const laps = Math.floor(mn.down / mn.T);
    for (let k = 1; k <= Math.min(laps, 15); k++) add(toT(ORBIT.climb + k * mn.T), "dot", `Round the Earth: lap ${k}${laps > 1 ? ` of ${laps}` : ""}`);
    const [rl, ro] = orbitAt(mn, mn.down), over = where ? where(rl, ro) : null;
    add(toT(ORBIT.climb + mn.down), "fire", `Re-entry: a fireball${over ? ` over ${over}` : ""}`, true);
    add(1, "check", mn.to.place ? `Touchdown in ${nm(mn.to)}` : "Touchdown");
  } else if (mn.k === "surface") {
    add(0, "up", `Bounded off from ${nm(mn.from)}`);
    const pts = arc(mn.from, mn.to, 48), seen = new Set([nm(mn.from), nm(mn.to)]);
    let side = farSide(mn.from.lon);
    for (let i = 1; i < pts.length - 1; i++) {
      const [la, lo] = pts[i], f = i / (pts.length - 1);
      if (farSide(lo) !== side) { side = farSide(lo); add(f, side ? "moon" : "globe", side ? "Over the horizon: Earth sets behind it" : "Earthrise: Earth comes up over the horizon"); }
      for (const s of SITES) if (!seen.has(s[0]) && lunarKm(la, lo, s[1], s[2]) < 90) { seen.add(s[0]); add(f, "pin", `Bounding past ${s[0]}`); }
    }
    add(1, "check", `Touchdown at ${nm(mn.to)}`);
  } else if (mn.from.b === "earth") {
    const d = mn.dist || MEAN_KM;
    add(0, "up", `Lifted off from ${nm(mn.from)}`);
    add(Math.min(0.02, (10 * MIN) / T), "globe", "Left Earth’s atmosphere");
    add(timeAt(mn, 36000 / d), "dot", "Past the highest satellites");
    add(timeAt(mn, 0.5), "dist", "Halfway to the Moon", true);
    if (farSide(mn.to.lon)) { add(timeAt(mn, 1 - 66000 / d), "moon", "Into the Moon’s pull"); add(timeAt(mn, 0.988), "moon", "Behind the Moon: out of touch with Earth", true); }
    else { add(timeAt(mn, 1 - 66000 / d), "moon", "Into the Moon’s pull", true); add(timeAt(mn, 0.992), "moon", "In orbit around the Moon"); }
    add(1, "check", `Touchdown at ${nm(mn.to)}`);
  } else {
    const d = mn.dist || MEAN_KM;
    add(0, "up", `Lifted off from ${nm(mn.from)}`);
    if (farSide(mn.from.lon)) add(timeAt(mn, 0.012), "moon", "Out from behind the Moon: Earth in sight");
    add(timeAt(mn, 66000 / d), "moon", "Out of the Moon’s pull");
    add(timeAt(mn, 0.5), "dist", "Halfway home", true);
    add(timeAt(mn, 1 - 36000 / d), "dot", "Past the highest satellites");
    add(Math.max(0.98, 1 - (15 * MIN) / T), "fire", "Re-entry: a fireball over Earth", true);
    add(1, "check", mn.to.place ? `Touchdown in ${nm(mn.to)}` : "Touchdown on Earth");
  }
  // a real lunar eclipse while it's on its way to or from the Moon
  if (mn.k === "trip") { const ec = eclipseBetween(sentAt, deliverAt); if (ec) out.push({ at: ec.at, icon: "moon", text: "Lunar eclipse: the Moon slides into Earth’s shadow", tell: true }); }
  return out.sort((a, b) => a.at - b.at).map((x, i) => ({ ...x, i, done: x.at <= t }));
}

/* ---------- postmarks off the Earth ---------- */
// [id, name, body, lat, lon, km, kind]: a pigeon landing within km of one (or bounding past) brings back its postmark
export const SPACE_MARKS = [
  ["m_tranquility", "Tranquility Base", "moon", 0.67, 23.47, 120, "flag"],
  ["m_tycho", "Tycho", "moon", -43.31, -11.36, 120, "crater"],
  ["m_copernicus", "Copernicus", "moon", 9.62, -20.08, 120, "crater"],
  ["m_shackleton", "Shackleton", "moon", -89.67, 129.78, 150, "crater"],
  ["m_hadley", "Hadley Rille", "moon", 26.13, 3.63, 120, "rover"],
  ["m_vonkarman", "Von Kármán", "moon", -44.4, 176.2, 150, "lander"],
  ["x_olympus", "Olympus Mons", "mars", 18.65, -133.8, 350, "volcano"],
  ["x_valles", "Valles Marineris", "mars", -13.9, -59.2, 400, "canyon"],
  ["x_jezero", "Jezero Crater", "mars", 18.38, 77.58, 200, "rover"],
  ["x_gale", "Gale Crater", "mars", -5.4, 137.8, 200, "rover"],
];
export function spaceMarks(mn) {
  const hits = [], on = (e) => bodyOf(e);
  for (const [id, , b, lat, lon, km] of SPACE_MARKS) {
    const R = BODIES[b].R;
    if (on(mn.to) === b && hav(mn.to.lat, mn.to.lon, lat, lon, R) <= km) { hits.push(id); continue; }
    if (mn.k === "surface" && on(mn.from) === b && hav(mn.from.lat, mn.from.lon, lat, lon, R) > km && arc(mn.from, mn.to, 48).some(([la, lo]) => hav(la, lo, lat, lon, R) <= km * 0.75)) hits.push(id);
  }
  return hits;
}
