// InFlight notifications, end to end against the local stack.
// Push goes to a stand-in push service (PIGEON_PUSH_URL); this script plays the
// phone: it makes the subscription keys and decrypts what arrives (RFC 8291).
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
const [,, S, out] = process.argv;
const BASE = 'http://localhost:8788', URL = BASE + '/pigeon/';
const AUDIT = new Function('return (' + readFileSync(`${S}/wr/audit.mjs`, 'utf8').match(/const AUDIT = (\(\) => \{[\s\S]*?\n\});/)[1] + ')')();
// the local database is a file shared with the running server; retry if it's busy
const sql0 = (q) => execSync(`${S}/wr/node_modules/.bin/wrangler d1 execute bio-db --local --persist-to ${S}/wrstate --command "${q}"`, { cwd: process.env.APP_ROOT, stdio: 'pipe' }).toString();
const sql = (q) => { for (let i = 0; ; i++) { try { return sql0(q); } catch (e) { if (i > 5 || !/SQLITE_BUSY/.test(String(e.stdout) + String(e.stderr) + e.message)) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400); } } };
const pushes = () => readFileSync(`${S}/pushbox.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const mails = () => readFileSync(`${S}/mailbox.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((m) => m.body || m);
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const errs = []; let fails = 0; process.on('exit', () => console.log('errs-at-exit', errs));
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${extra ? '  — ' + extra : ''}`); if (!c) fails++; };
const wc = globalThis.crypto.subtle;
const b64u = (u) => Buffer.from(u).toString('base64url'), unb64u = (s) => new Uint8Array(Buffer.from(s, 'base64url'));

// ---- a "phone" with push keys we control ----
async function makeKeys() {
  const kp = await wc.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  return { kp, pub: new Uint8Array(await wc.exportKey('raw', kp.publicKey)), auth: globalThis.crypto.getRandomValues(new Uint8Array(16)) };
}
async function hkdf(salt, ikm, info, len) { const k = await wc.importKey('raw', ikm, 'HKDF', false, ['deriveBits']); return new Uint8Array(await wc.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8)); }
const te = new TextEncoder();
async function decrypt(keys, body) {
  const buf = new Uint8Array(Buffer.from(body, 'base64'));
  const salt = buf.slice(0, 16), idlen = buf[20], asPub = buf.slice(21, 21 + idlen), ct = buf.slice(21 + idlen);
  const asKey = await wc.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await wc.deriveBits({ name: 'ECDH', public: asKey }, keys.kp.privateKey, 256));
  const ikm = await hkdf(keys.auth, shared, new Uint8Array([...te.encode('WebPush: info\0'), ...keys.pub, ...asPub]), 32);
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16), nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const pt = new Uint8Array(await wc.decrypt({ name: 'AES-GCM', iv: nonce }, await wc.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), ct));
  let end = pt.length - 1; while (end > 0 && pt[end] === 0) end--;
  if (pt[end] !== 2) throw new Error('bad padding delimiter');
  return JSON.parse(new TextDecoder().decode(pt.slice(0, end)));
}
async function vapidOk(h) {
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(h.authorization || ''); if (!m) return false;
  const [hd, cl, sig] = m[1].split('.');
  const key = await wc.importKey('raw', unb64u(m[2]), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const good = await wc.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, unb64u(sig), te.encode(`${hd}.${cl}`));
  const claims = JSON.parse(Buffer.from(cl, 'base64url'));
  return good && claims.aud === 'https://fcm.googleapis.com' && claims.exp > Date.now() / 1000;
}

async function phone(name, keys) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36', hasTouch: true, timezoneId: 'Europe/London',
    userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' });
  await ctx.grantPermissions(['notifications'], { origin: BASE });
  if (keys) await ctx.addInitScript(({ endpoint, p256dh, auth }) => {
    // headless Chromium has no real push service; stand in for one with keys the test holds
    // like a real browser, the subscription survives reloads
    const make = (key) => ({ endpoint, options: { applicationServerKey: key }, toJSON: () => ({ endpoint, keys: { p256dh, auth } }), unsubscribe: async () => { localStorage.removeItem('fakesub'); return true; } });
    const toB = (u8) => btoa(String.fromCharCode(...u8)), fromB = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer;
    PushManager.prototype.getSubscription = async function () { const k = localStorage.getItem('fakesub'); return k ? make(fromB(k)) : null; };
    PushManager.prototype.subscribe = async function (o) { const k = new Uint8Array(o.applicationServerKey.buffer || o.applicationServerKey); localStorage.setItem('fakesub', toB(k)); return make(k.buffer); };
  }, { endpoint: `https://fcm.googleapis.com/fcm/send/${name}-device`, p256dh: b64u(keys.pub), auth: b64u(keys.auth) });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${name}: ${e}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(`${name}: ${m.text()}`); });
  await p.goto(URL);
  return { p, ctx, name };
}
const txt = async (ph, s) => (await ph.p.locator(s).first().innerText()).replace(/\s+/g, ' ');
async function signup(ph, name, handle, email, city) {
  await ph.p.waitForSelector('.welcome'); await ph.p.click('[data-act=to][data-id=signup]');
  await ph.p.fill('#f-name', name); await ph.p.fill('#f-handle', handle); await ph.p.fill('#f-email', email); await ph.p.fill('#f-password', 'a long test password');
  await ph.p.click('[data-form=signup] .btn'); await ph.p.waitForSelector('#city', { state: 'attached', timeout: 20000 });
  await ph.p.selectOption('#city', city); await ph.p.waitForSelector('[data-act=onbdone]', { timeout: 20000 });
  await ph.p.waitForSelector('[data-act=pkadd]'); await ph.p.click('[data-act=onbdone]'); await ph.p.waitForSelector('.tabs');
}
// (retry once: the local server can drop an idle keep-alive connection while sql() runs)
const tick = async (secret = 'tick-test-secret') => { const go = () => fetch(BASE + '/api/pigeon/notify-tick', { method: 'POST', headers: { Authorization: 'Bearer ' + secret } });
  let r; try { r = await go(); } catch (_) { r = await go(); } return { status: r.status, ...(await r.json()) }; };
const lastPush = async (keys, since) => { const ps = pushes().filter((x) => x.at > since); return ps.length ? { ...ps.at(-1), msg: await decrypt(keys, ps.at(-1).body) } : null; };
const idOf = (ph) => ph.p.evaluate(() => new Promise((res) => { const r = indexedDB.open('inflight'); r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('session'); g.onsuccess = () => res(g.result.me.id); }; }));

await fetch('http://127.0.0.1:8798/mode', { method: 'POST', body: '201' });
const gKeys = await makeKeys();
const G = await phone('george', gKeys), M = await phone('mira');
await signup(G, 'George Farrow-Green', 'george', 'george@example.com', 'London');
await signup(M, 'Mira Okafor', 'mira', 'mira@example.com', 'Paris');
const gId = await idOf(G), mId = await idOf(M);
sql("UPDATE pg_users SET notify_prefs = json_object('names', json('true'))");   // (names on: since 1.0.2 lock-screen names are off unless chosen)

// ---- George turns push on in Account ----
await G.p.click('[data-act=tab][data-id=account]'); await G.p.waitForTimeout(700); await G.p.click('#screen > main.view [data-act=notifysheet]'); await G.p.waitForSelector('[data-act=pushtoggle]');
ok(await G.p.getAttribute('[data-act=pushtoggle]', 'aria-checked') === 'false', 'push starts off');
ok(await M.p.isVisible('[data-act=tab][data-id=account]') && true, 'Mira signed in');
let t0 = Date.now();
await G.p.click('[data-act=pushtoggle]'); await G.p.waitForSelector('[data-act=pushtoggle][aria-checked=true]', { timeout: 10000 });
ok(true, 'turning push on subscribes this phone');
ok(/"user_id": "[^"]+"/.test(sql("SELECT user_id, session FROM pg_push")), 'server stored the subscription for this sign-in');
ok(await G.p.evaluate(async () => !!(await navigator.serviceWorker.getRegistration('/pigeon/'))), 'service worker registered at /pigeon/');
await G.p.screenshot({ path: `${out}/notify-account.png` });
const a1 = await G.p.evaluate(AUDIT); ok(!a1.issues.length, 'account screen: no overlaps', a1.issues.join(' '));

// ---- test notification: arrives encrypted, signed, and decrypts on the phone ----
t0 = Date.now();
await G.p.click('[data-act=pushtest]'); await G.p.waitForSelector('.toast:has-text("Test sent")');
const tp = await lastPush(gKeys, t0);
ok(!!tp && tp.headers['x-endpoint'] === 'https://fcm.googleapis.com/fcm/send/george-device', 'test push sent to the phone’s push service');
ok(tp && tp.headers['content-encoding'] === 'aes128gcm' && !Buffer.from(tp.body, 'base64').toString().includes('Notifications'), 'payload is encrypted (aes128gcm), unreadable in transit');
ok(tp && /Notifications are on/.test(tp.msg.body), 'phone decrypts the test notification', tp?.msg.body);
ok(await vapidOk(tp.headers), 'VAPID signature verifies against the server’s key');

// ---- friends; Mira gets a request (no push for her), George accepts, Mira... ----
await M.p.click('[data-act=tab][data-id=friends]'); await M.p.click('.nb-right [data-act=addfriend]'); await M.p.fill('#add-h', 'george');
t0 = Date.now(); await M.p.click('[data-act=submit][data-id=add-form]'); await M.p.waitForSelector('.toast, .sent', { timeout: 10000 }).catch(() => {}); await M.p.waitForTimeout(1500);
const fr = await lastPush(gKeys, t0);
ok(fr && /^Mira \(@mira\) wants to be friends/.test(fr.msg.body) && fr.msg.url === '/pigeon/#requests', 'friend request notifies George', fr?.msg.body);
await G.p.reload(); await G.p.waitForSelector('.tabs'); await G.p.click('[data-act=tab][data-id=friends]'); await G.p.click('[data-act=requests]'); await G.p.click('[data-act=accept]');
await G.p.waitForTimeout(500); await G.p.click('.sheet [data-act=close].nbtn');

// ---- Mira sends a pigeon; it lands; the tick tells George ----
await M.p.reload(); await M.p.waitForSelector('.tabs'); await M.p.click('[data-act=tab][data-id=messages]'); await M.p.click('[data-act=newmsg]'); await M.p.click('.sheet [data-act=open]'); await M.p.waitForSelector('.chatnav');
await M.p.fill('#msg', 'Secret words that must never reach a notification'); await M.p.click('.send'); await M.p.waitForSelector('.msgs .b.up', { timeout: 10000 });
ok((await tick('wrong')).status === 401, 'tick refuses a wrong secret');
let r = await tick(); ok(r.landed === 0, 'nothing notified while the pigeon flies');
sql("UPDATE pg_msgs SET deliver_at = (strftime('%s','now') * 1000) - 5000");
t0 = Date.now(); r = await tick();
ok(r.landed === 1 && r.pushes === 1, 'tick notices the landing and pushes once', JSON.stringify(r));
const lp = await lastPush(gKeys, t0);
ok(lp && lp.msg.title === 'Mira' && lp.msg.body === 'A pigeon has landed.' && lp.msg.url === `/pigeon/#open=${mId}`, 'landing notification: who, not what', JSON.stringify(lp?.msg));
ok(!JSON.stringify(lp.msg).includes('Secret'), 'message text never appears in a notification');
r = await tick(); ok(r.landed === 0, 'no repeat notification for the same pigeon');

// ---- settings: each one changes what arrives ----
const gPrefs = () => JSON.parse(/"notify_prefs": "(.*)"/.exec(sql(`SELECT notify_prefs FROM pg_users WHERE id = '${gId}'`))[1].replace(/\\"/g, '"'));
await G.p.click('[data-act=tab][data-id=account]'); await G.p.waitForTimeout(700); await G.p.click('#screen > main.view [data-act=notifysheet]'); await G.p.waitForSelector('[data-act=npref][data-id=names]');
ok(gPrefs().tz === 'Europe/London', 'quiet hours use the phone’s time zone', gPrefs().tz);
await G.p.screenshot({ path: `${out}/notify-sheet.png` });
const a3 = await G.p.evaluate(AUDIT); ok(!a3.issues.length, 'notifications sheet: no overlaps', a3.issues.join(' '));
await G.p.evaluate(() => { const b = document.querySelector('.sheet .body'); b.scrollTo(0, b.scrollHeight); }); await G.p.waitForTimeout(300);
await G.p.screenshot({ path: `${out}/notify-sheet-bottom.png` });
const send = async (text) => { await M.p.fill('#msg', text); await M.p.click('.send'); await M.p.waitForTimeout(1600); };
const landAll = () => sql("UPDATE pg_msgs SET deliver_at = (strftime('%s','now') * 1000) - 5000 WHERE deliver_at > (strftime('%s','now') * 1000)");
// names off
await G.p.click('[data-act=npref][data-id=names]'); await G.p.waitForSelector('[data-act=npref][data-id=names][aria-checked=false]'); await G.p.waitForTimeout(400);
ok(gPrefs().names === false, 'Show Names turns off (saved to the account)');
await send('second'); landAll(); t0 = Date.now(); r = await tick();
let np = await lastPush(gKeys, t0);
ok(np && np.msg.title === 'InFlight' && !/Mira/.test(JSON.stringify(np.msg)), 'with names off, the lock screen doesn’t say who', JSON.stringify(np?.msg));
// take-off
await G.p.click('[data-act=npref][data-id=takeoff]'); await G.p.waitForTimeout(500);
t0 = Date.now(); await send('third'); await G.p.waitForTimeout(500);
np = await lastPush(gKeys, t0);
ok(np && /on its way to you\. It lands in/.test(np.msg.body), '“A Pigeon Takes Off” notifies when a friend sends one', np?.msg.body);
await G.p.click('[data-act=npref][data-id=names]'); await G.p.click('[data-act=npref][data-id=takeoff]'); await G.p.waitForTimeout(500);
ok(gPrefs().names === true && gPrefs().takeoff === false, 'settings switch back');
// quiet hours: hold, then announce when they end
const hourNow = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', hourCycle: 'h23' }).format(Date.now()));
await G.p.click('[data-act=npref][data-id=quiet]'); await G.p.waitForSelector('select[data-id=quietFrom]');
await G.p.selectOption('select[data-id=quietFrom]', String(hourNow)); await G.p.waitForTimeout(400);
await G.p.selectOption('select[data-id=quietTo]', String((hourNow + 1) % 24)); await G.p.waitForTimeout(600);
ok(gPrefs().quiet && gPrefs().quietFrom === hourNow && gPrefs().quietTo === (hourNow + 1) % 24, 'quiet hours set', `${gPrefs().quietFrom}–${gPrefs().quietTo}`);
landAll(); t0 = Date.now(); r = await tick();
ok(r.held === 1 && r.pushes === 0 && !(await lastPush(gKeys, t0)), 'during quiet hours the landing waits', JSON.stringify(r));
// (switching quiet hours off is itself a request, which may run the tick before we do)
t0 = Date.now(); await G.p.click('[data-act=npref][data-id=quiet]'); await G.p.waitForTimeout(600);
r = await tick(); np = await lastPush(gKeys, t0);
ok(pushes().filter((x) => x.at > t0).length === 1 && np?.msg.title === 'Mira', 'when quiet hours end, it’s announced once', JSON.stringify(np?.msg));
// landings off
await G.p.click('[data-act=npref][data-id=landed]'); await G.p.waitForTimeout(500);
await send('fourth'); landAll(); t0 = Date.now(); r = await tick();
ok(r.pushes === 0 && !(await lastPush(gKeys, t0)), 'with “A Pigeon Lands” off, landings are silent');
await G.p.click('[data-act=npref][data-id=landed]'); await G.p.waitForTimeout(500);
r = await tick(); ok(r.pushes === 0, 'turning it back on doesn’t replay old landings');
await G.p.click('.sheet [data-act=close].nbtn'); await G.p.waitForTimeout(600);
ok((await txt(G, '#screen > main.view [data-act=notifysheet]')).includes('Push'), 'the Account row shows what’s on', (await txt(G, '#screen > main.view [data-act=notifysheet]')));

// ---- tapping it opens the chat ----
await G.p.goto(URL + `#open=${mId}`); await G.p.waitForSelector('.chatnav', { timeout: 15000 });
ok((await txt(G, '.chatnav')).includes('Mira'), 'the notification link opens Mira’s chat');
ok(!(await G.p.evaluate(() => location.hash)), 'link removed from the address bar');
// a real push through the service worker shows a notification
const sw = await G.p.evaluate(async () => (await navigator.serviceWorker.getRegistration('/pigeon/'))?.active?.state);
ok(sw === 'activated', 'service worker is active', sw);
const cdp = await G.ctx.newCDPSession(G.p);
await cdp.send('ServiceWorker.enable');
const regs = await new Promise((res) => { cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => { const r = e.registrations.find((x) => x.scopeURL.endsWith('/pigeon/')); if (r) res(r); }); setTimeout(() => res(null), 3000); });
if (regs) {
  await cdp.send('ServiceWorker.deliverPushMessage', { origin: BASE, registrationId: regs.registrationId, data: JSON.stringify({ title: 'Mira', body: 'A pigeon has landed.', tag: 'from-x', url: '/pigeon/' }) });
  await G.p.waitForTimeout(800);
  const shown = await G.p.evaluate(async () => (await (await navigator.serviceWorker.getRegistration('/pigeon/')).getNotifications()).map((n) => `${n.title}: ${n.body}`));
  ok(shown.includes('Mira: A pigeon has landed.'), 'service worker shows the notification', shown.join(', '));
} else ok(false, 'found the service worker registration over CDP');

// ---- email: Mira turns it on; a pigeon waits unread; she gets one email ----
await M.p.click('.chatnav .back'); await M.p.click('[data-act=tab][data-id=account]'); await M.p.waitForTimeout(700); await M.p.click('#screen > main.view [data-act=notifysheet]'); await M.p.waitForSelector('[data-act=emailtoggle]');
await M.p.click('[data-act=emailtoggle]'); await M.p.waitForSelector('[data-act=emailtoggle][aria-checked=true]');
ok(sql("SELECT notify_email FROM pg_users WHERE handle = 'mira'").includes('"notify_email": 1'), 'Mira turns email on');
ok(/Emails start once you confirm your address/.test(await M.p.locator('.sheet').innerText()), 'until she confirms her address, the sheet says emails wait for it');
await G.p.fill('#msg', 'Lovely to hear from you'); await G.p.click('.send'); await G.p.waitForSelector('.msgs .b.up', { timeout: 10000 });
sql("UPDATE pg_msgs SET deliver_at = (strftime('%s','now') * 1000) - 5000 WHERE recipient IN (SELECT id FROM pg_users WHERE handle = 'mira')");
const m0 = mails().length;
r = await tick(); ok(r.emails === 0, 'no email straight away (push and the app get a head start)');
sql("UPDATE pg_msgs SET deliver_at = (strftime('%s','now') * 1000) - 11 * 60000 WHERE recipient IN (SELECT id FROM pg_users WHERE handle = 'mira')");
sql("UPDATE pg_users SET email_at = (strftime('%s','now') * 1000) - 3600000 WHERE handle = 'mira'");
sql("UPDATE pg_meta SET v = CAST((strftime('%s','now') * 1000) - 7200000 AS TEXT) WHERE k = 'notify_since'");   // as if notifications went live 2 hours ago
await tick(); await new Promise((s) => setTimeout(s, 300));
ok(!mails().slice(m0).some((x) => x.to === 'mira@example.com' && /landed/.test(x.subject)), 'no notification email to an address that isn’t confirmed');
const cmail = mails().find((x) => x.to === 'mira@example.com' && /Confirm your email/.test(x.subject));
ok(cmail && /#verify=/.test(cmail.text) && !/Lovely/.test(cmail.text), 'signing up sent her a confirm link');
await M.p.goto(BASE + '/pigeon/' + /#verify=[A-Za-z0-9_-]+/.exec(cmail.text)[0]); await M.p.waitForSelector('.tabs', { timeout: 15000 });
await M.p.waitForFunction(() => /Email confirmed/.test(document.querySelector('.toast')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
ok(/Email confirmed for @mira/.test(await M.p.locator('.toast').innerText().catch(() => '')), 'tapping it confirms her address');
const [cst] = await fetch(BASE + '/api/pigeon/confirm-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: /#verify=([A-Za-z0-9_-]+)/.exec(cmail.text)[1] }) }).then((x) => [x.status]);
ok(cst === 400, 'and the link works once', String(cst));
r = await tick(); await new Promise((s) => setTimeout(s, 300));
const em = mails().slice(m0).at(-1);
// (the minute-by-minute background tick may send it rather than this one: count what arrived)
const toMira = mails().slice(m0).filter((x) => x.to === 'mira@example.com');
ok(toMira.length === 1 && /A pigeon from George has landed/.test(em.subject), 'Mira gets one email after a while', `${toMira.length} email(s): ${em?.subject}`);
ok(!em.text.includes('Lovely') && !em.html.includes('Lovely') && /#open=/.test(em.text), 'email doesn’t contain the message, and links to the chat');
const unsub = /Turn these emails off: (\S+)/.exec(em.text)?.[1];
ok(em.headers?.['List-Unsubscribe'] === `<${unsub}>` && em.headers?.['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click', 'email has one-click unsubscribe headers');
r = await tick(); ok(r.emails === 0, 'no second email within half an hour');
// unsubscribe: GET only shows a button; POST turns it off
const ug = await fetch(unsub); const ugt = await ug.text();
ok(ug.status === 200 && /Turn Off Emails/.test(ugt) && sql("SELECT notify_email FROM pg_users WHERE handle = 'mira'").includes('"notify_email": 1'), 'unsubscribe link asks first (mail scanners can’t unsubscribe you)');
ok((await (await fetch(unsub.replace(/t=[^&]+/, 't=wrong'), { method: 'POST' })).text()).includes('doesn’t work'), 'a forged unsubscribe link does nothing');
await fetch(unsub, { method: 'POST' });
ok(sql("SELECT notify_email FROM pg_users WHERE handle = 'mira'").includes('"notify_email": 0'), 'one-click unsubscribe turns email off');

// ---- devices that go away stop getting pushes ----
await fetch('http://127.0.0.1:8798/mode', { method: 'POST', body: '410' });
await G.p.click('.chatnav .back'); await G.p.click('[data-act=tab][data-id=account]'); await G.p.waitForTimeout(700); await G.p.click('#screen > main.view [data-act=notifysheet]'); await G.p.click('[data-act=pushtest]'); await G.p.waitForTimeout(800);
ok(sql("SELECT COUNT(*) AS n FROM pg_push").includes('"n": 0'), 'a subscription the push service says is gone is deleted');
await fetch('http://127.0.0.1:8798/mode', { method: 'POST', body: '201' });
await G.p.evaluate(() => localStorage.removeItem('inflight-pushsub'));   // (a day later: the phone re-sends its subscription once a day)
await G.p.reload(); await G.p.waitForSelector('.tabs'); await G.p.click('[data-act=tab][data-id=account]');
// the subscription is re-sent on launch, so it comes back
ok(sql("SELECT COUNT(*) AS n FROM pg_push").includes('"n": 1'), 'reopening the app re-registers this phone');
if (await G.p.$('.sheet')) { await G.p.click('.sheet [data-act=close]').catch(() => {}); await G.p.waitForTimeout(400); }
await G.p.click('[data-act=tab][data-id=account]').catch(() => {}); await G.p.locator('#screen > main.view [data-act=signout]').scrollIntoViewIfNeeded(); await G.p.click('#screen > main.view [data-act=signout]'); await G.p.click('.asheet [data-act=signoutgo]'); await G.p.waitForSelector('.welcome');
ok(sql("SELECT COUNT(*) AS n FROM pg_push").includes('"n": 0'), 'signing out stops notifications to this phone');
// a sign-in that ends elsewhere (password reset, sign out everywhere) also stops them
await G.p.click('[data-act=to][data-id=signin]'); await G.p.fill('#f-email', 'george@example.com'); await G.p.fill('#f-password', 'a long test password');
await G.p.click('[data-form=signin] .btn'); await G.p.waitForSelector('.tabs', { timeout: 20000 });
await G.p.click('[data-act=tab][data-id=account]'); await G.p.waitForTimeout(700); await G.p.click('#screen > main.view [data-act=notifysheet]'); await G.p.click('[data-act=pushtoggle]'); await G.p.waitForSelector('[data-act=pushtoggle][aria-checked=true]');
sql(`DELETE FROM pg_sessions WHERE user_id = '${gId}'`);
await tick();
const before = pushes().length;
sql(`INSERT INTO pg_msgs (id, sender, recipient, ct, km, sent_at, deliver_at) VALUES ('00000000-0000-4000-8000-000000000001', '${mId}', '${gId}', 'x', 1, 0, (strftime('%s','now') * 1000) - 1000)`);
r = await tick();
ok(r.pushes === 0 && pushes().length === before && sql("SELECT COUNT(*) AS n FROM pg_push").includes('"n": 0'), 'a phone whose sign-in ended gets nothing, and is forgotten');

// ---- iPhone in Safari (not on the Home Screen): explains how ----
const ictx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36', hasTouch: true, deviceScaleFactor: 2,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
await ictx.addInitScript(() => { delete window.PushManager; });
const ip = await ictx.newPage(); await ip.goto(URL);
await ip.waitForSelector('.welcome'); await ip.click('[data-act=to][data-id=signin]'); await ip.fill('#f-email', 'mira@example.com'); await ip.fill('#f-password', 'a long test password');
await ip.click('[data-form=signin] .btn'); await ip.waitForSelector('.tabs', { timeout: 20000 }); await ip.click('[data-act=tab][data-id=account]'); await ip.waitForTimeout(700); await ip.click('#screen > main.view [data-act=notifysheet]');
ok(await ip.isDisabled('[data-act=pushtoggle]') && /Add to Home Screen/.test(await ip.locator('.sheet').innerText()), 'iPhone Safari: explains Add to Home Screen');
await ip.waitForTimeout(400); await ip.screenshot({ path: `${out}/notify-iphone.png` });
const a2 = await ip.evaluate(AUDIT); ok(!a2.issues.length, 'iPhone account screen: no overlaps', a2.issues.join(' '));

console.log('errors', errs); console.log('FAILS', fails);
await b.close();
