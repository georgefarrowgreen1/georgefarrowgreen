// Every push says which app it's from (Today First, spec §11.3), sealed inside it with the rest, so the one service worker
// at inflite.ai that shows every app's opens the right one; an older worker ignores it. pushToSub passes note.app on;
// pushTo (Chat's own devices) says "chat" where its caller didn't say; each direct pushToSub caller in this batch's
// files says its own (Weather, Fitness, Markets); and a new sign-in's place is read through cfOf (the hub's own place
// for the browser, where InFlite passed one on: functions/_sites.js). Each payload opened as the phone would.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { db } from "../../../functions/_pigeon.js";
import { pushTo, pushToSub } from "../../../functions/_notify.js";
import { setMorning, morningTick } from "../../../functions/_fitpush.js";
import { tellSignIn } from "../../../functions/_account.js";

const ROOT = new URL("../../../", import.meta.url);
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

// ---- the push service, stood in for: each push kept, and opened with the phone's own keys (RFC 8291) ----
const PUSH = "http://push.test/push", wc = crypto.subtle, te = new TextEncoder();
let pushes = [];
const realFetch = globalThis.fetch, said = console.error;
globalThis.fetch = async (url, o = {}) => { if (String(url) === PUSH) { pushes.push({ endpoint: o.headers["X-Endpoint"], body: new Uint8Array(o.body) }); return new Response("", { status: 201 }); } return new Response("{}", { status: 404 }); };
console.error = () => {};
test.after(() => { globalThis.fetch = realFetch; console.error = said; });
async function phone(name) {
  const kp = await wc.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]), authBytes = crypto.getRandomValues(new Uint8Array(16)), pub = new Uint8Array(await wc.exportKey("raw", kp.publicKey));
  return { kp, pub, authBytes, endpoint: `https://fcm.googleapis.com/fcm/send/pushapp-${name}`, p256dh: Buffer.from(pub).toString("base64url"), auth: Buffer.from(authBytes).toString("base64url") };
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
const told = async (ph) => { const out = []; for (const p of pushes.filter((x) => x.endpoint === ph.endpoint)) out.push(await opened(ph, p.body)); return out; };

const env = { DB: d1(), PIGEON_PUSH_URL: PUSH };
await db(env);
const run = (q, ...a) => env.DB.sql.prepare(q).run(...a);
const T = Date.now();
function person(id, prefs = {}) {
  run("INSERT INTO pg_users (id, handle, name, email, pub, salt, proof_hash, vault, swift, swift_at, created_at, notify_prefs) VALUES (?1, ?1, ?1, ?1 || '@example.com', '{}', 's', 'p', 'v', 3, 0, 0, ?2)", id, JSON.stringify(prefs));
  run("INSERT INTO pg_sessions (hash, user_id, created_at, seen_at) VALUES (?, ?, ?, ?)", `s-${id}`, id, T, T);
}

test("every direct pushToSub caller in this batch's files says which app it's from", () => {
  const want = { "functions/_wxpush.js": "weather", "functions/_fitpush.js": "fitness", "functions/_markets.js": "markets" };
  for (const [file, app] of Object.entries(want)) {
    const src = readFileSync(new URL(file, ROOT), "utf8");
    const name = /import\s*\{[^}]*\bpushToSub(?:\s+as\s+(\w+))?[^}]*\}\s*from\s*"\.\/_notify\.js"/.exec(src);
    assert.ok(name, `${file} imports pushToSub`);
    const fn = name[1] || "pushToSub";
    // (each call of the imported function, its arguments to the closing bracket)
    const calls = [];
    for (const m of src.matchAll(new RegExp(`\\b${fn}\\(`, "g"))) {
      let depth = 0, i = m.index + fn.length;
      for (; i < src.length; i++) { if (src[i] === "(") depth++; else if (src[i] === ")" && --depth === 0) break; }
      calls.push(src.slice(m.index, i + 1));
    }
    assert.ok(calls.length >= 1, `${file}: ${fn} called`);
    for (const c of calls) assert.match(c, new RegExp(`app: "${app}"`), `${file}: ${c.slice(0, 90)}…`);
  }
});

test("pushTo: Chat's own devices told it's Chat's, where the caller didn't say; one that says is kept; pushToSub alone adds nothing", async () => {
  person("mira"); const ph = await phone("mira");
  run("INSERT INTO pg_push (endpoint, user_id, session, p256dh, auth, created_at) VALUES (?, 'mira', 's-mira', ?, ?, ?)", ph.endpoint, ph.p256dh, ph.auth, T);
  pushes = [];
  assert.equal(await pushTo(env, "mira", { title: "Chat", body: "Notifications are on.", tag: "test", url: "/pigeon/" }), 1);
  const note = { title: "Leo", body: "Sent you a message.", tag: "msg-leo", url: "/pigeon/#open=leo" };
  await pushTo(env, "mira", note);
  assert.equal(note.app, undefined, "the caller's note left as it was");
  await pushTo(env, "mira", { ...note, app: "today" });
  await pushToSub(env, ph, { title: "Old", body: "An old payload", tag: "old", url: "./" });
  assert.deepEqual((await told(ph)).map((x) => x.app ?? null), ["chat", "chat", "today", null]);
  assert.deepEqual(await told(ph).then((l) => l[1]), { title: "Leo", body: "Sent you a message.", tag: "msg-leo", url: "/pigeon/#open=leo", app: "chat" }, "the old URL kept, so an older worker still opens Chat");
});

test("Fitness's morning says it's Fitness's", async () => {
  person("leo"); const ph = await phone("leo"), t = Date.UTC(2026, 10, 3, 7, 5);
  await setMorning(env, "leo", { sub: { endpoint: ph.endpoint, keys: { p256dh: ph.p256dh, auth: ph.auth } }, at: 420, tz: "UTC", days: { "2026-11-03": { title: "Endurance 75", body: "1h 15m, steady." } } }, "s-leo");
  pushes = [];
  assert.equal((await morningTick(env, t)).sent, 1);
  assert.deepEqual((await told(ph)).map((x) => [x.app, x.title]), [["fitness", "Endurance 75"]]);
});

test("a new sign-in: told on Chat's devices as Chat's, with where it was through cfOf", async () => {
  person("pat"); const ph = await phone("pat");
  run("INSERT INTO pg_push (endpoint, user_id, session, p256dh, auth, created_at) VALUES (?, 'pat', 's-pat', ?, ?, ?)", ph.endpoint, ph.p256dh, ph.auth, T);
  const request = new Request("https://chat.inflite.ai/api/pigeon/login", { headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1" } });
  Object.defineProperty(request, "cf", { value: { country: "FR", city: "Paris" } });
  pushes = [];
  await tellSignIn(env, { id: "pat", name: "Pat", handle: "pat", email: "pat@example.com" }, request, "Password", "https://chat.inflite.ai");
  const [n] = await told(ph);
  assert.equal(n.app, "chat");
  assert.equal(n.body, "Your Chat account was signed in on iPhone · Safari in France. Not you? Sign it out in Privacy & Security.");
});

test('push delivery does not follow a provider redirect or log its response body', async () => {
  const ph=await phone('redirect'), previous=globalThis.fetch, logger=console.error, requests=[], logs=[];
  globalThis.fetch=async (url, init) => { requests.push({url,init}); return new Response('PRIVATE PROVIDER BODY',{status:307,headers:{Location:'https://untrusted.example/collect'}}); };
  console.error=(...args)=>logs.push(args.join(' '));
  try {
    assert.equal(await pushToSub(env,ph,{title:'Notice',body:'Private text',url:'/'}),'error');
    assert.equal(requests.length,1); assert.equal(requests[0].init.redirect,'manual');
    assert.ok(!logs.join(' ').includes('PRIVATE PROVIDER BODY'));
  } finally { globalThis.fetch=previous; console.error=logger; }
});
