// Screenshots of the account page's proposed improvements (before and after), on a local copy of the site with a
// seeded account. Not part of the suite.
//   node ideashots.mjs <state dir> <out dir> <port> <before|after>
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
const [,, S, out, PORT, MODE] = process.argv;
mkdirSync(out, { recursive: true });
const CHAT = `http://chat.gfg.test:${PORT}`, WX = `http://weather.gfg.test:${PORT}`, ACCT = `http://account.gfg.test:${PORT}`, PW = 'a long test password';
const after = MODE === 'after';
const sqlf = (q) => { writeFileSync(`${S}/seed.sql`, q); return execSync(`${S}/wr/node_modules/.bin/wrangler d1 execute bio-db --local --persist-to ${S}/wrstate --file ${S}/seed.sql --json`, { cwd: process.env.APP_ROOT, stdio: 'pipe' }).toString(); };
const rows = (q) => JSON.parse(sqlf(q))[0].results;
const errs = [];

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined,
  args: ['--host-resolver-rules=MAP *.gfg.test 127.0.0.1, MAP gfg.test 127.0.0.1', `--unsafely-treat-insecure-origin-as-secure=${CHAT},${WX},${ACCT}`] });
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
async function browser(name, { scheme = 'dark', desktop = false } = {}) {
  const ctx = await b.newContext(desktop ? { viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2, locale: 'en-GB', colorScheme: scheme }
    : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'en-GB', isMobile: true, hasTouch: true, userAgent: IPHONE, colorScheme: scheme });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${name}: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 40[13]|Cross-Origin-Opener-Policy/.test(m.text())) errs.push(`${name}: ${m.text()}`); });
  const cdp = await ctx.newCDPSession(p);
  // (the share sheet, as Safari on an iPhone has it)
  if (!desktop) await ctx.addInitScript(() => { if (!navigator.share) navigator.share = async () => {}; });
  if (!desktop) {
    await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  }
  return { ctx, p, cdp };
}
const settle = (x, ms = 900) => x.p.waitForTimeout(ms);
const shot = (x, n) => x.p.screenshot({ path: `${out}/${n}.png` });
const account = async (x) => { await x.p.goto('about:blank'); await x.p.goto(`${ACCT}/`); await x.p.waitForSelector('main:not([aria-busy])', { timeout: 20000 }); await settle(x, 1600); };
const openRow = async (x, title) => { await x.p.click(`main .row:has(b:text-is("${title}"))`); await x.p.waitForSelector('#sheet[open] .sheet-body'); await settle(x, 900); };
const closeSheet = async (x) => { await x.p.evaluate(() => document.querySelector('#sheet')?.close()); await settle(x, 500); };
// a finger dragged across a row
async function drag(x, sel, dx) {
  const r = await x.p.$eval(sel, (el) => { const b = el.getBoundingClientRect(); return { x: b.right - 40, y: b.top + b.height / 2 }; });
  const pt = (px) => [{ x: px, y: r.y, id: 1 }];
  await x.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(r.x) });
  for (let i = 1; i <= 10; i++) { await x.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(r.x + (dx * i) / 10) }); await x.p.waitForTimeout(16); }
  await x.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await settle(x, 700);
}

// ---- the account: signed up in InFlight, with a passkey ----
const P = await browser('phone');
await P.p.goto(`${CHAT}/`); await P.p.waitForSelector('.welcome', { timeout: 30000 }); await P.p.click('[data-act=to][data-id=signup]');
await P.p.fill('#f-name', 'Rowan Hale'); await P.p.fill('#f-handle', 'rowan'); await P.p.fill('#f-email', 'rowan@example.com'); await P.p.fill('#f-password', PW);
await P.p.click('[data-form=signup] .btn'); await P.p.waitForSelector('#city', { state: 'attached', timeout: 40000 });
await P.p.selectOption('#city', 'London'); await P.p.waitForSelector('[data-act=onbdone]', { timeout: 20000 });
await P.p.waitForSelector('[data-act=pkadd]'); await P.p.click('[data-act=pkadd]'); await P.p.waitForSelector('.tabs', { timeout: 20000 });

// ---- what it's done: friends, groups, pigeons sent, passport places; Weather's places; devices; recent activity ----
const uid = rows("SELECT id FROM pg_users WHERE handle = 'rowan'")[0].id, t = Date.now(), H = 3600e3, D = 24 * H;
const here = rows(`SELECT label FROM pg_sessions WHERE user_id = '${uid}'`)[0].label;
const wx = { places: [['London', 51.51, -0.13], ['Edinburgh', 55.95, -3.19], ['St Ives', 50.21, -5.48], ['Keswick', 54.6, -3.13], ['Paris', 48.86, 2.35]].map(([name, lat, lon]) => ({ name, lat, lon })),
  settings: { temp: 'c' }, notify: { places: [{ name: 'London', lat: 51.51, lon: -0.13, rain: true, warn: true }, { name: 'St Ives', lat: 50.21, lon: -5.48, rain: false, warn: true }], brief: { name: 'London', lat: 51.51, lon: -0.13 }, briefAt: '07:00' } };
const ev = (ago, kind, app, device, place, detail) => `('${uid}', ${Math.round(t - ago)}, '${kind}', ${app ? `'${app}'` : 'NULL'}, '${device}', ${place ? `'${place}'` : 'NULL'}, ${detail ? `'${detail}'` : 'NULL'})`;
sqlf(`
CREATE TABLE IF NOT EXISTS wx_accts (user_id TEXT PRIMARY KEY, data TEXT NOT NULL, ver INTEGER NOT NULL, updated INTEGER);
UPDATE pg_users SET email_ok = ${t - 20 * D}, pw_checked_at = ${t - 2 * D}, pw_leaked = 0, created_at = ${t - 200 * D} WHERE id = '${uid}';
UPDATE pg_sessions SET place = 'London, United Kingdom', created_at = ${t - 60 * D} WHERE user_id = '${uid}';
INSERT INTO pg_sessions (hash, user_id, created_at, seen_at, label, place) VALUES
  ('${'a'.repeat(64)}', '${uid}', ${t - 90 * D}, ${t - 2 * D}, 'Mac · Safari', 'London, United Kingdom'),
  ('${'b'.repeat(64)}', '${uid}', ${t - 6 * H}, ${t - 3 * H}, 'Windows · Edge', 'Lagos, Nigeria');
WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < 14) INSERT INTO pg_links (a, b, status, created_at) SELECT '${uid}', 'friend' || i, 'ok', ${t} FROM c;
WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < 3) INSERT INTO pg_group_members (group_id, user_id, added_by, joined_at) SELECT 'g' || i, '${uid}', '${uid}', ${t} FROM c;
WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < 148) INSERT INTO pg_msgs (id, sender, recipient, ct, km, sent_at, deliver_at) SELECT 'm' || i, '${uid}', 'friend' || (i % 14 + 1), 'x', 120, ${t - 30 * D} + i * 1000, ${t - 30 * D} + i * 2000 FROM c;
WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < 11) INSERT INTO pg_passport (user_id, place, first_at) SELECT '${uid}', 'place' || i, ${t} FROM c;
INSERT INTO wx_accts (user_id, data, ver, updated) VALUES ('${uid}', '${JSON.stringify(wx)}', 1, ${t});
DELETE FROM pg_events WHERE user_id = '${uid}';
INSERT INTO pg_events (user_id, at, kind, app, device, place, detail) VALUES
  ${ev(2 * 60e3, 'signin', 'Account', here, 'London, United Kingdom', 'Passkey')},
  ${ev(3 * H, 'signin', 'InFlight', 'Windows · Edge', 'Lagos, Nigeria', 'Password')},
  ${ev(5 * H, 'signin', 'Weather', here, 'London, United Kingdom', 'Passkey')},
  ${ev(1 * D + 2 * H, 'passkey-add', 'Account', 'Mac · Safari', 'London, United Kingdom', 'iCloud Keychain')},
  ${ev(2 * D, 'signin', 'Weather', 'Mac · Safari', 'London, United Kingdom', 'Passkey')},
  ${ev(4 * D, 'export', 'Account', here, 'London, United Kingdom')},
  ${ev(20 * D, 'email-confirmed', 'Account', here, 'London, United Kingdom')};
`);
// (a second passkey, as if added on the Mac)
const pk = rows(`SELECT * FROM pg_passkeys WHERE user_id = '${uid}'`)[0];
sqlf(`UPDATE pg_passkeys SET label = 'iPhone', provider = 'iCloud Keychain' WHERE id = '${pk.id}';
INSERT INTO pg_passkeys (id, user_id, public_key, alg, created_at, label, provider) VALUES ('mac-passkey-demo', '${uid}', '${pk.public_key}', ${pk.alg}, ${t - 1 * D - 2 * H}, 'MacBook Air', 'iCloud Keychain');`);

// ---- a photo: a sunset over hills, drawn ----
await account(P);
const jpeg = Buffer.from((await P.p.evaluate(() => {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 512); sky.addColorStop(0, '#2b2a6b'); sky.addColorStop(0.45, '#d9637a'); sky.addColorStop(0.7, '#f7b267'); g.fillStyle = sky; g.fillRect(0, 0, 512, 512);
  g.fillStyle = '#ffe2a8'; g.beginPath(); g.arc(300, 300, 62, 0, Math.PI * 2); g.fill();
  for (const [y, col, amp] of [[330, '#7a3f6b', 40], [380, '#4f2a5e', 30], [430, '#2a1d45', 24]]) {
    g.fillStyle = col; g.beginPath(); g.moveTo(0, 512); for (let x = 0; x <= 512; x += 8) g.lineTo(x, y - amp * Math.sin(x / 70 + y)); g.lineTo(512, 512); g.fill();
  }
  return c.toDataURL('image/jpeg', 0.9);
})).split(',')[1], 'base64');
await P.p.click('.hero .pill:has-text("Edit profile")'); await P.p.waitForSelector('#sheet[open]');
await P.p.setInputFiles('#sheet input[type=file]', { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: jpeg });
await P.p.waitForFunction(() => !!document.querySelector('main .hero .avatar img'), null, { timeout: 15000 }).catch(() => {});
await closeSheet(P);

// ---- the page ----
await account(P);
await shot(P, '01-home');
await P.p.screenshot({ path: `${out}/02-home-full.png`, fullPage: true });
if (after) {
  // the check-up opened (all done: folded to a line until tapped)
  await P.p.click('main .checkup.folded'); await settle(P, 700);
  await P.p.$eval('main .checkup', (el) => el.scrollIntoView({ block: 'center' })); await settle(P, 400);
  await shot(P, '03-checkup-open');
  await P.p.evaluate(() => scrollTo(0, 0));
  // your code
  await account(P);
  await P.p.click('.hero .pill:has-text("Your code")'); await P.p.waitForSelector('#sheet .qr svg', { timeout: 10000 }); await settle(P, 900);
  await shot(P, '04-your-code'); await closeSheet(P);
  // an app's sheet, each
  await P.p.$eval('main .apps', (el) => el.scrollIntoView({ block: 'center' })); await settle(P, 500);
  await shot(P, '05-apps-tiles');
  await P.p.click('main button.app:has(b:text-is("InFlight"))'); await P.p.waitForSelector('#sheet .stats'); await settle(P, 900);
  await shot(P, '06-app-inflight'); await closeSheet(P);
  await P.p.click('main button.app:has(b:text-is("Weather"))'); await P.p.waitForSelector('#sheet .app-head'); await settle(P, 900);
  await shot(P, '07-app-weather'); await closeSheet(P);
}
// recent activity
await account(P);
await openRow(P, 'Recent activity'); await P.p.waitForSelector('#sheet .day', { timeout: 10000 }); await settle(P, 600);
await shot(P, '08-activity');
if (after) {
  await P.p.click('#sheet .mini:text-is("Not you?")'); await P.p.waitForSelector('#sheet .steps'); await settle(P, 900);
  await shot(P, '09-not-you');
}
await closeSheet(P);
// devices and passkeys (after: a row slid to show what it does)
await account(P);
await openRow(P, 'Signed-in devices'); await shot(P, '10-devices');
if (after) { await drag(P, '#sheet .swipe:nth-child(2) > .row', -130); await shot(P, '11-devices-swipe'); }
await closeSheet(P);
await account(P);
await openRow(P, 'Passkeys'); await shot(P, '12-passkeys');
if (after) { await drag(P, '#sheet .swipe:nth-child(2) > .row', -130); await shot(P, '13-passkeys-swipe'); }
await closeSheet(P);

// ---- a wide screen ----
const W = await browser('desktop', { desktop: true });
await W.ctx.addCookies(await P.ctx.cookies(ACCT));
await account(W); await shot(W, '14-desktop');
const L = await browser('light', { scheme: 'light', desktop: true });
await L.ctx.addCookies(await P.ctx.cookies(ACCT));
await account(L); await shot(L, '15-desktop-light');

// ---- signed in with a password, no passkey: a word about one ----
if (after) {
  sqlf(`DELETE FROM pg_passkeys WHERE user_id = '${uid}';`);
  await account(P);
  await P.p.click('main .row.action:text-is("Sign out")'); await P.p.waitForSelector('main input[type=password]', { timeout: 15000 }); await settle(P, 600);
  await P.p.fill('main input[type=email]', 'rowan@example.com'); await P.p.fill('main input[type=password]', PW); await P.p.click('main form .btn');
  await P.p.waitForSelector('#sheet .nudge', { timeout: 20000 }).catch(() => {}); await settle(P, 900);
  await shot(P, '16-nudge');
}
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no page errors');
await b.close();
