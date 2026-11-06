// Chat — the part loaded later (app.js's later()): every sheet, and what only sheets use. The map and the globe, with
// the weather and the wind on them; a pigeon's flight card, its trip to the Moon and Look Up; the Flight Log, the
// passport and the pictures to share; your pigeons and feathers; friends', groups' and settings' sheets; Send to a
// Friend and the cards' sheets; the photo viewer; and the taps, fields and forms only those have (sheetClick,
// sheetInput, sheetSubmit). app.js loads it the first time one's wanted, and at the first quiet moment once Chat is up,
// so the first screen (the welcome, the lock, the chat list, a chat and sending) never waits for it.
// It imports nothing of app.js (no import going round in a circle, and app.js's fingerprint can name this file's):
// load(APP) is given what it uses of app.js (laterKit there), its functions and constants as they are, and the few of
// its `let`s that change, read (and set) as APP.x; and it hands back what app.js calls of it.
import { E2E, b64url, fromB64url, uuid } from "./crypto.js";
import { LAND } from "./land.js";
import { PLACES } from "./places.js";
import { COUNTRIES, RANGES } from "./countries.js";
import { qrSvg } from "./qr.js";
import { buildPayload, padPayload, canForward, landWords, nextLocal, whenLine, pigeonsFor, spendWords, sentToast, askWords, planWords, answerWords, cardWords, normCard, normPlan, laterPlan, MARGIN_MS, ASK_KINDS, PLAN_SPORTS, normWhen, whenWords, snapCell } from "./cards.js";
import { rankFriends, seenFrom, rainAsk } from "./rank.js";
import { sheetCardHtml, stripHtml } from "./cardview.js";
import { waitingDigest } from "./digest.js";
import { ABOUT, BODIES, EARTH_R, MOON_R, surfaceKm, moonKm, marsKm, lightMs, moonPhase, earthPhase, nearFar, spaceFlight, spaceMoments, spaceNow, drawPick, pickAt, drawTrip, farSide, siteName, lunarDay, marsClock, bodyOf, lookTo, moonLook, marsLook, sunLook, orbitWhere, ORBIT, distAt } from "./moon.js";

export function load(APP) {
  // (everything below, to the return at the end, is load's own: app.js's code as it was there, at the left margin)
  const {
    $, $compose, $layer, $ta, $tabbar, $view, BIRD, CHEER_EACH, DAY, DOW, DOW_LONG, ENGINE, HOUR, I, KIND, KINDS,
    LOCK_AFTER, MIN, MON, MY_TZ, NEW_HOME, NO_SIGNAL, OPENED_KEY, PAID, ROUTES, S, SHEET_IN_MS, SHEET_ON_MS,
    SHEET_SLIDE_MS, SKINS, SPACE_KINDS, STILL, STREAK_MIN, THEMES, WAIT_KEY, WEAR, WX, accountPage, airTime, api,
    appOrigin, asSent, atShort, atTime, avatar, backStep, base, birdFor, birdReady, busyBtn, cardLinks, cell, chatKm,
    chatOf, chatRp, cheerable, chevSm, cityOptions, clockIn, clockSay, closePop, closeTop, composeState, cssVar,
    defaultNext, digestMsg, doAct, dropRef, dtf, durPad, durShort, endFor, esc, etaMs, ferr, first, fitOffer, fitTa,
    flightMs, flockCount, fmtDate, fmtDur, fmtLand, fmtMiles, fmtSeen, fmtShort, fmtTime, focusTitle, freeze, friend,
    gavatar, go, group, haptic, hapticsOn, haversineKm, hubParent, isIOS, isOnline, isVerified, keepAdd, keepGlides,
    keepIn, keepSay, keepTheme, keyId, keyOfCard, kindOf, kindPlans, kindsFor, landHint, linkActs, loadChat,
    lockPrefs, look, member, memberKm, moonChat, moonOf, myLink, mySpeed, newsRow, noRef, noShipOn, noteRp, now,
    nowFor, nowHad, nowVal, ofRp, onceAgain, onceMissed, onceP, openAccount, openActions, openFlightLog, openMenu,
    opened, orLand, others, overWhere, pad2, pairFor, partsOf, passkeysSupported, personById, pg, pgm, picGone,
    pigeonsOn, plannedMs, pmDay, pmName, pmSeal, pushState, render, renderCompose, replyUnsure, root, routePlanFor,
    routeStyle, sameDay, savePins, saveTheme, schedFor, schedKind, setAttach, setAutoLocation, setEmailNotify,
    setLockPrefs, setNotify, shapesLoad, shareRef, shareable, showErr, skyRoutes, spaceMs, standalone, stopLocWatch,
    streakLeft, streakOf, streakRisk, switchKey, switchStates, sync, syncInert, theme, themeFade, timeBody, toast,
    toggleCell, trustNewKey, trustedPub, vanishSay, walletData, wasVerified, wayOf, wearOn, whereOnEarth, whoCls,
    whoDots, whoOrder, whoState, withFresh, worldOf, wxAdvice, wxSay, zoomed
  } = APP;
const LIVE_LEFT = HOUR;                // pigeons with longer than this to go have the sky ahead looked at again (functions/_live.js)
const fmtMph = (kmh) => Math.round(kmh * 0.621371).toLocaleString("en-GB") + " mph";
const fmtWind = (w) => (w == null ? "" : Math.abs(w) < 3 ? "Calm skies" : `${w > 0 ? "Tailwind" : "Headwind"} ${Math.round(Math.abs(w) * 0.621371)} mph`);

/* ---------------- map ---------------- */
// Web Mercator, in degree-sized units so 1 unit of x is 1° of longitude.
const R2D = 180 / Math.PI, MERC_MAX = 85;
const mercY = (lat) => R2D * Math.log(Math.tan(Math.PI / 4 + Math.max(-MERC_MAX, Math.min(MERC_MAX, lat)) / (2 * R2D)));
// Each ring or line: Float32Array of lon,mercY pairs, plus its bounding box.
// Longitudes are unwrapped so shapes that cross the date line stay in one
// piece; a ring that circles the globe (Antarctica) is closed via the pole.
function shapes(list, closed) {
  return list.map((src) => {
    const a = src.slice();
    for (let i = 2; i < a.length; i += 2) { while (a[i] - a[i - 2] > 180) a[i] -= 360; while (a[i] - a[i - 2] < -180) a[i] += 360; }
    if (closed && a.length > 4 && Math.abs(a[a.length - 2] - a[0]) > 180) a.push(a[a.length - 2], a[1] < 0 ? -90 : 90, a[0], a[1] < 0 ? -90 : 90);
    // unwrapping from a start past the date line can leave a whole continent a
    // turn west (Eurasia from Chukotka puts Europe near -360°): bring it back
    let west = Infinity; for (let i = 0; i < a.length; i += 2) if (a[i] < west) west = a[i];
    if (west < -180) { const turn = Math.ceil((-180 - west) / 360) * 360; for (let i = 0; i < a.length; i += 2) a[i] += turn; }
    const f = new Float32Array(a.length); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < a.length; i += 2) { const x = a[i], y = mercY(a[i + 1]); f[i] = x; f[i + 1] = y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return { f, box: [x0, y0, x1, y1] };
  });
}
// Natural Earth data (public domain), self-hosted so no map company learns
// where anyone's pigeons fly. 110m is built in; 50m and 10m load when needed.
const WORLD = {};
function world(res) {
  if (res === "110m") {
    if (!WORLD[res]) WORLD[res] = { land: shapes(LAND.split(";").map((r) => r.split(",").map((n) => n / 2)), true), borders: [] };
    return WORLD[res];
  }
  if (!WORLD[res]) {
    WORLD[res] = "loading";
    fetch(`/pigeon/map/world-${res}.json`).then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then((d) => {
      const dec = (str) => !str ? [] : str.split(";").map((r) => { const a = r.split(",").map(Number); for (let i = 2; i < a.length; i++) a[i] += a[i - 2]; return a.map((n) => n / d.q); });
      WORLD[res] = { land: shapes(dec(d.land), true), borders: shapes(dec(d.borders)) };
      redrawMap();
    }).catch(() => { WORLD[res] = "failed"; });
  }
  return typeof WORLD[res] === "object" ? WORLD[res] : null;
}
function gcPoint(a, b, f) {
  const r = Math.PI / 180;
  const v = (p) => [Math.cos(p.lat * r) * Math.cos(p.lon * r), Math.cos(p.lat * r) * Math.sin(p.lon * r), Math.sin(p.lat * r)];
  const A = v(a), B = v(b);
  const w = Math.acos(Math.min(1, Math.max(-1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2])));
  if (w < 1e-9) return { lat: a.lat, lon: a.lon };
  const s1 = Math.sin((1 - f) * w) / Math.sin(w), s2 = Math.sin(f * w) / Math.sin(w);
  const x = s1 * A[0] + s2 * B[0], y = s1 * A[1] + s2 * B[1], z = s1 * A[2] + s2 * B[2];
  return { lat: Math.atan2(z, Math.hypot(x, y)) / r, lon: Math.atan2(y, x) / r };
}
let mapInk = null;                          // a share card's map: its own light or dark, whatever the app's theme
const MAP_KMAX = 400;                       // pixels per degree at full zoom
// The route, as points along the great circle (longitudes unwrapped so it never jumps the date line).
// The route as points along great circles, each with the time the pigeon is
// there. A pigeon that changed course (its friend moved) flies several legs.
// What its planned way is doing about now: going around storms, riding the wind,
// resting on an island, through a pass, past a landmark (see functions/_route.js)
// resting on an island ("i"), or sheltering from storms ("h"), right now: [where, until when, which], or null
// (and waiting for a ship, "b"; or at sea on it, "sail": [the sea, when it's ashore, "sail", the port])
function restingOn(m, t = now()) {
  const legs = (m.legs || []).filter((l) => l[3] && l[3] !== "c" && l[3] !== "f");
  if (m.lost || t >= m.deliverAt) return null;
  const i = legs.findIndex((l, k) => (l[3] === "i" || l[3] === "h" || l[3] === "t" || l[3] === "b") && legs[k + 1]?.[3] === l[3] && legs[k + 1][0] === l[0] && legs[k + 1][1] === l[1] && t >= l[2] && t < legs[k + 1][2]);
  if (i >= 0) return [legs[i][4] || (legs[i][3] === "h" ? "" : legs[i][3] === "b" ? "the port" : "an island"), legs[i + 1][2], legs[i][3], SEVERE_WORD[legs[i][5]?.k] || "storms"];
  const sh = shipOf(legs);
  if (sh && t >= sh.off && t < sh.ashore) return [sh.sea, sh.ashore, "sail", sh.to];
  // (resting with a friend on the way: a stopover)
  return m.via && m.viaAt <= t && t < m.viaOff ? [m.viaPlace || "", m.viaOff, "v"] : null;
}
// How the map draws it: flying ("up", "cruise", "down"), at sea on a ship, resting (wings folded: an island, a
// shelter, a breather, the port, a stopover), landed or lost
function birdPhase(r) {
  if (r.lost) return "lost";
  const rest = restingOn(r)?.[2];
  return rest === "sail" ? "sail" : rest ? "rest" : flightAt(r).phase;
}
// When a pigeon isn't flying (resting on an island, sheltering, a breather, waiting for and sailing on a ship, a
// stopover with a friend): [from, to] spans. Its speed, and how far along it is, count only the flying.
function stillSpans(m) {
  const legs = m.legs || [], out = [];
  for (let k = 0; k + 1 < legs.length; k++) {
    const a = legs[k], b = legs[k + 1];
    if (a[0] === b[0] && a[1] === b[1] && b[2] > a[2] && a[3] === b[3] && ("ihtb".includes(a[3] || "-") || (!a[3] && m.via))) out.push([a[2], b[2]]);
  }
  const sh = shipOf(legs); if (sh) out.push([sh.off, sh.ashore]);
  return out.sort((x, y) => x[0] - y[0]).reduce((acc, x) => { const l = acc.at(-1); if (l && x[0] <= l[1]) l[1] = Math.max(l[1], x[1]); else acc.push([...x]); return acc; }, []);
}
// how long it has been still, up to t (all of it, without t)
const stillMs = (m, t = Infinity) => stillSpans(m).reduce((a, [x, y]) => a + Math.max(0, Math.min(y, t) - Math.max(x, m.sentAt)), 0);
// how far along it is by its flying (it doesn't creep on while it sits out a storm), 0 to 1
const flownFrac = (m, t = now()) => Math.min(1, Math.max(0, (t - m.sentAt - stillMs(m, t)) / Math.max(1, m.deliverAt - m.sentAt - stillMs(m))));
// its average speed in the air, km/h (a crossing by ship, or a night sheltering, isn't flying slowly)
const avgKmh = (m) => m.km / (Math.max(1, m.deliverAt - m.sentAt - stillMs(m)) / HOUR);
// How far a flight goes, flown and by ship: "8 mi · 3,560 mi by ship"
function milesOf(km, legs) {
  const sea = shipKm(legs);
  return sea > 50 ? `${fmtMiles(km)} · ${fmtMiles(sea)} by ship` : fmtMiles(km);
}
// how far it goes by ship (km), 0 if it doesn't
function shipKm(legs) {
  const b = (legs || []).filter((l) => l[3] === "b");
  let sea = 0; for (let i = 1; i < b.length - 1; i++) sea += haversineKm(b[i][0], b[i][1], b[i + 1][0], b[i + 1][1]);
  return sea;
}
// A voyage by ship (a standard pigeon across an ocean): where it boards, when the ship
// sails, the sea it crosses, where and when it comes ashore; null if it doesn't
function shipOf(legs) {
  const b = (legs || []).filter((l) => l[3] === "b"); if (b.length < 3) return null;
  // (the sea it crosses: the middle of its longest leg, not the strait it sails out by)
  let mid = [b[1][0], b[1][1]], far = -1, last = b.at(-1);
  for (let i = 1; i < b.length - 1; i++) { const d = haversineKm(b[i][0], b[i][1], b[i + 1][0], b[i + 1][1]); if (d > far) { far = d; const w = b[i + 1][1] - b[i][1] > 180 ? -360 : b[i + 1][1] - b[i][1] < -180 ? 360 : 0, lo = (b[i][1] + b[i + 1][1] + w) / 2; mid = [(b[i][0] + b[i + 1][0]) / 2, lo > 180 ? lo - 360 : lo < -180 ? lo + 360 : lo]; } }
  return { from: b[0][4] || "port", board: b[0][2], off: b[1][2], to: last[4] || "port", ashore: last[2], sea: overWhere(mid[1], mid[0]) };
}
// When a ship gets in, as you'd say it: "at 14:00", "tomorrow", "on Thursday", "on 23 Oct"
function onDay(ts) {
  if (sameDay(ts, now())) return `at ${fmtTime(ts)}`;
  if (sameDay(ts, now() + DAY)) return "tomorrow";
  const d = new Date(ts); return ts - now() < 6 * DAY ? `on ${DOW_LONG[d.getDay()]}` : `on ${d.getDate()} ${MON[d.getMonth()]}`;
}
// A voyage on the map: the lane it sails (teal, solid where it has sailed, dotted ahead) and
// its two ports. `stroke(P, i0, i1, up)` draws points i0 to i1 of a track (the globe hides the back).
function drawVoyages(g, tracks, col, lw, stroke) {
  const ports = [];
  for (const { r, rp, P, up } of tracks) {
    const sh = !r.here && !r.lost && shipOf(r.legs); if (!sh) continue;
    const a = rp.findIndex((p) => p.t >= sh.off - 1), b = rp.findIndex((p) => p.t >= sh.ashore - 1); if (a < 0 || b <= a) continue;
    const ft = flightAt(r).t, i = rp.findIndex((p) => p.t >= ft), cut = i < 0 ? b : Math.min(b, Math.max(a, i));
    g.save(); g.lineCap = "round"; g.lineJoin = "round";
    g.globalAlpha = 0.9; g.strokeStyle = col("--cell"); g.lineWidth = lw + 3; stroke(P, a, b, up);
    g.globalAlpha = 1; g.strokeStyle = col("--teal");
    if (cut > a) { g.lineWidth = lw; stroke(P, a, cut, up); }
    if (cut < b) { g.lineWidth = lw - 0.5; g.setLineDash([0.5, 7]); stroke(P, cut, b, up); g.setLineDash([]); }
    g.restore();
    // (a port where it takes off or lands already has that end's dot and name)
    const end = (i) => [P[0], P.at(-1)].some((q) => Math.hypot(q[0] - P[i][0], q[1] - P[i][1]) < 12);
    ports.push({ at: P[a], vis: (!up || up[a]) && !end(a), name: sh.from }, { at: P[b], vis: (!up || up[b]) && !end(b), name: sh.to });
  }
  for (const p of ports) {
    if (!p.vis) continue;
    const [x, y] = p.at;
    g.fillStyle = col("--cell"); g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill();
    g.strokeStyle = col("--teal"); g.lineWidth = 2.5; g.beginPath(); g.arc(x, y, 4.5, 0, 7); g.stroke();
  }
  return ports;
}
// its ports' names, where there's room (after the ends have theirs)
function portLabels(g, ports, free, taken, text, col) {
  g.save(); g.font = "600 12px -apple-system, system-ui, sans-serif"; g.textBaseline = "middle"; g.textAlign = "left";
  for (const p of ports) {
    if (!p.vis || !p.name) continue;
    const [x, y] = p.at, s = `${p.name}`, w = g.measureText(s).width;
    taken.push([x - 8, y - 8, x + 8, y + 8]);
    for (const [lx, ly] of [[x + 11, y], [x - 11 - w, y], [x - w / 2, y - 20], [x - w / 2, y + 20]]) {
      const box = [lx - 3, ly - 9, lx + w + 3, ly + 9]; if (!free(box)) continue;
      taken.push(box); text(s, lx, ly, col("--teal-t")); break;
    }
  }
  g.restore();
}
// The way in a few words: "through the Simplon Pass · around storms over France"
// What a way went around, or sheltered from: storms, or hail, or icy weather (the
// planner and the live turns note it on the leg when it wasn't thunderstorms)
const SEVERE_WORD = { storms: "storms", hail: "hail", icing: "icy weather", ash: "volcanic ash", smoke: "wildfire smoke" };
// its icon: a volcano for ash, a fire for smoke, else a storm cloud
const severeIcon = (k) => (k === "ash" ? I.volcano : k === "smoke" ? I.fire : I.storm);
const severeKOf = (legs, tag = "s") => (legs || []).find((l) => l[3] === tag && l[5]?.k)?.[5]?.k || null;
const severeOf = (legs, tag = "s") => SEVERE_WORD[(legs || []).find((l) => l[3] === tag && l[5]?.k)?.[5]?.k] || "storms";
function wayWords(legs) {
  const said = [], sw = severeOf(legs);
  for (const l of legs || []) {
    const n = l[4], say = { s: `around ${sw}${n ? ` over ${n}` : ""}`, w: "riding the wind", i: `resting on ${n || "an island"}`, v: `past ${n || "a landmark"}`,
      o: `along the coast${n ? ` of ${n}` : ""}`, m: `over ${n || "the mountains"}`, b: n ? `by ship from ${n}` : "",
      p: `through ${!n ? "a pass" : /^a |^[A-Z][\w’']*['’]s /.test(n) ? n : `the ${n}`}` }[l[3]];
    if (say && !said.includes(say)) said.push(say);
  }
  return said.length ? said.slice(0, 3).join(" · ") : "the straight way";
}
function routeNote(m) {
  const legs = (m.legs || []).filter((l) => l[3] && l[3] !== "c" && l[3] !== "f"); if (!legs.length || m.lost) return null;
  const t = m.lost ? m.lostAt : now(), landed = t >= m.deliverAt;
  const rest = restingOn(m, t);
  if (rest) return rest[2] === "h" ? { icon: I.storm, text: `Sheltering${rest[0] ? ` ${rest[0]}` : ` from ${rest[3]}`} until about ${fmtTime(rest[1])}` }
    : rest[2] === "b" ? { icon: I.ship, text: `Waiting for a ship at ${rest[0]}: it sails ${sameDay(rest[1], now()) ? `at ${fmtTime(rest[1])}` : fmtShort(rest[1])}${shipOf(legs) ? `, in ${shipOf(legs).to} ${onDay(shipOf(legs).ashore)}` : ""}` }
    : rest[2] === "sail" ? { icon: I.ship, text: `At sea across ${rest[0]}: the ship gets in to ${rest[3]} ${onDay(rest[1])}` }
    : rest[2] === "t" ? { icon: I.bird, text: `Catching its breath ${rest[0] || "on the way"} until ${fmtTime(rest[1])}` }
    : { icon: I.bird, text: `Resting on ${rest[0]} until ${fmtTime(rest[1])}` };
  const next = legs.find((l) => l[2] > t), last = [...legs].reverse().find((l) => l[2] <= t), l = landed ? legs.at(-1) : next || last;
  const ahead = !landed && l === next, name = l[4], over = name ? ` over ${name}` : "";
  const turned = ahead && last?.[3] === "r";                     // it changed course for the weather on the way (live)
  const sw = turned ? SEVERE_WORD[last[5]?.k] || "storms" : severeOf(legs), hw = SEVERE_WORD[l[5]?.k] || "storms";
  const say = {
    s: [I.storm, turned ? `Rerouted around ${sw}${over}` : ahead ? `Going around ${sw}${over}` : `Went around ${sw}${over}`],
    w: [I.wind, turned ? "Rerouted to ride the wind" : ahead ? "Riding the wind: a longer way, but quicker" : "Rode the wind: a longer way, but quicker"],
    h: [I.storm, ahead ? `Sheltering from ${hw}${name ? ` ${name}` : ""} on the way` : `Sheltered from ${hw}${name ? ` ${name}` : ""}`],
    r: [name === "s" ? I.storm : I.wind, name === "s" ? `Rerouted to keep clear of ${hw}` : "Rerouted to ride the wind"],
    i: [I.bird, ahead ? `Resting on ${name || "an island"} on the way` : `Rested on ${name || "an island"}`],
    t: [I.bird, ahead ? `A breather ${name || "on the way"} coming up` : `Caught its breath ${name || "on the way"}`],
    p: [I.map, `${ahead ? "Through" : "Came through"} ${!name ? "the pass" : /^a |^[A-Z][\w’']*['’]s /.test(name) ? name : `the ${name}`}`],
    v: [I.loc, ahead ? `The scenic way, past ${name || "a landmark"}` : `Came the scenic way, past ${name || "a landmark"}`],
    o: [I.waves, ahead ? `Following the coast${name ? ` of ${name}` : ""}` : `Followed the coast${name ? ` of ${name}` : ""}`],
    m: [I.map, ahead ? `Flying over ${name || "the mountains"}` : `Flew over ${name || "the mountains"}`],
    b: [I.ship, (() => { const sh = shipOf(legs); return !sh ? (ahead ? "A voyage by ship ahead" : "Came by ship") : ahead ? `By ship from ${sh.from}: in ${sh.to} ${onDay(sh.ashore)}` : `Came by ship from ${sh.from} to ${sh.to}`; })()],
  }[l[3]];
  return say ? { icon: say[0], text: say[1] } : null;
}
function routePts(m) {
  const stops = [[m.route[0], m.route[1], m.sentAt], ...(m.legs || []), [m.route[2], m.route[3], m.deliverAt]];
  const pts = []; let prev = null;
  for (let i = 0; i < stops.length - 1; i++) {
    const [aLat, aLon, aT] = stops[i], [bLat, bLon, bT] = stops[i + 1], n = stops.length === 2 ? 96 : 48;
    for (let j = i ? 1 : 0; j <= n; j++) {
      const p = gcPoint({ lat: aLat, lon: aLon }, { lat: bLat, lon: bLon }, j / n);
      if (prev != null) { while (p.lon - prev > 180) p.lon -= 360; while (p.lon - prev < -180) p.lon += 360; }   // never jump the date line
      prev = p.lon; pts.push({ x: p.lon, y: mercY(p.lat), t: aT + (bT - aT) * j / n });
    }
    if (i < stops.length - 2) pts[pts.length - 1].turn = !stops[i + 1][3];     // (only where it turned for someone moving: planned bends, rests and cheers aren't turns)
  }
  return pts;
}
// Pigeons ease in and out: they launch hard and settle into their cruise, then
// glide down to land. Each ramp lasts up to a minute (15% of a very short
// flight); the pigeon cruises a touch faster in between, so it still lands
// exactly on time. Returns how far along it is (0-1), its speed now, the phase,
// and the "flight clock" time for that distance (route points are timed at an
// even pace).
const RAMP_MS = MIN;
function flightAt(m, t = now()) {
  const dur = Math.max(1, m.deliverAt - m.sentAt), u = Math.min(1, Math.max(0, (t - m.sentAt) / dur));
  const r = Math.min(0.15, RAMP_MS / dur), top = 1 / (1 - 2 * r * (1 - 2 / Math.PI));
  const q = Math.PI / (2 * r);                                   // pace in a ramp: sin(q·x), 0 → 1
  const ramp = (x) => (top / q) * (1 - Math.cos(q * x));         // distance covered x into a ramp
  const frac = u < r ? ramp(u) : u > 1 - r ? 1 - ramp(1 - u) : ramp(r) + top * (u - r);
  const pace = u <= 0 || u >= 1 ? 0 : u < r ? Math.sin(q * u) : u > 1 - r ? Math.sin(q * (1 - u)) : 1;
  return { frac, kmh: (m.km / (Math.max(1, dur - stillMs(m)) / HOUR)) * top * pace, phase: u >= 1 ? "landed" : u < r ? "up" : u > 1 - r ? "down" : "cruise", t: m.sentAt + frac * dur };
}
// Where the pigeon is (at flight-clock time t) along those points, and which way it's heading.
function pigeonOn(P, pts, t = now()) {
  const i = pts.findIndex((p) => p.t >= t);
  if (i <= 0) { const a = P[Math.max(0, P.length - 2)], b = P[P.length - 1]; return { at: P[i < 0 ? P.length - 1 : 0], dx: P[P.length - 1][0] - P[0][0], dy: i < 0 ? 0 : b[1] - a[1] }; }
  const f = (t - pts[i - 1].t) / Math.max(1, pts[i].t - pts[i - 1].t);
  return { at: [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * f, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * f], dx: P[i][0] - P[i - 1][0], dy: P[i][1] - P[i - 1][1] };
}
// The routes a map shows: one, or for your message to a group, one per member
// whose location you can see (friends; others' routes stay off the map).
const routesOf = (m) => m.skies ? m.skies : m.flock ? m.flock.filter((r) => r.route).map((r) => ({ ...r, sentAt: m.sentAt, pigeon: m.pigeon, risky: m.risky, fromPlace: m.fromPlace })) : [m];
// Where the map sits: every route in view, unless the person has moved it.
function mapFrame(cv, m, cardH) {
  const W = cv.clientWidth, H = cv.clientHeight, usableH = Math.max(80, H - cardH - 30), sy0 = 20 + usableH / 2;
  const pts = [...routesOf(m), ...(m.alts || [])].flatMap(routePts);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const fit = {
    cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2,
    k: Math.min(W / Math.max(8, (Math.max(...xs) - Math.min(...xs)) * 1.5), usableH / Math.max(6, (Math.max(...ys) - Math.min(...ys)) * 1.6 + 8)),
  };
  return { W, H, sy0, pts, fit, view: S.sheet?.view || fit, kMin: Math.max(W / 360, H / (2 * mercY(MERC_MAX))) };
}
// The Way: the other ways it could go (m.alts), faint and dotted, each named
// where it's furthest from the chosen way ("Scenic · 10:45"); tap a name for that
// way. Returns where the names are, for the taps. xy: a route point → [x, y, seen]
function drawAlts(g, m, xy, W, H) {
  if (!m.alts?.length) return [];                                     // (only The Way has them; a group's map has no one route)
  const hits = [], main = routePts(m).map(xy), apart = (P, Q) => Math.max(...P.map(([x, y]) => Math.min(...Q.map(([u, v]) => Math.hypot(u - x, v - y)))));
  g.save(); g.font = "600 12px -apple-system, system-ui, sans-serif"; g.lineCap = "round"; g.lineJoin = "round";
  // (two ways that go the same way are one line, named for both: "Fastest & Safe")
  const ways = [];
  for (const a of m.alts || []) {
    const P = routePts(a).map(xy), same = ways.find((w) => apart(w.P, P) < 6);
    if (same) same.a = { ...same.a, name: `${same.a.name} & ${a.name}` }; else ways.push({ a, P });
  }
  for (const { a, P } of ways) {
    // (the same way as the chosen one, near enough: nothing to show)
    const off = P.map(([x, y]) => Math.min(...main.map(([u, v]) => Math.hypot(u - x, v - y))));
    if (Math.max(...off) < 6) continue;
    g.globalAlpha = 0.5; g.strokeStyle = cssVar(g.canvas, "--label-2"); g.lineWidth = 2.5; g.setLineDash([2, 7]);
    g.beginPath(); let on = false; for (const [x, y, seen] of P) { if (seen === false) { on = false; continue; } on ? g.lineTo(x, y) : g.moveTo(x, y); on = true; } g.stroke();
    g.setLineDash([]); g.globalAlpha = 1;
    const i = off.indexOf(Math.max(...off)), [x, y, seen] = P[i]; if (seen === false || x < 0 || x > W || y < 0 || y > H) continue;
    const label = `${a.name} · ${atShort(a.deliverAt)}`, w = g.measureText(label).width + 16, h = 22, bx = Math.max(4, Math.min(W - w - 4, x - w / 2)), by = Math.max(4, Math.min(H - h - 4, y - h / 2));
    g.shadowColor = "rgba(0,0,0,.18)"; g.shadowBlur = 6; g.shadowOffsetY = 1;
    g.fillStyle = cssVar(g.canvas, "--cell"); g.beginPath(); g.roundRect(bx, by, w, h, 11); g.fill();
    g.shadowColor = "transparent"; g.shadowBlur = 0; g.shadowOffsetY = 0;
    g.strokeStyle = cssVar(g.canvas, "--sep"); g.lineWidth = 1; g.stroke();
    g.fillStyle = cssVar(g.canvas, "--label-2"); g.textBaseline = "middle"; g.fillText(label, bx + 8, by + h / 2 + 0.5);
    hits.push({ style: a.style, x0: bx - 8, y0: by - 8, x1: bx + w + 8, y1: by + h + 8 });
  }
  g.restore();
  return hits;
}
function drawMap(cv, m, cardH) {
  cv._m = m; cv._cardH = cardH;
  // a map just opened: its first picture (a long moment's drawing on a phone) waits until the sheet has started up,
  // then fades in (over the sea's colour meanwhile: styles.css), so the sheet never stands still at the bottom
  if (!cv._shown && cv.classList.contains("map")) {
    cv._shown = 1;
    requestAnimationFrame(() => setTimeout(() => {
      if (!cv.isConnected || S.sheet?.type !== "map") return;
      drawMap(cv, cv._m, cv._cardH);
      if (!STILL.matches) cv.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: "ease" });
    }, 0));
    return;
  }
  if (mapMoving() && cv._base) return fastFrame(cv);        // fingers on it: the quick version; the full one follows
  $(".mapctl [data-act=mapglobe]", $layer)?.setAttribute("aria-pressed", String(globeOn(m)));
  if (globeOn(m)) return drawGlobe(cv, m, cardH);
  if (cv._wasFast) { cv._wasFast = false; mapFadeFrom(cv); }   // (after the quick pictures as it moved: the sharp one, names and all, fades in)
  const { W, H, sy0, pts, view } = mapFrame(cv, m, cardH); if (!W || !H) return;
  const { cx, cy, k } = view;
  const dpr = cv._dprFix || window.devicePixelRatio || 1; cv._dpr = dpr;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const col = (n) => cssVar(cv, n);
  const ox = W / 2 - cx * k, oy = sy0 + cy * k;
  const X = (x) => ox + x * k, Y = (y) => oy - y * k;
  const vx0 = cx - W / 2 / k, vx1 = cx + W / 2 / k, vy0 = cy - (H - sy0) / k, vy1 = cy + sy0 / k;
  g.fillStyle = col("--sea"); g.fillRect(0, 0, W, H);
  // graticule, spaced so lines stay roughly 60px or more apart
  const step = [1, 2, 5, 10, 15, 30].find((s) => s * k >= 60) || 30;
  g.strokeStyle = col("--grid"); g.lineWidth = 1; g.beginPath();
  for (let lon = Math.ceil(vx0 / step) * step; lon <= vx1; lon += step) { const x = Math.round(X(lon)) + 0.5; g.moveTo(x, 0); g.lineTo(x, H); }
  for (let lat = -80; lat <= 80; lat += step) { const y = Y(mercY(lat)); if (y >= 0 && y <= H) { g.moveTo(0, Math.round(y) + 0.5); g.lineTo(W, Math.round(y) + 0.5); } }
  g.stroke();
  // coastlines: the finest data that's loaded and worth drawing at this zoom
  const want = k < 5 ? "110m" : k < 40 ? "50m" : "10m";
  let data = world(want);
  if (!data && want === "10m") data = world("50m");
  if (!data) data = world("110m");
  // trace shapes in view; points are clamped to a box just off screen and
  // ones under a pixel apart skipped, so even the 10m coast draws fast
  const M = 40, offs = [];
  for (let o = Math.floor((vx0 + 180) / 360) * 360; o <= vx1 + 180; o += 360) offs.push(o);
  const trace = (list, close) => {
    for (const o of offs) for (const { f, box } of list) {
      if (box[2] + o < vx0 || box[0] + o > vx1 || box[3] < vy0 || box[1] > vy1) continue;
      let lx = 1e9, ly = 1e9;
      for (let i = 0, n = f.length; i < n; i += 2) {
        const sx = Math.max(-M, Math.min(W + M, ox + (f[i] + o) * k)), sy = Math.max(-M, Math.min(H + M, oy - f[i + 1] * k));
        if (i === 0) g.moveTo(sx, sy);
        else if (Math.abs(sx - lx) + Math.abs(sy - ly) >= 0.75 || i === n - 2) g.lineTo(sx, sy); else continue;
        lx = sx; ly = sy;
      }
      if (close) g.closePath();
    }
  };
  g.beginPath(); trace(data.land, true);
  // shallow water along every coast, then the land, then the mountains on it (lit from the north-west)
  g.save(); g.lineJoin = "round"; g.strokeStyle = col("--shelf");
  for (const [w, a] of [[Math.min(16, 3 + k * 0.9), 0.5], [Math.min(8, 2 + k * 0.45), 1]]) { g.globalAlpha = a; g.lineWidth = w; g.stroke(); }
  g.restore();
  g.fillStyle = col("--land"); g.fill("evenodd");
  g.save(); g.clip("evenodd"); drawRelief(g, offs.map((o) => (lon, lat) => [X(lon + o), Y(mercY(lat))]), k, col("--relief-hi"), col("--relief-lo")); g.restore();
  g.strokeStyle = col("--land-edge"); g.lineWidth = k > 40 ? 1.1 : 0.8; g.stroke();
  if (data.borders.length && k >= 2.5) {
    g.beginPath(); trace(data.borders, false);
    g.strokeStyle = col("--border"); g.lineWidth = k > 40 ? 1.2 : 0.8; g.setLineDash([4, 3]); g.stroke(); g.setLineDash([]);
  }
  const suns = drawNight(g, W, H, ox, oy, k);
  // the other ways it could go (on The Way), faint, each with its name; then the routes
  // (a message to a group has one per member), their ends, and each pigeon
  cv._altHits = drawAlts(g, m, (p) => [X(p.x), Y(p.y), true], W, H);
  const tracks = routesOf(m).map((r) => { const rp = routePts(r); return { r, rp, P: rp.map((p) => [X(p.x), Y(p.y)]) }; });
  // the trail: solid where it has flown, dashed (and fainter) where it has still to go
  const line = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
  const lw = tracks.length > 1 ? 3 : 3.5, tint = col("--tint");
  g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = tint;
  for (const { r, rp, P } of tracks) {
    if (r.here) continue;
    const ft = flightAt(r, r.lost ? r.lostAt : now()).t, i = rp.findIndex((p) => p.t >= ft);
    const at = pigeonOn(P, rp, ft).at, flown = i < 0 ? P : i === 0 ? [P[0]] : [...P.slice(0, i), at], ahead = i < 0 ? [] : [at, ...P.slice(i)];
    if (ahead.length > 1) { g.globalAlpha = r.lost ? 0.3 : 0.6; g.lineWidth = lw - 0.5; g.setLineDash([9, 8]); line(ahead); }
    g.globalAlpha = 1; g.setLineDash([]);
    if (flown.length > 1) { g.lineWidth = lw + 1.5; g.strokeStyle = col("--cell"); line(flown); g.lineWidth = lw; g.strokeStyle = tint; line(flown); }   // a light edge so it reads on land and sea
  }
  g.globalAlpha = 1; g.setLineDash([]);
  const ports = drawVoyages(g, tracks, col, lw, (P, a, b) => line(P.slice(a, b + 1)));
  // the weather on the way: the way it was going before it turned for the weather, faint;
  // and where it sheltered from storms
  const nearT = (rp, t) => rp.reduce((a, p, i) => (Math.abs(p.t - t) < Math.abs(rp[a].t - t) ? i : a), 0);
  for (const { r, rp, P } of tracks) for (const [k, l] of (r.legs || []).entries()) {
    if (l[3] === "r" && l[5]?.was?.length) {
      const i = nearT(rp, l[2]), pts = [P[i]]; let prev = rp[i].x, a = { lat: l[0], lon: l[1] };
      for (const [lat, lon] of l[5].was) {
        for (let j = 1; j <= 16; j++) { const q = gcPoint(a, { lat, lon }, j / 16); while (q.lon - prev > 180) q.lon -= 360; while (q.lon - prev < -180) q.lon += 360; prev = q.lon; pts.push([X(q.lon), Y(mercY(q.lat))]); }
        a = { lat, lon };
      }
      g.save(); g.globalAlpha = 0.55; g.strokeStyle = col("--label-3"); g.lineWidth = 2; g.setLineDash([3, 6]); line(pts); g.restore();
    }
    if (l[3] === "h" && r.legs[k + 1]?.[3] === "h" && (k === 0 || r.legs[k - 1][3] !== "h" || r.legs[k - 1][0] !== l[0])) {
      const [x, y] = P[nearT(rp, l[2])];
      g.fillStyle = col("--cell"); g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill();
      g.strokeStyle = col("--orange"); g.lineWidth = 2.5; g.beginPath(); g.arc(x, y, 5, 0, 7); g.stroke();
    }
  }
  g.strokeStyle = tint;
  for (const { rp, P } of tracks) rp.forEach((p, i) => { if (p.turn) { g.fillStyle = col("--cell"); g.beginPath(); g.arc(P[i][0], P[i][1], 5, 0, 7); g.fill(); g.fillStyle = col("--tint"); g.beginPath(); g.arc(P[i][0], P[i][1], 2.5, 0, 7); g.fill(); } });   // where it turned
  for (const { r, rp } of tracks) for (const n of r.near || []) {        // where it passed another pigeon
    const near = rp.reduce((a, p) => (Math.abs(p.t - n.at) < Math.abs(a.t - n.at) ? p : a), rp[0]);
    let lon = n.lon; while (lon - near.x > 180) lon -= 360; while (lon - near.x < -180) lon += 360;
    sparkAt(g, X(lon), Y(mercY(n.lat)), col("--cell"), col("--orange"));
  }
  const birds = tracks.filter(({ r }) => !r.here).map(({ r, rp, P }) => ({ r, rp, P, ...pigeonOn(P, rp, flightAt(r, r.lost ? r.lostAt : now()).t) }));
  // labels claim space in priority order; anything that would overlap is left out
  const taken = [...birds.map(({ at: [px, py] }) => [px - 24, py - 20, px + 24, py + 20]), [0, H - cardH, W, H], ...suns];
  const ctlEl = $(".mapctl", $layer);
  if (ctlEl) { const r = ctlEl.getBoundingClientRect(), c = cv.getBoundingClientRect(); taken.push([r.left - c.left - 4, r.top - c.top - 4, r.right - c.left + 4, r.bottom - c.top + 4]); }
  const free = (b) => b[0] >= 2 && b[2] <= W - 2 && b[1] >= 2 && b[3] <= H - 2 && !taken.some((t) => b[0] < t[2] && b[2] > t[0] && b[1] < t[3] && b[3] > t[1]);
  g.textBaseline = "middle"; g.textAlign = "left"; g.lineJoin = "round";
  const text = (s, x, y, color) => { g.lineWidth = 4; g.strokeStyle = col("--land"); g.strokeText(s, x, y); g.fillStyle = color; g.fillText(s, x, y); };
  // each end's label sits above or below its dot, away from the route, far enough out that the pigeon never covers it
  g.font = "600 13px -apple-system, system-ui, sans-serif";
  const end = ([x, y], toward, name) => {
    g.fillStyle = col("--cell"); g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill();
    g.fillStyle = col("--tint"); g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
    taken.push([x - 9, y - 9, x + 9, y + 9]);
    if (!name || x < -10 || x > W + 10 || y < -10 || y > H + 10) return;
    const w = g.measureText(name).width, ly = y + (toward[1] <= y ? 28 : -28), lx = Math.min(W - 8 - w, Math.max(8, x - w / 2));
    taken.push([lx - 3, ly - 10, lx + w + 3, ly + 10]);
    text(name, lx, ly, col("--label"));
  };
  if (m.skies) {
    // every pigeon in the air: each place once, wherever several routes share it
    const done = new Set();
    for (const { r, P } of tracks) for (const [p, toward, name] of [[P[0], P[4], r.fromPlace], [P[P.length - 1], P[P.length - 5], r.toPlace]]) {
      const key = `${Math.round(p[0])},${Math.round(p[1])}`; if (done.has(key)) continue;
      done.add(key); end(p, toward, name);
    }
  } else {
    end(tracks[0].P[0], tracks[0].P[4], m.fromPlace);
    for (const { r, P } of tracks) end(P[P.length - 1], P[P.length - 5], r.toPlace);
  }
  g.font = "600 13px -apple-system, system-ui, sans-serif";
  portLabels(g, ports, free, taken, text, col); cv._ports = ports.filter((p) => p.vis).map((p) => p.name);
  // country names: the biggest first, smaller ones as you zoom in (only where there's room)
  if (k >= 2.2 && k < 60) {
    g.save(); g.font = "600 10px -apple-system, system-ui, sans-serif"; g.textAlign = "center"; g.fillStyle = col("--label-3");
    const tier = k >= 9 ? 3 : k >= 4.5 ? 2 : 1;
    for (const [name, lat, lon, t] of COUNTRIES) {
      if (t > tier) continue;
      const label = name.toUpperCase().split("").join("\u200a");
      for (const o of offs) {
        const x = X(lon + o), y = Y(mercY(lat)); if (x < -60 || x > W + 60 || y < -20 || y > H + 20) continue;
        const w = g.measureText(label).width, box = [x - w / 2 - 3, y - 7, x + w / 2 + 3, y + 7];
        if (!free(box)) continue;
        taken.push(box); g.fillText(label, x, y);
      }
    }
    g.restore();
  }
  // other cities once there's room to read them
  if (k >= 4) {
    g.font = "500 11px -apple-system, system-ui, sans-serif";
    const c2 = col("--label-2"), skip = new Set([m.fromPlace, ...tracks.flatMap(({ r }) => [r.fromPlace, r.toPlace])]);
    for (const [name, lat, lon] of PLACES) {
      if (skip.has(name)) continue;
      for (const o of offs) {
        const x = X(lon + o), y = Y(mercY(lat)); if (x < -50 || x > W + 50 || y < -20 || y > H + 20) continue;
        const w = g.measureText(name).width, box = [x - 4, y - 8, x + 8 + w, y + 8];
        if (!free(box)) continue;
        taken.push(box);
        g.fillStyle = c2; g.beginPath(); g.arc(x, y, 2.5, 0, 7); g.fill();
        text(name, x + 6, y, c2);
      }
    }
  }
  // keep the map without its pigeons: between full redraws only the pigeons are drawn again (wings flapping)
  const base = cv._base || (cv._base = document.createElement("canvas"));
  if (base.width !== cv.width || base.height !== cv.height) { base.width = cv.width; base.height = cv.height; }
  base.getContext("2d").drawImage(cv, 0, 0);
  cv._birds = birds.map((b) => ({ ...b, phase: birdPhase(b.r), color: b.r.lost ? col("--label-3") : col("--p-" + kindOf(b.r)) }));
  // the wind it met, for the streaks: each route still being flown, measured along its length
  cv._snap = { ox, oy, k, globe: false }; cv._seaCol = col("--sea");
  cv._fwd = (lon, lat) => { const L = lon + 360 * Math.round((cx - lon) / 360); return [X(L), Y(mercY(lat))]; };
  cv._inv = (x, y) => [(x - ox) / k, latOf((oy - y) / k)];
  cv._kArc = (lat) => k / Math.max(0.05, Math.cos(lat * Math.PI / 180));        // pixels per degree of arc here
  cv._viewKey = `f${ox.toFixed(1)},${oy.toFixed(1)},${k.toFixed(5)},${W},${H}`;
  cv._area = (x, y) => x >= 0 && x <= W && y >= 0 && y <= H;
  windEnsure(cv);
  cv._winds = windOn() ? [] : tracks.filter(({ r }) => !r.here && !r.lost && r.wind != null && Math.abs(r.wind) >= 3 && now() < r.deliverAt).map(({ r, P }) => {
    const cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    return { P, cum, L: cum[cum.length - 1], wind: r.wind, seed: r.deliverAt % 1000 };
  });
  cv._windCol = [col("--green") || "#34c759", col("--orange") || "#ff9500"];
  cv._wx = wxCells(tracks.map(({ r }) => r)); cv._wxText = col("--label-2"); cv._wxHalo = col("--land");
  cv._fullAt = performance.now(); cv._sig = routesSig(m); cv._sigM = m; cv._stale = cv._dirty = false;
  drawBirds(cv, performance.now());
  if (ctlEl) ctlEl.classList.toggle("moved", !!S.sheet?.view && !cv._fitting);
}
// Mountains: each range a soft ridge, a light side to the north-west and a
// shadow to the south-east, built from a few wide translucent strokes.
function drawRelief(g, pts1, k, hi, lo) {
  if (k > 120) return;
  g.lineCap = "round"; g.lineJoin = "round";
  for (const [wd, pts] of RANGES) for (const pt of pts1) {
    const P = pts.map(([lon, lat]) => pt(lon, lat)); if (P.some((p) => !p)) continue;
    const w = wd * k, sh = Math.max(1, w * 0.18);
    const path = (dx, dy) => { g.beginPath(); P.forEach(([x, y], i) => (i ? g.lineTo(x + dx, y + dy) : g.moveTo(x + dx, y + dy))); };
    for (const [c, dx, dy] of [[lo, sh, sh], [hi, -sh, -sh]]) {
      g.strokeStyle = c;
      for (const [f, a] of [[1.5, 0.035], [1, 0.045], [0.6, 0.05]]) { g.globalAlpha = a; g.lineWidth = w * f; path(dx, dy); g.stroke(); }
    }
  }
  g.globalAlpha = 1;
}
// Where the sun is overhead right now (degrees): the usual low-precision
// solar formulas, good to a fraction of a degree.
function sunAt(t = now()) {
  const d = t / DAY - 10957.5, rad = Math.PI / 180;
  const g = (357.529 + 0.98560028 * d) * rad, q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad, e = (23.439 - 0.00000036 * d) * rad;
  const dec = Math.asin(Math.sin(e) * Math.sin(L)), ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / rad;
  const eot = ((((q - ra) % 360) + 540) % 360 - 180) * 4 / 60;          // equation of time, hours
  const utc = (t % DAY) / HOUR;
  return { lat: dec / rad, lon: ((((12 - utc - eot) * 15) % 360) + 540) % 360 - 180 };
}
// Night: shade where the sun is down, deepening through twilight (to 12° below
// the horizon). Worked out on a coarse grid and smoothed, so it's cheap.
const NIGHT_STEP = 6;
function drawNight(g, W, H, ox, oy, k) {
  const sun = sunAt(), rad = Math.PI / 180, sd = Math.sin(sun.lat * rad), cd = Math.cos(sun.lat * rad);
  const cw = Math.ceil(W / NIGHT_STEP) + 1, ch = Math.ceil(H / NIGHT_STEP) + 1;
  const off = drawNight.c || (drawNight.c = document.createElement("canvas"));
  if (off.width !== cw || off.height !== ch) { off.width = cw; off.height = ch; }
  const oc = off.getContext("2d"), img = oc.createImageData(cw, ch), px = img.data;
  const dark = mapInk ? mapInk === "dark" : document.documentElement.getAttribute("data-theme") === "dark" || (document.documentElement.getAttribute("data-theme") === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  const [r, gg, b, top] = dark ? [0, 0, 0, 0.42] : [12, 26, 64, 0.26];
  const lats = Array.from({ length: ch }, (_, j) => { const y = (oy - j * NIGHT_STEP) / k; return (2 * Math.atan(Math.exp(y / R2D)) * R2D - 90) * rad; });
  for (let i = 0; i < cw; i++) {
    const cosH = Math.cos(((i * NIGHT_STEP - ox) / k - sun.lon) * rad);
    for (let j = 0; j < ch; j++) {
      const alt = Math.asin(Math.sin(lats[j]) * sd + Math.cos(lats[j]) * cd * cosH) / rad;
      const n = alt >= 0 ? 0 : alt <= -12 ? 1 : (x => x * x * (3 - 2 * x))(-alt / 12);
      const o = (j * cw + i) * 4; px[o] = r; px[o + 1] = gg; px[o + 2] = b; px[o + 3] = Math.round(255 * top * n);
    }
  }
  oc.putImageData(img, 0, 0);
  g.save(); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  g.drawImage(off, 0, 0, cw * NIGHT_STEP, ch * NIGHT_STEP); g.restore();
  // the sun, where it's overhead (once on each copy of the world in view); its spots, for labels to keep clear of
  const spots = [];
  for (let o = -360; o <= 360; o += 360) {
    const sx = ox + (sun.lon + o) * k, sy = oy - mercY(sun.lat) * k;
    if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;
    spots.push([sx - 15, sy - 15, sx + 15, sy + 15]);
    g.save(); g.translate(sx, sy);
    const glow = g.createRadialGradient(0, 0, 2, 0, 0, 22); glow.addColorStop(0, "rgba(255,204,0,.55)"); glow.addColorStop(1, "rgba(255,204,0,0)");
    g.fillStyle = glow; g.beginPath(); g.arc(0, 0, 22, 0, 7); g.fill();
    g.fillStyle = "#ffcc00"; g.strokeStyle = "#ff9f0a"; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, 6, 0, 7); g.fill(); g.stroke();
    g.strokeStyle = "#ffb800"; g.lineWidth = 1.6; g.lineCap = "round";
    for (let a = 0; a < 8; a++) { const c = Math.cos(a * Math.PI / 4), s2 = Math.sin(a * Math.PI / 4); g.beginPath(); g.moveTo(c * 9, s2 * 9); g.lineTo(c * 12.5, s2 * 12.5); g.stroke(); }
    g.restore();
  }
  return spots;
}
// How sure a landing time is: a range around it, wider the further off it is
// and the more the weather has to do with the flight (its wind, the time the
// weather has cost or saved, the storms and wind it's going around), narrowing
// as it gets closer. [earliest, latest] (to 5 minutes), or null once it's within ~10.
// With `sure` (how much the ensemble forecast's members disagree about the
// flight's length, as a share of it), the range is the middle 80% of theirs.
function landRange(at, from, { wind = null, delay = 0, legs = [], sure = null } = {}) {
  const R = Math.max(0, at - now()), H = R / HOUR;
  const wx = Math.min(0.4, Math.abs(Math.log(Math.max(0.4, (80 + (wind || 0)) / 80))) + (delay ? Math.abs(delay) / Math.max(HOUR, at - from) : 0)
    + 0.04 * (legs || []).filter((l) => /^[srhw]$/.test(l[3] || "")).length);
  const spread = Math.min(3 * HOUR, sure != null ? R * 2.56 * sure : R * (0.01 + 0.15 * wx * Math.min(1, H / 48)));
  if (spread < 10 * MIN) return null;
  const five = (x) => Math.round(x / (5 * MIN)) * 5 * MIN;
  return [five(at - spread / 2), five(at + spread / 2)];
}
// "21:10–21:40", "Fri 23:40–Sat 00:30"
const rangeText = ([lo, hi], tz = MY_TZ) => `${clockIn(lo, tz)}–${new Date(lo).toDateString() === new Date(hi).toDateString() ? fmtTime(hi) : clockIn(hi, tz)}`;
// Lands 08:12 Mira's time · 16:12 yours (when your clocks differ)
function landsLine(m) {
  const mine = m.from === S.me.id, other = friend(mine ? m.to : m.from), at = m.deliverAt, you = clockIn(at, MY_TZ);
  const them = other?.tz && other.tz !== MY_TZ ? clockIn(at, other.tz) : null;
  // (in the air, a range when it's not yet sure: "Lands 21:10–21:40")
  const range = m.flying && !m.lost ? landRange(at, m.sentAt, { wind: m.wind, delay: m.delay, legs: m.legs, sure: m.spread }) : null;
  if (range) return `Lands ${rangeText(range)}${them && them !== you ? ` · about ${them} ${esc(first(other.name))}’s time` : ""}`;
  if (!them || them === you) return `Lands ${you}`;
  return mine ? `Lands ${them} ${esc(first(other.name))}’s time · ${you} yours` : `Lands ${you} · ${them} for ${esc(first(other.name))}`;
}

/* ---------- where a pigeon is: over which country or sea ---------- */
// on land? (the coarse coastline, even-odd over every ring)
function onLand(lon, lat) {
  const y = mercY(lat), land = world("110m").land;
  let inside = false;
  for (const { f, box } of land) for (const o of [0, 360, -360]) {
    const x = lon + o; if (x < box[0] || x > box[2] || y < box[1] || y > box[3]) continue;
    for (let i = 0, j = f.length - 2; i < f.length; j = i, i += 2) {
      const xi = f[i], yi = f[i + 1], xj = f[j], yj = f[j + 1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}
// where the pigeon is now, as [lon, lat]
function pigeonLL(r) {
  const pts = routePts(r), t = flightAt(r, r.lost ? r.lostAt : now()).t, i = pts.findIndex((p) => p.t >= t);
  if (i <= 0) { const p = pts[i < 0 ? pts.length - 1 : 0]; return [p.x, latOf(p.y)]; }
  const a = pts[i - 1], b = pts[i], f = (t - a.t) / Math.max(1, b.t - a.t);
  return [a.x + (b.x - a.x) * f, latOf(a.y + (b.y - a.y) * f)];
}
// Tap the pigeon: what it's doing right now
function birdTip(cv, bird) {
  const tip = $(".birdtip", $layer); if (!tip) return;
  const r = bird.r, f = flightAt(r, r.lost ? r.lostAt : now()), [lon, lat] = pigeonLL(r), left = r.deliverAt - now();
  const who = r.from && r.from !== S.me.id ? `${esc(first(friend(r.from)?.name || member(group(r.gid || S.chat), r.from)?.name || "A friend"))}’s pigeon` : `${KIND[kindOf(r)]?.name || "Your"} pigeon`;
  const rest = !r.lost && restingOn(r), REST = { h: "Sheltering", i: "Resting", t: "Taking a breather", b: "Waiting for a ship", sail: "At sea", v: "On a stopover" };
  const state = r.recalled ? "Called back" : r.lost ? "Lost on the way" : f.phase === "landed" ? `Landed ${fmtShort(r.deliverAt)}` : rest ? REST[rest[2]] || "Resting"
    : `${f.phase === "up" ? "Taking off · " : f.phase === "down" ? "Landing · " : ""}${fmtMph(f.kmh)}`;
  tip.innerHTML = `<b>${pgm(r)}<span>${who}</span></b><span>${state}</span><span>${r.recalled ? "Turned back over" : r.lost ? "Lost" : f.phase === "landed" ? "At" : rest?.[2] === "sail" ? "Crossing" : "Over"} ${esc(overWhere(lon, lat))}</span>${!r.lost && left > 0 ? `<span class="eta"><span data-eta="${esc(r.deliverAt)}">${fmtDur(left)}</span> to go</span>` : ""}`;
  tip.hidden = false;
  const w = tip.offsetWidth, h = tip.offsetHeight, [x, y] = bird.at;
  tip.style.left = `${Math.max(8, Math.min(cv.clientWidth - w - 8, x - w / 2))}px`; tip.style.top = `${y - h - 26 < 8 ? y + 26 : y - h - 26}px`;
  tip.classList.remove("pop", "out"); void tip.offsetWidth; tip.classList.add("pop");
  clearTimeout(birdTip.t); birdTip.t = setTimeout(() => tipAway(tip), 6000);
}
// a tip on the map goes as a quick fade (styles.css .out), not in one frame
function tipAway(tip) {
  if (!tip || tip.hidden || tip.classList.contains("out")) return;
  if (STILL.matches) { tip.hidden = true; return; }
  tip.classList.remove("pop"); tip.classList.add("out");
  setTimeout(() => { if (tip.classList.contains("out")) { tip.hidden = true; tip.classList.remove("out"); } }, 200);
}

/* ---------- the wind map: the wind everywhere, as drifting trails ---------- */
const windOn = () => { try { return localStorage.getItem("inflight-windmap") !== "0"; } catch (_) { return true; } };
// the wind (km/h east, north) anywhere in the grid, blended from the four points around it
function windAt(gr, lon, lat) {
  const span = (gr.cols - 1) * gr.step;
  let x = (lon - gr.w) / gr.step;
  if (span >= 359.9) x = ((x % (gr.cols - 1)) + (gr.cols - 1)) % (gr.cols - 1);
  else { let l = lon; while (l < gr.w) l += 360; while (l > gr.w + span) l -= 360; x = (l - gr.w) / gr.step; if (x < 0 || x > gr.cols - 1) return null; }
  const y = (lat - gr.s) / gr.step; if (y < 0 || y > gr.rows - 1) return null;
  const i = Math.min(gr.cols - 2, Math.floor(x)), j = Math.min(gr.rows - 2, Math.floor(y)), fx = x - i, fy = y - j, at = (a, jj, ii) => a[jj * gr.cols + ii];
  const mix = (a) => (at(a, j, i) * (1 - fx) + at(a, j, i + 1) * fx) * (1 - fy) + (at(a, j + 1, i) * (1 - fx) + at(a, j + 1, i + 1) * fx) * fy;
  return [mix(gr.u), mix(gr.v)];
}
// What part of the world is showing (sampled across the screen), so the right grid is asked for.
function viewBox(cv) {
  const W = cv.clientWidth, H = cv.clientHeight; let s = 90, n = -90, w = 1e9, e = -1e9, any = false;
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 10; j++) {
    const ll = cv._inv((W * i) / 8, (H * j) / 10); if (!ll) continue; any = true;
    s = Math.min(s, ll[1]); n = Math.max(n, ll[1]); w = Math.min(w, ll[0]); e = Math.max(e, ll[0]);
  }
  if (!any) return null;
  // a pole in sight (on the globe), or most of the way round: the whole width of the world
  const pole = (lat) => { const p = cv._fwd(0, lat); return !!p && cv._area(p[0], p[1]); };
  if (pole(89.9) || pole(-89.9) || e - w > 300) { w = Math.min(w, (w + e) / 2 - 180); e = w + 360; if (pole(89.9)) n = 84; if (pole(-89.9)) s = -84; }
  return { s: Math.max(-84, s), n: Math.min(84, n), w, e };
}
let windTimer = 0;
function windEnsure(cv) {
  if (!windOn()) return;                          // (a pigeon's own storm is drawn without it)
  const b = viewBox(cv); if (!b) return;
  const g = S.windGrid, ideal = Math.max(b.n - b.s, b.e - b.w) / 15;
  if (g) {
    const gn = g.s + (g.rows - 1) * g.step, ge = g.w + (g.cols - 1) * g.step, full = ge - g.w >= 359.9;
    const shift = full ? 0 : 360 * Math.round((g.w + ge - b.w - b.e) / 720);
    if (b.s >= g.s && b.n <= gn && (full || (b.w + shift >= g.w && b.e + shift <= ge)) && g.step <= Math.max(0.25, ideal) * 2.6 && (g.step >= ideal / 2.6 || g.step <= 0.25)) return;
  }
  // (a map redrawn every frame, as while a pigeon takes off, mustn't keep putting the ask off)
  const q = `s=${b.s.toFixed(2)}&n=${b.n.toFixed(2)}&w=${b.w.toFixed(2)}&e=${b.e.toFixed(2)}`;
  if (windTimer && S.windWant === q) return;
  S.windWant = q;
  clearTimeout(windTimer);
  windTimer = setTimeout(async () => {
    windTimer = 0;
    if (S.windAsk === q) return;
    S.windAsk = q;
    try { S.windGrid = await api("wind-grid?" + q); const c = $(".map", $layer); if (c) { c._parts = null; smoothMap({ lost: true }); } } catch (_) { /* no wind map this time */ }
    S.windAsk = null;
  }, 300);
}
// Move each speck along the wind and draw its step on the trail layer (which fades a little every frame).
function stepWind(cv, ts) {
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight, gr = S.windGrid;
  const tc = cv._trail || (cv._trail = document.createElement("canvas"));
  if (tc.width !== cv.width || tc.height !== cv.height) { tc.width = cv.width; tc.height = cv.height; cv._trailKey = null; }
  const t = tc.getContext("2d");
  if (cv._trailKey !== cv._viewKey || cv._trailGrid !== gr) { t.setTransform(1, 0, 0, 1, 0, 0); t.clearRect(0, 0, tc.width, tc.height); cv._trailKey = cv._viewKey; cv._trailGrid = gr; cv._parts = null; cv._wts = 0; }
  const still = STILL.matches, dt = still ? 16 : Math.min(50, ts - (cv._wts || ts - 16)); cv._wts = ts;
  if (still && cv._parts) return true;                       // reduced motion: one still frame of short strokes
  const spawn = (p) => {
    for (let tries = 0; tries < 8; tries++) {
      const x = Math.random() * W, y = Math.random() * H; if (!cv._area(x, y)) continue;
      const ll = cv._inv(x, y); if (!ll) continue;
      p.lon = ll[0]; p.lat = ll[1]; p.age = 0; p.max = 110 + Math.random() * 170; return p;
    }
    p.age = 1e9; return p;
  };
  if (!cv._parts) { const n = Math.round(Math.max(500, Math.min(1700, (W * H) / 120))); cv._parts = Array.from({ length: n }, () => { const p = spawn({}); p.age = Math.random() * p.max; return p; }); }
  t.setTransform(1, 0, 0, 1, 0, 0);
  if (!still) { t.globalCompositeOperation = "destination-out"; t.fillStyle = `rgba(0,0,0,${Math.min(0.25, 0.045 * dt / 16)})`; t.fillRect(0, 0, tc.width, tc.height); t.globalCompositeOperation = "source-over"; }
  t.setTransform(dpr, 0, 0, dpr, 0, 0); t.lineCap = "round"; t.lineWidth = 1.1;
  const dark = mapInk ? mapInk === "dark" : document.documentElement.getAttribute("data-theme") === "dark" || (document.documentElement.getAttribute("data-theme") === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  const rgb = dark ? "235,244,255" : "24,64,140", buckets = [[], [], [], []];
  for (const p of cv._parts) {
    if (p.age++ > p.max) spawn(p);
    const w = p.age < 1e8 && windAt(gr, p.lon, p.lat); if (!w) { spawn(p); continue; }
    const sp = Math.hypot(w[0], w[1]); if (sp < 0.5) { p.age += 4; continue; }
    const len = (still ? 9 : (0.12 + sp * 0.013) * dt / 16) / cv._kArc(p.lat), cl = Math.max(0.05, Math.cos(p.lat * Math.PI / 180));
    const nlat = p.lat + (w[1] / sp) * len, nlon = p.lon + ((w[0] / sp) * len) / cl;
    const a = cv._fwd(p.lon, p.lat), b = cv._fwd(nlon, nlat);
    if (!a || !b || !cv._area(b[0], b[1]) || Math.abs(b[0] - a[0]) > 40) { spawn(p); continue; }
    buckets[Math.min(3, Math.floor(sp / 15))].push(a[0], a[1], b[0], b[1]);
    p.lon = nlon; p.lat = nlat;
  }
  buckets.forEach((seg, i) => {
    if (!seg.length) return;
    t.strokeStyle = `rgba(${rgb},${[0.22, 0.34, 0.48, 0.62][i]})`; t.beginPath();
    for (let k = 0; k < seg.length; k += 4) { t.moveTo(seg[k], seg[k + 1]); t.lineTo(seg[k + 2], seg[k + 3]); }
    t.stroke();
  });
  return true;
}
// Tap the map: the wind there, which way it blows from and how hard
function windTip(cv, x, y) {
  const tip = $(".windtip", $layer), gr = S.windGrid; if (!tip || !windOn() || !gr) return;
  const ll = cv._inv(x, y), w = ll && windAt(gr, ll[0], ll[1]); if (!w) return;
  const sp = Math.hypot(w[0], w[1]), from = (Math.atan2(w[0], w[1]) * R2D + 540) % 360;
  tip.innerHTML = `<small>${["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(from / 45) % 8]}</small><b>${Math.round(sp * 0.621371)}</b><small>mph</small>`;
  tip.style.left = `${x - 34}px`; tip.style.top = `${y - 34}px`; tip.hidden = false; tip.classList.remove("pop", "out"); void tip.offsetWidth; tip.classList.add("pop");
  clearTimeout(windTip.t); windTip.t = setTimeout(() => tipAway(tip), 4000);
}
// Wind: short streaks drifting beside the route, with the pigeon for a
// tailwind (green), against it for a headwind (orange); faster the stronger it blew.
/* ---------- the rain radar ----------
   How hard it's raining, coloured like a weather radar: light blue drizzle,
   blue and purple rain, orange and yellow cloudbursts. The real rain (a coarse
   grid from Open-Meteo, with the wind map) is given a radar's grain by a
   streaky noise that drifts slowly; the storm that held a pigeon up always
   shows, as an intense cell. Worked out at a third of the screen's resolution
   and smoothed up, a few times a second. */
const RAIN_K = { storms: 16, rain: 8, snow: 4 };      // how hard (mm an hour) at the heart of a pigeon's weather
const RAMP = [[0.15, 80, 170, 255, 0], [0.4, 70, 150, 255, 0.42], [1.2, 60, 105, 245, 0.55], [2.6, 112, 78, 232, 0.62], [5, 170, 62, 205, 0.68],
  [8.5, 226, 82, 150, 0.74], [13, 255, 132, 62, 0.8], [20, 255, 206, 58, 0.86], [30, 255, 246, 140, 0.9]];
const RAMP_LUT = (() => {
  const lut = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) {
    const mm = 0.1 * Math.pow(400, i / 255);                // 0.1 to 40 mm an hour, on a log scale
    let j = 0; while (j < RAMP.length - 2 && mm > RAMP[j + 1][0]) j++;
    const [a, b] = [RAMP[j], RAMP[j + 1]], f = Math.max(0, Math.min(1, (Math.log(mm) - Math.log(a[0])) / (Math.log(b[0]) - Math.log(a[0]))));
    for (let c = 0; c < 4; c++) lut[i * 4 + c] = (c < 3 ? a[c + 1] + (b[c + 1] - a[c + 1]) * f : 255 * (a[4] + (b[4] - a[4]) * f));
  }
  return lut;
})();
// value noise: smooth, repeatable, cheap
const nHash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = nHash(xi, yi), b = nHash(xi + 1, yi), c = nHash(xi, yi + 1), d = nHash(xi + 1, yi + 1);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}
// streaky radar grain: bands running south-west to north-east, warped so they wander
function rainGrain(lon, lat, t) {
  const u = lon * 0.82 + lat * 0.57, v = -lon * 0.57 + lat * 0.82;          // turned 35°
  let x = u * 1.1 + t * 0.03, y = v * 3.2 - t * 0.012;                        // stretched along the bands
  const wx = vnoise(x * 0.5 + 7.1, y * 0.5) - 0.5, wy = vnoise(x * 0.5, y * 0.5 + 3.3) - 0.5;
  x += wx * 2.2; y += wy * 2.2;
  const fine = vnoise(x, y) * 0.55 + vnoise(x * 2.3 + 1.7, y * 2.3) * 0.3 + vnoise(x * 5.1, y * 5.1 + 9.2) * 0.15;
  // and big bands and gaps, a few hundred kilometres across, so it isn't even all over
  const big = vnoise(u * 0.32 + 5.3 + t * 0.008, v * 0.75 + 1.1);
  return fine * 0.62 + big * 0.58;
}
function gridAt(gr, a, lon, lat) {
  const span = (gr.cols - 1) * gr.step;
  let x = (lon - gr.w) / gr.step;
  if (span >= 359.9) x = ((x % (gr.cols - 1)) + (gr.cols - 1)) % (gr.cols - 1);
  else { let l = lon; while (l < gr.w) l += 360; while (l > gr.w + span) l -= 360; x = (l - gr.w) / gr.step; if (x < 0 || x > gr.cols - 1) return 0; }
  const y = (lat - gr.s) / gr.step; if (y < 0 || y > gr.rows - 1) return 0;
  const i = Math.min(gr.cols - 2, Math.floor(x)), j = Math.min(gr.rows - 2, Math.floor(y)), fx = x - i, fy = y - j, at = (jj, ii) => a[jj * gr.cols + ii];
  return (at(j, i) * (1 - fx) + at(j, i + 1) * fx) * (1 - fy) + (at(j + 1, i) * (1 - fx) + at(j + 1, i + 1) * fx) * fy;
}
const radarCells = (cv) => (cv._wx || []).filter((w) => RAIN_K[w.k]);
function radarWanted(cv) { return radarCells(cv).length > 0 || (windOn() && S.windGrid?.p?.some((v) => v >= 0.2)); }
function drawRadar(g, cv, ts, xf) {
  const want = !!cv._inv && radarWanted(cv);
  if (!want) return;
  const W = cv.clientWidth, H = cv.clientHeight, ST = 3, cw = Math.ceil(W / ST), ch = Math.ceil(H / ST);
  const off = cv._radar || (cv._radar = document.createElement("canvas"));
  const t = STILL.matches ? 0 : ts / 1000;
  // drawn afresh when the view, the rain or (four times a second) the drift changes; while the map moves, the last one moves with it
  const key = `${cv._viewKey}|${S.windGrid?.hour ?? ""}|${(cv._wx || []).length}`;
  if (!xf && (key !== cv._radarKey || (!STILL.matches && ts - (cv._radarAt || 0) > 250))) {
    cv._radarKey = key; cv._radarAt = ts;
    if (off.width !== cw || off.height !== ch) { off.width = cw; off.height = ch; }
    const oc = off.getContext("2d"), img = oc.createImageData(cw, ch), px = img.data, gr = windOn() ? S.windGrid : null, gp = gr?.p;
    const cells = radarCells(cv).map((w) => ({ lat: w.lat, lon: w.lon, peak: RAIN_K[w.k], cl: Math.cos(w.lat * Math.PI / 180) }));
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
      const x = i * ST + ST / 2, y = j * ST + ST / 2; if (!cv._area(x, y)) continue;
      const ll = cv._inv(x, y); if (!ll) continue;
      const [lon, lat] = ll;
      let mm = gp ? gridAt(gr, gp, lon, lat) : 0;
      for (const c of cells) {
        // a long cell along the bands, ~300 km by ~120 km
        const dx = (lon - c.lon) * c.cl * 111, dy = (lat - c.lat) * 111, a = dx * 0.82 + dy * 0.57, b = -dx * 0.57 + dy * 0.82;
        mm = Math.max(mm, c.peak * Math.exp(-((a / 150) ** 2 + (b / 60) ** 2)));
      }
      if (mm < 0.12) continue;
      const n = rainGrain(lon, lat, t), v = mm * Math.max(0, n - 0.5) ** 1.25 * 4.2;
      if (v < 0.15) continue;
      const li = Math.max(0, Math.min(255, Math.round(255 * Math.log(v / 0.1) / Math.log(400)))) * 4, o = (j * cw + i) * 4;
      px[o] = RAMP_LUT[li]; px[o + 1] = RAMP_LUT[li + 1]; px[o + 2] = RAMP_LUT[li + 2]; px[o + 3] = RAMP_LUT[li + 3];
    }
    oc.putImageData(img, 0, 0);
  }
  if (!off.width) return;
  g.save(); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  if (xf) g.setTransform(xf.a * (cv._dpr || 1), 0, 0, xf.a * (cv._dpr || 1), xf.bx * (cv._dpr || 1), xf.by * (cv._dpr || 1));
  g.drawImage(off, 0, 0, cw * ST, ch * ST);
  g.restore();
}

// The weather that's holding a pigeon up, drawn where it is: a cloud with rain
// falling, a storm cloud that flashes, drifting snow, banks of fog, or gusts.
const WX_SKY = { storms: ["#596072", 0.7, "Storms"], hail: ["#4f5668", 0.75, "Hail"], icing: ["#d6e2ee", 0.82, "Ice"], rain: ["#8a95a8", 0.6, "Heavy rain"], snow: ["#dfe5ee", 0.85, "Snow"], fog: ["#e4e7ec", 0.78, "Fog"], gales: ["#a9b1bf", 0.5, "Gales"], ash: ["#6e6660", 0.8, "Ash"], smoke: ["#a8978a", 0.62, "Smoke"] };
function wxCells(routes) {
  const held = routes.filter((r) => !r.here && !r.lost && r.wx && WX_SKY[r.wx.k] && r.delay > 0 && now() < r.deliverAt).map((r) => ({ k: r.wx.k, lat: r.wx.lat, lon: r.wx.lon }));
  // and the storms it went around (planned, or turning for them on the way), while it's flying
  const dodged = routes.filter((r) => !r.here && !r.lost && now() < r.deliverAt).flatMap((r) => (r.legs || []).filter((l) => l[5]?.storm).map((l) => ({ k: l[5].k || "storms", lat: l[5].storm[0], lon: l[5].storm[1] })));
  // (one cloud for the same weather: what held it up and what it went around are often the same storms, a little apart)
  return [...held, ...dodged].filter((c, i, a) => a.findIndex((x) => Math.abs(x.lat - c.lat) < 1 && Math.abs(x.lon - c.lon) < 1.4 / Math.max(0.3, Math.cos(c.lat * Math.PI / 180))) === i)
    .map((c) => ({ ...c, seed: (Math.abs(c.lat * 7 + c.lon * 13) % 10) }));
}
function drawWx(g, cv, ts, xf) {
  const t = STILL.matches ? 0 : ts / 1000;
  for (const w of cv._wx || []) {
    let p = cv._fwd?.(w.lon, w.lat); if (!p) continue;
    let R = Math.max(34, Math.min(100, cv._kArc(w.lat) * 1.6));
    if (xf) { p = [xf.a * p[0] + xf.bx, xf.a * p[1] + xf.by]; R *= xf.a; }
    const [x, y] = p, [c, a, label] = WX_SKY[w.k];
    if (x < -2 * R || y < -2 * R || x > cv.clientWidth + 2 * R || y > cv.clientHeight + 2 * R) continue;
    g.save();
    const radar = !!RAIN_K[w.k];                           // (rain, storms and snow are on the radar)
    // what falls from it
    if (radar) { /* the radar draws it */ } else if (w.k === "rain" || w.k === "storms" || w.k === "hail") {
      g.strokeStyle = w.k === "rain" ? "#5b8fd6" : "#4f7fc4"; g.lineWidth = Math.max(1, R / 40); g.lineCap = "round";
      for (let i = 0; i < 16; i++) {
        const ph = ((t * 1.5 + i * 0.381 + w.seed * 0.1) % 1 + 1) % 1, dx = -0.8 + (i / 15) * 1.6 + Math.sin(i * 7.3) * 0.06;
        const xx = x + dx * R * 0.75, yy = y + R * 0.38 + ph * R * 0.8, len = R * 0.15;
        g.globalAlpha = 0.75 * Math.sin(Math.PI * ph);
        g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx - len * 0.3, yy + len); g.stroke();
      }
    } else if (w.k === "ash" || w.k === "smoke") {
      // ash: grey grit drifting down; smoke: embers rising from the fire beneath it
      const up = w.k === "smoke";
      g.fillStyle = up ? "#ff8a3d" : "#4a4440";
      for (let i = 0; i < 14; i++) {
        const ph = ((t * (up ? 0.45 : 0.25) + i * 0.31 + w.seed * 0.1) % 1 + 1) % 1, dx = -0.8 + (i / 13) * 1.6;
        const xx = x + dx * R * 0.7 + Math.sin(t * 1.1 + i) * R * 0.05, yy = up ? y + R * 1.05 - ph * R * 0.75 : y + R * 0.38 + ph * R * 0.8;
        g.globalAlpha = 0.85 * Math.sin(Math.PI * ph);
        g.beginPath(); g.arc(xx, yy, Math.max(1.2, R / (up ? 30 : 36)), 0, 7); g.fill();
      }
    } else if (w.k === "snow") {
      g.fillStyle = "#fff"; g.strokeStyle = "rgba(0,0,0,.18)"; g.lineWidth = 0.8;
      for (let i = 0; i < 18; i++) {
        const ph = ((t * 0.32 + i * 0.29 + w.seed * 0.1) % 1 + 1) % 1, dx = -0.85 + (i / 17) * 1.7;
        const xx = x + dx * R * 0.75 + Math.sin(t * 1.3 + i) * R * 0.06, yy = y + R * 0.38 + ph * R * 0.8;
        g.globalAlpha = Math.sin(Math.PI * ph);
        g.beginPath(); g.arc(xx, yy, Math.max(1.4, R / 34), 0, 7); g.fill(); g.stroke();
      }
    }
    // the cloud: soft puffs that drift a little
    if (radar) { /* none */ } else if (w.k !== "fog") {
      const flash = (w.k === "storms" || w.k === "hail") && (STILL.matches || ((t + w.seed) % 3.4) < 0.16);
      // one shape (puffs on a flat base), so it reads as a cloud, not a bunch of balls
      const puffs = [[-0.5, 0.02, 0.36], [-0.16, -0.2, 0.48], [0.24, -0.12, 0.42], [0.56, 0.06, 0.3]], shape = new Path2D();
      for (const [i, [px, py, pr]] of puffs.entries()) {
        const cx = x + px * R + Math.sin(t * 0.35 + i * 1.7) * R * 0.03, cy = y + py * R, rr = pr * R;
        shape.moveTo(cx + rr, cy); shape.arc(cx, cy, rr, 0, Math.PI * 2);
      }
      shape.moveTo(x - 0.78 * R, y + 0.05 * R); shape.roundRect ? shape.roundRect(x - 0.84 * R, y - 0.06 * R, 1.68 * R, 0.4 * R, 0.2 * R) : shape.rect(x - 0.84 * R, y - 0.06 * R, 1.68 * R, 0.4 * R);
      const grd = g.createLinearGradient(0, y - 0.7 * R, 0, y + 0.34 * R);
      grd.addColorStop(0, flash ? "#f4f5ff" : "#ffffff"); grd.addColorStop(0.45, flash ? "#d6d9ee" : c); grd.addColorStop(1, flash ? "#b9bdd6" : c);
      g.globalAlpha = a; g.shadowColor = "rgba(0,0,0,.22)"; g.shadowBlur = R * 0.18; g.shadowOffsetY = R * 0.06;
      g.fillStyle = grd; g.fill(shape, "nonzero");
      g.shadowColor = "transparent"; g.shadowBlur = 0; g.shadowOffsetY = 0;
      if (flash) {                                           // lightning
        g.globalAlpha = 1; g.strokeStyle = "#ffd60a"; g.lineWidth = Math.max(2, R / 22); g.lineJoin = "round"; g.shadowColor = "#ffe680"; g.shadowBlur = 10;
        g.beginPath(); g.moveTo(x + 0.08 * R, y + 0.3 * R); g.lineTo(x - 0.1 * R, y + 0.65 * R); g.lineTo(x + 0.08 * R, y + 0.65 * R); g.lineTo(x - 0.06 * R, y + 1.05 * R); g.stroke();
        g.shadowBlur = 0;
      }
      if (w.k === "gales") {                                // gusts curling past
        g.strokeStyle = "#7d8799"; g.lineWidth = Math.max(1.2, R / 32); g.lineCap = "round";
        for (let i = 0; i < 3; i++) {
          const ph = ((t * 0.5 + i / 3) % 1 + 1) % 1, gx = x - R + ph * 2 * R, gy = y + (i - 1) * R * 0.32 + R * 0.35;
          g.globalAlpha = 0.8 * Math.sin(Math.PI * ph);
          g.beginPath(); g.moveTo(gx - R * 0.35, gy); g.lineTo(gx, gy); g.arc(gx, gy - R * 0.1, R * 0.1, Math.PI / 2, -Math.PI, true); g.stroke();
        }
      }
    } else {                                               // fog: low banks sliding past
      g.fillStyle = c;
      for (let i = 0; i < 4; i++) {
        const bw = R * (1.9 - i * 0.2), bx = x - bw / 2 + Math.sin(t * 0.4 + i * 1.9) * R * 0.25, by = y - R * 0.5 + i * R * 0.3;
        g.globalAlpha = a * (0.75 + 0.25 * Math.sin(t * 0.6 + i));
        g.shadowColor = "rgba(0,0,0,.12)"; g.shadowBlur = R * 0.1;
        g.beginPath(); g.roundRect ? g.roundRect(bx, by, bw, R * 0.22, R * 0.11) : g.rect(bx, by, bw, R * 0.22); g.fill();
        g.shadowColor = "transparent"; g.shadowBlur = 0;
      }
    }
    // what it is
    if (R >= 30) {
      g.globalAlpha = 1; g.font = "600 11px -apple-system, system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
      const ly = radar ? y + R * 1.1 : y + R * (w.k === "fog" ? 0.8 : 1.3);
      g.lineWidth = 4; g.strokeStyle = cv._wxHalo || "#fff"; g.strokeText(label, x, ly); g.fillStyle = cv._wxText || "#555"; g.fillText(label, x, ly);
    }
    g.restore();
  }
}
function drawWind(g, cv, ts) {
  for (const { P, cum, L, wind, seed } of cv._winds || []) {
    if (L < 40) continue;
    const v = (18 + Math.min(80, Math.abs(wind)) * 0.9) * Math.sign(wind), gap = 46, n = Math.ceil(L / gap);
    g.save(); g.strokeStyle = cv._windCol[wind > 0 ? 0 : 1]; g.lineCap = "round"; g.lineWidth = 1.6;
    for (const lane of [-11, 11]) for (let k = 0; k < n; k++) {
      const d = ((k * gap + (lane > 0 ? gap / 2 : 0) + seed + (ts / 1000) * v) % L + L) % L;
      let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
      const f = (d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]), ax = P[i][0] - P[i - 1][0], ay = P[i][1] - P[i - 1][1], len = Math.hypot(ax, ay) || 1;
      const ux = ax / len, uy = ay / len, x = P[i - 1][0] + ax * f - uy * lane, y = P[i - 1][1] + ay * f + ux * lane;
      g.globalAlpha = 0.5 * Math.sin(Math.PI * (d / L)) ** 0.5;        // fading in and out at the ends
      g.beginPath(); g.moveTo(x - ux * 7, y - uy * 7); g.lineTo(x + ux * 7, y + uy * 7); g.stroke();
    }
    g.restore();
  }
}
// The pigeon, with its wing at w (1 up, 0 folded down to its back): the wing's
// points are drawn toward the body line, so it flaps.
const WING = [[12.6, 3.6], [14.4, 3], [15.6, 4], [15.4, 5.8]];
const birdAt = (w) => {
  const y = (v) => (10.4 - (10.4 - v) * w).toFixed(2), [a, b, c, d] = WING;
  return new Path2D(`M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L${a[0]} ${y(a[1])}C${b[0]} ${y(b[1])} ${c[0]} ${y(c[1])} ${d[0]} ${y(d[1])}L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z`);
};
let cheerFx = null;                          // { id, at }: a pigeon just cheered on, for its gust on the map
// Draw the pigeons over the saved map: flapping in cruise, faster taking off
// and landing, folded once landed; tilted the way they're heading.
function drawBirds(cv, ts, xf) {
  const g = cv.getContext("2d"), dpr = cv._dpr || window.devicePixelRatio || 1;
  if (!cv._base || !cv._birds) return;
  if (xf) {
    // the last full picture, moved and scaled to where the map is now
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = cv._seaCol || "#000"; g.fillRect(0, 0, cv.width, cv.height);
    g.imageSmoothingEnabled = true; g.setTransform(xf.a, 0, 0, xf.a, xf.bx * dpr, xf.by * dpr); g.drawImage(cv._base, 0, 0);
  } else {
    g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(cv._base, 0, 0);
    if (windOn() && S.windGrid && !mapMoving() && stepWind(cv, ts)) g.drawImage(cv._trail, 0, 0);     // (the wind waits while the map moves)
  }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawRadar(g, cv, ts, xf);
  drawWx(g, cv, ts, xf);
  if (!xf) drawWind(g, cv, STILL.matches ? 0 : ts);
  const tilts = cv._tilt || (cv._tilt = new Map()), still = STILL.matches;
  for (const { r, at: [px0, py0], dx, dy, phase, color } of cv._birds) {
    const px = xf ? xf.a * px0 + xf.bx : px0, py = xf ? xf.a * py0 + xf.by : py0;
    const flying = phase === "up" || phase === "cruise" || phase === "down", hz = phase === "cruise" ? 2.2 : 5;
    // landing: its wings come up as it touches down, then fold over a third of a second (none of it snaps)
    const since = r.lost ? Infinity : now() - r.deliverAt, flap = 0.62 + 0.38 * Math.sin((ts / 1000) * hz * 2 * Math.PI + (r.deliverAt % 997)), near = Math.min(1, Math.max(0, 1 + since / 350));
    const w = still ? (flying ? 1 : 0.45) : flying ? flap + (1 - flap) * near : phase === "landed" && since < 350 ? 0.45 + 0.55 * (1 - Math.max(0, since) / 350) ** 2 : 0.45;
    const bob = flying && !still ? Math.sin((ts / 1000) * hz * 2 * Math.PI + (r.deliverAt % 997) - 1.2) * 1.2 * (1 - near) : 0;
    // the icon faces left: it turns to the way it's flying, and noses up or down with its course, easing into each
    // (rather than snapping at every point of its route)
    const flip0 = dx > 0 ? -1 : 1, tilt0 = flying ? Math.max(-0.35, Math.min(0.35, Math.atan2(dy, Math.abs(dx) || 1))) * -flip0 : 0;
    const key = `${r.id}|${r.to || ""}`, was = tilts.get(key), k = was && !still ? 1 - Math.exp(-Math.max(0, ts - was.t) / 90) : 1;
    const tilt = was ? was.v + (tilt0 - was.v) * k : tilt0, flip = was ? was.f + (flip0 - was.f) * k : flip0;
    tilts.set(key, { v: tilt, f: flip, t: ts });
    // just landed: a ring spreads from where it came down
    if (phase === "landed" && since >= 0 && since < 900 && !still) {
      const e = 1 - (1 - since / 900) ** 3;
      g.save(); g.globalAlpha = 0.5 * (1 - e); g.strokeStyle = color; g.lineWidth = 2.5; g.beginPath(); g.arc(px, py, 8 + 28 * e, 0, 7); g.stroke(); g.restore();
    }
    // at sea on a ship: the ship under it, rocking a little
    if (phase === "sail") {
      const rock = STILL.matches ? 0 : Math.sin(ts / 700 + (r.deliverAt % 97)) * 0.06;
      g.save(); g.translate(px, py + 13); g.rotate(rock); g.fillStyle = "#3a3f4a"; g.strokeStyle = "#fff"; g.lineWidth = 2; g.lineJoin = "round";
      g.beginPath(); g.moveTo(-17, -4); g.lineTo(17, -4); g.lineTo(12, 5); g.lineTo(-12, 5); g.closePath(); g.stroke(); g.fill();
      g.fillStyle = "#e14b3b"; g.fillRect(-9, -9, 6, 5); g.fillStyle = "#3d9bff"; g.fillRect(-2, -9, 6, 5); g.fillStyle = "#f2b33d"; g.fillRect(5, -9, 6, 5);   // (its containers)
      g.restore();
    }
    g.save(); g.translate(px, py + bob - (phase === "sail" ? 10 : 0)); g.rotate(-tilt); g.scale(1.6 * flip, 1.6); g.translate(-12, -11);
    const bird = birdAt(w);
    g.lineWidth = r.skin && SKINS[r.skin] ? 4 : 3; g.strokeStyle = SKINS[r.skin]?.ring || "#fff"; g.stroke(bird); g.fillStyle = color; g.fill(bird);   // the pigeon in its colour (grey where it was lost)
    g.restore();
    // just cheered on: a gust of tailwind streams past it
    const fx = cheerFx && cheerFx.id === S.sheet?.id ? (ts - cheerFx.at) / 1600 : 1;
    if (flying && fx >= 0 && fx < 1 && !STILL.matches) {
      const n = Math.hypot(dx, dy) || 1, ux = dx / n, uy = dy / n;
      g.save(); g.lineCap = "round"; g.lineWidth = 2.5;
      for (let k = -1; k <= 1; k++) {
        const o = ((fx * 3 + (k + 1) * 0.33) % 1), back = 16 + o * 34, side = k * 9;
        g.strokeStyle = `rgba(255,159,10,${(0.85 * (1 - fx) * (1 - o)).toFixed(3)})`;
        g.beginPath(); g.moveTo(px - ux * back - uy * side, py - uy * back + ux * side); g.lineTo(px - ux * (back + 16) - uy * side, py - uy * (back + 16) + ux * side); g.stroke();
      }
      g.restore();
    }
  }
}
// A near miss on the map: a little four-pointed spark
function sparkAt(g, x, y, edge, fill) {
  g.save(); g.translate(x, y);
  const star = (r) => { g.beginPath(); for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4 - Math.PI / 2, rr = i % 2 ? r * 0.38 : r; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); };
  g.lineJoin = "round"; g.lineWidth = 4; g.strokeStyle = edge; star(9); g.stroke(); g.fillStyle = fill; star(9); g.fill();
  g.restore();
}
/* ---------- the globe: long flights curve round the Earth ---------- */
const GLOBE_KM = 3000;
const globeOn = (m) => S.sheet?.globe ?? Math.max(0, ...routesOf(m).filter((r) => !r.here).map((r) => r.km || 0)) >= GLOBE_KM;
const latOf = (my) => 2 * Math.atan(Math.exp(my / R2D)) * R2D - 90;
// the middle of everything on the map, as a direction from the centre of the Earth
function globeFit(m) {
  let x = 0, y = 0, z = 0;
  for (const r of routesOf(m)) for (const p of routePts(r)) { const a = latOf(p.y) * Math.PI / 180, b = p.x * Math.PI / 180; x += Math.cos(a) * Math.cos(b); y += Math.cos(a) * Math.sin(b); z += Math.sin(a); }
  // looked at from a little below (towards the equator), so a long route arcs over the curve of the Earth
  const lat = Math.atan2(z, Math.hypot(x, y)) * R2D;
  return { lat: lat - Math.sign(lat || 1) * Math.min(24, Math.abs(lat) + 8), lon: Math.atan2(y, x) * R2D, s: 1, mid: lat };
}
function globeFrame(cv, m, cardH) {
  const W = cv.clientWidth, H = cv.clientHeight, usableH = Math.max(80, H - cardH - 30);
  const fit = globeFit(m), v = S.sheet?.gview || fit;
  return { W, H, cx: W / 2, cy: 20 + usableH / 2, R: Math.min(W * 0.48, usableH * 0.47) * v.s, v, fit };
}
function moveGlobe(cv, z, dx, dy) {
  const { R, v, fit } = globeFrame(cv, cv._m, cv._cardH);
  const s2 = Math.max(1, Math.min(10, v.s * z));
  // zooming in leans towards the route itself (the fit looks at it from a little below)
  const lean = z > 1 && s2 > v.s ? 0.6 * (1 - v.s / s2) : 0, dLon = ((fit.lon - v.lon + 540) % 360) - 180;
  S.sheet.gview = { lon: v.lon - (dx / R) * R2D + dLon * lean, lat: Math.max(-80, Math.min(80, v.lat + (dy / R) * R2D + (fit.mid - v.lat) * lean)), s: s2 };
  nudgeMap(cv);
}
function drawGlobe(cv, m, cardH, fast) {
  const { W, H, cx, cy, R, v } = globeFrame(cv, m, cardH); if (!W || !H) return;
  // a little spin as it opens: drawn the quick way while it turns (as it is while dragged), sharp once it stops
  if (cv._spin == null || cv._spin === 0) cv._spin = STILL.matches || S.sheet?.gview ? -1 : performance.now();
  const spun = cv._spin > 0 ? Math.min(1, (performance.now() - cv._spin) / 1100) : 1;
  if (spun < 1 && !cv._dprFix) fast = true;
  // (and the sharp picture after the quick ones, with its night, mountains and names, fades in over them)
  if (fast) cv._wasFast = true; else if (cv._wasFast) { cv._wasFast = false; mapFadeFrom(cv); }
  const dpr = cv._dprFix || (fast ? Math.min(1, window.devicePixelRatio || 1) : window.devicePixelRatio || 1);     // fewer pixels while it turns
  cv._dpr = dpr;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const col = (n) => cssVar(cv, n), rad = Math.PI / 180;
  let lon0 = v.lon; const lat0 = v.lat;
  if (cv._spin > 0) { lon0 -= 40 * (1 - spun) ** 3; if (spun < 1) requestAnimationFrame(redrawMap); else cv._spin = -1; }
  const s0 = Math.sin(lat0 * rad), c0 = Math.cos(lat0 * rad);
  // orthographic: [x, y, in sight]; out of sight points go to the rim
  const proj = (lon, lat) => {
    const f = lat * rad, d = (lon - lon0) * rad, cf = Math.cos(f), cd = Math.cos(d);
    let x = cf * Math.sin(d), y = c0 * Math.sin(f) - s0 * cf * cd; const up = s0 * Math.sin(f) + c0 * cf * cd >= 0;
    if (!up) { const n = Math.hypot(x, y) || 1; x /= n; y /= n; }
    return [cx + R * x, cy - R * y, up];
  };
  const pt = (lon, lat) => { const p = proj(lon, lat); return p[2] ? p : null; };
  const k = R * rad;                                                   // pixels per degree at the middle
  g.fillStyle = col("--bg") || col("--sea"); g.fillRect(0, 0, W, H);
  // the air around it
  const halo = g.createRadialGradient(cx, cy, R * 0.98, cx, cy, R + 18); halo.addColorStop(0, "rgba(90,160,255,.35)"); halo.addColorStop(1, "rgba(90,160,255,0)");
  g.fillStyle = halo; g.beginPath(); g.arc(cx, cy, R + 18, 0, 7); g.fill();
  g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 7); g.clip();
  g.fillStyle = col("--sea"); g.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  // graticule
  g.strokeStyle = col("--grid"); g.lineWidth = 1;
  const curve = (pts) => { g.beginPath(); let on = false; for (const [lo, la] of pts) { const p = proj(lo, la); if (!p[2]) { on = false; continue; } on ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); on = true; } g.stroke(); };
  for (let lo = -180; lo < 180; lo += 30) curve(Array.from({ length: 61 }, (_, i) => [lo, -90 + i * 3]));
  for (let la = -60; la <= 60; la += 30) curve(Array.from({ length: 121 }, (_, i) => [-180 + i * 3, la]));
  // land (finer once it's big), with the coast's shallow water, and the mountains
  const want = R > 700 && !fast ? "50m" : "110m", data = world(want) || world("110m");
  g.beginPath();
  for (const sh of data.land) {
    const f = sh.f, lat = sh.lat || (sh.lat = Float32Array.from({ length: f.length / 2 }, (_, i) => latOf(f[i * 2 + 1])));
    let any = false; const P = [];
    for (let i = 0; i < f.length; i += 2) { const p = proj(f[i], lat[i / 2]); if (p[2]) any = true; P.push(p); }
    if (!any) continue;
    let lx = 1e9, ly = 1e9;
    P.forEach(([x, y], i) => { if (i && Math.abs(x - lx) + Math.abs(y - ly) < 0.7 && i < P.length - 1) return; i ? g.lineTo(x, y) : g.moveTo(x, y); lx = x; ly = y; });
    g.closePath();
  }
  if (!fast) {
    g.save(); g.lineJoin = "round"; g.strokeStyle = col("--shelf");
    for (const [w, a] of [[Math.min(16, 3 + k * 0.9), 0.5], [Math.min(8, 2 + k * 0.45), 1]]) { g.globalAlpha = a; g.lineWidth = w; g.stroke(); }
    g.restore();
  }
  g.fillStyle = col("--land"); g.fill("evenodd");
  if (!fast) { g.save(); g.clip("evenodd"); drawRelief(g, [pt], k, col("--relief-hi"), col("--relief-lo")); g.restore(); }
  g.strokeStyle = col("--land-edge"); g.lineWidth = 0.8; g.stroke();
  // night, on the sphere (left out while it's turning)
  const sun = sunAt(), sd = Math.sin(sun.lat * rad), sdc = Math.cos(sun.lat * rad);
  if (!fast) {
  const x0 = Math.floor(cx - R), y0 = Math.floor(cy - R), cw = Math.ceil((2 * R) / NIGHT_STEP) + 1;
  const off = drawGlobe.c || (drawGlobe.c = document.createElement("canvas"));
  if (off.width !== cw || off.height !== cw) { off.width = cw; off.height = cw; }
  const oc = off.getContext("2d"), img = oc.createImageData(cw, cw), px = img.data;
  const dark = mapInk ? mapInk === "dark" : document.documentElement.getAttribute("data-theme") === "dark" || (document.documentElement.getAttribute("data-theme") === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  const [nr, ng, nb, top] = dark ? [0, 0, 0, 0.42] : [12, 26, 64, 0.26];
  for (let j = 0; j < cw; j++) for (let i = 0; i < cw; i++) {
    const x = (x0 + i * NIGHT_STEP - cx) / R, y = -(y0 + j * NIGHT_STEP - cy) / R, r2 = x * x + y * y; if (r2 > 1.02) continue;
    const z = Math.sqrt(Math.max(0, 1 - r2)), lat = Math.asin(z * s0 + y * c0), lon = lon0 * rad + Math.atan2(x, z * c0 - y * s0);
    const alt = Math.asin(Math.sin(lat) * sd + Math.cos(lat) * sdc * Math.cos(lon - sun.lon * rad)) / rad;
    const n = alt >= 0 ? 0 : alt <= -12 ? 1 : ((q) => q * q * (3 - 2 * q))(-alt / 12), o = (j * cw + i) * 4;
    px[o] = nr; px[o + 1] = ng; px[o + 2] = nb; px[o + 3] = Math.round(255 * top * n);
  }
  oc.putImageData(img, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(off, x0, y0, cw * NIGHT_STEP, cw * NIGHT_STEP);
  }
  // light from the top left, shadow at the rim: it reads as a ball
  const shade = g.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
  shade.addColorStop(0, "rgba(255,255,255,.10)"); shade.addColorStop(0.7, "rgba(255,255,255,0)"); shade.addColorStop(1, "rgba(0,0,0,.18)");
  g.fillStyle = shade; g.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  // the sun where it's overhead
  const sp = pt(sun.lon, sun.lat), suns = [];
  if (sp) {
    suns.push([sp[0] - 15, sp[1] - 15, sp[0] + 15, sp[1] + 15]);
    g.save(); g.translate(sp[0], sp[1]); const gl = g.createRadialGradient(0, 0, 2, 0, 0, 22); gl.addColorStop(0, "rgba(255,204,0,.55)"); gl.addColorStop(1, "rgba(255,204,0,0)");
    g.fillStyle = gl; g.beginPath(); g.arc(0, 0, 22, 0, 7); g.fill(); g.fillStyle = "#ffcc00"; g.strokeStyle = "#ff9f0a"; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, 6, 0, 7); g.fill(); g.stroke();
    g.strokeStyle = "#ffb800"; g.lineWidth = 1.6; g.lineCap = "round";
    for (let a = 0; a < 8; a++) { const c = Math.cos(a * Math.PI / 4), s2 = Math.sin(a * Math.PI / 4); g.beginPath(); g.moveTo(c * 9, s2 * 9); g.lineTo(c * 12.5, s2 * 12.5); g.stroke(); }
    g.restore();
  }
  // the other ways (on The Way), faint; then the routes: solid where flown, dashed ahead; hidden round the back
  cv._altHits = drawAlts(g, m, (p) => proj(p.x, latOf(p.y)), W, H);
  const tracks = routesOf(m).map((r) => { const rp = routePts(r); const PP = rp.map((p) => proj(p.x, latOf(p.y))); return { r, rp, P: PP.map(([x, y]) => [x, y]), up: PP.map((p) => p[2]) }; });
  const seg = (P, up, a, b) => { g.beginPath(); let on = false; for (let i = a; i <= b; i++) { if (!up[i]) { on = false; continue; } on ? g.lineTo(P[i][0], P[i][1]) : g.moveTo(P[i][0], P[i][1]); on = true; } g.stroke(); };
  const lw = tracks.length > 1 ? 3 : 3.5, tint = col("--tint");
  g.lineCap = "round"; g.lineJoin = "round";
  for (const { r, rp, P, up } of tracks) {
    if (r.here) continue;
    const ft = flightAt(r, r.lost ? r.lostAt : now()).t, i = rp.findIndex((p) => p.t >= ft), cut = i < 0 ? P.length - 1 : Math.max(0, i - 1);
    if (i >= 0) { g.globalAlpha = r.lost ? 0.3 : 0.6; g.strokeStyle = tint; g.lineWidth = lw - 0.5; g.setLineDash([9, 8]); seg(P, up, cut, P.length - 1); }
    g.globalAlpha = 1; g.setLineDash([]);
    if (cut > 0) { g.lineWidth = lw + 1.5; g.strokeStyle = col("--cell"); seg(P, up, 0, cut); g.lineWidth = lw; g.strokeStyle = tint; seg(P, up, 0, cut); }
  }
  g.globalAlpha = 1;
  const ports = drawVoyages(g, tracks, col, lw, (P, a, b, up) => seg(P, up, a, b));
  for (const { r } of tracks) for (const n of r.near || []) { const p = proj(n.lon, n.lat); if (p[2]) sparkAt(g, p[0], p[1], col("--cell"), col("--orange")); }
  g.restore();                                                         // (out of the globe's clip)
  // ends and labels
  const birds = tracks.filter(({ r }) => !r.here).map(({ r, rp, P, up }) => { const ft = flightAt(r, r.lost ? r.lostAt : now()).t, i = rp.findIndex((p) => p.t >= ft); return { r, rp, P, up, vis: up[i < 0 ? up.length - 1 : i], ...pigeonOn(P, rp, ft) }; }).filter((b) => b.vis);
  const taken = [...birds.map(({ at: [px, py] }) => [px - 24, py - 20, px + 24, py + 20]), [0, H - cardH, W, H], ...suns];
  const ctl = $(".mapctl", $layer);
  if (ctl) { const r = ctl.getBoundingClientRect(), c = cv.getBoundingClientRect(); taken.push([r.left - c.left - 4, r.top - c.top - 4, r.right - c.left + 4, r.bottom - c.top + 4]); }
  const free = (b) => b[0] >= 2 && b[2] <= W - 2 && b[1] >= 2 && b[3] <= H - 2 && !taken.some((t) => b[0] < t[2] && b[2] > t[0] && b[1] < t[3] && b[3] > t[1]);
  const text = (str, x, y, color) => { g.lineWidth = 4; g.strokeStyle = col("--land"); g.strokeText(str, x, y); g.fillStyle = color; g.fillText(str, x, y); };
  g.textBaseline = "middle"; g.textAlign = "left"; g.lineJoin = "round"; g.font = "600 13px -apple-system, system-ui, sans-serif";
  const done = new Set();
  for (const { r, P, up } of tracks) for (const [i, j, name] of [[0, 4, r.fromPlace ?? m.fromPlace], [P.length - 1, P.length - 5, r.toPlace]]) {
    if (!up[i]) continue;
    const [x, y] = P[i], key = `${Math.round(x)},${Math.round(y)}`; if (done.has(key)) continue; done.add(key);
    g.fillStyle = col("--cell"); g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); g.fillStyle = col("--tint"); g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
    taken.push([x - 9, y - 9, x + 9, y + 9]);
    if (!name) continue;
    const w = g.measureText(name).width, ly = y + ((P[Math.max(0, j)] || P[i])[1] <= y ? 28 : -28), lx = Math.min(W - 8 - w, Math.max(8, x - w / 2)), box = [lx - 3, ly - 10, lx + w + 3, ly + 10];
    if (!free(box)) continue; taken.push(box); text(name, lx, ly, col("--label"));
  }
  if (!fast) portLabels(g, ports, free, taken, text, col);
  cv._ports = ports.filter((p) => p.vis).map((p) => p.name);
  if (k >= 2.2 && !fast) {
    g.save(); g.font = "600 10px -apple-system, system-ui, sans-serif"; g.textAlign = "center"; g.fillStyle = col("--label-3");
    const tier = k >= 9 ? 3 : k >= 4.5 ? 2 : 1;
    for (const [name, lat, lon, t] of COUNTRIES) {
      if (t > tier) continue; const p = pt(lon, lat); if (!p) continue;
      const label = name.toUpperCase().split("").join("\u200a"), w = g.measureText(label).width, box = [p[0] - w / 2 - 3, p[1] - 7, p[0] + w / 2 + 3, p[1] + 7];
      if (Math.hypot(p[0] - cx, p[1] - cy) > R * 0.92 || !free(box)) continue; taken.push(box); g.fillText(label, p[0], p[1]);
    }
    g.restore();
  }
  if (k >= 4 && !fast) {
    g.font = "500 11px -apple-system, system-ui, sans-serif"; const c2 = col("--label-2");
    for (const [name, lat, lon] of PLACES) {
      if (done.has(name)) continue; const p = pt(lon, lat); if (!p || Math.hypot(p[0] - cx, p[1] - cy) > R * 0.95) continue;
      const w = g.measureText(name).width, box = [p[0] - 4, p[1] - 8, p[0] + 8 + w, p[1] + 8]; if (!free(box)) continue;
      taken.push(box); g.fillStyle = c2; g.beginPath(); g.arc(p[0], p[1], 2.5, 0, 7); g.fill(); text(name, p[0] + 6, p[1], c2);
    }
  }
  // as the flat map: keep it without its pigeons, then draw them (and the wind) on top
  const base = cv._base || (cv._base = document.createElement("canvas"));
  if (base.width !== cv.width || base.height !== cv.height) { base.width = cv.width; base.height = cv.height; }
  base.getContext("2d").drawImage(cv, 0, 0);
  cv._birds = birds.map((b) => ({ ...b, phase: birdPhase(b.r), color: b.r.lost ? col("--label-3") : col("--p-" + kindOf(b.r)) }));
  cv._snap = { globe: true, lon: lon0, lat: lat0, R }; cv._seaCol = col("--bg") || col("--sea");
  cv._fwd = (lon, lat) => { const p = proj(lon, lat); return p[2] ? [p[0], p[1]] : null; };
  cv._inv = (x, y) => {
    const a = (x - cx) / R, b = -(y - cy) / R, r2 = a * a + b * b; if (r2 > 1) return null;
    const z = Math.sqrt(1 - r2); return [lon0 + Math.atan2(a, z * c0 - b * s0) / rad, Math.asin(z * s0 + b * c0) / rad];
  };
  cv._kArc = () => R * rad;
  cv._viewKey = `g${lon0.toFixed(3)},${lat0.toFixed(3)},${R.toFixed(2)},${W},${H}`;
  cv._area = (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= R * R * 0.995 && x >= 0 && x <= W && y >= 0 && y <= H;
  if (!fast) windEnsure(cv);
  cv._winds = windOn() ? [] : tracks.filter(({ r, up }) => !r.here && !r.lost && r.wind != null && Math.abs(r.wind) >= 3 && now() < r.deliverAt && up.every(Boolean)).map(({ r, P }) => {
    const cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    return { P, cum, L: cum[cum.length - 1], wind: r.wind, seed: r.deliverAt % 1000 };
  });
  cv._windCol = [col("--green") || "#34c759", col("--orange") || "#ff9500"];
  cv._wx = wxCells(tracks.map(({ r }) => r)); cv._wxText = col("--label-2"); cv._wxHalo = col("--land");
  if (!fast) { cv._fullAt = performance.now(); cv._sig = routesSig(m); cv._sigM = m; cv._stale = cv._dirty = false; }
  drawBirds(cv, performance.now());
  $(".mapctl", $layer)?.classList.toggle("moved", !!S.sheet?.gview && !cv._fitting);
}
/* ---------- moving the map smoothly ---------- */
let mapMotionUntil = 0, mapSettle = 0, mapFastReq = 0, mapGlide = 0;
const mapMoving = () => performance.now() < mapMotionUntil;
// Something moved it: quick frames now, the full map once it's been still a moment.
function nudgeMap(cv) {
  mapMotionUntil = performance.now() + 140; cv._dirty = true;      // (the picture kept is for where the map was: until it's drawn again, only moved and scaled)
  if (!mapFastReq) mapFastReq = requestAnimationFrame((ts) => { mapFastReq = 0; cv._ffTs = ts; if (S.sheet?.type === "map") fastFrame(cv); });
  clearTimeout(mapSettle);
  mapSettle = setTimeout(function settle() { if (mapMoving()) { mapSettle = setTimeout(settle, 60); return; } redrawMap(); }, 150);
}
function fastFrame(cv) {
  if (!cv._base || !cv._m) return;
  if (globeOn(cv._m)) return drawGlobe(cv, cv._m, cv._cardH, true);
  if (cv._snap?.globe) return redrawMapNow(cv);
  const { W, sy0, view } = mapFrame(cv, cv._m, cv._cardH), ox = W / 2 - view.cx * view.k, oy = sy0 + view.cy * view.k, s0 = cv._snap;
  const a = view.k / s0.k;
  if (a > 3 || a < 0.33) return redrawMapNow(cv);           // too far from the last full picture: draw it again
  cv._wasFast = true; placeBirds(cv, cv._m);
  drawBirds(cv, performance.now(), { a, bx: ox - s0.ox * a, by: oy - s0.oy * a });
}
function redrawMapNow(cv) { const until = mapMotionUntil; mapMotionUntil = 0; cv._wasFast = false; drawMap(cv, cv._m, cv._cardH); mapMotionUntil = until; }
// what the routes on a map are (where, and when along them, from when each set off), to tell whether only its pigeons
// have moved since it was drawn
const routesSig = (m) => routesOf(m).map((r) => `${r.id}|${r.to || ""}|${r.deliverAt - r.sentAt}|${r.lost ? r.lostAt - r.sentAt : ""}|${r.recalled ? 1 : 0}|${r.route}|${(r.legs || []).map((l) => `${l[0]},${l[1]},${l[2] - r.sentAt},${l[3] || ""}`).join(" ")}`).join(";");
// Between full drawings of the map, the pigeons alone move on: each is put where it is now along its route as it was
// drawn (its points kept with it), with no coast, night or names drawn again. false: more than that has changed (a
// route, a take-off, a rest or a landing, one gone round the back of the globe), so the whole map is wanted
// (the pigeons are moved on all the same, for a quick picture meanwhile)
function placeBirds(cv, m) {
  const bs = cv._birds; if (!cv._base || !bs || !m) return false;
  if (m !== cv._sigM) { if (routesSig(m) !== cv._sig) cv._stale = true; else cv._sigM = m; }
  const t = now();
  for (const b of bs) {
    const r = b.r, ft = flightAt(r, r.lost ? r.lostAt : t).t, ph = birdPhase(r);
    if (ph !== b.phase) { b.phase = ph; cv._stale = true; }
    if (b.up) { const i = b.rp.findIndex((p) => p.t >= ft); if (!b.up[i < 0 ? b.up.length - 1 : i]) cv._stale = true; }
    Object.assign(b, pigeonOn(b.P, b.rp, ft));
  }
  return !cv._stale;                                                // (until the whole map's been drawn again)
}
// A map's regular redraw (each second, or each frame while a pigeon visibly moves): just its pigeons while nothing
// else has changed, and the whole map at most every `every` ms (so the line flown keeps up with them)
function mapTick(cv, m, H, every = 5000) {
  if (cv._cardH === H && !cv._dirty && !mapMoving() && performance.now() - (cv._fullAt || 0) < every && placeBirds(cv, m)) { cv._m = m; return drawBirds(cv, performance.now()); }
  drawMap(cv, m, H);
}
// A picture of a canvas as it is now, laid over it (in a closed shadow root, so it's never taken for the canvas itself)
function canvasCopy(cv, cls) {
  const c = Object.assign(document.createElement("canvas"), { width: cv.width, height: cv.height });
  c.getContext("2d").drawImage(cv, 0, 0); Object.assign(c.style, { display: "block", width: "100%", height: "100%" });
  const host = document.createElement("div"); host.className = cls; host.inert = true; host.setAttribute("aria-hidden", "true");
  host.attachShadow({ mode: "closed" }).append(c); cv.after(host);
  return host;
}
// The map as it was, laid over it as a picture that fades away: the globe turning into the flat map (shrinking or
// growing as it goes), or the quick picture drawn while it moved, with the sharp one coming through it
function mapFadeFrom(cv, to) {
  if (STILL.matches || !cv.width || !cv.isConnected || !cv.classList.contains("map")) return;
  for (const x of $layer.querySelectorAll(".mapghost")) x.remove();
  const g = canvasCopy(cv, "mapghost");
  const a = g.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: to || "none" }], { duration: to ? 380 : 240, easing: "cubic-bezier(.32,.72,0,1)", fill: "forwards" });
  a.onfinish = a.oncancel = () => g.remove();
}
// Glide: run step(e, prev) with e easing 0 → 1 over ms (zoom buttons, double tap, fit, flicks)
function glideMap(step, ms = 300) {
  cancelAnimationFrame(mapGlide);
  if (STILL.matches) { step(1, 0); return; }
  const t0 = performance.now(); let prev = 0;
  const run = (t) => { const p = Math.min(1, (t - t0) / ms), e = 1 - (1 - p) ** 3; step(e, prev); prev = e; if (p < 1) mapGlide = requestAnimationFrame(run); };
  mapGlide = requestAnimationFrame(run);
}
function zoomMapBy(cv, factor, sx, sy) { const L = Math.log(factor); glideMap((e, prev) => moveMap(cv, Math.exp(L * (e - prev)), sx, sy), 280); }
// Back to the whole route, gliding there. Its button goes as it's tapped (cv._fitting: not back with the drawings on
// the way; a finger or a zoom on the way brings it back), and the glide ends with the sheet it was for.
function fitMap(cv) {
  const sh = S.sheet, go = (set) => { cv._fitting = true; $(".mapctl", $layer)?.classList.remove("moved");
    glideMap((e) => { if (S.sheet !== sh) return; if (e >= 1) cv._fitting = false; set(e); e >= 1 ? redrawMap() : nudgeMap(cv); }, 420); };
  if (globeOn(cv._m)) {
    const { v, fit } = globeFrame(cv, cv._m, cv._cardH); if (!sh.gview) return;
    const dLon = ((fit.lon - v.lon + 540) % 360) - 180;
    return go((e) => { sh.gview = e >= 1 ? null : { lon: v.lon + dLon * e, lat: v.lat + (fit.lat - v.lat) * e, s: Math.exp(Math.log(v.s) + (Math.log(fit.s) - Math.log(v.s)) * e) }; });
  }
  const { view, fit } = mapFrame(cv, cv._m, cv._cardH); if (!sh.view) return;
  go((e) => { sh.view = e >= 1 ? null : { cx: view.cx + (fit.cx - view.cx) * e, cy: view.cy + (fit.cy - view.cy) * e, k: Math.exp(Math.log(view.k) + (Math.log(fit.k) - Math.log(view.k)) * e) }; });
}
let mapFrameReq = 0;
function redrawMap() {
  if (mapFrameReq) return;
  mapFrameReq = requestAnimationFrame(() => { mapFrameReq = 0; const cv = $(".map", $layer); if (cv && cv._m && S.sheet?.type === "map") drawMap(cv, cv._m, cv._cardH); });
}
// Move the map: zoom by `z` about screen point (sx, sy), then pan by (dx, dy) pixels.
function moveMap(cv, z, sx, sy, dx = 0, dy = 0) {
  if (!cv._m || S.sheet?.type !== "map") return;
  cv._fitting = false;
  if (globeOn(cv._m)) return moveGlobe(cv, z, dx, dy);
  const { W, sy0, fit, view, kMin, pts } = mapFrame(cv, cv._m, cv._cardH);
  const k = Math.max(kMin, Math.min(MAP_KMAX, view.k * z));
  const wx = view.cx + (sx - W / 2) / view.k, wy = view.cy - (sy - sy0) / view.k;
  let cx = wx - (sx - W / 2) / k - dx / k, cy = wy + (sy - sy0) / k + dy / k;
  const mid = (pts[0].x + pts[pts.length - 1].x) / 2, ymax = mercY(MERC_MAX) - (sy0 / k) * 0.5;
  cx = Math.max(mid - 300, Math.min(mid + 300, cx));
  cy = Math.max(-ymax, Math.min(ymax, cy));
  S.sheet.view = { cx, cy, k };
  if (Math.abs(k - fit.k) < 1e-6 && Math.abs(cx - fit.cx) < 1e-6 && Math.abs(cy - fit.cy) < 1e-6) S.sheet.view = null;
  nudgeMap(cv);
}
// Drag to pan, pinch or scroll to zoom, double-tap to zoom in.
function mapGestures(cv) {
  const pts = new Map(); let last = null, lastTap = 0, trail = [];
  const local = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const state = () => { const a = [...pts.values()]; if (a.length === 1) return { x: a[0][0], y: a[0][1], d: 0 };
    return { x: (a[0][0] + a[1][0]) / 2, y: (a[0][1] + a[1][1]) / 2, d: Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]) }; };
  let down = null;
  // the map moves itself (pointer events): a finger on it never scrolls or zooms the page
  // (iPhone ignores touch-action: none, so say it with the touches themselves)
  cv.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
  cv.addEventListener("pointerdown", (e) => {
    cancelAnimationFrame(mapGlide); cv._fitting = false;           // a finger stops a glide or a flick
    for (const el of $layer.querySelectorAll(".windtip, .birdtip")) tipAway(el);
    cv.setPointerCapture?.(e.pointerId); pts.set(e.pointerId, local(e)); last = state(); trail = [];
    down = pts.size === 1 ? { at: performance.now(), p: local(e), moved: 0 } : null;
    if (pts.size === 1) { const t = performance.now(); if (t - lastTap < 280) { const [x, y] = local(e); zoomMapBy(cv, 2, x, y); lastTap = 0; } else lastTap = t; }
  });
  cv.addEventListener("pointermove", (e) => {
    if (!pts.has(e.pointerId)) return;
    // every point the finger passed through since the last frame (smoother on fast drags)
    const evs = e.getCoalescedEvents?.(), r = cv.getBoundingClientRect(), p = evs?.length ? evs[evs.length - 1] : e;
    pts.set(e.pointerId, [p.clientX - r.left, p.clientY - r.top]); const s = state();
    if (last && pts.size <= 2) {
      const z = pts.size === 2 && last.d && s.d ? s.d / last.d : 1;
      moveMap(cv, z, last.x, last.y, s.x - last.x, s.y - last.y);
      if (Math.abs(s.x - last.x) + Math.abs(s.y - last.y) > 6) lastTap = 0;
      if (down) down.moved += Math.abs(s.x - last.x) + Math.abs(s.y - last.y);
      if (pts.size === 1) { const t = e.timeStamp; trail.push([t, s.x, s.y]); while (trail.length > 2 && t - trail[0][0] > 90) trail.shift(); } else trail = [];
    }
    last = s;
  });
  const up = (e) => {
    pts.delete(e.pointerId); last = pts.size ? state() : null;
    if (pts.size) { trail = []; return; }
    // a flick: it carries on, slowing down
    const t = e.timeStamp, [t0, x0, y0] = trail[0] || [], [t1, x1, y1] = trail[trail.length - 1] || [];
    if (trail.length > 1 && t - t1 < 100 && t1 > t0) {
      let vx = (x1 - x0) / (t1 - t0), vy = (y1 - y0) / (t1 - t0);
      if (Math.hypot(vx, vy) > 0.25 && !STILL.matches) {
        let prevT = 0; cancelAnimationFrame(mapGlide);
        const run = (now2) => {
          const dt = prevT ? Math.min(40, Math.max(0, now2 - prevT)) : 16; prevT = now2;
          const f = Math.exp(-dt / 280); vx *= f; vy *= f;
          moveMap(cv, 1, 0, 0, vx * dt, vy * dt);
          if (Math.hypot(vx, vy) > 0.02) mapGlide = requestAnimationFrame(run);
        };
        mapGlide = requestAnimationFrame(run);
      }
    }
    trail = [];
    // a quick tap that didn't move (and isn't the first half of a double tap): the pigeon, or the wind there
    if (down && down.moved < 8 && performance.now() - down.at < 300) {
      const d = down, tap = lastTap;
      // one of the other ways' names (The Way): that way instead
      const alt = (cv._altHits || []).find((h) => d.p[0] >= h.x0 && d.p[0] <= h.x1 && d.p[1] >= h.y0 && d.p[1] <= h.y1);
      if (alt) { $(`.mapcard [data-act=routeset][data-id="${alt.style}"]`, $layer)?.click(); down = null; return; }
      const bird = (cv._birds || []).find((b) => Math.hypot(b.at[0] - d.p[0], b.at[1] - d.p[1]) < 30);
      setTimeout(() => { if (lastTap !== tap || !tap) return; bird ? birdTip(cv, bird) : windTip(cv, d.p[0], d.p[1]); }, 260);
    }
    down = null;
  };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  // trackpads and mice: pinch (ctrl + wheel) or scroll to zoom, smoothly
  cv.addEventListener("wheel", (e) => { e.preventDefault(); cancelAnimationFrame(mapGlide); const [x, y] = local(e); moveMap(cv, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), x, y); }, { passive: false });
}
// The password-locked key, fetched with the password itself (its proof is the check)
async function vaultWith(password) {
  const { salt } = await api("salt", { method: "POST", body: { email: S.me.email } });
  const { lockKey, proof } = await E2E.fromPassword(password || "", salt);
  const { vault } = await api("vault", { method: "POST", body: { proof } });
  return { vault, salt, lockKey, proof };
}
async function reauthPasskey() {
  const o = await api("passkey-options", { method: "POST", body: { mode: "login", rpId: chatRp() } });
  const a = await navigator.credentials.get({ publicKey: { challenge: fromB64url(o.challenge), rpId: o.rpId, userVerification: "required", timeout: 120000,
    allowCredentials: ofRp(o.rpId) } });
  noteRp(o.rpId);
  await api("reauth", { method: "POST", body: { challenge: o.challenge, id: a.id, clientDataJSON: b64url(a.response.clientDataJSON),
    authenticatorData: b64url(a.response.authenticatorData), signature: b64url(a.response.signature) } });
}
// Verify in person: your safety number with a friend, as a QR code. Scanning theirs (or
// comparing the digits and saying they match) marks them Verified, kept with the trusted
// keys ("v:" + id: the key that was verified), until their key changes.
const safetyCode = (digits) => `inflight-safety:1:${(digits || []).join("")}`;
function setVerified(p, on) { S.pins["v:" + p.id] = on ? keyId(p.pub) : ""; savePins(); }     // (off is kept, as "": mergePins)
const safeState = (p) => p?.keyChanged ? "warn" : isVerified(p) ? "ok" : "none";
// A key you can know at a glance: its fingerprint drawn as a 5×5 pattern, mirrored like a face, in two colours
// of its own. A different key looks different, without reading 32 characters.
function keyArt(fp, cls = "") {
  const b = (fp || "").replace(/\s/g, "").match(/../g)?.map((h) => parseInt(h, 16)) || [];
  if (b.length < 16) return "";
  const hue = Math.round(((b[0] << 8 | b[1]) / 65536) * 360), hue2 = (hue + 40 + (b[2] % 80)) % 360;
  let cells = "";
  for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
    const v = b[3 + r * 3 + c];
    if (v < 100) continue;                                            // about three in five are filled
    const fill = v & 1 ? `hsl(${hue2} 70% 55%)` : `hsl(${hue} 72% 48%)`;
    for (const x of c === 2 ? [2] : [c, 4 - c]) cells += `<rect x="${x * 10 + 1}" y="${r * 10 + 1}" width="8" height="8" rx="2.4" fill="${fill}"/>`;
  }
  return `<svg class="keyart ${cls}" viewBox="0 0 50 50" role="img" aria-label="Your key, as a pattern">${cells}</svg>`;
}
function stopScan() { if (!S.scan) return; S.scan.on = false; S.scan.stream?.getTracks().forEach((t) => t.stop()); S.scan = null; }
async function startScan(p, want) {
  stopScan();
  const v = $(".scanbox video", $layer), say = (t) => { const m = $(".scanmsg", $layer); if (m) m.textContent = t; };
  if (!v) return;
  const scan = S.scan = { on: true, stream: null, sheet: S.sheet };
  try { scan.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false }); }
  catch (_) { S.scan = null; return say("Chat can’t use the camera here. Compare the 60 digits instead."); }
  if (!scan.on || S.scan !== scan) { scan.stream.getTracks().forEach((t) => t.stop()); return; }     // (closed, or another scan began, while asking)
  v.addEventListener("playing", () => v.classList.add("on"), { once: true });          // (it fades in once there's a picture: styles.css)
  v.srcObject = scan.stream; await v.play().catch(() => {});
  // the browser's own reader where there is one (Android), else jsQR (loaded only now)
  let det = null;
  try { if ("BarcodeDetector" in window && (await BarcodeDetector.getSupportedFormats()).includes("qr_code")) det = new BarcodeDetector({ formats: ["qr_code"] }); } catch (_) {}
  const jsQR = det ? null : (await import("./jsqr.js")).default;
  const c = document.createElement("canvas"), g = c.getContext("2d", { willReadFrequently: true });
  const look = async () => {
    if (!scan.on || S.scan !== scan) return;
    let text = null;
    if (v.readyState >= 2 && v.videoWidth) {
      if (det) text = (await det.detect(v).catch(() => []))[0]?.rawValue || null;
      else { const w = c.width = Math.min(640, v.videoWidth), h = c.height = Math.round((w * v.videoHeight) / v.videoWidth); g.drawImage(v, 0, 0, w, h); text = jsQR(g.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "attemptBoth" })?.data || null; }
    }
    if (text?.startsWith("inflight-safety:")) {
      stopScan();
      // (Verify a Friend: whichever friend's safety number it is, opened at theirs; a changed key is only trusted there)
      if (want instanceof Map) {
        const hit = want.get(text);
        if (!hit) { haptic("heavy"); S.sheet = { ...S.sheet, bad: true }; return renderSheet(); }
        const at = { type: "safety", id: hit.f.id, digits: hit.digits, from: "encryptionsheet" };
        if (hit.f.keyChanged) { S.sheet = at; return renderSheet(); }
        setVerified(hit.f, true); haptic("success"); toast(`Verified. Your safety numbers match, so only you and ${esc(first(hit.f.name))} can read your messages.`);
        S.sheet = { ...at, won: performance.now() }; return renderSheet();
      }
      if (text === want) { setVerified(p, true); haptic("success"); toast(`Verified. Your safety numbers match, so only you and ${esc(first(p.name))} can read your messages.`); S.sheet = { ...S.sheet.back, won: performance.now() }; return renderSheet(); }
      haptic("heavy"); S.sheet = { ...S.sheet, bad: true }; return renderSheet();
    }
    setTimeout(look, 150);
  };
  look();
}
const GROUP_MAX = 12;
/* ---------- view-once photos ----------
   Downloaded only when tapped, and only once (the server hands it over a
   single time, then deletes it). Shown full screen for at most 15 seconds,
   drawn on a canvas (nothing to save or share), and wiped the moment it
   closes, or the moment you leave the app. */
const ONCE_MS = 15000;
function saveOpened() { try { localStorage.setItem(OPENED_KEY, JSON.stringify({ uid: S.me.id, ids: [...S.viewedOnce].slice(-500) })); } catch (_) {} }
async function viewOnce(id) {
  const fid = S.chat, g = group(fid), m = (S.msgs.get(fid) || []).find((x) => x.id === id), p = S.plain.get(id);
  if (!m || !onceP(p) || APP.onceOpen || picGone(m)) return;
  if ((m.viewedAt || opened().has(id)) && !onceAgain(m)) { if (onceMissed.delete(id)) render(); return; }     // (its few minutes are up)
  onceMissed.delete(id);
  haptic("tick");
  const el = document.createElement("div");
  el.className = "oview"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Photo, view once");
  el.innerHTML = `<canvas aria-hidden="true"></canvas><div class="obar"><span class="oring" aria-hidden="true"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15"/></svg></span><span class="otext">Opening…</span><button type="button" class="oclose" aria-label="Close">${I.x}</button></div>`;
  root().append(el);
  const state = APP.onceOpen = { el, timer: 0, bmp: null };
  backStep();
  // closed, it fades away (the photo with it) and is wiped as it goes; leaving the app wipes it there and then
  const close = (atOnce) => {
    if (APP.onceOpen !== state) return; APP.onceOpen = null; backStep();
    clearTimeout(state.timer); document.removeEventListener("visibilitychange", hide);
    const wipe = () => { const cv = $("canvas", el); if (cv) { cv.width = cv.height = 0; } state.bmp?.close?.(); state.bmp = null; };
    if (atOnce === true) wipe();
    el.classList.add("out"); setTimeout(() => { wipe(); el.remove(); }, 210);
  };
  const hide = () => { if (document.visibilityState !== "visible") close(true); };
  document.addEventListener("visibilitychange", hide);
  el.addEventListener("click", () => close());
  pinchZoom(el, $("canvas", el), () => close());       // (it can be enlarged in its time, as any photo)
  // counted as opened now (no second go), unless it never arrives
  m.viewedAtServer = !!m.viewedAt; m.viewedAt = m.viewedAt || now(); opened().add(id); saveOpened(); render();
  let plain, got = false;
  try {
    const r = await api((g ? "group-photo/" : "photo/") + id, { raw: true }), bytes = await r.arrayBuffer();
    got = true;                                  // handed over: from here it's spent, whatever happens
    plain = await E2E.openPhoto(id, p.p, bytes);
  } catch (e) {
    close();
    // no signal, or the server never answered: it wasn't handed over, so it can still be opened later
    if (!got && (e.offline || !e.status || e.status >= 500)) { onceMissed.set(id, now()); opened().delete(id); saveOpened(); if (m.viewedAt && !m.viewedAtServer) delete m.viewedAt; render(); return toast(esc(e.offline ? "You’re offline. The photo is still there to open once you’re back." : "Couldn’t open the photo just now. Try again in a moment.")); }
    if (e.status === 410) toast(esc(e.message || "This photo has already been opened."));
    else toast(esc(e.message || "Couldn’t open this photo."));
    return;
  }
  if (APP.onceOpen !== state) { new Uint8Array(plain.buffer || plain).fill(0); return; }           // closed while it was coming
  try { state.bmp = await createImageBitmap(new Blob([plain], { type: "image/jpeg" })); } catch (_) {}
  new Uint8Array(plain.buffer || plain).fill(0);                                // the decrypted bytes go straight away
  if (!state.bmp || APP.onceOpen !== state) return close();
  const cv = $("canvas", el), dpr = Math.min(3, devicePixelRatio || 1), W = el.clientWidth, H = el.clientHeight;
  const k = Math.min(W / state.bmp.width, H / state.bmp.height), w = Math.round(state.bmp.width * k), h = Math.round(state.bmp.height * k);
  // (drawn with every pixel it has, at most 1,600 across, so it's still sharp enlarged: pinchZoom. Never more than 16
  // million, though, the most iOS will draw on one canvas, from a phone that sent one bigger than Chat makes them)
  const q = Math.max(dpr, Math.min(state.bmp.width / w, Math.sqrt(16e6 / (w * h))));
  cv.width = Math.round(w * q); cv.height = Math.round(h * q); cv.style.width = `${w}px`; cv.style.height = `${h}px`;
  cv.getContext("2d").drawImage(state.bmp, 0, 0, cv.width, cv.height);
  state.bmp.close?.(); state.bmp = null;
  el.classList.add("on"); $(".otext", el).textContent = "View once";
  $(".oring circle", el).style.setProperty("animation-duration", `${ONCE_MS}ms`, "important");     // (Reduce Motion too: it says how long is left)
  state.timer = setTimeout(close, ONCE_MS);
}
// Pinch to zoom, built into a photo (the page itself never zooms: lockPage). Two fingers enlarge it about the point
// between them and move it as they go; a double tap zooms in on that spot, or back out; enlarged, one finger moves it
// round, and let go it settles back inside the screen's edges. A single tap brings it back to size, and at its size is
// the photo's own (tap: it closes), a moment later, once it's clearly not the first of two. box: what's touched; el: what's enlarged (laid out where it is,
// unmoved, as offsetLeft and offsetTop give it)
const ZOOM_MAX = 4, ZOOM_TAP = 2.5;
function pinchZoom(box, el, tap) {
  let s = 1, x = 0, y = 0, g = null, last = null, tapTimer = 0;
  const put = (ms) => {
    const one = s === 1 && !x && !y;
    el.style.transition = ms ? `transform ${STILL.matches ? 0 : ms}ms var(--ease-out)` : "none";
    if (!one) el.style.transformOrigin = "0 0";
    el.style.transform = one ? "" : `translate(${x}px, ${y}px) scale(${s})`;
    box.classList.toggle("zoomed", s > 1);
    // (back as it was: its own origin again once it's there, for the swipe that sends it away)
    if (one) setTimeout(() => { if (s === 1 && !x && !y) el.style.transformOrigin = el.style.transition = ""; }, ms || 0);
  };
  // (where it is on the screen unenlarged, and the room there is)
  const base = () => { const r = box.getBoundingClientRect(); return { l: r.left + el.offsetLeft, t: r.top + el.offsetTop, w: el.offsetWidth, h: el.offsetHeight, r }; };
  // scaled to k, the point (cx, cy) on the screen staying where it is (from b, where it was laid out)
  const about = (b, k, cx, cy, from = { s, x, y }) => { const px = (cx - b.l - from.x) / from.s, py = (cy - b.t - from.y) / from.s; s = k; x = cx - b.l - k * px; y = cy - b.t - k * py; };
  // back within bounds: no smaller than it was, no bigger than ZOOM_MAX (about cx, cy: the screen's middle, unsaid), filling
  // the screen where it's bigger than it and centred where it isn't
  const fit = (b, cx = b.r.left + b.r.width / 2, cy = b.r.top + b.r.height / 2) => {
    if (s <= 1) { s = 1; x = y = 0; return; }
    if (s > ZOOM_MAX) about(b, ZOOM_MAX, cx, cy);
    const W = b.w * s, H = b.h * s, r = b.r;
    x = W <= r.width ? r.left + (r.width - W) / 2 - b.l : Math.min(r.left - b.l, Math.max(r.right - W - b.l, x));
    y = H <= r.height ? r.top + (r.height - H) / 2 - b.t : Math.min(r.top - b.t, Math.max(r.bottom - H - b.t, y));
  };
  const mid = (a, c) => [(a.clientX + c.clientX) / 2, (a.clientY + c.clientY) / 2];
  box.addEventListener("touchstart", (e) => {
    if (e.target.closest("button")) { g = null; return; }          // (its own buttons are only buttons)
    if (e.touches.length >= 2) {
      clearTimeout(tapTimer); last = null;
      const [a, c] = e.touches, [fx, fy] = mid(a, c);
      g = { two: true, d: Math.max(1, Math.hypot(a.clientX - c.clientX, a.clientY - c.clientY)), from: { s, x, y }, fx, fy, lx: fx, ly: fy, b: base() };
      el.style.transition = "none";
    } else if (e.touches.length === 1 && !g) {
      const t = e.touches[0];
      g = { two: false, sx: t.clientX, sy: t.clientY, from: { s, x, y }, moved: false, at: performance.now() };
    }
  }, { passive: true });
  box.addEventListener("touchmove", (e) => {
    if (!g) return;
    if (g.two) {
      if (e.touches.length < 2) return;
      e.preventDefault();
      const [a, c] = e.touches, [fx, fy] = mid(a, c), d = Math.hypot(a.clientX - c.clientX, a.clientY - c.clientY);
      // (a little past either end while it's held, eased back as it's let go)
      const k = Math.min(ZOOM_MAX * 1.25, Math.max(0.7, (g.from.s * d) / g.d));
      about(g.b, k, g.fx, g.fy, g.from); x += fx - g.fx; y += fy - g.fy; g.lx = fx; g.ly = fy;
      put(0);
      return;
    }
    const t = e.touches[0], dx = t.clientX - g.sx, dy = t.clientY - g.sy;
    if (!g.moved && Math.hypot(dx, dy) < 8) return;
    g.moved = true;
    if (s <= 1) return;                                             // (unenlarged, a swipe is viewerDrag's: away it goes)
    e.preventDefault();
    x = g.from.x + dx; y = g.from.y + dy; put(0);
  }, { passive: false });
  const end = (e) => {
    if (!g) return;
    if (g.two) {
      if (e.touches.length >= 2) return;
      const b = base(); fit(b, g.lx, g.ly); put(260); g = null;
      return;
    }
    if (e.touches.length) return;
    const one = g; g = null;
    if (one.moved || performance.now() - one.at > 400) { if (s > 1) { fit(base()); put(260); } return; }
    // a tap: no click of the phone's own, as what it does is decided here
    if (e.cancelable) e.preventDefault();
    const t = e.changedTouches[0];
    if (last && performance.now() - last.at < 300 && Math.hypot(t.clientX - last.x, t.clientY - last.y) < 40) {
      clearTimeout(tapTimer); last = null;
      const b = base();
      if (s > 1) { s = 1; x = y = 0; } else { about(b, ZOOM_TAP, t.clientX, t.clientY); fit(b, t.clientX, t.clientY); }
      haptic("tick"); put(300);
      return;
    }
    // (enlarged, a tap brings it back to size first; at its size, it's the photo's own)
    last = { at: performance.now(), x: t.clientX, y: t.clientY };
    clearTimeout(tapTimer); tapTimer = setTimeout(() => {
      last = null;
      if (s > 1) { s = 1; x = y = 0; put(300); } else if (box.isConnected && !box.classList.contains("closing")) tap();
    }, 300);
  };
  box.addEventListener("touchend", end, { passive: false });
  box.addEventListener("touchcancel", (e) => { if (g) { g = null; fit(base()); put(260); } }, { passive: true });
}
// Encryption & Safety Numbers, as a row (Privacy & Security, where that's in the app): a friend's key
// that's changed first, else how many are verified and who's next (with its bar, in the sheet: its width set as it's drawn)
function encCell(bar) {
  const ver = S.friends.filter(isVerified).length, changed = S.friends.filter((f) => f.keyChanged).length;
  const nextUp = S.friends.filter((f) => !f.keyChanged && !isVerified(f)).sort((a, b) => (b.last?.sentAt || 0) - (a.last?.sentAt || 0))[0];     // (the friend you wrote to most lately)
  return `<button type="button" class="cell has-icon" data-act="encryptionsheet"><span class="tile green">${I.lock}</span><span class="ctext"><span>Encryption &amp; Safety Numbers</span><span class="csub${changed ? " warnc" : ""}">${changed ? `${changed} key${changed > 1 ? "s" : ""} changed: check ${changed > 1 ? "them" : "it"}` : S.friends.length ? `${ver} of ${S.friends.length} friend${S.friends.length > 1 ? "s" : ""} verified${nextUp ? ` · ${esc(first(nextUp.name))} next` : ""}` : "On for every message"}</span>
            ${bar && S.friends.length && !changed ? `<i class="vbar" aria-hidden="true"><b data-w="${((ver / S.friends.length) * 100).toFixed(1)}"></b></i>` : ""}</span>${chevSm}</button>`;
}
const hourLabel = (h) => `${String(h).padStart(2, "0")}:00`;
function vNotifySheet() {
  const u = S.me, n = u.notify || {}, ps = pushState();
  const pushFoot = {
    homescreen: "On iPhone, notifications need Chat on your Home Screen: tap Share, then Add to Home Screen, and open it from there.",
    denied: "Notifications are blocked for Chat. Turn them on in your phone’s Settings, then come back here.",
    unsupported: "This browser can’t show notifications. Email still works.",
  }[ps] || "Push notifications are set for each phone. The settings below apply to all of them.";
  const t = (key, icon, tile, label, sub) => toggleCell({ act: "npref", id: key, icon, tile, label, sub, on: !!n[key] });
  const hours = (key) => Array.from({ length: 24 }, (_, h) => `<option value="${h}"${n[key] === h ? " selected" : ""}>${hourLabel(h)}</option>`).join("");
  const anyOn = ps === "on" || u.notifyEmail, on = pigeonsOn();
  return `
    <div class="ghead">This Phone</div>
    <div class="group">
      ${toggleCell({ act: "pushtoggle", icon: I.bell, tile: "red", label: "Push Notifications", on: ps === "on", disabled: !["on", "off"].includes(ps) || S.pushBusy })}
      ${ps === "on" ? cell({ act: "pushtest", label: "Send a Test Notification", cls: "action" }) : ""}
    </div>
    <div class="gfoot">${pushFoot}</div>
    ${S.emailOn ? `<div class="ghead">Email</div>
    <div class="group">${toggleCell({ act: "emailtoggle", icon: I.mail, tile: "blue", label: "Email Me", sub: esc(u.email), on: u.notifyEmail })}</div>
    <div class="gfoot">${u.emailOk === false ? `Emails start once you confirm your address: tap the link we sent to ${esc(u.email)}. <button type="button" class="link inl" data-act="confirmsend">Send it again</button>`
      : "Only when a pigeon has waited 10 minutes unread, and at most every half hour. Every email has a link to turn them off."}</div>` : ""}
    <div class="nwrap${anyOn ? "" : " dim"}">
    <div class="ghead">Notify Me When</div>
    <div class="group">
      ${toggleCell({ act: "npref", id: "messages", icon: I.bubble, tile: "blue", label: "Messages", sub: "When a friend sends you one", on: n.messages !== false })}
      ${t("landed", I.bird, "orange", "A Pigeon Lands", on ? "" : "Letters friends send by pigeon")}
      ${on ? t("takeoff", I.up, "teal", "A Pigeon Takes Off", "When a friend sends you one") : ""}
      ${on ? t("rerouted", I.loc, "blue", "A Pigeon Changes Course", "When a friend moves while yours is flying") : ""}
      ${on ? t("lost", I.skull, "red", "A Pigeon Is Lost", "When Pigeon Death takes one of yours") : ""}
      ${on ? t("delays", I.storm, "indigo", "Weather Delays", "When one flies into weather that makes it late") : ""}
      ${t("requests", I.addp, "green", "Friend Requests")}
      ${t("accepted", I.people, "indigo", "Request Accepted")}
      ${t("reactions", I.heart, "pink", "Reactions", "When someone reacts to your message")}
      ${on ? t("moments", I.pass, "teal", "Mid-air Moments", "Near misses, cheers, ships, and friends’ pigeons flying over you") : ""}
      ${on ? t("streaks", I.flame, "orange", "Flight Streaks", "A few hours before a streak with a friend runs out") : ""}
      ${on ? t("weekly", I.globe, "blue", "Your Week in Flight", "Sunday evening: miles flown and badges earned") : ""}
    </div>
    <div class="ghead">Lock Screen</div>
    <div class="group">${t("names", I.eye, "gray", "Show Names")}</div>
    <div class="gfoot">${n.names ? "Notifications say who sent it." : "Just “Sent you a message” or “A pigeon has landed”."} They never include what a message says: only your phone can read that.</div>
    <div class="ghead">Quiet Hours</div>
    <div class="group">
      ${t("quiet", I.moon, "indigo", "Quiet Hours")}
      ${n.quiet ? `<label class="cell"><span class="ctext"><span>From</span></span><span class="val">${hourLabel(n.quietFrom)}</span>${chevSm}
        <select class="overlay" data-act="quiethour" data-id="quietFrom" aria-label="Quiet from">${hours("quietFrom")}</select></label>
      <label class="cell"><span class="ctext"><span>To</span></span><span class="val">${hourLabel(n.quietTo)}</span>${chevSm}
        <select class="overlay" data-act="quiethour" data-id="quietTo" aria-label="Quiet until">${hours("quietTo")}</select></label>` : ""}
    </div>
    <div class="gfoot">${n.quiet ? `Nothing arrives between ${hourLabel(n.quietFrom)} and ${hourLabel(n.quietTo)} (${esc(n.tz)} time). Pigeons that land meanwhile are announced when quiet hours end.` : "Hold notifications overnight, and hear about anything that landed when quiet hours end."}</div>
    </div>`;
}
/* ---------- share a flight ----------
   A landed pigeon as a picture to post: an airmail postcard (4:5) or a dark
   story (9:16), drawn here on the phone with the app's own map. Only the two
   places, the day and the flight go on it: never the message, and never your
   friend's name (yours only if you leave it on). */
const CARD_FONT = '-apple-system, "SF Pro Display", system-ui, Inter, "Helvetica Neue", Arial, sans-serif';
const STAMP_INK = { rocket: ["#fbe38a", "#d9a21b", "#a87808"], swift: ["#ff8a80", "#ff3b30", "#b8241b"], turbo: ["#5a5a60", "#1c1c1e", "#000000"],
  standard: ["#8ee39f", "#34c759", "#1d7f37"], dumb: ["#d8bf9a", "#a2845e", "#6f5636"],
  lunar: ["#e3e8f3", "#8190b3", "#56607a"], lunarx: ["#b9b8ff", "#5e5ce6", "#3532a8"], laser: ["#ffb3a8", "#e5484d", "#8f1d22"], orbital: ["#9fd0ff", "#0a84ff", "#0b3d91"] };
const STORY_INK = { rocket: "#f0c04a", swift: "#ff6961", turbo: "#f5f5f7", standard: "#30d158", dumb: "#c4a57e", lunar: "#c9d2e6", lunarx: "#8e8cff", laser: "#ff6961", orbital: "#64b5ff" };
// a space flight's picture, for the cards (the trip as it ended, in its night sky)
function spaceCard(m, cssW, cssH, dpr = 3) {
  const cv = document.createElement("canvas");
  drawTrip(cv, m.moon, m.moon.k === "laser" ? 1 : 0.985, m.deliverAt, { size: { w: cssW, h: cssH, dpr } });
  return cv;
}
// what goes on the card, in the time where it landed
function flightFacts(m, withName) {
  const mine = m.from === S.me.id, other = friend(mine ? m.to : m.from), flew = Math.max(1, m.deliverAt - m.sentAt), k = kindOf(m), w = m.wind;
  const tz = mine ? other?.tz : MY_TZ;
  const at = (o) => { try { return dtf({ timeZone: tz || undefined, ...o }).format(m.deliverAt); } catch (_) { return dtf(o).format(m.deliverAt); } };
  let zone = "";
  try { zone = dtf({ timeZone: tz || undefined, timeZoneName: "short" }).formatToParts(m.deliverAt).find((x) => x.type === "timeZoneName")?.value || ""; } catch (_) {}
  const mph = (kmh) => Math.round(Math.abs(kmh) * 0.621371);
  return {
    k, from: m.fromPlace || "Somewhere", to: m.toPlace || "Somewhere", miles: fmtMiles(m.km + shipKm(m.legs)), longMiles: ((mi) => `${mi.toLocaleString("en-GB")} mile${mi === 1 ? "" : "s"}`)(Math.round((m.km + shipKm(m.legs)) * 0.621371)),
    dur: fmtDur(flew), mph: fmtMph(avgKmh(m)),
    sky: w == null ? [KIND[k].name, "Pigeon"] : Math.abs(w) < 3 ? ["Calm", "Skies"] : [`${mph(w)} mph`, w > 0 ? "Tailwind" : "Headwind"],
    skyLine: w == null ? "" : Math.abs(w) < 3 ? "calm skies" : `${w > 0 ? "tailwind" : "headwind"} ${mph(w)} mph`,
    time: at({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }), zone,
    day: at({ day: "numeric", month: "long", year: "numeric" }), dayShort: at({ day: "numeric", month: "short", year: "numeric" }),
    stampDay: at({ day: "2-digit", month: "short", year: "numeric" }).toUpperCase(),
    name: withName ? first(S.me.name) : "", by: withName ? `${mine ? "Sent" : "Received"} by ${first(S.me.name)}` : "",
    site: `${location.host}${location.pathname.replace(/\/+$/, "")}`,
  };
}
// The flight on the app's own map, drawn off screen in fixed colours (the
// globe, or flat), cssW × cssH at dpr pixels to each.
async function cardMap(m, ink, globe, cssW, cssH, dpr = 3) {
  const want = globe ? ["50m"] : m.km < 900 ? ["50m", "10m"] : ["50m"];
  for (const res of want) await new Promise((ok) => {               // the coast in the detail the map will want
    const t0 = Date.now();
    (function wait() { world(res); if (typeof WORLD[res] === "object" || WORLD[res] === "failed" || Date.now() - t0 > 5000) ok(); else setTimeout(wait, 60); })();
  });
  const cv = document.createElement("canvas");
  cv.className = `cardmap ink-${ink}`; cv.style.width = `${cssW}px`; cv.style.height = `${cssH}px`; cv._dprFix = dpr; cv._spin = -1;
  document.body.append(cv);
  const keep = S.sheet;
  S.sheet = { type: "cardmap", globe, view: null, gview: null }; mapInk = ink;
  try { drawMap(cv, m, 0); return { cv, frame: globe ? globeFrame(cv, m, 0) : null }; }
  finally { S.sheet = keep; mapInk = null; cv.remove(); }
}
function rrect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
// one line as big as it can be (up to size) in maxW
function fitFont(g, s, weight, size, maxW, min = 22) {
  let z = size;
  for (; z > min; z -= 2) { g.font = `${weight} ${z}px ${CARD_FONT}`; if (g.measureText(s).width <= maxW) break; }
  g.font = `${weight} ${z}px ${CARD_FONT}`; return z;
}
// letter-spaced capitals
function spaced(g, s, x, y, gap, align = "left") {
  const ch = [...s], w = ch.reduce((a, c) => a + g.measureText(c).width, 0) + gap * (ch.length - 1);
  let cx = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
  const keep = g.textAlign; g.textAlign = "left";
  for (const c of ch) { g.fillText(c, cx, y); cx += g.measureText(c).width + gap; }
  g.textAlign = keep; return w;
}
function appIcon(g, x, y, sz) {
  const gr = g.createLinearGradient(x, y, x + sz * 0.6, y + sz); gr.addColorStop(0, "#4aa3ff"); gr.addColorStop(1, "#0055d4");
  g.fillStyle = gr; rrect(g, x, y, sz, sz, sz * 0.22); g.fill();
  g.save(); g.translate(x + sz * 0.125, y + sz * 0.137); g.scale(sz / 32, sz / 32); g.fillStyle = "#fff"; g.fill(new Path2D(BIRD)); g.restore();
}
// the airmail stamp, perforated, in the pigeon's colour (as on every pigeon that lands)
function cardStamp(g, x, y, F) {
  const s = document.createElement("canvas"); s.width = 198; s.height = 242; const o = s.getContext("2d");
  o.fillStyle = "#fffdf7"; o.fillRect(0, 0, 198, 242);
  o.globalCompositeOperation = "destination-out";
  const hole = (px, py) => { o.beginPath(); o.arc(px, py, 7, 0, 7); o.fill(); };
  for (let i = 0; i <= 9; i++) { hole(i * 22, 0); hole(i * 22, 242); }
  for (let j = 0; j <= 11; j++) { hole(0, j * 22); hole(198, j * 22); }
  o.globalCompositeOperation = "source-over";
  const [c1, c2, c3] = STAMP_INK[F.k] || STAMP_INK.standard, gr = o.createLinearGradient(60, 20, 140, 222);
  gr.addColorStop(0, c1); gr.addColorStop(0.55, c2); gr.addColorStop(1, c3);
  o.fillStyle = gr; rrect(o, 20, 20, 158, 202, 5); o.fill();
  o.strokeStyle = "rgba(255,255,255,.35)"; o.lineWidth = 2; rrect(o, 21, 21, 156, 200, 5); o.stroke();
  o.save(); o.translate(57, 44); o.scale(3.5, 3.5); o.shadowColor = "rgba(0,0,0,.28)"; o.shadowBlur = 3; o.shadowOffsetY = 1; o.fillStyle = "#fff"; o.fill(new Path2D(BIRD)); o.restore();
  o.fillStyle = "#fff"; o.textAlign = "center"; o.textBaseline = "alphabetic";
  o.shadowColor = "rgba(0,0,0,.25)"; o.shadowBlur = 3; o.shadowOffsetY = 1;
  fitFont(o, F.miles, 800, 30, 140, 18); o.fillText(F.miles, 99, 170);
  o.shadowColor = "transparent"; o.font = `700 13px ${CARD_FONT}`; spaced(o, KIND[F.k].name.toUpperCase(), 99, 196, 3, "center");
  g.save(); g.translate(x + 99, y + 121); g.rotate(4 * Math.PI / 180);
  g.shadowColor = "rgba(60,40,0,.24)"; g.shadowBlur = 16; g.shadowOffsetY = 8; g.drawImage(s, -99, -121); g.restore();
}
// struck across the stamp: where and when it landed
function cardPostmark(g, x, y, F) {
  g.save(); g.translate(x, y); g.rotate(-8 * Math.PI / 180); g.globalAlpha = 0.72; g.globalCompositeOperation = "multiply";
  g.strokeStyle = g.fillStyle = "#2b2f45"; g.lineWidth = 5; g.lineCap = "round";
  g.beginPath(); g.arc(0, 0, 100, 0, 7); g.stroke(); g.beginPath(); g.arc(0, 0, 64, 0, 7); g.stroke();
  for (let i = 0; i < 4; i++) {
    const yy = -46 + i * 30, x0 = i === 0 || i === 3 ? 104 : 108;
    g.beginPath(); for (let t = 0; t <= 200; t += 4) { const px = x0 + t, py = yy - 7 * Math.sin((t / 50) * Math.PI); t ? g.lineTo(px, py) : g.moveTo(px, py); } g.stroke();
  }
  // round the ring, centred at the top
  const ring = `${F.to.toUpperCase()} • ${F.stampDay} • LANDED • `, R = 82;
  let z = 22; g.font = `800 ${z}px ${CARD_FONT}`;
  const len = () => [...ring].reduce((a, c) => a + g.measureText(c).width + 4, 0);
  while (len() > 2 * Math.PI * R * 0.97 && z > 12) { z -= 1; g.font = `800 ${z}px ${CARD_FONT}`; }
  g.textAlign = "center"; g.textBaseline = "middle";
  let a = -Math.PI / 2 - len() / R / 2;
  for (const c of ring) {
    const w = g.measureText(c).width + 4; a += w / 2 / R;
    g.save(); g.rotate(a); g.translate(0, -R); g.fillText(c, 0, 0); g.restore();
    a += w / 2 / R;
  }
  g.textBaseline = "alphabetic"; g.font = `800 36px ${CARD_FONT}`; g.fillText(F.time, 0, 12);
  g.font = `700 16px ${CARD_FONT}`; spaced(g, F.zone.toUpperCase(), 0, 40, 3, "center");
  g.restore();
}
async function postcardCard(m, withName) {
  const F = flightFacts(m, withName), W = 1080, H = 1350, PAPER = "#fbf7ee", INK = "#1c1c1e", INK2 = "#6e6a62";
  const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
  g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
  // the airmail edge
  g.save(); g.beginPath(); g.rect(0, 0, W, H); g.rect(20, 20, W - 40, H - 40); g.clip("evenodd");
  g.translate(W / 2, H / 2); g.rotate(Math.PI / 4);
  for (let x = -1500; x < 1500; x += 104) { g.fillStyle = "#d8443a"; g.fillRect(x, -1500, 38, 3000); g.fillStyle = "#1f63c9"; g.fillRect(x + 52, -1500, 38, 3000); }
  g.restore();
  g.save(); g.beginPath(); g.rect(20, 20, W - 40, H - 40); g.clip();
  g.textBaseline = "alphabetic";
  // the flight: round the globe if it was a long one (drawn on the paper's own
  // colour, so its labels and air run out onto it), else a flat map like a photo
  const round = !m.moon && m.km >= GLOBE_KM;
  if (m.moon) {
    const cv = spaceCard(m, 474, 158, 2), x = 66, y = 452, w = 948, h = 316;
    g.save(); g.shadowColor = "rgba(60,50,30,.18)"; g.shadowBlur = 30; g.shadowOffsetY = 12; g.fillStyle = "#fff"; rrect(g, x - 14, y - 14, w + 28, h + 28, 28); g.fill(); g.restore();
    g.save(); rrect(g, x, y, w, h, 16); g.clip(); g.drawImage(cv, x, y, w, h); g.restore();
  } else if (round) {
    const { cv, frame } = await cardMap(m, "light", true, 420, 420), sc = 300 / (frame.R * 3);
    g.drawImage(cv, 404 - frame.cx * 3 * sc, 470 - frame.cy * 3 * sc, cv.width * sc, cv.height * sc);
  } else {
    const { cv } = await cardMap(m, "light", false, 474, 158, 2);
    const x = 66, y = 452, w = 948, h = 316;
    g.save(); g.shadowColor = "rgba(60,50,30,.18)"; g.shadowBlur = 30; g.shadowOffsetY = 12; g.fillStyle = "#fff"; rrect(g, x - 14, y - 14, w + 28, h + 28, 28); g.fill(); g.restore();
    g.save(); rrect(g, x, y, w, h, 16); g.clip(); g.drawImage(cv, x, y, w, h); g.restore();
  }
  g.font = `800 26px ${CARD_FONT}`; g.fillStyle = "#1f63c9"; spaced(g, "PAR PIGEON", 84, 104, 8);
  g.font = `600 22px ${CARD_FONT}`; g.fillStyle = "#d8443a"; spaced(g, "AIRMAIL", 84, 140, 4.5);
  cardStamp(g, 786, 84, F);
  cardPostmark(g, 772, round ? 362 : 340, F);
  // where from and to
  const arrow = F.k === "turbo" ? "#1f63c9" : (STAMP_INK[F.k] || STAMP_INK.standard)[1], left = 84, maxW = 912;
  let z = fitFont(g, `${F.from} → ${F.to}`, 800, 76, maxW, 56), lines = [[F.from, " → ", F.to]];
  if (g.measureText(`${F.from} → ${F.to}`).width > maxW) { lines = [[F.from, " →", ""], ["", "", F.to]]; z = Math.min(fitFont(g, `${F.from} →`, 800, 64, maxW, 30), fitFont(g, F.to, 800, 64, maxW, 30)); g.font = `800 ${z}px ${CARD_FONT}`; }
  let by = lines.length > 1 ? 856 : 878;
  for (const [a, mid, b] of lines) {
    let x = left;
    for (const [t, col] of [[a, INK], [mid, arrow], [b, INK]]) { if (!t) continue; g.fillStyle = col; g.fillText(t, x, by); x += g.measureText(t).width; }
    by += Math.round(z * 1.06);
  }
  g.fillStyle = INK2; fitFont(g, F.by ? `${F.by} · landed ${F.day}` : `Landed ${F.day}`, 500, 29, maxW);
  g.fillText(F.by ? `${F.by} · landed ${F.day}` : `Landed ${F.day}`, left, by - Math.round(z * 1.06) + 52);
  // the flight in four numbers
  g.strokeStyle = "rgba(110,106,98,.35)"; g.lineWidth = 2; g.setLineDash([6, 5]); g.beginPath(); g.moveTo(left, 1021); g.lineTo(W - left, 1021); g.stroke(); g.setLineDash([]);
  [[F.miles, "Distance"], [F.dur, "In the air"], [F.mph, "Average"], F.sky].forEach(([v, l], i) => {
    const x = left + i * 228;
    g.fillStyle = INK; fitFont(g, v, 800, 42, 214, 26); g.fillText(v, x, 1088);
    g.fillStyle = INK2; g.font = `600 20px ${CARD_FONT}`; spaced(g, l.toUpperCase(), x, 1122, 2.6);
  });
  // whose it is
  appIcon(g, left, 1214, 64);
  g.fillStyle = INK; g.font = `800 30px ${CARD_FONT}`; g.fillText("Chat", left + 84, 1243);
  g.fillStyle = INK2; g.font = `500 22px ${CARD_FONT}`; g.fillText("Messages that fly the real distance", left + 84, 1273);
  g.textAlign = "right"; g.font = `600 22px ${CARD_FONT}`; g.fillText(F.site, W - left, 1256); g.textAlign = "left";
  g.restore();
  return c;
}
async function storyCard(m, withName) {
  const F = flightFacts(m, withName), W = 1080, H = 1920, BG = "#111113", ink = STORY_INK[F.k] || STORY_INK.standard;
  const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
  g.fillStyle = BG; g.fillRect(0, 0, W, H);
  const { cv } = m.moon ? { cv: spaceCard(m, 360, 427) } : await cardMap(m, "dark", false, 360, 427);
  g.drawImage(cv, 0, 0, 1080, 1281);
  let gr = g.createLinearGradient(0, 0, 0, 300); gr.addColorStop(0, "rgba(17,17,19,.92)"); gr.addColorStop(1, "rgba(17,17,19,0)"); g.fillStyle = gr; g.fillRect(0, 0, W, 300);
  gr = g.createLinearGradient(0, 900, 0, 1290); gr.addColorStop(0, "rgba(17,17,19,0)"); gr.addColorStop(0.5, "rgba(17,17,19,.86)"); gr.addColorStop(1, BG); g.fillStyle = gr; g.fillRect(0, 900, W, 391);
  g.textBaseline = "alphabetic";
  appIcon(g, 64, 84, 76);
  g.fillStyle = "#fff"; g.font = `800 44px ${CARD_FONT}`; g.fillText("Chat", 162, 138);
  g.fillStyle = ink; g.font = `800 24px ${CARD_FONT}`; spaced(g, F.name ? `FROM ${F.name.toUpperCase()}` : "AIRMAIL", W - 64, 131, 7, "right");
  g.fillStyle = "#fff"; fitFont(g, F.longMiles, 900, 156, W - 128, 60); g.fillText(F.longMiles, 64, 1275);
  g.fillStyle = ink; fitFont(g, `by ${KIND[F.k].name.toLowerCase()} pigeon`, 700, 52, W - 128); g.fillText(`by ${KIND[F.k].name.toLowerCase()} pigeon`, 64, 1360);
  // the landed card, as in the app
  g.save(); g.shadowColor = "rgba(0,0,0,.5)"; g.shadowBlur = 60; g.shadowOffsetY = 24; g.fillStyle = "#2a2a2e"; rrect(g, 56, 1470, 968, 312, 60); g.fill(); g.restore();
  g.strokeStyle = "rgba(255,255,255,.08)"; g.lineWidth = 1.5; rrect(g, 56.75, 1470.75, 966.5, 310.5, 60); g.stroke();
  const [c1, c2, c3] = STAMP_INK[F.k] || STAMP_INK.standard; gr = g.createLinearGradient(104, 1514, 150, 1590);
  gr.addColorStop(0, c1); gr.addColorStop(0.55, c2); gr.addColorStop(1, c3);
  g.fillStyle = gr; g.beginPath(); g.arc(142, 1552, 38, 0, 7); g.fill();
  g.strokeStyle = "rgba(255,255,255,.3)"; g.lineWidth = 2; g.stroke();
  g.save(); g.translate(119, 1528); g.scale(1.95, 1.95); g.fillStyle = "#fff"; g.fill(new Path2D(BIRD)); g.restore();
  g.fillStyle = "#fff"; fitFont(g, `Landed in ${F.to}`, 800, 56, 776, 30); g.fillText(`Landed in ${F.to}`, 200, 1572);
  const line = `Flew ${F.dur} · averaged ${F.mph}${F.skyLine ? ` · ${F.skyLine}` : ""}`;
  g.fillStyle = "#a5a5ad"; fitFont(g, line, 500, 32, 872); g.fillText(line, 104, 1636);
  gr = g.createLinearGradient(104, 0, 976, 0); gr.addColorStop(0, "#ff9f0a"); gr.addColorStop(1, "#f0c04a"); g.fillStyle = gr; rrect(g, 104, 1668, 872, 10, 5); g.fill();
  g.fillStyle = "#a5a5ad"; g.font = `500 30px ${CARD_FONT}`; g.textAlign = "right"; g.fillText(F.dayShort, 976, 1736);
  const dw = g.measureText(F.dayShort).width; g.textAlign = "left"; fitFont(g, `${F.from} → ${F.to}`, 500, 30, 872 - dw - 30, 18); g.fillText(`${F.from} → ${F.to}`, 104, 1736);
  g.font = `700 27px ${CARD_FONT}`; const a = F.site, b = " · Messages that fly the real distance", aw = g.measureText(a).width;
  g.font = `600 27px ${CARD_FONT}`; const bw = g.measureText(b).width;
  let x = (W - aw - bw) / 2; g.fillStyle = "#d1d1d6"; g.font = `700 27px ${CARD_FONT}`; g.fillText(a, x, 1866); g.fillStyle = "#8e8e93"; g.font = `600 27px ${CARD_FONT}`; g.fillText(b, x + aw, 1866);
  return c;
}
const cardBlob = (c) => new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("Couldn’t make the picture."))), "image/jpeg", 0.93));
const SHARE_FMTS = [["postcard", "Postcard", "For posts and messages"], ["story", "Story", "For stories"]];
const canShareFiles = () => { try { return !!navigator.canShare?.({ files: [new File([""], "flight.jpg", { type: "image/jpeg" })] }); } catch (_) { return false; } };
// both pictures, drawn one after the other, each shown as soon as it's ready
async function shareRender(s) {
  const gen = (s.gen = (s.gen || 0) + 1), m = (S.msgs.get(s.chat) || []).find((x) => x.id === s.id);
  if (!m) return;
  $layer.querySelectorAll(".shimg").forEach((e) => e.classList.add("stale"));
  for (const [fmt, make] of [["postcard", postcardCard], ["story", storyCard]]) {
    let blob;
    try { blob = await cardBlob(await make(m, s.name)); }
    catch (err) { if (S.sheet === s) toast(esc(err.message || "Couldn’t make the picture.")); return; }
    if (S.sheet !== s || s.gen !== gen) return;
    const url = URL.createObjectURL(blob); APP.shareUrls.push(url);
    s.blobs[fmt] = blob; s.urls[fmt] = url;
    // (the new picture fades in over the waiting bird, or over the one it replaces, which then goes)
    const slot = $(`.shopt.${fmt} .shimg`, $layer);
    if (slot) {
      slot.classList.remove("stale"); slot.insertAdjacentHTML("beforeend", `<img src="${url}" alt="">`);
      const img = slot.lastElementChild; setTimeout(() => { for (const x of [...slot.children]) if (x !== img && slot.contains(img)) x.remove(); }, STILL.matches ? 0 : 320);
    }
    const go = $("[data-act=shareimg]", $layer); if (go) go.disabled = !s.urls[s.fmt];
  }
}
async function shareImage() {
  const s = S.sheet, blob = s?.blobs?.[s.fmt], m = (S.msgs.get(s?.chat) || []).find((x) => x.id === s?.id);
  if (!blob || !m) return;
  const name = `Chat ${m.fromPlace || ""} to ${m.toPlace || ""}`.replace(/[^\w .-]+/g, "").replace(/\s+/g, " ").trim() + ".jpg";
  const file = new File([blob], name, { type: blob.type });
  if (canShareFiles()) {
    try { await navigator.share({ files: [file] }); }
    catch (err) { if (err?.name === "NotAllowedError") toast("Tap Share again to send it."); else if (err?.name !== "AbortError") toast("Couldn’t share the picture."); }
    return;
  }
  // no share sheet here (a computer): saved instead
  const a = document.createElement("a"); a.href = s.urls[s.fmt]; a.download = name; document.body.append(a); a.click(); a.remove();
  toast("Picture saved.");
}

/* ---------- achievements (in the Flight Log) ---------- */
const BADGE_LOOK = { moonshot: ["moon", "indigo"], supermoon: ["moon", "orange"], eclipse: ["moon", "red"], redplanet: ["up", "red"], orbiter: ["globe", "blue"], first: ["bird", "green"], frequent: ["up", "blue"], penpal: ["mail", "indigo"], longhaul: ["dist", "teal"], atlantic: ["map", "blue"],
  world: ["loc", "teal"], rocket: ["bird", "rocket"], tailwind: ["wind", "green"], daredevil: ["skull", "red"], homing: ["homing", "indigo"], flock: ["people", "orange"], fleet: ["bird", "turbo"] , globetrotter: ["globe", "teal"] , stormdodger: ["storm", "indigo"], weathered: ["shield", "gray"], jetstream: ["wind", "teal"], migration: ["blossom", "pink"], summer: ["sun", "yellow"], autumn: ["leaf", "orange"], winter: ["snowflake", "blue"]};
// the Flight Log's collection
function postmarksHtml(pm) {
  if (!pm) return "";
  const list = pm.marks || [], left = Math.max(0, pm.of - list.length);
  const tile = (x) => `<button type="button" class="pmtile pm-${esc(x.kind)}" data-act="pmarkall" data-id="${esc(x.id)}" aria-label="${esc(x.name)}: first flown past ${esc(fmtDate(x.at))}${x.n > 1 ? `, ${x.n} flights` : ""}">${pmSeal(x)}<b>${esc(pmName(x.name))}</b><small>${pmDay(x.at)}</small></button>`;
  return `<div class="ghead">Postmarks <span class="gcount">${list.length} of ${pm.of}</span></div>
    <div class="pmgrid">${list.map(tile).join("")}${Array.from({ length: Math.min(left, list.length ? (3 - (list.length % 3)) % 3 : 3) }, () => `<span class="pmtile unknown" aria-hidden="true"><span class="pmseal"><b>?</b></span><b>Somewhere</b><small>to find</small></span>`).join("")}</div>
    <div class="gfoot">${list.length ? `${left} more to find. ` : ""}A pigeon that flies past somewhere famous, like the Eiffel Tower or Mount Fuji, brings back its postmark on the letter. The ones in your own town don’t count.</div>`;
}
// In the Flight Log: your passport, closed, and what's in it (it opens as a book: passportBook)
function passportHtml(pp) {
  if (!pp) return "";
  const list = pp.places || [], last = list[0], pages = list.length ? passportPages(pp).length : 0, trips = new Set(list.map((p) => p.trip || p.at)).size;
  return `<div class="ghead">Passport <span class="gcount">${pp.countries} countr${pp.countries === 1 ? "y" : "ies"} · ${pp.seas} sea${pp.seas === 1 ? "" : "s"}</span></div>
    <button type="button" class="ppcard" data-act="passport" aria-label="Open your passport"><span class="ppmini" aria-hidden="true">${passportCover()}</span>
      <span class="ppt"><b>${esc(first(S.me.name))}’s Passport</b>${list.length ? `<small>${trips} journey${trips === 1 ? "" : "s"} · ${pages} page${pages === 1 ? "" : "s"} stamped</small>
      <small>Last stamp: ${esc(last.name.replace(/^the /, ""))}, ${esc(pmDay(last.at).slice(0, -3).replace(/(\w+)$/, (x) => x[0] + x.slice(1).toLowerCase()))}</small>` : `<small>Each country and sea your pigeons fly over gets a stamp, once they’ve landed.</small>`}
      <span class="pill">Open Passport</span></span></button>`;
}
const PP_INK = ["#b3262e", "#1f4fa3", "#5b3a9c", "#1d6b45", "#2a2a2e", "#126e78", "#7a4a1c"];
const ppHash = (x, k = 5) => [...String(x)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, k);
const ppInk = (p) => (p.sea ? "#1f4fa3" : PP_INK[ppHash(p.name) % PP_INK.length]);
const PP_PER = 10;
// The pages: oldest first, a journey's stamps together; a page holds PP_PER, and a journey
// that wouldn't get three on this one starts the next
function passportPages(pp) {
  const list = [...(pp.places || [])].sort((a, b) => a.at - b.at || a.ord - b.ord), pages = [];
  let cur = null, trip;
  for (const p of list) {
    const k = p.trip || `d${Math.floor(p.at / DAY)}`, fresh = k !== trip; trip = k;
    if (!cur || cur.stamps.length >= PP_PER || (fresh && cur.stamps.length > PP_PER - 3)) pages.push(cur = { stamps: [], trips: [] });
    cur.stamps.push(p); if (!cur.trips.some((t) => t.k === k)) cur.trips.push({ k, at: p.at, trip: pp.trips?.[p.trip] || null });
  }
  return pages;
}
// a journey, as the top of the page says it: "16 OCT · LONDON → SYDNEY"
const ppJourney = (t) => [pmDay(t.at).slice(0, -3), t.trip?.from && t.trip?.to ? `${t.trip.from} → ${t.trip.to}` : ""].filter(Boolean).join(" · ").toUpperCase();
const ppBird = `<path transform="translate(-12 -10)" d="${BIRD}"/>`;
const PP_STAMPS = ["rect", "circle", "oval", "hex", "tri"];
// One stamp, drawn in its local box, in its ink (SVG presentation attributes: no inline styles)
function ppStamp(p, kind, code) {
  const cap = p.name.replace(/^the /, "").toUpperCase(), d = pmDay(p.at), sh = !p.sea && APP.SHAPES?.[p.name];
  const fit = (n, w) => (n.length * 9.6 > w ? ` textLength="${w}" lengthAdjust="spacingAndGlyphs"` : "");
  // (the Moon: its disc and a few craters, where a country has its outline)
  const moonMark = (x, y, k) => `<g transform="translate(${x + 50 * k} ${y + 50 * k}) scale(${k * 3})"><circle r="11" class="ps"/><circle cx="-3.5" cy="-3" r="3" class="ps"/><circle cx="4" cy="2" r="2.2" class="ps"/><circle cx="-1.5" cy="5.5" r="1.4" class="ps"/><circle cx="5" cy="-5" r="1" class="ps"/></g>`;
  // (Mars: a disc with its polar cap; Low Earth Orbit: the Earth with a ring round it)
  const marsMark = (x, y, k) => `<g transform="translate(${x + 50 * k} ${y + 50 * k}) scale(${k * 3})"><circle r="11" class="ps"/><path d="M-6-9a11 11 0 0 1 12 0Z" class="pf"/><path d="M-9 2c4-2 8 2 12 0s5-1 6 0" class="ps"/></g>`;
  const orbitMark = (x, y, k) => `<g transform="translate(${x + 50 * k} ${y + 50 * k}) scale(${k * 3})"><circle r="8" class="ps"/><ellipse rx="13" ry="4" transform="rotate(-20)" class="ps"/><circle cx="11" cy="-4" r="1.6" class="pf"/></g>`;
  const land = (x, y, k) => (p.name === "the Moon" ? moonMark(x, y, k) : p.name === "Mars" ? marsMark(x, y, k) : p.name === "Low Earth Orbit" ? orbitMark(x, y, k) : sh ? `<path d="${sh}" transform="translate(${x} ${y}) scale(${k})" class="pf"/>` : `<g transform="translate(${x + 50 * k} ${y + 50 * k}) scale(${k * 3})" class="pf">${ppBird}</g>`);
  const T = (x, y, cls, txt, w) => `<text x="${x}" y="${y}" class="${cls}"${w ? fit(txt, w) : ""}>${esc(txt)}</text>`;
  const id = `pa${ppHash(p.name + p.at)}`;
  switch (kind) {
    case "rect": return [140, 88, `<rect x="2" y="2" width="136" height="84" rx="10" class="ps"/><rect x="7" y="7" width="126" height="74" rx="6" class="ps pst"/>
      ${T(70, 21, "px pxs", `ENTRY · ${code}`)}${land(13, 29, 0.32)}${T(92, 48, "px pxb", cap, 76)}${T(92, 63, "px", d)}<g transform="translate(92 74) scale(.55)" class="pf">${ppBird}</g>`];
    case "circle": return [100, 100, `<circle cx="50" cy="50" r="47" class="ps"/><circle cx="50" cy="50" r="40" class="ps pst"/>
      <defs><path id="${id}a" d="M14 50a36 36 0 0 1 72 0"/><path id="${id}b" d="M16 52a34 34 0 0 0 68 0"/></defs>
      <text class="px pxb"${fit(cap, 96)}><textPath href="#${id}a" startOffset="50%">${esc(cap)}</textPath></text><text class="px pxs"><textPath href="#${id}b" startOffset="50%">BY PIGEON · ${code}</textPath></text>
      ${land(38, 26, 0.24)}${T(50, 59, "px pxs", d)}`];
    case "oval": return [130, 80, `<ellipse cx="65" cy="40" rx="62" ry="37" class="ps"/><ellipse cx="65" cy="40" rx="55" ry="30" class="ps pst"/>
      ${T(65, 30, "px pxb", cap, 92)}${T(65, 45, "px", pmDay(p.at).replace(/ (\d\d)$/, " 20$1"))}<text x="65" y="56" class="px pxs" textLength="70" lengthAdjust="spacingAndGlyphs">DEPARTED · ${code}</text>`];
    case "hex": return [100, 100, `<path d="M50 2 93 26v48L50 98 7 74V26Z" class="ps"/><path d="M50 9 87 30v40L50 91 13 70V30Z" class="ps pst"/>
      ${land(32, 18, 0.36)}${T(50, 67, "px pxb", cap, 64)}${T(50, 79, "px pxs", d)}`];
    case "tri": return [110, 96, `<path d="M55 4 106 92H4Z" class="ps"/><path d="M55 16 95 85H15Z" class="ps pst"/>
      ${land(41, 34, 0.28)}${T(55, 70, "px pxb pxs2", cap, cap.length * 7.6 > 62 ? 62 : 0)}${T(55, 80, "px pxs", d)}`];
    case "sea": return [130, 66, `<rect x="2" y="2" width="126" height="62" rx="4" class="ps" stroke-dasharray="7 3"/>
      ${T(65, 20, "px pxs", p.ship ? "BY SHIP · CROSSED" : "AT SEA · CROSSED")}${T(65, 36, "px pxb", cap, 112)}${T(65, 50, "px pxs", d)}<path d="M14 56c5-4 8 4 13 0s8 4 13 0M90 56c5-4 8 4 13 0s8 4 13 0" class="ps pst"/>`];
    default: return [136, 74, `<rect x="2" y="2" width="132" height="70" rx="14" class="ps"/><rect x="8" y="8" width="120" height="58" rx="10" class="ps pst"/>
      <path d="M18 44h30l-5 8H23ZM26 44v-12h12l4 12M31 32v-6" class="ps"/>${T(88, 28, "px pxb", cap, 80)}${T(88, 42, "px", d)}${T(88, 55, "px pxs", "ARRIVED BY SEA")}`];
  }
}
// A visa page: its journeys at the top, then the stamps, two to a row, each a little off and askew
function ppVisa(pg, n) {
  const ship = new Map(pg.trips.map((t) => [t.k, !!t.trip?.ship]));
  const lastLand = new Map();
  for (const p of pg.stamps) if (!p.sea) lastLand.set(p.trip || `d${Math.floor(p.at / DAY)}`, p);
  const heads = pg.trips.map(ppJourney), head = heads.length > 2 ? `${heads.slice(0, 2).join(" · ")} · +${heads.length - 2}` : heads.join(" · ");
  const stamps = pg.stamps.map((p, i) => {
    const k = p.trip || `d${Math.floor(p.at / DAY)}`, h = ppHash(p.name + k), sailed = ship.get(k);
    const kind = p.sea ? "sea" : sailed && lastLand.get(k) === p ? "ship" : PP_STAMPS[ppHash(p.name, 9) % PP_STAMPS.length];
    const [w0, h0, body] = ppStamp({ ...p, ship: sailed }, kind, `IF ${100 + (ppHash(k) % 900)}`), K = 0.88, w = w0 * K, hgt = h0 * K;
    const col = i % 2, row = Math.floor(i / 2), cx = (col ? 264 : 94) + ((h % 21) - 10), cy = 104 + row * 89 + ((h >> 5) % 13) - 6, rot = ((h >> 9) % 27) - 13;
    const x = Math.max(4, Math.min(354 - w, cx - w / 2)), y = Math.max(52, Math.min(498 - hgt, cy - hgt / 2));
    return `<g transform="translate(${x.toFixed(0)} ${y.toFixed(0)}) rotate(${rot} ${w / 2} ${hgt / 2}) scale(${K})" color="${ppInk(p)}" filter="url(#pprough)" data-act="stampinfo" data-id="${esc(p.name)}" role="button" tabindex="0"
      aria-label="${esc(p.name)}: first flown over ${esc(fmtDate(p.at))}${p.n > 1 ? `, ${p.n} flights` : ""}"><g mask="url(#ppwear${h % 3})">${body}</g></g>`;
  }).join("");
  return `<svg viewBox="0 0 358 520" class="ppg" role="group" aria-label="Page ${n}"><rect width="358" height="520" rx="6" class="ppaper"/><rect width="358" height="520" rx="6" fill="url(#ppguil)"/>
    <g transform="translate(179 286) scale(6)" class="ppwm">${ppBird}</g>
    <text x="179" y="26" class="pphd">VISAS · VISAS</text><text x="179" y="42" class="ppjr"${head.length > 58 ? ` textLength="330" lengthAdjust="spacingAndGlyphs"` : ""}>${esc(head)}</text>
    ${stamps}<text x="${n % 2 ? 340 : 18}" y="508" class="pppn">${n}</text></svg>`;
}
// The photo page
function ppData(d) {
  const pp = d.passport || {}, me = S.me, n = (x) => Math.round(x).toLocaleString("en-GB"), up = (x) => esc(String(x || "–").toUpperCase());
  const [given, ...rest] = String(me.name || "").trim().split(/\s+/), sur = rest.join(" ") || given;
  // (the machine-readable lines, as a real passport has them: "<" for every space; escaped, as they're written into the page)
  const mrz = (x) => String(x).toUpperCase().normalize("NFD").replace(/[^A-Z0-9]+/g, "<");
  const line1 = esc(`P<IFL${mrz(sur)}<<${mrz(rest.length ? given : "")}`.padEnd(40, "<").slice(0, 40));
  const line2 = esc(`${String(pp.countries || 0).padStart(4, "0")}IF195<${pp.seas || 0}SEA${Math.round((d.km || 0) * 0.621371)}MI`.padEnd(40, "<").slice(0, 40));
  const birds = S.birds.slice(0, 2).map((b) => b.name).join(" · ");
  const f = (label, val, cls = "") => `<span class="ppf ${cls}"><small>${label}</small><b>${val}</b></span>`;
  return `<div class="ppdata"><div class="pptop"><b>PASSPORT</b><small>PASSEPORT · CHAT</small><em>TYPE P · LOFT</em></div>
    <div class="ppid"><span class="ppphoto">${avatar(me, "xl")}</span><span class="ppfs">${f("Surname / Nom", up(sur))}${f("Given names / Prénoms", up(rest.length ? given : ""))}${f("Home loft / Pigeonnier", up(me.place))}${f("Handle", `@${up(me.handle)}`)}</span></div>
    <div class="ppgrid">${f("Keeping pigeons since", up(d.since ? fmtDate(d.since).replace(/^\d+ /, "") : ""))}${f("Miles flown / Milles", `${n((d.km || 0) * 0.621371)} MI`)}
      ${f("Countries / Pays", `${pp.countries || 0} OF 195`)}${f("Seas / Mers", n(pp.seas || 0))}
      ${f("Furthest flight", d.longest?.place ? `TO ${up(d.longest.place)}` : "–")}${f("Pigeons", birds ? up(birds) : "–")}</div>
    <div class="ppsig"><svg viewBox="0 0 160 30" aria-hidden="true"><path d="M4 20c14-14 22 6 34-4s18-12 28 1 20 4 28-7 14 6 26 4"/></svg><small>Signature of bearer</small></div>
    <div class="ppmrz" aria-label="Machine readable zone">${line1}<br>${line2}</div></div>`;
}
const passportCover = () => `<svg viewBox="0 0 250 350" class="ppcover"><rect width="250" height="350" rx="14" class="ppleather"/><rect x="6" width="5" height="350" fill="rgba(0,0,0,.25)"/>
  <g class="ppgold"><text x="125" y="70" class="ppc1">CHAT</text><circle cx="125" cy="170" r="46"/><circle cx="125" cy="170" r="39" stroke-width="1"/>
  <g transform="translate(125 172) scale(2.9)" class="ppgoldf">${ppBird}</g><path d="M74 205c-14-14-16-38-4-56M176 205c14-14 16-38 4-56M70 196l-8-2M66 184l-8-1M66 171l-8 1M70 159l-7 4M180 196l8-2M184 184l8-1M184 171l8 1M180 159l7 4" stroke-width="1.6"/>
  <text x="125" y="270" class="ppc2">PASSPORT</text><text x="125" y="290" class="ppc3">PASSEPORT · PASAPORTE</text><rect x="111" y="312" width="28" height="18" rx="3" stroke-width="1.4"/><circle cx="125" cy="321" r="4.5" stroke-width="1.2"/></g></svg>`;
// the ink: a little rough at the edges, and worn in places (one set for the whole book)
const PP_DEFS = `<svg width="0" height="0" class="ppdefs" aria-hidden="true"><defs>
  <filter id="pprough" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="2" seed="3" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.6"/></filter>
  ${[0, 1, 2].map((i) => `<filter id="ppspk${i}"><feTurbulence type="fractalNoise" baseFrequency="${[0.9, 1.2, 0.7][i]}" numOctaves="2" seed="${i * 7 + 1}"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -2.2 ${[2.25, 2.4, 2.1][i]}"/></filter>
  <mask id="ppwear${i}" maskUnits="userSpaceOnUse" x="-20" y="-20" width="200" height="160"><rect x="-20" y="-20" width="200" height="160" filter="url(#ppspk${i})"/></mask>`).join("")}
  <pattern id="ppguil" width="60" height="24" patternUnits="userSpaceOnUse"><path d="M0 12c10-10 20-10 30 0s20 10 30 0M0 4c10-10 20-10 30 0s20 10 30 0M0 20c10-10 20-10 30 0s20 10 30 0" class="ppguilp"/></pattern></defs></svg>`;
// The book: the photo page, then each visa page; only those near the one open are drawn
function passportBook(d) {
  const pages = passportPages(d.passport || {});
  return `${PP_DEFS}<div class="ppbook" role="region" aria-label="Your passport">${[`<div class="ppage" data-i="0">${ppData(d)}</div>`, ...pages.map((_, i) => `<div class="ppage" data-i="${i + 1}"></div>`)].join("")}</div>
    <div class="pppager"><button type="button" class="nbtn" data-act="ppturn" data-id="-1" aria-label="Previous page">${I.back}</button><span class="pplbl" aria-live="polite"></span><button type="button" class="nbtn ppnext" data-act="ppturn" data-id="1" aria-label="Next page">${I.back}</button></div>
    ${pages.length ? "" : `<div class="gfoot">Each country and sea your pigeons fly over gets a stamp on the next page, once they’ve landed.</div>`}`;
}
function ppFill(book, d) {
  const pages = passportPages(d.passport || {}), at = Math.round(book.scrollLeft / Math.max(1, book.clientWidth));
  book.querySelectorAll(".ppage").forEach((el) => {
    const i = +el.dataset.i; if (!i) return;
    const near = Math.abs(i - at) <= 1;
    if (near && !el.firstChild) el.innerHTML = ppVisa(pages[i - 1], i);
    else if (!near && el.firstChild) el.innerHTML = "";
  });
  const lbl = $(".pplbl", $layer); if (lbl) lbl.textContent = at ? `Page ${at} of ${pages.length}` : pages.length ? "Photo page · swipe to turn" : "Photo page";
  $layer.querySelectorAll("[data-act=ppturn]").forEach((b) => { b.disabled = +b.dataset.id < 0 ? at <= 0 : at >= pages.length; });
  if (S.sheet?.type === "passport") S.sheet.page = at;
}
async function openPassport(trip) {
  const from = S.sheet?.type === "flightlog" ? S.sheet : null;
  const sh = S.sheet = { type: "passport", data: from?.data || null, back: !!from, trip };
  renderSheet();
  try {
    if (!sh.data) sh.data = await api("flight-log");
    await shapesLoad();
    if (S.sheet !== sh) return;
    if (trip) { const i = passportPages(sh.data.passport || {}).findIndex((pg) => pg.stamps.some((p) => p.trip === trip)); if (i >= 0) sh.page = i + 1; }
    renderSheet();
  } catch (err) { if (S.sheet === sh) { S.sheet = null; renderSheet(); } toast(esc(err.message)); }
}
// (kept until the Flight Log is left: renderSheet notes them as seen then)
let badgesSeen = null;
function badgesHtml(list) {
  if (!list.length) return "";
  // badges earned since this phone last looked get a "New" tag (remembered on this phone only)
  let seen = null; try { seen = JSON.parse(localStorage.getItem("inflight-badges") || "null"); } catch (_) {}
  const earned = list.filter((b) => b.earned).map((b) => b.id);
  badgesSeen = earned;
  const tile = (b) => {
    const [icon, tint] = BADGE_LOOK[b.id] || ["bird", "gray"], fresh = b.earned && seen && !seen.includes(b.id);
    return `<div class="badge2${b.earned ? " earned" : ""}"><span class="bico tile ${b.earned ? tint : "gray"}">${I[icon] || I.bird}</span>
      <b>${esc(b.name)}${fresh ? ` <i class="newb">New</i>` : ""}</b><small>${esc(b.desc)}</small>
      ${!b.earned && b.of ? `<i class="bprog" data-w="${b.progress.toFixed(3)}"></i><small class="bnum">${b.n.toLocaleString("en-GB")} of ${b.of.toLocaleString("en-GB")}</small>` : ""}</div>`;
  };
  return `<div class="ghead">Achievements <span class="gcount">${earned.length} of ${list.length}</span></div><div class="badges">${[...list].sort((a, b) => b.earned - a.earned).map(tile).join("")}</div>`;
}

// Rare pigeons: pick a look you've unlocked (everyone you send to sees it)
function skinsHtml(list, mine) {
  if (!list.length) return "";
  const tile = (id, name, open, sub) => `<button type="button" class="skin2${open ? "" : " locked"}${(mine || null) === id ? " on" : ""}" ${open ? `data-act="skin" data-id="${id || "usual"}"` : "disabled"} aria-pressed="${(mine || null) === id}">
      <span class="sbig">${pg("standard", id)}</span><b>${esc(name)}</b><small>${sub}</small></button>`;
  const seas = list.filter((k) => k.season), rare = list.filter((k) => !k.season);
  const ssub = (k) => (k.season.kept ? "Yours to keep" : `Until ${esc(fmtDate(k.season.until - 1))} · ${k.season.n} of ${k.season.of} sent to keep it`);
  return `<div class="ghead">Rare Pigeons <span class="gcount">${rare.filter((k) => k.open).length} of ${rare.length}</span></div>
    <div class="badges skins">${tile(null, "Usual", true, "Every pigeon")}${seas.map((k) => tile(k.id, k.name, k.open, ssub(k))).join("")}${rare.map((k) => tile(k.id, k.name, k.open, k.open ? "Unlocked" : `Earn ${esc(SKINS[k.id]?.badge || "its badge")}`)).join("")}</div>
    <div class="gfoot">Your friends see the look on every pigeon you send. Its colour still says what kind it is.</div>`;
}
// what a sheet shows when what it needed didn't come (no signal, a hiccup): why, and a way to try again
const loadFail = (msg, act, id) => `<p class="empty"><b>Couldn’t load this</b>${esc(msg || "Try again in a moment.")}</p><div class="stack"><button type="button" class="btn small plain" data-act="${act}"${id ? ` data-id="${esc(id)}"` : ""}>Try Again</button></div>`;
// which of your pigeons gets it
function wearItem(item, anchor) {
  if (!S.birds.length) return toast("Name a pigeon in Your Pigeons first.");
  openMenu(anchor, S.birds.map((b) => ({ label: b.name, sub: b.wear === item ? "Wearing it" : b.wear && WEAR[b.wear] ? `Has the ${WEAR[b.wear][0].toLowerCase()} on` : b.rank, act: "wearon", id: `${item}|${b.id}` })));
}
async function putOn(bird, item) {
  try {
    const r = await api("bird-wear", { method: "POST", body: { bird, item } });
    for (const b of S.birds) { if (item && b.wear === item) b.wear = null; if (b.id === bird) b.wear = item; }
    if (S.sheet?.type === "feathers") S.sheet.data = r;
    haptic("success"); renderSheet(); renderCompose();
    const b = S.birds.find((x) => x.id === bird);
    toast(item ? `${WEAR[item][1]} ${esc(b?.name || "Your pigeon")} has the ${esc(WEAR[item][0].toLowerCase())} on.` : `${esc(b?.name || "Your pigeon")} took it off.`);
  } catch (err) { toast(esc(err.message)); }
}
async function setSkin(id) {
  const skin = id === "usual" ? null : id;
  try {
    const r = await api("me", { method: "PATCH", body: { skin } });
    S.me = r.me || { ...S.me, skin };
    $(".kind", $compose).dataset.k = "";          // redrawn with the new look
    $layer.querySelectorAll(".skin2").forEach((b) => { const on = (b.dataset.id || "") === (skin || "usual"); b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
    renderCompose();                              // the chosen tile lights up; no banner over the sheet
  } catch (err) { toast(esc(err.message)); }
}
// On your pigeon's map: who it flew over, and who waved
function flyText(m) {
  const l = m.fly || []; if (!l.length) return "";
  const nm = (x) => first(friend(x.who)?.name || "a friend"), and = (a) => (a.length > 1 ? `${a.slice(0, -1).join(", ")} and ${a.at(-1)}` : a[0]);
  const w = l.filter((x) => x.waved);
  return w.length === 1 ? `${nm(w[0])} waved from ${w[0].place || "below"}` : w.length ? `${and(w.map(nm))} waved from below` : l.length === 1 ? `Flew over ${nm(l[0])}${l[0].place ? ` in ${l[0].place}` : ""}` : `Flew over ${and(l.map(nm))}`;
}
/* ---------- named pigeons ----------
   Up to five of yours, with names and careers (functions/_birds.js). They take
   turns carrying what you send: the one you pick, else the one that has
   rested longest. Miles bring rank and stamina (less rest between flights). */
const BIRDS_MAX = 5;
const wearWord = (w) => (w && WEAR[w] ? ` in ${/^[aeiou]/i.test(WEAR[w][0]) ? "an" : w === "shades" ? "" : "a"} ${WEAR[w][0].toLowerCase()}`.replace("  ", " ") : "");
const RANKS = [["Fledgling", 0], ["Courier", 500], ["Navigator", 2000], ["Veteran", 8000], ["Ace", 20000], ["Legend", 40075]];
const RANK_TILE = { Fledgling: "gray", Courier: "green", Navigator: "blue", Veteran: "indigo", Ace: "orange", Legend: "rocket" };
function birdState(b) {
  if (b.state === "flying") return `In the air · lands ${fmtLand(b.landAt)}`;
  if (b.state === "waiting") return "Booked to fly";
  return birdReady(b) ? "Ready" : `Resting · ready in ${fmtDur(b.busyUntil - now())}`;
}
// On a pigeon's map: who's carrying it (and, for yours, how far it has flown in all)
function birdLine(m) {
  const b = m.bird; if (!b) return "";
  const c = m.from === S.me.id && b.id ? [...S.birds, ...S.hall].find((x) => x.id === b.id) : null;
  return `<span class="birdline">${I.bird}Carried by ${esc(b.name)}${esc(wearWord(b.wear))} · ${esc(b.up || b.rank)}${c ? ` · ${fmtMiles(c.km)} in all` : ""}</span>`;
}

/* ---------- a sheet's form field (your password, asked again) ---------- */
function field(name, placeholder, type, ac, prefix) {
  return `<label class="fcell">${prefix ? `<span class="pre">${prefix}</span>` : ""}<input id="f-${name}" name="${name}" type="${type}" placeholder="${esc(placeholder)}" autocomplete="${ac}" aria-label="${esc(placeholder)}"${type === "email" || name === "handle" ? ' autocapitalize="off" spellcheck="false"' : ""}${name === "handle" ? ' maxlength="20"' : ""}>${type === "password" ? `<button type="button" class="peek" data-act="peek" aria-label="Show password">${I.eye}</button>` : ""}</label>`;
}
// Friends you and this friend both have (who a pigeon could stop over with), for How It Flies
const mutualsBusy = new Set();
async function loadMutuals(id) {
  if (mutualsBusy.has(id)) return; mutualsBusy.add(id);
  try { const r = await api("mutuals?with=" + encodeURIComponent(id)); S.mutuals = { chat: id, at: now(), ids: r.ids || [] }; if (S.sheet?.type === "flysheet" && S.chat === id) renderSheet(); }
  catch (_) { S.mutuals = { chat: id, at: now(), ids: [] }; }
  finally { mutualsBusy.delete(id); }
}
// Times worth a tap: this evening, tomorrow morning and evening, Saturday morning
function schedPresets() {
  const at = (days, h) => { const d = new Date(now()); d.setDate(d.getDate() + days); d.setHours(h, 0, 0, 0); return +d; };
  const out = [];
  if (at(0, 18) - now() > HOUR) out.push(["This Evening", at(0, 18)]);
  out.push(["Tomorrow Morning", at(1, 8)], ["Tomorrow Evening", at(1, 18)]);
  const sat = (6 - new Date(now()).getDay() + 7) % 7;
  if (sat > 1) out.push(["Saturday Morning", at(sat, 9)]);
  return out;
}
const localInput = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
let gifTimer = 0;
let addTimer = 0, addSeq = 0;
function addLookup() {
  clearTimeout(addTimer); const seq = ++addSeq;
  const i = $("#add-h", $layer), box = $(".addres", $layer); if (!i || !box) return;
  const h = i.value.trim().replace(/^@/, "").toLowerCase();
  // It folds open under the field from three letters (and away again under them), and the row stays put as you type:
  // its handle follows you and a spinner fades in over its last answer, until the new answer takes its place.
  // (no flashing between "Looking…" and an answer at every key, and nothing below jumps: styles.css .addres)
  if (h.length < 3) { box.classList.remove("has"); return; }
  const in1 = box.firstElementChild || box.appendChild(document.createElement("div")), was = $(".addrow", in1);
  const row = (sub, btn = "", cls = "", hd = h) => `<div class="group"><div class="cell addrow ${cls}"><span class="addav">${avatar({ name: hd }, "s", false, true)}<span class="spin"></span></span><span class="ctext"><span class="addh">@${esc(hd)}</span><span class="csub">${sub}</span></span>${btn}</div></div>`;
  if (was) { was.classList.add("looking"); $(".addh", was).textContent = `@${h}`; $(".csub", was).textContent = "Looking…"; const b = $(".btn", was); if (b) b.disabled = true; }
  else in1.innerHTML = row("Looking…", "", "looking");
  box.classList.add("has");
  addTimer = setTimeout(async () => {
    let r; try { r = await api("friend-status?h=" + encodeURIComponent(h)); } catch (_) { if (seq === addSeq) box.classList.remove("has"); return; }
    if (seq !== addSeq) return;                                     // typed on, or sent already (addGo: this answer's from before)
    if (($("#add-h", $layer)?.value || "").trim().replace(/^@/, "").toLowerCase() !== h) return;     // typed on
    const hd = r.handle || h, html = {
      invalid: `<p class="gfoot bad">Handles use 3 to 20 letters, numbers or underscores.</p>`,
      none: row("No one has that handle yet", `<button type="button" class="btn small gray" data-act="share">Invite</button>`, "dim looking", hd),
      self: row("That’s you", "", "looking", hd),
      new: row("On Chat", `<button type="button" class="btn small" data-act="addgo" data-id="${esc(r.handle)}">Add</button>`, "looking", hd),
      sent: row("Request sent · waiting for them", `<button type="button" class="btn small gray" data-act="cancelreq" data-id="${esc(r.id)}">Cancel</button>`, "looking", hd),
      incoming: row("Wants to be your friend", `<button type="button" class="btn small" data-act="accept" data-id="${esc(r.id)}">Accept</button>`, "looking", hd),
      friends: row("Already friends", `<button type="button" class="btn small gray" data-act="addchat" data-id="${esc(r.id)}">Message</button>`, "looking", hd),
      blocked: row("You blocked them", `<button type="button" class="btn small gray" data-act="unblock" data-id="${esc(r.id)}">Unblock</button>`, "looking", hd),
    }[r.state] || "";
    if (!html) { box.classList.remove("has"); return; }
    // (drawn still looking, then let go of that: the spinner fades out, the picture and the button in, the words after)
    in1.innerHTML = html;
    const nr = $(".addrow", in1); if (!nr) return;
    void nr.offsetWidth; nr.classList.remove("looking");
    if (!STILL.matches) $(".csub", nr).animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease" });
  }, 300);
}
// Add: the button folds into a circle, a pigeon flies out of it, and it lands as a green tick.
async function addGo(h, btn) {
  clearTimeout(addTimer); addSeq++;                                 // (an answer still on its way is from before this)
  const msg = $(".add-msg", $layer), row = $(".addres .addrow", $layer);
  const b = row?.querySelector("[data-act=addgo]") || (btn?.classList.contains("btn") ? btn : null);
  const still = STILL.matches, wait = (ms) => new Promise((r) => setTimeout(r, still ? 0 : ms));
  if (b) { b.style.width = `${b.offsetWidth}px`; b.disabled = true; void b.offsetWidth; b.classList.add("sending"); b.style.width = ""; b.innerHTML = `<span class="flyb">${I.bird}</span>`; }
  else btn?.classList.add("pulsing");
  let r, err;
  try { [r] = await Promise.all([api("friends", { method: "POST", body: { handle: h } }), wait(700)]); } catch (e) { err = e; }
  btn?.classList.remove("pulsing");
  const ok = r && /^Request sent|joined/.test(r.message);
  if (ok) {
    keepAdd(null);
    if (b) { b.classList.remove("sending"); b.classList.add("sent"); b.innerHTML = I.check; b.setAttribute("aria-label", "Sent"); }
    haptic("success");
    const sub = row?.querySelector(".csub"); if (sub) sub.textContent = /joined/.test(r.message) ? "You’re friends now" : "Request sent";
    if (!b && row) { row.classList.remove("looking", "dim"); row.querySelector(".btn")?.remove(); }   // (sent before its answer came: it says so instead)
    if (!b) toast(esc(r.message));
    await sync();
    await wait(1200);
    // ready for the next one (unless they've started typing another already)
    const i = $("#add-h", $layer);
    if (i && i.value.trim().replace(/^@/, "").toLowerCase() === h.toLowerCase()) { i.value = ""; $(".addres", $layer)?.classList.remove("has"); }
    if (msg) { msg.className = "gfoot add-msg"; msg.textContent = "Add another, or let them scan your code."; }
    if (S.sheet?.type === "addfriend") renderSheet();
    return;
  }
  if (b) { b.classList.remove("sending"); b.disabled = false; b.textContent = "Add"; }
  if (msg) { msg.textContent = err ? err.message : r.message; msg.classList.add("bad"); }
  await sync(); if (S.sheet?.type === "addfriend") { renderSheet(); addLookup(); }
}
// (typing in Add a Friend's handle, or the GIFs' search)
function sheetInput(e) {
  if (e.target.id === "add-h") { const m = $(".add-msg", $layer); if (m) m.classList.remove("bad"); return addLookup(); }
  if (e.target.id === "gif-q" && S.sheet?.type === "gifs") { clearTimeout(gifTimer); gifTimer = setTimeout(() => { if (S.sheet?.type !== "gifs") return; Object.assign(S.sheet, { q: e.target.value.trim(), list: [], next: 0, busy: false }); loadGifs(); }, 350); return; }
}

/* ---------- sheets ---------- */
// header: { left: {label, act}, right: {label, act} | {label, form}, strong }
// (Back to Privacy & Security, from Encryption and Passkeys: only where it's in the app, with no account page to have
// its settings: InFlite's menu has this phone's own, youMenu)
const toSecurity = () => (accountPage() ? null : { label: "Back", act: "securitysheet" });
function sheetHtml(title, body, { left, right = { label: "Done", act: "close" }, flush, plain, name } = {}) {
  const b = (x, cls) => !x ? ""
    : x.form ? `<button type="button" class="nbtn prominent ${cls}" data-act="submit" data-id="${esc(x.form)}" aria-label="${esc(x.label)}">${I.check}</button>`
    : `<button type="button" class="nbtn ${cls}" data-act="${x.act}"${x.id ? ` data-id="${esc(x.id)}"` : ""} aria-label="${esc(x.label)}">${x.act === "close" ? I.x : I.back}</button>`;
  return `<div class="scrim" data-act="close"></div><div class="sheet${plain ? " plainbg" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title || name || "")}"><div class="grab"></div>
    <header><span class="l">${b(left, "l")}</span>${title ? `<h2 tabindex="-1">${esc(title)}</h2>` : `<h2 class="sr" tabindex="-1">${esc(name || "")}</h2>`}<span class="r">${b(right, "r")}</span></header>
    <div class="body${flush ? " flush" : ""}">${body}</div></div>`;
}
let sheetTimer = 0, sheetType = null, sheetUpAt = -1e9, sheetLater = 0, sheetPath = [], sheetOnAt = -1e9, sheetLaterFull = false;
const sheetEntering = () => performance.now() - sheetUpAt < SHEET_IN_MS;
// A box that was already ticked stays still when its sheet redraws: only a new tick pops in.
const TICKED = "[aria-checked=true],[aria-pressed=true]";
const tickedKeys = (el) => new Set([...el.querySelectorAll(TICKED)].map(switchKey));
// (and one that was ticked and isn't now loses its fill gently: styles.css .unticked)
const keepTicks = (el, was) => {
  for (const b of el.querySelectorAll(TICKED)) if (was.has(switchKey(b))) b.classList.add("kept");
  for (const b of el.querySelectorAll("[aria-checked=false],[aria-pressed=false]")) if (was.has(switchKey(b))) b.classList.add("unticked");
};
// A copy of something just left or taken away, fading where it was, kept out of everything's way: in a closed shadow
// root of its own (styled as the page is, from a copy of its rules), so nothing can find it by mistake, whether the
// app looking for what's drawn, a screen reader or a test, and nothing in it can be reached
let ghostCSS = null;
// (the page's own theme rules, :root's, apply to the copy's host instead: it carries the theme too. A host matches
// only as :host(…), so :root[data-theme="dark"] becomes :host([data-theme="dark"]))
const ghostStyles = () => ghostCSS || (ghostCSS = (() => { const c = new CSSStyleSheet(); try { c.replaceSync([...document.styleSheets].flatMap((x) => { try { return [...x.cssRules].map((r) => r.cssText); } catch (_) { return []; } }).join("\n").replace(/:root((?:\[[^\]]*\]|:not\([^)]*\))+)/g, ":host($1)").replace(/:root\b/g, ":host")); } catch (_) {} return c; })());
const canGhost = () => !STILL.matches && typeof CSSStyleSheet.prototype.replaceSync === "function" && "adoptedStyleSheets" in Document.prototype;
function ghostHost(cls, ...parts) {
  const host = document.createElement("div"); host.className = cls; host.inert = true; host.setAttribute("aria-hidden", "true");
  host.setAttribute("data-theme", document.documentElement.getAttribute("data-theme") || "light");
  const sr = host.attachShadow({ mode: "closed" }); sr.adoptedStyleSheets = [ghostStyles()]; sr.append(...parts);
  return host;
}
// A sheet redrawn with what's on it changed (a switch that brings rows with it, a list arriving, a row signed out):
// each part that moved glides there from where it was, one that's new fades in, one that's gone fades out where it
// was, and a card that grew opens out. Where things were is measured on screen, so a redraw in the middle of one
// carries on from there. Each part is known by its button (or its row's), else by what it is and the heading it's under.
const FLIP_SEL = ":scope > *, :scope > :is(form, .nwrap, .addreqs, .profile-head, .wnhero) > *, :scope .group > *";
const headText = (h) => (h ? (h.firstChild?.nodeType === 3 ? h.firstChild.textContent : h.textContent).trim().slice(0, 30) : "");
function flipParts(root) {
  const n = new Map(), out = [];
  for (const el of root.querySelectorAll(FLIP_SEL)) {
    if (el.classList.contains("flipgone")) continue;
    const row = el.parentElement.classList.contains("group"), a = el.dataset.act ? el : row ? el.querySelector("[data-act]") : null;
    let k;
    if (a) k = `${a.dataset.act}|${a.dataset.id || ""}`;
    else {
      const box = row ? el.parentElement : el; let h = box.previousElementSibling;
      while (h && !h.classList.contains("ghead")) h = h.previousElementSibling;
      k = `${el.tagName}.${el.classList[0] || ""}|${headText(el.classList.contains("ghead") ? el : h)}|${row ? ($(".ctext > span", el)?.textContent || "").slice(0, 24) : ""}`;
    }
    const i = (n.get(k) || 0) + 1; n.set(k, i);
    out.push([i > 1 ? `${k}#${i}` : k, el]);
  }
  return out;
}
const flipOK = (body) => body && !body.classList.contains("flush") && !STILL.matches;
function flipRects(body) {
  const m = new Map(); if (!flipOK(body)) return m;
  for (const [k, el] of flipParts(body)) m.set(k, { el, r: el.getBoundingClientRect(), o: +getComputedStyle(el).opacity });
  return m;
}
function flipPlay(body, was) {
  if (!was?.size || !flipOK(body)) return;
  const ease = "cubic-bezier(.32,.72,0,1)", parts = flipParts(body), at = new Map(), keys = new Set(), br = body.getBoundingClientRect();
  const kept = new Map([...was.values()].map((w) => [w.el, w]));        // (a part left as it was, whatever it's called now)
  for (const [k, el] of parts) { keys.add(k); at.set(el, { k, r: el.getBoundingClientRect() }); }
  // (how far its nearest part that's moving too has moved: that part carries it the rest of the way)
  const carried = (el) => { for (let p = el.parentElement; p && p !== body; p = p.parentElement) { const c = at.get(p), w = c && (was.get(c.k) || kept.get(p)); if (w) return w.r.top - c.r.top; } return 0; };
  for (const [el, { k, r }] of at) {
    if (!r.height || r.bottom < 0 || r.top > innerHeight) continue;
    const w = was.get(k) || kept.get(el), busy = el.getAnimations({ subtree: true }).some((x) => x.animationName);
    if (!w) { if (!busy) el.animate([{ opacity: 0 }, { opacity: +getComputedStyle(el).opacity }], { duration: 240, delay: 60, easing: "ease", fill: "backwards" }); continue; }
    const dy = w.r.top - r.top - carried(el);
    if (Math.abs(dy) > 1) el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 340, easing: ease });
    if (el.classList.contains("group") && r.height > w.r.height + 1) el.animate([{ clipPath: `inset(0 0 ${r.height - w.r.height}px 0 round 26px)` }, { clipPath: "inset(0 round 26px)" }], { duration: 340, easing: ease });
    const o = +getComputedStyle(el).opacity;
    if (!busy && Math.abs(o - w.o) > 0.05) el.animate([{ opacity: w.o }, { opacity: o }], { duration: 220, easing: "ease" });     // (dimmed or brought back: .dim)
  }
  // gone: a whole section or line fades where it was (not a row in a card, nor a word in a heading: those just go)
  for (const [k, w] of was) {
    const p = w.el.parentElement;
    if (keys.has(k) || w.el.isConnected || !w.r.height || !p?.matches(".body, form, .nwrap, .addreqs") || w.r.bottom < br.top || w.r.top > br.bottom) continue;
    if (!canGhost()) continue;
    // (in the sheet as it was, for its rules: wrappers that make no box of their own)
    const ws = document.createElement("div"), wb = document.createElement("div"); ws.className = "sheet gwrap"; wb.className = "body gwrap";
    w.el.style.margin = "0"; wb.append(w.el); ws.append(wb);
    const g = ghostHost("flipgone", ws);
    Object.assign(g.style, { left: `${w.r.left - br.left}px`, top: `${w.r.top - br.top + body.scrollTop}px`, width: `${w.r.width}px` });
    body.append(g);
    const a = g.animate([{ opacity: w.o }, { opacity: 0 }], { duration: 200, easing: "ease", fill: "forwards" });
    a.onfinish = a.oncancel = () => g.remove(); setTimeout(() => g.remove(), 400);
  }
}
// Opening springs the sheet up and settles the screen back behind it; closing
// slides it away. Redrawing an open sheet doesn't replay its entrance, and a
// switch that changed still glides across.
let shownSheet = null;
function focusBack(from) {
  const a = document.activeElement; if (a && a !== document.body && !$layer.contains(a)) return;     // (somewhere already)
  const sel = from && `[data-act="${CSS.escape(from.act)}"]${from.id ? `[data-id="${CSS.escape(from.id)}"]` : ""}`;
  const b = sel && ($(sel, $view) || $(sel, $tabbar));
  if (b) { try { b.focus({ preventScroll: true }); } catch (_) {} } else focusTitle();
}
// (going back to a page you came from inside a sheet: How It Flies doesn't play itself in again)
let sheetBack = false;
function renderSheet(refresh) {
  // (the engine's send sheet gone some other way than its own Send or Cancel, a swipe or Escape: the page told it's
  // shut, so the frame never stays over it)
  if (ENGINE && engineOpen && S.sheet !== engineOpen) {
    const en = engineOpen.engine; engineOpen = null;
    // (one card's sheet in place of another's: that one's over, but the frame stays shown for this one)
    if (en && !en.finished) { en.done?.({ ok: false, why: "closed" }); if (!(S.sheet?.type === "send" && S.sheet.engine)) hubParent()?.closed?.(); }
  }
  if (ENGINE && S.sheet?.type === "send" && S.sheet.engine) engineOpen = S.sheet;
  if (S.scan && S.sheet?.type !== "scan") stopScan();
  if (S.sheet && !shownSheet && !APP.sheetFrom) APP.sheetFrom = APP.lastTap;
  if (!S.sheet && shownSheet) { const f = APP.sheetFrom; APP.sheetFrom = null; setTimeout(() => { if (!S.sheet) focusBack(f); }, 340); }
  if (S.sheet?.type !== "lookup" && (look.on || look.stream || look.camPending || look.watch != null)) lookStop();
  // the Flight Log's achievements seen: noted once you've left it (so a redraw while you're in it keeps their New tags)
  if (badgesSeen && S.sheet?.type !== "flightlog" && S.sheet?.type !== "passport") { try { localStorage.setItem("inflight-badges", JSON.stringify(badgesSeen)); } catch (_) {} badgesSeen = null; }
  // a question sheet replaced by anything else (a link, the lock, Back): it's answered "no" once this settles
  if (shownSheet !== S.sheet) { const was = shownSheet; shownSheet = S.sheet; if (S.moonReplay && S.sheet?.id !== S.moonReplay.id) S.moonReplay = null; if (was?.resolve && !was.done) setTimeout(() => was.resolve(was.type === "reauth" ? false : null), 0); }
  const open = $(".sheet, .viewer", $layer), closing = !!open?.classList.contains("closing");
  if (!S.sheet) {
    syncInert();
    root().classList.remove("sheeted"); sheetType = null;
    if (!open) { $layer.innerHTML = ""; return; }
    if (closing) return;
    // (from wherever it had got to: closed while still coming up, or while dragged, it goes from there)
    $layer.querySelectorAll(".sheet, .scrim, .viewer").forEach((e) => { freeze(e); e.classList.remove("still"); e.classList.add("closing"); });
    clearTimeout(sheetTimer); sheetTimer = setTimeout(() => { if (!S.sheet) $layer.innerHTML = ""; }, STILL.matches ? 220 : 330);
    return;
  }
  clearTimeout(sheetTimer); clearTimeout(sheetLater);
  // (a full redraw that was waiting isn't lost to a lighter one asked for after it: an avatar arriving, say)
  if (sheetLaterFull) { refresh = undefined; sheetLaterFull = false; }
  // the same sheet redrawn while it slides up (its plan, its friends arriving): that waits until it's up, all in
  // one go. Redrawing is a long moment's work on a phone, and doing it mid-slide made the sheet judder.
  // (and the same for one just gone on to inside it: a friend's loft, say, arriving)
  const slid = performance.now() - sheetUpAt, on = performance.now() - sheetOnAt, wait = Math.max(SHEET_SLIDE_MS - slid, SHEET_ON_MS - on);
  if (open && !closing && sheetType === S.sheet.type && wait > 0) { if (!refresh) sheetLaterFull = true; sheetLater = setTimeout(() => renderSheet(refresh), wait + 20); return; }
  const had = !!open && !closing, swapped = had && sheetType !== S.sheet.type;
  const before = had ? switchStates($layer) : null, ticked = had ? tickedKeys($layer) : null;
  const old = $(".sheet", $layer);
  // opened again while the last was still closing: up from where that one had got to, over the dimming as it was
  // (not from the bottom, with the screen behind showing through for a moment)
  const sc = $(".scrim", $layer), reopen = open && closing && open.classList.contains("sheet") && !STILL.matches
    ? { y: new DOMMatrix(getComputedStyle(open).transform === "none" ? undefined : getComputedStyle(open).transform).m42, o: sc ? +getComputedStyle(sc).opacity : 0 } : null;
  // the same sheet drawn again (fresh data): it stays where you'd scrolled it, and what you're typing in (or the
  // button you'd reached by keyboard) keeps its focus, and a field its caret
  const same = had && !swapped, top = same ? $(".sheet .body", $layer)?.scrollTop || 0 : 0;
  const fa = had && $layer.contains(document.activeElement) ? document.activeElement : null;
  const fe = same && fa?.id ? fa : null, fk = same && !fe && fa?.dataset?.act ? switchKey(fa) : null;
  const caret = fe && typeof fe.selectionStart === "number" ? [fe.selectionStart, fe.selectionEnd] : null;
  // gone on to another page in the sheet: the one left is kept, to slide away under the new one (and its colour, to fade from)
  const leaving = swapped && old && !STILL.matches ? { b: $(":scope > .body", old), h: $(":scope > header", old), top: $(":scope > .body", old)?.scrollTop || 0, bg: getComputedStyle(old).backgroundColor,
    cls: [...old.classList].filter((c) => !["go-on", "go-back", "still", "closing"].includes(c)).join(" ") } : null;
  const flipWas = same ? flipRects($(".sheet .body", $layer)) : null;
  sheetBack = swapped && sheetPath.includes(S.sheet.type);
  drawSheet(refresh);
  sheetType = S.sheet?.type || null;
  const now = $(".sheet", $layer);
  if (had && now && now !== old && same && sheetEntering()) {
    // redrawn as it comes up (its plan or friends arriving): it carries on from where it had got to, rather than
    // jumping the rest of the way up, and its rows keep growing
    const late = performance.now() - sheetUpAt;
    try { for (const a of $layer.getAnimations({ subtree: true })) if (a.animationName && a.animationName !== "fc-pick") a.currentTime = late; } catch (_) {}
    keepGlides($layer, before); keepTicks($layer, ticked);
    const body = $(".sheet .body", $layer); if (top && body && !body.scrollTop) body.scrollTop = top;
  } else if (had && now && now !== old) {
    $layer.querySelectorAll(".sheet, .scrim").forEach((e) => e.classList.add("still"));
    if (swapped) {
      // the way you've come through this sheet: one you came from is "back", anything else is "on"
      const i = sheetPath.indexOf(sheetType), back = i >= 0;
      sheetPath = back ? sheetPath.slice(0, i + 1) : [...sheetPath, sheetType];
      now.classList.add(back ? "go-back" : "go-on"); $(".sheet .body", $layer)?.classList.add(back ? "go-back" : "go-on"); sheetOnAt = performance.now();
      // the page left slides the other way as it fades, under the new one, its header fading over the new header:
      // never an empty sheet (a copy of the sheet as it was, in a shadow root: styles.css .gsheet)
      if (leaving?.b && canGhost()) {
        const gs = document.createElement("div"), grab = document.createElement("div");
        gs.className = `${leaving.cls} gsheet${back ? " back" : ""}`; grab.className = "grab";
        leaving.b.classList.remove("go-on", "go-back", "enter");
        gs.append(grab, ...(leaving.h ? [leaving.h] : []), leaving.b);
        const host = ghostHost("sheetghost", gs); now.append(host); leaving.b.scrollTop = leaving.top;
        setTimeout(() => host.remove(), SHEET_ON_MS + 60);
      }
      // from a light sheet to a dark one (the map and Look Up, a trip to the Moon), or back: its colour fades across
      const bg = getComputedStyle(now).backgroundColor;
      if (leaving?.bg && leaving.bg !== bg) now.animate([{ backgroundColor: leaving.bg }, { backgroundColor: bg }], { duration: 420, easing: "cubic-bezier(.32,.72,0,1)" });
      if (fa) $("h2", now)?.focus({ preventScroll: true });       // (the new page starts at its title, as a new screen does)
    }
    keepGlides($layer, before); keepTicks($layer, ticked);
    if (same) { const body = $(".sheet .body", $layer); if (top && body && !body.scrollTop) body.scrollTop = top; }
  }
  if (same && now) {
    const back = fe ? document.getElementById(fe.id) : fk ? [...$layer.querySelectorAll(`[data-act="${CSS.escape(fa.dataset.act)}"]`)].find((x) => switchKey(x) === fk) : null;
    if (back && back !== fa && !$layer.contains(document.activeElement)) { back.focus({ preventScroll: true }); if (caret) try { back.setSelectionRange(...caret); } catch (_) {} }
    flipPlay($(".sheet .body", $layer), flipWas);
  }
  if (!had && now) {
    sheetUpAt = performance.now(); sheetPath = [sheetType];
    if (reopen) { now.style.setProperty("--y1", `${reopen.y}px`); $(".scrim", $layer)?.style.setProperty("--o1", String(reopen.o)); }
    // (ready before a page is gone on to: built when there's nothing else to do, or, without that, once it's up)
    if (!ghostCSS && canGhost()) window.requestIdleCallback ? requestIdleCallback(() => ghostStyles(), { timeout: 2000 }) : setTimeout(() => ghostStyles(), SHEET_SLIDE_MS + 200);
  }
  root().classList.toggle("sheeted", !!$(".sheet", $layer)); syncInert();
  // a sheet that has just come up: a screen reader starts in it (not on the screen behind), unless a field has already taken focus
  if (!had && now && !now.contains(document.activeElement)) setTimeout(() => { if ($layer.contains(now) && !now.classList.contains("closing") && !now.contains(document.activeElement)) $("h2", now)?.focus({ preventScroll: true }); }, SHEET_SLIDE_MS);
}
// How a chat sends, unless you choose otherwise: Instant, or By Pigeon (a letter each time, by the pigeon the message box
// would pick now). The friend, or the group, sees a line when it changes
function drawWay(s) {
  const g = group(s.id), f = g ? null : friend(s.id), c = g || f;
  if (!c) return "";
  const w = wayOf(c), name = f ? esc(first(f.name)) : "";
  let by = "Every message flies by pigeon";
  if (S.chat === c.id) {
    try {
      const cs = composeState(), k = cs?.kind;
      if (k && KIND[k] && k !== "dumb" && k !== "mystery") { const ms = cs.g || cs.moon || SPACE_KINDS.includes(k) ? etaMs(cs, k) : plannedMs(cs, k); if (Number.isFinite(ms) && ms > 0) by = `Every message flies by ${k === "standard" ? "pigeon" : KIND[k].name}, landing in about ${durPad(ms)}`; }
    } catch (_) {}
  }
  const row = (v, icon, tile, label, sub) => `<button type="button" class="cell has-icon wayopt" role="radio" aria-checked="${w === v}" data-act="setway" data-id="${v}"><span class="tile ${tile}">${icon}</span><span class="ctext"><span>${label}</span><span class="csub">${sub}</span></span><span class="tickbox" aria-hidden="true">${I.check}</span></button>`;
  const note = f ? `${name} sees a line in your chat when this changes. You can still send any one message the other way, from the button in the message box.${f.pigeons === false ? ` ${name} has pigeons off: letters still land at their time, shown without the birds.` : ""}`
    : "Everyone in the group sees a line in the chat when this changes. You can still send any one message the other way, from the button in the message box.";
  return sheetHtml(f ? `Messages to ${first(f.name)}` : "Your messages to the group", `<p class="flyto">How this chat sends, unless you choose otherwise</p>
    <div class="group" role="radiogroup" aria-label="How this chat sends">${row("instant", I.bolt, "blue", "Instant", "Messages arrive as soon as you send them")}${row("pigeon", I.bird, "orange", "By Pigeon", esc(by))}</div>
    <div class="gfoot">${note}</div>`);
}
function drawSheet(refresh) {
  const s = S.sheet;
  if (refresh && s?.type !== "profile") return;
  if (!s) { $layer.innerHTML = ""; return; }
  const f = s.id ? friend(s.id) : null;
  switch (s.type) {
    case "lookup": return drawLook(s);
    case "send": $layer.innerHTML = drawSend(s); return;
    case "way": { const h = drawWay(s); if (!h) { S.sheet = null; $layer.innerHTML = ""; return; } $layer.innerHTML = h; return; }
    case "askback": $layer.innerHTML = drawAskBack(s); return;
    case "fromapps": $layer.innerHTML = drawFromApps(s); return;
    case "timetalk": $layer.innerHTML = drawTimeTalk(s); return;
    case "map": {
      const mm = s.id === "skies" || s.id === "preview" ? null : (S.msgs.get(S.chat) || []).find((x) => x.id === s.id);
      if (mm && moonOf(mm)) return drawMoonFlight(s, mm);
      if (!$(".map", $layer)) $layer.innerHTML = sheetHtml(s.id === "skies" ? "The Skies" : s.id === "preview" ? "The Way" : ((m) => m?.flock ? (m.flying ? "Pigeons in Flight" : "The Flights") : m && !m.flying ? "The Flight" : "Pigeon in Flight")((S.msgs.get(S.chat) || []).find((x) => x.id === s.id)), `<canvas class="map" role="img" aria-label="Map of the pigeon’s route. Drag to move, pinch to zoom."></canvas>
        <div class="mapctl glass"><button type="button" data-act="mapzoom" data-id="in" aria-label="Zoom in">${I.plus}</button><button type="button" data-act="mapzoom" data-id="out" aria-label="Zoom out">${I.minus}</button><button type="button" class="fitbtn" data-act="mapzoom" data-id="fit" aria-label="Show the whole route">${I.loc}</button><button type="button" class="globebtn" data-act="mapglobe" aria-pressed="false" aria-label="Globe or flat map">${I.globe}</button><button type="button" class="layerbtn" data-act="maplayers" aria-pressed="${windOn()}" aria-label="Wind map">${I.layers}</button></div>
        <div class="windtip" hidden></div><div class="birdtip glass" hidden></div>
        <div class="mapcard"></div>`, { flush: true, ...(s.id === "preview" ? { left: { label: "Back", act: "flysheet" } } : {}) });
      if (!$(".map", $layer)._g) { $(".map", $layer)._g = 1; mapGestures($(".map", $layer)); }
      if (!$(".mapcard", $layer)._g) { $(".mapcard", $layer)._g = 1; fcDrag($(".mapcard", $layer)); }
      return tickMap();
    }
    case "shareflight": {
      if ($(".shpick", $layer)) return;                            // already up: its pictures and switch update in place
      const m = (S.msgs.get(s.chat) || []).find((x) => x.id === s.id), mine = m?.from === S.me.id;
      $layer.innerHTML = sheetHtml("Share Flight", `
        <div class="shpick" role="radiogroup" aria-label="Picture">${SHARE_FMTS.map(([f, label, sub]) => `<button type="button" class="shopt ${f}" role="radio" aria-checked="${s.fmt === f}" data-act="sharefmt" data-id="${f}" aria-label="${label}: ${sub}">
          <span class="shimg">${s.urls[f] ? `<img src="${s.urls[f]}" alt="">` : `<span class="shwait" aria-hidden="true">${I.bird}</span>`}</span>
          <span class="shl"><b>${label}</b><small>${sub}</small></span></button>`).join("")}</div>
        <div class="group">${toggleCell({ act: "sharename", icon: I.person, tile: "blue", label: "Show My Name", sub: esc(`“${mine ? "Sent" : "Received"} by ${first(S.me.name)}”`), on: s.name })}</div>
        <div class="gfoot">Only the two places, the day and the flight go on the picture: never the message, and never your friend’s name.</div>
        <div class="sharego"><button type="button" class="btn wide" data-act="shareimg"${s.urls[s.fmt] ? "" : " disabled"}>${I.share}${canShareFiles() ? "Share" : "Save Image"}</button></div>`,
        { left: { label: "Back to the map", act: "shareback" } });
      return;
    }
    case "news":
      $layer.innerHTML = sheetHtml("Friends’ News", S.news?.length ? `<div class="group mt-s news">${S.news.map(newsRow).join("")}</div>
        <div class="gfoot">The last two weeks of your friends’ pigeons: new countries, postmarks, ranks, streaks and more. Never what anyone wrote, or where anyone is.</div>`
        : `<p class="empty"><b>No news yet</b>When your friends’ pigeons reach somewhere new, rise a rank or keep a streak going, it’ll show here.</p>`);
      return;
    case "feathers": {
      const w = s.data;
      if (!w) { $layer.innerHTML = sheetHtml("Coots", s.err ? loadFail(s.err, "feathers") : `<p class="empty">Counting your Coots Coins…</p>`); return; }
      const named = S.birds.length > 0;
      const item = (x) => `<div class="cell has-icon shopi${x.owned ? " owned" : ""}"><span class="tile emo" aria-hidden="true">${x.emoji}</span>
        <span class="ctext"><span>${esc(x.name)}</span><span class="csub">${x.owned ? (x.on ? `On ${esc(x.on.name)}` : "Yours") : `${x.price} Coots Coins`}</span></span>
        ${x.owned ? (named ? `<button type="button" class="btn small plain" data-act="wearitem" data-id="${esc(x.id)}">${x.on ? "Move" : "Put On"}</button>` : "")
          : `<button type="button" class="btn small" data-act="buyitem" data-id="${esc(x.id)}"${w.feathers >= x.price ? "" : " disabled"} aria-label="Buy for ${x.price} Coots Coins">${I.coin}${x.price}</button>`}</div>`;
      $layer.innerHTML = sheetHtml("Coots", `<div class="fhead"><span class="fico">${I.coin}</span><b>${w.feathers.toLocaleString("en-GB")}</b><span>Coots Coin${w.feathers === 1 ? "" : "s"}</span></div>
        <div class="ghead">Shop</div><div class="group">${w.items.map(item).join("")}</div>
        <div class="gfoot">${named ? "Accessories go on your named pigeons, and everyone they fly to sees them." : "Accessories go on your named pigeons. Name one in Your Pigeons first."}</div>
        <div class="ghead">How to Earn Them</div>
        <div class="group">${cell({ icon: I.bird, tile: "orange", label: "A pigeon of yours lands", val: "1–6", sub: "One more for every 250 miles" })}
          ${cell({ icon: I.globe, tile: "blue", label: "A new country or sea", val: "3", sub: "In your passport" })}
          ${cell({ icon: I.pin, tile: "red", label: "A new postmark", val: "10", sub: "Flying past somewhere famous" })}
          ${cell({ icon: I.flame, tile: "orange", label: "A streak reaches 7, 30 or 100 days", val: "10–100", sub: "For you both" })}</div>
        ${w.recent.length ? `<div class="ghead">Lately</div><div class="group">${w.recent.map((r) => `<div class="cell"><span class="ctext"><span>${esc(r.why)}</span><span class="csub">${esc(agoText(r.at))}</span></span><span class="val fdelta${r.n < 0 ? " spent" : ""}">${r.n > 0 ? "+" : "−"}${Math.abs(r.n)}</span></div>`).join("")}</div>` : ""}`);
      return;
    }
    case "birds": {
      const sub = (b) => `${esc(b.rank)} · ${fmtMiles(b.km)} · ${birdState(b)}`;
      const row = (b, hall) => `<button type="button" class="cell has-icon" data-act="bird" data-id="${esc(b.id)}"><span class="tile wtile ${b.lostAt ? "gray" : RANK_TILE[b.rank]}">${b.lostAt ? I.skull : I.bird}${hall ? "" : wearOn(b.wear)}</span>
        <span class="ctext"><span class="one">${esc(b.name)}</span><span class="csub">${!hall ? sub(b) : b.lostAt ? `Lost${b.lostPlace ? ` over ${esc(b.lostPlace)}` : ""} · ${fmtDate(b.lostAt)}` : `${esc(b.rank)} · ${fmtMiles(b.km)} · retired ${fmtDate(b.retiredAt)}`}</span></span>${chevSm}</button>`;
      const ranks = RANKS.slice(1).map(([r, km]) => `${r} at ${fmtMiles(km)}`).join(", ");
      $layer.innerHTML = sheetHtml("Your Pigeons", (S.birds.length
        ? `<div class="group mt-s">${S.birds.map((b) => row(b)).join("")}${S.birds.length < BIRDS_MAX ? cell({ act: "birdnew", icon: I.plus, tile: "green", label: "Name a New Pigeon", cls: "action" }) : ""}</div>
          <div class="gfoot">They take turns carrying what you send, and rest between flights. Miles bring rank: ${ranks}, once around the world.</div>`
        : `<div class="birdempty">${I.bird}<b>Name your pigeons</b><span>Give up to ${BIRDS_MAX} of your pigeons names. They take turns carrying what you send, gain miles and stamina, rise from Fledgling to Legend, and retire to your Hall of Fame.</span><button type="button" class="btn" data-act="birdnew">Name a Pigeon</button></div>`)
        + (S.hall.length ? `<div class="ghead">Hall of Fame</div><div class="group">${S.hall.map((b) => row(b, true)).join("")}</div>` : ""));
      return;
    }
    case "bird": {
      const b = [...S.birds, ...S.hall].find((x) => x.id === s.id); if (!b) { S.sheet = { type: "birds" }; return renderSheet(); }
      const active = !b.lostAt && !b.retiredAt, from = RANKS.find((r) => r[0] === b.rank)[1], rest = Math.round((0.5 - (0.4 * b.stamina) / 100) * 100), again = !!$(".sheet .bbar", $layer);
      const stat = (v, l) => `<div><b>${v}</b><span>${l}</span></div>`;
      $layer.innerHTML = sheetHtml("", `<div class="profile-head"><span class="birdbig tile wtile ${b.lostAt ? "gray" : RANK_TILE[b.rank]}">${I.bird}${active ? wearOn(b.wear) : ""}</span><span class="name">${esc(b.name)}</span>
          <span class="sub">${esc(b.rank)}${active ? ` · ${birdState(b)}` : b.lostAt ? " · Lost" : " · Retired"}</span></div>
        <div class="bstats">${stat(fmtMiles(b.km), "Flown")}${stat(b.flights, b.flights === 1 ? "Flight" : "Flights")}${stat(fmtMiles(b.longest), "Longest")}${stat(b.stamina, "Stamina")}</div>
        ${active && b.next ? `<div class="group"><div class="cell brank"><span class="ctext"><span>Next: ${esc(b.next.rank)}</span><span class="csub">${fmtMiles(b.next.km - b.km)} to go</span><i class="bbar" aria-hidden="true"><b></b></i></span></div></div>` : ""}
        <div class="gfoot">${b.lostAt ? `Lost${b.lostPlace ? ` over ${esc(b.lostPlace)}` : ""} on ${fmtDate(b.lostAt)}, to Pigeon Death.` : b.retiredAt ? `Retired to your Hall of Fame on ${fmtDate(b.retiredAt)}.`
          : `Stamina ${b.stamina}: after a flight it rests about ${rest}% as long as it flew. Stamina grows with every mile.`}</div>
        ${active ? `<div class="group mt">${cell({ act: "wearpick", id: b.id, icon: I.feather, tile: "yellow", label: "Wearing", val: b.wear && WEAR[b.wear] ? `${WEAR[b.wear][1]} ${esc(WEAR[b.wear][0])}` : "Nothing", chev: true })}</div>` : ""}
        ${active ? `<div class="group mt">${cell({ act: "birdrename", id: b.id, label: "Rename", cls: "action" })}${b.rank === "Legend" ? cell({ act: "birdretire", id: b.id, label: "Retire to the Hall of Fame", cls: "action" }) : ""}</div>
          ${b.rank === "Legend" ? `<div class="gfoot">${esc(b.name)} has flown once around the world. Retire it to your Hall of Fame to make room for a new pigeon.</div>` : ""}` : ""}`,
        { left: { label: "Back", act: "birds" }, name: b.name });
      // (its rank bar fills as the page opens; drawn again, it's just there)
      const bar = $(".bbar b", $layer), fill = () => { bar.style.width = `${(Math.max(0, Math.min(1, (b.km - from) / (b.next.km - from))) * 100).toFixed(1)}%`; };
      if (bar && b.next) again ? fill() : requestAnimationFrame(() => requestAnimationFrame(fill));
      return;
    }
    case "birdname": {
      if ($("#f-bname", $layer)) return;
      const b = s.id ? S.birds.find((x) => x.id === s.id) : null;
      $layer.innerHTML = sheetHtml(b ? "Rename" : "Name a Pigeon", `<form id="bname-form" data-form="birdname" novalidate>
          <div class="group mt-s"><label class="fcell"><input id="f-bname" name="name" placeholder="${b ? "New name" : "Biscuit, Captain, Pip…"}" maxlength="20" autocomplete="off" autocapitalize="words" aria-label="Pigeon name"></label></div>
          <div class="gfoot">${b ? "Its career stays as it is." : "It starts as a Fledgling."} Everyone it flies to sees its name.</div>${ferr}</form>`,
        { left: { label: "Back", act: "birdback" }, right: { label: b ? "Save" : "Add", form: "bname-form" } });
      if (b) $("#f-bname", $layer).value = b.name;
      return;
    }
    case "safety": {
      // Verify in person: who they are and where you stand at the top, then the two ways to check (scan each
      // other's code, or read out the digits), and a moment of celebration when they match
      const f = personById(s.id);
      if (!f) { S.sheet = null; return renderSheet(); }       // (they've gone: not a friend or in a group with you any more)
      const nm = esc(first(f.name || "your friend")), st = safeState(f), won = s.won && performance.now() - s.won < 1600;
      const say = { ok: `<span class="verified">${I.check}Verified in person</span>`, warn: `<span class="safesay">${I.warn}Their key changed</span>`, none: `<span class="safesay">Not verified yet</span>` }[st];
      const digits = `<div class="group safedig"><div class="digits">${(s.digits || []).map((d) => `<span>${d}</span>`).join("")}</div>
        <button type="button" class="safecopy" data-act="safecopy">Copy</button></div>`;
      $layer.innerHTML = sheetHtml("Safety Number", `
        <div class="profile-head safehero s-${st}${won ? " won" : ""}"><span class="safering">${avatar(f, "l")}<span class="safebadge" aria-hidden="true">${st === "warn" ? I.warn : st === "ok" ? I.check : I.shield}</span>
          ${won ? `<svg class="safewin" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="47"/></svg>` : ""}</span>
          <span class="name">${esc(first(f?.name || ""))}</span>${say}</div>
        ${f?.keyChanged ? `<div class="warn sheetwarn"><span>${wasVerified(f) ? `You verified ${nm} in person, and their key has changed since. Don’t trust it until you’ve verified again, together.` : `${esc(first(f.name))}’s key changed. Only trust it once these digits match on both phones.`}</span></div>
          ${digits}<div class="group mt">${cell({ act: "trustsafe", id: f.id, label: "They Match: Trust New Key", cls: "center action" })}</div>`
        : st === "ok" ? `<div class="safedone"><span class="tile green" aria-hidden="true">${I.check}</span><span class="wnt"><b>You checked together</b><small>Your safety numbers matched, so only you and ${nm} can read your messages. If ${nm}’s key ever changes, you’ll be told.</small></span></div>
          <div class="ghead">Your Safety Number</div>${digits}
          <div class="group mt">${cell({ act: "unverify", id: f.id, label: "Clear Verification", cls: "center destructive" })}</div>`
        : `<div class="safecard"><div class="safestep"><span class="stepn">1</span><span class="wnt"><b>Scan each other’s code</b><small>Hold your phones up together, or on a video call.</small></span></div>
            <div class="safeqr"><div class="qrbox">${qrSvg(safetyCode(s.digits), { title: `Your safety number with ${nm}, as a QR code` })}</div></div>
            <button type="button" class="btn wide" data-act="scansafe" data-id="${esc(f.id)}">${I.camera}Scan ${nm}’s Code</button></div>
          <div class="safestep out"><span class="stepn">2</span><span class="wnt"><b>Or compare these 60 digits</b><small>Read them out to each other. They’re the same on both phones.</small></span></div>
          ${digits}
          <div class="group mt">${cell({ act: "verifyok", id: f.id, icon: I.check, tile: "green", label: "Mark as Verified", sub: "The 60 digits match on both phones" })}</div>
          <div class="gfoot">If they match, only the two of you can read your messages. Not even the server could swap in a different key.</div>`}`,
        { left: s.from ? { label: "Back", act: s.from, id: s.backId } : null });
      return;
    }
    case "scan": {
      const p = s.any ? null : personById(s.id), who = s.any ? "your friend" : first(p?.name || "your friend");
      if (!s.bad && S.scan?.on && S.scan.sheet === s && $(".scanbox video", $layer)) return;   // already scanning: a redraw leaves the camera be
      $layer.innerHTML = sheetHtml("Scan Their Code", `<div class="scanbox"><video playsinline muted autoplay aria-label="Camera"></video><span class="scanframe" aria-hidden="true"></span></div>
        <p class="gfoot scanmsg" aria-live="polite">${s.bad ? (s.any ? "That code isn’t your safety number with any of your friends. On their phone, they open Safety Number from your name." : `This isn’t the same safety number. Don’t trust this chat with ${esc(who)} until your codes match.`) : `Point your camera at ${esc(who)}’s code: ${s.any ? "Safety Number, from your name, on their phone" : "Safety Number on their phone"}.`}</p>
        ${s.bad ? `<div class="group mt">${cell({ act: s.any ? "scanany" : "scansafe", id: s.id, label: "Try Again", cls: "center action" })}</div>` : ""}`, { left: { label: "Back", act: "scanback" } });
      if (!s.bad) startScan(p, s.any ? s.codes : safetyCode(s.back?.digits));
      return;
    }
    case "security": {
      // The settings, grouped (a password and passkeys are the account's: Your Account opens its page)
      const u = S.me, lock = !!lockPrefs();
      const unlockBy = isIOS() ? "Face ID or Touch ID" : /Android/.test(navigator.userAgent) ? "your fingerprint or face" : "your passkey";
      $layer.innerHTML = sheetHtml("Privacy & Security", `
        <div class="ghead">Account</div>
        <div class="group">
          ${cell({ act: u.emailOk === false && S.emailOn ? "confirmsend" : null, icon: I.mail, tile: "blue", label: "Email", val: esc(u.email), sub: u.emailOk === false ? `<span class="warnc">Not confirmed${S.emailOn ? " · tap to send the link again" : ""}</span>` : "" })}
          ${accountPage() ? `<button type="button" class="cell has-icon" id="to-account" data-act="accountopen"><span class="tile indigo">${I.person}</span><span class="ctext"><span>Your Account</span><span class="csub">Password, passkeys and devices, for every app on the site</span></span>${chevSm}</button>` : ""}
        </div>
        <div class="ghead">Encryption</div>
        <div class="group">
          ${encCell(true)}
        </div>
        <div class="ghead">This Phone</div>
        <div class="group">
          ${passkeysSupported() ? toggleCell({ act: "applock", icon: I.face, tile: "green", label: "Lock Chat", sub: lock ? "Hides your chats in the app switcher too" : S.passkeys.length ? `Ready · ${unlockBy[0].toUpperCase()}${unlockBy.slice(1).replace(/^Your /, "")}` : `Unlock with ${unlockBy}`, on: lock }) : ""}
          ${lock ? `<label class="cell"><span class="ctext"><span>Lock</span></span><span class="val">${LOCK_AFTER.find(([ms]) => ms === (lockPrefs().after || 0))?.[1] || "Immediately"}</span>${chevSm}
            <select class="overlay" data-act="lockafter" aria-label="When to lock">${LOCK_AFTER.map(([ms, l]) => `<option value="${ms}"${ms === (lockPrefs().after || 0) ? " selected" : ""}>${l}</option>`).join("")}</select></label>` : ""}
          ${cell({ act: "sessionssheet", icon: I.phone, tile: "blue", label: "Signed-In Phones", val: S.sessN || null, chev: true })}
        </div>
        <div class="ghead">Who Sees What</div>
        <div class="group">
          ${toggleCell({ act: "privacy", id: "showOnline", icon: I.clock, tile: "green", label: "Show When I’m Online", on: u.showOnline !== false })}
          ${toggleCell({ act: "privacy", id: "showTyping", icon: I.compose, tile: "teal", label: "Show When I’m Typing", on: u.showTyping !== false })}
          ${toggleCell({ act: "privacy", id: "receipts", icon: I.check, tile: "blue", label: "Read Receipts", on: u.receipts !== false })}
          ${toggleCell({ act: "privacy", id: "shareNews", icon: I.people, tile: "teal", label: "Share My News", sub: "Ranks, streaks, new countries", on: u.shareNews !== false })}
          ${toggleCell({ act: "privacy", id: "approxLocation", icon: I.loc, tile: "blue", label: "Approximate Location", sub: "About 10 km, not exact", on: !!u.approxLocation })}
          ${toggleCell({ act: "privacy", id: "shareTracker", icon: I.globe, tile: "indigo", label: "Live Tracker", sub: "On the public map, no names", on: u.shareTracker !== false })}
          ${cell({ act: "blockedsheet", icon: I.block, tile: "red", label: "Blocked", val: S.blocked.length || "None", chev: true })}
        </div>
        <div class="gfoot">Online, typing, read receipts and news work both ways: turn one off and you won’t see other people’s either. With online hidden, ticks still show, but not exactly when.</div>
        <details class="learn"><summary>How the live tracker works</summary><p>The tracker (chat.inflite.ai/tracker, on a computer) shows pigeons in the air as rough dots: never a name, a message, a route, or anywhere near where one set off, stops or lands. A pigeon shows only if both you and your friend leave this on.</p></details>`);
      const vb = $(".vbar b", $layer); if (vb) vb.style.width = `${vb.dataset.w}%`;     // (set here: the page allows no inline styles)
      return;
    }
    case "encryption": {
      // Your key, as the pattern you'd know and its digits; a way straight to verifying a friend (scan their code, and
      // whichever friend it is is found); and where you stand with each one, a tap from their safety number. What it
      // all means is folded away at the foot.
      const st = (f) => safeState(f), order = { warn: 0, none: 1, ok: 2 };
      const fr = [...S.friends].sort((a, b) => order[st(a)] - order[st(b)] || a.name.localeCompare(b.name)), ver = fr.filter((f) => st(f) === "ok").length;
      const pill = { ok: `<span class="spill ok">${I.check}Verified</span>`, warn: `<span class="spill bad">${I.warn}Key changed</span>`, none: `<span class="spill">Not checked</span>` };
      const fp = S.fp.split(" ");
      $layer.innerHTML = sheetHtml("Encryption", `
        <div class="wnhero keyhero">${keyArt(S.fp, "keyhuge")}<h2>Sealed with your key</h2><p class="mono">${fp.slice(0, 4).join(" ")}<br>${fp.slice(4).join(" ")}</p>
          <button type="button" class="btn small plain" data-act="copyfp">Copy</button></div>
        ${fr.length ? `<div class="group">${cell({ act: "scanany", icon: I.qr, tile: "blue", label: "Verify a Friend", cls: "action" })}</div>
          <div class="ghead">Friends <span class="gcount">${ver} of ${fr.length} verified</span></div>
          <div class="group">${fr.map((x) => `<button type="button" class="cell" data-act="safety" data-id="${esc(x.id)}" data-from="encryptionsheet">${avatar(x, "s")}<span class="ctext"><span class="one">${esc(first(x.name))}</span></span>${pill[st(x)]}${chevSm}</button>`).join("")}</div>`
        : `<p class="empty"><b>No friends yet</b>Once you add a friend, you can check your safety number with them here.</p>`}
        <details class="learn"><summary>How it works</summary><p>Only you and the people you write to can read your pigeons: not Chat, and no one in between. Your key is made on this phone; a locked copy lets you sign in on a new one, and only your password or passkey opens it. Every pigeon (its words, photos, voice and reactions) is sealed before it flies, so the server only carries sealed scrolls it can’t open. Your safety number with a friend is your two keys together: the same on both phones, and no one could have swapped in a different key. Your key changes only if you reset your password without a passkey, or make a new account, and your friends are told if it does.</p></details>`, { left: toSecurity() });
      return;
    }
    case "safetylist":
      $layer.innerHTML = sheetHtml("Safety Numbers", S.friends.length
        ? `<div class="ghead">Choose a friend</div><div class="group">${S.friends.map((x) => `<button class="cell" data-act="safety" data-id="${esc(x.id)}" data-from="safetylist">${avatar(x, "s")}<span class="ctext"><span class="one">${esc(first(x.name))}</span></span>${chevSm}</button>`).join("")}</div>
          <div class="gfoot">Each friend has a safety number you can compare to check your messages are private.</div>`
        : `<p class="empty"><b>No friends yet</b>Safety numbers appear once you add a friend.</p>`,
        { left: { label: "Back", act: "encryptionsheet" } });
      return;
    case "newmsg":
      $layer.innerHTML = sheetHtml("New Message", S.friends.length
        ? `<div class="group mt-s">${cell({ act: "newgroup", icon: I.people, tile: "green", label: "New Group", cls: "action" })}</div>
          ${S.groups.length ? `<div class="ghead">Groups</div><div class="group">${S.groups.map((g) => `<button class="cell" data-act="open" data-id="${esc(g.id)}">${gavatar(g, "s")}<span class="ctext"><span class="one">${esc(g.name)}</span><span class="csub one">${g.members.length} people</span></span>${chevSm}</button>`).join("")}</div>` : ""}
          <div class="ghead">To</div><div class="group">${S.friends.map((x) => `<button class="cell" data-act="open" data-id="${esc(x.id)}">${avatar(x, "s")}<span class="ctext"><span class="one">${esc(first(x.name))}</span><span class="csub one">${esc(x.place || "No location")}${pigeonsOn() && S.me.lat != null && x.lat != null ? ` · ${fmtDur(flightMs(haversineKm(S.me.lat, S.me.lon, x.lat, x.lon)))} by pigeon` : ""}</span></span>${chevSm}</button>`).join("")}</div>`
        : `<p class="empty"><b>No friends yet</b>Add a friend first.<br><button class="btn" data-act="addfriend">Add a Friend</button></p>`,
        { left: { label: "Cancel", act: "close" }, right: null });
      return;
    case "newgroup": case "groupadd": {
      // pick friends with a tick; a new group also gets a name
      const g = s.type === "groupadd" ? group(s.id) : null;
      const pool = S.friends.filter((x) => !g || !member(g, x.id)).sort((a, b) => a.name.localeCompare(b.name));
      const name = $("#f-gname", $layer)?.value ?? s.name ?? "";
      const old = $(".sheet .body", $layer), top = old ? old.scrollTop : 0, hadGo = !!$(".sheet > header [data-act=submit]", $layer);
      const rows = pool.map((x) => `<button type="button" class="cell pickrow" role="checkbox" aria-checked="${s.pick.has(x.id)}" data-act="gpick" data-id="${esc(x.id)}">${avatar(x, "s")}<span class="ctext"><span class="one">${esc(first(x.name))}</span><span class="csub one">${esc(x.place || "No location")}</span></span><span class="tickbox" aria-hidden="true">${I.check}</span></button>`).join("");
      const n = s.pick.size + (g ? g.members.length : 1);
      $layer.innerHTML = sheetHtml(g ? "Add People" : "New Group", `<form id="group-form" data-form="${g ? "groupadd" : "newgroup"}" novalidate>
          ${g ? "" : `<div class="group mt-s"><label class="fcell"><input id="f-gname" name="name" placeholder="Group name" maxlength="40" autocomplete="off" aria-label="Group name"></label></div>`}
          ${pool.length ? `<div class="ghead">${g ? "Your friends" : "Who’s in it"}</div><div class="group">${rows}</div>
            <div class="gfoot">${n > GROUP_MAX ? `Groups can have up to ${GROUP_MAX} people.` : `${n} ${n === 1 ? "person" : "people"}, including you. ${pigeonsOn() ? "Everyone gets their own pigeon, flying the real distance to them." : "Messages reach everyone at once."} People in a group see each other’s names, but only friends see where each other are.`}</div>`
            : `<p class="empty"><b>${g ? "Everyone’s already here" : "No friends yet"}</b>${g ? "All your friends are in this group." : "Add a friend first."}</p>`}
          ${ferr}</form>`,
        { left: g ? { label: "Back", act: "groupinfo" } : { label: "Cancel", act: "close" }, right: s.pick.size && n <= GROUP_MAX ? { label: g ? "Add" : "Create", form: "group-form" } : null });
      if ($("#f-gname", $layer)) $("#f-gname", $layer).value = name;
      if (top) $(".sheet .body", $layer).scrollTop = top;
      if (old && !hadGo) $(".sheet > header [data-act=submit]", $layer)?.classList.add("popin");     // (the ✓ pops in with the first one picked)
      return;
    }
    case "groupinfo": {
      const g = group(s.id); if (!g) { S.sheet = null; return renderSheet(); }
      const me = { ...S.me, id: S.me.id };
      const row = (p) => {
        const you = p.id === S.me.id, km = you ? null : memberKm(p);
        const bp = (x) => (pigeonsOn() && x != null ? ` · ${fmtDur(flightMs(x))} by pigeon` : "");
        const sub = you ? "You" : p.friend ? `${esc(p.place || "No location")}${bp(km)}` : `Friend of ${esc(first(member(g, p.addedBy)?.name || "a member"))}${bp(km)}`;
        // tap anyone for their safety number (friends of friends too)
        return you ? `<div class="cell">${avatar(me, "s")}<span class="ctext"><span class="one">${esc(first(p.name))}</span><span class="csub one">${sub}</span></span></div>`
          : `<button type="button" class="cell" data-act="safety" data-id="${esc(p.id)}" data-from="groupinfo" aria-label="${esc(first(p.name))}: safety number">${avatar(p, "s", p.friend)}<span class="ctext"><span class="one">${esc(first(p.name))}</span><span class="csub one">${p.keyChanged ? `<span class="keyw">${I.warn} Security key changed</span>` : sub}</span></span>${chevSm}</button>`;
      };
      const list = [S.me.id, ...others(g).sort((a, b) => memberKm(a) - memberKm(b)).map((p) => p.id)].map((id) => id === S.me.id ? { id, name: S.me.name } : member(g, id));
      $layer.innerHTML = sheetHtml("", `<div class="profile-head">${gavatar(g, "xl")}<span class="name">${esc(g.name)}</span><span class="sub">${g.members.length} people</span></div>
        <div class="ghead">People</div><div class="group">${list.map(row).join("")}
          ${g.members.length < GROUP_MAX ? cell({ act: "groupadd", id: g.id, icon: I.addp, tile: "green", label: "Add People", cls: "action" }) : ""}</div>
        <div class="gfoot">Only friends see where each other are. Anyone in the group can add their own friends. Tap someone for their safety number.</div>
        <div class="group mt">
          ${toggleCell({ act: "gmute", id: g.id, icon: I.moon, tile: "indigo", label: "Mute Notifications", sub: g.muted ? "No notifications or emails from this group" : "", on: g.muted })}
          ${cell({ act: "grouprename", id: g.id, icon: I.compose, tile: "gray", label: "Group Name", val: esc(g.name), chev: true })}
          ${cell({ act: "vanishask", id: g.id, icon: I.clock, tile: "indigo", label: "Disappearing Messages", val: g.vanish ? vanishSay(g.vanish.ms).replace(/^./, (c) => c.toUpperCase()) : "Off", chev: true })}
        </div>
        <div class="gfoot">${keepSay()}</div>
        <div class="group mt">${cell({ act: "groupleaveask", id: g.id, label: "Leave Group", cls: "center destructive" })}</div>`, { name: `${g.name}: group info` });
      return;
    }
    case "gifs": {
      // built once; searching and loading more only touch the grid
      if (!$("#gif-q", $layer)) {
        $layer.innerHTML = sheetHtml("GIFs", `<label class="search gifsearch">${I.search}<input type="search" id="gif-q" placeholder="Search GIPHY" autocomplete="off" enterkeyhint="search" aria-label="Search GIFs"></label>
          <div class="gifgrid" role="group" aria-label="GIFs"></div><p class="giphy">Powered by GIPHY. Searches go through Chat, so GIPHY doesn’t see who’s looking. What you send is end-to-end encrypted.</p>`,
          { left: { label: "Cancel", act: "close" }, right: null });
        $("#gif-q", $layer).value = s.q || "";
      }
      drawGifs();
      return;
    }
    case "flightlog": {
      const d = s.data;
      if (!d) { $layer.innerHTML = sheetHtml("Flight Log", `<p class="empty">Opening your flight log…</p>`); return; }
      const mi = d.km * 0.621371, lap = mi / 24901, hrs = d.hours;
      const tile = (val, label, sub = "") => `<div class="lstat"><b>${val}</b><span>${label}</span>${sub ? `<small>${sub}</small>` : ""}</div>`;
      const n = (x) => Math.round(x).toLocaleString("en-GB");
      const kinds = [...KINDS.map(([k]) => k), "dumb"].filter((k) => d.kinds[k]);
      const most = Math.max(1, ...kinds.map((k) => d.kinds[k]));
      $layer.innerHTML = sheetHtml("Flight Log", d.sent ? `
        <div class="loghero"><div class="globe" data-lap="${Math.min(1, lap % 1 || (lap >= 1 ? 1 : 0)).toFixed(3)}"><span>${lap >= 1 ? `${Math.floor(lap)}×` : `${Math.round(lap * 100)}%`}</span></div>
          <div class="ltext"><b>${n(mi)} mi</b><span>flown by your pigeons</span><small>${lap >= 1 ? `That’s ${lap.toFixed(1)} times around the world.` : `${Math.round(lap * 100)}% of the way around the world.`}</small></div></div>
        <div class="lstats">
          ${tile(n(d.sent), "Pigeons sent", d.flying ? `${d.flying} in the air now` : "")}
          ${tile(n(d.received), "Pigeons received")}
          ${tile(hrs >= 48 ? `${n(hrs / 24)} days` : `${n(hrs)} h`, "In the air", "landed pigeons, end to end")}
          ${tile(d.longest ? `${n(d.longest.km * 0.621371)} mi` : "–", "Longest flight", d.longest?.place ? `to ${esc(d.longest.place)}` : "")}
          ${tile(d.fastest ? `${n(d.fastest.kmh * 0.621371)} mph` : "–", "Fastest pigeon", d.fastest ? `a ${esc(KIND[d.fastest.kind]?.name.toLowerCase() || "")} pigeon` : "")}
          ${tile(d.tailwind ? `${n(d.tailwind * 0.621371)} mph` : "–", "Best tailwind")}
          ${tile(n(d.dodged || 0), "Storms dodged", "went around them")}
          ${tile(d.sheltered >= 1 ? `${n(d.sheltered)} h` : d.sheltered ? `${n(d.sheltered * 60)} min` : "–", "Sheltered", d.early ? `best wind: ${esc(fmtDur(d.early))} early` : "from storms")}
        </div>
        ${passportHtml(d.passport)}
        ${postmarksHtml(d.postmarks)}
        ${badgesHtml(d.badges || [])}
        ${skinsHtml(d.skins || [], S.me.skin)}
        ${kinds.length ? `<div class="ghead">By pigeon</div><div class="group">${kinds.map((k) => `<div class="cell has-icon kindrow"><span class="tile ${k === "dumb" ? "gray" : k}">${I.bird}</span><span class="ctext"><span>${KIND[k].name}</span><i class="kbar ${k}" data-w="${(d.kinds[k] / most).toFixed(3)}"></i></span><span class="val">${n(d.kinds[k])}</span></div>`).join("")}</div>` : ""}
        <div class="group mt">${cell({ icon: I.skull, tile: "red", label: "Lost to Pigeon Death", val: n(d.lost) })}${cell({ icon: I.homing, tile: "blue", label: "Called back", val: n(d.recalled) })}</div>
        <div class="gfoot">Since ${fmtDate(d.since)}. Worked out from distances and times only: what you wrote stays between you and your friends.</div>`
        : `<p class="empty"><b>No flights yet</b>Send your first pigeon and its miles start here.</p>${(d.skins || []).some((k) => k.season) ? skinsHtml(d.skins, S.me.skin) : ""}`);
      // sizes set from code (inline style attributes are blocked)
      $layer.querySelectorAll("[data-lap]").forEach((el) => el.style.setProperty("--lap", el.dataset.lap));
      $layer.querySelectorAll(".kbar[data-w], .bprog[data-w]").forEach((el) => el.style.setProperty("--w", el.dataset.w));
      return;
    }
    case "vianote": {
      if ($("#f-vianote", $layer)) return;
      const m = (S.msgs.get(s.chat) || []).find((x) => x.id === s.id), to = m && friend(m.finalTo);
      $layer.innerHTML = sheetHtml("Add a Line", `<form id="vianote-form" data-form="vianote" novalidate>
        <div class="group mt-s"><label class="fcell"><textarea id="f-vianote" rows="3" maxlength="200" placeholder="Say something to ${esc(first(to?.name || "them"))}" aria-label="Your line"></textarea></label></div>
        <div class="gfoot">It flies on with the pigeon, end-to-end encrypted: only ${esc(first(to?.name || "they"))} can read it, when it lands. You can add one line.</div>${ferr}</form>`,
        { left: { label: "Cancel", act: "close" }, right: { label: "Add", form: "vianote-form" } });
      return;
    }
    case "passport": {
      const d = s.data, left = s.back ? { label: "Back", act: "flightlogback" } : undefined;
      if (!d || !APP.SHAPES) { $layer.innerHTML = sheetHtml("Passport", `<p class="empty">Opening your passport…</p>`, { left }); return; }
      if (s.drawn === d && $(".ppbook", $layer)) return ppFill($(".ppbook", $layer), d);          // (already open: just the pages near the one you're on)
      s.drawn = d;
      $layer.innerHTML = sheetHtml("Passport", passportBook(d), { left });
      const book = $(".ppbook", $layer);
      if (s.page) book.scrollLeft = s.page * book.clientWidth;
      ppFill(book, d);
      let tm = 0; book.addEventListener("scroll", () => { clearTimeout(tm); tm = setTimeout(() => ppFill(book, d), 60); }, { passive: true });
      return;
    }
    case "flysheet": {
      // How it flies: when it would land (up top), which pigeon, who carries it,
      // which way (and a picture of it), when it lands and where it stops
      const c = s.chat === S.chat ? composeState() : null;
      if (!c) { S.sheet = null; return renderSheet(); }
      const { g, f, t, sched, via, can, kind } = c, who = esc(first(g ? g.name : f.name));
      if (c.moon && !g) return drawLunarFly(c);
      const turn = g ? "Not your turn" : t.state === "outbound" ? "Yours is still on its way" : t.state === "inbound" ? `${who}’s is on its way` : `${who}’s turn first`;
      const when = (k) => (g ? landHint(c, k).replace(/^Lands/, "lands") : `lands ${atTime(sched ? sched.at : now() + plannedMs(c, k))}`);
      const style = routeStyle(), mapped = !g && !via && !sched && kind && kind !== "mystery" && kind !== "orbital" && f.lat != null && S.me.lat != null;
      const plans = mapped ? routePlanFor(f.id, kind)?.plans : null, plan = plans?.[style];
      // the top: when it lands, how long that is, where to, and the weather on the way
      const landAt = !kind || kind === "mystery" || g ? null : sched ? sched.at : now() + plannedMs(c, kind);
      const big = !kind ? "No pigeon free" : kind === "mystery" ? "Who knows when?" : g ? landHint(c, kind) : `Lands ${atTime(landAt)}`;
      const to = g ? `to ${esc(g.name)} · ${others(g).length + 1} people` : `to ${who}${f.place ? ` in ${esc(f.place)}` : ""}${S.me.lat != null && f.lat != null ? ` · ${plan?.km != null ? milesOf(plan.km, plan.legs) : fmtMiles(chatKm(f))}` : ""}`;      // (flown, and any stretch by ship)
      const adv = !g && kind && kind !== "dumb" && kind !== "orbital" && !sched && !via ? wxAdvice(f, kind) : null, wxNow = !g && S.wxPlan.get(f.id)?.d?.now;
      const sure = landAt ? landRange(landAt, now(), { wind: plan?.wind, legs: plan?.legs, sure: plan?.spread }) : null;          // (how sure that is)
      const wx = kind === "orbital" ? null : adv?.early ? ["early", I.wind, `${fmtDur(adv.early)} early on a tailwind`] : adv?.late ? ["late", I[(adv.wx && WX[adv.wx.k]?.[1]) || "storm"], `${fmtDur(adv.late)} late: ${adv.wx && WX[adv.wx.k] ? WX[adv.wx.k][0] : "rough weather"}`]
        : wxNow ? ["clear", I.sun, "Clear skies"] : null;
      const hero = `<div class="flyhero">${kind ? pg(kind, S.me.skin) : `<span class="pg none" aria-hidden="true">${I.bird}</span>`}
        <span class="fht"><b class="fhbig">${esc(big)}</b><span class="flyto">${landAt && !sched && sure ? `likely ${esc(rangeText(sure))} · ` : ""}${landAt ? `in ${esc(fmtDur(landAt - now()))} · ` : ""}${to}</span>
        ${wx ? `<span class="fhwx ${wx[0]}">${wx[1]}${esc(wx[2])}</span>` : ""}</span></div>`;
      // the pigeons, each with a bar for how long it would take
      const most = Math.max(1, ...KINDS.map(([k]) => plannedMs(c, k) || 0));
      const kinds = KINDS.map(([k, name]) => {
        const left = S.me[k] || 0, next = S.me[k + "NextAt"];
        const sub = k === "standard" ? (sched ? "Can’t be booked ahead" : t.free ? `Free · ${when(k)}` : turn)
          : left ? `${left} left · ${when(k)}` : `None left${next ? ` · next in ${fmtDur(next - now())}` : ""}`;
        return `<button type="button" class="cell kc k-${k}" role="radio" aria-checked="${k === kind}" data-act="pigeon" data-id="${k}"${can[k] ? "" : " disabled"}>${pg(k, S.me.skin)}
          <span class="ctext"><span>${name}</span><span class="csub">${esc(sub)}</span><i class="kdur" data-w="${((plannedMs(c, k) || 0) / most).toFixed(3)}"></i></span><span class="val">${fmtDur(plannedMs(c, k))}</span><span class="ck" aria-hidden="true">${I.check}</span></button>`;
      }).join("");
      const myLeft = S.me.mystery || 0, myNext = S.me.mysteryNextAt;
      const mystery = `<button type="button" class="cell kc" role="radio" aria-checked="${kind === "mystery"}" data-act="pigeon" data-id="mystery"${can.mystery ? "" : " disabled"}>${pg("mystery")}
          <span class="ctext"><span>Mystery</span><span class="csub">${esc(sched ? "Can’t be booked ahead" : myLeft ? "1 a day · any pigeon, any time" : `Used today${myNext ? ` · next in ${fmtDur(myNext - now())}` : ""}`)}</span></span><span class="val">?</span><span class="ck" aria-hidden="true">${I.check}</span></button>`;
      // by orbit: up, round the Earth, and down on the first pass near them (hours, however near or far)
      const orb = c.orbit ? ((ms) => `<button type="button" class="cell kc k-orbital" role="radio" aria-checked="${kind === "orbital"}" data-act="pigeon" data-id="orbital"${can.orbital ? "" : " disabled"}>${pg("orbital")}
          <span class="ctext"><span>Orbital</span><span class="csub">${esc(sched || via ? "Straight there, now" : S.me.orbital ? `${S.me.orbital} left · ${when("orbital")}` : `None left${S.me.orbitalNextAt ? ` · next in ${fmtDur(S.me.orbitalNextAt - now())}` : ""}`)}</span></span><span class="val">${fmtDur(ms)}</span><span class="ck" aria-hidden="true">${I.check}</span></button>`)(etaMs(c, "orbital")) : "";
      const bd = kind ? birdFor() : null, busy = (b) => (b.state === "flying" ? "Flying" : b.state === "waiting" ? "Booked" : "Resting");
      const carriers = S.birds.length && kind ? `<div class="ghead">Carried By<button type="button" class="gmore" data-act="birds">Your Pigeons</button></div><div class="carriers chiprail" role="radiogroup" aria-label="Carried by">${S.birds.map((b) =>
        `<button type="button" class="cc" role="radio" aria-checked="${bd?.id === b.id}" data-act="birdset" data-id="${esc(b.id)}"${birdReady(b) ? "" : " disabled"}><span class="ccav" aria-hidden="true">${esc([...b.name][0] || "?")}</span><span><b>${esc(b.name)}</b><small>${birdReady(b) ? esc(b.rank) : busy(b)}</small></span></button>`).join("")}
        <button type="button" class="cc" role="radio" aria-checked="${!bd}" data-act="birdset" data-id="none"><span class="ccav any" aria-hidden="true">${I.bird}</span><span><b>Any Pigeon</b><small>No name</small></span></button></div>` : "";
      // which way: three to pick from, each with when it would land; then the way itself, as a line with its stops
      const route = via ? "" : `<div class="ghead">Route</div>${routeSeg(style, mapped && plans ? plansNow(now(), kind) : null)}${mapped ? "" : `<div class="gfoot">${esc(ROUTES.find((x) => x[0] === style)[2])}.</div>`}`;
      const way = !mapped ? "" : plan ? wayCard(plan, S.routePlan.data, style) : `<div class="waycard loading"><span class="wayhd"><b>See the Way</b></span><span class="wayline"><i></i></span><span class="waywords">Looking at the sky ahead…</span></div>`;
      // when it lands: as soon as it can, or a time worth a tap that it can make (it waits in your loft and leaves in time to land then), or another
      const chip = (act, id, on, b, small, off, av = "") => `<button type="button" class="cc" role="radio" aria-checked="${on}" data-act="${act}"${id != null ? ` data-id="${esc(String(id))}"` : ""}${off ? " disabled" : ""}>${av}<span><b>${b}</b><small>${small}</small></span></button>`;
      // by sea: a standard pigeon whose way crosses an ocean takes a ship, unless its sender's in a hurry
      const rd = mapped ? S.routePlan?.data : null, alone = rd?.noShip?.[kind]?.[style], shipped = rd?.kinds?.[kind]?.[style];
      const sh = shipped && shipOf(shipped.legs);
      const sea = alone && sh ? `<div class="ghead">By Sea</div><div class="carriers chiprail" role="radiogroup" aria-label="By sea">
          ${chip("shipset", "ship", !noShipOn(), "Take a Ship", `${esc(sh.from)} to ${esc(sh.to)} · ${esc(atTime(shipped.deliverAt + now() - rd.at))}`, false, `<span class="ccav when" aria-hidden="true">${I.ship}</span>`)}
          ${chip("shipset", "fly", noShipOn(), "Fly It All the Way", `No ships · ${esc(atTime(alone.deliverAt + now() - rd.at))}`, false, `<span class="ccav when" aria-hidden="true">${I.bird}</span>`)}</div>
          <div class="gfoot">${noShipOn() ? `In a hurry: it flies across ${esc(sh.sea)} itself, a long way with nowhere to land${S.me.risky ? ", and Pigeon Death’s odds go up" : ""}.` : `Too far to fly across ${esc(sh.sea)}, so it rides a ship. In a hurry? It can fly it all the way.`}</div>` : "";
      let landing = "", stop = "";
      if (!g) {
        const sk = schedKind(), ms = sk ? flightMs(chatKm(f), mySpeed(sk)) : 0, presets = schedPresets(), cur = sched?.at, other = cur && !presets.some(([, at]) => at === cur);
        landing = `<div class="ghead">When It Lands</div><div class="carriers chiprail" role="radiogroup" aria-label="When it lands">
          ${chip("schednow", null, !cur, "Soonest", kind && kind !== "mystery" ? esc(atTime(now() + plannedMs({ ...c, sched: null }, kind))) : "As soon as it can", false, `<span class="ccav when" aria-hidden="true">${I.bird}</span>`)}
          ${sk ? presets.filter(([, at]) => at - ms >= now() || cur === at).map(([label, at]) => chip("schedset", at, cur === at, esc(label), esc(atShort(at)))).join("") : ""}
          ${chip("schedule", null, !!other, other ? esc(atShort(cur)) : "Another Time", other ? "Your time" : sk ? "Pick one" : "Swift or faster", !sk, `<span class="ccav when" aria-hidden="true">${I.clock}</span>`)}</div>`;
        // a stop on the way: straight there, or with a friend you both have (and how much longer that takes)
        const mu = S.mutuals?.chat === f.id ? S.mutuals : null;
        if (!mu || now() - mu.at > 5 * MIN) loadMutuals(f.id);
        const pals = S.me.lat != null && f.lat != null ? (mu?.ids || []).map(friend).filter((p) => p?.lat != null).slice(0, 8) : [];
        if (pals.length || via) {
          const sp = mySpeed(kind && KIND[kind] ? kind : "standard"), direct = flightMs(chatKm(f), sp);
          const extra = (p) => flightMs(haversineKm(S.me.lat, S.me.lon, p.lat, p.lon), sp) + HOUR + flightMs(haversineKm(p.lat, p.lon, f.lat, f.lon), sp) - direct;
          stop = `<div class="ghead">Stop Over</div><div class="carriers chiprail" role="radiogroup" aria-label="Stop over">
            ${chip("viaclear", null, !via, "Straight There", "No stop", false, `<span class="ccav when" aria-hidden="true">${I.up}</span>`)}
            ${pals.map((p) => chip("viaset", p.id, via?.id === p.id, esc(first(p.name)), `${p.place ? `${esc(p.place)} · ` : ""}+${esc(fmtDur(Math.max(0, extra(p))))}`, false, avatar(p, "xs"))).join("")}</div>`;
        }
      }
      // (it plays in when it opens; redrawn for a new choice, only what changed moves)
      const old = $(".sheet .body", $layer), fresh = !$(".flyhero", $layer), top = old && !fresh ? old.scrollTop : 0;
      const rails = fresh ? [] : [...$layer.querySelectorAll(".sheet .chiprail")].map((r) => r.scrollLeft);
      const nowKey = { kind, style, land: landAt && Math.round(landAt / MIN) }, was = s.shown || (fresh && sheetBack ? nowKey : {});
      // (each pigeon's bar as it was, so a new plan's times grow or shrink them from there; and whether the way was still coming)
      const barW = fresh ? null : new Map([...$layer.querySelectorAll(".sheet .kinds .kc")].map((r) => [r.dataset.id, $(".kdur", r)?.getBoundingClientRect().width || 0])), wasLoading = !!$(".sheet .waycard.loading", $layer);
      const orbNote = kind === "orbital" ? (() => { const o = spaceFlight("orbital", asSent(endFor(S.me)), asSent(endFor(f)), now()); return `<div class="gfoot">It lifts off into orbit 250 miles up, goes round the Earth every 92 minutes at 17,000 mph, and comes down on the first pass near ${who}: ${((n) => `${n} lap${n === 1 ? "" : "s"}`)(Math.max(1, Math.round(o.laps)))} this time, then a gliding re-entry. Nearer isn’t quicker.</div>`; })() : "";
      $layer.innerHTML = sheetHtml("How It Flies", `${hero}<div class="group kinds" role="radiogroup" aria-label="Pigeon">${kinds}${mystery}${orb}</div>${orbNote}${kind === "orbital" ? "" : `${carriers}${landing}${stop}${route}${way}${sea}`}
        ${!carriers && (S.birds.length || S.hall.length) ? `<div class="group mt">${cell({ act: "birds", icon: I.bird, tile: "orange", label: "Your Pigeons", chev: true })}</div>` : ""}
        ${kind === "mystery" ? `<div class="gfoot">Your mystery pigeon could be anything from a rocket to a dumb one. You’ll find out as it takes off.</div>` : ""}
        ${c.moon && g ? `<div class="gfoot">${S.me.moon ? (worldOf(S.me) === "mars" ? "You’re on Mars, so every pigeon you send here goes as a laser pigeon, at the speed of light." : "You’re on the Moon, so every pigeon you send here goes as a lunar pigeon: about 3 days to Earth.")
          : others(g).filter((p) => p.onMoon).map((p) => `${esc(first(p.name))} is on ${worldOf(p) === "mars" ? "Mars: theirs goes as a laser pigeon, in minutes" : "the Moon: theirs goes as a lunar pigeon, about 3 days"}.`).join(" ")}</div>` : ""}
        ${S.me.risky ? `<div class="gfoot">Pigeon Death is on: 1.25× faster, but 1 in ${plan?.risk ? Math.round(1 / plan.risk.p) : style === "safe" && !via ? 200 : 100} is lost on the way${plan?.risk && riskWhy(plan.risk) ? ` (this way: ${esc(riskWhy(plan.risk))})` : ""}.</div>` : ""}`);
      const body = $(".sheet .body", $layer); body.classList.add("flysheet"); if (top) body.scrollTop = top;
      // the chip just tapped gives a little bounce
      if (S.flyTap) { const k = S.flyTap; S.flyTap = null; body.querySelector(`.chiprail [data-act="${k.dataset.act}"]${k.dataset.id ? `[data-id="${CSS.escape(k.dataset.id)}"]` : ""}`)?.classList.add("picked"); }
      body.querySelectorAll(".chiprail").forEach((r, i) => { r.scrollLeft = rails[i] || 0; const on = $("[aria-checked=true]", r); if (on && fresh) r.scrollLeft = Math.max(0, on.offsetLeft - 16 - (r.clientWidth - on.offsetWidth) / 3); });
      // (redrawn as it comes up: its rows keep growing, renderSheet keeps their place; come back to from The Way, it doesn't play in again)
      const entering = (fresh && !sheetBack) || sheetEntering();
      body.classList.toggle("enter", entering);
      if (!entering && was.land !== nowKey.land) $(".flyhero", body).classList.add("chg");
      if (!entering && (was.style !== style || was.kind !== kind)) $(".waycard", body)?.classList.add("chg");
      s.shown = nowKey;
      flyBits(body, fresh ? null : was.style);
      if (barW && !entering && !STILL.matches) body.querySelectorAll(".kinds .kc").forEach((r) => {
        const k = $(".kdur", r), a = barW.get(r.dataset.id), b = k?.getBoundingClientRect().width;
        if (a && b && Math.abs(a - b) > 1) k.animate([{ transform: `scaleX(${a / b})` }, { transform: "none" }], { duration: 450, easing: "cubic-bezier(.32,.72,0,1)" });
      });
      if (wasLoading && !entering) $(".waycard:not(.loading)", body)?.classList.add("chg");        // (the way arriving late: its stops pop on)
      return;
    }
    case "via": {
      const f = friend(s.chat); if (!f) { S.sheet = null; return renderSheet(); }
      const k = S.sendKind && S.sendKind !== "dumb" ? S.sendKind : "standard", sp = mySpeed(k), cur = S.via?.chat === s.chat ? S.via.id : null;
      const direct = flightMs(chatKm(f), sp);
      const rows = (s.ids || []).map(friend).filter(Boolean).map((p) => {
        const ms = p.lat == null || f.lat == null || S.me.lat == null ? null : flightMs(haversineKm(S.me.lat, S.me.lon, p.lat, p.lon), sp) + HOUR + flightMs(haversineKm(p.lat, p.lon, f.lat, f.lon), sp);
        return `<button type="button" class="cell${cur === p.id ? " on" : ""}${ms == null ? " dim" : ""}" ${ms == null ? "disabled" : `data-act="viapick" data-id="${esc(p.id)}"`}>${avatar(p, "s")}
          <span class="ctext"><span>${esc(p.name)}</span><span class="csub">${ms == null ? "No location set" : `${esc(p.place || "")}${p.place ? " · " : ""}lands in ${fmtDur(ms)} (+${fmtDur(Math.max(0, ms - direct))})`}</span></span>${cur === p.id ? I.check : ""}</button>`;
      }).join("");
      $layer.innerHTML = sheetHtml("Stop Over", s.ids == null ? (s.err ? loadFail(s.err, "via") : `<p class="empty">Finding friends you share…</p>`)
        : rows ? `<div class="group mt-s">${rows}</div><div class="gfoot">Your pigeon rests with them for an hour on the way. They can read it and add a line for ${esc(first(f.name))}, then it flies on.</div>
          ${cur ? `<div class="stack"><button type="button" class="btn wide plain" data-act="unvia">Fly Straight There</button></div>` : ""}`
        : `<p class="empty"><b>No friends in common</b>A stopover needs a friend you and ${esc(first(f.name))} both have.</p>`,
        { left: { label: "Cancel", act: "close" }, right: null });
      return;
    }
    case "schedule": {
      const f = friend(s.chat); if (!f) { S.sheet = null; return renderSheet(); }
      if ($("#f-landat", $layer)) return;           // built once, so a sync can't undo a half-picked time
      const k = schedKind(), ms = k ? flightMs(chatKm(f), mySpeed(k)) : 0, cur = schedFor(s.chat, null);
      const rows = schedPresets().map(([label, at]) => {
        const soon = !k || at - ms < now();
        return cell({ act: soon ? null : "schedpick", id: String(at), label, sub: soon && k ? `Too soon for a ${KIND[k].name.toLowerCase()} pigeon` : "", val: `${DOW[new Date(at).getDay()]} ${fmtTime(at)}`, cls: soon ? "dim" : cur?.at === at ? "on" : "" });
      }).join("");
      $layer.innerHTML = sheetHtml("When Should It Land?", `<form id="sched-form" data-form="schedule" novalidate>
        <div class="group mt-s">${rows}</div>
        <div class="group"><label class="cell fcell schedat"><span class="ctext"><span>Another Time</span></span><input type="datetime-local" id="f-landat" aria-label="When it lands"></label></div>
        <div class="gfoot">${k ? `It waits in your loft and takes off in time to land then. ${esc(first(f.name))} won’t know it’s coming until it takes off. A ${KIND[k].name.toLowerCase()} pigeon takes ${fmtDur(ms)} to get there.` : "Scheduled pigeons are swift or faster, and your lofts are empty."} Up to 30 days ahead.</div>${ferr}
        ${cur ? `<div class="stack"><button type="button" class="btn wide plain" data-act="unschedule">Send It Now Instead</button></div>` : ""}</form>`,
        { left: { label: "Cancel", act: "close" }, right: { label: "Set", form: "sched-form" } });
      const inp = $("#f-landat", $layer);
      inp.min = localInput(now() + ms + MIN); inp.max = localInput(now() + 30 * DAY);
      inp.value = localInput(cur?.at ?? Math.max(now() + ms + HOUR, schedPresets()[0][1]));
      return;
    }
    case "grouprename": {
      const g = group(s.id); if (!g) { S.sheet = null; return renderSheet(); }
      if (!$("#f-gname", $layer)) {
        $layer.innerHTML = sheetHtml("Group Name", `<form id="gname-form" data-form="grouprename" novalidate>
          <div class="group mt-s"><label class="fcell"><input id="f-gname" name="name" placeholder="Group name" maxlength="40" autocomplete="off" aria-label="Group name"></label></div>
          <div class="gfoot">Everyone in the group sees the new name.</div>${ferr}</form>`,
          { left: { label: "Back", act: "groupinfo" }, right: { label: "Save", form: "gname-form" } });
        $("#f-gname", $layer).value = g.name;
      }
      return;
    }
    case "addfriend":
      if (!$("#add-h", $layer)) {
        $layer.innerHTML = sheetHtml("Add Friend", `<form id="add-form" data-form="add" novalidate>
            <div class="group mt-s"><label class="fcell"><span class="pre">@</span><input name="h" id="add-h" placeholder="their handle" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="send" aria-label="Friend’s handle"></label></div>
            <div class="addres" aria-live="polite"></div>
            <p class="gfoot add-msg" role="status">Type a friend’s handle, or let them scan your code.</p></form>
            <div class="addreqs"></div>
            <div class="ghead">Your code</div>
            <div class="mycode"><div class="qrbox">${qrSvg(myLink(), { title: "QR code for your add-a-friend link" })}</div>
              <b>@${esc(S.me.handle)}</b><span>A friend can scan this with their phone’s camera to add you.</span>
              <div class="row2"><button type="button" class="btn small" data-act="share">${I.up}Share Link</button><button type="button" class="btn small gray" data-act="copylink">Copy Link</button></div></div>`,
          { left: { label: "Cancel", act: "close" }, right: { label: "Send", form: "add-form" } });
        const i = $("#add-h", $layer); i.value = S.pendingAdd || ""; if (i.value) { addLookup(); try { localStorage.removeItem("inflight-add"); } catch (_) {} }   // (shown, signed in: not again next launch) setTimeout(() => i.focus(), 300);
      }
      // requests, kept here too (they change as you accept, decline or cancel)
      { const rq = $(".addreqs", $layer), row = (p, inc) => `<div class="reqrow${inc ? " inc" : ""}">${avatar(p, "s")}<span class="ctext">${p.name ? `<span class="one">${esc(first(p.name))}</span><br><span class="csub">@${esc(p.handle)}</span>` : `<span class="one">@${esc(p.handle)}</span><br><span class="csub">Waiting for them to say yes</span>`}</span>
          <span class="acts">${inc ? `<button class="btn small gray" data-act="decline" data-id="${esc(p.id)}">Decline</button><button class="btn small" data-act="accept" data-id="${esc(p.id)}">Accept</button>` : `<button class="btn small gray" data-act="cancelreq" data-id="${esc(p.id)}">Cancel</button>`}</span></div>`;
        // (drawn again only when they've changed: renderSheet glides what moves and fades what comes and goes)
        const html = (S.incoming.length ? `<div class="ghead">Want to be your friend</div><div class="group">${S.incoming.map((p) => row(p, true)).join("")}</div>` : "")
          + (S.outgoing.length ? `<div class="ghead">Sent</div><div class="group">${S.outgoing.map((p) => row(p, false)).join("")}</div>` : "");
        if (rq && rq._html !== html) { rq.innerHTML = html; rq._html = html; } }
      return;
    case "whohas": {
      const g = group(S.chat), m = (S.msgs.get(S.chat) || []).find((x) => x.id === S.sheet.id);
      if (!g || !m?.flock) { S.sheet = null; return renderSheet(); }
      const c = flockCount(m), onMap = m.flock.some((x) => x.route);
      const status = (x) => {
        const st = whoState(x);
        return st === "read" ? `<span class="ws w-read">${I.check}Read ${esc(fmtShort(x.readAt))}</span>`
          : st === "landed" ? `<span class="ws w-landed">Landed ${esc(fmtShort(x.deliverAt))}</span>`
          : st === "fly" ? `<span class="ws w-fly"><span data-eta="${esc(x.deliverAt)}">${fmtDur(x.deliverAt - now())}</span> away</span>`
          : st === "lost" ? `<span class="ws w-lost">${I.skull}Lost</span>` : `<span class="ws w-back">${I.homing}Called back</span>`;
      };
      const rows = whoOrder(m).map((x) => { const p = member(g, x.to) || { name: "Someone" };
        return `<div class="cell whorow"><span class="who-av ${whoCls(x)}">${avatar(p, "s")}</span><span class="ctext"><span class="one">${esc(first(p.name))}</span>${x.toPlace ? `<span class="csub one">${esc(x.toPlace)}${x.km ? ` · ${fmtMiles(x.km + shipKm(x.legs))}` : ""}</span>` : ""}</span>${status(x)}</div>`; }).join("");
      const read = m.flock.filter((x) => x.readAt).length;
      $layer.innerHTML = sheetHtml("Who Has It",
        `<div class="whohead">${pgm(m)}<b>${m.flying ? `${c.landed} of ${c.n} landed` : `Landed for ${c.landed} of ${c.n}`}</b><span>${read ? `Read by ${read === c.n ? "everyone" : read}` : "Not read yet"}${m.flying && c.next ? ` · next lands in <span data-eta="${esc(c.next)}">${fmtDur(c.next - now())}</span>` : ""}</span>${whoDots(m)}</div>
        <div class="group">${rows}</div>
        ${pigeonsOn() && (onMap || m.flying) ? `<div class="group mt">${onMap ? cell({ act: "map", id: m.id, icon: I.map, tile: "blue", label: m.flying ? "Watch on Map" : "See the Flights", chev: true }) : ""}${m.flying ? cell({ act: "recallask", id: m.id, label: "Call Them Back", cls: "center destructive" }) : ""}</div>` : ""}`);
      return;
    }
    case "requests": {
      const row = (p, inc) => `<div class="reqrow${inc ? " inc" : ""}">${avatar(p, "s")}<span class="ctext">${p.name ? `<span class="one">${esc(first(p.name))}</span><br><span class="csub">@${esc(p.handle)}</span>` : `<span class="one">@${esc(p.handle)}</span><br><span class="csub">Waiting for them to say yes</span>`}</span>
        <span class="acts">${inc ? `<button class="btn small gray" data-act="decline" data-id="${esc(p.id)}" aria-label="Decline ${esc(p.name)}">Decline</button><button class="btn small" data-act="accept" data-id="${esc(p.id)}" aria-label="Accept ${esc(p.name)}">Accept</button>`
          : `<button class="btn small gray" data-act="cancelreq" data-id="${esc(p.id)}" aria-label="Cancel request to @${esc(p.handle)}">Cancel</button>`}</span></div>`;
      $layer.innerHTML = sheetHtml("Friend Requests",
        (S.incoming.length ? `<div class="ghead">Waiting for you</div><div class="group">${S.incoming.map((p) => row(p, true)).join("")}</div>` : "") +
        (S.outgoing.length ? `<div class="ghead">Sent</div><div class="group">${S.outgoing.map((p) => row(p, false)).join("")}</div>` : "") +
        (S.incoming.length + S.outgoing.length ? "" : `<p class="empty"><b>All caught up</b>No friend requests right now.</p>`));
      return;
    }
    case "friendinfo": {
      if (!f) { S.sheet = null; return renderSheet(); }
      const on = pigeonsOn(), km = on && S.me.lat != null && f.lat != null ? haversineKm(S.me.lat, S.me.lon, f.lat, f.lon) : null;
      $layer.innerHTML = sheetHtml("", `<div class="profile-head">${avatar(f, "xl", true)}<span class="name">${esc(first(f.name))}</span><span class="sub">@${esc(f.handle)}</span></div>
        ${on ? `<div class="group mt">${cell({ act: "loft", id: f.id, icon: I.bird, tile: "indigo", label: `Visit ${esc(first(f.name))}’s Loft`, sub: "Their pigeons, badges and kit", chev: true })}</div>` : ""}
        <div class="group mt">
          ${on && f.pigeons === false ? cell({ icon: I.bird, tile: "orange", label: "Pigeons", val: "Off" }) : ""}
          ${cell({ icon: f.moon ? I.moon : I.pin, tile: f.moon ? (worldOf(f) === "mars" ? "red" : "indigo") : "blue", label: f.moon ? `On ${BODIES[worldOf(f)].name}` : "Location", val: esc((f.place || "Not set").replace(/, (the Moon|Mars)$/, "")), sub: f.locAt ? `Updated ${agoText(f.locAt)}` : "" })}
          ${km != null ? cell({ icon: I.dist, tile: "teal", label: "Distance", val: fmtMiles(km) }) : ""}
          ${on && f.streak && (f.streak.n || f.streak.best >= 2) ? cell({ icon: I.flame, tile: "orange", label: "Flight Streak", val: f.streak.n ? `${f.streak.n} day${f.streak.n === 1 ? "" : "s"}` : "None now",
            sub: [f.streak.n && !f.streak.today ? `Send a pigeon in the next ${esc(streakLeft(f.streak))} to keep it` : "", f.streak.best >= 2 ? `Best: ${f.streak.best} days` : ""].filter(Boolean).join(" · ") }) : ""}
          ${f.seenAt ? cell({ icon: I.clock, tile: "green", label: "Last Online", val: isOnline(f) ? '<span class="on-now">Online now</span>' : fmtSeen(f.seenAt) }) : ""}
          ${!on ? "" : moonChat(f) ? kindsFor(f).map((k) => cell({ icon: k === "laser" ? I.up : I.moon, tile: k === "laser" ? "red" : "indigo", label: `${KIND[k].name} Pigeon`, val: fmtDur(spaceMs(k, endFor(S.me), endFor(f))) })).join("")
            : km != null ? KINDS.slice().reverse().map(([k, name]) => cell({ icon: I.bird, tile: k, label: `${name} Pigeon`, val: fmtDur(flightMs(km, mySpeed(k))) })).join("") : ""}
        </div>
        <div class="group mt">${cell({ act: "safety", id: f.id, icon: I.shield, tile: "teal", label: "Safety Number", val: isVerified(f) ? "Verified" : "", chev: true })}
          ${cell({ act: "vanishask", id: f.id, icon: I.clock, tile: "indigo", label: "Disappearing Messages", val: f.vanish ? vanishSay(f.vanish.ms).replace(/^./, (c) => c.toUpperCase()) : "Off", chev: true })}</div>
        <div class="gfoot">${keepSay()}</div>
        <div class="group mt">${cell({ act: "unfriendask", id: f.id, label: "Remove Friend", cls: "center destructive" })}${cell({ act: "blockask", id: f.id, label: `Block @${esc(f.handle)}`, cls: "center destructive" })}</div>`, { name: `${f.name}: contact info` });
      return;
    }
    case "loft": {
      if (!f) { S.sheet = null; return renderSheet(); }
      const L = s.data, who = esc(first(f.name)), back = { left: { label: "Back", act: "loftback" }, name: `${f.name}’s loft` };
      if (!L) { $layer.innerHTML = sheetHtml("", `<div class="profile-head">${avatar(f, "xl", true)}<span class="name">${who}’s Loft</span></div><p class="empty">Opening the loft…</p>`, back); return; }
      if (L.error || L.private) { $layer.innerHTML = sheetHtml("", `<div class="profile-head">${avatar(f, "xl", true)}<span class="name">${who}’s Loft</span></div>
        ${L.private ? `<p class="empty"><b>The loft is closed</b>${L.self ? "You don’t share your news, so lofts stay closed to you too. Turn on Share My News in Privacy &amp; Security to visit." : `${who} doesn’t share their news, so their loft stays private.`}</p>` : loadFail(L.error, "loft", s.id)}`, back); return; }
      const l = L.loft, mon = (t) => `${MON[new Date(t).getMonth()]} ${new Date(t).getFullYear()}`;
      const stat = (v, label) => `<div><b>${v}</b><span>${label}</span></div>`;
      const bird = (b) => `<div class="cell has-icon"><span class="tile wtile ${RANK_TILE[b.rank]}">${I.bird}${wearOn(b.wear)}</span>
        <span class="ctext"><span class="one">${esc(b.name)}</span><span class="csub">${esc(b.rank)}${b.wear && WEAR[b.wear] ? ` · wearing the ${esc(WEAR[b.wear][0].toLowerCase())}` : ""} · since ${mon(b.since)}</span></span></div>`;
      const hall = (b) => `<div class="cell has-icon"><span class="tile wtile ${b.lost ? "gray" : RANK_TILE[b.rank]}">${b.lost ? I.skull : I.bird}</span>
        <span class="ctext"><span class="one">${esc(b.name)}</span><span class="csub one">${esc(b.rank)} · ${b.lost ? `lost ${fmtDate(b.lost)}` : `retired ${fmtDate(b.retired)}`}</span></span></div>`;
      const badge = (b) => { const [icon, tint] = BADGE_LOOK[b.id] || ["bird", "gray"]; return `<div class="badge2 earned"><span class="bico tile ${tint}">${I[icon] || I.bird}</span><b>${esc(b.name)}</b><small>${esc(b.desc)}</small></div>`; };
      const kit = [...l.kit.map((k) => `<span class="loftkit"><i aria-hidden="true">${k.emoji}</i>${esc(k.name)}</span>`), ...l.looks.map((k) => `<span class="loftkit">${pg("standard", k.id)}${esc(k.name)} look</span>`)];
      $layer.innerHTML = sheetHtml("", `<div class="profile-head lofthead">${avatar(f, "xl", true)}<span class="name">${who}’s Loft</span>
          <span class="sub">${l.skin && SKINS[l.skin] ? `${pg("standard", l.skin)} Flies ${esc(SKINS[l.skin].name)} pigeons · ` : ""}${l.since ? `Keeping pigeons since ${mon(l.since)}` : ""}</span></div>
        <div class="bstats">${stat(fmtMiles(l.km), "Flown")}${stat(l.landed.toLocaleString("en-GB"), l.landed === 1 ? "Landing" : "Landings")}${stat(l.countries, l.countries === 1 ? "Country" : "Countries")}${stat(l.postmarks, l.postmarks === 1 ? "Postmark" : "Postmarks")}</div>
        <div class="ghead">Pigeons${l.birds.length ? ` <span class="gcount">${l.birds.length}</span>` : ""}</div>
        ${l.birds.length ? `<div class="group">${l.birds.map(bird).join("")}</div>` : `<div class="gfoot">${who} hasn’t named any pigeons yet.</div>`}
        ${l.hall.length ? `<div class="ghead">Hall of Fame</div><div class="group">${l.hall.map(hall).join("")}</div>` : ""}
        ${l.badges.length ? `<div class="ghead">Achievements <span class="gcount">${l.badges.length}</span></div><div class="badges">${l.badges.map(badge).join("")}</div>` : ""}
        ${kit.length ? `<div class="ghead">Kit</div><div class="loftkits">${kit.join("")}</div>` : ""}
        <div class="gfoot mt">Where ${who}’s pigeons have been stays theirs: countries and postmarks are counted here, never named.</div>`, back);
      return;
    }
    case "sessions": {
      // Who's signed in: this phone, with how and since when, then any others (a new one marked), each a tap from
      // signing out, and what happens when there's a new one
      const list = s.list;
      const since = (at) => { const d = new Date(at); return `${d.getDate()} ${MON[d.getMonth()]}${d.getFullYear() === new Date(now()).getFullYear() ? "" : ` ${d.getFullYear()}`}`; };
      const kind = (l) => /^(Mac|Windows|Linux|Chromebook)/.test(l) ? "laptop" : /^iPad/.test(l) ? "tablet" : "phone";
      const icon = (x, tile) => `<span class="tile ${tile}">${kind(x.label) === "laptop" ? I.laptop : I.phone}</span>`;
      const near = (x) => x.place ? ` · near ${esc(x.place)}` : "";
      if (!list) { $layer.innerHTML = sheetHtml("Signed-In Phones", s.err ? loadFail(s.err, "sessionssheet") : `<p class="empty">Looking…</p>`, { left: { label: "Back", act: "securitysheet" } }); return; }
      const me = list.find((x) => x.current), others = list.filter((x) => !x.current), fresh = (x) => now() - x.createdAt < DAY;
      const n = list.length, newOnes = others.filter(fresh).length;
      $layer.innerHTML = sheetHtml("Signed-In Phones", `
        <div class="wnhero sesshero${newOnes ? " alert" : ""}"><span class="wnlogo" aria-hidden="true">${I.phone}${n > 1 ? `<b>${n}</b>` : ""}</span><h2>${n > 1 ? `${n} Places Signed In` : "Only This Phone"}</h2>
          <p>${newOnes ? `${newOnes === 1 ? "One is" : `${newOnes} are`} new today. If it wasn’t you, sign it out.` : n > 1 ? "Your account is signed in on each of these." : "Your account isn’t signed in anywhere else."}</p></div>
        ${me ? `<div class="ghead">This Phone</div>
        <div class="group"><div class="cell has-icon sessrow">${icon(me, "green")}<span class="ctext"><span>${esc(me.label)}</span>
          <span class="csub"><span class="on-now">Active now</span> · ${standalone() ? "Home Screen app" : "In the browser"}</span>
          <span class="csub">Signed in ${esc(since(me.createdAt))}${near(me)}</span></span></div></div>` : ""}
        <div class="ghead">Other Phones${others.length ? ` <span class="gcount">${others.length}</span>` : ""}</div>
        <div class="group">${others.length ? others.map((x) => `<div class="cell has-icon sessrow${fresh(x) ? " fresh" : ""}">${icon(x, fresh(x) ? "orange" : "blue")}<span class="ctext"><span>${esc(x.label)}${fresh(x) ? ` <span class="newtag">New</span>` : ""}</span>
            <span class="csub">Active ${esc(agoText(x.seenAt))}${near(x)}</span><span class="csub">Signed in ${esc(since(x.createdAt))}</span></span>
            <button class="link danger" data-act="sessend" data-id="${esc(x.id)}" aria-label="Sign out ${esc(x.label)}">Sign Out</button></div>`).join("")
          : `<div class="cell sessnone"><span class="ctext"><span>None</span><span class="csub">Sign in anywhere else and it shows up here.</span></span></div>`}</div>
        ${others.length > 1 ? `<div class="group mt">${cell({ act: "sessothers", label: "Sign Out All Other Phones", cls: "center destructive" })}</div>` : ""}
        <div class="gfoot">A new sign-in is announced on your phones${S.me.emailOk === false ? "" : " and by email"}. Don’t know one? Sign it out and change your password. Places are the nearest town, never closer.</div>
        <div class="group mt">${cell({ act: "lockout", label: "Sign Out of This Phone", cls: "center destructive" })}</div>`,
        { left: { label: "Back", act: "securitysheet" } });
      return;
    }
    case "blocked":
      $layer.innerHTML = sheetHtml("Blocked", S.blocked.length ? `<div class="group mt-s">${S.blocked.map((p) => `<div class="cell has-icon">${avatar({ name: p.name || p.handle }, "s", false, true)}<span class="ctext"><span>${esc(p.name || "@" + p.handle)}</span><span class="csub">@${esc(p.handle)}</span></span><button class="link" data-act="unblock" data-id="${esc(p.id)}" aria-label="Unblock @${esc(p.handle)}">Unblock</button></div>`).join("")}</div>
        <div class="gfoot">They can’t send you friend requests or pigeons, or see your picture or where you are. They aren’t told.</div>`
        : `<p class="empty"><b>No one blocked</b>Block someone from their friend request or their contact info. They aren’t told.</p>`, { left: { label: "Back", act: "securitysheet" } });
      return;
    case "view": {
      // (drawn once: redrawn as the chat behind it changes, it would start again, enlarged or not)
      if ($(".viewer:not(.closing)", $layer)?.dataset.photo === s.id) return;
      $layer.innerHTML = `<div class="viewer" data-act="close" data-photo="${esc(s.id)}" role="dialog" aria-label="Photo"><img src="${S.photos.get(s.id) || ""}" alt="Photo"><p>Decrypted on this phone. Pinch to zoom, tap to close.</p></div>`;
      const v = $(".viewer", $layer); pinchZoom(v, $("img", v), () => { if (S.sheet?.type === "view") closeTop(); });
      return;
    }
    case "moved": {
      // Chat's new address, from its old one: in a browser it's one tap (the sign-in comes
      // too, pigeon/handover.js); a Home Screen app has its own storage, so it's a few steps
      // (drawn once: it never changes while it's open, and a redraw would play its rows in again)
      if (s.drawn && $(".sheet .body", $layer)) return; s.drawn = true;
      const home = NEW_HOME.replace(/^https?:\/\//, ""), app = standalone(), ios = isIOS();
      const row = ([ic, tile, title, sub], i) => `<div class="wnrow" data-i="${i}"><span class="tile ${tile}" aria-hidden="true">${I[ic]}</span><span class="wnt"><b>${esc(title)}</b><small>${esc(sub)}</small></span></div>`;
      const rows = app ? [
        ["globe", "blue", `1. Open it in ${ios ? "Safari" : "your browser"}`, home],
        ["plus", "green", ios ? "2. Add it to your Home Screen" : "2. Install it", ios ? "Tap Share, then Add to Home Screen." : "From the browser’s menu: Install App, or Add to Home Screen."],
        ["key", "orange", "3. Sign in there", "With Face ID or your password. Your chats and pigeons come with you."],
        ["bell", "red", "4. Turn notifications on there", "Then delete this Chat from your Home Screen."],
      ] : [
        ["check", "green", "Everything comes with you", "You’ll be signed in, with your chats, pigeons in flight and settings."],
        ["bell", "red", "Notifications move too", "Turn them on again there, from Account."],
      ];
      $layer.innerHTML = sheetHtml("", `<div class="wnhero"><span class="wnlogo" aria-hidden="true">${I.bird}</span><h2>Chat Has Moved</h2><p>It now lives at <b>${esc(home)}</b></p></div>
        <div class="wnlist">${rows.map(row).join("")}</div>
        <div class="wnfoot stack"><a class="btn wide" href="${esc(NEW_HOME)}/"${app ? ` target="_blank" rel="noopener"` : ""} data-act="movego">${app ? `Open ${esc(home)}` : `Go to ${esc(home)}`}</a>
          ${app ? `<button type="button" class="btn wide plain" data-act="movecopy">Copy the Address</button>` : ""}
          <button type="button" class="btn wide plain" data-act="close">Not Now</button></div>`, { name: "Chat Has Moved" });
      $layer.querySelectorAll(".wnrow").forEach((el) => el.style.setProperty("--i", el.dataset.i));
      return;
    }
    case "credits": {
      // where the weather, the heights and the maps come from, as their licences ask
      if (s.drawn && $(".sheet .body", $layer)) return; s.drawn = true;
      const out = (href, icon, tile, label, sub) => `<a class="cell has-icon" href="${href}" target="_blank" rel="noopener noreferrer"><span class="tile ${tile}">${icon}</span><span class="ctext"><span>${label}</span><span class="csub">${sub}</span></span>${chevSm}</a>`;
      $layer.innerHTML = sheetHtml("Map & Weather Data", `<div class="ghead">Weather</div>
        <div class="group">${out("https://open-meteo.com/", I.wind, "blue", "Open-Meteo", "Forecasts and the wind · CC BY 4.0")}
          ${out("https://api.met.no/", I.sun, "teal", "MET Norway", "When Open-Meteo can’t answer · CC BY 4.0")}</div>
        <div class="gfoot">Weather data by Open-Meteo.com and MET Norway, used under Creative Commons Attribution 4.0.</div>
        <div class="ghead">The Earth</div>
        <div class="group">${out("https://www.swpc.noaa.gov/products/planetary-k-index", I.compass, "indigo", "NOAA Space Weather", "Magnetic storms that put pigeons off course")}
          ${out("https://eonet.gsfc.nasa.gov/", I.volcano, "red", "NASA EONET", "Volcanoes and wildfires to fly around")}</div>
        <div class="gfoot">The planetary K index from NOAA’s Space Weather Prediction Center, and natural events from NASA’s Earth Observatory Natural Event Tracker: both US government data, free to use.</div>
        <div class="ghead">Mountains</div>
        <div class="group">${out("https://registry.opendata.aws/terrain-tiles/", I.dist, "green", "Terrain Tiles", "Heights for mountain passes · Mapzen and AWS")}</div>
        <div class="gfoot">Terrain Tiles bring together ETOPO1 and GMTED2010 (US government, public domain), SRTM (NASA), EU-DEM (produced using Copernicus data and information funded by the European Union) and other national elevation data. <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noopener noreferrer">All the sources</a></div>
        <div class="ghead">Maps</div>
        <div class="group">${out("https://www.naturalearthdata.com/", I.globe, "orange", "Natural Earth", "Coastlines, countries and places · public domain")}</div>
        <div class="ghead">GIFs</div>
        <div class="group">${out("https://giphy.com/", `<span class="gifico" aria-hidden="true">GIF</span>`, "indigo", "GIPHY", "Search and trending GIFs")}</div>
        <div class="gfoot">The maps and heights are kept on Chat’s own server, and it asks for the weather, the Earth’s news and GIFs itself, so none of these see who you are.</div>`);
      return;
    }
    case "appearance":
      $layer.innerHTML = sheetHtml("Appearance", `<div class="group mt-s">
        ${THEMES.map((k) => `<button type="button" class="cell" role="radio" aria-checked="${theme() === k}" data-act="theme" data-id="${esc(k)}"><span class="ctext"><span>${THEME_NAMES[k]}</span></span>${theme() === k ? `<span class="val tick">${I.check}</span>` : ""}</button>`).join("")}
        </div>
        <div class="gfoot">${theme() === "auto" ? "Matches your phone’s Light or Dark setting. " : ""}Saved to your account, so it’s the same on every phone you sign in on.</div>
        <div class="group mt">${toggleCell({ act: "haptics", icon: I.bird, tile: "indigo", label: "Haptics", sub: "A tap of feedback when you send, react and switch", on: hapticsOn() })}</div>
        <div class="gfoot">On this phone. iPhone needs iOS 18 or later.</div>`);
      return;
    case "notifications": {
      const old = $(".sheet .body", $layer), top = old ? old.scrollTop : 0;
      $layer.innerHTML = sheetHtml("Notifications", vNotifySheet());
      if (top) $(".sheet .body", $layer).scrollTop = top;    // toggling shouldn't jump the list
      return;
    }
    case "passkeys":
      $layer.innerHTML = sheetHtml("Passkeys", !passkeysSupported() && !S.passkeys.length ? `<p class="empty"><b>Not available</b>This browser can’t save passkeys.</p>`
        : S.passkeys.length ? `<div class="ghead">Saved Passkeys</div><div class="group">${S.passkeys.map((p) => `<div class="cell has-icon"><span class="tile indigo">${I.key}</span><span class="ctext"><span>${esc(p.label || "Passkey")}</span><span class="csub">Added ${fmtDate(p.createdAt)}${p.usedAt ? ` · used ${esc(agoText(p.usedAt))}` : ""}${p.unlocks ? " · unlocks messages" : ""}</span></span><button class="link danger" data-act="pkdel" data-id="${esc(p.id)}">Remove</button></div>`).join("")}</div>
          ${passkeysSupported() ? `<div class="group mt">${cell({ act: "pkadd", icon: I.plus, tile: "indigo", label: "Add Another Passkey", cls: "action" })}</div>` : ""}
          <div class="gfoot">Sign in with Face ID or your fingerprint. A passkey that unlocks your messages keeps them safe through a password reset.</div>`
        : `<div class="wnhero pkhero"><span class="wnlogo" aria-hidden="true">${I.face}</span><h2>No Password to Forget</h2><p>Sign in with Face ID or your fingerprint, the way you unlock your phone.</p></div>
          <div class="wnlist">${[["lock", "green", "Safer than a password", "Nothing to guess, reuse or type into the wrong site."],
            ["key", "indigo", "Keeps your messages", "On newer phones it also unlocks them, so a password reset doesn’t lose them."],
            ["face", "teal", "Lets Chat lock", "Lock Chat when you leave it, and open it with a glance."]].map(([ic, tile, t, sub], i) => `<div class="wnrow" data-i="${i}"><span class="tile ${tile}" aria-hidden="true">${I[ic]}</span><span class="wnt"><b>${t}</b><small>${sub}</small></span></div>`).join("")}</div>
          <div class="wnfoot"><button type="button" class="btn wide" data-act="pkadd">${I.plus}Add a Passkey</button></div>`, { left: toSecurity() });
      $layer.querySelectorAll(".wnrow").forEach((el) => el.style.setProperty("--i", el.dataset.i));
      return;
    case "reauth":
      if (!$("#reauth-form", $layer)) $layer.innerHTML = sheetHtml("Confirm It’s You", `<p class="gfoot mt-s">For your safety, enter your password to carry on.</p>
        <form id="reauth-form" data-form="reauth" novalidate><div class="group mt-xs">${field("password", "Password", "password", "current-password")}</div>${ferr}</form>
        ${S.passkeys?.length && passkeysSupported() ? `<div class="group mt">${cell({ act: "reauthpk", icon: I.face, tile: "green", label: "Use a Passkey Instead", cls: "action" })}</div>` : ""}`,
        { left: { label: "Cancel", act: "close" }, right: { label: "Confirm", form: "reauth-form" } });
      return;
    case "askpw":
      if (!$("#f-password", $layer)) $layer.innerHTML = sheetHtml("Link Passkey", `<p class="gfoot mt-s">Enter your password once so this passkey can also unlock your messages on a new phone.</p>
        <form id="askpw-form" data-form="askpw" novalidate><div class="group mt-xs">${field("password", "Password", "password", "current-password")}</div>${ferr}</form>`,
        { left: { label: "Cancel", act: "close" }, right: { label: "Link", form: "askpw-form" } });
      return;
    case "profile": {
      // Where you are (your photo, name and handle are your account's: the card at the top of Account opens its page)
      // (the sheet's still called "profile" inside: Back from the Moon and Mars, and refreshProfile, come here)
      const u = S.me, old = $(".sheet .body", $layer), top = old && $(".locsheet", $layer) ? old.scrollTop : 0;
      $layer.innerHTML = sheetHtml("Location", `<div class="locsheet"></div>
        ${u.moon ? ((w, d) => `<div class="group">
          ${cell({ icon: w === "mars" ? I.up : I.moon, tile: w === "mars" ? "red" : "indigo", label: `On ${BODIES[w].name}`, val: esc((u.place || "").replace(/, (the Moon|Mars)$/, "")), sub: d })}
          ${cell({ act: "moonpick", id: w, icon: I.pin, tile: w === "mars" ? "red" : "indigo", label: `Move on ${BODIES[w].name}`, chev: true })}
          ${cell({ act: "moonpick", id: w === "mars" ? "moon" : "mars", icon: w === "mars" ? I.moon : I.up, tile: w === "mars" ? "indigo" : "red", label: w === "mars" ? "Go to the Moon" : "Go to Mars", chev: true })}
        </div>
        <div class="gfoot">Only ${w === "mars" ? "laser" : "lunar"} pigeons reach you here. Your spot on Earth isn’t kept while you’re away.</div>`)(worldOf(u), worldOf(u) === "mars"
          ? ((c) => `${c.hm} there · ${c.day ? "sunset" : "sunrise"} in ${fmtDur(c.next - now())}`)(marsClock(u.moon.lon, now()))
          : ((d) => `${d.day ? "Daytime" : "Night"} · ${d.day ? "sunset" : "sunrise"} in ${fmtDur(d.next - now())} · ${earthPhase(now()).name} in the sky`)(lunarDay(u.moon.lat, u.moon.lon, now()))) + `
        <div class="ghead">Back to Earth</div>
        <div class="group">
          ${cell({ act: "locate", icon: I.loc, tile: "blue", label: "Use Current Location", cls: "action" })}
          <label class="cell has-icon"><span class="tile gray">${I.map}</span><span class="ctext"><span>Choose a City</span></span>${chevSm}
            <select class="overlay" data-act="city" id="city" aria-label="Choose a city">${cityOptions()}</select></label>
        </div>` : `<div class="group">
          ${cell({ icon: I.pin, tile: "blue", label: "Location", val: esc(u.place || "Not set"), sub: u.locAt ? `Updated ${agoText(u.locAt)}` : "" })}
          ${cell({ act: "locate", icon: I.loc, tile: "blue", label: "Use Current Location", cls: "action" })}
          <label class="cell has-icon"><span class="tile gray">${I.map}</span><span class="ctext"><span>Choose a City</span></span>${chevSm}
            <select class="overlay" data-act="city" id="city" aria-label="Choose a city">${cityOptions()}</select></label>
          ${toggleCell({ act: "autoloc", icon: I.loc, tile: "green", label: "Update Automatically", sub: "Every minute while Chat is open", on: u.autoLocation })}
          ${cell({ act: "moonpick", id: "moon", icon: I.moon, tile: "indigo", label: "Go to the Moon", sub: "Only lunar pigeons fly there", chev: true })}
          ${cell({ act: "moonpick", id: "mars", icon: I.up, tile: "red", label: "Go to Mars", sub: "Only laser pigeons reach it, at the speed of light", chev: true })}
        </div>`}
        <div class="gfoot">${u.moon ? "Choosing somewhere on Earth brings you home." : "Pigeons fly from here, and pigeons already on their way to you follow when you move. Only your friends see it, and only to within about a mile."}</div>`);
      if (top) $(".sheet .body", $layer).scrollTop = top;
      return;
    }
    case "moonpick": {
      // a spot on the Moon (near side or far) or Mars (east or west): tap the map, or pick a named place
      const body = s.body || "moon", mars = body === "mars", mine = worldOf(S.me) === body ? S.me.moon : null;
      const side = s.side || (mars ? (mine && mine.lon < 0 ? "west" : "east") : mine && farSide(mine.lon) ? "far" : "near"), mark = s.mark || mine || null;
      const name = mark ? siteName(mark.lat, mark.lon, body) : null, here = (x) => (mars ? (side === "west") === (x[2] < 0) : (side === "far") === farSide(x[2]));
      const SITES = BODIES[body].sites, world = BODIES[body].name;
      const chip = (act, id, on, b, small) => `<button type="button" class="cc" role="radio" aria-checked="${on}" data-act="${act}" data-id="${esc(id)}"><span><b>${esc(b)}</b><small>${esc(small)}</small></span></button>`;
      // (the places' rail stays where you'd scrolled it when a place or a spot is picked: only a new side starts it again)
      const rail0 = $(".moonpick", $layer) && $(".sheet .chiprail", $layer), railAt = rail0 && s.railSide === side ? rail0.scrollLeft : 0;
      const ll = mark ? `${Math.abs(mark.lat).toFixed(1)}° ${mark.lat >= 0 ? "N" : "S"}, ${Math.abs(mark.lon).toFixed(1)}° ${mark.lon >= 0 ? "E" : "W"}` : "";
      const where = !mark ? "" : mars ? `${ll} · ${marsClock(mark.lon, now()).hm} there now` : `${ll} · ${farSide(mark.lon) ? "far side: Earth is never in the sky" : "near side: Earth hangs in the sky"}`;
      const sides = mars ? chip("moonside", "east", side === "east", "East", "Syrtis, Jezero, Hellas") + chip("moonside", "west", side === "west", "West", "Olympus, Valles")
        : chip("moonside", "near", side === "near", "Near Side", "Faces Earth") + chip("moonside", "far", side === "far", "Far Side", "Faces away");
      $layer.innerHTML = sheetHtml(`On ${world}`, `<div class="mpwrap"><canvas class="moonpick" role="img" aria-label="Map of ${world}, ${side} side. Tap where you’d like to be."></canvas>
          <div class="mpside carriers" role="radiogroup" aria-label="Side">${sides}</div></div>
        <div class="mpsel" aria-live="polite">${mark ? `<b>${esc(name)}</b><small>${esc(where)}</small>` : `<b>Tap ${esc(world)}</b><small>or choose a place below</small>`}</div>
        <div class="carriers chiprail" role="radiogroup" aria-label="Places">${SITES.filter(here).map((x) => chip("moonsite", x[0], name === x[0], x[0], ABOUT[x[0]] || (/^(Sea|Ocean)/.test(x[0]) ? "A dark lava plain" : mars ? "A plain" : "A crater"))).join("")}</div>
        <div class="sharego"><button type="button" class="btn wide" data-act="moonland"${mark ? "" : " disabled"}>${mars ? I.up : I.moon}${mine ? "Move Here" : "Land Here"}</button></div>
        <div class="gfoot">Your friends see you on ${esc(world)}, at this spot. While you’re there your spot on Earth isn’t kept, and Update Automatically is off. ${mars ? "Only laser pigeons reach you: at the speed of light, 3 to 22 minutes from Earth as the planets move." : "Only lunar pigeons reach you: about 3 days from Earth, or a day by Lunar Express."}</div>`,
        { left: { label: "Back", act: "profile" }, right: { label: "Close", act: "close" } });
      const rail = $(".sheet .chiprail", $layer), pick = rail && $("[aria-checked=true]", rail); s.railSide = side;
      if (rail) {
        rail.scrollLeft = railAt;
        // (and the one picked, if it's off the edge, comes into view)
        const rr = rail.getBoundingClientRect(), cr = pick?.getBoundingClientRect();
        if (cr && (cr.left < rr.left || cr.right > rr.right)) rail.scrollBy({ left: cr.left - rr.left - 16, behavior: railAt && !STILL.matches ? "smooth" : "auto" });
      }
      const cv = $(".moonpick", $layer);
      s.view = drawPick(cv, { body, side, mark, focus: name });
      cv.addEventListener("click", (e) => {
        const r = cv.getBoundingClientRect(), p = pickAt(s.view, e.clientX - r.left, e.clientY - r.top); if (!p) return;
        s.mark = p; haptic("tick"); renderSheet();
      });
      return;
    }
  }
}
// How It Flies off the Earth: the space pigeons for it (two lunar ones to the Moon, a laser one to Mars),
// how far away it is today (its trip is as long as that), and what it does on the way
function drawLunarFly(c) {
  const { f, kind, can } = c, ks = c.kinds || [], who = esc(first(f.name)), a = endFor(S.me), b = endFor(f), t = now();
  const mars = ks.includes("laser"), same = a?.b === b?.b, ph = moonPhase(t);
  const km = same ? surfaceKm(a.b, a, b) : mars ? marsKm(t) : moonKm(t) - EARTH_R - MOON_R;      // (surface to surface, as the trip is measured)
  const landAt = kind ? t + etaMs(c, kind) : null, most = Math.max(...ks.map((k) => etaMs(c, k)));
  const where = same ? `across ${BODIES[a.b].name}` : !b || b.b === "earth" ? `in ${esc(f.place || "Earth")}` : `on ${BODIES[b.b].name}`;
  const chip = mars ? (same ? "By an orbiter overhead" : `Light takes ${fmtDur(lightMs(km))} to cross`) : same ? "No air, no wind, no weather" : `${ph.name} · ${((nf) => (nf ? nf[0].toUpperCase() + nf.slice(1) : "The Moon today"))(nearFar(moonKm(t)))}`;
  const hero = `<div class="flyhero">${kind ? pg(kind) : `<span class="pg none" aria-hidden="true">${I.bird}</span>`}
    <span class="fht"><b class="fhbig">${kind ? `Lands ${esc(atTime(landAt))}` : "No space pigeon free"}</b><span class="flyto">${landAt ? `in ${esc(fmtDur(landAt - t))} · ` : ""}to ${who} ${where} · ${fmtMiles(km)}</span>
    <span class="fhwx clear">${mars ? I.up : I.moon}${esc(chip)}</span></span></div>`;
  const kinds = ks.map((k) => {
    const left = S.me[k] || 0, next = S.me[k + "NextAt"], ms = etaMs(c, k);
    const sub = left ? `${left} left · lands ${atTime(t + ms)}` : `None left${next ? ` · next in ${fmtDur(next - t)}` : ""}`;
    return `<button type="button" class="cell kc k-${k}" role="radio" aria-checked="${k === kind}" data-act="pigeon" data-id="${k}"${can[k] ? "" : " disabled"}>${pg(k)}
      <span class="ctext"><span>${KIND[k].name}</span><span class="csub">${esc(sub)}</span><i class="kdur" data-w="${(ms / most).toFixed(3)}"></i></span><span class="val">${fmtDur(ms)}</span><span class="ck" aria-hidden="true">${I.check}</span></button>`;
  }).join("");
  const how = mars
    ? (same ? "There’s no seeing across a planet, so it goes up to an orbiter overhead and back down: there in under a second."
      : `A laser pigeon is a pulse of light: it crosses the ${fmtMiles(km)} between Earth and Mars in ${fmtDur(lightMs(km))}. As the planets go round the Sun that’s anything from 3 to 22 minutes.`)
    : same ? "There’s no air on the Moon to fly in, so it bounds across the surface in the low gravity, straight there."
    : `${b?.b === "moon" ? "It lifts off from Earth" : "It lifts off from the Moon"} and coasts the ${fmtMiles(km)} between, slowing as ${b?.b === "moon" ? "Earth’s pull holds it back, then speeding up as the Moon’s takes over" : "it climbs out of the Moon’s pull, then falling faster and faster towards Earth"}. The Moon swings between about 221,000 and 252,000 miles away over a month, so the trip is longer or shorter with it.`;
  const fresh = !$(".flyhero", $layer);
  $layer.innerHTML = sheetHtml("How It Flies", `${hero}<div class="group kinds" role="radiogroup" aria-label="Pigeon">${kinds}</div>
    <div class="gfoot">Only ${mars ? "laser pigeons reach Mars or leave it" : `lunar pigeons reach ${same ? "across the Moon" : "the Moon or leave it"}`}. They go any time, straight there: no stopovers, no booking ahead and no weather. ${esc(how)}</div>
    ${S.me.risky && !mars ? `<div class="gfoot">Pigeon Death is on: 1.25× faster, but 1 in 100 is lost in space.</div>` : ""}`);
  const body = $(".sheet .body", $layer); body.classList.add("flysheet"); body.classList.toggle("enter", (fresh && !sheetBack) || sheetEntering());
  flyBits(body, null);
}
// each way's plan for a kind of pigeon as if it left now (the same clock as the card's)
function plansNow(t, kind) {
  const d = S.routePlan?.data, plans = kindPlans(d, kind) || d?.plans; if (!plans) return null;
  return Object.fromEntries(Object.entries(plans).map(([k, p]) => [k, { ...p, deliverAt: p.deliverAt + (t - d.at) }]));
}
// The way it would go, before you send: the map, and a card like a flight's,
// with the three ways to switch between (the map redraws for each)
function tickPreview(card, cv) {
  const m = S.preview; if (!m || !card || !cv) return;
  const t = now(), go = (x) => x + (t - m.sentAt), k = kindOf(m);
  // as if it left now
  const live = { ...m, sentAt: t, deliverAt: go(m.deliverAt), legs: (m.legs || []).map((l) => [l[0], l[1], go(l[2]), ...l.slice(3)]) };
  const others = plansNow(t, m.pigeon) || {};
  live.alts = ROUTES.filter(([k]) => k !== m.style && others[k]).map(([k, name]) => ({ style: k, name, route: m.route, sentAt: t, deliverAt: others[k].deliverAt,
    legs: (others[k].legs || []).map((l) => [l[0], l[1], l[2] + (t - S.routePlan.data.at), ...l.slice(3)]) }));
  card.classList.add("fc", "pv");
  const from = esc(m.fromPlace || "?"), to = esc(m.toPlace || "?"), coin = pgm(m);
  const rows = [{ at: t, now: true, coin, title: `Leaves ${from}`, sub: `${milesOf(m.km, live.legs)} · the ${esc((ROUTES.find((x) => x[0] === m.style)?.[1] || "fastest").toLowerCase())} way` }];
  for (const e of fcEvents({ ...live, via: true }, t)) rows.push({ ...e, time: fcAt(e.at, true), title: esc(e.title), sub: esc(e.sub || "") });
  rows.push({ at: live.deliverAt, time: fcAt(live.deliverAt), dot: "end", title: `Lands in ${to}` });
  const name = KIND[k]?.name || "Standard";
  const html = `<span class="fchead"><span class="fccoin lg">${coin}</span><span class="fct"><span class="big">Lands ${esc(clockIn(live.deliverAt, MY_TZ))}</span><span class="fcs">if it left now · ${(() => { const r = landRange(live.deliverAt, t, { wind: m.wind, legs: live.legs }); return r ? `likely ${esc(rangeText(r))}` : `in ${esc(fmtDur(live.deliverAt - t))}`; })()}</span></span></span>
    ${routeSeg(m.style, plansNow(t, m.pigeon))}
    <ol class="fctl" aria-label="The way it would go">${rows.map(fcRow).join("")}</ol>
    <span class="fcwho"><span class="fcav pgk" aria-hidden="true">${coin}</span><span class="fct"><span class="fckind">${/^[AEIOU]/.test(name) ? "An" : "A"} ${esc(name.toLowerCase())} pigeon</span><span class="fcs">${milesOf(m.km, m.legs)}${m.risky ? " · Pigeon Death on" : ""}</span></span>${m.risky ? `<span class="fctags">${m.risk ? riskTag(m.risk).replace('<em class="rk', '<span class="fcchip risk rk').replace("</em>", "</span>") : `<span class="fcchip risk">1.25×</span>`}</span>` : ""}</span>`;
  const body = $(".mcb", card) || (card.innerHTML = `<div class="mcb"></div>`, $(".mcb", card));
  if (body._html !== html) {
    body.innerHTML = html; body._html = html;
    const tl = $(".fctl", card);
    [...tl.children].forEach((li, i) => li.style.setProperty("--i", i));
    fcFades(tl); if (!tl._f) { tl._f = 1; tl.addEventListener("scroll", () => fcFades(tl), { passive: true }); }
    segGlide(card, card._style); card._style = m.style;
  }
  mapTick(cv, live, card.offsetHeight + 14);
  fcAside(card);
}
// (every: how long the whole map may go without being drawn again; smoothMap asks for twice a second)
function tickMap(every) {
  const s = S.sheet; if (!s || s.type !== "map") return;
  const m = s.id === "skies" || s.id === "preview" ? null : (S.msgs.get(S.chat) || []).find((x) => x.id === s.id);
  if (m && moonOf(m)) return tickMoon(m);
  const card = $(".mapcard", $layer), cv = $(".map", $layer);
  // only one pigeon's own card folds (The Skies and a group's flights keep theirs; the way before you send has one like it, unfolding)
  if (card?.classList.contains("fc") && (s.id === "skies" || m?.flock)) { card.classList.remove("fc", "fold", "swap", "pv"); $(".fcfold", card)?.remove(); const b = $(".mcb", card); if (b) b._html = ""; fcAside(card); }
  if (s.id === "skies") return tickSkies(card, cv);
  if (s.id === "preview") return tickPreview(card, cv);
  if (!m || !card || !(m.route || m.flock)) return;
  if (m.flock) return tickFlockMap(m, card, cv);
  // its way changed while the map was open (it turned for the weather, sheltered, or was cheered on): say so
  // (its shape: where it goes, not when; a cheer only speeds it up)
  const way = JSON.stringify((m.legs || []).filter((l) => l[3] !== "c" && l[3] !== "f").map((l) => [l[3], l[0], l[1]]));
  if (s.way != null && s.way !== way && !m.lost && m.deliverAt > now()) { const n = routeNote(m); toast(esc(n ? `Its way just changed: ${n.text[0].toLowerCase()}${n.text.slice(1)}.` : `Its way just changed: it now lands ${atTime(m.deliverAt)}.`)); haptic("tick"); }
  s.way = way;
  const { share, cheer, look } = cardShell(card), canShare = shareable(m);
  const fill = () => { if (share.hidden === canShare) share.hidden = !canShare; share.dataset.id = m.id; cheerState(cheer, m); lookState(look, m); flightCard(card, m); };
  // the card becoming something else (landed, lost or called back; its cheer, share or Look Up coming or going): it
  // springs to its new shape, the map re-fitting with it, rather than all of it changing in one frame
  const shape = `${m.lost ? "l" : m.recalled ? "b" : now() >= m.deliverAt ? "d" : "a"}|${canShare}|${cheerable(m).flying}|${!!lookAt(m)}`;
  if (s.shape && s.shape !== shape && !STILL.matches) { s.shape = shape; fcMorph(card, fill); } else { s.shape = shape; fill(); }
  mapTick(cv, m, card.offsetHeight + 14, every);
  smoothMap(m);
}
const MOON_ICON = { up: "up", globe: "globe", dot: "dot", dist: "dist", moon: "moon", check: "check", pin: "pin", fire: "fire" };
const TRIP_LABEL = { surface: "The pigeon bounding across the Moon", trip: "The pigeon on its way between the Earth and the Moon", laser: "A laser pigeon: a pulse of light between the worlds", orbit: "The pigeon’s path round the Earth in orbit" };
function drawMoonFlight(s, m) {
  const o = moonOf(m), mine = m.from === S.me.id, g = m.gid ? group(m.gid) : null;
  const other = g ? (mine ? member(g, o.to) : member(g, m.from)) : friend(mine ? m.to : m.from);
  const nm = (p) => (p?.id === S.me.id ? "You" : esc(first(p?.name || "Someone")));
  const flying = o.deliverAt > now() && !o.lost;
  if (!$(".moonsky", $layer)) {
    $layer.innerHTML = sheetHtml(flying ? "Pigeon in Flight" : "The Flight", `<canvas class="moonsky" role="img" aria-label="${esc(TRIP_LABEL[o.mn.k] || TRIP_LABEL.trip)}"></canvas>
      <div class="mooncard"><div class="mchead">${pg(kindOf(m))}<span class="mct"><b>${mine ? `To ${nm(other)}` : `From ${nm(other)}`}</b><small class="mcwhere"></small></span><span class="mceta"></span></div>
      ${o.many && mine && g ? `<div class="mcwho" role="group" aria-label="Whose pigeon">${m.flock.map((x) => `<button type="button" class="mcw" data-act="moonwho" data-id="${esc(m.id)}|${esc(x.to)}">${esc(first(member(g, x.to)?.name || "Someone"))}</button>`).join("")}</div>` : ""}
      <div class="mcnow"></div><div class="mcbar" aria-hidden="true"><i></i></div>
      <div class="mcplay"><input type="range" class="mcreplay" min="0" max="1000" step="1" aria-label="Replay the trip"><button type="button" class="mclive" data-act="moonlive">Live</button></div>
      <ol class="mcsteps"></ol>
      <div class="mclook" hidden><button type="button" class="btn wide plain lookbtn" data-act="lookup" data-id="${esc(m.id)}">${I.compass}Look Up</button></div>
      <div class="mcshare" hidden><button type="button" class="btn wide plain" data-act="shareflight" data-id="${esc(m.id)}">${I.share}Share Flight</button></div></div>`, { flush: true });
    $(".sheet .body", $layer).classList.add("moonbody");
    // scrub through the trip: the picture and where it was then (Live goes back to now)
    $(".mcreplay", $layer).addEventListener("input", (e) => { S.moonReplay = { id: m.id, f: Number(e.target.value) / 1000 }; tickMoon(m); });
  }
  tickMoon(m);
}
const placeOf = (e) => (e?.place ? e.place : e?.b === "moon" ? "the Moon" : e?.b === "mars" ? "Mars" : "Earth");
function tickMoon(m) {
  const cv = $(".moonsky", $layer); if (!cv) return;
  const o = moonOf(m), now0 = now(), end = o.lost ? Math.min(now0, o.lostAt || now0) : now0;
  const live = Math.max(0, Math.min(1, (end - o.sentAt) / (o.deliverAt - o.sentAt)));
  // replaying: any moment up to now (or the whole trip, once it's landed)
  const rp = S.moonReplay?.id === m.id ? Math.min(live, S.moonReplay.f) : null, f = rp ?? live, t = rp == null ? now0 : o.sentAt + f * (o.deliverAt - o.sentAt);
  drawTrip(cv, o.mn, f, t, { lost: o.lost && !o.recalled && rp == null });
  const card = $(".mooncard", $layer), place = (e) => (e?.place ? esc(o.mn.k === "surface" || (o.mn.k === "laser" && o.mn.relay) ? e.place.replace(/, (the Moon|Mars)$/, "") : e.place) : e?.b === "moon" ? "the Moon" : e?.b === "mars" ? "Mars" : "Earth");
  $(".mcwhere", card).innerHTML = `${place(o.mn.from)} to ${place(o.mn.to)}`;
  // a group's: whose is showing (each member's pigeon went its own way)
  if (o.many && m.gid) {
    const g = group(m.gid), mine = m.from === S.me.id;
    if (mine) $(".mct b", card).textContent = `To ${first(member(g, o.to)?.name || "Someone")}`;
    for (const b of card.querySelectorAll(".mcw")) { const on = b.dataset.id.endsWith("|" + o.to); b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); }
  }
  const eta = $(".mceta", card), landed = !o.lost && now0 >= o.deliverAt;
  sheetTitle(o.lost || now0 >= o.endAt ? "The Flight" : "Pigeon in Flight");
  eta.innerHTML = rp != null ? `<b>${esc(atShort(t))}</b><small>replay</small>` : o.recalled ? `<b>Called back</b>` : o.lost ? `<b class="lost">Lost</b>` : landed ? `<b>Landed</b><small>${esc(atShort(o.deliverAt))}</small>` : `<b>${esc(airTime(o.endAt - now0))}</b><small>lands ${esc(atShort(o.endAt))}</small>`;
  const nowEl = $(".mcnow", card);
  nowEl.textContent = rp != null ? spaceNow(o.mn, o.sentAt, o.deliverAt, t, whereOnEarth).line
    : o.recalled ? "Called back: it turned for home."
    : o.lost ? (o.mn.k === "laser" ? "The signal was lost: Pigeon Death." : o.mn.k === "orbit" ? "It burnt up coming down: Pigeon Death." : o.mn.k === "trip" && o.mn.to.b === "earth" ? "It burnt up on the way home: Pigeon Death." : "Lost in space: Pigeon Death.")
    : landed ? (o.mn.k === "laser" ? `Crossed ${fmtMiles(Number(o.km || o.mn.dist || 0))} at the speed of light` : o.km ? `${o.mn.k === "surface" ? "Bounded" : "Flew"} ${fmtMiles(Number(o.km))}` : o.mn.k === "surface" ? "Bounded across, and landed." : "Landed safely.")
    : spaceNow(o.mn, o.sentAt, o.deliverAt, t, whereOnEarth).line;
  $(".mcbar i", card).style.width = `${(f * 100).toFixed(2)}%`;
  const slider = $(".mcreplay", card); if (document.activeElement !== slider) slider.value = String(Math.round(f * 1000));
  $(".mclive", card).hidden = rp == null;
  $(".mcshare", card).hidden = !(rp == null && shareable(m));
  $(".mclook", card).hidden = !(rp == null && lookAt(m));
  const steps = spaceMoments(o.mn, o.sentAt, o.deliverAt, t, whereOnEarth), key = steps.map((x) => +x.done).join("") + (o.lost ? "l" : "") + (o.then ? "r" : "");
  // followed them to another world: where it was handed on, or relayed from, and where it's relayed on to
  const by = (k) => (k === "laser" ? "a laser pigeon" : `a ${KIND[k]?.name.toLowerCase() || "space"} pigeon`);
  if (o.mn.hand) steps.unshift({ at: o.sentAt, done: t >= o.sentAt, icon: "up", text: `${o.mn.rested ? "After its stopover, handed" : "Handed"} to ${by(o.mn.pk)}${o.mn.from?.place ? ` ${o.mn.rested ? "in" : "over"} ${o.mn.from.place}` : ""}: they’d left the Earth` });
  else if (o.mn.prev) steps.unshift({ at: o.sentAt, done: t >= o.sentAt, icon: "up", text: `Relayed on from ${placeOf(o.mn.from)} by ${by(o.mn.pk)}: they’d moved` });
  if (o.then) steps.push({ at: o.deliverAt, done: false, icon: o.then.pk === "laser" ? "up" : "moon", text: `${o.then.pk === "laser" ? "Relayed by laser" : `Handed to a ${KIND[o.then.pk]?.name.toLowerCase() || "space"} pigeon`} to ${placeOf(o.then.to)}, where they are now` });
  const ol = $(".mcsteps", card);
  if (ol.dataset.k !== key) {
    ol.dataset.k = key;
    ol.innerHTML = steps.filter((x) => !o.lost || x.at <= o.lostAt).map((x) => `<li class="${x.done ? "done" : ""}"><span class="mci">${I[MOON_ICON[x.icon]] || I.dot}</span><span class="mcs">${esc(x.text)}</span><time>${esc(atShort(x.at))}</time></li>`).join("");
  }
  clearTimeout(S.moonTimer);
  S.moonTimer = setTimeout(() => { if (S.sheet?.type === "map" && $(".moonsky", $layer)) tickMap(); }, 1000);
}
/* ---------- choosing the way: How It Flies and The Way ----------
   Fastest, Scenic or Safe as one sliding switch (each with when it would
   land), and the way it would go as a line with its stops on it. */
const ROUTE_SHORT = { fastest: "Quickest", scenic: "Landmarks", safe: "Rests on islands" };
function routeSeg(style, plans) {
  const i = ROUTES.findIndex((r) => r[0] === style);
  return `<div class="seg" role="radiogroup" aria-label="Route" data-i="${i}"><i class="segthumb" aria-hidden="true"></i>${ROUTES.map(([k, name, , icon]) =>
    `<button type="button" role="radio" aria-checked="${k === style}" data-act="routeset" data-id="${k}">${icon}<b>${name}</b><small>${plans?.[k] ? esc(k === style || !plans[style] ? atTime(plans[k].deliverAt) : segDelta(plans[k].deliverAt - plans[style].deliverAt)) : ROUTE_SHORT[k]}</small>${S.me.risky && plans?.[k]?.risk ? riskTag(plans[k].risk) : ""}</button>`).join("")}</div>`;
}
// the other ways, against the chosen one: "+12 min", "same time", "−5 min"
const segDelta = (d) => (Math.abs(d) < MIN ? "same time" : `${d > 0 ? "+" : "−"}${fmtDur(Math.abs(d))}`);
// Pigeon Death's odds on a way (with it on): "1 in 140", green when better than usual, red when worse
const riskLevel = (r) => (r.p <= 0.007 ? "lo" : r.p >= 0.013 ? "hi" : "mid");
const riskTag = (r) => `<em class="rk ${riskLevel(r)}">1 in ${Math.round(1 / r.p)}</em>`;
// and why: "a long sea crossing, falcons around the Bosphorus"
function riskWhy(r) {
  const why = [r.sea > 500 ? (r.sea > 1500 ? "a very long sea crossing" : "a long sea crossing") : "", r.storms ? "storms it can’t get around" : "", r.hawk ? `falcons around ${r.hawk}` : ""].filter(Boolean);
  return why.length ? why.join(", ") : "";
}
// the switch's thumb glides from the last choice to this one
function segGlide(root, fromStyle) {
  const seg = $(".seg", root); if (!seg) return;
  const th = $(".segthumb", seg), to = +seg.dataset.i, from = fromStyle ? ROUTES.findIndex((r) => r[0] === fromStyle) : to;
  th.style.setProperty("--i", from < 0 ? to : from);
  if (from < 0 || from === to || STILL.matches) return th.style.setProperty("--i", to);
  void th.offsetWidth; th.classList.add("glide"); th.style.setProperty("--i", to);
}
// See the Way: from here to there, with each storm, wind, pass, island and landmark where it comes
// nothing on the way: what that means for the way picked
const STRAIGHT = { fastest: "Straight there: nothing on the way worth going around", scenic: "Straight there: no landmark near enough to fly past", safe: "Straight there: no long sea to rest on the way across" };
function wayCard(plan, d, style) {
  const t0 = d.at, span = Math.max(1, plan.deliverAt - t0);
  let last = -1;
  const dots = fcEvents({ legs: plan.legs, via: true, near: [] }, t0 - 1).map((e) => {
    const x = Math.max(last + 0.07, Math.min(0.93, Math.max(0.07, (e.at - t0) / span))); last = x;
    return `<span class="waystop ${e.tone || ""}" data-x="${Math.min(0.93, x).toFixed(3)}">${e.icon}</span>`;
  }).join("");
  return `<button type="button" class="waycard" data-act="routepreview">
    <span class="wayhd"><b>See the Way</b><span class="waygo">${I.map}On the map</span></span>
    <span class="wayline" aria-hidden="true"><i class="wayend from"></i>${dots}<i class="wayend to"></i></span>
    <span class="wayends"><span><b>${esc(d.fromPlace || "Here")}</b>now</span><span><b>${esc(d.toPlace || "There")}</b>${esc(atTime(now() + plan.deliverAt - t0))}</span></span>
    <span class="waywords">${esc(wayWords(plan.legs) === "the straight way" ? STRAIGHT[style] || "Straight there" : wayWords(plan.legs).replace(/^./, (x) => x.toUpperCase()))}</span></button>`;
}
// sizes and places set from code (inline style attributes are blocked)
function flyBits(root, fromStyle) {
  root.querySelectorAll(".kdur[data-w]").forEach((el) => el.style.setProperty("--w", el.dataset.w));
  root.querySelectorAll(".waystop[data-x]").forEach((el, i) => { el.style.setProperty("--x", el.dataset.x); el.style.setProperty("--i", i); });
  root.querySelectorAll(".kinds .kc").forEach((el, i) => el.style.setProperty("--i", i));
  segGlide(root, fromStyle);
}
// the flight it would be, from the server's plan for that way (for the pigeon picked)
function previewFrom(style) {
  const c = composeState(), d = c?.f && c.kind && KIND[c.kind] ? routePlanFor(c.f.id, c.kind) : null, plan = d?.plans?.[style]; if (!plan) return null;
  return { id: "preview", preview: true, style, from: S.me.id, to: S.chat, pigeon: d.pigeon, skin: S.me.skin, route: [...d.from, ...d.to], legs: plan.legs, km: plan.km,
    sentAt: d.at, deliverAt: plan.deliverAt, fromPlace: d.fromPlace, toPlace: d.toPlace, flying: true, wind: plan.wind, risky: S.me.risky, risk: plan.risk };
}
/* ---------- A pigeon's map card ----------
   Folded, a slim bar over the map: how long it has left, where it is, and a
   cheer. Pulled up, the flight as a timeline: where it took off, what it does
   on the way (storms, wind, islands, passes, landmarks), where it is now, and
   where it lands. Tap or swipe the bar to switch; this phone keeps your choice.
   It springs between the two while the map re-fits around it, the rows rise
   in one after another, and the map's buttons step aside while it's up. */
const mapOpen = () => { try { return localStorage.getItem("inflight-mapcard") === "open"; } catch (_) { return false; } };
function mapFold(open) {
  try { localStorage.setItem("inflight-mapcard", open ? "open" : "fold"); } catch (_) {}
  const card = $(".mapcard.fc", $layer); if (!card) return;
  haptic("tick"); card._tl = 0;
  fcMorph(card, () => tickMap());
}
// redraw the card, then spring its height from the old to the new while the
// map follows it (the new side plays in once; the once-a-second redraws don't replay it)
// (replay: its rows play in again, as when it's folded or unfolded; not for The Way's switch, which only changes some)
function fcMorph(card, redraw, replay = true) {
  const h0 = card.offsetHeight;
  card.classList.remove("swap", "morph"); card.style.height = ""; void card.offsetWidth;
  if (replay) card.classList.add("swap");
  clearTimeout(card._sw);
  redraw();
  const done = () => { card.classList.remove("swap", "morph"); card.style.height = ""; };
  if (STILL.matches) { card._sw = setTimeout(done, 50); return; }
  const h1 = card.offsetHeight;
  card.style.height = h0 + "px"; void card.offsetHeight;
  card.classList.add("morph"); card.style.height = h1 + "px";
  fcFollow(card, 650);
  card._sw = setTimeout(done, 760);
}
// keep the map fitted above the card while it changes size: the picture as it was, moved and scaled to fit each frame
// (quick), and the whole map drawn again once the card has settled (drawing all of it every frame left it at a few
// frames a second on a phone)
function fcFollow(card, ms) {
  const cv = $(".map", $layer), end = performance.now() + ms;
  cancelAnimationFrame(fcFollow.raf);
  const step = () => {
    if (!cv?._m || !card.isConnected || S.sheet?.type !== "map") return;
    cv._cardH = card.offsetHeight + 14; nudgeMap(cv); fcAside(card);
    if (performance.now() < end) fcFollow.raf = requestAnimationFrame(step);
  };
  step();
}
// the same for a card that isn't a pigeon's own (The Skies, a group's flights) when what's on it changes
function cardMorph(card, redraw) {
  const h0 = card.offsetHeight; redraw();
  const h1 = card.offsetHeight;
  if (STILL.matches || !h0 || Math.abs(h1 - h0) < 2) return;
  card.style.overflow = "hidden";
  const a = card.animate([{ height: `${h0}px` }, { height: `${h1}px` }], { duration: 500, easing: cssVar(document.documentElement, "--snappy") || "ease-out" });
  a.onfinish = a.oncancel = () => { card.style.overflow = ""; };
  fcFollow(card, 520);
}
// the map's buttons step aside when the card comes up over them (and back when it folds)
function fcAside(card) {
  const top = card?.classList.contains("fc") ? card.offsetTop : Infinity;
  for (const el of $layer.querySelectorAll(".mapctl")) {
    const under = top < el.offsetTop + el.offsetHeight + 10;
    if (el.classList.contains("fcaside") !== under) { el.classList.toggle("fcaside", under); if (el.matches(".mapctl")) el.inert = under; }
  }
}
// drag the card: it follows your finger (stiffly the wrong way), and past a
// little way it opens or folds; let go short of that and it springs back
function fcDrag(card) {
  let st = null;
  card.addEventListener("touchstart", (e) => {
    const tl = e.target.closest(".fctl");
    st = card.classList.contains("fc") && e.touches.length === 1 && !zoomed() && !(tl && tl.scrollHeight > tl.clientHeight + 1)
      ? { y: e.touches[0].clientY, x: e.touches[0].clientX, t: performance.now(), v: 0, dy: 0, dir: null } : null;
  }, { passive: true });
  card.addEventListener("touchmove", (e) => {
    if (!st) return;
    const t = e.touches[0], dy = t.clientY - st.y, dx = t.clientX - st.x;
    if (!st.dir) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (Math.abs(dx) > Math.abs(dy)) { st = null; return; }
      st.dir = "y"; card.classList.add("drag");
    }
    e.preventDefault();
    const now = performance.now(); st.v = (dy - st.dy) / Math.max(1, now - st.t); st.t = now; st.dy = dy;
    const open = !card.classList.contains("fold"), way = open ? dy > 0 : dy < 0;
    // (pulled up when it's already up, it gives only as far as the gap under the sheet's title, never under it)
    const y = way ? dy * 0.5 : open ? Math.max(dy * 0.15, -Math.max(0, card.offsetTop - 4)) : dy * 0.15;
    card.style.transform = `translateY(${y.toFixed(1)}px)`;
  }, { passive: false });
  const end = () => {
    if (!st?.dir) { st = null; return; }
    const s = st; st = null;
    card.classList.remove("drag"); card.style.transform = "";
    const open = !card.classList.contains("fold");
    if (open ? s.dy > 60 || (s.dy > 20 && s.v > 0.5) : s.dy < -30 || (s.dy < -10 && s.v < -0.4)) mapFold(!open);
  };
  card.addEventListener("touchend", end); card.addEventListener("touchcancel", end);
}
const passName = (n) => (!n ? "a pass" : /^a |^[A-Z][\w’']*['’]s /.test(n) ? n : `the ${n}`);
// what happens on the way, in time order: [{ at, icon, tone, title, sub, until }]
function fcEvents(m, t) {
  const ev = [], legs = m.legs || [], tagged = legs.filter((l) => l[3] && l[3] !== "c" && l[3] !== "f"), once = new Set();
  for (let i = 0; i < tagged.length; i++) {
    const l = tagged[i], [tag, n, at] = [l[3], l[4], l[2]], done = at <= t;
    if ((tag === "i" || tag === "h" || tag === "t") && tagged[i + 1]?.[3] === tag && tagged[i + 1][0] === l[0]) {
      const until = tagged[i + 1][2], over = until <= t;
      // a breather: its named pigeon tires on a long flight (fewer, shorter ones as it rises through the ranks)
      if (tag === "t") { ev.push({ at, until, icon: I.bird, tone: "", title: `${over ? "Caught its breath" : done ? "Catching its breath" : "A breather"} ${n || "on the way"}`, sub: `${fmtDur(until - at)} on the ground${m.bird?.name ? ` · ${m.bird.name} needs it` : ""}` }); i++; continue; }
      ev.push(tag === "h" ? { at, until, icon: severeIcon(l[5]?.k), tone: "warn", title: `${over ? "Sheltered" : done ? "Sheltering" : "Shelters"} from ${SEVERE_WORD[l[5]?.k] || "storms"}${n ? ` ${n}` : ""}`, sub: `${over ? "Until" : "Until about"} ${clockIn(until, MY_TZ)}` }
        : { at, until, icon: I.bird, tone: "teal", title: `${over ? "Rested" : done ? "Resting" : "Rests"} on ${n || "an island"}`, sub: `${over ? "Until" : "Until about"} ${clockIn(until, MY_TZ)}` });
      i++; continue;
    }
    // by ship: boarding (and the voyage), then coming ashore; the lane's own points aren't rows
    if (tag === "b") {
      if (once.has("b")) continue; once.add("b");
      const sh = shipOf(legs); if (!sh) continue;
      const sailing = t >= sh.off, ashore = t >= sh.ashore;
      ev.push({ at: sh.board, until: sh.ashore, icon: I.ship, tone: "teal", title: `${ashore || sailing ? "Boarded" : done ? "Waiting for" : "Boards"} a ship at ${sh.from}`, sub: `Across ${sh.sea} · ${fmtDur(sh.ashore - sh.off)} at sea` });
      ev.push({ at: sh.ashore, icon: I.ship, tone: "teal", title: `${ashore ? "Came" : "Comes"} ashore at ${sh.to}`, sub: "And flies on from there" });
      continue;
    }
    // storms and wind once each: the first place it meets them (it may bend around them, or ride the wind, several times)
    if (tag === "s" || tag === "w" || tag === "o") { if (once.has(tag + (tag === "s" ? done : ""))) continue; once.add(tag + (tag === "s" ? done : "")); }
    const say = {
      s: [severeIcon(severeKOf(legs)), "warn", `${done ? "Went" : "Goes"} around ${severeOf(legs)}${n ? ` over ${n}` : ""}`, ""],
      w: [I.wind, "green", done ? "Rode the wind" : "Rides the wind", "A longer way, but quicker"],
      p: [I.map, "", `${done ? "Came through" : "Through"} ${passName(n)}`, "Over the mountains"],
      v: [I.loc, "teal", `${done ? "Flew past" : "Past"} ${n || "a landmark"}`, "For its postmark"],
      o: [I.waves, "teal", `${done ? "Followed" : "Follows"} the coast${n ? ` of ${n}` : ""}`, "Over land, rather than open sea"],
      m: [I.map, "", `${done ? "Flew" : "Flies"} over ${n || "the mountains"}`, "High enough not to need a pass"],
      r: [n === "s" ? severeIcon(l[5]?.k) : I.wind, "warn", n === "s" ? `Turned to keep clear of ${SEVERE_WORD[l[5]?.k] || "storms"}` : "Turned to ride the wind", "Changed course in the air"],
    }[tag];
    if (say) ev.push({ at, tag, icon: say[0], tone: say[1], title: say[2], sub: say[3] });
  }
  // it turned to follow someone who moved
  if (!m.via) for (const l of legs.filter((x) => !x[3])) {
    const who = m.to === S.me.id ? "you" : esc(first(friend(m.to)?.name || "them"));
    ev.push({ at: l[2], icon: I.loc, tone: "", title: "Changed course", sub: `To follow ${who}${who === "you" ? ": you moved" : ""}` });
  }
  // near misses, once each (a pair can be stored from both sides): "Passed Reuben's pigeon", "Overtook your pigeon to Nia"
  const met = new Set();
  for (const n of m.near || []) {
    if (met.has(n.other.id)) continue; met.add(n.other.id);
    const o = n.other, nm = (id) => first(personById(id)?.name || "a friend");
    const whose = o.from === S.me.id ? `your pigeon to ${esc(nm(o.to))}` : `${esc(nm(o.from))}’s pigeon`;
    const over = n.place && n.place !== "land" ? `Over ${n.place}` : "In mid-air";
    if (n.kind === "flock") {                                       // (they part when the server says: n.until)
      const parts = n.until ?? n.at;
      ev.push({ at: n.at, icon: I.people, tone: "teal", cls: "near flock", title: `${n.at > t ? "Flies" : parts > t ? "Flying" : "Flew"} with ${whose}`, sub: `${over} · 10% faster together` }); continue;
    }
    ev.push({ at: n.at, icon: I.pass, tone: "orange", cls: "near", title: n.kind === "overtake" ? (n.lead === "other" ? `Overtaken by ${whose}` : `Overtook ${whose}`) : `Passed ${whose}`, sub: over });
  }
  return ev.sort((a, b) => a.at - b.at);
}
// a row's time: "14:02", or "Mon" under it on another day ("~" when it's still to come)
function fcAt(ts, soon) {
  const c = clockIn(ts, MY_TZ), [, day, hm] = /^(?:(\S+) )?(\d\d:\d\d)$/.exec(c) || [, "", c];
  return `${soon ? "~" : ""}${hm}${day ? `<small>${day}</small>` : ""}`;
}
function fcRow(r) {
  return `<li class="${r.cls || ""}${r.done ? " done" : ""}${r.flown ? " flown" : ""}${r.now ? " now" : ""}">
    <span class="fcat">${r.now ? "Now" : r.time}</span>
    <span class="fcdot ${r.dot || "ev"} ${r.tone || ""}">${r.now ? r.coin : r.dot === "ev" || !r.dot ? r.icon || "" : ""}</span>
    <span class="fcwhat"><span class="fctitle">${r.title}</span>${r.sub ? `<span class="fcs">${r.sub}</span>` : ""}${r.extra || ""}</span></li>`;
}
// the sheet's title follows the flight (it opened "Pigeon in Flight"; once it's down, it's "The Flight")
function sheetTitle(text) {
  const h = $(".sheet header h2", $layer); if (!h || h.textContent === text) return;
  h.textContent = text; if (!STILL.matches) h.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: "ease" });     // (fading in, not a cut)
}
function flightCard(card, m) {
  const open = mapOpen(), t = m.lost ? m.lostAt : now(), left = m.deliverAt - now(), f = flightAt(m, t), k = kindOf(m);
  const landed = !m.lost && left <= 0, resting = restingOn(m), flew = m.deliverAt - m.sentAt, note = routeNote(m), wx = wxSay(m);
  if (S.sheet?.id === m.id) sheetTitle(m.lost || landed ? "The Flight" : "Pigeon in Flight");
  // the first time: it rises in a beat after the sheet
  if (!card.classList.contains("fc")) { card.classList.add("fc", "enter"); setTimeout(() => card.classList.remove("enter"), 900); }
  card.classList.toggle("fold", !open);
  if (!$(".fcfold", card)) card.insertAdjacentHTML("afterbegin", `<button type="button" class="fcfold" data-act="mapfold"><i></i></button>`);
  const fold = $(".fcfold", card), label = open ? "Fold the card away" : "Show the flight’s details";
  if (fold.getAttribute("aria-label") !== label) { fold.setAttribute("aria-label", label); fold.setAttribute("aria-expanded", String(open)); }
  const coin = m.recalled ? `<span class="homing">${I.homing}</span>` : m.lost ? `<span class="lostp">${I.skull}</span>` : pgm(m), from = esc(m.fromPlace || "?"), to = esc(m.toPlace || "?");
  const where = !m.lost && !landed && !resting ? esc(overWhere(...pigeonLL(m))) : "";
  const big = m.recalled ? "Called back" : m.lost ? "Lost on the way" : landed ? "Landed" : esc(fmtDur(left));
  const lands = landsLine(m).replace(/^Lands/, "lands");
  let html;
  if (!open) {
    // (folded, one line: just when it lands; the card pulled up has the likely range, and their time)
    const peek = `lands ${esc(clockIn(m.deliverAt, MY_TZ))}`;
    const sub = m.lost ? `${from} → ${to}` : landed ? `${from} → ${to} · flew ${esc(fmtDur(flew))}` : resting ? esc(note?.text || "Resting")
      : `${from} → ${to}${where ? ` · over <b>${where}</b>` : ""}`;
    html = `<span class="fcpeek"><span class="fccoin">${coin}</span><span class="fct"><span class="big">${big}${!m.lost && !landed ? `<small> · ${peek}</small>` : ""}</span><span class="fcs">${sub}</span></span></span>
      <span class="fcbar k-${k}${m.lost ? " lost" : ""}"><i></i></span>`;
  } else {
    const pill = m.lost ? "" : landed ? ["ok", `${I.check}Landed`] : resting ? (resting[2] === "h" ? ["warn", "Sheltering"] : resting[2] === "b" ? ["teal", "Waiting for a Ship"] : resting[2] === "sail" ? ["teal", "At Sea"] : resting[2] === "v" ? ["teal", "Stopover"] : ["teal", "Resting"])
      : f.phase === "up" ? ["ok", "Taking Off"] : f.phase === "down" ? ["ok", "Landing"] : ["tint", "In Flight"];
    const head = m.lost ? `${from} → ${to}` : landed ? `in ${to} · ${esc(fmtShort(m.deliverAt))}` : `to ${to} · <span class="lands">${lands}</span>`;
    // the rows: took off, what happens on the way, now, lands
    const rows = [{ at: m.sentAt, time: fcAt(m.sentAt), dot: "end", title: `Took off from ${from}`, sub: `${milesOf(m.km, m.legs)}${m.style ? ` · the ${esc((ROUTES.find((x) => x[0] === m.style)?.[1] || m.style).toLowerCase())} way` : ""}` }];
    for (const e of fcEvents(m, t)) rows.push({ ...e, time: fcAt(e.at, e.at > t), title: esc(e.title), sub: esc(e.sub || ""), now: !!(resting && e.until && e.at <= t && t < e.until) });
    const chips = [];
    if (!resting) chips.push(`<span class="fcchip speed">${esc(fmtMph(f.kmh))}</span>`);
    if (wx && !landed) chips.push(`<span class="fcchip wx ${wx.cls}">${wx.icon}${esc(wx.text)}</span>`);
    else if (m.wind != null && !landed) chips.push(`<span class="fcchip wind ${m.wind >= 3 ? "tail" : m.wind <= -3 ? "head" : ""}">${I.wind}${fmtWind(m.wind)}${Math.abs(m.wind) >= 3 ? ` · ${m.wind > 0 ? "faster" : "slower"} than usual` : ""}</span>`);
    chips.push(`<span class="fcchip dim">${Math.round(flownFrac(m, t) * 100)}% of the way</span>`);
    // (only what it's doing now: a turn for the weather, or a rest; the rest of its way has rows of its own)
    const said = note && /^(Rerouted|Sheltering|Resting on .* until|Waiting for a ship|At sea)/.test(note.text);
    const extra = `<span class="fcchips">${chips.join("")}</span>${said ? `<span class="waynote">${note.icon}${esc(note.text)}</span>` : ""}`;
    if (!m.lost && !landed) {
      const nr = rows.find((r) => r.now);
      if (nr) Object.assign(nr, { coin, extra });
      else rows.push({ at: t, now: true, coin, title: where ? `<span class="over">Over ${where}</span>` : esc(note?.text || "On its way"), extra });
    }
    if (m.recalled) rows.push({ at: t, time: fcAt(t), dot: "ev", icon: I.homing, title: "Called back", sub: m.from === S.me.id ? "You called it home" : "They called it home" });
    else if (m.lost) rows.push({ at: t, time: fcAt(t), dot: "ev", tone: "red", icon: I.skull, title: "Lost on the way", sub: m.risky ? "Pigeon Death was on" : "" });
    else rows.push({ at: m.deliverAt, time: fcAt(m.deliverAt), dot: "end", title: `${landed ? "Landed" : "Lands"} in ${to}`,
      sub: landed ? `Flew ${esc(fmtDur(flew))} · averaged ${esc(fmtMph(avgKmh(m)))}${stillMs(m) > HOUR ? " in the air" : ""}` : "", extra: landed && wx ? `<span class="wx ${wx.cls}">${wx.icon}${esc(wx.text)}</span>` : "" });
    rows.sort((a, b) => a.at - b.at || (a.now ? 1 : 0) - (b.now ? 1 : 0));
    rows.forEach((r, i) => { r.done = r.at <= t && !r.now; r.flown = !!rows[i + 1] && rows[i + 1].at <= t; });
    // anything else worth a line: who it flew over, cheers, the weather watch
    const notes = [flyText(m) ? `<span class="flyover">${I.wave}${esc(flyText(m))}</span>` : "",
      m.cheers ? `<span class="cheers">${I.wind}Cheered on ${m.cheers === 1 ? "once" : m.cheers + " times"} · ${esc(soonerText(m.cheerMs))} sooner</span>` : "",
      !m.lost && left > LIVE_LEFT ? `<span class="checked">${I.eye}Watching the weather ahead · checked ${m.liveAt ? agoText(m.liveAt) : "at take‑off"}</span>` : ""].join("");
    // who carries it (a named pigeon), or what kind of pigeon it is; and how it flies
    const b = m.bird, mine = b && m.from === S.me.id && b.id ? [...S.birds, ...S.hall].find((x) => x.id === b.id) : null;
    const tags = [b && k !== "standard" ? `<span class="fcchip k-${k}">${esc(KIND[k]?.name || k)}</span>` : "",
      m.style && m.style !== "fastest" ? `<span class="fcchip sty">${esc(ROUTES.find((x) => x[0] === m.style)?.[1] || m.style)}</span>` : "",
      m.noShip ? `<span class="fcchip sty">No Ships</span>` : "",
      m.risky ? `<span class="fcchip risk">1.25×</span>` : ""].join("");
    const who = b ? `<span class="fcav" aria-hidden="true">${esc([...b.name][0] || "?")}</span><span class="fct"><span class="birdline">Carried by ${esc(b.name)}${esc(wearWord(b.wear))}</span><span class="fcs">${esc(b.up || b.rank)}${mine?.km >= 1 ? ` · ${fmtMiles(mine.km)} in all` : ""}</span></span>`
      : `<span class="fcav pgk" aria-hidden="true">${coin}</span><span class="fct"><span class="fckind">${m.mystery ? "A mystery pigeon" : `${/^[AEIOU]/.test(KIND[k]?.name || "") ? "An" : "A"} ${esc((KIND[k]?.name || "standard").toLowerCase())} pigeon`}</span><span class="fcs">${milesOf(m.km, m.legs)}${m.risky ? " · Pigeon Death on" : ""}</span></span>`;
    html = `<span class="fchead" data-act="mapfold"><span class="fccoin lg">${coin}</span><span class="fct"><span class="big">${big}</span><span class="fcs">${head}</span></span>${pill ? `<span class="fcpill ${pill[0]}">${pill[1]}</span>` : ""}</span>
      <ol class="fctl" aria-label="The flight, start to finish">${rows.map(fcRow).join("")}</ol>${notes ? `<span class="fcnotes">${notes}</span>` : ""}<span class="fcwho">${who}${tags ? `<span class="fctags">${tags}</span>` : ""}</span>`;
  }
  const body = $(".mcb", card);
  if (body._html !== html) {
    const tl = $(".fctl", card), top = tl ? tl.scrollTop : 0;
    body.innerHTML = html; body._html = html;
    // the timeline keeps its place; opened, it starts at now (with a little of what came before)
    const tl2 = $(".fctl", card), nr = tl2 && $(".now", tl2);
    // (the ping where it is now keeps its beat when the rows are drawn again, each minute, rather than starting over)
    if (nr) { card._ping ??= performance.now() + 800; nr.style.setProperty("--ping", `${Math.round(card._ping - performance.now())}ms`); }
    if (tl2) {
      [...tl2.children].forEach((li, i) => li.style.setProperty("--i", i));        // (each row a beat after the last, as they rise in)
      if (card._tl) tl2.scrollTop = top;
      else { card._tl = 1; if (nr) tl2.scrollTop = Math.max(0, nr.offsetTop - 22); }
      fcFades(tl2); if (!tl2._f) { tl2._f = 1; tl2.addEventListener("scroll", () => fcFades(tl2), { passive: true }); }
    }
  }
  const bar = $(".fcbar i", card); if (bar) bar.style.width = (flownFrac(m, t) * 100).toFixed(2) + "%";
  fcAside(card);
}
// the timeline fades out at an edge with more to scroll to
function fcFades(tl) {
  const up = tl.scrollTop > 2, down = tl.scrollTop + tl.clientHeight < tl.scrollHeight - 2;
  tl.classList.toggle("more-up", up); tl.classList.toggle("more-down", down);
}
function tickSkies(card, cv) {
  if (!card || !cv) return;
  const list = skyRoutes();
  if (!list) { if (!card._sk) { card._sk = 1; card.innerHTML = `<span class="speed">Looking up…</span>`; } return; }
  const onMap = list.filter((r) => r.route), n = list.length, key = list.map((r) => r.id).join() || "-";
  if (card.dataset.k !== key) {           // rows only change when the list does (the times tick by themselves)
    const first = !card._sk; card._sk = 1; card.dataset.k = key;
    const rows = list.map((r) => `<button type="button" class="frow skyrow" data-act="skyopen" data-id="${esc(r.chat)}">${r.g && !r.who ? gavatar(r.g, "xs") : avatar(r.who || { name: "?" }, "xs")}
        ${pgm(r)}<span class="one">${esc(r.label)}${r.route ? "" : ` <span class="hid">· not on map</span>`}</span><b><span data-eta="${esc(r.deliverAt)}">${fmtDur(r.deliverAt - now())}</span></b></button>`).join("");
    // (a pigeon taking off or landing: the card springs to its new size, the map re-fitting with it)
    const fill = () => { const top = $(".frows", card)?.scrollTop || 0; card.innerHTML = `<span class="big">${I.globe}<span>${n ? `${n} pigeon${n === 1 ? "" : "s"} in the air` : "Clear skies"}</span></span>
      ${n ? `<span class="speed">${list.filter((r) => r.out).length} yours, ${list.filter((r) => !r.out).length} coming to you</span>` : `<span class="speed">No pigeons are flying to or from you right now.</span>`}
      ${n ? `<span class="frows">${rows}</span>` : ""}`; const fr = $(".frows", card); if (fr && top) fr.scrollTop = top; };
    first ? fill() : cardMorph(card, fill);
  }
  // nothing in the air: just your roost
  const here = S.me.lat != null ? [{ here: true, route: [S.me.lat, S.me.lon, S.me.lat, S.me.lon], sentAt: 0, deliverAt: 1, km: 0, fromPlace: S.me.place, toPlace: S.me.place }] : [];
  const skies = onMap.length ? onMap : here;
  if (skies.length) { mapTick(cv, { skies }, card.offsetHeight + 14); smoothMap({ skies, lost: true }); }
}

// Your message to a group: how far each pigeon has got.
// A map's card: its words (redrawn every tick) and its buttons, kept (one
// redrawn under a finger never gets its tap): cheer it on while it flies, share it once it lands.
function cardShell(card) {
  if (!$(".mcb", card)) card.innerHTML = `<div class="mcb"></div><button type="button" class="btn wide plain lookbtn" data-act="lookup" hidden>${I.compass}Look Up</button><button type="button" class="btn wide plain cheerbtn" data-act="cheer" hidden>${I.wind}<span></span></button><button type="button" class="btn wide shareflight" data-act="shareflight" hidden>${I.share}Share Flight</button>`;
  return { share: $(".shareflight", card), cheer: $(".cheerbtn", card), look: $(".lookbtn", card) };
}
function cheerState(btn, m) {
  const c = cheerable(m), label = c.can ? `Cheer ${c.them ? "Them" : "It"} On${c.left < CHEER_EACH ? ` · ${c.left} left` : ""}` : (m.cheered || 0) >= CHEER_EACH ? "Cheered On" : "Nearly There";
  const key = `${c.flying}|${c.can}|${label}|${m.id}`;
  if (btn.dataset.k === key) return;
  btn.dataset.k = key; btn.dataset.id = m.id; btn.hidden = !c.flying; btn.disabled = !c.can; $("span", btn).textContent = label;
}
/* ---------- Look up: which way your pigeon is, right now ----------
   Hold the phone up and turn: the sky ahead of you, with the pigeon where it really is (most often far past the
   curve of the Earth, so below the horizon), how far, and over where. A space pigeon: the Moon or Mars, where it is
   in your sky, or an orbital one going over. It uses where you've told Chat you are, and the phone's compass
   (iPhone asks first); without a compass, a dial says which way to face. */
const lookState = (btn, m) => { const on = !!lookAt(m); if (btn.hidden === on) btn.hidden = !on; btn.dataset.id = m.id; };
// where a pigeon in the air is from here: { az, el, km, over?, sky?, orbit? }, or null (landed, lost, not on the map,
// or you're not on the Earth)
// where you're looking from: where you are now, if you've asked (Where I Am; kept on this phone, only while Look Up is
// open), or where your profile says
const lookFrom = () => (look.here ? look.here : S.me?.lat != null && !S.me.moon ? { lat: S.me.lat, lon: S.me.lon } : null);
function lookAt(m, t = now()) {
  const me = lookFrom(); if (!me) return null;
  const o = moonOf(m);
  if (o) {
    if (o.lost || o.deliverAt <= t || t < o.sentAt) return null;
    if (o.mn.k === "orbit") {
      const [la, lo, phase] = orbitWhere(o.mn, t - o.sentAt);
      return { ...lookTo(me.lat, me.lon, la, lo, phase === "orbit" ? ORBIT.alt : 3), over: overWhere(lo, la), orbit: phase };
    }
    const mars = bodyOf(o.mn.from) === "mars" || bodyOf(o.mn.to) === "mars", f = (t - o.sentAt) / Math.max(1, o.deliverAt - o.sentAt);
    const out = bodyOf(o.mn.from) === "earth" ? distAt(o.mn, f) : bodyOf(o.mn.to) === "earth" ? 1 - distAt(o.mn, f) : 1;     // (how far out from the Earth)
    return { ...(mars ? marsLook(t, me.lat, me.lon) : moonLook(t, me.lat, me.lon)), km: out * (mars ? marsKm(t) : moonKm(t)), sky: mars ? "Mars" : "the Moon",
      home: bodyOf(o.mn.to) === "earth", surface: o.mn.k === "surface" };
  }
  if (m.flock || m.lost || m.deliverAt <= t || t < m.sentAt || !routesOf(m).length) return null;
  const [lon, lat] = pigeonLL(m);
  return { ...lookTo(me.lat, me.lon, lat, lon, 0.12), over: overWhere(lon, lat) };
}
// Its whole way across your sky, from where it set off to where it lands: a line through points along it, each as it
// would look from here (most of it under the horizon, past the curve of the Earth), the part flown solid
function lookArc(m) {
  if (m.flock || moonOf(m) || !m.route) return null;
  const me = lookFrom(); if (!me) return null;
  const pts = routePts(m), step = Math.max(1, Math.floor(pts.length / 80));
  const arc = pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map((p) => ({ ...lookTo(me.lat, me.lon, latOf(p.y), p.x, 0.12), t: p.t }));
  return { arc, from: m.fromPlace || "where it set off", to: m.toPlace || "where it lands" };
}
async function lookHere(on) {
  const b = $(".lookhere", $layer);
  if (!on) { if (look.watch != null) navigator.geolocation?.clearWatch(look.watch); look.watch = null; look.here = null; look.tg = null; b?.setAttribute("aria-pressed", "false"); return; }
  if (!navigator.geolocation) return toast("This phone can’t say where it is, so Look Up uses where your profile says.");
  b?.setAttribute("aria-pressed", "true");
  look.watch = navigator.geolocation.watchPosition((p) => { look.here = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }; look.tg = null; },
    () => { lookHere(false); toast("Couldn’t find where you are, so Look Up uses where your profile says."); }, { enableHighAccuracy: true, maximumAge: 30e3, timeout: 20e3 });
}
const POINTS = ["north", "north-north-east", "north-east", "east-north-east", "east", "east-south-east", "south-east", "south-south-east",
  "south", "south-south-west", "south-west", "west-south-west", "west", "west-north-west", "north-west", "north-north-west"];
const compassWord = (az) => POINTS[Math.round(az / 22.5) % 16];
const turnBy = (from, to) => ((to - from + 540) % 360) - 180;           // the shortest way round: + right, - left
function lookSensor(e) {
  let h = typeof e.webkitCompassHeading === "number" ? e.webkitCompassHeading : e.absolute && e.alpha != null ? 360 - e.alpha : null;
  if (h == null) return;
  look.denied = false;   // (a heading's come after all: asked again in Settings, say, or never really refused)
  h = (h + (screen.orientation?.angle || 0) + 360) % 360;
  // smoothed, the shortest way round (a compass jitters)
  look.heading = look.heading == null ? h : (look.heading + turnBy(look.heading, h) * 0.2 + 360) % 360;
  if (typeof e.beta === "number") look.pitch += (Math.max(-60, Math.min(80, e.beta - 90)) - look.pitch) * 0.2;   // upright: the horizon ahead
}
function lookStart() {
  if (look.on) return;
  look.on = true; look.heading = null; look.said = "";
  addEventListener("deviceorientationabsolute", lookSensor); addEventListener("deviceorientation", lookSensor);
  if (!look.stars) { let x = 7; const r = () => ((x = (x * 16807) % 2147483647) / 2147483647); look.stars = Array.from({ length: 220 }, () => [r() * 360, Math.asin(r()) / (Math.PI / 180), 0.4 + r() * 1.2]); }
  look.raf = requestAnimationFrame(lookLoop);
}
// What the lens takes in, corner to corner: a phone's main camera about 75°, an ultra-wide about 120°, a telephoto
// about 30°; zoomed in, less (where the phone says how far)
function lensFov(track) {
  const label = String(track?.label || "").toLowerCase(), st = track?.getSettings?.() || {};
  let fov = /ultra|0\.5/.test(label) ? 120 : /tele/.test(label) ? 30 : 75;
  if (st.zoom > 1) fov = (2 * Math.atan(Math.tan((fov * Math.PI) / 360) / st.zoom) * 180) / Math.PI;
  return fov;
}
// (a phone with several back cameras may hand over a combined, ultra-wide or zoomed one: the plain main one, if there is
// one, lines the sky up best)
async function mainCamera(stream) {
  const tr = stream.getVideoTracks()[0], odd = /ultra|tele|triple|dual|0\.5/i;
  if (!tr || !odd.test(tr.label || "")) return stream;
  const cams = (await navigator.mediaDevices.enumerateDevices().catch(() => [])).filter((d) => d.kind === "videoinput" && /back|rear|environment/i.test(d.label) && !odd.test(d.label));
  if (!cams.length) return stream;
  try { const s2 = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: cams[0].deviceId }, width: { ideal: 1280 } }, audio: false }); stream.getTracks().forEach((x) => x.stop()); return s2; }
  catch (_) { return stream; }
}
// Through the camera: the real sky ahead, with the pigeon drawn where it is. The picture stays on this phone (nothing
// is kept or sent), and the camera goes off as soon as you leave.
async function lookCamera(on) {
  const v = $(".lookvid", $layer), b = $(".lookcam", $layer);
  // off: the camera stops whatever else has gone (Back may already have taken the sheet away), and one still
  // starting is told not to bother
  if (!on) {
    look.camReq = (look.camReq || 0) + 1; look.camPending = false;
    look.stream?.getTracks().forEach((x) => x.stop()); look.stream = null;
    if (v) { v.srcObject = null; v.hidden = true; } b?.setAttribute("aria-pressed", "false"); return;
  }
  if (!v || !b || look.camPending || look.stream) return;
  const req = look.camReq = (look.camReq || 0) + 1; look.camPending = true; b.setAttribute("aria-pressed", "true");
  let stream;
  try { stream = await mainCamera(await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false })); }
  catch (_) { if (req === look.camReq) { look.camPending = false; b.hidden = true; b.setAttribute("aria-pressed", "false"); toast("The camera isn’t available, so here’s the sky drawn instead."); } return; }
  // (turned off, or Look Up left, while it was starting: it stops straight away)
  if (req !== look.camReq || !look.on || S.sheet?.type !== "lookup" || !$(".lookvid", $layer)) { stream.getTracks().forEach((x) => x.stop()); return; }
  look.camPending = false; look.stream = stream; look.fov = lensFov(stream.getVideoTracks()[0]);
  const v2 = $(".lookvid", $layer); v2.srcObject = stream; v2.hidden = false; v2.play().catch(() => {});
}
// the camera and where you are go off when the app goes to the background (turned on again by a tap on return)
document.addEventListener("visibilitychange", () => { if (document.hidden && (look.stream || look.camPending || look.watch != null)) { lookCamera(false); lookHere(false); } });
function lookStop() {
  lookCamera(false); lookHere(false); look.way = null;
  look.on = false; cancelAnimationFrame(look.raf);
  removeEventListener("deviceorientationabsolute", lookSensor); removeEventListener("deviceorientation", lookSensor);
}
function drawLook(s) {
  const m = (S.msgs.get(s.chat) || []).find((x) => x.id === s.id);
  if (!m) { S.sheet = null; return renderSheet(); }
  if ($(".lookcv", $layer)) return;
  $layer.innerHTML = sheetHtml("Look Up", `<div class="look"><video class="lookvid" playsinline muted autoplay hidden></video><canvas class="lookcv" role="img" aria-label="The sky ahead of you, with the pigeon where it is"></canvas>
    <div class="lookbar"><button type="button" class="lookhere" data-act="lookhere" aria-pressed="false" aria-label="Use where I am now (it stays on this phone)">${I.loc}<span>Where I Am</span></button>
    <button type="button" class="lookcam" data-act="lookcam" aria-pressed="false" hidden>${I.camera || I.globe}<span>Camera</span></button></div>
    <div class="lookhud"><div class="lkwho"></div><div class="lkbig"></div><div class="lkwhere"></div><div class="lkhow" aria-live="polite"></div><div class="lksrc"></div></div></div>`, { flush: true, left: { label: "Back", act: "lookback" } });
  $(".sheet", $layer).classList.add("looksheet");
  // (the camera only helps with a compass to line it up)
  const cam = $(".lookcam", $layer); cam.hidden = !navigator.mediaDevices?.getUserMedia;
  look.tg = null; lookStart();
}
function lookLoop() {
  const s = S.sheet, cv = $(".lookcv", $layer);
  if (s?.type !== "lookup" || !cv || document.hidden) { if (s?.type !== "lookup") return lookStop(); look.raf = requestAnimationFrame(lookLoop); return; }
  const m = (S.msgs.get(s.chat) || []).find((x) => x.id === s.id);
  if (!m) return lookStop();
  const t = now();
  if (!look.tg || t - look.tgAt > 500) {
    const me = lookFrom() || { lat: 0, lon: 0 };
    look.tg = lookAt(m, t); look.tgAt = t; look.sun = sunLook(t, me.lat, me.lon); look.moon = moonLook(t, me.lat, me.lon);
    if (!look.way || t - look.wayAt > 5000 || look.wayFrom !== `${me.lat},${me.lon}`) { look.way = lookArc(m); look.wayAt = t; look.wayFrom = `${me.lat},${me.lon}`;
      cv.setAttribute("aria-label", `The sky ahead of you, with the pigeon where it is${look.way ? `, and its way from ${look.way.from} to ${look.way.to}` : ""}`); }
  }
  if (!look.tg) { lookHud(m, null); const bar = $(".lookbar", $layer); if (bar) bar.hidden = true; return lookStop(); }       // landed while you looked
  lookDraw(cv, m); lookHud(m, look.tg);
  look.raf = requestAnimationFrame(lookLoop);
}
// the sky ahead (a compass): the horizon tilting as you tip the phone, its points, the stars or the day, the Moon,
// and the pigeon; or (no compass) a dial with it on, north up
function lookDraw(cv, m) {
  const dpr = devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const tg = look.tg, day = look.sun.el > -4, dusk = look.sun.el > -12 && !day, col = col0(kindOf(m));
  // (a camera the phone ended while the app was away isn't a view: back to the sky drawn)
  const live = look.heading != null && !look.denied, v = $(".lookvid", $layer), cam = live && look.stream?.getVideoTracks()[0]?.readyState === "live" && v?.videoWidth > 0;
  $(".lookcam", $layer).hidden = !live || !navigator.mediaDevices?.getUserMedia;
  // the camera coming on: the sky drawn until now fades away over it, rather than cutting to it
  if (cam !== !!look.camWas) {
    look.camWas = cam;
    if (cam && !STILL.matches && cv.width) {
      const gh = canvasCopy(cv, "lookghost");
      const a = gh.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: "ease", fill: "forwards" }); a.onfinish = a.oncancel = () => gh.remove();
    }
  }
  if (cam) g.clearRect(0, 0, W, H);
  else {
    const sky = g.createLinearGradient(0, 0, 0, H);
    if (day) { sky.addColorStop(0, "#2f78d6"); sky.addColorStop(1, "#9fcaf2"); } else if (dusk) { sky.addColorStop(0, "#14204a"); sky.addColorStop(1, "#c9724a"); }
    else { sky.addColorStop(0, "#03050f"); sky.addColorStop(1, "#16224a"); }
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
  }
  if (!live) return lookDial(g, W, H, tg, col);
  // pixels per degree: a drawn sky shows 62° across; the camera, what its lens sees (a phone's main camera takes in about
  // 75° corner to corner), filling the screen
  let ppd = W / 62;
  if (cam) { const vw = v.videoWidth, vh = v.videoHeight, fit = Math.max(W / vw, H / vh), fov = 2 * Math.atan(Math.tan(((look.fov || 75) / 2) * Math.PI / 180) * vw / Math.hypot(vw, vh)) / (Math.PI / 180); ppd = (fit * vw) / fov; }
  const hd = look.heading, hy = H * 0.5 + look.pitch * ppd;
  const X = (az) => W / 2 + turnBy(hd, az) * ppd, Y = (el) => hy - el * ppd;
  if (!day && !cam) for (const [az, el, r] of look.stars) { const x = X(az), y = Y(el); if (x > -4 && x < W + 4 && y > -4 && y < hy) { g.fillStyle = `rgba(255,255,255,${dusk ? 0.35 : 0.8})`; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); } }
  // the Moon (and the Sun, by day), where they are
  if (cam) g.shadowColor = "rgba(0,0,0,.6)", g.shadowBlur = 4;          // (lines and words readable on any picture)
  if (look.moon.el > -1 && cam) { const x = X(look.moon.az), y = Y(look.moon.el); g.strokeStyle = "rgba(255,255,255,.85)"; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 16, 0, 7); g.stroke(); g.font = "600 12px -apple-system, system-ui, sans-serif"; g.textAlign = "center"; g.fillStyle = "#fff"; g.fillText("The Moon", x, y - 24); }
  else if (look.moon.el > -1) { const x = X(look.moon.az), y = Y(look.moon.el); g.fillStyle = "#f4f1e6"; g.shadowColor = "rgba(255,255,230,.8)"; g.shadowBlur = 18; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); g.shadowBlur = 0; }
  if (day && !cam) { const x = X(look.sun.az), y = Y(look.sun.el), gl = g.createRadialGradient(x, y, 0, x, y, 60); gl.addColorStop(0, "rgba(255,250,220,.95)"); gl.addColorStop(1, "rgba(255,250,220,0)"); g.fillStyle = gl; g.fillRect(x - 60, y - 60, 120, 120); }
  // the ground, and the points of the compass along the horizon
  if (!cam) { g.fillStyle = day ? "#3f5a3a" : "#0b0f1c"; g.fillRect(0, hy, W, H - hy); }
  g.strokeStyle = "rgba(255,255,255,.55)"; g.lineWidth = 1; g.beginPath(); g.moveTo(0, hy); g.lineTo(W, hy); g.stroke();
  g.font = "600 13px -apple-system, system-ui, sans-serif"; g.textAlign = "center"; g.fillStyle = "rgba(255,255,255,.9)";
  for (let a = 0; a < 360; a += 15) {
    const x = X(a); if (x < -20 || x > W + 20) continue;
    g.beginPath(); g.moveTo(x, hy); g.lineTo(x, hy + (a % 45 ? 6 : 12)); g.stroke();
    if (!(a % 45)) g.fillText(["N", "NE", "E", "SE", "S", "SW", "W", "NW"][a / 45], x, hy + 28);
  }
  // its way: where it set off to where it lands, the part flown solid, the rest dashed, the two ends named
  if (look.way) {
    const ft = flightAt(m).t, pts = look.way.arc.map((p) => ({ x: X(p.az), y: Y(p.el), done: p.t <= ft }));
    g.lineWidth = 2.5; g.lineCap = "round"; g.lineJoin = "round";
    // (each part one line, so its dashes run on; broken where it goes round the back of you)
    for (const done of [true, false]) {
      g.strokeStyle = done ? col : "rgba(255,255,255,.85)"; g.setLineDash(done ? [] : [8, 7]); g.beginPath();
      let on = false;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        if (b.done !== done || Math.abs(b.x - a.x) > W * 0.6) { on = false; continue; }
        if (!on) { g.moveTo(a.x, a.y); on = true; }
        g.lineTo(b.x, b.y);
      }
      g.stroke();
    }
    g.setLineDash([]); g.font = "600 13px -apple-system, system-ui, sans-serif"; g.textAlign = "left";
    for (const [p, name] of [[pts[0], look.way.from], [pts[pts.length - 1], look.way.to]]) {
      if (p.x < 0 || p.x > W || p.y < 20 || p.y > H - 20) continue;
      g.fillStyle = "#fff"; g.beginPath(); g.arc(p.x, p.y, 5, 0, 7); g.fill(); g.fillText(name, p.x + 10, p.y + 4);
    }
  }
  // the pigeon: under the horizon a line up to the point on it to face; off to the side, an arrow at the edge
  const x = X(tg.az), y = Y(tg.el), inX = x > 24 && x < W - 24, inY = y > 24 && y < H - 24;
  if (tg.el < 0 && inX && !look.way) { g.setLineDash([3, 4]); g.strokeStyle = "rgba(255,255,255,.7)"; g.beginPath(); g.moveTo(x, hy); g.lineTo(x, Math.min(y, H - 30)); g.stroke(); g.setLineDash([]); }
  if (inX && inY) {
    const pulse = 1 + 0.12 * Math.sin(performance.now() / 300);
    g.fillStyle = col; g.strokeStyle = "#fff"; g.lineWidth = 3; g.shadowColor = col; g.shadowBlur = 16;
    if (tg.el < 0 && cam) { g.font = "600 12px -apple-system, system-ui, sans-serif"; g.textAlign = "center"; g.fillStyle = "#fff"; g.fillText(`${fmtMiles(tg.km)} away, past the horizon`, x, y + 32); g.fillStyle = col; }
    g.beginPath(); g.arc(x, y, 15 * pulse, 0, 7); g.fill(); g.shadowBlur = 0; g.stroke();
    g.save(); g.translate(x - 10, y - 9.5); g.scale(0.84, 0.84); g.fillStyle = "#fff"; g.fill(birdAt(0.9)); g.restore();      // (the pigeon in it)
  } else {
    const dx = turnBy(hd, tg.az), ex = dx > 0 ? W - 22 : 22, ey = Math.max(40, Math.min(H - 40, inY ? y : hy));
    g.save(); g.translate(ex, ey); g.rotate(dx > 0 ? 0 : Math.PI); g.fillStyle = col; g.strokeStyle = "#fff"; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(12, 0); g.lineTo(-8, -11); g.lineTo(-8, 11); g.closePath(); g.fill(); g.stroke(); g.restore();
  }
  // facing it: the screen says so, and the phone taps once
  g.shadowBlur = 0;
  const on = Math.abs(turnBy(hd, tg.az)) < 6;
  if (on && !look.aligned) haptic("success");
  look.aligned = on;
}
const COL0 = new Map(), col0 = (k) => COL0.get(k) || (COL0.set(k, cssVar(document.documentElement, "--p-" + k) || "#3d9bff"), COL0.get(k));
function lookDial(g, W, H, tg, c) {
  const cx = W / 2, cy = H * 0.42, R = Math.min(W, H) * 0.32;
  g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
  g.font = "600 14px -apple-system, system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "rgba(255,255,255,.9)";
  ["N", "E", "S", "W"].forEach((p, i) => { const a = (i * 90 - 90) * Math.PI / 180; g.fillText(p, cx + Math.cos(a) * (R + 18), cy + Math.sin(a) * (R + 18)); });
  const a = (tg.az - 90) * Math.PI / 180;
  g.strokeStyle = c; g.lineWidth = 4; g.lineCap = "round"; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (R - 16), cy + Math.sin(a) * (R - 16)); g.stroke();
  g.fillStyle = c; g.strokeStyle = "#fff"; g.lineWidth = 3; g.beginPath(); g.arc(cx + Math.cos(a) * R, cy + Math.sin(a) * R, 11, 0, 7); g.fill(); g.stroke();
  g.textBaseline = "alphabetic";
}
function lookHud(m, tg) {
  const hud = $(".lookhud", $layer); if (!hud) return;
  const mine = m.from === S.me.id || m.out, other = friend(mine ? m.to : m.from) || (m.gid ? member(group(m.gid), mine ? m.to : m.from) : null);
  const who = `${pgm(m)}<span>${mine ? "Your pigeon to" : "From"} ${esc(first(other?.name || "a friend"))}</span>`;
  if ($(".lkwho", hud)._h !== who) { $(".lkwho", hud).innerHTML = who; $(".lkwho", hud)._h = who; }
  if (!tg) { $(".lkbig", hud).textContent = "It’s landed"; $(".lkwhere", hud).textContent = ""; $(".lkhow", hud).textContent = ""; return; }
  const live = look.heading != null && !look.denied;
  $(".lkbig", hud).textContent = tg.sky ? (tg.surface ? `On ${tg.sky}` : `${fmtMiles(tg.km)} out`) : `${fmtMiles(tg.km)} away`;
  $(".lkwhere", hud).textContent = tg.sky ? (tg.surface ? "Across its surface, up there" : tg.home ? `On its way home from ${tg.sky}` : `On its way to ${tg.sky}`)
    : tg.orbit === "orbit" ? `In orbit, ${Math.round(ORBIT.alt * 0.621371)} miles up, over ${tg.over}` : `Over ${tg.over}`;
  const up = tg.el > 2 ? `${Math.round(tg.el)}° up` : tg.el < -1 ? (tg.sky ? "below the horizon just now" : "below the horizon, past the curve of the Earth") : "on the horizon";
  // (said again only when it changes enough to matter, so a screen reader isn't talking all the time)
  const turn = live ? Math.round(turnBy(look.heading, tg.az) / 10) * 10 : null;
  const how = live ? (look.aligned ? `There it is: ${up}.` : `Turn ${turn > 0 ? "right" : "left"} about ${Math.abs(turn) || 5}°. It’s ${up}.`)
    : `Face ${compassWord(tg.az)} (${Math.round(tg.az)}°). It’s ${up}.${look.denied ? " (Allow motion and orientation for the live compass.)" : ""}`;
  if (look.said !== how) { $(".lkhow", hud).textContent = how; look.said = how; }
  const src = look.here ? `From where you are now${look.here.acc ? ` (to within ${look.here.acc < 1000 ? `${Math.max(5, Math.round(look.here.acc / 5) * 5)} m` : `${(look.here.acc / 1609).toFixed(1)} mi`})` : ""}` : `From ${S.me.place || "where your profile says"}`;
  if ($(".lksrc", hud).textContent !== src) $(".lksrc", hud).textContent = src;
}
// "12 minutes", "1h 4m", "a few seconds"
const soonerText = (ms) => (ms < MIN ? "a few seconds" : ms < HOUR ? `${Math.round(ms / MIN)} minute${Math.round(ms / MIN) === 1 ? "" : "s"}` : fmtDur(ms));
function tickFlockMap(m, card, cv) {
  const g = group(S.chat), c = flockCount(m), end = Math.max(...m.flock.map((x) => x.deliverAt));
  const frac = Math.min(1, Math.max(0, (now() - m.sentAt) / Math.max(1, end - m.sentAt)));
  const rows = [...m.flock].sort((a, b) => a.deliverAt - b.deliverAt).map((x) => {
    const p = member(g, x.to), state = x.recalled ? `<span class="homing">${I.homing} Called back</span>` : x.lost ? `<span class="lostp">${I.skull} Lost</span>` : x.flying ? `<span data-eta="${esc(x.deliverAt)}">${fmtDur(x.deliverAt - now())}</span>` : "Landed";
    return `<span class="frow${x.flying ? " flying" : ""}">${avatar(p || { name: "?" }, "xs")}<span class="one">${esc(first(p?.name || "Someone"))}${x.route ? "" : ` <span class="hid">· not on map</span>`}</span><b>${state}</b></span>`;
  }).join("");
  const { share, cheer, look } = cardShell(card); share.hidden = true; look.hidden = true; cheerState(cheer, m);
  const html = `<span class="big">${pgm(m)}<span>${c.next ? `${c.landed} of ${c.n} landed` : c.lost === c.n ? "All lost" : `Landed for ${c.landed} of ${c.n}`}</span></span>
    ${c.next ? `<span class="speed">Next lands in ${fmtDur(c.next - now())}</span>` : ""}${birdLine(m)}
    <span class="prog k-${kindOf(m)}"><i>${I.bird}</i></span><span class="frows">${rows}</span>`;
  // (drawn again only when what it says changes, not every second: a list you'd scrolled stays put, and the card
  // springs to a new size)
  const mcb = $(".mcb", card);
  if (mcb._html !== html) {
    const fill = () => { const top = $(".frows", card)?.scrollTop || 0; mcb.innerHTML = html; mcb._html = html; const fr = $(".frows", card); if (fr && top) fr.scrollTop = top; };
    mcb._html ? cardMorph(card, fill) : fill();
  }
  $(".prog i", card).style.width = (frac * 100).toFixed(2) + "%";
  if (routesOf(m).length) { mapTick(cv, m, card.offsetHeight + 14); smoothMap({ ...m, lost: true }); }
}
// The once-a-second tick is plenty for a slow pigeon, but taking off, landing or a fast short hop would judder: then
// the pigeon moves on over the map as drawn every frame, and the whole map is drawn again twice a second (so the line
// flown keeps up). Otherwise just the wings flap (and the wind blows), and a pigeon just landed gets its ring.
let mapAnim = 0, mapAnimAt = 0;
function smoothMap(m) {
  if (mapAnim || STILL.matches) return;
  const f = flightAt(m), moving = !m.lost && f.phase !== "landed" && !(f.phase === "cruise" && m.deliverAt - m.sentAt > HOUR);
  mapAnim = requestAnimationFrame(function step(ts) {
    mapAnim = 0;
    if (S.sheet?.type !== "map" || document.hidden) return;
    const cv = $(".map", $layer);
    if (!cv) return;
    // (its first picture still to come, or the map moving or just moved: the picture as it was, moved and scaled to fit, till it's drawn again)
    if (!cv._base || mapMoving() || cv._dirty) { if (cv._base && cv._ffTs !== ts) fastFrame(cv); mapAnim = requestAnimationFrame(step); return; }
    if (moving) {
      const ok = placeBirds(cv, cv._m);
      if ((!ok || ts - (cv._fullAt || 0) > 500) && ts - mapAnimAt >= 30) { mapAnimAt = ts; return tickMap(500); }     // (tickMap calls back here)
      drawBirds(cv, ts); mapAnim = requestAnimationFrame(step); return;
    }
    if (ts - mapAnimAt < 30) { mapAnim = requestAnimationFrame(step); return; }
    mapAnimAt = ts;
    const landing = cv._birds?.some((b) => b.phase === "landed" && now() - b.r.deliverAt < 1000);
    if (!cv._birds?.some((b) => b.phase !== "landed" && b.phase !== "lost") && !(windOn() && S.windGrid) && !landing) return;
    placeBirds(cv, cv._m); drawBirds(cv, ts);
    mapAnim = requestAnimationFrame(step);
  });
}
// The taps that are later.js's: its sheets' own buttons, and a few seldom made anywhere else (Sign Out of another
// phone, Block, Leave the group, a postmark's story…). app.js's onClick1 hands it every act it doesn't have itself.
async function sheetClick(e, t, id, inPop) {
  switch (t.dataset.act) {
    // (the engine's sheet with no friends yet: Chats' own Friends, in the page's place, to add one)
    case "enginefriends": {
      const sh = S.sheet; if (!ENGINE || sh?.type !== "send" || !sh.engine) return;
      sh.engine.done?.({ ok: false, why: "friends" }); S.sheet = null; renderSheet();
      try { parent.location.assign("/chats/#requests"); } catch (_) {}
      return;
    }
    case "lockpick": { const lp = lockPrefs(); if (lp) setLockPrefs({ ...lp, after: Number(id) || 0 }); render(); return renderSheet(); }
    case "loftback": S.sheet = { type: "friendinfo", id: S.sheet?.id }; return renderSheet();
    case "buyitem": {
      const it = S.sheet?.data?.items.find((x) => x.id === id); if (!it) return;
      try { const r = await api("feathers-buy", { method: "POST", body: { item: id } }); S.sheet.data = r; S.feathers = r.feathers; haptic("success"); renderSheet(); render();
        toast(`${it.emoji} The ${esc(it.name.toLowerCase())} is yours.`, S.birds.length ? "Put It On" : null, S.birds.length ? () => wearItem(id, $(`[data-act=wearitem][data-id="${id}"]`, $layer) || $layer) : null); }
      catch (err) { toast(esc(err.message)); }
      return;
    }
    case "wearitem": return wearItem(id, t);
    case "wearon": { const [item, bird] = String(id).split("|"); closePop(); return putOn(bird, item === "none" ? null : item); }
    case "wearpick": {
      const w = await walletData(); if (!w) return;
      const b = S.birds.find((x) => x.id === id), owned = w.items.filter((x) => x.owned);
      if (!owned.length) { S.sheet = { type: "feathers", data: w, back: id }; renderSheet(); return toast("Buy something in the shop first."); }
      return openMenu(t, [...owned.map((x) => ({ label: `${x.emoji} ${x.name}`, sub: x.on && x.on.id !== id ? `On ${x.on.name}` : x.on?.id === id ? "Wearing" : "", act: "wearon", id: `${x.id}|${id}` })),
        ...(b?.wear ? [{ label: "Take It Off", act: "wearon", id: `none|${id}`, destructive: true }] : [])]);
    }
    case "birdnew": S.sheet = { type: "birdname" }; return renderSheet();
    case "birdrename": S.sheet = { type: "birdname", id }; return renderSheet();
    case "birdback": S.sheet = S.sheet?.id ? { type: "bird", id: S.sheet.id } : { type: "birds" }; return renderSheet();
    case "birdretire": { const b = S.birds.find((x) => x.id === id); return b && openMenu(t, [{ label: `Retire ${b.name}`, icon: I.bird, act: "birdretired", id }]); }
    case "birdretired": {
      const b = S.birds.find((x) => x.id === id); if (!b) return;
      try {
        const r = await api("bird-retire", { method: "POST", body: { id } });
        S.birds = r.birds; S.hall = r.hall; haptic("success"); toast(`${esc(b.name)} retires a Legend.`);
        S.sheet = { type: "bird", id }; renderSheet(); render();
      } catch (err) { toast(esc(err.message)); }
      return;
    }
    case "birdset": S.flyTap = t; S.birdPick = id; renderCompose(); if (S.sheet?.type === "flysheet") renderSheet(); return;
    case "lookcam": return look.on && lookCamera(!(look.stream || look.camPending));
    case "lookhere": return look.on && lookHere(look.watch == null);
    case "lookback": S.sheet = { type: "map", id: S.sheet?.id }; return renderSheet();
    case "cheer": {
      const chat = S.chat, m = (S.msgs.get(chat) || []).find((x) => x.id === id); if (!m || !cheerable(m).can) return;
      if (t.classList.contains("cheerbtn")) t.disabled = true;
      try {
        const r = await api(group(chat) ? "group-cheer" : "cheer", { method: "POST", body: { id } });
        haptic("success"); cheerFx = { id, at: performance.now() };
        toast(`A little tailwind: it lands ${esc(soonerText(r.cut))} sooner.`);
        await loadChat(chat); if (S.chat === chat) { render(); tickMap(); }
      } catch (err) { toast(esc(err.message)); if (t.classList.contains("cheerbtn")) { t.dataset.k = ""; tickMap(); } }
      return;
    }
    case "sharefmt": {
      const s = S.sheet; if (s?.type !== "shareflight") return;
      s.fmt = id; $layer.querySelectorAll(".shopt").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.id === id)));
      const go = $("[data-act=shareimg]", $layer); if (go) go.disabled = !s.urls[id];
      return;
    }
    case "sharename": {
      const s = S.sheet; if (s?.type !== "shareflight") return;
      s.name = !s.name; try { localStorage.setItem("inflight-share-name", s.name ? "1" : "0"); } catch (_) {}
      t.setAttribute("aria-checked", String(s.name)); $(".switch", t)?.classList.toggle("on", s.name);
      return shareRender(s);
    }
    case "shareimg": return shareImage();
    case "shareback": { const s = S.sheet; S.sheet = s?.id ? { type: "map", id: s.id } : null; return renderSheet(); }
    case "gpick": {
      const s = S.sheet; if (!s?.pick) return;
      s.name = $("#f-gname", $layer)?.value; s.pick.has(id) ? s.pick.delete(id) : s.pick.add(id); return renderSheet();
    }
    case "groupleaveask": {
      const g = group(id); if (!g) return;
      return openActions({ title: `Leave ${g.name}?`, message: "You’ll stop getting its pigeons, and won’t see anything sent after you leave.", actions: [{ label: "Leave Group", act: "groupleave", id, destructive: true }] });
    }
    case "groupleave":
      try { await api("group-leave", { method: "POST", body: { id } }); S.sheet = null; renderSheet(); await sync(); go("messages"); toast("You left the group."); }
      catch (err) { toast(esc(err.message)); }
      return;
    case "flightlogback": S.sheet = { type: "flightlog", data: S.sheet?.data || null }; renderSheet(); if (!S.sheet.data) openFlightLog(); return;
    case "ppturn": { const book = $(".ppbook", $layer); if (book) { haptic("tick"); book.scrollBy({ left: +id * book.clientWidth, behavior: STILL.matches ? "auto" : "smooth" }); } return; }
    case "pmarkinfo": {
      const [mid, pid] = String(id).split(":"), m = (S.msgs.get(S.chat) || []).find((x) => x.id === mid), pm = m?.postmarks?.find((x) => x.id === pid); if (!pm) return;
      haptic("tick");
      const mine = m.from === S.me.id, who = mine ? "Your pigeon" : `${esc(first((group(S.chat) ? member(group(S.chat), m.from) : friend(S.chat))?.name || "Their"))}’s pigeon`;
      return toast(`${who} flew past ${esc(pm.name)} on ${esc(fmtDate(pm.at))}.`, mine ? "Postmarks" : null, mine ? () => openFlightLog() : null);
    }
    case "pmarkall": {
      const x = S.sheet?.data?.postmarks?.marks.find((p) => p.id === id); if (!x) return;
      haptic("tick");
      return toast(`${esc(x.name[0].toUpperCase() + x.name.slice(1))}: first flown past ${esc(fmtDate(x.at))}${x.n > 1 ? `, and ${x.n - 1} flight${x.n === 2 ? "" : "s"} since` : ""}.`);
    }
    case "stampinfo": {
      const p = S.sheet?.data?.passport?.places.find((x) => x.name === id); if (!p) return;
      t.classList?.add("pphit"); setTimeout(() => t.classList?.remove("pphit"), 450);
      haptic("tick");
      return toast(`${esc(p.name[0].toUpperCase() + p.name.slice(1))}: first flown over ${esc(fmtDate(p.at))}${p.n > 1 ? `, and ${p.n - 1} flight${p.n === 2 ? "" : "s"} since` : ""}.`);
    }
    case "gifs": S.sheet = { type: "gifs", q: "", list: [], next: 0, busy: false }; renderSheet(); return loadGifs();
    case "gifmore": return loadGifs(true);
    case "gifpick": return pickGif(id, t);
    case "gmute": {
      const g = group(id); if (!g) return;
      const on = !g.muted; g.muted = on; renderSheet();            // the switch moves straight away
      try { await api("group-mute", { method: "POST", body: { id, muted: on } }); }
      catch (err) { g.muted = !on; renderSheet(); toast(esc(err.message)); }
      return;
    }
    case "safetylist": S.sheet = { type: "safetylist" }; return renderSheet();
    case "securitysheet": {
      S.sheet = { type: "security" }; renderSheet();
      // how many places you're signed in, for its row (quietly: the row just has no number if this fails)
      // (put straight into its row, not a redraw: that would replace the sheet under your finger)
      api("sessions").then(({ sessions }) => {
        S.sessN = sessions.length;
        const row = S.sheet?.type === "security" && $('.sheet [data-act=sessionssheet]', $layer); if (!row) return;
        const v = $(".val", row) || row.insertBefore(Object.assign(document.createElement("span"), { className: "val" }), $(".chev", row));
        v.textContent = S.sessN;
      }).catch(() => { S.sessN = null; const v = S.sheet?.type === "security" && $('.sheet [data-act=sessionssheet] .val', $layer); if (v) v.remove(); });
      return;
    }
    case "encryptionsheet": S.sheet = { type: "encryption" }; return renderSheet();
    case "passkeys": S.sheet = { type: "passkeys" }; return renderSheet();
    case "skyopen": S.sheet = null; renderSheet(); return go("chat", id);
    // Send to a Friend, a card's "How's yours?", and plans made together
    case "sendpick": return sendPick(id);
    case "sendwhen": { const s = S.sheet; if (s?.type !== "send" || s.busy || s.plan || !(pigeonsOn() ? ["now", "asap", "before", "morning"] : ["now", "morning"]).includes(id)) return; s.when = id; return renderSheet(); }
    case "sendask": { const s = S.sheet; if (s?.type !== "send" || s.busy || s.plan) return; s.ask = !s.ask; return renderSheet(); }
    case "sendplan": return sendPlan();
    case "planpick": { const s = S.sheet; if (s?.type !== "send" || !s.together?.windows) return; s.win = Math.max(0, Math.min(s.together.windows.length - 1, Number(id) || 0)); return renderSheet(); }
    case "sendgo": return sendGo();
    case "sendchat": return sendChat();
    case "askshow": return openAskBack(id);
    case "asksend": return askSend();
    case "askno": return askNo();
    case "planans": return planAnswer(id, t.dataset.a);
    case "planlater": return planLater(id, Number(t.dataset.t));
    case "reauthpk": {
      try { await busyBtn(t, "Waiting for your passkey…", reauthPasskey); const s = S.sheet; S.sheet = s.back || null; renderSheet(); haptic("success"); s.resolve(true); }
      catch (err) { if (err?.name !== "NotAllowedError") toast(esc(err.message || "That passkey didn’t work.")); }
      return;
    }
    case "recallask": {
      const g = group(S.chat), n = S.me.swift || 0, w = (S.msgs.get(S.chat) || []).find((x) => x.id === id);
      if (w?.waiting) return openActions({ title: "Cancel this pigeon?",
        message: `It hasn’t taken off yet, so ${first(friend(S.chat)?.name || "they")} will never know. What it carries is deleted${kindOf(w) === "standard" ? "" : `, and the ${KIND[kindOf(w)].name.toLowerCase()} pigeon goes back in your loft`}.`,
        actions: [{ label: "Cancel Pigeon", act: "recallgo", id, destructive: true }] });
      return openActions({ title: g ? "Call your pigeons back?" : "Call your pigeon back?",
        message: `A swift pigeon flies after ${g ? "them" : "it"} (you have ${n}). ${g ? "Any that haven’t landed turn for home, and whoever already has it keeps it." : "It won’t arrive, and what it carries is deleted."}`,
        actions: [{ label: "Call It Back", act: "recallgo", id, destructive: true }] });
    }
    case "recallgo":
      haptic("heavy");
      try {
        const g = group(S.chat), r = await api(g ? "group-recall" : "recall", { method: "POST", body: { id } });
        const list = S.msgs.get(S.chat) || [], i = list.findIndex((x) => x.id === id);
        if (r.cancelled) {
          if (i >= 0) list.splice(i, 1);
          S.plain.delete(id); S.photos.delete(id); S.me = r.me;
          render(); renderCompose(); toast("Cancelled. It never left."); return sync();
        }
        if (i >= 0) list[i] = r.message;
        if (r.message.recalled && !(r.message.flock || []).some((x) => !x.flying && !x.lost)) S.plain.delete(id);
        if (r.me) S.me = r.me;
        if (S.sheet?.type === "map") S.sheet = null;
        render(); toast(g ? "Your pigeons are flying home." : "Your pigeon is flying home."); await sync();
      } catch (err) { toast(esc(err.message)); }
      return;
    case "mapzoom": {
      const cv = $(".map", $layer); if (!cv || !cv._m) return;
      if (id === "fit") return fitMap(cv);
      return zoomMapBy(cv, id === "in" ? 2 : 0.5, cv.clientWidth / 2, mapFrame(cv, cv._m, cv._cardH).sy0);
    }
    case "viewonce": return viewOnce(id);
    case "maplayers": {
      const on = !windOn(); try { localStorage.setItem("inflight-windmap", on ? "1" : "0"); } catch (_) {}
      t.setAttribute("aria-pressed", String(on));
      const cv = $(".map", $layer); if (cv) { cv._parts = null; cv._trailKey = null; }
      redrawMap(); return;
    }
    case "mapfold": return mapFold(!mapOpen());
    case "mapglobe": {
      // (the picture it was shrinks into the globe, or grows away into the flat map, as it fades)
      const cv = $(".map", $layer); if (!cv?._m) return;
      const toGlobe = !globeOn(cv._m); mapFadeFrom(cv, toGlobe ? "scale(.55)" : "scale(1.8)"); cv._wasFast = false;
      S.sheet.globe = toGlobe; S.sheet.view = S.sheet.gview = null; cv._spin = 0; return redrawMap();
    }
    case "safety": {
      const f = personById(id); if (!f) return;
      S.sheet = { type: "safety", id, from: t.dataset.from || (S.sheet?.type === "friendinfo" ? "friendinfo" : S.sheet?.type === "groupinfo" ? "groupinfo" : null), backId: S.sheet?.id, digits: await E2E.safety(S.me.id, S.myPub || S.me.pub, f.id, f.pub) };
      return renderSheet();
    }
    case "vanishask": {
      const g = group(id), who = g ? "everyone in the group" : first(friend(id)?.name || "your friend");
      return openActions({ title: "Disappearing Messages", message: `New messages disappear this long after they’re read ${orLand()}, for you and ${who}.${pigeonsOn() ? " The flight stays in your Flight Log." : ""}`,
        actions: [[DAY, "1 Day"], [7 * DAY, "7 Days"], [30 * DAY, "30 Days"], [0, "Off"]].map(([ms, label]) => ({ label, act: "vanishset", id: `${id}|${ms}` })) });
    }
    case "vanishset": {
      const [cid, ms] = id.split("|"), g = group(cid);
      try {
        await api(g ? "group-vanish" : "vanish", { method: "POST", body: g ? { id: cid, ms: Number(ms) } : { with: cid, ms: Number(ms) } });
        S.live.fullAt.delete(cid); await sync(); if (S.chat === cid) await loadChat(cid).catch(() => {});
        toast(Number(ms) ? `New messages disappear ${vanishSay(Number(ms))} after they’re read ${orLand()}.` : "Disappearing messages are off.");
        if (S.sheet) renderSheet(); render();
      } catch (err) { toast(esc(err.message)); }
      return;
    }
    case "scanany": {
      // (each friend's safety number, so the one scanned is known whoever's it is)
      const codes = new Map(await Promise.all(S.friends.map(async (f) => { const digits = await E2E.safety(S.me.id, S.myPub || S.me.pub, f.id, f.pub); return [safetyCode(digits), { f, digits }]; })));
      const back = S.sheet?.type === "scan" ? S.sheet.back : S.sheet;
      S.sheet = { type: "scan", any: true, codes, back }; return renderSheet();
    }
    case "scansafe": { const back = S.sheet?.type === "scan" ? S.sheet.back : S.sheet; S.sheet = { type: "scan", id, back }; return renderSheet(); }
    case "scanback": { stopScan(); S.sheet = S.sheet?.back ? { ...S.sheet.back } : null; return renderSheet(); }
    case "verifyok": { const p = personById(id); if (!p) return; setVerified(p, true); haptic("success"); toast(`${esc(first(p.name))} is verified.`); if (S.sheet?.type === "safety") S.sheet.won = performance.now(); return renderSheet(); }
    case "safecopy": { const d = (S.sheet?.digits || []).join(" "); try { await navigator.clipboard.writeText(d); toast("Safety number copied."); } catch (_) { toast(esc(d)); } return; }
    case "copyfp": try { await navigator.clipboard.writeText(S.fp); toast("Key copied."); } catch (_) { toast(esc(S.fp)); } return;
    case "unverify": { const p = personById(id); if (!p) return; setVerified(p, false); toast("Verification cleared."); return renderSheet(); }
    case "trustsafe": { await trustNewKey(id); haptic("success"); toast("Trusted. Messages can go to them again."); S.sheet = null; return renderSheet(); }
    case "fromapp": return fromApp(id);
    case "whenlater": S.laterOpen = S.laterOpen === id ? null : id; return render();
    case "whenans": return whenAnswer(id, t.dataset.a, t.dataset.t != null ? Number(t.dataset.t) : NaN);
    case "ttkind": { const s = S.sheet; if (s?.type !== "timetalk" || s.busy || !["call", "meet"].includes(id)) return; s.kind = id; return renderSheet(); }
    case "ttmins": { const s = S.sheet; if (s?.type !== "timetalk" || s.busy || !WHEN_LENGTHS.includes(Number(id))) return; s.mins = Number(id); return renderSheet(); }
    case "ttopt": { const s = S.sheet, o = Number(id); if (s?.type !== "timetalk" || s.busy || !Number.isFinite(o)) return; s.opts = s.opts.includes(o) ? s.opts.filter((x) => x !== o) : [...s.opts, o].slice(-3); return renderSheet(); }
    case "ttsend": return timeTalkSend();
    case "decline": {
      const p = S.incoming.find((x) => x.id === id);
      return openActions({ message: `Decline ${p ? "@" + p.handle + "’s" : "this"} request? They aren’t told, and can’t ask again for 30 days.`,
        actions: [{ label: "Decline", act: "declinego", id }, { label: "Decline and Block", act: "blockgo", id, destructive: true }] });
    }
    case "accept": case "declinego":
      await api("friends-respond", { method: "POST", body: { id, accept: t.dataset.act === "accept" } }).catch((err) => toast(esc(err.message)));
      await sync(); renderSheet(); if (S.sheet?.type === "addfriend") addLookup(); return;
    case "blockask": {
      const p = personById(id) || S.incoming.find((x) => x.id === id); if (!p) return;
      const shared = S.groups.some((g) => g.members?.some((m) => m.id === id));
      return openActions({ title: `Block @${p.handle}?`, message: `They won’t be able to send you pigeons or friend requests, or see your picture or where you are. They aren’t told.${shared ? " You’ll both still be in the groups you share." : ""}`,
        actions: [{ label: "Block", act: "blockgo", id, destructive: true }] });
    }
    case "blockgo": {
      const p = personById(id) || S.incoming.find((x) => x.id === id);
      try { await api("block", { method: "POST", body: { id } }); haptic("success"); toast(`Blocked${p ? " @" + esc(p.handle) : ""}.`); }
      catch (err) { return toast(esc(err.message)); }
      if (S.chat === id) { S.sheet = null; await sync(); renderSheet(); return go("messages"); }
      if (S.sheet?.type === "friendinfo") S.sheet = null;
      await sync(); renderSheet(); if (S.sheet?.type === "addfriend") addLookup(); return;
    }
    case "unblock": {
      const p = S.blocked.find((x) => x.id === id);
      await api("block", { method: "DELETE", body: { id } }).then(() => toast(`Unblocked${p ? " @" + esc(p.handle) : ""}.`), (err) => toast(esc(err.message)));
      await sync(); renderSheet(); if (S.sheet?.type === "addfriend") addLookup(); return;
    }
    case "blockedsheet": S.sheet = { type: "blocked" }; return renderSheet();
    case "sessionssheet": S.sheet = { type: "sessions" }; renderSheet(); return loadSessions();
    case "sessend": {
      const x = S.sheet?.list?.find((y) => y.id === id);
      return openActions({ message: `Sign out ${x ? x.label : "this phone"}${x?.place ? ` near ${x.place}` : ""}? It will need your password or a passkey to sign in again.`, actions: [{ label: "Sign Out", act: "sessendgo", id, destructive: true }] });
    }
    case "sessendgo":
      try { await api("sessions-end", { method: "POST", body: { id } }); haptic("success"); toast("Signed out."); } catch (err) { toast(esc(err.message)); }
      return loadSessions();
    case "sessothers": return openActions({ message: "Sign out of Chat everywhere except this phone? They’ll need your password or a passkey to sign in again.", actions: [{ label: "Sign Out Other Phones", act: "sessothersgo", destructive: true }] });
    case "sessothersgo":
      try { await api("sessions-end", { method: "POST", body: { others: true } }); haptic("success"); toast("Your other phones were signed out."); } catch (err) { toast(esc(err.message)); }
      return loadSessions();
    case "confirmsend":
      try { const r = await api("confirm-resend", { method: "POST" }); toast(r.already ? "Your email is already confirmed." : `Sent. Tap the link in the email to ${esc(S.me.email)}.`); if (r.already) { await sync(); renderSheet(); } }
      catch (err) { toast(esc(err.message)); }
      return;
    case "cancelreq":
      await api("friends", { method: "DELETE", body: { id } }).catch((err) => toast(esc(err.message)));
      await sync(); renderSheet(); if (S.sheet?.type === "addfriend") addLookup(); return;
    case "addgo": return addGo(id, t);
    case "addchat": S.sheet = null; renderSheet(); return go("chat", id);
    case "copylink":
      try { await navigator.clipboard.writeText(myLink()); toast("Link copied."); } catch (_) { toast(esc(myLink())); }
      return;
    case "unfriendask": {
      const f = friend(id); if (!f) return;
      return openActions({ title: `Remove ${first(f.name)}?`, message: "You’ll stop seeing each other’s messages. You can add them again later.", actions: [{ label: "Remove Friend", act: "unfriend", id, destructive: true }] });
    }
    case "unfriend":
      await api("friends", { method: "DELETE", body: { id } }).catch((err) => toast(esc(err.message)));
      S.sheet = null; await sync(); return go("messages");
    case "peek": { const inp = t.parentElement.querySelector("input"); const show = inp.type === "password"; inp.type = show ? "text" : "password"; t.setAttribute("aria-label", show ? "Hide password" : "Show password"); return; }
    case "pkdel":
      try { await withFresh(() => api("passkey", { method: "DELETE", body: { id } })); toast("Passkey removed. You can also delete it from your phone’s Passwords app."); }
      catch (err) { if (!err.cancelled) toast(esc(err.message)); }
      await sync(); return renderSheet();
    case "creditsheet": S.sheet = { type: "credits" }; return renderSheet();
    case "movego": if (!standalone()) { e?.preventDefault?.(); location.href = `${NEW_HOME}/${S.view === "welcome" ? location.hash : ""}`; } return;
    case "movecopy": try { await navigator.clipboard.writeText(NEW_HOME + "/"); toast("Address copied."); } catch (_) { toast(esc(NEW_HOME.replace(/^https?:\/\//, ""))); } return;
    case "appearancesheet": S.sheet = { type: "appearance" }; return renderSheet();
    case "theme": return themeFade(() => { setTheme(id); render(); renderSheet(); });
    case "routepreview": {
      // the flight it would be, drawn on the map as if it were in the air
      const p = previewFrom(routeStyle()); if (!p) return;
      S.preview = p; S.sheet = { type: "map", id: "preview" }; return renderSheet();
    }
    case "routeset": {
      if (!ROUTES.some((r) => r[0] === id) || id === routeStyle()) return;
      try { localStorage.setItem("inflight-route", id); } catch (_) {}
      haptic("tick");
      // on The Way: that way instead, the map re-fitted to it and the card springing to its new size
      if (S.sheet?.type === "map" && S.sheet.id === "preview") {
        const p = previewFrom(id), card = $(".mapcard", $layer); if (!p || !card) return;
        S.preview = p; S.sheet.view = S.sheet.gview = null;
        return fcMorph(card, () => tickMap(), false);         // (its rows change in place, rather than all playing in again)
      }
      return renderSheet();
    }
    case "haptics": { const on = !hapticsOn(); try { localStorage.setItem("inflight-haptics", on ? "1" : "0"); } catch (_) {} if (on) haptic("success"); render(); return renderSheet(); }
    case "skin": return setSkin(id);
    case "viapick": S.via = { chat: S.sheet?.chat || S.chat, id }; S.sched = null; S.sheet = null; renderSheet(); return renderCompose();
    case "unvia": S.via = null; S.sheet = null; renderSheet(); return renderCompose();
    case "schedpick": S.sched = { chat: S.sheet?.chat || S.chat, at: +id }; S.via = null; S.sheet = null; renderSheet(); return renderCompose();
    // chosen right on How It Flies (it stays open)
    case "schednow": S.flyTap = t; S.sched = null; haptic("tick"); renderSheet(); return renderCompose();
    case "schedset": S.flyTap = t; S.sched = { chat: S.chat, at: +id }; S.via = null; haptic("tick"); renderSheet(); return renderCompose();
    case "viaset": S.flyTap = t; S.via = { chat: S.chat, id }; S.sched = null; haptic("tick"); renderSheet(); return renderCompose();
    case "viaclear": S.flyTap = t; S.via = null; haptic("tick"); renderSheet(); return renderCompose();
    case "shipset": S.flyTap = t; S.noShip = id === "fly" ? S.chat : null; haptic("tick"); renderSheet(); return renderCompose();
    case "unschedule": S.sched = null; S.sheet = null; renderSheet(); return renderCompose();
    case "autoloc": return setAutoLocation(!S.me.autoLocation, t);
    case "moonpick": haptic("tick"); S.sheet = { type: "moonpick", body: id === "mars" ? "mars" : "moon" }; return renderSheet();
    case "moonside": if (S.sheet?.type === "moonpick") { S.sheet.side = id; renderSheet(); } return;
    case "moonsite": { const x = BODIES[S.sheet?.body || "moon"].sites.find((y) => y[0] === id); if (x && S.sheet?.type === "moonpick") { S.sheet.mark = { lat: x[1], lon: x[2] }; renderSheet(); } return; }
    case "moonlive": S.moonReplay = null; return tickMap();
    case "moonwho": { const [mid, to] = id.split("|"); S.moonWho = { ...(S.moonWho || {}), [mid]: to }; S.moonReplay = null; return tickMap(); }
    case "moonland": {
      const body = S.sheet?.body || "moon", mk = S.sheet?.mark || (worldOf(S.me) === body ? S.me.moon : null); if (!mk) return;
      return busyBtn(t, "Landing…", async () => {
        try { const r = await api("me", { method: "PATCH", body: { moon: { lat: mk.lat, lon: mk.lon, body } } }); S.me = r.me; stopLocWatch(); haptic("success"); toast(`You’re on ${BODIES[body].name}: ${esc(r.me.place.replace(/, (the Moon|Mars)$/, ""))}.`); S.sheet = { type: "profile" }; render(); renderSheet(); return true; }
        catch (err) { toast(esc(err.message)); return false; }
      });
    }
    case "setway": {
      const s = S.sheet; if (s?.type !== "way" || !["instant", "pigeon"].includes(id)) return;
      const g = group(s.id), c = g || friend(s.id); if (!c) return;
      if (wayOf(c) === id) { S.sheet = null; return renderSheet(); }
      try {
        const r = await api("way", { method: "POST", body: g ? { group: c.id, way: id } : { with: c.id, way: id } });
        c.way = r.way === "instant" || r.way === "pigeon" ? r.way : id; haptic("success");
        if (S.sheet === s) { S.sheet = null; renderSheet(); }
        S.next.set(c.id, c.way === "pigeon" ? "pigeon" : "now");
        S.live.fullAt.delete(c.id);
        if (S.chat === c.id) await loadChat(c.id).catch(() => {});
        render();
      } catch (err) { toast(esc(err.message)); }
      return;
    }
    case "cancelwait": {
      const chat = S.chat, g = group(chat);
      try {
        const r = await api(g ? "group-recall" : "recall", { method: "POST", body: { id } });
        const list = S.msgs.get(chat) || [], i = list.findIndex((x) => x.id === id);
        if (r.cancelled) { if (i >= 0) list.splice(i, 1); S.plain.delete(id); S.photos.delete(id); }
        else if (r.message && i >= 0) list[i] = r.message;
        if (r.me) S.me = r.me;
        S.live.fullAt.delete(chat);
        haptic("heavy"); render(); renderCompose(); toast("Cancelled. It won’t be sent."); return sync();
      } catch (err) { toast(esc(err.message)); }
      return;
    }
    case "privacy": {
      const on = S.me[id] === false;                                   // switching it back on
      S.me = { ...S.me, [id]: on }; renderSheet();
      try { S.me = (await api("me", { method: "PATCH", body: { [id]: on } })).me; await sync(); }
      catch (err) { S.me = { ...S.me, [id]: !on }; renderSheet(); toast(esc(err.message)); }
      return;
    }
    case "notifysheet": S.sheet = { type: "notifications" }; return renderSheet();
    case "npref": return setNotify({ [id]: !(id === "messages" ? S.me.notify?.messages !== false : !!S.me.notify?.[id]) });
    case "pushtest":
      try { const r = await api("push-test", { method: "POST" }); toast(r.sent ? "Test sent. It should arrive in a moment." : "Couldn’t reach this phone. Turn notifications off and on again."); }
      catch (err) { toast(esc(err.message)); }
      return;
    case "emailtoggle": return setEmailNotify(!S.me.notifyEmail);
    case "accountedit": case "accountopen": return openAccount(t.dataset.act === "accountedit" ? "profile" : null);
  }
}
// how long ago, as you'd say it: "just now", "12 min ago", "2 hours ago", "3 days ago"
const agoText = (at) => {
  const m = Math.round((now() - at) / MIN), h = Math.round(m / 60), d = Math.round(m / 1440);
  return m < 2 ? "just now" : m < 60 ? `${m} min ago` : h < 24 ? `${h} hour${h > 1 ? "s" : ""} ago` : `${d} day${d > 1 ? "s" : ""} ago`;
};
// Every form but the message box (app.js's submitForm sends that one): the sheets'
async function sheetSubmit(e, form, kind) {
  const btn = form.querySelector(".btn") || $(`[data-act=submit][data-id="${esc(form.id)}"]`, $layer);
  if (kind === "schedule") {
    const v = $("#f-landat", $layer)?.value, at = v ? +new Date(v) : NaN;
    if (!Number.isFinite(at) || at <= now()) return showErr("Pick a time that’s still to come.", "landat");
    if (at > now() + 30 * DAY) return showErr("Pick a time in the next 30 days.", "landat");
    S.sched = { chat: S.sheet.chat, at }; S.via = null; S.sheet = null; renderSheet(); return renderCompose();
  }
  if (kind === "vianote") {
    const s = S.sheet, text = String($("#f-vianote", $layer)?.value || "").trim();
    const m = (S.msgs.get(s.chat) || []).find((x) => x.id === s.id), to = m && friend(m.finalTo);
    if (!text) return showErr("Write a line first.", "vianote");
    if (!m || !to) return showErr("You’re not friends with who it’s going to any more.");
    try {
      await busyBtn(btn, "…", async () => {
        const ct = await E2E.seal(await pairFor(trustedPub(to)), { id: m.id + ":via", from: S.me.id, to: to.id, type: "note" }, { t: text });
        await api("stopover-note", { method: "POST", body: { id: m.id, ct } });
      });
      S.notes.set(m.id, text); m.mine = "sent"; S.sheet = null; renderSheet(); render(); toast(`Added. ${esc(first(to.name))} will see it when it lands.`);
    } catch (err) { showErr(err.message); }
    return;
  }
  if (kind === "birdname") {
    const s = S.sheet, name = String($("#f-bname", $layer)?.value || "").trim();
    if (!name) return showErr("Give your pigeon a name.", "bname");
    try {
      const r = await busyBtn(btn, "…", () => api(s.id ? "bird-name" : "birds", { method: "POST", body: s.id ? { id: s.id, name } : { name } }));
      S.birds = r.birds; S.hall = r.hall; haptic("success");
      if (!s.id) toast(`${esc(r.birds.at(-1)?.name || name)} joins your pigeons.`);
      S.sheet = s.id ? { type: "bird", id: s.id } : { type: "birds" }; renderSheet(); render();
    } catch (err) { showErr(err.message); }
    return;
  }
  if (kind === "grouprename") {
    const s = S.sheet;
    try { await busyBtn(btn, "…", () => api("group-name", { method: "POST", body: { id: s.id, name: String($("#f-gname", $layer)?.value || "") } })); await sync(); S.sheet = { type: "groupinfo", id: s.id }; renderSheet(); }
    catch (err) { showErr(err.message, err.field); }
    return;
  }
  if (kind === "newgroup" || kind === "groupadd") {
    const s = S.sheet, name = String($("#f-gname", $layer)?.value || "").trim();
    if (kind === "newgroup" && !name) return showErr("Give the group a name.", "gname");
    try {
      const r = await busyBtn(btn, "…", () => kind === "newgroup"
        ? api("groups", { method: "POST", body: { name, members: [...s.pick] } })
        : api("group-add", { method: "POST", body: { id: s.id, members: [...s.pick] } }));
      await sync();
      if (kind === "newgroup") { S.sheet = null; renderSheet(); go("chat", r.group.id); }
      else { S.sheet = { type: "groupinfo", id: s.id }; renderSheet(); toast(`Added to ${esc(group(s.id)?.name || "the group")}.`); }
    } catch (err) { showErr(err.message); }
    return;
  }
  if (kind === "add") {
    const h = form.h.value.trim().replace(/^@/, ""); if (!h) return;
    return addGo(h, btn);
  }
  const v = Object.fromEntries(new FormData(form));
  if (kind === "reauth") {
    if (!v.password) return showErr("Enter your password.", "password");
    try {
      await busyBtn(btn, "Checking…", async () => {
        const { salt } = await api("salt", { method: "POST", body: { email: S.me.email } });
        const { proof } = await E2E.fromPassword(v.password, salt);
        await api("reauth", { method: "POST", body: { proof } });
      });
      const s = S.sheet; S.sheet = s.back || null; renderSheet(); haptic("success"); s.resolve(true);
    } catch (err) { showErr(err.message, err.field); }
  } else if (kind === "askpw") {
    try {
      const jwk = await busyBtn(btn, "Unlocking…", async () => {
        const { vault, lockKey } = await vaultWith(v.password);
        try { return (await E2E.unlock(lockKey, vault)).ecdh; } catch (_) { throw Object.assign(new Error("That password didn’t unlock your key."), { field: "password" }); }
      });
      S.secretJwk = jwk;
      const s = S.sheet; S.sheet = null; renderSheet(); s.resolve(jwk);
    } catch (err) { showErr(err.message, err.field); }
  }
}
/* ---------- GIF search ----------
   Through Chat's server (functions/_gifs.js): it asks GIPHY and fetches
   the GIFs, so GIPHY never sees who's looking. The one picked is attached like
   a GIF from the phone: sealed before it leaves. */
const gifPrev = new Map();            // id → blob URL of its little moving preview
async function loadGifs(more) {
  const s = S.sheet; if (!s || s.type !== "gifs" || s.busy || s.next == null) return;
  s.busy = true; drawGifs();
  const q = s.q;
  try {
    const d = await api(`gif-search?q=${encodeURIComponent(q)}&offset=${more ? s.next : 0}`);
    if (S.sheet !== s || s.q !== q) { s.busy = false; return; }
    s.list = more ? [...s.list, ...d.gifs.filter((g) => !s.list.some((x) => x.id === g.id))] : d.gifs; s.next = d.next; s.err = "";
  } catch (err) { s.err = err.message; }
  s.busy = false;
  if (S.sheet === s) drawGifs();
}
function drawGifs() {
  const s = S.sheet, grid = $(".gifgrid", $layer); if (!s || !grid) return;
  const tile = (g) => `<button type="button" class="giftile${s.picking === g.id ? " busy" : ""}" data-act="gifpick" data-id="${esc(g.id)}" aria-label="${esc(g.title || "GIF")}" data-ar="${(g.w / g.h).toFixed(3)}">${gifPrev.get(g.id) ? `<img src="${gifPrev.get(g.id)}" alt="">` : ""}</button>`;
  // two columns, each tile into whichever is shorter, so the grid packs like a wall of photos
  // (drawn again only when what's in it changes: not on every redraw of the app, which made its pictures flicker)
  const key = JSON.stringify([s.list.map((g) => g.id), s.picking || "", s.list.length ? "" : s.err || (s.busy ? 1 : 0)]);
  if (grid._k !== key) {
    grid._k = key;
    const cols = [[], []], hgt = [0, 0];
    for (const g of s.list) { const c = hgt[0] <= hgt[1] ? 0 : 1; cols[c].push(g); hgt[c] += g.h / g.w; }
    grid.innerHTML = s.list.length ? cols.map((c) => `<div class="gifcol">${c.map(tile).join("")}</div>`).join("")
      : `<p class="empty">${s.err ? esc(s.err) : s.busy ? "Finding GIFs…" : "No GIFs found. Try another word."}</p>`;
    grid.querySelectorAll("[data-ar]").forEach((el) => el.style.setProperty("--ar", el.dataset.ar));   // (inline style attributes are blocked)
  }
  grid.parentElement.querySelector(".gifmore")?.remove();
  if (s.list.length && s.next != null) grid.insertAdjacentHTML("afterend", `<div class="gifmore"><button type="button" class="btn gray" data-act="gifmore"${s.busy ? " disabled" : ""}>${s.busy ? "Loading…" : "More GIFs"}</button></div>`);
  // previews come through the server too, then stay as blob URLs
  for (const g of s.list) if (!gifPrev.has(g.id)) {
    gifPrev.set(g.id, "");
    api(`gif/${encodeURIComponent(g.id)}?s=p`, { raw: true }).then((r) => r.blob()).then((b) => {
      gifPrev.set(g.id, URL.createObjectURL(b));
      const el = $(`.giftile[data-id="${CSS.escape(g.id)}"]`, $layer);
      if (el && !el.querySelector("img")) el.insertAdjacentHTML("afterbegin", `<img class="in" src="${gifPrev.get(g.id)}" alt="">`);     // (fading in: styles.css)
    }).catch(() => gifPrev.delete(g.id));
  }
}
async function pickGif(id, el) {
  const s = S.sheet; if (!s || s.picking) return;
  s.picking = id; el?.classList.add("busy");
  try {
    const r = await api(`gif/${encodeURIComponent(id)}?s=f`, { raw: true });
    const blob = await r.blob();
    if (S.sheet !== s) return;
    S.sheet = null; renderSheet();
    await setAttach(blob);
  } catch (err) { s.picking = null; el?.classList.remove("busy"); toast(esc(err.message)); }
}
const THEME_NAMES = { light: "Light", dark: "Dark", auto: "Automatic" };
// Saved to the account (so every phone you sign in on matches) and kept on
// this phone too, so theme.js can draw the right colours before the app loads.
function setTheme(t) {
  if (!THEMES.includes(t)) return;
  keepTheme(t);
  if (S.me) {
    S.me.appearance = t;
    saveTheme(t, true);
  }
}
async function loadSessions() {
  try { const { sessions } = await api("sessions"); if (S.sheet?.type === "sessions") { S.sheet.list = sessions; S.sheet.err = null; renderSheet(); } }
  catch (err) { if (S.sheet?.type === "sessions") { S.sheet.err = err.message; renderSheet(); } else toast(esc(err.message)); }
}
const SEND_MAX = 12;                   // friends at one go (the server takes 120 pigeons an hour)
const APP_WORD = { weather: "Weather", fitness: "Fitness", markets: "Markets" };
// whose turn, and what can fly: as the message box has them (composeState)
const turnOf = (f) => { const ct = S.turns.get(f.id); return (ct && ct.at >= (S.raw?.now || 0) ? ct : f.turn) || {}; };
const lofts = () => ({ swift: S.me?.swift || 0, turbo: S.me?.turbo || 0, rocket: S.me?.rocket || 0 });
const pickOf = (f, landAt) => ({ id: f.id, free: !!turnOf(f).free, waiting: S.outbox.some((o) => o.to === f.id && o.kind === "standard" && !o.err), landAt: landAt ?? null });
const oneKind = (f) => { try { return pigeonsFor([pickOf(f, null)], { me: lofts(), now: now() }).get(f.id) || null; } catch (_) { return null; } };
// "A, B and C"; past three, "A, B, C and 2 More"
const andList = (a) => (a.length <= 1 ? a[0] || "" : a.length <= 3 ? `${a.slice(0, -1).join(", ")} and ${a.at(-1)}` : `${a.slice(0, 3).join(", ")} and ${a.length - 3} More`);
const spanSay = (w) => `${clockSay(w.start)}–${fmtTime(w.end)}`;
const quoteOf = (m, p) => ({ id: m.id, from: m.from, t: String(p?.t || "").replace(/\s+/g, " ").slice(0, 90) });
const canPlan = (c) => (c?.kind === "fitness" && PLAN_SPORTS.includes(c.snap?.sport)) || (c?.kind === "weather" && ["cycle", "run"].includes(c.snap?.spell?.act));
const planSport = (c) => (c.kind === "fitness" ? c.snap.sport : c.snap.spell.act === "cycle" ? "ride" : "run");
// An invite to ride (or your "later" that offers one time), as it goes: your own record of it in Fitness, pending until
// the friend answers, so their Yes on their own phone agrees it for you both, whether or not you open the chat again.
// Times, the workout and the friend's id: never words
function planAsked(id, plan, f) {
  if (typeof id !== "string" || !id || !f || !plan) return;
  const opts = (plan.opts || []).filter((o) => o && o.end > now()).slice(0, 3).map((o) => [o.start, o.end]);
  fitOffer(id, plan, f, "asked", { with: f.id, state: "pending", ...(opts.length ? { opts } : {}) }).catch(() => {});
}
// One letter to one friend, with everything said here and nothing taken from the message box (no stopover, named
// pigeon or landing time of its own: only what's passed in). Online only: with no signal it sends nothing.
// A reply that never came may still have reached the server (unsure, with its id): sent again, it goes with the same id,
// so the server keeps only the one ("That scroll was already sent." is then the one that went).
async function sendLetter(to, payload, { kind, landAt = null, id: again = null } = {}) {
  if (navigator.onLine === false) throw Object.assign(new Error(NO_SIGNAL), { offline: true });
  const id = again || uuid(), route = routeStyle() === "fastest" ? {} : { route: routeStyle() }, instant = kind === "instant";
  const ct = await E2E.seal(await base(to), { id, from: S.me.id, to, type: "msg" }, padPayload({ ...payload }));
  // (a message: no pigeon, no route; landAt, it's sent at that time)
  const meta = instant ? { id, to, ct, instant: true, ...(landAt ? { landAt } : {}) } : { id, to, ct, pigeon: kind, ...route, ...(landAt ? { landAt } : {}) };
  let r;
  try { r = await api("messages", { method: "POST", body: meta }); }
  catch (e) {
    if (e.offline) throw Object.assign(new Error(NO_SIGNAL), { offline: true, unsure: true, id });
    if (again && e.status === 409 && /already sent/.test(e.message || "")) { S.plain.set(id, payload); return { id, message: null }; }
    throw e;
  }
  S.plain.set(id, payload);
  // (the lofts as they are now, for the next one: the server says when it was told a time, else one fewer here)
  if (r.me) S.me = r.me; else if (PAID.includes(kind) && S.me[kind] > 0) S.me[kind]--;
  const list = S.msgs.get(to); if (list && r.message && !list.some((x) => x.id === r.message.id)) list.push(r.message);
  const f = friend(to), was = f?.streak, st = instant ? null : r.streak;
  if (f && st) { f.streak = st; if (st.n >= STREAK_MIN && (!was || !was.today || was.n < st.n)) toast(`${I.flame} ${st.n}-day streak with ${esc(first(f.name))}`); }
  return r;
}

/* ---------- the sheet: Send to a Friend ---------- */
// every letter on this phone (decrypted, one to one), for what friends have sent before (rank.js seenFrom)
function lettersHere() {
  const out = [];
  for (const [chat, list] of S.msgs) { if (!friend(chat)) continue; for (const m of list) { const p = S.plain.get(m.id); if (p && !p.bad) out.push({ from: m.from, to: m.from === S.me.id ? chat : S.me.id, payload: p }); } }
  return out;
}
// (engine: the engine's own word for how it ended, { done }, and the page it's over told; to: a friend or group chosen
// already, if they can have it; back: the page of the hub it came from, gone back to once it's sent)
function openSendSheet(card, { words = "", link = false, engine = null, to = null, back = null } = {}) {
  if (!card || !S.me) return;
  let seen = new Map(); try { seen = seenFrom(lettersHere(), S.me.id) || new Map(); } catch (_) {}
  const s = { type: "send", card, base: String(words || card.say || cardWords(card) || "").trim().slice(0, 500), words: "", edited: false, link, engine, back,
    pick: [], when: pigeonsOn() && S.me.newChats === "pigeon" && !(typeof to === "string" && group(to)) ? "asap" : "now", ask: false, plan: false, together: null, win: 0, rain: null, seen, asked: askedHere(), busy: false, progress: null, err: "", note: "" };
  // (a group asked for starts at Now, the only way a group's letter goes)
  if (typeof to === "string" && to && sendRows(s).some((r) => r.id === to && r.can)) s.pick = [to];
  S.sheet = s; renderSheet();
  nowFor([card]);
  if (card.kind === "weather") rainFor(s);
}
// rain at the friends nearest the card's place (share-rank), for the reasons and "Before the Rain"
async function rainFor(s) {
  let ids = []; try { ids = rainAsk(s.card, S.friends, 6) || []; } catch (_) {}
  if (!ids.length) return;
  try { const r = await api("share-rank", { method: "POST", body: { kind: "weather", ids } }); if (S.sheet === s) { s.rain = r.rain && typeof r.rain === "object" ? r.rain : {}; renderSheet(); } } catch (_) {}
}
// Sent as a message (at once, or with pigeons off, with their morning): pigeons off, or the chip Now
const sendInstant = (s) => !pigeonsOn() || s.when === "now";
// when a friend's letter lands, as chosen (null: as soon as it can). A timed one takes a swift pigeon or faster, so its
// flight is a swift's at most; the server re-plans it and refuses one too soon to make, so there's a margin.
// A message: null (now), or with their morning, 07:30 where they are (no flight to allow for; unknown without their zone)
function landFor(s, f) {
  if (s.plan || s.when === "asap" || s.when === "now") return null;
  if (sendInstant(s)) {
    if (s.when !== "morning" || !f.tz) return null;
    try { const at = nextLocal(f.tz, "07:30", now() + 60e3); return Number.isFinite(at) && at <= now() + 30 * DAY ? Math.round(at) : null; } catch (_) { return null; }
  }
  const t = now(), fly = flightMs(chatKm(f), mySpeed("swift"));
  let at = null;
  try {
    if (s.when === "before") { const r = s.rain?.[f.id]; if (r?.at && !r.now) { at = r.at - HOUR; if (at - fly < t + MARGIN_MS) at = null; } }
    else if (s.when === "morning") at = nextLocal(f.tz || MY_TZ, "07:30", t + fly + MARGIN_MS);
  } catch (_) { at = null; }
  return Number.isFinite(at) && at > t + fly && at <= t + 30 * DAY ? Math.round(at) : null;
}
// the pigeon each picked friend gets, in the order shown
function sendKinds(s, order) {
  const picks = order.filter((id) => s.pick.includes(id)).map(friend).filter(Boolean);
  try { return pigeonsFor(picks.map((f) => pickOf(f, landFor(s, f))), { me: lofts(), now: now() }) || new Map(); } catch (_) { return new Map(); }
}
// The friends, ranked for the card, each with its reason, its pigeon, and whether it can be picked (greyed at the foot
// if not, with why). Ranked once to know the order shown, then again with what's free for each in that order.
function sendRows(s) {
  const t = now(), card = s.card, pool = S.friends, inst = sendInstant(s);
  // (the weather where a friend is: for that friend alone, as canForward says, so the sheet and the letter agree)
  const onlyFor = card?.there === true ? `Only for ${first(friend(card.ref?.friend)?.name || "the friend it’s about")}` : null;
  const forThem = (id) => { try { return canForward(card, { mine: true, to: id }); } catch (_) { return false; } };
  // (a message goes to anyone whose key you trust: no place, turn or pigeon needed)
  const why0 = (f) => (onlyFor && !forThem(f.id) ? onlyFor : f.keyChanged ? "Check the new safety number first" : inst ? null : f.lat == null && !f.moon ? "No location yet" : moonChat(f) ? "Send from the chat" : null);
  const opts = (canFly, landsIn) => ({ friends: pool, me: { lat: S.me.lat, lon: S.me.lon, tz: MY_TZ }, now: t, rain: s.rain || {}, seen: s.seen, landsIn: inst ? () => null : landsIn,
    asked: s.asked || [], planned: plannedHere(), calls: S.times || [],
    streakRisk: !pigeonsOn() ? undefined : (f) => { const st = streakOf(f); return st && streakRisk(st) ? { n: st.n, endsAt: st.endsAt } : null; },
    lastAt: (f) => (f.last ? (f.last.from === S.me.id ? f.last.sentAt : f.last.deliverAt) : null), canFly });
  let r0 = []; try { r0 = rankFriends(card, opts(why0, (f) => flightMs(chatKm(f), mySpeed(turnOf(f).free ? "standard" : "swift")))) || []; } catch (_) {}
  const order = r0.length ? r0.map((r) => r.id) : pool.map((f) => f.id);
  const kinds = sendKinds(s, order), picksIn = order.filter((id) => s.pick.includes(id)).map(friend).filter(Boolean), memo = new Map();
  const kf = (f) => {
    if (!memo.has(f.id)) {
      let k = null;
      if (s.pick.includes(f.id)) k = kinds.get(f.id) || null;
      else try { k = pigeonsFor([...picksIn, f].map((x) => pickOf(x, landFor(s, x))), { me: lofts(), now: t }).get(f.id) || null; } catch (_) {}
      memo.set(f.id, k);
    }
    return memo.get(f.id);
  };
  const canFly = (f) => why0(f) || (inst || kf(f) ? null : "No pigeon free just now");
  const landsIn = (f) => flightMs(chatKm(f), mySpeed(kf(f) || "swift"));
  let rows = []; try { rows = rankFriends(card, opts(canFly, landsIn)) || []; } catch (_) {}
  if (!rows.length) rows = pool.map((f) => ({ id: f.id, score: 0, reason: inst ? "" : `Lands in ${durShort(landsIn(f))}`, best: false, lands: inst ? null : landsIn(f), can: !canFly(f), why: canFly(f) }));
  rows = rows.filter((r) => friend(r.id)).map((r) => { const f = friend(r.id); return { ...r, can: !canFly(f), why: canFly(f), kind: inst ? "instant" : kf(f), lands: inst ? null : Number.isFinite(r.lands) ? r.lands : landsIn(f) }; });
  // groups too: a message now, to everyone in it (no landing time, no plan, and never the weather where a friend is)
  const gWhy = (g) => (onlyFor ? onlyFor : s.plan ? "A plan goes to one friend at a time" : !inst || s.when !== "now" ? "For a group, only Now"
    : others(g).some((p) => p.keyChanged) ? "Check a new safety number first" : null);
  const gRows = S.groups.map((g) => ({ id: g.id, group: true, score: 0, reason: `Group of ${g.members.length}`, best: false, can: !gWhy(g), why: gWhy(g), kind: "instant", lands: null }));
  return [...rows.filter((r) => r.can), ...gRows.filter((r) => r.can), ...rows.filter((r) => !r.can), ...gRows.filter((r) => !r.can)];
}
// What's on this phone for the sheet's reasons (rank.js): the rides you've agreed (sync.rides) and the plans in your
// letters, and what each friend's said lately (pigeon/digest.js: the stock they asked about). In memory only
function plannedHere() {
  const out = [...(S.rides || [])], t = now();
  for (const [chat, list] of S.msgs) {
    if (!friend(chat)) continue;
    // (an invite answered No isn't a ride planned)
    const no = new Set(list.map((m) => partsOf(S.plain.get(m.id), false)?.ans).filter((a) => a?.a === "no" && a.re).map((a) => a.re));
    for (const m of list) {
      const pp = partsOf(S.plain.get(m.id), false), pl = pp?.plan && !no.has(m.id) ? pp.plan : pp?.ans?.a === "yes" ? pp.ans.plan : null;
      if (pl && pl.end > t) out.push({ with: chat, start: pl.start, end: pl.end, sport: pl.sport });
    }
  }
  return out;
}
function askedHere() {
  const items = [], t = Date.now();
  for (const [chat, list] of S.msgs) {
    const f = friend(chat); if (!f) continue;
    const msgs = list.filter((m) => m.from === chat && !m.flying && !m.lost && t - (m.deliverAt || 0) < DAY).slice(-5).map((m) => digestMsg(m, false)).filter(Boolean);
    if (msgs.length) items.push({ id: chat, first: first(f.name), at: msgs.at(-1).at, msgs });
  }
  try { return waitingDigest(items, { stocks: S.stocks || [], now: t }); } catch (_) { return []; }
}
// The plan, as it would go: the workout the server chose, the window picked, the others as chips
function planOf(s) {
  const tg = s.together; if (!tg?.windows?.length) return null;
  const w = tg.windows[s.win] || tg.windows[0], wk = tg.workout || {};
  try {
    return normPlan({ sport: planSport(s.card), wid: wk.wid, name: wk.name, secs: wk.secs, start: w.start, end: w.end, tz: MY_TZ,
      opts: tg.windows.filter((x) => x !== w).slice(0, 3).map((x) => ({ start: x.start, end: x.end, dry: !!x.dry })), dry: !!w.dry, far: !!tg.far });
  } catch (_) { return null; }
}
// The plan's own words, as the box would show them (none while there's no window)
function planWordsOf(s) { const pl = s.plan ? planOf(s) : null; try { return pl ? planWords(pl, { tz: MY_TZ, now: now() }) || "" : ""; } catch (_) { return ""; } }
// Typed words keep the plan's words as they were shown: when the window or the friend changes, those go for the new
// ones (or, turned off, go), so the letter never names an earlier time; where they've been typed over, the box starts
// again from the new words
function syncPlanWords(s) {
  if (s.together?.wait) return;
  const cur = planWordsOf(s), was = s.pwShown || "";
  if (s.edited && was && was !== cur) {
    if (s.words.includes(was)) s.words = s.words.replace(was, cur).replace(/\s+/g, " ").trim().slice(0, 500);
    else if (cur) { s.words = ""; s.edited = false; }
    if (!s.words.trim()) { s.words = ""; s.edited = false; }
  } else if (s.edited && !was && cur && !s.words.includes(cur)) s.words = `${s.words.trim().slice(0, 499 - cur.length)} ${cur}`.trim();
  s.pwShown = cur;
}
// What a friend's letter says: what was typed, else the words for the moment it lands (and "How's yours?" when it asks)
function wordsFor(s, f, landAt, ask = true) {
  let t = s.base;
  if (s.plan) {
    // (an invite always says its time, for a Chat that shows only the words: what was typed, with the time added if it doesn't)
    const pl = planOf(s), typed = s.edited ? String(s.words || "").trim() : ""; let pw = "";
    if (pl) try { pw = planWords(pl, { tz: MY_TZ, now: now() }) || ""; } catch (_) {}
    t = !pw ? (s.edited ? s.words : t) : !typed ? pw : typed.includes(fmtTime(pl.start)) ? typed : `${typed.slice(0, 499 - pw.length).trim()} ${pw}`;
  } else if (s.edited) t = s.words;
  else if (f && landAt && s.when !== "asap") try { t = landWords(s.card, { mode: s.when, landAt, rainAt: s.rain?.[f.id]?.at ?? null, tz: f.tz || MY_TZ }) || t; } catch (_) {}
  t = String(t || "").trim() || s.card.say || cardWords(s.card) || "";
  if (ask && s.ask && !s.plan && ASK_KINDS.includes(s.card.kind)) { try { t = askWords(t.slice(0, 486)); } catch (_) {} }
  return t.slice(0, 500);
}
// the window for two, from the server (Fitness's forecast at both places), for the one friend picked
async function planFetch(s) {
  const f = friend(s.pick[0]); if (!f || !canPlan(s.card)) return;
  const k = oneKind(f) || "swift", after = Math.round(now() + (sendInstant(s) ? 0 : flightMs(chatKm(f), mySpeed(k))) + 30 * MIN);
  const wid = s.card.kind === "fitness" && s.card.snap?.wid ? `&wid=${encodeURIComponent(s.card.snap.wid)}` : "";
  s.together = { wait: true, for: f.id }; s.note = ""; renderSheet();
  let note = "", tg = null;
  try {
    const r = await api(`together?with=${encodeURIComponent(f.id)}&sport=${planSport(s.card)}${wid}&after=${after}`);
    if (r.quiet) note = "Can’t look for a time just now. Try again later.";
    else if (!Array.isArray(r.windows) || !r.windows.length) note = "No time is dry for you both in the next three days.";
    else tg = { for: f.id, workout: r.workout, windows: r.windows.slice(0, 4), hours: Array.isArray(r.hours) ? r.hours : [], far: !!r.far };
  } catch (e) { note = e.offline ? NO_SIGNAL : "Can’t look for a time just now. Try again later."; }
  if (S.sheet !== s || !s.plan || s.pick[0] !== f.id) return;
  if (tg) { s.together = tg; s.win = 0; } else { s.plan = false; s.together = null; s.note = note; }
  renderSheet();
}
function drawSend(s) {
  syncPlanWords(s);
  const card = s.card, t = now(), tz = MY_TZ, rows = sendRows(s), links = cardLinks(card);
  // (a group picked, then a way it can't have chosen: By Pigeon, their morning, a plan: no longer picked)
  s.pick = s.pick.filter((id) => { const r = rows.find((x) => x.id === id); return !!r && (r.can || !r.group); });
  const picked = rows.filter((r) => s.pick.includes(r.id)), names = picked.map((r) => (r.group ? group(r.id)?.name || "the group" : first(friend(r.id).name)));
  const paid = lofts(), anyPaid = paid.swift + paid.turbo + paid.rocket > 0, on = pigeonsOn();
  const rainy = on && card.kind === "weather" && picked.some((r) => { const x = s.rain?.[r.id]; return x?.at && !x.now; });
  // (the timed landings need a swift pigeon, and the rain: pigeons on; pigeons off, now or with their morning)
  if (!on && s.when !== "now" && s.when !== "morning") s.when = "now";
  // (pigeons off: their morning needs every picked friend's time zone; one without, and it's Now, not a chip shown chosen but off)
  if (!on && s.when === "morning" && picked.some((r) => !friend(r.id)?.tz)) s.when = "now";
  if (on && ((s.when === "before" && !rainy) || (!anyPaid && (s.when === "before" || s.when === "morning")))) s.when = "asap";
  const inst = sendInstant(s);
  let cardPart = "";
  // (the weather where a friend is: "Where Leo is")
  const who = card.there ? first(friend(card.ref?.friend)?.name || "") : "";
  try { cardPart = linkActs(sheetCardHtml(card, { now: keyOfCard(card) ? nowVal(card) : null, viewAt: t, links, tz, who })); } catch (_) {}
  if (!cardPart) cardPart = `<p class="sendsay">${esc(card.say || cardWords(card) || "")}</p>`;
  const f0 = picked[0] && friend(picked[0].id), shown = s.edited ? s.words : wordsFor(s, f0, f0 && landFor(s, f0), false);
  const top = `<div class="sendcard">${cardPart}</div>
    <div class="group mt-s"><label class="fcell"><input id="f-sendwords" maxlength="500" placeholder="Add a line" aria-label="Words to go with it" autocomplete="off" value="${esc(shown)}"></label></div>`;
  // (in the engine, Add a Friend is Chats' own Friends, at the top: its frame is only ever the sheet)
  if (!S.friends.length) return sheetHtml("Send to a Friend", `${top}<p class="empty">Add a friend in Chat, and you can send them this.<br><button type="button" class="btn" data-act="${s.engine ? "enginefriends" : "addfriend"}">Add a Friend</button></p>`, { left: { label: "Cancel", act: "close" }, right: null });
  const row = (r) => {
    const on = s.pick.includes(r.id);
    if (r.group) {
      const g = group(r.id);
      return `<button type="button" class="cell pickrow sendrow grouprow${r.can ? "" : " dim"}" role="checkbox" aria-checked="${on}" data-act="sendpick" data-id="${esc(r.id)}"${!r.can && !on ? " disabled" : ""}>${gavatar(g, "s")}<span class="ctext"><span class="one">${esc(g.name)}</span><span class="csub why">${esc(r.can ? r.reason || "" : r.why || "")}</span></span><span class="tickbox" aria-hidden="true">${I.check}</span></button>`;
    }
    const f = friend(r.id);
    // (the tag says when it lands, unless that's the reason already)
    const tag = r.can && (r.best || (!inst && !/^Lands in /.test(r.reason || ""))) ? `<span class="stag${r.best ? " best" : ""}">${r.best ? "Best fit" : `Lands in ${esc(durShort(r.lands))}`}</span>` : "";
    return `<button type="button" class="cell pickrow sendrow${r.can ? "" : " dim"}" role="checkbox" aria-checked="${on}" data-act="sendpick" data-id="${esc(r.id)}"${!r.can && !on ? " disabled" : ""}>${avatar(f, "s")}<span class="ctext"><span class="one">${esc(first(f.name))}</span><span class="csub why">${esc(r.can ? r.reason || "" : r.why || "")}</span></span>${tag}<span class="tickbox" aria-hidden="true">${I.check}</span></button>`;
  };
  const chip = (k, label, off) => `<button type="button" class="schip" role="radio" aria-checked="${s.when === k}" data-act="sendwhen" data-id="${k}"${off ? " disabled" : ""}>${label}</button>`;
  const timedOff = s.plan || !anyPaid || s.busy;
  // (pigeons off: their morning needs their time zone)
  const mornOff = on ? timedOff : s.plan || s.busy || picked.some((r) => !friend(r.id)?.tz);
  const lines = inst ? picked.slice(0, 3).map((r) => {
    if (r.group) { try { return whenLine(group(r.id)?.name || "The group", { mode: "now" }); } catch (_) { return ""; } }
    const f = friend(r.id), la = landFor(s, f);
    try { return la ? whenLine(first(f.name), { mode: "at", landAt: la, tz, theirTz: f.tz || tz, now: t }) : whenLine(first(f.name), { mode: "now" }); } catch (_) { return ""; }
  }).filter(Boolean)
    : !anyPaid ? ["Timed landings need a swift pigeon, and your lofts are empty."] : picked.slice(0, 3).map((r) => {
    const f = friend(r.id), la = landFor(s, f), rain = s.rain?.[f.id], before = !s.plan && s.when === "before" && rain?.at && !rain.now;
    const mode = s.plan ? "asap" : before ? "before" : la ? s.when : "asap";
    try { return whenLine(first(f.name), { mode, landAt: mode === "before" ? la : la ?? t + r.lands, rainAt: rain?.at ?? null, tz, theirTz: f.tz || tz, now: t }); } catch (_) { return ""; }
  }).filter(Boolean);
  if ((inst ? lines.length : anyPaid) && picked.length > 3) lines.push(`and ${picked.length - 3} more`);
  let planPart = "";
  if (s.plan && s.together?.wait) planPart = `<p class="gfoot">Looking for a time dry for you both…</p>`;
  else if (s.plan && s.together?.windows) {
    const tg = s.together, w = tg.windows[s.win] || tg.windows[0], f = friend(tg.for);
    let strip = ""; try { strip = stripHtml(tg.hours, { who: first(f?.name || ""), start: w.start, end: w.end, tz }); } catch (_) {}
    planPart = `<div class="planbox">${strip}<p class="planline">${w.dry ? "<b>Dry for both</b> " : ""}${esc(spanSay(w))}</p>
      ${tg.windows.length > 1 ? `<div class="schips" role="radiogroup" aria-label="Time">${tg.windows.map((x, i) => `<button type="button" class="schip" role="radio" aria-checked="${x === w}" data-act="planpick" data-id="${i}">${esc(clockSay(x.start))}</button>`).join("")}</div>` : ""}
      ${tg.far ? `<p class="gfoot">You’re far apart: same time, each where you are.</p>` : ""}</div>`;
  }
  const kinds = picked.map((r) => r.kind), ready = picked.length && picked.every((r) => r.kind) && (!s.plan || planOf(s));
  let spend = ""; try { spend = !inst && picked.length && picked.every((r) => r.kind) ? spendWords(kinds, names) : ""; } catch (_) {}
  const label = s.busy && s.progress ? `Sending ${s.progress[0]} of ${s.progress[1]}…` : !names.length ? "Choose a Friend"
    : inst ? (names.length === 1 ? `Send to ${names[0]}` : names.length === 2 ? `Send to ${names[0]} and ${names[1]}` : `Send to ${names.length} Friends`)
    : names.length === 1 ? `Send a Pigeon to ${names[0]}` : `Send ${names.length} Pigeons to ${andList(names)}`;
  return sheetHtml("Send to a Friend", `${top}
    <div class="ghead">Send To</div><div class="group">${rows.map(row).join("")}</div>
    <div class="ghead">${on ? "When It Lands" : "When It Arrives"}</div>
    <div class="schips" role="radiogroup" aria-label="${on ? "When it lands" : "When it arrives"}">${chip("now", "Now", s.busy)}${on ? chip("asap", "By Pigeon", s.busy) : ""}${rainy ? chip("before", "Before the Rain", timedOff) : ""}${chip("morning", "With Their Morning", mornOff)}</div>
    ${lines.length ? `<p class="whenlines">${lines.map(esc).join("<br>")}</p>` : ""}
    ${ASK_KINDS.includes(card.kind) || canPlan(card) ? `<div class="group mt-s">
      ${ASK_KINDS.includes(card.kind) ? toggleCell({ act: "sendask", icon: I.bubble, tile: "blue", label: "Ask “How’s Yours?”", on: s.ask && !s.plan, disabled: s.plan || s.busy }) : ""}
      ${canPlan(card) ? toggleCell({ act: "sendplan", icon: I.clock, tile: "green", label: "Make It a Plan", sub: s.plan ? "A plan goes to one friend at a time." : esc(s.note || ""), on: s.plan, disabled: s.busy }) : ""}</div>` : ""}
    ${planPart}
    <div class="sendgo">
      <button type="button" class="btn wide" data-act="sendgo"${ready && !s.busy ? "" : " disabled"}>${esc(label)}</button>
      ${spend ? `<p class="spend">${esc(spend)}</p>` : ""}
      ${picked.length === 1 && !s.plan && !s.ask && !s.busy ? `<button type="button" class="btn wide plain" data-act="sendchat">Write More in the Chat</button>` : ""}
      ${s.back && !s.engine && !s.busy ? `<p class="gfoot">Once it’s sent, you’re back where you were.</p>` : ""}
      ${s.err ? `<p class="gfoot bad" role="alert">${esc(s.err)}</p>` : ""}
    </div>`, { left: { label: "Cancel", act: "close" }, right: null });
}
function sendPick(id) {
  const s = S.sheet; if (s?.type !== "send" || s.busy) return;
  const r = sendRows(s).find((x) => x.id === id); if (!r) return;
  const i = s.pick.indexOf(id);
  if (i >= 0) { s.pick.splice(i, 1); if (s.plan) s.together = null; }
  else {
    if (!r.can) return;
    if (s.plan) { s.pick = [id]; renderSheet(); return planFetch(s); }
    if (s.pick.length >= SEND_MAX) return toast("12 at most, at one go.");
    s.pick.push(id);
  }
  renderSheet();
}
function sendPlan() {
  const s = S.sheet; if (s?.type !== "send" || s.busy || !canPlan(s.card)) return;
  s.plan = !s.plan; s.note = ""; s.together = null;
  if (s.plan) { s.ask = false; s.when = pigeonsOn() && s.when !== "now" ? "asap" : "now"; if (s.pick.length > 1) s.pick = s.pick.slice(0, 1); }
  renderSheet();
  if (s.plan && s.pick.length) planFetch(s);
}
// Send: one letter at a time, in the order shown, each with the pigeon the lofts have for it as they are by then
// (the server takes a loft's pigeon only if the loft is as it read it: two at once would turn one away)
async function sendGo() {
  const s = S.sheet; if (s?.type !== "send" || s.busy || !s.pick.length) return;
  const r = await sendRun(s);
  if (!r) return;
  const { sent, failed, say } = r;
  if (!failed.length) {
    // (from another page of the hub: back there, saying so. The engine: put away, and its page says it; Chats' own
    // sheet, opened with back=: the page it came from, which says it once it's open)
    if (s.engine) { s.engine.done?.({ ok: true, say: say || "Sent" }); if (!s.engine.bySendTo) hubParent()?.sent?.(say || "Sent"); if (S.sheet === s) { S.sheet = null; renderSheet(); } return; }
    if (s.back) { try { sessionStorage.setItem("ifl-sent", say || "Sent"); } catch (_) {} location.replace(s.back); return; }
    if (S.sheet === s) { S.sheet = null; renderSheet(); }
  } else if (S.sheet === s) renderSheet();
  if (say) toast(esc(say));
  if (sent) { if (S.view === "chat") render(); sync().catch(() => {}); }
}
// The send itself, for the sheet (or the engine's one tap, sendTo, with a sheet that's never drawn): one letter at a
// time, in the order shown, each friend with the pigeon the lofts have for it as they are by then, each group as a
// message to everyone in it. → { sent, failed, say, results }, or null if it couldn't start
async function sendRun(s) {
  if (navigator.onLine === false) { s.err = NO_SIGNAL; if (S.sheet === s) renderSheet(); return null; }
  const plan = s.plan ? planOf(s) : null; if (s.plan && !plan) return null;
  const inst = sendInstant(s);
  const order = sendRows(s).map((r) => r.id).filter((id) => s.pick.includes(id)).map(chatOf).filter(Boolean);
  // (with their morning, as a message, for someone whose morning isn't known: never sent at once instead; the sheet says Now first)
  if (inst && s.when === "morning" && order.some((f) => !group(f.id) && !f.tz)) { s.when = "now"; if (S.sheet === s) renderSheet(); return null; }
  s.busy = true; s.err = ""; s.progress = [1, order.length]; if (S.sheet === s) renderSheet();
  const results = [], failed = [];
  const sr = await shareRef(s.card), card = sr.card;           // (one id for every letter of this send)
  // letters whose reply never came (they may have gone): sent again as they were, with the same id, never as a second one
  const unsure = s.unsure || (s.unsure = new Map()), refOk = s.refOk || (s.refOk = new Set()), maybeDrop = new Set([sr.id]);
  let off = false;
  for (let i = 0; i < order.length; i++) {
    const f = order[i], g = group(f.id), name = g ? g.name : first(f.name);
    s.progress = [i + 1, order.length]; if (S.sheet === s) renderSheet();
    if (off) { failed.push(f.id); results.push({ name, ok: false, err: NO_SIGNAL }); continue; }
    const again = unsure.get(f.id);
    if (g) {
      // a group: a message now, to everyone in it; a Fitness card without its share id (When Sent only), no plan, no ask
      let payload = again?.payload || null;
      try {
        payload ||= buildPayload({ t: wordsFor(s, null, null, false), card: noRef(card), group: true });
        await sendGroupLetter(g, payload, { id: again?.id || null });
        unsure.delete(f.id);
        results.push({ name, ok: true, landAt: null, lands: null });
      } catch (e) {
        failed.push(f.id); results.push({ name, ok: false, err: e.message || "Couldn’t send it." });
        if (e.offline) off = true;
        if (e.unsure && payload) unsure.set(f.id, { id: e.id, payload, landAt: null, kind: "instant", ref: null });
        else if (again && !e.offline) unsure.delete(f.id);
      }
      continue;
    }
    const rest = order.slice(i).filter((x) => !group(x.id)), lands = new Map(rest.map((x) => [x.id, again ? again.landAt : landFor(s, x)]));
    let kind = null;
    if (inst) kind = "instant";
    else try { kind = pigeonsFor(rest.map((x) => pickOf(x, lands.get(x.id))), { me: lofts(), now: now() }).get(f.id) || null; } catch (_) {}
    kind ||= again?.kind || null;             // (one that may have gone already: the server says so before it counts pigeons)
    if (!kind) { failed.push(f.id); results.push({ name, ok: false, err: "No pigeon free just now." }); continue; }
    const landAt = lands.get(f.id);
    let payload = again?.payload || null;
    try {
      // (sealed for this friend: the weather where a friend is only ever for that friend, to: as canForward says)
      payload ||= buildPayload({ t: wordsFor(s, f, landAt), card, to: f.id, ...(plan ? { plan } : s.ask && ASK_KINDS.includes(card.kind) ? { ask: { kind: card.kind } } : {}) });
      const r = await sendLetter(f.id, payload, { kind, landAt, id: again?.id || null });
      unsure.delete(f.id); refOk.add(again ? again.ref : sr.id);
      results.push({ name, ok: true, landAt, tz: f.tz, lands: r.message ? Math.max(0, (r.message.deliverAt || now()) - now()) : null });     // (one that had gone already: when, the chat says)
      // an invite to ride: your own record of it, as it goes (Fitness's, pending until they answer; never words)
      if (payload.plan) planAsked(r.message?.id || r.id || again?.id, payload.plan, f);
    } catch (e) {
      failed.push(f.id); results.push({ name, ok: false, err: e.message || "Couldn’t send it." });
      if (e.offline) off = true;
      if (e.unsure && payload) unsure.set(f.id, { id: e.id, payload, landAt, kind, ref: again ? again.ref : sr.id });
      else if (again && !e.offline) { unsure.delete(f.id); maybeDrop.add(again.ref); }     // (an answer, and not "already sent": it never went)
    }
  }
  const sent = results.some((x) => x.ok);
  // a share id no letter carries (none went, and none may have): gone again
  const held = new Set([...unsure.values()].map((x) => x.ref));
  for (const ref of maybeDrop) if (ref && !refOk.has(ref) && !held.has(ref)) dropRef(ref);
  s.busy = false; s.progress = null;
  if (sent) haptic("success");
  if (failed.length) { s.pick = failed; if (off) s.err = NO_SIGNAL; }
  let say = "";
  try { const at = results.find((x) => x.ok && Number.isFinite(x.landAt)); say = inst ? sentToast(results, { instant: true, at: at?.landAt ?? null, tz: at?.tz }) : sentToast(results); } catch (_) {}
  return { sent, failed, say, results };
}
// A letter to a group, now: sealed once, its key sealed for each of them and for you (as the message box sends one:
// send()), with everything passed in and nothing taken from the box. As sendLetter, a reply that never came sends it
// again with the same id.
async function sendGroupLetter(g, payload, { id: again = null } = {}) {
  if (navigator.onLine === false) throw Object.assign(new Error(NO_SIGNAL), { offline: true });
  const id = again || uuid();
  const { body, key, h } = await E2E.sealGroup({ id, from: S.me.id, group: g.id, type: "msg" }, padPayload({ ...payload }));
  const keys = {};
  for (const p of [{ id: S.me.id, pub: S.myPub || S.me.pub }, ...others(g)]) keys[p.id] = await E2E.seal(await pairFor(p.id === S.me.id ? p.pub : trustedPub(p)), { id, from: S.me.id, to: p.id, type: "wrap" }, { k: key, h });
  let r;
  try { r = await api("group-messages", { method: "POST", body: { id, group: g.id, body, keys, instant: true } }); }
  catch (e) {
    if (e.offline) throw Object.assign(new Error(NO_SIGNAL), { offline: true, unsure: true, id });
    if (again && e.status === 409 && /already sent/.test(e.message || "")) { S.plain.set(id, payload); return { id, message: null }; }
    throw e;
  }
  S.plain.set(id, payload);
  const list = S.msgs.get(g.id); if (list && r.message && !list.some((x) => x.id === r.message.id)) list.push(r.message);
  return r;
}
// "Write More in the Chat": the card waits above that chat's message box, sent with what you write there
function sendChat() {
  const s = S.sheet; if (s?.type !== "send" || s.pick.length !== 1 || s.busy) return;
  const f = chatOf(s.pick[0]); if (!f) return;
  const words = s.edited ? s.words.trim() : s.base, say = words && words !== s.card.say ? words : null;
  // (the engine: Chats itself, in the page's place, that chat open with the card waiting above its box: the card handed
  // over in this tab's own storage for the one step, never anywhere else, checked again there as any card is; never the
  // words typed, which are written again in the chat)
  if (s.engine) {
    try { sessionStorage.setItem(WAIT_KEY, JSON.stringify({ chat: f.id, card: s.card, at: Date.now() })); } catch (_) {}
    s.engine.done?.({ ok: false, why: "chat" }); S.sheet = null; renderSheet();
    try { parent.location.assign(`/chats/#open=${encodeURIComponent(f.id)}`); } catch (_) {}
    return;
  }
  // (from inside that same chat, go() leaves its box as it is: the words go straight in, never on to the next chat opened)
  const here = S.view === "chat" && S.chat === f.id && !!$ta;
  S.cardWait = { chat: f.id, card: s.card };
  S.share = here ? null : say;
  S.sheet = null; renderSheet();
  go("chat", f.id);
  if (here && say) { $ta.value = ($ta.value.trim() ? `${$ta.value.trimEnd()}\n` : "") + say; fitTa(); }
}

/* ---------- asking back: "How's yours?" ---------- */
async function openAskBack(id) {
  const chat = S.chat, m = (S.msgs.get(chat) || []).find((x) => x.id === id), pp = m && partsOf(S.plain.get(id)), f = friend(chat);
  if (!pp?.ask || !f || m.from === S.me.id || group(chat)) return;
  const s = { type: "askback", id, chat, kind: pp.ask.kind, wait: true, card: null, said: "", words: "Here’s mine.", busy: false, err: "" };
  S.sheet = s; renderSheet();
  let card = null, said = "";
  try {
    // (only your own, read from your own account: nothing is written anywhere until Send)
    const r = await api(`my-card?kind=${encodeURIComponent(s.kind)}&tz=${encodeURIComponent(MY_TZ || "")}`);
    try { card = r.card ? normCard(r.card) : null; } catch (_) { card = null; }
    if (card && card.kind !== s.kind) card = null;
    if (!card) said = typeof r.said === "string" && r.said.trim() ? r.said.trim().slice(0, 200) : "Couldn’t get yours just now. Try again in a moment.";
  } catch (e) { said = e.offline ? NO_SIGNAL : "Couldn’t get yours just now. Try again in a moment."; }
  if (S.sheet !== s) return;
  Object.assign(s, { wait: false, card: noRef(card), said });
  renderSheet();
  if (card) nowFor([card]);
}
function drawAskBack(s) {
  const f = friend(s.chat), who = esc(first(f?.name || "your friend")), word = APP_WORD[s.kind] || "the app";
  const href = appOrigin(s.kind === "markets" ? "finance" : s.kind);
  let body;
  if (s.wait) body = `<p class="empty">Getting yours…</p>`;
  else if (!s.card) body = `<p class="empty"><b>${esc(s.said)}</b>${href ? `<a class="btn" href="${esc(href + "/")}" target="_blank" rel="noopener">Open ${word}</a>` : ""}</p>`;
  else {
    let c = ""; try { c = linkActs(sheetCardHtml(s.card, { now: keyOfCard(s.card) ? nowVal(s.card) : null, viewAt: now(), links: cardLinks(s.card), tz: MY_TZ })); } catch (_) {}
    body = `<div class="sendcard">${c || `<p class="sendsay">${esc(s.card.say || "")}</p>`}</div>
      <div class="group mt-s"><label class="fcell"><input id="f-askwords" maxlength="500" placeholder="Add a line" aria-label="Words to go with it" autocomplete="off" value="${esc(s.words)}"></label></div>
      <p class="gfoot">Only this card goes back to ${who}. Nothing else from ${word} is shared.${s.kind === "markets" ? " Percentages only, never amounts." : ""}</p>
      <div class="sendgo"><button type="button" class="btn wide" data-act="asksend" data-id="${esc(s.id)}"${s.busy ? " disabled" : ""}>${s.busy ? "Sending…" : "Send"}</button>
        <button type="button" class="btn wide plain" data-act="askno" data-id="${esc(s.id)}"${s.busy ? " disabled" : ""}>Not Now</button>
        ${s.err ? `<p class="gfoot bad" role="alert">${esc(s.err)}</p>` : ""}</div>`;
  }
  return sheetHtml("Send Yours Back?", body, { left: { label: "Cancel", act: "close" }, right: null });
}
async function askSend() {
  const s = S.sheet; if (s?.type !== "askback" || !s.card || s.busy) return;
  const f = friend(s.chat), m = (S.msgs.get(s.chat) || []).find((x) => x.id === s.id); if (!f || !m) return;
  const key = `ask:${m.id}`, again = replyUnsure.get(key);
  const kind = (defaultNext(f) === "now" ? "instant" : oneKind(f)) || again?.kind; if (!kind) { s.err = "No pigeon free just now."; return renderSheet(); }
  s.busy = true; s.err = ""; renderSheet();
  let ref = again?.ref || null, payload = again?.payload || null;
  try {
    if (!payload) {
      const sr = await shareRef(s.card); ref = sr.id;
      payload = buildPayload({ t: String(s.words || "").trim() || "Here’s mine.", card: sr.card, re: { ask: m.id }, q: quoteOf(m, S.plain.get(m.id)) });
    }
    const r = await sendLetter(f.id, payload, { kind, id: again?.id || null });
    replyUnsure.delete(key);
    if (S.sheet === s) { S.sheet = null; renderSheet(); }
    haptic("success");
    let say = ""; try { say = kind === "instant" ? sentToast([{ name: first(f.name), ok: true }], { instant: true }) : sentToast([{ name: first(f.name), ok: true, landAt: null, lands: Math.max(0, (r.message?.deliverAt || now()) - now()) }]); } catch (_) {}
    if (say) toast(esc(say));
    render(); sync().catch(() => {});
  } catch (e) {
    // (one that may have gone keeps its share id, for the same letter again; one that surely didn't, loses it)
    if (e.unsure && payload) replyUnsure.set(key, { id: e.id, payload, kind, ref });
    else if (!e.offline || !again) { replyUnsure.delete(key); dropRef(ref); }
    if (S.sheet === s) { s.busy = false; s.err = e.message || "Couldn’t send it."; renderSheet(); }
  }
}
// "Not Now": nothing goes, and this phone remembers (the letter then says "You didn't send yours")
function askNo() {
  const s = S.sheet; if (s?.type !== "askback") return;
  keepIn("inflight-askno", s.id); S.sheet = null; renderSheet(); render();
}

/* ---------- plans: answering an invite ---------- */
// the letter answered (an invite, or a friend's "later" with its one time) and its plan
function planIn(id) {
  const m = (S.msgs.get(S.chat) || []).find((x) => x.id === id), pp = m && partsOf(S.plain.get(id));
  const plan = pp?.plan || (pp?.ans?.a === "later" ? pp.ans.plan : null);
  return m && plan && m.from !== S.me.id && !group(S.chat) ? { m, plan, later: !pp.plan, p: S.plain.get(id) } : null;
}
const answeredHere = (id) => (S.msgs.get(S.chat) || []).some((x) => x.from === S.me.id && partsOf(S.plain.get(x.id))?.ans?.re === id);
async function planAnswer(id, a) {
  const x = planIn(id); if (!x || !["yes", "later", "no"].includes(a) || answeredHere(id)) return;
  if (!(x.plan.start > now())) { toast("That time has passed."); return render(); }
  if (a === "later") { if (x.later) return; S.laterOpen = S.laterOpen === id ? null : id; return render(); }
  return planSend(x, a === "yes" ? { re: id, a, plan: x.plan } : { re: id, a });
}
async function planLater(id, at) {
  const x = planIn(id); if (!x || x.later || answeredHere(id)) return;
  const plan = laterPlan(x.plan, at);
  if (!plan || !(plan.start > now())) { toast("That time has passed."); return render(); }
  return planSend(x, { re: id, a: "later", plan });
}
async function planSend(x, ans) {
  const f = friend(S.chat); if (!f) return;
  // (an answer that may have gone already goes again as it was, whichever button's tapped now)
  const again = replyUnsure.get(x.m.id); if (again) ans = again.ans;
  const kind = (defaultNext(f) === "now" ? "instant" : oneKind(f)) || again?.kind; if (!kind) return toast("No pigeon free just now.");
  let payload = again?.payload || null;
  try {
    if (!payload) {
      let t = ""; try { t = answerWords(ans, { tz: MY_TZ, now: now() }); } catch (_) {}
      payload = buildPayload({ t: t || { yes: "Yes, that works.", later: "Later suits me better.", no: "Can’t make it this time." }[ans.a], ans, q: quoteOf(x.m, x.p) });
    }
    const r = await sendLetter(f.id, payload, { kind, id: again?.id || null });
    replyUnsure.delete(x.m.id);
    S.laterOpen = null; haptic("success"); render();
    // (your Yes: your own row, and on the server the inviter's pending one agreed at this time, whether or not their
    // phone's open; your "later", which offers a time of its own: your own record of it, pending, as an invite's is)
    if (ans.a === "yes") { try { await fitOffer(r.message?.id || r.id, ans.plan, f, "answered", { with: f.id, re: ans.re }); toast("In Fitness, to add to your plan."); } catch (_) {} }
    else if (ans.a === "later" && ans.plan) planAsked(r.message?.id || r.id || again?.id, ans.plan, f);
    sync().catch(() => {});
  } catch (e) {
    if (e.unsure && payload) replyUnsure.set(x.m.id, { id: e.id, payload, kind, ans });
    else if (!e.offline || !again) replyUnsure.delete(x.m.id);
    toast(esc(e.message || "Couldn’t send it."));
  }
}

/* ---------- the + button: Photo and GIF, and what fits this chat from your apps (spec §8.5) ----------
   Built on the phone: the weather where the friend is (their Chat place's square), yours, a stock this chat's talked
   about (your own card for it, percentages only), the ride you've planned together, today's session, and A Time to
   Talk. Your own cards are asked for once each and kept 5 minutes, in memory; rows say "…" until they come. A tap
   puts the card above the message box, sent with what you write (send()). */
const FROM_KEEP = 5 * MIN, fromKept = new Map();
const keptFrom = (k) => { const h = fromKept.get(k); return h && Date.now() - h.at < FROM_KEEP ? h : null; };
async function myCardFor(kind, sym = "") {
  const k = `my:${kind}:${sym}`, h = keptFrom(k); if (h) return h;
  let card = null;
  try {
    const r = await api(`my-card?kind=${encodeURIComponent(kind)}&tz=${encodeURIComponent(MY_TZ || "")}${sym ? `&sym=${encodeURIComponent(sym)}` : ""}`);
    try { card = r.card ? normCard(r.card) : null; } catch (_) { card = null; }
    if (card && (card.kind !== kind || (sym && card.snap?.sym !== sym))) card = null;
  } catch (_) {}
  const v = { at: Date.now(), card: noRef(card) };
  fromKept.set(k, v);
  return v;
}
// the weather where a friend is: their Chat place's square (never the place itself to the server), as card-now has it
function thereCard(f) {
  if (!f || f.lat == null || f.lon == null || f.moon || f.keyChanged || !f.place) return null;
  const cell = snapCell(f.lat, f.lon), base = { v: 1, kind: "weather", from: "chat", there: true, at: now(), snap: { place: String(f.place).replace(/, (the Moon|Mars)$/, ""), tz: f.tz || undefined }, ref: { cell, friend: f.id } };
  const v = nowHad(normCard(base))?.v;
  if (!v) return { wait: normCard(base) };
  const pick = (k) => (Number.isFinite(v[k]) ? v[k] : undefined);
  return { card: normCard({ ...base, snap: { ...base.snap, temp: pick("temp"), feels: pick("feels"), hi: pick("hi"), lo: pick("lo"), code: pick("code"), isDay: typeof v.isDay === "boolean" ? v.isDay : undefined, rain: v.rain && typeof v.rain === "object" ? v.rain : null } }) };
}
const wxLine = (c) => { const sn = c?.snap || {}; let w = ""; try { w = codeWord(sn.code); } catch (_) {} return [sn.place, sn.rain?.now ? "raining" : w, Number.isFinite(sn.temp) ? `${Math.round(sn.temp)}°` : "", !sn.rain?.now && Number.isFinite(sn.rain?.at) && sn.rain.at > now() ? `rain from ${fmtTime(sn.rain.at)}` : ""].filter(Boolean).join(", "); };
const codeWord = (code) => (!Number.isFinite(code) ? "" : code >= 95 ? "stormy" : code >= 71 && code <= 86 ? "snowing" : code >= 51 ? "wet" : code >= 45 ? "foggy" : code >= 2 ? "cloudy" : "clear");
// the stocks this chat's talked about: Markets cards either way (newest first), and your holdings named in their words
function chatStocks(chat) {
  const list = S.msgs.get(chat) || [], g = !!group(chat), out = new Map();
  for (const m of [...list].reverse()) {
    const c = partsOf(S.plain.get(m.id), g)?.card, sym = c?.kind === "markets" ? c.snap?.sym : null;
    if (!sym) continue;
    const x = out.get(sym) || { sym, name: c.snap.name || sym, mine: false, theirs: false, who: null };
    if (m.from === S.me.id) x.mine = true; else { x.theirs = true; x.who ||= m.from; }
    out.set(sym, x);
  }
  try {
    const f = friend(chat), msgs = list.filter((m) => m.from !== S.me.id && !m.flying && !m.lost).slice(-5).map((m) => digestMsg(m, g)).filter(Boolean);
    const d = msgs.length ? waitingDigest([{ id: chat, first: f ? first(f.name) : "", msgs }], { stocks: S.stocks || [] }) : [];
    for (const tp of d[0]?.topics || []) if (tp.kind === "markets" && tp.sym && !out.has(tp.sym)) out.set(tp.sym, { sym: tp.sym, name: tp.name || tp.sym, mine: false, theirs: true, said: true, who: null });
  } catch (_) {}
  return [...out.values()].slice(0, 3);
}
// the ride you've planned with this chat's friend: the newest plan said yes to and still ahead, or the server's
// (sync.rides); for a group, a ride with friends one of its letters carries, still ahead
function chatRide(chat) {
  const t = now(), f = friend(chat), g = group(chat), list = S.msgs.get(chat) || [];
  if (f) {
    for (const m of [...list].reverse()) {
      const pp = partsOf(S.plain.get(m.id), false), pl = pp?.ans?.a === "yes" ? pp.ans.plan : null;
      if (pl && pl.end > t) return { start: pl.start, end: pl.end, dry: !!pl.dry, sport: pl.sport, name: pl.name, wid: pl.wid, secs: pl.secs, tz: pl.tz, with: [first(f.name)] };
    }
    const r = (S.rides || []).filter((x) => x.with === f.id && x.stop > t).sort((a, b) => a.start - b.start)[0];
    if (r) return { start: r.start, end: r.stop, dry: false, sport: r.sport || "ride", name: "Ride together", with: [first(f.name)] };
  }
  if (g) for (const m of [...list].reverse()) { const c = partsOf(S.plain.get(m.id), true)?.card; if (c?.kind === "fitness" && c.snap?.best?.end > t && c.snap.with?.length) return { card: c }; }
  return null;
}
function rideCard(r, chat) {
  if (!r) return null;
  if (r.card) return noRef(r.card);
  const d = new Date(r.start), day = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const tg = keptFrom(`together:${chat}:${r.start}`)?.dry;
  try { return normCard({ v: 1, kind: "fitness", from: "fitness", at: now(), snap: { day, tz: r.tz || MY_TZ, sport: ["ride", "run", "walk", "swim", "row", "strength"].includes(r.sport) ? r.sport : "ride", name: r.name || "Ride together", ...(r.wid ? { wid: r.wid } : {}), ...(r.secs ? { secs: r.secs } : {}), best: { start: r.start, end: r.end, dry: tg ?? !!r.dry }, with: r.with } }); } catch (_) { return null; }
}
// in that friend's own chat, the ride's weather for you both (GET together): dry or not, kept 5 minutes
async function rideWeather(chat, r) {
  const f = friend(chat); if (!f || !r || r.card) return;
  const k = `together:${chat}:${r.start}`; if (keptFrom(k)) return;
  let dry = null;
  try {
    const sport = r.sport === "run" ? "run" : "ride";
    const tg = await api(`together?with=${encodeURIComponent(f.id)}&sport=${sport}${r.wid ? `&wid=${encodeURIComponent(r.wid)}` : ""}&after=${Math.round(now())}`);
    const w = (tg.windows || []).find((x) => x.start <= r.start && x.end >= r.end);
    dry = w ? !!w.dry : (tg.windows || []).length ? false : null;
  } catch (_) {}
  fromKept.set(k, { at: Date.now(), dry });
}
function fromRows(s) {
  const chat = s.chat, f = friend(chat), g = group(chat), rows = [];
  rows.push({ key: "photo", icon: I.photo, tile: "blue", label: "Photo" });
  if (S.gifsOn) rows.push({ key: "gif", icon: `<span class="gifico" aria-hidden="true">GIF</span>`, tile: "indigo", label: "GIF" });
  if (f) { const t = thereCard(f); if (t) rows.push({ key: "there", icon: I.pin, tile: "teal", label: `Where ${esc(first(f.name))} is`, sub: t.card ? esc(wxLine(t.card)) : "…", card: t.card || null }); }
  const wx = keptFrom("my:weather:");
  rows.push({ key: "weather", icon: I.rain, tile: "blue", label: "Weather here", sub: wx ? (wx.card ? esc(wxLine(wx.card)) : null) : "…", card: wx?.card || null });
  for (const st of chatStocks(chat)) {
    const h = keptFrom(`my:markets:${st.sym}`), who = st.who ? first((friend(st.who) || member(g, st.who))?.name || "They") : f ? first(f.name) : "They";
    const why = st.mine && st.theirs ? "you’ve both sent it" : st.said ? `${who} mentioned it` : st.theirs ? `${who} sent it` : "you sent it";
    rows.push({ key: `markets:${st.sym}`, icon: I.dist, tile: "green", label: esc(st.name), sub: h ? (h.card ? esc(why) : null) : "…", card: h?.card || null, sym: st.sym });
  }
  const r = chatRide(chat);
  // ("Thursday’s ride together · 10:00–12:00, dry for both"; none for a ride whose times can't be read)
  if (r) { const c = rideCard(r, chat), b = c?.snap?.best; if (b && Number.isFinite(b.start) && Number.isFinite(b.end)) rows.push({ key: "ride", icon: I.clock, tile: "orange", label: `${sameDay(b.start, now()) ? "Today" : DOW_LONG[new Date(b.start).getDay()]}’s ride together`, sub: esc(`${fmtTime(b.start)}–${fmtTime(b.end)}${b.dry ? ", dry for both" : ""}`), card: c }); }
  const fit = keptFrom("my:fitness:");
  rows.push({ key: "fitness", icon: I.bolt, tile: "orange", label: fit?.card?.snap?.done ? `Today’s ${fit.card.snap.sport === "ride" ? "ride" : "session"}` : "Today’s session",
    sub: fit ? (fit.card ? esc(fit.card.snap.done ? [Number.isFinite(fit.card.snap.done.dist) ? `${(fit.card.snap.done.dist / 1609.344).toFixed(1)} mi` : "", Number.isFinite(fit.card.snap.done.secs) ? `${Math.floor(fit.card.snap.done.secs / 3600)}:${pad2(Math.round((fit.card.snap.done.secs % 3600) / 60))}` : ""].filter(Boolean).join(" · ") || "Done" : fit.card.snap.name) : null) : "…", card: fit?.card || null });
  if (f) rows.push({ key: "timetalk", icon: I.phone, tile: "green", label: "A Time to Talk", sub: "A call or a meeting, at a time you choose" });
  // (a row whose card couldn't be had isn't shown; one still on its way says "…")
  return rows.filter((x) => x.sub !== null);
}
function openFromApps(chat) {
  if (!chat || !chatOf(chat)) return;
  const s = S.sheet = { type: "fromapps", chat }; renderSheet();
  const again = () => { if (S.sheet === s) renderSheet(); };
  const f = friend(chat), t = f && thereCard(f);
  if (t?.wait) nowFor([t.wait]).then(again, again);
  const r = chatRide(chat);
  if (f && r && !r.card) rideWeather(chat, r).then(again, again);
  for (const [k, sym] of [["weather", ""], ["fitness", ""], ...chatStocks(chat).map((x) => ["markets", x.sym])]) myCardFor(k, sym).then(again, again);
}
function drawFromApps(s) {
  const rows = fromRows(s);
  return sheetHtml("Add to Your Message", `<div class="group mt-s fromapps">${rows.map((r) => `<button type="button" class="cell has-icon" data-act="fromapp" data-id="${esc(r.key)}"${r.card || ["photo", "gif", "timetalk"].includes(r.key) ? "" : " disabled"}>
      <span class="tile ${r.tile}">${r.icon}</span><span class="ctext"><span>${r.label}</span>${r.sub ? `<span class="csub">${r.sub}</span>` : ""}</span>${chevSm}</button>`).join("")}</div>
    <p class="gfoot">Cards go sealed in your message, as anything you write does.</p>`, { left: { label: "Cancel", act: "close" }, right: null });
}
function fromApp(key) {
  const s = S.sheet; if (s?.type !== "fromapps") return;
  if (key === "photo") { S.sheet = null; renderSheet(); haptic("tick"); return $("#file-lib")?.click(); }
  if (key === "gif") return doAct("gifs");
  if (key === "timetalk") return openTimeTalk(s.chat);
  const r = fromRows(s).find((x) => x.key === key); if (!r?.card) return;
  // (the weather where a friend is: only into that friend's own chat, as canForward says)
  if (r.card.there && !canForward(r.card, { mine: true, to: s.chat })) return toast(esc(`Only for ${first(friend(r.card.ref?.friend)?.name || "the friend it’s about")}.`));
  S.cardWait = { chat: s.chat, card: r.card };
  S.sheet = null; renderSheet(); renderCompose();
  if (S.view === "chat") $ta?.focus();
}

/* ---------- A Time to Talk: a call or a meeting, asked in a letter (one to one) ----------
   The invite carries when: { kind, start, mins, tz, opts } (pigeon/cards.js normWhen); the friend answers by its id,
   ans: { id, a: yes | later | no, start? }. As each goes, its own phone tells the server only the time, the kind and the
   friend (time-offer): the inviter's record, pending, with the invite; the friend's Yes, which agrees both at once, even
   with the inviter's phone shut. Never words. */
const WHEN_LENGTHS = [15, 30, 60, 120];
// the letter answered and its time, if it's one you can answer here (a friend's, one to one)
function whenIn(id) {
  const m = (S.msgs.get(S.chat) || []).find((x) => x.id === id), pp = m && partsOf(S.plain.get(id), false);
  return m && pp?.when && m.from !== S.me.id && !group(S.chat) ? { m, when: pp.when, p: S.plain.get(id) } : null;
}
const whenAnswered = (id) => (S.msgs.get(S.chat) || []).some((x) => x.from === S.me.id && partsOf(S.plain.get(x.id), false)?.ans?.id === id);
async function whenAnswer(id, a, at) {
  const x = whenIn(id), f = friend(S.chat); if (!x || !f || !["yes", "later", "no"].includes(a) || whenAnswered(id)) return;
  const starts = [x.when.start, ...(x.when.opts || [])];
  const start = a === "yes" ? (Number.isFinite(at) && starts.includes(at) ? at : starts.find((v) => v > now())) : null;
  if (a === "yes" && !(start > now())) { toast("That time has passed."); return render(); }
  const ans = a === "yes" ? { id, a, start } : { id, a };
  const again = replyUnsure.get(`when:${id}`);
  const kind = (defaultNext(f) === "now" ? "instant" : oneKind(f)) || again?.kind; if (!kind) return toast("No pigeon free just now.");
  let payload = again?.payload || null;
  try {
    if (!payload) {
      let t = ""; try { t = answerWords(ans, { tz: MY_TZ, now: now() }); } catch (_) {}
      payload = buildPayload({ t: t || { yes: "Yes, that works.", later: "Can we find another time?", no: "Can’t make that time." }[a], ans, q: quoteOf(x.m, x.p) });
    }
    await sendLetter(f.id, payload, { kind, id: again?.id || null });
    replyUnsure.delete(`when:${id}`);
    S.laterOpen = null; haptic("success"); render();
    // (your Yes: your own row, and the inviter's, agreed at this time on the server)
    if (payload.ans?.a === "yes") api("time-offer", { method: "POST", body: timeBody(id, x.when, payload.ans.start, f, { role: "answered" }) }).then(() => toast("In Today, for you both."), () => {});
    sync().catch(() => {});
  } catch (e) {
    if (e.unsure && payload) replyUnsure.set(`when:${id}`, { id: e.id, payload, kind });
    else if (!e.offline || !again) replyUnsure.delete(`when:${id}`);
    toast(esc(e.message || "Couldn’t send it."));
  }
}
// The sheet that asks: a call or to meet, the day and the time (quarter hours), how long, and up to three other times
// that would work too
function openTimeTalk(chat) {
  const f = friend(chat); if (!f || group(chat)) return;
  const t0 = Math.ceil((now() + 30 * MIN) / (15 * MIN)) * 15 * MIN;
  S.sheet = { type: "timetalk", chat, kind: "call", start: t0, mins: 30, opts: [], busy: false, err: "" }; renderSheet();
}
function timeTalkWhen(s) {
  try { return normWhen({ kind: s.kind, start: s.start, mins: s.mins, tz: MY_TZ, opts: s.opts.filter((o) => o !== s.start && o > now()) }); } catch (_) { return null; }
}
function drawTimeTalk(s) {
  const f = friend(s.chat), name = first(f?.name || "your friend"), t = now();
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i); return d.getTime(); });
  const dayOf = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const day = dayOf(s.start), mins = new Date(s.start).getHours() * 60 + new Date(s.start).getMinutes();
  const at = (q) => { const d = new Date(day); d.setHours(Math.floor(q / 60), q % 60, 0, 0); return d.getTime(); };     // (by the clock: a day the clocks change isn't 24 hours)
  const slots = Array.from({ length: 96 }, (_, i) => i * 15).filter((q) => at(q) > t);
  const label = (q) => `${pad2(Math.floor(q / 60))}:${pad2(q % 60)}`;
  const dayName = (d, i) => (i === 0 ? "Today" : i === 1 ? "Tomorrow" : `${DOW_LONG[new Date(d).getDay()]} ${new Date(d).getDate()} ${MON[new Date(d).getMonth()]}`);
  const chip = (act, id, on, text, off) => `<button type="button" class="schip" role="radio" aria-checked="${on}" data-act="${act}" data-id="${esc(id)}"${off ? " disabled" : ""}>${esc(text)}</button>`;
  const w = timeTalkWhen(s);
  let words = ""; try { words = w ? whenWords(w, { tz: MY_TZ, now: t }) : ""; } catch (_) {}
  const others = [30, 60, 120].map((d) => s.start + d * MIN);
  return sheetHtml("A Time to Talk", `
    <div class="schips" role="radiogroup" aria-label="Call or meet">${chip("ttkind", "call", s.kind === "call", "Call", s.busy)}${chip("ttkind", "meet", s.kind === "meet", "Meet", s.busy)}</div>
    <div class="group mt-s">
      <label class="cell"><span class="ctext"><span>Day</span></span><span class="val">${esc(dayName(day, days.indexOf(day)))}</span>${chevSm}
        <select class="overlay" id="f-ttday" aria-label="Day"${s.busy ? " disabled" : ""}>${days.map((d, i) => `<option value="${d}"${d === day ? " selected" : ""}>${esc(dayName(d, i))}</option>`).join("")}</select></label>
      <label class="cell"><span class="ctext"><span>Time</span></span><span class="val">${label(mins)}</span>${chevSm}
        <select class="overlay" id="f-tttime" aria-label="Time"${s.busy ? " disabled" : ""}>${slots.map((q) => `<option value="${q}"${q === mins ? " selected" : ""}>${label(q)}</option>`).join("")}</select></label>
    </div>
    <div class="ghead">How Long</div>
    <div class="schips" role="radiogroup" aria-label="How long">${WHEN_LENGTHS.map((m) => chip("ttmins", String(m), s.mins === m, m < 60 ? `${m} min` : m === 60 ? "1 hour" : `${m / 60} hours`, s.busy)).join("")}</div>
    <div class="ghead">Other Times That Work</div>
    <div class="schips">${others.map((o) => `<button type="button" class="schip" role="checkbox" aria-checked="${s.opts.includes(o)}" data-act="ttopt" data-id="${o}"${s.busy ? " disabled" : ""}>${esc(clockSay(o))}</button>`).join("")}</div>
    ${words ? `<p class="whenlines">${esc(words)}</p>` : ""}
    <div class="sendgo"><button type="button" class="btn wide" data-act="ttsend"${w && !s.busy ? "" : " disabled"}>${s.busy ? "Sending…" : `Ask ${esc(name)}`}</button>
      <p class="gfoot">Only the time and that it’s a ${s.kind === "meet" ? "meeting" : "call"} reach InFlite, to put it in Today for you both once ${esc(name)} says yes. Never what you write.</p>
      ${s.err ? `<p class="gfoot bad" role="alert">${esc(s.err)}</p>` : ""}</div>`, { left: { label: "Cancel", act: "close" }, right: null });
}
async function timeTalkSend() {
  const s = S.sheet; if (s?.type !== "timetalk" || s.busy) return;
  const f = friend(s.chat), w = timeTalkWhen(s); if (!f || !w) return;
  if (!(w.start > now())) { s.err = "That time has passed."; return renderSheet(); }
  // (as a message, at once, whatever the chat's way: a pigeon could land after the time it asks about)
  const kind = "instant";
  s.busy = true; s.err = ""; renderSheet();
  try {
    let t = ""; try { t = whenWords(w, { tz: MY_TZ, now: now() }); } catch (_) {}
    const payload = buildPayload({ t: t || "A time to talk?", when: w });
    const r = await sendLetter(f.id, payload, { kind });
    const id = r.message?.id || r.id;
    // (your own record of it, as it goes: pending, with its other times, until they answer)
    if (id) api("time-offer", { method: "POST", body: timeBody(id, w, w.start, f, { role: "asked", state: "pending", ...(w.opts?.length ? { opts: w.opts.map((o) => [o, o + w.mins * MIN]) } : {}) }) }).catch(() => {});
    if (S.sheet === s) { S.sheet = null; renderSheet(); }
    haptic("success");
    let say = ""; try { say = sentToast([{ name: first(f.name), ok: true }], { instant: kind === "instant" }); } catch (_) {}
    if (say) toast(esc(say));
    if (S.view === "chat") render();
    sync().catch(() => {});
  } catch (e) { if (S.sheet === s) { s.busy = false; s.err = e.message || "Couldn’t send it."; renderSheet(); } }
}
let engineOpen = null;            // (the engine's send sheet on show, till it's sent or shut)

  return {
    renderSheet, tickMap, openSendSheet, sendRows, sendRun, openPassport, openFromApps, shareRender, sheetClick,
    sheetInput, sheetSubmit
  };
}
