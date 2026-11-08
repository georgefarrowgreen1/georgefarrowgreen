// Weather keeps the forecast visible without a Send to a friend button, on phones and desktops.
import { chromium } from 'playwright';
import * as F from './mocks/wxappdata.mjs';

const [,, S, out] = process.argv;
const HOST = 'http://weather.localhost:8788';
let fails = 0; const errs = [];
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${extra ? '  — ' + extra : ''}`); if (!c) fails++; };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
process.on('uncaughtException', (e) => { console.log(`FAIL  ${e.message.split('\n')[0]}`); console.log(`FAILS ${fails + 1}`); process.exit(0); });
const now = Date.now();

async function open(sc, place, width) {
  const ctx = await b.newContext({ viewport: { width, height: 844 }, locale: 'en-GB', serviceWorkers: 'block', isMobile: width < 600, hasTouch: width < 600 });
  const p = await ctx.newPage();
  p.on('dialog', (d) => d.accept());
  p.on('pageerror', (e) => errs.push(e.message));
  await p.route(/open-meteo\.com|bigdatacloud/, (r) => {
    const u = r.request().url(), j = (o) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o), headers: { 'Access-Control-Allow-Origin': '*' } });
    if (u.includes('ensemble-api')) return j(F.ensemble(now, sc));
    if (u.includes('air-quality')) return j(F.air(now));
    if (u.includes('marine-api')) return j(F.marine(now, u));
    if (u.includes('archive-api')) return j(F.archive(now));
    if (u.includes('geocoding')) return j({ results: [] });
    if (u.includes('bigdatacloud')) return j({ city: 'London', countryCode: 'GB' });
    if (u.includes('models=')) return j(F.models(now, sc));
    if (u.includes('previous-runs-api') || u.includes('past_hours') || u.includes('forecast_minutely_15=9') || u.includes('hourly=precipitation%2Csnowfall') || u.includes('hourly=temperature_2m%2Cwind')) return r.fulfill({ status: 503, body: '' });
    return j(F.forecast(now, sc));
  });
  await p.route(/rainviewer\.com|openstreetmap\.org|openfreemap\.org|aviationweather|meteoalarm/, (r) => r.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: PNG }));
  await p.goto(`${HOST}/?lat=${place.lat}&lon=${place.lon}&name=${encodeURIComponent(place.name)}`);
  await p.waitForSelector('.day-row', { timeout: 20000 });
  return { ctx, p };
}
for (const width of [390, 1280]) for (const [name, sc] of [['rain', { rainIn: 90 }], ['dry', {}]]) {
  const { ctx, p } = await open(sc, { lat: 51.5072, lon: -0.1276, name: 'London' }, width);
  ok(await p.locator('#send-btn, .send-btn').count() === 0, `${width}px ${name}: no Send to a friend button`);
  ok(await p.locator('#accuracy, #accuracy-body').count() === 0, `${width}px ${name}: no forecast accuracy pane`);
  ok((await p.locator('#brief').innerText()).trim().length > 0, `${width}px ${name}: the forecast summary remains`);
  ok(await p.locator('.day-row').count() > 0, `${width}px ${name}: the daily forecast remains`);
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px ${name}: no horizontal overflow`);
  await p.screenshot({ path: `${out}/forecast-${width}-${name}.png` });
  await ctx.close();
}
ok(!errs.length, 'no errors on the pages', errs.slice(0, 3).join(' | '));
await b.close();
console.log(`FAILS ${fails}`);
process.exit(0);
