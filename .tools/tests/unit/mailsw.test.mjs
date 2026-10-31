// Mail's service worker (the inflite repo's email/public/sw.js, where it's checked out beside this one), run here with
// what a browser gives it made up: its own files always from the network while there is one, from what it kept only with
// no answer (or Mail's host failing), never the API; and a notice for a device signed out elsewhere saying only that,
// with its notices stopped, while one whose sign-in can't be checked in time still shows, as a slow notice counts as
// none shown and the phone stops notices for a site that keeps doing that.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

const SW = new URL('../../../../inflite/email/public/sw.js', import.meta.url);
const skip = !existsSync(SW) && 'the inflite repo isn’t beside this one';

// (the worker, with a network (net: path → a Response, or a throw for no answer), a cache, and what it showed)
function worker(net) {
  const on = {}, kept = new Map(), shown = [], asked = [];
  let subscribed = true;
  const self = {
    location: { origin: 'https://email.inflite.ai' },
    addEventListener: (k, f) => (on[k] = f),
    skipWaiting: () => {},
    clients: { claim: async () => {} },
    navigator: { setAppBadge: async () => {}, clearAppBadge: async () => {} },
    registration: {
      showNotification: async (title, o) => shown.push({ title, ...o }),
      pushManager: { getSubscription: async () => (subscribed ? { unsubscribe: async () => (subscribed = false) } : null) },
    },
  };
  const caches = {
    open: async () => ({ match: async (k) => kept.get(k)?.clone() || undefined, put: async (k, r) => kept.set(k, r), addAll: async () => {} }),
    keys: async () => [],
    delete: async () => true,
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
  return { send, get, kept, shown, asked, subscribed: () => subscribed };
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
  // (offline: any page of Mail's opens as its one page, and its files with it)
  down = true;
  assert.equal(await (await w.get('/somewhere#thread=t1', 'navigate')).text(), 'fresh /');
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
