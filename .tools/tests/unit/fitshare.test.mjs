// What Fitness keeps for Chat's "Send to a friend" (functions/_fitshare.js), against a real database (node:sqlite, made
// to look like D1): a share made only as asked, a new id each time, with nothing but its day, zone and sport, and old
// ones swept as the next is made; whether a session's done (Fitness's own, and what's waiting from Garmin or Strava,
// their tables not made at first), by its sport; and plans from Chat: 20 waiting at most, one said no to staying no,
// past their time not shown, and a read changing nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { db } from "../../../functions/_pigeon.js";
import { fitdb } from "../../../functions/_fitness.js";
import { shareFor, dropShare, doneIn, donesIn, addOffer, offersFor, answerOffer, sharesOf, offersOf, dropShares, daySpan } from "../../../functions/_fitshare.js";

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
  assert.deepEqual(got[0], { id: o.id, start: o.start, stop: o.stop, sport: "ride", wid: "free-ride", name: "Ride how you like", secs: 7200, who: "Leo", role: "answered", far: false, dry: true, state: "new" });
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
