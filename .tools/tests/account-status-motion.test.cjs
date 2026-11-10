// Production Auth/Status UI with deterministic API fixtures. No live account calls.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync, mkdirSync } = require('node:fs');
const { resolve, extname } = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium, webkit } = require('playwright');
const ROOT = resolve(__dirname, '../..');
const OUT = process.env.AUTH_STATUS_MOTION_PREVIEWS || '/tmp/inflite-motion-20261110/auth-status';
const engine = process.env.AUTH_STATUS_BROWSER === 'webkit' ? 'webkit' : 'chromium';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
let browser, accountHost;
before(async () => {
  mkdirSync(OUT, { recursive: true });
  ({ accountHost } = await import(pathToFileURL(ROOT + '/functions/_acctapp.js')));
  browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', args: ['--no-sandbox'] });
});
after(async () => browser?.close());
const assetStore = { async fetch(req) {
  const p = new URL(req.url).pathname, file = resolve(ROOT, '.' + (p.endsWith('/') ? p + 'index.html' : p));
  return file.startsWith(ROOT + '/') && existsSync(file)
    ? new Response(readFileSync(file), { headers: { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' } })
    : new Response('not found', { status: 404 });
} };
async function context(width, reducedMotion, name) {
  return browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 600, hasTouch: width < 600,
    colorScheme: width < 600 ? 'light' : 'dark', reducedMotion, serviceWorkers: 'block',
    ...(process.env.AUTH_STATUS_RECORD_VIDEO === '1' && width === 390 && reducedMotion === 'no-preference' && engine === 'chromium'
      ? { recordVideo: { dir: OUT + '/' + name, size: { width: 390, height: 900 } } } : {}),
  });
}
async function authFixture(width, reducedMotion) {
  const ctx = await context(width, reducedMotion, 'auth-video');
  await ctx.addInitScript(() => {
    if (!window.PublicKeyCredential) Object.defineProperty(window, 'PublicKeyCredential', { value: class {}, configurable: true });
    PublicKeyCredential.isConditionalMediationAvailable = async () => false;
    if (!navigator.credentials) Object.defineProperty(navigator, 'credentials', { value: {}, configurable: true });
    navigator.credentials.get = async () => { throw new DOMException('Cancelled', 'NotAllowedError'); };
  });
  let completeReset;
  const reset = new Promise(resolve => { completeReset = resolve; });
  await ctx.route('**/*', async route => {
    const req = route.request(), u = new URL(req.url());
    if (u.origin !== 'https://auth.inflite.ai') return route.abort();
    if (u.pathname.startsWith('/api/')) {
      const path = u.pathname.replace('/api/account/', '');
      if (path === 'reset/request') { await reset; return route.fulfill({ json: { message: 'If there’s an account for that email, a reset link is on its way.' } }); }
      const status = path.includes('options') ? 503 : 200;
      const data = path === 'me' ? { signedIn: false } : path === 'join' ? { open: false, ok: false }
        : path === 'signin/qr' ? { code: 'q'.repeat(32), poll: 'p'.repeat(43), ttl: 120000 }
        : path === 'signin/qr/wait' ? { state: 'waiting' } : { error: 'The test sign-in service is unavailable.' };
      return route.fulfill({ status, json: data });
    }
    if (u.pathname === '/signin.js') return route.fulfill({ contentType: 'text/javascript', body: readFileSync(ROOT + '/account/app.js') });
    if (u.pathname === '/styles.css') return route.fulfill({ contentType: 'text/css', body: readFileSync(ROOT + '/account/styles.css') });
    const response = await accountHost({ request: new Request(u.href), env: { ASSETS: assetStore }, next: () => new Response('not found', { status: 404 }) }, u);
    return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
  const p = await ctx.newPage(), errors = []; p.setDefaultTimeout(10000); p.on('pageerror', e => errors.push(e.message));
  await p.goto('https://auth.inflite.ai/#signin=weather&ask=' + 'a'.repeat(43) + '&back=' + encodeURIComponent('https://weather.inflite.ai/'));
  await p.locator('.auth-panel[data-auth-state="signin"]').waitFor();
  return { ctx, p, errors, completeReset };
}
for (const width of [390, 1440]) for (const reducedMotion of ['no-preference', 'reduce']) {
  test(`auth method drafts, feedback, busy state and recovery remain usable ${width}/${reducedMotion}`, async () => {
    const f = await authFixture(width, reducedMotion), { p } = f;
    try {
      const choice = p.getByRole('button', { name: 'Use your password', exact: true });
      await choice.click();
      await p.locator('input[name="email"]').fill('alex@example.com');
      await p.locator('input[name="password"]').fill('Sample draft stays here');
      await p.getByRole('button', { name: 'Use your passkey instead', exact: true }).click();
      await p.getByRole('button', { name: 'Sign in with a passkey', exact: true }).click();
      await p.locator('.signin-feedback.bad').waitFor();
      assert.equal(await p.locator('.signin-feedback').evaluate(el => getComputedStyle(el).opacity), '1', 'feedback remains readable while it moves');
      if (reducedMotion === 'reduce') assert.equal(await p.locator('.signin-feedback').evaluate(el => el.getAnimations().some(a => a.id === 'account-feedback')), false);
      await choice.click();
      assert.equal(await p.locator('input[name="email"]').inputValue(), 'alex@example.com');
      assert.equal(await p.locator('input[name="password"]').inputValue(), 'Sample draft stays here');
      assert.equal(await p.locator('input[name="email"]').evaluate(el => document.activeElement === el), true);
      if (reducedMotion === 'no-preference') {
        await p.waitForFunction(() => !document.querySelector('.signin').getAnimations({ subtree: true }).some(a => a.playState === 'running' && a.effect.getTiming().iterations !== Infinity));
        await p.screenshot({ path: `${OUT}/auth-password-${engine}-${width}.png`, fullPage: true });
      }
      await p.getByRole('button', { name: 'Forgot password?', exact: true }).click();
      await p.locator('.auth-panel[data-auth-state="forgot"]').waitFor();
      await p.locator('input[name="email"]').fill('alex@example.com');
      const send = p.getByRole('button', { name: 'Email me a link', exact: true }); await send.click();
      const busy = p.locator('.auth-panel button[aria-busy="true"]'); await busy.waitFor();
      assert.equal(await busy.isDisabled(), true);
      assert.equal(await busy.evaluate(el => getComputedStyle(el).opacity), '1');
      await p.evaluate(() => document.documentElement.setAttribute('data-motion-paused', ''));
      assert.equal(await busy.locator('.spin').evaluate(el => getComputedStyle(el).animationPlayState), 'paused');
      await p.evaluate(() => document.documentElement.removeAttribute('data-motion-paused'));
      if (reducedMotion === 'reduce') assert.equal(await busy.locator('.spin').evaluate(el => getComputedStyle(el).animationName), 'none');
      f.completeReset();
      await p.locator('.auth-panel[data-auth-state="email-sent"]').waitFor();
      assert.equal(await p.locator('.auth-panel [aria-busy="true"]').count(), 0);
      const back = p.getByRole('button', { name: 'Back to sign in', exact: true });
      assert.equal(await back.evaluate(el => document.activeElement === el), true);
      await p.waitForFunction(() => getComputedStyle(document.querySelector('.auth-panel')).opacity === '1');
      assert.equal(await p.locator('.signin-brand').count(), 1);
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      assert.deepEqual(f.errors, []);
      if (reducedMotion === 'no-preference') await p.screenshot({ path: `${OUT}/auth-${engine}-${width}.png`, fullPage: true });
    } finally { f.completeReset(); await f.ctx.close(); }
  });
}

for (const width of [390, 1440]) {
  test(`auth field feedback remains available and retires without losing hints ${width}`, async () => {
    const f = await authFixture(width, 'reduce'), { p } = f;
    try {
      await f.ctx.route('**/api/account/signin/salt', route => route.fulfill({ status: 503, json: { error: 'Try signing in again in a moment.' } }));
      await p.getByRole('button', { name: 'Use your password', exact: true }).click();
      await p.locator('input[name="email"]').fill('alex@example.com');
      const password = p.locator('input[name="password"]'); await password.fill('This draft stays');
      await p.getByRole('button', { name: 'Sign in', exact: true }).click();
      await p.locator('.signin-feedback.bad').waitFor();
      const passwordFeedback = await p.locator('.signin-feedback').getAttribute('id');
      assert.equal(await password.getAttribute('aria-describedby'), passwordFeedback);
      assert.equal(await password.evaluate(el => el === document.activeElement), true);
      assert.equal(await password.getAttribute('aria-invalid'), null, 'a service error does not claim the password is invalid');
      await p.getByRole('button', { name: 'Use your passkey instead', exact: true }).click();
      assert.equal(await password.getAttribute('aria-describedby'), null, 'retiring a sign-in method also retires its feedback');
      await p.getByRole('button', { name: 'Use your password', exact: true }).click();
      assert.equal(await password.inputValue(), 'This draft stays');
      await p.getByRole('button', { name: 'Forgot password?', exact: true }).click();
      const email = p.locator('input[name="email"]');
      await email.evaluate(el => {
        const hint = document.createElement('p'); hint.id = 'existing-email-hint'; hint.textContent = 'Use the email your account uses.';
        el.closest('.field').append(hint); el.setAttribute('aria-describedby', hint.id);
      });
      await email.fill('x@y');
      const send = p.getByRole('button', { name: 'Email me a link', exact: true }); await send.click();
      await p.locator('.said.bad').waitFor();
      const feedback = await p.locator('.said.bad').getAttribute('id');
      assert.deepEqual((await email.getAttribute('aria-describedby')).split(' '), ['existing-email-hint', feedback]);
      assert.equal(await email.evaluate(el => el === document.activeElement), true);
      await email.fill('alex@example.com');
      assert.equal(await email.getAttribute('aria-describedby'), 'existing-email-hint', 'editing retires only the stale feedback');
      await send.click(); f.completeReset();
      await p.locator('.auth-panel[data-auth-state="email-sent"]').waitFor();
      await p.getByRole('button', { name: 'Change email address', exact: true }).click();
      assert.equal(await email.getAttribute('aria-describedby'), 'existing-email-hint');
      assert.equal(await email.inputValue(), 'alex@example.com');
      assert.deepEqual(f.errors, []);
    } finally { f.completeReset(); await f.ctx.close(); }
  });
}

for (const width of [390, 1440]) test(`Account/Auth forced colors keeps native and compound field focus visible ${width}`, async () => {
  const f = await authFixture(width, 'reduce'), { p } = f;
  try {
    await p.emulateMedia({ forcedColors: 'active' });
    await p.getByRole('button', { name: 'Use your password', exact: true }).click();
    await p.locator('input[name="email"]').fill('alex@example.com');
    await p.locator('input[name="password"]').fill('Retained password draft');
    const focused = el => {
      const s = getComputedStyle(el);
      return { outline: s.outlineStyle, width: s.outlineWidth, offset: s.outlineOffset, shadow: s.boxShadow, radius: parseFloat(s.borderRadius) };
    };
    const visible = async locator => {
      await locator.focus(); const proof = await locator.evaluate(focused);
      assert.equal(proof.shadow, 'none', 'forced colors removes the shadow used in normal themes');
      assert.equal(proof.outline, 'solid'); assert.equal(proof.width, '2px'); assert.equal(proof.offset, '-2px');
      assert.ok(proof.radius > 0, 'the fallback follows the rounded field');
    };
    await visible(p.locator('input[name="email"]')); await visible(p.locator('input[name="password"]'));
    // Actual settings classes, mounted without a real account or settings API.
    await p.locator('.auth-content').evaluate(el => {
      const box = document.createElement('div'); box.id = 'hcSettings';
      box.innerHTML = '<label class="field">Name<input id="hcName" value="Sample name"></label><label class="field">Notes<textarea id="hcNotes">Sample note</textarea></label><label class="field">Units<select id="hcUnits"><option>Metric</option></select></label><textarea class="dk-text" id="hcDiagnostic">Diagnostic draft</textarea><input class="qrtype" id="hcCode" value="12"><label class="field">Handle<span class="at">@<input id="hcHandle" value="alex"></span></label><label class="nav-search"><input id="hcSearch" value="Settings"></label>';
      el.append(box);
    });
    for (const id of ['hcName', 'hcNotes', 'hcUnits', 'hcDiagnostic', 'hcCode']) await visible(p.locator('#' + id));
    for (const [id, wrapper] of [['hcHandle', '.at'], ...(width >= 1100 ? [['hcSearch', '.nav-search']] : [])]) {
      const input = p.locator('#' + id); await input.focus();
      assert.equal((await input.evaluate(focused)).outline, 'none', 'compound input does not draw a second ring');
      const proof = await input.evaluate((el, wrapper) => {
        const s = getComputedStyle(el.closest(wrapper));
        return { outline: s.outlineStyle, width: s.outlineWidth, offset: s.outlineOffset, shadow: s.boxShadow, radius: parseFloat(s.borderRadius) };
      }, wrapper);
      assert.equal(proof.outline, 'solid'); assert.equal(proof.width, '2px'); assert.equal(proof.offset, '-2px');
      assert.equal(proof.shadow, 'none'); assert.ok(proof.radius > 0);
    }
    assert.equal(await p.locator('input[name="email"]').inputValue(), 'alex@example.com');
    assert.equal(await p.locator('input[name="password"]').inputValue(), 'Retained password draft');
    assert.deepEqual(f.errors, []);
  } finally { f.completeReset(); await f.ctx.close(); }
});

test('Status reopening the same day ignores an older hours response', async () => {
  const ctx = await context(390, 'reduce', 'status-reopen'), p = await ctx.newPage(), data = statusData(), errors = [];
  p.on('pageerror', e => errors.push(e.message));
  let releaseOld, requests = 0;
  const old = new Promise(resolve => { releaseOld = resolve; });
  await ctx.route('https://status.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/status') return route.fulfill({ json: data });
    if (path === '/api/status/day') return route.fulfill({ json: { points: [] } });
    if (path === '/api/status/hours') {
      const first = ++requests === 1; if (first) await old;
      return route.fulfill({ json: { kept: true, ms: first ? 999 : 22, q: Array(96).fill(first ? 'down' : 'ok') } });
    }
    if (path.startsWith('/api/')) return route.fulfill({ json: { found: false } });
    const file = ROOT + '/status/' + (path === '/' ? 'index.html' : path.slice(1));
    return existsSync(file) ? route.fulfill({ body: readFileSync(file), contentType: MIME[extname(file)] || 'application/octet-stream' }) : route.fulfill({ status: 404, body: '' });
  });
  try {
    await p.goto('https://status.test/'); await p.locator('.arow').first().waitFor();
    const day = p.locator('#apps .days button').last(), firstRequest = p.waitForRequest(r => new URL(r.url()).pathname === '/api/status/hours');
    await day.click(); await firstRequest;
    await p.getByRole('button', { name: 'Done', exact: true }).click(); await day.click();
    await p.waitForFunction(() => document.querySelector('#dayMs')?.textContent === '22 ms');
    const stale = p.waitForResponse(r => new URL(r.url()).pathname === '/api/status/hours'); releaseOld();
    await (await stale).finished(); await p.evaluate(() => new Promise(requestAnimationFrame));
    assert.equal(requests, 2);
    assert.equal(await p.locator('#dayMs').textContent(), '22 ms');
    assert.equal(await p.locator('#hours i[data-s="down"]').count(), 0);
    assert.equal(await p.locator('#sheet').getAttribute('aria-hidden'), 'false');
    await p.getByRole('button', { name: 'Done', exact: true }).click();
    assert.equal(await p.locator('#sheet').evaluate(el => el.inert), true);
    assert.deepEqual(errors, []);
  } finally { releaseOld(); await ctx.close(); }
});

function statusData() {
  const now = Date.now(), dayKeys = Array.from({ length: 90 }, (_, i) => new Date(now - (89 - i) * 864e5).toISOString().slice(0, 10));
  const ids = ['today', 'chat', 'weather', 'fitness', 'markets', 'mail', 'auth', 'account', 'home'];
  return { at: now, since: dayKeys[0], dayKeys,
    services: ids.map((id, i) => ({ id, name: ['Today', 'Chats', 'Weather', 'Fitness', 'Markets', 'Mail', 'Sign in', 'Account', 'Home'][i],
      group: i < 6 ? 'apps' : i < 8 ? 'account' : 'home', s: id === 'weather' ? 'down' : 'ok', address: `${id}.inflite.ai`,
      days: dayKeys.map(() => ({ s: 'ok', n: 288, down: 0, slow: 0, up: 100 })), checks: [{ k: 'Answers', s: 'ok', ms: 80 }] })),
    jobs: [{ id: 'wxtick', name: 'Weather alerts', s: 'ok', at: now, ms: 100 }],
    deps: [{ id: 'dep-weather', name: 'Weather provider', s: 'ok', ms: 80 }],
    incidents: [{ id: 'weather-resolved', title: 'Weather alerts recovered', svcs: ['weather'], started: now - 3600e3, ended: now - 1800e3,
      updates: [{ at: now - 1800e3, k: 'Resolved', w: 'Alerts are being delivered normally.' }] }], bugs: [], maint: [],
  };
}
for (const width of [390, 1440]) for (const reducedMotion of ['no-preference', 'reduce']) {
  test(`Status details preserve focus and close immediately to input ${width}/${reducedMotion}`, async () => {
    const ctx = await context(width, reducedMotion, 'status-video'), data = statusData();
    const p = await ctx.newPage(), errors = []; p.setDefaultTimeout(10000); p.on('pageerror', e => errors.push(e.message));
    await ctx.route('https://status.test/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/status') return route.fulfill({ json: data });
      if (path === '/api/status/day') return route.fulfill({ json: { points: [] } });
      if (path === '/api/status/hours') return route.fulfill({ json: { kept: true, ms: 87, q: Array(96).fill('ok') } });
      if (path.startsWith('/api/')) return route.fulfill({ json: { found: false } });
      const file = ROOT + '/status/' + (path === '/' ? 'index.html' : path.slice(1));
      return existsSync(file) ? route.fulfill({ body: readFileSync(file), contentType: MIME[extname(file)] || 'application/octet-stream' }) : route.fulfill({ status: 404, body: '' });
    });
    try {
      await p.goto('https://status.test/'); await p.locator('.arow').first().waitFor();
      const toggle = p.locator('.operation-toggle').first();
      await toggle.focus(); await p.keyboard.press('Enter');
      assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
      assert.equal(await toggle.evaluate(el => document.activeElement === el), true);
      await p.locator('.incident-detail > summary').click();
      assert.equal(await p.locator('.incident-detail').getAttribute('open'), '');
      await p.locator('#apps .days button').last().click();
      const sheet = p.locator('#sheet'); await sheet.waitFor({ state: 'visible' });
      assert.equal(await p.locator('.wrap').evaluate(el => el.inert), true);
      assert.equal(await sheet.evaluate(el => el.contains(document.activeElement)), true);
      await p.locator('#hours .q').waitFor();
      if (reducedMotion === 'no-preference') {
        await p.evaluate(() => document.documentElement.setAttribute('data-motion-paused', ''));
        assert.equal(await p.locator('#verdict .halo b').evaluate(el => getComputedStyle(el).animationPlayState), 'paused');
        await p.evaluate(() => document.documentElement.removeAttribute('data-motion-paused'));
        await p.waitForFunction(() => Math.abs(document.querySelector('#sheet').getBoundingClientRect().bottom - innerHeight) < 1);
        await p.screenshot({ path: `${OUT}/status-${engine}-${width}.png`, fullPage: false });
      }
      await p.getByRole('button', { name: 'Done', exact: true }).click();
      assert.equal(await sheet.evaluate(el => el.inert), true, 'closing content stops taking input before its exit finishes');
      assert.equal(await p.locator('.wrap').evaluate(el => el.inert), false);
      assert.equal(await p.evaluate(() => document.activeElement?.matches('.days button') || document.activeElement?.id === 'verdict'), true);
      await p.waitForFunction(() => getComputedStyle(document.querySelector('#sheet')).visibility === 'hidden');
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  });
}
