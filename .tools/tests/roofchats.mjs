// needs: hub roof-chats
// Chats under the roof (One roof stage 3, roof/s3/spec.md §10.2, batch Q): George at InFlite's hub with Chats switched on
// (ROOF_CHATS "1", s24-contracts §1), Pat at Chat's own address (chat.ifl.test), one database. In real Chromium against
// the hub stack (hubstack.mjs). Parts, each naming the decision it proves:
//    1 the Chats tab in the page: the framework's header, InFlite's indigo on the tab bar, one core Worker, no engine frame
//    2 a chat opened, Back; sent from the hub → Pat reads it; Pat's answer drawn live
//    3 the deep links of §2.3 (open, an unknown id, friends, requests, add, settings, account, flightlog, /chats, index)
//    4 Send from Weather's Now and Today's one tap (a changed key → the sheet), the toast, one Worker
//    5 Today's Waiting words with no iframe, read with quiet=1, nothing marked read
//    6 Search: People and Messages, the query in no request
//    7 privacy: the sentences sent in no request, log or storage outside Chat's own sealed store; no today:* change; the
//      token in no page-visible place
//    8 key: Unlock Chats → /chats/in/ → back, unlocked
//    9 the app lock at boot (no words on Today, no messages?with= before unlock) and mid-session
//   10 budgets (§5.6)
//   11 a new Chat build mid-session: stale, never reloaded over typed text
//   12 CSP clean, axe, 390 light and dark
//   13 a 401 mid-session → ended, 0 Workers
// Every selector of the framework's and the module's is roofhooks.mjs's (B0 freezes Chats' hooks); one that isn't there
// yet is a failure that names it (never a selector of our own into another batch's markup). Chat's own page (Pat's, at
// chat.ifl.test) is driven by its own markup, as the standalone tests do (#msg, .send): stage 3 doesn't change it.
// Privacy throughout (rule 5): the words George and Pat send are hunted in every request any frame or Worker made, the
// hub's request log, every log the stack writes and the phones' storage (rooflib hunt()).
import * as H from './roofhooks.mjs';
import { kit } from './lib.mjs';
import { packCard } from '../../pigeon/cards.js';
import {
  HUB, EXCEPT, checker, phone, chatPhone, chatApi, befriend, chatSession, workers, hunt, kept, storage, changed, wxServer, weatherAccount,
  alive, loads, here, shown, gone, textOf, attrOf, count, visible, said, cspOf, axe, hide, show, route, meter, connectorFiles, connectorLazy,
  CHAT_LAZY, CHAT_CORE, CHAT_PAGE, CHAT_CSS, PLACES, wait, until, js, closeAll,
} from './rooflib.mjs';

const [,, S, out] = process.argv;
const { ok, part, fails } = checker();
process.on('uncaughtException', (e) => { console.log(`FAIL  crashed: ${String(e?.message || e).split('\n')[0]}`); console.log(`FAILS ${fails() + 1}`); process.exit(0); });
const K = await kit(S, out);
const shot = (p, name) => p.screenshot({ path: `${out}/${name}.png` }).catch(() => {});
const one = (q) => { try { return K.one(q); } catch (_) { return []; } };

// ---- hooks: only roofhooks.mjs's; a missing one is named once and fails at the end (asked of B0, never invented) ----
const MISSING = new Set();
const hk = (name, ...a) => { const v = H[name]; if (v == null) { MISSING.add(name); return `[data-missing-hook="${name}"]`; } return typeof v === 'function' ? v(...a) : v; };
const SAID = '#today .dt-said, #today .dw-said';       // TD's markup for Waiting's words (day.js), declared here as rooflib's EXCEPT are

const at = (p, path, ms = 15000) => p.waitForFunction((u) => location.pathname + location.search + location.hash === u, path, { timeout: ms }).then(() => true, () => false);
const chatsUp = async (p, ms = 30000) => (await shown(p, hk('M_CHATS'), ms)) && (await shown(p, hk('chSec', 'chats'), ms));
const todayUp = async (p, ms = 30000) => (await shown(p, H.TODAY, ms)) && (await shown(p, H.HD_TITLE, ms));
const facade = (p) => p.evaluate(async () => { try { const c = await window.IFL?.hub?.chat?.(); return c ? { keys: Object.keys(c).sort(), state: c.state, frozen: Object.isFrozen(c), call: 'call' in c, on: 'on' in c } : null; } catch (e) { return { err: String(e) }; } }).catch(() => null);
const engines = (p) => count(p, EXCEPT.CHAT_ENGINE);
// (the tab bar out of the way: none of its tabs on screen, S3-C4 .away; read off the tabs' boxes, no class of our own)
const tabsAway = (p) => p.evaluate((s) => [...document.querySelectorAll(s)].every((t) => { const r = t.getBoundingClientRect(); const cs = getComputedStyle(t); return !r.height || r.top >= innerHeight - 1 || cs.visibility === 'hidden' || Number(cs.opacity) === 0 || !!t.closest('[hidden],[inert]'); }), H.TAB).catch(() => false);
const toastSaid = (p, re, ms = 12000) => until(async () => (await said(p)).find((t) => re.test(t)) || null, ms);
// (Pat's own page at Chat's own address: a chat opened as the standalone tests do)
const patOpen = async (ph, id) => {
  for (let k = 0; k < 4; k++) {
    await ph.p.evaluate((id) => { history.replaceState(null, '', location.pathname); location.hash = '#open=' + id; }, id);
    if (await ph.p.waitForSelector('#msg', { timeout: 4000 }).then(() => true, () => false)) break;
  }
  await wait(600);
};
const patSays = async (ph, id, text) => { await patOpen(ph, id); await ph.p.fill('#msg', text); await ph.p.click('.send'); await wait(1000); };
const bodyHas = (p, text, ms = 30000) => p.waitForFunction((t) => document.body.innerText.includes(t), text, { timeout: ms }).then(() => true, () => false);

wxServer();
// ---- George at the hub (the one sign-in trip), Pat and Leo at Chat's own address, friends ----
const hubSays = await (await fetch(`${HUB.replace('ifl.test:8788', '127.0.0.1:8787')}/api/hub`, { headers: { Host: 'ifl.test:8788' } }).catch(() => null))?.json().catch(() => null);
ok(hubSays?.apps?.chats === true, 'the hub says Chats is on (/api/hub apps.chats, ROOF_CHATS "1"; s24 §1–2)', js(hubSays));
const G = await chatPhone('george', { join: { name: 'George Farrow', handle: 'georgeroof' } });
ok(!!(G.token && G.id), 'George: an account and Chats signed in at the hub, through the one trip (S3-D8)', js({ id: G.id, at: here(G.p) }));
const [P, L] = [await chatPhone('pat', { at: 'chat', join: { name: 'Pat Reed', handle: 'patroof' } }), await chatPhone('leo', { at: 'chat', join: { name: 'Leo Marsh', handle: 'leoroof' } })];
ok(!!(P.token && L.token), 'Pat and Leo at Chat’s own address', js([P.id, L.id]));
ok((await befriend(G, P)) && (await befriend(G, L)), 'George is friends with Pat and with Leo');
await G.p.goto(`${HUB}/robots.txt`);
await weatherAccount(G.p, { places: [PLACES.London], settings: { temp: 'c' } });
const everyone = [G, P, L];
const SENT = {
  hub: 'Kettle is on at the lighthouse, come by',
  pat: 'The heron came back to the pond today',
  pat2: 'Saw the otter by the weir at dawn',
  late: 'Bringing the blue umbrella along',
  search: 'Marmalade sandwiches for the long walk',
  typed: 'Half a thought I have not sent yet',
};
const ALL = Object.values(SENT);
const tod0 = await storage(G.p);       // (today:* as it was before any Chats under the roof, part 7)
const unreadFrom = (from, to) => Number(one(`SELECT COUNT(*) AS n FROM pg_msgs WHERE sender = '${from}' AND recipient = '${to}' AND read_at IS NULL`)[0]?.n || 0);

// ======================================================================================================================
await part(1, 'the Chats tab: in the page, the framework’s header, InFlite’s indigo, one core Worker, no engine frame', 'S3-D2, S3-D6, S3-D16, §2.1, §9.5', async () => {
// ======================================================================================================================
  const p = G.p;
  await p.goto(`${HUB}/`);
  await todayUp(p); await wait(1500);
  const accToday = await p.evaluate((s) => getComputedStyle(document.querySelector(s)?.closest('nav') || document.body).getPropertyValue('--ifl-tab-on').trim(), H.TAB).catch(() => '');
  const curToday = await p.evaluate((s) => { const t = document.querySelector(s); return t ? getComputedStyle(t).color : null; }, H.tab('today')).catch(() => null);
  const life = await alive(p), docs = loads(p);
  await p.click(H.tab('chats'));
  const up = await chatsUp(p);
  ok(up && (await at(p, '/chats/')) && (await life.same()) && docs.n() === 0, '1. Today → the Chats tab: /chats/ drawn in the same page, no document fetched (S3-D2, §2.1 c)', js({ at: here(p), docs: docs.list }));
  ok((await attrOf(p, H.HTML_ROUTE, 'data-route')) === '/chats/' && (await count(p, H.htmlApp('chats'))) === 1, '1. html data-route /chats/, data-app chats (S3-D2)', js({ route: await attrOf(p, H.HTML_ROUTE, 'data-route'), app: await attrOf(p, H.HTML_APP, 'data-app') }));
  ok((await textOf(p, H.HD_TITLE)) === 'Chats' && (await visible(p, H.HD_ME)) === 1 && !(await visible(p, H.HD_CRUMB)) && !(await visible(p, H.HD_BACK)), '1. the tab-screen header: your photo, the title Chats, no crumb, no Back (§2.1)', js({ title: await textOf(p, H.HD_TITLE), me: await visible(p, H.HD_ME), crumb: await visible(p, H.HD_CRUMB), back: await visible(p, H.HD_BACK) }));
  ok((await visible(p, H.hdSec('chats'))) === 1 && (await visible(p, H.hdSec('friends'))) === 1 && (await attrOf(p, H.hdSec('chats'), 'aria-selected')) === 'true', '1. the switcher Chats · Friends, Chats selected (§2.1)');
  ok((await attrOf(p, H.tab('chats'), 'aria-current')) === 'page', '1. the Chats tab current (aria-current=page, §2.1 c)', await attrOf(p, H.tab('chats'), 'aria-current'));
  const line = await textOf(p, H.HD_LINE);
  ok(line == null || !ALL.some((w) => line.includes(w)), '1. the header line carries counts only, no words (§2.1)', line);
  ok(await shown(p, hk('chRow', P.id), 20000), '1. Pat’s row on the list (the core’s rows, §3.4)');
  const accChats = await p.evaluate((s) => getComputedStyle(document.querySelector(s)?.closest('nav') || document.body).getPropertyValue('--ifl-tab-on').trim(), H.TAB).catch(() => '');
  const curChats = await p.evaluate((s) => { const t = document.querySelector(s); return t ? getComputedStyle(t).color : null; }, H.tab('chats')).catch(() => null);
  ok(!!accToday && accToday === accChats && curToday === curChats, '1. the tab bar’s accent the same on Today and on Chats: InFlite’s indigo, not the screen’s (S3-D16)', js({ accToday, accChats, curToday, curChats }));
  const w = await until(() => (workers(p).core === 1 ? workers(p) : null), 15000) || workers(p);
  ok(w.core === 1 && w.all === 1, '1. one Worker on the page, chats-core (S3-D3, risk B2, §9.5)', js(w));
  ok((await engines(p)) === 0, '1. no engine frame on the page (S3-D6)');
  const f = await facade(p);
  ok(js(f?.keys) === js(['refresh', 'sendTo', 'share', 'signOut', 'since', 'state', 'waiting']) && f.frozen && !f.call && !f.on && f.state === 'ready', '1. IFL.hub.chat() is the frozen facade of makeIFLChat’s seven keys, no call or on, ready (S3-D6, risk I1)', js(f));
  await p.click(H.hdSec('friends'));
  ok((await shown(p, hk('chSec', 'friends'))) && (await at(p, '/chats/#friends')), '1. Friends from the switcher: /chats/#friends (§2.1)', here(p));
  await p.click(H.tab('chats'));
  ok((await shown(p, hk('chSec', 'chats'))) && (await at(p, '/chats/')), '1. the Chats tab again: the list', here(p));
  await shot(p, '1-chats');
  docs.stop();
});

// ======================================================================================================================
await part(2, 'a chat: opened, the composer, sent from the hub → Pat reads it; Pat’s answer live; Back', 'S3-D9, S3-D17, §2.1, §3.4', async () => {
// ======================================================================================================================
  const p = G.p, life = await alive(p), docs = loads(p);
  await p.click(hk('chRow', P.id));
  const open = (await at(p, `/chats/#open=${P.id}`)) && (await shown(p, hk('CH_COMPOSER')));
  ok(open && (await life.same()) && docs.n() === 0, '2. Pat’s row: /chats/#open=<id> in the page, the composer up (S3-D9: open stays in the address)', here(p));
  ok((await visible(p, H.HD_BACK)) === 1 && /Back to Chats/.test((await attrOf(p, H.HD_BACK, 'aria-label')) || '') && /Pat/.test((await textOf(p, H.HD_TITLE)) || ''), '2. the header: Back “Back to Chats”, the title Pat’s name (§2.1)', js({ back: await attrOf(p, H.HD_BACK, 'aria-label'), title: await textOf(p, H.HD_TITLE) }));
  ok(!(await visible(p, H.HD_TABLIST)), '2. no switcher in a chat (sections: false, S4 C3)');
  ok(await tabsAway(p), '2. the tab bar away while the composer is up (S3-C4, §2.1 d)');
  ok((await visible(p, hk('CH_SCROLLER'))) === 1, '2. the chat’s one scroller (S3-D17)');
  await p.fill(hk('CH_COMPOSER'), SENT.hub);
  await p.click(hk('CH_SEND_BTN'));
  const mine = await p.waitForFunction(([b, t]) => [...document.querySelectorAll(b)].some((x) => x.textContent.includes(t)), [hk('CH_BUBBLE'), SENT.hub], { timeout: 20000 }).then(() => true, () => false);
  ok(mine, '2. sent: George’s bubble in the chat (sealed in the core, S3-D3)');
  const landed = await until(() => Number(one(`SELECT COUNT(*) AS n FROM pg_msgs WHERE sender = '${G.id}' AND recipient = '${P.id}'`)[0]?.n || 0) >= 1, 20000);
  ok(!!landed, '2. one letter from George to Pat in the database');
  await patOpen(P, G.id);
  ok(await bodyHas(P.p, SENT.hub, 40000), '2. Pat, on Chat’s own page, reads George’s words (the same keys, S3-D4)');
  await P.p.fill('#msg', SENT.pat); await P.p.click('.send');
  const live = await p.waitForFunction(([b, t]) => [...document.querySelectorAll(b)].some((x) => x.textContent.includes(t)), [hk('CH_BUBBLE'), SENT.pat], { timeout: 40000 }).then(() => true, () => false);
  ok(live, '2. Pat’s answer drawn in George’s open chat while it shows (sync every 15 s while shown, S3-D10)');
  await shot(p, '2-chat');
  await p.click(H.HD_BACK);
  ok((await at(p, '/chats/')) && (await chatsUp(p)) && (await life.same()) && docs.n() === 0, '2. Back: the list, the same page (§2.1)', here(p));
  ok(!(await tabsAway(p)), '2. the tab bar back on the list');
  ok(!(await count(p, hk('CH_BUBBLE'))), '2. no bubble left in the page once the chat is left (S3-D3, risk I2)', String(await count(p, hk('CH_BUBBLE'))));
  ok(workers(p).core === 1, '2. still one Worker', js(workers(p)));
  docs.stop();
});

// ======================================================================================================================
await part(3, 'deep links', '§2.3, S3-D9, S1 D6', async () => {
// ======================================================================================================================
  const p = await G.ctx.newPage();
  const cases = [
    [`/chats/#open=${P.id}`, async () => (await shown(p, hk('CH_COMPOSER'))) && (await at(p, `/chats/#open=${P.id}`)), 'that chat, #open kept in the address'],
    ['/chats/#friends', async () => (await shown(p, hk('chSec', 'friends'))) && (await attrOf(p, H.hdSec('friends'), 'aria-selected')) === 'true', 'Friends'],
    ['/chats/#requests', async () => (await shown(p, hk('chSec', 'friends'))) && (await shown(p, `${H.sheet('requests')}[open]`)) && (await at(p, '/chats/#friends', 8000) || await at(p, '/chats/', 1)), 'Friends + the Requests sheet, the key tidied'],
    [`/chats/#add=${L.handle}`, async () => (await shown(p, `${H.sheet('addfriend')}[open]`)) && !(await p.evaluate(() => location.hash.includes('add='))), 'Friends + Add (the handle), the key tidied'],
    ['/chats/#settings', async () => shown(p, `${H.sheet('chatsettings')}[open]`), 'Chat Settings'],
    ['/chats/#account', async () => shown(p, `${H.sheet('chatsettings')}[open]`), 'Chat Settings (You’s Chat row)'],
    ['/chats/#flightlog', async () => shown(p, `${H.sheet('flightlog')}[open]`), 'Flight Log'],
    ['/chats/index.html', async () => chatsUp(p), 'the list'],
    ['/chats', async () => (await chatsUp(p)) && new URL(p.url()).pathname === '/chats/', 'a 301 to /chats/, the list'],
  ];
  for (const [path, check, what] of cases) {
    await p.goto(`${HUB}/robots.txt`);
    await p.goto(`${HUB}${path}`).catch(() => {});
    const good = await check();
    ok(!!good && (await count(p, hk('M_CHATS'))) === 1, `3. ${path}: ${what}, under the roof (§2.3)`, here(p));
    ok(workers(p).core === 1 && !(await engines(p)), `3. ${path}: one Worker, no engine frame`, js(workers(p)));
  }
  await p.goto(`${HUB}/robots.txt`);
  await p.goto(`${HUB}/chats/#open=00000000-0000-4000-8000-000000000000`);
  const toast = await toastSaid(p, /That chat isn’t on this phone/);
  ok((await chatsUp(p)) && !!toast, '3. an unknown #open: the list and “That chat isn’t on this phone” (§2.3)', js(await said(p)));
  // (#share= read raw and tidied at once: the words leave the address and the history entry, S3-D7, S3-D9)
  const card = { v: 1, kind: 'weather', from: 'today', at: Date.now(), say: 'Bright later in London.', snap: { place: 'London', tz: 'Europe/London', temp: 14, feels: 13, code: 1, isDay: true, hi: 16, lo: 9, rain: { now: false, at: null }, spell: null }, ref: { cell: [51.5, -0.13] } };
  await p.goto(`${HUB}/robots.txt`);
  await p.goto(`${HUB}/chats/#share=${encodeURIComponent(card.say)}&card=${packCard(card)}&back=${encodeURIComponent('/')}`);
  const sendUp = await shown(p, `${H.sheet('send')}[open]`, 20000);
  ok(sendUp && !(await p.evaluate(() => /share=|card=/.test(location.href))), '3. /chats/#share=…&card=…&back=/: the Send sheet, the words out of the address at once (S3-D7)', here(p));
  await p.close();
});

// ======================================================================================================================
await part(4, 'Send: from Weather’s Now, and Today’s one tap (a changed key → the sheet)', 'S3-D6, S3-D7, risk 9.2', async () => {
// ======================================================================================================================
  const p = G.p, life0 = await alive(p);
  await p.goto(`${HUB}/weather/`);
  await shown(p, `${H.M_WEATHER} ${H.WX_HERO}`, 30000);
  const life = await alive(p), docs = loads(p), n0 = Number(one(`SELECT COUNT(*) AS n FROM pg_msgs WHERE sender = '${G.id}' AND recipient = '${P.id}'`)[0]?.n || 0);
  await p.click(H.NOW_SEND);
  const up = await shown(p, `${H.sheet('send')}[open]`, 20000);
  ok(up && (await life.same()) && docs.n() === 0 && !(await engines(p)), '4. Weather’s Now, Send: the framework’s Send sheet drawn by Chats (send.js), the same page, no engine (S3-D7)', js({ docs: docs.list }));
  await p.click(hk('chSendRow', P.id)).catch(() => {});
  await p.click(hk('CH_SEND_GO')).catch(() => {});
  const toast = await toastSaid(p, /Sent to Pat/, 20000);
  ok(!!toast && /You’re still here/.test(toast), '4. “Sent to Pat. You’re still here”, on Weather still (S3-D6)', js(await said(p)));
  ok((await life.same()) && new URL(p.url()).pathname === '/weather/', '4. …in the same page', here(p));
  ok(Number(one(`SELECT COUNT(*) AS n FROM pg_msgs WHERE sender = '${G.id}' AND recipient = '${P.id}'`)[0]?.n || 0) === n0 + 1, '4. one letter to Pat (sealed in the core’s sendRun)');
  ok(workers(p).core === 1, '4. one Worker (Weather and Chats share the page’s one service)', js(workers(p)));
  docs.stop(); void life0;

  // Today's one tap: from a tap on the page (a button of the test's, its click the page's own), Leo's key unchanged → sent
  // at once; Leo's key changed on the server → no letter, the sheet instead; with no tap at all → refused (why "tap")
  await p.goto(`${HUB}/`); await todayUp(p); await wait(1500);
  const done = { v: 1, kind: 'fitness', from: 'today', at: Date.now(), say: 'Done today: Endurance 75.', snap: { day: new Date().toISOString().slice(0, 10), tz: 'Europe/London', sport: 'ride', name: 'Endurance 75', kind: 'Endurance', secs: 4500, done: { secs: 4620, dist: 36100, tss: 64 } } };
  const pk = packCard(done);
  const tapper = () => p.evaluate(({ to, w, pk }) => {
    document.getElementById('t-onetap')?.remove();
    const b = document.createElement('button'); b.id = 't-onetap'; b.textContent = 'Send to Leo'; b.className = 'btn'; document.querySelector('main#today')?.prepend(b);
    b.addEventListener('click', () => { window.__one = null; window.IFL.hub.chat().then((c) => c.sendTo(to, w, pk)).then((r) => { window.__one = r; }, (e) => { window.__one = { err: String(e) }; }); });
  }, { to: L.id, w: done.say, pk });
  const l0 = Number(one(`SELECT COUNT(*) AS n FROM pg_msgs WHERE sender = '${G.id}' AND recipient = '${L.id}'`)[0]?.n || 0);
  await tapper(); await p.click('#t-onetap');
  const r1 = await until(() => p.evaluate(() => window.__one), 20000);
  ok(r1?.ok === true && /Leo/.test(r1.say || ''), '4. Today’s one tap to Leo: sent, no sheet (facade.sendTo, S3-D6)', js(r1));
  ok(Number(one(`SELECT COUNT(*) AS n FROM pg_msgs WHERE sender = '${G.id}' AND recipient = '${L.id}'`)[0]?.n || 0) === l0 + 1, '4. …one letter to Leo');
  const noTap = await p.evaluate(({ to, w, pk }) => new Promise((res) => setTimeout(() => window.IFL.hub.chat().then((c) => c.sendTo(to, w, pk)).then(res, (e) => res({ err: String(e) })), 6000)), { to: L.id, w: done.say, pk }).catch((e) => ({ err: String(e) }));
  ok(noTap?.ok === false && noTap.why === 'tap', '4. sendTo with no tap (6 s after the last activation): refused, why "tap" (S3-D6)', js(noTap));
  const newPub = await p.evaluate(async () => { const k = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']); const j = await crypto.subtle.exportKey('jwk', k.publicKey); return { x: j.x, y: j.y }; });
  K.sql(`UPDATE pg_users SET pub = json_object('kty', 'EC', 'crv', 'P-256', 'x', '${newPub.x}', 'y', '${newPub.y}') WHERE id = '${L.id}'`);
  await p.evaluate(() => window.IFL.hub.chat().then((c) => c.refresh())).catch(() => {});
  await wait(2500);
  const l1 = Number(one(`SELECT COUNT(*) AS n FROM pg_msgs WHERE sender = '${G.id}' AND recipient = '${L.id}'`)[0]?.n || 0);
  await tapper(); await p.click('#t-onetap');
  const sheet = await shown(p, `${H.sheet('send')}[open]`, 20000);
  ok(sheet, '4. Leo’s key changed: the one tap opens the Send sheet instead (sendTo falls back, risk 9.2)', js(await p.evaluate(() => window.__one)));
  ok(Number(one(`SELECT COUNT(*) AS n FROM pg_msgs WHERE sender = '${G.id}' AND recipient = '${L.id}'`)[0]?.n || 0) === l1, '4. …and nothing sealed to the changed key');
  await p.keyboard.press('Escape'); await gone(p, H.SHEET_OPEN);
  await p.evaluate(() => document.getElementById('t-onetap')?.remove());
  ok(workers(p).core === 1 && !(await engines(p)), '4. one Worker, no engine, on Today', js(workers(p)));
});

// ======================================================================================================================
await part(5, 'Today’s Waiting for You: Pat’s words with no iframe, quiet=1, nothing marked read, nothing kept', 'S3-D6, S3-D10, §2.5', async () => {
// ======================================================================================================================
  const p = G.p;
  await patSays(P, G.id, SENT.pat2);
  await until(() => unreadFrom(P.id, G.id) >= 1, 15000);
  const u0 = unreadFrom(P.id, G.id), k0 = await kept(p), s0 = G.seen.length;
  await p.goto(`${HUB}/`); await todayUp(p);
  const words = await p.waitForFunction(([s, t]) => [...document.querySelectorAll(s)].some((x) => x.textContent.includes(t)), [SAID, SENT.pat2], { timeout: 40000 }).then(() => true, () => false);
  ok(words, '5. Today’s Waiting for You shows Pat’s words (the facade’s waiting/since, §2.5)', await textOf(p, H.TODAY));
  ok(!(await engines(p)), '5. …with no engine frame on the page (S3-D6)');
  const wt = await p.evaluate((ids) => window.IFL.hub.chat().then((c) => c.waiting({ ids })), [P.id]).catch((e) => String(e));
  const pw = Array.isArray(wt) ? wt.find((x) => x.id === P.id) : null;
  ok(pw?.first === 'Pat' && (pw.said || '').includes(SENT.pat2), '5. waiting(): Pat, her own words (Waiting’s shape, §5.5)', js(wt, 400));
  const calls = G.seen.slice(s0).filter((r) => /\/api\/pigeon\//.test(r.url));
  const loud = calls.filter((r) => /\/api\/pigeon\/sync(\?|$)/.test(r.url) && !/[?&]quiet=1/.test(r.url));
  const reads = calls.filter((r) => /\/api\/pigeon\/(group-)?read(\?|$)/.test(r.url));
  ok(calls.length > 0 && !loud.length && !reads.length, '5. Today’s asks: sync only with quiet=1, no read (never “seen in Chats”, S3-D10)', js({ n: calls.length, loud: loud.map((r) => r.url), reads: reads.map((r) => r.url) }));
  ok(unreadFrom(P.id, G.id) === u0 && u0 >= 1, '5. Pat’s letters still unread in the database', js({ before: u0, after: unreadFrom(P.id, G.id) }));
  const k1 = await kept(p), more = k1.keys.filter((k) => !k0.keys.includes(k));
  ok(!more.length && !ALL.some((w) => k1.text.includes(w)), '5. nothing new kept on the phone outside Chat’s own store, and no words in it (S3-D4)', js({ more, words: ALL.filter((w) => k1.text.includes(w)) }));
  // since(t): what she said after it (Today's line under her name)
  const t5 = Date.now(); await wait(1200);
  await patSays(P, G.id, SENT.late);
  const sn = await until(() => p.evaluate(({ id, t }) => window.IFL.hub.chat().then((c) => c.since(id, t)), { id: P.id, t: t5 }), 20000);
  ok(!!sn && (sn.said || '').includes(SENT.late) && !(sn.said || '').includes(SENT.pat2), '5. since(t): only what she said after it', js(sn));
});

// ======================================================================================================================
await part(6, 'Search: People and Messages, on this phone only; the query in no request', '§2.4, S1 D16', async () => {
// ======================================================================================================================
  const p = G.p;
  await patSays(P, G.id, SENT.search);
  await p.goto(`${HUB}/chats/`); await chatsUp(p);
  await p.click(hk('chRow', P.id)); await shown(p, hk('CH_COMPOSER'));
  await p.waitForFunction(([b, t]) => [...document.querySelectorAll(b)].some((x) => x.textContent.includes(t)), [hk('CH_BUBBLE'), SENT.search], { timeout: 40000 }).catch(() => {});
  await p.click(H.HD_BACK); await chatsUp(p);
  const s0 = G.seen.length;
  await p.click(H.HD_SEARCH); await shown(p, `${H.SEARCH_SHEET}[open]`);
  await p.fill(H.SEARCH_INPUT, 'Pat');
  const person = await p.waitForFunction((s) => [...document.querySelectorAll(s)].some((x) => /Pat/.test(x.textContent) && /Chats/.test(x.textContent)), H.SEARCH_RESULT, { timeout: 15000 }).then(() => true, () => false);
  ok(person, '6. People: Pat, “Chats” (names only, §2.4)', js(await p.$$eval(H.SEARCH_RESULT, (xs) => xs.map((x) => x.textContent.trim()).slice(0, 6)).catch(() => [])));
  const q = 'Marmalade sandw';
  await p.fill(H.SEARCH_INPUT, q);
  const hit = await p.waitForFunction(([s, t]) => [...document.querySelectorAll(s)].find((x) => x.textContent.includes(t)) ? true : false, [H.SEARCH_RESULT, 'Marmalade'], { timeout: 15000 }).then(() => true, () => false);
  ok(hit, '6. Messages: Pat’s message found on this phone, with its snippet (svc search, §2.4)');
  const leak = G.seen.slice(s0).filter((r) => [q, 'Marmalade'].some((w) => r.url.includes(w) || decodeURIComponent(r.url.replace(/\+/g, ' ')).includes(w) || r.body.includes(w)));
  ok(!leak.length, '6. the query in no request from any frame or Worker (postMessage to the core only)', js(leak.map((r) => r.url)));
  if (hit) {
    await p.evaluate(([s, t]) => [...document.querySelectorAll(s)].find((x) => x.textContent.includes(t))?.click(), [H.SEARCH_RESULT, 'Marmalade']);
    const opened = (await at(p, `/chats/#open=${P.id}`, 15000)) && (await shown(p, hk('CH_COMPOSER')));
    ok(opened && !(await p.evaluate(() => /token|msg/.test(location.hash))), '6. the result tapped: Pat’s chat at that message, the message id in no URL (§2.4)', here(p));
    await p.click(H.HD_BACK).catch(() => {});
  }
  await p.keyboard.press('Escape').catch(() => {});
});

// ======================================================================================================================
await part(7, 'privacy: the sentences, the query and the token in no request, log or storage; no today:* change', '§9.3, rule 5, S3-D3, S3-D4', async () => {
// ======================================================================================================================
  const p = G.p;
  await p.goto(`${HUB}/chats/`); await chatsUp(p);
  // (a sentence typed and not sent: its draft is the core's, under the lock in Chat's own store, S3-D4)
  await p.click(hk('chRow', P.id)); await shown(p, hk('CH_COMPOSER'));
  await p.fill(hk('CH_COMPOSER'), SENT.typed); await wait(1200);
  await hide(p); await wait(800); await show(p);
  await p.fill(hk('CH_COMPOSER'), ''); await p.click(H.HD_BACK).catch(() => {});
  const found = await hunt([...ALL, 'Marmalade sandw'], { S, seen: everyone.flatMap((x) => x.seen), phones: [G] });
  ok(!found.length, '7. no sentence sent or typed in any request URL or body (any frame, any Worker, every phone), the hub’s request log, any log of the stack, or George’s storage outside Chat’s sealed store', js(found.slice(0, 6), 900));
  const tod1 = await storage(p), d = changed(tod0, tod1);
  const todayKeys = [...d.added, ...d.changed, ...d.removed].filter((k) => /^(local|session):today:/.test(k));
  ok(!todayKeys.length, '7. no today:* key added, changed or removed by Chats (S3-D4)', js(todayKeys));
  const newKeys = d.added.filter((k) => /^local:/.test(k) && !/^local:(ifl-|inflight-)/.test(k));
  ok(!newKeys.length, '7. no new localStorage key beside the framework’s own ifl-* and Chat’s inflight-* (S3-D4)', js(newKeys));
  const tk = G.token || (await chatSession(p))?.token;
  const inPage = await p.evaluate((t) => {
    const out = [];
    if (document.documentElement.outerHTML.includes(t)) out.push('DOM');
    for (const st of [localStorage, sessionStorage]) for (let i = 0; i < st.length; i++) if ((st.getItem(st.key(i)) || '').includes(t)) out.push(`storage ${st.key(i)}`);
    try { if (JSON.stringify(window.IFL?.hub || {}).includes(t)) out.push('IFL.hub'); } catch (_) {}
    return out;
  }, tk).catch((e) => [String(e)]);
  const tkUrls = everyone.flatMap((x) => x.seen).filter((r) => r.url.includes(tk) || r.body.includes(tk));
  ok(!!tk && !inPage.length && !tkUrls.length, '7. Chat’s token in no part of the page (DOM, storage, IFL.hub) and in no request URL or body (S3-D3: the core’s only)', js({ inPage, urls: tkUrls.map((r) => r.url) }));
  // (the core's own requests carry the bearer; none of the page's main-frame requests do)
  const pageBearer = G.seen.filter((r) => /^Bearer /.test(r.headers?.authorization || '') && !/\/api\/pigeon\//.test(r.url));
  ok(!pageBearer.length, '7. the bearer only ever on Chat’s own API calls', js(pageBearer.map((r) => r.url)));
});

// ======================================================================================================================
await part(8, 'key: signed in to InFlite, no key on this phone → Unlock Chats → /chats/in/ → back, unlocked', 'S3-D8, §2.1', async () => {
// ======================================================================================================================
  // (George on a second phone: InFlite's cookie, no Chat key in this origin's IndexedDB)
  const N = await phone('george-new');
  N.seen = []; everyone.push(N);
  const { onAccountPage } = await import('./join.mjs');
  // (InFlite's session on this phone as George's: his cookies, the account's own; Chats has never been unlocked here)
  await N.ctx.addCookies((await G.ctx.cookies()).filter((c) => /ifl\.test$/.test(c.domain)));
  await N.p.goto(`${HUB}/chats/`);
  const navs = []; N.p.on('framenavigated', (f) => { if (f === N.p.mainFrame()) navs.push(f.url()); });
  const k = await shown(N.p, hk('CH_UNLOCK'), 30000);
  if (!k) console.log('note: no Unlock Chats; this phone may not be signed in to InFlite (part 8 then proves the signin state only)');
  const signinish = k || (await N.p.evaluate((s) => /Sign in to Chats/.test(document.querySelector(s)?.textContent || ''), hk('M_CHATS')));
  ok(signinish, '8. Chats on a phone with no key here: “Unlock Chats on this phone” (key) or “Sign in to Chats” (signin) (§2.1)', await textOf(N.p, hk('M_CHATS')));
  ok(workers(N.p).core <= 1 && !(await engines(N.p)), '8. no engine frame, at most one Worker', js(workers(N.p)));
  if (k) {
    const href = await attrOf(N.p, hk('CH_UNLOCK'), 'href');
    await N.p.click(hk('CH_UNLOCK'));
    await onAccountPage(N.p, { email: G.who.email }).catch((e) => console.log('note: the account page', e.message));
    const back = await N.p.waitForURL((u) => u.host === 'ifl.test:8788' && u.pathname === '/chats/' && !u.hash.startsWith('#signin'), { timeout: 60000 }).then(() => true, () => false);
    ok(navs.some((u) => new URL(u).pathname.startsWith('/chats/in/')) && back, '8. Unlock Chats: through Chat’s own page at /chats/in/ and back to /chats/ (S3-D8)', js({ href, navs: navs.map((u) => new URL(u).pathname + new URL(u).hash.slice(0, 30)) }));
    ok((await chatsUp(N.p)) && (await shown(N.p, hk('chRow', P.id), 30000)), '8. …unlocked: the list with Pat (one unlock per phone, S3-D8)');
    ok((await facade(N.p))?.state === 'ready', '8. the facade ready', js(await facade(N.p)));
  }
  await N.ctx.close();
});

// ======================================================================================================================
await part(9, 'the app lock: at boot (no words on Today, no messages?with= before unlock) and mid-session', 'S3-D14, risk B4', async () => {
// ======================================================================================================================
  const p = G.p;
  const lockOn = (after = 0) => p.evaluate(({ uid, after }) => localStorage.setItem('inflight-lock', JSON.stringify({ on: true, after, uid })), { uid: G.id, after });
  const lockOff = () => p.evaluate(() => localStorage.removeItem('inflight-lock'));
  await patSays(P, G.id, SENT.pat);
  await p.goto(`${HUB}/robots.txt`); await lockOn();
  const s0 = G.seen.length;
  await p.goto(`${HUB}/`); await todayUp(p); await wait(6000);
  const words = await p.evaluate(([s, ws]) => [...document.querySelectorAll(s)].filter((x) => ws.some((w) => x.textContent.includes(w))).length, [SAID, ALL]).catch(() => -1);
  const asks = G.seen.slice(s0).filter((r) => /\/api\/pigeon\/(group-)?messages\?with=/.test(r.url));
  ok(words === 0, '9. lock set, Today opened: no Waiting words drawn (.dt-said/.dw-said, S3-D14)', String(words));
  ok(!asks.length, '9. …and no messages?with= asked before unlock (the core starts locked, risk B4)', js(asks.map((r) => r.url)));
  ok((await facade(p))?.state === 'locked', '9. the facade says locked', js(await facade(p)));
  await p.click(H.tab('chats'));
  ok(await shown(p, hk('CH_LOCK'), 20000), '9. the Chats tab: Chat’s lock screen inside the Chats screen (§2.1)');
  const lines = await p.evaluate(([s, ws]) => ws.filter((w) => document.querySelector(s)?.textContent.includes(w)), [hk('M_CHATS'), ALL]).catch(() => []);
  ok(!lines.length, '9. no message words anywhere in the Chats screen while locked', js(lines));
  // (unlocking is a passkey check in the page, lock.js; the lock taken off here instead, as Chat's own page's App Lock
  // setting does, then a fresh load)
  await lockOff(); await p.goto(`${HUB}/chats/`); await chatsUp(p);
  await p.click(hk('chRow', P.id)); await shown(p, hk('CH_COMPOSER'));
  await p.waitForFunction(([b, t]) => [...document.querySelectorAll(b)].some((x) => x.textContent.includes(t)), [hk('CH_BUBBLE'), SENT.pat], { timeout: 30000 }).catch(() => {});
  const b0 = await count(p, hk('CH_BUBBLE'));
  await lockOn(0); await hide(p); await wait(800); await show(p);
  const lockedNow = await shown(p, hk('CH_LOCK'), 15000);
  await wait(800);
  ok(b0 > 0 && lockedNow, '9. mid-session, lock on (Immediately), hidden and back: the lock screen (S3-D14)', js({ b0 }));
  ok(!(await count(p, hk('CH_BUBBLE'))) && !(await p.evaluate((ws) => ws.some((w) => document.body.innerText.includes(w)), ALL)), '9. …the chat’s words gone from the page (chat:<id> null, S3-D14)');
  await p.click(H.HD_SEARCH).catch(() => {}); await shown(p, `${H.SEARCH_SHEET}[open]`);
  await p.fill(H.SEARCH_INPUT, 'heron').catch(() => {}); await wait(1500);
  ok(!(await p.evaluate((s) => [...document.querySelectorAll(s)].some((x) => /heron/i.test(x.textContent)), H.SEARCH_RESULT)), '9. …and Search finds no message while locked (§2.4)');
  await p.keyboard.press('Escape').catch(() => {});
  await lockOff(); await p.goto(`${HUB}/chats/`); await chatsUp(p);
});

// ======================================================================================================================
await part(10, 'budgets: the first Chats open and Today’s idle start', '§5.6, build I1', async () => {
// ======================================================================================================================
  // (a fresh phone signed in as George, its files cold: what a first open fetches, as sent, gzipped)
  const B = await chatPhone('george-cold', { then: '/robots.txt', join: { name: 'Cold George', handle: `cold${Date.now() % 1e6}` } });
  everyone.push(B);
  const today = meter(B.p, 'chats');
  await B.p.goto(`${HUB}/`); await todayUp(B.p); await wait(8000);
  const t = await today.report(); today.stop();
  const ui = t.rows.filter((r) => CHAT_PAGE.test(r.path) && !/connector\.js$/.test(r.path));
  const idle = t.rows.filter((r) => CHAT_CORE.test(r.path) || /\/chats\/roof\/service\.js$/.test(r.path) || /\/chats\/(cards|links)\.js$/.test(r.path)).reduce((a, r) => a + r.gz, 0);
  ok(!ui.length, '10. Today’s idle start loads no Chats UI (service.js and the core graph only, §2.5)', js(ui.map((r) => r.path)));
  ok(idle > 0 && idle <= 58 * 1024, `10. Today’s idle start: service.js + the core graph ${(idle / 1024).toFixed(1)} KB gz (≤ 58, §5.6; the engine was ≈ 270)`, js(t.rows.map((r) => `${r.path} ${r.gz}`)));
  const m = meter(B.p, 'chats');
  await B.p.goto(`${HUB}/robots.txt`);
  await B.p.goto(`${HUB}/chats/`); await chatsUp(B.p); await wait(4000);
  const r = await m.report(); m.stop();
  const sum = (re) => r.rows.filter((x) => re.test(x.path)).reduce((a, x) => a + x.gz, 0);
  const page = sum(CHAT_PAGE), css = sum(CHAT_CSS), own = sum(/^\/chats\/roof\/(?:core|idb)\.js$/), core = sum(CHAT_CORE) + sum(/^\/chats\/(?:cards|links)\.js$/);
  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  console.log(`budgets: page JS ${kb(page)}, CSS ${kb(css)}, core own ${kb(own)}, core graph ${kb(core)}; unminified: ${js(r.unminified, 400)}`);
  ok(page > 0 && page <= 110 * 1024, `10. page JS ${kb(page)} gz (≤ 110 KB)`);
  ok(css > 0 && css <= 28 * 1024, `10. CSS ${kb(css)} gz (≤ 28 KB)`);
  ok(own > 0 && own <= 36 * 1024, `10. the core’s own code (core.js + idb.js) ${kb(own)} gz (≤ 36 KB)`);
  ok(core > 0 && core <= 55 * 1024, `10. the core graph ${kb(core)} gz (≤ 55 KB)`);
  ok(!r.rows.some((x) => CHAT_LAZY.test(x.path)) && !r.lazy.length, '10. no lazy file (send, sheets, flight, media, scan, settings, rank, geodata) in the first open', js(r.lazy));
  ok(!r.twice.length, '10. no URL fetched twice', js(r.twice));
  const files = (() => { try { return connectorFiles('chats'); } catch (_) { return []; } })(), lazy = (() => { try { return connectorLazy('chats'); } catch (_) { return []; } })();
  const fetched = r.rows.map((x) => x.path).filter((x) => !/\/chats\/roof\/service\.js$/.test(x));
  ok(files.length > 0 && fetched.every((x) => files.includes(x)) && files.length + lazy.length <= 60, '10. every file of the first open is in connector.files (kept offline), files ∪ lazy ≤ 60 (§5.3)', js({ notIn: fetched.filter((x) => !files.includes(x)), n: files.length + lazy.length }));
  // (warm: the Chats tab tapped on Today → the list painted)
  await B.p.goto(`${HUB}/`); await todayUp(B.p); await wait(2500);
  await B.p.evaluate((s) => { window.__t0 = performance.now(); document.querySelector(s).click(); }, H.tab('chats'));
  const dt = await B.p.waitForFunction((s) => { const e = document.querySelector(s); return e && e.getClientRects().length && !e.closest('[hidden]') ? performance.now() - window.__t0 : false; }, hk('chSec', 'chats'), { timeout: 15000, polling: 'raf' }).then((h) => h.jsonValue(), () => null);
  ok(dt != null && dt <= 600, `10. warm, the Chats tab → the list painted in ${dt == null ? 'never' : Math.round(dt) + ' ms'} (≤ 600, §5.6)`);
  await B.ctx.close();
});

// ======================================================================================================================
await part(11, 'a new Chat build mid-session: stale, never reloaded over typed text', 'S3-D15, S3-C7, S1 D21, risk I10', async () => {
// ======================================================================================================================
  const p = G.p;
  await p.goto(`${HUB}/chats/`); await chatsUp(p);
  let newer = false;
  await route(G.ctx, /^http:\/\/ifl\.test:8788\/chats\/version(\?|$)/, async (r) => {
    if (!newer) return r.continue();
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify({ app: 'chat', build: '99.99', min: null }) });
  });
  await p.click(hk('chRow', P.id)); await shown(p, hk('CH_COMPOSER'));
  await p.fill(hk('CH_COMPOSER'), SENT.typed);
  const life = await alive(p), docs = loads(p);
  newer = true;
  // (a lazy sheet asks /chats/version beside its import: Friend Info, from the chat's Info act)
  await p.click(H.hdAct('info')).catch(() => {});
  await shown(p, H.SHEET_OPEN, 15000);
  await p.keyboard.press('Escape'); await gone(p, H.SHEET_OPEN);
  await hide(p); await wait(1500); await show(p); await wait(3000);
  const kept1 = await p.$eval(hk('CH_COMPOSER'), (e) => e.value ?? e.textContent).catch(() => null);
  ok((await life.same()) && docs.n() === 0 && kept1 === SENT.typed, '11. a newer build heard while text is typed: no reload, the text still there (busy(), S3-C7, risk I10)', js({ docs: docs.list, kept1 }));
  await p.fill(hk('CH_COMPOSER'), '');
  await p.click(H.HD_BACK);
  const reloaded = await until(() => docs.n() >= 1, 15000);
  ok(!!reloaded && docs.n() === 1 && (await chatsUp(p)) && (await at(p, '/chats/')), '11. nothing typed, the next route change: one reload at the route (S1 D21)', js(docs.list));
  newer = false; await G.ctx.unroute(/^http:\/\/ifl\.test:8788\/chats\/version(\?|$)/).catch(() => {});
  docs.stop();
});

// ======================================================================================================================
await part(12, 'CSP clean, axe, 390 light and dark', '§6.2, S1 §8.3', async () => {
// ======================================================================================================================
  for (const scheme of ['light', 'dark']) {
    const T = await phone(`george-${scheme}`, { scheme });
    // (George's sign-in on this phone: a fresh trip; Chat's key comes down with it)
    T.seen = []; everyone.push(T);
    const { onAccountPage } = await import('./join.mjs');
    await T.ctx.addCookies((await G.ctx.cookies()).filter((c) => /ifl\.test$/.test(c.domain)));
    await T.p.goto(`${HUB}/chats/#signin-start&then=${encodeURIComponent('/chats/')}`);
    await onAccountPage(T.p, { email: G.who.email }).catch(() => {});
    await T.p.waitForURL((u) => u.host === 'ifl.test:8788' && u.pathname === '/chats/' && !u.hash, { timeout: 60000 }).catch(() => {});
    await chatsUp(T.p); await wait(1500);
    const a1 = await axe(T.p, `list ${scheme}`);
    ok(!a1.length, `12. ${scheme}: the list, no serious axe violation`, js(a1, 900));
    await shot(T.p, `12-list-${scheme}`);
    if (await shown(T.p, hk('chRow', P.id), 15000)) {
      await T.p.click(hk('chRow', P.id)); await shown(T.p, hk('CH_COMPOSER')); await wait(1500);
      const a2 = await axe(T.p, `chat ${scheme}`);
      ok(!a2.length, `12. ${scheme}: a chat, no serious axe violation`, js(a2, 900));
      await shot(T.p, `12-chat-${scheme}`);
      await T.p.click(H.HD_BACK).catch(() => {});
    }
    await T.p.click(H.hdSec('friends')).catch(() => {}); await wait(800);
    const a3 = await axe(T.p, `friends ${scheme}`);
    ok(!a3.length, `12. ${scheme}: Friends, no serious axe violation`, js(a3, 900));
    const w = await T.p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    ok(w <= 0, `12. ${scheme}: no sideways scroll at 390`, String(w));
    const csp = await cspOf(T.p);
    ok(!csp.length, `12. ${scheme}: no CSP refusal`, js(csp));
    await T.ctx.close();
  }
  const csp = await cspOf(G.p);
  ok(!csp.length, '12. George’s page: no CSP refusal through every part', js(csp));
});

// ======================================================================================================================
await part(13, 'a 401 mid-session: “You’ve been signed out of Chats”, 0 Workers', 'S3-D3, risk I3, §9.5', async () => {
// ======================================================================================================================
  const p = G.p;
  await p.goto(`${HUB}/chats/`); await chatsUp(p);
  ok(workers(p).core === 1, '13. one Worker before', js(workers(p)));
  const [st] = await chatApi(G.token, 'logout', {});
  ok(st < 300, '13. George’s Chat session ended on the server (as from another phone’s Sessions)', String(st));
  // (the next sync while shown: 15 s; a hide and show asks sooner)
  await hide(p); await wait(500); await show(p);
  const ended = await p.waitForFunction((s) => /signed out of Chats/.test(document.querySelector(s)?.textContent || ''), hk('M_CHATS'), { timeout: 40000 }).then(() => true, () => false);
  ok(ended, '13. the Chats screen: “You’ve been signed out of Chats” + Sign In (ended, §2.1)', await textOf(p, hk('M_CHATS')));
  const none = await until(() => workers(p).core === 0, 15000);
  ok(!!none, '13. …and no Worker left on the page (risk I3, §9.5)', js(workers(p)));
  ok(!(await engines(p)), '13. no engine made in its place (S3-D12)');
  ok(!(await count(p, hk('CH_BUBBLE'))) && !(await p.evaluate((ws) => ws.some((w) => document.body.innerText.includes(w)), ALL)), '13. no message words left in the page');
  await shot(p, '13-ended');
});

ok(!MISSING.size, 'every hook this test uses is in roofhooks.mjs (B0’s; the missing ones asked of B0)', js([...MISSING]));
// (the framework's pages and Chats under the roof; Chat's own page is Pat's and Leo's, its errors theirs)
const all = everyone.filter((x) => !['pat', 'leo'].includes(x.name)).flatMap((x) => x.errs || []);
ok(!all.some((e) => /CSP violation|Refused to/.test(e)), 'no CSP violation on any page', js(all.filter((e) => /CSP|Refused/.test(e)).slice(0, 6)));
ok(!all.length, 'no page error and no console error on any of George’s pages', js(all.slice(0, 8)));
await closeAll(); await K.b.close().catch(() => {});
console.log(`FAILS ${fails()}`);
process.exit(0);
