// InFlite's hub (the inflite repo's today/src/hub.js, where it's checked out beside this one), run here with fetch
// stood in for the apps' hosts: which paths are the hub's (and that Today's own stay Today's); each prefix to its app's
// host, spoken as the app (its Origin) only once the hub's own checks have passed; an API write only from the hub's own
// page; only the account's cookie on, and Chat's bearer to Chat alone; pages with neither; the account's Set-Cookie back
// from an API alone; redirects to an app's host turned into the hub's paths; the hub's key and what it knows of the
// browser sent with each; where it connects apart from who it speaks as; the apps' server-to-server routes never, nor a
// path that climbs out of its app's API; an app's API never by way of a page's path; no more of a body than the app
// takes; each app's version; nothing at all until its key is set; /api/hub ready only once Chat's host takes that key
// (its /_hub/version, asked as the hub asks), kept five minutes after a yes and one after a no; and nothing served while
// Chat's host says it doesn't know the key (spec §3.3, addendum A1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const SRC = new URL('../../../../inflite/today/src/hub.js', import.meta.url);
const INDEX = new URL('../../../../inflite/today/src/index.js', import.meta.url);
const skip = !existsSync(SRC) && 'the inflite repo isn’t beside this one';
const H = skip ? null : await import(SRC);
const worker = skip ? null : (await import(INDEX)).default;

const SITE = 'https://inflite.ai', KEY = 'hub-key-0123456789abcdef';
const TOKEN = 'Q2hhdFNlc3Npb25Ub2tlbjEyMzQ1Njc4', BEARER = 'Bearer chat-token-0123456789';
const ORIGINS = { CHAT_ORIGIN: 'https://chat.inflite.ai', WEATHER_ORIGIN: 'https://weather.inflite.ai', FITNESS_ORIGIN: 'https://fitness.inflite.ai',
  MARKETS_ORIGIN: 'https://finance.inflite.ai', MAIL_ORIGIN: 'https://email.inflite.ai', AUTH_ORIGIN: 'https://auth.inflite.ai' };
const env = (extra = {}) => ({ ACCOUNT_ORIGIN: 'https://account.inflite.ai', HUB_KEY: KEY, ...ORIGINS, ASSETS: { fetch: async (r) => { assets.push(new URL(r.url).pathname); return new Response('asset'); } }, ...extra });
const assets = [];

// (the apps' hosts: each request the hub made, and an answer by path)
function apps(answer = () => Response.json({ ok: true })) {
  const asked = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url), h = new Headers(init.headers);
    let body = init.body ?? null;
    if (body && typeof body.getReader === 'function') body = new Uint8Array(await new Response(body).arrayBuffer());
    asked.push({ url: u, method: init.method || 'GET', headers: h, body, redirect: init.redirect });
    return answer(u, init);
  };
  return asked;
}
// (a request from the hub's own pages, as a browser sends it, with anything changed; cf: where Cloudflare says it's from)
const req = (path, { method = 'GET', headers = {}, body, cf } = {}) => {
  const h = { 'Sec-Fetch-Site': 'same-origin', 'User-Agent': 'TestPhone/1.0', 'CF-Connecting-IP': '203.0.113.9', ...headers };
  if (method !== 'GET' && method !== 'HEAD') Object.assign(h, { Origin: SITE, 'Content-Type': 'application/json', ...headers });
  for (const k of Object.keys(h)) if (h[k] == null) delete h[k];
  const r = new Request(SITE + path, { method, headers: h, body: body === undefined ? undefined : typeof body === 'string' || body instanceof Uint8Array || body instanceof ReadableStream ? body : JSON.stringify(body), duplex: 'half' });
  if (cf) Object.defineProperty(r, 'cf', { value: cf });
  return r;
};
const call = async (r, e = env()) => { const res = await H.hub(r, e, {}); let data = null; try { data = await res.clone().json(); } catch {} return { res, data }; };
const geo = (h) => JSON.parse(Buffer.from(h.get('x-hub-geo'), 'base64url').toString('utf8'));
// (what /api/hub says, through Today's Worker: always 200, never kept)
const hubSaid = async (e, headers = {}) => { const r = await worker.fetch(new Request(SITE + '/api/hub', { headers }), e, {}); assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store'); return r.json(); };

test('the hub’s paths, each prefix to its app, and Today’s own paths left to Today', { skip }, async () => {
  assert.deepEqual(H.PAGES, { '/chats/': { app: 'CHAT', under: '/_hub/' }, '/weather/': { app: 'WEATHER' }, '/fitness/': { app: 'FITNESS' }, '/markets/': { app: 'MARKETS' } });
  assert.deepEqual(H.APIS, { '/api/pigeon/': 'CHAT', '/api/weather/': 'WEATHER', '/api/fitness/': 'FITNESS', '/api/markets/': 'MARKETS' });
  assert.deepEqual(H.CAPS, { CHAT: 9 << 20, FITNESS: (25 << 20) + (128 << 10), WEATHER: 64 << 10, MARKETS: 64 << 10 });
  for (const p of ['/chats', '/chats/', '/chats/sw.js', '/weather', '/weather/', '/fitness/x', '/markets/app.js', '/api/pigeon/sync', '/api/weather/where', '/api/fitness/me', '/api/markets/quotes', '/api/hub'])
    assert.ok(H.isHubPath(p), p);
  for (const p of ['/', '/apps/', '/apps/chat.svg', '/chatsy', '/weathers/', '/mail/', '/api/session', '/api/today', '/api/pigeon', '/api/account/me', '/api/hubs', '/version', '/chat/'])
    assert.ok(!H.isHubPath(p), p);
  // (through Today's Worker: each to its host; an unknown prefix is Today's API's 404, and its icon folder the assets')
  const asked = apps();
  const routes = [['/chats/', 'https://chat.inflite.ai/_hub/'], ['/chats/app.js?v=1', 'https://chat.inflite.ai/_hub/app.js?v=1'], ['/weather/?lat=1&lon=2', 'https://weather.inflite.ai/?lat=1&lon=2'],
    ['/fitness/today.js', 'https://fitness.inflite.ai/today.js'], ['/markets/', 'https://finance.inflite.ai/'], ['/api/pigeon/sync?since=4', 'https://chat.inflite.ai/api/pigeon/sync?since=4'],
    ['/api/weather/where', 'https://weather.inflite.ai/api/weather/where'], ['/api/fitness/me?today=1', 'https://fitness.inflite.ai/api/fitness/me?today=1'], ['/api/markets/quotes', 'https://finance.inflite.ai/api/markets/quotes']];
  for (const [p, to] of routes) await worker.fetch(req(p), env(), {});
  assert.deepEqual(asked.map((a) => a.url.href), routes.map(([, to]) => to));
  assets.length = 0;
  const unknown = await worker.fetch(req('/api/notes/x'), env(), {});
  assert.equal(unknown.status, 404);
  await worker.fetch(req('/apps/chat.svg'), env(), {});
  assert.deepEqual(assets, ['/apps/chat.svg'], 'Today’s icon folder stays Today’s');
  assert.equal(asked.length, routes.length, 'neither went to an app');
});

test('/chats, /weather, /fitness and /markets go to the same with a slash; anything but GET or HEAD isn’t a page’s', { skip }, async () => {
  const asked = apps();
  for (const [p, to] of [['/chats', '/chats/'], ['/weather?lat=1', '/weather/?lat=1'], ['/fitness', '/fitness/'], ['/markets', '/markets/']]) {
    const { res } = await call(req(p));
    assert.equal(res.status, 301, p); assert.equal(res.headers.get('location'), SITE + to, p);
  }
  for (const m of ['POST', 'PUT', 'DELETE']) assert.equal((await call(req('/weather/', { method: m, body: {} }))).res.status, 405, m);
  assert.equal(asked.length, 0);
});

test('an API write needs the hub’s own page (same-origin, its Origin); a GET from another site is refused; the app’s Origin is spoken only after', { skip }, async () => {
  const asked = apps();
  const refused = async (r, why) => { const { res, data } = await call(r); assert.equal(res.status, 403, why); assert.match(data.error, /didn’t come from InFlite/, why); };
  await refused(req('/api/fitness/time', { method: 'PUT', headers: { 'Sec-Fetch-Site': 'cross-site' }, body: {} }), 'another site');
  await refused(req('/api/fitness/time', { method: 'PUT', headers: { 'Sec-Fetch-Site': 'same-site' }, body: {} }), 'another inflite.ai page');
  await refused(req('/api/fitness/time', { method: 'PUT', headers: { 'Sec-Fetch-Site': 'none' }, body: {} }), 'none, on a write');
  await refused(req('/api/fitness/time', { method: 'PUT', headers: { Origin: 'https://fitness.inflite.ai' }, body: {} }), 'the app’s own Origin, from the browser');
  await refused(req('/api/fitness/time', { method: 'PUT', headers: { Origin: null }, body: {} }), 'no Origin');
  await refused(req('/api/pigeon/send', { method: 'POST', headers: { Origin: 'https://inflite.ai.evil.example' }, body: {} }), 'a look-alike Origin');
  await refused(req('/api/weather/me', { headers: { 'Sec-Fetch-Site': 'cross-site' } }), 'a GET from another site');
  await refused(req('/api/weather/me', { headers: { 'Sec-Fetch-Site': 'same-site' } }), 'a GET from another inflite.ai page');
  assert.equal(asked.length, 0, 'none went on');
  // (its own page; one typed or opened from the Home Screen, a GET; a browser too old to say)
  await call(req('/api/fitness/time', { method: 'PUT', body: { day: '2026-11-03' } }));
  await call(req('/api/weather/me', { headers: { 'Sec-Fetch-Site': 'none' } }));
  await call(req('/api/markets/quotes', { headers: { 'Sec-Fetch-Site': null } }));
  assert.equal(asked.length, 3);
  assert.equal(asked[0].method, 'PUT'); assert.deepEqual(JSON.parse(Buffer.from(asked[0].body).toString()), { day: '2026-11-03' });
  for (const [a, origin] of [[asked[0], 'https://fitness.inflite.ai'], [asked[1], 'https://weather.inflite.ai'], [asked[2], 'https://finance.inflite.ai']]) {
    assert.equal(a.headers.get('origin'), origin, 'spoken as the app');
    assert.equal(a.headers.get('sec-fetch-site'), 'same-origin');
    assert.equal(a.redirect, 'manual');
  }
  // (and methods an API never has)
  for (const m of ['OPTIONS', 'TRACE', 'CONNECT']) { try { assert.equal((await call(req('/api/weather/me', { method: m }))).res.status, 405, m); } catch (e) { if (!/forbidden|not supported|TRACE|CONNECT/i.test(e.message)) throw e; } }
});

test('only the account’s cookie goes on, Chat’s bearer to Chat alone, the browser’s few headers; pages carry neither cookie nor bearer', { skip }, async () => {
  const asked = apps();
  const headers = { Cookie: `__Secure-known-device=abc123; theme=dark; __Secure-account=${TOKEN}; other=1`, Authorization: BEARER, 'X-Home-Screen': '1', Accept: 'application/json',
    'If-None-Match': '"v1"', Range: 'bytes=0-9', Referer: 'https://inflite.ai/x', 'X-Secret': 'nope', 'Accept-Language': 'en-GB', 'X-Hub-Ok': '1', 'X-Hub-Key': 'forged', 'X-Hub-IP': '10.0.0.1' };
  await call(req('/api/pigeon/sync', { headers }));
  await call(req('/api/weather/me', { headers }));
  await call(req('/chats/', { headers }));
  await call(req('/weather/app.js', { headers }));
  const [chat, wx, chatPage, wxFile] = asked.map((a) => a.headers);
  assert.equal(chat.get('cookie'), `__Secure-account=${TOKEN}`);
  assert.equal(chat.get('authorization'), BEARER, 'Chat’s bearer, to Chat');
  assert.equal(wx.get('cookie'), `__Secure-account=${TOKEN}`);
  assert.equal(wx.get('authorization'), null, 'never to another app');
  for (const h of [chatPage, wxFile]) { assert.equal(h.get('cookie'), null, 'no cookie with a page'); assert.equal(h.get('authorization'), null, 'nor a bearer'); }
  for (const h of [chat, wx, chatPage, wxFile]) {
    assert.equal(h.get('user-agent'), 'TestPhone/1.0'); assert.equal(h.get('x-home-screen'), '1'); assert.equal(h.get('accept'), 'application/json');
    assert.equal(h.get('if-none-match'), '"v1"'); assert.equal(h.get('range'), 'bytes=0-9');
    for (const k of ['referer', 'x-secret', 'accept-language', 'x-hub-ok', 'cf-connecting-ip']) assert.equal(h.get(k), null, k);
    assert.equal(h.get('x-hub-key'), KEY, 'the hub’s own key, never the browser’s');
    assert.equal(h.get('x-hub-ip'), '203.0.113.9', 'the browser’s address as Cloudflare saw it, never as the browser said');
  }
  // (the plain name too, and none at all: none sent)
  await call(req('/api/fitness/me', { headers: { Cookie: `account=${TOKEN}; x=1` } }));
  await call(req('/api/fitness/me', { headers: { Cookie: 'theme=dark' } }));
  assert.equal(asked[4].headers.get('cookie'), `account=${TOKEN}`);
  assert.equal(asked[5].headers.get('cookie'), null);
});

test('X-Hub-Key, X-Hub-IP and X-Hub-Geo (the browser’s place, those six alone) go with every request', { skip }, async () => {
  const asked = apps();
  const cf = { country: 'GB', region: 'England', city: 'Londón', latitude: '51.50740', longitude: '-0.12780', timezone: 'Europe/London', colo: 'LHR', asn: 13335, clientTcpRtt: 9 };
  await call(req('/api/weather/where', { cf }));
  await call(req('/fitness/', { cf, headers: { 'CF-Connecting-IP': '2001:db8::7' } }));
  await call(req('/markets/', { headers: { 'CF-Connecting-IP': null } }));
  assert.deepEqual(geo(asked[0].headers), { country: 'GB', region: 'England', city: 'Londón', latitude: '51.50740', longitude: '-0.12780', timezone: 'Europe/London' });
  assert.equal(asked[0].headers.get('x-hub-key'), KEY);
  assert.equal(asked[1].headers.get('x-hub-ip'), '2001:db8::7');
  assert.deepEqual(geo(asked[2].headers), {}, 'none known: none said');
  assert.equal(asked[2].headers.get('x-hub-ip'), null);
});

test('where it connects (*_VIA, a test’s pass-through) apart from who it speaks as (*_ORIGIN)', { skip }, async () => {
  const asked = apps();
  const e = env({ CHAT_ORIGIN: 'http://chat.ifl.test:8788', CHAT_VIA: 'http://127.0.0.1:8792', WEATHER_ORIGIN: 'http://weather.ifl.test:8788', WEATHER_VIA: 'http://127.0.0.1:8802' });
  await call(new Request('http://ifl.test:8788/api/pigeon/sync', { headers: { 'Sec-Fetch-Site': 'same-origin', Authorization: BEARER } }), e);
  await call(new Request('http://ifl.test:8788/weather/'), e);
  await call(new Request('http://ifl.test:8788/fitness/'), e);
  assert.deepEqual(asked.map((a) => a.url.href), ['http://127.0.0.1:8792/api/pigeon/sync', 'http://127.0.0.1:8802/', 'https://fitness.inflite.ai/']);
  assert.deepEqual(asked.map((a) => a.headers.get('origin')), ['http://chat.ifl.test:8788', 'http://weather.ifl.test:8788', 'https://fitness.inflite.ai']);
  // (a write's Origin is the hub's own, there)
  await call(new Request('http://ifl.test:8788/api/weather/subscribe', { method: 'POST', body: '{}', headers: { 'Sec-Fetch-Site': 'same-origin', Origin: 'http://ifl.test:8788' } }), e);
  assert.equal(asked.length, 4);
  // (a path that starts // is a path at the app's host, never another host)
  await call(req('/weather//evil.example/x'));
  assert.equal(asked[4].url.host, 'weather.inflite.ai'); assert.equal(asked[4].url.pathname, '//evil.example/x');
});

test('the account’s Set-Cookie comes back from an API alone, and only that cookie', { skip }, async () => {
  apps(() => { const h = new Headers({ 'Content-Type': 'application/json' }); for (const c of [`__Secure-account=${TOKEN}; Domain=inflite.ai; Path=/; HttpOnly; Secure; SameSite=Lax`, 'theme=dark; Path=/', `account=${TOKEN}; Path=/`, 'hop=x; Path=/', '__Secure-known-device=abc; Path=/']) h.append('Set-Cookie', c); return new Response('{}', { headers: h }); });
  const api = (await call(req('/api/pigeon/handback', { method: 'POST', body: {} }))).res;
  assert.deepEqual(api.headers.getSetCookie(), [`__Secure-account=${TOKEN}; Domain=inflite.ai; Path=/; HttpOnly; Secure; SameSite=Lax`, `account=${TOKEN}; Path=/`]);
  for (const p of ['/chats/', '/weather/app.js', '/fitness/version']) assert.deepEqual((await call(req(p))).res.headers.getSetCookie(), [], p);
});

test('a redirect to an app’s host comes back as the hub’s path; account., auth. and anywhere else as they were', { skip }, async () => {
  const e = env();
  const to = (loc, from = 'https://weather.inflite.ai/') => H.hubPath(loc, e, { from, here: SITE });
  assert.equal(to('https://chat.inflite.ai/#open=abc'), '/chats/#open=abc');
  assert.equal(to('https://chat.inflite.ai/_hub/tracker?x=1'), '/chats/tracker?x=1');
  assert.equal(to('https://weather.inflite.ai/?lat=1&lon=2'), '/weather/?lat=1&lon=2');
  assert.equal(to('https://fitness.inflite.ai/#activities'), '/fitness/#activities');
  assert.equal(to('https://finance.inflite.ai/#s=TSCO'), '/markets/#s=TSCO');
  assert.equal(to('https://email.inflite.ai/'), '/mail/');
  assert.equal(to('https://inflite.ai/#apps'), '/#apps');
  assert.equal(to('/x?y=1'), '/weather/x?y=1', 'relative: to the app it came from');
  assert.equal(to('x', 'https://chat.inflite.ai/_hub/a/b'), '/chats/a/x');
  assert.equal(to('https://chat.inflite.ai/api/pigeon/x'), '/api/pigeon/x', 'an app’s API: the same path at the hub');
  assert.equal(to('https://fitness.inflite.ai/api/fitness/strava/back?x=1'), '/api/fitness/strava/back?x=1');
  for (const same of ['https://chat.inflite.ai/api/account/me', 'https://weather.inflite.ai/api/pigeon/x', 'https://account.inflite.ai/#notify', 'https://auth.inflite.ai/?for=today',
    'https://evil.example/', 'https://chat.inflite.ai.evil.example/', 'http://chat.inflite.ai/', 'https://chat.inflite.ai:444/', 'https://u:p@chat.inflite.ai/', 'javascript:alert(1)',
    'https://email.inflite.ai/api/session', 'https://georgefarrowgreen.com/'])
    assert.equal(to(same), same, same);
  assert.equal(to('https://inflite.ai//evil.example/'), 'https://inflite.ai//evil.example/', 'never a path another site’s address could be read from');
  // (the staging hub takes the site it stands in for as its own; and a test's pass-through address as its app's)
  assert.equal(H.hubPath('https://inflite.ai/#you', { ...e, TODAY_AS: 'https://inflite.ai' }, { here: 'https://next.inflite.ai' }), '/#you');
  assert.equal(H.hubPath('http://127.0.0.1:8792/_hub/', { ...e, CHAT_VIA: 'http://127.0.0.1:8792' }, { here: SITE }), '/chats/');
  // (as answers: the Location rewritten, the redirect not followed)
  const asked = apps((u) => new Response(null, { status: 302, headers: { Location: u.pathname.startsWith('/api/') ? 'https://auth.inflite.ai/?for=chat' : '/sw.js?x=1' } }));
  const page = (await call(req('/weather/old'))).res, api = (await call(req('/api/weather/me'))).res;
  assert.equal(page.status, 302); assert.equal(page.headers.get('location'), '/weather/sw.js?x=1');
  assert.equal(api.headers.get('location'), 'https://auth.inflite.ai/?for=chat');
  assert.ok(asked.every((a) => a.redirect === 'manual'));
});

test('the apps’ server-to-server routes are never the hub’s, however they’re written', { skip }, async () => {
  const asked = apps();
  for (const p of ['/api/pigeon/notify-tick', '/api/pigeon/notify-tick/x', '/api/pigeon/%6eotify-tick', '/api/weather/tick', '/api/weather/%74ick', '/api/fitness/garmin-tick', '/api/fitness/strava/hook',
    '/api/fitness/strava//hook', '/api/markets/tick', '/api/pigeon/x/..%2Fnotify-tick', '/api/pigeon/x/..%2fnotify-tick', '/api/pigeon/x/%2e%2e%2Fnotify-tick', '/api/pigeon/x%2F..%2F..%2Fpigeon%2Fnotify-tick',
    '/api/fitness/strava/x%2F..%2Fhook', '/api/pigeon/%23%2F..%2Fnotify-tick', '/api/pigeon/x/..%5Cnotify-tick', '/api/markets/x/..%252Ftick']) {
    for (const method of ['GET', 'POST']) {
      const { res } = await call(req(p, { method, body: method === 'POST' ? {} : undefined, headers: { Authorization: 'Bearer tick-secret' } }));
      assert.equal(res.status, 404, `${method} ${p}`);
    }
  }
  assert.equal(asked.length, 0);
  // (nor, read as the app's host reads it, anything outside the app's own API)
  for (const p of ['/api/weather/..%2Ffitness%2Fme', '/api/weather/x/..%2F..%2Fpigeon/sync', '/api/pigeon/..%2F..%2Fapi/account/me', '/api/fitness/x/%2e%2e%2F%2e%2e%2F%2e%2e%2Fversion'])
    assert.equal((await call(req(p, { headers: { Cookie: `__Secure-account=${TOKEN}` } }))).res.status, 404, p);
  assert.equal(asked.length, 0);
  // (names that only start the same are the app's to answer; and a path whose dots stay inside it)
  await call(req('/api/pigeon/notify-ticks')); await call(req('/api/weather/ticker')); await call(req('/api/weather/a/..%2Fme'));
  assert.equal(asked.length, 3);
  assert.equal(asked[2].url.pathname, '/api/weather/a/..%2Fme', 'sent on as it came');
});

test('no more of a body than the app takes: by what the browser says, and counted where it doesn’t say', { skip }, async () => {
  const asked = apps();
  const big = (n) => new Uint8Array(n).fill(97);
  const chunked = (n) => new ReadableStream({ start(c) { for (let i = 0; i < n; i += 16384) c.enqueue(big(Math.min(16384, n - i))); c.close(); } });
  for (const [p, cap] of [['/api/weather/subscribe', 64 << 10], ['/api/markets/alerts', 64 << 10], ['/api/pigeon/photo', 9 << 20], ['/api/fitness/upload', (25 << 20) + (128 << 10)]]) {
    const said = await call(req(p, { method: 'POST', headers: { 'Content-Length': String(cap + 1) }, body: 'x' }));
    assert.equal(said.res.status, 413, `${p}: said to be too big`); assert.match(said.data.error, /too much/);
    const over = await call(req(p, { method: 'POST', body: chunked(cap + 1) }));
    assert.equal(over.res.status, 413, `${p}: counted, past its cap`);
  }
  assert.equal(asked.length, 0, 'none of it went on');
  const fits = await call(req('/api/weather/subscribe', { method: 'POST', body: chunked(64 << 10) }));
  assert.equal(fits.res.status, 200);
  assert.equal(asked[0].body.length, 64 << 10, 'one at the cap goes on whole');
  await call(req('/api/pigeon/photo', { method: 'POST', body: big(5 << 20), headers: { 'Content-Type': 'application/octet-stream' } }));
  assert.equal(asked[1].body.length, 5 << 20); assert.equal(asked[1].headers.get('content-type'), 'application/octet-stream');
  // (a GET's body, if any, never)
  assert.equal(asked.length, 2);
});

test('each app’s version, as its updater asks it (Chat’s from its hub copy)', { skip }, async () => {
  const asked = apps((u) => Response.json({ app: u.host.split('.')[0], build: '1.70', min: null }));
  for (const [p, to] of [['/chats/version', 'https://chat.inflite.ai/_hub/version'], ['/weather/version', 'https://weather.inflite.ai/version'], ['/fitness/version', 'https://fitness.inflite.ai/version'],
    ['/markets/version', 'https://finance.inflite.ai/version']]) {
    const { res, data } = await call(req(p));
    assert.equal(res.status, 200, p); assert.equal(data.build, '1.70', p);
    assert.equal(asked.at(-1).url.href, to, p);
    assert.equal(asked.at(-1).headers.get('cookie'), null);
  }
  // (and Today's own is still Today's Worker's)
  apps(() => assert.fail('not an app’s'));
  const today = await worker.fetch(new Request(SITE + '/version'), { ...env(), ASSETS: { fetch: async () => new Response('const BUILD = "1.09";') }, CF_VERSION_METADATA: { id: 'x' + Math.random() } }, {});
  assert.equal((await today.json()).build, '1.09');
});

test('until its key is set, every hub path answers 503, and /api/hub says it isn’t ready without asking any app', { skip }, async () => {
  H.forgetProbe();
  const asked = apps();
  const none = env({ HUB_KEY: undefined });
  for (const p of ['/chats', '/chats/', '/weather/', '/fitness/app.js', '/markets/version', '/api/pigeon/sync', '/api/weather/where']) {
    const { res, data } = await call(req(p), none);
    assert.equal(res.status, 503, p); assert.match(data.error, /InFlite isn’t ready here yet/, p);
  }
  assert.deepEqual(await hubSaid(none), { ready: false });
  assert.deepEqual(await hubSaid(env({ HUB_KEY: '' })), { ready: false });
  assert.deepEqual(await hubSaid(env({ CHAT_ORIGIN: undefined })), { ready: false }, 'nor without every app’s address');
  assert.deepEqual(await hubSaid(env({ MARKETS_ORIGIN: '' })), { ready: false });
  assert.equal(asked.length, 0, 'without the key, no app is asked');
  assert.equal((await worker.fetch(new Request(SITE + '/api/hub', { method: 'POST', headers: { Origin: SITE, 'Sec-Fetch-Site': 'same-origin' } }), env(), {})).status, 405);
  assert.equal(asked.length, 0);
});

test('with its key, /api/hub is ready only once Chat’s host takes that key: /_hub/version, asked as the hub asks', { skip }, async () => {
  // (MAIN without the key, or with another: /_hub/ is not found there)
  H.forgetProbe();
  let asked = apps(() => new Response('Not found', { status: 404 }));
  assert.deepEqual(await hubSaid(env(), { 'CF-Connecting-IP': '203.0.113.9', Cookie: `__Secure-account=${TOKEN}` }), { ready: false }, 'MAIN said not found: not ready');
  assert.equal(asked.length, 1);
  // (MAIN with it)
  H.forgetProbe();
  asked = apps((u) => (u.pathname === '/_hub/version' ? Response.json({ app: 'chat', build: '1.70', min: null }) : new Response('no', { status: 500 })));
  assert.deepEqual(await hubSaid(env(), { 'CF-Connecting-IP': '203.0.113.9', Cookie: `__Secure-account=${TOKEN}` }), { ready: true }, 'MAIN said 200: ready');
  assert.equal(asked.length, 1);
  const [probe] = asked;
  assert.equal(probe.url.href, 'https://chat.inflite.ai/_hub/version');
  assert.equal(probe.method, 'GET'); assert.equal(probe.redirect, 'manual');
  assert.equal(probe.headers.get('x-hub-key'), KEY, 'with the hub’s key');
  assert.equal(probe.headers.get('x-hub-ip'), '203.0.113.9');
  assert.deepEqual(geo(probe.headers), {});
  assert.equal(probe.headers.get('origin'), 'https://chat.inflite.ai');
  assert.equal(probe.headers.get('cookie'), null, 'no cookie, none needed'); assert.equal(probe.headers.get('authorization'), null);
  // (where it connects, in a test: Chat's pass-through)
  H.forgetProbe();
  asked = apps(() => Response.json({ build: '1.70' }));
  assert.deepEqual(await hubSaid(env({ CHAT_ORIGIN: 'http://chat.ifl.test:8788', CHAT_VIA: 'http://127.0.0.1:8792' })), { ready: true });
  assert.equal(asked[0].url.href, 'http://127.0.0.1:8792/_hub/version'); assert.equal(asked[0].headers.get('origin'), 'http://chat.ifl.test:8788');
  // (no answer at all, a redirect, a 5xx: not ready either)
  for (const answer of [() => { throw new TypeError('connect ECONNREFUSED'); }, () => new Response(null, { status: 302, headers: { Location: 'https://chat.inflite.ai/' } }), () => new Response('down', { status: 503 })]) {
    H.forgetProbe(); apps(answer);
    assert.deepEqual(await hubSaid(env()), { ready: false });
  }
  H.forgetProbe();
});

test('what /api/hub found is kept five minutes after a yes and one after a no, then asked again', { skip }, async () => {
  const now = Date.now;
  let t = 1_800_000_000_000;
  Date.now = () => t;
  try {
    H.forgetProbe();
    let status = 200;
    const asked = apps(() => new Response('{}', { status }));
    assert.deepEqual(await hubSaid(env()), { ready: true });
    t += 299_000;
    assert.deepEqual(await hubSaid(env()), { ready: true });
    assert.equal(asked.length, 1, 'within five minutes of a yes: kept, no app asked');
    status = 404;
    t += 2_000;
    assert.deepEqual(await hubSaid(env()), { ready: false }, 'after five minutes: asked again');
    assert.equal(asked.length, 2);
    status = 200;
    t += 59_000;
    assert.deepEqual(await hubSaid(env()), { ready: false });
    assert.equal(asked.length, 2, 'within a minute of a no: kept');
    t += 2_000;
    assert.deepEqual(await hubSaid(env()), { ready: true }, 'after a minute: asked again');
    assert.equal(asked.length, 3);
    // (kept for that key and that address of Chat's alone)
    assert.deepEqual(await hubSaid(env({ HUB_KEY: 'another-key-0123456789ab' })), { ready: true });
    assert.equal(asked.length, 4, 'another key: asked afresh');
    assert.equal(asked[3].headers.get('x-hub-key'), 'another-key-0123456789ab');
  } finally { Date.now = now; H.forgetProbe(); }
});

test('while Chat’s host has said it doesn’t know the key, every hub path but /api/hub answers 503; a moment’s trouble there never closes it', { skip }, async () => {
  const paths = ['/chats', '/chats/', '/weather/', '/fitness/app.js', '/markets/version', '/api/pigeon/sync', '/api/weather/where'];
  try {
    H.forgetProbe();
    let asked = apps(() => new Response('Not found', { status: 404 }));
    assert.deepEqual(await hubSaid(env()), { ready: false });
    for (const p of paths) {
      const { res, data } = await call(req(p));
      assert.equal(res.status, 503, p); assert.match(data.error, /InFlite isn’t ready here yet/, p);
    }
    assert.equal(asked.length, 1, 'none went on');
    assert.deepEqual(await hubSaid(env()), { ready: false }, '/api/hub still answers');
    // (no answer, or a 5xx: the hub goes on serving, and /api/hub says not ready)
    for (const answer of [() => { throw new TypeError('connect ECONNREFUSED'); }, () => new Response('down', { status: 502 })]) {
      H.forgetProbe();
      apps(answer);
      assert.deepEqual(await hubSaid(env()), { ready: false });
      asked = apps();
      assert.equal((await call(req('/weather/'))).res.status, 200, 'still served');
      assert.equal((await call(req('/api/weather/me'))).res.status, 200);
      assert.equal(asked.length, 2);
    }
    // (with nothing known: served, and Chat's host asked beside it, once, for the next request)
    H.forgetProbe();
    let answered; const gate = new Promise((r) => { answered = r; });
    asked = apps(async (u) => (u.pathname === '/_hub/version' ? (await gate, new Response('Not found', { status: 404 })) : Response.json({ ok: true })));
    const later = [], ctx = { waitUntil: (pr) => later.push(pr) };
    assert.equal((await H.hub(req('/weather/'), env(), ctx)).status, 200, 'nothing known yet: served');
    assert.equal((await H.hub(req('/fitness/'), env(), ctx)).status, 200, 'and while it’s being asked');
    assert.equal(later.length, 1, 'asked once, beside them');
    answered(); await Promise.all(later);
    assert.deepEqual(asked.map((a) => a.url.pathname).sort(), ['/', '/', '/_hub/version']);
    assert.equal((await H.hub(req('/weather/'), env(), ctx)).status, 503, 'and the next one has its answer');
    assert.equal(later.length, 1);
  } finally { H.forgetProbe(); }
});

test('a page’s path never reaches an app’s API: no cookie, no bearer, no checks skipped', { skip }, async () => {
  H.forgetProbe();
  const asked = apps(() => { const h = new Headers({ 'Content-Type': 'application/json' }); h.append('Set-Cookie', `__Secure-account=${TOKEN}; Path=/`); return new Response('{}', { headers: h }); });
  const headers = { Cookie: `__Secure-account=${TOKEN}`, Authorization: BEARER, 'Sec-Fetch-Site': 'cross-site' };
  for (const p of ['/weather/api/weather/me', '/fitness/api/fitness/me', '/markets/api/markets/tick', '/fitness/api/fitness/strava/hook', '/weather/%61pi/weather/me', '/weather/%2561pi/weather/me',
    '/weather//api/weather/me', '/weather/x/..%2Fapi/weather/me', '/weather/API/weather/me', '/weather/api', '/chats/api/pigeon/sync', '/chats/..%2Fapi/pigeon/sync']) {
    for (const site of ['cross-site', 'same-origin']) {
      const { res, data } = await call(req(p, { headers: { ...headers, 'Sec-Fetch-Site': site } }));
      assert.equal(res.status, 404, `${site} ${p}`); assert.equal(data.error, 'Not found.', p);
      assert.deepEqual(res.headers.getSetCookie(), [], p);
    }
  }
  assert.equal(asked.length, 0, 'none went on');
  // (names that only start the same, and an api further in, are the app's pages: without a cookie or bearer)
  for (const p of ['/weather/apis.js', '/weather/x/api/y', '/fitness/api-docs']) await call(req(p, { headers }));
  assert.deepEqual(asked.map((a) => a.url.pathname), ['/apis.js', '/x/api/y', '/api-docs']);
  for (const a of asked) { assert.equal(a.headers.get('cookie'), null, a.url.pathname); assert.equal(a.headers.get('authorization'), null); }
  // (and forward() itself sends neither, nor gives the account's cookie back, unless the API's branch says it's an API)
  const res = await H.forward(env(), req('/x', { headers }), { app: 'WEATHER', path: '/api/weather/me' });
  assert.equal(asked.at(-1).url.pathname, '/api/weather/me');
  assert.equal(asked.at(-1).headers.get('cookie'), null); assert.equal(asked.at(-1).headers.get('authorization'), null);
  assert.deepEqual(res.headers.getSetCookie(), []); assert.equal(res.headers.get('x-robots-tag'), 'noindex');
  // (the API itself, from another site: refused, as ever)
  assert.equal((await call(req('/api/fitness/me', { headers }))).res.status, 403);
});

test('an app that can’t be reached is said in fixed words; the hub’s own answers are never kept or framed', { skip }, async () => {
  apps(() => { throw new TypeError('connect ECONNREFUSED 10.0.0.1:443 secret detail'); });
  const { res, data } = await call(req('/api/fitness/me'));
  assert.equal(res.status, 502); assert.equal(data.error, 'Couldn’t reach that app. Try again in a moment.');
  for (const [k, v] of Object.entries({ 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'cross-origin-resource-policy': 'same-origin' })) assert.equal(res.headers.get(k), v, k);
  assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/);
});

test('the hub never asks Today’s assets, and its source keeps nothing but what /api/hub found (by the clock, for a while)', { skip }, async () => {
  H.forgetProbe();
  apps();
  assets.length = 0;
  for (const p of ['/chats/', '/weather/', '/api/hub', '/api/pigeon/sync', '/markets']) await worker.fetch(req(p), env(), {});
  assert.deepEqual(assets, []);
  H.forgetProbe();
  const src = readFileSync(SRC, 'utf8');
  assert.doesNotMatch(src, /env\.ASSETS|caches\.|localStorage/);
  assert.equal(src.match(/Date\.now\(\)/g).length, 2, 'the clock read twice: for /api/hub, and to see whether what it found is still fresh');
  assert.equal(src.match(/^let /gm).length, 1, 'one thing kept in the isolate: what the probe found (and whether it’s being asked)');
  assert.match(src, /import \{ accountCookie \} from "\.\/account\.js";/, 'the account’s cookie as Today picks it out');
});
