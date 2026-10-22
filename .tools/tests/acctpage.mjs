// The account's own page, at account.<site>: signed in already where the site is (the shared sign-in), your profile
// (name, handle, photo), your apps, a new password (the key locked anew with it, so InFlight still opens with it), passkeys
// (added, after showing it's you; taken away), signed-in devices (one signed out from another), signing out and in
// (password, passkey), and deleting the account; its API only at its own address and only from its own pages; and how it
// looks, dark and light. The site's addresses are stood in for by gfg.test, as in wxacct.mjs.
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import http from 'http';
const [,, S, out] = process.argv;
const CHAT = 'http://chat.gfg.test:8788', WX = 'http://weather.gfg.test:8788', ACCT = 'http://account.gfg.test:8788', PW = 'a long test password', PW2 = 'Orchard lantern 42 ferry';
const sql0 = (q) => execSync(`${S}/wr/node_modules/.bin/wrangler d1 execute bio-db --local --persist-to ${S}/wrstate --command "${q}"`, { cwd: process.env.APP_ROOT, stdio: 'pipe' }).toString();
const sql = (q) => { for (let i = 0; ; i++) { try { return sql0(q); } catch (e) { if (i > 5 || !/SQLITE_BUSY/.test(String(e.stdout) + String(e.stderr) + e.message)) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400); } } };
const rows = (q) => { const o = sql(q), m = o.match(/"results": (\[[\s\S]*?\])\s*,\s*"success"/); return m ? JSON.parse(m[1]) : []; };
let fails = 0; const errs = [];
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${extra ? '  — ' + extra : ''}`); if (!c) fails++; };

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined,
  args: ['--host-resolver-rules=MAP *.gfg.test 127.0.0.1, MAP gfg.test 127.0.0.1', `--unsafely-treat-insecure-origin-as-secure=${CHAT},${WX},${ACCT}`] });
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
async function browser(name, { scheme = 'dark' } = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'en-GB', isMobile: true, hasTouch: true, userAgent: IPHONE, colorScheme: scheme });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${name}: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 40[13]|Cross-Origin-Opener-Policy header has been ignored/.test(m.text())) errs.push(`${name}: ${m.text()}`); });
  const cdp = await ctx.newCDPSession(p); await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true } });
  return { ctx, p, name, creds: async () => (await cdp.send('WebAuthn.getCredentials', { authenticatorId })).credentials };
}
// a request from outside the browser, as the browser would send it (its cookies), to the site's address on this machine
async function req(x, url, { method = 'GET', headers = {}, data } = {}) {
  const u = new URL(url), cookie = (await x.ctx.cookies(url)).map((c) => `${c.name}=${c.value}`).join('; ');
  return new Promise((ok, no) => {
    const r = http.request({ host: '127.0.0.1', port: u.port, path: u.pathname + u.search, method, headers: { Host: u.host, ...(cookie ? { Cookie: cookie } : {}), ...headers } }, (res) => {
      const parts = []; res.on('data', (c) => parts.push(c));
      res.on('end', () => { const body = Buffer.concat(parts); ok({ status: () => res.statusCode, ok: () => res.statusCode >= 200 && res.statusCode < 300, headers: () => res.headers, text: async () => body.toString() }); });
    });
    r.on('error', no); if (data) r.write(data); r.end();
  });
}
const shot = (x, n) => x.p.screenshot({ path: `${out}/${n}.png` });
const settle = (x, ms = 900) => x.p.waitForTimeout(ms);
const text = (x, sel = 'main') => x.p.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ').trim() || '', sel);
const sheetText = (x) => text(x, '#sheet');
const openRow = async (x, title) => { await x.p.click(`.row:has(b:text-is("${title}"))`); await x.p.waitForSelector('#sheet[open] .sheet-body'); await settle(x, 700); };
const closeSheet = async (x) => { await x.p.click('#sheet .x, #sheet .link:text-is("Cancel")'); await x.p.waitForSelector('#sheet', { state: 'hidden' }); await settle(x, 300); };
const account = async (x) => { await x.p.goto(`${ACCT}/`); await x.p.waitForSelector('main:not([aria-busy])', { timeout: 20000 }); await settle(x); };
const waitText = (x, re, sel = 'main', ms = 30000) => x.p.waitForFunction(([r, s]) => new RegExp(r).test(document.querySelector(s)?.innerText || ''), [re.source, sel], { timeout: ms }).catch(() => {});
const user = (h) => rows(`SELECT id, name, handle, salt, avatar_at FROM pg_users WHERE handle = '${h}'`)[0];

// ---- 1. Signed up in InFlight (with a passkey): the account's page in the same browser is signed in already ----
const L = await browser('laptop');
await L.p.goto(`${CHAT}/`); await L.p.waitForSelector('.welcome', { timeout: 20000 }); await L.p.click('[data-act=to][data-id=signup]');
await L.p.fill('#f-name', 'Rowan Hale'); await L.p.fill('#f-handle', 'rowan'); await L.p.fill('#f-email', 'rowan@example.com'); await L.p.fill('#f-password', PW);
await L.p.click('[data-form=signup] .btn'); await L.p.waitForSelector('#city', { state: 'attached', timeout: 30000 });
await L.p.selectOption('#city', 'London'); await L.p.waitForSelector('[data-act=onbdone]', { timeout: 20000 });
await L.p.waitForSelector('[data-act=pkadd]'); await L.p.click('[data-act=pkadd]'); await L.p.waitForSelector('.tabs', { timeout: 20000 });
// (InFlight's way here: Privacy & Security, Your Account)
await L.p.click('[data-act=tab][data-id=account]'); await L.p.click('#screen > main.view [data-act=securitysheet]');
await L.p.waitForSelector('.sheet #to-account', { timeout: 15000 }).catch(() => {});
ok(!!(await L.p.$('.sheet #to-account')) && !/Weather/.test(await text(L, '.sheet')), 'InFlight leads here, without naming any other app');
// (it opens the page in a window of its own, signed in by a code it hands over: acctlink.mjs. Here, the page itself in
// this tab, where the browser's signed in already)
await L.p.goto(`${ACCT}/`); await L.p.waitForSelector('main:not([aria-busy])', { timeout: 20000 }); await settle(L);
const home = await text(L);
ok(/Rowan Hale/.test(home) && /@rowan/.test(home) && /rowan@example\.com/.test(home), 'signed in already: the profile, from the site\'s sign-in', home.slice(0, 120));
ok(/Your apps/i.test(home) && /InFlight/.test(home) && /Weather/.test(home), 'your apps: both of them', home);
const links = await L.p.$$eval('.app', (a) => a.map((x) => x.getAttribute('href')));
ok(links.join() === `${CHAT}/,${WX}/`, 'each app\'s tile opens it, on this site', links.join());
ok(/Passkeys 1/.test(home) && /Signed-in devices 1/.test(home), 'sign-in and security: the passkey made in InFlight, and this device', home.match(/Passkeys \S+|Signed-in devices \S+/g)?.join(' | '));
ok(!(await L.p.evaluate(() => document.cookie.includes('account'))), 'the page itself can\'t read the sign-in');
await shot(L, '01-signed-in');
// the large title giving way to the bar
await L.p.evaluate(() => scrollTo(0, 400)); await settle(L, 500);
const bar = await L.p.evaluate(() => Number(getComputedStyle(document.documentElement).getPropertyValue('--bar')));
ok(bar === 1, 'scrolled: the title moves up into the bar', String(bar));
await shot(L, '02-scrolled');
await L.p.evaluate(() => scrollTo(0, 0)); await settle(L, 300);

// ---- 2. How the page is served: only at its own address; the API too, and only from its own pages ----
const r1 = await req(L, `${ACCT}/`);
const csp = r1.headers()['content-security-policy'] || '';
ok(r1.status() === 200 && /default-src 'self'/.test(csp) && !/unsafe-inline/.test(csp) && r1.headers()['x-frame-options'] === 'DENY' && /no-cache/.test(r1.headers()['cache-control'] || ''),
  'the page: strict rules (no inline anything, no framing), never kept stale', `${r1.status()} ${csp.slice(0, 60)}`);
const [rc, rw] = await Promise.all([req(L, `${CHAT}/api/account/me`), req(L, `${WX}/api/account/me`)]);
ok(rc.status() === 404 && rw.status() === 404, 'the account\'s API answers only at the account\'s address', `${rc.status()} ${rw.status()}`);
const [ro, rp, rx] = await Promise.all([req(L, `${ACCT}/api/pigeon/me`), req(L, `${ACCT}/pigeon/`), req(L, `${ACCT}/nothing-here.html`)]);
ok(ro.status() === 404 && rp.status() === 404 && rx.status() === 404, 'nothing else on the site is served at the account\'s address', `${ro.status()} ${rp.status()} ${rx.status()}`);
const [rcrypto, ricon] = await Promise.all([req(L, `${ACCT}/crypto.js`), req(L, `${ACCT}/apps/weather.png`)]);
ok(rcrypto.ok() && /fromPassword/.test(await rcrypto.text()) && ricon.ok() && /image\/png/.test(ricon.headers()['content-type']), 'what it shares with the site: the password stretching, the apps\' icons', `${rcrypto.status()} ${ricon.status()}`);
const xo = await req(L, `${ACCT}/api/account/signout`, { method: 'POST', headers: { Origin: WX, 'Content-Type': 'application/json' }, data: '{}' });
const xp = await req(L, `${ACCT}/api/account/me/profile`, { method: 'PATCH', headers: { Origin: CHAT, 'Content-Type': 'application/json' }, data: JSON.stringify({ name: 'Mallory' }) });
ok(xo.status() === 403 && xp.status() === 403 && user('rowan').name === 'Rowan Hale', 'from any other page (another app\'s included): refused', `${xo.status()} ${xp.status()}`);

// ---- 3. Your profile: name, handle and photo, the same everywhere ----
await L.p.click('.hero .pill'); await L.p.waitForSelector('#sheet[open] .sheet-body'); await settle(L, 700);
const recedes = await L.p.evaluate(() => getComputedStyle(document.getElementById('page')).transform);
ok(recedes !== 'none', 'a sheet comes up and the page steps back', recedes);
await shot(L, '03-edit-profile');
await L.p.fill('#sheet .field:has-text("Name") input', 'Rowan Ash Hale');
await L.p.fill('#sheet .at input', 'rowan_h');
await L.p.click('#sheet .link.done');
await L.p.waitForSelector('#sheet', { state: 'hidden', timeout: 15000 }).catch(() => {});
await waitText(L, /Rowan Ash Hale/);
ok(/Rowan Ash Hale/.test(await text(L, '.hero')) && /@rowan_h/.test(await text(L, '.hero')) && user('rowan_h')?.name === 'Rowan Ash Hale', 'a new name and handle: saved for the account', await text(L, '.hero'));
await settle(L, 400);
await L.p.click('.hero .pill'); await L.p.waitForSelector('#sheet[open] .sheet-body'); await settle(L, 500);
await L.p.fill('#sheet .at input', 'rowan');
await L.p.click('#sheet .link.done'); await waitText(L, /once a day/, '#sheet', 10000);
ok(/once a day/.test(await sheetText(L)), 'a handle changes once a day: said, in the sheet', (await sheetText(L)).slice(-90));
// a photo: made square and small here, then the account's
const jpeg = await L.p.evaluate(async () => { const c = document.createElement('canvas'); c.width = 1000; c.height = 700; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 1000, 700); gr.addColorStop(0, '#ffb36b'); gr.addColorStop(1, '#d9467a'); g.fillStyle = gr; g.fillRect(0, 0, 1000, 700);
  g.fillStyle = '#fff3'; g.beginPath(); g.arc(500, 300, 170, 0, 7); g.fill(); g.fillStyle = '#ffffffcc'; g.beginPath(); g.arc(500, 900, 330, 0, 7); g.fill();
  return [...new Uint8Array(await (await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.9))).arrayBuffer())]; });
await L.p.setInputFiles('#sheet input[type=file]', { name: 'me.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpeg) });
await L.p.waitForSelector('.hero .avatar img', { timeout: 20000 }).catch(() => {});
await settle(L, 700);
const photo = await L.p.evaluate(async () => { const i = document.querySelector('.hero .avatar img'); if (!i) return null; await i.decode().catch(() => {}); return [i.naturalWidth, i.naturalHeight]; });
ok(photo?.[0] === 512 && photo?.[1] === 512 && user('rowan_h').avatar_at > 0, 'a photo: the middle square, 512 pixels, shown at once', JSON.stringify(photo));
await shot(L, '04-photo');
await L.p.click('#sheet .link:text-is("Cancel")'); await L.p.waitForSelector('#sheet', { state: 'hidden' }); await settle(L, 300);

// ---- 4. A new password: the key locked anew with it, here; InFlight opens with it on a new phone ----
await openRow(L, 'Password');
await shot(L, '05-password');
const pwField = (n) => `#sheet .field:has(span:text-is("${n}")) input`;
await L.p.fill(pwField('Current password'), 'not my password');
await L.p.fill(pwField('New password'), 'password1234');
await L.p.waitForFunction(() => /data breach/.test(document.querySelector('#sheet .hint')?.textContent || ''), null, { timeout: 10000 }).catch(() => {});
ok(/data breach/.test(await text(L, '#sheet .hint')), 'a password from a data breach: said as it\'s typed (only 5 characters of its hash asked)', await text(L, '#sheet .hint'));
await L.p.fill(pwField('New password'), PW2);
await L.p.waitForTimeout(700);
ok(/strong/i.test(await text(L, '#sheet .hint')), 'a good one: the meter says so', await text(L, '#sheet .hint'));
await shot(L, '06-password-strength');
await L.p.fill(pwField('New password again'), PW2 + 'x');
await L.p.click('#sheet form .btn'); await settle(L, 400);
ok(/don’t match/.test(await text(L, '#sheet .said')), 'the two don\'t match: said', await text(L, '#sheet .said'));
await L.p.fill(pwField('New password again'), PW2);
await L.p.click('#sheet form .btn'); await waitText(L, /isn’t right/, '#sheet .said');
ok(/isn’t right/.test(await text(L, '#sheet .said')), 'a wrong current password: said, nothing changed', await text(L, '#sheet .said'));
const salt0 = user('rowan_h').salt;
await L.p.fill(pwField('Current password'), PW);
await L.p.click('#sheet form .btn');
await L.p.waitForSelector('#sheet', { state: 'hidden', timeout: 40000 }).catch(() => {});
await settle(L, 300);
ok(user('rowan_h').salt !== salt0 && /Password changed/.test(await text(L, '#toast')), 'changed: a new salt, and said', await text(L, '#toast'));
const Ph = await browser('phone');
await Ph.p.goto(`${CHAT}/`); await Ph.p.waitForSelector('.welcome', { timeout: 20000 }); await Ph.p.click('[data-act=to][data-id=signin]');
await Ph.p.fill('#f-email', 'rowan@example.com'); await Ph.p.fill('#f-password', PW2); await Ph.p.click('[data-form=signin] .btn');
const opened = await Ph.p.waitForSelector('.tabs', { timeout: 40000 }).then(() => true).catch(() => false);
ok(opened, 'InFlight on a new phone opens with the new password: the key it locks came through whole');

// ---- 5. Passkeys: adding one needs you to show it's you; one's taken away ----
sql(`UPDATE pg_sessions SET auth_at = 0 WHERE user_id = '${user('rowan_h').id}'`);
await account(L);
await openRow(L, 'Passkeys');
ok(/Signed up|Added/.test(await sheetText(L)) && (await L.p.$$('#sheet .row')).length === 1, 'your passkeys: the one from InFlight', await sheetText(L));
await shot(L, '07-passkeys');
await L.p.click('#sheet .btn:has-text("Add a passkey")');
await L.p.waitForSelector('#sheet h2:text-is("Confirm it’s you")', { timeout: 15000 }).catch(() => {});
ok(await L.p.$('#sheet h2:text-is("Confirm it’s you")'), 'adding a passkey a while after signing in: show it\'s you first');
await settle(L, 500);
await shot(L, '08-confirm');
await L.p.fill('#sheet input[type=password]', PW2); await L.p.click('#sheet form .btn');
await waitText(L, /already has a passkey/, '#sheet', 30000);
ok(/already has a passkey/.test(await sheetText(L)), 'shown, and on with it: this device has one already, so said', (await sheetText(L)).slice(-80));
const rm = '#sheet .row .mini';
await L.p.click(rm); ok((await L.p.textContent(rm)) === 'Remove?', 'taking one away asks once more');
await L.p.click(rm);
await L.p.waitForFunction(() => /No passkeys yet/.test(document.getElementById('sheet')?.innerText || ''), null, { timeout: 15000 }).catch(() => {});
ok(rows(`SELECT id FROM pg_passkeys WHERE user_id = '${user('rowan_h').id}'`).length === 0, 'taken away (no asking again: it\'s been shown it\'s you)');
await L.p.click('#sheet .btn:has-text("Add a passkey")');
await L.p.waitForFunction(() => document.querySelectorAll('#sheet .row').length === 1, null, { timeout: 20000 }).catch(() => {});
const pks = rows(`SELECT label FROM pg_passkeys WHERE user_id = '${user('rowan_h').id}'`);
ok(pks.length === 1 && /iPhone/.test(pks[0].label) && (await L.creds()).every((c) => c.rpId === 'gfg.test'), 'a new passkey: the site\'s, named for the device', JSON.stringify(pks));
await closeSheet(L);

// ---- 6. Signed-in devices: signed in here on the phone too; one signed out from the other ----
await account(Ph);
ok(/Rowan Ash Hale/.test(await text(Ph)), 'on the phone: signed in already, from InFlight there');
await account(L);
await openRow(L, 'Signed-in devices');
const devs = await sheetText(L);
ok((await L.p.$$('#sheet .row')).length === 2 && /This browser/.test(devs) && /Active now/.test(devs), 'both devices, this one marked', devs);
await shot(L, '09-devices');
await L.p.click('#sheet .row:not(.current) .mini'); await L.p.click('#sheet .row:not(.current) .mini');
await L.p.waitForFunction(() => document.querySelectorAll('#sheet .row').length === 1, null, { timeout: 15000 }).catch(() => {});
ok((await L.p.$$('#sheet .row')).length === 1, 'the phone signed out, from the laptop');
await closeSheet(L);
await Ph.p.reload(); await Ph.p.waitForSelector('main:not([aria-busy])'); await settle(Ph);
ok(/Sign in with a passkey/.test(await text(Ph)), 'and the phone\'s page is signed out', (await text(Ph)).slice(0, 80));

// ---- 7. Signed out: how it looks; signing in with a password (wrong first), and with a passkey ----
await Ph.p.evaluate(() => document.querySelectorAll('.rise').forEach((e) => e.getAnimations().filter((a) => a.animationName === 'rise').forEach((a) => a.finish())));
await shot(Ph, '10-signed-out');
await Ph.p.fill('main input[type=email]', 'rowan@example.com'); await Ph.p.fill('main input[type=password]', 'wrong wrong wrong');
await Ph.p.click('main form .btn'); await waitText(Ph, /match/, 'main .said');
ok((await text(Ph, 'main .said')).length > 0 && !/Rowan/.test(await text(Ph)), 'a wrong password: said, still signed out', await text(Ph, 'main .said'));
await Ph.p.fill('main input[type=password]', PW2); await Ph.p.click('main form .btn');
await waitText(Ph, /Rowan Ash Hale/);
ok(/Rowan Ash Hale/.test(await text(Ph)) && /Welcome back, Rowan/.test(await text(Ph, '#toast')), 'signed in with the password: welcomed back', await text(Ph, '#toast'));
const sessions = rows(`SELECT hash FROM pg_sessions WHERE user_id = '${user('rowan_h').id}'`).length;
// signing out here signs this browser out of the site
await Ph.p.click('.row.action:text-is("Sign out")'); await waitText(Ph, /Sign in/);
ok(/Your account/.test(await text(Ph)) && rows(`SELECT hash FROM pg_sessions WHERE user_id = '${user('rowan_h').id}'`).length === sessions - 1, 'signed out: this browser\'s sign-in ended', String(sessions));
await L.p.click('.row.action:text-is("Sign out")'); await waitText(L, /Sign in with a passkey/);
await L.p.click('main .btn:has-text("Sign in with a passkey")'); await waitText(L, /Rowan Ash Hale/);
ok(/Rowan Ash Hale/.test(await text(L)), 'signed in with the passkey added here');

// ---- 8. Light mode, and a wide screen ----
const D = await browser('light', { scheme: 'light' });
await D.p.goto(`${CHAT}/`); await D.p.waitForSelector('.welcome', { timeout: 20000 }); await D.p.click('[data-act=to][data-id=signin]');
await D.p.fill('#f-email', 'rowan@example.com'); await D.p.fill('#f-password', PW2); await D.p.click('[data-form=signin] .btn'); await D.p.waitForSelector('.tabs', { timeout: 40000 });
await account(D);
const bg = await D.p.evaluate(() => getComputedStyle(document.body).color);
ok(bg === 'rgb(13, 16, 32)', 'light mode: dark text on the dawn sky', bg);
await shot(D, '11-light');
await D.p.click('.hero .pill'); await D.p.waitForSelector('#sheet[open] .sheet-body'); await settle(D, 700);
await shot(D, '12-light-sheet');
await closeSheet(D);
await D.p.setViewportSize({ width: 1280, height: 860 }); await settle(D, 400);
await shot(D, '13-wide');

// ---- 9. Deleting the account: typed to confirm; then gone everywhere ----
await openSheetDelete(L);
async function openSheetDelete(x) { await x.p.click('.row.action.danger:text-is("Delete account")'); await x.p.waitForSelector('#sheet[open] .sheet-body'); await settle(x, 700); }
ok(await L.p.$eval('#sheet form .btn', (e) => e.disabled), 'Delete waits for the handle to be typed');
await L.p.fill('#sheet .at input', 'rowan'); ok(await L.p.$eval('#sheet form .btn', (e) => e.disabled), 'not with the wrong one');
await L.p.fill('#sheet .at input', 'rowan_h');
await shot(L, '14-delete');
await L.p.click('#sheet form .btn');
await waitText(L, /Sign in with a passkey/, 'main', 30000);
ok(/deleted/.test(await text(L, '#toast')) && !user('rowan_h'), 'deleted: the account\'s gone, and this browser signed out', await text(L, '#toast'));
await D.p.reload(); await D.p.waitForSelector('main:not([aria-busy])'); await settle(D, 500);
ok(/Sign in/.test(await text(D)), 'and every other browser is signed out');

ok(errs.length === 0, 'no errors on any page', errs.slice(0, 4).join(' | '));
await b.close();
console.log(`FAILS ${fails}`);
process.exit(0);
