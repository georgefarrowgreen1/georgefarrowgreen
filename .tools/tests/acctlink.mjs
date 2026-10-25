// InFlight's profile is the account's: My Profile shows your photo, name and handle, and Edit Profile opens the account's
// page signed in as you (a code good once, for a minute, handed over in the address's #), straight to editing them, in
// whatever browser it opens in; Done takes you back, where InFlight shows the change. The code can't be used twice, or
// late, or anywhere but the account's page. The site's addresses are stood in for by gfg.test, as in acctpage.mjs.
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { joinInFlight, makeAccount } from './join.mjs';
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

// ---- InFlight, signed in to a new account (a Home Screen app has its own cookies: the browser it opens links in knows
// nothing of it) ----
const A = await browser('app');
await joinInFlight(A.p, `${CHAT}/`, { name: 'Rowan Hale', handle: 'rowan', email: 'rowan@example.com', password: PW, city: 'London' });
const token = (await A.p.evaluate(() => new Promise((res) => { const r = indexedDB.open('inflight'); r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('session'); g.onsuccess = () => res(g.result); }; }))).token;

// ---- 1. Account: a card as Weather's (photo, name, "@handle"); Location, Sign Out and Delete
// Account below ----
await A.p.click('[data-act=tab][data-id=account]'); await A.p.waitForSelector('#screen > main.view .me-cell'); await A.p.waitForTimeout(600);
const card = await text(A.p, '#screen > main.view .me-cell');
ok(/Rowan Hale/.test(card) && /@rowan\b/.test(card) && !/georgefarrowgreen/.test(card) && !/Edit Profile/.test(card), 'Account: your photo, name and "@handle", as in Weather', card);
ok(!!(await A.p.$('#screen > main.view [data-act=profile]')) && /London/.test(await text(A.p, '#screen > main.view [data-act=profile]')) && !!(await A.p.$('#screen > main.view [data-act=signout]')) && !(await A.p.$('#screen > main.view [data-act=delask]')),
  'Location its own row (where you are), and Sign Out at the foot (deleting the account is on its own page)');
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
// (who it's for, said yes to first: a page elsewhere could send a browser here with a code for an account of its own)
const confirmSays = await text(pop);
ok(/Rowan Hale/.test(confirmSays) && /@rowan, from InFlight\. Carry on as this account in this browser\?/.test(confirmSays) && /Continue as Rowan/.test(confirmSays) && /Not you\? Sign in/.test(confirmSays)
  && rows(`SELECT COUNT(*) AS n FROM pg_sessions s JOIN pg_users u ON u.id = s.user_id WHERE u.handle = 'rowan'`)[0].n === 1, 'first, who it\'s for: Continue as Rowan, or Not you', confirmSays);
await shot(pop, '02a-continue-as');
await pop.click('main .signin .btn'); await pop.waitForSelector('main .hero', { timeout: 20000 }); await pop.waitForTimeout(900);
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
const F1 = await browser('fresh'); await F1.p.goto(`${ACCT}/#handoff=${c1}&open=profile&from=inflight`);
await F1.p.waitForSelector('main .signin .btn', { timeout: 20000 });
ok(rows(`SELECT COUNT(*) AS n FROM pg_handoff`)[0].n === 1, 'looked at, the code is still there: nothing\'s signed in until it\'s said yes to');
await F1.p.click('main .signin .btn'); await F1.p.waitForSelector('#sheet[open]', { timeout: 20000 }).catch(() => {});
ok(/Edit profile/.test(await text(F1.p, '#sheet')), 'a fresh browser: signed in by it, once said yes to');
const F2 = await browser('fresh2'); await F2.p.goto(`${ACCT}/#handoff=${c1}&open=profile&from=inflight`); await F2.p.waitForSelector('main:not([aria-busy])', { timeout: 20000 }); await F2.p.waitForTimeout(900);
ok(/Sign in/.test(await text(F2.p)) && /run out/.test(await text(F2.p, '#toast')), 'the same code again: refused, and the page asks you to sign in', await text(F2.p, '#toast'));
const c2 = await A.p.evaluate(async (t) => (await (await fetch('/api/pigeon/account-link', { method: 'POST', headers: { Authorization: 'Bearer ' + t } })).json()).code, token);
sql(`UPDATE pg_handoff SET expires = ${Date.now() - 1000}`);
await F2.p.goto(`${ACCT}/#handoff=${c2}`); await F2.p.waitForSelector('main:not([aria-busy])'); await F2.p.waitForTimeout(700);
ok(/Sign in/.test(await text(F2.p)), 'a code over a minute old: refused');
const c3 = await A.p.evaluate(async (t) => (await (await fetch('/api/pigeon/account-link', { method: 'POST', headers: { Authorization: 'Bearer ' + t } })).json()).code, token);
const other = await A.p.evaluate(async (c) => { const r = await fetch('/api/account/handoff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: c }) }); return r.status; }, c3);
ok(other === 404, 'only the account\'s page takes one (not InFlight\'s address, say)', String(other));
// a browser signed in to another account: not swapped for this one (asked, or sent straight to the server)
const M = await browser('mira');
await makeAccount(M.p, `${ACCT}/`, { name: 'Mira Okafor', handle: 'mira', email: 'mira@example.com', password: PW });
await M.p.goto('about:blank'); await M.p.goto(`${ACCT}/#handoff=${c3}&open=inflight`); await M.p.waitForSelector('main .hero', { timeout: 20000 }); await M.p.waitForTimeout(700);
const mSays = await text(M.p, '.hero'), mToast = await text(M.p, '#toast'), mSheet = !!(await M.p.$('#sheet[open]'));
ok(/Mira Okafor/.test(mSays) && /signed in here as @mira\. Sign out first to use @rowan here/.test(mToast) && !mSheet,
  'opened where another account\'s signed in: still that one, and said why (and what it was to open, not opened for this one)', `${mSays.slice(0, 40)} | ${mToast} | sheet ${mSheet}`);
const swap = await M.p.evaluate(async (c) => { const r = await fetch('/api/account/handoff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: c }) }); return [r.status, (await (await fetch('/api/account/me')).json()).handle]; }, c3);
ok(swap[0] === 409 && swap[1] === 'mira', 'and the server won\'t swap it either', swap.join());
// (a code that can't be checked, the one run out above: whose it was isn't known, so nothing's opened for this one)
await M.p.goto('about:blank'); await M.p.goto(`${ACCT}/#handoff=${c2}&open=inflight`); await M.p.waitForSelector('main .hero', { timeout: 20000 }); await M.p.waitForTimeout(700);
const gToast = await text(M.p, '#toast'), gSheet = !!(await M.p.$('#sheet[open]'));
ok(/run out/.test(gToast) && !gSheet, 'and a code that can\'t be checked: said, and what it was to open not opened for whoever\'s signed in here', `${gToast} | sheet ${gSheet}`);
const noAuth = await A.p.evaluate(async () => (await fetch('/api/pigeon/account-link', { method: 'POST' })).status);
ok(noAuth === 401, 'and only a signed-in InFlight can ask for one', String(noAuth));

// ---- 4. InFlight Settings: the account's page, signed in too, open at InFlight's settings ----
await A.ctx.clearCookies();
const [pop2] = await Promise.all([A.ctx.waitForEvent('page'), A.p.click('#screen > main.view [data-act=ifsettings]')]);
// (no cookie here now: the page asks, Continue as Rowan, then opens at InFlight's settings)
const go2 = await pop2.waitForSelector('main .welcome .btn, #sheet[open] #if-landed', { timeout: 20000 });
if (await go2.evaluate((e) => e.matches('.btn'))) await go2.click();
await pop2.waitForSelector('#sheet[open] #if-landed', { timeout: 20000 }).catch(() => {}); await pop2.waitForTimeout(800);
ok(/Rowan Ash Hale/.test(await text(pop2)) && !!(await pop2.$('#sheet[open] #if-landed')) && !!(await pop2.$('#sheet[open] .toapp')), 'InFlight Settings: the page, signed in too, at InFlight’s settings, with the way back');


ok(errs.length === 0, 'no errors on any page', errs.slice(0, 4).join(' | '));
await b.close();
console.log(`FAILS ${fails}`);
process.exit(0);
