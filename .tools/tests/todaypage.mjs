// Today's page (the inflite repo's today/: its Worker and public files; since Today First, InFlite's one page: Today,
// Apps and You), end to end in real Chromium: its Worker run by wrangler dev on :8787 against a stand-in for the account
// (mocks/todaystub.mjs on :8789, answering from mocks/today/*.json in its version 1 modes), both started here and stopped
// by PID at the end. The Worker here has no hub key, so the page runs as Today did before the hub (degraded: the apps at
// their own addresses; todayshell.mjs has the hub's). Run by run.sh, or on its own:
//   node .tools/tests/todaypage.mjs [state dir] [screenshots dir]
// Checked: the way in (InFlite's shared one, its words for search engines, the apps between the name and Sign in never
// over either, the hand-back's address, Sign in as Today's own trip while the hub isn't ready); signing in by
// hand-back; no one's day drawn once signed out, at any moment; the hostile names as text; each card in each state (The
// Rest of Today, #rest), its links, Try Again; the requests the page makes; Edit; the morning with a stand-in push
// service (through the device route); the menu and Sign Out; and no CSP violation, console error or sideways scroll.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';

// (requests a service worker makes are routed too: Today's root worker fetches its own files)
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const HERE = new URL('./', import.meta.url).pathname;
const IFL = process.env.IFL_ROOT || new URL('../../../inflite/', import.meta.url).pathname;
const OUT = process.argv[3] || `${tmpdir()}/todaypage`;
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:8787', STUB = 'http://127.0.0.1:8789';
let fails = 0;
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${!c && extra ? '  — ' + extra : ''}`); if (!c) fails++; };
const same = (a, b, l) => ok(JSON.stringify(a) === JSON.stringify(b), l, `got ${JSON.stringify(a)?.slice(0, 400)}, wanted ${JSON.stringify(b)?.slice(0, 400)}`);
if (!existsSync(`${IFL}today/public/index.html`)) { console.log('SKIP  the inflite repo isn’t beside this one'); console.log('FAILS 0'); process.exit(0); }

const FIX = (f) => JSON.parse(readFileSync(new URL(`./mocks/today/${f}`, import.meta.url), 'utf8'));
const CARDS = FIX('cards.json'), EMPTY = FIX('cards.empty.json'), QUIET = FIX('cards.quiet.json'), SESSION = FIX('session.json');
const T0 = CARDS.at, TQ = QUIET.at, ME = SESSION.user.id, KEYS = ['weather', 'chat', 'fitness', 'markets'];
const BUILD = /const BUILD = "([\d.]+)"/.exec(readFileSync(`${IFL}today/public/app.js`, 'utf8'))[1];
const SESSION_COOKIE = 'account=stubsession0123456789abcdefABCDEF';
const FAKE_ENDPOINT = 'https://fcm.googleapis.com/fcm/send/today-phone';
// (day.css is batch TP's: until it's in, stood in for, empty, so the page's link to it isn't a broken one)
const NO_DAY_CSS = !existsSync(`${IFL}today/public/day.css`);

// ---- the stand-in account and Today's Worker ----
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
if (!(await up(`${STUB}/__log`)) || !(await up(`${BASE}/version`))) { console.log(wlog.slice(-2000)); ok(false, 'the stub and Today’s Worker start'); console.log(`FAILS ${fails}`); stop(); process.exit(1); }

const ctl = (path, body) => fetch(STUB + path, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }).then((r) => r.json());
const mode = (m) => ctl('/__mode', { mode: m });
const reqs = async () => (await ctl('/__log')).filter((e) => e.path.startsWith('/api/account/today/'));
const reset = () => ctl('/__reset', {});

// ---- the browser ----
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined) });
const errs = [];
async function open({ w = 390, h = 844, scheme = 'dark', time = T0, push = false, signedIn = true, path = '/', wait = true, watch = false } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, locale: 'en-GB', timezoneId: 'Europe/London', serviceWorkers: 'allow' });
  // (other cookies of the site's, which never go on to the account)
  await ctx.addCookies([{ name: 'theme', value: 'dark', url: BASE }, { name: 'known-device', value: 'abc123', url: BASE }, ...(signedIn ? [{ name: 'account', value: SESSION_COOKIE.split('=')[1], url: BASE }] : [])]);
  await ctx.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`)));
  if (NO_DAY_CSS) await ctx.route((u) => new URL(u).pathname === '/day.css', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  if (watch) await ctx.addInitScript(() => {
    // (any of the day's words, drawn at any moment from the first script on)
    const WORDS = ['Biscuit', 'Tempo 2 × 15', '20,862', 'pigeons on their way', 'Partly Cloudy', 'Rolls-Royce', 'Alex'];
    window.__seen = [];
    const look = (t) => { for (const x of WORDS) if (t && t.includes(x)) window.__seen.push(x); };
    new MutationObserver((ms) => { for (const m of ms) { for (const n of m.addedNodes) look(n.textContent); if (m.type === 'characterData') look(m.target.data); } }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  if (push) {
    await ctx.grantPermissions(['notifications'], { origin: BASE });
    // (headless Chromium has no push service: one stood in for, as the other apps' tests do)
    await ctx.addInitScript((endpoint) => {
      const make = () => ({ endpoint, toJSON: () => ({ endpoint, keys: { p256dh: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U', auth: 'tBHItJI5svbpez7KI4CCXg' } }), unsubscribe: async () => { localStorage.removeItem('fakesub'); return true; } });
      PushManager.prototype.getSubscription = async function () { return localStorage.getItem('fakesub') ? make() : null; };
      PushManager.prototype.subscribe = async function () { localStorage.setItem('fakesub', '1'); return make(); };
    }, FAKE_ENDPOINT);
  }
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource: (the server responded with a status of (40[14]|502)|net::ERR_INTERNET_DISCONNECTED)/.test(m.text())) errs.push(m.text()); });
  await p.clock.setFixedTime(new Date(time));
  await p.goto(BASE + path);
  if (wait) await (signedIn ? p.waitForSelector('#in:not([hidden]) .tcard[data-state]', { timeout: 15000 }) : p.waitForSelector('#out:not([hidden]) #signin'));
  return { ctx, p };
}
const text = (p, s) => p.$eval(s, (e) => e.innerText).catch(() => '');
const has = (hay, needle, l) => ok(hay.includes(needle), l, `“${needle}” not in “${hay.slice(0, 300)}”`);
// (ONLY=a,b: just the parts whose names have those in them)
const ONLY = process.env.ONLY?.split(',');
async function part(name, fn) { if (ONLY && !ONLY.some((o) => name.includes(o))) return; try { await fn(); } catch (e) { ok(false, name, e.stack?.split('\n').slice(0, 3).join(' | ')); } }
const sha = (s) => createHash('sha256').update(s).digest('base64url');

// ======================================================================= signed out: the way in
await part('signed out', async () => {
  await mode('out'); await reset();
  const { ctx, p } = await open({ signedIn: false });
  ok(await p.isVisible('#out.ifl-in .ifl-cta #signin') && await p.isVisible('#out.ifl-in .ifl-top'), 'signed out: InFlite’s shared way in');
  ok(!(await p.isVisible('#in')), 'signed out: no day drawn');
  same(await p.title(), 'InFlite Today', 'the title');
  const meta = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('meta[name], meta[property]')].map((m) => [m.getAttribute('name') || m.getAttribute('property'), m.content])));
  ok(/^Your day from InFlite’s apps on one page/.test(meta.description), 'the description');
  same([meta['og:title'], meta['og:image'], meta['og:url'], meta['twitter:card']], ['InFlite Today', 'https://inflite.ai/og.png', 'https://inflite.ai/', 'summary_large_image'], 'the og tags');
  same(await p.$eval('link[rel=canonical]', (l) => l.href), 'https://inflite.ai/', 'the canonical address');
  const apps = await p.$$eval('.today-apps a', (as) => as.map((a) => [a.textContent.trim(), a.href, a.getAttribute('aria-label')]));
  same(apps.map((a) => a.slice(0, 2)), [['Chat', 'https://chat.inflite.ai/'], ['Weather', 'https://weather.inflite.ai/'], ['Fitness', 'https://fitness.inflite.ai/'], ['Markets', 'https://finance.inflite.ai/']], 'the four apps, linked');
  ok(apps.every((a) => /^\w+: /.test(a[2])), 'each app says what it is');
  const asked = await reqs();
  same(asked.map((e) => `${e.method} ${e.path}`), ['GET /api/account/today/me'], 'the way in costs the account one request');
  ok(!(await p.isVisible('#signinToday')), 'the hub not ready here (no key): no second way in, Sign in is Today’s own trip');
  await p.screenshot({ path: `${OUT}/out-390-dark.png` });
  // (Sign in: to the sign-in page with the hash of a word kept in this tab, and the way back)
  await p.route('https://auth.inflite.ai/**', (r) => r.fulfill({ body: 'auth', contentType: 'text/html' }));
  await p.click('#signin');
  await p.waitForURL(/auth\.inflite\.ai/);
  let h = new URLSearchParams(new URL(p.url()).hash.slice(1));
  same([h.get('signin'), h.get('back'), /^[\w-]{43}$/.test(h.get('ask') || '')], ['today', `${BASE}/`, true], 'Sign in goes to …/#signin=today&ask=<43>&back=<Today>/');
  const ask = h.get('ask');
  await p.goto(`${BASE}/`);
  const verifier = await p.evaluate(() => sessionStorage.getItem('inflite:signin-verifier'));
  ok(verifier && sha(verifier) === ask, 'ask is the hash of the word kept in this tab');
  await p.waitForSelector('#out:not([hidden]) #signin');
  await p.click('#join');
  await p.waitForURL(/auth\.inflite\.ai/);
  h = new URLSearchParams(new URL(p.url()).hash.slice(1));
  same([h.get('join'), h.get('back')], ['today', `${BASE}/`], 'New here? goes to …/#join=today');
  await ctx.close();
});

await part('the apps between the name and Sign in', async () => {
  await mode('out');
  for (const [w, h, shown] of [[320, 568, null], [360, 640, null], [390, 844, true], [820, 1180, true], [568, 320, false]]) {
    const { ctx, p } = await open({ w, h, signedIn: false });
    const m = await p.evaluate(() => {
      const r = (e) => e.getBoundingClientRect();
      const nav = document.querySelector('.today-apps'), on = getComputedStyle(nav).display !== 'none';
      const kids = [...nav.children].filter((k) => on && getComputedStyle(k).display !== 'none' && r(k).height > 0).map((k) => [r(k).top, r(k).bottom]);
      const top = r(document.querySelector('.ifl-top')), cta = Math.min(r(document.querySelector('.ifl-cta')).top, r(document.querySelector('.ifl-brand')).top);
      return { kids, top: top.bottom, cta };
    });
    const over = m.kids.some(([t, bt]) => t < m.top || bt > m.cta);
    ok(!over, `${w}×${h}: what InFlite is never over the name or Sign in`, JSON.stringify(m));
    if (shown !== null) ok(!!m.kids.length === shown, `${w}×${h}: the apps ${shown ? 'shown' : 'left out (too short)'}`, JSON.stringify(m));
    ok(m.kids.length === 0 || m.kids.length === 2, `${w}×${h}: what InFlite is, with the apps, or neither`, JSON.stringify(m));
    if (w === 320) await p.screenshot({ path: `${OUT}/out-320.png` });
    await ctx.close();
  }
});

await part('robots, sitemap, 404', async () => {
  same(await (await fetch(`${BASE}/robots.txt`)).text(), 'User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /chats/\nDisallow: /weather/\nDisallow: /fitness/\nDisallow: /markets/\nDisallow: /mail/\nSitemap: https://inflite.ai/sitemap.xml\n', 'robots.txt');
  ok((await (await fetch(`${BASE}/sitemap.xml`)).text()).includes('<loc>https://inflite.ai/</loc>'), 'sitemap.xml');
  const { ctx, p } = await open({ signedIn: false, wait: false, path: '/nope' });
  const r = await p.goto(`${BASE}/nope`);
  same(r.status(), 404, '/nope answers 404');
  has(await text(p, 'body'), 'This page isn’t here', '/nope is 404.html');
  ok(await p.$('a[href="/"]'), '404.html links home');
  await ctx.close();
  const v = await (await fetch(`${BASE}/version`)).json();
  same(v, { build: BUILD, min: null }, '/version answers BUILD');
});

// ======================================================================= signing in by hand-back
await part('hand-back', async () => {
  await mode('out'); await reset();
  const { ctx, p } = await open({ signedIn: false });
  await p.evaluate(() => sessionStorage.setItem('inflite:signin-verifier', 'v'.repeat(43)));
  // (back from the sign-in page: a page of its own, as it comes from auth's address)
  await p.goto('about:blank');
  await p.goto(`${BASE}/#signin=goodcode123&face=1`);
  await p.waitForSelector('#in:not([hidden]) .tcard[data-state]');
  const hb = (await reqs()).find((e) => e.path.endsWith('/handback'));
  same(hb && JSON.parse(hb.body), { code: 'goodcode123', verifier: 'v'.repeat(43) }, 'the stub sees {code, verifier}');
  ok((await ctx.cookies(BASE)).some((c) => c.name === 'account'), 'the account’s Set-Cookie is relayed');
  same(await p.evaluate(() => location.hash), '', 'the code is taken out of the address');
  ok(await p.evaluate(() => sessionStorage.getItem('inflite:signin-verifier') === null), 'the word is used once');
  has(await text(p, '#hd'), 'Today', 'signed in: the header');
  await ctx.close();
});

// ======================================================================= signed out after signed in: no one's day, ever
await part('signed out after signed in', async () => {
  await mode('ok');
  const { ctx, p } = await open({ watch: true });
  await p.waitForFunction(() => document.querySelectorAll('.tcard[data-state="ok"]').length === 4);
  ok(await p.evaluate((id) => !!localStorage.getItem(`today:cards:${id}`) && !!localStorage.getItem('today:session'), ME), 'signed in: the day kept in this browser, for this account');
  await p.clock.setFixedTime(new Date(T0 + 15 * 60e3));
  // (the account answering with an error (the Worker's 502): no one's day, in a tab or on the Home Screen alike, as
  // another app may have signed out meanwhile; and nothing taken away, for when it answers)
  const nothingDrawn = async (l) => {
    await p.waitForSelector('#out:not([hidden]) #signin');
    await p.waitForTimeout(800);
    same(await p.evaluate(() => window.__seen), [], `${l}: no card text drawn at any moment`);
    ok(!(await p.isVisible('#in')), `${l}: no day drawn`);
    return text(p, '#outSaid');
  };
  await mode('down');
  await p.reload();
  has(await nothingDrawn('the account answering 502, in a tab'), 'Couldn’t reach', 'the account answering 502, in a tab: said so');
  // (no answer at all, in a tab: still no one's day)
  await mode('ok');
  await ctx.route('**/api/**', (r) => r.abort('internetdisconnected'));
  await p.reload();
  has(await nothingDrawn('no network, in a tab'), 'Couldn’t reach InFlite just now', 'no network, in a tab: said so');
  ok(await p.evaluate((id) => !!localStorage.getItem(`today:cards:${id}`), ME), 'no network, in a tab: the copy still kept, for when it answers');
  // (no answer at all, in a Home Screen Today, whose sign-in no other app can end: the kept copy, said when it's from)
  await ctx.addInitScript(() => Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true }));
  await p.reload();
  await p.waitForSelector('#in:not([hidden]) .tcard[data-state="ok"]');
  has(await text(p, '#rest'), 'Tempo 2 × 15', 'no network, on the Home Screen: the copy kept here is drawn');
  same(await text(p, '#kept'), 'Updated 08:10', 'and marked when it’s from');
  // (the account answering with an error, on the Home Screen: no one's day either)
  await ctx.unroute('**/api/**');
  await mode('down');
  await p.reload();
  await nothingDrawn('the account answering 502, on the Home Screen');
  // (signed out elsewhere: reloaded, nothing of the day at any moment, and nothing kept)
  await mode('out');
  await p.reload();
  await p.waitForSelector('#out:not([hidden]) #signin');
  await p.waitForTimeout(1500);
  same(await p.evaluate(() => window.__seen), [], 'signed out: no card text drawn at any moment');
  same(await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('today:cards:') || k === 'today:session')), [], 'signed out: nothing of the day kept in this browser');
  ok(await p.isVisible('#out #signin'), 'signed out: the way in');
  await ctx.close();
});

// ======================================================================= the hostile names, as text
await part('hostile names', async () => {
  const sig = (p) => p.evaluate(() => [...document.querySelectorAll('#rest *')].map((e) => `${e.tagName}[${[...e.attributes].map((a) => a.name).sort().join(',')}]`).join('|'));
  await mode('clean');
  let { ctx, p } = await open();
  await p.waitForFunction(() => document.querySelectorAll('.tcard[data-state="ok"]').length === 4);
  const clean = await sig(p);
  await ctx.close();
  await mode('ok');
  ({ ctx, p } = await open());
  await p.waitForFunction(() => document.querySelectorAll('.tcard[data-state="ok"]').length === 4);
  same(await p.$eval('.tcard[data-app=chat] .pg-row .pg-av', (e) => e.getAttribute('title')), 'Sam "Q" & O\'Neil', 'Sam "Q" & O\'Neil, as text');
  const chat = await p.$eval('.tcard[data-app=chat]', (e) => e.textContent);
  has(chat, "O'Brien, Courier", "O'Brien, as text");
  has(chat, 'to <b>x</b>', '<b>x</b>, as text');
  ok(!(await p.$$eval('#rest b', (bs) => bs.some((x) => x.textContent === 'x'))), 'no <b> made of it');
  ok((await sig(p)) === clean, 'no element or attribute more than the clean fixture gives');
  await ctx.close();
});

// ======================================================================= each card, in each state
await part('cards: ok', async () => {
  await mode('ok'); await reset();
  const { ctx, p } = await open();
  await p.waitForFunction(() => document.querySelectorAll('.tcard[data-state="ok"]').length === 4);
  const heads = await p.$$eval('.tcard', (cs) => cs.map((c) => [c.dataset.app, c.querySelector('.tc-head').getAttribute('href')]));
  same(heads, KEYS.map((k) => [k, CARDS.cards[k].href]), 'each card’s head links to its app at the fixture’s href');
  same(await p.$$eval('#tabs .ifl-tab', (as) => as.map((a) => [a.textContent.trim(), a.getAttribute('href')])), [['Today', '/'], ['Chats', 'https://chat.inflite.ai/'], ['Apps', '/#apps'], ['You', '/#you']], 'InFlite’s tab bar under the day (Chats at its own address while the hub isn’t ready)');
  ok(await p.evaluate(() => !document.getElementById('today').hidden && document.getElementById('apps').hidden && document.getElementById('you').hidden), 'opened on Today');
  // (the fixture: weather has a packed card, fitness a null one, chat none, and markets one with characters outside
  // base64url: only weather's goes in the link, after the words)
  for (const k of KEYS) {
    // (Send: a link to Chat's #share=, or, once cards.js sends through IFL.hub, a button, which here (the hub not ready)
    // goes to the same address)
    const sendEl = await p.$(`.tcard[data-app=${k}] [data-send]`);
    if (sendEl && await sendEl.evaluate((n) => n.tagName === 'BUTTON')) { ok(true, `${k}: Send to a friend, a button through IFL.hub.send`); continue; }
    const send = await p.$eval(`.tcard[data-app=${k}] a[data-send]`, (a) => a.href).catch(() => null), sc = CARDS.cards[k].sendCard;
    const card = typeof sc === 'string' && /^[A-Za-z0-9_-]{1,6000}$/.test(sc) ? `&card=${sc}` : '';
    same(send, `https://chat.inflite.ai/#share=${encodeURIComponent(CARDS.cards[k].share)}${card}`, `${k}: Send to a friend goes to Chat’s #share= with its line${card ? ', and the card after it' : ', and no card'}`);
  }
  ok(/^[A-Za-z0-9_-]+$/.test(CARDS.cards.weather.sendCard) && /[^A-Za-z0-9_-]/.test(CARDS.cards.markets.sendCard), 'the fixture has a good sendCard and a bad one');
  const wsend = await p.$eval('.tcard[data-app=weather] a[data-send]', (a) => a.getAttribute('href')).catch(() => 'https://chat.inflite.ai/#share=x&card=y');
  ok(/^https:\/\/chat\.inflite\.ai\/#share=[^&]+&card=[A-Za-z0-9_-]+$/.test(wsend), 'weather: #share= first, then &card=', wsend);
  const msend = await p.$eval('.tcard[data-app=markets] a[data-send]', (a) => a.getAttribute('href')).catch(() => '');
  ok(!msend.includes('card=') && !msend.includes('<'), 'markets: a sendCard outside base64url is left out of the link', msend);
  const fit = await p.$$eval('.tcard[data-app=fitness] .tc-foot a', (as) => as.map((a) => [a.textContent.trim(), a.href]));
  same(fit.slice(0, 2), [['Details', 'https://fitness.inflite.ai/#today'], ['Change', 'https://fitness.inflite.ai/#today']], 'Fitness: Details and Change, in Fitness’s words, to Fitness’s #today');
  ok(await p.$eval('.tcard[data-app=fitness] .tc-foot .pill.primary', (a) => a.textContent === 'Details' && !a.querySelector('svg')), 'Fitness: no play glyph, as nothing starts a session');
  same(await p.$$eval('.tcard[data-app=fitness] .ft-bt-key span', (ss) => ss.map((x) => x.textContent)), ['Great', 'Good', 'Fair', 'Poor'], 'Fitness: the hours’ colours, with their key');
  const rows = await p.$$eval('.tcard[data-app=chat] .pg-row, .tcard[data-app=chat] .pg-streak', (as) => as.map((a) => a.getAttribute('href')));
  const c = CARDS.cards.chat;
  same(rows, [...c.inbound, ...c.unread, ...c.mine, c.streak].map((x) => x.href), 'Chat: each row links to its friend in Chat');
  const mk = await p.$$eval('.tcard[data-app=markets] a', (as) => as.map((a) => a.getAttribute('href')));
  const m = CARDS.cards.markets;
  ok([m.top.href, m.low.href, m.dividend.href, m.href].every((x) => mk.includes(x)), 'Markets: top, low and the dividend link to #s=, the value to Markets');
  ok(await p.$eval('.tcard[data-app=weather] .wx-warn', (a) => a.getAttribute('href')) === CARDS.cards.weather.href, 'Weather: the warning links to Weather');
  // (a name in Markets' sentence: tapped on its words, or a finger's width beyond them, and never taken by the other name)
  const reach = await p.$$eval('.tcard[data-app=markets] a.mk-name', (as) => as.map((a, i) => {
    a.scrollIntoView({ block: 'center' });
    const r = a.getBoundingClientRect(), x = r.left + r.width / 2, at = (y) => document.elementFromPoint(x, y)?.closest('a.mk-name') === a;
    return [at(r.top + 2), at(r.bottom - 2), i === 0 ? at(r.top - 11) : at(r.bottom + 11)];
  }));
  same(reach, [[true, true, true], [true, true, true]], 'Markets: each name tapped on its words or a finger’s width beyond them, never taken by the other');
  const words = await text(p, '#rest');
  for (const w of ['2 pigeons on their way to you', 'Sam’s pigeon lands about 11:05', 'Mum’s pigeon lands about 16:20', 'A mystery pigeon', 'Leo’s pigeon landed at 07:30', 'Not read yet', 'To Leo · lands tomorrow about 01:40', '12-day flight streak with Mum', 'Send a pigeon in the next 15h 50m to keep it',
    'Yellow wind warning today 18:00 to tomorrow 03:00', 'Dry, sunny spells until about 15:00', 'NEXT FOUR HOURS', 'Feels like 7°',
    'Tempo 2 × 15', 'Why today:', 'Best 10:00 to 11:00', '11°, dry, a light westerly · London',
    'London open · closes in 8h 20m', '+£61.20', '+0.29%', 'Rolls-Royce did most of the work, adding £48.10.', 'Tesco gave back £12.40.', 'Dividend, around 6 Nov', 'Tesco: about £43.20', '£12,000 of your ISA allowance left', '£8,000 of £20,000 used · till 5 April'])
    has(words, w, `ok: “${w}”`);
  has(await text(p, '#hd .ifh-line'), 'Monday 2 November · London', 'the header’s line: the day, and the Weather place');
  const av = (await reqs()).find((e) => e.path.endsWith('/avatar'));
  ok(av && av.query.id, 'the header’s photo is today/avatar');
  await ctx.close();
});

await part('cards: empty', async () => {
  await mode('empty');
  const { ctx, p } = await open({ scheme: 'light' });
  await p.waitForFunction(() => document.querySelectorAll('.tcard[data-state="empty"]').length === 4);
  for (const k of KEYS) {
    const e = EMPTY.cards[k];
    const got = await p.$eval(`.tcard[data-app=${k}]`, (c) => [c.querySelector('.tc-said').textContent, c.querySelector('.tc-foot a').textContent, c.querySelector('.tc-foot a').href]);
    same(got, [e.said, e.action.label, e.action.href], `empty: ${k}’s words and its button`);
  }
  await p.screenshot({ path: `${OUT}/empty-390-light.png`, fullPage: true });
  await ctx.close();
});

await part('cards: error, and Try Again', async () => {
  await mode('error'); await reset();
  const { ctx, p } = await open({ w: 820, h: 1180 });
  await p.waitForFunction(() => document.querySelectorAll('.tcard[data-state="error"]').length === 4);
  same(await p.$$eval('.tcard [data-retry]', (bs) => bs.map((x) => x.dataset.retry)), KEYS, 'error: each card has Try Again');
  await p.click('.tcard[data-app=chat] [data-retry]');
  await p.waitForTimeout(800);
  const again = (await reqs()).filter((e) => e.path.endsWith('/cards') && e.query.only);
  same(again.map((e) => e.query), [{ only: 'chat' }], 'Try Again asks for only=<that card>');
  await ctx.close();
});

await part('cards: quiet', async () => {
  await mode('quiet');
  const { ctx, p } = await open({ time: TQ, scheme: 'light' });
  await p.waitForFunction(() => document.querySelectorAll('.tcard[data-state="ok"]').length === 4);
  const words = await text(p, '#rest');
  for (const w of ['No pigeons on their way to you', 'No session planned today', 'Next · Monday', 'London and New York are shut today', 'Your holdings are as they closed.', 'TOMORROW IN LONDON', 'Dry and partly cloudy tonight.'])
    has(words, w, `quiet: “${w}”`);
  ok(!words.includes('No change today yet'), 'quiet: no “yet” on a day the markets are shut');
  same(await p.$$eval('[data-send]', (as) => as.map((a) => a.closest('.tcard').dataset.app)), ['weather', 'chat'], 'quiet: no Send to a friend where there’s nothing to say');
  await p.screenshot({ path: `${OUT}/quiet-390-light.png`, fullPage: true });
  await ctx.close();
});

await part('cards: words across a clock change, a day out, and a dividend of £100 or more', async () => {
  // (the cards drawn in the page by cards.js itself, with an answer and a moment of our choosing)
  const { ctx, p } = await open();
  const draw = (key, card, now) => p.evaluate(async ([key, card, now]) => {
    const { cardHTML, tick } = await import('/cards.js');
    const box = document.createElement('div');
    box.innerHTML = cardHTML(key, card, { links: {}, tz: 'Europe/London', now });
    const before = box.textContent.replace(/\s+/g, ' ');
    tick(box, now);
    return [before, box.textContent.replace(/\s+/g, ' ')];
  }, [key, card, now]);
  const chat = (inbound, unread, mine = []) => ({ ...CARDS.cards.chat, inbound, unread, mine, streak: null });
  const pigeon = { ...CARDS.cards.chat.inbound[0] }, leo = { ...CARDS.cards.chat.unread[0] };
  // 00:30 BST on Sunday 25 October 2026, the day the clocks go back: a pigeon landing at 08:00 on Monday, 32½ hours on
  let now = Date.UTC(2026, 9, 24, 23, 30), lands = Date.UTC(2026, 9, 26, 8, 0);
  let [said, ticked] = await draw('chat', chat([{ ...pigeon, sentAt: now - 3600e3, landsAt: lands }], []), now);
  has(said, 'Sam’s pigeon lands tomorrow about 08:00', 'Chat: “tomorrow” on the 25-hour day');
  has(said, '1d 8h to go', 'Chat: a day or more to go, as Chat says it (1d 8h)');
  has(ticked, '1d 8h to go', 'Chat: the minute’s tick says it the same way');
  // 00:30 BST on Monday 30 March 2026, the day after the clocks went forward: landed at 21:00 on Sunday
  now = Date.UTC(2026, 2, 29, 23, 30);
  [said] = await draw('chat', chat([], [{ ...leo, last: Date.UTC(2026, 2, 29, 20, 0) }]), now);
  has(said, 'Leo’s pigeon landed yesterday at 21:00', 'Chat: “yesterday” the morning after the 23-hour day');
  // and the plain days still: today, tomorrow, and further off by the weekday
  [said] = await draw('chat', chat([{ ...pigeon, sentAt: T0 - 3600e3, landsAt: T0 + 2 * 864e5 }], []), T0);
  ok(/Sam’s pigeon lands \w{3} about/.test(said) && !said.includes('tomorrow'), 'Chat: two days off, by the weekday', said.slice(0, 200));
  // (a card drawn at t0 and ticked at t1: its title, its count in the air, its rows and its streak, each as text)
  const parts = (key, card, t0, t1 = t0) => p.evaluate(async ([key, card, t0, t1]) => {
    const { cardHTML, tick } = await import('/cards.js');
    const box = document.createElement('div'), t = (e) => (e ? e.textContent.replace(/\s+/g, ' ').trim() : null);
    box.innerHTML = cardHTML(key, card, { links: {}, tz: 'Europe/London', now: t0 });
    tick(box, t1);
    return { title: t(box.querySelector('.tc-h')), meta: t(box.querySelector('.tc-meta')), rows: [...box.querySelectorAll('.pg-row .pg-tx')].map((x) => [t(x.querySelector('b')), t(x.querySelector('small'))].join(' / ')),
      streak: t(box.querySelector('.pg-streak .tx small')), streakGone: box.querySelector('.pg-streak')?.hidden ?? null, bt: box.querySelector('.ft-bt')?.getAttribute('aria-label') || '' };
  }, [key, card, t0, t1]);
  // a pigeon five minutes off: “lands at”; landed since the answer: “landed at”, its title and count with it
  let c5 = await parts('chat', chat([{ ...pigeon, sentAt: T0 - 3600e3, landsAt: T0 + 5 * 60e3 }], [], CARDS.cards.chat.mine), T0);
  same([c5.title, c5.meta, c5.rows[0]], ['A pigeon on its way to you', '2 in the air', 'Sam’s pigeon lands at 08:15 / Biscuit, Navigator · 213 mi from Paris · 5m to go'], 'Chat: five minutes off, “lands at”');
  c5 = await parts('chat', chat([{ ...pigeon, sentAt: T0 - 3600e3, landsAt: T0 - 20 * 60e3 }], [], CARDS.cards.chat.mine), T0);
  same([c5.title, c5.meta, c5.rows[0]], ['Sam’s pigeon landed', '1 in the air', 'Sam’s pigeon landed at 07:50 / Biscuit, Navigator · 213 mi from Paris · Landed'], 'Chat: landed since the answer, “landed at”, with its title and count');
  // as it lands, the minute's tick says so in its row, its title and its count
  c5 = await parts('chat', chat([{ ...pigeon, sentAt: T0 - 3600e3, landsAt: T0 + 5 * 60e3 }], []), T0, T0 + 6 * 60e3);
  same([c5.title, c5.meta, c5.rows[0]], ['Sam’s pigeon landed', '', 'Sam’s pigeon landed at 08:15 / Biscuit, Navigator · 213 mi from Paris · Landed'], 'Chat: as it lands, the tick says so in its row, title and count');
  // landed unread ten days ago: with its date, as a weekday alone reads as this week's (Chat's atTime); two from one friend
  c5 = await parts('chat', chat([], [{ ...leo, last: T0 - 10 * 864e5 }]), T0);
  same(c5.rows, ['Leo’s pigeon landed Fri 23 Oct at 09:10 / Not read yet'], 'Chat: ten days ago, with its date');
  c5 = await parts('chat', chat([], [{ ...leo, n: 2 }]), T0);
  same([c5.title, c5.rows[0]], ['2 pigeons landed', 'Leo’s pigeons landed, the last at 07:30 / 2 not read yet'], 'Chat: two from one friend');
  // instant messages, counted apart from letters (unread[].messages): said as messages, with pigeons on or off
  c5 = await parts('chat', chat([], [{ ...leo, n: 1, messages: 1 }]), T0);
  same([c5.title, c5.rows[0]], ['Leo sent you a message', 'Leo sent you a message / Sent at 07:30'], 'Chat: one message unread, said as a message');
  c5 = await parts('chat', chat([], [{ ...leo, n: 2, messages: 2 }]), T0);
  same([c5.title, c5.rows[0]], ['2 new messages', '2 new messages from Leo / The last sent at 07:30'], 'Chat: two messages from one friend');
  c5 = await parts('chat', chat([{ ...pigeon, sentAt: T0 - 3600e3, landsAt: T0 + 3 * 3600e3 }], [{ ...leo, n: 1, messages: 1 }]), T0);
  same([c5.title, c5.rows[1]], ['A pigeon on its way to you', 'Leo sent you a message / Sent at 07:30'], 'Chat: a pigeon still flying keeps the title; the message said as one');
  c5 = await parts('chat', chat([], [{ ...leo, n: 3, messages: 1 }]), T0);
  same([c5.title, c5.rows[0]], ['3 pigeons landed', 'Leo’s pigeons landed, the last at 07:30 / 3 not read yet'], 'Chat: letters and a message together, pigeons on: as before');
  // pigeons off (the card's pigeons false): letters said plainly, with no bird, kind, track, streak or count in the air
  const off = (inbound, unread, mine = []) => ({ ...CARDS.cards.chat, inbound, unread, mine, pigeons: false });
  c5 = await parts('chat', off([{ ...pigeon, sentAt: T0 - 3600e3, landsAt: T0 + 3 * 3600e3 }], [{ ...leo }], [{ ...CARDS.cards.chat.mine[0], sentAt: T0 - 600e3, landsAt: T0 + 7 * 3600e3 }]), T0);
  same([c5.title, c5.meta, ...c5.rows, c5.streak], ['A letter on its way to you', '', 'Sam’s letter arrives 11:10 / From Paris · 3h 0m to go', 'Leo’s letter arrived at 07:30 / Not read yet',
    'Your letter to Leo arrives 15:10 / 7h 0m to go', null], 'Chat, pigeons off: “Sam’s letter arrives 11:10”, “Leo’s letter arrived”, “Your letter to Leo arrives 15:10”, and no streak or count in the air');
  // (more of your own letters than the card lists: said as on their way, not in the air)
  const moreOff = await p.evaluate(async ([card, now]) => {
    const { cardHTML } = await import('/cards.js'), box = document.createElement('div');
    box.innerHTML = cardHTML('chat', card, { links: { chat: 'https://chat.inflite.ai' }, tz: 'Europe/London', now });
    return box.querySelector('.pg-more')?.textContent || '';
  }, [{ ...off([], [], [{ ...CARDS.cards.chat.mine[0], sentAt: T0 - 600e3, landsAt: T0 + 7 * 3600e3 }]), more: 2 }, T0]);
  same(moreOff, 'and 2 more on their way, in Chat', 'Chat, pigeons off: more letters of yours “on their way”, not “in the air”');
  const offBox = await p.evaluate(async ([card, now]) => {
    const { cardHTML } = await import('/cards.js'), box = document.createElement('div');
    box.innerHTML = cardHTML('chat', card, { links: { chat: 'https://chat.inflite.ai' }, tz: 'Europe/London', now });
    return { track: !!box.querySelector('.pg-track'), bird: !!box.querySelector('.bird-ic, .pg-bird'), pill: !!box.querySelector('[data-send] svg'), pigeons: box.querySelector('[data-pgtitle]')?.dataset.pigeons, words: box.textContent };
  }, [off([{ ...pigeon, sentAt: T0 - 3600e3, landsAt: T0 + 3 * 3600e3 }], [], []), T0]);
  ok(!offBox.track && !offBox.bird && offBox.pill && offBox.pigeons === '0' && !/pigeon|Biscuit|swift|mi from/i.test(offBox.words.replace(/Send to a friend/, '')), 'Chat, pigeons off: no track, no bird (Send to a friend with a plain arrow), no kind, no pigeon words', JSON.stringify({ ...offBox, words: offBox.words.replace(/\s+/g, ' ').slice(0, 160) }));
  c5 = await parts('chat', off([], [{ ...leo, n: 1, messages: 1 }]), T0);
  same([c5.title, c5.rows[0]], ['Leo sent you a message', 'Leo sent you a message / Sent at 07:30'], 'Chat, pigeons off: one message unread');
  c5 = await parts('chat', off([], [{ ...leo, n: 3, messages: 0 }]), T0);
  same([c5.title, c5.rows[0]], ['3 new messages', 'Leo’s letters arrived, the last at 07:30 / 3 not read yet'], 'Chat, pigeons off: letters unread, as new messages');
  c5 = await parts('chat', off([], []), T0);
  same(c5.title, 'No new messages', 'Chat, pigeons off: nothing new');
  c5 = await parts('chat', off([{ ...pigeon, sentAt: T0 - 3600e3, landsAt: T0 + 5 * 60e3 }], []), T0, T0 + 6 * 60e3);
  same([c5.title, c5.meta, c5.rows[0]], ['Sam sent you a message', '', 'Sam’s letter arrived at 08:15 / From Paris · Arrived'], 'Chat, pigeons off: as a letter arrives, the minute’s tick says so by the same rules');
  // the streak, counting down as Chat does (its Flight Streak row), by the minute's tick; gone once it's ended
  const st = { ...CARDS.cards.chat, inbound: [], unread: [], mine: [] };
  c5 = await parts('chat', st, T0, T0 + 30 * 60e3);
  same([c5.streak, c5.streakGone], ['Send a pigeon in the next 15h 20m to keep it', false], 'Chat: the streak’s time left, as Chat says it, by the tick');
  c5 = await parts('chat', st, T0, st.streak.endsAt + 60e3);
  same(c5.streakGone, true, 'Chat: the streak’s row gone once it’s ended');
  // Fitness: a run's hours said as a run's
  const fit = CARDS.cards.fitness;
  c5 = await parts('fitness', { ...fit, session: { ...fit.session, sport: 'run' } }, T0);
  ok(/^Each daylight hour for a run:/.test(c5.bt), 'Fitness: a run’s hours, said as a run’s', c5.bt.slice(0, 80));
  // Fitness: a rest day, with the reason Fitness gave for it (the card's own why)
  [said] = await draw('fitness', { ...fit, kind: 'rest', session: null, best: null, why: 'Hard days yesterday: let it sink in.' }, T0);
  ok(said.includes('Rest, and let it sink in') && said.includes('Hard days yesterday: let it sink in.'), 'Fitness: a rest day, with Fitness’s reason for it', said.slice(0, 200));
  // Markets: an expected dividend of £100 or more without the pence, under £100 with them
  const mk = CARDS.cards.markets;
  [said] = await draw('markets', { ...mk, dividend: { ...mk.dividend, value: 143.2 } }, T0);
  has(said, 'Tesco: about £143', 'Markets: about £143, as Markets says it');
  ok(!said.includes('£143.20'), 'Markets: no pence on a dividend of £100 or more');
  [said] = await draw('markets', { ...mk, dividend: { ...mk.dividend, value: 99.5 } }, T0);
  has(said, 'Tesco: about £99.50', 'Markets: pence under £100');
  // one holding, as Markets says it (markets/app.js daySaid)
  [said] = await draw('markets', { ...mk, owned: 1, change: 61.2, pct: 1.21, top: { ...mk.top, change: 61.2 }, low: null }, T0);
  ok(said.includes('Rolls-Royce is up 1.21% today.') && !said.includes('did most of the work'), 'Markets: one holding up, in Markets’ words', said.slice(0, 200));
  // (its one name, laid out in the page: a finger's reach, 44 high or more)
  const tall = await p.evaluate(async (card) => {
    const { cardHTML } = await import('/cards.js');
    const box = document.createElement('div');
    box.innerHTML = cardHTML('markets', card, { links: {}, tz: 'Europe/London', now: Date.now() });
    document.querySelector('#rest').prepend(box);
    const a = box.querySelector('a.mk-name');
    a.scrollIntoView({ block: 'center' });
    const r = a.getBoundingClientRect(), x = r.left + r.width / 2, at = (y) => document.elementFromPoint(x, y)?.closest('a.mk-name') === a;
    let top = r.top, bottom = r.bottom;
    while (at(top - 1)) top--;
    while (at(bottom + 1)) bottom++;
    box.remove();
    return Math.round(bottom - top);
  }, { ...mk, owned: 1, change: 61.2, pct: 1.21, top: { ...mk.top, change: 61.2 }, low: null });
  ok(tall >= 44, 'Markets: one holding’s name, 44 high or more to tap', `${tall}px`);
  [said] = await draw('markets', { ...mk, owned: 1, change: -30, pct: -0.58, top: null, low: { ...mk.low, change: -30 } }, T0);
  ok(said.includes('Tesco is down 0.58% today.') && !said.includes('took away'), 'Markets: one holding down, in Markets’ words', said.slice(0, 200));
  await ctx.close();
});

await part('cards: slow', async () => {
  await mode('slow');
  const { ctx, p } = await open({ wait: false });
  await p.waitForSelector('#in:not([hidden])');
  same(await p.$$eval('.tcard.loading', (cs) => cs.map((c) => c.dataset.app)), KEYS, 'slow: each card’s place held, in your order, as the session answers');
  await p.waitForFunction(() => document.querySelectorAll('.tcard[data-state="ok"]').length === 4, null, { timeout: 15000 });
  ok(true, 'slow: then the cards');
  await ctx.close();
});

await part('cards: a clock behind the account’s', async () => {
  // (this device's clock 13 hours behind, across midnight: the day still said from the answer's moment, never before it)
  await mode('ok');
  const { ctx, p } = await open({ time: T0 - 13 * 3600e3 });
  await p.waitForFunction(() => document.querySelectorAll('.tcard[data-state="ok"]').length === 4);
  const words = await text(p, '.tcard[data-app=chat]');
  for (const w of ['Sam’s pigeon lands about 11:05', 'Leo’s pigeon landed at 07:30', 'To Leo · lands tomorrow about 01:40', 'Send a pigeon in the next 15h 50m to keep it'])
    has(words, w, `a clock 13 hours behind: “${w}”`);
  await ctx.close();
});

// ======================================================================= the requests the page makes
await part('requests', async () => {
  await mode('ok'); await reset();
  const { ctx, p } = await open();
  await p.waitForFunction(() => document.querySelectorAll('.tcard[data-state="ok"]').length === 4);
  await p.waitForTimeout(500);
  const all = await reqs();
  const cards = all.filter((e) => e.method === 'GET' && e.path.endsWith('/cards'));
  same(cards.map((e) => e.query.with), ['morning'], 'one /api/today?with=morning a load');
  same(all.filter((e) => e.path.endsWith('/today/morning')).length, 0, 'no separate /api/morning');
  ok(all.every((e) => !/fcm|endpoint/i.test(JSON.stringify(e.query)) && !/fcm/.test(e.path)), 'no address carries a push endpoint');
  ok(all.every((e) => Object.keys(e.query).every((k) => ['only', 'with', 'device', 'id', 'v'].includes(k))), 'only the five named parts of an address go on');
  ok(all.every((e) => e.headers.origin === BASE), 'every request to the account carries Today’s own Origin');
  same([...new Set(all.map((e) => e.headers.cookie))], [SESSION_COOKIE], 'only the account’s cookie goes on');
  await ctx.close();
});

// ======================================================================= Edit
await part('edit', async () => {
  await mode('ok'); await reset();
  const { ctx, p } = await open();
  await p.waitForFunction(() => document.querySelectorAll('.tcard[data-state="ok"]').length === 4);
  await p.click('#edit');
  await p.waitForSelector('#sh-edit.on');
  await p.click('#edList [data-k=chat] [data-mv="-1"]');
  await p.click('#edList [data-k=markets] [data-show]');
  await p.waitForTimeout(900);
  same(await p.$$eval('#rest .tcard', (cs) => cs.map((c) => c.dataset.app)), ['chat', 'weather', 'fitness'], 'Edit: moved and hidden on the page at once');
  let puts = (await reqs()).filter((e) => e.method === 'PUT' && e.path.endsWith('/prefs'));
  same(puts.length, 1, 'Edit: the changes sent once, after the last');
  same(JSON.parse(puts.at(-1)?.body || '{}'), { order: ['chat', 'weather', 'fitness', 'markets'], hidden: ['markets'] }, 'Edit: the PUT body');
  await p.screenshot({ path: `${OUT}/edit-390-dark.png` });
  await p.click('#edReset');
  await p.waitForTimeout(900);
  puts = (await reqs()).filter((e) => e.method === 'PUT' && e.path.endsWith('/prefs'));
  same(JSON.parse(puts.at(-1)?.body || '{}'), { order: KEYS, hidden: [] }, 'Back to the day’s order sends the default');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
  ok(!(await p.$('#sh-edit.on')), 'Escape closes Edit');
  await ctx.close();
});
await part('edit: a change made while the last is on its way', async () => {
  // (the account answering each PUT 700 ms late; a second move made after the first PUT's gone, before its answer)
  const order = (p) => p.$$eval('#rest .tcard', (cs) => cs.map((c) => c.dataset.app).join(','));
  const putOrders = async () => (await reqs()).filter((e) => e.method === 'PUT' && e.path.endsWith('/prefs')).map((e) => JSON.parse(e.body).order.join(','));
  for (const gap of [900, 550]) {
    await mode('ok');
    const { ctx, p } = await open();
    await p.waitForFunction(() => document.querySelectorAll('.tcard[data-state="ok"]').length === 4);
    await p.route('**/api/prefs', async (r) => { await new Promise((y) => setTimeout(y, 700)); await r.continue(); });
    await reset();
    await p.click('#edit');
    await p.waitForSelector('#sh-edit.on');
    await p.click('#edList [data-k=markets] [data-mv="-1"]');
    await p.waitForTimeout(gap);
    await p.click('#edList [data-k=markets] [data-mv="-1"]');
    const seen = new Set();
    for (let i = 0; i < 30; i++) { seen.add(await order(p)); await p.waitForTimeout(100); }
    same([...seen], ['weather,markets,chat,fitness'], `Edit, ${gap} ms apart: the newer order stays on the page while the older PUT answers`);
    await p.waitForTimeout(1200);
    same(await order(p), 'weather,markets,chat,fitness', `Edit, ${gap} ms apart: still the newer order once every PUT has answered`);
    same((await putOrders()).at(-1), 'weather,markets,chat,fitness', `Edit, ${gap} ms apart: the newer order is the last the account was sent`);
    await ctx.close();
  }
});

// ======================================================================= the morning, with a stand-in push service
await part('morning', async () => {
  await mode('ok'); await ctl('/__morning', { on: false }); await reset();
  const { ctx, p } = await open({ push: true });
  await p.waitForFunction(() => document.querySelectorAll('.tcard[data-state="ok"]').length === 4);
  // (its settings: in a sheet from the menu, under your photo, not on the page)
  const openMorning = async () => {
    await p.click('#hd .ifh-me'); await p.waitForSelector('.ifm-pop.open');
    await p.click('.ifm-pop [data-k=morning]'); await p.waitForSelector('#morning.on'); await p.waitForTimeout(700);
  };
  ok(!(await p.isVisible('#mOn')) && !(await p.$('#day #morning')), 'morning: not on the page, only in the menu');
  await openMorning();
  ok(await p.isVisible('#mOn'), 'morning: its settings, opened from the menu');
  ok(!(await p.isChecked('#mOn')), 'morning: off, as the account says');
  ok(!(await p.$('#lock, .lk-note')), 'morning: no Lock Screen picture, its settings only');
  await p.click('#mOn');
  await p.waitForFunction(() => document.querySelector('#mOn').checked && !document.querySelector('#mOn').disabled);
  await p.waitForTimeout(300);
  const all = await reqs(), i = all.findIndex((e) => e.method === 'POST' && e.path.endsWith('/today/device')), j = all.findIndex((e) => e.method === 'PUT' && e.path.endsWith('/today/morning'));
  ok(i >= 0 && j > i, 'turning it on: POST /api/device (Today’s morning, never every app’s), then PUT /api/morning');
  same(JSON.parse(all[i]?.body || '{}').fan, undefined, 'never fan from the morning’s switch');
  same(JSON.parse(all[i]?.body || '{}').sub?.endpoint, FAKE_ENDPOINT, 'the subscription sent in the body');
  const put = JSON.parse(all[j]?.body || '{}');
  same([put.on, put.tz], [true, 'Europe/London'], 'PUT /api/morning {on: true, tz}');
  ok(!(await p.$('#tryNow, #mNotify')), 'no buttons at the foot of the morning’s settings');
  // (opened again: this device named by its hash, never its endpoint)
  await reset();
  await p.reload();
  await p.waitForFunction(() => document.querySelectorAll('.tcard[data-state="ok"]').length === 4);
  const q = (await reqs()).find((e) => e.path.endsWith('/cards'))?.query || {};
  same(q.device, sha(FAKE_ENDPOINT).slice(0, 16), 'the device’s name: the first 16 of b64url(SHA-256(endpoint))');
  // (turned on from Account, on no device yet)
  await ctl('/__morning', { on: true, devices: 0, thisDevice: false });
  await p.reload();
  await p.waitForFunction(() => document.querySelectorAll('.tcard[data-state="ok"]').length === 4);
  await p.waitForTimeout(300);
  await openMorning();
  has(await text(p, '#mWhy'), 'Not on any of your devices yet · Turn On Here', 'on with no device: said, with Turn On Here');
  const reach = await p.$eval('#mWhy [data-turnon]', (b) => { const r = b.getBoundingClientRect(), a = getComputedStyle(b, '::after'); return [r.height - parseFloat(a.top) - parseFloat(a.bottom), r.width - parseFloat(a.left) - parseFloat(a.right)]; });
  ok(reach[0] >= 44 && reach[1] >= 44, 'Turn On Here: a finger’s reach, 44 by 44 or more', JSON.stringify(reach));
  // (the next one, tomorrow, composed now: said as how it reads now, at now)
  await ctl('/__morning', { on: true, devices: 1, thisDevice: true, preview: { ...FIX('morning.json').preview, kind: 'next', at: T0 + 22 * 3600e3 + 50 * 60e3 } });
  await p.reload();
  await p.waitForFunction(() => document.querySelectorAll('.tcard[data-state="ok"]').length === 4);
  await p.waitForTimeout(300);
  ok(!(await p.$('#lock, .lk-note')), 'still no Lock Screen picture, with a next one to come');
  await openMorning();
  await p.screenshot({ path: `${OUT}/morning-390-dark.png` });
  // (Chat's line, as its morning line will say it: pigeons, or letters with pigeons off)
  const chatLine = () => p.$eval('#lines input[data-line=chat]', (i) => i.closest('label').querySelector('small').textContent);
  same(await chatLine(), 'Pigeons on their way to you', 'morning: Chat’s line, pigeons on');
  const offCards = (r) => r.fetch().then(async (res) => { const a = await res.json(); if (a.cards?.chat) a.cards.chat.pigeons = false; return r.fulfill({ response: res, json: a }); });
  await p.route((u) => new URL(u).pathname === '/api/today', offCards);
  await p.reload();
  await p.waitForFunction(() => document.querySelectorAll('.tcard[data-state="ok"]').length === 4);
  await p.waitForTimeout(300);
  await openMorning();
  same(await chatLine(), 'Letters on their way to you', 'morning: Chat’s line, pigeons off: letters, as its morning line says');
  await ctx.close();
});

// ======================================================================= the menu, and Sign Out
await part('menu and sign out', async () => {
  await mode('ok'); await reset();
  const { ctx, p } = await open({ push: true });
  await p.evaluate(() => localStorage.setItem('fakesub', '1'));
  await p.reload();
  await p.waitForFunction(() => document.querySelectorAll('.tcard[data-state="ok"]').length === 4);
  await p.click('#hd .ifh-me');
  await p.waitForSelector('.ifm-pop.open');
  const rows = await p.$$eval('.ifm-rows .ifm-row', (rs) => rs.map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
  same(rows, ['Notifications', 'Morning Notification 07:00', 'Edit Today'], 'the menu’s rows');
  has(await text(p, '.ifm-pop .ifm-who'), 'Alex Morgan', 'the menu: you');
  has(await text(p, '.ifm-foot'), `Today ${BUILD}`, 'the menu’s foot: Today and its version');
  ok(await p.$eval('.ifm-foot-ic', (i) => i.complete && i.naturalWidth > 0), 'and Today’s icon beside it');
  ok(!(await p.$('.ifm-today')), 'no Today row in Today’s own menu');
  await p.screenshot({ path: `${OUT}/menu-390-dark.png` });
  await reset();
  await p.route('https://auth.inflite.ai/**', (r) => r.fulfill({ body: 'auth', contentType: 'text/html' }));
  await p.click('.ifm-out');
  await p.waitForURL(/auth\.inflite\.ai/);
  const h = new URLSearchParams(new URL(p.url()).hash.slice(1));
  same([h.get('signout'), h.get('back')], ['today', `${BASE}/`], 'Sign Out ends at the sign-in page’s #signout=today&back=…');
  const all = await reqs(), del = all.findIndex((e) => e.method === 'DELETE' && e.path.endsWith('/today/device')), out = all.findIndex((e) => e.path.endsWith('/signout'));
  ok(del >= 0 && out > del, 'Sign Out: this device’s notifications stopped first, in every app’s table (DELETE /api/device), then signed out');
  same(JSON.parse(all[del]?.body || '{}'), { endpoint: FAKE_ENDPOINT }, 'DELETE /api/device names the endpoint in its body');
  await p.goto(`${BASE}/robots.txt`);
  same(await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('today:'))), [], 'Sign Out: nothing of the day kept');
  await ctx.close();
});

// ======================================================================= everywhere: no CSP violation, console error or sideways scroll
await part('every width, light and dark', async () => {
  await mode('ok');
  for (const scheme of ['light', 'dark']) for (const w of [320, 390, 820, 1440]) {
    const { ctx, p } = await open({ w, h: w < 700 ? 844 : 1000, scheme });
    await p.waitForFunction(() => document.querySelectorAll('.tcard[data-state="ok"]').length === 4);
    await p.waitForTimeout(300);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    ok(over <= 0, `${w} ${scheme}: no sideways scroll`, `${over}px`);
    if (w === 390 && scheme === 'dark') {
      const sw = await p.evaluate(async () => (await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(r, 5000))]))?.active?.scriptURL || '');
      ok(sw.endsWith('/sw.js'), 'sw.js registered', sw);
    }
    if (w === 1440 || w === 320) await p.screenshot({ path: `${OUT}/ok-${w}-${scheme}.png`, fullPage: true });
    await ctx.close();
  }
});
same(errs, [], 'no CSP violation and no console error, on any page');

await b.close();
stop();
console.log(`FAILS ${fails}`);
process.exit(fails ? 1 : 0);
