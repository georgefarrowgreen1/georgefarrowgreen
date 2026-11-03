// Chats' crypto core (One roof, stage 3: roof/s3/spec.md S3-D3–D5, S3-D14, §5.4, §10.1), run in node with what a
// Worker has stubbed: IndexedDB (a fake kept in memory), Web Locks, fetch (a fake Chat server with real sealed
// messages), postMessage. Proves:
//   - parity: the trust gate, pins, pairs and decrypt are app.js's, verbatim (whitespace aside), and the pinsWait lines
//   - TOFU on a fresh unlock (risk B3): an empty phone waits for the server's pins before it trusts any key it's shown;
//     a key that changed is flagged, the pin kept, and nothing is sealed to it
//   - the lock from the first call (B4); chat:<id> only after open, null on leave and lock (I2)
//   - waiting/since read quiet=1 and mark nothing read; no cache: before the Chats screen (I15); forget is final (I3)
//   - storage goldens both ways with app.js's own readers and writers (I8), the outbox merged under a lock (I9)
//   - the RPC door: unknown methods, bad arguments, non-META names refused; no result key d/kty/token/ct/iv; no URL,
//     header or body carries a word of a message
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MAIN } from './fixtures/roof.mjs';
import { E2E } from '../../../pigeon/crypto.js';
import { padPayload } from '../../../pigeon/cards.js';

const APP = readFileSync(new URL('pigeon/app.js', MAIN), 'utf8');
const CORE = readFileSync(new URL('pigeon/roof/core.js', MAIN), 'utf8');

// ---- a top-level declaration's source (function NAME, async function NAME, const NAME =), strings, templates,
// comments and regular expressions skipped over
export function extract(src, name) {
  const re = new RegExp(`^(?:async function ${name}\\(|function ${name}\\(|const ${name} = )`, 'm');
  const m = re.exec(src); if (!m) return null;
  const start = m.index, isFn = !m[0].startsWith('const');
  let i = start, depth = 0, sawBrace = false;
  const prevSig = () => { let j = i - 1; while (j >= start && /\s/.test(src[j])) j--; return j < start ? '' : src[j]; };
  const prevWord = () => { let j = i - 1; while (j >= start && /\s/.test(src[j])) j--; const e = j; while (j >= start && /\w/.test(src[j])) j--; return src.slice(j + 1, e + 1); };
  const quote = (j, c) => { j++; while (src[j] !== c) { if (src[j] === '\\') j++; j++; } return j + 1; };
  const tmpl = (j) => {
    while (j < src.length) {
      if (src[j] === '\\') { j += 2; continue; }
      if (src[j] === '`') return j + 1;
      if (src[j] === '$' && src[j + 1] === '{') {
        let d = 1; j += 2;
        while (d > 0) { const c = src[j]; if (c === '"' || c === "'") { j = quote(j, c); continue; } if (c === '`') { j = tmpl(j + 1); continue; } if (c === '{') d++; else if (c === '}') d--; j++; }
        continue;
      }
      j++;
    }
    return j;
  };
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i = src.indexOf('*/', i + 2) + 2; continue; }
    if (c === '"' || c === "'") { i = quote(i, c); continue; }
    if (c === '`') { i = tmpl(i + 1); continue; }
    if (c === '/') {
      const p = prevSig(), w = prevWord();
      if (!p || '(,=:[!&|?{};+-*%<>~^'.includes(p) || ['return', 'typeof', 'case', 'in', 'of'].includes(w)) {
        i++; let cls = false;
        for (;;) { const d = src[i]; if (d === '\\') { i += 2; continue; } if (d === '[') cls = true; else if (d === ']') cls = false; else if (d === '/' && !cls) break; i++; }
        i++; while (/[a-z]/.test(src[i])) i++; continue;
      }
    }
    if ('({['.includes(c)) { depth++; if (c === '{') sawBrace = true; }
    else if (')}]'.includes(c)) { depth--; if (isFn && depth === 0 && c === '}' && sawBrace) return src.slice(start, i + 1); }
    else if (!isFn && c === ';' && depth === 0) return src.slice(start, i + 1);
    i++;
  }
  return null;
}
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

const VERBATIM = ['keyId', 'pubFromId', 'mergePins', 'pairFor', 'trustedPub', 'keysOf', 'shapeOK', 'ctxOf', 'keepPlain', 'decrypt', 'decryptGroup', 'group', 'member',
  'others', 'memberMs', 'pinsCatchUp', 'restorePins', 'serverPins', 'savePins', 'checkPin', 'trustNewKey', 'setVerified', 'isVerified', 'wasVerified', 'seenPlain', 'base', 'checkMyKey', 'pinsMeta'];

test('parity: the trust gate, pins, pairs and decrypt are app.js’s, verbatim (S3-D5, risk B3)', () => {
  for (const name of VERBATIM) {
    const a = extract(APP, name), c = extract(CORE, name);
    assert.ok(a, `app.js has ${name}`);
    assert.ok(c, `core.js has ${name}`);
    assert.equal(norm(c), norm(a), `${name} is app.js’s, as it is`);
  }
  // (each once: no second copy shadowing the verbatim one)
  for (const name of VERBATIM) assert.equal(CORE.match(new RegExp(`^(?:async function ${name}\\(|function ${name}\\(|const ${name} = )`, 'gm')).length, 1, `${name} once`);
});

test('parity: start’s pins block is engineStart’s line for line, and sync waits for pinsWait as app.js’s does', () => {
  const eng = extract(APP, 'engineStart'), res = extract(CORE, 'resume');
  const lines = (s) => s.split('\n').map((l) => l.trim());
  const from = lines(eng).findIndex((l) => l.startsWith('S.token = saved.token;')), block = lines(eng).slice(from, from + 5);
  assert.deepEqual(block.map((l) => l.slice(0, 19)), ['S.token = saved.tok', 'S.fp = await E2E.fi', 'S.pins = (await idb', 'if (Object.keys(S.p', 'if (lockPrefs()) S.'], 'engineStart’s block, as read');
  const at = lines(res).indexOf(block[0]);
  assert.ok(at > 0, 'the core’s resume has engineStart’s first line');
  assert.deepEqual(lines(res).slice(at, at + 5), block, 'and the four after it, as they are');
  const wait = 'if (S.pinsWait) { await S.pinsWait; if (!S.token) return; }';
  assert.ok(norm(extract(APP, 'sync')).includes(wait), 'app.js’s sync waits for pinsWait');
  const cs = norm(extract(CORE, 'sync'));
  assert.ok(cs.includes(wait), 'the core’s sync too');
  assert.ok(cs.indexOf(wait) < cs.indexOf('await api(syncPath('), 'before it asks the server');
});

// ---------------------------------------------------------------- the harness ----
const MAIN_DIR = new URL('pigeon/', MAIN);
const tmp = [];
process.on('exit', () => { for (const d of tmp) try { rmSync(d, { recursive: true, force: true }); } catch (_) {} });
// (a copy of the core's graph per instance, so each has its own module state: idb.js's database, gone)
async function loadCore() {
  const d = mkdtempSync(join(tmpdir(), 'chatcore-')); tmp.push(d);
  mkdirSync(join(d, 'roof'));
  for (const f of ['crypto.js', 'cards.js', 'digest.js', 'links.js', 'rank.js', 'argon2.js', 'argon2w.js']) copyFileSync(new URL(f, MAIN_DIR), join(d, f));
  for (const f of ['core.js', 'idb.js']) copyFileSync(new URL('roof/' + f, MAIN_DIR), join(d, 'roof', f));
  return import(pathToFileURL(join(d, 'roof', 'core.js')).href);
}
function fakeIDB() {
  const data = new Map(), writes = [];
  const indexedDB = {
    open() {
      const req = {};
      setTimeout(() => {
        const db = {
          transaction() {
            const tx = {};
            const os = {
              get: (k) => { writes.push(['get', k]); return { result: data.has(k) ? structuredClone(data.get(k)) : undefined }; },
              put: (v, k) => { writes.push(['put', k]); data.set(k, structuredClone(v)); return {}; },
              delete: (k) => { writes.push(['del', k]); data.delete(k); return {}; },
            };
            tx.objectStore = () => os;
            setTimeout(() => tx.oncomplete?.(), 0);
            return tx;
          },
          createObjectStore() {}, close() {},
        };
        req.result = db; req.onupgradeneeded?.(); req.onsuccess?.();
      }, 0);
      return req;
    },
  };
  return { indexedDB, data, writes };
}
function fakeLocks() {
  const q = new Map(), held = [];
  return { held, request(name, fn) { const prev = q.get(name) || Promise.resolve(); const run = prev.then(() => { held.push(name); return fn(); }); q.set(name, run.catch(() => {})); return run; } };
}
const SENTENCE = 'meet me under the old clock tower';
const T = Date.UTC(2026, 10, 3, 9, 0);
async function ident() {
  const { privJwk, pub } = await E2E.newIdentity();
  return { priv: await E2E.importPriv(privJwk), pub };
}
// A Chat server with real sealed messages: me, Pat (one to one) and a group with Pat and Ali
async function makeWorld(o = {}) {
  const me = await ident(), pat = await ident(), ali = await ident(), pat2 = await ident();
  const ids = { me: 'u-me-0000-0001', pat: 'u-pat-000-00a1', ali: 'u-ali-000-00a2', group: 'g-ride-00-00b1' };
  const seal1 = async (from, fromKey, to, toPub, id, payload) => E2E.seal(await E2E.pair(fromKey, toPub), { id, from, to, type: 'msg' }, padPayload(payload));
  const patPub = () => (o.swapped ? pat2.pub : pat.pub);
  const msgsPat = [];
  for (const [i, t] of [[1, 'Ride on Saturday?'], [2, SENTENCE]]) {
    msgsPat.push({ id: `m-pat-${i}`, from: ids.pat, to: ids.me, sentAt: T - (10 - i) * 60e3, deliverAt: T - (9 - i) * 60e3, instant: true,
      ct: await seal1(ids.pat, pat.priv, ids.me, me.pub, `m-pat-${i}`, { t }) });
  }
  const photoBytes = new TextEncoder().encode('a tiny picture'), ph = await E2E.sealPhoto('m-pat-ph', photoBytes);
  msgsPat.push({ id: 'm-pat-ph', from: ids.pat, to: ids.me, sentAt: T - 12 * 60e3, deliverAt: T - 11 * 60e3, instant: true, photo: 1,
    ct: await seal1(ids.pat, pat.priv, ids.me, me.pub, 'm-pat-ph', { t: '', p: { k: ph.k, iv: ph.iv, w: 2, h: 1 } }) });
  msgsPat.sort((a, b) => a.sentAt - b.sentAt);
  const gid = 'm-grp-1', g = await E2E.sealGroup({ id: gid, from: ids.pat, group: ids.group, type: 'msg' }, padPayload({ t: 'Coffee after?' }));
  const gmsg = { id: gid, from: ids.pat, sentAt: T - 30 * 60e3, deliverAt: T - 30 * 60e3, instant: true, body: g.body,
    key: await E2E.seal(await E2E.pair(pat.priv, me.pub), { id: gid, from: ids.pat, to: ids.me, type: 'wrap' }, { k: g.key, h: g.h }) };
  const meRow = { id: ids.me, name: 'Sam Taylor', handle: 'sam', pub: me.pub, pigeons: true, newChats: 'instant' };
  const srv = { photoData: ph.data, photoBytes, pins: null, calls: [], posted: [], offline: false, pinsDelay: 0, read: 0, ids, me, pat, ali, pat2, msgsPat, gmsg, meRow, logout: 0, signedIn: true, block: new Set() };
  if (o.pins) srv.pins = await E2E.seal(await E2E.pair(me.priv, me.pub), { type: 'pins', id: 'pins', from: ids.me, to: ids.me }, { pins: o.pins(srv), at: T });
  const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });
  srv.syncBody = () => ({ now: Date.now(), me: meRow,
    friends: [{ id: ids.pat, name: 'Pat Jones', handle: 'pat', pub: patPub(), seenAt: Date.now() - 60e3, unread: 1, last: msgsPat.at(-1) },
      { id: ids.ali, name: 'Ali Khan', handle: 'ali', pub: ali.pub, seenAt: null, unread: 0, last: null }],
    groups: [{ id: ids.group, name: 'Saturday Ride', members: [{ id: ids.me, name: 'Sam Taylor', pub: me.pub }, { id: ids.pat, name: 'Pat Jones', pub: patPub() }, { id: ids.ali, name: 'Ali Khan', pub: ali.pub }], last: gmsg }],
    incoming: [{ id: 'u-rob-000-00c1', name: 'Robin Lee', handle: 'robin', at: T - 3600e3 }], outgoing: [] });
  srv.fetch = async (url, init = {}) => {
    const u = String(url), method = init.method || 'GET', body = init.body;
    srv.calls.push({ url: u, method, headers: { ...(init.headers || {}) }, body: typeof body === 'string' ? body : body ? '[form]' : '' });
    if (srv.offline || (srv.offlineFor && srv.offlineFor(u, method))) throw new TypeError('Failed to fetch');
    const p = u.replace(/^\/api\/pigeon\//, '');
    if (method === 'POST' && body && typeof body === 'string') srv.posted.push({ path: p, body: JSON.parse(body) });
    if (p === 'pins' && method === 'GET') { if (srv.pinsDelay) await new Promise((r) => setTimeout(r, srv.pinsDelay)); return json({ pins: srv.pins }); }
    if (p === 'pins' && method === 'POST') { srv.pins = JSON.parse(body).pins; return json({ ok: true }); }
    if (/^sync(\?quiet=1)?$/.test(p)) return json(srv.syncBody());
    if (p.startsWith('messages?with=')) {
      const q = new URLSearchParams(p.slice(9)); return json({ now: Date.now(), messages: q.get('with') === ids.pat ? msgsPat : [] });
    }
    if (p.startsWith('group-messages?id=')) return json({ now: Date.now(), messages: [gmsg] });
    if (p === 'messages' && method === 'POST') { const b = JSON.parse(body); return json({ message: { id: b.id, from: ids.me, to: b.to, sentAt: Date.now(), deliverAt: Date.now(), instant: !!b.instant } }); }
    if (p === 'group-messages' && method === 'POST') { const b = JSON.parse(body); return json({ message: { id: b.id, from: ids.me, sentAt: Date.now(), deliverAt: Date.now(), instant: true } }); }
    if (p === 'read' || p === 'group-read') { srv.read++; return json({ ok: true }); }
    if (p === 'resume') return json({ signedIn: srv.signedIn });
    if (p === 'logout') { srv.logout++; return json({ ok: true }); }
    if (p === 'pulse') return new Response('', { status: 404 });
    if (p === 'me') return json({ me: meRow });
    if (p === 'photo/m-pat-ph') return new Response(srv.photoData, { headers: { 'Content-Type': 'application/octet-stream' } });
    if (p === 'react' && method === 'POST') { const b = JSON.parse(body); return json({ react: { id: b.id, msg: b.msg, from: ids.me, ct: b.ct } }); }
    if (p.startsWith('mutuals')) return json({ mutuals: [], token: 'never', ct: 'x' });
    if (p === 'fit-share') return json({});
    return json({ error: 'not here' }, 404);
  };
  return srv;
}
// The core, loaded fresh with its own fake phone, and a session for me on it (unless o.empty)
async function boot(o = {}) {
  const srv = o.srv || await makeWorld(o);
  const db = o.db || fakeIDB(), locks = o.locks || fakeLocks(), patches = [];
  globalThis.indexedDB = db.indexedDB;
  globalThis.fetch = srv.fetch;
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true, locks, userAgent: 'node' }, configurable: true, writable: true });
  globalThis.self = { postMessage: (m) => patches.push(m), addEventListener() {} };
  if (!o.empty && !o.db) {
    db.data.set('session', { token: 'tok-SECRET-1234', me: { id: srv.ids.me, name: 'Sam Taylor', handle: 'sam', pub: srv.me.pub }, priv: srv.me.priv, pub: srv.me.pub });
    if (o.localPins) db.data.set('pins:' + srv.ids.me, o.localPins(srv));
  }
  const core = await loadCore();
  let n = 0;
  const call = async (m, ...a) => { const r = await core.handle({ id: ++n, m, a }); if (!r.ok) throw Object.assign(new Error(r.why), { why: r.why }); return r.v; };
  const raw = (m, a) => core.handle({ id: ++n, m, a });
  const topics = () => patches.filter((p) => p.t === 'patch');
  const lastOf = (t) => topics().filter((p) => p.topic === t).at(-1)?.data;
  return { core, srv, db, locks, patches, call, raw, topics, lastOf };
}
const settle = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const keyId = (pub) => `${pub.x}.${pub.y}`;

test('TOFU on a fresh unlock: no pins here, the server’s pins hold key A, sync shows key B → flagged, A kept, nothing sealed to B (risk B3)', async () => {
  const k = await boot({ swapped: true, pins: (s) => ({ [s.ids.pat]: keyId(s.pat.pub) }) });
  k.srv.pinsDelay = 60;                 // (the server's copy is slow to come: the first sync must wait for it)
  assert.equal((await k.call('start', { locked: false, visible: true, screen: true })).state, 'ready');
  const order = k.srv.calls.map((c) => c.url.replace('/api/pigeon/', ''));
  assert.ok(order.indexOf('pins') >= 0 && order.indexOf('pins') < order.findIndex((u) => /^sync/.test(u)), `pins asked before the first sync: ${order.join(' ')}`);
  const pat = k.lastOf('friends').find((f) => f.id === k.srv.ids.pat);
  assert.equal(pat.keyChanged, true, 'Pat’s key is flagged as changed');
  await settle(30);
  assert.equal(k.db.data.get('pins:' + k.srv.ids.me)[k.srv.ids.pat], keyId(k.srv.pat.pub), 'the pin is still key A');
  assert.deepEqual(k.lastOf('keywarn').friends.includes(k.srv.ids.pat), true, 'and keywarn says so');
  await assert.rejects(k.call('sendText', k.srv.ids.pat, 'hello there'), (e) => e.why === 'trust', 'sendText to the changed key is refused');
  const run = await k.call('sendRun', { card: { v: 1, kind: 'weather', from: 'weather', say: 'Rain at 3', at: T, snap: { place: 'London' } }, words: 'Rain at 3', pick: [k.srv.ids.pat], when: 'now' }).catch((e) => ({ why: e.why }));
  assert.ok(!run.sent?.length, `sendRun sends nothing to the changed key: ${JSON.stringify(run)}`);
  assert.ok(!k.srv.posted.some((p) => p.path === 'messages' && p.body.to === k.srv.ids.pat), 'nothing was posted to Pat');
  // (trusting the new key, as Chat's trust() does, opens it again: trustNewKey)
  await k.call('trust', k.srv.ids.pat);
  assert.equal(k.lastOf('friends').find((f) => f.id === k.srv.ids.pat).keyChanged, false);
});

test('a fresh unlock with no server pins pins what it sees first (TOFU), after the server has answered', async () => {
  const k = await boot();
  await k.call('start', { locked: false, visible: true, screen: true });
  await settle(30);
  assert.equal(k.db.data.get('pins:' + k.srv.ids.me)[k.srv.ids.pat], keyId(k.srv.pat.pub));
  assert.equal(k.lastOf('friends').find((f) => f.id === k.srv.ids.pat).keyChanged, false);
});

test('locked from the first call: start with nothing said is locked; waiting, open, rows lines and search give nothing (B4)', async () => {
  const k = await boot();
  assert.equal((await k.call('start', {})).state, 'locked', 'start({}) is locked');
  assert.deepEqual(await k.call('waiting', { ids: [k.srv.ids.pat] }), [], 'nothing waiting while locked');
  assert.equal(await k.call('since', k.srv.ids.pat, 0), null);
  assert.deepEqual(await k.call('search', 'clock'), []);
  await assert.rejects(k.call('open', k.srv.ids.pat), (e) => e.why === 'locked');
  assert.ok((await k.call('rows', 0, 10)).every((r) => !('line' in r)), 'no lines');
  assert.ok(!k.srv.calls.some((c) => /messages\?with=/.test(c.url)), 'no chat asked for while locked');
  assert.ok(!k.topics().some((p) => /^chat:/.test(p.topic) && p.data), 'no chat patched');
  // (a lock kept for another account isn't this one's)
  const k2 = await boot();
  assert.equal((await k2.call('start', { locked: true, lockUid: 'someone-else' })).state, 'ready');
  // unlocked by the page (its passkey check): words then
  assert.equal((await k.call('lock', false)).state, 'ready');
  const w = await k.call('waiting', { ids: [k.srv.ids.pat] });
  assert.equal(w.length, 1); assert.match(w[0].said, /clock tower/);
});

test('chat:<id> only after open, null on leave and on lock; waiting/since read quiet=1 and mark nothing read', async () => {
  const k = await boot();
  await k.call('start', { locked: false, visible: false, screen: false });
  assert.ok(!k.topics().some((p) => /^chat:/.test(p.topic)), 'no chat before open');
  const w = await k.call('waiting', { ids: [k.srv.ids.pat, k.srv.ids.group] });
  assert.equal(w.length, 2);
  const s = await k.call('since', k.srv.ids.pat, T - 9 * 60e3);
  assert.match(s.said, /clock tower/);
  const asks = k.srv.calls.filter((c) => /messages\?/.test(c.url));
  assert.ok(asks.length && asks.every((c) => /quiet=1/.test(c.url)), 'every read for Today is quiet=1');
  assert.ok(k.srv.calls.filter((c) => /sync/.test(c.url)).every((c) => /quiet=1/.test(c.url)), 'Today alone syncs quietly');
  assert.equal(k.srv.read, 0, 'nothing marked read');
  assert.ok(!k.topics().some((p) => /^chat:/.test(p.topic)), 'and no chat patched');
  // open, shown and visible: then read
  await k.call('start', { visible: true, screen: true });
  const chat = await k.call('open', k.srv.ids.pat);
  assert.equal(chat.id, k.srv.ids.pat);
  assert.ok(chat.msgs.some((m) => m.text === SENTENCE));
  await settle();
  assert.ok(k.topics().some((p) => p.topic === 'chat:' + k.srv.ids.pat && p.data), 'chat:<id> patched');
  await k.call('leave');
  assert.equal(k.topics().filter((p) => p.topic === 'chat:' + k.srv.ids.pat).at(-1).data, null, 'null on leave');
  assert.equal(k.topics().filter((p) => p.topic === 'typing:' + k.srv.ids.pat).at(-1).data, null, 'typing too');
  await k.call('open', k.srv.ids.pat);
  await k.call('lock', true);
  assert.equal(k.topics().filter((p) => p.topic === 'chat:' + k.srv.ids.pat).at(-1).data, null, 'null on lock');
  assert.equal(k.lastOf('state').state, 'locked');
  assert.ok(k.lastOf('rows').every((r) => !('line' in r)), 'rows lines blanked');
});

test('open while hidden marks nothing read; open shown and visible does (risk I14.8)', async () => {
  const k = await boot();
  await k.call('start', { locked: false, visible: false, screen: true });
  await k.call('open', k.srv.ids.pat); await settle();
  assert.equal(k.srv.read, 0, 'hidden: not read');
  await k.call('start', { visible: true }); await k.call('leave'); await k.call('open', k.srv.ids.pat); await settle(30);
  assert.ok(k.srv.read >= 1, 'shown and visible: read');
});

test('no cache: written while only Today has started the core; written once the Chats screen has shown (S3-D4, I15)', async () => {
  const k = await boot();
  await k.call('start', { locked: false, visible: true, screen: false });
  await k.call('sync', { quiet: true }); await settle(700);
  assert.ok(!k.db.writes.some(([, key]) => /^cache:/.test(key)), 'nothing kept for Today alone');
  await k.call('start', { screen: true }); await k.call('sync', {}); await settle(700);
  assert.ok(k.db.data.has('cache:' + k.srv.ids.me), 'kept once Chats has shown');
  const c = k.db.data.get('cache:' + k.srv.ids.me);
  assert.equal(c.v, 1); assert.ok(c.sync?.friends?.length);
  assert.ok(!JSON.stringify(c).includes(SENTENCE), 'kept sealed, never as words');
});

test('forget is final: every later write refused, the session gone, calls answered no (risk I3)', async () => {
  const k = await boot();
  await k.call('start', { locked: false, visible: true, screen: true }); await k.call('open', k.srv.ids.pat);
  await k.call('forget');
  assert.ok(!k.db.data.has('session'), 'the session is gone');
  assert.ok(!k.db.data.has('cache:' + k.srv.ids.me), 'and the cache');
  const before = k.db.writes.length;
  await settle(900);                     // (a debounced cacheSave or draftsSave would land here)
  assert.equal(k.db.writes.filter(([op]) => op === 'put').length, k.db.writes.slice(0, before).filter(([op]) => op === 'put').length, 'nothing written after');
  for (const [m, a] of [['sync', [{}]], ['open', [k.srv.ids.pat]], ['waiting', [{}]], ['draft', [k.srv.ids.pat, 'x']]]) assert.equal((await k.raw(m, a)).why, 'no', `${m} refused`);
  assert.equal((await k.raw('state', [])).ok, true, 'state still answers');
  assert.equal(k.topics().filter((p) => p.topic === 'chat:' + k.srv.ids.pat).at(-1).data, null, 'the open chat let go of');
});

test('signOut: logout on the server, then forget; state signin', async () => {
  const k = await boot();
  await k.call('start', { locked: false });
  await k.call('signOut');
  assert.equal(k.srv.logout, 1);
  assert.ok(!k.db.data.has('session'));
  assert.equal(k.lastOf('state').state, k.srv.signedIn ? 'signin' : 'signin');
});

test('no Chat session here: signed in to InFlite → key; not → signin; a 401 mid-session → ended', async () => {
  const k = await boot({ empty: true });
  assert.equal((await k.call('start', { locked: false })).state, 'key');
  const k2 = await boot({ empty: true }); k2.srv.signedIn = false;
  assert.equal((await k2.call('start', { locked: false })).state, 'signin');
  const k3 = await boot();
  await k3.call('start', { locked: false });
  k3.srv.fetch = async () => new Response(JSON.stringify({ error: 'ended', field: 'session' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  globalThis.fetch = k3.srv.fetch;
  await k3.call('sync', {});
  assert.equal(k3.lastOf('state').state, 'ended');
  assert.ok(!k3.db.data.has('session'));
});

// ---- app.js's own storage code, run on the same fake phone (the rollback's reader, risk I8)
function appStorage(S, extra = {}) {
  const names = ['CACHE_V', 'idb', 'cacheSave', 'cacheLoad', 'draftsMeta', 'draftsSave', 'draftsLoad', 'outKey', 'outboxSave', 'outboxAdd', 'outboxLoad', 'outboxOpen', 'outboxFlush'];
  const src = names.map((n) => { const t = extract(APP, n); assert.ok(t, `app.js has ${n}`); return t; }).join('\n');
  const deps = { S, E2E, ENGINE: false, MIN: 60e3, $ta: null, URL, Blob, navigator: { onLine: true }, console, toast() {}, haptic() {}, render() {}, renderOffline() {},
    loadChat: async () => {}, voiceMime: (m) => m, applySync: async () => {}, decrypt: async () => {}, decryptGroup: async () => {}, group: () => null, friend: () => ({}),
    pairFor: (pub) => E2E.pair(S.priv, pub), api: async () => ({}), ...extra };
  const f = new Function(...Object.keys(deps), `"use strict"; let cacheTimer = 0, draftsTimer = 0, flushing = null, outRest = { n: 0, until: 0 };\n${src}\nreturn { ${names.filter((n) => !/^[A-Z]/.test(n)).join(', ')} };`);
  return f(...Object.values(deps));
}

test('storage goldens: what the core writes, app.js reads (cache, drafts, outbox, pins), and the other way (S3-D4, risk I8)', async () => {
  const k = await boot();
  await k.call('start', { locked: false, visible: true, screen: true });
  await k.call('open', k.srv.ids.pat);
  await k.call('draft', k.srv.ids.ali, 'half a thought');
  k.srv.offlineFor = (u, m) => m === 'POST' && /\/messages$/.test(u);
  const q = await k.call('sendText', k.srv.ids.pat, 'queued while offline');
  await settle(1200);
  // app.js's readers, on the core's writing
  const S = { me: { id: k.srv.ids.me }, priv: k.srv.me.priv, myPub: k.srv.me.pub, drafts: new Map(), outbox: [], plain: new Map(), photos: new Map(), chatRaw: new Map(), view: 'messages' };
  let synced = null;
  const A = appStorage(S, { applySync: async (d) => { synced = d; } });
  assert.equal(await A.cacheLoad(), true, 'app.js opens the core’s cache');
  assert.equal(synced.me.id, k.srv.ids.me); assert.ok(S.chatRaw.has(k.srv.ids.pat), 'with the chat kept');
  await A.draftsLoad();
  assert.equal(S.drafts.get(k.srv.ids.ali), 'half a thought', 'and its drafts');
  await A.outboxLoad();
  const item = S.outbox.find((o) => o.id === q.id);
  assert.ok(item, 'and its outbox');
  assert.deepEqual(Object.keys(item).sort(), ['at', 'blob', 'err', 'id', 'kind', 'meta', 'path', 'to'].sort());
  assert.equal(item.path, 'messages'); assert.equal(item.to, k.srv.ids.pat); assert.ok(item.meta.ct && !JSON.stringify(item).includes('queued while offline'));
  // ...and app.js's flush sends the core's sealed letter as it is
  const sent = [];
  const A2 = appStorage(S, { api: async (path, o) => { sent.push({ path, body: o.body }); return {}; } });
  await A2.outboxFlush();
  assert.deepEqual(sent, [{ path: 'messages', body: item.meta }], 'milestone 1’s page sends the core’s queued letter');
  // pins: the same shape both ways (the verbatim savePins), a plain object of key ids
  assert.equal(typeof k.db.data.get('pins:' + k.srv.ids.me)[k.srv.ids.pat], 'string');

  // the other way: app.js writes, the core reads
  const db = fakeIDB();
  const srv = await makeWorld();
  db.data.set('session', { token: 'tok-SECRET-1234', me: { id: srv.ids.me, name: 'Sam Taylor', handle: 'sam', pub: srv.me.pub }, priv: srv.me.priv, pub: srv.me.pub });
  globalThis.indexedDB = db.indexedDB;
  const S2 = { me: { id: srv.ids.me }, priv: srv.me.priv, myPub: srv.me.pub, drafts: new Map([[srv.ids.ali, 'from Chat itself']]), outbox: [], raw: srv.syncBody(), skies: null, chatRaw: new Map(), view: 'messages' };
  const B = appStorage(S2);
  const meta = { id: 'o-app-1', to: srv.ids.pat, ct: await E2E.seal(await E2E.pair(srv.me.priv, srv.pat.pub), { id: 'o-app-1', from: srv.ids.me, to: srv.ids.pat, type: 'msg' }, padPayload({ t: 'from the old page' })), instant: true };
  await B.outboxAdd({ id: 'o-app-1', to: srv.ids.pat, path: 'messages', meta, blob: null, kind: 'instant', at: T });
  await B.draftsSave(); B.cacheSave(); await settle(700);
  const k2 = await boot({ srv, db });
  await k2.call('start', { locked: false, visible: true, screen: true });
  await settle(50);
  assert.ok(k2.srv.posted.some((p) => p.path === 'messages' && p.body.id === 'o-app-1' && p.body.ct === meta.ct), 'the core sends app.js’s queued letter as it was sealed');
  assert.ok(k2.lastOf('rows').length >= 2, 'and opens from app.js’s cache');
  // a draft the core writes keeps Chat's own (merged by chat, under the lock)
  await k2.call('draft', srv.ids.pat, 'from the core'); await settle(900);
  const S3 = { me: { id: srv.ids.me }, priv: srv.me.priv, myPub: srv.me.pub, drafts: new Map() };
  await appStorage(S3).draftsLoad();
  assert.equal(S3.drafts.get(srv.ids.ali), 'from Chat itself'); assert.equal(S3.drafts.get(srv.ids.pat), 'from the core');
  assert.ok(k2.locks.held.includes('inflight:drafts:' + srv.ids.me), 'under the drafts lock');
});

test('two cores on one phone: each queued letter survives, merged by id under the outbox lock (risk I9)', async () => {
  const srv = await makeWorld(), db = fakeIDB(), locks = fakeLocks();
  db.data.set('session', { token: 'tok-SECRET-1234', me: { id: srv.ids.me, name: 'Sam Taylor', handle: 'sam', pub: srv.me.pub }, priv: srv.me.priv, pub: srv.me.pub });
  srv.offlineFor = (u, m) => m === 'POST';
  const a = await boot({ srv, db, locks });
  await a.call('start', { locked: false });
  const b = await boot({ srv, db, locks });
  await b.call('start', { locked: false });
  const [x, y] = await Promise.all([a.call('sendText', srv.ids.pat, 'one'), b.call('sendText', srv.ids.pat, 'two')]);
  await settle(50);
  const ids = (db.data.get('outbox:' + srv.ids.me) || []).map((o) => o.id).sort();
  assert.deepEqual(ids, [x.id, y.id].sort(), 'both letters kept');
  assert.ok(locks.held.filter((n) => n === 'inflight:outbox:' + srv.ids.me).length >= 2, 'each write under the lock');
});

test('the RPC door: unknown methods, bad arguments, non-META names and keys are refused with why "no"', async () => {
  const k = await boot();
  await k.call('start', { locked: false });
  const no = async (m, a, why = 'no') => assert.equal((await k.raw(m, a)).why, why, `${m}(${JSON.stringify(a)?.slice(0, 60)})`);
  for (const m of ['eval', 'constructor', '__proto__', 'toString', 'hasOwnProperty', 'useKeys', 'unlock', 'secretJwk', 'api']) await no(m, []);
  await no('open', [42]); await no('open', ['../../x']); await no('open', ['x'.repeat(65)]);
  await no('open', [k.srv.ids.pat, 'extra']);
  await no('search', ['x'.repeat(101)]);
  await no('sendText', [k.srv.ids.pat, 'x'.repeat(4001)]);
  await no('sendText', [k.srv.ids.pat, 'hi', { way: 'now', evil: 1 }]);
  await no('start', [{ visible: 'yes' }]);
  await no('rows', [0, 100]); await no('rows', [-1, 3]);
  await no('waiting', [{ ids: Array(51).fill('a') }]);
  await no('react', [k.srv.ids.pat, 'm-pat-1', 'not an emoji at all']);
  await no('meta', ['messages', {}]); await no('meta', ['pins', {}]); await no('meta', ['logout', {}]); await no('meta', ['vault', {}]); await no('meta', ['passkey-register', {}]);
  await no('meta', ['me', { method: 'PATCH', appearance: 'dark' }]);
  await no('meta', ['me', { method: 'DELETE' }]);
  await no('meta', ['mutuals', { with: k.srv.ids.pat, ct: 'x' }]);
  await no('meta', ['avatar', { id: '../pins' }]);
  await no('meta', ['avatar', {}]);
  assert.equal((await k.raw('hello', [1])).v.protocol, 1);
  assert.equal((await k.core.handle({ id: 1.5, m: 'hello', a: [1] })), null, 'no id, no answer');
  const ok = await k.call('meta', 'mutuals', { with: k.srv.ids.pat });
  assert.ok(!('token' in ok) && !('ct' in ok), 'a META answer loses keys the page mustn’t have');
});

const BAD = new Set(['d', 'kty', 'token', 'ct', 'iv']);
function badKeys(v, path = '$', out = []) {
  if (v && typeof v === 'object' && !(typeof Blob !== 'undefined' && v instanceof Blob)) for (const [k, x] of Object.entries(v)) { if (BAD.has(k)) out.push(`${path}.${k}`); badKeys(x, `${path}.${k}`, out); }
  return out;
}
test('no method’s result, nor any patch, has a key named d, kty, token, ct or iv; no URL, header or body carries a message word', async () => {
  const k = await boot();
  const results = [];
  const r = async (m, ...a) => { const v = await k.raw(m, a); results.push([m, v]); return v; };
  await r('hello', 1); await r('start', { locked: false, visible: true, screen: true }); await r('state'); await r('sync', {}); await r('rows', 0, 10);
  await r('open', k.srv.ids.pat); await r('older', k.srv.ids.pat, 0); await r('search', 'clock'); await r('waiting', { ids: [k.srv.ids.pat, k.srv.ids.group] });
  await r('since', k.srv.ids.pat, 0); await r('safety', k.srv.ids.pat); await r('verify', k.srv.ids.pat, true); await r('trust', k.srv.ids.pat);
  await r('draft', k.srv.ids.pat, SENTENCE + ' draft'); await r('sendText', k.srv.ids.pat, SENTENCE + ' again', { way: 'now' });
  await r('react', k.srv.ids.pat, 'm-pat-1', '❤️');
  const card = { v: 1, kind: 'weather', from: 'weather', say: 'Rain at 3', at: T, snap: { place: 'London' } };
  await r('share', card, 'Rain at 3'); await r('rank', card); await r('sendRun', { card, words: 'Rain at 3', pick: [k.srv.ids.pat], when: 'now' });
  await r('meta', 'mutuals', { with: k.srv.ids.pat }); await r('read', k.srv.ids.pat); await r('leave'); await r('lock', true); await r('lock', false);
  await settle(900);
  for (const [m, v] of results) {
    // (SearchHit's token is the frozen name for a message's id, kept in the Worker: never the session's)
    const bad = badKeys(v).filter((p) => !(m === 'search' && /^\$\.v\.\d+\.token$/.test(p)));
    assert.deepEqual(bad, [], `${m}: ${JSON.stringify(v).slice(0, 120)}`);
  }
  for (const h of results.find(([m]) => m === 'search')[1].v) assert.match(h.token, /^m-/, 'a search hit’s token is the message’s id');
  for (const p of k.topics()) assert.deepEqual(badKeys(p.data), [], `patch ${p.topic}`);
  assert.ok(results.find(([m]) => m === 'open')[1].v.msgs.some((x) => x.text === SENTENCE), '(the words did cross, to the page that opened the chat)');
  assert.ok(results.find(([m]) => m === 'sendRun')[1].v.sent.length === 1, `(and Send went: ${JSON.stringify(results.find(([m]) => m === 'sendRun')[1])})`);
  const words = ['clock tower', 'under the old', 'Rain at 3', 'draft', 'again'];
  for (const c of k.srv.calls) {
    const seen = `${c.url} ${JSON.stringify(c.headers)} ${c.body}`;
    for (const w of words) assert.ok(!seen.includes(w), `no message word in ${c.method} ${c.url}: “${w}”`);
  }
  assert.ok(k.srv.calls.every((c) => !c.headers.Authorization || c.headers.Authorization === 'Bearer tok-SECRET-1234'), 'the bearer is Chat’s, only on its own API');
  assert.ok(k.srv.calls.every((c) => c.url.startsWith('/api/pigeon/')), 'nothing but Chat’s API asked');
  assert.ok(!k.patches.some((p) => JSON.stringify(p).includes('tok-SECRET')), 'the token never crosses');
  for (const p of k.topics()) if (/^(rows|friends|groups|me|requests|air|outbox|keywarn|unread|state|send)$/.test(p.topic)) assert.ok(!JSON.stringify(p.data).includes('again'), `${p.topic} has no words but rows' lines`);
});

test('rows: lines only for the window asked; older widens the open chat', async () => {
  const k = await boot();
  await k.call('start', { locked: false, visible: true, screen: true });
  const none = k.lastOf('rows');
  assert.ok(none.every((r) => !('line' in r)), 'no window asked: no lines');
  const rows = await k.call('rows', 0, 1);
  assert.equal(rows.length, 1); assert.ok('line' in rows[0]);
  await k.call('sync', {});
  const after = k.lastOf('rows');
  assert.ok('line' in after[0] && after.slice(1).every((r) => !('line' in r)), 'patches keep the window');
  await k.call('open', k.srv.ids.pat);
  assert.deepEqual(await k.call('older', k.srv.ids.pat, T), { added: 0, older: false });
});

test('photo: only the open chat’s, decrypted to a Blob; another chat’s is never fetched or opened (S3-D3)', async () => {
  const k = await boot();
  await k.call('start', { locked: false, visible: true, screen: true });
  await k.call('open', k.srv.ids.group);
  assert.equal(await k.call('photo', 'm-pat-ph'), null, 'not the open chat’s: nothing');
  assert.ok(!k.srv.calls.some((c) => /photo\//.test(c.url)), 'and not fetched');
  const chat = await k.call('open', k.srv.ids.pat);
  const m = chat.msgs.find((x) => x.id === 'm-pat-ph');
  assert.deepEqual(m.media, { ref: 'm-pat-ph', kind: 'photo' }); assert.equal(m.kind, 'photo');
  const b = await k.call('photo', m.media.ref);
  assert.ok(b instanceof Blob); assert.equal(b.type, 'image/jpeg');
  assert.deepEqual(new Uint8Array(await b.arrayBuffer()), k.srv.photoBytes);
  await k.call('lock', true);
  assert.equal(await k.call('photo', 'm-pat-ph'), null, 'locked: nothing');
});

test('a phone with no pins yet opens nothing from a kept copy before the server’s pins have answered (B3)', async () => {
  const srv = await makeWorld(), db = fakeIDB();
  db.data.set('session', { token: 'tok-SECRET-1234', me: { id: srv.ids.me, name: 'Sam Taylor', handle: 'sam', pub: srv.me.pub }, priv: srv.me.priv, pub: srv.me.pub });
  db.data.set('cache:' + srv.ids.me, { v: 1, at: T, sync: srv.syncBody(), skies: null, chats: [] });
  srv.pinsDelay = 40;
  const k = await boot({ srv, db });
  await k.call('start', { locked: false });
  assert.ok(!db.writes.some(([op, key]) => op === 'get' && /^cache:/.test(key)), 'the kept copy isn’t read without pins here');
  const iPins = srv.calls.findIndex((c) => /pins$/.test(c.url)), iSync = srv.calls.findIndex((c) => /sync/.test(c.url));
  assert.ok(iPins >= 0 && iPins < iSync, 'the server’s pins first');
});
