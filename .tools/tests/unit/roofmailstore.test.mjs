// Mail's state, actions and sending under the roof (One roof stage 4, s4/spec §4.2, S4-D16, S4-D18, C9, C10, §10.1):
// the inflite repo's email/public/roof/store.js, actions.js and outbox.js driven with a fake API and a fake fw, no DOM.
//   store: frozen snapshots; each changed key emitted once per microtask, then "*"; unknown keys left out.
//   actions: optimistic (a row that leaves the list goes at once, logic.inView), every action through api.batch, Undo as
//     the inverse, the rows put back where they were on an error; the list asked for by GET, a search by POST.
//   outbox: save then send (POST /api/drafts, then after 6 s POST /api/send { draftId, key }), the toast closed by its
//     handle as the send starts; Undo before then keeps the draft and opens compose, after it "Already sent"; Try Again
//     asks /api/sends first; offline a message without files is kept text only in mail:outbox and sent on the way back,
//     one with files refused; the 256 KB cap and a QuotaExceededError say so; flush saves what's left as server drafts.
// Skips with mailSkip's reason where the inflite repo beside has no Mail module.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import * as fx from './fixtures/roof.mjs';

const IFL = fx.IFL, MOD = IFL && new URL('email/public/roof/', IFL);
const skip = fx.mailSkip ?? (!IFL ? 'the inflite repo isn’t beside this one'
  : !existsSync(new URL('mail.js', MOD)) ? 'the inflite repo beside has no Mail module yet (email/public/roof/mail.js): its live branch, while this repo goes live first'
  : false);

// ---- the browser bits: storage (with a quota to run out of), being online
const mem = new Map();
let quota = Infinity;
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { if (String(v).length > quota) throw Object.assign(new Error('full'), { name: 'QuotaExceededError' }); mem.set(k, String(v)); },
  removeItem: (k) => mem.delete(k), clear: () => mem.clear(), key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
};
let online = true;
if (!globalThis.navigator) globalThis.navigator = {};
Object.defineProperty(globalThis.navigator, 'onLine', { get: () => online, configurable: true });

const S = skip ? null : await import(new URL('store.js', MOD));
const logic = skip ? null : await import(new URL('logic.js', MOD));
const { createActions } = skip ? {} : await import(new URL('actions.js', MOD));
const O = skip ? null : await import(new URL('outbox.js', MOD));
const flushMicro = async (n = 8) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
const settle = () => new Promise((ok) => setImmediate(ok));

function fakeFw() {
  const toasts = [], closed = [], subs = {};
  return {
    toasts, closed, changed: 0,
    toast(text, o) { const t = { text, o }; toasts.push(t); return { close: () => closed.push(text) }; },
    on(ev, fn) { (subs[ev] ||= []).push(fn); return () => {}; },
    emit(ev) { for (const f of subs[ev] || []) f(); },
    changed() { this.changed++; },
  };
}
const ROWS = () => [
  { id: 't1', subject: 'One', category: 'people', unread: 1, date: 5, done: false, snoozeUntil: null, trashed: false, starred: false },
  { id: 't2', subject: 'Two', category: 'people', unread: 0, date: 4, done: false, snoozeUntil: null, trashed: false, starred: false },
  { id: 't3', subject: 'Three', category: 'people', unread: 0, date: 3, done: false, snoozeUntil: null, trashed: false, starred: false },
];
function setup({ fail = false } = {}) {
  const fw = fakeFw(), calls = [];
  const api = {
    calls,
    async batch(body) { calls.push(['batch', body]); if (fail) throw Object.assign(new Error('Couldn’t reach Mail.'), { status: 500 }); return { ok: true }; },
    async counts() { calls.push(['counts']); return { people: { unread: 1 }, updates: { unread: 2 }, snoozed: 0, trash: 0, drafts: 0, flagged: 0, addresses: [] }; },
    async threads(a) { calls.push(['threads', a]); return { threads: ROWS(), drafts: [{ id: 'd1', subject: 'Draft' }], hasMore: false }; },
    async search(a) { calls.push(['search', a]); return { threads: [ROWS()[1]], hasMore: false }; },
  };
  const store = S.createStore({ access: 'ok', list: { rows: ROWS(), more: false, loading: false, err: null } });
  const ctx = { store, api, logic, fw, open: { compose: (init) => calls.push(['compose', init]) } };
  ctx.actions = createActions(ctx);
  return { fw, api, calls, store, ctx };
}

test('store: frozen snapshots, each changed key once per microtask then "*", unknown keys left out', { skip }, async () => {
  const st = S.createStore({ lens: 'updates' });
  assert.ok(Object.isFrozen(st.get()) && Object.isFrozen(st.get().list), 'frozen, the nested ones too');
  assert.equal(st.get().lens, 'updates');
  const seen = [];
  st.on('lens', (s, why) => seen.push(['lens', s.lens, why]));
  st.on('query', (s) => seen.push(['query', s.query]));
  st.on('*', () => seen.push(['*']));
  const before = st.get();
  st.set({ lens: 'later' }, 'a');
  st.set({ lens: 'done', query: 'x' }, 'b');
  st.set({ nope: 1 });
  st.set({ filter: 'all' });
  assert.equal(before.lens, 'updates', 'an old snapshot never changes');
  assert.equal(st.get().lens, 'done');
  assert.ok(!('nope' in st.get()), 'a key that isn’t one of KEYS is left out');
  assert.deepEqual(seen, [], 'nothing before the microtask');
  await flushMicro();
  assert.deepEqual(seen, [['lens', 'done', 'b'], ['query', 'x'], ['*']], 'each key once, with the latest snapshot, then "*"');
  st.set({ lens: 'done' });
  await flushMicro();
  assert.equal(seen.length, 3, 'the same value is no change');
  assert.deepEqual(Object.keys(S.initial()).sort(), [...S.KEYS].sort());
});

test('store: local.put keeps every mail:* key together under the 256 KB cap', { skip }, () => {
  mem.clear();
  assert.equal(S.local.put(S.STORAGE.lens, 'later'), true);
  assert.equal(S.local.get(S.STORAGE.lens), 'later');
  mem.set('mail:replies', 'x'.repeat(S.CAP - 100));
  assert.throws(() => S.local.put(S.STORAGE.unsent, { text: 'y'.repeat(200) }), { name: 'QuotaExceededError' });
  mem.set('other:key', 'z'.repeat(S.CAP));
  mem.delete('mail:replies');
  assert.equal(S.local.put(S.STORAGE.unsent, { text: 'ok' }), true, 'only mail:* keys count');
  mem.clear();
});

test('actions: Done moves the row out at once, through api.batch, with Undo as the inverse', { skip }, async () => {
  const { fw, calls, store, ctx } = setup();
  const p = ctx.actions.act(['t2'], 'done');
  assert.deepEqual(store.get().list.rows.map((r) => r.id), ['t1', 't3'], 'gone from People at once');
  await p;
  assert.deepEqual(calls.find((c) => c[0] === 'batch')[1], { ids: ['t2'], action: 'done' });
  const t = fw.toasts.at(-1);
  assert.equal(t.text, 'Done');
  assert.equal(t.o.action.label, 'Undo');
  t.o.action.run();
  await settle();
  assert.deepEqual(calls.filter((c) => c[0] === 'batch').at(-1)[1], { ids: ['t2'], action: 'inbox' }, 'Undo sends the inverse');
  assert.ok(calls.some((c) => c[0] === 'threads'), 'and the list is asked for again to bring it back');
  // (Later: the time in the toast; its Undo puts it back where it was, Done if it was done)
  const s2 = setup();
  await s2.ctx.actions.act(['t1'], 'snooze', { until: Date.now() + 3600e3 });
  assert.match(s2.fw.toasts.at(-1).text, /^Later: /);
  assert.deepEqual(s2.calls.find((c) => c[0] === 'batch')[1].action, 'snooze');
  // (Read in People keeps the row; Flag changes it in place)
  const s3 = setup();
  await s3.ctx.actions.act(['t1'], 'read', { undo: false });
  assert.equal(s3.store.get().list.rows.find((r) => r.id === 't1').unread, 0);
  await s3.ctx.actions.act(['t3'], 'flag');
  assert.equal(s3.store.get().list.rows.find((r) => r.id === 't3').starred, true);
  assert.ok(s3.calls.filter((c) => c[0] === 'batch').every((c) => Array.isArray(c[1].ids)), 'single-thread actions go through batch too');
});

test('actions: on an error the rows are put back where they were, and it says so', { skip }, async () => {
  const { fw, store, ctx } = setup({ fail: true });
  const r = await ctx.actions.act(['t2'], 'trash');
  assert.equal(r.ok, false);
  assert.deepEqual(store.get().list.rows.map((x) => x.id), ['t1', 't2', 't3'], 'back in its place');
  assert.equal(store.get().list.rows[1].trashed, false);
  assert.equal(fw.toasts.at(-1).text, 'Couldn’t reach Mail.');
});

test('actions: the list by GET, a search by POST (never a query in a URL), Drafts from the drafts', { skip }, async () => {
  const { calls, store, ctx } = setup();
  store.set({ lens: 'updates', filter: 'unread' });
  await ctx.actions.load();
  assert.deepEqual(calls.at(-1), ['threads', { view: 'unread', category: 'updates', address: null, before: undefined }]);
  assert.ok(!('q' in calls.at(-1)[1]), 'no q in a GET');
  store.set({ query: 'lisbon' });
  await ctx.actions.load();
  assert.equal(calls.at(-1)[0], 'search');
  assert.equal(calls.at(-1)[1].q, 'lisbon');
  assert.deepEqual(store.get().list.rows.map((x) => x.id), ['t2']);
  store.set({ query: '', box: 'drafts' });
  await ctx.actions.load();
  assert.deepEqual(store.get().list.rows.map((x) => [x.id, x.draft]), [['d1', true]]);
  await ctx.actions.counts();
  assert.deepEqual([store.get().counts.people, store.get().counts.updates], [1, 2]);
});

// ---- the outbox
function outboxSetup({ saveFails = false, sendFails = null, went = [] } = {}) {
  const fw = fakeFw(), calls = [];
  let n = 0;
  const api = {
    async saveDraft(d, onProgress, opts) { calls.push(['save', d, opts]); if (saveFails) throw Object.assign(new Error('Couldn’t reach Mail.'), { status: 0 }); onProgress?.(1); return { id: `dr${++n}` }; },
    async sendDraft(id, key, opts) { calls.push(['send', id, key, opts]); if (sendFails !== null) throw Object.assign(new Error('Not sent'), { status: sendFails }); return { id: 'm1' }; },
    async sent(keys) { calls.push(['sent', keys]); return { sent: went.length ? keys : [] }; },
  };
  const store = S.createStore({ access: 'ok' });
  const ctx = { store, api, logic, fw, actions: { counts() {}, load() {} }, open: { compose: (init) => calls.push(['compose', init]) } };
  return { fw, calls, store, ctx, ob: O.createOutbox(ctx) };
}
const DRAFT = { from: 'hello@inflite.ai', to: [{ email: 'leo@x.com' }], cc: [], bcc: [], subject: 'Re: Dinner', text: 'Yes!', quote: { of: 'm-1', mode: 'reply' }, inReplyTo: '<m1@x>' };

test('outbox: save, then “Sending… · Undo” for 6 s, then POST /api/send { draftId, key }, the toast closed by its handle', { skip }, async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  mem.clear(); online = true;
  const { fw, calls, store, ob } = outboxSetup();
  const file = new Blob(['hello'], { type: 'text/plain' });
  file.name = 'a.txt';
  const r = await ob.send(DRAFT, [{ ref: 'att-1', filename: 'menu.pdf' }, file]);
  assert.equal(r.ok, true);
  const save = calls.find((c) => c[0] === 'save')[1];
  assert.deepEqual(save.quote, { of: 'm-1', mode: 'reply' }, 'the quote as { of, mode }: Mail’s server builds it');
  assert.deepEqual(save.attachments[0], { ref: 'att-1' }, 'a forwarded file by ref');
  assert.equal(save.attachments[1].content, Buffer.from('hello').toString('base64'), 'a picked file uploaded');
  assert.equal(fw.toasts.at(-1).text, 'Sending…');
  assert.equal(fw.toasts.at(-1).o.action.label, 'Undo');
  assert.equal(store.get().sending, 1, 'busy while it waits');
  assert.ok(!calls.some((c) => c[0] === 'send'), 'not before 6 s');
  t.mock.timers.tick(O.UNDO_MS - 1);
  assert.ok(!calls.some((c) => c[0] === 'send'));
  t.mock.timers.tick(1);
  await settle();
  const send = calls.find((c) => c[0] === 'send');
  assert.deepEqual(send.slice(1, 3), ['dr1', r.key], 'sends the saved draft with its key');
  assert.deepEqual(fw.closed, ['Sending…'], 'the toast closed the moment the send starts');
  assert.equal(fw.toasts.at(-1).text, 'Message Sent');
  assert.equal(store.get().sending, 0);
  // (Undo after that: too late)
  fw.toasts.length = 0;
  ob.undo(r.key);
  assert.equal(fw.toasts.at(-1).text, 'Already sent');
  ob.destroy();
});

test('outbox: Undo before the send keeps the draft and opens it again in compose', { skip }, async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  mem.clear(); online = true;
  const { fw, calls, store, ob } = outboxSetup();
  const r = await ob.send(DRAFT, []);
  t.mock.timers.tick(3000);
  fw.toasts.at(-1).o.action.run();
  t.mock.timers.tick(10000);
  await settle();
  assert.ok(!calls.some((c) => c[0] === 'send'), 'never sent');
  const reopened = calls.find((c) => c[0] === 'compose')[1];
  assert.equal(reopened.draftId, 'dr1', 'the saved draft, to change');
  assert.equal(reopened.text, 'Yes!');
  assert.deepEqual(store.get().outbox, []);
  assert.equal(ob.undo(r.key), false);
  ob.destroy();
});

test('outbox: no answer → Try Again asks /api/sends first; Mail refusing it → “It’s in Drafts”', { skip }, async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  mem.clear(); online = true;
  const a = outboxSetup({ sendFails: 0, went: ['x'] });
  const r = await a.ob.send(DRAFT, []);
  t.mock.timers.tick(O.UNDO_MS);
  await settle();
  assert.equal(a.store.get().outbox[0].state, 'failed');
  assert.equal(a.fw.toasts.at(-1).o.action.label, 'Try Again');
  await a.ob.retry(r.key);
  assert.deepEqual(a.calls.find((c) => c[0] === 'sent')[1], [r.key], '“Did it go?” by its key');
  assert.equal(a.calls.filter((c) => c[0] === 'send').length, 1, 'it went: not sent twice');
  assert.deepEqual(a.store.get().outbox, []);
  a.ob.destroy();
  const b = outboxSetup({ sendFails: 400 });
  await b.ob.send(DRAFT, []);
  t.mock.timers.tick(O.UNDO_MS);
  await settle();
  assert.equal(b.fw.toasts.at(-1).text, 'Couldn’t send. It’s in Drafts');
  assert.deepEqual(b.store.get().outbox, []);
  b.ob.destroy();
  const c = outboxSetup({ saveFails: true });
  const r2 = await c.ob.send(DRAFT, []);
  assert.equal(r2.ok, false, 'a draft that couldn’t be saved: compose stays open');
  c.ob.destroy();
});

test('outbox: offline, a message with files is refused, one without is kept text only and sent once back online', { skip }, async () => {
  mem.clear(); online = false;
  const { calls, store, ob, fw } = outboxSetup();
  const withFile = await ob.send(DRAFT, [new Blob(['x'])]);
  assert.deepEqual(withFile, { ok: false, offline: true, error: 'Files need a connection. Try Again' });
  const r = await ob.send({ ...DRAFT, files: [new Blob(['x'])] }, []);
  assert.equal(r.queued, true);
  const kept = JSON.parse(mem.get(S.STORAGE.outbox));
  assert.equal(kept.length, 1);
  assert.equal(kept[0].draft.text, 'Yes!');
  assert.ok(!JSON.stringify(kept).includes('content') && !('files' in kept[0].draft), 'never file bytes');
  assert.equal(store.get().outbox[0].state, 'queued');
  assert.ok(!calls.length, 'nothing asked of Mail offline');
  online = true;
  fw.emit('visible');
  await settle(); await settle();
  assert.deepEqual(calls.map((c) => c[0]), ['sent', 'save', 'send'], 'asked whether it went, then saved and sent, with no second undo window');
  assert.equal(mem.get(S.STORAGE.outbox), undefined, 'mail:outbox emptied');
  ob.destroy();
});

test('outbox: mail:unsent written synchronously; the 256 KB cap and a QuotaExceededError say no', { skip }, async () => {
  mem.clear(); online = false;
  const { ob } = outboxSetup();
  assert.equal(ob.keepUnsent({ ...DRAFT, files: [new Blob(['x'])] }), true);
  const u = ob.unsent();
  assert.equal(u.text, 'Yes!');
  assert.ok(!('files' in u), 'text fields only');
  ob.dropUnsent();
  assert.equal(ob.unsent(), null);
  assert.equal(ob.keepUnsent({ ...DRAFT, text: 'x'.repeat(S.CAP) }), false, 'over the cap');
  const big = await ob.send({ ...DRAFT, text: 'x'.repeat(S.CAP) }, []);
  assert.deepEqual(big, { ok: false, offline: true, error: O.FULL });
  quota = 10;
  assert.equal(ob.keepUnsent(DRAFT), false, 'the browser’s own quota');
  quota = Infinity;
  ob.destroy();
});

test('outbox: flush sends what waits out its Undo now, saves queued ones and an open compose as server drafts, and counts what it couldn’t', { skip }, async (t) => {
  mem.clear(); online = true;
  const { calls, ob } = outboxSetup();
  await ob.send(DRAFT, []);
  const off = ob.track(() => ({ ...DRAFT, subject: 'Open compose', text: 'half written' }));
  const res = await ob.flush({ keepalive: true });
  assert.deepEqual(res, { lost: 0 });
  assert.ok(calls.some((c) => c[0] === 'send' && c[3]?.keepalive), 'the waiting send went at once, keepalive');
  assert.ok(calls.some((c) => c[0] === 'save' && c[1].subject === 'Open compose' && c[2]?.keepalive), 'the open compose saved as a draft');
  off();
  ob.destroy();
  // (Mail not answering: what couldn't be saved is counted)
  online = false;
  const b = outboxSetup({ saveFails: true });
  await b.ob.send(DRAFT, []);
  online = true;
  const r = await b.ob.flush();
  assert.equal(r.lost, 1);
  b.ob.destroy();
  mem.clear();
});
