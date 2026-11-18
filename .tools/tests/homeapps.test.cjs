const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
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
  await p.mouse.move(0, 0);
  return { ctx, p, errors };
}

for (const assets of ['', 'min/']) {
  for (const width of [320, 390, 768, 1440]) {
    test(`${assets || 'source/'}apps follow projects as four directly accessible rows at ${width}px`, async () => {
      const { ctx, p, errors } = await fixture(assets, { width });
      try {
        const links = p.locator('#apps [data-app-link]');
        assert.deepEqual(await links.locator('strong').allTextContents(), ['Chat', 'Weather', 'Fitness', 'Markets']);
        assert.equal(await p.locator('#app-weather').getAttribute('href'), signed.links.weather);
        assert.equal(await p.locator('#app-weather small').innerText(), '3 places · Alerts on');
        const layout = await p.evaluate(() => [...document.querySelectorAll('#projects details, #apps [data-app-link]')].map(el => {
          const { x, width, top, bottom } = el.getBoundingClientRect();
          return { x, width, top, bottom };
        }));
        assert.equal(layout.length, 6);
        for (let i = 1; i < layout.length; i++) {
          assert.equal(layout[i].x, layout[0].x);
          assert.equal(layout[i].width, layout[0].width);
          assert.ok(layout[i].top >= layout[i - 1].bottom - 1);
        }
        await links.first().focus();
        for (let i = 1; i < 4; i++) {
          await p.keyboard.press('Tab');
          assert.ok(await links.nth(i).evaluate(el => el === document.activeElement));
        }
        assert.deepEqual(errors, []);
      } finally { await ctx.close(); }
    });
  }
}
test('all four app destinations are native links without JavaScript', async () => {
  const { ctx, p } = await fixture('', { js: false });
  try {
    const links = p.locator('#apps a[href]');
    assert.equal(await links.count(), 4);
    assert.ok(await links.last().isVisible());
    assert.equal(await links.last().getAttribute('href'), 'https://inflite.ai/markets/');
  } finally { await ctx.close(); }
});
