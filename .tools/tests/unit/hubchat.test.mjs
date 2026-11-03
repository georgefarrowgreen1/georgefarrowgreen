// Chat's hub copy (functions/_app.js, functions/_middleware.js; spec §3.4): Chat's own files as inflite.ai/chats/ has
// them, every /pigeon/ said as /chats/ and the API's address kept; and everything Chat sends anywhere else exactly as
// before (atRoot and serveApp without options, byte for byte). Each copy keeps its own fingerprints (the old address,
// the new one, the hub's), so one copy of the server serving all three gives each its own ?v=. The hub copy (/_hub/) is
// only at Chat's own address and only for the hub (its key, which makes X-Hub-Ok): never at localhost, a preview, the
// home page or another app's address, nor asked for straight. Its pages may be framed by the hub's own pages alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { atRoot, SECURITY, HUB_SECURITY } from '../../../functions/_app.js';
import { onRequest } from '../../../functions/_middleware.js';

const ROOT = new URL('../../../', import.meta.url);
const KEY = 'hub-key-0123456789abcdef';
// (atRoot as it was before the hub: the reference every copy but the hub's must still match)
const atRootBefore = (text) => text.replace(/(?<![\w.-])\/pigeon\//g, '/');
const TYPES = { js: 'text/javascript', css: 'text/css', html: 'text/html; charset=utf-8', webmanifest: 'application/manifest+json', png: 'image/png', svg: 'image/svg+xml' };
const store = () => ({ async fetch(req) {
  let path = new URL(req.url ?? req).pathname; if (path.endsWith('/')) path += 'index.html';
  const file = new URL('.' + path, ROOT);
  if (!existsSync(file)) return new Response('not here', { status: 404 });
  return new Response(readFileSync(file), { headers: { 'content-type': TYPES[path.split('.').pop()] || 'application/octet-stream', etag: '"x"' } });
} });
const CHAT_FILES = readdirSync(new URL('pigeon/', ROOT)).filter((f) => /\.(js|css|html|webmanifest)$/.test(f));
const APP_VERSION = /const APP_VERSION = "([\d.]+)"/.exec(readFileSync(new URL('pigeon/app.js', ROOT), 'utf8'))[1];

test('atRoot(text) is byte for byte what it was; atRoot(text, "/chats/") says every /pigeon/ path as /chats/ and keeps the API’s', () => {
  const samples = CHAT_FILES.map((f) => readFileSync(new URL(`pigeon/${f}`, ROOT), 'utf8'));
  samples.push('"/pigeon/app.js" /api/pigeon/sync https://georgefarrowgreen.com/pigeon/ x.pigeon/ my-pigeon/ /pigeon/pigeon/ (/pigeon/) url(/pigeon/i.png)');
  let paths = 0;
  for (const text of samples) {
    assert.equal(atRoot(text), atRootBefore(text));
    assert.equal(atRoot(text, '/'), atRootBefore(text));
    const hub = atRoot(text, '/chats/');
    assert.doesNotMatch(hub, /(?<![\w.-])\/pigeon\//, 'no /pigeon/ path left');
    assert.equal((hub.match(/\/api\/pigeon\//g) || []).length, (text.match(/\/api\/pigeon\//g) || []).length, 'every /api/pigeon/ kept');
    assert.equal(hub.replaceAll('/chats/', '/'), atRootBefore(text).replaceAll('/chats/', '/'), 'and nothing else changed');
    paths += (text.match(/(?<![\w.-])\/pigeon\//g) || []).length;
  }
  assert.ok(paths > 20, 'Chat’s files say /pigeon/ often enough to tell');
  assert.equal(atRoot('/pigeon/x /api/pigeon/y', '/chats/'), '/chats/x /api/pigeon/y');
});

test('HUB_SECURITY is Chat’s own, framed by the hub’s own pages and nothing else', () => {
  assert.deepEqual(Object.keys(HUB_SECURITY).sort(), Object.keys(SECURITY).sort());
  for (const [k, v] of Object.entries(SECURITY)) if (k !== 'Content-Security-Policy' && k !== 'X-Frame-Options') assert.equal(HUB_SECURITY[k], v, k);
  assert.equal(HUB_SECURITY['X-Frame-Options'], 'SAMEORIGIN');
  assert.equal(HUB_SECURITY['Content-Security-Policy'], SECURITY['Content-Security-Policy'].replace("frame-ancestors 'none'", "frame-ancestors 'self'"));
  assert.match(HUB_SECURITY['Content-Security-Policy'], /frame-ancestors 'self';/);
  assert.match(SECURITY['Content-Security-Policy'], /frame-ancestors 'none';/, 'everywhere else, as before: never framed');
  assert.equal(SECURITY['X-Frame-Options'], 'DENY');
});

// (the files as served by one copy of the server: each import a fresh module, so its own fingerprints)
async function served(mod, files, { host = 'https://chat.inflite.ai', chat = true, opts } = {}) {
  const { serveApp } = mod, { assets } = await import('../../../functions/_min.js'), env = { ASSETS: store() }, out = [];
  for (const f of files) {
    const path = '/pigeon/' + f, request = new Request(host + '/' + f), res = await assets(env).fetch(new Request(new URL(path, request.url), request));
    const answer = opts === undefined ? await serveApp({ request, env }, res, path, chat) : await serveApp({ request, env }, res, path, chat, opts);
    out.push({ f, status: answer.status, headers: [...answer.headers].sort(), body: await answer.text() });
  }
  return out;
}
const FILES = ['', 'index.html', 'tracker.html', 'app.js', 'styles.css', 'sw.js', 'manifest.webmanifest', 'icon-192.png', 'nothing-here.js'];

test('serveApp without options sends what it always sent, at either address', async () => {
  const fresh = () => import(`../../../functions/_app.js?${Math.random()}`);
  // (Chat's file before the hub, where this checkout has its history: its last change before, 3afb0b3)
  let before = null, dir = null;
  try {
    const old = execFileSync('git', ['-C', ROOT.pathname, 'show', '3afb0b3:functions/_app.js'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    dir = mkdtempSync(`${tmpdir()}/hubchat-`);
    writeFileSync(`${dir}/app.mjs`, old.replace('"./_sites.js"', JSON.stringify(new URL('functions/_sites.js', ROOT).href)).replace('"./_min.js"', JSON.stringify(new URL('functions/_min.js', ROOT).href)));
    before = () => import(pathToFileURL(`${dir}/app.mjs`).href + `?${Math.random()}`);
  } catch (_) { /* (a shallow checkout: the defaults checked against themselves below) */ }
  try {
    for (const chat of [true, false]) {
      const host = chat ? 'https://chat.inflite.ai' : 'http://localhost:8788/pigeon';
      const now = await served(await fresh(), FILES, { host, chat });
      assert.deepEqual(await served(await fresh(), FILES, { host, chat, opts: {} }), now, `chat ${chat}: {} is no options`);
      assert.deepEqual(await served(await fresh(), FILES, { host, chat, opts: { base: '/', security: SECURITY } }), now, `chat ${chat}: the defaults are no options`);
      if (before) assert.deepEqual(await served(await before(), FILES, { host, chat }), now, `chat ${chat}: byte for byte as before the hub`);
      const page = now.find((x) => x.f === '');
      assert.equal(page.status, 200); assert.match(page.body, /<meta name="inflight-version" content="[0-9a-f]{12}"/);
      assert.equal(new Map(page.headers).get('cache-control'), 'no-store');
      if (chat) assert.doesNotMatch(page.body, /(?<![\w.-])\/pigeon\//);
    }
  } finally { if (dir) rmSync(dir, { recursive: true, force: true }); }
});

test('one copy of the server, serving the same file as the old address, the new one and the hub’s, gives each its own ?v=, each its own file', async () => {
  const mod = await import(`../../../functions/_app.js?${Math.random()}`);
  const kinds = [['old', { host: 'http://localhost:8788/pigeon', chat: false }], ['new', { host: 'https://chat.inflite.ai', chat: true }],
    ['hub', { host: 'https://chat.inflite.ai/_hub', chat: true, opts: { base: '/chats/', security: HUB_SECURITY } }]];
  const stamps = {};
  // (asked for in turn, and again, from the same copy: whichever comes first, none takes another's)
  for (const round of [0, 1]) for (const [name, o] of round ? [...kinds].reverse() : kinds) {
    const [page] = await served(mod, [''], o);
    const v = /"(?:\/pigeon\/|\/chats\/|\/)app\.js\?v=([0-9a-f]{12})"/.exec(page.body)?.[1];
    assert.ok(v, `${name}: app.js stamped`);
    if (round) assert.equal(v, stamps[name], `${name}: the same stamp each time`); else stamps[name] = v;
    const [file] = await served(mod, [`app.js?v=${v}`].map((f) => f), o);
    const [js] = await served(mod, ['app.js'], o);
    assert.equal(file.status, 200);
    // (kept for good only when what's sent is what that stamp says: so each stamp is its own copy's)
    const { serveApp } = mod, env = { ASSETS: store() }, { assets } = await import('../../../functions/_min.js');
    const request = new Request(`${o.host}/app.js?v=${v}`), res = await assets(env).fetch(new Request(new URL('/pigeon/app.js', request.url), request));
    const kept = await (o.opts ? serveApp({ request, env }, res, '/pigeon/app.js', o.chat, o.opts) : serveApp({ request, env }, res, '/pigeon/app.js', o.chat));
    assert.match(kept.headers.get('cache-control'), /immutable/, `${name}: its own stamp is its own file’s`);
    if (name === 'hub') assert.doesNotMatch(js.body, /(?<![\w.-])\/pigeon\//);
  }
  assert.equal(new Set(Object.values(stamps)).size, 3, `three copies, three stamps: ${JSON.stringify(stamps)}`);
});

// (a request as Pages hands it to the site's middleware)
const ask = async (url, { headers = {}, env = {}, method = 'GET' } = {}) => {
  const request = new Request(url, { method, headers });
  const res = await onRequest({ request, env: { ASSETS: store(), HUB_KEY: KEY, ...env }, next: async () => new Response('the site’s own', { headers: { 'Content-Type': 'text/html' } }), waitUntil() {}, params: {}, data: {} });
  return { res, text: await res.text() };
};
const HUB = { 'X-Hub-Key': KEY, 'X-Hub-IP': '203.0.113.9' };

test('the hub copy is at Chat’s own address, for the hub alone: /chats/ for /pigeon/, framed by the hub’s pages only', async () => {
  for (const p of ['/_hub/', '/_hub/index.html', '/_hub/tracker.html']) {
    const { res, text } = await ask('https://chat.inflite.ai' + p, { headers: HUB });
    assert.equal(res.status, 200, p);
    assert.match(text, /<meta name="inflight-version"/, p);
    assert.doesNotMatch(text, /(?<![\w.-])\/pigeon\//, `${p}: its paths at /chats/`);
    assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'self'/, p);
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN', p);
  }
  const page = (await ask('https://chat.inflite.ai/_hub/', { headers: HUB })).text;
  assert.match(page, /"\/chats\/app\.js\?v=[0-9a-f]{12}"/);
  assert.match(page, /"\/chats\/manifest\.webmanifest"/);
  const js = await ask('https://chat.inflite.ai/_hub/app.js', { headers: HUB });
  assert.equal(js.res.status, 200); assert.match(js.text, /\/api\/pigeon\//, 'the API where it always is'); assert.doesNotMatch(js.text, /(?<![\w.-])\/pigeon\//);
  // (the tests' Chat address too, as server.sh names it)
  const local = await ask('http://chat.ifl.test:8788/_hub/', { headers: HUB, env: { CHAT_HOST: 'chat.localhost,chat.ifl.test' } });
  assert.equal(local.res.status, 200);
  // (and Chat at its own address, beside it, as before)
  const own = await ask('https://chat.inflite.ai/');
  assert.equal(own.res.status, 200); assert.match(own.text, /"\/app\.js\?v=/); assert.match(own.res.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(own.res.headers.get('x-frame-options'), 'DENY');
  for (const p of ['/_hub/handover', '/_hub/handover.html', '/_hub/nothing.js', '/_hub']) assert.equal((await ask('https://chat.inflite.ai' + p, { headers: HUB })).res.status, 404, p);
});

test('the hub copy is nothing anywhere else, or asked for straight: localhost, a preview, the home page, another app, no key, a wrong one', async () => {
  const nowhere = async (url, headers, env) => { const { res, text } = await ask(url, { headers, env }); assert.equal(res.status, 404, `${url} ${JSON.stringify(headers)}`); assert.doesNotMatch(text, /inflight-version/); };
  for (const url of ['http://localhost:8788/_hub/', 'http://localhost:8788/_hub/app.js', 'https://georgefarrowgreen.pages.dev/_hub/', 'https://abc123.georgefarrowgreen.pages.dev/_hub/',
    'https://georgefarrowgreen.com/_hub/', 'https://chat.georgefarrowgreen.com/_hub/', 'https://weather.inflite.ai/_hub/', 'https://fitness.inflite.ai/_hub/', 'https://finance.inflite.ai/_hub/',
    'https://account.inflite.ai/_hub/', 'https://auth.inflite.ai/_hub/', 'https://inflite.ai/_hub/', 'http://chat.localhost:8788/_hub/x'])
    await nowhere(url, HUB);
  for (const headers of [{}, { 'X-Hub-Key': 'wrong-key-0123456789abcd' }, { 'X-Hub-Key': KEY.slice(0, -1) }, { 'X-Hub-Key': KEY + 'x' }, { 'X-Hub-Ok': '1' }, { 'X-Hub-Ok': '1', 'X-Hub-Key': '' },
    { 'X-Hub-Key': 'undefined' }])
    await nowhere('https://chat.inflite.ai/_hub/', headers);
  // (and with no key set on the server, whatever's sent)
  await nowhere('https://chat.inflite.ai/_hub/', { 'X-Hub-Key': 'undefined', 'X-Hub-Ok': '1' }, { HUB_KEY: undefined });
  await nowhere('https://chat.inflite.ai/_hub/', { 'X-Hub-Key': '' }, { HUB_KEY: '' });
});

test('/_hub/version gives Chat’s own version, for the hub alone', async () => {
  const { res, text } = await ask('https://chat.inflite.ai/_hub/version', { headers: HUB });
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(text), { app: 'chat', build: APP_VERSION, min: null });
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal((await ask('https://chat.inflite.ai/_hub/version')).res.status, 404);
  assert.equal((await ask('http://localhost:8788/_hub/version', { headers: HUB })).res.status, 404);
});
