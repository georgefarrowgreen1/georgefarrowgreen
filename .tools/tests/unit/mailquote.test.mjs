// Replies and forwards quoted by Mail's server (One roof, stage 4, S4-D4; the inflite repo's email/, beside this one):
// email/src/quote.js's header for a reply, a reply to all and a forward (fmtQuoteDate's words, in London); the "> " text;
// the <blockquote type="cite">; Mail's inline pictures left out; the same wrapping as the page's own buildPayload (taken
// from email/public/app.js) makes round the same quote; a hostile original without what could run, however it's hidden,
// against fixed output (what the page's DOMParser reading makes, written down from a browser, less what could run). And,
// through Mail's Worker (node:sqlite as D1, R2 in memory, the account and Email Sending standing in): a forwarded file by
// { ref }, copied from Mail's own, its sizes and number checked before any is read; a draft sent by its id with its
// stored fields, files and quote, once however often asked; a draft opened in Mail on its own with its forwarded files
// at Mail's address; a re-save that names no quote keeping the one it has; a forwarded file Mail has since lost.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import * as roof from './fixtures/roof.mjs';

const MAIL = new URL('../../../../inflite/email/', import.meta.url);
const skip = roof.mailSkip || (!existsSync(new URL('src/quote.js', MAIL)) && 'the inflite repo beside has no server-side quoting for Mail yet (email/src/quote.js): its live branch, while this repo goes live first');
const load = (p) => import(new URL(p, MAIL).href);

const sql = new DatabaseSync(':memory:');
const val = (a) => a.map((x) => (typeof x === 'boolean' ? +x : x === undefined ? null : x));
const st = (q, a = []) => ({ bind: (...b) => st(q, b), first: async () => sql.prepare(q).get(...val(a)) ?? null,
  all: async () => ({ results: sql.prepare(q).all(...val(a)), meta: {} }), run: async () => ({ meta: { changes: Number(sql.prepare(q).run(...val(a)).changes) } }) });
const DB = { prepare: (q) => st(q), batch: async (list) => { const out = []; for (const s of list) out.push(await s.all()); return out; } };
const r2 = new Map();
const reads = [];
const R2 = {
  put: async (k, v) => { r2.set(k, typeof v === 'string' ? new TextEncoder().encode(v) : new Uint8Array(v)); },
  get: async (k) => (reads.push(k), r2.has(k) ? { body: r2.get(k), arrayBuffer: async () => r2.get(k).buffer.slice(0), json: async () => JSON.parse(new TextDecoder().decode(r2.get(k))) } : null),
  delete: async (k) => { for (const x of [].concat(k)) r2.delete(x); },
};
const sent = [];
const env = { DB, MAIL: R2, DOMAIN: 'inflite.ai', DEFAULT_FROM: 'hello@inflite.ai', ACCOUNT_ORIGIN: 'https://account.inflite.ai', HUB_ORIGIN: 'https://inflite.ai', HUB_API: '1',
  EMAIL: { send: async (m) => (sent.push(m), { messageId: `s${sent.length}@inflite.ai` }) }, ASSETS: { fetch: async () => new Response('') } };
const later = [];
const ctx = { waitUntil: (p) => later.push(Promise.resolve(p).catch(() => {})) };
const settle = async () => { while (later.length) await later.shift(); };
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, init) => (String(u).startsWith(env.ACCOUNT_ORIGIN)
  ? new Response(JSON.stringify({ signedIn: true, admin: true, passkey: true, fresh: true, name: 'George', handle: 'george' }), { headers: { 'Content-Type': 'application/json' } })
  : realFetch(u, init));
// (from InFlite's page: a hub's CORS write)
const call = async (path, body, { origin = 'https://inflite.ai', method = 'POST' } = {}) => {
  const { default: worker } = await load('src/index.js');
  const res = await worker.fetch(new Request(`https://email.inflite.ai${path}`, { method, headers: { Cookie: 'account=abcdefghijklmnopqrstuvwxyz', 'X-Inflite': '1', 'Content-Type': 'application/json',
    ...(origin ? { Origin: origin, 'Sec-Fetch-Site': 'same-site' } : { 'Sec-Fetch-Site': 'same-origin' }) }, body: body === undefined ? undefined : JSON.stringify(body) }), env, ctx);
  return { status: res.status, data: await res.json() };
};

// 3 November 2026, 14:02 in London (GMT then)
const WHEN = Date.UTC(2026, 10, 3, 14, 2);
const HOSTILE = '<html><head><title>x</title><meta http-equiv="refresh" content="0;url=https://evil.example/"><base href="https://evil.example/"><style>p{color:red}</style></head>' +
  '<body><p>Hello <b>George</b> &amp; all</p><script>alert(1)</script><img src="x" onerror="alert(2)"><iframe src="https://evil.example/"></iframe>' +
  '<form action="https://evil.example/"><input name="p"></form><object data="x"></object><embed src="y"><img src="cid:logo1"><blockquote>older</blockquote></body></html>';
let seeded = false;
async function seed() {
  if (seeded) return;
  seeded = true;
  const { ensureSchema } = await load('src/db.js');
  await ensureSchema(env);
  const ins = (r) => sql.prepare(`INSERT INTO messages (${Object.keys(r).join(', ')}) VALUES (${Object.keys(r).map(() => '?').join(', ')})`).run(...val(Object.values(r)));
  ins({ id: 'm1', folder: 'inbox', thread_id: 't1', message_id: 'orig-1@example.com', refs: 'root@example.com', mailbox: 'hello@inflite.ai', from_name: 'Pat Smith', from_email: 'pat@example.com',
    to_json: JSON.stringify([{ name: '', email: 'hello@inflite.ai' }, { name: 'Sam', email: 'sam@example.com' }]), subject: 'Lunch', date: WHEN, category: 'people' });
  await R2.put('body/m1.json', JSON.stringify({ text: '', html: HOSTILE }));
  ins({ id: 'm2', folder: 'inbox', thread_id: 't2', message_id: 'orig-2@example.com', mailbox: 'hello@inflite.ai', from_name: '', from_email: 'jo@example.com', subject: 'Plain', date: WHEN, category: 'people' });
  await R2.put('body/m2.json', JSON.stringify({ text: 'Line one\nLine two', html: '' }));
  sql.prepare(`INSERT INTO attachments (id, message_id, filename, type, size, content_id, disposition) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('logo', 'm1', 'logo.png', 'image/png', 3, 'logo1', 'inline');
  sql.prepare(`INSERT INTO attachments (id, message_id, filename, type, size, content_id, disposition) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('menu', 'm1', 'menu.pdf', 'application/pdf', 4, null, 'attachment');
  r2.set('att/menu', new Uint8Array([37, 80, 68, 70]));
}

// The page's own buildPayload (email/public/app.js), run with the page's textToHtml and the server's htmlToText and
// bodyInner (the page's use a DOM, which a Worker has none of): it checks the wrapping only. What the server's two make
// of an original is checked against fixed output below.
const page = (q) => {
  const src = readFileSync(new URL('public/app.js', MAIL), 'utf8');
  const fn = (name, pre = '') => new RegExp(`\\n {2}${pre}function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n {2}\\}\\n`).exec(src)?.[0] || assert.fail(`app.js: ${name}`);
  const esc = /\n {2}const escapeHtml = [\s\S]*?;\n/.exec(src)[0];
  return vm.runInNewContext(`${esc}; ${fn('linkify')}; ${fn('textToHtml')}; ${fn('buildPayload', 'async ')}; buildPayload`, { htmlToText: q.htmlToText, bodyInner: q.bodyInner });
};

test('the header for a reply, a reply to all and a forward: Mail’s own words, in London', { skip }, async () => {
  await seed();
  const q = await load('src/quote.js');
  assert.equal(q.quoteDate(WHEN), '3 Nov 2026 at 14:02');
  assert.equal(q.quoteDate(Date.UTC(2026, 6, 3, 9, 5)), '3 Jul 2026 at 10:05', 'summer time');
  const reply = await q.quoteFrom(env, { of: 'm1', mode: 'reply' });
  assert.equal(reply.header, 'On 3 Nov 2026 at 14:02, Pat Smith <pat@example.com> wrote:');
  assert.equal(reply.forward, false);
  assert.equal((await q.quoteFrom(env, { of: 'm1', mode: 'all' })).header, reply.header, 'reply to all: the same words');
  assert.equal((await q.quoteFrom(env, { of: 'm2', mode: 'reply' })).header, 'On 3 Nov 2026 at 14:02, jo@example.com wrote:', 'no name: the address');
  const fwd = await q.quoteFrom(env, { of: 'm1', mode: 'forward' });
  assert.equal(fwd.header, 'Begin forwarded message:\n\nFrom: Pat Smith <pat@example.com>\nSubject: Lunch\nDate: 3 Nov 2026 at 14:02\nTo: hello@inflite.ai, sam@example.com');
  assert.equal(fwd.forward, true);
  assert.equal(await q.quoteFrom(env, { of: 'nope', mode: 'reply' }), null, 'gone: no quote');
  // (only { of, mode }, or Mail on its own's whole quote, is kept)
  assert.deepEqual(q.cleanQuote({ of: 'm1', mode: 'all', html: '<b>x</b>' }), { of: 'm1', mode: 'all' });
  assert.deepEqual(q.cleanQuote({ of: 'm1', mode: 'sideways' }), { of: 'm1', mode: 'reply' });
  assert.equal(q.cleanQuote({ of: '../x' }), null);
  assert.equal(q.cleanQuote('m1'), null);
  assert.deepEqual(q.cleanQuote({ header: 'On …', html: '<p>x</p>', text: 3, forward: 1, of: 'm1' }), { header: 'On …', html: '<p>x</p>', text: '', forward: true, of: 'm1' });
});

test('the words: "> " for a reply, as they are for a forward; the blockquote; Mail’s pictures left out; what could run left out', { skip }, async () => {
  await seed();
  const q = await load('src/quote.js');
  const plain = q.withQuote('Sounds good', await q.quoteFrom(env, { of: 'm2', mode: 'reply' }));
  assert.equal(plain.text, 'Sounds good\n\nOn 3 Nov 2026 at 14:02, jo@example.com wrote:\n\n> Line one\n> Line two');
  assert.match(plain.html, /^<div style="font-family:[^"]+">Sounds good<\/div><br><div style="[^"]+">On 3 Nov 2026 at 14:02, <a href="mailto:jo@example.com">jo@example.com<\/a> wrote:<\/div><blockquote type="cite" style="[^"]+">Line one<br>Line two<\/blockquote>$/);
  const fwd = q.withQuote('FYI', await q.quoteFrom(env, { of: 'm2', mode: 'forward' }));
  assert.match(fwd.text, /\n\nLine one\nLine two$/, 'a forward: as it was');
  const hostile = q.withQuote('Yes', await q.quoteFrom(env, { of: 'm1', mode: 'reply' }));
  const bq = /<blockquote type="cite"[^>]*>([\s\S]*)<\/blockquote>$/.exec(hostile.html)[1];
  for (const bad of [/<script/i, /alert\(1\)/, /<iframe/i, /<form/i, /<input/i, /<object/i, /<embed/i, /<base/i, /<meta/i, /<title/i, /<head/i, /<html/i, /<body/i, /cid:/, /\/api\/attachments\//])
    assert.doesNotMatch(bq, bad, String(bad));
  assert.match(bq, /^<p>Hello <b>George<\/b> &amp; all<\/p>/, 'the message as it was');
  assert.match(bq, /<blockquote>older<\/blockquote>$/);
  assert.match(hostile.text, /\n> Hello George & all\n/, 'its words, quoted');
  assert.doesNotMatch(hostile.text, /alert|p\{color/, 'nothing of its script or style in the words');
  assert.equal(q.withQuote('Only this', null).text, 'Only this', 'no quote: the words alone');
});

test('the same wrapping round the quote as the page’s own buildPayload makes', { skip }, async () => {
  await seed();
  const q = await load('src/quote.js');
  const buildPayload = page(q);
  for (const [of, mode, words] of [['m1', 'reply', 'Yes, see you\nthere https://x.com/a'], ['m1', 'forward', ''], ['m2', 'all', 'Me too <b>really</b>'], ['m2', 'forward', 'fwd: a@b.com']]) {
    const quote = await q.quoteFrom(env, { of, mode });
    // (the page has the original's HTML as getMessage gives it: its pictures at Mail's address, as quoteFrom has them)
    const want = await buildPayload({ text: words, quote, attachments: [] });
    const got = q.withQuote(words, quote);
    assert.equal(got.text, want.text, `${of} ${mode}: words`);
    assert.equal(got.html, want.html, `${of} ${mode}: HTML`);
  }
});

test('a forwarded file by { ref }: copied from Mail’s own copy, its type Mail’s; one Mail hasn’t got refused out loud', { skip }, async () => {
  await seed();
  sent.length = 0;
  const r = await call('/api/send', { from: 'hello@inflite.ai', to: ['sam@example.com'], subject: 'Fwd: Lunch', text: 'See below', html: '<p>See below</p>', attachments: [{ ref: 'menu', type: 'text/html', filename: 'menu.pdf' }], key: 'fwd-key-0001' }, { origin: null });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  await settle();
  assert.equal(sent.length, 1);
  assert.deepEqual([...sent[0].attachments[0].content], [37, 80, 68, 70]);
  assert.equal(sent[0].attachments[0].type, 'application/pdf', 'the stored type, not the one asked');
  const bad = await call('/api/send', { to: ['sam@example.com'], subject: 'x', text: 'x', html: 'x', attachments: [{ ref: 'nope', filename: 'gone.pdf' }] }, { origin: null });
  assert.equal(bad.status, 400);
  assert.match(bad.data.error, /gone\.pdf/);
  assert.equal(sent.length, 1, 'not sent without it');
});

test('a draft sent by its id: its stored fields, files, refs and quote, quoted by Mail; then gone; once however often asked', { skip }, async () => {
  await seed();
  sent.length = 0;
  const saved = await call('/api/drafts', { from: 'hello@inflite.ai', to: [{ name: 'Pat', email: 'pat@example.com' }], cc: ['sam@example.com'], bcc: [], subject: 'Re: Lunch', text: 'Yes, 1pm',
    inReplyTo: 'orig-1@example.com', references: 'root@example.com orig-1@example.com', quote: { of: 'm1', mode: 'all', html: '<script>x</script>' },
    attachments: [{ filename: 'note.txt', type: 'text/plain', size: 3, content: 'YWJj' }, { ref: 'menu' }] });
  assert.equal(saved.status, 200);
  const id = saved.data.id;
  const kept = JSON.parse(new TextDecoder().decode(r2.get(`body/${id}.json`))).compose;
  assert.deepEqual(kept.quote, { of: 'm1', mode: 'all' }, 'kept as which message it quotes, nothing more');
  assert.deepEqual(kept.attachments[1], { ref: 'menu', filename: 'menu.pdf', type: 'application/pdf', size: 4 });
  // (saved again, its own file kept by number, as InFlite's page never has its bytes)
  const again = await call('/api/drafts', { id, from: 'hello@inflite.ai', to: [{ name: 'Pat', email: 'pat@example.com' }], cc: ['sam@example.com'], subject: 'Re: Lunch', text: 'Yes, 1pm',
    inReplyTo: 'orig-1@example.com', references: 'root@example.com orig-1@example.com', quote: { of: 'm1', mode: 'all' }, attachments: [{ i: 0 }, { ref: 'menu' }] });
  assert.equal(again.data.id, id);
  const d = await call(`/api/drafts/${id}`, undefined, { method: 'GET' });
  assert.deepEqual(d.data.compose.files.map((f) => f.filename), ['note.txt', 'menu.pdf']);
  // (Mail on its own opens it with the quote whole)
  const own = await call(`/api/messages/${id}`, undefined, { method: 'GET', origin: null });
  assert.equal(own.data.compose.quote.header, 'On 3 Nov 2026 at 14:02, Pat Smith <pat@example.com> wrote:');
  assert.equal(own.data.compose.quote.of, 'm1');

  const r = await call('/api/send', { draftId: id, key: 'draft-key-0001' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  await settle();
  assert.equal(sent.length, 1);
  const m = sent[0];
  assert.deepEqual(m.to, [{ email: 'pat@example.com', name: 'Pat' }]);
  assert.deepEqual(m.cc, ['sam@example.com']);
  assert.equal(m.subject, 'Re: Lunch');
  assert.match(m.text, /^Yes, 1pm\n\nOn 3 Nov 2026 at 14:02, Pat Smith <pat@example.com> wrote:\n\n> Hello George & all/);
  assert.match(m.html, /<blockquote type="cite"/);
  assert.doesNotMatch(m.html, /<script/);
  assert.equal(m.headers['In-Reply-To'], '<orig-1@example.com>');
  assert.deepEqual(m.attachments.map((a) => [a.filename, new TextDecoder().decode(a.content)]), [['note.txt', 'abc'], ['menu.pdf', '%PDF']]);
  assert.equal(sql.prepare(`SELECT COUNT(*) AS n FROM messages WHERE id = ?`).get(id).n, 0, 'the draft gone');
  const sentRow = sql.prepare(`SELECT thread_id FROM messages WHERE folder = 'sent' ORDER BY date DESC LIMIT 1`).get();
  assert.equal(sentRow.thread_id, 't1', 'in its conversation');
  // (asked again, its answer lost: the same message, not sent twice)
  const twice = await call('/api/send', { draftId: id, key: 'draft-key-0001' });
  assert.equal(twice.status, 200);
  assert.equal(twice.data.id, r.data.id);
  assert.equal(sent.length, 1);
  // (a draft that isn't there: said so)
  const gone = await call('/api/send', { draftId: 'nope', key: 'draft-key-0002' });
  assert.equal(gone.status, 404);
  // (a draft with no quote, as one started in Mail on its own and sent from InFlite without it: no quote)
  const plain = await call('/api/drafts', { to: ['jo@example.com'], subject: 'Hi', text: 'Hello', quote: null, attachments: [] });
  await call('/api/send', { draftId: plain.data.id, key: 'draft-key-0003' });
  await settle();
  assert.equal(sent.at(-1).text, 'Hello');
  assert.doesNotMatch(sent.at(-1).html, /blockquote/);
});

// (what the page's DOMParser reading makes of each, as a browser gave it, is noted where Mail's server differs: its
// entities as they were written, no <tbody> put in, and less: no on…= handler, no javascript: address, no tag cut short)
test('a hostile original: what could run left out however it’s hidden, against fixed output', { skip }, async () => {
  const q = await load('src/quote.js');
  const cases = [
    // (an ordinary message: DOMParser gives the same, but for "—", "’" and <tbody>)
    ['<div class=x style="color:#333">Dear Pat,<br/>See <a href="https://example.com/?a=1&amp;b=2" target=_blank>this</a> &mdash; it&rsquo;s 5 &lt; 6.</div><table><tr><td>A</td><td>B</td></tr></table><ul><li>one</li><li>two</li></ul>',
      '<div class="x" style="color:#333">Dear Pat,<br>See <a href="https://example.com/?a=1&amp;b=2" target="_blank">this</a> &mdash; it&rsquo;s 5 &lt; 6.</div><table><tr><td>A</td><td>B</td></tr></table><ul><li>one</li><li>two</li></ul>',
      'Dear Pat,\nSee this — it’s 5 < 6.\nAB\none\ntwo'],
    // (DOMParser keeps onerror="alert(2)")
    [HOSTILE, '<p>Hello <b>George</b> &amp; all</p><img src="x"><img src="cid:logo1"><blockquote>older</blockquote>', 'Hello George & all\nolder'],
    // (a strip done once would rebuild these: <script src=//evil.example/x.js></script>, <iframe src=//evil>)
    ['<scr<script>ipt src=//evil.example/x.js></scr<script>ipt>', '', ''],
    ['<ifr<iframe>ame src=//evil>', '', 'ame src=//evil>'],
    ['<p>a</p><scr<script>ipt>alert(1)</scr</script>ipt><SCRIPT >b</SCRIPT ><p>c</p>', '<p>a</p>ipt&gt;<p>c</p>', 'a\nipt>c'],
    // (these two: DOMParser's words exactly; its HTML keeps the tags cut short, <ob<object>, <for<form>, as tags of no kind)
    ['<<script>script>alert(1)<</script>/script>', '&lt;/script&gt;', '</script>'],
    ['<ob<object>ject data=x></ob</object>ject><for<form>m action=//evil>', 'ject&gt;', 'ject data=x>ject>m action=//evil>'],
    // (javascript: however it's spelt; on…= however it's written; SVG's ways of setting an address)
    ['<a href="javascript:alert(1)">a</a><a href=" JaVa&#x0A;Script:alert(1)">b</a><a href="&#106;avascript:alert(1)">c</a><a href="java&Tab;script&colon;alert(1)">d</a>' +
      '<svg><a xlink:href="javascript:alert(1)">e</a><animate attributeName="href" values="javascript:alert(1)"/><set attributeName=href to=javascript:alert(1) /></svg>' +
      '<div ONMOUSEOVER=x onfocus = "y" style="width:expression(alert(1))" title="a\'b">f</div><img src=x onerror=alert(1)//>',
      '<a>a</a><a>b</a><a>c</a><a>d</a><svg><a>e</a></svg><div title="a\'b">f</div><img src="x">', 'abcdef'],
    // (a tag inside an SVG style, which a reader takes as a tag: only ever text here)
    ['<svg><style><img src=x onerror=alert(1)></style></svg><p title="x"><b>ok</b></p><!-- <script>x</script> -->', '<svg><style>&lt;img src=x onerror=alert(1)></style></svg><p title="x"><b>ok</b></p>', 'ok'],
  ];
  for (const [html, inner, text] of cases) {
    assert.equal(q.bodyInner(html), inner, `bodyInner ${html}`);
    assert.equal(q.htmlToText(html), text, `htmlToText ${html}`);
  }
  // (and through withQuote, as it's sent: the nested script and frame never come back)
  const sentHtml = q.withQuote('Yes', { header: 'On …', html: cases[2][0] + cases[3][0] + '<p>hi</p>', text: '', forward: false }).html;
  assert.doesNotMatch(sentHtml, /<script|<iframe|evil/i);
  // (a long message of tags cut short is read once, not again and again)
  const t0 = Date.now();
  q.bodyInner('<a'.repeat(200000));
  q.htmlToText('<a "'.repeat(100000));
  assert.ok(Date.now() - t0 < 2000, 'read in one pass');
});

test('a draft from InFlite opened in Mail on its own: a forwarded file at Mail’s own address, fetched to send or save it', { skip }, async () => {
  await seed();
  const saved = await call('/api/drafts', { to: ['sam@example.com'], subject: 'Fwd: Lunch', text: 'Menu attached', quote: { of: 'm1', mode: 'forward' },
    attachments: [{ filename: 'note.txt', type: 'text/plain', size: 3, content: 'YWJj' }, { ref: 'menu' }] });
  assert.equal(saved.status, 200);
  const own = await call(`/api/messages/${saved.data.id}`, undefined, { method: 'GET', origin: null });
  assert.equal(own.status, 200);
  const [mine, fwd] = own.data.compose.attachments;
  assert.equal(mine.content, 'YWJj', 'its own file as it was');
  assert.equal(mine.url, undefined);
  assert.deepEqual(fwd, { ref: 'menu', filename: 'menu.pdf', type: 'application/pdf', size: 4, url: '/api/attachments/menu' });
  // (which Mail on its own fetches, at its own address)
  const { default: worker } = await load('src/index.js');
  const file = await worker.fetch(new Request(`https://email.inflite.ai${fwd.url}`, { headers: { Cookie: 'account=abcdefghijklmnopqrstuvwxyz', 'Sec-Fetch-Site': 'same-origin' } }), env, ctx);
  assert.equal(file.status, 200);
  assert.deepEqual([...new Uint8Array(await file.arrayBuffer())], [37, 80, 68, 70]);
});

test('a re-save that names no quote keeps the one the draft has (quoteOld: Mail on its own’s, sent from there); quote: null takes it off', { skip }, async () => {
  await seed();
  const whole = { header: 'On 1 Oct 2026 at 09:00, Old Friend <old@example.com> wrote:', html: '<p>long ago</p>', text: 'long ago', forward: false };
  const saved = await call('/api/drafts', { to: ['old@example.com'], subject: 'Re: Then', text: 'Hi', inReplyTo: 'gone@example.com', quote: whole, attachments: [] }, { origin: null });
  const id = saved.data.id;
  const d = await call(`/api/drafts/${id}`, undefined, { method: 'GET' });
  assert.equal(d.data.quoteOld, true);
  assert.equal(d.data.compose.quote, null);
  // (closed in InFlite with its words changed: no quote key)
  const again = await call('/api/drafts', { id, to: ['old@example.com'], subject: 'Re: Then', text: 'Hi again', inReplyTo: 'gone@example.com', attachments: [] });
  assert.equal(again.status, 200);
  let kept = JSON.parse(new TextDecoder().decode(r2.get(`body/${id}.json`))).compose;
  assert.equal(kept.text, 'Hi again');
  assert.deepEqual(kept.quote, whole, 'its quote kept, to go when it’s sent from Mail on its own');
  // (sent without it, as "Send Without the Quoted Text?" asks: quote: null)
  await call('/api/drafts', { id, to: ['old@example.com'], subject: 'Re: Then', text: 'Hi again', quote: null, attachments: [] });
  kept = JSON.parse(new TextDecoder().decode(r2.get(`body/${id}.json`))).compose;
  assert.equal(kept.quote, null);
});

test('forwarded files: their number and sizes checked from Mail’s rows before any is read', { skip }, async () => {
  await seed();
  sql.prepare(`INSERT INTO attachments (id, message_id, filename, type, size, content_id, disposition) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('huge', 'm2', 'huge.mov', 'video/quicktime', 20 * 1024 * 1024, null, 'attachment');
  r2.set('att/huge', new Uint8Array(8));
  const msg = { to: ['sam@example.com'], subject: 'x', text: 'x', html: 'x' };
  reads.length = 0;
  const many = await call('/api/send', { ...msg, attachments: Array.from({ length: 21 }, () => ({ ref: 'menu' })), key: 'refs-key-0001' }, { origin: null });
  assert.equal(many.status, 413);
  assert.match(many.data.error, /20 files/);
  const big = await call('/api/send', { ...msg, attachments: [{ ref: 'huge' }, { ref: 'huge' }], key: 'refs-key-0002' }, { origin: null });
  assert.equal(big.status, 413);
  assert.match(big.data.error, /25 MB/);
  assert.deepEqual(reads.filter((k) => k.startsWith('att/')), [], 'no file read');
});

test('a draft whose forwarded file Mail has since lost: still saved, its words kept; sending it says the file’s gone', { skip }, async () => {
  await seed();
  sql.prepare(`INSERT INTO attachments (id, message_id, filename, type, size, content_id, disposition) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('brief', 'm2', 'brief.pdf', 'application/pdf', 4, null, 'attachment');
  r2.set('att/brief', new Uint8Array([1, 2, 3, 4]));
  const saved = await call('/api/drafts', { to: ['sam@example.com'], subject: 'Fwd: Plain', text: 'First', attachments: [{ ref: 'brief' }] });
  const id = saved.data.id;
  sql.prepare(`DELETE FROM attachments WHERE id = 'brief'`).run();
  r2.delete('att/brief');
  const again = await call('/api/drafts', { id, to: ['sam@example.com'], subject: 'Fwd: Plain', text: 'Second', attachments: [{ ref: 'brief' }] });
  assert.equal(again.status, 200, JSON.stringify(again.data));
  const kept = JSON.parse(new TextDecoder().decode(r2.get(`body/${id}.json`))).compose;
  assert.equal(kept.text, 'Second');
  assert.deepEqual(kept.attachments, [{ ref: 'brief', filename: 'brief.pdf', type: 'application/pdf', size: 4 }]);
  // (but not one it never had)
  const fresh = await call('/api/drafts', { to: ['sam@example.com'], subject: 'x', text: 'x', attachments: [{ ref: 'brief', filename: 'brief.pdf' }] });
  assert.equal(fresh.status, 400);
  const before = sent.length;
  const r = await call('/api/send', { draftId: id, key: 'lost-key-0001' });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /brief\.pdf/);
  assert.equal(sent.length, before, 'not sent without it');
});
