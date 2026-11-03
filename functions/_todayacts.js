// What Today does for you, with Undo, and the rules it does it by (Today First, spec §7.5). Each rule has a level on
// the account (td_rules: do, suggest or quiet) and a record; every act is a td_acts row kept for Undo; the day's plan
// runs once per account and local day (td_plans, claimed first with INSERT OR IGNORE, so the morning's tick and a page
// read never both act). The rules in milestone 1: moveRide (a clash moved), addRide (a habit ride added, holding nothing
// until a tap keeps it), holdRide (functions/_busy.js), and rideThen (an offer, not a rule). Writes never touch
// fx_state: a move changes fx_times or an offer's times, an add is an fx_offers row (functions/_fitshare.js).
//   planDay(env, u, t, deps = {}) → { acts }: claims the day, tallies, then the clash and the habit (deps: stand-ins for
//     pastWet, hoursAt and bestWindow, for tests)
//   actTake(env, u, { id }, { t }) → { act, rule: { rule, level, line } }       (POST today/act: Take, or Keep)
//   actUndo(env, u, { id }, { t }) → { act, rule, said }                         (POST today/act/undo; restores only
//     what's unchanged since, in one guarded batch, else says "You've changed it since, so nothing was undone.")
//   rulesGet(env, u, { t }) → { rules: [{ rule, name, level, setBy, record, line, soon? }] }   (GET today/rules)
//   rulesPut(env, u, { rule, level }, { t }) → { rule, level, setBy: "you", line }            (PUT today/rules)
//   actsFor(env, userId, day) → the day's acts: [{ id, rule, kind, state, level, said, undoUntil, target, was, now }]
//   planned(env, userId, day) → whether the day's plan has run (its td_plans row)
//   ruleLevel(env, userId, rule) → "do" | "suggest" | "quiet" (no row, or no table yet: "do")
// Every act and rule is the account's own; another account's is never found (404).
// The tables are functions/_today.js's (td_acts, td_plans, td_rules, made in its setup).
// (B0's: the handlers answer 501 "Not built yet.", so the page's fallbacks work from the start; planDay does nothing;
// actsFor, planned and ruleLevel are complete. Then batch T2 writes the rest; the names and arguments stay.)
import { HttpError } from "./_http.js";
import { tddb } from "./_today.js";

export const LEVELS = ["do", "suggest", "quiet"];
const DAYKEY = /^\d{4}-\d\d-\d\d$/;
const parsed = (s) => { if (s == null) return null; try { return JSON.parse(s); } catch (_) { return null; } };

const notYet = () => { throw new HttpError(501, "Not built yet."); };

export async function planDay(env, u, t, deps = {}) {
  return { acts: [] };
}
export async function actTake(env, u, b, { t } = {}) { notYet(); }
export async function actUndo(env, u, b, { t } = {}) { notYet(); }
export async function rulesGet(env, u, { t } = {}) { notYet(); }
export async function rulesPut(env, u, b, { t } = {}) { notYet(); }

export async function actsFor(env, userId, day) {
  if (typeof day !== "string" || !DAYKEY.test(day)) return [];
  const D = await tddb(env);
  const { results } = await D.prepare("SELECT id, rule, kind, state, level, said, undo_until, target, was, now FROM td_acts WHERE user_id = ? AND day = ? ORDER BY made, id")
    .bind(userId, day).all();
  return (results || []).map((r) => ({ id: r.id, rule: r.rule, kind: r.kind, state: r.state, level: r.level, said: r.said, undoUntil: r.undo_until,
    target: r.target, was: parsed(r.was), now: parsed(r.now) }));
}
export async function planned(env, userId, day) {
  if (typeof day !== "string" || !DAYKEY.test(day)) return false;
  const D = await tddb(env);
  return !!(await D.prepare("SELECT 1 AS ok FROM td_plans WHERE user_id = ? AND day = ?").bind(userId, day).first());
}
export async function ruleLevel(env, userId, rule) {
  try {
    const D = await tddb(env), r = await D.prepare("SELECT level FROM td_rules WHERE user_id = ? AND rule = ?").bind(userId, String(rule ?? "")).first();
    return LEVELS.includes(r?.level) ? r.level : "do";
  } catch (_) { return "do"; }
}
