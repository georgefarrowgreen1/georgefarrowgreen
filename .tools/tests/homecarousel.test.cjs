// The actual homepage and source/minified assets, isolated from accounts and email. The carousel's interactions,
// loop, focus, responsive fallback and signed-in copies run in Chromium without a Worker or production writes.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync, mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { chromium } = require('playwright');
const ROOT = resolve(__dirname, '../..');
let browser;
before(async () => { browser = await chromium.launch({
  ...(process.env.CHROMIUM || existsSync('/usr/bin/chromium') ? { executablePath: process.env.CHROMIUM || '/usr/bin/chromium' } : {}),
  args: ['--no-sandbox']
}); });
after(async () => browser?.close());
const signed = { signedIn: true, name: 'Sam', apps: { weather: { places: 3, alerts: true } },
  links: { weather: 'https://weather.inflite.ai/?from=home' } };
async function fixture(assets, { width = 390, reduce = false, js = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, isMobile: width <= 600,
    reducedMotion: reduce ? 'reduce' : 'no-preference', javaScriptEnabled: js });
  const errors = [];
  await ctx.route('https://home.test/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: readFileSync(resolve(ROOT, 'index.html'), 'utf8').replace('<html lang="en-GB">', '<html lang="en-GB" data-words>') });
    if (path === '/api/me') return route.fulfill({ json: signed });
    if (path === '/api/background') return route.fulfill({ json: { images: [] } });
    if (path === '/api/content') return route.fulfill({ json: { name: 'George Farrow-Green', role: 'Fitness · Outdoors', bio: 'Bikes, fitness, outdoors.' } });
    if (path.startsWith('/apps/')) {
      const icon = { inflight: 'pigeon', weather: 'weather', fitness: 'fitness', markets: 'markets' }[path.split('/').pop().replace('.png', '')];
      return route.fulfill({ contentType: 'image/png', body: readFileSync(resolve(ROOT, `${icon}/icon-180.png`)) });
    }
    if (['/styles.css', '/app.js', '/signedin.js'].includes(path) || path.startsWith('/fonts/')) {
      const file = (['/styles.css', '/app.js'].includes(path) ? assets : '') + path.slice(1);
      return route.fulfill({ body: readFileSync(resolve(ROOT, file)), contentType: path.endsWith('.css') ? 'text/css' : path.endsWith('.js') ? 'text/javascript' : path.endsWith('.woff2') ? 'font/woff2' : 'image/png' });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  const p = await ctx.newPage(); p.on('pageerror', e => {errors.push(e.message); console.error('PAGE ERROR:',e.message);});
  await p.goto('https://home.test/');
  if (js) await p.locator('body.known').waitFor();
  if (js) await p.locator('#app-viewport').scrollIntoViewIfNeeded();
  await p.mouse.move(0, 0);
  return { ctx, p, errors };
}
async function settled(p) {
  await p.waitForFunction(() => !document.querySelector('#apps').getAnimations().length);
}
async function centre(p, id) {
  await p.waitForFunction(id => {
    const a = document.querySelector(id).getBoundingClientRect(), v = document.querySelector('#app-viewport').getBoundingClientRect();
    return Math.abs(a.x + a.width / 2 - v.x - v.width / 2) < 1;
  }, id, { timeout: 8000 });
  await settled(p);
}
async function pause(p) {
  await p.locator('[data-app-play]').focus();
  await p.keyboard.press('Space');
}
for (const assets of ['', 'min/']) {
  test(`${assets || 'source/'}no control strip; autoplay, seamless wrap and accessible pause retain live summaries`, async () => {
    const { ctx, p, errors } = await fixture(assets);
    try {
      assert.equal(await p.locator('.app-controls, .app-dots, [data-app-prev], [data-app-next]').count(), 0);
      assert.equal(await p.locator('[data-app-play]').evaluate(el => el.getBoundingClientRect().width), 1, 'pause has no visible footprint before keyboard focus');
      assert.equal(await p.locator('.app').count(), 12);
      assert.equal(await p.locator('[id="app-weather"]').count(), 1);
      assert.equal(await p.locator('#app-weather small').innerText(), '3 places · Alerts on');
      assert.deepEqual(await p.locator('.app-copy.weather small').allTextContents(), ['3 places · Alerts on', '3 places · Alerts on']);
      assert.deepEqual(await p.locator('.app-copy.weather').evaluateAll(links => links.map(a => a.href)), [signed.links.weather, signed.links.weather]);
      await centre(p, '#app-weather');
      await pause(p);
      const at = await p.locator('#apps').evaluate(el => getComputedStyle(el).transform);
      await p.waitForTimeout(4200);
      assert.equal(await p.locator('#apps').evaluate(el => getComputedStyle(el).transform), at, 'pause holds the frame');
      assert.ok(await p.locator('[data-app-play]').evaluate(el => el.getBoundingClientRect().width > 100), 'keyboard pause action is visible while focused');
      await p.locator('#app-markets').focus(); await centre(p, '#app-markets');
      await pause(p); // resume, then cross the automatic join without rewinding
      await centre(p, '#app-inflight');
      assert.equal(await p.locator('.app-copy:not([aria-hidden="true"]), .app-copy:not([tabindex="-1"])').count(), 0);
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      if (process.env.CAROUSEL_SCREENSHOTS) {
        mkdirSync(process.env.CAROUSEL_SCREENSHOTS, { recursive: true });
        await p.locator('#app-inflight').focus(); await p.keyboard.press('Tab'); await p.locator('[data-contact]').first().focus();
        await p.screenshot({ path: `${process.env.CAROUSEL_SCREENSHOTS}/${assets ? 'min' : 'source'}-mobile.png`, fullPage: true });
      }
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  });
  test(`${assets || 'source/'}swipe interrupts a glide without jumping or opening a link; keyboard focus stays visible`, async () => {
    const { ctx, p, errors } = await fixture(assets);
    try {
      await p.waitForFunction(() => document.querySelector('#apps').getAnimations().length > 0, null, { timeout: 8000 });
      await p.waitForTimeout(300);
      const box = await p.locator('#app-viewport').boundingBox();
      await p.mouse.move(box.x + box.width / 2, box.y + 80);
      const stopped = await p.locator('#apps').evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41);
      await p.mouse.down();
      const held = await p.locator('#apps').evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41);
      assert.ok(Math.abs(stopped - held) < 1, 'catching the animation preserves the current frame');
      await p.mouse.move(box.x + box.width / 2 - 160, box.y + 82, { steps: 12 });
      await p.mouse.up(); await settled(p);
      assert.equal(p.url(), 'https://home.test/', 'a swipe does not open the app');
      await centre(p, '#app-fitness');
      await p.mouse.move(0, 0); await p.waitForTimeout(450);
      await p.keyboard.press('Tab');
      await p.locator('#app-markets').focus(); await centre(p, '#app-markets');
      await p.keyboard.press('ArrowRight'); await centre(p, '#app-inflight');
      assert.equal(await p.locator('#app-inflight').evaluate(el => el === document.activeElement), true);
      assert.equal(await p.locator('[data-app-play]').innerText(), 'Play automatic carousel');
      await p.keyboard.press('End'); await centre(p, '#app-markets');
      await p.keyboard.press('Home'); await centre(p, '#app-inflight');
      assert.equal(await p.locator('#app-viewport').evaluate(el => el.scrollLeft), 0, 'native focus never offsets the track');
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  });
  test(`${assets || 'source/'}responsive layout, reduced motion and sheet suspension`, async () => {
    const { ctx, p, errors } = await fixture(assets, { reduce: true });
    try {
      assert.equal(await p.locator('[data-app-play]').isDisabled(), true);
      await p.keyboard.press('Tab'); await p.locator('#app-markets').focus(); await centre(p, '#app-markets');
      assert.equal(await p.locator('#apps').evaluate(el => el.getAnimations().length), 0);
      for (const width of [320, 360, 600]) {
        await p.setViewportSize({ width, height: 844 }); await centre(p, '#app-markets');
        assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      }
      await p.setViewportSize({ width: 1440, height: 900 });
      await p.locator('#app-carousel:not(.is-carousel)').waitFor();
      assert.equal(await p.locator('.app').count(), 4);
      assert.equal(await p.locator('[data-app-play]').isVisible(), false);
      assert.equal(await p.locator('#apps').evaluate(el => getComputedStyle(el).display), 'grid');
      assert.equal(await p.locator('#apps').evaluate(el => el.style.transform), '');
      await p.setViewportSize({ width: 390, height: 844 });
      await p.locator('#app-carousel.is-carousel').waitFor(); await centre(p, '#app-inflight');
      await p.emulateMedia({ reducedMotion: 'no-preference' });
      await p.waitForFunction(() => !document.querySelector('[data-app-play]').disabled);
      await pause(p); // keyboard focus paused rotation; explicitly resume before testing the sheet
      await p.getByRole('button', { name: 'Get in touch', exact: true }).click();
      await p.locator('#contact-sheet[open]').waitFor();
      const at = await p.locator('#apps').evaluate(el => getComputedStyle(el).transform);
      await p.waitForTimeout(4200);
      assert.equal(await p.locator('#apps').evaluate(el => getComputedStyle(el).transform), at, 'contact sheet suspends autoplay');
      await p.locator('#contact-sheet button[aria-label="Close"]').click();
      await p.waitForFunction(() => !document.body.classList.contains('sheet-up'));
      await p.locator('#app-viewport').scrollIntoViewIfNeeded();
      await centre(p, '#app-weather');
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  });
}
test('without JavaScript all four apps remain swipeable links', async () => {
  const { ctx, p } = await fixture('', { js: false });
  try {
    assert.equal(await p.locator('.app').count(), 4);
    assert.equal(await p.locator('[data-app-play]').isVisible(), false);
    assert.equal(await p.locator('#apps').evaluate(el => getComputedStyle(el).overflowX), 'auto');
  } finally { await ctx.close(); }
});
