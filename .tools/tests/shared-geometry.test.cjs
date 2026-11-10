const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const { existsSync } = require('node:fs');
const { resolve } = require('node:path');
const ROOT = resolve(__dirname, '../..'), IFL = resolve(ROOT, '../inflite');
let browser, serveKit, KIT;
before(async () => {
  ({ serveKit, KIT } = await import('./roofkit/serve.mjs'));
  browser = process.env.UI_BROWSER === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] });
});
after(async () => browser?.close());
for (const [width, colorScheme] of [[320, 'dark'], [390, 'light'], [700, 'dark'], [1440, 'light']]) test(`shared surfaces keep rounded focus, text insets and centred icons at ${width}px ${colorScheme}`, async () => {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme, reducedMotion: 'reduce' });
  await serveKit(ctx, { main: ROOT + '/', ifl: IFL + '/' });
  const page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(KIT + '/'); await page.waitForFunction(() => window.kit?.ready);
    await page.evaluate(() => {
      const { F } = kit, u = F.ui;
      window.geometryField = u.field({ label: 'Your name', value: 'Sample name' });
      window.geometryIcon = u.iconBtn('info', { label: 'Details', run() {} });
      window.geometryRow = u.row({ title: 'A rounded row', sub: 'Supporting text', lead: { icon: 'bell' }, trail: 'chevron', run() {} });
      window.geometrySheet = F.sheet.open({ title: 'Your settings', body: b => b.append(geometryField, geometryIcon, u.list([geometryRow])), acts: [{ label: 'Continue', primary: true }] });
      geometryField.input.focus();
    });
    const proof = await page.evaluate(() => {
      const d = geometrySheet.el, style = getComputedStyle(d), field = getComputedStyle(geometryField), input = getComputedStyle(geometryField.input);
      const corners = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'].map(p => parseFloat(style[p]));
      const button = geometryIcon.getBoundingClientRect(), glyph = geometryIcon.querySelector('svg').getBoundingClientRect(), row = getComputedStyle(geometryRow), lead = geometryRow.querySelector('.ifl-lead').getBoundingClientRect(), leadIcon = geometryRow.querySelector('.ifl-lead svg').getBoundingClientRect();
      return { corners, inset: parseFloat(style.paddingLeft), fieldRadius: parseFloat(field.borderRadius), fieldInset: parseFloat(field.paddingLeft), inputOutline: input.outlineStyle, focusVisible: field.boxShadow !== 'none', rowRadius: parseFloat(row.borderRadius), rowInset: parseFloat(row.paddingLeft), button: { width: button.width, height: button.height }, dx: Math.abs(button.x + button.width / 2 - glyph.x - glyph.width / 2), dy: Math.abs(button.y + button.height / 2 - glyph.y - glyph.height / 2), leadDx: Math.abs(lead.x + lead.width / 2 - leadIcon.x - leadIcon.width / 2), leadDy: Math.abs(lead.y + lead.height / 2 - leadIcon.y - leadIcon.height / 2), overflow: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    assert.deepEqual(proof.corners, [30, 30, 30, 30]);
    assert.equal(proof.inset, width >= 600 ? 24 : 20);
    assert.equal(proof.fieldRadius, 16); assert.ok(proof.fieldInset >= 16);
    assert.equal(proof.inputOutline, 'none', 'the inner input must not draw a second square focus ring');
    assert.equal(proof.focusVisible, true, 'the rounded outer field retains a visible focus indicator');
    assert.ok(proof.rowRadius >= 16 && proof.rowInset >= 16);
    assert.ok(proof.button.width >= 44 && proof.button.height >= 44);
    for (const delta of [proof.dx, proof.dy, proof.leadDx, proof.leadDy]) assert.ok(delta <= 1, `icon centre differs by ${delta}px`);
    assert.equal(proof.overflow, false); assert.deepEqual(errors, []);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement === geometryIcon), true, 'keyboard navigation remains usable');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => geometrySheet.closed), true);
  } finally { await ctx.close(); }
});
