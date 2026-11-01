// Fitness for InFlite Today (functions/_fittoday.js): the coming days as Fitness sends them, made safe before they're
// kept (each limit, a bad zone, too many days or steps, control characters), kept one row an account and read back, and
// gone with the account (functions/_fitness.js dropFitness). Against a database of its own (Node's own SQLite in memory,
// standing in for D1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { cleanSnapshot, setSnapshot, snapshotOf } from "../../../functions/_fittoday.js";
import { dropFitness } from "../../../functions/_fitness.js";

function d1() {
  const s = new DatabaseSync(":memory:");
  const st = (sql, args = []) => ({
    bind: (...a) => st(sql, a),
    first: async () => s.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: s.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: Number(s.prepare(sql).run(...args).changes) } }),
    now: () => (/^\s*SELECT|\bRETURNING\b/i.test(sql) ? s.prepare(sql).all(...args) : s.prepare(sql).run(...args)),
  });
  return { s, prepare: (sql) => st(sql), async batch(list) { s.exec("BEGIN"); try { const r = list.map((x) => x.now()); s.exec("COMMIT"); return r; } catch (e) { s.exec("ROLLBACK"); throw e; } } };
}

// (a week as Fitness sends it: today a session, then a rest day, the event, and nothing planned)
const session = { state: "session", id: "rh:tempo:60", sport: "ride", name: "Tempo 2 × 15", kind: "Tempo", secs: 3600, tss: 62, hard: true, why: "Fresh after Sunday’s rest: a good day for some tempo.",
  steps: [[600, 0.5, 0.75], [900, 0.88, 0.88], [300, 0.55, 0.55], [900, 0.88, 0.88], [900, 0.6, 0.45]] };
const week = () => ({ tz: "Europe/London", units: "metric", days: { "2026-11-02": structuredClone(session), "2026-11-03": { state: "rest", why: "Let it sink in" },
  "2026-11-04": { state: "event", name: "Dragon Ride" }, "2026-11-05": { state: "none" }, "2026-11-06": { state: "none" }, "2026-11-07": { state: "none" }, "2026-11-08": { state: "none" }, "2026-11-09": { state: "none" } } });
const refused = (b, why) => assert.throws(() => cleanSnapshot(b), (e) => e.status === 400 && e.message === "Bad request.", why);

test("a week as Fitness sends it is kept as it is", () => {
  assert.deepEqual(cleanSnapshot(week()), week());
  assert.deepEqual(cleanSnapshot({ ...week(), units: "imperial" }).units, "imperial");
});

test("the zone must be a real one, and the units one of the two", () => {
  for (const tz of ["Mars/Olympus", "", "+01:00", "Europe/London; drop", 42, null, "A".repeat(70)]) refused({ ...week(), tz }, `tz ${tz}`);
  for (const tz of ["America/New_York", "Asia/Kolkata", "UTC", "Etc/GMT+5"]) assert.equal(cleanSnapshot({ ...week(), tz }).tz, tz);
  for (const units of ["km", "", null, "Metric"]) refused({ ...week(), units }, `units ${units}`);
  refused(null, "nothing"); refused([], "a list"); refused({ ...week(), days: [] }, "days as a list"); refused({ ...week(), days: "x" }, "days as text");
});

test("ten days at most, each by its day; a day of any other kind left out", () => {
  const ten = week();
  ten.days["2026-11-10"] = { state: "none" }; ten.days["2026-11-11"] = { state: "none" };
  assert.equal(Object.keys(cleanSnapshot(ten).days).length, 10);
  ten.days["2026-11-12"] = { state: "none" };
  refused(ten, "eleven days");
  for (const k of ["2026-11-2", "02-11-2026", "1793577600000", "today", "2026-11-02T00:00"]) refused({ ...week(), days: { [k]: { state: "none" } } }, `key ${k}`);
  const odd = week();
  odd.days["2026-11-05"] = { state: "race" }; odd.days["2026-11-06"] = "rest"; odd.days["2026-11-07"] = null; odd.days["2026-11-08"] = { name: "no state" };
  assert.deepEqual(Object.keys(cleanSnapshot(odd).days), ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-09"]);
  // (only what each kind has: nothing else of what's sent is kept)
  const extra = week();
  Object.assign(extra.days["2026-11-03"], { secret: 1, name: "x" }); Object.assign(extra.days["2026-11-05"], { why: "x" }); extra.more = "x";
  const c = cleanSnapshot(extra);
  assert.deepEqual(c.days["2026-11-03"], { state: "rest", why: "Let it sink in" }); assert.deepEqual(c.days["2026-11-05"], { state: "none" }); assert.equal(c.more, undefined);
});

test("a session's figures kept within what a session could be, its text cut short and its control characters taken out", () => {
  const b = week(), d = b.days["2026-11-02"];
  Object.assign(d, { id: "x".repeat(90), name: `Tempo\u0000\u0007 2 × 15‮${"y".repeat(80)}`, kind: "K".repeat(40), why: `Fresh\n\tafter rest ${"z".repeat(300)}`, sport: "kayak", secs: 100000, tss: 5000, hard: "yes" });
  const c = cleanSnapshot(b).days["2026-11-02"];
  assert.equal(c.id.length, 60); assert.equal(c.name.length, 60); assert.ok(c.name.startsWith("Tempo 2 × 15y"), c.name); assert.equal(c.kind.length, 30);
  assert.equal(c.why.length, 240); assert.ok(c.why.startsWith("Freshafter rest"), c.why);
  assert.ok(![c.id, c.name, c.kind, c.why].some((v) => /[\u0000-\u001f\u007f-\u009f‪-‮]/.test(v)), "no control characters");
  assert.equal(c.sport, "ride", "a sport Fitness doesn't have: a ride"); assert.equal(c.secs, 86400); assert.equal(c.tss, 1000); assert.equal(c.hard, false, "hard only when it's true");
  Object.assign(d, { sport: "run", secs: -5, tss: "lots", hard: true });
  const c2 = cleanSnapshot(b).days["2026-11-02"];
  assert.equal(c2.sport, "run"); assert.equal(c2.secs, 0); assert.equal(c2.tss, 0); assert.equal(c2.hard, true);
  const ev = cleanSnapshot({ ...week(), days: { "2026-11-04": { state: "event", name: `Dragon\u0000 Ride ${"r".repeat(80)}` } } }).days["2026-11-04"];
  assert.equal(ev.name.length, 60); assert.ok(ev.name.startsWith("Dragon Ride"));
});

test("a session's steps: 80 at most, each [secs, from, to] within bounds and to two places; one that isn't three numbers left out", () => {
  const b = week(), d = b.days["2026-11-02"];
  d.steps = [[0, 0.5, 0.75], [100000, 7, -1], [600.4, 0.123456, 0.987654], [60, "0.5", 0.6], [60, 0.5], "x", [60, NaN, 0.5], [30, 1.005, 2]];
  assert.deepEqual(cleanSnapshot(b).days["2026-11-02"].steps, [[1, 0.5, 0.75], [86400, 5, 0], [600, 0.12, 0.99], [30, 1, 2]]);
  d.steps = Array.from({ length: 80 }, () => [60, 0.5, 0.5]);
  assert.equal(cleanSnapshot(b).days["2026-11-02"].steps.length, 80);
  d.steps = Array.from({ length: 81 }, () => [60, 0.5, 0.5]);
  refused(b, "81 steps");
  d.steps = "lots"; refused(b, "steps as text");
  delete d.steps;
  assert.deepEqual(cleanSnapshot(b).days["2026-11-02"].steps, [], "none sent: none");
});

test("the whole of it 32 KB at most", () => {
  const b = week();
  b.pad = "p".repeat(32 * 1024);
  refused(b, "over 32 KB");
  // (the most Fitness could send, eight days of 80 steps each, fits)
  const big = week();
  for (const k of Object.keys(big.days)) big.days[k] = { ...structuredClone(session), name: "N".repeat(60), why: "W".repeat(240), steps: Array.from({ length: 80 }, () => [86400, 1.25, 1.25]) };
  assert.equal(Object.keys(cleanSnapshot(big).days).length, 8);
});

test("kept one row an account, read back as it was kept; a later one takes its place; gone with the account", async () => {
  const env = { DB: d1() };
  assert.equal(await snapshotOf(env, "u1"), null, "none sent yet: none");
  const t0 = Date.now(), r = await setSnapshot(env, "u1", week());
  assert.equal(r.ok, true); assert.ok(r.at >= t0 && r.at <= Date.now());
  const s = await snapshotOf(env, "u1");
  assert.deepEqual(s, { tz: "Europe/London", units: "metric", days: week().days, at: r.at });
  // (made safe before it's kept: what's kept is what cleanSnapshot gives)
  const dirty = week();
  dirty.days["2026-11-02"].name = "Tempo\u0000 2 × 15"; dirty.days["2026-11-05"] = { state: "race" };
  await setSnapshot(env, "u2", dirty);
  const s2 = await snapshotOf(env, "u2");
  assert.equal(s2.days["2026-11-02"].name, "Tempo 2 × 15"); assert.equal(s2.days["2026-11-05"], undefined);
  await assert.rejects(setSnapshot(env, "u1", { ...week(), tz: "Nowhere/Here" }), (e) => e.status === 400);
  assert.deepEqual((await snapshotOf(env, "u1")).days, week().days, "a bad one changes nothing");
  // (a later one, from another phone, in place of the first)
  const later = { tz: "America/New_York", units: "imperial", days: { "2026-11-02": { state: "rest", why: "" } } };
  const r2 = await setSnapshot(env, "u1", later);
  assert.deepEqual(await snapshotOf(env, "u1"), { ...later, at: r2.at });
  assert.equal(env.DB.s.prepare("SELECT COUNT(*) AS n FROM fx_today WHERE user_id = 'u1'").get().n, 1, "one row an account");
  // (one kept later than one still on its way isn't overwritten by it)
  env.DB.s.prepare("UPDATE fx_today SET at = ? WHERE user_id = 'u1'").run(Date.now() + 60e3);
  await setSnapshot(env, "u1", week());
  assert.equal((await snapshotOf(env, "u1")).tz, "America/New_York", "the newer kept");
  // (the account gone: its days too, and no one else's)
  await dropFitness(env, "u1");
  assert.equal(await snapshotOf(env, "u1"), null);
  assert.ok(await snapshotOf(env, "u2"), "another account's kept");
});

test("the route: from Fitness's own page, signed in, a limit an hour, a body of 32 KB at most", () => {
  const src = readFileSync(new URL("../../../functions/api/fitness/[[path]].js", import.meta.url), "utf8");
  const route = /"POST today": async \(\{ request, env \}\) => \{([\s\S]*?)\n  \},/.exec(src)?.[1] || "";
  assert.match(route, /sameOrigin\(request\);\s*const u = await signedIn\(request, env\);\s*await limit\(env, `fxtoday:\$\{u\.id\}`, 120, 3600e3\);/);
  assert.match(route, /setSnapshot\(env, u\.id, await body\(request, 32 \* 1024\)\)/);
});

test("Fitness sends the coming days itself, as it opens and after a change, only where they've changed", () => {
  const app = readFileSync(new URL("../../../fitness/app.js", import.meta.url), "utf8"), acct = readFileSync(new URL("../../../fitness/account.js", import.meta.url), "utf8");
  assert.match(acct, /export const today = \(b\) => call\("today", \{ method: "POST", body: b \}\);/);
  // (wherever the morning's words are sent again: a change, the app opened, a new day)
  const calls = [...app.matchAll(/morningRefresh\(\);/g)].length, both = [...app.matchAll(/morningRefresh\(\);\s*todayRefresh\(\);/g)].length;
  assert.ok(calls >= 3 && both === calls, `todayRefresh beside each morningRefresh (${both} of ${calls})`);
  const snap = /function todaySnap\(\) \{([\s\S]*?)\n\}/.exec(app)?.[1] || "";
  assert.match(snap, /for \(let i = 0; i < 8; i\+\+\)/, "eight days"); assert.match(snap, /state: "none"/, "a day with nothing planned said as none");
  assert.match(snap, /try \{[\s\S]*\} catch \(e\) \{[\s\S]*return null; \}/, "worked out inside a try: nothing sent rather than Fitness stopping");
  assert.match(snap, /Number\(st\.from\) \|\| 0|two\(st\.from\)/); assert.doesNotMatch(snap, /toFixed/);
  const refresh = /function todayRefresh\(\) \{([\s\S]*?)\n\}/.exec(app)?.[1] || "";
  assert.match(refresh, /background\.done/); assert.match(refresh, /store\.get\("today-sent"/); assert.match(refresh, /3000\)/);
});

test("and again where the forecast or your nights come in behind the scenes, none of it through keep; sent only where the days have changed", async () => {
  const app = readFileSync(new URL("../../../fitness/app.js", import.meta.url), "utf8");
  // (Rhythm's own inputs from behind the scenes, one list for the two; looked at as the screen's drawn again, which the
  // forecast's answer does (today.js), as Garmin answers, and each minute)
  assert.match(app, /^const rhFrom = \(\) => \[S\.wx, S\.garmin, S\.health\];$/m); assert.match(app, /, from = rhFrom\(\);/, "rh() works the plan out again from the same list");
  assert.match(app, /^function redraw\(sheetToo = false\) \{\n  todayWatch\(\);/m, "as the screen's drawn again");
  assert.match(app, /S\.garmin = n; todayWatch\(\);/, "as Garmin answers"); assert.match(app, /newDay\(\); todayWatch\(\);/, "each minute");
  // (todayRefresh and todayWatch themselves, run against stand-ins for what they use)
  const src = [/^const rhFrom = .*$/m, /^const sigOf = .*$/m, /^function todayRefresh\(\) \{[\s\S]*?\n\}/m, /^function todayWatch\(\) \{[\s\S]*?\n\}/m].map((re) => re.exec(app)?.[0]);
  assert.ok(src.every(Boolean), "each found");
  let timer = null, days = { "2026-11-02": { state: "session", why: "Tempo" } }, on = true;
  const sent = [], kept = new Map(), S = { me: { id: "u1" }, swaps: {}, wx: null, garmin: { on: false }, health: { on: false } };
  const env = { S, background: { done: true }, rhythmOn: () => on, store: { get: (k, d) => (kept.has(k) ? kept.get(k) : d), set: (k, v) => kept.set(k, v) },
    A: { today: async (b) => { sent.push(b); return { ok: true }; } }, todaySnap: () => ({ tz: "Europe/London", units: "metric", days: structuredClone(days) }),
    dayStamp: () => "2026-11-01", TODAY: 0, setTimeout: (f, ms) => { assert.equal(ms, 3000); timer = f; return 1; }, clearTimeout: () => { timer = null; } };
  const { todayRefresh, todayWatch } = new Function(...Object.keys(env), `${src.join("\n")}\nreturn { todayRefresh, todayWatch };`)(...Object.values(env));
  const fire = async () => { const f = timer; timer = null; if (f) await f(); };
  todayWatch(); assert.equal(timer, null, "before Fitness has sent anything: nothing");
  todayRefresh(); await fire(); assert.equal(sent.length, 1, "sent as Fitness opens");
  todayWatch(); assert.equal(timer, null, "nothing new behind the scenes: nothing looked at");
  S.wx = { at: 1, d: { hours: [] } }; todayWatch(); assert.ok(timer, "the forecast come: looked at again"); await fire();
  assert.equal(sent.length, 1, "the days the same with it: nothing more sent");
  todayWatch(); assert.equal(timer, null, "nor looked at again for the same forecast");
  S.wx = { at: 2, d: { hours: [] } }; days = { "2026-11-02": { state: "session", why: "Tempo. Rain for much of the day: a good one for the trainer" } };
  todayWatch(); await fire(); assert.equal(sent.length, 2, "a wet day in it, the plan moved: sent again");
  assert.equal(sent[1].days["2026-11-02"].why, days["2026-11-02"].why);
  S.garmin = { on: true, well: [{ day: "2026-11-01" }] }; days = { "2026-11-02": { state: "rest", why: "A poor night" } };
  todayWatch(); await fire(); assert.equal(sent.length, 3, "your nights, from Garmin: sent again");
  // (the forecast come while one's waiting to go: that one goes with it, and the next look sends nothing more)
  S.health = { on: true, well: [] }; days = { "2026-11-02": { state: "rest", why: "Rest" } }; todayRefresh();
  S.wx = { at: 3, d: { hours: [] } }; await fire(); assert.equal(sent.length, 4);
  todayWatch(); await fire(); assert.equal(sent.length, 4, "the same days: nothing more");
  on = false; S.health = { on: false }; days = { "2026-11-02": { state: "event", name: "Dragon Ride" } };
  todayWatch(); assert.equal(timer, null, "an event's plan, which goes on none of them: not looked at for them");
  on = true; S.me = null; S.wx = { at: 4, d: null }; todayWatch(); assert.equal(timer, null, "signed out: nothing");
});
