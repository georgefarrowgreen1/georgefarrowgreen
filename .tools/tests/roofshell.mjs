// Today, Apps and You on InFlite's framework (One roof, spec §4, §9.4 TD; D6, D10–D16, D20–D24), end to end in real
// Chromium on the stub stack todayshell.mjs uses: the inflite repo's Worker run by wrangler dev on :8787 against the
// stand-in for the account (mocks/todaystub.mjs on :8789), both started here and stopped by PID at the end. What the
// hub would serve is stood in for in the browser: /api/hub (ready, roof, late or explicit no), Chats' pages (Chat's
// engine), the /weather/ document (the framework's page, as the Worker answers it with roof on: Today's index.html),
// Weather's connector (MAIN's weather/roof/connector.js from disk, as the hub forwards it) and, where a part says so, its
// module's files as missing. Selectors only through roofhooks.mjs (§3.14), but for Today's own page (#out, #signin,
// #youWx, the Weather Notifications sheet's own controls, which are TD's).
// Checked: the framework's header on each tab (the date as Today's crumb, Edit, your photo; Apps, You), your photo opening
// InFlite's menu with Connected Apps, the tab bar's pill and aria-current; Apps' tiles with their minis (Weather's
// temperature and rain bars from the fixture, Markets' percent, never an amount); You's Connected Apps (the words each
// app's connector fills) and each connector sheet; the Weather Notifications sheet (each place's Rain and Warnings, the
// morning briefing and its time, email: the PATCH /api/notify bodies) and /#you=notify-weather; search (Today's titles,
// People by name, Settings' rows; typing leaves nothing in storage, the address or a request); the page's sheets as
// InFlite's sheet (Morning, Every App's, Edit: modal dialogs) and a toast; Back between tabs in one document, and #morning
// then Back; signed out at /weather/#radar: the way in, Sign in back to /weather/#radar in its href and its click; the hub
// explicitly not ready: the Weather tile at Weather's own address, a /weather/ document sent there; /api/hub answering
// after 3 s at /weather/#radar: nothing leaves, Weather's screen opens; /api/hub without roof: milestone 1's links (a
// page load of the hub's Weather page); the hub ready but the module's files missing: the error state, Try Again and
// Open Weather on Its Own, then Reload; Weather's old worker at /weather/ unregistered while signed out; Today's warning
// chip at that place's Warnings; the time to Today's first card (logged, not gated); and at 320, 390, 768 and 1280, light
// and dark: no sideways scroll, axe clean, no CSP violation or console error. And (review I1–I7): a late roof off at a
// /weather/ boot bounces once and stays on inflite.ai; a kept roof off with roof on now is asked afresh; degraded, none
// of Weather's module files asked for (D13); Weather Notifications with no places (Open Weather), the solar line, Email
// the Briefing, an account from before, the focus after a PATCH; the page's sheets reopened while they shut, their close
// button the framework's cross; Edit Today from the menu on Today pushing no twin; Sign in's href after a move in the page.
// And stage 2 (s2 §9.1, §9.2 FW): /api/hub's apps with Markets on and Fitness off (Markets' stand-in module in the page,
// Fitness a page load, the map kept as ifl-roof-apps); signed out elsewhere (a confirmed 401): markets:*, fitness:*,
// wx:acct and the fitness store gone, Weather's places kept, and offline nothing gone; Today's cards asked again on its
// next show after fw.changed().
//   node .tools/tests/roofshell.mjs [state dir] [screenshots dir]      (run.sh does this)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as H from './roofhooks.mjs';

process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const HERE = new URL('./', import.meta.url).pathname;
const MAIN = new URL('../../', import.meta.url).pathname;
const IFL = process.env.IFL_ROOT || new URL('../../../inflite/', import.meta.url).pathname;
const OUT = process.argv[3] || `${tmpdir()}/roofshell`;
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:8787', STUB = 'http://127.0.0.1:8789';
let fails = 0;
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${!c && extra ? '  — ' + extra : ''}`); if (!c) fails++; };
const same = (a, b, l) => ok(JSON.stringify(a) === JSON.stringify(b), l, `got ${JSON.stringify(a)?.slice(0, 400)}, wanted ${JSON.stringify(b)?.slice(0, 400)}`);
const has = (hay, needle, l) => ok(String(hay).includes(needle), l, `“${needle}” not in “${String(hay).slice(0, 300)}”`);
if (!existsSync(`${IFL}today/public/roof/router.js`)) { console.log('SKIP  the inflite repo beside has no roof (today/public/roof/router.js)'); console.log('FAILS 0'); process.exit(0); }

const FIX = (f) => JSON.parse(readFileSync(new URL(`./mocks/today/${f}`, import.meta.url), 'utf8'));
const MIDDAY = FIX('cards.midday.json'), NOTIFY = FIX('notify.json');
const AXE = readFileSync(`${HERE}node_modules/axe-core/axe.min.js`, 'utf8');
const CONNECTOR = readFileSync(`${MAIN}weather/roof/connector.js`, 'utf8');

// ---- the stand-in account and the site's Worker ----
const stub = spawn(process.execPath, [`${HERE}mocks/todaystub.mjs`, '8789'], { stdio: ['ignore', 'ignore', 'inherit'] });
const wbin = [`${IFL}node_modules/.bin/wrangler`, `${HERE}node_modules/.bin/wrangler`].find((f) => existsSync(f));
let wlog = '';
const wr = spawn(wbin, ['dev', '--port', '8787', '--var', 'ACCOUNT_ORIGIN:http://127.0.0.1:8789'], { cwd: IFL, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
wr.stdout.on('data', (d) => (wlog += d)); wr.stderr.on('data', (d) => (wlog += d));
let stopped = false;
const stop = () => { if (stopped) return; stopped = true; try { process.kill(-wr.pid, 'SIGTERM'); } catch {} try { stub.kill(); } catch {} };
process.on('exit', stop);
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { stop(); process.exit(1); });
const up = async (u) => { for (let i = 0; i < 90; i++) { try { if ((await fetch(u)).ok) return true; } catch {} await new Promise((r) => setTimeout(r, 1000)); } return false; };
if (!(await up(`${STUB}/__log`)) || !(await up(`${BASE}/version`))) { console.log(wlog.slice(-2000)); ok(false, 'the stub and the site’s Worker start'); console.log(`FAILS ${fails}`); stop(); process.exit(1); }
// (the framework's page, as the Worker serves it for /weather/ with roof on: Today's own index.html)
const PAGE = await (await fetch(`${BASE}/`)).text();

const ctl = (path, body) => fetch(STUB + path, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }).then((r) => r.json());
const mode = (m) => ctl('/mode', m);
const reset = () => ctl('/__reset', {});
const sent = async (method, route) => (await ctl('/__log')).filter((e) => e.method === method && e.path === `/api/account/today/${route}`).map((e) => (e.body ? JSON.parse(e.body) : null));

// ---- the browser ----
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined) });
const errs = [];
const ENGINE = `<!doctype html><html><head><meta charset="utf-8"><title>Chats</title></head><body><script>
  window.IFLChat = { state: "ready", share: async () => true, sendTo: async () => ({ ok: true }), waiting: async () => [], since: async () => null, refresh: async () => {}, signOut: async () => {} };
  parent.dispatchEvent(new Event("ifl-chat-ready"));
</script></body></html>`;
// open({ hub: { ready, roof } | "late" | { late: ms, json } | null (as the Worker says), module: "connector" | "missing", … })
// fakes: apps whose module and connector are the kit's stand-ins (roofkit/fake-module.js, fake-connector.js), their CSS
// empty and their /<app>/version 9.99, and whose document (/<app>/) is the framework's page (stage 2 FW)
const FAKE_MOD = readFileSync(`${HERE}roofkit/fake-module.js`, 'utf8'), FAKE_CONN = readFileSync(`${HERE}roofkit/fake-connector.js`, 'utf8');
async function open({ w = 390, h = 844, scheme = 'dark', hub = { ready: true, roof: true }, signedIn = true, path = '/', wait = true, module = 'connector', weatherPage = null, warning = null, setup = null, expect = null, fakes = [] } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, locale: 'en-GB', timezoneId: 'Europe/London', serviceWorkers: 'allow' });
  if (signedIn) await ctx.addCookies([{ name: 'account', value: 'stubsession0123456789abcdefABCDEF', url: BASE }]);
  await ctx.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`)));
  const hubAsked = [];
  if (hub) await ctx.route((u) => new URL(u).pathname === '/api/hub', async (r) => {
    hubAsked.push(Date.now());
    const late = hub === 'late' ? 3000 : hub.late || 0, j = hub === 'late' ? { ready: true, roof: true } : hub.late ? hub.json : hub;
    if (late) await new Promise((go) => setTimeout(go, late));
    await r.fulfill({ json: j, headers: { 'Cache-Control': 'no-store' } }).catch(() => {});
  });
  await ctx.route((u) => new URL(u).pathname.startsWith('/chats/'), (r) => {
    const u = new URL(r.request().url());
    return r.fulfill({ contentType: 'text/html', body: u.searchParams.has('engine') ? ENGINE : '<!doctype html><title>Chats</title><style>@view-transition { navigation: auto; }</style><p>CHATS</p>' });
  });
  // (the /weather/ document: the framework's page, as the Worker answers it with roof on; or another page, where asked)
  await ctx.route((u) => /^\/weather\/(index\.html)?$/.test(new URL(u).pathname), (r) => r.fulfill({ contentType: 'text/html', body: weatherPage || PAGE, headers: { 'Cache-Control': 'no-cache' } }));
  await ctx.route((u) => new URL(u).pathname.startsWith('/weather/roof/'), (r) => {
    const p = new URL(r.request().url()).pathname;
    if (module === 'connector' && p === '/weather/roof/connector.js') return r.fulfill({ contentType: 'text/javascript', body: CONNECTOR });
    return r.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' });
  });
  // (Weather's own files, as the hub forwards them: from this repo, unminified)
  await ctx.route((u) => { const p = new URL(u).pathname; return /^\/weather\/[\w-]+\.(js|css)$/.test(p) && existsSync(`${MAIN}weather/${p.slice(9)}`); }, (r) => {
    const p = new URL(r.request().url()).pathname;
    return r.fulfill({ contentType: p.endsWith('.css') ? 'text/css' : 'text/javascript', body: readFileSync(`${MAIN}weather/${p.slice(9)}`, 'utf8') });
  });
  await ctx.route((u) => /^(weather|chat|fitness|finance)\./.test(new URL(u).hostname), (r) => r.fulfill({ contentType: 'text/html', body: `<!doctype html><title>Own</title><p>OWN ${new URL(r.request().url()).hostname}</p>` }));
  if (warning) await ctx.route((u) => new URL(u).pathname === '/api/today', async (r) => {
    // (with the answer's links to the apps put on this site's, weather.localhost:8787, as weather.inflite.ai is live: the
    // hub takes an app's own address to its path only on its own site)
    try { const res = await r.fetch(), a = JSON.parse((await res.text()).replace(/https:\/\/(chat|weather|fitness|finance)\.inflite\.ai/g, 'http://$1.localhost:8787')); if (a?.cards?.weather) a.cards.weather.warning = warning; await r.fulfill({ response: res, json: a }); } catch {}
  });
  for (const app of fakes) {
    await ctx.route((u) => new URL(u).pathname.startsWith(`/${app}/roof/`) || new URL(u).pathname === `/${app}/version`, (r) => {
      const q = new URL(r.request().url()).pathname;
      if (q === `/${app}/version`) return r.fulfill({ json: { build: '9.99' }, headers: { 'Cache-Control': 'no-store' } });
      if (q === `/${app}/roof/connector.js`) return r.fulfill({ contentType: 'text/javascript', body: FAKE_CONN });
      if (/\.css$/.test(q)) return r.fulfill({ contentType: 'text/css', body: '/* a stand-in */' });
      if (/^\/\w+\/roof\/\w+\.js$/.test(q) && q === `/${app}/roof/${app}.js`) return r.fulfill({ contentType: 'text/javascript', body: FAKE_MOD });
      return r.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' });
    });
    if (app !== 'weather') await ctx.route((u) => new URL(u).pathname === `/${app}/` || new URL(u).pathname === `/${app}/index.html`, (r) => r.fulfill({ contentType: 'text/html', body: PAGE, headers: { 'Cache-Control': 'no-cache' } }));
  }
  await setup?.(ctx);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  p.on('response', (r) => { if (r.status() >= 500) errs.push(`${r.status()} from ${new URL(r.url()).pathname}`); });
  // (the module's files missing, as a part asks: the frame's own word of it is expected, nothing else)
  const expected = (t) => (module === 'missing' && /Failed to fetch dynamically imported module: \S+\/weather\/roof\/weather\.js/.test(t)) || !!expect?.test(t);
  p.on('console', (m) => { if (m.type() === 'error' && !expected(m.text()) && !/Failed to load resource: (the server responded with a status of (40[14]|501|502)|net::ERR_INTERNET_DISCONNECTED)/.test(m.text())) errs.push(m.text()); });
  await p.clock.setFixedTime(new Date(MIDDAY.at));
  // (documents loaded in the tab: a pushState or a hash is never one)
  let loads = 0;
  p.on('load', () => { loads++; });
  const t0 = Date.now();
  await p.goto(BASE + path);
  if (wait) await (signedIn ? p.waitForSelector(`#in:not([hidden]) ${H.TAB}`) : p.waitForSelector('#out:not([hidden]) #signin'));
  return { ctx, p, t0, hubAsked, loads: () => loads };
}
const text = (p, s) => p.$eval(s, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');
const shown = (p) => p.evaluate(() => ['today', 'apps', 'you'].filter((k) => !document.getElementById(k).hidden));
const ONLY = process.env.ONLY?.split(',');
async function part(name, fn) { if (ONLY && !ONLY.some((o) => name.includes(o))) return; try { await fn(); } catch (e) { ok(false, name, e.stack?.split('\n').slice(0, 3).join(' | ')); } }

// ======================================================================= the framework on Today: header, menu, tabs
await part('header and tabs', async () => {
  await mode({ phase: 'midday' }); await reset();
  const { ctx, p, t0, loads } = await open({ wait: false });
  await p.waitForSelector(`${H.TODAY} .tcard, ${H.TODAY} .day-top`, { timeout: 15000 });
  console.log(`NOTE  time to Today’s first card, with the frame: ${Date.now() - t0} ms (todayshell logs its own; not gated)`);
  await p.waitForSelector(`${H.TODAY}[data-phase="midday"]`, { timeout: 10000 });
  same(await p.evaluate(() => [document.documentElement.dataset.app, document.documentElement.dataset.route]), ['inflite', '/'], 'html[data-app=inflite], html[data-route=/]');
  same(await text(p, H.HD_TITLE), 'Today', 'the header: Today');
  same(await text(p, H.HD_CRUMB), 'Monday 2 November', 'its crumb: the date');
  same(await text(p, H.HD_LINE), '12:30 · what’s next', 'its line: the phase’s (day.js)');
  ok(await p.$(H.HD_EDIT), 'Edit, an act of Today’s');
  ok(await p.$(H.HD_SEARCH), 'Search, always');
  ok(await p.isVisible(H.HD_ME) && !(await p.isVisible(H.HD_BACK)), 'your photo leads, no Back on a tab screen');
  same(await p.$eval('nav#tabs', (n) => n.classList.contains('has-pill')), true, 'the tab bar has its sliding pill');
  same(await p.$$eval(H.TAB, (as) => as.map((a) => [a.dataset.tab, a.getAttribute('aria-current')])), [['today', 'page'], ['chats', null], ['apps', null], ['you', null]], 'Today current (aria-current="page")');
  await p.evaluate(() => { window.__same = 1; });
  await p.click(H.tab('apps'));
  await p.waitForSelector(`${H.APPS}:not([hidden]) ${H.APP_TILE}`);
  same(await text(p, H.HD_TITLE), 'Apps', 'Apps: its title');
  ok(!(await p.$(H.HD_EDIT)), 'no Edit on Apps');
  same(new URL(p.url()).hash, '#apps', 'at /#apps');
  await p.click(H.tab('you'));
  await p.waitForSelector('#youRules .rule');
  same(await text(p, H.HD_TITLE), 'You', 'You: its title');
  same(await p.$$eval(H.TAB, (as) => as.map((a) => a.getAttribute('aria-current'))), [null, null, null, 'page'], 'You current');
  await p.goBack();
  await p.waitForFunction(() => !document.getElementById('apps').hidden);
  await p.goBack();
  await p.waitForFunction(() => !document.getElementById('today').hidden);
  same(await shown(p), ['today'], 'Back, Back: Apps, then Today');
  ok(await p.evaluate(() => window.__same === 1) && loads() === 1, 'all in one document');
  // (your photo: InFlite's menu, with Connected Apps → /#you=apps)
  await p.click(H.HD_ME);
  await p.waitForSelector('.ifm-pop.open');
  has(await text(p, '.ifm-pop'), 'Connected Apps', 'your photo: InFlite’s menu, with Connected Apps');
  await p.click('.ifm-pop [data-k=apps]');
  await p.waitForSelector(`${H.YOU}:not([hidden]) ${H.YOU_APP_ROW}`, { timeout: 10000 });
  same(new URL(p.url()).hash, '#you=apps', 'Connected Apps: /#you=apps');
  ok(await p.waitForFunction((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return r.top < innerHeight * 0.6 && r.bottom > 0 && scrollY > 0; }, H.YOU_APPS, { timeout: 4000 }).then(() => true, () => false), 'scrolled to Connected Apps');
  await p.screenshot({ path: `${OUT}/you-apps-390-dark.png` });
  // (#morning, then Back: the sheet opened and the address tidied; Back shuts it, still in the page)
  await p.click(H.tab('today'));
  await p.waitForFunction(() => !document.getElementById('today').hidden);
  await p.evaluate(() => { location.hash = 'morning'; });
  await p.waitForSelector('dialog#morning[open]', { timeout: 5000 });
  same(new URL(p.url()).pathname + new URL(p.url()).hash, '/', '#morning: the address tidied to /');
  await p.goBack();
  await p.waitForFunction(() => !document.querySelector('dialog#morning[open]'), null, { timeout: 5000 });
  ok(await p.evaluate(() => window.__same === 1), '#morning then Back: the sheet shut, still the same document');
  await ctx.close();
});

// ======================================================================= Apps: tiles with minis
await part('apps minis', async () => {
  await mode({ phase: 'midday' });
  const { ctx, p } = await open({ path: '/#apps' });
  await p.waitForSelector(`${H.appTile('weather')} .ifl-mini`, { timeout: 10000 });
  const wx = await p.$eval(`${H.appTile('weather')} .ifl-mini`, (m) => ({ text: m.textContent, bars: m.querySelectorAll('.bars i').length }));
  has(wx.text, MIDDAY.cards.weather.now.temp, 'Weather’s mini: its temperature, from the fixture');
  same(wx.bars, 5, 'and five bars of the next hours’ rain');
  has(wx.text, 'Rain from 15:00', 'and when the rain comes');
  await p.waitForSelector(`${H.appTile('markets')} .ifl-mini`, { timeout: 5000 });
  const mk = await text(p, `${H.appTile('markets')} .ifl-mini`);
  has(mk, '+0.2%', 'Markets’ mini: its percent');
  ok(!/[£$€]/.test(await text(p, H.APPS)), 'no amount anywhere on Apps');
  same(await p.$$eval(H.APP_TILE, (ts) => ts.map((t) => t.dataset.app)), ['weather', 'fitness', 'markets'], 'Weather, Fitness, Markets (Mail for its account only)');
  await p.screenshot({ path: `${OUT}/apps-390-dark.png` });
  await ctx.close();
});

// ======================================================================= You: Connected Apps and each connector sheet
const WORDS = { weather: 'Cards · Search · Notifications · Actions · Screens', chats: 'Cards · Notifications · Screens', fitness: 'Cards · Notifications · Actions · Screens', markets: 'Cards · Notifications · Screens', mail: 'Notifications · Screens' };
await part('connected apps', async () => {
  await mode({ phase: 'midday', admin: true });
  const { ctx, p } = await open({ path: '/#you' });
  await p.waitForFunction(() => /Cards/.test(document.querySelector('#youApps [data-app="weather"] small')?.textContent || ''), null, { timeout: 10000 });
  const rows = await p.$$eval(H.YOU_APP_ROW, (rs) => rs.map((r) => [r.dataset.app, r.querySelector('b').textContent, r.querySelector('small').textContent]));
  same(rows, [['weather', 'Weather', WORDS.weather], ['chats', 'Chats', WORDS.chats], ['fitness', 'Fitness', WORDS.fitness], ['markets', 'Markets', WORDS.markets], ['mail', 'Mail', WORDS.mail]], 'Connected Apps: each app, and only the words its connector fills (Mail for its account)');
  ok(await p.$$eval(H.YOU_APP_ROW, (rs) => rs.every((r) => r.getBoundingClientRect().height >= 44)), 'each row at least 44 points');
  for (const app of ['weather', 'chats', 'fitness', 'markets', 'mail']) {
    await p.click(H.youAppRow(app));
    await p.waitForSelector(`${H.CONNECTOR_SHEET}[open]`, { timeout: 5000 });
    const t = await text(p, `${H.CONNECTOR_SHEET}[open]`);
    has(t, 'keeps its own server and data', `${app}: its connector’s sheet`);
    if (app === 'weather') { has(t, 'Weather Settings', 'Weather’s: Weather Settings'); has(t, 'Weather Notifications', 'and Weather Notifications'); }
    if (app === 'weather') await p.screenshot({ path: `${OUT}/connector-weather-390-dark.png` });
    await p.click(`${H.CONNECTOR_SHEET}[open] [data-close]`);
    await p.waitForFunction((s) => !document.querySelector(s), `${H.CONNECTOR_SHEET}[open]`);
  }
  await ctx.close();
});

// ======================================================================= the Weather Notifications sheet
await part('weather notifications', async () => {
  await mode({ phase: 'midday' }); await reset();
  let { ctx, p } = await open({ path: '/#you' });
  await p.waitForSelector('#youWx');
  has(await text(p, '#youWx'), 'Rain and warnings for the places you choose', 'You’s Weather row: its words');
  await p.click('#youWx');
  await p.waitForSelector(`${H.SH_WXNOTIFY}[open] [data-wxn]`, { timeout: 5000 });
  same(await p.evaluate(() => document.querySelector('dialog#sh-wxnotify').matches(':modal')), true, 'a modal dialog: InFlite’s sheet');
  same(await p.$$eval(`${H.SH_WXNOTIFY} [data-wxn]`, (bs) => bs.map((x) => [x.textContent, x.getAttribute('aria-pressed')])), [['Rain', 'true'], ['Warnings', 'true']], 'London: Rain and Warnings, both on');
  await p.click(`${H.SH_WXNOTIFY} [data-wxn="rain"]`);
  await p.waitForFunction(() => document.querySelector('#sh-wxnotify [data-wxn="rain"]')?.getAttribute('aria-pressed') === 'false' && !document.querySelector('#sh-wxnotify [data-wxn="rain"]').disabled);
  same((await sent('PATCH', 'notify')).at(-1), { weather: { place: { lat: 51.5072, lon: -0.1276, name: 'London', rain: false, warn: true } } }, 'Rain off: PATCH { weather: { place: { lat, lon, name, rain, warn } } }');
  same(await p.evaluate(() => !!document.activeElement?.matches('#sh-wxnotify [data-wxn="rain"][data-i="0"]')), true, 'the focus kept on Rain, drawn again after the PATCH');
  await p.selectOption('#wxnBrief', '0');
  await p.waitForSelector('#wxnAt', { timeout: 5000 });
  same((await sent('PATCH', 'notify')).at(-1), { weather: { brief: { lat: 51.5072, lon: -0.1276, name: 'London' }, briefAt: NOTIFY.weather.briefAt } }, 'Morning Briefing for London: PATCH { weather: { brief, briefAt } }');
  await p.selectOption('#wxnAt', '06:30');
  await p.waitForTimeout(500);
  same((await sent('PATCH', 'notify')).at(-1), { weather: { brief: { lat: 51.5072, lon: -0.1276, name: 'London' }, briefAt: '06:30' } }, 'its time: PATCH { weather: { brief, briefAt: "06:30" } }');
  await p.click('#wxnMailWarn');
  await p.waitForTimeout(500);
  same((await sent('PATCH', 'notify')).at(-1), { weather: { email: { warn: true, brief: false } } }, 'Email Warnings: PATCH { weather: { email: { warn, brief } } }');
  has(await text(p, `${H.SH_WXNOTIFY} [data-wxn-place]`), 'London', 'its place by name');
  has(await text(p, H.SH_WXNOTIFY), 'Email the Briefing', 'Email the Briefing, where the account can email');
  await p.click('#wxnMailBrief');
  await p.waitForTimeout(500);
  same((await sent('PATCH', 'notify')).at(-1), { weather: { email: { warn: true, brief: true } } }, 'Email the Briefing: PATCH { weather: { email: { warn, brief: true } } }');
  ok(!(await p.$(`${H.SH_WXNOTIFY} .wxn-solar`)), 'no solar line where no solar alert’s set');
  await p.screenshot({ path: `${OUT}/wxnotify-390-dark.png` });
  await p.keyboard.press('Escape');
  await p.waitForFunction((s) => !document.querySelector(s), `${H.SH_WXNOTIFY}[open]`);
  await ctx.close();
  // (/#you=notify-weather: You, with the sheet open)
  ({ ctx, p } = await open({ path: '/#you=notify-weather', scheme: 'light' }));
  await p.waitForSelector(`${H.SH_WXNOTIFY}[open] [data-wxn]`, { timeout: 10000 });
  same(await shown(p), ['you'], '/#you=notify-weather: You, with Weather Notifications open');
  await p.screenshot({ path: `${OUT}/wxnotify-390-light.png` });
  await ctx.close();
  // (no places yet, a solar alert set: what to do, Weather a tap away, and where the solar alert lives)
  const notifyAs = (edit) => (c) => c.route((u) => new URL(u).pathname === '/api/notify', async (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    if (edit === 404) return r.fulfill({ status: 404, json: { error: 'Not found.' } });
    const res = await r.fetch(), j = await res.json();
    edit(j);
    return r.fulfill({ response: res, json: j });
  });
  ({ ctx, p } = await open({ path: '/#you=notify-weather', setup: notifyAs((j) => { j.weather.places = []; j.weather.solar = { alert: true, zones: 1 }; }) }));
  await p.waitForSelector(`${H.SH_WXNOTIFY}[open] .wxn-none`, { timeout: 10000 });
  has(await text(p, `${H.SH_WXNOTIFY} .wxn-none`), 'Add a place in Weather to choose its rain alerts', 'no places: what to do');
  same(await p.$eval(`${H.SH_WXNOTIFY} [data-wxn-open]`, (a) => [a.textContent, a.getAttribute('href')]), ['Open Weather', '/weather/'], 'and Open Weather, at the hub’s /weather/');
  ok(!(await p.$(`${H.SH_WXNOTIFY} [data-wxn]`)) && !(await p.$('#wxnBrief')) && !(await p.$('#wxnMailWarn')), 'no chips, no briefing, no email without a place');
  has(await text(p, `${H.SH_WXNOTIFY} .wxn-solar`), 'Sunshine for your panels: in Weather Settings, Solar', 'the solar alert: where it lives');
  await ctx.close();
  // (an account side from before Weather's notifications were the account's: said so, nothing to change)
  ({ ctx, p } = await open({ path: '/#you=notify-weather', setup: notifyAs(404) }));
  await p.waitForFunction(() => /set in Weather on this account/.test(document.querySelector('dialog#sh-wxnotify[open]')?.textContent || ''), null, { timeout: 10000 });
  ok(!(await p.$(`${H.SH_WXNOTIFY} [data-wxn]`)), 'an account from before: “Weather’s notifications are set in Weather on this account”, no controls');
  await ctx.close();
});

// ======================================================================= search: Today's and Settings' providers
await part('search', async () => {
  await mode({ phase: 'midday' });
  const { ctx, p } = await open();
  await p.waitForSelector(`${H.TODAY}[data-phase="midday"]`, { timeout: 10000 });
  const asked = [];
  p.on('request', (r) => asked.push(`${r.url()} ${r.postData() || ''}`));
  const snap = () => p.evaluate(() => JSON.stringify([location.href, history.state, Object.entries(localStorage).sort(), Object.entries(sessionStorage).sort()]));
  const before = await snap();
  await p.click(H.HD_SEARCH);
  await p.waitForSelector(H.SEARCH_INPUT);
  ok(await p.evaluate((s) => document.activeElement === document.querySelector(s), H.SEARCH_INPUT), 'Search: its field focused at once');
  const find = async (q) => { await p.fill(H.SEARCH_INPUT, q); await p.waitForTimeout(500); return p.$$eval(H.SEARCH_RESULT, (rs) => rs.map((r) => r.textContent.replace(/\s+/g, ' ').trim())); };
  const pat = await find('Pat');
  ok(pat.some((r) => r.includes('Pat')), 'People waiting, by name: Pat', JSON.stringify(pat));
  const rain = await find('rain reaches');
  ok(rain.some((r) => r.includes(MIDDAY.upcoming[0].title)), `Today’s Coming Up by its title: “${MIDDAY.upcoming[0].title}”`, JSON.stringify(rain));
  const quiet = await find('quiet hours');
  ok(quiet.some((r) => r.includes('Quiet Hours')), 'Settings: Quiet Hours', JSON.stringify(quiet));
  const wxn = await find('weather notif');
  ok(wxn.some((r) => r.includes('Weather Notifications')), 'Settings: Weather Notifications', JSON.stringify(wxn));
  await find('qwzxv');
  has(await text(p, H.SEARCH_SHEET), 'qwzxv', 'nothing found: said so');
  ok(!asked.some((x) => /qwzxv|quiet%20hours|rain%20reaches|weather%20notif/i.test(x) || /qwzxv|quiet hours|rain reaches/i.test(x)), 'no request carries what was typed');
  same(await snap(), before, 'typing leaves nothing in storage, history or the address');
  await p.keyboard.press('Escape');
  await ctx.close();
});

// ======================================================================= the page's own sheets and a toast
await part('sheets and toasts', async () => {
  await mode({ phase: 'midday' }); await reset();
  const { ctx, p } = await open({ path: '/#you' });
  await p.waitForSelector('#youRules .rule');
  await p.click(H.tab('today'));
  await p.waitForFunction(() => !document.getElementById('today').hidden);
  await p.click(H.HD_EDIT);
  await p.waitForSelector('dialog#sh-edit[open]');
  same(await p.evaluate(() => [document.querySelector('dialog#sh-edit').matches(':modal'), document.body.classList.contains('sheet-up')]), [true, true], 'Edit: a modal dialog, body.sheet-up');
  ok(await p.$('dialog#sh-edit .ifs-btn[data-close] svg'), 'its close button: the framework’s cross (an svg), as every sheet it builds');
  await p.click('#edReset');
  await p.waitForSelector(`${H.TOAST}.on`, { timeout: 5000 });
  has(await text(p, H.TOAST), 'Back in the day’s order', 'a toast: the framework’s');
  await p.keyboard.press('Escape');
  await p.waitForFunction(() => !document.querySelector('dialog#sh-edit[open]'));
  ok(true, 'Escape shuts it');
  // (Edit again within its close (340 ms): opens afresh, not the closing one)
  await p.click(H.HD_EDIT);
  await p.waitForSelector('dialog#sh-edit[open]');
  await p.waitForTimeout(400);
  await p.evaluate((s) => { document.querySelector('dialog#sh-edit [data-close]').click(); setTimeout(() => document.querySelector(s).click(), 100); }, H.HD_EDIT);
  await p.waitForTimeout(900);
  ok(await p.$('dialog#sh-edit[open]:not(.closing)'), 'Edit tapped again while it shuts: open, not shut with the closing one');
  await p.keyboard.press('Escape');
  await p.waitForFunction(() => !document.querySelector('dialog#sh-edit[open]'));
  // (Edit Today from the menu, on Today: the sheet, no second entry of Today, so Back goes to You)
  await p.click(H.HD_ME); await p.waitForSelector('.ifm-pop.open');
  await p.click('.ifm-pop [data-k=edit]');
  await p.waitForSelector('dialog#sh-edit[open]');
  ok(true, 'Edit Today from the menu: the sheet');
  await p.keyboard.press('Escape');
  await p.waitForFunction(() => !document.querySelector('dialog#sh-edit[open]'));
  await p.goBack();
  await p.waitForFunction(() => !document.getElementById('you').hidden, null, { timeout: 5000 }).catch(() => {});
  same(await shown(p), ['you'], 'then Back: You, the entry before Today (no twin of Today)');
  await p.click(H.tab('today'));
  await p.waitForFunction(() => !document.getElementById('today').hidden);
  await p.click(H.HD_ME); await p.waitForSelector('.ifm-pop.open');
  await p.click('.ifm-pop [data-k=morning]');
  await p.waitForSelector('dialog#morning[open]');
  ok(await p.evaluate(() => document.querySelector('dialog#morning').matches(':modal')), 'Morning: a modal dialog');
  await p.waitForTimeout(400);
  await p.evaluate(() => { location.hash = 'morning'; });
  await p.waitForTimeout(900);
  ok(await p.$('dialog#morning[open]:not(.closing)'), '#morning while Morning’s open: still open');
  await p.click('dialog#morning[open] [data-close]');
  await p.waitForFunction(() => !document.querySelector('dialog#morning[open]'));
  await p.click(H.tab('you'));
  await p.waitForSelector('#youEvery');
  await p.click('#youEvery');
  await p.waitForSelector('dialog#sh-every[open]');
  ok(await p.evaluate(() => document.querySelector('dialog#sh-every').matches(':modal')), 'Every App’s: a modal dialog');
  await p.click('dialog#sh-every[open] [data-close]');
  await ctx.close();
});

// ======================================================================= the warning chip
await part('warning chip', async () => {
  await mode({ phase: 'midday' });
  const { ctx, p } = await open({ warning: { colour: 'amber', chip: 'Amber wind', issuer: 'Met Office' } });
  await p.waitForSelector(H.TODAY_WX_WARN, { timeout: 10000 });
  same(await p.$eval(H.TODAY_WX_WARN, (a) => a.getAttribute('href')), '/weather/?lat=51.5072&lon=-0.1276&name=London#warnings', 'the warning chip: that place’s Warnings');
  same(await p.$eval(H.TODAY_WX_OPEN, (a) => a.getAttribute('href')), '/weather/?lat=51.5072&lon=-0.1276&name=London', 'the head: that place’s Now');
  await ctx.close();
});

// ======================================================================= signed out at /weather/#radar
await part('signed out at a weather address', async () => {
  await mode({ mode: 'out' });
  const { ctx, p } = await open({ signedIn: false, path: '/weather/#radar' });
  const THEN = `/chats/#signin-start&then=${encodeURIComponent('/weather/#radar')}`;
  same(await p.$eval('#signin', (a) => a.getAttribute('href')), THEN, 'the way in: Sign in back to /weather/#radar (its href)');
  await p.click('#signin');
  await p.waitForURL(/\/chats\//);
  same(new URL(p.url()).pathname + new URL(p.url()).hash, THEN, 'and its click');
  await ctx.close();
});

// ======================================================================= Weather's old worker, unregistered while signed out
await part('old weather worker', async () => {
  await mode({ mode: 'out' });
  const { ctx, p } = await open({ signedIn: false, setup: (c) => c.route((u) => new URL(u).pathname === '/weather/sw.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'self.addEventListener("install", () => self.skipWaiting());' })) });
  await p.evaluate(async () => { const r = await navigator.serviceWorker.register('/weather/sw.js', { scope: '/weather/' }); await new Promise((ok) => { const w = r.installing || r.waiting || r.active; if (w.state === 'activated') return ok(); w.addEventListener('statechange', () => w.state === 'activated' && ok()); }); });
  same(await p.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((r) => new URL(r.scope).pathname).includes('/weather/')), true, 'a worker at /weather/, as milestone 1 left one');
  await p.evaluate(() => sessionStorage.clear());
  await p.reload();
  await p.waitForSelector('#out:not([hidden]) #signin');
  await p.waitForFunction(async () => !(await navigator.serviceWorker.getRegistrations()).some((r) => new URL(r.scope).pathname === '/weather/'), null, { timeout: 5000, polling: 200 }).catch(() => {});
  same(await p.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((r) => new URL(r.scope).pathname).includes('/weather/')), false, 'roof on, signed out: Weather’s old worker unregistered (D10)');
  await ctx.close();
});

// ======================================================================= the hub explicitly not ready: degraded
await part('degraded', async () => {
  await mode({ phase: 'midday' });
  const wxAsked = [];
  let { ctx, p } = await open({ hub: { ready: false, roof: true }, path: '/#apps', setup: (c) => c.on('request', (r) => { if (/^\/weather\/(roof\/)?[\w-]+\.(js|css)$/.test(new URL(r.url()).pathname)) wxAsked.push(new URL(r.url()).pathname); }) });
  await p.waitForSelector(`${H.APPS}:not([hidden]) ${H.APP_TILE}`);
  await p.click(H.tab('you'));
  await p.waitForSelector('#youRules .rule');
  await p.click(H.tab('apps'));
  await p.waitForSelector(`${H.APPS}:not([hidden]) ${H.APP_TILE}`);
  await p.waitForTimeout(1500);
  same(wxAsked, [], 'degraded: none of Weather’s module files (/weather/roof/*, its scripts or styles) ever asked for (D13)');
  const tileHref = await p.$eval(H.appTile('weather'), (t) => (t.matches('a') ? t : t.querySelector('a[href]')).getAttribute('href'));
  same(tileHref, 'https://weather.inflite.ai/', 'not ready: the Weather tile at Weather’s own address');
  await ctx.close();
  ({ ctx, p } = await open({ hub: { ready: false }, path: '/weather/?lat=51.5&lon=-0.12&name=London#warnings', wait: false }));
  await p.waitForURL(/^https:\/\/weather\.inflite\.ai\//, { timeout: 10000 });
  same(p.url(), 'https://weather.inflite.ai/?lat=51.5&lon=-0.12&name=London#warnings', 'a /weather/ document with the hub explicitly not ready: replaced by Weather’s own address, same path, query and hash');
  await ctx.close();
});

// ======================================================================= /api/hub late at /weather/#radar
await part('slow hub', async () => {
  await mode({ phase: 'midday' });
  const { ctx, p, loads } = await open({ hub: 'late', path: '/weather/#radar', wait: false, module: 'missing' });
  await p.waitForSelector(`${H.M_WEATHER}:not([hidden])`, { timeout: 15000 });
  await p.waitForTimeout(3500);
  same(new URL(p.url()).origin, BASE, '/api/hub answering after 3 s at /weather/#radar: nothing left inflite.ai');
  same(loads(), 1, 'no navigation away');
  same(await p.evaluate(() => document.documentElement.dataset.app), 'weather', 'Weather’s screen opened (unknown counts as ready, roof on, D23)');
  await ctx.close();
  // (a late { ready: true, roof: false } at a /weather/ deep link: the D14 bounce, once, to its path and hash, where the
  // hub, roof off, sends milestone 1's Weather page; nothing leaves inflite.ai. With a query, as the frame's bounce is a
  // replace to path and hash, which at an address with none would only move to its hash: reported to FW)
  const M1 = '<!doctype html><title>Weather</title><style>@view-transition { navigation: auto; }</style><p>MILESTONE 1 WEATHER</p>';
  let docs = 0;
  // (the frame's own word that the module's load was refused as roof went off under it: expected, nothing else)
  const late = await open({ hub: { late: 2500, json: { ready: true, roof: false } }, path: '/weather/?lat=51.5&lon=-0.12&name=London#radar', wait: false, module: 'missing', expect: /^Error: (the hub or the roof is off|weather isn't a module here)/,
    setup: (c) => c.route((u) => /^\/weather\/(index\.html)?$/.test(new URL(u).pathname), (r) => r.fulfill({ contentType: 'text/html', body: docs++ ? M1 : PAGE, headers: { 'Cache-Control': 'no-cache' } })) });
  await late.p.waitForSelector('text=MILESTONE 1 WEATHER', { timeout: 15000 });
  same([new URL(late.p.url()).origin, new URL(late.p.url()).pathname, new URL(late.p.url()).hash], [BASE, '/weather/', '#radar'], 'a late roof off at a /weather/ deep link: its path and hash again, still inflite.ai');
  same(await late.p.evaluate(() => [sessionStorage.getItem('ifl-roof-bounce'), sessionStorage.getItem('ifl-roof')]), ['1', '0'], 'the bounce marker set once, roof kept off');
  same(late.loads(), 2, 'one bounce: two documents');
  await late.ctx.close();
  // (a roof kept off from before (rolled back, then on again) while the Worker serves the framework at /weather/#radar,
  // and /api/hub says roof's on: asked afresh, Weather's screen, nothing leaves)
  const kept = await open({ hub: { ready: true, roof: true }, path: '/weather/#radar', wait: false, module: 'missing',
    setup: (c) => c.addInitScript(() => { try { if (location.pathname.startsWith('/weather/') && !sessionStorage.getItem('t-kept')) { sessionStorage.setItem('t-kept', '1'); sessionStorage.setItem('ifl-hub-ready', '1'); sessionStorage.setItem('ifl-roof', '0'); } } catch {} }) });
  await kept.p.waitForSelector(`${H.M_WEATHER}:not([hidden])`, { timeout: 15000 });
  await kept.p.waitForTimeout(1500);
  same([new URL(kept.p.url()).origin, new URL(kept.p.url()).pathname], [BASE, '/weather/'], 'a kept roof off, roof on now: still at /weather/ on inflite.ai');
  same(kept.loads(), 1, 'no bounce, no navigation away');
  same(await kept.p.evaluate(() => [document.documentElement.dataset.app, sessionStorage.getItem('ifl-roof'), sessionStorage.getItem('ifl-roof-bounce')]), ['weather', '1', null], 'Weather’s screen, roof kept on now, no bounce marker');
  ok(kept.hubAsked.length >= 1, '/api/hub asked afresh, not the kept roof off trusted');
  await kept.ctx.close();
});

// ======================================================================= signed out after a move in the page
await part('signed out after a move', async () => {
  await mode({ phase: 'midday' });
  const { ctx, p } = await open({ path: '/#apps', module: 'missing' });
  await p.waitForSelector(`${H.APPS}:not([hidden]) ${H.APP_TILE}`);
  same(await p.$eval('#signin', (a) => a.getAttribute('href')), `/chats/#signin-start&then=${encodeURIComponent('/#apps')}`, 'at boot: Sign in back to /#apps');
  await p.locator(H.appTile('weather')).locator('a[href="/weather/"]').first().click();
  await p.waitForSelector(`${H.M_WEATHER}:not([hidden])`, { timeout: 15000 });
  await mode({ mode: 'out' });
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await p.waitForSelector('#out:not([hidden]) #signin', { timeout: 10000 });
  const at = await p.evaluate(() => location.pathname + location.hash);
  same(await p.$eval('#signin', (a) => a.getAttribute('href')), `/chats/#signin-start&then=${encodeURIComponent(at)}`, `the session lost at ${at}: Sign in’s href back to there, not the boot’s /#apps`);
  ok(at.startsWith('/weather/'), 'still at Weather’s address', at);
  await ctx.close();
});

// ======================================================================= /api/hub without roof: milestone 1's links
await part('no roof', async () => {
  await mode({ phase: 'midday' });
  const { ctx, p, loads } = await open({ hub: { ready: true }, path: '/#apps', weatherPage: '<!doctype html><title>Weather</title><style>@view-transition { navigation: auto; }</style><p>MILESTONE 1 WEATHER</p>' });
  await p.waitForSelector(`${H.APPS}:not([hidden]) ${H.APP_TILE}`);
  same(await p.evaluate(() => sessionStorage.getItem('ifl-roof')), '0', 'a missing roof: off, kept as ifl-roof "0"');
  await p.locator(H.appTile('weather')).locator('a[href="/weather/"]').first().click();
  await p.waitForSelector('text=MILESTONE 1 WEATHER', { timeout: 10000 });
  same(new URL(p.url()).pathname, '/weather/', 'the tile: a page load of the hub’s Weather page');
  same(loads(), 2, 'a main-frame navigation, not the framework’s');
  await ctx.close();
});

// ======================================================================= the module's files missing: the error state
await part('module error state', async () => {
  await mode({ phase: 'midday' });
  const { ctx, p, loads } = await open({ path: '/#apps', module: 'missing' });
  await p.waitForSelector(`${H.APPS}:not([hidden]) ${H.APP_TILE}`);
  await p.locator(H.appTile('weather')).locator('a[href="/weather/"]').first().click();
  await p.waitForSelector(`${H.M_WEATHER}:not([hidden]) ${H.ERROR_RETRY}`, { timeout: 20000 });
  same(new URL(p.url()).pathname, '/weather/', 'Weather in the page, at /weather/');
  same(loads(), 1, 'in the same document');
  ok(await p.$(`${H.M_WEATHER} ${H.ERROR_OWN}`), 'the error state: Try Again and Open Weather on Its Own');
  has(await text(p, H.M_WEATHER), 'Weather didn’t open', 'its words');
  ok(await p.$(H.HD_BACK), 'Back in the header on an app screen');
  await p.screenshot({ path: `${OUT}/weather-error-390-dark.png` });
  await p.click(`${H.M_WEATHER} ${H.ERROR_RETRY}`);
  await p.waitForSelector(`${H.M_WEATHER} ${H.ERROR_RELOAD}`, { timeout: 20000 });
  ok(true, 'a second failure: Reload');
  await ctx.close();
});

// ======================================================================= stage 2: a switch per module
// (/api/hub's apps, one on and one off: the one on opens in the page, the one off is a page load of the hub's page; the
// map kept as ifl-roof-apps, app names and booleans only)
const APPS_ON = { weather: true, markets: true, fitness: false, mail: false };
await part('apps per module', async () => {
  await mode({ phase: 'midday' });
  const HUBPAGE = '<!doctype html><title>Fitness</title><style>@view-transition { navigation: auto; }</style><p>FITNESS HUB PAGE</p>';
  const { ctx, p, loads } = await open({ hub: { ready: true, roof: true, apps: APPS_ON }, path: '/#apps', fakes: ['markets'],
    setup: (c) => c.route((u) => /^\/fitness\/(index\.html)?$/.test(new URL(u).pathname), (r) => r.fulfill({ contentType: 'text/html', body: HUBPAGE })) });
  await p.waitForSelector(`${H.APPS}:not([hidden]) ${H.APP_TILE}`);
  same(await p.evaluate(() => JSON.parse(sessionStorage.getItem('ifl-roof-apps') || 'null')), APPS_ON, 'the apps map kept as ifl-roof-apps, as /api/hub said it');
  await p.locator(H.appTile('markets')).locator('a[href="/markets/"]').first().click();
  await p.waitForSelector(`${H.M_MARKETS}:not([hidden]) .kit-sec`, { timeout: 15000 });
  same([new URL(p.url()).pathname, loads(), await p.evaluate(() => document.documentElement.dataset.app)], ['/markets/', 1, 'markets'], 'Markets on: its tile opens it in the page (one document)');
  ok(!(await p.$(H.M_WEATHER)), 'Weather, not opened, isn’t mounted for it');
  await p.goBack();
  await p.waitForSelector(`${H.APPS}:not([hidden]) ${H.APP_TILE}`);
  await p.locator(H.appTile('fitness')).locator('a[href="/fitness/"]').first().click();
  await p.waitForSelector('text=FITNESS HUB PAGE', { timeout: 10000 });
  same([new URL(p.url()).pathname, loads()], ['/fitness/', 2], 'Fitness off: its tile is a page load of the hub’s Fitness page');
  await ctx.close();
});

// (signed out, as the page finds out (a 401 the account confirms): every app's copy of you at this address goes too,
// markets:* and the fitness store among them; offline, nothing goes)
await part('signed out elsewhere', async () => {
  await mode({ phase: 'midday' });
  const { ctx, p } = await open({ path: '/' });
  await p.waitForSelector(`${H.TODAY}[data-phase="midday"]`, { timeout: 10000 });
  await p.evaluate(async () => {
    for (const k of ['markets:last', 'markets:recent', 'fitness:meAt', 'fitness:sums', 'wx:acct', 'wx:places']) localStorage.setItem(k, '{"t":1}');
    await new Promise((ok, no) => { const r = indexedDB.open('fitness', 1); r.onupgradeneeded = () => r.result.createObjectStore('files'); r.onerror = no; r.onsuccess = () => { const tx = r.result.transaction('files', 'readwrite'); tx.objectStore('files').put({ a: 1 }, 'one'); tx.oncomplete = () => { r.result.close(); ok(); }; }; });
  });
  const kept = () => p.evaluate(async () => ({
    keys: ['markets:last', 'markets:recent', 'fitness:meAt', 'fitness:sums', 'wx:acct', 'wx:places'].filter((k) => localStorage.getItem(k) != null),
    files: await new Promise((ok) => { const r = indexedDB.open('fitness'); r.onsuccess = () => { try { const q = r.result.transaction('files').objectStore('files').count(); q.onsuccess = () => { ok(q.result); r.result.close(); }; } catch { ok(-1); } }; r.onerror = () => ok(-1); }),
  }));
  await ctx.setOffline(true);
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await p.waitForTimeout(1500);
  await ctx.setOffline(false);
  same(await kept(), { keys: ['markets:last', 'markets:recent', 'fitness:meAt', 'fitness:sums', 'wx:acct', 'wx:places'], files: 1 }, 'offline: nobody signed out, every app’s copy kept');
  await mode({ mode: 'out' });
  await p.click(H.tab('you'));
  await p.waitForSelector('#out:not([hidden]) #signin', { timeout: 10000 });
  await p.waitForTimeout(800);
  same(await kept(), { keys: ['wx:places'], files: 0 }, 'signed out elsewhere (a 401, confirmed): markets:*, fitness:* and wx:acct gone, the fitness store emptied; Weather’s places stay (the phone’s)');
  await ctx.close();
});

// (Today's cards asked for again on its next show after a module said it changed something (fw.changed); not otherwise)
await part('cards after a change', async () => {
  await mode({ phase: 'midday' });
  const { ctx, p } = await open({ path: '/#apps', fakes: ['weather'] });
  await p.waitForSelector(`${H.APPS}:not([hidden]) ${H.APP_TILE}`);
  await p.waitForTimeout(800);
  const toWx = async () => { await p.click(H.tab('apps')); await p.waitForSelector(`${H.APPS}:not([hidden]) ${H.APP_TILE}`); await p.locator(H.appTile('weather')).locator('a[href="/weather/"]').first().click(); await p.waitForFunction(() => window.kitMods?.weather?.shows?.length > 0, null, { timeout: 15000 }); };
  const cards = async () => (await sent('GET', 'cards')).length;
  await toWx();
  await reset();
  await p.click(H.tab('today')); await p.waitForFunction(() => !document.getElementById('today').hidden); await p.waitForTimeout(1500);
  same(await cards(), 0, 'back to Today with nothing changed: the cards not asked for again');
  await toWx();
  await p.evaluate(() => window.kitMods.weather.fw.changed());
  await p.click(H.tab('today')); await p.waitForFunction(() => !document.getElementById('today').hidden);
  await p.waitForTimeout(1500);
  same(await cards(), 1, 'after fw.changed(): Today asks for its cards again on its next show, once');
  await ctx.close();
});

// ======================================================================= every size, light and dark
await part('sizes', async () => {
  await mode({ phase: 'midday' });
  for (const [w, h] of [[320, 568], [390, 844], [768, 1024], [1280, 800]]) for (const scheme of ['light', 'dark']) for (const view of ['today', 'apps', 'you']) {
    const { ctx, p } = await open({ w, h, scheme, path: view === 'today' ? '/' : `/#${view}` });
    await p.waitForFunction((v) => !document.getElementById(v).hidden && (v !== 'you' || document.querySelector('#youRules .rule')) && (v !== 'apps' || document.querySelector('.ifl-tile[data-app]')) && (v !== 'today' || document.querySelector('#today[data-phase]')), view);
    await p.waitForTimeout(400);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    ok(over <= 0, `${w}×${h} ${scheme} ${view}: no sideways scroll`, `${over}px`);
    if (w === 390 || w === 1280) {
      await p.evaluate(AXE);
      const axe = await p.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] }, rules: { 'meta-viewport': { enabled: false } }, resultTypes: ['violations'] })).violations
        .map((v) => `${v.id} ×${v.nodes.length}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ').slice(0, 160)}`));
      same(axe, [], `${w}×${h} ${scheme} ${view}: axe clean`);
    }
    await p.screenshot({ path: `${OUT}/${view}-${w}x${h}-${scheme}.png` });
    await ctx.close();
  }
});
same(errs, [], 'no CSP violation and no console error, on any page');

await b.close();
stop();
console.log(`FAILS ${fails}`);
process.exit(fails ? 1 : 0);
