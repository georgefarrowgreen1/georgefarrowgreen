// InFlight's profile is the account's: My Profile shows your photo, name and handle, and Edit Profile opens the account's
// page signed in as you (a code good once, for a minute, handed over in the address's #), straight to editing them, in
// whatever browser it opens in; Done takes you back, where InFlight shows the change. The code can't be used twice, or
// late, or anywhere but the account's page. The site's addresses are stood in for by gfg.test, as in acctpage.mjs.
import { chromium } from 'playwright';
import { execSync } from 'child_process';
const [,, S, out] = process.argv;
const CHAT = 'http://chat.gfg.test:8788', ACCT = 'http://account.gfg.test:8788', PW = 'a long test password';
const sql0 = (q) => execSync(`${S}/wr/node_modules/.bin/wrangler d1 execute bio-db --local --persist-to ${S}/wrstate --command "${q}"`, { cwd: process.env.APP_ROOT, stdio: 'pipe' }).toString();
const sql = (q) => { for (let i = 0; ; i++) { try { return sql0(q); } catch (e) { if (i > 5 || !/SQLITE_BUSY/.test(String(e.stdout) + String(e.stderr) + e.message)) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400); } } };
const rows = (q) => { const o = sql(q), m = o.match(/"results": (\[[\s\S]*?\])\s*,\s*"success"/); return m ? JSON.parse(m[1]) : []; };
let fails = 0; const errs = [];
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${extra ? '  — ' + extra : ''}`); if (!c) fails++; };
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined,
  args: ['--host-resolver-rules=MAP *.gfg.test 127.0.0.1, MAP gfg.test 127.0.0.1', `--unsafely-treat-insecure-origin-as-secure=${CHAT},${ACCT}`] });
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
async function browser(name, scheme = 'dark') {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'en-GB', isMobile: true, hasTouch: true, userAgent: IPHONE, colorScheme: scheme });
  const watch = (p) => { p.on('pageerror', (e) => errs.push(`${name}: ${e.message}`)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 40[0-3]|Cross-Origin-Opener-Policy header has been ignored/.test(m.text())) errs.push(`${name}: ${m.text()}`); }); };
  ctx.on('page', watch);
  const p = await ctx.newPage();
  return { ctx, p, name };
}
const shot = (p, n) => p.screenshot({ path: `${out}/${n}.png` });
const text = (p, sel = 'main') => p.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ').trim() || '', sel);

// ---- InFlight, signed up (a Home Screen app has its own cookies: the browser it opens links in knows nothing of it) ----
const A = await browser('app');
await A.p.goto(`${CHAT}/`); await A.p.waitForSelector('.welcome', { timeout: 20000 }); await A.p.click('[data-act=to][data-id=signup]');
await A.p.fill('#f-name', 'Rowan Hale'); await A.p.fill('#f-handle', 'rowan'); await A.p.fill('#f-email', 'rowan@example.com'); await A.p.fill('#f-password', PW);
await A.p.click('[data-form=signup] .btn'); await A.p.waitForSelector('#city', { state: 'attached', timeout: 30000 });
await A.p.selectOption('#city', 'London'); await A.p.waitForSelector('[data-act=onbdone]', { timeout: 20000 }); await A.p.click('[data-act=onbdone]'); await A.p.waitForSelector('.tabs');
const token = (await A.p.evaluate(() => new Promise((res) => { const r = indexedDB.open('inflight'); r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('session'); g.onsuccess = () => res(g.result); }; }))).token;

// ---- 1. My Profile: your details, and the way to change them (no fields of its own) ----
await A.p.click('[data-act=tab][data-id=account]'); await A.p.click('#screen > main.view [data-act=profile]'); await A.p.waitForSelector('.sheet .mehead'); await A.p.waitForTimeout(700);
const prof = await text(A.p, '.sheet');
ok(/Rowan Hale/.test(prof) && /@rowan/.test(prof) && /Edit Profile/.test(prof) && /Location/.test(prof) && /Sign Out/.test(prof), 'My Profile: photo, name and handle as the account has them, Edit Profile, and the rest as it was', prof.slice(0, 200));
ok(!(await A.p.$('.sheet input#f-name, .sheet input#f-handle, .sheet .avedit, .sheet form#profile-form')), 'no name, handle or photo to edit here');
await shot(A.p, '01-my-profile');

// ---- 2. Edit Profile: the account's page, signed in, straight to editing ----
// (this browser has no sign-in for the site: the page opens in a fresh one, as from a Home Screen app)
await A.ctx.clearCookies();
const [pop] = await Promise.all([A.ctx.waitForEvent('page'), A.p.click('.sheet [data-act=accountedit]')]);
await pop.waitForSelector('#sheet[open] .sheet-body', { timeout: 20000 }).catch(async () => { await shot(pop, 'zz-pop'); console.log('POPURL', pop.url(), await text(pop, 'body'), await text(pop, '#toast'), JSON.stringify(errs)); }); await pop.waitForTimeout(800);
ok(pop.url() === `${ACCT}/`, 'the account\'s page, the code already gone from the address', pop.url());
const sheet = await text(pop, '#sheet');
ok(/Edit profile/.test(sheet) && await pop.$eval('#sheet input[autocomplete=name]', (e) => e.value) === 'Rowan Hale', 'signed in as you, at Edit profile', sheet.slice(0, 120));
ok(!!(await pop.$('.backapp')) && (await pop.locator('.backapp').innerText()).includes('InFlight'), 'with the way back to InFlight');
const dev = rows(`SELECT COUNT(*) AS n FROM pg_sessions s JOIN pg_users u ON u.id = s.user_id WHERE u.handle = 'rowan'`)[0].n;
ok(dev === 2, 'a sign-in of its own (seen in Signed-in devices)', String(dev));
ok(!(await pop.evaluate(async () => (await (await fetch('/api/account/me')).json()).fresh)), 'which doesn\'t count as showing it\'s you (a password change still asks)');
await shot(pop, '02-edit-profile');
// a new name, Done: saved, and back to InFlight
await pop.fill('#sheet input[autocomplete=name]', 'Rowan Ash Hale');
const closed = pop.waitForEvent('close', { timeout: 8000 }).then(() => true, () => false);
await pop.click('#sheet .done');
ok(await closed, 'Done: saved, and the page goes, back to InFlight');
ok(rows(`SELECT name FROM pg_users WHERE handle = 'rowan'`)[0].name === 'Rowan Ash Hale', 'the new name is the account\'s');
// InFlight, shown again, has it
await A.p.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await A.p.waitForTimeout(2500);
ok(/Rowan Ash Hale/.test(await text(A.p, '.sheet')), 'and InFlight shows it when you\'re back', (await text(A.p, '.sheet')).slice(0, 80));
await shot(A.p, '03-back');

// ---- 3. the code: once, for a minute, and only at the account's page ----
// (a code from InFlight's own API, as the app asks for one)
const c1 = await A.p.evaluate(async (t) => (await (await fetch('/api/pigeon/account-link', { method: 'POST', headers: { Authorization: 'Bearer ' + t } })).json()).code, token);
ok(/^[A-Za-z0-9_-]{20,}$/.test(c1 || ''), 'InFlight asks for a code', String(c1).slice(0, 6) + '…');
const F1 = await browser('fresh'); await F1.p.goto(`${ACCT}/#handoff=${c1}&open=profile&from=inflight`); await F1.p.waitForSelector('#sheet[open]', { timeout: 20000 }).catch(() => {});
ok(/Edit profile/.test(await text(F1.p, '#sheet')), 'a fresh browser: signed in by it');
const F2 = await browser('fresh2'); await F2.p.goto(`${ACCT}/#handoff=${c1}&open=profile&from=inflight`); await F2.p.waitForSelector('main:not([aria-busy])', { timeout: 20000 }); await F2.p.waitForTimeout(900);
ok(/Sign in/.test(await text(F2.p)) && /run out/.test(await text(F2.p, '#toast')), 'the same code again: refused, and the page asks you to sign in', await text(F2.p, '#toast'));
const c2 = await A.p.evaluate(async (t) => (await (await fetch('/api/pigeon/account-link', { method: 'POST', headers: { Authorization: 'Bearer ' + t } })).json()).code, token);
sql(`UPDATE pg_handoff SET expires = ${Date.now() - 1000}`);
await F2.p.goto(`${ACCT}/#handoff=${c2}`); await F2.p.waitForSelector('main:not([aria-busy])'); await F2.p.waitForTimeout(700);
ok(/Sign in/.test(await text(F2.p)), 'a code over a minute old: refused');
const c3 = await A.p.evaluate(async (t) => (await (await fetch('/api/pigeon/account-link', { method: 'POST', headers: { Authorization: 'Bearer ' + t } })).json()).code, token);
const other = await A.p.evaluate(async (c) => { const r = await fetch('/api/account/handoff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: c }) }); return r.status; }, c3);
ok(other === 404, 'only the account\'s page takes one (not InFlight\'s address, say)', String(other));
const noAuth = await A.p.evaluate(async () => (await fetch('/api/pigeon/account-link', { method: 'POST' })).status);
ok(noAuth === 401, 'and only a signed-in InFlight can ask for one', String(noAuth));

// ---- 4. Privacy & Security's Your Account: the account's page, signed in too ----
await A.p.click('.sheet header [data-act=close]').catch(() => {}); await A.p.waitForTimeout(500);
await A.ctx.clearCookies();
await A.p.click('#screen > main.view [data-act=securitysheet]'); await A.p.waitForSelector('.sheet #to-account');
const [pop2] = await Promise.all([A.ctx.waitForEvent('page'), A.p.click('.sheet #to-account')]);
await pop2.waitForSelector('main:not([aria-busy])', { timeout: 20000 }); await pop2.waitForTimeout(800);
ok(/Rowan Ash Hale/.test(await text(pop2)) && !(await pop2.$('#sheet[open]')), 'Your Account: the page, signed in (nothing opened over it)');
await shot(pop2, '04-account');

ok(errs.length === 0, 'no errors on any page', errs.slice(0, 4).join(' | '));
await b.close();
console.log(`FAILS ${fails}`);
process.exit(0);
