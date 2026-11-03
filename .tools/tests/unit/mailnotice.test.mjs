// Mail through InFlite, the account's side (One roof stage 4, s4/spec S4-D8, S4-D10, S4-D12, §6.3): POST
// mail/notice from Mail's Worker (its key first, in constant time, and no cookie looked at; off → { on: false } and
// nothing told; on → answered before anyone's told, and what's told is "Mail" and fixed words, only the conversation's id
// from the request; quiet hours and a ride → held); the preference itself, through Today's /api/notify, the admin's
// alone; fromMail taking InFlite's origins for the hand-back only; Mail's card on Today (functions/_todaymail.js: the
// key, 700 ms, anything but a 200 with numbers is no card) and its line on Apps; and Mail a card of Today's, never a
// line of the morning. Through the account's router, against Node's own SQLite standing in for D1.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import { db, hex, sha256 } from "../../../functions/_pigeon.js";
import { onRequest } from "../../../functions/api/account/[[path]].js";
import { mailNote, MAIL_WORDS } from "../../../functions/_mailapp.js";
import { mailCard, cardOf, MAIL_CARD_MS } from "../../../functions/_todaymail.js";
import { CARDS, LINES, tddb, todayPrefs, savePrefs, saveMorning, todayExport } from "../../../functions/_today.js";
import { timesReady } from "../../../functions/_fittimes.js";
import { wxdb } from "../../../functions/_wxpush.js";
import { fitdb } from "../../../functions/_fitness.js";
import { offersReady } from "../../../functions/_fitshare.js";
import { timesFor } from "../../../functions/_times.js";
import { dayFor } from "../../../functions/_todayday.js";

function d1() {
  const s = new DatabaseSync(":memory:");
  const val = (a) => a.map((x) => (typeof x === "boolean" ? +x : x === undefined ? null : x));
  const st = (sql, args = []) => ({
    q: sql,
    bind: (...a) => st(sql, a),
    first: async () => s.prepare(sql).get(...val(args)) ?? null,
    all: async () => ({ results: s.prepare(sql).all(...val(args)), meta: {} }),
    run: async () => ({ meta: { changes: Number(s.prepare(sql).run(...val(args)).changes) } }),
    now: () => (/^\s*(SELECT|PRAGMA|WITH)\b|\bRETURNING\b/i.test(sql) ? { results: s.prepare(sql).all(...val(args)) } : { meta: { changes: Number(s.prepare(sql).run(...val(args)).changes) } }),
  });
  return { sql: s, prepare: (sql) => st(sql), async batch(list) { s.exec("BEGIN"); try { const r = list.map((x) => x.now()); s.exec("COMMIT"); return r; } catch (e) { s.exec("ROLLBACK"); throw e; } } };
}
const KEY = "mail-test-key", PUSH = "http://push.test/push", VIA = "http://127.0.0.1:8807";
const env = { DB: d1(), APPS_SITE: "ifl.test", ACCOUNT_SITE: "gfg.test", ACCOUNT_HOST: "account.ifl.test", AUTH_HOST: "auth.ifl.test", HUB_ORIGINS: "http://ifl.test:8788",
  MAIL_KEY: KEY, MAIL_VIA: VIA, PIGEON_PUSH_URL: PUSH };
const D = await db(env); await tddb(env); await timesReady(env); await wxdb(env); await fitdb(env); await offersReady(env); await timesFor(env, "nobody", 0, 1, { t: 0 });
const run = (sql, ...a) => env.DB.sql.prepare(sql).run(...a);
const t0 = Date.now(), TODAY = "http://ifl.test:8788", MAILO = "http://email.ifl.test:8788";
// (Mail's own address with no request to take a port from: the test site's, as production's is https://email.inflite.ai)
const OWN = "https://email.ifl.test";
for (const id of ["gf", "bo"]) run("INSERT INTO pg_users (id, handle, name, email, pub, salt, proof_hash, vault, swift, swift_at, created_at) VALUES (?1, ?1, ?1, ?1 || '@example.com', '{}', 's', 'p', 'v', 3, ?2, ?2)", id, t0);
run("INSERT INTO pg_meta (k, v) VALUES ('admin_user', 'gf')");
async function signIn(user) {
  const token = randomBytes(24).toString("base64url");
  run("INSERT INTO pg_sessions (hash, user_id, created_at, seen_at, auth_at, site_hash) VALUES (?, ?, ?, ?, ?, ?)", `s-${user}-${token.slice(0, 6)}`, user, t0, t0, t0, hex(await sha256(token)));
  return `account=${token}`;
}
const gf = await signIn("gf"), bo = await signIn("bo");

// ---- the push services and Mail's Worker, stood in for: every request kept ----
let pushes = [], asked = [], mailSays = () => Response.json({ people: 3, updates: 5, later: { n: 2, next: t0 + 3600e3 } });
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, o = {}) => {
  const u = String(url);
  if (u === PUSH) { pushes.push({ endpoint: o.headers["X-Endpoint"], body: new Uint8Array(o.body) }); return new Response("", { status: 201 }); }
  if (u.startsWith(VIA) || u.startsWith(MAILO)) { asked.push({ url: u, auth: new Headers(o.headers).get("Authorization"), cookie: new Headers(o.headers).get("Cookie") }); return mailSays(u, o); }
  return new Response("{}", { status: 404 });
};
const said = console.error;
console.error = () => {};
after(() => { globalThis.fetch = realFetch; console.error = said; });

// (a phone of the admin's for InFlite's notifications, as Today's page makes one; its keys kept, to read what's sent)
const wc = crypto.subtle, te = new TextEncoder();
async function phone(n, user = "gf") {
  const kp = await wc.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]), auth = crypto.getRandomValues(new Uint8Array(16));
  const pub = new Uint8Array(await wc.exportKey("raw", kp.publicKey));
  const ph = { endpoint: `https://fcm.googleapis.com/fcm/send/mail-test-${n}`, p256dh: Buffer.from(pub).toString("base64url"), auth: Buffer.from(auth).toString("base64url"), kp, pub, authBytes: auth };
  run("INSERT INTO pg_sessions (hash, user_id, created_at, seen_at) VALUES (?, ?, ?, ?)", `s-ph-${n}`, user, t0, t0);
  run("INSERT INTO td_push (endpoint, user_id, p256dh, auth, session, added, fails) VALUES (?, ?, ?, ?, ?, ?, 0)", ph.endpoint, user, ph.p256dh, ph.auth, `s-ph-${n}`, t0 + n);
  return ph;
}
const hkdf = async (salt, ikm, info, len) => new Uint8Array(await wc.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, await wc.importKey("raw", ikm, "HKDF", false, ["deriveBits"]), len * 8));
async function opened(ph, buf) {
  const salt = buf.slice(0, 16), n = buf[20], asPub = buf.slice(21, 21 + n), ct = buf.slice(21 + n);
  const shared = new Uint8Array(await wc.deriveBits({ name: "ECDH", public: await wc.importKey("raw", asPub, { name: "ECDH", namedCurve: "P-256" }, false, []) }, ph.kp.privateKey, 256));
  const ikm = await hkdf(ph.authBytes, shared, new Uint8Array([...te.encode("WebPush: info\0"), ...ph.pub, ...asPub]), 32);
  const key = await wc.importKey("raw", await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16), "AES-GCM", false, ["decrypt"]);
  const pt = new Uint8Array(await wc.decrypt({ name: "AES-GCM", iv: await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12) }, key, ct));
  let end = pt.length - 1; while (end > 0 && pt[end] === 0) end--;
  return JSON.parse(new TextDecoder().decode(pt.slice(0, end)));
}

// (a request to the account's address, as Mail's Worker or Today's server makes them; waited: what was left to run after)
let waited = [];
async function call(method, path, { auth, cookie, origin, body, raw } = {}) {
  const data = raw ?? (body === undefined ? undefined : JSON.stringify(body));
  const request = new Request(`http://account.ifl.test:8788/api/account/${path}`, { method, body: data, headers: { ...(auth ? { Authorization: auth } : {}), ...(cookie ? { Cookie: cookie } : {}),
    ...(origin ? { Origin: origin } : {}), ...(data ? { "Content-Type": "application/json" } : {}), "X-Inflite": "1" } });
  const res = await onRequest({ request, env, params: { path: path.split("/") }, waitUntil: (p) => waited.push(p) });
  return { s: res.status, j: (res.headers.get("Content-Type") || "").includes("json") ? await res.json() : null };
}
const notice = (body, o = {}) => call("POST", "mail/notice", { auth: `Bearer ${KEY}`, body, ...o });
const settle = async () => { while (waited.length) await waited.shift(); };
const setPref = (on) => run("UPDATE pg_users SET notify_prefs = json_patch(COALESCE(notify_prefs, '{}'), ?) WHERE id = 'gf'", JSON.stringify({ mail: { inflite: on } }));

test("mail/notice: Mail's key first, in constant time, before the body or the database; no cookie ever looked at", async () => {
  const before = pushes.length;
  for (const auth of [undefined, "Bearer nope", `Bearer ${KEY}x`, `bearer ${KEY}`, KEY, `Bearer ${KEY.slice(0, -1)}`, `Basic ${KEY}`]) {
    const r = await call("POST", "mail/notice", { auth, raw: "not json at all", cookie: gf });
    assert.equal(r.s, 401, String(auth));
  }
  // (no key set on the server: not set up, whatever's sent)
  const was = env.MAIL_KEY; delete env.MAIL_KEY;
  try { assert.equal((await call("POST", "mail/notice", { auth: `Bearer ${KEY}`, body: { kind: "new", thread: "t1" } })).s, 503); } finally { env.MAIL_KEY = was; }
  // (with the key: the body's checked; only "new" or "later", and a conversation's id)
  for (const body of [{}, { kind: "old", thread: "t1" }, { kind: "new" }, { kind: "new", thread: "a b" }, { kind: "new", thread: "x".repeat(65) }, { kind: "new", thread: "../x" }, { kind: "toString", thread: "t1" }, { kind: "new", thread: 7 }])
    assert.equal((await notice(body)).s, 400, JSON.stringify(body));
  assert.equal(pushes.length, before, "nothing told");
  // (and the key alone: a cookie, even the admin's, without it is nothing)
  assert.equal((await call("POST", "mail/notice", { cookie: gf, body: { kind: "new", thread: "t1" } })).s, 401);
});

test("mail/notice with Through InFlite off (as every account starts): { on: false }, and no one told", async () => {
  await phone(1);
  pushes = [];
  const r = await notice({ kind: "new", thread: "0b5e2c1a-6f7d-4e3b-9a8c-1d2e3f4a5b6c" });
  assert.equal(r.s, 200);
  assert.deepEqual(r.j, { on: false, will: 0, held: false });
  await settle();
  assert.equal(pushes.length, 0);
});

test("mail/notice with it on: answered at once with how many devices, then each told Mail's fixed words, only the id from Mail", async () => {
  setPref(true);
  const ph2 = await phone(2), ph1 = { endpoint: "https://fcm.googleapis.com/fcm/send/mail-test-1" };
  pushes = [];
  const THREAD = "0b5e2c1a-6f7d-4e3b-9a8c-1d2e3f4a5b6c";
  const r = await notice({ kind: "new", thread: THREAD, subject: "SECRET subject", from: "SECRET <x@y>" });
  assert.equal(r.s, 200);
  assert.deepEqual(r.j, { on: true, will: 2, held: false });
  assert.equal(pushes.length, 0, "answered before anyone's told");
  await settle();
  assert.deepEqual(pushes.map((p) => p.endpoint).sort(), [ph1.endpoint, ph2.endpoint].sort());
  const got = await opened(ph2, pushes.find((p) => p.endpoint === ph2.endpoint).body);
  assert.deepEqual(got, { title: "Mail", body: "New mail from people", tag: THREAD, url: `/mail/#thread=${THREAD}`, app: "mail" });
  assert.doesNotMatch(JSON.stringify(got), /SECRET/);
  // (back from Later: its own fixed words)
  pushes = [];
  assert.deepEqual((await notice({ kind: "later", thread: "t-2" })).j, { on: true, will: 2, held: false });
  await settle();
  assert.equal((await opened(ph2, pushes.find((p) => p.endpoint === ph2.endpoint).body)).body, "Back from Later");
  assert.deepEqual(mailNote("later", "abc"), { app: "mail", title: "Mail", body: MAIL_WORDS.later, tag: "abc", url: "/mail/#thread=abc", ttl: 21600 });
  assert.deepEqual(MAIL_WORDS, { new: "New mail from people", later: "Back from Later" });
});

test("mail/notice held: in quiet hours, or on a ride, { held: true } and no one told; a ride's counted as held", async () => {
  const h = new Date().getUTCHours();
  run("UPDATE pg_users SET notify_prefs = json_patch(notify_prefs, ?) WHERE id = 'gf'", JSON.stringify({ quiet: true, quietFrom: h, quietTo: (h + 1) % 24, tz: "UTC" }));
  pushes = [];
  assert.deepEqual((await notice({ kind: "new", thread: "t3" })).j, { on: true, will: 0, held: true });
  await settle();
  assert.equal(pushes.length, 0, "quiet hours");
  run("UPDATE pg_users SET notify_prefs = json_patch(notify_prefs, ?) WHERE id = 'gf'", JSON.stringify({ quiet: false }));
  // (a ride now: from ten minutes before its start)
  const t = Date.now(), day = new Date(t).toISOString().slice(0, 10);
  run("INSERT INTO fx_times (user_id, day, start, stop, tz, sport, source, made) VALUES ('gf', ?, ?, ?, 'UTC', 'ride', 'set', ?)", day, t - 5 * 60e3, t + 3600e3, t);
  try {
    assert.deepEqual((await notice({ kind: "new", thread: "t4" })).j, { on: true, will: 0, held: true });
    await settle();
    assert.equal(pushes.length, 0, "on a ride");
    assert.equal(env.DB.sql.prepare("SELECT held FROM td_rules WHERE user_id = 'gf' AND rule = 'holdRide'").get()?.held, 1, "counted in the hold rule's record");
    // (with rides holding nothing, the switch RIDE_HOLD "0": told)
    env.RIDE_HOLD = "0";
    assert.deepEqual((await notice({ kind: "new", thread: "t5" })).j, { on: true, will: 2, held: false });
    await settle();
  } finally { delete env.RIDE_HOLD; run("DELETE FROM fx_times WHERE user_id = 'gf'"); }
});

test("Through InFlite, from You: Today's /api/notify answers it for the admin and changes it for the admin alone", async () => {
  setPref(false);
  let r = await call("GET", "today/notify", { cookie: gf, origin: TODAY });
  assert.equal(r.s, 200);
  assert.deepEqual(r.j.mail, { inflite: false });
  r = await call("PATCH", "today/notify", { cookie: gf, origin: TODAY, body: { mail: { inflite: true } } });
  assert.equal(r.s, 200, JSON.stringify(r.j));
  assert.deepEqual(r.j.mail, { inflite: true });
  assert.deepEqual((await notice({ kind: "new", thread: "t6" })).j.on, true, "the notice route reads the same");
  await settle();
  // (with another change at once: both kept)
  r = await call("PATCH", "today/notify", { cookie: gf, origin: TODAY, body: { mail: { inflite: false }, chat: { names: true } } });
  assert.deepEqual(r.j.mail, { inflite: false });
  assert.equal(r.j.chat.names, true);
  // (anyone else: refused, nothing changed; and their answer says nothing of Mail)
  r = await call("PATCH", "today/notify", { cookie: bo, origin: TODAY, body: { mail: { inflite: true }, chat: { names: true } } });
  assert.equal(r.s, 403);
  assert.equal((await call("GET", "today/notify", { cookie: bo, origin: TODAY })).j.chat.names, false, "nothing of the refused change kept");
  assert.equal((await call("GET", "today/notify", { cookie: bo, origin: TODAY })).j.mail, null);
  for (const mail of [true, null, [], { inflite: "yes" }, {}]) assert.equal((await call("PATCH", "today/notify", { cookie: gf, origin: TODAY, body: { mail } })).s, 400, JSON.stringify(mail));
  assert.deepEqual((await notice({ kind: "new", thread: "t7" })).j, { on: false, will: 0, held: false });
});

test("fromMail: InFlite's own origins for the hand-back alone; signing out only from Mail", async () => {
  // (a hand-back with a code that isn't one: past fromMail, refused by the hand-back itself)
  for (const origin of [MAILO, TODAY]) {
    const r = await call("POST", "mail/handback", { origin, body: { code: "x", verifier: "y" } });
    assert.notEqual(r.s, 403, origin);
  }
  for (const origin of ["http://chat.ifl.test:8788", "http://ifl.test:8788.evil.test", "https://inflite.ai", "null", undefined]) {
    const r = await call("POST", "mail/handback", { origin, body: { code: "x", verifier: "y" } });
    assert.equal(r.s, 403, String(origin));
  }
  assert.equal((await call("POST", "mail/signout", { origin: TODAY, cookie: gf })).s, 403, "sign-out: Mail's own page only");
});

test("Mail's card on Today: the admin's alone, asked with the key, numbers only; anything but a 200 with numbers is none", async () => {
  mailSays = () => Response.json({ people: 3, updates: 5, later: { n: 2, next: t0 + 3600e3 }, subject: "SECRET" });
  asked = [];
  const card = await mailCard(env, { id: "gf" });
  assert.deepEqual(card, { state: "ok", href: `${OWN}/`, people: 3, updates: 5, later: { n: 2, next: t0 + 3600e3, href: `${OWN}/#later` } });
  assert.deepEqual(asked, [{ url: `${VIA}/api/connector/card`, auth: `Bearer ${KEY}`, cookie: null }], "Mail's Worker, with the key and no cookie");
  // (Mail's own address, the test site's, where there's no stand-in)
  const req = new Request("http://account.ifl.test:8788/api/account/today/cards");
  asked = [];
  const { MAIL_VIA, ...noVia } = env;
  assert.equal((await mailCard(noVia, { id: "gf" }, req)).href, `${MAILO}/`);
  assert.equal(asked[0].url, `${MAILO}/api/connector/card`);
  // (no key, or anyone but the admin: none, and Mail never asked)
  asked = [];
  assert.equal(await mailCard({ ...env, MAIL_KEY: "" }, { id: "gf" }), null);
  assert.equal(await mailCard(env, { id: "bo" }), null);
  assert.deepEqual(asked, []);
  // (Mail before 1.49: 401; or an error, a page, numbers that aren't: none)
  for (const say of [() => Response.json({ error: "no" }, { status: 401 }), () => new Response("<html>", { headers: { "Content-Type": "text/html" } }), () => Response.json({}, { status: 500 }),
    () => Response.json({ people: -1, updates: 0, later: { n: 0, next: null } }), () => Response.json({ people: 1.5, updates: 0, later: { n: 0, next: null } }),
    () => Response.json({ people: "3", updates: 0, later: { n: 0, next: null } }), () => Response.json({ people: 1, updates: 0 }), () => Response.json({ people: 1, updates: 0, later: { n: 1, next: "soon" } }),
    () => Response.json([1, 2]), () => { throw new Error("down"); }, () => new Response(null, { status: 302, headers: { Location: "https://evil.test/" } })]) {
    mailSays = say;
    assert.equal(await mailCard(env, { id: "gf" }), null, String(say));
  }
  // (and never longer than its 700 ms)
  mailSays = () => new Promise(() => {});
  const t = Date.now();
  assert.equal(await mailCard(env, { id: "gf" }), null);
  assert.ok(Date.now() - t < MAIL_CARD_MS + 400, `${Date.now() - t} ms`);
  // (and a slow database, asked who the admin is: the same clock, from the moment the card's asked; Mail never asked)
  mailSays = () => Response.json({ people: 3, updates: 5, later: { n: 0, next: null } });
  const slow = { ...env, DB: { ...env.DB, prepare: (sql) => { const st = env.DB.prepare(sql); if (!/admin_user/.test(sql)) return st;
    return { ...st, first: () => new Promise((done) => setTimeout(() => done(st.first()), MAIL_CARD_MS + 600)) }; } } };
  asked = [];
  const t2 = Date.now();
  assert.equal(await mailCard(slow, { id: "gf" }), null);
  assert.ok(Date.now() - t2 < MAIL_CARD_MS + 300, `${Date.now() - t2} ms`);
  await new Promise((done) => setTimeout(done, 700));
  assert.deepEqual(asked, [], "past its time, Mail's not asked after all");
  // (nothing in Later: no next said)
  assert.deepEqual(cardOf({ people: 0, updates: 0, later: { n: 0, next: t0 } }, "https://email.inflite.ai").later, { n: 0, next: null, href: "https://email.inflite.ai/#later" });
});

test("Today's day: Mail's card among the cards and its line on Apps, where Mail answered; else none, and false as before", async () => {
  const U = { id: "gf", name: "gf", notify_prefs: "{}" }, at = Date.now();
  mailSays = () => Response.json({ people: 3, updates: 5, later: { n: 0, next: null } });
  let cards = {};
  let d = await dayFor(env, U, at, cards, { tz: "Europe/London" });
  assert.equal(d.apps.mail, "3 from people");
  assert.deepEqual(cards.mail, { state: "ok", href: `${OWN}/`, people: 3, updates: 5, later: { n: 0, next: null, href: `${OWN}/#later` } });
  assert.ok(!("mail" in d), "the card is among the cards, not one of the day's keys");
  mailSays = () => Response.json({ people: 0, updates: 2, later: { n: 0, next: null } });
  d = await dayFor(env, U, at, cards = {}, { tz: "Europe/London" });
  assert.equal(d.apps.mail, "All caught up");
  mailSays = () => Response.json({ error: "Sign in" }, { status: 401 });
  d = await dayFor(env, U, at, cards = {}, { tz: "Europe/London" });
  assert.equal(d.apps.mail, false);
  assert.ok(!("mail" in cards));
  // (the card hidden in the admin's Edit: Mail not asked)
  mailSays = () => Response.json({ people: 3, updates: 5, later: { n: 0, next: null } });
  run("INSERT OR REPLACE INTO td_prefs (user_id, cards, updated) VALUES ('gf', ?, 1)", JSON.stringify({ order: ["weather", "chat", "fitness", "markets", "mail"], hidden: ["mail"] }));
  asked = [];
  d = await dayFor(env, U, at, cards = {}, { tz: "Europe/London" });
  assert.equal(d.apps.mail, false);
  assert.ok(!("mail" in cards));
  assert.deepEqual(asked, []);
  run("DELETE FROM td_prefs WHERE user_id = 'gf'");
  // (anyone else: Mail never asked)
  asked = [];
  d = await dayFor(env, { id: "bo", name: "bo", notify_prefs: "{}" }, at, cards = {}, { tz: "Europe/London" });
  assert.equal(d.apps.mail, false);
  assert.deepEqual(asked, []);
});

test("Mail a card a saved order may name, never added to one (the account's page and data say the four), never a line of the morning", async () => {
  assert.deepEqual(CARDS, ["weather", "chat", "fitness", "markets", "mail"]);
  assert.deepEqual(LINES, ["weather", "chat", "fitness", "markets"]);
  run("DELETE FROM td_prefs WHERE user_id = 'bo'");
  assert.deepEqual((await todayPrefs(env, "bo")).cards, { order: LINES, hidden: [] }, "a new account: the four, as before");
  run("INSERT OR REPLACE INTO td_prefs (user_id, cards, updated) VALUES ('bo', ?, 1)", JSON.stringify({ order: ["markets", "weather", "chat", "fitness"], hidden: [] }));
  assert.deepEqual((await todayPrefs(env, "bo")).cards.order, ["markets", "weather", "chat", "fitness"], "a saved order of the four: Mail not added");
  // (the account's own page, for anyone but the admin: the four, so its About Today sheet says "4 of 4", as before; and
  // the account's data the same)
  const me = await call("GET", "me", { cookie: bo });
  assert.equal(me.s, 200);
  assert.deepEqual(me.j.apps.today.order, ["markets", "weather", "chat", "fitness"]);
  assert.equal(me.j.apps.today.order.length, 4);
  assert.deepEqual(me.j.apps.today.hidden, []);
  assert.deepEqual((await todayExport(env, "bo")).cards, { order: ["markets", "weather", "chat", "fitness"], hidden: [] });
  // (where the admin's Edit saves Mail's place, or hides it, it's kept: Today's page puts a card the order doesn't name
  // at its end)
  let r = await savePrefs(env, "gf", { order: ["mail", "chat"], hidden: ["mail", "nope"] });
  assert.deepEqual(r.cards, { order: ["mail", "chat", "weather", "fitness", "markets"], hidden: ["mail"] });
  r = await savePrefs(env, "gf", { order: ["chat"], hidden: [] });
  assert.deepEqual(r.cards, { order: ["chat", "weather", "fitness", "markets"], hidden: [] });
  run("DELETE FROM td_prefs WHERE user_id = 'gf'");
  // (a line for Mail: not one the morning has)
  r = await saveMorning(env, "bo", { lines: { mail: false, chat: false } });
  assert.deepEqual(r.m_lines, { chat: false });
});

// ---- You's Mail Notifications sheet (the inflite repo's today/public/mailnotify.js), in a page made up for it: the
// account's switch through Today's own /api/notify; each address's through Mail's own /api/notify from Mail's address,
// only with Mail's switch on here; else the words that send you to Mail Settings ----
const NOTIFY = new URL("../../../../inflite/today/public/mailnotify.js", import.meta.url);
const { existsSync } = await import("node:fs");
const sheetSkip = !existsSync(NOTIFY) && "the inflite repo isn’t beside this one";
const mn = sheetSkip ? {} : await import(NOTIFY);
// (just enough of InFlite's builders: each a plain node, its words kept as text, a switch's onChange kept to call)
function fakeUi() {
  const node = (tag, o = {}, kids = []) => ({ tag, ...o, kids: kids.flat().filter(Boolean), dataset: {}, querySelector: (s) => (s === "input" ? node.box : null) });
  const box = () => ({ checked: false, disabled: false });
  return {
    el: (tag, a = {}, ...k) => node(tag, { cls: a.class, text: a.text }, k),
    row: (o) => { const n = node("row", { title: o.title, sub: o.sub, checked: o.checked, onChange: o.onChange }); const b = box(); b.checked = !!o.checked; n.querySelector = (s) => (s === "input" ? b : null); n.box = b; return n; },
    list: (rows, o = {}) => node("list", { label: o.label }, rows),
    btn: (text, o = {}) => node("btn", { text, run: o.run }),
  };
}
function sheetPage() {
  const body = { kids: [], replaceChildren(...k) { this.kids = k; } };
  const sheet = { open: false, querySelector: (s) => (s === "#mlnBody" ? body : null) };
  globalThis.document = { getElementById: (id) => (id === "sh-mailnotify" ? sheet : null) };
  return { sheet, body };
}
const flat = (n) => (!n ? [] : [n, ...(n.kids || []).flatMap(flat)]);
const texts = (body) => body.kids.flatMap(flat).map((n) => n.text || n.title).filter(Boolean);

test("Mail Notifications: Through InFlite from Today's own /api/notify, each address from Mail's own address, while Mail's switch is on", { skip: sheetSkip }, async () => {
  const was = globalThis.location;
  globalThis.location = { protocol: "https:", host: "next.inflite.ai", origin: "https://next.inflite.ai", assign: () => {} };
  try {
    assert.equal(mn.mailOrigin(), "https://email.inflite.ai");
    const { sheet, body } = sheetPage(), seen = [], toasts = [];
    let inflite = false, notify = true;
    const f = async (url, o) => {
      seen.push({ url, method: o.method, credentials: o.credentials, xi: o.headers["X-Inflite"] || null, body: o.body ? JSON.parse(o.body) : null });
      if (url === "/api/notify") { if (o.method === "PATCH") inflite = JSON.parse(o.body).mail.inflite; return Response.json({ mail: { inflite }, today: { devices: 0 } }); }
      if (url === "https://email.inflite.ai/api/notify") { if (o.method === "PATCH") notify = JSON.parse(o.body).notify; return Response.json({ on: 1, addresses: [{ email: "hello@inflite.ai", name: "Hello", notify }, { email: "not an address", notify: true }] }); }
      return new Response("{}", { status: 404 });
    };
    const F = { ui: fakeUi(), toast: (t) => toasts.push(t), session: { view: { apps: { mail: true } }, hub: true, apps: { mail: true } }, sheet: { openEl: (d) => { d.open = true; return { close() { d.open = false; } }; } } };
    const st = (mn.notifyTest.fetch = f, await mn.openMailNotify(F));
    assert.equal(sheet.open, true);
    assert.deepEqual(st.mine, { inflite: false, devices: 0 });
    assert.deepEqual(st.mail, [{ email: "hello@inflite.ai", name: "Hello", notify: true }], "only real addresses");
    assert.deepEqual(seen.map((s) => [s.url, s.method, s.credentials]), [["/api/notify", "GET", "same-origin"], ["https://email.inflite.ai/api/notify", "GET", "include"]]);
    assert.ok(texts(body).includes(mn.WORDS.off));
    // (Through InFlite on: Today's PATCH, with X-Inflite; then the hint, as no device of InFlite's is on)
    const rows = body.kids.flatMap(flat).filter((n) => n.tag === "row");
    seen.length = 0;
    await rows.find((r) => r.title === "Through InFlite").onChange(true);
    assert.deepEqual(seen, [{ url: "/api/notify", method: "PATCH", credentials: "same-origin", xi: "1", body: { mail: { inflite: true } } }]);
    assert.equal(st.mine.inflite, true);
    // (an address off: Mail's own PATCH, by CORS, with X-Inflite and only the address and its switch)
    seen.length = 0;
    const addr = rows.find((r) => r.title === "Hello");
    await addr.onChange(false);
    assert.deepEqual(seen, [{ url: "https://email.inflite.ai/api/notify", method: "PATCH", credentials: "include", xi: "1", body: { email: "hello@inflite.ai", notify: false } }]);
    assert.equal(addr.box.checked, false);
    // (Mail's switch off here: Mail never asked; the words that send you to Mail Settings, and Open Mail)
    sheet.open = false; seen.length = 0;
    const off = (mn.notifyTest.fetch = f, await mn.openMailNotify({ ...F, session: { ...F.session, apps: { mail: false } } }));
    assert.deepEqual(seen.map((s) => s.url), ["/api/notify"]);
    assert.equal(off.mail, null);
    assert.ok(texts(body).includes("Choose which addresses notify you in Mail Settings."));
    assert.ok(body.kids.flatMap(flat).some((n) => n.tag === "btn" && n.text === "Open Mail"));
    // (Open Mail, with the sheet open already as it's asked (You's row opened it): put away, then Mail at its settings)
    // (Mail's switch off here: the hub's framed /mail/, the page's own address; on, Mail's module, through nav.go)
    const went = [];
    globalThis.location.assign = (p) => went.push(["assign", p, sheet.open]);
    const opened = { ...F, session: { ...F.session, apps: { mail: false } }, nav: { go: (p) => went.push(["go", p, sheet.open]) } };
    sheet.open = true;
    (mn.notifyTest.fetch = f, await mn.openMailNotify(opened));
    body.kids.flatMap(flat).find((n) => n.tag === "btn" && n.text === "Open Mail").run();
    sheet.open = true;
    (mn.notifyTest.fetch = async (url, o) => (url === "/api/notify" ? f(url, o) : Response.json({ addresses: [] })), await mn.openMailNotify({ ...opened, session: F.session }));
    body.kids.flatMap(flat).find((n) => n.tag === "btn" && n.text === "Open Mail").run();
    assert.deepEqual(went, [["assign", "/mail/#settings", false], ["go", "/mail/#settings", false]], "the sheet closed before Mail's shown");
    // (signed out meanwhile: Through InFlite's change answered 401 → the page's signed-out path, and the switch as it was)
    sheet.open = false;
    let lost = 0;
    const out = { ...F, session: { ...F.session, lost: async () => { lost++; return true; } } };
    const st2 = (mn.notifyTest.fetch = async (url, o) => (o.method === "PATCH" ? Response.json({ error: "Sign in" }, { status: 401 }) : f(url, o)), await mn.openMailNotify(out));
    const through = body.kids.flatMap(flat).find((n) => n.tag === "row" && n.title === "Through InFlite");
    await through.onChange(!st2.mine.inflite);
    assert.equal(lost, 1);
    assert.equal(through.box.checked, st2.mine.inflite);
    // (anyone but the admin, as Today's server said: said so, nothing to switch, no Open Mail)
    sheet.open = false;
    (mn.notifyTest.fetch = async (url) => (url === "/api/notify" ? Response.json({ mail: null }) : new Response("{}", { status: 401 })), await mn.openMailNotify({ ...F, session: { hub: true, apps: { mail: true } } }));
    assert.deepEqual(texts(body), [mn.WORDS.notAdmin]);
    // (and where the page knows it's not the admin (view.apps.mail false), even with Mail's switch on: nothing asked at
    // all, of Mail or of Today (S4-D21))
    sheet.open = false; seen.length = 0;
    (mn.notifyTest.fetch = f, await mn.openMailNotify({ ...F, session: { view: { apps: { mail: false } }, hub: true, apps: { mail: true } } }));
    assert.deepEqual(seen, []);
    assert.equal(sheet.open, true);
    assert.deepEqual(texts(body), [mn.WORDS.notAdmin]);
    assert.deepEqual(toasts, []);
  } finally { globalThis.location = was; delete globalThis.document; mn.notifyTest.fetch = null; }
});
