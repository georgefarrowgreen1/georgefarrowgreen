// Fitness's morning notification (functions/_fitpush.js), run against a database of its own (Node's own SQLite in
// memory, standing in for D1, with the site's schema): each phone's kept with the sign-in it was turned on with, and
// once that's gone (signed out from Signed-in devices, a new password) or the account's being deleted, the phone's
// forgotten at the scheduler's next turn, not sent the days of words it still has.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { db } from "../../../functions/_pigeon.js";
import { setMorning, morningTick } from "../../../functions/_fitpush.js";

function d1() {
  const s = new DatabaseSync(":memory:");
  const st = (sql, args = []) => ({
    bind: (...a) => st(sql, a),
    first: async () => s.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: s.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: Number(s.prepare(sql).run(...args).changes) } }),
    now: () => (/^\s*SELECT|\bRETURNING\b/i.test(sql) ? s.prepare(sql).all(...args) : s.prepare(sql).run(...args)),
  });
  return { prepare: (sql) => st(sql), async batch(list) { s.exec("BEGIN"); try { const r = list.map((x) => x.now()); s.exec("COMMIT"); return r; } catch (e) { s.exec("ROLLBACK"); throw e; } } };
}
const env = { DB: d1() }, D = await db(env), t = Date.now();
for (const id of ["u1", "u2"]) await D.prepare("INSERT INTO pg_users (id, handle, name, email, pub, salt, proof_hash, vault, swift, swift_at, created_at) VALUES (?1, ?1, ?1, ?1 || '@example.com', '{}', 's', 'p', 'v', 3, ?2, ?2)").bind(id, t).run();
for (const [hash, user] of [["sA", "u1"], ["sB", "u1"], ["sC", "u2"]]) await D.prepare("INSERT INTO pg_sessions (hash, user_id, created_at, seen_at) VALUES (?, ?, ?, ?)").bind(hash, user, t, t).run();

// a phone's subscription, as a browser makes one: a P-256 public key and a 16-byte secret
async function phone(n) {
  const k = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const p256dh = Buffer.from(await crypto.subtle.exportKey("raw", k.publicKey)).toString("base64url"), auth = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url");
  return { endpoint: `https://web.push.apple.com/phone-${n}`, keys: { p256dh, auth } };
}
const left = async () => (await D.prepare("SELECT endpoint FROM fx_push ORDER BY endpoint").all()).results.map((r) => r.endpoint.split("/").pop());

test("a phone whose sign-in has gone, or whose account is being deleted, is forgotten; the rest are kept", async () => {
  const on = (n, user, session) => phone(n).then((sub) => setMorning(env, user, { sub, at: 7 * 60, tz: "Europe/London", days: {} }, session));
  await on(1, "u1", "sA"); await on(2, "u1", "sB"); await on(3, "u1", null); await on(4, "u2", "sC");
  assert.deepEqual(await left(), ["phone-1", "phone-2", "phone-3", "phone-4"]);
  // signed out from Signed-in devices on the first phone; and the second account asks to be deleted
  await D.prepare("DELETE FROM pg_sessions WHERE hash = 'sA'").run();
  await D.prepare("UPDATE pg_users SET delete_at = ? WHERE id = 'u2'").bind(t + 7 * 86400e3).run();
  await morningTick(env, t);
  // (the third was turned on before the sign-in was kept with it: kept, till it's sent again with one)
  assert.deepEqual(await left(), ["phone-2", "phone-3"]);
});
