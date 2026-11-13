// Chats' service (One roof, stage 3: roof/s3/spec.md S3-D3, S3-D6, S3-D14, §5.2 S3-C3, §10.1): pigeon/roof/service.js
// run in node with a Worker stand-in (in this process: a scripted core, or the real core.js on a fake phone and a fake
// Chat server). Proves: the facade has exactly makeIFLChat's eight keys and is frozen, with no call(); sendTo without
// the page's tap is refused before anything reaches the core; a PROTOCOL that isn't ours calls onStale and nothing
// else; a Worker that died is made again on visible, calls waiting meanwhile (5 s at most, then "offline");
// inflight-lock is read before the first call and the core started locked as it says; a push is one quiet sync; a
// computer makes no Worker; and the real core's answers have the shapes of fixtures/chats.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MAIN } from './fixtures/roof.mjs';
import { WORLD, ONE, shapeOf } from './fixtures/chats.mjs';
import { E2E } from '../../../pigeon/crypto.js';
import { padPayload } from '../../../pigeon/cards.js';

const APP = readFileSync(new URL('pigeon/app.js', MAIN), 'utf8');
const SVC = readFileSync(new URL('pigeon/roof/service.js', MAIN), 'utf8');

// ---- the page's globals a service reads: navigator (its tap, its device), localStorage, Worker
globalThis.__active = false;
if (typeof globalThis.Navigator !== 'function') globalThis.Navigator = class Navigator {};
globalThis.UserActivation = class UserActivation { get isActive() { return globalThis.__active === true; } };
Object.defineProperty(globalThis.Navigator.prototype, 'userActivation', { get() { return new globalThis.UserActivation(); }, configurable: true });
const nav = Object.create(globalThis.Navigator.prototype, { userAgent: { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', writable: true }, maxTouchPoints: { value: 5, writable: true }, onLine: { value: true, writable: true } });
Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
globalThis.matchMedia = () => ({ matches: true });
const log = [];
const store = new Map();
globalThis.localStorage = { getItem: (k) => { log.push(['ls', k]); return store.has(k) ? store.get(k) : null; }, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

class FakeWorker {
  static made = [];
  static impl = null;
  constructor(url, opts) {
    this.url = String(url); this.opts = opts; this.subs = { message: [], error: [] }; this.dead = false; this.got = [];
    FakeWorker.made.push(this);
    this.handler = Promise.resolve(FakeWorker.impl(this));
  }
  addEventListener(t, f) { (this.subs[t] ||= []).push(f); }
  postMessage(m) { if (this.dead) return; const d = structuredClone(m); log.push(['post', d.m]); this.got.push(d); this.handler.then((h) => h?.(d)); }
  terminate() { this.dead = true; }
  emit(d) { if (this.dead) return; const c = structuredClone(d); setTimeout(() => { if (!this.dead) for (const f of this.subs.message) f({ data: c }); }, 0); }
}
globalThis.Worker = FakeWorker;

const tmp = [];
process.on('exit', () => { for (const d of tmp) try { rmSync(d, { recursive: true, force: true }); } catch (_) {} });
// a copy of the service and the core's graph, so each load has its own modules
async function copyGraph() {
  const d = mkdtempSync(join(tmpdir(), 'chatsvc-')); tmp.push(d);
  mkdirSync(join(d, 'roof'));
  for (const f of ['crypto.js', 'cards.js', 'digest.js', 'links.js', 'rank.js', 'argon2.js', 'argon2w.js']) copyFileSync(new URL('pigeon/' + f, MAIN), join(d, f));
  for (const f of ['core.js', 'idb.js', 'service.js']) copyFileSync(new URL('pigeon/roof/' + f, MAIN), join(d, 'roof', f));
  return d;
}
async function loadService() { const d = await copyGraph(); return import(pathToFileURL(join(d, 'roof', 'service.js')).href); }
// a scripted core: answers hello with PROTOCOL (or another), start with a state, and whatever o.answer says
const scripted = (o = {}) => (w) => (d) => {
  if (o.deaf?.(w, d)) return;
  const v = d.m === 'hello' ? { protocol: o.protocol ?? 1 } : d.m === 'start' ? { state: o.state ?? 'ready' } : o.answer ? o.answer(d) : { ok: true };
  if (v && v.__refuse) w.emit({ id: d.id, ok: false, why: v.__refuse });
  else w.emit({ id: d.id, ok: true, v });
};
function makeUI() {
  const subs = {};
  const sendCalls = [];
  const ui = {
    visible: () => true, toast() {},
    on(ev, fn) { (subs[ev] ||= new Set()).add(fn); return () => subs[ev].delete(fn); },
    lazy(f) { const s = String(f); if (s.includes('send.js')) return Promise.resolve({ openSend: (u, svc, a) => { sendCalls.push(a); return Promise.resolve({ ok: false, why: 'no' }); } }); return f(''); },
    fire(ev, x) { for (const fn of [...(subs[ev] || [])]) fn(x); },
  };
  return { ui, sendCalls, subs };
}
const settle = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const fresh = () => { FakeWorker.made = []; log.length = 0; store.clear(); globalThis.__active = false; nav.userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'; };
const PACKED = 'x'; // (a card's packed form; the scripted core's answers don't depend on it)

test('the facade: exactly makeIFLChat’s eight keys, frozen, no call (S3-D6, risk I1)', async () => {
  fresh(); FakeWorker.impl = scripted();
  const { ui } = makeUI();
  const svc = await (await loadService()).startService({ path: '/chats/', ui, onStale() {} });
  // (app.js's own IFLChat, from the hub's rules block, as engine.test runs it)
  const S = "// ==== the hub's rules (engine.test.mjs runs this block on its own", E = "// ==== end of the hub's rules ====";
  const block = APP.slice(APP.indexOf(S), APP.indexOf(E));
  const R = new Function('window', 'document', 'location', 'parent', `"use strict";\n${block}\nreturn { makeIFLChat };`)();
  const ref = R.makeIFLChat({ state: () => 'ready', share() {}, sendOne() {}, waiting() {}, since() {}, refresh() {}, signOut() {}, tapped: () => false });
  const f = svc.facade;
  assert.deepEqual(Object.keys(f).sort(), Object.keys(ref).sort());
  assert.deepEqual(Object.keys(f).sort(), ['refresh', 'reply', 'sendTo', 'share', 'signOut', 'since', 'state', 'waiting']);
  assert.ok(Object.isFrozen(f));
  assert.equal(typeof Object.getOwnPropertyDescriptor(f, 'state').get, 'function', 'state is a getter, read each time');
  assert.ok(!('call' in f) && !('on' in f), 'no call, no on: the full service is the Chats module’s only');
  assert.throws(() => { 'use strict'; f.call = () => {}; });
  assert.throws(() => { 'use strict'; f.sendTo = () => ({ ok: true }); });
  assert.equal(f.state, 'ready');
  // the Service itself: B0's frozen keys
  for (const k of ['protocol', 'state', 'call', 'on', 'facade', 'release']) assert.ok(k in svc, `Service.${k}`);
  assert.equal(svc.protocol, 1);
  assert.match(SVC, /new Worker\(new URL\("\.\/core\.js", import\.meta\.url\), \{ type: "module", name: "chats-core" \}\)/);
  assert.equal((SVC.match(/new Worker\(/g) || []).length, 1, 'one Worker, made in one place');
});

test('sendTo without the page’s tap: { ok: false, why: "tap" }, and nothing reaches the core', async () => {
  fresh();
  const seen = [];
  FakeWorker.impl = scripted({ answer: (d) => { seen.push(d.m); return d.m === 'share' ? [{ id: 'f1', can: true, keyChanged: false }] : d.m === 'sendRun' ? { ok: true, sent: ['f1'], failed: [], say: 'Sent to Pat' } : {}; } });
  const { ui, sendCalls } = makeUI();
  const svc = await (await loadService()).startService({ ui });
  const card = 'eyJ2IjoxfQ';
  assert.deepEqual(await svc.facade.sendTo('f1', 'Rain at 3', card), { ok: false, why: 'tap' });
  await settle();
  assert.deepEqual(seen, [], 'not one call');
  // a tap: a card that won't pass normCard → why card; nothing sealed
  globalThis.__active = true;
  assert.deepEqual(await svc.facade.sendTo('f1', 'Rain at 3', 'not-a-card'), { ok: false, why: 'card' });
  assert.ok(!seen.includes('sendRun'));
  void sendCalls;
});

test('sendTo with a tap: one friend whose key is trusted gets it in one go; a changed key opens the sheet with them chosen', async () => {
  fresh();
  const C = await import('../../../pigeon/cards.js');
  const packed = C.packCard(C.normCard({ v: 1, kind: 'weather', from: 'weather', say: 'Rain at 3', at: Date.now(), snap: { place: 'London' } }));
  const seen = [];
  FakeWorker.impl = scripted({ answer: (d) => { seen.push(d); return d.m === 'share' ? [{ id: 'f1', can: true, keyChanged: false }, { id: 'f2', can: false, keyChanged: true }] : d.m === 'sendRun' ? { ok: true, sent: ['f1'], failed: [], say: 'Sent to Pat' } : {}; } });
  const { ui, sendCalls } = makeUI();
  const svc = await (await loadService()).startService({ ui });
  globalThis.__active = true;
  assert.deepEqual(await svc.facade.sendTo('f1', 'Rain at 3', packed), { ok: true, say: 'Sent to Pat' });
  const run = seen.find((d) => d.m === 'sendRun');
  assert.deepEqual(run.a[0].pick, ['f1']); assert.equal(run.a[0].when, 'now'); assert.equal(run.a[0].card.kind, 'weather');
  const n = seen.filter((d) => d.m === 'sendRun').length;
  await svc.facade.sendTo('f2', 'Rain at 3', packed);
  assert.equal(seen.filter((d) => d.m === 'sendRun').length, n, 'no one-tap send to a changed key');
  assert.equal(sendCalls.at(-1).to, 'f2', 'the sheet, with them chosen');
  // share, not ready: false (a card's Send then navigates to /chats/#share=)
  fresh(); FakeWorker.impl = scripted({ state: 'key' });
  const s2 = await (await loadService()).startService({ ui });
  assert.equal(await s2.facade.share('Rain', packed), false);
  assert.equal(s2.facade.state, 'key');
});

test('a PROTOCOL that isn’t ours: onStale, and no other call is ever made', async () => {
  fresh(); FakeWorker.impl = scripted({ protocol: 2 });
  const { ui } = makeUI();
  let stale = 0;
  const svc = await (await loadService()).startService({ ui, onStale: () => stale++ });
  assert.equal(stale, 1);
  await assert.rejects(svc.call('sync', {}), (e) => e.why === 'no');
  assert.deepEqual(await svc.facade.waiting({ ids: [] }), []);
  ui.fire('push', { app: 'chats', tag: 'msg-x' }); ui.fire('visible'); await settle(50);
  assert.deepEqual(FakeWorker.made[0].got.map((d) => d.m), ['hello'], 'only hello');
  assert.ok(FakeWorker.made[0].dead, 'and the stale core ended');
  assert.equal(FakeWorker.made.length, 1, 'and no Worker made again');
});

test('inflight-lock is read before the first call, and the core is started locked as it says (S3-D14, risk B4)', async () => {
  fresh();
  store.set('inflight-lock', JSON.stringify({ on: true, uid: 'u-me-1', after: 0 }));
  FakeWorker.impl = scripted({ state: 'locked' });
  const { ui } = makeUI();
  const svc = await (await loadService()).startService({ ui });
  const iLock = log.findIndex((x) => x[0] === 'ls' && x[1] === 'inflight-lock'), iPost = log.findIndex((x) => x[0] === 'post');
  assert.ok(iLock >= 0 && iLock < iPost, `read before the first call: ${JSON.stringify(log)}`);
  const start = FakeWorker.made[0].got.find((d) => d.m === 'start');
  assert.deepEqual(start.a[0], { visible: true, locked: true, screen: false, lockUid: 'u-me-1' });
  assert.equal(svc.facade.state, 'locked');
  // nothing kept: locked false
  fresh(); FakeWorker.impl = scripted();
  await (await loadService()).startService({ ui: makeUI().ui });
  assert.equal(FakeWorker.made[0].got.find((d) => d.m === 'start').a[0].locked, false);
  assert.ok(!store.size, 'and the service writes nothing there');
});

test('the facade hands the core what the engine took: ids that can be ids, a stock’s symbol and name, never an amount', async () => {
  fresh();
  const got = [];
  FakeWorker.impl = scripted({ answer: (d) => { got.push(d); return []; } });
  const svc = await (await loadService()).startService({ ui: makeUI().ui });
  await svc.facade.waiting({ ids: ['f1', 'f1', '../x', 7, 'f2'], stocks: [{ sym: 'TSCO', name: 'Tesco', pct: 1.2, value: 1234.5, qty: 10 }, { pct: 3 }] });
  const w = got.find((d) => d.m === 'waiting');
  assert.deepEqual(w.a, [{ ids: ['f1', 'f2'], stocks: [{ sym: 'TSCO', name: 'Tesco' }] }]);
  await svc.facade.waiting();
  assert.deepEqual(got.filter((d) => d.m === 'waiting').at(-1).a, [{}]);
});

test('a push is one quiet sync; visible and hidden reach the core as start({ visible })', async () => {
  fresh(); FakeWorker.impl = scripted();
  const { ui } = makeUI();
  await (await loadService()).startService({ ui });
  ui.fire('push', { app: 'chats', tag: 'msg-x' }); await settle();
  const w = FakeWorker.made[0], syncs = w.got.filter((d) => d.m === 'sync');
  assert.deepEqual(syncs.map((d) => d.a), [[{ quiet: true }]]);
  ui.fire('hidden'); await settle();
  assert.deepEqual(w.got.filter((d) => d.m === 'start').at(-1).a, [{ visible: false }]);
});

test('a Worker that died is made again on visible; calls wait for it, and give up after 5 s with why "offline" (risk 6)', async () => {
  fresh();
  let deaf = false;
  FakeWorker.impl = scripted({ deaf: (w) => deaf && w === FakeWorker.made[0], answer: (d) => (d.m === 'waiting' ? [{ id: 'f1' }] : {}) });
  const { ui } = makeUI();
  const svc = await (await loadService()).startService({ ui });
  await svc.call('start', { visible: true, screen: true });
  deaf = true;                                   // (iOS ended it while hidden: it never answers again)
  ui.fire('visible');
  await settle(1600);                            // (the ping waits 1.5 s)
  assert.equal(FakeWorker.made.length, 2, 'made again');
  assert.ok(FakeWorker.made[0].dead, 'the old one terminated');
  const again = FakeWorker.made[1].got;
  assert.deepEqual(again.slice(0, 2).map((d) => d.m), ['hello', 'start'], 'hello first, then start');
  assert.equal(again[1].a[0].screen, true, 'started as before: on screen');
  assert.deepEqual(await svc.call('waiting', {}), [{ id: 'f1' }], 'and calls answer again');
  // a new one that never answers: a call waits 5 s, then offline
  fresh();
  let mute = false;
  FakeWorker.impl = scripted({ deaf: (w) => mute && w !== FakeWorker.made[0] });
  const { ui: ui2 } = makeUI();
  const s2 = await (await loadService()).startService({ ui: ui2 });
  mute = true;
  FakeWorker.made[0].subs.error.forEach((f) => f({}));     // (the Worker's error event: it's dead)
  ui2.fire('visible'); await settle();
  const t0 = Date.now();
  await assert.rejects(s2.call('sync', {}), (e) => e.why === 'offline');
  const took = Date.now() - t0;
  assert.ok(took >= 4900 && took < 7000, `5 s: ${took} ms`);
});

test('a computer: no Worker, ever; the facade says device (S3-D13)', async () => {
  fresh(); nav.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'; nav.maxTouchPoints = 0;
  FakeWorker.impl = scripted();
  const svc = await (await loadService()).startService({ ui: makeUI().ui });
  assert.equal(FakeWorker.made.length, 0);
  assert.equal(svc.facade.state, 'device'); assert.equal(svc.state, 'device');
  await assert.rejects(svc.call('sync', {}), (e) => e.why === 'device');
  assert.deepEqual(await svc.facade.waiting({}), []);
  nav.maxTouchPoints = 5;
});

test('trusted OS desktop activation owns one service Worker and retains the standalone desktop gate', async () => {
  fresh(); nav.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'; nav.maxTouchPoints = 0;
  FakeWorker.impl = scripted();
  const { ui, subs } = makeUI(), ac = new AbortController();
  const svc = await (await loadService()).startService({ ui, signal: ac.signal });
  assert.equal(svc.state, 'device'); assert.equal(FakeWorker.made.length, 0);
  ui.fire('visible'); await settle(); assert.equal(FakeWorker.made.length, 0, 'ordinary desktop visible never starts a worker');
  ui.workspace = { enabled: true };
  const same = svc.facade;
  const answers = await Promise.all([svc.call('start', { screen: true }), svc.call('state')]);
  assert.equal(FakeWorker.made.length, 1); assert.equal(svc.state, 'ready'); assert.equal(svc.facade, same);
  assert.equal(answers[0].state, 'ready');
  ac.abort(); assert.ok(FakeWorker.made[0].dead);
  assert.ok(Object.values(subs).every((s) => s.size === 0));
  await assert.rejects(svc.call('state'), (e) => e.why === 'no');
  nav.maxTouchPoints = 5;
});

test('an OS desktop service starts immediately when its trusted capability was assigned before mounting', async () => {
  fresh(); nav.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'; nav.maxTouchPoints = 0;
  FakeWorker.impl = scripted({ state: 'key' });
  const { ui } = makeUI(); ui.workspace = { enabled: true };
  const svc = await (await loadService()).startService({ ui });
  assert.equal(FakeWorker.made.length, 1); assert.equal(svc.state, 'key', 'OS still requires the account encryption key');
  svc.release({ terminate: true }); nav.maxTouchPoints = 5;
});

test('hidden desktop OS activation never bootstraps a Worker and visible resumes the same service', async () => {
  fresh(); nav.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'; nav.maxTouchPoints = 0;
  FakeWorker.impl = scripted();
  const { ui } = makeUI(), ac = new AbortController();
  const svc = await (await loadService()).startService({ ui, signal: ac.signal });
  try {
    const facade = svc.facade;
    assert.equal(svc.state, 'device'); assert.equal(FakeWorker.made.length, 0);
    ui.workspace = { enabled: true };
    ui.fire('hidden'); await settle();
    assert.equal(FakeWorker.made.length, 0, 'pagehide cannot construct a Worker in an inactive document');
    assert.equal(svc.state, 'device');
    ui.fire('visible'); await settle();
    assert.equal(FakeWorker.made.length, 1, 'visible retains late OS startup');
    assert.equal(svc.state, 'ready'); assert.equal(svc.facade, facade);
    const worker = FakeWorker.made[0];
    ui.fire('hidden'); await settle();
    assert.equal(FakeWorker.made.length, 1, 'hiding an active service reuses its Worker');
    assert.deepEqual(worker.got.at(-1), { id: worker.got.at(-1).id, m: 'start', a: [{ visible: false }] });
  } finally { ac.abort(); nav.maxTouchPoints = 5; }
});

test('late OS desktop activation retains the bounded restart wait when its Worker never answers', async () => {
  fresh(); nav.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
  FakeWorker.impl = scripted({ deaf: () => true });
  const { ui } = makeUI(), ac = new AbortController();
  const svc = await (await loadService()).startService({ ui, signal: ac.signal });
  try {
    ui.workspace = { enabled: true };
    const at = Date.now();
    await assert.rejects(svc.call('state'), e => e.why === 'offline');
    assert.ok(Date.now() - at < 6500, 'late OS startup uses the existing five-second restart bound');
    assert.equal(FakeWorker.made.length, 1);
  } finally { ac.abort(); }
});

test('release({ terminate }): the Worker ended, every listener dropped, calls refused', async () => {
  fresh(); FakeWorker.impl = scripted({ deaf: (w, d) => d.m === 'waiting' });
  const { ui, subs } = makeUI();
  const svc = await (await loadService()).startService({ ui });
  let n = 0; svc.on('*', () => n++);
  const pending = svc.call('waiting', {});
  svc.release({ terminate: true });
  await assert.rejects(pending, (e) => e.why === 'no');
  assert.ok(FakeWorker.made[0].dead);
  await assert.rejects(svc.call('state'), (e) => e.why === 'no');
  assert.ok(Object.values(subs).every((s) => s.size === 0), 'its ui listeners let go of');
});

// ---------------------------------------------------------------- the real core, behind the service ----
function fakeIDB() {
  const data = new Map();
  return { data, indexedDB: { open() { const req = {}; setTimeout(() => { req.result = { transaction() { const tx = {}; const os = { get: (k) => ({ result: data.has(k) ? structuredClone(data.get(k)) : undefined }), put: (v, k) => { data.set(k, structuredClone(v)); return {}; }, delete: (k) => { data.delete(k); return {}; } }; tx.objectStore = () => os; setTimeout(() => tx.oncomplete?.(), 0); return tx; }, createObjectStore() {}, close() {} }; req.onupgradeneeded?.(); req.onsuccess?.(); }, 0); return req; } } };
}
async function world() {
  const id = async () => { const { privJwk, pub } = await E2E.newIdentity(); return { priv: await E2E.importPriv(privJwk), pub }; };
  const me = await id(), pat = await id(), ali = await id();
  const ids = { me: 'u-me-0000-0001', pat: 'u-pat-000-00a1', ali: 'u-ali-000-00a2', group: 'g-ride-00-00b1' }, T = Date.now();
  const m1 = { id: 'm-pat-1', from: ids.pat, to: ids.me, sentAt: T - 600e3, deliverAt: T - 500e3, instant: true, readAt: null,
    ct: await E2E.seal(await E2E.pair(pat.priv, me.pub), { id: 'm-pat-1', from: ids.pat, to: ids.me, type: 'msg' }, padPayload({ t: 'See you at the café' })) };
  const m2 = { id: 'm-pat-2', from: ids.me, to: ids.pat, sentAt: T - 900e3, deliverAt: T - 800e3, flying: false, pigeon: 'swift', readAt: T - 700e3,
    ct: await E2E.seal(await E2E.pair(me.priv, pat.pub), { id: 'm-pat-2', from: ids.me, to: ids.pat, type: 'msg' }, padPayload({ t: 'Yes, 9 sharp' })) };
  const g = await E2E.sealGroup({ id: 'm-g-1', from: ids.pat, group: ids.group, type: 'msg' }, padPayload({ t: '9 sharp' }));
  const gm = { id: 'm-g-1', from: ids.pat, sentAt: T - 700e3, deliverAt: T - 700e3, instant: true, body: g.body, key: await E2E.seal(await E2E.pair(pat.priv, me.pub), { id: 'm-g-1', from: ids.pat, to: ids.me, type: 'wrap' }, { k: g.key, h: g.h }) };
  const air = { id: 'm-air-1', from: ids.me, to: ids.ali, sentAt: T - 60e3, deliverAt: T + 600e3, flying: true, pigeon: 'standard', ct: 'sealed' };
  const json = (v) => new Response(JSON.stringify(v), { headers: { 'Content-Type': 'application/json' } });
  const sync = () => ({ now: Date.now(), me: { id: ids.me, name: 'Sam Taylor', handle: 'sam', pub: me.pub, pigeons: true, newChats: 'pigeon', place: 'London', avatarAt: 3 },
    friends: [{ id: ids.pat, name: 'Pat Jones', handle: 'pat', pub: pat.pub, seenAt: Date.now() - 60e3, unread: 1, last: m1, place: 'Leeds', avatarAt: 1 },
      { id: ids.ali, name: 'Ali Khan', handle: 'ali', pub: ali.pub, seenAt: null, unread: 0, last: air }],
    groups: [{ id: ids.group, name: 'Saturday Ride', members: [{ id: ids.me, name: 'Sam Taylor', pub: me.pub }, { id: ids.pat, name: 'Pat Jones', pub: pat.pub }, { id: ids.ali, name: 'Ali Khan', pub: ali.pub }], last: gm }],
    incoming: [{ id: 'u-rob-000-00c1', name: 'Robin Lee', handle: 'robin', at: T - 3600e3 }], outgoing: [] });
  const fetch = async (url) => {
    const p = String(url).replace('/api/pigeon/', '');
    if (p === 'pins') return json({ pins: null });
    if (/^sync/.test(p)) return json(sync());
    if (p.startsWith('messages?with=')) return json({ now: Date.now(), messages: p.includes(ids.pat) ? [m2, m1] : [air] });
    if (p.startsWith('group-messages?id=')) return json({ now: Date.now(), messages: [gm] });
    if (p === 'pulse') return new Response('', { status: 404 });
    return json({ ok: true });
  };
  return { me, ids, fetch };
}
// does the real value have every key the fixture's has, each of the same type? (optional ones may be missing)
const OPTIONAL = new Set(['line', 'place', 'mine', 'replyTo', 'card', 'media', 'expires', 'postmark', 'text', 'flight', 'secs', 'why', 'say']);
function covers(real, fix, path = '$', out = []) {
  if (Array.isArray(fix)) { if (!Array.isArray(real)) out.push(`${path}: not an array`); else if (fix.length && real.length) covers(real[0], fix[0], path + '[0]', out); return out; }
  if (fix && typeof fix === 'object') {
    if (!real || typeof real !== 'object' || Array.isArray(real)) { out.push(`${path}: not an object`); return out; }
    for (const k of Object.keys(fix)) {
      if (!(k in real)) { if (!OPTIONAL.has(k)) out.push(`${path}.${k}: missing`); continue; }
      covers(real[k], fix[k], `${path}.${k}`, out);
    }
    return out;
  }
  if (fix !== real && fix !== 'null' && real !== 'null') out.push(`${path}: ${real} where the fixture has ${fix}`);
  return out;
}
test('the real core, behind the service: its answers and patches have fixtures/chats.mjs’s shapes', async () => {
  fresh();
  const w = await world(), db = fakeIDB();
  db.data.set('session', { token: 'tok-SECRET', me: { id: w.ids.me, name: 'Sam Taylor', handle: 'sam', pub: w.me.pub }, priv: w.me.priv, pub: w.me.pub });
  globalThis.indexedDB = db.indexedDB; globalThis.fetch = w.fetch;
  const nav2 = nav; Object.defineProperty(nav2, 'locks', { value: { request: (n, fn) => Promise.resolve().then(fn) }, configurable: true });
  // (the real core, in this process: its self is the Worker's end)
  FakeWorker.impl = async (wk) => {
    let inbox = null;
    globalThis.self = { postMessage: (m) => wk.emit(m), addEventListener: (t, f) => { if (t === 'message') inbox = f; } };
    await import(new URL(wk.url).href);
    return (d) => inbox({ data: d });
  };
  const { ui } = makeUI();
  const svc = await (await loadService()).startService({ ui });
  const seen = new Map();
  svc.on('*', ({ topic, data }) => seen.set(topic, data));
  svc.on('chat:', ({ topic, data }) => seen.set(topic, data));
  assert.equal((await svc.call('start', { locked: false, visible: true, screen: true })).state, 'ready');
  await svc.call('rows', 0, 10);
  await svc.call('sync', {});
  const chat = await svc.call('open', w.ids.pat);
  await settle(50);
  const checks = [
    ['state', { state: svc.state }, { state: 'ready' }],
    ['me', seen.get('me'), WORLD.me], ['friends', seen.get('friends'), WORLD.friends], ['groups', seen.get('groups'), WORLD.groups],
    ['requests', seen.get('requests'), WORLD.requests], ['rows', seen.get('rows'), WORLD.rows], ['air', seen.get('air'), WORLD.air],
    ['keywarn', seen.get('keywarn'), WORLD.keywarn], ['unread', seen.get('unread'), WORLD.unread], ['outbox', seen.get('outbox'), []],
    ['open → Chat', chat, ONE.Chat], ['chat:<id>', seen.get('chat:' + w.ids.pat), ONE.Chat],
    ['Msg', chat.msgs[0], ONE.Msg],
    ['safety', await svc.call('safety', w.ids.pat), ONE.Safety],
    ['waiting', await svc.call('waiting', { ids: [w.ids.pat] }), [ONE.Waiting]],
    ['since', await svc.call('since', w.ids.pat, 0), ONE.Since],
    ['search', await svc.call('search', 'café'), [ONE.SearchHit]],
    ['older', await svc.call('older', w.ids.pat, 0), ONE.Older],
  ];
  for (const [name, real, fix] of checks) {
    assert.ok(real !== undefined && real !== null, `${name}: an answer`);
    assert.deepEqual(covers(shapeOf(real), shapeOf(fix)), [], `${name}: ${JSON.stringify(real).slice(0, 160)}`);
  }
  assert.ok(seen.get('rows').some((r) => r.line === 'See you at the café'), 'the rows asked have their lines');
  assert.ok(seen.get('air').length === 1, 'the pigeon in the air');
  assert.ok(chat.msgs.some((m) => m.text === 'Yes, 9 sharp' && m.from === 'me'), 'a chat’s words, for the page that opened it');
  // facade's own answers, the same
  assert.equal(svc.facade.state, 'ready');
  const fw = await svc.facade.waiting({ ids: [w.ids.pat] });
  assert.match(fw[0].said, /café/);
  assert.equal(await svc.facade.refresh(), true);
  await svc.call('leave');
  await settle();
  assert.equal(seen.get('chat:' + w.ids.pat), null, 'leave: the chat’s topic null');
  svc.release({ terminate: true });
});
