// InFlight — the Moon, on the phone: its sites, how far away it is today, how a lunar pigeon
// goes, and the pictures of it (the map to pick a spot on, and a pigeon on its way).
// The server works the same numbers out in functions/_moon.js; these only draw and explain.
import { LAND } from "./land.js";

const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
export const MOON_R = 1737.4, EARTH_R = 6371, MEAN_KM = 384400;
// [name, lat, lon] (selenographic degrees, east positive): the same list as the server's
export const SITES = [
  ["Tranquility Base", 0.67, 23.47], ["Sea of Tranquility", 8.5, 31.4], ["Tycho", -43.31, -11.36], ["Copernicus", 9.62, -20.08],
  ["Shackleton", -89.67, 129.78], ["Sea of Rains", 32.8, -15.6], ["Sea of Serenity", 28.0, 17.5], ["Ocean of Storms", 18.4, -57.4],
  ["Hadley Rille", 26.13, 3.63], ["Taurus–Littrow", 20.19, 30.77], ["Plato", 51.6, -9.4], ["Kepler", 8.1, -38.0],
  ["Aristarchus", 23.7, -47.4], ["Sea of Crises", 17.0, 59.1], ["Fra Mauro", -3.65, -17.47], ["Descartes Highlands", -8.97, 15.5],
  ["Sea of Nectar", -15.2, 35.5], ["Sea of Clouds", -21.3, -16.6], ["Sea of Fertility", -7.8, 51.3], ["Sea of Cold", 56.0, 1.4],
  ["Von Kármán", -44.4, 176.2], ["Tsiolkovskiy", -20.4, 129.1], ["Sea of Moscow", 27.3, 147.9], ["Daedalus", -5.9, 179.4],
  ["Apollo Basin", -36.1, -151.8], ["Korolev", -4.0, -157.4], ["Hertzsprung", 2.6, -129.2], ["Peary", 88.6, 33.0],
];
// what each is, in a few words (the picker's list)
export const ABOUT = {
  "Tranquility Base": "Apollo 11, 1969", "Tycho": "A bright young crater", "Copernicus": "The crater on every map", "Shackleton": "The south pole, in shadow",
  "Hadley Rille": "Apollo 15, by a winding valley", "Taurus–Littrow": "Apollo 17, the last visit", "Plato": "A dark, flat-floored crater", "Fra Mauro": "Apollo 14",
  "Descartes Highlands": "Apollo 16", "Aristarchus": "The brightest spot on the Moon", "Von Kármán": "Chang’e 4, first on the far side", "Tsiolkovskiy": "A dark crater, far side",
  "Sea of Moscow": "A far-side sea", "Daedalus": "Dead centre of the far side", "Korolev": "A huge far-side basin", "Peary": "Near the north pole",
};
export const farSide = (lon) => Math.abs(lon) > 90;
const rad = Math.PI / 180;
function hav(aLat, aLon, bLat, bLon, R) {
  const dLat = (bLat - aLat) * rad, dLon = (bLon - aLon) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, s)));
}
export const lunarKm = (aLat, aLon, bLat, bLon) => hav(aLat, aLon, bLat, bLon, MOON_R);
export function siteName(lat, lon) {
  let best = null, d = Infinity;
  for (const s of SITES) { const k = lunarKm(lat, lon, s[1], s[2]); if (k < d) { d = k; best = s; } }
  return d <= 120 ? best[0] : `Near ${best[0]}`;
}

/* ---- where the Moon is (Meeus ch. 47, the larger terms) ---- */
const cos = (d) => Math.cos(d * rad), sin = (d) => Math.sin(d * rad);
function args(t) {
  const T = (t / 864e5 + 2440587.5 - 2451545) / 36525;
  return { D: 297.8501921 + 445267.1114034 * T, M: 357.5291092 + 35999.0502909 * T, Mp: 134.9633964 + 477198.8675055 * T, F: 93.2720950 + 483202.0175233 * T };
}
export function moonKm(t) {
  const { D, M, Mp, F } = args(t);
  return 385000.56 + (-20905355 * cos(Mp) - 3699111 * cos(2 * D - Mp) - 2955968 * cos(2 * D) - 569925 * cos(2 * Mp) + 48888 * cos(M) - 3149 * cos(2 * F)
    + 246158 * cos(2 * D - 2 * Mp) - 152138 * cos(2 * D - M - Mp) - 170733 * cos(2 * D + Mp) - 204586 * cos(2 * D - M) - 129620 * cos(M - Mp)
    + 108743 * cos(D) + 104755 * cos(M + Mp)) / 1000;
}
// how much of it is lit, and what that's called
export function moonPhase(t) {
  const { D, M, Mp } = args(t);
  const i = 180 - (((D % 360) + 360) % 360) - 6.289 * sin(Mp) + 2.1 * sin(M) - 1.274 * sin(2 * D - Mp) - 0.658 * sin(2 * D) - 0.214 * sin(2 * Mp) - 0.11 * sin(D);
  const lit = (1 + cos(i)) / 2, waxing = (((D % 360) + 360) % 360) < 180;
  const name = lit < 0.03 ? "New Moon" : lit > 0.97 ? "Full Moon" : lit < 0.47 ? (waxing ? "Waxing Crescent" : "Waning Crescent")
    : lit <= 0.53 ? (waxing ? "First Quarter" : "Last Quarter") : waxing ? "Waxing Gibbous" : "Waning Gibbous";
  return { lit, waxing, name };
}
// is the Moon close or far today (it swings between about 356,000 and 406,000 km)
export const nearFar = (km) => (km < 365000 ? "close this week" : km > 400000 ? "far away this week" : "");

/* ---- lunar pigeons ---- */
export const LUNAR = {
  lunar: { name: "Lunar", trip: 3 * DAY, kmh: 160, max: 3, what: "About 3 days, like Apollo" },
  lunarx: { name: "Lunar Express", trip: DAY, kmh: 480, max: 1, what: "About a day" },
};
// how long a lunar pigeon takes, leaving at t (as the server works it out)
export function lunarMs(kind, from, to, t, speed = 1) {
  const p = LUNAR[kind];
  if (!from || !to) return p.trip;
  if (from.b === "moon" && to.b === "moon") return Math.max(10 * MIN, (lunarKm(from.lat, from.lon, to.lat, to.lon) / (p.kmh * speed)) * HOUR);
  return (p.trip * moonKm(t)) / MEAN_KM / speed;
}
// how far along the way it is (0 to 1) a fraction f of the time in: quick away from Earth,
// slowing as Earth's pull holds it back (and the other way round coming home)
const P = 1.45;
export const distAt = (mn, f) => (mn.k === "surface" ? f : mn.from.b === "earth" ? 1 - (1 - f) ** P : f ** P);
const timeAt = (mn, s) => (mn.k === "surface" ? s : mn.from.b === "earth" ? 1 - (1 - s) ** (1 / P) : s ** (1 / P));

// The moments of the trip, in order: { at, done, icon, text }
export function moonMoments(mn, sentAt, deliverAt, t) {
  const T = deliverAt - sentAt, at = (f) => sentAt + Math.max(0, Math.min(1, f)) * T, out = [];
  const add = (f, icon, text) => out.push({ at: at(f), icon, text });
  const where = (e) => (e?.place ? e.place.replace(/, the Moon$/, "") : e?.b === "moon" ? "the Moon" : "Earth");
  if (mn.k === "surface") {
    add(0, "up", `Bounded off from ${where(mn.from)}`);
    const pts = arc(mn.from, mn.to, 48), seen = new Set([where(mn.from), where(mn.to)]);
    let side = farSide(mn.from.lon);
    for (let i = 1; i < pts.length - 1; i++) {
      const [la, lo] = pts[i], f = i / (pts.length - 1);
      if (farSide(lo) !== side) { side = farSide(lo); add(f, side ? "moon" : "globe", side ? "Over the horizon: Earth sets behind it" : "Earthrise: Earth comes up over the horizon"); }
      for (const s of SITES) if (!seen.has(s[0]) && lunarKm(la, lo, s[1], s[2]) < 90) { seen.add(s[0]); add(f, "pin", `Bounding past ${s[0]}`); }
    }
    add(1, "check", `Touchdown at ${where(mn.to)}`);
  } else if (mn.from.b === "earth") {
    const d = mn.dist || MEAN_KM;
    add(0, "up", `Lifted off from ${where(mn.from)}`);
    add(Math.min(0.02, (10 * MIN) / T), "globe", "Left Earth’s atmosphere");
    add(timeAt(mn, 36000 / d), "dot", "Past the highest satellites");
    add(timeAt(mn, 0.5), "dist", "Halfway to the Moon");
    add(timeAt(mn, 1 - 66000 / d), "moon", "Into the Moon’s pull");
    if (farSide(mn.to.lon)) add(timeAt(mn, 0.988), "moon", "Behind the Moon: out of touch with Earth");
    else add(timeAt(mn, 0.992), "moon", "In orbit around the Moon");
    add(1, "check", `Touchdown at ${where(mn.to)}`);
  } else {
    const d = mn.dist || MEAN_KM;
    add(0, "up", `Lifted off from ${where(mn.from)}`);
    if (farSide(mn.from.lon)) add(timeAt(mn, 0.012), "moon", "Out from behind the Moon: Earth in sight");
    add(timeAt(mn, 66000 / d), "moon", "Out of the Moon’s pull");
    add(timeAt(mn, 0.5), "dist", "Halfway home");
    add(timeAt(mn, 1 - 36000 / d), "dot", "Past the highest satellites");
    add(Math.max(0.98, 1 - (15 * MIN) / T), "fire", "Re-entry: a fireball over Earth");
    add(1, "check", mn.to.place ? `Touchdown in ${where(mn.to)}` : "Touchdown on Earth");
  }
  return out.sort((a, b) => a.at - b.at).map((x) => ({ ...x, done: x.at <= t }));
}
// Where it is now, in words (in miles, like the rest of the app): "88,400 mi from Earth · 2,400 mph"
const MI = 0.621371, mi = (km) => Math.round(km * MI).toLocaleString("en-GB");
export function moonNow(mn, sentAt, deliverAt, t) {
  const f = Math.max(0, Math.min(1, (t - sentAt) / (deliverAt - sentAt))), T = (deliverAt - sentAt) / HOUR;
  if (mn.k === "surface") {
    const km = lunarKm(mn.from.lat, mn.from.lon, mn.to.lat, mn.to.lon);
    return { f, s: f, line: `${mi(km * (1 - f))} mi to go · ${mi(km / T)} mph` };
  }
  const d = (mn.dist || MEAN_KM) - EARTH_R - MOON_R, s = distAt(mn, f), e = 0.002;
  const v = (Math.abs(distAt(mn, Math.min(1, f + e)) - distAt(mn, Math.max(0, f - e))) / (Math.min(1, f + e) - Math.max(0, f - e))) * d / T;
  const fromEarth = mn.from.b === "earth" ? s * d : (1 - s) * d;
  return { f, s, line: `${mi(fromEarth)} mi from Earth · ${mi(v)} mph` };
}

// points along the great circle between two spots on the Moon: [lat, lon]
function arc(a, b, n) {
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

/* ---- drawing ---- */
// the dark seas (maria) and a few craters, as [lat, lon, radius°]: enough to know it at a glance
const MARIA = [[32.8, -15.6, 11], [28, 17.5, 7], [8.5, 31.4, 8], [17, 59.1, 5], [-7.8, 51.3, 6.5], [-15.2, 35.5, 4], [-21.3, -16.6, 7], [18.4, -57.4, 12], [2, -45, 10],
  [32, -52, 8], [-5, -36, 8], [56, -14, 4], [57, 8, 4], [56, 28, 3], [-24.4, -38.6, 4], [13.3, 3.6, 3], [-10, -23, 4], [7.5, -30.9, 4], [20, 2, 3], [-1, 85, 3], [13, 87, 2.5],
  [27.3, 147.9, 3], [-33.7, 163.5, 2], [-19.4, -92.8, 3.5], [-36, -151, 2.4], [-20.4, 129.1, 1.5]];
const CRATERS = [[-43.31, -11.36, 2.8, 1], [9.62, -20.08, 2.9, 1], [8.1, -38, 1.0, 1], [23.7, -47.4, 1.2, 1], [51.6, -9.4, 3.1, 0], [-58.4, -14.4, 6.3, 0], [-11.4, -1.1, 2.6, 0],
  [-9.3, -1.9, 1.9, 0], [-4.0, -157.4, 7.4, 0], [2.6, -129.2, 8.2, 0], [-36.1, -151.8, 8, 0], [-44.4, 176.2, 5.6, 0], [-5.9, 179.4, 2.7, 0], [26.2, -33.5, 1.6, 0], [-29.8, 77.5, 3.0, 0]];
// a few hundred small craters, the same every time
const SMALL = (() => { let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647); return Array.from({ length: 260 }, () => [Math.asin(2 * r() - 1) / rad, r() * 360 - 180, 0.3 + r() ** 3 * 2.2]); })();
// orthographic projection around (lat0, lon0) onto a disc of radius R at (cx, cy): [x, y, visible]
function ortho(lat0, lon0, cx, cy, R) {
  const s0 = Math.sin(lat0 * rad), c0 = Math.cos(lat0 * rad);
  return (la, lo) => {
    const p = la * rad, l = (lo - lon0) * rad, cp = Math.cos(p);
    const x = cp * Math.sin(l), y = c0 * Math.sin(p) - s0 * cp * Math.cos(l), z = s0 * Math.sin(p) + c0 * cp * Math.cos(l);
    return [cx + R * x, cy - R * y, z];
  };
}
// a circle on the sphere (centre lat/lon, radius in degrees), as a path on the disc
function spot(ctx, pr, la, lo, r) {
  ctx.beginPath(); let any = false;
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * 2 * Math.PI, pla = la + r * Math.sin(a), plo = lo + (r * Math.cos(a)) / Math.max(0.15, Math.cos(la * rad));
    const [x, y, z] = pr(Math.max(-90, Math.min(90, pla)), plo); if (z < -0.05) continue;
    if (!any) { ctx.moveTo(x, y); any = true; } else ctx.lineTo(x, y);
  }
  if (any) ctx.closePath();
  return any;
}
function moonDisc(ctx, cx, cy, R, lat0, lon0, { glow = true } = {}) {
  const pr = ortho(lat0, lon0, cx, cy, R);
  ctx.save();
  if (glow) { ctx.shadowColor = "rgba(220,225,240,.35)"; ctx.shadowBlur = R * 0.25; }
  const g = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.35, R * 0.1, cx, cy, R);
  g.addColorStop(0, "#e9e8e2"); g.addColorStop(0.7, "#c4c3bd"); g.addColorStop(1, "#8e8d88");
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.fill();
  ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.clip();
  ctx.fillStyle = "rgba(70,72,80,.4)"; ctx.shadowColor = "rgba(70,72,80,.55)"; ctx.shadowBlur = R * 0.05;
  for (const [la, lo, r] of MARIA) if (spot(ctx, pr, la, lo, r)) ctx.fill();
  ctx.shadowBlur = 0;
  for (const [la, lo, r] of SMALL) if (r * R > 40 && spot(ctx, pr, la, lo, r)) { ctx.strokeStyle = "rgba(60,60,64,.18)"; ctx.lineWidth = Math.max(0.5, R / 220); ctx.stroke(); }
  for (const [la, lo, r, bright] of CRATERS) if (spot(ctx, pr, la, lo, r)) {
    ctx.strokeStyle = bright ? "rgba(255,255,255,.75)" : "rgba(50,50,56,.35)"; ctx.lineWidth = Math.max(0.8, R / 140); ctx.stroke();
    if (bright) { ctx.fillStyle = "rgba(255,255,255,.28)"; ctx.fill(); }
  }
  // Tycho's rays
  const [tx, ty, tz] = pr(-43.31, -11.36);
  if (tz > 0) { ctx.strokeStyle = "rgba(255,255,255,.13)"; ctx.lineWidth = Math.max(1, R / 90); for (let i = 0; i < 12; i++) { const a = i * 0.55 + 0.3; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + Math.cos(a) * R * 0.8, ty + Math.sin(a) * R * 0.8); ctx.stroke(); } }
  // light from the upper left
  const sh = ctx.createRadialGradient(cx - R * 0.4, cy - R * 0.45, R * 0.2, cx, cy, R * 1.05);
  sh.addColorStop(0, "rgba(255,255,255,0)"); sh.addColorStop(1, "rgba(0,0,10,.38)");
  ctx.fillStyle = sh; ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  ctx.restore();
  return pr;
}
function earthDisc(ctx, cx, cy, R, lon0, lat0 = 20) {
  const pr = ortho(lat0, lon0, cx, cy, R);
  ctx.save();
  ctx.shadowColor = "rgba(80,160,255,.55)"; ctx.shadowBlur = R * 0.5;
  const g = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.35, R * 0.1, cx, cy, R);
  g.addColorStop(0, "#5aa8ff"); g.addColorStop(1, "#163e86");
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.fill();
  ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.clip();
  ctx.fillStyle = "#4f9a5e";
  for (const ring of LAND.split(";")) {
    const n = ring.split(",").map(Number); ctx.beginPath(); let any = false;
    for (let i = 0; i < n.length; i += 2) {
      let [x, y, z] = pr(n[i + 1] / 2, n[i] / 2);
      if (z < 0) { const dx = x - cx, dy = y - cy, h = Math.hypot(dx, dy) || 1; x = cx + (dx / h) * R; y = cy + (dy / h) * R; }   // round the back: onto the edge
      if (!any) { ctx.moveTo(x, y); any = true; } else ctx.lineTo(x, y);
    }
    ctx.fill();
  }
  const sh = ctx.createRadialGradient(cx - R * 0.4, cy - R * 0.45, R * 0.2, cx, cy, R * 1.05);
  sh.addColorStop(0, "rgba(255,255,255,.12)"); sh.addColorStop(1, "rgba(0,0,20,.45)");
  ctx.fillStyle = sh; ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  ctx.restore();
  return pr;
}
function stars(ctx, w, h, seed = 3) {
  let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  ctx.fillStyle = "#03050c"; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < (w * h) / 900; i++) { ctx.globalAlpha = 0.25 + r() * 0.75; ctx.fillStyle = "#fff"; const z = r() < 0.08 ? 1.6 : 0.9; ctx.fillRect(r() * w, r() * h, z, z); }
  ctx.globalAlpha = 1;
}
function fit(cv) {
  const dpr = Math.min(3, window.devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}
const pin = (ctx, x, y, col, big) => { ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 8; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, big ? 6 : 3.5, 0, 2 * Math.PI); ctx.fill(); ctx.restore(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, big ? 6 : 3.5, 0, 2 * Math.PI); ctx.stroke(); };

// The map to pick a spot on: one side of the Moon, its named sites, and your spot.
// Returns what's needed to turn a tap back into a spot (pickAt).
export function drawMoonPick(cv, { side = "near", mark = null, focus = null } = {}) {
  const { ctx, w, h } = fit(cv);
  stars(ctx, w, h, 11);
  const R = Math.min(w, h) * 0.44, cx = w / 2, cy = h / 2, lon0 = side === "far" ? 180 : 0;
  const pr = moonDisc(ctx, cx, cy, R, 0, lon0);
  ctx.font = "600 11px -apple-system, BlinkMacSystemFont, system-ui, sans-serif"; ctx.textAlign = "center";
  // every site a dot; names where they fit, the chosen one first, then the Apollo sites and craters
  const shown = SITES.map(([name, la, lo]) => { const [x, y, z] = pr(la, lo); return { name, x, y, z, on: focus === name }; }).filter((p) => p.z >= 0.08);
  for (const p of shown) { ctx.fillStyle = p.on ? "#ffd166" : "rgba(255,255,255,.9)"; ctx.beginPath(); ctx.arc(p.x, p.y, p.on ? 3.5 : 2.2, 0, 2 * Math.PI); ctx.fill(); }
  const boxes = [], rank = (p) => (p.on ? 0 : ABOUT[p.name] ? 1 : 2);
  for (const p of [...shown].sort((a, b) => rank(a) - rank(b))) {
    const tw = ctx.measureText(p.name).width, b = [p.x - tw / 2 - 3, p.y - 19, p.x + tw / 2 + 3, p.y - 4];
    if (!p.on && boxes.some((o) => b[0] < o[2] && o[0] < b[2] && b[1] < o[3] && o[1] < b[3])) continue;
    boxes.push(b);
    ctx.fillStyle = p.on ? "#ffd166" : "rgba(255,255,255,.85)"; ctx.shadowColor = "#000"; ctx.shadowBlur = 4; ctx.fillText(p.name, p.x, p.y - 7); ctx.shadowBlur = 0;
  }
  if (mark) { const [x, y, z] = pr(mark.lat, mark.lon); if (z > 0) pin(ctx, x, y, "#ff9f0a", true); }
  return { cx, cy, R, lon0 };
}
// a tap on that map, as a spot on the Moon (null: off its edge)
export function pickAt(view, x, y) {
  const dx = (x - view.cx) / view.R, dy = -(y - view.cy) / view.R, rr = dx * dx + dy * dy;
  if (rr > 1) return null;
  const z = Math.sqrt(1 - rr), lat = Math.asin(dy) / rad;
  let lon = Math.atan2(dx, z) / rad + view.lon0; if (lon > 180) lon -= 360;
  return { lat: Math.round(lat * 10) / 10, lon: Math.round(lon * 10) / 10 };
}

// A lunar pigeon on its way, at time t: Earth and Moon (not to scale) with its path, or
// across the Moon's surface. f: how far through the trip (0 to 1).
// the app's pigeon (index.html's #bird-path: it faces left in its 24 × 24 box)
const BIRD = typeof Path2D === "function" ? new Path2D("M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z") : null;
export function drawTrip(cv, mn, f, t, { lost = false } = {}) {
  const { ctx, w, h } = fit(cv);
  stars(ctx, w, h, 5);
  // the pigeon, heading a (radians), upright whichever way it goes
  const bird = (x, y, a) => {
    if (!BIRD) return;
    const left = Math.cos(a) < 0;
    ctx.save(); ctx.translate(x, y); ctx.rotate(left ? a + Math.PI : a); ctx.scale(left ? 1.15 : -1.15, 1.15); ctx.translate(-12, -11);
    ctx.shadowColor = lost ? "#ff453a" : "#ffd166"; ctx.shadowBlur = 14; ctx.fillStyle = lost ? "#ff453a" : "#fff"; ctx.fill(BIRD); ctx.restore();
  };
  if (mn.k === "surface") {
    const pts = arc(mn.from, mn.to, 64), mid = pts[32], R = Math.min(w, h) * 0.46;
    const pr = moonDisc(ctx, w / 2, h / 2, R, mid[0], mid[1], { glow: false });
    const xy = pts.map(([la, lo]) => pr(la, lo));
    ctx.setLineDash([4, 5]); ctx.strokeStyle = "rgba(255,209,102,.55)"; ctx.lineWidth = 2; ctx.beginPath();
    xy.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.setLineDash([]);
    // bounds: long low hops along the way flown (8 for the whole way), and the one it's on
    const HOPS = 8, at = (q) => { const z = Math.min(63.999, q * 64), i = Math.floor(z), u = z - i; return [xy[i][0] + (xy[i + 1][0] - xy[i][0]) * u, xy[i][1] + (xy[i + 1][1] - xy[i][1]) * u]; };
    const hopH = (a, b) => Math.min(26, Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.45);
    ctx.strokeStyle = "rgba(255,209,102,.9)"; ctx.lineWidth = 2; ctx.beginPath();
    const done = f * HOPS;
    for (let j = 0; j < Math.ceil(done); j++) {
      const a = at(j / HOPS), b = at(Math.min(done, j + 1) / HOPS), full = at((j + 1) / HOPS), H = hopH(a, full), part = Math.min(1, done - j);
      ctx.moveTo(a[0], a[1]);
      for (let k = 1; k <= 12; k++) { const u = (k / 12) * part, p = at((j + u) / HOPS); ctx.lineTo(p[0], p[1] - Math.sin(u * Math.PI) * H); }
    }
    ctx.stroke();
    pin(ctx, xy[0][0], xy[0][1], "#8e8e93"); pin(ctx, xy.at(-1)[0], xy.at(-1)[1], "#30d158");
    const j = Math.min(HOPS - 1, Math.floor(done)), u = done - j, a = at(j / HOPS), full = at((j + 1) / HOPS), H = hopH(a, full), p = at(f), q = at(Math.min(1, f + 0.004));
    bird(p[0], p[1] - Math.sin(u * Math.PI) * H, Math.atan2(q[1] - p[1], q[0] - p[0]));
    return;
  }
  // Earth on the left, the Moon on the right; the way between curves up and, to the far side, round behind it
  const out = mn.from.b === "earth", ex = w * 0.17, ey = h * 0.58, er = Math.min(w * 0.11, h * 0.2), mx = w * 0.82, my = h * 0.42, mr = er * 0.42;
  const earthEnd = out ? mn.from : mn.to, moonEnd = out ? mn.to : mn.from;
  earthDisc(ctx, ex, ey, er, earthEnd?.lon ?? 0, Math.max(-50, Math.min(50, earthEnd?.lat ?? 20)));
  // the Moon side on: its near side faces Earth (the left), its far side away
  moonDisc(ctx, mx, my, mr, 0, 90);
  const far = farSide(moonEnd.lon);
  // the way, Earth to Moon: out and up, over the top of the Moon, and down on its own side
  const land = far ? [mx + mr * 0.98, my + mr * 0.2] : [mx - mr * 0.96, my + mr * 0.25];
  const lift = [ex + er * 0.7, ey - er * 0.72];
  const c1 = [w * 0.38, h * 0.02], c2 = far ? [mx + mr * 3.2, my - mr * 3.4] : [mx - mr * 2.6, my - mr * 2.4];
  const curve = (s) => { const a = 1 - s; return [a ** 3 * lift[0] + 3 * a * a * s * c1[0] + 3 * a * s * s * c2[0] + s ** 3 * land[0], a ** 3 * lift[1] + 3 * a * a * s * c1[1] + 3 * a * s * s * c2[1] + s ** 3 * land[1]]; };
  const N = 120, path = Array.from({ length: N + 1 }, (_, i) => curve(i / N));
  // by length, not by s (a Bézier's s runs unevenly)
  const len = [0]; for (let i = 1; i <= N; i++) len.push(len[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  const at = (q) => { const L = q * len[N]; let i = 1; while (i < N && len[i] < L) i++; const u = (L - len[i - 1]) / (len[i] - len[i - 1] || 1); return [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * u, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * u, Math.atan2(path[i][1] - path[i - 1][1], path[i][0] - path[i - 1][0])]; };
  const s = distAt(mn, f), q = out ? s : 1 - s;           // (coming home: the same way, backwards)
  ctx.setLineDash([3, 6]); ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 1.5; ctx.beginPath(); path.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.setLineDash([]);
  // the way flown, glowing
  ctx.strokeStyle = "rgba(255,209,102,.9)"; ctx.lineWidth = 2.2; ctx.beginPath();
  const steps = 60; for (let i = 0; i <= steps; i++) { const qq = out ? (q * i) / steps : 1 - ((1 - q) * i) / steps, [x, y] = at(qq); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
  // behind the Moon: out of touch (it's hidden while it is)
  const [bx, by, ba] = at(q), hidden = far && Math.hypot(bx - mx, by - my) < mr * 1.02 && bx > mx;
  if (!hidden) bird(bx, by, out ? ba : ba + Math.PI);
  // re-entry: a streak of fire as it comes in to Earth
  if (!out && f > 0.97 && f < 1) { ctx.save(); ctx.shadowColor = "#ff6a00"; ctx.shadowBlur = 16; ctx.strokeStyle = "rgba(255,120,0,.9)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + 14, by - 10); ctx.stroke(); ctx.restore(); }
  ctx.font = "500 10px -apple-system, BlinkMacSystemFont, system-ui, sans-serif"; ctx.fillStyle = "rgba(255,255,255,.45)"; ctx.textAlign = "right";
  ctx.fillText("Not to scale", w - 12, 18);
}
