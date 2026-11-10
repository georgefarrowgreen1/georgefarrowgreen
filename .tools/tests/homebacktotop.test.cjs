// The actual homepage capsule: a useful return action only while it is visible.
// Exercise pointer, keyboard, scroll-linked and fallback rendering with real source/minified assets.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync, statSync } = require('node:fs');
const { resolve, extname } = require('node:path');
const { chromium } = require('playwright');
const ROOT = resolve(__dirname, '../..'), HOME = 'https://top.test';
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="100"><rect width="80" height="100" fill="#456"/></svg>';
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] }); });
after(async () => browser?.close());
async function fixture(assets, { width = 390, reduce = false, fallback = false, js = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 740 }, hasTouch: width <= 600, isMobile: width <= 600,
    reducedMotion: reduce ? 'reduce' : 'no-preference', javaScriptEnabled: js });
  await ctx.addInitScript(({ fallback }) => {
    // The scroll action is independent of portrait rendering; retain the actual loader's static fallback.
    const context = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) { return /webgl/i.test(type) ? null : context.call(this, type, ...args); };
    if (fallback) {
      const supports = CSS.supports.bind(CSS);
      CSS.supports = (...args) => args.some(x => String(x).includes('animation-timeline')) ? false : supports(...args);
    }
  }, { fallback });
  const errors = [];
  await ctx.route(`${HOME}/**`, async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: readFileSync(resolve(ROOT, 'index.html'), 'utf8').replace('<html lang="en-GB">', '<html lang="en-GB" data-words>') });
    if (path === '/api/me') return route.fulfill({ json: { signedIn: false } });
    if (path === '/api/content') return route.fulfill({ json: { name: 'George Farrow-Green', role: 'Fitness · Outdoors', bio: 'Bikes, fitness, outdoors.' } });
    if (path === '/api/background') return route.fulfill(new URL(route.request().url()).search ? { contentType: 'image/svg+xml', body: SVG } : { json: { images: [] } });
    if (path.startsWith('/apps/')) return route.fulfill({ contentType: 'image/svg+xml', body: SVG });
    const min = resolve(ROOT, assets + path.slice(1)), file = assets && /\.(css|js)$/.test(path) && existsSync(min) ? min : resolve(ROOT, path.slice(1));
    if (existsSync(file) && statSync(file).isFile()) return route.fulfill({ body: readFileSync(file), contentType: { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.avif': 'image/avif', '.woff2': 'font/woff2' }[extname(path)] || 'application/octet-stream' });
    return route.fulfill({ status: 404, body: '' });
  });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(`${HOME}/?keep=ride`, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => !document.documentElement.classList.contains('intro-loading') && !document.documentElement.classList.contains('intro-revealing'));
  await p.evaluate(() => document.fonts.ready);
  return { ctx, p, errors };
}
const pill = p => p.locator('.bar .mid');
async function down(p) {
  await p.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await p.waitForFunction(() => { const el = document.querySelector('.bar .mid'), s = getComputedStyle(el); return scrollY > 100 && Number(s.opacity) > .98 && s.visibility !== 'hidden'; });
}
async function top(p) {
  // An instant scroll finishes before the fallback's scroll-event RAF paints.
  // Wait for the visible/focus state before sending the next keyboard action.
  await p.waitForFunction(() => scrollY < 1 && getComputedStyle(document.querySelector('.bar .mid')).visibility === 'hidden');
}
async function tabFromBody(p) {
  await p.evaluate(() => { document.body.tabIndex = -1; document.body.focus(); document.body.removeAttribute('tabindex'); });
  await p.keyboard.press('Tab');
}
for (const assets of ['', 'min/']) for (const width of [390, 1440]) {
  test(`${assets || 'source/'}${width}px capsule is absent from top-page focus, then pointer activation returns to the hero`, async () => {
    const f = await fixture(assets, { width });
    try {
      assert.equal(await pill(f.p).getAttribute('href'), '#top');
      assert.match(await pill(f.p).textContent(), /George Farrow-Green[\s\S]*Back to top/);
      await tabFromBody(f.p); assert.equal(await pill(f.p).evaluate(el => el === document.activeElement), false, 'invisible capsule must not take a Tab stop');
      await down(f.p);
      assert.equal(await f.p.getByRole('link', { name: /George Farrow-Green.*Back to top/ }).getAttribute('id'), 'back-to-top');
      const reachable = await pill(f.p).evaluate(el => { const r = el.getBoundingClientRect(), target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return el === target || el.contains(target); });
      assert.equal(reachable, true, 'visible glass capsule receives pointer input');
      await pill(f.p).click(); await top(f.p);
      assert.equal(new URL(f.p.url()).search, '?keep=ride');
      assert.equal(new URL(f.p.url()).hash, '', 'enhancement does not leave a navigation fragment');
      await tabFromBody(f.p); assert.equal(await pill(f.p).evaluate(el => el === document.activeElement), false, 'returning to the hero restores the hidden focus state');
      assert.deepEqual(f.errors, []);
    } finally { await f.ctx.close(); }
  });
  test(`${assets || 'source/'}${width}px visible capsule is keyboard reachable and Enter returns to the top`, async () => {
    const f = await fixture(assets, { width });
    try {
      await down(f.p); await tabFromBody(f.p);
      assert.equal(await pill(f.p).evaluate(el => el === document.activeElement), true, 'the visible return link is a natural Tab stop');
      await f.p.keyboard.press('Enter'); await top(f.p);
      assert.equal(await pill(f.p).evaluate(el => el === document.activeElement), false, 'focus cannot remain on the hidden capsule');
      assert.equal(await f.p.locator('#top').evaluate(el => el === document.activeElement), true, 'keyboard focus returns to the hero');
      assert.deepEqual(f.errors, []);
    } finally { await f.ctx.close(); }
  });
}
for (const assets of ['', 'min/']) test(`${assets || 'source/'}Reduce Motion returns instantly and the non-scroll-timeline fallback remains operable`, async () => {
  const f = await fixture(assets, { reduce: true, fallback: true });
  try {
    await down(f.p);
    const y = await pill(f.p).evaluate(el => { el.click(); return scrollY; });
    assert.ok(y < 1, `reduced-motion activation must not start a smooth scroll (${y}px remaining)`);
    await top(f.p); await tabFromBody(f.p); assert.equal(await pill(f.p).evaluate(el => el === document.activeElement), false);
    assert.deepEqual(f.errors, []);
  } finally { await f.ctx.close(); }
});

test('without JavaScript the visible native link still returns to the page top', async () => {
  const f = await fixture('', { js: false });
  try {
    // A native fragment targets the current visual box, so settle the existing hero entrance first.
    await f.p.locator('#top').evaluate(el => Promise.all(el.getAnimations().map(a => a.finished.catch(() => {}))));
    // RAF polling cannot repoll with document scripts disabled; let the compositor settle, then inspect directly.
    await f.p.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await f.p.waitForTimeout(100);
    assert.equal(await pill(f.p).evaluate(el => getComputedStyle(el).visibility), 'visible');
    await pill(f.p).click();
    assert.ok(await f.p.evaluate(() => scrollY) <= 2, 'native fragment return allows compositor rounding of the arriving hero');
    assert.equal(new URL(f.p.url()).hash, '#top');
    assert.equal(await f.p.locator('#site-loader').isVisible(), false);
    assert.deepEqual(f.errors, []);
  } finally { await f.ctx.close(); }
});
