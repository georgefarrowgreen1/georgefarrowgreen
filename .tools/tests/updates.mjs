// The updater every app shares (InFlite's menu: IFL.updates). Each app's /version says the build it's deployed with
// (functions/_version.js). A newer one, stood in for here: put in at once if the app's only just opened and nothing's
// been touched, and once only (the copy that loads still says the old number: it's not loaded over and over); never
// while it's busy (InFlite's menu open), the menu's foot saying Update instead, which, tapped, updates it and opens it
// where you were (the tab you were on); and, left be for a moment once you've touched it, put in by itself.
import { chromium } from 'playwright';
import http from 'http';
import { readFileSync } from 'fs';
import { makeAccount } from './join.mjs';
const [,, S, out] = process.argv;
const PORT = 8788, H = (sub) => `http://${sub}.ifl.test:${PORT}`;
const MKT = H('finance'), FIT = H('fitness'), WX = H('weather'), CHAT = H('chat'), ACCT = H('account'), AUTH = H('auth');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--host-resolver-rules=MAP *.ifl.test 127.0.0.1, MAP ifl.test 127.0.0.1', `--unsafely-treat-insecure-origin-as-secure=${MKT},${FIT},${WX},${CHAT},${ACCT},${AUTH}`] });
let fails = 0; const ok = (c, l, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x !== '' ? ' — ' + x : ''}`); if (!c) fails++; };
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'en-GB', userAgent: UA, deviceScaleFactor: 2 };
const errs = [];
const get = (host, path) => new Promise((done) => {
  http.get({ host: '127.0.0.1', port: PORT, path, headers: { Host: `${host}:${PORT}` } }, (r) => { let t = ''; r.on('data', (x) => (t += x)); r.on('end', () => { let j = null; try { j = JSON.parse(t); } catch (_) {} done({ s: r.statusCode, j, cc: r.headers['cache-control'] }); }); }).on('error', () => done({ s: 0 }));
});
const src = (f, name) => new RegExp(`const ${name} = "([0-9.]+)"`).exec(readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'))[1];

// ---- 1. each app's version, as deployed ----
const WANT = { markets: ['finance.ifl.test', 'markets/app.js', 'BUILD'], fitness: ['fitness.ifl.test', 'fitness/app.js', 'BUILD'], weather: ['weather.ifl.test', 'weather/app.js', 'BUILD'],
  chat: ['chat.ifl.test', 'pigeon/app.js', 'APP_VERSION'], account: ['account.ifl.test', 'account/app.js', 'BUILD'] };
for (const [app, [host, file, name]] of Object.entries(WANT)) {
  const r = await get(host, '/version');
  ok(r.s === 200 && r.j?.app === app && r.j.build === src(file, name) && r.cc === 'no-store', `${app}: /version says the build it's deployed with`, `${r.s} ${JSON.stringify(r.j)}`);
}
const ra = await get('auth.ifl.test', '/version'), rl = await get('localhost', '/pigeon/version');
ok(ra.j?.app === 'account' && rl.j?.app === 'chat', 'and the sign-in page\'s (the account page\'s files), and Chat\'s where it\'s at /pigeon/', `${JSON.stringify(ra.j)} ${JSON.stringify(rl.j)}`);

// a signed-in browser (the site's sign-in, for every app), its state kept for each context below
const c0 = await b.newContext(phone); const p0 = await c0.newPage();
await makeAccount(p0, `${ACCT}/`, { name: 'Ula Park', handle: 'ulapark', email: 'ula@example.com' });
const state = await c0.storageState(); await c0.close();

// an app opened with a newer version deployed (stood in for: /version says 9.99): → the page, and how many times it's loaded
// (out: signed out, as Fitness for a new account opens on its welcome, a sheet, which it isn't updated under)
async function opened(url, ready, { sw = 'block', quiet = 0, out = false } = {}) {
  const ctx = await b.newContext({ ...phone, ...(out ? {} : { storageState: state }), serviceWorkers: sw });
  if (quiet) await ctx.addInitScript((q) => { window.__iflQuiet = q; }, quiet);
  await ctx.route(/\/version$/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ app: 'x', build: '9.99', min: null }) }));
  const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(`${url}: ${e.message}`));
  const loads = { n: 0 }; p.on('load', () => { loads.n++; });
  await p.goto(url); await p.waitForSelector(ready, { timeout: 30000 });
  return { ctx, p, loads };
}
// ---- 2. just opened, untouched: in at once, once ----
for (const [app, url, ready, out] of [['markets', `${MKT}/`, '.tabs'], ['fitness', `${FIT}/`, '#main', true], ['weather', `${WX}/`, '#me-btn'], ['chat', `${CHAT}/`, '#screen'], ['account', `${ACCT}/`, 'main .hero']]) {
  const { ctx, p, loads } = await opened(url, ready, { out });
  await p.waitForTimeout(7000);
  const first = loads.n, upd = await p.evaluate(() => sessionStorage.getItem(Object.keys(sessionStorage).find((k) => k.startsWith('ifl-upd:')) || '')).catch(() => null);
  await p.waitForTimeout(7000);
  ok(first === 2 && loads.n === 2 && /9\.99/.test(upd || ''), `${app}: just opened and untouched, the new version put in at once, and once only`, `${first} → ${loads.n} ${upd}`);
  await ctx.close();
}
// ---- 3. busy (InFlite's menu open): not put in; the menu's foot says Update; tapped, in, on the tab you were on ----
{
  const { ctx, p, loads } = await opened(`${MKT}/`, '.tabs', { sw: 'allow' });
  await p.click('.tabs button:has-text("News")'); await p.waitForTimeout(400);
  await p.click('.ifh-me'); await p.waitForSelector('.ifm-pop.open');
  await p.waitForTimeout(6000);
  ok(loads.n === 1, 'Markets, touched and with its menu open: not updated meanwhile', String(loads.n));
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  await p.click('.ifh-me'); await p.waitForSelector('.ifm-pop.open'); await p.waitForTimeout(400);
  const foot = await p.locator('.ifm-foot').innerText();
  ok(await p.isVisible('.ifm-pop .ifm-upd') && /Update/.test(foot), 'and its menu says Update, in place of Up to date', foot.replace(/\s+/g, ' '));
  await p.screenshot({ path: `${out}/update-in-menu.png` });
  await p.click('.ifm-pop .ifm-upd');
  await p.waitForFunction(() => document.readyState === 'complete', null, { timeout: 30000 }); await p.waitForTimeout(2500);
  const tab = await p.evaluate(() => document.querySelector('.tabs [aria-current="page"], .tabs .on, .tabs [aria-selected="true"]')?.textContent?.trim() || '');
  ok(loads.n === 2 && /News/.test(tab), 'Update, tapped: the new version, opened on the tab you were on (News), with the service worker\'s files fetched afresh first', `${loads.n} ${tab}`);
  await ctx.close();
}
// (and under Fitness's welcome, a new account's sheet: not)
{
  const { ctx, p, loads } = await opened(`${FIT}/`, '#main');
  await p.waitForTimeout(7000);
  ok(loads.n === 1 && await p.evaluate(() => !!document.querySelector('dialog#sheet[open]')), 'Fitness, on its welcome (a sheet): not updated under it', String(loads.n));
  await ctx.close();
}
// ---- 4. touched, then left be (a test's short minute): in by itself ----
{
  const { ctx, p, loads } = await opened(`${FIT}/`, '#main', { quiet: 4000, out: true });
  await p.mouse.click(5, 300); await p.waitForTimeout(1500);
  const touchedOnly = loads.n;
  await p.waitForTimeout(9000);
  ok(touchedOnly === 1 && loads.n === 2, 'Fitness, touched as it opened: not at once, but once it\'s been left be a while', `${touchedOnly} → ${loads.n}`);
  await ctx.close();
}
ok(!errs.length, 'no errors on any page', errs.slice(0, 3).join(' | '));
console.log(`FAILS ${fails}`); await b.close(); process.exit(0);
