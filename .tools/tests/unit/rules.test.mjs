// The rules Today acts by, and their levels (functions/_todayacts.js, Today First spec §7.5, after the month demo): an
// Undo drops a rule one level at once; ten kept since its last change, and a week, climb one; a month of suggestions
// left untaken goes quiet; nothing steps on its own more than once a week, nor for a month after it's set by hand (but an
// Undo still drops it); the habit's strength caps addRide (6 of 8 may act, 4 of 8 only suggest, fewer nothing); the
// habit's counts themselves; the record's words; and You's reading and setting of them (GET/PUT today/rules), against
// a database of its own (Node's own SQLite in memory, standing in for D1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { db } from "../../../functions/_pigeon.js";
import { tddb } from "../../../functions/_today.js";
import { levelOf, capOf, cappedLevel, recordLine, habitBuckets, rulesGet, rulesPut, ruleLevel, LEVELS, RULE_NAMES } from "../../../functions/_todayacts.js";

const DAY = 24 * 3600e3, T = Date.UTC(2026, 10, 2, 7, 0);
const rec = (o = {}) => ({ level: "do", set_by: "auto", level_at: T - 60 * DAY, kept_since: 0, ...o });

test("an Undo drops a rule one level at once (do → suggest → quiet), even one set by hand yesterday; quiet stays quiet", () => {
  assert.deepEqual(levelOf(rec(), T, { undo: true }), { level: "suggest", changed: true });
  assert.deepEqual(levelOf(rec({ level: "suggest" }), T, { undo: true }), { level: "quiet", changed: true });
  assert.deepEqual(levelOf(rec({ level: "quiet" }), T, { undo: true }), { level: "quiet", changed: false });
  assert.deepEqual(levelOf(rec({ set_by: "you", level_at: T - DAY }), T, { undo: true }), { level: "suggest", changed: true }, "a hand-set level, an hour old: dropped all the same");
  assert.deepEqual(levelOf(rec({ level_at: T - 60e3 }), T, { undo: true }), { level: "suggest", changed: true }, "an Undo isn't held by the week");
  assert.equal(levelOf({}, T, { undo: true }).level, "suggest", "a rule with no record starts at do");
});

test("ten kept since the last change, and at least seven days since it, climb one level; nine, or six days, don't", () => {
  assert.deepEqual(levelOf(rec({ level: "suggest", kept_since: 10, level_at: T - 7 * DAY }), T), { level: "do", changed: true });
  assert.deepEqual(levelOf(rec({ level: "quiet", kept_since: 12, level_at: T - 8 * DAY }), T), { level: "suggest", changed: true }, "one level at a time");
  assert.equal(levelOf(rec({ level: "suggest", kept_since: 9, level_at: T - 20 * DAY }), T).changed, false);
  assert.equal(levelOf(rec({ level: "suggest", kept_since: 30, level_at: T - 6 * DAY }), T).changed, false, "one step a week at most");
  assert.equal(levelOf(rec({ level: "do", kept_since: 30 }), T).changed, false, "do is as high as it goes");
});

test("a suggestion offered and left untaken for 30 days goes quiet; taken in the month, or none offered, it stays", () => {
  const s = (o) => rec({ level: "suggest", level_at: T - 40 * DAY, ...o });
  assert.deepEqual(levelOf(s({ ignoredSince: 3, lastTake: 0 }), T), { level: "quiet", changed: true });
  assert.equal(levelOf(s({ ignoredSince: 3, lastTake: T - 29 * DAY }), T).changed, false, "one taken 29 days ago");
  assert.equal(levelOf(s({ ignoredSince: 0 }), T).changed, false, "nothing offered: nothing ignored");
  assert.equal(levelOf(s({ ignoredSince: 2, level_at: T - 29 * DAY }), T).changed, false, "suggest for only 29 days");
  assert.equal(levelOf(rec({ level: "do", ignoredSince: 5 }), T).changed, false, "only a rule at suggest goes quiet");
});

test("a level set by hand isn't moved automatically for 30 days; then it may be", () => {
  const you = (o) => rec({ set_by: "you", ...o });
  assert.equal(levelOf(you({ level: "suggest", kept_since: 15, level_at: T - 20 * DAY }), T).changed, false);
  assert.equal(levelOf(you({ level: "suggest", ignoredSince: 4, level_at: T - 29 * DAY }), T).changed, false);
  assert.deepEqual(levelOf(you({ level: "suggest", kept_since: 15, level_at: T - 31 * DAY }), T), { level: "do", changed: true });
});

test("the habit's strength caps addRide's level: 6 of 8 may act, 4 of 8 only suggests, fewer nothing", () => {
  assert.equal(capOf(8), "do"); assert.equal(capOf(6), "do"); assert.equal(capOf(5.9), "suggest"); assert.equal(capOf(4), "suggest"); assert.equal(capOf(3.9), null); assert.equal(capOf(0), null);
  assert.equal(cappedLevel("do", "do"), "do");
  assert.equal(cappedLevel("do", "suggest"), "suggest");
  assert.equal(cappedLevel("suggest", "do"), "suggest", "the rule's own level is a cap too");
  assert.equal(cappedLevel("quiet", "do"), "quiet");
  assert.equal(cappedLevel("do", null), null);
});

test("the habit's counts: by weekday and start hour (±1 h) over the last 8 weeks, dry ones only, the median length", () => {
  const TZ = "Europe/London", today = "2026-11-02", H = 3600e3;
  const at = (day, hh, mm = 0) => { const [y, m, d] = day.split("-").map(Number); return Date.UTC(y, m - 1, d, hh, mm) - (day < "2026-10-25" ? H : 0); };
  const thu = ["2026-09-10", "2026-09-17", "2026-09-24", "2026-10-01", "2026-10-08", "2026-10-15", "2026-10-22", "2026-10-29"];
  // (Thursdays about 10: 09:40, 10:05, 10:20, 10:00, 11:10, 09:55; and one Saturday at 08:00)
  const rides = [["2026-09-10", 9, 40, 5400], ["2026-09-17", 10, 5, 7200], ["2026-09-24", 10, 20, 7800], ["2026-10-01", 10, 0, 7200], ["2026-10-08", 11, 10, 6000], ["2026-10-29", 9, 55, 9000],
    ["2026-10-31", 8, 0, 3600]].map(([d, h, m, secs]) => ({ start: at(d, h, m), secs }));
  const b = habitBuckets(rides, { today, tz: TZ });
  const th = b.find((x) => x.weekday === 4), sa = b.find((x) => x.weekday === 6);
  assert.deepEqual({ hour: th.hour, k: th.k, n: th.n, strength: th.strength, cap: th.cap, secs: th.secs }, { hour: 10, k: 6, n: 8, strength: 6, cap: "do", secs: 7200 });
  assert.deepEqual({ k: sa.k, cap: sa.cap }, { k: 1, cap: null });
  assert.equal(b.length, 2, "only the weekdays ridden");
  // (two Thursdays wet at 10 and not ridden: 6 of the 6 dry ones)
  const wet = { "2026-10-15": { 9: true, 10: true, 11: true }, "2026-10-22": { 10: true } };
  const w = habitBuckets(rides, { today, tz: TZ, past: wet }).find((x) => x.weekday === 4);
  assert.deepEqual({ k: w.k, n: w.n, strength: w.strength, cap: w.cap }, { k: 6, n: 6, strength: 8, cap: "do" });
  // (wet weeks leave fewer than 4 it could have been ridden: nothing to go on)
  const soaked = Object.fromEntries(thu.map((d) => [d, { 9: true, 10: true, 11: true }]));
  const few = habitBuckets(rides.slice(0, 2), { today, tz: TZ, past: soaked }).find((x) => x.weekday === 4);
  assert.deepEqual({ k: few.k, n: few.n, strength: few.strength, cap: few.cap }, { k: 2, n: 2, strength: 0, cap: null });
  // (rides older than 8 weeks, or today's, aren't counted)
  assert.deepEqual(habitBuckets([{ start: at("2026-09-03", 10), secs: 3600 }, { start: at(today, 10), secs: 3600 }], { today, tz: TZ }), []);
});

test("the record's words", () => {
  assert.equal(recordLine("moveRide", { done: 3, kept: 3 }), "Moved 3 · kept 3");
  assert.equal(recordLine("addRide", { done: 2, kept: 2, undone: 1 }), "Added 2 · kept 2 · undone 1");
  assert.equal(recordLine("holdRide", { held: 14 }), "Held 14");
  assert.equal(recordLine("moveRide", {}), "Moved 0 · kept 0");
  assert.equal(recordLine("later", {}), "Coming in a later version");
});

function d1() {
  const s = new DatabaseSync(":memory:");
  const val = (a) => a.map((x) => (typeof x === "boolean" ? +x : x === undefined ? null : x));
  const st = (sql, args = []) => ({
    bind: (...a) => st(sql, a),
    first: async () => s.prepare(sql).get(...val(args)) ?? null,
    all: async () => ({ results: s.prepare(sql).all(...val(args)), meta: {} }),
    run: async () => ({ meta: { changes: Number(s.prepare(sql).run(...val(args)).changes) } }),
    now: () => (/^\s*SELECT|\bRETURNING\b/i.test(sql) ? { results: s.prepare(sql).all(...val(args)) } : { meta: { changes: Number(s.prepare(sql).run(...val(args)).changes) } }),
  });
  return { sql: s, prepare: (sql) => st(sql), async batch(list) { s.exec("BEGIN"); try { const r = list.map((x) => x.now()); s.exec("COMMIT"); return r; } catch (e) { s.exec("ROLLBACK"); throw e; } } };
}

test("You's rules: the three of milestone 1 with levels, who set them and their records; the two to come; a level set by hand", async () => {
  const env = { DB: d1() };
  await db(env); await tddb(env);
  const u = { id: "ann" };
  let r = await rulesGet(env, u, { t: T });
  assert.deepEqual(r.rules.map((x) => x.rule), ["moveRide", "addRide", "holdRide", "later", "arrange"]);
  assert.deepEqual(r.rules[0], { rule: "moveRide", name: RULE_NAMES.moveRide, level: "do", setBy: "auto", record: { done: 0, kept: 0, undone: 0, ignored: 0, held: 0 }, line: "Moved 0 · kept 0" }, "every rule starts at do");
  assert.deepEqual(r.rules[3], { rule: "later", name: "Deliver when a friend is free", level: "do", setBy: "auto", record: { done: 0, kept: 0, undone: 0, ignored: 0, held: 0 }, line: "Coming in a later version", soon: true });
  assert.equal(r.rules[4].soon, true);
  // (held counted by the ride hold: functions/_busy.js)
  env.DB.sql.prepare("INSERT INTO td_rules (user_id, rule, held) VALUES ('ann', 'holdRide', 14)").run();
  r = await rulesPut(env, u, { rule: "addRide", level: "suggest" }, { t: T });
  assert.deepEqual(r, { rule: "addRide", level: "suggest", setBy: "you", line: "Added 0 · kept 0" });
  assert.equal(await ruleLevel(env, "ann", "addRide"), "suggest");
  assert.deepEqual({ ...env.DB.sql.prepare("SELECT level, set_by, level_at, kept_since FROM td_rules WHERE user_id = 'ann' AND rule = 'addRide'").get() }, { level: "suggest", set_by: "you", level_at: T, kept_since: 0 });
  r = await rulesGet(env, u, { t: T });
  assert.deepEqual(r.rules.find((x) => x.rule === "holdRide"), { rule: "holdRide", name: "Hold messages while you ride", level: "do", setBy: "auto", record: { done: 0, kept: 0, undone: 0, ignored: 0, held: 14 }, line: "Held 14" });
  assert.equal(r.rules.find((x) => x.rule === "addRide").setBy, "you");
  await rulesPut(env, u, { rule: "holdRide", level: "quiet" }, { t: T });
  assert.equal(await ruleLevel(env, "ann", "holdRide"), "quiet");
  for (const bad of [{ rule: "moveRide", level: "loud" }, { rule: "nope", level: "do" }, {}, { rule: "moveRide" }]) await assert.rejects(rulesPut(env, u, bad, { t: T }), (e) => e.status === 400 && e.message === "Choose Do, Suggest or Quiet.");
  await assert.rejects(rulesPut(env, u, { rule: "later", level: "do" }, { t: T }), (e) => e.status === 400);
  assert.deepEqual((await rulesGet(env, { id: "bo" }, { t: T })).rules.map((x) => x.level), ["do", "do", "do", "do", "do"], "another account's are its own");
  await assert.rejects(rulesGet(env, u, {}), TypeError, "the route's time, always");
  assert.deepEqual(LEVELS, ["do", "suggest", "quiet"]);
});
