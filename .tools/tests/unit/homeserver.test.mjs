// The home page's server: Get in touch (functions/api/contact.js) taking no message from another site's page, holding a
// network to 5 an hour, and past 60 a day keeping a message rather than refusing it (only 150 a day kept); Admin's count
// of new messages being of the 200 it shows (functions/_messages.js); the words refused, not cut, when too long
// (functions/_content.js); and the photos' list changed one change at a time (functions/api/background.js updateList).
// (The database is SQLite in memory, as D1 is SQLite: node:sqlite, so skipped where Node hasn't it.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost as contact } from '../../../functions/api/contact.js';
import { saveMessage, listMessages, markRead, messageCounts } from '../../../functions/_messages.js';
import { sanitize, tooLong, LIMITS } from '../../../functions/_content.js';
import { updateList } from '../../../functions/api/background.js';

const sqlite = await import('node:sqlite').catch(() => null);
// D1, as the server asks it
function d1() {
  const s = new sqlite.DatabaseSync(':memory:');
  const st = (sql, args = []) => ({
    bind: (...a) => st(sql, a),
    first: async () => s.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: s.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: Number(s.prepare(sql).run(...args).changes) } }),
  });
  return { s, prepare: (sql) => st(sql), batch: async (list) => { for (const x of list) await x.run(); return list.map(() => ({})); } };
}
const DB = sqlite && d1(), env = { DB, WEB3FORMS_KEY: 'test' };
const count = (q) => DB.s.prepare(q).get().n;
const fresh = () => { DB.s.exec('DELETE FROM pg_limits'); DB.s.exec('DELETE FROM messages'); };
// a message from the form, from an address (and a page, if it says)
async function send(ip, origin = 'https://georgefarrowgreen.com', i = 0) {
  const r = await contact({ env, request: new Request('https://georgefarrowgreen.com/api/contact', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, ...(origin ? { Origin: origin } : {}) },
    body: JSON.stringify({ name: 'Pat Lee', email: `pat${i}@example.com`, message: `Hello number ${i}` }) }) });
  return { status: r.status, ...(await r.json()) };
}
let mailed = 0;
const real = globalThis.fetch;
globalThis.fetch = async (url) => { if (String(url).startsWith('https://api.web3forms.com/')) { mailed++; return new Response('{}', { status: 200 }); } return real(url); };

test('Get in touch: not from another site\'s page; from its own, or a tool that says nothing of where it is', { skip: !sqlite }, async () => {
  const away = await send('198.51.100.1', 'https://elsewhere.example');
  assert.equal(away.status, 403);
  assert.equal((await send('198.51.100.1')).status, 200);
  assert.equal((await send('198.51.100.1', null)).status, 200);
  assert.equal(count('SELECT COUNT(*) AS n FROM messages'), 2);
});

test('Get in touch: 5 an hour from a network, the 6th told it has sent a few', { skip: !sqlite }, async () => {
  fresh();
  for (let i = 0; i < 5; i++) assert.equal((await send('2001:db8:1:2::' + (i + 1))).status, 200);
  const sixth = await send('2001:db8:1:2::9');
  assert.equal(sixth.status, 429);
  assert.match(sixth.error, /sent a few already/);
});

test('Get in touch: past 60 a day, kept (and said sent) but not emailed; past 150, refused, not blamed on the sender', { skip: !sqlite }, async () => {
  fresh(); mailed = 0;
  for (let i = 0; i < 150; i++) {
    const r = await send(`10.0.${i >> 8}.${i & 255}`, undefined, i);
    assert.equal(r.status, 200, `message ${i + 1}: ${r.error}`);
  }
  assert.equal(mailed, 60, 'the first 60 emailed');
  assert.equal(count('SELECT COUNT(*) AS n FROM messages'), 150, 'every one kept, for Admin');
  const more = await send('10.1.0.1', undefined, 150);
  assert.equal(more.status, 429);
  assert.doesNotMatch(more.error, /sent a few/);
  assert.match(more.error, /a lot of messages today/);
  assert.equal(count('SELECT COUNT(*) AS n FROM messages'), 150);
});

test('Admin\'s new messages are of the 200 it shows: seen, none new, with more kept than that', { skip: !sqlite }, async () => {
  fresh();
  for (let i = 0; i < 250; i++) await saveMessage(env, { name: `Writer ${i}`, email: `w${i}@example.com`, body: 'hi' });
  DB.s.exec('UPDATE messages SET created_at = id');            // (one after another, as they'd come)
  assert.deepEqual(await messageCounts(env), { n: 250, unread: 200, lastName: 'Writer 249', lastAt: count('SELECT MAX(id) AS n FROM messages') });
  const shown = await listMessages(env);
  assert.equal(shown.length, 200);
  assert.equal(await markRead(env, shown.map((m) => m.id)), 200);
  const after = await messageCounts(env);
  assert.equal(after.unread, 0, 'none new once those shown are seen');
  assert.equal(after.n, 250, 'and none deleted');
  await saveMessage(env, { name: 'Sam', email: 'sam@example.com', body: 'hello' });
  assert.equal((await messageCounts(env)).unread, 1, 'a new one is new');
});

test('the words: too long is refused, naming the line, not cut; an emoji is one character', () => {
  const long = 'word '.repeat(100);
  const clean = sanitize({ name: 'George', role: 'Photos', bio: long });
  assert.equal(clean.bio, long.trim(), 'not cut');
  assert.equal(tooLong(clean), 'bio');
  assert.equal(tooLong(sanitize({ name: 'G', role: 'x'.repeat(LIMITS.role + 1), bio: long })), 'role', 'the first line that is, as on the page');
  assert.equal(tooLong(sanitize({ name: '🚲'.repeat(LIMITS.name), role: '', bio: '' })), null, '80 bikes are 80 characters');
  assert.equal(tooLong(sanitize({ name: '🚲'.repeat(LIMITS.name + 1), role: '', bio: '' })), 'name');
  assert.deepEqual(sanitize({ name: ' A\n  B\u0000 ', role: null }), { name: 'A B', role: '', bio: '' }, 'one line of plain text still');
});

test('the photos: a change that comes too soon after another waits, and both are kept', async () => {
  // (KV as Cloudflare's is: a second write to a key within its second is refused)
  const kv = new Map([['bg_list', JSON.stringify([{ id: 'a' }, { id: 'b' }])]]);
  let last = 0, puts = 0;
  const BIO_KV = {
    async get(k) { await new Promise((r) => setTimeout(r, 5)); return kv.get(k) ?? null; },
    async put(k, v) { if (Date.now() - last < 40) throw new Error('KV PUT failed: 429 Too Many Requests'); last = Date.now(); puts++; kv.set(k, v); },
  };
  const tag = (id, device) => (l) => { const e = l.find((x) => x.id === id); if (!e) return false; e.device = device; };
  await Promise.all([updateList({ BIO_KV }, tag('a', 'mobile'), 60), updateList({ BIO_KV }, tag('b', 'desktop'), 60)]);
  assert.deepEqual(JSON.parse(kv.get('bg_list')).map((e) => e.device), ['mobile', 'desktop']);
  assert.equal(await updateList({ BIO_KV }, tag('gone', 'both'), 60), null, 'a photo that isn\'t there: nothing written');
  assert.equal(puts, 2);
  last = Date.now() + 1e6;                                       // (and one refused again: an error, for the page to say)
  await assert.rejects(updateList({ BIO_KV }, tag('a', 'both'), 10), /429/);
});

test.after(() => { globalThis.fetch = real; });
