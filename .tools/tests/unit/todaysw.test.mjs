// Today's service worker (the inflite repo's today/public/sw.js, where it's checked out beside this one: InFlite's root
// worker), run here with what a browser gives it made up, for Today's own files: the updater's renew is answered;
// Today's own files come from the network while there is one, never the API nor a page of the hub's; its copy is
// today-app-2, with Today First's files (today-app-3 with the framework's, One roof); and every file the page loads as it
// opens is among those it keeps. And One roof's (spec §8.2, D10): a document at /weather/ from the network, else the
// copy of /, never kept as /; the module's files kept when the page asks ({ ifl: "keep" }), checked and all or
// nothing; and Weather's files from the network first, the kept copy only with no answer or a 5xx (a 404 passed on).
// (Its notifications, taps, Chat's pulse and renewed subscriptions: rootsw.test.mjs.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import { IFL, roofSkip } from './fixtures/roof.mjs';

const SW = IFL && new URL('today/public/sw.js', IFL);
const skip = !IFL && 'the inflite repo isn’t beside this one';
const tfSkip = skip || (!existsSync(new URL('today/src/hub.js', IFL)) && 'the inflite repo beside is from before Today First (its live branch, while this repo goes live first)');
// (One roof's worker, where the inflite repo beside has the roof rule (today/src/roof.js): its cases; and milestone 1's
// where it hasn't, as its live branch beside main while this repo goes live first)
const hasRoof = !tfSkip && existsSync(new URL('today/src/roof.js', IFL));
// (stages 2–4's worker (s24-contracts §8): every module's page and files, one MODS list; its copy today-app-4)
const S24 = hasRoof && /\nconst MODS = \{/.test(readFileSync(SW, 'utf8'));
// (stage 3's: Chats in that list too, s3 spec §6.3)
const S3 = S24 && /\bchats: \{ name: "Chats"/.test(readFileSync(SW, 'utf8'));
const SHELL_NOW = S24 ? 'today-app-4' : 'today-app-3';
const MODPATH = S3 ? /^\/(weather|markets|fitness|mail|chats)\// : S24 ? /^\/(weather|markets|fitness|mail)\// : /^\/weather\//;
const roofCase = tfSkip || roofSkip || (!hasRoof && 'the inflite repo beside has no roof rule yet (today/src/roof.js)');
const m1Case = tfSkip || (hasRoof && 'the inflite repo beside has the roof (today/src/roof.js): its case is One roof’s, below');
const ORIGIN = 'https://inflite.ai';
// (what the worker made, in its own context: compared as plain data)
const plain = (x) => JSON.parse(JSON.stringify(x));

// (the worker, with a network (net: path, init → a Response, or a throw for no answer), a cache, its windows, and what it showed)
function worker(net, { windows = [] } = {}) {
  const fetchInit = [];
  const on = {}, stores = new Map(), shown = [], asked = [], opened = [], posts = [];
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
  // (each cache by its name, each of its entries by its path; what's kept as it comes, never a copy shared)
  const key = (k) => new URL(typeof k === 'string' ? k : k.url, ORIGIN).pathname;
  const store = (name) => { if (!stores.has(name)) stores.set(name, new Map()); return stores.get(name); };
  const caches = {
    open: async (name) => { const m = store(name); return { match: async (k) => m.get(key(k))?.clone() || undefined, put: async (k, r) => { m.set(key(k), r); }, add: async () => {}, addAll: async () => {} }; },
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
  };
  const fetch = async (r, init = {}) => {
    const path = new URL(typeof r === 'string' ? r : r.url, ORIGIN).pathname;
    asked.push(path);
    fetchInit.push(init);
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
  return { send, get, stores, fetchInit, shown, asked, opened, posts, wins, subscribed: () => subscribed };
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
  for (const p of ['/nope', ...(S3 ? [] : ['/chats/']), '/chats/?engine=1', '/chats/in/', ...(S24 ? [] : ['/markets/#s=TSCO', '/mail/']), '/weather', '/weather/x.html', '/markets', '/mail/x.html']) assert.equal(await w.get(p, 'navigate'), null, p);
  for (const p of [...(S3 ? [] : ['/chats/app.js']), '/chats/sw.js', '/weather/sw.js', '/weather/version', '/weather/app.js?v=1']) assert.equal(await w.get(p), null, p);
  // (Weather's page and files at /weather/: the hub's, from the network, in milestone 1; One roof's cases below)
  if (!hasRoof) { assert.equal(await w.get('/weather/', 'navigate'), null); assert.equal(await w.get('/weather/app.js'), null); }
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
  for (const s of [...want].filter((f) => f?.endsWith('.js') && !MODPATH.test(f))) {
    const src = read(s.slice(1));
    for (const [, a, b] of src.matchAll(/^\s*import\b[^'"]*["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/gm)) want.add(own(a || b, s));
    for (const [, u] of src.matchAll(/["'`](\/[\w./-]+\.(?:svg|png|css|js|json|webmanifest))["'`?]/g)) if (u !== '/sw.js') want.add(u);
  }
  for (const s of [...want].filter((f) => f?.endsWith('.js') && !MODPATH.test(f))) {
    const src = read(s.slice(1));
    for (const [, a] of src.matchAll(/^\s*import\b[^'"]*["']([^"']+)["']/gm)) want.add(own(a, s));
  }
  want.delete(null);
  // (Weather's module files under the roof are the hub's, kept by the worker in roof-weather-*, not in FILES)
  for (const f of [...want]) if (MODPATH.test(f)) want.delete(f);
  // (the icons a phone asks for as Today's added to its Home Screen, never as it opens, needn't be kept)
  for (const f of ['/icon-512.png', '/icon-maskable-512.png', '/og.png']) want.delete(f);
  const missing = [...want].filter((f) => !FILES.includes(f));
  assert.deepEqual(missing, [], 'loaded as Today opens, not kept for offline');
  for (const f of FILES) {
    assert.ok(existsSync(new URL(f === '/' ? 'index.html' : f.slice(1), pub)), `${f} is in FILES but not there`);
  }
});

test('its copy is today-app-2, with Today First’s files: the day, Apps, You and Mail’s host page’s script', { skip: m1Case }, () => {
  const src = readFileSync(SW, 'utf8');
  assert.equal(/\nconst SHELL = "([^"]+)";/.exec(src)?.[1], 'today-app-2');
  const FILES = JSON.parse(/\nconst FILES = (\[[^\]]*\]);/.exec(src)[1]);
  for (const f of ['/day.js', '/day.css', '/apps.js', '/you.js', '/mailhost.js']) assert.ok(FILES.includes(f), f);
  // (the page loads day.js by its own address, a plain import, so the check above covers it)
  assert.match(readFileSync(new URL('app.js', SW), 'utf8'), /import\("\/day\.js"\)/);
});

test('One roof: its copy is today-app-3 (today-app-4 from stages 2–4), with the framework’s files beside Today First’s', { skip: roofCase }, () => {
  const src = readFileSync(SW, 'utf8');
  assert.equal(/\nconst SHELL = "([^"]+)";/.exec(src)?.[1], SHELL_NOW);
  const FILES = JSON.parse(/\nconst FILES = (\[[^\]]*\]);/.exec(src)[1]);
  for (const f of ['/day.js', '/day.css', '/apps.js', '/you.js', '/mailhost.js']) assert.ok(FILES.includes(f), f);
  const roof = ['frame.js', 'router.js', 'header.js', 'tabs.js', 'sheet.js', 'toast.js', 'ui.js', 'search.js', 'send.js', 'modules.js', 'connectors.js', 'roof.css'].map((f) => `/roof/${f}`);
  for (const f of roof) assert.ok(FILES.includes(f), f);
  assert.ok(!FILES.some((f) => f.startsWith('/weather/')), 'never Weather’s files: those are the module’s cache’s');
  // (the old copies let go as it takes over, Weather's old worker's caches and the module's never)
  assert.match(src, /if \(k\.startsWith\("today-app-"\) && k !== SHELL\) await caches\.delete\(k\);/);
  assert.doesNotMatch(src, /startsWith\("wx-"\)/);
});

test('One roof: a document at /weather/ from the network, else the copy of / (never one of /weather/ kept as /); a 5xx answered by the copy too', { skip: roofCase }, async () => {
  let mode = 'up';
  const w = worker((path) => {
    if (mode === 'down') throw new TypeError('Load failed');
    if (mode === '5xx') return new Response('hub down', { status: 503 });
    if (mode === 'off') return Object.defineProperty(new Response('MILESTONE 1 WEATHER', { status: 200 }), 'type', { value: 'basic' });
    return Object.defineProperty(new Response(path === '/' ? 'TODAY /' : `FRAMEWORK ${path}`, { status: 200 }), 'type', { value: 'basic' });
  });
  assert.equal(await (await w.get('/', 'navigate')).text(), 'TODAY /', 'Today’s page, kept as it comes');
  for (const p of ['/weather/', '/weather/index.html', '/weather/?lat=1&lon=2']) assert.equal(await (await w.get(p, 'navigate')).text(), `FRAMEWORK ${new URL(p, ORIGIN).pathname}`, p);
  mode = 'off';
  assert.equal(await (await w.get('/weather/', 'navigate')).text(), 'MILESTONE 1 WEATHER', 'the roof off: the hub’s page, as it sends it');
  assert.equal(await (await w.stores.get(SHELL_NOW).get('/').clone()).text(), 'TODAY /', 'never kept as /');
  assert.deepEqual([...w.stores.get(SHELL_NOW).keys()], ['/'], 'nor kept at all');
  for (const m of ['down', '5xx']) {
    mode = m;
    for (const p of ['/weather/', '/weather/index.html', '/weather/#radar']) assert.equal(await (await w.get(p, 'navigate')).text(), 'TODAY /', `${m} ${p}`);
  }
  // (nothing kept yet, and no network: the browser's own error, as for /)
  const fresh = worker(() => { throw new TypeError('Load failed'); });
  await assert.rejects(fresh.get('/weather/', 'navigate'));
  const nothing = worker(() => new Response('down', { status: 502 }));
  assert.equal((await nothing.get('/weather/', 'navigate')).status, 502);
});

// (a page of this site asking, as modules.js keepOffline does; the worker's own copies of each file it fetched)
const FILES12 = ['/weather/roof/weather.js', '/weather/roof/connector.js', '/weather/roof/core.js', '/weather/data.js', '/weather/format.js', '/weather/roof/weather.css'];
const keepFrom = (w, data, source = { url: `${ORIGIN}/weather/#radar` }) => w.send('message', { data, source, ports: [] });
const okFile = (path) => Object.defineProperty(new Response(`file ${path}`, { status: 200 }), 'type', { value: 'basic' });

test('One roof: the module’s files kept when the page asks, in roof-weather-<build>, all of them or none; the build before let go only once the new one is whole', { skip: roofCase }, async () => {
  let failOn = null, opaque = null;
  const w = worker((path) => {
    if (path === failOn) return new Response('gone', { status: 404 });
    if (path === opaque) return Object.defineProperty(new Response('x', { status: 200 }), 'type', { value: 'cors' });
    return okFile(path);
  });
  await keepFrom(w, { ifl: 'keep', app: 'weather', build: '1.64', files: FILES12 });
  assert.deepEqual([...w.stores.get('roof-weather-1.64').keys()].sort(), [...FILES12].sort());
  assert.equal(await w.stores.get('roof-weather-1.64').get('/weather/data.js').clone().text(), 'file /weather/data.js');
  assert.ok(w.fetchInit.slice(-FILES12.length).every((i) => i.cache === 'no-cache'), 'each fetched afresh, past the browser’s copy');
  // (a new build with one file that isn't there: none of it kept, the build before kept whole)
  failOn = '/weather/roof/core.js';
  await keepFrom(w, { ifl: 'keep', app: 'weather', build: '1.65', files: FILES12 });
  assert.ok(!w.stores.has('roof-weather-1.65'), 'all or nothing');
  assert.equal(w.stores.get('roof-weather-1.64').size, FILES12.length, 'the build before kept');
  // (nor one answered by another site, or not whole: only this site's own answer, ok)
  failOn = null; opaque = '/weather/format.js';
  await keepFrom(w, { ifl: 'keep', app: 'weather', build: '1.65', files: FILES12 });
  assert.ok(!w.stores.has('roof-weather-1.65'));
  // (no answer at all, for one of them: the same)
  opaque = null;
  const down = worker((path) => { if (path === '/weather/roof/core.js') throw new TypeError('Load failed'); return okFile(path); });
  await keepFrom(down, { ifl: 'keep', app: 'weather', build: '1.65', files: FILES12 });
  assert.ok(!down.stores.has('roof-weather-1.65'));
  // (whole: kept, and only then the build before let go; Today's own copy and Weather's old worker's caches never touched)
  w.stores.set(SHELL_NOW, new Map([['/', okFile('/')]]));
  w.stores.set('wx-1.64', new Map());
  w.stores.set('roof-other-1.00', new Map());
  await keepFrom(w, { ifl: 'keep', app: 'weather', build: '1.65', files: FILES12 });
  assert.equal(w.stores.get('roof-weather-1.65').size, FILES12.length);
  assert.ok(!w.stores.has('roof-weather-1.64'), 'the build before, let go once the new one is whole');
  for (const k of [SHELL_NOW, 'wx-1.64', 'roof-other-1.00']) assert.ok(w.stores.has(k), k);
});

test('One roof: a build kept whole stays whole: asked again with no network, a 404 or a 5xx, nothing fetched and nothing let go; one kept in part is filled', { skip: roofCase }, async () => {
  let mode = 'up';
  const w = worker((path) => {
    if (mode === 'down') throw new TypeError('Load failed');
    if (mode === '404' && path === '/weather/roof/core.js') return new Response('gone', { status: 404 });
    if (mode === '503') return new Response('hub not ready', { status: 503 });
    return okFile(path);
  });
  await keepFrom(w, { ifl: 'keep', app: 'weather', build: '1.64', files: FILES12 });
  assert.equal(w.stores.get('roof-weather-1.64').size, FILES12.length);
  // (every open of the page asks again, offline too, as it mounts from the kept copy: the copy stays, nothing asked)
  for (const m of ['down', '404', '503']) {
    mode = m;
    const n = w.asked.length;
    await keepFrom(w, { ifl: 'keep', app: 'weather', build: '1.64', files: FILES12 });
    assert.equal(w.stores.get('roof-weather-1.64')?.size, FILES12.length, `${m}: kept whole`);
    assert.equal(w.asked.length, n, `${m}: nothing fetched, the build being kept whole already`);
  }
  // (kept in part (a worker stopped part way): filled when it can be, left as it was when it can't)
  w.stores.get('roof-weather-1.64').delete('/weather/data.js');
  mode = 'down';
  await keepFrom(w, { ifl: 'keep', app: 'weather', build: '1.64', files: FILES12 });
  assert.equal(w.stores.get('roof-weather-1.64')?.size, FILES12.length - 1, 'no network: what was kept, kept');
  mode = '404';
  await keepFrom(w, { ifl: 'keep', app: 'weather', build: '1.64', files: FILES12 });
  assert.equal(w.stores.get('roof-weather-1.64')?.size, FILES12.length - 1, 'one not there: what was kept, kept');
  mode = 'up';
  await keepFrom(w, { ifl: 'keep', app: 'weather', build: '1.64', files: FILES12 });
  assert.equal(w.stores.get('roof-weather-1.64').size, FILES12.length, 'filled');
  // (a new build that fails, with no network: the build before kept whole, no cache of the new one left)
  mode = 'down';
  await keepFrom(w, { ifl: 'keep', app: 'weather', build: '1.65', files: FILES12 });
  assert.deepEqual([...w.stores.keys()], ['roof-weather-1.64']);
});

test('One roof: keeps for two builds never race: an older build’s ask, finishing last or coming after, never lets the newer one go', { skip: roofCase }, async () => {
  // (an old tab's 1.64 and a fresh one's 1.65, asked together: 1.64's files, asked first, answered slowly, so were the
  // two kept side by side 1.64 would finish last)
  let n = 0;
  const slow = worker(async (path) => { if (n++ < FILES12.length) await new Promise((ok) => setTimeout(ok, 60)); return okFile(path); });
  await Promise.all([
    keepFrom(slow, { ifl: 'keep', app: 'weather', build: '1.64', files: FILES12 }, { url: `${ORIGIN}/weather/` }),
    keepFrom(slow, { ifl: 'keep', app: 'weather', build: '1.65', files: FILES12 }),
  ]);
  assert.deepEqual([...slow.stores.keys()], ['roof-weather-1.65'], 'the newer build kept, the older let go');
  assert.equal(slow.stores.get('roof-weather-1.65').size, FILES12.length);
  const w = worker((path) => okFile(path));
  // (an old tab's ask for an older build, after the newer one's kept: ignored, nothing fetched)
  await keepFrom(w, { ifl: 'keep', app: 'weather', build: '1.65', files: FILES12 });
  const asked = w.asked.length;
  await keepFrom(w, { ifl: 'keep', app: 'weather', build: '1.64', files: FILES12 });
  assert.deepEqual([...w.stores.keys()], ['roof-weather-1.65']);
  assert.equal(w.asked.length, asked, 'nothing fetched for the older build');
  // (builds compared as numbers: 10.00 is after 9.99)
  const v = worker((path) => okFile(path));
  await keepFrom(v, { ifl: 'keep', app: 'weather', build: '9.99', files: FILES12 });
  await keepFrom(v, { ifl: 'keep', app: 'weather', build: '10.00', files: FILES12 });
  await keepFrom(v, { ifl: 'keep', app: 'weather', build: '9.99', files: FILES12 });
  assert.deepEqual([...v.stores.keys()], ['roof-weather-10.00']);
});

test('One roof: a keep that isn’t right is ignored whole: another app, a build not as the apps number them, a file not Weather’s own, a query, vendor/, too many, another site’s page', { skip: roofCase }, async () => {
  const w = worker((path) => okFile(path));
  const bad = [
    { app: 'chat', build: '1.64', files: FILES12 },
    { app: 'weather', build: '1.6', files: FILES12 },
    { app: 'weather', build: '1.640', files: FILES12 },
    { app: 'weather', build: 'x1.64', files: FILES12 },
    { app: 'weather', build: 1.64, files: FILES12 },
    { app: 'weather', build: '1.64', files: [] },
    { app: 'weather', build: '1.64', files: '/weather/roof/weather.js' },
    { app: 'weather', build: '1.64', files: [...FILES12, '/app.js'] },
    { app: 'weather', build: '1.64', files: [...FILES12, '/chats/app.js'] },
    { app: 'weather', build: '1.64', files: [...FILES12, 'https://evil.example/weather/x.js'] },
    { app: 'weather', build: '1.64', files: [...FILES12, '//evil.example/weather/x.js'] },
    { app: 'weather', build: '1.64', files: [...FILES12, '/weather/roof/x.js?v=1'] },
    { app: 'weather', build: '1.64', files: [...FILES12, '/weather/vendor/maplibre-gl.js'] },
    { app: 'weather', build: '1.64', files: [...FILES12, '/weather/../app.js'] },
    { app: 'weather', build: '1.64', files: [...FILES12, '/weather/%2e%2e/app.js'] },
    { app: 'weather', build: '1.64', files: [...FILES12, '/weather/sw.js'] },
    { app: 'weather', build: '1.64', files: [...FILES12, '/weather/version'] },
    { app: 'weather', build: '1.64', files: [...FILES12, 7] },
    { app: 'weather', build: '1.64', files: Array.from({ length: 61 }, (_, i) => `/weather/roof/f${i}.js`) },
  ];
  for (const d of bad) await keepFrom(w, { ifl: 'keep', ...d });
  assert.deepEqual([...w.stores.keys()], [], 'nothing kept');
  assert.deepEqual(w.asked, [], 'nothing fetched');
  // (from another site's window, or no window: ignored)
  await keepFrom(w, { ifl: 'keep', app: 'weather', build: '1.64', files: FILES12 }, { url: 'https://evil.example/' });
  await keepFrom(w, { ifl: 'keep', app: 'weather', build: '1.64', files: FILES12 }, null);
  assert.deepEqual([...w.stores.keys()], []);
  // (sixty, at the most: kept)
  await keepFrom(w, { ifl: 'keep', app: 'weather', build: '1.64', files: Array.from({ length: 60 }, (_, i) => `/weather/roof/f${i}.js`) });
  assert.equal(w.stores.get('roof-weather-1.64').size, 60);
});

test('One roof: Weather’s files from the network first; the kept copy only with no answer or a 5xx; a 404 (the roof off) passed on; never its worker, version or a query', { skip: roofCase }, async () => {
  let mode = 'up';
  const w = worker((path) => {
    if (mode === 'down') throw new TypeError('Load failed');
    if (mode === '5xx') return new Response('hub down', { status: 502 });
    if (mode === '404') return new Response('Not found.', { status: 404 });
    return okFile(`${path} (network)`);
  });
  assert.equal(await (await w.get('/weather/roof/weather.js')).text(), 'file /weather/roof/weather.js (network)');
  assert.ok(!w.stores.size, 'nothing kept by fetching alone: only a keep keeps');
  w.stores.set('roof-weather-1.64', new Map([['/weather/roof/weather.js', okFile('/weather/roof/weather.js (kept)')], ['/weather/data.js', okFile('/weather/data.js (kept)')]]));
  assert.equal(await (await w.get('/weather/roof/weather.js')).text(), 'file /weather/roof/weather.js (network)', 'network first, while there’s an answer');
  for (const m of ['down', '5xx']) {
    mode = m;
    assert.equal(await (await w.get('/weather/roof/weather.js')).text(), 'file /weather/roof/weather.js (kept)', m);
    assert.equal(await (await w.get('/weather/data.js')).text(), 'file /weather/data.js (kept)', m);
  }
  mode = '5xx';
  assert.equal((await w.get('/weather/roof/core.js')).status, 502, 'not kept: the hub’s answer');
  mode = 'down';
  await assert.rejects(w.get('/weather/roof/core.js'), 'not kept, no answer: the browser’s error');
  mode = '404';
  const off = await w.get('/weather/roof/weather.js');
  assert.equal(off.status, 404, 'the roof off: the hub’s 404, never the kept copy');
  for (const p of ['/weather/sw.js', '/weather/version', '/weather/roof/weather.js?retry=1']) assert.equal(await w.get(p), null, p);
});

// ---- stages 2–4 (s24-contracts §8): every module's page and files, by one MODS list ----
const s24Case = roofCase || (!S24 && 'the inflite repo beside is from before stages 2–4 (sw.js has no MODS)');
test('stages 2–4: each module’s document (/markets/, /fitness/, /mail/) as /weather/’s: the network, else the copy of /, never kept as /', { skip: s24Case }, async () => {
  let mode = 'up';
  const w = worker((path) => {
    if (mode === 'down') throw new TypeError('Load failed');
    return Object.defineProperty(new Response(path === '/' ? 'TODAY /' : `PAGE ${path}`, { status: 200 }), 'type', { value: 'basic' });
  });
  assert.equal(await (await w.get('/', 'navigate')).text(), 'TODAY /');
  for (const a of ['markets', 'fitness', 'mail']) for (const p of [`/${a}/`, `/${a}/index.html`, `/${a}/#x=1`]) assert.equal(await (await w.get(p, 'navigate')).text(), `PAGE /${a}/${p.includes('index') ? 'index.html' : ''}`, p);
  assert.deepEqual([...w.stores.get(SHELL_NOW).keys()], ['/'], 'none kept as /');
  mode = 'down';
  for (const a of ['markets', 'fitness', 'mail']) assert.equal(await (await w.get(`/${a}/`, 'navigate')).text(), 'TODAY /', `${a} offline: the kept framework`);
  for (const p of ['/markets', '/fitness/x.html', ...(S3 ? [] : ['/chats/']), '/chats/?engine=1', '/chats/in/']) assert.equal(await w.get(p, 'navigate'), null, p);
});

test('stages 2–4: Markets’ and Fitness’s files kept in roof-<app>-<build> (files ∪ lazy, ≤ 60, under the app’s path, never vendor/, its worker or version); each app’s kept copy only its own', { skip: s24Case }, async () => {
  const w = worker((path) => okFile(path));
  const mk = ['/markets/roof/markets.js', '/markets/roof/core.js', '/markets/charts.js', '/markets/roof/news.js', '/markets/roof/markets.css'];
  await w.send('message', { data: { ifl: 'keep', app: 'markets', build: '1.96', files: mk }, source: { url: `${ORIGIN}/markets/` }, ports: [] });
  assert.deepEqual([...w.stores.get('roof-markets-1.96').keys()].sort(), [...mk].sort());
  for (const bad of [['/weather/roof/core.js'], ['/markets/sw.js'], ['/markets/version'], ['/weather/vendor/maplibre.js'], ['/fitness/vendor/x.js'], Array.from({ length: 61 }, (_, i) => `/fitness/roof/f${i}.js`)]) {
    await w.send('message', { data: { ifl: 'keep', app: bad[0].split('/')[1] === 'weather' ? 'markets' : 'fitness', build: '1.68', files: bad }, source: { url: `${ORIGIN}/fitness/` }, ports: [] });
  }
  assert.ok(!w.stores.has('roof-fitness-1.68') && !w.stores.has('roof-markets-1.68'), 'another app’s path, a worker, a version, vendor/ or over 60: nothing kept');
  const fx = Array.from({ length: 60 }, (_, i) => `/fitness/roof/f${i}.js`);
  await w.send('message', { data: { ifl: 'keep', app: 'fitness', build: '1.68', files: fx }, source: { url: `${ORIGIN}/fitness/` }, ports: [] });
  assert.equal(w.stores.get('roof-fitness-1.68').size, 60, '60: kept');
  // (a module's file, its network failing: its own kept copy, never another app's)
  const off = worker((path) => { throw new TypeError('Load failed'); });
  off.stores.set('roof-markets-1.96', new Map([['/markets/roof/core.js', okFile('/markets/roof/core.js')]]));
  off.stores.set('roof-fitness-1.68', new Map([['/fitness/roof/core.js', okFile('/fitness/roof/core.js')]]));
  assert.equal(await (await off.get('/markets/roof/core.js')).text(), 'file /markets/roof/core.js');
  await assert.rejects(off.get('/markets/roof/news.js'), 'not kept: no answer');
  assert.equal(await (await off.get('/fitness/roof/core.js')).text(), 'file /fitness/roof/core.js');
  for (const p of ['/markets/sw.js', '/fitness/version', '/markets/roof/core.js?retry=1']) assert.equal(await off.get(p), null, `${p}: not the worker’s`);
});

// ---- stage 3 (s3 spec §6.3, risk I11, build I17): Chats ----
const s3Case = s24Case || (!S3 && 'the inflite repo beside is from before stage 3 (sw.js MODS without chats)');
test('stage 3: Chats’ document /chats/ as the others’ (the network, else the copy of /), never with ?engine and never /chats/in/; its files kept (roof/* and its own <name>.js|css only) and served network first, plain or ?v=<12 hex>, the kept copy by path', { skip: s3Case }, async () => {
  let mode = 'up';
  const w = worker((path) => {
    if (mode === 'down') throw new TypeError('Load failed');
    return Object.defineProperty(new Response(path === '/' ? 'TODAY /' : `PAGE ${path}`, { status: 200 }), 'type', { value: 'basic' });
  });
  assert.equal(await (await w.get('/', 'navigate')).text(), 'TODAY /');
  for (const p of ['/chats/', '/chats/index.html', '/chats/#open=a1', '/chats/?x=1']) assert.match(await (await w.get(p, 'navigate')).text(), /^PAGE \/chats\//, p);
  mode = 'down';
  assert.equal(await (await w.get('/chats/', 'navigate')).text(), 'TODAY /', 'offline: the kept framework');
  for (const p of ['/chats/?engine=1', '/chats/index.html?a=1&engine', '/chats/in/', '/chats/in/index.html', '/chats/tracker.html', '/chats']) assert.equal(await w.get(p, 'navigate'), null, `${p}: never the framework’s`);
  assert.deepEqual([...w.stores.get(SHELL_NOW).keys()], ['/'], 'none kept as /');
  // (its files: kept when the page asks, only Chats’ own kinds)
  const k = worker((path) => okFile(path));
  const files = ['/chats/roof/chats.js', '/chats/roof/core.js', '/chats/roof/chats.css', '/chats/cards.js', '/chats/crypto.js', '/chats/cards.css'];
  await k.send('message', { data: { ifl: 'keep', app: 'chats', build: '1.70', files }, source: { url: `${ORIGIN}/chats/` }, ports: [] });
  assert.deepEqual([...k.stores.get('roof-chats-1.70').keys()].sort(), [...files].sort());
  for (const bad of ['/chats/sw.js', '/chats/version', '/chats/in/x.js', '/chats/tracker.js', '/chats/handover.js', '/chats/index.html', '/chats/map/x.png', '/chats/inflite.svg', '/chats/roof/', '/chats/roof/x.js?v=0123456789ab', '/weather/roof/core.js']) {
    await k.send('message', { data: { ifl: 'keep', app: 'chats', build: '1.71', files: [files[0], bad] }, source: { url: `${ORIGIN}/chats/` }, ports: [] });
    assert.ok(!k.stores.has('roof-chats-1.71'), `${bad}: nothing kept`);
  }
  // (network first, a stamped or plain path; with no answer or a 5xx the kept copy, by its path; a 404 passed on)
  let net = 'up';
  const f = worker((path) => {
    if (net === 'down') throw new TypeError('Load failed');
    if (net === '5xx') return new Response('hub down', { status: 502 });
    if (net === '404') return new Response('Not found.', { status: 404 });
    return okFile(`${path} (network)`);
  });
  f.stores.set('roof-chats-1.70', new Map([['/chats/roof/core.js', okFile('/chats/roof/core.js (kept)')], ['/chats/cards.js', okFile('/chats/cards.js (kept)')]]));
  assert.equal(await (await f.get('/chats/roof/core.js?v=0123456789ab')).text(), 'file /chats/roof/core.js (network)');
  for (const m of ['down', '5xx']) {
    net = m;
    for (const p of ['/chats/roof/core.js', '/chats/roof/core.js?v=0123456789ab', '/chats/cards.js?v=abcdefabcdef']) assert.equal(await (await f.get(p)).text(), `file ${new URL(p, ORIGIN).pathname} (kept)`, `${m} ${p}`);
  }
  net = '404';
  assert.equal((await f.get('/chats/roof/core.js?v=0123456789ab')).status, 404, 'Chats off: the hub’s 404');
  for (const p of ['/chats/sw.js', '/chats/version', '/chats/in/', '/chats/in/inflite.svg', '/chats/roof/core.js?v=1', '/chats/roof/core.js?v=0123456789AB', '/chats/roof/core.js?retry=1', '/chats/cards.js?v=0123456789ab&x=1', '/chats/tracker.js', '/chats/handover.js', '/chats/inflite.svg'])
    assert.equal(await f.get(p), null, `${p}: not the worker’s`);
});
