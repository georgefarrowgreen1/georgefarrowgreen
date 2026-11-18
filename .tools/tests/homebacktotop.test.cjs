const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./gallery-fixture.cjs');

for (const assets of ['', 'min/']) for (const width of [390, 1440]) {
  test(`${assets || 'source/'}menu links reach the projects and photographs at ${width}px`, async () => {
    const f = await fixture(assets, { width });
    try {
      const menu = f.p.locator('.fi-menubtn');
      const bounds = await menu.boundingBox();
      assert.ok(width - bounds.x - bounds.width >= 12 && width - bounds.x - bounds.width <= 26);
      assert.ok(740 - bounds.y - bounds.height >= 12 && 740 - bounds.y - bounds.height <= 26);
      await f.p.evaluate(() => scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
      assert.ok(await f.p.evaluate(() => scrollY > 0));
      assert.deepEqual(await menu.boundingBox(), bounds);
      await menu.click();
      await f.p.locator('#fi-floating-links a[href="#projects"]').click();
      assert.equal(new URL(f.p.url()).hash, '#projects');
      assert.equal(await menu.getAttribute('aria-expanded'), 'false');
      await menu.focus();
      await f.p.keyboard.press('Enter');
      await f.p.keyboard.press('Tab');
      assert.equal(await f.p.locator('#fi-floating-links a').first().evaluate(el => el === document.activeElement), true);
      await f.p.keyboard.press('Enter');
      assert.equal(new URL(f.p.url()).hash, '#fi-photos');
      assert.equal(new URL(f.p.url()).search, '?keep=ride');
      await menu.click();
      await f.p.keyboard.press('Escape');
      assert.equal(await menu.evaluate(el => el === document.activeElement), true);
      assert.deepEqual(f.errors, []);
    } finally { await f.ctx.close(); }
  });
}
test('the header wordmark links home without JavaScript', async () => {
  const f = await fixture('', { js: false });
  try {
    const logo = f.p.getByRole('link', { name: 'George Farrow-Green, home' });
    await logo.click();
    assert.equal(new URL(f.p.url()).hash, '#top');
    assert.deepEqual(f.errors, []);
  } finally { await f.ctx.close(); }
});
