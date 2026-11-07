// Today's bell (the inflite repo's today/public/bell.js) and the root worker's log behind it (today/public/sw.js): each
// notification shown kept (id, app, title, body, url, tag, time), newest first, in the place of one with its tag, at
// most 50 and 14 days; one tapped or cleared in Notification Centre, or cleared in the bell's sheet (its notification
// closed too), out of it and never merged back, but by the sheet's Undo within a minute; those still showing that it
// hasn't added; the Home Screen badge the unseen ones, cleared as the sheet's opened (which is told which they were),
// while the rows stay. And the sheet's rows as bell.js draws them: by day, newest first, data as text only, the time as
// "Now" / "5m" / "11:02" / "Yesterday" with the app's name, a dot for the unseen, a stack of one app's to one place
// with its count, "No notifications" when there are none, a tap opening, Clear and Delete clearing.
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

test('the worker: Undo puts cleared ones back (seen, as they were, their notifications left closed), only within a minute of their clearing and never over a newer one with the tag; the sheet told which were unseen as it opened', { skip }, async () => {
  const w = worker();
  await w.push({ app: 'chat', title: 'Ann', body: 'See you at 6', tag: 'msg-ann', url: '/pigeon/#open=ann' });
  w.tick(1000);
  await w.push({ app: 'chat', title: 'Ann', body: 'Running late', tag: 'cheer-1', url: '/pigeon/#open=ann' });
  let r = await w.ask({ ifl: 'notes' });
  assert.deepEqual(r.list.map((x) => x.tag), ['chat:cheer-1', 'chat:msg-ann'], 'each one’s tag told, for the sheet’s stacks and its Undo');
  r = await w.ask({ ifl: 'notes-seen' });
  assert.deepEqual(r.fresh.length, 2, 'the sheet told which were unseen');
  assert.equal(r.unread, 0);
  assert.equal((await w.ask({ ifl: 'notes-seen' })).fresh.length, 0, 'and none the next time');
  const both = r.list;
  r = await w.ask({ ifl: 'notes-clear', ids: both.map((x) => x.id) });
  assert.deepEqual([r.list, w.centre.length], [[], 0]);
  // (put back: in the log again, seen, newest first; Notification Centre left as it is)
  r = await w.ask({ ifl: 'notes-back', list: both });
  assert.deepEqual(r.list.map((x) => [x.body, x.seen, x.url]), [['Running late', true, '/chats/#open=ann'], ['See you at 6', true, '/chats/#open=ann']]);
  assert.equal(w.centre.length, 0, 'their notifications stay closed');
  assert.equal(w.badges.at(-1), 0, 'no count for them');
  assert.ok(w.win.messages.some((m) => m.ifl === 'notes' && m.list.length === 2), 'an open page told');
  // (put back once only: again, nothing doubled)
  r = await w.ask({ ifl: 'notes-back', list: both });
  assert.equal(r.list.length, 2);
  // (cleared, and a new one with its tag since: that one stays, the old one isn't put over it)
  const late = r.list[0];
  await w.ask({ ifl: 'notes-clear', ids: [late.id] });
  w.tick(1000);
  await w.push({ app: 'chat', title: 'Ann', body: 'Here now', tag: 'cheer-1', url: '/pigeon/#open=ann' });
  r = await w.ask({ ifl: 'notes-back', list: [late] });
  assert.deepEqual(r.list.map((x) => x.body), ['Here now', 'See you at 6']);
  // (more than a minute after: not put back)
  const six = r.list[1];
  await w.ask({ ifl: 'notes-clear', ids: [six.id] });
  w.tick(61e3);
  r = await w.ask({ ifl: 'notes-back', list: [six] });
  assert.deepEqual(r.list.map((x) => x.body), ['Here now']);
  // (never one the log didn't let go of, and nothing but what a row is: a link elsewhere made the hub's own)
  r = await w.ask({ ifl: 'notes-back', list: [{ id: 'made-up', app: 'chat', title: 'Hi', body: '', url: '/', tag: '', at: w.now() }] });
  assert.equal(r.list.length, 1, 'one it never had: not added');
  const here = r.list[0];
  await w.ask({ ifl: 'notes-clear', ids: [here.id] });
  r = await w.ask({ ifl: 'notes-back', list: [{ ...here, url: 'https://evil.example/', app: 'evil', title: 7 }] });
  assert.deepEqual(r.list.map((x) => [x.url, x.app, x.title]), [['/', 'today', '']]);
});

test('the sheet’s rows: by day (Today, Yesterday, Earlier), data as text only, the app’s name by the time, a dot for the unseen; a stack for several from one app to one place in a day, its count opening it out; a tap opening, Clear and Delete clearing (a stack as one); the bell and "No notifications" for none', { skip }, async () => {
  globalThis.document = fakeDocument();
  const ui = await import(new URL('ui.js', ROOF));
  const { draw, when, group } = await import(BELL);
  const now = new Date(2026, 10, 7, 12, 0).getTime(), at = (d, h, m) => new Date(2026, 10, d, h, m).getTime();
  // (the times: Now, minutes, the clock today, Yesterday, the day this week, then the date; and as they're said)
  assert.equal(when(now - 20e3, now), 'Now');
  assert.equal(when(now + 5e3, now), 'Now', 'a clock a little behind: still Now');
  assert.equal(when(now - 5 * 60e3, now), '5m');
  assert.equal(when(now - 59 * 60e3, now), '59m');
  assert.equal(when(at(7, 10, 2), now), '10:02');
  assert.equal(when(at(6, 23, 50), now), 'Yesterday');
  assert.match(when(at(3, 9, 0), now), /^\w{3}$/);
  assert.match(when(new Date(2026, 9, 20, 9, 0).getTime(), now), /20/);
  assert.equal(when(now - 5 * 60e3, now, true), '5 minutes ago');
  assert.equal(when(now - 61e3, now, true), '1 minute ago');
  assert.equal(when(now, now, true), 'Just now');
  assert.match(when(at(3, 9, 0), now, true), /^\w{6,9}$/, 'the day in full');
  const H = `<img src=x onerror="alert(1)">`;
  const list = [
    { id: 'm', app: 'markets', title: 'TSCO up 4%', body: '', url: '/markets/#s=TSCO', at: now - 60e3, seen: false },
    { id: 'a3', app: 'chat', title: 'Ann', body: 'Here now', url: '/chats/#open=ann', at: at(7, 10, 40), seen: false },
    { id: 'h', app: 'chat', title: H, body: H, url: '/chats/#open=x', at: at(7, 10, 30), seen: true },
    { id: 'a2', app: 'chat', title: 'Ann', body: 'Running late', url: '/chats/#open=ann', at: at(7, 10, 10), seen: true },
    { id: 'a1', app: 'chat', title: 'Ann', body: 'See you at six', url: '/chats/#open=ann', at: at(7, 9, 0), seen: true },
    { id: 'y', app: 'weather', title: 'Rain', body: 'Take a coat', url: '/weather/', at: at(6, 9, 0), seen: true },
    { id: 'a0', app: 'chat', title: 'Ann', body: 'Yesterday’s', url: '/chats/#open=ann', at: at(6, 8, 0), seen: true },
    { id: 'e', app: 'today', title: 'Your day', body: '', url: '/', at: at(2, 7, 0), seen: true },
  ];
  // (grouped: each day's own stacks; the same app and place on another day not in them)
  const g = group(list, now);
  assert.deepEqual(g.map((s) => [s.label, s.stacks.map((st) => [st.head.id, st.rest.map((n) => n.id)])]),
    [['Today', [['m', []], ['a3', ['a2', 'a1']], ['h', []]]], ['Yesterday', [['y', []], ['a0', []]]], ['Earlier', [['e', []]]]]);
  const box = ui.el('div'), opened = [], cleared = [], more = [];
  const fresh = new Set(['m', 'a1']);
  const go = (shown = new Set()) => draw(box, list, { ui, now, fresh, shown, open: (ns) => opened.push(ns.map((n) => n.id)), clear: (ns) => cleared.push(ns.map((n) => n.id)), more: (k) => more.push(k) });
  go();
  assert.deepEqual(box.querySelectorAll('.ifl-nt-h').map((h) => h.textContent), ['Today', 'Yesterday', 'Earlier'], 'a heading a day');
  const sec = box.querySelectorAll('section.ifl-nt-sec');
  assert.equal(sec[0].querySelector('ul').getAttribute('role'), 'list');
  assert.equal(sec[0].querySelector('ul').getAttribute('aria-labelledby'), sec[0].querySelector('h3').id, 'each list named by its day');
  let rows = box.querySelectorAll('.ifl-nt-row');
  assert.deepEqual(rows.map((r) => r.dataset.id), ['m', 'a3', 'h', 'y', 'a0', 'e'], 'Ann’s three today one row, the newest; yesterday’s apart');
  assert.deepEqual(rows.map((r) => r.querySelector('.ifl-nt-when').textContent.replace(/^\w{3}$/, 'Day')), ['1m', '10:40', '10:30', 'Yesterday', 'Yesterday', 'Day']);
  assert.deepEqual(rows.map((r) => r.querySelector('.ifl-nt-app')?.textContent), ['Markets', 'Chat', 'Chat', 'Weather', 'Chat', 'Today'], 'the app’s name by the time');
  assert.equal(rows[2].querySelector('.ifl-nt-t').textContent, H, 'a title as text');
  assert.ok(!box.outerHTML.includes('<img src=x'), 'never markup');
  assert.equal(rows[0].querySelector('.ifl-nt-b'), null, 'no body: no line for it');
  assert.equal(rows[3].querySelector('.ifl-nt-b').textContent, 'Take a coat');
  assert.equal(rows[0].querySelector('.ifl-nt-x').getAttribute('aria-label'), 'Clear');
  assert.equal(rows[0].querySelector('img.ifl-appic').dataset.app, 'markets');
  // (the unseen: a dot, and said; a stack with one unseen among it has it too)
  assert.deepEqual(rows.map((r) => r.dataset.fresh || ''), ['1', '1', '', '', '', '']);
  assert.match(rows[0].querySelector('.ifl-nt-main').getAttribute('aria-label'), /^New\. TSCO up 4%\. Markets, 1 minute ago$/);
  assert.match(rows[3].querySelector('.ifl-nt-main').getAttribute('aria-label'), /^Rain\. Take a coat\. Weather, Yesterday$/);
  // (the stack: +2, a button that says so and that it's shut, said on the row too)
  const plus = rows[1].querySelector('.ifl-nt-more');
  assert.equal(plus.textContent, '+2');
  assert.deepEqual([plus.getAttribute('aria-label'), plus.getAttribute('aria-expanded')], ['2 more', 'false']);
  assert.match(rows[1].querySelector('.ifl-nt-main').getAttribute('aria-label'), /\. 2 more$/);
  assert.ok(rows[1].classList.contains('stack'));
  assert.equal(rows[0].querySelector('.ifl-nt-more'), null, 'one alone: no count');
  // (its row tapped: open, and the three go as one; cleared, the same)
  rows[1].querySelector('.ifl-nt-main').click();
  rows[1].querySelector('.ifl-nt-x').click();
  rows[1].querySelector('.ifl-nt-main').dispatch('keydown', { key: 'Delete' });
  plus.click();
  assert.deepEqual(opened, [['a3', 'a2', 'a1']]);
  assert.deepEqual(cleared, [['a3', 'a2', 'a1'], ['a3', 'a2', 'a1']]);
  assert.deepEqual(more, ['chat|/chats/#open=ann|' + new Date(2026, 10, 7).getTime()]);
  // (opened out: a row each, the rest a little in, each tapped and cleared by itself; the count now says it's open)
  go(new Set(more));
  rows = box.querySelectorAll('.ifl-nt-row');
  assert.deepEqual(rows.map((r) => r.dataset.id), ['m', 'a3', 'a2', 'a1', 'h', 'y', 'a0', 'e']);
  assert.deepEqual(rows.slice(1, 4).map((r) => r.classList.contains('sub')), [false, true, true]);
  assert.equal(rows[1].querySelector('.ifl-nt-more').getAttribute('aria-expanded'), 'true');
  assert.equal(rows[2].querySelector('.ifl-nt-more'), null);
  assert.deepEqual(rows.slice(1, 4).map((r) => r.dataset.fresh || ''), ['', '', '1'], 'the dot on the one unseen');
  opened.length = cleared.length = 0;
  rows[1].querySelector('.ifl-nt-main').click();
  rows[3].querySelector('.ifl-nt-x').click();
  rows[2].querySelector('.ifl-nt-main').dispatch('keydown', { key: 'Backspace' });
  assert.deepEqual([opened, cleared], [[['a3']], [['a1'], ['a2']]]);
  // (none: the bell and the words)
  draw(box, [], { ui, now, open() {}, clear() {} });
  assert.equal(box.textContent, 'No notifications');
  assert.ok(box.querySelector('.ifl-nt-none [data-icon=bell]'), 'with the bell');
});
