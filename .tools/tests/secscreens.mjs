// Privacy & Security, Encryption, Safety Number and Passkeys: how protected you are at a glance, what the
// encryption does, where you stand with each friend, verifying with a moment to mark it, and passkeys explained.
// (DEMO=<dir> also records the walk-through as a video there.)
import { kit } from './lib.mjs';
const [,, S, out] = process.argv;
const K = await kit(S, out);
const { ok, sql, one, api, sess } = K;
const DEMO = process.env.DEMO;
// George's phone: a camera showing whatever code the test puts up (as verify.mjs)
const ctx = await K.b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'Europe/London',
  userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36', ...(DEMO ? { recordVideo: { dir: DEMO, size: { width: 390, height: 844 } } } : {}) });
await ctx.grantPermissions(['notifications'], { origin: K.BASE });
await ctx.addInitScript(() => {
  delete window.BarcodeDetector;
  navigator.mediaDevices.getUserMedia = async () => {
    const c = document.createElement('canvas'); c.width = c.height = 480; const g = c.getContext('2d');
    let shown = null, img = null;
    const draw = async () => {
      if (window.__code && window.__code !== shown) {
        shown = window.__code; const { qrSvg } = await import('/pigeon/qr.js');
        const blob = new Blob([qrSvg(shown)], { type: 'image/svg+xml' }); img = new Image(); img.src = URL.createObjectURL(blob); await img.decode();
      }
      g.fillStyle = '#555'; g.fillRect(0, 0, 480, 480); if (img) { g.fillStyle = '#fff'; g.fillRect(70, 70, 340, 340); g.drawImage(img, 90, 90, 300, 300); }
      setTimeout(draw, 100);
    };
    draw(); return c.captureStream(10);
  };
});
const tStart = Date.now(); const p = await ctx.newPage(); p.on('pageerror', (e) => K.errs.push(`george: ${e}`));
await p.goto(K.URL);
const G = { p, ctx, name: 'george' };
const M = await K.phone('mira'), P = await K.phone('pat'), Z = await K.phone('sam');
await K.signup(G, 'George Farrow-Green', 'geo', 'george@example.com', 'Norwich');
await K.signup(M, 'Mira Okafor', 'mira', 'mira@example.com', 'Paris');
await K.signup(P, 'Pat Lee', 'pat', 'pat@example.com', 'London');
await K.signup(Z, 'Sam Ito', 'sam', 'sam@example.com', 'New York');
const gs = await sess(G);
for (const X of [M, P, Z]) { const xs = await sess(X); await api(gs.token, 'friends', { handle: xs.me.handle }); await api(xs.token, 'friends-respond', { id: gs.me.id, accept: true }); }
for (const X of [M, P, Z]) await X.ctx.close();
await p.reload(); await p.waitForSelector('.tabs'); await p.waitForTimeout(1200);       // (George sees, and trusts, each key)
// Pat verified already; Sam's key then changes
// (this phone's own, Encryption among them, in InFlite's menu, from your photo)
const menuOpen = async () => { await p.click('.chead .ifh-me'); await p.waitForSelector('.ifm-pop.open'); };
const menuShut = async () => { await p.keyboard.press('Escape'); await p.waitForSelector('.ifm-layer', { state: 'detached' }); };
const enc = async () => { await menuOpen(); await p.click('.ifm-pop [data-k=encryptionsheet]'); };
const encSays = async () => { await menuOpen(); const v = (await p.locator('.ifm-pop [data-k=encryptionsheet]').innerText()).replace(/\s+/g, ' '); await menuShut(); return v; };
await p.click('[data-act=tab][data-id=account]'); await enc();
await p.click('.sheet [data-act=safety] >> text=Pat'); await p.click('.sheet [data-act=verifyok]'); await p.waitForSelector('.sheet .verified');
await p.keyboard.press('Escape'); await p.click('[data-act=tab][data-id=chats]').catch(() => {});
const t0 = Date.now();       // (the video's walk-through starts after this)
const newPub = await p.evaluate(async () => { const k = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']); const j = await crypto.subtle.exportKey('jwk', k.publicKey); return { x: j.x, y: j.y }; });
sql(`UPDATE pg_users SET pub = json_object('kty', 'EC', 'crv', 'P-256', 'x', '${newPub.x}', 'y', '${newPub.y}') WHERE handle = 'sam'`);
await p.waitForTimeout(2500); await p.reload(); await p.waitForSelector('.tabs'); await p.waitForTimeout(1000);
const txt = async (s) => (await p.locator(s).first().innerText()).replace(/\s+/g, ' ');
const slow = (ms) => p.waitForTimeout(DEMO ? ms : Math.min(ms, 600));
const scroll = async (y) => { await p.evaluate((y) => document.querySelector('.sheet .body')?.scrollBy({ top: y, behavior: 'smooth' }), y); await slow(1300); };
const shot = (n) => p.screenshot({ path: `${out}/${n}.png` });

// 1. InFlite's menu: what's each phone's own, and Settings (Chat's, on the account's page)
await p.click('[data-act=tab][data-id=account]'); await slow(900);
await menuOpen(); await slow(1600);
const mine = await p.$$eval('.ifm-pop [data-k]', (els) => els.map((e) => e.dataset.k).join());
await menuShut();
ok(!(await p.$('#screen > main.view [data-act=ifsettings]')) && /settings/.test(mine) && /pushtoggle/.test(mine) && /applock/.test(mine) && /haptics/.test(mine) && /encryptionsheet/.test(mine),
  'InFlite\'s menu: push, the lock, haptics and encryption, and Settings (no Chat Settings row in Account)', mine);
ok(!(await p.$('#screen > main.view [data-act=securitysheet]')) && !(await p.$('#screen > main.view [data-act=notifysheet]')), 'no Privacy & Security or Notifications in the app: they’re on the account’s page');
{ const e = await encSays(); ok(/1 changed/.test(e), 'the Encryption row says a friend’s key changed', e); }
await shot('security');

// 2. Encryption: what it does, your key as a pattern, each friend's standing
await enc(); await p.waitForSelector('.sheet .keyhero'); await slow(1800);
ok(/Sealed with your key/.test(await txt('.sheet .keyhero')) && (await txt('.sheet .keyhero .mono')).replace(/\s+/g, '').length === 32 && await p.isVisible('.sheet .keyhero [data-act=copyfp]'), 'Encryption: your key at the top, its digits and Copy');
ok(await p.locator('.sheet .keyhero svg.keyart rect').count() > 4, 'your key, drawn as a pattern you’d know');
ok(await p.isVisible('.sheet [data-act=scanany]') && /How it works/.test(await txt('.sheet details.learn summary')) && !(await p.$('.sheet details.learn[open]')), 'Verify a Friend, and how it works folded away');
await shot('encryption');
await scroll(600);
const rows = await p.locator('.sheet [data-act=safety]').allInnerTexts();
ok(rows.length === 3 && /Sam.*Key changed/s.test(rows[0]) && /Mira.*Not checked/s.test(rows[1]) && /Pat.*Verified/s.test(rows[2]), 'each friend with where you stand: a changed key first, then not checked, then verified', rows.map((r) => r.replace(/\s+/g, ' ')).join(' | '));
ok(/1 of 3 verified/.test(await txt('.sheet .ghead .gcount')), '“1 of 3 verified”');
await shot('encryption-2');

// 3. Safety Number: Mira, not verified yet; scan her code, and it's marked with a moment
await p.click('.sheet [data-act=safety] >> text=Mira'); await p.waitForSelector('.sheet .safehero.s-none'); await slow(1600);
ok(/Not verified yet/.test(await txt('.sheet .safehero')) && await p.isVisible('.sheet .safecard .qrbox svg'), 'Safety Number: Mira, not verified yet, and your code');
await shot('safety');
await scroll(500); await shot('safety-2'); await scroll(-800);
const digits = (await p.locator('.sheet .digits').innerText()).replace(/\s+/g, '');
ok(digits.length === 60, 'the 60 digits', digits.length);
await p.evaluate((d) => { window.__code = 'inflight-safety:1:' + d; }, digits);
await p.click('.sheet [data-act=scansafe]'); await p.waitForSelector('.scanbox video'); await slow(400);
ok(await p.waitForSelector('.sheet .safehero.won', { timeout: 15000 }).then(() => true, () => false), 'her code read: back to her safety number, which marks it');
await p.waitForTimeout(700); await shot('safety-won'); await slow(1800);
ok(/Verified in person/.test(await txt('.sheet .safehero')) && /You checked together/.test(await txt('.sheet .safedone')) && !(await p.$('.sheet .safecard')), 'Verified in person: it says so, and stops asking you to scan');
await p.click('.sheet header [data-act=encryptionsheet]'); await p.waitForSelector('.sheet .keyhero'); await slow(800); await scroll(600);
ok(/2 of 3 verified/.test(await txt('.sheet .ghead .gcount')), 'and Encryption now says 2 of 3');
// Sam's changed key
await p.click('.sheet [data-act=safety] >> text=Sam'); await p.waitForSelector('.sheet .safehero.s-warn'); await slow(1500);
ok(/Their key changed/.test(await txt('.sheet .safehero')) && await p.isVisible('.sheet [data-act=trustsafe]') && !(await p.$('.sheet .safecard')), 'Sam: their key changed, no code to scan until you’ve checked');
await shot('safety-changed');
// trusting it (they matched): no warning any more, and Privacy & Security says who to verify next
await p.click('.sheet [data-act=trustsafe]'); await p.waitForFunction(() => !document.querySelector('.sheet'), null, { timeout: 10000 }); await slow(900);
await slow(900);
{ const e = await encSays(); ok(/2 of 3/.test(e), 'the Encryption row: 2 of 3 verified', e); }
// Verify a Friend: the camera, whoever's code it reads (Sam's), found and marked, without finding him first
await enc(); await p.waitForSelector('.sheet .keyhero'); await slow(800);
await p.click('.sheet [data-act=safety] >> text=Sam'); await p.waitForSelector('.sheet .safehero.s-none'); await slow(600);
const samDigits = (await p.locator('.sheet .digits').innerText()).replace(/\s+/g, '');
await p.click('.sheet header [data-act=encryptionsheet]'); await p.waitForSelector('.sheet .keyhero'); await slow(600);
await p.evaluate(() => { window.__code = 'inflight-safety:1:' + '0'.repeat(60); });
await p.click('.sheet [data-act=scanany]'); await p.waitForSelector('.scanbox video');
ok(await p.waitForFunction(() => /isn’t your safety number with any of your friends/.test(document.querySelector('.sheet .scanmsg')?.textContent || ''), null, { timeout: 15000 }).then(() => true, () => false), 'Verify a Friend: a code that\'s no friend\'s says so');
await p.evaluate((d) => { window.__code = 'inflight-safety:1:' + d; }, samDigits);
await p.click('.sheet [data-act=scanany]');      // (Try Again: the reader's loaded now, so it can be read before the camera's seen)
ok(await p.waitForSelector('.sheet .safehero.won', { timeout: 15000 }).then(() => true, () => false) && /Sam/.test(await txt('.sheet .safehero')) && /Verified in person/.test(await txt('.sheet .safehero')), 'Verify a Friend: Sam\'s code read, and it\'s Sam, verified', await txt('.sheet .safehero'));
await shot('verify-friend');
await p.click('.sheet header [data-act=encryptionsheet]'); await p.waitForSelector('.sheet .keyhero'); await slow(600);
ok(/3 of 3 verified/.test(await txt('.sheet .ghead .gcount')), 'and Encryption now says 3 of 3');
await p.click('.sheet [data-act=close]'); await p.waitForFunction(() => !document.querySelector('.sheet'), null, { timeout: 8000 }); await slow(700);

// 4. Passkeys, explained when there are none (Lock Chat needs one: turning it on opens them)
await menuOpen(); await p.click('.ifm-pop [data-k=applock]'); await p.waitForSelector('.sheet .pkhero'); await slow(1800);
ok(/No Password to Forget/.test(await txt('.sheet .pkhero')) && await p.isVisible('.sheet .wnfoot [data-act=pkadd]'), 'Lock Chat with no passkey: Passkeys, what they’re for, and one big Add button');
await shot('passkeys');
await p.click('.sheet [data-act=close]'); await p.waitForFunction(() => !document.querySelector('.sheet'), null, { timeout: 8000 }); await slow(700);

// (5. Signed-In Phones: on the account's page now, Sign-in and Security → Signed-in devices: acctpage.mjs)

// 6. everything done: the lock on
sql(`UPDATE pg_users SET email_ok = 1 WHERE handle = 'geo'`);
sql(`INSERT INTO pg_passkeys (id, user_id, public_key, alg, label, created_at, used_at) VALUES ('pk-demo', '${gs.me.id}', 'x', -7, 'Pixel 8', ${Date.now() - 864e5 * 3}, ${Date.now() - 3600e3})`);
await p.reload(); await p.waitForSelector('.tabs'); await p.waitForTimeout(800);
// (turned on once the app is open: unlocking needs a real passkey, which a test phone hasn't)
await p.evaluate((uid) => localStorage.setItem('inflight-lock', JSON.stringify({ uid, on: true, after: 0 })), gs.me.id);
const ready = await p.evaluate(() => !!document.querySelector('[data-act=tab][data-id=account]'));
if (ready) {
  await p.click('[data-act=tab][data-id=account]'); await slow(700);
  await menuOpen(); await slow(1800);
  ok(await p.locator('.ifm-pop [data-k=applock][aria-checked=true]').count() === 1 && await p.locator('.ifm-pop [data-k=lockafter]').count() === 1, 'with a passkey and the lock on: Lock Chat on, in InFlite\'s menu (and when it locks)');
  await shot('security-done'); await menuShut();
} else ok(false, 'the app opened after the lock was turned on');
// dark (the app picks its theme as it opens; the lock off first, as a test phone can't unlock it)
await p.evaluate(() => { localStorage.removeItem('inflight-lock'); localStorage.setItem('inflight-theme', 'dark'); });
await fetch(K.BASE + '/api/pigeon/me', { method: 'PATCH', headers: { Authorization: 'Bearer ' + gs.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ appearance: 'dark' }) });
await p.reload(); await p.waitForSelector('.tabs'); await p.waitForTimeout(600);
await p.click('[data-act=tab][data-id=account]'); await menuOpen(); await p.waitForTimeout(1200); await shot('security-dark'); await menuShut();
await enc(); await p.waitForSelector('.sheet .keyhero'); await p.waitForTimeout(1200); await shot('encryption-dark');
await p.evaluate(() => document.querySelector('.sheet .body')?.scrollBy({ top: 600 })); await p.waitForTimeout(500);
await p.click('.sheet [data-act=safety] >> text=Mira'); await p.waitForSelector('.sheet .safehero'); await p.waitForTimeout(1200); await shot('safety-dark');
await ctx.close();
console.log('demo-start', (t0 - tStart) / 1000);
console.log('errs', K.errs);
console.log(`FAILS ${K.fails()}`);
process.exit(0);
