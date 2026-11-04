// The site's address past the custom domains' bot checks, where the scheduled jobs may call (functions/_sites.js
// tickHost): the Pages project's, and the Worker's once the site's moved (TICK_HOST); never any other address, so a
// tick route stays shut everywhere else. And the jobs call TICK_SITE when it's set, else the Pages project as now.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tickHost, PAGES_HOST } from '../../../functions/_sites.js';
const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');

test('the Pages project’s address, and the Worker’s once it’s said; nothing else', () => {
  assert.equal(tickHost(PAGES_HOST, {}), true);
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
test('the jobs call TICK_SITE when it’s set, else the Pages project', () => {
  for (const f of ['.github/workflows/weather-tick.yml', '.github/workflows/inflight-notify.yml']) assert.match(read(f), /\$\{TICK_SITE:-https:\/\/georgefarrowgreen\.pages\.dev\}/, f);
  assert.match(read('workers/ticker/index.js'), /env\.TICK_SITE \|\| PAGES_SITE/);
});
test('the Worker’s config: the site’s files through the Worker first, the same bindings as Pages, and no routes yet', () => {
  const w = read('wrangler.worker.jsonc'), p = read('wrangler.toml');
  assert.match(w, /"run_worker_first": true/);
  assert.match(w, /"binding": "ASSETS"/);
  for (const id of [...p.matchAll(/(?:id|database_id) = "([^"]+)"/g)].map((m) => m[1])) assert.ok(w.includes(id), `binding ${id} as Pages has it`);
  assert.doesNotMatch(w.replace(/\/\/.*$/gm, ''), /"routes"/, 'no routes till the move (step 5)');
  const ignore = read('.assetsignore').split('\n');
  for (const k of ['functions', 'workers', '.tools', '.git']) assert.ok(ignore.includes(k), k);
  assert.ok(!ignore.includes('min'), 'the minified copies are the Worker’s to read (functions/_min.js)');
});
