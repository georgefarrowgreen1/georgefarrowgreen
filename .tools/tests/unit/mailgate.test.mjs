// Mail's API gate for InFlite's page (One roof, stage 4, spec §3.5; the inflite repo's email/, beside this one): Mail's
// Worker, against a real database (node:sqlite made to look like D1, with Mail's own schema) and R2 in memory, the
// account standing in. CORS only for the hubs whose switch is on, by their exact origin; the preflight; writes need
// X-Inflite, reads don't; Sec-Fetch-Site checked when it's sent; every refusal (bodies, queries in an address, files that
// aren't pictures, addresses, signing out, notifications); /meta and /api/drafts/<id> with no body in them; Vary: Origin
// on every file's answer; the two navigations from InFlite only while a switch is on; /roof/* and /roof/version.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import * as roof from './fixtures/roof.mjs';

const MAIL = new URL('../../../../inflite/email/', import.meta.url);
const skip = roof.mailSkip || (!existsSync(new URL('src/hubgate.js', MAIL)) && 'the inflite repo beside has no hub gate for Mail yet (email/src/hubgate.js): its live branch, while this repo goes live first');
const load = (p) => import(new URL(p, MAIL).href);

const sql = new DatabaseSync(':memory:');
const val = (a) => a.map((x) => (typeof x === 'boolean' ? +x : x === undefined ? null : x));
const st = (q, a = []) => ({ bind: (...b) => st(q, b), first: async () => sql.prepare(q).get(...val(a)) ?? null,
  all: async () => ({ results: sql.prepare(q).all(...val(a)), meta: {} }), run: async () => ({ meta: { changes: Number(sql.prepare(q).run(...val(a)).changes) } }) });
const DB = { prepare: (q) => st(q), batch: async (list) => { const out = []; for (const s of list) out.push(await s.all()); return out; } };
const r2 = new Map();
const R2 = {
  put: async (k, v) => { r2.set(k, typeof v === 'string' ? new TextEncoder().encode(v) : new Uint8Array(v)); },
  get: async (k) => (r2.has(k) ? { body: r2.get(k), size: r2.get(k).byteLength, arrayBuffer: async () => r2.get(k).buffer.slice(0), json: async () => JSON.parse(new TextDecoder().decode(r2.get(k))), text: async () => new TextDecoder().decode(r2.get(k)) } : null),
  delete: async (k) => { for (const x of [].concat(k)) r2.delete(x); },
};
// (the files: the module's two, a page for anything else, as not_found_handling: single-page-application answers)
const FILES = { '/roof/mail.js': ['text/javascript', 'export const BUILD = "1.49";'], '/roof/mail.css': ['text/css; charset=utf-8', '.m-mail{}'] };
const ASSETS = { fetch: async (req) => { const f = FILES[new URL(req.url).pathname]; return new Response(f ? f[1] : '<!doctype html><title>Mail</title>', { headers: { 'Content-Type': f ? f[0] : 'text/html; charset=utf-8' } }); } };
const HUBS = 'https://inflite.ai https://next.inflite.ai http://ifl.test:8788';
const base = { DB, MAIL: R2, ASSETS, DOMAIN: 'inflite.ai', DEFAULT_FROM: 'hello@inflite.ai', ACCOUNT_ORIGIN: 'https://account.inflite.ai', HUB_ORIGIN: HUBS };
const ON = { ...base, HUB_API: '1' };
const ctx = { waitUntil: (p) => Promise.resolve(p).catch(() => {}) };

const realFetch = globalThis.fetch;
globalThis.fetch = async (u, init) => (String(u).startsWith(base.ACCOUNT_ORIGIN)
  ? new Response(JSON.stringify({ signedIn: true, admin: true, passkey: true, fresh: true, name: 'George', handle: 'george' }), { headers: { 'Content-Type': 'application/json' } })
  : realFetch(u, init));

const COOKIE = 'account=abcdefghijklmnopqrstuvwxyz';
// (a request as InFlite's page makes it: credentialed CORS from its origin, same-site)
const ask = async (path, { env = ON, method = 'GET', origin = 'https://inflite.ai', site = 'same-site', headers = {}, body } = {}) => {
  const { default: worker } = await load('src/index.js');
  const h = { Cookie: COOKIE, ...(origin && { Origin: origin }), ...(site && { 'Sec-Fetch-Site': site }), ...headers };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  return worker.fetch(new Request(`https://email.inflite.ai${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env, ctx);
};
const W = { 'X-Inflite': '1' };

const row = (x) => { const r = { folder: 'inbox', mailbox: 'hello@inflite.ai', from_name: 'Pat Smith', from_email: 'pat@example.com', subject: 'Lunch', snippet: 'Shall we?', date: Date.now() - 6e4, unread: 1, category: 'people', to_json: '[{"name":"","email":"hello@inflite.ai"}]', ...x };
  sql.prepare(`INSERT INTO messages (${Object.keys(r).join(', ')}) VALUES (${Object.keys(r).map(() => '?').join(', ')})`).run(...val(Object.values(r))); };
const att = (id, message_id, type, x = {}) => {
  sql.prepare(`INSERT INTO attachments (id, message_id, filename, type, size, content_id, disposition) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, message_id, x.filename || `${id}.bin`, type, 4, x.cid || null, x.cid ? 'inline' : 'attachment');
  r2.set(`att/${id}`, new Uint8Array([1, 2, 3, 4]));
};
let ready = false;
async function seed() {
  if (ready) return;
  ready = true;
  const { ensureSchema } = await load('src/db.js');
  await ensureSchema(base);
  row({ id: 'm1', thread_id: 't1', message_id: 'orig-1@example.com', reply_to: 'pat+reply@example.com' });
  await R2.put('body/m1.json', JSON.stringify({ text: 'SECRET-TEXT body words', html: '<p>SECRET-HTML</p><img src="cid:pic1">' }));
  att('a-png', 'm1', 'image/png');
  att('a-svg', 'm1', 'image/svg+xml', { filename: 'logo.svg' });
  att('a-pdf', 'm1', 'application/pdf', { filename: 'menu.pdf' });
  att('a-inline', 'm1', 'image/jpeg', { cid: 'pic1' });
  r2.set('raw/m1.eml', new TextEncoder().encode('From: pat@example.com\r\n\r\nSECRET-RAW'));
  // (drafts: one written in InFlite, one by Mail on its own with its whole quote, answering m1, and one answering mail
  // Mail no longer has)
  row({ id: 'd1', thread_id: 'd1', folder: 'drafts', subject: 'Re: Lunch', snippet: 'Yes' });
  await R2.put('body/d1.json', JSON.stringify({ text: 'Yes', html: '', compose: { from: 'hello@inflite.ai', to: [{ name: 'Pat', email: 'pat@example.com' }], cc: [], bcc: [], subject: 'Re: Lunch', text: 'Yes',
    inReplyTo: 'orig-1@example.com', references: 'orig-1@example.com', quote: { header: 'On 3 Nov 2026 at 14:02, Pat wrote:', html: '<p>SECRET-HTML</p>', text: 'SECRET-TEXT', forward: false },
    attachments: [{ filename: 'note.txt', type: 'text/plain', size: 3, content: 'YWJj' }] } }));
  row({ id: 'd2', thread_id: 'd2', folder: 'drafts', subject: 'Re: Old' });
  await R2.put('body/d2.json', JSON.stringify({ text: '', html: '', compose: { subject: 'Re: Old', text: '', inReplyTo: 'gone@example.com', quote: { header: 'On …', html: '<b>SECRET-HTML</b>', text: '', forward: false }, attachments: [] } }));
  row({ id: 'd3', thread_id: 'd3', folder: 'drafts', subject: 'Fwd: Lunch' });
  await R2.put('body/d3.json', JSON.stringify({ text: '', html: '', compose: { subject: 'Fwd: Lunch', text: '', quote: { header: 'Begin forwarded message:', html: '<i>SECRET-HTML</i>', text: 'SECRET-TEXT', forward: true, of: 'm1' }, attachments: [] } }));
}

test('the hubs: only those whose switch is on, by exact origin; the framed page still framed by every hub listed', { skip }, async () => {
  const { hubOrigins, hubOf, listedOrigins } = await load('src/hubgate.js');
  assert.deepEqual(hubOrigins(base), [], 'no switch: none');
  assert.deepEqual(hubOrigins({ ...base, HUB_API: '1' }), ['https://inflite.ai']);
  assert.deepEqual(hubOrigins({ ...base, HUB_API_NEXT: '1' }), ['https://next.inflite.ai']);
  assert.deepEqual(hubOrigins({ ...base, HUB_API_TEST: '1' }), ['http://ifl.test:8788'], 'the test hub only by its own switch');
  assert.deepEqual(hubOrigins({ ...base, HUB_API: '0', HUB_API_NEXT: 'true' }), [], 'only "1" turns one on');
  assert.deepEqual(hubOrigins({ ...base, HUB_API: '1', HUB_ORIGIN: 'https://inflite.ai not-an-origin' }), [], 'a list with anything not an origin in it: none');
  assert.deepEqual(hubOrigins({ HUB_API: '1' }), [], 'no list: none');
  assert.deepEqual(listedOrigins(base), HUBS.split(' '));
  const req = (o) => new Request('https://email.inflite.ai/api/session', { headers: o ? { Origin: o } : {} });
  assert.equal(hubOf(req('https://inflite.ai'), ON), 'https://inflite.ai');
  for (const o of ['https://inflite.ai.evil.com', 'null', 'http://inflite.ai', 'https://inflite.ai:444', 'https://evil.inflite.ai', 'https://next.inflite.ai', 'HTTPS://INFLITE.AI', null])
    assert.equal(hubOf(req(o), ON), null, String(o));
  // (Mail's page, framed at /mail/ while the switches are off: every hub listed)
  const { default: worker } = await load('src/index.js');
  for (const env of [base, ON]) {
    const res = await worker.fetch(new Request('https://email.inflite.ai/'), env, ctx);
    assert.match(res.headers.get('content-security-policy'), /frame-ancestors https:\/\/inflite\.ai https:\/\/next\.inflite\.ai http:\/\/ifl\.test:8788$/);
  }
});

test('CORS: the switched-on hub answered with its own origin and credentials; any other origin, or that one switched off, refused as before', { skip }, async () => {
  await seed();
  const res = await ask('/api/counts');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://inflite.ai');
  assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
  assert.match(res.headers.get('vary'), /Origin/);
  for (const [origin, env] of [['https://inflite.ai.evil.com', ON], ['null', ON], ['http://inflite.ai', ON], ['https://next.inflite.ai', ON], ['https://inflite.ai', base], ['https://chat.inflite.ai', ON]]) {
    const r = await ask('/api/counts', { origin, env });
    assert.equal(r.status, 403, `${origin} (${env === base ? 'switch off' : 'switch on'})`);
    assert.equal(r.headers.get('access-control-allow-origin'), null, origin);
  }
  // (same-site with no Origin at all, as another inflite.ai page's fetch can't be: refused as before)
  assert.equal((await ask('/api/counts', { origin: null })).status, 403);
  // (Mail on its own: as before)
  assert.equal((await ask('/api/counts', { origin: null, site: 'same-origin' })).status, 200);
  // (the next hub by its own switch, the test hub by its own)
  assert.equal((await ask('/api/counts', { origin: 'https://next.inflite.ai', env: { ...base, HUB_API_NEXT: '1' } })).status, 200);
  assert.equal((await ask('/api/counts', { origin: 'http://ifl.test:8788', env: { ...base, HUB_API_TEST: '1' } })).status, 200);
  // (the account's own page, for Mail's notifications: as before)
  const acct = await ask('/api/notify', { origin: 'https://account.inflite.ai' });
  assert.equal(acct.status, 200);
  assert.equal(acct.headers.get('access-control-allow-origin'), 'https://account.inflite.ai');
});

test('the preflight: 204 with the hub’s origin, credentials, methods, headers and two hours; none for anyone else', { skip }, async () => {
  const res = await ask('/api/drafts', { method: 'OPTIONS', site: null, headers: { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type, x-inflite' } });
  assert.equal(res.status, 204);
  assert.deepEqual(Object.fromEntries([...res.headers].filter(([k]) => k.startsWith('access-control') || k === 'vary')), {
    'access-control-allow-origin': 'https://inflite.ai', 'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'GET, POST, PATCH, DELETE',
    'access-control-allow-headers': 'Content-Type, X-Inflite', 'access-control-max-age': '7200', vary: 'Origin',
  });
  for (const env of [base, { ...base, HUB_API_NEXT: '1' }]) {
    const r = await ask('/api/drafts', { method: 'OPTIONS', site: null, env });
    assert.notEqual(r.status, 204);
    assert.equal(r.headers.get('access-control-allow-origin'), null);
  }
});

test('reads need no header, writes need X-Inflite; Sec-Fetch-Site may be missing, never cross-site', { skip }, async () => {
  await seed();
  assert.equal((await ask('/api/threads?view=all')).status, 200, 'a read: a simple request');
  const no = await ask('/api/threads/batch', { method: 'POST', body: { ids: ['t1'], action: 'read' } });
  assert.equal(no.status, 403, 'a write without X-Inflite');
  assert.equal(no.headers.get('access-control-allow-origin'), 'https://inflite.ai', 'refusals readable by the page too');
  assert.equal((await ask('/api/threads/batch', { method: 'POST', headers: W, body: { ids: ['t1'], action: 'read' } })).status, 200);
  assert.equal((await ask('/api/counts', { site: null })).status, 200, 'older iOS: no Sec-Fetch-Site');
  for (const site of ['cross-site', 'same-origin', 'none']) assert.equal((await ask('/api/counts', { site })).status, 403, site);
});

test('refused to a hub: bodies, the original, a query in an address, files that aren’t pictures, addresses, signing out, notifications', { skip }, async () => {
  await seed();
  const refused = async (path, o = {}) => {
    const r = await ask(path, o);
    assert.equal(r.status, 403, `${o.method || 'GET'} ${path}`);
    const t = await r.text();
    assert.ok(!/SECRET/.test(t), `${path}: nothing of the message`);
  };
  await refused('/api/messages/m1');
  await refused('/api/messages/m1/raw');
  await refused('/api/messages/m1', { method: 'HEAD' });
  await refused('/api/threads?q=lunch');
  await refused('/api/threads?view=all&q=');
  await refused('/api/contacts?q=pat');
  await refused('/api/messages?q=lunch');
  await refused('/api/attachments/a-svg');
  await refused('/api/attachments/a-pdf');
  await refused('/api/addresses', { method: 'POST', headers: W, body: { local: 'new' } });
  await refused('/api/addresses/hello%40inflite.ai', { method: 'DELETE', headers: W });
  await refused('/api/addresses/hello%40inflite.ai', { method: 'PATCH', headers: W, body: { isDefault: true } });
  await refused('/api/logout', { method: 'POST', headers: W, body: {} });
  for (const p of ['/api/push/key', '/api/push/subscribe', '/api/push/unsubscribe']) await refused(p, p.endsWith('key') ? {} : { method: 'POST', headers: W, body: {} });
  // (a picture: as a picture)
  const png = await ask('/api/attachments/a-png');
  assert.equal(png.status, 200);
  assert.equal(png.headers.get('content-type'), 'image/png');
  // (an address's own settings: yes; its name, say)
  assert.equal((await ask('/api/addresses/hello%40inflite.ai', { method: 'PATCH', headers: W, body: { name: 'George' } })).status, 200);
  // (and for Mail on its own, every one as before)
  const own = { origin: null, site: 'same-origin' };
  const m = await ask('/api/messages/m1', own);
  assert.equal(m.status, 200);
  assert.match((await m.json()).text, /SECRET-TEXT/);
  assert.equal((await ask('/api/messages/m1/raw', own)).status, 200);
  assert.equal((await ask('/api/threads?q=lunch', own)).status, 200);
  assert.equal((await ask('/api/attachments/a-svg', own)).status, 200);
});

test('/meta and /api/drafts/<id>: never a body; drafts only for drafts; the old quote as { of, mode } or quoteOld', { skip }, async () => {
  await seed();
  const meta = await ask('/api/messages/m1/meta');
  assert.equal(meta.status, 200);
  const mt = await meta.text();
  assert.ok(!/SECRET/.test(mt), 'no body in /meta');
  const m = JSON.parse(mt);
  assert.equal(m.html, undefined);
  assert.equal(m.text, undefined);
  assert.equal(m.id, 'm1');
  assert.equal(m.replyTo, 'pat+reply@example.com');
  assert.equal(m.messageId, 'orig-1@example.com');
  assert.deepEqual(m.attachments.map((a) => a.id).sort(), ['a-pdf', 'a-png', 'a-svg'], 'its own files, not the picture in its text');
  assert.deepEqual(Object.keys(m.attachments[0]).sort(), ['filename', 'id', 'size', 'type']);
  assert.equal((await ask('/api/messages/nope/meta')).status, 404);

  const d1 = await ask('/api/drafts/d1');
  assert.equal(d1.status, 200);
  const t1 = await d1.text();
  assert.ok(!/SECRET/.test(t1), 'no quoted text in a draft');
  const j1 = JSON.parse(t1);
  assert.deepEqual(j1.compose.quote, { of: 'm1', mode: 'reply' }, 'tied to the message it answers');
  assert.equal(j1.quoteOld, false);
  assert.deepEqual(j1.compose.files, [{ i: 0, filename: 'note.txt', type: 'text/plain', size: 3 }], 'files without their bytes');
  assert.equal(j1.compose.text, 'Yes');
  assert.deepEqual(j1.compose.to, [{ name: 'Pat', email: 'pat@example.com' }]);
  const j2 = await (await ask('/api/drafts/d2')).json();
  assert.equal(j2.compose.quote, null);
  assert.equal(j2.quoteOld, true, 'answering mail Mail no longer has');
  const j3 = await (await ask('/api/drafts/d3')).json();
  assert.deepEqual(j3.compose.quote, { of: 'm1', mode: 'forward' }, 'by its of');
  assert.equal((await ask('/api/drafts/m1')).status, 404, 'a message that came in: not a draft');
  assert.equal((await ask('/api/drafts/nope')).status, 404);
});

test('Vary: Origin on every answer for a file, to anyone, found or not, once', { skip }, async () => {
  await seed();
  for (const [path, o] of [['/api/attachments/a-png', {}], ['/api/attachments/a-svg', {}], ['/api/attachments/nope', {}], ['/api/attachments/a-png', { origin: null, site: 'same-origin' }],
    ['/api/attachments/a-png', { origin: null, site: null }], ['/api/attachments/a-png', { origin: 'https://evil.example', site: 'cross-site' }]]) {
    const r = await ask(path, o);
    assert.match(r.headers.get('vary') || '', /(^|,\s*)Origin(\s*,|$)/, `${path} ${JSON.stringify(o)}: ${r.status}`);
    // (added to what's there, never twice, as a hub's own Vary and the file's both say it)
    assert.equal((r.headers.get('vary').match(/origin/gi) || []).length, 1, `${path} ${JSON.stringify(o)}: once`);
  }
});

test('a tap at InFlite opening a file or an original at Mail’s own address: only while a switch is on; nothing else same-site', { skip }, async () => {
  await seed();
  const nav = { 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document' };
  for (const path of ['/api/attachments/a-svg', '/api/attachments/a-pdf', '/api/messages/m1/raw']) {
    const on = await ask(path, { origin: null, headers: nav });
    assert.equal(on.status, 200, `${path}: switch on`);
    assert.equal(on.headers.get('access-control-allow-origin'), null, 'a navigation: no CORS');
    if (path.endsWith('svg')) assert.match(on.headers.get('content-disposition'), /^attachment/, 'an SVG: a download, as Mail’s own headers make it');
    assert.equal((await ask(path, { origin: null, headers: nav, env: base })).status, 403, `${path}: switch off`);
  }
  for (const [path, h] of [['/api/messages/m1', nav], ['/api/counts', nav], ['/api/attachments/a-svg', { ...nav, 'Sec-Fetch-Dest': 'iframe' }], ['/api/attachments/a-svg', { 'Sec-Fetch-Mode': 'no-cors', 'Sec-Fetch-Dest': 'image' }]])
    assert.equal((await ask(path, { origin: null, headers: h })).status, 403, `${path} ${JSON.stringify(h)}`);
});

test('/roof/*: the module’s scripts and styles as they are, no-cache; anything else 404, never Mail’s page; /roof/version', { skip }, async () => {
  const js = await ask('/roof/mail.js', { origin: null, site: null });
  assert.equal(js.status, 200);
  assert.equal(js.headers.get('content-type'), 'text/javascript');
  assert.equal(js.headers.get('cache-control'), 'no-cache');
  assert.equal(js.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(await js.text(), FILES['/roof/mail.js'][1]);
  assert.equal((await ask('/roof/mail.css', { origin: null, site: null })).status, 200);
  for (const p of ['/roof/x.js', '/roof/missing.css', '/roof/', '/roof/index.html', '/roof/..%2fapp.js', '/roof/a/b.js', '/roof/.hidden.js']) {
    const r = await ask(p, { origin: null, site: null });
    assert.equal(r.status, 404, p);
    assert.ok(!/<title>Mail/.test(await r.text()), `${p}: not Mail’s page`);
  }
  assert.equal((await ask('/roof/mail.js', { method: 'POST', origin: null, site: null })).status, 404);
  const v = await ask('/roof/version', { origin: null, site: null, headers: { Cookie: '' } });
  assert.equal(v.status, 200, 'no sign-in needed');
  assert.equal(v.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await v.json(), { build: '1.49' });
});
