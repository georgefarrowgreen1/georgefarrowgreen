// What this site believes of a request InFlite's hub made for a browser (functions/_middleware.js hubRequest, spec §3.4),
// driven through the site's middleware itself: a request with no X-Hub-* header is passed on untouched (the same
// object); with the hub's key (compared in constant time), the browser's address is the request's own, so every route's
// clientIp() and every limit() key are the person's, not the hub's; with any other key, every X-Hub-* is dropped and
// nothing is believed; the key itself never goes further; Cloudflare's cf goes on with it; next() with nothing passes on
// the request as made plain. And what the rest of the site does with it: cfOf takes the browser's place only from the
// hub (and from the hub, never the hub Worker's own), originOk takes the hub's origins exactly, /.well-known/webauthn
// lists them, and a sign-in used from the hub, or by Today's Home Screen app, is named InFlite's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequest } from '../../../functions/_middleware.js';
import { onRequest as weatherApi } from '../../../functions/api/weather/[[path]].js';
import { clientIp, originOk, homeOf, placeOf } from '../../../functions/_pigeon.js';
import { cfOf, hubOrigins } from '../../../functions/_sites.js';

const KEY = 'hub-key-0123456789abcdef';
const geoOf = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const LONDON = { country: 'GB', region: 'England', city: 'London', latitude: '51.50740', longitude: '-0.12780', timezone: 'Europe/London' };
const HUB_CF = { country: 'US', region: 'Virginia', city: 'Ashburn', latitude: '39.04', longitude: '-77.49', timezone: 'America/New_York', colo: 'IAD', asn: 13335 };

// D1, as much of it as the server uses: prepare, bind, first, all, run, and batch (all or nothing)
function d1() {
  const s = new DatabaseSync(':memory:');
  const st = (sql, args = []) => ({
    bind: (...a) => st(sql, a),
    first: async () => s.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: s.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: Number(s.prepare(sql).run(...args).changes) } }),
    now: () => (/^\s*SELECT|\bRETURNING\b/i.test(sql) ? s.prepare(sql).all(...args) : s.prepare(sql).run(...args)),
  });
  return { s, prepare: (sql) => st(sql), async batch(list) { s.exec('BEGIN'); try { const r = list.map((x) => x.now()); s.exec('COMMIT'); return r; } catch (e) { s.exec('ROLLBACK'); throw e; } } };
}
// (a request as the Worker hands it to the middleware, cf and all; next: what's after it, the route)
function drive(url, { headers = {}, cf = HUB_CF, env = {}, next } = {}) {
  const request = new Request(url, { headers });
  Object.defineProperty(request, 'cf', { value: cf });
  const calls = [];
  const ctx = { request, env: { HUB_KEY: KEY, ASSETS: { fetch: async () => new Response('asset') }, ...env }, params: {}, data: {}, waitUntil() {},
    next: async (input, init) => { calls.push({ input, init }); return next ? next(input ?? request) : new Response('next'); } };
  return { request, calls, run: () => onRequest(ctx) };
}

test('a request with no X-Hub-* header goes on as it came: the same object, nothing made again', async () => {
  const d = drive('https://chat.inflite.ai/api/pigeon/sync', { headers: { 'CF-Connecting-IP': '198.51.100.4', Authorization: 'Bearer x' } });
  await d.run();
  assert.equal(d.calls.length, 1);
  assert.equal(d.calls[0].input, undefined, 'next() with nothing: the request the Worker had, untouched');
  const w = drive('https://weather.inflite.ai/api/weather/where', { next: (req) => { assert.equal(req, w.request, 'the very same request'); return new Response('ok'); } });
  await w.run();
});

test('with the hub’s key: the browser’s address is the request’s own, X-Hub-Ok says so, the key goes no further, cf goes on', async () => {
  const d = drive('https://chat.inflite.ai/api/pigeon/sync', { headers: { 'CF-Connecting-IP': '172.70.1.1', 'X-Hub-Key': KEY, 'X-Hub-IP': '203.0.113.9', 'X-Hub-Geo': geoOf(LONDON), Authorization: 'Bearer x' } });
  await d.run();
  const req = d.calls[0].input;
  assert.ok(req instanceof Request, 'next() with nothing passes on the request made plain');
  assert.notEqual(req, d.request);
  assert.equal(req.headers.get('cf-connecting-ip'), '203.0.113.9');
  assert.equal(clientIp(req), '203.0.113.9', 'as every route sees it');
  assert.equal(req.headers.get('x-hub-ok'), '1');
  assert.equal(req.headers.get('x-hub-key'), null, 'the key never goes further');
  assert.equal(req.headers.get('x-hub-geo'), geoOf(LONDON));
  assert.equal(req.headers.get('authorization'), 'Bearer x', 'the rest as it came');
  assert.deepEqual(req.cf, HUB_CF, 'Cloudflare’s cf carried');
  assert.equal(req.url, d.request.url); assert.equal(req.method, 'GET');
});

test('with any other key, or none: every X-Hub-* dropped, nothing believed, the address the connection’s own', async () => {
  const forged = { 'X-Hub-IP': '10.9.9.9', 'X-Hub-Geo': geoOf(LONDON), 'X-Hub-Ok': '1' };
  const cases = [[{ 'X-Hub-Key': 'wrong-key-0123456789abcd', ...forged }, {}], [{ 'X-Hub-Key': KEY.slice(0, -1), ...forged }, {}], [{ 'X-Hub-Key': KEY + 'x', ...forged }, {}], [forged, {}],
    [{ 'X-Hub-Key': 'undefined', ...forged }, { HUB_KEY: undefined }], [{ 'X-Hub-Key': '', ...forged }, { HUB_KEY: '' }], [{ 'x-hub-ok': '1' }, {}], [{ 'X-Hub-Other': 'x' }, {}]];
  for (const [headers, env] of cases) {
    const d = drive('https://chat.inflite.ai/api/pigeon/sync', { headers: { 'CF-Connecting-IP': '198.51.100.4', ...headers }, env });
    await d.run();
    const req = d.calls[0].input;
    for (const k of ['x-hub-key', 'x-hub-ip', 'x-hub-geo', 'x-hub-ok']) assert.equal(req.headers.get(k), null, `${JSON.stringify(headers)}: ${k}`);
    assert.equal(clientIp(req), '198.51.100.4', JSON.stringify(headers));
    assert.deepEqual(cfOf(req), HUB_CF, 'its own place, not the one it says');
    assert.equal(homeOf(req), null);
  }
  // (compared in constant time, with the shared helper)
  assert.match(readFileSync(new URL('../../../functions/_middleware.js', import.meta.url), 'utf8'), /if \(mine && key && safeEqual\(key, mine\)\)/);
});

test('every limit() a route sets is keyed by the person’s address through the hub, not the hub’s', async () => {
  const DB = d1(), env = { DB, WX_TRAFFIC_TICK: '0' };
  globalThis.fetch = async () => new Response('down', { status: 503 });
  const asks = [['203.0.113.9', '172.70.1.1'], ['203.0.113.10', '172.70.1.1'], ['2001:db8:aa:bb:1:2:3:4', '172.70.1.1']];
  for (const [ip, worker] of asks) {
    const d = drive('https://weather.inflite.ai/api/weather/obs?lat=51.5&lon=-0.13', { env, headers: { 'CF-Connecting-IP': worker, 'X-Hub-Key': KEY, 'X-Hub-IP': ip },
      next: (req) => weatherApi({ request: req, env: { ...env, HUB_KEY: KEY }, params: { path: ['obs'] }, waitUntil() {} }) });
    await d.run();
  }
  const keys = DB.s.prepare("SELECT key FROM pg_limits WHERE key LIKE 'wxobs:%' ORDER BY key").all().map((r) => r.key);
  assert.deepEqual(keys, ['wxobs:2001:db8:aa:bb::/64', 'wxobs:203.0.113.10', 'wxobs:203.0.113.9'], 'one count each, none the hub’s');
});

test('Weather’s “roughly where you are”: the browser’s place through the hub, its own straight, never one a browser says', async () => {
  const where = async (headers) => {
    const d = drive('https://weather.inflite.ai/api/weather/where', { headers, next: (req) => weatherApi({ request: req, env: {}, params: { path: ['where'] }, waitUntil() {} }) });
    return (await d.run()).json();
  };
  assert.equal((await where({ 'X-Hub-Key': KEY, 'X-Hub-IP': '203.0.113.9', 'X-Hub-Geo': geoOf(LONDON) })).name, 'London');
  assert.equal((await where({})).name, 'Ashburn', 'straight: Cloudflare’s own word');
  assert.equal((await where({ 'X-Hub-Geo': geoOf(LONDON), 'X-Hub-Ok': '1' })).name, 'Ashburn', 'said by a browser: not believed');
  assert.equal((await where({ 'X-Hub-Key': KEY, 'X-Hub-Geo': geoOf(LONDON) })).tz, 'Europe/London');
});

test('cfOf: the hub’s word on the browser’s place, those six alone, and only with X-Hub-Ok', () => {
  const at = (headers, cf = HUB_CF) => { const r = new Request('https://chat.inflite.ai/x', { headers }); Object.defineProperty(r, 'cf', { value: cf }); return r; };
  assert.deepEqual(cfOf(at({ 'X-Hub-Ok': '1', 'X-Hub-Geo': geoOf({ ...LONDON, colo: 'XXX', evil: '<x>' }) })), { ...LONDON, colo: 'IAD', asn: 13335 });
  assert.deepEqual(cfOf(at({ 'X-Hub-Ok': '1', 'X-Hub-Geo': geoOf({ country: 'GB' }) })), { country: 'GB', colo: 'IAD', asn: 13335 }, 'what the hub didn’t know isn’t the hub’s own place either');
  assert.deepEqual(cfOf(at({ 'X-Hub-Geo': geoOf(LONDON) })), HUB_CF, 'without X-Hub-Ok');
  // (from the hub, with nothing usable said: none of the six, never the hub Worker's own place)
  const NOWHERE = { colo: 'IAD', asn: 13335 };
  assert.deepEqual(cfOf(at({ 'X-Hub-Ok': '1' })), NOWHERE, 'with nothing said');
  for (const bad of ['', '%%%', geoOf([1, 2]), geoOf('London'), geoOf(null), Buffer.from('{not json').toString('base64url'), 'x'.repeat(3000), geoOf({ ...LONDON, pad: 'x'.repeat(2000) })])
    assert.deepEqual(cfOf(at({ 'X-Hub-Ok': '1', 'X-Hub-Geo': bad })), NOWHERE, bad.slice(0, 20));
  assert.deepEqual(cfOf(at({ 'X-Hub-Ok': '1', 'X-Hub-Geo': geoOf({}) })), NOWHERE, 'as with nothing known');
  assert.deepEqual(cfOf(at({ 'X-Hub-Ok': '1', 'X-Hub-Geo': geoOf({ city: { x: 1 }, latitude: NaN, country: 'GB' }) })), { country: 'GB', colo: 'IAD', asn: 13335 });
  assert.deepEqual(cfOf(at({ 'X-Hub-Ok': '1', 'X-Hub-Geo': geoOf({ city: 'Zürich', country: 'CH' }) }, null)), { city: 'Zürich', country: 'CH' }, 'with no cf of its own');
  assert.deepEqual(cfOf(null), {}); assert.deepEqual(cfOf(new Request('https://x/')), {});
  // (a sign-in's place, as it's kept with it)
  assert.equal(placeOf(at({ 'X-Hub-Ok': '1', 'X-Hub-Geo': geoOf(LONDON) })), 'London, United Kingdom');
  assert.equal(placeOf(at({})), 'Ashburn, United States');
  assert.equal(placeOf(at({ 'X-Hub-Ok': '1' })), null, 'from the hub, saying nothing: nowhere, never the hub’s place');
});

test('originOk takes InFlite’s hub origins exactly, beside its own address; /.well-known/webauthn lists them', async () => {
  const chat = new Request('https://chat.inflite.ai/api/pigeon/passkey-add');
  assert.ok(originOk('https://chat.inflite.ai', chat, {}), 'its own address, as before');
  assert.ok(originOk('https://inflite.ai', chat, {}), 'the hub');
  for (const bad of ['https://inflite.ai/', 'http://inflite.ai', 'https://inflite.ai:444', 'https://inflite.ai.evil.example', 'https://evil.inflite.ai', 'https://next.inflite.ai', 'https://weather.inflite.ai', 'null', '', undefined])
    assert.ok(!originOk(bad, chat, {}), String(bad));
  const env = { HUB_ORIGINS: 'https://inflite.ai, https://next.inflite.ai' };
  assert.ok(originOk('https://next.inflite.ai', chat, env)); assert.ok(originOk('https://inflite.ai', chat, env));
  assert.ok(!originOk('https://next.inflite.ai.evil.example', chat, env));
  // (the tests' site)
  const tests = { APPS_SITE: 'ifl.test', ACCOUNT_SITE: 'gfg.test', HUB_ORIGINS: 'http://ifl.test:8788' };
  assert.ok(originOk('http://ifl.test:8788', new Request('http://chat.ifl.test:8788/api/pigeon/x'), tests));
  assert.ok(!originOk('http://ifl.test:8789', new Request('http://chat.ifl.test:8788/api/pigeon/x'), tests));
  assert.deepEqual(hubOrigins({}, chat), ['https://inflite.ai']);
  assert.deepEqual(hubOrigins(env, chat), ['https://inflite.ai', 'https://next.inflite.ai']);
  // (the passkeys' related origins, at the home page's address)
  const list = async (e) => { const d = drive('https://georgefarrowgreen.com/.well-known/webauthn', { env: e }); return (await (await d.run()).json()).origins; };
  const prod = await list({});
  assert.deepEqual(prod, ['https://chat.inflite.ai', 'https://account.inflite.ai', 'https://auth.inflite.ai', 'https://weather.inflite.ai', 'https://fitness.inflite.ai', 'https://finance.inflite.ai', 'https://inflite.ai']);
  assert.deepEqual((await list(env)).slice(-2), ['https://inflite.ai', 'https://next.inflite.ai']);
  assert.equal(new Set(await list(env)).size, (await list(env)).length, 'each once');
});

test('a sign-in used from the hub is named InFlite’s (and only from the hub)', () => {
  const r = (path, headers) => new Request('https://weather.inflite.ai' + path, { headers });
  assert.equal(homeOf(r('/api/weather/me', { 'X-Hub-Ok': '1' })), 'inflite');
  assert.equal(homeOf(r('/api/weather/me', { 'X-Hub-Ok': '1', 'X-Home-Screen': '1' })), 'inflite');
  assert.equal(homeOf(r('/api/pigeon/sync', { 'X-Hub-Ok': '1', 'X-Home-Screen': '1' })), 'inflite', 'whichever app’s API it used');
  assert.equal(homeOf(r('/api/weather/me', { 'X-Home-Screen': '1' })), 'weather', 'its own Home Screen app, as before');
  assert.equal(homeOf(r('/api/weather/me', {})), null);
  assert.equal(homeOf(r('/api/weather/me', { 'X-Hub-Ok': 'yes' })), null);
  // (Today's own Home Screen app is InFlite's from 1.09: a sign-in used by Today and by the apps in its window keeps one name)
  const today = (headers) => new Request('https://account.inflite.ai/api/account/today/cards', { headers });
  assert.equal(homeOf(today({ 'X-Home-Screen': '1' })), 'inflite');
  assert.equal(homeOf(today({})), null, 'Today in a browser tab: no Home Screen app');
  assert.equal(homeOf(new Request('https://account.inflite.ai/api/account/me', { headers: { 'X-Home-Screen': '1' } })), 'account', 'the account’s page, as before');
});
