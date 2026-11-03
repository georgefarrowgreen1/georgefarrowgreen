// InFlite's one page at inflite.ai (the inflite repo's today/: its Worker and public files; Today First, spec §3.2, §7.7,
// §9.1, §10, §11.1, §11.3–§11.5, §14.3 layer 2), end to end in real Chromium: its Worker run by wrangler dev on :8787
// against the stand-in for the account (mocks/todaystub.mjs on :8789, in its phase modes), both started here and stopped
// by PID at the end. Whether the hub's Worker is ready (GET /api/hub) and Chats' pages (/chats/…, Chat's engine
// included) are stood in for in the browser, as this test is about the page, not the hub (hubserve.mjs is).
// Checked: the tab bar (Today · Chats · Apps · You, the same on each view, Today chosen on opening, the views switched in
// the page with history); Chat's engine made at idle; Apps' tiles and their lines, Mail's only for its account; You
// drawn from the stub (rules with levels and records, notifications by app, this phone, other devices, quiet hours) and
// each of its writes sent; Get Every App's Notifications Here sending fan: true only from its tap, and nothing posted to
// /api/device on first run; a notification tapped while open; the ifl-sent toast; the way in (Sign in through Chats,
// Sign In Without Chats as Today's own trip); the hub not ready (degraded: the apps' own addresses, no engine, no
// hub-only rows); an account side from before Today First (v1: the four cards, Rules and Other Devices left out, This
// Phone through /api/push); nothing of Markets' money or a Chat place kept in localStorage; and at 390, 320 and on its
// side, light and dark: no sideways scroll, axe clean, no CSP violation or console error.
//   node .tools/tests/todayshell.mjs [state dir] [screenshots dir]      (run.sh does this)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

// (requests a service worker makes are routed too: Today's root worker fetches its own files)
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const HERE = new URL('./', import.meta.url).pathname;
const IFL = process.env.IFL_ROOT || new URL('../../../inflite/', import.meta.url).pathname;
const OUT = process.argv[3] || `${tmpdir()}/todayshell`;
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:8787', STUB = 'http://127.0.0.1:8789';
let fails = 0;
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${!c && extra ? '  — ' + extra : ''}`); if (!c) fails++; };
const same = (a, b, l) => ok(JSON.stringify(a) === JSON.stringify(b), l, `got ${JSON.stringify(a)?.slice(0, 400)}, wanted ${JSON.stringify(b)?.slice(0, 400)}`);
if (!existsSync(`${IFL}today/public/index.html`)) { console.log('SKIP  the inflite repo isn’t beside this one'); console.log('FAILS 0'); process.exit(0); }

const FIX = (f) => JSON.parse(readFileSync(new URL(`./mocks/today/${f}`, import.meta.url), 'utf8'));
const MIDDAY = FIX('cards.midday.json'), RULES = FIX('rules.json'), DEVICES = FIX('devices.json'), CARDS = FIX('cards.json');
const AXE = readFileSync(`${HERE}node_modules/axe-core/axe.min.js`, 'utf8');
const FAKE_ENDPOINT = 'https://fcm.googleapis.com/fcm/send/inflite-phone';
// (day.css is batch TP's: until it's in, stood in for, empty, so the page's link to it isn't a broken one)
const NO_DAY_CSS = !existsSync(`${IFL}today/public/day.css`);

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

const ctl = (path, body) => fetch(STUB + path, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }).then((r) => r.json());
const mode = (m) => ctl('/mode', m);
const reqs = async () => (await ctl('/__log')).filter((e) => e.path.startsWith('/api/account/today/'));
const reset = () => ctl('/__reset', {});
const sent = async (method, route) => (await reqs()).filter((e) => e.method === method && e.path === `/api/account/today/${route}`).map((e) => (e.body ? JSON.parse(e.body) : null));

// ---- the browser ----
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined) });
const errs = [];
// Chat's engine, stood in for: Chat's own page as the engine's frame loads it, ready, saying what it's asked
const ENGINE = `<!doctype html><html><head><meta charset="utf-8"><title>Chats</title></head><body><script>
  window.IFLChat = { state: "ready", share: async (w, p, o) => { parent.__shared = [w, p, o]; return true; }, sendTo: async () => ({ ok: true, say: "Sent to Leo" }),
    waiting: async () => [], since: async () => null, refresh: async () => { parent.__refreshed = (parent.__refreshed || 0) + 1; }, signOut: async () => { parent.__chatOut = true; } };
  parent.dispatchEvent(new Event("ifl-chat-ready"));
</script></body></html>`;
async function open({ w = 390, h = 844, scheme = 'dark', hub = true, push = false, signedIn = true, path = '/', wait = true, standalone = false, sentSay = null } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, locale: 'en-GB', timezoneId: 'Europe/London', serviceWorkers: 'allow' });
  if (signedIn) await ctx.addCookies([{ name: 'account', value: 'stubsession0123456789abcdefABCDEF', url: BASE }]);
  await ctx.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`)));
  if (standalone) await ctx.addInitScript(() => Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true }));
  if (sentSay) await ctx.addInitScript((s) => { if (!sessionStorage.getItem('done-sent')) { sessionStorage.setItem('ifl-sent', s); sessionStorage.setItem('done-sent', '1'); } }, sentSay);
  // (the hub's Worker ready, or not yet; Chats' pages, the engine among them)
  await ctx.route((u) => new URL(u).pathname === '/api/hub', (r) => r.fulfill({ json: { ready: hub }, headers: { 'Cache-Control': 'no-store' } }));
  await ctx.route((u) => new URL(u).pathname.startsWith('/chats/'), (r) => r.fulfill({ contentType: 'text/html', body: new URL(r.request().url()).searchParams.has('engine') ? ENGINE : '<!doctype html><title>Chats</title><style>@view-transition { navigation: auto; }</style><p>Chats</p>' }));
  if (NO_DAY_CSS) await ctx.route((u) => new URL(u).pathname === '/day.css', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  if (push) {
    await ctx.grantPermissions(['notifications'], { origin: BASE });
    await ctx.addInitScript((endpoint) => {
      const make = () => ({ endpoint, toJSON: () => ({ endpoint, keys: { p256dh: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U', auth: 'tBHItJI5svbpez7KI4CCXg' } }), unsubscribe: async () => { localStorage.removeItem('fakesub'); return true; } });
      PushManager.prototype.getSubscription = async function () { return localStorage.getItem('fakesub') ? make() : null; };
      PushManager.prototype.subscribe = async function () { localStorage.setItem('fakesub', '1'); return make(); };
    }, FAKE_ENDPOINT);
  }
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource: (the server responded with a status of (40[14]|501|502)|net::ERR_INTERNET_DISCONNECTED)/.test(m.text())) errs.push(m.text()); });
  await p.clock.setFixedTime(new Date(MIDDAY.at));
  await p.goto(BASE + path);
  if (wait) await (signedIn ? p.waitForSelector('#in:not([hidden]) #tabs .ifl-tab') : p.waitForSelector('#out:not([hidden]) #signin'));
  return { ctx, p };
}
const text = (p, s) => p.$eval(s, (e) => e.innerText).catch(() => '');
const has = (hay, needle, l) => ok(hay.includes(needle), l, `“${needle}” not in “${hay.slice(0, 300)}”`);
const tabs = (p) => p.$$eval('#tabs .ifl-tab', (as) => as.map((a) => [a.textContent.trim(), a.getAttribute('href'), a.getAttribute('aria-current')]));
const shown = (p) => p.evaluate(() => ['today', 'apps', 'you'].filter((k) => !document.getElementById(k).hidden));
const ONLY = process.env.ONLY?.split(',');
async function part(name, fn) { if (ONLY && !ONLY.some((o) => name.includes(o))) return; try { await fn(); } catch (e) { ok(false, name, e.stack?.split('\n').slice(0, 3).join(' | ')); } }

// ======================================================================= the tab bar, and the views in one page
await part('tabs and views', async () => {
  await mode({ phase: 'midday' }); await reset();
  const { ctx, p } = await open();
  ok(await p.evaluate(() => document.documentElement.classList.contains('ifl-hub')), 'html.ifl-hub: the page is the hub');
  same(await shown(p), ['today'], 'opens on Today');
  same(await tabs(p), [['Today', '/', 'page'], ['Chats', '/chats/', null], ['Apps', '/#apps', null], ['You', '/#you', null]], 'the tab bar: Today · Chats · Apps · You, Today chosen');
  same(await text(p, '#hd .ifh-name'), 'Today', 'the header says Today');
  ok(await p.$('#today[data-phase="midday"]'), 'the day drawn by day.js (its phase marked)');
  const bar = await p.$eval('#tabs', (n) => { const r = n.getBoundingClientRect(), cs = getComputedStyle(n); return { pos: cs.position, bottom: innerHeight - r.bottom, h: r.height, vt: cs.viewTransitionName }; });
  ok(bar.pos === 'fixed' && bar.bottom >= 0 && bar.bottom < 40 && bar.h >= 44, 'the tab bar sits at the foot, fixed', JSON.stringify(bar));
  same(bar.vt, 'ifl-tabs', 'and stays put as pages cross-fade (view-transition-name)');
  await p.screenshot({ path: `${OUT}/today-390-dark.png` });
  await p.evaluate(() => { window.__same = 1; });
  await p.click('#tabs [data-tab="apps"]');
  await p.waitForSelector('#apps:not([hidden]) .atile');
  same(await shown(p), ['apps'], 'Apps: its view alone');
  same(new URL(p.url()).hash, '#apps', 'at /#apps');
  same((await tabs(p)).map((t) => t[2]), [null, null, 'page', null], 'the same bar, Apps chosen');
  same(await text(p, '#hd .ifh-name'), 'Apps', 'the header says Apps');
  await p.click('#tabs [data-tab="you"]');
  await p.waitForSelector('#you:not([hidden]) .you-sec');
  same(await shown(p), ['you'], 'You: its view alone');
  same((await tabs(p)).map((t) => t[2]), [null, null, null, 'page'], 'the same bar, You chosen');
  await p.goBack();
  await p.waitForFunction(() => !document.getElementById('apps').hidden);
  same(await shown(p), ['apps'], 'Back: Apps again, in the page');
  await p.click('#tabs [data-tab="today"]');
  await p.waitForFunction(() => !document.getElementById('today').hidden);
  same(new URL(p.url()).pathname + new URL(p.url()).hash, '/', 'Today: at /');
  ok(await p.evaluate(() => window.__same === 1), 'all in one page: never loaded again');
  // (Chats: a page of its own, the breadcrumb left for its Back)
  await p.click('#tabs [data-tab="chats"]');
  await p.waitForURL(/\/chats\/$/);
  same(await p.evaluate(() => sessionStorage.getItem('ifl-crumb')), '/', 'Chats: its own page, the breadcrumb left');
  await ctx.close();
});

await part('the engine at idle', async () => {
  await mode({ phase: 'midday' });
  const { ctx, p } = await open();
  await p.waitForSelector('iframe[name="ifl-chat"]', { state: 'attached', timeout: 10000 });
  const f = await p.$eval('iframe[name="ifl-chat"]', (n) => ({ src: n.getAttribute('src'), cls: n.className, hidden: n.hidden, vis: getComputedStyle(n).visibility, pe: getComputedStyle(n).pointerEvents, pos: getComputedStyle(n).position }));
  same(f, { src: '/chats/?engine=1', cls: 'ifl-engine', hidden: true, vis: 'hidden', pe: 'none', pos: 'fixed' }, 'Chat’s engine made once the day’s drawn: its own page, unseen, never in the way of a tap');
  same(await p.$$eval('iframe[name="ifl-chat"]', (fs) => fs.length), 1, 'one engine');
  // (a Chat push, the root worker's word: the engine caught up, and the day asked again)
  await reset();
  await p.evaluate(() => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { inflight: 'sync', tag: 'm-1' } })));
  await p.waitForTimeout(2200);
  ok(await p.evaluate(() => window.__refreshed >= 1), 'a Chat push: IFLChat.refresh()');
  same((await sent('GET', 'cards')).length, 1, 'and the day asked once more');
  // (a notification tapped while open: the root worker's { ifl: "open", url }, to a path of this site's only)
  await p.evaluate(() => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { ifl: 'open', url: '//evil.example/' } })));
  await p.evaluate(() => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { ifl: 'open', url: '/#you' } })));
  await p.waitForFunction(() => !document.getElementById('you').hidden);
  same(new URL(p.url()).origin + new URL(p.url()).hash, `${BASE}#you`, 'a notification tapped: there, in the same window; another site’s never');
  await ctx.close();
});

await part('sent from Chats and back', async () => {
  await mode({ phase: 'midday' });
  const { ctx, p } = await open({ sentSay: 'Sent to Pat' });
  await p.waitForSelector('.ifl-toast.on', { timeout: 5000 });
  same(await text(p, '.ifl-toast'), 'Sent to Pat. You’re still here', 'the one-shot toast from Chats’ own sheet');
  same(await p.evaluate(() => sessionStorage.getItem('ifl-sent')), null, 'said once');
  await ctx.close();
});

// ======================================================================= Apps
await part('apps', async () => {
  await mode({ phase: 'midday' });
  let { ctx, p } = await open({ path: '/#apps' });
  await p.waitForSelector('#apps:not([hidden]) .atile');
  const tiles = await p.$$eval('.atile', (ts) => ts.map((t) => [t.dataset.app, t.querySelector('.atile-tx b').textContent, t.querySelector('.atile-tx small').textContent, t.querySelector('.atile-go').getAttribute('href')]));
  same(tiles, [['weather', 'Weather', MIDDAY.apps.weather, '/weather/'], ['fitness', 'Fitness', MIDDAY.apps.fitness, '/fitness/'], ['markets', 'Markets', MIDDAY.apps.markets, '/markets/']], 'a tile for each app, its line from the day, opening it here; no Mail');
  same(await p.$$eval('.atile[data-app=weather] .achip', (as) => as.map((a) => [a.textContent, a.getAttribute('href')])), [['Radar', '/weather/#radar'], ['Warnings', '/weather/#warnings']], 'Weather’s sections');
  same(await p.$$eval('.atile[data-app=markets] .achip', (as) => as.map((a) => a.getAttribute('href'))), ['/markets/#today', '/markets/#holdings', '/markets/#news'], 'Markets’ sections');
  has(await text(p, '.apps-note'), 'Their news reaches you on Today. Any card can be sent to a friend.', 'the word under the tiles');
  ok(await p.$eval('.atile[data-app=weather] .atile-ic', (i) => i.complete && i.naturalWidth > 0), 'each tile’s icon');
  await p.screenshot({ path: `${OUT}/apps-390-dark.png` });
  await ctx.close();
  await mode({ phase: 'midday', admin: true });
  ({ ctx, p } = await open({ path: '/#apps', scheme: 'light' }));
  await p.waitForSelector('#apps:not([hidden]) .atile');
  same(await p.$$eval('.atile', (ts) => ts.map((t) => t.dataset.app)), ['weather', 'fitness', 'markets', 'mail'], 'Mail’s tile for its account (apps.mail)');
  same(await p.$eval('.atile[data-app=mail]', (t) => [t.querySelector('small').textContent, t.querySelector('.atile-go').getAttribute('href')]), ['For you only', '/mail/'], 'Mail: For you only, at /mail/');
  await ctx.close();
});

// ======================================================================= You
await part('you: drawn from the account', async () => {
  await mode({ phase: 'midday' }); await reset();
  const { ctx, p } = await open({ path: '/#you', push: true });
  await p.waitForSelector('#youRules .rule');
  const rules = await p.$$eval('#youRules .row', (rs) => rs.map((r) => [r.querySelector('b').textContent, r.querySelector('small')?.textContent || '', r.querySelector('[aria-pressed="true"]')?.textContent || r.querySelector('.val')?.textContent || '']));
  same(rules, RULES.rules.map((r) => [r.name, r.line, r.soon ? 'Coming' : 'Do']), 'Rules: each at its level, with its record; later and arrange as coming');
  has(await text(p, '#youRules'), 'A rule drops a level when you undo it, and climbs after ten kept actions.', 'Rules: the note');
  const notify = await text(p, '#youNotify');
  for (const w of ['Friends and Groups', 'Never the words', 'Weather', 'Warnings always', 'Markets', 'Fitness', 'In Today’s morning', 'Today’s Morning', '07:00']) has(notify, w, `Notifications, by App: “${w}”`);
  ok(!notify.includes('Mail'), 'no Mail row but for Mail’s account');
  same(await p.$$eval('#youNotify [aria-pressed="true"]', (bs) => bs.map((x) => x.textContent)), ['All', 'All', 'Alerts'], 'Friends and Groups All, Weather’s rain All, Markets’ Alerts');
  has(await text(p, '#youPhone'), 'Get Every App’s Notifications Here', 'This Phone: Get Every App’s Notifications Here (the fan-out’s on)');
  same(await p.$$eval('#youDevices .dev', (rs) => rs.map((r) => [r.querySelector('b').textContent, r.querySelector('[data-stop]').textContent])), DEVICES.devices.map((d) => [d.label, 'Stop There']), 'Other Devices Getting Notifications, each with Stop There');
  ok(await p.isChecked('#youQuiet'), 'Quiet Hours: on');
  same(await p.$$eval('#youQuietSec .row.pick .val span', (ss) => ss.map((x) => x.textContent)), ['21:00', '06:00'], 'Quiet Hours: 21:00 to 06:00');
  has(await text(p, '#youChat'), 'Show When I’m Typing, Pigeons, Names on the Lock Screen', 'Chat’s own settings');
  has(await text(p, '#youVersions'), 'Today', 'InFlite: each app’s version');
  ok(await p.isVisible('#youOut'), 'Sign Out');
  await p.waitForTimeout(1500);
  same((await reqs()).filter((e) => e.path.endsWith('/today/device')).length, 0, 'nothing posted to /api/device on first run');
  await p.screenshot({ path: `${OUT}/you-390-dark.png`, fullPage: true });
  await ctx.close();
});

await part('you: its writes', async () => {
  await mode({ phase: 'midday' }); await reset();
  const { ctx, p } = await open({ path: '/#you', push: true });
  await p.waitForSelector('#youRules .rule');
  await p.click('#youRules [data-rule="moveRide"] [data-level="suggest"]');
  await p.waitForFunction(() => document.querySelector('#youRules [data-rule="moveRide"] [data-level="suggest"]').getAttribute('aria-pressed') === 'true');
  await p.waitForTimeout(400);
  same(await sent('PUT', 'rules'), [{ rule: 'moveRide', level: 'suggest' }], 'a rule’s level: PUT /api/rules');
  await p.click('#youNotify [data-chat="off"]');
  await p.waitForTimeout(500);
  const chat = (await sent('PATCH', 'notify'))[0]?.chat || {};
  ok(Object.keys(chat).length > 3 && Object.values(chat).every((v) => v === false), 'Friends and Groups Off: PATCH /api/notify { chat: every kind off }', JSON.stringify(chat));
  await p.click('#youNotify [data-alerts="off"]');
  await p.waitForTimeout(500);
  same((await sent('PATCH', 'notify')).at(-1), { markets: { alerts: false } }, 'Markets Off: PATCH { markets: { alerts: false } }');
  await p.click('#youNotify [data-rain="off"]');
  await p.waitForTimeout(500);
  same((await sent('PATCH', 'notify')).at(-1), { weather: { place: { lat: 51.5072, lon: -0.1276, name: 'London', rain: false } } }, 'Weather’s rain Off: PATCH { weather: { place } }');
  await p.selectOption('#youQfrom', '22');
  await p.waitForTimeout(500);
  same((await sent('PATCH', 'notify')).at(-1), { quiet: { on: true, from: 22, to: 6, tz: 'Europe/London' } }, 'Quiet Hours: PATCH { quiet: { on, from, to, tz } }');
  await p.click(`#youDevices [data-stop="${DEVICES.devices[1].id}"]`);
  await p.waitForFunction((id) => !document.querySelector(`#youDevices [data-dev="${id}"]`), DEVICES.devices[1].id);
  same(await sent('DELETE', 'devices'), [{ id: DEVICES.devices[1].id }], 'Stop There: DELETE /api/devices { id }, and its row gone');
  // Get Every App's Notifications Here: nothing until its own tap
  same(await sent('POST', 'device'), [], 'nothing fanned out yet');
  await p.click('#youEvery');
  await p.waitForSelector('#sh-every.on');
  await p.waitForTimeout(500);
  const sheet = await text(p, '#sh-every');
  has(sheet, 'Chats, Weather and Markets will notify you here as well.', 'the sheet says what changes');
  for (const d of [DEVICES.devices[0], DEVICES.devices[2]]) has(sheet, d.label, `and lists ${d.label}, still getting them`);
  same(await p.$$eval('#sh-every [data-stop]', (bs) => bs.length), 2, 'each with Stop There');
  same(await sent('POST', 'device'), [], 'opening the sheet sends nothing');
  await p.screenshot({ path: `${OUT}/every-390-dark.png` });
  await p.click('#evGo');
  await p.waitForFunction(() => !document.querySelector('#sh-every.on'));
  const dev = await sent('POST', 'device');
  same(dev.map((x) => [x.fan, x.sub?.endpoint]), [[true, FAKE_ENDPOINT]], 'its tap: POST /api/device { sub, fan: true }');
  has(await text(p, '#youPhone'), 'Every App’s Notifications', 'and This Phone says every app’s come here');
  await ctx.close();
});

await part('you: this phone', async () => {
  await mode({ phase: 'midday' }); await reset();
  const { ctx, p } = await open({ path: '/#you', push: true });
  await p.waitForSelector('#youPhone input');
  ok(!(await p.isChecked('#youPhone input')), 'This Phone: off, with no subscription');
  await p.click('#youPhoneRow');
  await p.waitForFunction(() => document.querySelector('#youPhone input')?.checked && !document.querySelector('#youPhone input').disabled, null, { timeout: 15000 });
  await p.waitForTimeout(500);
  const all = await reqs(), i = all.findIndex((e) => e.method === 'POST' && e.path.endsWith('/today/device')), j = all.findIndex((e) => e.method === 'PUT' && e.path.endsWith('/today/morning'));
  const body = JSON.parse(all[i]?.body || '{}');
  ok(i >= 0 && j > i, 'turning it on: POST /api/device, then PUT /api/morning');
  same([body.sub?.endpoint, body.fan, body.tz], [FAKE_ENDPOINT, undefined, 'Europe/London'], 'POST /api/device { sub, tz }: Today’s morning only, never fan');
  ok(!all.some((e) => e.path.endsWith('/today/push')), 'not /api/push, on an account side that has the device route');
  // (Sign Out, from You: this phone out of every table, then signed out, then the sign-in page)
  await reset();
  await p.route('https://auth.inflite.ai/**', (r) => r.fulfill({ body: 'auth', contentType: 'text/html' }));
  await p.click('#youOut');
  await p.waitForURL(/auth\.inflite\.ai/);
  const h = new URLSearchParams(new URL(p.url()).hash.slice(1));
  same([h.get('signout'), h.get('back')], ['today', `${BASE}/`], 'Sign Out ends at #signout=today&back=…');
  const out = await reqs(), del = out.findIndex((e) => e.method === 'DELETE' && e.path.endsWith('/today/device')), so = out.findIndex((e) => e.path.endsWith('/signout'));
  ok(del >= 0 && so > del, 'DELETE /api/device first, then signed out');
  same(JSON.parse(out[del]?.body || '{}'), { endpoint: FAKE_ENDPOINT }, 'DELETE /api/device { endpoint }');
  await ctx.close();
});

// ======================================================================= the way in
await part('the way in', async () => {
  await mode({ mode: 'out' });
  let { ctx, p } = await open({ signedIn: false });
  ok(await p.isVisible('#signinToday'), 'Sign In Without Chats, quietly, beside Sign in');
  same(await p.$eval('#signin', (a) => a.getAttribute('href')), '/chats/#signin-start&then=/', 'Sign in: Chats’ trip, which signs in everything');
  await p.click('#signin');
  await p.waitForURL(/\/chats\//);
  same(new URL(p.url()).pathname + new URL(p.url()).hash, '/chats/#signin-start&then=/', 'Sign in goes to /chats/#signin-start&then=/');
  await ctx.close();
  ({ ctx, p } = await open({ signedIn: false }));
  await p.route('https://auth.inflite.ai/**', (r) => r.fulfill({ body: 'auth', contentType: 'text/html' }));
  await p.click('#signinToday');
  await p.waitForURL(/auth\.inflite\.ai/);
  const h = new URLSearchParams(new URL(p.url()).hash.slice(1));
  same([h.get('signin'), h.get('back'), /^[\w-]{43}$/.test(h.get('ask') || '')], ['today', `${BASE}/`, true], 'Sign In Without Chats: Today’s own trip (…/#signin=today&ask&back)');
  await ctx.close();
});

// ======================================================================= the hub not ready yet: degraded
await part('degraded', async () => {
  await mode({ phase: 'midday' });
  let { ctx, p } = await open({ hub: false });
  same(await tabs(p), [['Today', '/', 'page'], ['Chats', 'https://chat.inflite.ai/', null], ['Apps', '/#apps', null], ['You', '/#you', null]], 'not ready: Chats at its own address');
  ok(await p.$('#today[data-phase="midday"]'), 'Today’s own day still drawn');
  await p.waitForTimeout(3500);
  same(await p.$$eval('iframe[name="ifl-chat"]', (fs) => fs.length), 0, 'no engine');
  await p.click('#tabs [data-tab="apps"]');
  await p.waitForSelector('#apps:not([hidden]) .atile');
  same(await p.$$eval('.atile .atile-go', (as) => as.map((a) => a.getAttribute('href'))), ['https://weather.inflite.ai/', 'https://fitness.inflite.ai/', 'https://finance.inflite.ai/'], 'the tiles: the apps’ own addresses');
  same(await p.$eval('.atile[data-app=weather] .achip', (a) => a.getAttribute('href')), 'https://weather.inflite.ai/#radar', 'and their sections');
  await p.click('#tabs [data-tab="you"]');
  await p.waitForSelector('#youRules .rule');
  ok(!(await p.$('#youEvery')) && !(await text(p, '#you')).includes('Every App'), 'You: no Get Every App’s Notifications Here');
  ok(!(await p.$('#youDevices')), 'You: no Other Devices');
  ok(await p.$('#youNotify') && await p.$('#youRules'), 'the rest of You as ever');
  ok(await p.evaluate(() => sessionStorage.getItem('ifl-hub-ready') === '0'), 'the answer kept for the visit');
  await ctx.close();
  await mode({ mode: 'out' });
  ({ ctx, p } = await open({ hub: false, signedIn: false }));
  ok(!(await p.isVisible('#signinToday')), 'signed out, not ready: no second way in');
  await p.route('https://auth.inflite.ai/**', (r) => r.fulfill({ body: 'auth', contentType: 'text/html' }));
  await p.click('#signin');
  await p.waitForURL(/auth\.inflite\.ai/);
  same(new URLSearchParams(new URL(p.url()).hash.slice(1)).get('signin'), 'today', 'Sign in: Today’s own trip, as Today 1.08');
  await ctx.close();
});

// ======================================================================= an account side from before Today First
await part('v1', async () => {
  await mode({ v1: true }); await reset();
  const { ctx, p } = await open({ push: true });
  await p.waitForFunction(() => document.querySelectorAll('#rest .tcard[data-state="ok"]').length === 4);
  same(await p.$$eval('#rest .tcard', (cs) => cs.map((c) => c.dataset.app)), ['weather', 'chat', 'fitness', 'markets'], 'v1: today’s four cards, in Edit’s order');
  ok(!(await p.$('#today[data-phase]')), 'no phase drawn');
  await p.click('#tabs [data-tab="you"]');
  await p.waitForSelector('#youPhone input');
  await p.waitForTimeout(1200);
  ok(!(await p.$('#youRules')), 'v1: no Rules');
  ok(!(await p.$('#youDevices')), 'v1: no Other Devices');
  ok(!(await p.$('#youNotify')) && !(await p.$('#youQuietSec')), 'v1: no Notifications by App or Quiet Hours');
  await reset();
  await p.click('#youPhoneRow');
  await p.waitForFunction(() => document.querySelector('#youPhone input')?.checked && !document.querySelector('#youPhone input').disabled, null, { timeout: 15000 });
  await p.waitForTimeout(500);
  const all = await reqs();
  const dev = all.findIndex((e) => e.method === 'POST' && e.path.endsWith('/today/device')), push = all.findIndex((e) => e.method === 'POST' && e.path.endsWith('/today/push'));
  ok(dev >= 0 && push > dev, 'v1: This Phone falls back to POST /api/push after the device route’s 404');
  same(JSON.parse(all[push]?.body || '{}').sub?.endpoint, FAKE_ENDPOINT, 'with the subscription');
  await ctx.close();
});

// ======================================================================= privacy: nothing of Markets' money or a Chat place kept
await part('kept', async () => {
  for (const m of [{ mode: 'ok' }, { phase: 'midday' }]) {
    await mode(m);
    const { ctx, p } = await open();
    await p.waitForTimeout(1500);
    const kept = await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('today:')).map((k) => localStorage.getItem(k)).join('\n'));
    ok(kept.includes('today'), `${m.mode || m.phase}: the day kept`);
    ok(!kept.includes('£'), `${m.mode || m.phase}: no £ kept`);
    const mk = CARDS.cards.markets, amounts = [mk.value, mk.change, mk.top?.change, mk.low?.change, mk.dividend?.value].filter(Number.isFinite).map(String);
    ok(amounts.length > 2 && !amounts.some((a) => kept.includes(a)) && !/"(value|change|spark|isa)"/.test(kept), `${m.mode || m.phase}: no Markets amounts kept`, amounts.filter((a) => kept.includes(a)).join(', '));
    const places = [...new Set([...CARDS.cards.chat.inbound.map((x) => x.from), ...CARDS.cards.chat.mine.map((x) => x.to)].filter((x) => typeof x === 'string' && x))];
    ok(places.length && !places.some((x) => kept.includes(`"${x}"`)), `${m.mode || m.phase}: no Chat place kept (${places.join(', ')})`);
    ok(!/"(tops|waiting|upcoming)"/.test(kept), `${m.mode || m.phase}: none of a version 2 answer’s day kept`);
    await ctx.close();
  }
});

// ======================================================================= every size, light and dark: no sideways scroll, axe, no errors
await part('sizes', async () => {
  await mode({ phase: 'midday' });
  for (const [w, h] of [[390, 844], [320, 568], [844, 390]]) for (const scheme of ['light', 'dark']) for (const view of ['today', 'apps', 'you']) {
    const { ctx, p } = await open({ w, h, scheme, path: view === 'today' ? '/' : `/#${view}` });
    await p.waitForFunction((v) => !document.getElementById(v).hidden && (v !== 'you' || document.querySelector('#youRules .rule')) && (v !== 'apps' || document.querySelector('.atile')), view);
    await p.waitForTimeout(300);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    ok(over <= 0, `${w}×${h} ${scheme} ${view}: no sideways scroll`, `${over}px`);
    // (the foot of the view clear of the tab bar, scrolled to the end)
    const clear = await p.evaluate((v) => { scrollTo(0, document.documentElement.scrollHeight); const kids = [...document.getElementById(v).querySelectorAll('*')].filter((n) => n.getClientRects().length); const last = Math.max(...kids.map((n) => n.getBoundingClientRect().bottom)); return document.getElementById('tabs').getBoundingClientRect().top - last; }, view);
    ok(clear >= 0 || view === 'today', `${w}×${h} ${scheme} ${view}: its foot clear of the tab bar`, `${clear}px`);
    await p.evaluate(AXE);
    const axe = await p.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] }, rules: { 'meta-viewport': { enabled: false } }, resultTypes: ['violations'] })).violations
      .map((v) => `${v.id} ×${v.nodes.length}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ').slice(0, 160)}`));
    same(axe, [], `${w}×${h} ${scheme} ${view}: axe clean`);
    if (w !== 390 || scheme === 'light') await p.screenshot({ path: `${OUT}/${view}-${w}x${h}-${scheme}.png` });
    await ctx.close();
  }
});
same(errs, [], 'no CSP violation and no console error, on any page');

await b.close();
stop();
console.log(`FAILS ${fails}`);
process.exit(fails ? 1 : 0);
