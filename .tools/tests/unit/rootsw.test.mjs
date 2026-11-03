// InFlite's root service worker (the inflite repo's today/public/sw.js, where it's checked out beside this one; Today
// First, spec §11.4), run here with what a browser gives it made up: every app's notification shown, tagged by its app,
// never held back and never ending the subscription; a tap opening the app in full at what it's about, in the window
// that's open (told, { ifl: "open", url }) or a new one, never another site; Chat's pushes telling every window and
// pulsing Chat with the sign-in it keeps in IndexedDB (and only Chat's); the badge as many as are showing, counted again
// as one's tapped or cleared and as a page asks; a window that doesn't say it's heard the tap sent there, or a new one,
// through Today while the hub can't serve the app; and a renewed subscription moved in every app's table through the
// device route (Today's own, on an account side from before it). And One roof's (spec §8.2): a window of the framework
// (Today's page at / or /weather/) told to route there in the page ({ ifl: "route", url }, heard as { ifl: "routed" }),
// any other page of the site's told to open it as before, and one that doesn't say it's heard sent there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import { IFL, roofSkip } from './fixtures/roof.mjs';

const SW = IFL && new URL('today/public/sw.js', IFL);
const skip = (!IFL && 'the inflite repo isn’t beside this one') ||
  (!existsSync(new URL('today/src/hub.js', IFL)) && 'the inflite repo beside is from before Today First (its live branch, while this repo goes live first)');
// (One roof's rule, where the inflite repo beside has it (today/src/roof.js, with this worker's route): a window of the
// framework is told to route; elsewhere, as milestone 1, every window is told to open)
const hasRoof = !skip && existsSync(new URL('today/src/roof.js', IFL));
const roofCase = skip || roofSkip || (!hasRoof && 'the inflite repo beside has no roof rule yet (today/src/roof.js)');
// (stages 2–4: every module's page is the framework's too, s24-contracts §8)
const S24 = hasRoof && /\nconst MODS = \{/.test(readFileSync(SW, 'utf8'));
// (stage 3: Chats' page too, s3 spec §6.3, but never an engine's, ?engine)
const S3 = S24 && /\bchats: \{ name: "Chats"/.test(readFileSync(SW, 'utf8'));
const FRAMEWORK = ['/', '/index.html', ...(S3 ? ['weather', 'markets', 'fitness', 'mail', 'chats'] : S24 ? ['weather', 'markets', 'fitness', 'mail'] : ['weather']).flatMap((a) => [`/${a}/`, `/${a}/index.html`])];
const kindAt = (url) => (hasRoof && FRAMEWORK.includes(new URL(url).pathname) && !(S3 && /^\/chats\//.test(new URL(url).pathname) && new URL(url).searchParams.has('engine')) ? 'route' : 'open');
const ORIGIN = 'https://inflite.ai';
const plain = (x) => JSON.parse(JSON.stringify(x));

// (the worker, with a network, its windows (url, and frameType, focused, visibilityState; hears: whether its page says
// it's heard a tap, as IFL.hub's listener does, and the framework's for a route; 'open': only an open, as a page from
// before the roof; controlled: whether this worker controls it, so it can be sent
// elsewhere), Chat's sign-in in IndexedDB or none, and what it showed, posted and opened)
function worker(net = () => Response.json({ ok: true }), { windows = [], token = null } = {}) {
  const on = {}, shown = [], opened = [], posts = [], badges = [];
  let subscribed = true, cleared = 0;
  const win = (w) => ({ frameType: 'top-level', focused: false, visibilityState: 'hidden', hears: true, controlled: true, ...(typeof w === 'string' ? { url: w } : w), messages: [], focusedNow: false, went: [],
    focus() { this.focusedNow = true; return Promise.resolve(this); },
    postMessage(m, ports = []) { this.messages.push(m); if (this.hears && m?.ifl === 'open') ports[0]?.postMessage({ ifl: 'opened' }); else if (this.hears === true && m?.ifl === 'route') ports[0]?.postMessage({ ifl: 'routed' }); },
    navigate(u) { if (!this.controlled) return Promise.reject(new TypeError('not controlled by this worker')); this.went.push(u); return Promise.resolve(this); } });
  const wins = windows.map(win);
  let asked = null;
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (k, f) => (on[k] = f),
    skipWaiting: () => {},
    navigator: { setAppBadge: async (n) => badges.push(n), clearAppBadge: async () => badges.push(0) },
    clients: { claim: async () => {}, matchAll: async (o) => { asked = o; return wins; }, openWindow: async (u) => { opened.push(u); return win(u); } },
    registration: {
      showNotification: async (title, o) => shown.push({ title, ...o }),
      getNotifications: async () => shown.slice(cleared).map(() => ({})),
      pushManager: {
        getSubscription: async () => (subscribed ? { unsubscribe: async () => (subscribed = false) } : null),
        subscribe: async () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/new', toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/new', keys: { p256dh: 'p', auth: 'a' } }) }),
      },
    },
  };
  // (Chat's IndexedDB: inflight → kv → session, with its token, or nothing kept yet)
  const indexedDB = { open: () => {
    const r = {};
    setTimeout(() => {
      if (!token) { r.transaction = { abort() {} }; return r.onupgradeneeded?.(); }
      r.result = { transaction: () => ({ objectStore: () => ({ get: () => { const q = {}; setTimeout(() => { q.result = { token }; q.onsuccess?.(); }); return q; } }) }) };
      r.onsuccess?.();
    });
    return r;
  } };
  const caches = { open: async () => ({ match: async () => undefined, put: async () => {}, add: async () => {} }), keys: async () => [], delete: async () => true };
  const fetch = async (r, init = {}) => {
    const path = new URL(typeof r === 'string' ? r : r.url, ORIGIN).pathname;
    posts.push({ path, method: init.method || 'GET', headers: init.headers || {}, body: init.body ? JSON.parse(init.body) : null });
    return net(path, init);
  };
  vm.runInNewContext(readFileSync(SW, 'utf8'), { self, caches, fetch, indexedDB, setTimeout, clearTimeout, URL, URLSearchParams, Response, Request, Promise, JSON, atob, Uint8Array, Date, MessageChannel });
  const send = async (k, x) => { const waits = []; on[k]({ ...x, waitUntil: (p) => waits.push(p) }); await Promise.all(waits); };
  const push = (d) => send('push', { data: d === null ? null : { json: () => d, text: () => JSON.stringify(d) } });
  // (a tap closes the oldest showing: the browser's list one shorter)
  const tap = (data) => send('notificationclick', { notification: { close: () => { cleared++; }, data }, action: '' });
  const clear = () => { cleared++; return send('notificationclose', { notification: {} }); };
  return { send, push, tap, clear, shown, opened, posts, badges, wins, asked: () => asked, subscribed: () => subscribed };
}

test('a tap opens the app in full, at what it’s about, by its app (§11.4); an old one with no app by its address', { skip }, async () => {
  const cases = [
    [{ app: 'chat', url: '/pigeon/#open=4f6c8d2e-1a3b' }, '/chats/#open=4f6c8d2e-1a3b'],
    [{ app: 'chat', url: '/pigeon/#account' }, '/chats/#account'],
    [{ app: 'chat', url: '/pigeon/#requests' }, '/chats/#requests'],
    [{ app: 'chat' }, '/chats/'],
    [{ app: 'weather', url: './?lat=51.5072&lon=-0.1276&name=London' }, '/weather/?lat=51.5072&lon=-0.1276&name=London'],
    [{ app: 'weather', url: './' }, '/weather/'],
    [{ app: 'fitness', url: './' }, '/fitness/#today'],
    [{ app: 'fitness', url: './#activities' }, '/fitness/#activities'],
    [{ app: 'markets', url: './#s=TSCO' }, '/markets/#s=TSCO'],
    [{ app: 'markets', url: './' }, '/markets/#today'],
    [{ app: 'today', url: '/' }, '/'],
    [{ app: 'today', url: '/#morning' }, '/#morning'],
    // (an old payload, with no app: Chat's by its address, else Today's)
    [{ url: '/pigeon/#open=abc' }, '/chats/#open=abc'],
    [{ url: '/#morning' }, '/#morning'],
    [{}, '/'],
    // (an app's own address: its path, here)
    [{ app: 'markets', url: 'https://finance.inflite.ai/#s=TSCO' }, '/markets/#s=TSCO'],
    [{ app: 'chat', url: 'https://chat.inflite.ai/pigeon/#open=x' }, '/chats/#open=x'],
    // (never another site, nor a path of another app's)
    [{ app: 'today', url: 'https://evil.example/x' }, '/'],
    [{ app: 'today', url: '//evil.example/' }, '/'],
    [{ app: 'chat', url: 'javascript:alert(1)' }, '/chats/'],
    [{ app: 'weather', url: 'https://evil.example/?lat=1' }, '/weather/'],
    [{ app: 'weather', url: 'https://weather.evil.example/' }, '/weather/'],
    [{ app: 'markets', url: '/chats/#open=x' }, '/markets/#today'],
    [{ app: 'today', url: '/weather/' }, '/'],
    [{ app: 'mystery', url: 'https://inflite.ai.evil.example/' }, '/'],
  ];
  for (const [data, want] of cases) {
    const w = worker();
    await w.tap(data);
    assert.deepEqual(w.opened, [`${ORIGIN}${want}`], JSON.stringify(data));
  }
  // (what the worker shows carries its place already made: tapped, the same place)
  const w = worker((p) => (p === '/api/pigeon/pulse' ? Response.json({}) : null));
  await w.push({ app: 'weather', title: 'Rain soon', body: 'From 15:00', tag: 'rain', url: './?lat=1&lon=2&name=Here' });
  assert.deepEqual(plain(w.shown[0].data), { app: 'weather', url: '/weather/?lat=1&lon=2&name=Here' });
  await w.tap(w.shown[0].data);
  assert.deepEqual(w.opened, [`${ORIGIN}/weather/?lat=1&lon=2&name=Here`]);
});

test('a tap with a page of InFlite open: that window focused and told where ({ ifl: "open", url }), never a frame or another site’s', { skip }, async () => {
  let w = worker(undefined, { windows: ['https://chat.inflite.ai/', { url: `${ORIGIN}/chats/?engine=1`, frameType: 'nested', focused: true }, { url: `${ORIGIN}/weather/`, visibilityState: 'visible' }, `${ORIGIN}/`] });
  await w.tap({ app: 'chat', url: '/pigeon/#open=abc' });
  assert.deepEqual(w.opened, []);
  assert.equal(w.wins[2].focusedNow, true, 'the one in sight');
  assert.deepEqual(plain(w.wins[2].messages), [{ ifl: kindAt(`${ORIGIN}/weather/`), url: '/chats/#open=abc' }]);
  for (const i of [0, 1, 3]) assert.deepEqual(plain(w.wins[i].messages), [], `window ${i} left be`);
  assert.equal(w.asked()?.includeUncontrolled, true, 'pages no worker of this one’s controls (Chats has its own) are found too');
  // (the focused one, before one merely in sight)
  w = worker(undefined, { windows: [{ url: `${ORIGIN}/markets/`, visibilityState: 'visible' }, { url: `${ORIGIN}/`, focused: true }] });
  await w.tap({ app: 'markets', url: './#s=TSCO' });
  assert.deepEqual(plain(w.wins[1].messages), [{ ifl: kindAt(`${ORIGIN}/`), url: '/markets/#s=TSCO' }]);
  assert.deepEqual(plain(w.wins[0].messages), []);
  // (only another site's window, or a frame: a new window)
  w = worker(undefined, { windows: ['https://weather.inflite.ai/', { url: `${ORIGIN}/chats/?engine=1`, frameType: 'nested' }] });
  await w.tap({ app: 'today', url: '/' });
  assert.deepEqual(w.opened, [`${ORIGIN}/`]);
});

test('every push is shown, tagged by its app, never held back and never ending the subscription; the badge, as many as show', { skip }, async () => {
  const w = worker((p) => (p === '/api/session' ? Response.json({ signedIn: false }) : Response.json({})));
  await w.push({ app: 'weather', title: 'Rain in London', body: 'From 15:00, heaviest at 17:00', tag: 'wx-on', url: './' });
  await w.push({ app: 'chat', title: 'Mira', body: 'A new message', tag: 'wx-on', url: '/pigeon/#open=m' });
  await w.push({ title: 'London · 14° / 7°', body: 'Your day', tag: 'today-morning', url: '/#morning' });
  await w.push(null);
  assert.equal(w.shown.length, 4, 'all four shown');
  assert.deepEqual(w.shown.map((n) => n.tag), ['weather:wx-on', 'chat:wx-on', 'today:today-morning', undefined], 'tags by app: Chat’s and Weather’s never take each other’s place');
  assert.deepEqual(w.shown.map((n) => n.title), ['Rain in London', 'Mira', 'London · 14° / 7°', 'Today']);
  assert.equal(w.shown[0].body, 'From 15:00, heaviest at 17:00');
  assert.equal(w.shown[0].icon, '/icon-192.png');
  assert.equal(w.subscribed(), true, 'never unsubscribed on a push');
  assert.ok(!w.posts.some((p) => p.path === '/api/session'), 'no sign-in check to hold one back');
  assert.deepEqual(w.badges, [1, 2, 3, 4], 'the badge: how many are showing');
});

test('Chat’s push: every window of the site’s told, and one pulse with the sign-in Chat keeps here; nobody else’s pulses', { skip }, async () => {
  let w = worker(() => Response.json({}), { token: 'tok-123', windows: [`${ORIGIN}/`, { url: `${ORIGIN}/chats/?engine=1`, frameType: 'nested' }, 'https://email.inflite.ai/'] });
  await w.push({ app: 'chat', title: 'Pat', body: 'A new message', tag: 'm-9', url: '/pigeon/#open=p' });
  assert.deepEqual(plain(w.wins[0].messages), [{ inflight: 'sync', tag: 'm-9' }]);
  assert.deepEqual(plain(w.wins[1].messages), [{ inflight: 'sync', tag: 'm-9' }], 'the engine’s frame too');
  assert.deepEqual(plain(w.wins[2].messages), [], 'never another site’s');
  const pulse = w.posts.filter((p) => p.path === '/api/pigeon/pulse');
  assert.equal(pulse.length, 1);
  assert.equal(pulse[0].method, 'POST');
  assert.equal(pulse[0].headers.Authorization, 'Bearer tok-123');
  assert.ok(Number.isFinite(pulse[0].body.since));
  // (signed out of Chat here: shown, no pulse)
  w = worker(() => Response.json({}), { token: null, windows: [`${ORIGIN}/`] });
  await w.push({ app: 'chat', title: 'Pat', body: 'A new message', url: '/pigeon/#open=p' });
  assert.equal(w.shown.length, 1);
  assert.equal(w.posts.filter((p) => p.path === '/api/pigeon/pulse').length, 0);
  // (anyone else's: no pulse, no word to the windows)
  for (const app of ['weather', 'fitness', 'markets', 'today']) {
    w = worker(() => Response.json({}), { token: 'tok-123', windows: [`${ORIGIN}/`] });
    await w.push({ app, title: 'x', body: 'y' });
    assert.equal(w.posts.filter((p) => p.path === '/api/pigeon/pulse').length, 0, app);
    assert.deepEqual(plain(w.wins[0].messages), [], app);
  }
  // (a pulse that fails never stops the notification)
  w = worker(() => { throw new TypeError('Load failed'); }, { token: 'tok-123' });
  await w.push({ app: 'chat', title: 'Pat', body: 'A new message' });
  assert.equal(w.shown.length, 1);
});

test('a renewed subscription goes to the device route with the old one’s endpoint (was), with X-Inflite; an older account side, Today’s own', { skip }, async () => {
  const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/new', toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/new', keys: { p256dh: 'p', auth: 'a' } }) };
  const old = { endpoint: 'https://fcm.googleapis.com/fcm/send/old' };
  let w = worker(() => Response.json({ ok: true }));
  await w.send('pushsubscriptionchange', { newSubscription: sub, oldSubscription: old });
  assert.deepEqual(w.posts.map((x) => x.path), ['/api/device']);
  assert.deepEqual(w.posts[0].body, { sub: sub.toJSON(), was: old.endpoint });
  assert.equal(w.posts[0].headers['X-Inflite'], '1');
  // (no old one: the new one alone)
  w = worker(() => Response.json({ ok: true }));
  await w.send('pushsubscriptionchange', { newSubscription: sub });
  assert.deepEqual(w.posts[0].body, { sub: sub.toJSON() });
  // (an account side from before the device route, 404 or 501: Today's own move, else added)
  for (const status of [404, 501]) {
    w = worker((p) => (p === '/api/device' ? Response.json({ error: 'Not built yet.' }, { status }) : Response.json(p === '/api/push/move' ? { moved: true } : { ok: true })));
    await w.send('pushsubscriptionchange', { newSubscription: sub, oldSubscription: old });
    assert.deepEqual(w.posts.map((x) => x.path), ['/api/device', '/api/push/move'], String(status));
    w = worker((p) => (p === '/api/device' ? Response.json({}, { status }) : Response.json({ moved: false })));
    await w.send('pushsubscriptionchange', { newSubscription: sub, oldSubscription: old });
    assert.deepEqual(w.posts.map((x) => x.path), ['/api/device', '/api/push/move', '/api/push'], String(status));
  }
  // (none given: made afresh with the account's key)
  w = worker((p) => (p === '/api/push/key' ? Response.json({ key: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U' }) : Response.json({ ok: true })));
  await w.send('pushsubscriptionchange', {});
  assert.deepEqual(w.posts.filter((x) => x.method === 'POST').map((x) => x.path), ['/api/device']);
  assert.equal(w.posts.at(-1).body.sub.endpoint, 'https://fcm.googleapis.com/fcm/send/new');
});

test('the badge comes down: counted again as a notification’s tapped or cleared, and as a page of the hub asks ({ ifl: "badge" })', { skip }, async () => {
  const w = worker(() => Response.json({}), { windows: [`${ORIGIN}/`] });
  for (const app of ['weather', 'markets', 'today']) await w.push({ app, title: 'x', body: 'y' });
  assert.deepEqual(w.badges, [1, 2, 3]);
  await w.tap({ app: 'weather', url: './' });
  assert.deepEqual(w.badges.at(-1), 2, 'one tapped: two left');
  await w.clear();
  assert.deepEqual(w.badges.at(-1), 1, 'one cleared without a tap: one left');
  await w.tap({ app: 'today', url: '/' });
  assert.deepEqual(w.badges.at(-1), 0, 'none showing: the badge cleared');
  // (a page of the hub opened or back in sight asks; anything else said to the worker leaves it be)
  const n = w.badges.length;
  await w.send('message', { data: { ifl: 'badge' }, ports: [] });
  assert.equal(w.badges.length, n + 1);
  await w.send('message', { data: { ifl: 'nothing' }, ports: [] });
  assert.equal(w.badges.length, n + 1);
});

test('a tap where the open window doesn’t say it’s heard (Today’s 404 page, an older page): that window sent there if it’s this worker’s, else a new one', { skip }, async () => {
  let w = worker(undefined, { windows: [{ url: `${ORIGIN}/nowhere`, focused: true, hears: false }] });
  await w.tap({ app: 'chat', url: '/pigeon/#open=abc' });
  assert.deepEqual(plain(w.wins[0].messages), [{ ifl: 'open', url: '/chats/#open=abc' }], 'told first');
  assert.deepEqual(w.wins[0].went, [`${ORIGIN}/chats/#open=abc`], 'then sent there');
  assert.deepEqual(w.opened, []);
  // (a window another worker controls (Chats', its own): a new one)
  w = worker(undefined, { windows: [{ url: `${ORIGIN}/chats/`, focused: true, hears: false, controlled: false }] });
  await w.tap({ app: 'markets', url: './#s=TSCO' });
  assert.deepEqual(w.wins[0].went, []);
  assert.deepEqual(w.opened, [`${ORIGIN}/markets/#s=TSCO`]);
  // (heard: nothing more)
  w = worker(undefined, { windows: [{ url: `${ORIGIN}/`, focused: true }] });
  await w.tap({ app: 'chat', url: '/pigeon/#open=abc' });
  assert.deepEqual([w.wins[0].went, w.opened], [[], []]);
});

test('the hub not ready (before its key, or rolled back): an app’s notification opens Today with #go=<its path>, which sends it to the app’s own address; Today’s own, as it is', { skip }, async () => {
  const notReady = (p) => (p === '/api/hub' ? Response.json({ ready: false }) : Response.json({}));
  let w = worker(notReady);
  await w.tap({ app: 'chat', url: '/pigeon/#open=abc' });
  assert.deepEqual(w.opened, [`${ORIGIN}/#go=${encodeURIComponent('/chats/#open=abc')}`]);
  w = worker(notReady, { windows: [{ url: `${ORIGIN}/nowhere`, focused: true, hears: false }] });
  await w.tap({ app: 'weather', url: './' });
  assert.deepEqual(w.wins[0].went, [`${ORIGIN}/#go=${encodeURIComponent('/weather/')}`]);
  for (const status of [404, 503]) {
    w = worker((p) => (p === '/api/hub' ? new Response('no', { status }) : Response.json({})));
    await w.tap({ app: 'fitness', url: './' });
    assert.deepEqual(w.opened, [`${ORIGIN}/#go=${encodeURIComponent('/fitness/#today')}`], String(status));
  }
  // (Today's own: never asked about, opened as it is)
  w = worker(notReady);
  await w.tap({ app: 'today', url: '/#morning' });
  assert.deepEqual(w.opened, [`${ORIGIN}/#morning`]);
  assert.ok(!w.posts.some((p) => p.path === '/api/hub'));
  // (ready, or no answer at all (no network): the app's page itself)
  for (const net of [(p) => (p === '/api/hub' ? Response.json({ ready: true }) : Response.json({})), () => { throw new TypeError('Load failed'); }]) {
    w = worker(net);
    await w.tap({ app: 'chat', url: '/pigeon/#open=abc' });
    assert.deepEqual(w.opened, [`${ORIGIN}/chats/#open=abc`]);
  }
});

test('One roof: a window of the framework (/ or /weather/) is told to route in the page; any other page of the site’s to open it; not heard, sent there', { skip: roofCase }, async () => {
  // (the framework at each of its addresses, as it is in a window: routed, in the page, nothing navigated or opened)
  for (const at of ['/', '/index.html', '/weather/', '/weather/index.html', '/weather/?lat=1&lon=2', '/#apps', '/weather/#radar']) {
    const w = worker(undefined, { windows: [{ url: `${ORIGIN}${at}`, focused: true }] });
    await w.tap({ app: 'weather', url: './?lat=51.5&lon=-0.12&name=London' });
    assert.deepEqual(plain(w.wins[0].messages), [{ ifl: 'route', url: '/weather/?lat=51.5&lon=-0.12&name=London' }], at);
    assert.deepEqual([w.wins[0].went, w.opened], [[], []], `${at}: routed in the page`);
  }
  // (Chats, Fitness, Markets, Mail and the 404 page: told to open it, as before; from stages 2–4, Fitness, Markets and
  // Mail's pages are the framework's, told to route, below)
  for (const at of [...(S3 ? [] : ['/chats/']), '/chats/in/', '/chats/?engine=1', ...(S24 ? [] : ['/fitness/#today', '/markets/', '/mail/']), '/nowhere', '/weather/app.js']) {
    const w = worker(undefined, { windows: [{ url: `${ORIGIN}${at}`, focused: true }] });
    await w.tap({ app: 'weather', url: './#warnings' });
    assert.deepEqual(plain(w.wins[0].messages), [{ ifl: 'open', url: '/weather/#warnings' }], at);
    assert.deepEqual(w.wins[0].went, [], at);
  }
  // (a framework window that doesn't say it's routed (Today from before the roof, which only opens): sent there, after a
  // second; one another worker controls: a new window)
  let w = worker(undefined, { windows: [{ url: `${ORIGIN}/`, focused: true, hears: 'open' }] });
  await w.tap({ app: 'weather', url: './#warnings' });
  assert.deepEqual(plain(w.wins[0].messages), [{ ifl: 'route', url: '/weather/#warnings' }], 'told to route first');
  assert.deepEqual(w.wins[0].went, [`${ORIGIN}/weather/#warnings`], 'then sent there');
  w = worker(undefined, { windows: [{ url: `${ORIGIN}/weather/`, focused: true, hears: false, controlled: false }] });
  await w.tap({ app: 'chat', url: '/pigeon/#open=abc' });
  assert.deepEqual(plain(w.wins[0].messages), [{ ifl: 'route', url: '/chats/#open=abc' }, { ifl: 'open', url: '/chats/#open=abc' }]);
  assert.deepEqual(w.opened, [`${ORIGIN}/chats/#open=abc`]);
  // (Weather's milestone-1 page at /weather/ (the roof off, or its old worker not yet retired), which hears only an open
  // and is its own worker's: told to open it, as milestone 1 did, neither sent elsewhere nor a second window)
  for (const at of ['/weather/', '/weather/index.html', '/weather/?lat=1&lon=2', '/weather/#radar']) {
    w = worker(undefined, { windows: [{ url: `${ORIGIN}${at}`, focused: true, hears: 'open', controlled: false }] });
    await w.tap({ app: 'weather', url: './?lat=51.5&lon=-0.12&name=London' });
    const to = '/weather/?lat=51.5&lon=-0.12&name=London';
    assert.deepEqual(plain(w.wins[0].messages), [{ ifl: 'route', url: to }, { ifl: 'open', url: to }], at);
    assert.deepEqual([w.wins[0].went, w.opened], [[], []], `${at}: opened in that window, as milestone 1`);
  }
  // (Today's page at / from before the roof, which only opens, is this worker's: sent there as before, never told twice)
  w = worker(undefined, { windows: [{ url: `${ORIGIN}/`, focused: true, hears: 'open', controlled: false }] });
  await w.tap({ app: 'weather', url: './#warnings' });
  assert.deepEqual(plain(w.wins[0].messages), [{ ifl: 'route', url: '/weather/#warnings' }]);
  assert.deepEqual(w.opened, [`${ORIGIN}/weather/#warnings`]);
  // (no window: the framework opened at the place, the page at /weather/ being the framework's)
  w = worker();
  await w.tap({ app: 'weather', url: './?lat=1&lon=2&name=Here' });
  assert.deepEqual(w.opened, [`${ORIGIN}/weather/?lat=1&lon=2&name=Here`]);
});

// (stages 2–4 after SV's review (I-3): a module's page told to route first only where the hub says that module is on;
// j0's worker, from before it, told every one of them to route first)
const ROUTES = S24 && /\nasync function routes\(/.test(readFileSync(SW, 'utf8'));
test('stages 2–4: a window at a module’s page (/markets/, /fitness/, /mail/) is told to route where the hub says that module is on, then to open if it only opens; dark, or no word from the hub, told to open at once (no second’s wait), then to route', { skip: roofCase || (!S24 && 'the inflite repo beside is from before stages 2–4') }, async () => {
  const hub = (apps) => (p) => (p === '/api/hub' ? Response.json({ ready: true, roof: true, apps }) : Response.json({ ok: true }));
  const noWord = (p) => { if (p === '/api/hub') throw new TypeError('Load failed'); return Response.json({ ok: true }); };
  const to = '/weather/#warnings';
  for (const at of ['/fitness/#today', '/markets/', '/mail/', '/mail/index.html']) {
    const app = at.split('/')[1];
    if (!ROUTES) {
      // (j0's worker: route first, whatever the hub says)
      let w = worker(undefined, { windows: [{ url: `${ORIGIN}${at}`, focused: true }] });
      await w.tap({ app: 'weather', url: './#warnings' });
      assert.deepEqual(plain(w.wins[0].messages), [{ ifl: 'route', url: to }], at);
      w = worker(undefined, { windows: [{ url: `${ORIGIN}${at}`, focused: true, hears: 'open' }] });
      await w.tap({ app: 'weather', url: './#warnings' });
      assert.deepEqual(plain(w.wins[0].messages), [{ ifl: 'route', url: to }, { ifl: 'open', url: to }], `${at}: only opens`);
      assert.deepEqual([w.wins[0].went, w.opened], [[], []]);
      continue;
    }
    // (the module on: the framework's page, routed; one that only opens (its old worker not yet retired), then opened)
    let w = worker(hub({ weather: true, [app]: true }), { windows: [{ url: `${ORIGIN}${at}`, focused: true }] });
    await w.tap({ app: 'weather', url: './#warnings' });
    assert.deepEqual(plain(w.wins[0].messages), [{ ifl: 'route', url: to }], `${at}, on`);
    w = worker(hub({ weather: true, [app]: true }), { windows: [{ url: `${ORIGIN}${at}`, focused: true, hears: 'open' }] });
    await w.tap({ app: 'weather', url: './#warnings' });
    assert.deepEqual(plain(w.wins[0].messages), [{ ifl: 'route', url: to }, { ifl: 'open', url: to }], `${at}, on: only opens`);
    assert.deepEqual([w.wins[0].went, w.opened], [[], []]);
    // (dark, as it ships, or no word from the hub: the app's milestone-1 page, told to open at once, as milestone 1 did)
    for (const [k, net] of [['dark', hub({ weather: true, markets: false, fitness: false, mail: false })], ['no word', noWord], ['an older hub (no apps)', hub(undefined)]]) {
      w = worker(net, { windows: [{ url: `${ORIGIN}${at}`, focused: true, hears: 'open', controlled: false }] });
      const t0 = Date.now();
      await w.tap({ app: 'weather', url: './#warnings' });
      assert.ok(Date.now() - t0 < 700, `${at}, ${k}: no second’s wait (${Date.now() - t0} ms)`);
      assert.deepEqual(plain(w.wins[0].messages), [{ ifl: 'open', url: to }], `${at}, ${k}`);
      assert.deepEqual([w.wins[0].went, w.opened], [[], []], `${at}, ${k}: opened in that window`);
    }
    // (dark by the hub's word, though the page there is the framework's, which doesn't say it's heard an open: then routed)
    w = worker(hub({ [app]: false }), { windows: [{ url: `${ORIGIN}${at}`, focused: true, hears: false }] });
    await w.tap({ app: 'weather', url: './#warnings' });
    assert.deepEqual(plain(w.wins[0].messages), [{ ifl: 'open', url: to }, { ifl: 'route', url: to }], `${at}, said off: open, then route`);
  }
  if (!ROUTES) return;
  // (Weather's page as stage 1: told to route first, the hub never asked for it; but where the hub's last word had
  // Weather off, told to open first)
  const w = worker(hub({ weather: false, markets: false }), { windows: [{ url: `${ORIGIN}/weather/`, focused: true, hears: 'open', controlled: false }] });
  await w.tap({ app: 'weather', url: './#warnings' });
  assert.deepEqual(plain(w.wins[0].messages), [{ ifl: 'route', url: to }, { ifl: 'open', url: to }], '/weather/, nothing heard from the hub yet: route first, as stage 1');
  assert.ok(!w.posts.some((p) => p.path === '/api/hub'), 'the hub not asked for Weather’s page');
  w.wins[0].url = `${ORIGIN}/markets/`; w.wins[0].messages.length = 0;
  await w.tap({ app: 'weather', url: './#warnings' });
  assert.deepEqual(plain(w.wins[0].messages), [{ ifl: 'open', url: to }], '/markets/, dark: open');
  w.wins[0].url = `${ORIGIN}/weather/`; w.wins[0].messages.length = 0;
  await w.tap({ app: 'weather', url: './#warnings' });
  assert.deepEqual(plain(w.wins[0].messages), [{ ifl: 'open', url: to }], '/weather/, the hub’s last word Weather off: open first');
});

test('stages 2–4: a Mail push shows its own words at once, then Mail’s (the sender and subject), silently in the same place; none fetched for a tag that isn’t an id, nor shown when Mail’s answer is odd', { skip: roofCase || (!S24 && 'the inflite repo beside is from before stages 2–4') }, async () => {
  const asked = [];
  const answers = { ok: { title: 'Pat Jones', body: 'Lunch on Friday?' }, long: { title: 'x'.repeat(121), body: 'y' }, num: { title: 1, body: 'y' } };
  const net = (path, init) => { asked.push({ path, init }); const id = path.split('/').pop(); return answers[id] ? Response.json(answers[id]) : new Response('no', { status: 404 }); };
  let w = worker(net);
  await w.push({ app: 'mail', title: 'Mail', body: 'New mail from people', tag: 'ok', url: '/mail/#thread=ok' });
  assert.deepEqual(w.shown.map((n) => [n.title, n.body, n.tag]), [['Mail', 'New mail from people', 'mail:ok'], ['Pat Jones', 'Lunch on Friday?', 'mail:ok']]);
  assert.equal(w.shown[1].silent, true); assert.equal(w.shown[1].renotify, false);
  assert.equal(w.shown[1].data.url, '/mail/#thread=ok');
  assert.equal(asked[0].path, '/api/notice/ok'); assert.equal(asked[0].init.credentials, 'include'); assert.equal(asked[0].init.cache, 'no-store');
  for (const tag of ['long', 'num', 'gone']) {
    w = worker(net);
    await w.push({ app: 'mail', title: 'Mail', body: 'New mail from people', tag, url: `/mail/#thread=${tag}` });
    assert.equal(w.shown.length, 1, `${tag}: only the push’s own words`);
  }
  asked.length = 0;
  for (const tag of ['a/b', '../x', 'x'.repeat(65), undefined]) { w = worker(net); await w.push({ app: 'mail', title: 'Mail', body: 'New', tag }); }
  assert.deepEqual(asked, [], 'never asked for a tag that isn’t an id');
});

// ---- stage 3 (s3 spec §6.3): Chats' page is the framework's too, never an engine's or /chats/in/ ----
const s3Case = roofCase || (!S3 && 'the inflite repo beside is from before stage 3 (sw.js MODS without chats)');
test('stage 3: a Chat tap in a window at /chats/ routes there in the page; milestone 1’s page there (hearing only an open) is told to open it; /chats/in/ only ever told to open; Chat’s pushes still app "chat"', { skip: s3Case }, async () => {
  for (const at of ['/chats/', '/chats/index.html', '/chats/#open=x9']) {
    const w = worker(undefined, { windows: [{ url: `${ORIGIN}${at}`, focused: true }] });
    await w.tap({ app: 'chat', url: '/pigeon/#open=abc' });
    assert.deepEqual(plain(w.wins[0].messages), [{ ifl: 'route', url: '/chats/#open=abc' }], at);
    assert.deepEqual([w.wins[0].went, w.opened], [[], []], `${at}: routed in the page`);
  }
  let w = worker(undefined, { windows: [{ url: `${ORIGIN}/chats/`, focused: true, hears: 'open', controlled: false }] });
  await w.tap({ app: 'chat', url: '/pigeon/#open=abc' });
  assert.deepEqual(plain(w.wins[0].messages), [{ ifl: 'route', url: '/chats/#open=abc' }, { ifl: 'open', url: '/chats/#open=abc' }], 'milestone 1’s Chats: route asked, then open');
  assert.deepEqual([w.wins[0].went, w.opened], [[], []]);
  w = worker(undefined, { windows: [{ url: `${ORIGIN}/chats/in/#account`, focused: true }] });
  await w.tap({ app: 'chat', url: '/pigeon/#open=abc' });
  assert.deepEqual(plain(w.wins[0].messages), [{ ifl: 'open', url: '/chats/#open=abc' }], '/chats/in/: never told to route');
});
