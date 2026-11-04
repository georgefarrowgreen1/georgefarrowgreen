// Chats served for InFlite's one page (One roof stage 3, s3 spec S3-D1, S3-D8, §6.4; this repo's functions/_app.js,
// functions/_middleware.js and the /pigeon/in/ block of pigeon/app.js): files under /pigeon/roof/ have Chat's own files
// they share stamped ("../x.js") and their Worker's (new URL("./x.js", import.meta.url)), each with the fingerprint that
// file is then kept for good under; every other file is sent byte for byte as before stage 3, at each of Chat's
// addresses; an import cycle under /roof/ never hangs the server. Chat's own page at inflite.ai/chats/in/ is /_hub/in/
// here: the same page as /_hub/'s, with its files (inflite.svg, version) /_hub/'s. And at that page alone, Chat
// registers no worker, goes back to /chats/ once signed in with nowhere else to go, and found signed in with no sign-in
// under way goes on to /chats/ with its link.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { atRoot, HUB_SECURITY } from '../../../functions/_app.js';
import { onRequest } from '../../../functions/_middleware.js';
import { assets as minAssets } from '../../../functions/_min.js';

const ROOT = new URL('../../../', import.meta.url);
const KEY = 'hub-key-0123456789abcdef', HUB = { 'X-Hub-Key': KEY, 'X-Hub-IP': '203.0.113.9' };
const TYPES = { js: 'text/javascript', css: 'text/css', html: 'text/html; charset=utf-8', webmanifest: 'application/manifest+json', png: 'image/png', svg: 'image/svg+xml' };
// (Pages' store: the site's files, with made-up ones laid over them: { '/pigeon/roof/x.js': '…' })
const store = (over = {}) => ({ asked: [], async fetch(req) {
  let path = new URL(req.url ?? req).pathname; if (path.endsWith('/')) path += 'index.html';
  this.asked.push(path);
  const type = { 'content-type': TYPES[path.split('.').pop()] || 'application/octet-stream', etag: '"x"' };
  if (over[path] != null) return new Response(over[path], { headers: type });
  const file = new URL('.' + path, ROOT);
  if (!existsSync(file) || path.includes('..')) return new Response('not here', { status: 404 });
  return new Response(readFileSync(file), { headers: type });
} });
const KINDS = { old: { host: 'http://localhost:8788/pigeon', chat: false }, new: { host: 'https://chat.inflite.ai', chat: true },
  hub: { host: 'https://chat.inflite.ai/_hub', chat: true, opts: { base: '/chats/', security: HUB_SECURITY } } };
const fresh = () => import(`../../../functions/_app.js?${Math.random()}`);
// (one file as one copy of the server sends it: f relative to /pigeon/, with any query)
async function serve(mod, f, kind, env) {
  const o = KINDS[kind], u = new URL(`${o.host}/${f}`), path = '/pigeon/' + f.split('?')[0];
  const request = new Request(u), res = await minAssets(env).fetch(new Request(new URL(path, request.url), request));
  const out = o.opts ? await mod.serveApp({ request, env }, res, path, o.chat, o.opts) : await mod.serveApp({ request, env }, res, path, o.chat);
  return { status: out.status, headers: [...out.headers].sort(), cache: out.headers.get('cache-control'), body: await out.text() };
}
const within = (p, ms, what) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(`${what}: no answer in ${ms} ms`)), ms))]);

// ---- standalone: byte for byte as before stage 3 ----
// (functions/_app.js as stage 3 found it, from this checkout's history: its last change before, 6542024. Where that
// isn't here (a shallower clone), the check against it is skipped, and said to be, never passed)
const OLD = (() => { try { return execFileSync('git', ['-C', ROOT.pathname, 'show', '6542024:functions/_app.js'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString(); } catch (_) { return null; } })();
const CHAT_FILES = ['', 'index.html', 'tracker.html', ...readdirSync(new URL('pigeon/', ROOT)).filter((f) => /\.(js|css|webmanifest)$/.test(f))];

test('every one of Chat’s files outside /roof/ is sent byte for byte as before stage 3, at the old address, the new one and the hub’s (functions/_app.js at 6542024)', { skip: !OLD && 'no 6542024 in this checkout (a shallow clone): not proved here' }, async () => {
  const dir = mkdtempSync(`${tmpdir()}/roofchatserve-`);
  try {
    writeFileSync(`${dir}/app.mjs`, OLD.replace('"./_sites.js"', JSON.stringify(new URL('functions/_sites.js', ROOT).href)).replace('"./_min.js"', JSON.stringify(new URL('functions/_min.js', ROOT).href)));
    const before = await import(pathToFileURL(`${dir}/app.mjs`).href), now = await fresh();
    let n = 0;
    for (const kind of Object.keys(KINDS)) for (const f of CHAT_FILES) {
      const a = await serve(before, f, kind, { ASSETS: store() }), b = await serve(now, f, kind, { ASSETS: store() });
      assert.deepEqual(b, a, `${kind} ${f || '/'}: as before`);
      // (and again, stamped as the page names it: kept for good as before)
      const v = /\?v=([0-9a-f]{12})/.exec(a.body)?.[1];
      if (f === 'app.js') assert.ok(v, 'app.js imports stamped');
      n++;
    }
    assert.ok(n > 60, `${n} files`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- /roof/: ../ and new URL stamped ----
const ROOFED = {
  '/pigeon/roof/a.js': [
    'import { b } from "./b.js";',
    'import { linkParts } from "../links.js";',
    'export * from "../digest.js";',
    'const rank = () => import("../rank.js");',
    'const later = (q) => import("./lazy.js" + q);',
    'const core = new URL("./core.js", import.meta.url);',
    'const also = new URL( "../crypto.js" , import.meta.url );',
    'const notMeta = new URL("./b.js", location.href);',
    'const gone = import("../../functions/_app.js");',
    'const nope = import("../nothing-here.js");',
    'const css = "../cards.css";',
    'import { a } from "./a.js";',
  ].join('\n'),
  '/pigeon/roof/b.js': 'export const b = 1; import("./c.js");',
  '/pigeon/roof/c.js': 'import { b } from "./b.js"; export const c = b;',
  '/pigeon/roof/lazy.js': 'export const lazy = 1;',
  '/pigeon/roof/core.js': 'import("../rank.js"); export const core = 1;',
};

test('/roof/ files: "./", "../" and new URL(…, import.meta.url) stamped with the file’s own fingerprint as sent (kept for good under it); never outside Chat’s files, nor one that isn’t there, nor itself; a cycle answered, not waited for', async () => {
  for (const kind of ['hub', 'new', 'old']) {
    const mod = await fresh(), env = { ASSETS: store(ROOFED) };
    const a = await within(serve(mod, 'roof/a.js', kind, env), 3000, `${kind} a.js`);
    assert.equal(a.status, 200);
    const stamp = (rel) => new RegExp(`"${rel.replace(/\./g, '\\.')}\\?v=([0-9a-f]{12})"`).exec(a.body)?.[1];
    for (const rel of ['./b.js', '../links.js', '../digest.js', '../rank.js', './lazy.js', './core.js', '../crypto.js']) {
      const v = stamp(rel);
      assert.ok(v, `${kind}: ${rel} stamped`);
      // (that file, asked as stamped: sent kept for good, so the stamp is its own as sent)
      const to = new URL(rel, 'https://x/pigeon/roof/a.js').pathname.slice('/pigeon/'.length);
      const got = await within(serve(mod, `${to}?v=${v}`, kind, env), 3000, to);
      assert.equal(got.status, 200, to); assert.match(got.cache, /immutable/, `${kind}: ${to} at its stamp is kept for good`);
    }
    assert.match(a.body, /import\("\.\/lazy\.js\?v=[0-9a-f]{12}" \+ q\)/, 'fw.lazy’s form: the stamp before the retry query');
    assert.match(a.body, /new URL\( "\.\.\/crypto\.js\?v=[0-9a-f]{12}" , import\.meta\.url \)/);
    assert.match(a.body, /new URL\("\.\/b\.js", location\.href\)/, 'only import.meta.url’s');
    assert.match(a.body, /import\("\.\.\/\.\.\/functions\/_app\.js"\)/, 'outside Chat’s files: as written');
    assert.match(a.body, /import\("\.\.\/nothing-here\.js"\)/, 'one that isn’t there: as written');
    assert.match(a.body, /"\.\.\/cards\.css"/, 'a string that isn’t an import: as written');
    assert.match(a.body, /from "\.\/a\.js";/, 'itself: as written');
    // (b ↔ c import each other: answered both ways round, each with the other stamped where it can be)
    const b = await within(serve(await fresh(), 'roof/b.js', kind, { ASSETS: store(ROOFED) }), 3000, 'b.js');
    assert.match(b.body, /import\("\.\/c\.js\?v=[0-9a-f]{12}"\)/);
    const c = await within(serve(await fresh(), 'roof/c.js', kind, { ASSETS: store(ROOFED) }), 3000, 'c.js');
    assert.match(c.body, /from "\.\/b\.js\?v=[0-9a-f]{12}"/);
    if (kind === 'hub') assert.doesNotMatch(a.body, /(?<![\w.-])\/pigeon\//);
  }
});

test('Chats’ own module files (pigeon/roof/): service.js’s Worker and every import stamped at the hub, each kept for good at its stamp', async () => {
  const dir = new URL('pigeon/roof/', ROOT);
  if (!existsSync(dir)) return;
  const mod = await fresh(), env = { ASSETS: store() };
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const got = await within(serve(mod, `roof/${f}`, 'hub', env), 5000, f);
    assert.equal(got.status, 200, f);
    // (the file's code, its comments left out: a minified copy, as sent, has none, so an import named in one is never a real one)
    const raw = readFileSync(new URL(f, dir), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const rels = [...raw.matchAll(/\b(?:from\s*|import\()"(\.\.?\/[\w./-]+\.js)"|\bnew URL\(\s*"(\.\.?\/[\w./-]+\.js)"\s*,\s*import\.meta\.url\s*\)/g)].map((m) => m[1] || m[2]);
    for (const rel of rels) {
      const to = new URL(rel, `https://x/pigeon/roof/${f}`).pathname;
      if (!existsSync(new URL('.' + to, ROOT)) || to === `/pigeon/roof/${f}`) continue;
      const v = new RegExp(`"${rel.replace(/\./g, '\\.')}\\?v=([0-9a-f]{12})"`).exec(got.body)?.[1];
      assert.ok(v, `${f}: ${rel} stamped`);
    }
  }
  const svc = await serve(mod, 'roof/service.js', 'hub', env);
  const v = /new URL\("\.\/core\.js\?v=([0-9a-f]{12})",\s*import\.meta\.url\)/.exec(svc.body)?.[1];
  assert.ok(v, 'the core Worker’s address stamped');
  assert.match((await serve(mod, `roof/core.js?v=${v}`, 'hub', env)).cache, /immutable/, 'so core.js is kept for good');
  assert.equal((await serve(mod, 'roof/core.js', 'hub', env)).cache, 'no-store', 'and plain, never kept');
});

// ---- /_hub/in/: Chat's own page at inflite.ai/chats/in/ ----
const ask = async (url, { headers = {}, env = {} } = {}) => {
  const request = new Request(url, { headers });
  const res = await onRequest({ request, env: { ASSETS: store(), HUB_KEY: KEY, ...env }, next: async () => new Response('the site’s own', { headers: { 'Content-Type': 'text/html' } }), waitUntil() {}, params: {}, data: {} });
  return { res, text: await res.text() };
};

test('/_hub/in/ is Chat’s page as /_hub/’s, and every file under it /_hub/’s (inflite.svg, version); for the hub alone; nothing else at /_hub/ changed', async () => {
  const page = await ask('https://chat.inflite.ai/_hub/', { headers: HUB });
  for (const p of ['/_hub/in/', '/_hub/in/index.html']) {
    const { res, text } = await ask('https://chat.inflite.ai' + p, { headers: HUB });
    assert.equal(res.status, 200, p);
    assert.equal(text, page.text, `${p}: the page /_hub/ sends`);
    assert.deepEqual([...res.headers].sort(), [...page.res.headers].sort(), `${p}: with its headers`);
    assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'self'/);
    assert.equal(res.headers.get('cache-control'), 'no-store');
  }
  for (const f of ['inflite.svg', 'app.js', 'styles.css', 'icon-192.png', 'manifest.webmanifest']) {
    const a = await ask(`https://chat.inflite.ai/_hub/in/${f}`, { headers: HUB }), b = await ask(`https://chat.inflite.ai/_hub/${f}`, { headers: HUB });
    assert.equal(a.res.status, 200, f); assert.equal(a.text, b.text, `in/${f} is /_hub/${f}`);
    assert.deepEqual([...a.res.headers].sort(), [...b.res.headers].sort(), f);
  }
  const ver = await ask('https://chat.inflite.ai/_hub/in/version', { headers: HUB });
  assert.equal(ver.res.status, 200); assert.equal(ver.text, (await ask('https://chat.inflite.ai/_hub/version', { headers: HUB })).text);
  for (const p of ['/_hub/in/handover', '/_hub/in/handover.html', '/_hub/in/nothing.js', '/_hub/in/in/', '/_hub/handover.html', '/_hub/nothing.js']) assert.equal((await ask('https://chat.inflite.ai' + p, { headers: HUB })).res.status, 404, p);
  // (never without the hub's key, nor anywhere but Chat's address)
  for (const [url, headers] of [['https://chat.inflite.ai/_hub/in/', {}], ['https://chat.inflite.ai/_hub/in/', { 'X-Hub-Key': 'wrong-key-0123456789abcd' }], ['http://localhost:8788/_hub/in/', HUB], ['https://georgefarrowgreen.com/_hub/in/', HUB]]) {
    const { res, text } = await ask(url, { headers });
    assert.equal(res.status, 404, `${url} ${JSON.stringify(headers)}`); assert.doesNotMatch(text, /inflight-version/);
  }
  // (Chat at its own addresses: /in/ is nothing there, as before)
  assert.equal((await ask('https://chat.inflite.ai/in/')).res.status, 404);
  assert.doesNotMatch((await ask('http://localhost:8788/pigeon/in/')).text, /inflight-version/, 'the old address: the site’s own, never Chat’s page');
});

// ---- the /pigeon/in/ block (pigeon/app.js, S3-D8): at Chat's page at /chats/in/ alone ----
const APP = readFileSync(new URL('pigeon/app.js', ROOT), 'utf8');
const between = (a, b) => { const i = APP.indexOf(a), j = APP.indexOf(b, i); assert.ok(i >= 0 && j > i, `${a} … ${b}`); return APP.slice(i, j); };
const IN_LINE = /\nconst IN_PAGE = [^\n]+\n/.exec(APP)?.[0];

test('the /pigeon/in/ block: IN_PAGE true at /chats/in/ (the hub’s copy) and nowhere else Chat is; written so each address says it as its own', () => {
  assert.ok(IN_LINE, 'IN_PAGE and IN_AT, at the top level');
  const at = (text, pathname, hash = '') => new Function('location', `${text}; return { IN_PAGE, IN_AT };`)({ pathname, hash });
  const hub = atRoot(IN_LINE, '/chats/'), own = atRoot(IN_LINE), old = IN_LINE;
  for (const p of ['/chats/in/', '/chats/in/index.html']) assert.deepEqual(at(hub, p, '#account'), { IN_PAGE: true, IN_AT: '#account' }, p);
  for (const p of ['/chats/', '/chats/index.html', '/chats/in', '/chats/in/x.html', '/in/', '/']) assert.equal(at(hub, p, '#x').IN_PAGE, false, `hub ${p}`);
  assert.equal(at(hub, '/chats/', '#open=a').IN_AT, '', 'the hash kept only there');
  for (const p of ['/', '/index.html', '/in/x']) assert.equal(at(own, p).IN_PAGE, false, `chat.inflite.ai ${p}`);
  for (const p of ['/pigeon/', '/pigeon/index.html']) assert.equal(at(old, p).IN_PAGE, false, `old address ${p}`);
  assert.equal(APP.match(/\bIN_PAGE\b/g).length, 5, 'IN_PAGE: made once (with IN_AT), used three times (the three behaviours)');
});

test('the /pigeon/in/ block: (a) no worker registered there; (b) signed in with no then, back to /chats/; (c) found signed in with no sign-in under way, on to /chats/ with its link, but for the sign-in keys and #account', () => {
  // (a) the registration at the start, the engine's guard as it was (engine.test pins it)
  assert.match(APP, /\nif \(!ENGINE && "serviceWorker" in navigator && !IN_PAGE && document\.documentElement\.dataset\.device !== "computer"\) navigator\.serviceWorker\.register\("\/pigeon\/sw\.js", \{ scope: "\/pigeon\/" \}\)/);
  // (b) in signInBack, right after the then rule: nowhere asked, at /chats/in/ → /chats/
  const back = between('async function signInBack(code) {', '\n}\n');
  assert.match(back, /if \(then && then !== location\.pathname\) \{ location\.replace\(then\); return; \}\n\s+if \(!then && IN_PAGE\) \{ location\.replace\("\/pigeon\/"\); return; \}\n\s+await afterSignIn\(\);/);
  assert.equal(atRoot('location.replace("/pigeon/")', '/chats/'), 'location.replace("/chats/")', 'which is /chats/ at the hub');
  // (c) in start(), signed in: after the signed-in-already then rule, before anything is drawn
  const signed = between('    // (signed in here already, and asked to sign in from another page of the hub', '    render();');
  const line = /\n\s+(if \(IN_PAGE && !signedBack && !startIn && [^\n]+)\n/.exec(signed)?.[1];
  assert.ok(line, 'the rule, before the first render');
  assert.ok(signed.indexOf(line) < signed.indexOf('S.view = '), 'before the view is chosen');
  const go = (hash, { signedBack = null, startIn = false } = {}) => {
    let went = null;
    new Function('IN_PAGE', 'IN_AT', 'signedBack', 'startIn', 'location', `${atRoot(line, '/chats/')}`)(true, hash, signedBack, startIn, { replace: (u) => { went = u; } });
    return went;
  };
  for (const [hash, to] of [['', '/chats/'], ['#open=4b1f', '/chats/#open=4b1f'], ['#friends', '/chats/#friends'], ['#requests', '/chats/#requests'], ['#add=pat_1', '/chats/#add=pat_1'],
    ['#flightlog', '/chats/#flightlog'], ['#share=x&back=%2F', '/chats/#share=x&back=%2F'], ['#accounts', '/chats/#accounts']]) assert.equal(go(hash), to, hash || '(none)');
  for (const hash of ['#signin=abcdefghijklmnopqrstuvwxyz', '#signin-start&then=%2Fchats%2F', '#verify=x', '#invite=x', '#reset=x', '#account', '#account&x=1']) assert.equal(go(hash), null, `${hash}: stays`);
  assert.equal(go('#open=x', { signedBack: 'code' }), null, 'a sign-in handed back: under way');
  assert.equal(go('#open=x', { startIn: true }), null, 'a sign-in asked for: under way');
  const off = (hash) => { let went = null; new Function('IN_PAGE', 'IN_AT', 'signedBack', 'startIn', 'location', line)(false, hash, null, false, { replace: (u) => { went = u; } }); return went; };
  assert.equal(off('#open=x'), null, 'anywhere else: nothing');
});
