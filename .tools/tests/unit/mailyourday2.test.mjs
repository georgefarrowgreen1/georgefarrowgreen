// Mail on Your Day, stages 2 and 3, Mail's half (the inflite repo's email/, beside this one): parcels and bills read from
// mail by rules alone (schema.org first, then rules for the couriers', shops' and billers' own emails, by the domain of
// the address they're from, only where DMARC passed for it; a lookalike never), and repeating calendar invites (RRULE,
// EXDATE, RDATE, a date moved or cancelled by a later email). With realistic emails (fixtures/yourday/, their dates
// written @D+n@ (ISO), @L+n@ ("Thursday 12 November") and @THU+n@ (the yyyymmdd n days after the next Thursday), so they
// never go stale): Amazon's shipped, out-for-delivery and delivered set, Evri out for delivery with a window, Royal Mail
// delivered, a ParcelDelivery in JSON-LD, a lookalike scam that's never read, Octopus's bill by card, EE's by direct debit,
// Thames Water's Invoice in JSON-LD, an insurance renewal with last year's price, a Strava trial ending, Spotify's price rise,
// Netflix's receipt, a book club every other Thursday with an EXDATE and a moved date, the cancellation of one date, and
// an email with nothing in it. Then, through Mail's Worker against a real database (node:sqlite as D1, Mail's own
// schema) and R2 kept in memory: the two new switches (absent, not empty, while off); mail as it comes, one row a parcel
// joined across its emails; Today's card's parcels, bills and money, exactly as the contract has them; the key-only Hide
// and the new Put Back (unhide) for parcels, bills, a repeating invite's dates and a trip's bookings (trips[].hidden);
// the strip's data; Wrong; the 60-day read-back (DMARC read from the original); and turned off, gone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const MAIL = new URL('../../../../inflite/email/', import.meta.url);
const skip = !existsSync(new URL('src/parcels.js', MAIL)) && 'the inflite repo beside has no Mail on Your Day stage 2 (email/src/parcels.js)';
const load = (p) => import(new URL(p, MAIL).href);
const FIX = new URL('./fixtures/yourday/', import.meta.url);
const DAY = 864e5, H = 3600e3;
const Z = 'Europe/London';

// ---- dates, from today, in the account's zone ----
const at = (n) => new Date(Date.now() + n * DAY);
const partsIn = (d) => Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: Z, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(d).map((p) => [p.type, p.value]));
const ymdOf = (n) => { const p = partsIn(at(n)); return { y: +p.year, mo: +p.month, d: +p.day }; };
const longDay = (n) => new Intl.DateTimeFormat('en-GB', { timeZone: Z, weekday: 'long', day: 'numeric', month: 'long' }).format(at(n));
const iso = (n) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);
// (the next Thursday, 1 to 7 days on)
const THU = [1, 2, 3, 4, 5, 6, 7].find((k) => partsIn(at(k)).weekday === 'Thu');
const thu = (n) => { const { y, mo, d } = ymdOf(THU + n); return `${y}${String(mo).padStart(2, '0')}${String(d).padStart(2, '0')}`; };
const fill = (s, { mailDate = new Date(), messageId } = {}) => {
  let out = s.replace(/@D([+-]\d+)@/g, (_, n) => iso(+n)).replace(/@L([+-]\d+)@/g, (_, n) => longDay(+n)).replace(/@THU([+-]\d+)@/g, (_, n) => thu(+n)).replace(/@MAILDATE@/g, mailDate.toUTCString());
  if (messageId) out = out.replace(/^Message-ID: .*$/m, `Message-ID: <${messageId}>`);
  return out.replace(/\r?\n/g, '\r\n');
};
const raw = (name) => readFileSync(new URL(name, FIX), 'utf8');
const fixture = (name, o) => fill(raw(name), o);
const parse = async (r) => { const { default: PostalMime } = await import(new URL('node_modules/postal-mime/src/postal-mime.js', MAIL).href); return PostalMime.parse(r); };
const read = async (name, what) => {
  const e = await parse(fixture(name));
  const o = { html: e.html || '', text: e.text || '', subject: e.subject || '', sender: e.from.address, fromName: e.from.name, mailDate: Date.now(), zone: Z };
  return what === 'bills' ? (await load('src/bills.js')).billsOf(o) : (await load('src/parcels.js')).parcelsOf(o);
};
const dayStart = async (n) => { const { zonedMs } = await load('src/spot.js'); const { y, mo, d } = ymdOf(n); return zonedMs(y, mo, d, 0, 0, 0, Z); };
const wall = async (n, hh, mi) => { const { zonedMs } = await load('src/spot.js'); const { y, mo, d } = ymdOf(n); return zonedMs(y, mo, d, hh, mi, 0, Z); };

// ---- the database and the files, and the account standing in (as stage 1's test) ----
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
  put: async (k, v) => { r2.set(k, typeof v === 'string' ? new TextEncoder().encode(v) : new Uint8Array(v instanceof ArrayBuffer ? v : v.buffer ? v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) : v)); },
  get: async (k) => (r2.has(k) ? { arrayBuffer: async () => r2.get(k).slice().buffer, json: async () => JSON.parse(new TextDecoder().decode(r2.get(k))) } : null),
  delete: async (k) => { for (const x of [].concat(k)) r2.delete(x); },
  list: async ({ prefix, limit }) => ({ objects: [...r2.keys()].filter((k) => k.startsWith(prefix)).slice(0, limit).map((key) => ({ key })) }),
};
const KEY = 'mail-test-key-yourday2-0123';
const env = { DB, MAIL: R2, DOMAIN: 'inflite.ai', DEFAULT_FROM: 'hello@inflite.ai', ACCOUNT_ORIGIN: 'https://account.inflite.ai', MAIL_KEY: KEY, ASSETS: { fetch: async () => new Response('') } };
const later = [];
const ctx = { waitUntil: (p) => later.push(Promise.resolve(p).catch(() => {})) };
const settle = async () => { while (later.length) await later.shift(); };
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, init) => {
  const s = String(u);
  if (s === `${env.ACCOUNT_ORIGIN}/api/account/mail/notice`) return new Response(JSON.stringify({ on: true, will: 1, held: false }));
  if (s.startsWith(env.ACCOUNT_ORIGIN)) return new Response(JSON.stringify({ signedIn: true, admin: true, passkey: true, fresh: true, name: 'George' }), { headers: { 'Content-Type': 'application/json' } });
  return realFetch(u, init);
};
const worker = async () => (await load('src/index.js')).default;
const ask = async (path, { method = 'GET', body } = {}) => {
  const h = { 'Sec-Fetch-Site': 'same-origin', Cookie: `account=${'y'.repeat(30)}`, ...(body !== undefined && { 'Content-Type': 'application/json', 'X-Inflite': '1' }) };
  const res = await (await worker()).fetch(new Request(`https://email.inflite.ai${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env, ctx);
  await settle();
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { status: res.status, data };
};
const card = async () => { const res = await (await worker()).fetch(new Request('https://email.inflite.ai/api/connector/card', { headers: { Authorization: `Bearer ${KEY}` } }), env, ctx); return res.json(); };
const keyed = async (route, body, key = KEY) => {
  const res = await (await worker()).fetch(new Request(`https://email.inflite.ai/api/connector/${route}`, { method: 'POST', headers: { ...(key && { Authorization: `Bearer ${key}` }), 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) }), env, ctx);
  return { status: res.status, text: await res.text() };
};
const deliver = async (r, from = 'x@example.com') => {
  const { receiveEmail } = await load('src/receive.js');
  await receiveEmail({ to: 'hello@inflite.ai', from, raw: r, rawSize: r.length, setReject: () => assert.fail('refused'), forward: async () => {} }, env, ctx);
  await settle();
};
const threadOf = (messageId) => sql.prepare('SELECT thread_id FROM messages WHERE message_id = ?').get(messageId)?.thread_id;
const rows = (t) => sql.prepare(`SELECT * FROM ${t}`).all();
// (Octopus's earlier bills, each its own month, for its usual)
const octopus = (pounds, days, mailDays) => fixture('octopus-bill.eml', { mailDate: at(mailDays), messageId: `oe-${days}@octopus.energy` }).replace(/84\.20/g, pounds).replace(new RegExp(longDay(6), 'g'), longDay(days));

// =====================================================================================================================
// Parcels, read (rules alone)
// =====================================================================================================================
test('Amazon’s own emails: shipped (by Amazon, its order, when it’s due, the order’s day), out for delivery (today’s window), delivered (where it was left)', { skip }, async () => {
  const [s] = await read('amazon-shipped.eml');
  assert.equal(s.source, 'rules');
  assert.deepEqual([s.shop, s.carrier, s.carrierKey, s.stage, s.ref, s.order], ['Amazon', 'Amazon', 'amazon', 1, 'TBA304512345678', '204-5512093-7731526']);
  assert.equal(s.due, await dayStart(2), 'arriving: that day');
  assert.equal(s.window, null);
  assert.equal(s.orderedAt, await wall(-1, 12, 0), 'ordered the day it says');
  const [o] = await read('amazon-out.eml');
  assert.equal(o.stage, 2);
  assert.deepEqual(o.window, { from: await wall(0, 10, 0), to: await wall(0, 14, 0) });
  assert.equal(o.due, await dayStart(0));
  const [d] = await read('amazon-delivered.eml');
  assert.equal(d.stage, 3);
  assert.equal(d.note, 'Left in your porch');
  assert.ok(Math.abs(d.deliveredAt - Date.now()) < 60e3, 'delivered: when the email came');
  const { trackOf } = await load('src/parcels.js');
  assert.equal(trackOf('amazon', s.ref, s.order, 'amazon.co.uk'), 'https://www.amazon.co.uk/gp/your-account/order-details?orderID=204-5512093-7731526', 'Amazon’s own order page, never the email’s link');
});

test('Evri out for delivery: the shop, the window, the tracking number and Evri’s own tracking page; Royal Mail delivered; a ParcelDelivery in JSON-LD', { skip }, async () => {
  const [e] = await read('evri-out.eml');
  assert.deepEqual([e.shop, e.carrier, e.stage, e.ref, e.order, e.note], ['Wiggle', 'Evri', 2, 'H01AA2B3C4D5', '8817205', '']);
  assert.deepEqual(e.window, { from: await wall(0, 11, 0), to: await wall(0, 13, 0) });
  const { trackOf, COURIERS } = await load('src/parcels.js');
  assert.equal(trackOf(e.carrierKey, e.ref), 'https://www.evri.com/track/parcel/H01AA2B3C4D5');
  assert.equal(trackOf('evri', 'not a number'), null);
  for (const c of Object.values(COURIERS)) if (c.track) assert.match(c.track('AB123456789GB'), /^https:\/\//);
  const [r] = await read('royalmail-delivered.eml');
  assert.deepEqual([r.shop, r.carrier, r.stage, r.ref, r.note], ['Next', 'Royal Mail', 3, 'AB123456789GB', 'Left in your safe place']);
  const [z] = await read('parcel-jsonld.eml');
  assert.equal(z.source, 'schema');
  assert.deepEqual([z.shop, z.carrier, z.carrierKey, z.stage, z.ref, z.order], ['Zara', 'DPD', 'dpd', 3, '15501234567890', 'ZR-58210044']);
  assert.equal(z.orderedAt, Date.parse(`${iso(-28)}T19:12:00Z`));
  assert.equal(trackOf(z.carrierKey, z.ref), 'https://track.dpd.co.uk/parcels/15501234567890', 'DPD’s own page, not the trackingUrl the email gave');
  const { returnsOf } = await load('src/parcels.js');
  assert.deepEqual([returnsOf('Zara'), returnsOf('John Lewis'), returnsOf('M&S'), returnsOf('Wiggle'), returnsOf('Some Shop')], [30, 35, 35, 30, null]);
});

test('a lookalike never matches: evri-redelivery.top’s scam isn’t read, as a parcel or a bill; an email with nothing in it, nothing', { skip }, async () => {
  assert.deepEqual(await read('scam-evri.eml'), []);
  assert.deepEqual(await read('scam-evri.eml', 'bills'), []);
  assert.deepEqual(await read('empty.eml'), []);
  assert.deepEqual(await read('empty.eml', 'bills'), []);
  const { courierOf } = await load('src/parcels.js');
  const { senderOf } = await load('src/bills.js');
  for (const a of ['x@evri-redelivery.top', 'x@evri.com.parcel-help.top', 'x@myevri.com', 'x@royalmail.com-track.info', 'x@amazon.co.uk.example', 'x@dpd.co.uk.delivery'])
    assert.equal(courierOf(a), null, a);
  assert.equal(courierOf('noreply@emails.evri.com').key, 'evri', 'a name under the domain is that courier');
  assert.equal(courierOf('x@hermes-europe.co.uk').key, 'evri');
  for (const a of ['x@octopus-energy.co', 'x@octopus.energy.billing.top', 'x@paypal-netflix.com', 'x@council.gov.uk.example']) assert.equal(senderOf(a, '', 'council tax bill'), null, a);
  assert.equal(senderOf('x@info.netflix.com').name, 'Netflix');
  assert.equal(senderOf('ctax@exeter.gov.uk', 'Exeter City Council', 'Your council tax').name, 'Exeter City Council');
  assert.equal(senderOf('x@hmrc.gov.uk', '', 'your tax return'), null, 'a .gov.uk only for council tax');
});

// =====================================================================================================================
// Bills, read
// =====================================================================================================================
test('bills: Octopus by card (not paid by itself), EE by direct debit, an Invoice in JSON-LD (from a sender it knows, by its own name), in pence, by the day', { skip }, async () => {
  const [o] = await read('octopus-bill.eml', 'bills');
  assert.deepEqual([o.kind, o.sender, o.cat, o.amount, o.auto, o.account, o.source, o.key], ['bill', 'Octopus Energy', 'Home', 8420, false, 'A-3F9E21', 'rules', 'octopus.energy']);
  assert.equal(o.due, await dayStart(6));
  const [e] = await read('ee-bill.eml', 'bills');
  assert.deepEqual([e.kind, e.sender, e.cat, e.amount, e.auto], ['bill', 'EE', 'Phone and internet', 4500, true]);
  assert.equal(e.due, await dayStart(4));
  const [i] = await read('invoice-jsonld.eml', 'bills');
  assert.deepEqual([i.kind, i.sender, i.cat, i.amount, i.auto, i.account, i.source, i.per], ['bill', 'Thames Water', 'Home', 3250, false, 'TW-20419', 'schema', 'm']);
});

test('a renewal with last year’s price, a trial ending and what it costs after, a price rise, a receipt', { skip }, async () => {
  const [a] = await read('admiral-renewal.eml', 'bills');
  assert.deepEqual([a.kind, a.sender, a.cat, a.amount, a.was, a.auto, a.per, a.account], ['renewal', 'Admiral', 'Car', 41260, 38900, false, 'y', 'P71-0045123']);
  assert.equal(a.due, await dayStart(10));
  const [t] = await read('strava-trial.eml', 'bills');
  assert.deepEqual([t.kind, t.sender, t.cat, t.amount, t.auto, t.per], ['trial', 'Strava', 'Subscriptions', 899, true, 'm']);
  assert.equal(t.due, await dayStart(2));
  const [s] = await read('spotify-price.eml', 'bills');
  assert.deepEqual([s.kind, s.amount, s.was, s.auto, s.per], ['renewal', 1199, 1099, true, 'm']);
  assert.equal(s.due, await dayStart(12));
  const [n] = await read('netflix-receipt.eml', 'bills');
  assert.deepEqual([n.kind, n.sender, n.amount, n.auto], ['sub', 'Netflix', 1099, true]);
  assert.equal(n.due, await dayStart(-2));
});

test('unsure of the amount or the day, or not in pounds: not read', { skip }, async () => {
  const { billsOf } = await load('src/bills.js');
  const b = (text, sender = 'hello@octopus.energy') => billsOf({ text, subject: 'Your bill', sender, mailDate: Date.now(), zone: Z });
  assert.deepEqual(b('Your bill is ready. Amount due: £84.20. Log in to see when it’s due.'), [], 'no day');
  assert.deepEqual(b(`Your bill is ready. Please pay by ${longDay(5)}.`), [], 'no amount');
  assert.deepEqual(b(`Your bill is ready. Amount due: €84.20. Please pay by ${longDay(5)}.`), [], 'in euros');
  assert.deepEqual(b(`Your bill is ready. Amount due: $84.20. Please pay by ${longDay(5)}.`), [], 'in dollars');
  assert.deepEqual(b(`Your bill is ready. Amount due: £84.20. Please pay by Friday.`), [], 'a bare weekday is no date');
  assert.equal(b(`Your bill is ready. Amount due: £1,084.20. Please pay by ${longDay(5)}.`)[0].amount, 108420);
  const html = `<script type="application/ld+json">{"@type":"Invoice","totalPaymentDue":{"price":"20.00","priceCurrency":"EUR"},"paymentDueDate":"${iso(3)}"}</script>`;
  assert.deepEqual(billsOf({ html, sender: 'x@example.com', mailDate: Date.now(), zone: Z }), [], 'an invoice in euros');
});

test('a sender’s history: its usual (the median of its last five), last year’s, its last six; a month of them all', { skip }, async () => {
  const { compare, monthly, moneyOf } = await load('src/bills.js');
  const h = [68, 71, 74, 70.5, 72, 84.2].map((p, i) => ({ at: i * 30 * DAY, pence: Math.round(p * 100), kind: 'bill', per: 'm' }));
  assert.deepEqual(compare(h, 5 * 30 * DAY), { usual: 7100, was: null, last: [6800, 7100, 7400, 7050, 7200, 8420] });
  assert.equal(compare(h.slice(0, 1), 30 * DAY).usual, null, 'one before is no usual');
  assert.equal(compare([{ at: 0, pence: 38900, kind: 'renewal' }, { at: 365 * DAY, pence: 41260, kind: 'renewal' }], 365 * DAY).was, 38900);
  assert.equal(monthly([{ at: 0, pence: 41260, kind: 'renewal', per: 'y' }], DAY), 3438, 'a year’s, by twelve');
  assert.equal(monthly([{ at: 0, pence: 3000, kind: 'bill', per: null }, { at: 91 * DAY, pence: 3000, kind: 'bill', per: null }], 92 * DAY), 1000, 'a quarter’s, by three');
  assert.equal(monthly([{ at: 0, pence: 3000, kind: 'bill', per: 'm' }], 400 * DAY), 0, 'none in 13 months: nothing');
  const m = moneyOf([{ sender_key: 'a', at: Date.now() - DAY, pence: 1000, kind: 'sub', per: 'm', cat: 'Subscriptions' }], [{ amount: 1000 }], Date.now(), Z);
  assert.deepEqual(m, { month: 1000, n: 1, months: [0, 0, 0, 0, 0, 1000].map((x, i) => (i === 4 && new Date().getUTCDate() === 1 ? 1000 : x)), cats: [{ name: 'Subscriptions', pence: 1000 }], paidSelf: { n: 1, pence: 1000 } });
  // (bills known only from the read-back's start, 60 days ago: the months that began before it are unknown, not nothing)
  const known = moneyOf([{ sender_key: 'a', at: Date.now() - DAY, pence: 1000, kind: 'sub', per: 'm', cat: 'Subscriptions' }], [], Date.now(), Z, Date.now() - 60 * DAY);
  assert.equal(known.months.filter((v) => v === null).length >= 3, true, 'four or so months before it: null');
  assert.equal(known.months[5], 1000, 'this month always counted');
  assert.ok(known.months.slice(known.months.lastIndexOf(null) + 1).every(Number.isInteger), 'and those after it counted');
});

// =====================================================================================================================
// Repeating invites
// =====================================================================================================================
test('repeating rules: every other Thursday, the 3rd Tuesday, the last Friday, a month day, every year, COUNT, UNTIL, EXDATE, RDATE; the wall clock kept across the clocks changing', { skip }, async () => {
  const { parseRule, expand, repeatWords } = await load('src/repeat.js');
  const days = (rule, w, o = {}) => expand(parseRule(rule), { wall: w, zone: Z, ...o }).map((x) => x.day);
  const w = (y, mo, d, hh = 19) => ({ y, mo, d, hh, mi: 0, ss: 0 });
  assert.deepEqual(days('FREQ=WEEKLY;INTERVAL=2;BYDAY=TH;COUNT=4', w(2030, 10, 3)), ['20301003', '20301017', '20301031', '20301114']);
  const occ = expand(parseRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=TH;COUNT=4'), { wall: w(2030, 10, 17), zone: Z });
  assert.deepEqual(occ.map((o) => new Date(o.start).toISOString().slice(11, 16)), ['18:00', '19:00', '19:00', '19:00'], '19:00 in London before and after the clocks go back (BST, then GMT)');
  assert.deepEqual(days('FREQ=MONTHLY;BYDAY=3TU;COUNT=3', w(2030, 1, 15)), ['20300115', '20300219', '20300319']);
  assert.deepEqual(days('FREQ=MONTHLY;BYDAY=-1FR;COUNT=3', w(2030, 1, 25)), ['20300125', '20300222', '20300329']);
  assert.deepEqual(days('FREQ=MONTHLY;BYMONTHDAY=31;COUNT=3', w(2030, 1, 31)), ['20300131', '20300331', '20300531'], 'no 31st: skipped');
  assert.deepEqual(days('FREQ=YEARLY;COUNT=3', w(2030, 2, 28)), ['20300228', '20310228', '20320228']);
  assert.deepEqual(days('FREQ=YEARLY;BYMONTH=11;BYDAY=4TH;COUNT=2', w(2030, 11, 28)), ['20301128', '20311127']);
  assert.deepEqual(days('FREQ=DAILY;INTERVAL=3;UNTIL=20300110T235959Z', w(2030, 1, 1)), ['20300101', '20300104', '20300107', '20300110']);
  assert.deepEqual(days('FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4;WKST=MO', w(2030, 1, 7)), ['20300107', '20300109', '20300114', '20300116']);
  const ex = Date.UTC(2030, 0, 9, 19), rd = Date.UTC(2030, 0, 12, 10);
  assert.deepEqual(days('FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4', w(2030, 1, 7), { ex: [ex, '20300114'], rd: [rd] }), ['20300107', '20300112', '20300116'], 'skipped and added');
  assert.equal(expand(parseRule('FREQ=DAILY'), { wall: w(2030, 1, 1), zone: Z, max: 400 }).length, 400, '400 at most');
  assert.equal(days('FREQ=DAILY', w(2020, 1, 1), { from: Date.UTC(2030, 0, 1), to: Date.UTC(2030, 0, 3, 23) })[0], '20300101', 'years of them stepped over');
  for (const bad of ['FREQ=HOURLY', 'FREQ=WEEKLY;BYHOUR=9', 'FREQ=WEEKLY;BYDAY=XX', 'INTERVAL=2', 'FREQ=WEEKLY;COUNT=0', '']) assert.equal(parseRule(bad), null, bad);
  const say = (r, ww = w(2030, 1, 3)) => repeatWords(parseRule(r), ww);
  assert.equal(say('FREQ=DAILY'), 'every day');
  assert.equal(say('FREQ=WEEKLY;BYDAY=MO'), 'every week on Monday');
  assert.equal(say('FREQ=WEEKLY;INTERVAL=2;BYDAY=TH'), 'every other Thursday');
  assert.equal(say('FREQ=WEEKLY;INTERVAL=2'), 'every other Thursday', 'the first date’s weekday');
  assert.equal(say('FREQ=WEEKLY;BYDAY=MO,WE,FR'), 'every week on Mon, Wed and Fri');
  assert.equal(say('FREQ=MONTHLY;BYDAY=3TU'), 'every month on the 3rd Tuesday');
  assert.equal(say('FREQ=MONTHLY;BYDAY=-1FR'), 'every month on the last Friday');
  assert.equal(say('FREQ=MONTHLY'), 'every month on the 3rd');
  assert.equal(say('FREQ=YEARLY'), 'every year');
  assert.equal(say('FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR'), 'every weekday');
  assert.ok(say('FREQ=WEEKLY;INTERVAL=3;BYDAY=MO,TU,WE,TH,FR,SA,SU').length <= 40);
});

test('the book club invite: one series (its rule, its EXDATE) and its moved date; the cancellation of one date: by the series’ id and the date', { skip }, async () => {
  const { spotEmail } = await load('src/spot.js');
  const e = await parse(fixture('ics-series.eml'));
  const list = await spotEmail({ html: e.html, attachments: e.attachments, sender: e.from.address, zone: Z });
  assert.equal(list.length, 2);
  const [series, moved] = list;
  assert.equal(series.title, 'Book club');
  assert.equal(series.rule.r.freq, 'WEEKLY');
  assert.equal(series.rule.r.interval, 2);
  assert.equal(series.rule.z, Z);
  assert.equal(series.rule.ex.length, 1);
  assert.equal(series.start, await wall(THU - 28, 19, 0));
  assert.equal(moved.id, `${series.id}~${thu(0)}`);
  assert.equal(moved.override.rid, await wall(THU, 19, 0));
  assert.equal(moved.start, await wall(THU, 19, 30));
  const c = await parse(fixture('ics-cancel-one.eml'));
  const [cancel] = await spotEmail({ html: c.html, attachments: c.attachments, sender: c.from.address, zone: Z });
  assert.equal(cancel.id, `${series.id}~${thu(14)}`);
  assert.equal(cancel.status, 'cancelled');
  assert.match(cancel.id, /^[A-Za-z0-9_~-]{1,64}$/);
});

// =====================================================================================================================
// Through Mail's Worker
// =====================================================================================================================
test('the switches off (as they start): parcel and bill mail is kept, nothing read; the card has no parcels, bills or money; Settings has the three', { skip }, async () => {
  const { ensureSchema } = await load('src/db.js');
  await ensureSchema(env);
  await deliver(fixture('octopus-bill.eml'), 'hello@octopus.energy');
  await deliver(fixture('amazon-shipped.eml'), 'shipment-tracking@amazon.co.uk');
  assert.equal(rows('parcels').length + rows('bills').length, 0);
  assert.deepEqual(Object.keys(await card()).sort(), ['later', 'people', 'updates']);
  assert.deepEqual((await ask('/api/settings')).data.spot, { trips: false, parcels: false, bills: false, reading: false });
  assert.equal((await ask('/api/settings', { method: 'PATCH', body: { spot: { parcels: 'on' } } })).status, 400);
  assert.equal((await ask('/api/settings', { method: 'PATCH', body: { spot: {} } })).status, 400);
});

test('turned on: the last 60 days read back (DMARC from the original); parcels as they come, one row a parcel across its emails; a lookalike, no DMARC, or a failed one: never', { skip }, async () => {
  // (one switch, then the other straight after, each read-back started before the last is done: the second goes on with
  // both kinds, the first stops without writing over it)
  const patch = async (spot) => (await worker()).fetch(new Request('https://email.inflite.ai/api/settings', { method: 'PATCH', headers: { 'Sec-Fetch-Site': 'same-origin', Cookie: `account=${'y'.repeat(30)}`, 'Content-Type': 'application/json', 'X-Inflite': '1' }, body: JSON.stringify({ spot }) }), env, ctx);
  const first = await patch({ parcels: true, tz: Z });
  const on = { status: (await patch({ bills: true, tz: Z })).status };
  assert.equal(first.status, 200);
  assert.equal(on.status, 200);
  assert.deepEqual(JSON.parse(sql.prepare(`SELECT v FROM meta WHERE k = 'spot_back'`).get()?.v || '{}').kinds, ['parcels', 'bills'], 'reading back for both');
  await settle();
  assert.deepEqual((await ask('/api/settings')).data.spot, { trips: false, parcels: true, bills: true, reading: false }, 'and done');
  assert.deepEqual(sql.prepare(`SELECT k, v FROM meta WHERE k IN ('spot_parcels', 'spot_bills') ORDER BY k`).all().map((r) => [r.k, r.v]), [['spot_bills', '1'], ['spot_parcels', '1']]);
  assert.equal(rows('parcels').length, 1, 'Amazon’s shipped email, read back');
  assert.equal(rows('bills').length, 1, 'Octopus’s bill, read back');
  const amz = rows('parcels')[0];
  assert.deepEqual([amz.shop, amz.stage, amz.ref, amz.order_no, amz.thread_id], ['Amazon', 1, 'TBA304512345678', '204-5512093-7731526', threadOf('0102018f-amzn-shipped-5512093@email.amazon.co.uk')]);
  // (as they come: Amazon's out for delivery and delivered join it)
  await deliver(fixture('amazon-out.eml'), 'shipment-tracking@amazon.co.uk');
  assert.equal(rows('parcels').length, 1);
  assert.equal(rows('parcels')[0].stage, 2);
  await deliver(fixture('amazon-delivered.eml'), 'shipment-tracking@amazon.co.uk');
  const done = rows('parcels');
  assert.equal(done.length, 1, 'one row, three emails');
  assert.equal(done[0].stage, 3);
  assert.equal(done[0].note, 'Left in your porch');
  // (an older one after: never undoes it)
  await deliver(fixture('amazon-out.eml', { mailDate: at(-1), messageId: 'amzn-ofd-again@email.amazon.co.uk' }), 'shipment-tracking@amazon.co.uk');
  assert.equal(rows('parcels')[0].stage, 3, 'still delivered');
  assert.equal(rows('parcels')[0].note, 'Left in your porch');
  for (const [f, from] of [['evri-out.eml', 'noreply@evri.com'], ['royalmail-delivered.eml', 'no-reply@royalmail.com'], ['parcel-jsonld.eml', 'noreply@zara.com'], ['empty.eml', 'noreply@dpd.co.uk']]) await deliver(fixture(f), from);
  assert.equal(rows('parcels').length, 4);
  // (never: the lookalike (with its own domain's DMARC passing), Evri's own with no DMARC said, or with it failed)
  const n = rows('parcels').length + rows('bills').length;
  await deliver(fixture('scam-evri.eml'), 'tracking@evri-redelivery.top');
  const bare = fixture('evri-out.eml', { messageId: 'evri-nodmarc@evri.com' }).replace(/^Authentication-Results:.*\r\n/m, '').replace(/H01AA2B3C4D5/g, 'H09ZZ8Y7X6W5');
  await deliver(bare, 'noreply@evri.com');
  const failed = fixture('evri-out.eml', { messageId: 'evri-fail@evri.com' }).replace(/dmarc=pass/, 'dmarc=fail').replace(/H01AA2B3C4D5/g, 'H07QQ8Y7X6W5');
  await deliver(failed, 'noreply@evri.com');
  const forged = `Authentication-Results: mx.cloudflare.net; dmarc=none header.from=evri.com\r\n${fixture('evri-out.eml', { messageId: 'evri-forged@evri.com' }).replace(/H01AA2B3C4D5/g, 'H05PP8Y7X6W5')}`;
  await deliver(forged, 'noreply@evri.com');
  assert.equal(rows('parcels').length + rows('bills').length, n, 'none of those read');
  assert.equal(sql.prepare(`SELECT COUNT(*) AS n FROM messages WHERE message_id IN ('hold-9921@evri-redelivery.top', 'evri-nodmarc@evri.com', 'evri-fail@evri.com', 'evri-forged@evri.com')`).get().n, 4, 'though all kept as mail');
});

test('a read-back started again meanwhile (another switch turned on) goes on; the one before stops, writing nothing over it', { skip }, async () => {
  const { readBack } = await load('src/spot.js');
  const state = (n) => JSON.stringify({ from: Date.now() - 60 * DAY, until: Date.now(), at: 0, id: '', kinds: ['parcels'], n });
  sql.prepare(`INSERT OR REPLACE INTO meta (k, v) VALUES ('spot_back', ?)`).run(state('one'));
  // (once this run has read its state, another switch starts a new one)
  let swapped = false;
  const db = { ...DB, prepare: (q) => { const x = DB.prepare(q); if (!swapped && /SELECT v FROM meta WHERE k = \?1/.test(q)) { swapped = true; const f = x.bind; x.bind = (...b) => { const y = f(...b); const g = y.first; y.first = async () => { const r = await g(); sql.prepare(`UPDATE meta SET v = ? WHERE k = 'spot_back'`).run(state('two')); return r; }; return y; }; } return x; } };
  assert.equal(await readBack({ ...env, DB: db }, { batch: 1 }), false, 'stopped');
  assert.equal(JSON.parse(sql.prepare(`SELECT v FROM meta WHERE k = 'spot_back'`).get().v).n, 'two', 'the new one’s state, as it was');
  while (await readBack(env, { batch: 50 }));
  assert.equal(sql.prepare(`SELECT COUNT(*) AS n FROM meta WHERE k = 'spot_back'`).get().n, 0, 'the new one, done');
});

test('Today’s card: parcels exactly as the contract has them (on their way, delivered in the last 18 hours, a last day to return in the next 3), soonest first', { skip }, async () => {
  const c = await card();
  assert.ok(Array.isArray(c.parcels));
  assert.ok(!('ahead' in c), 'trips still off: no ahead');
  assert.equal(c.parcels.length, 4);
  for (const p of c.parcels) {
    assert.deepEqual(Object.keys(p).sort(), ['carrier', 'deliveredAt', 'due', 'id', 'note', 'order', 'ref', 'returnBy', 'shop', 'stage', 'thread', 'track', 'window'].sort());
    assert.match(p.id, /^parcel-[A-Za-z0-9_-]+$/);
    assert.ok(p.id.length <= 64 && p.shop.length <= 40 && p.carrier.length <= 40 && p.note.length <= 60 && p.ref.length <= 32 && p.order.length <= 32);
    assert.ok([0, 1, 2, 3].includes(p.stage));
    assert.ok(p.track === null || /^https:\/\//.test(p.track));
    assert.equal(typeof p.thread, 'string');
  }
  const by = Object.fromEntries(c.parcels.map((p) => [p.shop, p]));
  assert.deepEqual(Object.keys(by).sort(), ['Amazon', 'Next', 'Wiggle', 'Zara']);
  const w = by.Wiggle;
  assert.deepEqual([w.carrier, w.stage, w.ref, w.order, w.track, w.deliveredAt, w.returnBy], ['Evri', 2, 'H01AA2B3C4D5', '8817205', 'https://www.evri.com/track/parcel/H01AA2B3C4D5', null, null]);
  assert.deepEqual(w.window, { from: await wall(0, 11, 0), to: await wall(0, 13, 0) });
  assert.equal(w.due, await dayStart(0));
  assert.equal(by.Amazon.stage, 3);
  assert.equal(by.Amazon.track, 'https://www.amazon.co.uk/gp/your-account/order-details?orderID=204-5512093-7731526');
  assert.equal(by.Amazon.returnBy, (await dayStart(30)) - 1, 'Amazon’s 30 days from the order’s day: to the end of that day');
  assert.equal(by.Zara.returnBy, (await dayStart(2)) + DAY - 1, 'Zara’s 30 days from the order 28 days ago');
  assert.equal(by.Zara.track, 'https://track.dpd.co.uk/parcels/15501234567890');
  assert.equal(by.Next.note, 'Left in your safe place');
  assert.equal(by.Next.track, 'https://www.royalmail.com/track-your-item#/tracking-results/AB123456789GB');
  const key = (p) => (p.stage < 3 ? p.window?.from ?? p.due : p.deliveredAt);
  assert.deepEqual(c.parcels.map(key), c.parcels.map(key).sort((a, b) => a - b), 'soonest first');
  assert.doesNotMatch(JSON.stringify(c.parcels), /amazon-delivery-help|evri-track\.example|zara-dpd-tracking|<|>/, 'no link from an email, nothing else of it');
});

test('bills as they come, each sender’s history: the card’s bills (due in 14 days, 7 for one that pays itself) and money, exactly as the contract has them', { skip }, async () => {
  // (Octopus's five before, a month apart)
  for (const [p, d] of [['68.00', -144], ['71.00', -114], ['74.00', -84], ['70.50', -54], ['72.00', -24]]) await deliver(octopus(p, d, d - 10), 'hello@octopus.energy');
  for (const [f, from] of [['ee-bill.eml', 'noreply@ee.co.uk'], ['invoice-jsonld.eml', 'billing@thameswater.co.uk'], ['admiral-renewal.eml', 'renewals@admiral.com'], ['strava-trial.eml', 'no-reply@strava.com'], ['spotify-price.eml', 'no-reply@spotify.com'], ['netflix-receipt.eml', 'info@account.netflix.com']]) await deliver(fixture(f), from);
  const c = await card();
  assert.ok(Array.isArray(c.bills) && c.money && typeof c.money === 'object');
  for (const b of c.bills) {
    assert.deepEqual(Object.keys(b).sort(), ['amount', 'auto', 'cat', 'due', 'id', 'kind', 'last', 'sender', 'thread', 'usual', 'was'].sort());
    assert.match(b.id, /^bill-[A-Za-z0-9_-]+$/);
    assert.ok(['bill', 'renewal', 'trial', 'sub'].includes(b.kind));
    assert.ok(['Home', 'Phone and internet', 'Subscriptions', 'Car', 'Other'].includes(b.cat));
    assert.ok(Number.isInteger(b.amount) && (b.usual === null || Number.isInteger(b.usual)) && (b.was === null || Number.isInteger(b.was)));
    assert.ok(Array.isArray(b.last) && b.last.length <= 6 && b.last.every(Number.isInteger));
    assert.equal(typeof b.auto, 'boolean');
  }
  assert.deepEqual(c.bills.map((b) => b.sender), ['Strava', 'EE', 'Thames Water', 'Octopus Energy', 'Admiral'], 'soonest first; Spotify (pays itself, in 12 days) and Netflix (paid) not');
  const oe = c.bills.find((b) => b.sender === 'Octopus Energy');
  assert.deepEqual([oe.kind, oe.amount, oe.auto, oe.usual, oe.was, oe.cat], ['bill', 8420, false, 7100, null, 'Home']);
  assert.deepEqual(oe.last, [6800, 7100, 7400, 7050, 7200, 8420], 'its last six, oldest first, the newest this one');
  assert.equal(oe.due, await dayStart(6));
  const adm = c.bills.find((b) => b.sender === 'Admiral');
  assert.deepEqual([adm.kind, adm.amount, adm.was, adm.cat, adm.auto], ['renewal', 41260, 38900, 'Car', false]);
  const str = c.bills.find((b) => b.sender === 'Strava');
  assert.deepEqual([str.kind, str.amount, str.auto, str.last, str.usual], ['trial', 899, true, [], null]);
  const m = c.money;
  assert.deepEqual(Object.keys(m).sort(), ['cats', 'month', 'months', 'n', 'paidSelf']);
  assert.equal(m.month, 8420 + 4500 + 3250 + 3438 + 1199 + 1099, 'Octopus, EE, Thames Water, Admiral’s year by twelve, Spotify, Netflix (not the trial)');
  assert.equal(m.n, 6);
  assert.equal(m.months.length, 6);
  assert.ok(m.months.every((v) => v === null || Number.isInteger(v)) && m.months.some((v) => v === null), 'the months before the read-back unknown (null), the rest amounts');
  assert.equal(m.months[5], m.month);
  assert.deepEqual(m.cats, [{ name: 'Home', pence: 8420 + 3250 }, { name: 'Phone and internet', pence: 4500 }, { name: 'Car', pence: 3438 }, { name: 'Subscriptions', pence: 2298 }]);
  assert.deepEqual(m.paidSelf, { n: 1, pence: 1099 }, 'Netflix, paid by itself two days ago');
  assert.doesNotMatch(JSON.stringify(c.bills), /<|>|thameswater-pay/);
});

test('Hide and Put Back (POST /api/connector/hide, /unhide) for a parcel and a bill: the shared key alone; 204; 400, 404, 401 as Hide', { skip }, async () => {
  let c = await card();
  const parcel = c.parcels.find((p) => p.shop === 'Wiggle'), bill = c.bills.find((b) => b.sender === 'Octopus Energy');
  assert.equal((await keyed('unhide', { id: parcel.id }, null)).status, 401);
  assert.equal((await keyed('unhide', { id: parcel.id }, 'wrong')).status, 401);
  assert.equal((await ask('/api/connector/unhide', { method: 'POST', body: { id: parcel.id } })).status, 401, 'a sign-in is no key');
  assert.equal((await keyed('unhide', { id: 'a b' })).status, 400);
  assert.equal((await keyed('unhide', 'not json')).status, 400);
  assert.equal((await keyed('unhide', { id: 'x'.repeat(65) })).status, 400);
  assert.equal((await keyed('unhide', { id: 'parcel-nothing' })).status, 404);
  assert.equal((await keyed('hide', { id: 'bill-nothing' })).status, 404);
  for (const id of [parcel.id, bill.id]) assert.equal((await keyed('hide', { id })).status, 204);
  c = await card();
  assert.ok(!c.parcels.some((p) => p.id === parcel.id) && !c.bills.some((b) => b.id === bill.id), 'off the card');
  for (const id of [parcel.id, bill.id]) {
    const r = await keyed('unhide', { id });
    assert.equal(r.status, 204);
    assert.equal(r.text, '');
  }
  c = await card();
  assert.ok(c.parcels.some((p) => p.id === parcel.id) && c.bills.some((b) => b.id === bill.id), 'back on the card');
});

test('the strip: a parcel’s and a bill’s data on their conversations; Remove, Put It Back, Wrong (that sender’s kind not read again; put back, read again)', { skip }, async () => {
  const t = await ask(`/api/threads/${threadOf('evri-ofd-h01aa2b3c4d5@evri.com')}`);
  assert.equal(t.status, 200);
  const [p] = t.data.spots;
  assert.deepEqual([p.kind, p.shop, p.carrier, p.stage, p.ref, p.track, p.sender, p.hidden], ['parcel', 'Wiggle', 'Evri', 2, 'H01AA2B3C4D5', 'https://www.evri.com/track/parcel/H01AA2B3C4D5', 'Evri', false]);
  const b = (await ask(`/api/threads/${threadOf('oe-bill-a3f9e21-oct@octopus.energy')}`)).data.spots[0];
  assert.deepEqual([b.kind, b.sender, b.amount, b.usual, b.account, b.hidden], ['bill', 'Octopus Energy', 8420, 7100, 'A-3F9E21', false]);
  assert.deepEqual(b.last, [6800, 7100, 7400, 7050, 7200, 8420]);
  let r = await ask(`/api/spots/${p.id}`, { method: 'POST', body: { hidden: true } });
  assert.equal(r.status, 200);
  assert.equal(r.data.spots[0].hidden, true);
  r = await ask(`/api/spots/${p.id}`, { method: 'POST', body: { hidden: false } });
  assert.equal(r.data.spots[0].hidden, false);
  // (Wrong on a bill: Octopus's bills not read again; put back, read again)
  r = await ask(`/api/spots/${b.id}`, { method: 'POST', body: { wrong: true } });
  assert.equal(r.status, 200);
  assert.deepEqual(sql.prepare(`SELECT sender, kind FROM spot_wrong`).all().map((x) => ({ ...x })), [{ sender: 'hello@octopus.energy', kind: 'bill' }]);
  const n = rows('bills').length;
  await deliver(octopus('90.00', 36, 0).replace(/oe-36@/, 'oe-wrong@'), 'hello@octopus.energy');
  assert.equal(rows('bills').length, n, 'another of their bills: not read');
  assert.equal((await keyed('unhide', { id: b.id })).status, 204, 'Today’s Put Back clears it too');
  assert.equal(sql.prepare(`SELECT COUNT(*) AS n FROM spot_wrong`).get().n, 0);
  await deliver(octopus('91.00', 37, 0).replace(/oe-37@/, 'oe-again@'), 'hello@octopus.energy');
  assert.equal(rows('bills').length, n + 1, 'read again');
  // (Wrong on a parcel)
  r = await ask(`/api/spots/${p.id}`, { method: 'POST', body: { wrong: true } });
  assert.deepEqual(sql.prepare(`SELECT kind FROM spot_wrong`).all().map((x) => x.kind), ['parcel']);
  await ask(`/api/spots/${p.id}`, { method: 'POST', body: { hidden: false } });
});

test('repeating invites on the card: each date in the next 14 days its own item (id <series>~<yyyymmdd>), with repeat, next (cancelled and moved) and was; Hide on a date hides the series', { skip }, async () => {
  await ask('/api/settings', { method: 'PATCH', body: { spot: { trips: true } } });
  await deliver(fixture('ics-series.eml'), 'priya@example.com');
  await deliver(fixture('ics-cancel-one.eml'), 'priya@example.com');
  const series = sql.prepare(`SELECT * FROM spots WHERE rule IS NOT NULL`).get();
  assert.ok(series, 'one row for the series');
  assert.equal(sql.prepare(`SELECT COUNT(*) AS n FROM spot_occ`).get().n, 2, 'the moved date and the cancelled one, beside it');
  const c = await card();
  const items = c.ahead.filter((a) => a.id.startsWith(`${series.id}~`));
  assert.equal(items.length, 1, 'the next Thursday (the one after is cancelled)');
  const [a] = items;
  assert.equal(a.id, `${series.id}~${thu(0)}`);
  assert.ok(a.id.length <= 64);
  assert.deepEqual(Object.keys(a).sort(), ['end', 'id', 'kind', 'next', 'place', 'ref', 'repeat', 'start', 'status', 'sub', 'thread', 'title', 'trip', 'tz', 'was']);
  assert.equal(a.title, 'Book club');
  assert.equal(a.repeat, 'every other Thursday');
  assert.equal(a.start, await wall(THU, 19, 30), 'moved to 19:30');
  assert.equal(a.was, await wall(THU, 19, 0), 'from 19:00');
  assert.equal(a.end, await wall(THU, 21, 30));
  assert.equal(a.tz, Z);
  assert.equal(a.trip, null);
  assert.deepEqual(a.next, [
    { start: await wall(THU, 19, 30), was: await wall(THU, 19, 0) },
    { start: await wall(THU + 14, 19, 0), cancelled: true },
    { start: await wall(THU + 42, 19, 0) },
    { start: await wall(THU + 56, 19, 0) },
    { start: await wall(THU + 70, 19, 0) },
  ], 'the next five: moved, cancelled, and the one EXDATE skips left out');
  // (the strip: the series at its next date, in plain words)
  const s = (await ask(`/api/threads/${threadOf('bookclub-series-7f3a@example.com')}`)).data.spots[0];
  assert.deepEqual([s.title, s.repeat, s.start], ['Book club', 'every other Thursday', await wall(THU, 19, 30)]);
  assert.equal((await ask(`/api/threads/${threadOf('bookclub-cancel-7f3a@example.com')}`)).data.spots[0].id, series.id, 'the cancellation’s conversation shows the series too');
  // (Hide on a date: the whole series; Put Back, all of it)
  assert.equal((await keyed('hide', { id: a.id })).status, 204);
  assert.ok(!(await card()).ahead.some((x) => x.id.startsWith(series.id)));
  assert.equal((await keyed('unhide', { id: a.id })).status, 204);
  assert.ok((await card()).ahead.some((x) => x.id === a.id));
});

test('trips[].hidden: a trip’s bookings taken off, for Put Back on Today (10 at most); unhidden, back in its items', { skip }, async () => {
  await deliver(fixture('tap-return.eml'), 'bookings@flytap.com');
  await deliver(fixture('hotel.eml'), 'reservations@memmohotels.com');
  let c = await card();
  const lis = c.trips.find((t) => t.name === 'Lisbon');
  assert.ok(lis);
  assert.deepEqual(lis.hidden, []);
  const hotel = c.ahead.find((x) => x.kind === 'hotel');
  assert.equal((await keyed('hide', { id: hotel.id })).status, 204);
  c = await card();
  const t = c.trips.find((x) => x.name === 'Lisbon');
  assert.ok(!t.items.includes(hotel.id));
  assert.deepEqual(t.hidden, [{ id: hotel.id, title: 'Memmo Alfama', sub: 'Check-in from 15:00 · 3 nights', start: hotel.start }]);
  assert.equal((await keyed('unhide', { id: hotel.id })).status, 204);
  c = await card();
  assert.ok(c.trips.find((x) => x.name === 'Lisbon').items.includes(hotel.id));
  assert.deepEqual(c.trips.find((x) => x.name === 'Lisbon').hidden, []);
});

test('turned off: parcels, bills and money go from the card (absent), what was spotted goes (what was taken off stays), the strip with it', { skip }, async () => {
  const hid = rows('parcels').find((p) => p.shop === 'Zara').id;
  await keyed('hide', { id: hid });
  const off = await ask('/api/settings', { method: 'PATCH', body: { spot: { parcels: false, bills: false } } });
  assert.deepEqual(off.data.spot, { trips: true, parcels: false, bills: false, reading: false });
  const c = await card();
  assert.ok(!('parcels' in c) && !('bills' in c) && !('money' in c));
  assert.ok('ahead' in c, 'trips still on');
  assert.deepEqual(rows('parcels').map((p) => p.id), [hid]);
  assert.equal(rows('bills').length + rows('bill_history').length, 0);
  assert.ok(!('spots' in (await ask(`/api/threads/${threadOf('evri-ofd-h01aa2b3c4d5@evri.com')}`)).data));
});
