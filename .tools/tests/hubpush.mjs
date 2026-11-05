// needs: hub
// InFlite's notifications, one subscription for every app (Today First, spec §11.3, §11.4, §10, §14.3): George at the
// hub (ifl.test:8788) on an iPhone whose PushManager is a stand-in with keys this test holds, so every push the site
// sends him is opened here and read; Mira on Chat's own address.
//   0. an old Today install with a Weather device on the same sign-in: Chat's first hand-back at the hub moves the
//      sign-in, and Today's subscription and Weather's device go with it (td_push alive, wx_devs still the account's)
//   1. On This Phone on, in You's Notifications: Today's morning only (td_push), and nothing posted to the device route before that tap
//   2. Get Every App's Here: the same endpoint in pg_push, mk_push and wx_devs (one row each), via = 'hub'; remembered,
//      and sent again by itself where Chat's row is lost
//   3. a Chat message, a Markets alert and the morning: each in the push box, opened, each saying its app
//   4. the root worker's pulse: a push of Chat's handed to the root worker (as the browser would) with no Chat open,
//      and Mira's tick turns delivered
//   5. a notification tapped with Chats open: the chat, in the same window
//   6. Stop There for an old sign-in: only its rows go, Weather's device and its places included; nothing signed out
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { execSync } from 'node:child_process';
import { kit } from './lib.mjs';
import { makeAccount, joinChat, onAccountPage } from './join.mjs';
import { hostCall } from './handback.mjs';

const [,, S, out] = process.argv;
// (instant chats, as new accounts have them on the site: PIGEONS=0, the database kept; instant.mjs does the same)
execSync(`${S}/restartkeep.sh`, { env: { ...process.env, PIGEONS: '0' }, stdio: 'ignore' });
const K = await kit(S, out);
const { ok, one, sql, api, HUB, errs } = K;
const CHAT = 'http://chat.ifl.test:8788', ACCT = 'http://account.ifl.test:8788';
const MIN = 60e3;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 15000, step = 400) => { const end = Date.now() + ms; for (;;) { const v = await Promise.resolve().then(f).catch(() => null); if (v || Date.now() > end) return v; await wait(step); } };
const esc = (s) => String(s).replace(/'/g, "''");
// (anything, said in a line for a check's note, cut short: undefined too)
const js = (x, n = 200) => String(JSON.stringify(x) ?? x).slice(0, n);
// (an SQL error said in a line: wrangler's own words after ERROR, without its colours or its warnings)
const sqlErr = (e) => (String(e.stderr || e.message).replace(/\x1b\[[0-9;]*m/g, '').match(/ERROR\]?\s*(.+)/)?.[1] || String(e.message)).slice(0, 200);
// (lib.mjs hands the statement to wrangler inside the shell's double quotes: those, $, ` and \ in it kept as they are)
const shell = (q) => q.replace(/(["$`\\])/g, '\\$1');
const rows = (q) => { try { return one(shell(q)); } catch (e) { console.log('SQL', sqlErr(e)); return []; } };
const run = (q, quiet = false) => { try { sql(shell(q)); return true; } catch (e) { if (!quiet) console.log('SQL', sqlErr(e)); return false; } };
const step = (n, title, secs) => console.log(`\n---- ${n}. ${title}  [spec ${secs}] ----`);
const shot = (ph, name) => ph.p.screenshot({ path: `${out}/${name}.png` }).catch(() => {});
const b64u = (u) => Buffer.from(u).toString('base64url');
const hex = (s) => createHash('sha256').update(s).digest('hex');
const tickAt = (path, host = 'localhost') => new Promise((done) => {
  const q = http.request({ host: '127.0.0.1', port: 8788, path, method: 'POST', agent: false, headers: { Host: host, Authorization: 'Bearer tick-test-secret' } }, (res) => {
    let t = ''; res.on('data', (x) => (t += x)); res.on('end', () => { let j = {}; try { j = JSON.parse(t); } catch (_) {} done({ s: res.statusCode, j }); });
  });
  q.on('error', (e) => done({ s: 0, j: { error: e.message } })); q.end();
});
// (what reached each app's own address through the hub's pass-throughs: mocks/hostpass.mjs)
const passed = (since) => readFileSync(`${S}/hostpass.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.at >= since);

// ---- push keys this test holds, by the endpoint's name (…/send/<name>-device), and every push opened ----
const KEYS = {};
const endpointOf = (name) => `https://fcm.googleapis.com/fcm/send/${name}-device`;
const opened = async () => {
  const all = [];
  for (const p of K.pushes()) {
    const name = /\/send\/([a-z]+)-device$/.exec(p.headers['x-endpoint'] || '')?.[1];
    if (!name || !KEYS[name]) continue;
    all.push({ name, at: p.at, ...(await K.decrypt(KEYS[name], p.body).catch(() => ({ undecrypted: true }))) });
  }
  return all;
};
const pushesSince = async (name, since) => (await opened()).filter((x) => x.name === name && x.at > since);
// (a subscription of an old install, put in as that app put it: an endpoint and keys a phone would have)
async function oldSub(name) { const k = KEYS[name] = await K.makeKeys(); return { endpoint: endpointOf(name), p256dh: b64u(k.pub), auth: b64u(k.auth) }; }

// ---- the phones ----
const sessAt = (page) => page.evaluate(() => new Promise((res) => {
  try {
    const r = indexedDB.open('inflight');
    r.onupgradeneeded = () => { r.transaction.abort(); res(null); };
    r.onerror = () => res(null);
    r.onsuccess = () => { try { const g = r.result.transaction('kv').objectStore('kv').get('session'); g.onsuccess = () => res(g.result?.token ? { token: g.result.token, id: g.result.me?.id } : null); g.onerror = () => res(null); } catch (_) { res(null); } };
  } catch (_) { res(null); }
})).catch(() => null);
const gKeys = KEYS.george = await K.makeKeys();
const G = await K.hubPhone('george', gKeys, { zone: 'Europe/London' });
const REC = [];
await G.ctx.route('**/*', async (route) => { const q = route.request(); REC.push({ at: Date.now(), method: q.method(), url: q.url(), body: q.postData() }); await route.continue().catch(() => {}); });
const deviceCalls = () => REC.filter((x) => new URL(x.url).pathname === '/api/device' && x.method === 'POST').map((x) => { try { return JSON.parse(x.body || '{}'); } catch (_) { return {}; } });
const hubCall = (method, path, body) => G.p.evaluate(async ({ method, path, body }) => {
  const h = { Accept: 'application/json' };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (method !== 'GET' && !/^\/api\/(pigeon|weather|fitness|markets)\//.test(path)) h['X-Inflite'] = '1';
  try {
    const r = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store', headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
    let j = null; try { j = await r.json(); } catch (_) {}
    return { s: r.status, j };
  } catch (e) { return { s: 0, j: { error: String(e) } }; }
}, { method, path, body });
const textOf = (sel) => G.p.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ').trim() || '', sel);
const toastSaid = (re, ms = 8000) => until(() => G.p.evaluate((src) => [...document.querySelectorAll('.ifl-toast, .toast')].map((t) => t.innerText.replace(/\s+/g, ' ')).find((t) => new RegExp(src).test(t)) || null, re.source), ms);
// (Chats signed in at the hub by the one trip, Chat first: /chats/#signin-start&then=/; a Chat from before the hub has
// its welcome's Sign In instead)
async function chatsSignIn() {
  await G.p.goto(`${HUB}/chats/#signin-start&then=/`);
  const first = await Promise.race([
    G.p.waitForURL((u) => /^(account|auth)\./.test(u.hostname), { timeout: 30000 }).then(() => 'account'),
    G.p.waitForSelector('.welcome [data-act=acctsignin]', { state: 'visible', timeout: 30000 }).then(() => 'welcome'),
  ]).catch(() => null);
  if (first === 'welcome') await G.p.click('.welcome [data-act=acctsignin]');
  await onAccountPage(G.p, { email: 'george@example.com' }).catch((e) => console.log('DEBUG sign-in', e.message));
  await G.p.waitForURL((u) => u.host === 'ifl.test:8788', { timeout: 60000 }).catch(() => {});
  if (await G.p.waitForSelector('#city, [data-act=onbdone]', { state: 'attached', timeout: 6000 }).catch(() => null)) {
    if (await G.p.$('#city')) await G.p.selectOption('#city', 'London').catch(() => {});
    await G.p.click('[data-act=onbdone]', { timeout: 10000 }).catch(() => {});
  }
  const got = await until(() => sessAt(G.p), 30000);
  // (wherever a sign-in that couldn't finish left the window, back at the hub for what follows)
  if (!got && new URL(G.p.url()).host !== 'ifl.test:8788') await G.p.goto(`${HUB}/`).catch(() => {});
  return got;
}
// (where Chats couldn't be signed in at the hub, and that's failed already: Chat's own sign-in for its API, handed back by
// the account from this phone's cookie as hubserve.mjs does, so the steps after it still run and say what they find)
async function bearerFromCookie() {
  const jar = (await G.ctx.cookies()).find((c) => c.name === 'account' || c.name === '__Secure-account');
  if (!jar) return null;
  const word = randomBytes(32).toString('base64url');
  const code = await hostCall('auth.ifl.test', '/api/account/handback', { app: 'inflight', ask: createHash('sha256').update(word).digest('base64url'), box: 'x'.repeat(48) }, { cookie: `${jar.name}=${jar.value}` });
  const r = code.s === 200 ? await hostCall('chat.ifl.test', '/api/pigeon/handback', { code: code.j.code, verifier: word }) : null;
  console.log('(Chats not signed in at the hub: Chat’s API from here with a sign-in the account handed back from the cookie)', code.s, r?.s);
  return r?.j?.token ? { token: r.j.token, id: r.j.me?.id } : null;
}
// (the tables the old installs' rows go in, as their modules make them; each module's own setup is IF NOT EXISTS too)
function tables() {
  run(`CREATE TABLE IF NOT EXISTS td_push (endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, session TEXT, added INTEGER NOT NULL, fails INTEGER NOT NULL DEFAULT 0, ok_at INTEGER)`);
  run(`CREATE TABLE IF NOT EXISTS mk_push (endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, added INTEGER NOT NULL, session TEXT, fails INTEGER NOT NULL DEFAULT 0)`);
  run(`CREATE TABLE IF NOT EXISTS wx_subs (id TEXT PRIMARY KEY, endpoint TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL, name TEXT, rain INTEGER NOT NULL DEFAULT 0, brief INTEGER NOT NULL DEFAULT 0, brief_at TEXT,
    units TEXT, tz_off INTEGER, last_rain INTEGER, last_brief TEXT, created INTEGER, updated INTEGER, fails INTEGER NOT NULL DEFAULT 0, last_ok INTEGER)`);
  for (const c of ['warn INTEGER NOT NULL DEFAULT 0', 'told TEXT', 'dev TEXT']) run(`ALTER TABLE wx_subs ADD COLUMN ${c}`, true);
  run(`CREATE TABLE IF NOT EXISTS wx_devs (dev TEXT PRIMARY KEY, endpoint TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, user_id TEXT, label TEXT, units TEXT, brief_at TEXT, created INTEGER, updated INTEGER)`);
  for (const c of ['net TEXT', 'sess TEXT']) run(`ALTER TABLE wx_devs ADD COLUMN ${c}`, true);
}
// (a Weather device and its place, as Weather keeps a signed-in phone's)
function weatherDevice(dev, sub, userId, sess, label) {
  run(`INSERT OR REPLACE INTO wx_devs (dev, endpoint, p256dh, auth, user_id, label, created, updated, sess) VALUES ('${dev}', '${sub.endpoint}', '${sub.p256dh}', '${sub.auth}', '${userId}', '${esc(label)}', ${Date.now()}, ${Date.now()}, '${sess}')`);
  run(`INSERT OR REPLACE INTO wx_subs (id, endpoint, p256dh, auth, lat, lon, name, rain, warn, dev, created, updated) VALUES ('${dev}-ldn', '${sub.endpoint}', '${sub.p256dh}', '${sub.auth}', 51.51, -0.13, 'London', 1, 1, '${dev}', ${Date.now()}, ${Date.now()})`);
}

// ======================================================================================================================
step(0, 'an old Today install with a Weather device: Chat’s first hand-back at the hub keeps both', '§11.3, §11.6, §14.3');
// ======================================================================================================================
await makeAccount(G.p, `${ACCT}/`, { name: 'George Farrow', handle: 'george', email: 'george@example.com' });
const GID = rows("SELECT id FROM pg_users WHERE handle = 'george'")[0]?.id;
// the sign-in this browser has (the account's cookie, on the whole site), as Today's install always had it
const jar = (await G.ctx.cookies()).find((c) => c.name === 'account' || c.name === '__Secure-account');
const S1 = (jar && rows(`SELECT hash FROM pg_sessions WHERE site_hash = '${hex(jar.value)}'`)[0]?.hash) || rows(`SELECT hash FROM pg_sessions WHERE user_id = '${GID}' ORDER BY created_at DESC LIMIT 1`)[0]?.hash;
ok(!!GID && !!S1, 'George’s account, made on the account’s page; this browser signed in to it (the site’s cookie)', JSON.stringify({ GID, S1: !!S1 }));
// Today, on this phone's Home Screen since before: its morning to this phone (td_push), and a Weather device signed in on the
// same sign-in (wx_devs.sess)
await G.p.goto(`${HUB}/`);
const r0 = await hubCall('GET', '/api/session');
ok(r0.s === 200 && r0.j?.signedIn === true, 'Today at the hub: signed in by the cookie', `${r0.s} ${js(r0.j, 120)}`);
tables();
const oldToday = await oldSub('oldtoday'), oldWeather = await oldSub('oldweather');
run(`INSERT OR REPLACE INTO td_push (endpoint, user_id, p256dh, auth, session, added) VALUES ('${oldToday.endpoint}', '${GID}', '${oldToday.p256dh}', '${oldToday.auth}', '${S1}', ${Date.now()})`);
weatherDevice('oldwx-1', oldWeather, GID, S1, 'iPhone');
// Chats, signed in by the one trip: Chat's first hand-back
let gs = await chatsSignIn();
ok(!!gs?.token && gs.id === GID, 'Chats signed in at the hub (Chat’s first hand-back)', G.p.url());
if (!gs?.token) gs = await bearerFromCookie();
const live = rows(`SELECT hash FROM pg_sessions WHERE user_id = '${GID}'`).map((x) => x.hash);
const td0 = rows(`SELECT session FROM td_push WHERE endpoint = '${oldToday.endpoint}'`)[0];
const wx0 = rows(`SELECT user_id, sess FROM wx_devs WHERE dev = 'oldwx-1'`)[0];
ok(!!td0 && live.includes(td0.session), 'Today’s subscription still there, on a sign-in that’s live (td_push follows the hand-back)', JSON.stringify({ td0, S1Live: live.includes(S1) }));
ok(wx0?.user_id === GID && live.includes(wx0.sess), 'the Weather device still the account’s, on the live sign-in (wx_devs.sess moved with it)', JSON.stringify(wx0));
await tickAt('/api/weather/tick');
const wx1 = rows(`SELECT user_id FROM wx_devs WHERE dev = 'oldwx-1'`)[0];
ok(wx1?.user_id === GID, 'and after Weather’s turn (ended sign-ins let go), still linked', JSON.stringify(wx1));

// ---- Mira, a friend, on Chat's own address; George's apps ----
// (a phone, as Chat wants one: it doesn't open on a computer)
const mctx = await (await K.hubBrowser()).newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-GB', timezoneId: 'Europe/London',
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' });
const M = { ctx: mctx, p: await mctx.newPage(), name: 'mira' };
M.p.on('pageerror', (e) => errs.push(`mira: ${e}`));
await joinChat(M.p, CHAT + '/', { name: 'Mira Okafor', handle: 'mira', email: 'mira@example.com', city: 'Norwich' });
Object.assign(M, await sessAt(M.p));
await api(gs.token, 'friends', { handle: 'mira' });
await api(M.token, 'friends-respond', { id: GID, accept: true });
await M.p.reload();
ok(!!M.id && rows(`SELECT status FROM pg_links WHERE (a = '${GID}' AND b = '${M.id}') OR (a = '${M.id}' AND b = '${GID}')`)[0]?.status === 'ok', 'Mira, on Chat’s own address, George’s friend');
let r = await hubCall('GET', '/api/weather/me');
r = await hubCall('PUT', '/api/weather/me', { base: r.j?.ver || 0, data: { places: [{ name: 'London', lat: 51.51, lon: -0.13 }], settings: {}, notify: { places: [{ name: 'London', lat: 51.51, lon: -0.13, rain: true, warn: true }], brief: null, briefAt: '07:00' } } });
const h = await hubCall('PUT', '/api/markets/holding', { symbol: 'TSCO.L', qty: 50 });
const a = await hubCall('PUT', '/api/markets/alert', { symbol: 'TSCO.L', on: true, pct: 3 });
ok(r.s === 200 && h.s === 200 && a.s === 200, 'George’s Weather place (rain and warnings wanted) and Tesco with a 3% alert, through the hub', `${r.s} ${h.s} ${a.s}`);

// ======================================================================================================================
step(1, 'On This Phone on, in You: Today’s morning only', '§10, §11.3');
// ======================================================================================================================
await G.p.goto(`${HUB}/#you`);
await G.p.waitForSelector('#you #youPhone', { timeout: 30000 }).catch(() => {});
await wait(1500);
ok(!deviceCalls().length, 'nothing posted to /api/device on first run, before any tap', JSON.stringify(deviceCalls()));
await shot(G, '1-you');
await G.p.click('#you #youPhoneRow').catch(() => G.p.click('#you #youPhone').catch(() => {}));
const td = await until(() => rows(`SELECT session FROM td_push WHERE endpoint = '${endpointOf('george')}' AND user_id = '${GID}'`)[0], 15000);
const others = () => ['pg_push', 'mk_push', 'wx_devs'].flatMap((t) => rows(`SELECT '${t}' AS t FROM ${t} WHERE endpoint = '${endpointOf('george')}'`).map((x) => x.t));
ok(!!td && !others().length, 'Allow: td_push only (Today’s morning)', JSON.stringify({ td, others: others() }));
ok(deviceCalls().length === 1 && deviceCalls()[0].fan === undefined && deviceCalls()[0].sub?.endpoint === endpointOf('george'), 'its request: the subscription, no fan', JSON.stringify(deviceCalls()));

// ======================================================================================================================
step(2, 'Get Every App’s Here: one endpoint in every app’s table, via the hub', '§10, §11.3');
// ======================================================================================================================
await G.p.waitForSelector('#you #youEvery', { timeout: 15000 }).catch(() => {});
await G.p.click('#you #youEvery').catch(() => {});
ok(await G.p.waitForSelector('#sh-every #evGo', { state: 'visible', timeout: 10000 }).then(() => true, () => false), 'the sheet: what changes, and the one button');
ok(/Chats, Weather and Markets will notify you here as well/.test(await textOf('#sh-every')), '“Chats, Weather and Markets will notify you here as well”', await textOf('#sh-every'));
await shot(G, '2-every');
await G.p.click('#sh-every #evGo').catch(() => {});
await until(() => rows(`SELECT endpoint FROM pg_push WHERE endpoint = '${endpointOf('george')}'`)[0], 15000);
const fan = deviceCalls().at(-1);
ok(deviceCalls().length === 2 && fan?.fan === true, 'sent from that tap: { sub, fan: true }', js(fan, 160));
const ep = endpointOf('george');
const pg = rows(`SELECT user_id, session, via FROM pg_push WHERE endpoint = '${ep}'`), mk = rows(`SELECT user_id, via FROM mk_push WHERE endpoint = '${ep}'`);
const wd = rows(`SELECT dev, user_id, sess, via FROM wx_devs WHERE endpoint = '${ep}'`), ws = wd[0] ? rows(`SELECT name, warn FROM wx_subs WHERE dev = '${wd[0].dev}'`) : [];
const liveNow = rows(`SELECT hash FROM pg_sessions WHERE user_id = '${GID}'`).map((x) => x.hash);
ok(pg.length === 1 && pg[0].user_id === GID && liveNow.includes(pg[0].session) && pg[0].via === 'hub', 'Chat’s: pg_push, this sign-in, via the hub', JSON.stringify(pg));
ok(mk.length === 1 && mk[0].user_id === GID && mk[0].via === 'hub', 'Markets’: mk_push, via the hub', JSON.stringify(mk));
ok(wd.length === 1 && wd[0].user_id === GID && liveNow.includes(wd[0].sess) && wd[0].via === 'hub' && ws.some((x) => x.name === 'London' && x.warn === 1), 'Weather’s: one wx_devs row (this sign-in, via the hub), with London’s place', JSON.stringify({ wd, ws }));
ok(!!rows(`SELECT endpoint FROM td_push WHERE endpoint = '${ep}'`)[0] && !rows(`SELECT endpoint FROM fx_push WHERE endpoint = '${ep}'`).length, 'Today’s still; Fitness’s not (its line is in Today’s morning)');
ok(/every app notifies here/i.test(await textOf('#youNotify')) && !(await G.p.$('#youEvery')), 'Notifications says every app notifies here now', await textOf('#youNotify'));
// (remembered: on this phone for this account; and where the account's lost Chat's row (a sign-in that ended takes it),
// You sends it again by itself, the row never coming back)
ok(await G.p.evaluate((id) => localStorage.getItem('today:every') === id, GID), 'the tap remembered on this phone, for this account');
run(`DELETE FROM pg_push WHERE endpoint = '${ep}'`);
const fansBefore = deviceCalls().filter((x) => x.fan === true).length;
await G.p.goto(`${HUB}/#you`); await G.p.waitForSelector('#you #youPhone', { timeout: 30000 }).catch(() => {});
const back = await until(() => rows(`SELECT via FROM pg_push WHERE endpoint = '${ep}'`)[0], 15000);
ok(back?.via === 'hub' && deviceCalls().filter((x) => x.fan === true).length === fansBefore + 1, 'Chat’s row lost: sent again by itself, once, via the hub', JSON.stringify({ back, fans: deviceCalls().filter((x) => x.fan === true).length - fansBefore }));
await wait(800);
ok(/every app notifies here/i.test(await textOf('#youNotify')) && !(await G.p.$('#youEvery')), 'and Get Every App’s Here never back to tap', await textOf('#youNotify'));

// ======================================================================================================================
step(3, 'a Chat message, a Markets alert and the morning: each pushed, opened, saying its app', '§11.3, §11.4');
// ======================================================================================================================
let since = Date.now();
await K.openChat(M, GID);
await M.p.fill('#msg', 'Are you about later?'); await M.p.click('.send');
const chat = await until(async () => (await pushesSince('george', since)).find((x) => x.app === 'chat'), 15000);
ok(!!chat && /Mira|message/i.test(`${chat.title} ${chat.body}`) && !/Are you about later/.test(JSON.stringify(chat)), 'Mira’s message: a push to this phone, app chat, no words', js(chat, 200));
since = Date.now();
await fetch('http://127.0.0.1:8801/mode', { method: 'POST', body: JSON.stringify({ bump: { 'TSCO.L': 3.4 } }) }).catch(() => {});
const mt = await tickAt('/api/markets/tick', 'finance.ifl.test:8788');
const mkt = await until(async () => (await pushesSince('george', since)).find((x) => x.app === 'markets'), 15000);
ok(!!mkt && /Tesco/.test(`${mkt.title} ${mkt.body}`), 'Tesco past its alert: a push, app markets', `${JSON.stringify(mt.j)} ${js(mkt, 200)}`);
since = Date.now();
const lon = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()).split(':').map(Number);
const m = await hubCall('PUT', '/api/morning', { on: true, at: Math.floor((lon[0] * 60 + lon[1]) / 5) * 5, tz: 'Europe/London', lines: { weather: true, fitness: true, chat: true, markets: true } });
const tt = await tickAt('/api/today/tick');
const morning = await until(async () => (await pushesSince('george', since)).find((x) => x.app === 'today'), 15000);
ok(m.s === 200 && !!morning, 'the morning: a push, app today', `${m.s} ${JSON.stringify(tt.j)} ${js(morning, 200)}`);
const mine = (await opened()).filter((x) => x.name === 'george');
ok(mine.length >= 3 && !mine.some((x) => x.undecrypted) && mine.every((x) => ['chat', 'markets', 'today', 'weather', 'fitness'].includes(x.app)), 'every push to this phone opened with its keys, each naming its app', JSON.stringify(mine.map((x) => x.app)));

// ======================================================================================================================
step(4, 'the root worker’s pulse: Mira’s tick turns delivered with no Chat open', '§11.4');
// ======================================================================================================================
await G.p.goto(`${HUB}/weather/`);
await G.p.waitForLoadState('load');
// (a friend's messages in a row buzz you once in ten seconds: this one past that, so it has its own push)
const lastMira = Number(rows(`SELECT MAX(sent_at) AS t FROM pg_msgs WHERE sender = '${M.id}'`)[0]?.t || 0);
if (lastMira + 11e3 > Date.now()) await wait(lastMira + 11e3 - Date.now());
since = Date.now();
await M.p.fill('#msg', 'Back at six'); await M.p.click('.send');
const msg = await until(() => rows(`SELECT id, got_at FROM pg_msgs WHERE sender = '${M.id}' AND recipient = '${GID}' ORDER BY sent_at DESC LIMIT 1`)[0], 10000);
const push = await until(async () => (await pushesSince('george', since)).find((x) => x.app === 'chat'), 15000);
ok(!!msg && msg.got_at == null && !!push, 'Mira writes again: its push sent, and not delivered yet (no Chat open on George’s phone)', JSON.stringify(msg));
// the push handed to the root worker, as the browser hands it one (DevTools' Push: ServiceWorker.deliverPushMessage)
const cdp = await G.ctx.newCDPSession(G.p), regs = new Map();
cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => { for (const x of e.registrations || []) if (!x.isDeleted) regs.set(x.scopeURL, x.registrationId); });
await cdp.send('ServiceWorker.enable').catch(() => {});
const reg = await until(async () => regs.get(`${HUB}/`), 10000);
const T4 = Date.now();
const { name: _n, at: _a, ...payload } = push || {};
const delivered = reg ? await cdp.send('ServiceWorker.deliverPushMessage', { origin: HUB, registrationId: reg, data: JSON.stringify(payload) }).then(() => true, (e) => { console.log('DEBUG push', e.message); return false; }) : false;
ok(delivered, 'the push given to InFlite’s root worker (scope /)', JSON.stringify([...regs.keys()]));
const got = await until(() => rows(`SELECT got_at FROM pg_msgs WHERE id = '${msg?.id}'`)[0]?.got_at, 15000);
const pulse = passed(T4).find((x) => x.port === 8792 && x.method === 'POST' && x.path.startsWith('/api/pigeon/pulse') && x.auth);
ok(!!got && !!pulse, 'the root worker’s one pulse, with the sign-in Chat keeps here: delivered (pg_msgs.got_at)', JSON.stringify({ got, pulse }));
const tk = await until(() => M.p.evaluate(() => { const s = [...document.querySelectorAll('.msgs .mt .tk')].at(-1)?.dataset.st; return s === 'delivered' || s === 'read' ? s : null; }), 25000);
ok(!!tk, 'and on Mira’s phone, her tick turns delivered', String(tk));
await M.p.screenshot({ path: `${out}/4-mira-delivered.png` }).catch(() => {});

// ======================================================================================================================
step(5, 'a notification tapped with Chats open: the chat, in the same window', '§11.4, §3.6');
// ======================================================================================================================
await G.p.goto(`${HUB}/chats/`);
await G.p.waitForLoadState('load'); await wait(2000);
const pages0 = G.pages.length;
const sw = await until(async () => G.ctx.serviceWorkers().find((w) => w.url() === `${HUB}/sw.js`), 10000);
// (the worker's own notificationclick, for the notification it showed (or, where this browser keeps none, one with the
// same data): the tap itself is the phone's, the rest is the worker's)
const shown = sw ? await sw.evaluate(async (url) => {
  const n = (await self.registration.getNotifications()).find((x) => x.data?.app === 'chat');
  const ev = new Event('notificationclick');
  Object.defineProperty(ev, 'notification', { value: n || { data: { app: 'chat', url }, close() {} } });
  let job = null; ev.waitUntil = (p) => { job = p; };
  self.dispatchEvent(ev);
  await job;
  return n ? 'shown' : 'stand-in';
}, push?.url || `/pigeon/#open=${M.id}`).catch((e) => `error ${e.message}`) : 'no worker';
console.log('the notification tapped:', shown);
const opened5 = await G.p.waitForFunction((id) => location.pathname === '/chats/' && (location.hash.includes(`open=${id}`) || !!document.querySelector('#msg')), M.id, { timeout: 15000 }).then(() => true, () => false);
const chatShown = opened5 && await G.p.waitForSelector('#msg', { timeout: 15000 }).then(() => true, () => false);
ok(opened5 && chatShown && new URL(G.p.url()).host === 'ifl.test:8788', 'tapped: Mira’s chat (/chats/#open=…), in the window that was open', `${G.p.url()} (${shown})`);
ok(G.pages.length === pages0 && G.pages.length === 1 && !(await G.p.evaluate(() => window.__opened?.length || 0)), 'one window: nothing opened beside it', String(G.pages.length));
await shot(G, '5-tapped');

// ======================================================================================================================
step(6, 'Stop There for an old sign-in: only its rows go, Weather’s included; nothing signed out', '§10, §11.3');
// ======================================================================================================================
// two old sign-ins of George's: an iPad (Chat, Markets, Today and Weather on it) and a Mac (Chat only)
const IPAD = 'old-ipad-' + Date.now(), MAC = 'old-mac-' + Date.now();
run(`INSERT INTO pg_sessions (hash, user_id, created_at, seen_at, label) VALUES ('${hex(IPAD)}', '${GID}', ${Date.now() - 30 * 864e5}, ${Date.now() - 864e5}, 'iPad · Safari'), ('${hex(MAC)}', '${GID}', ${Date.now() - 20 * 864e5}, ${Date.now() - 864e5}, 'Mac · Chrome')`);
const ip = { chat: await oldSub('ipadchat'), mkt: await oldSub('ipadmarkets'), today: await oldSub('ipadtoday'), wx: await oldSub('ipadweather') }, mac = await oldSub('macchat');
run(`INSERT INTO pg_push (endpoint, user_id, session, p256dh, auth, created_at) VALUES ('${ip.chat.endpoint}', '${GID}', '${hex(IPAD)}', '${ip.chat.p256dh}', '${ip.chat.auth}', ${Date.now()}), ('${mac.endpoint}', '${GID}', '${hex(MAC)}', '${mac.p256dh}', '${mac.auth}', ${Date.now()})`);
run(`INSERT INTO mk_push (endpoint, user_id, p256dh, auth, added, session) VALUES ('${ip.mkt.endpoint}', '${GID}', '${ip.mkt.p256dh}', '${ip.mkt.auth}', ${Date.now()}, '${hex(IPAD)}')`);
run(`INSERT INTO td_push (endpoint, user_id, p256dh, auth, session, added) VALUES ('${ip.today.endpoint}', '${GID}', '${ip.today.p256dh}', '${ip.today.auth}', '${hex(IPAD)}', ${Date.now()})`);
weatherDevice('ipadwx-1', ip.wx, GID, hex(IPAD), 'iPad');
await G.p.goto(`${HUB}/#you`);
const rowSel = '#youDevices .row.dev';
ok(await G.p.waitForSelector(rowSel, { timeout: 20000 }).then(() => true, () => false), 'You: Other Devices');
const list = await textOf('#youDevices');
ok(/iPad/.test(list) && /Mac/.test(list) && /Weather/.test(list), 'the iPad (Weather among its apps) and the Mac, each with Stop There', list);
await shot(G, '6-devices');
await G.p.locator(rowSel, { hasText: 'iPad' }).locator('[data-stop]').click().catch(() => {});
ok(!!(await toastSaid(/Stopped there/)), '“Stopped there”');
const left = (t, col, val) => rows(`SELECT COUNT(*) AS n FROM ${t} WHERE ${col} = '${val}'`)[0]?.n;
const gone = await until(async () => left('pg_push', 'session', hex(IPAD)) === 0 && left('mk_push', 'session', hex(IPAD)) === 0 && left('td_push', 'session', hex(IPAD)) === 0
  && left('wx_devs', 'sess', hex(IPAD)) === 0 && left('wx_subs', 'dev', 'ipadwx-1') === 0, 10000);
ok(gone, 'the iPad’s rows gone from every app’s table: Chat’s, Markets’, Today’s, and Weather’s device with its place', JSON.stringify(['pg_push', 'mk_push', 'td_push'].map((t) => [t, left(t, 'session', hex(IPAD))]).concat([['wx_devs', left('wx_devs', 'sess', hex(IPAD))], ['wx_subs', left('wx_subs', 'dev', 'ipadwx-1')]])));
ok(left('pg_push', 'session', hex(MAC)) === 1 && left('pg_push', 'endpoint', ep) === 1 && left('mk_push', 'endpoint', ep) === 1 && left('wx_devs', 'endpoint', ep) === 1 && left('td_push', 'endpoint', ep) === 1,
  'the Mac’s, and this phone’s in every table, untouched');
ok(left('pg_sessions', 'hash', hex(IPAD)) === 1, 'and the iPad still signed in: Stop There signs nothing out');
const after = await until(async () => { const t = await textOf('#youDevices'); return /iPad/.test(t) ? null : t || '(none)'; }, 8000);
ok(/iPad/.test(list) && !!after, 'the iPad gone from the list', after || await textOf('#youDevices'));

console.log('notes (page errors, for the batches):', JSON.stringify(errs.slice(0, 8)));
await G.ctx.close().catch(() => {}); await M.ctx.close().catch(() => {});
await (await K.hubBrowser()).close().catch(() => {});
await K.b.close();
console.log(`FAILS ${K.fails()}`);
process.exit(0);
