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
