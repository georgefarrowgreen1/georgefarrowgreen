// What each module costs on its first open (stages 2–4, s2/spec.md §4.6; roof/s24-contracts.md §13), without a browser:
// the entry's static import graph and REGISTRY's CSS, each file minified with minify.mjs's esbuild options and gzipped
// at level 9 (unit/fixtures/budget.mjs staticGz), against each module's budget. Frozen by B0 (j0). Every figure is
// printed, so the floor before a port (the reused files and B0's stubs) and each batch's cost are in the log.
//   Weather: JS ≤ 90 KB once WX has moved Warnings' helpers and the detail and credits sheets (weather/roof/wxdetail.js no
//   longer B0's stub; 104.9 before, §4.5), CSS ≤ 14 KB. Markets: JS ≤ 40, CSS ≤ 12. Fitness: JS ≤ 85, CSS ≤ 22.
//   Requests: the static graph, never more than connector.files (the root worker keeps exactly those).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { MAIN, ROOF, roofSkip, appsSkip } from './fixtures/roof.mjs';
import { staticGz, haveEsbuild } from './fixtures/budget.mjs';

const BUDGET = { weather: { js: 90, css: 14 }, markets: { js: 40, css: 12 }, fitness: { js: 85, css: 22 } };
const stubbed = (rel) => existsSync(new URL(rel, MAIN)) && /^export const STUB = true;/m.test(readFileSync(new URL(rel, MAIN), 'utf8'));
const kib = (n) => `${n.toFixed(1)} KB`;

for (const [app, b] of Object.entries(BUDGET)) {
  const skip = (app === 'weather' ? roofSkip : appsSkip) || (!existsSync(new URL(`${app}/roof/${app}.js`, MAIN)) && `no ${app}/roof/${app}.js yet`)
    || (!haveEsbuild() && "esbuild isn't installed here (.tools/tests: npm ci), so sizes can't be measured as served");
  test(`${app}: first open within its budget (JS ≤ ${b.js} KB, CSS ≤ ${b.css} KB gzip, minified as served)`, { skip }, async (t) => {
    const g = await staticGz(app);
    const stubs = Object.keys(g.each).filter((p) => p.endsWith('.js') && stubbed(p.slice(1)));
    const top = Object.entries(g.each).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([p, n]) => `${p} ${kib(n / 1024)}`).join(', ');
    t.diagnostic(`${app}: JS ${kib(g.js)}, CSS ${kib(g.css)}, ${g.files.length} files${stubs.length ? ` (${stubs.length} still B0's stubs: the floor of the reused files)` : ''}; largest: ${top}`);
    console.log(`# roofbudget ${app}: JS ${kib(g.js)} CSS ${kib(g.css)} files ${g.files.length} stubs ${stubs.length}`);
    assert.ok(g.css <= b.css, `${app} CSS ${kib(g.css)} over ${b.css} KB`);
    // (Weather is 104.9 until WX's move (§4.5): its JS budget holds from then on)
    if (app === 'weather' && stubbed('weather/roof/wxdetail.js')) return t.diagnostic('Weather’s JS budget: still B0’s stub of wxdetail.js (WX’s move not made yet), so not held to 90 KB');
    assert.ok(g.js <= b.js, `${app} JS ${kib(g.js)} over ${b.js} KB`);
    const { connector } = await import(new URL(`${app}/roof/connector.js`, MAIN));
    assert.ok(g.files.every((f) => connector.files.includes(f)), 'every file of the first open is one the root worker keeps (connector.files)');
  });
}
