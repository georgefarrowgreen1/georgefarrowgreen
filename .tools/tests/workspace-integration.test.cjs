// Real OS host + real Fitness and Weather modules. Only account/weather transport
// is replaced; no application, frame, editor, chart or workspace implementation.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { resolve, extname } = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium, webkit } = require('playwright');
const ROOT = resolve(__dirname, '../..'), IFL = resolve(ROOT, '../inflite'), PUBLIC = resolve(IFL, 'today/public');
const ORIGIN = 'http://os.test', NOW = Date.UTC(2026, 10, 10, 10), DAY = '2026-11-10';
let browser, routeFitness, meAnswer, UID, WX, cleanRoute;
before(async () => {
  ({ routeFitness, meAnswer, UID } = await import('./mocks/fitnessmock.mjs'));
  WX = await import('./mocks/wxappdata.mjs');
  ({ cleanRoute } = await import(pathToFileURL(resolve(ROOT, 'fitness/routes-geometry.js'))));
  browser = process.env.WORKSPACE_UI_BROWSER === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] });
});
after(async () => browser?.close());
const fixture = name => JSON.parse(readFileSync(resolve(IFL, 'tests/fixtures/' + name + '.json'), 'utf8'));
async function settle(page) { await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); }
const pane = (page, app) => page.locator(`.ifl-workspace-pane[data-pane="${app}"]`);
const visiblePanes = page => page.locator('.ifl-workspace-pane:visible');
const ride = page => page.locator('[data-ws-action="workspace:ride"]:visible').first();

async function open({ width = 1440, mode = {}, initialPath = '/?os=1#workspace=ride', ready = 'workspace' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 940 }, colorScheme: width === 390 ? 'light' : 'dark', reducedMotion: 'reduce', locale: 'en-GB', timezoneId: 'Europe/London', serviceWorkers: 'block', acceptDownloads: true });
  const places = [{ name: 'London', region: 'England', lat: 51.5072, lon: -.1276 }, { name: 'Leeds', region: 'England', lat: 53.8, lon: -1.55 }];
  await ctx.addInitScript(places => {
    if (window !== window.top) return;
    localStorage.setItem('wx:places', JSON.stringify(places)); localStorage.setItem('wx:cur', '0'); localStorage.setItem('wx:settings', JSON.stringify({ glass: 'clear', temp: 'c' }));
    Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } });
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition(ok, no) { no?.({ code: 1, message: 'Not granted in this fixture' }); }, watchPosition() { return 1; }, clearWatch() {} } });
    window.__osCsp = []; window.__osRejected = [];
    document.addEventListener('securitypolicyviolation', e => __osCsp.push(e.violatedDirective + ' ' + e.blockedURI));
    addEventListener('unhandledrejection', e => __osRejected.push(String(e.reason?.message || e.reason)));
  }, places);
  const view = fixture('session'), cards = fixture('day');
  view.user = { ...view.user, id: UID, name: 'Sam Taylor', first: 'Sam', photoAt: 0 }; view.apps = { weather: true, fitness: true, markets: false, chats: false, mail: false };
  view.links = { ...view.links, account: ORIGIN, auth: ORIGIN }; cards.at = NOW;
  const state = { offline: false, requests: [], unknown: [], fileReads: [], routeWrites: [], mode, view, cards };
  let releaseWorkspace;
  const workspaceGate = new Promise(resolve => { releaseWorkspace = resolve; });
  state.releaseWorkspace = releaseWorkspace;
  const j = (r, value, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value), headers: { 'Access-Control-Allow-Origin': '*' } });
  const policy = /const CSP = "([^"]+)"/.exec(readFileSync(resolve(IFL, 'today/src/roof.js'), 'utf8'))?.[1] || /Content-Security-Policy: (.*)/.exec(readFileSync(resolve(PUBLIC, '_headers'), 'utf8'))[1];
  const build = /const BUILD = "([^"]+)"/.exec(readFileSync(resolve(PUBLIC, 'app.js'), 'utf8'))[1];
  await ctx.route('**/*', async r => {
    const req = r.request(), url = new URL(req.url()), p = url.pathname;
    // WebKit exposes native object-URL image loads to routing; keep those in the browser's blob store.
    if (url.protocol === 'blob:' && url.origin === ORIGIN) return r.continue();
    if (url.origin !== ORIGIN) { state.unknown.push(url.href); return r.fulfill({ status: 503, body: 'No unmocked external requests' }); }
    if (p.startsWith('/api/')) {
      state.requests.push({ path: p, method: req.method(), body: req.postData() });
      if (state.offline) return r.abort();
      if (p === '/api/vitals') return r.fulfill({ status: 204, body: '' });
      if (p === '/api/weather/obs') return j(r, { station: null, days: {} });
      const api = { '/api/session': view, '/api/boot': { view, cards }, '/api/today': cards, '/api/hub': { ready: true, roof: true, apps: view.apps }, '/api/rules': fixture('rules'), '/api/notify': fixture('notify'), '/api/devices': { devices: [], here: [] }, '/api/status-banner': { banner: null }, '/api/weather/me': { signedIn: false }, '/api/weather/where': places[0], '/api/weather/warnings': { warnings: [] } };
      if (Object.hasOwn(api, p)) return j(r, api[p]);
      state.unknown.push(p); return j(r, { error: 'Unmocked local endpoint' }, 404);
    }
    // The legacy Chat warm-up channel is outside these Fitness/Weather cases.
    // Report it as unavailable transport, never install a fake app/engine.
    if (p === '/chats/') return r.fulfill({ status: 503, contentType: 'text/html', headers: { 'Content-Security-Policy': policy }, body: '<!doctype html><title>Chat is unavailable in this local transport fixture</title>' });
    if (p === '/roof/workspace.js' && mode.delayWorkspace) { state.workspaceRequested = true; await workspaceGate; }
    if (p === '/version') return j(r, { build });
    const app = /^\/(weather|fitness)\//.exec(p)?.[1];
    if (app && p === `/${app}/version`) return j(r, { build: /^export const BUILD = "([^"]+)"/m.exec(readFileSync(resolve(ROOT, app, 'roof/' + app + '.js'), 'utf8'))?.[1] || null });
    const documentPath = p === '/' || /^\/(?:weather|fitness)\/(?:index\.html)?$/.test(p);
    const home = app && !documentPath ? ROOT : PUBLIC;
    const file = resolve(home, '.' + (documentPath ? '/index.html' : p));
    if (!(file.startsWith(home + '/') && existsSync(file))) { state.unknown.push(p); return r.fulfill({ status: 404, body: 'Missing local fixture asset' }); }
    state.fileReads.push(p);
    const type = ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' })[extname(file)] || 'application/octet-stream';
    return r.fulfill({ contentType: type, headers: extname(file) === '.html' ? { 'Content-Security-Policy': policy } : {}, body: extname(file) === '.html' ? readFileSync(file, 'utf8').replace(/\.min\.(js|css)/g, '.$1') : readFileSync(file) });
  });
  const me = meAnswer(NOW); me.offers = []; me.data.prefs = { ...me.data.prefs, onboarded: true, ask: false, maps: 'tap' };
  state.fx = await routeFitness(ctx, ORIGIN, { me });
  const coords = Array.from({ length: 41 }, (_, i) => { const a = i / 40 * Math.PI * 2; return [-.1276 + .018 * Math.sin(a), 51.5072 + .012 * (1 - Math.cos(a)), 40 + 8 * Math.sin(a * 3)]; });
  const route = cleanRoute({ id: 'r-workspace-fixture', name: 'QA <route> & London loop', surface: 'road', start: coords[0].slice(0, 2), coords, generatedAt: NOW });
  assert.ok(route, 'the fixture supplies an actual valid route, not a made-up file label');
  state.plan = { route, day: DAY, time: '18:00', tz: 'Europe/London', version: 1 };
  await ctx.route(ORIGIN + '/api/fitness/routes/plan', r => { if (state.offline) return r.abort(); if (r.request().method() !== 'GET') state.routeWrites.push(r.request().method()); return j(r, { plan: state.plan }); });
  // This runs before both explicit route planning and the existing account API fixture.
  await ctx.route(ORIGIN + '/api/fitness/**', r => state.offline ? r.abort() : r.fallback());
  await ctx.route(/open-meteo\.com|bigdatacloud|nominatim/, r => {
    if (state.offline) return r.abort();
    const url = r.request().url();
    if (url.includes('geocoding-api')) return j(r, { results: places.map((p, id) => ({ id, name: p.name, latitude: p.lat, longitude: p.lon, admin1: p.region, country_code: 'GB', timezone: 'Europe/London' })) });
    if (url.includes('ensemble-api')) return j(r, WX.ensemble(NOW, { rainIn: 90 }));
    if (url.includes('air-quality')) return j(r, WX.air(NOW));
    if (url.includes('marine-api')) return j(r, WX.marine(NOW, url));
    if (url.includes('archive-api')) return j(r, WX.archive(NOW));
    if (url.includes('bigdatacloud') || url.includes('nominatim')) return j(r, { city: 'London', locality: 'London', countryCode: 'GB', principalSubdivision: 'England' });
    if (url.includes('models=')) return j(r, WX.models(NOW, { rainIn: 90 }));
    if (url.includes('previous-runs-api') || url.includes('past_hours') || url.includes('forecast_minutely_15=9')) return j(r, {}, 503);
    return j(r, WX.forecast(NOW, { rainIn: 90 }));
  });
  await ctx.route(/api\.rainviewer\.com/, r => j(r, { host: 'https://tilecache.rainviewer.com', radar: { past: [], nowcast: [] } }));
  const page = await ctx.newPage(), errors = []; page.setDefaultTimeout(15000); page.on('pageerror', e => errors.push(e.message));
  await page.clock.setFixedTime(new Date(NOW));
  await page.goto(ORIGIN + initialPath, { waitUntil: 'domcontentloaded' }); await page.bringToFront();
  try {
    if (ready === 'fitness') await page.locator('#m-fitness .fx-sec[data-sec=progress]:not([hidden])').waitFor();
    else if (ready === 'home') await page.locator('.ifl-workspace[data-mode=today]').waitFor();
    else {
      await page.locator('.ifl-workspace[data-mode=workspace]').waitFor();
      await page.locator('#m-fitness .week-overview').waitFor();
      if (width >= 960) await page.locator('#m-weather [data-card=hourly] .chart svg').first().waitFor();
    }
  }
  catch (e) { console.log('Workspace fixture mount failed', JSON.stringify({ width, errors, unknown: state.unknown, text: (await page.locator('body').innerText()).slice(0, 1800) })); await ctx.close(); throw e; }
  await page.evaluate(() => { window.__originalFitness = document.getElementById('m-fitness'); window.__originalWeather = document.getElementById('m-weather'); });
  const clean = async () => { assert.deepEqual(errors, []); assert.deepEqual(await page.evaluate(() => [__osCsp, __osRejected]), [[], []]); assert.deepEqual(state.unknown, []); };
  const same = () => page.evaluate(() => __originalFitness === document.getElementById('m-fitness') && __originalWeather === document.getElementById('m-weather') && document.querySelectorAll('#m-fitness').length === 1 && document.querySelectorAll('#m-weather').length === 1);
  return { ctx, page, state, errors, clean, same };
}

async function action(page, app, label) {
  await page.getByRole('button', { name: `${app === 'fitness' ? 'Fitness' : 'Weather'} actions`, exact: true }).click();
  const menu = page.locator('dialog[open]').last(); await menu.getByRole('button', { name: label, exact: true }).click();
}

test('actual Fitness and Weather remain independent and usable in a desktop Ride workspace', async () => {
  const { ctx, page, clean, same, state } = await open();
  try {
    assert.equal(await visiblePanes(page).count(), 2);
    await pane(page, 'fitness').getByRole('tab', { name: 'Progress', exact: true }).click();
    const year = pane(page, 'fitness').getByRole('group', { name: 'Range', exact: true }).getByRole('button', { name: 'Year', exact: true });
    await year.click();
    await pane(page, 'weather').getByRole('tab', { name: '16 Days', exact: true }).click();
    await pane(page, 'weather').locator('.wx-days').waitFor();
    assert.equal(await year.getAttribute('aria-pressed'), 'true', 'Weather navigation does not replace Fitness selection');
    const geometry = await visiblePanes(page).evaluateAll(ns => ns.map(n => ({ width: n.clientWidth, overflow: n.scrollWidth > n.clientWidth + 1 })));
    assert.ok(geometry.every(n => n.width >= 300 && !n.overflow), JSON.stringify(geometry));
    const duplicates = await page.evaluate(() => { const ids = [...document.querySelectorAll('[id]')].map(n => n.id); return [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))]; });
    assert.deepEqual(duplicates, [], 'panes do not introduce ambiguous shared IDs');
    assert.equal(await same(), true); assert.equal(state.fx.asked.filter(x => x === 'GET me').length, 1);
    await clean();
  } finally { await ctx.close(); }
});

test('mobile foreground, desktop return and full-app expansion reuse the actual existing modules', async () => {
  const { ctx, page, clean, same } = await open();
  try {
    await page.setViewportSize({ width: 390, height: 900 }); await page.waitForFunction(() => [...document.querySelectorAll('.ifl-workspace-pane')].filter(n => n.getClientRects().length).length === 1);
    const tabs = page.getByRole('tablist', { name: 'Ride workspace apps', exact: true });
    await tabs.getByRole('tab', { name: 'Weather', exact: true }).click();
    await pane(page, 'weather').waitFor({ state: 'visible' }); assert.equal(await pane(page, 'fitness').isHidden(), true);
    await tabs.getByRole('tab', { name: 'Fitness', exact: true }).click();
    await pane(page, 'fitness').waitFor({ state: 'visible' }); assert.equal(await pane(page, 'weather').isHidden(), true);
    await page.setViewportSize({ width: 844, height: 390 }); await settle(page);
    const landscape = await pane(page, 'fitness').locator('.ws-module-slot').evaluate(n => ({ height: n.getBoundingClientRect().height, width: document.documentElement.scrollWidth, viewport: innerWidth }));
    assert.ok(landscape.height >= 150 && landscape.width <= landscape.viewport + 1, 'landscape retains a usable scrolling app: ' + JSON.stringify(landscape));
    await page.setViewportSize({ width: 1440, height: 940 }); await page.waitForFunction(() => [...document.querySelectorAll('.ifl-workspace-pane')].filter(n => n.getClientRects().length).length === 2);
    await page.locator('.ws-dock [data-ws-action="app:fitness"]').click();
    await page.locator('#m-fitness').waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.documentElement.classList.contains('os-workspace'));
    assert.equal(await page.locator('#m-fitness .m-fitness').evaluate(n => n.classList.contains('ifl-in-pane')), false);
    await page.goBack(); await page.locator('.ifl-workspace[data-mode=workspace]').waitFor();
    assert.equal(await page.locator('#m-fitness .m-fitness').evaluate(n => n.classList.contains('ifl-in-pane')), true);
    assert.equal(await same(), true);
    await clean();
  } finally { await ctx.close(); }
});

test('a cold phone workspace has one usable foreground app and keyboard tabs can open the real Weather pane', async () => {
  const { ctx, page, clean, state } = await open({ width: 390 });
  try {
    assert.equal(await visiblePanes(page).count(), 1);
    assert.equal(await pane(page, 'fitness').isVisible(), true);
    const tabs = page.getByRole('tablist', { name: 'Ride workspace apps', exact: true });
    await tabs.getByRole('tab', { name: 'Fitness', exact: true }).focus();
    await page.keyboard.press('End');
    assert.equal(await tabs.getByRole('tab', { name: 'Weather', exact: true }).evaluate(n => n === document.activeElement), true);
    await page.keyboard.press('Enter');
    await pane(page, 'weather').locator('[data-card=hourly] .chart svg').first().waitFor();
    assert.equal(await visiblePanes(page).count(), 1);
    const size = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }));
    assert.ok(size.width <= size.viewport + 1, JSON.stringify(size));
    await tabs.getByRole('tab', { name: 'Fitness', exact: true }).click();
    await pane(page, 'fitness').locator('.week-overview').waitFor();
    assert.equal(state.fx.asked.filter(x => x === 'GET me').length, 1);
    await clean();
  } finally { await ctx.close(); }
});

test('OS search opens the existing Fitness app and modal focus survives the mobile keyboard viewport', async () => {
  const { ctx, page, clean, same } = await open();
  try {
    await page.getByRole('button', { name: 'Search InFlite', exact: true }).click();
    const search = page.locator('dialog[data-sheet=search][open]'); await search.getByRole('combobox', { name: 'Search everything', exact: true }).fill('Progress');
    await search.locator('a[href="/fitness/#progress"]').first().click();
    await page.locator('#m-fitness .fx-sec[data-sec=progress]:not([hidden])').waitFor();
    assert.equal(await page.evaluate(() => __originalFitness === document.getElementById('m-fitness') && document.querySelectorAll('#m-fitness').length === 1), true);
    const settings = page.getByRole('button', { name: 'Fitness Settings', exact: true });
    await settings.click(); const sheet = page.locator('dialog[data-app=fitness][open]').last(); await sheet.waitFor();
    await sheet.locator('[data-close]').click(); await sheet.waitFor({ state: 'detached' });
    assert.equal(await settings.evaluate(n => document.activeElement === n), true, 'modal returns focus to its actual origin pane');
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goBack(); await page.locator('.ifl-workspace[data-mode=workspace]').waitFor();
    assert.equal(await same(), true);
    await page.getByRole('button', { name: 'Search InFlite', exact: true }).click();
    await page.evaluate(() => { Object.defineProperty(visualViewport, 'height', { configurable: true, value: 460 }); visualViewport.dispatchEvent(new Event('resize')); });
    await settle(page);
    const keyboard = await page.locator('dialog[data-sheet=search][open]').evaluate(n => { const field = n.querySelector('input').getBoundingClientRect(), close = n.querySelector('[data-close]').getBoundingClientRect(); return { field: field.bottom <= visualViewport.height + 1, close: close.bottom <= visualViewport.height + 1, focused: document.activeElement === n.querySelector('input') }; });
    assert.deepEqual(keyboard, { field: true, close: true, focused: true });
    await page.evaluate(() => { delete visualViewport.height; visualViewport.dispatchEvent(new Event('resize')); });
    await clean();
  } finally { await ctx.close(); }
});

test('explicit saved-route weather, confirmed scheduling and GPX export use the real app functions', async () => {
  const { ctx, page, clean, state } = await open();
  try {
    const before = await page.evaluate(() => localStorage.getItem('wx:places'));
    await action(page, 'fitness', 'Weather at route start');
    await pane(page, 'weather').locator('.wx-workspace-context:not([hidden])').waitFor();
    assert.match(await pane(page, 'weather').locator('.wx-workspace-context').innerText(), /QA <route> & London loop/);
    assert.equal(await page.evaluate(() => localStorage.getItem('wx:places')), before, 'explicit planning context does not rewrite saved Weather places');
    assert.ok(!page.url().includes('51.5072') && !page.url().includes('-.1276'), 'explicit shared location stays out of navigation URLs');
    assert.equal(await page.locator('route').count(), 0, 'route names remain text');
    await action(page, 'fitness', 'Change ride time');
    const editor = page.locator('dialog[data-sheet=ride-at][open]'); await editor.getByLabel('Starting at', { exact: true }).fill('19:30');
    assert.equal(state.fx.times.length, 0, 'editing the time alone performs no account write');
    await page.setViewportSize({ width: 390, height: 900 }); await settle(page);
    assert.equal(await editor.getByLabel('Starting at', { exact: true }).inputValue(), '19:30', 'collapsing the workspace preserves the real uncommitted editor');
    await page.setViewportSize({ width: 1440, height: 940 }); await settle(page);
    assert.equal(await editor.getByLabel('Starting at', { exact: true }).inputValue(), '19:30', 'restoring split view preserves the same draft');
    assert.equal(state.fx.times.length, 0);
    await editor.getByRole('button', { name: 'Change the Time', exact: true }).click(); await editor.waitFor({ state: 'detached' });
    assert.equal(state.fx.times.length, 1); assert.equal(state.fx.times[0][0], 'PUT'); assert.equal(state.fx.times[0][1].start, Date.UTC(2026, 10, 10, 19, 30));
    await page.waitForFunction(() => /19:30|7:30\s?pm/i.test(document.querySelector('.wx-workspace-context')?.textContent || ''));
    await page.getByRole('button', { name: 'Fitness actions', exact: true }).click();
    const downloading = page.waitForEvent('download'); await page.locator('dialog[open]').last().getByRole('button', { name: 'Download GPX', exact: true }).click();
    const file = await downloading, chunks = []; for await (const chunk of await file.createReadStream()) chunks.push(chunk);
    const gpx = Buffer.concat(chunks).toString('utf8');
    assert.match(file.suggestedFilename(), /r-workspace-fixture\.gpx$/); assert.match(gpx, /<gpx /); assert.match(gpx, /<trkpt lat=/); assert.match(gpx, /QA &lt;route&gt; &amp; London loop/);
    assert.equal(state.routeWrites.length, 0, 'sharing context and exporting do not change the saved route');
    const metadata = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('ifl:workspace:')).map(k => localStorage.getItem(k)).join(''));
    assert.ok(!metadata.includes('51.5072') && !metadata.includes('QA <route>') && !metadata.includes('19:30'), 'workspace storage contains references, not domain/context payloads');
    await clean();
  } finally { await ctx.close(); }
});

test('workspace pane metadata survives reload and an API-offline return preserves mounted content', async () => {
  const { ctx, page, clean, same, state } = await open();
  try {
    await pane(page, 'fitness').getByRole('tab', { name: 'Activities', exact: true }).click();
    await pane(page, 'weather').getByRole('tab', { name: '16 Days', exact: true }).click();
    await page.waitForFunction(() => Object.keys(localStorage).some(k => k.startsWith('ifl:workspace:')));
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.bringToFront();
    await pane(page, 'fitness').locator('.fx-sec[data-sec=activities]:not([hidden])').waitFor(); await pane(page, 'weather').locator('.wx-sec[data-sec=days]:not([hidden])').waitFor();
    // A mounted section can precede its account/forecast render. Establish a
    // loaded cache before cutting transport, then compare those same records.
    await pane(page, 'fitness').locator('[data-k=act]').first().waitFor();
    await pane(page, 'weather').locator('.wx-day[data-day]').first().waitFor();
    const cached = {
      activityIds: await pane(page, 'fitness').locator('[data-k=act]').evaluateAll(nodes => nodes.map(node => node.dataset.id)),
      dayKeys: await pane(page, 'weather').locator('.wx-day[data-day]').evaluateAll(nodes => nodes.map(node => node.dataset.day)),
    };
    assert.equal(cached.activityIds.length, 30); assert.equal(cached.dayKeys.length, 16);
    await page.evaluate(() => { window.__originalFitness = document.getElementById('m-fitness'); window.__originalWeather = document.getElementById('m-weather'); });
    state.offline = true; await ctx.setOffline(true);
    await page.locator('.ws-dock [data-ws-action="app:fitness"]').click(); await page.locator('#m-fitness').waitFor({ state: 'visible' });
    try { await page.waitForFunction(() => !document.documentElement.classList.contains('os-workspace')); }
    catch (e) { console.log('Offline expansion did not complete', await page.evaluate(() => ({ url: location.href, classes: document.documentElement.className, dock: document.querySelector('.ws-dock')?.outerHTML, dialogs: [...document.querySelectorAll('dialog[open]')].map(n => n.textContent.slice(0, 200)), text: document.body.innerText.slice(0, 1000) }))); throw e; }
    await page.goBack(); await page.locator('.ifl-workspace[data-mode=workspace]').waitFor();
    assert.equal(await same(), true); assert.equal(await visiblePanes(page).count(), 2);
    assert.equal(await pane(page, 'fitness').locator('[data-k=act]').count() > 0, true, 'cached activities remain available');
    assert.equal(await pane(page, 'weather').locator('.wx-day').count() > 0, true, 'the previously loaded forecast remains available');
    assert.deepEqual(await pane(page, 'fitness').locator('[data-k=act]').evaluateAll(nodes => nodes.map(node => node.dataset.id)), cached.activityIds, 'every loaded activity survives the offline return');
    assert.deepEqual(await pane(page, 'weather').locator('.wx-day[data-day]').evaluateAll(nodes => nodes.map(node => node.dataset.day)), cached.dayKeys, 'every loaded forecast day survives the offline return');
    await clean();
  } finally { await ctx.close(); }
});

test('the default OS preview keeps its opt-in query through workspace navigation and reload', async () => {
  const { ctx, page, clean } = await open({ initialPath: '/?os=1', ready: 'home' });
  try {
    assert.equal(new URL(page.url()).searchParams.get('os'), '1', 'the default preview remains an OS URL after bootstrap');
    await ride(page).click(); await pane(page, 'fitness').locator('.week-overview').waitFor();
    assert.equal(new URL(page.url()).searchParams.get('os'), '1');
    await pane(page, 'fitness').getByRole('tab', { name: 'Progress', exact: true }).click();
    await pane(page, 'fitness').locator('.fx-sec[data-sec=progress]:not([hidden])').waitFor();
    assert.equal(new URL(page.url()).searchParams.get('os'), '1', 'pane navigation keeps the preview opt-in');
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.bringToFront();
    await page.locator('.ifl-workspace[data-mode=workspace]').waitFor();
    await pane(page, 'fitness').locator('.fx-sec[data-sec=progress]:not([hidden])').waitFor();
    await clean();
  } finally { await ctx.close(); }
});

test('a cold Fitness deep link retains its live selection when the OS SDK arrives later', async () => {
  const { ctx, page, clean, state } = await open({ initialPath: '/fitness/?os=1#progress', ready: 'fitness', mode: { delayWorkspace: true } });
  try {
    const year = page.locator('#m-fitness').getByRole('group', { name: 'Range', exact: true }).getByRole('button', { name: 'Year', exact: true });
    await year.click();
    assert.equal(state.workspaceRequested, true, 'the actual controller import is held while the native app is usable');
    assert.equal(await page.locator('#m-fitness .m-fitness').evaluate(n => n.classList.contains('fx-workspace')), false);
    state.releaseWorkspace();
    await page.locator('#m-fitness .m-fitness.fx-workspace').waitFor();
    await page.locator('.ws-dock:visible').waitFor();
    assert.equal(await year.getAttribute('aria-pressed'), 'true', 'late SDK activation preserves the current Progress selection');
    assert.equal(await page.evaluate(() => __originalFitness === document.getElementById('m-fitness')), true);
    assert.equal(await page.locator('#m-fitness .m-fitness').evaluate(n => n.classList.contains('ifl-in-pane')), false);
    assert.equal(state.fx.asked.filter(x => x === 'GET me').length, 1);
    assert.equal(new URL(page.url()).searchParams.get('os'), '1');
    await clean();
  } finally { state.releaseWorkspace(); await ctx.close(); }
});

test('each workspace owns its pane Back history and retains the other workspace section selections', async () => {
  const { ctx, page, clean } = await open();
  try {
    await pane(page, 'fitness').getByRole('tab', { name: 'Progress', exact: true }).click();
    await pane(page, 'fitness').locator('.fx-sec[data-sec=progress]:not([hidden])').waitFor();
    await pane(page, 'weather').getByRole('tab', { name: '16 Days', exact: true }).click();
    await pane(page, 'weather').locator('.wx-sec[data-sec=days]:not([hidden])').waitFor();
    assert.equal(await pane(page, 'fitness').getByRole('button', { name: 'Back in Fitness', exact: true }).isVisible(), true);
    await page.getByRole('button', { name: 'New workspace', exact: true }).click();
    const editor = page.locator('dialog[data-sheet=workspace-create][open]');
    await editor.getByRole('textbox', { name: 'Workspace name', exact: true }).fill('Recovery');
    await editor.getByRole('button', { name: 'Create workspace', exact: true }).click();
    await page.locator('.ws-title-desktop').filter({ hasText: 'Recovery workspace' }).waitFor();
    await pane(page, 'fitness').locator('.week-overview').waitFor();
    assert.equal(await pane(page, 'fitness').getByRole('button', { name: 'Back in Fitness', exact: true }).count(), 0, 'a new workspace does not inherit Ride history');
    await pane(page, 'fitness').getByRole('tab', { name: 'Activities', exact: true }).click();
    await pane(page, 'fitness').locator('.fx-sec[data-sec=activities]:not([hidden])').waitFor();
    await pane(page, 'fitness').getByRole('button', { name: 'Back in Fitness', exact: true }).click();
    await pane(page, 'fitness').locator('.week-overview').waitFor();
    await ride(page).click();
    await pane(page, 'fitness').locator('.fx-sec[data-sec=progress]:not([hidden])').waitFor();
    await pane(page, 'weather').locator('.wx-sec[data-sec=days]:not([hidden])').waitFor();
    await pane(page, 'fitness').getByRole('button', { name: 'Back in Fitness', exact: true }).click();
    await pane(page, 'fitness').locator('.week-overview').waitFor();
    await clean();
  } finally { await ctx.close(); }
});

test('creating, renaming, restoring and removing a Weather-only workspace changes local metadata only', async () => {
  const { ctx, page, clean, state } = await open();
  try {
    const writes = () => [state.fx.puts.length, state.fx.uploads.length, state.fx.times.length, state.routeWrites.length];
    const before = writes();
    await page.getByRole('button', { name: 'New workspace', exact: true }).click();
    const create = page.locator('dialog[data-sheet=workspace-create][open]');
    await create.getByRole('textbox', { name: 'Workspace name', exact: true }).fill('Coastal weather');
    await create.getByRole('checkbox', { name: 'Fitness', exact: true }).uncheck();
    await create.getByRole('button', { name: 'Create workspace', exact: true }).click();
    await page.locator('.ws-title-desktop').filter({ hasText: 'Coastal weather workspace' }).waitFor();
    await pane(page, 'weather').locator('[data-card=hourly] .chart svg').first().waitFor();
    assert.equal(await visiblePanes(page).count(), 1); assert.equal(await pane(page, 'weather').isVisible(), true);
    const id = new URLSearchParams(new URL(page.url()).hash.slice(1)).get('workspace');
    assert.ok(id && id !== 'ride');
    await page.getByRole('button', { name: 'Workspace options', exact: true }).click();
    const manage = page.locator('dialog[data-sheet=workspace-manage][open]');
    await manage.getByRole('textbox', { name: 'Workspace name', exact: true }).fill('Forecast <notes> & coast');
    await manage.getByRole('button', { name: 'Save name', exact: true }).click();
    await page.locator('.ws-title-desktop').filter({ hasText: 'Forecast <notes> & coast workspace' }).waitFor();
    assert.equal(await page.locator('notes').count(), 0, 'workspace names stay text');
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.bringToFront();
    await page.locator('.ws-title-desktop').filter({ hasText: 'Forecast <notes> & coast workspace' }).waitFor();
    await pane(page, 'weather').locator('[data-card=hourly] .chart svg').first().waitFor();
    assert.equal(await visiblePanes(page).count(), 1); assert.equal(await pane(page, 'weather').isVisible(), true);
    await page.getByRole('button', { name: 'Workspace options', exact: true }).click();
    await page.locator('dialog[data-sheet=workspace-manage][open]').getByRole('button', { name: 'Remove workspace', exact: true }).click();
    await page.locator('.ifl-workspace[data-mode=today]').waitFor();
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith('ifl:workspace:')))).workspaces);
    assert.deepEqual(kept.map(w => w.id), ['ride']);
    assert.deepEqual(kept[0].panes.map(p => p.app), ['fitness', 'weather']);
    assert.deepEqual(writes(), before, 'workspace management does not write domain accounts');
    await ride(page).click(); await pane(page, 'fitness').locator('.week-overview').waitFor();
    assert.equal(await visiblePanes(page).count(), 2);
    await clean();
  } finally { await ctx.close(); }
});

for (const app of ['fitness', 'weather']) test(`the actual native ${app} screen commits a touch section swipe after leaving its pane`, async () => {
  const { ctx, page, clean } = await open({ width: 390 });
  try {
    await page.locator(`.ws-dock [data-ws-action="app:${app}"]`).click();
    await page.locator(`#views #m-${app}:not([hidden])`).waitFor();
    const from = app === 'fitness' ? 'today' : 'now', to = app === 'fitness' ? 'activities' : 'days';
    await page.locator(`#m-${app} [data-sec="${from}"]:not([hidden])`).waitFor(); await settle(page);
    const result = await page.evaluate(({ app, from }) => {
      const screen = document.getElementById('m-' + app), panel = screen.querySelector('[role=tabpanel]'), target = panel.querySelector(`section[data-sec="${from}"]`);
      const fire = (type, x) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'touch', pointerId: 21, isPrimary: true, clientX: x, clientY: 300 }));
      fire('pointerdown', 280); fire('pointermove', 50);
      const preview = document.documentElement.classList.contains('ifl-swiping');
      fire('pointerup', 50);
      return { preview, tag: screen.tagName, role: screen.getAttribute('role'), touch: getComputedStyle(panel).touchAction };
    }, { app, from });
    assert.equal(result.preview, true, 'the touch gesture presents the next actual module section');
    assert.equal(result.tag, 'DIV'); assert.equal(result.role, 'main');
    assert.equal(result.touch, 'pan-y pinch-zoom');
    await page.locator(`#m-${app} [data-sec="${to}"]:not([hidden])`).waitFor();
    await page.waitForFunction(({ app, to }) => location.pathname === `/${app}/` && location.hash === '#' + to && !document.documentElement.classList.contains('ifl-swiping'), { app, to });
    await clean();
  } finally { await ctx.close(); }
});
