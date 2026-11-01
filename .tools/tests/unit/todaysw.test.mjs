// Today's service worker (the inflite repo's today/public/sw.js, where it's checked out beside this one), run here with
// what a browser gives it made up: a notification tapped opens only Today's own pages; one that comes to a device signed
// out elsewhere says only that, stops them there, and tells any open Today to forget the day it kept; one whose sign-in
// can't be checked in time still shows; the updater's renew is answered; Today's own files come from the network while
// there is one, never the API; a renewed subscription moves the old one's place; and every file the page loads as it
// opens is among those it keeps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

const SW = new URL('../../../../inflite/today/public/sw.js', import.meta.url);
const skip = !existsSync(SW) && 'the inflite repo isn’t beside this one';
const ORIGIN = 'https://inflite.ai';
// (what the worker made, in its own context: compared as plain data)
const plain = (x) => JSON.parse(JSON.stringify(x));

// (the worker, with a network (net: path, init → a Response, or a throw for no answer), a cache, its windows, and what it showed)
function worker(net, { windows = [] } = {}) {
  const on = {}, kept = new Map(), shown = [], asked = [], opened = [], posts = [];
  let subscribed = true;
  const win = (url) => ({ url, focused: false, messages: [], focus() { this.focused = true; return Promise.resolve(this); }, postMessage(m) { this.messages.push(m); } });
  const wins = windows.map(win);
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (k, f) => (on[k] = f),
    skipWaiting: () => {},
    clients: { claim: async () => {}, matchAll: async () => wins, openWindow: async (u) => { opened.push(u); return win(u); } },
    registration: {
      showNotification: async (title, o) => shown.push({ title, ...o }),
      pushManager: {
        getSubscription: async () => (subscribed ? { unsubscribe: async () => (subscribed = false) } : null),
        subscribe: async () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/new', toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/new', keys: { p256dh: 'p', auth: 'a' } }) }),
      },
    },
  };
  const caches = {
    open: async () => ({ match: async (k) => kept.get(k)?.clone() || undefined, put: async (k, r) => kept.set(k, r), addAll: async () => {} }),
    keys: async () => [],
    delete: async () => true,
  };
  const fetch = async (r, init = {}) => {
    const path = new URL(typeof r === 'string' ? r : r.url, ORIGIN).pathname;
    asked.push(path);
    if (init.method === 'POST') posts.push({ path, headers: init.headers, body: JSON.parse(init.body) });
    return net(path, init);
  };
  // (a moment, not seconds: the worker's waits made short)
  const setTimeout = (f, ms) => globalThis.setTimeout(f, ms >= 5000 ? 30 : ms);
  vm.runInNewContext(readFileSync(SW, 'utf8'), { self, caches, fetch, setTimeout, clearTimeout, URL, URLSearchParams, Response, Request, Promise, JSON, atob, Uint8Array });
  const send = async (k, x) => {
    let answer = null;
    const waits = [];
    on[k]({ ...x, respondWith: (p) => (answer = Promise.resolve(p)), waitUntil: (p) => waits.push(p) });
    const res = answer ? await answer : null;
    await Promise.all(waits);
    return res;
  };
  const get = (path, mode = 'cors') => send('fetch', { request: { method: 'GET', url: `${ORIGIN}${path}`, mode } });
  return { send, get, kept, shown, asked, opened, posts, wins, subscribed: () => subscribed };
}
const session = (signedIn) => () => new Response(JSON.stringify({ signedIn }), { status: 200, headers: { 'Content-Type': 'application/json' } });

test('a notification tapped opens only Today’s own pages: the open window, told where, or a new one', { skip }, async () => {
  const tap = (w, url) => w.send('notificationclick', { notification: { close: () => {}, data: url === undefined ? {} : { url } }, action: '' });
  let w = worker(() => null);
  for (const [url, want] of [['/#morning', `${ORIGIN}/#morning`], [undefined, `${ORIGIN}/`], ['https://evil.example/x', `${ORIGIN}/`], ['//evil.example/', `${ORIGIN}/`], ['javascript:alert(1)', `${ORIGIN}/`], ['https://inflite.ai.evil.example/', `${ORIGIN}/`]]) {
    w = worker(() => null);
    await tap(w, url);
    assert.deepEqual(w.opened, [want], String(url));
  }
  // (Today open already, or another site's window open in this browser: Today's focused and told, the other left be)
  w = worker(() => null, { windows: ['https://chat.inflite.ai/', `${ORIGIN}/`] });
  await tap(w, '/#morning');
  assert.deepEqual(w.opened, []);
  assert.equal(w.wins[1].focused, true);
  assert.deepEqual(plain(w.wins[1].messages), [{ open: `${ORIGIN}/#morning` }]);
  assert.deepEqual(plain(w.wins[0].messages), []);
});

test('a notification for a device signed out elsewhere says only that, stops them there, and tells Today’s windows; one that can’t be checked still shows', { skip }, async () => {
  const push = { title: 'London · 14° / 7°', body: 'Dry, sunny spells. 2 pigeons on their way', tag: 'today-morning', url: '/#morning' };
  const data = { json: () => push, text: () => JSON.stringify(push) };

  let w = worker((p) => (p === '/api/session' ? session(false)() : null), { windows: [`${ORIGIN}/`, 'https://email.inflite.ai/'] });
  await w.send('push', { data });
  assert.equal(w.shown.length, 1);
  assert.equal(w.shown[0].title, 'Today');
  assert.equal(w.shown[0].body, 'Signed out on this device, so notifications have stopped here.');
  assert.ok(!JSON.stringify(w.shown).includes('pigeons') && !JSON.stringify(w.shown).includes('London'), 'nothing of the day');
  assert.equal(w.subscribed(), false);
  assert.deepEqual(plain(w.wins[0].messages), [{ ifl: 'signedout' }]);
  assert.deepEqual(plain(w.wins[1].messages), [], 'never another site’s window');

  // (signed in: the notification as it came, Today's icon on it, where a tap takes you with it)
  w = worker((p) => (p === '/api/session' ? session(true)() : null), { windows: [`${ORIGIN}/`] });
  await w.send('push', { data });
  assert.equal(w.shown[0].title, push.title);
  assert.equal(w.shown[0].body, push.body);
  assert.equal(w.shown[0].tag, push.tag);
  assert.equal(w.shown[0].icon, '/icon-192.png');
  assert.deepEqual(plain(w.shown[0].data), { url: '/#morning' });
  assert.equal(w.subscribed(), true);
  assert.deepEqual(plain(w.wins[0].messages), []);

  // (no answer, the account failing, or an answer too slow to wait for: shown as it came, never held back)
  for (const net of [() => { throw new TypeError('Load failed'); }, () => new Response('{}', { status: 502 }), () => new Promise(() => {}), () => new Response('{"error":"x"}', { status: 200 })]) {
    w = worker((p) => (p === '/api/session' ? net() : null));
    await w.send('push', { data });
    assert.equal(w.shown.length, 1);
    assert.equal(w.shown[0].body, push.body);
    assert.equal(w.subscribed(), true);
  }
  // (a notification with nothing in it: still Today's)
  w = worker((p) => (p === '/api/session' ? session(true)() : null));
  await w.send('push', { data: null });
  assert.equal(w.shown[0].title, 'Today');
});

test('the updater’s renew is answered', { skip }, async () => {
  const w = worker(() => null);
  const got = [];
  await w.send('message', { data: { ifl: 'renew' }, ports: [{ postMessage: (m) => got.push(m) }] });
  assert.deepEqual(plain(got), [{ ifl: 'renewed' }]);
});

test('Today’s own files: from the network while there is one, kept as they come; what was kept only with no answer; never the API', { skip }, async () => {
  let down = false;
  const w = worker((path) => {
    if (down) throw new TypeError('Load failed');
    return Object.defineProperty(new Response(`fresh ${path}`, { status: 200 }), 'type', { value: 'basic' });
  });
  assert.equal(await (await w.get('/', 'navigate')).text(), 'fresh /');
  assert.equal(await (await w.get('/cards.js')).text(), 'fresh /cards.js');
  for (const p of ['/api/session', '/api/today?with=morning', '/api/avatar?id=x', '/app.js?v=2', '/version']) assert.equal(await w.get(p), null, p);
  assert.equal(await w.send('fetch', { request: { method: 'GET', url: 'https://example.com/app.js', mode: 'cors' } }), null);
  assert.equal(await w.send('fetch', { request: { method: 'POST', url: `${ORIGIN}/`, mode: 'navigate' } }), null);
  // (another address of the site is its 404 page, from the network: not Today's page kept)
  assert.equal(await w.get('/nope', 'navigate'), null);
  down = true;
  assert.equal(await (await w.get('/', 'navigate')).text(), 'fresh /');
  assert.equal(await (await w.get('/cards.js')).text(), 'fresh /cards.js');
  await assert.rejects(w.get('/app.css'));
});

test('a renewed subscription takes the old one’s place where the account has it, else is added, with X-Inflite', { skip }, async () => {
  const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/new', toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/new', keys: { p256dh: 'p', auth: 'a' } }) };
  let w = worker((p) => Response.json(p === '/api/push/move' ? { moved: true } : { ok: true }));
  await w.send('pushsubscriptionchange', { newSubscription: sub, oldSubscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/old' } });
  assert.deepEqual(w.posts.map((x) => x.path), ['/api/push/move']);
  assert.deepEqual(w.posts[0].body, { sub: sub.toJSON(), was: 'https://fcm.googleapis.com/fcm/send/old' });
  assert.equal(w.posts[0].headers['X-Inflite'], '1');
  // (the old one not the account's, or taken: the new one added)
  w = worker((p) => Response.json(p === '/api/push/move' ? { moved: false } : { ok: true }));
  await w.send('pushsubscriptionchange', { newSubscription: sub, oldSubscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/old' } });
  assert.deepEqual(w.posts.map((x) => x.path), ['/api/push/move', '/api/push']);
  assert.deepEqual(w.posts[1].body, { sub: sub.toJSON() });
  // (none given: made afresh with the account's key)
  w = worker((p) => (p === '/api/push/key' ? Response.json({ key: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U' }) : Response.json({ ok: true })));
  await w.send('pushsubscriptionchange', {});
  assert.deepEqual(w.posts.map((x) => x.path), ['/api/push']);
  assert.equal(w.posts[0].body.sub.endpoint, 'https://fcm.googleapis.com/fcm/send/new');
});

// (every file Today's page loads as it opens, its manifest's start, and what its scripts and stylesheet bring in: one
// added and not to FILES, and Today wouldn't open offline. And every one in FILES there to be kept)
test('every file Today’s page loads as it opens is one the worker keeps, and each of those is there', { skip }, () => {
  const pub = new URL('./', SW), read = (f) => readFileSync(new URL(f, pub), 'utf8');
  const FILES = JSON.parse(/\nconst FILES = (\[[^\]]*\]);/.exec(read('sw.js'))[1]);
  const own = (u, base = '/') => { const x = new URL(u, new URL(base, `${ORIGIN}/`)); return x.origin === ORIGIN ? x.pathname : null; };
  const attr = (tag, k) => { const m = new RegExp(`\\s${k}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag); return m ? m[1] ?? m[2] ?? m[3] : null; };
  const html = read('index.html'), want = new Set(['/']);
  for (const [tag] of html.matchAll(/<script\b[^>]*>/gi)) if (attr(tag, 'src')) want.add(own(attr(tag, 'src')));
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) if (/\b(stylesheet|icon|apple-touch-icon|manifest|modulepreload|preload)\b/i.test(attr(tag, 'rel') || '')) want.add(own(attr(tag, 'href')));
  for (const [tag] of html.matchAll(/<img\b[^>]*>/gi)) want.add(own(attr(tag, 'src')));
  const manifest = [...want].find((f) => f && /\.webmanifest$/.test(f));
  assert.ok(manifest, 'the page names its manifest');
  want.add(own(JSON.parse(read(manifest.slice(1))).start_url || '/', manifest));
  for (const s of [...want].filter((f) => f?.endsWith('.js'))) {
    const src = read(s.slice(1));
    for (const [, a, b] of src.matchAll(/^\s*import\b[^'"]*["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/gm)) want.add(own(a || b, s));
    for (const [, u] of src.matchAll(/["'`](\/[\w./-]+\.(?:svg|png|css|js|json|webmanifest))["'`?]/g)) if (u !== '/sw.js') want.add(u);
  }
  for (const s of [...want].filter((f) => f?.endsWith('.js'))) {
    const src = read(s.slice(1));
    for (const [, a] of src.matchAll(/^\s*import\b[^'"]*["']([^"']+)["']/gm)) want.add(own(a, s));
  }
  want.delete(null);
  // (the icons a phone asks for as Today's added to its Home Screen, never as it opens, needn't be kept)
  for (const f of ['/icon-512.png', '/icon-maskable-512.png', '/og.png']) want.delete(f);
  const missing = [...want].filter((f) => !FILES.includes(f));
  assert.deepEqual(missing, [], 'loaded as Today opens, not kept for offline');
  for (const f of FILES) assert.ok(existsSync(new URL(f === '/' ? 'index.html' : f.slice(1), pub)), `${f} is in FILES but not there`);
});
