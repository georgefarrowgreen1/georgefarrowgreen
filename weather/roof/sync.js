// Weather's account sync under the roof (One roof, spec §7.1, D3): a port of weather/app.js l.3244–3378 (SYNCED, canon,
// mine, snapOf, sameAs, combine, takeUp, inStepSoon/keepInStep/stepOnce, pull, adopt with the hub branch's standIn and
// hubFirst, signedOut), its UI calls replaced by core events. A 401 or { signedIn: false } from /api/weather/me goes
// through `await fw.session.lost()` (true: signed out, confirmed; false: still in → core's "error" event with
// "Couldn’t sync with your account"). No subscription calls (You owns notifications). B0's stub (STUB = true): names
// frozen, signatures WX's (only core.js and weather.js call these).
import * as A from "../account.js";
import { store } from "../data.js";

export const STUB = true;
export const SYNCED = [];
export function canon(v) { return v; }
export function mine() { return { places: [], settings: {} }; }
export function snapOf(data) { return {}; }
export function sameAs(a, b) { return false; }
export function combine(theirs, own, snap, fresh) { return own; }
export function takeUp(data) {}
export function inStepSoon() {}
export async function keepInStep() {}
export async function stepOnce() {}
export async function pull() {}
export async function adopt(r, here = false) {}
export function signedOut() {}
