// Garmin Connect's scheduler turn (functions/_garmin.js garminTick), against a database of its own (Node's own SQLite in
// memory, standing in for D1): as many accounts asked as are due, the longest waiting first, up to six a turn, so each
// is asked every 15 minutes however many are connected (not two a turn, as it was, and the rest falling behind)
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { garminTick } from "../../../functions/_garmin.js";

function d1() {
  const s = new DatabaseSync(":memory:");
  const st = (sql, args = []) => ({
    bind: (...a) => st(sql, a),
    first: async () => s.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: s.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: Number(s.prepare(sql).run(...args).changes) } }),
    now: () => (/^\s*SELECT/i.test(sql) ? s.prepare(sql).all(...args) : s.prepare(sql).run(...args)),
  });
  return { s, prepare: (sql) => st(sql), async batch(list) { return list.map((x) => x.now()); } };
}

test("the scheduler's turn: every account that's due, longest waiting first, up to six", async (t) => {
  t.mock.method(console, "warn", () => {});
  // (no key that opens, and nowhere to reach: each ask fails at once, here, as asked)
  const DB = d1(), env = { DB, GARMIN_API: "http://127.0.0.1:9" }, now = Date.now();
  await garminTick(env);
  // (nine due: one never asked, eight last asked an hour or more ago; and one asked a minute ago, not due)
  for (let i = 0; i < 9; i++) DB.s.prepare("INSERT INTO fx_garmin (user_id, apikey, last, ok, added) VALUES (?, 'x', ?, 1, ?)").run(`u${i}`, i ? now - 3600e3 - i * 60e3 : null, now);
  DB.s.prepare("INSERT INTO fx_garmin (user_id, apikey, last, ok, added) VALUES ('fresh', 'x', ?, 1, ?)").run(now - 60e3, now);
  const asked = () => DB.s.prepare("SELECT user_id FROM fx_garmin WHERE last >= ? ORDER BY user_id").all(now).map((r) => r.user_id);
  assert.equal((await garminTick(env)).asked, 6);
  assert.deepEqual(asked(), ["u0", "u4", "u5", "u6", "u7", "u8"]);
  // (the next turn, the three left; the one asked a minute ago, not yet)
  assert.equal((await garminTick(env)).asked, 3);
  assert.deepEqual(asked(), ["u0", "u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8"]);
  assert.equal((await garminTick(env)).asked, 0);
});
