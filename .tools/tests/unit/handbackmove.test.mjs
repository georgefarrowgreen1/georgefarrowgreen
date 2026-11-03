// Chat's hand-back keeps every row tied to the sign-in it moves (Today First, spec §11.3): when the account's page hands
// a sign-in back to Chat in a browser whose cookie is that very sign-in, Chat's own takes its place, and every column
// that pointed at the old one (functions/_sessions.js SESSION_COLUMNS: Chat's codes, links and phones, its hops and QR
// sign-ins, Today's morning, Markets', Fitness's and Weather's devices) points at the new one, in the same batch that
// deletes the old sign-in. Then Weather's device so moved is still the account's after its tick looks for devices whose
// sign-in has ended (functions/_wxpush.js unlinkEnded), as one left pointing at the old sign-in would not be. Run
// through Chat's own router (functions/api/pigeon) against Node's SQLite made to look like D1.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { db, issueSession, sha256, hex, b64url } from "../../../functions/_pigeon.js";
import { onRequest } from "../../../functions/api/pigeon/[[path]].js";
import { SESSION_COLUMNS } from "../../../functions/_sessions.js";
import { tddb } from "../../../functions/_today.js";
import { mkdb } from "../../../functions/_markets.js";
import { wxdb, unlinkEnded } from "../../../functions/_wxpush.js";
import { morningOf } from "../../../functions/_fitpush.js";

// ---- D1 (as instant.test.mjs has it: a PRAGMA answered with its rows), every batch's statements noted ----
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
    sql, args, bind: (...a) => st(sql, a),
    first: async (col) => { const row = s.prepare(sql).get(...val(args)) ?? null; return col && row ? row[col] ?? null : row; },
    all: async () => exec(sql, args), run: async () => exec(sql, args),
    raw: async () => s.prepare(sql).all(...val(args)).map((r) => Object.values(r)),
    now: () => exec(sql, args),
  });
  return { sql: s, prepare: (q) => st(q),
    async batch(list) { batches.push(list.map((x) => ({ sql: x.sql, args: x.args }))); s.exec("BEGIN"); try { const r = list.map((x) => x.now()); s.exec("COMMIT"); return r; } catch (e) { s.exec("ROLLBACK"); throw e; } } };
}
const said = console.error;
console.error = () => {};
test.after(() => { console.error = said; });

const env = { DB: d1(), WX_TRAFFIC_TICK: "0" };
const S = env.DB.sql;
// every table with a sign-in column made as its own code makes it (pg_hops and pg_qrsign's column, made by their modules
// as they're first used, with the same words)
await db(env); await tddb(env); await mkdb(env); await wxdb(env); await morningOf(env, "nobody");
S.exec("CREATE TABLE IF NOT EXISTS pg_hops (hash TEXT PRIMARY KEY, note TEXT NOT NULL, user_id TEXT NOT NULL, session TEXT NOT NULL, auth_at INTEGER, held INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL)");
try { S.exec("ALTER TABLE pg_qrsign ADD COLUMN session TEXT"); } catch (_) { /* there already */ }
S.prepare("INSERT OR REPLACE INTO pg_meta (k, v) VALUES ('tick', '99999999999999'), ('notify_since', '0')").run();
const one = (sql, ...a) => S.prepare(sql).get(...a), run = (sql, ...a) => S.prepare(sql).run(...a);
const put = (table, row) => S.prepare(`INSERT INTO ${table} (${Object.keys(row).join(", ")}) VALUES (${Object.keys(row).map(() => "?").join(", ")})`).run(...Object.values(row).map((v) => (v === undefined ? null : typeof v === "boolean" ? Number(v) : v)));

const ANN = "00000000-0000-4000-8000-00000000a001", BO = "00000000-0000-4000-8000-00000000b002";
for (const [id, name] of [[ANN, "Ann Smith"], [BO, "Bo Jones"]])
  put("pg_users", { id, handle: name.split(" ")[0].toLowerCase(), name, email: `${id}@example.com`, pub: "{}", salt: "s", proof_hash: "p", vault: "v", swift: 9, swift_at: 0, created_at: 0 });
const t = Date.now();
// one row in each table tied to a sign-in (sess: that sign-in's hash), and one tied to another, which nothing moves
function rowsFor(sess, tag, user = ANN) {
  put("pg_handback", { hash: `hb-${tag}`, user_id: user, session: sess, app: "weather", ask: "a".repeat(43), expires: t + 60e3 });
  put("pg_handoff", { hash: `ho-${tag}`, user_id: user, session: sess, expires: t + 60e3 });
  put("pg_push", { endpoint: `https://fcm.googleapis.com/fcm/send/pg-${tag}`, user_id: user, session: sess, p256dh: "k", auth: "a", created_at: t });
  put("pg_hops", { hash: `hop-${tag}`, note: "n", user_id: user, session: sess, expires_at: t + 60e3 });
  put("pg_qrsign", { hash: `qr-${tag}`, poll: `poll-${tag}`, num: 1, picks: "[]", user_id: user, state: "yes", expires: t + 60e3, session: sess });
  put("td_push", { endpoint: `https://fcm.googleapis.com/fcm/send/td-${tag}`, user_id: user, p256dh: "k", auth: "a", session: sess, added: t });
  put("mk_push", { endpoint: `https://fcm.googleapis.com/fcm/send/mk-${tag}`, user_id: user, p256dh: "k", auth: "a", added: t, session: sess });
  put("fx_push", { endpoint: `https://fcm.googleapis.com/fcm/send/fx-${tag}`, user_id: user, p256dh: "k", auth: "a", at: 420, tz: "Europe/London", added: t, session: sess });
  put("wx_devs", { dev: `dev-${tag}`, endpoint: `https://fcm.googleapis.com/fcm/send/wx-${tag}`, p256dh: "k", auth: "a", user_id: user, created: t, updated: t, sess });
}
// (each table's rows by tag: the column SESSION_COLUMNS names for it)
const KEY = { pg_handback: "hash", pg_handoff: "hash", pg_push: "endpoint", pg_hops: "hash", pg_qrsign: "hash", td_push: "endpoint", mk_push: "endpoint", fx_push: "endpoint", wx_devs: "dev" };
const sessOf = (table, tag) => one(`SELECT ${SESSION_COLUMNS[table]} AS s FROM ${table} WHERE ${KEY[table]} LIKE ?`, `%-${tag}`)?.s;

// the account's page made a sign-in (the browser's cookie, for the site), and a code handing it back to Chat
async function pageSignIn(user) {
  const token = await issueSession(env, user, new Request("http://localhost/"));
  const cookie = b64url(crypto.getRandomValues(new Uint8Array(32)));
  run("UPDATE pg_sessions SET site_hash = ? WHERE hash = ?", hex(await sha256(cookie)), hex(await sha256(token)));
  const code = b64url(crypto.getRandomValues(new Uint8Array(24))), verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  put("pg_handback", { hash: hex(await sha256(code)), user_id: user, session: hex(await sha256(token)), app: "inflight", ask: b64url(await sha256(verifier)), box: "b".repeat(48), expires: t + 120e3 });
  return { hash: hex(await sha256(token)), cookie, code, verifier };
}
const handback = (p, { cookie = p.cookie } = {}) => onRequest({ env, params: {}, waitUntil: () => {},
  request: new Request("http://localhost/api/pigeon/handback", { method: "POST", body: JSON.stringify({ code: p.code, verifier: p.verifier }),
    headers: { Origin: "http://localhost", "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.7", ...(cookie ? { Cookie: `account=${cookie}` } : {}) } }) });

test("a hand-back that moves the cookie's sign-in moves every SESSION_COLUMNS row with it, in the batch that deletes the old one", async () => {
  const page = await pageSignIn(ANN), other = await issueSession(env, ANN, new Request("http://localhost/")), otherHash = hex(await sha256(other));
  rowsFor(page.hash, "page"); rowsFor(otherHash, "other");
  batches.length = 0;
  const res = await handback(page);
  assert.equal(res.status, 200, await res.clone().text());
  const { token } = await res.json(), hash = hex(await sha256(token));
  assert.notEqual(hash, page.hash);
  assert.equal(one("SELECT 1 AS x FROM pg_sessions WHERE hash = ?", page.hash), undefined, "the page's sign-in gone");
  assert.ok(one("SELECT 1 AS x FROM pg_sessions WHERE hash = ?", hash), "Chat's own there");
  assert.deepEqual(Object.keys(SESSION_COLUMNS).sort(), Object.keys(KEY).sort(), "every listed table has a row here");
  for (const table of Object.keys(SESSION_COLUMNS)) {
    assert.equal(sessOf(table, "page"), hash, `${table}.${SESSION_COLUMNS[table]}: follows to Chat's sign-in`);
    assert.equal(sessOf(table, "other"), otherHash, `${table}: another sign-in's row left alone`);
  }
  // one batch: every UPDATE and the old sign-in's DELETE together
  const moved = batches.find((b) => b.some((q) => /^DELETE FROM pg_sessions WHERE hash = \?/.test(q.sql)));
  assert.ok(moved, "the old sign-in deleted in a batch");
  for (const [table, col] of Object.entries(SESSION_COLUMNS))
    assert.ok(moved.some((q) => q.sql === `UPDATE ${table} SET ${col} = ? WHERE ${col} = ?` && q.args[0] === hash && q.args[1] === page.hash), `${table}'s move in that same batch`);
});

test("Weather's device so moved survives unlinkEnded, as one left on the old sign-in would not", async () => {
  // (the first test's device: moved; and a device of Bo's on a sign-in that's since been deleted, as the old code left it)
  const ended = await issueSession(env, BO, new Request("http://localhost/")), endedHash = hex(await sha256(ended));
  rowsFor(endedHash, "ended", BO);
  run("DELETE FROM pg_sessions WHERE hash = ?", endedHash);
  await unlinkEnded(await wxdb(env));
  const moved = one("SELECT user_id, sess FROM wx_devs WHERE dev = 'dev-page'");
  assert.equal(moved.user_id, ANN, "still the account's"); assert.ok(moved.sess, "and still on a sign-in");
  assert.ok(one("SELECT 1 AS x FROM pg_sessions WHERE hash = ?", moved.sess), "one that's there");
  assert.deepEqual({ ...one("SELECT user_id, sess FROM wx_devs WHERE dev = 'dev-ended'") }, { user_id: null, sess: null }, "a device whose sign-in ended: no longer the account's");
});

test("a hand-back in a browser whose cookie isn't that sign-in moves nothing (the page's sign-in stays, and its rows with it)", async () => {
  const page = await pageSignIn(BO);
  rowsFor(page.hash, "bo");
  batches.length = 0;
  const res = await handback(page, { cookie: null });
  assert.equal(res.status, 200, await res.clone().text());
  assert.ok(one("SELECT 1 AS x FROM pg_sessions WHERE hash = ?", page.hash), "the page's sign-in still there");
  for (const table of Object.keys(SESSION_COLUMNS)) assert.equal(sessOf(table, "bo"), page.hash, `${table}: left where it was`);
  assert.ok(!batches.some((b) => b.some((q) => /^UPDATE \w+ SET (session|sess) = \?/.test(q.sql))), "no move at all");
});
