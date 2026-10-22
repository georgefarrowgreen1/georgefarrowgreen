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

// ---- 1. Account: a card as Weather's (photo, name, "@handle · georgefarrowgreen.com"); Location, Sign Out and Delete
// Account below ----
await A.p.click('[data-act=tab][data-id=account]'); await A.p.waitForSelector('#screen > main.view .me-cell'); await A.p.waitForTimeout(600);
const card = await text(A.p, '#screen > main.view .me-cell');
ok(/Rowan Hale/.test(card) && /@rowan · georgefarrowgreen\.com/.test(card) && !/Edit Profile/.test(card), 'Account: your photo, name and "@handle · georgefarrowgreen.com", as in Weather', card);
ok(!!(await A.p.$('#screen > main.view [data-act=profile]')) && /London/.test(await text(A.p, '#screen > main.view [data-act=profile]')) && !!(await A.p.$('#screen > main.view [data-act=signout]')) && !!(await A.p.$('#screen > main.view [data-act=delask]')),
  'Location its own row (where you are), and Sign Out and Delete Account at the foot');
await A.p.click('#screen > main.view [data-act=profile]'); await A.p.waitForSelector('.sheet [data-act=locate]'); await A.p.waitForTimeout(500);
ok(/Location/.test(await text(A.p, '.sheet header')) && !(await A.p.$('.sheet input#f-name, .sheet .avedit, .sheet [data-act=signout]')), 'Location: just where you are (no name, handle or photo to edit)');
await A.p.click('.sheet header [data-act=close]'); await A.p.waitForTimeout(500);
await shot(A.p, '01-account');

// ---- 2. the card: the account's page, signed in ----
// (this browser has no sign-in for the site: the page opens in a fresh one, as from a Home Screen app)
await A.ctx.clearCookies();
const [pop] = await Promise.all([A.ctx.waitForEvent('page'), A.p.click('#screen > main.view .me-cell')]);
await pop.waitForSelector('main:not([aria-busy])', { timeout: 20000 }); await pop.waitForTimeout(900);
ok(pop.url() === `${ACCT}/`, 'the account\'s page, the code already gone from the address', pop.url());
ok(/Rowan Hale/.test(await text(pop)) && !!(await pop.$('.backapp')), 'signed in as you, with the way back to InFlight');
const dev = rows(`SELECT COUNT(*) AS n FROM pg_sessions s JOIN pg_users u ON u.id = s.user_id WHERE u.handle = 'rowan'`)[0].n;
ok(dev === 2, 'a sign-in of its own (seen in Signed-in devices)', String(dev));
ok(!(await pop.evaluate(async () => (await (await fetch('/api/account/me')).json()).fresh)), 'which doesn\'t count as showing it\'s you (a password change still asks)');
await shot(pop, '02-account-page');
// Edit profile, there
await pop.click('.hero .pill'); await pop.waitForSelector('#sheet[open] .sheet-body'); await pop.waitForTimeout(600);
await pop.fill('#sheet input[autocomplete=name]', 'Rowan Ash Hale'); await pop.click('#sheet .done'); await pop.waitForTimeout(1200);
ok(rows(`SELECT name FROM pg_users WHERE handle = 'rowan'`)[0].name === 'Rowan Ash Hale', 'the new name is the account\'s');
// back to InFlight
const closed = pop.waitForEvent('close', { timeout: 8000 }).then(() => true, () => false);
// (the page can close before the click's done with it)
await pop.click('.backapp').catch((e) => { if (!/closed/.test(e.message)) throw e; });
ok(await closed, 'InFlight: the page goes, back to the app');
await A.p.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await A.p.waitForTimeout(2500);
ok(/Rowan Ash Hale/.test(await text(A.p, '#screen > main.view .me-cell')), 'and InFlight shows the new name', await text(A.p, '#screen > main.view .me-cell'));
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
await A.ctx.clearCookies();
await A.p.click('#screen > main.view [data-act=securitysheet]'); await A.p.waitForSelector('.sheet #to-account');
const [pop2] = await Promise.all([A.ctx.waitForEvent('page'), A.p.click('.sheet #to-account')]);
await pop2.waitForSelector('main:not([aria-busy])', { timeout: 20000 }); await pop2.waitForTimeout(800);
ok(/Rowan Ash Hale/.test(await text(pop2)) && !(await pop2.$('#sheet[open]')), 'Privacy & Security\'s Your Account: the page, signed in too');


ok(errs.length === 0, 'no errors on any page', errs.slice(0, 4).join(' | '));
await b.close();
console.log(`FAILS ${fails}`);
process.exit(0);
