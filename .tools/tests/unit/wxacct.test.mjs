// The site's one sign-in (functions/_account.js), and Weather's part of the account: putting two devices' places and
// notifications together (weather/account.js), and what's kept made safe (functions/_wxacct.js, _wxpush.js wantOf).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergePlaces, mergeNotify, mergeSettings, notifyChanges, keyOf, nkeyOf, MAX_NOTIFY } from "../../../weather/account.js";
import { cookieToken, withCookie, withoutSession } from "../../../functions/_account.js";
import { cleanData } from "../../../functions/_wxacct.js";
import { wantOf, mailWant, MAX_PLACES } from "../../../functions/_wxpush.js";

const P = (name, lat, lon) => ({ name, region: "", lat, lon });
const london = P("London", 51.5072, -0.1276), leeds = P("Leeds", 53.8, -1.55), york = P("York", 53.96, -1.08), bath = P("Bath", 51.38, -2.36);

test("places put together: the account's, less what this device took away since, and what it added", () => {
  // in step from [London, Leeds]; since then, this device took Leeds away and added York, and another added Bath
  const theirs = [london, leeds, bath], mine = [london, york], base = [london, leeds].map(keyOf);
  assert.deepEqual(mergePlaces(theirs, mine, base).map((p) => p.name), ["London", "Bath", "York"]);
  // signed in for the first time (nothing in step before): all of both, the account's first
  assert.deepEqual(mergePlaces([london, bath], [york, london], []).map((p) => p.name), ["London", "Bath", "York"]);
  // taken away elsewhere, and not touched here: gone here too
  assert.deepEqual(mergePlaces([london], [london, leeds], [london, leeds].map(keyOf)).map((p) => p.name), ["London"]);
});

test("settings put together, setting by setting: those changed here since, the rest the account's", () => {
  // (as app.js has canon: an object's keys in order)
  const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
  // in step at °C and the 24-hour clock; since then, the 12-hour clock here, and °F on another device
  const base = { temp: "c", clock: "24" }, mine = { temp: "c", clock: "12" }, theirs = { temp: "f", clock: "24" };
  assert.deepEqual(mergeSettings(theirs, mine, base, ["temp", "clock"], canon), { temp: "f", clock: "12" });
  // (a setting that's an object: the same, its keys in any order, isn't a change)
  assert.deepEqual(mergeSettings({ commute: { on: true, am: "07:30" } }, { commute: { am: "08:00", on: false } }, { commute: { on: false, am: "08:00" } }, ["commute"], canon), { commute: { on: true, am: "07:30" } });
  // nothing kept with the account, nor in step before: all of this device's
  assert.deepEqual(mergeSettings(null, mine, null, ["temp", "clock"], canon), mine);
});

test("notifications put together, place by place: this device's changes since, over the account's", () => {
  const was = { places: [{ ...london, rain: true, warn: false }], brief: null, briefAt: "07:00" };
  // here: London's warnings on too; elsewhere: Leeds's rain on, and a briefing for Leeds
  const mine = { places: [{ ...london, rain: true, warn: true }], brief: null, briefAt: "07:00" };
  const theirs = { places: [{ ...london, rain: true, warn: false }, { ...leeds, rain: true, warn: false }], brief: leeds, briefAt: "06:30" };
  const changed = notifyChanges(mine, was);
  assert.deepEqual(changed, [keyOf(london)]);
  const m = mergeNotify(theirs, mine, changed);
  assert.deepEqual(m.places.map((p) => `${p.name}:${p.rain}${p.warn}`), ["London:truetrue", "Leeds:truefalse"]);
  assert.equal(m.brief.name, "Leeds"); assert.equal(m.briefAt, "06:30");
  // turned off here: off, even though the account still had it on
  const off = { places: [], brief: null, briefAt: "07:00" };
  assert.deepEqual(mergeNotify(theirs, off, notifyChanges(off, was)).places.map((p) => p.name), ["Leeds"]);
  // My Location is one place whichever device it's on, wherever that is
  assert.equal(nkeyOf({ lat: 1, lon: 2, gps: true }), "gps");
  assert.deepEqual(notifyChanges({ places: [{ lat: 51, lon: 0, gps: true, rain: true }] }, { places: [{ lat: 52, lon: 1, gps: true, rain: true }] }), []);
});

test("by email too: a choice of its own, put together like the rest, and only the warnings and the briefing", () => {
  const was = { places: [{ ...london, rain: true, warn: true }], brief: london, briefAt: "07:00" };
  const mine = { ...was, email: { warn: true, brief: false } };
  assert.deepEqual(notifyChanges(mine, was), ["email"]);
  // turned on here: on, whatever the account had; not touched here: the account's
  const theirs = { ...was, briefAt: "06:30", email: { warn: false, brief: true } };
  assert.deepEqual(mergeNotify(theirs, mine, notifyChanges(mine, was)).email, { warn: true, brief: false });
  assert.deepEqual(mergeNotify(theirs, was, []).email, { warn: false, brief: true });
  // kept with the account as it's chosen
  assert.deepEqual(cleanData({ places: [london], notify: { ...mine, email: { warn: 1, brief: 0, extra: "x" } } }).notify.email, { warn: true, brief: false });
  // what the account's email is sent: the places with warnings on (never rain alerts), and the briefing, each if chosen
  const w = wantOf({ places: [{ ...london, rain: true, warn: true }, { ...leeds, rain: true }], brief: york, email: { warn: true, brief: false } });
  assert.deepEqual(mailWant(w), { places: [{ lat: 51.51, lon: -0.13, name: "London", rain: false, warn: true }], brief: null, briefAt: "07:00" });
  assert.deepEqual(mailWant({ ...w, email: { warn: false, brief: true } }).brief.name, "York");
  assert.deepEqual(mailWant({ ...w, email: { warn: false, brief: false } }), { places: [], brief: null, briefAt: "07:00" });
});

test("what's kept with the account, made safe", () => {
  const d = cleanData({ places: [london, { ...london, name: "London again" }, { name: "‮evil", lat: 52, lon: 1 }, { name: "nowhere", lat: 95, lon: 0 }], settings: { temp: "f" },
    notify: { places: [{ ...london, rain: true }, { ...leeds }], brief: london, briefAt: "25:00" } });
  assert.deepEqual(d.places.map((p) => p.name), ["London", "evil"]);
  assert.deepEqual(d.notify.places.map((p) => [p.name, p.lat, p.lon, p.rain, p.warn]), [["London", 51.51, -0.13, true, false]]);
  assert.equal(d.notify.brief.name, "London"); assert.equal(d.notify.briefAt, "07:00");
  assert.throws(() => cleanData({ places: Array.from({ length: 51 }, (_, i) => P(`P${i}`, i, i)) }), /50 places at most/);
  // (notifications for more places than a device can have: refused, not cut short, so the app knows; it keeps to them)
  assert.throws(() => cleanData({ notify: { places: Array.from({ length: 13 }, (_, i) => ({ lat: i, lon: i, rain: true })) } }), /12 places at most/);
  assert.throws(() => cleanData([]), /Bad request/);
});

test("a device's notifications: a place each, and the app from before's one place", () => {
  assert.deepEqual(wantOf({ place: { lat: 51.5072, lon: -0.1276, name: "London" }, rain: true, brief: true, briefAt: "06:15" }),
    { places: [{ lat: 51.51, lon: -0.13, name: "London", rain: true, warn: false }], brief: { lat: 51.51, lon: -0.13, name: "London" }, briefAt: "06:15", email: { warn: false, brief: false } });
  const w = wantOf({ places: [{ ...london, warn: true }, { ...london, rain: true }, { ...leeds }], brief: null });
  assert.deepEqual(w.places.map((p) => [p.name, p.warn]), [["London", true]]);
  assert.throws(() => wantOf({ places: Array.from({ length: 13 }, (_, i) => ({ lat: i, lon: i, rain: true })) }), /12 places at most/);
  assert.throws(() => wantOf({ place: { lat: "x", lon: 0 }, rain: true }), /Bad place/);
});

test("the site's sign-in, as a cookie: the whole site's where the address is the site's, out of any page's reach", () => {
  const req = (url, cookie) => new Request(url, { headers: cookie ? { Cookie: cookie } : {} });
  const set = (url, env = {}) => withCookie(new Response("{}"), req(url), env, "t".repeat(43)).headers.getSetCookie()[0];
  assert.match(set("https://weather.georgefarrowgreen.com/api/weather/me"), /^__Secure-account=t{43}; Path=\/; Domain=georgefarrowgreen\.com; HttpOnly; SameSite=Lax; Secure; Max-Age=15552000$/);
  assert.match(set("https://chat.georgefarrowgreen.com/api/pigeon/login"), /Domain=georgefarrowgreen\.com/);
  // the site's own addresses: Secure whatever the request came over
  assert.match(set("http://weather.georgefarrowgreen.com/api/weather/me"), /^__Secure-account=.*; Secure; /);
  // a preview's address, or this machine's: that address alone, and without Secure over plain http
  assert.doesNotMatch(set("https://abc.georgefarrowgreen.pages.dev/api/weather/me"), /Domain=/);
  assert.match(set("http://localhost:8788/api/pigeon/login"), /^account=t{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age/);
  assert.match(set("http://weather.gfg.test:8788/api/weather/me", { ACCOUNT_SITE: "gfg.test" }), /Domain=gfg\.test/);
  assert.match(withoutSession(new Response("{}"), req("https://chat.georgefarrowgreen.com/"), {}).headers.get("Set-Cookie"), /^__Secure-account=; .*Max-Age=0$/);
  // read back: only its own name (the secure one over https), and only a token's characters
  assert.equal(cookieToken(req("https://weather.georgefarrowgreen.com/", `x=1; __Secure-account=${"a".repeat(43)}`), {}), "a".repeat(43));
  assert.equal(cookieToken(req("https://weather.georgefarrowgreen.com/", `account=${"a".repeat(43)}`), {}), null);
  assert.equal(cookieToken(req("https://weather.georgefarrowgreen.com/", `__Secure-account=bad"value`), {}), null);
});

test("the app turns notifications on for no more places than the server takes", () => {
  // (one more would be refused on every save after, the account's places and settings with it)
  assert.equal(MAX_NOTIFY, MAX_PLACES);
});

// ---- a device InFlite made one of the account's (Today First, spec §11.3: functions/_devices.js, _wxpush.js deviceFor)
import { DatabaseSync } from "node:sqlite";
import { db } from "../../../functions/_pigeon.js";
import { wxdb, deviceFor, devicesOf, applyAccount, subscribe } from "../../../functions/_wxpush.js";
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

// (one database for these: the server's tables are made once a copy of it)
const wxEnv = { DB: d1(), PIGEON_PUSH_URL: "http://push.test/push" };

test("a device InFlite made: the account's places, no welcome, never another account's; deleted with its places once its sign-in ends, where Weather's own is only unlinked", async () => {
  const PUSH = "http://push.test/push", pushed = [], real = globalThis.fetch;
  globalThis.fetch = async (url, o = {}) => { if (String(url) === PUSH) { pushed.push(o.headers["X-Endpoint"]); return new Response("", { status: 201 }); } return new Response("{}", { status: 404 }); };
  try {
    const env = wxEnv;
    await db(env); await wxdb(env);
    const run = (q, ...a) => env.DB.sql.prepare(q).run(...a), all = (q, ...a) => env.DB.sql.prepare(q).all(...a).map((r) => ({ ...r })), t = Date.now();
    for (const [id, hash] of [["kay", "s-hub"], ["kay", "s-wx"], ["lou", "s-lou"]]) {
      run("INSERT OR IGNORE INTO pg_users (id, handle, name, email, pub, salt, proof_hash, vault, swift, swift_at, created_at) VALUES (?1, ?1, ?1, ?1 || '@example.com', '{}', 's', 'p', 'v', 3, 0, 0)", id);
      run("INSERT INTO pg_sessions (hash, user_id, created_at, seen_at, label) VALUES (?, ?, ?, ?, 'iPhone · Safari')", hash, id, t, t);
    }
    const notify = { places: [{ ...london, rain: true, warn: true }, { ...leeds, warn: true }], brief: york, briefAt: "07:00" };
    run("INSERT INTO wx_accts (user_id, data, ver, updated) VALUES ('kay', ?, 1, ?)", JSON.stringify({ places: [london, leeds, york], notify, settings: { temp: "f" } }), t);
    const key = async (name) => { const k = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
      return { endpoint: `https://fcm.googleapis.com/fcm/send/wxacct-${name}`, keys: { p256dh: Buffer.from(await crypto.subtle.exportKey("raw", k.publicKey)).toString("base64url"), auth: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url") } }; };
    const hub = await key("hub"), own = await key("own");
    assert.equal(await deviceFor(env, "kay", hub, { sess: "s-hub", via: "hub" }), true);
    assert.deepEqual(pushed, [], "no 'Notifications on': InFlite's own note says so");
    const rowsOf = (endpoint) => all("SELECT s.name, s.rain, s.warn, s.brief, s.units FROM wx_subs s JOIN wx_devs d ON d.dev = s.dev WHERE d.endpoint = ? ORDER BY s.name", endpoint);
    assert.deepEqual(rowsOf(hub.endpoint).map((r) => [r.name, r.rain, r.warn, r.brief]), [["Leeds", 0, 1, 0], ["London", 1, 1, 0], ["York", 0, 0, 1]], "a place for each the account has on, its briefing too");
    assert.match(rowsOf(hub.endpoint)[0].units, /"temp":"f"/, "in the account's units");
    assert.deepEqual(all("SELECT user_id, sess, via, label FROM wx_devs WHERE endpoint = ?", hub.endpoint), [{ user_id: "kay", sess: "s-hub", via: "hub", label: "iPhone · Safari" }]);
    // (another account, still signed in, can't take it)
    assert.equal(await deviceFor(env, "lou", hub, { sess: "s-lou", via: "hub" }), false);
    assert.equal(all("SELECT user_id FROM wx_devs WHERE endpoint = ?", hub.endpoint)[0].user_id, "kay");
    // the account's choices change: the hub's device follows, as any of the account's does
    await applyAccount(env, "kay", { places: [{ ...leeds, rain: true }], brief: null, briefAt: "07:00" }, { temp: "f" });
    assert.deepEqual(rowsOf(hub.endpoint).map((r) => [r.name, r.rain]), [["Leeds", 1]]);
    // Weather's own device, on another sign-in; both listed
    await subscribe(env, { sub: own, units: {} }, { id: "kay", sessionHash: "s-wx" }, { places: [{ ...leeds, rain: true }], brief: null, briefAt: "07:00" }, "iPad · Safari");
    assert.equal((await devicesOf(env, "kay")).length, 2);
    // both sign-ins end: the hub's device goes, with its places; Weather's own is its own now, and keeps them
    run("DELETE FROM pg_sessions WHERE hash IN ('s-hub', 's-wx')");
    assert.deepEqual(await devicesOf(env, "kay"), []);
    assert.deepEqual(all("SELECT 1 FROM wx_devs WHERE endpoint = ?", hub.endpoint), []);
    assert.deepEqual(rowsOf(hub.endpoint), []);
    assert.deepEqual(all("SELECT user_id, sess FROM wx_devs WHERE endpoint = ?", own.endpoint), [{ user_id: null, sess: null }]);
    assert.equal(rowsOf(own.endpoint).length, 1);
  } finally { globalThis.fetch = real; }
});

// One account's devices are kept to ten, as Markets' phones are: the one heard from least lately let go (with its
// places) as another's turned on, by Weather or by InFlite, so no account fills the places every device shares
test("an account's devices kept to ten: the least lately heard from let go, with its places, never the one just turned on", async () => {
  const PUSH = "http://push.test/push", real = globalThis.fetch;
  globalThis.fetch = async (url) => (String(url) === PUSH ? new Response("", { status: 201 }) : new Response("{}", { status: 404 }));
  try {
    const env = wxEnv;
    await db(env); await wxdb(env);
    const run = (q, ...a) => env.DB.sql.prepare(q).run(...a), all = (q, ...a) => env.DB.sql.prepare(q).all(...a).map((r) => ({ ...r })), t = Date.now();
    run("INSERT INTO pg_users (id, handle, name, email, pub, salt, proof_hash, vault, swift, swift_at, created_at) VALUES ('max', 'max', 'max', 'max@example.com', '{}', 's', 'p', 'v', 3, 0, 0)");
    run("INSERT INTO pg_sessions (hash, user_id, created_at, seen_at, label) VALUES ('s-max', 'max', ?, ?, 'iPhone · Safari')", t, t);
    const notify = { places: [{ ...london, rain: true }], brief: null, briefAt: "07:00" };
    run("INSERT INTO wx_accts (user_id, data, ver, updated) VALUES ('max', ?, 1, ?)", JSON.stringify({ places: [london], notify, settings: {} }), t);
    const key = async (name) => { const k = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
      return { endpoint: `https://fcm.googleapis.com/fcm/send/cap-${name}`, keys: { p256dh: Buffer.from(await crypto.subtle.exportKey("raw", k.publicKey)).toString("base64url"), auth: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url") } }; };
    const subs = [];
    for (let i = 0; i < 12; i++) {
      subs.push(await key(i));
      await subscribe(env, { sub: subs[i], units: {} }, { id: "max", sessionHash: "s-max" }, notify, `device ${i}`);
      // (each heard from a minute after the last)
      run("UPDATE wx_devs SET updated = ? WHERE endpoint = ?", t + i * 60e3, subs[i].endpoint);
    }
    const devs = () => all("SELECT endpoint FROM wx_devs WHERE user_id = 'max' ORDER BY updated").map((r) => r.endpoint.split("-").pop());
    assert.deepEqual(devs(), ["2", "3", "4", "5", "6", "7", "8", "9", "10", "11"], "the first two let go");
    assert.equal(all("SELECT COUNT(*) AS n FROM wx_subs WHERE dev IN (SELECT dev FROM wx_devs WHERE user_id = 'max')").at(0).n, 10, "and their places with them");
    // (InFlite's one device route: the same)
    const hub = await key("hub");
    assert.equal(await deviceFor(env, "max", hub, { sess: "s-max", via: "hub" }), true);
    assert.equal(devs().length, 10);
    assert.ok(devs().includes("hub") && !devs().includes("2"), "the hub's kept, the least lately heard from gone");
    // (the account's email isn't one of them)
    await applyAccount(env, "max", { ...notify, places: [{ ...london, warn: true }], email: { warn: true } }, {});
    assert.equal(all("SELECT COUNT(*) AS n FROM wx_devs WHERE user_id = 'max'").at(0).n, 11, "ten devices and the email");
  } finally { globalThis.fetch = real; }
});
