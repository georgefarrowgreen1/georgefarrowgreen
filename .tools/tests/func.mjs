// InFlight end-to-end checks against the local stack (wrangler pages dev on 8788).
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { makeAccount, signInInFlight, accountUrl, pastOffer } from './join.mjs';
const [,, S] = process.argv;
const URL = process.env.APPURL || 'http://localhost:8788/pigeon/';
const sql0 = (q) => execSync(`${S}/wr/node_modules/.bin/wrangler d1 execute bio-db --local --persist-to ${S}/wrstate --command "${q}"`, { cwd: process.env.APP_ROOT, stdio: 'pipe' }).toString();
// (again, a moment later, if the local database is busy with the server's own writes: as lib.mjs's)
const sql = (q) => { for (let i = 0; ; i++) { try { return sql0(q); } catch (e) { if (i > 5 || !/SQLITE_BUSY/.test(String(e.stdout) + String(e.stderr) + e.message)) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400); } } };
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const errs = []; let fails = 0;
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${extra ? '  — ' + extra : ''}`); if (!c) fails++; };
async function phone(name, w = 390, h = 844, geo) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36', hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    permissions: geo ? ['geolocation'] : [], geolocation: geo });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${name}: ${e}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(`${name}: ${m.text()}`); });
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true } });
  await p.goto(URL);
  return { p, ctx, name };
}
const txt = async (ph, s) => (await ph.p.locator(s).first().innerText()).replace(/\s+/g, ' ');
const ferr = (ph) => ph.p.waitForSelector('.ferr:not([hidden])', { timeout: 20000 }).then(() => txt(ph, '.ferr:not([hidden])'));
const tab = (ph, id) => ph.p.click(`[data-act=tab][data-id=${id}]`);

// ---- George: an account (made on the account's page), signed in to InFlight: real location, passkey ----
const A = await phone('george', 390, 844, { latitude: 51.5072, longitude: -0.1276 });
await A.p.waitForSelector('.welcome');
ok(!(await A.p.$('[data-id=signup], [data-form=signup]')) && /Create your account/.test(await A.p.innerText('.welcome')), 'InFlight makes no accounts itself: new ones are made on the account’s page');
await makeAccount(A.p, accountUrl(URL), { name: 'George Farrow-Green', handle: 'george', email: 'george@example.com', password: 'feathers and ink 42' });
await signInInFlight(A.p, URL, { email: 'george@example.com', password: 'feathers and ink 42' });
await A.p.waitForSelector('#city', { state: 'attached', timeout: 20000 });
await A.p.click('[data-act=locate]');
ok(await A.p.waitForFunction(() => /London/.test(document.querySelector('.auth')?.innerText || ''), null, { timeout: 10000 }).then(() => true, () => false), 'phone location resolves to London');
await A.p.waitForSelector('[data-act=pkadd]', { timeout: 10000 });   // (on to the passkey by itself)
await A.p.click('[data-act=pkadd]'); await A.p.waitForSelector('.tabs', { timeout: 20000 });
ok(true, 'George signs in to his new account and saves a passkey');

// ---- Mira: the account's page checks what's typed (a short password, a taken handle), then InFlight and a city ----
const B = await phone('mira', 375, 667);
const ACCT = accountUrl(URL), aerr = async () => (await B.p.waitForSelector('main .said.bad', { timeout: 20000 }).then((e) => e.innerText(), () => ''));
await B.p.goto(`${ACCT}#join`); await B.p.waitForSelector('main input[name=name]', { timeout: 20000 });
await B.p.fill('main input[name=name]', 'Mira Okafor'); await B.p.click('main .signin form .btn');
await B.p.waitForSelector('main input[name=handle]', { state: 'visible' }); await B.p.fill('main input[name=handle]', 'george'); await B.p.click('main .signin form .btn');
const taken = await B.p.waitForSelector('main .hint.handle.bad', { timeout: 20000 }).then((e) => e.innerText(), () => '');
ok(/taken/i.test(taken) && await B.p.isVisible('main input[name=handle]'), 'taken handle refused, before going on', taken);
await B.p.fill('main input[name=handle]', 'mira'); await B.p.click('main .signin form .btn');
await B.p.waitForSelector('main input[name=email]', { state: 'visible' }); await B.p.fill('main input[name=email]', 'mira@example.com'); await B.p.click('main .signin form .btn');
await B.p.waitForSelector('main input[name=password]', { state: 'visible' }); await B.p.fill('main input[name=password]', 'shortpw'); await B.p.click('main .signin form .btn');
ok(/10/.test(await aerr()), 'short password refused', await B.p.innerText('main .said'));
await B.p.fill('main input[name=password]', 'new york pigeons 7'); await B.p.click('main .signin form .btn');
await B.p.waitForSelector('main .hero', { timeout: 40000 });
await signInInFlight(B.p, URL, { email: 'mira@example.com', password: 'new york pigeons 7' });
await B.p.waitForSelector('#city', { state: 'attached', timeout: 20000 });
await B.p.selectOption('#city', 'New York'); await B.p.waitForSelector('[data-act=onbdone]', { timeout: 20000 });
await B.p.waitForTimeout(400); if (await B.p.$('[data-act=pkadd]')) await B.p.click('[data-act=onbdone]');
await B.p.waitForSelector('.tabs');

// ---- friends ----
await tab(A, 'friends'); await A.p.click('.nb-right [data-act=addfriend]'); await A.p.fill('#add-h', 'mira');
await A.p.click('[data-act=submit][data-id=add-form]'); await A.p.waitForSelector('.addrow .btn.sent, .toast', { timeout: 10000 });
ok(/Request sent|joined/i.test(await A.p.locator('.sheet, .toast').first().innerText()), 'friend request sent');
await B.p.reload(); await B.p.waitForSelector('.tabs'); await tab(B, 'friends'); await B.p.click('[data-act=requests]');
await B.p.click('[data-act=accept]'); await B.p.waitForTimeout(600); await B.p.click('.sheet [data-act=close].nbtn');
ok(sql("SELECT status FROM pg_links").includes('"ok"'), 'Mira accepts');

// ---- George writes with a photo ----
await A.p.reload(); await A.p.waitForSelector('.tabs'); await tab(A, 'messages');
await A.p.click('[data-act=newmsg]'); await A.p.click('.sheet [data-act=open]'); await A.p.waitForSelector('.chatnav');
const jpg = await A.p.evaluate(async () => { const c = document.createElement('canvas'); c.width = 1200; c.height = 900; const g = c.getContext('2d'); g.fillStyle = '#e8a76b'; g.fillRect(0, 0, 1200, 900); g.fillStyle = '#5c6b4a'; g.fillRect(0, 600, 1200, 300); const bl = await new Promise((r) => c.toBlob(r, 'image/jpeg', .9)); return Array.from(new Uint8Array(await bl.arrayBuffer())); });
await A.p.setInputFiles('#file-lib', { name: 'view.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpg) });
await A.p.waitForSelector('.attach img'); await A.p.fill('#msg', 'The view from my window this morning. Fancy trying pigeon post?');
await A.p.click('.send'); await A.p.waitForSelector('.msgs .b.up', { timeout: 10000 });
const row = sql("SELECT ct, photo, km, deliver_at - sent_at AS ms FROM pg_msgs");
ok(!row.includes('Fancy trying'), 'server has no message text');
const hrs = Number(/"ms": (\d+)/.exec(row)[1]) / 3600e3, km = Number(/"km": ([\d.]+)/.exec(row)[1]);
// (a standard pigeon rests an hour on each island it hops across the Atlantic by; three days' flying at most)
const legsRow = /"legs": ("(?:[^"\\]|\\.)*"|null)/.exec(sql("SELECT legs FROM pg_msgs"))[1], rests = (JSON.parse(JSON.parse(legsRow) || "[]").filter((l) => l[3] === 'i').length) / 2;
const legsAll = JSON.parse(JSON.parse(legsRow) || "[]"), sails = legsAll.some((l) => l[3] === 'b');   // (a standard pigeon may hop on a ship from Southampton)
ok(sails ? km > 300 && km < 6600 && hrs > 24 && hrs < 240 : km > 5400 && km < 6600 && Math.abs(hrs - Math.min(72, km / 80) - rests) < 0.2, sails ? 'flies to the port and sails the rest' : 'flight time is distance ÷ 80 km/h (plus its rests)', `${km.toFixed(0)} km, ${hrs.toFixed(1)} h, ${rests} rests`);
const r2plain = execSync(`grep -rl "JFIF" ${S}/wrstate/v3/r2 2>/dev/null | head -1 || true`).toString();
const r2any = execSync(`find ${S}/wrstate -path '*r2*' -type f -size +10k | head -1`).toString();
ok(!!r2any.trim() && !r2plain.trim(), 'R2 holds the photo, encrypted');

// ---- Mira: in flight, map, then landing ----
await B.p.reload(); await B.p.waitForSelector('.tabs'); await tab(B, 'messages'); await B.p.click('.mrow'); await B.p.waitForSelector('.fly', { timeout: 10000 });
ok(!(await txt(B, '.msgs')).includes('view from my window'), 'Mira can’t read it while it flies');
await B.p.click('.fly'); await B.p.waitForSelector('canvas.map'); await B.p.waitForTimeout(500);
await B.p.screenshot({ path: process.argv[3] + '/prezoom.png' }); await B.p.evaluate(() => localStorage.setItem('inflight-mapcard', 'peek')); await B.p.click('.sheet [data-act=close].nbtn'); await B.p.waitForTimeout(500); await B.p.click('.fly'); await B.p.waitForSelector('canvas.map'); await B.p.waitForTimeout(600);   // (the card folded, so the zoom buttons show)
await B.p.click('[data-act=mapzoom][data-id=in]'); await B.p.waitForTimeout(300); await B.p.screenshot({ path: process.argv[3] + '/postzoom.png' });
ok(await B.p.isVisible('.mapctl .fitbtn'), 'map zooms (route button appears)');
await B.p.click('[data-act=mapzoom][data-id=fit]'); await B.p.waitForTimeout(800);   // (it glides back)
ok(!(await B.p.isVisible('.mapctl .fitbtn')), 'map returns to the whole route');
await B.p.click('.sheet [data-act=close].nbtn');
sql("UPDATE pg_msgs SET sent_at = sent_at - 300000000, deliver_at = (strftime('%s','now') * 1000) - 2000, expires_at = (strftime('%s','now') * 1000) - 2000 + 86400000");
await B.p.reload(); await B.p.waitForSelector('.tabs'); await B.p.click('.mrow');
await B.p.waitForSelector('.b.once.live', { timeout: 20000 });
ok((await txt(B, '.msgs')).includes('view from my window') && (await txt(B, '.b.once.live')) === 'View photo', 'after landing, Mira decrypts the text, and the photo waits to be viewed once');
await B.p.fill('#msg', 'Gorgeous! Count me in.'); await B.p.click('.send'); await B.p.waitForTimeout(1200);
const pill = await txt(B, '.compose .kind'); await B.p.click('.compose .kind'); await B.p.waitForSelector('.sheet .kinds');
const std = await txt(B, '.sheet [data-act=pigeon][data-id=standard]'), stdOff = await B.p.locator('.sheet [data-act=pigeon][data-id=standard]').isDisabled();
await B.p.click('.sheet header [data-act=close]'); await B.p.waitForTimeout(400);
ok(pill === 'Swift' && stdOff && /on its way|turn first/.test(std), 'second message: not your turn, so a swift pigeon', `${pill} | ${std}`);
await B.p.fill('#msg', 'And one more by swift pigeon'); await B.p.click('.send'); await B.p.waitForTimeout(1200);
for (let i = 0; i < 20 && !sql("SELECT swift FROM pg_msgs WHERE swift = 1").includes('"swift": 1'); i++) await B.p.waitForTimeout(400);
ok(sql("SELECT swift FROM pg_msgs WHERE swift = 1").includes('"swift": 1'), 'swift pigeon used');

// ---- safety numbers match ----
const digits = async (ph) => { await ph.p.click('[data-act=chatmenu]'); await ph.p.click('.poplayer [data-act=safety]'); await ph.p.waitForSelector('.digits'); const d = await txt(ph, '.digits'); await ph.p.click('.sheet [data-act=close].nbtn'); return d; };
await A.p.reload(); await A.p.waitForSelector('.tabs'); await A.p.click('.mrow'); await A.p.waitForSelector('.chatnav');
const dA = await digits(A), dB = await digits(B);
ok(dA === dB && dA.replace(/\D/g, '').length === 60, 'safety numbers match (60 digits)');

// ---- photo expiry ----
sql("UPDATE pg_msgs SET expires_at = (strftime('%s','now') * 1000) - 1000 WHERE photo = 1");
await B.p.reload(); await B.p.waitForSelector('.tabs'); await B.p.click('.mrow'); await B.p.waitForSelector('.b.once:has-text("expired")', { timeout: 20000 }).catch(() => {});
ok((await txt(B, '.b.once')).includes('Photo expired'), 'a photo not opened in time is gone for Mira');
await fetch(new globalThis.URL(URL).origin + '/api/pigeon/notify-tick', { method: 'POST', headers: { Authorization: 'Bearer tick-test-secret' } });   // (the minute tick deletes it)
ok(/"photo": 2/.test(sql("SELECT photo FROM pg_msgs WHERE photo > 0")), 'server marks the photo deleted');

// ---- George: sign out, and back in on the account's page (where InFlight signs in; a passkey there opening the
// messages by itself is acctpkmsg.mjs's, as here the account's page has an address of its own for passkeys) ----
await A.p.click('.chatnav .back'); await tab(A, 'account'); await A.p.locator('#screen > main.view [data-act=signout]').scrollIntoViewIfNeeded(); await A.p.click('#screen > main.view [data-act=signout]'); await A.p.click('.asheet [data-act=signoutgo]');
await A.p.waitForSelector('.welcome');
await signInInFlight(A.p, URL, { email: 'george@example.com', password: 'feathers and ink 42' }); await A.p.waitForSelector('.tabs', { timeout: 20000 });
await A.p.click('.mrow'); await A.p.waitForTimeout(1500);
ok((await txt(A, '.msgs')).includes('Fancy trying'), 'signing back in restores the history');

// ---- Mira on a new phone, with her password ----
const C = await phone('mira-new', 320, 568);
await C.p.waitForSelector('.welcome [data-act=acctsignin]', { state: 'visible', timeout: 30000 }); await C.p.click('.welcome [data-act=acctsignin]');
await C.p.waitForSelector('main .signin input[name=email]', { timeout: 20000 });
await C.p.fill('main input[name=email]', 'mira@example.com'); await C.p.fill('main input[name=password]', 'wrong password!!'); await C.p.click('main .signin form .btn');
const wrong = await C.p.waitForSelector('main .said.bad', { timeout: 20000 }).then((e) => e.innerText(), () => '');
ok(wrong.length > 0 && /account\./.test(C.p.url()), 'wrong password refused, on the account’s page', wrong);
await C.p.fill('main input[name=password]', 'new york pigeons 7'); await C.p.click('main .signin form .btn');
ok(await pastOffer(C.p), 'signed in with a password on a phone that can make a passkey: one offered on the way back (Not now)');
await C.p.waitForSelector('.tabs', { timeout: 20000 });
await C.p.click('.mrow'); await C.p.waitForTimeout(1500);
ok((await txt(C, '.msgs')).includes('Gorgeous'), 'new phone reads the history');
await C.p.reload(); await C.p.waitForSelector('.tabs', { timeout: 15000 });
ok(true, 'session survives a reload');

// ---- updates: a refresh loads fresh files; an open copy notices a new version ----
const html = await (await fetch(URL)).text();
const v = /inflight-version" content="(\w+)"/.exec(html)?.[1], appv = /app\.js\?v=(\w+)/.exec(html)?.[1];
ok(!!v && !!appv, 'page carries version fingerprints', `${v} / app ${appv}`);
const h = await fetch(URL); ok(h.headers.get('cache-control') === 'no-store', 'page is never cached');
const a1 = await fetch(`${URL}app.js?v=${appv}`); ok(/immutable/.test(a1.headers.get('cache-control')), 'fingerprinted app.js cached for good');
ok((await a1.text()).includes('./crypto.js?v='), 'app.js imports fingerprinted modules');
ok(/^no-(cache|store)$/.test((await fetch(`${URL}app.js?v=old`)).headers.get('cache-control')), 'stale fingerprint is not cached');
ok(!!h.headers.get('content-security-policy')?.includes("script-src 'self'"), 'CSP still applied');
// pretend a deploy happened: serve this phone a different version and see it reload
await C.p.route(URL.replace(/^http:\/\/[^/]+/, '**'), async (route) => { const r = await route.fetch(); const body = (await r.text()).replace(/inflight-version" content="\w+"/, 'inflight-version" content="newer000000"'); route.fulfill({ response: r, body }); }, { times: 1 });
let reloaded = false; C.p.once('framenavigated', () => { reloaded = true; });
await C.p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
await C.p.waitForTimeout(2500);
ok(reloaded, 'an open copy reloads itself when a new version is live');
// mid-message, it asks instead of reloading
await C.p.waitForSelector('.tabs', { timeout: 15000 }); await C.p.click('.mrow'); await C.p.waitForSelector('#msg'); await C.p.fill('#msg', 'half-written');
await C.p.route(URL.replace(/^http:\/\/[^/]+/, '**'), async (route) => { const r = await route.fetch(); const body = (await r.text()).replace(/inflight-version" content="\w+"/, 'inflight-version" content="newer000001"'); route.fulfill({ response: r, body }); }, { times: 1 });
reloaded = false; C.p.once('framenavigated', () => { reloaded = true; });
await C.p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await C.p.waitForTimeout(2500);
ok(!reloaded && (await C.p.isVisible('.toast [data-act=toast]')), 'mid-message it offers Update instead', await txt(C, '.toast').catch(() => ''));
await C.p.click('.toast [data-act=toast]'); await C.p.waitForSelector('.tabs', { timeout: 15000 });
ok(true, 'tapping Update reloads');

console.log('errors', errs);
console.log('FAILS', fails);
await b.close();
