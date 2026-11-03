// Weather's state and pipeline under the roof (One roof, spec §7.1, §7.2, D9): a port of weather/app.js's, with the same
// storage keys and shapes (no new key), guarded by roofwxcore.test against app.js's same-named functions. B0's stub
// (STUB = true): the exports, the shape of S and the event names are frozen; WX writes the real port.
//
// S (frozen shape; one object for the module's life, mutated in place, never replaced):
//   settings   wx:settings as loadSettings() returns it (units temp/wind/precip/pressure/clock, commute, tune, solar,
//              layout { order, off }, notify, glass, …: every stored key, drawn or not)
//   f          makeFormat(settings) (format.js), the units formatter the views draw with
//   places     wx:places: [{ name, lat, lon, region?, gps? … }]
//   cur        index of the place shown in places
//   wx         the shaped forecast of the place shown (as app.js's S.wx), or null before the first
//   now        the time the views draw for, in ms (the 60 s tick, only while Weather shows and the page is visible)
//   loading    true while a refresh is under way
//   error      null, or the words of what went wrong ("Couldn’t sync with your account", a fetch error)
//   stale      true when wx is the kept one and a refresh failed (Now: "Offline · from 09:40")
//   acct       the account as Weather's sync knows it ({ id, name, handle, email, emailOk, photoAt, devices, state }) or null
//   ask        the account's answer waiting on "keep this device's places with it?" (app.js S.ask), or null
//   updatedAt  ms of the forecast shown, or null
//
// Events (frozen names): on(evt, fn) → off, fn(detail):
//   "wx"        S.wx changed (detail S.wx)            "place"    the place shown changed (detail { cur, place })
//   "settings"  S.settings changed (detail { keys })  "acct"     S.acct changed (detail S.acct)
//   "loading"   S.loading changed (detail boolean)    "error"    S.error set or cleared (detail S.error)
//   "ask"       S.ask changed (detail S.ask)
//
// Functions (frozen names; signatures as app.js's same-named ones unless said):
//   start(fw) → Promise          first-run place (/api/weather/where, else London's stand-in), kept forecast, refresh,
//                                sync; the module's fw kept for fw.lazy / fw.session.lost
//   stop()                       timers, listeners, sync (unmount)
//   on(evt, fn) → off; emit(evt, detail)      (emit: for sync.js)
//   defaults, CARDS, layoutOf(v), solarOf(v), notifyOf(v), loadSettings()
//   saveSettings(patch) → Promise   starts from the whole stored wx:settings and changes only the keys in patch (glass and
//                                every key the module doesn't draw survive), writes wx:settings, re-makes S.f, syncs with
//                                the account, emits "settings" { keys: Object.keys(patch) }
//   place() → the place shown; addPlace(p), removePlace(i), movePlace(i, by), setPlace(i)
//   go(), refresh()              (data.js load) refresh() is the views' Retry / Refresh
//   tuned(wx), shaped(raw)       the forecast tuned by skill, shaped for the views
//   radarRain                    the next-hour radar-rain blend hook; rainmap.js / radarrain.js only through fw.lazy (D2)
//   snapshotNow(), baseline()
//   locate() → Promise<place | null>   My Location
//   fromLink(query) → Promise    a ?lat=&lon=&name= link: a place near one in wx:places or wx:acct switches; only a place
//                                found in neither asks (confirmPlace); never asks otherwise
//   sectionOf(route) → "now" | "days" | "radar" | "warnings"
//   peek(place) → { temp, code, at } | null    from wx:glances, for the Places rows
//   answerAsk(keep) → Promise    the "ask" card: true keeps this device's places with the account (app.js adopt(r, true));
//                                false leaves them on this device and clears S.ask
import { load, due, extrasDue, searchPlaces, nameOf, store, keepSafe, peek as peekKept, cell, keptWx, hasKept, fetchSolar } from "../data.js";
import { makeFormat, nowWall, dayStart, keyOf, HOUR, DAY } from "../format.js";
import * as I from "../insights.js";
import { codeInfo } from "../codes.js";
import { climateOn } from "../climate.js";
import { nextPhases } from "../sky.js";
import { applyTuning } from "../skill.js";
import { FACES, PITCHES, MAX_ZONES } from "../solar.js";
import { inForce } from "../official.js";
import { oneRain } from "../agree.js";
import * as A from "../account.js";
import * as sync from "./sync.js";

export const STUB = true;
export const EVENTS = Object.freeze(["wx", "place", "settings", "acct", "loading", "error", "ask"]);

export const S = { settings: null, f: null, places: [], cur: 0, wx: null, now: Date.now(), loading: false, error: null, stale: false, acct: null, ask: null, updatedAt: null };

const subs = new Map(EVENTS.map((e) => [e, new Set()]));
export function on(evt, fn) { const s = subs.get(evt); if (!s) throw new Error(`no event ${evt}`); s.add(fn); return () => s.delete(fn); }
export function emit(evt, detail) { for (const fn of subs.get(evt) || []) { try { fn(detail); } catch (_) {} } }

export const defaults = () => ({ temp: "c", wind: "mph", precip: "mm", pressure: "hpa", clock: "24" });
export const CARDS = [];
export function layoutOf(v) { return { order: [], off: [] }; }
export function solarOf(v) { return { on: false, alert: true, zones: [] }; }
export function notifyOf(v) { return {}; }
export function loadSettings() { return { ...defaults() }; }
export async function saveSettings(patch) {}
export function place() { return S.places[S.cur] || null; }
export function addPlace(p) {}
export function removePlace(i) {}
export function movePlace(i, by) {}
export function setPlace(i) {}
export async function go() {}
export async function refresh() {}
export function tuned(wx) { return wx; }
export function shaped(raw) { return raw; }
export const radarRain = null;
export function snapshotNow() { return null; }
export function baseline() { return null; }
export async function locate() { return null; }
export async function fromLink(query) {}
export function sectionOf(route) { return route?.section || "now"; }
export function peek(p) { return null; }
export async function answerAsk(keep) {}
export async function start(fw) { S.settings = loadSettings(); S.f = makeFormat(S.settings); }
export function stop() {}
