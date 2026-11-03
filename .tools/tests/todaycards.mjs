// InFlite Today's cards (functions/_todaycards.js, through functions/_todayapp.js GET today/cards), straight against the
// account's API as Today's Worker asks it (its Origin, the browser's cookie): an account with nothing in any app (each
// card saying how to begin), then its Weather place, friends and pigeons, Fitness's days and Markets holdings put in
// through the apps' own APIs and Chat's tables, and each card worked out from them in its app's own words; never a word
// of a letter. And what a card does when what it needs isn't there: MeteoAlarm down (Weather still there, with no
// warning), Open-Meteo down or its allowance kept for the morning's briefings (Weather's error, with its place, and
// Open-Meteo not asked), and no price for anything you own (Markets' error). (Today's address stood in for by ifl.test.)
// And Today First's day with them (?v=2), from real rows: a ride set with Ride At (fx_times) half an hour away, the
// preride's card; then the same ride ended five minutes ago with its activity waiting from Garmin, the honest after card
// (no stress until Fitness has it), who wrote while you rode, and who's waiting, by name and never by their words; in
// between, the ride past its cap with nothing in for it (not in yet, its Coming Up row flagged late). The account's zone
// is chosen so it's mid-afternoon there now (spec §14.4, layer 3).
import http from 'http';
import { execSync } from 'child_process';
import { acctCall } from './handback.mjs';
import * as F from './mocks/wxappdata.mjs';
const [,, S] = process.argv;
const ACCT = 'account.ifl.test:8788', TODAY = 'http://ifl.test:8788';
let fails = 0; const ok = (c, l, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x !== '' ? ' — ' + x : ''}`); if (!c) fails++; };
const sql0 = (q) => execSync(`${S}/wr/node_modules/.bin/wrangler d1 execute bio-db --local --persist-to ${S}/wrstate --command "${q}"`, { cwd: process.env.APP_ROOT, stdio: 'pipe' }).toString();
const sql = (q) => { for (let i = 0; ; i++) { try { return sql0(q); } catch (e) { if (i > 5 || !/SQLITE_BUSY/.test(String(e.stdout) + String(e.stderr) + e.message)) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400); } } };
const rows = (q) => { const o = sql(q), m = o.match(/"results": (\[[\s\S]*?\])\s*,\s*"success"/); return m ? JSON.parse(m[1]) : []; };
const b64u = (u) => Buffer.from(u).toString('base64url');
const rnd = (n) => crypto.getRandomValues(new Uint8Array(n));
const H = 3600e3, DAY = 864e5;

// ---- the stand-ins for Open-Meteo (a forecast, and a ride's week by the hour) and MeteoAlarm (a wind warning over London) ----
let warn = 'wind', omDown = false, omAsked = 0;
const iso = (t) => new Date(t).toISOString().replace(/\.\d+Z$/, '+00:00');
function windFeed(now) {
  return { warnings: [{ uuid: 'u-w', alert: { identifier: 'w-today', msgType: 'Alert', status: 'Actual', scope: 'Public', sender: 'https://www.metoffice.gov.uk', sent: iso(now - 2 * H),
    info: [{ language: 'en-GB', event: 'Yellow wind warning', onset: iso(now - H), expires: iso(now + 5 * H), senderName: 'UK Met Office', headline: 'Gusts', description: '',
      parameter: [{ valueName: 'awareness_level', value: '2; yellow; Moderate' }, { valueName: 'awareness_type', value: '1; Wind' }],
      area: [{ areaDesc: 'London & South East England', polygon: ['51.3,-0.5 51.3,0.3 51.7,0.3 51.7,-0.5 51.3,-0.5'] }] }] } }] };
}
function rideWeek(now) {
  const start = Math.floor(now / DAY) * DAY, time = [], h = { temperature_2m: [], apparent_temperature: [], precipitation_probability: [], precipitation: [], weather_code: [], wind_speed_10m: [], wind_gusts_10m: [], wind_direction_10m: [], is_day: [] };
  for (let s = start; s < start + 7 * DAY; s += H) {
    const hr = new Date(s).getUTCHours();
    time.push(s / 1000); h.temperature_2m.push(14); h.apparent_temperature.push(14); h.precipitation_probability.push(5); h.precipitation.push(0);
    h.weather_code.push(2); h.wind_speed_10m.push(10); h.wind_gusts_10m.push(20); h.wind_direction_10m.push(270); h.is_day.push(hr >= 7 && hr < 17 ? 1 : 0);
  }
  return { utc_offset_seconds: 0, hourly: { time, ...h } };
}
const stand = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), send = (o, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/v1/forecast') {
    if (u.searchParams.get('timeformat') === 'unixtime') return send(rideWeek(Date.now()));
    omAsked++;
    return omDown ? send({ error: true, reason: 'down' }, 503) : send(F.forecast(Date.now(), {}));
  }
  if (u.pathname === '/api/v1/warnings/feeds-united-kingdom') return warn === 'down' ? send({}, 503) : send(warn === 'wind' ? windFeed(Date.now()) : { warnings: [] });
  if (u.pathname.startsWith('/api/v1/warnings/feeds-')) return send({ warnings: [] });
  res.writeHead(404); res.end();
}).listen(8794, '127.0.0.1');

// ---- asking, as Today's Worker does: Today's Origin and the browser's cookie, and as each app's own page does ----
function ask(host, method, path, { cookie, origin, body } = {}) {
  const data = body ? JSON.stringify(body) : '';
  return new Promise((done, no) => {
    const t0 = Date.now();
    const q = http.request({ host: '127.0.0.1', port: 8788, path, method, agent: false, headers: { Host: host, ...(origin ? { Origin: origin } : {}), ...(cookie ? { Cookie: cookie } : {}),
      ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) } }, (res) => {
      const parts = []; res.on('data', (c) => parts.push(c));
      res.on('end', () => { const text = Buffer.concat(parts).toString(); let j = {}; try { j = JSON.parse(text); } catch (_) {} done({ s: res.statusCode, j, text, ms: Date.now() - t0 }); });
    });
    q.on('error', no); q.end(data);
  });
}
const cards = (cookie, query = '') => ask(ACCT, 'GET', `/api/account/today/cards${query}`, { cookie, origin: TODAY });
const app = (name, method, path, cookie, body) => ask(`${name}.ifl.test:8788`, method, path, { cookie, origin: `http://${name}.ifl.test:8788`, body });
async function signup(name, handle, n) {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']), pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const r = await acctCall('signup', { name, handle, email: `${handle}@example.com`, salt: b64u(rnd(16)), proof: b64u(rnd(32)), vault: 'x'.repeat(40), pub: { kty: 'EC', crv: 'P-256', x: pub.x, y: pub.y } }, { ip: `10.0.7.${n}` });
  if (r.s !== 201 || !r.cookie) throw new Error(`signup ${handle}: ${r.s} ${JSON.stringify(r.j)}`);
  return r.cookie;
}
const idOf = (h) => rows(`SELECT id FROM pg_users WHERE handle = '${h}'`)[0].id;
const dayIn = (tz, t) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(t));

try {
  const alex = await signup('Alex Morgan', 'alexday', 11), sam = await signup('Sam Lee', 'samday', 12), mum = await signup('Mum', 'mumday', 13), pat = await signup('Pat Reed', 'patday', 14);
  const A = idOf('alexday'), SAM = idOf('samday'), MUM = idOf('mumday'), PAT = idOf('patday');

  // ---- 1. Nothing in any app: each card says how to begin ----
  let r = await cards(alex);
  ok(r.s === 200 && r.j.tz === 'Europe/London' && Math.abs(r.j.at - Date.now()) < 30e3, 'the cards: when, and the account’s zone', `${r.s} ${r.text.slice(0, 200)}`);
  const c0 = r.j.cards || {};
  ok(c0.weather?.state === 'empty' && c0.weather.said === 'Add a place in Weather, and its day shows here.' && c0.weather.action?.href === 'http://weather.ifl.test:8788/', 'Weather: no place, so how to add one (in Weather, at the test’s address)', JSON.stringify(c0.weather));
  ok(c0.chat?.state === 'empty' && c0.chat.action?.label === 'Open Chat', 'Chat: no friends', JSON.stringify(c0.chat));
  ok(c0.fitness?.state === 'empty' && c0.fitness.href === 'http://fitness.ifl.test:8788/#today', 'Fitness: nothing sent from Fitness yet', JSON.stringify(c0.fitness));
  ok(c0.markets?.state === 'empty' && c0.markets.action?.label === 'Open Markets', 'Markets: nothing in the list', JSON.stringify(c0.markets));
  r = await ask(ACCT, 'GET', '/api/account/today/cards', { cookie: alex });
  ok(r.s === 403, 'without Today’s Origin: refused', `${r.s}`);

  // ---- 2. Each app's part, put in as each app does ----
  r = await app('weather', 'PUT', '/api/weather/me', alex, { base: 0, data: { places: [{ name: 'London', lat: 51.5072, lon: -0.1276 }], settings: {}, notify: { places: [], brief: null, briefAt: '07:00' } } });
  ok(r.s === 200, 'a place kept in Weather', `${r.s} ${r.text.slice(0, 160)}`);
  const now = Date.now(), today = dayIn('Europe/London', now), after = (n) => dayIn('Europe/London', now + n * DAY);
  const tempo = { state: 'session', id: 'rh:tempo:60', sport: 'ride', name: 'Tempo 2 × 15', kind: 'Tempo', secs: 3600, tss: 62, hard: true, why: 'A good day for some tempo.', steps: [[600, 0.5, 0.75], [900, 0.88, 0.88]] };
  r = await app('fitness', 'POST', '/api/fitness/today', alex, { tz: 'Europe/London', units: 'metric', days: { [today]: tempo, [after(1)]: { state: 'rest', why: '' }, [after(2)]: { state: 'none' } } });
  ok(r.s === 200 && r.j.ok, 'Fitness’s coming days sent, as Fitness sends them', `${r.s} ${r.text.slice(0, 160)}`);
  for (const h of [{ symbol: 'RR.L', qty: 100 }, { symbol: 'TSCO.L', qty: 1000, account: 'isa' }, { symbol: 'AAPL', qty: 10 }, { symbol: 'NVDA', qty: 0 }]) {
    r = await app('finance', 'PUT', '/api/markets/holding', alex, h);
    if (r.s !== 200) ok(false, `Markets: ${h.symbol} added`, `${r.s} ${r.text.slice(0, 160)}`);
  }
  // (friends with Sam and Mum; Pat only asking; pigeons in the air both ways, one landed, and a streak with Mum)
  const t = Date.now(), d = Math.floor(t / DAY);
  sql(`INSERT INTO pg_links (a, b, status, created_at) VALUES ('${A}', '${SAM}', 'ok', 0), ('${MUM}', '${A}', 'ok', 0), ('${PAT}', '${A}', 'pending', 0);
    INSERT INTO pg_msgs (id, sender, recipient, ct, km, sent_at, deliver_at, swift, pigeon, bird_name, bird_rank, from_place, to_place, via_note, photo, photo_size) VALUES
      ('td-in', '${SAM}', '${A}', 'SECRET-CT', 343, ${t - H}, ${t + H}, 1, 'swift', 'Biscuit', 'Navigator', 'Paris', 'London', 'SECRET-NOTE', 1, 98765),
      ('td-landed', '${MUM}', '${A}', 'SECRET-CT', 640, ${t - 5 * H}, ${t - 2 * H}, 0, NULL, NULL, NULL, 'Inverness', 'London', NULL, 0, NULL),
      ('td-mine', '${A}', '${SAM}', 'SECRET-CT', 1210, ${t - H / 2}, ${t + 9 * H}, 0, 'standard', 'Pip', 'Courier', 'London', 'Lisbon', NULL, 0, NULL),
      ('td-pat', '${PAT}', '${A}', 'SECRET-CT', 100, ${t - H}, ${t + H}, 0, NULL, NULL, NULL, 'PAT-PLACE', 'London', NULL, 0, NULL);
    INSERT OR IGNORE INTO pg_meta (k, v) VALUES ('streaks_v1', '1');
    INSERT OR REPLACE INTO pg_streaks (a, b, start, last, best) VALUES ('${A < MUM ? A : MUM}', '${A < MUM ? MUM : A}', ${d - 12}, ${d - 1}, 19)`);

  // ---- 3. Each card, from them ----
  const bucketBefore = JSON.parse(rows("SELECT v FROM wx_meta WHERE k = 'om_bucket'")[0]?.v || 'null');
  r = await cards(alex, '?with=morning');
  ok(r.s === 200 && r.ms < 12e3, `the cards worked out in time (${r.ms} ms)`, `${r.s}`);
  ok(!/SECRET|98765|PAT-PLACE/.test(r.text), 'no word of a letter, nothing of a photo, nothing from someone only asking');
  const c = r.j.cards || {};
  const w = c.weather || {};
  ok(w.state === 'ok' && w.place?.name === 'London' && w.href === 'http://weather.ifl.test:8788/?lat=51.5072&lon=-0.1276&name=London', 'Weather: its place, linked to it in Weather', JSON.stringify(w).slice(0, 200));
  ok(typeof w.lead === 'string' && /[.!?]$/.test(w.lead) && /^London · /.test(w.brief?.title || '') && /°$/.test(w.now?.temp || ''), 'Weather: now, and the day in Weather’s words', JSON.stringify({ lead: w.lead, brief: w.brief, now: w.now }));
  ok(w.warning?.title === 'Wind warning' && w.warning.issuer === 'Met Office' && /^Met Office: yellow wind warning /.test(w.warning.said) && w.share?.endsWith(w.warning.said), 'Weather: the warning in force there, said as Weather says it, in the line to send', JSON.stringify(w.warning));
  ok(Array.isArray(w.hours?.list) && w.hours.list.length >= 4, 'Weather: the hours ahead', JSON.stringify(w.hours).slice(0, 160));
  const bucketAfter = JSON.parse(rows("SELECT v FROM wx_meta WHERE k = 'om_bucket'")[0]?.v || 'null');
  ok(bucketBefore === null && bucketAfter?.n === 500 - 7 && Math.abs(bucketAfter.at - Date.now()) < 60e3, 'the forecast paid for out of Open-Meteo’s allowance (all of what’s kept, less a forecast’s 7)', `${JSON.stringify(bucketBefore)} → ${JSON.stringify(bucketAfter)}`);
  const ch = c.chat || {};
  ok(ch.state === 'ok' && ch.inbound?.length === 1 && ch.inbound[0].who.first === 'Sam' && ch.inbound[0].kind === 'swift' && ch.inbound[0].bird?.name === 'Biscuit' && ch.inbound[0].href === `http://chat.ifl.test:8788/#open=${SAM}`,
    'Chat: Sam’s pigeon on its way, its kind, its bird, and a link to Sam in Chat', JSON.stringify(ch.inbound));
  ok(ch.inboundTotal === 1 && ch.inboundFrom === 1, 'Chat: every pigeon on its way counted, and the friends sending them (not Pat’s, only asking)', JSON.stringify({ n: ch.inboundTotal, from: ch.inboundFrom }));
  ok(ch.unread?.length === 1 && ch.unread[0].who.first === 'Mum' && ch.unread[0].n === 1, 'Chat: Mum’s landed and not read', JSON.stringify(ch.unread));
  ok(ch.mine?.length === 1 && ch.mine[0].to === 'Lisbon' && ch.mine[0].kind === 'standard', 'Chat: yours in the air', JSON.stringify(ch.mine));
  ok(ch.streak?.n === 12 && ch.streak.who.first === 'Mum' && ch.share === 'My flight streak with Mum is 12 days.', 'Chat: the streak that ends today unless a pigeon flies, and the line to send', JSON.stringify({ s: ch.streak, share: ch.share }));
  const fx = c.fitness || {};
  ok(fx.state === 'ok' && fx.kind === 'session' && fx.session?.name === 'Tempo 2 × 15' && fx.day === today && fx.share?.startsWith('Today: Tempo 2 × 15, 1 h.'), 'Fitness: today’s session, as Fitness planned it', JSON.stringify(fx).slice(0, 240));
  ok(fx.best === null || (/^(Best \d\d:\d\d to \d\d:\d\d|No good time outside today)$/.test(fx.best.said) && / · London$/.test(fx.best.sub)), 'Fitness: its best time from the weather where you ride (none once the day’s light is gone)', JSON.stringify(fx.best));
  const mk = c.markets || {};
  ok(mk.state === 'ok' && mk.owned === 3 && mk.following === 1 && mk.value > 0 && typeof mk.change === 'number' && typeof mk.traded === 'boolean', 'Markets: what you own, worth, and today’s change by Markets’ own logic', JSON.stringify(mk).slice(0, 240));
  ok(mk.isa?.year && mk.isa.inIsa > 0 && mk.isa.allowance === 20000, 'Markets: the ISA, with Tesco in it', JSON.stringify(mk.isa));
  ok(Array.isArray(mk.market?.shut) && typeof mk.market.said === 'string', 'Markets: the market, open or shut, in Markets’ words', JSON.stringify(mk.market));
  ok(r.j.morning && typeof r.j.morning === 'object' && 'preview' in r.j.morning, 'with=morning: the Morning section with them', JSON.stringify(r.j.morning).slice(0, 200));
  // (the dividends asked for after the first answer, kept for the next)
  await new Promise((done) => setTimeout(done, 1500));
  r = await cards(alex, '?only=markets');
  ok(r.s === 200 && Object.keys(r.j.cards || {}).join() === 'markets', '?only=markets: that card alone', Object.keys(r.j.cards || {}).join());
  const dv = r.j.cards?.markets?.dividend;
  ok(dv && /^(RR\.L|TSCO\.L|AAPL)$/.test(dv.symbol) && dv.at > Date.now() && dv.value > 0 && dv.href === `http://finance.ifl.test:8788/#s=${encodeURIComponent(dv.symbol)}`, 'Markets: the next dividend as Markets expects it, from what it kept since', JSON.stringify(dv));

  // (a rest day, as Fitness sends it: its reason on the card)
  r = await app('fitness', 'POST', '/api/fitness/today', alex, { tz: 'Europe/London', units: 'metric', days: { [today]: { state: 'rest', why: 'An easy week, after the race.' }, [after(1)]: tempo } });
  ok(r.s === 200 && r.j.ok, 'a rest day sent, as Fitness sends it', `${r.s} ${r.text.slice(0, 160)}`);
  r = await cards(alex, '?only=fitness');
  const rest = r.j.cards?.fitness || {};
  ok(rest.state === 'ok' && rest.kind === 'rest' && rest.why === 'An easy week, after the race.' && rest.session === null && rest.next?.label === 'Tomorrow', 'Fitness: a rest day, with the reason Fitness gave for it', JSON.stringify(rest).slice(0, 240));

  // ---- 3a. Chat: a message, counted apart from letters; and the card for someone with pigeons off ----
  ok(ch.pigeons === true, 'Chat: pigeons on, said on the card', JSON.stringify({ pigeons: ch.pigeons }));
  const tm = Date.now();
  sql(`INSERT INTO pg_msgs (id, sender, recipient, ct, km, sent_at, deliver_at, swift, instant, stamped) VALUES ('td-msg', '${SAM}', '${A}', 'SECRET-CT', 0, ${tm - 60e3}, ${tm - 60e3}, 0, 1, 1)`);
  r = await cards(alex, '?only=chat');
  const cm = r.j.cards?.chat || {}, samU = (cm.unread || []).find((u) => u.who?.first === 'Sam'), mumU = (cm.unread || []).find((u) => u.who?.first === 'Mum');
  ok(samU?.n === 1 && samU.messages === 1 && mumU?.n === 1 && mumU.messages === 0 && !/SECRET/.test(r.text), 'Chat: Sam’s instant message unread, counted as a message; Mum’s letter as a letter', JSON.stringify(cm.unread));
  ok(cm.inbound?.length === 1 && cm.inboundTotal === 1, 'and a message is never “on its way”', JSON.stringify({ n: cm.inboundTotal }));
  sql(`UPDATE pg_users SET pigeons = 0 WHERE id = '${A}'`);
  r = await cards(alex, '?only=chat');
  const co = r.j.cards?.chat || {};
  ok(co.state === 'ok' && co.pigeons === false && co.streak === null && co.share === 'Sending you a message.', 'pigeons off: no streak, and the line to send is plain', JSON.stringify({ pigeons: co.pigeons, streak: co.streak, share: co.share }));
  ok(co.inbound?.length === 1 && co.inbound[0].who.first === 'Sam' && co.unread?.find((u) => u.who?.first === 'Sam')?.messages === 1, 'and letters on their way still shown, and the message still unread', JSON.stringify({ in: co.inbound?.length, un: co.unread }));
  sql(`UPDATE pg_users SET pigeons = 1 WHERE id = '${A}'`);

  // ---- 3b. Today First: the day with the cards (?v=2), from real rows ----
  {
    const riley = await signup('Riley Day', 'rileyday', 15), R = idOf('rileyday');
    // (the account's zone: one where it's 15:00 or so now, so the ride and its activity fall in today's afternoon there)
    const zoneAt = (hh, at = Date.now()) => { const off = ((hh - new Date(at).getUTCHours() + 36) % 24) - 12; return off === 0 ? 'Etc/GMT' : `Etc/GMT${off > 0 ? '-' : '+'}${Math.abs(off)}`; };
    const zone = zoneAt(15), clock = (ms) => new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
    sql(`UPDATE pg_users SET notify_prefs = '{\\"tz\\":\\"${zone}\\"}' WHERE id = '${R}'; INSERT INTO pg_links (a, b, status, created_at) VALUES ('${R}', '${SAM}', 'ok', 0)`);
    r = await app('weather', 'PUT', '/api/weather/me', riley, { base: 0, data: { places: [{ name: 'London', lat: 51.5072, lon: -0.1276 }], settings: {}, notify: { places: [], brief: null, briefAt: '07:00' } } });
    ok(r.s === 200, 'Riley’s place kept in Weather', `${r.s}`);
    // (a first read makes Today First's tables; then the ride, as Fitness's Ride At writes it, 30 minutes from now)
    r = await cards(riley, '?v=2');
    ok(r.s === 200 && r.j.v === 2 && r.j.ride === null && typeof r.j.phase === 'string' && Array.isArray(r.j.timeline) && r.j.apps?.mail === false, 'v=2: the day with the cards, no ride yet', `${r.s} ${r.text.slice(0, 300)}`);
    let now = Date.now();
    const start = Math.ceil((now + 30 * 60e3) / 300e3) * 300e3, stop = start + 75 * 60e3;
    sql(`INSERT INTO fx_times (user_id, day, start, stop, tz, sport, source, made) VALUES ('${R}', '${dayIn(zone, start)}', ${start}, ${stop}, '${zone}', 'ride', 'set', ${now})`);
    r = await cards(riley, '?v=2');
    const a = r.j;
    ok(r.s === 200 && a.phase === 'preride' && a.since === start - 40 * 60e3 && a.until === start, 'Ride At half an hour away: preride, from 40 minutes before it, until it starts', `${r.s} ${JSON.stringify({ phase: a.phase, since: a.since, until: a.until, start })}`);
    ok(a.ride?.start === start && a.ride.stop === stop && a.ride.secs === 4500 && a.ride.source === 'set' && a.ride.hold === true && a.ride.name === 'Ride', 'the ride: its time from fx_times, held for while you ride', JSON.stringify(a.ride));
    const pre = a.tops?.preride || {};
    ok(pre.kind === 'ride' && pre.title === `Ride at ${clock(start)}` && pre.stats?.[0]?.value === '1:15' && pre.share === `My ride today at ${clock(start)}.` && pre.stats.some((x) => x.label === 'Roads' && x.value === 'Dry') && pre.lines?.includes('Messages are held while you ride, except warnings'),
      'the preride card: the ride, its time, the roads (dry, from the weather where you ride), messages held', JSON.stringify(pre));
    ok(a.timeline?.[0]?.phase === 'preride' && a.timeline[1]?.phase === 'riding' && a.timeline[1].at === start && a.tops?.riding && a.upcoming?.some((x) => x.id === 'ride' && x.at === start && x.title === 'Ride' && x.href === '/fitness/#today'),
      'the rest of the day: riding at its start, its card worked out already, the ride in Coming Up', JSON.stringify({ timeline: a.timeline, up: a.upcoming }));
    ok(a.planning === true && Array.isArray(a.acts), 'its day not yet planned: worked out in the background', JSON.stringify({ planning: a.planning, acts: a.acts }));
    r = await cards(riley);
    ok(r.s === 200 && !('v' in r.j) && !('phase' in r.j) && Object.keys(r.j).join() === 'at,tz,cards', 'without v=2: version 1’s answer, the cards alone', Object.keys(r.j).join());
    // (the same ride, its cap passed ten minutes ago, with nothing in for it: it says so, and Coming Up keeps its row, late)
    now = Date.now();
    const s1 = Math.floor((now - 130 * 60e3) / 300e3) * 300e3;
    sql(`UPDATE fx_times SET day = '${dayIn(zone, s1)}', start = ${s1}, stop = ${s1 + 75 * 60e3} WHERE user_id = '${R}'`);
    r = await cards(riley, '?v=2');
    const nin = r.j, row = (nin.upcoming || []).find((x) => x.id === 'ride'), topNow = nin.tops?.[nin.phase] || {};
    ok(r.s === 200 && nin.ride?.start === s1 && !('doneAt' in nin.ride) && row?.sub === 'Not in yet' && row.late === true && row.at === s1 && row.href === '/fitness/#activities'
      && (topNow.lines || []).some((l) => l.includes(`${clock(s1)} ride isn’t in yet`)), 'past its cap with nothing in: not in yet, in the top card, and its Coming Up row kept, flagged late',
      JSON.stringify({ phase: nin.phase, row, lines: topNow.lines }));
    // (the same ride, ended five minutes ago, its activity waiting from Garmin with its time and distance; Sam wrote during it)
    now = Date.now();
    const s2 = Math.floor((now - 80 * 60e3) / 300e3) * 300e3, e2 = s2 + 75 * 60e3;
    sql(`UPDATE fx_times SET day = '${dayIn(zone, s2)}', start = ${s2}, stop = ${e2} WHERE user_id = '${R}';
      CREATE TABLE IF NOT EXISTS fx_garmin_new (user_id TEXT NOT NULL, id TEXT NOT NULL, start INTEGER, name TEXT, added INTEGER NOT NULL, size INTEGER NOT NULL DEFAULT 0, sport TEXT, secs INTEGER, dist REAL, PRIMARY KEY (user_id, id));
      INSERT INTO fx_garmin_new (user_id, id, start, name, added, size, sport, secs, dist) VALUES ('${R}', 'g-v2', ${s2 + 60e3}, 'Afternoon Ride', ${now - 4 * 60e3}, 1000, 'cycling', 4500, 36050);
      INSERT INTO pg_msgs (id, sender, recipient, ct, km, sent_at, deliver_at, swift, instant, stamped) VALUES ('td-v2-sam', '${SAM}', '${R}', 'SECRET-WHILE-YOU-RODE', 0, ${s2 + 30 * 60e3}, ${s2 + 30 * 60e3}, 0, 1, 1)`);
    r = await cards(riley, '?v=2');
    const b = r.j, done = b.tops?.after || {};
    // (after from when it came in, the row's added, where Fitness's done rows say it; else from its end)
    const inAt = [s2 + 60e3 + 4500e3, now - 4 * 60e3];
    ok(r.s === 200 && b.phase === 'after' && inAt.includes(b.since) && b.until === b.since + 90 * 60e3 && b.ride?.doneAt === b.since, 'the activity in from Garmin: after, from when it came in (or its end), for 90 minutes', `${r.s} ${JSON.stringify({ phase: b.phase, since: b.since, inAt, ride: b.ride })}`);
    ok(done.kind === 'done' && done.lines?.[0] === 'From your watch' && done.lines.includes('Stress and fitness once Fitness has it') && done.stats?.some((x) => x.label === 'Distance' && /^36\.[01] km$/.test(x.value)) && !done.stats.some((x) => x.label === 'Stress')
      && done.buttons?.some((x) => x.label === 'Open Fitness' && x.href === '/fitness/#activities'), 'the honest after card: time and distance from the watch, no stress until Fitness has it, Open Fitness', JSON.stringify(done));
    ok(done.wrote?.some((w) => w.id === SAM && w.first === 'Sam') && done.lines.includes('Sam wrote while you rode') && done.buttons.some((x) => x.do === 'answer' && x.href === `/chats/#open=${SAM}`), 'who wrote while you rode, and Answer Sam', JSON.stringify({ wrote: done.wrote, buttons: done.buttons }));
    ok(b.waiting?.length === 1 && b.waiting[0].id === SAM && b.waiting[0].first === 'Sam' && b.waiting[0].n === 1 && Object.keys(b.waiting[0]).sort().join() === 'at,first,id,n', 'Waiting for You: Sam, by name and when, nothing more', JSON.stringify(b.waiting));
    ok(!/SECRET/.test(r.text), 'and never a word of what Sam said');
    const dc = done.sendCard ? JSON.parse(Buffer.from(done.sendCard, 'base64url').toString()) : null;
    ok(dc?.kind === 'fitness' && dc.snap?.done?.secs === 4500 && dc.snap.done.dist === 36050 && !('tss' in dc.snap.done), 'the finished ride’s card for Chat: only what’s known', JSON.stringify(dc?.snap));
  }

  // ---- 4. When what a card needs isn't there ----
  warn = 'down';
  r = await cards(alex, '?only=weather');
  ok(r.j.cards?.weather?.state === 'ok' && r.j.cards.weather.warning === null, 'MeteoAlarm down: Weather still there, with no warning', JSON.stringify(r.j.cards?.weather).slice(0, 160));
  warn = 'none';
  // (a place in another cell, so nothing's kept for it: Open-Meteo down)
  r = await app('weather', 'PUT', '/api/weather/me', pat, { base: 0, data: { places: [{ name: 'Bath', lat: 51.38, lon: -2.36 }], settings: {}, notify: { places: [], brief: null, briefAt: '07:00' } } });
  omDown = true;
  r = await cards(pat, '?only=weather');
  ok(r.j.cards?.weather?.state === 'error' && r.j.cards.weather.said === 'Couldn’t get the forecast just now.' && r.j.cards.weather.retry === true && r.j.cards.weather.place?.name === 'Bath', 'Open-Meteo down: Weather’s error, with its place', JSON.stringify(r.j.cards?.weather));
  omDown = false;
  // (what a page would leave of the allowance less than half what's kept for the briefings: Open-Meteo not asked at all)
  sql(`INSERT OR REPLACE INTO wx_meta (k, v) VALUES ('om_bucket', '{\\"n\\":100,\\"at\\":${Date.now()}}')`);
  r = await app('weather', 'PUT', '/api/weather/me', pat, { base: 1, data: { places: [{ name: 'Truro', lat: 50.26, lon: -5.05 }], settings: {}, notify: { places: [], brief: null, briefAt: '07:00' } } });
  const asked0 = omAsked;
  r = await cards(pat, '?only=weather');
  ok(r.j.cards?.weather?.state === 'error' && r.j.cards.weather.place?.name === 'Truro' && omAsked === asked0, 'the allowance kept for the morning’s briefings: Weather’s error, and Open-Meteo not asked', `${JSON.stringify(r.j.cards?.weather)} asked ${omAsked - asked0}`);
  // (nothing you own priced, fresh or kept)
  sql(`INSERT INTO mk_holdings (user_id, symbol, name, qty, cost, ord, added) VALUES ('${PAT}', 'NOPE.L', 'Nope', 3, NULL, 0, 0)`);
  r = await cards(pat, '?only=markets');
  ok(r.j.cards?.markets?.state === 'error' && r.j.cards.markets.said === 'Couldn’t get prices just now.' && r.j.cards.markets.retry === true, 'no price for anything you own: Markets’ error', JSON.stringify(r.j.cards?.markets));
  ok(!/D1_|SQLITE|Error:/i.test(r.text), 'and no database words in it');
} catch (e) {
  ok(false, 'ran to the end', e.stack || e.message);
}
stand.close();
console.log(`FAILS ${fails}`);
process.exit(fails ? 1 : 0);
