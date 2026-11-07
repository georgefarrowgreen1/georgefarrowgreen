// Today's bell (the inflite repo's today/public/bell.js) and the root worker's log behind it (today/public/sw.js): each
// notification shown kept (id, app, title, body, url, tag, time), newest first, in the place of one with its tag, at
// most 50 and 14 days; one tapped or cleared in Notification Centre, or cleared in the bell's sheet (its notification
// closed too), out of it and never merged back; those still showing that it hasn't added; the Home Screen badge the
// unseen ones, cleared as the sheet's opened, while the rows stay. And the sheet's rows as bell.js draws them: newest
// first, data as text only, the time as "11:02" / "Yesterday", "No notifications" when there are none, a tap opening,
// Clear and Delete clearing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import { IFL, ROOF, roofSkip } from './fixtures/roof.mjs';
import { fakeDocument } from '../roofkit/fakedom.mjs';

const SW = IFL && new URL('today/public/sw.js', IFL), BELL = IFL && new URL('today/public/bell.js', IFL);
const skip = roofSkip || (!existsSync(BELL) && 'the inflite repo beside has no bell yet (today/public/bell.js)');
const ORIGIN = 'https://inflite.ai';
const plain = (x) => JSON.parse(JSON.stringify(x));

// (IndexedDB, in memory: one database, its kv store, a get and a put in a transaction that completes after them)
function fakeIDB() {
  const data = new Map();
  let made = false;
  const db = {
    createObjectStore() { made = true; },
    transaction() {
      const tx = {};
      tx.objectStore = () => ({
        get(k) { const q = {}; setTimeout(() => { q.result = data.has(k) ? structuredClone(data.get(k)) : undefined; q.onsuccess?.(); setTimeout(() => tx.oncomplete?.()); }); return q; },
        put(v, k) { data.set(k, structuredClone(v)); },
      });
      tx.abort = () => setTimeout(() => tx.onabort?.());
      return tx;
    },
  };
  return { data, indexedDB: { open() { const r = { result: db }; setTimeout(() => { if (!made) r.onupgradeneeded?.(); r.onsuccess?.(); }); return r; } } };
}

// (the worker, with Notification Centre (a notification with a tag takes the place of one with it), a window of the
// site's, the badge, and IndexedDB)
function worker() {
  const on = {}, centre = [], badges = [], win = { url: `${ORIGIN}/`, frameType: 'top-level', focused: true, visibilityState: 'visible', messages: [],
    focus() { return Promise.resolve(this); }, postMessage(m, ports = []) { this.messages.push(m); if (m?.ifl === 'route') ports[0]?.postMessage({ ifl: 'routed' }); }, navigate: async () => win };
  let clock = Date.parse('2026-11-07T11:02:00Z');
  const idb = fakeIDB();
  const self = {
    location: { origin: ORIGIN }, addEventListener: (k, f) => (on[k] = f), skipWaiting: () => {},
    navigator: { setAppBadge: async (n) => badges.push(n), clearAppBadge: async () => badges.push(0) },
    clients: { claim: async () => {}, matchAll: async () => [win], openWindow: async () => win },
    registration: {
      showNotification: async (title, o) => {
        const n = { title, body: o.body, tag: o.tag || '', data: o.data, timestamp: clock, close() { const i = centre.indexOf(n); if (i >= 0) centre.splice(i, 1); } };
        const i = n.tag ? centre.findIndex((x) => x.tag === n.tag) : -1;
        if (i >= 0) centre.splice(i, 1, n); else centre.push(n);
      },
      getNotifications: async () => [...centre],
    },
  };
  const caches = { open: async () => ({ match: async () => undefined, put: async () => {}, add: async () => {} }), keys: async () => [], delete: async () => true };
  const fetch = async () => Response.json({ ready: true, apps: {} });
  const D = class extends Date { constructor(...a) { if (a.length) super(...a); else super(clock); } static now() { return clock; } };
  const ctx = { self, caches, fetch, indexedDB: idb.indexedDB, setTimeout, clearTimeout, URL, URLSearchParams, Response, Request, Promise, JSON, atob, Uint8Array, Date: D, MessageChannel };
  vm.runInNewContext(readFileSync(SW, 'utf8'), ctx);
  const send = async (k, x) => { const waits = []; on[k]({ ...x, waitUntil: (p) => waits.push(p) }); await Promise.all(waits); };
  const push = (d) => send('push', { data: { json: () => d, text: () => JSON.stringify(d) } });
  // (a page's ask, answered on its port)
  const ask = async (data) => { let got = null; await send('message', { data, source: { url: `${ORIGIN}/` }, ports: [{ postMessage: (m) => (got = plain(m)) }] }); return got; };
  return { ctx, send, push, ask, centre, badges, win, idb, tick: (ms) => (clock += ms), now: () => clock };
}

test('the log’s rules: newest first, in the place of one with its tag, at most 50 and 14 days; cleared ones gone and never merged back; unseen counted', { skip }, () => {
  const { ctx } = worker(), now = Date.parse('2026-11-07T12:00:00Z');
  let s = ctx.noteState(null);
  s = ctx.noteAdd(s, { id: 'a', app: 'weather', title: 'Rain', body: '', url: '/weather/', tag: 'weather:rain', at: now - 3000 }, now);
  s = ctx.noteAdd(s, { id: 'b', app: 'chat', title: 'Ann', body: 'Hi', url: '/chats/', tag: '', at: now - 2000 }, now);
  s = ctx.noteAdd(s, { id: 'c', app: 'weather', title: 'Rain again', body: '', url: '/weather/', tag: 'weather:rain', at: now - 1000 }, now);
  assert.deepEqual(plain(s.list.map((x) => x.id)), ['c', 'b'], 'the same tag replaced, newest first');
  assert.equal(ctx.noteUnread(s), 2);
  s = ctx.noteSeen(s);
  assert.equal(ctx.noteUnread(s), 0, 'seen: the rows stay');
  assert.equal(s.list.length, 2);
  // (capped at 50, the oldest let go; and nothing older than 14 days)
  let big = ctx.noteState(null);
  for (let i = 0; i < 60; i++) big = ctx.noteAdd(big, { id: `n${i}`, app: 'today', title: `${i}`, body: '', url: '/', tag: '', at: now - (60 - i) * 1000 }, now);
  assert.equal(big.list.length, 50);
  assert.equal(big.list[0].id, 'n59');
  assert.equal(big.list.at(-1).id, 'n10');
  const old = ctx.noteAdd(ctx.noteState(null), { id: 'old', app: 'today', title: '', body: '', url: '/', tag: '', at: now - 15 * 864e5 }, now);
  assert.equal(old.list.length, 0, 'older than 14 days: let go');
  // (cleared: out, and kept as gone, so the same one still in Notification Centre isn't added back)
  s = ctx.noteDrop(s, ['b'], [], now);
  assert.deepEqual(plain(s.list.map((x) => x.id)), ['c']);
  const showing = [{ title: 'Ann', body: 'Hi', tag: '', data: { app: 'chat', url: '/chats/', id: 'b' }, timestamp: now - 2000 },
    { title: 'Old one', body: 'From before the log', tag: 'markets:TSCO', data: { app: 'markets', url: '/markets/#s=TSCO' }, timestamp: now - 500 }];
  s = ctx.noteMerge(s, showing, now);
  assert.deepEqual(plain(s.list.map((x) => [x.id, x.title, x.seen])), [['tag:markets:TSCO', 'Old one', false], ['c', 'Rain again', true]], 'one showing that the log hasn’t: added, unseen; one cleared: not back');
  // (a new one with a gone one's tag comes back)
  s = ctx.noteDrop(s, [], ['weather:rain'], now);
  assert.equal(s.list.some((x) => x.tag === 'weather:rain'), false);
  s = ctx.noteAdd(s, { id: 'd', app: 'weather', title: 'Rain later', body: '', url: '/weather/', tag: 'weather:rain', at: now }, now);
  assert.equal(s.list[0].id, 'd');
});

test('the worker: each one shown is logged, the badge is the unseen ones, the sheet opened clears it; cleared in the sheet closes it in Notification Centre; tapped there leaves the log', { skip }, async () => {
  const w = worker();
  await w.push({ app: 'weather', title: 'Rain from 15:00', body: 'Take a coat', tag: 'rain', url: './' });
  w.tick(60e3);
  await w.push({ app: 'chat', title: 'Ann', body: 'See you at 6', url: '/pigeon/#open=abc' });
  w.tick(60e3);
  await w.push({ app: 'markets', title: 'TSCO up 4%', body: '', tag: 'TSCO', url: './#s=TSCO' });
  assert.deepEqual(w.badges, [1, 2, 3]);
  let r = await w.ask({ ifl: 'notes' });
  assert.deepEqual(r.list.map((x) => [x.app, x.title, x.url, x.seen]), [['markets', 'TSCO up 4%', '/markets/#s=TSCO', false], ['chat', 'Ann', '/chats/#open=abc', false], ['weather', 'Rain from 15:00', '/weather/', false]]);
  assert.equal(r.unread, 3);
  assert.ok(w.win.messages.some((m) => m.ifl === 'notes' && m.unread === 3), 'an open page told as one comes');
  // (the same tag again: in its place, unseen)
  w.tick(60e3);
  await w.push({ app: 'weather', title: 'Rain from 16:00', body: '', tag: 'rain', url: './' });
  r = await w.ask({ ifl: 'notes' });
  assert.deepEqual(r.list.map((x) => x.title), ['Rain from 16:00', 'TSCO up 4%', 'Ann']);
  assert.equal(w.badges.at(-1), 3);
  // (the sheet opened: every one seen, the badge cleared, the rows kept)
  r = await w.ask({ ifl: 'notes-seen' });
  assert.equal(r.unread, 0);
  assert.equal(r.list.length, 3);
  assert.equal(w.badges.at(-1), 0);
  // (cleared in the sheet: out of the log, and its notification closed)
  const ann = r.list.find((x) => x.title === 'Ann');
  r = await w.ask({ ifl: 'notes-clear', ids: [ann.id] });
  assert.deepEqual(r.list.map((x) => x.title), ['Rain from 16:00', 'TSCO up 4%']);
  assert.deepEqual(w.centre.map((n) => n.title), ['Rain from 16:00', 'TSCO up 4%']);
  // (tapped in Notification Centre: out of the log too)
  const tsco = w.centre.find((n) => n.tag === 'markets:TSCO');
  await w.send('notificationclick', { notification: { ...tsco, close: () => tsco.close() }, action: '' });
  r = await w.ask({ ifl: 'notes' });
  assert.deepEqual(r.list.map((x) => x.title), ['Rain from 16:00']);
  // (cleared there without a tap, where the browser says so)
  const rain = w.centre[0];
  rain.close();
  await w.send('notificationclose', { notification: rain });
  r = await w.ask({ ifl: 'notes' });
  assert.deepEqual(r.list, []);
  // (Clear All, and one showing from before the log merged in, unseen, then cleared with the rest)
  await w.push({ app: 'today', title: 'Morning', body: 'Your day', url: '/' });
  w.centre.push({ title: 'Older', body: '', tag: 'weather:old', data: { app: 'weather', url: '/weather/' }, timestamp: w.now() - 1000, close() { w.centre.splice(w.centre.indexOf(this), 1); } });
  r = await w.ask({ ifl: 'notes' });
  assert.deepEqual(r.list.map((x) => [x.title, x.seen]), [['Morning', false], ['Older', false]]);
  assert.equal(r.unread, 2);
  r = await w.ask({ ifl: 'notes-clear', all: true });
  assert.deepEqual([r.list, r.unread, w.centre.length, w.badges.at(-1)], [[], 0, 0, 0]);
  // (an ask from another site's page is never answered)
  let got = null;
  await w.send('message', { data: { ifl: 'notes' }, source: { url: 'https://evil.example/' }, ports: [{ postMessage: (m) => (got = m) }] });
  assert.equal(got, null);
});

test('the sheet’s rows: newest first as given, data as text only, the time, a tap opening, Clear and Delete clearing; "No notifications" for none', { skip }, async () => {
  globalThis.document = fakeDocument();
  const ui = await import(new URL('ui.js', ROOF));
  const { draw, when } = await import(BELL);
  const now = new Date(2026, 10, 7, 12, 0).getTime();
  assert.equal(when(new Date(2026, 10, 7, 11, 2).getTime(), now), '11:02');
  assert.equal(when(new Date(2026, 10, 6, 23, 50).getTime(), now), 'Yesterday');
  assert.match(when(new Date(2026, 10, 3, 9, 0).getTime(), now), /^\w{3}$/);
  assert.match(when(new Date(2026, 9, 20, 9, 0).getTime(), now), /20/);
  const H = `<img src=x onerror="alert(1)">`;
  const list = [
    { id: 'c', app: 'markets', title: 'TSCO up 4%', body: '', url: '/markets/#s=TSCO', at: now - 60e3, seen: false },
    { id: 'b', app: 'chat', title: H, body: H, url: '/chats/#open=abc', at: new Date(2026, 10, 7, 11, 2).getTime(), seen: true },
    { id: 'a', app: 'weather', title: 'Rain', body: 'Take a coat', url: '/weather/', at: new Date(2026, 10, 6, 9, 0).getTime(), seen: true },
  ];
  const box = ui.el('div'), opened = [], cleared = [];
  draw(box, list, { ui, now, open: (n) => opened.push(n.id), clear: (n) => cleared.push(n.id) });
  const rows = box.querySelectorAll('.ifl-nt-row');
  assert.deepEqual(rows.map((r) => r.dataset.id), ['c', 'b', 'a']);
  assert.equal(box.querySelector('ul').getAttribute('role'), 'list');
  assert.deepEqual(rows.map((r) => r.querySelector('.ifl-nt-when').textContent), ['11:59', '11:02', 'Yesterday']);
  assert.equal(rows[1].querySelector('.ifl-nt-t').textContent, H, 'a title as text');
  assert.ok(!box.outerHTML.includes('<img src=x'), 'never markup');
  assert.equal(rows[0].querySelector('.ifl-nt-b'), null, 'no body: no line for it');
  assert.equal(rows[2].querySelector('.ifl-nt-b').textContent, 'Take a coat');
  assert.equal(rows[0].querySelector('.ifl-nt-x').getAttribute('aria-label'), 'Clear');
  assert.equal(rows[0].querySelector('img.ifl-appic').dataset.app, 'markets');
  rows[1].querySelector('.ifl-nt-main').click();
  rows[2].querySelector('.ifl-nt-x').click();
  rows[0].querySelector('.ifl-nt-main').dispatch('keydown', { key: 'Delete' });
  assert.deepEqual([opened, cleared], [['b'], ['a', 'c']]);
  draw(box, [], { ui, now, open() {}, clear() {} });
  assert.equal(box.textContent, 'No notifications');
});
