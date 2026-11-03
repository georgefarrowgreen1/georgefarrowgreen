// One device, every app's notifications (Today First, spec §11.3): the root subscription of inflite.ai written into
// each app's own table, each with that table's own rules, and taken back out. td_push (Today's morning) always; and
// only after the person's tap ("Get Every App's Notifications Here", which sends fan: true) and only while the Pages
// var HUB_PUSH is "1", also pg_push, mk_push and wx_devs/wx_subs, each row marked via = 'hub' so a rollback can take
// back exactly those. A device is named to the page only by an opaque id, never its endpoint or its session's hash.
//   deviceAdd(env, u, { sub, was?, fan?, tz }, { request }) → { ok: true, tables }       (POST today/device; with was,
//     the endpoint is moved in every table that holds was)
//   deviceDrop(env, u, { endpoint }) → { ok: true }                                     (DELETE today/device)
//   devicesList(env, u, { device }, { request }) → { fan, here, devices: [{ id, label, home, apps, at }] }
//                                                                                       (GET today/devices)
//   devicesStop(env, u, { id }) → { ok: true }: that sign-in's push rows gone, never signed out (DELETE today/devices)
//   addEverywhere(env, u, sub, { fan }) → the tables written
//   moveEverywhere(env, u, was, sub) → the tables it moved in
//   dropEverywhere(env, endpoint) → the tables it was in
//   otherDevices(env, u) → [{ id, label, home, apps, at }]: this account's other sign-ins with a push row anywhere
//   stopDevice(env, u, id) → the tables it was dropped from, or null when id names none of this account's
// (B0's stub: the handlers answer 501 "Not built yet." (the page then falls back to POST /api/push for the morning);
// the helpers do nothing and find nothing. Batch N writes it; the names and arguments stay.)
import { HttpError } from "./_http.js";

const notYet = () => { throw new HttpError(501, "Not built yet."); };

export async function deviceAdd(env, u, body, { request } = {}) { notYet(); }
export async function deviceDrop(env, u, body) { notYet(); }
export async function devicesList(env, u, { device } = {}, { request } = {}) { notYet(); }
export async function devicesStop(env, u, body) { notYet(); }

export async function addEverywhere(env, u, sub, { fan } = {}) {
  return [];
}
export async function moveEverywhere(env, u, was, sub) {
  return [];
}
export async function dropEverywhere(env, endpoint) {
  return [];
}
export async function otherDevices(env, u) {
  return [];
}
export async function stopDevice(env, u, id) {
  return null;
}
