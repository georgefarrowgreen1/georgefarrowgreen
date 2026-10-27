// An account gone (functions/_fitness.js dropFitness): everything Fitness kept with it goes, the nights and the
// Shortcut's key included, and its files
import { test } from "node:test";
import assert from "node:assert/strict";
import { dropFitness } from "../../../functions/_fitness.js";

test("deleting an account takes its activities, files, Garmin key, phones, nights and Apple Health key", async () => {
  const ran = [], deleted = [];
  const st = (sql) => { const s = { sql, args: [], bind: (...a) => { s.args = a; return s; }, run: async () => { ran.push(s); return { meta: { changes: 0 } }; }, first: async () => null, all: async () => ({ results: [] }) }; return s; };
  const DB = { prepare: st, batch: async (xs) => { ran.push(...xs); return []; } };
  const BIO_R2 = { list: async () => ({ objects: [{ key: "fitness/u1/a" }], truncated: false }), delete: async (k) => deleted.push(k) };
  await dropFitness({ DB, BIO_R2 }, "u1");
  const gone = ran.filter((s) => /^DELETE FROM/.test(s.sql) && s.args[0] === "u1").map((s) => /^DELETE FROM (\w+)/.exec(s.sql)[1]);
  for (const t of ["fx_acts", "fx_state", "fx_garmin", "fx_garmin_new", "fx_push", "fx_well", "fx_health", "fx_health_key"]) assert.ok(gone.includes(t), t);
  assert.deepEqual(deleted, [["fitness/u1/a"]]);
});
