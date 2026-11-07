// The source environment's variables and secrets carried to the site's Workers (functions/_kept.js): the source environment (it
// has PIGEON_PEPPER) keeps what it has in the database, locked with PIGEON_PEPPER_KEY; a Worker with only the key gets
// each one it hasn't got of its own. Never the pepper or the key itself, never the asset service's own; one set on the Worker wins;
// nothing readable in the database; a wrong key opens nothing; and with no key, nothing happens at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keepSecrets, fillSecrets, keptCount } from '../../../functions/_kept.js';

function fakeDb(meta = new Map()) {
  const st = (sql, a = []) => ({
    bind: (...b) => st(sql, b),
    first: async () => (/SELECT v FROM pg_meta WHERE k = 'secrets'/.test(sql) ? (meta.has('secrets') ? { v: meta.get('secrets') } : null) : null),
    all: async () => ({ results: [] }),
    run: async () => { if (/INSERT INTO pg_meta \(k, v\) VALUES \('secrets'/.test(sql)) meta.set('secrets', a[0]); return { meta: {} }; },
    raw: async () => [],
  });
  return { meta, prepare: (sql) => st(sql), batch: async (xs) => { for (const x of xs) await x.run(); return xs.map(() => ({ results: [] })); }, exec: async () => ({}) };
}
const KEY = 'the-owners-own-key-' + 'x'.repeat(30);
const sourceEnv = (D) => ({ DB: D, ASSETS: {}, PIGEON_PEPPER: 'the-pepper', PIGEON_PEPPER_KEY: KEY, RESEND_API_KEY: 're_secret_value', HUB_KEY: 'hub-key-value', MAIL_KEY: 'mail-key-value', CF_DEPLOYMENT_URL: 'https://x.example.workers.dev', HUB_PUSH: '1' });

test('kept by the source environment; given to a Worker that has only the key', async () => {
  const D = fakeDb();
  await keepSecrets(sourceEnv(D));
  const kept = D.meta.get('secrets');
  assert.match(kept, /^k1:/);
  for (const v of ['re_secret_value', 'hub-key-value', 'the-pepper', KEY]) assert.ok(!kept.includes(v) && !Buffer.from(kept.slice(3), 'base64url').toString('latin1').includes(v), 'nothing readable');
  const worker = { DB: D, PIGEON_PEPPER_KEY: KEY, TICK_HOST: 'inflite-apps.example.workers.dev', MAIL_KEY: 'set-on-the-worker' };
  await fillSecrets(worker);
  assert.equal(worker.RESEND_API_KEY, 're_secret_value');
  assert.equal(worker.HUB_KEY, 'hub-key-value');
  assert.equal(worker.HUB_PUSH, '1');
  assert.equal(worker.MAIL_KEY, 'set-on-the-worker', 'one set on the Worker wins');
  assert.equal(worker.PIGEON_PEPPER, undefined, 'never the pepper (functions/_atrest.js carries that)');
  assert.equal(worker.CF_DEPLOYMENT_URL, undefined, 'never the asset service’s own');
  assert.equal(worker.TICK_HOST, 'inflite-apps.example.workers.dev');
  assert.equal(await keptCount(worker), 4);
});
test('a wrong key, or none: nothing given; nothing kept without the pepper beside the key', async () => {
  const D = fakeDb();
  await keepSecrets(sourceEnv(D));
  const wrong = { DB: D, PIGEON_PEPPER_KEY: 'w'.repeat(40) };
  await fillSecrets(wrong);
  assert.equal(wrong.RESEND_API_KEY, undefined);
  const none = { DB: D };
  await fillSecrets(none);
  assert.equal(none.HUB_KEY, undefined);
  const D2 = fakeDb();
  await keepSecrets({ DB: D2, PIGEON_PEPPER_KEY: KEY, RESEND_API_KEY: 'x' });
  assert.equal(D2.meta.has('secrets'), false, 'a Worker never keeps its own over the source environment’s');
});
test('one changed on the source environment: kept again', async () => {
  const D = fakeDb(), env = sourceEnv(D);
  await keepSecrets(env);
  env.RESEND_API_KEY = 're_new_value';
  await keepSecrets(env);
  const worker = { DB: D, PIGEON_PEPPER_KEY: 'k'.repeat(40) };
  assert.equal(await keptCount(worker), 0, 'another key opens nothing');
  const w2 = { DB: D, PIGEON_PEPPER_KEY: KEY };
  // (each copy of the server holds what it opened: a fresh one sees the change)
  assert.equal(await keptCount(w2), 4);
});
