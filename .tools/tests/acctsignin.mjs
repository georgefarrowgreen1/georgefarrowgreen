// Signing in on the account's page, as seamless as it can be: who signed in here last remembered (Not you? forgets
// them), a passkey asked for in the keyboard as the card's drawn (the passkey button still working past it), a passkey
// offered after a password sign-in for an app (made there, with its own copy of Chat's key), the password field's
// eye and Caps Lock line, and the sky's dawn and dusk. The apps' addresses are stood in for by ifl.test (the home page's by gfg.test), as in
// acctjoin.mjs.
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { makeAccount } from './join.mjs';
const [,, S, out] = process.argv;
const CHAT = 'http://chat.ifl.test:8788', ACCT = 'http://account.ifl.test:8788', AUTH = 'http://auth.ifl.test:8788';
const PW = 'a long test password';
const sql0 = (q) => execSync(`${S}/wr/node_modules/.bin/wrangler d1 execute bio-db --local --persist-to ${S}/wrstate --command "${q}"`, { cwd: process.env.APP_ROOT, stdio: 'pipe' }).toString();
const sql = (q) => { for (let i = 0; ; i++) { try { return sql0(q); } catch (e) { if (i > 5 || !/SQLITE_BUSY/.test(String(e.stdout) + String(e.stderr) + e.message)) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400); } } };
const rows = (q) => { const o = sql(q), m = o.match(/"results": (\[[\s\S]*?\])\s*,\s*"success"/); return m ? JSON.parse(m[1]) : []; };
let fails = 0; const errs = [];
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${extra ? '  — ' + extra : ''}`); if (!c) fails++; };

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined,
  args: ['--host-resolver-rules=MAP *.gfg.test 127.0.0.1, MAP gfg.test 127.0.0.1, MAP *.ifl.test 127.0.0.1, MAP ifl.test 127.0.0.1', `--unsafely-treat-insecure-origin-as-secure=${CHAT},${ACCT}`] });
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
// (each a phone with a passkey maker of its own, one that can hold a copy of Chat's key: PRF)
// (autofill: a passkey offered in the keyboard, as mapopen.mjs leaves out unless asked)
async function browser(name, autofill) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'en-GB', isMobile: true, hasTouch: true, userAgent: IPHONE });
  if (autofill) await ctx.addInitScript(() => { window.__autofill = true; });
  // (whether dusk comes over a page's sky: watched on every page, as signing out goes on to the sign-in page)
  await ctx.addInitScript(() => addEventListener('DOMContentLoaded', () => { const s = document.querySelector('.sky'); if (s) new MutationObserver(() => { if (s.classList.contains('dim')) window.__dusk = true; if (s.classList.contains('lit')) window.__dawn = true; }).observe(s, { attributes: true }); }));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${name}: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d|Cross-Origin-Opener-Policy header has been ignored/.test(m.text())) errs.push(`${name}: ${m.text()}`); });
  const asked = [];
  p.on('request', (r) => { if (r.url().endsWith('/api/account/signin/options')) asked.push(Date.now()); });
  const cdp = await ctx.newCDPSession(p); await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true } });
  return { ctx, p, name, asked };
}
const shot = (x, n) => x.p.screenshot({ path: `${out}/${n}.png` });
const settle = (x, ms = 900) => x.p.waitForTimeout(ms);
const text = (x, sel = 'main') => x.p.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ').trim() || '', sel);
const open = async (x, url) => { await x.p.goto('about:blank'); await x.p.goto(url); await x.p.waitForSelector('main:not([aria-busy])', { timeout: 20000 }); await settle(x); };
// (who the sign-in page remembers: kept there, at its own address)
const last = async (x) => { const q = await x.ctx.newPage(); await q.goto(`${AUTH}/crypto.js`); const l = await q.evaluate(() => JSON.parse(localStorage.getItem('acct:last') || 'null')); await q.close(); return l; };
// (signed out on the account's page, with Sign out at its foot; whether dusk came over the sky as it did)
async function signOut(x) {
  // (a passkey suggested once the page has settled, after joining: put away)
  if (await x.p.waitForSelector('#sheet[open]', { timeout: 3000 }).catch(() => null)) { await x.p.keyboard.press('Escape'); await x.p.waitForSelector('#sheet', { state: 'hidden' }); }
  await settle(x, 500);
  await x.p.click('main .ifh-me').then(() => x.p.click('.ifm-out'));
  await x.p.waitForURL((u) => u.hostname.startsWith('auth.'), { timeout: 20000 }).catch(() => {});
  await x.p.waitForSelector('main .signin', { timeout: 20000 }); await settle(x, 1200);
  return x.p.evaluate(() => window.__dusk);
}

// ---- 1. Remembered: signed out, back as yourself with just your password; Not you? forgets you ----
const A = await browser('rowan', true);
await makeAccount(A.p, `${ACCT}/`, { name: 'Rowan Hale', handle: 'rowan', email: 'rowan@example.com', password: PW });
const l1 = await last(A);
ok(l1?.email === 'rowan@example.com' && l1.name === 'Rowan Hale' && l1.handle === 'rowan' && l1.way === 'password', 'joined: who it was remembered in this browser, and how', JSON.stringify(l1));
ok(await signOut(A), 'signing out: dusk over the sky');
await A.p.waitForSelector('main .signin.remembered', { timeout: 10000 }).catch(() => {});
const r1 = await text(A);
ok(/Welcome back, Rowan/.test(r1) && /@rowan/.test(r1) && /Forget rowan@example\.com on this device/.test(r1) && !(await A.p.$('main .signin input[name=email]')),
  'signed out: "Welcome back, Rowan", no email to type, and Forget … on this device', r1.slice(0, 160));
await shot(A, '01-remembered');
// the password field: its eye, and Caps Lock said before a password typed in capitals is wrong
await A.p.fill('main .signin input[name=password]', 'wrong one entirely');
await A.p.click('main .signin .eye');
ok(await A.p.getAttribute('main .signin input[name=password]', 'type') === 'text' && await A.p.getAttribute('main .signin .eye', 'aria-pressed') === 'true', 'the eye shows what\'s typed');
await A.p.click('main .signin .eye');
ok(await A.p.getAttribute('main .signin input[name=password]', 'type') === 'password', 'and hides it again');
ok(!(await A.p.isVisible('main .signin .caps')), 'no Caps Lock line while it\'s off');
await A.p.focus('main .signin input[name=password]');
await A.p.evaluate(() => document.querySelector('main .signin input[name=password]').dispatchEvent(new KeyboardEvent('keydown', { key: 'A', bubbles: true, modifierCapsLock: true })));
await settle(A, 400);
ok(await A.p.isVisible('main .signin .caps') && /Caps Lock is on/.test(await text(A, 'main .signin .caps')), 'Caps Lock on: said under the field');
await A.p.evaluate(() => document.querySelector('main .signin input[name=password]').dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true })));
await settle(A, 400);
ok(!(await A.p.isVisible('main .signin .caps')), 'and gone once it\'s off');
// a wrong password: said, and the card stays
await A.p.click('main .signin form .btn');
const wrong = await A.p.waitForSelector('main .said.bad', { timeout: 20000 }).then((e) => e.innerText(), () => '');
ok(/don’t match/.test(wrong) && await A.p.$('main .signin.remembered'), 'a wrong password: said, still remembered', wrong);
await A.p.fill('main .signin input[name=password]', PW);
await A.p.click('main .signin form .btn');
await A.p.waitForSelector('main .hero', { timeout: 30000 }).catch(() => {});
ok(!!(await A.p.$('main .hero')) && await A.p.evaluate(() => window.__dawn), 'the password alone signs you back in, as dawn breaks over the sky');
await signOut(A);
await A.p.click('main .notyou'); await A.p.waitForSelector('main .signin input[name=email]', { timeout: 10000 }).catch(() => {});
ok(!!(await A.p.$('main .signin input[name=email]')) && !(await last(A)) && /Your account/.test(await text(A)), 'Not you?: forgotten, and the usual sign-in');

// ---- 2. A passkey in the keyboard: asked for as the card's drawn; the passkey button still works past it ----
const autofill = await A.p.evaluate(() => PublicKeyCredential.isConditionalMediationAvailable?.());
ok(A.asked.length >= 1 || !autofill, 'the sign-in card asks for a passkey for the keyboard as it\'s drawn, with nothing tapped', `${A.asked.length} asked; conditional ${autofill}`);
ok(await A.p.getAttribute('main .signin input[name=email]', 'autocomplete') === 'username webauthn', 'its email field offers passkeys (autocomplete "username webauthn")');

// ---- 3. Signed in with a password for an app: a passkey offered on the way back, with Chat's key copied ----
const B = await browser('rowan-phone');
await B.p.goto(`${CHAT}/`);
await B.p.waitForSelector('.welcome [data-act=acctsignin]', { state: 'visible', timeout: 30000 }); await B.p.click('.welcome [data-act=acctsignin]');
await B.p.waitForURL((u) => /^(account|auth)\./.test(u.hostname), { timeout: 20000 });
await B.p.waitForSelector('main .signin input[name=email]', { timeout: 20000 });
await B.p.fill('main .signin input[name=email]', 'rowan@example.com'); await B.p.fill('main .signin input[name=password]', PW);
await B.p.click('main .signin form .btn');
await B.p.waitForSelector('main .signin.offer', { timeout: 30000 }).catch(() => {});
const offer = await text(B, 'main .signin');
ok(/Next time, just a glance/.test(offer) && /Add a passkey/.test(offer) && /Not now/.test(offer) && /Chat messages/.test(offer), 'a passkey offered before going back to Chat', offer);
await settle(B); await shot(B, '02-offer');
await B.p.click('main .signin.offer .btn');
await B.p.waitForURL((u) => !/^(account|auth)\./.test(u.hostname), { timeout: 40000 }).catch(() => {});
await B.p.waitForSelector('.tabs, #city', { state: 'attached', timeout: 40000 }).catch(() => {});
const pk = rows("SELECT COUNT(*) AS n, SUM(p.vault IS NOT NULL) AS v FROM pg_passkeys p JOIN pg_users u ON u.id = p.user_id WHERE u.handle = 'rowan'")[0];
ok(!/(account|auth)\./.test(B.p.url()) && pk?.n === 1 && pk.v === 1, 'Add a passkey: made, with its own copy of Chat\'s key, and back in Chat', JSON.stringify(pk));

// ---- 4. Last time with a passkey: that one first, the password a tap away ----
await open(B, `${ACCT}/`);
await B.p.waitForSelector('main .hero', { timeout: 20000 }).catch(() => {});
const l3 = await last(B);
ok(l3?.way === 'passkey' && !!l3.id, 'remembered as signed in with a passkey, and which', JSON.stringify(l3));
await signOut(B);
const r2 = await text(B, 'main .signin');
ok(/Last time, you used a passkey/.test(r2) && /Continue with your passkey/.test(r2) && !(await B.p.isVisible('main .signin input[name=password]')), 'signed out: Continue with your passkey, the password out of the way', r2);
await shot(B, '03-remembered-passkey');
await B.p.click('main .signin .usepw'); await settle(B, 600);
ok(await B.p.isVisible('main .signin input[name=password]') && /Use your passkey instead/.test(await text(B, 'main .signin')), 'Use your password instead: there, a tap away');
await B.p.click('main .signin .usepw'); await settle(B, 600);
await B.p.click('main .signin .btn:has-text("Continue with your passkey")');
await B.p.waitForSelector('main .hero', { timeout: 30000 }).catch(() => {});
ok(!!(await B.p.$('main .hero')) && /Rowan Hale/.test(await text(B)), 'the passkey signs you in');

// ---- 5. The passkey button, past the keyboard's ask (still waiting, in A, which has no passkey here): asked for
// itself, rather than refused as one ask too many ----
await A.p.click('main .signin .btn:has-text("Sign in with a passkey")');
const none = await A.p.waitForSelector('main .said.bad', { timeout: 20000 }).then((e) => e.innerText(), () => '');
ok(/No passkey was used/.test(none), 'Sign in with a passkey, with the keyboard\'s ask waiting: that put away, and the passkey asked for', none);
await signOut(B);
await B.p.click('main .notyou'); await B.p.waitForSelector('main .signin input[name=email]', { timeout: 10000 }).catch(() => {});
await B.p.click('main .signin .btn:has-text("Sign in with a passkey")');
await B.p.waitForSelector('main .hero', { timeout: 30000 }).catch(() => {});
ok(!!(await B.p.$('main .hero')), 'and with one here, it signs you in');

ok(!errs.length, 'no page errors', errs.join(' | '));
await b.close();
console.log(`FAILS ${fails}`);
process.exit(fails ? 1 : 0);
