// A new copy of the server, before its first request, without trips to the database (functions/_kept.js keptText,
// functions/_pigeon.js setUp): the kept secrets' locked text and the schema's fingerprint read from KV's nearest copy
// when they're there, the database asked (and KV given its copy) when they're not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keepSecrets, fillSecrets } from '../../../functions/_kept.js';

function fakeKv(start = {}) {
  const m = new Map(Object.entries(start)), log = [];
  return { m, log, get: async (k, o) => { log.push(['get', k, o?.cacheTtl]); return m.has(k) ? m.get(k) : null; },
    put: async (k, v) => { log.push(['put', k]); m.set(k, v); }, delete: async (k) => { log.push(['delete', k]); m.delete(k); } };
}
function fakeDb(meta = new Map(), asked = []) {
  const st = (sql, a = []) => ({
    bind: (...b) => st(sql, b),
    first: async () => { asked.push(sql); return /k = 'secrets'/.test(sql) ? (meta.has('secrets') ? { v: meta.get('secrets') } : null) : null; },
    all: async () => ({ results: [] }), raw: async () => [],
    run: async () => { if (/VALUES \('secrets'/.test(sql)) meta.set('secrets', a[0]); return { meta: {} }; },
  });
  return { meta, asked, prepare: (sql) => st(sql), batch: async (xs) => { for (const x of xs) await x.run(); return xs.map(() => ({ results: [] })); } };
}
const KEY = 'the-owners-own-key-' + 'y'.repeat(30);

test('the kept secrets: from the database the first time, then KV’s copy, with no trip to the database', async () => {
  const D = fakeDb(), KV = fakeKv();
  await keepSecrets({ DB: D, BIO_KV: KV, PIGEON_PEPPER: 'p', PIGEON_PEPPER_KEY: KEY, HUB_KEY: 'hub-value' });
  assert.ok(KV.log.some(([op, k]) => op === 'delete' && k === 'site:kept_secrets'), 'keeping afresh drops KV’s old copy');
  // (a new copy of the server: the module's own held copy is per key, so a different key's Worker starts fresh)
  const w1 = { DB: D, BIO_KV: KV, PIGEON_PEPPER_KEY: KEY };
  await fillSecrets(w1);
  assert.equal(w1.HUB_KEY, 'hub-value');
  assert.equal(KV.m.get('site:kept_secrets'), D.meta.get('secrets'), 'KV given the same locked text');
  assert.ok(!KV.m.get('site:kept_secrets').includes('hub-value'), 'still locked in KV');
});

test('KV’s copy alone opens them: a database that isn’t asked', async () => {
  const D = fakeDb(), KV = fakeKv();
  await keepSecrets({ DB: D, PIGEON_PEPPER: 'p', PIGEON_PEPPER_KEY: KEY + 'z', MAIL_KEY: 'mail-value' });
  const locked = D.meta.get('secrets'), D2 = fakeDb(new Map()), KV2 = fakeKv({ 'site:kept_secrets': locked });
  const w = { DB: D2, BIO_KV: KV2, PIGEON_PEPPER_KEY: KEY + 'z' };
  await fillSecrets(w);
  assert.equal(w.MAIL_KEY, 'mail-value');
  assert.equal(D2.asked.filter((q) => /secrets/.test(q)).length, 0, 'no trip to the database');
  assert.ok(KV2.log.some(([op, k, ttl]) => op === 'get' && k === 'site:kept_secrets' && ttl >= 60), 'read from the nearest copy, kept there a while');
});

test('the schema: once it’s current, the fingerprint’s in KV, and a new copy of the server goes by it', async () => {
  const D = fakeDb(), KV = fakeKv();
  const first = await import('../../../functions/_pigeon.js?fresh=1');
  await first.db({ DB: D, BIO_KV: KV });
  const fp = KV.m.get('site:schema_fp');
  assert.match(fp || '', /^s[0-9a-z]+$/, 'kept in KV once the database has it');
  const D2 = fakeDb(), KV2 = fakeKv({ 'site:schema_fp': fp });
  const second = await import('../../../functions/_pigeon.js?fresh=2');
  await second.db({ DB: D2, BIO_KV: KV2 });
  assert.equal(D2.asked.length, 0, 'no trip to the database to learn the tables are as they should be');
  const D3 = fakeDb(), KV3 = fakeKv({ 'site:schema_fp': 'an-older-one' });
  const third = await import('../../../functions/_pigeon.js?fresh=3');
  await third.db({ DB: D3, BIO_KV: KV3 });
  assert.ok(D3.asked.some((q) => /schema_fp/.test(q)), 'any other fingerprint: the database is asked, as before');
});
