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
      // The browser may scroll the trigger into view when the opening finishes.
      const openedButton = await menu.boundingBox();
      assert.ok((await popup.boundingBox()).y >= openedButton.y + openedButton.height);
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
test('the My details shortcut from the 404 footer opens the bio calling card', async () => {
  const f = await fixture('', { hash: '#my-details' });
  try {
    await f.p.locator('#details-sheet[open]').waitFor();
    assert.equal(new URL(f.p.url()).hash, '');
    await f.p.locator('.calling-switch').click();
    assert.equal(await f.p.locator('.calling-switch').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(f.errors, []);
  } finally { await f.ctx.close(); }
});

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

test('the menu switch moves the palette and thumb together and reverses in place', async () => {
  const { p, ctx, errors } = await fixture('min/', { hash: '#top' });
  try {
    await p.locator('.fi-menubtn').click();
    const result = await p.evaluate(async () => {
      const root = document.documentElement, toggle = document.querySelector('#fi-theme');
      const menu = toggle.closest('nav');
      await Promise.all(menu.getAnimations().map(a => a.finished));
      const style = selector => getComputedStyle(document.querySelector(selector));
      const sample = () => {
        const thumb = getComputedStyle(toggle.firstElementChild, '::after');
        return {
          paper: style('#photo-index').backgroundColor, ink: style('#photo-index').color,
          projectIcon: style('.fi-entry summary i').color,
          rule: style('#projects').borderTopColor, menuRule: getComputedStyle(menu).borderTopColor,
          thumbInk: thumb.backgroundColor, x: thumb.transform === 'none' ? 0 : new DOMMatrixReadOnly(thumb.transform).m41,
          photos: [...document.querySelectorAll('.fi-reel img')].map(img =>
            [img.src, img.getBoundingClientRect().toJSON(), getComputedStyle(img).filter, getComputedStyle(img).opacity])
        };
      };
      const start = sample();
      toggle.click();
      const tracks = document.getAnimations().filter(a => a.transitionProperty);
      for (const a of tracks) { a.pause(); a.currentTime = a.effect.getTiming().duration * .42; }
      const during = sample();
      toggle.click();
      const reversed = sample();
      await Promise.all(document.getAnimations().map(a => a.finished.catch(() => {})));
      return { start, during, reversed, end: sample() };
    });
    for (const prop of ['paper', 'ink', 'rule']) {
      assert.notEqual(result.during[prop], result.start[prop]);
      assert.equal(result.reversed[prop], result.during[prop]);
    }
    assert.ok(result.during.x > 0 && result.during.x < 40);
    assert.ok(Math.abs(result.reversed.x - result.during.x) < 1);
    assert.equal(result.during.rule, result.during.menuRule);
    assert.equal(result.during.ink, result.during.thumbInk);
    assert.equal(result.during.ink, result.during.projectIcon);
    assert.deepEqual(result.during.photos, result.start.photos);
    assert.deepEqual(result.end, result.start);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('desktop menu lettering matches the page on every painted frame', async () => {
  const { p, ctx } = await fixture('min/', { width: 1440, hash: '#top' });
  try {
    await p.locator('.fi-menubtn').click();
    const frames = await p.evaluate(async () => {
      const page = document.querySelector('#photo-index');
      const menu = document.querySelector('#fi-floating-links');
      const label = menu.querySelector('a');
      const button = document.querySelector('.fi-menubtn');
      await Promise.all(menu.getAnimations().map(a => a.finished));
      document.getElementById('fi-theme').click();
      const ink = page.getAnimations().find(a => a.transitionProperty === 'color');
      const frames = [];
      do {
        await new Promise(requestAnimationFrame);
        frames.push([page, label, button].map(el => getComputedStyle(el).color));
      } while (ink.playState === 'running');
      return frames;
    });
    assert.ok(new Set(frames.map(([page]) => page)).size > 1);
    for (const [page, label, button] of frames) assert.deepEqual([label, button], [page, page]);
  } finally { await ctx.close(); }
});
