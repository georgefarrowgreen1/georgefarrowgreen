// Return an HTTP response while its first schema batch is suspended, then use the
// same Worker and D1 database from a new request. The new read must finish.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { schemaContext, schemaSetup } from '../../../functions/_schema.js';

const require = createRequire(new URL('../package.json', import.meta.url));
const { build } = require('esbuild');
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');

test('parallel reads share setup within a request and a failed setup can be retried', async () => {
  const { env } = schemaContext({ env: { DB: {} } });
  let attempts = 0;
  const ensure = schemaSetup(async () => {
    if (++attempts === 1) throw Error('database unavailable');
    return attempts;
  });
  const failed = await Promise.allSettled([ensure(env), ensure({ ...env })]);
  assert.deepEqual(failed.map(result => result.reason.message), ['database unavailable', 'database unavailable']);
  assert.equal(attempts, 1);
  assert.equal(await ensure(env), 2);
  assert.equal(await ensure(schemaContext({ env }).env), 2);
  assert.equal(await ensure({ DB: {} }), 3, 'a second database needs its own setup');
});

test('Markets, Fitness and account devices recover after the request starting setup ends', async t => {
  const worker = `
    import { schemaContext } from './functions/_schema.js';
    import { db } from './functions/_pigeon.js';
    import { holdings } from './functions/_markets.js';
    import { timesOf } from './functions/_fittimes.js';
    import { devicesList } from './functions/_devices.js';

    const read = {
      markets: env => holdings(env, 'reader'),
      fitness: env => timesOf(env, 'reader', '2026-11-16', '2026-11-17'),
      devices: env => devicesList(env, { id: 'reader', sessionHash: 'test-session' }),
    };
    let database, onBatch;
    export default { async fetch(request, bindings) {
      database ??= {
        prepare: sql => bindings.DB.prepare(sql),
        batch: statements => {
          if (!onBatch) return bindings.DB.batch(statements);
          const started = onBatch;
          onBatch = null;
          started();
          return new Promise(() => {});
        },
      };
      const { env } = schemaContext({ env: { DB: database } });
      await db(env);
      const [, action, area] = new URL(request.url).pathname.split('/');
      if (action === 'abandon') {
        const started = new Promise(resolve => { onBatch = resolve; });
        // Respond as soon as the batch starts, leaving its promise in the old request.
        await Promise.race([started, read[area](env).then(() => { throw Error('expected a cold schema'); })]);
        return new Response('suspended');
      }
      let timer;
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error(area + ' still waiting after the first request ended')), 5000);
      });
      try { return Response.json(await Promise.race([read[area](env), deadline])); }
      finally { clearTimeout(timer); }
    } };
  `;
  const compiled = await build({ stdin: { contents: worker, resolveDir: fileURLToPath(new URL('../../../', import.meta.url)) }, bundle: true, write: false, format: 'esm', platform: 'browser' });
  const opts = { modules: true, script: compiled.outputFiles[0].text, d1Databases: ['DB'], compatibilityDate: '2026-06-17' };
  const mf = new Miniflare(convertV4MiniflareOptions ? convertV4MiniflareOptions(opts) : opts);
  t.after(() => mf.dispose());
  for (const [area, expected] of Object.entries({ markets: [], fitness: [], devices: { fan: false, here: [], devices: [] } })) {
    const first = await mf.dispatchFetch('http://local/abandon/' + area);
    assert.equal(await first.text(), 'suspended', area);
    const next = await mf.dispatchFetch('http://local/read/' + area);
    assert.equal(next.status, 200, area + ': ' + await next.clone().text());
    assert.deepEqual(await next.json(), expected);
  }
});
