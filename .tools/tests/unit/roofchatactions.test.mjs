import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDocument, El } from '../roofkit/fakedom.mjs';
import { ROOF, CHATS_ROOF, roofSkip, chatsSkip } from './fixtures/roof.mjs';
import { world, IDS } from './fixtures/chats.mjs';

const skip = roofSkip || chatsSkip;
const live = new Set();
after(() => { for (const v of live) v.unmount(); });
const settle = () => new Promise((r) => setTimeout(r, 30));
El.prototype.getBoundingClientRect ??= () => ({ top: 0, bottom: 20 });
if (!('scrollHeight' in El.prototype)) Object.defineProperties(El.prototype, {
  scrollHeight: { get: () => 1000 }, clientHeight: { get: () => 400 },
  scrollTop: { get() { return this._scrollTop || 0; }, set(v) { this._scrollTop = v; } },
});
async function fixture(send = async () => ({ ok: true })) {
  const document = globalThis.document = fakeDocument();
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.CSS ??= { escape: (v) => v };
  const ui = await import(new URL('ui.js', ROOF));
  const { createStore } = await import(new URL('store.js', CHATS_ROOF));
  const { view } = await import(new URL('chat.js', CHATS_ROOF));
  const W = world('ready'), store = createStore(), calls = [], menus = [];
  W.chats[IDS.pat].older = false;
  for (const t of ['friends', 'groups', 'rows']) store.apply(t, W[t]);
  const svc = { call: async (method, ...args) => {
    calls.push([method, ...args]);
    if (method === 'open') return W.chats[args[0]];
    if (method === 'sendText') return send(...args);
    return { ok: true };
  } };
  const fw = { ui, header: { set() {} }, fill() {}, tabs: { away() {} }, toast() {}, visible: () => true, on: () => () => {} };
  const host = document.createElement('div'); document.body.append(host);
  const v = view(host, { fw, svc, store, open: { hold: (target) => menus.push(target) } });
  live.add(v);
  await v.show(IDS.pat); await settle();
  const box = host.querySelector('.ch-chat'), input = host.querySelector('.ch-input');
  const tap = (n) => box.dispatch('click', { target: n });
  const bubble = () => box.querySelector('.ch-b[role=button]');
  const chooseReply = () => { tap(bubble()); const m = menus.at(-1); m.on('reply'); m.onClose(); return m; };
  return { v, box, input, tap, bubble, chooseReply, menus, calls, document, store };
}

test('message bubbles pass their complete action context and support Enter and Space without repeated activation', { skip }, async () => {
  const { v, box, bubble, tap, menus } = await fixture();
  tap(bubble());
  assert.deepEqual([menus[0].kind, menus[0].chatId, menus[0].msgId], ['msg', IDS.pat, 'm-p-1']);
  for (const key of ['Enter', ' ']) {
    const e = box.dispatch('keydown', { target: bubble(), key, repeat: false });
    assert.equal(e.defaultPrevented, true);
  }
  box.dispatch('keydown', { target: bubble(), key: ' ', repeat: true });
  assert.equal(menus.length, 3);
  v.unmount(); live.delete(v);
});

test('Reply preserves the typed draft, passes the existing replyTo contract, and cancel removes the selection', { skip }, async () => {
  const { v, box, input, chooseReply, tap, document, calls } = await fixture();
  input.value = 'A draft already here'; input.dispatch('input');
  chooseReply();
  assert.equal(input.value, 'A draft already here');
  assert.equal(document.activeElement, input, 'focus is handed to the composer after the sheet closes');
  assert.equal(box.querySelector('.ch-reply').hidden, false);
  assert.equal(box.querySelector('.ch-reply').getAttribute('aria-label'), 'Replying to Pat');
  assert.match(box.querySelector('.ch-reply-copy').textContent, /Pat.*Ride on Saturday/);
  tap(box.querySelector('[data-act=send]')); await settle();
  assert.deepEqual(calls.find(([m]) => m === 'sendText'), ['sendText', IDS.pat, 'A draft already here', { replyTo: 'm-p-1' }]);
  assert.equal(box.querySelector('.ch-reply').hidden, true);
  chooseReply(); tap(box.querySelector('[data-act=cancel-reply]'));
  assert.equal(box.querySelector('.ch-reply').hidden, true);
  v.unmount(); live.delete(v);
});

test('failed sending restores its reply only in the owning conversation and stale menus cannot select a new reply', { skip }, async () => {
  let reject;
  const { v, box, input, chooseReply } = await fixture(() => new Promise((_, r) => { reject = r; }));
  const menu = chooseReply();
  input.value = 'Old draft'; input.dispatch('input');
  box.dispatch('click', { target: box.querySelector('[data-act=send]') });
  reject({ why: 'offline' }); await settle();
  assert.equal(input.value, 'Old draft');
  assert.equal(box.querySelector('.ch-reply').hidden, false);
  box.dispatch('click', { target: box.querySelector('[data-act=send]') });
  v.hide(); await v.show(IDS.pat); await settle();
  input.value = 'New visit draft'; input.dispatch('input');
  menu.on('reply'); menu.onClose();
  reject({ why: 'offline' }); await settle();
  assert.equal(input.value, 'New visit draft');
  assert.equal(box.querySelector('.ch-reply').hidden, true, 'leave and return creates a new owner even for the same chat id');
  v.unmount(); live.delete(v);
});

test('a successful earlier send cannot clear a newer draft in the same conversation', { skip }, async () => {
  let finish;
  const { v, box, input, calls } = await fixture(() => new Promise((r) => { finish = r; }));
  input.value = 'First message'; input.dispatch('input');
  box.dispatch('click', { target: box.querySelector('[data-act=send]') });
  input.value = 'A newer draft'; input.dispatch('input');
  finish({ ok: true }); await settle();
  assert.equal(input.value, 'A newer draft');
  assert.equal(calls.filter(([m, , text]) => m === 'draft' && text === '').length, 0, 'the old send does not overwrite the newer core draft');
  v.unmount(); live.delete(v);
});
