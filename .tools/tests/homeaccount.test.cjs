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
    { name: 'legacy preview guest', clientFallback: true },
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
          if (!signed && !state.clientFallback && url.searchParams.get('__ifl_account') !== 'checked') {
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
        assert.equal(documents, state.clientFallback ? 2 : 1, 'the homepage is only rendered after the server hand-off');
        assert.equal(hops, state.home ? 0 : 1, 'one quiet hand-off for an unrecognised visitor; never a loop');
        assert.equal(new URL(p.url()).search, '?keep=ride', 'temporary marker removed, other query parameters preserved');
        await p.waitForTimeout(state.hash ? 1200 : 100);
        assert.deepEqual(errors, []);
      } finally { await ctx.close(); }
    });
  }
}

// Hold the main script and slideshow metadata independently. The cover and the final card geometry must already
// be present before enhancement, and the same image node must survive metadata arriving later.
for (const assets of ['', 'min/']) {
  for (const { width, listFails, rotate } of [{ width: 320 }, { width: 390 }, { width: 1440 }, { width: 390, listFails: true }, { width: 390, rotate: true }]) {
    test(`${assets || 'source/'}startup at ${width}px${listFails ? " with unavailable metadata" : rotate ? " with photo rotation" : ""} paints its cover and reserves card layout before scripts and metadata`, async () => {
      const ctx = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width <= 600, hasTouch: width <= 600, reducedMotion: 'reduce' });
      let scriptGo, listGo, covers = 0;
      const scriptGate = new Promise(r => { scriptGo = r; }), listGate = new Promise(r => { listGo = r; });
      await ctx.route('https://startup.test/**', async route => {
        const u = new URL(route.request().url()), path = u.pathname;
        if (path === '/') return route.fulfill({ contentType: 'text/html', body: readFileSync(resolve(ROOT, 'index.html'), 'utf8').replace('<html lang="en-GB">', '<html lang="en-GB" data-words>') });
        if (path === '/api/me') return route.fulfill({ json: { signedIn: true, name: 'Sam', apps: {} } });
        if (path === '/api/background' && !u.search) { await listGate; return route.fulfill({ status: listFails ? 503 : 200, json: listFails ? { error: 'Unavailable' } : { images: [{ id: 'first', focus: '50% 50%' }, ...(rotate ? [{ id: 'second', focus: '50% 50%' }] : [])] } }); }
        if (path === '/api/background' && u.searchParams.get('id') === 'cover' && route.request().resourceType() === 'image') covers++; // the softening fetch uses the browser cache in production
        if (path === '/api/background' || path.startsWith('/apps/')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#456"/></svg>' });
        if (['/styles.css', '/app.js', '/signedin.js', '/inflite.svg'].includes(path) || path.startsWith('/fonts/')) {
          if (path === '/app.js') await scriptGate;
          const file = (['/styles.css', '/app.js'].includes(path) ? assets : '') + path.slice(1);
          return route.fulfill({ contentType: path.endsWith('.css') ? 'text/css' : path.endsWith('.js') ? 'text/javascript' : path.endsWith('.svg') ? 'image/svg+xml' : 'font/woff2', body: readFileSync(resolve(ROOT, file)) });
        }
        return route.fulfill({ status: 404, body: '' });
      });
      const p = await ctx.newPage(), errors = []; p.on('pageerror', e => errors.push(e.message));
      try {
        await p.goto('https://startup.test/', { waitUntil: 'commit' });
        await p.waitForFunction(() => { const i = document.querySelector('#cover img'); return i?.complete && i.naturalWidth > 0 && getComputedStyle(i).opacity === '1' && getComputedStyle(i).position === 'absolute'; });
        await p.evaluate(() => document.fonts.ready);
        await p.evaluate(() => { window.startupCover = document.querySelector('#cover img'); });
        const geometry = () => p.evaluate(() => {
          const c = document.querySelector('#app-inflight').getBoundingClientRect(), next = document.querySelector('#touch-h').getBoundingClientRect();
          return { x: c.x, width: c.width, height: c.height, next: next.y };
        });
        const before = await geometry();
        scriptGo(); await p.locator('body.known').waitFor();
        assert.equal(await p.locator('#cover img').count(), 1, 'cover stays visible while the list is pending');
        const after = await geometry();
        for (const key of Object.keys(before)) assert.ok(Math.abs(before[key] - after[key]) <= 1, `${key} does not jump on enhancement: ${before[key]} → ${after[key]}`);
        const listed = p.waitForResponse(r => new URL(r.url()).pathname === '/api/background' && !new URL(r.url()).search);
        listGo(); await listed;
        if (listFails) { await p.waitForTimeout(100); assert.equal(await p.locator('#cover img').count(), 1); }
        else {
          await p.locator('#cover.managed').waitFor();
          assert.equal(await p.evaluate(() => document.querySelector('#cover img') === window.startupCover), true, 'the exact cover image is adopted without reparenting');
        }
        assert.equal(await p.evaluate(() => window.startupCover.isConnected && window.startupCover.naturalWidth > 0 && getComputedStyle(window.startupCover).opacity === '1'), true);
        assert.equal(covers, 1, 'the preloaded cover image is requested only once');
        if (rotate) {
          await p.emulateMedia({ reducedMotion: 'no-preference' });
          await p.waitForFunction(() => document.querySelector('#bg .slide.on')?.dataset.id === 'second', null, { timeout: 10000 });
          await p.waitForTimeout(1800);
          assert.equal(await p.locator('#cover img').evaluate(e => getComputedStyle(e).opacity), '0', 'the adopted cover yields cleanly to the next photo');
          assert.equal(await p.locator('#bg > img').evaluate(e => getComputedStyle(e).opacity), '1');
        }
        assert.deepEqual(errors, []);
      } finally { scriptGo(); listGo(); await ctx.close(); }
    });
  }
}
