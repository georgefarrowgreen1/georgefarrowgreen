const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./gallery-fixture.cjs');

for (const assets of ['', 'min/']) for (const width of [390, 1440]) {
  test(`${assets || 'source/'}menu links reach the projects and photographs at ${width}px`, async () => {
    const f = await fixture(assets, { width });
    try {
      const menu = f.p.locator('.fi-menubtn');
      const bounds = await menu.boundingBox();
      const header = await f.p.locator('#bar').boundingBox();
      assert.ok(bounds.y >= header.y && bounds.y + bounds.height <= header.y + header.height);
      assert.ok(Math.abs(header.x + header.width - bounds.x - bounds.width) < 1);
      await menu.click();
      const popup = f.p.locator('#fi-floating-links');
      await popup.evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished)));
      assert.ok((await popup.boundingBox()).y >= bounds.y + bounds.height);
      await f.p.locator('#fi-floating-links a[href="#projects"]').click();
      assert.equal(new URL(f.p.url()).hash, '#projects');
      assert.equal(await menu.getAttribute('aria-expanded'), 'false');
      await menu.scrollIntoViewIfNeeded();
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

for (const assets of ['', 'min/']) {
  test(`${assets || 'source/'}appearance switch follows the device until a visitor chooses`, async () => {
    const f = await fixture(assets, { reduce: true });
    try {
      const { p } = f;
      const menu = p.locator('.fi-menubtn');
      const toggle = p.getByRole('switch', { name: 'Dark mode' });
      const theme = () => p.locator('html').getAttribute('data-theme');
      await p.emulateMedia({ colorScheme: 'dark' });
      await p.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
      await menu.click();
      const popupColor = () => p.locator('#fi-floating-links').evaluate(el => getComputedStyle(el).backgroundColor);
      assert.equal(await popupColor(), 'rgb(32, 32, 32)');
      assert.equal(await toggle.isChecked(), true);
      await toggle.focus();
      await p.keyboard.press('Space');
      assert.equal(await theme(), 'light');
      assert.equal(await menu.getAttribute('aria-expanded'), 'true');
      assert.equal(await toggle.isChecked(), false);
      assert.equal(await popupColor(), 'rgb(250, 250, 248)');
      assert.equal(await p.locator('meta[name="theme-color"]').getAttribute('content'), '#f4f4f2');
      await p.reload();
      assert.equal(await theme(), 'light');
      await menu.click();
      await toggle.click();
      await p.emulateMedia({ colorScheme: 'light' });
      await p.reload();
      assert.equal(await theme(), 'dark');
      assert.equal(await p.locator('meta[name="theme-color"]').getAttribute('content'), '#181818');
      await menu.click();
      await p.locator('#fi-floating-links [data-contact]').click();
      await p.locator('#contact-sheet[open]').waitFor();
      assert.equal(await p.locator('#contact-sheet').evaluate(el => getComputedStyle(el).colorScheme), 'dark');
      assert.deepEqual(f.errors, []);
    } finally { await f.ctx.close(); }
  });
}
