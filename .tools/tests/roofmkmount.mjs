// Markets' real module on InFlite's framework, before Today is on it (One roof stage 2, spec §2.1, §4.2, §9.2 MK): the
// kit page (roofkit/serve.mjs) at http://kit.test with ?module=/markets/roof/markets.js and Markets switched on in the
// session (?apps=weather,markets), MAIN's markets/ and the inflite repo's today/public/ from disk, Markets' API stood in
// by mocks/mkroof.mjs. Selectors only from roofhooks.mjs. Checked:
//   the module mounts in main#m-markets, its three sections show and the address follows; the header: the section's
//   name, Add a Stock (plus); Add a Stock's field focused in the same tap, its results; Today's portfolio hero and its
//   Send; a stock's sheet (Send, Remove, Alert Me's own percent sent as PUT /api/markets/alert), the holding sheet;
//   Holdings: Change Order (Move Down: PUT order, the live line), an account's sheet, About These Prices; News: a story's
//   sheet; cold links #income #isa #vs #about #s=%5EGSPC open their sheets over their section; no document-wide lookup by
//   the module at any point (document.querySelector/getElementById instrumented); no amount in any request's address;
//   screenshots at 320, 390 and 1280 px, light and dark; after Markets is left for five minutes (the page's clock stood
//   in) the section's DOM is let go, and drawn afresh on the next show.
//   node .tools/tests/roofmkmount.mjs [state dir] [screenshots dir]      (run.sh does this)
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import * as H from './roofhooks.mjs';
import { routeMarkets } from './mocks/mkroof.mjs';

const [,, S = new URL('./.state', import.meta.url).pathname, OUT = `${S}/out/roofmkmount`] = process.argv;
mkdirSync(OUT, { recursive: true });
let fails = 0;
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${!c && extra ? '  — ' + extra : ''}`); if (!c) fails++; return !!c; };
const note = (l) => console.log(`NOTE  ${l}`);
const MAIN = new URL('../../', import.meta.url).pathname, IFL = new URL('../../../inflite/', import.meta.url).pathname;
process.on('uncaughtException', (e) => { console.log(`FAIL  ${String(e?.stack || e).split('\n').slice(0, 3).join(' | ')}`); console.log(`FAILS ${fails + 1}`); process.exit(0); });
process.on('unhandledRejection', (e) => { console.log(`FAIL  ${String(e?.stack || e).split('\n').slice(0, 3).join(' | ')}`); console.log(`FAILS ${fails + 1}`); process.exit(0); });

if (!existsSync(`${IFL}today/public/roof/frame.js`)) { ok(false, 'the inflite repo, with the framework, is beside this one'); console.log(`FAILS ${fails}`); process.exit(0); }
const { serveKit, KIT } = await import('./roofkit/serve.mjs');
const MODULE = '/markets/roof/markets.js';
const now = Date.now();

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function phone({ width = 390, height = 844, colorScheme = 'dark' } = {}) {
  const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: width < 900, isMobile: width < 900, colorScheme, locale: 'en-GB', timezoneId: 'Europe/London' });
  await ctx.addInitScript(() => {
    // every document-wide lookup the module makes itself: its caller a /markets/ file (S2-D3; the framework's own, which
    // the module's calls reach, as fw.toast's, are the framework's)
    const seen = (window.__mkLookups = []);
    for (const k of ['querySelector', 'querySelectorAll', 'getElementById', 'getElementsByClassName', 'getElementsByTagName']) {
      const f = Document.prototype[k];
      Document.prototype[k] = function (...a) { const by = (new Error().stack || '').split('\n')[2] || ''; if (/\/markets\/(roof\/)?[\w-]+\.js/.test(by)) seen.push(`${k}(${a[0]}) ${(/(\/markets\/[\w/.-]+\.js:\d+)/.exec(by) || [])[1]}`); return f.apply(this, a); };
    }
  });
  await serveKit(ctx, { main: MAIN, ifl: IFL });
  const st = await routeMarkets(ctx, KIT, { now });
  st.errors = [];
  const p = await ctx.newPage();
  p.on('pageerror', (e) => st.errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|WebGL|GPU stall|swiftshader/i.test(m.text())) st.errors.push(m.text()); });
  return { ctx, p, st };
}
const shot = async (p, name) => { await p.waitForTimeout(700); return p.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {}); };
const visible = (p, sel) => p.locator(sel).first().isVisible().catch(() => false);
const until = async (fn, ms = 8000) => { const t0 = Date.now(); for (;;) { let v; try { v = await fn(); } catch (_) { v = false; } if (v) return v; if (Date.now() - t0 > ms) return v; await new Promise((ok) => setTimeout(ok, 100)); } };
const text = (p, sel) => p.locator(sel).first().textContent({ timeout: 3000 }).catch(() => '');
const go = (p, path) => p.evaluate((path) => window.kit.F.nav.go(path), path);
const addr = (p) => p.evaluate(() => location.pathname + location.hash);
const openSheet = (name) => `${H.sheet(name)}[open]`;
const closeSheet = async (p) => { await p.locator(H.SHEET_CLOSE).last().click().catch(() => {}); await until(async () => !(await visible(p, H.SHEET_OPEN)), 4000); };
async function openMarkets(p, path = '/markets/') {
  await p.goto(`${KIT}/?module=${MODULE}&apps=weather,markets`);
  await until(() => p.evaluate(() => !!window.kit?.ready), 10000);
  await go(p, path);
  return until(() => visible(p, `${H.M_MARKETS} ${H.MK_SEC}:not([hidden])`), 15000);
}

// ===================== 1. mount, sections, header, Add a Stock, Today =====================
const { p, st, ctx } = await phone();
ok(await openMarkets(p), 'the module mounts in main#m-markets and a section shows (§5.1)');
ok(await p.locator(`${H.M_MARKETS} ${H.MK_SEC}`).count() === 3, 'three sections: Today, Holdings, News');
ok(await until(async () => (await text(p, H.HD_TITLE)).trim() === 'Today'), 'the header’s title: the section’s name', await text(p, H.HD_TITLE));
ok(await until(() => visible(p, H.MK_HERO), 10000), 'Today: the portfolio hero (MK_HERO)');
ok(await visible(p, H.MK_PORTFOLIO_SEND), 'its Send (MK_PORTFOLIO_SEND)');
ok(await visible(p, `${H.mkRow('TSCO.L')}:visible`), 'a holding’s row (mkRow)');
ok(await visible(p, H.HD_PLUS), 'Add a Stock in the header (plus)');
for (const id of ['holdings', 'news', 'today']) {
  await p.locator(H.hdSec(id)).click();
  ok(await until(() => visible(p, H.mkSec(id))), `section ${id} shows`);
  ok(await until(async () => (await addr(p)) === (id === 'today' ? '/markets/' : `/markets/#${id}`)), `the address follows: ${id}`, await addr(p));
}
await shot(p, '1-today-390-dark');
// Add a Stock: the field focused in the same tap, its results
await p.locator(H.HD_PLUS).click();
ok(await until(() => visible(p, H.MK_ADD_INPUT)), 'Add a Stock opens its sheet (MK_ADD_INPUT)');
ok(await p.evaluate((sel) => document.activeElement === document.querySelector(sel), H.MK_ADD_INPUT), 'its field has the focus, from the tap itself (RI9)');
ok(await until(() => visible(p, H.MK_ADD_RESULT)), 'rows to browse (MK_ADD_RESULT)');
await p.locator(H.MK_ADD_INPUT).fill('bar');
ok(await until(async () => (await p.locator(`${H.MK_ADD_RESULT}[data-sym="BARC.L"]`).count()) > 0), 'typed: Markets’ own answer (GET /api/markets/search)');
await shot(p, '2-add-stock');
await closeSheet(p);
// a stock's sheet: Send, Remove, Alert Me's own percent, the holding sheet
await p.locator(`${H.mkRow('TSCO.L')}:visible`).first().click();
ok(await until(() => visible(p, openSheet('stock'))), 'a row opens the stock sheet');
ok(await until(() => visible(p, H.MK_STOCK_SEND)), 'its Send (MK_STOCK_SEND)');
ok(await visible(p, H.MK_STOCK_REMOVE), 'its Remove (MK_STOCK_REMOVE)');
await shot(p, '3-stock');
await p.locator(`${H.sheet('stock')} [data-el="alert"]`).click();
ok(await until(() => visible(p, H.MK_ALERT)), 'Alert Me: its own percent (MK_ALERT)');
await p.locator(H.MK_ALERT).fill('4');
await p.locator(H.MK_ALERT).press('Enter');
ok(await until(() => st.log.some((c) => c.path === 'alert' && JSON.parse(c.body || '{}').pct === 4)), 'saved: PUT /api/markets/alert { pct: 4 }');
ok(await until(async () => !(await visible(p, H.MK_ALERT))), 'and back to the stock');
await p.locator(`${H.sheet('stock')} button:has-text("Edit Holding")`).first().click();
ok(await until(() => visible(p, openSheet('holding'))), 'Edit Holding: the holding sheet');
await closeSheet(p);

// ===================== 2. Holdings, News, the cold links' sheets =====================
await p.locator(H.hdSec('holdings')).click();
await until(() => visible(p, H.MK_EDIT), 10000);
await p.locator(H.MK_EDIT).click();
ok(await until(() => visible(p, H.mkMove('TSCO.L', 'down'))), 'Change Order: Move Down (mkMove)');
await p.locator(H.mkMove('TSCO.L', 'down')).click();
ok(await until(() => st.log.some((c) => c.path === 'order')), 'kept: PUT /api/markets/order');
ok(await until(async () => /Tesco: 2 of \d/.test(await p.locator(`${H.M_MARKETS} [data-el="order-say"]`).textContent())), 'said in the live line');
ok(await p.evaluate((sel) => document.activeElement?.matches(sel), H.mkMove('TSCO.L', 'down')), 'the keyboard stays on the one moved');
await p.locator(H.MK_EDIT).click();
await p.locator(`${H.MK_ACCOUNT_ROW}:visible`).first().evaluate((e) => e.scrollIntoView({ block: 'center' }));
await p.locator(`${H.MK_ACCOUNT_ROW}:visible`).first().click();
ok(await until(() => visible(p, openSheet('mk-account'))), 'an account’s row opens mk-account');
await closeSheet(p);
await p.locator(H.MK_ABOUT).click();
ok(await until(() => visible(p, openSheet('mk-about'))), 'About These Prices (mk-about)');
ok(/isn't financial advice/.test(await text(p, openSheet('mk-about'))), 'its words: not advice');
await closeSheet(p);
await shot(p, '4-holdings');
await p.locator(H.hdSec('news')).click();
ok(await until(() => visible(p, H.mkStory('s1')), 10000), 'News: a story (mkStory)');
await p.locator(`${H.mkStory('s1')} a.story`).click();
ok(await until(() => visible(p, openSheet('story'))), 'opened in Markets: the story sheet');
await closeSheet(p);
await shot(p, '5-news');
for (const [hash, name] of [['income', 'income'], ['isa', 'isa'], ['vs', 'vs'], ['about', 'mk-about'], ['s=%5EGSPC', 'stock']]) {
  await go(p, `/markets/#${hash}`);
  ok(await until(() => visible(p, openSheet(name)), 10000), `cold link #${hash}: the ${name} sheet`);
  if (name === 'stock') ok(/S&P 500/.test(await text(p, openSheet('stock'))), 'the index asked for', (await text(p, openSheet('stock'))).slice(0, 80));
  await shot(p, `6-${name}`);
  await closeSheet(p);
}
const lookups = await p.evaluate(() => window.__mkLookups);
ok(lookups.length === 0, 'no document-wide lookup by the module (S2-D3)', lookups.slice(0, 3).join(' | '));
const amounts = st.log.filter((c) => /£|%C2%A3|value=|amount=/i.test(c.query));
ok(amounts.length === 0, 'no amount in any request’s address', amounts.map((c) => c.query).join(' '));
ok(!(await p.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('today:') && !['today:appearance'].includes(k)))), 'nothing under today:*');
ok((await p.evaluate(() => JSON.parse(localStorage.getItem('markets:last') || 'null')?.id)) === st.acc.id, 'markets:last carries its account’s id (S2-D9)');
ok(st.errors.length === 0, 'no page errors', st.errors.slice(0, 3).join(' | '));
await ctx.close();

// ===================== 3. 320, 390 and 1280, light and dark =====================
for (const [width, height] of [[320, 640], [390, 844], [1280, 860]]) for (const colorScheme of ['light', 'dark']) {
  const { p, st, ctx } = await phone({ width, height, colorScheme });
  await openMarkets(p);
  await until(() => visible(p, H.MK_HERO), 10000);
  await p.waitForTimeout(900);
  await shot(p, `w${width}-${colorScheme}-today`);
  const wide = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  ok(wide, `${width} ${colorScheme}: no sideways scroll`);
  await p.locator(H.hdSec('holdings')).click(); await until(() => visible(p, H.MK_EDIT), 8000); await p.waitForTimeout(600);
  await shot(p, `w${width}-${colorScheme}-holdings`);
  await p.locator(`${H.mkRow('TSCO.L')}:visible`).first().click(); await until(() => visible(p, openSheet('stock'))); await p.waitForTimeout(900);
  await shot(p, `w${width}-${colorScheme}-stock`);
  ok(st.errors.length === 0, `${width} ${colorScheme}: no page errors`, st.errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ===================== 4. five minutes away: the DOM let go, and back =====================
{
  const { p, st, ctx } = await phone();
  await p.clock.install();
  await openMarkets(p);
  await until(() => visible(p, H.MK_HERO), 10000);
  await go(p, '/');
  await until(() => visible(p, H.TODAY));
  await p.clock.fastForward('04:30');
  ok(await p.evaluate((sel) => document.querySelector(sel)?.childElementCount > 0, `${H.M_MARKETS} ${H.mkSec('today')}`), 'out of sight under five minutes: kept');
  await p.clock.fastForward('01:00');
  ok(await until(() => p.evaluate((sel) => document.querySelector(sel)?.childElementCount === 0, `${H.M_MARKETS} ${H.mkSec('today')}`), 4000), 'after five minutes out of sight: its DOM let go (S2-D22)');
  const quotes = () => st.log.filter((c) => c.path === 'quotes').length, q0 = quotes();
  await go(p, '/markets/');
  ok(await until(() => visible(p, H.MK_HERO), 8000), 'drawn afresh on the next show');
  // (the one refresh on coming back after half a minute or more away: waited for, however slow the machine, so none
  // is still on its way when Markets is left)
  ok(await until(() => quotes() > q0, 10000), 'back after five minutes: prices asked for again at once (S2-D4)');
  await p.waitForTimeout(800);
  const before = quotes();
  await go(p, '/');
  await p.clock.fastForward('02:00');
  await p.waitForTimeout(800);
  ok(st.log.filter((c) => c.path === 'quotes').length === before, 'no prices asked for while Markets isn’t shown (S2-D4)');
  ok(st.errors.length === 0, 'no page errors (five minutes away)', st.errors.slice(0, 3).join(' | '));
  await ctx.close();
}

await b.close();
console.log(`FAILS ${fails}`);
