// What Fitness keeps for Chat's "Send to a friend" (functions/_fitshare.js), against a real database (node:sqlite, made
// to look like D1): a share made only as asked, a new id each time, with nothing but its day, zone and sport, and old
// ones swept as the next is made; whether a session's done (Fitness's own, and what's waiting from Garmin or Strava,
// their tables not made at first, then made without the figures they now have, then with them), by its sport; and plans
// from Chat: 20 waiting at most, one said no to staying no, past their time not shown, and a read changing nothing. And
// Today First's (spec §5.2, §8.4, §9.3): an invite's pending row (never listed, counted on its own, made a plan waiting
// only by that friend's Yes at a time it offered), the same ride with the same friend not added twice, Today's own rides
// (shown only when asked for, Take and Keep, moved and put back only while unchanged), taken on every tap, a yes said no
// to only for Today's own; and ride times (functions/_fittimes.js) with what counts as an explicit ride. A raw request's
// friend's id and pending state ignored (only a caller that checked them gives them); Today's reads and writes taking the
// route's time, never the clock's; Undo's guarded restores, alone and as statements for one batch; the tables made first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { db } from "../../../functions/_pigeon.js";
import { fitdb } from "../../../functions/_fitness.js";
import { shareFor, dropShare, doneIn, donesIn, addOffer, offersFor, answerOffer, sharesOf, offersOf, dropShares, daySpan, fitNow, OFFER_KEEP,
  addTodayOffer, setOfferTimes, setOfferTimesQ, takeOffer, promoteOffer, answerOfferQ, offersReady } from "../../../functions/_fitshare.js";
import { timeFor, timesOf, setTime, setTimeQ, dropTime, dropTimeQ, timesReady, EXPLICIT_OFFER, explicitRide } from "../../../functions/_fittimes.js";
import { timesFor, timesAround } from "../../../functions/_times.js";

const sql = new DatabaseSync(":memory:");
const val = (a) => a.map((x) => (typeof x === "boolean" ? +x : x === undefined ? null : x));
const st = (q, a = []) => ({ bind: (...b) => st(q, b), first: async () => sql.prepare(q).get(...val(a)) ?? null,
  all: async () => ({ results: sql.prepare(q).all(...val(a)), meta: {} }), run: async () => ({ meta: { changes: Number(sql.prepare(q).run(...val(a)).changes) } }) });
const env = { DB: { prepare: (q) => st(q),
  batch: async (list) => { sql.exec("BEGIN"); try { const out = []; for (const s of list) { const q = s; out.push(/^\s*(INSERT|UPDATE|DELETE)/i.test(q.sql || "") ? await q.run() : await q.all()); } sql.exec("COMMIT"); return out; } catch (e) { sql.exec("ROLLBACK"); throw e; } } } };
// (D1's batch answers each statement with its rows and its changes: the shim's statements say which they are)
const prep = env.DB.prepare;
env.DB.prepare = (q) => { const s = prep(q); const wrap = (x) => ({ ...x, sql: q, bind: (...b) => wrap(x.bind(...b)) }); return wrap(s); };
await db(env); await fitdb(env);
const put = (table, row) => sql.prepare(`INSERT INTO ${table} (${Object.keys(row).join(", ")}) VALUES (${Object.keys(row).map(() => "?").join(", ")})`).run(...val(Object.values(row)));
const H = 3600e3, now = Date.now();
const count = (t) => sql.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
const tables = () => sql.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);

test("a share: made as asked, a new id each call, holding only whose, the day, its zone and the sport, until 72 hours past the day", async () => {
  const a = await shareFor(env, "ann", { day: "2026-11-01", tz: "Europe/London", sport: "ride" });
  const b = await shareFor(env, "ann", { day: "2026-11-01", tz: "Europe/London", sport: "ride" });
  assert.match(a, /^[A-Za-z0-9_-]{22}$/); assert.notEqual(a, b);
  const cols = sql.prepare("PRAGMA table_info(fx_shares)").all().map((c) => c.name).sort();
  assert.deepEqual(cols, ["day", "id", "made", "sport", "tz", "until", "user_id"], "nothing more kept");
  const row = sql.prepare("SELECT * FROM fx_shares WHERE id = ?").get(a);
  assert.equal(row.user_id, "ann"); assert.equal(row.day, "2026-11-01"); assert.equal(row.sport, "ride");
  assert.equal(row.until, Math.max(daySpan("2026-11-01", "Europe/London").end, row.made) + 72 * H);
  assert.equal(daySpan("2026-10-25", "Europe/London").end - daySpan("2026-10-25", "Europe/London").start, 25 * H, "a day the clocks go back is 25 hours");
  for (const bad of [{ day: "2026-13-01", tz: "Europe/London", sport: "ride" }, { day: "2026-11-01", tz: "Not/AZone", sport: "ride" }, { day: "2026-11-01", tz: "Europe/London", sport: "golf" }, {}])
    await assert.rejects(shareFor(env, "ann", bad), /Bad request/);
  // a day far ahead (a card's day is today's, or one gone by): refused, so no share's kept for years; tomorrow's still taken
  const ahead = (n) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(now + n * 864e5));
  const n = count("fx_shares");
  for (const day of ["2100-12-31", ahead(3)]) await assert.rejects(shareFor(env, "ann", { day, tz: "Europe/London", sport: "ride" }), /Bad request/, day);
  assert.equal(count("fx_shares"), n, "and nothing kept for them");
  const next = await shareFor(env, "ann", { day: ahead(1), tz: "Europe/London", sport: "ride" });
  assert.ok(sql.prepare("SELECT until FROM fx_shares WHERE id = ?").get(next).until <= now + 6 * 864e5);
  // a day long gone: kept 72 hours from now, and swept then like any other
  const gone = await shareFor(env, "ann", { day: "2025-01-01", tz: "Europe/London", sport: "ride" }), was = sql.prepare("SELECT made, until FROM fx_shares WHERE id = ?").get(gone);
  assert.equal(was.until, was.made + 72 * H);
});

test("old shares swept as the next is made; one taken back only by its own account", async () => {
  put("fx_shares", { id: "o".repeat(22), user_id: "bo", day: "2026-01-01", tz: "Europe/London", sport: "run", made: 1, until: now - 1000 });
  const id = await shareFor(env, "cy", { day: "2026-11-02", tz: "Europe/London", sport: "run" });
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM fx_shares WHERE id = ?").get("o".repeat(22)).n, 0, "the expired one's gone");
  await dropShare(env, "ann", id);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM fx_shares WHERE id = ?").get(id).n, 1, "not someone else's");
  await dropShare(env, "cy", id);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM fx_shares WHERE id = ?").get(id).n, 0, "its own");
});

test("done: Fitness's own, with Garmin's and Strava's waiting tables not made yet, then made; by sport; each figure only when known", async () => {
  const day = daySpan("2026-11-02", "Europe/London");
  assert.ok(!tables().includes("fx_garmin_new") && !tables().includes("fx_strava_new"));
  assert.equal(await doneIn(env, "dee", day.start, day.end, "ride"), null, "nothing yet");
  put("fx_acts", { user_id: "dee", id: "w1", start: day.start + 8 * H, sport: "walk", type: "fit", size: 1, added: 0, sum: JSON.stringify({ secs: 1800, dist: 2500 }) });
  assert.equal(await doneIn(env, "dee", day.start, day.end, "ride"), null, "a walk isn't a ride");
  assert.deepEqual(await doneIn(env, "dee", day.start, day.end, "walk"), { secs: 1800, dist: 2500, sport: "walk", start: day.start + 8 * H }, "no stress: not said");
  assert.equal((await doneIn(env, "dee", day.start, day.end)).sport, "walk", "without a sport, the newest of any (Today's card)");
  // (the waiting tables made, as Garmin's and Strava's are)
  sql.exec("CREATE TABLE fx_garmin_new (user_id TEXT NOT NULL, id TEXT NOT NULL, start INTEGER, name TEXT, added INTEGER NOT NULL, PRIMARY KEY (user_id, id))");
  sql.exec("CREATE TABLE fx_strava_new (user_id TEXT NOT NULL, id TEXT NOT NULL, start INTEGER, name TEXT, sport TEXT, indoor INTEGER NOT NULL DEFAULT 0, device TEXT, size INTEGER, added INTEGER, PRIMARY KEY (user_id, id))");
  put("fx_garmin_new", { user_id: "dee", id: "g1", start: day.start + 10 * H, name: "Morning Ride", added: 0 });
  assert.deepEqual(await doneIn(env, "dee", day.start, day.end, "ride"), { sport: null, start: day.start + 10 * H }, "Garmin's, saying no sport, with no ride typed: done, with no figures");
  put("fx_strava_new", { user_id: "dee", id: "s1", start: day.start + 9 * H, name: "Ride", sport: "ride", added: 0 });
  assert.deepEqual(await doneIn(env, "dee", day.start, day.end, "ride"), { sport: "ride", start: day.start + 9 * H }, "a typed ride first, before Garmin's");
  put("fx_acts", { user_id: "dee", id: "r1", start: day.start + 11 * H, sport: "ride", type: "fit", size: 1, added: 0, sum: JSON.stringify({ secs: 3720, dist: 30400, tss: 48 }) });
  assert.deepEqual(await doneIn(env, "dee", day.start, day.end, "ride"), { secs: 3720, dist: 30400, tss: 48, sport: "ride", start: day.start + 11 * H }, "the newest ride, with its figures");
  assert.equal(await doneIn(env, "dee", day.end, day.end + 24 * H, "ride"), null, "another day's nothing");
  assert.equal((await donesIn(env, "dee", day.start, day.end)).length, 4);
});

const offer = (x = {}) => ({ id: crypto.randomUUID(), start: Math.ceil(now / H) * H + 24 * H, stop: Math.ceil(now / H) * H + 26 * H, tz: "Europe/London", sport: "ride", wid: "free-ride",
  name: "Ride how you like", secs: 7200, who: "Leo", role: "answered", far: false, dry: true, ...x });

test("offers: checked as a plan is, the account's own, the same id again changing nothing, and a no staying no", async () => {
  const o = offer();
  await addOffer(env, "eve", o);
  await addOffer(env, "eve", o);
  let got = await offersFor(env, "eve");
  assert.equal(got.length, 1);
  assert.deepEqual(got[0], { id: o.id, start: o.start, stop: o.stop, sport: "ride", wid: "free-ride", name: "Ride how you like", secs: 7200, who: "Leo", role: "answered", far: false, dry: true, state: "new" },
    "exactly as Fitness has always had it (shareserver.test.mjs pins GET me's keys)");
  assert.deepEqual(await offersFor(env, "fay"), [], "only the account's own");
  for (const bad of [{ id: "nope" }, { stop: o.start + 90 * 60e3 }, { wid: "rh:tempo" }, { role: "boss" }, { who: "" }, { tz: "x" }, { sport: "swim" }])
    await assert.rejects(addOffer(env, "eve", offer(bad)), /Bad request/, JSON.stringify(bad));
  await assert.rejects(addOffer(env, "eve", offer({ start: Math.floor(now / H) * H - 3 * H, stop: Math.floor(now / H) * H - H })), /passed/);
  assert.equal(await answerOffer(env, "eve", o.id, "no"), true);
  await addOffer(env, "eve", o);
  assert.deepEqual(await offersFor(env, "eve"), [], "said no to: not back");
  assert.equal(sql.prepare("SELECT state FROM fx_offers WHERE user_id = 'eve' AND id = ?").get(o.id).state, "no");
  assert.equal(await answerOffer(env, "eve", o.id, "yes"), false, "a no can't be turned into a yes");
  assert.equal(sql.prepare("SELECT state FROM fx_offers WHERE user_id = 'eve' AND id = ?").get(o.id).state, "no");
  assert.deepEqual(await offersFor(env, "eve"), [], "said no to: still not back");
  const y = offer();
  await addOffer(env, "eve", y);
  assert.equal(await answerOffer(env, "eve", y.id, "yes"), true);
  assert.equal((await offersFor(env, "eve"))[0].state, "yes", "agreed: still shown, for who it's with");
  assert.equal(await answerOffer(env, "eve", y.id, "yes"), true, "the same answer again: fine");
  assert.equal(await answerOffer(env, "eve", y.id, "no"), false, "agreed: not turned into a no");
  assert.equal((await offersFor(env, "eve"))[0].state, "yes");
  assert.equal(await answerOffer(env, "fay", y.id, "no"), false, "not someone else's");
  assert.equal(await answerOffer(env, "eve", crypto.randomUUID(), "yes"), false);
  await assert.rejects(answerOffer(env, "eve", y.id, "maybe"), /Bad request/);
});

test("offers: 20 waiting at most; past their time not shown, and a read deletes nothing", async () => {
  for (let i = 0; i < 20; i++) await addOffer(env, "gus", offer());
  await assert.rejects(addOffer(env, "gus", offer()), /Fitness has 20 plans waiting already\./);
  const first = (await offersFor(env, "gus"))[0];
  await answerOffer(env, "gus", first.id, "yes");
  await addOffer(env, "gus", offer());
  put("fx_offers", { user_id: "gus", id: crypto.randomUUID(), start: now - 30 * H, stop: now - 28 * H, tz: "Europe/London", sport: "run", wid: "run-easy-40", name: "Easy run 40", secs: 2400,
    who: "Leo", role: "asked", state: "new", made: 0, until: now - 16 * H });
  const n = count("fx_offers");
  const list = await offersFor(env, "gus");
  assert.equal(list.length, 21);
  assert.ok(list.every((x) => x.stop > now), "past its time: not shown");
  assert.equal(count("fx_offers"), n, "nothing deleted on a read");
});

test("the export's rows, and an account gone taking its shares and offers", async () => {
  await shareFor(env, "hal", { day: "2026-11-02", tz: "Europe/London", sport: "run" });
  await addOffer(env, "hal", offer({ name: "Easy run 40", sport: "run", wid: "run-easy-40", secs: 2400, stop: Math.ceil(now / H) * H + 25 * H }));
  const s = await sharesOf(env, "hal"), o = await offersOf(env, "hal");
  assert.deepEqual(s.map((x) => Object.keys(x).sort()), [["day", "sport", "until"]]);
  assert.deepEqual(o.map((x) => Object.keys(x).sort()), [["name", "start", "state", "who"]]);
  await dropShares(env, "hal");
  assert.deepEqual(await sharesOf(env, "hal"), []); assert.deepEqual(await offersOf(env, "hal"), []);
  assert.ok((await sharesOf(env, "ann")).length >= 2, "nobody else's");
});

// ---------- Today First ----------
const S0 = Math.ceil(now / H) * H + 24 * H, UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// (Today First's fields of an offer come only from a caller that built them from fields it checked: functions/_share.js)
const CHECKED = { checked: true };
const rowOf = (user, id) => sql.prepare("SELECT * FROM fx_offers WHERE user_id = ? AND id = ?").get(user, id);

test("done: the waiting tables without their figures still answer (one trip, then each on its own); with them, each waiting row's sport, time and distance", async () => {
  // (as the done test above left them: Garmin's and Strava's tables made before their figures)
  const day = daySpan("2026-11-02", "Europe/London"), share = await shareFor(env, "dee", { day: "2026-11-02", tz: "Europe/London", sport: "run" });
  assert.deepEqual(await fitNow(env, { share, asker: "dee" }), { done: true }, "Garmin's waiting row, through the narrower select, in the batch's fallback");
  assert.equal((await donesIn(env, "dee", day.start, day.end)).length, 4);
  // (the columns Garmin's and Strava's setup now adds: functions/_garmin.js, _strava.js)
  for (const c of ["sport TEXT", "secs INTEGER", "dist REAL"]) sql.exec(`ALTER TABLE fx_garmin_new ADD COLUMN ${c}`);
  for (const c of ["secs INTEGER", "dist REAL"]) sql.exec(`ALTER TABLE fx_strava_new ADD COLUMN ${c}`);
  const d2 = daySpan("2026-10-20", "Europe/London");
  put("fx_garmin_new", { user_id: "eli", id: "g1", start: d2.start + 10 * H, name: "Lunch Ride", added: 0, sport: "ride", secs: 4500, dist: 32100.5 });
  put("fx_garmin_new", { user_id: "eli", id: "g0", start: d2.start + 7 * H, name: null, added: 0 });
  put("fx_strava_new", { user_id: "eli", id: "s1", start: d2.start + 9 * H, name: "Run", sport: "run", added: 0, secs: 2400, dist: 6000 });
  assert.deepEqual(await donesIn(env, "eli", d2.start, d2.end), [
    { name: "Lunch Ride", sport: "ride", start: d2.start + 10 * H, secs: 4500, dist: 32100.5, tss: null, from: "garmin" },
    { name: "Run", sport: "run", start: d2.start + 9 * H, secs: 2400, dist: 6000, tss: null, from: "strava" },
    { name: "Activity", sport: null, start: d2.start + 7 * H, secs: null, dist: null, tss: null, from: "garmin" },
  ], "null where it came without them");
  assert.deepEqual(await doneIn(env, "eli", d2.start, d2.end, "run"), { secs: 2400, dist: 6000, sport: "run", start: d2.start + 9 * H });
  assert.deepEqual(await doneIn(env, "eli", d2.start, d2.end, "ride"), { secs: 4500, dist: 32100.5, sport: "ride", start: d2.start + 10 * H });
  const own = await shareFor(env, "eli", { day: "2026-10-20", tz: "Europe/London", sport: "ride" });
  assert.deepEqual(await fitNow(env, { share: own, asker: "eli" }), { done: true, secs: 4500, dist: 32100.5 }, "and in the one trip");
  // (and dee's, made before the figures, read the same as before)
  assert.deepEqual(await doneIn(env, "dee", day.start, day.end, "ride"), { secs: 3720, dist: 30400, tss: 48, sport: "ride", start: day.start + 11 * H });
});

test("fx_offers has the friend's id, whether a tap kept it, and an invite's other times", () => {
  const cols = sql.prepare("PRAGMA table_info(fx_offers)").all();
  for (const [name, type] of [["with_id", "TEXT"], ["taken", "INTEGER"], ["opts", "TEXT"]]) assert.equal(cols.find((c) => c.name === name)?.type, type, name);
  assert.equal(cols.find((c) => c.name === "taken").notnull, 1);
});

test("an invite's pending row: the inviter's own, never listed, not counted with the plans waiting, 20 at most, kept until the last time it offered", async () => {
  const p = offer({ role: "asked", state: "pending", withId: "leo-id", opts: [[S0 + 3 * H, S0 + 5 * H], { start: S0 + 26 * H, end: S0 + 28 * H }] });
  await addOffer(env, "ivy", p, CHECKED);
  assert.deepEqual(await offersFor(env, "ivy"), [], "never listed");
  assert.deepEqual(await offersFor(env, "ivy", { today: true, t: now }), [], "not even with Today's");
  const row = rowOf("ivy", p.id);
  assert.equal(row.state, "pending"); assert.equal(row.with_id, "leo-id"); assert.equal(row.taken, 0);
  assert.deepEqual(JSON.parse(row.opts), [[S0 + 3 * H, S0 + 5 * H], [S0 + 26 * H, S0 + 28 * H]]);
  assert.equal(row.until, S0 + 28 * H, "kept until its last offered end");
  // (not counted with the plans waiting: 20 of those still go in beside it)
  for (let i = 0; i < 20; i++) await addOffer(env, "ivy", offer(), CHECKED);
  await assert.rejects(addOffer(env, "ivy", offer(), CHECKED), /Fitness has 20 plans waiting already\./);
  // (its own limit: 20 pending)
  for (let i = 0; i < 19; i++) await addOffer(env, "ivy", offer({ role: "asked", state: "pending", withId: "leo-id" }), CHECKED);
  await assert.rejects(addOffer(env, "ivy", offer({ role: "asked", state: "pending", withId: "leo-id" }), CHECKED), /20 invites waiting/);
  assert.equal((await offersFor(env, "ivy")).length, 20, "the plans waiting, and none of the pending");
  // checked: only an asked one is pending; at most 3 other times, each one the plan could be at; the friend's id a string
  const four = [3, 6, 9, 12].map((h) => [S0 + h * H, S0 + (h + 2) * H]);
  for (const bad of [{ role: "answered", state: "pending" }, { role: "asked", state: "pending", opts: four }, { role: "asked", state: "pending", opts: [[S0 + 3 * H, S0 + 4 * H]] },
    { role: "asked", state: "pending", opts: [[S0 + 3 * H]] }, { role: "asked", state: "pending", opts: "soon" }, { withId: 7 }, { withId: "" }, { withId: "x".repeat(65) }])
    await assert.rejects(addOffer(env, "jo", offer(bad), CHECKED), /Bad request/, JSON.stringify(bad));
  // (a time offered that's already gone is left out; other times kept only on a pending row)
  const past = Math.floor(now / H) * H - 4 * H, q = offer({ role: "asked", state: "pending", withId: "leo-id", opts: [[past, past + 2 * H]] });
  await addOffer(env, "jo", q, CHECKED);
  assert.equal(rowOf("jo", q.id).opts, null); assert.equal(rowOf("jo", q.id).until, q.stop);
  const r = offer({ role: "asked", withId: "leo-id", opts: [[S0 + 3 * H, S0 + 5 * H]] });
  await addOffer(env, "jo", r, CHECKED);
  assert.equal(rowOf("jo", r.id).opts, null); assert.equal(rowOf("jo", r.id).state, "new"); assert.equal(rowOf("jo", r.id).until, r.stop + OFFER_KEEP);
});

test("promotion: the friend's Yes makes the inviter's pending row a plan waiting, only for that friend and only at a time it offered", async () => {
  const alt = [S0 + 3 * H, S0 + 5 * H], p = offer({ role: "asked", state: "pending", withId: "leo-id", opts: [alt] });
  await addOffer(env, "kit", p, CHECKED);
  assert.equal(await promoteOffer(env, "kit", p.id, "mia-id", p.start, p.stop, { t: now }), false, "someone else's answer");
  assert.equal(await promoteOffer(env, "kit", p.id, "leo-id", S0 + 6 * H, S0 + 8 * H, { t: now }), false, "a time it didn't offer");
  assert.equal(await promoteOffer(env, "kit", p.id, "leo-id", alt[0], alt[1] + H, { t: now }), false, "nor one overlapping it");
  assert.equal(await promoteOffer(env, "kit", crypto.randomUUID(), "leo-id", p.start, p.stop, { t: now }), false, "another invite");
  assert.equal(await promoteOffer(env, "lou", p.id, "leo-id", p.start, p.stop, { t: now }), false, "another account's");
  assert.equal(await promoteOffer(env, "kit", "nope", "leo-id", p.start, p.stop, { t: now }), false);
  assert.equal(rowOf("kit", p.id).state, "pending", "all of those left it pending");
  assert.equal(await promoteOffer(env, "kit", p.id.toUpperCase(), "leo-id", ...alt, { t: now }), true, "one of its other times");
  const row = rowOf("kit", p.id);
  assert.deepEqual([row.state, row.start, row.stop, row.until, row.opts, row.with_id], ["new", alt[0], alt[1], alt[1] + OFFER_KEEP, null, "leo-id"]);
  const got = await offersFor(env, "kit", { today: true, t: now });
  assert.deepEqual(got.map((x) => [x.id, x.start, x.state, x.role, x.withId, x.taken]), [[p.id, alt[0], "new", "asked", "leo-id", false]], "a plan waiting in their Fitness");
  assert.equal(await promoteOffer(env, "kit", p.id, "leo-id", ...alt, { t: now }), false, "once");
  // (the inviter's phone drawing the Yes later, as an older Chat does too: nothing added)
  await addOffer(env, "kit", offer({ role: "asked", withId: "leo-id", start: alt[0], stop: alt[1] }), CHECKED);
  await addOffer(env, "kit", offer({ role: "asked", start: alt[0], stop: alt[1] }), CHECKED);
  assert.equal((await offersFor(env, "kit", { today: true, t: now })).length, 1, "the same ride with the same friend: still one row");
  // (its own time, too; but not where that ride's there already, nor once its time has gone)
  const m = offer({ role: "asked", state: "pending", withId: "leo-id" });
  await addOffer(env, "kit", m, CHECKED);
  assert.equal(await promoteOffer(env, "kit", m.id, "leo-id", m.start, m.stop, { t: now }), true, "its own time");
  const dupe = offer({ role: "asked", state: "pending", withId: "leo-id", start: alt[0], stop: alt[1] });
  await addOffer(env, "kit", dupe, CHECKED);
  assert.equal(await promoteOffer(env, "kit", dupe.id, "leo-id", ...alt, { t: now }), false, "that ride with Leo is there already");
  const gone = offer({ role: "asked", state: "pending", withId: "leo-id", opts: [alt] });
  await addOffer(env, "kit", gone, CHECKED);
  assert.equal(await promoteOffer(env, "kit", gone.id, "leo-id", gone.start, gone.stop, { t: gone.stop + 1 }), false, "its time gone");
});

test("an asked offer isn't added twice for the same ride with the same friend (by id, or by name); answered ones, and other friends, are", async () => {
  const a = offer({ role: "asked", withId: "leo-id" }), same = { start: a.start, stop: a.stop };
  await addOffer(env, "max", a, CHECKED);
  await addOffer(env, "max", offer({ role: "asked", withId: "leo-id", ...same }), CHECKED);
  await addOffer(env, "max", offer({ role: "asked", ...same }), CHECKED);
  await addOffer(env, "max", offer({ role: "asked", withId: "leo-id", who: "Leonard", ...same }), CHECKED);
  assert.equal((await offersFor(env, "max")).length, 1);
  await addOffer(env, "max", offer({ role: "asked", withId: "nia-id", who: "Nia", ...same }), CHECKED);
  await addOffer(env, "max", offer({ role: "answered", ...same }), CHECKED);
  await addOffer(env, "max", offer({ role: "asked", withId: "leo-id", start: a.start + 3 * H, stop: a.stop + 3 * H }), CHECKED);
  assert.equal((await offersFor(env, "max")).length, 4, "another friend, an answered one, another time");
  // (said no to, it doesn't hold the next one back; but the plan answered to Leo at that time is the same ride with him)
  await answerOffer(env, "max", a.id, "no");
  await addOffer(env, "max", offer({ role: "asked", withId: "leo-id", ...same }), CHECKED);
  assert.equal((await offersFor(env, "max")).length, 3, "the answered one with Leo, still waiting, holds it back");
  const answered = (await offersFor(env, "max")).find((x) => x.role === "answered");
  await answerOffer(env, "max", answered.id, "no");
  await addOffer(env, "max", offer({ role: "asked", withId: "leo-id", ...same }), CHECKED);
  assert.deepEqual((await offersFor(env, "max")).map((x) => `${x.role} ${x.who}`).sort(), ["asked Leo", "asked Leo", "asked Nia"], "now it goes in");
});

const ride = (x = {}) => ({ start: S0, stop: S0 + 2 * H, tz: "Europe/London", sport: "ride", wid: "free-ride", name: "Ride how you like", secs: 5400, dry: true, ...x });

test("Today's own rides: added (agreed, not taken) or offered (new), shown to Fitness only when asked for; Take, Keep and Fitness's Add are taps; Undo in Fitness", async () => {
  const added = await addTodayOffer(env, "ned", ride({ state: "yes", was: { planned: "rest" } }), { t: now });
  const offered = await addTodayOffer(env, "ned", ride({ start: S0 + 48 * H, stop: S0 + 50 * H, state: "new" }), { t: now });
  assert.match(added, UUID); assert.notEqual(added, offered);
  assert.deepEqual(await offersFor(env, "ned"), [], "not without today");
  assert.deepEqual((await offersFor(env, "ned", { today: true, t: now })).map((x) => [x.id, x.role, x.who, x.state, x.taken, x.withId, x.dry]),
    [[added, "today", "", "yes", false, null, true], [offered, "today", "", "new", false, null, true]]);
  assert.equal(rowOf("ned", added).until, S0 + 2 * H + OFFER_KEEP);
  for (const bad of [ride({ state: "maybe" }), ride({ state: "yes", stop: S0 + 90 * 60e3 }), ride({ state: "yes", wid: "rh:tempo" }), ride({ state: "yes", tz: "x" }), ride({ state: "pending" })])
    await assert.rejects(addTodayOffer(env, "ned", bad, { t: now }), /Bad request/, JSON.stringify(bad));
  await assert.rejects(addTodayOffer(env, "ned", ride({ state: "yes", start: Math.floor(now / H) * H - 3 * H, stop: Math.floor(now / H) * H - H }), { t: now }), /passed/);
  // Take (the suggestion) and Keep (the one added): agreed, and kept by a tap
  assert.equal(await takeOffer(env, "ola", added, { t: now }), false, "not another account's");
  assert.equal(await takeOffer(env, "ned", offered, { t: now }), true);
  assert.equal(await takeOffer(env, "ned", added, { t: now }), true);
  for (const id of [added, offered]) assert.deepEqual([rowOf("ned", id).state, rowOf("ned", id).taken], ["yes", 1]);
  await assert.rejects(takeOffer(env, "ned", "nope", { t: now }), /Bad request/);
  // a friend's plan is Fitness's to add, and its Add is a tap too
  const f = offer();
  await addOffer(env, "ned", f, CHECKED);
  assert.equal(await takeOffer(env, "ned", f.id, { t: now }), false, "not taken from Today");
  assert.equal(await answerOffer(env, "ned", f.id, "yes"), true);
  assert.equal(rowOf("ned", f.id).taken, 1, "Fitness's yes: taken");
  // Undo in Fitness: one of Today's own agreed can be said no to; a friend's agreed can't; and a no stays no
  assert.equal(await answerOffer(env, "ned", added, "no"), true);
  assert.equal(rowOf("ned", added).state, "no");
  assert.equal(await answerOffer(env, "ned", f.id, "no"), false);
  assert.equal(await answerOffer(env, "ned", added, "yes"), false);
  assert.equal(await takeOffer(env, "ned", added, { t: now }), false, "nor taken again");
  assert.deepEqual((await offersFor(env, "ned", { today: true, t: now })).map((x) => x.id).sort(), [f.id, offered].sort());
  // (10 of Today's waiting at most; those said no to not counted)
  for (let i = 0; i < 9; i++) await addTodayOffer(env, "ned", ride({ start: S0 + (100 + i * 4) * H, stop: S0 + (102 + i * 4) * H, state: "new" }), { t: now });
  await assert.rejects(addTodayOffer(env, "ned", ride({ start: S0 + 200 * H, stop: S0 + 202 * H, state: "new" }), { t: now }), /10 rides waiting/);
});

test("Today's ride moved, and put back only while it's as it was left (Undo's check); never a friend's", async () => {
  const id = await addTodayOffer(env, "pam", ride({ state: "yes" }), { t: now }), was = { start: S0, stop: S0 + 2 * H };
  assert.equal(await setOfferTimes(env, "pam", id, S0 + 2 * H, S0 + 4 * H, { expect: was, t: now }), true, "moved");
  assert.deepEqual([rowOf("pam", id).start, rowOf("pam", id).stop, rowOf("pam", id).until], [S0 + 2 * H, S0 + 4 * H, S0 + 4 * H + OFFER_KEEP]);
  assert.equal(await setOfferTimes(env, "pam", id, S0, S0 + 2 * H, { expect: was, t: now }), false, "not as it was left: untouched");
  assert.equal(rowOf("pam", id).start, S0 + 2 * H);
  assert.equal(await setOfferTimes(env, "pam", id.toUpperCase(), S0, S0 + 2 * H, { expect: [S0 + 2 * H, S0 + 4 * H], t: now }), true, "put back");
  assert.equal(await setOfferTimes(env, "pam", id, S0 + H, S0 + 3 * H, { t: now }), true, "without expect: moved as it is");
  assert.equal(await setOfferTimes(env, "quin", id, S0, S0 + 2 * H, { t: now }), false, "not another account's");
  const f = offer();
  await addOffer(env, "pam", f, CHECKED);
  assert.equal(await setOfferTimes(env, "pam", f.id, f.start + H, f.stop + H, { t: now }), false, "an agreed ride with a friend is never moved");
  await answerOffer(env, "pam", id, "yes"); await answerOffer(env, "pam", id, "no");
  assert.equal(await setOfferTimes(env, "pam", id, S0, S0 + 2 * H, { t: now }), false, "said no to in Fitness: untouched");
  for (const [s, e, o] of [[S0, S0 + 10 * 60e3], [S0, S0 + 7 * H], [S0, S0 - H], [S0 + 0.5, S0 + 2 * H], [S0, S0 + 2 * H, { expect: { start: "x" } }]])
    await assert.rejects(setOfferTimes(env, "pam", id, s, e, { t: now, ...o }), /Bad request/, `${s}–${e}`);
  await assert.rejects(setOfferTimes(env, "pam", "nope", S0, S0 + 2 * H, { t: now }), /Bad request/);
});

test("ride times (fx_times): one a day, checked, the account's own, old ones tidied as the next is kept; and what counts as an explicit ride", async () => {
  const tz = "Europe/London", d = "2026-11-05", day = daySpan(d, tz), s = day.start + 16 * H + 45 * 60e3, t = day.start - 2 * 24 * H;
  assert.equal(await timeFor(env, "rae", d), null);
  const first = { day: d, start: s, stop: s + 75 * 60e3, tz, sport: "ride", source: "set" };
  assert.deepEqual(await setTime(env, "rae", { day: d, start: s, stop: s + 75 * 60e3, tz, source: "set" }, { t }), first, "a ride, unless it says");
  assert.deepEqual(await timeFor(env, "rae", d), first);
  const cols = sql.prepare("PRAGMA table_info(fx_times)").all().map((c) => c.name).sort();
  assert.deepEqual(cols, ["day", "made", "source", "sport", "start", "stop", "tz", "user_id"], "times, and nothing more");
  // (a second for the day takes its place)
  await setTime(env, "rae", { day: d, start: s + H, stop: s + 2 * H, tz, sport: "run", source: "moved" }, { t });
  assert.deepEqual(await timesOf(env, "rae", "2026-11-01", "2026-11-30"), [{ day: d, start: s + H, stop: s + 2 * H, tz, sport: "run", source: "moved" }]);
  for (const bad of [{ source: "auto" }, { source: undefined }, { start: s + 60e3 }, { stop: s + 10 * 60e3 }, { stop: s + 6 * H + 5 * 60e3 }, { day: "2026-11-06" }, { day: "2026-02-30" },
    { tz: "Not/AZone" }, { sport: "Ride!" }, { start: String(s) }])
    await assert.rejects(setTime(env, "rae", { day: d, start: s, stop: s + H, tz, source: "today", ...bad }, { t }), /Choose a time/, JSON.stringify(bad));
  assert.ok(await setTime(env, "rae", { day: d, start: s, stop: s + 6 * H, tz, source: "today" }, { t }), "six hours at most, and 15 minutes at the least");
  assert.ok(await setTime(env, "rae", { day: d, start: s, stop: s + 15 * 60e3, tz, source: "today" }, { t }));
  assert.equal(await timeFor(env, "sam", d), null, "the account's own");
  // (each write first drops the account's rows that ended over 8 days ago, nobody else's)
  put("fx_times", { user_id: "rae", day: "2026-10-01", start: t - 9 * 24 * H - H, stop: t - 9 * 24 * H, tz, sport: "ride", source: "set", made: 0 });
  put("fx_times", { user_id: "rae", day: "2026-10-27", start: t - 7 * 24 * H - H, stop: t - 7 * 24 * H, tz, sport: "ride", source: "set", made: 0 });
  put("fx_times", { user_id: "sam", day: "2026-10-01", start: t - 9 * 24 * H - H, stop: t - 9 * 24 * H, tz, sport: "ride", source: "set", made: 0 });
  const next = daySpan("2026-11-06", tz).start + 10 * H;
  await setTime(env, "rae", { day: "2026-11-06", start: next, stop: next + 2 * H, tz, source: "today" }, { t });
  assert.deepEqual((await timesOf(env, "rae", "2026-09-01", "2026-12-31")).map((r) => r.day), ["2026-10-27", d, "2026-11-06"]);
  assert.equal((await timesOf(env, "sam", "2026-09-01", "2026-12-31")).length, 1);
  await dropTime(env, "rae", d);
  assert.equal(await timeFor(env, "rae", d), null);
  for (const [a, b] of [["2026-11-30", "2026-11-01"], ["2026-11-1", "2026-11-30"], [null, "2026-11-30"]]) assert.deepEqual(await timesOf(env, "rae", a, b), []);
  assert.equal(await timeFor(env, "rae", "soon"), null);
  // what counts as an explicit ride: every fx_times row; an offer agreed with a friend, or one of Today's a tap kept
  assert.ok(explicitRide(await timeFor(env, "rae", "2026-11-06")));
  const offers = sql.prepare("SELECT id, role, state, taken FROM fx_offers WHERE user_id = 'ned'").all();
  const explicit = new Set(sql.prepare(`SELECT o.id FROM fx_offers o WHERE o.user_id = 'ned' AND ${EXPLICIT_OFFER}`).all().map((r) => r.id));
  assert.ok(explicit.size >= 2 && explicit.size < offers.length, "some of ned's, not all");
  for (const o of offers) assert.equal(explicitRide(o), explicit.has(o.id), `${o.role} ${o.state} ${o.taken}: the SQL and the function agree`);
  assert.ok(!explicitRide({ role: "today", state: "yes", taken: 0 }), "added at do, not kept: holds nothing");
});

test("a raw request's friend's id, pending state and other times are ignored: only a caller that checked them gives them", async () => {
  // (as POST fit-offer passed its body on before Chat's server checked the friend: a plain plan waiting, as it always was)
  const raw = offer({ role: "asked", state: "pending", withId: "not-a-friend", opts: [[S0 + 3 * H, S0 + 5 * H]] });
  await addOffer(env, "uma", raw);
  const row = rowOf("uma", raw.id);
  assert.deepEqual([row.state, row.with_id, row.opts, row.until], ["new", null, null, raw.stop + OFFER_KEEP]);
  assert.deepEqual((await offersFor(env, "uma")).map((x) => x.id), [raw.id], "listed, as any plan waiting");
  await addOffer(env, "uma", offer({ role: "asked", withId: 7, start: S0 + 3 * H, stop: S0 + 5 * H }));
  assert.equal(count("fx_offers WHERE user_id = 'uma'"), 2, "nor checked: it isn't looked at");
  // (and from a caller that checked them, they're kept)
  const ok = offer({ role: "asked", state: "pending", withId: "leo-id" });
  await addOffer(env, "uma", ok, CHECKED);
  assert.deepEqual([rowOf("uma", ok.id).state, rowOf("uma", ok.id).with_id], ["pending", "leo-id"]);
});

test("Today's reads and writes take the route's time: one left out throws at once, rather than reading the clock", async () => {
  const id = await addTodayOffer(env, "vic", ride({ state: "new" }), { t: now });
  const tz = "Europe/London", d = "2026-11-05", s = daySpan(d, tz).start + 10 * H;
  for (const [what, p] of [
    ["addTodayOffer", addTodayOffer(env, "vic", ride({ state: "new" }))], ["takeOffer", takeOffer(env, "vic", id)],
    ["setOfferTimes", setOfferTimes(env, "vic", id, S0, S0 + 2 * H)], ["setOfferTimes", setOfferTimesQ(env, "vic", id, S0, S0 + 2 * H, { t: "soon" })],
    ["promoteOffer", promoteOffer(env, "vic", id, "leo-id", S0, S0 + 2 * H)], ["answerOffer", answerOfferQ(env, "vic", id, "no")],
    ["offersFor", offersFor(env, "vic", { today: true })], ["setTime", setTime(env, "vic", { day: d, start: s, stop: s + H, tz, source: "today" })],
    ["setTime", setTimeQ(env, "vic", { day: d, start: s, stop: s + H, tz, source: "today" })],
    ["timesFor", timesFor(env, "vic", S0, S0 + H)], ["timesAround", timesAround(env, "vic", undefined, H)],
  ]) await assert.rejects(p, (e) => e instanceof TypeError && e.message.startsWith(what), what);
  assert.equal(rowOf("vic", id).state, "new", "and nothing was done");
  // (Fitness's own reads and answers, as they always were, need none)
  assert.equal((await offersFor(env, "vic")).length, 0);
  assert.deepEqual(await timesFor(env, "vic", S0, S0 + H, { t: now }), []);
});

test("Undo's guarded restores: each only while the row is still as the act left it, and as statements for one batch with the act's own", async () => {
  const tz = "Europe/London", d = "2026-11-05", s = daySpan(d, tz).start + 16 * H, t = daySpan(d, tz).start - 24 * H;
  const was = { day: d, start: s + H, stop: s + 2 * H, tz, source: "set" }, moved = { day: d, start: s, stop: s + H, tz, source: "moved" };
  // a moved ride, put back
  await setTime(env, "wes", moved, { t });
  const now0 = { start: moved.start, stop: moved.stop, source: "moved" };
  for (const ex of [{ start: s }, { start: s, stop: s + H, source: "auto" }, { start: String(s), stop: s + H, source: "moved" }])
    await assert.rejects(setTime(env, "wes", was, { t, expect: ex }), /Bad request/, JSON.stringify(ex));
  assert.equal(await setTime(env, "wes", was, { t, expect: { ...now0, start: s + 5 * 60e3 } }), null, "changed since (Ride At in Fitness): nothing put back");
  assert.equal((await timeFor(env, "wes", d)).source, "moved");
  assert.deepEqual(await setTime(env, "wes", was, { t, expect: now0 }), { ...was, sport: "ride" }, "as it was left: put back");
  assert.equal(await setTime(env, "wes", was, { t, expect: now0 }), null, "a second Undo: nothing");
  assert.equal(await setTime(env, "wes", { ...was, day: "2026-11-06", start: s + 25 * H, stop: s + 26 * H }, { t, expect: now0 }), null, "none made where there's none");
  assert.equal(await timeFor(env, "wes", "2026-11-06"), null);
  // Ride Then, taken back: the row dropped only while it's still that one
  await setTime(env, "xan", moved, { t });
  assert.equal(await dropTime(env, "xan", d, { expect: { ...now0, source: "today" } }), false, "not the same row");
  assert.ok(await timeFor(env, "xan", d));
  assert.equal(await dropTime(env, "xan", d, { expect: now0 }), true);
  assert.equal(await timeFor(env, "xan", d), null);
  assert.equal(await dropTime(env, "xan", d, { expect: now0 }), false, "gone already");
  // a ride Today added, said no to: only while its time and state are as the act left them
  const added = await addTodayOffer(env, "yan", ride({ state: "yes" }), { t: now }), at = { start: S0, stop: S0 + 2 * H, state: "yes" };
  await assert.rejects(answerOffer(env, "yan", added, "no", { expect: { start: S0, stop: S0 + 2 * H, state: "pending" } }), /Bad request/);
  assert.equal(await answerOffer(env, "yan", added, "no", { expect: { ...at, state: "new" } }), false, "its state changed since");
  assert.equal(await answerOffer(env, "yan", added, "no", { expect: { ...at, start: S0 + H } }), false, "its time changed since");
  assert.equal(rowOf("yan", added).state, "yes");
  assert.equal(await answerOffer(env, "yan", added, "no", { expect: at }), true);
  assert.equal(rowOf("yan", added).state, "no");
  // the statements alone, in the caller's own batch beside its act's row: one change each, and a second batch changes nothing
  sql.exec("CREATE TABLE IF NOT EXISTS acts_t (id TEXT PRIMARY KEY, state TEXT)");
  sql.exec("INSERT INTO acts_t VALUES ('a1', 'done'), ('a2', 'done'), ('a3', 'done')");
  const offered = await addTodayOffer(env, "zoe", ride({ state: "yes" }), { t: now });
  await setOfferTimes(env, "zoe", offered, S0 + 2 * H, S0 + 4 * H, { t: now });
  await setTime(env, "zoe", moved, { t });
  const act = (id) => env.DB.prepare("UPDATE acts_t SET state = 'undone' WHERE id = ? AND state = 'done'").bind(id);
  const undo = async () => (await env.DB.batch([
    await setOfferTimesQ(env, "zoe", offered, S0, S0 + 2 * H, { t: now, expect: { start: S0 + 2 * H, stop: S0 + 4 * H, state: "yes" } }), act("a1"),
    await setTimeQ(env, "zoe", was, { t, expect: now0 }), act("a2"),
    await answerOfferQ(env, "zoe", offered, "no", { t: now, expect: { start: S0, stop: S0 + 2 * H, state: "yes" } }), act("a3"),
  ])).map((r) => r.meta?.changes ?? 0);
  assert.deepEqual(await undo(), [1, 1, 1, 1, 1, 1]);
  assert.deepEqual([rowOf("zoe", offered).start, rowOf("zoe", offered).state, (await timeFor(env, "zoe", d)).source], [S0, "no", "set"]);
  assert.deepEqual(await undo(), [0, 0, 0, 0, 0, 0], "two Undos never both put it back");
  await assert.rejects(dropTimeQ(env, "zoe", "soon", { expect: now0 }), /Bad request/);
  assert.equal((await (await dropTimeQ(env, "zoe", d, { expect: { ...was, sport: undefined } })).run()).meta.changes, 1);
});

test("offersReady and timesReady: the tables and the columns a caller's own SQL reads, made first", async () => {
  const D1 = await offersReady(env), D2 = await timesReady(env);
  assert.equal(D1, env.DB); assert.equal(D2, env.DB);
  const cols = (t) => sql.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
  for (const c of ["with_id", "taken", "opts"]) assert.ok(cols("fx_offers").includes(c), c);
  assert.ok(cols("fx_times").includes("source"));
  assert.ok(Array.isArray(sql.prepare(`SELECT o.id FROM fx_offers o WHERE ${EXPLICIT_OFFER}`).all()));
});
