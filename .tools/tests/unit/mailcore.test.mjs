// Mail's core (the inflite repo's email/, where it's checked out beside this one) against what a stranger's email can
// carry, through its Worker against a real database (node:sqlite, made to look like D1, with Mail's own schema), R2 kept
// in memory and Email Sending standing in: a line break hidden in an encoded Message-ID, Subject, sender's name or file
// name never becomes a header of a reply (kept as one line, and sent as one line whatever the page asks); To and Cc of
// thousands kept to fifty, and one too big to read still kept to see; a preview made of hostile HTML in a moment; a run
// that stops partway read in later, its files with it; a sent message's ID alone never letting a stranger into its
// conversation; and Mail's forwarders saying whose they are (the browser's address) and reading no more than they take.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const MAIL = new URL('../../../../inflite/email/', import.meta.url);
const skip = !existsSync(new URL('src/index.js', MAIL)) && 'the inflite repo isn’t beside this one';
const load = (p) => import(new URL(p, MAIL).href);

const sql = new DatabaseSync(':memory:');
const val = (a) => a.map((x) => (typeof x === 'boolean' ? +x : x === undefined ? null : x));
const st = (q, a = []) => ({ bind: (...b) => st(q, b), first: async () => sql.prepare(q).get(...val(a)) ?? null,
  all: async () => ({ results: sql.prepare(q).all(...val(a)), meta: {} }), run: async () => ({ meta: { changes: Number(sql.prepare(q).run(...val(a)).changes) } }) });
const DB = { prepare: (q) => st(q), batch: async (list) => { sql.exec('BEGIN'); try { const out = []; for (const s of list) out.push(await s.all()); sql.exec('COMMIT'); return out; } catch (e) { sql.exec('ROLLBACK'); throw e; } } };
const r2 = new Map();
// (hang: a key whose put never ends, as when the run is stopped partway)
let hang = null;
const R2 = {
  put: async (k, v) => { if (hang?.(k)) return new Promise(() => {}); r2.set(k, typeof v === 'string' ? new TextEncoder().encode(v) : new Uint8Array(v)); },
  get: async (k) => (r2.has(k) ? { body: r2.get(k), arrayBuffer: async () => r2.get(k).buffer.slice(0), json: async () => JSON.parse(new TextDecoder().decode(r2.get(k))) } : null),
  delete: async (k) => { for (const x of [].concat(k)) r2.delete(x); },
  list: async ({ prefix, limit }) => ({ objects: [...r2.keys()].filter((k) => k.startsWith(prefix)).slice(0, limit).map((key) => ({ key })) }),
};
const sent = [];
const env = { DB, MAIL: R2, DOMAIN: 'inflite.ai', DEFAULT_FROM: 'hello@inflite.ai', ACCOUNT_ORIGIN: 'https://account.inflite.ai', HUB_KEY: 'hub-key',
  EMAIL: { send: async (m) => (sent.push(m), { messageId: `s${sent.length}@inflite.ai` }) }, ASSETS: { fetch: async () => new Response('') } };
const later = [];
const ctx = { waitUntil: (p) => later.push(Promise.resolve(p).catch(() => {})) };
const settle = async () => { while (later.length) await later.shift(); };
const quietly = async (fn) => { const was = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = was; } };
// (the account: George, signed in; and what's passed on to it, kept to look at)
const passed = [];
globalThis.fetch = async (u, init) => {
  const req = new Request(u, init);
  if (/\/api\/(vitals|bugs)$/.test(req.url)) { passed.push(req); return new Response('{"ok":true}', { headers: { 'Content-Type': 'application/json' } }); }
  return new Response(JSON.stringify({ signedIn: true, admin: true, passkey: true, fresh: true, name: 'George', handle: 'george' }), { headers: { 'Content-Type': 'application/json' } });
};
const call = async (method, path, body) => {
  const { default: worker } = await load('src/index.js');
  const res = await worker.fetch(new Request(`https://email.inflite.ai${path}`, { method, headers: { Cookie: 'account=abcdefghijklmnopqrstuvwxyz', 'X-Inflite': '1', 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin' },
    body: body === undefined ? undefined : JSON.stringify(body) }), env, ctx);
  return { status: res.status, data: await res.json().catch(() => null) };
};
const incoming = (raw, from = 'a@b.c') => ({ to: 'hello@inflite.ai', from, raw, rawSize: raw.length, setReject: () => assert.fail('refused'), forward: async () => {} });
const receive = async (raw, from) => { const { receiveEmail } = await load('src/receive.js'); await quietly(() => receiveEmail(incoming(raw, from), env, ctx)); await settle(); };
const ready = async () => { const { ensureSchema } = await load('src/db.js'); await ensureSchema(env); };
const CTL = /[\x00-\x1f\x7f]/;

test('B1: a line break hidden in an encoded Message-ID, Subject, References, name or file name is kept as one line', { skip }, async () => {
  await ready();
  const { cleanMessageId } = await load('src/db.js');
  assert.equal(cleanMessageId('<x@y>\r\nBcc: spy@evil.com\r\nX: '), 'x@y>Bcc:spy@evil.comX:', 'printable characters alone');
  const raw = ['From: =?utf-8?Q?Eve=0D=0ABcc:_n@evil.com?= <eve@evil.io>', 'To: hello@inflite.ai', 'Subject: =?utf-8?Q?hi=0D=0ABcc:_x@evil.com?=',
    'Message-ID: =?utf-8?Q?<x@y>=0D=0ABcc:_spy@evil.com=0D=0AX:_?=', 'In-Reply-To: =?utf-8?Q?<i@y>=0D=0ABcc:_spy3@evil.com?=',
    'References: =?utf-8?Q?<r@y>=0D=0ABcc:_spy2@evil.com?=', 'MIME-Version: 1.0', 'Content-Type: multipart/mixed; boundary="b1"', '',
    '--b1', 'Content-Type: text/plain', '', 'hello', '',
    '--b1', 'Content-Type: text/plain; name="=?utf-8?Q?a=0D=0ABcc:_f@evil.com.txt?="', 'Content-Disposition: attachment; filename="=?utf-8?Q?a=0D=0ABcc:_f@evil.com.txt?="', '', 'file', '',
    '--b1--', ''].join('\r\n');
  await receive(raw, 'eve@evil.io');
  const row = sql.prepare(`SELECT * FROM messages WHERE from_email = 'eve@evil.io'`).get();
  assert.ok(row, 'kept');
  for (const k of ['subject', 'message_id', 'in_reply_to', 'refs', 'from_name']) assert.doesNotMatch(String(row[k] ?? ''), CTL, `${k}: ${JSON.stringify(row[k])}`);
  assert.match(row.subject, /^hi\s*Bcc: x@evil\.com$/, 'what it said, on one line');
  const atts = sql.prepare(`SELECT filename, type FROM attachments WHERE message_id = ?`).all(row.id);
  assert.equal(atts.length, 1);
  for (const a of atts) { assert.doesNotMatch(a.filename, CTL); assert.doesNotMatch(a.type, CTL); }

  // (a reply to it, as Mail's page asks: its Message-ID and References as kept)
  sent.length = 0;
  assert.equal((await call('POST', '/api/send', { to: [{ email: 'eve@evil.io', name: row.from_name }], subject: `Re: ${row.subject}`, text: 'No.', inReplyTo: row.message_id, references: row.refs })).status, 200);
  // (and one asking for line breaks itself: sent as one line all the same)
  assert.equal((await call('POST', '/api/send', { to: [{ email: 'eve@evil.io', name: 'Eve\r\nBcc: n2@evil.com' }], cc: [{ email: 'c@evil.io', name: 'C\nX: y' }], subject: 'hi\r\nBcc: s3@evil.com',
    text: 'line one\r\nline two', inReplyTo: '<x@y>\r\nBcc: spy@evil.com', references: ['<r@y>\r\nBcc: s2@evil.com'],
    attachments: [{ filename: 'a\r\nBcc: f@evil.com.txt', type: 'text/plain\r\nX-Evil: 1', content: Buffer.from('x').toString('base64') }] })).status, 200);
  assert.equal(sent.length, 2);
  for (const m of sent) {
    assert.doesNotMatch(m.subject, CTL, 'subject');
    for (const [k, v] of Object.entries(m.headers || {})) assert.doesNotMatch(v, CTL, k);
    assert.ok(m.headers['In-Reply-To'], 'still a reply');
    for (const p of [m.from, ...(m.to || []), ...(m.cc || [])]) assert.doesNotMatch(typeof p === 'string' ? p : `${p.name} ${p.email}`, CTL, 'names');
    for (const a of m.attachments || []) { assert.doesNotMatch(a.filename, CTL); assert.doesNotMatch(a.type, CTL); }
  }
  assert.equal(sent[1].text, 'line one\r\nline two', 'the text itself as it was');
  await settle();
});

test('B2: To and Cc of thousands: one too big to read kept to see (the original there), fifty kept of a big one, lists given a few', { skip }, async () => {
  await ready();
  // (1.8 MB of Cc: over what's read of a message's headers, so kept as one Mail couldn't read, with its original)
  const fat = Array.from({ length: 2000 }, (_, i) => `"${'N'.repeat(900)}" <p${i}@x.io>`).join(',\r\n ');
  await receive(`From: fat@b.c\r\nTo: hello@inflite.ai\r\nCc: ${fat}\r\nSubject: hi\r\nMessage-ID: <fat@b.c>\r\n\r\nhello\r\n`, 'fat@b.c');
  const kept = sql.prepare(`SELECT id, subject, length(to_json) + length(cc_json) AS n FROM messages WHERE from_email = 'fat@b.c'`).all();
  assert.equal(kept.length, 1, 'kept');
  assert.ok(kept[0].n < 64 * 1024, `not all of it: ${kept[0].n}`);
  assert.ok(r2.has(`raw/${kept[0].id}.eml`), 'its original there to download');
  // (a big one that's read: fifty kept, each name 200 characters at most, the subject 998)
  const many = Array.from({ length: 80 }, (_, i) => `"${'M'.repeat(300)}" <m${i}@x.io>`).join(',\r\n ');
  await receive(`From: "${'F'.repeat(1500)}" <big@b.c>\r\nTo: hello@inflite.ai, ${many}\r\nCc: ${many}\r\nSubject: ${'S'.repeat(3000)}\r\nMessage-ID: <big@b.c>\r\n\r\nhello\r\n`, 'big@b.c');
  const row = sql.prepare(`SELECT * FROM messages WHERE from_email = 'big@b.c'`).get();
  assert.ok(row, 'kept');
  const to = JSON.parse(row.to_json), cc = JSON.parse(row.cc_json);
  assert.equal(to.length, 50);
  assert.equal(cc.length, 50);
  assert.equal(to[0].email, 'hello@inflite.ai', 'the first ones');
  assert.ok([...to, ...cc].every((p) => p.name.length <= 200));
  assert.ok(row.subject.length <= 998 && row.subject.startsWith('SSS'));
  assert.ok(row.from_name.length <= 998);
  // (the stream's list: a few of each, the conversation's own messages all fifty)
  const list = await call('GET', '/api/threads?view=all');
  const t = list.data.threads.find((x) => x.latestId === row.id);
  assert.ok(t, 'in the stream');
  assert.ok(t.latest.to.length <= 5 && t.latest.cc.length <= 5, `${t.latest.to.length} and ${t.latest.cc.length}`);
  const whole = await call('GET', `/api/threads/${t.id}`);
  assert.equal(whole.data.messages[0].to.length, 50);
});

test('B3: a preview of hostile HTML in a moment, and still a preview of real HTML', { skip }, async () => {
  const { snippet } = await load('src/receive.js');
  for (const [k, html] of [['<style', '<style'.repeat(40000)], ['<div', '<div '.repeat(40000)], ['</div', '</div'.repeat(40000)], ['<', '<'.repeat(200000)],
    ['<div class', '<div class=x '.repeat(30000)], ['<script', `<script>${'<script'.repeat(30000)}`]]) {
    const t = Date.now();
    snippet('', html);
    assert.ok(Date.now() - t < 1500, `${k}: ${Date.now() - t} ms`);
  }
  assert.equal(snippet('', '<html><head><title>T</title><style>p{color:red}</style></head><body><p>Hello <b>there</b></p><script>x()</script><div class="gmail_quote">On Monday Pat wrote:</div></body></html>'), 'Hello there');
  assert.equal(snippet('', '<p>New</p><div id="divRplyFwdMsg">old</div>'), 'New');
  assert.equal(snippet('', '<p>New</p><blockquote>old</blockquote>'), 'New');
  assert.equal(snippet('', '<head><meta charset="utf-8"><body>Plain enough &amp; fine'), 'Plain enough & fine');
});

test('B3: a To of 300 KB of empty groups is turned to one Mail couldn’t read in a moment, not read for seconds', { skip, timeout: 120000 }, async () => {
  await ready();
  const t = Date.now();
  await receive(`From: groups@b.c\r\nTo: hello@inflite.ai, ${'g:;'.repeat(100000)}\r\nSubject: hi\r\n\r\nhello\r\n`, 'groups@b.c');
  assert.ok(Date.now() - t < 8000, `${Date.now() - t} ms`);
  assert.equal(sql.prepare(`SELECT COUNT(*) AS n FROM messages WHERE from_email = 'groups@b.c'`).get().n, 1, 'kept');
});

test('B3: a run stopped partway is read in later, its files with it, none left over; one that stops it twice kept unread', { skip }, async () => {
  await ready();
  const { receiveEmail, retryPending } = await load('src/receive.js');
  const raw = ['From: Maya <maya@studio-north.co>', 'To: hello@inflite.ai', 'Subject: Stopped partway', 'Message-ID: <stopped@studio-north.co>', 'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="b1"', '', '--b1', 'Content-Type: text/plain', '', 'The plan.', '',
    '--b1', 'Content-Type: text/plain; name="plan.txt"', 'Content-Disposition: attachment; filename="plan.txt"', '', 'plan', '', '--b1--', ''].join('\r\n');
  const atts0 = [...r2.keys()].filter((k) => k.startsWith('att/'));
  // (its body never written: the run stops there, its file written and nothing else)
  hang = (k) => k.startsWith('body/');
  receiveEmail(incoming(raw, 'maya@studio-north.co'), env, ctx);
  await new Promise((ok) => setTimeout(ok, 100));
  hang = null;
  later.length = 0;
  const notes = [...r2.keys()].filter((k) => k.startsWith('pending/'));
  assert.equal(notes.length, 1, 'a note beside its original');
  const id = notes[0].slice('pending/'.length);
  assert.ok(r2.has(`raw/${id}.eml`));
  // (not read in while it may still be coming)
  await retryPending(env, ctx);
  assert.ok(r2.has(notes[0]), 'left to its own run a while');
  // (minutes later: read in, once)
  const note = JSON.parse(new TextDecoder().decode(r2.get(notes[0])));
  r2.set(notes[0], new TextEncoder().encode(JSON.stringify({ ...note, at: Date.now() - 3600e3 })));
  await quietly(() => retryPending(env, ctx));
  await settle();
  const row = sql.prepare(`SELECT id, subject FROM messages WHERE message_id = 'stopped@studio-north.co'`).get();
  assert.equal(row?.id, id, 'read in under its own id');
  assert.equal(row.subject, 'Stopped partway');
  assert.ok(!r2.has(notes[0]), 'its note let go');
  const files = sql.prepare(`SELECT id FROM attachments WHERE message_id = ?`).all(id).map((a) => `att/${a.id}`);
  assert.equal(files.length, 1);
  assert.deepEqual([...r2.keys()].filter((k) => k.startsWith('att/') && !atts0.includes(k)).sort(), files.sort(), 'no file of the stopped run left over');

  // (one whose reading has stopped the run twice: kept as one Mail couldn't read, not read a third time)
  const id2 = 'stopped-twice-0000';
  await R2.put(`raw/${id2}.eml`, raw.replace('stopped@', 'twice@'));
  await R2.put(`pending/${id2}`, JSON.stringify({ to: 'hello@inflite.ai', from: 'maya@studio-north.co', at: Date.now() - 3600e3, coming: true, tries: 2 }));
  await quietly(() => retryPending(env, ctx));
  await settle();
  const row2 = sql.prepare(`SELECT subject FROM messages WHERE id = ?`).get(id2);
  assert.match(row2?.subject || '', /couldn’t read/);
  assert.ok(!r2.has(`pending/${id2}`));
});

test('B4: a sent message’s ID alone never lets a stranger into its conversation; its recipients, or the same subject, do', { skip }, async () => {
  await ready();
  const { findThread } = await load('src/db.js');
  const ins = (r) => sql.prepare(`INSERT INTO messages (${Object.keys(r).join(', ')}) VALUES (${Object.keys(r).map(() => '?').join(', ')})`).run(...val(Object.values(r)));
  ins({ id: 'b4-sent', folder: 'sent', thread_id: 'T-b4', message_id: 'b4-sent@inflite.ai', mailbox: 'hello@inflite.ai', from_email: 'hello@inflite.ai',
    to_json: JSON.stringify([{ name: 'Alice', email: 'alice@x.io' }]), cc_json: JSON.stringify([{ name: '', email: 'carol@x.io' }]), bcc_json: JSON.stringify([{ name: '', email: 'bob@x.io' }]),
    subject: 'Lunch plans', date: Date.now(), category: 'people' });
  assert.equal(await findThread(env, 'b4-sent@inflite.ai', null, 'eve@evil.io', 'Something else entirely'), null, 'a stranger, on another subject');
  assert.equal(await findThread(env, null, '<b4-sent@inflite.ai>', 'eve@evil.io', 'Hello'), null, 'nor by References');
  for (const who of ['alice@x.io', 'Carol@x.io', 'bob@x.io']) assert.equal(await findThread(env, 'b4-sent@inflite.ai', null, who, 'Other'), 'T-b4', who);
  assert.equal(await findThread(env, 'b4-sent@inflite.ai', null, 'alice.work@y.io', 'Re: Lunch plans'), 'T-b4', 'the same subject');
  assert.equal(await findThread(env, 'b4-sent@inflite.ai', null), 'T-b4', 'Mail’s own reply');
});

test('B5: Mail’s forwarders say whose they are, and take no more than they read', { skip }, async () => {
  const { default: worker } = await load('src/index.js');
  const ask = (path, body, h = {}) => worker.fetch(new Request(`https://email.inflite.ai${path}`, { method: 'POST', headers: { 'Sec-Fetch-Site': 'same-origin', 'CF-Connecting-IP': '203.0.113.9', ...h }, body, duplex: 'half' }), env, ctx);
  passed.length = 0;
  assert.equal((await ask('/api/vitals', JSON.stringify({ app: 'mail', m: { fcp: 400 } }))).status, 204);
  assert.equal((await ask('/api/bugs', JSON.stringify({ app: 'mail', words: 'x' }))).status, 200);
  await settle();
  assert.equal(passed.length, 2);
  for (const r of passed) {
    assert.equal(r.headers.get('X-Hub-Key'), 'hub-key', r.url);
    assert.equal(r.headers.get('X-Hub-IP'), '203.0.113.9', r.url);
    assert.equal(r.headers.get('CF-Connecting-IP'), '203.0.113.9', r.url);
  }
  // (too long by its Content-Length: refused before it's read; and one that doesn't say, read no further than too long)
  const stream = (chunks) => { const s = { pulls: 0 }; s.body = new ReadableStream({ pull(c) { if (s.pulls++ >= chunks) c.close(); else c.enqueue(new Uint8Array(1000).fill(120)); } }); return s; };
  for (const [path, cap] of [['/api/vitals', 600], ['/api/bugs', 12000]]) {
    let s = stream(200);
    assert.equal((await ask(path, s.body, { 'Content-Length': '200000' })).status, 413, path);
    assert.ok(s.pulls <= 2, `${path}: read ${s.pulls} parts`);
    s = stream(200);
    assert.equal((await ask(path, s.body)).status, 413, path);
    assert.ok(s.pulls <= Math.ceil((cap * 3) / 1000) + 3, `${path}: read ${s.pulls} parts`);
  }
  await settle();
  assert.equal(passed.length, 2, 'none passed on');
});
