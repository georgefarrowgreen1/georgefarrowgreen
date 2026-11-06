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
// Stages 2 and 3 (yourday2 spec), with Mail's card also carrying parcels, bills, money, a trip's hidden booking and a
// repeating invite's date (malformed entries among them): Waiting for You's rows from Mail (Mail's teal icon with its
// envelope in place of a "from Mail" line, the number on the right), the quiet "paid by themselves" line; the parcel's
// Coming Up row with its four-part bar; the sheets (Open Email, Track on Evri, All Bills, Paid, Got It, Hide, with the
// 7 s Undo, and Mail asked once that's up); the Bills sheet; in the trip, a hidden booking in its day with Put Back and
// "1 hidden" (Mail's unhide asked at once), and a booking hidden there staying in its day; a repeating invite's row
// ("· every other Thursday") and its sheet's next dates (one cancelled, one moved), its Hide hiding the series. Phone
// and computer, light and dark: no sideways scroll, no page error.
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
// (stages 2 and 3: Wiggle's parcel out for delivery with Evri now, Zara's last day to return in two days; Octopus's bill
// to pay in three days, 18% over its usual; Admiral's renewal in eight; Strava's trial ending tomorrow; EE's direct debit
// and Spotify's receipt, which pay themselves; a fado night Mail already has hidden in Lisbon; Book club in five hours,
// every other Thursday, its next dates with one cancelled and one moved. And what the account must drop)
const DAYAT = (d, h) => at(d * 24 + h);
const PARCELS = [
  { id: 'evri-H01AA2B3C4D5', shop: 'Wiggle', carrier: 'Evri', stage: 2, window: { from: at(-0.5), to: at(1.5) }, due: null, deliveredAt: null, note: '', track: 'https://www.evri.com/track/parcel/H01AA2B3C4D5/details', ref: 'H01AA2B3C4D5', order: '8817205', thread: 'th-evri-1', returnBy: null },
  { id: 'zara-9001', shop: 'Zara', carrier: '', stage: 3, window: null, due: null, deliveredAt: T0 - 25 * DAY, note: '', track: null, ref: '', order: '9001', thread: 'th-zara-1', returnBy: at(48) },
  { id: 'bad parcel', shop: 'X', stage: 2 }, { id: 'p-bad-stage', shop: 'X', carrier: 'Y', stage: 7 }, { id: 'p-scam', shop: 'Evri', carrier: 'Evri', stage: '2', window: { from: at(0), to: at(2) }, track: 'javascript:alert(1)', thread: 'th-x', ref: '', order: '', note: '', due: null, deliveredAt: null, returnBy: null, extra: '<script>' },
];
const BILLS = [
  { id: 'oct-2611', kind: 'bill', sender: 'Octopus Energy', cat: 'Home', amount: 8420, due: DAYAT(3, 0), auto: false, usual: 7130, was: null, last: [6800, 7200, 7400, 6900, 7130, 8420], thread: 'th-oct-1' },
  { id: 'ee-2611', kind: 'bill', sender: 'EE', cat: 'Phone and internet', amount: 2400, due: DAYAT(2, 0), auto: true, usual: 2400, was: null, last: [2400, 2400], thread: 'th-ee-1' },
  { id: 'adm-2611', kind: 'renewal', sender: 'Admiral', cat: 'Car', amount: 41260, due: DAYAT(8, 0), auto: true, usual: null, was: 38900, last: [38900], thread: 'th-adm-1' },
  { id: 'str-1', kind: 'trial', sender: 'Strava', cat: 'Subscriptions', amount: 899, due: DAYAT(1, 0), auto: true, usual: null, was: null, last: [], thread: 'th-str-1' },
  { id: 'spt-2611', kind: 'sub', sender: 'Spotify', cat: 'Subscriptions', amount: 1199, due: DAYAT(10, 0), auto: true, usual: 1099, was: 1099, last: [1099, 1199], thread: 'th-spt-1' },
  { id: 'b-bad', kind: 'invoice', sender: 'X', amount: 1 }, { id: 'b-bad-2', kind: 'bill', sender: 'X', amount: '84.20' },
];
const MONEY = { month: 18640, n: 11, months: [17141, 17700, 17500, 18200, 18300, 18640], cats: [{ name: 'Home', pence: 11240 }, { name: 'Phone and internet', pence: 4600 }, { name: 'Subscriptions', pence: 2800 }], paidSelf: { n: 3, pence: 3600 } };
const FADO = { id: 'fado-77', title: 'Fado at Clube de Fado', sub: 'Table for 2 · 21:30', start: at(60) };
const CLUB = { id: 'club~20261112', kind: 'event', title: 'Book club', sub: 'The Old Firehouse', start: at(5), end: at(7), tz: 'Europe/London', place: { name: 'The Old Firehouse' }, ref: null, trip: null,
  thread: 'th-club-1', status: 'confirmed', repeat: 'every other Thursday', next: [{ start: at(5) }, { start: at(5 + 14 * 24), cancelled: true }, { start: at(5.5 + 28 * 24), was: at(5 + 28 * 24) }, { start: at(5 + 42 * 24) }, { start: at(5 + 56 * 24) }] };
const unhidden = new Set();
const cardAnswer = () => ({
  people: 1, updates: 3, later: { n: 0, next: null },
  ahead: [...Object.values(BOOK).filter((b) => !hidden.has(b.id)), ...(hidden.has(CLUB.id) ? [] : [CLUB]), ...(unhidden.has(FADO.id) ? [{ ...BOOK.hotel, ...FADO, kind: 'restaurant', thread: 'th-fado-1' }] : []), ...JUNK],
  trips: [{ id: 'trip-lisbon', name: 'Lisbon', start: BOOK.out.start, end: BOOK.back.end, destination: { name: 'Lisbon' }, items: ['K7QX2M-1', 'bk-5521876', 'gyg-GYG8K2', 'K7QX2M-2', ...(unhidden.has(FADO.id) ? [FADO.id] : [])].filter((i) => !hidden.has(i)),
    hidden: [...(unhidden.has(FADO.id) ? [] : [FADO]), ...[BOOK.sintra].filter((b) => hidden.has(b.id)).map((b) => ({ id: b.id, title: b.title, sub: b.sub, start: b.start })), { id: 'bad id!', title: 'x', start: at(50) }] },
    { id: 'bad trip', name: 'X' }],
  parcels: PARCELS.filter((x) => !hidden.has(x.id)),
  bills: BILLS.filter((x) => !hidden.has(x.id)),
  money: MONEY,
});
http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const u = new URL(req.url, 'http://x'), auth = req.headers.authorization || '';
    mailLog.push({ at: Date.now(), method: req.method, path: u.pathname, auth: auth === `Bearer ${KEY}`, body });
    if (auth !== `Bearer ${KEY}`) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end('{"error":"key"}'); }
    if (req.method === 'GET' && u.pathname === '/api/connector/card') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(cardAnswer())); }
    if (req.method === 'POST' && (u.pathname === '/api/connector/hide' || u.pathname === '/api/connector/unhide')) {
      let id = null; try { id = JSON.parse(body).id; } catch (_) {}
      if (typeof id !== 'string') { res.writeHead(400); return res.end(); }
      if (u.pathname.endsWith('/hide')) { hidden.add(id); unhidden.delete(id); } else { hidden.delete(id); unhidden.add(id); }
      res.writeHead(204); return res.end();
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
  const rows = await p.$$eval('#coming .dc-row', (rs) => rs.map((r) => ({ t: r.querySelector('b')?.textContent, via: !!r.querySelector('.ml-ic .ml-via svg'), amt: r.querySelector('.ml-amt')?.innerText.replace(/\s+/g, ' ').trim() || '',
    from: /from Mail/.test(r.textContent), bid: r.querySelector('[data-bid]')?.dataset.bid || null, href: r.querySelector('a')?.getAttribute('href') })));
  const rock = rows.find((r) => r.bid === 'rock-0611');
  ok(rock && rock.via && !rock.from && /^\d\d:\d\d (today|tomorrow)$/.test(rock.amt) && rock.t === 'Table at Rockfish' && rock.href === '/mail/#thread=6f1c2b9e-7d4a-4f0e-9a51-2c8e1b7d3a10',
    `${tag}: tonight’s table a row of Coming Up, Mail’s envelope on its icon (no “from Mail” line), its time on the right, its email at the hub’s /mail/`, js(rows));
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
      days: [...d.querySelectorAll('.tv-day')].map((x) => x.innerText.replace(/\s+/g, ' ').trim()), rows: [...d.querySelectorAll('.tv-row:not(.tv-hid)')].map((r) => r.querySelector('b').textContent), none: d.querySelectorAll('.tv-none').length }));
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
      ok(acts && acts.acts[2][0] === 'Hide' && acts.acts.length === 3, 'and Hide');
      ok(!(await p.$(`${SHEET('trip')} .bk-how`)) && !/read by Mail|booking’s email/i.test(await p.$eval(`${SHEET('trip')}`, (d) => d.textContent)), 'no explanations: labels, values and buttons only');
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
ok(/Rockfish at \d\d:\d\d/.test(want || '') && /Parcel \d\d:\d\d–\d\d:\d\d/.test(want || '') && /(Flight|Book club)( tomorrow)?( at)? \d\d:\d\d$/.test(want || ''), 'tonight’s table, the parcel coming (stage 2) and tomorrow’s first, in Mail’s words', want);

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
    radius: parseFloat(getComputedStyle(document.querySelector('#trip .trip-card')).borderTopLeftRadius), mail: getComputedStyle(document.querySelector('#coming .ml-ic')).backgroundColor }));
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
const asked = (id = 'rock-0611') => mailLog.filter((x) => x.path === '/api/connector/hide' && JSON.parse(x.body || '{}').id === id);
await p.click(ROW);
const rs = await p.waitForSelector(`${SHEET('booking')}[open]`, { timeout: 5000 }).then(() => true, () => false);
const racts = rs ? await p.$$eval(`${SHEET('booking')} .bk-act`, (as) => as.map((a) => [a.textContent.trim(), a.getAttribute('href')])) : [];
ok(rs && racts[0]?.[1] === '/mail/#thread=6f1c2b9e-7d4a-4f0e-9a51-2c8e1b7d3a10' && /^Weather in Rockfish, Exeter Quay That Day$/.test(racts[1]?.[0] || '') && /lat=50\.7196&lon=-3\.5311/.test(racts[1]?.[1] || '') && racts[2]?.[0] === 'Hide',
  'a row from Mail opens its sheet: Open Email, Weather There, Hide', js(racts));
await shot('booking-390-dark');
shots['booking-390-dark'] = `${out}/booking-390-dark.png`;
await p.click(`${SHEET('booking')} [data-bk="hide"]`);
await wait(300);
ok(!(await p.$(ROW)), 'Hide: the row gone at once');
const toast = await p.waitForSelector('.ifl-toast.on .ifl-toast-act', { timeout: 3000 }).then(() => p.$eval('.ifl-toast', (x) => x.textContent), () => null);
ok(/^Hidden\s*Undo$/.test((toast || '').trim()), 'with Undo in the toast, its word short: “Hidden”', toast);
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

// ---- 7. stages 2 and 3: the rows from Mail, at each width and scheme ----
// (Waiting for You is the morning's and the afternoon's: George's zone set to one where it's day now, whenever this runs)
const DAYZONE = ['Europe/London', 'America/New_York', 'America/Los_Angeles', 'Pacific/Honolulu', 'Pacific/Auckland', 'Asia/Tokyo', 'Asia/Kolkata', 'Asia/Dubai']
  .find((z) => { const hh = Number(new Intl.DateTimeFormat('en-GB', { timeZone: z, hour: '2-digit', hourCycle: 'h23' }).format(new Date())); return hh >= 8 && hh <= 15; });
one(`UPDATE pg_users SET notify_prefs = json_set(COALESCE(NULLIF(notify_prefs, ''), '{}'), '$.tz', '${DAYZONE}') WHERE id = '${gid}'`);
console.log(`(George's zone for the day's rows: ${DAYZONE})`);
const PROW = '#coming [data-pid="evri-H01AA2B3C4D5"]', IROW = (id) => `#waiting [data-iid="${id}"]`;
const unasked = (id) => mailLog.filter((x) => x.path === '/api/connector/unhide' && JSON.parse(x.body || '{}').id === id);
const full = (name) => p.screenshot({ path: `${out}/${name}.png`, fullPage: true }).catch(() => {});
for (const [w, h, scheme] of [[390, 844, 'dark'], [390, 844, 'light'], [1440, 900, 'dark'], [1440, 900, 'light']]) {
  const tag = `${w} ${scheme}`, e0 = errs.length;
  await today({ w, h, scheme });
  await p.waitForSelector(IROW('oct-2611'), { timeout: 15000 }).catch(() => {});
  const wt = await p.$$eval('#waiting .dm-row', (rs) => rs.map((r) => ({ id: r.querySelector('[data-iid]')?.dataset.iid, t: r.querySelector('b')?.textContent, sub: r.querySelector('.tx small')?.textContent || '',
    chg: r.querySelector('.tx small .chg')?.textContent || '', amt: r.querySelector('.ml-amt b')?.textContent, when: r.querySelector('.ml-amt small')?.textContent || '', via: !!r.querySelector('.ml-ic .ml-via svg') })));
  const by = Object.fromEntries(wt.map((r) => [r.id, r]));
  ok(JSON.stringify(wt.map((r) => r.id)) === JSON.stringify(['str-1', 'zara-9001', 'oct-2611', 'adm-2611']), `${tag}: Waiting for You’s rows from Mail, soonest first (EE and Spotify pay themselves; nothing malformed)`, js(wt.map((r) => r.id)));
  ok(by['oct-2611'] && by['oct-2611'].t === 'Octopus Energy' && by['oct-2611'].sub === 'To pay · +18% on your usual £71' && by['oct-2611'].chg === '+18%' && by['oct-2611'].amt === '£84.20' && /^\w{3} \d{1,2}$/.test(by['oct-2611'].when),
    `${tag}: Octopus’s bill: what it is, the change marked, the amount and its day on the right`, js(by['oct-2611']));
  ok(by['adm-2611']?.t === 'Car insurance renews' && by['adm-2611']?.sub === 'Admiral · +£23.60 on last year' && by['adm-2611']?.amt === '£412.60', `${tag}: the renewal against last year`, js(by['adm-2611']));
  ok(by['str-1']?.t === 'Strava trial ends' && by['str-1']?.sub === 'Then £8.99' && by['str-1']?.when === 'tomorrow', `${tag}: the trial ending`, js(by['str-1']));
  ok(by['zara-9001']?.t === 'Return to Zara' && by['zara-9001']?.when === 'last day' && /^\w{3} \d{1,2}$/.test(by['zara-9001']?.amt || ''), `${tag}: the return’s last day`, js(by['zara-9001']));
  ok(wt.length && wt.every((r) => r.via), `${tag}: each with Mail’s envelope on its icon`);
  const quiet = await p.$eval('#waiting .dm-quiet', (x) => x.textContent).catch(() => null);
  ok(quiet === '3 paid by themselves · £36.00', `${tag}: the quiet line of what paid itself`, quiet);
  ok(!(await p.evaluate(() => /from Mail/.test(document.querySelector('#today').textContent))), `${tag}: no “from Mail” line anywhere`);
  // (the parcel, in Coming Up, with its window and its bar)
  const pr = await p.$eval(PROW, (r) => ({ t: r.querySelector('b')?.textContent, sub: r.querySelector('.tx small')?.textContent, amt: r.querySelector('.ml-amt')?.innerText.replace(/\s+/g, ' ').trim(),
    bar: [...r.querySelectorAll('.ml-track i')].map((i) => i.className), label: r.querySelector('.ml-track')?.getAttribute('aria-label'), via: !!r.querySelector('.ml-via'),
    h: [...r.querySelectorAll('.ml-track i')].map((i) => Math.round(i.getBoundingClientRect().height)) })).catch(() => null);
  ok(pr && pr.t === 'Parcel from Wiggle' && pr.sub === 'Out for delivery · Evri' && /^(\d{1,2}–\d{1,2}|\d\d:\d\d–\d\d:\d\d) today$/.test(pr.amt) && pr.via, `${tag}: the parcel out for delivery, its window on the right`, js(pr));
  ok(pr && JSON.stringify(pr.bar) === JSON.stringify(['on', 'on', 'now', '']) && pr.label === 'Out Today' && pr.h.every((x) => x >= 3), `${tag}: its four-part bar, out today`, js(pr));
  ok(!(await p.$('#coming [data-pid="p-scam"]')) && !(await p.$('#coming [data-pid="bad parcel"]')) && !(await p.$('#today a[href^="javascript"]')), `${tag}: nothing malformed`);
  ok(!(await sideways()), `${tag}: no sideways scroll`);
  // (the rows inside the page, each number on the right in sight)
  const fits = await p.$$eval('#waiting .dm-row .ml-amt, #coming .ml-amt', (as) => as.every((a) => { const r = a.getBoundingClientRect(), g = a.closest('.group').getBoundingClientRect(); return r.right <= g.right + 0.5 && r.width > 0; }));
  ok(fits, `${tag}: every number on the right inside its card`);
  await full(`rows-${w}-${scheme}`);
  shots[`rows-${w}-${scheme}`] = `${out}/rows-${w}-${scheme}.png`;
  // (the Bills sheet, from the quiet line)
  await p.click('#waiting .dm-quiet');
  const bs = await p.waitForSelector(`${SHEET('bills')}[open]`, { timeout: 5000 }).then(() => true, () => false);
  ok(bs, `${tag}: the paid line opens the Bills sheet`);
  if (bs) {
    await wait(450);
    const b = await p.$eval(SHEET('bills'), (d) => ({ title: d.querySelector('.ifs-head h2')?.textContent, big: d.querySelector('.ml-big > b')?.textContent, n: d.querySelector('.ml-n')?.textContent.replace(/\s+/g, ' ').trim(),
      bars: [...d.querySelectorAll('.ml-bars i')].map((i) => Math.round(i.getBoundingClientRect().height)), last: d.querySelector('.ml-bars i.now em')?.textContent, labs: [...d.querySelectorAll('.ml-barlab span')].map((x) => x.textContent),
      split: [...d.querySelectorAll('.ml-split i')].map((i) => Math.round(i.getBoundingClientRect().width)), cats: [...d.querySelectorAll('.ml-cats span')].map((x) => x.textContent),
      heads: [...d.querySelectorAll('.ml-bills > .slabel')].map((x) => x.textContent), needs: [...d.querySelectorAll('.ml-bills > .group')].map((g) => [...g.querySelectorAll('[data-bill]')].map((x) => x.dataset.bill)),
      ps: d.querySelectorAll('.ml-bills p').length, w: d.getBoundingClientRect().width, sw: d.querySelector('.ifs-body').scrollWidth - d.querySelector('.ifs-body').clientWidth }));
    ok(b.title === 'Bills and Subscriptions' && b.big === '£186.40' && b.n === '11 bills and subscriptions · +£14.99 on ' + new Intl.DateTimeFormat('en-GB', { month: 'long' }).format(new Date(new Date().getFullYear(), new Date().getMonth() - 5, 15)),
      `${tag}: the month big, its count and its change since six months ago`, js(b));
    ok(b.bars.length === 6 && b.bars[5] > b.bars[0] && b.bars.every((x) => x > 10) && b.last === '£186' && b.labs.length === 6, `${tag}: six months of bars, the last labelled`, js(b));
    ok(b.split.length === 3 && b.split[0] > b.split[1] && b.split[1] > b.split[2] && JSON.stringify(b.cats) === JSON.stringify(['Home £112', 'Phone and internet £46', 'Subscriptions £28']), `${tag}: the split by kind, with its legend`, js(b));
    ok(JSON.stringify(b.heads) === JSON.stringify(['Needs You', 'Paid by Themselves']) && JSON.stringify(b.needs) === JSON.stringify([['str-1', 'oct-2611', 'adm-2611'], ['ee-2611', 'spt-2611']]), `${tag}: Needs You and Paid by Themselves`, js(b));
    ok(b.ps === 0 && b.sw <= 1, `${tag}: no footer, nothing sideways`, js(b));
    await shot(`bills-${w}-${scheme}`);
    shots[`bills-${w}-${scheme}`] = `${out}/bills-${w}-${scheme}.png`;
    await p.keyboard.press('Escape');
    await p.waitForSelector(SHEET('bills'), { state: 'detached', timeout: 5000 }).catch(() => {});
  }
  // (the trip: Mail's hidden booking in its day, faded, with Put Back, and "1 hidden")
  await p.click(CARD);
  if (await p.waitForSelector(`${SHEET('trip')}[open]`, { timeout: 8000 }).then(() => true, () => false)) {
    await wait(450);
    const tv = await p.$eval(SHEET('trip'), (d) => ({ cnt: d.querySelector('.tv-cnt')?.textContent, hid: [...d.querySelectorAll('.tv-hid')].map((r) => ({ id: r.dataset.hid, t: r.querySelector('b')?.textContent, sub: r.querySelector('small')?.textContent,
      back: r.querySelector('.tv-back')?.textContent, op: getComputedStyle(r.querySelector('b')).color, day: (() => { let x = r.previousElementSibling; while (x && !x.matches('.tv-day')) x = x.previousElementSibling; return x?.querySelector('span')?.textContent; })() })),
      norm: getComputedStyle(d.querySelector('.tv-row:not(.tv-hid) b')).color }));
    ok(tv.cnt === '1 hidden' && tv.hid.length === 1 && tv.hid[0].id === 'fado-77' && tv.hid[0].sub === 'Hidden' && tv.hid[0].back === 'Put Back' && /^[A-Z][a-z]+day \d{1,2}$/.test(tv.hid[0].day || '') && tv.hid[0].op !== tv.norm,
      `${tag}: Mail’s hidden booking in its day, faded, with Put Back; “1 hidden”`, js(tv));
    await shot(`trip-hidden-${w}-${scheme}`);
    shots[`trip-hidden-${w}-${scheme}`] = `${out}/trip-hidden-${w}-${scheme}.png`;
    await p.keyboard.press('Escape');
    await p.waitForSelector(SHEET('trip'), { state: 'detached', timeout: 5000 }).catch(() => {});
  }
  ok(errs.length === e0, `${tag}: no console error or page error`, js(errs.slice(e0)));
}

// ---- 8. the sheets: a bill's (Open Email, All Bills, Paid, Hide), Paid with Undo, then Hide for good ----
await today({ w: 390, scheme: 'dark' });
await p.waitForSelector(IROW('oct-2611'), { timeout: 15000 }).catch(() => {});
await p.click(IROW('oct-2611'));
const ms = await p.waitForSelector(`${SHEET('mail')}[open]`, { timeout: 5000 }).then(() => true, () => false);
const macts = ms ? await p.$$eval(`${SHEET('mail')} .bk-act`, (as) => as.map((a) => [a.textContent.trim(), a.getAttribute('href')])) : [];
const mwhen = ms ? await p.$eval(`${SHEET('mail')}`, (d) => ({ title: d.querySelector('.ifs-head h2').textContent, when: d.querySelector('.bk-when')?.textContent, p: d.querySelector('.bk-p')?.textContent })) : null;
ok(ms && mwhen.title === 'Octopus Energy' && /^£84\.20 · \w{3} \d{1,2}$/.test(mwhen.when) && mwhen.p === 'To pay · +18% on your usual £71', 'a bill’s sheet: what, the amount and its day', js(mwhen));
ok(JSON.stringify(macts.map((a) => a[0])) === JSON.stringify(['Open Email', 'All Bills', 'Paid', 'Hide']) && macts[0][1] === '/mail/#thread=th-oct-1', 'Open Email, All Bills, Paid, Hide', js(macts));
await shot('bill-sheet-390-dark');
await p.click(`${SHEET('mail')} [data-ml="bills"]`);
const allb = await p.waitForSelector(`${SHEET('mail')} .ifs-page[data-page="bills"] .ml-big`, { timeout: 3000 }).then(() => true, () => false);
ok(allb && (await p.$eval(`${SHEET('mail')} .ifs-head h2`, (x) => x.textContent)) === 'Bills and Subscriptions', 'All Bills: the Bills sheet');
await p.click(`${SHEET('mail')} [data-back]`);
await wait(300);
await p.click(`${SHEET('mail')} [data-ml="done"]`);
await wait(300);
ok(!(await p.$(IROW('oct-2611'))), 'Paid: the row gone at once');
const ptoast = await p.waitForSelector('.ifl-toast.on .ifl-toast-act', { timeout: 3000 }).then(() => p.$eval('.ifl-toast', (x) => x.textContent.trim()), () => null);
ok(/^Paid\s*Undo$/.test(ptoast || ''), 'its toast short, with Undo', ptoast);
await p.click('.ifl-toast .ifl-toast-act');
await wait(300);
ok(!!(await p.$(IROW('oct-2611'))), 'Undo: back at once');
await wait(7600);
ok(asked('oct-2611').length === 0, 'and Mail never asked', js(asked('oct-2611')));
await p.click(IROW('oct-2611'));
await p.waitForSelector(`${SHEET('mail')}[open]`, { timeout: 5000 }).catch(() => {});
await p.click(`${SHEET('mail')} [data-ml="hide"]`);
await wait(300);
const htoast = await p.$eval('.ifl-toast', (x) => x.textContent.trim()).catch(() => null);
ok(!(await p.$(IROW('oct-2611'))) && /^Hidden\s*Undo$/.test(htoast || ''), 'Hide: gone, “Hidden” with Undo', htoast);
await wait(8000);
ok(asked('oct-2611').length === 1 && asked('oct-2611')[0].auth, 'once Undo’s time is up: Mail asked to hide that bill, once, with the key', js(asked('oct-2611')));

// ---- 9. the parcel's sheet: Track on Evri (the courier's own page), Got It, Hide; the four-part bar with its labels ----
await p.click(PROW);
const ps = await p.waitForSelector(`${SHEET('mail')}[open]`, { timeout: 5000 }).then(() => true, () => false);
const pacts = ps ? await p.$$eval(`${SHEET('mail')} .bk-act`, (as) => as.map((a) => [a.textContent.trim(), a.getAttribute('href'), a.getAttribute('target')])) : [];
const plabs = ps ? await p.$$eval(`${SHEET('mail')} .ml-tracklab span`, (xs) => xs.map((x) => [x.textContent, x.className])) : [];
ok(JSON.stringify(pacts.map((a) => a[0])) === JSON.stringify(['Open Email', 'Track on Evri', 'Got It', 'Hide']) && pacts[1][1] === 'https://www.evri.com/track/parcel/H01AA2B3C4D5/details' && pacts[1][2] === '_blank',
  'a parcel’s sheet: Open Email, Track on Evri (its own page), Got It, Hide', js(pacts));
ok(JSON.stringify(plabs) === JSON.stringify([['Ordered', 'on'], ['Shipped', 'on'], ['Out Today', 'on'], ['Delivered', '']]), 'its four-part bar, labelled', js(plabs));
await shot('parcel-sheet-390-dark');
await p.click(`${SHEET('mail')} [data-ml="done"]`);
await wait(300);
ok(!(await p.$(PROW)), 'Got It: off Today at once');
await p.click('.ifl-toast .ifl-toast-act').catch(() => {});
await wait(300);
ok(!!(await p.$(PROW)), 'and back with Undo');

// ---- 10. the repeating invite: its row, its next dates, and Hide for the series ----
const CROW = '#coming [data-bid="club~20261112"]';
const crow = await p.$eval(CROW, (r) => ({ sub: r.querySelector('.tx small')?.textContent, amt: r.querySelector('.ml-amt')?.innerText.replace(/\s+/g, ' ').trim() })).catch(() => null);
ok(crow && crow.sub === 'The Old Firehouse · every other Thursday' && /^\d\d:\d\d (today|tomorrow)$/.test(crow.amt), 'a repeating invite’s date: “· every other Thursday”, its time on the right', js(crow));
await p.click(CROW);
const cs = await p.waitForSelector(`${SHEET('booking')}[open] .bk-occ`, { timeout: 5000 }).then(() => true, () => false);
const occ = cs ? await p.$eval(SHEET('booking'), (d) => ({ when: d.querySelector('.bk-when')?.textContent, rows: [...d.querySelectorAll('.bk-o')].map((o) => ({ off: o.classList.contains('off'), t: o.querySelector('.tx b').textContent,
  strike: getComputedStyle(o.querySelector('.tx b')).textDecorationLine, moved: !!o.querySelector('.chg'), was: o.querySelector('.tx small')?.textContent || '', pill: o.querySelector('.bk-pill')?.textContent || '' })),
  acts: [...d.querySelectorAll('.bk-act')].map((a) => a.textContent.trim()) })) : null;
ok(occ && /^Every other Thursday · \d\d:\d\d$/.test(occ.when) && occ.rows.length === 5, 'its sheet: how it repeats, and the next five dates', js(occ));
ok(occ && occ.rows[0].pill === 'Next' && occ.rows[1].off && occ.rows[1].strike === 'line-through' && occ.rows[1].pill === 'Off' && occ.rows[2].moved && /^was \d\d:\d\d$/.test(occ.rows[2].was), 'one cancelled struck through, one moved at its new time', js(occ?.rows));
ok(occ && JSON.stringify(occ.acts) === JSON.stringify(['Open Email', 'Hide']), 'Open Email and Hide', js(occ?.acts));
await shot('series-390-dark');
shots['series-390-dark'] = `${out}/series-390-dark.png`;
await p.click(`${SHEET('booking')} [data-bk="hide"]`);
await wait(300);
ok(!(await p.$(CROW)), 'Hide: every date of it off Today at once');
await wait(8000);
ok(asked('club~20261112').length === 1, 'and Mail asked once, with the date’s id (its series hidden in Mail)', js(asked('club~20261112')));

// ---- 11. Put Back in the trip: Mail's hidden, at once; one hidden here stays in its day ----
for (const [w, scheme] of [[390, 'dark'], [1440, 'light']]) {
  const tag = `${w} ${scheme}`;
  await today({ w, h: w > 1000 ? 900 : 844, scheme });
  await p.click(CARD);
  await p.waitForSelector(`${SHEET('trip')}[open]`, { timeout: 8000 }).catch(() => {});
  await wait(400);
  if (w === 390) {
    await p.click(`${SHEET('trip')} .tv-back[data-bid="fado-77"]`);
    await p.waitForSelector(`${SHEET('trip')} .tv-row[data-bid="fado-77"]:not(.tv-hid)`, { timeout: 5000 }).catch(() => {});
    const after = await p.$eval(SHEET('trip'), (d) => ({ cnt: d.querySelector('.tv-cnt')?.textContent || '', back: !!d.querySelector('.tv-row[data-do="booking"][data-bid="fado-77"]'), hid: d.querySelectorAll('.tv-hid').length }));
    ok(after.back && after.hid === 0 && after.cnt === '', `${tag}: Put Back: back in its day at once, the count gone`, js(after));
    ok(unasked('fado-77').length === 1 && unasked('fado-77')[0].auth, `${tag}: Mail asked to put it back at once, with the key`, js(unasked('fado-77')));
    const t2 = await p.$eval('.ifl-toast', (x) => x.textContent.trim()).catch(() => null);
    ok(t2 === 'Back on Your Day', `${tag}: said short`, t2);
    // (hidden from inside the trip: back to its days, where it stays, faded)
    await p.click(`${SHEET('trip')} .tv-row[data-bid="gyg-GYG8K2"]`);
    await p.waitForSelector(`${SHEET('trip')} .ifs-page[data-page="booking"] [data-bk="hide"]`, { timeout: 5000 }).catch(() => {});
    await p.click(`${SHEET('trip')} .ifs-page[data-page="booking"] [data-bk="hide"]`);
    await wait(500);
    const inday = await p.$eval(SHEET('trip'), (d) => ({ page: !!d.querySelector('.ifs-page'), hid: [...d.querySelectorAll('.tv-hid')].map((r) => r.dataset.hid), cnt: d.querySelector('.tv-cnt')?.textContent }));
    ok(!inday.page && JSON.stringify(inday.hid) === JSON.stringify(['gyg-GYG8K2']) && inday.cnt === '1 hidden', `${tag}: hidden from the trip: it stays in its day, faded, with Put Back`, js(inday));
    await shot('trip-hidden-here-390-dark');
    await wait(8000);
    ok(asked('gyg-GYG8K2').length === 1, `${tag}: Mail asked to hide it once Undo’s time was up`, js(asked('gyg-GYG8K2')));
    await p.click(`${SHEET('trip')} .tv-back[data-bid="gyg-GYG8K2"]`);
    await p.waitForSelector(`${SHEET('trip')} .tv-row[data-do="booking"][data-bid="gyg-GYG8K2"]`, { timeout: 5000 }).catch(() => {});
    ok(unasked('gyg-GYG8K2').length === 1 && !(await p.$(`${SHEET('trip')} .tv-hid`)), `${tag}: and Put Back brings it back, through Mail`, js(unasked('gyg-GYG8K2')));
  } else {
    const tv = await p.$eval(SHEET('trip'), (d) => ({ hid: d.querySelectorAll('.tv-hid').length, rows: d.querySelectorAll('.tv-row').length }));
    ok(tv.hid === 0 && tv.rows === 5, `${tag}: on a fresh load, both back on the trip (Mail’s card has them)`, js(tv));
    ok(!(await sideways()), `${tag}: no sideways scroll`);
  }
  await p.keyboard.press('Escape');
  await p.waitForSelector(SHEET('trip'), { state: 'detached', timeout: 5000 }).catch(() => {});
}
console.log('screenshots:', js(shots, 3000));

ok(!errs.filter((e) => /CSP violation/.test(e)).length, 'no CSP violation anywhere', js(errs));
console.log('notes (page errors and console errors):', js(errs.slice(0, 8), 1200));
console.log('Open-Meteo asked:', js([...new Set(omLog)], 400));
await ctx.close();
await (await K.hubBrowser()).close();
await K.b.close();
console.log(`FAILS ${K.fails()}`);
process.exit(0);
