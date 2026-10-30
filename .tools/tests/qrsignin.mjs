// Signing in on a computer with your phone (functions/_qrsign.js; account/app.js qrCard, qrView, scanView). In browsers:
// a Mac's sign-in page shows a QR code (one that reads, InFlite's mark and all) and a phone's doesn't; the phone,
// signed in, opens it and is asked first whether it opened it itself (the Mac shown nothing till then), sees which
// computer's asking, taps the number the Mac shows, and the Mac asks "Continue as Sam Lee?" before it's signed in; the
// same from an app (Markets, handed back); a wrong number refused on both; That's not me on the Mac; a computer in
// another country, its number typed; a phone signed out asked to sign in first; the account page's own scanner (a
// stand-in camera held up to the Mac) reading it, the camera then off, and a phone that hasn't shown it's you lately
// asked to first. And the routes themselves, as an attacker would try them: only from the page's own address; a wrong
// poll word, or none, gets nothing; only a phone that's just shown it's you, and isn't one kept to the account's page,
// can look or answer; a code another account has looked at isn't yours; a wrong number ends it; nothing's signed in
// till the Mac takes it, and only once; one run out is refused; the Mac's sign-in is its own, said to the account's
// email, and not one that's just shown it's you (Chat's key isn't handed over on it).
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import http from 'node:http';
import { joinChat, makeAccount } from './join.mjs';
const [,, S, out] = process.argv;
const CHAT = 'http://chat.ifl.test:8788', MKT = 'http://finance.ifl.test:8788', ACCT = 'http://account.ifl.test:8788';
const sql0 = (q) => execSync(`${S}/wr/node_modules/.bin/wrangler d1 execute bio-db --local --persist-to ${S}/wrstate --command "${q}"`, { cwd: process.env.APP_ROOT, stdio: 'pipe' }).toString();
const settle = (p, ms = 600) => p.waitForTimeout(ms);
let fails = 0; const errs = [], pages = [];
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${extra ? '  — ' + extra : ''}`); if (!c) fails++; };
process.on('uncaughtException', async (e) => { console.log(`FAIL  ${e.message.split('\n')[0]}`); console.log(String(e.stack).split('\n').slice(0, 6).join('\n')); for (const x of pages) await x.screenshot({ path: `${out}/failed-${pages.indexOf(x)}.png` }).catch(() => {}); console.log(`FAILS ${fails + 1}`); process.exit(1); });
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const HOSTS = '--host-resolver-rules=MAP *.ifl.test 127.0.0.1, MAP ifl.test 127.0.0.1';
const mails = () => { try { return readFileSync(`${S}/mailbox.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((m) => m.body || m); } catch (_) { return []; } };
// (the account's routes asked as anyone could: from this machine, with whatever origin and cookie)
const api = (path, { body, cookie, origin = ACCT, ua = MAC } = {}) => new Promise((done) => {
  const data = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: '127.0.0.1', port: 8788, path: `/api/account/${path}`, method: data ? 'POST' : 'GET', agent: false,
    headers: { Host: 'account.ifl.test:8788', 'User-Agent': ua, ...(origin ? { Origin: origin } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(data ? { 'Content-Type': 'application/json' } : {}) } },
  (res) => { let t = ''; res.on('data', (x) => (t += x)); res.on('end', () => { let j = null; try { j = JSON.parse(t); } catch (_) {} done({ status: res.statusCode, j, set: res.headers['set-cookie'] || [] }); }); });
  if (data) r.write(data); r.end();
});
const PASSWORD = 'a long test password';
const sessionsOf = (handle) => `(SELECT id FROM pg_users WHERE handle = '${handle}')`;
const cookieOf = async (ctx) => (await ctx.cookies(ACCT)).map((c) => `${c.name}=${c.value}`).join('; ');

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: [HOSTS, `--unsafely-treat-insecure-origin-as-secure=${CHAT},${MKT},${ACCT}`] });
const watch = (pg) => { pages.push(pg); pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d/.test(m.text())) errs.push(m.text()); }); return pg; };
const phoneCtx = (o = {}) => b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPHONE, locale: 'en-GB', ...o });
const macPage = async () => { const c = await b.newContext({ viewport: { width: 1440, height: 900 }, userAgent: MAC, locale: 'en-GB' }); return [c, watch(await c.newPage())]; };

// ---- the phone, signed in; and a second account, elsewhere ----
const pctx = await phoneCtx(), ph = watch(await pctx.newPage());
await joinChat(ph, `${CHAT}/`, { name: 'Sam Lee', handle: 'samlee', email: 'sam@example.com', city: 'London' });
await ph.goto(`${ACCT}/`); await ph.waitForSelector('main .hero', { timeout: 30000 }); await settle(ph, 800);
const samCookie = await cookieOf(pctx);
const octx = await phoneCtx(), other = watch(await octx.newPage());
await makeAccount(other, `${ACCT}/`, { name: 'Ola Berg', handle: 'olaberg', email: 'ola@example.com' });
const olaCookie = await cookieOf(octx);
ok(/account=/.test(samCookie) && /account=/.test(olaCookie), 'two accounts, each signed in on a phone');

// ---- the routes, as an attacker would try them ----
ok((await api('signin/qr', { body: {}, origin: null })).status === 403 && (await api('signin/qr', { body: {}, origin: 'https://evil.example' })).status === 403, 'a code: only for the page’s own address (no origin, or another’s: refused)');
let s1 = await api('signin/qr', { body: {} });
ok(s1.status === 200 && /^[A-Za-z0-9_-]{32}$/.test(s1.j.code) && /^[A-Za-z0-9_-]{43}$/.test(s1.j.poll) && s1.j.ttl === 120000 && !s1.set.length, 'a code and its poll word, two minutes, nothing signed in', JSON.stringify(s1.j).slice(0, 80));
const wrong = await api('signin/qr/wait', { body: { code: s1.j.code, poll: s1.j.poll.slice(0, -1) + (s1.j.poll.endsWith('A') ? 'B' : 'A') } });
const nopoll = await api('signin/qr/wait', { body: { code: s1.j.code } });
ok(wrong.j?.state === 'gone' && nopoll.j?.state === 'gone' && !wrong.set.length && !nopoll.set.length, 'asked after with the wrong word, or none: nothing');
ok((await api('signin/qr/wait', { body: { code: s1.j.code, poll: s1.j.poll }, origin: 'https://evil.example' })).status === 403, 'asked after from another address: refused');
ok((await api('signin/qr/wait', { body: { code: s1.j.code, poll: s1.j.poll } })).j?.state === 'waiting', 'asked after rightly: waiting');
ok((await api('qr/look', { body: { code: s1.j.code } })).status === 401, 'looked at signed out: refused');
ok((await api('qr/look', { body: { code: s1.j.code }, cookie: samCookie, origin: 'https://evil.example' })).status === 403, 'looked at from another address: refused');
sql0(`UPDATE pg_sessions SET auth_at = 1 WHERE user_id = ${sessionsOf('olaberg')}`);
const stale = await api('qr/look', { body: { code: s1.j.code }, cookie: olaCookie });
sql0(`UPDATE pg_sessions SET auth_at = ${Date.now()}, handed = 1 WHERE user_id = ${sessionsOf('olaberg')}`);
const handed = await api('qr/look', { body: { code: s1.j.code }, cookie: olaCookie });
sql0(`UPDATE pg_sessions SET handed = NULL WHERE user_id = ${sessionsOf('olaberg')}`);
ok(stale.status === 403 && stale.j?.field === 'reauth' && handed.status === 403 && handed.j?.field === 'reauth' && (await api('signin/qr/wait', { body: { code: s1.j.code, poll: s1.j.poll } })).j?.state === 'waiting',
  'looked at by a phone that hasn’t shown it’s you lately, or one kept to the account’s page: refused, and the code untouched', `${stale.status} ${handed.status}`);
const look = await api('qr/look', { body: { code: s1.j.code }, cookie: samCookie, ua: IPHONE });
ok(look.status === 200 && look.j.label === 'Mac · Chrome' && look.j.picks.length === 3 && !('num' in look.j), 'the phone: which computer, three numbers (and not which is right)', JSON.stringify(look.j));
const seen = await api('signin/qr/wait', { body: { code: s1.j.code, poll: s1.j.poll } });
ok(seen.j?.state === 'seen' && look.j.picks.includes(seen.j.num) && seen.j.phone === 'iPhone · Safari', 'the Mac: told a phone looked, and the number to show', JSON.stringify(seen.j));
ok((await api('qr/look', { body: { code: s1.j.code }, cookie: olaCookie })).status === 409 && (await api('qr/answer', { body: { code: s1.j.code, num: seen.j.num }, cookie: olaCookie })).status === 410, 'another account, with the same code: neither look nor answer');
const bad = look.j.picks.find((n) => n !== seen.j.num);
const ans = await api('qr/answer', { body: { code: s1.j.code, num: bad }, cookie: samCookie });
ok(ans.status === 400, 'a wrong number: refused', JSON.stringify(ans.j));
const no1 = await api('signin/qr/wait', { body: { code: s1.j.code, poll: s1.j.poll } }), no2 = await api('signin/qr/wait', { body: { code: s1.j.code, poll: s1.j.poll } });
ok(no1.j?.state === 'no' && no2.j?.state === 'gone' && !no1.set.length && (await api('qr/answer', { body: { code: s1.j.code, num: seen.j.num }, cookie: samCookie })).status === 410, 'and the code’s done: the Mac told no, nothing signed in, the right number now too late');
// (one run out)
const s2 = await api('signin/qr', { body: {} });
sql0("UPDATE pg_qrsign SET expires = 1 WHERE state = 'new'");
ok((await api('qr/look', { body: { code: s2.j.code }, cookie: samCookie })).status === 410 && (await api('signin/qr/wait', { body: { code: s2.j.code, poll: s2.j.poll } })).j?.state === 'gone', 'a code run out: refused on both');
// (said yes to, rightly; the account's email confirmed first, as only a confirmed one's written to)
sql0("UPDATE pg_users SET email_ok = 1 WHERE handle = 'samlee'");
const n0 = mails().length;
const s3 = await api('signin/qr', { body: {} });
const l3 = await api('qr/look', { body: { code: s3.j.code }, cookie: samCookie, ua: IPHONE }), w3 = await api('signin/qr/wait', { body: { code: s3.j.code, poll: s3.j.poll } });
ok((await api('qr/answer', { body: { code: s3.j.code, num: w3.j.num }, cookie: samCookie })).j?.ok === true, 'the right number: yes');
const ready = await api('signin/qr/wait', { body: { code: s3.j.code, poll: s3.j.poll } });
ok(ready.j?.state === 'ready' && ready.j.name === 'Sam Lee' && ready.j.handle === 'samlee' && !ready.set.length, 'the Mac: told whose account said yes, to ask before taking it (nothing signed in yet)', JSON.stringify(ready.j));
ok((await api('signin/qr/take', { body: { code: s3.j.code, poll: s3.j.poll.slice(0, -1) + (s3.j.poll.endsWith('A') ? 'B' : 'A') } })).j?.state === 'gone' && (await api('signin/qr/take', { body: { code: s3.j.code, poll: s3.j.poll }, origin: 'https://evil.example' })).status === 403,
  'taken with the wrong word, or from another address: nothing');
const yes = await api('signin/qr/take', { body: { code: s3.j.code, poll: s3.j.poll, app: 'markets' } });
const macCookie = (yes.set.find((c) => /^account=/.test(c)) || '').split(';')[0];
ok(yes.status === 200 && yes.j?.signedIn && yes.j.handle === 'samlee' && yes.j.fresh === false && /^account=[A-Za-z0-9_-]{20,}$/.test(macCookie) && !yes.set.some((c) => /known/i.test(c)), 'taken: the Mac signed in, with a cookie of its own, not as having just shown it’s you, nor known to the password', JSON.stringify({ fresh: yes.j?.fresh, handle: yes.j?.handle }));
const again = await api('signin/qr/take', { body: { code: s3.j.code, poll: s3.j.poll } }), again2 = await api('signin/qr/wait', { body: { code: s3.j.code, poll: s3.j.poll } });
ok(again.j?.state === 'gone' && again2.j?.state === 'gone' && !again.set.length, 'the same code and word again: nothing (good once)');
const s4 = await api('signin/qr', { body: {} });
ok((await api('signin/qr/take', { body: { code: s4.j.code, poll: s4.j.poll } })).j?.state === 'gone', 'taken before a phone’s said yes: nothing');
const me = await api('me', { cookie: macCookie });
ok(me.j?.signedIn && me.j.devices.some((d) => d.label === 'Mac · Chrome' && d.current) && macCookie !== samCookie.match(/account=[^;]+/)?.[0], 'its own sign-in, as a Mac, beside the phone’s', me.j?.devices.map((d) => d.label).join(', '));
const hb = await api('handback', { body: { app: 'inflight', ask: 'A'.repeat(43), box: 'B'.repeat(60) }, cookie: macCookie });
ok(hb.status === 403 && /Confirm/.test(hb.j?.error || ''), 'Chat’s key not handed over on it: it asks you to show it’s you first', JSON.stringify(hb.j));
await new Promise((r) => setTimeout(r, 1500));
const said = mails().slice(n0).find((m) => /new sign-in/i.test(m.subject || '') && /QR code, from iPhone · Safari/.test(JSON.stringify(m)));
ok(!!said, 'said to the account’s email: a new sign-in, by QR code from the iPhone', mails().slice(n0).map((m) => m.subject).join(' | '));

// ---- in browsers: the Mac's page, the phone's ----
const pout = watch(await (await phoneCtx()).newPage());
await pout.goto(`${ACCT}/`); await pout.waitForSelector('main .signin', { timeout: 30000 }); await settle(pout, 800);
ok(!(await pout.$('#qrc')), 'on a phone, signed out: no QR code (it’s for a computer)');
const [, m] = await macPage();
await m.goto(`${ACCT}/`); await m.waitForSelector('#qrc .qrbox svg', { timeout: 30000 }); await settle(m, 1200);
const link = await m.getAttribute('#qrc .qrbox', 'data-link');
const read = async (pg, png) => pg.evaluate(async (b64) => { const jsQR = (await import('/jsqr.js')).default; const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return jsQR(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height)?.data || null; }, png.toString('base64'));
ok(/^http:\/\/account\.ifl\.test:8788\/#qr=[A-Za-z0-9_-]{32}$/.test(link) && (await read(ph, await m.locator('#qrc .qrbox').screenshot())) === link, 'on a Mac: a QR code beside the usual sign-in, that reads (InFlite’s mark and all)', link);
await m.screenshot({ path: `${out}/1-mac.png` });
await ph.goto(link); await ph.waitForSelector('.sheet-body .qrask h2:has-text("Signing in on a computer?")', { timeout: 20000 }); await settle(ph, 2500);
ok(/someone sent you this link/.test(await ph.locator('.sheet-body').innerText()) && !(await m.$('.qrnum')) && await m.isVisible('#qrc .qrbox svg'), 'the phone, opening it: asked first whether it opened it itself, and the Mac shown nothing yet');
await ph.screenshot({ path: `${out}/2-phone-first.png` });
await ph.locator('.sheet-body button:has-text("Continue")').click();
await ph.waitForSelector('.qrpick button', { timeout: 20000 }); await settle(ph, 600);
ok(/Sign in on a Mac\?/.test(await ph.locator('.sheet-body').innerText()) && /Chrome on a Mac/.test(await ph.locator('.sheet-body').innerText()) && /address bar shows account\.ifl\.test:8788/.test(await ph.locator('.sheet-body').innerText()),
  'Continue: which computer is asking, and to go on only if its address bar shows the account’s own address');
await ph.screenshot({ path: `${out}/3-phone.png` });
await m.waitForSelector('.qrnum b', { timeout: 10000 });
ok(/Check your iPhone/.test(await m.locator('#qrc').innerText()), 'the Mac: check your iPhone, and the number');
await ph.locator(`.qrpick button:text-is("${(await m.locator('.qrnum b').innerText()).trim()}")`).click();
await ph.waitForSelector('.qrend.good', { timeout: 10000 });
await m.waitForSelector('#qrc .qrwho', { timeout: 10000 }); await settle(m, 500);
ok(/Continue as Sam Lee\?/.test(await m.locator('#qrc').innerText()) && /@samlee/.test(await m.locator('#qrc').innerText()) && /s••@example\.com/.test(await m.locator('#qrc').innerText()) && !(await m.$('main .hero')),
  'tapped: the Mac asks “Continue as Sam Lee?”, with the handle and the email partly hidden, not signed in till then', (await m.locator('#qrc').innerText()).replace(/\s+/g, ' '));
await m.screenshot({ path: `${out}/4-mac-who.png` });
await m.locator('#qrc button:has-text("Continue")').click();
await m.waitForSelector('main .hero', { timeout: 20000 }); await settle(m, 1000);
ok(/Sam Lee/.test(await m.locator('main').innerText()), 'Continue: the Mac signed in');
// (from an app: Markets, handed back)
const [, m2] = await macPage();
await m2.goto(`${MKT}/`); await m2.waitForSelector('#sign-in:not([disabled])', { timeout: 20000 }); await m2.click('#sign-in');
await m2.waitForSelector('#qrc .qrbox svg', { timeout: 30000 });
ok(/continue to\s*Markets/.test(await m2.locator('main').innerText()), 'Markets → Sign in: the account’s page, its QR code there too');
const viaPhone = async (pg, mac) => {
  await pg.goto(await mac.getAttribute('#qrc .qrbox', 'data-link')); await pg.locator('.sheet-body button:has-text("Continue")').click();
  await pg.waitForSelector('.qrpick button, .qrtype', { timeout: 20000 }); await mac.waitForSelector('.qrnum b', { timeout: 10000 });
  return (await mac.locator('.qrnum b').innerText()).trim();
};
await ph.locator(`.qrpick button:text-is("${await viaPhone(ph, m2)}")`).click();
await m2.waitForSelector('#qrc .qrwho', { timeout: 10000 }); await m2.locator('#qrc button:has-text("Continue")').click();
await m2.waitForURL(/finance\.ifl\.test/, { timeout: 30000 }); await m2.waitForSelector('.empty h2, .hero, .desk', { timeout: 30000 });
ok(true, 'and back in Markets, signed in');
// (a wrong number, in the page)
const [, m3] = await macPage();
await m3.goto(`${ACCT}/`); await m3.waitForSelector('#qrc .qrbox svg', { timeout: 30000 });
const right = await viaPhone(ph, m3), off = (await ph.locator('.qrpick button').allInnerTexts()).map((x) => x.trim()).find((x) => x !== right);
await ph.locator(`.qrpick button:text-is("${off}")`).click();
await ph.waitForSelector('.qrend.bad', { timeout: 10000 }); await m3.waitForSelector('#qrc .said', { timeout: 10000 }); await m3.waitForSelector('#qrc .qrbox svg', { timeout: 10000 });
ok(!(await m3.$('main .hero')) && /didn’t say yes/.test(await m3.locator('#qrc .said').innerText()), 'a wrong number: refused on the phone; the Mac told, not signed in, a new code');
// (That's not me, on the Mac)
const code6 = (await m3.getAttribute('#qrc .qrbox', 'data-link')).split('#qr=')[1];
await ph.locator(`.qrpick button:text-is("${await viaPhone(ph, m3)}")`).click();
await m3.waitForSelector('#qrc .qrwho', { timeout: 10000 }); await m3.locator('#qrc button:has-text("That’s not me")').click();
await m3.waitForSelector('#qrc .qrbox svg', { timeout: 10000 }); await settle(m3, 2600);
ok(!(await m3.$('main .hero')) && /Not signed in/.test(await m3.locator('#qrc').innerText()) && (await api('qr/look', { body: { code: code6 }, cookie: samCookie })).status === 410,
  'That’s not me: not signed in, a new code, and the old one ended on the server');
// (a computer in another country: its number typed, not picked)
const link5 = await m3.getAttribute('#qrc .qrbox', 'data-link');
sql0(`UPDATE pg_qrsign SET cc = 'FR' WHERE state = 'new'`);
await ph.goto(link5); await ph.locator('.sheet-body button:has-text("Continue")').click(); await ph.waitForSelector('.qrtype', { timeout: 20000 }); await settle(ph, 500);
ok(/different country/.test(await ph.locator('.sheet-body').innerText()) && !(await ph.$('.qrpick')), 'a computer in another country: said so, and its number to be typed', (await ph.locator('.qrwarn').innerText()));
await ph.screenshot({ path: `${out}/5-phone-far.png` });
await m3.waitForSelector('.qrnum b', { timeout: 10000 });
await ph.fill('.qrtype', (await m3.locator('.qrnum b').innerText()).trim()); await ph.locator('.qrtyped button').click();
await ph.waitForSelector('.qrend.good', { timeout: 10000 }); await m3.waitForSelector('#qrc .qrwho', { timeout: 10000 });
ok(true, 'typed rightly: yes, and the Mac asks whose account');
await m3.locator('#qrc button:has-text("That’s not me")').click(); await m3.waitForSelector('#qrc .qrbox svg', { timeout: 10000 });
// (a phone signed out, opening one)
await pout.goto(await m3.getAttribute('#qrc .qrbox', 'data-link')); await pout.reload(); await pout.waitForSelector('main h1', { timeout: 20000 }); await settle(pout, 600);
ok(/Sign in on this phone first/.test(await pout.locator('main h1').innerText()), 'a phone signed out, opening it: asked to sign in there first');

// ---- the account page's own scanner: a stand-in camera held up to the Mac's screen ----
const [, m4] = await macPage();
await m4.goto(`${ACCT}/`); await m4.waitForSelector('#qrc .qrbox svg', { timeout: 30000 }); await settle(m4, 900);
const box = await m4.locator('#qrc .qrbox').boundingBox(), cx = box.x + box.width / 2, cy = box.y + box.height / 2;
const jpg = await m4.screenshot({ type: 'jpeg', quality: 90, clip: { x: cx - 320, y: cy - 240, width: 640, height: 480 } });
writeFileSync(`${out}/camera.mjpeg`, Buffer.concat(Array(30).fill(jpg)));
const cb = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: [HOSTS, `--unsafely-treat-insecure-origin-as-secure=${ACCT}`, '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${out}/camera.mjpeg`] });
sql0(`UPDATE pg_sessions SET auth_at = 1 WHERE user_id = ${sessionsOf('samlee')}`);
const cctx = await cb.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: IPHONE, locale: 'en-GB', storageState: await pctx.storageState() });
await cctx.grantPermissions(['camera'], { origin: ACCT });
const cam = watch(await cctx.newPage());
await cam.goto(`${ACCT}/`); await cam.waitForSelector('main .hero', { timeout: 30000 }); await settle(cam, 800);
await cam.locator('button.row[data-k="Sign-in and Security"]').click(); await cam.waitForSelector('button.row[data-k="Sign in on a computer"]', { timeout: 10000 }); await settle(cam, 500);
await cam.locator('button.row[data-k="Sign in on a computer"]').click();
await cam.waitForSelector('.sheet-body input[type=password]', { timeout: 20000 }); await settle(cam, 400);
ok(/Confirm it’s you/.test(await cam.locator('.sheet-head, .sheet-body').first().innerText().catch(() => '')) || /show it’s you/.test(await cam.locator('.sheet-body').innerText()), 'Sign-in and Security › Sign in on a computer: the code read by the camera, and, not shown lately, asked to show it’s you first');
ok(!(await m4.$('.qrnum')), 'the Mac shown nothing till then');
await cam.fill('.sheet-body input[type=password]', PASSWORD); await cam.locator('.sheet-body form button[type=submit]').click();
await cam.waitForSelector('.qrpick button', { timeout: 20000 }); await m4.waitForSelector('.qrnum b', { timeout: 10000 });
ok(!(await cam.evaluate(() => [...document.querySelectorAll('video')].some((v) => v.srcObject?.active))), 'shown: on to the request, the camera off');
await cam.locator(`.qrpick button:text-is("${(await m4.locator('.qrnum b').innerText()).trim()}")`).click();
await m4.waitForSelector('#qrc .qrwho', { timeout: 10000 }); await m4.locator('#qrc button:has-text("Continue")').click();
await m4.waitForSelector('main .hero', { timeout: 20000 });
ok(true, 'and the Mac signed in from it');
await cb.close();
ok(!errs.length, 'no errors on the page', errs.join(' ; '));
console.log(`FAILS ${fails}`);
await b.close();
process.exit(0);
