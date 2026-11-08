// Instant Chat on the server, run as it is against a database of its own (Node's own SQLite in memory, made to look
// like D1, with the site's schema): messages that arrive as they're sent, beside letters that still fly; turns, streaks,
// lofts and records for letters only; the push at send, quiet hours, an open chat and a planned ride holding it; groups; reactions;
// typing held only in the memory of the Typing object (a real one, workers/live, behind a stand-in for the binding); the
// pulse's change feed, delivered and read, its cost, pace and throttle; each chat's way and its lines; what goes and
// what's counted; and the new setUp over a database from before this release, and a fresh one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { db, issueSession, msgView, hex, sha256 } from "../../../functions/_pigeon.js";
import { onRequest, ADMIN_ROUTES } from "../../../functions/api/pigeon/[[path]].js";
import { tick, pushBurst, openOn, friendRequested } from "../../../functions/_notify.js";
import { heldCount } from "../../../functions/_busy.js";
import { fitdb } from "../../../functions/_fitness.js";
import { timesReady } from "../../../functions/_fittimes.js";
import { offersReady } from "../../../functions/_fitshare.js";
import { tddb } from "../../../functions/_today.js";
import { streakTick } from "../../../functions/_streaks.js";
import { keepMonth } from "../../../functions/_retention.js";
import { logFor } from "../../../functions/_stats.js";
import { insights } from "../../../functions/_insights.js";
import { removeAccount } from "../../../functions/_accounts.js";
import { typingMap, Typing } from "../../../workers/live/index.js";
const TYPING_MS = 6000;               // (an entry lives 6 s after its last word: workers/live)

// ---- D1, as much of it as the server uses: prepare, bind, first, all, run, raw, and batch (all or nothing) ----
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

// ---- the typing binding, stood in for: a real Typing object per name, its fetch as the binding's ----
const objects = new Map();
let typingBroken = null;            // "throw" or "hang": every call to the binding does that
const TYPING = {
  idFromName: (name) => name,
  get: (id) => ({ fetch: async (url, init) => {
    if (typingBroken === "throw") throw new Error("down");
    if (typingBroken === "hang") return new Promise(() => {});
    if (!objects.has(id)) objects.set(id, new Typing({}, {}));
    return objects.get(id).fetch(new Request(url, init));
  } }),
};

// ---- the push services, stood in for: each push kept and opened with its phone's own keys ----
const PUSH = "http://push.test/push";
const wc = crypto.subtle, te = new TextEncoder();
const hkdf = async (salt, ikm, info, len) => new Uint8Array(await wc.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, await wc.importKey("raw", ikm, "HKDF", false, ["deriveBits"]), len * 8));
async function phone(n) {
  const kp = await wc.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]), auth = crypto.getRandomValues(new Uint8Array(16));
  const pub = new Uint8Array(await wc.exportKey("raw", kp.publicKey));
  return { endpoint: `https://fcm.googleapis.com/fcm/send/instant-${n}`, p256dh: Buffer.from(pub).toString("base64url"), auth: Buffer.from(auth).toString("base64url"), kp, pub, authBytes: auth };
}
async function opened(ph, buf) {
  const salt = buf.slice(0, 16), n = buf[20], asPub = buf.slice(21, 21 + n), ct = buf.slice(21 + n);
  const shared = new Uint8Array(await wc.deriveBits({ name: "ECDH", public: await wc.importKey("raw", asPub, { name: "ECDH", namedCurve: "P-256" }, false, []) }, ph.kp.privateKey, 256));
  const ikm = await hkdf(ph.authBytes, shared, new Uint8Array([...te.encode("WebPush: info\0"), ...ph.pub, ...asPub]), 32);
  const key = await wc.importKey("raw", await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16), "AES-GCM", false, ["decrypt"]);
  const pt = new Uint8Array(await wc.decrypt({ name: "AES-GCM", iv: await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12) }, key, ct));
  let end = pt.length - 1; while (end > 0 && pt[end] === 0) end--;
  return JSON.parse(new TextDecoder().decode(pt.slice(0, end)));
}
let pushes = [], fetched = [];
const realFetch = globalThis.fetch, said = console.error;
globalThis.fetch = async (url, o = {}) => {
  const u = String(url);
  if (u === PUSH) { pushes.push({ endpoint: o.headers["X-Endpoint"], urgency: o.headers.Urgency, body: new Uint8Array(o.body) }); return new Response("", { status: 201 }); }
  fetched.push(u);
  return new Response("{}", { status: 404 });
};
console.error = () => {};
test.after(() => { globalThis.fetch = realFetch; console.error = said; });

const env = { DB: d1(), WX_TRAFFIC_TICK: "0", PIGEON_PUSH_URL: PUSH, TYPING };
const D = await db(env), S = env.DB.sql;
// (the minute tick from traffic held off, so only the tests' own ticks run; and notifications live from long ago)
S.prepare("INSERT OR REPLACE INTO pg_meta (k, v) VALUES ('tick', '99999999999999'), ('notify_since', '0')").run();
const q = (sql, ...a) => S.prepare(sql).all(...a), one = (sql, ...a) => S.prepare(sql).get(...a), run = (sql, ...a) => S.prepare(sql).run(...a);
const put = (table, row) => S.prepare(`INSERT INTO ${table} (${Object.keys(row).join(", ")}) VALUES (${Object.keys(row).map(() => "?").join(", ")})`).run(...Object.values(row).map((v) => (v === undefined ? null : typeof v === "boolean" ? Number(v) : v)));

let n = 0;
const uid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
// someone (pigeons on, as every account from before; lat: a location; x: any other column), signed in
async function person(name, x = {}) {
  const id = uid();
  put("pg_users", { id, handle: `h${n}`, name, email: `${id}@example.com`, pub: "{}", salt: "s", proof_hash: "p", vault: "v", swift: 9, swift_at: 0, created_at: 0, lat: 51.5, lon: -0.12, ...x });
  return { id, name, token: await issueSession(env, id, new Request("http://localhost/")) };
}
// another sign-in of theirs (each pulse from a fresh one, so the 1-second throttle doesn't come into it)
const again = async (p) => ({ ...p, token: await issueSession(env, p.id, new Request("http://localhost/")) });
const befriend = (a, b) => put("pg_links", { a: a.id, b: b.id, status: "ok", created_at: 0 });
// a phone with push on, for their current sign-in
async function pushOn(p, prefs = {}) {
  const ph = await phone(p.id);
  put("pg_push", { endpoint: ph.endpoint, user_id: p.id, session: hex(await sha256(p.token)), p256dh: ph.p256dh, auth: ph.auth, created_at: Date.now() });
  run("UPDATE pg_users SET notify_prefs = ? WHERE id = ?", JSON.stringify(prefs), p.id);
  p.phone = ph;
  return p;
}
const told = async (p) => { const out = []; for (const x of pushes.filter((y) => y.endpoint === p.phone.endpoint)) out.push({ ...(await opened(p.phone, x.body)), urgency: x.urgency }); return out; };

// the API, as an app asks it
const later = [];
async function api(p, method, path, body, e = env) {
  const request = new Request(`http://localhost/api/pigeon/${path}`, { method, headers: { Authorization: `Bearer ${p.token}`, "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.9" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const res = await onRequest({ request, env: e, waitUntil: (x) => later.push(x), params: {} });
  await Promise.allSettled(later.splice(0));
  return { status: res.status, body: await res.json().catch(() => null), trips: Number(res.headers.get("X-DB-Trips")) };
}
const CT = "sealed-words-sealed-words";
const send = (a, b, x = {}) => api(a, "POST", "messages", { id: crypto.randomUUID(), to: b.id, ct: CT, ...x });
const msgRow = (id) => one("SELECT * FROM pg_msgs WHERE id = ?", id);
const friendOf = async (p, other) => (await api(p, "GET", "sync")).body.friends.find((f) => f.id === other.id);
const pulse = async (p, b) => api(await again(p), "POST", "pulse", { since: Date.now() - 60e3, ...b });

// ================================ sending ================================
test("instant send: lands at once, no flight, no turn, no loft, no location", async () => {
  const mira = await person("Mira", { lat: null, lon: null }), leo = await person("Leo"); befriend(mira, leo);
  fetched = [];
  const r = await send(mira, leo, { instant: true, pigeon: "rocket", route: "scenic", noShip: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const m = msgRow(r.body.message.id);
  assert.equal(m.instant, 1); assert.equal(m.sent_at, m.deliver_at); assert.equal(m.km, 0); assert.equal(m.stamped, 1);
  for (const c of ["from_lat", "from_lon", "to_lat", "to_lon", "from_place", "to_place", "legs", "wx", "pigeon", "bird", "style", "noship", "lost_at", "sched", "got_at"]) assert.equal(m[c], null, c);
  assert.equal(m.swift, 0); assert.equal(m.risky, 0);
  const me = one("SELECT swift, turbo, rocket, mystery FROM pg_users WHERE id = ?", mira.id);
  assert.deepEqual({ ...me }, { swift: 9, turbo: null, rocket: null, mystery: null }, "no loft touched");
  assert.deepEqual(fetched, [], "no weather asked for, nor anything else");
  assert.equal(r.body.streak, undefined, "no streak in the answer");
  assert.equal(r.body.message.instant, true); assert.equal(r.body.message.flying, false);
  assert.equal(q("SELECT 1 FROM pg_streaks WHERE a IN (?1, ?2) AND b IN (?1, ?2)", mira.id, leo.id).length, 0);
});

test("instant send: letters only take turns", async () => {
  const ann = await person("Ann"), ben = await person("Ben", { lat: null, lon: null }); befriend(ann, ben);
  const l = await send(ann, ben, {});
  assert.equal(l.status, 200, JSON.stringify(l.body));
  assert.equal(msgRow(l.body.message.id).instant, null, "no instant: a letter");
  assert.equal((await send(ben, ann, { instant: true })).status, 200);
  assert.equal((await friendOf(ann, ben)).turn.state, "outbound", "Ann's letter still flies: her turn's gone");
  assert.equal((await friendOf(ben, ann)).turn.state, "inbound", "Ben's message took no turn");
  run("UPDATE pg_msgs SET deliver_at = ? WHERE id = ?", Date.now() - 1000, l.body.message.id);
  assert.equal((await friendOf(ann, ben)).turn.state, "theirs");
  assert.equal((await friendOf(ben, ann)).turn.state, "sill", "the letter landed: Ben's turn, his message notwithstanding");
  // (the rival check: a message between the two letters isn't a pigeon that took off in the meantime)
  run("UPDATE pg_users SET lat = 48.85, lon = 2.35 WHERE id = ?", ben.id);
  assert.equal((await send(ben, ann, { instant: true })).status, 200);
  const back = await send(ben, ann, { pigeon: "standard" });
  assert.equal(back.status, 200, JSON.stringify(back.body));
  assert.equal(back.body.message.pigeon, "standard");
});

test("instant send: via refused, bad landAt refused, absent instant is a letter", async () => {
  const a = await person("Ada", { lat: null, lon: null }), b = await person("Bo"); befriend(a, b);
  let r = await send(a, b, { instant: true, via: b.id, viaCt: CT });
  assert.deepEqual([r.status, r.body.error], [400, "A message can’t stop over. Send it by pigeon to stop over."]);
  for (const landAt of [Date.now() - 1000, Date.now() + 31 * 864e5, "soon"]) {
    r = await send(a, b, { instant: true, landAt });
    assert.deepEqual([r.status, r.body.error], [400, "Pick a time in the next 30 days."], String(landAt));
  }
  for (const instant of [undefined, "true", 1, false]) {
    r = await send(a, b, { instant });
    assert.deepEqual([r.status, r.body.error], [409, "Set your location in Account before sending pigeons."], `instant: ${instant} is a letter`);
  }
  const stranger = await person("Cy");
  r = await send(a, stranger, { instant: true });
  assert.deepEqual([r.status, r.body.error], [403, "You can only send messages to friends."]);
});

test("group send: a repeated id says \"already sent\", and the 1:1 instant send too", async () => {
  const a = await person("Ari"), b = await person("Bea"); befriend(a, b);
  const id = crypto.randomUUID();
  assert.equal((await send(a, b, { id, instant: true })).status, 200);
  const r = await send(a, b, { id, instant: true });
  assert.deepEqual([r.status, r.body.error], [409, "That scroll was already sent."]);
  const gid = crypto.randomUUID();
  put("pg_groups", { id: gid, name: "Pals", created_by: a.id, created_at: 0 });
  for (const m of [a, b]) put("pg_group_members", { group_id: gid, user_id: m.id, added_by: a.id, joined_at: 0 });
  const keys = { [a.id]: "k".repeat(30), [b.id]: "k".repeat(30) }, gm = crypto.randomUUID();
  assert.equal((await api(a, "POST", "group-messages", { id: gm, group: gid, body: CT, keys, instant: true })).status, 200);
  const g = await api(a, "POST", "group-messages", { id: gm, group: gid, body: CT, keys, instant: true });
  assert.deepEqual([g.status, g.body.error], [409, "That message was already sent."]);
  const t = await api(a, "POST", "group-messages", { id: crypto.randomUUID(), group: gid, body: CT, keys, instant: true, landAt: Date.now() + 60e3 });
  assert.deepEqual([t.status, t.body.error], [400, "Pick when it arrives in a chat with one friend."]);
});

test("scheduled instant: hidden until its time, cancellable, told silently", async () => {
  pushBurst.clear();
  const a = await person("Amy", { lat: null, lon: null }), b = await pushOn(await person("Bob"), { names: true, takeoff: true }); befriend(a, b);
  const at = Date.now() + 3600e3;
  const r = await send(a, b, { instant: true, landAt: at });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const m = msgRow(r.body.message.id);
  assert.deepEqual([m.sent_at, m.deliver_at, m.sched, m.instant], [at, at, 1, 1]);
  assert.equal(r.body.message.waiting, true); assert.equal(r.body.message.flying, false, "never flying, even waiting");
  assert.ok(!(await api(b, "GET", `messages?with=${a.id}`)).body.messages.some((x) => x.id === m.id), "not there for them before its time");
  assert.ok((await api(a, "GET", `messages?with=${b.id}`)).body.messages.some((x) => x.id === m.id), "there for its sender");
  const c = await api(a, "POST", "recall", { id: m.id });
  assert.equal(c.status, 200, JSON.stringify(c.body)); assert.equal(c.body.cancelled, m.id); assert.equal(msgRow(m.id), undefined);
  // another, its time come (as the clock would bring it): the tick takes it off silently and tells it as a message
  const r2 = await send(a, b, { instant: true, landAt: Date.now() + 3600e3 }), id2 = r2.body.message.id, now = Date.now() - 1000;
  run("UPDATE pg_msgs SET sent_at = ?1, deliver_at = ?1 WHERE id = ?2", now, id2);
  pushes = [];
  await tick(env, "http://localhost");
  assert.equal(msgRow(id2).sched, 2, "taken off");
  const notes = await told(b);
  assert.deepEqual(notes.map((x) => [x.title, x.body, x.tag]), [["Amy", "Sent you a message.", `msg-${a.id}`]], "a message's words, and no take-off push");
  const late = await api(a, "POST", "recall", { id: id2 });
  assert.deepEqual([late.status, late.body.error], [409, "That message has already been sent."]);
});

test("msgView: an older Chat sees a landed letter", () => {
  const t = Date.now();
  const row = { id: "m1", sender: "s", recipient: "r", ct: CT, km: 0, swift: 0, pigeon: null, sent_at: t - 1000, deliver_at: t - 1000, instant: 1, stamped: 1, photo: 0 };
  const v = msgView("r", row, t);
  assert.equal(v.pigeon, "standard"); assert.equal(v.flying, false); assert.equal(v.deliverAt, v.sentAt); assert.equal(v.route, null);
  assert.deepEqual(v.legs, []); assert.equal(v.ct, CT); assert.equal(v.instant, true); assert.equal(v.delivered, false); assert.equal(v.gotAt, null);
  // (one booked for later, still waiting: never flying, to its sender's older copy of Chat either)
  const w = msgView("s", { ...row, sent_at: t + 6e4, deliver_at: t + 6e4, sched: 1 }, t);
  assert.equal(w.flying, false); assert.equal(w.waiting, true);
  assert.equal(msgView("s", { ...row, got_at: t - 500 }, t).delivered, true);
});

test("letters to pigeons-off people still fly and stay sealed", async () => {
  const a = await person("Ivy"), b = await person("Jo", { pigeons: 0, new_way: "instant", lat: null, lon: null }); befriend(a, b);
  const r = await send(a, b, {});
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const m = msgRow(r.body.message.id), t = Date.now();
  assert.ok(m.deliver_at > t, "it flies"); assert.equal(m.instant, null);
  const theirs = (await api(b, "GET", `messages?with=${a.id}`)).body.messages.find((x) => x.id === m.id);
  assert.equal(theirs.ct, null, "sealed until it lands"); assert.equal(theirs.flying, true);
  const before = q("SELECT * FROM pg_msgs WHERE sender = ?1 OR recipient = ?1 ORDER BY id", a.id);
  const off = await api(a, "PATCH", "me", { pigeons: false });
  assert.equal(off.status, 200); assert.equal(off.body.me.pigeons, false);
  assert.deepEqual(q("SELECT * FROM pg_msgs WHERE sender = ?1 OR recipient = ?1 ORDER BY id", a.id), before, "every row byte for byte the same");
});

test("streaks: letters only, warnings only with pigeons on", async () => {
  const a = await pushOn(await person("Kai"), { streaks: true }), b = await pushOn(await person("Lu", { pigeons: 0 }), { streaks: true }); befriend(a, b);
  assert.equal((await send(a, b, { instant: true })).status, 200);
  const pair = [a.id, b.id].sort();
  assert.equal(q("SELECT 1 FROM pg_streaks WHERE a = ? AND b = ?", ...pair).length, 0, "an instant send writes no streak");
  // (the backfill, as it runs on a database without streaks yet: instant rows don't count)
  const fresh = await import(`../../../functions/_streaks.js?backfill=${Date.now()}`);
  const x = await person("Mo"), y = await person("Ned"), day = 864e5, t = Date.now();
  for (let i = 1; i <= 4; i++) put("pg_msgs", { id: crypto.randomUUID(), sender: x.id, recipient: y.id, ct: CT, km: 0, sent_at: t - i * day, deliver_at: t - i * day, instant: 1 });
  run("DELETE FROM pg_meta WHERE k = 'streaks_v1'");
  await fresh.ensureStreaks(D);
  assert.equal(q("SELECT 1 FROM pg_streaks WHERE a = ? AND b = ?", ...[x.id, y.id].sort()).length, 0, "ensure() ignores instant rows");
  // a three-day streak, warned of: only to the side with pigeons on
  const today = Math.floor(t / day);
  put("pg_streaks", { a: pair[0], b: pair[1], start: today - 3, last: today - 1, best: 3 });
  pushes = [];
  await streakTick({ ...env, PIGEON_STREAK_ANYTIME: "1" }, D, t);
  assert.equal((await told(a)).length, 1, "the pigeons-on side warned");
  assert.equal((await told(b)).length, 0, "not the pigeons-off side");
  assert.equal((await friendOf(b, a)).streak, null, "no streak in sync for a pigeons-off viewer");
  assert.notEqual((await friendOf(a, b)).streak, null);
});

// ================================ notifications ================================
test("push at send: words, names, quiet hours, open chat, the messages switch", async () => {
  pushBurst.clear();
  const mira = await person("Mira Shah"), leo = await pushOn(await person("Leo"), { names: true }); befriend(mira, leo);
  pushes = [];
  const r1 = await send(mira, leo, { instant: true });
  assert.deepEqual((await told(leo)).map((x) => [x.title, x.body, x.tag, x.urgency]), [["Mira", "Sent you a message.", `msg-${mira.id}`, "high"]]);
  assert.ok(msgRow(r1.body.message.id).notified_at, "claimed, so the tick won't tell it again");
  // names off
  const ana = await person("Ana"), pat = await pushOn(await person("Pat"), {}); befriend(ana, pat);
  pushes = [];
  await send(ana, pat, { instant: true });
  assert.deepEqual((await told(pat)).map((x) => [x.title, x.body]), [["Chat", "You have a new message."]]);
  // quiet hours: not claimed; the tick tells it once they end, in the same words, urgency and tag (M5)
  const kim = await pushOn(await person("Kim"), { names: true, quiet: true, quietFrom: 0, quietTo: 23, tz: "UTC" }); befriend(mira, kim);
  run("UPDATE pg_users SET notify_prefs = ? WHERE id = ?", JSON.stringify({ names: true, quiet: true, quietFrom: new Date().getUTCHours(), quietTo: (new Date().getUTCHours() + 2) % 24, tz: "UTC" }), kim.id);
  pushes = []; pushBurst.clear();
  const r2 = await send(mira, kim, { instant: true });
  assert.equal(msgRow(r2.body.message.id).notified_at, null, "quiet: left for the tick");
  assert.equal((await told(kim)).length, 0);
  await tick(env, "http://localhost");
  assert.equal((await told(kim)).length, 0, "still quiet: still held");
  run("UPDATE pg_users SET notify_prefs = ? WHERE id = ?", JSON.stringify({ names: true }), kim.id);
  await tick(env, "http://localhost");
  assert.deepEqual((await told(kim)).map((x) => [x.title, x.body, x.tag, x.urgency]), [["Mira", "Sent you a message.", `msg-${mira.id}`, "high"]], "told once they end, as at send");
  await tick(env, "http://localhost");
  assert.equal((await told(kim)).length, 1, "and only once");
  // the chat open on their phone: not claimed, not pushed; the tick leaves it while it's open; then claims and pushes it
  const sam = await pushOn(await person("Sam"), { names: true }); befriend(mira, sam);
  run("UPDATE pg_users SET open_chat = ?, open_at = ? WHERE id = ?", mira.id, Date.now(), sam.id);
  assert.equal(openOn(one("SELECT open_chat, open_at FROM pg_users WHERE id = ?", sam.id), mira.id), true);
  pushes = []; pushBurst.clear();
  const r3 = await send(mira, sam, { instant: true });
  assert.equal(msgRow(r3.body.message.id).notified_at, null, "open: left for the tick");
  await tick(env, "http://localhost");
  assert.equal(msgRow(r3.body.message.id).notified_at, null, "still open, and under 5 minutes old: still left");
  assert.equal((await told(sam)).length, 0);
  run("UPDATE pg_users SET open_at = ? WHERE id = ?", Date.now() - 31e3, sam.id);
  await tick(env, "http://localhost");
  assert.ok(msgRow(r3.body.message.id).notified_at, "no longer open: claimed");
  assert.deepEqual((await told(sam)).map((x) => x.body), ["Sent you a message."]);
  // a burst: the second within 10 s claimed, not pushed; the next after that says how many are waiting
  const zoe = await pushOn(await person("Zoe"), { names: true }); befriend(mira, zoe);
  pushes = []; pushBurst.clear();
  const b1 = await send(mira, zoe, { instant: true });
  await api(zoe, "POST", "read", { with: mira.id });
  const b2 = await send(mira, zoe, { instant: true });
  assert.ok(msgRow(b2.body.message.id).notified_at, "claimed");
  assert.equal((await told(zoe)).length, 1, "not pushed within 10 s");
  for (const k of pushBurst.keys()) pushBurst.set(k, Date.now() - 11e3);
  await send(mira, zoe, { instant: true });
  assert.deepEqual((await told(zoe)).map((x) => x.body), ["Sent you a message.", "Sent you 2 messages."]);
  assert.ok(b1);
  // messages off: claimed, not pushed
  const quiet = await pushOn(await person("Una"), { names: true, messages: false }); befriend(mira, quiet);
  pushes = []; pushBurst.clear();
  const r4 = await send(mira, quiet, { instant: true });
  assert.ok(msgRow(r4.body.message.id).notified_at); assert.equal((await told(quiet)).length, 0);
});

test("tick: never \"A pigeon has landed\" for a message; letters keep it", async () => {
  pushBurst.clear();
  const a = await person("Rae"), b = await pushOn(await person("Sid"), { names: false }); befriend(a, b);
  const t = Date.now() - 2000;
  put("pg_msgs", { id: crypto.randomUUID(), sender: a.id, recipient: b.id, ct: CT, km: 0, sent_at: t, deliver_at: t, instant: 1, stamped: 1 });
  put("pg_msgs", { id: crypto.randomUUID(), sender: a.id, recipient: b.id, ct: CT, km: 300, sent_at: t - 3600e3, deliver_at: t, pigeon: "standard" });
  pushes = [];
  await tick(env, "http://localhost");
  const notes = (await told(b)).map((x) => [x.body, x.tag.split("-")[0]]).sort();
  assert.deepEqual(notes, [["A pigeon has landed.", "from"], ["You have a new message.", "msg"]]);
  // a pigeons-off recipient's letter: still "A pigeon has landed"
  const c = await pushOn(await person("Tia", { pigeons: 0 }), {}); befriend(a, c);
  put("pg_msgs", { id: crypto.randomUUID(), sender: a.id, recipient: c.id, ct: CT, km: 300, sent_at: t - 3600e3, deliver_at: t, pigeon: "standard" });
  pushes = [];
  await tick(env, "http://localhost");
  assert.deepEqual((await told(c)).map((x) => x.body), ["A pigeon has landed."]);
});

test("tick: what lands while its notification is held still pokes its chat, once", async () => {
  const pulseAt = (u, c) => one("SELECT at FROM pg_pulse WHERE user_id = ? AND chat = ?", u, c)?.at;
  // a message booked for now, its chat open on their phone (the notification waits): both phones poked as it's sent
  const a = await person("Amy", { lat: null, lon: null }), b = await person("Bob"); befriend(a, b);
  const r = await send(a, b, { instant: true, landAt: Date.now() + 3600e3 }), id = r.body.message.id, due = Date.now() - 1000;
  run("UPDATE pg_msgs SET sent_at = ?1, deliver_at = ?1 WHERE id = ?2", due, id);
  run("UPDATE pg_users SET open_chat = ?, open_at = ? WHERE id = ?", a.id, Date.now(), b.id);
  run("DELETE FROM pg_pulse WHERE user_id IN (?, ?)", a.id, b.id);
  await tick(env, "http://localhost");
  assert.deepEqual([msgRow(id).sched, msgRow(id).notified_at], [2, null], "sent, its notification held");
  assert.ok(pulseAt(b.id, a.id) >= due, "the recipient's chat poked"); assert.ok(pulseAt(a.id, b.id) >= due, "and the sender's");
  // a letter landing in the recipient's quiet hours: both poked, though no one's told
  const c = await person("Cat"), d = await person("Dan"); befriend(c, d);
  const h = new Date().getUTCHours();
  run("UPDATE pg_users SET notify_prefs = ? WHERE id = ?", JSON.stringify({ quiet: true, quietFrom: h, quietTo: (h + 2) % 24, tz: "UTC" }), d.id);
  const lid = crypto.randomUUID(), landed = Date.now() - 1000;
  put("pg_msgs", { id: lid, sender: c.id, recipient: d.id, ct: CT, km: 300, sent_at: landed - 3600e3, deliver_at: landed, pigeon: "standard" });
  run("DELETE FROM pg_pulse WHERE user_id IN (?, ?)", c.id, d.id);
  await tick(env, "http://localhost");
  assert.equal(msgRow(lid).notified_at, null, "held by quiet hours");
  const first = pulseAt(d.id, c.id);
  assert.ok(first >= landed, "the recipient's chat poked"); assert.ok(pulseAt(c.id, d.id) >= landed, "and the sender's");
  // still held at the next tick: not poked again
  await new Promise((ok) => setTimeout(ok, 5));
  await tick(env, "http://localhost");
  assert.equal(pulseAt(d.id, c.id), first, "poked once while it waits");
  // a group message held by quiet hours: the member and the sender poked
  const e = await person("Eve"), gid = crypto.randomUUID(), gm = crypto.randomUUID(), gdue = Date.now() - 1000;
  put("pg_groups", { id: gid, name: "Walkers", created_by: c.id, created_at: 0 });
  for (const m of [c, d, e]) put("pg_group_members", { group_id: gid, user_id: m.id, added_by: c.id, joined_at: 0 });
  put("pg_gmsgs", { id: gm, group_id: gid, sender: e.id, body: CT, sender_key: "k", pigeon: "standard", sent_at: gdue, instant: 1 });
  put("pg_gdeliv", { msg_id: gm, user_id: d.id, wrap: "w", km: 0, deliver_at: gdue });
  run("DELETE FROM pg_pulse WHERE chat = ?", gid);
  await tick(env, "http://localhost");
  assert.equal(one("SELECT notified_at FROM pg_gdeliv WHERE msg_id = ?", gm).notified_at, null, "held");
  assert.ok(pulseAt(d.id, gid) >= gdue, "the member's group poked"); assert.ok(pulseAt(e.id, gid) >= gdue, "and the sender's");
});

test("stopover: no push to a friend with pigeons off", async () => {
  const a = await person("Uma"), b = await person("Vic"), off = await pushOn(await person("Wes", { pigeons: 0 }), { names: true }), on = await pushOn(await person("Xia"), { names: true });
  const t = Date.now();
  for (const v of [off, on]) put("pg_msgs", { id: crypto.randomUUID(), sender: a.id, recipient: b.id, ct: CT, km: 300, sent_at: t - 3600e3, deliver_at: t + 3 * 3600e3, via: v.id, via_ct: CT, via_at: t - 1000, via_off: t + 3600e3, pigeon: "swift", swift: 1 });
  pushes = [];
  await tick(env, "http://localhost");
  assert.equal((await told(off)).length, 0, "pigeons off: not asked to add a line");
  assert.equal((await told(on)).length, 1);
  assert.equal(q("SELECT 1 FROM pg_msgs WHERE via = ? AND via_told IS NOT NULL", off.id).length, 1, "still marked told");
  const r = await api(off, "POST", "stopover-note", { id: one("SELECT id FROM pg_msgs WHERE via = ?", off.id).id, ct: CT });
  assert.deepEqual([r.status, r.body.error], [409, "Turn on pigeons to do that."]);
});

// ================================ groups ================================
test("group instant: lands for all, members told, turns ignore it", async () => {
  pushBurst.clear();
  const a = await pushOn(await person("Ava", { lat: null, lon: null }), { names: true }), b = await pushOn(await person("Ben"), { names: true }), c = await pushOn(await person("Cal"), { names: true });
  befriend(a, b); put("pg_links", { a: c.id, b: a.id, status: "blocked", created_at: 0 });
  const gid = crypto.randomUUID();
  put("pg_groups", { id: gid, name: "Climbers", created_by: b.id, created_at: 0 });
  for (const m of [a, b, c]) put("pg_group_members", { group_id: gid, user_id: m.id, added_by: b.id, joined_at: 0 });
  const keys = Object.fromEntries([a, b, c].map((m) => [m.id, "k".repeat(30)]));
  pushes = [];
  const r = await api(a, "POST", "group-messages", { id: crypto.randomUUID(), group: gid, body: CT, keys, instant: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.message.instant, true);
  const id = r.body.message.id, g = one("SELECT * FROM pg_gmsgs WHERE id = ?", id);
  assert.deepEqual([g.instant, g.pigeon, g.from_lat], [1, "standard", null]);
  assert.deepEqual(q("SELECT user_id, km, deliver_at = ? AS now, stamped FROM pg_gdeliv WHERE msg_id = ?", g.sent_at, id).map((d) => ({ ...d })), [{ user_id: b.id, km: 0, now: 1, stamped: 1 }], "one delivery: Ben's (never the sender's, never across a block)");
  assert.deepEqual((await told(b)).map((x) => [x.title, x.body, x.tag]), [["Climbers", "Ava sent a message.", `gmsg-${gid}`]]);
  assert.equal((await told(a)).length, 0, "the sender is never pushed"); assert.equal((await told(c)).length, 0);
  const mine = (await api(a, "GET", "sync")).body.groups.find((x) => x.id === gid);
  assert.equal(mine.turn.state, "fresh", "it took no turn");
  assert.equal(mine.way, "pigeon");
  const open = (await api(b, "GET", `group-messages?id=${gid}`)).body.messages.find((x) => x.id === id);
  assert.equal(open.flying, false); assert.equal(open.body, CT);
  const rc = await api(a, "POST", "group-recall", { id });
  assert.deepEqual([rc.status, rc.body.error], [409, "That message has already been sent."]);
});

// ================================ reactions ================================
test("reactions: instant on a message, or from someone with pigeons off", async () => {
  const a = await person("Dee"), b = await person("Eli"), c = await person("Fay", { pigeons: 0 }); befriend(a, b); befriend(a, c);
  const t = Date.now() - 5000;
  const m = await send(a, b, { instant: true });
  const r1 = await api(b, "POST", "react", { id: crypto.randomUUID(), msg: m.body.message.id, ct: CT });
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  assert.equal(r1.body.react.deliverAt, r1.body.react.sentAt, "on an instant message: at once");
  const letter = (to) => { const id = crypto.randomUUID(); put("pg_msgs", { id, sender: a.id, recipient: to.id, ct: CT, km: 300, sent_at: t - 3600e3, deliver_at: t, pigeon: "standard" }); return id; };
  const r2 = await api(b, "POST", "react", { id: crypto.randomUUID(), msg: letter(b), ct: CT });
  assert.ok(r2.body.react.deliverAt > r2.body.react.sentAt, "on a letter, from someone with pigeons on: it flies");
  const r3 = await api(c, "POST", "react", { id: crypto.randomUUID(), msg: letter(c), ct: CT });
  assert.equal(r3.body.react.deliverAt, r3.body.react.sentAt, "from someone with pigeons off: at once");
  assert.ok(one("SELECT at FROM pg_pulse WHERE user_id = ? AND chat = ?", a.id, c.id), "the other side poked");
});

// ================================ typing ================================
test("typing: in memory only, only when allowed, expires, never across a block, both-ways switch", async () => {
  // the object itself
  const m = new Map(), t0 = 1e12;
  assert.deepEqual(typingMap(m, { set: "x" }, t0), { ok: true });
  assert.deepEqual(typingMap(m, { read: true }, t0 + TYPING_MS - 1), { typing: ["x"] }, "within 6 s");
  assert.deepEqual(typingMap(m, { read: true }, t0 + TYPING_MS), { typing: [] }, "gone after 6 s");
  typingMap(m, { set: "y" }, t0); assert.deepEqual(typingMap(m, { clear: "y", read: true }, t0 + 1), { typing: [] });
  assert.equal(typingMap(m, null, t0), null); assert.equal(typingMap(m, { set: 5 }, t0), null);
  const bad = await new Typing({}, {}).fetch(new Request("https://typing/", { method: "POST", body: "nope" }));
  assert.equal(bad.status, 400);
  // through the pulse
  objects.clear(); typingBroken = null;
  const mira = await person("Mira"), leo = await person("Leo"), stranger = await person("Nobody"); befriend(mira, leo);
  const before = one("SELECT COUNT(*) AS n FROM pg_pulse").n;
  let r = await pulse(leo, { open: mira.id, typing: mira.id });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.deepEqual(r.body.typing, {});
  r = await pulse(mira, { open: leo.id });
  assert.deepEqual(r.body.typing, { [leo.id]: [leo.id] }, "Mira sees Leo typing");
  assert.equal(one("SELECT COUNT(*) AS n FROM pg_pulse").n, before, "typing wrote nothing to the change feed");
  assert.equal(q("SELECT name FROM sqlite_master WHERE name LIKE '%typing%'").length, 0, "no table holds typing");
  // expired (as 6 s would): gone
  for (const [k] of objects.get("u:" + mira.id).m) objects.get("u:" + mira.id).m.set(k, Date.now() - 1);
  assert.deepEqual((await pulse(mira, { open: leo.id })).body.typing, {}, "absent after 6 s");
  // stop clears it
  await pulse(leo, { open: mira.id, typing: mira.id });
  await pulse(leo, { open: mira.id, stop: mira.id });
  assert.deepEqual((await pulse(mira, { open: leo.id })).body.typing, {}, "stop clears it");
  // the writer hiding typing: nothing written; the reader hiding it: sees none
  run("UPDATE pg_users SET hide_typing = 1 WHERE id = ?", leo.id);
  await pulse(leo, { open: mira.id, typing: mira.id });
  assert.deepEqual((await pulse(mira, { open: leo.id })).body.typing, {}, "Leo hides his: none written");
  run("UPDATE pg_users SET hide_typing = 0 WHERE id = ?", leo.id); run("UPDATE pg_users SET hide_typing = 1 WHERE id = ?", mira.id);
  await pulse(leo, { open: mira.id, typing: mira.id });
  assert.deepEqual((await pulse(mira, { open: leo.id })).body.typing, {}, "Mira hides hers: she sees none");
  run("UPDATE pg_users SET hide_typing = 0 WHERE id = ?", mira.id);
  assert.deepEqual((await pulse(mira, { open: leo.id })).body.typing, { [leo.id]: [leo.id] }, "both on again: shown");
  // not a friend: no write
  await pulse(stranger, { typing: mira.id });
  assert.ok(!((await pulse(mira, {})).body.typing || {})[stranger.id], "a stranger's typing never written");
  // unfriending clears it at once; and blocking
  assert.equal((await api(mira, "DELETE", "friends", { id: leo.id })).status, 200);
  assert.deepEqual((await pulse(mira, {})).body.typing, {}, "unfriended: gone at once");
  befriend(mira, leo);
  await pulse(leo, { open: mira.id, typing: mira.id });
  assert.equal((await api(mira, "POST", "block", { id: leo.id })).status, 200);
  assert.deepEqual((await pulse(mira, {})).body.typing, {}, "blocked: gone at once");
  await pulse(leo, { typing: mira.id });
  assert.deepEqual((await pulse(mira, {})).body.typing, {}, "and never across a block");
  // a group: a member sees it in the open group, a non-member never
  const gid = crypto.randomUUID(), cal = await person("Cal"), dot = await person("Dot");
  put("pg_groups", { id: gid, name: "G", created_by: cal.id, created_at: 0 });
  for (const p of [cal, dot]) put("pg_group_members", { group_id: gid, user_id: p.id, added_by: cal.id, joined_at: 0 });
  await pulse(cal, { open: gid, typing: gid });
  assert.deepEqual((await pulse(dot, { open: gid })).body.typing, { [gid]: [cal.id] }, "a member sees it");
  assert.deepEqual((await pulse(stranger, { open: gid })).body.typing, {}, "a non-member never");
  await pulse(stranger, { open: gid, typing: gid });
  assert.deepEqual((await pulse(dot, { open: gid })).body.typing, { [gid]: [cal.id] }, "nor writes");
  // no binding, or turned off: null, and the pulse still answers
  for (const e of [{ ...env, TYPING: undefined }, { ...env, TYPING_OFF: "1" }]) {
    const x = await api(await again(dot), "POST", "pulse", { since: Date.now(), open: gid, typing: gid }, e);
    assert.equal(x.status, 200); assert.equal(x.body.typing, null);
  }
  // a binding that throws, or hangs past 1,500 ms: no typing, and the pulse still answers
  for (const how of ["throw", "hang"]) {
    typingBroken = how;
    const t1 = Date.now(), x = await pulse(dot, { open: gid });
    assert.equal(x.status, 200); assert.deepEqual(x.body.typing, {}, how);
    assert.ok(Date.now() - t1 < 4000, "never held up long");
  }
  typingBroken = null;
});

// ================================ the pulse ================================
test("pulse: changed feed and delivered", async () => {
  const mira = await person("Mira"), leo = await person("Leo"); befriend(mira, leo);
  const since = Date.now() - 1000;
  const s = await send(mira, leo, { instant: true }), id = s.body.message.id;
  assert.ok(one("SELECT 1 FROM pg_pulse WHERE user_id = ? AND chat = ?", leo.id, mira.id), "the recipient poked");
  assert.ok(one("SELECT 1 FROM pg_pulse WHERE user_id = ? AND chat = ?", mira.id, leo.id), "the sender's other phones too");
  const lp = await pulse(leo, { since, open: "" });
  assert.ok(lp.body.changed.some((c) => c.chat === mira.id), "Leo's pulse lists Mira's chat");
  assert.deepEqual(lp.body.unread, { [mira.id]: 1 }, "with its unread count");
  assert.ok(msgRow(id).got_at, "delivered: set by the pulse");
  // (that pulse poked Mira as it marked it delivered; once it's marked, another pokes no one)
  const seen = Date.now();
  run("UPDATE pg_pulse SET at = 0 WHERE user_id = ?", mira.id);
  await pulse(leo, { since: seen });
  assert.equal(one("SELECT at FROM pg_pulse WHERE user_id = ? AND chat = ?", mira.id, leo.id).at, 0, "nothing new to mark: no poke");
  const mv = (await api(mira, "GET", `messages?with=${leo.id}`)).body.messages.find((x) => x.id === id);
  assert.equal(mv.delivered, true); assert.ok(mv.gotAt);
  // a letter: delivered, but nobody poked
  const ann = await person("Ann"), bo = await person("Bo"); befriend(ann, bo);
  const lt = crypto.randomUUID(), t = Date.now() - 1000;
  put("pg_msgs", { id: lt, sender: ann.id, recipient: bo.id, ct: CT, km: 300, sent_at: t - 3600e3, deliver_at: t, pigeon: "standard" });
  await pulse(bo, {});
  assert.ok(msgRow(lt).got_at, "a letter's delivered too");
  assert.equal(one("SELECT 1 FROM pg_pulse WHERE user_id = ? AND chat = ?", ann.id, bo.id), undefined, "but its sender isn't poked");
  // the recipient hiding when they're online: delivered, no poke, and the time hidden from the sender
  const cy = await person("Cy"), di = await person("Di", { hide_online: 1 }); befriend(cy, di);
  const h = await send(cy, di, { instant: true }), hid = h.body.message.id;
  run("DELETE FROM pg_pulse WHERE user_id = ?", cy.id);
  await pulse(di, {});
  assert.ok(msgRow(hid).got_at, "got_at set");
  assert.equal(one("SELECT 1 FROM pg_pulse WHERE user_id = ?", cy.id), undefined, "no poke to the sender");
  const cv = (await api(cy, "GET", `messages?with=${di.id}`)).body.messages.find((x) => x.id === hid);
  assert.equal(cv.delivered, true); assert.equal(cv.gotAt, null, "the time hidden, the tick kept");
  // the sender hiding theirs: the same
  run("UPDATE pg_users SET hide_online = 1 WHERE id = ?", mira.id);
  const mv2 = (await api(mira, "GET", `messages?with=${leo.id}`)).body.messages.find((x) => x.id === id);
  assert.equal(mv2.delivered, true); assert.equal(mv2.gotAt, null);
  run("UPDATE pg_users SET hide_online = 0 WHERE id = ?", mira.id);
  // read: my own phones poked, and the sender (receipts and online on), only when a row changed
  run("DELETE FROM pg_pulse WHERE user_id IN (?, ?)", mira.id, leo.id);
  await api(leo, "POST", "read", { with: mira.id });
  assert.ok(one("SELECT 1 FROM pg_pulse WHERE user_id = ? AND chat = ?", leo.id, mira.id), "my own phones");
  assert.ok(one("SELECT 1 FROM pg_pulse WHERE user_id = ? AND chat = ?", mira.id, leo.id), "and the sender");
  assert.ok((await api(mira, "GET", `messages?with=${leo.id}`)).body.messages.find((x) => x.id === id).readAt, "read");
  run("DELETE FROM pg_pulse WHERE user_id IN (?, ?)", mira.id, leo.id);
  await api(leo, "POST", "read", { with: mira.id });
  assert.equal(one("SELECT COUNT(*) AS n FROM pg_pulse WHERE user_id IN (?, ?)", mira.id, leo.id).n, 0, "nothing changed: nobody poked");
  // receipts off (either way): readAt never shown; with them off, the reader doesn't poke the sender
  run("UPDATE pg_users SET no_receipts = 1 WHERE id = ?", leo.id);
  const s2 = await send(mira, leo, { instant: true });
  run("DELETE FROM pg_pulse WHERE user_id IN (?, ?)", mira.id, leo.id);
  await api(leo, "POST", "read", { with: mira.id });
  assert.ok(one("SELECT 1 FROM pg_pulse WHERE user_id = ? AND chat = ?", leo.id, mira.id));
  assert.equal(one("SELECT 1 FROM pg_pulse WHERE user_id = ? AND chat = ?", mira.id, leo.id), undefined, "receipts off: the sender not poked");
  assert.equal((await api(mira, "GET", `messages?with=${leo.id}`)).body.messages.find((x) => x.id === s2.body.message.id).readAt, null);
  run("UPDATE pg_users SET no_receipts = 0 WHERE id = ?", leo.id); run("UPDATE pg_users SET no_receipts = 1 WHERE id = ?", mira.id);
  assert.equal((await api(mira, "GET", `messages?with=${leo.id}`)).body.messages.find((x) => x.id === s2.body.message.id).readAt, null, "and the other way");
  run("UPDATE pg_users SET no_receipts = 0 WHERE id = ?", mira.id);
  // a poke written by a slow request is still seen: stamped as it's built, not when the request began. The send's
  // look-up of its id held up for 400 ms (as a letter's weather can hold one up), and a pulse in that time
  const SLOW = 400;
  let asked = null;
  const slowDB = new Proxy(env.DB, { get(o, k) {
    if (k !== "prepare") return typeof o[k] === "function" ? o[k].bind(o) : o[k];
    return (sql) => {
      const st = o.prepare(sql);
      if (!/FROM pg_ids WHERE id = \?/.test(sql)) return st;
      const wrap = (x) => ({ ...x, bind: (...a) => wrap(x.bind(...a)), first: async (c) => { await new Promise((ok) => setTimeout(ok, SLOW)); asked = Date.now(); return x.first(c); } });
      return wrap(st);
    };
  } });
  run("DELETE FROM pg_pulse WHERE user_id = ?", leo.id);
  const slow = await api(mira, "POST", "messages", { id: crypto.randomUUID(), to: leo.id, ct: CT, instant: true }, { ...env, DB: slowDB });
  assert.equal(slow.status, 200, JSON.stringify(slow.body));
  const began = msgRow(slow.body.message.id).sent_at;            // (the request's own start)
  assert.ok(asked - began >= SLOW - 5, "the request was slow");
  assert.ok(one("SELECT at FROM pg_pulse WHERE user_id = ? AND chat = ?", leo.id, mira.id).at >= asked, "stamped as it was built, not when the request began");
  const p = await pulse(leo, { since: asked - 1 });              // (a reader who asked while it was held up)
  assert.ok(p.body.changed.some((c) => c.chat === mira.id), "seen by a pulse that asked while it was held up");
});

test("pulse: costs two trips, is throttled, sets the pace", async () => {
  const counted = { ...env, PIGEON_COUNT_DB: "1" };
  const mira = await person("Mira"), leo = await person("Leo"); befriend(mira, leo);
  const trips = [];
  for (let i = 0; i < 3; i++) {
    const p = await again(mira);
    await api(p, "GET", "sync", undefined, counted);             // (right after another request)
    trips.push((await api(p, "POST", "pulse", { since: Date.now(), open: leo.id, typing: leo.id }, counted)).trips);
  }
  assert.ok(Math.min(...trips) <= 2, `a pulse costs two trips at most: ${trips}`);
  // two 100 ms apart with the same sign-in: the second refused, unread
  const p = await again(mira);
  assert.equal((await api(p, "POST", "pulse", { since: Date.now() }, counted)).status, 200);
  await new Promise((r) => setTimeout(r, 100));
  const fast = await api(p, "POST", "pulse", { since: Date.now() }, counted);
  assert.equal(fast.status, 429); assert.ok(fast.body.retry > 0 && fast.body.retry <= 1000, `retry ${fast.body.retry}`);
  assert.equal(fast.body.error, "Too fast."); assert.equal(fast.trips, 0, "and no trip to the database");
  // the pace: 3 s with a chat open, 10 s on the list or from the service worker, following PULSE_MS
  assert.equal((await pulse(mira, { open: leo.id })).body.next, 3000);
  assert.equal((await pulse(mira, { open: "" })).body.next, 10000);
  assert.equal((await pulse(mira, {})).body.next, 10000);
  const slow = await api(await again(mira), "POST", "pulse", { since: Date.now(), open: leo.id }, { ...env, PULSE_MS: "6000" });
  assert.equal(slow.body.next, 6000);
  await send(leo, mira, { instant: true });
  assert.equal((await pulse(mira, { open: leo.id, since: Date.now() - 5000 })).body.next, 2000, "a message just came: quicker");
  // bad requests
  for (const b of [{ open: "nope" }, { typing: "x" }, { typing: leo.id, stop: leo.id }]) assert.equal((await pulse(mira, b)).status, 400, JSON.stringify(b));
  // open: kept, and kept fresh
  await pulse(mira, { open: leo.id });
  assert.equal(one("SELECT open_chat FROM pg_users WHERE id = ?", mira.id).open_chat, leo.id);
  await pulse(mira, { open: "" });
  assert.equal(one("SELECT open_chat FROM pg_users WHERE id = ?", mira.id).open_chat, null);
});

// ================================ ways ================================
test("way: set, logged, lined, refused with pigeons off", async () => {
  const mira = await person("Mira"), leo = await person("Leo"); befriend(mira, leo);
  let r = await api(mira, "POST", "way", { with: leo.id, way: "instant" });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.way, "instant"); assert.ok(r.body.at);
  assert.equal(one("SELECT way FROM pg_ways WHERE a = ? AND b = ?", mira.id, leo.id).way, "instant");
  assert.equal(q("SELECT * FROM pg_wayev WHERE a = ? AND b = ?", mira.id, leo.id).length, 1);
  const chat = (await api(leo, "GET", `messages?with=${mira.id}`)).body;
  assert.deepEqual(chat.lines.map((l) => [l.by, l.way]), [[mira.id, "instant"]]);
  assert.equal(chat.theirWay, "instant"); assert.equal(chat.way, "pigeon");
  r = await api(mira, "POST", "way", { with: leo.id, way: "instant" });
  assert.deepEqual(r.body, { ok: true, way: "instant", at: null }, "unchanged: nothing written");
  assert.equal(q("SELECT * FROM pg_wayev WHERE a = ? AND b = ?", mira.id, leo.id).length, 1);
  await api(mira, "POST", "way", { with: leo.id, way: "pigeon" });
  const lines = q("SELECT way FROM pg_wayev WHERE a = ? AND b = ?", mira.id, leo.id);
  assert.deepEqual(lines.map((l) => l.way), ["pigeon"], "two changes within 10 minutes: one line, the later way");
  for (const [b, st, err] of [[{ with: leo.id, way: "owl" }, 400, "Choose Instant or By Pigeon."], [{ way: "instant" }, 400, "Bad request."], [{ with: (await person("X")).id, way: "instant" }, 403, "You can only change chats with friends."]]) {
    const x = await api(mira, "POST", "way", b);
    assert.deepEqual([x.status, x.body.error], [st, err]);
  }
  run("UPDATE pg_users SET pigeons = 0 WHERE id = ?", mira.id);
  r = await api(mira, "POST", "way", { with: leo.id, way: "instant" });
  assert.deepEqual([r.status, r.body.error], [409, "Turn on pigeons to do that."]);
  // theirWay: a friend with pigeons off reads as instant, whatever their row says
  assert.equal(one("SELECT way FROM pg_ways WHERE a = ? AND b = ?", mira.id, leo.id).way, "pigeon");
  assert.equal((await friendOf(leo, mira)).theirWay, "instant");
  assert.equal((await api(leo, "GET", `messages?with=${mira.id}`)).body.theirWay, "instant");
  run("UPDATE pg_users SET pigeons = 1 WHERE id = ?", mira.id);
  // a group way: a 'way' event, newest 500 shown even after 600 older events
  const gid = crypto.randomUUID();
  put("pg_groups", { id: gid, name: "G", created_by: mira.id, created_at: 0 });
  for (const p of [mira, leo]) put("pg_group_members", { group_id: gid, user_id: p.id, added_by: mira.id, joined_at: 0, way: "pigeon" });
  for (let i = 0; i < 600; i++) put("pg_gevents", { group_id: gid, at: 1000 + i, kind: "rename", actor: mira.id, actor_name: "Mira", target_name: `G${i}` });
  r = await api(mira, "POST", "way", { group: gid, way: "instant" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const ev = (await api(leo, "GET", `group-messages?id=${gid}`)).body.events;
  assert.equal(ev.length, 500); assert.deepEqual(ev.at(-1), { at: ev.at(-1).at, kind: "way", by: { id: mira.id, name: "Mira" }, name: "instant" });
  assert.ok(ev.every((e, i) => i === 0 || e.at >= ev[i - 1].at), "oldest first");
  assert.equal((await api(mira, "GET", "sync")).body.groups.find((g) => g.id === gid).way, "instant");
  // a new friendship: each side's new_way, but Instant towards a friend with pigeons off
  const pat = await person("Pat", { new_way: "pigeon" }), newbie = await person("Newbie", { pigeons: 0, new_way: "instant" });
  put("pg_links", { a: newbie.id, b: pat.id, status: "pending", created_at: 0 });
  assert.equal((await api(pat, "POST", "friends-respond", { id: newbie.id, accept: true })).status, 200);
  assert.equal(one("SELECT way FROM pg_ways WHERE a = ? AND b = ?", pat.id, newbie.id).way, "instant", "towards a newcomer with pigeons off: Instant");
  assert.equal(one("SELECT way FROM pg_ways WHERE a = ? AND b = ?", newbie.id, pat.id).way, "instant");
  const old = await person("Old", { new_way: "pigeon" });
  put("pg_links", { a: old.id, b: pat.id, status: "pending", created_at: 0 });
  await api(pat, "POST", "friends-respond", { id: old.id, accept: true });
  assert.deepEqual([one("SELECT way FROM pg_ways WHERE a = ? AND b = ?", pat.id, old.id).way, one("SELECT way FROM pg_ways WHERE a = ? AND b = ?", old.id, pat.id).way], ["pigeon", "pigeon"]);
  // unfriending: the pair's ways and lines go; friends again: from today's settings
  await api(pat, "POST", "way", { with: old.id, way: "instant" });
  await api(pat, "DELETE", "friends", { id: old.id });
  assert.equal(q("SELECT 1 FROM pg_ways WHERE (a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1)", pat.id, old.id).length, 0);
  assert.equal(q("SELECT 1 FROM pg_wayev WHERE (a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1)", pat.id, old.id).length, 0);
  put("pg_links", { a: old.id, b: pat.id, status: "pending", created_at: 0 });
  await api(pat, "POST", "friends-respond", { id: old.id, accept: true });
  assert.equal(one("SELECT way FROM pg_ways WHERE a = ? AND b = ?", pat.id, old.id).way, "pigeon", "fresh, not the old row");
  // all chats: each changed one logged; the sixth in a day refused
  const all = await person("All"), f1 = await person("F1"), f2 = await person("F2"); befriend(all, f1); befriend(all, f2);
  put("pg_ways", { a: all.id, b: f1.id, way: "instant", at: 0 });
  put("pg_group_members", { group_id: gid, user_id: all.id, added_by: mira.id, joined_at: 0, way: "pigeon" });
  r = await api(all, "PATCH", "me", { noted: true, allChats: "instant", newChats: "instant" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.me.newChats, r.body.me.noted], ["instant", true]);
  assert.deepEqual(q("SELECT b, way FROM pg_ways WHERE a = ? ORDER BY b", all.id).map((x) => [x.b, x.way]), [[f1.id, "instant"], [f2.id, "instant"]]);
  assert.deepEqual(q("SELECT b FROM pg_wayev WHERE a = ?", all.id).map((x) => x.b), [f2.id], "a line only where it changed");
  assert.equal(one("SELECT way FROM pg_group_members WHERE group_id = ? AND user_id = ?", gid, all.id).way, "instant");
  assert.equal(q("SELECT 1 FROM pg_gevents WHERE group_id = ? AND kind = 'way' AND actor = ?", gid, all.id).length, 1);
  for (let i = 0; i < 4; i++) assert.equal((await api(all, "PATCH", "me", { allChats: i % 2 ? "instant" : "pigeon" })).status, 200);
  assert.equal(q("SELECT 1 FROM pg_wayev WHERE a = ? AND b = ?", all.id, f2.id).length, 1, "flipping back and forth: still one line");
  const sixth = await api(all, "PATCH", "me", { allChats: "pigeon" });
  assert.equal(sixth.status, 429);
  assert.equal((await api(all, "PATCH", "me", { allChats: "owl" })).status, 400);
  assert.equal((await api(all, "PATCH", "me", { pigeons: "yes" })).body.error, "Choose on or off.");
});

// ================================ the delta ================================
test("delta: GET messages?after= returns only what changed", async () => {
  const mira = await person("Mira"), leo = await person("Leo"); befriend(mira, leo);
  const t = Date.now(), old = crypto.randomUUID(), ancient = crypto.randomUUID(), gone = crypto.randomUUID(), toread = crypto.randomUUID(), toget = crypto.randomUUID();
  const row = (id, x) => put("pg_msgs", { id, sender: mira.id, recipient: leo.id, ct: CT, km: 0, instant: 1, stamped: 1, ...x });
  row(old, { sent_at: t - 3600e3, deliver_at: t - 3600e3, got_at: t - 3600e3, read_at: t - 3600e3 });
  row(ancient, { sent_at: t - 3 * 864e5, deliver_at: t - 3 * 864e5, read_at: t - 1000 });     // (changed, but older than two days)
  row(gone, { sent_at: t - 7200e3, deliver_at: t - 7200e3, gone_at: t - 1000 });
  row(toread, { sent_at: t - 600e3, deliver_at: t - 600e3, got_at: t - 600e3, read_at: t - 1000 });
  row(toget, { sent_at: t - 500e3, deliver_at: t - 500e3, got_at: t - 1000 });
  const after = t - 60e3;
  // (a reaction since, on the older, unchanged message: it comes, without the message)
  put("pg_reacts", { id: crypto.randomUUID(), msg_id: old, sender: leo.id, recipient: mira.id, ct: CT, sent_at: t - 1000, deliver_at: t - 1000 });
  const fresh = await send(mira, leo, { instant: true });
  const d = (await api(mira, "GET", `messages?with=${leo.id}&after=${after}&tag=whatever`)).body;
  assert.equal(d.delta, true); assert.equal(d.tag, undefined, "never tagged");
  assert.deepEqual(d.messages.map((m) => m.id).sort(), [fresh.body.message.id, toread, toget].sort(), "new, read and delivered since; not the unchanged one, nor one older than two days");
  assert.deepEqual(d.gone, [gone]);
  assert.deepEqual(d.reacts.map((r) => r.msg), [old], "a reaction since, on an older message");
  for (const k of ["now", "reacts", "lines", "turn", "swift", "turbo", "rocket", "way", "theirWay"]) assert.ok(k in d, k);
  assert.ok(!("stops" in d) && !("fly" in d));
  // older than 10 minutes, or missing or bad: the full form
  for (const a of [t - 11 * 60e3, "", "bad"]) {
    const f = (await api(mira, "GET", `messages?with=${leo.id}&after=${a}`)).body;
    assert.equal(f.delta, undefined, `after=${a}`); assert.ok(f.tag);
  }
  // a stranger: nothing
  assert.equal((await api(await person("Who"), "GET", `messages?with=${leo.id}&after=${after}`)).status, 403);
});

test("delta: four trips at most, with a letter of mine just landed and another flying; its extras still come", async () => {
  const counted = { ...env, PIGEON_COUNT_DB: "1" };
  const mira = await person("Mira"), leo = await person("Leo"); befriend(mira, leo);
  const t = Date.now(), landed = crypto.randomUUID(), flying = crypto.randomUUID();
  const where = { from_lat: 51.5, from_lon: -0.1, to_lat: 48.8, to_lon: 2.3 };
  put("pg_msgs", { id: landed, sender: mira.id, recipient: leo.id, ct: CT, km: 300, sent_at: t - 3600e3, deliver_at: t - 2000, pigeon: "standard", ...where });
  put("pg_msgs", { id: flying, sender: mira.id, recipient: leo.id, ct: CT, km: 300, sent_at: t - 600e3, deliver_at: t + 3600e3, pigeon: "standard", ...where });
  // (what each look-up finds: a postmark and a stamp on the landed one, a flyover on the flying one)
  put("pg_stamped", { id: landed, user_id: mira.id, at: t - 2000, marks: JSON.stringify(["towerbridge"]) });
  put("pg_passport", { user_id: mira.id, place: "France", first_at: t - 2000, first_id: landed, first_ord: 0 });
  put("pg_flyover", { msg_id: flying, user_id: leo.id, sender: mira.id, at: t - 300e3, place: "Kent", told: t - 300e3 });
  const trips = [];
  let d;
  for (let i = 0; i < 3; i++) {
    const p = await again(mira);
    await api(p, "GET", "sync", undefined, counted);             // (right after another request)
    const r = await api(p, "GET", `messages?with=${leo.id}&after=${Date.now() - 60e3}`, undefined, counted);
    trips.push(r.trips); d = r.body;
  }
  assert.ok(Math.min(...trips) <= 4, `the delta costs four trips at most: ${trips}`);
  assert.equal(d.delta, true);
  const v = Object.fromEntries(d.messages.map((m) => [m.id, m]));
  assert.deepEqual(Object.keys(v).sort(), [landed, flying].sort());
  assert.deepEqual(v[landed].postmarks.map((x) => x.id), ["towerbridge"]);
  assert.deepEqual(v[landed].stamps, ["France"]);
  assert.deepEqual(v[flying].fly.map((x) => x.who), [leo.id]);
});

test("delta: a read, an opening or a delivery that receipts() hides never brings a row by itself", async () => {
  const mira = await person("Mira"), leo = await person("Leo"); befriend(mira, leo);
  const t = Date.now(), msg = crypto.randomUUID(), photo = crypto.randomUUID(), toget = crypto.randomUUID();
  const row = (id, x) => put("pg_msgs", { id, sender: mira.id, recipient: leo.id, ct: CT, km: 0, instant: 1, stamped: 1, ...x });
  row(msg, { sent_at: t - 600e3, deliver_at: t - 600e3, got_at: t - 600e3 });
  row(photo, { sent_at: t - 500e3, deliver_at: t - 500e3, got_at: t - 500e3, once: 1, photo: 1 });
  const ids = async (p, other) => (await api(p, "GET", `messages?with=${other.id}&after=${Date.now() - 1000}`)).body.messages.map((m) => m.id).sort();
  assert.deepEqual(await ids(mira, leo), [], "nothing changed: nothing comes");
  // receipts off (Leo's): Leo reads it and opens the photo; neither comes to Mira, though they come to Leo's other phones
  run("UPDATE pg_users SET no_receipts = 1, no_receipts_at = ? WHERE id = ?", t - 3600e3, leo.id);
  assert.equal((await api(leo, "POST", "read", { with: mira.id })).status, 200);
  run("UPDATE pg_msgs SET viewed_at = ? WHERE id = ?", Date.now(), photo);
  assert.ok(msgRow(msg).read_at, "read");
  assert.deepEqual(await ids(mira, leo), [], "receipts off: when it was read, or opened, never shows by its coming");
  assert.deepEqual(await ids(leo, mira), [msg, photo].sort(), "the reader's own phones still hear of it");
  // Mira's receipts off instead: the same
  run("UPDATE pg_users SET no_receipts = 0, no_receipts_at = NULL WHERE id = ?", leo.id); run("UPDATE pg_users SET no_receipts = 1, no_receipts_at = ? WHERE id = ?", t - 3600e3, mira.id);
  run("UPDATE pg_msgs SET read_at = ? WHERE id = ?", Date.now(), msg);
  assert.deepEqual(await ids(mira, leo), [], "and the other way");
  // both on: a read comes, as before
  run("UPDATE pg_users SET no_receipts = 0, no_receipts_at = NULL WHERE id = ?", mira.id);
  run("UPDATE pg_msgs SET read_at = ? WHERE id = ?", Date.now(), msg);
  assert.deepEqual(await ids(mira, leo), [msg, photo].sort(), "receipts on: a read, and an opening, come");
  // delivered, with Leo hiding when he's online: it doesn't come by itself (its tick turns at the next full fetch)
  run("UPDATE pg_msgs SET read_at = ?1, viewed_at = CASE WHEN viewed_at IS NULL THEN NULL ELSE ?1 END WHERE id IN (?2, ?3)", t - 300e3, msg, photo);     // (long since)
  row(toget, { sent_at: t - 400e3, deliver_at: t - 400e3 });
  run("UPDATE pg_users SET hide_online = 1 WHERE id = ?", leo.id);
  await pulse(leo, {});
  assert.ok(msgRow(toget).got_at, "delivered");
  assert.deepEqual(await ids(mira, leo), [], "online hidden: when it was delivered never shows by its coming");
  const full = (await api(mira, "GET", `messages?with=${leo.id}`)).body.messages.find((m) => m.id === toget);
  assert.equal(full.delivered, true, "the full fetch still has its tick");
  run("UPDATE pg_users SET hide_online = 0 WHERE id = ?", leo.id);
  // a new message still comes, whatever the settings
  run("UPDATE pg_users SET no_receipts = 1, hide_online = 1 WHERE id = ?", leo.id);
  const fresh = await send(mira, leo, { instant: true });
  assert.deepEqual(await ids(mira, leo), [fresh.body.message.id]);
  run("UPDATE pg_users SET no_receipts = 0, hide_online = 0 WHERE id = ?", leo.id);
});

test("read: the sender's own receipts, or online, off: the sender isn't poked either", async () => {
  for (const col of ["no_receipts", "hide_online"]) {
    const mira = await person("Mira", { [col]: 1 }), leo = await person("Leo"); befriend(mira, leo);
    await send(mira, leo, { instant: true });
    run("DELETE FROM pg_pulse WHERE user_id IN (?, ?)", mira.id, leo.id);
    await api(leo, "POST", "read", { with: mira.id });
    assert.ok(one("SELECT 1 FROM pg_pulse WHERE user_id = ? AND chat = ?", leo.id, mira.id), `${col}: the reader's own phones`);
    assert.equal(one("SELECT 1 FROM pg_pulse WHERE user_id = ? AND chat = ?", mira.id, leo.id), undefined, `${col} (the sender's): not poked`);
  }
});

test("reactions: one that flew pokes its chat on both sides as it lands, once, quiet hours or not", async () => {
  const pulseAt = (u, c) => one("SELECT at FROM pg_pulse WHERE user_id = ? AND chat = ?", u, c)?.at;
  const a = await person("Ada"), b = await person("Ben"); befriend(a, b);
  const t = Date.now() - 5000, lid = crypto.randomUUID();
  put("pg_msgs", { id: lid, sender: a.id, recipient: b.id, ct: CT, km: 300, sent_at: t - 3600e3, deliver_at: t, pigeon: "standard", notified_at: t });
  const r = await api(b, "POST", "react", { id: crypto.randomUUID(), msg: lid, ct: CT });
  assert.ok(r.body.react.deliverAt > r.body.react.sentAt, "it flies");
  // (it lands: a while ago, so the tick takes it now, with A in quiet hours: no notification, but the chat's poked)
  const h = new Date().getUTCHours();
  run("UPDATE pg_users SET notify_prefs = ? WHERE id = ?", JSON.stringify({ quiet: true, quietFrom: h, quietTo: (h + 2) % 24, tz: "UTC" }), a.id);
  const landed = Date.now() - 1000;
  run("UPDATE pg_reacts SET sent_at = ?, deliver_at = ? WHERE id = ?", landed - 60e3, landed, r.body.react.id);
  run("UPDATE pg_meta SET v = ? WHERE k = 'notify_since'", String(landed - 30e3));
  run("DELETE FROM pg_pulse WHERE user_id IN (?, ?)", a.id, b.id);
  try {
    await tick(env, "http://localhost");
    assert.equal(one("SELECT notified_at FROM pg_reacts WHERE id = ?", r.body.react.id).notified_at, null, "held by quiet hours");
    const first = pulseAt(a.id, b.id);
    assert.ok(first >= landed, "the one reacted to: poked"); assert.ok(pulseAt(b.id, a.id) >= landed, "and the reactor's other phones");
    await new Promise((ok) => setTimeout(ok, 5));
    await tick(env, "http://localhost");
    assert.equal(pulseAt(a.id, b.id), first, "once");
  } finally { run("UPDATE pg_meta SET v = '0' WHERE k = 'notify_since'"); }
});

test("admin: 'late' and each person's pigeons sent count letters only", async () => {
  const boss = await person("Boss"), x = await person("Xan"), y = await person("Yas"); befriend(x, y);
  run("INSERT OR REPLACE INTO pg_meta (k, v) VALUES ('admin_user', ?)", boss.id);
  put("pg_passkeys", { id: "pk-" + boss.id, user_id: boss.id, public_key: "k", alg: -7, created_at: 0 });
  run("UPDATE pg_sessions SET site_hash = hash WHERE user_id = ?", boss.id);       // (the account page's own sign-in: its cookie)
  const admin = async (path) => {
    const request = new Request(`http://localhost/api/account/${path}`, { headers: { Cookie: `account=${boss.token}` } });
    const res = await ADMIN_ROUTES["GET " + path]({ request, env, waitUntil: (p) => later.push(p), params: {} });     // (as the account page's API calls it)
    await Promise.allSettled(later.splice(0));
    assert.equal(res.status, 200, path); return res.json();
  };
  const late0 = (await admin("admin/summary")).late, held = Date.now() - 30 * 60e3;
  // an instant message held by quiet hours, unclaimed, and one in a group: not late
  put("pg_msgs", { id: crypto.randomUUID(), sender: x.id, recipient: y.id, ct: CT, km: 0, instant: 1, stamped: 1, sent_at: held, deliver_at: held });
  const gid = crypto.randomUUID(), gm = crypto.randomUUID();
  put("pg_groups", { id: gid, name: "G", created_by: x.id, created_at: 0 });
  put("pg_gmsgs", { id: gm, group_id: gid, sender: x.id, body: CT, sender_key: "k", pigeon: "standard", sent_at: held, instant: 1 });
  put("pg_gdeliv", { msg_id: gm, user_id: y.id, wrap: "w", km: 0, deliver_at: held });
  assert.equal((await admin("admin/summary")).late, late0, "instant messages are never late");
  // a letter landed half an hour ago, nobody told: late
  put("pg_msgs", { id: crypto.randomUUID(), sender: x.id, recipient: y.id, ct: CT, km: 300, sent_at: held - 3600e3, deliver_at: held, pigeon: "standard" });
  assert.equal((await admin("admin/summary")).late, late0 + 1, "a letter is");
  const sent = (await admin("admin/users")).users.find((u) => u.id === x.id).sent;
  assert.equal(sent, 1, "pigeons sent: the letter only");
  run("DELETE FROM pg_meta WHERE k = 'admin_user'");
});

test("pulse: only a sign-in's shape is kept, never too many; a pulse that only clears goes through once", async () => {
  const { tooFast, pulsesKept } = await import("../../../functions/_pulse.js");
  const kept = pulsesKept();
  // forged, junk or huge headers: answered (signed out), never kept
  for (let i = 0; i < 50; i++) {
    const auth = i % 2 ? "Bearer " + "x".repeat(5000) + i : "junk " + i;
    const res = await onRequest({ request: new Request("http://localhost/api/pigeon/pulse", { method: "POST", headers: { Authorization: auth, "Content-Type": "application/json" }, body: "{}" }), env, waitUntil: () => {}, params: {} });
    assert.equal(res.status, 401);
  }
  assert.equal(pulsesKept(), kept, "none of them kept");
  // never more than the cap: well-formed ones past it, and it's emptied rather than grown
  const t = Date.now();
  for (let i = 0; i < 20500; i++) tooFast(`Bearer ${"a".repeat(30)}${i}`, t);
  assert.ok(pulsesKept() <= 20000, `kept ${pulsesKept()}`);
  // a pulse that only says the chat's closed (or typing's stopped) right after another: through, once
  const mira = await person("Mira"), leo = await person("Leo"); befriend(mira, leo);
  const p = await again(mira);
  assert.equal((await api(p, "POST", "pulse", { since: Date.now(), open: leo.id })).status, 200);
  assert.equal(one("SELECT open_chat FROM pg_users WHERE id = ?", mira.id).open_chat, leo.id);
  const closed = await api(p, "POST", "pulse", { since: Date.now(), open: "", stop: leo.id });
  assert.equal(closed.status, 200, "going away, under a second after the last: not refused");
  assert.equal(one("SELECT open_chat FROM pg_users WHERE id = ?", mira.id).open_chat, null, "the chat's no longer open");
  assert.equal((await api(p, "POST", "pulse", { since: Date.now(), open: "" })).status, 429, "a second within the second: refused");
  assert.equal((await api(p, "POST", "pulse", { since: Date.now(), open: leo.id })).status, 429, "and any other");
  const q2 = await again(mira);
  assert.equal((await api(q2, "POST", "pulse", { since: Date.now(), open: leo.id, typing: leo.id })).status, 200);
  assert.equal((await api(q2, "POST", "pulse", { since: Date.now(), open: leo.id, typing: leo.id })).status, 429, "typing doesn't skip it");
});

// ================================ recall ================================
test("recall: a letter waiting to take off can be cancelled with pigeons off; one in the air can't", async () => {
  const a = await person("Abe", { pigeons: 0 }), b = await person("Bev"); befriend(a, b);
  const t = Date.now(), wait = crypto.randomUUID(), air = crypto.randomUUID();
  put("pg_msgs", { id: wait, sender: a.id, recipient: b.id, ct: CT, km: 300, sent_at: t + 3600e3, deliver_at: t + 7200e3, sched: 1, pigeon: "swift", swift: 1 });
  put("pg_msgs", { id: air, sender: a.id, recipient: b.id, ct: CT, km: 300, sent_at: t - 600e3, deliver_at: t + 3600e3, pigeon: "swift", swift: 1 });
  const c = await api(a, "POST", "recall", { id: wait });
  assert.equal(c.status, 200, JSON.stringify(c.body)); assert.equal(msgRow(wait), undefined);
  assert.equal(one("SELECT swift FROM pg_users WHERE id = ?", a.id).swift, 9, "its pigeon back in the loft (a full loft stays full)");
  const r = await api(a, "POST", "recall", { id: air });
  assert.deepEqual([r.status, r.body.error], [409, "Turn on pigeons to do that."]);
  // and the other pigeons-only things
  assert.equal((await api(a, "POST", "cheer", { id: air })).body.error, "Turn on pigeons to do that.");
  assert.equal((await api(a, "POST", "wave", { id: air })).body.error, "Turn on pigeons to do that.");
  // a friend with pigeons off isn't offered as a stopover
  const c2 = await person("Cat"); befriend(b, c2); befriend(a, c2);
  const p = await person("Pip"); befriend(p, b); befriend(p, a);
  const ids = (await api(b, "GET", `mutuals?with=${p.id}`)).body.ids;
  assert.ok(!ids.includes(a.id), "pigeons off: not a stopover");
});

// ================================ what goes, and what's counted ================================
test("retention and records: instant rows go at 30 days with no flight line; counts are letters only", async () => {
  const a = await person("Gus"), b = await person("Hal"); befriend(a, b);
  const t = Date.now(), day = 864e5, oldMsg = crypto.randomUUID(), oldLetter = crypto.randomUUID();
  put("pg_msgs", { id: oldMsg, sender: a.id, recipient: b.id, ct: CT, km: 0, sent_at: t - 31 * day, deliver_at: t - 31 * day, instant: 1, stamped: 1 });
  put("pg_msgs", { id: oldLetter, sender: a.id, recipient: b.id, ct: CT, km: 300, sent_at: t - 32 * day, deliver_at: t - 31 * day, pigeon: "standard", stamped: 1 });
  put("pg_stamped", { id: oldLetter, user_id: a.id, at: t - 31 * day });
  await keepMonth(env, D, t, 1000);
  assert.equal(msgRow(oldMsg), undefined, "the message goes");
  assert.equal(msgRow(oldLetter), undefined, "the letter goes");
  assert.equal(one("SELECT 1 FROM pg_flights WHERE id = ?", oldMsg), undefined, "no flight line for the message");
  assert.ok(one("SELECT 1 FROM pg_flights WHERE id = ?", oldLetter), "the letter's line kept");
  // the log: letters only
  const c = await person("Ida"), d = await person("Jim"); befriend(c, d);
  for (let i = 0; i < 3; i++) await send(c, d, { instant: true });
  const lt = crypto.randomUUID();
  put("pg_msgs", { id: lt, sender: c.id, recipient: d.id, ct: CT, km: 300, sent_at: t - 7200e3, deliver_at: t - 3600e3, pigeon: "standard" });
  assert.equal((await logFor(D, c.id, t + 1000)).sent, 1, "the log counts the letter only");
  assert.equal((await logFor(D, d.id, t + 1000)).received, 1);
  // the account's counts (SENT/HAD): letters only
  const { appFigures } = await import("../../../functions/api/account/[[path]].js");
  assert.equal((await appFigures(env, c.id)).inflight.sent, 1);
  // Insights: pigeons letters only, messages apart
  const ins = await insights(env, D);
  assert.ok(ins.messages >= 3, `messages counted apart: ${ins.messages}`);
  const letters = one(`SELECT (SELECT COUNT(*) FROM pg_msgs WHERE instant IS NULL AND sent_at >= ?1) + (SELECT COUNT(*) FROM pg_gmsgs WHERE instant IS NULL AND sent_at >= ?1)
    + (SELECT COUNT(*) FROM pg_flights WHERE grp = 0 AND sent_at >= ?1) + (SELECT COUNT(DISTINCT msg_id) FROM pg_flights WHERE grp = 1 AND sent_at >= ?1) AS n`, ins.firstDay).n;
  assert.equal(ins.days.sent.reduce((x, y) => x + y, 0), letters, "pigeons sent: letters only");
  // the pulse feed and way lines are pruned in the hourly sweep
  put("pg_pulse", { user_id: a.id, chat: b.id + "x", at: t - 8 * day }); put("pg_wayev", { a: a.id, b: b.id, way: "instant", at: t - 31 * day });
  run("UPDATE pg_meta SET v = '0' WHERE k = 'sweep_at'");
  await tick(env, "http://localhost");
  assert.equal(one("SELECT 1 FROM pg_pulse WHERE chat = ?", b.id + "x"), undefined, "a week-old poke goes");
  assert.equal(one("SELECT 1 FROM pg_wayev WHERE a = ? AND at < ?", a.id, t - 30 * day), undefined, "a month-old line goes");
});

test("delete: ways, way lines and pulse rows go with the account", async () => {
  const a = await person("Kat"), b = await person("Lou"); befriend(a, b);
  await api(a, "POST", "way", { with: b.id, way: "instant" });
  put("pg_ways", { a: b.id, b: a.id, way: "pigeon", at: 0 });
  await send(a, b, { instant: true });
  assert.ok(q("SELECT 1 FROM pg_pulse WHERE user_id = ?1 OR chat = ?1", a.id).length > 0);
  await removeAccount(env, a.id);
  assert.equal(q("SELECT 1 FROM pg_ways WHERE a = ?1 OR b = ?1", a.id).length, 0);
  assert.equal(q("SELECT 1 FROM pg_wayev WHERE a = ?1 OR b = ?1", a.id).length, 0);
  assert.equal(q("SELECT 1 FROM pg_pulse WHERE user_id = ?1 OR chat = ?1", a.id).length, 0);
});

// ================================ the schema ================================
test("schema: the new setUp runs over a pre-release database and a fresh one", async () => {
  const { schema, migrations } = JSON.parse(readFileSync(new URL("./fixtures/schema-e564113.json", import.meta.url), "utf8"));
  // a database as the release before this left it: its SCHEMA in one batch, its MIGRATIONS one at a time, its one-time
  // blocks done, and a user, a friendship, a group and a letter that's landed in it
  const old = { DB: d1() };
  old.DB.sql.exec("BEGIN"); for (const s of schema) old.DB.sql.exec(s); old.DB.sql.exec("COMMIT");
  for (const m of migrations) { try { old.DB.sql.exec(m); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; } }
  const os = old.DB.sql, t = Date.now();
  for (const k of ["ids_v1", "emailok_v1", "pwat_v1"]) os.prepare("INSERT INTO pg_meta (k, v) VALUES (?, '1')").run(k);
  os.prepare("INSERT INTO pg_meta (k, v) VALUES ('schema_fp', 'old')").run();
  for (const id of ["u1", "u2"]) os.prepare("INSERT INTO pg_users (id, handle, name, email, pub, salt, proof_hash, vault, swift, swift_at, created_at) VALUES (?, ?, ?, ?, '{}', 's', 'p', 'v', 9, 0, 0)").run(id, id, id, `${id}@x.test`);
  os.prepare("INSERT INTO pg_links (a, b, status, created_at) VALUES ('u1', 'u2', 'ok', 0)").run();
  os.prepare("INSERT INTO pg_groups (id, name, created_by, created_at) VALUES ('g1', 'G', 'u1', 0)").run();
  os.prepare("INSERT INTO pg_group_members (group_id, user_id, added_by, joined_at) VALUES ('g1', 'u1', 'u1', 0)").run();
  os.prepare("INSERT INTO pg_msgs (id, sender, recipient, ct, km, sent_at, deliver_at, pigeon) VALUES ('m1', 'u1', 'u2', 'x', 300, ?, ?, 'standard')").run(t - 7200e3, t - 3600e3);
  os.prepare("INSERT INTO pg_msgs (id, sender, recipient, ct, km, sent_at, deliver_at, pigeon) VALUES ('m2', 'u2', 'u1', 'x', 300, ?, ?, 'standard')").run(t - 600e3, t + 3600e3);
  // the new setUp over it (a fresh copy of the server each time, as a deploy is), twice: the second time from scratch
  const fresh = (k) => import(`../../../functions/_pigeon.js?setup=${k}-${t}`);
  await (await fresh("a")).db(old);
  os.prepare("DELETE FROM pg_meta WHERE k = 'schema_fp'").run();
  await (await fresh("b")).db(old);
  const idx = os.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('pg_msgs_letters', 'pg_msgs_notgot', 'pg_gmsgs_letters', 'pg_gdeliv_notgot')").all().map((r) => r.name).sort();
  assert.deepEqual(idx, ["pg_gdeliv_notgot", "pg_gmsgs_letters", "pg_msgs_letters", "pg_msgs_notgot"], "the four partial indexes");
  assert.deepEqual(os.prepare("SELECT a, b, way, at FROM pg_ways ORDER BY a").all().map((r) => ({ ...r })), [{ a: "u1", b: "u2", way: "pigeon", at: 0 }, { a: "u2", b: "u1", way: "pigeon", at: 0 }], "every chat by pigeon");
  assert.equal(os.prepare("SELECT way FROM pg_group_members").get().way, "pigeon");
  assert.equal(os.prepare("SELECT got_at FROM pg_msgs WHERE id = 'm1'").get().got_at, t - 3600e3, "a landed letter delivered");
  assert.equal(os.prepare("SELECT got_at FROM pg_msgs WHERE id = 'm2'").get().got_at, null, "one in the air not yet");
  assert.equal(os.prepare("SELECT COUNT(*) AS n FROM pg_wayev").get().n, 0, "no lines in any chat");
  const u = os.prepare("SELECT pigeons, new_way, hide_typing, noted_at FROM pg_users WHERE id = 'u1'").get();
  assert.deepEqual({ ...u }, { pigeons: 1, new_way: "pigeon", hide_typing: 0, noted_at: null }, "an old account: pigeons on, the note to see");
  assert.equal(os.prepare("SELECT v FROM pg_meta WHERE k = 'instant_v1'").get().v, "1", "the backfill ran, once");
  // its keys marked, it doesn't run again: a member added since keeps their own way
  os.prepare("INSERT INTO pg_group_members (group_id, user_id, added_by, joined_at) VALUES ('g1', 'u2', 'u1', 0)").run();
  os.prepare("DELETE FROM pg_meta WHERE k = 'schema_fp'").run();
  await (await fresh("c")).db(old);
  assert.equal(os.prepare("SELECT way FROM pg_group_members WHERE user_id = 'u2'").get().way, null, "the backfill ran once only");
  // and a fresh, empty database
  const empty = { DB: d1() };
  await (await fresh("d")).db(empty);
  assert.equal(empty.DB.sql.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('pg_msgs_letters', 'pg_msgs_notgot', 'pg_gmsgs_letters', 'pg_gdeliv_notgot', 'pg_ways', 'pg_wayev', 'pg_pulse')").get().n, 7);
  assert.equal(empty.DB.sql.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE '%typing%'").get().n, 0, "no typing table, ever");
});

// ================================ a ride holds Chat's notifications (Today First, spec §8.7) ================================
await fitdb(env); await timesReady(env); await offersReady(env); await tddb(env);
const MIN = 60e3;
// a ride with a time (Ride At, or Ride Then: a tap), and its ride coming in (from Fitness), and the hold rule's level
const rideAt = (p, start, len = 60 * MIN) => run("INSERT OR REPLACE INTO fx_times (user_id, day, start, stop, tz, sport, source, made) VALUES (?, ?, ?, ?, 'UTC', 'ride', 'set', ?)", p.id, new Date(start).toISOString().slice(0, 10), start, start + len, start);
// (added: when it came in, now unless it's said)
const rodeIn = (p, start, added = Date.now()) => put("fx_acts", { user_id: p.id, id: crypto.randomUUID(), start, sport: "ride", type: "fit", size: 1, added });
const holdAt = (p, level) => run("INSERT INTO td_rules (user_id, rule, level) VALUES (?, 'holdRide', ?) ON CONFLICT(user_id, rule) DO UPDATE SET level = excluded.level", p.id, level);
const heldN = (p) => one("SELECT held FROM td_rules WHERE user_id = ? AND rule = 'holdRide'", p.id)?.held ?? 0;

test("a ride holds messages, group messages, reactions and requests at do; told when it's in, \"while you rode\", each counted in the rule's record", async () => {
  pushBurst.clear();
  const rider = await pushOn(await person("Rob Rider"), { names: true }), mira = await person("Mira Shah"), nia = await person("Nia");
  befriend(mira, rider); befriend(nia, rider);
  const start = Date.now() - 5 * MIN; rideAt(rider, start);
  // a message from Mira, and another: no push, left unclaimed for the tick
  pushes = [];
  const m1 = await send(mira, rider, { instant: true }), m2 = await send(mira, rider, { instant: true });
  assert.equal((await told(rider)).length, 0, "nothing while riding");
  assert.deepEqual([msgRow(m1.body.message.id).notified_at, msgRow(m2.body.message.id).notified_at], [null, null], "held: unclaimed");
  // a group's message
  const gid = crypto.randomUUID();
  put("pg_groups", { id: gid, name: "Riders", created_by: mira.id, created_at: 0 });
  for (const m of [mira, rider, nia]) put("pg_group_members", { group_id: gid, user_id: m.id, added_by: mira.id, joined_at: 0 });
  const g = await api(mira, "POST", "group-messages", { id: crypto.randomUUID(), group: gid, body: CT, keys: Object.fromEntries([mira, rider, nia].map((m) => [m.id, "k".repeat(30)])), instant: true });
  assert.equal(g.status, 200, JSON.stringify(g.body));
  // a reaction to the rider's own message, and a friend request
  const mine = await send(rider, nia, { instant: true });
  assert.equal((await api(nia, "POST", "react", { id: crypto.randomUUID(), msg: mine.body.message.id, ct: CT })).status, 200);
  const sol = await person("Sol"); put("pg_links", { a: sol.id, b: rider.id, status: "pending", created_at: Date.now() });
  await friendRequested(env, "http://localhost", { id: sol.id, name: "Sol", handle: "sol" }, rider.id);
  await tick(env, "http://localhost");
  assert.equal((await told(rider)).length, 0, "still riding: the tick holds them all");
  assert.equal(await heldCount(env, rider.id, start - 10 * MIN, { t: Date.now() }), 4, "two messages, the group's and the reaction, waiting");
  assert.equal(q("SELECT 1 FROM pg_held WHERE user_id = ? AND kind = 'request'", rider.id).length, 1, "the request kept");
  // the ride comes in: everything told, once, said as held
  rodeIn(rider, start + MIN);
  await tick(env, "http://localhost");
  const notes = (await told(rider)).map((x) => [x.title, x.body, x.app]).sort((a, b) => a[0].localeCompare(b[0]));
  assert.deepEqual(notes, [["Friend request", `Sol (@${one("SELECT handle FROM pg_users WHERE id = ?", sol.id).handle}) wants to be friends on Chat.`, "chat"], ["Mira", "Sent you 2 messages while you rode.", "chat"],
    ["Nia", "Reacted to your message.", "chat"], ["Riders", "Mira sent a message while you rode.", "chat"]]);
  assert.equal(heldN(rider), 2 + 1 + 1 + 1, "each held one counted: two messages, the group's, the reaction, the request");
  await tick(env, "http://localhost");
  assert.equal((await told(rider)).length, 4, "and only once");
  // now the ride's in, the next message comes at once (past the ten seconds a friend buzzes you in at most once)
  pushBurst.clear();
  await send(mira, rider, { instant: true });
  assert.ok((await told(rider)).some((x) => x.body === "Sent you 3 messages."), "as ever");
});

test("what came once the ride was in wasn't held: told as ever, not \"while you rode\", not counted; nor is one held from someone unfriended since", async (t) => {
  pushBurst.clear();
  const ray = await pushOn(await person("Ray Rider"), { names: true }), nia = await person("Nia Ross"), mira = await person("Mira Bell");
  befriend(nia, ray); befriend(mira, ray);
  // Ray's ride began 50 minutes ago (its cap an hour and ten minutes off), and came in 10 minutes ago
  const start = Date.now() - 50 * MIN; rideAt(ray, start); rodeIn(ray, start + MIN, Date.now() - 10 * MIN);
  pushes = [];
  // a reaction to Ray's message now (only the tick tells reactions), and Mira's message while her chat's open on his phone
  const mine = await send(ray, nia, { instant: true });
  assert.equal((await api(nia, "POST", "react", { id: crypto.randomUUID(), msg: mine.body.message.id, ct: CT })).status, 200);
  run("UPDATE pg_users SET open_chat = ?, open_at = ? WHERE id = ?", mira.id, Date.now(), ray.id);
  const m = await send(mira, ray, { instant: true });
  assert.equal(msgRow(m.body.message.id).notified_at, null, "open: left for the tick");
  run("UPDATE pg_users SET open_at = ? WHERE id = ?", Date.now() - 31e3, ray.id);
  await tick(env, "http://localhost");
  assert.deepEqual((await told(ray)).map((x) => [x.title, x.body]).sort((a, b) => a[0].localeCompare(b[0])), [["Mira", "Sent you a message."], ["Nia", "Reacted to your message."]]);
  assert.equal(heldN(ray), 0, "nothing came while he rode");
  // Rae, riding: a message from Sol, then Sol unfriends her; and one from Nia. Her ride comes in: Nia's told and counted,
  // Sol's lands untold and uncounted
  const rae = await pushOn(await person("Rae Rider"), { names: true }), sol = await person("Sol Hart");
  befriend(sol, rae); befriend(nia, rae);
  const began = Date.now() - 5 * MIN; rideAt(rae, began);
  pushes = []; pushBurst.clear();
  await send(sol, rae, { instant: true }); await send(nia, rae, { instant: true });
  assert.equal((await told(rae)).length, 0, "riding");
  run("DELETE FROM pg_links WHERE (a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1)", sol.id, rae.id);
  // The activity must arrive strictly after the messages, even on a fast CI runner.
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() + 1 });
  rodeIn(rae, began + MIN);
  await tick(env, "http://localhost");
  assert.deepEqual((await told(rae)).map((x) => [x.title, x.body]), [["Nia", "Sent you a message while you rode."]]);
  assert.equal(heldN(rae), 1, "Nia's counted; Sol's, told to no one, isn't");
});

test("a ride's hold: names off said plainly; released at the cap with no ride in; nothing of Chat's held at suggest or quiet, nor by a habit ride Today added by itself", async () => {
  pushBurst.clear();
  const mira = await person("Mira Kay");
  // names off, and no ride coming in: told at the cap
  const ann = await pushOn(await person("Ann"), {}); befriend(mira, ann);
  const start = Date.now() - 115 * MIN; rideAt(ann, start);
  pushes = [];
  const held = await send(mira, ann, { instant: true });
  await tick(env, "http://localhost");
  assert.equal((await told(ann)).length, 0, "an hour and 55 minutes in: still held");
  // (ten minutes on, as if: the ride and the message each ten minutes earlier, so its cap has passed)
  rideAt(ann, start - 10 * MIN);
  run("UPDATE pg_msgs SET sent_at = sent_at - ?1, deliver_at = deliver_at - ?1 WHERE id = ?2", 10 * MIN, held.body.message.id);
  await tick(env, "http://localhost");
  assert.deepEqual((await told(ann)).map((x) => x.body), ["A new message came while you rode."]);
  // at suggest (apps only) and at quiet: Chat's come at once
  for (const lv of ["suggest", "quiet"]) {
    const p = await pushOn(await person(`Sue ${lv}`), { names: true }); befriend(mira, p); rideAt(p, Date.now() - 5 * MIN); holdAt(p, lv);
    pushes = []; pushBurst.clear();
    await send(mira, p, { instant: true });
    assert.deepEqual((await told(p)).map((x) => x.body), ["Sent you a message."], lv);
  }
  // an auto-added habit ride (role today, yes, never tapped): holds nothing; kept with a tap, it does
  const hal = await pushOn(await person("Hal"), { names: true }); befriend(mira, hal);
  const oid = crypto.randomUUID(), at = Date.now() - 5 * MIN;
  put("fx_offers", { user_id: hal.id, id: oid, start: at, stop: at + 3600e3, tz: "UTC", sport: "ride", wid: "w", name: "Endurance", secs: 3600, who: "", role: "today", state: "yes", made: at, until: at + 13 * 3600e3, taken: 0 });
  pushes = []; pushBurst.clear();
  await send(mira, hal, { instant: true });
  assert.deepEqual((await told(hal)).map((x) => x.body), ["Sent you a message."], "an auto-added habit ride holds nothing");
  run("UPDATE fx_offers SET taken = 1 WHERE id = ?", oid);
  pushes = []; pushBurst.clear();
  await send(mira, hal, { instant: true });
  assert.equal((await told(hal)).length, 0, "kept with a tap: held");
});
