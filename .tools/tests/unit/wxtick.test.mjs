// Weather's notification tick (functions/_wxpush.js): which places it looks at, what it may ask Open-Meteo for, whose
// official warnings it asks for, and what's kept of the warnings told of (weather/alerts.js warningAlert).
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { toLook, allowance, warningsFor, claim, LEASE } from "../../../functions/_wxpush.js";
import { warningAlert } from "../../../weather/alerts.js";
import { makeFormat } from "../../../weather/format.js";

const H = 3600e3, NOON = Date.UTC(2026, 9, 20, 12);          // (noon at tz_off 0: no one's quiet hours)

test("the places a tick looks at: briefings due first, then the rest in a different order each time, so none is left out for good", () => {
  const row = (i, o = {}) => ({ id: `r${i}`, lat: 50 + i / 100, lon: 0, rain: 1, brief: 0, warn: 0, tz_off: 0, ...o });
  const subs = Array.from({ length: 400 }, (_, i) => row(i));
  // two briefings due, last in the table; rain in its quiet hours, and warnings alone (neither looked at); a place whose
  // clock isn't known yet (looked at)
  subs.push(row(400, { rain: 0, brief: 1, brief_at: "12:00" }), row(401, { rain: 0, brief: 1, brief_at: "11:30" }), row(402, { tz_off: 12 * 3600 }), row(403, { rain: 0, warn: 1 }), row(404, { rain: 0, warn: 1, tz_off: null }));
  const all = toLook(subs, NOON, Infinity).map((s) => s.id);
  assert.equal(all.length, 403); assert.ok(all.includes("r404") && !all.includes("r402") && !all.includes("r403"));
  const one = toLook(subs, NOON);
  assert.equal(one.length, 200);
  assert.deepEqual(one.slice(0, 2).map((s) => s.id).sort(), ["r400", "r401"], "the briefings due first, wherever they are in the table");
  const late = (list) => list.filter((s) => +s.id.slice(1) >= 200 && +s.id.slice(1) < 400).length;
  assert.ok(late(one) > 50, `not only the first 200 in the table (${late(one)} later ones)`);
  const seen = new Set(one);
  for (let n = 0; n < 4; n++) toLook(subs, NOON).forEach((s) => seen.add(s));
  assert.ok(late([...seen]) > 150, `within a few ticks, nearly every later one (${late([...seen])} of 200)`);
});

// A place with only warnings or panels on is looked at once a night too, as 03:00 comes there (its clock as last known:
// the first ten minutes, two ticks at most), so the forecast says its clock again: right after the clocks change in
// spring and autumn
test("the places a tick looks at: those with only warnings or panels, once a night, so their clock's kept right when it changes", () => {
  const row = (id, o) => ({ id, lat: 51.5, lon: 0, rain: 0, brief: 0, warn: 0, solar: null, ...o });
  // 03:05 there, by its clock as kept (UTC−8:55 at noon UTC); 03:30; 02:00; and noon
  const at = (off) => ({ tz_off: Math.round(off * 3600) });
  const subs = [row("warn-3", { warn: 1, ...at(-8 - 55 / 60) }), row("sun-3", { solar: "{}", ...at(-8 - 55 / 60) }), row("warn-330", { warn: 1, ...at(-8.5) }), row("warn-2", { warn: 1, ...at(-10) }),
    row("warn-12", { warn: 1, ...at(0) }), row("rain-3", { rain: 1, ...at(-8 - 55 / 60) }), row("none-3", { ...at(-8 - 55 / 60) })];
  assert.deepEqual(toLook(subs, NOON, Infinity).map((s) => s.id).sort(), ["sun-3", "warn-3"], "warnings or panels alone, at 03:05 there; not later in the hour, at 02:00 or noon, nor rain alerts alone, in their quiet hours");
});

test("Open-Meteo's allowance: all that's kept at first, then 8,000 a day between the ticks however often they come", () => {
  assert.equal(allowance(null, NOON), 500);
  assert.equal(allowance({ n: 0, at: NOON }, NOON), 0, "spent, and asked again at once: nothing");
  assert.ok(Math.abs(allowance({ n: 0, at: NOON }, NOON + 5 * 60e3) - 8000 / 288) < 1e-9, "five minutes later: a 288th of the day's");
  assert.equal(allowance({ n: 10, at: NOON }, NOON + 24 * H), 500, "never more kept than an hour and a half's");
  assert.equal(allowance({ n: 10, at: NOON + 60e3 }, NOON), 10, "a clock a little behind earns nothing");
  assert.equal(allowance({ n: "x" }, NOON), 500, "what's kept not as it should be: as at first");
  // (a tick spending all it may: what's kept, up to a tick's 55)
  const spend = (left, t) => { const have = allowance(left, t), cost = Math.floor(Math.min(have, 55)); return [cost, { n: have - cost, at: t }]; };
  // a day of ticks every two and a half minutes (the ticker's and GitHub's, and the site's traffic's), each spending all
  // it may: about 8,000 between them (and the 500 kept at first), not 55 each
  let left = null, spent = 0;
  for (let t = NOON; t < NOON + 24 * H; t += 150e3) { const [cost, now] = spend(left, t); spent += cost; left = now; }
  assert.ok(spent > 8400 && spent <= 8500, String(spent));
  // a quiet night (nothing asked since 22:00), then a morning's briefings every 5 minutes, as many as there's room for:
  // the whole of a tick's 55 for over an hour, from what the night kept, then the day's share
  left = { n: 0, at: NOON - 9 * H }; const morning = [];
  for (let t = NOON; t < NOON + 3 * H; t += 5 * 60e3) { const [cost, now] = spend(left, t); morning.push(cost); left = now; }
  assert.ok(morning.slice(0, 15).every((c) => c === 55), morning.join(" "));
  assert.ok(morning.slice(-6).every((c) => c >= 27 && c <= 28), morning.join(" "));
  const sum = morning.reduce((a, c) => a + c, 0);
  assert.ok(sum > 1450 && sum <= 1500, `about 500 and three hours' share (${sum})`);
});

test("official warnings: each place asked once, a few at a time, at most 150 a tick and only while there's time; the rest on later ticks", async () => {
  const subs = [];
  for (let i = 0; i < 300; i++) subs.push({ lat: 50 + i / 100, lon: 0, warn: 1, tz_off: 0 }, { lat: 50 + i / 100, lon: 0, warn: 1, tz_off: 3600 });   // (two phones at each place)
  subs.push({ lat: 1, lon: 1, warn: 1, tz_off: null }, { lat: 2, lon: 2, warn: 0, rain: 1, tz_off: 0 });
  let now = 0, most = 0, asked = [];
  const look = async (s) => { asked.push(`${s.lat},${s.lon}`); most = Math.max(most, ++now); await new Promise((r) => setTimeout(r, 1)); now--; if (s.lat === 9) throw new Error("down"); return [{ id: "w" }]; };
  const got = await warningsFor(subs, look, Date.now());
  assert.equal(got.size, 150); assert.equal(new Set(asked).size, asked.length, "each place once, however many phones are there");
  assert.equal(most, 6, "six at a time");
  // (a place whose feed is slow holds up only its own: the rest are asked meanwhile)
  let slow = true, meanwhile = 0;
  const lag = async () => { if (slow) { slow = false; await new Promise((r) => setTimeout(r, 40)); slow = null; return []; } if (slow === false) meanwhile++; await new Promise((r) => setTimeout(r, 1)); return []; };
  await warningsFor(subs, lag, Date.now());
  assert.ok(meanwhile > 20, `others asked while the slow one was (${meanwhile})`);
  assert.ok(!got.has("1,1") && !got.has("2,2"), "not before the place's clock is known, nor where they're not on");
  const seen = new Set(got.keys());
  for (let n = 0; n < 4; n++) (await warningsFor(subs, look, Date.now())).forEach((_, k) => seen.add(k));
  assert.ok(seen.size > 260, `within a few ticks, nearly every place (${seen.size} of 300)`);
  // (begun late in the tick, the forecasts and phones having taken their time: still ten seconds of their own)
  assert.equal((await warningsFor(subs, look, Date.now() - 21e3)).size, 150, "begun 21 seconds into the tick: still asked");
  // none begun once the tick's had its 20 seconds, or they've had their 10, if that's later (each lookup a second, by a
  // clock of the test's own)
  const real = Date.now;
  try {
    let clock = 1e6;
    Date.now = () => clock;
    const second = async () => { clock += 1000; return []; };
    assert.equal((await warningsFor(subs, second, clock)).size, 20, "begun as the tick began: 20 seconds");
    assert.equal((await warningsFor(subs, second, clock - 15e3)).size, 10, "begun 15 seconds in: 10 seconds of their own");
    assert.equal((await warningsFor(subs, second, clock - 4e3)).size, 16, "begun 4 seconds in: the rest of the tick's 20");
    // (and none begun after the tick's own end: the one the site's traffic starts, with its 30 seconds in all)
    assert.equal((await warningsFor(subs, second, clock - 15e3, 150, Math.random, clock + 6e3)).size, 6, "the tick ending 6 seconds on: 6 seconds, not 10");
  } finally { Date.now = real; }
  assert.equal((await warningsFor([{ lat: 9, lon: 0, warn: 1, tz_off: 0 }], look, Date.now())).get("9,0"), null, "not to be had: null (nothing's taken as told)");
});

test("a warning with no end time, told of: what's kept of it isn't rewritten every tick, and it's kept half a day at least once it's gone", () => {
  const f = makeFormat({}), iso = (t) => new Date(t).toISOString();
  const flood = (t) => ({ id: "ea-061FWF23Cambridge-3", level: 3, event: "Flood Warning", via: "EA", issuer: "Environment Agency", onset: iso(NOON - 24 * H), expires: null, open: true, checked: iso(t) });
  let told = warningAlert([flood(NOON)], null, NOON, NOON, f, 0, "Cambridge").told, writes = 0;
  for (let t = NOON + 5 * 60e3; t < NOON + 24 * H; t += 5 * 60e3) {
    const r = warningAlert([flood(t)], told, t, t, f, 0, "Cambridge");
    assert.equal(r.alert, null);
    assert.ok(r.told["ea-061FWF23Cambridge-3"][2] >= t + 12 * H, "kept at least half a day on");
    if (JSON.stringify(r.told) !== JSON.stringify(told)) writes++;
    told = r.told;
  }
  assert.ok(writes <= 4, `kept anew only every 6 hours, not every tick (${writes} times in a day)`);
  // no longer listed: still remembered half a day on, so it isn't told again if it's listed again
  const back = NOON + 24 * H + 11 * H;
  assert.equal(warningAlert([flood(back)], warningAlert([], told, back - H, back - H, f).told, back, back, f, 0, "Cambridge").alert, null);
});

// A notification is claimed before it's sent, so two ticks never both send it; and only while the tick's still beginning
// things, so one cut off part way (its scheduler giving up on it) hasn't claimed what it then never sends: a briefing
// whose lookups ran on past the tick's time is left for the next. A tick that dies holds its lease for less than the
// 5 minutes between the schedulers' ticks, so it never holds up the next
test("a notification claimed once, and only while the tick's still beginning things; a dead tick's lease lapses before the next", async () => {
  const sql = new DatabaseSync(":memory:");
  sql.exec("CREATE TABLE wx_subs (id TEXT PRIMARY KEY, last_brief TEXT, last_rain INTEGER)");
  sql.prepare("INSERT INTO wx_subs (id, last_brief) VALUES ('a', '2026-10-30')").run();
  const D = { prepare: (q) => ({ bind: (...b) => ({ run: async () => ({ meta: { changes: Number(sql.prepare(q).run(...b).changes) } }) }) }) };
  const row = () => sql.prepare("SELECT * FROM wx_subs WHERE id = 'a'").get(), s = { ...row() };
  assert.equal(await claim(D, s, "last_brief", "2026-10-31", Date.now() - 1), false, "the tick's time up: not claimed");
  assert.equal(row().last_brief, "2026-10-30", "and nothing written: the next tick sends it");
  assert.equal(await claim(D, s, "last_brief", "2026-10-31", Date.now() + 10e3), true, "in time: claimed");
  assert.equal(row().last_brief, "2026-10-31");
  assert.equal(await claim(D, s, "last_brief", "2026-10-31"), false, "claimed already (by another tick, from what it read before): not again");
  assert.equal(await claim(D, { id: "a" }, "last_rain", NOON), true, "nothing claimed before (null): claimed");
  assert.ok(LEASE > 60e3 && LEASE < 5 * 60e3, `the lease: longer than a tick is let run, shorter than the time between ticks (${LEASE} ms)`);
});

// ---- the whole tick, against a database of its own (Node's own SQLite in memory, standing in for D1, with the site's
// schema), with Open-Meteo, the push services and the email service stood in for ----
function d1() {
  const s = new DatabaseSync(":memory:"), after = [];
  const exec = (sql, args) => {
    const p = s.prepare(sql);
    if (p.columns().length) return { results: p.all(...args), success: true, meta: { changes: 0 } };
    const r = p.run(...args);
    return { results: [], success: true, meta: { changes: Number(r.changes) } };
  };
  const st = (sql, args = []) => ({
    bind: (...a) => st(sql, a.map((v) => (v === undefined ? null : typeof v === "boolean" ? Number(v) : v))),
    // (after: what's done once a query matching it has been answered: another's write landing between a read and a write)
    first: async (col) => { const row = s.prepare(sql).get(...args) ?? null; for (const [re, then] of after.splice(0)) if (re.test(sql)) then(s); else after.push([re, then]); return col && row ? row[col] ?? null : row; },
    all: async () => exec(sql, args), run: async () => exec(sql, args), now: () => exec(sql, args),
  });
  return { sql: s, after, prepare: (q) => st(q), async batch(list) { s.exec("BEGIN"); try { const r = list.map((x) => x.now()); s.exec("COMMIT"); return r; } catch (e) { s.exec("ROLLBACK"); throw e; } } };
}
const { db } = await import("../../../functions/_pigeon.js");
const { wxdb, wxTick, spendOm } = await import("../../../functions/_wxpush.js");
const { tddb } = await import("../../../functions/_today.js");
const { forecast } = await import("../mocks/wxappdata.mjs");
const W = "http://wx.test", MON = Date.UTC(2026, 10, 2, 7, 5);       // (07:05 on Monday 2 November, at tz_off 0)
const tickEnv = { DB: d1(), PIGEON_PUSH_URL: "http://push.test/push", WXAPP_URL: W, METEOALARM_URL: W, NWS_URL: W, EA_URL: W, RAINVIEWER_URL: W, AWC_URL: W, WARN_TTL: "0",
  RESEND_API_KEY: "test-key", RESEND_API_URL: "http://mail.test/emails", PIGEON_FROM: "noreply@georgefarrowgreen.com" };
const run = (sql, ...a) => tickEnv.DB.sql.prepare(sql).run(...a), rows = (sql, ...a) => tickEnv.DB.sql.prepare(sql).all(...a).map((r) => ({ ...r }));
let asked = { full: 0, rain: 0, push: [], mail: [] };
async function ticking(fn) {
  const real = globalThis.fetch, said = console.error;
  globalThis.fetch = async (url, o = {}) => {
    const u = String(url);
    if (u.startsWith(`${W}/v1/forecast`)) { asked[/minutely_15=/.test(u) && !/daily=/.test(u) ? "rain" : "full"]++; return Response.json(forecast(MON)); }
    if (u === tickEnv.PIGEON_PUSH_URL) { asked.push.push(o.headers["X-Endpoint"]); return new Response("", { status: 201 }); }
    if (u === tickEnv.RESEND_API_URL) { asked.mail.push(JSON.parse(o.body)); return Response.json({ id: "m" }); }
    return new Response("{}", { status: 404 });
  };
  console.error = () => {};
  try { return await fn(); } finally { globalThis.fetch = real; console.error = said; }
}
// a phone's push keys, as a browser makes them
async function keys() {
  const k = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  return { p256dh: Buffer.from(await crypto.subtle.exportKey("raw", k.publicKey)).toString("base64url"), auth: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url") };
}
await db(tickEnv); await wxdb(tickEnv); await tddb(tickEnv);
for (const id of ["today", "plain"]) {
  run("INSERT INTO pg_users (id, handle, name, email, email_ok, pub, salt, proof_hash, vault, swift, swift_at, created_at) VALUES (?1, ?1, ?1, ?1 || '@example.com', ?2, '{}', 's', 'p', 'v', 3, ?2, ?2)", id, MON - 864e5);
  run("INSERT INTO pg_sessions (hash, user_id, created_at, seen_at) VALUES (?, ?, ?, ?)", `s-${id}`, id, MON, MON);
}
// (the first account has InFlite Today's morning on, on a phone of a sign-in that still lasts)
const tk = await keys();
run("INSERT INTO td_prefs (user_id, cards, m_on, m_at, m_lines, updated) VALUES ('today', '{}', 1, 420, '{}', ?)", MON);
run("INSERT INTO td_push (endpoint, user_id, p256dh, auth, session, added) VALUES ('https://fcm.googleapis.com/fcm/send/today-phone', 'today', ?, ?, 's-today', ?)", tk.p256dh, tk.auth, MON);
// each account's Weather on a phone (and the first's by email too), its morning briefing at 07:00 in London
async function device(dev, user, mail = false) {
  const k = mail ? { p256dh: "", auth: "" } : await keys(), endpoint = mail ? dev : `https://fcm.googleapis.com/fcm/send/${dev}`;
  run("INSERT INTO wx_devs (dev, endpoint, p256dh, auth, user_id, units, brief_at, created, updated) VALUES (?, ?, ?, ?, ?, '{}', '07:00', ?, ?)", dev, endpoint, k.p256dh, k.auth, user, MON, MON);
  run(`INSERT INTO wx_subs (id, dev, endpoint, p256dh, auth, lat, lon, name, rain, brief, brief_at, units, tz_off, created, updated, warn)
    VALUES (?1, ?2, ?3, ?4, ?5, 51.51, -0.13, 'London', 0, 1, '07:00', '{}', 0, ?6, ?6, 0)`, `${dev}:51.51,-0.13`, dev, endpoint, k.p256dh, k.auth, MON);
}
const briefed = () => Object.fromEntries(rows("SELECT dev, last_brief FROM wx_subs ORDER BY dev").map((r) => [r.dev, r.last_brief]));

test("an account whose morning comes from InFlite Today: its phones' briefing isn't pushed (nor its forecast asked for), and its email still comes", async () => {
  await device("wx-today", "today");
  let r = await ticking(() => wxTick(tickEnv, MON, "https://georgefarrowgreen.com"));
  assert.equal(r.brief, 0, JSON.stringify(r));
  assert.deepEqual(asked, { full: 0, rain: 0, push: [], mail: [] }, "not even its forecast asked for: there's nothing else to say there");
  assert.deepEqual(briefed(), { "wx-today": null }, "nothing claimed: were Today's morning turned off, it would come");
  // the same account's email, and another account's phone, at the same place
  await device("mail:today", "today", true); await device("wx-plain", "plain");
  r = await ticking(() => wxTick(tickEnv, MON + 5 * 60e3, "https://georgefarrowgreen.com"));
  assert.deepEqual(asked.push, ["https://fcm.googleapis.com/fcm/send/wx-plain"], "the other account's phone has its briefing pushed; this one's doesn't");
  assert.equal(asked.mail.length, 1, "this account's briefing email still comes");
  assert.deepEqual(asked.mail[0]?.to, "today@example.com");
  assert.deepEqual(briefed(), { "mail:today": "2026-11-02", "wx-plain": "2026-11-02", "wx-today": null });
  // Today's morning turned off: its phones' briefing comes again (that day's still in time)
  run("UPDATE td_prefs SET m_on = 0 WHERE user_id = 'today'");
  asked = { full: 0, rain: 0, push: [], mail: [] };
  await ticking(() => wxTick(tickEnv, MON + 10 * 60e3, "https://georgefarrowgreen.com"));
  assert.deepEqual(asked.push, ["https://fcm.googleapis.com/fcm/send/wx-today"]);
  run("UPDATE td_prefs SET m_on = 1 WHERE user_id = 'today'");
});

test("Open-Meteo's allowance: what InFlite Today's page spends from it while a tick runs isn't written over by the tick", async () => {
  // (the next morning: the briefings due again, one whole forecast for their place, COST_FULL of the allowance)
  const TUE = MON + 864e5;
  run("INSERT OR REPLACE INTO wx_meta (k, v) VALUES ('om_bucket', ?)", JSON.stringify({ n: 300, at: TUE }));
  // Today's page charges 10 of it just after the tick's read what's left
  tickEnv.DB.after.push([/k = 'om_bucket'/, (s) => s.prepare("UPDATE wx_meta SET v = ? WHERE k = 'om_bucket'").run(JSON.stringify({ n: 290, at: TUE }))]);
  asked = { full: 0, rain: 0, push: [], mail: [] };
  await ticking(() => wxTick(tickEnv, TUE, "https://georgefarrowgreen.com"));
  assert.equal(asked.full, 1);
  assert.deepEqual(JSON.parse(rows("SELECT v FROM wx_meta WHERE k = 'om_bucket'")[0].v), { n: 290 - 7, at: TUE }, "the tick's 7 taken off what Today left, not off what the tick read");
  // and with no one else spending, as before: what it read, less what it spent
  asked = { full: 0, rain: 0, push: [], mail: [] };
  run("UPDATE wx_subs SET last_brief = NULL");
  await ticking(() => wxTick(tickEnv, TUE + 5 * 60e3, "https://georgefarrowgreen.com"));
  const left = JSON.parse(rows("SELECT v FROM wx_meta WHERE k = 'om_bucket'")[0].v);
  assert.equal(left.at, TUE + 5 * 60e3); assert.ok(Math.abs(left.n - (283 + 5 * 60e3 * 8000 / 864e5 - 7)) < 1e-9, JSON.stringify(left));
});

test("Open-Meteo's allowance kept as a compare-and-set: none kept yet, someone else's first write kept too; a lost race taken off what they left, once", async () => {
  const s = new DatabaseSync(":memory:");
  s.exec("CREATE TABLE wx_meta (k TEXT PRIMARY KEY, v TEXT)");
  const D = { prepare: (q) => ({ bind: (...b) => ({ run: async () => ({ meta: { changes: Number(s.prepare(q).run(...b).changes) } }) }), first: async () => s.prepare(q).get() ?? null }) };
  const v = () => JSON.parse(s.prepare("SELECT v FROM wx_meta WHERE k = 'om_bucket'").get().v), t = Date.UTC(2026, 10, 2, 7);
  await spendOm(D, null, 7, t);
  assert.deepEqual(v(), { n: 500 - 7, at: t }, "none kept yet: the whole of what's kept, less what's spent");
  // read as { 493 }, then someone else spent 20 of it: the tick's 7 off theirs
  const was = s.prepare("SELECT v FROM wx_meta WHERE k = 'om_bucket'").get().v;
  s.prepare("UPDATE wx_meta SET v = ? WHERE k = 'om_bucket'").run(JSON.stringify({ n: 473, at: t }));
  await spendOm(D, was, 7, t);
  assert.deepEqual(v(), { n: 466, at: t });
  // none when the tick read it, but someone else wrote first
  s.exec("DELETE FROM wx_meta");
  s.prepare("INSERT INTO wx_meta (k, v) VALUES ('om_bucket', ?)").run(JSON.stringify({ n: 200, at: t }));
  await spendOm(D, null, 7, t);
  assert.deepEqual(v(), { n: 193, at: t });
});
