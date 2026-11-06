// Mail on Your Day, kept safe from the mail it reads (the inflite repo's email/, beside this one). An email is anyone's to
// send, so what it holds never costs Mail's Worker more than a moment, never holds up the read-back, and never says it's
// someone it isn't: a repeating invite's rule of any length (BYDAY a thousand times over, UNTIL 9999) read in milliseconds;
// HTML left open (<head, <!--, <script, a run of <) read in time that grows with its length, not its square; a message
// that stops the read-back passed over the next time, not read again and again; schema.org's carrier or provider taken
// only from the courier's, shop's or biller's own domain (anyone's passes its own DMARC); a booking, a date of a
// repeating one or a parcel changed only by its own sender; and no more than 20 bookings from one email. Each against
// Mail's own code, its database node:sqlite as D1 with Mail's own schema, its files R2 kept in memory.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const MAIL = new URL('../../../../inflite/email/', import.meta.url);
const skip = !existsSync(new URL('src/repeat.js', MAIL)) && 'the inflite repo beside has no Mail on Your Day stage 3 (email/src/repeat.js)';
const load = (p) => import(new URL(p, MAIL).href);
const DAY = 864e5, H = 3600e3;
const Z = 'Europe/London';
const iso = (n) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);
// (how long a call takes, in ms)
const timed = async (f) => { const t = performance.now(); const v = await f(); return [performance.now() - t, v]; };
const LD = (o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;
const flight = (ref, no, n = 9) => ({ '@context': 'http://schema.org', '@type': 'FlightReservation', reservationNumber: ref, reservationStatus: 'http://schema.org/ReservationConfirmed',
  reservationFor: { '@type': 'Flight', flightNumber: no, airline: { '@type': 'Airline', iataCode: 'U2' }, departureAirport: { '@type': 'Airport', name: 'Bristol', iataCode: 'BRS' },
    departureTime: `${iso(n)}T06:30:00`, arrivalAirport: { '@type': 'Airport', name: 'Geneva', iataCode: 'GVA' }, arrivalTime: `${iso(n)}T09:20:00` } });

// ---- the database and the files ----
const sql = new DatabaseSync(':memory:');
const val = (a) => a.map((x) => (typeof x === 'boolean' ? +x : x === undefined ? null : x));
const st = (q, a = []) => ({ bind: (...b) => st(q, b), first: async () => sql.prepare(q).get(...val(a)) ?? null,
  all: async () => ({ results: sql.prepare(q).all(...val(a)), meta: {} }), run: async () => ({ meta: { changes: Number(sql.prepare(q).run(...val(a)).changes) } }),
  exec: async () => { if (/^\s*(SELECT|WITH)\b/i.test(q)) return { results: sql.prepare(q).all(...val(a)), meta: {} }; return { results: [], meta: { changes: Number(sql.prepare(q).run(...val(a)).changes) } }; } });
const DB = { prepare: (q) => st(q), batch: async (list) => {
  sql.exec('BEGIN');
  const out = [];
  try { for (const s of list) out.push(await s.exec()); sql.exec('COMMIT'); } catch (e) { sql.exec('ROLLBACK'); throw e; }
  return out;
} };
const r2 = new Map();
const R2 = {
  put: async (k, v) => { r2.set(k, typeof v === 'string' ? new TextEncoder().encode(v) : v); },
  get: async (k) => (r2.has(k) ? { arrayBuffer: async () => r2.get(k).slice().buffer, json: async () => JSON.parse(new TextDecoder().decode(r2.get(k))) } : null),
};
const env = { DB, MAIL: R2 };
const ready = async () => { await (await load('src/db.js')).ensureSchema(env); };
const rows = (t, where = '1') => sql.prepare(`SELECT * FROM ${t} WHERE ${where}`).all();

// =====================================================================================================================
// A1: a repeating invite's rule
// =====================================================================================================================
test('a repeating rule of any length: a 4 KB BYDAY (1MO a thousand times) isn’t read as a rule; lists once over, 31 at most; UNTIL 9999 ends ten years on, in milliseconds', { skip }, async () => {
  const { parseRule, lastOf, expand } = await load('src/repeat.js');
  const { spotEmail } = await load('src/spot.js');
  // (the reviewers' rule: lastOf took 25 s)
  const bomb = `FREQ=YEARLY;UNTIL=99991231;BYDAY=${Array(1000).fill('1MO').join(',')}`;
  const ics = `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:bomb@example.com\r\nDTSTART:20261110T100000Z\r\nRRULE:${bomb}\r\nSUMMARY:t\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
  const [ms, list] = await timed(async () => {
    const out = await spotEmail({ html: '', attachments: [{ mimeType: 'text/calendar', content: ics }], sender: 'a@example.com' });
    for (const b of out) if (b.rule) lastOf(b.rule.r, { wall: b.rule.w, zone: b.rule.z, ex: b.rule.ex, rd: b.rule.rd });
    return out;
  });
  assert.ok(ms < 500, `read in ${ms | 0} ms`);
  assert.equal(list.length, 1, 'the invite, its first date alone');
  assert.equal(list[0].rule, undefined, 'not as a rule');
  assert.equal(parseRule(bomb), null);
  assert.equal(parseRule(`FREQ=DAILY;${'X'.repeat(300)}`), null, 'longer than any real one');
  // (each list once over, and no more in one than a month has days, a year months)
  const r = parseRule('FREQ=YEARLY;BYDAY=1MO,1MO,-1FR,1MO;BYMONTH=1,1,2;BYMONTHDAY=3,3;BYSETPOS=1,1');
  assert.deepEqual([r.byday.length, r.bymonth, r.bymonthday, r.bysetpos], [2, [1, 2], [3], [1]]);
  const W = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
  const days = (k) => Array.from({ length: k }, (_, i) => `${i % 2 ? '-' : ''}${(i >> 1) + 1}${W[i % 7]}`).join(',');
  assert.equal(parseRule(`FREQ=YEARLY;BYDAY=${days(32)}`), null, '32 days: not a rule');
  assert.equal(parseRule(`FREQ=MONTHLY;BYMONTHDAY=${Array.from({ length: 31 }, (_, i) => i + 1).join(',')}`).bymonthday.length, 31);
  // (the most a rule can now hold, with no end for ten thousand years: its last date ten years on, worked out in time)
  const wall = { y: 2026, mo: 11, d: 10, hh: 10, mi: 0, ss: 0 };
  for (const rule of [`FREQ=YEARLY;UNTIL=99991231;BYDAY=${days(31)}`, 'FREQ=DAILY;COUNT=9999', `FREQ=YEARLY;COUNT=9999;BYMONTH=1,2,3,4,5,6,7,8,9,10,11,12;BYMONTHDAY=${Array.from({ length: 31 }, (_, i) => i + 1).join(',')}`]) {
    const [t, last] = await timed(() => lastOf(parseRule(rule), { wall, zone: Z }));
    assert.ok(t < 500, `${rule.slice(0, 40)}: ${t | 0} ms`);
    assert.ok(last <= Date.UTC(2036, 10, 11), `${rule.slice(0, 40)}: no later than ten years on (${new Date(last).toISOString()})`);
    const [t2] = await timed(() => expand(parseRule(rule), { wall, zone: Z, from: Date.now() - 2 * DAY, to: Date.now() + 366 * DAY, max: 400 }));
    assert.ok(t2 < 500, `the card's: ${t2 | 0} ms`);
  }
  // (a real one still ends where it says)
  assert.equal(new Date(lastOf(parseRule('FREQ=WEEKLY;UNTIL=20270105T235959Z'), { wall, zone: Z })).toISOString(), '2027-01-05T10:00:00.000Z');
});

// =====================================================================================================================
// A2: HTML left open
// =====================================================================================================================
test('HTML left open is read in linear time: <head, <!--, <script, a run of < and a tag’s attributes left open; a name of 100,000 <', { skip }, async () => {
  const { jsonLd, microdata, plain, cut, spotEmail } = await load('src/spot.js');
  const { textOf, parcelsOf } = await load('src/parcels.js');
  const { billsOf } = await load('src/bills.js');
  const n = 200000;
  const cases = {
    'jsonLd, a script left open': () => jsonLd('<script type="application/ld+json">x'.repeat(n / 36 | 0)),
    'microdata, <head left open': () => microdata(`itemscope ${'<head'.repeat(n / 5)}`),
    'microdata, <!-- left open': () => microdata(`itemscope ${'<!--'.repeat(n / 4)}`),
    'microdata, a run of tags left open': () => microdata(`itemscope ${'<a'.repeat(n / 2)}`),
    'textOf, <script left open': () => textOf('', '<script'.repeat(n / 7 | 0)),
    'plain, a run of <': () => plain('<'.repeat(n)),
    'cut, a run of <': () => cut('<'.repeat(n * 5), 80),
    'parcelsOf, a run of <': () => parcelsOf({ html: '', text: '<'.repeat(n), subject: 'x', sender: 'a@evri.com' }),
    'billsOf, a run of <': () => billsOf({ html: '', text: `bill £1 ${'<'.repeat(n)}`, subject: 'x', sender: 'a@ee.co.uk' }),
    'spotEmail, a booking’s microdata then <head left open': () => spotEmail({ html: `<div itemscope itemtype="http://schema.org/EventReservation"></div>${'<head'.repeat(n / 5)}` }),
    'spotEmail, a name of 500,000 <': () => spotEmail({ html: LD({ '@type': 'EventReservation', reservationFor: { '@type': 'Event', name: '<'.repeat(n * 2.5) } }) }),
  };
  for (const [name, f] of Object.entries(cases)) {
    const [ms] = await timed(f);
    assert.ok(ms < 500, `${name}: ${ms | 0} ms`);
  }
  // (and read as before: a head closed, a script after one left open, a comment, details after a long page)
  const html = `<html><head><title>x</title><style>p{}</style></head><body><!-- a <b>note</b> --><div itemscope itemtype="http://schema.org/FoodEstablishmentReservation">
    <span itemprop="reservationNumber">T-1</span><time itemprop="startTime" datetime="${iso(3)}T19:30:00"></time>
    <div itemprop="reservationFor" itemscope itemtype="http://schema.org/FoodEstablishment"><span itemprop="name">The Ivy &amp; Co</span></div></div></body></html>`;
  const [b] = await spotEmail({ html, sender: 'book@opentable.com' });
  assert.deepEqual([b?.kind, b?.title, b?.ref], ['restaurant', 'Table at The Ivy & Co', 'T-1']);
  assert.equal(textOf('', '<head><title>t</title></head><p>Out for delivery</p><script>var a = "<p>no</p>";</script><p>today</p>'), 'Out for delivery\ntoday');
  assert.equal(textOf('', '<head><p>One</p><script>x</script><p>Two</p>'), 'One\nTwo', 'a head left open swallows nothing; the script after it still taken out');
  assert.deepEqual(jsonLd(`<script type='application/ld+json'>{"a":1}</script ><script type="text/javascript">1</script><SCRIPT TYPE="application/ld+json">{"b":2}</SCRIPT>`), [{ a: 1 }, { b: 2 }]);
  assert.equal(plain('a <b>bold</b> &lt;3'), 'a bold <3');
});

// =====================================================================================================================
// A3: a message that stops the read-back
// =====================================================================================================================
test('a message that stops the read-back (its run killed, here never answering) is passed over the next time, and the rest read', { skip }, async () => {
  await ready();
  const { readBack } = await load('src/spot.js');
  const now = Date.now();
  sql.exec(`DELETE FROM messages; DELETE FROM spots; DELETE FROM meta WHERE k IN ('spot_back', 'spot_trips')`);
  sql.prepare(`INSERT INTO meta (k, v) VALUES ('spot_trips', '1')`).run();
  for (let i = 1; i <= 4; i++) {
    sql.prepare(`INSERT INTO messages (id, folder, thread_id, from_email, from_name, subject, date) VALUES (?, 'inbox', ?, 'noreply@easyjet.com', 'easyJet', 'Your booking', ?)`).run(`m${i}`, `t${i}`, now - (10 - i) * DAY);
    r2.set(`body/m${i}.json`, new TextEncoder().encode(JSON.stringify({ html: LD(flight(`EJX${i}`, `U2 80${i}`)) })));
  }
  sql.prepare(`INSERT INTO meta (k, v) VALUES ('spot_back', ?)`).run(JSON.stringify({ from: now - 60 * DAY, until: now, at: 0, id: '', kinds: ['trips'], n: 'one' }));
  // (m2's body never comes: as a run stopped mid-way, each time it reads m2)
  const killer = { ...env, MAIL: { ...R2, get: (k) => (k === 'body/m2.json' ? new Promise(() => {}) : R2.get(k)) } };
  const within = (p, ms) => Promise.race([p.then(() => 'done'), new Promise((r) => setTimeout(() => r('stuck'), ms))]);
  assert.equal(await within(readBack(killer, { batch: 8 }), 300), 'stuck', 'the first run stops at m2');
  const st = JSON.parse(sql.prepare(`SELECT v FROM meta WHERE k = 'spot_back'`).get().v);
  assert.equal(st.id, 'm2', 'its place kept before it was read');
  assert.equal(await within(readBack(killer, { batch: 8 }), 2000), 'done', 'the next run passes over m2 and goes on');
  assert.deepEqual(rows('spots').map((r) => r.ref).sort(), ['EJX1', 'EJX3', 'EJX4'], 'all but the one that stopped it');
  assert.equal(sql.prepare(`SELECT v FROM meta WHERE k = 'spot_back'`).get(), undefined, 'and done');
});

// =====================================================================================================================
// A4: lookalikes by schema.org
// =====================================================================================================================
test('schema.org from a lookalike is never read: a ParcelDelivery from evri-redelivery.top naming Evri, an Invoice from hmrc-refund.top naming HMRC; from the real one, by its own name', { skip }, async () => {
  const { parcelsOf } = await load('src/parcels.js');
  const { billsOf } = await load('src/bills.js');
  const mailDate = Date.now();
  const parcel = (carrier, seller = 'Wiggle') => LD({ '@context': 'http://schema.org', '@type': 'ParcelDelivery', carrier: { '@type': 'Organization', name: carrier }, trackingNumber: 'H01AA2B3C4D5',
    deliveryStatus: 'http://schema.org/OutForDelivery', expectedArrivalFrom: `${iso(0)}T11:00:00`, expectedArrivalUntil: `${iso(0)}T13:00:00`,
    partOfOrder: { '@type': 'Order', orderNumber: '8817205', seller: { '@type': 'Organization', name: seller } } });
  assert.deepEqual(parcelsOf({ html: parcel('Evri'), sender: 'track@evri-redelivery.top', mailDate, zone: Z }), [], 'the lookalike: not read at all');
  assert.deepEqual(parcelsOf({ html: parcel('Royal Mail', 'Amazon'), sender: 'orders@some-shop.example', mailDate, zone: Z }), [], 'nor any sender not known');
  const [e] = parcelsOf({ html: parcel('Evri'), sender: 'noreply@evri.com', mailDate, zone: Z });
  assert.deepEqual([e.carrier, e.carrierKey, e.stage, e.shop], ['Evri', 'evri', 2, 'Wiggle'], 'Evri’s own');
  const [d] = parcelsOf({ html: parcel('Royal Mail'), sender: 'noreply@evri.com', mailDate, zone: Z });
  assert.deepEqual([d.carrier, d.carrierKey], ['Evri', 'evri'], 'a courier’s own email: that courier, whichever its details name');
  const [z] = parcelsOf({ html: parcel('DPD', ''), sender: 'noreply@zara.com', mailDate, zone: Z });
  assert.deepEqual([z.carrier, z.carrierKey, z.shop], ['DPD', 'dpd', 'Zara'], 'a known shop’s own: the courier it names, and its own name');
  const invoice = (provider, pounds = '412.50') => LD({ '@context': 'http://schema.org', '@type': 'Invoice', provider: { '@type': 'Organization', name: provider }, accountId: 'UTR-1',
    totalPaymentDue: { '@type': 'PriceSpecification', price: pounds, priceCurrency: 'GBP' }, paymentDueDate: iso(3), paymentStatus: 'http://schema.org/PaymentDue' });
  assert.deepEqual(billsOf({ html: invoice('HMRC Self Assessment'), sender: 'billing@hmrc-refund.top', fromName: 'HMRC', mailDate, zone: Z }), [], 'the lookalike: not read at all');
  assert.deepEqual(billsOf({ html: invoice('Bristol Energy Co-op', '32.50'), sender: 'billing@bristolenergy.coop', mailDate, zone: Z }), [], 'nor any sender not known');
  const [o] = billsOf({ html: invoice('HMRC Self Assessment', '84.20'), sender: 'hello@octopus.energy', mailDate, zone: Z });
  assert.deepEqual([o.sender, o.key, o.cat, o.amount], ['Octopus Energy', 'octopus.energy', 'Home', 8420], 'the sender it knows, by its own name, never the one the invoice gives');
});

// =====================================================================================================================
// A5: another sender, knowing a reference
// =====================================================================================================================
test('a booking, a date of a repeating one and a parcel are changed only by their own sender; a date for a series not known isn’t kept; an email dated ahead counts as now', { skip }, async () => {
  await ready();
  const { spotEmail, keepBookings, spotStored } = await load('src/spot.js');
  const { keepParcels } = await load('src/parcels.js');
  sql.exec(`DELETE FROM spots; DELETE FROM spot_occ; DELETE FROM parcels; DELETE FROM meta WHERE k IN ('spot_back', 'spot_trips', 'spot_parcels', 'spot_bills')`);
  const keep = async (o, sender, mailDate = Date.now(), thread = 't1') => keepBookings(env, await spotEmail({ html: LD(o), sender, zone: Z }), { threadId: thread, messageId: `m-${mailDate}`, sender, mailDate });
  await keep(flight('EJX9', 'U2 8331'), 'noreply@easyjet.com', Date.now() - 2 * H);
  const { id, start_at: was } = rows('spots')[0];
  // (a stranger who knows the reference: no new time, no cancellation)
  await keep(flight('EJX9', 'U2 8331', 10), 'help@easyjet-support.top');
  await keep({ ...flight('EJX9', 'U2 8331'), reservationStatus: 'http://schema.org/ReservationCancelled' }, 'help@easyjet-support.top');
  const cancel = { '@context': 'http://schema.org', '@type': 'FlightReservation', reservationNumber: 'EJX9', reservationStatus: 'http://schema.org/ReservationCancelled',
    reservationFor: { '@type': 'Flight', flightNumber: 'U2 8331', airline: { '@type': 'Airline', iataCode: 'U2' }, departureAirport: { '@type': 'Airport', iataCode: 'BRS' }, arrivalAirport: { '@type': 'Airport', iataCode: 'GVA' } } };
  await keep(cancel, 'help@easyjet-support.top');
  let r = rows('spots', `id = '${id}'`)[0];
  assert.deepEqual([r.status, r.start_at, r.sender], ['confirmed', was, 'noreply@easyjet.com'], 'unchanged');
  // (easyJet's own, from a name under its domain: changed)
  await keep(flight('EJX9', 'U2 8331', 10), 'bookings@mail.easyjet.com');
  r = rows('spots', `id = '${id}'`)[0];
  assert.equal(r.start_at - was, DAY, 'easyJet’s own new time');
  await keep(cancel, 'noreply@easyjet.com');
  assert.equal(rows('spots', `id = '${id}'`)[0].status, 'cancelled', 'and its own cancellation');
  // (at a mail service anyone has an address at: the same address only)
  await keep(flight('PRV1', 'U2 1001'), 'priya@gmail.com');
  await keep({ ...flight('PRV1', 'U2 1001'), reservationStatus: 'http://schema.org/ReservationCancelled' }, 'someone@gmail.com');
  assert.equal(rows('spots', `ref = 'PRV1'`)[0].status, 'confirmed', 'another gmail.com address');

  // (a repeating invite's dates: only its organiser's mail moves one; one for a series not known isn't kept)
  const thu = (n) => { const d = new Date(Date.now() + n * DAY); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`; };
  const vevent = (uid, extra) => `BEGIN:VEVENT\r\nUID:${uid}\r\n${extra}\r\nSUMMARY:Book club\r\nEND:VEVENT\r\n`;
  const cal = (...evs) => [{ mimeType: 'text/calendar', content: `BEGIN:VCALENDAR\r\nMETHOD:REQUEST\r\n${evs.join('')}END:VCALENDAR\r\n` }];
  const keepIcs = async (attachments, sender) => keepBookings(env, await spotEmail({ attachments, sender, zone: Z }), { threadId: 't2', messageId: `i-${Math.random()}`, sender, mailDate: Date.now() });
  await keepIcs(cal(vevent('club@example.com', `DTSTART:${thu(-6)}T190000Z\r\nRRULE:FREQ=WEEKLY`)), 'priya@example.com');
  assert.equal(rows('spots', 'rule IS NOT NULL').length, 1);
  const moved = (sender) => keepIcs(cal(vevent('club@example.com', `RECURRENCE-ID:${thu(8)}T190000Z\r\nDTSTART:${thu(8)}T200000Z`)), sender);
  await moved('x@evil.example');
  assert.equal(rows('spot_occ').length, 0, 'a stranger’s move: not kept');
  await moved('priya@example.com');
  assert.equal(rows('spot_occ').length, 1, 'its organiser’s');
  await keepIcs(cal(vevent('nobody-knows@example.com', `RECURRENCE-ID:${thu(8)}T190000Z\r\nSTATUS:CANCELLED\r\nDTSTART:${thu(8)}T190000Z`)), 'x@evil.example');
  assert.equal(rows('spot_occ').length, 1, 'a date of a series not known: not kept');
  await keepIcs(cal(vevent('club2@example.com', `DTSTART:${thu(-6)}T180000Z\r\nRRULE:FREQ=WEEKLY`), vevent('club2@example.com', `RECURRENCE-ID:${thu(1)}T180000Z\r\nDTSTART:${thu(1)}T183000Z`)), 'sam@example.org');
  assert.equal(rows('spot_occ').length, 2, 'a series and its moved date in the same invite: both');

  // (an email dated ahead of when it came (receive.js allows a day): counted as now, so the next one still changes it)
  sql.prepare(`INSERT INTO meta (k, v) VALUES ('spot_trips', '1')`).run();
  const email = (n) => ({ html: LD(flight('EJX77', 'U2 7777', n)), attachments: [], headers: [] });
  await spotStored(env, { email: email(5), threadId: 't3', messageId: 'a1', sender: 'noreply@easyjet.com', date: Date.now() + 20 * H });
  const first = rows('spots', `ref = 'EJX77'`)[0];
  assert.ok(first.mail_date <= Date.now(), 'kept as of now');
  await spotStored(env, { email: email(6), threadId: 't3', messageId: 'a2', sender: 'noreply@easyjet.com', date: Date.now() + 1000 });
  const next = rows('spots', `ref = 'EJX77'`)[0];
  assert.deepEqual([next.message_id, next.start_at - first.start_at], ['a2', DAY], 'the next one changed it');

  // (parcels: joined across emails only where their senders agree; a delivered from another sender doesn't count)
  const at = { threadId: 't4', zone: Z };
  const p = (o) => ({ source: 'rules', carrierKey: null, carrier: '', base: '', shop: '', order: '', ref: 'H01ZZ2B3C4D5', stage: 1, failed: false, window: null, due: null, deliveredAt: null, note: '', orderedAt: null, items: null, ...o });
  await keepParcels(env, [p({ carrierKey: 'evri', carrier: 'Evri', base: 'evri.com', shop: 'Wiggle' })], { ...at, messageId: 'p1', sender: 'noreply@evri.com', mailDate: Date.now() - H });
  await keepParcels(env, [p({ stage: 3, deliveredAt: Date.now(), shop: 'Next' })], { ...at, messageId: 'p2', sender: 'orders@next.co.uk', mailDate: Date.now() });
  let ps = rows('parcels', `ref = 'H01ZZ2B3C4D5'`);
  assert.equal(ps.length, 2, 'another sender with the same number: a parcel of its own');
  const ev = ps.find((x) => x.sender === 'noreply@evri.com');
  assert.deepEqual([ev.stage, ev.shop], [1, 'Wiggle'], 'Evri’s not made delivered by it');
  await keepParcels(env, [p({ carrierKey: 'evri', carrier: 'Evri', stage: 2 })], { ...at, messageId: 'p3', sender: 'shipment-tracking@amazon.co.uk', mailDate: Date.now() });
  ps = rows('parcels', `ref = 'H01ZZ2B3C4D5'`);
  assert.equal(ps.length, 2, 'a shop’s email naming Evri as its carrier: joins Evri’s');
  assert.equal(ps.find((x) => x.carrier_key === 'evri').stage, 2);
});

// =====================================================================================================================
// A6: one email, many
// =====================================================================================================================
test('one email holds 20 bookings at most (60 reservations of 12 legs each: 20); the card’s parcels the newest heard of', { skip }, async () => {
  await ready();
  const { spotEmail } = await load('src/spot.js');
  const { parcelsCard } = await load('src/parcels.js');
  const many = Array.from({ length: 60 }, (_, i) => ({ ...flight(`R${i}`, 'U2 1'), reservationFor: Array.from({ length: 12 }, (_, j) => ({ ...flight('x', `U2 ${i * 12 + j + 100}`).reservationFor })) }));
  const list = await spotEmail({ html: LD({ '@context': 'http://schema.org', '@graph': many }), sender: 'a@example.com', zone: Z });
  assert.equal(list.length, 20);
  // (more than 200 on their way: the 200 heard of last are those looked at)
  sql.exec('DELETE FROM parcels');
  const ins = sql.prepare(`INSERT INTO parcels (id, shop, stage, due_at, mail_date, source, created, updated, hidden) VALUES (?, ?, 1, ?, ?, 'rules', 0, 0, 0)`);
  const now = Date.now();
  for (let i = 0; i < 220; i++) ins.run(`parcel-a-old${i}`, 'Old', null, now - 20 * DAY + i);
  for (let i = 0; i < 3; i++) ins.run(`parcel-z-new${i}`, 'New', now + H, now - H + i);
  // (the newest put in last, so a read in the table's own order would miss them)
  const firstIn = sql.prepare(`SELECT * FROM parcels WHERE hidden = 0 LIMIT 1`).get().id;
  const card = await parcelsCard(env, now);
  assert.ok(firstIn.startsWith('parcel-a-old'), 'in the table’s own order, the old ones first');
  assert.deepEqual(card.slice(0, 3).map((x) => x.shop), ['New', 'New', 'New'], 'those due soonest, the newest heard of, on the card');
});
