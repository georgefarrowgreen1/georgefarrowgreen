// Precision Fit Studio (fitting.georgefarrowgreen.com, functions/_fitstudio.js): the app at its address's root, under its
// own rules (its scripts only, no frames, not for search) and behind its own sign-in (FITTING_USERS: a hashed password or a
// plain one; a cookie for this address alone; a wrong password limited; a changed FITTING_USERS signs everyone out);
// nothing but its files there; georgefarrowgreen.com/fitting/ sends you on to it, a preview's serves it in place behind
// the same sign-in; and the app asks nothing of anywhere else.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const ROOT = new URL('../../../', import.meta.url);
const { onRequest } = await import('../../../functions/_middleware.js');
const { onRequest: atPath } = await import('../../../functions/fitting/_middleware.js');
const { hashPassword, parseUsers } = await import('../../../functions/_fitstudio.js');
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', webmanifest: 'application/manifest+json', png: 'image/png', woff2: 'font/woff2' };

// the site's files, as Pages' store has them (a page at its name without .html; a file that isn't there: the 404 page)
const store = { async fetch(r) {
  let path = new URL(r.url ?? r).pathname; if (path.endsWith('/')) path += 'index.html';
  let file = new URL('.' + path, ROOT);
  if (!existsSync(file) && existsSync(new URL('.' + path + '.html', ROOT))) { file = new URL('.' + path + '.html', ROOT); path += '.html'; }
  if (!existsSync(file) || path.includes('..')) return new Response(readFileSync(new URL('404.html', ROOT)), { status: 404, headers: { 'content-type': TYPES.html } });
  return new Response(readFileSync(file), { headers: { 'content-type': TYPES[path.split('.').pop()] || 'application/octet-stream', etag: '"x"' } });
} };
const kv = () => { const m = new Map(); return { async get(k) { return m.get(k) ?? null; }, async put(k, v) { m.set(k, v); } }; };
const salt = new Uint8Array(16).fill(7), b64 = (u) => Buffer.from(u).toString('base64');
const USERS = `Kate:pbkdf2$100000$${b64(salt)}$${b64(await hashPassword('kate-password-1', salt))}, Matt:matt-plain-99`;
const HOST = 'https://fitting.georgefarrowgreen.com';
const envOf = (o = {}) => ({ ASSETS: store, FITTING_USERS: USERS, BIO_KV: kv(), ...o });
const ask = (url, { env = envOf(), fn = onRequest, method = 'GET', cookie, origin, body } = {}) => {
  const headers = {}; if (cookie) headers.Cookie = cookie; if (origin) headers.Origin = origin; if (body) headers['Content-Type'] = 'application/json';
  const request = new Request(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return fn({ request, env, next: async () => store.fetch(request), waitUntil() {}, params: {}, data: {} });
};
const signIn = async (name, password, env = envOf(), base = HOST, fn = onRequest) => ask(base + '/api/login', { env, fn, method: 'POST', origin: new URL(base).origin, body: { name, password } });
const cookieOf = (res) => (res.headers.get('set-cookie') || '').split(';')[0];

test('FITTING_USERS: names and secrets, a comma or a new line between them', () => {
  assert.deepEqual(parseUsers('Kate:a b,Matt:pbkdf2$1$x$y\n Sam : z '), [{ name: 'Kate', secret: 'a b' }, { name: 'Matt', secret: 'pbkdf2$1$x$y' }, { name: 'Sam', secret: 'z' }]);
  assert.deepEqual(parseUsers(''), []); assert.deepEqual(parseUsers('nocolon'), []);
});

test('signed out: the page goes to the sign-in, nothing else of the app is given', async () => {
  const page = await ask(HOST + '/');
  assert.equal(page.status, 302); assert.equal(page.headers.get('location'), HOST + '/login');
  for (const f of ['/app.js', '/sw.js', '/vendor/jspdf.umd.min.js', '/vendor/html2canvas.min.js', '/index.html']) {
    const res = await ask(HOST + f);
    assert.ok([302, 401].includes(res.status), `${f}: ${res.status}`);
  }
  const me = await ask(HOST + '/api/me'); assert.equal(me.status, 401);
});

test('the sign-in page and what it shows are open, under the app’s rules', async () => {
  const res = await ask(HOST + '/login');
  assert.equal(res.status, 200); assert.match(res.headers.get('content-type'), /text\/html/);
  const html = await res.text();
  assert.match(html, /<title>Sign in · Precision Fit Studio/);
  // (its styles and script asked for by what they hold, so an older copy kept anywhere is never used with it)
  assert.match(html, /href="styles\.css\?v=[0-9a-f]{12}"/); assert.match(html, /src="login\.js\?v=[0-9a-f]{12}"/);
  assert.equal(res.headers.get('etag'), null);
  assert.match(res.headers.get('content-security-policy'), /script-src 'self'( https:\/\/static\.cloudflareinsights\.com)?;/);
  assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow');
  for (const f of ['/styles.css', '/login.js', '/logo.png', '/fonts/barlow-400.woff2', '/icon-180.png', '/manifest.webmanifest']) assert.equal((await ask(HOST + f)).status, 200, f);
});

test('signing in: a wrong password, a wrong name, from elsewhere, then right (hashed or plain, any case)', async () => {
  assert.equal((await signIn('Kate', 'wrong-password')).status, 401);
  assert.equal((await signIn('Nobody', 'kate-password-1')).status, 401);
  const away = await ask(HOST + '/api/login', { method: 'POST', origin: 'https://evil.example', body: { name: 'Kate', password: 'kate-password-1' } });
  assert.equal(away.status, 403);
  const ok = await signIn('kate', 'kate-password-1');
  assert.equal(ok.status, 200); assert.deepEqual(await ok.json(), { name: 'Kate' });
  const set = ok.headers.get('set-cookie');
  assert.match(set, /^__Host-fit=[\w-]+\.\d+\.[\w-]+; Path=\/; Max-Age=2592000; Secure; HttpOnly; SameSite=Strict$/);
  assert.equal(ok.headers.get('cache-control'), 'no-store');
  assert.equal((await signIn('Matt', 'matt-plain-99')).status, 200);
});

test('signed in: the app, its files and who’s signed in; the sign-in page goes to the app', async () => {
  const cookie = cookieOf(await signIn('Kate', 'kate-password-1'));
  const page = await ask(HOST + '/', { cookie });
  assert.equal(page.status, 200);
  const html = await page.text(); assert.match(html, /<title>Precision Fit Studio/); assert.match(html, /src="app\.js\?v=[0-9a-f]{12}"/);
  assert.equal(page.headers.get('cache-control'), 'private, no-cache');
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  for (const f of ['/app.js', '/sw.js']) { const r = await ask(HOST + f, { cookie }); assert.equal(r.status, 200, f); assert.equal(r.headers.get('cache-control'), 'private, no-cache', f); }
  const lib = await ask(HOST + '/vendor/jspdf.umd.min.js', { cookie }); assert.equal(lib.status, 200); assert.equal(lib.headers.get('cache-control'), 'private, max-age=2592000');
  assert.deepEqual(await (await ask(HOST + '/api/me', { cookie })).json(), { name: 'Kate' });
  const login = await ask(HOST + '/login', { cookie }); assert.equal(login.status, 302); assert.equal(login.headers.get('location'), HOST + '/');
  for (const f of ['/api/markets/quotes', '/nothing-here', '/README.md', '/wrangler.toml', '/.tools/minify.mjs', '/weather/']) assert.equal((await ask(HOST + f, { cookie })).status, 404, f);
  const old = await ask(HOST + '/fitting/app.js', { cookie }); assert.equal(old.status, 301); assert.equal(old.headers.get('location'), HOST + '/app.js');
});

test('a cookie made up, or from before FITTING_USERS changed, or for a name since removed, signs no one in', async () => {
  const cookie = cookieOf(await signIn('Kate', 'kate-password-1'));
  const [name, until, sig] = cookie.split('=')[1].split('.');
  const forged = `__Host-fit=${Buffer.from('Matt').toString('base64url')}.${until}.${sig}`;
  assert.equal((await ask(HOST + '/api/me', { cookie: forged })).status, 401);
  assert.equal((await ask(HOST + '/api/me', { cookie, env: envOf({ FITTING_USERS: USERS + ',Sam:new-person-1' }) })).status, 401);
  assert.equal((await ask(HOST + '/api/me', { cookie: `__Host-fit=${name}.${Date.now() - 1000}.${sig}` })).status, 401);
});

test('signing out ends the cookie', async () => {
  const res = await ask(HOST + '/api/logout', { method: 'POST', origin: HOST });
  assert.equal(res.status, 200); assert.match(res.headers.get('set-cookie'), /^__Host-fit=; Path=\/; Max-Age=0;/);
});

test('eight wrong passwords from one address, then no more for a while', async () => {
  const env = envOf();
  for (let i = 0; i < 8; i++) assert.equal((await signIn('Kate', 'nope-' + i, env)).status, 401);
  const res = await signIn('Kate', 'kate-password-1', env);
  assert.equal(res.status, 429); assert.match((await res.json()).error, /15 minutes/);
});

test('with no FITTING_USERS, no one can sign in, and the app stays shut', async () => {
  const env = envOf({ FITTING_USERS: '' });
  assert.equal((await signIn('Kate', 'kate-password-1', env)).status, 503);
  assert.equal((await ask(HOST + '/', { env })).status, 302);
  assert.equal((await ask(HOST + '/app.js', { env })).status, 401);
});

test('georgefarrowgreen.com/fitting/ sends you on; a preview serves it in place, behind the same sign-in', async () => {
  const on = await ask('https://georgefarrowgreen.com/fitting/app.js', { fn: atPath });
  assert.equal(on.status, 302); assert.equal(on.headers.get('location'), HOST + '/app.js');
  const P = 'https://claude-fitting.georgefarrowgreen.pages.dev/fitting';
  const out = await ask(P + '/', { fn: atPath });
  assert.equal(out.status, 302); assert.equal(out.headers.get('location'), P + '/login');
  assert.equal((await ask(P + '/login', { fn: atPath })).status, 200);
  const cookie = cookieOf(await signIn('Matt', 'matt-plain-99', envOf(), P, atPath));
  assert.ok(cookie.startsWith('__Host-fit='));
  const here = await ask(P + '/', { fn: atPath, cookie });
  assert.equal(here.status, 200); assert.match(here.headers.get('content-security-policy'), /style-src 'self' 'unsafe-inline'/);
  assert.equal((await ask('https://claude-fitting.georgefarrowgreen.pages.dev/fitting', { fn: atPath })).status, 301);
});

test('the app asks nothing of anywhere else, and its worker keeps only files that are there', () => {
  const read = (f) => readFileSync(new URL('fitting/' + f, ROOT), 'utf8');
  for (const f of ['index.html', 'login.html']) {
    const html = read(f);
    assert.doesNotMatch(html.replace(/<!--[\s\S]*?-->/g, ''), /(src|href)="(https?:)?\/\//, f);
    assert.doesNotMatch(html, /<script>|\son[a-z]+="/, `${f}: no inline script, the page’s rules allow only its own files`);
  }
  assert.doesNotMatch(read('styles.css'), /url\((https?:)?\/\//);
  assert.doesNotMatch(read('app.js'), /loadScript\('https?:/);
  const shell = JSON.parse(read('sw.js').match(/const SHELL = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
  for (const f of shell) assert.ok(existsSync(new URL('fitting/' + (f === './' ? 'index.html' : f), ROOT)), f);
});
