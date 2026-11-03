// needs: hub
// Weather at InFlite's hub (Today First, spec §9.2, §14.3): /weather/ a page of inflite.ai (ifl.test:8788 here, the
// inflite repo's Worker, fetching Weather from weather.ifl.test), opened on any of its sections (#radar, #day=…,
// #warnings, a place by ?lat=&lon=&name=) and told again while it's open (hashchange, and a notification tapped
// meanwhile, the root worker's { ifl: "open" }); Back where the photo goes, back where you came from in the window (the
// breadcrumb: from Apps, from Chats), else Apps; signed out, Sign In is the hub's (through Chats); Send hands the card
// to the hub's own Send (IFL.hub.send: Chat's engine's sheet, else Chats' own and back here); its worker lets go of
// Weather's own old copies alone, never Today's or Chats'; the place it opened on as a stand-in is never written to the
// account; Settings there has no Sign Out of its own (You's) and asks the browser for no notifications (You's too); the
// bar fits at 320, 375 and 390 wide; and at its own address, standalone, the once-only card that InFlite is one app now,
// whose Turn Off Notifications Here stays off (My Location moving, the units changed, signed in or out), till a person
// turns them on there again. Open-Meteo, the radar and the map are stood in for in the browser, the warnings' services
// at the site (as wxapp.mjs does: mocks/wxappdata.mjs, mocks/wxwarnings.mjs).
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { kit } from './lib.mjs';
import { hostCall } from './handback.mjs';
import * as F from './mocks/wxappdata.mjs';
import * as OW from './mocks/wxwarnings.mjs';

const [,, S, out] = process.argv;
const K = await kit(S, out);
const { ok, hubPhone, HUB } = K;
const ROOT = process.env.APP_ROOT || new URL('../../', import.meta.url).pathname;
const CACHE = /const CACHE = "([^"]+)"/.exec(readFileSync(`${ROOT}/weather/sw.js`, 'utf8'))[1];
const now = Date.now(), D = 864e5;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
process.on('uncaughtException', (e) => { console.log(`FAIL  ${e.message.split('\n')[0]}`); console.log(`FAILS ${K.fails() + 1}`); process.exit(0); });

// the official warnings' services, as the site asks them (server.sh: METEOALARM_URL, NWS_URL, EA_URL): the Met Office's,
// through MeteoAlarm's feed, two in force over London
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), send = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/api/v1/warnings/feeds-united-kingdom') return send(OW.ukFeed(Date.now(), {}));
  if (u.pathname.startsWith('/api/v1/warnings/feeds-')) return send({ warnings: [] });
  if (u.pathname === '/flood-monitoring/id/floods') return send({ items: [] });
  if (u.pathname === '/alerts/active') { res.writeHead(400); return res.end('{"title":"out of bounds"}'); }
  res.writeHead(404); res.end();
}).listen(8794, '127.0.0.1');

// ---- an account, made at the tests' sign-in page (its cookie covers ifl.test) ----
const b64u = (u) => Buffer.from(u).toString('base64url');
const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']), pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
const made = await hostCall('auth.ifl.test', '/api/account/signup', { name: 'Wren Adeyemi', handle: 'wrenwx', email: 'wren@example.com', salt: b64u(randomBytes(16)), proof: b64u(randomBytes(32)),
  vault: 'x'.repeat(40), pub: { kty: 'EC', crv: 'P-256', x: pub.x, y: pub.y } }, { ip: '10.0.9.31' });
ok(made.s === 201 && made.cookie, 'an account made, signed in on the tests’ site', `${made.s} ${JSON.stringify(made.j)}`);
const [cname, cvalue] = made.cookie.split('=');

// A phone at the hub (hubPhone: an iPhone, standalone, one window), its weather stood in for, the page's own errors
// noted (wx: those while a page of Weather's was showing). engine: what the hub's /chats/?engine=1 is ("ready", an
// engine whose share is noted as window.__shared; "none", one that says it's there but has no IFLChat; left out, Chats'
// own). chats: Chats' page stood in for, so where it was sent stays to be read
const wx = [];
async function phone(name, { signedIn = true, engine = null, chats = false, keys = null } = {}) {
  const ph = await hubPhone(name, keys, { path: '/robots.txt', cookies: signedIn ? { [cname]: cvalue } : {} });
  const { ctx, p } = ph;
  const mine = () => /\/weather\//.test(p.url()) || /^http:\/\/weather\.ifl\.test/.test(p.url());
  p.on('pageerror', (e) => { if (mine()) wx.push(`${name}: ${e.message}`); });
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text()) && mine()) wx.push(`${name}: ${m.text()}`); });
  p.on('dialog', (d) => d.accept());
  const j = (r, o) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o), headers: { 'Access-Control-Allow-Origin': '*' } });
  await ctx.route(/open-meteo\.com|bigdatacloud/, (r) => {
    const u = r.request().url();
    if (u.includes('ensemble-api')) return j(r, F.ensemble(now, { rainIn: 90 }));
    if (u.includes('air-quality')) return j(r, F.air(now));
    if (u.includes('marine-api')) return j(r, F.marine(now, u));
    if (u.includes('archive-api')) return j(r, F.archive(now));
    if (u.includes('geocoding')) return j(r, { results: [] });
    if (u.includes('bigdatacloud')) return j(r, { city: 'London', countryCode: 'GB' });
    if (u.includes('models=')) return j(r, F.models(now, { rainIn: 90 }));
    if (u.includes('previous-runs-api') || u.includes('past_hours') || u.includes('forecast_minutely_15=9') || u.includes('hourly=precipitation%2Csnowfall') || u.includes('hourly=temperature_2m%2Cwind')) return r.fulfill({ status: 503, body: '' });
    return j(r, F.forecast(now, { rainIn: 90 }));
  });
  await ctx.route(/api\.rainviewer\.com/, (r) => j(r, { host: 'https://tilecache.rainviewer.com', radar: { past: Array.from({ length: 13 }, (_, k) => ({ time: Math.floor(now / 600e3) * 600 - (12 - k) * 600, path: `/v2/radar/f${k}` })), nowcast: [] } }));
  await ctx.route(/tilecache\.rainviewer\.com|tile\.openstreetmap\.org|aviationweather|meteoalarm/, (r) => r.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: PNG }));
  await ctx.route(/tiles\.openfreemap\.org/, (r) => {
    const u = r.request().url(), cors = { 'Access-Control-Allow-Origin': '*' };
    if (/\/planet$/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ tilejson: '3.0.0', tiles: ['https://tiles.openfreemap.org/planet/test/{z}/{x}/{y}.pbf'], minzoom: 0, maxzoom: 14 }) });
    return r.fulfill({ status: 200, contentType: /\.png$/.test(u) ? 'image/png' : 'application/x-protobuf', headers: cors, body: /\.png$/.test(u) ? PNG : Buffer.alloc(0) });
  });
  if (engine) await ctx.route(/^http:\/\/ifl\.test:8788\/chats\/\?engine=1$/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><meta charset="utf-8"><title>Chats</title><script>
    ${engine === 'ready' ? `window.IFLChat = { state: "ready", share(words, packed, o) { parent.__shared = { words, packed, to: (o && o.to) || null }; return Promise.resolve({ why: "a stand-in" }); },
      sendTo: () => Promise.resolve({ ok: false }), waiting: async () => [], since: async () => [], refresh: async () => {}, signOut: async () => {} };` : ''}
    parent.dispatchEvent(new Event("ifl-chat-ready"));</script>` }));
  if (chats) await ctx.route(/^http:\/\/ifl\.test:8788\/chats\/(#.*)?$/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>Chats</title><p>Chats</p>' }));
  return ph;
}
// (the page drawn: the forecast in, and the account taken up when signed in; then quiet a moment)
const drawn = async (p, { signedIn = true } = {}) => {
  await p.waitForSelector('.day-row', { timeout: 30000 });
  if (signedIn) await p.waitForSelector('#me-btn[hidden]', { state: 'attached', timeout: 20000 });
  await p.waitForTimeout(400);
};
const at = (p) => new URL(p.url());
// (where a card is on screen: its top, below the bar held at the top, and in sight)
const inSight = (p, sel) => p.waitForFunction((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r && r.top >= 40 && r.top < 200; }, sel, { timeout: 8000 }).then(() => true, () => false);
// (…and still there a few seconds on, once the page has settled round it: nothing above it, drawn late, has moved it away)
const staysInSight = async (p, sel) => (await inSight(p, sel)) && (await p.waitForTimeout(3500), await p.evaluate((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return !!r && r.top >= 40 && r.top < 200; }, sel));
// (the word said under the bar)
const toastSays = (p, re) => p.waitForFunction((src) => new RegExp(src).test(document.getElementById('toast')?.textContent || ''), re.source, { timeout: 15000 }).then(() => true, () => false);
const toastNow = (p) => p.evaluate(() => document.getElementById('toast')?.textContent || '');
// (Weather's places and notifications as the account has them, asked from the page: its cookie)
const account = (p) => p.evaluate(() => fetch('/api/weather/me').then((r) => r.json()));
// (Settings, at one of its folders)
async function folder(p, name) {
  if (!(await p.$('#settings[open]'))) { await p.click('#settings-btn'); await p.waitForSelector('#settings[open]', { timeout: 10000 }); await p.waitForTimeout(500); }
  await p.click(`#settings button.folder[data-go="${name}"]`);
  await p.waitForSelector(`#settings .set-page[data-page="${name}"]:not([hidden])`, { timeout: 10000 });
  await p.waitForTimeout(600);
}
const closeSettings = async (p) => { await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('#settings[open]'), null, { timeout: 5000 }).catch(() => {}); await p.waitForTimeout(300); };
// (the bar at the top, at 320, 375 and 390 wide: Back (its word only with room for it: signed in, 360 wide or more),
// the outline that signs in, the place and its buttons each clear of the next and on screen, and the place's name whole)
async function barFits(p, label, signedIn) {
  for (const w of [320, 375, 390]) {
    await p.setViewportSize({ width: w, height: 844 }); await p.waitForTimeout(500);
    const b = await p.evaluate(() => {
      const box = (s) => { const e = document.querySelector(s); if (!e || e.hidden || getComputedStyle(e).display === 'none') return null; const r = e.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right) }; };
      const n = document.getElementById('place-name'), word = document.querySelector('#hub-back .ifl-back-l');
      return { w: innerWidth, back: box('#hub-back'), me: box('#me-btn'), place: box('.top .place'), acts: box('.top .ifh-acts'), word: !!word && getComputedStyle(word).display !== 'none', name: n.textContent, shown: n.clientWidth, needs: n.scrollWidth };
    });
    const row = [b.back, b.me, b.place, b.acts].filter(Boolean), clear = row.every((x, i) => i === 0 || row[i - 1].r <= x.l) && !!b.acts && b.acts.r <= w && !!b.back;
    ok(clear && b.needs <= b.shown + 1 && b.word === (signedIn && w >= 360) && !!b.me === !signedIn,
      `the bar, ${label}, ${w} wide: Back${b.word ? ' and its word' : ' (its word dropped)'}${b.me ? ', Sign In' : ''}, “${b.name}” whole, nothing overlapping`, JSON.stringify(b));
    await p.screenshot({ path: `${out}/bar-${label.replace(/\W+/g, '-')}-${w}.png`, clip: { x: 0, y: 0, width: w, height: 120 } });
  }
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
}
const dayKey = (n) => new Date(now + n * D).toISOString().slice(0, 10);
const dayOfMonth = (n) => String(new Date(now + n * D).getUTCDate());

// ---- 1. opened on the radar, signed in: Back where the photo goes, the radar scrolled to and fetched ----
{
  const ph = await phone('wren');
  const { p } = ph;
  const res = await p.goto(`${HUB}/weather/#radar`);
  ok(res.status() === 200 && at(p).origin === HUB, '/weather/: a page of the hub', `${res.status()} ${p.url()}`);
  await drawn(p);
  const top = await p.evaluate(() => ({ back: document.getElementById('hub-back')?.textContent.trim(), first: document.querySelector('.top')?.firstElementChild?.id, label: document.getElementById('hub-back')?.getAttribute('aria-label'),
    me: document.getElementById('me-btn').hidden, gear: !document.getElementById('settings-btn').hidden, tabs: !!document.querySelector('.ifl-tabs'), marker: document.querySelector('meta[name="ifl-hub"]')?.content }));
  ok(top.marker === '/weather/' && top.first === 'hub-back' && top.back === 'Back' && top.label === 'Back', 'Back where the photo goes, first in the bar', JSON.stringify(top));
  ok(top.me && top.gear && !top.tabs, 'signed in: no photo menu (the account is InFlite’s), Settings’ gear beside the place, no tab bar of the hub’s', JSON.stringify(top));
  ok(await staysInSight(p, '#radar'), '#radar: the radar card scrolled to, clear of the bar, and kept there as the page settles');
  const radar = await p.waitForFunction(() => performance.getEntriesByType('resource').some((r) => /\/weather\/radar\.js/.test(r.name)) && !!document.querySelector('#radar .radar-map')?.childElementCount, null, { timeout: 15000 }).then(() => true, () => false);
  ok(radar, '…and its code fetched and its map made');
  ok(at(p).pathname === '/weather/' && !at(p).hash, 'the section taken out of the address once read', p.url());
  await p.screenshot({ path: `${out}/radar.png` });
  // (the place it opened on, the connection's guess, is a stand-in: this device's alone, never written to the account,
  // which has no places of Weather's yet, nor on to every device it's on)
  await p.waitForTimeout(2500);
  const first = await account(p);
  ok(first.signedIn && Array.isArray(first.data?.places) && first.data.places.length === 0, 'first open at the hub: the stand-in it opened on kept out of the account (no place written there unchosen)', JSON.stringify({ places: first.data?.places, here: await p.evaluate(() => localStorage.getItem('wx:places')) }));

  // ---- 2. told again while open: #day=, #warnings, #radar again, and a notification tapped meanwhile ----
  // (on London, where the Met Office has warnings out: a place added from a link, as it asks)
  await p.goto(`${HUB}/weather/?lat=51.5072&lon=-0.1276&name=London`);
  await drawn(p);
  ok((await p.textContent('#place-name')) === 'London', 'a place from a link, signed in: on it', await p.textContent('#place-name'));
  await p.evaluate((k) => { location.hash = `#day=${k}`; }, dayKey(2));
  const day = await p.waitForSelector('#day[open]', { timeout: 10000 }).then(() => true, () => false);
  const strip = await p.evaluate(() => document.querySelector('#day-strip [aria-current] b')?.textContent);
  ok(day && strip === dayOfMonth(2), `hashchange #day=${dayKey(2)}: that day in full`, `${day} ${strip}`);
  ok(!at(p).hash, 'and taken out of the address', p.url());
  await p.screenshot({ path: `${out}/day.png` });
  await p.evaluate(() => { location.hash = '#warnings'; });
  const warn = await p.waitForFunction(() => { const s = document.querySelector('#alerts .warn-sum'); return s?.classList.contains('open') && !document.getElementById('warn-all')?.hidden && !document.getElementById('day').open; }, null, { timeout: 15000 }).then(() => true, () => false);
  const said = await p.evaluate(() => document.querySelector('#alerts .warn-sum .ins-open')?.textContent);
  ok(warn && /^\d+ warnings$/.test(said || ''), 'hashchange #warnings: the day put away, the warnings’ banner opened', `${warn} ${said}`);
  ok(await inSight(p, '#alerts'), '…and scrolled to');
  await p.screenshot({ path: `${out}/warnings.png` });
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(300);
  await p.evaluate(() => { location.hash = '#radar'; });
  ok(await inSight(p, '#radar'), 'the radar asked for a second time: scrolled to again (a change, as the first was taken out)');
  // (a notification tapped while Weather's open: the root worker's word to the window, which the hub turns into the address)
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(300);
  await p.evaluate(() => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { ifl: 'open', url: '/weather/#warnings' } })));
  ok(await inSight(p, '#alerts'), 'a notification tapped meanwhile ({ ifl: "open", url: "/weather/#warnings" }): the warnings, in the same page');
  // (a day the forecast doesn't reach: said so, nothing opened)
  await p.evaluate((k) => { location.hash = `#day=${k}`; }, dayKey(40));
  ok(await toastSays(p, /^That day isn’t in the forecast now\.$/) && !(await p.$('#day[open]')), `#day=${dayKey(40)}, past the forecast: said so, nothing opened`, await toastNow(p));
  ok(ph.pages.length === 1, 'one window throughout', String(ph.pages.length));

  // ---- 3. opened straight on a day, on the warnings, on a place ----
  await p.goto(`${HUB}/weather/#day=${dayKey(3)}`);
  await drawn(p);
  const d3 = await p.waitForSelector('#day[open]', { timeout: 10000 }).then(() => true, () => false);
  ok(d3 && (await p.evaluate(() => document.querySelector('#day-strip [aria-current] b')?.textContent)) === dayOfMonth(3), `/weather/#day=${dayKey(3)}: opened on that day`);
  await p.goto(`${HUB}/weather/#warnings`);
  await drawn(p);
  ok(await p.waitForFunction(() => document.querySelector('#alerts .warn-sum')?.classList.contains('open'), null, { timeout: 15000 }).then(() => true, () => false) && await inSight(p, '#alerts'), '/weather/#warnings: opened on the warnings');
  await p.goto(`${HUB}/weather/?lat=52.8213&lon=1.3876&name=North%20Walsham#radar`);
  await p.waitForFunction(() => document.getElementById('place-name')?.textContent === 'North Walsham', null, { timeout: 20000 }).catch(() => {});
  await drawn(p);
  ok((await p.textContent('#place-name')) === 'North Walsham' && at(p).search === '' , 'a place, ?lat=&lon=&name=: on that place', `${await p.textContent('#place-name')} ${p.url()}`);
  ok(await staysInSight(p, '#radar'), '…and with #radar after it, on its radar, and kept there as the page settles');
  // (more places opened fresh with #radar, each forecast new to the page: on the radar every time, not a scroll worked
  // out while the cards were still moving into place)
  for (const [name, lat, lon] of [['York', 53.959, -1.0815], ['Cromer', 52.9311, 1.2985], ['Bath', 51.3811, -2.359]]) {
    await p.goto(`${HUB}/weather/?lat=${lat}&lon=${lon}&name=${encodeURIComponent(name)}#radar`);
    await p.waitForFunction((n) => document.getElementById('place-name')?.textContent === n, name, { timeout: 20000 }).catch(() => {});
    await drawn(p);
    ok(await staysInSight(p, '#radar'), `${name}, opened fresh with #radar: on its radar, and kept there`);
  }
  // (#warnings with one warning in force: no banner of several, just its card; with none, said so)
  await p.goto(`${HUB}/weather/?lat=51.4545&lon=-2.5879&name=Bristol#warnings`);
  await p.waitForFunction(() => document.getElementById('place-name')?.textContent === 'Bristol', null, { timeout: 20000 }).catch(() => {});
  await drawn(p);
  const one = await p.waitForFunction(() => !!document.querySelector('#alerts .ins.official'), null, { timeout: 15000 }).then(() => true, () => false);
  const oneSaid = await p.evaluate(() => ({ cards: document.querySelectorAll('#alerts .ins.official').length, banner: !!document.querySelector('#alerts .warn-sum') }));
  ok(one && oneSaid.cards === 1 && !oneSaid.banner && await inSight(p, '#alerts'), 'Bristol, one warning in force, #warnings: its card scrolled to, no banner of several', JSON.stringify(oneSaid));
  await p.goto(`${HUB}/weather/?lat=53.959&lon=-1.0815&name=York#warnings`);
  await drawn(p);
  ok(await toastSays(p, /^No warnings for York just now\.$/), 'York, none in force, #warnings: said so', await toastNow(p));
  await p.goto(`${HUB}/weather/?lat=51.5072&lon=-0.1276&name=London`);
  await drawn(p);

  // ---- 4. Back: to Apps with nothing to go back to; to where you came from: Apps, Chats ----
  await Promise.all([p.waitForURL(`${HUB}/#apps`, { timeout: 15000 }), p.click('#hub-back')]);
  ok(at(p).pathname === '/' && at(p).hash === '#apps', 'Back, opened with nowhere to go back to: Apps', p.url());
  const tile = await p.waitForSelector('.atile[data-app="weather"] a.atile-go', { timeout: 20000 }).then(() => true, () => false);
  ok(tile, 'Apps: Weather’s tile');
  if (tile) {
    await Promise.all([p.waitForURL(`${HUB}/weather/`, { timeout: 15000 }), p.click('.atile[data-app="weather"] a.atile-go')]);
    await drawn(p);
    await Promise.all([p.waitForURL(/\/#apps$/, { timeout: 15000 }), p.click('#hub-back')]);
    ok(at(p).hash === '#apps', 'opened from Apps: Back to Apps', p.url());
  }
  await p.goto(`${HUB}/chats/`, { waitUntil: 'load' });
  await p.evaluate(() => { const a = document.createElement('a'); a.href = '/weather/'; a.id = 'to-wx'; a.textContent = 'Weather'; document.body.append(a); });
  await Promise.all([p.waitForURL(`${HUB}/weather/`, { timeout: 15000 }), p.click('#to-wx')]);
  await drawn(p);
  const nav0 = await p.evaluate(() => history.length);
  await Promise.all([p.waitForURL(/^http:\/\/ifl\.test:8788\/chats\/(#.*)?$/, { timeout: 15000 }), p.click('#hub-back')]);
  ok(at(p).pathname === '/chats/', 'arrived from Chats: Back to Chats (the breadcrumb: Chats’ pages send no referrer)', p.url());
  ok((await p.evaluate(() => history.length)) > nav0, 'Back went forward to it, never history’s own back');
  ok(ph.pages.length === 1 && !(await p.evaluate(() => window.__opened.length)), 'one window, nothing opened beside it');
  // (the bar, signed in, on London; and Settings, which has no Sign Out of its own at the hub: signing out is InFlite's,
  // in You, for every app at once. Its way out, were it reached, goes to You and leaves the sign-in alone)
  await p.goto(`${HUB}/weather/`);
  await drawn(p);
  await barFits(p, 'signed in', true);
  await p.click('#settings-btn');
  await p.waitForSelector('#settings[open]', { timeout: 10000 }); await p.waitForTimeout(600);
  ok(!(await p.isVisible('#sign-out')), 'Settings at the hub, signed in: no Sign Out of Weather’s own (You’s)');
  await Promise.all([p.waitForURL(/\/#you$/, { timeout: 15000 }), p.evaluate(() => document.getElementById('sign-out').click())]);
  const kept = await account(p).catch(() => ({}));
  ok(at(p).pathname === '/' && at(p).hash === '#you' && kept.signedIn === true, '…its sign-out, reached anyway, goes to You, the sign-in left as it was', `${p.url()} ${kept.signedIn}`);
  // (and its Notifications, signed in the account's: You, in the same window, never a page of the account's own opened
  // beside it, which the hub has none of)
  await p.goto(`${HUB}/weather/`);
  await drawn(p);
  await p.click('#settings-btn');
  await p.waitForSelector('#settings[open]', { timeout: 10000 }); await p.waitForTimeout(600);
  await Promise.all([p.waitForURL(/\/#you$/, { timeout: 15000 }), p.click('#settings button.folder[data-go="notify"]')]).catch(() => {});
  ok(at(p).hash === '#you' && ph.pages.length === 1 && !(await p.evaluate(() => window.__opened.length)), 'Settings’ Notifications at the hub, signed in: You, in the one window', `${p.url()} ${ph.pages.length}`);
  await ph.ctx.close();
}

// ---- 5. Send: the card to the hub's own Send, Chat's engine's sheet over the page ----
{
  const ph = await phone('wren2', { engine: 'ready' });
  const { p } = ph;
  await p.goto(`${HUB}/weather/?lat=51.5072&lon=-0.1276&name=London`);
  await drawn(p);
  await p.waitForSelector('#send-btn', { timeout: 15000 });
  const asked = [], watch = (r) => { if (/\/api\//.test(r.url())) asked.push(`${r.method()} ${new URL(r.url()).pathname}`); };
  p.on('request', watch);
  await p.click('#send-btn');
  const shared = await p.waitForFunction(() => window.__shared, null, { timeout: 20000 }).then((h) => h.jsonValue(), () => null);
  p.off('request', watch);
  let card = null; try { card = JSON.parse(Buffer.from(shared?.packed || '', 'base64url').toString('utf8')); } catch (_) {}
  ok(shared && /^London today: /.test(shared.words), 'Send: IFL.hub.send, Chat’s engine handed the words', JSON.stringify(shared?.words));
  ok(card?.kind === 'weather' && card.from === 'weather' && card.snap?.place === 'London' && JSON.stringify(card.ref) === '{"cell":[51.5,-0.15]}', '…and the card, packed as Chat’s links carry it, its place a 0.05° cell', JSON.stringify(card?.ref));
  ok(!/51\.5072|-0\.1276/.test(JSON.stringify(card) + (shared?.words || '')), 'the exact place in neither');
  ok(at(p).pathname === '/weather/' && ph.pages.length === 1, 'and still on Weather, in the one window', p.url());
  ok(!asked.some((a) => /pigeon|share/.test(a)), 'nothing of the card sent to a server by Weather', asked.join(', '));
  await ph.ctx.close();
}
// (the engine not ready: Chats' own sheet, the card in its address, and back here after)
{
  const ph = await phone('wren3', { engine: 'none', chats: true });
  const { p } = ph;
  await p.goto(`${HUB}/weather/?lat=51.5072&lon=-0.1276&name=London`);
  await drawn(p, { signedIn: false });
  await p.waitForSelector('#send-btn', { timeout: 15000 });
  await Promise.all([p.waitForURL(/\/chats\/#share=/, { timeout: 20000 }), p.click('#send-btn')]);
  const q = new URLSearchParams(at(p).hash.slice(1));
  let card = null; try { card = JSON.parse(Buffer.from(q.get('card') || '', 'base64url').toString('utf8')); } catch (_) {}
  ok(at(p).origin === HUB && /^London today: /.test(q.get('share') || '') && q.get('back') === '/weather/', 'the engine not ready: Chats’ own, at the hub, coming back to Weather', p.url().slice(0, 120));
  ok(card?.snap?.place === 'London' && card.kind === 'weather', '…with the card', JSON.stringify(card?.snap || null).slice(0, 80));
  await ph.ctx.close();
}

// ---- 6. signed out: Sign In is the hub's ----
{
  const ph = await phone('anon', { signedIn: false, chats: true });
  const { p } = ph;
  await p.goto(`${HUB}/weather/`);
  await drawn(p, { signedIn: false });
  const out0 = await p.evaluate(() => ({ back: !!document.getElementById('hub-back'), me: !document.getElementById('me-btn').hidden, label: document.getElementById('me-btn').getAttribute('aria-label'), gear: !document.getElementById('settings-btn').hidden }));
  ok(out0.back && out0.me && out0.label === 'Sign in' && out0.gear, 'signed out: Back, the outline that signs in beside it, and Settings', JSON.stringify(out0));
  await p.screenshot({ path: `${out}/signed-out.png` });
  await barFits(p, 'signed out', false);
  // (Settings' Notifications at the hub: never Weather's to ask for, so the browser's not asked, nothing's turned on
  // here, and where they are is said: You, for every app)
  await p.evaluate(() => { window.__perm = 0; const ask = Notification.requestPermission.bind(Notification); Notification.requestPermission = (...a) => { window.__perm++; return ask(...a); }; });
  const subs = [], heard = (r) => { if (/\/api\/weather\/(un)?subscribe/.test(r.url())) subs.push(new URL(r.url()).pathname); };
  p.on('request', heard);
  await folder(p, 'notify');
  const said0 = await p.textContent('#notify-status');
  await p.click('#notify-places .np-row .np-chip[data-k="rain"]');
  await p.waitForTimeout(1200);
  const n6 = await p.evaluate(() => ({ said: document.getElementById('notify-status').textContent, on: document.querySelectorAll('#notify-places .np-chip[aria-pressed="true"]').length, perm: window.__perm, places: JSON.parse(localStorage.getItem('wx:settings') || '{}').notify?.places?.length || 0 }));
  p.off('request', heard);
  ok(/^In InFlite, every app's notifications are turned on in You\.$/.test(said0) && /in You/.test(n6.said) && !n6.on && !n6.places && !n6.perm && !subs.length,
    'Settings’ Notifications at the hub, signed out: “In InFlite, every app’s notifications are turned on in You.”, Rain tapped: the browser not asked, nothing on here', JSON.stringify({ said0, ...n6, subs }));
  await p.screenshot({ path: `${out}/notify-hub.png` });
  await closeSettings(p);
  // (the radar asked for with its card turned off in Arrange Your Page: said so, and where it's turned on)
  await folder(p, 'arrange');
  await p.locator('#arrange-list input[aria-label="Show Rain radar"]').setChecked(false, { force: true });
  await closeSettings(p);
  const offNow = await p.evaluate(() => document.getElementById('radar').hasAttribute('data-off'));
  await p.evaluate(() => { location.hash = '#radar'; });
  ok(offNow && await toastSays(p, /^The radar is turned off\. Settings, Arrange Your Page, turns it on\.$/), '#radar with the radar card turned off: said so, and where to turn it on', `${offNow} ${await toastNow(p)}`);
  await folder(p, 'arrange');
  await p.locator('#arrange-list input[aria-label="Show Rain radar"]').setChecked(true, { force: true });
  await closeSettings(p);
  await Promise.all([p.waitForURL(/\/chats\/#signin-start/, { timeout: 15000 }), p.click('#me-btn')]);
  ok(at(p).origin === HUB && at(p).pathname === '/chats/' && at(p).hash === `#signin-start&then=${encodeURIComponent('/weather/')}`, 'Sign In: the hub’s, through Chats, and back to Weather', p.url());
  await ph.ctx.close();
}

// ---- 7. Weather's worker at the hub lets go of its own old copies alone ----
{
  const ph = await phone('caches', { signedIn: false });
  const { p } = ph;
  await p.goto(`${HUB}/`);
  // (Today's own worker and its copy, at /, once it's settled (it lets go of Today's own older ones itself), and the
  // other apps' as they'd be there: Chats', Fitness's, Markets', and an older Weather's)
  await p.waitForFunction(() => navigator.serviceWorker.getRegistration('/').then((r) => r?.active?.state === 'activated') && caches.keys().then((ks) => ks.some((k) => /^today-app-/.test(k))), null, { timeout: 20000, polling: 500 }).catch(() => {});
  await p.evaluate(async () => { for (const k of ['inflight-shell-1.67', 'fx-shell-1.40', 'mk-1.61', 'wx-1.00']) await (await caches.open(k)).put(`/__${k}`, new Response(k)); });
  const before = await p.evaluate(() => caches.keys());
  await p.goto(`${HUB}/weather/`);
  await drawn(p, { signedIn: false });
  const active = await p.waitForFunction(() => navigator.serviceWorker.getRegistration('/weather/').then((r) => r?.active?.state === 'activated' && r.scope.endsWith('/weather/')), null, { timeout: 30000, polling: 500 }).then(() => true, () => false);
  await p.waitForFunction((c) => caches.keys().then((ks) => ks.includes(c) && !ks.includes('wx-1.00')), CACHE, { timeout: 15000, polling: 500 }).catch(() => {});
  const after = await p.evaluate(() => caches.keys());
  ok(active, 'Weather’s worker at the hub: /weather/ its scope, started');
  ok(after.includes(CACHE) && !after.includes('wx-1.00'), `its own copy (${CACHE}) kept, its older one let go`, JSON.stringify(after));
  const theirs = before.filter((k) => /^(today-app-|inflight-shell-|fx-|mk-)/.test(k));
  ok(theirs.length >= 4 && theirs.some((k) => /^today-app-/.test(k)) && theirs.every((k) => after.includes(k)), 'every other app’s copies at the address left alone (Today’s, Chats’, Fitness’s, Markets’)', JSON.stringify({ before, after }));
  // (and nothing of the hub's own answered by it: the manifest, Today's page, the hub's readiness)
  const ctl = await p.evaluate(async (c) => (await (await caches.open(c)).keys()).map((q) => new URL(q.url).pathname), CACHE);
  ok(ctl.length && ctl.every((x) => x.startsWith('/weather/')), 'its copy holds only Weather’s own', JSON.stringify(ctl.filter((x) => !x.startsWith('/weather/')).slice(0, 4)));
  await ph.ctx.close();
}

// ---- 8. off the hub, at its own address on the Home Screen: once, InFlite is one app now; Turn Off stays off ----
// (signed out: rain alerts for My Location, an old icon's commonest way; then My Location moving with the phone, and the
// units changed, neither turning them on again. Signed in: the same, the account's choices kept for its other devices;
// and a choice made there by a person, which does turn them on again)
const OWN = 'http://weather.ifl.test:8788';
const subAsks = (p) => { const asked = []; p.on('request', (r) => { if (/\/api\/weather\/(un)?subscribe/.test(r.url())) asked.push(new URL(r.url()).pathname); }); return asked; };
const here = (p) => p.evaluate(() => { const s = JSON.parse(localStorage.getItem('wx:settings') || '{}'); return { card: !!document.querySelector('.ifl-moved'), sub: !!localStorage.getItem('fakesub'), temp: s.temp, ...(s.notify || {}) }; });
const turnedOff = (p) => p.waitForFunction(() => { const n = JSON.parse(localStorage.getItem('wx:settings') || '{}').notify || {}; return n.off === true && !n.endpoint && !localStorage.getItem('fakesub'); }, null, { timeout: 15000 }).then(() => true, () => false);
const toF = async (p) => { await folder(p, 'units'); await p.click('#settings label:has(input[name="temp"][value="f"])'); await p.waitForTimeout(2500); await closeSettings(p); };
// (the app opened again, the phone now in Leeds: My Location follows it, and its notifications with it)
const inLeeds = async (p, ctx) => {
  await ctx.setGeolocation({ latitude: 53.801, longitude: -1.549 });
  await p.goto(`${OWN}/`);
  await drawn(p, { signedIn: false });
  const moved = await p.waitForFunction(() => JSON.parse(localStorage.getItem('wx:places') || '[]').some((x) => x.gps && Math.abs(x.lat - 53.801) < 0.01), null, { timeout: 15000 }).then(() => true, () => false);
  await p.waitForTimeout(6000);
  return moved;
};
{
  const keys = await K.makeKeys();
  const ph = await phone('old', { signedIn: false, keys });
  const { p, ctx } = ph;
  // (allowed there, notifications and the location, so the app would keep its notifications going by itself, and
  // following you, were it not told they're off)
  await ctx.grantPermissions(['notifications', 'geolocation'], { origin: OWN });
  await ctx.setGeolocation({ latitude: 51.507, longitude: -0.128 });
  await p.goto(`${OWN}/`);
  await drawn(p, { signedIn: false });
  await p.waitForTimeout(2000);
  // (notifications on here, as an old icon would have them: rain alerts for My Location, in London; this device's subscription)
  await p.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: new Uint8Array(65).fill(4) });
    localStorage.setItem('wx:places', JSON.stringify([{ name: 'London', region: '', lat: 51.507, lon: -0.128, gps: true }])); localStorage.setItem('wx:cur', '0');
    const s = JSON.parse(localStorage.getItem('wx:settings') || '{}');
    s.notify = { places: [{ lat: 51.507, lon: -0.128, name: 'London', gps: true, rain: true, warn: true }], brief: null, briefAt: '07:00', endpoint: sub.endpoint, devId: null, syncedAt: Date.now() };
    localStorage.setItem('wx:settings', JSON.stringify(s)); localStorage.removeItem('ifl-moved:weather');
  });
  const asked = subAsks(p);
  await p.goto(`${OWN}/`);
  const card = await p.waitForSelector('.ifl-moved .ifa-sheet', { timeout: 15000 }).then(() => true, () => false);
  const words = card ? await p.evaluate(() => [...document.querySelectorAll('.ifl-moved .ifa-sheet :is(h2, button)')].map((x) => x.textContent).join(' | ')) : '';
  ok(card && /InFlite is one app now/.test(words) && /Turn Off Notifications Here/.test(words), 'its own address, standalone: once, InFlite is one app now, with Turn Off Notifications Here', words);
  await p.screenshot({ path: `${out}/moved.png` });
  if (card) await p.click('.ifl-moved .ifa-off');
  const off = await turnedOff(p), n0 = await here(p);
  ok(off && asked.includes('/api/weather/unsubscribe') && !n0.places?.length && !n0.brief, 'Turn Off: this device told it wants nothing, its subscription let go, and (signed out) its own choices with it', JSON.stringify({ asked, places: n0.places }));
  await p.waitForTimeout(800);
  await folder(p, 'notify');
  const st = await p.evaluate(() => ({ said: document.getElementById('notify-status').textContent, on: document.querySelectorAll('#notify-places .np-chip[aria-pressed="true"]').length }));
  ok(!/^On/.test(st.said) && !st.on, 'Settings’ Notifications then says none are on here (no “On: rain alerts for …”)', JSON.stringify(st));
  await closeSettings(p);
  asked.length = 0;
  const moved = await inLeeds(p, ctx), again = await here(p);
  ok(moved && !again.card && !again.sub && again.off === true && !asked.includes('/api/weather/subscribe'), 'opened again with the phone moved, London to Leeds (My Location following it): no card, and still off', JSON.stringify({ moved, ...again, asked }));
  await toF(p);
  const units = await here(p);
  ok(units.temp === 'f' && !units.sub && units.off === true && !asked.includes('/api/weather/subscribe'), 'the units changed in Settings (°F): still off, nothing asked of the server', JSON.stringify({ temp: units.temp, off: units.off, asked }));
  // (and never at the hub: a page of InFlite's)
  await p.goto(`${HUB}/weather/`);
  await drawn(p, { signedIn: false });
  await p.evaluate(() => localStorage.removeItem('ifl-moved:weather'));
  await p.reload(); await drawn(p, { signedIn: false }); await p.waitForTimeout(2500);
  ok(!(await p.$('.ifl-moved')), 'at the hub: never');
  await ctx.close();
}
// (signed in, at its own address: rain alerts for My Location turned on there by the person, so it's one of the
// account's devices; then Turn Off)
{
  const keys = await K.makeKeys();
  const ph = await phone('old2', { keys });
  const { p, ctx } = ph;
  await ctx.grantPermissions(['notifications', 'geolocation'], { origin: OWN });
  await ctx.setGeolocation({ latitude: 51.507, longitude: -0.128 });
  // (the card kept away while it's set up: its once is for later)
  await p.goto(`${OWN}/version`);
  await p.evaluate(() => localStorage.setItem('ifl-moved:weather', '1'));
  await p.goto(`${OWN}/`);
  await drawn(p, { signedIn: false });
  // (as an old icon signed in would have it: My Location its only place of its own, rain alerts for it, this device's
  // subscription, and the account signed in on the browser since, not yet in step here: so its first step takes this
  // device's choices to the account, and makes it one of the account's devices)
  await p.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: new Uint8Array(65).fill(4) });
    const s = JSON.parse(localStorage.getItem('wx:settings') || '{}'), gps = JSON.parse(localStorage.getItem('wx:places') || '[]').find((x) => x.gps) || { lat: 51.507, lon: -0.128, name: 'London' };
    s.notify = { places: [{ lat: gps.lat, lon: gps.lon, name: gps.name, gps: true, rain: true, warn: false }], brief: null, briefAt: '07:00', endpoint: sub.endpoint, devId: null, syncedAt: 0 };
    localStorage.setItem('wx:settings', JSON.stringify(s)); localStorage.removeItem('wx:acct');
    localStorage.setItem('wx:places', JSON.stringify([{ ...gps, gps: true }])); localStorage.setItem('wx:cur', '0');
  });
  const asked = subAsks(p);
  await p.goto(`${OWN}/`);
  await drawn(p, { signedIn: false });
  const on = await p.waitForFunction(() => { const n = JSON.parse(localStorage.getItem('wx:settings') || '{}').notify || {}; return !!JSON.parse(localStorage.getItem('wx:acct') || 'null')?.handle && !!n.devId && !!localStorage.getItem('fakesub'); }, null, { timeout: 20000 }).then(() => true, () => false);
  const acct0 = await account(p);
  ok(on && asked.includes('/api/weather/subscribe') && (acct0.data?.notify?.places || []).some((x) => x.rain), 'signed in at its own address: rain alerts for My Location the account’s, this device one of its devices', JSON.stringify({ on, asked, kept: acct0.data?.notify?.places }));
  await p.evaluate(() => localStorage.removeItem('ifl-moved:weather'));
  asked.length = 0;
  await p.goto(`${OWN}/`);
  const card = await p.waitForSelector('.ifl-moved .ifa-off', { timeout: 15000 }).then(() => true, () => false);
  if (card) await p.click('.ifl-moved .ifa-off');
  const off = await turnedOff(p);
  const acct = await account(p);
  ok(card && off && asked.includes('/api/weather/unsubscribe') && (acct.data?.notify?.places || []).some((x) => x.rain), 'signed in, Turn Off: this device let go, the account’s choices kept for its other devices', JSON.stringify({ card, off, asked, kept: acct.data?.notify?.places }));
  asked.length = 0;
  const moved = await inLeeds(p, ctx), again = await here(p);
  ok(moved && !again.sub && again.off === true && !asked.includes('/api/weather/subscribe'), 'signed in, opened again with the phone moved to Leeds (its notifications following My Location): still off', JSON.stringify({ moved, ...again, asked }));
  // (signed in, the units are the account's: changed on its own page, or another device, and taken up here as it's next
  // opened, which tells this device's notifications the new units, were any wanted here)
  const put = await p.evaluate(async () => {
    const r = await (await fetch('/api/weather/me')).json(), data = { ...r.data, settings: { ...(r.data.settings || {}), temp: 'f' } };
    return (await fetch('/api/weather/me', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base: r.ver, data }) })).status;
  });
  await p.goto(`${OWN}/`);
  await drawn(p, { signedIn: false });
  await p.waitForFunction(() => JSON.parse(localStorage.getItem('wx:settings') || '{}').temp === 'f', null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(3000);
  const units = await here(p);
  ok(put === 200 && units.temp === 'f' && !units.sub && units.off === true && !asked.includes('/api/weather/subscribe'), 'signed in, the account’s units changed (°F) and taken up here: still off', JSON.stringify({ put, temp: units.temp, off: units.off, asked }));
  // (turned on here again by the person: the account's Notifications page's Turn On, which opens Weather with #notify,
  // and Allow Notifications tapped there. Theirs to say, so they're on here again. A fresh load, as from that page)
  await p.goto(`${OWN}/version`);
  await p.goto(`${OWN}/#notify`);
  const allow = await p.waitForSelector('.ifa-layer .ifa-go', { timeout: 15000 }).then(() => true, () => false);
  if (allow) await p.click('.ifa-layer .ifa-go');
  const back = await p.waitForFunction(() => { const n = JSON.parse(localStorage.getItem('wx:settings') || '{}').notify || {}; return !n.off && !!n.endpoint && !!localStorage.getItem('fakesub'); }, null, { timeout: 20000 }).then(() => true, () => false);
  ok(allow && back && asked.includes('/api/weather/subscribe'), 'turned on there again by the person (#notify, Allow Notifications): on here again', JSON.stringify({ allow, asked }));
  await ctx.close();
}

ok(!wx.length, 'no page error or console error on any page of Weather’s', JSON.stringify(wx.slice(0, 6)));
await (await K.hubBrowser()).close();
await K.b.close();
console.log(`FAILS ${K.fails()}`);
process.exit(0);
