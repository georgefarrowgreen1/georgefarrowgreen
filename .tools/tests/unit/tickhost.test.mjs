// The site's address past the custom domains' bot checks, where the scheduled jobs may call (functions/_sites.js
// tickHost): the inflite-apps Worker's workers.dev address (TICK_HOST); never any other, so a tick route stays shut
// everywhere else. And the jobs call that address (or TICK_SITE, when it's set), never the Pages project's, which is gone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tickHost } from '../../../functions/_sites.js';
const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');

test('the Worker’s address, once TICK_HOST says it; nothing else, not the Pages project’s', () => {
  assert.equal(tickHost('georgefarrowgreen.pages.dev', {}), false, 'the Pages project’s address is gone');
  assert.equal(tickHost('georgefarrowgreen-site.example.workers.dev', {}), false, 'not till TICK_HOST says it');
  assert.equal(tickHost('georgefarrowgreen-site.example.workers.dev', { TICK_HOST: 'georgefarrowgreen-site.example.workers.dev' }), true);
  for (const h of ['chat.inflite.ai', 'georgefarrowgreen.com', 'evil.pages.dev', 'x.georgefarrowgreen.pages.dev', ''])
    assert.equal(tickHost(h, { TICK_HOST: 'georgefarrowgreen-site.example.workers.dev' }), false, h);
  assert.equal(tickHost('', { TICK_HOST: '' }), false, 'an empty TICK_HOST is none');
});
test('every tick route asks tickHost, and no route names the Pages address itself', () => {
  for (const f of ['functions/api/markets/[[path]].js', 'functions/api/pigeon/[[path]].js', 'functions/api/today/[[path]].js', 'functions/api/fitness/[[path]].js']) {
    const s = read(f);
    assert.match(s, /tickHost\(url\.hostname, (ctx\.)?env\)/, f);
    assert.doesNotMatch(s, /=== "georgefarrowgreen\.pages\.dev"/, f);
  }
});
test('the jobs call the Worker (or TICK_SITE), and never the Pages project’s address', () => {
  for (const f of ['.github/workflows/weather-tick.yml', '.github/workflows/inflight-notify.yml']) { const s = read(f); assert.match(s, /\$\{TICK_SITE:-https:\/\/inflite-apps\.georgefarrowgreen\.workers\.dev\}"/, f); assert.doesNotMatch(s, /pages\.dev/, f); }
  assert.match(read('workers/ticker/index.js'), /env\.TICK_SITE \|\| APPS_SITE/); assert.doesNotMatch(read('workers/ticker/index.js'), /pages\.dev/); assert.match(read('workers/ticker/wrangler.toml'), /TICK_SITE = "https:\/\/inflite-apps\.georgefarrowgreen\.workers\.dev"/);
});
test('the Worker’s config: the site’s files through the Worker first, the same bindings as Pages, and only InFlite’s app addresses, each its own custom domain', () => {
  const w = read('wrangler.worker.jsonc'), p = read('wrangler.toml');
  assert.match(w, /"run_worker_first": true/);
  assert.match(w, /"binding": "ASSETS"/);
  for (const id of [...p.matchAll(/(?:id|database_id) = "([^"]+)"/g)].map((m) => m[1])) assert.ok(w.includes(id), `binding ${id} as Pages has it`);
  // (its routes: only InFlite's own addresses, never the hub's inflite.ai itself, nor georgefarrowgreen.com's)
  for (const m of w.replace(/\/\/.*$/gm, '').matchAll(/"pattern": "([^"]+)"/g)) assert.match(m[1], /^(finance|fitness|weather|account|auth|chat|status)\.inflite\.ai$/, m[1]);
  assert.doesNotMatch(w.replace(/\/\/.*$/gm, ''), /"zone_name"/, 'custom domains (their own DNS records), not routes');
  const ignore = read('.assetsignore').split('\n');
  for (const k of ['functions', 'workers', '.tools', '.git']) assert.ok(ignore.includes(k), k);
  assert.ok(!ignore.includes('min'), 'the minified copies are the Worker’s to read (functions/_min.js)');
});
