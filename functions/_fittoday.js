// Fitness for InFlite Today: the coming days' sessions as Fitness planned them, sent by Fitness itself when it's opened
// (fitness/app.js, POST /api/fitness/today), so Today can show today's without working out a plan of its own. Each of
// today and the next 7 days, by the phone's own day: a session (its name, length, load, why, and its steps' outline), a
// rest day, an event, or nothing planned. Kept one row an account (fx_today), with its zone and units.

import { HttpError } from "./_pigeon.js";
import { tablesOnce, SPORTS } from "./_fitness.js";

const MAX_BODY = 32 * 1024, MAX_DAYS = 10, MAX_STEPS = 80;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

// (made once for each change to it, as Fitness's own are: functions/_fitness.js tablesOnce)
const tables = (env) => tablesOnce(env, "today", async (D) => {
  await D.prepare("CREATE TABLE IF NOT EXISTS fx_today (user_id TEXT PRIMARY KEY, tz TEXT NOT NULL, units TEXT NOT NULL, days TEXT NOT NULL, at INTEGER NOT NULL)").run();
});

// ---- what Fitness sent, made safe ----
const bad = () => new HttpError(400, "Bad request.");
const obj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
// (text, its control characters (and those that turn text around) taken out, no longer than n)
const text = (v, n) => String(v ?? "").replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, "").trim().slice(0, n);
// (a number kept within lo and hi; one that isn't a number, lo)
const within = (v, lo, hi) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);
const two = (v) => Math.round(v * 100) / 100;
// (an IANA zone's name, as the phone has it: "Europe/London"; never an offset)
const tzOk = (tz) => { if (typeof tz !== "string" || tz.length > 63 || !/^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(tz)) return false; try { new Intl.DateTimeFormat("en-GB", { timeZone: tz }); return true; } catch (_) { return false; } };
// a session's steps, each [secs, from, to] (from and to: shares of threshold)
function steps(list) {
  if (list == null) return [];
  if (!Array.isArray(list) || list.length > MAX_STEPS) throw bad();
  return list.filter((s) => Array.isArray(s) && s.length === 3 && s.every((x) => typeof x === "number" && Number.isFinite(x)))
    .map(([secs, from, to]) => [Math.round(within(secs, 1, 86400)), two(within(from, 0, 5)), two(within(to, 0, 5))]);
}
// one day: what it is, or null for one that's none of them (left out)
function dayOf(d) {
  if (!obj(d)) return null;
  if (d.state === "none") return { state: "none" };
  if (d.state === "rest") return { state: "rest", why: text(d.why, 240) };
  if (d.state === "event") return { state: "event", name: text(d.name, 60) };
  if (d.state !== "session") return null;
  return { state: "session", id: text(d.id, 60), sport: SPORTS.includes(d.sport) ? d.sport : "ride", name: text(d.name, 60), kind: text(d.kind, 30),
    secs: Math.round(within(d.secs, 0, 86400)), tss: Math.round(within(d.tss, 0, 1000)), hard: d.hard === true, why: text(d.why, 240), steps: steps(d.steps) };
}
// What Fitness sent, made safe to keep: { tz, units, days } (a bad one: 400)
export function cleanSnapshot(b) {
  if (!obj(b) || !obj(b.days) || !tzOk(b.tz) || !["metric", "imperial"].includes(b.units)) throw bad();
  let size;
  try { size = JSON.stringify(b).length; } catch (_) { throw bad(); }
  if (size > MAX_BODY) throw bad();
  const keys = Object.keys(b.days);
  if (keys.length > MAX_DAYS || !keys.every((k) => DAY_KEY.test(k))) throw bad();
  const days = {};
  for (const k of keys.sort()) { const d = dayOf(b.days[k]); if (d) days[k] = d; }
  return { tz: b.tz, units: b.units, days };
}
// Kept, in place of the one before (unless one sent later has been kept meanwhile) → { ok, at }
export async function setSnapshot(env, userId, b) {
  const s = cleanSnapshot(b), D = await tables(env), at = Date.now();
  await D.prepare(`INSERT INTO fx_today (user_id, tz, units, days, at) VALUES (?1, ?2, ?3, ?4, ?5)
    ON CONFLICT (user_id) DO UPDATE SET tz = excluded.tz, units = excluded.units, days = excluded.days, at = excluded.at WHERE excluded.at >= fx_today.at`)
    .bind(userId, s.tz, s.units, JSON.stringify(s.days), at).run();
  return { ok: true, at };
}
// → { tz, units, days, at }, or null where Fitness hasn't sent one
export async function snapshotOf(env, userId) {
  const D = await tables(env);
  const r = await D.prepare("SELECT tz, units, days, at FROM fx_today WHERE user_id = ?").bind(userId).first();
  if (!r) return null;
  let days = {};
  try { const v = JSON.parse(r.days); if (obj(v)) days = v; } catch (_) {}
  return { tz: r.tz, units: r.units, days, at: r.at };
}
