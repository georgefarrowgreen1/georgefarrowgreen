// Fitness and the site's account (functions/_account.js). Fitness is used signed in, and only signed in: with the
// site's one sign-in, made on the account's page (functions/_handback.js), and never held by the app itself (each
// request carries the site's cookie, from Fitness's own pages only).
//
// What it keeps with the account, so it's the same on every phone and computer you're signed in on:
// - your numbers (FTP, weight, heart rate, paces), your plan and when it started, the sessions you swapped, how you felt,
//   your own workouts and your choices, as one record with a version (fx_state): a change is sent with the version it
//   was made from, so two devices changing it at once can't lose either's (fitness/account.js merges and sends again);
// - your rides, runs and swims (fx_acts): each one's figures, as the phone worked them out from its file, for the lists
//   and the charts of fitness and form; and the file itself in R2 (fitness/<account>/<id>), fetched by the phone when you
//   open the ride: a FIT file as you imported it, a GPX or TCX (or a part of a multisport file) as the phone wrote it
//   as FIT, every sample kept, and gzipped by the phone (gz), so it's a fraction of the size.
// Nothing here reads a file: the phone did that. What's kept is checked to be what it says, and limited in size.

import { HttpError, limit } from "./_pigeon.js";

export const MAX_ACTS = 5000, MAX_FILE = 25 * 1024 * 1024, MAX_STORE = 2 * 1024 * 1024 * 1024, MAX_STATE = 256 * 1024;
export const SPORTS = ["ride", "run", "swim", "walk", "strength", "row", "other"];
const TYPES = ["fit", "gpx", "tcx"];
export const fileKey = (userId, id) => `fitness/${userId}/${id}`;

let ready = null;
export async function fitdb(env) {
  if (!env.DB) throw new HttpError(503, "Not set up.");
  if (!ready) ready = (async () => {
    // (the tables made as setup() makes them already, by this or another copy of the server: one look, not a few trips)
    if ((await env.DB.prepare("SELECT v FROM fx_meta WHERE k = 'schema_fp'").first().catch(() => null))?.v === SCHEMA_FP) return;
    await setup(env);
    await env.DB.prepare("INSERT OR REPLACE INTO fx_meta (k, v) VALUES ('schema_fp', ?)").bind(SCHEMA_FP).run();
  })().catch((e) => { ready = null; throw e; });
  await ready;
  return env.DB;
}
// The tables (each step safe to run again). SCHEMA_FP is its own text's fingerprint, so a change here has every copy of
// the server run it once more.
async function setup(env) {
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS fx_state (user_id TEXT PRIMARY KEY, data TEXT NOT NULL, ver INTEGER NOT NULL, updated INTEGER)"),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS fx_acts (user_id TEXT NOT NULL, id TEXT NOT NULL, start INTEGER NOT NULL, sport TEXT NOT NULL, indoor INTEGER NOT NULL DEFAULT 0,
      name TEXT, device TEXT, file TEXT, type TEXT NOT NULL, size INTEGER NOT NULL, sum TEXT, added INTEGER NOT NULL, PRIMARY KEY (user_id, id))`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS fx_acts_start ON fx_acts (user_id, start)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS fx_meta (k TEXT PRIMARY KEY, v TEXT)"),
  ]);
  // (whether a file's kept gzipped: a table made before it had none)
  await env.DB.prepare("ALTER TABLE fx_acts ADD COLUMN gz INTEGER NOT NULL DEFAULT 0").run().catch(() => {});
  // (when each last changed: added, renamed, its figures or its file; so a phone asks for only what's changed since)
  await env.DB.prepare("ALTER TABLE fx_acts ADD COLUMN changed INTEGER").run().catch(() => {});
}
const SCHEMA_FP = (() => { let h = 2166136261; for (const c of setup.toString()) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return "f" + h.toString(36); })();

// ---- what's kept, made safe ----
const text = (v, n) => String(v ?? "").replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, "").trim().slice(0, n);
const num = (v, lo, hi) => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
const obj = (v) => v && typeof v === "object" && !Array.isArray(v);
const DAYKEY = /^\d{10,14}$/;
// your numbers, each within what a person could be (else left as it was: the app's own defaults)
const PROFILE = { ftp: [50, 600], weight: [25, 250], lthr: [80, 230], maxHr: [90, 240], restHr: [25, 120], runPace: [120, 900], css: [40, 300] };
// a workout's steps: each a length (time or distance) at an intensity (a share of threshold), held or ramped, or a repeat
function steps(list, depth = 0) {
  if (!Array.isArray(list) || list.length > 300) throw new HttpError(400, "That workout is too long to keep.");
  return list.map((s) => {
    if (!obj(s)) throw new HttpError(400, "Bad request.");
    if (s.repeat != null) {
      if (depth) throw new HttpError(400, "A repeat can’t hold another repeat.");
      return { repeat: num(s.repeat, 1, 100) ?? 1, steps: steps(s.steps, 1) };
    }
    const out = { kind: ["warmup", "work", "steady", "rest", "cooldown", "free"].includes(s.kind) ? s.kind : "work", from: num(s.from, 0, 5) ?? 0.6 };
    if (num(s.secs, 1, 86400) != null) out.secs = s.secs; else if (num(s.metres, 1, 1e6) != null) out.metres = s.metres; else out.secs = 60;
    if (num(s.to, 0, 5) != null) out.to = s.to;
    if (Array.isArray(s.cad) && s.cad.length === 2 && s.cad.every((c) => num(c, 20, 250) != null)) out.cad = [s.cad[0], s.cad[1]];
    if (s.name) out.name = text(s.name, 40);
    if (s.note) out.note = text(s.note, 100);
    return out;
  });
}
export function cleanWorkout(w) {
  if (!obj(w) || !/^[A-Za-z0-9_-]{1,40}$/.test(String(w.id || ""))) throw new HttpError(400, "Bad request.");
  return { id: w.id, sport: SPORTS.includes(w.sport) ? w.sport : "ride", kind: text(w.kind, 30) || "Yours", name: text(w.name, 60) || "My workout", about: text(w.about, 500),
    steps: steps(w.steps), ...(w.imported ? { imported: true } : {}) };
}
// The record: { profile, plan: { id, start, at } or null (an event's), rhythm: Rhythm's settings or null, swaps: { day:
// workout id or null }, feel: { day: { sleep, legs, mood } }, workouts: [...], prefs: { units, examples } }
export function cleanState(d) {
  if (!obj(d)) throw new HttpError(400, "Bad request.");
  const profile = {};
  for (const [k, [lo, hi]] of Object.entries(PROFILE)) { const v = num(d.profile?.[k], lo, hi); if (v != null) profile[k] = v; }
  if (d.profile?.name) profile.name = text(d.profile.name, 60);
  // (the ones you set yourself: the rest are worked out from your rides)
  if (Array.isArray(d.profile?.set)) profile.set = [...new Set(d.profile.set.filter((k) => k in PROFILE))];
  // (FTP as it's changed: [day, watts, set by you (1) or worked out (0)], for Progress)
  if (Array.isArray(d.profile?.ftpLog)) profile.ftpLog = d.profile.ftpLog.filter((x) => Array.isArray(x) && num(x[0], 0, 9e12) != null && num(x[1], 50, 600) != null).slice(-120).map((x) => [x[0], Math.round(x[1]), x[2] ? 1 : 0]);
  const p = d.plan, plan = obj(p) && /^[a-z0-9-]{1,20}$/.test(String(p.id || "")) && num(p.start, 0, 9e12) != null ? { id: p.id, start: p.start, ...(num(p.at, 0, 9e12) != null ? { at: p.at } : {}) } : null;
  const swaps = {}, feel = {};
  for (const [k, v] of Object.entries(obj(d.swaps) ? d.swaps : {}).slice(-400)) if (DAYKEY.test(k) && (v === null || /^[A-Za-z0-9_:-]{1,40}$/.test(String(v)))) swaps[k] = v;
  for (const [k, v] of Object.entries(obj(d.feel) ? d.feel : {}).slice(-400)) {
    if (!DAYKEY.test(k) || !obj(v)) continue;
    const f = {}; for (const x of ["sleep", "legs", "mood"]) if (num(v[x], 0, 2) != null) f[x] = v[x];
    feel[k] = f;
  }
  const workouts = Array.isArray(d.workouts) ? d.workouts.slice(0, 300).map(cleanWorkout) : [];
  // (units only once you've chosen them: till then, your phone's region's; the morning check-in, unless turned off)
  const prefs = { ...(["imperial", "metric"].includes(d.prefs?.units) ? { units: d.prefs.units } : {}), examples: d.prefs?.examples === true, ...(d.prefs?.ask === false ? { ask: false } : {}),
    // (and where your nights come from, once you've chosen: Apple Watch or Garmin)
    ...(["apple", "garmin"].includes(d.prefs?.nights) ? { nights: d.prefs.nights } : {}),
    // (and once its first-use welcome's been seen, on any phone: not shown again)
    ...(d.prefs?.onboarded === true ? { onboarded: true } : {}),
    // (and maps shown by themselves, where you've chosen that: the account's page, Fitness)
    ...(d.prefs?.maps === "always" ? { maps: "always" } : {}) };
  // Rhythm: minutes each day of the week (Monday first, none a rest day), a run and a swim, its lean, build or hold, the
  // Monday it began and the day it was set up, and an event you're riding towards
  const r = d.rhythm, rhythm = obj(r) && Array.isArray(r.days) && r.days.length === 7 ? { days: r.days.map((x) => Math.round(num(x, 0, 600) ?? 0)), run: r.run === true, swim: r.swim === true,
    lean: ["balanced", "endurance", "punch"].includes(r.lean) ? r.lean : "balanced", mode: r.mode === "hold" ? "hold" : "build", ...(["none", "some", "regular", "lots"].includes(r.level) ? { level: r.level } : {}), ...(num(r.start, 0, 9e12) != null ? { start: r.start } : {}), ...(num(r.at, 0, 9e12) != null ? { at: r.at } : {}),
    // (and an event you're riding towards: its day, its kind, its name)
    ...(obj(r.event) && num(r.event.date, 0, 9e12) != null && ["sportive", "race", "tt"].includes(r.event.kind) ? { event: { date: r.event.date, kind: r.event.kind, name: String(r.event.name || "").replace(/[\u0000-\u001f]/g, "").slice(0, 60) } } : {}) } : null;
  const out = { profile, plan, rhythm, swaps, feel, workouts, prefs };
  if (JSON.stringify(out).length > MAX_STATE) throw new HttpError(413, "That’s more than can be kept. Delete a few of your own workouts.");
  return out;
}
// An activity's own words and figures, as the phone sends them with its file
// (drift: heart rate's drift against power, second half on first, in %; late20: the best 20 minutes after two hours;
// xv: which version of those figures the phone worked out)
const SUM_NUMS = ["secs", "moving", "dist", "ascent", "ftp", "lthr", "runPace", "css", "avgPwr", "maxPwr", "kj", "np", "iF", "tss", "avgHr", "maxHr", "avgCad", "maxSpd", "avgSpd", "kcal", "drift", "late20", "xv", "efforts", "held", "effortPct", "effFtp", "effFam", "faded"];
export function cleanAct(m) {
  if (!obj(m) || !/^[A-Za-z0-9_-]{1,40}$/.test(String(m.id || ""))) throw new HttpError(400, "Bad request.");
  const start = num(m.start, Date.UTC(1990, 0, 1), Date.now() + 2 * 86400e3);
  if (start == null) throw new HttpError(400, "That activity’s date can’t be right.");
  const sum = {};
  for (const k of SUM_NUMS) { const v = num(m.sum?.[k], -1e7, 1e9); if (v != null) sum[k] = Math.round(v * 1000) / 1000; }
  if (["power", "hr", "pace"].includes(m.sum?.kind)) sum.kind = m.sum.kind;
  if (obj(m.sum?.curve)) { sum.curve = {}; for (const [k, v] of Object.entries(m.sum.curve).slice(0, 20)) if (/^\d{1,5}$/.test(k) && num(v, 0, 5000) != null) sum.curve[k] = Math.round(v); }
  for (const z of ["zones", "hrZones"]) if (Array.isArray(m.sum?.[z]) && m.sum[z].length <= 7) sum[z] = m.sum[z].map((v) => Math.round(num(v, 0, 1e6) ?? 0));
  const route = cleanRoute(m.sum?.route); if (route) sum.route = route;
  return { id: m.id, start, sport: SPORTS.includes(m.sport) ? m.sport : "other", indoor: !!m.indoor, name: text(m.name, 80) || "Activity", device: text(m.device, 80) || null,
    file: text(m.file, 120) || null, type: TYPES.includes(m.type) ? m.type : null, sum };
}
// A route's shape, for its row: up to 48 points, each across and down in a box 0 to 100
export function cleanRoute(r) {
  if (!Array.isArray(r) || r.length < 4 || r.length > 96 || r.length % 2) return null;
  return r.every((v) => num(v, 0, 100) != null) ? r.map((v) => Math.round(v)) : null;
}
// The file's what it says it is: a FIT file's header, or the XML of a GPX or TCX
export function fileIs(type, u8) {
  if (!u8) return false;
  if (type === "fit") return u8.length >= 14 && (u8[0] === 12 || u8[0] === 14) && String.fromCharCode(u8[8], u8[9], u8[10], u8[11]) === ".FIT";
  const head = new TextDecoder().decode(u8.subarray(0, 2000)).replace(/^﻿/, "").trimStart();
  return head.startsWith("<") && (type === "gpx" ? /<gpx[\s>]/i.test(head) : /<TrainingCenterDatabase[\s>]/i.test(head));
}

// The start of a file as it was before it was gzipped (enough to say what it is: the rest isn't unpacked here)
export const isGz = (u8) => u8.length > 18 && u8[0] === 0x1f && u8[1] === 0x8b;
async function headOf(u8) {
  if (!isGz(u8)) return u8;
  try {
    const r = new Blob([u8]).stream().pipeThrough(new DecompressionStream("gzip")).getReader();
    let out = new Uint8Array(0);
    while (out.length < 2048) {
      const { value, done } = await r.read();
      if (done) break;
      const n = new Uint8Array(out.length + value.length); n.set(out); n.set(value, out.length); out = n;
    }
    r.cancel().catch(() => {});
    return out;
  } catch (_) { return null; }
}

// ---- reading and writing it ----
export async function kept(env, userId) {
  const r = await (await fitdb(env)).prepare("SELECT data, ver FROM fx_state WHERE user_id = ?").bind(userId).first();
  if (!r) return { ver: 0, data: null };
  try { return { ver: r.ver, data: JSON.parse(r.data) }; } catch (_) { return { ver: r.ver, data: null }; }
}
// a change made from version `base`: → { ver, data }, or { conflict, ver, data } where it's moved on since
export async function saveState(env, userId, base, data) {
  const D = await fitdb(env), t = Date.now(), json = JSON.stringify(data);
  const r = base === 0
    ? await D.prepare("INSERT INTO fx_state (user_id, data, ver, updated) VALUES (?1, ?2, 1, ?3) ON CONFLICT(user_id) DO NOTHING").bind(userId, json, t).run()
    : await D.prepare("UPDATE fx_state SET data = ?2, ver = ver + 1, updated = ?3 WHERE user_id = ?1 AND ver = ?4").bind(userId, json, t, base).run();
  if (!r.meta?.changes) { const now = await kept(env, userId); return { conflict: true, ...now }; }
  return { ver: base + 1, data };
}
// every activity's row, newest first: what the lists and charts need, without the files. since (ms): only those added
// or changed since, and every one's id (so a phone that has the rest knows which have gone). With none (a phone with
// nothing yet): the newest FIRST of them, and more: true where there are others, for olderActs to bring in after
export const FIRST = 400, PAGE = 1000;
const COLS = "id, start, sport, indoor, name, device, file, type, size, sum, gz";
const rowOut = (r) => { let sum = null; try { sum = JSON.parse(r.sum || "null"); } catch (_) {} return { ...r, indoor: !!r.indoor, gz: !!r.gz, sum }; };
export async function activities(env, userId, since = null) {
  const D = await fitdb(env);
  const { results } = since == null
    ? await D.prepare(`SELECT ${COLS} FROM fx_acts WHERE user_id = ? ORDER BY start DESC, id DESC LIMIT ?`).bind(userId, FIRST + 1).all()
    : await D.prepare(`SELECT ${COLS} FROM fx_acts WHERE user_id = ? AND COALESCE(changed, added) > ? ORDER BY start DESC LIMIT ?`).bind(userId, since, MAX_ACTS).all();
  if (since == null) return { acts: results.slice(0, FIRST).map(rowOut), more: results.length > FIRST };
  const rows = results.map(rowOut);
  const ids = (await D.prepare("SELECT id FROM fx_acts WHERE user_id = ? LIMIT ?").bind(userId, MAX_ACTS).all()).results.map((r) => r.id);
  return { acts: rows, ids };
}
// Those older than one you have (its start and id: the order they're given in), a page at a time
export async function olderActs(env, userId, start, id) {
  const { results } = await (await fitdb(env)).prepare(`SELECT ${COLS} FROM fx_acts WHERE user_id = ?1 AND (start < ?2 OR (start = ?2 AND id < ?3)) ORDER BY start DESC, id DESC LIMIT ?4`)
    .bind(userId, start, id, PAGE + 1).all();
  return { acts: results.slice(0, PAGE).map(rowOut), more: results.length > PAGE };
}
// One kept, its file first (so a row never points at nothing). The same activity sent again (the same id): kept once.
export async function addActivity(env, userId, meta, u8) {
  if (!meta.type || !fileIs(meta.type, await headOf(u8))) throw new HttpError(400, "That file isn’t a FIT, GPX or TCX file.");
  if (u8.length > MAX_FILE) throw new HttpError(413, "That file is too big to keep (25 MB at most).");
  const D = await fitdb(env);
  await limit(env, `fxup:${userId}`, 600, 3600e3);
  const had = await D.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS bytes, MAX(id = ?2) AS dup FROM fx_acts WHERE user_id = ?1").bind(userId, meta.id).first();
  if (had?.dup) return { kept: false, already: true };
  if (had?.n >= MAX_ACTS) throw new HttpError(413, `You can keep ${MAX_ACTS.toLocaleString("en-GB")} activities. Delete some old ones first.`);
  if ((had?.bytes || 0) + u8.length > MAX_STORE) throw new HttpError(413, "Your activities have used all the space there is (2 GB). Delete some old ones first.");
  if (!env.BIO_R2) throw new HttpError(503, "Not set up.");
  await env.BIO_R2.put(fileKey(userId, meta.id), u8, { httpMetadata: { contentType: "application/octet-stream" } });
  const now = Date.now();
  await D.prepare(`INSERT INTO fx_acts (user_id, id, start, sport, indoor, name, device, file, type, size, sum, added, gz, changed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, id) DO NOTHING`).bind(userId, meta.id, meta.start, meta.sport, meta.indoor ? 1 : 0, meta.name, meta.device, meta.file, meta.type, u8.length, JSON.stringify(meta.sum), now, isGz(u8) ? 1 : 0, now).run();
  return { kept: true };
}
// One kept before, its file made smaller by the phone (written as FIT, and gzipped): the same activity, in less space
export async function replaceFile(env, userId, id, meta, u8) {
  if (!["fit", "gpx", "tcx"].includes(meta.type) || !isGz(u8) || !fileIs(meta.type, await headOf(u8))) throw new HttpError(400, "That file isn’t a FIT, GPX or TCX file.");
  if (u8.length > MAX_FILE) throw new HttpError(413, "That file is too big to keep (25 MB at most).");
  const D = await fitdb(env);
  await limit(env, `fxsquash:${userId}`, 600, 3600e3);
  const row = await D.prepare("SELECT size, (SELECT COALESCE(SUM(size), 0) FROM fx_acts WHERE user_id = ?1) AS bytes FROM fx_acts WHERE user_id = ?1 AND id = ?2").bind(userId, id).first();
  if (!row) throw new HttpError(404, "That activity isn’t here any more.");
  // (it's the same activity made smaller: never bigger than it was, and never past the account's space)
  if (u8.length > Math.max(row.size || 0, 64 * 1024) || row.bytes - (row.size || 0) + u8.length > MAX_STORE) throw new HttpError(413, "That file is bigger than the one it replaces.");
  if (!env.BIO_R2) throw new HttpError(503, "Not set up.");
  await env.BIO_R2.put(fileKey(userId, id), u8, { httpMetadata: { contentType: "application/octet-stream" } });
  await D.prepare("UPDATE fx_acts SET type = ?, file = ?, size = ?, gz = 1, changed = ? WHERE user_id = ? AND id = ?").bind(meta.type, text(meta.file, 120) || null, u8.length, Date.now(), userId, id).run();
  return { kept: true, size: u8.length };
}
export async function activityFile(env, userId, id) {
  const row = await (await fitdb(env)).prepare("SELECT type FROM fx_acts WHERE user_id = ? AND id = ?").bind(userId, id).first();
  const obj = row && env.BIO_R2 ? await env.BIO_R2.get(fileKey(userId, id)) : null;
  if (!obj) throw new HttpError(404, "That activity isn’t here any more.");
  return { body: obj.body, type: row.type };
}
// renamed (the one thing about an activity you can change)
export async function renameActivity(env, userId, id, name) {
  const r = await (await fitdb(env)).prepare("UPDATE fx_acts SET name = ?, changed = ? WHERE user_id = ? AND id = ?").bind(text(name, 80) || "Activity", Date.now(), userId, id).run();
  if (!r.meta?.changes) throw new HttpError(404, "That activity isn’t here any more.");
}
// figures worked out by the phone for one kept before rows had them: its route's shape, its staying power
export async function addFigures(env, userId, id, b) {
  const D = await fitdb(env), add = {};
  if (b.route !== undefined) { const r = cleanRoute(b.route); if (!r) throw new HttpError(400, "Bad request."); add.route = r; }
  // (and the efforts of a session: how many, how many held, at what share of their targets and of FTP, which kind, and a fade)
  for (const [k, lo, hi] of [["drift", -50, 100], ["late20", 0, 2000], ["xv", 0, 100], ["efforts", 0, 200], ["held", 0, 200], ["effortPct", 0, 300], ["effFtp", 0, 3000], ["effFam", 0, 9], ["faded", 0, 200]]) if (b[k] !== undefined) { const v = num(b[k], lo, hi); if (v == null) throw new HttpError(400, "Bad request."); add[k] = Math.round(v * 10) / 10; }
  if (!Object.keys(add).length) throw new HttpError(400, "Bad request.");
  const row = await D.prepare("SELECT sum FROM fx_acts WHERE user_id = ? AND id = ?").bind(userId, id).first();
  if (!row) throw new HttpError(404, "That activity isn’t here any more.");
  let sum = {}; try { sum = JSON.parse(row.sum || "{}") || {}; } catch (_) {}
  await D.prepare("UPDATE fx_acts SET sum = ?, changed = ? WHERE user_id = ? AND id = ?").bind(JSON.stringify({ ...sum, ...add }), Date.now(), userId, id).run();
}
// Every activity one source brought in (Garmin's g<id>, Strava's s<id>), and their files: removed, on disconnecting
// where asked → how many
export async function dropFrom(env, userId, prefix) {
  if (!/^[gs]$/.test(prefix)) throw new HttpError(400, "Bad request.");
  const D = await fitdb(env), { results } = await D.prepare("SELECT id FROM fx_acts WHERE user_id = ? AND id GLOB ?").bind(userId, `${prefix}[0-9]*`).all();
  for (let i = 0; i < results.length; i += 500) {
    const ids = results.slice(i, i + 500).map((r) => r.id);
    if (env.BIO_R2) await env.BIO_R2.delete(ids.map((id) => fileKey(userId, id)));
  }
  await D.prepare("DELETE FROM fx_acts WHERE user_id = ? AND id GLOB ?").bind(userId, `${prefix}[0-9]*`).run();
  return results.length;
}
export async function deleteActivity(env, userId, id) {
  await (await fitdb(env)).prepare("DELETE FROM fx_acts WHERE user_id = ? AND id = ?").bind(userId, id).run();
  if (env.BIO_R2) await env.BIO_R2.delete(fileKey(userId, id));
}
// What the account's page says Fitness keeps: how many activities, the latest's day, and the plan
export async function fitnessOf(env, userId) {
  try {
    const D = await fitdb(env);
    const r = await D.prepare("SELECT COUNT(*) AS n, MAX(start) AS last, COALESCE(SUM(size), 0) AS bytes FROM fx_acts WHERE user_id = ?").bind(userId).first();
    const k = await kept(env, userId);
    return { activities: r?.n || 0, last: r?.last || null, bytes: r?.bytes || 0, plan: k.data?.plan?.id || null, workouts: k.data?.workouts?.length || 0 };
  } catch (_) { return { activities: 0, last: null, bytes: 0, plan: null, workouts: 0 }; }
}
// Every night kept, for the account's export: Apple Health's (functions/_health.js) and Garmin's (functions/_garmin.js),
// each where its table's been made
export async function nightsKept(env, userId) {
  const D = await fitdb(env), rows = (sql) => D.prepare(sql).bind(userId).all().then((r) => r.results.map((x) => Object.fromEntries(Object.entries(x).filter(([, v]) => v != null))), () => []);
  return { appleHealth: await rows("SELECT day, hrv, rhr, sleep FROM fx_health WHERE user_id = ? ORDER BY day"), garmin: await rows("SELECT day, hrv, hrv_lo, hrv_hi, rhr, sleep, score FROM fx_well WHERE user_id = ? ORDER BY day") };
}
// An account gone (functions/_accounts.js): everything Fitness kept with it, files and all
export async function dropFitness(env, userId) {
  if (env.BIO_R2) {
    let cursor;
    do {
      const page = await env.BIO_R2.list({ prefix: `fitness/${userId}/`, cursor, limit: 1000 });
      if (page.objects.length) await env.BIO_R2.delete(page.objects.map((o) => o.key));
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  }
  const D = await fitdb(env);
  await D.batch([D.prepare("DELETE FROM fx_acts WHERE user_id = ?").bind(userId), D.prepare("DELETE FROM fx_state WHERE user_id = ?").bind(userId)]);
  // (and Garmin's key, where one was added: functions/_garmin.js)
  await D.batch([D.prepare("DELETE FROM fx_garmin WHERE user_id = ?").bind(userId), D.prepare("DELETE FROM fx_garmin_new WHERE user_id = ?").bind(userId)]).catch(() => {});
  // (and the morning notification's phones: functions/_fitpush.js)
  await D.prepare("DELETE FROM fx_push WHERE user_id = ?").bind(userId).run().catch(() => {});
  // (and the nights: Garmin's (functions/_garmin.js), and Apple Health's with its Shortcut's key, so it can't send more
  // for an account that's gone (functions/_health.js); each where its table's been made)
  // (and Strava's tokens and files waiting: functions/_strava.js; the files went with the rest above)
  for (const t of ["fx_well", "fx_health", "fx_health_key", "fx_strava", "fx_strava_new"]) await D.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(userId).run().catch(() => {});
}
