const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { resolve, extname } = require('node:path');
const { existsSync, readFileSync } = require('node:fs');
const { pathToFileURL } = require('node:url');
const { chromium, webkit } = require('playwright');
const ROOT = process.env.MARKETS_TEST_ROOT || resolve(__dirname, '../..');
const IFL = process.env.INFLITE_TEST_ROOT || resolve(ROOT, '../inflite');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
let browser, serveKit, KIT, fixtures;
before(async () => {
  ({ serveKit, KIT } = await import(pathToFileURL(ROOT + '/.tools/tests/roofkit/serve.mjs')));
  fixtures = await import(pathToFileURL(ROOT + '/.tools/tests/unit/fixtures/mk.mjs'));
  browser = process.env.MARKETS_BROWSER === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] });
});
after(async () => browser?.close());
async function world({ hosted, day = 'missing', cash = false, motion = 'reduce', holdMonth = false }) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: motion, serviceWorkers: 'block' });
  if (hosted) await serveKit(ctx, { main: ROOT + '/', ifl: IFL + '/' });
  else await ctx.route('http://finance.kit.test/**', async (route) => {
    const u = new URL(route.request().url()); if (u.pathname.startsWith('/api/')) return route.fallback();
    const file = resolve(ROOT + '/markets', '.' + (u.pathname === '/' ? '/index.html' : u.pathname));
    if (!file.startsWith(ROOT + '/markets/') || !existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({ body: readFileSync(file), contentType: MIME[extname(file)] || 'application/octet-stream' });
  });
  const acc = fixtures.account(); acc.holdings = acc.holdings.filter((x) => x.symbol === 'TSCO.L');
  acc.cash = cash ? [{ id: '00000000-0000-4000-8000-000000000001', name: 'Savings', amount: 5000, rate: 4, tier: null, payout: null, account: null, added: Date.now(), updated: Date.now() }] : [];
  if (cash) acc.holdings = [];
  const clearDay = (kind = 'missing') => { for (const q of Object.values(acc.quotes)) { q.sparkT = kind === 'one' ? [Math.floor(Date.now() / 1000)] : []; q.spark = kind === 'one' ? [q.price] : []; } };
  if (day !== 'full') clearDay(day);
  const api = fixtures.marketsApi({ acc }), requests = []; let releaseMonth;
  const monthGate = new Promise((ok) => { releaseMonth = ok; });
  await ctx.route('**/api/markets/**', async (route) => {
    const req = route.request(), u = new URL(req.url());
    if (u.pathname.endsWith('/chart')) {
      const range = u.searchParams.get('r'); requests.push(range);
      if (range === '1mo' && holdMonth) await monthGate;
      const t = Math.floor(Date.now() / 1000), prices = range === '5d' ? [3.1, 3.11, 3.12] : range === '1y' ? [2, 2.5, 3.12] : [2.9, 3, 3.12];
      return route.fulfill({ json: { t: [t - 30 * 86400, t - 15 * 86400, t], c: prices, prev: prices[0], base: prices[0], cur: 'GBP', tz: 'Europe/London' } });
    }
    const result = await api.fetch(req.url(), { method: req.method(), body: req.postData() });
    return route.fulfill({ status: result.ok ? 200 : 404, json: await result.json() });
  });
  await ctx.addInitScript(() => { window.__chartRejections = []; addEventListener('unhandledrejection', (e) => window.__chartRejections.push(String(e.reason?.stack || e.reason))); });
  const p = await ctx.newPage(), errors = []; p.setDefaultTimeout(10000); p.on('pageerror', (e) => errors.push(e.message));
  if (hosted) { await p.goto(KIT + '/?module=/markets/roof/markets.js&apps=weather,markets'); await p.waitForFunction(() => window.kit?.ready); await p.evaluate(() => kit.F.nav.go('/markets/')); }
  else await p.goto('http://finance.kit.test/');
  await p.locator('.pseg.range-controls').waitFor();
  await p.waitForFunction((hosted) => (hosted ? document.querySelector('.m-markets [data-el=pv]') : document.querySelector('#pv'))?.textContent.includes('£'), hosted);
  const select = async (range) => p.locator(`.pseg button[data-r="${range}"]`).click();
  const refresh = async () => {
    if (hosted) await p.evaluate(async () => { const core = await import('/markets/roof/core.js'); await core.refresh(); });
    else { const response = p.waitForResponse((r) => new URL(r.url()).pathname.endsWith('/quotes')); await p.evaluate(() => dispatchEvent(new Event('online'))); await response; }
    await p.waitForFunction(async ({ hosted, length, price }) => { const core = await import(hosted ? '/markets/roof/core.js' : '/app.js'), q = core.S.q['TSCO.L']; return q?.sparkT?.length === length && q.price === price; }, { hosted, length: acc.quotes['TSCO.L'].sparkT?.length || 0, price: acc.quotes['TSCO.L'].price });
  };
  const nav = async (section) => { if (hosted) await p.evaluate((s) => kit.F.nav.go('/markets/' + (s === 'today' ? '' : '#holdings')), section); else await p.locator(`[data-tab="${section}"]`).click(); };
  return { ctx, p, acc, errors, clearDay, requests, releaseMonth, select, refresh, nav, hosted };
}
const chartSelector = (hosted) => hosted ? '.m-markets [data-el=pchart]' : '#pchart';
async function drawn(w, range, said, change) {
  const handle = await w.p.waitForFunction(({ hosted, range, said }) => {
    const chart = document.querySelector(hosted ? '.m-markets [data-el=pchart]' : '#pchart'), label = document.querySelector(hosted ? '.m-markets [data-el=ps]' : '#ps');
    const paths = chart && [...chart.querySelectorAll('path')], geometry = paths?.map((n) => n.getAttribute('d'));
    if (document.querySelector(`.pseg button[data-r="${range}"]`)?.getAttribute('aria-pressed') !== 'true' || label?.textContent !== said || paths?.length !== 2 || !geometry.every((d) => d?.startsWith('M') && !/NaN|Infinity/.test(d))) return false;
    return { geometry, lines: chart.querySelectorAll('path[data-draw]').length, change: document.querySelector(hosted ? '.m-markets [data-el=pd]' : '#pd')?.textContent };
  }, { hosted: w.hosted, range, said });
  const snapshot = await handle.jsonValue(); assert.equal(snapshot.lines, 1); assert.match(snapshot.change, change);
  assert.deepEqual(w.errors, []); assert.deepEqual(await w.p.evaluate(() => window.__chartRejections), []);
}
async function scrub(w, amount, fraction = 1) {
  const box = w.p.locator(w.hosted ? '.m-markets [data-el=pbox]' : '#pbox');
  await box.scrollIntoViewIfNeeded(); const visible = await box.boundingBox(); await box.tap({ position: { x: Math.min(visible.width - 4, visible.width * fraction), y: visible.height / 2 } });
  await w.p.waitForFunction(({ hosted, amount }) => document.querySelector(hosted ? '.m-markets .pbox .scrub-tip' : '#pbox .scrub-tip')?.textContent.includes(amount), { hosted: w.hosted, amount });
}
for (const hosted of [true, false]) for (const day of ['missing', 'one']) test(`history renders when the initial day chart is ${day} ${hosted ? 'in Today' : 'standalone'}`, async () => {
  const w = await world({ hosted, day });
  try {
    assert.equal(await w.p.locator(chartSelector(hosted)).evaluate((svg) => svg.querySelector('path[data-draw]')?.getAttribute('d') || ''), '', 'missing day history must not become fabricated points');
    await w.select('5d'); await drawn(w, '5d', 'this week', /\+£20\.00/);
    await w.select('1mo'); await drawn(w, '1mo', 'this month', /\+£220\.00/); await scrub(w, '£3,120');
    const before = await w.p.locator(chartSelector(hosted) + ' path[data-draw]').getAttribute('d'); await w.select('1d');
    await w.p.waitForFunction(() => document.querySelector('.pseg [data-r="1mo"]')?.getAttribute('aria-pressed') === 'true');
    assert.equal(await w.p.locator(chartSelector(hosted) + ' path[data-draw]').getAttribute('d'), before, 'unavailable day data leaves the valid month chart intact');
    assert.deepEqual(w.errors, []); assert.deepEqual(await w.p.evaluate(() => window.__chartRejections), []);
  } finally { w.releaseMonth(); await w.ctx.close(); }
});
for (const hosted of [true, false]) test(`retained Month restores after quotes lose their day history ${hosted ? 'in Today' : 'standalone'}`, async () => {
  const w = await world({ hosted, day: 'full' });
  try { await w.select('1mo'); await drawn(w, '1mo', 'this month', /\+£220\.00/); await w.nav('holdings'); w.clearDay(); await w.refresh(); await w.nav('today'); await drawn(w, '1mo', 'this month', /\+£220\.00/); await scrub(w, '£3,120'); }
  finally { w.releaseMonth(); await w.ctx.close(); }
});
for (const hosted of [true, false]) test(`cash-only charts remain readable through ranges ${hosted ? 'in Today' : 'standalone'}`, async () => {
  const w = await world({ hosted, cash: true });
  try { for (const [range, said] of [['1mo', 'this month'], ['5d', 'this week'], ['1d', 'today']]) { await w.select(range); await drawn(w, range, said, /\+£0\.00/); await scrub(w, '£5,000'); } }
  finally { w.releaseMonth(); await w.ctx.close(); }
});
for (const hosted of [true, false]) test(`day history arriving later paints the empty chart even when portfolio value is unchanged ${hosted ? 'in Today' : 'standalone'}`, async () => {
  const w = await world({ hosted });
  try {
    const quote = w.acc.quotes['TSCO.L'], t = Math.floor(Date.now() / 1000); quote.sparkT = [t - 900, t - 450, t]; quote.spark = [3.05, 3.08, 3.12]; await w.refresh();
    await drawn(w, '1d', 'today', /\+£70\.00/); await scrub(w, '£3,120');
  } finally { w.releaseMonth(); await w.ctx.close(); }
});
test('a delayed range cannot corrupt a replacement chart after navigating away', async () => {
  const w = await world({ hosted: true, day: 'full', holdMonth: true, motion: 'no-preference' });
  try {
    const requested = w.p.waitForRequest((r) => new URL(r.url()).pathname.endsWith('/chart') && new URL(r.url()).searchParams.get('r') === '1mo'); await w.select('1mo'); await requested;
    await w.nav('holdings'); w.clearDay(); await w.refresh(); await w.nav('today'); w.releaseMonth();
    await drawn(w, '1mo', 'this month', /\+£220\.00/); await scrub(w, '£3,120');
    await w.select('1y'); await drawn(w, '1y', 'this year', /\+£1,120\.00/); await w.p.waitForTimeout(850);
    await drawn(w, '1y', 'this year', /\+£1,120\.00/); await scrub(w, '£3,120');
  } finally { w.releaseMonth(); await w.ctx.close(); }
});

test('an unavailable Day does not interrupt a valid Month morph', async () => {
  const w = await world({ hosted: true, motion: 'no-preference' });
  try {
    await w.select('5d'); await drawn(w, '5d', 'this week', /\+£20\.00/);
    await w.select('1mo'); await w.p.waitForTimeout(120); await w.select('1d');
    await drawn(w, '1mo', 'this month', /\+£220\.00/);
    await w.p.waitForFunction(() => document.querySelector('.m-markets [data-el=pchart] path[data-draw]')?.getAttribute('d').includes('Q195.0 80.5'));
    await scrub(w, '£3,000', 0.5);
    assert.deepEqual(w.errors, []); assert.deepEqual(await w.p.evaluate(() => window.__chartRejections), []);
  } finally { w.releaseMonth(); await w.ctx.close(); }
});
test('live Day refresh wins over the preceding range animation', async () => {
  const w = await world({ hosted: true, day: 'full', motion: 'no-preference' });
  try {
    await w.select('1mo'); await drawn(w, '1mo', 'this month', /\+£220\.00/);
    await w.select('1d'); await w.p.waitForTimeout(120);
    const q = w.acc.quotes['TSCO.L'], t = Math.floor(Date.now() / 1000); q.price = 3.13; q.sparkT = [t - 900, t - 450, t]; q.spark = [3.05, 3.08, 3.13]; await w.refresh();
    await drawn(w, '1d', 'today', /\+£80\.00/); await w.p.waitForTimeout(900);
    await drawn(w, '1d', 'today', /\+£80\.00/); await scrub(w, '£3,130');
    assert.equal(await w.p.locator(chartSelector(true)).evaluate((svg) => svg.portfolio.raw.r), '1d');
  } finally { w.releaseMonth(); await w.ctx.close(); }
});
