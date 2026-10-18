// The Sun and Moon from where you are: sunrise, golden and blue hours, twilight,
// moonrise and moonset, the Moon's phase. Plain maths, no network.
//
// Times here are real UTC milliseconds. The rest of the app works in the
// forecast's own wall-clock time ("wall ms": the local time read as if it were
// UTC); `offsetFor` finds the UTC offset for a day from the forecast's own
// sunrise, so a day after the clocks change is still right.

const RAD = Math.PI / 180, DAY = 864e5;
const sin = (d) => Math.sin(d * RAD), cos = (d) => Math.cos(d * RAD);
const norm = (d) => ((d % 360) + 360) % 360;
const daysJ2000 = (t) => t / DAY - 10957.5;            // days since 2000-01-01 12:00 UTC

// Greenwich mean sidereal time, degrees
const gmst = (t) => norm(280.46061837 + 360.98564736629 * daysJ2000(t));
const obliquity = (t) => 23.439291 - 0.0000004 * daysJ2000(t);

// right ascension / declination (degrees) from ecliptic longitude / latitude
function equatorial(lon, lat, t) {
  const e = obliquity(t);
  const ra = norm(Math.atan2(sin(lon) * cos(e) - Math.tan(lat * RAD) * sin(e), cos(lon)) / RAD);
  const dec = Math.asin(sin(lat) * cos(e) + cos(lat) * sin(e) * sin(lon)) / RAD;
  return { ra, dec };
}
// altitude and azimuth (degrees; azimuth from north, clockwise) of an object at ra/dec
function horizontal(ra, dec, t, lat, lon) {
  const H = norm(gmst(t) + lon - ra);
  const alt = Math.asin(sin(lat) * sin(dec) + cos(lat) * cos(dec) * cos(H)) / RAD;
  const az = norm(Math.atan2(-sin(H) * cos(dec), cos(lat) * sin(dec) - sin(lat) * cos(dec) * cos(H)) / RAD);
  return { alt, az };
}

/* ---------- the Sun ---------- */
export function sunEcliptic(t) {
  const d = daysJ2000(t), g = norm(357.529 + 0.98560028 * d), q = norm(280.459 + 0.98564736 * d);
  return { lon: norm(q + 1.915 * sin(g) + 0.020 * sin(2 * g)), lat: 0 };
}
export function sunAt(t, lat, lon) {
  const s = sunEcliptic(t), { ra, dec } = equatorial(s.lon, 0, t);
  return horizontal(ra, dec, t, lat, lon);
}

/* ---------- the Moon (Meeus ch. 47, its largest terms: a few hundredths of a degree) ---------- */
const LON = [[0,0,1,0,6288774],[2,0,-1,0,1274027],[2,0,0,0,658314],[0,0,2,0,213618],[0,1,0,0,-185116],[0,0,0,2,-114332],
  [2,0,-2,0,58793],[2,-1,-1,0,57066],[2,0,1,0,53322],[2,-1,0,0,45758],[0,1,-1,0,-40923],[1,0,0,0,-34720],[0,1,1,0,-30383],
  [2,0,0,-2,15327],[0,0,1,2,-12528],[0,0,1,-2,10980],[4,0,-1,0,10675],[0,0,3,0,10034],[4,0,-2,0,8548],[2,1,-1,0,-7888],
  [2,1,0,0,-6766],[1,0,-1,0,-5163],[1,1,0,0,4987],[2,-1,1,0,4036],[2,0,2,0,3994],[4,0,0,0,3861],[2,0,-3,0,3665]];
const LAT = [[0,0,0,1,5128122],[0,0,1,1,280602],[0,0,1,-1,277693],[2,0,0,-1,173237],[2,0,-1,1,55413],[2,0,-1,-1,46271],
  [2,0,0,1,32573],[0,0,2,1,17198],[2,0,1,-1,9266],[0,0,2,-1,8822],[2,-1,0,-1,8216],[2,0,-2,-1,4324],[2,0,1,1,4200]];
const DIST = [[0,0,1,0,-20905355],[2,0,-1,0,-3699111],[2,0,0,0,-2955968],[0,0,2,0,-569925],[0,1,0,0,48888],[0,0,0,2,-3149],
  [2,0,-2,0,246158],[2,-1,-1,0,-152138],[2,0,1,0,-170733],[2,-1,0,0,-204586],[0,1,-1,0,-129620],[1,0,0,0,108743],[0,1,1,0,104755]];
export function moonEcliptic(t) {
  const T = daysJ2000(t) / 36525;
  const Lp = 218.3164477 + 481267.88123421 * T, D = 297.8501921 + 445267.1114034 * T, M = 357.5291092 + 35999.0502909 * T;
  const Mp = 134.9633964 + 477198.8675055 * T, F = 93.2720950 + 483202.0175233 * T, E = 1 - 0.002516 * T;
  const arg = (d, m, mp, f) => d * D + m * M + mp * Mp + f * F;
  const sum = (rows, fn) => rows.reduce((a, [d, m, mp, f, k]) => a + k * E ** Math.abs(m) * fn(arg(d, m, mp, f)), 0);
  const lon = norm(Lp + sum(LON, sin) / 1e6), lat = sum(LAT, sin) / 1e6, km = 385000.56 + sum(DIST, cos) / 1000;
  return { lon, lat, km };
}
export function moonAt(t, lat, lon) {
  const m = moonEcliptic(t), { ra, dec } = equatorial(m.lon, m.lat, t), h = horizontal(ra, dec, t, lat, lon);
  // seen from the ground rather than the Earth's centre: about a degree lower near the horizon
  h.alt -= Math.asin(6378.14 / m.km * Math.cos(h.alt * RAD)) / RAD;
  return h;
}
// How lit the Moon is (0 to 1), whether it's waxing, its phase's name, and how far round it is (0 new, 180 full)
export function moonPhase(t) {
  const e = norm(moonEcliptic(t).lon - sunEcliptic(t).lon), lit = (1 - cos(e)) / 2, waxing = e < 180;
  const name = lit < 0.03 ? "New Moon" : lit > 0.97 ? "Full Moon" : lit < 0.45 ? (waxing ? "Waxing Crescent" : "Waning Crescent")
    : lit <= 0.55 ? (waxing ? "First Quarter" : "Last Quarter") : waxing ? "Waxing Gibbous" : "Waning Gibbous";
  return { lit, waxing, name, angle: e };
}
// The next new and full moons after t (real ms), found to within a few minutes
export function nextPhases(t) {
  const out = {}, el = (x) => norm(moonEcliptic(x).lon - sunEcliptic(x).lon);
  for (const [k, at] of [["full", 180], ["new", 0]]) {
    const off = (x) => ((el(x) - at + 540) % 360) - 180;     // -180..180, rises through 0 at the phase
    let a = t, fa = off(a);
    for (let s = 0; s < 64; s++) {
      const b = a + DAY / 2, fb = off(b);
      if (fa < 0 && fb >= 0 && fb - fa < 90) {
        let lo = a, hi = b;
        for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (off(mid) < 0) lo = mid; else hi = mid; }
        out[k] = Math.round((lo + hi) / 2); break;
      }
      a = b; fa = fb;
    }
  }
  return out;
}

/* ---------- when things cross the horizon (or any height) ---------- */
// Scan a span in 5-minute steps; return each time `alt(t)` crosses `h`, rising or setting.
const STEP = 5 * 60e3;
function crossings(fn, from, to, h) {
  const out = [];
  let t0 = from, a0 = fn(t0) - h;
  for (let t1 = from + STEP; t1 <= to; t1 += STEP) {
    const a1 = fn(t1) - h;
    if ((a0 < 0) !== (a1 < 0)) out.push({ t: Math.round(t0 + (t1 - t0) * (a0 / (a0 - a1))), up: a1 > a0 });
    t0 = t1; a0 = a1;
  }
  return out;
}
const firstOf = (list, up) => list.find((c) => c.up === up)?.t ?? null;

// A day of sky at lat/lon. `start`: the day's local midnight, as real UTC ms.
// Every time is real UTC ms, or null when it doesn't happen that day (polar days and nights, a Moon that doesn't rise).
export function skyDay(start, lat, lon) {
  const end = start + DAY, sun = (t) => sunAt(t, lat, lon).alt, moon = (t) => moonAt(t, lat, lon).alt;
  const at = (h) => crossings(sun, start, end, h);
  const rise = at(-0.833), gold = at(6), blue = at(-4), civil = at(-6), astro = at(-18);
  // the Sun's highest point
  let noon = start, best = -90;
  for (let t = start; t <= end; t += STEP) { const a = sun(t); if (a > best) { best = a; noon = t; } }
  const m = crossings(moon, start, end, -0.833);
  return {
    sunrise: firstOf(rise, true), sunset: firstOf(rise, false), noon, noonAlt: best,
    // golden hour: the Sun under 6° up (and still above -4°); blue hour: between -4° and -6°
    goldenAm: [firstOf(blue, true), firstOf(gold, true)], goldenPm: [firstOf(gold, false), firstOf(blue, false)],
    blueAm: [firstOf(civil, true), firstOf(blue, true)], bluePm: [firstOf(blue, false), firstOf(civil, false)],
    dawn: firstOf(civil, true), dusk: firstOf(civil, false), darkEnd: firstOf(astro, true), darkStart: firstOf(astro, false),
    moonrise: firstOf(m, true), moonset: firstOf(m, false), phase: moonPhase(start + DAY / 2),
  };
}

// The UTC offset (seconds) on the day a forecast's sunrise (wall ms) belongs to: the difference
// from the computed sunrise, to the nearest quarter hour. null if there's no sunrise to go by.
export function offsetFor(sunriseWall, lat, lon, guessSec) {
  if (sunriseWall == null) return guessSec;
  const guess = sunriseWall - guessSec * 1000, list = crossings((t) => sunAt(t, lat, lon).alt, guess - 3 * 3600e3, guess + 3 * 3600e3, -0.833);
  const real = firstOf(list, true);
  if (real == null) return guessSec;
  return Math.round((sunriseWall - real) / 900e3) * 900 + 0;
}

// Is the Moon up at t, and how high (degrees)
export const moonUp = (t, lat, lon) => moonAt(t, lat, lon).alt;
