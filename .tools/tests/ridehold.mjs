// Holding a person's notifications while they ride (Today First, spec §8.7, §14.3), on the real stack, straight against
// the API: George's ride with a time (fx_times, as Ride At or Ride Then keeps it) began five minutes ago. Mira's
// messages give him no push while he rides, nor do a group's message, a reaction or a Markets alert; a MeteoAlarm
// warning does. His ride comes in (as Fitness's import puts it in fx_acts): one push for Mira's two, "while you rode",
// the group's and the reaction told, the alert told after, each counted in the hold rule's record. Pat's ride has no
// activity: what was held is told at its cap. Quinn's rule is at quiet: nothing held. Sue's at suggest: the alert held,
// Mira's message not. And Hal's ride is one Today added by itself from his habit, never tapped: it holds nothing.
// Every push is opened as the phone would open it, with keys this test holds, and says which app it's from.
import http from 'http';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { randomBytes } from 'crypto';
import { acctCall, inflightFrom } from './handback.mjs';
import * as F from './mocks/wxappdata.mjs';
import * as OW from './mocks/wxwarnings.mjs';
const [,, S] = process.argv;
const TODAY = 'http://ifl.test:8788', ACCT = 'account.ifl.test:8788';
let fails = 0; const ok = (c, l, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x !== '' ? ' — ' + x : ''}`); if (!c) fails++; };
const sql0 = (q) => execSync(`${S}/wr/node_modules/.bin/wrangler d1 execute bio-db --local --persist-to ${S}/wrstate --command "${q.replace(/"/g, '\\"')}"`, { cwd: process.env.APP_ROOT, stdio: 'pipe' }).toString();
const sql = (q) => { for (let i = 0; ; i++) { try { return sql0(q); } catch (e) { if (i > 5 || !/SQLITE_BUSY/.test(String(e.stdout) + String(e.stderr) + e.message)) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400); } } };
const rows = (q) => { const o = sql(q), m = o.match(/"results": (\[[\s\S]*?\])\s*,\s*"success"/); return m ? JSON.parse(m[1]) : []; };
const b64u = (u) => Buffer.from(u).toString('base64url'), rnd = (n) => crypto.getRandomValues(new Uint8Array(n));
const MIN = 60e3, H = 60 * MIN, DAY = 24 * H, CT = 'sealed-words-sealed-words';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- the stand-in for Open-Meteo and MeteoAlarm: a calm forecast, and London's warnings (with a new amber one once
// warn.extra is set) ----
const warn = { extra: false };
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), send = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/v1/forecast') { const n = (u.searchParams.get('latitude') || '').split(',').length, one = F.forecast(Date.now()); return send(n > 1 ? Array(n).fill(one) : one); }
  if (u.pathname === '/api/v1/warnings/feeds-united-kingdom') return send(OW.ukFeed(Date.now(), { extra: warn.extra }));
  if (u.pathname.startsWith('/api/v1/warnings/feeds-')) return send({ warnings: [] });
  if (u.pathname === '/flood-monitoring/id/floods') return send({ items: [] });
  if (u.pathname === '/api/data/stationinfo') return send([]);
  res.writeHead(404); res.end();
}).listen(8794, '127.0.0.1');

// ---- requests: as an app's page asks its own server (Host, and the bearer or the cookie) ----
function call(host, method, path, { body, token, cookie, origin } = {}) {
  const data = body ? JSON.stringify(body) : '';
  return new Promise((done, no) => {
    const q = http.request({ host: '127.0.0.1', port: 8788, path, method, agent: false, headers: { Host: host, ...(origin ? { Origin: origin } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(cookie ? { Cookie: cookie } : {}), ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) } }, (res) => {
      const parts = []; res.on('data', (c) => parts.push(c));
      res.on('end', () => { let j = {}; try { j = JSON.parse(Buffer.concat(parts).toString()); } catch (_) {} done({ s: res.statusCode, j }); });
    });
    q.on('error', no); q.end(data);
  });
}
const chat = (p, method, path, body) => call('localhost:8788', method, '/api/pigeon/' + path, { body, token: p.token });
const tick = (host, path) => call(host, 'POST', path, { token: 'tick-test-secret' });
const chatTick = () => tick('localhost', '/api/pigeon/notify-tick');
const marketsTick = () => tick('finance.localhost:8788', '/api/markets/tick');
const weatherTick = () => tick('localhost', '/api/weather/tick');
const mode = (o) => fetch('http://127.0.0.1:8801/mode', { method: 'POST', body: JSON.stringify(o) });

// ---- a phone with push keys this test holds, and what's pushed to it, opened (RFC 8291) ----
const wc = crypto.subtle, te = new TextEncoder();
async function phone(name) {
  const kp = await wc.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']), auth = rnd(16), pub = new Uint8Array(await wc.exportKey('raw', kp.publicKey));
  return { kp, pub, auth, endpoint: `https://fcm.googleapis.com/fcm/send/ridehold-${name}-${randomBytes(6).toString('hex')}`, keys: { p256dh: b64u(pub), auth: b64u(auth) } };
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
const pushesTo = async (p, since = 0) => { const out = []; for (const x of box().filter((y) => y.at > since && y.headers['x-endpoint'] === p.ph.endpoint)) out.push(await opened(p.ph, x.body)); return out; };
const said = (list) => list.map((x) => `${x.app}: ${x.title} · ${x.body}`);

// ---- 1. The people: an account each (on the account's page), signed in to Chat, a phone with Chat's notifications on ----
let ips = 40;
async function person(name, handle) {
  const kp = await wc.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']), pub = await wc.exportKey('jwk', kp.publicKey), ip = '10.0.8.' + (ips++);
  const r = await acctCall('signup', { name, handle, email: `${handle}@example.com`, salt: b64u(rnd(16)), proof: b64u(rnd(32)), vault: 'x'.repeat(40), pub: { kty: 'EC', crv: 'P-256', x: pub.x, y: pub.y } }, { ip });
  if (r.s !== 201 || !r.cookie) throw new Error(`signup ${handle}: ${r.s} ${JSON.stringify(r.j)}`);
  const c = await inflightFrom(r.cookie, { ip });
  if (c.s !== 200 || !c.j.token) throw new Error(`Chat ${handle}: ${c.s} ${JSON.stringify(c.j)}`);
  const p = { name, handle, cookie: r.cookie, token: c.j.token, id: c.j.me.id, ph: await phone(handle) };
  const sub = await chat(p, 'POST', 'push-sub', { endpoint: p.ph.endpoint, keys: p.ph.keys });
  if (sub.s !== 200) throw new Error(`push ${handle}: ${sub.s} ${JSON.stringify(sub.j)}`);
  // (names on the lock screen, so the pushes say who)
  sql(`UPDATE pg_users SET notify_prefs = '{"names":true}' WHERE id = '${p.id}'`);
  return p;
}
const george = await person('George Rider', 'georgerider'), mira = await person('Mira Shah', 'mirashah'), leo = await person('Leo Park', 'leopark');
const pat = await person('Pat Lane', 'patlane'), quinn = await person('Quinn Hale', 'quinnhale'), sue = await person('Sue Marsh', 'suemarsh'), hal = await person('Hal Brook', 'halbrook');
const t0 = Date.now();
for (const p of [george, pat, quinn, sue, hal, leo]) sql(`INSERT INTO pg_links (a, b, status, created_at) VALUES ('${mira.id}', '${p.id}', 'ok', ${t0})`);
sql(`INSERT INTO pg_links (a, b, status, created_at) VALUES ('${leo.id}', '${george.id}', 'ok', ${t0})`);
// (Today's cards once each, so every app's tables are made; Today's rules among them)
for (const p of [george, pat, quinn, sue, hal]) {
  const r = await call(ACCT, 'GET', '/api/account/today/cards', { cookie: p.cookie, origin: TODAY });
  ok(r.s === 200, `${p.name.split(' ')[0]}: Today's cards, so each app's tables are made`, `${r.s}`);
}

// ---- 2. The rides, as each module keeps them (Ride At and Ride Then are other batches' routes, so their rows are put in
// here, in the tables as their modules make them on first use) ----
sql(`CREATE TABLE IF NOT EXISTS fx_times (user_id TEXT NOT NULL, day TEXT NOT NULL, start INTEGER NOT NULL, stop INTEGER NOT NULL, tz TEXT NOT NULL,
  sport TEXT NOT NULL DEFAULT 'ride', source TEXT NOT NULL, made INTEGER NOT NULL, PRIMARY KEY (user_id, day));
  CREATE TABLE IF NOT EXISTS fx_offers (user_id TEXT NOT NULL, id TEXT NOT NULL, start INTEGER NOT NULL, stop INTEGER NOT NULL, tz TEXT NOT NULL,
  sport TEXT NOT NULL, wid TEXT NOT NULL, name TEXT NOT NULL, secs INTEGER NOT NULL, who TEXT NOT NULL, role TEXT NOT NULL,
  far INTEGER NOT NULL DEFAULT 0, dry INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'new', made INTEGER NOT NULL, until INTEGER NOT NULL,
  with_id TEXT, taken INTEGER NOT NULL DEFAULT 0, opts TEXT, PRIMARY KEY (user_id, id));
  CREATE TABLE IF NOT EXISTS fx_acts (user_id TEXT NOT NULL, id TEXT NOT NULL, start INTEGER NOT NULL, sport TEXT NOT NULL, indoor INTEGER NOT NULL DEFAULT 0,
  name TEXT, device TEXT, file TEXT, type TEXT NOT NULL, size INTEGER NOT NULL, sum TEXT, added INTEGER NOT NULL, PRIMARY KEY (user_id, id))`);
const day = (t) => new Date(t).toISOString().slice(0, 10);
const rideAt = (p, start, len = H) => sql(`INSERT OR REPLACE INTO fx_times (user_id, day, start, stop, tz, sport, source, made) VALUES ('${p.id}', '${day(start)}', ${start}, ${start + len}, 'Europe/London', 'ride', 'set', ${t0})`);
const level = (p, lv) => sql(`INSERT INTO td_rules (user_id, rule, level, set_by) VALUES ('${p.id}', 'holdRide', '${lv}', 'you') ON CONFLICT(user_id, rule) DO UPDATE SET level = '${lv}', set_by = 'you'`);
const gStart = t0 - 5 * MIN, pStart = t0 - 100 * MIN;
rideAt(george, gStart); rideAt(pat, pStart); rideAt(quinn, t0 - 5 * MIN); rideAt(sue, t0 - 5 * MIN);
level(quinn, 'quiet'); level(sue, 'suggest');
// (Hal's: Today added Thursday's ride from six dry weeks, at do, and he's never tapped it: role today, yes, taken 0)
sql(`INSERT INTO fx_offers (user_id, id, start, stop, tz, sport, wid, name, secs, who, role, state, made, until, taken)
  VALUES ('${hal.id}', 'habit-ride', ${t0 - 5 * MIN}, ${t0 + 55 * MIN}, 'Europe/London', 'ride', 'w1', 'Endurance', 3600, '', 'today', 'yes', ${t0}, ${t0 + 13 * H}, 0)`);

// ---- 3. Mira writes to each of them ----
const send = async (from, to) => { const r = await chat(from, 'POST', 'messages', { id: crypto.randomUUID(), to: to.id, ct: CT, instant: true }); return r.j.message?.id; };
let since = Date.now();
const m1 = await send(mira, george), m2 = await send(mira, george), mp = await send(mira, pat);
for (const p of [quinn, sue, hal]) await send(mira, p);
await wait(1500);
ok((await pushesTo(george, since)).length === 0, 'George is riding: Mira’s two messages give him no push');
ok(rows(`SELECT COUNT(*) AS n FROM pg_msgs WHERE id IN ('${m1}', '${m2}') AND notified_at IS NULL`)[0]?.n === 2, 'held: both left unclaimed, for the tick');
ok((await pushesTo(pat, since)).length === 0, 'Pat is riding: no push');
for (const [p, why] of [[quinn, 'his hold at quiet holds nothing'], [sue, 'at suggest, only apps are held: Mira’s comes'], [hal, 'an auto-added habit ride holds nothing']]) {
  const got = said(await pushesTo(p, since));
  ok(got.length === 1 && got[0] === 'chat: Mira · Sent you a message.', `${p.name.split(' ')[0]}: ${why}`, JSON.stringify(got));
}

// ---- 4. A group's message, and a reaction to his own message: held too ----
const gid = crypto.randomUUID();
sql(`INSERT INTO pg_groups (id, name, created_by, created_at) VALUES ('${gid}', 'Saturday Riders', '${leo.id}', ${t0});
  INSERT INTO pg_group_members (group_id, user_id, added_by, joined_at) VALUES ('${gid}', '${leo.id}', '${leo.id}', ${t0}), ('${gid}', '${george.id}', '${leo.id}', ${t0}), ('${gid}', '${mira.id}', '${leo.id}', ${t0})`);
const keys = Object.fromEntries([leo, george, mira].map((p) => [p.id, 'k'.repeat(30)]));
let r = await chat(leo, 'POST', 'group-messages', { id: crypto.randomUUID(), group: gid, body: CT, keys, instant: true });
ok(r.s === 200, 'Leo writes to the group', `${r.s} ${JSON.stringify(r.j).slice(0, 120)}`);
const mine = await send(george, mira);
r = await chat(mira, 'POST', 'react', { id: crypto.randomUUID(), msg: mine, ct: CT });
ok(r.s === 200, 'Mira reacts to his message', `${r.s}`);
await wait(1000);
r = await chatTick();
ok(r.s === 200, 'Chat’s tick runs', `${r.s} ${JSON.stringify(r.j)}`);
ok((await pushesTo(george, since)).length === 0, 'the group’s message and the reaction: no push while he rides (nor from the tick)', JSON.stringify(said(await pushesTo(george, since))));

// ---- 5. A Markets alert: held for George (do) and Sue (suggest); Quinn's comes at once ----
for (const p of [george, sue, quinn]) {
  sql(`INSERT INTO mk_holdings (user_id, symbol, name, qty, ord, added) VALUES ('${p.id}', 'TSCO.L', 'Tesco', 100, 0, ${t0});
    INSERT INTO mk_alerts (user_id, symbol, pct) VALUES ('${p.id}', 'TSCO.L', 3);
    INSERT INTO mk_push (endpoint, user_id, p256dh, auth, added, session) VALUES ('${p.ph.endpoint}', '${p.id}', '${p.ph.keys.p256dh}', '${p.ph.keys.auth}', ${t0}, (SELECT session FROM pg_push WHERE endpoint = '${p.ph.endpoint}'))`);
}
await mode({ bump: { 'TSCO.L': 5 } });
since = Date.now();
r = await marketsTick();
ok(r.s === 200, 'Markets’ tick runs', `${r.s} ${JSON.stringify(r.j)}`);
const quinnAlert = said(await pushesTo(quinn, since));
ok(quinnAlert.length === 1 && /^markets: Tesco is up \d/.test(quinnAlert[0]), 'Quinn (quiet): Tesco’s alert at once, from Markets', JSON.stringify(quinnAlert));
ok((await pushesTo(george, since)).length === 0, 'George: the alert held while he rides');
ok((await pushesTo(sue, since)).length === 0, 'Sue (suggest): apps held, so the alert is too');
ok(/^held:/.test(rows(`SELECT fired FROM mk_alerts WHERE user_id = '${george.id}'`)[0]?.fired || ''), 'marked as held, not as said', JSON.stringify(rows(`SELECT fired FROM mk_alerts WHERE user_id = '${george.id}'`)));

// ---- 6. A MeteoAlarm warning: warnings always come, ride or not ----
const dev = randomBytes(16).toString('hex');
await weatherTick();       // (Weather's tables made, if they weren't)
sql(`INSERT INTO wx_devs (dev, endpoint, p256dh, auth, user_id, units, brief_at, created, updated, sess) VALUES ('${dev}', '${george.ph.endpoint}', '${george.ph.keys.p256dh}', '${george.ph.keys.auth}', '${george.id}', '{}', '07:00', ${t0}, ${t0}, (SELECT session FROM pg_push WHERE endpoint = '${george.ph.endpoint}'));
  INSERT INTO wx_subs (id, dev, endpoint, p256dh, auth, lat, lon, name, rain, brief, brief_at, units, tz_off, created, updated, warn) VALUES ('${dev}:51.51,-0.13', '${dev}', '${george.ph.endpoint}', '${george.ph.keys.p256dh}', '${george.ph.keys.auth}', 51.51, -0.13, 'London', 1, 0, '07:00', '{}', 0, ${t0}, ${t0}, 1)`);
await weatherTick();       // (what's in force there now taken as told: a place's warnings are said as they're issued)
warn.extra = true; since = Date.now();
r = await weatherTick();
const wx = said(await pushesTo(george, since));
ok(r.s === 200 && wx.length === 1 && /^weather: .*wind warning/i.test(wx[0]), 'a new amber wind warning for London reaches George mid-ride, from Weather', `${JSON.stringify(r.j)} ${JSON.stringify(wx)}`);

// ---- 7. His ride comes in (as Fitness's import puts it): everything held is told, once, "while you rode" ----
sql(`INSERT INTO fx_acts (user_id, id, start, sport, type, size, sum, added) VALUES ('${george.id}', 'ride-in', ${gStart + MIN}, 'ride', 'fit', 1, '{}', ${Date.now()})`);
since = Date.now();
r = await chatTick();
await marketsTick();
const after = said(await pushesTo(george, since));
const fromMira = after.filter((s) => s.startsWith('chat: Mira · Sent you'));
ok(fromMira.length === 1 && fromMira[0] === 'chat: Mira · Sent you 2 messages while you rode.', 'one push for Mira’s two: “while you rode”', JSON.stringify(after));
ok(after.includes('chat: Saturday Riders · Leo sent a message while you rode.'), 'the group’s message told', JSON.stringify(after));
ok(after.includes('chat: Mira · Reacted to your message.'), 'the reaction told', JSON.stringify(after));
ok(after.some((s) => /^markets: Tesco is up \d/.test(s)), 'and Tesco’s alert, told after (still that far), from Markets', JSON.stringify(after));
ok(after.length === 4, 'nothing else, nothing twice', JSON.stringify(after));
const held = rows(`SELECT held FROM td_rules WHERE user_id = '${george.id}' AND rule = 'holdRide'`)[0]?.held;
ok(held === 5, 'the hold rule’s record: five held (two messages, the group’s, the reaction, the alert)', String(held));
ok((await pushesTo(sue, since)).length === 0, 'Sue still riding: her alert still held');
since = Date.now();
await chatTick(); await marketsTick();
ok((await pushesTo(george, since)).length === 0, 'and only once');

// ---- 8. Pat's ride has no activity: what was held is told at its cap ----
ok((await pushesTo(pat)).length === 0, 'Pat: still held, an hour and 40 minutes in and more');
// (as if the ride had begun a little earlier, so its cap fell just after Mira's message and has passed now: the
// server's clock is never moved, and the message stays where it was)
const mAt = rows(`SELECT deliver_at FROM pg_msgs WHERE id = '${mp}'`)[0].deliver_at;
rideAt(pat, mAt + 30e3 - 2 * H);
since = Date.now();
await chatTick();
const capped = said(await pushesTo(pat, since));
ok(capped.length === 1 && capped[0] === 'chat: Mira · Sent you a message while you rode.', 'Pat: told at the cap, “while you rode”', JSON.stringify(capped));

console.log(`FAILS ${fails}`);
process.exit(0);
