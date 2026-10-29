// Chat's settings that are the account's, on the account's page: Settings, in InFlite's menu from your photo, opens
// them (the page signed in by the code Chat hands over, open at Chat's settings, with the way back); the menu keeps
// what's each phone's own too. On the page, Chat's card has them beside
// Open. Each change is saved by the app's own rules (GET/PATCH /api/account/inflight, DELETE inflight/block), from the
// page's own address only, and Chat shows it once it's synced. The apps' addresses are stood in for by ifl.test (the home page's by gfg.test).
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { joinChat, ifPage, acctOpen } from './join.mjs';
const [,, S, out] = process.argv;
const CHAT = 'http://chat.ifl.test:8788', ACCT = 'http://account.ifl.test:8788', PW = 'a long test password';
const sql0 = (q) => execSync(`${S}/wr/node_modules/.bin/wrangler d1 execute bio-db --local --persist-to ${S}/wrstate --command "${q}"`, { cwd: process.env.APP_ROOT, stdio: 'pipe' }).toString();
const sql = (q) => { for (let i = 0; ; i++) { try { return sql0(q); } catch (e) { if (i > 5 || !/SQLITE_BUSY/.test(String(e.stdout) + String(e.stderr) + e.message)) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400); } } };
const rows = (q) => { const o = sql(q), m = o.match(/"results": (\[[\s\S]*?\])\s*,\s*"success"/); return m ? JSON.parse(m[1]) : []; };
let fails = 0; const errs = [];
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${extra ? '  — ' + extra : ''}`); if (!c) fails++; };
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined,
  args: ['--host-resolver-rules=MAP *.gfg.test 127.0.0.1, MAP gfg.test 127.0.0.1, MAP *.ifl.test 127.0.0.1, MAP ifl.test 127.0.0.1', `--unsafely-treat-insecure-origin-as-secure=${CHAT},${ACCT}`] });
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
async function browser(name) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'en-GB', timezoneId: 'Europe/London', isMobile: true, hasTouch: true, userAgent: ANDROID, colorScheme: 'dark' });
  const watch = (p) => { p.on('pageerror', (e) => errs.push(`${name}: ${e.message}`)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 40[0-3]|Cross-Origin-Opener-Policy/.test(m.text())) errs.push(`${name}: ${m.text()}`); }); };
  ctx.on('page', watch);
  const p = await ctx.newPage();
  return { ctx, p, name };
}
const shot = (p, n) => p.screenshot({ path: `${out}/${n}.png` });
const text = (p, sel) => p.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ').trim() || '', sel);
const row = (k) => rows(`SELECT notify_prefs, notify_email, no_receipts, hide_online, hide_tracker, loc_approx FROM pg_users WHERE handle = '${k}'`)[0];
const prefs = (k) => JSON.parse(row(k)?.notify_prefs || '{}');

// ---- two accounts: Sam, and Rowan, who's blocked Sam ----
const Z = await browser('sam');
await joinChat(Z.p, `${CHAT}/`, { name: 'Sam Taylor', handle: 'sam', email: 'sam@example.com', password: PW, city: 'Paris' });
await Z.ctx.close();
const A = await browser('rowan');
await joinChat(A.p, `${CHAT}/`, { name: 'Rowan Hale', handle: 'rowan', email: 'rowan@example.com', password: PW, city: 'London' });
const [r0] = rows("SELECT id FROM pg_users WHERE handle = 'rowan'"), [z0] = rows("SELECT id FROM pg_users WHERE handle = 'sam'");
sql(`INSERT INTO pg_links (a, b, status, created_at) VALUES ('${r0.id}', '${z0.id}', 'blocked', ${Date.now()})`);
sql("UPDATE pg_users SET email_ok = 1 WHERE handle = 'rowan'");
await A.p.reload(); await A.p.waitForSelector('.tabs', { timeout: 20000 });

// ---- 1. Chat's settings: Settings, in InFlite's menu, to the account's page; this phone's own in the menu too ----
await A.p.click('[data-act=tab][data-id=account]'); await A.p.waitForSelector('#screen > main.view [data-act=profile]'); await A.p.waitForTimeout(600);
ok(!(await A.p.$('#screen > main.view [data-act=ifsettings]')), 'no Chat Settings row in the Account tab: it\'s Settings, in the menu from your photo');
ok(!(await A.p.$('#screen > main.view [data-act=notifysheet]')) && !(await A.p.$('#screen > main.view [data-act=securitysheet]')) && !(await A.p.$('#screen > main.view [data-act=appearancesheet]')),
  'no Notifications, Privacy & Security or Appearance rows: they’re the account’s');
const phone = await text(A.p, '#screen > main.view');
await A.p.click('.chead .ifh-me'); await A.p.waitForSelector('.ifm-pop.open');
const mine = await A.p.$$eval('.ifm-pop [data-k]', (els) => els.map((e) => e.dataset.k).join());
await A.p.keyboard.press('Escape'); await A.p.waitForSelector('.ifm-layer', { state: 'detached' });
ok(!/This Phone/.test(phone) && !(await A.p.$('#screen > main.view [data-act=pushtoggle]')) && /Location/.test(phone) && /notify/.test(mine) && !/pushtoggle|pushtest/.test(mine) && /haptics/.test(mine) && /encryptionsheet/.test(mine),
  'Location stays; this phone\'s own (whether notifications are on here, haptics and encryption, and the lock where passkeys work) are in InFlite\'s menu, from your photo', mine);
await A.p.evaluate(() => document.querySelector('#screen > main.view [data-act=profile]').scrollIntoView({ block: 'center' })); await A.p.waitForTimeout(400);
await shot(A.p, '01-inflight-settings');

// ---- 2. Settings, in the menu: the account's page in a window of its own, signed in by Chat's code, open at Chat's settings ----
await A.ctx.clearCookies();       // (as a Home Screen app's browser knows nothing of it)
await A.p.click('.chead .ifh-me'); await A.p.waitForSelector('.ifm-pop.open');
const [W] = await Promise.all([A.ctx.waitForEvent('page'), A.p.click('.ifm-pop [data-k=settings]')]);
const FIRST = '#sheet[open] .row[data-k="Who sees what"]';
const go = await W.waitForSelector(`main .welcome .btn, ${FIRST}`, { timeout: 20000 });
if (await go.evaluate((e) => e.matches('.btn'))) await go.click();
await W.waitForSelector(FIRST, { timeout: 20000 }); await W.waitForTimeout(700);
const sheet = await text(W, '#sheet');
ok(/^Chat/.test(await text(W, '#sheet .sheet-head h2')) && /Kept with your account/.test(sheet) && /Notifications\s*10 of 11/.test(sheet) && !/Email me/i.test(sheet) && /Who sees what\s*All shared/.test(sheet) && /Blocked\s*1/.test(sheet) && /Open Chat/.test(sheet) && !(await W.$('#if-landed')),
  'the page opens at Chat’s settings: notifications (on their own page), email, who sees what, and one blocked, and the way into the app', sheet.replace(/\s+/g, ' ').slice(0, 260));
ok(!!(await W.$('#sheet .toapp')) && /Chat/.test(await text(W, '#sheet .toapp')), 'with the way back to Chat');
await shot(W, '02-account-sheet');
// (its notifications: Chat's folder on the account's Notifications page)
const folder = async () => { await W.locator('#sheet .row', { hasText: 'Notifications' }).first().click(); await W.waitForSelector('#sheet #nt-c-landed', { timeout: 10000 }); await W.waitForTimeout(600); };
await folder();
ok(await W.isChecked('#nt-c-landed') && !(await W.isChecked('#nt-c-names')) && /Pigeons/i.test(await text(W, '#sheet')) && /Friends/i.test(await text(W, '#sheet')) && /How they look/i.test(await text(W, '#sheet')),
  'Notifications: Chat\'s folder on the account\'s Notifications page: pigeons, friends, the lock screen, its emails');
ok(!(await W.isDisabled('#nt-c-email')), 'email, its address confirmed, can be turned on');
await shot(W, '02b-notifications');

// ---- 3. changes, each saved by Chat's own rules ----
const idFor = (k) => (k === 'quiet' ? 'nt-quiet' : ['receipts', 'shareTracker', 'approxLocation', 'showOnline', 'shareNews'].includes(k) ? 'if-' + k : 'nt-c-' + k);
const flip = async (k) => { const id = idFor(k); await W.locator('#' + id).scrollIntoViewIfNeeded(); await W.click('#' + id); await W.waitForFunction((id) => !document.getElementById(id)?.disabled, id); await W.waitForTimeout(250); };
const back = async () => { await W.click('#sheet .sheet-head .back'); await W.waitForSelector(FIRST); await W.waitForTimeout(500); };
await flip('reactions');
ok(prefs('rowan').reactions === false, 'Reactions off: saved to the account', JSON.stringify(prefs('rowan')));
await flip('email');
ok(row('rowan').notify_email === 1, 'Email Me Too: on');
// (Quiet Hours, every app's: on the Notifications page itself)
await acctOpen(W, 'notify');
await flip('quiet'); await W.waitForSelector('#nt-from');
await W.selectOption('#nt-from', '21'); await W.waitForFunction(() => !document.getElementById('nt-from').disabled); await W.waitForTimeout(250);
await W.selectOption('#nt-to', '6'); await W.waitForFunction(() => !document.getElementById('nt-to').disabled); await W.waitForTimeout(250);
const p1 = prefs('rowan');
ok(p1.quiet === true && p1.quietFrom === 21 && p1.quietTo === 6 && p1.tz === 'Europe/London', 'Quiet hours, 21:00 to 06:00, in the phone’s time zone', JSON.stringify(p1));
ok(/21:00 to 06:00, every app/.test(await text(W, '#sheet')), 'and said, in its row');
await acctOpen(W, 'inflight'); await W.waitForSelector(FIRST);
ok(/Notifications\s*Quiet 21:00–06:00\s*9 of 11/.test(await text(W, '#sheet')), 'and on the first page: 9 of 11, quiet 21:00–06:00', (await text(W, '#sheet')).replace(/\s+/g, ' ').slice(0, 200));
await ifPage(W, 'Who sees what');
await flip('receipts'); await flip('shareTracker'); await flip('approxLocation');
const r1 = row('rowan');
ok(r1.no_receipts === 1 && r1.hide_tracker === 1 && r1.loc_approx === 1 && r1.hide_online === 0, 'who sees what: read receipts and the tracker off, location approximate, online still shown', JSON.stringify(r1));
await shot(W, '03-changed');
await back();
ok(/Who sees what\s*2 of 5/.test(await text(W, '#sheet')), 'and on the first page: 2 of 5 shared');
// Sam, unblocked (Unblock, then Unblock? to be sure)
await ifPage(W, 'Blocked');
await W.click('#sheet .row[data-id] button'); await W.waitForTimeout(400); await W.click('#sheet .row[data-id] button');
await W.waitForFunction(() => !document.querySelector('#sheet .row[data-id]'), null, { timeout: 10000 }).catch(() => {});
ok(!rows(`SELECT 1 FROM pg_links WHERE a = '${r0.id}' AND status = 'blocked'`).length && /No one/.test(await text(W, '#sheet')), 'Sam unblocked: gone from the list, and on the server');
await shot(W, '04-unblocked');
await back();

// ---- 4. the page's own rules: only from its address, and only what the app would take ----
const api = (path, method, body, headers = {}) => W.evaluate(async ([path, method, body, headers]) => { const r = await fetch('/api/account/' + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body && JSON.stringify(body) }); return [r.status, await r.json().catch(() => null)]; }, [path, method, body, headers]);
let [st, j] = await api('inflight', 'PATCH', { notify: { quietFrom: 99, landed: 'yes' } });
ok(st === 200 && j.notify.quietFrom === 21 && j.notify.landed === true, 'an hour out of range is ignored, and anything given is taken as on or off, as in the app', `${st} ${JSON.stringify(j?.notify)}`);
[st] = await api('inflight', 'PATCH', { privacy: { receipts: 'no' } });
ok(st === 400, 'a privacy switch that isn’t on or off is refused', String(st));
[st] = await api('inflight', 'PATCH', { email: 1 });
ok(st === 400, 'so is an email setting that isn’t', String(st));
const cross = await A.p.evaluate(async (u) => { try { return (await fetch(u + '/api/account/inflight', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{"privacy":{"receipts":true}}' })).status; } catch (_) { return 'blocked'; } }, ACCT);
ok(cross !== 200 && row('rowan').no_receipts === 1, 'nothing changes from Chat’s own address (or anywhere but the page)', String(cross));
const anonCtx = await b.newContext(), anon = (await (await anonCtx.newPage()).goto(ACCT + '/api/account/inflight')).status(); await anonCtx.close();
ok(anon === 401, 'and nothing to see without the account', String(anon));

// ---- 5. the page itself: Chat's card has them beside Open ----
await W.click('#sheet .sheet-head .x'); await W.waitForTimeout(900);
ok(!!(await W.$('[data-sec="apps"] .app-set')) && (await W.getAttribute('[data-sec="apps"] .app-set', 'aria-label')) === 'Chat settings', 'Chat’s card: its settings beside Open');
await W.evaluate(() => document.querySelector('[data-sec="apps"]').scrollIntoView({ block: 'center' })); await W.waitForTimeout(500);
await shot(W, '05-card');
await W.click('[data-sec="apps"] .app-set'); await W.waitForSelector(FIRST, { timeout: 10000 }); await W.waitForTimeout(600);
ok(/Quiet 21:00–06:00/.test(await text(W, '#sheet')) && /Who sees what\s*2 of 5/.test(await text(W, '#sheet')) && /Blocked\s*No one/.test(await text(W, '#sheet')), 'opened from there: as they were left');
await W.close();

// ---- 6. back in Chat ----
await A.p.reload(); await A.p.waitForSelector('.tabs', { timeout: 20000 }); await A.p.click('[data-act=tab][data-id=account]'); await A.p.waitForTimeout(800);
await shot(A.p, '06-inflight-after');

// (the browser's word for the try from Chat's address, refused: that's step 4's point, not an error)
const real = errs.filter((e) => !(/\/api\/account\/inflight/.test(e) && /Content Security Policy/.test(e)));
ok(real.length === 0, 'no errors on any page', real.slice(0, 4).join(' | '));
console.log(`FAILS ${fails}`);
await b.close();
