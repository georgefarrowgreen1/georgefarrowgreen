// Chat's files as a phone gets them (functions/_app.js): the page names each script and stylesheet by what's in
// it, each module brings in its own stamped the same way, and a page asks the store for each file once, however many
// of its files bring in the same module.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { assets as minAssets } from '../../../functions/_min.js';

const ROOT = new URL('../../../', import.meta.url);
const TYPES = { js: 'text/javascript', css: 'text/css', html: 'text/html; charset=utf-8' };
// Pages' store of the site's files, counting what it's asked for
function assets() {
  const asked = [];
  return { asked, async fetch(req) {
    let path = new URL(req.url ?? req).pathname; if (path.endsWith('/')) path += 'index.html';      // (a Request, or a URL)
    asked.push(path);
    const file = new URL('.' + path, ROOT);
    if (!existsSync(file)) return new Response('not here', { status: 404 });
    return new Response(readFileSync(file), { headers: { 'content-type': TYPES[path.split('.').pop()] || 'application/octet-stream', etag: '"x"' } });
  } };
}
async function host() {
  const { serveApp } = await import(`../../../functions/_app.js?${Math.random()}`);       // (its own fingerprints each time)
  const env = { ASSETS: assets() };
  const get = async (path) => {
    const request = new Request('https://georgefarrowgreen.com' + path), url = new URL(request.url);
    // (read as the server reads it: functions/_middleware.js, its minified copy where it has one, functions/_min.js)
    const res = await serveApp({ request, env }, await minAssets(env).fetch(request), url.pathname, false);
    return { res, text: await res.text(), cache: res.headers.get('cache-control') };
  };
  return { get, asked: env.ASSETS.asked };
}
const stampIn = (text, f) => new RegExp(`"(?:/pigeon/|\\./)${f.replace('.', '\\.')}\\?v=(\\w{12})"`).exec(text)?.[1];

test('a page asks the store for each of its files once, the ones app.js and moon.js bring in too', async () => {
  const { get, asked } = await host();
  const page = await get('/pigeon/');
  assert.equal(page.cache, 'no-store');
  assert.ok(stampIn(page.text, 'app.js') && stampIn(page.text, 'styles.css'), 'its script and styles stamped');
  const files = asked.filter((p) => !p.endsWith('index.html'));
  assert.deepEqual(files.filter((p, i) => files.indexOf(p) !== i), [], 'none asked for twice');
  assert.ok(files.includes('/pigeon/land.js') && files.includes('/pigeon/argon2.js'), 'and the modules brought in');
});

test('each file comes stamped as the page names it: kept for good only then', async () => {
  const { get } = await host();
  const page = await get('/pigeon/');
  const app = await get(`/pigeon/app.js?v=${stampIn(page.text, 'app.js')}`);
  assert.match(app.cache, /immutable/);
  const land = stampIn(app.text, 'land.js');
  assert.ok(land && stampIn(app.text, 'crypto.js'), 'its modules stamped');
  if (stampIn(page.text, 'land.js')) assert.equal(stampIn(page.text, 'land.js'), land, 'the same stamp from the page and from app.js');
  assert.match((await get(`/pigeon/land.js?v=${land}`)).cache, /immutable/);
  assert.equal((await get('/pigeon/land.js?v=000000000000')).cache, 'no-store', 'asked for by another stamp: not kept');
});
