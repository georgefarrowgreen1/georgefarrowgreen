// Today's service worker (the inflite repo's today/public/sw.js, where it's checked out beside this one: InFlite's root
// worker), run here with what a browser gives it made up, for Today's own files: the updater's renew is answered;
// Today's own files come from the network while there is one, never the API nor a page of the hub's; its copy is
// today-app-2, with Today First's files; and every file the page loads as it opens is among those it keeps.
// (Its notifications, taps, Chat's pulse and renewed subscriptions: rootsw.test.mjs.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

const SW = new URL('../../../../inflite/today/public/sw.js', import.meta.url);
const skip = !existsSync(SW) && 'the inflite repo isn’t beside this one';
const tfSkip = skip || (!existsSync(new URL('../../../../inflite/today/src/hub.js', import.meta.url)) && 'the inflite repo beside is from before Today First (its live branch, while this repo goes live first)');
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
    open: async () => ({ match: async (k) => kept.get(k)?.clone() || undefined, put: async (k, r) => kept.set(k, r), add: async () => {}, addAll: async () => {} }),
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
  // (another address of the site is its 404 page, or a page of the hub's, from the network: not Today's page kept)
  for (const p of ['/nope', '/chats/', '/chats/?engine=1', '/weather/', '/markets/#s=TSCO', '/mail/']) assert.equal(await w.get(p, 'navigate'), null, p);
  for (const p of ['/chats/app.js', '/weather/app.js', '/chats/sw.js']) assert.equal(await w.get(p), null, p);
  down = true;
  assert.equal(await (await w.get('/', 'navigate')).text(), 'fresh /');
  assert.equal(await (await w.get('/cards.js')).text(), 'fresh /cards.js');
  await assert.rejects(w.get('/app.css'));
});

// (every file Today's page loads as it opens, its manifest's start, and what its scripts and stylesheet bring in: one
// added and not to FILES, and Today wouldn't open offline. And every one in FILES there to be kept)
test('every file Today’s page loads as it opens is one the worker keeps, and each of those is there', { skip }, (t) => {
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
  for (const f of FILES) {
    assert.ok(existsSync(new URL(f === '/' ? 'index.html' : f.slice(1), pub)), `${f} is in FILES but not there`);
  }
});

test('its copy is today-app-2, with Today First’s files: the day, Apps, You and Mail’s host page’s script', { skip: tfSkip }, () => {
  const src = readFileSync(SW, 'utf8');
  assert.equal(/\nconst SHELL = "([^"]+)";/.exec(src)?.[1], 'today-app-2');
  const FILES = JSON.parse(/\nconst FILES = (\[[^\]]*\]);/.exec(src)[1]);
  for (const f of ['/day.js', '/day.css', '/apps.js', '/you.js', '/mailhost.js']) assert.ok(FILES.includes(f), f);
  // (the page loads day.js by its own address, a plain import, so the check above covers it)
  assert.match(readFileSync(new URL('app.js', SW), 'utf8'), /import\("\/day\.js"\)/);
});
