// InFlite Today's morning notification, as the site's scheduler has it sent (functions/_todaymorning.js, its turn at
// /api/today/tick): an account with Weather, Chat, Fitness and Markets, its morning on at this minute on a phone (a
// subscription made with keys this test holds, so what's sent can be read), gets one notification, its title Weather's
// briefing title and its lines the apps' own; Chat's pigeons counted, not named, until Chat's names preference is on;
// never a letter's words; not sent twice; and while it's on, Weather's morning briefing and Fitness's morning reminder
// aren't pushed to that account (another account's still are). "Show it on this phone" sends one at once, which isn't
// the day's. And what a compose costs the database, a small portfolio's and one of 60 holdings (Markets' most), against
// the tick's own guard (DB_BUDGET, DB_MOST: functions/_todaymorning.js) and D1's 1,000 queries a request.
// Straight against the API, as Today's server asks it (Today's page at ifl.test, the account at account.ifl.test).
import http from 'http';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { createHash, randomBytes } from 'crypto';
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
const TICK_SRC = readFileSync(new URL('../../functions/_todaymorning.js', import.meta.url), 'utf8'), num = (name) => Number(new RegExp(`\\b${name} = (\\d+)`).exec(TICK_SRC)?.[1]);
const PER_TICK = num('PER_TICK'), AT_ONCE = num('AT_ONCE'), DB_BUDGET = num('DB_BUDGET'), DB_MOST = num('DB_MOST');

// the stand-in for Open-Meteo and the weather services (Weather's card, its briefing, and Fitness's ride weather, which
// asks for its hours as unix times)
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), send = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/v1/forecast') {
    const n = (u.searchParams.get('latitude') || '').split(',').length, one = F.forecast(Date.now());
    if (u.searchParams.get('timeformat') === 'unixtime') one.hourly = { ...one.hourly, time: one.hourly.time.map((s) => Date.parse(s + 'Z') / 1000) };
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
// (a scheduler's turn, at the site's own address as the tests have it)
// (Fitness's at its own address, as its scheduler's turn is anywhere but the site's own)
const tick = (path, host = 'localhost') => new Promise((done, no) => {
  const q = http.request({ host: '127.0.0.1', port: 8788, path, method: 'POST', agent: false, headers: { Host: host, Authorization: 'Bearer tick-test-secret' } }, (res) => {
    let t = ''; res.on('data', (x) => (t += x)); res.on('end', () => { let j = {}; try { j = JSON.parse(t); } catch (_) {} done({ s: res.statusCode, j }); });
  });
  q.on('error', no); q.end();
});
async function signup(name, handle) {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']), pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const r = await acctCall('signup', { name, handle, email: `${handle}@example.com`, salt: b64u(rnd(16)), proof: b64u(rnd(32)), vault: 'x'.repeat(40), pub: { kty: 'EC', crv: 'P-256', x: pub.x, y: pub.y } },
    { ip: '10.0.7.' + (handle.length + 20) });
  if (r.s !== 201 || !r.cookie) throw new Error(`signup ${handle}: ${r.s} ${JSON.stringify(r.j)}`);
  const id = rows(`SELECT id FROM pg_users WHERE handle = '${handle}'`)[0].id;
  return { cookie: r.cookie, id, session: rows(`SELECT hash FROM pg_sessions WHERE user_id = '${id}'`)[0].hash };
}

// ---- a phone with push keys this test holds, and the pushes sent to it, opened ----
const wc = crypto.subtle, te = new TextEncoder();
async function phone(name) {
  const kp = await wc.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']), auth = rnd(16), pub = new Uint8Array(await wc.exportKey('raw', kp.publicKey));
  return { kp, pub, auth, sub: { endpoint: `https://fcm.googleapis.com/fcm/send/today-test-${name}-${randomBytes(6).toString('hex')}`, keys: { p256dh: b64u(pub), auth: b64u(auth) } } };
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

// ---- 1. The account, its friends, and each app's part of it ----
const alex = await signup('Alex Morgan', 'alexmorn'), sam = await signup('Sam Lee', 'samlee'), mum = await signup('Mum', 'mummorn');
// (the cards worked out once, so each app's tables are made, as Today's page would have them made)
let r = await today('GET', 'cards?with=morning', { cookie: alex.cookie });
ok(r.s === 200 && r.j.cards && r.j.morning, 'the cards and the Morning section, before anything’s set up', `${r.s} ${JSON.stringify(r.j).slice(0, 200)}`);
const t0 = Date.now(), H = 3600e3, HOME = { name: 'London', lat: 51.5072, lon: -0.1276 };
sql(`INSERT OR REPLACE INTO wx_accts (user_id, data, ver, updated) VALUES ('${alex.id}', '${esc(JSON.stringify({ places: [HOME], settings: {}, notify: {} }))}', 1, ${t0})`);
// two friends' pigeons on their way: Sam's a swift from Paris, Mum's a mystery rocket; each carrying words no one but Alex may read
sql(`INSERT INTO pg_links (a, b, status, created_at) VALUES ('${alex.id}', '${sam.id}', 'ok', ${t0}), ('${mum.id}', '${alex.id}', 'ok', ${t0})`);
sql(`INSERT INTO pg_msgs (id, sender, recipient, ct, km, sent_at, deliver_at, from_place, to_place, swift, pigeon, bird_name, bird_rank) VALUES ('tm-1', '${sam.id}', '${alex.id}', 'SECRET-CT-SAM', 343, ${t0 - H}, ${t0 + 3 * H}, 'Paris', 'London', 1, 'swift', 'Biscuit', 'Navigator')`);
sql(`INSERT INTO pg_msgs (id, sender, recipient, ct, km, sent_at, deliver_at, from_place, to_place, pigeon, mystery, via_note) VALUES ('tm-2', '${mum.id}', '${alex.id}', 'SECRET-CT-MUM', 640, ${t0 - H}, ${t0 + 8 * H}, 'Inverness', 'London', 'rocket', 1, 'SECRET-NOTE')`);
// Fitness's days, as it sent them when last opened (today: a tempo session, in the account's zone)
const ZONES = ['Europe/London', 'America/New_York', 'Asia/Tokyo'];
const wall = (tz, t = Date.now()) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(t).map((x) => [x.type, x.value])); return { day: `${p.year}-${p.month}-${p.day}`, mins: +p.hour * 60 + +p.minute }; };
// (a zone where it's not about to be midnight, so the morning's time is this minute's and stays today's while the test runs)
const TZ = ZONES.find((z) => { const m = wall(z).mins; return m >= 10 && m < 23 * 60 + 30; }), here = wall(TZ);
const session = { state: 'session', id: 'rh:tempo:60', sport: 'ride', name: 'Tempo 2 × 15', kind: 'Tempo', secs: 3600, tss: 62, hard: true, why: 'Fresh after a rest.', steps: [[600, 0.5, 0.75], [900, 0.88, 0.88], [300, 0.55, 0.55], [900, 0.88, 0.88], [900, 0.6, 0.45]] };
sql(`INSERT OR REPLACE INTO fx_today (user_id, tz, units, days, at) VALUES ('${alex.id}', '${TZ}', 'metric', '${esc(JSON.stringify({ [here.day]: session }))}', ${t0})`);
// what Alex owns, in Markets
sql(`INSERT INTO mk_holdings (user_id, symbol, name, qty, added) VALUES ('${alex.id}', 'RR.L', 'Rolls-Royce', 100, ${t0}), ('${alex.id}', 'TSCO.L', 'Tesco', 200, ${t0})`);
r = await today('GET', 'cards', { cookie: alex.cookie });
ok(['weather', 'chat', 'fitness', 'markets'].every((k) => r.j.cards?.[k]?.state === 'ok'), 'all four cards there, each with what it says', JSON.stringify(Object.fromEntries(Object.entries(r.j.cards || {}).map(([k, c]) => [k, c.state]))));

// ---- 2. The morning on, at this minute, on a phone ----
const ph = await phone('alex');
r = await today('POST', 'push', { cookie: alex.cookie, body: { sub: ph.sub } });
ok(r.s === 200 && r.j.devices === 1, 'the phone’s subscription kept', `${r.s} ${JSON.stringify(r.j)}`);
r = await today('PUT', 'morning', { cookie: alex.cookie, body: { on: true, at: Math.floor(here.mins / 5) * 5, tz: TZ, lines: { weather: true, fitness: true, chat: true, markets: true } } });
ok(r.s === 200 && r.j.on === true && r.j.devices === 1, `on, at ${Math.floor(here.mins / 5) * 5} minutes after midnight in ${TZ}`, `${r.s} ${JSON.stringify(r.j).slice(0, 300)}`);
ok(r.j.preview?.kind === 'next' && r.j.preview.lines?.includes('2 pigeons on their way'), 'its preview, composed as it will be sent', JSON.stringify(r.j.preview));
// (its time come today and not yet sent: the scheduler's next turn sends it, so that's when the preview says, not tomorrow)
ok(r.j.preview?.at > Date.now() - 60e3 && r.j.preview.at <= Date.now() + 5 * 60e3 && r.j.preview.at % 300e3 === 0, 'and when: the scheduler’s next turn, minutes from now', `${r.j.preview?.at} ${new Date(r.j.preview?.at).toISOString()}`);
// Weather's briefing and Fitness's reminder for the same account, due now, on phones of their own; and the same for Sam,
// who hasn't Today's morning on (so the two ticks are seen to send what they would)
const utc = wall('UTC'), hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
for (const who of [alex, sam]) {
  const k = await phone(`wx-${who.id}`), dev = `wx-${who.id}`;
  sql(`INSERT INTO wx_devs (dev, endpoint, p256dh, auth, user_id, units, brief_at, created, updated) VALUES ('${dev}', '${k.sub.endpoint}', '${k.sub.keys.p256dh}', '${k.sub.keys.auth}', '${who.id}', '{}', '${hm(Math.floor(utc.mins / 5) * 5)}', ${t0}, ${t0})`);
  sql(`INSERT INTO wx_subs (id, dev, endpoint, p256dh, auth, lat, lon, name, rain, brief, brief_at, units, tz_off, created, updated, warn) VALUES ('${dev}:51.51,-0.13', '${dev}', '${k.sub.endpoint}', '${k.sub.keys.p256dh}', '${k.sub.keys.auth}', 51.51, -0.13, 'London', 0, 1, '${hm(Math.floor(utc.mins / 5) * 5)}', '{}', 0, ${t0}, ${t0}, 0)`);
  const f = await phone(`fx-${who.id}`);
  sql(`INSERT INTO fx_push (endpoint, user_id, p256dh, auth, at, tz, days, added, session) VALUES ('${f.sub.endpoint}', '${who.id}', '${f.sub.keys.p256dh}', '${f.sub.keys.auth}', ${Math.floor(here.mins / 5) * 5}, '${TZ}', '${esc(JSON.stringify({ [here.day]: { title: 'Tempo 2 × 15', body: 'An hour, with two blocks of tempo.' } }))}', ${t0}, '${who.session}')`);
  who.wx = k.sub.endpoint; who.fx = f.sub.endpoint;
}

// ---- 3. The scheduler's turn ----
let since = Date.now();
r = await tick('/api/today/tick');
ok(r.s === 200 && r.j.due === 1 && r.j.sent === 1 && r.j.left === 0, 'the tick: one account due, sent to its phone', `${r.s} ${JSON.stringify(r.j)}`);
const small = r.j.composes?.[0];
console.log(`compose D1 statements, two holdings: ${small}; the whole tick: ${r.j.db}`);
ok(Number.isInteger(small) && small > 0 && Number.isInteger(r.j.db) && r.j.db >= small && r.j.db < DB_BUDGET, `a compose’s statements to the database counted (${small}), and the tick’s (${r.j.db})`, JSON.stringify(r.j));
let got = to(ph.sub.endpoint, since);
ok(got.length === 1, 'one notification at the phone', String(got.length));
let note = got.length ? await opened(ph, got[0].body) : {};
const lines = String(note.body || '').split('\n');
console.log('  sent:', JSON.stringify(note));
ok(/^London · -?\d+° \/ -?\d+°$/.test(note.title || ''), 'its title Weather’s briefing title', note.title);
ok(lines.length === 4, 'four lines, one an app', JSON.stringify(lines));
ok(lines[1]?.startsWith('Tempo 2 × 15'), 'Fitness’s: today’s session (and its best time, where there’s one)', lines[1]);
ok(lines[2] === '2 pigeons on their way', 'Chat’s, names off: counted, not named', lines[2]);
ok(/^Your portfolio|shut today\. Your portfolio is at £/.test(lines[3] || ''), 'Markets’: the portfolio as Markets says it', lines[3]);
ok(note.tag === 'today-morning' && note.url === '/', 'its tag, and opening Today', JSON.stringify({ tag: note.tag, url: note.url }));
ok(!/SECRET|Paris|Inverness|rocket|swift|Biscuit|Sam|Mum/.test(JSON.stringify(note)), 'no letter’s words, nor where from, nor what kind, nor who');
const kept = rows(`SELECT m_sent, m_last FROM td_prefs WHERE user_id = '${alex.id}'`)[0];
ok(kept?.m_sent === here.day && JSON.parse(kept.m_last || '{}').title === note.title, 'the day claimed, and what it said kept for the Morning section', JSON.stringify(kept));

// ---- 4. Not again; and names on ----
since = Date.now();
r = await tick('/api/today/tick');
ok(r.s === 200 && r.j.due === 0 && r.j.sent === 0 && to(ph.sub.endpoint, since).length === 0, 'a second tick: not sent again', JSON.stringify(r.j));
sql(`UPDATE pg_users SET notify_prefs = '${esc(JSON.stringify({ names: true }))}' WHERE id = '${alex.id}'`);
sql(`UPDATE td_prefs SET m_sent = NULL, m_last = NULL WHERE user_id = '${alex.id}'`);
since = Date.now();
r = await tick('/api/today/tick');
got = to(ph.sub.endpoint, since);
note = got.length ? await opened(ph, got[0].body) : {};
ok(String(note.body || '').split('\n')[2] === 'Pigeons from Sam and Mum on their way', 'Chat’s names preference on: who, soonest first', note.body);
ok(!/SECRET|Paris|Inverness|rocket|swift|Biscuit/.test(JSON.stringify(note)), 'still no letter’s words, nor where from, nor what kind');

// ---- 5. Weather's briefing and Fitness's reminder: not pushed to the account whose morning is Today's ----
since = Date.now();
const wx = await tick('/api/weather/tick'), fx = await tick('/api/fitness/garmin-tick', 'fitness.localhost:8788');
ok(wx.s === 200 && fx.s === 200, 'Weather’s and Fitness’s ticks ran', `${wx.s} ${fx.s} ${JSON.stringify(wx.j).slice(0, 160)} ${JSON.stringify(fx.j).slice(0, 160)}`);
ok(to(sam.wx, since).length === 1 && to(sam.fx, since).length === 1, 'Sam (no Today morning): Weather’s briefing and Fitness’s reminder pushed as ever', `${to(sam.wx, since).length} ${to(sam.fx, since).length}`);
ok(to(alex.wx, since).length === 0, 'Alex: Weather’s briefing not pushed (it’s in Today’s)');
ok(to(alex.fx, since).length === 0, 'Alex: Fitness’s reminder not pushed (it’s in Today’s)');
const claimed = rows(`SELECT last_brief FROM wx_subs WHERE dev = 'wx-${alex.id}'`)[0], fxSent = rows(`SELECT sent FROM fx_push WHERE endpoint = '${alex.fx}'`)[0];
ok(claimed?.last_brief == null && fxSent?.sent == null, 'and nothing claimed for them (turned off, they’d come)', JSON.stringify({ claimed, fxSent }));

// ---- 6. Show it on this phone: at once, never the day's ----
const before = rows(`SELECT m_sent, m_last FROM td_prefs WHERE user_id = '${alex.id}'`)[0];
since = Date.now();
r = await today('POST', 'morning/try', { cookie: alex.cookie, body: { endpoint: ph.sub.endpoint } });
ok(r.s === 200 && r.j.sent === 1 && to(ph.sub.endpoint, since).length === 1, 'Show it on this phone: sent at once', `${r.s} ${JSON.stringify(r.j)}`);
const after = rows(`SELECT m_sent, m_last FROM td_prefs WHERE user_id = '${alex.id}'`)[0];
ok(JSON.stringify(after) === JSON.stringify(before), 'and the day’s claim, and what it said, as they were', JSON.stringify({ before, after }));
r = await today('POST', 'morning/try', { cookie: alex.cookie, body: { endpoint: 'https://fcm.googleapis.com/fcm/send/someone-elses' } });
ok(r.s === 400, 'to a phone that isn’t the account’s: refused', `${r.s} ${JSON.stringify(r.j)}`);
r = await today('GET', 'morning', { cookie: alex.cookie });
ok(r.j.preview?.kind === 'sent' && r.j.sentToday === true, 'the Morning section: this morning’s, as it was sent', JSON.stringify(r.j.preview).slice(0, 200));
// (a day decided with nothing to say keeps the last that went, from another day: that's not shown as this morning's)
sql(`UPDATE td_prefs SET m_last = '${esc(JSON.stringify({ title: 'London · 12° / 6°', lines: ['An earlier day’s'], out: [], at: Date.now() - 36 * H }))}' WHERE user_id = '${alex.id}'`);
r = await today('GET', 'morning', { cookie: alex.cookie });
const nx = r.j.preview, nxAt = nx?.at ? wall(TZ, nx.at) : {};
ok(nx?.kind === 'next' && nxAt.day > here.day && nxAt.mins === Math.floor(here.mins / 5) * 5 && !JSON.stringify(nx).includes('An earlier day'), 'claimed today with an earlier day’s last: the next, tomorrow’s, not that one', JSON.stringify(nx).slice(0, 240));

// ---- 7. A portfolio of 60 holdings (Markets' most), its prices not kept: what its compose costs the database, and the
// tick's guard against D1's 1,000 a request with it ----
const SIXTY = ['RR.L', 'TSCO.L', 'SHEL.L', 'VUSA.L', 'AAPL', 'NVDA', 'ARM', 'SMT.L', 'ALW.L', 'JAM.L', 'VWRL.L', 'ISF.L', 'SPY', 'BTC-USD', 'AZN.L', 'HSBA.L', 'ULVR.L', 'BP.L', 'LLOY.L', 'VUKE.L',
  'VFEM.L', 'FCIT.L', 'CTY.L', 'PCT.L', 'MNKS.L', 'RCP.L', 'MYI.L', 'MSFT', 'GOOGL', 'AMZN', 'META', '^FTMC', '^GDAXI', '^FCHI', '^STOXX50E', '^DJI', '^IXIC', '^N225', '^HSI', 'GBPUSD=X',
  'GBPEUR=X', 'EURUSD=X', 'USDJPY=X', 'USDCHF=X', 'EURGBP=X', 'JPYGBP=X', 'CHFGBP=X', 'GC=F', 'SI=F', 'BZ=F', 'CL=F', 'NG=F', 'HG=F', '^IRX', '^FVX', '^TNX', '^TYX', 'ETH-USD', 'SOL-USD', 'USDGBP=X'];
sql(`INSERT OR IGNORE INTO mk_holdings (user_id, symbol, name, qty, added, ord, account) VALUES ${SIXTY.map((x, i) => `('${alex.id}', '${x}', '${x}', ${i + 1}, ${t0}, ${i}, ${i % 3 ? "'isa'" : 'NULL'})`).join(', ')}`);
sql(`INSERT OR REPLACE INTO mk_isa (user_id, year, paid) VALUES ('${alex.id}', '2026/27', 4000)`);
const held = rows(`SELECT COUNT(*) AS n FROM mk_holdings WHERE user_id = '${alex.id}' AND qty > 0`)[0]?.n;
sql(`UPDATE td_prefs SET m_sent = NULL, m_last = NULL WHERE user_id = '${alex.id}'`);
since = Date.now();
r = await tick('/api/today/tick');
const sixty = r.j.composes?.[0];
// (in flight once a tick's past DB_MOST: one compose let finish, and what follows each of AT_ONCE (the claim, the devices,
// each push's health, what was sent): a few, and one or two for each device; 10 allowed each)
const most = DB_MOST + sixty + AT_ONCE * 10;
console.log(`compose D1 statements, ${held} holdings: ${sixty}; the whole tick: ${r.j.db}; a tick of such accounts at most ${DB_MOST} + ${sixty} + ${AT_ONCE} × 10 = ${most}` +
  ` (with prices so slow each is also read as kept: ${most + SIXTY.length + 2})`);
ok(held === 60, 'sixty held', String(held));
ok(r.s === 200 && r.j.due === 1 && r.j.sent === 1 && to(ph.sub.endpoint, since).length === 1, 'sent, with sixty holdings', JSON.stringify(r.j));
ok(Number.isInteger(sixty) && sixty > small && sixty < DB_BUDGET, `its compose’s statements (${sixty}) counted, more than two holdings’ (${small}), and within a tick’s share`, String(sixty));
ok(r.j.db < 1000 && most <= 1000, `a tick of such accounts stays inside D1’s 1,000 a request: at most ${most}`, `${r.j.db} ${most}`);
ok(sixty < SIXTY.length * 3, `the morning reads no holding’s dividends, nor the ISA: under three statements a holding (${sixty} for ${SIXTY.length})`, String(sixty));
note = to(ph.sub.endpoint, since)[0] ? await opened(ph, to(ph.sub.endpoint, since)[0].body) : {};
ok(/^Your portfolio|shut today\. Your portfolio is at £/.test(String(note.body || '').split('\n')[3] || ''), 'and its Markets line, as Markets says it', note.body);

// ---- 7a. With Chat's pigeons off: a letter is a letter, and an instant message is never on its way ----
const tm = Date.now();
sql(`UPDATE pg_users SET pigeons = 0 WHERE id = '${alex.id}'; DELETE FROM pg_msgs WHERE id = 'tm-2';
  INSERT INTO pg_msgs (id, sender, recipient, ct, km, sent_at, deliver_at, swift, instant, stamped) VALUES ('tm-3', '${sam.id}', '${alex.id}', 'SECRET-CT-MSG', 0, ${tm - 60e3}, ${tm - 60e3}, 0, 1, 1);
  UPDATE td_prefs SET m_sent = NULL, m_last = NULL WHERE user_id = '${alex.id}'`);
since = Date.now();
r = await tick('/api/today/tick');
note = to(ph.sub.endpoint, since)[0] ? await opened(ph, to(ph.sub.endpoint, since)[0].body) : {};
const at1 = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(t0 + 3 * H);
ok(String(note.body || '').split('\n')[2] === `A letter from Sam, arriving about ${at1}`, 'pigeons off, names on: “A letter from Sam, arriving about …”, and the message not in it', note.body);
ok(!/pigeon|streak|SECRET/i.test(JSON.stringify(note)), 'no pigeon words, no streak, no message’s words', JSON.stringify(note));

// ---- 8. The tick answers only its scheduler ----
const nope = await new Promise((done) => { const q = http.request({ host: '127.0.0.1', port: 8788, path: '/api/today/tick', method: 'POST', agent: false, headers: { Host: 'localhost', Authorization: 'Bearer wrong' } }, (res) => { res.resume(); done(res.statusCode); }); q.end(); });
ok(nope === 401, 'the tick with the wrong secret: refused', String(nope));
const away = await new Promise((done) => { const q = http.request({ host: '127.0.0.1', port: 8788, path: '/api/today/tick', method: 'POST', agent: false, headers: { Host: ACCT, Authorization: 'Bearer tick-test-secret' } }, (res) => { res.resume(); done(res.statusCode); }); q.end(); });
ok(away === 404, 'at another address (the account’s): not there', String(away));

console.log(`FAILS ${fails}`);
process.exit(0);
