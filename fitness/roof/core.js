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
export const A = {};
export const BT = {};
export const C = {};
export const E = {};
export const F = {};
export const G = {};
export const M = {};
export const P = {};
export const R = {};
export const DAY = 864e5;
export let TODAY = "";
export const U = UI;
export const HR_ZONES = [];
export const PLANS = [];
export const SPORTS = {};
export const WORKOUTS = W.WORKOUTS ?? [];
export const ZONES = [];
export function actsOn(...a) { throw new Error("not yet: actsOn"); }
export function addDays(...a) { throw new Error("not yet: addDays"); }
export function choosePlan(...a) { throw new Error("not yet: choosePlan"); }
export function clock(...a) { throw new Error("not yet: clock"); }
export function dateShort(...a) { throw new Error("not yet: dateShort"); }
export function dayLetter(...a) { throw new Error("not yet: dayLetter"); }
export function dayLong(...a) { throw new Error("not yet: dayLong"); }
export function dayName(...a) { throw new Error("not yet: dayName"); }
export function dayShort(...a) { throw new Error("not yet: dayShort"); }
export function dist(...a) { throw new Error("not yet: dist"); }
export function distNum(...a) { throw new Error("not yet: distNum"); }
export function dur(...a) { throw new Error("not yet: dur"); }
export function eventDay(...a) { throw new Error("not yet: eventDay"); }
export function fileKey(...a) { throw new Error("not yet: fileKey"); }
export function fitness(...a) { throw new Error("not yet: fitness"); }
export function fitnessSeries(...a) { throw new Error("not yet: fitnessSeries"); }
export function flatten(...a) { throw new Error("not yet: flatten"); }
export function formSaid(...a) { throw new Error("not yet: formSaid"); }
export function full(...a) { throw new Error("not yet: full"); }
export function held(...a) { throw new Error("not yet: held"); }
export function hm(...a) { throw new Error("not yet: hm"); }
export function isSet(...a) { throw new Error("not yet: isSet"); }
export function keep(...a) { throw new Error("not yet: keep"); }
export function lightNow(...a) { throw new Error("not yet: lightNow"); }
export function load(...a) { throw new Error("not yet: load"); }
export function missed(...a) { throw new Error("not yet: missed"); }
export function mondayOf(...a) { throw new Error("not yet: mondayOf"); }
export function myPlan(...a) { throw new Error("not yet: myPlan"); }
export function numbers(...a) { throw new Error("not yet: numbers"); }
export function once(...a) { throw new Error("not yet: once"); }
export function pace(...a) { throw new Error("not yet: pace"); }
export function paceFor(...a) { throw new Error("not yet: paceFor"); }
export function pct(...a) { throw new Error("not yet: pct"); }
export function perSecond(...a) { throw new Error("not yet: perSecond"); }
export function plan(...a) { throw new Error("not yet: plan"); }
export function planStart(...a) { throw new Error("not yet: planStart"); }
export function plannedOn(...a) { throw new Error("not yet: plannedOn"); }
export function plural(...a) { throw new Error("not yet: plural"); }
export function record(...a) { throw new Error("not yet: record"); }
export function rh(...a) { throw new Error("not yet: rh"); }
export function rhDay(...a) { throw new Error("not yet: rhDay"); }
export function rhythmOn(...a) { throw new Error("not yet: rhythmOn"); }
export function rng(...a) { throw new Error("not yet: rng"); }
export function routeOf(...a) { throw new Error("not yet: routeOf"); }
export function runSpeed(...a) { throw new Error("not yet: runSpeed"); }
export function saveFile(...a) { throw new Error("not yet: saveFile"); }
export function setActs(...a) { throw new Error("not yet: setActs"); }
export function signed(...a) { throw new Error("not yet: signed"); }
export function speed(...a) { throw new Error("not yet: speed"); }
export function startOfDay(...a) { throw new Error("not yet: startOfDay"); }
export function stepLen(...a) { throw new Error("not yet: stepLen"); }
export function sumOf(...a) { throw new Error("not yet: sumOf"); }
export function summarise(...a) { throw new Error("not yet: summarise"); }
export function swimSpeed(...a) { throw new Error("not yet: swimSpeed"); }
export function timeOf(...a) { throw new Error("not yet: timeOf"); }
export function weekIndex(...a) { throw new Error("not yet: weekIndex"); }
export function weekZip(...a) { throw new Error("not yet: weekZip"); }
export function weeks(...a) { throw new Error("not yet: weeks"); }
export function weight(...a) { throw new Error("not yet: weight"); }
export function wkById(...a) { throw new Error("not yet: wkById"); }
export function workoutById(...a) { throw new Error("not yet: workoutById"); }
export function zoneOf(...a) { throw new Error("not yet: zoneOf"); }
export function wellByDay(...a) { throw new Error("not yet: wellByDay"); }
export function setNumber(...a) { throw new Error("not yet: setNumber"); }
export function resum(...a) { throw new Error("not yet: resum"); }
export function nightsFrom(...a) { throw new Error("not yet: nightsFrom"); }
export function nightsSeries(...a) { throw new Error("not yet: nightsSeries"); }
export function stopped(...a) { throw new Error("not yet: stopped"); }
export function todayRides(...a) { throw new Error("not yet: todayRides"); }
export function adopt(...a) { throw new Error("not yet: adopt"); }
export function estimate(...a) { throw new Error("not yet: estimate"); }
export function logFtp(...a) { throw new Error("not yet: logFtp"); }
export function inStep(...a) { throw new Error("not yet: inStep"); }
export function readOff(...a) { throw new Error("not yet: readOff"); }
export function sumUp(...a) { throw new Error("not yet: sumUp"); }
export function fetchMe(...a) { throw new Error("not yet: fetchMe"); }
export function lastMe(...a) { throw new Error("not yet: lastMe"); }
export function arrive(...a) { throw new Error("not yet: arrive"); }
export function takeUp(...a) { throw new Error("not yet: takeUp"); }
export function pull(...a) { throw new Error("not yet: pull"); }
export function newDay(...a) { throw new Error("not yet: newDay"); }
export function todaySnap(...a) { throw new Error("not yet: todaySnap"); }
export function todayRefresh(...a) { throw new Error("not yet: todayRefresh"); }
export function morningDays(...a) { throw new Error("not yet: morningDays"); }
export function forgetCopies(...a) { throw new Error("not yet: forgetCopies"); }
export function on(...a) { throw new Error("not yet: on"); }
export function emit(...a) { throw new Error("not yet: emit"); }
export function start(...a) { throw new Error("not yet: start"); }
export function stop(...a) { throw new Error("not yet: stop"); }
export function shown(...a) { throw new Error("not yet: shown"); }
export function busy(...a) { throw new Error("not yet: busy"); }
export function saveSettings(...a) { throw new Error("not yet: saveSettings"); }
