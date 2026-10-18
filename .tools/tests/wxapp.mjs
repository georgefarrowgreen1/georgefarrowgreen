// Weather (weather/, served at weather.localhost here): the app opens on a place, explains the
// weather in words, warns about what matters, compares the models, puts the day against thirty
// years of climate, and answers only at its own address. Open-Meteo is stood in for by made-up
// forecasts for the time the test runs (mocks/wxappdata.mjs).
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import http from 'http';
import * as F from './mocks/wxappdata.mjs';
const [,, S, out] = process.argv;
const HOST = 'http://weather.localhost:8788', SITE = 'http://localhost:8788';
let fails = 0; const errs = [];
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${extra ? '  — ' + extra : ''}`); if (!c) fails++; };
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const now = Date.now();
async function open(sc = {}, { locale = 'en-GB', url = `${HOST}/?lat=51.5072&lon=-0.1276&name=London` } = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale, serviceWorkers: 'block', bypassCSP: !!sc.axe, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.route(/open-meteo\.com|bigdatacloud/, (r) => {
    const u = r.request().url(), j = (o) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o), headers: { 'Access-Control-Allow-Origin': '*' } });
    if (u.includes('ensemble-api')) return j(F.ensemble(now));
    if (u.includes('air-quality')) return j(F.air(now));
    if (u.includes('archive-api')) return j(F.archive(now));
    if (u.includes('geocoding')) return j({ results: [{ name: 'Edinburgh', latitude: 55.95, longitude: -3.19, country: 'United Kingdom', admin1: 'Scotland', country_code: 'GB' }] });
    if (u.includes('bigdatacloud')) return j({ city: 'London', locality: 'Soho', principalSubdivision: 'England', countryName: 'United Kingdom', countryCode: 'GB' });
    if (u.includes('models=')) return j(F.models(now));
    return j(F.forecast(now, sc));
  });
  const res = await p.goto(url);
  await p.waitForSelector('.day-row', { timeout: 20000 });
  // everything in: the last to arrive is the thirty years of climate
  await p.waitForFunction(() => /warmer than/.test(document.querySelector('#climate-body').textContent), null, { timeout: 20000 });
  await p.waitForTimeout(300);
  return { ctx, p, res };
}

// the page, and what it says
const { ctx, p, res } = await open({ rainIn: 30, frost: true, gust: 70, uv: 7 });
ok(/default-src 'self'/.test(res.headers()['content-security-policy'] || '') && /geolocation=\(self\)/.test(res.headers()['permissions-policy'] || ''), 'its own security headers, location allowed');
ok((await p.textContent('#place-name')) === 'London', 'opens on the place in the link');
ok((await p.locator('.day-row').count()) === 16 && (await p.textContent('#daily-n')) === '16-day', '16 days');
const nc = await p.textContent('#nowcast-text');
ok(await p.isVisible('#nowcast') && /starting in about (30|35|40|45) min/.test(nc), 'the next four hours: rain on its way', nc);
ok(/on the way from about/.test(await p.textContent('#brief')), 'the briefing says so too', await p.textContent('#brief'));
const sw = await p.evaluate(() => document.documentElement.scrollWidth);
ok(sw <= 390, 'nothing wider than the phone (it would zoom the page out)', `${sw}px`);
const warn = await p.locator('#alerts .ins h3').allTextContents();
ok(warn.some((t) => /Frost/.test(t)) && warn.some((t) => /Gales/.test(t)), 'warnings: frost and gales', warn.join(' · '));
if (await p.locator('#insights .more-btn').count()) await p.locator('#insights .more-btn').evaluate((e) => e.click());
const cards = await p.locator('#insights .ins h3').allTextContents();
ok(cards.some((t) => /is uncertain$/.test(t)), 'the day the models disagree is called uncertain', cards.join(' · '));
ok(cards.some((t) => /umbrella/i.test(t)), 'an umbrella tip');
if (new Date(now).getUTCHours() < 13) ok(cards.some((t) => /High UV/.test(t)), 'high UV today');
ok(/warmer than \d+% of days around/.test(await p.textContent('#climate-body')), 'today against thirty years', (await p.textContent('#climate-body')).slice(0, 90));
ok((await p.locator('#win-grid .win').count()) >= 5, 'best times for a run, a walk, a ride, the washing, the stars or the sunset');
await p.screenshot({ path: `${out}/wx-top.png` });
await p.screenshot({ path: `${out}/wx-full.png`, fullPage: true });
// a day, in full: the six models side by side
await p.locator('.day-row').nth(4).evaluate((e) => e.click());      // (the page redraws as the last of the forecast arrives)
await p.waitForSelector('#day[open]');
ok((await p.locator('#day table.models tr').count()) === 7, 'the day compares six models');
ok(/Low/.test(await p.textContent('#day .conf')), 'and says how sure it is', await p.textContent('#day .conf'));
await p.screenshot({ path: `${out}/wx-day.png` });
await p.keyboard.press('Escape');
// units, kept
await p.click('#settings-btn'); await p.click('input[name="temp"][value="f"]'); await p.keyboard.press('Escape');
ok(/^\d+°$/.test(await p.textContent('#now-temp')) && Number((await p.textContent('#now-temp')).slice(0, -1)) > 32, 'switches to °F');
await p.reload(); await p.waitForSelector('.day-row');
ok(Number((await p.textContent('#now-temp')).slice(0, -1)) > 32, 'and remembers it');
// search and save a place
await p.click('#place-btn'); await p.fill('#search', 'Edin'); await p.waitForSelector('#results .row-btn'); await p.click('#results .row-btn');
await p.waitForTimeout(600);
ok((await p.textContent('#place-name')) === 'Edinburgh', 'a place found by search');
await p.click('#place-btn');
ok((await p.locator('#saved li').count()) === 2, 'both places saved');
await p.keyboard.press('Escape');
await ctx.close();

// accessibility (axe), with nothing alarming going on
{
  const { ctx, p } = await open({ axe: true });
  await p.addScriptTag({ content: readFileSync(new URL('./node_modules/axe-core/axe.min.js', import.meta.url), 'utf8') });
  const v = await p.evaluate(async () => (await axe.run(document, { resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`));
  ok(!v.length, 'no accessibility violations', v.join('; '));
  ok(!(await p.isVisible('#nowcast')), 'no rain on the way: no nowcast card');
  await ctx.close();
}
// its own address only (asked of the local server directly, by name)
const get = (host, path) => new Promise((done, fail) => http.get({ host: '127.0.0.1', port: 8788, path, headers: { Host: host } }, (r) => {
  let body = ''; r.on('data', (c) => (body += c)); r.on('end', () => done({ status: r.statusCode, body }));
}).on('error', fail));
const W = 'weather.localhost', L = 'localhost';
ok((await get(W, '/api/content')).status === 404 && (await get(W, '/pigeon/')).status === 404 && (await get(W, '/nothing-here')).status === 404, 'nothing of the site or InFlight at the weather address');
ok((await get(W, '/weather/app.js')).status === 301 && (await get(L, '/weather')).status === 301 && (await get(L, '/weather/')).status === 200, 'the app\'s old and preview addresses');
const where = JSON.parse((await get(W, '/api/weather/where')).body || '{}');
ok(Number.isFinite(where.lat) && Number.isFinite(where.lon), 'roughly where you are, from the connection', JSON.stringify(where));

ok(!errs.length, 'no errors on the page', errs.join('; '));
console.log(`FAILS ${fails}`);
await b.close();
process.exit(0);
