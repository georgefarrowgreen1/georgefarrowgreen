// The home page's server: Get in touch (functions/api/contact.js) taking no message from another site's page, holding a
// network to 5 an hour and a wider one to 10 a day, and past 60 a day keeping a message rather than refusing it (only 150
// a day kept); Admin counts unread messages across the inbox and shows up to 200 (functions/_messages.js); the words refused, not
// cut, when too long (functions/_content.js); and the photos' list changed one change at a time, never past 50 however
// two adds cross (functions/api/background.js updateList, addPhoto).
// (The database is SQLite in memory, as D1 is SQLite: node:sqlite, so skipped where Node hasn't it.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost as contact } from '../../../functions/api/contact.js';
import { saveMessage, listMessages, markRead, messageCounts } from '../../../functions/_messages.js';
import { sanitize, tooLong, LIMITS, saveContent, getHistory } from '../../../functions/_content.js';
import { updateList, addPhoto, onRequestPut as uploadPhoto, onRequestGet as photo, onRequestHead as photoHead, onRequestDelete as removePhoto } from '../../../functions/api/background.js';
import { onRequestPost as restoreVersion } from '../../../functions/api/history.js';
import { onRequestPut as writeContent } from '../../../functions/api/content.js';
import { db, sha256, hex } from '../../../functions/_pigeon.js';
import { readFileSync } from 'node:fs';

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
async function send(ip, origin = 'https://georgefarrowgreen.com', i = 0, bindings = env, waitUntil) {
  const r = await contact({ env: bindings, waitUntil, request: new Request('https://georgefarrowgreen.com/api/contact', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, ...(origin ? { Origin: origin } : {}) },
    body: JSON.stringify({ name: 'Pat Lee', email: `pat${i}@example.com`, message: `Hello number ${i}` }) }) });
  return { status: r.status, ...(await r.json()) };
}
let mailed = 0;
const real = globalThis.fetch;
globalThis.fetch = async (url) => { if (String(url).startsWith('https://api.web3forms.com/')) { mailed++; return Response.json({success:true}); } return real(url); };

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

test('Get in touch: 10 a day from a wider network (an IPv6 /48, each /64 in it its own), so one place can\'t fill the day', { skip: !sqlite }, async () => {
  fresh();
  for (let i = 0; i < 10; i++) assert.equal((await send(`2001:db8:5:${i + 1}::1`, undefined, i)).status, 200);
  const more = await send('2001:db8:5:ff::1', undefined, 10);
  assert.equal(more.status, 429);
  assert.match(more.error, /sent a few already/);
  assert.equal((await send('2001:db8:6:1::1', undefined, 11)).status, 200, 'another /48: its own');
  assert.equal(count('SELECT COUNT(*) AS n FROM messages'), 11);
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

test('Admin counts all unread messages and shows older unread messages in its 200-message list', { skip: !sqlite }, async () => {
  fresh();
  for (let i = 0; i < 250; i++) await saveMessage(env, { name: `Writer ${i}`, email: `w${i}@example.com`, body: 'hi' });
  DB.s.exec('UPDATE messages SET created_at = id');            // (one after another, as they'd come)
  assert.deepEqual(await messageCounts(env), { n: 250, unread: 250, lastName: 'Writer 249', lastAt: count('SELECT MAX(id) AS n FROM messages') });
  const writers = (first, last) => Array.from({ length: first - last + 1 }, (_, i) => `Writer ${first - i}`);
  const shown = await listMessages(env);
  assert.equal(shown.length, 200);
  assert.deepEqual(shown.map((m) => m.name), writers(249, 50));
  assert.equal(await markRead(env, shown.map((m) => m.id)), 200);

  assert.equal((await messageCounts(env)).unread, 50);
  const backlog = await listMessages(env);
  assert.equal(backlog.length, 200);
  assert.deepEqual(backlog.map((m) => m.name), [...writers(249, 100), ...writers(49, 0)]);
  const unread = backlog.filter((m) => m.read_at === null);
  assert.deepEqual(unread.map((m) => m.name), writers(49, 0));
  assert.equal(await markRead(env, unread.map((m) => m.id)), 50);

  const after = await messageCounts(env);
  assert.equal(after.unread, 0);
  assert.equal(after.n, 250);
  assert.deepEqual((await listMessages(env)).map((m) => m.name), writers(249, 50));
  await saveMessage(env, { name: 'Sam', email: 'sam@example.com', body: 'hello' });
  assert.equal((await messageCounts(env)).unread, 1, 'a new one is new');
});

test('the words: too long is refused, naming the line, not cut; counted by code point (a bike is one, a flag two)', () => {
  const long = 'word '.repeat(100);
  const clean = sanitize({ name: 'George', role: 'Photos', bio: long });
  assert.equal(clean.bio, long.trim(), 'not cut');
  assert.equal(tooLong(clean), 'bio');
  assert.equal(tooLong(sanitize({ name: 'G', role: 'x'.repeat(LIMITS.role + 1), bio: long })), 'role', 'the first line that is, as on the page');
  assert.equal(tooLong(sanitize({ name: '🚲'.repeat(LIMITS.name), role: '', bio: '' })), null, '80 bikes are 80 characters');
  assert.equal(tooLong(sanitize({ name: '🚲'.repeat(LIMITS.name + 1), role: '', bio: '' })), 'name');
  assert.equal(tooLong(sanitize({ name: '🇬🇧'.repeat(LIMITS.name / 2 + 1), role: '', bio: '' })), 'name', '41 flags are 82');
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

test('the photos: two adds at 49, the second waiting on the first, make 50, not 51 cut to 50 as it\'s saved', async () => {
  // (both read the list at 49; the first's write takes a moment, and the second's, coming within its second, is refused)
  const kv = new Map([['bg_list', JSON.stringify(Array.from({ length: 49 }, (_, i) => ({ id: `p${i}` })))]]);
  let last = 0, puts = 0, refused = 0;
  const BIO_KV = {
    async get(k) { await new Promise((r) => setTimeout(r, 5)); return kv.get(k) ?? null; },
    async put(k, v) {
      if (Date.now() - last < 40) { refused++; throw new Error('KV PUT failed: 429 Too Many Requests'); }
      last = Date.now(); await new Promise((r) => setTimeout(r, 5)); puts++; kv.set(k, v);
    },
  };
  const add = (id) => updateList({ BIO_KV }, addPhoto({ id, focus: '50% 50%', device: 'both' }), 60);
  const [a, b] = await Promise.all([add('a'), add('b')]);
  assert.equal(refused, 1, 'the second waited');
  assert.equal(a.length, 50, 'the first: in, the 50th');
  assert.equal(b, null, 'the second, made again to the list as it is after its wait: refused, for its files to be taken away');
  const kept = JSON.parse(kv.get('bg_list'));
  assert.equal(kept.length, 50);
  assert.deepEqual(kept.filter((e) => e.id === 'a' || e.id === 'b').map((e) => e.id), ['a']);
  assert.equal(puts, 1, 'and nothing written for it');
});

test.after(() => { globalThis.fetch = real; });

test('contact delivery requires storage or an explicit provider receipt', {skip:!sqlite}, async t => {
  let outcome;
  t.mock.method(globalThis, 'fetch', async () => {
    if (outcome instanceof Error) throw outcome;
    return new Response(outcome, {status:200});
  });
  const stored = {DB:d1(), WEB3FORMS_KEY:'test'}, mailOnly = {WEB3FORMS_KEY:'test'};
  for (outcome of [new Error('provider offline'), '{"success":false}', '<p>Unavailable</p>']) {
    const durable = await send('198.51.100.8', undefined, 0, stored);
    assert.equal(durable.ok, true);
    assert.equal((await send('198.51.100.8', undefined, 0, mailOnly)).status, 502);
  }
  assert.equal((await listMessages(stored)).length,3);
  outcome = '{"success":true}';
  assert.equal((await send('198.51.100.8', undefined, 0, mailOnly)).ok,true);
  const resend = {RESEND_API_KEY: 'test'};
  outcome = '{}';
  assert.equal((await send('198.51.100.8', undefined, 0, resend)).status, 502);
  outcome = '{"id":"fixture-email"}';
  assert.equal((await send('198.51.100.8', undefined, 0, resend)).ok, true);
  const appsOnly = {CF_EMAIL_TOKEN: 'fixture', CF_ACCOUNT_ID: 'fixture'};
  assert.equal((await send('198.51.100.8', undefined, 0, appsOnly)).status, 503);
});

test('a saved message has its receipt while its email notification is still pending', {skip:!sqlite, timeout:3000}, async t => {
  const gate=Promise.withResolvers(), tasks=[];
  t.mock.method(globalThis,'fetch',()=>gate.promise);
  const stored={DB:d1(),WEB3FORMS_KEY:'test'};
  try {
    const receipt=await send('198.51.100.7', undefined, 1, stored, task=>tasks.push(task));
    assert.equal(receipt.ok,true);
    assert.equal((await listMessages(stored)).length,1);
    assert.equal(tasks.length,1);
  } finally {
    gate.resolve(Response.json({success:true}));
    await Promise.all(tasks);
  }
});

test('photo revalidation checks existence and uses R2 metadata without reading image bytes', async () => {
  const heads=[], reads=[];
  const env = {BIO_R2:{
    head:async key=>{heads.push(key);return key==='bg/ride'?{httpMetadata:{contentType:'image/webp'}}:null;},
    get:async key=>{reads.push(key);return {body:'photo',httpMetadata:{contentType:'image/webp'}};},
  }};
  const request = (id,method,tag) => new Request('https://bio.test/api/background?id='+id,{method,headers:tag?{'If-None-Match':tag}:{}});
  const first = await photoHead({env, request:request('ride&s=m','HEAD')});
  assert.equal(first.status,200);assert.equal(first.body,null);
  assert.equal(first.headers.get('Content-Type'),'image/webp');
  assert.deepEqual(heads,['bg/ride-m','bg/ride']);
  assert.equal((await photo({env,request:request('ride','GET','W/"bg-ride"')})).status,304);
  assert.equal((await photo({env,request:request('removed','GET','"bg-removed"')})).status,404);
  assert.deepEqual(reads,[]);
  assert.equal(await (await photo({env,request:request('ride','GET')})).text(),'photo');
  assert.deepEqual(reads,['bg/ride']);
});

test('owner mutations recover from interrupted storage, validate their inputs and report expired authorisation', { skip: !sqlite }, async () => {
  const keys = new Map([['bg_list', '["original"]']]);
  const objects = new Map();
  let interrupt = true, failDelete = false, listWrites = 0;
  const env = { DB: d1(), BIO_KV: {
    get: async key => keys.get(key),
    put: async (key, value) => { if (key === 'bg_list') listWrites++; keys.set(key, value); },
    delete: async key => keys.delete(key),
  }, BIO_R2: {
    put: async (key, value) => {
      if (interrupt && key.endsWith('-m')) throw Error('storage unavailable');
      objects.set(key, value);
    },
    delete: async list => {
      if (failDelete) throw Error('storage unavailable');
      list.forEach(key => objects.delete(key));
    },
  }};
  await db(env);
  const sql = env.DB.s, now = Date.now(), token = crypto.randomUUID();
  sql.prepare("INSERT INTO pg_users (id,handle,name,email,pub,salt,proof_hash,vault,swift,swift_at,created_at) VALUES ('owner','owner','Owner','owner@example.test','{}','s','p','v',3,?,?)").run(now,now);
  sql.prepare("INSERT INTO pg_meta (k,v) VALUES ('admin_user','owner')").run();
  sql.prepare("INSERT INTO pg_sessions (hash,user_id,created_at,seen_at,auth_at,site_hash) VALUES ('owner-session','owner',?,?,?,?)").run(now,now,now,hex(await sha256(token)));
  const call = (handler, path, method, body) => handler({env, request: new Request('https://bio.test/api/' + path, {
    method, headers: {Origin: 'https://bio.test', Cookie: '__Secure-account=' + token, 'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  })});
  const image = 'data:image/webp;base64,' + readFileSync(new URL('../../../projects/inflite-mono.webp', import.meta.url)).toString('base64');
  const put = () => call(uploadPhoto, 'background', 'PUT', {image, small: image});
  assert.equal((await put()).status, 503);
  assert.equal(objects.size, 0);
  assert.deepEqual(JSON.parse(keys.get('bg_list')), ['original']);
  interrupt = false;
  const {ok, id, images} = await (await put()).json();
  assert.equal(ok, true);
  assert.deepEqual(images.map(entry => entry.id), ['original', id]);
  assert.equal(images[1].m, 1);
  assert.deepEqual([...objects.keys()], ['bg/' + id, 'bg/' + id + '-m']);

  assert.equal((await call(writeContent, 'content', 'PUT', [])).status, 400);
  assert.equal((await call(restoreVersion, 'history', 'POST', {index: null})).status, 400);
  assert.equal((await call(removePhoto, 'background', 'DELETE', {})).status, 400);
  assert.equal(listWrites, 1);
  failDelete = true;
  assert.equal((await call(removePhoto, 'background', 'DELETE', {id})).status, 503);
  failDelete = false;
  const retry = await call(removePhoto, 'background', 'DELETE', {id});
  assert.equal(retry.status, 200);
  assert.deepEqual((await retry.json()).images.map(entry => entry.id), ['original']);
  assert.equal(listWrites, 2, 'the retry cleans up without writing the list again');
  assert.equal(objects.size, 0);

  sql.prepare("UPDATE pg_sessions SET auth_at=? WHERE user_id='owner'").run(now - 48 * 3600e3);
  const expired = await put();
  assert.equal(expired.status, 403);
  assert.equal((await expired.json()).field, 'reauth');
  assert.equal(objects.size, 0);
});

test('retrying a bio save keeps just one undo snapshot', async () => {
  const previous = {name: 'George', role: 'Rider', bio: 'Previous bio'};
  const next = {...previous, bio: 'New bio'};
  const keys = new Map([['content', JSON.stringify(previous)]]);
  let interrupt = true;
  const env = {BIO_KV: {
    get: async key => keys.get(key),
    put: async (key, value) => {
      if (key === 'content' && interrupt) throw Error('temporarily unavailable');
      keys.set(key, value);
    },
  }};
  await assert.rejects(saveContent(env, next), /temporarily unavailable/);
  interrupt = false;
  assert.deepEqual(await saveContent(env, next), next);
  assert.deepEqual(await saveContent(env, next), next);
  assert.deepEqual((await getHistory(env)).map(entry => entry.content), [previous]);
});

test('contact storage retries a failed migration and keeps separate database bindings isolated', { skip: !sqlite }, async () => {
  const first = d1(), second = d1();
  first.s.exec('CREATE TABLE messages (id INTEGER PRIMARY KEY, name TEXT, email TEXT, body TEXT, created_at INTEGER)');
  const prepare = first.prepare;
  let interrupted = false;
  first.prepare = sql => {
    if (!interrupted && sql.startsWith('ALTER TABLE')) {
      interrupted = true;
      return { run: async () => { throw new Error('database temporarily unavailable'); } };
    }
    return prepare(sql);
  };
  const message = { name: 'Sender', email: 'sender@example.test', body: 'hello' };
  await assert.rejects(saveMessage({ DB: first }, message), /temporarily unavailable/);
  await saveMessage({ DB: first }, message);
  assert.equal((await listMessages({ DB: first })).length, 1);
  assert.deepEqual(await listMessages({ DB: second }), []);
});
