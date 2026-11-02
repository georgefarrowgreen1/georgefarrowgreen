// Weather's Send to a friend (weather/send.js): under the words, "Send to a friend" goes to Chat beside it
// (chat.localhost here) with the words first and the forecast as a card after them, in the address's fragment (never
// sent to a server). The card's place is its name and its 0.05° cell: the place's exact coordinates are nowhere in the
// address. Open-Meteo, the radar and the map are stood in for, as wxapp.mjs does (mocks/wxappdata.mjs).
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

async function open(sc, place) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-GB', serviceWorkers: 'block', isMobile: true, hasTouch: true });
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
  // (Chat's page stood in for, so the address it was sent to stays to be read)
  await ctx.route(/^http:\/\/chat\.localhost:8788\/$/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Chat</title><p>Chat</p>' }));
  await p.goto(`${HOST}/?lat=${place.lat}&lon=${place.lon}&name=${encodeURIComponent(place.name)}`);
  await p.waitForSelector('.day-row', { timeout: 20000 });
  return { ctx, p };
}
const sent = async (p) => {
  const asked = [], watch = (r) => { if (!/^http:\/\/chat\.localhost/.test(r.url()) && r.url().startsWith('http://') && /\/api\//.test(r.url())) asked.push(`${r.method()} ${r.url()}`); };
  p.on('request', watch);
  await Promise.all([p.waitForURL(/^http:\/\/chat\.localhost:8788\/#share=/, { timeout: 15000 }), p.click('#send-btn')]);
  await p.waitForLoadState('domcontentloaded');
  p.off('request', watch);
  const url = await p.evaluate(() => location.href), q = new URLSearchParams(new URL(url).hash.slice(1));
  let card = null; try { card = JSON.parse(Buffer.from(q.get('card') || '', 'base64url').toString('utf8')); } catch (_) {}
  return { url, q, card, asked };
};

// ---- London, rain in an hour and a half ----
const LON = { lat: 51.5072, lon: -0.1276, name: 'London' };
{
  const { ctx, p } = await open({ rainIn: 90 }, LON);
  await p.waitForSelector('#send-btn', { timeout: 15000 });
  const pill = await p.evaluate(() => { const s = document.getElementById('send-btn'), br = document.getElementById('brief'); return { text: s.textContent.trim(), after: br.nextElementSibling === s, shown: s.getBoundingClientRect().height > 0 }; });
  ok(pill.text === 'Send to a friend' && pill.after && pill.shown, 'under the words: "Send to a friend"', JSON.stringify(pill));
  await p.screenshot({ path: `${out}/pill.png` });
  const said = await p.evaluate(() => document.getElementById('brief').dataset.said);
  const { url, q, card, asked } = await sent(p);
  ok(url.startsWith('http://chat.localhost:8788/#share=') && [...q.keys()].join() === 'share,card', 'to Chat beside Weather: /#share=…&card=…, the words first', url.slice(0, 90));
  ok(/^London today: /.test(q.get('share')) && said.toLowerCase().includes(q.get('share').slice('London today: '.length, 'London today: '.length + 12).toLowerCase()), 'the words: the place, and what the page says first', q.get('share'));
  ok(card?.kind === 'weather' && card.from === 'weather' && card.snap?.place === 'London' && card.v === 1, 'the card: Weather\'s, London', JSON.stringify(card?.snap).slice(0, 160));
  ok(JSON.stringify(card?.ref) === '{"cell":[51.5,-0.15]}', 'its place a 0.05° cell', JSON.stringify(card?.ref));
  const plain = decodeURIComponent(url) + JSON.stringify(card);
  ok(!/51\.507|0\.127|51\.5072|-0\.1276/.test(plain), 'the exact coordinates nowhere in the address or the card');
  ok(!card || !('warn' in card.snap) && !('warning' in card.snap), 'no warning in the card');
  ok(card?.snap?.rain && card.snap.rain.now === false && Math.abs(card.snap.rain.at - (now + 90 * 60e3)) < 40 * 60e3, 'the rain due, in real time', JSON.stringify(card?.snap?.rain));
  ok(Math.abs(card?.at - Date.now()) < 120e3, 'when it was sent: now, in real time');
  ok(!asked.length, 'and nothing sent to a server for it', asked.join(', '));
  await ctx.close();
}
// ---- a place by the sea further east, dry: its own cell, and a dry spell for a plan ----
{
  const { ctx, p } = await open({}, { lat: 52.8213, lon: 1.3876, name: 'North Walsham' });
  await p.waitForSelector('#send-btn', { timeout: 15000 });
  const { url, card } = await sent(p);
  ok(card?.snap?.place === 'North Walsham' && JSON.stringify(card.ref) === '{"cell":[52.8,1.4]}' && !/52\.82|1\.387/.test(decodeURIComponent(url)), 'another place: its name, its cell, not its coordinates', JSON.stringify(card?.ref));
  ok(card?.snap?.rain === null, 'dry: no rain due');
  ok(!card?.snap?.spell || (['cycle', 'run'].includes(card.snap.spell.act) && card.snap.spell.end > card.snap.spell.start), 'a dry spell, if any, for a ride or a run', JSON.stringify(card?.snap?.spell));
  await ctx.close();
}
ok(!errs.length, 'no errors on the pages', errs.slice(0, 3).join(' | '));
await b.close();
console.log(`FAILS ${fails}`);
process.exit(0);
