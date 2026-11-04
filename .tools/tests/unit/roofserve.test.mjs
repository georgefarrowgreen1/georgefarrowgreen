// One roof's server side (stage 1, spec §8.1, §8.3, §8.4; the inflite repo's today/src/roof.js, where it's checked out
// beside this one with the roof): the framework's page for a document at /weather/ (the assets' /, asked afresh, a whole
// page even when the browser asks with a condition, the page's headers set over the assets' with one CSP, no body for a
// HEAD); PAGE_HEADERS the same CSP as today/public/_headers' /*, naming exactly Weather's own origins (this repo's
// functions/_wxapp.js CONNECT, without Cloudflare's beacon, and IMAGES), geolocation for itself alone; and the retiring
// worker for Weather's old one at /weather/, run in a made-up worker's global: Weather's caches (wx-*) let go and no
// other, itself unregistered, its windows under /weather/ sent there again, and nothing else answered.
// (The hub's use of them, with and without its key and ROOF_OFF: hubworker.test.mjs.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import { MAIN, IFL, roofSkip } from './fixtures/roof.mjs';

const ROOFJS = IFL && new URL('today/src/roof.js', IFL);
const skip = roofSkip || (!existsSync(ROOFJS) && 'the inflite repo beside has no roof rule yet (today/src/roof.js)');
const R = skip ? null : await import(ROOFJS);
// (stage 3, where the inflite repo beside has it: Chats a module by ROOF_CHATS, with the page's camera, microphone and
// blob: media for it, s3 spec §6.2; the earlier answers else)
const hasChats = !skip && R.MODS?.includes('chats');
const chatsCase = skip || (!hasChats && 'the inflite repo beside has no Chats switch yet (roof.js MODS without chats: before stage 3)');
const SITE = 'https://inflite.ai';
const plain = (x) => JSON.parse(JSON.stringify(x));
const PAGE = '<!doctype html><html><head><meta name="ifl-hub" content="/"></head><body>framework</body></html>';
// (the assets, as the Worker's binding: what each request was, and Today's page at / with headers of its own)
function assetsOf(answer) {
  const asked = [];
  const env = { ASSETS: { fetch: async (r) => { asked.push(r); return answer ? answer(r) : new Response(r.method === 'HEAD' ? null : PAGE, { headers: {
    'Content-Type': 'text/html; charset=utf-8', ETag: '"assets-etag"', 'Last-Modified': 'Mon, 02 Nov 2026 10:00:00 GMT', 'Content-Security-Policy': "default-src 'self'; connect-src 'self'",
    'Content-Security-Policy-Report-Only': "default-src 'none'", 'Permissions-Policy': 'geolocation=()', 'Cache-Control': 'public, max-age=600', 'X-Frame-Options': 'SAMEORIGIN' } }); } } };
  return { env, asked };
}
const listOf = (src, name) => [...new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`).exec(src)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const directive = (csp, d) => (new RegExp(`(?:^|;)\\s*${d} ([^;]*)`).exec(csp) || [])[1]?.trim().split(/\s+/) || [];

test('roofPage: the assets’ /, asked afresh with no condition, cookie or query; a whole 200 even for a browser’s If-None-Match; the page’s headers set over the assets’ (one CSP); HEAD with no body', { skip }, async () => {
  const { env, asked } = assetsOf();
  const r = await R.roofPage(new Request(`${SITE}/weather/index.html?lat=1&lon=2`, { headers: { 'If-None-Match': '"assets-etag"', 'If-Modified-Since': 'Mon, 02 Nov 2026 10:00:00 GMT', Cookie: 'account=x', Range: 'bytes=0-9' } }), env);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), PAGE, 'the assets’ / as it is');
  assert.equal(asked.length, 1);
  assert.equal(asked[0].url, `${SITE}/`); assert.equal(asked[0].method, 'GET');
  for (const k of ['if-none-match', 'if-modified-since', 'cookie', 'range']) assert.equal(asked[0].headers.get(k), null, k);
  const csps = [...r.headers].filter(([k]) => k === 'content-security-policy');
  assert.deepEqual(csps, [['content-security-policy', R.PAGE_HEADERS['Content-Security-Policy']]], 'one CSP, the page’s');
  for (const [k, v] of Object.entries(R.PAGE_HEADERS)) assert.equal(r.headers.get(k), v, k);
  for (const k of ['etag', 'last-modified', 'content-security-policy-report-only']) assert.equal(r.headers.get(k), null, `no ${k}: nothing to answer a condition with, nothing of the assets’ policy left`);
  assert.equal(r.headers.get('content-type'), 'text/html; charset=utf-8');
  // (HEAD: asked as HEAD, the same headers, no body)
  const head = await R.roofPage(new Request(`${SITE}/weather/`, { method: 'HEAD' }), env);
  assert.equal(asked[1].method, 'HEAD');
  assert.equal(head.status, 200); assert.equal(head.body, null);
  for (const [k, v] of Object.entries(R.PAGE_HEADERS)) assert.equal(head.headers.get(k), v, `HEAD ${k}`);
  // (an assets' HEAD answered with a body all the same: none sent on)
  const loud = assetsOf(() => new Response('body anyway', { headers: { 'Content-Type': 'text/html' } }));
  assert.equal((await R.roofPage(new Request(`${SITE}/weather/`, { method: 'HEAD' }), loud.env)).body, null);
  // (the assets failing: their status passed on, with the page's headers still)
  const gone = assetsOf(() => new Response('gone', { status: 404 }));
  const missing = await R.roofPage(new Request(`${SITE}/weather/`), gone.env);
  assert.equal(missing.status, 404); assert.equal(missing.headers.get('x-robots-tag'), 'noindex');
});

// (Mail's Worker, which Mail's module calls and frames its bodies from (stage 4, s4 C13; s24-contracts §11): in
// connect-src and frame-src alone, its live address and the test stack's, once the inflite repo beside has stage 4's R0)
const MAIL_ORIGINS = ['https://email.inflite.ai', 'http://email.ifl.test:8788'];
test('PAGE_HEADERS: exactly these; its CSP is _headers’ /* CSP, naming exactly Weather’s origins (_wxapp.js CONNECT without the beacon, and IMAGES) and Mail’s Worker, nothing inline, no other site; geolocation for itself alone', { skip }, () => {
  const csp = R.PAGE_HEADERS['Content-Security-Policy'];
  assert.deepEqual(R.PAGE_HEADERS, {
    'Content-Security-Policy': csp, 'Permissions-Policy': hasChats ? 'camera=(self), microphone=(self), geolocation=(self)' : 'camera=(), microphone=(), geolocation=(self)', 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin', 'Cross-Origin-Opener-Policy': 'same-origin', 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
    'Cache-Control': 'no-cache', 'X-Robots-Tag': 'noindex' });
  const headers = readFileSync(new URL('today/public/_headers', IFL), 'utf8');
  const all = /\n\/\*\n((?:  .*\n?)*)/.exec(headers)[1];
  assert.equal(/  Content-Security-Policy: (.*)/.exec(all)?.[1], csp, '_headers’ /* and PAGE_HEADERS: the same CSP');
  assert.equal(/  Permissions-Policy: (.*)/.exec(all)?.[1], R.PAGE_HEADERS['Permissions-Policy'], 'and the same Permissions-Policy');
  for (const k of ['X-Frame-Options', 'X-Content-Type-Options', 'Referrer-Policy', 'Cross-Origin-Opener-Policy', 'Strict-Transport-Security'])
    assert.equal(new RegExp(`  ${k}: (.*)`).exec(all)?.[1], R.PAGE_HEADERS[k], k);
  const wx = readFileSync(new URL('functions/_wxapp.js', MAIN), 'utf8');
  const CONNECT = listOf(wx, 'CONNECT').filter((o) => !/cloudflareinsights/.test(o)), IMAGES = listOf(wx, 'IMAGES');
  assert.ok(CONNECT.length >= 10 && IMAGES.length >= 3, 'Weather’s lists read');
  const mail = directive(csp, 'connect-src').includes(MAIL_ORIGINS[0]) ? MAIL_ORIGINS : [];
  assert.deepEqual(directive(csp, 'connect-src'), ["'self'", ...mail, ...CONNECT], 'connect-src: Weather’s own (and Mail’s Worker), exactly');
  assert.deepEqual(directive(csp, 'frame-src'), ["'self'", ...mail], 'frame-src: this site (and Mail’s Worker, for its bodies), exactly');
  assert.deepEqual(directive(csp, 'img-src'), ["'self'", 'data:', 'blob:', ...IMAGES], 'img-src: Weather’s own, exactly');
  assert.deepEqual(directive(csp, 'media-src'), hasChats ? ["'self'", 'blob:'] : [], 'media-src: Chats’ voice pigeons (blob:), this site alone; none before stage 3');
  const others = csp.split(';').filter((d) => !/^\s*(connect|img|frame)-src /.test(d)).join(';');
  assert.doesNotMatch(others, /https?:/, 'no other site anywhere else in it');
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|wasm-unsafe-eval|cloudflareinsights/);
  for (const d of ["default-src 'self'", "script-src 'self'", "style-src 'self'", "font-src 'self'", "manifest-src 'self'", "worker-src 'self'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'", "object-src 'none'"])
    assert.ok(csp.split('; ').includes(d), d);
});

test('the paths: ROOF_DOCS the page at /weather/ alone, ROOF_FILES the module’s files; the roof on unless ROOF_OFF is "1"', { skip }, () => {
  for (const p of ['/weather/', '/weather/index.html']) assert.ok(R.ROOF_DOCS.test(p), p);
  for (const p of ['/weather', '/weather/x.html', '/weather/index.htm', '/weather/index.html/', '/weather/roof/', '/weathers/', '/', '/index.html']) assert.ok(!R.ROOF_DOCS.test(p), p);
  for (const p of ['/weather/roof/weather.js', '/weather/roof/', '/weather/roof/wxcore.css']) assert.ok(R.ROOF_FILES.test(p), p);
  for (const p of ['/weather/roofs.js', '/weather/app.js', '/roof/frame.js', '/weather/x/roof/y.js']) assert.ok(!R.ROOF_FILES.test(p), p);
  assert.equal(R.roofOn({}), true); assert.equal(R.roofOn(undefined), true); assert.equal(R.roofOn({ ROOF_OFF: '' }), true);
  assert.equal(R.roofOn({ ROOF_OFF: '0' }), true); assert.equal(R.roofOn({ ROOF_OFF: 'true' }), true); assert.equal(R.roofOn({ ROOF_OFF: '1' }), false);
});

test('RETIRE_SW, in a worker’s global: takes over at once; lets Weather’s caches go (wx-*) and only those; unregisters; sends its windows under /weather/ there again; answers nothing else', { skip }, async () => {
  const on = {}, deleted = [], went = [], order = [];
  let matched = null, skipped = false;
  const wins = ['https://inflite.ai/weather/#radar', 'https://inflite.ai/weather/?lat=1', 'https://inflite.ai/', 'https://inflite.ai/chats/', 'https://inflite.ai/weatherx/']
    .map((url) => ({ url, navigate: async (u) => { order.push('navigate'); went.push(u); if (u.includes('lat=1')) throw new TypeError('gone'); } }));
  const self = {
    addEventListener: (k, f) => { on[k] = f; },
    skipWaiting: () => { skipped = true; },
    registration: { unregister: async () => { order.push('unregister'); return true; } },
    clients: { matchAll: async (o) => { matched = o; return wins; } },
  };
  const caches = { keys: async () => ['wx-1.64', 'wx-libs-1', 'wx-tint', 'today-app-3', 'roof-weather-1.64', 'mail-x', 'awx-1'], delete: async (k) => { order.push('delete'); deleted.push(k); return true; } };
  vm.runInNewContext(R.RETIRE_SW, { self, caches, URL, Promise });
  assert.deepEqual(Object.keys(on).sort(), ['activate', 'install'], 'no fetch, push or message handler');
  on.install({});
  assert.equal(skipped, true, 'takes over at once');
  const waits = [];
  on.activate({ waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  assert.deepEqual(deleted, ['wx-1.64', 'wx-libs-1', 'wx-tint'], 'Weather’s caches alone');
  assert.deepEqual(order.slice(0, 4), ['delete', 'delete', 'delete', 'unregister'], 'caches, then unregister, then the windows');
  assert.deepEqual(plain(matched), { type: 'window' });
  assert.deepEqual(went, ['https://inflite.ai/weather/#radar', 'https://inflite.ai/weather/?lat=1'], 'those under /weather/ alone, each tried');
  // (a cache store that fails: it still unregisters)
  const on2 = {}; let unreg = false;
  vm.runInNewContext(R.RETIRE_SW, { self: { addEventListener: (k, f) => { on2[k] = f; }, skipWaiting() {}, registration: { unregister: async () => { unreg = true; } }, clients: { matchAll: async () => [] } },
    caches: { keys: async () => { throw new Error('no storage'); } }, URL, Promise });
  const w2 = []; on2.activate({ waitUntil: (p) => w2.push(p) }); await Promise.all(w2);
  assert.equal(unreg, true);
  // (served as a script, never kept, never sniffed)
  const r = R.retireWorker(new Request(`${SITE}/weather/sw.js`));
  assert.equal(r.headers.get('content-type'), 'text/javascript; charset=utf-8'); assert.equal(r.headers.get('cache-control'), 'no-cache'); assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(await r.text(), R.RETIRE_SW);
  assert.equal(R.retireWorker(new Request(`${SITE}/weather/sw.js`, { method: 'HEAD' })).body, null);
  assert.equal(await R.retireWorker().text(), R.RETIRE_SW);
});

// ---- stages 2–4 (s24-contracts §1): a switch per module ----
test('stages 2–4: roofOn(env, app) opt-in for Markets, Fitness and Mail ("1" only), opt-out for Weather (ROOF_OFF_WEATHER), ROOF_OFF over all; modOf, docOf, filesOf, retireSw per app', { skip: skip || (typeof R?.appsOn !== 'function' && 'the inflite repo beside has no per-app switch yet') }, () => {
  for (const app of ['markets', 'fitness', 'mail']) {
    const K = `ROOF_${app.toUpperCase()}`;
    assert.equal(R.roofOn({}, app), false, `${app}: absent is off`);
    assert.equal(R.roofOn({ [K]: '1' }, app), true);
    for (const v of ['0', '', 'true', 'on']) assert.equal(R.roofOn({ [K]: v }, app), false, `${app} ${v}`);
    assert.equal(R.roofOn({ [K]: '1', ROOF_OFF: '1' }, app), false, `${app}: ROOF_OFF wins`);
    assert.equal(R.roofOn({ [K]: '1', ROOF_OFF_WEATHER: '1' }, app), true, `${app}: Weather's switch isn't ${app}'s`);
  }
  assert.equal(R.roofOn({}, 'weather'), true); assert.equal(R.roofOn({ ROOF_OFF_WEATHER: '1' }), false); assert.equal(R.roofOn({ ROOF_OFF_WEATHER: '0' }), true);
  assert.equal(R.roofOn({ ROOF_WEATHER: '0' }), true, 'no other spelling turns Weather off');
  assert.deepEqual(R.appsOn({ ROOF_FITNESS: '1' }), { weather: true, markets: false, fitness: true, mail: false, ...(hasChats ? { chats: false } : {}) });
  for (const [p, a] of [['/markets/', 'markets'], ['/fitness/index.html', 'fitness'], ['/weather/', 'weather'], ['/mail/', 'mail'], ['/markets', null], ['/markets/x.html', null], ['/chats/', hasChats ? 'chats' : null], ['/', null]]) assert.equal(R.modOf(p), a, p);
  assert.ok(R.filesOf('fitness').test('/fitness/roof/core.js')); assert.ok(!R.filesOf('fitness').test('/fitness/roofs.js'));
  assert.equal(R.RETIRE_SW, R.retireSw('weather'), 'Weather’s retiring worker as stage 1 had it');
  assert.match(R.retireSw('markets'), /startsWith\("markets-app-"\)/); assert.match(R.retireSw('fitness'), /startsWith\("fitness-app-"\)/);
  assert.doesNotMatch(R.retireSw('markets'), /wx-|fitness-app-/);
});

// ---- stage 3 (s3 spec §6.2, risk I11): Chats ----
test('stage 3: roofOn(env, "chats") by ROOF_CHATS "1" alone; modOf Chats’ document only with no engine in the query, never /chats/in/', { skip: chatsCase }, () => {
  assert.equal(R.roofOn({}, 'chats'), false, 'absent: off');
  assert.equal(R.roofOn({ ROOF_CHATS: '1' }, 'chats'), true);
  for (const v of ['0', '', 'true', ' 1']) assert.equal(R.roofOn({ ROOF_CHATS: v }, 'chats'), false, JSON.stringify(v));
  assert.equal(R.roofOn({ ROOF_CHATS: '1', ROOF_OFF: '1' }, 'chats'), false, 'ROOF_OFF wins');
  assert.equal(R.roofOn({ ROOF_OFF_CHATS: '1' }, 'chats'), false, 'no opt-out spelling turns it on or off: opt-in alone');
  assert.deepEqual(R.appsOn({ ROOF_CHATS: '1' }), { weather: true, markets: false, fitness: false, mail: false, chats: true });
  assert.deepEqual(R.MODS, ['weather', 'markets', 'fitness', 'mail', 'chats']);
  for (const [p, q, a] of [['/chats/', '', 'chats'], ['/chats/index.html', '?x=1', 'chats'], ['/chats/', '?engined=1', 'chats'], ['/chats/', '?engine=1', null], ['/chats/index.html', '?a=1&engine', null],
    ['/chats/in/', '', null], ['/chats/in/index.html', '', null], ['/chats', '', null], ['/chats/x.html', '', null], ['/weather/', '?engine=1', 'weather']]) assert.equal(R.modOf(p, q), a, p + q);
  assert.ok(R.filesOf('chats').test('/chats/roof/core.js')); assert.ok(!R.filesOf('chats').test('/chats/app.js'));
});

test('stage 3: Chats’ retiring worker: Chat’s caches (inflight-shell*) alone, unregisters, then asks each window at exactly /chats/ to route and sends again only one that doesn’t say routed in a second; never /chats/in/, an engine or a framed one', { skip: chatsCase }, async () => {
  const js = R.retireSw('chats');
  assert.equal(await R.retireWorker(new Request(`${SITE}/chats/sw.js`), 'chats').text(), js);
  const on = {}, deleted = [], order = [];
  let matched = null;
  // (each window: whether it answers a route (the framework does, frame.js), and what it was asked and sent)
  const win = (url, o = {}) => ({ url, frameType: 'top-level', answers: false, asked: [], went: [], ...o,
    postMessage(m, ports = []) { this.asked.push(m); if (this.answers) setTimeout(() => ports[0]?.postMessage({ ifl: 'routed' }), 5); },
    async navigate(u) { order.push('navigate'); this.went.push(u); } });
  const wins = [win('https://inflite.ai/chats/#open=a1', { answers: true }), win('https://inflite.ai/chats/'), win('https://inflite.ai/chats/index.html?x=1'),
    win('https://inflite.ai/chats/in/#signin-start'), win('https://inflite.ai/chats/?engine=1'), win('https://inflite.ai/chats/', { frameType: 'nested' }),
    win('https://inflite.ai/chats/tracker.html'), win('https://inflite.ai/'), win('https://inflite.ai/weather/')];
  const self = {
    addEventListener: (k, f) => { on[k] = f; }, skipWaiting: () => {},
    registration: { unregister: async () => { order.push('unregister'); return true; } },
    clients: { matchAll: async (o) => { matched = o; return wins; } },
  };
  const caches = { keys: async () => ['inflight-shell-v2', 'inflight-shell', 'wx-1.64', 'today-app-4', 'roof-chats-1.70', 'inflight-x'], delete: async (k) => { order.push('delete'); deleted.push(k); return true; } };
  vm.runInNewContext(js, { self, caches, URL, Promise, MessageChannel, setTimeout, clearTimeout });
  assert.deepEqual(Object.keys(on).sort(), ['activate', 'install'], 'no fetch, push or message handler');
  const waits = [], t0 = Date.now();
  on.activate({ waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  assert.ok(Date.now() - t0 < 1900, 'the windows asked at once, each waited for a second at most');
  assert.deepEqual(deleted, ['inflight-shell-v2', 'inflight-shell'], 'Chat’s caches alone');
  assert.deepEqual(order.slice(0, 3), ['delete', 'delete', 'unregister']);
  assert.deepEqual(plain(matched), { type: 'window', includeUncontrolled: true });
  assert.deepEqual(plain(wins[0].asked), [{ ifl: 'route', url: '/chats/#open=a1' }], 'the framework asked to route where it is');
  assert.deepEqual(wins[0].went, [], 'and, saying routed, never reloaded');
  assert.deepEqual(wins[1].went, ['https://inflite.ai/chats/'], 'milestone 1’s page (no answer): sent there again');
  assert.deepEqual(wins[2].went, ['https://inflite.ai/chats/index.html?x=1']);
  for (const w of wins.slice(3)) { assert.deepEqual(w.asked, [], w.url); assert.deepEqual(w.went, [], `${w.url} ${w.frameType}: never`); }
  assert.doesNotMatch(js, /"wx-"|markets-app-/);
  assert.equal(R.retireSw('weather'), R.RETIRE_SW, 'Weather’s unchanged');
  assert.doesNotMatch(R.RETIRE_SW, /route|MessageChannel/);
});
