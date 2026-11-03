// needs: hub
// Sending any card from the hub's pages (Today First, spec §8.2, §8.3, §14.3): George at the hub (ifl.test:8788), Pat and
// Leo on Chat's own address (chat.ifl.test), one database. Each card goes through Chat's engine (/chats/?engine=1 in a
// frame of the page): its send sheet over the page, in the same document (no navigation, one window), "Sent to Pat.
// You're still here", then on the friend's phone with When Sent and Now.
//   - from Today: the weather to Pat, a stock to Pat (percent only, in every word drawn and in the payload as Pat's phone
//     opens it), the ride planned with Leo to Pat, the finished ride to Leo in one tap (IFLChat.sendTo, from a tap on
//     the page); IFLChat.sendTo called from a script with no tap is refused, even when the script says it was tapped;
//   - what's waiting for George, as Today asks the engine (waiting, since): Pat's words, the stock she named, her
//     group's, nothing marked read or kept; Write More in the Chat from the engine's sheet (the card handed over alone);
//   - from Weather's and Markets' pages at the hub: the same sheet;
//   - a group as a target;
//   - the engine not ready: Chats' own sheet by the back= navigation, and back on Today with the toast; Chats locked,
//     and the key state for real (signed in to InFlite, no Chat key on the phone): Send goes the back= way;
//   - the card's links at the hub: /weather/?lat&lon (no place by name) and /markets/#s=, in the same window;
//   - privacy: for each exact string sent (the words typed, the place on a card), a before/after diff of every table of
//     the database finds it in no new or changed row outside a sealed ct, and no request body or URL recorded from any
//     frame of any phone holds it.
import http from 'node:http';
import { execSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { kit } from './lib.mjs';
import { makeAccount, joinChat, onAccountPage } from './join.mjs';
import { packCard } from '../../pigeon/cards.js';

const [,, S, out] = process.argv;
execSync(`${S}/restartkeep.sh`, { env: { ...process.env, PIGEONS: '0' }, stdio: 'ignore' });
const K = await kit(S, out);
const { ok, one, api, HUB, errs } = K;
const CHAT = 'http://chat.ifl.test:8788', ACCT = 'http://account.ifl.test:8788';
const MIN = 60e3, H = 3600e3;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 15000, step = 400) => { const end = Date.now() + ms; for (;;) { const v = await Promise.resolve().then(f).catch(() => null); if (v || Date.now() > end) return v; await wait(step); } };
const js = (x, n = 240) => String(JSON.stringify(x) ?? x).slice(0, n);
const shot = (ph, name) => ph.p.screenshot({ path: `${out}/${name}.png` }).catch(() => {});
http.createServer((q, s) => { const r = http.request({ host: '127.0.0.1', port: 8796, path: q.url, method: q.method, headers: q.headers }, (x) => { s.writeHead(x.statusCode, x.headers); x.pipe(s); }); r.on('error', () => { s.writeHead(502); s.end(); }); q.pipe(r); }).listen(8794, '127.0.0.1');
await fetch('http://127.0.0.1:8796/mode', { method: 'POST', body: JSON.stringify({ speed: 0, pattern: 'share-wet' }) });

// ---- every table's rows, read straight from the local database (read only), for the before/after diff ----
const DB_DIR = `${S}/wrstate/v3/d1/miniflare-D1DatabaseObject`;
const dbFile = () => readdirSync(DB_DIR).filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite').map((f) => `${DB_DIR}/${f}`)[0];
function snapshot() {
  const db = new DatabaseSync(dbFile(), { readOnly: true }), out = new Map();
  try {
    for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all()) {
      let rows = []; try { rows = db.prepare(`SELECT * FROM "${name}"`).all(); } catch (_) {}
      out.set(name, new Set(rows.map((r) => JSON.stringify(r, (k, v) => (typeof v === 'bigint' ? Number(v) : v instanceof Uint8Array ? `<${v.length} bytes>` : v)))));
    }
  } finally { db.close(); }
  return out;
}
// (a row's text with its sealed parts taken out: a letter's ct, a group letter's body and its keys, a delivery's wrap)
const SEALED = new Set(['ct', 'body', 'keys', 'wrap', 'key', 'via_ct', 'viact', 'pins', 'box', 'vault']);
const openPart = (row) => { try { const o = JSON.parse(row); for (const k of Object.keys(o)) if (SEALED.has(k)) delete o[k]; return JSON.stringify(o); } catch (_) { return row; } };

// ---- every request URL (without its #, which never leaves the phone) and body, from every frame of every phone ----
const seen = [];
const record = (ctx, who) => ctx.on('request', (r) => { let u = r.url(); try { const x = new URL(u); x.hash = ''; u = x.href; } catch (_) {} seen.push({ who, url: u, body: r.postData() || '' }); });

const sessAt = (page) => page.evaluate(() => new Promise((res) => {
  try {
    const r = indexedDB.open('inflight');
    r.onupgradeneeded = () => { r.transaction.abort(); res(null); };
    r.onerror = () => res(null);
    r.onsuccess = () => { try { const g = r.result.transaction('kv').objectStore('kv').get('session'); g.onsuccess = () => res(g.result?.token ? { token: g.result.token, id: g.result.me?.id } : null); g.onerror = () => res(null); } catch (_) { res(null); } };
  } catch (_) { res(null); }
})).catch(() => null);
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
async function chatPhone(name) {
  const ctx = await (await K.hubBrowser()).newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-GB', timezoneId: 'Europe/London', userAgent: ANDROID });
  record(ctx, name);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${name}: ${e}`));
  await p.goto(CHAT + '/');
  return { p, ctx, name };
}
const reloadChat = async (ph) => { await ph.p.reload(); await ph.p.waitForSelector('.tabs', { timeout: 30000 }).catch(() => {}); await wait(700); };

// ---- George at the hub (the one trip), Pat and Leo at Chat's own address, a group of the three ----
const G = await K.hubPhone('george', await K.makeKeys());
record(G.ctx, 'george');
// (George's page errors with the page they came on: Chat's pages and its engine are this test's; the others' are noted)
const gErrs = []; G.p.on('pageerror', (e) => gErrs.push({ at: G.p.url(), e: String(e), stack: String(e?.stack || '') }));
await makeAccount(G.p, `${ACCT}/`, { name: 'George Farrow', handle: 'george', email: 'george@example.com' });
await G.p.goto(`${HUB}/chats/#signin-start&then=/`);
await onAccountPage(G.p, { email: 'george@example.com' }).catch((e) => console.log('DEBUG sign-in', e.message));
await G.p.waitForURL((u) => u.host === 'ifl.test:8788' && u.pathname === '/', { timeout: 60000 }).catch(() => {});
const gs = await until(() => sessAt(G.p), 20000), GID = gs?.id;
ok(!!gs?.token, 'George: Chats signed in at the hub (the one trip)', G.p.url());
// (Chat's first open here asks where you are: London)
await G.p.goto(`${HUB}/chats/`);
if (await G.p.waitForSelector('#city', { state: 'attached', timeout: 15000 }).catch(() => null)) { await G.p.selectOption('#city', 'London').catch(() => {}); await G.p.click('[data-act=onbdone]', { timeout: 15000 }).catch(() => {}); }
const [P, L] = await Promise.all(['pat', 'leo'].map(chatPhone));
await Promise.all([[P, 'Pat Reed', 'pat', 'London'], [L, 'Leo Marsh', 'leo', 'London']].map(([ph, name, handle, city]) => joinChat(ph.p, CHAT + '/', { name, handle, email: `${handle}@example.com`, city })));
for (const ph of [P, L]) Object.assign(ph, await sessAt(ph.p));
for (const ph of [P, L]) { await api(gs.token, 'friends', { handle: ph.name }); await api(ph.token, 'friends-respond', { id: GID, accept: true }); }
const GRP = (await api(gs.token, 'groups', { name: 'Weekend', members: [P.id, L.id] }))[1]?.group?.id;
ok(!!(P.id && L.id && GRP), 'Pat and Leo at Chat’s own address; a group of the three', js([P.id, L.id, GRP]));

const day = new Date().toISOString().slice(0, 10);
const PLACE = 'Cley next the Sea';
const cards = {
  weather: { v: 1, kind: 'weather', from: 'today', at: Date.now() - MIN, say: `Rain later in ${PLACE}.`, snap: { place: PLACE, tz: 'Europe/London', temp: 11.6, feels: 9.8, code: 61, isDay: true, hi: 13, lo: 7, rain: { now: false, at: Date.now() + 2 * H }, spell: null }, ref: { cell: [52.95, 1.05] } },
  stock: { v: 1, kind: 'markets', from: 'today', at: Date.now() - MIN, say: 'Tesco is up 1.40% today.', snap: { name: 'Tesco', sym: 'TSCO.L', pct: 1.4, day }, ref: { sym: 'TSCO.L' } },
  ride: { v: 1, kind: 'fitness', from: 'today', at: Date.now() - MIN, say: 'Riding with Leo: Endurance 75.', snap: { day, tz: 'Europe/London', sport: 'ride', name: 'Endurance 75', kind: 'Endurance', secs: 4500, best: { start: Date.now() + 3 * H, end: Date.now() + 5 * H, dry: true }, with: ['Leo'] } },
  done: { v: 1, kind: 'fitness', from: 'today', at: Date.now() - MIN, say: 'Done today: Endurance 75.', snap: { day, tz: 'Europe/London', sport: 'ride', name: 'Endurance 75', kind: 'Endurance', secs: 4500, done: { secs: 4620, dist: 36100, tss: 64 } } },
};
const packed = Object.fromEntries(Object.entries(cards).map(([k, c]) => [k, packCard(c)]));
const TYPED = { weather: 'Rain at three in Cley, bring a coat', stock: 'Look at Tesco go today', ride: 'Fancy joining us Thursday', group: 'Wet weekend coming for us all', back: 'Sent the long way round today', weatherApp: 'From the weather page itself', marketsApp: 'From the markets page itself', more: 'Typed then taken to the chat' };
// (Pat's own words to George and to the group, read by the engine for Today: never anywhere but sealed)
const PAT = { a: 'Tesco is flying today have you seen it', b: 'Are we still on for lunch on Friday', g: 'Who is bringing the flask on Saturday', late: 'Running ten minutes late sorry' };
// (an address as it reaches a server: + and %20 both a space; and each of its query's values)
const dec = (u) => { try { return decodeURIComponent(String(u).replace(/\+/g, ' ')); } catch (_) { return String(u); } };
const params = (u) => { try { return [...new URL(u).searchParams.values()]; } catch (_) { return []; } };
// everything this site keeps on George's phone (localStorage, sessionStorage, every IndexedDB store): its keys, and its
// values as text
const store = () => G.p.evaluate(async () => {
  const keys = [], parts = [];
  for (const [n, st] of [['local', localStorage], ['session', sessionStorage]]) for (let i = 0; i < st.length; i++) { const k = st.key(i); keys.push(`${n}:${k}`); parts.push(st.getItem(k) || ''); }
  for (const { name } of await indexedDB.databases()) {
    const db = await new Promise((res) => { const r = indexedDB.open(name); r.onsuccess = () => res(r.result); r.onerror = () => res(null); });
    if (!db) continue;
    for (const os of db.objectStoreNames) {
      const [ks, vs] = await new Promise((res) => { try { const o = db.transaction(os).objectStore(os), a = o.getAllKeys(), b = o.getAll(); b.onsuccess = () => res([a.result || [], b.result || []]); b.onerror = () => res([[], []]); } catch (_) { res([[], []]); } });
      for (const k of ks) keys.push(`idb:${name}/${os}/${String(k)}`);
      for (const v of vs) { try { parts.push(JSON.stringify(v)); } catch (_) {} }
    }
    db.close();
  }
  return { keys, text: parts.join('\n') };
}).catch(() => ({ keys: [], text: '' }));

// the engine on the page: its frame, and its state as the page sees it
const F = () => G.p.frameLocator('iframe[name="ifl-chat"]');
const engineState = () => G.p.evaluate(() => { try { return document.querySelector('iframe[name=ifl-chat]')?.contentWindow?.IFLChat?.state || null; } catch (_) { return null; } }).catch(() => null);
const toastSaid = (re, ms = 10000) => until(() => G.p.evaluate((src) => [...document.querySelectorAll('.ifl-toast')].map((t) => t.innerText.replace(/\s+/g, ' ')).find((t) => new RegExp(src).test(t)) || null, re.source), ms);
const navs = []; G.p.on('framenavigated', (f) => { if (f === G.p.mainFrame()) navs.push(f.url()); });
// one card sent through the page's IFL.hub.send, picking `to` in the engine's sheet with the words typed
async function sendVia(key, to, typed, { name } = {}) {
  const n0 = navs.length, url0 = G.p.url();
  await G.p.evaluate(({ w, pk }) => { window.__sent = null; window.IFL.hub.send(w, pk).then((r) => { window.__sent = r; }); }, { w: cards[key].say, pk: packed[key] });
  const row = F().locator(`.sheet [data-act=sendpick][data-id="${to}"]`);
  await row.waitFor({ timeout: 30000 });
  const sheetText = (await F().locator('.sheet').innerText().catch(() => '')).replace(/\s+/g, ' ');
  if (typed) await F().locator('#f-sendwords').fill(typed);
  await row.click();
  await F().locator('.sheet [data-act=sendgo]').click();
  const said = await toastSaid(new RegExp(`Sent to ${name}`));
  const res = await until(() => G.p.evaluate(() => window.__sent), 10000);
  return { said, res, sheetText, stayed: navs.length === n0 && G.p.url() === url0 };
}

// ---- 1. Today: the engine there, ready; a script's sendTo with no tap refused, though the script says there was one ----
// (the script is the page's own, run as it opens, never tapped: Playwright's own evaluate counts as a tap, so nothing of
// the test touches the page until the script has said what it got, on the console. It waits until the page truly has no
// activation (read through the browser's own getters, as the engine reads it), then claims one every way a page script
// can: an own userActivation on its navigator, UserActivation's isActive on the page's prototype and on the engine
// frame's, all saying true. The engine reads its own getters, taken as it started, so it's still refused)
const m0 = Number(one(`SELECT COUNT(*) AS n FROM pg_msgs WHERE sender = '${GID}'`)[0]?.n || 0);
await G.ctx.addInitScript(({ to, w, pk }) => {
  if (location.pathname !== '/' || location.hash !== '#notap' || window.top !== window) return;
  const uaGet = Object.getOwnPropertyDescriptor(Navigator.prototype, 'userActivation')?.get;
  const actGet = Object.getOwnPropertyDescriptor(UserActivation.prototype, 'isActive')?.get;
  const realActive = () => { try { return actGet.call(uaGet.call(navigator)); } catch (_) { return null; } };
  const t0 = Date.now(), seen = [];
  const go = () => {
    let fw = null, c = null; try { fw = document.querySelector('iframe[name=ifl-chat]')?.contentWindow || null; c = fw?.IFLChat || null; } catch (_) {}
    const real = realActive(); if (seen.at(-1) !== real) seen.push(real);
    const done = (x) => console.log('notap ' + JSON.stringify({ ...x, seen }));
    if (c && c.state === 'ready' && real === false) {
      const undo = [];
      try { Object.defineProperty(navigator, 'userActivation', { configurable: true, value: { isActive: true, hasBeenActive: true } }); undo.push(() => delete navigator.userActivation); } catch (_) {}
      for (const [where, P] of [['page', window.UserActivation?.prototype], ['engine', fw.UserActivation?.prototype]]) {
        const was = P && Object.getOwnPropertyDescriptor(P, 'isActive');
        try { Object.defineProperty(P, 'isActive', { configurable: true, get: () => true }); undo.push(() => Object.defineProperty(P, 'isActive', was)); } catch (_) { seen.push(`no ${where} prototype`); }
      }
      const claimed = navigator.userActivation?.isActive === true;
      // (in the same turn as the call: the page's own view says tapped, the browser's says not)
      return Promise.resolve(c.sendTo(to, w, pk)).then((r) => { for (const u of undo) try { u(); } catch (_) {} done({ r, claimed, real: false }); },
        (e) => { for (const u of undo) try { u(); } catch (_) {} done({ err: String(e) }); });
    }
    if (Date.now() - t0 < 50000) setTimeout(go, 400); else done({ err: c ? 'the page kept an activation' : 'no engine' });
  };
  setTimeout(go, 400);
}, { to: P.id, w: cards.weather.say, pk: packed.weather });
const notap = new Promise((ok) => { const on = (m) => { if (m.text().startsWith('notap ')) { G.p.off('console', on); ok(JSON.parse(m.text().slice(6))); } }; G.p.on('console', on); setTimeout(() => ok(null), 65000); });
await G.p.goto(`${HUB}/#notap`);
const nt = await notap;
ok(nt?.r?.ok === false && nt.r.why === 'tap' && nt.claimed === true && nt.real === false, '1. IFLChat.sendTo from the page’s own script, no tap, the script claiming one (its navigator and both prototypes): refused', js(nt));
ok(Number(one(`SELECT COUNT(*) AS n FROM pg_msgs WHERE sender = '${GID}'`)[0]?.n || 0) === m0, '1. and nothing sent');
const ready = await until(async () => (await engineState()) === 'ready', 40000);
ok(!!ready, '1. Today: Chat’s engine in its frame, ready', String(await engineState()));

const before = snapshot(), seen0 = seen.length;

// ---- 2. from Today: the weather to Pat ----
const w1 = await sendVia('weather', P.id, TYPED.weather, { name: 'Pat' });
ok(/Sent to Pat/.test(w1.said || '') && /You’re still here/.test(w1.said || ''), '2. the weather to Pat: “Sent to Pat. You’re still here”', w1.said);
ok(w1.stayed && w1.res?.ok === true, '2. in the same document: no navigation, still on Today', js({ navs: navs.slice(-2), res: w1.res }));
await shot(G, '2-sent-weather');
// ---- 3. a stock to Pat: percent only ----
const s1 = await sendVia('stock', P.id, TYPED.stock, { name: 'Pat' });
ok(/Sent to Pat/.test(s1.said || '') && s1.stayed, '3. Tesco to Pat, from Today, staying there', s1.said);
const sheetCard = /Tesco[^]*?(?=Send To|$)/.exec(s1.sheetText)?.[0] || s1.sheetText;
ok(!/[£$€]|\bGBP\b|\bp\b \d/.test(sheetCard) && /1\.40%|\+1\.4%|1\.4%/.test(sheetCard), '3. the sheet’s card: a percentage, no amount', sheetCard.slice(0, 160));
// ---- 4. the ride planned with Leo, to Pat ----
const r1 = await sendVia('ride', P.id, TYPED.ride, { name: 'Pat' });
ok(/Sent to Pat/.test(r1.said || '') && r1.stayed, '4. the ride planned with Leo, to Pat', r1.said);
// ---- 5. the finished ride to Leo, in one tap (a button on the page: its tap is the page's own) ----
await G.p.evaluate(({ to, w, pk }) => {
  const b = document.createElement('button'); b.id = 't-onetap'; b.textContent = 'Send to Leo'; b.style.cssText = 'position:fixed;top:120px;left:20px;z-index:99;padding:16px';
  b.onclick = () => { window.__one = null; window.IFL.hub.chat().then((c) => c.sendTo(to, w, pk)).then((r) => { window.__one = r; }, (e) => { window.__one = { err: String(e) }; }); };
  document.body.append(b);
}, { to: L.id, w: cards.done.say, pk: packed.done });
const l0 = Number(one(`SELECT COUNT(*) AS n FROM pg_msgs WHERE sender = '${GID}' AND recipient = '${L.id}'`)[0]?.n || 0);
await G.p.click('#t-onetap');
const one1 = await until(() => G.p.evaluate(() => window.__one), 20000);
ok(one1?.ok === true && /Leo/.test(one1.say || ''), '5. the finished ride to Leo in one tap: sent, no sheet', js(one1));
ok(Number(one(`SELECT COUNT(*) AS n FROM pg_msgs WHERE sender = '${GID}' AND recipient = '${L.id}'`)[0]?.n || 0) === l0 + 1, '5. one letter to Leo');
ok(/You’re still here/.test((await toastSaid(/Sent to Leo/)) || ''), '5. “Sent to Leo. You’re still here”');
await G.p.evaluate(() => document.getElementById('t-onetap')?.remove());

// ---- 6. a group as a target ----
const g1 = await sendVia('weather', GRP, TYPED.group, { name: 'Weekend' });
ok(/Sent to Weekend/.test(g1.said || '') && g1.stayed, '6. the weather to the group Weekend, from the same sheet', g1.said);
const gm = one(`SELECT COUNT(*) AS n FROM pg_gmsgs WHERE group_id = '${GRP}' AND sender = '${GID}'`)[0];
ok(Number(gm?.n) === 1, '6. one group letter, sealed once for the three', js(gm));

// ---- 6a. what's waiting for George, as Today asks the engine: Pat's words, the Tesco she named, the group's by its id;
// read in memory, nothing marked read, nothing kept on the phone, none of it in a request ----
await reloadChat(P); await K.openChat(P, GID);
for (const t of [PAT.a, PAT.b]) { await P.p.fill('#msg', t); await P.p.click('.send'); await wait(900); }
await K.openChat(P, GRP); await P.p.fill('#msg', PAT.g); await P.p.click('.send'); await wait(900);
await until(() => Number(one(`SELECT COUNT(*) AS n FROM pg_msgs WHERE sender = '${P.id}' AND recipient = '${GID}'`)[0]?.n) >= 2 && Number(one(`SELECT COUNT(*) AS n FROM pg_gmsgs WHERE sender = '${P.id}'`)[0]?.n) >= 1, 15000);
const st0 = await store(), seenW = seen.length;
const wt = await G.p.evaluate(({ ids }) => window.IFL.hub.chat().then((c) => (c ? c.waiting({ ids, stocks: [{ sym: 'TSCO.L', name: 'Tesco' }] }) : 'no engine')), { ids: [P.id, GRP] }).catch((e) => String(e));
const pw = Array.isArray(wt) ? wt.find((x) => x.id === P.id) : null, gw = Array.isArray(wt) ? wt.find((x) => x.id === GRP) : null;
ok(pw?.first === 'Pat' && pw.said.includes(PAT.a) && pw.said.includes(PAT.b), '6a. waiting(): Pat’s own words, from the engine', js(wt, 600));
ok(!!pw?.topics?.some((t) => t.kind === 'markets' && t.sym === 'TSCO.L'), '6a. the Tesco she named, as a topic', js(pw?.topics));
ok(gw?.first === 'Weekend' && gw.said.includes(PAT.g), '6a. and the group’s, asked by its id', js(gw));
const unread = Number(one(`SELECT COUNT(*) AS n FROM pg_msgs WHERE sender = '${P.id}' AND recipient = '${GID}' AND read_at IS NULL`)[0]?.n || 0);
const gunread = Number(one(`SELECT COUNT(*) AS n FROM pg_gdeliv d JOIN pg_gmsgs m ON m.id = d.msg_id WHERE m.sender = '${P.id}' AND d.user_id = '${GID}' AND d.read_at IS NULL`)[0]?.n || 0);
ok(unread >= 2 && gunread >= 1, '6a. nothing marked read (Pat’s letters to George, hers to the group)', js({ unread, gunread }));
const st1 = await store();
const newKeys = st1.keys.filter((k) => !st0.keys.includes(k)), kept = Object.values(PAT).filter((w) => st1.text.includes(w));
ok(!newKeys.length && !kept.length, '6a. nothing kept: no new key in this site’s storage on the phone, and her words in none of it', js({ newKeys, kept }));
// (since: only what she said after t)
const t6 = Date.now(); await wait(1500);
await K.openChat(P, GID); await P.p.fill('#msg', PAT.late); await P.p.click('.send');
const sn = await until(() => G.p.evaluate(({ id, t }) => window.IFL.hub.chat().then((c) => c && c.since(id, t)), { id: P.id, t: t6 }), 15000);
ok(!!sn && sn.said.includes(PAT.late) && !sn.said.includes(PAT.a) && sn.at >= t6, '6a. since(t): only what she said after it', js(sn));
const inReq6 = seen.slice(seenW).filter((r) => r.who === 'george' && Object.values(PAT).some((w) => r.body.includes(w) || dec(r.url).includes(w) || params(r.url).some((v) => v.includes(w))));
ok(!inReq6.length, '6a. and none of her words in any request from George’s phone', js(inReq6));

// ---- 6b. Write More in the Chat, from the engine's sheet: Chats in the page's place, Pat's chat open, the card waiting
// above its box; the words typed in the sheet not carried, the hand-over gone from the tab's storage ----
await G.p.goto(`${HUB}/`); await until(async () => (await engineState()) === 'ready', 40000);
await G.p.evaluate(({ w, pk }) => { window.IFL.hub.send(w, pk); }, { w: cards.weather.say, pk: packed.weather });
const wrow = F().locator(`.sheet [data-act=sendpick][data-id="${P.id}"]`);
await wrow.waitFor({ timeout: 30000 }).catch(() => {});
await F().locator('#f-sendwords').fill(TYPED.more).catch(() => {});
await wrow.click().catch(() => {});
const toChat = G.p.waitForURL((u) => u.pathname === '/chats/', { timeout: 30000 }).then(() => true, () => false);
await F().locator('.sheet [data-act=sendchat]').click().catch(() => {});
const wentChat = await toChat;
await G.p.waitForSelector('.compose .cardatt:not([hidden])', { timeout: 20000 }).catch(() => {});
const wm = await G.p.evaluate(() => ({ who: document.querySelector('.chatnav .chatwho')?.textContent.replace(/\s+/g, ' ') || '', att: document.querySelector('.compose .cardatt:not([hidden])')?.textContent.replace(/\s+/g, ' ') || '',
  msg: document.querySelector('#msg')?.value ?? null, wait: sessionStorage.getItem('ifl-chat-wait') })).catch(() => ({}));
ok(wentChat && /Pat/.test(wm.who) && new RegExp(PLACE).test(wm.att), '6b. Write More in the Chat: Chats, Pat’s chat, the card waiting above its box', js(wm));
ok(wm.msg !== null && !String(wm.msg).includes(TYPED.more) && wm.wait === null, '6b. the words typed in the sheet not carried, and the hand-over gone from the tab’s storage', js(wm));
await G.p.click('[data-act=cardrm]').catch(() => {});

// ---- 7. from Weather's and Markets' pages: the same sheet ----
for (const [path, key, typed, label] of [['/weather/', 'weather', TYPED.weatherApp, 'Weather'], ['/markets/', 'stock', TYPED.marketsApp, 'Markets']]) {
  await G.p.goto(HUB + path, { waitUntil: 'load' });
  await until(() => G.p.evaluate(() => !!window.IFL?.hub?.on), 15000);
  const x = await sendVia(key, P.id, typed, { name: 'Pat' });
  ok(/Sent to Pat/.test(x.said || '') && /You’re still here/.test(x.said || '') && x.stayed && new URL(G.p.url()).pathname === path, `7. from ${label}’s page at the hub: the engine’s sheet, sent, still on ${label}`, js({ said: x.said, url: G.p.url() }));
}
await shot(G, '7-from-markets');

// ---- 8. the engine not ready: Chats' own sheet, by the back= navigation, and back with the toast ----
// (the engine saying it hasn't Chat's key here yet, as one on a phone signed in to InFlite but not to Chats does)
await G.ctx.addInitScript(() => {
  if (location.pathname !== '/chats/' || !/[?&]engine/.test(location.search)) return;
  try { if (localStorage.getItem('t-forcekey') !== '1') return; } catch (_) { return; }
  let real = null;
  Object.defineProperty(window, 'IFLChat', { configurable: true, get: () => (real ? { state: 'key', share: real.share, sendTo: real.sendTo, waiting: real.waiting, since: real.since, refresh: real.refresh, signOut: real.signOut } : undefined), set: (v) => { real = v; } });
});
await G.p.evaluate(() => localStorage.setItem('t-forcekey', '1'));
await G.p.goto(`${HUB}/`);
await G.p.waitForTimeout(1500);
const away = G.p.waitForURL((u) => u.pathname === '/chats/', { timeout: 40000 }).then(() => true, () => false);
await G.p.evaluate(({ w, pk }) => { window.IFL.hub.send(w, pk); }, { w: cards.weather.say, pk: packed.weather });
ok(await away, '8. no engine ready: to Chats’ own sheet, at /chats/ (the back= navigation)', G.p.url());
const pick = G.p.locator(`.sheet [data-act=sendpick][data-id="${P.id}"]`);
await pick.waitFor({ timeout: 30000 }).catch(() => {});
ok(/Once it’s sent, you’re back where you were/.test(await G.p.locator('.sheet').innerText().catch(() => '')), '8. the sheet says you go back once it’s sent');
await G.p.fill('#f-sendwords', TYPED.back);
await pick.click(); await G.p.click('.sheet [data-act=sendgo]');
await G.p.waitForURL((u) => u.pathname === '/' && !u.hash, { timeout: 20000 }).catch(() => {});
const backSaid = await toastSaid(/Sent to Pat/, 10000);
ok(new URL(G.p.url()).pathname === '/' && /You’re still here/.test(backSaid || ''), '8. sent, and back on Today with the toast', js({ url: G.p.url(), backSaid }));
await G.p.evaluate(() => localStorage.removeItem('t-forcekey'));

// ---- 9. on the friends' phones: When Sent and Now; percent only in the stock's payload as Pat's phone opens it ----
await reloadChat(P); await K.openChat(P, GID);
await P.p.waitForSelector('.msgs .cd-card', { timeout: 15000 }).catch(() => {});
await until(async () => (await P.p.locator('.msgs .cd-card').count()) >= 5, 15000);
const pc = await P.p.$$eval('.msgs .cd-card', (cs) => cs.map((c) => c.textContent.replace(/\s+/g, ' ')));
ok(pc.length >= 5 && pc.every((t) => /When sent/i.test(t)), '9. Pat: each card drawn, with When Sent', js(pc.map((t) => t.slice(0, 60)), 600));
ok(pc.some((t) => new RegExp(PLACE).test(t) && /Now · \d\d:\d\d/.test(t)), '9. the weather with Now beside When Sent', js(pc.find((t) => /Cley/.test(t))));
ok(pc.some((t) => /with Leo/.test(t)), '9. the ride: “with Leo”', js(pc.filter((t) => /Endurance/.test(t))));
const stockTexts = pc.filter((t) => /Tesco/.test(t));
ok(stockTexts.length >= 2 && stockTexts.every((t) => !/[£$€]/.test(t)), '9. Tesco on Pat’s phone: no amount in any word', js(stockTexts));
await shot(P, '9-pat');
const opened = await P.p.evaluate(async ({ from }) => {
  const { E2E } = await import('/crypto.js');
  const s = await new Promise((res) => { const r = indexedDB.open('inflight'); r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('session'); g.onsuccess = () => res(g.result); }; });
  const h = { Authorization: 'Bearer ' + s.token };
  const sync = await (await fetch('/api/pigeon/sync', { headers: h })).json(), f = sync.friends.find((x) => x.id === from);
  const list = (await (await fetch(`/api/pigeon/messages?with=${from}`, { headers: h })).json()).messages || [];
  const outs = [];
  for (const m of list.filter((x) => x.from === from)) { try { outs.push(await E2E.open(await E2E.pair(s.priv, f.pub), { id: m.id, from: m.from, to: m.to, type: 'msg' }, m.ct)); } catch (_) {} }
  return outs.filter((o) => o?.c?.kind === 'markets').map((o) => ({ t: o.t, c: o.c }));
}, { from: GID }).catch((e) => [{ err: String(e) }]);
ok(opened.length >= 2 && opened.every((o) => JSON.stringify(Object.keys(o.c.snap).sort()) === '["day","name","pct","sym"]' && !/[£$€]/.test(JSON.stringify(o))),
  '9. the stock’s payload, opened on Pat’s phone: name, sym, pct and day, and no amount anywhere in it', js(opened, 400));
await reloadChat(L); await K.openChat(L, GID);
const lc = await until(() => L.p.evaluate(() => [...document.querySelectorAll('.msgs .cd-card')].map((c) => c.textContent.replace(/\s+/g, ' ')).find((t) => /Done/.test(t)) || null), 15000);
ok(!!lc && /When sent/i.test(lc) && /Done/.test(lc), '9. Leo: the finished ride, live in his chat', lc);

// ---- 9b. the card's links at the hub: the hub's own pages, in the same window, the square only (no place by name) ----
await G.p.goto(`${HUB}/chats/`); await G.p.waitForSelector('.mlist .mrow', { timeout: 30000 }).catch(() => {});
await K.openChat(G, P.id);
await until(async () => (await G.p.locator('.msgs .cd-card a.cd-open').count()) >= 2, 15000);
const links = await G.p.$$eval('.msgs .cd-card a.cd-open', (as) => as.map((a) => ({ href: a.getAttribute('href'), target: a.getAttribute('target'), text: a.textContent.trim() }))).catch(() => []);
const wxl = links.filter((l) => /Weather/.test(l.text)), mkl = links.filter((l) => /Markets/.test(l.text));
ok(wxl.length > 0 && wxl.every((l) => /^\/weather\/\?lat=-?\d+\.\d\d&lon=-?\d+\.\d\d$/.test(l.href) && !l.target), '9b. Open in Weather: /weather/?lat&lon, the square only (no place by name), in this window', js(wxl));
ok(mkl.length > 0 && mkl.every((l) => l.href === '/markets/#s=TSCO.L' && !l.target), '9b. Open in Markets: /markets/#s=TSCO.L, in this window', js(mkl));
const pages9 = G.pages.length;
// (the address Weather is asked for as it opens: Weather then takes the square out of its own address)
const wxNav = G.p.waitForRequest((r) => r.isNavigationRequest() && r.frame() === G.p.mainFrame() && new URL(r.url()).pathname === '/weather/', { timeout: 20000 }).catch(() => null);
await G.p.locator('.msgs .cd-card a.cd-open', { hasText: 'Weather' }).last().click().catch(() => {});
const wxReq = await wxNav, wxAt = wxReq ? new URL(wxReq.url()) : null;
await G.p.waitForURL((u) => u.pathname === '/weather/', { timeout: 20000 }).catch(() => {});
ok(!!wxAt && G.pages.length === pages9 && new URL(G.p.url()).pathname === '/weather/' && /^-?\d+\.\d\d$/.test(wxAt.searchParams.get('lat') || '') && /^-?\d+\.\d\d$/.test(wxAt.searchParams.get('lon') || '') && !wxAt.searchParams.has('name') && !new RegExp(PLACE).test(dec(wxReq.url())),
  '9b. tapped: Weather at the hub, in this window, asked for at that square (no name)', js({ asked: wxReq?.url(), now: G.p.url() }));

// ---- 10. privacy: the exact strings sent, in no new or changed row outside a sealed ct, and in no request ----
const after = snapshot();
const strings = [...Object.values(TYPED), ...Object.values(PAT), PLACE];
const leaks = [];
for (const [table, rows] of after) {
  const was = before.get(table) || new Set();
  for (const row of rows) {
    if (was.has(row)) continue;
    const open = openPart(row);
    for (const s of strings) if (open.includes(s)) leaks.push(`${table}: ${s}`);
  }
}
ok(!leaks.length, `10. no new or changed row of any table (${after.size} read) holds a word sent or a card’s place, outside what’s sealed`, js(leaks, 400));
const asked = seen.slice(seen0), inReq = [];
// (each URL decoded as a server reads it, + as a space, and each of its query's values; each body as sent and decoded)
for (const r of asked) for (const s of strings) { if (r.body.includes(s) || dec(r.body).includes(s) || r.url.includes(s) || dec(r.url).includes(s) || params(r.url).some((v) => v.includes(s))) inReq.push(`${r.who} ${r.url.slice(0, 80)}: ${s}`); }
ok(asked.length > 50 && !inReq.length, `10. nor any of the ${asked.length} requests from every frame of every phone (URL or body)`, js(inReq, 400));

// ---- 10b. Chats locked on this phone: the engine says locked, and Send goes the back= way, to Chats' own lock (its
// unlock is a passkey's, not run here) ----
await G.p.goto(`${HUB}/`);
await G.p.evaluate((uid) => localStorage.setItem('inflight-lock', JSON.stringify({ on: true, uid, after: 0 })), GID);
await G.p.goto(`${HUB}/`);
const lockState = await until(async () => { const s = await engineState(); return s && s !== 'ready' ? s : null; }, 40000);
ok(lockState === 'locked', '10b. Chats locked here: the engine says locked', String(lockState));
const away10 = G.p.waitForURL((u) => u.pathname === '/chats/', { timeout: 30000 }).then(() => true, () => false);
await G.p.evaluate(({ w, pk }) => { window.IFL.hub.send(w, pk); }, { w: cards.weather.say, pk: packed.weather });
const wentLock = await away10;
ok(wentLock && !!(await G.p.waitForSelector('[data-act=unlock]', { timeout: 20000 }).catch(() => null)), '10b. and Send goes the back= way, to Chats’ own lock', G.p.url());
await G.p.evaluate(() => localStorage.removeItem('inflight-lock')).catch(() => {});

// ---- 11. the engine's key state for real: signed in to InFlite by the site's cookie, Chat's key not on this phone (its
// sign-in here taken away, as Sign In Without Chats leaves none); Send goes the back= way to Chats ----
await G.p.goto(`${HUB}/`);
const dropped = await G.p.evaluate(() => new Promise((res) => { try { const r = indexedDB.open('inflight'); r.onsuccess = () => { try { const tx = r.result.transaction('kv', 'readwrite'); tx.objectStore('kv').delete('session'); tx.oncomplete = () => res(true); tx.onerror = () => res(false); } catch (_) { res(false); } }; r.onerror = () => res(false); } catch (_) { res(false); } })).catch(() => false);
await G.p.goto(`${HUB}/`);
const keyState = await until(async () => { const s = await engineState(); return s && s !== 'ready' ? s : null; }, 40000);
ok(dropped && keyState === 'key', '11. no Chat key here, the site signed in: the engine says key (not forced)', js({ dropped, keyState }));
const away11 = G.p.waitForURL((u) => u.pathname === '/chats/', { timeout: 30000 }).then(() => true, () => false);
await G.p.evaluate(({ w, pk }) => { window.IFL.hub.send(w, pk); }, { w: cards.weather.say, pk: packed.weather });
ok(await away11, '11. and Send goes the back= way, to Chats', G.p.url());

// ---- one window ----
ok(G.pages.length === 1 && !(await G.p.evaluate(() => window.__opened?.length || 0)), 'one window throughout, nothing opened beside it', String(G.pages.length));
// (Chat's pages: Pat's and Leo's at its own address, George's /chats/ and the engine's frame wherever it was; the errors
// of other apps' pages George went through are noted for their batches, not counted here)
const noise = (e) => /Failed to load|net::|404|429|navigator\.vibrate|ERR_ABORTED/.test(e);
const onChat = (x) => { try { return new URL(x.at).pathname.startsWith('/chats/') || /\/chats\//.test(x.stack); } catch (_) { return false; } };
const others = gErrs.filter((x) => !onChat(x) && !noise(x.e));
if (others.length) console.log(`notes (page errors on other apps' pages, for their batches): ${js(others.map((x) => `${x.at}: ${x.e}`), 600)}`);
const chatErrs = [...errs.filter((e) => /^(pat|leo):/.test(e) && !noise(e)), ...gErrs.filter((x) => onChat(x) && !noise(x.e)).map((x) => `george ${x.at}: ${x.e}`)];
ok(!chatErrs.length, 'no page errors on Chat’s pages (George’s /chats/ and its engine, Pat’s and Leo’s Chat)', chatErrs.slice(0, 6).join(' | '));
console.log(`FAILS ${K.fails()}`);
await (await K.hubBrowser()).close();
await K.b.close();
process.exit(0);
