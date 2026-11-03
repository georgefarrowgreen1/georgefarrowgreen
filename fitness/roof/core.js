// STUB (One roof, stages 2–4, batch j0): the frozen surface of this file (s2/spec.md §4.2, §4.3, §4.7; roof/s24-contracts.md).
// Every export below is final in name and shape; each function throws until its owner ports it. The owner replaces the
// bodies, keeps every export and drops STUB (roofcontract.test skips this file's behaviour cases while STUB is here).
// Owner: FXA. Fitness's engine: fitness/app.js under its own names (§4.3 core row, §4.7): app.js:2806-2813's export
// list less the shell's (IFL HUB signOutHere signedOutHere openAccount settingsView garminView stravaView healthView
// shareView bigMapView upload layOut head setExamples, which become openers or go) and less fxui.js's and idb.js's
// names; plus the engine's own (estimate logFtp inStep readOff sumUp fetchMe lastMe arrive takeUp pull newDay
// todaySnap todayRefresh morningDays forgetCopies); EVENTS; on/emit; start(fw)/stop()/shown(on)/busy();
// saveSettings(patch) (only the keys given). S's shape is app.js:879-889's (less tab); EVENTS final.
import * as W from "../workouts.js";
import * as LOAD from "../load.js";
import * as RH from "../rhythm.js";
import * as PROG from "../progress.js";
import * as UI from "../ui.js";
import * as account from "../account.js";
import * as INV from "../invites.js";
import { idb, keepFile, dropFile } from "./idb.js";
export const STUB = true;
export const S = {
  me: null, ver: 0, dirty: new Set(), inStepWorkouts: [], pulledAt: 0,
  profile: { set: [] }, examples: false, chosen: null, rhythm: null, swaps: {}, feel: {}, mine: [],
  sport: "ride", actSport: "all", formDays: 42,
  own: [], acts: [], garmin: { on: false },
  sums: new Map(), summed: false,
  offers: [],
  times: [],
};
export const EVENTS = Object.freeze(["me", "acts", "plan", "feel", "offers", "times", "settings", "loading", "error"]);
export const store = {
  get(k, d = null) { try { const v = localStorage.getItem("fitness:" + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem("fitness:" + k, JSON.stringify(v)); } catch (_) {} },
  del(k) { try { localStorage.removeItem("fitness:" + k); } catch (_) {} },
};
export const A = {}, BT = {}, C = {}, E = {}, F = {}, G = {}, M = {}, P = {}, R = {};
export const DAY = 864e5;
export let TODAY = "";
export const U = UI;
export const HR_ZONES = [], PLANS = [], SPORTS = {}, WORKOUTS = W.WORKOUTS ?? [], ZONES = [];
export function actsOn() { throw new Error("not yet: actsOn"); }
export function addDays() { throw new Error("not yet: addDays"); }
export function choosePlan() { throw new Error("not yet: choosePlan"); }
export function clock() { throw new Error("not yet: clock"); }
export function dateShort() { throw new Error("not yet: dateShort"); }
export function dayLetter() { throw new Error("not yet: dayLetter"); }
export function dayLong() { throw new Error("not yet: dayLong"); }
export function dayName() { throw new Error("not yet: dayName"); }
export function dayShort() { throw new Error("not yet: dayShort"); }
export function dist() { throw new Error("not yet: dist"); }
export function distNum() { throw new Error("not yet: distNum"); }
export function dur() { throw new Error("not yet: dur"); }
export function eventDay() { throw new Error("not yet: eventDay"); }
export function fileKey() { throw new Error("not yet: fileKey"); }
export function fitness() { throw new Error("not yet: fitness"); }
export function fitnessSeries() { throw new Error("not yet: fitnessSeries"); }
export function flatten() { throw new Error("not yet: flatten"); }
export function formSaid() { throw new Error("not yet: formSaid"); }
export function full() { throw new Error("not yet: full"); }
export function held() { throw new Error("not yet: held"); }
export function hm() { throw new Error("not yet: hm"); }
export function isSet() { throw new Error("not yet: isSet"); }
export function keep() { throw new Error("not yet: keep"); }
export function lightNow() { throw new Error("not yet: lightNow"); }
export function load() { throw new Error("not yet: load"); }
export function missed() { throw new Error("not yet: missed"); }
export function mondayOf() { throw new Error("not yet: mondayOf"); }
export function myPlan() { throw new Error("not yet: myPlan"); }
export function numbers() { throw new Error("not yet: numbers"); }
export function once() { throw new Error("not yet: once"); }
export function pace() { throw new Error("not yet: pace"); }
export function paceFor() { throw new Error("not yet: paceFor"); }
export function pct() { throw new Error("not yet: pct"); }
export function perSecond() { throw new Error("not yet: perSecond"); }
export function plan() { throw new Error("not yet: plan"); }
export function planStart() { throw new Error("not yet: planStart"); }
export function plannedOn() { throw new Error("not yet: plannedOn"); }
export function plural() { throw new Error("not yet: plural"); }
export function record() { throw new Error("not yet: record"); }
export function rh() { throw new Error("not yet: rh"); }
export function rhDay() { throw new Error("not yet: rhDay"); }
export function rhythmOn() { throw new Error("not yet: rhythmOn"); }
export function rng() { throw new Error("not yet: rng"); }
export function routeOf() { throw new Error("not yet: routeOf"); }
export function runSpeed() { throw new Error("not yet: runSpeed"); }
export function saveFile() { throw new Error("not yet: saveFile"); }
export function setActs() { throw new Error("not yet: setActs"); }
export function signed() { throw new Error("not yet: signed"); }
export function speed() { throw new Error("not yet: speed"); }
export function startOfDay() { throw new Error("not yet: startOfDay"); }
export function stepLen() { throw new Error("not yet: stepLen"); }
export function sumOf() { throw new Error("not yet: sumOf"); }
export function summarise() { throw new Error("not yet: summarise"); }
export function swimSpeed() { throw new Error("not yet: swimSpeed"); }
export function timeOf() { throw new Error("not yet: timeOf"); }
export function weekIndex() { throw new Error("not yet: weekIndex"); }
export function weekZip() { throw new Error("not yet: weekZip"); }
export function weeks() { throw new Error("not yet: weeks"); }
export function weight() { throw new Error("not yet: weight"); }
export function wkById() { throw new Error("not yet: wkById"); }
export function workoutById() { throw new Error("not yet: workoutById"); }
export function zoneOf() { throw new Error("not yet: zoneOf"); }
export function wellByDay() { throw new Error("not yet: wellByDay"); }
export function setNumber() { throw new Error("not yet: setNumber"); }
export function resum() { throw new Error("not yet: resum"); }
export function nightsFrom() { throw new Error("not yet: nightsFrom"); }
export function nightsSeries() { throw new Error("not yet: nightsSeries"); }
export function stopped() { throw new Error("not yet: stopped"); }
export function todayRides() { throw new Error("not yet: todayRides"); }
export function estimate() { throw new Error("not yet: estimate"); }
export function logFtp() { throw new Error("not yet: logFtp"); }
export function inStep() { throw new Error("not yet: inStep"); }
export function readOff() { throw new Error("not yet: readOff"); }
export function sumUp() { throw new Error("not yet: sumUp"); }
export function fetchMe() { throw new Error("not yet: fetchMe"); }
export function lastMe() { throw new Error("not yet: lastMe"); }
export function arrive() { throw new Error("not yet: arrive"); }
export function takeUp() { throw new Error("not yet: takeUp"); }
export function pull() { throw new Error("not yet: pull"); }
export function newDay() { throw new Error("not yet: newDay"); }
export function todaySnap() { throw new Error("not yet: todaySnap"); }
export function todayRefresh() { throw new Error("not yet: todayRefresh"); }
export function morningDays() { throw new Error("not yet: morningDays"); }
export function forgetCopies() { throw new Error("not yet: forgetCopies"); }
export function on() { throw new Error("not yet: on"); }
export function emit() { throw new Error("not yet: emit"); }
export function start() { throw new Error("not yet: start"); }
export function stop() { throw new Error("not yet: stop"); }
export function shown() { throw new Error("not yet: shown"); }
export function busy() { throw new Error("not yet: busy"); }
export function saveSettings() { throw new Error("not yet: saveSettings"); }
