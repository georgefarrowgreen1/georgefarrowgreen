// Weather's account sync under the roof (One roof, spec §7.1, D3): a port of weather/app.js l.3244–3378 (SYNCED, canon,
// mine, snapOf, sameAs, combine, takeUp, inStepSoon/keepInStep/stepOnce, pull, adopt with the hub branch's standIn and
// hubFirst, signedOut), its UI calls replaced by core events. A 401 or { signedIn: false } from /api/weather/me goes
// through `await fw.session.lost()` (true: signed out, confirmed → this page's copy of the account let go; false: still
// in → core's "error" event with "Couldn’t sync with your account", and a toast). No subscription calls (You owns
// notifications). Signed in to InFlite, your saved places, settings and notification choices are kept with the account,
// in step on every device, versioned (wx:acct: the version last in step and what was kept then, snap), so a change made
// meanwhile, here or on another device, is put together with the other's rather than either being lost.
import * as A from "../account.js";
import { store } from "../data.js";
import * as core from "./core.js";

export const SYNCED = ["temp", "wind", "precip", "pressure", "clock", "glass", "tune", "commute", "extras", "activities", "layout", "solar"];
// (an object's keys in order, so the same settings always read the same)
export const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
// (at InFlite, the place Weather opened on as a stand-in, the rough guess from the connection or London, is never written
// to an account; nor My Location, each device's own)
const standIn = (p) => !!(p.approx || p.standin);
export function mine() {
  const { S } = core;
  return {
    places: S.places.filter((p) => !p.gps && !standIn(p)).map((p) => ({ name: p.name, region: p.region || "", lat: p.lat, lon: p.lon })),
    settings: Object.fromEntries(SYNCED.map((k) => [k, S.settings[k]])),
    notify: { places: S.settings.notify.places, brief: S.settings.notify.brief, briefAt: S.settings.notify.briefAt, email: S.settings.notify.email },
  };
}
export const snapOf = (d) => ({ places: (d.places || []).map(A.keyOf), settings: canon(d.settings || null), notify: d.notify || null });
export const sameAs = (now, snap) => canon(now.places.map(A.keyOf)) === canon(snap.places) && canon(now.settings) === snap.settings && !A.notifyChanges(now.notify, snap.notify).length;
// the account's and this device's put together (first: just signed in, so all of this device's is new to the account)
export function combine(theirs, now, snap, first = false) {
  const tn = theirs.notify || { places: [], brief: null }, theirSettings = theirs.settings && Object.keys(theirs.settings).length ? theirs.settings : null;
  return {
    places: A.mergePlaces(theirs.places || [], now.places, first ? [] : snap.places),
    settings: first ? theirSettings || now.settings : A.mergeSettings(theirSettings, now.settings, JSON.parse(snap.settings || "null"), SYNCED, canon),
    notify: A.mergeNotify(tn, now.notify, first ? A.notifyChanges(now.notify, tn).filter((k) => k === "brief" ? !tn.brief : !tn.places.some((q) => A.nkeyOf(q) === k)) : A.notifyChanges(now.notify, snap.notify)),
  };
}
// taken up here: the places (My Location first, as ever, and the one on show still on show), settings and notifications
export function takeUp(d) {
  const { S } = core;
  const here = core.place(), looking = core.looking(), gps = S.places.find((p) => p.gps);
  // (the account's places are chosen ones: one this device had as a stand-in is a stand-in no longer)
  const list = d.places.map((p) => { const { approx, standin, ...was } = S.places.find((x) => !x.gps && A.keyOf(x) === A.keyOf(p)) || {}; return { ...was, ...p }; });
  if (gps || list.length) S.places = gps ? [gps, ...list] : list;
  const at = looking ? -1 : S.places.findIndex((p) => here && (p.gps ? here.gps : !here.gps && A.keyOf(p) === A.keyOf(here)));
  S.cur = Math.max(0, at);
  store.set("wx:places", S.places); store.set("wx:cur", S.cur);
  const n = S.settings.notify;
  const theirs = Object.fromEntries(SYNCED.filter((k) => d.settings && k in d.settings).map((k) => [k, d.settings[k]]));
  store.set("wx:settings", { ...S.settings, ...theirs, notify: { ...d.notify, endpoint: n.endpoint, devId: n.devId, syncedAt: n.syncedAt, ...(n.off ? { off: true } : {}) } });
  core.loadSettings();
  core.emit("settings", { keys: Object.keys(theirs).concat("notify") });
  if (here && at < 0 && !looking) { core.emit("place", { cur: S.cur, place: core.place() }); core.go(); }
  else core.emit("wx", S.wx);
}
// Sending what's changed here (one at a time; a change while one's going goes after it), and if the account's moved on
// meanwhile, putting the two together and sending that
let stepping = null, stepAgain = false, stepTimer = 0;
export const busy = () => !!stepping;
export function inStepSoon() { if (!core.S.acct) return; clearTimeout(stepTimer); stepTimer = setTimeout(() => keepInStep().catch(() => {}), 1200); }
export function keepInStep() {
  if (stepping) { stepAgain = true; return stepping; }
  stepping = (async () => { try { do { stepAgain = false; await stepOnce(); } while (stepAgain); } finally { stepping = null; } })();
  return stepping;
}
export async function stepOnce() {
  for (let tries = 0; tries < 3; tries++) {
    const k = store.get("wx:acct");
    if (!k || !core.S.acct) return;
    const now = mine();
    if (sameAs(now, k.snap)) { inStep("ok"); return; }
    inStep("saving");
    let r;
    try { r = await A.save(k.ver, now); }
    catch (e) { if (e.status === 401) await lost(); else inStep(e.offline ? "waiting" : "error"); throw e; }
    if (!r.conflict) { store.set("wx:acct", { ...k, ver: r.ver, snap: snapOf(r.data) }); inStep("ok"); return; }
    takeUp(combine(r.data, now, k.snap));
    store.set("wx:acct", { ...k, ver: r.ver, snap: snapOf(r.data) });
  }
}
function inStep(state) {
  const a = core.S.acct;
  if (state === "ok" && core.S.error === core.SYNC_ERROR) core.setError(null);
  if (!a || a.state === state) return;
  a.state = state;
  core.emit("acct", a);
}
// The account as the server has it (on first showing, and again on coming back after a minute): signed out, or
// changed on another device
export async function pull() {
  let r;
  try { r = await A.me(); }
  catch (e) {
    if (e.status === 401) { await lost(); return; }
    // (no account here at all: a preview of the site, say)
    if (e.status === 404) { signedOut(); return; }
    if (core.S.acct && core.S.acct.state === "ok") inStep("waiting");
    return;
  }
  if (!r.signedIn) { await lost(); return; }
  await adopt(r);
}
// A 401 or { signedIn: false }: asked of InFlite first (fw.session.lost checks the session before anyone's signed out,
// D3): signed out after all → this page's copy of the account let go (the framework signs the page out); still signed
// in → said, nothing let go
async function lost() {
  const fw = core.fwOf();
  let out = false;
  try { out = await fw?.session?.lost?.(); } catch (_) {}
  if (out === true) { core.S.ask = null; core.emit("ask", null); signedOut(); return true; }
  core.setError(core.SYNC_ERROR);
  fw?.toast?.(core.SYNC_ERROR);
  return false;
}
// here: "keep them" answered on this page just now (so this device's places are meant for the account)
export async function adopt(r, here = false) {
  const { S } = core;
  const k = store.get("wx:acct"), fresh = !k || (k.id ? k.id !== r.id : k.handle !== r.handle && !(r.devices || []).some((d) => d.id === S.settings.notify.devId));
  // (Weather's first open at InFlite, signed in already: the place it opened on as a stand-in is no reason to ask, nor is
  // one the account has already; asked only for a place of this device's own the account hasn't)
  const hubFirst = fresh && !here, own = mine(), theirs = new Set((r.data?.places || []).map(A.keyOf));
  if (fresh && !here && (hubFirst ? own.places.some((p) => !theirs.has(A.keyOf(p))) : own.places.length) && !core.declined(r)) {
    // (the account this device was in step with till now let go of before it's asked, so nothing here goes to the one
    // signed in now till it's answered)
    if (S.acct || k) signedOutElsewhere();
    S.ask = r; core.emit("ask", r);
    return;
  }
  if (S.ask) { S.ask = null; core.emit("ask", null); }
  if (fresh && core.declined(r)) return;
  S.acct = { ...profileOf(r), devices: r.devices || [], state: S.acct?.state || "ok" };
  if (fresh) takeUp(combine(r.data, own, snapOf({}), true));
  else if (r.ver !== k.ver) takeUp(combine(r.data, mine(), k.snap));
  store.set("wx:acct", { ...profileOf(r), devices: S.acct.devices, ver: r.ver, snap: snapOf(r.data) });
  if (S.error === core.SYNC_ERROR) core.setError(null);
  core.emit("acct", S.acct);
  try { await keepInStep(); } catch (_) {}
}
// who, as the account has them: name, handle, email, the photo's time (and the account's own id, to know it again)
export const profileOf = (r) => ({ id: r.id || null, name: r.name, handle: r.handle, email: r.email || "", emailOk: !!r.emailOk, photoAt: r.photoAt || null });
function signedOutElsewhere() {
  const n = core.S.settings.notify;
  if (n.endpoint && n.devId) A.leave(n.endpoint).catch(() => {});
  signedOut();
}
export function signedOut() { store.del("wx:acct"); core.S.acct = null; core.emit("acct", null); }
export function stop() { clearTimeout(stepTimer); stepTimer = 0; stepAgain = false; }
