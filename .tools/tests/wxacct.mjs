// One account for the whole site, and Weather's part of it: signed in to InFlight in a browser, Weather is too (and the
// other way about); Weather's Sign in, on the account's page (email and password, or a passkey made in InFlight), handed
// back to it; your places, settings and
// notifications kept with the account and put together across devices; notifications for each saved place, sent to
// every device signed in; signing out anywhere signing out everywhere; and an account's going taking what Weather kept.
// The apps' addresses are stood in for by ifl.test (the home page's by gfg.test) (chat. and weather.), mapped to this machine, so the browser shares
// the sign-in between them as it would between georgefarrowgreen.com's.
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import http from 'http';
import * as F from './mocks/wxappdata.mjs';
import * as OW from './mocks/wxwarnings.mjs';
import { joinInFlight, onAccountPage } from './join.mjs';
const [,, S, out] = process.argv;
const CHAT = 'http://chat.ifl.test:8788', WX = 'http://weather.ifl.test:8788', PW = 'a long test password';
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
  args: ['--host-resolver-rules=MAP *.gfg.test 127.0.0.1, MAP gfg.test 127.0.0.1, MAP *.ifl.test 127.0.0.1, MAP ifl.test 127.0.0.1', `--unsafely-treat-insecure-origin-as-secure=${CHAT},${WX},${CHAT.replace('//chat.', '//account.')}`] });
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
  p.on('dialog', (d) => d.accept());   // (a shared link to a place not in your list: added, as if said yes)
  p.on('pageerror', (e) => errs.push(`${name}: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 40[13]|status of 503|Cross-Origin-Opener-Policy header has been ignored/.test(m.text())) errs.push(`${name}: ${m.text()}`); });
  return { ctx, p, name };
}
const weather = async (x, q = 'lat=51.5072&lon=-0.1276&name=London') => { await x.p.goto(`${WX}/${q ? `?${q}` : ''}`); await x.p.waitForSelector('.day-row', { timeout: 30000 }); };
// (open already, as it is just after signing out from it: brought back to its first page, not opened again behind itself)
// (just back from signing in, Weather opens Settings itself a moment later: a click that meets it closes it and tries again)
const settings = async (x) => {
  for (let i = 0; i < 3; i++) {
    if (await x.p.$('#settings[open]')) { await x.p.keyboard.press('Escape'); await x.p.waitForTimeout(600); }
    if (await x.p.click('#settings-btn', { timeout: 5000 }).then(() => true, () => false)) break;
  }
  await x.p.waitForSelector('#settings[open] #acct .acct-card'); await x.p.waitForTimeout(400);
};
const closeSheet = async (x) => { await x.p.keyboard.press('Escape'); await x.p.waitForTimeout(500); };
const acctSays = (x) => x.p.evaluate(() => document.getElementById('acct')?.innerText.replace(/\s+/g, ' ').trim());
// (signed out, Settings has a row for signing in, which takes you to the account's page: the passkey, email and password)
const signInPage = async (x) => { await x.p.click('#acct-signin'); await x.p.waitForURL((u) => u.hostname.startsWith('account.'), { timeout: 20000 }); await x.p.waitForSelector('main .signin input[name=password]', { timeout: 20000 }); };
// (and back in Weather, signed in)
const backInWeather = async (x) => { await x.p.waitForURL((u) => u.hostname.startsWith('weather.'), { timeout: 30000 }); await x.p.waitForSelector('.day-row', { timeout: 30000 }); };
const folder = async (x, f) => { await x.p.click(`[data-go="${f}"]`); await x.p.waitForTimeout(300); };
const places = (x) => x.p.evaluate(() => JSON.parse(localStorage.getItem('wx:places') || '[]').map((p) => p.name));
const kept = (handle) => { const r = rows(`SELECT a.data, a.ver FROM wx_accts a JOIN pg_users u ON u.id = a.user_id WHERE u.handle = '${handle}'`)[0]; return r ? { ver: r.ver, ...JSON.parse(r.data) } : null; };
// (the time given counted only while this script is free: as it reads the database it does nothing else, and every
// request the pages make waits for it meanwhile, as each is put to the stand-ins in browser() first)
const waitFor = async (fn, ms = 10000) => { for (let free = 0; ; free += 300) { const v = await fn(); if (v || free > ms) return v; await new Promise((r) => setTimeout(r, 300)); } };

// ---- 1. Signed up to InFlight on a laptop: Weather in the same browser is signed in too, and its places go up ----
const L = await browser('laptop', { push: true });
const lcdp = await L.ctx.newCDPSession(L.p); await lcdp.send('WebAuthn.enable');
const { authenticatorId: lauth } = await lcdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true } });
// (the account made on the account's page, then InFlight, and a passkey as InFlight offers: it belongs to the site, so
// Weather can use it)
await joinInFlight(L.p, `${CHAT}/`, { name: 'Sam Taylor', handle: 'sam', email: 'sam@example.com', password: PW, city: 'London', passkey: true });
const cookie = (await L.ctx.cookies(CHAT)).find((c) => c.name === 'account');
ok(cookie && cookie.httpOnly && cookie.domain === '.ifl.test' && cookie.sameSite === 'Lax', 'signing up gives the browser the site\'s sign-in: for every address on the site, out of any page\'s reach', JSON.stringify(cookie && { d: cookie.domain, h: cookie.httpOnly, s: cookie.sameSite }));
const pk = (await lcdp.send('WebAuthn.getCredentials', { authenticatorId: lauth })).credentials;
ok(pk.length === 1 && pk[0].rpId === 'ifl.test', 'the passkey belongs to the site, not one address', JSON.stringify(pk.map((c) => c.rpId)));
await weather(L);
await settings(L);
// (this device's own place first: asked before it goes to an account signed in elsewhere on the site)
await L.p.waitForSelector('#acct-keep', { timeout: 15000 }).catch(() => {});
const asks = await acctSays(L);
ok(/Sam Taylor/.test(asks) && /@sam · signed in on this browser/.test(asks) && /Keep them with @sam/.test(asks) && /Not you\? Sign out/.test(asks) && !kept('sam'),
  'Weather in the same browser: signed in as the account, and asks before this device\'s places go to it', asks);
await L.p.click('#acct-keep');
await L.p.waitForFunction(() => /@sam\b/.test(document.getElementById('acct')?.innerText || ''), null, { timeout: 15000 }).catch(() => {});
const lSays = await acctSays(L);
ok(/Sam Taylor/.test(lSays) && /@sam\b/.test(lSays) && !/georgefarrowgreen/.test(lSays) && !/InFlight/i.test(lSays), 'kept with it: the account\'s card (no other app named)', lSays);
const k1 = await waitFor(() => kept('sam'));
ok(k1?.ver === 1 && k1.places.map((p) => p.name).join() === 'London' && k1.settings?.temp === 'c', 'what Weather has here goes up to the account: London, and the settings', JSON.stringify(k1 && { ver: k1.ver, places: k1.places.map((p) => p.name) }));
ok(!(await L.p.evaluate(() => document.cookie.includes('account'))), 'the page itself can\'t read the sign-in');
ok(await L.p.$('button#acct-open') && !(await L.p.$('#acct-edit, #acct-manage, #acct-out, #acct .acct-rows')) && !/Email|Sign out/.test(lSays), 'just one card for the account (its page has the rest: no profile editor, email or rows here)', lSays);
ok(await L.p.isVisible('#out-grp #sign-out') && (await L.p.textContent('#sign-out')) === 'Sign out', 'and Sign out at the foot of Settings, Weather\'s own');
await closeSheet(L);

// ---- 2. A phone with places of its own: signed in to Weather, on the account's page, with email and password; the two
// lots put together ----
const P = await browser('phone', { push: true });
await weather(P, 'lat=55.9533&lon=-3.1883&name=Edinburgh');
await settings(P);
const signedOutRow = await acctSays(P);
ok(/^Sign in Your places on every device/.test(signedOutRow) && !(await P.p.$('#settings input[type=password], #settings [data-page=signin]')), 'signed out: a row for signing in, and no sign-in of Weather\'s own', signedOutRow);
await signInPage(P);
// (whether an account can be made here is asked as the page is drawn, and said under the card once it's known)
await P.p.waitForFunction(() => document.getElementById('joinline')?.textContent.trim(), null, { timeout: 15000 }).catch(() => {});
const signedOutSays = await P.p.evaluate(() => document.querySelector('main').innerText.replace(/\s+/g, ' ').trim());
ok(/Sign in to continue to Weather/.test(signedOutSays) && /Sign in with a passkey/.test(signedOutSays) && /or with your email/.test(signedOutSays) && /Forgot password\?/.test(signedOutSays) && /New here\? Create your account/.test(signedOutSays),
  'the account\'s page, for Weather: a passkey first, then email and password; a forgotten password, and a new account', signedOutSays);
await P.p.click('main .signin form .btn');
ok(await P.p.textContent('main .said') === 'Enter your email.', 'nothing typed in: the same words as every page of the site', await P.p.textContent('main .said'));
await P.p.fill('main input[name=email]', 'sam@example.com'); await P.p.fill('main input[name=password]', 'not the password');
await P.p.click('main .signin form .btn');
await P.p.waitForFunction(() => /don’t match/.test(document.querySelector('main .said')?.textContent || ''), null, { timeout: 30000 }).catch(() => {});
ok(/don’t match an account/.test(await P.p.textContent('main .said')) && /account\./.test(P.p.url()), 'a wrong password: said, and still signed out', await P.p.textContent('main .said'));
await P.p.fill('main input[name=password]', PW); await P.p.click('main .signin form .btn');
await backInWeather(P);
const back = await P.p.waitForFunction(() => document.getElementById('toast')?.textContent || null, null, { timeout: 15000 }).then((x) => x.jsonValue(), () => '');
const k2 = await waitFor(() => { const k = kept('sam'); return k?.places.length === 2 ? k : null; });
await settings(P);
ok(/Signed in as Sam/.test(back) && /Sam Taylor/.test(await acctSays(P)) && (await places(P)).join() === 'London,Edinburgh' && k2?.places.map((p) => p.name).join() === 'London,Edinburgh',
  'back in Weather, signed in: the account\'s London and the phone\'s Edinburgh, on both', `${back} | ${(await places(P)).join()} | ${k2?.places.map((p) => p.name).join()}`);
await closeSheet(P);
await P.p.click('#place-btn'); await P.p.waitForTimeout(500);
ok((await P.p.textContent('#places .sheet-sub')) === 'Saved' && await P.p.$eval('#sync-note', (n) => n.hidden), 'Places: just the saved places, in step (a note only when they\'re not)', await P.p.textContent('#places .sheet-sub'));
await closeSheet(P);
// a setting changed on the phone reaches the laptop, and the laptop has Edinburgh when it next looks
// (signed in, kept with the account: units, commute and forecast are on the account's page, a row here for them all)
await settings(P);
const rowsIn = await P.p.evaluate(() => [...document.querySelectorAll('#settings .folder')].filter((b) => !b.closest('li')?.hidden).map((b) => b.querySelector('.f-k').firstChild.textContent));
ok(rowsIn.includes('Weather settings') && !rowsIn.includes('Units') && !rowsIn.includes('Commute') && !rowsIn.includes('Forecast') && rowsIn.includes('Best times'),
  'signed in: Units, Commute and Forecast give way to Weather settings, on the account\'s page', rowsIn.join(', '));
const [WS] = await Promise.all([P.ctx.waitForEvent('page'), P.p.click('#acct-set-go')]);
await WS.waitForSelector('#sheet[open] #wx-tune', { timeout: 30000 }); await WS.waitForTimeout(600);
ok(/Weather/.test(await WS.locator('#sheet .toapp').innerText().catch(() => '')) && /Commute\s*Weekdays, in Highlights/.test(await WS.locator('#sheet').innerText()) && /Open Weather/.test(await WS.locator('#sheet').innerText()), 'it opens Weather\'s sheet on the account\'s page, with the way back');
await WS.locator('#sheet .row', { hasText: 'Units' }).click(); await WS.waitForSelector('#sheet .units .seg'); await WS.waitForTimeout(500);
await WS.locator('#sheet .unit', { hasText: 'Temperature' }).locator('button', { hasText: '°F' }).click();
await waitFor(() => kept('sam')?.settings?.temp === 'f');
await WS.locator('#sheet .back').first().click(); await WS.waitForTimeout(600);
await WS.locator('#sheet label:has(#wx-commute)').click();
await waitFor(() => kept('sam')?.settings?.commute?.on === true);
await WS.waitForSelector('#wx-am'); await WS.selectOption('#wx-am', '07:45');
await WS.locator('#sheet label:has(#wx-tune)').click();
const kw = await waitFor(() => { const k = kept('sam'); return k?.settings?.commute?.am === '07:45' && k.settings.tune === false ? k : null; });
ok(kw?.settings?.commute?.on && kw.settings.commute.am === '07:45' && kw.settings.commute.pm && kw.settings.tune === false && kw.places.length === 2,
  'and there: the commute on, leaving at 07:45, the forecast not tuned, the places as they were', JSON.stringify(kw && { commute: kw.settings.commute, tune: kw.settings.tune, places: kw.places.length }));
// (put back on the account's page, the units aside, for what follows; Weather takes those up as it next comes into step)
await WS.locator('#sheet label:has(#wx-tune)').click(); await waitFor(() => kept('sam')?.settings?.tune !== false);
await WS.locator('#sheet label:has(#wx-commute)').click(); await waitFor(() => kept('sam')?.settings?.commute?.on === false);
await WS.close();
// (back in Weather: taken up at once, as it's come back to)
await P.p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await P.p.waitForFunction(() => { const s = JSON.parse(localStorage.getItem('wx:settings')); return s.temp === 'f' && s.commute?.am === '07:45' && s.commute.on === false && s.tune !== false; }, null, { timeout: 15000 }).catch(() => {});
const sp = await P.p.evaluate(() => JSON.parse(localStorage.getItem('wx:settings')));
ok(sp.temp === 'f' && sp.commute?.on === false && sp.commute.am === '07:45' && sp.tune !== false, 'back in Weather: all of it taken up at once', JSON.stringify({ temp: sp.temp, commute: sp.commute, tune: sp.tune }));
await closeSheet(P);
await L.p.reload(); await L.p.waitForSelector('.day-row');
await waitFor(async () => (await places(L)).join() === 'London,Edinburgh');
ok((await places(L)).join() === 'London,Edinburgh' && (await L.p.evaluate(() => JSON.parse(localStorage.getItem('wx:settings')).temp)) === 'f', 'the laptop takes up the phone\'s Edinburgh, and °F', `${(await places(L)).join()} ${await L.p.evaluate(() => JSON.parse(localStorage.getItem('wx:settings')).temp)}`);

// ---- 3. Notifications for each place: chosen on the phone, sent to every device of the account ----
await settings(P); await folder(P, 'notify');
const chip = (x, key, k) => x.p.click(`#notify-places .np-row[data-key="${key}"] .np-chip[data-k="${k}"]`);
await chip(P, '55.95,-3.19', 'rain');
await P.p.waitForFunction(() => /^On: rain alerts for Edinburgh\./.test(document.getElementById('notify-status').textContent), null, { timeout: 15000 }).catch(() => {});
ok(/^On: rain alerts for Edinburgh\./.test(await P.p.textContent('#notify-status')), 'rain alerts for Edinburgh, from its own row', await P.p.textContent('#notify-status'));
const devs = () => rows("SELECT d.dev, d.label, (SELECT handle FROM pg_users WHERE id = d.user_id) AS who FROM wx_devs d ORDER BY created");
const subs = () => rows('SELECT dev, name, rain, warn, brief FROM wx_subs ORDER BY name');
const whereTo = (x) => x.p.evaluate(() => document.getElementById('notify-acct')?.innerText.replace(/\s+/g, ' ').trim());
// (what the phone says waited for before the database is read: while it's read, the pages' requests wait too (waitFor),
// and the phone's asking for the account's devices, just after turning them on, is given up on after 20 seconds of that)
await waitFor(async () => /Notifications go to this device/.test(await whereTo(P)), 15000);
const pDevs = devs(), pSubs = subs();
ok(pDevs.length === 1 && pDevs[0].who === 'sam' && /iPhone/.test(pDevs[0].label) && pSubs.length === 1 && pSubs[0].name === 'Edinburgh' && pSubs[0].rain === 1, 'the phone is one of the account\'s devices, with Edinburgh\'s rain alerts', JSON.stringify([pDevs, pSubs]));
ok(/Notifications go to this device\./.test(await whereTo(P)), 'and Notifications says they go to this device', await whereTo(P));
await closeSheet(P);
// the laptop: Edinburgh's rain on there too (the account's), and "here too" puts the laptop among the devices
await L.p.reload(); await L.p.waitForSelector('.day-row'); await L.p.waitForTimeout(1500);
await settings(L); await folder(L, 'notify');
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
  await W.waitForURL(/account\.ifl\.test:8788\/$/, { timeout: 20000 }).catch(() => {});
  await W.waitForSelector('main:not([aria-busy])', { timeout: 20000 }).catch(() => {});
  await W.waitForTimeout(1200);
  const page = await W.evaluate(() => ({ url: location.href, text: document.querySelector('main')?.innerText.replace(/\s+/g, ' ') || '' }));
  // (deleting the account is under Your data now, with the rest of what's yours)
  ok(!(await W.$('main .row.action:text-is("Sign out")')) && !!(await W.$('main .row:has(b:text-is("Your data"))')), 'opened from Weather, the account\'s page leaves signing out to Weather', page.text.slice(0, 160));
  ok(/^http:\/\/account\.ifl\.test:8788\/$/.test(page.url) && /Sam Taylor/.test(page.text) && /Weather/.test(page.text.slice(0, 40)), 'the card opens the account\'s page, signed in (the code out of the address), with the way back to Weather', `${page.url} ${page.text.slice(0, 60)}`);
  const jpeg = Buffer.from((await W.evaluate(() => { const c = document.createElement('canvas'); c.width = 1000; c.height = 700; const x = c.getContext('2d'); x.fillStyle = '#2a7'; x.fillRect(0, 0, 1000, 700); x.fillStyle = '#fff'; x.fillRect(450, 300, 100, 100); return c.toDataURL('image/jpeg', 0.9); })).split(',')[1], 'base64');
  await W.setInputFiles('main .poster-card input[type=file]', { name: 'me.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await W.waitForSelector('#sheet[open] .pv-frame img', { timeout: 15000 }); await W.waitForTimeout(500);
  await W.click('#sheet .link.done'); await W.waitForSelector('.hero .pc-photo img', { timeout: 15000 }).catch(() => {});
  await W.waitForSelector('#sheet', { state: 'hidden' }).catch(() => {}); await W.waitForTimeout(400);
  await W.click('.hero .pill'); await W.waitForSelector('#sheet[open] .sheet-body'); await W.waitForTimeout(600);
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
  const noPic = await new Promise((done) => { const r = http.request({ host: '127.0.0.1', port: 8788, path: '/api/weather/me/photo', agent: false, headers: { Host: 'weather.ifl.test:8788' } }, (res) => { res.resume(); res.on('end', () => done(res.statusCode)); }); r.end(); });
  ok(noPic === 401, 'the photo only for whoever\'s signed in', String(noPic));
  const xl = await new Promise((done) => { const r = http.request({ host: '127.0.0.1', port: 8788, path: '/api/weather/account-link', method: 'POST', agent: false, headers: { Host: 'weather.ifl.test:8788', Origin: 'http://chat.ifl.test:8788', 'Content-Type': 'application/json' } }, (res) => { res.resume(); res.on('end', () => done(res.statusCode)); }); r.end('{}'); });
  ok(xl === 403, 'a code only for Weather\'s own pages', String(xl));
}

// ---- 4. A passkey made in InFlight signs in to Weather (on the account's page), on another browser ----
const K = await browser('keyring');
const kcdp = await K.ctx.newCDPSession(K.p); await kcdp.send('WebAuthn.enable');
const { authenticatorId: kauth } = await kcdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await kcdp.send('WebAuthn.addCredential', { authenticatorId: kauth, credential: pk[0] });
await weather(K);
await settings(K); await signInPage(K);
await K.p.click('main .btn:has-text("Sign in with a passkey")');
await backInWeather(K); await settings(K);
await K.p.waitForFunction(() => /Sam Taylor/.test(document.getElementById('acct')?.innerText || ''), null, { timeout: 20000 }).catch(() => {});
ok(/Sam Taylor/.test(await acctSays(K)) && (await places(K)).join() === 'London,Edinburgh', 'signed in with the passkey: the account\'s places', `${await acctSays(K)} | ${(await places(K)).join()}`);
// ---- 5. Signed in to Weather only: InFlight in the same browser offers to carry on (on the account's page, showing it's
// you, as that's what opens the key in InFlight) ----
await K.p.goto(`${CHAT}/`); await K.p.waitForSelector('.welcome [data-act=acctsignin]:has-text("Continue as")', { timeout: 20000 }).catch(() => {});
const offer = await K.p.evaluate(() => document.querySelector('.welcome')?.innerText.replace(/\s+/g, ' '));
ok(/Continue as Sam/.test(offer || '') && !/Signed in as/i.test(offer || '') && !/Weather/.test(offer || ''), 'InFlight, signed in elsewhere on the site: just "Continue as Sam" (no other app named)', offer);
await K.p.click('.welcome [data-act=acctsignin]'); await K.p.waitForURL((u) => u.hostname.startsWith('account.'), { timeout: 20000 });
await K.p.waitForSelector('main .signin input[name=password]', { timeout: 20000 });
ok(/Continue to InFlight as this account\?/.test(await K.p.textContent('main')) && !(await K.p.$('main input[name=email]')), 'on the account\'s page: carrying on as Sam, showing it\'s you (no email asked) to unlock the key here');
await K.p.fill('main input[name=password]', PW); await K.p.click('main .signin form .btn');
await K.p.waitForURL((u) => u.hostname.startsWith('chat.'), { timeout: 30000 }).catch(() => {}); await K.p.waitForSelector('.tabs', { timeout: 30000 }).catch(() => {});
ok(!!(await K.p.$('.tabs')), 'and back in InFlight, open, on the same sign-in');
// ---- 6. Signing out (on the account's page) signs out of Weather and InFlight there too ----
await K.p.goto('http://account.ifl.test:8788/'); await K.p.waitForSelector('main:not([aria-busy])', { timeout: 20000 });
await K.p.click('.row.action:text-is("Sign out")'); await K.p.waitForFunction(() => /Sign in/.test(document.querySelector('main')?.innerText || ''), null, { timeout: 15000 }).catch(() => {});
await weather(K); await settings(K);
await K.p.waitForFunction(() => /Your places on every device/.test(document.getElementById('acct')?.innerText || ''), null, { timeout: 15000 }).catch(() => {});
ok(/Your places on every device/.test(await acctSays(K)) && (await places(K)).join() === 'London,Edinburgh', 'signed out on the account\'s page: Weather is too, and the places stay here', await acctSays(K));
await K.p.goto(`${CHAT}/`); await K.p.waitForSelector('.welcome', { timeout: 20000 }).catch(async () => { await K.p.screenshot({ path: `${out}/signedout-inflight.png` }); console.log('DEBUG inflight after weather signout:', (await K.p.evaluate(() => document.body.innerText.slice(0, 300))).replace(/\s+/g, ' ')); });
ok(!!(await K.p.$('.welcome')) && !/Continue as/.test(await K.p.textContent('.welcome')), 'and InFlight in that browser is signed out too');

// ---- 6b. A device with the account's notifications, signed out on the account's page: Weather notices, and they
// stay, as its own ----
const T = await browser('tablet', { push: true });
await weather(T); await settings(T); await signInPage(T);
await onAccountPage(T.p, { email: 'sam@example.com', password: PW }); await backInWeather(T);
// (signed in where notifications are allowed already, it's one of the account's devices at once)
await T.p.waitForFunction(() => { try { return !!localStorage.getItem('wx:acct') && !!JSON.parse(localStorage.getItem('wx:settings') || '{}').notify?.devId; } catch (_) { return false; } }, null, { timeout: 30000 }).catch(() => {});
const tId = await T.p.evaluate(() => JSON.parse(localStorage.getItem('wx:settings') || '{}').notify?.devId || '');
const tDev = () => rows(`SELECT d.dev, d.user_id, (SELECT COUNT(*) FROM wx_subs s WHERE s.dev = d.dev) AS n FROM wx_devs d WHERE dev = '${tId}'`)[0];
await waitFor(() => tDev()?.user_id && tDev()?.n > 0);
const t1 = tDev();
ok(t1?.user_id && t1.n > 0, 'the tablet: one of the account\'s devices, with its notifications', JSON.stringify(t1));
await T.p.goto('http://account.ifl.test:8788/'); await T.p.waitForSelector('main:not([aria-busy])', { timeout: 20000 });
await T.p.click('.row.action:text-is("Sign out")'); await T.p.waitForTimeout(1500);
await weather(T);
await waitFor(() => tDev() && !tDev().user_id, 15000);
const t2 = rows(`SELECT user_id, (SELECT COUNT(*) FROM wx_subs s WHERE s.dev = d.dev) AS n FROM wx_devs d WHERE dev = '${t1.dev}'`)[0];
ok(t2 && !t2.user_id && t2.n === t1.n, 'signed out there: Weather notices, and the tablet\'s notifications stay, its own', JSON.stringify(t2));
let tSubs = t2?.n || 0;
// signed in on the tablet again, and out from Weather's own Settings: signed out here, and its notifications its own
await settings(T); await signInPage(T);
await onAccountPage(T.p, { email: 'sam@example.com', password: PW }); await backInWeather(T);
await waitFor(() => tDev()?.user_id, 20000);
const t3 = tDev();
await settings(T); await T.p.waitForSelector('#out-grp:not([hidden]) #sign-out', { timeout: 15000 }).catch(() => {});
await T.p.click('#sign-out');
await waitFor(async () => !tDev()?.user_id && await T.p.isVisible('#acct-signin'), 15000);
const t4 = tDev();
ok(t3?.user_id && t4 && !t4.user_id && t4.n === t3.n && await T.p.isVisible('#acct-signin') && await T.p.isHidden('#out-grp'), 'signed out from Weather\'s Settings: signed out here, the tablet\'s notifications its own', JSON.stringify({ t3, t4 }));
tSubs = t4?.n || 0;
// signed in again, then signed out from somewhere else (Signed-in devices, a new password): the tablet, which does
// nothing itself, is no longer the account's by the next tick, and keeps what it had as its own
await settings(T); await signInPage(T);
await onAccountPage(T.p, { email: 'sam@example.com', password: PW }); await backInWeather(T);
await waitFor(() => tDev()?.user_id, 20000);
const sess = rows(`SELECT sess FROM wx_devs WHERE dev = '${tId}'`)[0]?.sess;
ok(!!sess && rows(`SELECT 1 FROM pg_sessions WHERE hash = '${sess}'`).length === 1, 'linked again, with the sign-in that linked it', String(sess));
sql(`DELETE FROM pg_sessions WHERE hash = '${sess}'`);
await new Promise((done) => { const r = http.request({ host: '127.0.0.1', port: 8788, path: '/api/weather/tick', method: 'POST', agent: false, headers: { Host: 'localhost', Authorization: 'Bearer tick-test-secret' } }, (res) => { res.resume(); res.on('end', done); }); r.end(); });
const t5 = tDev();
ok(t5 && !t5.user_id && t5.n > 0 && !rows(`SELECT sess FROM wx_devs WHERE dev = '${tId}'`)[0]?.sess, 'signed out from elsewhere: by the next tick the tablet is no longer the account’s, and keeps its places as its own', JSON.stringify(t5));
tSubs = t5?.n || 0;
await closeSheet(T);
// signed in again, then, with Weather not opened meanwhile, out of that account in this browser and in as someone else
// (as if Weather were last in step with another account, the tablet cut loose from it when it signed out): asked before
// the tablet's places go to the one signed in now, and till then nothing goes to it, nor do its notifications come here
await weather(T); await settings(T); await T.p.waitForSelector('#acct-signin', { timeout: 15000 }).catch(() => {});
await signInPage(T); await onAccountPage(T.p, { email: 'sam@example.com', password: PW }); await backInWeather(T);
await waitFor(() => tDev()?.user_id, 20000); await T.p.waitForTimeout(1500);
await T.p.evaluate(() => { const k = JSON.parse(localStorage.getItem('wx:acct')); localStorage.setItem('wx:acct', JSON.stringify({ ...k, id: 'someone-else', name: 'Pat Doe', handle: 'pat' })); });
sql(`UPDATE wx_devs SET user_id = NULL, sess = NULL WHERE dev = '${tId}'`);
const ver0 = kept('sam')?.ver;
// (opened with its notifications due to be told again, and the server slow to say who's signed in: told meanwhile as
// the tablet's own, not the one signed in now's; and Settings, open meanwhile on the account it had, signed out of it
// once it asks)
await T.p.evaluate(() => { const s = JSON.parse(localStorage.getItem('wx:settings')); localStorage.setItem('wx:settings', JSON.stringify({ ...s, notify: { ...s.notify, syncedAt: 0 } })); });
const slowMe = async (r) => { await new Promise((d) => setTimeout(d, 8000)); await r.continue().catch(() => {}); }, tw = Date.now();
await T.ctx.route(/\/api\/weather\/me$/, slowMe);
await weather(T); await settings(T);
const told = await waitFor(() => T.p.evaluate((t0) => (JSON.parse(localStorage.getItem('wx:settings')).notify?.syncedAt || 0) > t0, tw), 7000);
const tEarly = tDev();
await T.ctx.unroute(/\/api\/weather\/me$/, slowMe);
await T.p.waitForSelector('#acct-keep', { timeout: 20000 }).catch(() => {});
const tAsks = await acctSays(T), footOut = await T.p.isHidden('#out-grp');
ok(told && tEarly && !tEarly.user_id && tEarly.n > 0 && /Keep them with @sam/.test(tAsks) && footOut,
  'signed in as someone else meanwhile, the server slow to say so: the tablet\'s notifications told meanwhile as its own, and Settings no longer signed in once it asks', JSON.stringify({ told, tEarly, tAsks, footOut }));
// (a unit changed meanwhile: kept here, and the tablet's notifications told it)
const to = await T.p.evaluate(() => (JSON.parse(localStorage.getItem('wx:settings')).temp === 'f' ? 'c' : 'f')), t0 = Date.now();
await folder(T, 'units'); await T.p.click(`input[name="temp"][value="${to}"]`);
await waitFor(() => T.p.evaluate((t0) => (JSON.parse(localStorage.getItem('wx:settings')).notify?.syncedAt || 0) > t0, t0), 15000); await T.p.waitForTimeout(2000);
const t6 = tDev();
ok(/Keep them with @sam/.test(tAsks) && !/Pat|@pat/.test(tAsks) && !(await T.p.evaluate(() => localStorage.getItem('wx:acct'))) && t6 && !t6.user_id && t6.n > 0 && kept('sam')?.ver === ver0,
  'signed in as someone else meanwhile: asked before the tablet\'s places go to them, and till then nothing goes to them, nor their notifications here', JSON.stringify({ tAsks, t6, ver: [ver0, kept('sam')?.ver] }));
tSubs = t6?.n || 0;
await closeSheet(T);

// ---- 7. The account's own rules ----
const call = (method, path, body, { origin = WX, cookie: c = '' } = {}) => new Promise((done, fail) => {
  const data = body == null ? null : JSON.stringify(body);
  const r = http.request({ host: '127.0.0.1', port: 8788, path, method, agent: false, headers: { Host: 'weather.ifl.test:8788', Origin: origin, 'Content-Type': 'application/json', ...(c ? { Cookie: c } : {}), ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) } }, (res) => {
    let t = ''; res.on('data', (x) => (t += x)); res.on('end', () => done({ status: res.statusCode, body: t, headers: res.headers }));
  });
  r.on('error', fail); if (data) r.write(data); r.end();
});
const lc = (await L.ctx.cookies(WX)).find((c) => c.name === 'account');
ok((await call('POST', '/api/weather/leave', { endpoint: 'https://fcm.googleapis.com/fcm/send/acct-tablet' }, { origin: CHAT })).status === 403, 'a device left only from Weather\'s own pages');
ok(JSON.parse((await call('GET', '/api/weather/me', null)).body).signedIn === false, 'no sign-in: nobody');
ok((await call('PUT', '/api/weather/me', { base: 1, data: {} }, { cookie: `account=${lc.value}`, origin: CHAT })).status === 403, 'a change from another address on the site is turned away, sign-in or not');
const stale = await call('PUT', '/api/weather/me', { base: 1, data: { places: [{ name: 'Leeds', lat: 53.8, lon: -1.55 }] } }, { cookie: `account=${lc.value}` });
ok(stale.status === 409 && JSON.parse(stale.body).ver > 1, 'a change from an old version is told the account\'s moved on (not taken)', `${stale.status}`);
const resumeElsewhere = await new Promise((done) => { const r = http.request({ host: '127.0.0.1', port: 8788, path: '/api/pigeon/resume', method: 'POST', agent: false, headers: { Host: 'chat.ifl.test:8788', Origin: WX, Cookie: `account=${lc.value}` } }, (res) => { let t = ''; res.on('data', (x) => (t += x)); res.on('end', () => done({ status: res.statusCode, body: t })); }); r.end(); });
ok(resumeElsewhere.status === 403 && !/token/.test(resumeElsewhere.body), 'InFlight hands its sign-in only to its own pages', `${resumeElsewhere.status}`);
// the cookie is the site's sign-in for the browser, not a key to InFlight: as InFlight's bearer token it opens nothing
const asBearer = await new Promise((done) => { const r = http.request({ host: '127.0.0.1', port: 8788, path: '/api/pigeon/sync', agent: false, headers: { Host: 'chat.ifl.test:8788', Authorization: `Bearer ${lc.value}` } }, (res) => { res.resume(); res.on('end', () => done(res.statusCode)); }); r.end(); });
ok(asBearer === 401, 'the cookie isn\'t a key to InFlight\'s API', String(asBearer));
// a sign-in sent from another site (with a good password: its own account's, say) doesn't sign the browser in
{
  const proof = await K.p.evaluate(async () => { const { E2E } = await import('/crypto.js'); const { salt } = await (await fetch('/api/pigeon/salt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'sam@example.com' }) })).json(); return (await E2E.fromPassword('a long test password', salt)).proof; }).catch((e) => String(e));
  const login = (origin) => new Promise((done) => { const data = JSON.stringify({ email: 'sam@example.com', proof }); const r = http.request({ host: '127.0.0.1', port: 8788, path: '/api/account/signin/password', method: 'POST', agent: false, headers: { Host: 'account.ifl.test:8788', Origin: origin, 'Content-Type': 'text/plain', 'Content-Length': Buffer.byteLength(data) } }, (res) => { res.resume(); res.on('end', () => done({ status: res.statusCode, cookie: res.headers['set-cookie'] })); }); r.write(data); r.end(); });
  const evil = await login('https://evil.example'), own = await login('http://account.ifl.test:8788');
  ok(evil.status === 403 && !evil.cookie && own.status === 200 && /account=/.test(String(own.cookie)), 'a sign-in sent from another site is turned away (one from the account\'s own page signs the browser in)', `${evil.status} ${evil.cookie} | ${own.status}`);
}
// the account's API only at Weather's own address (not the site's, nor a preview's)
const atSite = await new Promise((done) => { const r = http.request({ host: '127.0.0.1', port: 8788, path: '/api/weather/me', agent: false, headers: { Host: 'localhost:8788' } }, (res) => { res.resume(); res.on('end', () => done(res.statusCode)); }); r.end(); });
ok(atSite === 404, 'the account isn\'t answered at the site\'s own address', String(atSite));
const old = await call('POST', '/api/weather/subscribe', { sub: { endpoint: 'https://fcm.googleapis.com/fcm/send/acct-before', keys: { p256dh: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U', auth: 'tBHItJI5svbpez7KI4CCXg' } }, place: { lat: 52.2, lon: 0.12, name: 'Cambridge' }, rain: true, brief: true });
const cam = rows("SELECT name, rain, brief FROM wx_subs WHERE name = 'Cambridge'");
ok(old.status === 200 && cam.length === 1 && cam[0].rain === 1 && cam[0].brief === 1, 'the app from before (one place) still turns them on', `${old.status} ${JSON.stringify(cam)}`);
// (asked again where the server let the connection go while the database was being read)
const again = (...a) => call(...a).catch((e) => { if (e.code !== 'ECONNRESET') throw e; return call(...a); });
// a page not signed in to Weather, in a browser with the site's sign-in (asking whether its places go to the account):
// its notifications its own, and the device not the account's
{
  const endpoint = 'https://fcm.googleapis.com/fcm/send/acct-asked';
  const own = await again('POST', '/api/weather/subscribe', { sub: { endpoint, keys: { p256dh: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U', auth: 'tBHItJI5svbpez7KI4CCXg' } }, account: false, places: [{ lat: 51.75, lon: -1.26, name: 'Oxford', rain: true }] }, { cookie: `account=${lc.value}` });
  const d = rows(`SELECT d.user_id, s.name FROM wx_devs d JOIN wx_subs s ON s.dev = d.dev WHERE d.endpoint = '${endpoint}'`);
  ok(own.status === 200 && d.length === 1 && !d[0].user_id && d[0].name === 'Oxford', 'signed out of Weather, though the browser has the site\'s sign-in: the device\'s own notifications, not the account\'s', `${own.status} ${JSON.stringify(d)}`);
  await again('POST', '/api/weather/unsubscribe', { endpoint });
}
// units changed in Weather on one device: every device's notifications say them at once, not only that one's
{
  const me = JSON.parse((await again('GET', '/api/weather/me', null, { cookie: `account=${lc.value}` })).body);
  const units = () => rows(`SELECT DISTINCT s.units FROM wx_subs s JOIN wx_devs d ON d.dev = s.dev WHERE d.user_id = '${me.id}' AND d.dev NOT LIKE 'mail:%'`).map((r) => r.units);
  const was = units(), put = await again('PUT', '/api/weather/me', { base: me.ver, data: { ...me.data, settings: { ...me.data.settings, temp: 'c' } } }, { cookie: `account=${lc.value}` }), now = units();
  ok(put.status === 200 && was.length && was.every((u) => /"temp":"f"/.test(u)) && now.length && now.every((u) => /"temp":"c"/.test(u)), 'units changed in Weather: the notifications of every device of the account say them', JSON.stringify({ status: put.status, was, now }));
  await again('PUT', '/api/weather/me', { base: me.ver + 1, data: me.data }, { cookie: `account=${lc.value}` });
}

// ---- 8. The tick: Edinburgh's rain to both devices of the account ----
{
  const quiet = (() => { const h = new Date().getUTCHours(); return h >= 21 || h < 7; })();
  // (the tick in step 6, signing the tablet out, may have sent Edinburgh's rain already: as if that were hours ago)
  sql("UPDATE wx_subs SET last_rain = NULL");
  const tick = await new Promise((done) => { const r = http.request({ host: '127.0.0.1', port: 8788, path: '/api/weather/tick', method: 'POST', agent: false, headers: { Host: 'localhost', Authorization: 'Bearer tick-test-secret' } }, (res) => { let t = ''; res.on('data', (x) => (t += x)); res.on('end', () => done(JSON.parse(t || '{}'))); }); r.end(); });
  if (!quiet) ok(tick.rain >= 2, 'the tick: Edinburgh\'s rain alert to the phone and the laptop', JSON.stringify(tick));
  else console.log('(quiet hours in Edinburgh: the rain alert waits)', JSON.stringify(tick));
}

// ---- 8b. By email too: the warnings and the briefing, to the account's email once it's confirmed; off by the email's link ----
{
  const sam = rows("SELECT id FROM pg_users WHERE email = 'sam@example.com'")[0].id, mailDev = `mail:${sam}`;
  sql(`UPDATE pg_users SET email_ok = 1 WHERE id = '${sam}'`);
  await weather(P, 'lat=55.9533&lon=-3.1883&name=Edinburgh'); await settings(P); await folder(P, 'notify');
  const foot = await P.p.textContent('#notify-mail-foot');
  ok(await P.p.isVisible('#notify-mail') && /^To sam@example\.com, for the places and time above\. Rain alerts aren’t emailed/.test(foot), 'signed in: an Email group, to the account\'s email', foot);
  await P.p.check('#settings-form input[name=brief]'); await P.p.waitForTimeout(800);
  await P.p.check('#settings-form input[name=mailWarn]'); await P.p.waitForTimeout(800);
  await P.p.check('#settings-form input[name=mailBrief]');
  await waitFor(() => rows(`SELECT COUNT(*) AS n FROM wx_subs WHERE dev = '${mailDev}'`)[0]?.n === 2);
  const mailSubs = rows(`SELECT name, rain, warn, brief FROM wx_subs WHERE dev = '${mailDev}' ORDER BY name`);
  ok(JSON.stringify(mailSubs) === JSON.stringify([{ name: 'Edinburgh', rain: 0, warn: 0, brief: 1 }, { name: 'London', rain: 0, warn: 1, brief: 0 }]) && kept('sam')?.notify.email?.warn === true,
    'the account\'s email: London\'s warnings and the briefing (Edinburgh), kept with the account; never rain alerts', JSON.stringify(mailSubs));
  ok(/by email too\./.test(await P.p.textContent('#notify-status')), 'and the line that says what\'s on says so', await P.p.textContent('#notify-status'));
  ok(/Notifications go to/.test(await whereTo(P)) && !/Email/.test(await whereTo(P)), 'the email isn\'t among the devices notifications go to', await whereTo(P));
  await closeSheet(P);
  // the briefing due now; London's warnings all new (as if none had been told of)
  const at = new Date(Date.now() - 10 * 60e3), hhmm = `${String(at.getUTCHours()).padStart(2, '0')}:${String(at.getUTCMinutes()).padStart(2, '0')}`;
  sql(`UPDATE wx_subs SET brief_at = '${hhmm}', last_brief = NULL WHERE dev = '${mailDev}' AND brief = 1`);
  sql(`UPDATE wx_subs SET tz_off = 0, told = '{}' WHERE dev = '${mailDev}' AND warn = 1`);
  const before = readFileSync(`${S}/mailbox.jsonl`, 'utf8').trim().split('\n').filter(Boolean).length;
  const tick = await new Promise((done) => { const r = http.request({ host: '127.0.0.1', port: 8788, path: '/api/weather/tick', method: 'POST', agent: false, headers: { Host: 'localhost', Authorization: 'Bearer tick-test-secret' } }, (res) => { let t = ''; res.on('data', (x) => t += x); res.on('end', () => done(JSON.parse(t || '{}'))); }); r.end(); });
  const mails = readFileSync(`${S}/mailbox.jsonl`, 'utf8').trim().split('\n').filter(Boolean).slice(before).map((l) => JSON.parse(l).body).filter((m) => /^Weather </.test(m.from));
  const brief = mails.find((m) => /^Edinburgh: .+ · \d+°$/.test(m.subject)), warn = mails.find((m) => /^Amber thunderstorm warning: London/.test(m.subject));
  if (at.getUTCDate() === new Date().getUTCDate()) ok(brief && brief.to === 'sam@example.com' && /mail\/wx-[a-z-]+\.png/.test(brief.html) && /Morning:/.test(brief.text), 'the tick: the briefing by email, from Weather, with the day in three', `${JSON.stringify(tick)} ${mails.map((m) => m.subject)}`);
  else console.log('(just after midnight: the briefing waits for its day)');
  ok(warn && /mail\/weather-warn-amber\.png/.test(warn.html) && /Thunderstorms could bring flooding/.test(warn.text), 'and London\'s warning, in its own colour', mails.map((m) => m.subject).join(' | '));
  const link = /(\/api\/weather\/email-off\?u=[^&"]+&(?:amp;)?t=[A-Za-z0-9_-]+)/.exec(warn?.html || '')?.[1]?.replace(/&amp;/g, '&') || '';
  ok(link && warn.headers?.['List-Unsubscribe']?.includes(link) && warn.headers?.['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click', 'each with a link to turn them off, and the mail app\'s own Unsubscribe', link);
  // the link: GET shows a button and changes nothing; POST turns them off (as a mail app's one-click does)
  // (each on a connection of its own: one kept open since may have been closed by the server meanwhile)
  const hit = (method, path = link) => new Promise((done) => { const r = http.request({ host: '127.0.0.1', port: 8788, path, method, agent: false, headers: { Host: 'weather.ifl.test:8788' } }, (res) => { let t = ''; res.on('data', (x) => t += x); res.on('end', () => done({ status: res.statusCode, body: t })); }); r.end(); });
  const g = await hit('GET');
  ok(g.status === 200 && /Turn off Weather’s emails\?/.test(g.body) && /<form method="post"/.test(g.body) && kept('sam')?.notify.email?.warn === true, 'the link: a button first, nothing turned off yet', String(g.status));
  const pst = await hit('POST');
  ok(pst.status === 200 && /Emails turned off/.test(pst.body) && kept('sam')?.notify.email?.warn === false && !rows(`SELECT dev FROM wx_devs WHERE dev = '${mailDev}'`).length, 'pressed: turned off, kept so, and the email no longer sent to', JSON.stringify(kept('sam')?.notify.email));
  ok(/Link expired/.test((await hit('POST', link.replace(/t=[^&]+$/, 't=wrong'))).body), 'a wrong link turns nothing off');
  await weather(P, 'lat=55.9533&lon=-3.1883&name=Edinburgh'); await settings(P); await folder(P, 'notify');
  await waitFor(async () => !(await P.p.isChecked('#settings-form input[name=mailWarn]')), 8000);
  ok(!(await P.p.isChecked('#settings-form input[name=mailWarn]')) && !(await P.p.isChecked('#settings-form input[name=mailBrief]')), 'and Weather shows them off', '');
  await closeSheet(P);
}

// ---- 9. The account deleted (on the account's page, a week's grace, then gone): what Weather kept goes with it ----
{
  await L.p.goto(`${CHAT}/`); await L.p.waitForSelector('.tabs', { timeout: 20000 }).catch(() => {});
  // (deleting needs it shown it's you in the last ten minutes: as if the password had just been asked for)
  sql(`UPDATE pg_sessions SET auth_at = ${Date.now()} WHERE user_id = (SELECT id FROM pg_users WHERE email = 'sam@example.com')`);
  const ck = (await L.ctx.cookies(CHAT)).find((c) => c.name === 'account'), handle = rows("SELECT handle FROM pg_users WHERE email = 'sam@example.com'")[0]?.handle;
  // (each on a connection of its own, as every request here is: one kept open since may have been let go by the server
  // while the database was being changed, and the next sent on it dies with "socket hang up")
  const post = (path, host, headers, data) => new Promise((done) => { const r = http.request({ host: '127.0.0.1', port: 8788, path, method: 'POST', agent: false, headers: { Host: host, ...headers } }, (res) => { let t = ''; res.on('data', (x) => (t += x)); res.on('end', () => done({ status: res.statusCode, body: t, cookie: res.headers['set-cookie'] })); }); if (data) r.write(data); r.end(); });
  const del = await post('/api/account/delete', 'account.ifl.test:8788', { 'Content-Type': 'application/json', Origin: 'http://account.ifl.test:8788', Cookie: `account=${ck?.value}` }, JSON.stringify({ confirm: handle }));
  ok(del.status === 200 && /account=;.*Max-Age=0/.test(String(del.cookie)), 'deleting the account signs the browser out of the site', `${del.status} ${del.body.slice(0, 80)}`);
  // (the week's grace over: the next tick deletes it, and what Weather kept with it)
  sql(`UPDATE pg_users SET delete_at = ${Date.now() - 1000} WHERE email = 'sam@example.com'`); sql("UPDATE pg_meta SET v = '0' WHERE k = 'keep_at'");
  await post('/api/pigeon/notify-tick', 'chat.ifl.test:8788', { Authorization: 'Bearer tick-test-secret' });
  const left = rows("SELECT (SELECT COUNT(*) FROM wx_accts) AS a, (SELECT COUNT(*) FROM wx_devs WHERE user_id IS NOT NULL) AS d, (SELECT COUNT(*) FROM wx_subs WHERE dev LIKE '%') AS s")[0];
  ok(left.a === 0 && left.d === 0 && left.s === 1 + tSubs, 'and what Weather kept with it goes (only the devices not with it keep their own)', JSON.stringify(left));
}

await L.p.screenshot({ path: `${out}/wxacct-laptop.png` }).catch(() => {});
ok(!errs.length, 'no errors on the pages', errs.join(' ; '));
console.log(`FAILS ${fails}`);
await b.close();
process.exit(0);
