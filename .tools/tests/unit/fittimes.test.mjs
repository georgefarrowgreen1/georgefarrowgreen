// A ride's time of day in Fitness (Today First, spec §6.2, §9.3: functions/api/fitness/[[path]].js PUT and DELETE time,
// GET me's times, functions/_fittimes.js), through Fitness's own route, against a real database (node:sqlite, made to
// look like D1): set (Ride At) and cleared only from Fitness's own pages, signed in, for the account's own day; on the
// five minutes, 15 minutes to 6 hours, on the day it says, not passed and not past the coming week; one a day, Today's
// replaced; the rows that ended over 8 days ago tidied as the next is kept. GET me gives today's and the next 7 days'
// times (by the phone's zone, or wherever today could be), and lists Today's own rides only with ?today=1 (with taken and
// the friend's id), never changing a plain GET me's offers; Fitness's Add, Keep and Undo of one of Today's own. And the
// account's export and drop.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { db, issueSession, hex, sha256 } from "../../../functions/_pigeon.js";
import { fitdb, dropFitness } from "../../../functions/_fitness.js";
import { onRequest as fitnessApi } from "../../../functions/api/fitness/[[path]].js";
import { addTodayOffer, addOffer, daySpan } from "../../../functions/_fitshare.js";
import { setTime, timesExport, dropTimes, timeFor } from "../../../functions/_fittimes.js";

const sql = new DatabaseSync(":memory:");
const val = (a) => a.map((x) => (typeof x === "boolean" ? +x : x === undefined ? null : x));
const st = (q, a = []) => ({ sql: q, bind: (...b) => st(q, b), first: async () => sql.prepare(q).get(...val(a)) ?? null,
  all: async () => ({ results: sql.prepare(q).all(...val(a)), meta: {} }), run: async () => ({ meta: { changes: Number(sql.prepare(q).run(...val(a)).changes) } }) });
const env = {
  DB: { prepare: (q) => st(q),
    batch: async (list) => { sql.exec("BEGIN"); try { const out = []; for (const s of list) out.push(/^\s*(INSERT|UPDATE|DELETE)/i.test(s.sql) ? await s.run() : await s.all()); sql.exec("COMMIT"); return out; } catch (e) { sql.exec("ROLLBACK"); throw e; } } },
  FITNESS_HOST: "fitness.localhost",
};
await db(env); await fitdb(env);
const put = (table, row) => sql.prepare(`INSERT OR REPLACE INTO ${table} (${Object.keys(row).join(", ")}) VALUES (${Object.keys(row).map(() => "?").join(", ")})`).run(...val(Object.values(row)));
const MIN = 60e3, H = 3600e3, DAY = 864e5, now = Date.now(), TZ = "Europe/London";
const dayIn = (tz, t) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
const limitOf = (key) => sql.prepare("SELECT count FROM pg_limits WHERE key = ?").get(key)?.count ?? 0;

// ---- two accounts, each signed in to Fitness with the site's cookie ----
const user = (id) => put("pg_users", { id, handle: id, name: `${id[0].toUpperCase()}${id.slice(1)}`, email: `${id}@example.com`, pub: "{}", salt: "s", proof_hash: "p", vault: "v", swift: 9, swift_at: 0, created_at: 0 });
const FIT = "http://fitness.localhost", cookies = {};
for (const id of ["ann", "bo"]) {
  user(id);
  const hash = hex(await sha256(await issueSession(env, id, new Request(`${FIT}/api/fitness/me`)))); cookies[id] = `f${id}`.padEnd(43, "x");
  sql.prepare("UPDATE pg_sessions SET site_hash = ? WHERE hash = ?").run(hex(await sha256(cookies[id])), hash);
}
const fit = (method, path, { who = "ann", origin = FIT, data, query = "" } = {}) => fitnessApi({ env, params: { path: path.split("/") }, waitUntil: () => {},
  request: new Request(`${FIT}/api/fitness/${path}${query}`, { method, headers: { ...(who ? { Cookie: `account=${cookies[who]}` } : {}), ...(origin ? { Origin: origin } : {}), "Content-Type": "application/json" }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) }) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
const rows = (who) => sql.prepare("SELECT day, start, stop, tz, sport, source FROM fx_times WHERE user_id = ? ORDER BY day").all(who).map((r) => ({ ...r }));

// tomorrow at 16:45, London: a time on the five minutes, well ahead
const D1 = dayIn(TZ, now + DAY), S1 = daySpan(D1, TZ).start + 16 * H + 45 * MIN;

test("Ride At: a ride's time kept for the day, from Fitness's own pages, signed in; one a day, in place of Today's", async () => {
  const r = await fit("PUT", "time", { data: { day: D1, start: S1, stop: S1 + 75 * MIN, tz: TZ } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body, { time: { day: D1, start: S1, stop: S1 + 75 * MIN, source: "set" } });
  assert.deepEqual(rows("ann"), [{ day: D1, start: S1, stop: S1 + 75 * MIN, tz: TZ, sport: "ride", source: "set" }], "a ride, set here");
  // (not from another page, not signed out; and nothing kept for those)
  assert.equal((await fit("PUT", "time", { origin: "http://elsewhere.localhost", data: { day: D1, start: S1, stop: S1 + H, tz: TZ } })).status, 403);
  assert.equal((await fit("PUT", "time", { origin: null, data: { day: D1, start: S1, stop: S1 + H, tz: TZ } })).status, 403);
  assert.equal((await fit("PUT", "time", { who: null, data: { day: D1, start: S1, stop: S1 + H, tz: TZ } })).status, 401);
  assert.equal(rows("ann")[0].stop, S1 + 75 * MIN);
  // (a second for the day takes its place, Today's too; never another account's)
  await setTime(env, "ann", { day: D1, start: S1 - H, stop: S1, tz: TZ, source: "today" }, { t: now });
  assert.equal(rows("ann")[0].source, "today");
  assert.equal((await fit("PUT", "time", { data: { day: D1, start: S1 + 30 * MIN, stop: S1 + 2 * H, tz: TZ } })).status, 200);
  assert.deepEqual(rows("ann").map((x) => [x.day, x.start, x.source]), [[D1, S1 + 30 * MIN, "set"]]);
  assert.equal(rows("bo").length, 0, "the account's own");
  assert.ok(limitOf("fxtime:ann") >= 2, "each counted against its own limit");
});

test("Ride At: on the five minutes, 15 minutes to 6 hours, on the day it says in its zone, not passed, not past the coming week", async () => {
  const ok = { day: D1, start: S1, stop: S1 + H, tz: TZ };
  for (const bad of [{ start: S1 + MIN }, { stop: S1 + 10 * MIN }, { stop: S1 + 6 * H + 5 * MIN }, { stop: S1 - H }, { day: dayIn(TZ, now + 2 * DAY) }, { day: "2026-02-30" },
    { tz: "Not/AZone" }, { tz: undefined }, { start: String(S1) }, { day: undefined }]) {
    const r = await fit("PUT", "time", { who: "bo", data: { ...ok, ...bad } });
    assert.equal(r.status, 400, `${JSON.stringify(bad)}: ${JSON.stringify(r.body)}`);
  }
  assert.equal((await fit("PUT", "time", { who: "bo", data: "nope" })).status, 400);
  assert.equal((await fit("PUT", "time", { who: "bo", data: { ...ok, bad: "x".repeat(2000) } })).status, 413, "a small body only");
  // (one already over, and one more than a week off)
  const gone = Math.floor((now - 3 * H) / (5 * MIN)) * 5 * MIN, far = daySpan(dayIn(TZ, now + 10 * DAY), TZ).start + 10 * H;
  assert.equal((await fit("PUT", "time", { who: "bo", data: { day: dayIn(TZ, gone), start: gone, stop: gone + H, tz: TZ } })).status, 409);
  assert.equal((await fit("PUT", "time", { who: "bo", data: { day: dayIn(TZ, far), start: far, stop: far + H, tz: TZ } })).status, 400);
  assert.equal(rows("bo").length, 0, "none of those kept");
  // (the longest and the shortest, and another zone's day)
  assert.equal((await fit("PUT", "time", { who: "bo", data: { ...ok, stop: S1 + 6 * H } })).status, 200);
  assert.equal((await fit("PUT", "time", { who: "bo", data: { ...ok, stop: S1 + 15 * MIN } })).status, 200);
  const ny = "America/New_York", dn = dayIn(ny, now + DAY), sn = daySpan(dn, ny).start + 7 * H;
  assert.equal((await fit("PUT", "time", { who: "bo", data: { day: dn, start: sn, stop: sn + H, tz: ny } })).status, 200);
  assert.equal(rows("bo").find((x) => x.tz === ny).day, dn);
});

test("Ride At cleared: the account's own day only; the day checked", async () => {
  await fit("PUT", "time", { who: "bo", data: { day: D1, start: S1, stop: S1 + H, tz: TZ } });
  assert.equal((await fit("DELETE", "time", { who: "ann", origin: "http://elsewhere.localhost", data: { day: D1 } })).status, 403);
  assert.equal((await fit("DELETE", "time", { who: null, data: { day: D1 } })).status, 401);
  for (const day of ["tomorrow", null, 20261105]) assert.equal((await fit("DELETE", "time", { data: { day } })).status, 400, String(day));
  assert.deepEqual(await fit("DELETE", "time", { data: { day: D1 } }), { status: 200, body: { ok: true } });
  assert.equal(await timeFor(env, "ann", D1), null, "ann's gone");
  assert.ok(await timeFor(env, "bo", D1), "bo's still there");
  assert.deepEqual(await fit("DELETE", "time", { data: { day: D1 } }), { status: 200, body: { ok: true } }, "none there: still fine");
});

test("old rows tidied as the next is kept: those that ended over 8 days ago, the account's own", async () => {
  const old = now - 9 * DAY, recent = now - 7 * DAY;
  put("fx_times", { user_id: "ann", day: dayIn(TZ, old), start: old - H, stop: old, tz: TZ, sport: "ride", source: "set", made: 0 });
  put("fx_times", { user_id: "ann", day: dayIn(TZ, recent), start: recent - H, stop: recent, tz: TZ, sport: "ride", source: "today", made: 0 });
  put("fx_times", { user_id: "bo", day: dayIn(TZ, old), start: old - H, stop: old, tz: TZ, sport: "ride", source: "set", made: 0 });
  assert.equal((await fit("PUT", "time", { data: { day: D1, start: S1, stop: S1 + H, tz: TZ } })).status, 200);
  assert.deepEqual(rows("ann").map((x) => x.day), [dayIn(TZ, recent), D1], "the old one gone, the week-old kept");
  assert.ok(rows("bo").some((x) => x.day === dayIn(TZ, old)), "nobody else's");
});

test("GET me: the rides' times, today's and the next 7 days', by the phone's zone; each just its day, start, stop and source", async () => {
  sql.exec("DELETE FROM fx_times WHERE user_id = 'ann'");
  const at = (dd, hh) => { const d = dayIn(TZ, now + dd * DAY); return { d, s: daySpan(d, TZ).start + hh * H }; };
  for (const [dd, src] of [[-1, "set"], [0, "today"], [3, "moved"], [7, "set"], [9, "set"]]) {
    const { d, s } = at(dd, 22);
    put("fx_times", { user_id: "ann", day: d, start: s, stop: s + H, tz: TZ, sport: "ride", source: src, made: 0 });
  }
  const me = await fit("GET", "me", { query: `?tz=${encodeURIComponent(TZ)}` });
  assert.equal(me.status, 200, JSON.stringify(me.body));
  assert.deepEqual(me.body.times.map((x) => x.day), [at(0, 0).d, at(3, 0).d, at(7, 0).d], "today and the next 7 days, in order");
  assert.deepEqual(Object.keys(me.body.times[0]).sort(), ["day", "source", "start", "stop"]);
  assert.deepEqual(me.body.times[0], { day: at(0, 0).d, start: at(0, 22).s, stop: at(0, 22).s + H, source: "today" });
  // (no zone said: wherever today could be on Earth's clocks, so today's is there whatever the phone's zone)
  const wide = await fit("GET", "me");
  for (const d of [at(0, 0).d, at(3, 0).d, at(7, 0).d]) assert.ok(wide.body.times.some((x) => x.day === d), d);
  assert.ok(!wide.body.times.some((x) => x.day === at(9, 0).d), "not past the week");
  assert.equal((await fit("GET", "me", { query: "?tz=Not%2FAZone" })).body.times.length, wide.body.times.length, "a zone the clocks don't know: as none");
  // (another account's never; and signed out, nothing)
  assert.deepEqual((await fit("GET", "me", { who: "bo" })).body.times.filter((x) => x.source === "today"), []);
  assert.deepEqual((await fit("GET", "me", { who: null })).body, { signedIn: false });
});

test("GET me lists Today's own rides only with ?today=1, with taken and the friend's id; a plain GET me's offers just as before", async () => {
  const s = daySpan(dayIn(TZ, now + 2 * DAY), TZ).start + 10 * H;
  const added = await addTodayOffer(env, "ann", { start: s, stop: s + 2 * H, tz: TZ, sport: "ride", wid: "free-ride", name: "Ride how you like", secs: 7200, dry: true, state: "yes" }, { t: now });
  const offered = await addTodayOffer(env, "ann", { start: s + DAY, stop: s + DAY + 2 * H, tz: TZ, sport: "ride", wid: "free-ride", name: "Ride how you like", secs: 7200, state: "new" }, { t: now });
  const leo = { id: crypto.randomUUID(), start: s + 2 * DAY, stop: s + 2 * DAY + 2 * H, tz: TZ, sport: "ride", wid: "free-ride", name: "Ride how you like", secs: 7200, who: "Leo", role: "answered", withId: "leo-id" };
  await addOffer(env, "ann", leo, { checked: true, t: now });
  const plain = await fit("GET", "me");
  assert.deepEqual(plain.body.offers.map((o) => o.id), [leo.id], "no ride of Today's without ?today=1");
  assert.deepEqual(Object.keys(plain.body.offers[0]).sort(), ["dry", "far", "id", "name", "role", "secs", "sport", "start", "state", "stop", "who", "wid"], "the keys Fitness has always had");
  const today = await fit("GET", "me", { query: "?today=1" });
  assert.deepEqual(today.body.offers.map((o) => [o.id, o.role, o.state, o.taken, o.withId]),
    [[added, "today", "yes", false, null], [offered, "today", "new", false, null], [leo.id, "answered", "new", false, "leo-id"]]);
  assert.equal(today.body.offers[0].who, "", "Today's own: from nobody");
});

test("Fitness's Add, Keep and Undo of one of Today's own: Add and Keep a tap (taken), Undo a no from agreed; a friend's agreed plan never said no to", async () => {
  const s = daySpan(dayIn(TZ, now + 3 * DAY), TZ).start + 9 * H;
  const one = (state, dd = 0) => addTodayOffer(env, "bo", { start: s + dd * DAY, stop: s + dd * DAY + H, tz: TZ, sport: "ride", wid: "free-ride", name: "Ride how you like", secs: 3600, state }, { t: now });
  const added = await one("yes"), offered = await one("new", 1);
  const row = (id) => ({ ...sql.prepare("SELECT state, taken FROM fx_offers WHERE user_id = 'bo' AND id = ?").get(id) });
  assert.deepEqual(row(added), { state: "yes", taken: 0 }, "added by Today: agreed, not kept");
  // Keep (on one added) and Add to My Plan (on one offered): both "yes", both a tap
  assert.deepEqual(await fit("POST", `offers/${added}`, { who: "bo", data: { answer: "yes" } }), { status: 200, body: { ok: true } });
  assert.deepEqual(await fit("POST", `offers/${offered}`, { who: "bo", data: { answer: "yes" } }), { status: 200, body: { ok: true } });
  assert.deepEqual([row(added), row(offered)], [{ state: "yes", taken: 1 }, { state: "yes", taken: 1 }]);
  assert.deepEqual((await fit("GET", "me", { who: "bo", query: "?today=1" })).body.offers.filter((o) => o.role === "today").map((o) => o.taken), [true, true]);
  // Undo: no, from agreed; then gone from the list, and no again changes nothing
  assert.deepEqual(await fit("POST", `offers/${added}`, { who: "bo", data: { answer: "no" } }), { status: 200, body: { ok: true } });
  assert.equal(row(added).state, "no");
  assert.ok(!(await fit("GET", "me", { who: "bo", query: "?today=1" })).body.offers.some((o) => o.id === added));
  assert.equal((await fit("POST", `offers/${added}`, { who: "bo", data: { answer: "yes" } })).status, 404, "a no stays no");
  // (not another account's; a friend's agreed plan can't be said no to)
  assert.equal((await fit("POST", `offers/${offered}`, { who: "ann", data: { answer: "no" } })).status, 404);
  const f = { id: crypto.randomUUID(), start: s + 2 * DAY, stop: s + 2 * DAY + 2 * H, tz: TZ, sport: "ride", wid: "free-ride", name: "Ride how you like", secs: 7200, who: "Cy", role: "asked" };
  await addOffer(env, "bo", f, { t: now });
  assert.equal((await fit("POST", `offers/${f.id}`, { who: "bo", data: { answer: "yes" } })).status, 200);
  assert.equal(row(f.id).taken, 1, "Fitness's Add of a friend's plan: a tap too");
  assert.equal((await fit("POST", `offers/${f.id}`, { who: "bo", data: { answer: "no" } })).status, 404);
});

test("the account's export holds its rides' times (no one else's); an account gone takes them, made or not", async () => {
  put("fx_times", { user_id: "cy", day: D1, start: S1, stop: S1 + H, tz: TZ, sport: "ride", source: "set", made: 1 });
  assert.deepEqual(await timesExport(env, "cy"), [{ day: D1, start: S1, stop: S1 + H, tz: TZ, sport: "ride", source: "set" }]);
  assert.deepEqual(await timesExport(env, "nobody"), []);
  await dropFitness(env, "cy");
  assert.deepEqual(await timesExport(env, "cy"), [], "gone with the account");
  assert.ok(rows("ann").length && rows("bo").length, "nobody else's");
  // (a database where the table was never made: nothing to export, nothing to drop, no error)
  const bare = new DatabaseSync(":memory:");
  const b = (q, a = []) => ({ sql: q, bind: (...x) => b(q, x), first: async () => bare.prepare(q).get(...val(a)) ?? null, all: async () => ({ results: bare.prepare(q).all(...val(a)) }), run: async () => ({ meta: { changes: Number(bare.prepare(q).run(...val(a)).changes) } }) });
  const benv = { DB: { prepare: (q) => b(q), batch: async (l) => { const out = []; for (const s of l) out.push(/^\s*(INSERT|UPDATE|DELETE|CREATE)/i.test(s.sql) ? await s.run() : await s.all()); return out; } } };
  await fitdb(benv).catch(() => {});
  bare.exec("DROP TABLE IF EXISTS fx_times");
  assert.deepEqual(await timesExport(benv, "cy"), []);
  await dropTimes(benv, "cy");
});
