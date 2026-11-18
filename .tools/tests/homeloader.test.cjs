const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./gallery-fixture.cjs');

for (const assets of ['', 'min/']) {
  for (const options of [{ reduce: true }, { back: true }, { hash: '#apps' }, { js: false }, { missing: '/loader.js' }, { missing: '/app.js' }]) {
    test(`${assets || 'source/'}the photographic page stays usable with ${JSON.stringify(options)}`, async () => {
      const f = await fixture(assets, options);
      try {
        await f.p.locator('#fi-photos').waitFor({state: 'visible'});
        assert.equal(await f.p.locator('.opening-mark, .skip-opening').count(), 0);
        assert.equal(await f.p.locator('#apps a').count(), 4);
        assert.equal(await f.p.locator('#apps a').first().isVisible(), true);
        assert.deepEqual(f.errors, []);
      } finally { await f.ctx.close(); }
    });
  }
  test(`${assets || 'source/'}a reported link opens its prefilled contact sheet directly`, async () => {
    const f = await fixture(assets, { hash: '#contact=%2Fmissing' });
    try {
      await f.p.locator('#contact-sheet[open]').waitFor();
      assert.match(await f.p.locator('#c-message').inputValue(), /missing/);
      assert.equal(await f.p.locator('.skip-opening').count(), 0);
    } finally { await f.ctx.close(); }
  });
}

for (const width of [390, 1440]) {
  test(`gallery at ${width}px reverses from the visible crop and settles to the same geometry`, async () => {
    const f = await fixture('', { width, hash: '#fi-photos' });
    try {
      const page = f.p;
      await page.locator('#fi-photos img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
      const result = await page.evaluate(async () => {
        const panels = [...document.querySelectorAll('[data-scene]')];
        const edges = () => panels.flatMap(panel => {
          const a = panel.getBoundingClientRect(), b = panel.querySelector('.fi-window').getBoundingClientRect();
          return [a.left, Math.min(a.right, b.right)];
        });
        const pauseAt = time => {
          for (const animation of document.querySelector('#fi-photos').getAnimations({subtree:true})) {
            animation.pause(); animation.currentTime = time;
          }
        };
        panels[1].click(); pauseAt(210);
        const before = edges();
        panels[2].click(); pauseAt(0);
        const after = edges();
        pauseAt(510);
        const end = edges();
        for (const a of document.querySelector('#fi-photos').getAnimations({subtree:true})) a.finish();
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        return {before, after, end, resting:edges()};
      });
      for (const [a, b] of [[result.before, result.after], [result.end, result.resting]]) {
        assert.ok(a.every((edge, i) => Math.abs(edge - b[i]) < 1), 'crop edges stay continuous');
      }
      const last = page.locator('[data-scene="2"]');
      await last.focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('[data-scene="0"]').getAttribute('aria-pressed'), 'true');
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.keyboard.press('End');
      assert.equal(await last.getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('.fi-reel.switching').count(), 0);
      assert.deepEqual(f.errors, []);
    } finally { await f.ctx.close(); }
  });
}

test('a slow gallery photo cannot overwrite a newer selection', async () => {
  const frame = (src, label) => ({src, label, alt:label, position:'50% 50%'});
  const frames = [frame('/projects/open-road.webp','Road'), frame('/delayed-photo','Delayed'), frame('/projects/hillside-climb.webp','Climb')];
  const f = await fixture('', {hash:'#fi-photos', collection:frames});
  let delayed;
  try {
    const requested = new Promise(resolve => {
      f.p.route('**/delayed-photo', route => { delayed = route; resolve(); });
    });
    const panel = f.p.locator('[data-scene="0"]');
    await panel.click();
    await requested;
    assert.equal(await panel.locator('img').getAttribute('src'), frames[0].src);
    await panel.click();
    await f.p.waitForFunction(() => document.querySelector('[data-scene="0"] img')?.alt === 'Climb');
    await delayed.fulfill({contentType:'image/webp', path:require('node:path').resolve(__dirname, '../../projects/in-the-saddle.webp')});
    await f.p.waitForLoadState('networkidle');
    assert.equal(await panel.locator('img').count(), 1);
    assert.equal(await panel.locator('img').getAttribute('src'), frames[2].src);
    assert.equal(await panel.getAttribute('aria-label'), 'Climb, show next photograph');
    assert.deepEqual(f.errors, []);
  } finally { await f.ctx.close(); }
});
