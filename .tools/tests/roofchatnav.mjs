// needs: hub roof-chats
// Getting about with Chats under the roof (One roof stage 3, roof/s3/spec.md §10.2, batch Q), in real Chromium against
// the hub stack with Chats switched on (ROOF_CHATS "1"):
//   1 Chat's push taps: the framework open (in the page: #open=<id> that chat, #requests Requests, sheets closed first)
//     and closed (a new window at /chats/#open=<id>) (§2.5, S1 D10)
//   2 Chats switched off mid-session (the client's side, stood in with routes as roofnav part 8 does for Weather):
//     Weather stays mounted, the core goes and IFL.hub.chat is the original again; a shown Chats bounces once to
//     milestone 1's page; a message the core queued while the network failed is sent by milestone 1's page (§8, S3-D12,
//     risks I7, I8)
//   3 Chat's old /chats/ worker (a stand-in) retired without reloading a framework window; /chats/in/ never navigated
//     to by it; Chats offline from what's kept (§6.3, §7, risk I11)
//   4 the sign-in hop: /chats/#signin=… → /chats/in/ (same hash), the whole trip round, and /chats/in/ with a session
//     and no sign-in under way → /chats/ (S3-D8, risk I13)
// Selectors only from roofhooks.mjs (a missing hook fails by name); Chat's own page (milestone 1's, Pat's) by its own
// markup, as the standalone tests do.
import * as H from './roofhooks.mjs';
import { kit } from './lib.mjs';
import {
  HUB, CHAT, EXCEPT, checker, phone, chatPhone, befriend, workers, hunt, alive, loads, history, here, shown, gone, textOf, attrOf, count,
  hide, show, route, tapNotification, rootWorker, wxServer, weatherAccount, PLACES, wait, until, js, closeAll, hostCall,
} from './rooflib.mjs';

const [,, S, out] = process.argv;
const { ok, part, fails } = checker();
process.on('uncaughtException', (e) => { console.log(`FAIL  crashed: ${String(e?.message || e).split('\n')[0]}`); console.log(`FAILS ${fails() + 1}`); process.exit(0); });
const K = await kit(S, out);
const one = (q) => { try { return K.one(q); } catch (_) { return []; } };
const shot = (p, name) => p.screenshot({ path: `${out}/${name}.png` }).catch(() => {});
const MISSING = new Set();
const hk = (name, ...a) => { const v = H[name]; if (v == null) { MISSING.add(name); return `[data-missing-hook="${name}"]`; } return typeof v === 'function' ? v(...a) : v; };
const at = (p, path, ms = 15000) => p.waitForFunction((u) => location.pathname + location.search + location.hash === u, path, { timeout: ms }).then(() => true, () => false);
const chatsUp = async (p, ms = 30000) => (await shown(p, hk('M_CHATS'), ms)) && (await shown(p, hk('chSec', 'chats'), ms));
const todayUp = async (p, ms = 30000) => (await shown(p, H.TODAY, ms)) && (await shown(p, H.HD_TITLE, ms));
const engines = (p) => count(p, EXCEPT.CHAT_ENGINE);
const bubbleHas = (p, t, ms = 30000) => p.waitForFunction(([b, t]) => [...document.querySelectorAll(b)].some((x) => x.textContent.includes(t)), [hk('CH_BUBBLE'), t], { timeout: ms }).then(() => true, () => false);
const lettersTo = (from, to) => Number(one(`SELECT COUNT(*) AS n FROM pg_msgs WHERE sender = '${from}' AND recipient = '${to}'`)[0]?.n || 0);
// (another phone of George's: his cookies, then the sign-in trip, which brings Chat's key down to it)
async function georgeAgain(name, o = {}) {
  const ph = await phone(name, o);
  ph.seen = [];
  await ph.ctx.addCookies((await G.ctx.cookies()).filter((c) => /ifl\.test$/.test(c.domain)));
  const { onAccountPage } = await import('./join.mjs');
  await ph.p.goto(`${HUB}/chats/#signin-start&then=${encodeURIComponent(o.then || '/chats/')}`);
  await onAccountPage(ph.p, { email: G.who.email }).catch((e) => console.log('note: the account page', e.message));
  await ph.p.waitForURL((u) => u.host === 'ifl.test:8788' && !u.pathname.startsWith('/chats/in/') && !/#signin/.test(u.hash), { timeout: 60000 }).catch(() => {});
  everyone.push(ph);
  return ph;
}

wxServer();
const G = await chatPhone('george', { join: { name: 'George Farrow', handle: 'georgenav' } });
const P = await chatPhone('pat', { at: 'chat', join: { name: 'Pat Reed', handle: 'patnav' } });
const everyone = [G, P];
ok(!!(G.token && P.token) && (await befriend(G, P)), 'George at the hub and Pat at Chat’s own address, friends', js([G.id, P.id]));
await G.p.goto(`${HUB}/robots.txt`);
await weatherAccount(G.p, { places: [PLACES.London], settings: { temp: 'c' } });
// (where George is, as Chat keeps it, and the two of them writing as messages there at once (each chat's usual way), as
// roofchats has it: letters by pigeon would still be in the air when they're looked for)
K.sql(`UPDATE pg_users SET lat = 51.5072, lon = -0.1276 WHERE id = '${G.id}'`);
K.sql(`UPDATE pg_ways SET way = 'instant' WHERE a IN ('${G.id}', '${P.id}') AND b IN ('${G.id}', '${P.id}')`);
K.sql(`UPDATE pg_users SET new_way = 'instant' WHERE id IN ('${G.id}', '${P.id}')`);
const QUEUED = 'Posting this while the signal is gone';
// (Pat's answer, on Chat's own page, so George has something to be told of; the chat asked for again until it's drawn,
// as Pat's page may not have her friends yet)
for (let k = 0; k < 5; k++) {
  await P.p.evaluate((id) => { history.replaceState(null, '', location.pathname); location.hash = '#open=' + id; }, G.id);
  if (await P.p.waitForSelector('#msg', { timeout: 5000 }).then(() => true, () => false)) break;
}
await P.p.fill('#msg', 'Are you on the late train tonight'); await P.p.click('.send'); await wait(1200);

// ======================================================================================================================
await part(1, 'Chat’s push taps: the framework open (in the page) and closed (a new window)', '§2.5, S1 D10, D22', async () => {
// ======================================================================================================================
  const p = G.p;
  await p.goto(`${HUB}/`); await todayUp(p);
  ok(!!(await rootWorker(G.ctx, 30000)), '1. the root worker running');
  await p.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 30000 }).catch(() => {});
  await p.click(H.HD_SEARCH); const sheetUp = await shown(p, `${H.SEARCH_SHEET}[open]`);
  const life = await alive(p), docs = loads(p);
  const r = await tapNotification(G.ctx, { app: 'chat', url: `/pigeon/#open=${P.id}` });
  const went = (await at(p, `/chats/#open=${P.id}`, 20000)) && (await shown(p, hk('CH_COMPOSER'), 30000));
  ok(sheetUp && r === 'done' && went, '1. a message push tapped, Today open with a sheet up: Pat’s chat in the page (/pigeon/#open= → /chats/#open=, the worker’s { ifl: "route" })', js({ r, at: here(p) }));
  ok(!(await count(p, H.SHEET_OPEN)) && (await life.same()) && docs.n() === 0, '1. …the sheet closed first, the same document (D22, §2.5)', js(docs.list));
  ok(workers(p).core === 1 && !(await engines(p)), '1. one Worker, no engine', js(workers(p)));
  const r2 = await tapNotification(G.ctx, { app: 'chat', url: '/pigeon/#requests' });
  const req = (await shown(p, hk('chSec', 'friends'), 20000)) && (await shown(p, `${H.sheet('requests')}[open]`, 20000));
  ok(r2 === 'done' && req && (await life.same()), '1. a friend-request push tapped, a chat open: Friends and the Requests sheet, in the page', js({ r2, at: here(p) }));
  await p.keyboard.press('Escape').catch(() => {});
  const r3 = await tapNotification(G.ctx, { app: 'chat', url: '/pigeon/' });
  ok(r3 === 'done' && (await at(p, '/chats/', 20000)) && (await chatsUp(p)) && (await life.same()), '1. any other Chat push: the list, in the page', js({ r3, at: here(p) }));
  docs.stop();
  // (no window open: the worker opens one at /chats/#open=<id>; opened here as the browser would)
  const keep = await G.ctx.newPage(); await keep.goto('about:blank');
  for (const pg of G.ctx.pages()) if (pg !== keep) await pg.close();
  const r4 = await tapNotification(G.ctx, { app: 'chat', url: `/pigeon/#open=${P.id}` }, { window: 'record' });
  const url = /^open (.+)$/.exec(r4)?.[1] || null;
  let u = null; try { u = new URL(url); } catch (_) {}
  ok(!!u && u.origin === HUB && u.pathname === '/chats/' && u.hash === `#open=${P.id}`, '1. no window open: a new one at /chats/#open=<id> (clients.openWindow)', r4);
  const w = await G.ctx.newPage(); G.p = w;
  if (u) await w.goto(u.href).catch(() => {});
  ok(!!u && (await shown(w, hk('CH_COMPOSER'), 30000)) && (await at(w, `/chats/#open=${P.id}`)), '1. …that window: Pat’s chat under the roof', here(w));
  await keep.close();
});

// ======================================================================================================================
await part(2, 'Chats switched off mid-session: Weather stays, the core goes, a shown Chats bounces, the queued letter goes', '§8, S3-D12, S3-D4, risks I7, I8', async () => {
// ======================================================================================================================
  // (the switch's client side stood in for with routes, as roof.yml app=chats state=off leaves the Worker: /api/hub
  // apps.chats false, /chats/roof/* 404, /chats/ milestone 1's page (Chat's hub copy, fetched from the site as the hub
  // forwards it when Chats is off); no service worker, so the routes reach the page)
  const R = await georgeAgain('george-off', { sw: 'block', clock: true, then: '/chats/' });
  R.off = false; R.fail = false;
  await route(R.ctx, /^http:\/\/ifl\.test:8788\/api\/hub(\?|$)/, async (r) => {
    if (!R.off) return r.continue();
    const real = await r.fetch().then((x) => x.json()).catch(() => ({ ready: true, roof: true, apps: { weather: true } }));
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify({ ...real, apps: { ...(real.apps || {}), chats: false } }) });
  });
  await route(R.ctx, /^http:\/\/ifl\.test:8788\/chats\/roof\//, (r) => (R.off ? r.fulfill({ status: 404, contentType: 'text/plain', headers: { 'Cache-Control': 'no-store' }, body: 'Not found' }) : r.continue()));
  await route(R.ctx, /^http:\/\/ifl\.test:8788\/chats\/(index\.html)?(#.*)?$/, async (r) => {
    if (!(R.off && r.request().isNavigationRequest())) return r.continue();
    // (Chat's hub copy as the hub forwards it, with its key and marker: /chats/in/ is the same page as /_hub/'s, S3-D8;
    // asked of Chat's host directly, the page has no hub marker and goes to Chat's own address)
    // (asked of the hub's Worker from here, as Chromium's resolver rules send ifl.test: route.fetch has no name for it
    // where there's no hosts entry, and the request went on to the framework's page, which then left for Chat's address)
    const m1 = await hostCall('ifl.test:8788', '/chats/in/', undefined, { cookie: (await r.request().allHeaders()).cookie });
    const headers = Object.fromEntries(Object.entries(m1.headers).filter(([k]) => !/^(content-length|transfer-encoding|connection|keep-alive|set-cookie|content-encoding)$/i.test(k)).map(([k, v]) => [k, String(v)]));
    return r.fulfill({ status: m1.status, headers, body: m1.text });
  });
  // (the network failing for the core's sends: the letter stays in the sealed outbox, S3-D4)
  await route(R.ctx, /\/api\/pigeon\/(group-)?messages(\?|$)/, (r) => (R.fail && r.request().method() === 'POST' ? r.abort('internetdisconnected') : r.continue()));
  const q = R.p;

  // a. Weather showing as Chats goes: Weather stays mounted (the same page), the core terminated, IFL.hub.chat original
  await q.goto(`${HUB}/chats/`); await chatsUp(q);
  ok(workers(q).core === 1, '2a. Chats under the roof first, one Worker', js(workers(q)));
  await q.click(H.tab('apps')).catch(() => {}); await shown(q, H.appTile('weather'), 20000);
  await q.evaluate((s) => document.querySelector(s)?.click(), EXCEPT.tileLink('weather'));
  await shown(q, `${H.M_WEATHER} ${H.WX_HERO}`, 30000);
  const life = await alive(q), docs = loads(q);
  R.off = true;
  await hide(q); await R.ctx.clock.fastForward('06:00'); await show(q);
  const unmounted = await until(async () => !(await count(q, hk('M_CHATS'))) && workers(q).core === 0, 20000);
  ok(!!unmounted && (await life.same()) && docs.n() === 0 && (await count(q, H.M_WEATHER)) === 1, '2a. on coming back: Chats unmounted and its core terminated; Weather still mounted, the same page (risk I7, setRoof per app)', js({ w: workers(q), docs: docs.list }));
  const orig = await q.evaluate(async () => { const c = await window.IFL.hub.chat(); return !!c && typeof c.share === 'function'; }).catch(() => false);
  ok(orig && (await until(async () => (await engines(q)) === 1, 20000)), '2a. IFL.hub.chat the original again: asked, it makes Chat’s engine (milestone 1’s, S3-D12)', String(await engines(q)));
  const tabGo = q.waitForURL((u) => u.pathname === '/chats/', { timeout: 20000 }).then(() => true, () => false);
  await q.click(H.tab('chats'));
  ok((await tabGo) && docs.n() >= 1, '2a. the Chats tab now navigates (to milestone 1’s page)', js(docs.list));
  docs.stop();

  // b. Chats showing, a letter queued in the core while the network fails, then Chats switched off: one bounce to
  // milestone 1's page, which sends the queued letter (same data, S3-D4, risk I8)
  R.off = false;
  // (by another page first: from milestone 1's page at /chats/, where the tab went, /chats/#open= is only a new hash)
  await q.goto(`${HUB}/robots.txt`);
  await q.goto(`${HUB}/chats/#open=${P.id}`); await shown(q, hk('CH_COMPOSER'), 30000);
  const n0 = lettersTo(G.id, P.id);
  R.fail = true;
  await q.fill(hk('CH_INPUT'), QUEUED); await q.click(hk('CH_SEND_BTN'));
  await wait(3000);
  ok(lettersTo(G.id, P.id) === n0, '2b. the network failing: nothing reached the server (queued in the core’s sealed outbox)');
  const docs2 = loads(q);
  R.off = true;
  await hide(q); await R.ctx.clock.fastForward('06:00'); R.fail = false; await show(q);
  const m1 = await q.waitForFunction(() => !document.querySelector('main#m-chats') && !!document.querySelector('#msg, .tabs, .welcome'), null, { timeout: 30000 }).then(() => true, () => false);
  await wait(2000);
  const marker = await q.evaluate(() => sessionStorage.getItem('ifl-roof-bounce')).catch(() => null);
  ok(m1 && docs2.n() === 1 && new URL(docs2.list[0] || 'http://x/').pathname === '/chats/', '2b. the shown Chats bounces once, to /chats/: milestone 1’s page (D14’s bounce, S3-D12)', js(docs2.list));
  ok(marker === '1', '2b. …with ifl-roof-bounce "1" as its marker', String(marker));
  const sent = await until(() => lettersTo(G.id, P.id) === n0 + 1, 40000);
  ok(!!sent, '2b. milestone 1’s page sends the letter the core had queued (the same outbox, risk I8)', js({ before: n0, now: lettersTo(G.id, P.id) }));
  await P.p.evaluate((id) => { history.replaceState(null, '', location.pathname); location.hash = '#open=' + id; }, G.id);
  ok(await P.p.waitForFunction((t) => document.body.innerText.includes(t), QUEUED, { timeout: 40000 }).then(() => true, () => false), '2b. …and Pat reads it, once', '');
  ok(lettersTo(G.id, P.id) === n0 + 1, '2b. sent once only (no second copy from a second writer, risk I9)', String(lettersTo(G.id, P.id)));
  await shot(q, '2-milestone1');
  docs2.stop();
  await R.ctx.close();
});

// ======================================================================================================================
await part(3, 'Chat’s old /chats/ worker retired without reloading a framework window; /chats/in/ never navigated; offline from what’s kept', '§6.3, §7, risk I11', async () => {
// ======================================================================================================================
  const O = await georgeAgain('george-sw', { standalone: true, then: '/' });
  const q = O.p, toIn = [];
  O.ctx.on('page', (pg) => pg.on('framenavigated', (f) => { if (/\/chats\/in\//.test(f.url())) toIn.push(f.url()); }));
  q.on('framenavigated', (f) => { if (/\/chats\/in\//.test(f.url())) toIn.push(f.url()); });
  // (Chat's old worker stood in for: a worker at /chats/sw.js with scope /chats/, as milestone 1's page registered it)
  let oldWorker = true;
  await route(O.ctx, /^http:\/\/ifl\.test:8788\/chats\/sw\.js(\?|$)/, (r) => (oldWorker
    ? r.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'Cache-Control': 'no-store' }, body: 'self.addEventListener("install", () => self.skipWaiting()); self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim())); self.addEventListener("fetch", () => {}); self.__old = 1;' })
    : r.continue()));
  await q.goto(`${HUB}/robots.txt`);
  const reg = await q.evaluate(() => navigator.serviceWorker.register('/chats/sw.js', { scope: '/chats/' }).then((r) => r.scope, (e) => `no: ${e}`));
  ok(/\/chats\/$/.test(reg), '3. Chat’s old worker (a stand-in) registered at /chats/', reg);
  oldWorker = false;
  const docs = loads(q);
  await q.goto(`${HUB}/chats/`); await chatsUp(q);
  const life = await alive(q); docs.reset();
  const gone1 = await until(() => q.evaluate(() => navigator.serviceWorker.getRegistrations().then((rs) => !rs.some((r) => new URL(r.scope).pathname === '/chats/'))), 20000);
  ok(!!gone1, '3. the framework page unregisters it before its core starts (retireOld, opts.retired)', '');
  ok((await life.same()) && docs.n() === 0 && workers(q).core === 1, '3. …and isn’t reloaded; one core Worker', js({ docs: docs.list, w: workers(q) }));
  // (the same old worker again, now updated to the hub's retire script while a framework window is open at /chats/)
  oldWorker = true;
  const side = await O.ctx.newPage(); await side.goto(`${HUB}/robots.txt`);
  await side.evaluate(() => navigator.serviceWorker.register('/chats/sw.js', { scope: '/chats/' }));
  await wait(1500); oldWorker = false;
  await side.evaluate(() => navigator.serviceWorker.getRegistrations().then((rs) => Promise.all(rs.filter((r) => new URL(r.scope).pathname === '/chats/').map((r) => r.update())))).catch(() => {});
  const gone2 = await until(() => side.evaluate(() => navigator.serviceWorker.getRegistrations().then((rs) => !rs.some((r) => new URL(r.scope).pathname === '/chats/'))), 30000);
  await wait(2500);
  ok(!!gone2 && (await life.same()) && docs.n() === 0, '3. the hub’s retire script (RETIRE_SW("chats")): gone, the open framework window routed in the page, not reloaded', js({ gone2, docs: docs.list }));
  ok(!toIn.length, '3. /chats/in/ never navigated to, by the page or the retire script (risk I11)', js(toIn));
  await side.close();
  // offline: the framework from the root worker's kept /, the module and core from roof-chats-<BUILD>, the list and the
  // chat opened before from the core's cache (§7)
  await q.goto(`${HUB}/chats/#open=${P.id}`); await shown(q, hk('CH_COMPOSER'), 30000);
  await bubbleHas(q, 'late train', 30000);
  await q.click(H.HD_BACK).catch(() => {}); await chatsUp(q); await wait(12000);
  await O.ctx.setOffline(true);
  await q.reload().catch(() => {});
  const off = (await chatsUp(q, 30000)) && (await shown(q, hk('chRow', P.id), 20000));
  ok(off, '3. offline, /chats/ opened again: the list from what’s kept (§7)', await textOf(q, hk('M_CHATS')));
  await q.click(hk('chRow', P.id)).catch(() => {});
  ok(await bubbleHas(q, 'late train', 20000), '3. …and Pat’s chat, opened before, from the core’s cache (§7)');
  await O.ctx.setOffline(false);
  await O.ctx.close();
});

// ======================================================================================================================
await part(4, 'the sign-in hop: /chats/#signin=… → /chats/in/; the trip round; /chats/in/ with a session → /chats/', 'S3-D8, risks B1, I13', async () => {
// ======================================================================================================================
  const p = G.p;
  for (const h of ['#signin=abc123', '#verify=abc123', '#invite=abc123', '#reset=abc123']) {
    const d = loads(p);
    await p.goto(`${HUB}/robots.txt`); d.reset();
    await p.goto(`${HUB}/chats/${h}`).catch(() => {});
    const hop = await p.waitForURL((u) => u.pathname === '/chats/in/', { timeout: 20000 }).then(() => true, () => false);
    ok(hop && d.list.some((u) => new URL(u).pathname === '/chats/in/') && d.list.every((u) => !new URL(u).search), `4. /chats/${h}: hopped to /chats/in/${h} (location.replace, the same hash, S3-D8)`, js({ at: here(p), docs: d.list }));
    d.stop();
  }
  // the whole trip, on another phone of George's: /chats/#signin-start&then=/chats/ → /chats/in/ → the account's page →
  // /chats/#signin=<code> → /chats/in/#signin= → /chats/, unlocked
  const T = await phone('george-trip');
  T.seen = []; everyone.push(T);
  await T.ctx.addCookies((await G.ctx.cookies()).filter((c) => /ifl\.test$/.test(c.domain)));
  const navs = []; T.p.on('framenavigated', (f) => { if (f === T.p.mainFrame()) navs.push(f.url()); });
  const { onAccountPage } = await import('./join.mjs');
  await T.p.goto(`${HUB}/chats/#signin-start&then=${encodeURIComponent('/chats/')}`);
  await onAccountPage(T.p, { email: G.who.email }).catch((e) => console.log('note: the account page', e.message));
  const home = await T.p.waitForURL((u) => u.host === 'ifl.test:8788' && u.pathname === '/chats/' && !u.hash.startsWith('#signin'), { timeout: 60000 }).then(() => true, () => false);
  const path = navs.map((u) => { const x = new URL(u); return x.host === 'ifl.test:8788' ? x.pathname + x.hash.replace(/=.*$/, '=…') : x.host; });
  const ins = path.filter((x) => x.startsWith('/chats/in/')).length;
  ok(home && ins >= 2 && (await chatsUp(T.p)) && (await shown(T.p, hk('chRow', P.id), 30000)), '4. the sign-in trip round: through /chats/in/ both ways, back at /chats/ under the roof, unlocked', js(path));
  // /chats/in/ with a session and no sign-in under way: never the full app there (Back, a bookmark, Not Now). On the trip's
  // phone, whose Chat session is the live one: each phone of George's here shares his InFlite cookie, so each sign-in
  // replaces the Chat session the one before had
  for (const [from, to] of [['/chats/in/', '/chats/'], [`/chats/in/#open=${P.id}`, `/chats/#open=${P.id}`]]) {
    await T.p.goto(`${HUB}${from}`).catch(() => {});
    const went = await at(T.p, to, 20000);
    ok(went && (await shown(T.p, hk('M_CHATS'), 20000)) && (await count(T.p, hk('M_CHATS'))) === 1, `4. ${from} with a session and no sign-in under way: ${to}, under the roof (S3-D8 c, risk I13)`, here(T.p));
  }
  await T.ctx.close();
  await p.goto(`${HUB}/chats/in/#account`).catch(() => {});
  await wait(4000);
  ok(new URL(p.url()).pathname === '/chats/in/' && !(await count(p, hk('M_CHATS'))), '4. /chats/in/#account stays Chat’s own page (Privacy & Security, S3-D8)', here(p));
});

// privacy: what was typed and queued is in no request, log or storage outside Chat's own store
const found = await hunt([QUEUED], { S, seen: everyone.flatMap((x) => x.seen || []) });
ok(!found.length, 'the letter queued and sent in no request URL or body, hub log, stack log (rule 5)', js(found.slice(0, 4)));
ok(!MISSING.size, 'every hook this test uses is in roofhooks.mjs (B0’s; the missing ones asked of B0)', js([...MISSING]));
// (and, offline, the browser's own note that Chat's page asked for a cross-fade to a page that doesn't take part in
// one (Chat's @view-transition, Today's none): the fade's skipped, nothing is shown, nothing fails)
const all = everyone.filter((x) => x.name !== 'pat').flatMap((x) => x.errs || []).filter((e) => !/george-off .*(404|Failed to fetch dynamically imported module|Transition was aborted because of invalid state\. ViewTransition opt-in disabled)/.test(e));
ok(!all.some((e) => /CSP violation|Refused to/.test(e)), 'no CSP violation on any page', js(all.filter((e) => /CSP|Refused/.test(e)).slice(0, 6)));
ok(!all.length, 'no page error and no console error on George’s pages (part 2’s refused module files aside)', js(all.slice(0, 8)));
await closeAll(); await K.b.close().catch(() => {});
console.log(`FAILS ${fails()}`);
process.exit(0);
