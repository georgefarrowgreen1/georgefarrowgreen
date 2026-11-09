// Mail on Your Day, stage 1 (trips and bookings), Mail's half (the inflite repo's email/, beside this one): bookings read
// from mail by rules alone (schema.org JSON-LD and microdata, calendar invites), with realistic emails (fixtures/yourday/,
// their dates written @D+n@ (and @C+n@ for a calendar's) for n days from today, so they never go stale): a return flight
// in JSON-LD (@graph, @id references), a hotel (a bare local time, a date with no time, a trailing comma), a table in
// microdata, an invite with TZID and folded lines, a flight with no offset (the account's zone), its cancellation, a
// changed time, mail with no booking, and broken JSON-LD. Then, through Mail's Worker against a real database (node:sqlite
// as D1, Mail's own schema) and R2 kept in memory: nothing read while Settings' switch is off; on, mail as it comes is
// read and kept one row a leg, by a stable id (a changed time and a cancellation change it, an older email never undoes a
// newer one); grouped into trips; Today's card gains ahead and trips (absent while off), bounded, plain; the key-only
// Hide (204); the strip's data on a conversation and its Remove / Put It Back / Wrong; the 60-day read-back once it's
// turned on; and a failure to spot never stops mail being kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const MAIL = new URL('../../../../inflite/email/', import.meta.url);
const skip = !existsSync(new URL('src/spot.js', MAIL)) && 'the inflite repo beside has no Mail on Your Day (email/src/spot.js)';
const load = (p) => import(new URL(p, MAIL).href);
const FIX = new URL('./fixtures/yourday/', import.meta.url);
const DAY = 864e5, H = 3600e3;

// (a fixture, its dates filled in from today, its lines as mail's)
const iso = (n) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);
const fill = (s, { mailDate = new Date(), messageId } = {}) => {
  let out = s.replace(/@D([+-]\d+)@/g, (_, n) => iso(+n)).replace(/@C([+-]\d+)@/g, (_, n) => iso(+n).replace(/-/g, '')).replace(/@MAILDATE@/g, mailDate.toUTCString());
  if (messageId) out = out.replace(/^Message-ID: .*$/m, `Message-ID: <${messageId}>`);
  return out.replace(/\r?\n/g, '\r\n');
};
const fixture = (name, o) => fill(readFileSync(new URL(name, FIX), 'utf8'), o);
const parse = async (raw) => { const { default: PostalMime } = await import(new URL('node_modules/postal-mime/src/postal-mime.js', MAIL).href); return PostalMime.parse(raw); };
const spotted = async (name, zone = 'Europe/London') => {
  const { spotEmail } = await load('src/spot.js');
  const e = await parse(fixture(name));
  return spotEmail({ html: e.html, attachments: e.attachments, sender: e.from.address, zone });
};

// ---- the database and the files, and the account standing in ----
const sql = new DatabaseSync(':memory:');
let breakSpots = false;
const val = (a) => a.map((x) => (typeof x === 'boolean' ? +x : x === undefined ? null : x));
const guard = (q) => { if (breakSpots && /spot_wrong|INTO spots/.test(q)) throw new Error('D1_ERROR: spots unreadable'); };
const st = (q, a = []) => ({ bind: (...b) => st(q, b), first: async () => (guard(q), sql.prepare(q).get(...val(a)) ?? null),
  all: async () => (guard(q), { results: sql.prepare(q).all(...val(a)), meta: {} }), run: async () => (guard(q), { meta: { changes: Number(sql.prepare(q).run(...val(a)).changes) } }),
  // (in a batch: a read's rows, a write's changes)
  exec: async () => { guard(q); if (/^\s*(SELECT|WITH)\b/i.test(q)) return { results: sql.prepare(q).all(...val(a)), meta: {} }; return { results: [], meta: { changes: Number(sql.prepare(q).run(...val(a)).changes) } }; } });
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
const KEY = 'mail-test-key-yourday-0123';
const env = { DB, MAIL: R2, DOMAIN: 'inflite.ai', DEFAULT_FROM: 'hello@inflite.ai', ACCOUNT_ORIGIN: 'https://account.inflite.ai', MAIL_KEY: KEY, ASSETS: { fetch: async () => new Response('') } };
const later = [];
const ctx = { waitUntil: (p) => later.push(Promise.resolve(p).catch(() => {})) };
const settle = async () => { while (later.length) await later.shift(); };
const quietly = async (fn) => { const was = console.error; const said = []; console.error = (...a) => said.push(a.join(' ')); try { await fn(); } finally { console.error = was; } return said; };
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, init) => {
  const s = String(u);
  if (s === `${env.ACCOUNT_ORIGIN}/api/account/mail/notice`) return new Response(JSON.stringify({ on: true, will: 1, held: false }));
  if (s.startsWith(env.ACCOUNT_ORIGIN)) return new Response(JSON.stringify({ signedIn: true, admin: true, passkey: true, fresh: true, name: 'George' }), { headers: { 'Content-Type': 'application/json' } });
  return realFetch(u, init);
};
const ask = async (path, { method = 'GET', body, headers = {}, cookie = true } = {}) => {
  const { default: worker } = await load('src/index.js');
  const h = { Origin: 'https://email.inflite.ai', 'Sec-Fetch-Site': 'same-origin', ...(cookie && { Cookie: `account=${'y'.repeat(30)}` }), ...(body !== undefined && { 'Content-Type': 'application/json', 'X-Inflite': '1' }), ...headers };
  const res = await worker.fetch(new Request(`https://email.inflite.ai${path}`, { method, headers: h, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) }), env, ctx);
  await settle();
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { status: res.status, data, text, headers: res.headers };
};
const card = async () => { const { default: worker } = await load('src/index.js'); const res = await worker.fetch(new Request('https://email.inflite.ai/api/connector/card', { headers: { Authorization: `Bearer ${KEY}` } }), env, ctx); return { status: res.status, data: await res.json() }; };
const hide = async (body, key = KEY) => { const { default: worker } = await load('src/index.js');
  const res = await worker.fetch(new Request('https://email.inflite.ai/api/connector/hide', { method: 'POST', headers: { ...(key && { Authorization: `Bearer ${key}` }), 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) }), env, ctx);
  return { status: res.status, text: await res.text(), headers: res.headers }; };
// (mail as it comes, through Mail's email handler)
const deliver = async (raw, from = 'x@example.com') => {
  const { receiveEmail } = await load('src/receive.js');
  await receiveEmail({ to: 'hello@inflite.ai', from, raw, rawSize: raw.length, setReject: () => assert.fail('refused'), forward: async () => {} }, env, ctx);
  await settle();
};
const spots = () => sql.prepare('SELECT * FROM spots ORDER BY start_at').all();
const threadOf = (messageId) => sql.prepare('SELECT thread_id FROM messages WHERE message_id = ?').get(messageId)?.thread_id;

// =====================================================================================================================
// What's read from each email (rules alone)
// =====================================================================================================================
test('a return flight in JSON-LD (@graph, @id references, two legs, one booking): both legs, the outbound one by its reference', { skip }, async () => {
  const list = await spotted('tap-return.eml');
  assert.equal(list.length, 2);
  const [out, back] = list;
  assert.equal(out.kind, 'flight');
  assert.equal(out.title, 'Flight to Lisbon');
  assert.equal(out.sub, 'TP1351 · LHR T2 07:40 → LIS 10:15');
  assert.equal(out.ref, 'K7QX2M');
  assert.equal(out.start, Date.parse(`${iso(1)}T07:40:00Z`));
  assert.equal(out.end, Date.parse(`${iso(1)}T10:15:00Z`));
  assert.deepEqual([out.from, out.to, out.city], ['LHR', 'LIS', 'Lisbon']);
  assert.deepEqual(out.place, { name: 'London Heathrow' });
  assert.deepEqual(out.dest, { lat: 38.7742, lon: -9.1342 }, 'where it lands, as the booking gives it');
  assert.equal(out.status, 'confirmed');
  assert.equal(out.source, 'schema');
  assert.match(out.id, /^flight-[A-Za-z0-9_-]+$/);
  assert.ok(out.id.length <= 64);
  assert.equal(back.title, 'Flight to London');
  assert.equal(back.sub, 'TP1366 · LIS 18:05 → LHR 20:40', 'a flight number written whole (TP1366) or apart (TP + 1351): the same');
  assert.notEqual(out.id, back.id);
  // (the same booking read again: the same ids)
  assert.deepEqual((await spotted('tap-return.eml')).map((b) => b.id), [out.id, back.id]);
});

test('a hotel: a bare local time (the account’s zone), a date with no time (the whole day), its nights; a trailing comma forgiven', { skip }, async () => {
  const [h] = await spotted('hotel.eml');
  const { zonedMs } = await load('src/spot.js');
  const [y, m, d] = iso(1).split('-').map(Number);
  assert.equal(h.kind, 'hotel');
  assert.equal(h.title, 'Memmo Alfama');
  assert.equal(h.sub, 'Check-in from 15:00 · 3 nights');
  assert.equal(h.start, zonedMs(y, m, d, 15, 0, 0, 'Europe/London'));
  const [y2, m2, d2] = iso(4).split('-').map(Number);
  assert.equal(h.end, zonedMs(y2, m2, d2 + 1, 0, 0, 0, 'Europe/London') - 1, 'checking out: to the end of that day, no time made up');
  assert.deepEqual(h.place, { name: 'Memmo Alfama', lat: 38.7114, lon: -9.1302 }, 'its place, with where it is (numbers, from strings)');
  assert.equal(h.city, 'Lisbon');
  assert.equal(h.ref, '88213');
  // (read in another account zone, the bare time moves with it)
  const [ny] = await spotted('hotel.eml', 'America/New_York');
  assert.equal(ny.start, zonedMs(y, m, d, 15, 0, 0, 'America/New_York'));
});

test('a table in microdata (nested items, a time element, text in a table): kind, title, party, when', { skip }, async () => {
  const [r] = await spotted('restaurant-microdata.eml');
  assert.equal(r.kind, 'restaurant');
  assert.equal(r.title, 'Table at Taberna da Rua das Flores');
  assert.equal(r.sub, '2 people · Lisbon');
  assert.equal(r.start, Date.parse(`${iso(2)}T20:00:00Z`));
  assert.equal(r.ref, 'OT55120');
  assert.equal(r.city, 'Lisbon');
});

test('a calendar invite: folded lines, escapes, TZID (and its VALARM not taken for the event)', { skip }, async () => {
  const [w] = await spotted('invite-tzid.eml');
  const { zonedMs } = await load('src/spot.js');
  const [y, m, d] = iso(3).split('-').map(Number);
  assert.equal(w.kind, 'booking');
  assert.equal(w.source, 'ics');
  assert.equal(w.title, 'Alfama food walk');
  assert.equal(w.tz, 'Europe/Lisbon');
  assert.equal(w.start, zonedMs(y, m, d, 11, 0, 0, 'Europe/Lisbon'));
  assert.equal(w.end, zonedMs(y, m, d, 13, 30, 0, 'Europe/Lisbon'));
  assert.match(w.place.name, /^Largo do Chafariz de Dentro, Alfama, Lisbon - meet by the f/, 'unfolded, unescaped');
  assert.ok(w.place.name.length <= 60);
  assert.deepEqual([w.place.lat, w.place.lon], [38.7115, -9.1276]);
  assert.match(w.sub, /^11:00–13:30 · Largo/);
});

test('calendar times: Z, TZID (IANA, Windows, a path), floating (the account’s zone), all-day; METHOD:CANCEL and STATUS:CANCELLED; REPLY isn’t an invite', { skip }, async () => {
  const { icsBookings, zonedMs } = await load('src/spot.js');
  const cal = (dt, extra = '', method = 'REQUEST') => ['BEGIN:VCALENDAR', `METHOD:${method}`, 'BEGIN:VEVENT', 'UID:u1@x', `DTSTART${dt}`, 'SUMMARY:Thing', ...[].concat(extra), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const z = 'Europe/London';
  const one = (s, m) => icsBookings(s, { zone: z, method: m })[0];
  assert.equal(one(cal(':20301201T090000Z')).start, Date.UTC(2030, 11, 1, 9));
  assert.equal(one(cal(';TZID=Europe/Paris:20300701T090000')).start, Date.UTC(2030, 6, 1, 7));
  assert.equal(one(cal(';TZID=Europe/Paris:20300701T090000')).tz, 'Europe/Paris');
  assert.equal(one(cal(';TZID="Romance Standard Time":20300701T090000')).start, Date.UTC(2030, 6, 1, 7));
  assert.equal(one(cal(';TZID=/mozilla.org/20070129_1/America/New_York:20300701T090000')).start, Date.UTC(2030, 6, 1, 13));
  const floating = one(cal(':20300701T090000'));
  assert.equal(floating.start, zonedMs(2030, 7, 1, 9, 0, 0, z), 'floating: the account’s zone');
  assert.equal(floating.tz, null);
  assert.equal(one(cal(';TZID=Nowhere/Special:20300701T090000')).start, zonedMs(2030, 7, 1, 9, 0, 0, z), 'a TZID that names no zone: the account’s');
  const allDay = one(cal(';VALUE=DATE:20300701', 'DTEND;VALUE=DATE:20300703'));
  assert.equal(allDay.start, zonedMs(2030, 7, 1, 0, 0, 0, z));
  assert.equal(allDay.end, zonedMs(2030, 7, 3, 0, 0, 0, z) - 1);
  assert.match(allDay.sub, /^2 days/);
  assert.equal(one(cal(':20301201T090000Z', [], 'CANCEL')).status, 'cancelled');
  assert.equal(one(cal(':20301201T090000Z', 'STATUS:CANCELLED')).status, 'cancelled');
  assert.equal(one(cal(':20301201T090000Z'), 'CANCEL').status, 'cancelled', 'the part’s own method');
  assert.equal(icsBookings(cal(':20301201T090000Z', [], 'REPLY'), { zone: z }).length, 0);
  assert.equal(one(cal(':20301201T090000Z')).id, undefined, '(ids are given by spotEmail)');
  // (an .ics file sent as a plain attachment is read too)
  const { spotEmail } = await load('src/spot.js');
  const got = await spotEmail({ html: '<p>See attached</p>', attachments: [{ filename: 'booking.ICS', mimeType: 'application/octet-stream', content: new TextEncoder().encode(cal(':20301201T090000Z')) }], zone: z });
  assert.equal(got.length, 1);
  assert.match(got[0].id, /^booking-/);
});

test('a flight with no offset: the account’s zone (the booking gives no zone of its own); its cancellation, with no times, names the same leg', { skip }, async () => {
  const [f] = await spotted('easyjet.eml');
  const { zonedMs } = await load('src/spot.js');
  const [y, m, d] = iso(9).split('-').map(Number);
  assert.equal(f.start, zonedMs(y, m, d, 6, 30, 0, 'Europe/London'));
  assert.equal(f.sub, 'U28331 · BRS 06:30 → GVA 09:20');
  assert.equal(f.title, 'Flight to Geneva');
  assert.equal(f.tz, null, 'no zone of its own');
  const [c] = await spotted('easyjet-cancelled.eml');
  assert.equal(c.id, f.id);
  assert.equal(c.status, 'cancelled');
  assert.equal(c.start, null);
});

test('mail with no booking, and broken JSON-LD: nothing (and nothing thrown); JSON-LD that isn’t a reservation: nothing', { skip }, async () => {
  assert.deepEqual(await spotted('plain.eml'), []);
  const bad = await spotted('malformed.eml');
  assert.ok(bad.every((b) => b.start == null && b.status === 'confirmed'), 'one without a time it can read is never kept (keepBookings)');
  const { spotEmail, jsonLd, microdata } = await load('src/spot.js');
  for (const html of ['<script type="application/ld+json">{</script>', '<script type="application/ld+json"></script>', '<div itemscope><span itemprop="x">', '<<<>>>', '<script type=application/ld+json>[null, 1, "x", {"@type": ["Thing", "FlightReservation"], "reservationFor": [null]}]</script>'])
    assert.ok(Array.isArray(await spotEmail({ html })), html);
  assert.deepEqual(jsonLd('<script type="application/ld+json"><!-- {"a": 1,} --></script>'), [{ a: 1 }], 'an HTML comment and a trailing comma forgiven');
  assert.deepEqual(jsonLd('<script type="application/ld+json">{&quot;a&quot;: 2}</script>'), [{ a: 2 }], 'escaped quotes forgiven');
  assert.equal(microdata('<p itemscope itemtype="https://schema.org/Thing"><b itemprop="name">A &amp; B</b></p>')[0].name, 'A & B');
});

test('strings are plain and bounded; ids are [A-Za-z0-9_-], 64 at most', { skip }, async () => {
  const { spotEmail } = await load('src/spot.js');
  const long = 'X'.repeat(300);
  const html = `<script type="application/ld+json">${JSON.stringify({ '@type': 'EventReservation', reservationNumber: `<b>${'R'.repeat(60)}</b>`, reservationFor: { '@type': 'Event', name: `<b onclick="x()">Gig</b> &amp; ${long}`, startDate: `${iso(2)}T19:00:00Z`, location: { '@type': 'Place', name: `Hall\n\t${long}` } } })}</script>`;
  const [e] = await spotEmail({ html });
  assert.ok(e.title.length <= 80 && e.sub.length <= 120 && e.place.name.length <= 60 && e.ref.length <= 24);
  assert.doesNotMatch(JSON.stringify(e), /<|>|\\n|\\t/);
  assert.match(e.id, /^[A-Za-z0-9_-]{1,64}$/);
});

test('trips: an outbound leg to the way back, the hotel and what’s there between; a connection; a hotel stay alone; somewhere else stays out', { skip }, async () => {
  const { tripsOf } = await load('src/spot.js');
  const t0 = Date.UTC(2030, 5, 1, 8);
  const r = (id, kind, s, e, x = {}) => ({ id, kind, start_at: t0 + s * H, end_at: e == null ? null : t0 + e * H, status: 'confirmed', hidden: 0, ...x });
  const rows = [
    r('out1', 'flight', 0, 2, { from_place: 'BRS', to_place: 'AMS', from_city: 'Bristol', city: 'Amsterdam' }),
    r('out2', 'flight', 3, 5, { from_place: 'AMS', to_place: 'OPO', from_city: 'Amsterdam', city: 'Porto', dest_lat: 41.2, dest_lon: -8.6 }),
    r('hotel', 'hotel', 7, 76, { city: 'Porto', lat: 41.14, lon: -8.61, place: 'Casa' }),
    r('dinner', 'restaurant', 12, null, { city: 'Porto' }),
    r('elsewhere', 'restaurant', 14, null, { city: 'Bristol' }),
    r('walk', 'booking', 30, 32, { city: null }),
    r('back', 'flight', 74, 77, { from_place: 'OPO', to_place: 'BRS', from_city: 'Porto', city: 'Bristol' }),
    r('gone', 'event', 40, null, { city: 'Porto', status: 'cancelled' }),
    r('stay', 'hotel', 500, 548, { city: 'York', place: 'The Grand' }),
    r('york-show', 'event', 510, null, { city: 'York' }),
  ];
  const trips = tripsOf(rows);
  assert.equal(trips.length, 2);
  const [porto, york] = trips;
  assert.equal(porto.name, 'Porto', 'named for where the connection lands');
  assert.equal(porto.id, 'trip-out1');
  assert.deepEqual(porto.items, ['out1', 'out2', 'hotel', 'dinner', 'walk', 'back']);
  assert.equal(porto.start, t0);
  assert.equal(porto.end, t0 + 77 * H);
  assert.deepEqual(porto.destination, { name: 'Porto', lat: 41.14, lon: -8.61 }, 'the hotel’s place, over the airport’s');
  assert.equal(york.name, 'York');
  assert.deepEqual(york.items, ['stay', 'york-show']);
  // (a one-way flight with nothing after it: a trip of that leg)
  assert.deepEqual(tripsOf([r('ow', 'train', 0, 3, { from_place: 'London Paddington', to_place: 'Penzance', city: 'Penzance' })]).map((t) => [t.name, t.items.length]), [['Penzance', 1]]);
  // (a restaurant alone, or a hidden leg: no trip)
  assert.equal(tripsOf([r('x', 'restaurant', 0, null), r('y', 'flight', 1, 2, { hidden: 1 })]).length, 0);
});

// =====================================================================================================================
// Through Mail's Worker
// =====================================================================================================================
test('the switch off (as it starts): mail is kept and nothing is read from it; the card has neither ahead nor trips; Settings says so', { skip }, async () => {
  const { ensureSchema } = await load('src/db.js');
  await ensureSchema(env);
  await deliver(fixture('tap-return.eml'), 'bookings@flytap.com');
  assert.equal(sql.prepare(`SELECT COUNT(*) AS n FROM messages WHERE message_id = 'k7qx2m-1@flytap.com'`).get().n, 1, 'kept');
  assert.equal(spots().length, 0, 'not read');
  const c = await card();
  assert.equal(c.status, 200);
  assert.deepEqual(Object.keys(c.data).sort(), ['later', 'people', 'updates'], 'absent, not empty');
  const s = await ask('/api/settings');
  assert.equal(s.status, 200);
  assert.deepEqual(s.data.spot, { trips: false, parcels: false, bills: false, reading: false });
  assert.ok(Array.isArray(s.data.addresses), 'and the rest of Settings as it was');
  const t = await ask(`/api/threads/${threadOf('k7qx2m-1@flytap.com')}`);
  assert.equal(t.status, 200);
  assert.ok(!('spots' in t.data), 'no strip');
});

test('turned on: the last 60 days read back (a few at a time), oldest first; what’s over, what’s older than 60 days and mail sent aren’t read', { skip }, async () => {
  // (older than 60 days: not read back)
  await deliver(fixture('restaurant-microdata.eml', { mailDate: new Date(Date.now() - 70 * DAY), messageId: 'ot-old@opentable.com' }), 'no-reply@opentable.com');
  sql.prepare(`UPDATE messages SET date = ? WHERE message_id = 'ot-old@opentable.com'`).run(Date.now() - 70 * DAY);
  // (a booking that's over)
  const past = fixture('easyjet.eml', { messageId: 'past@easyjet.com' }).replace(/"reservationNumber": "EJX4421"/, '"reservationNumber": "EJOLD1"').replace(new RegExp(iso(9), 'g'), iso(-3));
  await deliver(past, 'noreply@easyjet.com');
  const bad = await ask('/api/settings', { method: 'PATCH', body: { spot: { trips: 'yes' } } });
  assert.equal(bad.status, 400);
  // (not waited on by the switch's answer: the read-back runs after it, ctx.waitUntil; settled here)
  const on = await ask('/api/settings', { method: 'PATCH', body: { spot: { trips: true, tz: 'Europe/London' } } });
  assert.equal(on.status, 200);
  assert.equal(on.data.spot.trips, true);
  assert.equal(sql.prepare(`SELECT v FROM meta WHERE k = 'spot_trips'`).get().v, '1', 'kept in Mail’s meta');
  assert.equal(sql.prepare(`SELECT v FROM meta WHERE k = 'spot_tz'`).get().v, 'Europe/London');
  const got = spots();
  assert.deepEqual(got.map((s) => s.title), ['Flight to Lisbon', 'Flight to London'], 'TAP’s two legs, read back; the old table and the past flight not');
  assert.ok(got.every((s) => s.source === 'schema' && s.status === 'confirmed' && s.thread_id === threadOf('k7qx2m-1@flytap.com') && s.sender === 'bookings@flytap.com'));
  assert.equal(sql.prepare(`SELECT COUNT(*) AS n FROM meta WHERE k = 'spot_back'`).get().n, 0, 'done: nothing left to read back');
  assert.deepEqual((await ask('/api/settings')).data.spot, { trips: true, parcels: false, bills: false, reading: false });
  // (a few at a time: a read-back left part-way goes on from where it was)
  const { readBack } = await load('src/spot.js');
  sql.prepare(`INSERT INTO meta (k, v) VALUES ('spot_back', ?)`).run(JSON.stringify({ from: Date.now() - 60 * DAY, until: Date.now(), at: 0, id: '' }));
  assert.equal(await readBack(env, { batch: 1, budgetMs: 0 }), true, 'more to read');
  assert.ok(JSON.parse(sql.prepare(`SELECT v FROM meta WHERE k = 'spot_back'`).get().v).at > 0, 'where it got to, kept');
  assert.equal((await ask('/api/settings')).data.spot.reading, true, 'Settings says it’s reading');
  while (await readBack(env, { batch: 2 }));
  assert.equal(spots().length, 2, 'read again: the same two rows');
});

test('on: mail as it comes is read; one row a leg; a trip; Today’s card gains ahead and trips, bounded and plain', { skip }, async () => {
  for (const [f, from] of [['hotel.eml', 'reservations@memmohotels.com'], ['restaurant-microdata.eml', 'no-reply@opentable.com'], ['invite-tzid.eml', 'hello@lisbonfoodtours.pt'], ['easyjet.eml', 'noreply@easyjet.com'], ['plain.eml', 'rowan@example.com'], ['malformed.eml', 'bookings@some-airline.example']])
    await deliver(fixture(f), from);
  assert.deepEqual(spots().map((s) => s.kind), ['flight', 'hotel', 'restaurant', 'booking', 'flight', 'flight']);
  const c = await card();
  assert.equal(c.status, 200);
  assert.deepEqual(Object.keys(c.data).sort(), ['ahead', 'later', 'people', 'trips', 'updates']);
  const { ahead, trips } = c.data;
  assert.equal(ahead.length, 6);
  assert.deepEqual(ahead.map((a) => a.title), ['Flight to Lisbon', 'Memmo Alfama', 'Table at Taberna da Rua das Flores', 'Alfama food walk', 'Flight to London', 'Flight to Geneva'], 'soonest first');
  for (const a of ahead) {
    assert.deepEqual(Object.keys(a).sort(), ['end', 'id', 'kind', 'place', 'ref', 'start', 'status', 'sub', 'thread', 'title', 'trip', 'tz']);
    assert.match(a.id, /^[A-Za-z0-9_-]{1,64}$/);
    assert.ok(a.title.length <= 80 && a.sub.length <= 120 && (!a.ref || a.ref.length <= 24));
    assert.ok(Number.isInteger(a.start) && (a.end === null || Number.isInteger(a.end)));
    assert.ok(a.place === null || (a.place.name.length <= 60 && (a.place.lat === undefined || typeof a.place.lat === 'number')));
    assert.equal(a.status, 'confirmed');
    assert.equal(typeof a.thread, 'string');
  }
  assert.equal(trips.length, 2);
  const [lis, gva] = trips;
  assert.deepEqual(Object.keys(lis).sort(), ['destination', 'end', 'hidden', 'id', 'items', 'name', 'start']);
  assert.deepEqual(lis.hidden, [], 'nothing of it taken off');
  assert.equal(lis.name, 'Lisbon');
  assert.deepEqual(lis.destination, { name: 'Lisbon', lat: 38.7114, lon: -9.1302 });
  assert.equal(lis.start, Date.parse(`${iso(1)}T07:40:00Z`));
  assert.equal(lis.end, Date.parse(`${iso(4)}T20:40:00Z`));
  assert.deepEqual(lis.items, ahead.slice(0, 5).map((a) => a.id));
  assert.ok(ahead.slice(0, 5).every((a) => a.trip === lis.id));
  assert.equal(gva.name, 'Geneva');
  assert.equal(ahead[5].trip, gva.id);
  assert.equal(ahead[5].tz, null);
  assert.equal(ahead[3].tz, 'Europe/Lisbon');
  assert.deepEqual(ahead[1].place, { name: 'Memmo Alfama', lat: 38.7114, lon: -9.1302 });
  assert.doesNotMatch(JSON.stringify(c.data), /Rowan|river|George|underName|<|>/, 'nothing else of the mail');
});

test('a changed time updates the leg (same id, no new row); an older email after it never undoes it; a cancellation takes it off', { skip }, async () => {
  const before = spots();
  const backId = before.find((s) => s.title === 'Flight to London').id;
  await deliver(fixture('tap-changed.eml'), 'bookings@flytap.com');
  let after = spots();
  assert.equal(after.length, before.length, 'no new row');
  const back = after.find((s) => s.id === backId);
  assert.equal(back.start_at, Date.parse(`${iso(4)}T19:35:00Z`));
  assert.equal(back.sub, 'TP1366 · LIS 19:35 → LHR 22:10');
  // (the first confirmation, delivered again later but dated before the change)
  await deliver(fixture('tap-return.eml', { mailDate: new Date(Date.now() - 2 * DAY), messageId: 'k7qx2m-again@flytap.com' }), 'bookings@flytap.com');
  assert.equal(spots().find((s) => s.id === backId).start_at, Date.parse(`${iso(4)}T19:35:00Z`), 'still the new time');
  const lis = (await card()).data.trips[0];
  assert.equal(lis.end, Date.parse(`${iso(4)}T22:10:00Z`), 'the trip ends with the new time');
  // (cancelled, by an email with no times at all)
  const gvaId = spots().find((s) => s.title === 'Flight to Geneva').id;
  await deliver(fixture('easyjet-cancelled.eml'), 'noreply@easyjet.com');
  after = spots();
  assert.equal(after.find((s) => s.id === gvaId).status, 'cancelled');
  const c = (await card()).data;
  assert.ok(!c.ahead.some((a) => a.id === gvaId), 'off ahead');
  assert.deepEqual(c.trips.map((t) => t.name), ['Lisbon'], 'and its trip with it');
  // (an invite cancelled: METHOD:CANCEL, the same UID)
  const walk = after.find((s) => s.source === 'ics');
  await deliver(fixture('invite-tzid.eml', { messageId: 'lft-cancel@lisbonfoodtours.pt' }).replace('METHOD:REQUEST', 'METHOD:CANCEL').replace('method=REQUEST', 'method=CANCEL'), 'hello@lisbonfoodtours.pt');
  assert.equal(spots().find((s) => s.id === walk.id).status, 'cancelled');
  // (and put on again by a new invite, newer still)
  await deliver(fixture('invite-tzid.eml', { messageId: 'lft-again@lisbonfoodtours.pt' }), 'hello@lisbonfoodtours.pt');
  assert.equal(spots().find((s) => s.id === walk.id).status, 'confirmed');
});

test('Today’s Hide (POST /api/connector/hide): the shared key alone, { id } → 204, gone from ahead; no key, a wrong key, a bad id, an unknown one: refused', { skip }, async () => {
  const id = (await card()).data.ahead.find((a) => a.kind === 'restaurant').id;
  assert.equal((await hide({ id }, null)).status, 401);
  assert.equal((await hide({ id }, 'wrong')).status, 401);
  assert.equal((await hide({ id }, `${KEY}x`)).status, 401);
  assert.equal((await ask('/api/connector/hide', { method: 'POST', body: { id } })).status, 401, 'a sign-in is no key');
  assert.equal(spots().find((s) => s.id === id).hidden, 0, 'none of those hid it');
  assert.equal((await hide({ id: 'a b' })).status, 400);
  assert.equal((await hide({ id: 'x'.repeat(65) })).status, 400);
  assert.equal((await hide('not json')).status, 400);
  assert.equal((await hide({ id: 'restaurant-nothing' })).status, 404);
  const r = await hide({ id });
  assert.equal(r.status, 204);
  assert.equal(r.text, '');
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal((await hide({ id })).status, 204, 'again: still 204');
  const c = (await card()).data;
  assert.ok(!c.ahead.some((a) => a.id === id));
  assert.ok(!c.trips[0].items.includes(id));
  // (Put It Back, from Mail's strip, for the next test)
  assert.equal((await ask(`/api/spots/${id}`, { method: 'POST', body: { hidden: false } })).status, 200);
});

test('the strip: a conversation’s bookings (with their trip and how it knows); Remove, Put It Back, Wrong (and that sender’s kind not read again)', { skip }, async () => {
  const tid = threadOf('k7qx2m-1@flytap.com');
  const t = await ask(`/api/threads/${tid}`);
  assert.equal(t.status, 200);
  assert.equal(t.data.spots.length, 2);
  const [out] = t.data.spots;
  assert.equal(out.title, 'Flight to Lisbon');
  assert.deepEqual(out.facts, [['From', 'LHR T2 07:40'], ['To', 'LIS 10:15']]);
  assert.equal(out.sender, 'TAP Air Portugal');
  assert.equal(out.source, 'schema');
  assert.equal(out.hidden, false);
  assert.equal(out.trip.name, 'Lisbon');
  assert.equal(out.ref, 'K7QX2M');
  assert.ok(t.data.messages.length >= 1, 'the conversation as it was');
  // (Remove, and Put It Back)
  let r = await ask(`/api/spots/${out.id}`, { method: 'POST', body: { hidden: true } });
  assert.equal(r.status, 200);
  assert.equal(r.data.spots.find((s) => s.id === out.id).hidden, true);
  assert.ok(!(await card()).data.ahead.some((a) => a.id === out.id), 'off Today');
  r = await ask(`/api/spots/${out.id}`, { method: 'POST', body: { hidden: false } });
  assert.equal(r.data.spots.find((s) => s.id === out.id).hidden, false);
  assert.ok((await card()).data.ahead.some((a) => a.id === out.id), 'back on Today');
  assert.equal((await ask(`/api/spots/${out.id}`, { method: 'POST', body: {} })).status, 400);
  assert.equal((await ask('/api/spots/flight-none', { method: 'POST', body: { hidden: true } })).status, 404);
  assert.equal((await ask(`/api/spots/${out.id}`, { method: 'POST', body: { hidden: true }, headers: { 'X-Inflite': '' } })).status, 403, 'a change carries Mail’s header');
  // (Wrong: the table's sender's tables aren't read again)
  const table = spots().find((s) => s.kind === 'restaurant');
  r = await ask(`/api/spots/${table.id}`, { method: 'POST', body: { wrong: true } });
  assert.equal(r.status, 200);
  assert.deepEqual(sql.prepare('SELECT sender, kind FROM spot_wrong').all().map((x) => ({ ...x })), [{ sender: 'no-reply@opentable.com', kind: 'restaurant' }]);
  assert.equal(spots().find((s) => s.id === table.id).hidden, 1);
  const n = spots().length;
  await deliver(fixture('restaurant-microdata.eml', { messageId: 'ot-2@opentable.com' }).replace(/OT55120/g, 'OT77777'), 'no-reply@opentable.com');
  assert.equal(spots().length, n, 'another table from them: not read');
  // (put back: read again)
  await ask(`/api/spots/${table.id}`, { method: 'POST', body: { hidden: false } });
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM spot_wrong').get().n, 0);
  await deliver(fixture('restaurant-microdata.eml', { messageId: 'ot-3@opentable.com' }).replace(/OT55120/g, 'OT88888'), 'no-reply@opentable.com');
  assert.equal(spots().length, n + 1);
});

test('a failure to spot never stops mail being kept (and mail whose DMARC failed isn’t read)', { skip }, async () => {
  breakSpots = true;
  const said = await quietly(() => deliver(fixture('hotel.eml', { messageId: 'mm-broken@memmohotels.com' }).replace(/88213/g, '99999'), 'reservations@memmohotels.com'));
  breakSpots = false;
  assert.equal(sql.prepare(`SELECT COUNT(*) AS n FROM messages WHERE message_id = 'mm-broken@memmohotels.com'`).get().n, 1, 'kept');
  assert.ok(said.some((s) => /spot/.test(s)), 'and the failure said in the log');
  assert.ok(r2.has(`body/${sql.prepare(`SELECT id FROM messages WHERE message_id = 'mm-broken@memmohotels.com'`).get().id}.json`), 'its body too');
  assert.equal(sql.prepare(`SELECT COUNT(*) AS n FROM spots WHERE ref = '99999'`).get().n, 0);
  const spoofed = fixture('hotel.eml', { messageId: 'mm-spoof@memmohotels.com' }).replace(/88213/g, '12345').replace('MIME-Version: 1.0', 'Authentication-Results: mx.cloudflare.net; dmarc=fail header.from=memmohotels.com\r\nMIME-Version: 1.0');
  await deliver(spoofed, 'reservations@memmohotels.com');
  assert.equal(sql.prepare(`SELECT COUNT(*) AS n FROM spots WHERE ref = '12345'`).get().n, 0, 'DMARC failed: not read');
});

test('turned off: what was spotted goes (what was taken off stays taken off), the card has neither field, the strip’s gone', { skip }, async () => {
  const hiddenId = spots().find((s) => s.kind === 'restaurant' && s.ref === 'OT55120').id;
  await ask(`/api/spots/${hiddenId}`, { method: 'POST', body: { hidden: true } });
  const off = await ask('/api/settings', { method: 'PATCH', body: { spot: { trips: false } } });
  assert.equal(off.status, 200);
  assert.deepEqual(off.data.spot, { trips: false, parcels: false, bills: false, reading: false });
  assert.deepEqual(spots().map((s) => s.id), [hiddenId], 'only what was taken off');
  assert.deepEqual(Object.keys((await card()).data).sort(), ['later', 'people', 'updates']);
  assert.ok(!('spots' in (await ask(`/api/threads/${threadOf('k7qx2m-1@flytap.com')}`)).data));
  await deliver(fixture('hotel.eml', { messageId: 'mm-off@memmohotels.com' }).replace(/88213/g, '55555'), 'reservations@memmohotels.com');
  assert.equal(sql.prepare(`SELECT COUNT(*) AS n FROM spots WHERE ref = '55555'`).get().n, 0, 'nothing read while it’s off');
  // (on again: read back, and what was taken off is still off)
  await ask('/api/settings', { method: 'PATCH', body: { spot: { trips: true } } });
  assert.ok(spots().length > 3);
  assert.equal(spots().find((s) => s.id === hiddenId).hidden, 1);
});
