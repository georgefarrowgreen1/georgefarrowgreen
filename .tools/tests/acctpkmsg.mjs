// A passkey added on the account's page opens InFlight's messages too, as one added in InFlight does: the device's PRF
// secret for it locks its own copy of the key (made on the page from the password-locked one, the password asked once),
// so signing in to InFlight with it opens the messages with no password. One added before that can be set up from its
// own page. The apps' addresses are stood in for by ifl.test (the home page's by gfg.test), as in acctlink.mjs.
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { joinInFlight } from './join.mjs';
const [,, S, out] = process.argv;
const CHAT = 'http://chat.ifl.test:8788', ACCT = 'http://account.ifl.test:8788', PW = 'a long test password';
const sql0 = (q) => execSync(`${S}/wr/node_modules/.bin/wrangler d1 execute bio-db --local --persist-to ${S}/wrstate --command "${q}"`, { cwd: process.env.APP_ROOT, stdio: 'pipe' }).toString();
const sql = (q) => { for (let i = 0; ; i++) { try { return sql0(q); } catch (e) { if (i > 5 || !/SQLITE_BUSY/.test(String(e.stdout) + String(e.stderr) + e.message)) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400); } } };
const rows = (q) => { const o = sql(q), m = o.match(/"results": (\[[\s\S]*?\])\s*,\s*"success"/); return m ? JSON.parse(m[1]) : []; };
let fails = 0; const errs = [];
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${extra ? '  — ' + extra : ''}`); if (!c) fails++; };
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined,
  args: ['--host-resolver-rules=MAP *.gfg.test 127.0.0.1, MAP gfg.test 127.0.0.1, MAP *.ifl.test 127.0.0.1, MAP ifl.test 127.0.0.1', `--unsafely-treat-insecure-origin-as-secure=${CHAT},${ACCT}`] });
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'en-GB', isMobile: true, hasTouch: true, userAgent: IPHONE, colorScheme: 'dark' });
const p = await ctx.newPage();
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d|Cross-Origin-Opener-Policy header has been ignored/.test(m.text())) errs.push(m.text()); });
const cdp = await ctx.newCDPSession(p); await cdp.send('WebAuthn.enable');
await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true } });
const shot = (n) => p.screenshot({ path: `${out}/${n}.png` });
const sheetText = () => p.evaluate(() => document.querySelector('#sheet')?.innerText.replace(/\s+/g, ' ').trim() || '');

// an account, with InFlight's key, and no passkey
await joinInFlight(p, `${CHAT}/`, { name: 'Ivy Moss', handle: 'ivy', email: 'ivy@example.com', password: PW, city: 'London' });
const uid = rows(`SELECT id FROM pg_users WHERE handle = 'ivy'`)[0].id;

// 1. on the account's page: a passkey added, then (the password once) its own copy of the key
await p.goto(`${ACCT}/`); await p.waitForSelector('main:not([aria-busy])', { timeout: 20000 }); await p.waitForTimeout(2200);
if (await p.$('#sheet[open] .nudge')) { await p.click('#sheet .x').catch(() => {}); await p.waitForTimeout(600); }
await p.click('main .row:has(b:text-is("Sign-in and security"))'); await p.waitForSelector('#sheet[open]'); await p.waitForTimeout(500);
await p.click('#sheet .row:has(b:text-is("Passkeys"))'); await p.waitForSelector('#sheet .btn:has-text("Add a passkey")'); await p.waitForTimeout(400);
await p.click('#sheet .btn:has-text("Add a passkey")');
if (await p.waitForSelector('#sheet .confirm-card input[type=password]', { timeout: 4000 }).catch(() => null)) {
  await p.fill('#sheet .confirm-card input[type=password]', PW); await p.click('#sheet .confirm-card .btn[type=submit]');
}
await p.waitForSelector('#sheet h2:text-is("Passkey added")', { timeout: 20000 }).catch(() => {});
await p.waitForTimeout(500);
ok(/locked with a key only your devices hold/.test(await sheetText()), 'added: then a word on the messages, and the password once', (await sheetText()).slice(0, 160));
await shot('01-keycopy');
await p.fill('#sheet form input[type=password]', 'not my password'); await p.click('#sheet form .btn[type=submit]'); await p.waitForTimeout(1500);
ok(/isn’t right/.test(await sheetText()) && rows(`SELECT 1 FROM pg_passkeys WHERE user_id = '${uid}' AND vault IS NOT NULL`).length === 0, 'a wrong password: said, and nothing made');
await p.fill('#sheet form input[type=password]', PW); await p.click('#sheet form .btn[type=submit]');
await p.waitForFunction(() => /opens your InFlight messages too/.test(document.querySelector('#toast')?.textContent || ''), null, { timeout: 30000 }).catch(() => {});
const pk = rows(`SELECT id, vault IS NOT NULL AS v FROM pg_passkeys WHERE user_id = '${uid}'`);
ok(pk.length === 1 && pk[0].v === 1, 'the right one: the passkey has its own copy of the key', JSON.stringify(pk));
await p.click(`#sheet .row:has(b:text-is("${await p.$eval('#sheet .row b', (e) => e.textContent).catch(() => 'iPhone')}"))`).catch(() => {});
await p.waitForTimeout(700);
ok(/InFlight messages\s*Opens them/.test(await sheetText()), 'its page says it opens the messages', (await sheetText()).slice(0, 200));
await shot('02-passkey');

// 2. InFlight, signed out, then in with the passkey alone: the messages open, no password asked
await p.goto(`${CHAT}/`); await p.waitForSelector('.tabs', { timeout: 30000 });
await p.evaluate(() => new Promise((res) => { const r = indexedDB.deleteDatabase('inflight'); r.onsuccess = r.onerror = r.onblocked = () => res(); }));
await p.evaluate(() => fetch('/api/pigeon/signout', { method: 'POST' }).catch(() => {}));
await ctx.clearCookies();
await p.goto(`${CHAT}/`); await p.waitForSelector('.welcome', { timeout: 30000 });
// (signing in is on the account's page: its passkey, which hands InFlight what opens the passkey's copy of the key)
await p.click('.welcome [data-act=acctsignin]'); await p.waitForURL((u) => u.hostname.startsWith('account.'), { timeout: 20000 });
await p.waitForSelector('main .btn:has-text("Sign in with a passkey")', { timeout: 20000 }); await p.click('main .btn:has-text("Sign in with a passkey")');
const where = await Promise.race([p.waitForURL((u) => u.hostname.startsWith('chat.'), { timeout: 30000 }).then(() => p.waitForSelector('.tabs', { timeout: 30000 })).then(() => 'app'),
  p.waitForFunction(() => /One more step/.test(document.querySelector('main')?.innerText || ''), null, { timeout: 30000 }).then(() => 'password')]).catch(() => 'nothing');
ok(where === 'app' && /chat\./.test(p.url()), 'signed in to InFlight with the passkey, on the account’s page: the messages open, no password asked', where);
await shot('03-inflight');

// 3. a passkey from before, with no copy: set up from its own page
sql(`UPDATE pg_passkeys SET vault = NULL WHERE user_id = '${uid}'`);
await p.goto(`${ACCT}/`); await p.waitForSelector('main:not([aria-busy])', { timeout: 20000 }); await p.waitForTimeout(1500);
if (await p.$('#sheet[open]')) { await p.keyboard.press('Escape'); await p.waitForTimeout(500); }
await p.click('main .row:has(b:text-is("Sign-in and security"))'); await p.waitForSelector('#sheet[open]'); await p.waitForTimeout(500);
await p.click('#sheet .row:has(b:text-is("Passkeys"))'); await p.waitForTimeout(600);
await p.click('#sheet .group .row >> nth=0'); await p.waitForTimeout(700);
ok(/InFlight messages\s*Needs your password/.test(await sheetText()), 'one with no copy says so', (await sheetText()).slice(0, 200));
await p.click('#sheet .row.action:has-text("Use it for InFlight messages")');
await p.waitForSelector('#sheet form input[type=password]', { timeout: 20000 }).catch(() => {});
await p.fill('#sheet form input[type=password]', PW); await p.click('#sheet form .btn[type=submit]');
await p.waitForFunction(() => /opens your InFlight messages too/.test(document.querySelector('#toast')?.textContent || ''), null, { timeout: 30000 }).catch(() => {});
ok(rows(`SELECT 1 FROM pg_passkeys WHERE user_id = '${uid}' AND vault IS NOT NULL`).length === 1, 'set up from its page: it has its copy again');

console.log('errs', errs);
console.log(`FAILS ${fails + errs.length}`);
await b.close();
process.exit(0);
