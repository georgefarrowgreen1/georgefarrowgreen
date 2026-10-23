// The stray-file sweep (functions/_retention.js sweepFiles): files over a day old that nothing points to go;
// everything else stays, and it works through storage a page at a time, one kind of file after another.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sweepFiles } from '../../../functions/_retention.js';

const DAY = 864e5, T = Date.UTC(2026, 9, 18);
function fakes(objects, live) {
  const meta = new Map(), deleted = [];
  const R2 = {
    async list({ prefix, cursor, limit }) {
      const all = objects.filter((o) => o.key.startsWith(prefix)), from = cursor ? Number(cursor) : 0, page = all.slice(from, from + limit);
      return { objects: page, truncated: from + limit < all.length, cursor: String(from + limit) };
    },
    async delete(keys) { deleted.push(...[].concat(keys)); },
  };
  const D = { prepare(sql) {
    let args = [];
    const st = { bind(...a) { args = a; return st; },
      async first() { return /FROM pg_meta/.test(sql) && meta.has('r2_sweep') ? { v: meta.get('r2_sweep') } : null; },
      async all() { const table = /FROM (pg_\w+)/.exec(sql)[1]; return { results: args.filter((id) => live[table]?.has(id)).map((id) => ({ id })) }; },
      async run() { if (/INTO pg_meta/.test(sql)) meta.set('r2_sweep', args[0]); return { meta: {} }; } };
    return st;
  } };
  return { env: { BIO_R2: R2 }, D, deleted, meta };
}
const obj = (key, age) => ({ key, uploaded: new Date(T - age), size: 100 });

test('only old files that nothing points to are deleted', async () => {
  const f = fakes([obj('pigeon/a', 2 * DAY), obj('pigeon/b', 2 * DAY), obj('pigeon/c', 3600e3)], { pg_msgs: new Set(['a']) });
  const n = await sweepFiles(f.env, f.D, T);
  assert.equal(n, 1);
  assert.deepEqual(f.deleted, ['pigeon/b']);        // a: its message has it; c: under a day old (it may be being sent)
});

test('a page at a time, then on to the next kind of file', async () => {
  const objects = [...Array(5)].map((_, i) => obj(`pigeon/m${i}`, 2 * DAY)).concat([obj('pigeon-g/g1', 2 * DAY), obj('pigeon-avatars/u1', 2 * DAY), obj('pigeon-avatars/u2', 2 * DAY),
    obj('pigeon-posters/u1', 2 * DAY), obj('pigeon-posters/u3', 2 * DAY)]);
  const f = fakes(objects, { pg_msgs: new Set(['m0', 'm1', 'm2', 'm3', 'm4']), pg_gmsgs: new Set(), pg_users: new Set(['u1']) });
  await sweepFiles(f.env, f.D, T, 3);                // pigeon/ page 1
  assert.equal(JSON.parse(f.meta.get('r2_sweep')).i, 0);
  await sweepFiles(f.env, f.D, T, 3);                // pigeon/ page 2, the last
  assert.equal(JSON.parse(f.meta.get('r2_sweep')).i, 1);
  await sweepFiles(f.env, f.D, T, 3);                // pigeon-g/
  await sweepFiles(f.env, f.D, T, 3);                // pigeon-avatars/
  await sweepFiles(f.env, f.D, T, 3);                // pigeon-posters/
  assert.deepEqual(f.deleted.sort(), ['pigeon-avatars/u2', 'pigeon-g/g1', 'pigeon-posters/u3']);
  assert.equal(JSON.parse(f.meta.get('r2_sweep')).i, 0);   // and round again
});

test('no file storage: nothing to do', async () => {
  assert.equal(await sweepFiles({}, null, T), 0);
});
