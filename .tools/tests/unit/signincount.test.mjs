// How signing in is going, in counts only (functions/_signincount.js): a day, a kind and a number; never who. Kinds
// outside the few known are never counted, a count that can't be kept never fails the sign-in it's counted from, and
// the admin's series come out one number a day, the days nothing happened as 0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { count, counts, KINDS, SAID } from '../../../functions/_signincount.js';
import { readFileSync } from 'node:fs';

test('a count: one more of a known kind today, by an upsert of day and kind only', async () => {
  const sent = [];
  const D = { prepare: (sql) => ({ bind: (...a) => ({ sql, a, first: async () => null, all: async () => ({ results: [] }), run: async () => ({}) }), first: async () => null, all: async () => ({ results: [] }), run: async () => ({}) }),
    batch: async (xs) => { sent.push(...xs.filter((x) => /pg_signin_counts/.test(x.sql))); return xs.map(() => ({ results: [] })); }, exec: async () => ({}) };
  await count({ DB: D }, 'bad-passkey', Date.UTC(2026, 10, 4, 12));
  const up = sent.find((x) => /^INSERT INTO pg_signin_counts/.test(x.sql));
  assert.ok(up, 'counted');
  assert.equal(up.a.length, 2, 'a day and a kind: nothing else');
  assert.equal(up.a[1], 'bad-passkey');
  sent.length = 0;
  await count({ DB: D }, 'someone@example.com');
  assert.equal(sent.length, 0, 'an unknown kind (anything a page might put in it): never counted');
});
test('a database that fails: the count missed, never the sign-in', async () => {
  await assert.doesNotReject(count({ DB: { prepare: () => { throw new Error('down'); }, batch: async () => { throw new Error('down'); } } }, 'ok-password'));
  await assert.doesNotReject(count({}, 'ok-password'));
});
test('the series: every kind, one number a day, oldest first, the quiet days 0', async () => {
  const D = { prepare: () => ({ bind: () => ({ all: async () => ({ results: [{ day: 101, kind: 'ok-password', n: 4 }, { day: 103, kind: 'passkey-cancelled', n: 2 }, { day: 99, kind: 'ok-password', n: 9 }] }) }) }) };
  const s = await counts(D, 100, 103);
  assert.deepEqual(s['ok-password'], [0, 4, 0, 0]);
  assert.deepEqual(s['passkey-cancelled'], [0, 0, 0, 2]);
  assert.deepEqual(Object.keys(s).sort(), [...KINDS, ...SAID].sort());
});
test('the sign-in page tells only the few words it may, with nothing else', () => {
  const app = readFileSync(new URL('../../../account/app.js', import.meta.url), 'utf8');
  for (const [, k] of app.matchAll(/told\("([a-z-]+)"\)/g)) assert.ok(SAID.includes(k), k);
  assert.match(app, /body: JSON\.stringify\(\{ kind \}\)/, 'its kind alone');
});
