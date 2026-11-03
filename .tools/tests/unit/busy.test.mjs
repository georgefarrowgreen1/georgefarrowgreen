// Holding a person's notifications while they ride (Today First, spec §8.7, functions/_busy.js), against a database of
// its own (Node's SQLite, made to look like D1): who's riding, from explicit rides only (an fx_times row, an offer added
// in Fitness or kept with a tap; never a habit ride Today added by itself, nor a plan agreed in Chat and not yet added);
// held from 10 minutes before the start until an activity (in any of the three tables) or the cap; the account's level
// (do holds friends and apps, suggest apps only, quiet nothing); the tables not made yet; the hold rule's record and
// what's waiting now. And the apps: Weather's rain and sun not sent during a ride and not told after (warnings always
// come); Markets' alert held, counted once, and told after. (Chat's own, the messages, groups and reactions held and
// told "while you rode", are in instant.test.mjs, beside the rest of Chat's notifications.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { busyMap, busyNow, heldCount, heldAdd, holdsFor, holdsAt, heldMark, HOLD_EARLY, HOLD_DONE } from "../../../functions/_busy.js";
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
const act = (table, u, start) => table === "fx_acts"
  ? run("INSERT INTO fx_acts (user_id, id, start, sport, type, size, added) VALUES (?, ?, ?, 'ride', 'fit', 1, ?)", u, crypto.randomUUID(), start, start)
  : run(`INSERT INTO ${table} (user_id, id, start, name, added) VALUES (?, ?, ?, 'Ride', ?)`, u, crypto.randomUUID(), start, start);
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

test("tables not made yet: nothing held and no failure; then each part read as it's there (try, then narrow)", async () => {
  const bare = d1();
  assert.deepEqual(await busyMap(bare, ["a"], T), new Map(), "no Fitness tables at all");
  // (ride times alone: no offers, no activities, no rules: level do)
  bare.sql.exec("CREATE TABLE fx_times (user_id TEXT NOT NULL, day TEXT NOT NULL, start INTEGER NOT NULL, stop INTEGER NOT NULL, tz TEXT NOT NULL, sport TEXT NOT NULL DEFAULT 'ride', source TEXT NOT NULL, made INTEGER NOT NULL, PRIMARY KEY (user_id, day))");
  bare.sql.prepare("INSERT INTO fx_times VALUES ('a', ?, ?, ?, 'UTC', 'ride', 'set', 0)").run(dayOf(T), T, T + H);
  assert.deepEqual((await busyMap(bare, ["a"], T)).get("a"), { until: T + 2 * H, level: "do", rideStart: T });
  // (an fx_offers from before Today First, without taken: its rows can't be told explicit, so they're left out)
  bare.sql.exec("CREATE TABLE fx_offers (user_id TEXT, id TEXT, start INTEGER, stop INTEGER, secs INTEGER, role TEXT, state TEXT)");
  bare.sql.prepare("INSERT INTO fx_offers VALUES ('b', 'o', ?, ?, 3600, 'asked', 'yes')").run(T, T + H);
  assert.deepEqual([...(await busyMap(bare, ["a", "b"], T)).keys()], ["a"]);
  // (an activity arrives, its table made just then)
  bare.sql.exec("CREATE TABLE fx_strava_new (user_id TEXT, id TEXT, start INTEGER, added INTEGER)");
  bare.sql.prepare("INSERT INTO fx_strava_new VALUES ('a', 's', ?, ?)").run(T + MIN, T + H);
  assert.equal((await busyMap(bare, ["a"], T + 2 * MIN)).get("a"), undefined, "its activity read as soon as its table's there");
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
  assert.equal(await heldCount({}, u, since), 0, "no database: nothing");
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
async function onClock(at, fn) {
  const real = globalThis.fetch, said = console.error, realNow = Date.now, from = realNow();
  Date.now = () => at + (realNow() - from);
  globalThis.fetch = async (url, o = {}) => {
    const u = new URL(String(url));
    if (String(url) === PUSH) { sent.push({ endpoint: o.headers["X-Endpoint"], body: new Uint8Array(o.body) }); return new Response("", { status: 201 }); }
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
