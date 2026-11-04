// needs: hub roof-markets roof-fitness roof-chats
// Getting about under the roof (One roof, spec §10.2): notification taps delivered into the open framework page
// (the root worker's { ifl: "route" }), into Chats' page as before, and into a new window when none is open; round trips
// to the pages that aren't modules yet (Chats, Markets, Fitness, Mail) and back, with route and scroll (ifl-roof-y); the
// hub pages' tab bar into the framework and the bar itself the same bar on both (UI2); browser back with a sheet open;
// and the roof turned off while a page is open (the client's side, stood in with routes: /api/hub roof:false, the
// module's files 404, /weather/ milestone 1's page) [RB6b]. Stage 2 (its spec §9.2): Markets and Fitness are modules
// here (hubstack's roof-markets, roof-fitness), so Apps → Markets and a Today row → Fitness open in the page; one module
// turned off (/api/hub apps.markets false) bounces a shown Markets while Weather stays in the page; and a framework page
// served at an off module's path (the worker's kept / stood in) doesn't loop (RI4). In real Chromium against the hub stack.
// Every check's line names the spec section it proves; every selector of the framework's is roofhooks.mjs's (§3.14),
// save rooflib's declared exceptions (EXCEPT: a tile's link, a hub page's tab bar, the shared block's IFL.hub.tabs, which
// stage 1 doesn't change; only Chats draws it at the hub).
// Stage 3 (roof/s3/spec.md §10.2, batch Q): the test reads whether Chats is under the roof from the hub (/api/hub
// apps.chats) and proves that state. Chats on (this file's own first line, ROOF_CHATS "1"): /chats/ is the framework's,
// so Weather → Chats is in the page, a tap with Chats open routes in the page, the hub-page tab-bar checks become the
// framework's own tabs from Chats, and the tab-bar pixel check is framework Today vs framework Chats (S3-D16). Chats off
// (roofnavoff.mjs runs this same file with plain `// needs: hub`): exactly stage 1's checks, Chats' own page at /chats/
// (the switched-off path, s24 §1).
import * as H from './roofhooks.mjs';
import {
  HUB, OWN, EXCEPT, checker, phone, account, wxServer, weatherAccount, alive, loads, history, here, shown, gone, textOf, attrOf, count, hide, show, route,
  tapNotification, rootWorker, hostCall, alike, PLACES, wait, until, js, closeAll,
} from './rooflib.mjs';

const [,, S, out] = process.argv;
const { ok, part, fails } = checker();
process.on('uncaughtException', (e) => { console.log(`FAIL  crashed: ${String(e?.message || e).split('\n')[0]}`); console.log(`FAILS ${fails() + 1}`); process.exit(0); });
const shot = (p, name) => p.screenshot({ path: `${out}/${name}.png` }).catch(() => {});
const { London } = PLACES;

wxServer();
const acct = await account('Noor Haddad', 'noorroof');
ok(!!acct.cookies, 'an account made at the tests’ sign-in page, its cookie on the tests’ site', js(acct.json));
const cookies = acct.cookies || {};
const everyone = [];
const open = async (name, o = {}) => { const ph = await phone(name, { cookies, ...o }); everyone.push(ph); return ph; };

const at = (p, path, ms = 15000) => p.waitForFunction((u) => location.pathname + location.search + location.hash === u, path, { timeout: ms }).then(() => true, () => false);
const weatherUp = async (p, ms = 30000) => (await shown(p, H.M_WEATHER, ms)) && (await shown(p, `${H.M_WEATHER} ${H.WX_HERO}`, ms));
// (Weather's screen on a section that isn't Now, where the hero is hidden)
const screenUp = async (p, sec, ms = 30000) => (await shown(p, H.M_WEATHER, ms)) && (await shown(p, `${H.M_WEATHER} ${H.wxSec(sec)}`, ms));
const todayUp = async (p, ms = 30000) => (await shown(p, H.TODAY, ms)) && (await shown(p, H.HD_TITLE, ms));
const tapTile = (p, app = 'weather') => p.evaluate((s) => { const a = document.querySelector(s); if (!a) return false; a.click(); return true; }, EXCEPT.tileLink(app));
// (Weather's own address stood in for: a page there, so a way out to it is seen and goes nowhere real)
const OWN_AT = /^https?:\/\/weather\.(?:ifl\.test:8788|inflite\.ai)\//;
const ownPage = (ctx) => route(ctx, OWN_AT, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>Weather</title><h1>WEATHER ON ITS OWN</h1>' }));
// (→ the address the page landed on there, its hash included: a navigation request's own URL never carries the hash)
const leaving = (p, ms = 20000) => p.waitForURL((u) => OWN_AT.test(u.href), { timeout: ms }).then(() => p.url(), () => null);
// (a hub page's own Back: the shared block's IFL.hub.back(), what its Back button calls)
const hubBack = (p) => p.evaluate(() => window.IFL?.hub?.back?.() ?? 'none').catch(() => 'navigated');
const hubPageUp = (p, path) => p.waitForFunction((x) => location.pathname === x && !!window.IFL?.hub?.on, path, { timeout: 30000 }).then(() => true, () => false);

// (Chats under the roof or not: the hub's own word, s24 §2)
const hubSays = await (await fetch('http://127.0.0.1:8787/api/hub', { headers: { Host: 'ifl.test:8788' } }).catch(() => null))?.json().catch(() => null);
const CHATS_ON = hubSays?.apps?.chats === true;
console.log(`Chats ${CHATS_ON ? 'under the roof (ROOF_CHATS "1")' : 'on its own page (switched off)'}: ${js(hubSays?.apps)}`);
// (B0's Chats hooks; a missing one fails by name, never a selector of our own)
const MISSING = new Set();
const hk = (name, ...a) => { const v = H[name]; if (v == null) { MISSING.add(name); return `[data-missing-hook="${name}"]`; } return typeof v === 'function' ? v(...a) : v; };
// (Chats' screen up: its list, or, for Noor (signed in to InFlite here, never to Chat), its state's screen, §2.1)
const chatsUp = async (p, ms = 30000) => (await shown(p, hk('M_CHATS'), ms)) && ((await shown(p, hk('chSec', 'chats'), Math.min(ms, 5000))) || (await shown(p, `${hk('M_CHATS')} [data-state]`, ms)));

const N = await open('noor');
const { p } = N;
await p.goto(`${HUB}/robots.txt`);
const seeded = await weatherAccount(p, { places: [London], settings: { temp: 'c' } });
ok(seeded.s === 200, 'Noor’s Weather place in the account (London)', js(seeded));

// (a milestone-1 page stood in for, as the real one is in this: it takes the hub's cross-fade in (its styles.css, menu.css's
// @view-transition) and catches the one it opens with as its head is read (as today/public/fade.js and menu.js do), so a
// cross-fade called off as it arrives (an opt-in it hasn't, the window's size changed) is never an error on the page)
const M1_PAGE = (app) => `<!doctype html><meta charset="utf-8"><title>${app}</title><style>@view-transition { navigation: auto; }</style><script>(() => { const t = document.activeViewTransition; if (t) for (const k of ['ready', 'finished', 'updateCallbackDone']) t[k]?.catch?.(() => {}); })();</script><h1>MILESTONE 1 ${app.toUpperCase()}</h1>`;

// ======================================================================================================================
await part(1, 'a notification tapped with the framework open: in the page, sheets closed first', '§3.2, §8.2 openIn, D10, D22', async () => {
// ======================================================================================================================
  await p.goto(`${HUB}/`);
  await todayUp(p);
  const sw = await rootWorker(N.ctx, 30000);
  await p.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 30000 }).catch(() => {});
  ok(!!sw, '1. the root worker running (scope /)');
  await p.click(H.HD_SEARCH);
  const sheetUp = await shown(p, `${H.SEARCH_SHEET}[open]`);
  const life = await alive(p), docs = loads(p), h0 = (await history(p)).length;
  const r = await tapNotification(N.ctx, { app: 'weather', url: '/weather/#warnings' });
  const went = (await shown(p, H.wxSec('warnings'), 30000)) && (await at(p, '/weather/#warnings'));
  ok(sheetUp && r === 'done' && went, '1. a Weather notification tapped (/weather/#warnings), Today open with Search’s sheet up: Warnings shown (the worker’s { ifl: "route" })', js({ r, url: here(p) }));
  ok(!(await count(p, H.SHEET_OPEN)), '1. …the sheet closed first (D22)');
  const hs = (await history(p)).slice(h0);
  ok((await life.same()) && docs.n() === 0 && hs.some((x) => x.kind === 'push'), '1. …in the same page, pushed (no document fetched, §3.2)', js({ docs: docs.list, hs: hs.map((x) => x.kind) }));
  ok(N.pages.length === 1, '1. one window', String(N.pages.length));
  docs.stop();
});

// ======================================================================================================================
await part(2, CHATS_ON ? 'a notification tapped with Chats open (under the roof): in the page' : 'a notification tapped with Chats open: Chats navigates as now', CHATS_ON ? '§8.2 openIn, S3 §2.5' : '§8.2 openIn, D8', async () => {
// ======================================================================================================================
  await p.goto(`${HUB}/chats/`);
  if (CHATS_ON) {
    await chatsUp(p);
    const life = await alive(p), docs = loads(p);
    const r = await tapNotification(N.ctx, { app: 'weather', url: '/weather/#radar' });
    const went = (await at(p, '/weather/#radar', 30000)) && (await shown(p, H.wxSec('radar'), 30000));
    ok(r === 'done' && went && (await life.same()) && docs.n() === 0 && N.pages.length === 1, '2. tapped with Chats open under the roof: the framework routes in the page ({ ifl: "route" }), Weather’s Radar, the same document, one window (S3 §2.5)', js({ r, url: here(p), docs: docs.list, pages: N.pages.length }));
    docs.stop();
    return;
  }
  await hubPageUp(p, '/chats/'); await wait(1500);
  const r = await tapNotification(N.ctx, { app: 'weather', url: '/weather/#radar' });
  const went = (await at(p, '/weather/#radar', 30000)) && (await shown(p, H.wxSec('radar'), 30000));
  ok(r === 'done' && went && N.pages.length === 1, '2. tapped with Chats open: Chats goes there itself ({ ifl: "open" }, as in milestone 1), Weather’s Radar under the roof, one window', js({ r, url: here(p), pages: N.pages.length }));
});

// ======================================================================================================================
await part(3, 'a notification tapped with no window open: the framework at /weather/?lat…', '§8.2 openIn, D6', async () => {
// ======================================================================================================================
  const keep = await N.ctx.newPage();     // (not a page of the site's: the context stays, with no window of its own)
  await keep.goto('about:blank');
  for (const pg of N.ctx.pages()) if (pg !== keep) await pg.close();
  const r = await tapNotification(N.ctx, { app: 'weather', url: `/weather/?lat=${London.lat}&lon=${London.lon}&name=London` }, { window: 'record' });
  const url = /^open (.+)$/.exec(r)?.[1] || null;
  let wanted = null; try { wanted = new URL(url); } catch (_) {}
  ok(!!wanted && wanted.origin === HUB && wanted.pathname === '/weather/' && wanted.searchParams.get('name') === 'London', '3. tapped with no window: the worker opens a new one at /weather/?lat…&name=London (clients.openWindow, §8.2)', r);
  // (opened as the browser would on a real tap: a new window at that address)
  const w = await N.ctx.newPage();
  if (wanted) await w.goto(wanted.href).catch(() => {});
  const up = wanted && (await weatherUp(w)) && (await w.waitForFunction((s) => document.querySelector(s)?.textContent.trim() === 'London', H.HD_TITLE, { timeout: 20000 }).then(() => true, () => false));
  ok(!!up, '3. …that window: the framework, Weather on London (D6)', w.url());
  ok(!!up && (await at(w, '/weather/')), '3. …the address tidied (D6)', here(w));
  N.p = w || (await N.ctx.newPage());
  await keep.close();
});

// ======================================================================================================================
await part(4, 'round trips: Weather → Chats → Back to /weather/#days with its scroll; /weather/#radar; warm tap → paint', 'D8, D20, UI7, §7.3', async () => {
// ======================================================================================================================
  const q = N.p;
  await q.goto(`${HUB}/weather/#days`);
  await screenUp(q, 'days');
  await wait(800);
  const y0 = await q.evaluate(() => { scrollTo(0, Math.min(400, document.documentElement.scrollHeight - innerHeight)); return Math.round(scrollY); });
  await wait(400);
  if (CHATS_ON) {
    // (Chats under the roof: Weather → Chats in the page, and the browser's Back returns to /weather/#days, its scroll
    // put back by the frame (S1 D20); Radar likewise)
    const life = await alive(q), docs = loads(q);
    await q.click(H.tab('chats'));
    const inPage = (await chatsUp(q)) && (await at(q, '/chats/')) && (await life.same()) && docs.n() === 0;
    ok(inPage, '4. Weather → the tab bar’s Chats: /chats/ in the same page, no document fetched (S3-D2, §2.1 b)', js({ at: here(q), docs: docs.list }));
    ok((await attrOf(q, H.tab('chats'), 'aria-current')) === 'page', '4. …the Chats tab current', await attrOf(q, H.tab('chats'), 'aria-current'));
    await q.goBack();
    const back = (await at(q, '/weather/#days', 20000)) && (await shown(q, H.wxSec('days'), 30000));
    const y1 = await until(async () => { const y = await q.evaluate(() => Math.round(scrollY)); return Math.abs(y - y0) <= 6 ? String(y) : null; }, 8000);
    ok(back && y1 != null && (await life.same()) && docs.n() === 0, `4. Back: /weather/#days again in the same page, scrolled as it was (${y0}px, S1 D20)`, js({ url: here(q), y: await q.evaluate(() => scrollY), docs: docs.list }));
    await q.click(H.hdSec('radar')); await shown(q, H.wxSec('radar'));
    await q.click(H.tab('chats')); await chatsUp(q);
    await q.goBack();
    ok((await at(q, '/weather/#radar', 20000)) && (await shown(q, H.wxSec('radar'), 30000)) && (await life.same()), '4. from Radar to Chats and Back: /weather/#radar, Radar shown, the same page', here(q));
    docs.stop();
  } else {
  await Promise.all([q.waitForURL((u) => u.pathname === '/chats/', { timeout: 20000 }).catch(() => {}), q.click(H.tab('chats'))]);
  ok(new URL(q.url()).pathname === '/chats/', '4. the tab bar’s Chats: Chats’ own page (a normal navigation, D8)', q.url());
  const crumb = await q.evaluate(() => sessionStorage.getItem('ifl-crumb'));
  const roofY = await q.evaluate(() => { try { return JSON.parse(sessionStorage.getItem('ifl-roof-y')); } catch (_) { return null; } });
  ok(crumb === '/weather/#days' && roofY?.p === '/weather/#days' && Math.abs((roofY?.y ?? -99) - y0) <= 4, '4. the breadcrumb is the route left, and ifl-roof-y holds its scroll (D20, no query in either)', js({ crumb, roofY }));
  await hubPageUp(q, '/chats/');
  await hubBack(q);
  const back = (await at(q, '/weather/#days', 20000)) && (await shown(q, H.wxSec('days'), 30000));
  const y1 = await until(async () => { const y = await q.evaluate(() => Math.round(scrollY)); return Math.abs(y - y0) <= 6 ? String(y) : null; }, 8000);
  ok(back && y1 != null, `4. Chats’ Back: /weather/#days again, scrolled as it was (${y0}px, UI7)`, js({ url: here(q), y: await q.evaluate(() => scrollY) }));
  await q.click(H.hdSec('radar')); await shown(q, H.wxSec('radar'));
  await Promise.all([q.waitForURL((u) => u.pathname === '/chats/', { timeout: 20000 }).catch(() => {}), q.click(H.tab('chats'))]);
  await hubPageUp(q, '/chats/');
  await hubBack(q);
  ok((await at(q, '/weather/#radar', 20000)) && (await shown(q, H.wxSec('radar'), 30000)), '4. from Radar to Chats and Back: /weather/#radar, Radar shown (D8)', here(q));
  }

  // warm (the module's files in the HTTP cache, modulepreloaded): Today's card tapped → Weather's hero painted
  await q.goto(`${HUB}/`);
  await todayUp(q); await shown(q, H.TODAY_WX_OPEN, 30000); await wait(2500);
  await q.evaluate((s) => { window.__t0 = performance.now(); document.querySelector(s).click(); }, H.TODAY_WX_OPEN);
  const dt = await q.waitForFunction((s) => { const e = document.querySelector(s); return e && e.getClientRects().length && !e.closest('[hidden]') ? performance.now() - window.__t0 : false; }, `${H.M_WEATHER} ${H.WX_HERO}`, { timeout: 15000, polling: 'raf' }).then((h) => h.jsonValue(), () => null);
  ok(dt != null && dt <= 1200, `4. warm, Today’s card tapped → Weather’s hero painted in ${dt == null ? 'never' : Math.round(dt) + ' ms'} (≤ 1200, §7.3)`);
});

// ======================================================================================================================
await part(5, 'Apps → Markets in the page → Back → Apps; a Today row → Fitness in the page → Back → Today; Mail’s Back → /#apps', 'stage 2 §2.4, D8, UI7', async () => {
// ======================================================================================================================
  const q = N.p;
  await q.goto(`${HUB}/#apps`);
  await shown(q, H.APPS); await shown(q, H.appTile('markets'), 20000);
  const life = await alive(q), docs = loads(q);
  await tapTile(q, 'markets');
  const mk = (await shown(q, H.M_MARKETS, 30000)) && (await at(q, '/markets/', 20000));
  ok(mk && docs.n() === 0 && (await life.same()), '5. Apps’ Markets tile: Markets in the page (its module, no document fetched; stage 2 §2.4)', js({ at: here(q), docs: docs.list }));
  ok((await attrOf(q, H.HD_BACK, 'aria-label')) === 'Back to Apps', '5. …Back says “Back to Apps”', await attrOf(q, H.HD_BACK, 'aria-label'));
  await q.click(H.HD_BACK);
  ok((await at(q, '/#apps', 20000)) && (await shown(q, H.APPS, 30000)) && (await life.same()) && docs.n() === 0, '5. Markets’ Back: Apps (/#apps), the same page (§3.4)', here(q));

  await q.click(H.tab('today')); await todayUp(q);
  // (a link to /fitness/#today put into Today's screen by the test, standing in for a Today row: Today's rows are such
  // links, D8; what's proved is that a link from Today opens Fitness in the page and Back comes back, not a row's markup)
  await q.evaluate((s) => { const a = document.createElement('a'); a.href = '/fitness/#today'; a.id = 't-fit'; a.textContent = 'The Session'; document.querySelector(s).append(a); }, H.TODAY);
  await q.evaluate(() => document.getElementById('t-fit').click());
  const fx = (await shown(q, H.M_FITNESS, 30000)) && (await at(q, '/fitness/', 20000));
  ok(fx && docs.n() === 0 && (await life.same()), '5. a link in Today to /fitness/#today (the test’s, for a Today row): Fitness in the page, tidied to /fitness/', js({ at: here(q), docs: docs.list }));
  ok((await attrOf(q, H.HD_BACK, 'aria-label')) === 'Back to Today', '5. …Back says “Back to Today”', await attrOf(q, H.HD_BACK, 'aria-label'));
  await q.click(H.HD_BACK);
  ok((await at(q, '/', 20000)) && (await todayUp(q)) && (await life.same()), '5. …Fitness’ Back: Today, the same page (§3.4)', here(q));
  docs.stop();

  // Mail's frame stood in for (Mail's own Worker isn't part of this stack): it says { ifl: "back" } as Mail's Back does
  await route(N.ctx, /^http:\/\/email\.ifl\.test:8788\/(#.*)?$/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>Mail</title><p>Mail</p><script>setTimeout(() => parent.postMessage({ ifl: "back" }, "*"), 800)</script>' }));
  await q.goto(`${HUB}/mail/`);
  ok((await at(q, '/#apps', 20000)) && (await shown(q, H.APPS, 30000)), '5. Mail’s host page, Mail saying { ifl: "back" }: Apps (/#apps), the framework (D8)', here(q));
});

// ======================================================================================================================
await part(6, 'the hub pages’ tab bar → the framework; the tab bar the same bar on both, light and dark', 'D8, D18, UI2, §3.6', async () => {
// ======================================================================================================================
  // (Chats is the hub page that draws the hub's tab bar, IFL.hub.tabs; Markets keeps its own tabs, its round trip in part 5)
  const q = N.p;
  for (const [id, hash, screen, name] of [['you', '#you', H.YOU, 'You'], ['apps', '#apps', H.APPS, 'Apps'], ['today', '', H.TODAY, 'Today']]) {
    await q.goto(`${HUB}/chats/`);
    if (CHATS_ON) {
      // (under the roof: the framework's own tab bar on Chats, each tab in the page, S3-D2, §2.1 b)
      await chatsUp(q);
      const life = await alive(q), d = loads(q);
      await q.click(H.tab(id));
      const up = await shown(q, screen, 30000), cur = await attrOf(q, H.tab(id), 'aria-current');
      ok(up && cur === 'page' && (await life.same()) && d.n() === 0 && (await at(q, `/${hash}`)), `6. Chats under the roof, the tab bar’s ${name}: the framework’s ${name} in the same page, its tab current (S3 §2.1 b)`, js({ at: here(q), cur, docs: d.list }));
      d.stop();
      continue;
    }
    await hubPageUp(q, '/chats/');
    const d = loads(q);
    await Promise.all([q.waitForURL((u) => u.pathname === '/' && u.hash === hash, { timeout: 20000 }).catch(() => {}), q.click(EXCEPT.hubTab(id))]);
    const up = await shown(q, screen, 30000), cur = await attrOf(q, H.tab(id), 'aria-current');
    ok(up && cur === 'page' && d.n() >= 1 && here(q) === `/${hash}`, `6. Chats’ tab bar, ${name}: the framework’s ${name}, its tab current (a full load to /${hash}, D8)`, js({ at: here(q), cur, docs: d.list }));
    d.stop();
  }

  // (the bar alone on each page: everything else made invisible through the page's own styles object, which the page's
  // CSP allows, and what's behind the bar (the page's own background, which the bar's glass lets through: Chats' is dark
  // whatever the phone says) made one plain grey on both, so only the bar itself is compared; the tabs that aren't
  // current on either compared, and the bar's place and size)
  const alone = (pg, bar) => pg.evaluate((bar) => {
    const nav = document.querySelector(bar); if (!nav) return null;
    for (const e of document.body.querySelectorAll('*')) if (!e.contains(nav) && !nav.contains(e)) e.style.visibility = 'hidden';
    for (let e = nav.parentElement; e; e = e.parentElement) {
      for (const [k, v] of [['background', '#808080'], ['background-image', 'none'], ['backdrop-filter', 'none'], ['-webkit-backdrop-filter', 'none'], ['box-shadow', 'none']]) e.style.setProperty(k, v, 'important');
    }
    try { const st = new CSSStyleSheet(); st.replaceSync('html::before, html::after, body::before, body::after { display: none !important; }'); document.adoptedStyleSheets = [...document.adoptedStyleSheets, st]; } catch (_) {}
    const r = nav.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  }, bar);
  for (const scheme of ['light', 'dark']) {
    const T = await open(`noor-${scheme}`, { scheme });
    await T.p.goto(`${HUB}/`); await todayUp(T.p); await wait(1500);
    const fb = await alone(T.p, 'nav#tabs'); await wait(300);
    const f = { apps: await T.p.locator(H.tab('apps')).screenshot().catch(() => null), you: await T.p.locator(H.tab('you')).screenshot().catch(() => null) };
    await shot(T.p, `6-tabs-today-${scheme}`);
    // (Chats on: framework Today vs framework Chats, the one bar in InFlite's indigo on every screen (S3-D16); off: vs
    // Chats' own page's hub bar, stage 1's UI2)
    await T.p.goto(`${HUB}/chats/`);
    if (CHATS_ON) await chatsUp(T.p); else await hubPageUp(T.p, '/chats/');
    await wait(2000);
    const cb = await alone(T.p, CHATS_ON ? 'nav#tabs' : '.ifl-tabs'); await wait(300);
    const tabOf = (k) => (CHATS_ON ? H.tab(k) : EXCEPT.hubTab(k));
    const c = { apps: await T.p.locator(tabOf('apps')).screenshot().catch(() => null), you: await T.p.locator(tabOf('you')).screenshot().catch(() => null) };
    await shot(T.p, `6-tabs-chats-${scheme}`);
    ok(fb && cb && Math.abs(fb.x - cb.x) <= 1 && Math.abs(fb.y - cb.y) <= 1 && Math.abs(fb.w - cb.w) <= 1 && Math.abs(fb.h - cb.h) <= 1, `6. ${scheme}: the tab bar in the same place and size on framework Today and on ${CHATS_ON ? 'framework Chats (S3-D16)' : '/chats/ (UI2)'}`, js({ fb, cb }));
    for (const k of ['apps', 'you']) {
      const a = f[k] && c[k] ? alike(f[k], c[k]) : { same: 0 };
      ok(a.same >= 0.98, `6. ${scheme}: its ${k} tab the same pixels on both (${Math.round(a.same * 1000) / 10}% alike, D18, UI2)`, js(a));
    }
    await T.ctx.close();
  }
});

// ======================================================================================================================
await part(7, 'browser back with a sheet open', 'D22, RI3, UB5', async () => {
// ======================================================================================================================
  const q = N.p;
  await q.goto(`${HUB}/#apps`);
  await shown(q, H.appTile('weather'), 20000);
  await tapTile(q); await weatherUp(q);
  await q.click(H.HD_PICK);
  const up = await shown(q, `${H.PLACES_SHEET}[open]`);
  await q.goBack();
  await shown(q, H.APPS, 15000); await wait(500);
  const route = await attrOf(q, H.HTML_ROUTE, 'data-route'), loc = await q.evaluate(() => location.pathname + location.hash);
  ok(up && !(await count(q, H.SHEET_OPEN)) && route === loc && loc === '/#apps', '7. the Places sheet up, browser back: no sheet left open, the route shown is the address (/#apps, D22)', js({ up, route, loc }));
});

// ======================================================================================================================
await part(8, 'the roof turned off mid-session (the client’s side): a shown Weather bounces once; a stale page’s import fails into the error state', 'D14, RB6b, RI7, RI9, RI13', async () => {
// ======================================================================================================================
  // (stood in with routes, as roof.yml state=off would leave the Worker: /api/hub roof false, the module's files 404,
  // /weather/ milestone 1's Weather page. No service worker, so the routes reach the page)
  const offOn = async (ph) => {
    ph.off = false;
    await route(ph.ctx, /^http:\/\/ifl\.test:8788\/api\/hub(\?|$)/, (r) => (ph.off ? r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: '{"ready":true,"roof":false}' }) : r.continue()));
    await route(ph.ctx, /^http:\/\/ifl\.test:8788\/weather\/roof\//, (r) => (ph.off ? r.fulfill({ status: 404, contentType: 'text/plain', headers: { 'Cache-Control': 'no-store' }, body: 'Not found' }) : r.continue()));
    await route(ph.ctx, /^http:\/\/ifl\.test:8788\/weather\/(index\.html)?(\?[^#]*)?$/, (r) => (ph.off && r.request().isNavigationRequest() ? r.fulfill({ status: 200, contentType: 'text/html', body: M1_PAGE('Weather') }) : r.continue()));
  };
  const R = await open('noor-off', { sw: 'block', clock: true });
  await offOn(R);
  const q = R.p, docs = loads(q);
  const hubAsks = []; q.on('request', (r) => { if (/\/api\/hub(\?|$)/.test(r.url())) hubAsks.push(Date.now()); });
  await q.goto(`${HUB}/#apps`);
  await shown(q, H.appTile('weather'), 30000);
  await tapTile(q); await weatherUp(q);
  docs.reset();
  R.off = true;
  const a0 = hubAsks.length;
  await hide(q);
  await R.ctx.clock.fastForward('06:00');
  await show(q);
  const asked = await until(() => hubAsks.length > a0, 10000);
  const bounced = await q.waitForFunction(() => /MILESTONE 1 WEATHER/.test(document.body?.textContent || ''), null, { timeout: 20000 }).then(() => true, () => false);
  await wait(3000);
  const marker = await q.evaluate(() => sessionStorage.getItem('ifl-roof-bounce')).catch(() => null);
  ok(asked && bounced, '8. on coming back after 5 minutes away, the page asks /api/hub again, learns roof:false, and the shown Weather goes to the hub’s milestone-1 page (D14)', js({ asked, url: here(q) }));
  ok(docs.n() === 1 && new URL(docs.list[0] || 'http://x/').pathname === '/weather/' && !new URL(docs.list[0] || 'http://x/').search, '8. …once, by replace, to /weather/ (path and hash only, never a query, RI7)', js(docs.list));
  ok(marker === '1', '8. …with sessionStorage ifl-roof-bounce "1" as its marker (RI7)', String(marker));
  await shot(q, '8-bounced');

  // a page that hasn't heard yet (it asked /api/hub as it opened, under 5 minutes ago): Weather opened, its files refused
  const R2 = await open('noor-stale', { sw: 'block' });
  await offOn(R2);
  await R2.p.goto(`${HUB}/#apps`);
  await shown(R2.p, H.appTile('weather'), 30000); await wait(1000);
  R2.off = true;
  await tapTile(R2.p);
  const err = (await shown(R2.p, `${H.M_WEATHER} ${H.ERROR}`, 30000)) && (await shown(R2.p, H.ERROR_RETRY)) && (await shown(R2.p, H.ERROR_OWN));
  ok(err, '8. a page that hadn’t heard: its import refused (404) into the error state, “Weather didn’t open” with Try Again and Open Weather on Its Own (§3.12)', await textOf(R2.p, H.ERROR));
  await shot(R2.p, '8-error');
  await R2.p.click(H.ERROR_RETRY);
  ok(await shown(R2.p, H.ERROR_RELOAD, 20000), '8. Try Again failing too: Reload offered, the real recovery (RI13)');
  // (Open Weather on Its Own, tapped: a navigation to Weather's own address, same path and hash; stood in for there)
  await ownPage(R2.ctx);
  const from = here(R2.p), went = leaving(R2.p, 15000);
  await R2.p.click(H.ERROR_OWN).catch(() => {});
  const landed = await went;
  let u = null; try { u = new URL(landed); } catch (_) {}
  ok(!!u && u.origin === OWN && u.pathname + u.search + u.hash === from.replace(/^\/weather/, ''), `8. …Open Weather on Its Own tapped: off to Weather’s own address, the same path and hash (${OWN}${from.replace(/^\/weather/, '')}, §3.12)`, landed || 'no navigation');
  await R.ctx.close(); await R2.ctx.close();

  // a framework page that boots at /weather/ with roof:false (D14): with the marker set, straight to Weather's own
  // address, no loop; without it, the marker set and the location replaced once, then Weather's own address
  const R3 = await open('noor-noloop', { sw: 'block' });
  await route(R3.ctx, /^http:\/\/ifl\.test:8788\/api\/hub(\?|$)/, (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: '{"ready":true,"roof":false}' }));
  await ownPage(R3.ctx);
  await R3.ctx.addInitScript(() => { if (location.origin === 'http://ifl.test:8788' && location.hash === '#days' && !sessionStorage.getItem('t-marked')) { sessionStorage.setItem('t-marked', '1'); sessionStorage.setItem('ifl-roof-bounce', '1'); } });
  for (const [hash, marked, hubDocs] of [['#days', true, 1], ['#warnings', false, 2]]) {
    const pg = await R3.ctx.newPage(), d = loads(pg), off = leaving(pg, 20000);
    await pg.goto(`${HUB}/weather/${hash}`).catch(() => {});
    const to = await off;
    await wait(500);
    let v = null; try { v = new URL(to); } catch (_) {}
    const atHub = d.list.filter((x) => x.startsWith(HUB));
    ok(!!v && v.pathname + v.search + v.hash === `/${hash}` && atHub.length === hubDocs, `8. booting at /weather/${hash} with roof:false, ${marked ? 'the marker (ifl-roof-bounce) set: straight' : 'no marker: the marker set, the location replaced once, then'} to Weather’s own address, the same hash, no loop (${hubDocs} document${hubDocs > 1 ? 's' : ''} at the hub, D14)`, js({ to, docs: d.list }));
    if (v && v.origin !== OWN) console.log(`note: D14's way out went to ${v.origin}, not the stack's ${OWN} (the session's links weren't in yet)`);
    d.stop();
  }
  await R3.ctx.close();
});

// ======================================================================================================================
await part(9, 'one module turned off mid-session: a shown Markets bounces once; Weather stays in the page', 'stage 2 C3, C7, §7, D14', async () => {
// ======================================================================================================================
  // (stood in with routes, as roof.yml app=markets state=off would leave the Worker: /api/hub apps.markets false, Markets'
  // roof files 404, /markets/ Markets' milestone-1 page; Weather and Fitness untouched. No service worker)
  const offMk = async (ph) => {
    ph.off = false;
    await route(ph.ctx, /^http:\/\/ifl\.test:8788\/api\/hub(\?|$)/, async (r) => {
      if (!ph.off) return r.continue();
      const res = await hostCall('ifl.test:8788', '/api/hub', undefined, { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ') }).catch(() => null);
      const j = { ready: true, roof: true, ...(res?.json || {}) }; j.apps = { weather: true, fitness: true, ...(j.apps || {}), markets: false };
      return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify(j) });
    });
    await route(ph.ctx, /^http:\/\/ifl\.test:8788\/markets\/roof\//, (r) => (ph.off ? r.fulfill({ status: 404, contentType: 'text/plain', headers: { 'Cache-Control': 'no-store' }, body: 'Not found' }) : r.continue()));
    await route(ph.ctx, /^http:\/\/ifl\.test:8788\/markets\/(index\.html)?(\?[^#]*)?$/, (r) => (ph.off && r.request().isNavigationRequest() ? r.fulfill({ status: 200, contentType: 'text/html', body: M1_PAGE('Markets') }) : r.continue()));
  };
  // a shown Markets: bounced once, by replace, to /markets/ (the hub's page), with the marker
  const R = await open('noor-mk-off', { sw: 'block', clock: true });
  await offMk(R);
  const q = R.p, docs = loads(q);
  const hubAsks = []; q.on('request', (r) => { if (/\/api\/hub(\?|$)/.test(r.url())) hubAsks.push(Date.now()); });
  await q.goto(`${HUB}/#apps`); await shown(q, H.appTile('markets'), 30000);
  await tapTile(q, 'markets'); await shown(q, H.M_MARKETS, 30000); await wait(1500);
  docs.reset();
  R.off = true;
  const a0 = hubAsks.length;
  await hide(q); await R.ctx.clock.fastForward('06:00'); await show(q);
  const asked = await until(() => hubAsks.length > a0, 10000);
  const bounced = await q.waitForFunction(() => /MILESTONE 1 MARKETS/.test(document.body?.textContent || ''), null, { timeout: 25000 }).then(() => true, () => false);
  await wait(2000);
  ok(asked && bounced, '9. back after 5 minutes away, /api/hub says apps.markets false: the shown Markets goes to the hub’s own Markets page (C3, D14)', js({ asked, at: here(q) }));
  ok(docs.n() === 1 && new URL(docs.list[0] || 'http://x/').pathname === '/markets/' && !new URL(docs.list[0] || 'http://x/').search, '9. …once, to /markets/ (path and hash only)', js(docs.list));
  ok((await q.evaluate(() => sessionStorage.getItem('ifl-roof-bounce')).catch(() => null)) === '1', '9. …with ifl-roof-bounce "1" as its marker');
  await shot(q, '9-markets-bounced');
  docs.stop();
  await R.ctx.close();

  // Weather shown when Markets turns off: untouched, no reload (an app that stays on is left alone, C3)
  const W = await open('noor-mk-off-wx', { sw: 'block', clock: true });
  await offMk(W);
  const w = W.p, wd = loads(w);
  const asks = []; w.on('request', (r) => { if (/\/api\/hub(\?|$)/.test(r.url())) asks.push(Date.now()); });
  await w.goto(`${HUB}/#apps`); await shown(w, H.appTile('markets'), 30000);
  await tapTile(w, 'markets'); await shown(w, H.M_MARKETS, 30000);
  await w.click(H.tab('apps')); await shown(w, H.APPS); await tapTile(w, 'weather'); await weatherUp(w); await wait(1000);
  const life = await alive(w); wd.reset();
  W.off = true;
  const b0 = asks.length;
  await hide(w); await W.ctx.clock.fastForward('06:00'); await show(w);
  await until(() => asks.length > b0, 10000); await wait(4000);
  ok((await life.same()) && wd.n() === 0 && (await shown(w, `${H.M_WEATHER} ${H.WX_HERO}`, 5000)), '9. Weather shown as Markets turns off: still Weather, the same page, no reload (C3: apps that stay on are untouched)', js(wd.list));
  ok(!(await w.$(H.M_MARKETS).then((e) => e && e.evaluate((x) => !!x.querySelector('*'))).catch(() => false)), '9. …and Markets unmounted from the page (its screen emptied, C3)');
  // tapping Markets now: the hub's own Markets page, a normal navigation
  await w.click(H.tab('apps')); await shown(w, H.APPS);
  await Promise.all([w.waitForURL((u) => u.pathname === '/markets/', { timeout: 20000 }).catch(() => {}), tapTile(w, 'markets')]);
  ok(await w.waitForFunction(() => /MILESTONE 1 MARKETS/.test(document.body?.textContent || ''), null, { timeout: 20000 }).then(() => true, () => false), '9. …Apps’ Markets tile then: the hub’s own Markets page (off = milestone 1, §7)', here(w));
  wd.stop();
  await W.ctx.close();
});

// ======================================================================================================================
await part(10, 'a framework page served at an off module’s path doesn’t loop', 'stage 2 RI4, §5.2, D14', async () => {
// ======================================================================================================================
  // (the root worker's kept / answering /markets/ while Markets is off, stood in: every /markets/ document is the
  // framework's own page, fetched from the hub's /; /api/hub says apps.markets false; Markets' own address stood in)
  const page = await hostCall('ifl.test:8788', '/', undefined, { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ') });
  const R = await open('noor-ri4', { sw: 'block' });
  await route(R.ctx, /^http:\/\/ifl\.test:8788\/api\/hub(\?|$)/, (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify({ ready: true, roof: true, apps: { weather: true, markets: false, fitness: true } }) }));
  await route(R.ctx, /^http:\/\/ifl\.test:8788\/markets\/(index\.html)?(\?[^#]*)?$/, (r) => (r.request().isNavigationRequest() ? r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', headers: { 'Content-Security-Policy': page.headers['content-security-policy'] || '' }, body: page.text }) : r.continue()));
  const OWN_MK = /^https?:\/\/finance\.(?:ifl\.test:8788|inflite\.ai)\//;
  await route(R.ctx, OWN_MK, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>Markets</title><h1>MARKETS ON ITS OWN</h1>' }));
  const pg = R.p, d = loads(pg);
  const off = pg.waitForURL((u) => OWN_MK.test(u.href), { timeout: 25000 }).then(() => pg.url(), () => null);
  await pg.goto(`${HUB}/markets/#holdings`).catch(() => {});
  const to = await off;
  await wait(1500);
  const atHub = d.list.filter((x) => x.startsWith(HUB) && new URL(x).pathname === '/markets/');
  let v = null; try { v = new URL(to); } catch (_) {}
  ok(page.status === 200 && !!v && v.hash === '#holdings', '10. the framework booting at /markets/#holdings with Markets off: off to Markets’ own address, the same hash (bootGone, links.finance, §5.2)', js({ to, docs: d.list }));
  ok(atHub.length >= 1 && atHub.length <= 2, `10. …${atHub.length} document${atHub.length > 1 ? 's' : ''} at /markets/, no loop (the bounce marker kept for an off boot app, RI4)`, js(d.list));
  d.stop();
  await R.ctx.close();
});

// (the framework's pages only: Chats', Fitness', Markets' and Mail's own pages are theirs, unchanged in stage 1, D8)
// (stage 2: Markets and Fitness are the framework's now, so their pages are checked too; the milestone-1 stand-ins and
// the refused module files of parts 8 and 9 aside)
const all = everyone.flatMap((x) => x.errs || []).filter((e) => !(CHATS_ON ? /^\S+ \/mail\//.test(e) : /^\S+ \/(chats|mail)\//.test(e)) && !/MILESTONE|MARKETS ON ITS OWN|noor-(off|stale|mk-off|mk-off-wx|ri4).*(404|Failed to fetch dynamically imported module|Importing a module script failed)/.test(e));
ok(!all.some((e) => /CSP violation|Refused to/.test(e)), 'no CSP violation on any page (§8.3)', js(all.filter((e) => /CSP|Refused/.test(e)).slice(0, 6)));
ok(!all.length, 'no page error and no console error on any page (the refused module of part 8 aside)', js(all.slice(0, 8)));
ok(!MISSING.size, 'every Chats hook used is in roofhooks.mjs (B0’s)', js([...MISSING]));
await closeAll();
console.log(`FAILS ${fails()}`);
process.exit(0);
