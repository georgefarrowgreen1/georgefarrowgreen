// InFlite's one page at inflite.ai (the inflite repo's today/: its Worker and public files; Today First, spec §3.2, §7.7,
// §9.1, §10, §11.1, §11.3–§11.5, §14.3 layer 2), end to end in real Chromium: its Worker run by wrangler dev on :8787
// against the stand-in for the account (mocks/todaystub.mjs on :8789, in its phase modes), both started here and stopped
// by PID at the end. Whether the hub's Worker is ready (GET /api/hub) and Chats' pages (/chats/…, Chat's engine
// included) are stood in for in the browser, as this test is about the page, not the hub (hubserve.mjs is).
// Checked: the tab bar (Today · Chats · Apps · You, the same on each view, Today chosen on opening, the views switched in
// the page with history); Chat's engine made at idle, laid out but unseen; its sheet shown over the page in the top layer
// (over a modal sheet of the page's own) and put away by the engine's own word (parent.IFL.hub.sent / closed); day.js
// and the cards handed the page's own hub (a stand-in day.js saying what it's given, and batch TP's real one where it's
// in: Radar at /weather/#radar, Send a button that opens the engine's sheet; degraded, the apps' own addresses); Apps'
// tiles and their lines, Mail's only for its account; You drawn from the stub (rules with levels and records,
// notifications by app, this phone, other devices, quiet hours) and each of its writes sent; This Phone on, off (staying
// off after a reload) and on again; Get Every App's Notifications Here sending fan: true only from its tap, and nothing
// posted to /api/device on first run; Sign Out in §11.5's order, the engine's signOut included, and every app's copy of
// you kept at this address let go (Chat's too where there's no engine); a notification tapped
// while open; the ifl-sent toast; the way in (Sign in through Chats, Sign In Without Chats as Today's own trip); the hub
// not ready (degraded: the apps' own addresses, no engine, no hub-only rows); an account side from before Today First
// (v1: the four cards, Rules and Other Devices left out, This Phone through /api/push, on and off); nothing of Markets'
// money or a Chat place kept in localStorage; pages off the hub never cross-fade (menu.css asks it of every page; menu.js
// lets it go), at the hub they do; and at 390, 320 and on its side, light and dark: no sideways scroll, every view's foot
// clear of the tab bar, axe clean, no CSP violation or console error.
// Under One roof (the framework beside: roof/router.js): /api/hub answers roof beside ready; Apps' tiles are the
// framework's (.ifl-tile[data-app], hrefs as before); You's Weather row opens its Weather Notifications sheet (roofshell.mjs
// checks that sheet); the page's sheets are InFlite's sheet (dialog[open]); Sign in comes back to the screen it was asked
// from (then=%2F at /).
//   node .tools/tests/todayshell.mjs [state dir] [screenshots dir]      (run.sh does this)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { jsBlock, cssBlock } from '../iflmenu.mjs';

// (requests a service worker makes are routed too: Today's root worker fetches its own files)
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const HERE = new URL('./', import.meta.url).pathname;
const MAIN = new URL('../../', import.meta.url).pathname;
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
// (day.css is batch TP's: until it's in, stood in for, empty, so the page's link to it isn't a broken one. Its day.js and
// cards.js, where they're in, are checked with the page's own hub too)
const NO_DAY_CSS = !existsSync(`${IFL}today/public/day.css`);
const TP_DAY = /export function stopDay/.test(readFileSync(`${IFL}today/public/day.js`, 'utf8'));
const TP_CARDS = /export const hubOf/.test(readFileSync(`${IFL}today/public/cards.js`, 'utf8'));
const ROOF = existsSync(`${IFL}today/public/roof/router.js`);
// (Apps' tiles: the framework's under the roof, Today's own before it; each tile's name, line, href and its chips' hrefs)
const TILE = ROOF ? '.ifl-tile[data-app]' : '.atile';
const tilesOf = (p) => p.$$eval(TILE, (ts) => ts.map((t) => {
  const main = t.matches('a') ? t : t.querySelector('.ifl-tile-main, .atile-go');
  const chips = [...t.querySelectorAll('a[href]')].filter((a) => a !== main);
  return { app: t.dataset.app, name: (main.querySelector('b')?.textContent || '').trim(), line: (main.querySelector('small')?.textContent || '').trim(), href: main.getAttribute('href'),
    chips: chips.map((a) => [a.textContent.trim(), a.getAttribute('href')]) };
}));
const sheetOpen = (id) => (ROOF ? `#${id}[open]` : `#${id}.on`);

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
// Chat's engine, stood in for: Chat's own page as the engine's frame loads it, ready, saying what it's asked. Its sheet
// ends as §8.2 has it, through the parent's window: finish(say) → parent.IFL.hub.sent(say), finish() → closed(). Its
// signOut says so at /chats/__signed-out (as the page it's in is about to be left)
const ENGINE = `<!doctype html><html><head><meta charset="utf-8"><title>Chats</title></head><body><script>
  window.IFLChat = { state: "ready", share: async (w, p, o) => { parent.__shared = [w, p, o]; return true; }, sendTo: async () => ({ ok: true, say: "Sent to Leo" }),
    waiting: async () => [], since: async () => null, refresh: async () => { parent.__refreshed = (parent.__refreshed || 0) + 1; },
    signOut: async () => { parent.__chatOut = true; await fetch("/chats/__signed-out", { method: "POST" }); } };
  window.finish = (say) => (say ? parent.IFL.hub.sent(say) : parent.IFL.hub.closed());
  parent.dispatchEvent(new Event("ifl-chat-ready"));
</script></body></html>`;
const chatOut = [];
async function open({ w = 390, h = 844, scheme = 'dark', hub = true, apps = null, push = false, signedIn = true, path = '/', wait = true, standalone = false, sentSay = null, setup = null, phone = false } = {}) {
  // (phone: a phone's user agent, for Chats, whose service keeps theme.js's device rule: no core on a computer, S3-D13)
  const ctx = await b.newContext({ viewport: { width: w, height: h }, ...(phone ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' } : {}), colorScheme: scheme, locale: 'en-GB', timezoneId: 'Europe/London', serviceWorkers: 'allow' });
  if (signedIn) await ctx.addCookies([{ name: 'account', value: 'stubsession0123456789abcdefABCDEF', url: BASE }]);
  await ctx.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`)));
  if (standalone) await ctx.addInitScript(() => Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true }));
  if (sentSay) await ctx.addInitScript((s) => { if (!sessionStorage.getItem('done-sent')) { sessionStorage.setItem('ifl-sent', s); sessionStorage.setItem('done-sent', '1'); } }, sentSay);
  // (the hub's Worker ready, or not yet; Chats' pages, the engine among them)
  await ctx.route((u) => new URL(u).pathname === '/api/hub', (r) => r.fulfill({ json: { ready: hub, roof: hub, ...(apps ? { apps } : {}) }, headers: { 'Cache-Control': 'no-store' } }));
  await ctx.route((u) => new URL(u).pathname.startsWith('/chats/'), (r) => {
    const u = new URL(r.request().url());
    if (u.pathname === '/chats/__signed-out') { chatOut.push(Date.now()); return r.fulfill({ status: 204, body: '' }); }
    return r.fulfill({ contentType: 'text/html', body: u.searchParams.has('engine') ? ENGINE : '<!doctype html><title>Chats</title><style>@view-transition { navigation: auto; }</style><p>Chats</p>' });
  });
  // (Weather's files, as the hub would forward them: from this repo, the module's own (weather/roof/) among them, so the
  // framework's idle work for Weather (its connector, for search and the minis) finds them; anything else of Weather's, 404)
  await ctx.route((u) => /^\/weather\/.+/.test(new URL(u).pathname), (r) => {
    const f = new URL(r.request().url()).pathname.slice('/weather/'.length);
    if (!/^[\w-]+(\/[\w-]+)?\.(js|css)$/.test(f) || !existsSync(`${MAIN}weather/${f}`)) return r.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' });
    return r.fulfill({ contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript', body: readFileSync(`${MAIN}weather/${f}`, 'utf8') });
  });
  await setup?.(ctx);
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
// The apps' copies of you at this address (at the hub, Chats and every app are pages of it): each app's own, as its own
// Sign Out lets them go (Markets' forget(), Fitness's and Weather's signOutHere, Chat's forget), and the phone's own,
// which each app's Sign Out keeps (Weather's places and settings, each app's look). Seeded before a Sign Out with
// Fitness's files and Chat's sign-in in their IndexedDB stores, as each app keeps them; read after it, from a page here
const APP_KEYS = ['markets:last', 'markets:years', 'markets:recent', 'markets:newsRead', 'markets:newsHide', 'markets:newsSeen', 'markets:plan', 'wx:acct',
  'fitness:hk', 'fitness:today-sent', 'fitness:today-swaps', 'fitness:meAt', 'fitness:files', 'fitness:morning', 'fitness:sums', 'inflight-lock', 'inflight-badges', 'inflight-pushsub', 'inflight-opened'];
const PHONE_KEYS = ['wx:places', 'wx:settings', 'markets:appearance', 'fitness:appearance', 'inflight-theme'];
const seedApps = (p) => p.evaluate(async ({ app, phone }) => {
  for (const k of [...app, ...phone]) localStorage.setItem(k, JSON.stringify({ seeded: k }));
  const put = (name, store, rows) => new Promise((ok, no) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(store);
    r.onerror = () => no(r.error);
    r.onsuccess = () => { const db = r.result, tx = db.transaction(store, 'readwrite'); for (const [k, v] of rows) tx.objectStore(store).put(v, k); tx.oncomplete = () => { db.close(); ok(); }; tx.onerror = () => no(tx.error); };
  });
  await put('fitness', 'files', [['me:last', '{"acts":[1,2,3]}'], ['acct1/ride-7', 'bytes']]);
  await put('inflight', 'kv', [['session', { token: 'tok', me: { id: 'u77' } }], ['cache:u77', { chats: ['seeded'] }], ['outbox:u77', [{ sealed: true }]], ['drafts:u77', { a: 'sealed' }],
    ['pins:u77', { c1: 1 }], ['pinsup:u77', 1793700000000]]);
}, { app: APP_KEYS, phone: PHONE_KEYS });
const readApps = async (ctx) => {
  await ctx.route((u) => new URL(u).pathname === '/__kept', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>kept</title>' }));
  const q = await ctx.newPage();
  await q.goto(BASE + '/__kept');
  const got = await q.evaluate(async (keys) => {
    const keysOf = (name, store) => new Promise((ok) => {
      const r = indexedDB.open(name);
      r.onupgradeneeded = () => { r.transaction.abort(); };
      r.onerror = () => ok(null);
      r.onsuccess = () => { try { const db = r.result, q = db.transaction(store).objectStore(store).getAllKeys(); q.onsuccess = () => { db.close(); ok(q.result.map(String).sort()); }; } catch { ok(null); } };
    });
    return { left: keys.filter((k) => localStorage.getItem(k) !== null), fitness: await keysOf('fitness', 'files'), chat: await keysOf('inflight', 'kv') };
  }, [...APP_KEYS, ...PHONE_KEYS]);
  await q.close();
  return got;
};
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
  ok(await p.waitForSelector('#today[data-phase="midday"]', { timeout: 10000 }).catch(() => null), 'the day drawn by day.js (its phase marked)');
  const bar = await p.$eval('#tabs', (n) => { const r = n.getBoundingClientRect(), cs = getComputedStyle(n); return { pos: cs.position, bottom: innerHeight - r.bottom, h: r.height, vt: cs.viewTransitionName }; });
  ok(bar.pos === 'fixed' && bar.bottom >= 0 && bar.bottom < 40 && bar.h >= 44, 'the tab bar sits at the foot, fixed', JSON.stringify(bar));
  same(bar.vt, 'ifl-tabs', 'and stays put as pages cross-fade (view-transition-name)');
  await p.screenshot({ path: `${OUT}/today-390-dark.png` });
  await p.evaluate(() => { window.__same = 1; });
  await p.click('#tabs [data-tab="apps"]');
  await p.waitForSelector(`#apps:not([hidden]) ${TILE}`);
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
  const f = await p.$eval('iframe[name="ifl-chat"]', (n) => { const box = n.parentElement, cs = getComputedStyle(n), r = n.getBoundingClientRect();
    return { src: n.getAttribute('src'), cls: n.className, box: `${box.tagName.toLowerCase()}.${box.className}`, open: box.open, hidden: n.hidden || box.hidden, display: cs.display, boxDisplay: getComputedStyle(box).display,
      vis: cs.visibility, pe: cs.pointerEvents, pos: getComputedStyle(box).position, size: r.width === innerWidth && r.height === innerHeight }; });
  same(f, { src: '/chats/?engine=1', cls: 'ifl-engine', box: 'dialog.ifl-engine-box', open: false, hidden: false, display: 'block', boxDisplay: 'block', vis: 'hidden', pe: 'none', pos: 'fixed', size: true },
    'Chat’s engine made once the day’s drawn: its own page in a dialog of its own, shut, laid out over the whole page (never display: none), unseen and never in the way of a tap');
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

// ======================================================================= the engine's sheet, over the page
// (a Send: Chat's sheet shown over the page, in the top layer, over a modal sheet of the page's own as Weather's and
// Fitness's are; the engine's own word, through the parent's window (§8.2), puts it away again)
const engineState = (p) => p.evaluate(() => {
  const box = document.querySelector('dialog.ifl-engine-box'), f = box.querySelector('iframe'), cs = getComputedStyle(f), r = f.getBoundingClientRect();
  return { open: box.open, modal: box.matches(':modal'), display: cs.display, vis: cs.visibility, pe: cs.pointerEvents, tapped: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === f };
});
const SHOWN = { open: true, modal: true, display: 'block', vis: 'visible', pe: 'auto', tapped: true }, AWAY = { open: false, modal: false, display: 'block', vis: 'hidden', pe: 'none', tapped: false };
await part('the engine’s sheet', async () => {
  await mode({ phase: 'midday' });
  const { ctx, p } = await open();
  await p.waitForFunction(() => document.querySelector('iframe[name="ifl-chat"]')?.contentWindow?.IFLChat, null, { timeout: 10000 });
  ok(await p.evaluate(() => window.IFL?.hub?.on === true && typeof window.IFL.hub.sent === 'function'), 'window.IFL: the page’s own IFL, at the hub (a const in a module never is)');
  await p.evaluate(() => { const d = document.createElement('dialog'); d.id = 'mine'; d.innerHTML = '<p>A sheet of the page’s own</p><button type="button">OK</button>'; document.body.append(d); d.showModal(); });
  same(await p.evaluate(() => window.IFL.hub.send('London today: rain from 15:00', 'eyJ2IjoxfQ', {})), true, 'Send through the engine');
  same(await p.evaluate(() => window.__shared), ['London today: rain from 15:00', 'eyJ2IjoxfQ', {}], 'the card handed to the engine’s sheet');
  same(await engineState(p), SHOWN, 'its sheet over the page: in the top layer, over the page’s own modal sheet, and the one thing a tap reaches');
  await p.frame({ name: 'ifl-chat' }).evaluate(() => window.finish('Sent to Pat'));
  await p.waitForSelector('.ifl-toast.on', { timeout: 5000 });
  same(await engineState(p), AWAY, 'parent.IFL.hub.sent(): put away (still laid out), never left over the page');
  same(await text(p, '.ifl-toast'), 'Sent to Pat. You’re still here', 'and the toast');
  ok(await p.evaluate(() => document.getElementById('mine').matches(':modal')), 'the page’s own sheet still there beneath');
  await p.evaluate(() => { document.getElementById('mine').close(); return window.IFL.hub.send('Just words', null); });
  same(await engineState(p), SHOWN, 'shown again for another');
  await p.frame({ name: 'ifl-chat' }).evaluate(() => window.finish());
  same(await engineState(p), AWAY, 'parent.IFL.hub.closed(): put away');
  await p.click('#tabs [data-tab="apps"]');
  await p.waitForSelector(`#apps:not([hidden]) ${TILE}`);
  ok(true, 'and the page takes taps again');
  await ctx.close();
});

// ======================================================================= day.js and the cards: the page's own hub
// (day.js stood in for, saying what the page hands it; then batch TP's own, where it's in)
const DAY_PROBE = `export function drawDay(root, answer, ctx) {
  root.dataset.phase = answer?.phase || "";
  const h = ctx.hub;
  root.dataset.got = JSON.stringify({ on: h?.on === true, degraded: !!h?.degraded, window: !!h && h === window.IFL?.hub, radar: h ? h.go("/weather/#radar") : null, timers: ctx.timers, call: typeof ctx.call });
  delete root.dataset.stopped;
}
export function phaseAt(a) { return a?.phase; }
export function tickDay() {}
export function stopDay(root) { root.dataset.stopped = "1"; }`;
await part('the day gets the page’s own hub', async () => {
  await mode({ phase: 'midday' });
  const probe = async (c) => c.route((u) => new URL(u).pathname === '/day.js', (r) => r.fulfill({ contentType: 'text/javascript', body: DAY_PROBE }));
  for (const hub of [true, false]) {
    const { ctx, p } = await open({ hub, setup: probe });
    await p.waitForSelector('#today[data-got]', { timeout: 10000 });
    same(JSON.parse(await p.$eval('#today', (n) => n.dataset.got)), { on: true, degraded: !hub, window: true, radar: hub ? '/weather/#radar' : 'https://weather.inflite.ai/#radar', timers: false, call: 'function' },
      hub ? 'day.js handed the page’s own hub (the hub’s paths), the page’s requests, and no timers of its own' : 'degraded: the same hub, the apps’ own addresses');
    if (hub) {
      // (signed out, as the worker says: the day let go, nothing more timed or drawn from it)
      await p.evaluate(() => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { ifl: 'signedout' } })));
      await p.waitForSelector('#out:not([hidden]) #signin');
      same(await p.$eval('#today', (n) => [n.dataset.stopped, n.dataset.phase ?? null]), ['1', null], 'signed out: the day let go (stopDay), its phase gone');
    }
    await ctx.close();
  }
  // (the four cards, an answer without v: handed the hub too, which batch TP's cards.js uses for Send)
  if (TP_CARDS) {
    await mode({ v1: true });
    const { ctx, p } = await open();
    await p.waitForFunction(() => document.querySelectorAll('#rest .tcard[data-state="ok"]').length === 4);
    ok(await p.$eval('#rest .tcard[data-app="weather"] [data-send]', (n) => n.tagName === 'BUTTON'), 'the four cards at the hub: Send a button, through the engine');
    await ctx.close();
  } else console.log('SKIP  the four cards’ Send at the hub: batch TP’s cards.js isn’t in yet');
  if (!TP_DAY) { console.log('SKIP  batch TP’s day.js with the page’s own hub: it isn’t in yet'); return; }
  await mode({ phase: 'midday' });
  let { ctx, p } = await open();
  await p.waitForSelector('#today[data-phase="midday"] #top a[data-do="open"]', { timeout: 10000 });
  same(await p.$eval('#top a[data-do="open"]', (a) => a.getAttribute('href')), '/weather/#radar', 'day.js at the hub: Radar at /weather/#radar, in the one window');
  ok(await p.$('#top button[data-send]'), 'day.js at the hub: the top card’s Send a button');
  await p.waitForFunction(() => document.querySelector('iframe[name="ifl-chat"]')?.contentWindow?.IFLChat, null, { timeout: 10000 });
  await p.click('#top button[data-send]');
  await p.waitForFunction(() => document.querySelector('dialog.ifl-engine-box')?.open, null, { timeout: 5000 });
  same((await p.evaluate(() => window.__shared))?.[0], MIDDAY.tops.midday.share, 'its Send: the engine’s sheet over the page, with the card’s words');
  await p.frame({ name: 'ifl-chat' }).evaluate(() => window.finish('Sent to Pat'));
  same(await engineState(p), AWAY, 'and put away by the engine’s word');
  await ctx.close();
  ({ ctx, p } = await open({ hub: false }));
  await p.waitForSelector('#today[data-phase="midday"] #top a[data-do="open"]', { timeout: 10000 });
  same(await p.$eval('#top a[data-do="open"]', (a) => a.getAttribute('href')), 'https://weather.inflite.ai/#radar', 'day.js degraded: Radar at Weather’s own address');
  ok(/^https:\/\/chat\.inflite\.ai\/#share=/.test(await p.$eval('#top a[data-send]', (a) => a.getAttribute('href')).catch(() => '')), 'degraded: the top card’s Send Chat’s own #share= link');
  await ctx.close();
});

// ======================================================================= Apps
await part('apps', async () => {
  await mode({ phase: 'midday' });
  let { ctx, p } = await open({ path: '/#apps' });
  await p.waitForSelector(`#apps:not([hidden]) ${TILE}`);
  const tiles = await tilesOf(p);
  same(tiles.map((t) => [t.app, t.name, t.line, t.href]), [['weather', 'Weather', MIDDAY.apps.weather, '/weather/'], ['fitness', 'Fitness', MIDDAY.apps.fitness, '/fitness/'], ['markets', 'Markets', MIDDAY.apps.markets, '/markets/']], 'a tile for each app, its line from the day, opening it here; no Mail');
  same(tiles[0].chips, [['Radar', '/weather/#radar'], ['Warnings', '/weather/#warnings']], 'Weather’s sections');
  same(tiles[2].chips.map((c) => c[1]), ['/markets/#today', '/markets/#holdings', '/markets/#news'], 'Markets’ sections');
  has(await text(p, '.apps-note'), 'Their news reaches you on Today. Any card can be sent to a friend.', 'the word under the tiles');
  ok(await p.$eval(`${TILE.replace('[data-app]', '[data-app=weather]')} img`, (i) => i.complete && i.naturalWidth > 0).catch(() => false), 'each tile’s icon');
  await p.screenshot({ path: `${OUT}/apps-390-dark.png` });
  await ctx.close();
  await mode({ phase: 'midday', admin: true });
  ({ ctx, p } = await open({ path: '/#apps', scheme: 'light' }));
  await p.waitForSelector(`#apps:not([hidden]) ${TILE}`);
  const all = await tilesOf(p);
  same(all.map((t) => t.app), ['weather', 'fitness', 'markets', 'mail'], 'Mail’s tile for its account (apps.mail)');
  same([all[3].line, all[3].href], ['For you only', '/mail/'], 'Mail: For you only, at /mail/');
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
  for (const w of ['Friends and Groups', 'Never the words', 'Weather', ROOF ? 'Rain and warnings for the places you choose' : 'Warnings always', 'Markets', 'Fitness', 'In Today’s morning', 'Today’s Morning', '07:00']) has(notify, w, `Notifications, by App: “${w}”`);
  ok(!notify.includes('Mail'), 'no Mail row but for Mail’s account');
  if (ROOF) same(await p.$$eval('#youNotify [aria-pressed="true"]', (bs) => bs.map((x) => x.textContent)), ['All', 'Alerts'], 'Friends and Groups All, Markets’ Alerts (Weather’s in its own sheet)');
  else same(await p.$$eval('#youNotify [aria-pressed="true"]', (bs) => bs.map((x) => x.textContent)), ['All', 'All', 'Alerts'], 'Friends and Groups All, Weather’s rain All, Markets’ Alerts');
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
  if (!ROOF) {
    await p.click('#youNotify [data-rain="off"]');
    await p.waitForTimeout(500);
    same((await sent('PATCH', 'notify')).at(-1), { weather: { place: { lat: 51.5072, lon: -0.1276, name: 'London', rain: false } } }, 'Weather’s rain Off: PATCH { weather: { place } }');
  }
  await p.selectOption('#youQfrom', '22');
  await p.waitForTimeout(500);
  same((await sent('PATCH', 'notify')).at(-1), { quiet: { on: true, from: 22, to: 6, tz: 'Europe/London' } }, 'Quiet Hours: PATCH { quiet: { on, from, to, tz } }');
  await p.click(`#youDevices [data-stop="${DEVICES.devices[1].id}"]`);
  await p.waitForFunction((id) => !document.querySelector(`#youDevices [data-dev="${id}"]`), DEVICES.devices[1].id);
  same(await sent('DELETE', 'devices'), [{ id: DEVICES.devices[1].id }], 'Stop There: DELETE /api/devices { id }, and its row gone');
  // Get Every App's Notifications Here: nothing until its own tap
  same(await sent('POST', 'device'), [], 'nothing fanned out yet');
  await p.click('#youEvery');
  await p.waitForSelector(sheetOpen('sh-every'));
  await p.waitForTimeout(500);
  const sheet = await text(p, '#sh-every');
  has(sheet, 'Chats, Weather and Markets will notify you here as well.', 'the sheet says what changes');
  for (const d of [DEVICES.devices[0], DEVICES.devices[2]]) has(sheet, d.label, `and lists ${d.label}, still getting them`);
  same(await p.$$eval('#sh-every [data-stop]', (bs) => bs.length), 2, 'each with Stop There');
  same(await sent('POST', 'device'), [], 'opening the sheet sends nothing');
  await p.screenshot({ path: `${OUT}/every-390-dark.png` });
  await p.click('#evGo');
  await p.waitForFunction((s) => !document.querySelector(s), sheetOpen('sh-every'));
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
  // (off: out of every table, and off it stays, drawn again and after a reload, though the browser keeps the subscription)
  const settled = (on) => p.waitForFunction((on) => { const i = document.querySelector('#youPhone input'); return i && !i.disabled && i.checked === on; }, on, { timeout: 15000 });
  await reset();
  await p.click('#youPhoneRow');
  await settled(false);
  await p.waitForTimeout(1500);
  same((await sent('DELETE', 'device')), [{ endpoint: FAKE_ENDPOINT }], 'turning it off: DELETE /api/device { endpoint }');
  ok(!(await p.isChecked('#youPhone input')), 'and off it stays, drawn again from the account');
  same(await p.evaluate(() => [!!localStorage.getItem('fakesub'), localStorage.getItem('today:push')]), [true, null], 'the subscription kept for one tap on, this browser’s word of it gone');
  await p.reload();
  await p.waitForSelector('#youPhone input');
  await p.waitForTimeout(2000);
  ok(!(await p.isChecked('#youPhone input')), 'off after a reload too');
  // (on again: one tap, through the device route)
  await reset();
  await p.click('#youPhoneRow');
  await settled(true);
  await p.waitForTimeout(500);
  same((await sent('POST', 'device')).map((x) => x.sub?.endpoint), [FAKE_ENDPOINT], 'on again: POST /api/device');
  // (Sign Out, from You: this phone out of every table, Chat signed out here (the engine), then the account, then the
  // sign-in page (§11.5))
  await p.waitForFunction(() => document.querySelector('iframe[name="ifl-chat"]')?.contentWindow?.IFLChat, null, { timeout: 10000 });
  await reset();
  chatOut.length = 0;
  await p.route('https://auth.inflite.ai/**', (r) => r.fulfill({ body: 'auth', contentType: 'text/html' }));
  await seedApps(p);
  await p.click('#youOut');
  await p.waitForURL(/auth\.inflite\.ai/);
  const h = new URLSearchParams(new URL(p.url()).hash.slice(1));
  same([h.get('signout'), h.get('back')], ['today', `${BASE}/`], 'Sign Out ends at #signout=today&back=…');
  const kept = await readApps(ctx);
  same(kept.left, PHONE_KEYS, 'Sign Out lets go of every app’s copy of you kept here (Markets’ holdings, Weather’s account, Fitness’s, Chat’s), and keeps the phone’s own (Weather’s places and settings, each app’s look)');
  same(kept.fitness, [], 'and Fitness’s copies of your files and of you (IndexedDB), as its own Sign Out does');
  same(kept.chat, ['cache:u77', 'drafts:u77', 'outbox:u77', 'pins:u77', 'pinsup:u77', 'session'], 'Chat’s own sign-in left to Chat, whose engine signed out here');
  const out = await reqs(), del = out.findIndex((e) => e.method === 'DELETE' && e.path.endsWith('/today/device')), so = out.findIndex((e) => e.path.endsWith('/signout'));
  ok(del >= 0 && so > del, 'DELETE /api/device first, then signed out');
  same(JSON.parse(out[del]?.body || '{}'), { endpoint: FAKE_ENDPOINT }, 'DELETE /api/device { endpoint }');
  ok(chatOut.length === 1 && out[del].at <= chatOut[0] && chatOut[0] <= out[so].at, 'Chat signed out here by its engine (IFLChat.signOut), after this phone’s gone and before the account', JSON.stringify({ chatOut, del: out[del]?.at, so: out[so]?.at }));
  await ctx.close();
});

// ======================================================================= stage 3: Chats in the page (HOST, S3-D6, S3-D14)
// With /api/hub's apps.chats, Today asks Chats' service (MAIN's pigeon/roof/service.js, as the hub serves it, B0's or
// CORE's) through IFL.hub.chat, never Chat's engine: the core here is a stand-in Worker (CHAT_CORE) answering what the
// facade asks, Pat's words for Waiting for You among them, locking itself once asked to, and on signOut writing a marker
// into Chat's own store (so it's seen that the core signed out before Today let go of Chat's store)
const CHATS3 = ROOF && /\bchats: fz\(\{/.test(readFileSync(`${IFL}today/public/roof/router.js`, 'utf8'));
const SAID = 'Coffee at the usual place?';
const CHAT_CORE = (o) => `const O = ${JSON.stringify(o)};
let state = "ready";
const patch = (topic, data) => postMessage({ t: "patch", topic, data });
const mark = () => new Promise((ok) => { const r = indexedDB.open("inflight"); r.onsuccess = () => { try { const tx = r.result.transaction("kv", "readwrite"); tx.objectStore("kv").put(Date.now(), "core-out"); tx.oncomplete = () => ok(); tx.onerror = () => ok(); } catch (_) { ok(); } }; r.onerror = () => ok(); });
addEventListener("message", async (e) => {
  const { id, m, a = [] } = e.data || {};
  let v = { ok: true };
  if (m === "hello") v = { protocol: 1 };
  else if (m === "start" || m === "state") v = { state };
  else if (m === "waiting") { v = state === "ready" ? O.waiting.filter((w) => (a[0]?.ids || []).includes(w.id)) : []; if (O.lockAfter) setTimeout(() => { state = "locked"; patch("state", { state }); }, O.lockAfter); }
  else if (m === "since") v = null;
  else if (m === "signOut") { await mark(); v = { ok: true }; }
  postMessage({ id, ok: true, v });
  if (m === "start") patch("state", { state });
});`;
const chatsFiles = (o) => async (ctx) => {
  const page = await (await fetch(`${BASE}/`)).text();
  await ctx.route((u) => /^\/chats\/(index\.html)?$/.test(new URL(u).pathname) && !new URL(u).searchParams.has('engine'), (r) => r.fulfill({ contentType: 'text/html', body: page, headers: { 'Cache-Control': 'no-cache' } }));
  await ctx.route((u) => /^\/chats\/(roof\/)?[\w-]+\.(js|css)$/.test(new URL(u).pathname), (r) => {
    const f = new URL(r.request().url()).pathname.slice('/chats/'.length);
    if (f === 'roof/core.js') return r.fulfill({ contentType: 'text/javascript', body: CHAT_CORE(o) });
    if (!existsSync(`${MAIN}pigeon/${f}`)) return r.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' });
    return r.fulfill({ contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript', body: readFileSync(`${MAIN}pigeon/${f}`, 'utf8') });
  });
  await ctx.route((u) => new URL(u).pathname === '/chats/version', (r) => r.fulfill({ json: { build: '1.69' }, headers: { 'Cache-Control': 'no-store' } }));
};
await part('Chats in the page', async () => {
  if (!CHATS3) return console.log('SKIP  Chats in the page: the inflite repo beside has no REGISTRY.chats (before stage 3)');
  await mode({ phase: 'midday' }); await reset();
  const at = MIDDAY.waiting?.[0]?.at, pat = MIDDAY.waiting?.[0]?.id;
  const { ctx, p } = await open({ apps: { weather: true, chats: true }, phone: true, setup: chatsFiles({ waiting: [{ id: pat, first: 'Pat', at, said: SAID, kind: 'question', topics: [] }], lockAfter: 1500 }) });
  await p.waitForSelector('#today #waiting .dw-words.in:not([hidden])', { timeout: 20000 });
  same(await text(p, '#today #waiting .dw-words'), `“${SAID}”`, 'Waiting for You’s words from Chats’ service');
  same(await p.$$eval('iframe[name="ifl-chat"], dialog.ifl-engine-box', (n) => n.length), 0, 'no engine: no iframe, no dialog');
  same(p.workers().map((w) => new URL(w.url()).pathname), ['/chats/roof/core.js'], 'one Worker: Chats’ core');
  // (the core locked by the app lock: every word of Chat's gone from Today at once)
  await p.waitForFunction(() => [...document.querySelectorAll('#today .dw-words, #today .dt-said')].every((n) => n.hidden && !n.textContent), null, { timeout: 5000 });
  ok(!(await text(p, '#today')).includes(SAID), 'locked: Pat’s words gone from Today');
  await ctx.close();
  // (Sign Out with Chats here: the core signs out (its marker) and is ended, then Chat's sign-in and kept chats go here
  // too; what you'd written, sealed, stays)
  const o2 = await open({ apps: { weather: true, chats: true }, phone: true, path: '/#you', setup: chatsFiles({ waiting: [] }) });
  await o2.p.waitForSelector('#youOut');
  await o2.p.route('https://auth.inflite.ai/**', (r) => r.fulfill({ body: 'auth', contentType: 'text/html' }));
  await seedApps(o2.p);
  await reset();
  await o2.p.click('#youOut');
  await o2.p.waitForURL(/auth\.inflite\.ai/);
  const kept = await readApps(o2.ctx);
  same(kept.left, PHONE_KEYS, 'Sign Out lets go of every app’s copy of you, as without Chats');
  same(kept.chat, ['core-out', 'drafts:u77', 'outbox:u77'], 'the core signed out (its marker), and Chat’s sign-in, kept chats and pins gone here; sealed drafts and outbox kept');
  await o2.ctx.close();
});

// ======================================================================= the way in
await part('the way in', async () => {
  await mode({ mode: 'out' });
  let { ctx, p } = await open({ signedIn: false });
  ok(await p.isVisible('#signinToday'), 'Sign In Without Chats, quietly, beside Sign in');
  const THEN = ROOF ? '/chats/#signin-start&then=%2F' : '/chats/#signin-start&then=/';
  same(await p.$eval('#signin', (a) => a.getAttribute('href')), THEN, 'Sign in: Chats’ trip, which signs in everything, back to here');
  await p.click('#signin');
  await p.waitForURL(/\/chats\//);
  same(new URL(p.url()).pathname + new URL(p.url()).hash, THEN, `Sign in goes to ${THEN}`);
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
  ok(await p.waitForSelector('#today[data-phase="midday"]', { timeout: 10000 }).catch(() => null), 'Today’s own day still drawn');
  ok(await p.evaluate(() => window.IFL?.hub?.degraded === true), 'IFL.hub, degraded, on the window all the same');
  await p.waitForTimeout(3500);
  same(await p.$$eval('iframe[name="ifl-chat"]', (fs) => fs.length), 0, 'no engine');
  await p.click('#tabs [data-tab="apps"]');
  await p.waitForSelector(`#apps:not([hidden]) ${TILE}`);
  const own = await tilesOf(p);
  same(own.map((t) => t.href), ['https://weather.inflite.ai/', 'https://fitness.inflite.ai/', 'https://finance.inflite.ai/'], 'the tiles: the apps’ own addresses');
  same(own[0].chips[0]?.[1], 'https://weather.inflite.ai/#radar', 'and their sections');
  await p.click('#tabs [data-tab="you"]');
  await p.waitForSelector('#youRules .rule');
  ok(!(await p.$('#youEvery')) && !(await text(p, '#you')).includes('Every App'), 'You: no Get Every App’s Notifications Here');
  ok(!(await p.$('#youDevices')), 'You: no Other Devices');
  ok(await p.$('#youNotify') && await p.$('#youRules'), 'the rest of You as ever');
  ok(await p.evaluate(() => sessionStorage.getItem('ifl-hub-ready') === '0'), 'the answer kept for the visit');
  // (Sign Out with no engine to sign Chat out: Today lets go of Chat's sign-in and its kept chats here itself, as
  // Chat's forget does; what was written and not sent stays, sealed)
  await p.route('https://auth.inflite.ai/**', (r) => r.fulfill({ body: 'auth', contentType: 'text/html' }));
  await seedApps(p);
  await p.click('#youOut');
  await p.waitForURL(/auth\.inflite\.ai/);
  const kept = await readApps(ctx);
  same(kept.left, PHONE_KEYS, 'not ready: Sign Out lets go of every app’s copy of you kept here all the same');
  same(kept.fitness, [], 'and Fitness’s files');
  same(kept.chat, ['drafts:u77', 'outbox:u77'], 'and, with no engine, Chat’s sign-in, its kept chats and its pins the account keeps too (pinsup); what wasn’t sent stays, sealed');
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
  // (off: DELETE /api/push after the device route's 404, and off it stays, after a reload too (the morning's thisDevice))
  await reset();
  await p.click('#youPhoneRow');
  await p.waitForFunction(() => { const i = document.querySelector('#youPhone input'); return i && !i.disabled && !i.checked; }, null, { timeout: 15000 });
  await p.waitForTimeout(1500);
  const off = await reqs(), d1 = off.findIndex((e) => e.method === 'DELETE' && e.path.endsWith('/today/device')), d2 = off.findIndex((e) => e.method === 'DELETE' && e.path.endsWith('/today/push'));
  ok(d1 >= 0 && d2 > d1 && JSON.parse(off[d2].body).endpoint === FAKE_ENDPOINT, 'v1 off: DELETE /api/push { endpoint } after the device route’s 404');
  ok(!(await p.isChecked('#youPhone input')), 'v1: off it stays');
  await p.reload();
  await p.waitForFunction(() => document.querySelectorAll('#rest .tcard[data-state="ok"]').length === 4);
  await p.click('#tabs [data-tab="you"]');
  await p.waitForSelector('#youPhone input');
  await p.waitForTimeout(1500);
  ok(!(await p.isChecked('#youPhone input')), 'v1: off after a reload');
  await reset();
  await p.click('#youPhoneRow');
  await p.waitForFunction(() => { const i = document.querySelector('#youPhone input'); return i && !i.disabled && i.checked; }, null, { timeout: 15000 });
  ok((await reqs()).some((e) => e.method === 'POST' && e.path.endsWith('/today/push')), 'v1: on again, through /api/push');
  await ctx.close();
});

// ======================================================================= privacy: nothing of Markets' money or a Chat place kept
await part('kept', async () => {
  for (const m of [{ mode: 'ok' }, { phase: 'midday' }]) {
    await mode(m);
    const { ctx, p } = await open();
    await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.startsWith('today:cards:')), null, { timeout: 10000 });
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

// ======================================================================= pages that cross-fade: at the hub only
// (menu.css asks every page for the cross-fade, as an at-rule can't be kept to html.ifl-hub; menu.js lets it go on each
// page off the hub as it's left and as it opens. Pages of an app's own, stood in for with the real menu.css and menu.js,
// off the hub and then with the hub's marker: off it, both transitions let go, quietly; at it, kept between the hub's
// own pages. And at it, never one called off out loud: one bound for a page that isn't the hub's (it doesn't ask for
// the cross-fade, and would say so as an error there) is let go as it's left; one a page opens with is caught as it
// starts, should that page stop asking for it before it's shown)
await part('cross-fade at the hub only', async () => {
  const SITE = 'http://app.offhub.test';
  // (/a and /b with menu.js; /c asks for the cross-fade but has no menu.js, and goes to /d, which has. At the hub's own
  // paths, /weather/ goes to /markets/; /fitness/ to /x, which isn't the hub's and doesn't ask for it; /chats/ to
  // /mail/, which drops its stylesheet (and the asking) as it opens)
  const LINK = { '/a': '/b', '/c': '/d', '/weather/': '/markets/', '/fitness/': '/x', '/chats/': '/mail/' };
  const PAGE = (marker, path) => path === '/x' ? '<!doctype html><html><head><meta charset="utf-8"><title>Not the hub’s</title></head><body><p>Not the hub’s</p></body></html>'
    : `<!doctype html><html><head><meta charset="utf-8"><title>App</title>${marker ? '<meta name="ifl-hub" content="/">' : ''}<style id="menucss">${cssBlock()}</style>
<script>
  // (the transition each event brings, and whether it's let go: watched before menu.js's own listeners)
  const watch = (type, key) => addEventListener(type, (e) => { const t = e.viewTransition; sessionStorage.setItem(key, t ? 'kept' : 'none'); if (t) { const skip = t.skipTransition.bind(t); t.skipTransition = () => { sessionStorage.setItem(key, 'let go'); skip(); }; } });
  watch('pageswap', 'swap'); watch('pagereveal', 'reveal');
</script>${path === '/c' ? '' : `<script>${jsBlock()}</script>`}${path === '/mail/' ? '<script>document.getElementById("menucss").remove()</script>' : ''}</head><body><p>App</p><a id="next" href="${LINK[path] || '/a'}">Next</a></body></html>`;
  // (→ what each event did, and the page errors seen: any is an error no page's own script could have caught)
  const go = async (marker, from, to) => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.route(`${SITE}/**`, (r) => r.fulfill({ contentType: 'text/html', body: PAGE(marker, new URL(r.request().url()).pathname) }));
    const p = await ctx.newPage(), mine = [];
    p.on('pageerror', (e) => { mine.push(`${new URL(p.url()).pathname}: ${e.message}`); errs.push(`pageerror (${marker ? 'at' : 'off'} the hub): ${e.message}`); });
    p.on('console', (m) => { if (m.type() === 'error') errs.push(`${marker ? 'at' : 'off'} the hub: ${m.text()}`); });
    await p.goto(SITE + from);
    await p.evaluate(() => sessionStorage.clear());
    await p.click('#next');
    await p.waitForURL(SITE + to);
    await p.waitForTimeout(800);
    const got = await p.evaluate(() => ({ swap: sessionStorage.getItem('swap'), reveal: sessionStorage.getItem('reveal') }));
    await ctx.close();
    return { ...got, errors: mine };
  };
  same(await go(true, '/weather/', '/markets/'), { swap: 'kept', reveal: 'kept', errors: [] }, 'at the hub: the pages cross-fade (left and opened, kept)');
  const away = await go(true, '/fitness/', '/x');
  same([away.swap, away.errors], ['let go', []], 'at the hub: bound for a page that isn’t the hub’s, it’s let go as it’s left, and nothing says it was called off');
  same((await go(true, '/chats/', '/mail/')).errors, [], 'at the hub: a page that stops asking for it as it opens catches the one it opened with, quietly');
  const off = await go(false, '/a', '/b');
  ok(off.swap === 'let go' && off.reveal !== 'kept', 'off the hub: the page left lets the cross-fade go, so none is drawn', JSON.stringify(off));
  same((await go(false, '/c', '/d')).reveal, 'let go', 'off the hub: a page opened from one without menu.js lets it go as it opens');
  // (Today's own page with its module slow to come, as on a slow phone: the cross-fade it opens with is called off
  // before it's shown, and caught by fade.js as the page's head is read, before app.js (a module, run after) could.
  // Four times: without fade.js, nearly every one says so as an error (review-i1 I9))
  const slow = [];
  for (let i = 0; i < 4; i++) {
    const { ctx, p } = await open({ path: '/__fade', wait: false, setup: async (c) => {
      await c.route((u) => new URL(u).pathname === '/__fade', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"><title>From</title><style>@view-transition { navigation: auto; }</style></head><body><a id="next" href="/">Today</a></body></html>' }));
      await c.route((u) => new URL(u).pathname === '/app.js', async (r) => { await new Promise((go) => setTimeout(go, 1500)); await r.continue().catch(() => {}); });
    } });
    p.on('pageerror', (e) => slow.push(`${new URL(p.url()).pathname}: ${e.message}`));
    await p.waitForTimeout(300);
    await p.click('#next');
    await p.waitForURL(BASE + '/');
    await p.waitForSelector('#in:not([hidden]) #tabs .ifl-tab', { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(1000);
    await ctx.close();
  }
  same(slow, [], 'Today’s page with its app.js slow to come: the cross-fade it opened with, called off, says nothing (fade.js, read before the module)');
});

// ======================================================================= every size, light and dark: no sideways scroll, axe, no errors
await part('sizes', async () => {
  await mode({ phase: 'midday' });
  for (const [w, h] of [[390, 844], [320, 568], [844, 390]]) for (const scheme of ['light', 'dark']) for (const view of ['today', 'apps', 'you']) {
    const { ctx, p } = await open({ w, h, scheme, path: view === 'today' ? '/' : `/#${view}` });
    await p.waitForFunction((v) => !document.getElementById(v).hidden && (v !== 'you' || document.querySelector('#youRules .rule')) && (v !== 'apps' || document.querySelector('.ifl-tile[data-app], .atile')) && (v !== 'today' || document.querySelector('#today[data-phase]')), view);
    await p.waitForTimeout(300);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    ok(over <= 0, `${w}×${h} ${scheme} ${view}: no sideways scroll`, `${over}px`);
    // (the foot of the view clear of the tab bar, scrolled to the end)
    const clear = await p.evaluate((v) => { scrollTo(0, document.documentElement.scrollHeight); const kids = [...document.getElementById(v).querySelectorAll('*')].filter((n) => n.getClientRects().length); const last = Math.max(...kids.map((n) => n.getBoundingClientRect().bottom)); return document.getElementById('tabs').getBoundingClientRect().top - last; }, view);
    ok(clear >= 0, `${w}×${h} ${scheme} ${view}: its foot clear of the tab bar`, `${clear}px`);
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
