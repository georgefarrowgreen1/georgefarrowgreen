// The real OS controller, Fitness core, account route and native binary encoders.
// Reuse the existing transport-only harness without registering its other tests.
const { test } = require('node:test'), assert = require('node:assert/strict'), { Module } = require('node:module'), { readFileSync } = require('node:fs'), { resolve } = require('node:path');
function fixture() {
  const filename = resolve(__dirname, 'workspace-integration.test.cjs'), m = new Module(filename);
  m.filename = filename; m.paths = Module._nodeModulePaths(__dirname);
  const requireOriginal = m.require.bind(m); let start, stop;
  m.require = id => id === 'node:test' ? { test() {}, before(fn) { start = fn; }, after(fn) { stop = fn; } } : requireOriginal(id);
  m._compile(readFileSync(filename, 'utf8') + '\nmodule.exports={open};', filename);
  return { start: () => start(), stop: () => stop(), open: m.exports.open };
}
async function fitnessFiles(page) {
  await page.getByRole('button', { name: 'Files', exact: true }).click();
  const explorer = page.locator('.ifl-files-explorer:visible');
  await explorer.getByRole('navigation', { name: 'File locations', exact: true }).getByRole('button', { name: 'From apps', exact: true }).click();
  await explorer.getByRole('button', { name: 'Select Fitness', exact: true }).dblclick();
  await explorer.getByRole('searchbox', { name: 'Search Fitness', exact: true }).waitFor();
  return explorer;
}

test('the OS Files library opens the real saved route and exports GPX/FIT through native Fitness while retaining its mounted pane', async () => {
  const env = fixture(); await env.start(); let t;
  try {
    t = await env.open(); const { page } = t;
    // Drive is unrelated transport in this real Fitness integration. Only an
    // empty, account-fenced listing is supplied; app metadata/exports stay real.
    await t.ctx.route('http://os.test/api/files/list**', route => {
      const request = route.request();
      assert.equal(request.method(), 'GET');
      assert.equal(request.headers()['x-inflite-files-owner'], t.state.view.user.id);
      t.state.requests.push({ path: '/api/files/list', method: request.method(), body: request.postData() });
      return route.fulfill({ contentType: 'application/json', headers: { 'X-Inflite-Files-Owner': t.state.view.user.id }, body: JSON.stringify({ folder: null, ancestors: [], items: [], cursor: null, revision: 1, usage: { used: 0, reserved: 0, limit: 1073741824, nodes: 0, nodeLimit: 10000, fileLimit: 104857600 } }) });
    });
    const native = page.locator('#m-fitness');
    await page.evaluate(() => { window.__filesOriginalFitnessBody = __originalFitness.querySelector('.m-fitness'); });
    const identity = () => page.evaluate(() => __originalFitness === document.getElementById('m-fitness') && __filesOriginalFitnessBody === document.querySelector('#m-fitness .m-fitness') && document.querySelectorAll('#m-fitness').length === 1);
    assert.equal(await identity(), true);

    let explorer = await fitnessFiles(page);
    await explorer.getByRole('button', { name: 'Select inflite-r-workspace-fixture.gpx', exact: true }).click();
    const gpx = page.waitForEvent('download');
    await explorer.locator('.ifx-inspector').getByRole('button', { name: 'Download', exact: true }).click();
    const route = await gpx, gpxText = readFileSync(await route.path(), 'utf8');
    assert.match(gpxText, /<gpx /);
    assert.equal((gpxText.match(/<trkpt /g) || []).length, t.state.plan.route.coords.length);
    await native.waitFor({ state: 'visible' }); assert.equal(await identity(), true);

    explorer = await fitnessFiles(page);
    // The Explorer keeps native source/type metadata; search narrows the Fitness
    // source to its real workouts without the retired dialog's Type selector.
    await explorer.getByRole('searchbox', { name: 'Search Fitness', exact: true }).fill('.fit');
    const fit = explorer.getByRole('button', { name: /^Select .*\.fit$/ }).first();
    await fit.click();
    const download = page.waitForEvent('download');
    await explorer.locator('.ifx-inspector').getByRole('button', { name: 'Download', exact: true }).click();
    const workout = await download, bytes = readFileSync(await workout.path());
    assert.equal(bytes.subarray(8, 12).toString(), '.FIT'); assert.ok(bytes.length > 40);
    await native.waitFor({ state: 'visible' }); assert.equal(await identity(), true); assert.equal(await native.count(), 1);

    explorer = await fitnessFiles(page);
    await explorer.getByRole('button', { name: 'Select inflite-r-workspace-fixture.gpx', exact: true }).click();
    await explorer.locator('.ifx-inspector').getByRole('button', { name: 'Open', exact: true }).click();
    await page.locator('#m-fitness .fx-sec[data-sec="routes"]:not([hidden])').waitFor();
    assert.equal(await identity(), true);
    assert.deepEqual(t.state.routeWrites, [], 'opening and downloading files never mutate the saved route');
    assert.ok(t.state.requests.filter(request => request.path.startsWith('/api/files/')).every(request => request.method === 'GET'), 'browsing native app files never writes to Drive');
    await t.clean();
  } finally { await t?.ctx.close(); await env.stop(); }
});
