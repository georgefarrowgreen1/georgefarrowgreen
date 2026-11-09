// The production homepage loader, with real source/minified assets and controllable network readiness.
// Rendering changes must not hold the bio behind an account request, an unavailable script or a failed image.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync, statSync } = require('node:fs');
const { resolve, extname } = require('node:path');
const { chromium } = require('playwright');
const ROOT = resolve(__dirname, '../..'), HOME = 'https://loader.test';
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="100"><rect width="80" height="100" fill="#456"/></svg>';
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox', '--enable-unsafe-swiftshader'] }); });
after(async () => browser?.close());
const deferred = () => { let done; const promise = new Promise(resolve => { done = resolve; }); return { promise, done }; };
async function fixture(assets, options = {}) {
  const ctx = await browser.newContext({ viewport: { width: options.width || 390, height: 844 }, hasTouch: true,
    isMobile: (options.width || 390) <= 600, javaScriptEnabled: options.js !== false,
    reducedMotion: options.reduce ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(() => {
    window.loaderTest = { reveals: [], pageshows: [] };
    addEventListener('home:revealed', () => loaderTest.reveals.push(performance.now()));
    addEventListener('pageshow', e => loaderTest.pageshows.push(e.persisted));
  });
  if (options.noWebGL) await ctx.addInitScript(() => {
    const real = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) { return /webgl/i.test(type) ? null : real.call(this, type, ...args); };
  });
  if (options.trackRenderer) await ctx.addInitScript(() => {
    loaderTest.render = { raf: 0, draws: 0 }; loaderTest.gl = null;
    const frame = requestAnimationFrame;
    window.requestAnimationFrame = function (callback) { if (new Error().stack?.includes('loader-portrait.js')) loaderTest.render.raf++; return frame.call(this, callback); };
    const context = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) { const value = context.call(this, type, ...args); if (/webgl/i.test(type) && this.id === 'loader-canvas') loaderTest.gl = value; return value; };
    for (const Type of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) if (Type) for (const name of ['drawArrays', 'drawElements']) {
      const draw = Type.prototype[name]; Type.prototype[name] = function (...args) { loaderTest.render.draws++; return draw.apply(this, args); };
    }
  });
  const cover = deferred(), script = deferred(), words = deferred(), me = deferred();
  if (!options.holdCover) cover.done(); if (!options.holdScript) script.done();
  if (!options.holdWords) words.done(); if (!options.holdMe) me.done();
  const errors = [], requested = [];
  await ctx.route(`${HOME}/**`, async route => {
    const url = new URL(route.request().url()), path = url.pathname; requested.push(path);
    if (path === '/elsewhere') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Another page</title><p>Another page</p>' });
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: readFileSync(resolve(ROOT, 'index.html'), 'utf8')
      .replace('<html lang="en-GB">', options.holdWords ? '<html lang="en-GB">' : '<html lang="en-GB" data-words>') });
    if (path === '/api/me') { await me.promise; return route.fulfill({ json: { signedIn: false } }); }
    if (path === '/api/content') { await words.promise; return route.fulfill({ json: { name: 'Updated George', role: 'Fitness · Outdoors', bio: 'Updated biography from the server.' } }); }
    if (path === '/api/background') {
      if (!url.search) return route.fulfill({ json: { images: [{ id: 'first', focus: '50% 50%' }] } });
      if (url.searchParams.get('id') === 'cover') await cover.promise;
      return options.coverFails ? route.fulfill({ status: 404, body: '' }) : route.fulfill({ contentType: 'image/svg+xml', body: SVG });
    }
    if (path === '/app.js') await script.promise;
    if ((options.missing || []).includes(path)) return route.fulfill({ status: 404, body: '' });
    if (path.startsWith('/apps/')) return route.fulfill({ contentType: 'image/svg+xml', body: SVG });
    if (options.portraitFails && path.startsWith('/loading/')) return route.fulfill({ status: 404, body: '' });
    let file = resolve(ROOT, path.slice(1));
    const min = resolve(ROOT, assets + path.slice(1));
    if (assets && /\.(?:css|js)$/.test(path) && existsSync(min)) file = min;
    if (existsSync(file) && statSync(file).isFile()) {
      const type = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.avif': 'image/avif', '.webp': 'image/webp' }[extname(path)] || 'application/octet-stream';
      return route.fulfill({ contentType: type, body: readFileSync(file) });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  const p = await ctx.newPage(); p.on('pageerror', e => { errors.push(e.message); console.error('PAGE ERROR', e.message); });
  await p.goto(`${HOME}/${options.hash || ''}`, { waitUntil: 'commit' });
  return { ctx, p, errors, requested, cover, script, words, me,
    async close() { cover.done(); script.done(); words.done(); me.done(); await ctx.close(); } };
}
const active = p => p.waitForFunction(() => document.documentElement.classList.contains('intro-loading'));
const released = async (p, timeout = 5500) => { await p.locator('#page').waitFor({ state: 'attached' }); await p.waitForFunction(() => !document.documentElement.classList.contains('intro-loading'), null, { timeout }); };
const readable = async p => { await released(p); await p.waitForFunction(() => !document.documentElement.classList.contains('intro-revealing')); assert.equal(await p.locator('#page').evaluate(el => el.inert), false); };
const geometry = p => p.locator('.hero h1').evaluate(el => { let top = 0, left = 0; for (let node = el; node; node = node.offsetParent) { top += node.offsetTop; left += node.offsetLeft; } return { top, left, width: el.offsetWidth, height: el.offsetHeight }; });
for (const assets of ['', 'min/']) {
  test(`${assets || 'source/'}ready cover and text release promptly while an account request is still pending`, async () => {
    const f = await fixture(assets, { holdCover: true, holdMe: true });
    try {
      await active(f.p); await f.p.locator('#cover img').waitFor({ state: 'attached' });
      await f.p.evaluate(() => { loaderTest.readyAt = performance.now(); }); f.cover.done();
      await released(f.p, 1800);
      const timing = await f.p.evaluate(() => ({ elapsed: performance.now() - loaderTest.readyAt, reveals: loaderTest.reveals.length, known: document.body.classList.contains('known') }));
      assert.ok(timing.elapsed < 1500, `no minimum loading duration: ${timing.elapsed}ms`);
      assert.equal(timing.reveals, 1); assert.equal(timing.known, false, 'account lookup is not a readiness dependency');
      await readable(f.p); assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
  });
  test(`${assets || 'source/'}a slow cover keeps the loader visible and keeps the hero geometry stable`, async () => {
    const f = await fixture(assets, { holdCover: true });
    try {
      await active(f.p); await f.p.locator('.hero h1').waitFor({ state: 'attached' }); await f.p.evaluate(() => document.fonts.ready);
      const before = await geometry(f.p); await f.p.waitForTimeout(450);
      assert.equal(await f.p.locator('#site-loader').isVisible(), true); assert.equal(await f.p.evaluate(() => document.documentElement.classList.contains('intro-loading')), true);
      f.cover.done(); await readable(f.p); assert.deepEqual(await geometry(f.p), before, 'overlay exit does not move or resize the hero');
      assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
  });
  test(`${assets || 'source/'}fresh words settle before reveal instead of exposing the old defaults`, async () => {
    const f = await fixture(assets, { holdWords: true });
    try {
      await active(f.p); await f.p.waitForTimeout(250); assert.equal(await f.p.locator('.hero h1').innerText(), 'George Farrow-Green');
      assert.equal(await f.p.evaluate(() => document.documentElement.classList.contains('intro-loading')), true);
      f.words.done(); await released(f.p, 1800); assert.equal(await f.p.locator('.hero h1').innerText(), 'Updated George'); assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
  });
  test(`${assets || 'source/'}a failed cover reveals the usable bio`, async () => {
    const f = await fixture(assets, { coverFails: true });
    try { await readable(f.p); assert.equal(await f.p.locator('.hero h1').isVisible(), true); assert.deepEqual(f.errors, []); }
    finally { await f.close(); }
  });
  test(`${assets || 'source/'}a missing main script cannot leave the loader covering the bio`, async () => {
    const f = await fixture(assets, { missing: ['/app.js'] });
    try {
      await active(f.p); await released(f.p); const elapsed = await f.p.evaluate(() => performance.now());
      assert.ok(elapsed < 5000, `safety release took ${elapsed}ms`); await readable(f.p); assert.equal(await f.p.locator('.hero h1').isVisible(), true); assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
  });
}

test('a stalled cover is bounded by the safety timeout', async () => {
  const f = await fixture('', { holdCover: true });
  try { await active(f.p); await released(f.p); assert.ok(await f.p.evaluate(() => performance.now()) < 5000); await readable(f.p); assert.deepEqual(f.errors, []); }
  finally { await f.close(); }
});
test('a stalled content request is bounded by the same safety timeout', async () => {
  const f = await fixture('', { holdWords: true });
  try { await active(f.p); await released(f.p); assert.equal(await f.p.locator('.hero h1').innerText(), 'George Farrow-Green'); await readable(f.p); assert.deepEqual(f.errors, []); }
  finally { await f.close(); }
});
for (const missing of [['/loader.js'], ['/loader-portrait.js']]) test(`${missing[0]} unavailable leaves the page usable`, async () => {
  const f = await fixture('', { missing });
  try { await readable(f.p); assert.equal(await f.p.locator('.hero h1').isVisible(), true); assert.deepEqual(f.errors, []); }
  finally { await f.close(); }
});
test('portrait asset failure never prevents the page from opening', async () => {
  const f = await fixture('', { portraitFails: true });
  try { await readable(f.p); assert.equal(await f.p.locator('.hero h1').isVisible(), true); assert.deepEqual(f.errors, []); }
  finally { await f.close(); }
});
test('without WebGL a static portrait is available during loading', async () => {
  const f = await fixture('', { noWebGL: true, holdCover: true });
  try { await active(f.p); await f.p.locator('#loader-portrait').waitFor({ state: 'visible' }); await f.p.waitForFunction(() => { const image = document.querySelector('#loader-portrait img'); return image?.complete && image.naturalWidth > 0; }); assert.equal(await f.p.locator('#site-loader').isVisible(), true); f.cover.done(); await readable(f.p); assert.deepEqual(f.errors, []); }
  finally { await f.close(); }
});
test('Reduce Motion retains a still portrait and a brief exit', async () => {
  const f = await fixture('', { reduce: true, holdCover: true });
  try {
    await active(f.p); await f.p.locator('#loader-portrait').waitFor({ state: 'visible' }); await f.p.waitForFunction(() => document.querySelector('#loader-portrait')?.classList.contains('ready')); await f.p.waitForTimeout(220);
    const moving = await f.p.locator('#site-loader').evaluate(el => el.getAnimations({ subtree: true }).filter(a => a.playState === 'running').length);
    assert.equal(moving, 0, 'no CSS motion during the hold'); f.cover.done(); await readable(f.p); assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
});
test('Skip loading is keyboard reachable and immediately releases readiness', async () => {
  const f = await fixture('', { holdCover: true });
  try { await active(f.p); await f.p.locator('#loader-skip').focus(); await f.p.keyboard.press('Enter'); await released(f.p, 500); await readable(f.p); assert.deepEqual(f.errors, []); }
  finally { await f.close(); }
});
test('account hand-back does not replay the loading portrait', async () => {
  const f = await fixture('', { hash: '#signedin' });
  try { await f.p.locator('#page').waitFor({ state: 'attached' }); assert.equal(await f.p.evaluate(() => document.documentElement.classList.contains('intro-loading')), false); await readable(f.p); assert.deepEqual(f.errors, []); }
  finally { await f.close(); }
});
test('Back navigation does not replay the loading portrait', async () => {
  const f = await fixture('');
  try { await readable(f.p); await f.p.goto(`${HOME}/elsewhere`); await f.p.goBack({ waitUntil: 'domcontentloaded' }); await readable(f.p); assert.equal(await f.p.evaluate(() => document.documentElement.classList.contains('intro-loading')), false); assert.deepEqual(f.errors, []); }
  finally { await f.close(); }
});
test('a persisted pageshow clears a half-finished loader', async () => {
  const f = await fixture('', { holdCover: true });
  try { await active(f.p); await f.p.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))); await readable(f.p); assert.deepEqual(f.errors, []); }
  finally { await f.close(); }
});
test('without JavaScript the bio is visible and the loader stays hidden', async () => {
  const f = await fixture('', { js: false });
  try { await f.p.locator('#page').waitFor({ state: 'attached' }); assert.equal(await f.p.locator('#site-loader').isVisible(), false); assert.equal(await f.p.locator('#page').evaluate(el => el.inert), false); assert.equal(await f.p.locator('.hero h1').isVisible(), true); const reachable = await f.p.getByRole('button', { name: 'Get in touch', exact: true }).evaluate(el => { el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }); assert.equal(reachable, true, 'no overlay intercepts the native contact button'); }
  finally { await f.close(); }
});

test('a stalled main script still mounts an accessible portrait and Escape releases it', async () => {
  const f = await fixture('', { holdScript: true });
  try { await active(f.p); await f.p.locator('#site-loader').waitFor({ state: 'visible' }); assert.equal(await f.p.locator('#page').evaluate(el => el.inert), true); assert.equal(await f.p.locator('#page').getAttribute('aria-busy'), 'true'); assert.notEqual(await f.p.locator('body').getAttribute('aria-busy'), 'true', 'loading status is outside the busy content'); await f.p.keyboard.press('Escape'); await readable(f.p); assert.deepEqual(f.errors, []); }
  finally { await f.close(); }
});
test('runtime Reduce Motion freezes GPU drawing and reveal cleans up the renderer', async () => {
  const f = await fixture('', { holdCover: true, trackRenderer: true });
  try {
    await active(f.p); await f.p.waitForFunction(() => loaderTest.render.draws > 0 && document.querySelector('#loader-portrait')?.classList.contains('ready'));
    await f.p.emulateMedia({ reducedMotion: 'reduce' }); await f.p.waitForTimeout(200);
    const still = await f.p.evaluate(() => ({ ...loaderTest.render })); await f.p.waitForTimeout(350);
    assert.deepEqual(await f.p.evaluate(() => ({ ...loaderTest.render })), still, 'no recurring RAF or GPU draws in Reduce Motion');
    await f.p.emulateMedia({ reducedMotion: 'no-preference' });
    await f.p.waitForFunction(before => loaderTest.render.draws > before, still.draws);
    f.cover.done(); await readable(f.p); await f.p.waitForTimeout(100);
    const finished = await f.p.evaluate(() => ({ ...loaderTest.render })); await f.p.waitForTimeout(350);
    assert.deepEqual(await f.p.evaluate(() => ({ ...loaderTest.render })), finished, 'no GPU activity after the overlay has gone'); assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
});
test('context loss returns to the static portrait without trapping the page', async () => {
  const f = await fixture('', { holdCover: true, trackRenderer: true });
  try {
    await active(f.p); await f.p.waitForFunction(() => loaderTest.render.draws > 0 && document.querySelector('#loader-portrait')?.classList.contains('ready'));
    await f.p.evaluate(() => loaderTest.gl.getExtension('WEBGL_lose_context').loseContext());
    await f.p.waitForFunction(() => !document.querySelector('#loader-portrait')?.classList.contains('ready'));
    assert.equal(await f.p.locator('#loader-portrait img').isVisible(), true); assert.equal(await f.p.evaluate(() => document.documentElement.classList.contains('intro-loading')), true);
    f.cover.done(); await readable(f.p); assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
});
