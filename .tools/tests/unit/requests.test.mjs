// What every app's server takes from a request, and says back: a body no bigger than its cap however it's sent
// (functions/_pigeon.js readCapped, and the body() helpers on it), how long a limit says to wait (waitText), and
// InFlight's notification settings kept a change at a time (functions/_notify.js savePrefs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readCapped, body, waitText } from '../../../functions/_pigeon.js';
import { body as accountBody } from '../../../functions/_accountapi.js';
import { savePrefs, prefsOf } from '../../../functions/_notify.js';

// a body sent in pieces, with no Content-Length (as a chunked upload is)
const streamed = (pieces) => new Request('https://gfg.test/api/x', { method: 'POST', duplex: 'half',
  body: new ReadableStream({ pull(c) { const p = pieces.shift(); if (p === undefined) c.close(); else c.enqueue(new TextEncoder().encode(p)); } }) });

test('a body sent without its length is refused once it passes the cap, not read whole first', async () => {
  let pulled = 0;
  const big = new Request('https://gfg.test/api/x', { method: 'POST', duplex: 'half',
    body: new ReadableStream({ pull(c) { if (++pulled > 1000) c.close(); else c.enqueue(new Uint8Array(1024)); } }) });
  assert.equal(big.headers.get('Content-Length'), null);
  await assert.rejects(readCapped(big, 64 * 1024), (e) => e.status === 413 && /too large/.test(e.message));
  assert.ok(pulled < 100, `stopped soon after the cap (${pulled} pieces read)`);
  await assert.rejects(body(streamed(['{"a":"', 'x'.repeat(600 * 1024), '"}'])), (e) => e.status === 413);
  await assert.rejects(accountBody(streamed(['{"a":"', 'x'.repeat(70 * 1024), '"}'])), (e) => e.status === 413 && e.message === 'Too big.');
});

test('one that says it is too big is refused unread; small ones read back as sent', async () => {
  const said = new Request('https://gfg.test/api/x', { method: 'POST', body: 'x'.repeat(2000), headers: { 'Content-Length': '2000' } });
  await assert.rejects(readCapped(said, 1000), (e) => e.status === 413);
  assert.equal(said.bodyUsed, false);
  assert.deepEqual(await body(streamed(['{"to":"é', 'te"', ',"n":3}'])), { to: 'éte', n: 3 });
  assert.deepEqual(await accountBody(streamed(['{"email":"a@b.test"}'])), { email: 'a@b.test' });
  assert.deepEqual(await accountBody(new Request('https://gfg.test/api/x', { method: 'POST' })), {}, 'nothing sent: an empty object');
  assert.equal((await readCapped(new Request('https://gfg.test/api/x', { method: 'POST', body: new Uint8Array([1, 2, 3]) }), 3)).length, 3);
});

test('how long a limit says to wait', () => {
  assert.equal(waitText(1432 * 60e3), '23h 52m');
  assert.equal(waitText(30e3), '1 minute');
  assert.equal(waitText(0), '1 minute');
  assert.equal(waitText(12 * 60e3), '12 minutes');
  assert.equal(waitText(60 * 60e3 - 1), '1 hour', 'never "60 minutes"');
  assert.equal(waitText(24 * 60 * 60e3), '24 hours');
});

test('notification settings: each change merged where they are kept, so two at once both stay', async () => {
  const sq = new DatabaseSync(':memory:');
  sq.exec("CREATE TABLE pg_users (id TEXT PRIMARY KEY, notify_prefs TEXT)");
  sq.exec(`INSERT INTO pg_users VALUES ('a', '{"landed":false}'), ('b', 'not json'), ('c', NULL)`);
  const D = { prepare: (q) => { const st = sq.prepare(q); return { bind: (...v) => ({ run: async () => st.run(...v) }) }; } };
  const prefs = (id) => prefsOf(sq.prepare('SELECT notify_prefs FROM pg_users WHERE id = ?').get(id));
  // (two switches turned off together: neither puts the other back)
  await Promise.all([savePrefs(D, 'a', { reactions: false }), savePrefs(D, 'a', { moments: false })]);
  const a = prefs('a');
  assert.equal(a.landed, false, 'what was kept before stays');
  assert.equal(a.reactions, false); assert.equal(a.moments, false);
  assert.equal(a.weekly, true, 'the rest as they were');
  // (only what it knows, as it allows)
  await savePrefs(D, 'a', { quietFrom: 25, quietTo: 6, tz: 'Nowhere/Real', evil: 1, names: 1 });
  const a2 = prefs('a');
  assert.equal(a2.quietFrom, 22); assert.equal(a2.quietTo, 6); assert.equal(a2.tz, 'UTC'); assert.equal(a2.names, true);
  assert.equal('evil' in a2, false);
  // (what was kept and can't be read, or nothing yet: a fresh start)
  await savePrefs(D, 'b', { takeoff: true }); await savePrefs(D, 'c', { lost: false });
  assert.equal(prefs('b').takeoff, true); assert.equal(prefs('c').lost, false); assert.equal(prefs('c').landed, true);
});
