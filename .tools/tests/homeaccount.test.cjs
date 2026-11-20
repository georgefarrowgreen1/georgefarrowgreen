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
    { name: 'guest from InFlite', referred: true },
    { name: 'home member with a slow profile response', home: true, slow: true },
    { name: 'member from InFlite', inflite: true, referred: true },
    { name: 'owner returning from account', home: true, owner: true, hash: '#signedin' },
    { name: 'cookies unavailable on return from InFlite', inflite: true, referred: true, blocked: true },
    { name: 'account service unavailable', error: true },
  ]) {
    test(`${assets || 'source/'}${state.name}: no Sign in button, profile only for a recognised member`, async () => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      let hops = 0, documents = 0, signed = !!state.home;
      const profile = Promise.withResolvers();
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
          if (!signed && request.headers().referer === 'https://inflite.test/' && url.searchParams.get('__ifl_account') !== 'checked') {
            const to = new URL(url); to.searchParams.set('__ifl_account', 'checked');
            return redirect(`${HOME}/api/hop/start?to=${encodeURIComponent(to.href)}`);
          }
          documents++;
          return route.fulfill({ contentType: 'text/html', body: readFileSync(resolve(ROOT, 'index.html'), 'utf8').replace('<html lang="en-GB">', '<html lang="en-GB" data-words>') });
        }
        if (path === '/api/me') {
          if (state.slow) await profile.promise;
          return route.fulfill({ status: state.error ? 503 : 200, json: state.error ? { error: 'Unavailable' } : {
            signedIn: signed, account: 'https://account.inflite.test', auth: AUTH, owner: signed && !!state.owner,
            ...(signed ? { name: 'Sam Rider', email: 'sam@example.test', photoAt: 123, apps: {} } : {}),
          } });
        }
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
        await p.goto(`${HOME}/?keep=ride${state.hash || ''}`, state.referred ? { referer: 'https://inflite.test/' } : {});
        if (state.slow) {
          assert.equal(await p.locator('#fi-photos').isVisible(), true);
          assert.equal(await p.locator('body.known').count(), 0);
          profile.resolve();
        }
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
        assert.equal(hops, !state.home && state.referred ? 1 : 0, 'only the visit from InFlite uses the account handoff');
        assert.equal(new URL(p.url()).search, '?keep=ride', 'temporary marker removed, other query parameters preserved');
        await p.waitForTimeout(state.hash ? 1200 : 100);
        assert.deepEqual(errors, []);
      } finally { profile.resolve(); await ctx.close(); }
    });
  }
}

// Load the actual gallery before releasing the main script. The opening should animate
// the existing panels and leave their layout and keyboard controls intact.
for (const assets of ['', 'min/']) {
  for (const width of [320, 390, 1440]) {
    test(`${assets || 'source/'}photographic opening and static gallery at ${width}px`, async () => {
      const reduced = width === 320;
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 650 : 844 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
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
        const chrome = page.locator('#bar, .fi-bio, #projects, #apps, #get-in-touch');
        const painted = nodes => nodes.filter(el => el.checkVisibility({opacityProperty:true, visibilityProperty:true}))
          .map(el => el.id || el.className);
        if (!reduced) assert.deepEqual(await chrome.evaluateAll(painted), [], 'nothing behind the pending opening can paint');
        gate.resolve();
        await page.locator('body.known').waitFor();
        const controls = page.getByText(/^(Skip|Replay) opening$/);
        assert.equal(await controls.count(), 0);
        const mark = page.locator('.opening-mark');
        if (reduced) {
          assert.equal(await mark.count(), 0);
        } else {
          await mark.waitFor({ state: 'attached' });
          if (width === 390) {
            // Safari's toolbar can uncover content beyond the original viewport.
            const height = await page.locator('#apps h2').evaluate(el => Math.ceil(el.getBoundingClientRect().bottom) + 40);
            await page.setViewportSize({width, height});
          }
          assert.deepEqual(await chrome.evaluateAll(painted), [], 'only the opening is visible, including beyond the initial fold');
          const leaked = await chrome.evaluateAll(nodes => {
            const tracks = document.getAnimations();
            const times = tracks.map(a => a.currentTime);
            const landed = Math.max(...document.querySelector('.fi-reel button').getAnimations().map(a => a.effect.getComputedTiming().endTime));
            const visible = [];
            for (const fraction of [.3, .82, .99]) {
              tracks.forEach(a => { a.currentTime = landed * fraction; });
              for (const el of nodes) {
                if (el.checkVisibility({opacityProperty:true, visibilityProperty:true})) visible.push(el.id || el.className);
              }
            }
            tracks.forEach((a, i) => { a.currentTime = times[i]; });
            return visible;
          });
          assert.deepEqual(leaked, [], 'page content waits until the photographs land');
          await page.evaluate(() => window.dispatchEvent(new Event('scroll')));
          assert.deepEqual(await mark.locator('path').evaluateAll(paths => paths.map(p => p.getAttribute('d'))),
            await page.locator('header .wordmark path').evaluateAll(paths => paths.map(p => p.getAttribute('d'))));
          assert.equal(await mark.locator('.opening-corner').count(), 12);
          const properties = await page.locator('.fi-reel button, .fi-window, .opening-corner, .opening-mark *').evaluateAll(elements =>
            elements.flatMap(el => el.getAnimations().flatMap(a => Object.keys(a.effect.getKeyframes()[0]))));
          assert.ok(properties.includes('transform'));
          assert.ok(properties.every(key => ['offset', 'computedOffset', 'easing', 'composite', 'opacity', 'transform'].includes(key)));
          // Seek the real compositor animations through the width reversal. The
          // glyph and photo must stay registered, and the photo must keep moving.
          const motion = await page.evaluate(async () => {
            const panels = [...document.querySelectorAll('.fi-reel button')];
            const corners = [...document.querySelectorAll('.opening-corner')];
            const letters = [...document.querySelectorAll('.opening-letter')];
            const animations = [...panels, ...corners, ...letters].flatMap(el => el.getAnimations({subtree: true}));
            const states = animations.map(a => ({time:a.currentTime, running:a.playState === 'running'}));
            for (const animation of animations) animation.pause();
            await Promise.all(animations.map(a => a.ready));
            const errors = [], heights = [];
            for (const time of [360, 520, 560, 600, 640, 680, 720, 1200, 1600, 1800]) {
              animations.forEach(a => { a.currentTime = time; });
              for (const [index, panel] of panels.entries()) {
                const outer = panel.getBoundingClientRect(), inner = panel.querySelector('.fi-window').getBoundingClientRect();
                const left = Math.max(outer.left, inner.left), right = Math.min(outer.right, inner.right);
                const top = Math.max(outer.top, inner.top), bottom = Math.min(outer.bottom, inner.bottom);
                if (time <= 640) {
                  const glyph = letters[index].getBoundingClientRect();
                  errors.push(glyph.left - left, glyph.right - right, glyph.top - top, glyph.bottom - bottom);
                }
                if (index === 0 && time >= 520 && time <= 720) heights.push(bottom - top);
                corners.slice(index * 4, index * 4 + 4).forEach((corner, i) => {
                  const tile = corner.getBoundingClientRect();
                  errors.push(i >= 2 ? tile.right - right : tile.left - left, i % 2 ? tile.bottom - bottom : tile.top - top);
                  if (time === 1800) errors.push(tile.width);
                });
              }
            }
            animations.forEach((a, i) => {
              a.currentTime = states[i].time;
              if (states[i].running) a.play();
            });
            return {errors, heights};
          });
          assert.ok(motion.errors.every(d => Math.abs(d) < .5), JSON.stringify(motion.errors));
          assert.ok(motion.heights.slice(1).every((h, i) => h > motion.heights[i] + 1), JSON.stringify(motion.heights));
          if (width === 1440) {
            await page.keyboard.press('Escape');
          } else {
            // A phone's toolbar resizing the viewport height leaves the gallery geometry intact.
            await page.setViewportSize({ width, height: 780 });
            assert.equal(await mark.count(), 1);
          }
          await mark.waitFor({ state: 'detached' });
          assert.equal(await page.locator('.opening-corner').count(), 0);
        }
        assert.equal((await chrome.evaluateAll(painted)).length, 5, 'the complete page is revealed');
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
