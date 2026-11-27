const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { chromium, webkit } = require('playwright');

const ROOT = resolve(__dirname, '../..');
const FRAMEWORK = resolve(process.env.ROOF_IFL || resolve(ROOT, '../inflite'));
const start = [-0.29618, 51.45012];
let browser;

before(async () => {
  browser = process.env.FITNESS_UI_BROWSER === 'webkit' ? await webkit.launch() : await chromium.launch({
    executablePath: process.env.CHROMIUM || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
});
after(async () => browser?.close());

// The routing fixture supplies a bend along every leg. Retaining these intermediate
// points distinguishes saving the provider's track from connecting the pins ourselves.
function routeThrough(query) {
  const coords = [[...query.start, 20]], pinIndices = [];
  const stops = query.returnToStart ? [...query.pins, query.start] : query.pins;
  for (const [i, point] of stops.entries()) {
    const [lng, lat] = coords.at(-1);
    coords.push([(lng + point[0]) / 2 + .0002, (lat + point[1]) / 2, 25], [...point, 20]);
    if (i < query.pins.length) pinIndices.push(coords.length - 1);
  }
  return { ...query, id: 'r-pin-test-01', name: 'Checkpoint ride', source: 'map-pins', coords, pinIndices };
}

async function open(t, { standalone = false, noWebGL = false } = {}) {
  const { KIT, serveKit } = await import('./roofkit/serve.mjs');
  const { UID, meAnswer, routeFitness } = await import('./mocks/fitnessmock.mjs');
  const context = await browser.newContext({
    viewport: { width: standalone ? 320 : 390, height: 850 }, reducedMotion: 'reduce',
    colorScheme: standalone ? 'light' : 'dark', serviceWorkers: 'block',
  });
  t.after(() => context.close());
  const me = meAnswer();
  me.data.prefs = { ...me.data.prefs, onboarded: true, ask: false, maps: 'tap' };
  await context.route('**/*', route => new URL(route.request().url()).origin === KIT ? route.fallback() : route.abort());
  await serveKit(context, { main: ROOT + '/', ifl: FRAMEWORK + '/' });
  await routeFitness(context, KIT, { me });
  await context.addInitScript(({ start, noWebGL }) => {
    window.__locationRequests = 0;
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition(accept) {
      window.__locationRequests++;
      accept({ coords: { longitude: start[0], latitude: start[1], accuracy: 5 }, timestamp: Date.now() });
    } } });
    if (noWebGL) {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        return type.includes('webgl') ? null : get.call(this, type, ...args);
      };
    }
  }, { start, noWebGL });
  // Keep the real MapLibre renderer, camera, hit testing and draggable markers.
  await context.route(KIT + '/fitness/mapstyle.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: 'export const routeStyle = () => ({version:8,sources:{},layers:[{id:"land",type:"background",paint:{"background-color":"#e8e7e3"}}]});',
  }));
  const state = { queries: [], writes: [], plan: null, fail: false };
  await context.route(KIT + '/api/fitness/routes/**', route => {
    const req = route.request();
    if (req.headers()['x-inflite-route-owner'] !== UID) return route.fulfill({ status: 403, json: { error: 'Wrong account' } });
    if (req.url().endsWith('/generate')) {
      const body = req.postDataJSON();
      state.queries.push(body);
      if (state.fail) return route.fulfill({ status: 422, json: { error: 'Pin 1 could not be reached by bicycle.', field: 'pins.0' } });
      return route.fulfill({ json: { routes: [routeThrough(body)], at: Date.now(), partial: false } });
    }
    if (req.url().endsWith('/plan')) {
      if (req.method() === 'PUT') {
        state.writes.push(req.postDataJSON());
        state.plan = { ...req.postDataJSON(), version: 'fixture-1' };
      }
      return route.fulfill({ json: { plan: state.plan } });
    }
    return route.fallback();
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.setDefaultTimeout(8000);
  if (standalone) {
    await page.route(KIT + '/fitness/', route => route.fulfill({
      contentType: 'text/html', body: readFileSync(resolve(ROOT, 'fitness/index.html')),
    }));
    await page.goto(KIT + '/fitness/');
    await page.locator('button.tab').getByText('Routes', { exact: true }).click();
  } else {
    await page.goto(KIT + '/?module=/fitness/roof/fitness.js&apps=weather,fitness');
    await page.waitForFunction(() => window.kit?.ready);
    await page.evaluate(() => kit.F.nav.go('/fitness/'));
    await page.getByRole('tab', { name: 'Routes', exact: true }).click();
  }
  const button = name => page.getByRole('button', { name, exact: true });
  await button('Map pins').waitFor();
  assert.equal(await page.evaluate(() => window.__locationRequests), 0);
  assert.equal(state.queries.length, 0);
  return { page, state, button, errors };
}

test('Fitness map taps, marker dragging and ordering carry through road routing, review and saving', async t => {
  const { page, button, state, errors } = await open(t);
  await button('Use current location').click();
  const map = page.locator('.fr-pin-map'), markers = map.locator('.fr-pin-marker');
  await markers.first().waitFor();
  await page.locator('.fr-pin-map-state').waitFor({ state: 'hidden' });
  const canvas = map.locator('canvas.maplibregl-canvas');
  await canvas.scrollIntoViewIfNeeded();
  await canvas.click({ position: { x: 90, y: 90 } });
  await markers.nth(1).waitFor();
  const routed = predicate => page.waitForResponse(response => response.url().endsWith('/routes/generate')
    && response.ok() && predicate(response.request().postDataJSON()));
  const initialRequest = routed(body => body.pins.length === 2);
  await canvas.click({ position: { x: 225, y: 160 } });
  await markers.nth(2).waitFor();
  const initial = await initialRequest;
  const beforeDrag = initial.request().postDataJSON().pins;
  const moved = routed(body => body.pins.length === 2 && body.pins[0][0] !== beforeDrag[0][0]);
  const marker = markers.nth(1);
  const box = await marker.boundingBox(), fromX = box.x + box.width / 2, fromY = box.y + box.height / 2;
  await page.mouse.move(fromX, fromY);
  await page.mouse.down();
  await page.mouse.move(fromX + 22, fromY + 26, { steps: 8 });
  await page.mouse.up();

  const afterDrag = (await moved).request().postDataJSON().pins;
  assert.deepEqual(afterDrag[1], beforeDrag[1], 'dragging the first marker leaves the second pin in place');
  await page.getByLabel('Edit Pin 2', { exact: true }).click();
  await button('Move Pin 2 earlier').click();
  await button('Review route').click();
  await button('Save planned route').waitFor();
  const query = state.queries.at(-1);
  assert.equal(query.mode, 'pins');
  assert.deepEqual(query.start, start);
  assert.equal(query.pins.length, 2);
  assert.equal(query.returnToStart, false);
  assert.deepEqual(query.pins, [afterDrag[1], afterDrag[0]], 'the requested visit order follows the user’s edits');
  await button('Save planned route').click();
  await page.getByText('Route saved to your account.', { exact: true }).waitFor();
  const saved = state.writes.at(-1).route;
  assert.deepEqual(saved.pins, query.pins);
  assert.deepEqual(saved.coords, routeThrough(query).coords);
  assert.deepEqual(saved.pinIndices, [2, 4]);
  assert.equal(saved.source, 'map-pins');
  assert.equal(saved.returnToStart, false);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  await button('Open Fitness Today').click();
  await page.locator('[data-k=route-plan]').getByText('Checkpoint ride', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
});

test('standalone Fitness retains editable points after a routing error and can save a return ride without WebGL', async t => {
  const { page, button, state, errors } = await open(t, { standalone: true, noWebGL: true });
  const add = async ([lng, lat]) => {
    await page.getByLabel('Latitude', { exact: true }).fill(String(lat));
    await page.getByLabel('Longitude', { exact: true }).fill(String(lng));
    await button('Add point').click();
  };
  await add(start);
  const first = [-0.301, 51.453], destination = [-0.303, 51.457];
  await add(first);
  await add(destination);
  await page.getByLabel('Edit Pin 1', { exact: true }).click();
  await button('Remove Pin 1').click();
  await page.locator('.fr-pin-summary').waitFor(); // a successful outward route exists
  state.fail = true;
  await page.getByLabel('Return to start', { exact: true }).check();
  assert.equal(await button('Review route').isDisabled(), true);
  await page.getByText('Pin 1 could not be reached by bicycle.', { exact: true }).waitFor();
  assert.deepEqual(state.queries.at(-1).pins, [destination]);
  assert.equal(await button('Save planned route').count(), 0);
  assert.equal(state.writes.length, 0);
  assert.equal(await page.locator('.fr-pin-list [data-pin-row="1"]').getAttribute('data-invalid'), 'true');
  state.fail = false;
  await button('Retry route').click();
  await button('Review route').click();
  await button('Save planned route').click();
  await page.getByText('Route saved to your account.', { exact: true }).waitFor();
  const saved = state.plan.route;
  assert.equal(saved.returnToStart, true);
  assert.deepEqual(saved.pins, [destination]);
  assert.deepEqual(saved.coords.at(-1), saved.coords[0]);
  assert.deepEqual(saved.coords[saved.pinIndices[0]].slice(0, 2), destination);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  assert.deepEqual(errors, []);
});
