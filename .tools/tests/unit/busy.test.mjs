// Holding a person's notifications while they ride (Today First, spec §8.7, functions/_busy.js), against a database of
// its own (Node's SQLite, made to look like D1): who's riding, from explicit rides only (an fx_times row, an offer added
// in Fitness or kept with a tap; never a habit ride Today added by itself, nor a plan agreed in Chat and not yet added);
// held from 10 minutes before the start until an activity (in any of the three tables) or the cap, and what's told after
// held only until the activity came in; the account's level (do holds friends and apps, suggest apps only, quiet
// nothing); the tables not made yet, and what's found of them kept (the whole statement for good, one trip a call);
// the off switch (RIDE_HOLD "0"); the hold rule's record and what's waiting now. And the apps: Weather's rain and its
// sun on a roof not sent during a ride (nor the rain told after; warnings always come); Markets' alert held, counted
// once, and told after. (Chat's own, the messages, groups and reactions held and told "while you rode", are in instant.test.mjs,
// beside the rest of Chat's notifications.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { busyMap, busyNow, heldCount, heldAdd, holdsFor, holdsAt, heldMark, rideHoldOn, HOLD_EARLY, HOLD_DONE } from "../../../functions/_busy.js";
import { db } from "../../../functions/_pigeon.js";
import { fitdb } from "../../../functions/_fitness.js";
import { offersReady } from "../../../functions/_fitshare.js";
import { timesReady } from "../../../functions/_fittimes.js";
import { tddb } from "../../../functions/_today.js";
import { wxdb, wxTick } from "../../../functions/_wxpush.js";
import { mkdb, alertTick, wrapTick } from "../../../functions/_markets.js";
import { forecast } from "../mocks/wxappdata.mjs";
import { ukFeed } from "../mocks/wxwarnings.mjs";

// ---- D1, as much of it as the server uses ----
function d1() {
  const s = new DatabaseSync(":memory:");
  const val = (a) => a.map((v) => (v === undefined ? null : typeof v === "boolean" ? Number(v) : v));
  const exec = (sql, args) => {
    const p = s.prepare(sql);
    if (p.columns().length) return { results: p.all(...val(args)), success: true, meta: { changes: 0 } };
    const r = p.run(...val(args));
    return { results: [], success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  };
  const st = (sql, args = []) => ({
    bind: (...a) => st(sql, a),
    first: async (col) => { const row = s.prepare(sql).get(...val(args)) ?? null; return col && row ? row[col] ?? null : row; },
    all: async () => exec(sql, args), run: async () => exec(sql, args),
    raw: async () => s.prepare(sql).all(...val(args)).map((r) => Object.values(r)),
    now: () => exec(sql, args),
  });
  return { sql: s, prepare: (q) => st(q), async batch(list) { s.exec("BEGIN"); try { const r = list.map((x) => x.now()); s.exec("COMMIT"); return r; } catch (e) { s.exec("ROLLBACK"); throw e; } } };
}

const MIN = 60e3, H = 60 * MIN, D = 24 * H;
const W = "http://wx.test", MK = "http://mk.test", PUSH = "http://push.test/push";
const env = { DB: d1(), PIGEON_PUSH_URL: PUSH, WXAPP_URL: W, METEOALARM_URL: W, NWS_URL: W, EA_URL: W, RAINVIEWER_URL: W, AWC_URL: W, WARN_TTL: "0", MARKETS_DATA: MK, MARKETS_TTL: "0" };
const S = env.DB.sql, run = (q, ...a) => S.prepare(q).run(...a), one = (q, ...a) => S.prepare(q).get(...a), all = (q, ...a) => S.prepare(q).all(...a).map((r) => ({ ...r }));
await db(env); await fitdb(env); await offersReady(env); await timesReady(env); await tddb(env); await wxdb(env); await mkdb(env);
// (Garmin's and Strava's waiting rows, as their own setup makes them)
run("CREATE TABLE IF NOT EXISTS fx_garmin_new (user_id TEXT NOT NULL, id TEXT NOT NULL, start INTEGER, name TEXT, added INTEGER NOT NULL, PRIMARY KEY (user_id, id))");
run("CREATE TABLE IF NOT EXISTS fx_strava_new (user_id TEXT NOT NULL, id TEXT NOT NULL, start INTEGER, name TEXT, sport TEXT, indoor INTEGER NOT NULL DEFAULT 0, device TEXT, size INTEGER NOT NULL DEFAULT 0, added INTEGER NOT NULL, PRIMARY KEY (user_id, id))");

let n = 0;
const uid = (name) => `${name}-${++n}`;
const dayOf = (t) => new Date(t).toISOString().slice(0, 10);
// a ride with a time (Ride At in Fitness, or Ride Then on Today: every one a tap)
const ride = (u, start, len = H) => run("INSERT INTO fx_times (user_id, day, start, stop, tz, sport, source, made) VALUES (?, ?, ?, ?, 'Europe/London', 'ride', 'set', ?)", u, dayOf(start), start, start + len, start - D);
// an offer (fx_offers): role asked | answered | today, state new | yes | pending, taken by a tap or not
const offer = (u, start, { role = "asked", state = "yes", taken = 0, secs = 3600, hours = 1 } = {}) => run(`INSERT INTO fx_offers (user_id, id, start, stop, tz, sport, wid, name, secs, who, role, state, made, until, taken)
  VALUES (?, ?, ?, ?, 'Europe/London', 'ride', 'w1', 'Endurance', ?, 'Leo', ?, ?, ?, ?, ?)`, u, crypto.randomUUID(), start, start + hours * H, secs, role, state, start - D, start + hours * H + 12 * H, taken);
// (an activity: when it started, and when it came in, added: as it started, unless it's said)
const act = (table, u, start, added = start) => table === "fx_acts"
  ? run("INSERT INTO fx_acts (user_id, id, start, sport, type, size, added) VALUES (?, ?, ?, 'ride', 'fit', 1, ?)", u, crypto.randomUUID(), start, added)
  : run(`INSERT INTO ${table} (user_id, id, start, name, added) VALUES (?, ?, ?, 'Ride', ?)`, u, crypto.randomUUID(), start, added);
const level = (u, lv) => run("INSERT INTO td_rules (user_id, rule, level) VALUES (?, 'holdRide', ?) ON CONFLICT(user_id, rule) DO UPDATE SET level = excluded.level", u, lv);

const T = Date.UTC(2026, 10, 5, 16, 0);          // (Thursday 5 November, 16:00 in London)

test("only explicit rides hold: an fx_times row, a kept offer, one added in Fitness; never a habit ride Today added by itself, nor a plan not yet added", async () => {
  const start = T + 5 * MIN, who = {};
  for (const k of ["times", "kept", "asked", "answered", "habit", "agreed", "pending", "none"]) who[k] = uid(k);
  ride(who.times, start);
  offer(who.kept, start, { role: "today", state: "yes", taken: 1 });
  offer(who.asked, start, { role: "asked", state: "yes" });
  offer(who.answered, start, { role: "answered", state: "yes" });
  // (six dry Thursdays: Today added Thursday's ride at do, and no one's tapped it: taken 0)
  offer(who.habit, start, { role: "today", state: "yes", taken: 0 });
  offer(who.agreed, start, { role: "asked", state: "new" });
  offer(who.pending, start, { role: "asked", state: "pending" });
  const m = await busyMap(env.DB, Object.values(who), T);
  assert.deepEqual([...m.keys()].sort(), [who.answered, who.asked, who.kept, who.times].sort());
  assert.deepEqual(m.get(who.times), { until: start + 2 * H, level: "do", rideStart: start });
  assert.equal(await busyNow(env, who.habit, T), null, "an auto-added habit ride holds nothing");
  assert.deepEqual(await busyNow(env, who.kept, T), { until: start + 2 * H, level: "do", rideStart: start });
  // (and the time's always passed in: the server's clock is never read below the route)
  await assert.rejects(busyMap(env.DB, [who.times]), TypeError);
  await assert.rejects(busyNow(env, who.times), TypeError);
  assert.deepEqual(await busyMap(env.DB, [], T), new Map());
});

test("held from 10 minutes before the start until the cap: two hours, or the ride and half an hour, whichever's longer", async () => {
  const short = uid("short"), long = uid("long"), long2 = uid("offer3h"), start = T + H;
  ride(short, start, H); ride(long, start, 3 * H); offer(long2, start, { secs: 3 * 3600, hours: 3 });
  const at = async (u, t) => (await busyMap(env.DB, [u], t)).get(u) || null;
  assert.equal(await at(short, start - HOLD_EARLY - 1), null, "11 minutes before: not yet");
  assert.equal((await at(short, start - HOLD_EARLY))?.until, start + 2 * H, "10 minutes before: held, till two hours after the start");
  assert.ok(await at(short, start + 2 * H - 1));
  assert.equal(await at(short, start + 2 * H), null, "the cap: let go");
  assert.equal((await at(long, start + 3 * H))?.until, start + 3.5 * H, "a three-hour ride: three and a half hours");
  assert.equal(await at(long, start + 3.5 * H), null);
  assert.equal((await at(long2, start + 3 * H))?.until, start + 3.5 * H, "an offer's length: its session's");
  // (an offer's session no longer than its window: one said to be a day long in a one-hour window is an hour)
  const odd = uid("odd"); offer(odd, start, { secs: 86400, hours: 1 });
  assert.equal((await at(odd, start))?.until, start + 2 * H);
});

test("an activity since 40 minutes before the start ends it, from Fitness, Garmin or Strava; an earlier one, or someone else's, doesn't", async () => {
  const start = T - 30 * MIN, t = T + 30 * MIN, who = {};
  for (const k of ["acts", "garmin", "strava", "earlier", "other", "later"]) { who[k] = uid(k); ride(who[k], start); }
  act("fx_acts", who.acts, start + 2 * MIN);
  act("fx_garmin_new", who.garmin, start - 5 * MIN);
  act("fx_strava_new", who.strava, start + 3 * MIN);
  act("fx_acts", who.earlier, start - HOLD_DONE - MIN);
  act("fx_acts", uid("someone"), start);
  // (one that starts after now isn't one that's happened)
  act("fx_garmin_new", who.later, t + MIN);
  const m = await busyMap(env.DB, Object.values(who), t);
  assert.deepEqual([...m.keys()].sort(), [who.earlier, who.later, who.other].sort());
});

test("the account's level: do holds friends and apps, suggest apps only, quiet nothing; no row is do", async () => {
  const start = T, who = { do: uid("do"), suggest: uid("suggest"), quiet: uid("quiet"), none: uid("none") };
  for (const u of Object.values(who)) ride(u, start);
  level(who.do, "do"); level(who.suggest, "suggest"); level(who.quiet, "quiet");
  const m = await busyMap(env.DB, Object.values(who), T);
  assert.deepEqual(Object.fromEntries([...m].map(([k, v]) => [k, v.level])), { [who.do]: "do", [who.suggest]: "suggest", [who.quiet]: "quiet", [who.none]: "do" });
  const holds = (u) => [holdsFor(m.get(u), "friends"), holdsFor(m.get(u), "apps")];
  assert.deepEqual(holds(who.do), [true, true]);
  assert.deepEqual(holds(who.suggest), [false, true]);
  assert.deepEqual(holds(who.quiet), [false, false]);
  assert.deepEqual(holds(who.none), [true, true]);
  assert.deepEqual([holdsFor(null, "friends"), holdsFor(undefined, "apps")], [false, false], "not riding: nothing held");
});

test("tables not made yet: nothing held and no failure; then each part read as it's there (try, then narrow), from the first call after it's made", async () => {
  const bare = d1();
  assert.deepEqual(await busyMap(bare, ["a"], T), new Map(), "no Fitness tables at all");
  // (ride times alone: no offers, no activities, no rules: level do)
  bare.sql.exec("CREATE TABLE fx_times (user_id TEXT NOT NULL, day TEXT NOT NULL, start INTEGER NOT NULL, stop INTEGER NOT NULL, tz TEXT NOT NULL, sport TEXT NOT NULL DEFAULT 'ride', source TEXT NOT NULL, made INTEGER NOT NULL, PRIMARY KEY (user_id, day))");
  for (const u of ["a", "g"]) bare.sql.prepare("INSERT INTO fx_times VALUES (?, ?, ?, ?, 'UTC', 'ride', 'set', 0)").run(u, dayOf(T), T, T + H);
  assert.deepEqual((await busyMap(bare, ["a"], T)).get("a"), { until: T + 2 * H, level: "do", rideStart: T }, "read as soon as it's there");
  // (an fx_offers from before Today First, without taken: one agreed in Chat and added in Fitness, asked or answered at
  // yes, is explicit without it; one Today added can't be told kept or not, so it's left out)
  bare.sql.exec("CREATE TABLE fx_offers (user_id TEXT, id TEXT, start INTEGER, stop INTEGER, secs INTEGER, role TEXT, state TEXT)");
  for (const [u, role, state] of [["b", "asked", "yes"], ["c", "today", "yes"], ["d", "answered", "yes"], ["e", "asked", "new"]]) bare.sql.prepare("INSERT INTO fx_offers VALUES (?, 'o', ?, ?, 3600, ?, ?)").run(u, T, T + H, role, state);
  assert.deepEqual([...(await busyMap(bare, ["a", "b", "c", "d", "e"], T)).keys()].sort(), ["a", "b", "d"]);
  // (an activity arrives, its table made just then; and one in a table without added, an old Garmin one say: it ends the
  // hold, and when it came in isn't known, so what's told after says held until the cap)
  bare.sql.exec("CREATE TABLE fx_strava_new (user_id TEXT, id TEXT, start INTEGER, added INTEGER)");
  bare.sql.prepare("INSERT INTO fx_strava_new VALUES ('a', 's', ?, ?)").run(T + MIN, T + 2 * MIN);
  bare.sql.exec("CREATE TABLE fx_garmin_new (user_id TEXT, id TEXT, start INTEGER)");
  bare.sql.prepare("INSERT INTO fx_garmin_new VALUES ('g', 'x', ?)").run(T + MIN);
  assert.deepEqual([...(await busyMap(bare, ["a", "g"], T + 3 * MIN)).keys()], [], "their activities read as soon as their tables are there");
  const view = holdsAt(bare, T + 3 * MIN);
  await view.load(["a", "g"]);
  assert.deepEqual([view.rode("a", T + MIN), view.rode("a", T + 2.5 * MIN)], [true, false], "held until it came in");
  assert.equal(view.rode("g", T + 3 * MIN - 1), true, "held until the cap, as far as anyone can tell");
});

// (a database that counts its trips: each statement asked on its own one, a batch of them one)
function counted(d) {
  const c = { n: 0 }, wrap = (st) => ({ ...st, bind: (...a) => wrap(st.bind(...a)), all: () => (c.n++, st.all()), first: (x) => (c.n++, st.first(x)), run: () => (c.n++, st.run()) });
  return { c, D: { ...d, prepare: (q) => wrap(d.prepare(q)), batch: (l) => (c.n++, d.batch(l)) } };
}
test("what's found is kept for the database: the whole statement, once it's worked, for good, one trip; else one trip that also looks again for what's missing", async () => {
  const { c, D: bare } = counted(d1()), sql = (q) => bare.sql.exec(q);
  const trips = async (t, ids = ["a"]) => { const was = c.n; await busyMap(bare, ids, t); return c.n - was; };
  assert.equal(await trips(T), 2, "nothing there: the whole statement tried, then the six tables looked up (nothing to read)");
  assert.equal(await trips(T + 1), 1, "then one: the tables looked for again");
  assert.equal(await busyNow({ DB: bare }, "a", T + 2), null);
  sql("CREATE TABLE fx_times (user_id TEXT NOT NULL, day TEXT NOT NULL, start INTEGER NOT NULL, stop INTEGER NOT NULL, tz TEXT NOT NULL, sport TEXT NOT NULL DEFAULT 'ride', source TEXT NOT NULL, made INTEGER NOT NULL, PRIMARY KEY (user_id, day))");
  bare.sql.prepare("INSERT INTO fx_times VALUES ('a', ?, ?, ?, 'UTC', 'ride', 'set', 0)").run(dayOf(T), T, T + H);
  let was = c.n;
  assert.ok((await busyMap(bare, ["a"], T + 3)).get("a"), "a table made since: read by the first call that finds it");
  assert.equal(c.n - was, 2, "(found in the one trip, then asked again with it)");
  assert.equal(await trips(T + 4), 1, "then one trip: the statement, and what's still missing looked for beside it");
  // every table there: the whole statement, kept for good
  sql(`CREATE TABLE fx_offers (user_id TEXT, id TEXT, start INTEGER, stop INTEGER, secs INTEGER, role TEXT, state TEXT, taken INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE td_rules (user_id TEXT, rule TEXT, level TEXT, held INTEGER);
    CREATE TABLE fx_acts (user_id TEXT, id TEXT, start INTEGER, added INTEGER); CREATE TABLE fx_garmin_new (user_id TEXT, id TEXT, start INTEGER, added INTEGER);
    CREATE TABLE fx_strava_new (user_id TEXT, id TEXT, start INTEGER, added INTEGER)`);
  assert.equal(await trips(T + 5), 2);
  assert.equal(await trips(T + 6), 1);
  assert.equal(await trips(T - D), 1, "for good, whatever the time");
  assert.equal(await trips(T + D, Array.from({ length: 100 }, (_, i) => `u${i}`)), 2, "(90 accounts a statement)");
  // (a database whose whole statement worked and now fails: that failure is said, not narrowed past; the next call
  // finds out afresh)
  sql("DROP TABLE fx_strava_new");
  await assert.rejects(busyMap(bare, ["a"], T));
  assert.equal(await trips(T), 3);
  // and a database with every table from the start, as the live one: one trip from the first call
  const { c: c2, D: full } = counted(env.DB);
  await busyMap(full, ["a"], T); await busyNow({ DB: full }, "a", T);
  assert.equal(c2.n, 2);
});

test("the off switch: with the Worker var RIDE_HOLD \"0\" nothing's held, nothing's said to have been, nothing's counted", async () => {
  const u = uid("offrider"), mira = uid("offmira"), off = { ...env, RIDE_HOLD: "0" };
  ride(u, T - 5 * MIN);
  run(`INSERT INTO pg_msgs (id, sender, recipient, ct, km, sent_at, deliver_at, instant) VALUES (?, ?, ?, 'x', 0, ?, ?, 1)`, crypto.randomUUID(), mira, u, T, T);
  assert.deepEqual([rideHoldOn(env), rideHoldOn({ ...env, RIDE_HOLD: "1" }), rideHoldOn(undefined), rideHoldOn(off)], [true, true, true, false]);
  assert.ok(await busyNow(env, u, T));
  assert.equal(await busyNow(off, u, T), null);
  assert.deepEqual(await busyMap(env.DB, [u], T, off), new Map());
  assert.equal(await heldCount(env, u, T - HOLD_EARLY, { t: T + MIN }), 1);
  assert.equal(await heldCount(off, u, T - HOLD_EARLY, { t: T + MIN }), 0);
  const on = holdsAt(env.DB, T + 3 * H, env), no = holdsAt(env.DB, T + 3 * H, off);
  await on.load([u]); await no.load([u]);
  assert.deepEqual([on.rode(u, T), no.rode(u, T)], [true, false]);
  const now = holdsAt(env.DB, T, off); await now.load([u]);
  assert.equal(now.holds(u), false);
});

test("a tick's view: who's riding now, and the rides that held and have ended (what's told now was held while they rode)", async () => {
  const ended = uid("ended"), capped = uid("capped"), quiet = uid("quiet"), now = uid("now");
  ride(ended, T - 2 * H); act("fx_acts", ended, T - 2 * H + MIN);
  ride(capped, T - 4 * H);
  ride(quiet, T - 3 * H); level(quiet, "quiet");
  ride(now, T - 10 * MIN);
  const view = holdsAt(env.DB, T);
  await view.load([ended, capped, quiet, now, uid("nobody")]);
  assert.deepEqual([view.holds(ended), view.holds(capped), view.holds(now)], [false, false, true]);
  assert.equal(view.rode(ended, T - 2 * H - 5 * MIN), true, "a message five minutes before the start: in the hold");
  assert.equal(view.rode(ended, T - 2 * H - 11 * MIN), false, "eleven minutes before: before it");
  assert.equal(view.rode(capped, T - 4 * H + 90 * MIN), true);
  assert.equal(view.rode(capped, T - 2 * H), false, "after the cap");
  assert.equal(view.rode(quiet, T - 3 * H + MIN), false, "a ride at quiet held nothing");
  assert.equal(view.rode(quiet, T - 3 * H + MIN, "apps"), false);
  assert.equal(view.rode(now, T - 5 * MIN), false, "still riding: nothing's been let go");
  await assert.doesNotReject(view.load([ended]), "asked once a tick");
  assert.throws(() => holdsAt(env.DB), TypeError);
});

test("a tick's view: a ride held from 10 minutes before its start until it came in, not to its cap; what came after it came once they were home", async () => {
  const home = uid("home"), start = T - 90 * MIN;
  // the ride began an hour and a half ago (its cap half an hour from now); it came in from Strava 30 minutes ago, and
  // from Fitness's import 20 minutes ago (the first to come in ends it)
  ride(home, start); act("fx_strava_new", home, start + MIN, T - 30 * MIN); act("fx_acts", home, start + MIN, T - 20 * MIN);
  const view = holdsAt(env.DB, T);
  await view.load([home]);
  assert.equal(view.holds(home), false, "home");
  assert.equal(view.rode(home, T - 40 * MIN), true, "before it came in: held");
  assert.equal(view.rode(home, T - 30 * MIN), false, "as it came in: not");
  assert.equal(view.rode(home, T - 10 * MIN), false, "a reaction ten minutes ago, twenty after it came in: not held, though the cap's to come");
});

test("the hold rule's record (td_rules.held), and what's waiting for someone riding now", async () => {
  const u = uid("rider");
  await heldAdd(env, u, 2); await heldAdd(env, u, 1); await heldAdd(env, u, 0); await heldAdd(env, u, -3);
  assert.deepEqual({ ...one("SELECT rule, level, held FROM td_rules WHERE user_id = ?", u) }, { rule: "holdRide", level: "do", held: 3 });
  level(u, "suggest"); await heldAdd(env, u, 1);
  assert.deepEqual({ ...one("SELECT level, held FROM td_rules WHERE user_id = ?", u) }, { level: "suggest", held: 4 }, "counted on, its level left alone");
  // what's held now: messages, a group's, a reaction, still waiting since the hold began; Markets' held alert and wrap
  const since = T - HOLD_EARLY, mira = uid("mira");
  const msg = (id, at, x = {}) => run(`INSERT INTO pg_msgs (id, sender, recipient, ct, km, sent_at, deliver_at, instant, notified_at, read_at) VALUES (?, ?, ?, 'x', 0, ?, ?, 1, ?, ?)`,
    id, mira, u, at, at, x.notified ?? null, x.read ?? null);
  msg("m1", T); msg("m2", T + MIN); msg("m3", T + 2 * MIN, { notified: T + 3 * MIN }); msg("m4", T + 3 * MIN, { read: T + 4 * MIN }); msg("m5", since - MIN); msg("m6", T + H);
  run("INSERT INTO pg_groups (id, name, created_by, created_at) VALUES ('g1', 'Riders', ?, 0)", mira);
  run("INSERT INTO pg_group_members (group_id, user_id, added_by, joined_at, muted) VALUES ('g1', ?, ?, 0, 0)", u, mira);
  run("INSERT INTO pg_gmsgs (id, group_id, sender, body, sender_key, pigeon, sent_at, instant) VALUES ('gm1', 'g1', ?, 'x', 'k', 'none', ?, 1)", mira, T);
  run("INSERT INTO pg_gdeliv (msg_id, user_id, wrap, km, deliver_at) VALUES ('gm1', ?, 'w', 0, ?)", u, T);
  run("INSERT INTO pg_reacts (id, msg_id, sender, recipient, ct, sent_at, deliver_at) VALUES ('r1', 'm0', ?, ?, 'x', ?, ?)", mira, u, T, T);
  run("INSERT INTO mk_alerts (user_id, symbol, pct, fired) VALUES (?, 'TSCO.L', 3, ?), (?, 'BP.L', 3, ?)", u, heldMark("2026-11-05", T + MIN), u, heldMark("2026-11-04", T - D));
  run("INSERT INTO mk_wrap (user_id, sent) VALUES (?, ?)", u, heldMark("2026-11-05", T + 2 * MIN));
  assert.equal(await heldCount(env, u, since, { t: T + 10 * MIN }), 2 + 1 + 1 + 1 + 1, "two messages, a group's, a reaction, today's alert and the wrap");
  assert.equal(await heldCount(env, u, since, { t: T + 2 * H }), 7, "an hour on, one more message waiting");
  assert.equal(await heldCount(env, uid("nobody"), since, { t: T }), 0);
  assert.equal(await heldCount({}, u, since, { t: T }), 0, "no database: nothing");
  // (and the time's passed in: never the server's clock, below the route)
  await assert.rejects(heldCount(env, u, since), TypeError);
  await assert.rejects(heldCount(env, u, since, { t: "now" }), TypeError);
});

// ---- the apps ----
// (the tick on the test's own clock, from T: the tick keeps to its time by the clock)
let wxFeed = { rainIn: 30, extra: false }, sent = [];
const wc = crypto.subtle, te = new TextEncoder();
async function keys() {
  const kp = await wc.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]), auth = crypto.getRandomValues(new Uint8Array(16)), pub = new Uint8Array(await wc.exportKey("raw", kp.publicKey));
  return { kp, pub, authBytes: auth, p256dh: Buffer.from(pub).toString("base64url"), auth: Buffer.from(auth).toString("base64url") };
}
const hkdf = async (salt, ikm, info, len) => new Uint8Array(await wc.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, await wc.importKey("raw", ikm, "HKDF", false, ["deriveBits"]), len * 8));
async function opened(k, buf) {
  const salt = buf.slice(0, 16), l = buf[20], asPub = buf.slice(21, 21 + l), ct = buf.slice(21 + l);
  const shared = new Uint8Array(await wc.deriveBits({ name: "ECDH", public: await wc.importKey("raw", asPub, { name: "ECDH", namedCurve: "P-256" }, false, []) }, k.kp.privateKey, 256));
  const ikm = await hkdf(k.authBytes, shared, new Uint8Array([...te.encode("WebPush: info\0"), ...k.pub, ...asPub]), 32);
  const key = await wc.importKey("raw", await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16), "AES-GCM", false, ["decrypt"]);
  const pt = new Uint8Array(await wc.decrypt({ name: "AES-GCM", iv: await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12) }, key, ct));
  let end = pt.length - 1; while (end > 0 && pt[end] === 0) end--;
  return JSON.parse(new TextDecoder().decode(pt.slice(0, end)));
}
let quote = { price: 104, prev: 100 };
// (the sunlight on a roof, as Open-Meteo has it for Weather's sun notices: each hour's the hour up to its time, a sunny
// spell from 13:00 to 16:00 on Monday 2 November, at tz_off 0)
const SUN_DAY = Date.UTC(2026, 10, 2);
const sunlight = () => {
  const time = [], w = [];
  for (let h = 1; h <= 48; h++) { const at = SUN_DAY + h * H, hr = new Date(at).getUTCHours(); time.push(new Date(at).toISOString().slice(0, 16)); w.push(at - SUN_DAY >= 14 * H && at - SUN_DAY <= 16 * H ? 600 : hr > 8 && hr < 17 ? 60 : 0); }
  return { utc_offset_seconds: 0, hourly: { time, global_tilted_irradiance: w } };
};
async function onClock(at, fn) {
  const real = globalThis.fetch, said = console.error, realNow = Date.now, from = realNow();
  Date.now = () => at + (realNow() - from);
  globalThis.fetch = async (url, o = {}) => {
    const u = new URL(String(url));
    if (String(url) === PUSH) { sent.push({ endpoint: o.headers["X-Endpoint"], body: new Uint8Array(o.body) }); return new Response("", { status: 201 }); }
    if (u.origin === W && u.pathname === "/v1/forecast" && u.searchParams.get("hourly") === "global_tilted_irradiance") return Response.json(sunlight());
    if (u.origin === W && u.pathname === "/v1/forecast") { const f = forecast(at, wxFeed.rainIn == null ? {} : { rainIn: wxFeed.rainIn }), k = (u.searchParams.get("latitude") || "").split(",").length; return Response.json(k > 1 ? Array(k).fill(f) : f); }
    if (u.origin === W && u.pathname === "/api/v1/warnings/feeds-united-kingdom") return Response.json(ukFeed(at, { extra: wxFeed.extra }));
    if (u.origin === W && u.pathname.startsWith("/api/v1/warnings/feeds-")) return Response.json({ warnings: [] });
    if (u.origin === W && u.pathname === "/flood-monitoring/id/floods") return Response.json({ items: [] });
    if (u.origin === MK && u.pathname.startsWith("/v8/finance/chart/")) {
      const sym = decodeURIComponent(u.pathname.split("/").pop());
      return Response.json({ chart: { result: [{ meta: { currency: "GBP", symbol: sym, exchangeName: "LSE", instrumentType: "EQUITY", regularMarketPrice: quote.price, previousClose: quote.prev, chartPreviousClose: quote.prev,
        longName: "Tesco PLC", regularMarketTime: Math.floor(at / 1000) - 60, exchangeTimezoneName: "Europe/London" }, timestamp: [Math.floor(at / 1000) - 60], indicators: { quote: [{ close: [quote.price] }] } }] } });
    }
    return new Response("{}", { status: 404 });
  };
  console.error = () => {};
  try { return await fn(); } finally { globalThis.fetch = real; console.error = said; Date.now = realNow; }
}
const person = (id) => {
  run("INSERT INTO pg_users (id, handle, name, email, pub, salt, proof_hash, vault, swift, swift_at, created_at) VALUES (?1, ?1, ?1, ?1 || '@example.com', '{}', 's', 'p', 'v', 3, 0, 0)", id);
  run("INSERT INTO pg_sessions (hash, user_id, created_at, seen_at) VALUES (?, ?, ?, ?)", `s-${id}`, id, T - D, T);
};
const RAIN = "weather:Rain in about 25 min";       // (12:05, the shower at 12:35, said by its quarter hour)
const told = async (k) => { const out = []; for (const p of sent.filter((x) => x.endpoint === k.endpoint)) out.push(await opened(k, p.body)); return out; };

test("Weather: rain and sun not sent during a ride (at do or suggest), and not told after; warnings always come", async () => {
  const NOON = Date.UTC(2026, 10, 2, 12, 5);        // (Monday, 12:05 at tz_off 0: no one's quiet hours)
  const who = { rider: uid("wxrider"), suggest: uid("wxsuggest"), calm: uid("wxcalm"), quiet: uid("wxquiet") }, k = {};
  for (const [name, id] of Object.entries(who)) {
    person(id); k[name] = { ...(await keys()), endpoint: `https://fcm.googleapis.com/fcm/send/wx-${name}` };
    run("INSERT INTO wx_devs (dev, endpoint, p256dh, auth, user_id, units, brief_at, created, updated, sess) VALUES (?, ?, ?, ?, ?, '{}', '07:00', ?, ?, ?)", `dev-${name}`, k[name].endpoint, k[name].p256dh, k[name].auth, id, NOON, NOON, `s-${id}`);
    run(`INSERT INTO wx_subs (id, dev, endpoint, p256dh, auth, lat, lon, name, rain, brief, brief_at, units, tz_off, created, updated, warn)
      VALUES (?1, ?2, ?3, ?4, ?5, 51.51, -0.13, 'London', 1, 0, '07:00', '{}', 0, ?6, ?6, 1)`, `dev-${name}:51.51,-0.13`, `dev-${name}`, k[name].endpoint, k[name].p256dh, k[name].auth, NOON);
  }
  for (const id of [who.rider, who.suggest, who.quiet]) ride(id, NOON - 20 * MIN);
  level(who.suggest, "suggest"); level(who.quiet, "quiet");
  const tick = async (at) => { sent = []; return onClock(at, () => wxTick(env, at, "https://georgefarrowgreen.com")); };
  const titles = async (name) => (await told(k[name])).map((x) => `${x.app}:${x.title}`);
  // rain in half an hour: told to the one not riding, and the one riding at quiet; held back from the two riding at do
  // and suggest, nothing claimed for them
  await tick(NOON);
  assert.deepEqual(await titles("calm"), [RAIN]);
  assert.deepEqual(await titles("quiet"), [RAIN], "at quiet, nothing's held");
  assert.deepEqual([await titles("rider"), await titles("suggest")], [[], []]);
  assert.deepEqual(all("SELECT dev, last_rain FROM wx_subs WHERE dev IN ('dev-rider', 'dev-suggest') ORDER BY dev").map((r) => r.last_rain), [null, null]);
  // a new amber warning: told to everyone, the riders too
  wxFeed = { rainIn: 30, extra: true };
  await tick(NOON + 5 * MIN);
  for (const name of ["rider", "suggest", "calm", "quiet"]) assert.ok((await titles(name)).some((s) => /^weather:.*wind warning/i.test(s)), `${name}: the warning comes (${await titles(name)})`);
  assert.deepEqual((await titles("rider")).filter((s) => /Rain/.test(s)), [], "still no rain while riding");
  // the ride's done (it came in from Strava), and the rain's passed by: nothing's said of the rain that was coming
  act("fx_strava_new", who.rider, NOON - 18 * MIN); act("fx_strava_new", who.suggest, NOON - 18 * MIN);
  wxFeed = { rainIn: null, extra: true };
  await tick(NOON + 10 * MIN);
  assert.deepEqual([await titles("rider"), await titles("suggest")], [[], []], "dropped, not told after");
  // and when rain's coming again, it's said as it is then
  wxFeed = { rainIn: 30, extra: true };
  await tick(NOON + 15 * MIN);
  assert.deepEqual(await titles("rider"), [RAIN]);
  assert.equal(one("SELECT held FROM td_rules WHERE user_id = ?", who.rider)?.held ?? 0, 0, "dropped notices aren't held ones");
});

test("Weather: the sun on a roof not told during a ride (nothing claimed for it), as it is to someone not riding; with the off switch, told", async () => {
  const HALF = Date.UTC(2026, 10, 2, 12, 30);       // (Monday 12:30 at tz_off 0: a tick that looks at the roofs)
  const who = { rider: uid("roofrider"), calm: uid("roofcalm") }, k = {};
  for (const [name, id] of Object.entries(who)) {
    person(id); k[name] = { ...(await keys()), endpoint: `https://fcm.googleapis.com/fcm/send/roof-${name}` };
    run("INSERT INTO wx_devs (dev, endpoint, p256dh, auth, user_id, units, brief_at, created, updated, sess) VALUES (?, ?, ?, ?, ?, '{}', '07:00', ?, ?, ?)", `dev-roof-${name}`, k[name].endpoint, k[name].p256dh, k[name].auth, id, HALF, HALF, `s-${id}`);
    run(`INSERT INTO wx_subs (id, dev, endpoint, p256dh, auth, lat, lon, name, rain, brief, brief_at, units, tz_off, created, updated, warn, solar)
      VALUES (?1, ?2, ?3, ?4, ?5, 52.62, 1.3, 'Norwich', 0, 0, '07:00', '{}', 0, ?6, ?6, 0, ?7)`, `dev-roof-${name}:52.62,1.3`, `dev-roof-${name}`, k[name].endpoint, k[name].p256dh, k[name].auth, HALF,
      JSON.stringify({ alert: true, faces: "S", pitch: 35 }));
  }
  ride(who.rider, HALF - 20 * MIN);
  const tick = async (at, e = env) => { sent = []; return onClock(at, () => wxTick(e, at, "https://georgefarrowgreen.com")); };
  const titles = async (name) => (await told(k[name])).map((x) => `${x.app}:${x.title}`);
  // half an hour before the sun's on the panels: told to the one not riding; not the one riding, and nothing claimed
  await tick(HALF);
  assert.deepEqual(await titles("calm"), ["weather:Sun’s coming out"]);
  assert.deepEqual(await titles("rider"), [], "riding: not told");
  assert.equal(one("SELECT last_sun FROM wx_subs WHERE dev = 'dev-roof-rider'").last_sun, null);
  // half an hour on, still riding, the Worker var RIDE_HOLD "0": told as anyone is (the sun's out now); the other once a spell
  await tick(HALF + 30 * MIN, { ...env, RIDE_HOLD: "0" });
  assert.deepEqual(await titles("rider"), ["weather:Sun’s out"]);
  assert.deepEqual(await titles("calm"), []);
});

test("Markets: an alert held during a ride (at do or suggest), counted once, and told after with its app; at quiet it goes at once", async () => {
  const t0 = Date.UTC(2026, 10, 3, 11, 0);          // (Tuesday, London open)
  const who = { rider: uid("mkrider"), suggest: uid("mksuggest"), quiet: uid("mkquiet") }, k = {};
  for (const [name, id] of Object.entries(who)) {
    person(id); k[name] = { ...(await keys()), endpoint: `https://fcm.googleapis.com/fcm/send/mk-${name}` };
    run("INSERT INTO mk_holdings (user_id, symbol, name, qty, added) VALUES (?, 'TSCO.L', 'Tesco', 10, 0)", id);
    run("INSERT INTO mk_alerts (user_id, symbol, pct) VALUES (?, 'TSCO.L', 3)", id);
    run("INSERT INTO mk_push (endpoint, user_id, p256dh, auth, added, session) VALUES (?, ?, ?, ?, 0, ?)", k[name].endpoint, id, k[name].p256dh, k[name].auth, `s-${id}`);
    ride(id, t0 - 30 * MIN);
  }
  level(who.suggest, "suggest"); level(who.quiet, "quiet");
  const tick = async (at) => { sent = []; return onClock(at, () => alertTick(env, at)); };
  await tick(t0);
  assert.deepEqual((await told(k.quiet)).map((x) => [x.app, x.title]), [["markets", "Tesco is up 4.0%"]], "at quiet: at once");
  assert.deepEqual([(await told(k.rider)).length, (await told(k.suggest)).length], [0, 0], "held at do, and at suggest (an app's)");
  assert.match(one("SELECT fired FROM mk_alerts WHERE user_id = ?", who.rider).fired, /^held:2026-11-03@\d+$/);
  assert.equal(await heldCount(env, who.rider, t0 - 40 * MIN, { t: t0 }), 1, "Today can say one's waiting");
  await tick(t0 + 5 * MIN);
  assert.equal((await told(k.rider)).length, 0);
  assert.equal(one("SELECT held FROM td_rules WHERE user_id = ?", who.rider).held, 1, "counted once, however many ticks it waits");
  // the ride's done: told now (still that far), as after quiet hours
  act("fx_acts", who.rider, t0 - 28 * MIN);
  await tick(t0 + 10 * MIN);
  assert.deepEqual((await told(k.rider)).map((x) => [x.app, x.title]), [["markets", "Tesco is up 4.0%"]]);
  assert.equal(one("SELECT fired FROM mk_alerts WHERE user_id = ?", who.rider).fired, "2026-11-03");
  assert.deepEqual((await told(k.suggest)), [], "the other still riding");
  // (a day's alert only once: the next tick says nothing more)
  await tick(t0 + 15 * MIN);
  assert.equal((await told(k.rider)).length, 0);
});

test("Markets: the evening wrap held during a ride, as through quiet hours, counted once, and sent after", async () => {
  const t1 = Date.UTC(2026, 10, 3, 17, 0);          // (Tuesday 17:00 in London: its market's shut)
  const rider = uid("wraprider"), k = { ...(await keys()), endpoint: "https://fcm.googleapis.com/fcm/send/wrap-rider" };
  person(rider);
  run("INSERT INTO mk_holdings (user_id, symbol, name, qty, added) VALUES (?, 'TSCO.L', 'Tesco', 10, 0)", rider);
  run("INSERT INTO mk_push (endpoint, user_id, p256dh, auth, added, session) VALUES (?, ?, ?, ?, 0, ?)", k.endpoint, rider, k.p256dh, k.auth, `s-${rider}`);
  ride(rider, t1 - 20 * MIN);
  const tick = async (at) => { sent = []; return onClock(at, () => wrapTick(env, at)); };
  await tick(t1);
  assert.equal((await told(k)).length, 0, "not while riding (the others' wraps go as ever)");
  assert.match(one("SELECT sent FROM mk_wrap WHERE user_id = ?", rider).sent, /^held:2026-11-03@\d+$/);
  await tick(t1 + 5 * MIN);
  assert.equal(one("SELECT held FROM td_rules WHERE user_id = ?", rider).held, 1);
  act("fx_garmin_new", rider, t1 - 19 * MIN);
  await tick(t1 + 10 * MIN);
  assert.deepEqual((await told(k)).map((x) => [x.app, x.tag]), [["markets", "mk-wrap"]]);
  assert.equal(one("SELECT sent FROM mk_wrap WHERE user_id = ?", rider).sent, "2026-11-03");
});
