// Mail (the inflite repo's email/, where it's checked out beside this one), its run every few minutes, against a real
// database (node:sqlite, made to look like D1, with Mail's own schema): conversations back from Later come back in the
// account's Quiet Hours without a notice, as new mail does; and the daily tidy of people kept for addressing mail takes
// a bounded few each day, in turn, finding their mail as a sender by index rather than reading the mailbox for each.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const MAIL = new URL('../../../../inflite/email/', import.meta.url);
const skip = !existsSync(new URL('src/index.js', MAIL)) && 'the inflite repo isn’t beside this one';
const load = (p) => import(new URL(p, MAIL).href);

const sql = new DatabaseSync(':memory:');
const asked = [];
const val = (a) => a.map((x) => (typeof x === 'boolean' ? +x : x === undefined ? null : x));
const st = (q, a = []) => ({ bind: (...b) => st(q, b),
  first: async () => (asked.push({ q, a }), sql.prepare(q).get(...val(a)) ?? null),
  all: async () => (asked.push({ q, a }), { results: sql.prepare(q).all(...val(a)), meta: {} }),
  run: async () => (asked.push({ q, a }), { meta: { changes: Number(sql.prepare(q).run(...val(a)).changes) } }) });
const DB = { prepare: (q) => st(q), batch: async (list) => { sql.exec('BEGIN'); try { const out = []; for (const s of list) out.push(await s.all()); sql.exec('COMMIT'); return out; } catch (e) { sql.exec('ROLLBACK'); throw e; } } };
const R2 = { put: async () => {}, get: async () => null, delete: async () => {}, list: async () => ({ objects: [] }) };
const env = { DB, MAIL: R2, DOMAIN: 'inflite.ai', DEFAULT_FROM: 'hello@inflite.ai', ACCOUNT_ORIGIN: 'https://account.inflite.ai' };
const ctx = { waitUntil: (p) => Promise.resolve(p).catch(() => {}) };

const msg = (id, x) => { const row = { id, folder: 'inbox', thread_id: id, mailbox: 'hello@inflite.ai', from_name: 'Someone', from_email: 'someone@example.com', subject: id, date: Date.now() - 1000, unread: 0, category: 'people', ...x };
  sql.prepare(`INSERT INTO messages (${Object.keys(row).join(', ')}) VALUES (${Object.keys(row).map(() => '?').join(', ')})`).run(...val(Object.values(row))); };
const meta = (k, v) => sql.prepare(`INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`).run(k, v);
const run = async () => { const { default: worker } = await load('src/index.js'); asked.length = 0; await worker.scheduled({}, env, ctx); };
// (the hour now, where the account is: UTC here)
const hour = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', hour: 'numeric', hourCycle: 'h23' }).format(Date.now()));
const pushed = () => asked.filter(({ q }) => /FROM push_subs/.test(q)).length;

test('back from Later in Quiet Hours: back in the stream, unread, with no notice; outside them, the notice', { skip }, async () => {
  const { ensureSchema } = await load('src/db.js');
  await ensureSchema(env);
  meta('tidy_day', new Date().toISOString().slice(0, 10));
  meta('quiet', JSON.stringify({ on: true, from: hour(), to: (hour() + 2) % 24, tz: 'UTC' }));
  msg('later1', { snooze_until: Date.now() - 60e3 });
  await run();
  const row = sql.prepare(`SELECT snooze_until, unread, bumped_at FROM messages WHERE id = 'later1'`).get();
  assert.equal(row.snooze_until, null, 'woken');
  assert.equal(row.unread, 1, 'unread again');
  assert.ok(row.bumped_at, 'at the top of the stream');
  assert.equal(pushed(), 0, 'no notice in Quiet Hours');

  meta('quiet', JSON.stringify({ on: false, from: 22, to: 7, tz: 'UTC' }));
  msg('later2', { snooze_until: Date.now() - 60e3 });
  await run();
  assert.equal(sql.prepare(`SELECT snooze_until FROM messages WHERE id = 'later2'`).get().snooze_until, null);
  assert.equal(pushed(), 1, 'a notice, once they’re off');

  // (nothing back: nothing asked about notices at all)
  await run();
  assert.equal(pushed(), 0);
});

test('the tidy of people: those with no mail left go, ninety a day at most, each in turn; those with mail stay', { skip }, async () => {
  const { ensureSchema } = await load('src/db.js');
  await ensureSchema(env);
  sql.exec(`DELETE FROM contacts; DELETE FROM messages; DELETE FROM meta WHERE k = 'tidy_contact'`);
  const old = Date.now() - 200 * 864e5;
  const person = sql.prepare(`INSERT INTO contacts (email, name, count, last_used) VALUES (?, '', 1, ?)`);
  // (two hundred quiet half a year with nothing left of theirs; three with mail, from them, to them, copied; one lately written to)
  for (let i = 0; i < 200; i++) person.run(`gone${String(i).padStart(3, '0')}@example.com`, old);
  person.run('keep-from@example.com', old);
  person.run('keep-to@example.com', old);
  person.run('keep-cc@example.com', old);
  person.run('recent@example.com', Date.now() - 864e5);
  msg('m1', { from_email: 'keep-from@example.com' });
  msg('m2', { folder: 'sent', from_email: 'hello@inflite.ai', to_json: JSON.stringify([{ name: 'B', email: 'keep-to@example.com' }]) });
  msg('m3', { folder: 'archive', cc_json: JSON.stringify([{ name: '', email: 'keep-cc@example.com' }]) });
  const left = () => sql.prepare(`SELECT COUNT(*) AS n FROM contacts WHERE email LIKE 'gone%'`).get().n;
  const day = async () => { sql.exec(`DELETE FROM meta WHERE k = 'tidy_day'`); await run(); };

  await day();
  assert.equal(left(), 110, 'ninety the first day');
  await day();
  assert.equal(left(), 20, 'ninety more the next, from where it left off');
  await day();
  assert.equal(left(), 0, 'the rest, and those with mail looked at, and kept');
  for (const e of ['keep-from@example.com', 'keep-to@example.com', 'keep-cc@example.com', 'recent@example.com'])
    assert.ok(sql.prepare(`SELECT 1 FROM contacts WHERE email = ?`).get(e), `${e} kept`);
  assert.equal(sql.prepare(`SELECT v FROM meta WHERE k = 'tidy_contact'`).get().v, '', 'the last reached: from the start again');

  // (once a day: run again the same day, nothing asked of the people)
  await run();
  assert.ok(!asked.some(({ q }) => /FROM contacts/.test(q)), 'the same day: not again');

  // (as a sender, by the index on from_email, not by reading every message)
  await day();
  const del = asked.find(({ q }) => /^\s*DELETE FROM contacts/.test(q));
  assert.ok(del, 'asked');
  const plan = sql.prepare(`EXPLAIN QUERY PLAN ${del.q}`).all(...val(del.a)).map((r) => r.detail).join('\n');
  assert.match(plan, /idx_messages_from/, plan);
  assert.ok(del.a.length <= 100, 'within what D1 takes at once');
});
