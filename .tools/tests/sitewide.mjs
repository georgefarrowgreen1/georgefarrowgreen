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
// (where every sign-in and sign-up is done: secure, as the apps are, or it can't make its keys)
const AUTH = 'http://auth.ifl.test:8788';
const AXE = readFileSync(`${S}/wr/node_modules/axe-core/axe.min.js`, 'utf8');
const src = readFileSync(`${S}/wr/audit.mjs`, 'utf8');
const AUDIT = eval(src.slice(src.indexOf('const AUDIT = ') + 14, src.indexOf('\nconst b = await')).replace(/;\s*$/, ''));
// what's too small to tap or click, by WCAG 2.2's rule (2.5.8): where a finger or a pointer gets it is under 24px either
// way, and a 24px circle round its middle reaches another target, or another small one's circle. Where it gets it is
// measured, not its box: out from its middle each way, while what's hit there is it, inside it, or its label (a tile's
// title whose ::after covers the tile; a switch in its row). Words linked inside a sentence aside. On a screen that's
// touched, what's under 44px either way is listed too, apart, as advice (near). (Partly scrolled out of a strip, it's
// taken at its size: it's all there as it's scrolled to. Partly off the screen, it's judged where it's scrolled to, not
// here, but is there for those beside it)
const TAPS = (touch) => {
  const SEL = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=switch], [role=tab], [role=link], [role=checkbox], [role=radio], [role=menuitem]';
  const W = innerWidth, H = innerHeight;
  // (whose a tap there is: the target it's in, or the control of the label it's in)
  const whose = (h) => { if (!h) return null; const t = h.closest(SEL); if (t) return t; const l = h.closest('label'); return l ? l.control : null; };
  const shown = (e) => { if (getComputedStyle(e).visibility !== 'visible') return false; for (let x = e; x; x = x.parentElement) if (+getComputedStyle(x).opacity < 0.05) return false; return true; };
  const strip = (e, r) => { for (let x = e.parentElement; x && x !== document.body; x = x.parentElement) { const c = getComputedStyle(x); if (!/auto|scroll/.test(c.overflowX + c.overflowY)) continue; const q = x.getBoundingClientRect(); if (r.left < q.left - 1 || r.right > q.right + 1 || r.top < q.top - 1 || r.bottom > q.bottom + 1) return true; } return false; };
  const all = [];
  for (const e of document.querySelectorAll(SEL)) {
    const r = e.getBoundingClientRect();
    const rs = [r, ...[...(e.labels || [])].map((l) => l.getBoundingClientRect())].filter((q) => q.width && q.height && q.bottom > 0 && q.top < H && q.right > 0 && q.left < W);
    if (!rs.length || !shown(e)) continue;
    // (from its middle, or its label's: a control drawn by its label. Not hit there: under something, or not where it's drawn)
    let s = null, q = null;
    for (const x of rs) { const at = [Math.min(W - 1, Math.max(0, (x.left + x.right) / 2)), Math.min(H - 1, Math.max(0, (x.top + x.bottom) / 2))]; if (whose(document.elementFromPoint(...at)) === e) { s = at; q = x; break; } }
    if (!s) continue;
    const whole = strip(e, q);
    // (how far it's still it, out from the middle one way, a pixel at a time to 64px; to the screen's edge, its own edge
    // at least. Still it at the screen's edge past its own edge (a wider place to tap running off the screen), it isn't
    // judged here; drawn up to the edge itself (icons at the top, a bar at the foot), it is. Within 1.5px of its own edge,
    // it's its edge: a hit test finds a box up to a pixel past it, and a 22.5px target would pass for 24)
    let past = false;
    const snap = (v, edge) => (Math.abs(v - edge) <= 1.5 ? edge : v);
    const reach = (k, dir, edge) => {
      let last = s[k];
      for (let d = 1; d <= 64; d++) {
        const at = [...s]; at[k] += dir * d;
        if (at[k] < 0 || at[k] > (k ? H : W) - 1) { past ||= dir < 0 ? last < edge - 1.5 : last > edge + 1.5; return snap(dir < 0 ? Math.min(edge, last) : Math.max(edge, last), edge); }
        if (whose(document.elementFromPoint(...at)) !== e) return snap(s[k] + dir * (d - 0.5), edge);
        last = at[k];
      }
      return last;
    };
    const [l, rr] = whole || q.width >= 44 ? [q.left, q.right] : [reach(0, -1, q.left), reach(0, 1, q.right)];
    const [t, bt] = whole || q.height >= 44 ? [q.top, q.bottom] : [reach(1, -1, q.top), reach(1, 1, q.bottom)];
    past ||= !whole && (q.left < 0 || q.top < 0 || q.right > W || q.bottom > H);
    all.push({ e, a: { l, r: rr, t, b: bt }, w: Math.round(rr - l), h: Math.round(bt - t), skip: past || (e.tagName === 'A' && !!e.closest('p')) });
  }
  const said = (o) => `${(o.e.getAttribute('aria-label') || o.e.labels?.[0]?.textContent || o.e.textContent || o.e.getAttribute('placeholder') || o.e.getAttribute('title') || o.e.getAttribute('class') || o.e.tagName).trim().replace(/\s+/g, ' ').slice(0, 28)} ${o.w}×${o.h}`;
  const mid = (o) => [(o.a.l + o.a.r) / 2, (o.a.t + o.a.b) / 2];
  const gap = ([x, y], a) => Math.hypot(Math.max(a.l - x, 0, x - a.r), Math.max(a.t - y, 0, y - a.b));
  const under = (o) => o.w < 24 || o.h < 24;
  const small = [], near = [];
  for (const o of all) {
    if (o.skip) continue;
    if (touch && (o.w < 44 || o.h < 44)) near.push(said(o));
    if (!under(o)) continue;
    const c = mid(o);
    if (all.some((x) => x.e !== o.e && (gap(c, x.a) < 12 || under(x) && Math.hypot(c[0] - mid(x)[0], c[1] - mid(x)[1]) < 24))) small.push(said(o));
  }
  return { small, near };
};
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
  args: ['--disable-dev-shm-usage', '--host-resolver-rules=MAP *.gfg.test 127.0.0.1, MAP gfg.test 127.0.0.1, MAP *.ifl.test 127.0.0.1, MAP ifl.test 127.0.0.1', `--unsafely-treat-insecure-origin-as-secure=${HOME},${AUTH},${CHAT},${MKT},${ACCT},${WX},${FIT}`] });
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
  // (on a computer, Chat's page says it isn't available there, with a code to scan; on a phone on its side, to turn it
  // upright: those are its screens there)
  ['chat', CHAT + '/', null, '#screen .view, .na-qr:not([hidden]), .rotate'],
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

// the screen's own scrollers (a list, a thread, a column): seen, on the screen and not under anything, holding more than
// they show; the biggest four, each to be stepped towards its far end (down, or up where it's at its foot: a thread) and
// put back as it was (by its foot, there: older messages may come in above)
const SCROLLERS = () => {
  const out = [];
  for (const x of document.body.querySelectorAll('*')) {
    const c = getComputedStyle(x);
    if (!/auto|scroll/.test(c.overflowY) || x.scrollHeight <= x.clientHeight + 40 || c.visibility !== 'visible') continue;
    const r = x.getBoundingClientRect(), l = Math.max(r.left, 0), rr = Math.min(r.right, innerWidth), t = Math.max(r.top, 0), b = Math.min(r.bottom, innerHeight);
    if (rr - l < 120 || b - t < 120) continue;
    const h = document.elementFromPoint((l + rr) / 2, (t + b) / 2);
    if (h && (h === x || x.contains(h))) out.push([x, (rr - l) * (b - t)]);
  }
  const list = out.sort((a, b) => b[1] - a[1]).slice(0, 4).map(([x]) => {
    const left = x.scrollHeight - x.clientHeight - x.scrollTop, down = left >= x.scrollTop;
    return { x, down, was: down ? x.scrollTop : left };
  });
  window.__sweep = {
    step: (i) => { const { x, down } = list[i], y = x.scrollTop; x.scrollBy({ top: (down ? 0.8 : -0.8) * x.clientHeight, behavior: 'instant' }); return x.scrollTop !== y; },
    back: (i) => { const { x, down, was } = list[i]; x.scrollTo({ top: down ? was : x.scrollHeight - x.clientHeight - was, behavior: 'instant' }); },
  };
  return list.length;
};
async function shot(p, kind, size, scheme, [name, url, act, sel], errs) {
  const [sz, w, h] = size;
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // (any of them shown: the first in the page may be one that's hidden at this size)
  await p.waitForSelector(sel.split(',').map((x) => `${x.trim()}:visible`).join(', '), { timeout: 20000 }).catch(() => errs.push(`never showed ${sel}`));
  await p.waitForTimeout(1800);
  if (act) await act(p).catch((e) => errs.push(`couldn't open: ${String(e.message).split('\n')[0].slice(0, 120)}`));
  await p.waitForTimeout(500);
  // (down the page a screen at a time, and back to the top: what's drawn only once it's scrolled to, e.g. Weather's
  // radar, is then there to check; and each step is checked as it's seen, for what's only found on the screen, as a box
  // drawn over part of a text)
  const seen = [];
  for (let i = 0; i < 12; i++) {
    if (!await p.evaluate(() => { const y = scrollY; scrollBy({ top: innerHeight * 0.8, behavior: 'instant' }); return scrollY > y; })) break;
    await p.waitForTimeout(400);
    seen.push(await p.evaluate(AUDIT));
  }
  await p.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); await p.waitForTimeout(900);
  const a = await p.evaluate(AUDIT);
  // (then the screen's own scrollers, a step at a time within a cap, each step checked, and each put back)
  const n = await p.evaluate(SCROLLERS);
  for (let i = 0, steps = 0; i < n && steps < 16; i++) {
    for (let k = 0; k < 6 && steps < 16; k++, steps++) {
      if (!await p.evaluate((i) => window.__sweep.step(i), i)) break;
      await p.waitForTimeout(400);
      seen.push(await p.evaluate(AUDIT));
    }
    await p.evaluate((i) => window.__sweep.back(i), i); await p.waitForTimeout(300);
  }
  if (n) await p.waitForTimeout(600);
  // (what was found only while scrolled, listed with the rest and apart, as scrolled)
  const scrolled = [...new Set(seen.flatMap((r) => r.issues))].filter((x) => !a.issues.includes(x));
  const ellipsis = [...new Set([...a.trunc, ...seen.flatMap((r) => r.trunc)])];
  const taps = await p.evaluate(TAPS, kind !== 'desk');
  let axe = [];
  if (sz === 'phone' || sz === 'desk' || sz === 'se') {
    await p.evaluate(AXE);
    axe = await p.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] }, resultTypes: ['violations'] })).violations
      .map((v) => `${v.id} ×${v.nodes.length} (${v.impact}): ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ').slice(0, 140)}`));
  }
  const file = `${name}-${sz}-${scheme}.png`;
  await p.screenshot({ path: `${out}/${file}` });
  const issues = [...a.issues, ...scrolled];
  report.pages.push({ name, size: sz, w, h, scheme, issues, scrolled, ellipsis, taps: [...new Set(taps.small)].slice(0, 12), near: [...new Set(taps.near)].slice(0, 12), nearCount: taps.near.length, axe, errs: [...new Set(errs)], file });
  const bad = issues.length + errs.length;
  console.log(`${bad ? 'NOTE' : 'ok  '}  ${name} ${sz} ${scheme}: ${issues.length} layout, ${taps.small.length} small taps${taps.near.length ? ` (${taps.near.length} under 44)` : ''}, ${axe.length} axe, ${errs.length} errors${bad ? '  — ' + [...issues, ...errs].slice(0, 4).join(' | ') : ''}`);
}
// (each screen on its own: one that crashes, or hangs, is tried once more on a fresh context (and a fresh browser, if
// that's what went down), and then reported, and the run goes on)
async function renew(kit) {
  await kit.ctx?.close().catch(() => {});
  for (let k = 0; ; k++) {
    try {
      if (!b.isConnected()) b = await launch();
      kit.ctx = await context(kit.kind, kit.scheme, states[kit.kind]);
      await (await kit.ctx.newPage()).close();   // (a browser that's going down can still give a context, but not a page)
      return;
    } catch (e) {
      if (k) throw e;
      await b.close().catch(() => {}); b = await launch();
    }
  }
}
async function look(kit, size, scheme, scr) {
  const [name, , , , o = {}] = scr, [sz, w, h, kind] = size;
  if (o.mail && !mailUp) return;
  if (o.phone && w >= 1100) return;
  for (let k = 0; ; k++) {
    let c = null, p = null, timer = 0;
    const errs = [];
    try {
      c = o.fresh ? await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: kind === 'desk' ? 1 : 2, isMobile: kind === 'phone', hasTouch: kind !== 'desk', userAgent: kind === 'phone' ? IPHONE : kind === 'tablet' ? IPAD : MAC, locale: 'en-GB', colorScheme: scheme, serviceWorkers: 'block' }) : null;
      p = await (c || kit.ctx).newPage();
      await p.setViewportSize({ width: w, height: h });
      p.on('pageerror', (e) => errs.push(String(e.message || e).slice(0, 160)));
      p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 40[134]/.test(m.text())) errs.push(m.text().slice(0, 160)); });
      const hung = new Promise((_, no) => { timer = setTimeout(() => no(new Error('hung for 4 minutes')), 240e3); p.once('crash', () => no(new Error('the page crashed'))); });
      await Promise.race([shot(p, kind, size, scheme, scr, errs), hung]);
      return;
    } catch (e) {
      const why = String(e.message || e).split('\n')[0].slice(0, 160);
      if (k) {
        report.pages.push({ name, size: sz, w, h, scheme, issues: [], scrolled: [], ellipsis: [], taps: [], near: [], nearCount: 0, axe: [], errs: [`couldn't look, twice: ${why}`], file: null });
        console.log(`NOTE  ${name} ${sz} ${scheme}: couldn't look, twice (${why})`);
        return;
      }
      console.log(`again ${name} ${sz} ${scheme}: ${why}`);
      await renew(kit).catch((e) => console.log(`      (no fresh context: ${String(e.message).split('\n')[0]})`));
    } finally {
      clearTimeout(timer);
      await p?.close().catch(() => {}); await c?.close().catch(() => {});
    }
  }
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
    const kit = { kind, scheme, ctx: null };
    await renew(kit).catch((e) => console.log(`      (no context for ${size[0]} ${scheme}: ${String(e.message).split('\n')[0]}; each screen tries again)`));
    for (const scr of SCREENS) await look(kit, size, scheme, scr);
    await kit.ctx?.close().catch(() => {});
  }
  save();
}
await b.close().catch(() => {}); b = await launch();
const people = { desk: await context('phone', 'dark', states.phone) };
for (const [name, url, sel] of [['home', HOME + '/', '.hero'], ['account', ACCT + '/', '.app, .group'], ['chat', CHAT + '/', '#screen .view'], ['weather', WX + '/?lat=51.5072&lon=-0.1276&name=London', '.day-row'],
  ['fitness', FIT + '/', 'main'], ['markets', MKT + '/', '#pv'], ...(mailUp ? [['mail', MAIL + '/?demo', 'body']] : [])]) await load(people.desk, name, url, sel);
save();
console.log(`${report.pages.length} screens looked at`);
console.log(`FAILS ${fails}`);
await b.close();
