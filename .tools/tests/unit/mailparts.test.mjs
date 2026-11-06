// Mail's page in parts (the inflite repo's email/public/, where it's checked out beside this one): app.js is what Mail
// opens to (signing in, the list, a conversation read, Done and Later), and what's used later is a module of its own in
// public/parts/ (the compose sheet, the viewer, search’s help, the sheets used now and then, a booking’s strip, the demo), loaded the first
// time it's needed as /parts/<name>.js?b=<BUILD>. Checked here: app.js stays small (gzipped, under its budget); every
// part it asks for is there, given all it uses of Mail's own and giving back what app.js calls; Mail's Worker gives a
// part only to a page of the Mail deployed (another's turned away: 409; none that isn't there: 404, never the page);
// and Mail's service worker keeps each Mail's parts by its build as it keeps that Mail's app.js, gives a page only its
// own, from what it kept first (so offline too), and lets go of those of any Mail but the last two.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import vm from 'node:vm';

const MAIL = new URL('../../../../inflite/email/', import.meta.url);
const PUB = new URL('public/', MAIL);
const skip = !existsSync(new URL('parts/', PUB)) && 'the inflite repo beside isn’t there, or its Mail isn’t in parts';
const read = (f) => readFileSync(new URL(f, PUB), 'utf8');
const app = skip ? '' : read('app.js');
const names = skip ? [] : readdirSync(new URL('parts/', PUB)).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).sort();

// Mail's app.js was 389,554 bytes, 115,058 gzipped, before its later parts went to parts/ (the compose sheet, the viewer,
// search's help, Settings, Notifications turned on and Unsubscribe, the demo): 280,800 or so, 84,700 gzipped, of which
// InFlite's menu, shared and left in it, is 98,000, 29,600 gzipped. Its budget: that, and a little room
const BUDGET_GZ = 87000;
test('Mail’s app.js, what Mail opens to, stays within its budget, gzipped (its later parts in parts/)', { skip }, () => {
  const gz = gzipSync(app, { level: 9 }).length;
  assert.ok(gz <= BUDGET_GZ, `app.js is ${gz} bytes gzipped, over its budget of ${BUDGET_GZ}: what isn't needed as Mail opens belongs in a part (email/public/parts/)`);
  // (and the parts together aren't app.js again: each its own, for what it's for)
  for (const n of names) assert.ok(gzipSync(read(`parts/${n}.js`), { level: 9 }).length < 16000, `parts/${n}.js`);
});

test('every part app.js asks for is there, given what it uses of Mail’s own, and gives back what app.js calls', { skip }, () => {
  const asked = new Set([...app.matchAll(/\b(?:part|fromPart|warmPart)\("(\w+)"/g)].map((m) => m[1]));
  assert.deepEqual([...asked].sort(), names, 'each part in parts/ asked for by app.js, and each asked for there');
  // (one way in: part(), the one import(), as this Mail's own; nothing on the page loads a part as it opens)
  assert.equal([...app.matchAll(/\bimport\(/g)].length, 1);
  assert.match(app, /import\(`\/parts\/\$\{name\}\.js\?b=\$\{encodeURIComponent\(BUILD\)\}/);
  assert.doesNotMatch(read('index.html'), /parts\/|modulepreload|type="module"/);
  // (what app.js gives them: its own names, each one there; what changes, read and set as it is now)
  const ctx = /partsCtx \|\|= \{([\s\S]*?)\n {4}\}\);/.exec(app)?.[1] || assert.fail('app.js: partsContext');
  const given = new Set(ctx.replace(/(?:get|set) (\w+)\([^)]*\) \{[^}]*\},?/g, '$1,').split(/[\s,]+/).filter(Boolean));
  const live = [...ctx.matchAll(/get (\w+)\(\) \{ return (\w+); \}/g)];
  for (const [, k, v] of live) assert.equal(k, v, `M.${k} is app.js's ${k}`);
  const calls = [...app.matchAll(/\bfromPart\("(\w+)", "(\w+)"/g), ...app.matchAll(/\bPARTS\.(\w+)\?\.mod\.(\w+)\(/g), ...app.matchAll(/\b(\w+)Part\(\)\.(\w+)\(/g)];
  for (const n of names) {
    const src = read(`parts/${n}.js`);
    assert.match(src, /^export default \(M\) => \{$/m, `parts/${n}.js: export default (M) => {`);
    const uses = (/\n {2}const \{ ([^}]*) \} = M;\n/.exec(src)?.[1] || '').split(', ').filter(Boolean);
    for (const u of [...uses, ...[...src.matchAll(/\bM\.(\w+)/g)].map((m) => m[1])]) assert.ok(given.has(u), `parts/${n}.js uses ${u}, which app.js doesn't give it`);
    const gives = (/\n {2}return \{ ([^}]*) \};\n\};\n$/.exec(src)?.[1] || assert.fail(`parts/${n}.js: what it gives back`)).split(', ');
    for (const [, p, fn] of calls) if (p === n) assert.ok(gives.includes(fn), `app.js calls ${n}'s ${fn}, which parts/${n}.js doesn't give back`);
    for (const g of gives) assert.match(src, new RegExp(`\\n {2}(?:async )?(?:function ${g}\\(|const ${g} = )`), `parts/${n}.js: ${g}`);
    // (a module of its own: nothing of app.js's taken from the window)
    assert.doesNotMatch(src, /\bwindow\.(?:S|api|els|IFL)\b/);
  }
  // (Mail's service worker keeps them all, the demo's only as it's used)
  const sw = read('sw.js');
  const kept = JSON.parse(/\nconst PARTS = (\[[^\]]*\]);/.exec(sw)?.[1] || '[]');
  assert.deepEqual(kept.sort(), names.filter((n) => n !== 'demo').map((n) => `/parts/${n}.js`).sort());
});

// ---- Mail's Worker: a part for the Mail deployed only ----
const worker = skip ? null : (await import(new URL('src/index.js', MAIL).href)).default;
function files(build = '1.70') {
  const asked = [];
  return {
    asked,
    fetch: async (req) => {
      const u = new URL(req.url);
      asked.push(u.pathname + u.search);
      if (u.pathname === '/app.js') return new Response(`const BUILD = "${build}";`, { headers: { 'Content-Type': 'text/javascript' } });
      // (a file that isn't there: the page, as the files' single-page-application answer has it)
      if (!['/parts/compose.js', '/parts/viewer.js'].includes(u.pathname)) return new Response('<!doctype html><title>Mail</title>', { headers: { 'Content-Type': 'text/html' } });
      return new Response(`export default () => ({}); // ${u.pathname}`, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', ETag: '"p1"' } });
    },
  };
}
const call = (path, env, init = {}) => worker.fetch(new Request(`https://email.inflite.ai${path}`, init), env, { waitUntil() {} });

test('Mail’s Worker gives a part to a page of the Mail deployed; to another Mail’s, 409; one that isn’t there, 404, never Mail’s page', { skip }, async () => {
  // (each run of the Worker reads its Mail's build once: a deploy of its own for each case here)
  let n = 0;
  const env = (build) => ({ ASSETS: files(build), BUILD_ID: `parts-${++n}` });
  let e = env('1.70');
  let res = await call('/parts/compose.js?b=1.70', e);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /\/parts\/compose\.js/);
  assert.equal(res.headers.get('cache-control'), 'no-cache');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  e = env('1.71');
  res = await call('/parts/compose.js?b=1.70', e);
  assert.equal(res.status, 409, 'a page of Mail 1.70 with 1.71 deployed: turned away');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.ok(!e.ASSETS.asked.some((p) => p.startsWith('/parts/')), 'and the part never asked of the files');
  e = env('1.70');
  for (const p of ['/parts/nothing.js?b=1.70', '/parts/compose.css', '/parts/', '/parts/a/b.js']) assert.equal((await call(p, e)).status, 404, p);
  assert.equal((await call('/parts/compose.js?b=1.70', e, { method: 'POST' })).status, 404);
  // (asked with no build, as nothing of Mail's does: as it is)
  assert.equal((await call('/parts/viewer.js', env('1.70'))).status, 200);
});

test('wrangler.jsonc: Mail’s Worker answers /parts/* first', { skip }, () => {
  const conf = JSON.parse(readFileSync(new URL('wrangler.jsonc', MAIL), 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1'));
  assert.ok(conf.assets.run_worker_first.includes('/parts/*'));
});

// ---- Mail's service worker: each Mail's parts kept by its build ----
// (the worker, with a network (net(path, search) → a Response, or a throw for no answer) and a cache, as mailsw.test.mjs)
function sw(net) {
  const on = {}, kept = new Map(), asked = [];
  const self = { location: { origin: 'https://email.inflite.ai' }, addEventListener: (k, f) => (on[k] = f), skipWaiting: () => {}, clients: { claim: async () => {} } };
  const key = (k) => (typeof k === 'string' ? new URL(k, self.location.origin).href : k.url);
  const cache = {
    match: async (k) => kept.get(key(k))?.clone(),
    put: async (k, r) => void kept.set(key(k), r),
    addAll: async (list) => { for (const f of list) kept.set(key(f), await fetch(f)); },
    keys: async () => [...kept.keys()].map((url) => ({ url })),
    delete: async (k) => kept.delete(key(k)),
  };
  const caches = { open: async () => cache, keys: async () => ['mail-app-2'], delete: async () => true };
  const fetch = async (r) => {
    const u = new URL(typeof r === 'string' ? r : r.url, self.location.origin);
    asked.push(u.pathname + u.search);
    const res = await net(u.pathname, u.search);
    return res && Object.defineProperty(res, 'type', { value: 'basic' });
  };
  const setTimeout = (f, ms) => globalThis.setTimeout(f, ms >= 5000 ? 20 : ms);
  vm.runInNewContext(read('sw.js'), { self, caches, fetch, setTimeout, clearTimeout, URL, URLSearchParams, Response, Request, Promise, JSON, Math, atob });
  const send = async (k, x) => {
    let answer = null;
    const waits = [];
    on[k]({ ...x, respondWith: (p) => (answer = Promise.resolve(p)), waitUntil: (p) => waits.push(p) });
    const res = answer ? await answer : null;
    await Promise.all(waits);
    return res;
  };
  const get = (path) => send('fetch', { request: { method: 'GET', url: `https://email.inflite.ai${path}`, mode: 'cors' } });
  const parts = () => [...kept.keys()].map((u) => new URL(u)).filter((u) => u.pathname.startsWith('/parts/') && u.search).map((u) => u.pathname + u.search).sort();
  return { send, get, kept, asked, parts };
}
const PARTS = ['compose', 'search', 'sheets', 'spot', 'viewer'];

test('Mail’s service worker keeps a Mail’s parts by its build as it keeps that Mail’s app.js; gives a page its own Mail’s, kept first, offline too', { skip }, async () => {
  let build = '1.70', down = false, deployed = '1.70';
  const w = sw((path, search) => {
    if (down) throw new TypeError('Load failed');
    if (path === '/app.js') return new Response(`const BUILD = "${build}"; // ${build}`);
    if (path.startsWith('/parts/')) {
      const b = new URLSearchParams(search).get('b');
      return b && b !== deployed ? new Response('Not this Mail’s', { status: 409 }) : new Response(`${path} of ${deployed}`);
    }
    return new Response(`fresh ${path}`);
  });
  // (installed: Mail's files, then its parts)
  await w.send('install', {});
  assert.deepEqual(w.parts(), PARTS.map((n) => `/parts/${n}.js?b=1.70`), 'the parts of the Mail just kept, each by its build (the demo’s only as it’s used)');
  // (asked for by the page: from what was kept, the network not asked)
  const n = w.asked.length;
  assert.equal(await (await w.get('/parts/compose.js?b=1.70')).text(), '/parts/compose.js of 1.70');
  assert.equal(w.asked.length, n, 'given from what was kept');
  // (Mail 1.71 deployed while a page of 1.70 is open: that page given 1.70's still, never 1.71's)
  deployed = '1.71';
  assert.equal(await (await w.get('/parts/viewer.js?b=1.70')).text(), '/parts/viewer.js of 1.70');
  // (1.71's app.js comes: its parts kept too, a moment on; 1.70's kept beside them, for a page still open)
  build = '1.71';
  assert.equal(await (await w.get('/app.js')).text(), 'const BUILD = "1.71"; // 1.71');
  assert.deepEqual(w.parts(), [...PARTS.map((x) => `/parts/${x}.js?b=1.70`), ...PARTS.map((x) => `/parts/${x}.js?b=1.71`)].sort());
  // (the same app.js again: nothing more asked)
  const m = w.asked.length;
  await w.get('/app.js');
  assert.deepEqual(w.asked.slice(m), ['/app.js']);
  // (offline: each Mail's own, kept; one never kept, no answer, as without the worker)
  down = true;
  assert.equal(await (await w.get('/parts/sheets.js?b=1.71')).text(), '/parts/sheets.js of 1.71');
  assert.equal(await (await w.get('/parts/sheets.js?b=1.70')).text(), '/parts/sheets.js of 1.70');
  await assert.rejects(w.get('/parts/demo.js?b=1.71'));
  down = false;
  // (the demo's, used: kept as it's asked for)
  assert.equal(await (await w.get('/parts/demo.js?b=1.71')).text(), '/parts/demo.js of 1.71');
  assert.ok(w.parts().includes('/parts/demo.js?b=1.71'));
  // (1.72: 1.70's let go, 1.71's kept as the one before)
  build = deployed = '1.72';
  await w.get('/app.js');
  assert.deepEqual(w.parts(), [...PARTS.map((x) => `/parts/${x}.js?b=1.71`), '/parts/demo.js?b=1.71', ...PARTS.map((x) => `/parts/${x}.js?b=1.72`)].sort());
  // (a part asked for by a page of another Mail, never kept: the Worker's 409, as it is, and nothing kept of it)
  const r = await w.get('/parts/compose.js?b=1.69');
  assert.equal(r.status, 409);
  assert.ok(!w.parts().includes('/parts/compose.js?b=1.69'));
  // (asked with no build, as nothing of Mail's does: the worker's not to answer)
  assert.equal(await w.get('/parts/compose.js'), null);
});

test('Mail’s service worker: the same Mail changed (its build as it was) has its parts fetched again; a newer one deployed meanwhile stops it', { skip }, async () => {
  let text = 'const BUILD = "1.70"; // a', deployed = '1.70', v = 'a';
  const w = sw((path, search) => {
    if (path === '/app.js') return new Response(text);
    const b = new URLSearchParams(search).get('b');
    if (path.startsWith('/parts/')) return b && b !== deployed ? new Response('', { status: 409 }) : new Response(`${path} ${v}`);
    return new Response('x');
  });
  await w.get('/app.js');
  assert.equal(await (await w.get('/parts/search.js?b=1.70')).text(), '/parts/search.js a');
  text = 'const BUILD = "1.70"; // b';
  v = 'b';
  await w.get('/app.js');
  assert.equal(await (await w.get('/parts/search.js?b=1.70')).text(), '/parts/search.js b', 'fetched again with it');
  // (1.71's app.js, but 1.72 deployed as its parts are asked for: none of them kept as 1.71's)
  text = 'const BUILD = "1.71";';
  deployed = '1.72';
  await w.get('/app.js');
  assert.ok(!w.parts().some((p) => p.endsWith('b=1.71')));
});
