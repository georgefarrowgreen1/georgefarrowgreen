const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
const { chromium, webkit } = require('playwright');
let browser, js, css;
before(async () => {
  const shared = await import('../iflmenu.mjs'); js = shared.jsBlock() + '\nwindow.auditIFL=IFL;'; css = shared.cssBlock();
  browser = process.env.UI_BROWSER === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] });
});
after(async () => browser?.close());
async function open(width = 390, reducedMotion = 'no-preference') {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion, serviceWorkers: 'block' });
  await ctx.route('http://shared.test/**', r => {
    const p = new URL(r.request().url()).pathname;
    return r.fulfill(p === '/shared.js' ? { body: js, contentType: 'text/javascript' } : p === '/style.css' ? { body: css, contentType: 'text/css' } : p === '/' ? { body: '<!doctype html><html lang="en"><head><title>Shared chrome</title><link rel="stylesheet" href="/style.css"><script src="/shared.js" defer></script></head><body><main><button id="anchor">Your account</button><button id="other">Another account</button></main></body></html>', contentType: 'text/html' } : { json: {} });
  });
  const page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://shared.test/');
  await page.evaluate(() => {
    window.menuOptions = { app: 'weather', build: 'test', me: { name: 'A long account name', line: 'Your account' }, rows: [] };
    window.holdFrames = () => {
      const real = requestAnimationFrame; window.queuedFrames = [];
      window.requestAnimationFrame = cb => (queuedFrames.push(cb), queuedFrames.length);
      window.flushFrames = () => { while (queuedFrames.length) queuedFrames.shift()(performance.now()); window.requestAnimationFrame = real; };
    };
  });
  return { ctx, page, errors };
}
for (const width of [320, 1440]) test(`closed or replaced menus cannot reopen on a delayed frame at ${width}px`, async () => {
  const { ctx, page, errors } = await open(width);
  try {
    const result = await page.evaluate(() => {
      anchor.focus(); holdFrames(); auditIFL.menu(anchor, menuOptions);
      const first = document.querySelector('.ifm-layer'); auditIFL.close();
      auditIFL.menu(other, menuOptions); const current = [...document.querySelectorAll('.ifm-layer')].at(-1);
      flushFrames();
      return { closedOpen: first.classList.contains('open'), closedInert: first.inert, closedHidden: first.getAttribute('aria-hidden'), currentOpen: current.classList.contains('open'), currentFocus: current.contains(document.activeElement), expanded: other.getAttribute('aria-expanded') };
    });
    assert.deepEqual(result, { closedOpen: false, closedInert: true, closedHidden: 'true', currentOpen: true, currentFocus: true, expanded: 'true' });
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#other').getAttribute('aria-expanded'), 'false');
    assert.equal(await page.locator('#other').evaluate(el => el === document.activeElement), true);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});
test('switch saves are single-flight while focus and optimistic feedback stay in place', async () => {
  const { ctx, page, errors } = await open();
  try {
    const pending = await page.evaluate(() => {
      window.savedCalls = 0;
      auditIFL.menu(anchor, { ...menuOptions, rows: [{ icon: 'bell', label: 'Notifications', on: false, toggle: () => { savedCalls++; return new Promise(r => { window.finishSave = r; }); } }] });
      const sw = document.querySelector('.ifm-switch'); sw.focus(); sw.click(); sw.click();
      return { calls: savedCalls, value: sw.getAttribute('aria-checked'), busy: sw.getAttribute('aria-busy'), held: sw === document.activeElement };
    });
    assert.deepEqual(pending, { calls: 1, value: 'true', busy: 'true', held: true });
    await page.evaluate(() => finishSave(false));
    assert.equal(await page.locator('.ifm-switch').getAttribute('aria-checked'), 'false');
    assert.equal(await page.locator('.ifm-switch').getAttribute('aria-busy'), null);
    await page.keyboard.press('Space'); assert.equal(await page.evaluate(() => savedCalls), 2);
    await page.evaluate(() => finishSave(true));
    assert.equal(await page.locator('.ifm-switch').getAttribute('aria-checked'), 'true');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});
test('replacement permission prompts own focus and late completions cannot close the current prompt', async () => {
  const { ctx, page, errors } = await open(390, 'reduce');
  try {
    const state = await page.evaluate(async () => {
      anchor.focus(); holdFrames(); auditIFL.allow('weather', 'First prompt', () => new Promise(r => { window.finishPermission = r; }));
      const old = document.querySelector('.ifa-layer'); old.querySelector('.ifa-go').click(); await Promise.resolve();
      auditIFL.allow('fitness', 'Current prompt', () => false);
      const current = [...document.querySelectorAll('.ifa-layer')].at(-1);
      finishPermission(true); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); flushFrames();
      return { oldRemoved: !old.isConnected, oldOpen: old.classList.contains('on'), currentOpen: current.classList.contains('on'), currentFocus: current.contains(document.activeElement), layers: document.querySelectorAll('.ifa-layer').length };
    });
    assert.deepEqual(state, { oldRemoved: true, oldOpen: false, currentOpen: true, currentFocus: true, layers: 1 });
    await page.keyboard.press('Tab'); assert.equal(await page.locator('.ifa-later').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Shift+Tab'); assert.equal(await page.locator('.ifa-go').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Escape'); assert.equal(await page.locator('.ifa-layer').count(), 0);
    assert.equal(await page.locator('#anchor').evaluate(el => el === document.activeElement), true);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});
test('viewport event bursts schedule one fit and closing cancels stale placement', async () => {
  const { ctx, page, errors } = await open();
  try {
    const count = await page.evaluate(() => {
      auditIFL.menu(anchor, menuOptions); holdFrames();
      for (let i = 0; i < 20; i++) { dispatchEvent(new Event('resize')); visualViewport?.dispatchEvent(new Event('scroll')); }
      const n = queuedFrames.length; auditIFL.close(); flushFrames(); return n;
    });
    assert.equal(count, 1);
    assert.equal(await page.evaluate(() => auditIFL.isOpen()), false);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});
test('closing follows its own surface transition and never waits for descendant motion', async () => {
  const { ctx, page, errors } = await open();
  try {
    const state = await page.evaluate(() => {
      auditIFL.menu(anchor, menuOptions); const layer = document.querySelector('.ifm-layer'), pop = layer.querySelector('.ifm-pop');
      auditIFL.close();
      pop.firstElementChild.dispatchEvent(new TransitionEvent('transitionend', { bubbles: true, propertyName: 'transform' }));
      const childIgnored = layer.isConnected;
      pop.dispatchEvent(new TransitionEvent('transitionend', { propertyName: 'opacity' }));
      const opacityIgnored = layer.isConnected;
      pop.dispatchEvent(new TransitionEvent('transitionend', { propertyName: 'transform' }));
      return { childIgnored, opacityIgnored, removed: !layer.isConnected, backgroundAvailable: !document.querySelector('main').inert };
    });
    assert.deepEqual(state, { childIgnored: true, opacityIgnored: true, removed: true, backgroundAvailable: true });
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});
