// Exercise the real homepage middleware, so stamping and serving use the same bytes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { onRequest } from '../../../functions/_middleware.js';
import { HOME_FILES } from '../../../functions/_minfresh.js';

const ROOT = new URL('../../../', import.meta.url);
const fixture = () => ({
  ASSETS: { async fetch(request) {
    const path = new URL(request.url).pathname, file = new URL('.' + path, ROOT);
    if (!existsSync(file)) return new Response('', { status: 404 });
    return new Response(readFileSync(file), { headers: { 'Content-Type': path.endsWith('.json') ? 'application/json' : 'text/javascript' } });
  } },
});
for (const name of HOME_FILES) {
  test(`homepage serves ${name} minified, with immutable caching only for its correct stamp`, async () => {
    const expected = readFileSync(new URL('min/' + name, ROOT)), env = fixture();
    const stamp = createHash('sha256').update(expected).digest('hex').slice(0, 12);
    for (const method of ['GET', 'HEAD']) for (const version of ['', '?v=invalid', '?v=' + stamp]) {
      let fallback = false;
      const request = new Request('https://georgefarrowgreen.com/' + name + version, { method });
      const response = await onRequest({ request, env, next: async () => {
        fallback = true;
        return new Response(readFileSync(new URL(name, ROOT)), { headers: { 'Content-Type': 'text/javascript' } });
      } });
      assert.equal(response.status, 200);
      assert.equal(fallback, false, `${method} ${version}: must use the minifying asset path`);
      if (method === 'GET') assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected);
      assert.equal(response.headers.get('Cache-Control'), version === '?v=' + stamp ? 'public, max-age=31536000, immutable' : 'no-cache');
    }
  });
}

test('document HEAD uses the rendered cache policy for home, contact and missing URLs', async () => {
  for (const [path, status] of [['/', 200], ['/contact/', 200], ['/old/road', 404]]) {
    const headers = {'Content-Type':'text/html', ETag:'"template"', 'Last-Modified':new Date(0).toUTCString(), 'Content-Length':'300'};
    for (const conditional of [false, true]) {
      const request = new Request('https://georgefarrowgreen.com'+path, {method:'HEAD',headers:conditional?{'If-None-Match':'"template"'}:{}});
      let refreshes = 0;
      const env = {ASSETS:{fetch:async fresh => {
        refreshes++;
        assert.equal(fresh.method, 'HEAD'); assert.equal(fresh.headers.has('If-None-Match'), false);
        return new Response(null, {status, headers});
      }}};
      const result = await onRequest({request,env,next:async()=>new Response(null,{status:conditional?304:status,headers})});
      assert.equal(result.status,status,path); assert.equal(result.body,null);
      assert.equal(result.headers.get('Cache-Control'),'no-cache');
      for (const header of ['ETag','Last-Modified','Content-Length']) assert.equal(result.headers.has(header),false);
      assert.equal(refreshes,Number(conditional));
    }
  }
});
