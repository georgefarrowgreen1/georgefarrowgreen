// The production homepage loader, with real source/minified assets and controllable network readiness.
// Rendering changes must not hold the bio behind an account request, an unavailable script or a failed image.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync, statSync } = require('node:fs');
const { resolve, extname } = require('node:path');
const { chromium } = require('playwright');
const sharp = require('sharp');
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
  if (options.trackExit) await ctx.addInitScript(() => {
    loaderTest.frames = [];
    const opacity = el => {
      let value = 1;
      for (let node = el; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.visibility === 'hidden' || style.display === 'none') return 0;
        value *= Number(style.opacity);
      }
      return value;
    };
    const sample = () => {
      const overlay = document.getElementById('site-loader'), head = document.getElementById('loader-portrait');
      const veil = overlay && !overlay.hidden ? opacity(overlay) : 0;
      const headline = document.querySelector('.hero h1');
      loaderTest.frames.push({ time: performance.now(), head: head ? opacity(head) : 0,
        canvas: document.getElementById('loader-canvas') ? opacity(document.getElementById('loader-canvas')) : 0,
        source: head?.querySelector('img') ? opacity(head.querySelector('img')) : 0,
        veil, headline: headline ? opacity(headline) * (1 - veil) : 0,
        loading: document.documentElement.classList.contains('intro-loading'),
        exiting: document.documentElement.classList.contains('intro-exiting') });
      if (performance.now() < 6000 && (overlay || !document.querySelector('#page'))) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
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
  if (options.trackCost) await ctx.addInitScript(() => {
    loaderTest.cost = { compile: 0, link: 0, upload: 0, geometry: 0, layout: 0, resize: 0, typed: 0 };
    let inFrame = false;
    const frame = requestAnimationFrame;
    window.requestAnimationFrame = function (callback) {
      if (!new Error().stack?.includes('loader-portrait.js')) return frame.call(this, callback);
      return frame.call(this, timestamp => { inFrame = true; try { callback(timestamp); } finally { inFrame = false; } });
    };
    for (const Type of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) if (Type) {
      for (const [name, counter] of [['compileShader', 'compile'], ['linkProgram', 'link'], ['texImage2D', 'upload'], ['texSubImage2D', 'upload'], ['bufferData', 'geometry'], ['bufferSubData', 'geometry']]) {
        const real = Type.prototype[name];
        Type.prototype[name] = function (...args) { if (inFrame) loaderTest.cost[counter]++; return real.apply(this, args); };
      }
    }
    const layout = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () { if (inFrame) loaderTest.cost.layout++; return layout.call(this); };
    for (const name of ['width', 'height']) {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, name);
      Object.defineProperty(HTMLCanvasElement.prototype, name, { ...descriptor, set(value) { if (inFrame && this.id === 'loader-canvas') loaderTest.cost.resize++; return descriptor.set.call(this, value); } });
    }
    const Typed = Float32Array;
    window.Float32Array = new Proxy(Typed, { construct(target, args) { if (inFrame) loaderTest.cost.typed++; return Reflect.construct(target, args); } });
  });
  const cover = deferred(), script = deferred(), words = deferred(), me = deferred(), portrait = deferred(), renderer = deferred();
  if (!options.holdCover) cover.done(); if (!options.holdScript) script.done();
  if (!options.holdWords) words.done(); if (!options.holdMe) me.done();
  if (!options.holdPortrait) portrait.done();
  if (!options.holdRenderer) renderer.done();
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
    if (path === '/loader-portrait.js') await renderer.promise;
    if ((options.missing || []).includes(path)) return route.fulfill({ status: 404, body: '' });
    if (path.startsWith('/apps/')) return route.fulfill({ contentType: 'image/svg+xml', body: SVG });
    if (path.startsWith('/loading/')) {
      await portrait.promise;
      if (options.portraitFails) return route.fulfill({ status: 404, body: '' });
    }
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
  return { ctx, p, errors, requested, cover, script, words, me, portrait, renderer,
    async close() { cover.done(); script.done(); words.done(); me.done(); portrait.done(); renderer.done(); await ctx.close(); } };
}
const active = p => p.waitForFunction(() => document.documentElement.classList.contains('intro-loading'));
const released = async (p, timeout = 5500) => { await p.locator('#page').waitFor({ state: 'attached' }); await p.waitForFunction(() => !document.documentElement.classList.contains('intro-loading'), null, { timeout }); };
const readable = async p => { await released(p); await p.waitForFunction(() => !document.documentElement.classList.contains('intro-revealing')); assert.equal(await p.locator('#page').evaluate(el => el.inert), false); };
const geometry = p => p.locator('.hero h1').evaluate(el => { let top = 0, left = 0; for (let node = el; node; node = node.offsetParent) { top += node.offsetTop; left += node.offsetLeft; } return { top, left, width: el.offsetWidth, height: el.offsetHeight }; });
for (const assets of ['', 'min/']) {
  test(`${assets || 'source/'}ready content gives the portrait its two-second showcase while account lookup stays independent`, async () => {
    const f = await fixture(assets, { holdCover: true, holdMe: true, trackExit: true });
    try {
      await active(f.p); await f.p.locator('#cover img').waitFor({ state: 'attached' });
      await f.p.evaluate(() => { loaderTest.readyAt = performance.now(); }); f.cover.done();
      await f.p.waitForFunction(() => { const el = document.getElementById('loader-portrait'); return el?.classList.contains('shown') && Number(getComputedStyle(el).opacity) > .025; });
      await f.p.waitForTimeout(700);
      assert.equal(await f.p.evaluate(() => document.documentElement.classList.contains('intro-loading')), true, 'ready content retains the approved visible showcase');
      await released(f.p, 3500);
      const timing = await f.p.evaluate(() => ({ elapsed: performance.now() - loaderTest.readyAt, reveals: loaderTest.reveals.length, known: document.body.classList.contains('known'), frames: loaderTest.frames }));
      const firstVisible = timing.frames.find(x => x.head > .98);
      const firstExit = timing.frames.find(x => x.exiting);
      assert.ok(firstVisible && firstExit, 'both visible art and its exit were sampled');
      assert.ok(firstExit.time - firstVisible.time >= 1900, `two seconds starts when the face is visible (${firstExit.time - firstVisible.time}ms)`);
      assert.ok(timing.elapsed < 4000, `the deliberate showcase remains bounded (${timing.elapsed}ms)`);
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
      f.words.done(); await released(f.p, 3500); assert.equal(await f.p.locator('.hero h1').innerText(), 'Updated George'); assert.deepEqual(f.errors, []);
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
  try {
    await readable(f.p);
    assert.ok(await f.p.evaluate(() => performance.now()) < 1500, 'a failed portrait does not impose a showcase hold');
    assert.equal(await f.p.locator('.hero h1').isVisible(), true); assert.deepEqual(f.errors, []);
  }
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
    assert.equal(moving, 0, 'no CSS motion during the hold');
    await f.p.evaluate(() => { loaderTest.readyAt = performance.now(); }); f.cover.done(); await readable(f.p);
    assert.ok(await f.p.evaluate(() => performance.now() - loaderTest.readyAt) < 800, 'Reduce Motion does not force a two-second showcase');
    assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
});
test('Skip loading is keyboard reachable and immediately releases readiness', async () => {
  const f = await fixture('', { holdCover: true });
  try {
    await active(f.p);
    await f.p.waitForFunction(() => { const el = document.getElementById('loader-portrait'); return el?.classList.contains('shown') && Number(getComputedStyle(el).opacity) > .5; });
    await f.p.locator('#loader-skip').focus(); await f.p.evaluate(() => { loaderTest.skippedAt = performance.now(); });
    await f.p.keyboard.press('Enter'); await released(f.p, 500); await readable(f.p);
    assert.ok(await f.p.evaluate(() => performance.now() - loaderTest.skippedAt) < 800, 'Skip bypasses the remaining showcase time');
    assert.deepEqual(f.errors, []);
  }
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

// Check the visible sequence, not just class names: translucent art must never sit over readable hero text.
for (const assets of ['', 'min/']) test(`${assets || 'source/'}the showcased portrait clears before the headline enters`, async () => {
  const f = await fixture(assets, { holdCover: true, noWebGL: true, trackExit: true });
  try {
    await active(f.p);
    await f.p.waitForFunction(() => { const image = document.querySelector('#loader-portrait img'); return image?.complete && image.naturalWidth > 0; });
    await f.p.evaluate(() => document.fonts.ready);
    await f.p.waitForTimeout(80);
    await f.p.evaluate(() => { loaderTest.readyAt = performance.now(); }); f.cover.done();
    await readable(f.p);
    const result = await f.p.evaluate(() => ({ frames: loaderTest.frames.filter(x => x.time >= loaderTest.readyAt),
      duration: performance.now() - loaderTest.readyAt, reveals: loaderTest.reveals.length }));
    assert.ok(result.frames.some(x => x.head > .2), 'sampler observed the loaded portrait');
    assert.ok(result.frames.some(x => x.headline > .025), 'sampler observed the page entering');
    assert.equal(result.frames.some(x => x.head > .025 && x.headline > .025), false,
      'the portrait must be visually gone before the page becomes readable');
    const exit = result.frames.find(x => x.exiting);
    assert.ok(exit, 'a visible portrait gets its separate exit phase');
    assert.ok(result.frames.at(-1).time - exit.time < 650, 'the head and backdrop exit remain short after the showcase');
    assert.ok(result.duration < 3500, `the showcase plus clean exit stays bounded (${result.duration}ms)`);
    assert.equal(result.reveals, 1); assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
});
test('already-ready content still showcases the approved static face before its clean reveal', async () => {
  const f = await fixture('', { noWebGL: true, trackExit: true, holdMe: true });
  try {
    await readable(f.p);
    const result = await f.p.evaluate(() => ({ frames: loaderTest.frames, reveals: loaderTest.reveals,
      elapsed: performance.now(), known: document.body.classList.contains('known') }));
    assert.equal(result.reveals.length, 1);
    const visible = result.frames.find(x => x.head > .98), exit = result.frames.find(x => x.exiting);
    assert.ok(visible && exit, 'a warm ready visit still displays the approved face');
    assert.ok(exit.time - visible.time >= 1900, `the static fallback also receives its visible two-second showcase (${exit.time - visible.time}ms)`);
    assert.ok(result.elapsed < 4000, `the ready-page showcase does not exceed the safety bound (${result.elapsed}ms)`);
    assert.equal(result.frames.some(x => x.head > .025 && x.headline > .025), false);
    assert.equal(result.known, false, 'account readiness remains independent');
    assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
});

test('a stalled portrait asset fails open instead of starting an invisible two-second hold', async () => {
  const f = await fixture('', { holdPortrait: true, noWebGL: true, trackExit: true });
  try {
    await active(f.p); await readable(f.p);
    const result = await f.p.evaluate(() => ({ elapsed: performance.now(), frames: loaderTest.frames }));
    assert.ok(result.elapsed < 2500, `ready content only waits briefly for unavailable art (${result.elapsed}ms)`);
    assert.equal(result.frames.some(x => x.head > .025), false, 'unavailable art never qualifies as a visible showcase');
    assert.equal(await f.p.locator('#page').evaluate(el => el.inert), false);
    assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
});

test('a portrait arriving late cannot extend the hard readiness safety deadline', async () => {
  const f = await fixture('', { holdCover: true, holdPortrait: true, noWebGL: true });
  try {
    await active(f.p); await f.p.waitForTimeout(2500); f.portrait.done();
    await f.p.waitForFunction(() => { const el = document.getElementById('loader-portrait'); return el?.classList.contains('shown') && Number(getComputedStyle(el).opacity) > .025; }, null, { timeout: 1000 });
    await readable(f.p);
    assert.ok(await f.p.evaluate(() => performance.now()) < 5000, 'the four-second safety bypasses a late portrait’s remaining showcase time');
    assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
});

for (const assets of ['', 'min/']) test(`${assets || 'source/'}a contact-report link waits for the showcase before opening its prefilled sheet once`, async () => {
  const about = '/missing-cottage', from = 'https://example.test/stays?season=summer&year=2026';
  const expected = `A link to ${about} doesn’t go anywhere. It’s on ${from}`;
  const f = await fixture(assets, { holdMe: true, noWebGL: true,
    hash: `#contact=${encodeURIComponent(about)}|${encodeURIComponent(from)}` });
  try {
    await active(f.p);
    await f.p.waitForFunction(() => { const el = document.getElementById('loader-portrait'); return el?.classList.contains('shown') && Number(getComputedStyle(el).opacity) > .98; });
    await f.p.evaluate(() => {
      loaderTest.contactClicks = [];
      document.querySelector('.cta [data-contact]').addEventListener('click', () => loaderTest.contactClicks.push({
        time: performance.now(), loading: document.documentElement.classList.contains('intro-loading')
      }));
    });
    f.me.done(); await f.p.locator('body.known').waitFor();
    assert.equal(await f.p.locator('#c-message').inputValue(), expected, 'the encoded report is preserved during the hold');
    assert.equal(new URL(f.p.url()).hash, '', 'the report hash is consumed once');
    await f.p.waitForTimeout(500);
    assert.equal(await f.p.evaluate(() => document.documentElement.classList.contains('intro-loading')), true);
    assert.equal(await f.p.locator('#contact-sheet').evaluate(el => el.open), false, 'a top-layer sheet must not cover the face');
    assert.equal(await f.p.evaluate(() => loaderTest.contactClicks.length), 0);
    await released(f.p, 3500);
    await f.p.waitForFunction(() => document.querySelector('#contact-sheet').open);
    await f.p.waitForFunction(() => !document.documentElement.classList.contains('intro-revealing'));
    const opened = await f.p.evaluate(() => ({ reveals: loaderTest.reveals, clicks: loaderTest.contactClicks }));
    assert.equal(opened.clicks.length, 1, 'automatic contact opening happens once');
    assert.equal(opened.clicks[0].loading, false);
    assert.ok(opened.clicks[0].time >= opened.reveals[0], 'the contact action follows the page reveal');
    assert.equal(await f.p.locator('#c-message').inputValue(), expected);
    await f.p.locator('#contact-sheet').getByRole('button', { name: 'Close', exact: true }).click();
    await f.p.waitForFunction(() => !document.querySelector('#contact-sheet').open && !document.body.classList.contains('sheet-up'));
    assert.equal(await f.p.locator('#page').evaluate(el => el.inert), false);
    assert.equal(await f.p.locator('#bar').evaluate(el => el.inert), false);
    assert.equal(await f.p.locator('body').evaluate(el => el.style.position), '', 'closing releases the body scroll lock');
    assert.notEqual(await f.p.evaluate(() => getComputedStyle(document.documentElement).overflowY), 'hidden');
    assert.equal(await f.p.locator('.cta [data-contact]').evaluate(el => el === document.activeElement), true, 'closing returns focus to the hero contact action');
    assert.equal(f.requested.includes('/api/contact'), false, 'this regression never submits a message');
    assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
});


// Sample the composed result: a raw-canvas-only test would miss a CSS blend/mask halo.
async function portraitMargins(p) {
  const sample = await p.locator('#loader-portrait').evaluate(el => {
    const bounds = el.getBoundingClientRect(), image = el.querySelector('img');
    const rgb = getComputedStyle(document.getElementById('site-loader')).backgroundColor.match(/\d+/g).slice(0, 3).map(Number);
    const source = document.createElement('canvas'); source.width = image.naturalWidth; source.height = image.naturalHeight;
    const context = source.getContext('2d', { willReadFrequently: true }); context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, source.width, source.height).data, points = [];
    // Source compression leaves a near-black floor. Qualify empty neighborhoods independently
    // of the requested overlay colour, so an all-black backdrop still exercises these pixels.
    const emptySource = (u, v) => {
      const sx = Math.round(u * (source.width - 1)), sy = Math.round(v * (source.height - 1));
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = Math.max(0, Math.min(source.width - 1, sx + dx)), y = Math.max(0, Math.min(source.height - 1, sy + dy)), i = (y * source.width + x) * 4;
        if ([0, 1, 2].some(c => pixels[i + c] > 8)) return false;
      }
      return true;
    };
    for (const radius of [.44, .47, .495]) for (let angle = 0; angle < 360; angle += 10) {
      const a = angle * Math.PI / 180, u = .5 + Math.cos(a) * radius, v = .5 + Math.sin(a) * radius;
      if (emptySource(u, v)) points.push({ u, v });
    }
    for (let y = 1; y < 25; y++) for (let x = 1; x < 25; x++) {
      const u = x / 25, v = y / 25;
      if (emptySource(u, v)) points.push({ u, v });
    }
    return { bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }, points, rgb,
      mask: getComputedStyle(el).maskImage };
  });
  const { bounds, points, rgb } = sample;
  assert.deepEqual(rgb, [0, 0, 0], 'the loader backdrop is completely black');
  assert.ok(points.length >= 60, 'enough uncontaminated source-background samples surround the head');
  const clip = { x: Math.floor(bounds.x) - 3, y: Math.floor(bounds.y) - 3, width: Math.ceil(bounds.width) + 6, height: Math.ceil(bounds.height) + 6 };
  const { data, info } = await sharp(await p.screenshot({ clip })).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let worst = 0;
  for (const point of points) {
    const x = Math.floor(bounds.x + point.u * bounds.width - clip.x), y = Math.floor(bounds.y + point.v * bounds.height - clip.y), i = (y * info.width + x) * 3;
    for (let c = 0; c < 3; c++) worst = Math.max(worst, data[i + c]);
  }
  let facePixels = 0;
  for (let y = Math.round(info.height * .2); y < info.height * .8; y++) for (let x = Math.round(info.width * .25); x < info.width * .75; x++) {
    const i = (y * info.width + x) * 3;
    if ([0, 1, 2].some(c => data[i + c] > rgb[c] + 24)) facePixels++;
  }
  assert.ok(facePixels > 80, 'the face remains visibly rendered rather than clearing the entire portrait');
  assert.equal(worst, 0, 'empty portrait pixels must be exactly black, with no compression grain or coloured floor');
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (x > 1 && x < info.width - 2 && y > 1 && y < info.height - 2) continue;
    const i = (y * info.width + x) * 3;
    assert.equal(data[i] | data[i + 1] | data[i + 2], 0, 'the outside portrait margin must also be completely black');
  }
  assert.equal(sample.mask, 'none', 'the approved head is not cropped by a geometric mask');
}
for (const assets of ['', 'min/']) for (const noWebGL of [false, true]) test(`${assets || 'source/'}${noWebGL ? 'static' : 'animated'} portrait background is pure black without grain or a geometric boundary`, async () => {
  const f = await fixture(assets, { holdCover: true, noWebGL });
  try {
    await active(f.p);
    await f.p.waitForFunction(noWebGL => {
      const portrait = document.getElementById('loader-portrait'), canvas = document.getElementById('loader-canvas');
      return portrait?.classList.contains('shown') && Number(getComputedStyle(portrait).opacity) > .999 &&
        (noWebGL || (portrait.classList.contains('ready') && Number(getComputedStyle(canvas).opacity) > .999));
    }, noWebGL);
    for (let i = 0; i < (noWebGL ? 1 : 3); i++) { if (i) await f.p.waitForTimeout(220); await portraitMargins(f.p); }
    assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
});
for (const assets of ['', 'min/']) test(`${assets || 'source/'}steady portrait motion does not compile, allocate, resize or measure layout in its frame loop`, async () => {
  const f = await fixture(assets, { holdCover: true, trackRenderer: true, trackCost: true, trackExit: true });
  try {
    await active(f.p);
    await f.p.waitForFunction(() => document.getElementById('loader-portrait')?.classList.contains('shown') &&
      document.getElementById('loader-portrait')?.classList.contains('ready') && loaderTest.render.draws > 0);
    await f.p.waitForTimeout(150);
    const before = await f.p.evaluate(() => ({ cost: { ...loaderTest.cost }, draws: loaderTest.render.draws }));
    await f.p.waitForTimeout(350);
    const after = await f.p.evaluate(() => ({ cost: { ...loaderTest.cost }, draws: loaderTest.render.draws }));
    assert.ok(after.draws > before.draws, 'the sampled renderer was actively animating');
    assert.deepEqual(after.cost, before.cost, 'steady frames only update existing phase uniforms and draw');
    const visible = await f.p.evaluate(() => loaderTest.frames.filter(frame => frame.head > .025));
    assert.ok(visible.length > 2, 'the startup sampler observed the face entering');
    assert.equal(visible.some(frame => frame.source > .025 || frame.canvas < frame.head - .01), false, 'a visible GPU portrait never swaps from the static image or crossfades its canvas later');
    assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
});
test('a renderer that arrives after the static face is visible never pops into the showcase', async () => {
  const f = await fixture('', { holdCover: true, holdRenderer: true, trackExit: true, trackRenderer: true });
  try {
    await active(f.p);
    await f.p.waitForFunction(() => { const portrait = document.getElementById('loader-portrait'); return portrait?.classList.contains('shown') && Number(getComputedStyle(portrait).opacity) > .999; });
    assert.equal(await f.p.locator('#loader-portrait').evaluate(el => el.classList.contains('ready')), false);
    f.renderer.done(); await f.p.waitForTimeout(550);
    assert.equal(await f.p.locator('#loader-portrait').evaluate(el => el.classList.contains('ready')), false, 'the chosen visible backend remains static for the visit');
    assert.equal(await f.p.evaluate(() => loaderTest.render.draws), 0, 'a late renderer does not begin unnecessary GPU work');
    assert.equal(await f.p.evaluate(() => loaderTest.frames.some(frame => frame.head > .025 && frame.canvas > .025)), false, 'there is no source-to-canvas brightness popup');
    f.cover.done(); await readable(f.p); assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
});
