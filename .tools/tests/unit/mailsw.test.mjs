// Mail's service worker (the inflite repo's email/public/sw.js, where it's checked out beside this one), run here with
// what a browser gives it made up: its own files always from the network while there is one, from what it kept only with
// no answer (or Mail's host failing), never the API; and a notice for a device signed out elsewhere saying only that,
// with its notices stopped, while one whose sign-in can't be checked in time still shows, as a slow notice counts as
// none shown and the phone stops notices for a site that keeps doing that. And every file the page loads as it opens
// among those it keeps, so Mail opens offline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

const SW = new URL('../../../../inflite/email/public/sw.js', import.meta.url);
const skip = !existsSync(SW) && 'the inflite repo isn’t beside this one';

// (the worker, with a network (net: path → a Response, or a throw for no answer), a cache, and what it showed)
function worker(net) {
  const on = {}, kept = new Map(), shown = [], asked = [], wins = [], opened = [];
  let subscribed = true;
  const self = {
    location: { origin: 'https://email.inflite.ai' },
    addEventListener: (k, f) => (on[k] = f),
    skipWaiting: () => {},
    clients: {
      claim: async () => {},
      matchAll: async () => wins,
      openWindow: async (url) => opened.push(url),
    },
    navigator: { setAppBadge: async () => {}, clearAppBadge: async () => {} },
    registration: {
      showNotification: async (title, o) => shown.push({ title, ...o }),
      pushManager: { getSubscription: async () => (subscribed ? { unsubscribe: async () => (subscribed = false) } : null) },
    },
  };
  const names = new Set(['mail-app-1', 'other-cache']);
  const caches = {
    open: async (n) => (names.add(n), { match: async (k) => kept.get(k)?.clone() || undefined, put: async (k, r) => kept.set(k, r), addAll: async () => {} }),
    keys: async () => [...names],
    delete: async (n) => names.delete(n),
  };
  const fetch = async (r) => {
    const path = new URL(typeof r === 'string' ? r : r.url, self.location.origin).pathname;
    asked.push(path);
    return net(path);
  };
  // (a moment, not seconds: the worker's waits made short, and told apart from each other by how long they'd be)
  const setTimeout = (f, ms) => globalThis.setTimeout(f, ms >= 5000 ? 30 : ms);
  vm.runInNewContext(readFileSync(SW, 'utf8'), { self, caches, fetch, setTimeout, clearTimeout, URL, URLSearchParams, Response, Request, Promise, JSON, atob });
  // (an event, as the browser sends it: what it was answered with, and everything it was told to wait for)
  const send = async (k, x) => {
    let answer = null;
    const waits = [];
    on[k]({ ...x, respondWith: (p) => (answer = Promise.resolve(p)), waitUntil: (p) => waits.push(p) });
    const res = answer ? await answer : null;
    await Promise.all(waits);
    return res;
  };
  const get = (path, mode = 'cors') => send('fetch', { request: { method: 'GET', url: `https://email.inflite.ai${path}`, mode } });
  return { send, get, kept, shown, asked, wins, opened, names, subscribed: () => subscribed };
}

test('Mail’s own files: from the network while there is one, kept as they come; what was kept only with no answer, or Mail’s host failing', { skip }, async () => {
  let down = false, failing = false;
  const w = worker((path) => {
    if (down) throw new TypeError('Load failed');
    if (failing) return new Response('Bad gateway', { status: 502 });
    return Object.defineProperty(new Response(`fresh ${path}`, { status: 200 }), 'type', { value: 'basic' });
  });
  assert.equal(await (await w.get('/', 'navigate')).text(), 'fresh /');
  assert.equal(await (await w.get('/app.js')).text(), 'fresh /app.js');
  assert.deepEqual([...w.kept.keys()].sort(), ['/', '/app.js']);
  // (none of the API, nor a file with a query, nor another site's, is the worker's to answer)
  for (const p of ['/api/threads', '/api/attachments/x', '/app.js?v=2']) assert.equal(await w.get(p), null, p);
  assert.equal(await w.send('fetch', { request: { method: 'GET', url: 'https://example.com/app.js', mode: 'cors' } }), null);
  assert.equal(await w.send('fetch', { request: { method: 'POST', url: 'https://email.inflite.ai/', mode: 'navigate' } }), null);
  // (offline: Mail's page, at either of its addresses, opens as its one page, and its files with it)
  down = true;
  assert.equal(await (await w.get('/#thread=t1', 'navigate')).text(), 'fresh /');
  assert.equal(await (await w.get('/index.html', 'navigate')).text(), 'fresh /');
  assert.equal(await (await w.get('/app.js')).text(), 'fresh /app.js');
  // (nothing kept of it: no answer, as without the worker)
  await assert.rejects(w.get('/app.css'));
  // (Mail's host failing: what was kept, not the error page)
  down = false;
  failing = true;
  assert.equal(await (await w.get('/', 'navigate')).text(), 'fresh /');
  assert.equal((await w.get('/theme.js')).status, 502);
});

test('a notice for a device signed out elsewhere says only that, and stops them there; one that can’t be checked in time still shows', { skip }, async () => {
  const push = { title: 'Rowan', body: 'Your code is 123456', tag: 't1', url: '/#thread=t1', badge: 2 };
  const data = { json: () => push, text: () => JSON.stringify(push) };
  const said = (access) => new Response(JSON.stringify({ access }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  let w = worker((p) => (p === '/api/session' ? said('signin') : null));
  await w.send('push', { data });
  assert.equal(w.shown.length, 1);
  assert.equal(w.shown[0].tag, 'signed-out');
  assert.ok(!JSON.stringify(w.shown).includes('123456') && !JSON.stringify(w.shown).includes('Rowan'), 'nothing of the mail');
  assert.equal(w.subscribed(), false);

  // (someone else signed in here: the same)
  w = worker((p) => (p === '/api/session' ? said('notadmin') : null));
  await w.send('push', { data });
  assert.equal(w.shown[0].tag, 'signed-out');

  // (signed in, or asked to sign in again: the notice as it came)
  for (const access of ['ok', 'reauth']) {
    w = worker((p) => (p === '/api/session' ? said(access) : null));
    await w.send('push', { data });
    assert.equal(w.shown[0].body, push.body, access);
    assert.equal(w.subscribed(), true);
  }

  // (no answer, Mail failing, or an answer too slow to wait for: shown as it came, never held back)
  for (const net of [() => { throw new TypeError('Load failed'); }, () => new Response('{}', { status: 502 }), () => new Promise(() => {})]) {
    w = worker((p) => (p === '/api/session' ? net() : null));
    await w.send('push', { data });
    assert.equal(w.shown.length, 1);
    assert.equal(w.shown[0].body, push.body);
    assert.equal(w.subscribed(), true);
  }
});

// (every file Mail's page loads as it opens, the page's manifest says it opens at, or its script puts up (the sign-in
// page's pictures, shown offline too): one added and not to FILES, and Mail wouldn't open offline. And every one in FILES
// there to be kept, as the browser keeps none of them if one's missing)
test('every file Mail’s page loads as it opens is one the worker keeps for opening offline, and each of those is there', { skip }, () => {
  const pub = new URL('./', SW), read = (f) => readFileSync(new URL(f, pub), 'utf8');
  const FILES = JSON.parse(/\nconst FILES = (\[[^\]]*\]);/.exec(read('sw.js'))[1]);
  // (as the worker knows a file of Mail's own: its path, without a query; another site's, none)
  const own = (u, base = '/') => {
    const x = new URL(u, new URL(base, 'https://email.inflite.ai/'));
    return x.origin === 'https://email.inflite.ai' ? x.pathname : null;
  };
  const attr = (tag, k) => {
    const m = new RegExp(`\\s${k}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
    return m ? m[1] ?? m[2] ?? m[3] : null;
  };
  const html = read('index.html'), want = new Set(['/']);
  for (const [tag] of html.matchAll(/<script\b[^>]*>/gi)) if (attr(tag, 'src')) want.add(own(attr(tag, 'src')));
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi))
    if (/\b(stylesheet|icon|apple-touch-icon|manifest|modulepreload|preload)\b/i.test(attr(tag, 'rel') || '')) want.add(own(attr(tag, 'href')));
  // (where the manifest says Mail opens; its own icons are asked for as it's added to the Home Screen, not as it opens)
  const manifest = [...want].find((f) => f && /\.webmanifest$|manifest\.json$/.test(f));
  assert.ok(manifest, 'the page names its manifest');
  want.add(own(JSON.parse(read(manifest.slice(1))).start_url || '/', manifest));
  // (what each script brings in, a module's imports among them, and the pictures and files Mail's script names by their
  // place; never the worker itself, which the browser keeps)
  const scripts = [...want].filter((f) => f?.endsWith('.js'));
  for (const s of scripts) {
    const src = read(s.slice(1));
    for (const [, a, b] of src.matchAll(/^\s*import\b[^'"]*["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/gm)) want.add(own(a || b, s));
    for (const [, u] of src.matchAll(/["'`](\/[\w.-]+\.(?:svg|png|jpe?g|webp|gif|ico|css|js|mjs|json|webmanifest|woff2?))["'`?]/g)) if (u !== '/sw.js') want.add(u);
  }
  // (and what each stylesheet brings in: another stylesheet, a font, a picture)
  for (const s of [...want].filter((f) => f?.endsWith('.css')))
    for (const [, a, b] of read(s.slice(1)).matchAll(/url\(\s*["']?([^"')\s]+)|@import\s+["']([^"']+)["']/g)) want.add(own(a || b, s));
  for (const f of ['/app.js', '/app.css', '/theme.js', '/manifest.webmanifest', '/icon.svg', '/icon-180.png', '/inflite.svg']) assert.ok(want.has(f), `found ${f}`);
  assert.deepEqual([...want].filter((f) => f && !FILES.includes(f)), [], 'loaded as Mail opens, but not kept for opening offline (sw.js FILES)');
  for (const f of FILES) assert.ok(existsSync(new URL(f === '/' ? 'index.html' : f.slice(1), pub)), `sw.js FILES: ${f} isn’t there`);
});

// One roof, stage 4 (spec §7; RB1, RB2): a message's frame at /body/ on InFlite's page is a page of Mail's address too,
// so Mail's worker sees it. Never kept as Mail's page, never answered with it; and a notice tapped goes to a window of
// Mail's own, never to such a frame (which doesn't listen), or to a new window.
test('a message frame at /body/ (or any page but Mail’s own) is left to the network: never kept as Mail’s page, never answered with it', { skip }, async () => {
  let down = false;
  const w = worker((path) => {
    if (down) throw new TypeError('Load failed');
    return Object.defineProperty(new Response(`fresh ${path}`, { status: 200 }), 'type', { value: 'basic' });
  });
  assert.equal(await (await w.get('/', 'navigate')).text(), 'fresh /');
  for (const p of ['/body/', '/body/#m=abc&t=light&img=0&p=https%3A%2F%2Finflite.ai', '/api/attachments/x', '/api/messages/x/raw', '/somewhere', '/body/body.js?v=1.49'])
    for (const mode of ['navigate', 'cors', 'no-cors']) if (mode === 'navigate' || p.startsWith('/body/')) assert.equal(await w.get(p, mode), null, `${mode} ${p}`);
  assert.deepEqual([...w.kept.keys()], ['/'], 'only Mail’s own page kept');
  assert.equal(await w.kept.get('/').clone().text(), 'fresh /');
  // (offline, a frame gets the browser's own error, not Mail's whole page)
  down = true;
  assert.equal(await w.get('/body/', 'navigate'), null);
  assert.equal(await (await w.get('/', 'navigate')).text(), 'fresh /');
});

test('Mail’s kept files are mail-app-2: the copies kept before (which a frame may have taken the place of) go as it takes over', { skip }, async () => {
  const w = worker(() => new Response('x'));
  assert.match(readFileSync(SW, 'utf8'), /\nconst SHELL = "mail-app-2";/);
  await w.send('activate', {});
  assert.deepEqual([...w.names].sort(), ['other-cache'], 'mail-app-1 dropped, another’s cache left alone');
});

test('a notice tapped: a window of Mail’s own (or Mail framed at InFlite’s /mail/), never a message frame at /body/; with none, a new window', { skip }, async () => {
  const tap = (w, data = { url: '/#thread=t1', thread: 't1' }, action = '') =>
    w.send('notificationclick', { notification: { data, close() {} }, action });
  const client = (url, frameType) => {
    const c = { url, frameType, focused: false, said: [], focus: async () => (c.focused = true), postMessage: (m) => c.said.push(m) };
    return c;
  };
  // (InFlite's page, a conversation open: its message frames are Mail's address too, nested)
  let w = worker(() => new Response('x'));
  const frames = [client('https://email.inflite.ai/body/#m=a', 'nested'), client('https://email.inflite.ai/body/#m=b', 'nested')];
  w.wins.push(...frames);
  await tap(w);
  assert.deepEqual(w.opened, ['https://email.inflite.ai/#thread=t1'], 'a new window of Mail’s');
  assert.ok(frames.every((f) => !f.focused && f.said.length === 0), 'no frame told');
  // (Mail open in a window of its own, beside them: that one)
  w = worker(() => new Response('x'));
  const own = client('https://email.inflite.ai/', 'top-level');
  w.wins.push(client('https://email.inflite.ai/body/#m=a', 'nested'), own);
  await tap(w, { url: '/#thread=t2', thread: 't2' }, 'reply');
  assert.deepEqual(w.opened, []);
  assert.equal(own.focused, true);
  assert.equal(JSON.stringify(own.said), JSON.stringify([{ open: 'https://email.inflite.ai/#thread=t2&reply=1' }]));
  // (another site's window: never)
  w = worker(() => new Response('x'));
  w.wins.push(client('https://inflite.ai/mail/', 'top-level'));
  await tap(w);
  assert.deepEqual(w.opened, ['https://email.inflite.ai/#thread=t1']);
  // (Mail's whole page framed at InFlite's /mail/, milestone 1, live while Mail's switch is off: Mail's own, and it
  // listens, so told as before, never a new window; the message frames beside it still never)
  w = worker(() => new Response('x'));
  const framedMail = client('https://email.inflite.ai/', 'nested');
  const bodies = [client('https://email.inflite.ai/body/#m=a', 'nested'), client('https://email.inflite.ai/body/#m=b', 'nested')];
  w.wins.push(bodies[0], framedMail, bodies[1]);
  await tap(w, { url: '/#thread=t3', thread: 't3' });
  assert.deepEqual(w.opened, []);
  assert.equal(framedMail.focused, true);
  assert.equal(JSON.stringify(framedMail.said), JSON.stringify([{ open: 'https://email.inflite.ai/#thread=t3' }]));
  assert.ok(bodies.every((f) => !f.focused && f.said.length === 0), 'no message frame told');
  // (and with Mail in a window of its own as well: that one first)
  w = worker(() => new Response('x'));
  const framed2 = client('https://email.inflite.ai/', 'nested'), top = client('https://email.inflite.ai/', 'top-level');
  w.wins.push(framed2, top);
  await tap(w);
  assert.ok(top.focused && top.said.length === 1 && !framed2.focused && framed2.said.length === 0, 'Mail’s own window before the framed one');
});
