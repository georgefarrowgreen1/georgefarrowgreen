// The real homepage in an isolated browser: guests have no header sign-in, while InFlite members keep their photo.
// Hop responses stand in for the existing server protocol (security is covered by unit/acctsec.test.mjs).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { chromium } = require('playwright');
const ROOT = resolve(__dirname, '../..'), HOME = 'https://gfg.test', AUTH = 'https://auth.inflite.test';
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] }); });
after(async () => browser?.close());
for (const assets of ['', 'min/']) {
  for (const state of [
    { name: 'guest' },
    { name: 'directly rendered guest', direct: true },
    { name: 'home member', home: true },
    { name: 'InFlite member', inflite: true },
    { name: 'owner returning from account', home: true, owner: true, hash: '#signedin' },
    { name: 'cookies unavailable', inflite: true, blocked: true },
    { name: 'account service unavailable', error: true },
  ]) {
    test(`${assets || 'source/'}${state.name}: no Sign in button, profile only for a recognised member`, async () => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      let hops = 0, documents = 0, signed = !!state.home;
      if (state.inflite) await ctx.addCookies([{ name: 'ifl_session', value: 'member', domain: '.inflite.test', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }]);
      await ctx.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url()), path = url.pathname;
        // A document navigation keeps each mocked hop interceptable (browser-managed 302 follow-ups bypass routes).
        const redirect = to => route.fulfill({ contentType: 'text/html', body: `<script>location.replace(${JSON.stringify(to)})</script>` });
        if (url.origin === AUTH && path === '/api/hop/issue') {
          assert.match(request.headers().cookie || '', /ifl_session=member/);
          return redirect(`${HOME}/api/hop/finish?to=${encodeURIComponent(url.searchParams.get('to'))}`);
        }
        if (url.origin !== HOME) return route.fulfill({ status: 404, body: '' });
        if (path === '/api/hop/start') {
          hops++;
          const to = url.searchParams.get('to');
          assert.equal(new URL(to).origin, HOME);
          return state.inflite ? redirect(`${AUTH}/api/hop/issue?to=${encodeURIComponent(to)}`) : redirect(to);
        }
        if (path === '/api/hop/finish') { signed = !state.blocked; return redirect(url.searchParams.get('to')); }
        if (path === '/') {
          if (!signed && !state.direct && url.searchParams.get('__ifl_account') !== 'checked') {
            const to = new URL(url); to.searchParams.set('__ifl_account', 'checked');
            return redirect(`${HOME}/api/hop/start?to=${encodeURIComponent(to.href)}`);
          }
          documents++;
          return route.fulfill({ contentType: 'text/html', body: readFileSync(resolve(ROOT, 'index.html'), 'utf8').replace('<html lang="en-GB">', '<html lang="en-GB" data-words>') });
        }
        if (path === '/api/me') return route.fulfill({ status: state.error ? 503 : 200, json: state.error ? { error: 'Unavailable' } : {
          signedIn: signed, account: 'https://account.inflite.test', auth: AUTH, owner: signed && !!state.owner,
          ...(signed ? { name: 'Sam Rider', email: 'sam@example.test', photoAt: 123, apps: {} } : {}),
        } });
        if (path === '/api/background') return route.fulfill({ json: { images: [] } });
        if (path === '/api/me/photo' || path.startsWith('/apps/')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"><rect width="56" height="56" fill="#3377cc"/></svg>' });
        if (['/styles.css', '/app.js', '/signedin.js'].includes(path) || path.startsWith('/fonts/') || path === '/inflite.svg') {
          const file = (['/styles.css', '/app.js'].includes(path) ? assets : '') + path.slice(1);
          return route.fulfill({ contentType: path.endsWith('.css') ? 'text/css' : path.endsWith('.js') ? 'text/javascript' : path.endsWith('.svg') ? 'image/svg+xml' : 'font/woff2', body: readFileSync(resolve(ROOT, file)) });
        }
        return route.fulfill({ status: 404, body: '' });
      });
      const p = await ctx.newPage(), errors = [];
      p.on('pageerror', e => { errors.push(e.message); console.error('PAGE ERROR',e.message); });
      try {
        await p.goto(`${HOME}/?keep=ride${state.hash || ''}`);
        await p.locator('body.known').waitFor();
        const member = !!state.home || (!!state.inflite && !state.blocked);
        assert.equal(await p.locator('#sign-in').count(), 0);
        assert.equal(await p.getByRole('link', { name: 'Sign in', exact: true }).count(), 0);
        assert.equal(await p.locator('#who').isVisible(), member);
        if (member) {
          await p.locator('#me').waitFor({ state: 'visible' });
          await p.waitForFunction(() => { const i = document.querySelector('#face img'); return i?.complete && i.naturalWidth > 0; });
          assert.equal(await p.locator('#me').getAttribute('aria-label'), 'Your account (Sam Rider)');
          assert.equal(await p.locator('#me').getAttribute('href'), 'https://account.inflite.test/#from=home');
          assert.equal(await p.locator('#edit').isVisible(), !!state.owner);
        } else assert.equal(await p.locator('#me').isVisible(), false);
        assert.equal(documents, 1, 'account lookup never navigates away from a rendered homepage');
        assert.equal(hops, state.home || state.direct ? 0 : 1, 'one quiet hand-off for an unrecognised visitor; never a loop');
        assert.equal(new URL(p.url()).search, '?keep=ride', 'temporary marker removed, other query parameters preserved');
        await p.waitForTimeout(state.hash ? 1200 : 100);
        assert.deepEqual(errors, []);
      } finally { await ctx.close(); }
    });
  }
}

// Load the actual gallery before releasing the main script. The opening should animate
// the existing panels and leave their layout and keyboard controls intact.
for (const assets of ['', 'min/']) {
  for (const width of [320, 390, 1440]) {
    test(`${assets || 'source/'}photographic opening and static gallery at ${width}px`, async () => {
      const reduced = width === 320;
      const ctx = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
      const gate = Promise.withResolvers();
      await ctx.route('https://startup.test/**', async route => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/api/me') return route.fulfill({ json: { signedIn: false } });
        if (path === '/api/content') return route.fulfill({ json: {} });
        if (path === '/app.js') await gate.promise;
        const file = resolve(ROOT, path === '/' ? 'index.html'
          : (['/loader.js', '/app.js', '/styles.css'].includes(path) ? assets : '') + path.slice(1));
        if (!existsSync(file)) return route.fulfill({ status: 404, body: '' });
        const mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' };
        return route.fulfill({ contentType: mime[file.split('.').pop()] || 'application/octet-stream', body: readFileSync(file) });
      });
      const page = await ctx.newPage();
      page.setDefaultTimeout(5000);
      try {
        await page.goto('https://startup.test/', { waitUntil: 'commit' });
        await page.waitForFunction(() => {
          const images = [...document.querySelectorAll('.fi-reel img')];
          return images.length === 3 && images.every(img => img.complete && img.naturalWidth);
        });
        const geometry = () => page.locator('.fi-reel').boundingBox();
        const before = await geometry();
        gate.resolve();
        await page.locator('body.known').waitFor();
        const controls = page.getByText(/^(Skip|Replay) opening$/);
        assert.equal(await controls.count(), 0);
        const mark = page.locator('.opening-mark');
        if (reduced) {
          assert.equal(await mark.count(), 0);
        } else {
          await mark.waitFor({ state: 'attached' });
          assert.deepEqual(await mark.locator('path').evaluateAll(paths => paths.map(p => p.getAttribute('d'))),
            await page.locator('header .wordmark path').evaluateAll(paths => paths.map(p => p.getAttribute('d'))));
          assert.equal(await mark.locator('.opening-strokes i').count(), 3);
          const properties = await page.locator('.fi-reel button, .fi-window, .opening-mark > svg').evaluateAll(elements =>
            elements.flatMap(el => el.getAnimations().flatMap(a => Object.keys(a.effect.getKeyframes()[0]))));
          assert.ok(properties.includes('transform'));
          assert.ok(properties.every(key => ['offset', 'computedOffset', 'easing', 'composite', 'opacity', 'transform'].includes(key)));
          if (width === 1440) {
            await page.keyboard.press('Escape');
          } else {
            // A phone's toolbar resizing the viewport height leaves the gallery geometry intact.
            await page.setViewportSize({ width, height: 780 });
            assert.equal(await mark.count(), 1);
          }
          await mark.waitFor({ state: 'detached' });
        }
        assert.equal(await controls.count(), 0);
        const after = await geometry();
        for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(before[key] - after[key]) <= 1, key);
        const rider = page.locator('[data-scene="1"]');
        await rider.focus();
        await page.keyboard.press('Enter');
        assert.equal(await rider.getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator('.fi-reel [aria-pressed="true"]').count(), 1);
      } finally { gate.resolve(); await ctx.close(); }
    });
  }
}
