// needs: hub mail roof-mail
// Mail on Your Day, stage 1 (trips and bookings), on Mail's own page (email.ifl.test, Mail's Worker, the inflite repo's
// email/): George, the site's admin, on an iPhone, with real booking mail in Mail (the unit tests' fixtures/yourday/,
// delivered through Mail's own email handler: TAP's return flight in JSON-LD, a hotel, a table in microdata, and a
// letter with no booking). Off as it starts: no strip, and Today's card (asked with the shared key) has neither ahead nor
// trips. Settings' "Spot in your mail" → "Trips and bookings" turned on: the last 60 days read back, and the card has
// them, grouped as the Lisbon trip. The conversation's strip, as the approved mock-up's "In Mail": what, when, the
// facts, "On Your Day · part of Lisbon, …", how Mail knows; Remove → "Not on Your Day" / Put It Back; Wrong; a
// conversation opened by its address (#thread=<id>) while Mail's open, as Today's Open Email does; Today's Hide (the
// key-only route) seen on the strip; turned off: gone.
// Stages 2 and 3: "Parcels and returns" and "Bills and subscriptions" turned on (parcel and bill mail read back: Amazon,
// Evri, Zara's JSON-LD, Octopus with its five before, EE, Admiral, Strava, Spotify, Netflix; a lookalike scam never), the
// card's parcels, bills and money; a book club every other Thursday with a moved and a cancelled date, each date its own
// on the card; the strips for a parcel and a bill on Mail's own page (four-part bar, Track ›, last six, +18%), Remove and
// Put It Back, and Today's Hide and Put Back (the key-only routes); then the same strips in Mail inside Today
// (ifl.test/mail/, Mail's module), Remove there, and its Settings' three switches. No explanations: the how line is
// "Sender · ref X", and Settings has no footnote. No error on Mail's page or Today's.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { kit } from './lib.mjs';
import { makeAccount, PASSWORD } from './join.mjs';

const [,, S, out] = process.argv;
const K = await kit(S, out);
const { ok, one, hubPhone, hostAsk, errs } = K;
const MAIL = 'http://email.ifl.test:8788', ACCT = 'http://account.ifl.test:8788';
const KEY = 'mail-test-key';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 20000) => { const end = Date.now() + ms; for (;;) { const v = await Promise.resolve().then(f).catch(() => null); if (v || Date.now() > end) return v; await wait(300); } };
const js = (x) => String(JSON.stringify(x)).slice(0, 400);

// (a fixture, its dates from today, as unit/mailyourday.test.mjs fills them)
const FIX = new URL('./unit/fixtures/yourday/', import.meta.url);
const iso = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
// (and @L+n@, "Thursday 12 November", and @THU+n@, the yyyymmdd n days after the next Thursday, in George's zone)
const Z = 'Europe/London', at = (n) => new Date(Date.now() + n * 864e5);
const partsIn = (d) => Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: Z, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(d).map((x) => [x.type, x.value]));
const longDay = (n) => new Intl.DateTimeFormat('en-GB', { timeZone: Z, weekday: 'long', day: 'numeric', month: 'long' }).format(at(n));
const THU = [1, 2, 3, 4, 5, 6, 7].find((k) => partsIn(at(k)).weekday === 'Thu');
const thu = (n) => { const x = partsIn(at(THU + n)); return `${x.year}${x.month}${x.day}`; };
const fixture = (name, { mailDate = new Date(), messageId } = {}) => {
  let t = readFileSync(new URL(name, FIX), 'utf8').replace(/@D([+-]\d+)@/g, (_, n) => iso(+n)).replace(/@C([+-]\d+)@/g, (_, n) => iso(+n).replace(/-/g, ''))
    .replace(/@L([+-]\d+)@/g, (_, n) => longDay(+n)).replace(/@THU([+-]\d+)@/g, (_, n) => thu(+n)).replace(/@MAILDATE@/g, mailDate.toUTCString());
  if (messageId) t = t.replace(/^Message-ID: .*$/m, `Message-ID: <${messageId}>`);
  return t.replace(/\r?\n/g, '\r\n');
};
function deliver(raw, from) {
  return new Promise((done) => {
    const q = http.request({ host: '127.0.0.1', port: 8806, method: 'POST', agent: false, path: `/cdn-cgi/handler/email?from=${encodeURIComponent(from)}&to=hello%40inflite.ai`,
      headers: { 'Content-Type': 'message/rfc822', 'Content-Length': Buffer.byteLength(raw) } }, (res) => { res.resume(); res.on('end', () => done(res.statusCode)); });
    q.on('error', () => done(0)); q.end(raw);
  });
}
const card = () => hostAsk('email.ifl.test:8788', '/api/connector/card', { headers: { Authorization: `Bearer ${KEY}` } }).then((r) => r.json);

// ---- George, the site's admin, signed in just now with a passkey ----
const george = await hubPhone('george', await K.makeKeys());
const { p, ctx } = george;
await makeAccount(p, `${ACCT}/`, { name: 'George Farrow-Green', handle: 'georgeday', email: 'george@example.com', password: PASSWORD });
const gid = one("SELECT id FROM pg_users WHERE handle = 'georgeday'")[0]?.id;
one(`INSERT OR REPLACE INTO pg_meta (k, v) VALUES ('admin_user', '${gid}')`);
one(`INSERT OR IGNORE INTO pg_passkeys (id, user_id, public_key, alg, created_at) VALUES ('yourday-key', '${gid}', 'x', -7, ${Date.now()})`);
ok(!!gid, 'George, the site’s admin, with a passkey');

const sent = [];
for (const [f, from] of [['plain.eml', 'rowan@example.com'], ['tap-return.eml', 'bookings@flytap.com'], ['hotel.eml', 'reservations@memmohotels.com'], ['restaurant-microdata.eml', 'no-reply@opentable.com']])
  sent.push(await deliver(fixture(f), from));
ok(sent.every((s) => s >= 200 && s < 300), 'four emails come to Mail (three with bookings in them)', js(sent));

// ---- off, as it starts ----
const c0 = await card();
ok(c0 && 'people' in c0 && !('ahead' in c0) && !('trips' in c0), 'off: Today’s card as it was, neither ahead nor trips', js(c0));
const errs0 = errs.length;
await p.goto(`${MAIL}/`);
const listed = await p.waitForSelector('.pane.list .row-wrap[data-id] .row', { timeout: 30000 }).then(() => true, () => false);
ok(listed, 'Mail’s own page, its list');
const openRow = async (who) => {
  await p.locator('.row-wrap[data-id] .row', { hasText: who }).first().click();
  return p.waitForSelector('.mcard', { timeout: 15000 }).then(() => true, () => false);
};
const back = async () => { await p.evaluate(() => history.back()).catch(() => {}); await wait(700); };
ok(await openRow('TAP Air Portugal'), 'TAP’s conversation opens');
await wait(1200);
ok((await p.locator('.spot').count()) === 0, 'off: no strip');
await back();

// ---- Settings: Spot in your mail → Trips and bookings ----
await p.goto(`${MAIL}/#settings`);
const SW = '.set-sheet button.switch[aria-label="Trips and bookings"]';
const sw = await p.waitForSelector(SW, { timeout: 20000 }).then(() => true, () => false);
const group = sw ? await p.evaluate((s) => { const b = document.querySelector(s); const g = b.closest('.set-group'); return { k: g.previousElementSibling?.textContent, row: b.closest('.set-row').textContent, on: b.getAttribute('aria-checked'), hint: g.nextElementSibling?.textContent }; }, SW) : null;
ok(group?.k === 'Spot in your mail' && /Trips and bookings/.test(group.row) && group.on === 'false' && group.hint == null, 'Settings: “Spot in your mail”, “Trips and bookings”, off, and no footnote under it', js(group));
await p.screenshot({ path: `${out}/settings-off.png` });
await p.click(SW);
const saved = await until(async () => (await card())?.ahead);
ok((await p.getAttribute(SW, 'aria-checked')) === 'true', 'turned on');
const c1 = await until(async () => { const c = await card(); return c?.ahead?.length >= 4 ? c : null; }, 30000);
ok(saved && c1?.ahead.length === 4, 'the last 60 days read back: four bookings ahead (two flights, a hotel, a table)', js(c1?.ahead?.map((a) => a.title)));
ok(c1?.trips?.length === 1 && c1.trips[0].name === 'Lisbon' && c1.trips[0].items.length === 4 && c1.ahead.every((a) => a.trip === c1.trips[0].id), 'grouped as one trip, Lisbon', js(c1?.trips));
await p.screenshot({ path: `${out}/settings-on.png` });
await p.click('.set-sheet button.ifs-btn[aria-label="Close"]').catch(() => {});
await wait(800);

// ---- the whole way: the same emails, from real Mail through the account, as the trip card on George's Today ----
await p.goto('http://ifl.test:8788/');
await p.waitForSelector('#today[data-phase]', { timeout: 30000 }).catch(() => {});
const tripCard = await p.waitForSelector('#trip .trip-card', { timeout: 30000 }).then(() => p.$eval('#trip .trip-card', (c) => ({
  head: c.querySelector('.tp-h')?.textContent, next: c.querySelector('.tp-next')?.innerText.replace(/\s+/g, ' ').trim() })), () => null);
ok(/^Lisbon (today|tomorrow)$/.test(tripCard?.head || '') && /Flight to Lisbon/.test(tripCard?.next || ''), 'the whole way: real Mail’s bookings, through the account, as Lisbon’s trip card on George’s Today', js(tripCard));
await p.screenshot({ path: `${out}/today-trip.png` });
await p.goto(`${MAIL}/`);
await p.waitForSelector('.pane.list .row-wrap[data-id] .row', { timeout: 30000 }).catch(() => {});

// ---- the strip ----
ok(await openRow('TAP Air Portugal'), 'TAP’s conversation again');
const strips = await p.waitForSelector('.spot', { timeout: 15000 }).then(() => p.$$eval('.spot', (els) => els.map((e) => ({
  state: e.querySelector('.spot-state')?.textContent, title: e.querySelector('.spot-tx b')?.textContent,
  facts: [...e.querySelectorAll('.spot-facts > div')].map((d) => d.textContent), how: e.querySelector('.spot-how')?.textContent,
  btns: [...e.querySelectorAll('.spot-btns button')].map((b) => b.textContent), top: e.getBoundingClientRect().top }))), () => []);
const first = strips[0];
ok(strips.length === 2, 'the strip: both legs of the booking', js(strips));
ok(first && /^On Your Day · part of Lisbon, /.test(first.state) && /^Flight to Lisbon · \w+day 07:40$/.test(first.title), 'what it is, when, and that it’s on Your Day, part of Lisbon', js(first));
ok(first && JSON.stringify(first.facts) === JSON.stringify(['FromLHR T2 07:40', 'ToLIS 10:15', 'StatusBooked']), 'the facts: from, to, status', js(first?.facts));
ok(first && first.how === 'TAP Air Portugal · ref K7QX2M' && JSON.stringify(first.btns) === JSON.stringify(['Remove', 'Wrong']), 'who it’s from and its reference, no more; Remove and Wrong', js(first));
const above = await p.evaluate(() => { const s = document.querySelector('.spot'), m = document.querySelector('.mcard'); return !!s && !!m && s.getBoundingClientRect().bottom <= m.getBoundingClientRect().top + 1; });
ok(above, 'at the top of the conversation, above its messages');
await p.screenshot({ path: `${out}/strip.png` });
const outId = await p.getAttribute('.spot', 'data-spot');
await p.click('.spot >> nth=0 >> button[data-act="remove"]');
const removed = await until(() => p.evaluate(() => { const s = document.querySelector('.spot'); return s?.classList.contains('gone') && s.querySelector('.spot-state')?.textContent === 'Not on Your Day' && s.querySelector('button')?.textContent === 'Put it back'; }));
ok(removed, 'Remove: “Not on Your Day”, and Put It Back');
ok(!(await card()).ahead.some((a) => a.id === outId), 'and it’s off Today’s card');
await p.screenshot({ path: `${out}/strip-removed.png` });
await p.click('.spot >> nth=0 >> button[data-act="back"]');
ok(await until(() => p.evaluate(() => /^On Your Day/.test(document.querySelector('.spot .spot-state')?.textContent || ''))), 'Put It Back: on Your Day again');
ok((await card()).ahead.some((a) => a.id === outId), 'and on the card');

// ---- a conversation opened by its address while Mail's open (Today's Open Email), and Wrong ----
const table = (await card()).ahead.find((a) => a.kind === 'restaurant');
await p.evaluate((t) => { location.hash = `thread=${t}`; }, table.thread);
const byHash = await until(() => p.evaluate(() => [...document.querySelectorAll('.spot .spot-tx b')].map((b) => b.textContent).find((t) => /^Table at Taberna/.test(t)) || null));
ok(!!byHash && !/#thread=/.test(p.url()), '#thread=<id> with Mail open: that conversation, its strip (the table), the address tidied', `${byHash} ${p.url()}`);
await p.click('.spot >> nth=0 >> button[data-act="wrong"]');
const wronged = await until(() => p.evaluate(() => document.querySelector('.spot .spot-state')?.textContent === 'Not on Your Day' && /won’t read tables from/.test(document.querySelector('.toast')?.textContent || '')));
ok(wronged, 'Wrong: taken off, and said that sender’s tables won’t be read again');
ok(!(await card()).ahead.some((a) => a.id === table.id), 'off the card');

// ---- Today's Hide, seen on the strip ----
const hotel = (await card()).ahead.find((a) => a.kind === 'hotel');
const refused = await hostAsk('email.ifl.test:8788', '/api/connector/hide', { method: 'POST', body: { id: hotel.id } });
const hid = await hostAsk('email.ifl.test:8788', '/api/connector/hide', { method: 'POST', body: { id: hotel.id }, headers: { Authorization: `Bearer ${KEY}` } });
ok(refused.status === 401 && hid.status === 204 && !(await card()).ahead.some((a) => a.id === hotel.id), 'Today’s Hide: refused without the key; with it, 204, and off the card', `${refused.status} ${hid.status}`);
await p.evaluate((t) => { location.hash = `thread=${t}`; }, hotel.thread);
ok(await until(() => p.evaluate(() => { const s = document.querySelector('.spot'); return s && /^Memmo Alfama/.test(s.querySelector('.spot-tx b')?.textContent || '') && s.querySelector('.spot-state')?.textContent === 'Not on Your Day'; })), 'the hotel’s strip says it’s not on Your Day');

// ---- turned off ----
await p.goto(`${MAIL}/#settings`);
await p.waitForSelector(SW, { timeout: 20000 }).catch(() => {});
await p.click(SW);
const off = await until(async () => { const c = await card(); return c && !('ahead' in c) ? c : null; });
ok(!!off && !('trips' in off), 'turned off: the card has neither again', js(off));
await p.click('.set-sheet button.ifs-btn[aria-label="Close"]').catch(() => {});
await wait(600);
ok(await openRow('TAP Air Portugal'), 'TAP’s conversation');
await wait(1500);
ok((await p.locator('.spot').count()) === 0, 'and no strip');

// =====================================================================================================================
// Stages 2 and 3: parcels, bills, a repeating invite; the strips on Mail's own page and in Mail inside Today
// =====================================================================================================================
const sent2 = [];
for (const [f, from] of [['amazon-shipped.eml', 'shipment-tracking@amazon.co.uk'], ['amazon-out.eml', 'shipment-tracking@amazon.co.uk'], ['evri-out.eml', 'noreply@evri.com'],
  ['parcel-jsonld.eml', 'noreply@zara.com'], ['scam-evri.eml', 'tracking@evri-redelivery.top'], ['octopus-bill.eml', 'hello@octopus.energy'], ['ee-bill.eml', 'noreply@ee.co.uk'],
  ['admiral-renewal.eml', 'renewals@admiral.com'], ['strava-trial.eml', 'no-reply@strava.com'], ['spotify-price.eml', 'no-reply@spotify.com'], ['netflix-receipt.eml', 'info@account.netflix.com'],
  ['ics-series.eml', 'priya@example.com'], ['ics-cancel-one.eml', 'priya@example.com']])
  sent2.push(await deliver(fixture(f), from));
ok(sent2.every((s) => s >= 200 && s < 300), 'thirteen more emails come to Mail: parcels, a lookalike scam, bills, a repeating invite and the cancellation of one of its dates', js(sent2));
const c20 = await card();
ok(c20 && !('parcels' in c20) && !('bills' in c20) && !('money' in c20), 'off: the card has no parcels, bills or money', js(Object.keys(c20 || {})));

// ---- Settings: the two new switches beside Trips and bookings, no footnote; all three on ----
await p.goto(`${MAIL}/#settings`);
const SWS = ['Trips and bookings', 'Parcels and returns', 'Bills and subscriptions'].map((l) => `.set-sheet button.switch[aria-label="${l}"]`);
await p.waitForSelector(SWS[1], { timeout: 20000 }).catch(() => {});
const three = await p.evaluate((s) => { const b = document.querySelector(s); if (!b) return null; const g = b.closest('.set-group');
  return { rows: [...g.querySelectorAll('.set-row b')].map((x) => x.textContent), on: [...g.querySelectorAll('button.switch')].map((x) => x.getAttribute('aria-checked')), after: g.nextElementSibling?.className || null }; }, SWS[1]);
ok(three && JSON.stringify(three.rows) === JSON.stringify(['Trips and bookings', 'Parcels and returns', 'Bills and subscriptions']) && three.on.every((x) => x === 'false') && !/set-hint/.test(three.after || ''),
  'Settings: “Parcels and returns” and “Bills and subscriptions” beside “Trips and bookings”, off, and no footnote', js(three));
for (const sel of SWS) {
  await p.click(sel);
  await until(() => p.evaluate((s) => document.querySelector(s)?.getAttribute('aria-checked') === 'true', sel), 8000);
}
await p.screenshot({ path: `${out}/settings-three.png` });
// (Octopus's five bills before this one, a month apart, as they come now it's on)
for (const [pounds, d] of [['68.00', -144], ['71.00', -114], ['74.00', -84], ['70.50', -54], ['72.00', -24]])
  await deliver(fixture('octopus-bill.eml', { mailDate: at(d - 10), messageId: `oe-${-d}@octopus.energy` }).replace(/84\.20/g, pounds).replace(new RegExp(longDay(6), 'g'), longDay(d)), 'hello@octopus.energy');
const c2 = await until(async () => { const c = await card(); return c?.parcels?.length >= 3 && c?.bills?.length >= 4 && c.bills.find((b) => b.sender === 'Octopus Energy')?.usual && c.ahead?.some((a) => a.repeat) ? c : null; }, 40000);
const shops = (c2?.parcels || []).map((x) => x.shop).sort();
ok(JSON.stringify(shops) === JSON.stringify(['Amazon', 'Wiggle', 'Zara']), 'parcels read back: Amazon’s two emails as one parcel, Evri’s for Wiggle, Zara’s order details; the lookalike never', js(c2?.parcels));
const evri = c2?.parcels?.find((x) => x.shop === 'Wiggle'), zara = c2?.parcels?.find((x) => x.shop === 'Zara');
ok(evri?.stage === 2 && evri.carrier === 'Evri' && evri.window && evri.track === 'https://www.evri.com/track/parcel/H01AA2B3C4D5' && zara?.stage === 3 && zara.returnBy > Date.now() && zara.returnBy < Date.now() + 3 * 864e5,
  'Evri’s out for delivery today, its window and Evri’s own tracking page; Zara’s delivered, its last day to return in the next 3', js({ evri, zara }));
const oe = c2?.bills?.find((b) => b.sender === 'Octopus Energy');
ok(oe && oe.amount === 8420 && oe.usual === 7100 && !oe.auto && JSON.stringify(oe.last) === JSON.stringify([6800, 7100, 7400, 7050, 7200, 8420]), 'Octopus’s bill, £84.20 against its usual £71, its last six', js(oe));
ok(JSON.stringify((c2?.bills || []).map((b) => b.sender)) === JSON.stringify(['Strava', 'EE', 'Octopus Energy', 'Admiral']) && c2.money?.paidSelf?.n === 1 && c2.money.month > 0 && c2.money.months?.length === 6,
  'the bills due (Strava’s trial, EE’s direct debit, Octopus, Admiral’s renewal; not Spotify’s in 12 days, nor Netflix’s paid), money and one paid by itself', js({ bills: c2?.bills?.map((b) => b.sender), money: c2?.money }));
const club = c2?.ahead?.find((a) => a.repeat);
ok(club && club.title === 'Book club' && club.repeat === 'every other Thursday' && club.id.endsWith(`~${thu(0)}`) && club.was && club.start - club.was === 30 * 60e3 && club.next?.length === 5 && club.next[1].cancelled === true,
  'the book club: next Thursday its own item, moved to 19:30 (was 19:00), every other Thursday, the next five with the cancelled one', js(club));
console.log('CARD', JSON.stringify({ parcels: c2?.parcels?.slice(0, 2), bills: c2?.bills?.slice(0, 2), money: c2?.money, ahead: club ? [club] : [] }));
await p.click('.set-sheet button.ifs-btn[aria-label="Close"]').catch(() => {});
await wait(600);

// ---- the strips on Mail's own page ----
await p.goto(`${MAIL}/`);
await p.waitForSelector('.pane.list .row-wrap[data-id] .row', { timeout: 30000 }).catch(() => {});
await p.evaluate((t) => { location.hash = `thread=${t}`; }, evri?.thread);
const stripOf = (sel, cls = 'spot') => p.evaluate(([s, c]) => { const e = document.querySelector(s); return e && {
  state: e.querySelector(`.${c}-state`)?.textContent, title: e.querySelector(`.${c}-tx b`)?.textContent, facts: [...e.querySelectorAll(`.${c}-facts > div`)].map((d) => d.textContent),
  track: e.querySelector(`a.${c}-track`)?.href || null, labs: [...e.querySelectorAll(`.${c}-steplabs span, .${c}-labs span`)].map((x) => x.textContent),
  on: e.querySelectorAll(`.${c}-steps i.on`).length, now: e.querySelectorAll(`.${c}-steps i.now`).length, spark: e.querySelector(`.${c}-spark`)?.textContent || null,
  bars: e.querySelectorAll(`.${c}-bars i`).length, up: e.querySelectorAll(`.${c}-bars i.now`).length, how: e.querySelector(`.${c}-how`)?.textContent, gone: e.classList.contains('gone'),
  btns: [...e.querySelectorAll('button')].map((b) => b.textContent) }; }, [sel, cls]);
const ps = await until(() => stripOf('.spot[data-kind="parcel"]'));
ok(ps?.title === 'Parcel from Wiggle · today' && JSON.stringify(ps.facts) === JSON.stringify(['CourierEvri', 'Window11–13', 'TrackingTrack ›']) && ps.track === 'https://www.evri.com/track/parcel/H01AA2B3C4D5',
  'a parcel’s strip on Mail’s own page: from Wiggle today, Evri, its window, Track › to Evri’s own page', js(ps));
ok(ps && JSON.stringify(ps.labs) === JSON.stringify(['Ordered', 'Shipped', 'Out today', 'Delivered']) && ps.on === 2 && ps.now === 1 && ps.how === 'Evri · ref H01AA2B3C4D5' && ps.state === 'On Your Day',
  'the four-part bar at “Out today”; who it’s from and its reference, no more', js(ps));
await p.screenshot({ path: `${out}/strip-parcel.png` });
await p.click('.spot[data-kind="parcel"] button[data-act="remove"]');
ok(await until(async () => (await stripOf('.spot[data-kind="parcel"]'))?.state === 'Not on Your Day' && !(await card()).parcels.some((x) => x.id === evri.id)), 'Remove: not on Your Day, and off the card');
await p.click('.spot[data-kind="parcel"] button[data-act="back"]');
ok(await until(async () => (await stripOf('.spot[data-kind="parcel"]'))?.state === 'On Your Day' && (await card()).parcels.some((x) => x.id === evri.id)), 'Put It Back: on Your Day, and on the card');
await p.evaluate((t) => { location.hash = `thread=${t}`; }, oe?.thread);
const bs = await until(() => stripOf('.spot[data-kind="bill"]'));
ok(/^£84\.20 due \w+$/.test(bs?.title || '') && bs.facts[0] === 'Amount£84.20' && /^Due\w{3} \d{1,2}$/.test(bs.facts[1]) && bs.facts[2] === 'Usual£71' && bs.how === 'Octopus Energy · account A-3F9E21',
  'a bill’s strip: £84.20 due, its day, its usual £71; who it’s from and the account, no more', js(bs));
ok(bs && /Your last 6 from Octopus Energy£68–£74, now \+18%/.test(bs.spark || '') && bs.bars === 6 && bs.up === 1, 'its last six as bars, the newest marked, +18% on the usual', js(bs));
await p.screenshot({ path: `${out}/strip-bill.png` });
// (Today's Hide and Put Back, by the key alone, seen on the strip)
const noKey = await hostAsk('email.ifl.test:8788', '/api/connector/unhide', { method: 'POST', body: { id: oe.id } });
const hid2 = await hostAsk('email.ifl.test:8788', '/api/connector/hide', { method: 'POST', body: { id: oe.id }, headers: { Authorization: `Bearer ${KEY}` } });
ok(noKey.status === 401 && hid2.status === 204 && !(await card()).bills.some((b) => b.id === oe.id), 'Today’s Hide on the bill: off the card (Put Back refused without the key)', `${noKey.status} ${hid2.status}`);
await p.evaluate(() => { location.hash = ''; });
await wait(500);
await p.evaluate((t) => { location.hash = `thread=${t}`; }, oe.thread);
ok(await until(async () => (await stripOf('.spot[data-kind="bill"]'))?.state === 'Not on Your Day'), 'the strip says it’s not on Your Day');
const back2 = await hostAsk('email.ifl.test:8788', '/api/connector/unhide', { method: 'POST', body: { id: oe.id }, headers: { Authorization: `Bearer ${KEY}` } });
ok(back2.status === 204 && (await card()).bills.some((b) => b.id === oe.id), 'Today’s Put Back (POST /api/connector/unhide): 204, back on the card at once', String(back2.status));
const occHide = await hostAsk('email.ifl.test:8788', '/api/connector/hide', { method: 'POST', body: { id: club?.id }, headers: { Authorization: `Bearer ${KEY}` } });
const noClub = !(await card()).ahead.some((a) => a.repeat);
const occBack = await hostAsk('email.ifl.test:8788', '/api/connector/unhide', { method: 'POST', body: { id: club?.id }, headers: { Authorization: `Bearer ${KEY}` } });
ok(occHide.status === 204 && noClub && occBack.status === 204 && (await card()).ahead.some((a) => a.id === club.id), 'Hide on one Thursday hides the whole book club; Put Back, all of it', `${occHide.status} ${noClub} ${occBack.status}`);

// ---- the same strips in Mail inside Today (InFlite's page, Mail's module) ----
const HUBM = 'http://ifl.test:8788/mail/';
const roofStrip = (kind) => stripOf(`.m-mail .mr-spot[data-kind="${kind}"]`, 'mr-spot');
await p.goto(`${HUBM}#thread=${evri.thread}`);
const rp = await until(() => roofStrip('parcel'), 40000);
ok(rp?.title === 'Parcel from Wiggle · today' && JSON.stringify(rp.facts) === JSON.stringify(['CourierEvri', 'Window11–13', 'TrackingTrack ›']) && rp.track === evri.track && rp.on === 2 && rp.now === 1 && rp.how === 'Evri · ref H01AA2B3C4D5' && rp.state === 'On Your Day' && JSON.stringify(rp.btns) === JSON.stringify(['Remove', 'Wrong']),
  'Mail inside Today: the same parcel strip above the conversation (bar, window, Track ›, Remove and Wrong)', js(rp));
const aboveMsgs = await p.evaluate(() => { const s = document.querySelector('.m-mail .mr-spots'), m = document.querySelector('.m-mail .mr-msgs'); return !!s && !!m && s.getBoundingClientRect().bottom <= m.getBoundingClientRect().top + 1; });
ok(aboveMsgs, 'at the top of the conversation, above its messages');
await p.screenshot({ path: `${out}/hub-strip-parcel.png` });
await p.click('.m-mail .mr-spot[data-kind="parcel"] button[data-act="remove"]');
ok(await until(async () => { const s = await roofStrip('parcel'); return s?.state === 'Not on Your Day' && s.gone && JSON.stringify(s.btns) === JSON.stringify(['Put it back']) && !(await card()).parcels.some((x) => x.id === evri.id); }), 'Remove there: not on Your Day, Put It Back, and off Today’s card');
await p.click('.m-mail .mr-spot[data-kind="parcel"] button[data-act="back"]');
ok(await until(async () => (await roofStrip('parcel'))?.state === 'On Your Day' && (await card()).parcels.some((x) => x.id === evri.id)), 'Put It Back there: on Your Day again');
await p.goto('http://ifl.test:8788/');
await wait(800);
await p.goto(`${HUBM}#thread=${oe.thread}`);
const rb = await until(() => roofStrip('bill'), 40000);
ok(/^£84\.20 due \w+$/.test(rb?.title || '') && rb.facts[2] === 'Usual£71' && rb.bars === 6 && rb.up === 1 && /\+18%/.test(rb.spark || '') && rb.how === 'Octopus Energy · account A-3F9E21', 'and the bill’s, with its last six and +18%', js(rb));
await p.screenshot({ path: `${out}/hub-strip-bill.png` });
const tap = (await card()).ahead.find((a) => a.kind === 'flight');
await p.goto('http://ifl.test:8788/');
await wait(800);
await p.goto(`${HUBM}#thread=${tap?.thread}`);
const rf = await until(() => p.evaluate(() => [...document.querySelectorAll('.m-mail .mr-spot')].map((e) => ({ state: e.querySelector('.mr-spot-state')?.textContent, title: e.querySelector('.mr-spot-tx b')?.textContent, how: e.querySelector('.mr-spot-how')?.textContent }))).then((l) => (l.length ? l : null)), 40000);
ok(rf?.length === 2 && /^On Your Day · part of Lisbon, /.test(rf[0].state) && /^Flight to Lisbon · \w+day 07:40$/.test(rf[0].title) && rf[0].how === 'TAP Air Portugal · ref K7QX2M', 'a booking’s strip there too: both legs, part of Lisbon', js(rf));
await p.goto('http://ifl.test:8788/');
await wait(800);
await p.goto(`${HUBM}#settings`);
const roofSw = await until(() => p.evaluate(() => { const sh = document.querySelector('dialog.ifl-sheet[data-sheet="mail-settings"][open]'); if (!sh) return null;
  const r = ['trips', 'parcels', 'bills'].map((k) => sh.querySelector(`[data-key="spot-${k}"]`)); return r.every(Boolean) ? r.map((x) => ({ t: x.querySelector('b')?.textContent, on: x.querySelector('input')?.checked })) : null; }), 30000);
ok(roofSw && JSON.stringify(roofSw.map((x) => x.t)) === JSON.stringify(['Trips and bookings', 'Parcels and returns', 'Bills and subscriptions']) && roofSw.every((x) => x.on), 'Mail Settings inside Today: the three switches, on', js(roofSw));
await p.screenshot({ path: `${out}/hub-settings.png` });

// ---- the whole way, stage 2: the bill and the parcel from real Mail, through the account, in Today's own day ----
await p.goto('http://ifl.test:8788/');
await p.waitForSelector('#today[data-phase]', { timeout: 30000 }).catch(() => {});
const dayOf = () => p.evaluate(() => fetch('/api/today?v=2', { credentials: 'include', cache: 'no-store' }).then((r) => r.json()).catch(() => null));
const whole = await until(async () => { const d = await dayOf(); return d?.money && d?.owed ? d : null; }, 30000);
const oeRow = whole?.owed?.find((r) => /Octopus/.test(JSON.stringify(r)));
ok(!!oeRow && /84\.20/.test(JSON.stringify(oeRow)), 'the whole way: Octopus’s bill from real Mail is a Waiting for You row in Today’s day', js(whole?.owed));
ok(whole?.money && whole.money.month > 0 && Array.isArray(whole.money.months) && whole.money.months.length === 6, 'and the Bills sheet has its month and six months', js(whole?.money));

const mine = errs.slice(errs0).filter((e) => e.startsWith('george:'));
ok(!mine.length, 'no error on Mail’s page or in Mail inside Today', js(mine));
await ctx.close();
await (await K.hubBrowser()).close();
await K.b.close();
console.log(`FAILS ${K.fails()}`);
process.exit(0);
