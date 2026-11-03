// Fitness's engine under the roof (One roof stage 2, §4.3, S2-D2, S2-D4, S2-D11, S2-D21): fitness/app.js's state and
// sync, under app.js's own names (rooffxcore.test compares the same-named functions), with the hub's branch throughout:
// InFlite owns sign-in, notifications and You, so nothing here signs in or out, asks for notifications or writes the
// morning reminder; Today's snapshot (todaySnap) is still written, as the page writes it now.
//
// S (frozen shape; one object for the module's life, mutated in place, never replaced): app.js's S (app.js 879-889)
// less `tab`, plus what app.js set on it as it went (dayAt, agenda, wx, health, strava, offersToday, unitsSet, ask,
// nightsFrom, onboarded, maps, bringing, offline).
// Events (frozen): on(evt, fn) → off; emit(evt, detail):
//   "me" the account's data changed (app.js redraw())   "acts" the activities changed   "plan" the plan or a day changed
//   "feel" the check-in   "offers" plans waiting   "times" Ride At   "settings" your numbers or prefs (detail { keys })
//   "loading" S.loading changed   "error" S.error set or cleared
// start(fw) rebuilds every account field; stop() drops them (RI7): S, meBase, held, S.sums, dataV (moved on, so every
// once() cache is stale), the IndexedDB handle (closed), the reader Worker (terminated), U.metric (back to its default).
// shown(on): newDay() first, then pull() after ≥ 60 s away; the one-minute day check only while shown and visible.
// busy(): a save pending (S.dirty, saveT), a file read or upload in flight, or a hold (hold(key, on): Rhythm's setup).
// F and M (formats.js, map.js) are NET files (C4), never imported statically: F is filled by needF() (fw.lazy), M's
// able/lost/sweep answer at once and routeMap loads map.js through fw.lazy.
import { U, dur } from "../ui.js";
export { U, clock, dateShort, dayLetter, dayLong, dayName, dayShort, dist, distNum, dur, hm, pace, pct, plural, speed, stepLen, timeOf, weight } from "../ui.js";
import { WORKOUTS, PLANS, measure, layOut, DAY, startOfDay, addDays, mondayOf } from "../workouts.js";
import { summarise, fitness, rescale, tssOf, stayingOf } from "../load.js";
import * as A from "../account.js";
import * as R from "../rhythm.js";
import * as G from "../progress.js";
import * as BT from "../besttime.js";
import * as E from "../efforts.js";
import * as C from "../charts.js";
import { todaySwaps } from "../invites.js";
import * as I from "./idb.js";
import { effortFigs } from "./fxcalc.js";

export { A, BT, C, E, G, R };
export { WORKOUTS, PLANS, SPORTS, ZONES, HR_ZONES, zoneOf, flatten, layOut, workoutById, DAY, startOfDay, addDays, mondayOf } from "../workouts.js";
export { summarise, fitness, formSaid, perSecond, rescale, tssOf, stayingOf } from "../load.js";
export const EVENTS = Object.freeze(["me", "acts", "plan", "feel", "offers", "times", "settings", "loading", "error"]);

const subs = new Map(EVENTS.map((e) => [e, new Set()]));
export function on(evt, fn) { const s = subs.get(evt); if (!s) throw new Error(`no event ${evt}`); s.add(fn); return () => s.delete(fn); }
export function emit(evt, detail) { for (const fn of [...(subs.get(evt) || [])]) { try { fn(detail); } catch (e) { console.error(e); } } }
// (app.js's redraw(): the named event; none, "me")
const redraw = (part = "me") => emit(EVENTS.includes(part) ? part : "me");

// ---- kept in this browser (fitness:*, as app.js 817) ----
export const store = {
  get(k, d) { try { const v = localStorage.getItem("fitness:" + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem("fitness:" + k, JSON.stringify(v)); } catch (_) {} },
};
export const idb = I.idb;
export { keepFile, dropFile, tidyFiles } from "./idb.js";

// (what isn't for the views: the page's fw, timers, the reader Worker, holds)
const Q = { fw: null, booted: false, shownOn: false, minute: 0, offs: [], awayAt: 0, holds: new Set(), reading: 0, F: null, M: null, ask: null };
export const fwOf = () => Q.fw;

// today: moved on as a new day comes (newDay)
export let TODAY = startOfDay(Date.now());
const START = { ftp: 200, weight: 75, lthr: 160, maxHr: 182, restHr: 55, runPace: 330, css: 120 };
let dataV = 0;
export const changed = () => { dataV++; };
class Watched extends Map { set(k, v) { dataV++; return super.set(k, v); } delete(k) { dataV++; return super.delete(k); } clear() { dataV++; return super.clear(); } }
export function once(f) { let at = null, v; return () => { const k = `${dataV}@${TODAY}`; if (k !== at) { v = f(); at = k; } return v; }; }
const fresh = () => ({
  me: null, ver: 0, dirty: new Set(), inStepWorkouts: [], pulledAt: 0,
  profile: { ...START, set: [] }, examples: false, chosen: null, rhythm: null, swaps: {}, feel: {}, mine: [],
  sport: "ride", actSport: "all", formDays: 42,
  own: [], acts: [], garmin: { on: false }, strava: { on: false }, health: { on: false },
  sums: new Watched(), summed: false, offers: [], offersToday: false, times: [],
  dayAt: null, agenda: false, wx: null, unitsSet: false, ask: true, nightsFrom: "auto", onboarded: false, maps: "tap",
  bringing: null, offline: null, loading: false, error: null,
});
export const S = fresh();
export const P = () => S.profile;
// (the record as it last came from the account: keys this build doesn't know kept when saving, saveSettings)
let raw = null;

// ---- your record (app.js 891-946) ----
export function adopt(d) {
  changed();
  const ok = (o) => o && typeof o === "object" && !Array.isArray(o), was = numbers();
  raw = ok(d) ? d : null;
  const kept = ok(d?.profile) ? d.profile : null;
  S.profile = { ...START, ...(kept || {}), set: kept ? (Array.isArray(kept.set) ? kept.set : Object.keys(START).filter((k) => k in kept)) : [] };
  S.chosen = ok(d?.plan) && PLANS.some((p) => p.id === d.plan.id) && Number.isFinite(d.plan.start) ? d.plan : null;
  S.rhythm = ok(d?.rhythm) && Array.isArray(d.rhythm.days) ? d.rhythm : null;
  S.swaps = ok(d?.swaps) ? d.swaps : {}; S.feel = ok(d?.feel) ? d.feel : {};
  S.mine = Array.isArray(d?.workouts) ? d.workouts : [];
  S.unitsSet = d?.prefs?.units === "metric" || d?.prefs?.units === "imperial";
  U.metric = S.unitsSet ? d.prefs.units !== "imperial" : !/-(US|LR|MM)\b/i.test(globalThis.navigator?.language || "");
  S.ask = d?.prefs?.ask !== false;
  S.nightsFrom = ["apple", "garmin"].includes(d?.prefs?.nights) ? d.prefs.nights : "auto";
  S.onboarded = d?.prefs?.onboarded === true;
  S.maps = d?.prefs?.maps === "always" ? "always" : "tap";
  S.examples = false;
  setActs();
  if (numbers() !== was) resum();
}
export const numbers = () => [P().ftp, P().lthr, P().runPace, P().css].join("/");
export const record = () => ({ profile: (({ name, ...p }) => p)(S.profile), plan: S.chosen, rhythm: S.rhythm, swaps: S.swaps, feel: S.feel, workouts: S.mine,
  prefs: { ...(S.unitsSet ? { units: U.metric ? "metric" : "imperial" } : {}), examples: S.examples, ...(S.ask === false ? { ask: false } : {}), ...(S.nightsFrom && S.nightsFrom !== "auto" ? { nights: S.nightsFrom } : {}), ...(S.maps === "always" ? { maps: "always" } : {}), ...(S.onboarded ? { onboarded: true } : {}) } });
// (what's saved: record(), over every key of the record as it came that this build doesn't draw, its prefs' too)
const PREFS = ["units", "examples", "ask", "nights", "maps", "onboarded"];
export function saved() {
  const r = record(), prefs = raw?.prefs && typeof raw.prefs === "object" ? Object.fromEntries(Object.entries(raw.prefs).filter(([k]) => !PREFS.includes(k))) : {};
  return { ...(raw || {}), ...r, prefs: { ...prefs, ...r.prefs } };
}
export const isSet = (k) => (P().set || []).includes(k);
export function estimates() {
  const since = addDays(TODAY, -90), rides = S.own.filter((a) => a.start >= since && a.sport === "ride");
  const b20 = Math.max(0, ...rides.map((a) => sumOf(a)?.curve?.[1200] || 0)), hr = Math.max(0, ...S.own.map((a) => sumOf(a)?.maxHr || 0));
  return { ftp: b20 >= 60 ? Math.round(b20 * 0.95) : null, maxHr: hr >= 120 && hr <= 230 ? Math.round(hr) : null, rides: rides.filter((a) => sumOf(a)?.curve?.[1200]).length };
}
export function estimate() {
  const e = estimates(), ch = {};
  if (e.ftp && !isSet("ftp") && Math.abs(e.ftp - P().ftp) >= 3) ch.ftp = e.ftp;
  if (e.maxHr && !isSet("maxHr") && e.maxHr !== P().maxHr) { ch.maxHr = e.maxHr; if (!isSet("lthr")) ch.lthr = Math.round(e.maxHr * 0.9); }
  if (!Object.keys(ch).length) return;
  S.profile = { ...P(), ...ch, ...(ch.ftp ? { ftpLog: logFtp(ch.ftp, 0) } : {}) }; keep("profile"); resum(); redraw("settings");
}
export function logFtp(v, set) {
  const log = (P().ftpLog || []).filter((x) => x[0] !== TODAY);
  return [...log, [TODAY, Math.round(v), set ? 1 : 0]].slice(-120);
}
export function setNumber(k, v) {
  S.profile = { ...P(), [k]: v, set: [...new Set([...(P().set || []), k])], ...(k === "ftp" ? { ftpLog: logFtp(v, 1) } : {}) };
  if (k === "maxHr" && !isSet("lthr")) S.profile.lthr = Math.round(v * 0.9);
  keep("profile");
}
// Settings (S2-D7, RI6): only the keys given change; the whole record as it came is the base, so a key this build
// doesn't know (in prefs or beside them) survives. patch = { prefs?: { units, ask, nights, maps, onboarded, … },
// profile?: { ftp, weight, … } } (profile keys are yours from then on, as setNumber's). → Promise (the save under way)
export function saveSettings(patch = {}) {
  const base = saved(), keys = [];
  const prefs = patch.prefs && typeof patch.prefs === "object" ? patch.prefs : null, prof = patch.profile && typeof patch.profile === "object" ? patch.profile : null;
  const next = { ...base, prefs: { ...base.prefs, ...(prefs || {}) } };
  if (prof) next.profile = { ...base.profile, ...prof, set: [...new Set([...(base.profile?.set || []), ...Object.keys(prof).filter((k) => k in START)])] };
  for (const [k, v] of Object.entries(patch)) if (k !== "prefs" && k !== "profile") next[k] = v;
  const ver = S.ver;
  adopt(next);
  S.ver = ver;
  if (prefs) keys.push("prefs"); if (prof) keys.push("profile");
  for (const k of Object.keys(patch)) if (k !== "prefs" && k !== "profile") keys.push(k);
  keep(...(keys.length ? keys : ["prefs"]));
  emit("settings", { keys });
  return Promise.resolve();
}

// ---- keeping it with the account (app.js 950-979): a moment later, a few changes as one; put together with another
// device's where it moved on meanwhile ----
let saveT = null;
const notSaved = (e) => (e?.slow ? "Fitness is slow to answer: your changes will be saved in a moment" : "You’re offline: your changes will be saved when you’re back");
export function keep(...parts) { changed(); if (!S.me) return; for (const x of parts) S.dirty.add(x); inStep.said = false; clearTimeout(saveT); saveT = setTimeout(inStep, 700); todayRefresh(); }
export async function inStep() {
  clearTimeout(saveT); saveT = null;
  if (!S.me || !S.dirty.size || inStep.busy) return;
  if (!Q.booted) {
    if (S.offline && !inStep.said) { inStep.said = true; toast(notSaved(S.offline), true); }
    saveT = setTimeout(inStep, 700); return;
  }
  inStep.busy = true;
  const dirty = new Set(S.dirty); S.dirty.clear();
  let again = 700;
  const me = S.me.id;
  try {
    let mine = saved(), r = await A.save(S.ver, mine), merged = false;
    for (let i = 0; r.conflict && i < 3; i++) {
      mine = A.merge(r.data, mine, dirty, S.inStepWorkouts); S.inStepWorkouts = A.workoutIds(r.data);
      adopt(mine); merged = true; r = await A.save(r.ver, mine);
    }
    if (S.me?.id !== me) return;
    if (r.conflict) throw new Error("Your changes didn’t save. Try again.");
    S.ver = r.ver; S.inStepWorkouts = A.workoutIds(r.data || mine);
    if (merged) redraw();
  } catch (e) {
    if (S.me?.id !== me) return;
    for (const x of dirty) S.dirty.add(x);
    if (e.status === 401) { inStep.busy = false; return signedOutHere(); }
    toast(e.offline ? notSaved(e) : e.message, true);
    again = e.offline ? 15000 : 30000;
  } finally { inStep.busy = false; }
  if (S.dirty.size && Q.fw) { clearTimeout(saveT); saveT = setTimeout(inStep, again); }
}
export function setActs() {
  changed();
  S.acts = [...S.own].sort((a, b) => b.start - a.start);
}
export const signed = (v) => (Math.round(v) > 0 ? "+" : Math.round(v) < 0 ? "−" : "") + Math.abs(Math.round(v));
export const runSpeed = () => 1000 / P().runPace, swimSpeed = () => 100 / P().css;
export const paceFor = (sport) => (sport === "run" ? runSpeed() : sport === "swim" ? swimSpeed() : 4);
export const allWorkouts = () => [...S.mine, ...WORKOUTS];
export const wkById = (id) => S.mine.find((w) => w.id === id) || R.workoutOf(id, rh()?.targets);

// ---- Rhythm (app.js 991-1038) ----
export const rhythmOn = () => !!S.rhythm && !S.chosen;
const rhFrom = () => [S.wx, S.garmin, S.health];
let rhCache = null;
export function rh() {
  if (!rhythmOn()) return null;
  const key = `${dataV}@${TODAY}|${P().ftp}|${P().runPace}|${P().css}`, from = rhFrom();
  if (rhCache?.key !== key || rhCache.from.some((x, i) => x !== from[i])) {
    const acts = S.own.map((a) => ({ start: a.start, sport: a.sport, indoor: !!a.indoor, sum: sumOf(a) }));
    rhCache = { key, from, v: R.plan({ prefs: S.rhythm, acts, feel: S.feel, swaps: S.swaps, today: TODAY, ftp: P().ftp, paces: { run: runSpeed(), swim: swimSpeed() }, wet: wetAhead(), well: wellByDay() }) };
  }
  return rhCache.v;
}
function wetAhead() {
  const w = BT.wetDays(S.wx?.d), out = {};
  for (const k of Object.keys(w)) { const [y, m, d] = k.split("-").map(Number); out[startOfDay(new Date(y, m - 1, d, 12).getTime())] = true; }
  return out;
}
function wellSource() { return nightsFrom() === "apple" ? S.health?.well || [] : S.garmin?.well || []; }
export function nightsFrom() {
  const month = new Date(TODAY - 30 * DAY).toISOString().slice(0, 10), n = (xs) => (xs || []).filter((r) => r.day >= month).length;
  const a = n(S.health?.well), g = n(S.garmin?.well);
  if (S.nightsFrom === "apple" && S.health?.on) return "apple";
  if (S.nightsFrom === "garmin" && S.garmin?.on) return "garmin";
  return a > g ? "apple" : g ? "garmin" : a ? "apple" : null;
}
export function nightsSeries(days = 60) {
  const w = wellByDay(), out = [];
  for (let d = addDays(TODAY, -(days - 1)); d <= TODAY; d = addDays(d, 1)) { const n = R.nightOf(w, d); out.push({ day: d, hrv: n?.hrv ?? null, lo: n?.lo ?? null, hi: n?.hi ?? null, trend: n?.trend ?? null, rhr: n?.rhr ?? null, sleep: n?.sleep ?? null, score: n?.score ?? null }); }
  return out;
}
export function wellByDay() {
  const out = {};
  for (const r of wellSource()) { const [y, m, d] = r.day.split("-").map(Number); out[startOfDay(new Date(y, m - 1, d, 12).getTime())] = r; }
  return out;
}
export const rhDay = (d) => rh()?.days.find((x) => x.date === d) || null;

// ---- the plan, as days (app.js 1041-1068) ----
export const myPlan = () => S.chosen || null;
export const plan = () => (myPlan() ? PLANS.find((p) => p.id === myPlan().id) : null);
export const planStart = () => myPlan()?.start ?? Infinity;
let weeksCache = null;
export function weeks() {
  const c = myPlan();
  if (!c) return [];
  const key = c.id + c.start;
  if (weeksCache?.key !== key) weeksCache = { key, v: layOut(plan(), c.start) };
  return weeksCache.v;
}
export function choosePlan(c) { S.chosen = { ...c, at: TODAY }; S.swaps = {}; keep("plan", "swaps"); }
export const missed = (day, wk) => (rhythmOn() ? !!rhDay(day)?.missed : wk && day < TODAY && day >= (myPlan()?.at ?? -Infinity) && !actsOn(day).length);
export function plannedOn(day) {
  if (S.swaps[day] !== undefined) return S.swaps[day];
  if (rhythmOn()) { const r = rhDay(day); return r ? r.id : undefined; }
  for (const w of weeks()) for (const d of w.days) if (d.date === day) return d.id;
  return undefined;
}
export const weekIndex = (day) => (myPlan() ? Math.floor((mondayOf(day) - mondayOf(planStart())) / (7 * DAY) + 0.01) : -1);
const byDay = once(() => { const m = new Map(); for (const a of S.acts) { const d = startOfDay(a.start); if (!m.has(d)) m.set(d, []); m.get(d).push(a); } return m; });
export const actsOn = (day) => byDay().get(day) || [];
export const eventDay = () => weeks().at(-1)?.days.at(-1).date ?? null;

// ---- each ride's figures (app.js 1071-1144) ----
const sumKey = () => `${P().ftp}/${P().lthr}`;
export const sumOf = (a) => S.sums.get(a.id);
export const held = new Map();
export const remember = (id, x) => { held.delete(id); held.set(id, x); if (held.size > 6) held.delete(held.keys().next().value); return x; };
export function full(a) { return held.has(a.id) ? held.get(a.id) : null; }
export const fileKey = (a) => `${S.me?.id}:${a.id}`;
// The reader Worker (C5): made through fw.lazy for a batch of files, and ended when the batch ends (RI10: none left
// running in a page that never reloads); where none can be had, or it fails, the file's read here (formats.js, lazy).
let readerW = null, readerN = 0;
const readerWait = new Map();
async function worker() {
  if (readerW || readerW === false) return readerW;
  try {
    const w = await Q.fw.lazy(() => new Worker(new URL("../reader.js", import.meta.url), { type: "module" }));
    w.onmessage = ({ data }) => { const x = readerWait.get(data.id); if (!x) return; readerWait.delete(data.id); data.error ? x.no(Object.assign(new Error(data.error), { read: true })) : x.ok(data.r); };
    w.onerror = () => { if (readerW === w) readerW = false; w.terminate(); for (const [, x] of readerWait) x.no(Object.assign(new Error("worker"), { worker: true })); readerWait.clear(); };
    readerW = w;
  } catch (_) { readerW = false; }
  return readerW;
}
// (the batch over: the Worker ended; the next batch makes another)
export function endReader() { if (readerW) readerW.terminate(); readerW = null; for (const [, x] of readerWait) x.no(Object.assign(new Error("worker"), { worker: true })); readerWait.clear(); }
export const readerOn = () => !!readerW;
export async function readOff(name, bytes) {
  Q.reading++;
  try {
    const w = Q.fw ? await worker() : false;
    if (!w) return (await needF()).readAny(name, bytes);
    const id = ++readerN, u8 = new Uint8Array(bytes).slice();
    return await new Promise((ok, no) => { readerWait.set(id, { ok, no }); w.postMessage({ id, name, bytes: u8, profile: P() }, [u8.buffer]); })
      .catch(async (e) => (e.worker ? (await needF()).readAny(name, bytes) : Promise.reject(e)));
  } finally { Q.reading--; }
}
// Files picked or dropped (fitness.js): each read, its activities and workouts sorted out as app.js importFiles does,
// the Worker ended after the batch. → { acts, workouts, skipped, dupes }, the batch Upload shows
export async function importFiles(files) {
  const got = { acts: [], workouts: [], skipped: [], dupes: 0 };
  Q.reading++;
  try {
    for (const f of files) {
      try {
        const r = await readOff(f.name, await f.arrayBuffer());
        for (const a of r.activities) {
          a.parts = r.activities.filter((y) => y.raw?.bytes === a.raw?.bytes).length;
          if (S.own.some((x) => Math.abs(x.start - a.start) < 60e3) || got.acts.some((x) => x.start === a.start)) { got.dupes++; continue; }
          got.acts.push(a);
        }
        if (r.workouts.length) got.skipped.push(`${f.name}: a workout, not an activity. Fitness takes the rides, runs and swims your devices record.`);
        got.skipped.push(...(r.skipped || []));
      } catch (e) { got.skipped.push(`${f.name}: ${e.message}`); }
    }
  } finally { Q.reading--; endReader(); }
  got.acts.sort((a, b) => b.start - a.start);
  return got;
}
export async function load(a, kept = true) {
  if (full(a)) return full(a);
  const here = await idb.get(fileKey(a)).catch(() => null), bytes = here || await A.fileOf(a.id);
  if (kept) I.keepFile(fileKey(a), here ? null : bytes);
  const r = await readOff(a.file || `activity.${a.type}`, bytes);
  const x = r.activities.find((y) => Math.abs(y.start - a.start) < 2000) || r.activities[0];
  if (!x) throw new Error("That file has no activity in it any more.");
  Object.assign(x, { id: a.id, name: a.name });
  return remember(a.id, x);
}
export function sumUp() { S.summed = true; }
export function resum() {
  for (const a of S.own) S.sums.set(a.id, rescale(a.sum, P(), a.sport));
  store.set("sums", null); sumUp();
}
export const fitnessSeries = once(() => {
  const daily = {};
  for (const a of S.acts) { const t = tssOf(sumOf(a), a.sport); if (t) daily[startOfDay(a.start)] = (daily[startOfDay(a.start)] || 0) + t; }
  const first = Math.min(...S.acts.map((a) => a.start), TODAY - 120 * DAY);
  return fitness(daily, first, TODAY);
});

// ---- the NET files, through fw.lazy (C4, C5) ----
export const F = {};
export async function needF() {
  if (!Q.F) Q.F = Q.fw.lazy((q) => import("../formats.js" + (q || ""))).then((m) => Object.assign(F, m), (e) => { Q.F = null; throw e; });
  return Q.F;
}
let canGl;
export const M = {
  able() {
    if (canGl !== undefined) return canGl;
    try { const gl = Q.fw?.screenEl?.ownerDocument.createElement("canvas").getContext("webgl2"); gl?.getExtension("WEBGL_lose_context")?.loseContext(); return (canGl = !!gl); } catch (_) { return (canGl = false); }
  },
  lost: (el) => !!el && (el.matches("[data-map-gone]") || !!el.querySelector("[data-map-gone]")),
  sweep() { Q.M?.then((m) => m.sweep(), () => {}); },
  async routeMap(el, o) {
    if (!Q.M) Q.M = Q.fw.lazy((q) => import("../map.js" + (q || ""))).catch((e) => { Q.M = null; throw e; });
    return (await Q.M).routeMap(el, o);
  },
};
// a repeatable random number, from a seed (sample.js rng: the module never imports the demo's file)
export function rng(seed) {
  let x = 0;
  for (const ch of String(seed)) x = (x * 31 + ch.charCodeAt(0)) | 0;
  return () => { x |= 0; x = (x + 0x6d2b79f5) | 0; let t = Math.imul(x ^ (x >>> 15), 1 | x); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// the points along a route (a few thousand at most), each its stretch's colour, from the module's own colours (app.js routeOf)
export function routeOf(s, zoneAt) {
  const idx = []; for (let i = 0; i < s.t.length; i++) if (s.lat[i] != null && s.lon[i] != null) idx.push(i);
  const step = Math.max(1, Math.ceil(idx.length / 3000)), use = idx.filter((_, j) => j % step === 0 || j === idx.length - 1);
  const el = Q.fw?.screenEl, css = el ? getComputedStyle(el) : null, col = {};
  const colourOf = (z) => (col[z] ??= css?.getPropertyValue("--" + z).trim() || "#0a84ff");
  return { coords: use.map((i) => [s.lon[i], s.lat[i]]), colours: zoneAt ? use.map((i) => colourOf(zoneAt(i))) : null };
}
export const lightNow = () => (Q.fw?.theme?.() || "light") === "light";

// ---- a file saved: a link to it on a blob, clicked (fitness/app.js saveFile, off the claude.ai viewer) ----
export async function saveFile(name, data) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const root = Q.fw?.screenEl;
  if (!root) return;
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
  const a = root.ownerDocument.createElement("a");
  a.href = url; a.download = name; a.hidden = true;
  root.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  toast(`Saved ${name}`);
}
export async function weekZip(wk) {
  const F2 = await needF(), files = [];
  for (const d of wk.days) {
    const id = S.swaps[d.date] !== undefined ? S.swaps[d.date] : d.id, w = id && id !== "event" ? wkById(id) : null;
    if (w && w.sport !== "strength") files.push({ name: F2.fileName(`${new Date(d.date).toISOString().slice(0, 10)} ${w.name}`, "fit"), data: F2.fitFromWorkout(w, { pace: paceFor(w.sport) }) });
  }
  saveFile(F2.fileName(`Fitness week ${wk.week}`, "zip"), F2.zip(files));
}

// ---- from the account (app.js 2480-2640) ----
export function older() {
  if (older.p) return older.p;
  if (!S.me?.more) return Promise.resolve();
  const p = olderIn(S.me.id);
  older.p = p;
  p.finally(() => { if (older.p === p) older.p = null; });
  return p;
}
async function olderIn(me) {
  try {
    for (;;) {
      const last = S.own.reduce((o, a) => (!o || a.start < o.start || (a.start === o.start && a.id < o.id) ? a : o), null);
      if (!last) break;
      const got = await A.older(last.start, last.id);
      if (S.me?.id !== me) return;
      const have = new Set(S.own.map((a) => a.id)), add = got.acts.filter((a) => !have.has(a.id));
      for (const a of add) { S.own.push({ ...a, sample: false }); S.sums.set(a.id, rescale(a.sum, P(), a.sport)); }
      if (meBase?.id === me) lastMe.put({ ...meBase, acts: [...(meBase.acts || []), ...add], more: got.more });
      // (the batch in hand finished; no other started while Fitness is hidden, S2-D4)
      if (!got.more || !add.length || !Q.shownOn) break;
    }
    if (S.me?.id !== me) return;
    if (Q.shownOn) { S.me.more = false; if (meBase?.id === me) lastMe.put({ ...meBase, more: false }); }
    S.own.sort((a, b) => b.start - a.start); setActs(); redraw("acts");
  } catch (_) {}
}
let meBase = null;
export const lastMe = {
  get: async () => { try { const t = await idb.get("me:last"); return typeof t === "string" ? JSON.parse(t) : null; } catch (_) { return null; } },
  put: (m) => { meBase = m; idb.put("me:last", JSON.stringify(m)).then(() => store.set("meAt", { at: m.at }), () => {}); },
};
export async function fetchMe(base = meBase) {
  let m = await A.me(base?.id && base.at ? base.at : null);
  if (m.signedIn && m.ids) {
    if (base?.id !== m.id) m = await A.me();
    else {
      const still = new Set(m.ids), byId = new Map((base.acts || []).filter((a) => still.has(a.id)).map((a) => [a.id, a]));
      for (const a of m.acts || []) byId.set(a.id, a);
      m = { ...m, acts: [...byId.values()].sort((a, b) => b.start - a.start), ids: undefined, more: !!base.more || m.ids.length > byId.size };
    }
  }
  if (m.signedIn) lastMe.put(m);
  return m;
}
// (kept: the copy on this phone, drawn at once, only when it's the framework's user's (S2-D9); nothing's done for it,
// nothing fetched or kept, till the account says it's the same one)
export function arrive(m, kept = false) {
  S.me = m; S.ver = m.ver || 0; S.pulledAt = Date.now(); S.inStepWorkouts = A.workoutIds(m.data);
  S.offers = !kept && Array.isArray(m.offers) ? m.offers : [];
  S.offersToday = !kept && m.offersToday === true;
  S.times = Array.isArray(m.times) ? m.times : [];
  S.own = (m.acts || []).map((x) => ({ ...x, sample: false }));
  S.sums.clear();
  adopt(m.data);
  for (const a of S.own) S.sums.set(a.id, rescale(a.sum, P(), a.sport));
  sumUp();
  redraw();
  if (kept) return;
  estimate();
  background(m);
}
function background(m) {
  Q.booted = true;
  garminNow(m.garmin); stravaNow(m.strava); S.health = m.health || { on: false };
  older();
  later(() => I.tidyFiles(), 8000);
  todayRefresh();
  todayRides();
  Q.ask?.();
}
export function todayRides() {
  if (!S.me || S.examples || !S.offersToday) return;
  const k = store.get("today-swaps", null), was = k?.id === S.me.id && k.applied && typeof k.applied === "object" ? k.applied : {};
  const r = todaySwaps(S.offers, S.swaps, was, TODAY);
  store.set("today-swaps", { id: S.me.id, applied: r.applied });
  if (!r.set.length && !r.drop.length) return;
  for (const [day, wid] of r.set) S.swaps[day] = wid;
  for (const day of r.drop) delete S.swaps[day];
  keep("swaps");
  redraw("plan");
}
export function takeUp(m) {
  S.me = { ...S.me, name: m.name, handle: m.handle, photoAt: m.photoAt, garmin: m.garmin }; S.ver = m.ver; S.pulledAt = Date.now();
  adopt(S.dirty.size ? A.merge(m.data, record(), S.dirty, S.inStepWorkouts) : m.data); S.inStepWorkouts = A.workoutIds(m.data);
  S.own = (m.acts || []).map((x) => ({ ...x, sample: false }));
  for (const a of S.own) S.sums.set(a.id, rescale(a.sum, P(), a.sport));
  S.health = m.health || { on: false };
  S.offers = Array.isArray(m.offers) ? m.offers : [];
  S.offersToday = m.offersToday === true;
  S.times = Array.isArray(m.times) ? m.times : [];
  S.me.more = m.more;
  todayRides();
  setActs(); redraw(); estimate();
  if (!Q.booted) background(m); else { garminNow(m.garmin); stravaNow(m.strava); older(); }
}
export async function pull() {
  if (!S.me || pull.busy) return;
  pull.busy = true;
  const me = S.me.id;
  try {
    const m = await fetchMe();
    if (S.me?.id !== me) return;
    if (!m.signedIn || m.id !== S.me.id) return signedOutHere();
    takeUp(m);
  } catch (_) {} finally { pull.busy = false; }
}
// A new day (the page left open past midnight, or brought back the next morning): today moves on, everything that goes
// by it worked out afresh, the views drawn again (RI2). → whether it was
export function newDay(now = Date.now()) {
  const t = startOfDay(now);
  if (t === TODAY) return false;
  TODAY = t; changed(); S.dayAt = null;
  if (S.me) { redraw(); todayRefresh(); }
  return true;
}

// ---- InFlite Today's Fitness card (app.js 2087-2189): the coming days as the plan has them, sent when they change ----
const dayStamp = (day) => { const dt = new Date(day); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`; };
const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (_) { return "UTC"; } };
export function morningDays() {
  const out = {};
  for (let i = 0; i < 8; i++) {
    const d = addDays(TODAY, i), id = plannedOn(d);
    if (id === undefined) continue;
    const r = rhDay(d), swapped = S.swaps[d] !== undefined, w = id && id !== "event" ? wkById(id) : null, why = swapped ? "" : r?.why || "";
    out[dayStamp(d)] = id === "event" ? { title: "Event day", body: `${plan()?.name || "Your event"}. Enjoy it.` }
      : w ? { title: `Today: ${w.name}`, body: `${dur(measure(w, paceFor(w.sport)).secs)}, ${!swapped && r?.hard ? "a hard day" : w.kind.toLowerCase()}. ${why}`.trim() }
      : { title: "Rest day", body: `Rest, and let it sink in. ${why}`.trim() };
  }
  return out;
}
export function todaySnap() {
  try {
    const days = {};
    for (let i = 0; i < 8; i++) {
      const d = addDays(TODAY, i), id = plannedOn(d), key = dayStamp(d);
      if (id === undefined) { days[key] = { state: "none" }; continue; }
      const r = rhDay(d), swapped = S.swaps[d] !== undefined, why = swapped ? "" : r?.why || "", w = id && id !== "event" ? wkById(id) : null;
      if (id === "event") { days[key] = { state: "event", name: plan()?.name || "Your event" }; continue; }
      if (!w) { days[key] = { state: "rest", why }; continue; }
      const m = measure(w, paceFor(w.sport)), two = (v) => Math.round((Number(v) || 0) * 100) / 100;
      days[key] = { state: "session", id, sport: w.sport, name: w.name, kind: w.kind, secs: Math.round(m.secs), tss: Math.round(m.tss), hard: !swapped && !!r?.hard, why,
        steps: m.steps.slice(0, 80).map((st) => [Math.round(Number(st.secs) || 0), two(st.from), two(st.to ?? st.from)]) };
    }
    return { tz: tz(), units: U.metric ? "metric" : "imperial", days };
  } catch (e) { console.warn("Fitness: the coming days for Today couldn’t be worked out", e); return null; }
}
const sigOf = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return `${(h >>> 0).toString(36)}.${s.length}`; };
// (sent a moment after Fitness's data loads and after anything that changes the days; only where they've changed since
// last sent from here, or it's a new day; then Today's cards follow (S2-D11, C8: fw.changed()))
export function todayRefresh() {
  if (!Q.booted || !S.me) return;
  todayRefresh.from = rhFrom();
  clearTimeout(todayRefresh.t);
  todayRefresh.t = setTimeout(async () => {
    const snap = S.me ? todaySnap() : null;
    if (!snap) return;
    const day = dayStamp(TODAY), sig = sigOf(`${S.me.id}|${JSON.stringify(snap)}`), was = store.get("today-sent", null);
    if (was?.day === day && was.sig === sig) return;
    try { await A.today(snap); store.set("today-sent", { day, sig }); Q.fw?.changed?.(); } catch (_) {}
  }, 3000);
}
export function todayWatch() {
  const was = todayRefresh.from;
  if (was && rhythmOn() && rhFrom().some((x, i) => x !== was[i])) todayRefresh();
}

// ---- Garmin and Strava: what's waiting, read and kept as an upload is (app.js 1651-1760, 1933) ----
const SRC = {
  garmin: { label: "Garmin", prefix: "g", state: () => S.garmin, set: (g) => { S.garmin = g; }, file: (id) => A.garminFile(id), done: (id) => A.garminDone(id), fetch: (all) => A.garminFetch(true, all),
    read: async (w, bytes) => (await readOff(`garmin-${w.id}.zip`, bytes)).activities },
  strava: { label: "Strava", prefix: "s", state: () => S.strava, set: (g) => { S.strava = g; }, file: (id) => A.stravaFile(id), done: (id) => A.stravaDone(id), fetch: () => A.stravaFetch(true),
    read: async (w, bytes) => (await readOff(`strava-${w.id}.tcx`, await A.gunzip(bytes))).activities.map((a) => Object.assign(a, { ...(w.sport && w.sport !== "other" ? { sport: w.sport } : {}), indoor: !!w.indoor || a.indoor, device: w.device || "Strava" })) },
};
export { SRC };
export const canUnpack = () => { try { new DecompressionStream("deflate-raw"); return true; } catch (_) { return false; } };
export const upping = new Set();
export const near = (start) => S.own.some((x) => Math.abs(x.start - start) < 60e3) || [...upping].some((t) => Math.abs(t - start) < 60e3);
// (a ride's staying power, marked with the version it was worked out to: activities.js staying, XV)
export const XV = 2;
// (an activity's figures, as activities.js works them out: as the Worker did, where it did, else here; its route's
// shape from formats.js, so F must be in first: needF())
export const staying = (a) => ({ xv: XV, ...stayingOf(a) });
const withRoute = (sum, a) => { const r = F.routeShape(a.s); return r ? { ...sum, route: r } : sum; };
export const withFigures = (sum, a) => ({ ...withRoute(sum, a), ...staying(a), ...effortFigs(a, a) });
export const figuresOf = (a) => (a.pre ? { ...a.pre, xv: XV, ...effortFigs(a, a) } : withFigures(summarise(a, P()), a));
export function keptFile(a, sum, parts = 1) {
  if (a.raw.type === "fit" && parts <= 1) return { bytes: a.raw.bytes, name: a.raw.name, type: "fit" };
  const stem = String(a.raw.name || "activity").replace(/\.[A-Za-z0-9]{2,4}$/, "");
  return { bytes: F.fitFromActivity(a, sum), name: `${stem}${parts > 1 ? `-${Math.round(a.start / 1000)}` : ""}.fit`, type: "fit" };
}
// Each activity of a batch kept with your account (app.js upload), one at a time, the button saying how far it's got.
// What follows (the sheet closed, Activities shown, the one ride opened) is the caller's: then({ done, failed }).
export async function upload(got, btn, then = null) {
  btn.disabled = true;
  const done = [], failed = [], me = S.me?.id;
  Q.reading++;
  try {
    await needF();
    for (const [i, a] of got.acts.entries()) {
      if (S.me?.id !== me) return;
      btn.lastChild.textContent = got.acts.length > 1 ? `Uploading ${i + 1} of ${got.acts.length}…` : "Uploading…";
      if (near(a.start)) continue;
      let sum, k, meta;
      upping.add(a.start);
      try {
        sum = figuresOf(a); k = keptFile(a, sum, a.parts || 1);
        meta = { id: `i${a.start}`, start: a.start, sport: a.sport, indoor: a.indoor, name: a.name, device: a.device, file: k.name, type: k.type, sum };
        const r = await A.upload(meta, k.name, await A.gzip(k.bytes));
        if (r.already) continue;
      } catch (e) {
        if (e.status === 401) return signedOutHere();
        failed.push({ a, said: `${a.name}: ${e.message}` }); continue;
      } finally { upping.delete(a.start); }
      const entry = { ...meta, gz: A.canGzip(), sample: false };
      S.own.push(entry); S.sums.set(entry.id, sum); done.push(entry);
      remember(entry.id, Object.assign(a, { id: entry.id }));
      I.keepFile(fileKey(entry), k.bytes);
    }
  } catch (e) { failed.push(...got.acts.filter((a) => !done.some((d) => d.start === a.start)).map((a) => ({ a, said: `${a.name}: ${e.message || "It didn’t upload"}` }))); }
  finally { Q.reading--; }
  if (got.workouts?.length) { S.mine.unshift(...got.workouts); keep("workouts"); }
  setActs(); estimate();
  if (failed.length) { btn.disabled = false; btn.lastChild.textContent = "Try again"; got.acts = failed.map((f) => f.a); toast(failed[0].said, true, 6000); redraw("acts"); then?.({ done, failed }); return; }
  redraw("acts");
  const n = done.length, nw = got.workouts?.length || 0;
  const added = [n && `${n} ${n === 1 ? "activity" : "activities"}`, nw && `${nw} ${nw === 1 ? "workout" : "workouts"}`].filter(Boolean).join(" and ");
  toast(added ? `${added} added` : "Here already");
  then?.({ done, failed });
}
export async function fromSource(src, { quiet = false } = {}) {
  const c = SRC[src], waiting = c.state()?.waiting || [];
  if (!waiting.length || fromSource[src] || !Q.fw) return 0;
  if (!canUnpack()) {
    if (!fromSource.told) { fromSource.told = true; toast(`Your activities from ${c.label} are waiting: this browser can’t open them. Update it (iOS 16.4 or later), or open Fitness on another device.`, true, 8000); }
    return 0;
  }
  fromSource[src] = true;
  const added = [], left = [], me = S.me?.id;
  Q.reading++;
  try {
    await needF();
    for (const w of waiting) {
      if (S.me?.id !== me) break;
      let acts;
      try { acts = await c.read(w, await c.file(w.id)); }
      catch (e) { if (e.status === 401) return signedOutHere(); if (e.offline || e.status >= 500) break; acts = []; }
      let kept = 0;
      for (const [k, a] of acts.entries()) {
        if (near(a.start)) continue;
        if (w.name && acts.length === 1) a.name = w.name;
        let sum, f, meta, r;
        upping.add(a.start);
        try {
          sum = figuresOf(a); f = keptFile(a, sum, acts.length);
          meta = { id: k ? `${c.prefix}${w.id}-${k + 1}` : `${c.prefix}${w.id}`, start: a.start, sport: a.sport, indoor: a.indoor, name: a.name, device: a.device, file: f.name, type: f.type, sum };
          r = await A.upload(meta, f.name, await A.gzip(f.bytes));
        } catch (e) {
          if (e.status === 401) return signedOutHere();
          if (e.status === 400 || (!e.status && !e.offline)) { left.push(`${a.name}, from ${c.label}: ${e.message}`); continue; }
          kept = -1; break;
        } finally { upping.delete(a.start); }
        if (r.already) continue;
        const entry = { ...meta, gz: A.canGzip(), sample: false };
        S.own.push(entry); S.sums.set(entry.id, sum); added.push(entry); kept++;
        remember(entry.id, Object.assign(a, { id: entry.id }));
        if (!S.bringing) I.keepFile(fileKey(entry), f.bytes);
      }
      if (kept < 0) break;
      if (!kept) await c.done(w.id).catch(() => {});
      c.state().waiting = c.state().waiting.filter((x) => x.id !== w.id);
      if (!Q.shownOn) break;
    }
  } catch (_) {} finally { fromSource[src] = false; Q.reading--; endReader(); }
  if (added.length) { setActs(); estimate(); redraw("acts"); if (!quiet) toast(added.length === 1 ? `${added[0].name}, from ${c.label}` : `${added.length} activities from ${c.label}`); }
  else if (left.length) toast(left[0], true, 6000);
  return added.length;
}
export async function bringIn({ all = false, src = "garmin" } = {}) {
  const c = SRC[src];
  if (bringIn.busy) return 0;
  bringIn.busy = true;
  S.bringing = { n: 0, all, src, at: c.state()?.backAt || null }; redraw("acts");
  const more = async () => { const k = await fromSource(src, { quiet: true }); if (S.bringing) { S.bringing.n += k; S.bringing.at = c.state()?.backAt || S.bringing.at; } redraw("acts"); return k; };
  let n = 0;
  try {
    if (src === "strava" && !all) { try { c.set(await c.fetch(all)); } catch (_) {} }
    n = await more();
    for (let i = 0; i < (all ? 400 : 16) && (c.state().more || (all && c.state().back)) && Q.shownOn; i++) {
      const was = c.state().backAt;
      try { c.set(await c.fetch(all)); } catch (_) { break; }
      const k = await more(); n += k;
      const g = c.state();
      if (g.said || !g.ok || !canUnpack() || (!k && !g.more && g.backAt === was)) break;
    }
  } finally { bringIn.busy = false; }
  S.bringing = null; redraw("acts"); estimate();
  const going = all && c.state()?.back, acts = (k) => `${k} ${k === 1 ? "activity" : "activities"}`;
  toast(all ? (going ? `${n ? `${acts(n)} from your ${c.label} history so far. ` : ""}The rest come in by themselves` : n ? `${acts(n)} from your ${c.label} history` : `Your ${c.label} history is all here`) : n ? `Connected: ${acts(n)} from the last six months` : `Connected to ${src === "garmin" ? "Garmin Connect" : "Strava"}`);
  return n;
}
export function garminNow(g) {
  if (!g?.on) { S.garmin = g || { on: false }; return; }
  S.garmin = g;
  if (g.back && g.ok) { bringIn({ all: true }); return; }
  fromSource("garmin").then(() => (Date.now() - (S.garmin.last || 0) > 2 * 60e3 ? A.garminFetch().then((n) => { S.garmin = n; todayWatch(); return fromSource("garmin"); }) : null)).catch(() => {});
}
export function stravaNow(g) {
  S.strava = g || { on: false };
  if (!g?.on) return;
  if (g.back && g.ok) { if (!bringIn.busy) bringIn({ all: true, src: "strava" }); return; }
  fromSource("strava").then(() => (Date.now() - (S.strava.last || 0) > 15 * 60e3 ? A.stravaFetch().then((n) => { S.strava = n; return fromSource("strava"); }) : null)).catch(() => {});
}
export const stopped = () => (S.garmin?.on && !S.garmin.ok ? "Garmin" : S.strava?.on && !S.strava.ok ? "Strava" : null);

// ---- signing out (found out: a 401 the framework confirms) and this phone's copies ----
export async function signedOutHere() {
  const fw = Q.fw;
  if (!fw) return;
  let out = false;
  try { out = await fw.session.lost(); } catch (_) {}
  if (out && Q.fw === fw) stop();
}
export function forgetCopies() {
  for (const k of ["meAt", "files", "hk", "today-sent", "today-swaps"]) store.set(k, null);
  return idb.clear().catch(() => {});
}
function forgetFiles() {
  for (const k of I.filesUsed()) idb.del(k).catch(() => {});
  for (const k of ["files", "hk", "today-sent"]) store.set(k, null);
}

// ---- the module's life ----
// (the framework's toast: one at a time, announced; a bad one says so in its words, as app.js's do)
const toast = (text, bad = false, ms) => { Q.fw?.toast?.(text); };
const timers = new Set();
const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (Q.fw) fn(); }, ms); timers.add(t); return t; };
// (the check-in, asked once a day as Fitness opens or comes back: todayview.js hands it in)
export const setAsk = (fn) => { Q.ask = fn; };
export function hold(key, v) { if (v) Q.holds.add(key); else Q.holds.delete(key); }
export const busy = () => !!(S.dirty.size || saveT || inStep.busy || Q.reading || upping.size || Q.holds.size);
export function setLoading(v) { if (S.loading !== v) { S.loading = v; emit("loading", v); } }
export function setError(v) { if (S.error !== v) { S.error = v; emit("error", v); } }

export function start(fw) {
  if (Q.fw) stop();
  Q.fw = fw;
  TODAY = startOfDay(Date.now());
  Q.offs.push(fw.on?.("visible", () => { if (Q.shownOn) opened(); }) || (() => {}));
}
// (the first show: the kept copy (the framework's user's only), then the account)
async function boot() {
  const fw = Q.fw, uid = fw.session?.user?.id ?? null;
  setLoading(true);
  let kept = null, early = false;
  try {
    kept = await lastMe.get();
    if (Q.fw !== fw) return;
    const now = fetchMe(kept);
    now.catch(() => {});
    if (kept?.signedIn && Array.isArray(kept.acts) && uid != null && kept.id === uid) { early = true; meBase = kept; arrive(kept, true); }
    const m = await now;
    if (Q.fw !== fw) return;
    if (!early && kept?.signedIn && !m.signedIn) forgetCopies();
    else if (!early && kept?.signedIn && kept.id !== m.id) forgetFiles();
    if (!m.signedIn) { setLoading(false); return signedOutHere(); }
    if (early && m.id !== kept.id) { stopData(); arrive(m); }
    else if (early) takeUp(m); else arrive(m);
    setError(null);
  } catch (e) {
    if (Q.fw !== fw) return;
    if (early) { S.offline = e.offline ? e : null; if (S.offline) toast(notSaved(e), true, 5000); }
    else setError(e.slow ? "Fitness is taking too long to answer. Try again in a moment." : e.offline ? "You’re offline. Fitness will be here when you’re back online." : e.message || "Fitness didn’t answer");
  } finally { if (Q.fw === fw) setLoading(false); }
}
// (Try Again from the error state)
export function retry() { if (!Q.fw) return; if (S.me) return pull(); Q.booted = false; boot(); }
function opened() {
  newDay();
  if (S.me && Date.now() - S.pulledAt > 60e3) pull();
  else if (!S.me && S.error && !S.loading) boot();
  if (S.me) Q.ask?.();
}
export function shown(v) {
  if (!Q.fw) return;
  if (v) {
    const first = !Q.shownOn && !Q.started;
    Q.shownOn = true;
    if (first) { Q.started = true; newDay(); boot(); } else opened();
    clearInterval(Q.minute);
    Q.minute = setInterval(() => { if (Q.fw?.visible?.() !== false) { newDay(); todayWatch(); } }, 60e3);
  } else {
    Q.shownOn = false;
    clearInterval(Q.minute); Q.minute = 0;
    // (a save waiting its 700 ms goes now: S2-D21)
    if (saveT) inStep();
  }
}
// (every account field back to nothing: S in place, the caches, the Worker)
function stopData() {
  clearTimeout(saveT); saveT = null;
  clearTimeout(todayRefresh.t); todayRefresh.from = null;
  const f = fresh();
  for (const k of Object.keys(S)) if (!(k in f)) delete S[k];
  Object.assign(S, f);
  held.clear(); upping.clear(); raw = null; meBase = null; rhCache = null; weeksCache = null; older.p = null;
  changed();
  U.metric = true;
  endReader();
  Q.booted = false;
}
export function stop() {
  for (const t of timers) clearTimeout(t);
  timers.clear();
  clearInterval(Q.minute); Q.minute = 0;
  for (const off of Q.offs.splice(0)) { try { off(); } catch (_) {} }
  stopData();
  I.close();
  Q.fw = null; Q.shownOn = false; Q.started = false; Q.holds.clear(); Q.reading = 0; Q.F = null; Q.M = null; Q.ask = null;
  inStep.busy = false; pull.busy = false; bringIn.busy = false; fromSource.garmin = fromSource.strava = false;
}
