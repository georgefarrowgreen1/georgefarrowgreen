// Fitness and the site's account (functions/_account.js). Fitness is used signed in, and only signed in: with the
// site's one sign-in, made on the account's page (functions/_handback.js), and never held by the app itself (each
// request carries the site's cookie, from Fitness's own pages only).
//
// What it keeps with the account, so it's the same on every phone and computer you're signed in on:
// - your numbers (FTP, weight, heart rate, paces), your plan and when it started, the sessions you swapped, how you felt,
//   your own workouts and your choices, as one record with a version (fx_state): a change is sent with the version it
//   was made from, so two devices changing it at once can't lose either's (fitness/account.js merges and sends again);
// - your rides, runs and swims (fx_acts): each one's figures, as the phone worked them out from its file, for the lists
//   and the charts of fitness and form; and the file itself, as you imported it (a FIT file is the record), in R2
//   (fitness/<account>/<id>), fetched by the phone when you open the ride.
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
// The record: { profile, plan: { id, start, at } or null, swaps: { day: workout id or null }, feel: { day: { sleep, legs,
// mood } }, workouts: [...], prefs: { units, examples } }
export function cleanState(d) {
  if (!obj(d)) throw new HttpError(400, "Bad request.");
  const profile = {};
  for (const [k, [lo, hi]] of Object.entries(PROFILE)) { const v = num(d.profile?.[k], lo, hi); if (v != null) profile[k] = v; }
  if (d.profile?.name) profile.name = text(d.profile.name, 60);
  const p = d.plan, plan = obj(p) && /^[a-z0-9-]{1,20}$/.test(String(p.id || "")) && num(p.start, 0, 9e12) != null ? { id: p.id, start: p.start, ...(num(p.at, 0, 9e12) != null ? { at: p.at } : {}) } : null;
  const swaps = {}, feel = {};
  for (const [k, v] of Object.entries(obj(d.swaps) ? d.swaps : {}).slice(-400)) if (DAYKEY.test(k) && (v === null || /^[A-Za-z0-9_-]{1,40}$/.test(String(v)))) swaps[k] = v;
  for (const [k, v] of Object.entries(obj(d.feel) ? d.feel : {}).slice(-400)) {
    if (!DAYKEY.test(k) || !obj(v)) continue;
    const f = {}; for (const x of ["sleep", "legs", "mood"]) if (num(v[x], 0, 2) != null) f[x] = v[x];
    feel[k] = f;
  }
  const workouts = Array.isArray(d.workouts) ? d.workouts.slice(0, 300).map(cleanWorkout) : [];
  const prefs = { units: d.prefs?.units === "imperial" ? "imperial" : "metric", examples: d.prefs?.examples === true };
  const out = { profile, plan, swaps, feel, workouts, prefs };
  if (JSON.stringify(out).length > MAX_STATE) throw new HttpError(413, "That’s more than can be kept. Delete a few of your own workouts.");
  return out;
}
// An activity's own words and figures, as the phone sends them with its file
const SUM_NUMS = ["secs", "moving", "dist", "ascent", "ftp", "lthr", "runPace", "css", "avgPwr", "maxPwr", "kj", "np", "iF", "tss", "avgHr", "maxHr", "avgCad", "maxSpd", "avgSpd", "kcal"];
export function cleanAct(m) {
  if (!obj(m) || !/^[A-Za-z0-9_-]{1,40}$/.test(String(m.id || ""))) throw new HttpError(400, "Bad request.");
  const start = num(m.start, Date.UTC(1990, 0, 1), Date.now() + 2 * 86400e3);
  if (start == null) throw new HttpError(400, "That activity’s date can’t be right.");
  const sum = {};
  for (const k of SUM_NUMS) { const v = num(m.sum?.[k], -1e7, 1e9); if (v != null) sum[k] = Math.round(v * 1000) / 1000; }
  if (["power", "hr", "pace"].includes(m.sum?.kind)) sum.kind = m.sum.kind;
  if (obj(m.sum?.curve)) { sum.curve = {}; for (const [k, v] of Object.entries(m.sum.curve).slice(0, 20)) if (/^\d{1,5}$/.test(k) && num(v, 0, 5000) != null) sum.curve[k] = Math.round(v); }
  for (const z of ["zones", "hrZones"]) if (Array.isArray(m.sum?.[z]) && m.sum[z].length <= 7) sum[z] = m.sum[z].map((v) => Math.round(num(v, 0, 1e6) ?? 0));
  return { id: m.id, start, sport: SPORTS.includes(m.sport) ? m.sport : "other", indoor: !!m.indoor, name: text(m.name, 80) || "Activity", device: text(m.device, 80) || null,
    file: text(m.file, 120) || null, type: TYPES.includes(m.type) ? m.type : null, sum };
}
// The file's what it says it is: a FIT file's header, or the XML of a GPX or TCX
export function fileIs(type, u8) {
  if (type === "fit") return u8.length >= 14 && (u8[0] === 12 || u8[0] === 14) && String.fromCharCode(u8[8], u8[9], u8[10], u8[11]) === ".FIT";
  const head = new TextDecoder().decode(u8.subarray(0, 2000)).replace(/^﻿/, "").trimStart();
  return head.startsWith("<") && (type === "gpx" ? /<gpx[\s>]/i.test(head) : /<TrainingCenterDatabase[\s>]/i.test(head));
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
// every activity's row, newest first: what the lists and charts need, without the files
export async function activities(env, userId) {
  const { results } = await (await fitdb(env)).prepare("SELECT id, start, sport, indoor, name, device, file, type, size, sum FROM fx_acts WHERE user_id = ? ORDER BY start DESC LIMIT ?")
    .bind(userId, MAX_ACTS).all();
  return results.map((r) => { let sum = null; try { sum = JSON.parse(r.sum || "null"); } catch (_) {} return { ...r, indoor: !!r.indoor, sum }; });
}
// One kept, its file first (so a row never points at nothing). The same activity sent again (the same id): kept once.
export async function addActivity(env, userId, meta, u8) {
  if (!meta.type || !fileIs(meta.type, u8)) throw new HttpError(400, "That file isn’t a FIT, GPX or TCX file.");
  if (u8.length > MAX_FILE) throw new HttpError(413, "That file is too big to keep (25 MB at most).");
  const D = await fitdb(env);
  await limit(env, `fxup:${userId}`, 600, 3600e3);
  const had = await D.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS bytes, MAX(id = ?2) AS dup FROM fx_acts WHERE user_id = ?1").bind(userId, meta.id).first();
  if (had?.dup) return { kept: false, already: true };
  if (had?.n >= MAX_ACTS) throw new HttpError(413, `You can keep ${MAX_ACTS.toLocaleString("en-GB")} activities. Delete some old ones first.`);
  if ((had?.bytes || 0) + u8.length > MAX_STORE) throw new HttpError(413, "Your activities have used all the space there is (2 GB). Delete some old ones first.");
  if (!env.BIO_R2) throw new HttpError(503, "Not set up.");
  await env.BIO_R2.put(fileKey(userId, meta.id), u8, { httpMetadata: { contentType: "application/octet-stream" } });
  await D.prepare(`INSERT INTO fx_acts (user_id, id, start, sport, indoor, name, device, file, type, size, sum, added) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, id) DO NOTHING`).bind(userId, meta.id, meta.start, meta.sport, meta.indoor ? 1 : 0, meta.name, meta.device, meta.file, meta.type, u8.length, JSON.stringify(meta.sum), Date.now()).run();
  return { kept: true };
}
export async function activityFile(env, userId, id) {
  const row = await (await fitdb(env)).prepare("SELECT type FROM fx_acts WHERE user_id = ? AND id = ?").bind(userId, id).first();
  const obj = row && env.BIO_R2 ? await env.BIO_R2.get(fileKey(userId, id)) : null;
  if (!obj) throw new HttpError(404, "That activity isn’t here any more.");
  return { body: obj.body, type: row.type };
}
// renamed (the one thing about an activity you can change)
export async function renameActivity(env, userId, id, name) {
  const r = await (await fitdb(env)).prepare("UPDATE fx_acts SET name = ? WHERE user_id = ? AND id = ?").bind(text(name, 80) || "Activity", userId, id).run();
  if (!r.meta?.changes) throw new HttpError(404, "That activity isn’t here any more.");
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
}
