// Today's Worker (the inflite repo's today/src/index.js, where it's checked out beside this one), run here with its
// assets and the account's address made up: only the account's cookie goes on, with Today's own origin as Origin; a write
// needs X-Inflite, Today's own Origin and a same-origin Sec-Fetch-Site; no part of an address goes on but the five it
// names (never a push endpoint); the account's Set-Cookie comes back only from signing in and out; an account that can't
// be reached is said in fixed words; /version reads app.js's BUILD and carries no CORS; a picture is only ever a picture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const SRC = new URL('../../../../inflite/today/src/index.js', import.meta.url);
const APP = new URL('../../../../inflite/today/public/app.js', import.meta.url);
const skip = !existsSync(SRC) && 'the inflite repo isn’t beside this one';
const worker = skip ? null : (await import(SRC)).default;

const ACCOUNT = 'https://account.inflite.ai', SITE = 'https://inflite.ai';
const TOKEN = 'Q2hhdFNlc3Npb25Ub2tlbjEyMzQ1Njc4';

// (the account's address: what each request to it was, and its answer by path)
function account(answer = () => Response.json({ ok: true })) {
  const asked = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url), h = new Headers(init.headers);
    asked.push({ url: u, method: init.method || 'GET', headers: h, body: init.body ?? null });
    return answer(u, init);
  };
  return asked;
}
const assets = [];
const env = (extra = {}) => ({
  ACCOUNT_ORIGIN: ACCOUNT,
  CF_VERSION_METADATA: { id: `v-${Math.random()}` },
  ASSETS: { fetch: async (req) => { assets.push(new URL(req.url).pathname); return new URL(req.url).pathname === '/app.js' ? new Response(extra.appJs ?? readFileSync(APP, 'utf8')) : new Response('<!doctype html>page', { headers: { 'Content-Type': 'text/html' } }); } },
  ...extra,
});
// (a request from Today's own page, as a browser sends it, with anything changed)
const req = (path, { method = 'GET', headers = {}, body } = {}) => {
  const h = { 'Sec-Fetch-Site': 'same-origin', 'User-Agent': 'TestPhone/1.0', ...headers };
  if (method !== 'GET' && method !== 'HEAD') Object.assign(h, { 'X-Inflite': '1', Origin: SITE, 'Content-Type': 'application/json', ...headers });
  for (const k of Object.keys(h)) if (h[k] == null) delete h[k];
  return new Request(SITE + path, { method, headers: h, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
};
const call = async (r, e = env()) => { const res = await worker.fetch(r, e, {}); let data = null; try { data = await res.clone().json(); } catch {} return { res, data }; };

test('only the account’s cookie goes on, with Today’s own origin as Origin, and the browser’s few headers', { skip }, async () => {
  const asked = account(() => Response.json({ signedIn: false, links: {} }));
  await call(req('/api/session', { headers: { Cookie: `__Secure-known-device=abc123; theme=dark; __Secure-account=${TOKEN}; other=1`, 'X-Home-Screen': '1', 'CF-Connecting-IP': '203.0.113.9', Referer: 'https://inflite.ai/x', 'X-Secret': 'nope' } }));
  const h = asked[0].headers;
  assert.equal(asked[0].url.href, `${ACCOUNT}/api/account/today/me`);
  assert.equal(h.get('cookie'), `__Secure-account=${TOKEN}`);
  assert.equal(h.get('origin'), SITE);
  assert.equal(h.get('user-agent'), 'TestPhone/1.0');
  assert.equal(h.get('x-home-screen'), '1');
  assert.equal(h.get('cf-connecting-ip'), '203.0.113.9');
  assert.equal(h.get('accept'), 'application/json');
  for (const k of ['referer', 'x-secret', 'sec-fetch-site']) assert.equal(h.get(k), null, k);
  // (the plain name too, and none at all: none sent)
  await call(req('/api/session', { headers: { Cookie: `account=${TOKEN}; x=1` } }));
  assert.equal(asked[1].headers.get('cookie'), `account=${TOKEN}`);
  await call(req('/api/session', { headers: { Cookie: 'account=short; theme=dark' } }));
  assert.equal(asked[2].headers.get('cookie'), null);
  // (a foreign Origin on a GET isn't passed on: Today's own is)
  await call(req('/api/today', { headers: { Origin: 'https://evil.example' } }));
  assert.equal(asked[3].headers.get('origin'), SITE);
});

test('a write needs X-Inflite, Today’s own Origin and Sec-Fetch-Site same-origin; a GET may come from nowhere (none), never another site', { skip }, async () => {
  const asked = account();
  const refused = async (r, error) => { const { res, data } = await call(r); assert.equal(res.status, 403); assert.deepEqual(data, { error }); };
  await refused(req('/api/prefs', { method: 'PUT', headers: { 'X-Inflite': null }, body: {} }), 'Missing request header');
  await refused(req('/api/prefs', { method: 'PUT', headers: { Origin: 'https://evil.example' }, body: {} }), 'That request didn’t come from Today.');
  await refused(req('/api/prefs', { method: 'PUT', headers: { Origin: null }, body: {} }), 'That request didn’t come from Today.');
  await refused(req('/api/prefs', { method: 'PUT', headers: { Origin: 'https://email.inflite.ai' }, body: {} }), 'That request didn’t come from Today.');
  for (const site of ['cross-site', 'same-site', 'none']) await refused(req('/api/push', { method: 'POST', headers: { 'Sec-Fetch-Site': site }, body: {} }), 'That request didn’t come from Today.');
  for (const site of ['cross-site', 'same-site']) await refused(req('/api/session', { headers: { 'Sec-Fetch-Site': site } }), 'That request didn’t come from Today.');
  assert.equal(asked.length, 0, 'nothing refused reached the account');
  // (a GET typed, or opened from the Home Screen; and one from a browser that sends no Sec-Fetch-Site)
  assert.equal((await call(req('/api/session', { headers: { 'Sec-Fetch-Site': 'none' } }))).res.status, 200);
  assert.equal((await call(req('/api/session', { headers: { 'Sec-Fetch-Site': null } }))).res.status, 200);
  assert.equal((await call(req('/api/prefs', { method: 'PUT', body: { order: [] } }))).res.status, 200);
  assert.equal(asked.length, 3);
  assert.equal(asked[2].method, 'PUT');
  assert.equal(asked[2].headers.get('content-type'), 'application/json');
  assert.equal(asked[2].body, '{"order":[]}');
});

test('no part of an address goes on but only, with, device, id and v: never a push endpoint', { skip }, async () => {
  const asked = account(() => Response.json({ at: 1, tz: 'Europe/London', cards: {} }));
  await call(req('/api/today?with=morning&device=AbCdEfGhIjKlMnOp&only=weather,chat&id=x1&v=9&endpoint=https%3A%2F%2Ffcm.googleapis.com%2Ffcm%2Fsend%2Fabc&foo=1&sub=2'));
  const u = asked[0].url;
  assert.equal(u.pathname, '/api/account/today/cards');
  assert.deepEqual([...u.searchParams.keys()].sort(), ['device', 'id', 'only', 'v', 'with']);
  assert.equal(u.searchParams.get('only'), 'weather,chat');
  assert.ok(!u.href.includes('fcm'), u.href);
  await call(req('/api/session?endpoint=x'));
  assert.equal(asked[1].url.search, '');
});

test('each route goes to its own place on the account, with its method; an unknown one goes nowhere', { skip }, async () => {
  const asked = account(() => Response.json({ ok: true }));
  const ROUTES = [
    ['GET', '/api/session', 'today/me'], ['POST', '/api/auth/handback', 'today/handback'], ['POST', '/api/logout', 'today/signout'],
    ['GET', '/api/today', 'today/cards'], ['PUT', '/api/prefs', 'today/prefs'], ['GET', '/api/morning', 'today/morning'], ['PUT', '/api/morning', 'today/morning'],
    ['POST', '/api/morning/try', 'today/morning/try'], ['GET', '/api/push/key', 'today/push-key'], ['POST', '/api/push', 'today/push'],
    ['POST', '/api/push/move', 'today/push-move'], ['DELETE', '/api/push', 'today/push'], ['POST', '/api/account-link', 'today/account-link'],
  ];
  for (const [method, path, to] of ROUTES) {
    const { res } = await call(req(path, { method, body: method === 'GET' ? undefined : { endpoint: 'https://fcm.googleapis.com/fcm/send/x' } }));
    assert.equal(res.status, 200, `${method} ${path}`);
    const a = asked.at(-1);
    assert.equal(`${a.method} ${a.url.pathname}`, `${method} /api/account/${to}`);
    if (method === 'DELETE') assert.equal(a.body, '{"endpoint":"https://fcm.googleapis.com/fcm/send/x"}');
  }
  const n = asked.length;
  assert.equal((await call(req('/api/photo'))).res.status, 404, 'there is no /api/photo');
  assert.equal((await call(req('/api/account/me'))).res.status, 404);
  assert.equal((await call(req('/api/nope', { method: 'POST', body: {} }))).res.status, 404);
  assert.equal((await call(req('/api/session', { method: 'DELETE', body: {} }))).res.status, 405);
  assert.equal(asked.length, n, 'none of those reached the account');
});

test('the account’s Set-Cookie comes back from signing in and out (and the session’s renewal), from nowhere else', { skip }, async () => {
  account((u) => new Response(JSON.stringify(u.pathname.endsWith('/me') || u.pathname.endsWith('/handback') ? { signedIn: true, user: { id: 'u1' } } : { ok: true }), {
    headers: [['Content-Type', 'application/json'], ['Set-Cookie', `__Secure-account=${TOKEN}; Domain=inflite.ai; Path=/; Secure; HttpOnly`], ['Set-Cookie', '__Secure-known=1; Path=/']],
  }));
  const cookies = async (r) => (await call(r)).res.headers.getSetCookie();
  assert.equal((await cookies(req('/api/auth/handback', { method: 'POST', body: { code: 'c', verifier: 'v' } }))).length, 2);
  assert.equal((await cookies(req('/api/logout', { method: 'POST', body: {} }))).length, 2);
  assert.equal((await cookies(req('/api/session'))).length, 2);
  for (const r of [req('/api/today'), req('/api/prefs', { method: 'PUT', body: {} }), req('/api/push', { method: 'POST', body: {} }), req('/api/morning'), req('/api/account-link', { method: 'POST', body: {} })])
    assert.deepEqual(await cookies(r), [], new URL(r.url).pathname);
  // (the session view, and the hand-back's, say where the account is)
  const { data } = await call(req('/api/auth/handback', { method: 'POST', body: { code: 'c', verifier: 'v' } }));
  assert.equal(data.accountOrigin, ACCOUNT);
  assert.equal(data.user.id, 'u1');
});

test('the account’s status and its own words pass on, nothing else of an error; one that can’t be reached is said in fixed words', { skip }, async () => {
  account(() => Response.json({ error: 'Sign in to see your day.', field: 'session', stack: 'D1_ERROR: no such table', sql: 'SELECT' }, { status: 401 }));
  let { res, data } = await call(req('/api/today'));
  assert.equal(res.status, 401);
  assert.deepEqual(data, { error: 'Sign in to see your day.', field: 'session' });
  const DOWN = { error: 'Couldn’t reach your InFlite account. Try again in a moment.' };
  for (const answer of [() => { throw new TypeError('fetch failed'); }, () => new Response('<html>Bad gateway</html>', { status: 502 }), () => new Response('not json', { status: 200 }), () => new Response(null, { status: 302, headers: { Location: 'https://x' } })]) {
    account(answer);
    ({ res, data } = await call(req('/api/session')));
    assert.equal(res.status, 502);
    assert.deepEqual(data, DOWN);
  }
  // (every answer: never kept, never sniffed, never framed, never read by another site)
  account(() => Response.json({ ok: true }));
  ({ res } = await call(req('/api/session')));
  assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('content-security-policy'), "default-src 'none'; frame-ancestors 'none'");
  assert.equal(res.headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.equal(res.headers.get('access-control-allow-origin'), null);
  // (and too much to send goes nowhere)
  const asked = account();
  ({ res } = await call(req('/api/prefs', { method: 'PUT', body: 'x'.repeat(70 * 1024) })));
  assert.equal(res.status, 413);
  assert.equal(asked.length, 0);
});

test('/version reads BUILD from the app.js deployed, carries no CORS, and is no-store; every other page is the assets’', { skip }, async () => {
  account();
  const build = /const BUILD = "([\d.]+)"/.exec(readFileSync(APP, 'utf8'))[1];
  let { res, data } = await call(new Request(`${SITE}/version`, { headers: { Origin: 'https://evil.example' } }));
  assert.deepEqual(data, { build, min: null });
  assert.equal(res.headers.get('access-control-allow-origin'), null);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  ({ data } = await call(new Request(`${SITE}/version`), env({ appJs: 'const BUILD = "7.42";' })));
  assert.equal(data.build, '7.42');
  assets.length = 0;
  for (const p of ['/', '/app.js', '/sw.js', '/nope', '/apiary']) await call(new Request(SITE + p));
  assert.deepEqual(assets, ['/', '/app.js', '/sw.js', '/nope', '/apiary']);
});

test('a picture comes back as it came, kept for good under its v=, and only if it is one', { skip }, async () => {
  let asked = account(() => new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'Content-Type': 'image/png' } }));
  let { res } = await call(req('/api/avatar?id=4f6c8d2e-1a3b-4c5d-8e9f-0a1b2c3d4e5f&v=17&x=1'));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.equal(res.headers.get('cache-control'), 'private, max-age=31536000, immutable');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('content-security-policy'), "default-src 'none'; frame-ancestors 'none'");
  assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [137, 80, 78, 71]);
  assert.equal(asked[0].url.pathname, '/api/account/today/avatar');
  assert.equal(asked[0].headers.get('accept'), 'image/*');
  assert.ok(!asked[0].url.searchParams.has('x'));
  for (const answer of [() => new Response('<script>alert(1)</script>', { headers: { 'Content-Type': 'text/html' } }), () => Response.json({ error: 'No picture.' }, { status: 404 }), () => { throw new TypeError('down'); }]) {
    account(answer);
    ({ res } = await call(req('/api/avatar?id=x')));
    assert.equal(res.status, 404);
    assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
  }
});
