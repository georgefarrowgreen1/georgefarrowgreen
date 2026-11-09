// Render the production sign-in bundle with deterministic API answers; exercise layout and fallback controls.
import { chromium, webkit } from 'playwright';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const out = root + 'artifacts/signin'; mkdirSync(out, { recursive: true });
const engine = process.env.SIGNIN_BROWSER === 'webkit' ? 'webkit' : 'chromium';
const browser = await (engine === 'webkit' ? webkit.launch() : chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] }));
const errors = [];
const destination = 'https://auth.inflite.ai/#signin=weather&ask=' + 'a'.repeat(43) + '&back=' + encodeURIComponent('https://weather.inflite.ai/');
let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };
async function open({ width = 1440, height = 1000, mobile = false, last = null, colorScheme = 'dark', passkeys = true, cancel = false, reducedMotion = 'reduce', url = destination } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, colorScheme, reducedMotion });
  await ctx.addInitScript(({ last, passkeys }) => {
    globalThis.SIGNIN_PAGE = true;
    if (last) localStorage.setItem('acct:last', JSON.stringify(last));
    if (!passkeys) Object.defineProperty(window, 'PublicKeyCredential', { value: undefined });
    else {
      if (!window.PublicKeyCredential) Object.defineProperty(window, 'PublicKeyCredential', { value: class {}, configurable: true });
      PublicKeyCredential.isConditionalMediationAvailable = async () => false;
      if (!navigator.credentials) Object.defineProperty(navigator, 'credentials', { value: {}, configurable: true });
      navigator.credentials.get = async () => { throw new DOMException('Cancelled', 'NotAllowedError'); };
    }
  }, { last, passkeys });
  let qrCalls = 0;
  await ctx.route('**/*', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith('/api/')) {
      if (path === '/api/account/signin/qr') qrCalls++;
      const data = path.endsWith('/signin/options') && cancel ? { challenge: 'a'.repeat(43), rpId: 'inflite.ai' } : path.endsWith('/me') ? { signedIn: false } : path.endsWith('/join') ? { open: false, ok: false }
        : path.endsWith('/signin/qr') ? { code: 'a'.repeat(32), poll: 'b'.repeat(43), ttl: 120000 }
        : path.endsWith('/signin/qr/wait') ? { state: 'waiting' } : { error: 'Test service unavailable' };
      return route.fulfill({ status: path.includes('options') && !cancel ? 503 : 200, contentType: 'application/json', body: JSON.stringify(data) });
    }
    const shared = { '/apps/weather.png': 'weather/icon-180.png', '/qr.js': 'pigeon/qr.js' };
    let rel = shared[path] || (path === '/' ? 'account/index.html' : path === '/crypto.js' ? 'pigeon/crypto.js'
      : path === '/signin.js' ? 'min/account/signin.js' : existsSync(root + 'account' + path) ? 'account' + path : path.slice(1));
    if (!existsSync(root + rel)) return route.fulfill({ status: 404, body: '' });
    const type = rel.endsWith('.js') ? 'text/javascript' : rel.endsWith('.css') ? 'text/css' : rel.endsWith('.svg') ? 'image/svg+xml' : rel.endsWith('.png') ? 'image/png' : 'text/html';
    let body = readFileSync(root + rel);
    if (rel === 'account/index.html') body = Buffer.from(body.toString().replace('src="app.js"', 'src="signin.js"'));
    return route.fulfill({ contentType: type, body });
  });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(url);
  await p.waitForSelector('.signin-main .signin-panel, .signout-complete');
  await p.waitForTimeout(150);
  return { ctx, p, qrCalls: () => qrCalls };
}
async function layout(p, label) {
  const m = await p.evaluate(() => {
    const card = document.querySelector('.signin-panel').getBoundingClientRect();
    return { overflow: document.documentElement.scrollWidth > innerWidth, left: card.left, right: card.right, width: innerWidth,
      destination: document.querySelector('.signin-header .backapp')?.textContent.includes('Weather'),
      logo: document.querySelector('.signin-brand img').complete && document.querySelector('.signin-brand img').naturalWidth > 0,
      inputFont: document.querySelector('input:not(.vh)') && getComputedStyle(document.querySelector('input:not(.vh)')).fontSize };
  });
  ok(!m.overflow && m.left >= 0 && m.right <= m.width, label + ': no horizontal overflow');
  ok(m.logo, label + ': actual InFlite asset loaded');
  ok(m.destination, label + ': return app retained in header');
  if (m.inputFont) ok(parseFloat(m.inputFont) >= 16, label + ': readable input size');
}
try {
  for (const mobile of [false, true]) {
    const { ctx, p, qrCalls } = await open({ width: mobile ? 390 : 1440, height: mobile ? 844 : 1000, mobile });
    await layout(p, mobile ? 'mobile' : 'desktop');
    ok(await p.locator('h1').innerText() === 'Sign in to InFlite', 'first sign-in title');
    ok(await p.locator('.signin-destination').count() === 0, 'destination is named once in the header');
    ok(await p.getByLabel('Email', { exact: true }).isHidden(), 'first view keeps password form collapsed');
    ok(qrCalls() === 0, 'QR is not requested before choosing phone sign-in');
    if (engine === 'chromium') await p.screenshot({ path: `${out}/signin-${mobile ? 'mobile' : 'desktop'}.png`, fullPage: true, caret: 'initial' });
    await p.getByRole('button', { name: 'Use your password', exact: true }).click();
    ok(await p.getByLabel('Email', { exact: true }).evaluate(el => el === document.activeElement), 'password disclosure focuses email');
    await p.getByLabel('Email', { exact: true }).fill('george@example.com');
    await p.getByLabel('Password', { exact: true }).fill('example-password');
    await p.getByRole('button', { name: 'Show password', exact: true }).click();
    ok(await p.locator('input[name=password]').getAttribute('type') === 'text', 'show password works');
    await p.getByRole('button', { name: 'Hide password', exact: true }).click();
    await p.getByRole('button', { name: 'Use your passkey instead', exact: true }).click();
    ok(await p.getByRole('button', { name: 'Sign in with a passkey', exact: true }).evaluate(el => el === document.activeElement), 'collapsing password returns focus to passkey');
    await p.getByRole('button', { name: 'Use your password', exact: true }).click();
    ok(await p.getByLabel('Email', { exact: true }).inputValue() === 'george@example.com' && await p.getByLabel('Password', { exact: true }).inputValue() === 'example-password', 'switching methods preserves form entries');
    await p.getByLabel('Email', { exact: true }).fill('');
    await p.getByRole('button', { name: 'Sign in', exact: true }).click();
    ok((await p.locator('.said').innerText()).length > 0, 'empty sign-in displays a validation error');
    if (!mobile) {
      await p.getByRole('button', { name: 'Sign in with your phone', exact: true }).click();
      await p.waitForSelector('#qrc');
      ok(qrCalls() > 0 || await p.locator('#qrc').count() === 1, 'phone sign-in opens on request');
      await p.getByRole('button', { name: 'Use a password or passkey instead', exact: true }).click();
      await p.waitForSelector('.signin-panel input[name=email]', { state: 'attached' });
      ok(await p.locator('h1').innerText() === 'Sign in to InFlite', 'return from phone sign-in');
    } else ok(await p.locator('.signin-phone').count() === 0, 'mobile omits desktop phone action');
    if (await p.getByLabel('Password', { exact: true }).isHidden()) await p.getByRole('button', { name: 'Use your password', exact: true }).click();
    await p.getByRole('button', { name: 'Forgot password?', exact: true }).click();
    await p.waitForSelector('.welcome h1');
    ok((await p.locator('main').getAttribute('class') || '').includes('signin-main'), 'recovery shares the sign-in frame');
    ok(await p.locator('.auth-panel').getAttribute('data-auth-state') === 'forgot', 'recovery has a distinct state in the shared frame');
    ok((await p.locator('.signin-destination').innerText()).includes('Weather'), 'recovery retains the app destination');
    await p.getByRole('button', { name: 'Back to sign in', exact: true }).click();
    ok(await p.getByRole('button', { name: 'Sign in with a passkey', exact: true }).evaluate(el => el === document.activeElement), 'returning from recovery focuses the visible passkey control');
    await ctx.close();
  }
  const last = { name: 'George Green', handle: 'george', email: 'george@example.com', way: 'passkey', rp: 'inflite.ai', id: 'a'.repeat(43) };
  for (const mobile of [false, true]) {
    const { ctx, p } = await open({ width: mobile ? 390 : 1440, height: mobile ? 844 : 1000, mobile, last });
    await layout(p, 'returning ' + (mobile ? 'mobile' : 'desktop'));
    ok(await p.locator('h1').innerText() === 'Welcome back, George', 'remembered identity');
    ok(await p.locator('#signin-password').isHidden(), 'remembered passkey password stays hidden');
    if (engine === 'chromium') await p.screenshot({ path: `${out}/welcome-${mobile ? 'mobile' : 'desktop'}.png`, fullPage: true, caret: 'initial' });
    await p.getByRole('button', { name: 'Use your password', exact: true }).click();
    ok(await p.locator('#signin-password').isVisible(), 'password fallback reveals form');
    ok(await p.locator('input[name=password]').evaluate(el => el === document.activeElement), 'password fallback focuses input');
    await p.getByRole('button', { name: 'Use another account', exact: true }).click();
    await p.waitForSelector('input[name=email]', { state: 'attached' });
    ok(await p.evaluate(() => localStorage.getItem('acct:last')) === null, 'switching accounts forgets remembered account');
    await ctx.close();
  }
  for (const args of [{ width: 320, height: 568, mobile: true }, { colorScheme: 'light' }, { passkeys: false }]) {
    const { ctx, p } = await open(args); await layout(p, JSON.stringify(args));
    if (args.passkeys === false) {
      ok(await p.getByRole('button', { name: 'Sign in with a passkey', exact: true }).count() === 0, 'password-only browser remains usable');
      ok(await p.getByLabel('Email', { exact: true }).isVisible() && await p.getByLabel('Password', { exact: true }).isVisible(), 'password-only browser shows form immediately');
    }
    if (args.colorScheme && engine === 'chromium') await p.screenshot({ path: `${out}/signin-light.png`, fullPage: true, caret: 'initial' });
    await ctx.close();
  }
  for (const width of [320, 390, 430, 1440]) for (const remembered of [false, true]) {
    const { ctx, p } = await open({ width, height: 844, mobile: width < 600, last: remembered ? last : null, cancel: true, reducedMotion: 'no-preference' });
    const button = p.getByRole('button', { name: remembered ? 'Continue with a passkey' : 'Sign in with a passkey', exact: true });
    await p.waitForTimeout(400);
    const before = await button.boundingBox(), panel = await p.locator('.auth-panel').boundingBox();
    await button.click();
    await p.locator('.signin-feedback').filter({ hasText: 'No passkey was used.' }).waitFor();
    ok(await p.locator('.signin-feedback').evaluate(el => el.getAnimations().length === 0), 'cancellation does not shake');
    await p.waitForTimeout(400);
    ok(!(await p.locator('.signin-feedback').getAttribute('class')).includes('bad'), 'cancelled passkey is neutral');
    ok(await p.locator('.signin-feedback').getAttribute('role') === 'status', 'cancellation is a status, not an alert');
    const after = await button.boundingBox(), ready = await p.locator('.auth-panel').boundingBox();
    ok(Math.abs(before.y - after.y) < 1 && Math.abs(panel.height - ready.height) < 1, 'feedback keeps sign-in controls steady');
    await p.getByRole('button', { name: 'Use your password', exact: true }).click();
    ok(await p.locator('.signin-feedback').innerText() === '', 'changing method clears stale feedback');
    await ctx.close();
  }
  const unavailable = await open();
  await unavailable.p.getByRole('button', { name: 'Sign in with a passkey', exact: true }).click();
  await unavailable.p.locator('.signin-feedback.bad').waitFor();
  ok(await unavailable.p.locator('.signin-feedback').getAttribute('role') === 'alert', 'service failures still show as errors');
  await unavailable.ctx.close();
  const knownPassword = await open({ last: { ...last, way: 'password' } });
  ok(await knownPassword.p.getByLabel('Password', { exact: true }).isVisible(), 'remembered password user goes straight to password');
  await knownPassword.ctx.close();
  for (const mobile of [false, true]) {
    const { ctx, p } = await open({ width: mobile ? 390 : 1440, height: mobile ? 844 : 1000, mobile, colorScheme: 'light', last,
      url: 'https://auth.inflite.ai/#signout=today&back=' + encodeURIComponent('https://inflite.ai/') });
    ok(await p.locator('.signout-complete h1').innerText() === 'You’re signed out', 'signed-out confirmation');
    ok(await p.getByRole('button', { name: 'Back to Today', exact: true }).isVisible(), 'return action remains available');
    await p.getByRole('button', { name: 'Forget this account on this device', exact: true }).click();
    ok(await p.evaluate(() => localStorage.getItem('acct:last')) === null, 'forget action removes only the saved account');
    ok(await p.locator('.signout-notice span').innerText() === 'Saved account removed from this browser.', 'forget action confirms success');
    ok(!(await p.locator('.signout-notice').getAttribute('class')).includes('bad'), 'success is not marked as an error');
    ok(await p.locator('.signout-notice').evaluate(el => el === document.activeElement), 'focus moves to confirmation');
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'signed-out screen has no horizontal overflow');
    if (engine === 'chromium') await p.screenshot({ path: `${out}/signout-${mobile ? 'mobile' : 'desktop'}.png`, fullPage: true, caret: 'initial' });
    await p.getByRole('button', { name: 'Back to Today', exact: true }).click();
    await p.waitForURL('https://inflite.ai/');
    ok(p.url() === 'https://inflite.ai/', 'return to Today retains the original destination');
    await ctx.close();
  }
  assert.deepEqual(errors, [], 'no browser script errors');
  console.log(`${checks} ${engine} browser checks passed; screenshots in artifacts/signin`);
} finally { await browser.close(); }
