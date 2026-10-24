// The account's page and the files it runs (functions/_acctapp.js): its script, and every module that brings in, asked
// for stamped with what's in them, so a new script always comes with the modules it was made with (a phone that kept
// an older crypto.js ran the new page with it, and couldn't hand a sign-in back to InFlight).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const ROOT = new URL('../../../', import.meta.url);
const TYPES = { js: 'text/javascript', css: 'text/css', html: 'text/html; charset=utf-8', png: 'image/png', svg: 'image/svg+xml' };
// Pages' store of the site's files, as the account's page asks it (changed: a file's text swapped for another's)
const assets = (changed = {}) => ({ async fetch(req) {
  let path = new URL(req.url).pathname; if (path.endsWith('/')) path += 'index.html';
  const file = new URL('.' + path, ROOT);
  if (!changed[path] && !existsSync(file)) return new Response('not here', { status: 404 });
  return new Response(changed[path] ?? readFileSync(file), { headers: { 'content-type': TYPES[path.split('.').pop()] || 'application/octet-stream', etag: '"x"', link: '<crypto.js>; rel="modulepreload"' } });
} });
async function host(changed) {
  const { accountHost } = await import(`../../../functions/_acctapp.js?${Math.random()}`);       // (its own fingerprints each time)
  const env = { ASSETS: assets(changed) };
  return async (path) => {
    const request = new Request('https://account.georgefarrowgreen.com' + path);
    const res = await accountHost({ request, env, next: () => new Response('api') }, new URL(request.url));
    return { res, text: await res.text(), cache: res.headers.get('cache-control') };
  };
}
const stampIn = (text, f) => new RegExp(`"\\.?/?${f.replace('.', '\\.')}\\?v=(\\w{12})"`).exec(text)?.[1];

test('the page asks for its script, styles and crypto.js by what is in them', async () => {
  const get = await host(), page = await get('/');
  assert.equal(page.cache, 'no-store');
  assert.equal(page.res.headers.get('link'), null, 'no unstamped preload hint');
  for (const f of ['app.js', 'styles.css', 'crypto.js']) assert.ok(stampIn(page.text, f), f);
});

test('app.js brings in its modules stamped, the same stamps all the way down', async () => {
  const get = await host(), page = await get('/');
  const app = await get(`/app.js?v=${stampIn(page.text, 'app.js')}`);
  assert.match(app.cache, /immutable/);
  const c = stampIn(app.text, 'crypto.js'), a = stampIn(app.text, 'argon2.js');
  assert.ok(c && a && stampIn(app.text, 'qr.js') && stampIn(app.text, 'datapdf.js'));
  assert.equal(c, stampIn(page.text, 'crypto.js'), 'the preload and the import agree');
  const cr = await get(`/crypto.js?v=${c}`);
  assert.match(cr.cache, /immutable/);
  assert.match(cr.text, /sealFor/);
  assert.equal(stampIn(cr.text, 'argon2.js'), a, 'crypto.js brings in the same argon2.js');
});

test('asked for unstamped, or by a stamp that is not what is sent: not kept', async () => {
  const get = await host();
  assert.equal((await get('/crypto.js')).cache, 'no-store');
  assert.equal((await get('/app.js?v=000000000000')).cache, 'no-store');
});

test('a changed crypto.js gives the page a new app.js', async () => {
  const before = stampIn((await (await host())('/')).text, 'app.js');
  const crypto = readFileSync(new URL('pigeon/crypto.js', ROOT), 'utf8') + '\n// changed\n';
  const after = stampIn((await (await host({ '/pigeon/crypto.js': crypto }))('/')).text, 'app.js');
  assert.ok(before && after && before !== after);
});
