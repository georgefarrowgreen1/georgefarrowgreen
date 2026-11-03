// Today's acts with Undo (functions/_todayacts.js, Today First spec §7.5), against a database of its own (Node's own
// SQLite in memory, standing in for D1, with the site's schema), the weather stood in for through planDay's deps: the
// day's plan claimed once (td_plans), so the morning's tick and a page read never both act, and idempotent besides; acts
// only on rides an hour or more off; a clash moved at do (an explicit own ride only: the day's fx_times row or a kept
// ride of Today's own; an agreed ride with a friend never), offered at suggest, the line alone at quiet, and said with
// no act when no time is free; the habit adding a ride at 6 of 8 dry weeks, offering one at 4, nothing at 3, indoor
// rides not counted, a wet or planned day skipped; Take, Keep and Undo, which restores only what's unchanged since,
// once however many ask at once, and never another account's; what's kept and ignored tallied; Ride Then; and the
// account's export and drop.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { db } from "../../../functions/_pigeon.js";
import { tddb, todayExport, dropToday } from "../../../functions/_today.js";
import { wxdb } from "../../../functions/_wxpush.js";
import { fitdb } from "../../../functions/_fitness.js";
import { setTime, timeFor } from "../../../functions/_fittimes.js";
import { addTodayOffer, takeOffer, answerOffer, offersFor } from "../../../functions/_fitshare.js";
import { timesExport } from "../../../functions/_times.js";
import { setSnapshot } from "../../../functions/_fittoday.js";
import { countedDb } from "../../../functions/_todaymorning.js";
import * as A from "../../../functions/_todayacts.js";

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
const env = { DB: d1() };
await db(env); await tddb(env); await wxdb(env); await fitdb(env); await timesExport(env, "nobody"); await offersFor(env, "nobody");
const q = (sql, ...a) => env.DB.sql.prepare(sql).all(...a), one = (sql, ...a) => env.DB.sql.prepare(sql).get(...a), run = (sql, ...a) => env.DB.sql.prepare(sql).run(...a);

const MIN = 60e3, H = 3600e3, DAY = 24 * H;
const T = Date.UTC(2026, 10, 2, 7, 0);         // (07:00 on Monday 2 November 2026 in London: GMT)
const TODAY = "2026-11-02", TZ = "Europe/London", HOME = { name: "London", lat: 51.51, lon: -0.13 };
// (a wall time in London on a day of this autumn: summer time until 25 October)
const london = (day, hh, mm = 0) => { const [y, m, d] = day.split("-").map(Number); return Date.UTC(y, m - 1, d, hh, mm) - (day < "2026-10-25" ? H : 0); };

// The week's weather where you ride, stood in for (hoursAt): light from 07:00 to 17:00, dry unless wet(t) says
const week = (wet = () => false) => ({ offset: 0, hours: Array.from({ length: 7 * 24 }, (_, i) => {
  const t = Date.UTC(2026, 10, 2) + i * H, h = new Date(t).getUTCHours(), w = wet(t);
  return { t, temp: 12, feels: 11, pop: w ? 90 : 5, rain: w ? 2 : 0, code: w ? 61 : 2, wind: 10, gust: 20, dir: 250, day: h >= 7 && h < 17 };
}) });
// (today: rain until 15:00, so the only dry two hours of daylight are 15:00 to 17:00)
const RAINY_MORNING = week((t) => t < Date.UTC(2026, 10, 2, 15));
const deps = (wx = RAINY_MORNING, past = null) => ({ hoursAt: async () => wx, pastWet: async () => past });

// accounts: each with its Weather place (where it rides), names off unless said
let n = 0;
async function account({ prefs = null, home = true } = {}) {
  const id = `u${++n}`;
  run("INSERT INTO pg_users (id, handle, name, email, pub, salt, proof_hash, vault, swift, swift_at, created_at, notify_prefs) VALUES (?1, ?1, ?1, ?1 || '@example.com', '{}', 's', 'p', 'v', 3, ?2, ?2, ?3)", id, T, prefs ? JSON.stringify(prefs) : null);
  if (home) run("INSERT INTO wx_accts (user_id, data, ver, updated) VALUES (?, ?, 1, ?)", id, JSON.stringify({ places: [HOME], settings: {}, notify: {} }), T);
  return { id, notify_prefs: prefs ? JSON.stringify(prefs) : null };
}
// a ride set at a time (Ride At in Fitness), a call agreed in Chat (td_times, yes), and a ride agreed with a friend
const rideAt = (u, start, mins = 75, source = "set") => setTime(env, u.id, { day: TODAY, start, stop: start + mins * MIN, tz: TZ, source }, { t: T - DAY });
const call = (u, start, mins = 30, who = "Mira", kind = "call") => run(`INSERT INTO td_times (user_id, id, kind, start, stop, tz, with_id, who, role, state, made, until)
  VALUES (?, ?, ?, ?, ?, ?, 'mira-id', ?, 'answered', 'yes', ?, ?)`, u.id, crypto.randomUUID(), kind, start, start + mins * MIN, TZ, who, T - DAY, start + mins * MIN + 12 * H);
const agreed = (u, start, hours = 2, who = "Leo", state = "yes") => { const id = crypto.randomUUID();
  run(`INSERT INTO fx_offers (user_id, id, start, stop, tz, sport, wid, name, secs, who, role, far, dry, state, made, until, with_id, taken)
    VALUES (?, ?, ?, ?, ?, 'ride', 'free-ride', 'Ride how you like', ?, ?, 'answered', 0, 1, ?, ?, ?, 'leo-id', ?)`, u.id, id, start, start + hours * H, TZ, hours * 3600, who, state, T - DAY, start + hours * H + 12 * H, state === "yes" ? 1 : 0);
  return id; };
const acts = (u) => q("SELECT * FROM td_acts WHERE user_id = ? ORDER BY made, id", u.id).map((r) => ({ ...r, was: JSON.parse(r.was ?? "null"), now: JSON.parse(r.now ?? "null") }));
const rule = (u, r) => one("SELECT * FROM td_rules WHERE user_id = ? AND rule = ?", u.id, r);
const offer = (id) => one("SELECT * FROM fx_offers WHERE id = ?", id);

test("planDay claims the day first: the tick and a page read at once act once; again later that day, nothing; idempotent", async () => {
  const u = await account();
  await rideAt(u, london(TODAY, 18)); call(u, london(TODAY, 18, 30));
  const [a, b] = await Promise.all([A.planDay(env, u, T, deps()), A.planDay(env, u, T + MIN, deps())]);
  assert.equal(a.acts.length + b.acts.length, 1, "one of them acted");
  assert.equal(q("SELECT * FROM td_plans WHERE user_id = ?", u.id).length, 1);
  assert.equal(await A.planned(env, u.id, TODAY), true);
  assert.deepEqual((await A.planDay(env, u, T + 2 * H, deps())).acts, [], "the day's planned already");
  assert.equal(acts(u).length, 1);
  assert.equal(await A.planned(env, u.id, "2026-11-03"), false);
});

test("a clash at do: the ride moved to the best free time today (the same length, clear by 15 minutes, daylight, dry), with Undo; the record counts it", async () => {
  const u = await account();
  await rideAt(u, london(TODAY, 18)); call(u, london(TODAY, 18, 30));
  const { acts: made } = await A.planDay(env, u, T, deps());
  assert.equal(made.length, 1);
  const [x] = acts(u);
  assert.deepEqual({ rule: x.rule, kind: x.kind, state: x.state, level: x.level, day: x.day, target: x.target }, { rule: "moveRide", kind: "move", state: "done", level: "do", day: TODAY, target: `time:${TODAY}` });
  assert.equal(x.said, "Moved your ride to 15:00, clear of Mira’s call");
  assert.deepEqual(await timeFor(env, u.id, TODAY), { day: TODAY, start: london(TODAY, 15), stop: london(TODAY, 16, 15), tz: TZ, sport: "ride", source: "moved" });
  assert.deepEqual(x.was, { day: TODAY, start: london(TODAY, 18), stop: london(TODAY, 19, 15), tz: TZ, sport: "ride", source: "set" });
  assert.deepEqual(x.now.why, { kind: "call", who: "Mira", start: london(TODAY, 18, 30) });
  assert.equal(x.undo_until, london(TODAY, 14), "Undo until an hour before the ride");
  assert.equal(rule(u, "moveRide").done, 1);
  const seen = await A.actsFor(env, u.id, TODAY);
  assert.deepEqual(seen.map((a) => [a.id, a.state, a.undoUntil, a.day]), [[x.id, "done", x.undo_until, TODAY]]);
});

test("acts only on a ride starting an hour or more from now; an agreed ride with a friend is never moved, only said; one of your own that runs into it is", async () => {
  const soon = await account();
  await rideAt(soon, T + 30 * MIN); call(soon, T + 45 * MIN);
  assert.deepEqual((await A.planDay(env, soon, T, deps())).acts, [], "starting in 30 minutes: left alone");
  assert.equal((await timeFor(env, soon.id, TODAY)).source, "set");

  const u = await account();
  const leo = agreed(u, london(TODAY, 15), 2), mine = london(TODAY, 16);
  call(u, london(TODAY, 16, 30));
  await rideAt(u, mine, 60);
  await A.planDay(env, u, T, deps(week()));
  const xs = acts(u), moved = xs.find((a) => a.target === `time:${TODAY}`), line = xs.find((a) => a.target === `offer:${leo}`);
  assert.equal(moved.state, "done");
  assert.ok((await timeFor(env, u.id, TODAY)).start < london(TODAY, 14, 45), "your own moved clear of Leo's ride and the call");
  assert.deepEqual({ state: line.state, level: line.level }, { state: "said", level: "none" });
  assert.equal(line.said, "Your ride with Leo at 15:00 runs into Mira’s call at 16:30");
  assert.deepEqual([offer(leo).start, offer(leo).stop], [london(TODAY, 15), london(TODAY, 17)], "Leo's ride as it was");
});

test("at suggest: offered (Move It), nothing moved until Take; then the record counts it; Undo after a hand change restores nothing and says so", async () => {
  const u = await account();
  await A.rulesPut(env, u, { rule: "moveRide", level: "suggest" }, { t: T - 40 * DAY });
  await rideAt(u, london(TODAY, 18)); call(u, london(TODAY, 18, 30));
  await A.planDay(env, u, T, deps());
  const [x] = acts(u);
  assert.deepEqual({ state: x.state, level: x.level }, { state: "offered", level: "suggest" });
  assert.equal(x.said, "Your ride at 18:00 runs into Mira’s call at 18:30; 15:00 is clear");
  assert.equal((await timeFor(env, u.id, TODAY)).start, london(TODAY, 18), "not moved");
  const r = await A.actTake(env, u, { id: x.id }, { t: T + H });
  assert.equal(r.act.state, "taken");
  assert.deepEqual(r.rule, { rule: "moveRide", level: "suggest", line: "Moved 1 · kept 0" });
  assert.equal((await timeFor(env, u.id, TODAY)).start, london(TODAY, 15));
  await assert.rejects(A.actTake(env, u, { id: x.id }, { t: T + H }), (e) => e.status === 409, "taken once");
  // (Ride At in Fitness, by hand, since)
  await setTime(env, u.id, { day: TODAY, start: london(TODAY, 13), stop: london(TODAY, 14, 15), tz: TZ, source: "set" }, { t: T + 2 * H });
  const back = await A.actUndo(env, u, { id: x.id }, { t: T + 2 * H });
  assert.equal(back.said, "You’ve changed it since, so nothing was undone.");
  assert.equal(back.act.state, "taken", "the act as it was");
  assert.equal((await timeFor(env, u.id, TODAY)).start, london(TODAY, 13), "the hand change kept");
  assert.equal(rule(u, "moveRide").level, "suggest", "the level not dropped");
  assert.equal(rule(u, "moveRide").undone, 0);
});

test("at quiet: the clash line alone, nothing moved; no free time: said so, at no level; the weather not to be had: the line", async () => {
  const quiet = await account();
  await A.rulesPut(env, quiet, { rule: "moveRide", level: "quiet" }, { t: T - 40 * DAY });
  await rideAt(quiet, london(TODAY, 18)); call(quiet, london(TODAY, 18, 30));
  await A.planDay(env, quiet, T, deps());
  let [x] = acts(quiet);
  assert.deepEqual({ state: x.state, level: x.level, said: x.said }, { state: "said", level: "quiet", said: "Your ride at 18:00 runs into Mira’s call at 18:30" });
  assert.equal((await timeFor(env, quiet.id, TODAY)).start, london(TODAY, 18));

  // (planned at 14:00: the daylight left, 15:00 to 17:00, is the meeting's)
  const none = await account();
  await rideAt(none, london(TODAY, 16)); call(none, london(TODAY, 15, 30), 30, "Pat", "meet");
  await A.planDay(env, none, london(TODAY, 14), deps(week()));
  [x] = acts(none);
  assert.deepEqual({ state: x.state, level: x.level }, { state: "said", level: "none" });
  assert.equal(x.said, "Your ride at 16:00 runs into meeting Pat at 15:30, and there’s no clear time left today to move it to");
  assert.equal((await timeFor(env, none.id, TODAY)).source, "set");
  assert.equal(rule(none, "moveRide").done, 0);

  const nowhere = await account({ home: false });
  await rideAt(nowhere, london(TODAY, 18)); call(nowhere, london(TODAY, 18, 30));
  await A.planDay(env, nowhere, T, deps());
  assert.equal(acts(nowhere)[0].said, "Your ride at 18:00 runs into Mira’s call at 18:30", "no place to look at the weather: the clash said");
});

test("Undo of a move puts it back while it's as Today left it: once, however many ask at once; the rule drops a level and says so; another account's can't be undone or taken", async () => {
  const u = await account(), other = await account();
  await rideAt(u, london(TODAY, 18)); call(u, london(TODAY, 18, 30));
  await A.planDay(env, u, T, deps());
  const [x] = acts(u);
  await assert.rejects(A.actUndo(env, other, { id: x.id }, { t: T + H }), (e) => e.status === 404);
  await assert.rejects(A.actTake(env, other, { id: x.id }, { t: T + H }), (e) => e.status === 404);
  await assert.rejects(A.actUndo(env, u, { id: "nope" }, { t: T + H }), (e) => e.status === 400);
  const both = await Promise.all([A.actUndo(env, u, { id: x.id }, { t: T + H }), A.actUndo(env, u, { id: x.id }, { t: T + H })]);
  const said = both.map((r) => r.said).sort();
  assert.deepEqual(said, ["That’s undone already.", "Undone. Moves are suggested now, not made"]);
  assert.ok(both.every((r) => r.act.state === "undone"));
  assert.deepEqual(both.find((r) => r.said.startsWith("Undone."))?.rule, { rule: "moveRide", level: "suggest", line: "Moved 1 · kept 0 · undone 1" });
  assert.deepEqual(await timeFor(env, u.id, TODAY), { day: TODAY, start: london(TODAY, 18), stop: london(TODAY, 19, 15), tz: TZ, sport: "ride", source: "set" }, "put back as it was");
  const r = rule(u, "moveRide");
  assert.deepEqual({ level: r.level, undone: r.undone, level_at: r.level_at, set_by: r.set_by }, { level: "suggest", undone: 1, level_at: T + H, set_by: "auto" });
  await assert.rejects(A.actTake(env, u, { id: x.id }, { t: T + H }), (e) => e.status === 409, "nothing to take");
  // (and too late: past its Undo)
  const v = await account();
  await rideAt(v, london(TODAY, 18)); call(v, london(TODAY, 18, 30));
  await A.planDay(env, v, T, deps());
  await assert.rejects(A.actUndo(env, v, { id: acts(v)[0].id }, { t: london(TODAY, 14) }), (e) => e.status === 409);
});

test("a kept ride of Today's own is moved by its times (the offer), and put back by Undo; one not kept is no one's ride to move", async () => {
  const u = await account();
  const id = await addTodayOffer(env, u.id, { start: london(TODAY, 16), stop: london(TODAY, 17), tz: TZ, sport: "ride", wid: "free-ride", name: "Ride how you like", secs: 3600, state: "yes" }, { t: T - DAY });
  call(u, london(TODAY, 16, 30));
  await A.planDay(env, u, T, deps());
  assert.equal(acts(u).length, 0, "not kept (taken 0): an auto-added ride isn't moved");
  const v = await account();
  const kid = await addTodayOffer(env, v.id, { start: london(TODAY, 16), stop: london(TODAY, 17), tz: TZ, sport: "ride", wid: "free-ride", name: "Ride how you like", secs: 3600, state: "yes" }, { t: T - DAY });
  await takeOffer(env, v.id, kid, { t: T - DAY });
  call(v, london(TODAY, 16, 30));
  await A.planDay(env, v, T, deps());
  const [x] = acts(v);
  assert.equal(x.target, `offer:${kid}`);
  assert.deepEqual([offer(kid).start, offer(kid).stop], [london(TODAY, 15), london(TODAY, 16)]);
  const r = await A.actUndo(env, v, { id: x.id }, { t: T + H });
  assert.equal(r.act.state, "undone");
  assert.deepEqual([offer(kid).start, offer(kid).stop, offer(kid).state], [london(TODAY, 16), london(TODAY, 17), "yes"]);
  assert.equal(offer(id).start, london(TODAY, 16));
});

// ---- the habit ----
const THURSDAYS = ["2026-09-10", "2026-09-17", "2026-09-24", "2026-10-01", "2026-10-08", "2026-10-15", "2026-10-22", "2026-10-29"];
const PLAN = (thursday = { state: "rest", why: "Easy week" }) => ({ tz: TZ, units: "metric", days: { [TODAY]: { state: "none" }, "2026-11-03": { state: "none" }, "2026-11-04": { state: "none" }, "2026-11-05": thursday } });
let rid = 0;
function rides(u, days, { hour = 10, indoor = 0, secs = 7200 } = {}) {
  for (const day of days) run("INSERT INTO fx_acts (user_id, id, start, sport, indoor, name, type, size, sum, added) VALUES (?, ?, ?, 'ride', ?, 'Ride', 'fit', 1, ?, ?)",
    u.id, `r${++rid}`, london(day, hour), indoor, JSON.stringify({ secs }), T - DAY);
}
async function habitual(k, o = {}) {
  const u = await account();
  rides(u, THURSDAYS.slice(0, k), o);
  await setSnapshot(env, u.id, o.plan || PLAN());
  return u;
}

test("the habit: 6 of 8 dry Thursdays adds Thursday's ride (Today's own, agreed, holding nothing until Keep), with Undo; was the day's plan", async () => {
  const u = await habitual(6);
  const { acts: made } = await A.planDay(env, u, T, deps(week()));
  assert.equal(made.length, 1);
  const [x] = acts(u);
  assert.deepEqual({ rule: x.rule, kind: x.kind, state: x.state, level: x.level, day: x.day, target: x.target }, { rule: "addRide", kind: "add", state: "done", level: "do", day: TODAY, target: "day:2026-11-05" });
  assert.equal(x.said, "Added: a ride on Thursday at 10:00 · Six of the last eight dry Thursdays. Thursday’s dry");
  assert.deepEqual(x.was, { planned: "rest" });
  const o = offer(x.now.offer);
  assert.deepEqual({ role: o.role, state: o.state, taken: o.taken, who: o.who, wid: o.wid, start: o.start, stop: o.stop, secs: o.secs },
    { role: "today", state: "yes", taken: 0, who: "", wid: "free-ride", start: london("2026-11-05", 10), stop: london("2026-11-05", 12), secs: 7200 });
  assert.equal(x.undo_until, london("2026-11-05", 9));
  assert.equal(rule(u, "addRide").done, 1);
  // (Thursday's own reading of the day has it, so its morning can ask Keep; Wednesday's doesn't)
  assert.deepEqual((await A.actsFor(env, u.id, "2026-11-05")).map((a) => a.id), [x.id]);
  assert.deepEqual(await A.actsFor(env, u.id, "2026-11-04"), []);
});

test("the habit: 4 of 8 offers (Add Thursday's Ride, the offer new until taken); 3 of 8 nothing; indoor rides don't count", async () => {
  const four = await habitual(4);
  await A.planDay(env, four, T, deps(week()));
  const [x] = acts(four);
  assert.deepEqual({ state: x.state, level: x.level }, { state: "offered", level: "suggest" });
  assert.equal(x.said, "A ride on Thursday at 10:00 · Four of the last eight dry Thursdays. Thursday’s dry");
  assert.deepEqual({ state: offer(x.now.offer).state, taken: offer(x.now.offer).taken }, { state: "new", taken: 0 });
  assert.equal(rule(four, "addRide").done, 0);
  const r = await A.actTake(env, four, { id: x.id }, { t: T + H });
  assert.equal(r.act.state, "taken");
  assert.deepEqual({ state: offer(x.now.offer).state, taken: offer(x.now.offer).taken }, { state: "yes", taken: 1 }, "Take: a tap, so taken");
  assert.equal(rule(four, "addRide").done, 1);

  const three = await habitual(3);
  await A.planDay(env, three, T, deps(week()));
  assert.equal(acts(three).length, 0);

  const indoors = await account();
  rides(indoors, THURSDAYS.slice(0, 3)); rides(indoors, THURSDAYS.slice(3, 6), { indoor: 1 });
  await setSnapshot(env, indoors.id, PLAN());
  await A.planDay(env, indoors, T, deps(week()));
  assert.equal(acts(indoors).length, 0, "three outdoors and three on the trainer: three");
});

test("the habit: wet weeks don't count against it; a wet Thursday, a planned one, or one with a ride already, is skipped; a rule at quiet adds nothing", async () => {
  // (two of the eight Thursdays wet at 10:00, not ridden; ridden on five of the other six: 5 of 6 dry ones)
  const wet = { "2026-09-10": { 9: true, 10: true, 11: true }, "2026-09-17": { 9: true, 10: true, 11: true } };
  const u = await account();
  rides(u, THURSDAYS.slice(2, 7));
  await setSnapshot(env, u.id, PLAN());
  await A.planDay(env, u, T, deps(week(), wet));
  assert.deepEqual(acts(u).map((a) => [a.state, a.said]), [["done", "Added: a ride on Thursday at 10:00 · Five of the last six dry Thursdays. Thursday’s dry"]]);
  const blind = await account();
  rides(blind, THURSDAYS.slice(2, 7));
  await setSnapshot(env, blind.id, PLAN());
  await A.planDay(env, blind, T, deps(week(), null));
  assert.equal(acts(blind)[0]?.state, "offered", "the past weather not known: every week counted, 5 of 8");

  const rain = await habitual(8);
  await A.planDay(env, rain, T, deps(week((t) => t >= london("2026-11-05", 10) && t < london("2026-11-05", 12))));
  assert.equal(acts(rain).length, 0, "Thursday wet at 10:00");
  const busy = await habitual(8, { plan: PLAN({ state: "session", id: "rh:tempo:60", sport: "ride", name: "Tempo", kind: "Tempo", secs: 3600, tss: 60 }) });
  await A.planDay(env, busy, T, deps(week()));
  assert.equal(acts(busy).length, 0, "Thursday planned in Fitness");
  const set = await habitual(8);
  await setTime(env, set.id, { day: "2026-11-05", start: london("2026-11-05", 14), stop: london("2026-11-05", 15), tz: TZ, source: "set" }, { t: T });
  await A.planDay(env, set, T, deps(week()));
  assert.equal(acts(set).length, 0, "Thursday has a ride time already");
  const off = await habitual(8);
  await A.rulesPut(env, off, { rule: "addRide", level: "quiet" }, { t: T - 40 * DAY });
  await A.planDay(env, off, T, deps(week()));
  assert.equal(acts(off).length, 0);
  assert.equal(await A.habitRide(env, off, T, TZ, deps(week())).then((h) => h?.day), "2026-11-05", "the habit's there all the same");
});

test("Keep on an added ride: taken (a tap), the act kept and counted; Undo turns the offer no and drops the rule, and isn't repeated by a later plan", async () => {
  const u = await habitual(6);
  await A.planDay(env, u, T, deps(week()));
  let [x] = acts(u);
  const k = await A.actTake(env, u, { id: x.id }, { t: london("2026-11-05", 7) });
  assert.equal(k.act.state, "kept");
  assert.equal(offer(x.now.offer).taken, 1);
  assert.deepEqual({ kept: rule(u, "addRide").kept, since: rule(u, "addRide").kept_since }, { kept: 1, since: 1 });
  const r = await A.actUndo(env, u, { id: x.id }, { t: london("2026-11-05", 8) });
  assert.equal(r.said, "Undone. Rides are suggested now, not added");
  assert.equal(offer(x.now.offer).state, "no");
  assert.deepEqual({ level: rule(u, "addRide").level, kept: rule(u, "addRide").kept, undone: rule(u, "addRide").undone }, { level: "suggest", kept: 0, undone: 1 });

  const v = await habitual(6);
  await A.planDay(env, v, T, deps(week()));
  [x] = acts(v);
  await A.actUndo(env, v, { id: x.id }, { t: T + H });
  // (Tuesday's plan: Thursday's ride from habit isn't put back)
  await A.planDay(env, v, T + DAY, deps(week()));
  assert.equal(acts(v).filter((a) => a.rule === "addRide").length, 1);
  // (changed in Fitness since: answered there)
  const w = await habitual(6);
  await A.planDay(env, w, T, deps(week()));
  [x] = acts(w);
  await answerOffer(env, w.id, x.now.offer, "no", { t: T + H });
  const back = await A.actUndo(env, w, { id: x.id }, { t: T + 2 * H });
  assert.equal(back.said, "You’ve changed it since, so nothing was undone.");
  assert.equal(back.act.state, "done");
  assert.equal(rule(w, "addRide").level, "do");
});

test("the next day's plan tallies: an act past its Undo is kept (counted, and toward climbing), an offer left past it ignored", async () => {
  const u = await account();
  await rideAt(u, london(TODAY, 18)); call(u, london(TODAY, 18, 30));
  await A.planDay(env, u, T, deps());
  const v = await account();
  await A.rulesPut(env, v, { rule: "moveRide", level: "suggest" }, { t: T - 40 * DAY });
  await rideAt(v, london(TODAY, 18)); call(v, london(TODAY, 18, 30));
  await A.planDay(env, v, T, deps());
  await A.planDay(env, u, T + DAY, deps()); await A.planDay(env, v, T + DAY, deps());
  assert.equal(acts(u)[0].state, "kept");
  assert.deepEqual({ kept: rule(u, "moveRide").kept, since: rule(u, "moveRide").kept_since }, { kept: 1, since: 1 });
  assert.equal(acts(v)[0].state, "ignored");
  assert.equal(rule(v, "moveRide").ignored, 1);
  const got = await A.rulesGet(env, u, { t: T + DAY });
  assert.deepEqual(got.rules.find((r) => r.rule === "moveRide"), { rule: "moveRide", name: "Move a ride around a clash", level: "do", setBy: "auto",
    record: { done: 1, kept: 1, undone: 0, ignored: 0, held: 0 }, line: "Moved 1 · kept 1" });
});

test("a rule's level stepped by the plan: ten kept and a week climbs; a month of untaken suggestions goes quiet", async () => {
  const u = await account();
  await A.planDay(env, u, T - 2 * DAY, deps());
  run("UPDATE td_rules SET level = 'suggest', level_at = ?, kept_since = 10 WHERE user_id = ? AND rule = 'moveRide'", T - 8 * DAY, u.id);
  run("UPDATE td_rules SET level = 'suggest', level_at = ? WHERE user_id = ? AND rule = 'addRide'", T - 40 * DAY, u.id);
  run(`INSERT INTO td_acts (id, user_id, rule, day, target, kind, state, level, said, made, undo_until) VALUES (?, ?, 'addRide', '2026-10-20', 'day:2026-10-22', 'add', 'ignored', 'suggest', 'x', ?, ?)`,
    crypto.randomUUID(), u.id, T - 35 * DAY, T - 33 * DAY);
  await A.planDay(env, u, T, deps());
  assert.deepEqual({ level: rule(u, "moveRide").level, since: rule(u, "moveRide").kept_since, at: rule(u, "moveRide").level_at }, { level: "do", since: 0, at: T });
  assert.equal(rule(u, "addRide").level, "quiet");
});

test("Ride Then: today's session with no time offered; taken, set to the best time then (source today); undone, the time gone", async () => {
  const u = await account();
  await setSnapshot(env, u.id, { tz: TZ, units: "metric", days: { [TODAY]: { state: "session", id: "rh:endurance:75", sport: "ride", name: "Endurance 75", kind: "Endurance", secs: 4500, tss: 60 } } });
  await A.planDay(env, u, T, deps());
  const [x] = acts(u);
  assert.deepEqual({ rule: x.rule, kind: x.kind, state: x.state, target: x.target, said: x.said }, { rule: "rideThen", kind: "time", state: "offered", target: `time:${TODAY}`, said: "Endurance 75 has no time yet" });
  const r = await A.actTake(env, u, { id: x.id }, { t: T + H, deps: deps() });
  assert.equal(r.act.state, "taken");
  assert.deepEqual(r.rule, { rule: "rideThen", level: "suggest", line: "" });
  assert.deepEqual(await timeFor(env, u.id, TODAY), { day: TODAY, start: london(TODAY, 15), stop: london(TODAY, 16, 15), tz: TZ, sport: "ride", source: "today" });
  const back = await A.actUndo(env, u, { id: x.id }, { t: T + 2 * H });
  assert.equal(back.said, "Undone. Your ride has no time again.");
  assert.equal(await timeFor(env, u.id, TODAY), null);
  // (a time set meanwhile: Ride Then has nothing to do)
  const v = await account();
  await setSnapshot(env, v.id, { tz: TZ, units: "metric", days: { [TODAY]: { state: "session", id: "rh:endurance:75", sport: "ride", name: "Endurance 75", kind: "Endurance", secs: 4500, tss: 60 } } });
  await A.planDay(env, v, T, deps());
  await rideAt(v, london(TODAY, 12));
  await assert.rejects(A.actTake(env, v, { id: acts(v)[0].id }, { t: T + H, deps: deps() }), (e) => e.status === 409);
  assert.equal((await timeFor(env, v.id, TODAY)).start, london(TODAY, 12));
});

test("the morning's words for an act: the friend named only with Chat's names on; the ride from habit by its day", () => {
  const move = { rule: "moveRide", state: "done", was: { start: london(TODAY, 18) }, now: { start: london(TODAY, 16, 45), why: { kind: "call", who: "Mira", start: london(TODAY, 18, 30) } } };
  assert.equal(A.pushLine(move, { names: true, tz: TZ, today: TODAY }), "Moved your ride to 16:45 to clear Mira’s call. Undo on Today.");
  assert.equal(A.pushLine(move, { names: false, tz: TZ, today: TODAY }), "Moved your ride to 16:45 to clear your 18:30 call. Undo on Today.");
  assert.equal(A.pushLine({ ...move, state: "offered" }, { names: false, tz: TZ, today: TODAY }), "Your ride at 18:00 runs into your 18:30 call. Move it to 16:45 on Today.");
  const add = { rule: "addRide", state: "done", now: { day: "2026-11-05", start: london("2026-11-05", 10) } };
  assert.equal(A.pushLine(add, { names: true, tz: TZ, today: TODAY }), "Added a ride on Thursday at 10:00. Undo on Today.");
  assert.equal(A.pushLine({ ...add, state: "offered" }, { tz: TZ, today: "2026-11-04" }), "Tomorrow at 10:00 looks good for your usual ride. Add it on Today.");
  for (const x of [{ ...move, state: "undone" }, { ...move, state: "said" }, { rule: "rideThen", state: "offered", now: { day: TODAY } }]) assert.equal(A.pushLine(x, { tz: TZ, today: TODAY }), null);
});

test("an account with nothing to act on costs the database little each day", async () => {
  const u = await account();
  let used = 0;
  const counted = { ...env, DB: countedDb(env.DB, (k) => { used += k; }) };
  await A.planDay(counted, u, T, deps());
  assert.ok(used <= 20, `statements: ${used}`);
  assert.deepEqual(acts(u), []);
});

test("the account's export has its acts, rules, planned days and agreed times; the account going takes them", async () => {
  const u = await account();
  await rideAt(u, london(TODAY, 18)); call(u, london(TODAY, 18, 30));
  await A.planDay(env, u, T, deps());
  const x = await todayExport(env, u.id);
  assert.equal(x.acts.length, 1);
  assert.deepEqual({ rule: x.acts[0].rule, state: x.acts[0].state, day: x.acts[0].day }, { rule: "moveRide", state: "done", day: TODAY });
  assert.deepEqual(x.rules.map((r) => r.rule), ["addRide", "holdRide", "moveRide"]);
  assert.equal(x.rules.find((r) => r.rule === "moveRide").record.done, 1);
  assert.deepEqual(x.planned, [TODAY]);
  assert.deepEqual(x.times.map((r) => [r.kind, r.who, r.state]), [["call", "Mira", "yes"]]);
  assert.ok(!JSON.stringify(x.times).includes("mira-id"), "no friend's id in the export's times");
  await dropToday(env, u.id);
  for (const t of ["td_acts", "td_rules", "td_plans", "td_times"]) assert.equal(one(`SELECT COUNT(*) AS n FROM ${t} WHERE user_id = ?`, u.id).n, 0, t);
});
