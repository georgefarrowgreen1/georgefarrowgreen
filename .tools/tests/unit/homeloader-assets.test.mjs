// Exercise the real homepage middleware, so stamping and serving use the same bytes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { onRequest } from '../../../functions/_middleware.js';

const ROOT = new URL('../../../', import.meta.url);
const fixture = () => ({
  ASSETS: { async fetch(request) {
    const path = new URL(request.url).pathname, file = new URL('.' + path, ROOT);
    if (!existsSync(file)) return new Response('', { status: 404 });
    return new Response(readFileSync(file), { headers: { 'Content-Type': path.endsWith('.json') ? 'application/json' : 'text/javascript' } });
  } },
});
for (const name of ['loader.js', 'loader-portrait.js']) {
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
