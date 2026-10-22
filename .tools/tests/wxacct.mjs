// One account for the whole site, and Weather's part of it: signed in to InFlight in a browser, Weather is too (and the
// other way about); Weather's own sign-in (email and password, or a passkey made in InFlight); your places, settings and
// notifications kept with the account and put together across devices; notifications for each saved place, sent to
// every device signed in; signing out anywhere signing out everywhere; and an account's going taking what Weather kept.
// The site's addresses are stood in for by gfg.test (chat. and weather.), mapped to this machine, so the browser shares
// the sign-in between them as it would between georgefarrowgreen.com's.
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import http from 'http';
import * as F from './mocks/wxappdata.mjs';
import * as OW from './mocks/wxwarnings.mjs';
const [,, S, out] = process.argv;
const CHAT = 'http://chat.gfg.test:8788', WX = 'http://weather.gfg.test:8788', PW = 'a long test password';
const sql0 = (q) => execSync(`${S}/wr/node_modules/.bin/wrangler d1 execute bio-db --local --persist-to ${S}/wrstate --command "${q}"`, { cwd: process.env.APP_ROOT, stdio: 'pipe' }).toString();
const sql = (q) => { for (let i = 0; ; i++) { try { return sql0(q); } catch (e) { if (i > 5 || !/SQLITE_BUSY/.test(String(e.stdout) + String(e.stderr) + e.message)) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400); } } };
const rows = (q) => { const o = sql(q), m = o.match(/"results": (\[[\s\S]*?\])\s*,\s*"success"/); return m ? JSON.parse(m[1]) : []; };
let fails = 0; const errs = [];
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${extra ? '  — ' + extra : ''}`); if (!c) fails++; };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

// the stand-in for Open-Meteo and the rest, for the server's notifications (as wxapp.mjs's)
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), send = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/v1/forecast') { const n = (u.searchParams.get('latitude') || '').split(',').length, one = F.forecast(Date.now(), { rainIn: 30 }); return send(n > 1 ? Array(n).fill(one) : one); }
  if (u.pathname === '/api/v1/warnings/feeds-united-kingdom') return send(OW.ukFeed(Date.now()));
  if (u.pathname.startsWith('/api/v1/warnings/feeds-')) return send({ warnings: [] });
  if (u.pathname === '/flood-monitoring/id/floods') return send({ items: [] });
  if (u.pathname === '/api/data/stationinfo') return send([]);
  res.writeHead(404); res.end();
}).listen(8794, '127.0.0.1');

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined,
  args: ['--host-resolver-rules=MAP *.gfg.test 127.0.0.1, MAP gfg.test 127.0.0.1', `--unsafely-treat-insecure-origin-as-secure=${CHAT},${WX}`] });
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
// a browser: its own cookies and storage (a phone, a laptop); push stood in for with an endpoint of its own
async function browser(name, { push = false } = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-GB', isMobile: true, hasTouch: true, userAgent: IPHONE, serviceWorkers: 'allow' });
  if (push) {
    await ctx.grantPermissions(['notifications'], { origin: WX });
    await ctx.addInitScript((endpoint) => {
      const make = () => ({ endpoint, toJSON: () => ({ endpoint, keys: { p256dh: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U', auth: 'tBHItJI5svbpez7KI4CCXg' } }), unsubscribe: async () => { localStorage.removeItem('fakesub'); return true; } });
      PushManager.prototype.getSubscription = async function () { return localStorage.getItem('fakesub') ? make() : null; };
      PushManager.prototype.subscribe = async function () { localStorage.setItem('fakesub', '1'); return make(); };
    }, `https://fcm.googleapis.com/fcm/send/acct-${name}`);
  }
  await ctx.route(/open-meteo\.com|bigdatacloud/, (r) => {
    const u = r.request().url(), j = (o) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o), headers: { 'Access-Control-Allow-Origin': '*' } });
    if (u.includes('ensemble-api')) return j(F.ensemble(Date.now(), {}));
    if (u.includes('air-quality')) return j(F.air(Date.now()));
    if (u.includes('marine-api')) return j(F.marine(Date.now(), u));
    if (u.includes('archive-api')) return j(F.archive(Date.now()));
    if (u.includes('bigdatacloud')) return j({ city: 'London', principalSubdivision: 'England', countryName: 'United Kingdom', countryCode: 'GB' });
    if (u.includes('previous-runs-api') || u.includes('models=') || u.includes('past_hours') || u.includes('forecast_minutely_15=9')) return r.fulfill({ status: 503, body: '{}', headers: { 'Access-Control-Allow-Origin': '*' } });
    return j(F.forecast(Date.now(), { rainIn: 30 }));
  });
  await ctx.route(/rainviewer\.com|openstreetmap\.org|openfreemap\.org/, (r) => r.fulfill({ status: 503, body: '' }));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${name}: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 40[13]|status of 503|Cross-Origin-Opener-Policy header has been ignored/.test(m.text())) errs.push(`${name}: ${m.text()}`); });
  return { ctx, p, name };
}
const weather = async (x, q = 'lat=51.5072&lon=-0.1276&name=London') => { await x.p.goto(`${WX}/${q ? `?${q}` : ''}`); await x.p.waitForSelector('.day-row', { timeout: 30000 }); };
const settings = async (x) => { await x.p.click('#settings-btn'); await x.p.waitForSelector('#settings[open] #acct .acct-card'); await x.p.waitForTimeout(400); };
const closeSheet = async (x) => { await x.p.keyboard.press('Escape'); await x.p.waitForTimeout(500); };
const acctSays = (x) => x.p.evaluate(() => document.getElementById('acct')?.innerText.replace(/\s+/g, ' ').trim());
const places = (x) => x.p.evaluate(() => JSON.parse(localStorage.getItem('wx:places') || '[]').map((p) => p.name));
const kept = (handle) => { const r = rows(`SELECT a.data, a.ver FROM wx_accts a JOIN pg_users u ON u.id = a.user_id WHERE u.handle = '${handle}'`)[0]; return r ? { ver: r.ver, ...JSON.parse(r.data) } : null; };
const waitFor = async (fn, ms = 10000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v || Date.now() - t0 > ms) return v; await new Promise((r) => setTimeout(r, 300)); } };
// InFlight's sign-up (as lib.mjs's), at its own address
async function inflightSignup(x, name, handle, email) {
  await x.p.goto(`${CHAT}/`); await x.p.waitForSelector('.welcome', { timeout: 20000 }); await x.p.click('[data-act=to][data-id=signup]');
  await x.p.fill('#f-name', name); await x.p.fill('#f-handle', handle); await x.p.fill('#f-email', email); await x.p.fill('#f-password', PW);
  await x.p.click('[data-form=signup] .btn'); await x.p.waitForSelector('#city', { state: 'attached', timeout: 30000 });
  await x.p.selectOption('#city', 'London'); await x.p.waitForSelector('[data-act=onbdone]', { timeout: 20000 });
}

// ---- 1. Signed up to InFlight on a laptop: Weather in the same browser is signed in too, and its places go up ----
const L = await browser('laptop', { push: true });
const lcdp = await L.ctx.newCDPSession(L.p); await lcdp.send('WebAuthn.enable');
const { authenticatorId: lauth } = await lcdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true } });
await inflightSignup(L, 'Sam Taylor', 'sam', 'sam@example.com');
// (and a passkey, as InFlight offers: it belongs to the site, so Weather can use it)
await L.p.waitForSelector('[data-act=pkadd]'); await L.p.click('[data-act=pkadd]'); await L.p.waitForSelector('.tabs', { timeout: 20000 });
const cookie = (await L.ctx.cookies(CHAT)).find((c) => c.name === 'account');
ok(cookie && cookie.httpOnly && cookie.domain === '.gfg.test' && cookie.sameSite === 'Lax', 'signing up gives the browser the site\'s sign-in: for every address on the site, out of any page\'s reach', JSON.stringify(cookie && { d: cookie.domain, h: cookie.httpOnly, s: cookie.sameSite }));
const pk = (await lcdp.send('WebAuthn.getCredentials', { authenticatorId: lauth })).credentials;
ok(pk.length === 1 && pk[0].rpId === 'gfg.test', 'the passkey belongs to the site, not one address', JSON.stringify(pk.map((c) => c.rpId)));
await weather(L);
await settings(L);
await L.p.waitForFunction(() => /Sam Taylor/.test(document.getElementById('acct')?.innerText || ''), null, { timeout: 15000 }).catch(() => {});
const lSays = await acctSays(L);
ok(/Sam Taylor/.test(lSays) && /@sam · georgefarrowgreen\.com account/.test(lSays) && !/InFlight/i.test(lSays), 'Weather in the same browser: already signed in, as the account (no other app named)', lSays);
const k1 = await waitFor(() => kept('sam'));
ok(k1?.ver === 1 && k1.places.map((p) => p.name).join() === 'London' && k1.settings?.temp === 'c', 'what Weather has here goes up to the account: London, and the settings', JSON.stringify(k1 && { ver: k1.ver, places: k1.places.map((p) => p.name) }));
ok(!(await L.p.evaluate(() => document.cookie.includes('account'))), 'the page itself can\'t read the sign-in');
ok(await L.p.$('button#acct-open') && !(await L.p.$('#acct-edit, #acct-manage')) && !/Email/.test(lSays), 'one card for the account (its page has the rest: no profile editor, email or other buttons here)', lSays);
await closeSheet(L);

// ---- 2. A phone with places of its own: signed in to Weather with email and password; the two lots put together ----
const P = await browser('phone', { push: true });
await weather(P, 'lat=55.9533&lon=-3.1883&name=Edinburgh');
await settings(P);
const signedOutSays = await acctSays(P);
ok(/Your places on every device/.test(signedOutSays) && /Sign in with a passkey/.test(signedOutSays) && /Sign in with email and password/.test(signedOutSays) && !/InFlight/i.test(signedOutSays), 'signed out: what an account is for, and the two ways in', signedOutSays);
await P.p.click('#acct-password'); await P.p.fill('#acct input[name=email]', 'sam@example.com'); await P.p.fill('#acct input[name=password]', 'not the password');
await P.p.click('#acct .acct-form button[type=submit]');
await P.p.waitForFunction(() => /don’t match/.test(document.getElementById('acct-said')?.textContent || ''), null, { timeout: 30000 }).catch(() => {});
ok(/don’t match an account/.test(await P.p.textContent('#acct-said')), 'a wrong password: said, and still signed out', await P.p.textContent('#acct-said'));
await P.p.fill('#acct input[name=password]', PW); await P.p.click('#acct .acct-form button[type=submit]');
await P.p.waitForFunction(() => /Sam Taylor/.test(document.getElementById('acct')?.innerText || ''), null, { timeout: 30000 }).catch(() => {});
const k2 = await waitFor(() => { const k = kept('sam'); return k?.places.length === 2 ? k : null; });
ok(/Sam Taylor/.test(await acctSays(P)) && (await places(P)).join() === 'London,Edinburgh' && k2?.places.map((p) => p.name).join() === 'London,Edinburgh',
  'signed in on the phone: the account\'s London and the phone\'s Edinburgh, on both', `${(await places(P)).join()} | ${k2?.places.map((p) => p.name).join()}`);
await closeSheet(P);
await P.p.click('#place-btn'); await P.p.waitForTimeout(500);
ok(/In step with your account/.test(await P.p.textContent('#places .sheet-sub')), 'Places says they\'re in step', await P.p.textContent('#places .sheet-sub'));
await closeSheet(P);
// a setting changed on the phone reaches the laptop, and the laptop has Edinburgh when it next looks
await settings(P); await P.p.click('input[name="temp"][value="f"]'); await closeSheet(P);
await waitFor(() => kept('sam')?.settings?.temp === 'f');
await L.p.reload(); await L.p.waitForSelector('.day-row');
await waitFor(async () => (await places(L)).join() === 'London,Edinburgh');
ok((await places(L)).join() === 'London,Edinburgh' && (await L.p.evaluate(() => JSON.parse(localStorage.getItem('wx:settings')).temp)) === 'f', 'the laptop takes up the phone\'s Edinburgh, and °F', `${(await places(L)).join()} ${await L.p.evaluate(() => JSON.parse(localStorage.getItem('wx:settings')).temp)}`);

// ---- 3. Notifications for each place: chosen on the phone, sent to every device of the account ----
await settings(P);
const chip = (x, key, k) => x.p.click(`#notify-places .np-row[data-key="${key}"] .np-chip[data-k="${k}"]`);
await chip(P, '55.95,-3.19', 'rain');
await P.p.waitForFunction(() => /^On: rain alerts for Edinburgh\./.test(document.getElementById('notify-status').textContent), null, { timeout: 15000 }).catch(() => {});
ok(/^On: rain alerts for Edinburgh\./.test(await P.p.textContent('#notify-status')), 'rain alerts for Edinburgh, from its own row', await P.p.textContent('#notify-status'));
const devs = () => rows("SELECT d.dev, d.label, (SELECT handle FROM pg_users WHERE id = d.user_id) AS who FROM wx_devs d ORDER BY created");
const subs = () => rows('SELECT dev, name, rain, warn, brief FROM wx_subs ORDER BY name');
await waitFor(() => devs().length === 1);
ok(devs().length === 1 && devs()[0].who === 'sam' && /iPhone/.test(devs()[0].label) && subs().length === 1 && subs()[0].name === 'Edinburgh' && subs()[0].rain === 1, 'the phone is one of the account\'s devices, with Edinburgh\'s rain alerts', JSON.stringify([devs(), subs()]));
await waitFor(async () => /Notifications go to This device/.test(await acctSays(P)), 8000);
ok(/Notifications go to This device/.test(await acctSays(P)), 'and Settings says notifications go to this device', await acctSays(P));
await closeSheet(P);
// the laptop: Edinburgh's rain on there too (the account's), and "here too" puts the laptop among the devices
await L.p.reload(); await L.p.waitForSelector('.day-row'); await L.p.waitForTimeout(1500);
await settings(L);
const lChip = await L.p.getAttribute('#notify-places .np-row[data-key="55.95,-3.19"] .np-chip[data-k="rain"]', 'aria-pressed');
ok(lChip === 'true', 'the laptop shows Edinburgh\'s rain alerts on (the account\'s choice)', lChip);
await L.p.click('#acct-here');
await waitFor(() => devs().length === 2);
ok(devs().length === 2 && devs().every((d) => d.who === 'sam') && subs().filter((s) => s.name === 'Edinburgh' && s.rain === 1).length === 2, 'sent here too: both devices, each with Edinburgh\'s rain alerts', JSON.stringify(subs()));
// warnings for London, chosen on the laptop: the phone gets them too
await chip(L, '51.51,-0.13', 'warn');
await waitFor(() => subs().filter((s) => s.name === 'London' && s.warn === 1).length === 2);
ok(subs().filter((s) => s.name === 'London' && s.warn === 1).length === 2, 'official warnings for London, chosen on the laptop: on both devices', JSON.stringify(subs()));
const hellos = readFileSync(`${S}/pushbox.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => /acct-/.test(x.headers['x-endpoint'] || ''));
ok(hellos.length === 2, 'each device said hello once ("Notifications on")', String(hellos.length));
await closeSheet(L);

// ---- 3b. The profile is the account's: the card opens the account's page, signed in, where it's changed; Weather and
// InFlight show it ----
{
  await settings(P);
  const [W] = await Promise.all([P.ctx.waitForEvent('page'), P.p.click('#acct-open')]);
  await W.waitForURL(/account\.gfg\.test:8788\/$/, { timeout: 20000 }).catch(() => {});
  await W.waitForSelector('main:not([aria-busy])', { timeout: 20000 }).catch(() => {});
  await W.waitForTimeout(1200);
  const page = await W.evaluate(() => ({ url: location.href, text: document.querySelector('main')?.innerText.replace(/\s+/g, ' ') || '' }));
  ok(/^http:\/\/account\.gfg\.test:8788\/$/.test(page.url) && /Sam Taylor/.test(page.text) && /Weather/.test(page.text.slice(0, 40)), 'the card opens the account\'s page, signed in (the code out of the address), with the way back to Weather', `${page.url} ${page.text.slice(0, 60)}`);
  const jpeg = Buffer.from((await W.evaluate(() => { const c = document.createElement('canvas'); c.width = 1000; c.height = 700; const x = c.getContext('2d'); x.fillStyle = '#2a7'; x.fillRect(0, 0, 1000, 700); x.fillStyle = '#fff'; x.fillRect(450, 300, 100, 100); return c.toDataURL('image/jpeg', 0.9); })).split(',')[1], 'base64');
  await W.click('.hero .pill'); await W.waitForSelector('#sheet[open] .sheet-body'); await W.waitForTimeout(600);
  await W.setInputFiles('#sheet input[type=file]', { name: 'me.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await W.waitForSelector('.hero .avatar img', { timeout: 15000 }).catch(() => {});
  await W.fill('#sheet .field:has-text("Name") input', 'Sam T'); await W.click('#sheet .link.done');
  await W.waitForFunction(() => /Sam T\b/.test(document.querySelector('.hero')?.innerText || ''), null, { timeout: 15000 }).catch(() => {});
  await W.close();
  const row = rows("SELECT name, avatar_at FROM pg_users WHERE handle = 'sam'")[0];
  await P.p.reload(); await P.p.waitForSelector('.day-row'); await P.p.waitForTimeout(1500);
  await settings(P);
  await P.p.waitForFunction(() => document.getElementById('acct-title')?.textContent === 'Sam T', null, { timeout: 10000 }).catch(() => {});
  const shown = await P.p.evaluate(() => ({ name: document.getElementById('acct-title')?.textContent, img: document.querySelector('#acct .acct-card img')?.naturalWidth || 0 }));
  ok(row?.name === 'Sam T' && row.avatar_at && shown.name === 'Sam T' && shown.img === 512, 'changed there: the account\'s, and Weather shows it (the photo a 512-pixel square)', JSON.stringify({ row, shown }));
  // InFlight has them too, on its own sign-in (the laptop's), and a change there is Weather's
  const C = await L.ctx.newPage(); await C.goto(`${CHAT}/`); await C.waitForSelector('.tabs', { timeout: 20000 }).catch(() => {});
  const inflight = await C.evaluate(async () => {
    const tk = await new Promise((ok2) => { const r = indexedDB.open('inflight'); r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('session'); g.onsuccess = () => ok2(g.result?.token); }; });
    const h = { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' };
    const me = (await (await fetch('/api/pigeon/sync', { headers: h })).json()).me;
    const pic = await fetch(`/api/pigeon/avatar/${me.id}?v=${me.avatarAt}`, { headers: h });
    await fetch('/api/pigeon/me', { method: 'PATCH', headers: h, body: JSON.stringify({ name: 'Sam Taylor' }) });
    return { name: me.name, avatarAt: me.avatarAt, pic: pic.status, type: pic.headers.get('content-type') };
  });
  ok(inflight.name === 'Sam T' && inflight.avatarAt === row.avatar_at && inflight.pic === 200 && inflight.type === 'image/jpeg', 'InFlight has the same name and photo', JSON.stringify(inflight));
  await C.close();
  await P.p.reload(); await P.p.waitForSelector('.day-row'); await P.p.waitForTimeout(1500);
  await settings(P);
  ok(await P.p.textContent('#acct-title') === 'Sam Taylor', 'and the name changed back in InFlight is Weather\'s', await P.p.textContent('#acct-title'));
  await closeSheet(P);
  const noPic = await new Promise((done) => { const r = http.request({ host: '127.0.0.1', port: 8788, path: '/api/weather/me/photo', headers: { Host: 'weather.gfg.test:8788' } }, (res) => { res.resume(); res.on('end', () => done(res.statusCode)); }); r.end(); });
  ok(noPic === 401, 'the photo only for whoever\'s signed in', String(noPic));
  const xl = await new Promise((done) => { const r = http.request({ host: '127.0.0.1', port: 8788, path: '/api/weather/account-link', method: 'POST', headers: { Host: 'weather.gfg.test:8788', Origin: 'http://chat.gfg.test:8788', 'Content-Type': 'application/json' } }, (res) => { res.resume(); res.on('end', () => done(res.statusCode)); }); r.end('{}'); });
  ok(xl === 403, 'a code only for Weather\'s own pages', String(xl));
}

// ---- 4. A passkey made in InFlight signs in to Weather, on another browser ----
const K = await browser('keyring');
const kcdp = await K.ctx.newCDPSession(K.p); await kcdp.send('WebAuthn.enable');
const { authenticatorId: kauth } = await kcdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await kcdp.send('WebAuthn.addCredential', { authenticatorId: kauth, credential: pk[0] });
await weather(K);
await settings(K);
await K.p.click('#acct-passkey');
await K.p.waitForFunction(() => /Sam Taylor/.test(document.getElementById('acct')?.innerText || ''), null, { timeout: 20000 }).catch(() => {});
ok(/Sam Taylor/.test(await acctSays(K)) && (await places(K)).join() === 'London,Edinburgh', 'signed in with the passkey: the account\'s places', `${await acctSays(K)} | ${(await places(K)).join()}`);
// ---- 5. Signed in to Weather only: InFlight in the same browser offers to carry on, after the password ----
await K.p.goto(`${CHAT}/`); await K.p.waitForSelector('[data-act=resume]', { timeout: 20000 }).catch(() => {});
const offer = await K.p.evaluate(() => document.querySelector('.welcome')?.innerText.replace(/\s+/g, ' '));
ok(/Signed in as Sam Taylor \(@samt\)/i.test(offer || '') && /Continue as Sam/.test(offer || '') && !/Weather/.test(offer || ''), 'InFlight, signed in elsewhere on the site: "Continue as Sam" (no other app named)', offer);
await K.p.click('[data-act=resume]'); await K.p.waitForSelector('[data-form=unlock]');
ok(await K.p.waitForFunction(() => /already signed in to your georgefarrowgreen\.com account/.test(document.querySelector('[data-form=unlock]')?.closest('.auth')?.textContent || ''), null, { timeout: 5000 }).then(() => true, () => false), 'it asks only for the password, to unlock the key here');
await K.p.fill('#f-password', PW); await K.p.click('[data-form=unlock] .btn'); await K.p.waitForSelector('.tabs', { timeout: 30000 }).catch(() => {});
ok(!!(await K.p.$('.tabs')), 'and InFlight is open, on the same sign-in');
// ---- 6. Signing out of Weather signs out of InFlight there too ----
await weather(K); await settings(K);
await K.p.click('#acct-out');
await K.p.waitForFunction(() => /Your places on every device/.test(document.getElementById('acct')?.innerText || ''), null, { timeout: 15000 }).catch(() => {});
ok(/Your places on every device/.test(await acctSays(K)) && (await places(K)).join() === 'London,Edinburgh', 'signed out of Weather: the places stay here', await acctSays(K));
await K.p.goto(`${CHAT}/`); await K.p.waitForSelector('.welcome', { timeout: 20000 }).catch(async () => { await K.p.screenshot({ path: `${out}/signedout-inflight.png` }); console.log('DEBUG inflight after weather signout:', (await K.p.evaluate(() => document.body.innerText.slice(0, 300))).replace(/\s+/g, ' ')); });
ok(!!(await K.p.$('.welcome')) && !(await K.p.$('[data-act=resume]')), 'and InFlight in that browser is signed out too');

// ---- 7. The account's own rules ----
const call = (method, path, body, { origin = WX, cookie: c = '' } = {}) => new Promise((done, fail) => {
  const data = body == null ? null : JSON.stringify(body);
  const r = http.request({ host: '127.0.0.1', port: 8788, path, method, headers: { Host: 'weather.gfg.test:8788', Origin: origin, 'Content-Type': 'application/json', ...(c ? { Cookie: c } : {}), ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) } }, (res) => {
    let t = ''; res.on('data', (x) => (t += x)); res.on('end', () => done({ status: res.statusCode, body: t, headers: res.headers }));
  });
  r.on('error', fail); if (data) r.write(data); r.end();
});
const lc = (await L.ctx.cookies(WX)).find((c) => c.name === 'account');
ok(JSON.parse((await call('GET', '/api/weather/me', null)).body).signedIn === false, 'no sign-in: nobody');
ok((await call('PUT', '/api/weather/me', { base: 1, data: {} }, { cookie: `account=${lc.value}`, origin: CHAT })).status === 403, 'a change from another address on the site is turned away, sign-in or not');
const stale = await call('PUT', '/api/weather/me', { base: 1, data: { places: [{ name: 'Leeds', lat: 53.8, lon: -1.55 }] } }, { cookie: `account=${lc.value}` });
ok(stale.status === 409 && JSON.parse(stale.body).ver > 1, 'a change from an old version is told the account\'s moved on (not taken)', `${stale.status}`);
const resumeElsewhere = await new Promise((done) => { const r = http.request({ host: '127.0.0.1', port: 8788, path: '/api/pigeon/resume', method: 'POST', headers: { Host: 'chat.gfg.test:8788', Origin: WX, Cookie: `account=${lc.value}` } }, (res) => { let t = ''; res.on('data', (x) => (t += x)); res.on('end', () => done({ status: res.statusCode, body: t })); }); r.end(); });
ok(resumeElsewhere.status === 403 && !/token/.test(resumeElsewhere.body), 'InFlight hands its sign-in only to its own pages', `${resumeElsewhere.status}`);
// the cookie is the site's sign-in for the browser, not a key to InFlight: as InFlight's bearer token it opens nothing
const asBearer = await new Promise((done) => { const r = http.request({ host: '127.0.0.1', port: 8788, path: '/api/pigeon/sync', headers: { Host: 'chat.gfg.test:8788', Authorization: `Bearer ${lc.value}` } }, (res) => { res.resume(); res.on('end', () => done(res.statusCode)); }); r.end(); });
ok(asBearer === 401, 'the cookie isn\'t a key to InFlight\'s API', String(asBearer));
// a sign-in sent from another site (with a good password: its own account's, say) doesn't sign the browser in
{
  const proof = await K.p.evaluate(async () => { const { E2E } = await import('/crypto.js'); const { salt } = await (await fetch('/api/pigeon/salt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'sam@example.com' }) })).json(); return (await E2E.fromPassword('a long test password', salt)).proof; }).catch((e) => String(e));
  const login = (origin) => new Promise((done) => { const data = JSON.stringify({ email: 'sam@example.com', proof }); const r = http.request({ host: '127.0.0.1', port: 8788, path: '/api/pigeon/login', method: 'POST', headers: { Host: 'chat.gfg.test:8788', Origin: origin, 'Content-Type': 'text/plain', 'Content-Length': Buffer.byteLength(data) } }, (res) => { res.resume(); res.on('end', () => done({ status: res.statusCode, cookie: res.headers['set-cookie'] })); }); r.write(data); r.end(); });
  const evil = await login('https://evil.example'), own = await login(CHAT);
  ok(evil.status === 200 && !evil.cookie && own.status === 200 && /account=/.test(String(own.cookie)), 'a sign-in sent from another site doesn\'t sign the browser in (one from InFlight\'s own pages does)', `${evil.status} ${evil.cookie} | ${own.status}`);
}
// the account's API only at Weather's own address (not the site's, nor a preview's)
const atSite = await new Promise((done) => { const r = http.request({ host: '127.0.0.1', port: 8788, path: '/api/weather/me', headers: { Host: 'localhost:8788' } }, (res) => { res.resume(); res.on('end', () => done(res.statusCode)); }); r.end(); });
ok(atSite === 404, 'the account isn\'t answered at the site\'s own address', String(atSite));
const old = await call('POST', '/api/weather/subscribe', { sub: { endpoint: 'https://fcm.googleapis.com/fcm/send/acct-before', keys: { p256dh: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U', auth: 'tBHItJI5svbpez7KI4CCXg' } }, place: { lat: 52.2, lon: 0.12, name: 'Cambridge' }, rain: true, brief: true });
const cam = rows("SELECT name, rain, brief FROM wx_subs WHERE name = 'Cambridge'");
ok(old.status === 200 && cam.length === 1 && cam[0].rain === 1 && cam[0].brief === 1, 'the app from before (one place) still turns them on', `${old.status} ${JSON.stringify(cam)}`);

// ---- 8. The tick: Edinburgh's rain to both devices of the account ----
{
  const quiet = (() => { const h = new Date().getUTCHours(); return h >= 21 || h < 7; })();
  const tick = await new Promise((done) => { const r = http.request({ host: '127.0.0.1', port: 8788, path: '/api/weather/tick', method: 'POST', headers: { Host: 'localhost', Authorization: 'Bearer tick-test-secret' } }, (res) => { let t = ''; res.on('data', (x) => (t += x)); res.on('end', () => done(JSON.parse(t || '{}'))); }); r.end(); });
  if (!quiet) ok(tick.rain >= 2, 'the tick: Edinburgh\'s rain alert to the phone and the laptop', JSON.stringify(tick));
  else console.log('(quiet hours in Edinburgh: the rain alert waits)', JSON.stringify(tick));
}

// ---- 9. The account deleted (in InFlight): what Weather kept goes with it ----
{
  await L.p.goto(`${CHAT}/`); await L.p.waitForSelector('.tabs', { timeout: 20000 }).catch(() => {});
  const tk = await L.p.evaluate(() => new Promise((ok2) => { const r = indexedDB.open('inflight'); r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('session'); g.onsuccess = () => ok2(g.result?.token); }; }));
  // (deleting needs it shown it's you in the last ten minutes: as if the password had just been asked for)
  sql(`UPDATE pg_sessions SET auth_at = ${Date.now()} WHERE user_id = (SELECT id FROM pg_users WHERE email = 'sam@example.com')`);
  const del = await new Promise((done) => { const r = http.request({ host: '127.0.0.1', port: 8788, path: '/api/pigeon/me', method: 'DELETE', headers: { Host: 'chat.gfg.test:8788', Authorization: `Bearer ${tk}` } }, (res) => { let t = ''; res.on('data', (x) => (t += x)); res.on('end', () => done({ status: res.statusCode, body: t, cookie: res.headers['set-cookie'] })); }); r.end(); });
  ok(del.status === 200 && /account=;.*Max-Age=0/.test(String(del.cookie)), 'deleting the account signs the browser out of the site', `${del.status} ${del.body.slice(0, 80)}`);
  const left = rows("SELECT (SELECT COUNT(*) FROM wx_accts) AS a, (SELECT COUNT(*) FROM wx_devs WHERE user_id IS NOT NULL) AS d, (SELECT COUNT(*) FROM wx_subs WHERE dev LIKE '%') AS s")[0];
  ok(left.a === 0 && left.d === 0 && left.s === 1, 'and what Weather kept with it goes (only the device that never signed in keeps its own)', JSON.stringify(left));
}

await L.p.screenshot({ path: `${out}/wxacct-laptop.png` }).catch(() => {});
ok(!errs.length, 'no errors on the pages', errs.join(' ; '));
console.log(`FAILS ${fails}`);
await b.close();
process.exit(0);
