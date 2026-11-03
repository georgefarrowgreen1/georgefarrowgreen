// Times and rides agreed in Chat, the server's part (Today First, spec §6.3, §8.4): run as Chat's API is (its router,
// functions/api/pigeon) against a database of its own (Node's SQLite in memory, made to look like D1, with the site's
// schema). POST time-offer: friends only, a time to come on a quarter hour, 15 minutes to 4 hours, the invite's id, the
// caller's own row with the friend's first name looked up here. The inviter's pending row (with its other times) made
// agreed by the friend's Yes, from the friend's phone alone (the inviter's phone shut: nothing more from it after the
// invite); a time not offered, another kind, or an answer from anyone else leaving it pending; the inviter's later call
// changing nothing, and agreeing a pending row only at a time it offered; a Yes that comes before the pending row
// agreeing it as that row comes. POST fit-offer the same for rides (pending → new, and offerSoon's later call adding no
// second row), a friend's id stored only for a friend, with their first name as the server has it. GET sync's times
// (agreed only), rides (with a friend, new or agreed) and hold (a ride at its do level, else quiet hours, with when it
// ends), read in sync's own trip, and the rest of sync answered all the same were those reads ever to fail; ?quiet=1
// leaving pg_users.seen_at alone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { db, issueSession } from "../../../functions/_pigeon.js";
import { onRequest, quietEnd, holdOf } from "../../../functions/api/pigeon/[[path]].js";
import { isQuiet, prefsOf } from "../../../functions/_notify.js";
import { timesFor, addTime, promoteTime } from "../../../functions/_times.js";
import { offersFor } from "../../../functions/_fitshare.js";
import * as busyMod from "../../../functions/_busy.js";
import { setTime } from "../../../functions/_fittimes.js";
import { tddb } from "../../../functions/_today.js";

// ---- D1, as much of it as the server uses (as instant.test.mjs has it), every batch's statements noted ----
const batches = [];
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
    sql, bind: (...a) => st(sql, a),
    first: async (col) => { const row = s.prepare(sql).get(...val(args)) ?? null; return col && row ? row[col] ?? null : row; },
    all: async () => exec(sql, args), run: async () => exec(sql, args),
    raw: async () => s.prepare(sql).all(...val(args)).map((r) => Object.values(r)),
    now: () => exec(sql, args),
  });
  return { sql: s, prepare: (q) => st(q),
    async batch(list) { batches.push(list.map((x) => x.sql)); s.exec("BEGIN"); try { const r = list.map((x) => x.now()); s.exec("COMMIT"); return r; } catch (e) { s.exec("ROLLBACK"); throw e; } } };
}
const said = console.error;
console.error = () => {};
test.after(() => { console.error = said; });

const env = { DB: d1(), WX_TRAFFIC_TICK: "0" };
await db(env);
const S = env.DB.sql;
// (the minute tick from traffic held off: nothing but what the test asks for)
S.prepare("INSERT OR REPLACE INTO pg_meta (k, v) VALUES ('tick', '99999999999999'), ('notify_since', '0')").run();
const one = (sql, ...a) => S.prepare(sql).get(...a), all = (sql, ...a) => S.prepare(sql).all(...a), run = (sql, ...a) => S.prepare(sql).run(...a);
const put = (table, row) => S.prepare(`INSERT INTO ${table} (${Object.keys(row).join(", ")}) VALUES (${Object.keys(row).map(() => "?").join(", ")})`).run(...Object.values(row).map((v) => (v === undefined ? null : typeof v === "boolean" ? Number(v) : v)));

let n = 0;
const uid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
async function person(name) {
  const id = uid();
  put("pg_users", { id, handle: `h${n}`, name, email: `${id}@example.com`, pub: "{}", salt: "s", proof_hash: "p", vault: "v", swift: 9, swift_at: 0, created_at: 0, lat: 51.5, lon: -0.12, place: "London" });
  return { id, name, token: await issueSession(env, id, new Request("http://localhost/")) };
}
const befriend = (a, b, status = "ok") => put("pg_links", { a: a.id, b: b.id, status, created_at: 0 });
// the API as each phone asks it, every call noted by whose phone made it
const calls = [];
async function api(p, method, path, body) {
  calls.push({ who: p.id, method, path });
  const request = new Request(`http://localhost/api/pigeon/${path}`, { method, headers: { Authorization: `Bearer ${p.token}`, "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.9" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const later = [], res = await onRequest({ request, env, waitUntil: (x) => later.push(x), params: {} });
  await Promise.allSettled(later);
  return { status: res.status, body: await res.json().catch(() => null) };
}
const clearLimits = () => run("DELETE FROM pg_limits");

const MIN = 60e3, H = 60 * MIN, Q = 15 * MIN;
const george = await person("George Farrow-Green"), mira = await person("Mira Okafor"), pat = await person("Pat Lee"), zed = await person("Zed Stranger"), ivy = await person("Ivy Asked");
befriend(george, mira); befriend(pat, george); befriend(mira, pat); befriend(george, ivy, "pending");
// (a quarter hour some hours ahead: times for calls)
const at = (hours) => Math.ceil(Date.now() / Q) * Q + hours * H;
const timeRow = (user, id) => one("SELECT * FROM td_times WHERE user_id = ? AND id = ?", user.id, id);
const call = (x = {}) => ({ id: crypto.randomUUID(), kind: "call", start: at(3), stop: at(3) + 30 * MIN, tz: "Europe/London", ...x });
await timesFor(env, "nobody", 0, null, { t: Date.now() });   // (td_times made, as its first use would, so it can be read before then)

// ================================ time-offer ================================
test("time-offer: friends only, a time to come on a quarter hour, 15 minutes to 4 hours, the invite's id; the caller's own row, the friend's first name looked up", async () => {
  clearLimits();
  const bad = async (x, status, why) => assert.equal((await api(george, "POST", "time-offer", call({ with: mira.id, role: "asked", ...x }))).status, status, why);
  await bad({ with: zed.id }, 403, "not a friend");
  await bad({ with: ivy.id }, 403, "asked, not yet a friend");
  await bad({ with: george.id }, 400, "yourself");
  await bad({ with: undefined }, 400, "no friend");
  await bad({ with: "x".repeat(65) }, 400, "not an id");
  await bad({ id: "not-a-uuid" }, 400, "not the invite's id");
  await bad({ kind: "dinner" }, 400, "a call or a meeting only");
  await bad({ start: at(3) + 7 * MIN, stop: at(3) + 37 * MIN }, 400, "not on a quarter hour");
  await bad({ stop: at(3) + 10 * MIN }, 400, "under 15 minutes");
  await bad({ stop: at(3) + 245 * MIN }, 400, "over 4 hours");
  await bad({ stop: at(3) - 30 * MIN }, 400, "ends before it starts");
  await bad({ start: String(at(3)) }, 400, "not a number");
  await bad({ tz: "Not/AZone" }, 400, "a real zone");
  await bad({ start: at(-1), stop: at(-1) + 30 * MIN }, 409, "begun already");
  await bad({ role: "maybe" }, 400, "asked or answered");
  await bad({ role: "answered", state: "pending" }, 400, "pending is the inviter's");
  await bad({ state: "yes" }, 400, "pending or nothing");
  await bad({ state: "pending", opts: [[at(5), at(5) + 30 * MIN], [at(6), at(6) + 30 * MIN], [at(7), at(7) + 30 * MIN], [at(8), at(8) + 30 * MIN]] }, 400, "3 other times at most");
  await bad({ state: "pending", opts: [[at(5) + 5 * MIN, at(5) + 35 * MIN]] }, 400, "another time checked as the main one is");
  assert.equal(all("SELECT * FROM td_times").length, 0, "none of those wrote anything");

  const c = call({ kind: "meet", start: at(4), stop: at(4) + 4 * H, id: crypto.randomUUID().toUpperCase() });
  const r = await api(george, "POST", "time-offer", { ...c, with: mira.id, role: "asked" });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.deepEqual(r.body, { ok: true });
  const row = timeRow(george, c.id.toLowerCase());
  assert.ok(row, "the caller's own row, under the invite's id");
  assert.deepEqual({ ...row, made: 0 }, { user_id: george.id, id: c.id.toLowerCase(), kind: "meet", start: c.start, stop: c.stop, tz: "Europe/London", with_id: mira.id, who: "Mira",
    role: "asked", state: "yes", opts: null, made: 0, until: c.stop + 12 * H });
  assert.equal(all("SELECT * FROM td_times WHERE user_id = ?", mira.id).length, 0, "nothing of the friend's");
  // (an hour-long quarter-hour time, a friend asked the other way round (pg_links b = the caller): both fine)
  assert.equal((await api(pat, "POST", "time-offer", call({ with: george.id, role: "asked" }))).status, 200);
  assert.equal(all("SELECT who FROM td_times WHERE user_id = ?", pat.id)[0].who, "George", "the first name of the friend's Chat name");
  // the limit: 30 an hour for the account
  run("UPDATE pg_limits SET count = 30 WHERE key = ?", `timeoffer:${george.id}`);
  assert.equal((await api(george, "POST", "time-offer", call({ with: mira.id, role: "asked" }))).status, 429, "the 31st in an hour");
  assert.ok(one("SELECT 1 FROM pg_limits WHERE key = ?", `timeoffer:${pat.id}`), "counted for each account");
  run("DELETE FROM td_times");
});

test("time-offer: the inviter's pending row (with its other times) becomes yes at the time the friend chose, with the inviter's phone shut", async () => {
  clearLimits();
  const inv = call({ start: at(2), stop: at(2) + 30 * MIN }), o1 = [at(5), at(5) + 45 * MIN], o2 = [at(26), at(26) + 30 * MIN];
  const r = await api(george, "POST", "time-offer", { ...inv, with: mira.id, role: "asked", state: "pending", opts: [o1, { start: o2[0], end: o2[1] }] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const pending = timeRow(george, inv.id);
  assert.equal(pending.state, "pending"); assert.deepEqual(JSON.parse(pending.opts), [o1, o2]); assert.equal(pending.until, o2[1], "kept until the last time it offered ends");
  // a pending row is never Today's, and never in sync's times
  assert.deepEqual(await timesFor(env, george.id, 0, null, { t: Date.now() }), []);
  assert.deepEqual((await api(george, "GET", "sync")).body.times, []);
  // from here on, only Mira's phone: George's is shut
  const mark = calls.length;
  const yes = await api(mira, "POST", "time-offer", { id: inv.id, kind: "call", start: o1[0], stop: o1[1], tz: "Europe/Paris", with: george.id, role: "answered" });
  assert.equal(yes.status, 200, JSON.stringify(yes.body)); assert.deepEqual(yes.body, { ok: true }, "nothing said of the inviter's row");
  assert.ok(calls.slice(mark).every((c) => c.who === mira.id), "no call from George's phone since the invite");
  const g = timeRow(george, inv.id), m = timeRow(mira, inv.id);
  assert.deepEqual([g.state, g.start, g.stop, g.until, g.opts, g.who, g.with_id, g.tz], ["yes", o1[0], o1[1], o1[1] + 12 * H, null, "Mira", mira.id, "Europe/London"], "George's: agreed at Mira's time");
  assert.deepEqual([m.state, m.role, m.start, m.stop, m.who, m.with_id, m.tz], ["yes", "answered", o1[0], o1[1], "George", george.id, "Europe/Paris"], "Mira's own");
  // in the one batch: Mira's row and George's
  assert.ok(batches.some((b) => b.some((q) => /^\s*INSERT INTO td_times/.test(q)) && b.some((q) => /^\s*UPDATE td_times SET state = 'yes'/.test(q))), "Mira's row and the promotion in one batch");
  // Today reads it for both
  assert.deepEqual((await timesFor(env, george.id, 0, null, { t: Date.now() })).map((x) => [x.id, x.withId, x.who, x.role]), [[inv.id, mira.id, "Mira", "asked"]]);
  assert.deepEqual((await api(george, "GET", "sync")).body.times, [{ id: inv.id, with: mira.id, kind: "call", start: o1[0], stop: o1[1] }]);
  assert.deepEqual((await api(mira, "GET", "sync")).body.times, [{ id: inv.id, with: george.id, kind: "call", start: o1[0], stop: o1[1] }]);
  // the inviter's phone drawing the Yes later (offerSoon's backstop) changes nothing, at whatever time it says
  assert.equal((await api(george, "POST", "time-offer", { ...inv, start: o2[0], stop: o2[1], with: mira.id, role: "asked" })).status, 200);
  assert.deepEqual(timeRow(george, inv.id), g, "George's row as Mira's Yes left it");
  // the same Yes again changes nothing either
  assert.equal((await api(mira, "POST", "time-offer", { id: inv.id, kind: "call", start: o2[0], stop: o2[1], tz: "Europe/Paris", with: george.id, role: "answered" })).status, 200);
  assert.deepEqual([timeRow(mira, inv.id).start, timeRow(george, inv.id).start], [o1[0], o1[0]], "one answered stays answered");
  run("DELETE FROM td_times");
});

test("time-offer: a time not offered, another kind, or a Yes from anyone but that friend leaves the inviter's row pending", async () => {
  clearLimits();
  const inv = call({ start: at(2), stop: at(2) + 30 * MIN }), o1 = [at(5), at(5) + 30 * MIN];
  await api(george, "POST", "time-offer", { ...inv, with: mira.id, role: "asked", state: "pending", opts: [o1] });
  const was = timeRow(george, inv.id);
  // a time not offered (a quarter hour on), another length, another kind
  for (const x of [{ start: inv.start + Q, stop: inv.stop + Q }, { start: inv.start, stop: inv.stop + Q }, { start: o1[0], stop: o1[1], kind: "meet" }]) {
    const r = await api(mira, "POST", "time-offer", { id: inv.id, kind: "call", tz: "Europe/London", with: george.id, role: "answered", ...x });
    assert.equal(r.status, 200, "Mira's own row is hers to keep");
    assert.deepEqual(timeRow(george, inv.id), was, `still pending (${JSON.stringify(x)})`);
    run("DELETE FROM td_times WHERE user_id = ?", mira.id);
  }
  // Pat, George's friend too, answering George's invite to Mira with its own time: George's row isn't Pat's to answer
  assert.equal((await api(pat, "POST", "time-offer", { id: inv.id, kind: "call", start: inv.start, stop: inv.stop, tz: "Europe/London", with: george.id, role: "answered" })).status, 200);
  assert.deepEqual(timeRow(george, inv.id), was, "an answer from someone else: still pending");
  // and a stranger can't answer at all
  assert.equal((await api(zed, "POST", "time-offer", { id: inv.id, kind: "call", start: inv.start, stop: inv.stop, tz: "Europe/London", with: george.id, role: "answered" })).status, 403);
  assert.deepEqual(timeRow(george, inv.id), was);
  // promoteTime itself: only that friend, only an offered time, never once it's begun, nothing on bad input
  const t = Date.now();
  assert.equal(await promoteTime(env, george.id, inv.id, pat.id, inv.start, inv.stop, { t }), false, "another friend");
  assert.equal(await promoteTime(env, george.id, inv.id, mira.id, inv.start, inv.stop, { t: inv.start }), false, "once its time has begun");
  assert.equal(await promoteTime(env, george.id, "nope", mira.id, inv.start, inv.stop, { t }), false, "not an id");
  assert.equal(await promoteTime(env, george.id, inv.id, mira.id, inv.start, inv.stop + 7, { t }), false, "not a time");
  await assert.rejects(() => promoteTime(env, george.id, inv.id, mira.id, inv.start, inv.stop), TypeError, "the route's time, always");
  assert.deepEqual(timeRow(george, inv.id), was);
  assert.equal(await promoteTime(env, george.id, inv.id.toUpperCase(), mira.id, o1[0], o1[1], { t, kind: "call" }), true, "the friend, at another time offered");
  assert.equal(timeRow(george, inv.id).state, "yes");
  run("DELETE FROM td_times");
});

test("time-offer: an invite from an older Chat (no pending row): the inviter's later asked call makes it agreed; addTime's own checks; 20 invites waiting at most", async () => {
  clearLimits();
  const inv = call();
  // (an older Chat sent the invite, so no pending row; Mira's newer Chat says Yes: her own row, nothing of George's)
  await api(mira, "POST", "time-offer", { ...inv, with: george.id, role: "answered" });
  assert.equal(timeRow(george, inv.id), undefined);
  await api(george, "POST", "time-offer", { ...inv, with: mira.id, role: "asked" });
  assert.equal(timeRow(george, inv.id).state, "yes", "George's own phone, drawing the Yes");
  // a backstop against a pending row of George's for another friend changes nothing
  const other = call();
  await api(george, "POST", "time-offer", { ...other, with: pat.id, role: "asked", state: "pending" });
  await api(george, "POST", "time-offer", { ...other, with: mira.id, role: "asked" });
  assert.equal(timeRow(george, other.id).state, "pending"); assert.equal(timeRow(george, other.id).with_id, pat.id);
  // addTime called directly still checks what it's given, and needs the route's time
  await assert.rejects(() => addTime(env, george, { ...call(), withId: mira.id, who: "Mira", role: "asked" }), TypeError);
  await assert.rejects(() => addTime(env, george, { ...call(), withId: george.id, who: "George", role: "asked" }, { t: Date.now() }), (e) => e.status === 400, "never with yourself");
  await assert.rejects(() => addTime(env, george, { ...call(), withId: mira.id, who: "", role: "asked" }, { t: Date.now() }), (e) => e.status === 400, "a name");
  // a pending invite whose own time has passed but whose other time hasn't: kept (until that one ends)
  const late = call({ start: Math.floor(Date.now() / Q) * Q - Q, stop: Math.floor(Date.now() / Q) * Q + Q });
  assert.equal((await api(george, "POST", "time-offer", { ...late, with: mira.id, role: "asked", state: "pending", opts: [[at(1), at(1) + 30 * MIN], [at(-2), at(-2) + 30 * MIN]] })).status, 200);
  assert.deepEqual(JSON.parse(timeRow(george, late.id).opts), [[at(1), at(1) + 30 * MIN]], "the other time already past left out");
  assert.equal((await api(george, "POST", "time-offer", { ...call({ start: at(-3), stop: at(-3) + 30 * MIN }), with: mira.id, role: "asked", state: "pending", opts: [[at(-2), at(-2) + 30 * MIN]] })).status, 409, "every time it offered past");
  // 20 waiting for an answer at most
  run("DELETE FROM td_times"); clearLimits();
  for (let i = 0; i < 20; i++) assert.equal((await api(george, "POST", "time-offer", { ...call(), with: mira.id, role: "asked", state: "pending" })).status, 200);
  clearLimits();
  const full = await api(george, "POST", "time-offer", { ...call(), with: mira.id, role: "asked", state: "pending" });
  assert.deepEqual([full.status, full.body.error], [409, "Chat has 20 invites waiting for an answer already."]);
  assert.equal((await api(george, "POST", "time-offer", { ...call(), with: mira.id, role: "asked" })).status, 200, "an agreed one still fits");
  // past rows are cleared as the next is written
  run("UPDATE td_times SET until = ? WHERE user_id = ?", Date.now() - 1000, george.id);
  await api(george, "POST", "time-offer", { ...call(), with: mira.id, role: "asked" });
  assert.equal(all("SELECT * FROM td_times WHERE user_id = ?", george.id).length, 1);
  run("DELETE FROM td_times"); clearLimits();
});

test("time-offer: the inviter's own later call (the backstop) agrees a pending row only at a time it offered, of the same kind", async () => {
  clearLimits();
  const inv = call({ start: at(4), stop: at(4) + 30 * MIN }), o1 = [at(6), at(6) + 30 * MIN];
  await api(george, "POST", "time-offer", { ...inv, with: mira.id, role: "asked", state: "pending", opts: [o1] });
  const was = timeRow(george, inv.id);
  for (const [x, why] of [[{ kind: "meet", start: at(9), stop: at(9) + 4 * H }, "a 4-hour meeting at a time nobody offered"], [{ start: at(9), stop: at(9) + 30 * MIN }, "a time not offered"],
    [{ kind: "meet" }, "another kind"], [{ start: o1[0], stop: o1[1], kind: "meet" }, "another kind at another time offered"], [{ stop: inv.stop + Q }, "another length"]]) {
    assert.equal((await api(george, "POST", "time-offer", { ...inv, with: mira.id, role: "asked", ...x })).status, 200, why);
    assert.deepEqual(timeRow(george, inv.id), was, `still pending: ${why}`);
  }
  // at the other time it offered, as a call: agreed there
  assert.equal((await api(george, "POST", "time-offer", { ...inv, start: o1[0], stop: o1[1], with: mira.id, role: "asked" })).status, 200);
  const g = timeRow(george, inv.id);
  assert.deepEqual([g.state, g.kind, g.start, g.stop, g.opts, g.until], ["yes", "call", o1[0], o1[1], null, o1[1] + 12 * H]);
  run("DELETE FROM td_times");
});

test("time-offer: a Yes that comes before the inviter's pending row (the inviter's phone offline as the invite went) agrees that row as it comes, at the time chosen", async () => {
  clearLimits();
  const inv = call({ start: at(2), stop: at(2) + 30 * MIN }), o1 = [at(5), at(5) + 30 * MIN];
  // Mira's Yes first, at the other time George's invite offers: her own row, nothing of George's yet
  assert.equal((await api(mira, "POST", "time-offer", { id: inv.id, kind: "call", start: o1[0], stop: o1[1], tz: "Europe/Paris", with: george.id, role: "answered" })).status, 200);
  assert.equal(timeRow(george, inv.id), undefined);
  // then George's pending row, late: agreed at once, in the batch that writes it
  batches.length = 0;
  const r = await api(george, "POST", "time-offer", { ...inv, with: mira.id, role: "asked", state: "pending", opts: [o1] });
  assert.deepEqual([r.status, r.body], [200, { ok: true }]);
  const g = timeRow(george, inv.id);
  assert.deepEqual([g.state, g.start, g.stop, g.until, g.opts, g.role, g.with_id, g.who], ["yes", o1[0], o1[1], o1[1] + 12 * H, null, "asked", mira.id, "Mira"]);
  assert.ok(batches.some((b) => b.some((q) => /^\s*INSERT INTO td_times/.test(q)) && b.some((q) => /^\s*WITH a AS/.test(q))), "in one batch with the pending row's own write");
  assert.deepEqual((await api(george, "GET", "sync")).body.times, [{ id: inv.id, with: mira.id, kind: "call", start: o1[0], stop: o1[1] }]);
  run("DELETE FROM td_times");
  // not where her Yes is at a time the invite doesn't offer, or of another kind
  for (const [x, why] of [[{ start: at(2) + Q, stop: at(2) + Q + 30 * MIN }, "a time not offered"], [{ kind: "meet" }, "another kind"]]) {
    const i = call({ start: at(2), stop: at(2) + 30 * MIN });
    await api(mira, "POST", "time-offer", { id: i.id, kind: "call", start: i.start, stop: i.stop, tz: "Europe/Paris", with: george.id, role: "answered", ...x });
    await api(george, "POST", "time-offer", { ...i, with: mira.id, role: "asked", state: "pending" });
    assert.equal(timeRow(george, i.id).state, "pending", why);
  }
  // nor from another friend's answer under the invite's id (Pat's, to George's invite to Mira)
  const i3 = call();
  await api(pat, "POST", "time-offer", { id: i3.id, kind: "call", start: i3.start, stop: i3.stop, tz: "Europe/London", with: george.id, role: "answered" });
  await api(george, "POST", "time-offer", { ...i3, with: mira.id, role: "asked", state: "pending" });
  assert.equal(timeRow(george, i3.id).state, "pending", "another friend's answer");
  // nor where her answered time has begun already (put straight in: the API wouldn't take it)
  const i4 = call(), begun = Math.floor(Date.now() / Q) * Q;
  put("td_times", { user_id: mira.id, id: i4.id, kind: "call", start: begun, stop: begun + 30 * MIN, tz: "Europe/Paris", with_id: george.id, who: "George", role: "answered", state: "yes", made: 0, until: begun + 13 * H });
  await api(george, "POST", "time-offer", { ...i4, with: mira.id, role: "asked", state: "pending", opts: [[begun, begun + 30 * MIN]] });
  assert.equal(timeRow(george, i4.id).state, "pending", "a time that's begun");
  run("DELETE FROM td_times");
});

// ================================ fit-offer ================================
const HOUR_AT = (h) => Math.ceil(Date.now() / H) * H + h * H;
const ride = (x = {}) => ({ id: crypto.randomUUID(), start: HOUR_AT(24), stop: HOUR_AT(26), tz: "Europe/London", sport: "ride", wid: "free-ride", name: "Ride how you like", secs: 7200, far: false, dry: true, ...x });
const offerRow = (user, id) => one("SELECT * FROM fx_offers WHERE user_id = ? AND id = ?", user.id, id);

test("fit-offer: the inviter's pending row becomes a plan to add at the time the friend chose, with the inviter's phone shut; offerSoon's later call adds no second", async () => {
  clearLimits();
  const inv = ride(), other = [HOUR_AT(48), HOUR_AT(50)];
  const r = await api(george, "POST", "fit-offer", { ...inv, who: "Mira", role: "asked", with: mira.id, state: "pending", opts: [other] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const p = offerRow(george, inv.id);
  assert.deepEqual([p.state, p.with_id, JSON.parse(p.opts), p.until], ["pending", mira.id, [other], other[1]]);
  assert.deepEqual(await offersFor(env, george.id), [], "a pending row is never shown in Fitness");
  assert.deepEqual((await api(george, "GET", "sync")).body.rides, [], "nor in sync's rides");
  // Mira's Yes, at the other time, from her phone alone
  const mark = calls.length, answer = crypto.randomUUID();
  const yes = await api(mira, "POST", "fit-offer", { ...inv, id: answer, start: other[0], stop: other[1], who: "George", role: "answered", with: george.id, re: inv.id.toUpperCase() });
  assert.equal(yes.status, 200, JSON.stringify(yes.body)); assert.deepEqual(yes.body, { ok: true });
  assert.ok(calls.slice(mark).every((c) => c.who === mira.id), "nothing from George's phone since the invite");
  const g = offerRow(george, inv.id), m = offerRow(mira, answer);
  assert.deepEqual([g.state, g.start, g.stop, g.opts, g.with_id, g.who, g.role], ["new", other[0], other[1], null, mira.id, "Mira", "asked"], "George's: a plan to add, at Mira's time");
  assert.deepEqual([m.state, m.with_id, m.role, m.start], ["new", george.id, "answered", other[0]], "Mira's own, with George's id");
  assert.deepEqual((await offersFor(env, george.id)).map((o) => [o.id, o.state, o.start]), [[inv.id, "new", other[0]]], "in George's Fitness to add");
  // offerSoon later, on George's phone, as an older Chat sends it (the answer letter's id, no friend's id): no second row
  const before = all("SELECT * FROM fx_offers WHERE user_id = ?", george.id).length;
  assert.equal((await api(george, "POST", "fit-offer", { ...inv, id: answer, start: other[0], stop: other[1], who: "Mira", role: "asked" })).status, 200);
  assert.equal((await api(george, "POST", "fit-offer", { ...inv, id: crypto.randomUUID(), start: other[0], stop: other[1], who: "Mira", role: "asked", with: mira.id, re: inv.id })).status, 200, "nor as a newer one does");
  assert.equal(all("SELECT * FROM fx_offers WHERE user_id = ?", george.id).length, before, "the same ride with the same friend isn't added again");
  // sync's rides: each side's, with the friend's id
  assert.deepEqual((await api(george, "GET", "sync")).body.rides, [{ id: inv.id, with: mira.id, start: other[0], stop: other[1], sport: "ride", state: "new" }]);
  assert.deepEqual((await api(mira, "GET", "sync")).body.rides, [{ id: answer, with: george.id, start: other[0], stop: other[1], sport: "ride", state: "new" }]);
  run("DELETE FROM fx_offers");
});

test("fit-offer: a friend's id only for a friend; a time not offered, or a Yes from anyone else, leaves the pending row; the raw body's own fields ignored", async () => {
  clearLimits();
  // a non-friend's with: the plan kept as an older Chat's is, with no friend's id; a pending one not at all
  const a = ride();
  assert.equal((await api(george, "POST", "fit-offer", { ...a, who: "Zed", role: "answered", with: zed.id })).status, 200);
  assert.equal(offerRow(george, a.id).with_id, null, "a non-friend: no with_id");
  const b = ride({ start: HOUR_AT(30), stop: HOUR_AT(32) });
  assert.equal((await api(george, "POST", "fit-offer", { ...b, who: "Ivy", role: "answered", with: ivy.id })).status, 200);
  assert.equal(offerRow(george, b.id).with_id, null, "asked, not yet a friend: no with_id");
  const c = ride({ start: HOUR_AT(34), stop: HOUR_AT(36) });
  assert.equal((await api(george, "POST", "fit-offer", { ...c, who: "Zed", role: "asked", with: zed.id, state: "pending" })).status, 403, "an invite's row is for a friend's answer");
  assert.equal(offerRow(george, c.id), undefined);
  assert.equal((await api(george, "POST", "fit-offer", { ...c, who: "Mira", role: "asked", state: "pending" })).status, 403, "or for no one's");
  assert.equal(offerRow(george, c.id), undefined);
  // the body's own withId, or a friend's id too long: never stored unchecked
  const d = ride({ start: HOUR_AT(38), stop: HOUR_AT(40) });
  assert.equal((await api(george, "POST", "fit-offer", { ...d, who: "Mira", role: "answered", withId: zed.id })).status, 200);
  assert.equal(offerRow(george, d.id).with_id, null, "withId from the body ignored");
  assert.equal((await api(george, "POST", "fit-offer", { ...ride(), who: "Mira", role: "answered", with: 7 })).status, 400);
  assert.equal((await api(george, "POST", "fit-offer", { ...ride(), who: "Mira", role: "answered", with: mira.id, re: "not-an-id" })).status, 400);
  // the friend checked, with no who sent: their first name
  const e = ride({ start: HOUR_AT(42), stop: HOUR_AT(44) });
  assert.equal((await api(george, "POST", "fit-offer", { ...e, role: "answered", with: mira.id })).status, 200);
  assert.deepEqual([offerRow(george, e.id).who, offerRow(george, e.id).with_id], ["Mira", mira.id]);
  run("DELETE FROM fx_offers");

  const inv = ride(), opt = [HOUR_AT(48), HOUR_AT(50)];
  await api(george, "POST", "fit-offer", { ...inv, who: "Mira", role: "asked", with: mira.id, state: "pending", opts: [opt] });
  const was = offerRow(george, inv.id);
  const answer = (who, x) => api(who, "POST", "fit-offer", { ...inv, id: crypto.randomUUID(), who: "George", role: "answered", with: george.id, re: inv.id, ...x });
  assert.equal((await answer(mira, { start: HOUR_AT(25), stop: HOUR_AT(27) })).status, 200, "Mira's own plan, at a time George didn't offer");
  assert.deepEqual(offerRow(george, inv.id), was, "a time not offered: still pending");
  assert.equal((await answer(pat, { start: opt[0], stop: opt[1] })).status, 200);
  assert.deepEqual(offerRow(george, inv.id), was, "Pat's Yes to George's invite to Mira: still pending");
  assert.equal((await answer(mira, { start: opt[0], stop: opt[1], re: undefined })).status, 200);
  assert.deepEqual(offerRow(george, inv.id), was, "a Yes without the invite's id: still pending");
  // Mira's Fitness full (20 waiting): her own plan refused, George's still made
  for (let i = 0; i < 20; i++) put("fx_offers", { user_id: mira.id, id: crypto.randomUUID(), start: HOUR_AT(60 + 3 * i), stop: HOUR_AT(62 + 3 * i), tz: "Europe/London", sport: "ride", wid: "free-ride", name: "Ride", secs: 7200, who: "Pat", role: "asked", state: "new", made: 0, until: HOUR_AT(200) });
  const full = await answer(mira, { start: opt[0], stop: opt[1] });
  assert.equal(full.status, 409, JSON.stringify(full.body));
  assert.deepEqual([offerRow(george, inv.id).state, offerRow(george, inv.id).start], ["new", opt[0]], "George's plan made all the same");
  run("DELETE FROM fx_offers");
});

test("fit-offer: a Yes that comes before the inviter's pending row makes it a plan to add as it comes, at the time chosen; the friend's first name as the server has it", async () => {
  clearLimits();
  const inv = ride(), other = [HOUR_AT(48), HOUR_AT(50)], answer = crypto.randomUUID();
  // Mira's Yes first (from a newer Chat: with George's id and the invite's), at the other time his invite offers
  assert.equal((await api(mira, "POST", "fit-offer", { ...inv, id: answer, start: other[0], stop: other[1], role: "answered", with: george.id, re: inv.id })).status, 200);
  assert.equal(offerRow(george, inv.id), undefined, "nothing of George's yet");
  // then George's pending row, late (and whatever who his Chat sends, his friend's first name as the server has it)
  assert.equal((await api(george, "POST", "fit-offer", { ...inv, who: "Mimi", role: "asked", with: mira.id, state: "pending", opts: [other] })).status, 200);
  const g = offerRow(george, inv.id);
  assert.deepEqual([g.state, g.start, g.stop, g.opts, g.with_id, g.who, g.role], ["new", other[0], other[1], null, mira.id, "Mira", "asked"], "a plan to add, at Mira's time");
  assert.deepEqual((await offersFor(env, george.id)).map((o) => [o.id, o.state, o.start]), [[inv.id, "new", other[0]]], "in George's Fitness");
  // an older Chat on George's phone drawing the Yes later (no with; Chat's own first name): the same ride, no second
  await api(george, "POST", "fit-offer", { ...inv, id: answer, start: other[0], stop: other[1], who: "Mira", role: "asked" });
  assert.equal(all("SELECT * FROM fx_offers WHERE user_id = ?", george.id).length, 1);
  run("DELETE FROM fx_offers");
  // not where her Yes is at a time the invite doesn't offer, nor from another friend's answer, nor from an older Chat's
  // Yes (no with: Mira's plan isn't known to be with George)
  const i2 = ride();
  await api(mira, "POST", "fit-offer", { ...i2, id: crypto.randomUUID(), start: HOUR_AT(25), stop: HOUR_AT(27), role: "answered", with: george.id, re: i2.id });
  await api(pat, "POST", "fit-offer", { ...i2, id: crypto.randomUUID(), role: "answered", with: george.id, re: i2.id });
  await api(mira, "POST", "fit-offer", { ...i2, id: crypto.randomUUID(), who: "George", role: "answered" });
  await api(george, "POST", "fit-offer", { ...i2, role: "asked", with: mira.id, state: "pending" });
  assert.equal(offerRow(george, i2.id).state, "pending");
  // with no friend checked, who as the Chat sent it
  const n = ride({ start: HOUR_AT(52), stop: HOUR_AT(54) });
  await api(george, "POST", "fit-offer", { ...n, who: "Mimi", role: "answered" });
  assert.equal(offerRow(george, n.id).who, "Mimi");
  run("DELETE FROM fx_offers");
});

// ================================ sync ================================
test("sync: times (agreed only, to come), rides (with a friend, new or agreed, to come), read in sync's own trip", async () => {
  clearLimits();
  const t = Date.now(), base = { kind: "call", tz: "Europe/London", who: "Mira", role: "asked", made: 0 };
  const row = (id, start, stop, state, x = {}) => put("td_times", { user_id: george.id, id, start, stop, state, with_id: mira.id, until: stop + 12 * H, ...base, ...x });
  const [y1, y2, pend, past, theirs] = Array.from({ length: 5 }, () => crypto.randomUUID());
  row(y1, at(5), at(5) + 30 * MIN, "yes"); row(y2, at(2), at(2) + H, "yes", { kind: "meet", with_id: pat.id, who: "Pat" });
  row(pend, at(1), at(1) + 30 * MIN, "pending", { until: at(1) + 30 * MIN });
  row(past, at(-3), at(-3) + 30 * MIN, "yes");
  put("td_times", { user_id: mira.id, id: theirs, start: at(1), stop: at(1) + Q, state: "yes", with_id: george.id, until: at(1) + 13 * H, ...base, who: "George" });
  const o = (id, start, x = {}) => put("fx_offers", { user_id: george.id, id, start, stop: start + 2 * H, tz: "Europe/London", sport: "ride", wid: "free-ride", name: "Ride", secs: 7200,
    who: "Mira", role: "asked", state: "new", made: 0, until: start + 14 * H, with_id: mira.id, ...x });
  const [r1, r2, rNo, rNone, rPend, rPast, rToday] = Array.from({ length: 7 }, () => crypto.randomUUID());
  await offersFor(env, george.id);   // (Fitness's offers table made, with its columns)
  o(r1, HOUR_AT(30)); o(r2, HOUR_AT(20), { state: "yes", sport: "run", role: "answered", with_id: pat.id, who: "Pat" });
  o(rNo, HOUR_AT(22), { state: "no" }); o(rNone, HOUR_AT(24), { with_id: null }); o(rPend, HOUR_AT(26), { state: "pending" });
  o(rPast, t - 5 * H); o(rToday, HOUR_AT(28), { role: "today", who: "", with_id: null, state: "yes" });
  batches.length = 0;
  const s = await api(george, "GET", "sync");
  assert.equal(s.status, 200);
  assert.deepEqual(s.body.times, [
    { id: y2, with: pat.id, kind: "meet", start: at(2), stop: at(2) + H },
    { id: y1, with: mira.id, kind: "call", start: at(5), stop: at(5) + 30 * MIN }], "agreed only, to come, soonest first, ids and times only");
  assert.deepEqual(s.body.rides, [
    { id: r2, with: pat.id, start: HOUR_AT(20), stop: HOUR_AT(22), sport: "run", state: "yes" },
    { id: r1, with: mira.id, start: HOUR_AT(30), stop: HOUR_AT(32), sport: "ride", state: "new" }], "with a friend, new or agreed, to come; never pending, said no, past or Today's own");
  assert.equal(s.body.hold, null, "nothing holding George's notifications");
  // (one trip: Chat's batch reads them too)
  const main = batches.find((b) => b.some((q) => /FROM pg_links WHERE a = \?1 OR b = \?1/.test(q)));
  assert.ok(main && main.some((q) => /FROM td_times/.test(q)) && main.some((q) => /FROM fx_offers/.test(q)), "times and rides read in sync's own batch");
  for (const x of [...s.body.times, ...s.body.rides]) assert.ok(!("who" in x) && !("tz" in x) && !("name" in x), "no name, zone or workout");
  run("DELETE FROM td_times"); run("DELETE FROM fx_offers");
});

test("sync?quiet=1 (Today's engine): what's delivered marked so, but pg_users.seen_at left alone", async () => {
  clearLimits();
  const msg = (id) => put("pg_msgs", { id, sender: mira.id, recipient: george.id, ct: "sealed", km: 0, sent_at: Date.now() - 60e3, deliver_at: Date.now() - 1000, instant: 1 });
  const m1 = crypto.randomUUID();
  msg(m1);
  run("UPDATE pg_users SET seen_at = 0 WHERE id = ?", george.id);
  const q = await api(george, "GET", "sync?quiet=1");
  assert.equal(q.status, 200, JSON.stringify(q.body));
  assert.equal(one("SELECT seen_at FROM pg_users WHERE id = ?", george.id).seen_at, 0, "not shown to friends as just seen");
  assert.ok(one("SELECT got_at FROM pg_msgs WHERE id = ?", m1).got_at > 0, "Mira's message marked delivered all the same");
  assert.ok(Array.isArray(q.body.times) && Array.isArray(q.body.rides) && "hold" in q.body && Array.isArray(q.body.friends), "the whole answer");
  // any other value is an ordinary sync
  await api(george, "GET", "sync?quiet=0");
  assert.ok(one("SELECT seen_at FROM pg_users WHERE id = ?", george.id).seen_at > 0, "an ordinary sync notes it");
  run("DELETE FROM pg_msgs");
});

test("sync: were its Today First reads ever to fail as the batch runs (a column gone), the rest is answered all the same, times and rides none, what's delivered still marked", async () => {
  clearLimits();
  await offersFor(env, george.id);   // (Fitness's offers table made, with its columns)
  const m1 = crypto.randomUUID(), y = crypto.randomUUID();
  put("pg_msgs", { id: m1, sender: mira.id, recipient: george.id, ct: "sealed", km: 0, sent_at: Date.now() - 60e3, deliver_at: Date.now() - 1000, instant: 1 });
  put("td_times", { user_id: george.id, id: y, kind: "call", start: at(5), stop: at(5) + 30 * MIN, tz: "Europe/London", with_id: mira.id, who: "Mira", role: "asked", state: "yes", made: 0, until: at(5) + 13 * H });
  run("DELETE FROM pg_errors");
  // (fx_offers.with_id gone after its setup ran: an ALTER that failed unseen, say)
  run("ALTER TABLE fx_offers DROP COLUMN with_id");
  let s;
  try { batches.length = 0; s = await api(george, "GET", "sync"); }
  finally { run("ALTER TABLE fx_offers ADD COLUMN with_id TEXT"); }
  assert.equal(s.status, 200, JSON.stringify(s.body));
  assert.deepEqual([s.body.times, s.body.rides], [[], []]);
  assert.ok(s.body.friends.some((f) => f.id === mira.id) && "hold" in s.body, "the rest of Chat's answer");
  assert.ok(one("SELECT got_at FROM pg_msgs WHERE id = ?", m1).got_at > 0, "Mira's message marked delivered all the same");
  assert.ok(one("SELECT 1 FROM pg_errors WHERE src = 'sync plans'"), "the error noted for the admin");
  assert.equal(batches.filter((b) => b.some((q) => /FROM pg_links WHERE a = \?1 OR b = \?1/.test(q))).length, 2, "asked again without them, once");
  // with the column back, as before: in the one batch
  batches.length = 0;
  assert.deepEqual((await api(george, "GET", "sync")).body.times.map((x) => x.id), [y]);
  assert.equal(batches.filter((b) => b.some((q) => /FROM pg_links WHERE a = \?1 OR b = \?1/.test(q))).length, 1);
  run("DELETE FROM pg_msgs"); run("DELETE FROM td_times");
});

test("sync's hold: quiet hours, with when they end (a zone off the hour too); none when they're off", async () => {
  clearLimits();
  const t = Date.now(), h = new Date(t).getUTCHours();
  // quiet hours now (UTC), and no ride: until they end, on the hour
  run("UPDATE pg_users SET notify_prefs = ? WHERE id = ?", JSON.stringify({ quiet: true, quietFrom: h, quietTo: (h + 2) % 24, tz: "UTC" }), pat.id);
  assert.deepEqual((await api(pat, "GET", "sync")).body.hold, { why: "quiet", until: Math.floor(t / H) * H + 2 * H });
  // a zone half an hour off UTC: still the first quarter hour that isn't quiet
  const lh = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "numeric", hourCycle: "h23" }).format(t));
  const p = prefsOf({ notify_prefs: JSON.stringify({ quiet: true, quietFrom: lh, quietTo: (lh + 1) % 24, tz: "Asia/Kolkata" }) });
  run("UPDATE pg_users SET notify_prefs = ? WHERE id = ?", JSON.stringify(p), pat.id);
  const k = (await api(pat, "GET", "sync")).body.hold;
  assert.equal(k.why, "quiet");
  assert.ok(k.until > Date.now() - 5000 && k.until <= t + H && k.until % Q === 0 && !isQuiet(p, k.until) && isQuiet(p, k.until - Q), JSON.stringify(k));
  // quiet hours off: no hold
  run("UPDATE pg_users SET notify_prefs = ? WHERE id = ?", JSON.stringify({ quiet: false }), pat.id);
  assert.equal((await api(pat, "GET", "sync")).body.hold, null);
});

test("holdOf: a ride holds friends' messages at its do level alone, until it ends; else quiet hours; else nothing", () => {
  const t = Date.UTC(2026, 10, 3, 9, 7), off = prefsOf({ notify_prefs: JSON.stringify({ quiet: false }) });
  const on = prefsOf({ notify_prefs: JSON.stringify({ quiet: true, quietFrom: 9, quietTo: 11, tz: "UTC" }) }), quiet = { why: "quiet", until: Date.UTC(2026, 10, 3, 11, 0) };
  const busy = (level, until = t + 2 * H) => ({ until, level, rideStart: t - 5 * MIN });
  assert.deepEqual(holdOf(busy("do"), off, t), { why: "ride", until: t + 2 * H }, "do: friends held, until the ride's cap");
  assert.deepEqual(holdOf(busy("do"), on, t), { why: "ride", until: t + 2 * H }, "the ride first, in quiet hours too");
  assert.equal(holdOf(busy("suggest"), off, t), null, "suggest: apps' notifications only, not friends'");
  assert.equal(holdOf(busy("quiet"), off, t), null, "quiet: nothing held");
  assert.deepEqual(holdOf(busy("suggest"), on, t), quiet, "suggest, in quiet hours: those");
  assert.deepEqual(holdOf(busy("quiet"), on, t), quiet, "quiet, in quiet hours: those");
  assert.equal(holdOf(busy("do", t), off, t), null, "a hold that's ended");
  assert.equal(holdOf(busy(undefined), off, t), null, "no level (busyNow always gives one): not held");
  assert.equal(holdOf(null, off, t), null);
  assert.deepEqual(holdOf(null, on, t), quiet);
  // (batch N's functions/_busy.js, once merged, has the rule as holdsFor(busy, "friends"): the two agree)
  if (typeof busyMod.holdsFor === "function") for (const level of ["do", "suggest", "quiet"]) assert.equal(holdOf(busy(level), off, t) !== null, busyMod.holdsFor(busy(level), "friends"), level);
});

test("sync's hold, a ride set in Fitness: friends held at do (no rule, or do), until its cap; at suggest or quiet, quiet hours or nothing", async () => {
  clearLimits();
  // (B0's functions/_busy.js is a stub: nobody is ever busy. Batch N's, once merged, has holdsFor beside busyNow, and holds)
  const t = Date.now(), real = typeof busyMod.holdsFor === "function";
  const s5 = Math.floor((t - 5 * MIN) / (5 * MIN)) * 5 * MIN, day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(s5));
  await setTime(env, pat.id, { day, start: s5, stop: s5 + 2 * H, tz: "Europe/London", source: "set" }, { t });
  await tddb(env);   // (Today's rules table made, as Today makes it)
  const h = new Date(t).getUTCHours(), off = JSON.stringify({ quiet: false }), quietNow = JSON.stringify({ quiet: true, quietFrom: h, quietTo: (h + 2) % 24, tz: "UTC" });
  // the ride's cap: its start and the longer of 2 hours and its length and half an hour; quiet hours: on the hour they end
  const ride = { why: "ride", until: s5 + 2 * H + 30 * MIN }, quiet = { why: "quiet", until: Math.floor(t / H) * H + 2 * H };
  const level = (l) => (l == null ? run("DELETE FROM td_rules WHERE user_id = ?", pat.id) : run("INSERT OR REPLACE INTO td_rules (user_id, rule, level) VALUES (?, 'holdRide', ?)", pat.id, l));
  for (const [l, prefs, want, why] of [
    [null, off, real ? ride : null, "no rule (do)"],
    ["do", off, real ? ride : null, "do"],
    ["do", quietNow, real ? ride : quiet, "do, in quiet hours: the ride first"],
    ["suggest", off, null, "suggest: friends not held"],
    ["suggest", quietNow, quiet, "suggest, in quiet hours: those"],
    ["quiet", off, null, "quiet: nothing held"],
  ]) {
    level(l); run("UPDATE pg_users SET notify_prefs = ? WHERE id = ?", prefs, pat.id);
    assert.deepEqual((await api(pat, "GET", "sync")).body.hold, want, why);
  }
  run("DELETE FROM td_rules WHERE user_id = ?", pat.id); run("DELETE FROM fx_times WHERE user_id = ?", pat.id); run("UPDATE pg_users SET notify_prefs = ? WHERE id = ?", off, pat.id);
});

test("quietEnd: on the hour quiet hours end, and on the nights the clocks change", () => {
  const london = (from, to) => prefsOf({ notify_prefs: JSON.stringify({ quiet: true, quietFrom: from, quietTo: to, tz: "Europe/London" }) });
  // an ordinary night: 22:00 to 07:00, at 23:20 GMT
  assert.equal(quietEnd(london(22, 7), Date.UTC(2026, 10, 2, 23, 20)), Date.UTC(2026, 10, 3, 7, 0));
  // 29 March 2026: 01:00 GMT becomes 02:00 BST, so 00:00–02:00 ends at 01:00 UTC
  assert.equal(quietEnd(london(0, 2), Date.UTC(2026, 2, 29, 0, 30)), Date.UTC(2026, 2, 29, 1, 0));
  // 25 October 2026: 02:00 BST becomes 01:00 GMT, so 00:00–02:00 lasts three hours, ending at 02:00 UTC
  assert.equal(quietEnd(london(0, 2), Date.UTC(2026, 9, 24, 23, 30)), Date.UTC(2026, 9, 25, 2, 0));
  // a zone 45 minutes off the hour (Kathmandu, +05:45): 21:00–06:00 there ends at 00:15 UTC
  const ktm = prefsOf({ notify_prefs: JSON.stringify({ quiet: true, quietFrom: 21, quietTo: 6, tz: "Asia/Kathmandu" }) });
  assert.equal(quietEnd(ktm, Date.UTC(2026, 10, 2, 18, 0)), Date.UTC(2026, 10, 3, 0, 15));
});
