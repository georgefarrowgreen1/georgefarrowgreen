// Today's acts and rules on the real stack (Today First, spec §7.5, §14.3), straight against the API as Today's server
// asks it (Today's page at ifl.test, the account at account.ifl.test): each account's day planned by the site's
// scheduler just before its morning notification (functions/_todaymorning.js, functions/_todayacts.js planDay). A ride
// set for the afternoon that runs into a call agreed in Chat: moved at do (the push says so, and Undo puts it back and
// drops the rule to suggest), offered at suggest (Take moves it; an Undo after the ride's been changed by hand says
// nothing was undone), the line alone at quiet; the rules' records through GET today/rules; and a habit from eight
// seeded weeks of rides (fx_acts, and the forecast stand-in's past days dry) adding Today's own ride (fx_offers role
// "today", taken 0), kept with Keep. The account's zone chosen so that it's 08:00 there now (spec §14.4, layer 3), so
// the day has the afternoon's ride and a morning to move it to; the forecast stand-in's week where you ride is light
// from 06:00 to 20:00 there, and dry.
import http from 'http';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { randomBytes } from 'crypto';
import { acctCall } from './handback.mjs';
import * as F from './mocks/wxappdata.mjs';
const [,, S] = process.argv;
const ACCT = 'account.ifl.test:8788', TODAY = 'http://ifl.test:8788';
let fails = 0; const ok = (c, l, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x !== '' ? ' — ' + x : ''}`); if (!c) fails++; };
const sql0 = (q) => execSync(`${S}/wr/node_modules/.bin/wrangler d1 execute bio-db --local --persist-to ${S}/wrstate --command "${q.replace(/"/g, '\\"')}"`, { cwd: process.env.APP_ROOT, stdio: 'pipe' }).toString();
const sql = (q) => { for (let i = 0; ; i++) { try { return sql0(q); } catch (e) { if (i > 5 || !/SQLITE_BUSY/.test(String(e.stdout) + String(e.stderr) + e.message)) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400); } } };
const rows = (q) => { const o = sql(q), m = o.match(/"results": (\[[\s\S]*?\])\s*,\s*"success"/); return m ? JSON.parse(m[1]) : []; };
const esc = (s) => String(s).replace(/'/g, "''");
const b64u = (u) => Buffer.from(u).toString('base64url'), rnd = (n) => crypto.getRandomValues(new Uint8Array(n));
const MIN = 60e3, H = 3600e3, DAY = 24 * H;

// ---- where the accounts are: a fixed-offset zone where it's 08:00 now (Etc/GMT-5 is UTC+5) ----
const zoneAt = (hh, t = Date.now()) => { const off = ((hh - new Date(t).getUTCHours() + 36) % 24) - 12; return { tz: off === 0 ? 'Etc/GMT' : `Etc/GMT${off > 0 ? '-' : '+'}${Math.abs(off)}`, off }; };
const { tz: TZ, off: OFF } = zoneAt(8);
const t0 = Date.now(), local = (t) => new Date(t + OFF * H), dayOf = (t) => local(t).toISOString().slice(0, 10);
const TODAY_DAY = dayOf(t0), mins = local(t0).getUTCHours() * 60 + local(t0).getUTCMinutes();
// (a wall time there → ms; and back, "14:30")
const at = (day, hh, mm = 0) => { const [y, m, d] = day.split('-').map(Number); return Date.UTC(y, m - 1, d, hh, mm) - OFF * H; };
const hhmm = (t) => local(t).toISOString().slice(11, 16);
const dayAfter = (day, n) => { const [y, m, d] = day.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const weekday = (day) => new Date(`${day}T00:00:00Z`).getUTCDay();
console.log(`zone ${TZ}: ${TODAY_DAY} ${hhmm(t0)} there`);

// ---- the stand-in for Open-Meteo: a ride's week where you ride (Fitness's hoursAt: light 06:00 to 20:00 there, dry),
// the past days (dry: the habit's weeks all count), and everything else as the tests' usual forecast ----
const RIDE_HOURS = 'temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,is_day';
const forecasts = [];
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), send = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/v1/forecast') {
    const past = Number(u.searchParams.get('past_days') || 0), unix = u.searchParams.get('timeformat') === 'unixtime';
    forecasts.push({ hourly: u.searchParams.get('hourly'), past });
    // (the habit's past days, functions/_fitwx.js pastWet: past_days=56, hourly precipitation and weather codes; Weather's
    // own asks for a day or two back, with much more, and gets the usual forecast)
    if ((past >= 28 && u.searchParams.get('hourly') === 'precipitation,weather_code') || u.searchParams.get('hourly') === RIDE_HOURS) {
      const from = Math.floor((t0 - past * DAY) / DAY) * DAY - OFF * H, n = (past + 8) * 24, time = [], cols = {};
      for (let i = 0; i < n; i++) time.push(from + i * H);
      const lh = (t) => local(t).getUTCHours(), col = (f) => time.map(f);
      Object.assign(cols, { temperature_2m: col(() => 14), apparent_temperature: col(() => 13), precipitation_probability: col(() => 5), precipitation: col(() => 0), weather_code: col(() => 2),
        wind_speed_10m: col(() => 10), wind_gusts_10m: col(() => 20), wind_direction_10m: col(() => 250), is_day: col((t) => (lh(t) >= 6 && lh(t) < 20 ? 1 : 0)) });
      const want = (u.searchParams.get('hourly') || '').split(',');
      return send({ utc_offset_seconds: OFF * 3600, timezone: TZ, hourly: { time: time.map((t) => (unix ? t / 1000 : new Date(t).toISOString().slice(0, 16))), ...Object.fromEntries(want.filter((k) => cols[k]).map((k) => [k, cols[k]])) } });
    }
    const n = (u.searchParams.get('latitude') || '').split(',').length, one = F.forecast(Date.now());
    if (unix) one.hourly = { ...one.hourly, time: one.hourly.time.map((s) => Date.parse(s + 'Z') / 1000) };
    return send(n > 1 ? Array(n).fill(one) : one);
  }
  if (u.pathname.startsWith('/api/v1/warnings/feeds-')) return send({ warnings: [] });
  if (u.pathname === '/flood-monitoring/id/floods') return send({ items: [] });
  if (u.pathname === '/api/data/stationinfo') return send([]);
  res.writeHead(404); res.end();
}).listen(8794, '127.0.0.1');

// (a request to the account's address as Today's server makes it: the account's cookie, and Today's own Origin)
function today(method, path, { cookie, body, origin = TODAY } = {}) {
  const data = body ? JSON.stringify(body) : '';
  return new Promise((done, no) => {
    const q = http.request({ host: '127.0.0.1', port: 8788, path: '/api/account/today/' + path, method, agent: false, headers: { Host: ACCT, Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}), ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) } }, (res) => {
      const parts = []; res.on('data', (c) => parts.push(c));
      res.on('end', () => { let j = {}; try { j = JSON.parse(Buffer.concat(parts).toString()); } catch (_) {} done({ s: res.statusCode, j }); });
    });
    q.on('error', no); q.end(data);
  });
}
const tick = () => new Promise((done, no) => {
  const q = http.request({ host: '127.0.0.1', port: 8788, path: '/api/today/tick', method: 'POST', agent: false, headers: { Host: 'localhost', Authorization: 'Bearer tick-test-secret' } }, (res) => {
    let t = ''; res.on('data', (x) => (t += x)); res.on('end', () => { let j = {}; try { j = JSON.parse(t); } catch (_) {} done({ s: res.statusCode, j }); });
  });
  q.on('error', no); q.end();
});
let ips = 30;
async function signup(name, handle) {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']), pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const r = await acctCall('signup', { name, handle, email: `${handle}@example.com`, salt: b64u(rnd(16)), proof: b64u(rnd(32)), vault: 'x'.repeat(40), pub: { kty: 'EC', crv: 'P-256', x: pub.x, y: pub.y } }, { ip: '10.0.9.' + (ips++) });
  if (r.s !== 201 || !r.cookie) throw new Error(`signup ${handle}: ${r.s} ${JSON.stringify(r.j)}`);
  return { cookie: r.cookie, id: rows(`SELECT id FROM pg_users WHERE handle = '${handle}'`)[0].id, name };
}

// ---- a phone with push keys this test holds, and the pushes sent to it, opened ----
const wc = crypto.subtle, te = new TextEncoder();
async function phone(name) {
  const kp = await wc.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']), auth = rnd(16), pub = new Uint8Array(await wc.exportKey('raw', kp.publicKey));
  return { kp, pub, auth, sub: { endpoint: `https://fcm.googleapis.com/fcm/send/today-rules-${name}-${randomBytes(6).toString('hex')}`, keys: { p256dh: b64u(pub), auth: b64u(auth) } } };
}
const hkdf = async (salt, ikm, info, len) => new Uint8Array(await wc.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, await wc.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), len * 8));
async function opened(ph, body) {
  const buf = new Uint8Array(Buffer.from(body, 'base64')), salt = buf.slice(0, 16), n = buf[20], asPub = buf.slice(21, 21 + n), ct = buf.slice(21 + n);
  const shared = new Uint8Array(await wc.deriveBits({ name: 'ECDH', public: await wc.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []) }, ph.kp.privateKey, 256));
  const ikm = await hkdf(ph.auth, shared, new Uint8Array([...te.encode('WebPush: info\0'), ...ph.pub, ...asPub]), 32);
  const key = await wc.importKey('raw', await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16), 'AES-GCM', false, ['decrypt']);
  const pt = new Uint8Array(await wc.decrypt({ name: 'AES-GCM', iv: await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12) }, key, ct));
  let end = pt.length - 1; while (end > 0 && pt[end] === 0) end--;
  return JSON.parse(new TextDecoder().decode(pt.slice(0, end)));
}
const box = () => readFileSync(`${S}/pushbox.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const to = (endpoint, since = 0) => box().filter((p) => p.at > since && p.headers['x-endpoint'] === endpoint);

// ---- 1. Four accounts: their place, a phone each, the morning on at this minute ----
const HOME = { name: 'London', lat: 51.5072, lon: -0.1276 };
const alex = await signup('Alex Rule', 'alexrule'), bea = await signup('Bea Rule', 'bearule'), cat = await signup('Cat Rule', 'catrule'), dan = await signup('Dan Rule', 'danrule'), mira = await signup('Mira Call', 'miracall');
const people = [alex, bea, cat, dan];
let r = await today('GET', 'cards', { cookie: alex.cookie });
ok(r.s === 200, 'Today’s cards, so each app’s tables are made', `${r.s}`);
for (const p of people) {
  sql(`INSERT OR REPLACE INTO wx_accts (user_id, data, ver, updated) VALUES ('${p.id}', '${esc(JSON.stringify({ places: [HOME], settings: {}, notify: {} }))}', 1, ${t0})`);
  p.ph = await phone(p.name.split(' ')[0].toLowerCase());
  r = await today('POST', 'push', { cookie: p.cookie, body: { sub: p.ph.sub } });
  ok(r.s === 200, `${p.name}: the phone kept`, `${r.s} ${JSON.stringify(r.j)}`);
  r = await today('PUT', 'morning', { cookie: p.cookie, body: { on: true, at: Math.floor(mins / 5) * 5, tz: TZ, lines: { weather: true, fitness: true, chat: true, markets: true } } });
  ok(r.s === 200 && r.j.on === true && r.j.tz === TZ, `${p.name}: the morning on, at ${hhmm(t0)} in ${TZ}`, `${r.s} ${JSON.stringify(r.j).slice(0, 160)}`);
}
// (Bea's clash rule at suggest, Cat's at quiet, set by hand in You)
r = await today('PUT', 'rules', { cookie: bea.cookie, body: { rule: 'moveRide', level: 'suggest' } });
ok(r.s === 200 && r.j.level === 'suggest' && r.j.setBy === 'you', 'Bea: moving a ride set to Suggest', JSON.stringify(r.j));
r = await today('PUT', 'rules', { cookie: cat.cookie, body: { rule: 'moveRide', level: 'quiet' } });
ok(r.s === 200 && r.j.level === 'quiet', 'Cat: set to Quiet', JSON.stringify(r.j));
r = await today('PUT', 'rules', { cookie: cat.cookie, body: { rule: 'later', level: 'do' } });
ok(r.s === 400, 'a rule still to come can’t be set', `${r.s} ${JSON.stringify(r.j)}`);

// ---- 2. A ride at 14:00 (Ride At: fx_times) and a call with Mira at 14:30 agreed in Chat (td_times, yes) ----
// (the two tables as their modules make them on first use, functions/_fittimes.js and functions/_times.js: Ride At and
// the Yes to a call are other batches' routes, so their rows are put in here)
sql(`CREATE TABLE IF NOT EXISTS fx_times (user_id TEXT NOT NULL, day TEXT NOT NULL, start INTEGER NOT NULL, stop INTEGER NOT NULL, tz TEXT NOT NULL,
  sport TEXT NOT NULL DEFAULT 'ride', source TEXT NOT NULL, made INTEGER NOT NULL, PRIMARY KEY (user_id, day));
  CREATE TABLE IF NOT EXISTS td_times (user_id TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL, start INTEGER NOT NULL, stop INTEGER NOT NULL,
  tz TEXT NOT NULL, with_id TEXT NOT NULL, who TEXT NOT NULL, role TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'yes', opts TEXT,
  made INTEGER NOT NULL, until INTEGER NOT NULL, PRIMARY KEY (user_id, id))`);
const RIDE = { start: at(TODAY_DAY, 14), stop: at(TODAY_DAY, 15, 15) }, CALL = { start: at(TODAY_DAY, 14, 30), stop: at(TODAY_DAY, 15) };
for (const p of [alex, bea, cat]) {
  sql(`INSERT INTO fx_times (user_id, day, start, stop, tz, sport, source, made) VALUES ('${p.id}', '${TODAY_DAY}', ${RIDE.start}, ${RIDE.stop}, '${TZ}', 'ride', 'set', ${t0});
    INSERT INTO td_times (user_id, id, kind, start, stop, tz, with_id, who, role, state, made, until) VALUES ('${p.id}', '${crypto.randomUUID()}', 'call', ${CALL.start}, ${CALL.stop}, '${TZ}', '${mira.id}', 'Mira', 'answered', 'yes', ${t0}, ${CALL.stop + 12 * H})`);
}
// ---- 3. Dan's habit: rides on the weekday two days on, at 10:00 there, on each of the last eight weeks (outdoors), and
// that day a rest day in Fitness's plan ----
const TARGET = dayAfter(TODAY_DAY, 2), WD = WEEKDAYS[weekday(TARGET)];
const weeks = Array.from({ length: 8 }, (_, i) => dayAfter(TARGET, -7 * (i + 1)));
sql(weeks.map((d, i) => `INSERT INTO fx_acts (user_id, id, start, sport, indoor, name, type, size, sum, added) VALUES ('${dan.id}', 'habit-${i}', ${at(d, 10)}, 'ride', 0, '${WD} ride', 'fit', 1, '${esc(JSON.stringify({ secs: 6300 }))}', ${t0})`).join('; '));
sql(`INSERT OR REPLACE INTO fx_today (user_id, tz, units, days, at) VALUES ('${dan.id}', '${TZ}', 'metric', '${esc(JSON.stringify(Object.fromEntries([0, 1, 2, 3].map((n) => [dayAfter(TODAY_DAY, n), n === 2 ? { state: 'rest', why: 'Easy day' } : { state: 'none' }]))))}', ${t0})`);

// ---- 4. The scheduler's turn: each account's day planned, then its morning composed and sent ----
let since = Date.now();
r = await tick();
ok(r.s === 200 && r.j.due === 4 && r.j.sent === 4 && r.j.left === 0, 'the tick: four accounts due, each planned and sent', `${r.s} ${JSON.stringify(r.j)}`);
const actsOf = (p) => rows(`SELECT id, rule, day, target, kind, state, level, said, was, now, undo_until FROM td_acts WHERE user_id = '${p.id}' ORDER BY made, rule`).map((a) => ({ ...a, was: JSON.parse(a.was || 'null'), now: JSON.parse(a.now || 'null') }));
const timeOf = (p) => rows(`SELECT start, stop, source FROM fx_times WHERE user_id = '${p.id}' AND day = '${TODAY_DAY}'`)[0] || null;
const planned = rows(`SELECT user_id FROM td_plans WHERE day = '${TODAY_DAY}'`).map((x) => x.user_id);
ok(people.every((p) => planned.includes(p.id)), 'each one’s day claimed once planned (td_plans)', JSON.stringify(planned));

// at do: moved, and the push says so
const [aAct] = actsOf(alex), aTime = timeOf(alex);
ok(aAct?.rule === 'moveRide' && aAct.state === 'done' && aAct.level === 'do', 'Alex (do): the clash moved, with Undo', JSON.stringify(aAct));
ok(aTime?.source === 'moved' && aTime.stop - aTime.start === RIDE.stop - RIDE.start && aTime.start >= t0 + H && (aTime.stop + 15 * MIN <= CALL.start || aTime.start >= CALL.stop + 15 * MIN),
  `the ride now ${hhmm(aTime?.start)}–${hhmm(aTime?.stop)}: as long, an hour or more off, clear of the call by 15 minutes`, JSON.stringify(aTime));
ok(aAct?.said === `Moved your ride to ${hhmm(aTime?.start)}, clear of Mira’s call`, 'what Today says it did', aAct?.said);
let got = to(alex.ph.sub.endpoint, since), note = got.length ? await opened(alex.ph, got[0].body) : {};
const fitLine = String(note.body || '').split('\n').find((l) => l.includes('Undo on Today')) || '';
ok(fitLine.includes(`Moved your ride to ${hhmm(aTime?.start)} to clear your 14:30 call. Undo on Today.`), 'the morning push says the act (Chat’s names off: no name)', note.body);
ok(!/Mira/.test(JSON.stringify(note)), 'Mira not named on the lock screen');

// at suggest: offered, nothing moved; at quiet: the line alone
const [bAct] = actsOf(bea), [cAct] = actsOf(cat);
ok(bAct?.state === 'offered' && bAct.level === 'suggest' && timeOf(bea)?.start === RIDE.start && timeOf(bea)?.source === 'set', 'Bea (suggest): offered, the ride where it was', JSON.stringify({ bAct, t: timeOf(bea) }));
got = to(bea.ph.sub.endpoint, since); note = got.length ? await opened(bea.ph, got[0].body) : {};
ok(/Your ride at 14:00 runs into your 14:30 call\. Move it to \d\d:\d\d on Today\./.test(note.body || ''), 'its push offers the move', note.body);
ok(cAct?.state === 'said' && cAct.level === 'quiet' && cAct.said === 'Your ride at 14:00 runs into Mira’s call at 14:30' && timeOf(cat)?.start === RIDE.start, 'Cat (quiet): the clash line alone, nothing moved', JSON.stringify(cAct));
got = to(cat.ph.sub.endpoint, since); note = got.length ? await opened(cat.ph, got[0].body) : {};
ok(got.length === 1 && !/Undo on Today|on Today\./.test(note.body || ''), 'its push says nothing of it', note.body);

// the habit: Today's own ride, agreed and holding nothing (taken 0), on the rest day
const dActs = actsOf(dan), dAdd = dActs.find((a) => a.rule === 'addRide');
const dOffer = dAdd ? rows(`SELECT role, state, taken, who, wid, start, stop, secs FROM fx_offers WHERE user_id = '${dan.id}' AND id = '${dAdd.now?.offer}'`)[0] : null;
ok(dAdd?.state === 'done' && dAdd.target === `day:${TARGET}` && dAdd.said === `Added: a ride on ${WD} at 10:00 · Eight of the last eight dry ${WD}s. ${WD}’s dry`, `Dan: a ride from habit added for ${WD} ${TARGET}`, JSON.stringify(dAdd));
ok(dOffer?.role === 'today' && dOffer.state === 'yes' && dOffer.taken === 0 && dOffer.who === '' && dOffer.wid === 'free-ride' && dOffer.start === at(TARGET, 10) && dOffer.stop === at(TARGET, 12),
  'an fx_offers row of Today’s own: role today, yes, taken 0, 10:00–12:00', JSON.stringify(dOffer));
ok(JSON.stringify(dAdd?.was) === JSON.stringify({ planned: 'rest' }), 'it keeps what the day was: a rest day', JSON.stringify(dAdd?.was));
got = to(dan.ph.sub.endpoint, since); note = got.length ? await opened(dan.ph, got[0].body) : {};
ok((note.body || '').includes(`Added a ride on ${WD} at 10:00. Undo on Today.`), 'its push says so', note.body);
ok(forecasts.some((f) => f.hourly === RIDE_HOURS), 'the week where you ride asked for (hoursAt)', JSON.stringify(forecasts.slice(0, 4)));

// ---- 5. Records, Take, Keep, Undo ----
r = await today('GET', 'rules', { cookie: alex.cookie });
const mv = (j) => (j.rules || []).find((x) => x.rule === 'moveRide');
ok(r.s === 200 && mv(r.j)?.level === 'do' && mv(r.j)?.record?.done === 1 && mv(r.j)?.line === 'Moved 1 · kept 0', 'Alex’s record: Moved 1', JSON.stringify(mv(r.j)));
ok(JSON.stringify((r.j.rules || []).map((x) => [x.rule, !!x.soon])) === JSON.stringify([['moveRide', false], ['addRide', false], ['holdRide', false], ['later', true], ['arrange', true]]), 'the rules, and the two to come', JSON.stringify(r.j.rules?.map((x) => x.rule)));
r = await today('POST', 'act/undo', { cookie: bea.cookie, body: { id: aAct.id } });
ok(r.s === 404, 'another account’s act: not found', `${r.s} ${JSON.stringify(r.j)}`);
r = await today('POST', 'act/undo', { cookie: alex.cookie, body: { id: aAct.id }, origin: 'https://evil.example' });
ok(r.s === 403, 'Undo from anywhere but Today: refused', `${r.s}`);
r = await today('POST', 'act/undo', { cookie: alex.cookie, body: { id: aAct.id } });
ok(r.s === 200 && r.j.act?.state === 'undone' && r.j.said === 'Undone. Moves are suggested now, not made' && r.j.rule?.level === 'suggest', 'Alex: Undo, and the rule drops to suggest', `${r.s} ${JSON.stringify(r.j)}`);
ok(JSON.stringify(timeOf(alex)) === JSON.stringify({ start: RIDE.start, stop: RIDE.stop, source: 'set' }), 'the ride back at 14:00, as it was', JSON.stringify(timeOf(alex)));
r = await today('POST', 'act/undo', { cookie: alex.cookie, body: { id: aAct.id } });
ok(r.s === 200 && r.j.said === 'That’s undone already.' && JSON.stringify(timeOf(alex)) === JSON.stringify({ start: RIDE.start, stop: RIDE.stop, source: 'set' }), 'a second Undo: nothing more', JSON.stringify(r.j));
r = await today('GET', 'rules', { cookie: alex.cookie });
ok(mv(r.j)?.level === 'suggest' && mv(r.j)?.setBy === 'auto' && mv(r.j)?.line === 'Moved 1 · kept 0 · undone 1', 'the record: undone 1, the level suggest', JSON.stringify(mv(r.j)));

r = await today('POST', 'act', { cookie: bea.cookie, body: { id: bAct.id } });
const bTime = timeOf(bea);
ok(r.s === 200 && r.j.act?.state === 'taken' && bTime?.source === 'moved' && bTime.start === bAct.now?.start, `Bea: Move It taken, the ride at ${hhmm(bTime?.start)}`, `${r.s} ${JSON.stringify(r.j)} ${JSON.stringify(bTime)}`);
ok(r.j.rule?.line === 'Moved 1 · kept 0', 'her record counts it', JSON.stringify(r.j.rule));
// (then Ride At in Fitness, by hand: the ride at 12:00)
sql(`UPDATE fx_times SET start = ${at(TODAY_DAY, 12)}, stop = ${at(TODAY_DAY, 13, 15)}, source = 'set' WHERE user_id = '${bea.id}' AND day = '${TODAY_DAY}'`);
r = await today('POST', 'act/undo', { cookie: bea.cookie, body: { id: bAct.id } });
ok(r.s === 200 && r.j.said === 'You’ve changed it since, so nothing was undone.' && r.j.act?.state === 'taken', 'Undo after a hand change: nothing undone, and said so', `${r.s} ${JSON.stringify(r.j)}`);
ok(timeOf(bea)?.start === at(TODAY_DAY, 12) && timeOf(bea)?.source === 'set', 'the hand change kept', JSON.stringify(timeOf(bea)));
r = await today('GET', 'rules', { cookie: bea.cookie });
ok(mv(r.j)?.level === 'suggest' && mv(r.j)?.setBy === 'you' && mv(r.j)?.record?.undone === 0, 'and her rule as it was', JSON.stringify(mv(r.j)));

r = await today('POST', 'act', { cookie: dan.cookie, body: { id: dAdd.id } });
const kept = rows(`SELECT state, taken FROM fx_offers WHERE user_id = '${dan.id}' AND id = '${dAdd.now?.offer}'`)[0];
ok(r.s === 200 && r.j.act?.state === 'kept' && kept?.taken === 1 && kept.state === 'yes', 'Dan: Keep, a tap, so the ride’s taken (and counts as one chosen)', `${r.s} ${JSON.stringify(r.j.act)} ${JSON.stringify(kept)}`);
r = await today('GET', 'rules', { cookie: dan.cookie });
const add = (r.j.rules || []).find((x) => x.rule === 'addRide');
ok(add?.line === 'Added 1 · kept 1', 'his record: Added 1 · kept 1', JSON.stringify(add));

// ---- 6. Planned once: a second turn, and Today's own read, act no more ----
since = Date.now();
sql(`UPDATE td_prefs SET m_sent = NULL WHERE user_id = '${cat.id}'`);
r = await tick();
ok(r.s === 200 && actsOf(cat).length === 1 && actsOf(alex).length === 1, 'a second turn the same day: nothing planned again', JSON.stringify(r.j));
r = await today('GET', 'cards?v=2', { cookie: alex.cookie });
ok(r.s === 200 && actsOf(alex).length === 1, 'nor a read of the day', `${r.s}`);
const ex = await new Promise((done) => {
  const data = JSON.stringify({});
  const q = http.request({ host: '127.0.0.1', port: 8788, path: '/api/account/export', method: 'POST', agent: false, headers: { Host: ACCT, Origin: 'http://account.ifl.test:8788', Cookie: dan.cookie, 'Content-Type': 'application/json', 'Content-Length': data.length } }, (res) => {
    const parts = []; res.on('data', (c) => parts.push(c)); res.on('end', () => { let j = {}; try { j = JSON.parse(Buffer.concat(parts).toString()); } catch (_) {} done({ s: res.statusCode, j }); });
  });
  q.end(data);
});
ok(ex.s === 200 && ex.j.today?.acts?.some((a) => a.rule === 'addRide' && a.state === 'kept') && ex.j.today?.planned?.includes(TODAY_DAY), 'Dan’s data has Today’s acts and planned days', `${ex.s} ${JSON.stringify(ex.j.today || {}).slice(0, 200)}`);

console.log(`FAILS ${fails}`);
process.exit(0);
