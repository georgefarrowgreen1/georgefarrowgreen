// Mail (the inflite repo's email/, where it's checked out beside this one), its Worker against a real database (node:sqlite,
// made to look like D1, with Mail's own schema) and R2 kept in memory: Mark All as Read reaching every conversation in a
// list, not the forty loaded; each message sent once however often the phone asks; mail that comes while the database
// is unsteady, or down, kept and read in. And, from its page, a draft's files made files again without fetch (which the
// page's own rules refuse for a data: address).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';

const MAIL = new URL('../../../../inflite/email/', import.meta.url);
const skip = !existsSync(new URL('src/index.js', MAIL)) && 'the inflite repo isn’t beside this one';
const load = (p) => import(new URL(p, MAIL).href);

const sql = new DatabaseSync(':memory:');
let down = false, flaky = null;
const val = (a) => a.map((x) => (typeof x === 'boolean' ? +x : x === undefined ? null : x));
const ask = (q, a, f) => { if (down) throw new Error('D1_ERROR: the database is not answering'); if (flaky?.(q)) { flaky = null; throw new Error('D1_ERROR: a moment’s hiccup'); } return f(sql.prepare(q)); };
const st = (q, a = []) => ({ bind: (...b) => st(q, b), first: async () => ask(q, a, (s) => s.get(...val(a)) ?? null),
  all: async () => ask(q, a, (s) => ({ results: s.all(...val(a)), meta: {} })), run: async () => ask(q, a, (s) => ({ meta: { changes: Number(s.run(...val(a)).changes) } })) });
const DB = { prepare: (q) => st(q), batch: async (list) => { if (down) throw new Error('D1_ERROR: the database is not answering'); sql.exec('BEGIN'); try { const out = []; for (const s of list) out.push(await s.all()); sql.exec('COMMIT'); return out; } catch (e) { sql.exec('ROLLBACK'); throw e; } } };
const r2 = new Map();
const R2 = {
  put: async (k, v) => { r2.set(k, typeof v === 'string' ? new TextEncoder().encode(v) : new Uint8Array(v)); },
  get: async (k) => (r2.has(k) ? { arrayBuffer: async () => r2.get(k).buffer.slice(0), json: async () => JSON.parse(new TextDecoder().decode(r2.get(k))) } : null),
  delete: async (k) => { for (const x of [].concat(k)) r2.delete(x); },
  list: async ({ prefix, limit }) => ({ objects: [...r2.keys()].filter((k) => k.startsWith(prefix)).slice(0, limit).map((key) => ({ key })) }),
};
const sent = [];
let sendWith = async (m) => ({ messageId: `m${sent.length}@inflite.ai` });
const env = { DB, MAIL: R2, DOMAIN: 'inflite.ai', DEFAULT_FROM: 'hello@inflite.ai', ACCOUNT_ORIGIN: 'https://account.inflite.ai',
  EMAIL: { send: async (m) => { const r = await sendWith(m); sent.push(m); return r; } }, ASSETS: { fetch: async () => new Response('') } };
const later = [];
const ctx = { waitUntil: (p) => later.push(Promise.resolve(p).catch(() => {})) };
const settle = async () => { while (later.length) await later.shift(); };

// (the account says this is its admin, with a passkey, lately confirmed: let in)
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, init) => (String(u).startsWith(env.ACCOUNT_ORIGIN)
  ? new Response(JSON.stringify({ signedIn: true, admin: true, passkey: true, fresh: true, name: 'George', handle: 'george' }), { headers: { 'Content-Type': 'application/json' } })
  : realFetch(u, init));
const call = async (method, path, body) => {
  const { default: worker } = await load('src/index.js');
  const res = await worker.fetch(new Request(`https://email.inflite.ai${path}`, { method, headers: { Cookie: 'account=abcdefghijklmnopqrstuvwxyz', 'X-Inflite': '1', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined }), env, ctx);
  return { status: res.status, data: await res.json() };
};

const msg = (id, x) => { const row = { id, folder: 'inbox', thread_id: id, mailbox: 'hello@inflite.ai', from_name: 'Someone', from_email: 'someone@example.com', subject: id, date: Date.now() - 1000, unread: 1, category: 'people', ...x };
  sql.prepare(`INSERT INTO messages (${Object.keys(row).join(', ')}) VALUES (${Object.keys(row).map(() => '?').join(', ')})`).run(...val(Object.values(row))); };
const unread = (where) => sql.prepare(`SELECT COUNT(DISTINCT thread_id) AS n FROM messages WHERE folder = 'inbox' AND unread = 1 AND ${where}`).get().n;

test('Mark All as Read reaches every conversation in the list, however few are loaded, and no others', { skip }, async () => {
  const { ensureSchema } = await load('src/db.js');
  await ensureSchema(env);
  for (let i = 0; i < 120; i++) msg(`p${i}`, { date: Date.now() - i * 60e3 });
  for (let i = 0; i < 5; i++) msg(`u${i}`, { category: 'updates' });
  msg('s0', { mailbox: 'support@inflite.ai' });
  msg('s1', { mailbox: 'support@inflite.ai', category: 'updates' });
  msg('later', { snooze_until: Date.now() + 864e5 });
  const { readAll, listThreads } = await load('src/threads.js');
  assert.equal((await listThreads(env, new URL('https://x/api/threads?view=all&category=people'))).threads.length, 40, 'a page is forty');
  // (an address's own: only its mail, in People)
  await readAll(env, { view: 'all', category: 'people', address: 'support@inflite.ai' });
  assert.equal(unread("thread_id = 's0'"), 0);
  assert.equal(unread("thread_id = 's1'"), 1, 'its Updates stay unread');
  assert.equal(unread("thread_id LIKE 'p%'"), 120, 'and the rest of People');
  // (all of People: all 120, not the forty loaded; Updates and Later as they were)
  await readAll(env, { view: 'unread', category: 'people', address: null, q: '' });
  assert.equal(unread("thread_id LIKE 'p%'"), 0);
  assert.equal(unread("category = 'updates'"), 6);
  assert.equal(unread("thread_id = 'later'"), 1, 'put off till later: not in the list, so not read');
  // (a search's: what it finds)
  await readAll(env, { view: 'all', q: 'u3' });
  assert.equal(unread("thread_id = 'u3'"), 0);
  assert.equal(unread("category = 'updates'"), 5);
  // (as the page asks, through the batch)
  const r = await call('POST', '/api/threads/batch', { action: 'read', every: { view: 'all', category: 'updates', address: null, q: '' } });
  assert.equal(r.status, 200);
  assert.equal(unread("category = 'updates' AND mailbox = 'hello@inflite.ai'"), 0);
  await settle();
});

test('a message is sent once, however often the phone asks for it; one that failed can be asked for again', { skip }, async () => {
  const body = { from: 'hello@inflite.ai', to: [{ email: 'rowan@example.com', name: 'Rowan' }], subject: 'Photos', text: 'Here they are', key: 'job-1234abcd' };
  const first = await call('POST', '/api/send', body);
  assert.equal(first.status, 200);
  const again = await call('POST', '/api/send', body);
  assert.deepEqual(again, first, 'asked again (its answer lost): said to have gone, with the same copy');
  assert.equal(sent.length, 1, 'sent once');
  assert.equal(sql.prepare(`SELECT COUNT(*) AS n FROM messages WHERE folder = 'sent' AND subject = 'Photos'`).get().n, 1, 'one copy kept');
  // (still going from the first time: said so, to be asked again)
  let release;
  sendWith = () => new Promise((ok) => { release = () => ok({ messageId: 'slow@inflite.ai' }); });
  const slow = call('POST', '/api/send', { ...body, key: 'job-slow0001' });
  await new Promise((ok) => setTimeout(ok, 20));
  const meanwhile = await call('POST', '/api/send', { ...body, key: 'job-slow0001' });
  assert.equal(meanwhile.status, 503);
  release();
  assert.equal((await slow).status, 200);
  assert.equal(sent.length, 2);
  // (refused by Email Sending: not counted as sent, so asking again sends it)
  sendWith = async () => { throw Object.assign(new Error('Sending limit reached'), { code: 'E_RATE_LIMIT_EXCEEDED' }); };
  assert.equal((await call('POST', '/api/send', { ...body, key: 'job-fail0001' })).status, 502);
  sendWith = async () => ({ messageId: 'ok@inflite.ai' });
  assert.equal((await call('POST', '/api/send', { ...body, key: 'job-fail0001' })).status, 200);
  assert.equal(sent.length, 3);
  // (which an outbox's went after all)
  assert.deepEqual((await call('GET', '/api/sends?keys=job-1234abcd,job-fail0001,job-never001,bad key')).data.sent.sort(), ['job-1234abcd', 'job-fail0001']);
  await settle();
});

const eml = (subject, id) => `From: Maya Chen <maya@studio-north.co>\r\nTo: hello@inflite.ai\r\nSubject: ${subject}\r\nMessage-ID: <${id}@studio-north.co>\r\nDate: ${new Date().toUTCString()}\r\nContent-Type: text/plain\r\n\r\nThe drawings are attached.\r\n`;
// (what Mail logs of a database that isn't answering, expected here: kept out of the tests' own output)
const quietly = async (fn) => { const was = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = was; } };
const incoming = (subject, id) => ({ to: 'hello@inflite.ai', from: 'maya@studio-north.co', raw: eml(subject, id), rawSize: 200, setReject: () => assert.fail('refused'), forward: async () => {} });

test('a database that hiccups as mail comes: read again a moment later, not shown as unreadable', { skip }, async () => {
  const { receiveEmail } = await load('src/receive.js');
  flaky = (q) => /FROM messages WHERE message_id = \?2 AND lower\(from_email\)/.test(q);
  await quietly(() => receiveEmail(incoming('Drawings', 'hiccup'), env, ctx));
  await settle();
  assert.equal(flaky, null, 'it did hiccup');
  const row = sql.prepare(`SELECT subject, snippet FROM messages WHERE message_id = 'hiccup@studio-north.co'`).get();
  assert.equal(row?.subject, 'Drawings');
  assert.match(row.snippet, /drawings are attached/);
});

test('mail that comes while the database is down: kept, and read in by the scheduled run once it answers', { skip }, async () => {
  const { receiveEmail, retryPending } = await load('src/receive.js');
  const before = sql.prepare('SELECT COUNT(*) AS n FROM messages').get().n;
  down = true;
  await quietly(() => receiveEmail(incoming('While it was down', 'outage'), env, ctx));
  await settle();
  down = false;
  const notes = [...r2.keys()].filter((k) => k.startsWith('pending/'));
  assert.equal(notes.length, 1, 'a note of it kept beside the original');
  assert.ok(r2.has(`raw/${notes[0].slice(8)}.eml`));
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM messages').get().n, before, 'nothing in the stream yet');
  await retryPending(env, ctx);
  await settle();
  const row = sql.prepare(`SELECT id, subject, mailbox, from_email FROM messages WHERE message_id = 'outage@studio-north.co'`).get();
  assert.equal(row?.subject, 'While it was down');
  assert.equal(row.id, notes[0].slice(8), 'under the id its original was kept by');
  assert.equal(row.mailbox, 'hello@inflite.ai');
  assert.equal([...r2.keys()].filter((k) => k.startsWith('pending/')).length, 0, 'its note let go');
  await retryPending(env, ctx);
  assert.equal(sql.prepare(`SELECT COUNT(*) AS n FROM messages WHERE message_id = 'outage@studio-north.co'`).get().n, 1, 'read in once');
});

test('a draft’s files are made files again from what was kept, never fetched (the page refuses fetch a data: address)', { skip }, async () => {
  const src = readFileSync(new URL('public/app.js', MAIL), 'utf8');
  const fn = /\n {2}function dataBlob\(url\) \{[\s\S]*?\n {2}\}\n/.exec(src)?.[0] || assert.fail('app.js: dataBlob');
  const dataBlob = vm.runInNewContext(`${fn}; dataBlob`, { Blob, atob, decodeURIComponent, Uint8Array });
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 255, 10]);
  const b = dataBlob(`data:image/png;base64,${png.toString('base64')}`);
  assert.equal(b.type, 'image/png');
  assert.deepEqual(Buffer.from(await b.arrayBuffer()), png, 'every byte as it was');
  const svg = dataBlob(`data:image/svg+xml,${encodeURIComponent('<svg width="4"/>')}`);
  assert.equal(svg.type, 'image/svg+xml');
  assert.equal(await svg.text(), '<svg width="4"/>');
  assert.equal(dataBlob('data:;base64,').type, 'application/octet-stream');
  // (and nowhere fetched: a draft's files come back as files, a forwarded one from Mail's own copy, said if it can't be had)
  assert.doesNotMatch(src, /fetch\(a\.url\)/);
  assert.match(src, /async function attachmentBlob\(a\) \{[\s\S]*?if \(a\.url\.startsWith\("data:"\)\) return dataBlob\(a\.url\);/);
});
