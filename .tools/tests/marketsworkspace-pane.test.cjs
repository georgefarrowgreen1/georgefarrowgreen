const { test, before, after } = require('node:test'), assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright'), { resolve } = require('node:path'), { existsSync } = require('node:fs'), { pathToFileURL } = require('node:url');
const ROOT = resolve(__dirname, '../..'), IFL = resolve(ROOT, '../inflite');
let browser, serveKit, KIT, fixtures;
before(async () => {
  ({ serveKit, KIT } = await import('./roofkit/serve.mjs'));
  fixtures = await import(pathToFileURL(ROOT + '/.tools/tests/unit/fixtures/mk.mjs'));
  browser = process.env.MARKETS_UI_BROWSER === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] });
});
after(async () => browser?.close());

test('real Markets retains its store, selected chart range and cash draft through pane/native reparenting', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 980 }, colorScheme: 'light', reducedMotion: 'reduce' });
  await serveKit(ctx, { main: ROOT + '/', ifl: IFL + '/' });
  const acc = fixtures.account(); acc.id = 'u-kit-0001';
  const api = fixtures.marketsApi({ acc }), writes = [];
  await ctx.route('**/api/markets/**', async r => {
    if (r.request().method() !== 'GET') writes.push(r.request().url());
    if (new URL(r.request().url()).pathname.endsWith('/chart')) {
      const t = Math.floor(Date.now() / 1000); return r.fulfill({ json: { t: [t - 2592000, t - 1296000, t], c: [2.9, 3, 3.12], prev: 3.05, cur: 'GBP', tz: 'Europe/London' } });
    }
    const value = await api.fetch(r.request().url(), { method: r.request().method(), body: r.request().postData() });
    return r.fulfill({ status: value.ok ? 200 : 404, json: await value.json() });
  });
  const page = await ctx.newPage(), errors = []; page.setDefaultTimeout(10000); page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(KIT + '/?module=/markets/roof/markets.js&apps=markets'); await page.waitForFunction(() => window.kit?.ready);
    await page.evaluate(async () => {
      const f = kit.F, v = window.mkView = f.view('markets'); window.mkOriginalRoot = v.root; window.mkOriginalElement = v.el;
      v.fw.workspace = { enabled: true, active: () => v.fw.visible(), provide(p) { window.mkProvider = p; return () => { window.mkProvider = null; }; }, changed() {} };
      f.nav.go('/markets/'); window.mkInstance = await v.load(); await mkInstance.workspace();
      await (await import('/roof/modules.js')).loadStyles('/markets/roof/workspace.css');
    });
    await page.locator('.pseg button[data-r="1mo"]').click(); await page.waitForFunction(() => document.querySelector('[data-el=ps]')?.textContent === 'this month');
    await page.evaluate(async () => {
      const slot = document.createElement('section'); slot.id = 'mk-test-pane'; slot.style.setProperty('width', '420px'); slot.style.setProperty('height', '600px'); slot.style.setProperty('overflow', 'auto'); document.body.append(slot);
      kit.F.nav.go('/#apps');
      mkView.attach({ container: slot, workspace: mkView.fw.workspace, navigate: p => import('/roof/router.js').then(m => mkView.show(m.parse(p, { roof: true }))), header() {} });
      await mkView.show({ kind: 'app', app: 'markets', section: 'today', key: 'today' });
    });
    await page.waitForFunction(() => document.querySelector('#mk-test-pane .pseg [aria-pressed=true]')?.dataset.r === '1mo');
    for (const width of [320, 700, 420]) {
      await page.evaluate(width => { document.getElementById('mk-test-pane').style.setProperty('width', width + 'px'); }, width);
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const geometry = await page.evaluate(() => {
        const slot = document.getElementById('mk-test-pane'), root = mkView.root;
        return { same: root === mkOriginalRoot && mkView.el === mkOriginalElement, columns: getComputedStyle(root.querySelector('.mk-view')).columnCount,
          overflow: root.scrollWidth > slot.clientWidth + 1, path: root.querySelector('.pchart path[data-draw]')?.getAttribute('d'), selected: root.querySelector('.pseg [aria-pressed=true]')?.dataset.r };
      });
      assert.equal(geometry.same, true); assert.equal(geometry.columns, 'auto'); assert.equal(geometry.overflow, false);
      assert.equal(geometry.selected, '1mo'); assert.match(geometry.path, /^M/); assert.doesNotMatch(geometry.path, /NaN|Infinity/);
    }
    assert.equal((await page.evaluate(() => mkProvider.run('add-cash'))).ok, true);
    const amount = page.locator('#mk-cash-amount'); await amount.fill('2500');
    await page.evaluate(() => document.getElementById('mk-test-pane').style.setProperty('width', '360px'));
    assert.equal(await amount.inputValue(), '2500', 'a resize preserves the existing cash editor draft');
    assert.deepEqual(writes, [], 'opening/editing the draft does not write a balance');
    await page.locator('dialog[open] [data-close]').first().click(); await page.locator('dialog[open]').waitFor({ state: 'hidden' });
    for (const section of ['holdings', 'news', 'today']) {
      await page.evaluate(async section => { document.getElementById('mk-test-pane').style.width = '320px'; await mkView.show({ kind: 'app', app: 'markets', section, key: section }); }, section);
      await page.locator('#mk-test-pane .mk-sec[data-sec="' + section + '"] .mk-view').waitFor({ state: 'visible' });
      const state = await page.evaluate(() => ({ overflow: mkView.root.scrollWidth > document.getElementById('mk-test-pane').clientWidth + 1,
        hidden: [...mkView.root.querySelectorAll('.mk-sec[hidden]')].every(el => el.getBoundingClientRect().height === 0), route: kit.F.route.tab }));
      assert.equal(state.overflow, false, section + ' stays within its own pane'); assert.equal(state.hidden, true); assert.equal(state.route, 'apps', 'pane section navigation keeps the global Apps route');
    }
    const paused = await page.evaluate(async () => {
      const core = await import('/markets/roof/core.js'); mkView.hide();
      return { polling: core.live(), opened: await mkProvider.run('add-cash'), dialogs: document.querySelectorAll('dialog[open]').length };
    });
    assert.equal(paused.polling, false, 'hiding the pane stops native Markets polling'); assert.equal(paused.opened.ok, false); assert.equal(paused.dialogs, 0);
    await page.evaluate(() => mkView.show({ kind: 'app', app: 'markets', section: 'today', key: 'today' }));
    assert.equal(await page.evaluate(async () => (await import('/markets/roof/core.js')).live()), true);
    await page.evaluate(() => kit.F.nav.go('/markets/#today'));
    await page.waitForFunction(() => document.querySelector('#views #m-markets .pseg [aria-pressed=true]')?.dataset.r === '1mo');
    const native = await page.evaluate(async () => ({ same: mkView.root === mkOriginalRoot && mkView.el === mkOriginalElement && await mkView.load() === mkInstance,
      embedded: mkView.root.classList.contains('ifl-in-pane'), columns: getComputedStyle(mkView.root.querySelector('.mk-view')).columnCount, role: mkView.el.getAttribute('role') }));
    assert.equal(native.same, true); assert.equal(native.embedded, false); assert.equal(native.columns, '2'); assert.equal(native.role, 'main');
    assert.deepEqual(await page.evaluate(() => mkProvider.files()), { status: 'ready', files: [] });
    assert.deepEqual(writes, []); assert.deepEqual(errors, []); assert.deepEqual(await page.evaluate(() => kit.state.csp), []);
  } finally { await ctx.close(); }
});
