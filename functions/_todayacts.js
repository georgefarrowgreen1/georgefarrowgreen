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
// (B0's stub: the handlers answer 501 "Not built yet.", so the page's fallbacks work from the start; planDay does
// nothing; the reads answer as for an account with nothing kept. B0's second part writes actsFor, planned and ruleLevel
// in full, then batch T2 the rest; the names and arguments stay.)
import { HttpError } from "./_http.js";

const notYet = () => { throw new HttpError(501, "Not built yet."); };

export async function planDay(env, u, t, deps = {}) {
  return { acts: [] };
}
export async function actTake(env, u, b, { t } = {}) { notYet(); }
export async function actUndo(env, u, b, { t } = {}) { notYet(); }
export async function rulesGet(env, u, { t } = {}) { notYet(); }
export async function rulesPut(env, u, b, { t } = {}) { notYet(); }

export async function actsFor(env, userId, day) {
  return [];
}
export async function planned(env, userId, day) {
  return false;
}
export async function ruleLevel(env, userId, rule) {
  return "do";
}
