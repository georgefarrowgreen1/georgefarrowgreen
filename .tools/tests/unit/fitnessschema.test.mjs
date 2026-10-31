// Fitness's tables (functions/_fitness.js fitdb and tablesOnce), against a database of their own (Node's own SQLite in
// memory, standing in for D1): each part's tables made once for each change to them, so a new copy of the server,
// with everything made already, makes one look and no more before it can answer
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

function d1(said) {
  const s = new DatabaseSync(":memory:");
  const st = (sql, args = []) => ({
    bind: (...a) => st(sql, a),
    first: async () => { said.push(sql); return s.prepare(sql).get(...args) ?? null; },
    all: async () => { said.push(sql); return { results: s.prepare(sql).all(...args) }; },
    run: async () => { said.push(sql); return { meta: { changes: Number(s.prepare(sql).run(...args).changes) } }; },
    now: () => { said.push(sql); return /^\s*SELECT/i.test(sql) ? s.prepare(sql).all(...args) : s.prepare(sql).run(...args); },
  });
  return { prepare: (sql) => st(sql), async batch(list) { return list.map((x) => x.now()); } };
}
// (a new copy of the server: the module afresh, as a new isolate has it, over the same database)
let copies = 0;
const server = () => import(`../../../functions/_fitness.js?copy=${++copies}`);

test("a part's tables: made once, then known from fitdb's one look, even by a new copy of the server", async () => {
  const said = [], env = { DB: d1(said) };
  let made = 0;
  const make = async (D) => { made++; await D.prepare("CREATE TABLE IF NOT EXISTS fx_try (id TEXT PRIMARY KEY)").run(); };
  // (the first: everything made, and kept as made)
  const first = await server();
  await first.tablesOnce(env, "try", make);
  assert.equal(made, 1);
  await first.tablesOnce(env, "try", make);
  assert.equal(made, 1, "not made again by the same copy");
  // (a new copy, everything made already: one look, nothing made)
  said.length = 0;
  const second = await server();
  const D = await second.tablesOnce(env, "try", make);
  assert.equal(made, 1, "not made again by a new copy");
  assert.equal(said.length, 1, `one look, not ${said.length}: ${said.join(" | ")}`);
  assert.match(said[0], /^SELECT k, v FROM fx_meta/);
  assert.ok(await D.prepare("SELECT id FROM fx_try").all(), "and the table there");
});
test("a change to a part's tables: made again, once", async () => {
  const env = { DB: d1([]) };
  let runs = 0;
  await (await server()).tablesOnce(env, "try", async () => { runs++; });
  await (await server()).tablesOnce(env, "try", async () => { runs++; /* changed: a column added, say */ });
  await (await server()).tablesOnce(env, "try", async () => { runs++; /* changed: a column added, say */ });
  assert.equal(runs, 2);
});
