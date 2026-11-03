// Mail framed at inflite.ai/mail/ (Today First, spec §9.4; the inflite repo's today/src/mailhost.js and its page's
// script today/public/mailhost.js, where it's checked out beside this one): the host page's own rules (its own scripts
// and styles only, Mail's address the one thing it frames, framed by nothing, never indexed), built by the Worker and
// never fetched from the files; the code coming back from signing in handed into the frame only when it's a code, and
// taken out of the page's address; what Mail says heard only from the frame, at Mail's address, and only Back and Sign In
// (whose word's hash can't carry another part of an address); and Back to Apps going to /#apps, never history's back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = new URL('../../../../inflite/today/src/mailhost.js', import.meta.url);
const PAGE_JS = new URL('../../../../inflite/today/public/mailhost.js', import.meta.url);
const skip = !existsSync(SRC) && 'the inflite repo isn’t beside this one';
const { mailPage, HOST_CSS } = skip ? {} : await import(SRC);

const SITE = 'https://inflite.ai', MAIL = 'https://email.inflite.ai', AUTH = 'https://auth.inflite.ai';
// (the files, which the page must never be fetched from: a Worker answer's headers are its own)
const assets = [];
const env = (extra = {}) => ({ MAIL_ORIGIN: MAIL, AUTH_ORIGIN: AUTH, ASSETS: { fetch: async (r) => { assets.push(String(r.url || r)); return new Response('assets'); } }, ...extra });
const get = (path, init = {}, e = env()) => mailPage(new Request(SITE + path, { headers: { 'Sec-Fetch-Site': 'same-origin' }, ...init }), e);

test('the page: its own rules, every one of them, and built here, never from the files', { skip }, async () => {
  assets.length = 0;
  const res = await get('/mail/'), h = res.headers;
  assert.equal(res.status, 200);
  assert.equal(h.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(h.get('content-security-policy'),
    `default-src 'self'; script-src 'self'; style-src 'self'; frame-src ${MAIL}; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`);
  assert.equal(h.get('strict-transport-security'), 'max-age=63072000; includeSubDomains');
  assert.equal(h.get('x-content-type-options'), 'nosniff');
  assert.equal(h.get('cross-origin-opener-policy'), 'same-origin');
  assert.equal(h.get('referrer-policy'), 'no-referrer');
  assert.equal(h.get('x-robots-tag'), 'noindex');
  assert.equal(h.get('cache-control'), 'no-cache, private');
  assert.equal(h.get('set-cookie'), null);
  const html = await res.text();
  assert.deepEqual(assets, [], 'the files never asked');
  // (Back to Apps and Open Mail on Its Own in a bar, then the frame: Mail's, named for it, given its address by the
  // script, so Mail's loaded once, with the code if there is one)
  const frame = /<iframe\b[^>]*>/.exec(html)?.[0] || '';
  assert.match(frame, /\bname="ifl-mail"/);
  assert.match(frame, /\ballow="clipboard-write; web-share"/);
  assert.match(frame, /\btitle="Mail"/);
  assert.doesNotMatch(frame, /\bsrc=/, 'no address of its own: the script gives it Mail’s');
  assert.equal((html.match(/<iframe\b/g) || []).length, 1, 'one frame');
  assert.match(html, /<html lang="en-GB" data-mail="https:\/\/email\.inflite\.ai" data-auth="https:\/\/auth\.inflite\.ai">/);
  assert.match(html, /<button type="button" class="mh-back" aria-label="Back to Apps">/);
  assert.match(html, /<a class="mh-own" href="https:\/\/email\.inflite\.ai\/" target="_blank" rel="noopener">Open Mail on Its Own/);
  // (its own files only: no script or style written into the page, which its rules would refuse anyway)
  const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]);
  assert.deepEqual(scripts.map((s) => /src="([^"]+)"/.exec(s)?.[1]), ['/theme.js', '/mailhost.js']);
  assert.doesNotMatch(html, /<style\b|\sstyle=|\son[a-z]+=|javascript:/i);
  assert.match(html, /<link rel="stylesheet" href="\/mail\/host\.css">/);
  assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest">/);
  // (HEAD: the same, without the page)
  const head = await get('/mail/', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-security-policy'), h.get('content-security-policy'));
  assert.equal(await head.text(), '');
});

test('its other paths: /mail to /mail/, its look, nothing else, and only GET and HEAD', { skip }, async () => {
  assets.length = 0;
  const bare = await get('/mail?x=1');
  assert.equal(bare.status, 301);
  assert.equal(bare.headers.get('location'), '/mail/?x=1');
  for (const p of ['/mail/x', '/mail/index.html', '/mail/../app.js', '/mail//', '/mail/host.cs', '/mail/host.css/x']) {
    const r = await get(p);
    assert.equal(r.status, 404, p);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  }
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    const r = await get('/mail/', { method, body: method === 'DELETE' ? undefined : '{}' });
    assert.equal(r.status, 405, method);
    assert.equal(r.headers.get('allow'), 'GET, HEAD');
  }
  const css = await get('/mail/host.css');
  assert.equal(css.status, 200);
  assert.equal(css.headers.get('content-type'), 'text/css; charset=utf-8');
  assert.equal(css.headers.get('x-content-type-options'), 'nosniff');
  const text = await css.text();
  assert.equal(text, HOST_CSS);
  // (the hub's cross-fade asked for, as every page of the hub asks it, and room left for the Home indicator)
  assert.match(text, /@view-transition \{ navigation: auto; \}/);
  assert.match(text, /\.mh-frame \{[^}]*env\(safe-area-inset-bottom/);
  assert.match(text, /\.mh-bar \{[^}]*env\(safe-area-inset-top/);
  const tag = css.headers.get('etag');
  assert.ok(/^"mh-[0-9a-z]+"$/.test(tag), tag);
  const again = await get('/mail/host.css', { headers: { 'If-None-Match': tag } });
  assert.equal(again.status, 304);
  assert.equal(await again.text(), '');
  assert.deepEqual(assets, [], 'the files never asked');
});

test('without Mail’s address and the sign-in page’s (or with something that isn’t an address): not ready, and nothing framed', { skip }, async () => {
  for (const e of [{ MAIL_ORIGIN: undefined }, { AUTH_ORIGIN: undefined }, { MAIL_ORIGIN: 'https://email.inflite.ai/' }, { MAIL_ORIGIN: 'javascript:alert(1)' },
    { MAIL_ORIGIN: 'https://email.inflite.ai https://evil.example' }, { AUTH_ORIGIN: 'https://auth.inflite.ai/#x' }, { MAIL_ORIGIN: 'https://e"mail.inflite.ai' }]) {
    const r = await get('/mail/', {}, env(e));
    assert.equal(r.status, 503, JSON.stringify(e));
    assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.doesNotMatch(await r.text(), /<iframe/);
  }
});

// ---- the page's script, in a page made up for it ----
// (hash: the page's own #; kept: this tab's sessionStorage as the page opens (null: none to be had); answers what was
// done: the frame's address, addresses gone to, replaced, posted to the frame, said to the root worker, kept)
function page({ hash = '', mail = MAIL, auth = AUTH, kept = {} } = {}) {
  const did = { assigned: [], replaced: [], backs: 0, posted: [], listeners: {}, sw: {}, clicks: [], worker: [], docListeners: {} };
  const store = kept === null ? null : new Map(Object.entries(kept));
  const sessionStorage = store && { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const doc = { readyState: 'complete', visibilityState: 'visible' };
  // (what the page posts, made of this realm's objects, so it compares as plain data)
  const plain = (x) => JSON.parse(JSON.stringify(x));
  const frame = { src: '', contentWindow: { postMessage: (m, o) => did.posted.push([plain(m), o]) } };
  const back = { addEventListener: (t, f) => did.clicks.push(f) };
  const location = { origin: SITE, pathname: '/mail/', search: '', hash, assign: (u) => did.assigned.push(u) };
  // (the root worker's registration, as getRegistration("/") gives it: what it's told)
  const reg = { active: { postMessage: (m) => did.worker.push(plain(m)) } };
  const ctx = {
    document: Object.assign(doc, { documentElement: { dataset: { mail, auth } },
      querySelector: (s) => (s === 'iframe[name="ifl-mail"]' ? frame : s === '.mh-back' ? back : null), addEventListener: (t, f) => { (did.docListeners[t] ||= []).push(f); } }),
    location,
    history: { state: null, replaceState: (s, t, u) => { did.replaced.push(u); location.hash = ''; }, back: () => did.backs++, go: () => did.backs++ },
    navigator: { serviceWorker: { addEventListener: (t, f) => { did.sw[t] = f; }, getRegistration: (scope) => (did.scope = scope, { then: (ok) => ok(reg) }) } },
    addEventListener: (t, f) => { (did.listeners[t] ||= []).push(f); },
    URLSearchParams, URL,
  };
  if (store) ctx.sessionStorage = sessionStorage;
  else Object.defineProperty(ctx, 'sessionStorage', { get() { throw new Error('denied'); } });
  vm.runInNewContext(readFileSync(PAGE_JS, 'utf8'), ctx);
  did.kept = store;
  // (the page hidden, then back in sight)
  did.seen = (state) => { doc.visibilityState = state; for (const f of did.docListeners.visibilitychange || []) f(); };
  // (a message to the page, as from a window at an address)
  const hear = (data, { source = frame.contentWindow, origin = mail } = {}) => { for (const f of did.listeners.message || []) f({ data, source, origin }); };
  return { did, frame, hear, click: () => did.clicks.forEach((f) => f()), sw: (data) => { const port = []; did.sw.message?.({ data, ports: [{ postMessage: (m) => port.push(JSON.parse(JSON.stringify(m))) }] }); return port; } };
}
const CODE = 'Qx7_Lm2-Rt9kVb3nWp5sYc8dZf1gHj4K';

test('the code coming back from signing in: into the frame’s address when it’s a code, out of the page’s at once', { skip }, () => {
  // (as the sign-in page sends it: the code, then its hint of who's coming, which Mail doesn't take)
  const back = page({ hash: `#signin=${CODE}&f=G&p=abc_def-123` });
  assert.equal(back.frame.src, `${MAIL}/#signin=${CODE}`);
  assert.deepEqual(back.did.replaced, ['/mail/'], 'taken out of the page’s address, so a reload never hands it in again');
  const plain = page();
  assert.equal(plain.frame.src, `${MAIL}/`, 'none: Mail as it is');
  assert.deepEqual(plain.did.replaced, []);
  for (const hash of ['#signin=short', `#signin=${'a'.repeat(129)}`, '#signin=abc%26back%3Dhttps%3A%2F%2Fevil.example%2F1234567', `#signin=${CODE.slice(0, 20)}<b>x`,
    `#signin=${CODE.slice(0, 20)}%20x`, `#thread=${CODE}`, '#signin=', `#x=1&signin=${CODE}#2`]) {
    const p = page({ hash });
    assert.equal(p.frame.src, `${MAIL}/`, `${hash}: no code handed in`);
    assert.deepEqual(p.did.replaced, ['/mail/'], `${hash}: taken out all the same`);
  }
  // (a code anywhere in the hash's parts, as Mail itself reads it, is still a code)
  assert.equal(page({ hash: `#f=G&signin=${CODE}` }).frame.src, `${MAIL}/#signin=${CODE}`);
  assert.equal(page({ hash: `#signin=${'a'.repeat(128)}` }).frame.src, `${MAIL}/#signin=${'a'.repeat(128)}`, '128 characters at most');
  // (no Mail's address on the page: nothing framed at all)
  assert.equal(page({ mail: 'https://email.inflite.ai/x' }).frame.src, '');
});

test('what Mail says: only from the frame, at Mail’s address; only Back, Sign In with a word’s hash, and hello', { skip }, () => {
  const ASK = 'n4bQgYhMLqsPy5k9sA2FbvO0H3NWdF7Z8xJcU1ePtRw';
  const back = encodeURIComponent(`${SITE}/mail/`);
  let p = page();
  p.hear({ ifl: 'signin', ask: ASK });
  assert.deepEqual(p.did.assigned, [`${AUTH}/#signin=mail&ask=${ASK}&back=${back}`], 'Sign In: the whole window to the sign-in page, back to /mail/');
  p = page();
  p.hear({ ifl: 'back' });
  assert.deepEqual(p.did.assigned, ['/#apps'], 'Back: to Apps');
  p = page();
  p.hear({ ifl: 'hello', v: 1 });
  assert.deepEqual(p.did.posted, [[{ ifl: 'hello', v: 1 }, MAIL]], 'hello: answered the same, to Mail’s address alone');
  assert.deepEqual(p.did.assigned, []);
  // (from anywhere else, or anything else: nothing)
  p = page();
  const other = { postMessage() {} };
  p.hear({ ifl: 'back' }, { source: other });
  p.hear({ ifl: 'signin', ask: ASK }, { source: other });
  p.hear({ ifl: 'back' }, { origin: 'https://evil.example' });
  p.hear({ ifl: 'back' }, { origin: SITE });
  p.hear({ ifl: 'signin', ask: ASK }, { origin: 'https://email.inflite.ai.evil.example' });
  p.hear({ ifl: 'hello', v: 1 }, { source: other });
  p.hear({ ifl: 'hello', v: 2 });
  for (const ask of [`${ASK.slice(0, 20)}&back=https://evil.example/`, 'x'.repeat(15), 'x'.repeat(65), `${ASK.slice(0, 30)}#x`, `${ASK.slice(0, 30)}%26`, `${ASK.slice(0, 30)} x`, 42, null, ['a'.repeat(43)], { toString: () => ASK }])
    p.hear({ ifl: 'signin', ask });
  for (const data of ['back', null, 7, { ifl: 'open', url: '/chats/' }, { ifl: 'go', to: '/x' }, { ifl: 'signin' }]) p.hear(data);
  assert.deepEqual(p.did.assigned, [], 'nothing gone to');
  assert.deepEqual(p.did.posted, [], 'nothing said back');
});

test('Back to Apps: /#apps, never history’s own back (Mail keeps history of its own)', { skip }, () => {
  const p = page();
  p.click();
  assert.deepEqual(p.did.assigned, ['/#apps']);
  assert.equal(p.did.backs, 0);
  const src = readFileSync(PAGE_JS, 'utf8');
  assert.doesNotMatch(src.replace(/^\s*\/\/.*$/gm, ''), /history\.(back|go)\s*\(/);
});

test('a notification tapped while Mail’s page is open: gone to in this window, a path of this site’s only, and said heard', { skip }, () => {
  let p = page({ kept: { 'ifl-crumb': '/#apps', 'ifl-hub-ready': '1' } });
  assert.deepEqual(p.sw({ ifl: 'open', url: '/chats/#open=abc' }), [{ ifl: 'opened' }]);
  assert.deepEqual(p.did.assigned, ['/chats/#open=abc']);
  // (this page the breadcrumb, so the chat it opens comes Back here, not to where this page was opened from)
  assert.equal(p.did.kept.get('ifl-crumb'), '/mail/', 'the breadcrumb: this page');
  for (const kept of [{}, { 'ifl-hub-ready': '1' }]) {
    p = page({ kept });
    assert.deepEqual(p.sw({ ifl: 'open', url: '/weather/#radar' }), [{ ifl: 'opened' }], JSON.stringify(kept));
    assert.deepEqual(p.did.assigned, ['/weather/#radar']);
    assert.equal(p.did.kept.get('ifl-crumb'), '/mail/');
  }
  // (this same page: no breadcrumb of itself)
  p = page({ kept: { 'ifl-crumb': '/#apps' } });
  assert.deepEqual(p.sw({ ifl: 'open', url: '/mail/' }), [{ ifl: 'opened' }]);
  assert.equal(p.did.kept.get('ifl-crumb'), '/#apps');
  // (no sessionStorage to be had: gone to all the same)
  p = page({ kept: null });
  assert.deepEqual(p.sw({ ifl: 'open', url: '/chats/#open=abc' }), [{ ifl: 'opened' }]);
  assert.deepEqual(p.did.assigned, ['/chats/#open=abc']);
  for (const url of ['//evil.example/', 'https://evil.example/', '/\\evil.example', '/x\n/y', 'chats', `/${'x'.repeat(200)}`, 7]) {
    p = page();
    assert.deepEqual(p.sw({ ifl: 'open', url }), [], String(url));
    assert.deepEqual(p.did.assigned, [], String(url));
  }
  p = page();
  p.sw({ open: '/x' });
  assert.deepEqual(p.did.assigned, []);
});

test('the hub not serving the apps’ pages this visit (Today’s word, “ifl-hub-ready” 0): a notification not heard here, so the root worker opens it its own way', { skip }, () => {
  // (this page is served before the hub's key is set, the apps' pages aren't: the worker, hearing nothing within its
  // second, sends the tap through Today, /#go=…, to the app's own address)
  for (const url of ['/chats/#open=abc', '/weather/', '/']) {
    const p = page({ kept: { 'ifl-hub-ready': '0', 'ifl-crumb': '/#apps' } });
    assert.deepEqual(p.sw({ ifl: 'open', url }), [], `${url}: not said heard`);
    assert.deepEqual(p.did.assigned, [], `${url}: not gone to`);
    assert.equal(p.did.kept.get('ifl-crumb'), '/#apps', `${url}: no breadcrumb`);
  }
});

test('the Home Screen icon’s badge: counted again by the root worker as the page opens, and each time it’s back in sight', { skip }, () => {
  const p = page();
  assert.equal(p.did.scope, '/', 'the root worker’s registration');
  assert.deepEqual(p.did.worker, [{ ifl: 'badge' }], 'as the page opens');
  p.did.seen('hidden');
  assert.deepEqual(p.did.worker, [{ ifl: 'badge' }], 'not as it’s hidden');
  p.did.seen('visible');
  assert.deepEqual(p.did.worker, [{ ifl: 'badge' }, { ifl: 'badge' }], 'and again as it’s back in sight');
});

test('the hub’s cross-fade into the page and out of it: one that can’t be done is let go without a word', { skip }, async () => {
  const p = page();
  for (const type of ['pageswap', 'pagereveal']) {
    assert.equal(p.did.listeners[type]?.length, 1, type);
    let caught = 0;
    const no = () => ({ catch: () => { caught++; } });
    p.did.listeners[type][0]({ viewTransition: { ready: no(), finished: no(), updateCallbackDone: no() } });
    assert.equal(caught, 3, type);
    p.did.listeners[type][0]({});
  }
});
