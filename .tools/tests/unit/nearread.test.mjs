// Security Module: session authority always comes from the primary; stale replicas cannot revive access.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { db, issueSession, sessionUser, sha256, hex } from "../../../functions/_pigeon.js";
import { withCookie } from "../../../functions/_account.js";

function d1(s = new DatabaseSync(":memory:"), seen = []) {
  const val = (a) => a.map((v) => (v === undefined ? null : typeof v === "boolean" ? Number(v) : v));
  const exec = (sql, args) => {
    const p = s.prepare(sql);
    if (p.columns().length) return { results: p.all(...val(args)), success: true, meta: { changes: 0 } };
    const r = p.run(...val(args));
    return { results: [], success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  };
  const st = (sql, args = []) => ({
    sql, args, bind: (...a) => st(sql, a),
    first: async (col) => { seen.push(sql); const row = s.prepare(sql).get(...val(args)) ?? null; return col && row ? row[col] ?? null : row; },
    all: async () => (seen.push(sql), exec(sql, args)), run: async () => (seen.push(sql), exec(sql, args)),
    raw: async () => s.prepare(sql).all(...val(args)).map((r) => Object.values(r)),
    now: () => exec(sql, args),
  });
  return { sql: s, seen, prepare: (q) => st(q),
    async batch(list) { s.exec("BEGIN"); try { const r = list.map((x) => x.now()); s.exec("COMMIT"); return r; } catch (e) { s.exec("ROLLBACK"); throw e; } } };
}
const said = console.error;
console.error = () => {};
test.after(() => { console.error = said; });

const main = d1(), copy = d1();
let sessions = 0;
main.withSession = (b) => { sessions++; assert.equal(b, "first-primary"); return main; };
const env = { DB: main };
await db(env);
// (the copy: the main one as it was, a moment ago)
const snapshot = () => { for (const t of ["pg_users", "pg_sessions"]) {
  const cols = main.sql.prepare(`SELECT sql FROM sqlite_master WHERE name = ?`).get(t).sql;
  copy.sql.exec(`DROP TABLE IF EXISTS ${t}`); copy.sql.exec(cols);
  for (const r of main.sql.prepare(`SELECT * FROM ${t}`).all()) copy.sql.prepare(`INSERT INTO ${t} (${Object.keys(r).join(",")}) VALUES (${Object.keys(r).map(() => "?").join(",")})`).run(...Object.values(r));
} };
const ANN = "00000000-0000-4000-8000-00000000a001";
main.sql.prepare("INSERT INTO pg_users (id, handle, name, email, pub, salt, proof_hash, vault, swift, swift_at, created_at) VALUES (?, 'ann', 'Ann Smith', 'ann@example.com', '{}', 's', 'p', 'v', 9, 0, 0)").run(ANN);
const req = (method = "GET", cookie = "") => new Request("https://inflite.ai/api/session", { method, headers: cookie ? { Cookie: cookie } : {} });
const asked = () => { const n = { main: main.seen.filter((q) => /FROM pg_sessions s JOIN/.test(q)).length, copy: copy.seen.filter((q) => /FROM pg_sessions s JOIN/.test(q)).length }; main.seen.length = 0; copy.seen.length = 0; return n; };

test("a GET resolves session authority on the primary even when a replica has a copy", async () => {
  const token = await issueSession(env, ANN, req("POST"));
  snapshot(); asked();
  const u = await sessionUser(env, token, false, false, req());
  assert.equal(u.id, ANN);
  assert.deepEqual(asked(), { main: 1, copy: 0 });
});

test("a sign-in made a moment ago, not on the copy yet: asked again of the main one, and found", async () => {
  snapshot();
  const token = await issueSession(env, ANN, req("POST"));      // (after the copy was taken)
  asked();
  const u = await sessionUser(env, token, false, false, req());
  assert.equal(u.id, ANN, "never turned away for the copy being behind");
  assert.deepEqual(asked(), { main: 1, copy: 0 });
});

test("anything that changes something (POST), or a browser that's just changed its sign-in (ifl_rw): the main one only", async () => {
  const token = await issueSession(env, ANN, req("POST"));
  snapshot(); asked(); const before = sessions;
  await sessionUser(env, token, false, false, req("POST"));
  assert.deepEqual(asked(), { main: 1, copy: 0 });
  await sessionUser(env, token, false, false, req("GET", "ifl_rw=1; other=2"));
  assert.deepEqual(asked(), { main: 1, copy: 0 });
  assert.equal(sessions, before + 2, "both requests explicitly use primary consistency");
});

test("handed over, on the copy: asked of the main one, where showing it's you may have ended it", async () => {
  const token = await issueSession(env, ANN, req("POST"));
  main.sql.prepare("UPDATE pg_sessions SET handed = 1 WHERE hash = ?").run(hex(await sha256(token)));
  snapshot();
  main.sql.prepare("UPDATE pg_sessions SET handed = NULL WHERE hash = ?").run(hex(await sha256(token)));     // (shown it's you since)
  asked();
  const u = await sessionUser(env, token, false, false, req());
  assert.equal(u.handed, false, "the main one's word");
  assert.deepEqual(asked(), { main: 1, copy: 0 });
});

test("no copies (no withSession, as here without D1's replicas, and in the tests' database): the main one, as ever", async () => {
  const plain = { DB: d1(main.sql) };
  const token = await issueSession(plain, ANN, req("POST"));
  assert.equal((await sessionUser(plain, token, false, false, req())).id, ANN);
});

test("every sign-in cookie set carries the mark, for a minute, for the whole site", () => {
  const res = withCookie(new Response("x"), new Request("https://auth.inflite.ai/api/account/signin/password"), {}, "t".repeat(43));
  const set = res.headers.getSetCookie();
  assert.ok(set.some((c) => /^ifl_rw=1; .*Domain=inflite\.ai.*Max-Age=60$/.test(c)), set.join(" | "));
});


test('a revoked session is refused while its old replica copy still exists', async()=>{const token=await issueSession(env,ANN,req('POST'));snapshot();main.sql.prepare('DELETE FROM pg_sessions WHERE hash=?').run(hex(await sha256(token)));await assert.rejects(()=>sessionUser(env,token,false,false,req()),e=>e.status===401);assert.ok(copy.sql.prepare('SELECT 1 FROM pg_sessions WHERE hash=?').get(hex(await sha256(token))));});
test('every session resolver rejects a captured account mismatch before returning private identity',async()=>{const token=await issueSession(env,ANN,req('POST'));const hash=hex(await sha256(token));main.sql.prepare('UPDATE pg_sessions SET seen_at=? WHERE hash=?').run(Date.now()-7200000,hash);const before=main.sql.prepare('SELECT apps,seen_at FROM pg_sessions WHERE hash=?').get(hash);const r=new Request('https://inflite.ai/api/fitness/me',{headers:{'X-Inflite-Owner':'another-account'}});await assert.rejects(()=>sessionUser(env,token,false,false,r),e=>e.status===401&&e.field==='session'&&e.capturedAccount);assert.deepEqual(main.sql.prepare('SELECT apps,seen_at FROM pg_sessions WHERE hash=?').get(hash),before);});
