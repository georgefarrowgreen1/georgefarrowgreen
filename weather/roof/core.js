import { requestLocation } from "../location.js";
// Weather's state and pipeline under the roof (One roof, spec §7.1, §7.2, D9): a port of weather/app.js's, with the same
// storage keys and shapes (no new key), guarded by roofwxcore.test against app.js's same-named functions. The hub's
// branch of app.js throughout (InFlite owns sign-in, notifications and You): stand-ins never go to the account, nothing
// is subscribed, nothing signs in.
//
// S (frozen shape; one object for the module's life, mutated in place, never replaced):
//   settings   wx:settings as loadSettings() returns it (units temp/wind/precip/pressure/clock, commute, tune, solar,
//              layout { order, off }, notify, glass, …: every stored key, drawn or not)
//   f          makeFormat(settings) (format.js), the units formatter the views draw with
//   places     wx:places: [{ name, lat, lon, region?, gps? … }]
//   cur        index of the place shown in places (a place only looked at, from a link, isn't in places: place())
//   wx         the shaped forecast of the place shown (as app.js's S.wx), or null before the first
//   now        the time the views draw for, in ms (the 60 s tick, only while Weather shows and the page is visible)
//   loading    true while a refresh is under way
//   error      null, or the words of what went wrong: FORECAST_BUSY / FORECAST_FAILED (the forecast: Now's Retry), or
//              SYNC_ERROR ("Couldn’t sync with your account": no Retry, it clears itself once a sync goes through)
//   stale      true when wx is the kept one and a refresh failed (Now: "Offline · from 09:40")
//   acct       the account as Weather's sync knows it ({ id, name, handle, email, emailOk, photoAt, devices, state }) or null
//   ask        the account's answer waiting on "keep this device's places with it?" (app.js S.ask), or null
//   updatedAt  ms of the forecast shown (wx.fetchedAt), or null
//
// Events (frozen names): on(evt, fn) → off, fn(detail):
//   "wx"        S.wx changed, or the minute moved on (detail S.wx)    "place"  the place shown changed (detail { cur, place })
//   "settings"  S.settings changed (detail { keys })                   "acct"   S.acct changed (detail S.acct)
//   "loading"   S.loading changed (detail boolean)                     "error"  S.error set or cleared (detail S.error)
//   "ask"       S.ask changed (detail S.ask)
//
// Functions (frozen names; signatures as app.js's same-named ones unless said):
//   start(fw)                    the stored state read, the module's fw kept (fw.lazy, fw.session.lost, fw.toast, visibility);
//                                the first-run place, the kept forecast, the refresh and the account's sync start on the
//                                first shown(true) (so a link's place, show()'s fromLink, is the first visit's place)
//   stop()                       timers, listeners, sync (unmount)
//   on(evt, fn) → off; emit(evt, detail)      (emit: for sync.js)
//   defaults, CARDS, layoutOf(v), solarOf(v), notifyOf(v), loadSettings() → S.settings (also sets S.f)
//   saveSettings(patch) → Promise   starts from the whole stored wx:settings and changes only the keys in patch (glass and
//                                every key the module doesn't draw survive), writes wx:settings, re-makes S.f, syncs with
//                                the account, emits "settings" { keys: Object.keys(patch) }
//   place() → the place shown; addPlace(p, makeCurrent = true) → its index; removePlace(i), movePlace(i, by) (by ±1),
//   setPlace(i) (shows it and refreshes)
//   go(force), refresh()         (data.js load) refresh() is the views' Retry / Refresh (a forced go)
//   tuned(wx), shaped(raw)       the forecast tuned by skill, shaped for the views
//   radarRain(p)                 the next-hour radar-rain blend; rainmap.js / radarrain.js only through fw.lazy (D2), and
//                                never while the page is stale (D21: the model's own rain until the reload)
//   snapshotNow(wx), baseline(wx, now)
//   locate(quiet) → Promise<place | null>   My Location
//   fromLink(query, { confirm: ask }) → Promise<"switch" | "add" | "look" | null>   a ?lat=&lon=&name= link: a place near one in
//                                wx:places or in the account's (wx:acct) switches, and a first visit takes it; only a place
//                                found in neither asks (ask(p) → "add" | "look" | null; weather.js passes confirmPlace)
//   sectionOf(route) → "now" | "days" | "radar" | "warnings"
//   peek(place) → { temp, code, isDay, offset, hi, lo, at? } | null   the place shown as the page has it, else data.js peek,
//                                else wx:glances (for the Places rows)
//   answerAsk(keep) → Promise    the "ask" card: true keeps this device's places with the account (app.js adopt(r, true));
//                                false leaves them on this device and clears S.ask (not asked again this page)
// Added by WX (for weather.js, places.js and the views): shown(on), busy(), glanceAll(), look(p), headerLine(),
//   SYNC_ERROR, FORECAST_BUSY, FORECAST_FAILED, pinHue(temp), skyOf(code, isDay); setError(v), syncError(on) (sync.js).
import { load, due, nameOf, store, keepSafe, peek as peekKept, cell, hasKept } from "../data.js";
import { makeFormat, nowWall, keyOf, HOUR, DAY } from "../format.js";
import * as I from "../insights.js";
import { codeInfo, label } from "../codes.js";
import { applyTuning, steady, refine, daysSaid, saidBefore } from "../skill.js";
import { FACES, PITCHES, MAX_ZONES } from "../solar.js";
import { inForce } from "../official.js";
import { oneRain } from "../agree.js";
import * as A from "../account.js";
import * as sync from "./sync.js";

export const EVENTS = Object.freeze(["wx", "place", "settings", "acct", "loading", "error", "ask"]);

export const S = { settings: null, f: null, places: [], cur: 0, wx: null, now: Date.now(), loading: false, error: null, stale: false, acct: null, ask: null, updatedAt: null };

export const SYNC_ERROR = "Couldn’t sync with your account";
export const FORECAST_BUSY = "The forecast service is busy";
export const FORECAST_FAILED = "Couldn’t get the forecast";

const subs = new Map(EVENTS.map((e) => [e, new Set()]));
export function on(evt, fn) { const s = subs.get(evt); if (!s) throw new Error(`no event ${evt}`); s.add(fn); return () => s.delete(fn); }
export function emit(evt, detail) { for (const fn of [...(subs.get(evt) || [])]) { try { fn(detail); } catch (e) { console.error(e); } } }

// (what isn't for the views: the forecast as it came, the radar's say, timers, the page's fw)
const P = { fw: null, base: null, rain: null, rains: new Map(), seq: 0, tries: 0, again: 0, paintT: 0, painted: 0, tick: 0, shown: false, booted: false,
  look: null, fcErr: null, syncErr: false, offs: [], checkedAt: 0, pulledAt: 0, glancedAt: 0, glances: new Map(), rainLib: null, locating: false, declined: null, toldFull: false, heroKept: "", heroAt: 0 };
export const fwOf = () => P.fw;

/* ---------- settings (app.js 817-884) ---------- */
// the units to start with, whatever the phone's language: °C, mph, mm, hPa and the 24-hour clock (Settings → Units)
export const defaults = () => ({ temp: "c", wind: "mph", precip: "mm", pressure: "hpa", clock: "24" });
// Now's cards, in their usual order, each with its name in Settings (Arrange Now); daily and radar are sections here,
// kept in the list so their places and off-state survive (wxsettings.js doesn't list them)
export const CARDS = [["nowcast", "Next 4 hours"], ["solar", "Solar"], ["hourly", "Next 48 hours"], ["right-now", "Right now"], ["daily", "16-day forecast"], ["radar", "Rain radar"],
  ["insights-card", "Highlights"], ["windows", "Best times"], ["accuracy", "Forecast accuracy"], ["climate", "This time of year"]];
// as you've arranged them: { order (every card, any the app has gained since put where it usually goes), off }
export function layoutOf(v) {
  const ids = CARDS.map((c) => c[0]), o = v && typeof v === "object" ? v : {};
  const order = [...new Set((Array.isArray(o.order) ? o.order : []).filter((k) => ids.includes(k)))];
  for (const [i, k] of ids.entries()) if (!order.includes(k)) order.splice(Math.min(i, order.length), 0, k);
  return { order, off: [...new Set((Array.isArray(o.off) ? o.off : []).filter((k) => ids.includes(k)))] };
}
// Settings › Solar: { on, alert, zones: [{ id, name, lat, lon, place, faces, pitch, kw }] }; from before zones, one roof
export function solarOf(v) {
  const o = v && typeof v === "object" && !Array.isArray(v) ? v : {};
  const zoneOf = (z, i) => (z && Number.isFinite(z.lat) && Number.isFinite(z.lon) ? {
    id: String(z.id || `z${i + 1}`).slice(0, 24), name: String(z.name || "Roof").trim().slice(0, 24) || "Roof", lat: z.lat, lon: z.lon, place: String(z.place || "").slice(0, 60),
    faces: FACES.some((x) => x[0] === z.faces) ? z.faces : "S", pitch: PITCHES.includes(z.pitch) ? z.pitch : 35, kw: Number.isFinite(z.kw) && z.kw > 0 && z.kw <= 50 ? z.kw : null } : null);
  const zones = (Array.isArray(o.zones) ? o.zones : Number.isFinite(o.lat) ? [{ name: "Roof", lat: o.lat, lon: o.lon, place: o.name, faces: o.faces, pitch: o.pitch }] : [])
    .map(zoneOf).filter(Boolean).slice(0, MAX_ZONES);
  return { on: !!o.on && zones.length > 0, alert: o.alert !== false, zones };
}
// Which notifications for which places (configured in You now; carried unchanged through sync, the device fields kept)
export function notifyOf(n) {
  n = n && typeof n === "object" && !Array.isArray(n) ? n : {};
  const spot = (p) => (p && Number.isFinite(p.lat) && Number.isFinite(p.lon) ? { lat: p.lat, lon: p.lon, name: String(p.name || ""), ...(p.gps ? { gps: true } : {}) } : null);
  const at = /^\d\d:\d\d$/.test(n.briefAt || "") ? n.briefAt : "07:00", keep = { endpoint: n.endpoint || null, devId: n.devId || null, syncedAt: n.syncedAt || 0, ...(n.off ? { off: true } : {}) };
  const email = { warn: !!n.email?.warn, brief: !!n.email?.brief };
  if (!Array.isArray(n.places)) { const p = spot(n.place); return { places: p && (n.rain || n.warn) ? [{ ...p, rain: !!n.rain, warn: !!n.warn }] : [], brief: p && n.brief ? p : null, briefAt: at, email, ...keep }; }
  const places = n.places.map((x) => { const p = spot(x); return p && (x.rain || x.warn) ? { ...p, rain: !!x.rain, warn: !!x.warn } : null; }).filter(Boolean).slice(0, A.MAX_NOTIFY);
  return { places, brief: n.brief && typeof n.brief === "object" ? spot(n.brief) : null, briefAt: at, email, ...keep };
}
// (only values the app knows: a damaged or out-of-date one falls back to the default; every other key kept as it is)
function settingsFrom(k) {
  const d = {
    ...defaults(), commute: { on: false, am: "08:00", pm: "17:30" }, tune: true, solar: { on: false, alert: true, zones: [] },
    activities: I.DEFAULT_ACTIVITIES.map((a) => ({ ...a })), extras: { laundry: true, stars: true, sunset: true },
  };
  const o = k && typeof k === "object" && !Array.isArray(k) ? k : {};
  const one = (v, ok, dv) => (ok.includes(v) ? v : dv), obj = (v, dv) => ({ ...dv, ...(v && typeof v === "object" && !Array.isArray(v) ? v : {}) });
  return { ...d, ...o,
    temp: one(o.temp, ["c", "f"], d.temp), wind: one(o.wind, ["mph", "kmh", "ms", "kn"], d.wind), precip: one(o.precip, ["mm", "in"], d.precip),
    pressure: one(o.pressure, ["hpa", "inhg", "mmhg"], d.pressure), clock: one(o.clock, ["12", "24"], d.clock), tune: o.tune !== false,
    glass: one(o.glass, ["clear", "standard", "tinted"], "standard"),
    commute: obj(o.commute, d.commute), extras: obj(o.extras, d.extras), solar: solarOf(o.solar), notify: notifyOf(o.notify), layout: layoutOf(o.layout),
    activities: Array.isArray(o.activities) ? o.activities.filter((a) => a && typeof a === "object" && typeof a.name === "string") : d.activities,
  };
}
export function loadSettings() {
  S.settings = settingsFrom(store.get("wx:settings"));
  S.f = makeFormat(S.settings);
  return S.settings;
}
// (your settings and places: room made if the phone's storage is full (data.js keepSafe); if there's still none, said once)
const sayIfFull = (ok) => { if (!ok && !P.toldFull) { P.toldFull = true; P.fw?.toast?.("Couldn’t save that: this device’s storage for websites is full."); } };
const storedSettings = () => { const k = store.get("wx:settings"); return k && typeof k === "object" && !Array.isArray(k) ? k : {}; };
export async function saveSettings(patch) {
  const keys = Object.keys(patch || {});
  const next = { ...storedSettings(), ...(patch || {}) };
  const ok = keepSafe("wx:settings", next);
  sayIfFull(ok);
  S.settings = settingsFrom(ok ? store.get("wx:settings") : next);
  S.f = makeFormat(S.settings);
  emit("settings", { keys });
  // (the units or the tuning change what's drawn)
  if (P.base) render();
  sync.inStepSoon();
}

/* ---------- places ---------- */
const r3 = (v) => Math.round(v * 1e3) / 1e3;
const savePlaces = () => { sayIfFull(keepSafe("wx:places", S.places) && keepSafe("wx:cur", S.cur)); sync.inStepSoon(); };
export const placesSaved = savePlaces;
export function place() { return P.look || S.places[S.cur] || null; }
const placeChanged = () => emit("place", { cur: S.cur, place: place() });
// (a place chosen, or found by the phone: a stand-in (the rough guess from the connection, London) goes; one already
// there (by 0.02°, or My Location) is updated; My Location first, as on iOS)
export function addPlace(p, makeCurrent = true) {
  const near = (a) => Math.abs(a.lat - p.lat) < 0.02 && Math.abs(a.lon - p.lon) < 0.02;
  const stand = (x) => x.approx || x.standin;
  if (!stand(p) && S.places.some((x) => stand(x) && !near(x))) {
    const was = S.places[S.cur];
    S.places = S.places.filter((x) => !stand(x) || near(x));
    S.cur = Math.max(0, S.places.indexOf(was));
  }
  let i = p.gps ? S.places.findIndex((x) => x.gps) : S.places.findIndex((x) => !x.gps && near(x));
  if (i >= 0) { S.places[i] = { ...S.places[i], ...p }; if (!p.approx) delete S.places[i].approx; if (!p.standin) delete S.places[i].standin; }
  else if (p.gps) { S.places.unshift(p); i = 0; if (!makeCurrent) S.cur++; }
  else { S.places.push(p); i = S.places.length - 1; }
  if (makeCurrent) { S.cur = i; P.look = null; }
  savePlaces();
  return i;
}
// the place shown: that one (its forecast asked for)
export function setPlace(i) {
  if (!S.places[i]) return;
  const was = place();
  S.cur = i; P.look = null;
  savePlaces();
  if (was !== place()) placeChanged();
  go();
}
// a place from a link, only looked at ("Just Look"): shown, never saved; any setPlace ends it
export function look(p) { P.look = { ...p }; placeChanged(); go(); }
export const looking = () => !!P.look;
// a saved place taken away (never the last): the one on show still on show; its notifications go with it
export function removePlace(i) {
  const p = S.places[i];
  if (!p || S.places.length < 2) return;
  // (the saved one current, and the one on show: the same, unless a link's place is only being looked at)
  const saved = S.places[S.cur], was = place(), n = S.settings.notify, k = A.nkeyOf(p);
  S.places.splice(i, 1);
  S.cur = Math.max(0, S.places.indexOf(saved));
  savePlaces();
  if (n.places.some((e) => A.nkeyOf(e) === k) || (n.brief && A.nkeyOf(n.brief) === k)) {
    saveSettings({ notify: { ...storedSettings().notify, ...n, places: n.places.filter((e) => A.nkeyOf(e) !== k), brief: n.brief && A.nkeyOf(n.brief) === k ? null : n.brief } });
  }
  if (was !== place()) { placeChanged(); go(); }
}
// a saved place moved up (by -1) or down (by 1) the list; the one on show still on show
export function movePlace(i, by) {
  const j = i + by;
  if (!S.places[i] || !S.places[j] || i === j) return false;
  const was = S.places[S.cur];
  [S.places[i], S.places[j]] = [S.places[j], S.places[i]];
  S.cur = Math.max(0, S.places.indexOf(was));
  savePlaces();
  return true;
}

/* ---------- loading (app.js 993-1167) ---------- */
const words = (e) => (e && (e.status === 429 || e.status >= 500) ? FORECAST_BUSY : FORECAST_FAILED);
function setLoading(v) { if (S.loading !== v) { S.loading = v; emit("loading", v); } }
// S.error is one value: the forecast's error while it lasts (setError: FORECAST_BUSY / FORECAST_FAILED, or null once
// it's in), else SYNC_ERROR while the account's sync is failing (syncError(on), from sync.js; setError(SYNC_ERROR) is
// the same as syncError(true)), so neither hides or clears the other
function showError() { const v = P.fcErr || (P.syncErr ? SYNC_ERROR : null); if (S.error !== v) { S.error = v; emit("error", v); } }
export function setError(v) { if (v === SYNC_ERROR) P.syncErr = true; else P.fcErr = v || null; showError(); }
export function syncError(on) { P.syncErr = !!on; showError(); }
const runOut = (wx) => I.hoursFrom(wx, nowWall(wx.place.offset), 6).length < 6;
export async function go(force = false) {
  const p = place(); if (!p) return;
  const my = ++P.seq;
  setLoading(true);
  setError(null);
  // (a new place far off: the old forecast let go of, its page drawn afresh; a step within ~25 km, as My Location moves
  // with you, keeps everything on screen while the new forecast comes, so nothing blanks)
  const far = !S.wx || Math.abs(S.wx.place.lat - p.lat) > 0.25 || Math.abs(S.wx.place.lon - p.lon) > 0.35;
  const moved = far && (!S.wx || cell(S.wx.place.lat, S.wx.place.lon) !== cell(p.lat, p.lon));
  if (moved) { P.base = null; S.wx = null; S.updatedAt = null; S.stale = false; P.rain = rainOf(cell(p.lat, p.lon)); clearTimeout(P.paintT); P.painted = 0; emit("wx", null); }
  try {
    const loading = load(p, (wx, how) => {
      if (my !== P.seq || !wx) return;
      if (how.error) setError(words(how.error)); else if (!how.partial) P.tries = 0;
      if (runOut(wx)) { P.base = null; render(); return; }
      P.base = wx; S.stale = !!how.stale;
      if (!how.stale && !how.partial) snapshotNow(wx);
      paint();
    }, { force });
    radarRain(p, my);
    await loading;
  } catch (e) {
    if (my === P.seq) {
      setError(words(e));
      // (the forecast service busy, or not answering: asked again by itself in a while, a few times)
      clearTimeout(P.again); P.again = 0;
      if ((e?.status === 429 || e?.status >= 500) && (P.tries = (P.tries || 0) + 1) <= 4) P.again = setTimeout(() => { P.again = 0; const q = place(); if (q && cell(q.lat, q.lon) === cell(p.lat, p.lon) && !S.wx) go(); }, P.tries > 1 ? 60e3 : 30e3);
      render();
    }
  } finally {
    if (my === P.seq) setLoading(false);
  }
}
export const refresh = () => go(true);
// the views drawn from what's in: twice a second at most, parts coming in close together drawn together
function paint() {
  clearTimeout(P.paintT);
  const wait = (P.painted || 0) + 500 - Date.now();
  if (wait > 0) { P.paintT = setTimeout(paint, wait); return; }
  P.painted = Date.now();
  render();
}
function render() {
  if (P.base && runOut(P.base)) P.base = null;
  S.wx = P.base ? shaped(P.base) : null;
  S.updatedAt = S.wx?.fetchedAt ?? null;
  S.now = Date.now();
  if (S.wx) keepHero(S.wx);
  emit("wx", S.wx);
}
// Fresh whenever it's opened (shown, brought back to the front) and every minute while it's on screen: whatever's due
// asked for again (data.js due), the radar's say after 5 minutes; the account after a minute away
function opened() {
  if (!P.shown || !P.fw?.visible?.()) return;
  if (Date.now() - P.pulledAt > 60e3) { P.pulledAt = Date.now(); sync.pull().catch(() => {}); }
  refreshLocation();
  check(true);
  tickOn();
}
function check(opening = false) {
  const p = place();
  if (!p || S.loading || (!opening && Date.now() - P.checkedAt < 50e3) || Date.now() - P.checkedAt < 5e3) return;
  P.checkedAt = Date.now();
  if (!S.wx || due(p)) { go(); return; }
  if (!P.rain || Date.now() - P.rain.asked > 5 * 60e3) radarRain(p, P.seq);
}
function tickOn() {
  if (P.tick || !P.shown) return;
  P.tick = setInterval(() => {
    if (!P.shown || !P.fw?.visible?.()) { tickOff(); return; }
    refreshLocation();
    check();
    if (P.base) render();
  }, 60e3);
}
function tickOff() { clearInterval(P.tick); P.tick = 0; }
// Weather's screen shown (weather.js show) or left (hide): the tick and the checks only while it shows (§7.3); the first
// time, the first-run place, the kept forecast, the refresh and the account
export function shown(on) {
  P.shown = !!on;
  if (!on) { tickOff(); return; }
  if (!P.booted) { P.booted = true; boot(); return; }
  opened();
}
async function boot() {
  const owner = P.fw;
  P.checkedAt = Date.now();
  if (!S.places.length) {
    const found = await locate(true);
    if (P.fw !== owner) return;
    if (!P.shown || !P.fw?.visible?.()) { P.booted = false; return; }
    if (!found) await firstPlace();
    if (P.fw !== owner) return;
  } else locate(true);
  if (!S.wx && !S.loading) go();
  // Find the name if it could not be found when saved.
  const unnamed = S.places.find((x) => x.gps && x.name === "My Location");
  if (unnamed) nameOf(unnamed.lat, unnamed.lon, { live: false }).then((n) => { if (n && unnamed.name === "My Location") { Object.assign(unnamed, n); savePlaces(); placeChanged(); } }).catch(() => {});
  P.pulledAt = Date.now();
  sync.pull().catch(() => {});
  tickOn();
}
function refreshLocation() {
  if (P.shown && P.fw?.visible?.() && S.places.some((p) => p.gps || p.approx || p.standin)) locate(true);
}
// If location is unavailable: roughly where you are from the connection, then London as a stand-in.
async function firstPlace() {
  try {
    const r = await fetch("/api/weather/where", { signal: AbortSignal.timeout(4000) });
    const j = r.ok ? await r.json() : null;
    if (j && Number.isFinite(j.lat) && !S.places.length) addPlace({ name: j.name, region: j.region || "", lat: j.lat, lon: j.lon, approx: true });
  } catch (_) {}
  if (!S.places.length) addPlace({ name: "London", region: "England, United Kingdom", lat: 51.5072, lon: -0.1276, standin: true });
  placeChanged();
}

// the forecast with its highs and lows tuned to how each model has done here (skill.js), steadied, refined
const tunedOnly = (wx, today) => (S.settings.tune !== false && wx.skill?.skill ? applyTuning(wx, wx.skill.skill, today) : wx);
export function tuned(wx) {
  if (!wx) return wx;
  const now = nowWall(wx.place.offset), today = keyOf(now);
  const s = steady(tunedOnly(wx, today), saidBefore(store.get(saidKey(wx)), Date.now()), today);
  return S.settings.tune !== false && s.skill?.local ? refine(s, s.skill.local, now) : s;
}
const saidKey = (wx) => `wx:said:${cell(wx.place.lat, wx.place.lon)}`;
function keepSaid(wx) {
  const at = Date.now(), k = saidKey(wx), list = (store.get(k) || []).filter((x) => at - x.at < 3 * DAY);
  const today = keyOf(nowWall(wx.place.offset)), days = daysSaid(tunedOnly(wx, today), today);
  if (list.length && at - list[list.length - 1].from < 3 * HOUR) list[list.length - 1] = { ...list[list.length - 1], at, days };
  else list.push({ at, from: at, days });
  store.set(k, list);
}
// and its next couple of hours' rain led by the radar, where it sees (rainmap.js blend, once it's loaded), while its
// frame is recent; and its rain one story throughout (agree.js)
export function shaped(wx, r = P.rain) {
  const t = tuned(wx);
  if (!t) return t;
  const blend = P.rainLib?.blend;
  const led = blend && r && r.id === cell(t.place.lat, t.place.lon) && Date.now() - r.at <= 40 * 60e3 ? { ...t, minutely: blend(t.minutely, r.steps, r.at, t.place.offset) } : t;
  return oneRain(led, nowWall(led.place.offset));
}
const rainOf = (id) => { const r = P.rains.get(id); return r && Date.now() - r.asked < 5 * 60e3 ? r : null; };
// The radar's say on the next couple of hours here (radarrain.js rainAt), asked for with each forecast, and the views
// drawn again with it (unless the place has changed meanwhile). Its files only through fw.lazy (D2, D21)
export async function radarRain(p = place(), my = P.seq) {
  const fw = P.fw;
  if (!p || !fw) return;
  if (!P.rainLib) {
    if (fw.stale?.()) return;
    try {
      const [rr, rm] = await Promise.all([fw.lazy(() => import("../radarrain.js")), fw.lazy(() => import("../rainmap.js"))]);
      P.rainLib = { rainAt: rr.rainAt, blend: rm.blend };
    } catch (_) { return; }
  }
  const r = await P.rainLib.rainAt(p.lat, p.lon).catch(() => null);
  if (my !== P.seq) return;
  const was = P.rain, id = cell(p.lat, p.lon), said = r ? JSON.stringify([r.at, r.steps]) : "";
  P.rain = { ...r, id, asked: Date.now(), said };
  P.rains.set(id, P.rain);
  if (P.base && !(was?.id === id && was.said === said)) paint();
}
// "since you last looked": a few snapshots of the days ahead as the page showed them, per place
export function snapshotNow(wx) {
  keepSaid(wx);
  wx = shaped(wx);
  const k = `wx:snap2:${cell(wx.place.lat, wx.place.lon)}`, now = nowWall(wx.place.offset), list = store.get(k) || [];
  if (!list.length || now - list[list.length - 1].at >= HOUR) { list.push(I.snapshot(wx, now)); store.set(k, list.slice(-6)); }
}
export function baseline(wx, now) {
  if (!wx) return null;
  const list = store.get(`wx:snap2:${cell(wx.place.lat, wx.place.lon)}`) || [];
  return list.filter((s) => s.at <= now - 2 * HOUR && s.at >= now - 3 * DAY).pop() || null;
}

/* ---------- the hero kept (wx:hero, for standalone's boot.js, as keepHero has it) ---------- */
const SKY_TOP = { "clear-day": "#1f5fae", "partly-day": "#2c5f99", "cloudy-day": "#43566c", "rain-day": "#303f52", storm: "#1c2130", "snow-day": "#4f6580", fog: "#59626e",
  "clear-night": "#070d22", "partly-night": "#0c1428", "cloudy-night": "#151b27", "rain-night": "#10151f", "snow-night": "#1b2335", dusk: "#1f2b55", dawn: "#24376a" };
// a sky for some weather, as Weather's own page names them (app.js skyOf)
export const skyOf = (code, day) => { const kind = codeInfo(code).kind; return kind === "storm" ? "storm" : ["rain", "showers", "drizzle", "sleet"].includes(kind) ? (day ? "rain-day" : "rain-night") : kind === "snow" ? (day ? "snow-day" : "snow-night") : kind === "fog" ? "fog" : kind === "clear" ? (day ? "clear-day" : "clear-night") : kind === "partly" ? (day ? "partly-day" : "partly-night") : day ? "cloudy-day" : "cloudy-night"; };
function keepHero(wx) {
  try {
    const now = nowWall(wx.place.offset), c = wx.current || I.hourAt(wx, now), d = I.dayOf(wx, now), f = S.f;
    if (!c) return;
    const sky = skyOf(c.code, c.isDay);
    const v = JSON.stringify({ lat: wx.place.lat, lon: wx.place.lon, sky, top: SKY_TOP[sky] || "#2b5d96", temp: f.temp(c.temp), v: c.temp, cond: label(c.code, c.isDay),
      hl: d ? `H ${f.temp(d.tmax)}  L ${f.temp(d.tmin)}  ·  Feels like ${f.temp(c.feels)}` : `Feels like ${f.temp(c.feels)}`, brief: I.headline(wx, now, f) || "" });
    if (v === P.heroKept && Date.now() - P.heroAt < 10 * 60e3) return;
    P.heroKept = v; P.heroAt = Date.now();
    store.set("wx:hero", { ...JSON.parse(v), at: P.heroAt });
  } catch (_) {}
}

/* ---------- the header's line ---------- */
// "14° · Rain from 15:00", "14° · Light rain now", "14° · Cloudy": the temperature now and the rain story (insights.js
// nowcast), else what it's doing; "" before the first forecast
export function headerLine(wx = S.wx) {
  if (!wx) return "";
  const now = nowWall(wx.place.offset), c = wx.current || I.hourAt(wx, now), f = S.f;
  if (!c) return "";
  const t = f.temp(c.temp);
  let n = null;
  try { n = I.nowcast(wx, now, f); } catch (_) {}
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  if (n?.now) return `${t} · ${cap(n.kind)} now`;
  if (n && n.startsAt) return `${t} · ${cap(n.kind)} from ${f.time(n.startsAt)}`;
  return `${t} · ${label(c.code, c.isDay)}`;
}

/* ---------- places at a glance (app.js 2094-2148) ---------- */
// the warmth of a temperature as Apple's Weather map colours it (the map's bubbles)
const PIN_HUES = [[-10, [110, 90, 210]], [0, [60, 120, 220]], [10, [58, 112, 196]], [15, [40, 145, 160]], [20, [80, 160, 70]], [25, [222, 148, 40]], [30, [222, 88, 50]], [35, [196, 40, 50]]];
export const pinHue = (temp) => {
  const at = PIN_HUES.findIndex(([t]) => t >= temp), k = Math.max(1, at < 0 ? PIN_HUES.length - 1 : at), [t0, a] = PIN_HUES[k - 1], [t1, b] = PIN_HUES[k];
  const f = t1 > t0 ? Math.min(1, Math.max(0, (temp - t0) / (t1 - t0))) : 0;
  return `rgb(${a.map((v, j) => Math.round(v + (b[j] - v) * f)).join(",")})`;
};
const onPage = (wx) => { const now = nowWall(wx.place.offset), c = wx.current || I.hourAt(wx, now), d = I.dayOf(wx, now); return c && { temp: c.temp, code: c.code, isDay: c.isDay, offset: wx.place.offset, hi: d?.tmax ?? null, lo: d?.tmin ?? null }; };
const glance = (q) => {
  const id = cell(q.lat, q.lon), had = P.glances.get(id);
  if (had && Date.now() - had.at < 60e3) return had.k;
  const k = peekKept(q) || store.get("wx:glances")?.[id] || null;
  P.glances.set(id, { at: Date.now(), k });
  return k;
};
export function peek(p) {
  if (!p || !Number.isFinite(p.lat)) return null;
  const cur = place();
  if (S.wx && cur && cell(S.wx.place.lat, S.wx.place.lon) === cell(p.lat, p.lon)) return onPage(S.wx);
  return glance(p);
}
// The saved places with no forecast kept here: their weather now, all in one request, once a half hour at most, kept
// (wx:glances) → true when there's something new to draw
export async function glanceAll() {
  const want = S.places.filter((q) => !peekKept(q));
  if (!want.length || Date.now() - P.glancedAt < 30 * 60e3) return false;
  P.glancedAt = Date.now();
  try {
    const q = new URLSearchParams({ latitude: want.map((x) => x.lat).join(","), longitude: want.map((x) => x.lon).join(","), current: "temperature_2m,weather_code,is_day", timezone: "auto" });
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return false;
    const j = await r.json(), list = Array.isArray(j) ? j : [j], kept = store.get("wx:glances") || {};
    want.forEach((x, i) => { const c = list[i]?.current; if (c && Number.isFinite(c.temperature_2m)) kept[cell(x.lat, x.lon)] = { temp: c.temperature_2m, code: c.weather_code, isDay: c.is_day === 1, offset: list[i].utc_offset_seconds || 0, hi: null, lo: null, at: Date.now() }; });
    const saved = new Set(S.places.map((x) => cell(x.lat, x.lon)));
    for (const id of Object.keys(kept)) if (!saved.has(id)) delete kept[id];
    store.set("wx:glances", kept); P.glances.clear();
    return true;
  } catch (_) { return false; }
}

/* ---------- My Location (app.js 2924-2980) ---------- */
// → the place found, or null (quiet: as it's opened, said nothing if it can't be found)
export async function locate(quiet = false) {
  const geo = globalThis.navigator?.geolocation;
  if (!geo) { if (!quiet) P.fw?.toast?.("Location isn’t available in this browser."); return null; }
  if (P.locating) return null;
  const owner = P.fw;
  P.locating = true;
  try {
    const pos = await requestLocation(quiet);
    if (!pos || P.fw !== owner || !P.shown || !P.fw?.visible?.()) return null;
    // (to three decimal places, about 100 m: all a forecast needs, and nothing nearer sent anywhere, or kept)
    const lat = r3(pos.coords.latitude), lon = r3(pos.coords.longitude), before = S.places.find((x) => x.gps);
    const was = S.places.find((x) => x.gps && x.name !== "My Location" && Math.abs(x.lat - lat) < 0.009 && Math.abs(x.lon - lon) < 0.009 / Math.max(0.2, Math.cos(lat * Math.PI / 180)));
    const mine = !quiet || !S.places.length || !!(place()?.gps || place()?.approx || place()?.standin), same = quiet && before && cell(before.lat, before.lon) === cell(lat, lon);
    // (My Location's notifications, if it has any, follow it)
    const named = (name) => {
      const n = S.settings.notify, moved = (q) => q?.gps && (cell(q.lat, q.lon) !== cell(lat, lon) || q.name !== name);
      if (![...n.places, n.brief].some(moved)) return;
      const to = (q) => (moved(q) ? { ...q, lat, lon, name } : q);
      saveSettings({ notify: { ...storedSettings().notify, ...n, places: n.places.map(to), brief: n.brief ? to(n.brief) : null } });
    };
    const as = was || (same ? before : null);
    const i = addPlace({ name: as?.name || "My Location", region: as?.region || "", lat, lon, gps: true }, false), here = S.places[i];
    if (mine && !same) setPlace(S.places.indexOf(here));
    else { if (mine) { S.cur = i; P.look = null; savePlaces(); } placeChanged(); }
    if (was) named(was.name);
    else nameOf(lat, lon).then((nm) => {
      const p = S.places.find((x) => x.gps);
      if (!p || p.lat !== lat || p.lon !== lon) return;
      if (nm) { Object.assign(p, nm); savePlaces(); placeChanged(); }
      named(p.name);
    }).catch(() => {});
    return here;
  } catch (e) {
    if (!quiet) P.fw?.toast?.(e?.code === 1 ? "Location is turned off for this site. You can search for a place instead." : "Couldn’t find your location just now.");
    return null;
  } finally { P.locating = false; }
}

/* ---------- a link's place (app.js start, 913-931) ---------- */
const SANE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g;
export function linkPlace(query) {
  const q = new URLSearchParams(String(query || "")), lat = parseFloat(q.get("lat")), lon = parseFloat(q.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const name = (q.get("name") || "").replace(SANE, "").trim().slice(0, 60);
  return { name: name || `${lat.toFixed(2)}, ${lon.toFixed(2)}`, region: "", lat, lon };
}
export async function fromLink(query, { confirm: ask } = {}) {
  const p = linkPlace(query);
  if (!p) return null;
  const { lat, lon } = p, n = S.settings.notify;
  const near = (x, d = 0.02) => Math.abs(x.lat - lat) < d && Math.abs(x.lon - lon) < d;
  let have = S.places.findIndex((x) => !x.gps && near(x));
  // (a notification for My Location, one of this device's own: My Location, if it's still roughly there, within 0.2°)
  if (have < 0 && [...n.places, n.brief].some((e) => e?.gps && near(e))) have = S.places.findIndex((x) => x.gps && near(x, 0.2));
  if (have >= 0) { setPlace(have); return "switch"; }
  // (one of the account's places, not yet taken up here: it's yours already, so never asked about)
  const acct = store.get("wx:acct"), theirs = Array.isArray(acct?.snap?.places) ? acct.snap.places : [];
  const inAcct = theirs.some((k) => { const [a, b] = String(k).split(",").map(Number); return Number.isFinite(a) && Number.isFinite(b) && near({ lat: a, lon: b }); });
  // (a first visit takes it as its place)
  if (inAcct || !S.places.length) { setPlace(addPlace(p, false)); return inAcct ? "switch" : "add"; }
  // (a list of your own is added to only if you say so, so a link can't slip a place into it)
  const a = typeof ask === "function" ? await ask(p) : null;
  if (a === "add") setPlace(addPlace(p, false));
  else if (a === "look") look(p);
  return a ?? null;
}
const IDS = ["now", "days", "radar", "warnings"];
export function sectionOf(route) { const s = route?.section; return IDS.includes(s) ? s : "now"; }

/* ---------- the account (sync.js) ---------- */
export async function answerAsk(keep) {
  const r = S.ask;
  if (!r) return;
  if (keep) { await sync.adopt(r, true); return; }
  P.declined = r.id || r.handle || true;
  S.ask = null; emit("ask", null);
}
export const declined = (r) => !!P.declined && (P.declined === true || P.declined === (r?.id || r?.handle));
export const busy = () => P.locating || sync.busy();
// (warnings in force for the place shown: the Warnings section's badge)
export const warningsInForce = (wx = S.wx) => (wx ? inForce(wx.official).length : 0);
// (the place shown has nothing kept and no forecast yet)
export const nothingYet = () => !S.wx && !(place() && hasKept(place()));

/* ---------- start and stop ---------- */
export function start(fw) {
  P.fw = fw;
  loadSettings();
  S.places = (store.get("wx:places") || []).filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon));
  // (My Location as kept by a version from before it was kept to three decimal places, its notifications' too)
  const fine = [...S.places, ...S.settings.notify.places, S.settings.notify.brief].filter((x) => x?.gps && (r3(x.lat) !== x.lat || r3(x.lon) !== x.lon));
  for (const x of fine) { x.lat = r3(x.lat); x.lon = r3(x.lon); }
  if (fine.length) { store.set("wx:places", S.places); store.set("wx:settings", { ...storedSettings(), notify: S.settings.notify }); }
  const cur = store.get("wx:cur");
  S.cur = Math.min(Number.isInteger(cur) && cur > 0 ? cur : 0, Math.max(0, S.places.length - 1));
  // My Location first (lists kept from before it was), still showing the same place
  const g = S.places.findIndex((x) => x.gps);
  if (g > 0) { const was = place(); S.places.unshift(...S.places.splice(g, 1)); S.cur = S.places.indexOf(was); savePlaces(); }
  // your account: signed in, as it was last time, till the server says
  const k = store.get("wx:acct");
  S.acct = k?.handle ? { ...sync.profileOf(k), devices: k.devices || [], state: "ok" } : null;
  S.ask = null; S.wx = null; S.error = null; P.fcErr = null; P.syncErr = false; S.stale = false; S.loading = false; S.updatedAt = null; S.now = Date.now();
  P.offs.push(fw.on?.("visible", opened) || (() => {}), fw.on?.("hidden", tickOff) || (() => {}));
}
export function stop() {
  tickOff();
  clearTimeout(P.paintT); clearTimeout(P.again);
  for (const off of P.offs.splice(0)) { try { off(); } catch (_) {} }
  sync.stop();
  P.seq++;
  Object.assign(P, { fw: null, base: null, shown: false, booted: false, look: null, fcErr: null, syncErr: false, painted: 0, tries: 0, again: 0, paintT: 0, locating: false });
}
