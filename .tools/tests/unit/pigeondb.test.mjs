// InFlight's server against a real database (node:sqlite, made to look like D1, with the real schema): seasonal looks
// counted after messages go, disappearing messages and read receipts, what one person is sent of others' reactions and
// flights together, and the minute tick finding what it needs by index
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { db, msgView } from '../../../functions/_pigeon.js';
import { noteSeason } from '../../../functions/_seasons.js';
import { vanishSweep } from '../../../functions/_vanish.js';
import { reactsFor } from '../../../functions/_reacts.js';
import { nearViews } from '../../../functions/_moments.js';
import { stampPassports } from '../../../functions/_passport.js';
import { settleBirds } from '../../../functions/_birds.js';

const sql = new DatabaseSync(':memory:'), asked = [];
const val = (a) => a.map((x) => (typeof x === 'boolean' ? +x : x === undefined ? null : x));
const st = (q, a = []) => ({ bind: (...b) => st(q, b), first: async () => sql.prepare(q).get(...val(a)) ?? null,
  all: async () => ({ results: sql.prepare(q).all(...val(a)), meta: {} }), run: async () => ({ meta: { changes: Number(sql.prepare(q).run(...val(a)).changes) } }) });
const env = { DB: { prepare: (q) => { asked.push(q); return st(q); },
  batch: async (list) => { sql.exec('BEGIN'); try { const out = []; for (const s of list) out.push(await s.all()); sql.exec('COMMIT'); return out; } catch (e) { sql.exec('ROLLBACK'); throw e; } } } };
const D = await db(env);
const DAY = 864e5, now = Date.now();
const put = (table, row) => sql.prepare(`INSERT INTO ${table} (${Object.keys(row).join(', ')}) VALUES (${Object.keys(row).map(() => '?').join(', ')})`).run(...val(Object.values(row)));
const user = (id, x = {}) => put('pg_users', { id, handle: id, name: id, email: `${id}@example.com`, pub: '{}', salt: 's', proof_hash: 'p', vault: 'v', swift: 9, swift_at: 0, created_at: 0, lat: 51.5, lon: -0.1, ...x });
const msg = (id, x) => put('pg_msgs', { id, ct: 'sealed', km: 300, sent_at: now - 2 * DAY, deliver_at: now - DAY, from_lat: 51.5, from_lon: -0.1, to_lat: 48.85, to_lon: 2.35, ...x });
const gmsg = (id, x) => put('pg_gmsgs', { id, group_id: 'g', body: 'sealed', sender_key: 'k', pigeon: 'standard', sent_at: now - 9 * DAY, from_lat: 51.5, from_lon: -0.1, ...x });
const gdel = (msg_id, user_id, x) => put('pg_gdeliv', { msg_id, user_id, wrap: 'w', km: 300, deliver_at: now - 8 * DAY, to_lat: 48.85, to_lon: 2.35, ...x });
const link = (a, b, status = 'ok') => put('pg_links', { a, b, status, created_at: 0 });
for (const id of ['ann', 'bo', 'cy', 'di']) user(id);

test('a seasonal look is kept at ten, counting the pigeons whose messages have since gone (a month after landing)', async () => {
  const t = Date.UTC(2026, 10, 10);                      // 10 Nov: autumn
  for (let i = 0; i < 5; i++) put('pg_flights', { id: `f${i}`, msg_id: `f${i}`, sender: 'ann', sent_at: Date.UTC(2026, 9, 2 + i) });
  for (let i = 0; i < 4; i++) msg(`s${i}`, { sender: 'ann', recipient: 'bo', sent_at: Date.UTC(2026, 10, 5 + i), deliver_at: Date.UTC(2026, 10, 5 + i, 3) });
  await noteSeason(D, 'ann', t);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM pg_kit WHERE user_id = 'ann'").get().n, 0, 'nine: not yet');
  msg('s4', { sender: 'ann', recipient: 'bo', sent_at: t - 1000, deliver_at: t + 3600e3 });
  await noteSeason(D, 'ann', t);
  assert.ok(sql.prepare("SELECT 1 FROM pg_kit WHERE user_id = 'ann' AND item = 'skin:autumn'").get(), 'the tenth keeps it');
});

test('disappearing messages: timed from landing, read or not, where read receipts are off (one to one and in a group)', async () => {
  user('quiet', { no_receipts: 1 });
  const due = { vanish: DAY, deliver_at: now - DAY - 5000 };
  msg('v-off', { sender: 'ann', recipient: 'quiet', ...due });                         // unread, receipts off: goes
  msg('v-on', { sender: 'ann', recipient: 'cy', ...due });                             // unread, receipts on: stays
  msg('v-read', { sender: 'ann', recipient: 'cy', ...due, read_at: now - DAY - 5000 }); // read a day ago: goes
  gmsg('gv-off', { sender: 'ann', vanish: 7 * DAY }); gdel('gv-off', 'quiet'); gdel('gv-off', 'cy');
  gmsg('gv-on', { sender: 'ann', vanish: 7 * DAY }); gdel('gv-on', 'cy'); gdel('gv-on', 'di');
  gmsg('gv-read', { sender: 'ann', vanish: 7 * DAY }); gdel('gv-read', 'cy', { read_at: now - 8 * DAY }); gdel('gv-read', 'di', { read_at: now - 8 * DAY });
  await vanishSweep(env);
  const gone = (t, id) => !!sql.prepare(`SELECT gone_at FROM ${t} WHERE id = ?`).get(id).gone_at;
  assert.deepEqual(['v-off', 'v-on', 'v-read'].map((id) => gone('pg_msgs', id)), [true, false, true]);
  assert.deepEqual(['gv-off', 'gv-on', 'gv-read'].map((id) => gone('pg_gmsgs', id)), [true, false, true]);
  assert.equal(sql.prepare("SELECT ct FROM pg_msgs WHERE id = 'v-off'").get().ct, '', 'what was said is wiped');
});

test('reactions: none from, or flying to, someone either of you has blocked; your own always', async () => {
  link('ann', 'bo', 'blocked'); link('ann', 'cy');
  const r = (id, sender, recipient) => put('pg_reacts', { id, msg_id: 'm-r', group_id: 'g', sender, recipient, ct: 'sealed', keys: '{}', sent_at: now - 60e3, deliver_at: now - 30e3 });
  r('r1', 'bo', 'cy'); r('r2', 'cy', 'bo'); r('r3', 'cy', 'di'); r('r4', 'ann', 'bo');
  assert.deepEqual((await reactsFor(env, 'ann', ['m-r'])).map((x) => x.id).sort(), ['r3', 'r4']);
  assert.equal((await reactsFor(env, 'di', ['m-r'])).length, 4, 'someone with no block sees them all');
});

test('flying together: its meet and part points go to no one; who sees both pigeons is told when they part', async () => {
  const meet = now - 6 * 3600e3, part = now - 5 * 3600e3, legs = JSON.stringify([[50, 0, meet, 'f'], [49.5, 1, part, 'f'], [49, 2, now - 4 * 3600e3, 'c']]);
  msg('fl-a', { sender: 'ann', recipient: 'bo', sent_at: now - 8 * 3600e3, deliver_at: now - 3600e3, legs });
  msg('fl-b', { sender: 'ann', recipient: 'cy', sent_at: now - 8 * 3600e3, deliver_at: now - 3600e3, legs });
  put('pg_near', { a: 'fl-a', b: 'fl-b', at: meet, lat: 50, lon: 0, km: 80, place: 'France', kind: 'flock' });
  const v = msgView('bo', sql.prepare("SELECT * FROM pg_msgs WHERE id = 'fl-a'").get(), now);
  assert.deepEqual(v.legs.map((l) => l[3]), ['c'], 'no "f" points, the rest kept');
  const seen = await nearViews(D, 'ann', ['fl-a'], now);
  assert.equal(seen.get('fl-a')?.[0]?.until, part, 'the sender of both: when they part');
  assert.equal((await nearViews(D, 'bo', ['fl-a'], now)).size, 0, 'the recipient of one hears nothing of it');
});

test('the minute tick: flights to stamp and named pigeons to settle found by index, and each flight stamped once', async () => {
  for (let i = 0; i < 3; i++) msg(`st${i}`, { sender: 'ann', recipient: 'cy', deliver_at: now - (i + 1) * 3600e3 });
  gmsg('gst', { sender: 'ann' }); gdel('gst', 'cy');
  sql.exec("UPDATE pg_msgs SET stamped = 1 WHERE id NOT LIKE 'st%'"); sql.exec("UPDATE pg_gdeliv SET stamped = 1 WHERE msg_id != 'gst'");   // (the others' flights: done)
  asked.length = 0;
  assert.equal(await stampPassports(D, now), 4);
  await settleBirds(D, now);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM pg_msgs WHERE id LIKE 'st%' AND stamped = 1").get().n, 3, 'one to one: marked');
  assert.equal(sql.prepare("SELECT stamped FROM pg_gdeliv WHERE msg_id = 'gst' AND user_id = 'cy'").get().stamped, 1, 'in a group: marked');
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM pg_stamped WHERE id LIKE 'st%' OR id = 'gst:cy'").get().n, 4, 'and in the passport');
  // (every look at the message tables goes by an index: none reads them through)
  for (const q of asked.filter((q) => /^\s*SELECT/.test(q) && /pg_(msgs|gmsgs|gdeliv)\b/.test(q))) {
    const scans = sql.prepare('EXPLAIN QUERY PLAN ' + q).all().map((r) => r.detail).filter((d) => /^SCAN (pg_msgs|pg_gmsgs|pg_gdeliv|m|d)$/.test(d));
    assert.deepEqual(scans, [], q.replace(/\s+/g, ' ').slice(0, 120));
  }
  assert.equal(await stampPassports(D, now), 0, 'nothing left to stamp');
});
