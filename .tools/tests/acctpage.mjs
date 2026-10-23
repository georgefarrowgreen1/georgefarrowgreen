// The account's own page, at account.<site>: signed in already where the site is (the shared sign-in), your profile
// (name, handle, photo), your apps, a new password (the key locked anew with it, so InFlight still opens with it), passkeys
// (added, after showing it's you; taken away), signed-in devices (one signed out from another), signing out and in
// (password, passkey), and deleting the account; its API only at its own address and only from its own pages; and how it
// looks, dark and light. And: the security check-up, confirming the email and changing it (by the emails' links), the
// password checked against data breaches, passkeys' names, devices unused for months, recent activity, appearance and
// units for every app, the data as a file, the page keeping up with changes made elsewhere, and deleting in 7 days
// unless it's kept (by signing in here, or the email's link), then gone when the time's up. The site's addresses are
// stood in for by gfg.test, as in wxacct.mjs.
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import http from 'http';
import { joinInFlight } from './join.mjs';
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
const user = (h) => rows(`SELECT id, name, handle, email, email_ok, salt, avatar_at, appearance, delete_at FROM pg_users WHERE handle = '${h}'`)[0];
const mails = () => { try { return readFileSync(`${S}/mailbox.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((m) => m.body || m); } catch (_) { return []; } };
const mailTo = (to, re, since = 0) => mails().slice(since).filter((m) => [].concat(m.to).includes(to) && re.test(m.subject || '')).at(-1);
const tokenIn = (m, kind) => (new RegExp(`#${kind}=([A-Za-z0-9_-]{40,50})`).exec(m?.text || '') || [])[1];
const waitMail = async (to, re, ms = 15000, since = 0) => { const t0 = Date.now(); for (;;) { const m = mailTo(to, re, since); if (m || Date.now() - t0 > ms) return m; await new Promise((r) => setTimeout(r, 300)); } };
// (shown it's you, if it asks)
const confirmIfAsked = async (x, pw) => { if (await x.p.waitForSelector('#sheet h2:text-is("Confirm it’s you")', { timeout: 2500 }).catch(() => null)) { await x.p.fill('#sheet input[type=password]', pw); await x.p.click('#sheet form .btn'); } };
// the once-a-minute tick (its housekeeping, now, whenever it last ran)
const tick = async (x) => { sql("UPDATE pg_meta SET v = '0' WHERE k = 'keep_at'"); return req(x, `${CHAT}/api/pigeon/notify-tick`, { method: 'POST', headers: { Authorization: 'Bearer tick-test-secret' } }); };

// ---- 1. An account made here, then InFlight (with a passkey): the account's page in the same browser is signed in ----
const L = await browser('laptop');
await joinInFlight(L.p, `${CHAT}/`, { name: 'Rowan Hale', handle: 'rowan', email: 'rowan@example.com', password: PW, city: 'London', passkey: true });
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
// (each app's card: Open, the app on this site; and ⓘ, what it keeps of yours, and the way into it: acctmore.mjs)
const opens = await L.p.$$eval('main .app a.open-app', (as) => as.map((a) => a.getAttribute('href')));
ok(opens.join() === `${CHAT}/,${WX}/`, 'each app\'s card opens the app, on this site', opens.join());
const links = [];
for (const name of ['InFlight', 'Weather']) {
  await L.p.click(`main .app:has(b:text-is("${name}")) .about`); await L.p.waitForSelector('#sheet[open] .app-head'); await settle(L, 500);
  links.push(await L.p.$eval('#sheet a.btn', (a) => a.getAttribute('href'))); await closeSheet(L);
}
ok(links.join() === `${CHAT}/,${WX}/`, 'and its ⓘ, what it keeps of yours, with the way in too', links.join());
ok(/Passkeys 1/.test(home) && /Signed-in devices (1|This \w+)/.test(home), 'sign-in and security: the passkey made in InFlight, and this device', home.match(/Passkeys \S+|Signed-in devices (This )?\S+/g)?.join(' | '));
ok(/Password Set today/.test(home) && /Recent activity Today/.test(home), 'each row says how things are: the password set today, the latest activity today', home.match(/Password \S+ \S+|Recent activity \S+/g)?.join(' | '));
ok(!(await L.p.evaluate(() => document.cookie.includes('account'))), 'the page itself can\'t read the sign-in');
// (the check-up: kept in Sign-in and security, a row saying how it stands, opened as a sheet)
const ckRow = await L.p.locator('main .row:has(b:text-is("Security check-up"))').innerText().then((t) => t.replace(/\s+/g, ' ').trim());
ok(!(await L.p.$('main .checkup')) && /Security check-up 1 to do/.test(ckRow), 'the check-up isn\'t on the page itself: a row in Sign-in and security, saying how it stands', ckRow);
await openRow(L, 'Security check-up');
const ck = await text(L, '#sheet .checkup');
ok(/1 thing to do/.test(ck) && /Confirm your email/.test(ck) && /Passkey saved/.test(ck) && /Password not in a known data breach/.test(ck) && /No devices left unused/.test(ck),
  'opened: one thing to do (the email), three done (the password checked as the account was made)', ck);
await shot(L, '01b-checkup-sheet');
await closeSheet(L);
ok(/Confirm your email/.test(await text(L, '.banner')), 'and the email not yet confirmed, said up top', await text(L, '.banner'));
await shot(L, '01-signed-in');
// the large title giving way to the bar
await L.p.evaluate(() => scrollTo(0, 400)); await settle(L, 500);
const bar = await L.p.evaluate(() => ({ glass: Number(getComputedStyle(document.documentElement).getPropertyValue('--bar')), header: !!document.querySelector('header, .bar'), title: document.querySelector('.large').getBoundingClientRect().bottom }));
ok(bar.glass === 1 && !bar.header && bar.title < 0, 'scrolled: the large title goes with the page (no bar to take it), glass behind the status bar', JSON.stringify(bar));
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

// ---- 2b. Confirming the email: a link, sent from the banner; opened, it's confirmed ----
const n0 = mails().length;
await L.p.click('.banner .mini');
const cm = await waitMail('rowan@example.com', /Confirm your email for your account/, 15000, n0);   // (the one just sent: it replaces the one sent when the account was made)
ok(cm && tokenIn(cm, 'confirm') && /georgefarrowgreen\.com/.test(cm.html) && !/>InFlight</.test(cm.html), 'a confirm link, as the account\'s (no app named)', cm?.subject);
await L.p.goto('about:blank'); await L.p.goto(`${ACCT}/#confirm=${tokenIn(cm, 'confirm')}`); await L.p.waitForSelector('main:not([aria-busy])'); await settle(L);
ok(user('rowan').email_ok > 0 && /Your email is confirmed/.test(await text(L, '#toast')) && !(await L.p.$('.banner')) && (await L.p.url()) === `${ACCT}/`,
  'opened: confirmed, said, the banner gone, the link out of the address bar', await text(L, '#toast'));

// ---- 2c. The password checked against data breaches, from the check-up ----
// (as for an account from before, whose password was never checked: a new one's is, as it's made)
sql("UPDATE pg_users SET pw_checked_at = NULL WHERE handle = 'rowan'");
await account(L);
await openRow(L, 'Security check-up');
await L.p.click('#sheet .ck-row:has-text("Check your password") .mini'); await L.p.waitForSelector('#sheet h2:text-is("Check your password")'); await settle(L, 500);
await L.p.fill('#sheet input[type=password]', PW); await L.p.click('#sheet form .btn');
await waitText(L, /data breach/, '#toast');
await L.p.waitForFunction(() => /Well protected/.test(document.querySelector('#sheet .checkup')?.innerText || ''), null, { timeout: 10000 }).catch(() => {});
ok(/isn’t in any known data breach/.test(await text(L, '#toast')) && /Well protected/.test(await text(L, '#sheet .checkup')), 'checked (opened over the check-up): not in a breach, and back to the check-up, all done', await text(L, '#sheet .checkup'));
const lg = readFileSync(`${S}/pwnedlog.jsonl`, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).at(-1);
ok(/^\/range\/[0-9A-F]{5}$/.test(lg.url) && lg.pad === 'true', 'only 5 characters of the hash were asked, padded', lg.url);
await settle(L, 900);
await shot(L, '07-checkup');
await closeSheet(L);
ok(/Security check-up All done/.test(await L.p.locator('main .row:has(b:text-is("Security check-up"))').innerText().then((t) => t.replace(/\s+/g, ' ').trim())), 'and its row says so', await L.p.locator('main .row:has(b:text-is("Security check-up"))').innerText().then((t) => t.replace(/\s+/g, ' ').trim()));

// ---- 3. Your profile: name, handle and photo, the same everywhere ----
await L.p.click('.hero .pill'); await L.p.waitForSelector('#sheet[open] .sheet-body'); await settle(L, 700);
const recedes = await L.p.evaluate(() => getComputedStyle(document.getElementById('page')).transform);
ok(recedes !== 'none', 'a sheet comes up and the page steps back', recedes);
const focus = await L.p.evaluate(() => ({ on: document.activeElement?.id, ring: getComputedStyle(document.activeElement).outlineStyle }));
ok(focus.on === 'sheet' && focus.ring === 'none', 'the sheet takes the focus itself: no ring round its first button, no keyboard', JSON.stringify(focus));
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

// ---- 5. Passkeys: a name of your own; adding one needs you to show it's you; one's taken away ----
sql(`UPDATE pg_sessions SET auth_at = 0 WHERE user_id = '${user('rowan_h').id}'`);
await account(L);
await openRow(L, 'Passkeys');
ok((await L.p.$$('#sheet .row')).length === 1 && /added/.test(await sheetText(L)), 'your passkeys: the one from InFlight', await sheetText(L));
await L.p.click('#sheet .row'); await L.p.waitForSelector('#sheet .field input'); await settle(L, 500);
ok(/Saved in/.test(await sheetText(L)) && /Last used/.test(await sheetText(L)), 'one passkey: where it\'s saved, when added and last used', await sheetText(L));
await shot(L, '08-passkey');
await L.p.fill('#sheet .field input', 'Rowan’s laptop'); await L.p.click('#sheet .link.done');
await waitText(L, /Rowan’s laptop/, '#sheet');
ok(rows(`SELECT label FROM pg_passkeys WHERE user_id = '${user('rowan_h').id}'`)[0]?.label === 'Rowan’s laptop' && /Rowan’s laptop/.test(await sheetText(L)), 'renamed (nothing at stake: no asking it\'s you)');
await L.p.click('#sheet .btn:has-text("Add a passkey")');
await L.p.waitForSelector('#sheet h2:text-is("Confirm it’s you")', { timeout: 15000 }).catch(() => {});
ok(await L.p.$('#sheet h2:text-is("Confirm it’s you")'), 'adding a passkey a while after signing in: show it\'s you first');
await settle(L, 500);
await shot(L, '09-confirm');
await L.p.fill('#sheet input[type=password]', PW2); await L.p.click('#sheet form .btn');
await waitText(L, /already has a passkey/, '#sheet', 30000);
ok(/already has a passkey/.test(await sheetText(L)), 'shown, and on with it: this device has one already, so said', (await sheetText(L)).slice(-80));
await L.p.click('#sheet .row'); await L.p.waitForSelector('#sheet .row.action.danger'); await settle(L, 400);
const rm = '#sheet .row.action.danger';
await L.p.click(rm); ok(/again/.test(await L.p.textContent(rm)), 'taking one away asks once more', await L.p.textContent(rm));
await L.p.click(rm);
await L.p.waitForFunction(() => /No passkeys yet/.test(document.getElementById('sheet')?.innerText || ''), null, { timeout: 15000 }).catch(() => {});
ok(rows(`SELECT id FROM pg_passkeys WHERE user_id = '${user('rowan_h').id}'`).length === 0, 'taken away (no asking again: it\'s been shown it\'s you), and back to the list');
await L.p.click('#sheet .btn:has-text("Add a passkey")');
await L.p.waitForFunction(() => document.querySelectorAll('#sheet .row').length === 1, null, { timeout: 20000 }).catch(() => {});
const pks = rows(`SELECT label FROM pg_passkeys WHERE user_id = '${user('rowan_h').id}'`);
ok(pks.length === 1 && /iPhone/.test(pks[0].label) && (await L.creds()).every((c) => c.rpId === 'gfg.test'), 'a new passkey: the site\'s, named for the device', JSON.stringify(pks));
await closeSheet(L);

// ---- 6. Signed-in devices: the phone's, unused for months, signed out from the laptop; the phone's page notices ----
await account(Ph);
ok(/Rowan Ash Hale/.test(await text(Ph)), 'on the phone: signed in already, from InFlight there');
sql(`UPDATE pg_sessions SET seen_at = ${Date.now() - 100 * 86400e3} WHERE user_id = '${user('rowan_h').id}' AND created_at = (SELECT MAX(created_at) FROM pg_sessions WHERE user_id = '${user('rowan_h').id}')`);
await account(L);
await openRow(L, 'Security check-up');
ok(/1 thing to do/.test(await text(L, '#sheet .checkup')) && /unused for 3 months/.test(await text(L, '#sheet .checkup')), 'the check-up notices a device long unused', await text(L, '#sheet .checkup'));
await closeSheet(L);
await openRow(L, 'Signed-in devices');
const devs = await sheetText(L);
ok((await L.p.$$('#sheet .row:not(.action)')).length === 2 && /This browser/.test(devs) && /Not used for 3 months/.test(devs) && /Sign out 1 unused device/.test(devs), 'both devices, this one marked, the other unused for months', devs);
await shot(L, '10-devices');
await L.p.click('#sheet .row.action:has-text("unused")');
await L.p.waitForFunction(() => document.querySelectorAll('#sheet .row:not(.action)').length === 1, null, { timeout: 15000 }).catch(() => {});
ok((await L.p.$$('#sheet .row:not(.action)')).length === 1, 'the phone signed out, from the laptop');
await closeSheet(L);
// (the phone's page, looked at again on coming back to it)
await Ph.p.waitForTimeout(15500); await Ph.p.evaluate(() => dispatchEvent(new Event('focus')));
await waitText(Ph, /Sign in with a passkey/, 'main', 15000);
ok(/Sign in with a passkey/.test(await text(Ph)) && /signed out/.test(await text(Ph, '#toast')), 'and the phone\'s page notices, without a reload', (await text(Ph, '#toast')));

// ---- 6b. Recent activity ----
await openRow(L, 'Recent activity');
await L.p.waitForSelector('#sheet .day', { timeout: 15000 }).catch(() => {});
const act = await sheetText(L);
ok(/today/i.test(act) && /Signed in/.test(act) && /Password changed/.test(act) && /Passkey added/.test(act) && /Passkey removed/.test(act) && /Signed out 1 unused device/.test(act) && /Email confirmed/.test(act) && /InFlight/.test(act) && /Account/.test(act),
  'recent activity: sign-ins, the new password, passkeys, devices and the email, with the app each was in', act.replace(/ · [^·]*Safari · [^0-9A-Z]*/g, ' ').slice(0, 900));
await settle(L, 500);
await shot(L, '11-activity');
await closeSheet(L);

// ---- 6c. A new email: a link to it, a word to the old; it changes when the link's opened ----
await openRow(L, 'Email');
await shot(L, '12-email');
await L.p.fill('#sheet input[type=email]:not([readonly])', 'rowan@example.com'); await L.p.click('#sheet form .btn');
await waitText(L, /already/, '#sheet .said', 10000);
ok(/already/.test(await text(L, '#sheet .said')), 'the same email: said', await text(L, '#sheet .said'));
await L.p.fill('#sheet input[type=email]:not([readonly])', 'rowan.hale@example.com'); await L.p.click('#sheet form .btn');
await confirmIfAsked(L, PW2);
const nm = await waitMail('rowan.hale@example.com', /Confirm your new email/), om = await waitMail('rowan@example.com', /new email was asked for/);
ok(tokenIn(nm, 'email') && om && /r•+@example\.com/.test(om.text), 'a link to the new email; a word to the old one (the new one half hidden)', `${nm?.subject} | ${om?.subject}`);
ok(user('rowan_h').email === 'rowan@example.com' && /Waiting for rowan\.hale@example\.com/.test(await sheetText(L)), 'nothing changes until it\'s opened', await sheetText(L));
await closeSheet(L);
ok(/Confirm your new email/.test(await text(L, '.banner')), 'the banner says it\'s waiting');
await L.p.evaluate((t) => { location.hash = `#email=${t}`; }, tokenIn(nm, 'email')); await L.p.waitForFunction(() => !location.hash, null, { timeout: 15000 }); await settle(L, 1500); await L.p.waitForSelector('main:not([aria-busy])'); await settle(L);
const changed = await waitMail('rowan@example.com', /email was changed/);
ok(user('rowan_h').email === 'rowan.hale@example.com' && user('rowan_h').email_ok > 0 && /rowan\.hale@example\.com/.test(await text(L, '.hero')) && changed,
  'opened: the email\'s changed (and confirmed), and the old one told', await text(L, '#toast'));

// ---- 6d. Preferences: appearance (here and InFlight) and units (Weather); your data as a file ----
await openRow(L, 'Appearance');
await L.p.click('#sheet .appear:has-text("Light")'); await settle(L, 900);
ok(await L.p.evaluate(() => document.documentElement.dataset.theme) === 'light' && user('rowan_h').appearance === 'light', 'Light: here at once, and kept for the account (InFlight\'s own setting)');
await shot(L, '13-appearance');
await L.p.click('#sheet .appear:has-text("Automatic")'); await settle(L, 600);
ok(await L.p.evaluate(() => !document.documentElement.dataset.theme) && user('rowan_h').appearance === 'auto', 'back to Automatic');
await closeSheet(L);
await openRow(L, 'Units');
await L.p.click('#sheet .seg button:text-is("°F")'); await L.p.click('#sheet .seg button:text-is("km/h")'); await settle(L, 900);
await shot(L, '14-units');
const wxs = JSON.parse(rows(`SELECT data FROM wx_accts WHERE user_id = '${user('rowan_h').id}'`)[0]?.data || '{}').settings || {};
ok(wxs.temp === 'f' && wxs.wind === 'kmh', 'units: kept in Weather\'s record for the account, for every device it\'s on', JSON.stringify(wxs));
await closeSheet(L);
// ---- emails: what each app sends you; InFlight's turned on here ----
const emRow = () => L.p.locator('main .row:has(b:text-is("Emails"))').innerText().then((t) => t.replace(/\s+/g, ' ').trim());
ok(/Emails Security only/.test(await emRow()), 'emails: the account\'s, about signing in, always; InFlight\'s off to start with', await emRow());
await openRow(L, 'Emails');
const em = await sheetText(L);
ok(/Sign-ins and security/.test(em) && /Always on/.test(em) && /Notifications by email/.test(em) && /Weather tells you on your phone/.test(em) && !(await L.p.$eval('#sheet input.switch', (e) => e.disabled)),
  'its page: the account\'s always on, InFlight\'s a switch, Weather\'s on the phone', em);
await L.p.click('#sheet input.switch'); await settle(L, 1000);
await shot(L, '14b-emails');
const ne = rows("SELECT notify_email FROM pg_users WHERE handle = 'rowan_h'")[0]?.notify_email;
ok(ne === 1, 'InFlight\'s emails turned on from here', String(ne));
await closeSheet(L);
ok(/Emails All on/.test(await emRow()), 'and its row says so', await emRow());
ok(/°F · km\/h/.test(await text(L)), 'and said on the page', (await text(L)).match(/Units [^A-Z]*/)?.[0]);
await openRow(L, 'Download your data');
await shot(L, '15-data');
const [dl] = await Promise.all([L.p.waitForEvent('download', { timeout: 30000 }), (async () => { await L.p.click('#sheet .btn:has-text("Download as JSON")'); await confirmIfAsked(L, PW2); })()]);
const data = JSON.parse(readFileSync(await dl.path(), 'utf8'));
ok(data.account?.handle === 'rowan_h' && data.account.email === 'rowan.hale@example.com' && /^data:image\/jpeg;base64,/.test(data.account.photo || '') && Array.isArray(data.inflight?.friends)
  && data.weather?.settings?.temp === 'f' && data.signIn?.passkeys?.length === 1 && /encrypted/.test(data.about) && dl.suggestedFilename() === 'georgefarrowgreen-account-rowan_h.json',
  'your data: the profile and photo, sign-in, InFlight\'s and Weather\'s, as a file (and why the letters aren\'t in it)', dl.suggestedFilename());
await closeSheet(L);

// ---- 7. Signed out: how it looks; signing in with a password (wrong first), and with a passkey ----
await Ph.p.evaluate(() => document.querySelectorAll('.rise').forEach((e) => e.getAnimations().filter((a) => a.animationName === 'rise').forEach((a) => a.finish())));
await shot(Ph, '16-signed-out');
await Ph.p.fill('main input[type=email]', 'rowan.hale@example.com'); await Ph.p.fill('main input[type=password]', 'wrong wrong wrong');
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
await D.p.fill('#f-email', 'rowan.hale@example.com'); await D.p.fill('#f-password', PW2); await D.p.click('[data-form=signin] .btn'); await D.p.waitForSelector('.tabs', { timeout: 40000 });
await account(D);
const bg = await D.p.evaluate(() => getComputedStyle(document.body).color);
ok(bg === 'rgb(13, 16, 32)', 'light mode: dark text on the dawn sky', bg);
await shot(D, '17-light');
await D.p.click('.hero .pill'); await D.p.waitForSelector('#sheet[open] .sheet-body'); await settle(D, 700);
await shot(D, '18-light-sheet');
await closeSheet(D);
await D.p.setViewportSize({ width: 1280, height: 860 }); await settle(D, 400);
await shot(D, '19-wide');

// ---- 9. Deleting the account: typed to confirm; then in 7 days, unless it's kept ----
const delete1 = async () => {
  await L.p.click('.row.action.danger:text-is("Delete account")'); await L.p.waitForSelector('#sheet[open] .sheet-body'); await settle(L, 700);
  await L.p.fill('#sheet .at input', 'rowan_h'); await L.p.click('#sheet form .btn'); await confirmIfAsked(L, PW2);
  await waitText(L, /Sign in with a passkey/, 'main', 30000);
};
await L.p.click('.row.action.danger:text-is("Delete account")'); await L.p.waitForSelector('#sheet[open] .sheet-body'); await settle(L, 700);
ok(await L.p.$eval('#sheet form .btn', (e) => e.disabled), 'Delete waits for the handle to be typed');
await L.p.fill('#sheet .at input', 'rowan'); ok(await L.p.$eval('#sheet form .btn', (e) => e.disabled), 'not with the wrong one');
await L.p.fill('#sheet .at input', 'rowan_h');
await shot(L, '20-delete');
await closeSheet(L);
await delete1();
const del = user('rowan_h');
ok(del && del.delete_at > Date.now() + 6.9 * 86400e3 && /will be deleted on/.test(await text(L, '#toast')) && rows(`SELECT hash FROM pg_sessions WHERE user_id = '${del.id}'`).length === 0,
  'asked: to be deleted in 7 days, and signed out everywhere', await text(L, '#toast'));
const km = await waitMail('rowan.hale@example.com', /will be deleted/);
ok(tokenIn(km, 'keep'), 'an email with a link to keep it', km?.subject);
// InFlight won't sign in to it; this page will, to keep it
await Ph.p.goto(`${CHAT}/`); await Ph.p.waitForSelector('.welcome', { timeout: 20000 }); await Ph.p.click('[data-act=to][data-id=signin]');
await Ph.p.fill('#f-email', 'rowan.hale@example.com'); await Ph.p.fill('#f-password', PW2); await Ph.p.click('[data-form=signin] .btn');
await Ph.p.waitForFunction(() => /being deleted/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
ok(/being deleted/.test(await Ph.p.evaluate(() => document.body.innerText)) && !(await Ph.p.$('.tabs')), 'InFlight won\'t sign in to it, and says where to keep it');
await L.p.fill('main input[type=email]', 'rowan.hale@example.com'); await L.p.fill('main input[type=password]', PW2); await L.p.click('main form .btn');
await waitText(L, /being deleted/);
await settle(L, 600);
ok(/Your account is being deleted/.test(await text(L)) && /Keep my account/.test(await text(L)), 'here: signed in to it, to keep it', (await text(L)).slice(0, 140));
await shot(L, '21-deleting');
await L.p.click('main .btn:has-text("Keep my account")'); await waitText(L, /Sign-in and security/i);
ok(!user('rowan_h').delete_at && /staying/.test(await text(L, '#toast')), 'kept: the account as it was', await text(L, '#toast'));
// asked again, and kept by the email's link, in another browser
await delete1();
const km2 = await waitMail('rowan.hale@example.com', /will be deleted/, 15000);
await D.p.goto('about:blank'); await D.p.goto(`${ACCT}/#keep=${tokenIn(km2, 'keep')}`); await D.p.waitForSelector('main:not([aria-busy])'); await settle(D);
ok(!user('rowan_h').delete_at && /staying/.test(await text(D, '#toast')), 'kept by the email\'s link, signed out', await text(D, '#toast'));
// asked a third time, and the week up: gone
await L.p.fill('main input[type=email]', 'rowan.hale@example.com'); await L.p.fill('main input[type=password]', PW2); await L.p.click('main form .btn');
await waitText(L, /Rowan Ash Hale/);
await delete1();
sql(`UPDATE pg_users SET delete_at = ${Date.now() - 1000} WHERE handle = 'rowan_h'`);
await tick(L);
ok(!user('rowan_h'), 'a week on: deleted, everything');

ok(errs.length === 0, 'no errors on any page', errs.slice(0, 4).join(' | '));
await b.close();
console.log(`FAILS ${fails}`);
process.exit(0);
