// needs: hub
// Mail on Your Day, stage 1 (trips and bookings), end to end at InFlite's hub: George, the site's admin, on Today with
// a stand-in for Mail's Worker (on :8807, the account's MAIL_VIA: Mail's card answer with bookings and a trip shaped as
// the contract has them, malformed entries among them, and Mail's POST /api/connector/hide) and one for Open-Meteo (on
// :8794: Weather's forecast, and Weather's place search for Lisbon, which Mail gave no position for). Nothing on the
// account's side is stood in for: the day, its trip and its weather, the rows and the morning's words are all worked out
// by the account's server from Mail's answer.
// Checked, at a phone's width and a computer's, light and dark: the trip card above Waiting for You (on a computer, at
// the head of the column on the right), its words (Lisbon today or tomorrow, its dates, the same time as home, the next
// booking, four days of Lisbon's weather); its day-by-day view in InFlite's sheet; a booking's page there (Open Email by
// the hub's /mail/#thread=, Weather There on Lisbon that day, Hide); tonight's table as a Coming Up row "from Mail", and
// the trip's bookings not rows too; its sheet's Hide: gone at once, back with Undo (Mail never asked), then hidden for
// good once Undo's time is up (Mail asked once, with the key, for that booking), and still gone on a fresh load; the
// morning notification's line ("Rockfish at 19:30 · Flight tomorrow 07:40", as the account says it now); no console
// error, CSP violation or sideways scroll. Screenshots beside the approved mock-up's (MOCK: its HTML file; left out
// where it isn't there), with the mock-up's look compared where the two must agree (the trip's violet, Mail's teal, four
// days of weather, the card's corners).
import http from 'node:http';
import { existsSync, writeFileSync } from 'node:fs';
import { kit } from './lib.mjs';
import { makeAccount, PASSWORD } from './join.mjs';
import { forecast as omForecast } from './mocks/wxappdata.mjs';
import { cardOf } from '../../functions/_todaymail.js';
import { mailLine } from '../../functions/_todaymorning.js';

const [,, S, out] = process.argv;
const K = await kit(S, out);
const { ok, one, hubPhone, HUB, errs } = K;
const ACCT = 'http://account.ifl.test:8788';
const MOCK = process.env.MOCK || '/tmp/claude-0/-home-user/08ceabf0-4558-56d4-9e3e-4d128d8ff562/scratchpad/mail-on-your-day.html';
const KEY = 'mail-test-key', H = 3600e3, DAY = 864e5;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const js = (x, n = 300) => String(JSON.stringify(x) ?? x).slice(0, n);

// ---- the stand-in for Mail's Worker: its card, with the bookings of the next days, and Hide ----
// (placed from the moment the test starts: a table in three hours, Lisbon from tomorrow, a train next week; and among
// them what the account must drop: a cancelled booking, one with no title, a kind Today doesn't know, a bad id)
const T0 = Date.now(), at = (h) => Math.round((T0 + h * H) / 300e3) * 300e3;
const BOOK = {
  rock: { id: 'rock-0611', kind: 'restaurant', title: 'Table at Rockfish', sub: '2 people · Exeter Quay', start: at(3), end: null, tz: 'Europe/London', place: { name: 'Rockfish, Exeter Quay', lat: 50.7196, lon: -3.5311 }, ref: null, trip: null, thread: '6f1c2b9e-7d4a-4f0e-9a51-2c8e1b7d3a10', status: 'confirmed' },
  out: { id: 'K7QX2M-1', kind: 'flight', title: 'TP1351 to Lisbon', sub: 'Heathrow T2 → Lisbon · seat 14C', start: at(20), end: at(22.5), tz: 'Europe/London', place: { name: 'Heathrow T2' }, ref: 'K7QX2M', trip: 'trip-lisbon', thread: '0d3e9a51-1b2c-4d5e-8f60-7a8b9c0d1e2f', status: 'confirmed' },
  hotel: { id: 'bk-5521876', kind: 'hotel', title: 'Memmo Alfama', sub: 'Check-in from 15:00 · 3 nights', start: at(27), end: at(93), tz: 'Europe/Lisbon', place: { name: 'Memmo Alfama' }, ref: '5521876', trip: 'trip-lisbon', thread: 'a1b2c3d4-0000-4000-8000-000000000001', status: 'confirmed' },
  sintra: { id: 'gyg-GYG8K2', kind: 'event', title: 'Sintra day trip', sub: 'Meet at Rossio station', start: at(45), end: at(54), tz: 'Europe/Lisbon', place: { name: 'Rossio station' }, ref: 'GYG8K2', trip: 'trip-lisbon', thread: 'a1b2c3d4-0000-4000-8000-000000000002', status: 'confirmed' },
  back: { id: 'K7QX2M-2', kind: 'flight', title: 'TP1366 home', sub: 'Lisbon → Heathrow T2', start: at(96), end: at(98.5), tz: 'Europe/Lisbon', place: { name: 'Lisbon airport' }, ref: 'K7QX2M', trip: 'trip-lisbon', thread: '0d3e9a51-1b2c-4d5e-8f60-7a8b9c0d1e2f', status: 'confirmed' },
  train: { id: 'gwr-81', kind: 'train', title: 'Exeter to Bristol', sub: 'Coach C', start: at(9 * 24), end: at(9 * 24 + 1), tz: 'Europe/London', place: null, ref: 'TQ81', trip: null, thread: 'a1b2c3d4-0000-4000-8000-000000000003', status: 'confirmed' },
};
const JUNK = [{ ...BOOK.rock, id: 'gone-1', status: 'cancelled' }, { ...BOOK.rock, id: 'no-title', title: '' }, { ...BOOK.rock, id: 'parcel-1', kind: 'parcel' }, { ...BOOK.rock, id: 'bad id!' }, 'K7QX2M', null];
const hidden = new Set(), mailLog = [];
const cardAnswer = () => ({
  people: 1, updates: 3, later: { n: 0, next: null },
  ahead: [...Object.values(BOOK).filter((b) => !hidden.has(b.id)), ...JUNK],
  trips: [{ id: 'trip-lisbon', name: 'Lisbon', start: BOOK.out.start, end: BOOK.back.end, destination: { name: 'Lisbon' }, items: ['K7QX2M-1', 'bk-5521876', 'gyg-GYG8K2', 'K7QX2M-2'].filter((i) => !hidden.has(i)) },
    { id: 'bad trip', name: 'X' }],
});
http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const u = new URL(req.url, 'http://x'), auth = req.headers.authorization || '';
    mailLog.push({ at: Date.now(), method: req.method, path: u.pathname, auth: auth === `Bearer ${KEY}`, body });
    if (auth !== `Bearer ${KEY}`) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end('{"error":"key"}'); }
    if (req.method === 'GET' && u.pathname === '/api/connector/card') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(cardAnswer())); }
    if (req.method === 'POST' && u.pathname === '/api/connector/hide') {
      let id = null; try { id = JSON.parse(body).id; } catch (_) {}
      if (typeof id !== 'string') { res.writeHead(400); return res.end(); }
      hidden.add(id); res.writeHead(204); return res.end();
    }
    res.writeHead(404); res.end();
  });
}).listen(8807, '127.0.0.1');

// ---- the stand-in for Open-Meteo: Weather's forecast (Lisbon's clock), and its place search ----
const omLog = [];
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), send = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  omLog.push(u.pathname + (u.searchParams.get('name') ? `?name=${u.searchParams.get('name')}` : u.searchParams.get('latitude') ? `?${u.searchParams.get('latitude')},${u.searchParams.get('longitude')}` : ''));
  if (u.pathname === '/v1/search') return send({ results: /^lisbon$/i.test(u.searchParams.get('name') || '') ? [{ name: 'Lisbon', latitude: 38.71667, longitude: -9.13333, country_code: 'PT', admin1: 'Lisbon', country: 'Portugal' }] : undefined });
  if (u.pathname === '/v1/forecast') return send({ ...omForecast(Date.now()), timezone: 'Europe/Lisbon', timezone_abbreviation: 'WET', utc_offset_seconds: 0 });
  if (u.pathname.startsWith('/api/v1/warnings/')) return send({ warnings: [] });
  res.writeHead(404); res.end();
}).listen(8794, '127.0.0.1');

// ---- George, the site's admin, at the hub ----
const george = await hubPhone('george', null);
const { p, ctx } = george;
await ctx.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`)));
await makeAccount(p, `${ACCT}/`, { name: 'George Farrow-Green', handle: 'georgeday', email: 'george@example.com', password: PASSWORD });
const gid = one("SELECT id FROM pg_users WHERE handle = 'georgeday'")[0]?.id;
one(`INSERT OR REPLACE INTO pg_meta (k, v) VALUES ('admin_user', '${gid}')`);
ok(!!gid, 'George’s account, the site’s admin');

const CARD = '#trip .trip-card', SHEET = (n) => `dialog.ifl-sheet[data-sheet="${n}"]`;
async function today({ w = 390, h = 844, scheme = 'dark' } = {}) {
  await p.setViewportSize({ width: w, height: h });
  await p.emulateMedia({ colorScheme: scheme });
  await p.goto(`${HUB}/`);
  await p.waitForSelector('#today[data-phase]', { timeout: 30000 });
  return p.waitForSelector(CARD, { timeout: 20000 }).then(() => true, () => false);
}
const box = (s) => p.$eval(s, (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }).catch(() => null);
const sideways = () => p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
const shot = (name) => p.screenshot({ path: `${out}/${name}.png` }).catch(() => {});

// ---- 1. the trip card, at each width and scheme ----
const shots = {};
for (const [w, h, scheme] of [[390, 844, 'dark'], [390, 844, 'light'], [1440, 900, 'dark'], [1440, 900, 'light']]) {
  const tag = `${w} ${scheme}`, e0 = errs.length;
  const shown = await today({ w, h, scheme });
  ok(shown, `${tag}: the trip card on Today`);
  if (!shown) { await shot(`fail-${w}-${scheme}`); continue; }
  const words = await p.$eval(CARD, (c) => ({ head: c.querySelector('.tp-h')?.textContent, sub: c.querySelector('.tp-hd small')?.textContent, next: c.querySelector('.tp-next')?.innerText.replace(/\s+/g, ' ').trim(),
    days: [...c.querySelectorAll('.tp-day')].map((d) => d.innerText.replace(/\s+/g, ' ').trim()), icons: c.querySelectorAll('.tp-day svg.wi').length }));
  ok(/^Lisbon (today|tomorrow)$/.test(words.head), `${tag}: “${words.head}”`);
  ok(/^\w{3} \d{1,2}( \w{3})? – \w{3} \d{1,2} \w{3} · same time as home$/.test(words.sub || ''), `${tag}: its dates, and Lisbon’s the same time as home: “${words.sub}”`);
  ok(/^Booked TP1351 to Lisbon · (\w{3} )?\d\d:\d\d Heathrow T2 → Lisbon · seat 14C ref K7QX2M$/.test(words.next || ''), `${tag}: the next booking, its time and reference`, words.next);
  ok(words.days.length === 4 && words.icons === 4 && words.days.every((d) => /^\w{3} -?\d+°$/.test(d)), `${tag}: four days of Lisbon’s weather, from Weather’s forecast`, js(words.days));
  const order = await p.evaluate(() => { const ids = [...document.querySelectorAll('#today #trip, #today #waiting, #today #coming')].map((x) => x.id); return ids; });
  ok(order[0] === 'trip', `${tag}: above Waiting for You and Coming Up`, js(order));
  const card = await box(CARD), top = await box('#top'), coming = await box('#coming');
  if (w < 1100) ok(card && coming && card.y < coming.y && (!top?.h || card.y >= top.y + top.h - 1), `${tag}: under the top card, over Coming Up`, js({ card, top, coming }));
  else ok(card && top && card.x > top.x + top.w && card.y < (coming?.y ?? 1e9), `${tag}: at the head of the column on the right`, js({ card, top, coming }));
  ok(card && card.w <= w - 24, `${tag}: inside the page`, js(card));
  ok(!(await sideways()), `${tag}: no sideways scroll`);
  // (the rows: tonight's table from Mail; the trip's bookings not rows too; nothing of the junk)
  const rows = await p.$$eval('#coming .dc-row', (rs) => rs.map((r) => ({ t: r.querySelector('b')?.textContent, from: r.querySelector('.dc-from')?.textContent || '', bid: r.querySelector('[data-bid]')?.dataset.bid || null, href: r.querySelector('a')?.getAttribute('href') })));
  const rock = rows.find((r) => r.bid === 'rock-0611');
  ok(rock && rock.from === 'from Mail' && rock.t === 'Table at Rockfish' && rock.href === '/mail/#thread=6f1c2b9e-7d4a-4f0e-9a51-2c8e1b7d3a10', `${tag}: tonight’s table a row of Coming Up, from Mail, its email at the hub’s /mail/`, js(rows));
  ok(!rows.some((r) => ['K7QX2M-1', 'bk-5521876', 'gone-1', 'no-title', 'parcel-1'].includes(r.bid)), `${tag}: the trip’s bookings in its card, not rows too; nothing cancelled or malformed`, js(rows.map((r) => r.bid)));
  await shot(`today-${w}-${scheme}`);
  shots[`today-${w}-${scheme}`] = `${out}/today-${w}-${scheme}.png`;
  // ---- 2. the trip, day by day ----
  await p.click(CARD);
  const sheet = await p.waitForSelector(`${SHEET('trip')}[open]`, { timeout: 8000 }).then(() => true, () => false);
  ok(sheet, `${tag}: the card opens the trip in InFlite’s sheet`);
  if (sheet) {
    await wait(450);
    const v = await p.$eval(SHEET('trip'), (d) => ({ title: d.querySelector('.ifs-head h2')?.textContent, head: d.querySelector('.tv-head')?.textContent,
      days: [...d.querySelectorAll('.tv-day')].map((x) => x.innerText.replace(/\s+/g, ' ').trim()), rows: [...d.querySelectorAll('.tv-row')].map((r) => r.querySelector('b').textContent), none: d.querySelectorAll('.tv-none').length }));
    ok(/^Lisbon · [45] days$/.test(v.title), `${tag}: “${v.title}”`);
    ok(v.days.length >= 4 && v.days.every((d) => /^[A-Z]+DAY \d{1,2}( -?\d+° .+)?$/i.test(d)) && v.days.filter((d) => /°/.test(d)).length >= 4, `${tag}: each day with Lisbon’s weather`, js(v.days));
    ok(JSON.stringify(v.rows) === JSON.stringify(['TP1351 to Lisbon', 'Memmo Alfama', 'Sintra day trip', 'TP1366 home']), `${tag}: the four bookings under their days`, js(v.rows));
    await shot(`trip-${w}-${scheme}`);
    shots[`trip-${w}-${scheme}`] = `${out}/trip-${w}-${scheme}.png`;
    if (w === 390 && scheme === 'dark') {
      // ---- 3. a booking's page in the trip's sheet ----
      await p.click(`${SHEET('trip')} .tv-row[data-bid="bk-5521876"]`);
      const pg = await p.waitForSelector(`${SHEET('trip')} .ifs-page[data-page="booking"] .bk-acts`, { timeout: 5000 }).then(() => true, () => false);
      const acts = pg ? await p.$eval(`${SHEET('trip')} .ifs-page[data-page="booking"]`, (x) => ({ title: x.closest('dialog').querySelector('.ifs-head h2').textContent,
        when: x.querySelector('.bk-when')?.textContent, acts: [...x.querySelectorAll('.bk-act')].map((a) => [a.textContent.trim(), a.getAttribute('href')]) })) : null;
      ok(acts?.title === 'Memmo Alfama' && /· ref 5521876$/.test(acts.when), 'a booking of the trip: its page, when and its reference', js(acts));
      ok(acts && acts.acts[0][0] === 'Open Email' && acts.acts[0][1] === '/mail/#thread=a1b2c3d4-0000-4000-8000-000000000001', 'Open Email: its conversation, at the hub’s /mail/', js(acts?.acts));
      ok(acts && /^Weather in Lisbon That Day$/.test(acts.acts[1][0]) && /^\/weather\/\?lat=38\.71667&lon=-9\.13333&name=Lisbon#day=\d{4}-\d{2}-\d{2}$/.test(acts.acts[1][1]), 'Weather There: Lisbon (found by Weather’s place search), that day', js(acts?.acts));
      ok(acts && acts.acts[2][0] === 'Hide From Your Day', 'and Hide');
      await shot('trip-booking-390-dark');
      await p.click(`${SHEET('trip')} [data-back]`);
      ok(await p.waitForSelector(`${SHEET('trip')} .tv-list:not([hidden])`, { timeout: 3000 }).then(() => true, () => false) && !(await p.$(`${SHEET('trip')} .ifs-page`)), 'Back: the trip again');
    }
    await p.keyboard.press('Escape');
    await p.waitForSelector(`${SHEET('trip')}`, { state: 'detached', timeout: 5000 }).catch(() => {});
  }
  ok(errs.length === e0, `${tag}: no console error or CSP violation`, js(errs.slice(e0)));
}

// ---- 4. the morning's line, as the account says it now ----
await today({ w: 390, scheme: 'dark' });
const morning = await p.evaluate(() => fetch('/api/morning', { headers: { Accept: 'application/json' } }).then((r) => r.json()));
const t = Date.now(), want = mailLine(cardOf(cardAnswer(), 'https://email.ifl.test', t), 'Europe/London', t);
const lines = morning?.preview?.lines || [];
ok(!!want && lines.includes(want), `the morning notification’s line: “${want}”`, js(lines));
ok(/^Rockfish at \d\d:\d\d · Flight( tomorrow)? \d\d:\d\d$|^Flight \d\d:\d\d · .*Rockfish|Rockfish at \d\d:\d\d.*Flight/.test(want || ''), 'tonight’s table and the flight, in Mail’s words', want);

// ---- 5. beside the approved mock-up ----
if (existsSync(MOCK)) {
  const m = await (await K.b.newContext({ viewport: { width: 1180, height: 1000 }, deviceScaleFactor: 2, colorScheme: 'dark' })).newPage();
  const mshots = {};
  for (const [view, scheme] of [['today', 'dark'], ['today', 'light'], ['trip', 'dark'], ['trip', 'light']]) {
    await m.emulateMedia({ colorScheme: scheme });
    await m.goto(`file://${MOCK}#${view}`);
    await m.waitForTimeout(300);
    await m.locator('.phone').screenshot({ path: `${out}/mock-${view}-${scheme}.png` });
    mshots[`${view}-${scheme}`] = `${out}/mock-${view}-${scheme}.png`;
  }
  // (what the two must agree on: the trip's violet, Mail's teal on its bookings, four days of weather, the card's corners)
  await m.goto(`file://${MOCK}#today`);
  const mock = await m.evaluate(() => ({ trip: getComputedStyle(document.querySelector('#tripCard .ic.trip')).backgroundColor, cols: getComputedStyle(document.querySelector('#tripWx')).gridTemplateColumns.split(' ').length,
    mail: getComputedStyle(document.querySelector('.ic.mail')).backgroundColor }));
  await today({ w: 390, scheme: 'dark' });
  const ours = await p.evaluate(() => ({ trip: getComputedStyle(document.querySelector('#trip .tp-ic')).backgroundColor, cols: getComputedStyle(document.querySelector('#trip .tp-wx')).gridTemplateColumns.split(' ').length,
    radius: parseFloat(getComputedStyle(document.querySelector('#trip .trip-card')).borderTopLeftRadius), mail: getComputedStyle(document.querySelector('#coming .bk-ic')).backgroundColor }));
  ok(mock.trip === ours.trip, 'the trip card’s icon in the mock-up’s violet', js({ mock, ours }));
  ok(mock.mail === ours.mail, 'Mail’s bookings in the mock-up’s teal', js({ mock, ours }));
  ok(mock.cols === 4 && ours.cols === 4, 'four days of weather, as the mock-up', js({ mock, ours }));
  ok(ours.radius >= 24 && ours.radius <= 32, 'the card’s corners Today’s own, as round as the mock-up’s', js(ours));
  // (side by side, for a person to look at: the mock-up's phone, then Today's, each view and scheme)
  const pairs = [['today-dark', 'today-390-dark'], ['today-light', 'today-390-light'], ['trip-dark', 'trip-390-dark'], ['trip-light', 'trip-390-light']];
  const html = `<!doctype html><body style="margin:0;background:#888;display:grid;gap:20px;padding:20px">${pairs.map(([a, b]) => `<div style="display:flex;gap:20px;align-items:start"><img src="file://${mshots[a]}" style="width:420px"><img src="file://${shots[b]}" style="width:390px"></div>`).join('')}</body>`;
  writeFileSync(`${out}/beside-mockup.html`, html);
  await m.setViewportSize({ width: 880, height: 1000 });
  await m.goto(`file://${out}/beside-mockup.html`);
  await m.waitForTimeout(500);
  await m.screenshot({ path: `${out}/beside-mockup.png`, fullPage: true });
  console.log(`(beside the mock-up: ${out}/beside-mockup.png)`);
} else console.log(`(no mock-up at ${MOCK}: screenshots not compared)`);

// ---- 6. a row's sheet: Hide, Undo, Hide for good ----
const ROW = '#coming [data-bid="rock-0611"]';
const asked = () => mailLog.filter((x) => x.path === '/api/connector/hide');
await p.click(ROW);
const rs = await p.waitForSelector(`${SHEET('booking')}[open]`, { timeout: 5000 }).then(() => true, () => false);
const racts = rs ? await p.$$eval(`${SHEET('booking')} .bk-act`, (as) => as.map((a) => [a.textContent.trim(), a.getAttribute('href')])) : [];
ok(rs && racts[0]?.[1] === '/mail/#thread=6f1c2b9e-7d4a-4f0e-9a51-2c8e1b7d3a10' && /^Weather in Rockfish, Exeter Quay That Day$/.test(racts[1]?.[0] || '') && /lat=50\.7196&lon=-3\.5311/.test(racts[1]?.[1] || '') && racts[2]?.[0] === 'Hide From Your Day',
  'a row from Mail opens its sheet: Open Email, Weather There, Hide', js(racts));
await shot('booking-390-dark');
shots['booking-390-dark'] = `${out}/booking-390-dark.png`;
await p.click(`${SHEET('booking')} [data-bk="hide"]`);
await wait(300);
ok(!(await p.$(ROW)), 'Hide: the row gone at once');
const toast = await p.waitForSelector('.ifl-toast.on .ifl-toast-act', { timeout: 3000 }).then(() => p.$eval('.ifl-toast', (x) => x.textContent), () => null);
ok(/Hidden from Your Day/.test(toast || '') && /Undo/.test(toast || ''), 'with Undo in the toast', toast);
await shot('hidden-toast-390-dark');
await p.click('.ifl-toast .ifl-toast-act');
await wait(300);
ok(!!(await p.$(ROW)), 'Undo: back at once');
await wait(8000);
ok(asked().length === 0, 'and Mail never asked, Undo’s time up or not', js(asked()));
await p.click(ROW);
await p.waitForSelector(`${SHEET('booking')}[open]`, { timeout: 5000 }).catch(() => {});
await p.click(`${SHEET('booking')} [data-bk="hide"]`);
await wait(300);
ok(!(await p.$(ROW)), 'Hide again: gone');
ok(asked().length === 0, 'not asked while Undo’s still there');
await wait(8500);
const h = asked();
ok(h.length === 1 && h[0].method === 'POST' && h[0].auth && JSON.parse(h[0].body).id === 'rock-0611', 'once Undo’s time is up: Mail asked to hide it, once, with the key, for that booking', js(h));
await today({ w: 390, scheme: 'dark' });
await wait(500);
ok(!(await p.$(ROW)), 'and on a fresh load, it’s still gone (Mail’s card leaves it out)');
ok(!!(await p.$(CARD)), 'the trip card still there');

ok(!errs.filter((e) => /CSP violation/.test(e)).length, 'no CSP violation anywhere', js(errs));
console.log('notes (page errors and console errors):', js(errs.slice(0, 8), 1200));
console.log('Open-Meteo asked:', js([...new Set(omLog)], 400));
await ctx.close();
await (await K.hubBrowser()).close();
await K.b.close();
console.log(`FAILS ${K.fails()}`);
process.exit(0);
