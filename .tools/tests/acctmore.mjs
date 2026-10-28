// The account page's newer touches (acctpage.mjs has the rest): the photo changed by tapping it; your code (a QR code of
// the link that adds you in Chat, and the link copied); what each app keeps of yours, in its sheet (Chat's
// counts, pigeons sent counted as its log does; Weather's places, notifications and units); a word about a passkey after
// a password sign-in, only where the device can make one, and one made from it; the check-up folded to a line when all's
// done, and opened; "Not you?" on a password sign-in from another device (not a passkey one, nor this browser's), which
// signs everywhere else out then asks for a new password; device and passkey rows slid to sign out and remove; and two
// columns on a wide screen; and your data as a PDF (read back by poppler: its pages, text, pictures, and a place name
// Helvetica can't show, drawn as a picture of itself), and the export it's written from. The site's addresses are
// stood in for by ifl.test (the home page's by gfg.test), as in acctpage.mjs.
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { joinChat } from './join.mjs';
const [,, S, out] = process.argv;
const CHAT = 'http://chat.ifl.test:8788', WX = 'http://weather.ifl.test:8788', ACCT = 'http://account.ifl.test:8788', PW = 'a long test password';
const sql0 = (q) => { writeFileSync(`${S}/acctmore.sql`, q); return execSync(`${S}/wr/node_modules/.bin/wrangler d1 execute bio-db --local --persist-to ${S}/wrstate --file ${S}/acctmore.sql --json`, { cwd: process.env.APP_ROOT, stdio: 'pipe' }).toString(); };
const sql = (q) => { for (let i = 0; ; i++) { try { return sql0(q); } catch (e) { if (i > 5 || !/SQLITE_BUSY/.test(String(e.stdout) + String(e.stderr) + e.message)) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400); } } };
const rows = (q) => JSON.parse(sql(q))[0].results;
let fails = 0; const errs = [];
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${extra ? '  — ' + extra : ''}`); if (!c) fails++; };

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined,
  args: ['--host-resolver-rules=MAP *.gfg.test 127.0.0.1, MAP gfg.test 127.0.0.1, MAP *.ifl.test 127.0.0.1, MAP ifl.test 127.0.0.1', `--unsafely-treat-insecure-origin-as-secure=${CHAT},${WX},${ACCT}`] });
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
// a phone (with Face ID, as it were: a passkey can be made on it), or a laptop that can't make one
async function browser(name, { laptop = false } = {}) {
  const ctx = await b.newContext(laptop ? { viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1, locale: 'en-GB', userAgent: WINDOWS, colorScheme: 'dark' }
    : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'en-GB', isMobile: true, hasTouch: true, userAgent: IPHONE, colorScheme: 'dark' });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ACCT });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${name}: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 40[13]|Cross-Origin-Opener-Policy header has been ignored/.test(m.text())) errs.push(`${name}: ${m.text()}`); });
  const cdp = await ctx.newCDPSession(p);
  if (!laptop) {
    await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  }
  return { ctx, p, cdp, name };
}
const shot = (x, n) => x.p.screenshot({ path: `${out}/${n}.png` });
const settle = (x, ms = 900) => x.p.waitForTimeout(ms);
const text = (x, sel = 'main') => x.p.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ').trim() || '', sel);
const sheetText = (x) => text(x, '#sheet');
const openRow = async (x, title) => { await x.p.click(`main .row:has(b:text-is("${title}"))`); await x.p.waitForSelector('#sheet[open] .sheet-body'); await settle(x, 700); };
const closeSheet = async (x) => { await x.p.click('#sheet .sheet-head .x'); await x.p.waitForSelector('#sheet', { state: 'hidden' }); await settle(x, 300); };
// (what's kept in Sign-in and security: its row on the page, then one of its own rows, opened over it)
const openSecure = async (x, title) => { await openRow(x, 'Sign-in and security'); await x.p.click(`#sheet .sheet-body:not(.going) .row:has(b:text-is("${title}"))`); await settle(x, 700); };
const account = async (x) => { await x.p.goto('about:blank'); await x.p.goto(`${ACCT}/`); await x.p.waitForSelector('main:not([aria-busy])', { timeout: 20000 }); await settle(x); };
const waitText = (x, re, sel = 'main', ms = 30000) => x.p.waitForFunction(([r, s]) => new RegExp(r).test(document.querySelector(s)?.innerText || ''), [re.source, sel], { timeout: ms }).catch(() => {});
const confirmIfAsked = async (x, pw) => { if (await x.p.waitForSelector('#sheet h2:text-is("Confirm it’s you")', { timeout: 2500 }).catch(() => null)) { await x.p.fill('#sheet input[type=password]', pw); await x.p.click('#sheet form .btn'); } };
// (who signed in here last is remembered, their email known: just the password, or, a passkey last time, the password a
// tap away)
const signIn = async (x) => {
  if (await x.p.$('main .signin input[name=email]')) await x.p.fill('main .signin input[name=email]', 'rowan@example.com');
  if (!(await x.p.isVisible('main .signin input[name=password]')) && await x.p.$('main .signin .usepw')) { await x.p.click('main .signin .usepw'); await settle(x, 400); }
  await x.p.fill('main .signin input[name=password]', PW); await x.p.click('main .signin form .btn');
  await waitText(x, /Rowan Hale/);
};
const signOut = async (x) => { await x.p.click('main .row.action:text-is("Sign out")'); await x.p.waitForSelector('main input[type=password]', { timeout: 15000 }); await settle(x, 500); };
// a finger dragged sideways (or up) across what's at sel
async function drag(x, sel, dx, dy = 0) {
  const r = await x.p.$eval(sel, (el) => { const b = el.getBoundingClientRect(); return { x: b.right - 40, y: b.top + b.height / 2 }; });
  const at = (i) => [{ x: r.x + (dx * i) / 10, y: r.y + (dy * i) / 10, id: 1 }];
  await x.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
  for (let i = 1; i <= 10; i++) { await x.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(i) }); await x.p.waitForTimeout(16); }
  await x.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await settle(x, 700);
}

// ---- 1. A new account, in Chat without a passkey; what it's done there and in Weather, as if over months ----
const P = await browser('phone');
await joinChat(P.p, `${CHAT}/`, { name: 'Rowan Hale', handle: 'rowan', email: 'rowan@example.com', password: PW, city: 'London' });
const uid = rows("SELECT id FROM pg_users WHERE handle = 'rowan'")[0].id, t = Date.now(), DAY = 86400e3;
// 4 friends (and one asked, not yet a friend), 2 groups; 3 pigeons now, a group pigeon to 2 people, and 4 whose messages
// went after a month (9 sent, as its log counts them; and 1 had); 6 places stamped; 4 of Weather's places (one Helvetica
// can't show), 1 notifying, and the brief
const wx = { places: [['London', 51.51, -0.13], ['Edinburgh', 55.95, -3.19], ['St Ives', 50.21, -5.48], ['Łódź', 51.76, 19.46]].map(([name, lat, lon]) => ({ name, lat, lon })), settings: { temp: 'c', wind: 'kmh' },
  notify: { places: [{ name: 'London', lat: 51.51, lon: -0.13, rain: true, warn: true }], brief: { name: 'London', lat: 51.51, lon: -0.13 }, briefAt: '07:00' } };
const n = (k, f) => Array.from({ length: k }, (_, i) => f(i + 1)).join(',\n  ');
const FRIENDS = ['Ada Marsh', 'Ben Okafor', 'Chloé Durand', 'Dev Patel'];
sql(`
INSERT INTO pg_users (id, handle, name, email, pub, salt, proof_hash, vault, swift, swift_at, created_at) VALUES ${n(4, (i) => `('friend${i}', 'friend${i}', '${FRIENDS[i - 1]}', 'friend${i}@example.com', 'x', 'x', 'x', 'x', 0, 0, ${t})`)};
INSERT INTO pg_groups (id, name, created_by, created_at) VALUES ('g1', 'Book club', '${uid}', ${t}), ('g2', 'Climbing', 'friend1', ${t});
INSERT INTO pg_birds (id, owner, name, created_at, km) VALUES ('b1', '${uid}', 'Pip', ${t - 20 * DAY}, 1234.5);
INSERT INTO pg_links (a, b, status, created_at) VALUES ${n(4, (i) => `('${i % 2 ? uid : 'friend' + i}', '${i % 2 ? 'friend' + i : uid}', 'ok', ${t})`)}, ('${uid}', 'asked1', 'pending', ${t});
INSERT INTO pg_group_members (group_id, user_id, added_by, joined_at) VALUES ('g1', '${uid}', '${uid}', ${t}), ('g2', '${uid}', 'friend1', ${t});
INSERT INTO pg_msgs (id, sender, recipient, ct, km, sent_at, deliver_at) VALUES ${n(3, (i) => `('m${i}', '${uid}', 'friend${i}', 'x', 50, ${t - i * DAY}, ${t - i * DAY + 3600e3})`)};
INSERT INTO pg_msgs (id, sender, recipient, ct, km, sent_at, deliver_at) VALUES ('in1', 'friend1', '${uid}', 'x', 50, ${t - DAY}, ${t - DAY + 3600e3});
INSERT INTO pg_gmsgs (id, group_id, sender, body, sender_key, pigeon, sent_at) VALUES ('gm1', 'g1', '${uid}', 'x', 'k', 'standard', ${t - DAY});
INSERT INTO pg_gdeliv (msg_id, user_id, wrap, km, deliver_at) VALUES ('gm1', 'friend1', 'w', 40, ${t}), ('gm1', 'friend2', 'w', 60, ${t});
INSERT INTO pg_flights (id, msg_id, sender, recipient, sent_at) VALUES ${n(4, (i) => `('f${i}', 'f${i}', '${uid}', 'friend1', ${t - (40 + i) * DAY})`)};
INSERT INTO pg_passport (user_id, place, first_at) VALUES ${n(6, (i) => `('${uid}', 'Place ${i}', ${t - i * DAY})`)};
CREATE TABLE IF NOT EXISTS wx_accts (user_id TEXT PRIMARY KEY, data TEXT NOT NULL, ver INTEGER NOT NULL, updated INTEGER);
INSERT INTO wx_accts (user_id, data, ver, updated) VALUES ('${uid}', '${JSON.stringify(wx)}', 1, ${t});
`);
await account(P);
ok(/Rowan Hale/.test(await text(P)), 'the account page, signed in from Chat');

// ---- 2. Your photo: none yet (your colours and initial, and Add a photo); one picked, what shows of it chosen, saved ----
ok(await P.p.$('main .poster-card.none .pc-initial') && await P.p.$('main .poster-card .pc-add'), 'no photo yet: the card in your colours, your initial, and Add a photo');
const jpeg = Buffer.from((await P.p.evaluate(() => {
  const c = document.createElement('canvas'); c.width = c.height = 300; const g = c.getContext('2d');
  g.fillStyle = '#d9637a'; g.fillRect(0, 0, 300, 300); g.fillStyle = '#ffe2a8'; g.beginPath(); g.arc(150, 170, 60, 0, 7); g.fill();
  return c.toDataURL('image/jpeg', 0.9);
})).split(',')[1], 'base64');
const [chooser] = await Promise.all([P.p.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null), P.p.click('main .pc-add')]);
ok(!!chooser, 'Add a photo opens the picker');
if (chooser) await chooser.setFiles({ name: 'me.jpg', mimeType: 'image/jpeg', buffer: jpeg });
await P.p.waitForFunction(() => document.querySelector('#sheet[open] .pv-frame img')?.naturalWidth > 0, null, { timeout: 15000 }).catch(() => {});
ok(await text(P, '#sheet h2') === 'Your photo' && !rows(`SELECT avatar_at FROM pg_users WHERE id = '${uid}'`)[0].avatar_at, 'then Your photo, to choose what shows: nothing saved yet');
const fb = await P.p.locator('#sheet .pv-frame').boundingBox();
await P.p.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2); await P.p.mouse.down();
await P.p.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2 + 40, { steps: 6 }); await P.p.mouse.up();
const pos = await P.p.$eval('#sheet .pv-frame img', (i) => i.style.objectPosition);
ok(/^50% ([0-9.]+)%$/.test(pos) && Number(pos.split(' ')[1].replace('%', '')) < 50, 'dragged down: more of the top shows', pos);
await shot(P, '01-photo-choose');
await P.p.click('#sheet .link.done');
await P.p.waitForFunction(() => /Photo updated/.test(document.querySelector('#toast')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
const saved = rows(`SELECT avatar_at, poster_at, poster_focus FROM pg_users WHERE id = '${uid}'`)[0];
ok(saved.avatar_at && saved.poster_at && saved.poster_focus === `50 ${pos.split(' ')[1].replace('%', '')}`, 'saved: the circle, the poster, and what shows of it', JSON.stringify(saved));
await P.p.waitForSelector('main .poster-card:not(.none) .pc-photo img', { timeout: 15000 }).catch(() => {});
ok(await P.p.$eval('main .pc-photo img', (i) => i.style.objectPosition).catch(() => '') === pos && await P.p.$('main .pc-cam'), 'the card: your photo, as you placed it, and a camera for it', pos);
await shot(P, '01-photo');
await P.p.click('main .pc-cam'); await P.p.waitForSelector('#sheet[open] .pv-frame');
ok(/Choose another photo/.test(await text(P, '#sheet')) && /Remove photo/.test(await text(P, '#sheet')), 'the camera: Your photo again, to move it, change it or remove it');
// (what shows of the same photo moved: only the circle cut again and sent, the poster kept as it was, with its new focus)
await P.p.waitForFunction(() => document.querySelector('#sheet[open] .pv-frame img')?.naturalWidth > 0, null, { timeout: 15000 }).catch(() => {}); await settle(P, 700);
const fb2 = await P.p.locator('#sheet .pv-frame').boundingBox();
await P.p.mouse.move(fb2.x + fb2.width / 2, fb2.y + fb2.height / 2); await P.p.mouse.down();
await P.p.mouse.move(fb2.x + fb2.width / 2, fb2.y + fb2.height / 2 - 30, { steps: 6 }); await P.p.mouse.up();
const pos2 = await P.p.$eval('#sheet .pv-frame img', (i) => i.style.objectPosition);
await P.p.click('#sheet .link.done'); await P.p.waitForSelector('#sheet', { state: 'hidden' }); await settle(P, 300);
const moved = rows(`SELECT avatar_at, poster_at, poster_focus FROM pg_users WHERE id = '${uid}'`)[0];
ok(pos2 !== pos && moved.poster_at === saved.poster_at && moved.avatar_at > saved.avatar_at && moved.poster_focus === `50 ${pos2.split(' ')[1].replace('%', '')}`,
  'moved what shows: the circle cut again, the poster kept as it was, with what shows of it now', JSON.stringify({ pos2, moved }));
// (and changed elsewhere meanwhile, as by another app: refused and said, and the one there now taken, so it's moved the
// next time it's opened)
sql(`UPDATE pg_users SET poster_at = poster_at + 1 WHERE id = '${uid}'`);
const nudge = async () => {
  await P.p.click('main .pc-cam'); await P.p.waitForFunction(() => document.querySelector('#sheet[open] .pv-frame img')?.naturalWidth > 0, null, { timeout: 15000 }).catch(() => {}); await settle(P, 500);
  await P.p.focus('#sheet .pv-frame'); await P.p.keyboard.press('ArrowDown'); await P.p.click('#sheet .link.done'); await P.p.waitForSelector('#sheet', { state: 'hidden' }); await settle(P, 300);
  return text(P, '#toast');
};
const refused = await nudge(), again = await nudge(), after = rows(`SELECT poster_at, poster_focus FROM pg_users WHERE id = '${uid}'`)[0];
ok(/changed elsewhere/.test(refused) && /Saved/.test(again) && after.poster_at === saved.poster_at + 1 && after.poster_focus !== moved.poster_focus,
  'changed elsewhere: refused and said, then the photo there now moved', JSON.stringify({ refused, again, after }));

// ---- 3. Your code: the link that adds you in Chat, as a QR code, and copied ----
await P.p.click('main .hero .pill:has-text("Your code")'); await P.p.waitForSelector('#sheet .qr svg', { timeout: 10000 }).catch(() => {}); await settle(P, 600);
const link = `${CHAT}/#add=rowan`;
const drawn = await P.p.evaluate(async (l) => {
  const svg = document.querySelector('#sheet .qr svg'); if (!svg) return null;
  const { qrSvg } = await import('./qr.js');
  const want = new DOMParser().parseFromString(qrSvg(l), 'image/svg+xml').querySelector('path').getAttribute('d');
  return { same: svg.querySelector('path')?.getAttribute('d') === want, label: svg.getAttribute('aria-label') };
}, link);
ok(drawn?.same && /@rowan/.test(drawn.label), 'your code: a QR code of the link that adds you in Chat', JSON.stringify(drawn));
ok(/Rowan Hale/.test(await sheetText(P)) && /@rowan/.test(await sheetText(P)), 'with who it adds');
await P.p.click('#sheet .btn:has-text("Copy link")'); await settle(P, 400);
const copied = await P.p.evaluate(() => navigator.clipboard.readText()).catch((e) => String(e));
ok(copied === link && /Link copied/.test(await text(P, '#toast')), 'the link, copied', copied);
await shot(P, '02-code');
await closeSheet(P);

// ---- 4. Each app's sheet: what it keeps of yours, and the way into it ----
const cards = await P.p.$$eval('main .app', (as) => as.map((a) => a.innerText.replace(/\s+/g, ' ').trim()));
ok(/^Chat 4 friends · 9 sent 6 places in your passport Open$/.test(cards[0]) && /^Weather 4 places Alerts on Open$/.test(cards[1]), 'each app\'s card: what you have there, and Open', JSON.stringify(cards));
await P.p.click('main .app:has(b:text-is("Chat")) .about'); await P.p.waitForSelector('#sheet .stats'); await settle(P, 600);
const inf = await sheetText(P);
ok(/4 friends/.test(inf) && /9 pigeons sent/.test(inf) && /6 places in your passport/.test(inf) && /2 groups/.test(inf), 'Chat: friends, pigeons sent (now, in groups, and gone after a month), passport, groups', inf);
const counted = await P.p.$$eval('#sheet .stats .stat span', (ss) => ss.map((x) => x.textContent));
ok(counted.length === 4 && !counted.some((c) => /letter|message/i.test(c)) && (await P.p.$eval('#sheet a.btn', (a) => a.getAttribute('href'))) === `${CHAT}/`, 'the letters not counted (they can\'t be read here), and the way in', JSON.stringify(counted));
ok((await P.p.$eval('#sheet', (d) => document.getElementById(d.getAttribute('aria-labelledby'))?.textContent)) === 'Chat', 'the sheet named, for a screen reader');
await shot(P, '03-app-inflight');
await closeSheet(P);
await P.p.click('main .app:has(b:text-is("Weather")) .about'); await P.p.waitForSelector('#sheet .app-head'); await settle(P, 600);
const wxs = await sheetText(P);
ok(/Saved places 4/.test(wxs) && /London · Edinburgh · St Ives · Łódź/.test(wxs) && /Notifications 1 place · morning brief/.test(wxs) && /Units °C · km\/h/.test(wxs), 'Weather: its places by name, notifications, units', wxs);
ok((await P.p.$eval('#sheet a.btn', (a) => a.getAttribute('href'))) === `${WX}/`, 'and the way in');
await shot(P, '04-app-weather');
await closeSheet(P);

// ---- 5. Signed in with a password, and no passkey: a word about one (here, where one can be made), and one made ----
const ck0 = await P.p.locator('main .row:has(b:text-is("Sign-in and security"))').innerText().then((t) => t.replace(/\s+/g, ' ').trim());
ok(!(await P.p.$('main .checkup')) && /Sign-in and security \d to do/.test(ck0), 'with things to do: its row says how many (the check-up kept in Sign-in and security)', ck0);
await signOut(P); await signIn(P);
await P.p.waitForSelector('#sheet .nudge', { timeout: 8000 }).catch(() => {}); await settle(P, 600);
ok(/Sign in faster next time/.test(await sheetText(P)), 'after a password sign-in: a word about a passkey', await sheetText(P));
ok(Number(await P.p.evaluate(() => localStorage.getItem('acct:nudged'))) > t, 'noted, so it\'s not said again for a month');
await shot(P, '05-nudge');
await P.p.click('#sheet .btn:has-text("Add a passkey")'); await confirmIfAsked(P, PW);
// (then a word on Chat's messages, which a passkey can open too: not now, here)
await P.p.click('#sheet .link:has-text("Not now")', { timeout: 20000 }).catch(() => {});
await P.p.waitForSelector('#sheet', { state: 'hidden', timeout: 20000 }).catch(() => {}); await settle(P, 900);
const made = await text(P, '#toast');
await openRow(P, 'Sign-in and security');
ok(rows(`SELECT id FROM pg_passkeys WHERE user_id = '${uid}'`).length === 1 && /Passkeys 1/.test(await sheetText(P)), 'a passkey made from it', made);
await closeSheet(P);
// (a laptop that can't make one isn't asked)
const L = await browser('laptop', { laptop: true });
await account(L); await signIn(L); await settle(L, 2200);
ok(!(await L.p.$('#sheet[open]')), 'a laptop with no way to make a passkey isn\'t asked');

// ---- 6. The check-up: how it stands said by Sign-in and security's row, and at the head of its sheet; a fix opens
// over it, Back returns ----
const ckRow = () => P.p.locator('main .row:has(b:text-is("Sign-in and security"))').innerText().then((t) => t.replace(/\s+/g, ' ').trim());
const openCheckup = async () => { await P.p.click('main .row:has(b:text-is("Sign-in and security"))'); await P.p.waitForSelector('#sheet[open] .checkup'); await settle(P, 500); };
const shut = async () => { await P.p.keyboard.press('Escape'); await P.p.waitForSelector('#sheet', { state: 'hidden' }).catch(() => {}); await settle(P, 300); };
// (the email confirmed; the password not yet checked, as for an account from before)
sql(`UPDATE pg_users SET email_ok = ${t}, pw_checked_at = NULL, pw_leaked = 0 WHERE id = '${uid}'`);
await account(P);
ok(/Sign-in and security 1 to do/.test(await ckRow()) && !(await P.p.$('main .checkup')), 'one thing to do: its row says so (nothing on the page itself)', await ckRow());
await openCheckup();
ok(/1 thing to do/.test(await text(P, '#sheet .checkup')) && (await P.p.$$('#sheet .ck-row.ok')).length === 3 && /Check your password for data breaches/.test(await text(P, '#sheet .checkup')), 'opened: what\'s left to do, and what\'s done', await text(P, '#sheet .checkup'));
await P.p.click('#sheet .ck-row:has-text("Check your password") .mini'); await P.p.waitForSelector('#sheet h2:text-is("Check your password")'); await settle(P, 400);
await P.p.click('#sheet .sheet-head .back'); await P.p.waitForSelector('#sheet h2:text-is("Sign-in and security")'); await settle(P, 400);
ok(!!(await P.p.$('#sheet .checkup')), 'its fix opens over it, and Back returns to it');
await shut();
// all done
sql(`UPDATE pg_users SET pw_checked_at = ${t}, pw_leaked = 0 WHERE id = '${uid}'`);
await account(P);
ok(/Sign-in and security Secure/.test(await ckRow()) && !(await P.p.$('main .banner')), 'all done: its row says so', await ckRow());
await openCheckup();
ok(/Well protected/.test(await text(P, '#sheet .checkup')) && (await P.p.$$('#sheet .ck-row')).length === 0, 'opened: well protected, folded to just that (not the four checks)', await text(P, '#sheet .checkup'));
await shot(P, '06-checkup-sheet');
await shut();
// a password found in a data breach: the one check that's said up top too, with the way to change it
sql(`UPDATE pg_users SET pw_leaked = 1 WHERE id = '${uid}'`);
await account(P);
ok(/Your password is in a data breach/.test(await text(P, 'main .banner')) && /Sign-in and security 1 to do/.test(await ckRow()), 'a leaked password: said up top, as well as in the check-up', await text(P, 'main .banner'));
await shot(P, '06b-leaked');
await P.p.click('main .banner .mini'); await P.p.waitForSelector('#sheet[open] .sheet-body'); await settle(P, 400);
ok(/password/i.test(await text(P, '#sheet h2')), 'its Change opens a new password', await text(P, '#sheet h2'));
await shut();
sql(`UPDATE pg_users SET pw_leaked = 0 WHERE id = '${uid}'`);
await account(P);

// ---- 7. "Not you?": a password sign-in from the laptop (not a passkey one from elsewhere, nor this phone's own) ----
sql(`INSERT INTO pg_events (user_id, at, kind, app, device, place, detail) VALUES ('${uid}', ${t - DAY}, 'signin', 'Weather', 'Mac · Safari', 'Leeds, United Kingdom', 'Passkey')`);
await openSecure(P, 'Recent activity'); await P.p.waitForSelector('#sheet .day', { timeout: 10000 }).catch(() => {}); await settle(P, 500);
const flagged = await P.p.$$eval('#sheet .activity .row', (rs) => rs.filter((r) => r.querySelector('.mini')).map((r) => r.querySelector('small').textContent));
ok(flagged.length === 1 && /Windows · Chrome/.test(flagged[0]), 'only the laptop\'s password sign-in asks "Not you?"', JSON.stringify(flagged));
const act = await P.p.evaluate(() => ({ marks: [...document.querySelectorAll('#sheet .activity .row .app-mark')].map((i) => i.alt), times: document.querySelectorAll('#sheet .activity .row .t').length,
  rows: document.querySelectorAll('#sheet .activity .row').length, day: document.querySelector('#sheet .day h4')?.textContent }));
ok(act.marks.includes('Weather') && act.marks.includes('Account') && act.times === act.rows && /^Today · \S/.test(act.day), 'each its time, and the app it happened in; the place said once by the day', JSON.stringify(act));
await P.p.click('#sheet .seg button:text-is("Sign-ins")'); await settle(P, 300);
const ins = await P.p.$$eval('#sheet .activity .row b', (bs) => bs.map((b) => b.textContent));
await P.p.click('#sheet .seg button:text-is("Changes")'); await settle(P, 300);
const chg = await P.p.$$eval('#sheet .activity .row b', (bs) => bs.map((b) => b.textContent));
ok(ins.length > 0 && ins.every((t) => /^(Signed|Account made)/.test(t)) && chg.length > 0 && chg.every((t) => !/^Signed in/.test(t)), 'a filter: the sign-ins, and the changes', JSON.stringify({ ins, chg }));
await P.p.click('#sheet .seg button:text-is("All")'); await settle(P, 300);
await shot(P, '07-activity');
await P.p.click('#sheet .mini:text-is("Not you?")'); await P.p.waitForSelector('#sheet .steps'); await settle(P, 600);
ok(/Signed in with your password/.test(await sheetText(P)) && /Windows · Chrome/.test(await sheetText(P)) && /Sign out everywhere else/.test(await sheetText(P)) && /Choose a new password/.test(await sheetText(P)), 'what happened, and the two steps', await sheetText(P));
await shot(P, '08-not-you');
await P.p.click('#sheet .btn.danger'); await confirmIfAsked(P, PW);
await P.p.waitForSelector('#sheet h2:text-is("Change password")', { timeout: 15000 }).catch(() => {}); await settle(P, 500);
ok(rows(`SELECT hash FROM pg_sessions WHERE user_id = '${uid}'`).length === 1, 'every other device signed out');
ok(/Change password/.test(await text(P, '#sheet h2')), 'then on to a new password', await text(P, '#sheet h2'));
await account(L);
ok(!!(await L.p.$('main input[type=password]')), 'the laptop: signed out');
await P.p.evaluate(() => document.querySelector('#sheet')?.close()); await settle(P, 300);

// ---- 8. Rows slid to show what they do: a device signed out, a passkey removed ----
await signIn(L);
sql(`INSERT INTO pg_passkeys (id, user_id, public_key, alg, created_at, label, provider) SELECT 'spare-key', user_id, public_key, alg, ${t - DAY}, 'Old phone', 'Google Password Manager' FROM pg_passkeys WHERE user_id = '${uid}'`);
await account(P);
await openSecure(P, 'Signed-in devices');
ok((await P.p.$$('#sheet .swipe')).length === 1 && await P.p.$eval('#sheet .row.current', (e) => !e.closest('.swipe')), 'other devices slide; this one doesn\'t');
await drag(P, '#sheet .swipe > .row', 0, -60);
ok(!(await P.p.$('#sheet .swipe.open')), 'up and down: no slide');
await drag(P, '#sheet .swipe > .row', -150);
ok(!!(await P.p.$('#sheet .swipe.open')) && /Sign out/.test(await text(P, '#sheet .swipe-act')), 'slid: Sign out');
await shot(P, '09-device-slid');
await P.p.click('#sheet .swipe-act'); await confirmIfAsked(P, PW); await settle(P, 1200);
ok(rows(`SELECT hash FROM pg_sessions WHERE user_id = '${uid}'`).length === 1 && (await P.p.$$('#sheet .swipe')).length === 0, 'the laptop signed out by it', String(rows(`SELECT hash FROM pg_sessions WHERE user_id = '${uid}'`).length));
await closeSheet(P);
await openSecure(P, 'Passkeys'); await settle(P, 600);
await drag(P, '#sheet .swipe:has(b:text-is("Old phone")) > .row', -150);
ok(/Remove/.test(await text(P, '#sheet .swipe.open .swipe-act')), 'a passkey slid: Remove');
// (a tap on it, open, closes it rather than opening it)
await P.p.click('#sheet .swipe.open > .row', { position: { x: 180, y: 20 } }); await settle(P, 600);
ok(!(await P.p.$('#sheet .swipe.open')) && /Passkeys/.test(await text(P, '#sheet h2')), 'tapped while open: closed, still the list');
await drag(P, '#sheet .swipe:has(b:text-is("Old phone")) > .row', -150);
await P.p.click('#sheet .swipe.open .swipe-act'); await confirmIfAsked(P, PW); await settle(P, 1200);
ok(rows(`SELECT id FROM pg_passkeys WHERE user_id = '${uid}'`).map((r) => r.id).join() !== '' && !rows(`SELECT id FROM pg_passkeys WHERE id = 'spare-key'`).length, 'removed by it, the other kept');
await closeSheet(P);

// ---- 9. A wide screen: two columns, who you are and how safe beside the rest; one on a phone ----
await account(L); await signIn(L); await settle(L, 900);
const cols = await L.p.evaluate(() => { const a = document.querySelector('.col-a').getBoundingClientRect(), b = document.querySelector('.col-b').getBoundingClientRect(); return { a: [a.left, a.right, a.top], b: [b.left, b.top] }; });
ok(cols.a[1] < cols.b[0] && Math.abs(cols.a[2] - cols.b[1]) < 40, 'wide: two columns, side by side', JSON.stringify(cols));
const halves = await L.p.evaluate(() => ['.col-a', '.col-b'].map((c) => [...document.querySelectorAll(`${c} section.section > h3`)].map((h) => h.textContent)));
ok(halves[0].join() === '' && halves[1].join() === 'Your apps,Account,Preferences', 'two columns: who you are; and your apps (three across), the account (sign-in and security, your data) and the settings', JSON.stringify(halves));
await shot(L, '10-wide');
// (a short window, so the profile can scroll away: side by side, with the account two rows, the page is short)
await L.p.setViewportSize({ width: 1280, height: 320 }); await L.p.evaluate(() => scrollTo(0, 900)); await settle(L, 500);
ok(await L.p.evaluate(() => document.querySelector('.whobar').classList.contains('on') && /Rowan/.test(document.querySelector('.whobar').textContent)), 'scrolled on, in a short window: whose account, in a bar at the top');
// (a tall one: who you are stays in sight beside the rest, so there's no bar for it)
await L.p.setViewportSize({ width: 1280, height: 900 }); await L.p.evaluate(() => scrollTo(0, 400)); await settle(L, 500);
ok(await L.p.evaluate(() => { const c = document.querySelector('.col-a').getBoundingClientRect(); return c.top >= 0 && getComputedStyle(document.querySelector('.col-a')).position === 'sticky' && !document.querySelector('.whobar').classList.contains('on'); }),
  'scrolled on, in a tall one: who you are stays in sight beside the rest (no bar for it)', await L.p.evaluate(() => JSON.stringify({ top: document.querySelector('.col-a').getBoundingClientRect().top, y: scrollY, h: document.documentElement.scrollHeight, bar: document.querySelector('.whobar').className, pos: getComputedStyle(document.querySelector('.col-a')).position })));
await L.p.setViewportSize({ width: 1280, height: 320 });
await L.p.setViewportSize({ width: 1280, height: 860 }); await L.p.evaluate(() => scrollTo(0, 0));
const one = await P.p.evaluate(() => document.querySelector('.col-b').getBoundingClientRect().top - document.querySelector('.col-a').getBoundingClientRect().bottom);
ok(one >= 0, 'a phone: one column', String(one));
const bar = async () => P.p.evaluate(() => document.querySelector('.whobar').classList.contains('on'));
await P.p.evaluate(() => scrollTo(0, 0)); await settle(P, 500);
const top = await bar(); await P.p.evaluate(() => scrollTo(0, 900)); await settle(P, 500); const down = await bar();
await P.p.evaluate(() => scrollTo(0, 0)); await settle(P, 500);
ok(!top && down && !(await bar()), 'a phone: the bar comes once the profile\'s scrolled away, and goes at the top', JSON.stringify({ top, down }));

// ---- 10. Your data: as a PDF to read and keep, written from the export (the server's JSON) ----
await account(P);
await openRow(P, 'Your data');
ok(/Download as PDF/.test(await sheetText(P)) && !/Download as JSON/.test(await sheetText(P)), 'your data: as a PDF (the JSON it\'s written from stays the server\'s)');
await shot(P, '11-data');
const [dl] = await Promise.all([P.p.waitForEvent('download', { timeout: 60000 }), (async () => { await P.p.click('#sheet .row:has-text("Download as PDF")'); await confirmIfAsked(P, PW); })()]);
const pdfPath = `${out}/data.pdf`; await dl.saveAs(pdfPath);
const sh = (c) => { try { return execSync(c, { stdio: 'pipe' }).toString(); } catch (e) { return 'ERROR ' + e.stderr; } };
const info = sh(`pdfinfo "${pdfPath}"`), pages = Number(/Pages:\s+(\d+)/.exec(info)?.[1] || 0);
ok(dl.suggestedFilename() === 'georgefarrowgreen-account-rowan.pdf' && pages >= 2 && /Title:\s+Your data · Rowan Hale/.test(info), 'a PDF, named for you, of a few pages', `${dl.suggestedFilename()} ${pages} pages`);
const strict = sh(`python3 -c "import pypdf,sys; r=pypdf.PdfReader(sys.argv[1], strict=True); print(len(r.pages))" "${pdfPath}"`).trim();
ok(strict === String(pages), 'well formed (read strictly)', strict.slice(0, 200));
const words = sh(`pdftotext -layout "${pdfPath}" -`).replace(/[ \t]+/g, ' ');
for (const [re, what] of [[/Your data/, 'its title'], [/Rowan Hale/, 'your name'], [/@rowan/, 'handle'], [/rowan@example\.com Confirmed/, 'email, confirmed'], [/Sign-in and security/, 'sign-in'],
  [/Signed in with your password/, 'recent activity, in words'], [/Preferences/, 'preferences'], [/\b4 2 9 1\b/, 'Chat\'s figures (friends, groups, sent, had)'], [/Chloé Durand @friend3/, 'friends, by name'], [/Book club/, 'groups'], [/Pip .*1,235 km/, 'birds'], [/pigeons sent/, '...named'],
  [/Place 1/, 'the passport'], [/A pigeon lands On/, 'Chat\'s notifications'], [/St Ives 50\.21° N 5\.48° W/, 'Weather\'s places'], [/07:00, for London/, 'the morning brief'],
  [/°C · km\/h · mm/, 'units'], [new RegExp(`Page 1 of ${pages}`), 'page numbers']]) ok(re.test(words), `the PDF: ${what}`, re.test(words) ? '' : words.slice(0, 600));
ok(!/Łódź/.test(words) && !/\?\?d\?/.test(words), 'a name Helvetica can\'t show: not as broken text...');
const imgs = sh(`pdfimages -list "${pdfPath}"`).trim().split('\n').slice(2);
ok(imgs.length >= 4 && imgs.some((l) => /\bjpeg\b/.test(l) && /\b64\b|\b512\b|\b300\b/.test(l)) && imgs.some((l) => /\bimage\b.*\brgb\b.*\b(8)\b/.test(l) && !/jpeg/.test(l)),
  '...but drawn as a picture of itself; and your photo and the apps\' icons in it', imgs.join(' | '));
sh(`pdftoppm -r 70 -png "${pdfPath}" "${out}/pdf-page"`);
const json = await P.p.evaluate(() => fetch('/api/account/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((r) => r.json()).catch(() => ({})));
ok(json.inflight?.pigeons?.sent === 9 && json.inflight.pigeons.received === 1 && json.weather?.places?.length === 4,
  'and the export it\'s written from: pigeons sent and had counted as Chat\'s log counts them', JSON.stringify(json.inflight?.pigeons));
await closeSheet(P);

console.log(errs.length ? 'PAGE ERRORS\n' + errs.join('\n') : 'no page errors');
ok(!errs.length, 'no page errors');
console.log(`FAILS ${fails}`);
await b.close();
