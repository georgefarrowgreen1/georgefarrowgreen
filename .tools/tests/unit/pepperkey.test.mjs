// The pepper carried to another project (functions/_atrest.js, PIGEON_PEPPER_KEY): where the pepper and a key are both
// set (the Pages project), the database keeps the pepper locked with the key; where the key alone is (the Worker), the
// pepper's that one, so what one locked the other opens, and a password checks the same in both. The database's copy
// opens with the key only; a wrong or short key opens nothing; and none of it changes anything where no key's set.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proofHash, proofOk, lockVault, openVault, pepperOn, pepperState } from '../../../functions/_atrest.js';

// (a database with pg_meta, and nothing else that answers)
function fakeDb(meta = new Map()) {
  const st = (sql, a = []) => ({
    bind: (...b) => st(sql, b),
    first: async () => (/SELECT v FROM pg_meta WHERE k = 'pepper'/.test(sql) ? (meta.has('pepper') ? { v: meta.get('pepper') } : null) : null),
    all: async () => ({ results: [] }),
    run: async () => { if (/INSERT INTO pg_meta \(k, v\) VALUES \('pepper'/.test(sql)) meta.set('pepper', a[0]); return { meta: {} }; },
    raw: async () => [],
  });
  return { meta, prepare: (sql) => st(sql), batch: async (xs) => { for (const x of xs) await x.run(); return xs.map(() => ({ results: [] })); }, exec: async () => ({}) };
}
const PEPPER = 'the-original-pepper-the-owner-cannot-read-back', KEY = 'k'.repeat(20) + 'a-key-of-the-owners-choosing';
const proof = Buffer.from('a password proof, as the phone sends it').toString('base64url');

test('the Pages project, with the pepper and a key: the pepper kept, locked; the Worker, with the key alone, reads the same', async () => {
  const D = fakeDb(), pages = { DB: D, PIGEON_PEPPER: PEPPER, PIGEON_PEPPER_KEY: KEY };
  const stored = await proofHash(pages, proof), vault = await lockVault(pages, 'user-1', 'the key to their messages');
  assert.match(stored, /^p1:/); assert.match(vault, /^w1:/);
  const kept = D.meta.get('pepper');
  assert.match(kept, /^k1:/, 'kept, locked');
  assert.ok(!kept.includes(PEPPER) && !Buffer.from(kept.slice(3), 'base64url').toString('latin1').includes(PEPPER), 'never in the clear');
  const worker = { DB: D, PIGEON_PEPPER_KEY: KEY };
  assert.equal(pepperOn(worker), true);
  assert.equal(await proofOk(worker, proof, stored), true, 'the password checks the same');
  assert.equal(await proofOk(worker, Buffer.from('another').toString('base64url'), stored), false);
  assert.equal(await openVault(worker, 'user-1', vault), 'the key to their messages');
  assert.deepEqual(await pepperState(pages), { on: true, key: true, kept: true });
  assert.deepEqual(await pepperState(worker), { on: true, key: true, kept: true });
});
test('a wrong key, a short one, or none kept: nothing opens, and it says so', async () => {
  const D = fakeDb();
  await proofHash({ DB: D, PIGEON_PEPPER: PEPPER, PIGEON_PEPPER_KEY: KEY }, proof);
  const stored = await proofHash({ DB: D, PIGEON_PEPPER: PEPPER }, proof);
  await assert.rejects(proofOk({ DB: D, PIGEON_PEPPER_KEY: 'w'.repeat(40) }, proof, stored), /PIGEON_PEPPER is needed/);
  assert.deepEqual(await pepperState({ DB: D, PIGEON_PEPPER_KEY: 'w'.repeat(40) }), { on: true, key: true, kept: false });
  assert.equal(pepperOn({ DB: D, PIGEON_PEPPER_KEY: 'short' }), false, 'a short key is none');
  // (another key, as each copy of the server keeps the one it's opened)
  await assert.rejects(proofOk({ DB: fakeDb(), PIGEON_PEPPER_KEY: 'n'.repeat(40) }, proof, stored), /PIGEON_PEPPER is needed/, 'none kept');
});
test('no key: as before, nothing kept', async () => {
  const D = fakeDb();
  await proofHash({ DB: D, PIGEON_PEPPER: PEPPER }, proof);
  assert.equal(D.meta.has('pepper'), false);
  assert.deepEqual(await pepperState({ DB: D, PIGEON_PEPPER: PEPPER }), { on: true, key: false, kept: false });
});
test('a new key on the Pages project: the pepper kept again, with it', async () => {
  const D = fakeDb(), K2 = 'z'.repeat(40);
  await proofHash({ DB: D, PIGEON_PEPPER: PEPPER, PIGEON_PEPPER_KEY: KEY }, proof);
  const stored = await proofHash({ DB: D, PIGEON_PEPPER: PEPPER, PIGEON_PEPPER_KEY: K2 }, proof);
  assert.equal(await proofOk({ DB: D, PIGEON_PEPPER_KEY: K2 }, proof, stored), true);
});

test('a different pepper, with the same key (a wrong one set by mistake): the one kept stays', async () => {
  const D = fakeDb(), K = 'q'.repeat(40);
  await proofHash({ DB: D, PIGEON_PEPPER: PEPPER, PIGEON_PEPPER_KEY: K }, proof);
  const was = D.meta.get('pepper');
  await proofHash({ DB: D, PIGEON_PEPPER: 'a-wrong-new-value-typed-in-by-mistake-on-the-worker', PIGEON_PEPPER_KEY: K }, proof);
  assert.equal(D.meta.get('pepper'), was, 'not overwritten');
  const stored = await proofHash({ DB: D, PIGEON_PEPPER: PEPPER }, proof);
  assert.equal(await proofOk({ DB: D, PIGEON_PEPPER_KEY: 'q'.repeat(40) }, proof, stored), true, 'the real one still opens');
});
