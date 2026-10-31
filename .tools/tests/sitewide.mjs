// The whole site, at every size it's used: each app and the home page on phones (small to large, and on their side),
// tablets (both ways round), laptops and wide screens; dark, and light at a phone's and a laptop's size. Each screen is
// photographed and checked: text that overlaps, is cut off or runs off the screen; a page that scrolls sideways; things
// too small to tap; accessibility (axe: contrast, names, labels); errors on the page. And each app's first load, from
// nothing: what it fetches and how long it takes to show. Not in the suite: it's the audit's eyes (`./run.sh sitewide`),
// writing sitewide.json beside its screenshots. Mail is the inflite repo's, in its demo (`?demo`), on :8806 when served.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
import { joinChat } from './join.mjs';
import * as F from './mocks/wxappdata.mjs';
const [,, S, out] = process.argv;
const CHAT = 'http://chat.ifl.test:8788', ACCT = 'http://account.ifl.test:8788', WX = 'http://weather.ifl.test:8788', FIT = 'http://fitness.ifl.test:8788', MKT = 'http://finance.ifl.test:8788', HOME = 'http://gfg.test:8788', MAIL = 'http://127.0.0.1:8806';
const AXE = readFileSync(`${S}/wr/node_modules/axe-core/axe.min.js`, 'utf8');
const src = readFileSync(`${S}/wr/audit.mjs`, 'utf8');
const AUDIT = eval(src.slice(src.indexOf('const AUDIT = ') + 14, src.indexOf('\nconst b = await')).replace(/;\s*$/, ''));
// what's too small to tap (on a screen that's touched): visible, on screen, under 32px either way (words linked inside a
// sentence aside)
const TAPS = () => [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=switch], [role=tab]')].filter((e) => {
  const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
  if (!r.width || !r.height || cs.visibility === 'hidden' || +cs.opacity === 0 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return false;
  if (e.tagName === 'A' && e.closest('p')) return false;
  const hit = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)));
  if (!hit || !(hit === e || e.contains(hit) || hit.contains(e))) return false;
  return r.width < 32 || r.height < 32;
}).map((e) => { const r = e.getBoundingClientRect(); return `${(e.getAttribute('aria-label') || e.textContent || e.className || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 28)} ${Math.round(r.width)}×${Math.round(r.height)}`; });
const H = 3600e3, PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
// the sizes: [name, width, height, kind]
const SIZES = [['se', 320, 568, 'phone'], ['mini', 375, 812, 'phone'], ['phone', 390, 844, 'phone'], ['max', 430, 932, 'phone'], ['side', 844, 390, 'phone'],
  ['ipad', 768, 1024, 'tablet'], ['ipad-side', 1024, 768, 'tablet'], ['laptop', 1280, 800, 'desk'], ['desk', 1440, 900, 'desk'], ['wide', 1920, 1080, 'desk']];
const LIGHT = new Set(['phone', 'desk']);
// (a browser of its own for each size: a long run in one wears it out)
const launch = () => chromium.launch({ executablePath: process.env.CHROMIUM || undefined,
  args: ['--disable-dev-shm-usage', '--host-resolver-rules=MAP *.gfg.test 127.0.0.1, MAP gfg.test 127.0.0.1, MAP *.ifl.test 127.0.0.1, MAP ifl.test 127.0.0.1', `--unsafely-treat-insecure-origin-as-secure=${CHAT},${MKT},${ACCT},${WX},${FIT}`] });
let b = await launch();
const report = { pages: [], loads: [] };
let fails = 0;

// the stand-ins Weather asks of in the browser (as wxapp.mjs's)
async function weatherRoutes(ctx) {
  const now = Date.now(), j = (r, o) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o), headers: { 'Access-Control-Allow-Origin': '*' } });
  await ctx.route(/open-meteo\.com|bigdatacloud/, (r) => {
    const u = r.request().url();
    if (u.includes('ensemble-api')) return j(r, F.ensemble(now));
    if (u.includes('air-quality')) return j(r, F.air(now));
    if (u.includes('marine-api')) return j(r, F.marine(now, u));
    if (u.includes('archive-api')) return j(r, F.archive(now));
    if (u.includes('geocoding')) return j(r, { results: [{ name: 'London', latitude: 51.5, longitude: -0.12, country: 'United Kingdom', admin1: 'England', country_code: 'GB' }] });
    if (u.includes('bigdatacloud')) return j(r, { city: 'London', locality: 'Soho', principalSubdivision: 'England', countryName: 'United Kingdom', countryCode: 'GB' });
    if (u.includes('models=')) return j(r, F.models(now));
    if (/latitude=[^&]*%2C|latitude=[^&]*,/.test(u)) { const n = decodeURIComponent(new URL(u).searchParams.get('latitude')).split(',').length; return j(r, Array(n).fill(F.forecast(now))); }
    return j(r, F.forecast(now));
  });
  await ctx.route(/api\.rainviewer\.com/, (r) => j(r, { host: 'https://tilecache.rainviewer.com', radar: { past: Array.from({ length: 13 }, (_, k) => ({ time: Math.floor(now / 600e3) * 600 - (12 - k) * 600, path: `/v2/radar/f${k}` })), nowcast: [] } }));
  await ctx.route(/tilecache\.rainviewer\.com|tile\.openstreetmap\.org/, (r) => r.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: PNG }));
  await ctx.route(/tiles\.openfreemap\.org/, (r) => {
    const u = r.request().url(), cors = { 'Access-Control-Allow-Origin': '*' };
    if (/\/planet$/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ tilejson: '3.0.0', tiles: ['https://tiles.openfreemap.org/planet/test/{z}/{x}/{y}.pbf'], minzoom: 0, maxzoom: 14 }) });
    return r.fulfill({ status: 200, contentType: /\.png$/.test(u) ? 'image/png' : 'application/x-protobuf', headers: cors, body: /\.png$/.test(u) ? PNG : Buffer.alloc(0) });
  });
}
async function context(kind, scheme, storageState) {
  const ctx = await b.newContext({ storageState, viewport: { width: 390, height: 844 }, deviceScaleFactor: kind === 'desk' ? 1 : 2, isMobile: kind === 'phone', hasTouch: kind !== 'desk',
    userAgent: kind === 'phone' ? IPHONE : kind === 'tablet' ? IPAD : MAC, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: scheme, serviceWorkers: 'block',
    geolocation: { latitude: 51.5072, longitude: -0.1276 }, permissions: ['geolocation'] });
  await weatherRoutes(ctx);
  return ctx;
}
// someone with something in each app: signed up (in Chat, as everyone is), with holdings in Markets in two accounts,
// buys of one, and an ISA paid into
// (signed up on a phone, as Chat's made for: on a tablet or a computer it's the desktop tracker; the sign-in's then the
// browser's, carried to this one)
async function person(ctx, n) {
  const ph = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPHONE, locale: 'en-GB', serviceWorkers: 'allow' });
  const j = await ph.newPage();
  await joinChat(j, `${CHAT}/`, { name: `Alex Morgan`, handle: `alex${n}`, email: `alex${n}@example.com`, city: 'London' });
  await ctx.addCookies(await ph.cookies());
  await ph.close();
  const p = await ctx.newPage();
  await p.goto(MKT + '/'); await p.waitForSelector('.empty h2, #pv', { timeout: 20000 });
  await p.evaluate(async () => {
    const put = (h) => fetch('/api/markets/holding', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(h), credentials: 'same-origin' });
    for (const h of [{ symbol: 'RR.L', name: 'Rolls-Royce', qty: 640, cost: 6.1, account: 'isa' }, { symbol: 'TSCO.L', name: 'Tesco', qty: 900, cost: 3.5, account: 'gia' },
      { symbol: 'SMT.L', name: 'Scottish Mortgage', qty: 500, cost: 8, account: 'isa' }, { symbol: 'SHEL.L', name: 'Shell', qty: 60, cost: 26, account: 'sipp' },
      { symbol: 'AAPL', name: 'Apple', qty: 10, cost: 190, account: 'gia' }, { symbol: 'NVDA', name: 'NVIDIA', qty: 12 }, { symbol: 'VUSA.L', name: 'Vanguard S&P 500 UCITS ETF' }]) await put(h);
    await fetch('/api/markets/buy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: 'SMT.L', qty: 100, price: 9.4, at: Date.now() - 40 * 864e5 }), credentials: 'same-origin' });
    await fetch('/api/markets/isa', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paid: 8000 }), credentials: 'same-origin' });
  });
  await p.close();
}
// the screens: [name, url, then (what to do once it's open), what's there once it's drawn]
const SCREENS = [
  ['home-out', HOME + '/', null, '.hero, h1', { fresh: true }],
  ['404', HOME + '/no-such-page', null, 'body'],
  ['account', ACCT + '/', null, '.app, .group'],
  ['account-notify', ACCT + '/', async (p) => { await p.locator('button:has-text("Notifications"), .row:has-text("Notifications")').first().click(); await p.waitForTimeout(900); }, '.app, .group'],
  ['chat', CHAT + '/', null, '#screen, .welcome, .hdr'],
  ['weather', WX + '/?lat=51.5072&lon=-0.1276&name=London', null, '.day-row'],
  ['fitness', FIT + '/', null, 'main, .empty, .ifh'],
  // (from 1100px wide Markets is its desk, markets/desk.js: today's screen is the desk there, and the phone's tabs aren't)
  ['markets-today', MKT + '/', null, '#pv, .desk'],
  ['markets-holdings', MKT + '/', async (p) => { await p.click('.tab[data-tab="holdings"]'); await p.waitForTimeout(1600); }, '#pv', { phone: true }],
  ['markets-news', MKT + '/', async (p) => { await p.click('.tab[data-tab="news"]'); await p.waitForTimeout(1600); }, '#pv', { phone: true }],
  ['markets-stock', MKT + '/', async (p) => { await p.click('.tab[data-tab="holdings"]'); await p.waitForTimeout(800); await p.locator('#all .item:has-text("Scottish")').first().click(); await p.waitForSelector('.chartbox path.line[d]', { timeout: 10000 }).catch(() => {}); await p.waitForTimeout(1800); }, '#pv', { phone: true }],
  ['markets-income', MKT + '/', async (p) => { await p.click('.tab[data-tab="holdings"]'); await p.waitForTimeout(800); await p.locator('.item:has-text("Dividends")').first().click(); await p.waitForTimeout(1600); }, '#pv', { phone: true }],
  ['markets-vs', MKT + '/', async (p) => { await p.click('.tab[data-tab="holdings"]'); await p.waitForTimeout(800); await p.locator('.item:has-text("Your year")').first().click(); await p.waitForTimeout(3000); }, '#pv', { phone: true }],
  ['markets-search', MKT + '/', async (p) => { await p.click('.ifh-act[aria-label="Find and add"]'); await p.waitForTimeout(900); }, '#pv', { phone: true }],
  ['markets-menu', MKT + '/', async (p) => { await p.click('.ifh-me, .ifl-me, [aria-label="You"], .ifh button.me').catch(() => {}); await p.waitForTimeout(900); }, '#pv', { phone: true }],
  ['mail', MAIL + '/?demo', null, 'body', { mail: true }],
];
let mailUp = false;
try { mailUp = (await fetch(MAIL + '/')).ok; } catch (_) {}

async function look(ctx, size, scheme, [name, url, act, sel, o = {}]) {
  if (o.mail && !mailUp) return;
  const [sz, w, h, kind] = size;
  if (o.phone && w >= 1100) return;
  const c = o.fresh ? await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: kind === 'desk' ? 1 : 2, isMobile: kind === 'phone', hasTouch: kind !== 'desk', userAgent: kind === 'phone' ? IPHONE : kind === 'tablet' ? IPAD : MAC, locale: 'en-GB', colorScheme: scheme, serviceWorkers: 'block' }) : null;
  const p = await (c || ctx).newPage();
  await p.setViewportSize({ width: w, height: h });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e.message || e).slice(0, 160)));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 40[134]/.test(m.text())) errs.push(m.text().slice(0, 160)); });
  try {
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await p.waitForSelector(sel, { timeout: 20000 }).catch(() => errs.push(`never showed ${sel}`));
    await p.waitForTimeout(1800);
    if (act) await act(p).catch((e) => errs.push(`couldn't open: ${String(e.message).split('\n')[0].slice(0, 120)}`));
    await p.waitForTimeout(500);
    // (down the page a screen at a time, and back to the top: what's drawn only once it's scrolled to, e.g. Weather's
    // radar, is then there to check)
    for (let i = 0; i < 12; i++) {
      if (!await p.evaluate(() => { const y = scrollY; scrollBy({ top: innerHeight * 0.8, behavior: 'instant' }); return scrollY > y; })) break;
      await p.waitForTimeout(400);
    }
    await p.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); await p.waitForTimeout(900);
    const a = await p.evaluate(AUDIT), taps = kind === 'desk' ? [] : await p.evaluate(TAPS);
    let axe = [];
    if (sz === 'phone' || sz === 'desk' || sz === 'se') {
      await p.evaluate(AXE);
      axe = await p.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] }, resultTypes: ['violations'] })).violations
        .map((v) => `${v.id} ×${v.nodes.length} (${v.impact}): ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ').slice(0, 140)}`));
    }
    const file = `${name}-${sz}-${scheme}.png`;
    await p.screenshot({ path: `${out}/${file}` });
    const row = { name, size: sz, w, h, scheme, issues: a.issues, ellipsis: a.trunc, taps: [...new Set(taps)].slice(0, 12), axe, errs: [...new Set(errs)], file };
    report.pages.push(row);
    const bad = a.issues.length + errs.length;
    console.log(`${bad ? 'NOTE' : 'ok  '}  ${name} ${sz} ${scheme}: ${a.issues.length} layout, ${taps.length} small taps, ${axe.length} axe, ${errs.length} errors${bad ? '  — ' + [...a.issues, ...errs].slice(0, 4).join(' | ') : ''}`);
  } catch (e) { console.log(`NOTE  ${name} ${sz} ${scheme}: ${String(e.message).split('\n')[0]}`); }
  await p.close(); if (c) await c.close();
}

// each app's first load, from nothing (a phone, an empty cache): what it fetched, how much, and when it showed
async function load(ctxSigned, name, url, sel) {
  const p = await ctxSigned.newPage();
  try {
  const cdp = await ctxSigned.newCDPSession(p); await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  const reqs = [];
  cdp.on('Network.loadingFinished', (e) => reqs.push(e.encodedDataLength));
  const types = {};
  p.on('response', (r) => { const t = r.request().resourceType(); types[t] = (types[t] || 0) + 1; });
  await p.addInitScript(() => { window.__lcp = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); });
  const t0 = Date.now();
  await p.goto(url, { waitUntil: 'load', timeout: 45000 }).catch(() => {});
  await p.waitForSelector(sel, { timeout: 20000 }).catch(() => {});
  const shown = Date.now() - t0;
  await p.waitForTimeout(2500);
  const nav = await p.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), lcp: Math.round(window.__lcp) }; });
  const kb = Math.round(reqs.reduce((a, x) => a + x, 0) / 1024);
  report.loads.push({ name, requests: reqs.length, kb, types, shownMs: shown, ...nav });
  console.log(`load  ${name}: ${reqs.length} requests, ${kb} KB, content shown at ${shown} ms (DCL ${nav.dcl}, load ${nav.load}, LCP ${nav.lcp})`);
  } catch (e) { console.log(`load  ${name}: couldn't measure (${String(e.message).split('\n')[0]})`); }
  await p.close().catch(() => {});
}

// someone for each kind of screen, signed up once; their sign-in carried to each size's browser
const states = {};
for (const kind of ['phone', 'tablet', 'desk']) {
  const ctx = await context(kind, 'dark');
  await person(ctx, kind);
  states[kind] = await ctx.storageState();
  await ctx.close();
}
const save = () => writeFileSync(`${out}/sitewide.json`, JSON.stringify(report, null, 1));
// (LOADS_ONLY=1: just each app's first load)
// (SIZES_FROM=laptop: from that size on, as when a run's been cut short)
for (const size of process.env.LOADS_ONLY ? [] : SIZES.slice(Math.max(0, SIZES.findIndex((s) => s[0] === process.env.SIZES_FROM)))) {
  const kind = size[3];
  await b.close().catch(() => {}); b = await launch();
  for (const scheme of LIGHT.has(size[0]) ? ['dark', 'light'] : ['dark']) {
    const ctx = await context(kind, scheme, states[kind]);
    for (const scr of SCREENS) await look(ctx, size, scheme, scr);
    await ctx.close();
  }
  save();
}
await b.close().catch(() => {}); b = await launch();
const people = { desk: await context('phone', 'dark', states.phone) };
for (const [name, url, sel] of [['home', HOME + '/', '.hero'], ['account', ACCT + '/', '.app, .group'], ['chat', CHAT + '/', '#screen, .hdr'], ['weather', WX + '/?lat=51.5072&lon=-0.1276&name=London', '.day-row'],
  ['fitness', FIT + '/', 'main'], ['markets', MKT + '/', '#pv'], ...(mailUp ? [['mail', MAIL + '/?demo', 'body']] : [])]) await load(people.desk, name, url, sel);
save();
console.log(`${report.pages.length} screens looked at`);
console.log(`FAILS ${fails}`);
await b.close();
