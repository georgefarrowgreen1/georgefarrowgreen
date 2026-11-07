// One device, every app's notifications (Today First, spec §11.3, functions/_devices.js), against a database of its own
// (Node's SQLite, made to look like D1): POST today/device without fan, or with fan but the Pages var HUB_PUSH unset,
// writes Today's td_push only; with both, Chat's pg_push (the cookie's sign-in), Markets' mk_push and Weather's
// wx_devs/wx_subs too, for one endpoint, each via 'hub', each with its own rules, and never another account's live row;
// a move takes it everywhere (Fitness's morning too), a delete only this endpoint; today/devices lists the account's other
// sign-ins with a push row in any of the five tables (Weather's by sess), by an opaque id ("InFlite on iPad" for one
// used in InFlite's window), and Stop There drops only that sign-in's rows, signing nothing out; §15.4's four rollback
// DELETEs leave every row not fanned out, and the first of them has its column wherever Chat's set up; Chat's own push
// and the hub's, on one sign-in, never take each other's; and
// Weather's ended() deletes a hub-made device whose sign-in has ended, where it only unlinks the others. And This Phone
// (the owner's report: it turned itself off): a device's Today row outlives the sign-in it was handed over with, is still
// "here" and is still listed (for Stop There) once that's ended; the account keeps its word on notifications (on, and
// Get Every App's Here) so a device handed over again, or another turned on, has every app's without the tap.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { db } from "../../../functions/_pigeon.js";
import { deviceAdd, deviceDrop, devicesList, devicesStop, otherDevices, stopDevice, ready } from "../../../functions/_devices.js";
import { deviceHash, todayDevices, tidyDevices, pushPrefs } from "../../../functions/_today.js";
import { keepPush } from "../../../functions/_markets.js";
import { tick, keepSub } from "../../../functions/_notify.js";
import { unlinkEnded, subscribe } from "../../../functions/_wxpush.js";

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

// (every push the server tries, kept: none should go when a device is fanned out, Weather's "Notifications on" included)
const PUSH = "http://push.test/push", pushed = [];
const realFetch = globalThis.fetch, said = console.error;
globalThis.fetch = async (url, o = {}) => { if (String(url) === PUSH) { pushed.push(o.headers["X-Endpoint"]); return new Response("", { status: 201 }); } return new Response("{}", { status: 404 }); };
console.error = () => {};
test.after(() => { globalThis.fetch = realFetch; console.error = said; });

const env = { DB: d1(), HUB_PUSH: "1", PIGEON_PUSH_URL: PUSH, PIGEON_SECRET: "devices-test-secret" }, off = { ...env, HUB_PUSH: undefined };
await db(env); await ready(env);
const S = env.DB.sql, run = (q, ...a) => S.prepare(q).run(...a), one = (q, ...a) => { const r = S.prepare(q).get(...a); return r ? { ...r } : null; }, all = (q, ...a) => S.prepare(q).all(...a).map((r) => ({ ...r }));
// (Fitness's morning phones, as its own setup makes them, with their sign-in)
run(`CREATE TABLE IF NOT EXISTS fx_push (endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, at INTEGER NOT NULL, tz TEXT NOT NULL,
  days TEXT NOT NULL DEFAULT '{}', sent TEXT, added INTEGER NOT NULL, session TEXT)`);

const T = Date.now();
let n = 0;
// someone, and a sign-in of theirs (label as the account's page has it; home: the app it's a Home Screen app of)
function person(name) {
  const id = `${name}-${++n}`;
  run("INSERT INTO pg_users (id, handle, name, email, pub, salt, proof_hash, vault, swift, swift_at, created_at) VALUES (?1, ?1, ?2, ?1 || '@example.com', '{}', 's', 'p', 'v', 3, 0, 0)", id, name);
  return id;
}
function signIn(id, { label = "iPhone · Safari", home = null, apps = "today", parent = null, seen = T } = {}) {
  const hash = `sess-${id}-${++n}`;
  run("INSERT INTO pg_sessions (hash, user_id, created_at, seen_at, label, home, apps, parent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", hash, id, T - 864e5, seen, label, home, apps, parent);
  return hash;
}
const userOf = (id, sessionHash) => ({ id, sessionHash });
// a browser's push subscription (a real P-256 key, as Today's checks want)
async function sub(name) {
  const k = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  return { endpoint: `https://fcm.googleapis.com/fcm/send/${name}-${++n}`, keys: { p256dh: Buffer.from(await crypto.subtle.exportKey("raw", k.publicKey)).toString("base64url"), auth: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url") } };
}
const where = (endpoint) => ({
  td: one("SELECT user_id, session FROM td_push WHERE endpoint = ?", endpoint),
  pg: one("SELECT user_id, session, via FROM pg_push WHERE endpoint = ?", endpoint),
  mk: one("SELECT user_id, session, via FROM mk_push WHERE endpoint = ?", endpoint),
  wx: one("SELECT user_id, sess, via FROM wx_devs WHERE endpoint = ?", endpoint),
});
// (Fitness's morning row for an endpoint: never fanned out, but moved and dropped with the rest)
const fxAt = (endpoint) => one("SELECT user_id, p256dh, session FROM fx_push WHERE endpoint = ?", endpoint);
const places = (endpoint) => all("SELECT s.name, s.rain, s.warn FROM wx_subs s JOIN wx_devs d ON d.dev = s.dev WHERE d.endpoint = ? ORDER BY s.name", endpoint);
// (the account's Weather notifications, as its own page keeps them: functions/_wxacct.js)
const weatherOf = (id, notify) => run("INSERT INTO wx_accts (user_id, data, ver, updated) VALUES (?, ?, 1, ?)", id, JSON.stringify({ places: [], notify, settings: { temp: "c" } }), T);
const NOTIFY = { places: [{ lat: 51.51, lon: -0.13, name: "London", rain: true, warn: true }, { lat: 53.8, lon: -1.55, name: "Leeds", rain: false, warn: true }], brief: null, briefAt: "07:00" };

test("without fan, or with fan while HUB_PUSH isn't set: Today's td_push only, as Today's morning has always had it", async () => {
  const me = person("Ana"), u = userOf(me, signIn(me)), a = await sub("ana"), b = await sub("ana");
  assert.deepEqual(await deviceAdd(env, u, { sub: a, tz: "Europe/London" }), { ok: true, tables: ["td_push"] });
  assert.deepEqual(await deviceAdd(off, u, { sub: b, fan: true }), { ok: true, tables: ["td_push"] }, "fan counts only with HUB_PUSH");
  assert.deepEqual(await deviceAdd(env, u, { sub: b, fan: "yes" }), { ok: true, tables: ["td_push"] }, "fan: true, nothing else");
  for (const e of [a.endpoint, b.endpoint]) assert.deepEqual(where(e), { td: { user_id: me, session: u.sessionHash }, pg: null, mk: null, wx: null });
  await assert.rejects(deviceAdd(env, u, { sub: { endpoint: "https://evil.example/push", keys: a.keys }, fan: true }), /push subscription/);
  await assert.rejects(deviceAdd(env, u, { sub: { ...a, keys: { p256dh: "x", auth: "y" } } }), /push subscription/);
});

test("fanned out after the tap, with HUB_PUSH: Chat's (the cookie's sign-in), Markets' and Weather's, one endpoint, each via 'hub', no welcome push", async () => {
  const me = person("Ben"), u = userOf(me, signIn(me)), s = await sub("ben");
  weatherOf(me, NOTIFY);
  pushed.length = 0;
  assert.deepEqual(await deviceAdd(env, u, { sub: s, fan: true, tz: "Europe/London" }), { ok: true, tables: ["td_push", "pg_push", "mk_push", "wx_devs"] });
  assert.deepEqual(where(s.endpoint), { td: { user_id: me, session: u.sessionHash }, pg: { user_id: me, session: u.sessionHash, via: "hub" },
    mk: { user_id: me, session: u.sessionHash, via: "hub" }, wx: { user_id: me, sess: u.sessionHash, via: "hub" } });
  assert.deepEqual(places(s.endpoint), [{ name: "Leeds", rain: 0, warn: 1 }, { name: "London", rain: 1, warn: 1 }], "a place for each the account has on");
  assert.deepEqual(pushed, [], "Weather's 'Notifications on' isn't sent: InFlite's own note says so");
  // (again: the same rows, still one each)
  assert.deepEqual((await deviceAdd(env, u, { sub: s, fan: true })).tables, ["td_push", "pg_push", "mk_push", "wx_devs"]);
  assert.equal(one("SELECT COUNT(*) AS n FROM pg_push WHERE user_id = ?", me).n, 1);
  assert.equal(one("SELECT COUNT(*) AS n FROM wx_subs s JOIN wx_devs d ON d.dev = s.dev WHERE d.user_id = ?", me).n, 2);
});

test("each table's own rules: Chat's one a sign-in and ten an account, Markets' ten an account", async () => {
  const me = person("Cai"), sess = signIn(me), u = userOf(me, sess);
  const first = await sub("cai"), second = await sub("cai");
  await deviceAdd(env, u, { sub: first, fan: true });
  await deviceAdd(env, u, { sub: second, fan: true });
  assert.equal(where(first.endpoint).pg, null, "a sign-in's newer subscription replaces its last in Chat's");
  assert.equal(where(second.endpoint).pg.session, sess);
  // (ten older ones of other sign-ins: the oldest goes as the eleventh comes)
  for (let i = 0; i < 10; i++) {
    const old = await sub("cai-old"), h = signIn(me);
    run("INSERT INTO pg_push (endpoint, user_id, session, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?)", old.endpoint, me, h, old.keys.p256dh, old.keys.auth, i);
    run("INSERT INTO mk_push (endpoint, user_id, p256dh, auth, added, session) VALUES (?, ?, ?, ?, ?, ?)", old.endpoint, me, old.keys.p256dh, old.keys.auth, i, h);
  }
  const third = await sub("cai"), u2 = userOf(me, signIn(me));
  assert.deepEqual((await deviceAdd(env, u2, { sub: third, fan: true })).tables, ["td_push", "pg_push", "mk_push", "wx_devs"]);
  assert.equal(one("SELECT COUNT(*) AS n FROM pg_push WHERE user_id = ?", me).n, 10);
  assert.equal(one("SELECT COUNT(*) AS n FROM mk_push WHERE user_id = ?", me).n, 10);
  assert.equal(one("SELECT COUNT(*) AS n FROM pg_push WHERE user_id = ? AND created_at = 0", me).n, 0, "the oldest went");
});

test("Chat's own push and the hub's, on one sign-in: neither takes the other's, so Get Every App's Here stays", async () => {
  const me = person("Dee"), sess = signIn(me), u = userOf(me, sess), hub = await sub("dee-hub"), chat = await sub("dee-chat"), chat2 = await sub("dee-chat");
  await deviceAdd(env, u, { sub: hub, fan: true });
  await keepSub(env.DB, me, sess, chat);                    // (Chat's own, on another of the site's pages: pushSubscribe)
  assert.equal(where(hub.endpoint).pg?.via, "hub", "the hub's kept as Chat's own comes");
  assert.equal(where(chat.endpoint).pg?.via, null);
  await keepSub(env.DB, me, sess, chat2);                   // (Chat's newer one replaces only its own)
  assert.equal(where(chat.endpoint).pg, null);
  assert.equal(where(hub.endpoint).pg?.via, "hub");
  await deviceAdd(env, u, { sub: hub, fan: true });         // (and the hub's again leaves Chat's)
  assert.equal(where(chat2.endpoint).pg?.via, null);
  assert.equal(one("SELECT COUNT(*) AS n FROM pg_push WHERE user_id = ?", me).n, 2);
});

test("never another account's row while it's still signed in there; one whose sign-in has ended is taken", async () => {
  const them = person("Dee"), theirs = signIn(them), me = person("Eli"), u = userOf(me, signIn(me)), s = await sub("shared");
  run("INSERT INTO pg_push (endpoint, user_id, session, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?)", s.endpoint, them, theirs, s.keys.p256dh, s.keys.auth, T);
  await keepPush(env, userOf(them, theirs), s);
  const dev = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s.endpoint))).toString("hex").slice(0, 32);
  run("INSERT INTO wx_devs (dev, endpoint, p256dh, auth, user_id, sess, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", dev, s.endpoint, s.keys.p256dh, s.keys.auth, them, theirs, T, T);
  assert.deepEqual((await deviceAdd(env, u, { sub: s, fan: true })).tables, ["td_push"], "Today's own, as Today takes one over now; none of the apps'");
  assert.deepEqual(where(s.endpoint), { td: { user_id: me, session: u.sessionHash }, pg: { user_id: them, session: theirs, via: null }, mk: { user_id: them, session: theirs, via: null }, wx: { user_id: them, sess: theirs, via: null } });
  // their sign-in ends: now it can be this account's
  run("DELETE FROM pg_sessions WHERE hash = ?", theirs);
  assert.deepEqual((await deviceAdd(env, u, { sub: s, fan: true })).tables, ["td_push", "pg_push", "mk_push", "wx_devs"]);
  assert.equal(where(s.endpoint).wx.user_id, me);
});

test("moved by the browser (was): every table that had it, this account's only; and dropped: only this endpoint, only this account's", async () => {
  const me = person("Fay"), u = userOf(me, signIn(me)), s = await sub("fay"), keep = await sub("fay-other"), next = await sub("fay-next");
  weatherOf(me, NOTIFY);
  await deviceAdd(env, u, { sub: s, fan: true });
  const u2 = userOf(me, signIn(me));
  await deviceAdd(env, u2, { sub: keep, fan: true });
  // (Fitness's morning on the same phone, as its own page adds it)
  run("INSERT INTO fx_push (endpoint, user_id, p256dh, auth, at, tz, added, session) VALUES (?, ?, ?, ?, 420, 'Europe/London', ?, ?)", s.endpoint, me, s.keys.p256dh, s.keys.auth, T, u.sessionHash);
  // (someone else can't move it: was is only ever theirs)
  const them = person("Gus"), g = userOf(them, signIn(them));
  assert.deepEqual((await deviceAdd(env, g, { sub: await sub("gus"), was: s.endpoint })).tables, []);
  assert.deepEqual(fxAt(s.endpoint)?.user_id, me, "Fitness's row not moved by someone else");
  assert.deepEqual(await deviceAdd(env, u, { sub: next, was: s.endpoint }), { ok: true, tables: ["td_push", "pg_push", "mk_push", "wx_devs", "fx_push"] });
  assert.deepEqual(where(s.endpoint), { td: null, pg: null, mk: null, wx: null });
  assert.equal(fxAt(s.endpoint), null);
  assert.deepEqual(fxAt(next.endpoint), { user_id: me, p256dh: next.keys.p256dh, session: u.sessionHash }, "Fitness's moved too, its new keys with it");
  assert.equal(where(next.endpoint).wx.via, "hub");
  assert.equal(places(next.endpoint).length, 2, "Weather's places went with it");
  await assert.rejects(deviceAdd(env, u, { sub: next, was: 42 }), /Bad request/);
  // dropped by someone else: nothing
  await deviceDrop(env, g, { endpoint: next.endpoint });
  assert.ok(where(next.endpoint).pg && fxAt(next.endpoint));
  assert.deepEqual(await deviceDrop(env, u, { endpoint: next.endpoint }), { ok: true, on: true }, "the account still wants them: its other device has them");
  assert.deepEqual(where(next.endpoint), { td: null, pg: null, mk: null, wx: null });
  assert.equal(fxAt(next.endpoint), null, "Fitness's morning dropped with it");
  assert.deepEqual(places(next.endpoint), []);
  assert.ok(where(keep.endpoint).pg && where(keep.endpoint).wx, "the other device untouched");
  await assert.rejects(deviceDrop(env, u, {}), /Bad request/);
});

test("today/devices: the account's other sign-ins with a push row in any app's table, by an opaque id; Stop There drops only that one's rows and signs nothing out", async () => {
  const me = person("Hal"), here = signIn(me, { apps: "today", home: "today" }), u = userOf(me, here), mine = await sub("hal-here");
  weatherOf(me, NOTIFY);
  await deviceAdd(env, u, { sub: mine, fan: true });
  // the old icons: Chat on an iPhone, Weather on an iPad (its device by sess), Markets on an iPhone (and Today's morning
  // there), Fitness's morning in Safari; a sign-in with nothing; the account's page opened from this one (part of it)
  const chat = signIn(me, { home: "inflight", apps: "inflight", seen: T - 1000 }), pad = signIn(me, { label: "iPad · Safari", home: "weather", apps: "weather", seen: T - 2000 });
  const mkt = signIn(me, { home: "markets", apps: "markets,today", seen: T - 3000 }), fit = signIn(me, { label: "Mac · Safari", apps: "fitness,account", seen: T - 4000 });
  const none = signIn(me, { apps: "inflight" }), page = signIn(me, { apps: "account", parent: here });
  const c = await sub("hal-chat"), w = await sub("hal-pad"), m = await sub("hal-mkt"), m2 = await sub("hal-mkt-today"), f = await sub("hal-fit"), p = await sub("hal-page");
  run("INSERT INTO pg_push (endpoint, user_id, session, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?)", c.endpoint, me, chat, c.keys.p256dh, c.keys.auth, T);
  const wu = await subscribe(env, { sub: w, units: {} }, userOf(me, pad), NOTIFY, "iPad · Safari");
  assert.ok(wu.on, "Weather's own device on the iPad");
  pushed.length = 0;
  await keepPush(env, userOf(me, mkt), m);
  run("INSERT INTO td_push (endpoint, user_id, p256dh, auth, session, added) VALUES (?, ?, ?, ?, ?, ?)", m2.endpoint, me, m2.keys.p256dh, m2.keys.auth, mkt, T);
  run("INSERT INTO fx_push (endpoint, user_id, p256dh, auth, at, tz, added, session) VALUES (?, ?, ?, ?, 420, 'Europe/London', ?, ?)", f.endpoint, me, f.keys.p256dh, f.keys.auth, T, fit);
  run("INSERT INTO pg_push (endpoint, user_id, session, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?)", p.endpoint, me, page, p.keys.p256dh, p.keys.auth, T);
  // (someone else's, never listed)
  const them = person("Ivy"), theirs = signIn(them), t2 = await sub("ivy");
  run("INSERT INTO pg_push (endpoint, user_id, session, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?)", t2.endpoint, them, theirs, t2.keys.p256dh, t2.keys.auth, T);
  const list = await devicesList(env, u, { device: await deviceHash(mine.endpoint) });
  assert.equal(list.fan, true);
  assert.deepEqual(list.here, ["td_push", "pg_push", "mk_push", "wx_devs"], "this device: in every table it was fanned into");
  assert.deepEqual(list.devices.map((d) => [d.label, d.home, d.apps, d.at]), [
    ["Chat on iPhone", true, ["chat"], T - 1000], ["Weather on iPad", true, ["weather"], T - 2000], ["Markets on iPhone", true, ["markets", "today"], T - 3000], ["Fitness on Mac", false, ["fitness"], T - 4000]]);
  const raw = JSON.stringify(list);
  for (const secret of [chat, pad, mkt, fit, c.endpoint, w.endpoint, m.endpoint, f.endpoint]) {
    assert.ok(!raw.includes(secret) && !raw.includes(secret.slice(0, 16)), "no endpoint, no sign-in's hash (nor its start, as the account's page names one)");
  }
  assert.ok(list.devices.every((d) => /^[A-Za-z0-9_-]{16}$/.test(d.id)) && new Set(list.devices.map((d) => d.id)).size === 4);
  assert.equal((await devicesList(off, u, {})).fan, false, "fan says whether HUB_PUSH is on");
  assert.deepEqual((await devicesList(env, u, {})).here, [], "here only for a device the page names");
  assert.deepEqual((await devicesList(env, u, { device: "../etc" })).here, []);
  // Stop There on the iPad's Weather: its device and its places gone; nothing else; still signed in
  const ipad = list.devices.find((d) => d.label === "Weather on iPad");
  assert.deepEqual(await devicesStop(env, u, { id: ipad.id }), { ok: true });
  assert.equal(one("SELECT COUNT(*) AS n FROM wx_devs WHERE sess = ?", pad).n, 0);
  assert.deepEqual(places(w.endpoint), []);
  assert.ok(one("SELECT 1 AS y FROM pg_sessions WHERE hash = ?", pad), "the iPad's sign-in stays");
  assert.ok(where(mine.endpoint).wx, "this device's Weather stays");
  // and on the Markets iPhone: Markets' and Today's rows of that sign-in
  assert.deepEqual(await stopDevice(env, u, list.devices.find((d) => d.label === "Markets on iPhone").id), ["td_push", "mk_push"]);
  assert.deepEqual([where(m.endpoint).mk, where(m2.endpoint).td], [null, null]);
  assert.deepEqual((await otherDevices(env, u)).map((d) => d.label), ["Chat on iPhone", "Fitness on Mac"], "named by the one app it has a push row for, where it's no app's Home Screen app");
  // not found: another account's sign-in, made up ids, this one's own
  const theirId = (await otherDevices(env, userOf(them, signIn(them)))).find(() => true)?.id;
  assert.ok(theirId);
  await assert.rejects(devicesStop(env, u, { id: theirId }), /wasn’t found/);
  await assert.rejects(devicesStop(env, u, { id: "AAAAAAAAAAAAAAAA" }), /wasn’t found/);
  await assert.rejects(devicesStop(env, u, { id: "x" }), /Bad request/);
  assert.ok(where(t2.endpoint).pg, "theirs untouched");
  assert.equal(await stopDevice(env, u, "AAAAAAAAAAAAAAAA"), null);
  assert.equal(all("SELECT hash FROM pg_sessions WHERE user_id = ?", me).length, 7, "nothing signed out");
  assert.ok(none && page);
});

test("a sign-in used in InFlite's window (or Today's own Home Screen app) is named InFlite, however many apps it has a row in", async () => {
  const me = person("Jo"), u = userOf(me, signIn(me, { home: "inflite" }));
  weatherOf(me, NOTIFY);
  // another phone's InFlite: fanned out into four apps; another's with Today's morning alone; a Mac's Mail
  const pad = signIn(me, { label: "iPad · Safari", home: "inflite", apps: "today,inflight,weather,markets", seen: T - 1000 });
  const phone = signIn(me, { label: "iPhone · Safari", home: "inflite", apps: "today", seen: T - 2000 });
  const mac = signIn(me, { label: "Mac · Safari", home: "mail", apps: "account", seen: T - 3000 });
  await deviceAdd(env, userOf(me, pad), { sub: await sub("jo-pad"), fan: true });
  await deviceAdd(off, userOf(me, phone), { sub: await sub("jo-phone") });       // (off: the account's every would fan it too)
  const m = await sub("jo-mac");
  run("INSERT INTO td_push (endpoint, user_id, p256dh, auth, session, added) VALUES (?, ?, ?, ?, ?, ?)", m.endpoint, me, m.keys.p256dh, m.keys.auth, mac, T);
  assert.deepEqual((await otherDevices(env, u)).map((d) => [d.label, d.home, d.apps]), [
    ["InFlite on iPad", true, ["chat", "weather", "markets", "today"]], ["InFlite on iPhone", true, ["today"]], ["Mail on Mac", true, ["today"]]]);
});

test("the four rollback DELETEs of spec §15.4 take back exactly what was fanned out", async () => {
  const me = person("Jo"), u = userOf(me, signIn(me)), s = await sub("jo-hub"), own = await sub("jo-own"), wxOwn = await sub("jo-wx");
  weatherOf(me, NOTIFY);
  await deviceAdd(env, u, { sub: s, fan: true });
  // each app's own, from before: Chat's push-sub, Markets' POST push, Weather's own device
  const chat = signIn(me), mkt = signIn(me), wx = signIn(me);
  run("INSERT INTO pg_push (endpoint, user_id, session, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?)", own.endpoint, me, chat, own.keys.p256dh, own.keys.auth, T);
  await keepPush(env, userOf(me, mkt), own);
  pushed.length = 0;
  await subscribe(env, { sub: wxOwn, units: {} }, userOf(me, wx), NOTIFY, "iPad · Safari");
  const count = () => ({ pg: one("SELECT COUNT(*) AS n FROM pg_push WHERE user_id = ?", me).n, mk: one("SELECT COUNT(*) AS n FROM mk_push WHERE user_id = ?", me).n,
    wx: one("SELECT COUNT(*) AS n FROM wx_devs WHERE user_id = ?", me).n, subs: one("SELECT COUNT(*) AS n FROM wx_subs s JOIN wx_devs d ON d.dev = s.dev WHERE d.user_id = ?", me).n,
    td: one("SELECT COUNT(*) AS n FROM td_push WHERE user_id = ?", me).n });
  assert.deepEqual(count(), { pg: 2, mk: 2, wx: 2, subs: 4, td: 1 });
  S.exec(`DELETE FROM pg_push WHERE via = 'hub';
    DELETE FROM mk_push WHERE via = 'hub';
    DELETE FROM wx_subs WHERE dev IN (SELECT dev FROM wx_devs WHERE via = 'hub');
    DELETE FROM wx_devs WHERE via = 'hub';`);
  assert.deepEqual(count(), { pg: 1, mk: 1, wx: 1, subs: 2, td: 1 }, "each app's own kept, and Today's td_push");
  assert.deepEqual(where(s.endpoint), { td: { user_id: me, session: u.sessionHash }, pg: null, mk: null, wx: null });
  assert.ok(where(own.endpoint).pg && where(own.endpoint).mk && where(wxOwn.endpoint).wx);
});

test("the rollback's pg_push line can be run on a database no device route has been used on: Chat's setup makes its column", async () => {
  const e = { DB: d1(), PIGEON_PUSH_URL: PUSH, PIGEON_SECRET: "devices-test-secret" }, cols = () => e.DB.sql.prepare("PRAGMA table_info(pg_push)").all().map((c) => c.name);
  // (Chat's tables made in it, by a copy of Chat's setup of its own: this copy's is done once, for the first database)
  await (await import(`../../../functions/_pigeon.js?setup=devices-${Date.now()}`)).db(e);
  assert.ok(cols().includes("via"), "Chat's own setup makes it now (its own rows and the hub's kept apart: keepSub)");
  await tick(e, "http://localhost");
  assert.ok(cols().includes("via"), "and the tick's own making of it, there already, is nothing");
  assert.doesNotThrow(() => e.DB.sql.exec("DELETE FROM pg_push WHERE via = 'hub'"));
  await assert.doesNotReject(tick(e, "http://localhost"), "and the next tick, where it's there, is as ever");
});

test("Weather's ended(): a hub-made device whose sign-in has ended is deleted with its places; any other is unlinked and keeps them", async () => {
  const me = person("Kit"), hub = signIn(me), wxs = signIn(me), s = await sub("kit-hub"), w = await sub("kit-wx");
  weatherOf(me, NOTIFY);
  await deviceAdd(env, userOf(me, hub), { sub: s, fan: true });
  pushed.length = 0;
  await subscribe(env, { sub: w, units: {} }, userOf(me, wxs), NOTIFY, "iPhone · Safari");
  run("DELETE FROM pg_sessions WHERE hash IN (?, ?)", hub, wxs);
  await unlinkEnded(env.DB);
  assert.equal(where(s.endpoint).wx, null, "the hub's device: gone");
  assert.deepEqual(places(s.endpoint), []);
  assert.deepEqual(where(w.endpoint).wx, { user_id: null, sess: null, via: null }, "Weather's own: its own now, as before");
  assert.equal(places(w.endpoint).length, 2);
  // (and one InFlite made that's somehow been left with no account: deleted too, never an anonymous phone for good)
  const t = await sub("kit-left"), live = signIn(me);
  await deviceAdd(env, userOf(me, live), { sub: t, fan: true });
  run("UPDATE wx_devs SET user_id = NULL, sess = NULL WHERE endpoint = ?", t.endpoint);
  await unlinkEnded(env.DB);
  assert.equal(where(t.endpoint).wx, null);
});

test("This Phone never turns itself off: a sign-in that ends (signed out elsewhere, expired, ended from Signed-in devices) leaves the device's Today row, here says so, the tick's tidy keeps it", async () => {
  const me = person("Lou"), first = signIn(me, { apps: "today", home: "today" }), s = await sub("lou");
  await deviceAdd(env, userOf(me, first), { sub: s });
  const device = await deviceHash(s.endpoint);
  // (the cause: the sign-in it was handed over with ended, and with it the row: the tick's tidy took it, and You's
  // switch, reading here, went off, with nothing turned off)
  run("DELETE FROM pg_sessions WHERE hash = ?", first);
  await tidyDevices(env);
  assert.deepEqual(where(s.endpoint).td, { user_id: me, session: first }, "kept");
  assert.equal((await todayDevices(env, me)).length, 1, "still sent the morning");
  const again = signIn(me, { apps: "today", home: "today" });
  assert.deepEqual((await devicesList(env, userOf(me, again), { device })).here, ["td_push"], "This Phone still on");
  // (and listed elsewhere, so it can be stopped there; never as this device's other)
  assert.deepEqual((await devicesList(env, userOf(me, again), { device })).devices, [], "not this one's other device");
  const other = signIn(me, { label: "Mac · Safari", apps: "today" }), seen = await otherDevices(env, userOf(me, other));
  assert.deepEqual(seen.map((d) => [d.label, d.apps]), [["A phone or browser", ["today"]]]);
  assert.ok(!JSON.stringify(seen).includes(s.endpoint) && !JSON.stringify(seen).includes(device));
  // handed over again by its page (signed in again): its new sign-in's, and no longer listed as an ended one
  await deviceAdd(env, userOf(me, again), { sub: s });
  assert.equal(where(s.endpoint).td.session, again);
  assert.deepEqual(await otherDevices(env, userOf(me, other)), [{ id: (await otherDevices(env, userOf(me, other)))[0].id, label: "Today on iPhone", home: true, apps: ["today"], at: T }]);
  // Stop There on one whose sign-in has ended: that device, everywhere it's this account's
  run("DELETE FROM pg_sessions WHERE hash = ?", again);
  const lone = (await otherDevices(env, userOf(me, other)))[0];
  assert.equal(lone.label, "A phone or browser");
  assert.deepEqual(await devicesStop(env, userOf(me, other), { id: lone.id }), { ok: true });
  assert.equal(where(s.endpoint).td, null);
});

test("the account's word on notifications: on from any device; off on one keeps it while another has them; the last turned off unsays it", async () => {
  const me = person("Max"), u = userOf(me, signIn(me)), a = await sub("max-a"), b = await sub("max-b");
  assert.deepEqual(await pushPrefs(env, me), { on: false, every: false });
  await deviceAdd(env, u, { sub: a });
  assert.deepEqual(await pushPrefs(env, me), { on: true, every: false }, "on, said on one device: a new one offers them on");
  await deviceAdd(env, userOf(me, signIn(me)), { sub: b });
  assert.deepEqual(await deviceDrop(env, u, { endpoint: a.endpoint }), { ok: true, on: true }, "off on one device: the other still has them");
  assert.equal((await pushPrefs(env, me)).on, true);
  assert.deepEqual(await deviceDrop(env, u, { endpoint: b.endpoint }), { ok: true, on: false }, "the last: the account doesn't want them now");
  assert.deepEqual(await pushPrefs(env, me), { on: false, every: false });
});

test("Get Every App's Here is the account's: chosen once, a hand-over without the tap (the page's own, the service worker's) and another device turned on have every app's too", async () => {
  const me = person("Ned"), phone = signIn(me), s = await sub("ned-phone"), pad = await sub("ned-pad");
  weatherOf(me, NOTIFY);
  await deviceAdd(env, userOf(me, phone), { sub: s, fan: true });
  assert.deepEqual(await pushPrefs(env, me), { on: true, every: true });
  // (the cause: its apps' rows go with the sign-in (Chat's at its next push, by its own rule), and only a fan: true,
  // which only this phone's browser remembered, from the tap, brought them back)
  run("DELETE FROM pg_sessions WHERE hash = ?", phone);
  await tick(env, "http://localhost").catch(() => {});
  run("DELETE FROM pg_push WHERE endpoint = ?", s.endpoint);
  const back = signIn(me);
  assert.deepEqual((await deviceAdd(env, userOf(me, back), { sub: s })).tables, ["td_push", "pg_push", "mk_push", "wx_devs"], "handed over again, no tap: every app's");
  assert.equal(where(s.endpoint).pg.session, back);
  // another device, turned on there: every app's, as the account says
  assert.deepEqual((await deviceAdd(env, userOf(me, signIn(me, { label: "iPad · Safari" })), { sub: pad })).tables, ["td_push", "pg_push", "mk_push", "wx_devs"]);
  // HUB_PUSH off: Today's alone, as ever
  assert.deepEqual((await deviceAdd(off, userOf(me, back), { sub: s })).tables, ["td_push"]);
  // the one switch off on both: the account's every stays chosen, for the next time they're on
  await deviceDrop(env, userOf(me, back), { endpoint: s.endpoint }); await deviceDrop(env, userOf(me, back), { endpoint: pad.endpoint });
  assert.deepEqual(await pushPrefs(env, me), { on: false, every: true });
});
