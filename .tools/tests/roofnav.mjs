// needs: hub
// Getting about under the roof (One roof, spec §10.2): notification taps delivered into the open framework page
// (the root worker's { ifl: "route" }), into Chats' page as before, and into a new window when none is open; round trips
// to the pages that aren't modules yet (Chats, Markets, Fitness, Mail) and back, with route and scroll (ifl-roof-y); the
// hub pages' tab bar into the framework and the bar itself the same bar on both (UI2); browser back with a sheet open;
// and the roof turned off while a page is open (the client's side, stood in with routes: /api/hub roof:false, the
// module's files 404, /weather/ milestone 1's page) [RB6b]. In real Chromium against the hub stack (hubstack.mjs).
// Every check's line names the spec section it proves; every selector of the framework's is roofhooks.mjs's (§3.14);
// the hub pages' own (Chats, Markets) are the shared block's, which stage 1 doesn't change (IFL.hub.tabs, IFL.hub.back).
import * as H from './roofhooks.mjs';
import {
  HUB, checker, phone, account, wxServer, weatherAccount, alive, loads, history, here, shown, gone, textOf, attrOf, count, hide, show,
  tapNotification, rootWorker, alike, PLACES, wait, until, js, closeAll,
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
const todayUp = async (p, ms = 30000) => (await shown(p, H.TODAY, ms)) && (await shown(p, H.HD_TITLE, ms));
const tapTile = (p, app = 'weather', href = '/weather/') => p.evaluate(([s, h]) => { const t = document.querySelector(s); const a = t?.matches(`a[href="${h}"]`) ? t : t?.querySelector(`a[href="${h}"]`); if (!a) return false; a.click(); return true; }, [H.appTile(app), href]);
// (a hub page's own Back: the shared block's IFL.hub.back(), what its Back button calls)
const hubBack = (p) => p.evaluate(() => window.IFL?.hub?.back?.() ?? 'none').catch(() => 'navigated');
const hubPageUp = (p, path) => p.waitForFunction((x) => location.pathname === x && !!window.IFL?.hub?.on, path, { timeout: 30000 }).then(() => true, () => false);

const N = await open('noor');
const { p } = N;
await p.goto(`${HUB}/robots.txt`);
const seeded = await weatherAccount(p, { places: [London], settings: { temp: 'c' } });
ok(seeded.s === 200, 'Noor’s Weather place in the account (London)', js(seeded));

// ======================================================================================================================
await part(1, 'a notification tapped with the framework open: in the page, sheets closed first', '§3.2, §8.2 openIn, D10, D22');
// ======================================================================================================================
{
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
}

// ======================================================================================================================
await part(2, 'a notification tapped with Chats open: Chats navigates as now', '§8.2 openIn, D8');
// ======================================================================================================================
{
  await p.goto(`${HUB}/chats/`);
  await hubPageUp(p, '/chats/'); await wait(1500);
  const r = await tapNotification(N.ctx, { app: 'weather', url: '/weather/#radar' });
  const went = (await at(p, '/weather/#radar', 30000)) && (await shown(p, H.wxSec('radar'), 30000));
  ok(r === 'done' && went && N.pages.length === 1, '2. tapped with Chats open: Chats goes there itself ({ ifl: "open" }, as in milestone 1), Weather’s Radar under the roof, one window', js({ r, url: here(p), pages: N.pages.length }));
}

// ======================================================================================================================
await part(3, 'a notification tapped with no window open: the framework at /weather/?lat…', '§8.2 openIn, D6');
// ======================================================================================================================
{
  const keep = await N.ctx.newPage();     // (not a page of the site's: the context stays, with no window of its own)
  await keep.goto('about:blank');
  for (const pg of N.ctx.pages()) if (pg !== keep) await pg.close();
  const made = N.ctx.waitForEvent('page', { timeout: 30000 }).catch(() => null);
  const r = await tapNotification(N.ctx, { app: 'weather', url: `/weather/?lat=${London.lat}&lon=${London.lon}&name=London` });
  const w = await made;
  const up = w && (await weatherUp(w)) && (await w.waitForFunction((s) => document.querySelector(s)?.textContent.trim() === 'London', H.HD_TITLE, { timeout: 20000 }).then(() => true, () => false));
  ok(r === 'done' && up, '3. tapped with no window: a new one, the framework at /weather/?lat…&name=London, London shown', js({ r, url: w?.url() }));
  ok(w && (await at(w, '/weather/')), '3. …the address tidied (D6)', w ? here(w) : '');
  N.p = w || (await N.ctx.newPage());
  await keep.close();
}

// ======================================================================================================================
await part(4, 'round trips: Weather → Chats → Back to /weather/#days with its scroll; /weather/#radar; warm tap → paint', 'D8, D20, UI7, §7.3');
// ======================================================================================================================
{
  const q = N.p;
  await q.goto(`${HUB}/weather/#days`);
  await weatherUp(q); await shown(q, H.wxSec('days'));
  await wait(800);
  const y0 = await q.evaluate(() => { scrollTo(0, Math.min(400, document.documentElement.scrollHeight - innerHeight)); return Math.round(scrollY); });
  await wait(400);
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

  // warm (the module's files in the HTTP cache, modulepreloaded): Today's card tapped → Weather's hero painted
  await q.goto(`${HUB}/`);
  await todayUp(q); await shown(q, H.TODAY_WX_OPEN, 30000); await wait(2500);
  await q.evaluate((s) => { window.__t0 = performance.now(); document.querySelector(s).click(); }, H.TODAY_WX_OPEN);
  const dt = await q.waitForFunction((s) => { const e = document.querySelector(s); return e && e.getClientRects().length && !e.closest('[hidden]') ? performance.now() - window.__t0 : false; }, `${H.M_WEATHER} ${H.WX_HERO}`, { timeout: 15000, polling: 'raf' }).then((h) => h.jsonValue(), () => null);
  ok(dt != null && dt <= 1200, `4. warm, Today’s card tapped → Weather’s hero painted in ${dt == null ? 'never' : Math.round(dt) + ' ms'} (≤ 1200, §7.3)`);
}

// ======================================================================================================================
await part(5, 'Apps → Markets → its Back → /#apps; Fitness from a Today row → its Back → Today; Mail’s Back → /#apps', 'D8, UI7');
// ======================================================================================================================
{
  const q = N.p;
  await q.goto(`${HUB}/#apps`);
  await shown(q, H.APPS); await shown(q, H.appTile('markets'), 20000);
  await Promise.all([q.waitForURL((u) => u.pathname === '/markets/', { timeout: 20000 }).catch(() => {}), tapTile(q, 'markets', '/markets/')]);
  ok(new URL(q.url()).pathname === '/markets/', '5. Apps’ Markets tile: Markets’ own page', q.url());
  await hubPageUp(q, '/markets/');
  await hubBack(q);
  ok((await at(q, '/#apps', 20000)) && (await shown(q, H.APPS, 30000)), '5. Markets’ Back: Apps (/#apps), drawn by the framework (D8)', here(q));

  await q.goto(`${HUB}/`);
  await todayUp(q);
  // (a row of Today's that opens Fitness: a link in Today's screen, as Today's rows are, D8)
  await q.evaluate((s) => { const a = document.createElement('a'); a.href = '/fitness/#today'; a.id = 't-fit'; a.textContent = 'The Session'; document.querySelector(s).append(a); }, H.TODAY);
  await Promise.all([q.waitForURL((u) => u.pathname === '/fitness/', { timeout: 20000 }).catch(() => {}), q.evaluate(() => document.getElementById('t-fit').click())]);
  ok(new URL(q.url()).pathname === '/fitness/', '5. a Today row to Fitness: Fitness’ own page', q.url());
  await hubPageUp(q, '/fitness/');
  await hubBack(q);
  ok((await at(q, '/', 20000)) && (await todayUp(q)), '5. Fitness’ Back: Today (D8)', here(q));

  // Mail's frame stood in for (Mail's own Worker isn't part of this stack): it says { ifl: "back" } as Mail's Back does
  await N.ctx.route(/^http:\/\/email\.ifl\.test:8788\/(#.*)?$/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>Mail</title><p>Mail</p><script>setTimeout(() => parent.postMessage({ ifl: "back" }, "*"), 800)</script>' }));
  await q.goto(`${HUB}/mail/`);
  ok((await at(q, '/#apps', 20000)) && (await shown(q, H.APPS, 30000)), '5. Mail’s host page, Mail saying { ifl: "back" }: Apps (/#apps), the framework (D8)', here(q));
}

// ======================================================================================================================
await part(6, 'the hub pages’ tab bar → the framework; the tab bar the same bar on both, light and dark', 'D8, D18, UI2, §3.6');
// ======================================================================================================================
{
  const q = N.p;
  await q.goto(`${HUB}/markets/`);
  await hubPageUp(q, '/markets/');
  await Promise.all([q.waitForURL((u) => u.pathname === '/' && u.hash === '#you', { timeout: 20000 }).catch(() => {}), q.click('.ifl-tabs .ifl-tab[data-tab="you"]')]);
  ok((await shown(q, H.YOU, 30000)) && (await attrOf(q, H.tab('you'), 'aria-current')) === 'page', '6. Markets’ tab bar, You: the framework’s You (a full load to /#you)', here(q));
  await Promise.all([q.waitForURL((u) => u.pathname === '/chats/', { timeout: 20000 }).catch(() => {}), q.goto(`${HUB}/chats/`)]);
  await hubPageUp(q, '/chats/');
  await Promise.all([q.waitForURL((u) => u.pathname === '/' && u.hash === '#apps', { timeout: 20000 }).catch(() => {}), q.click('.ifl-tabs .ifl-tab[data-tab="apps"]')]);
  ok(await shown(q, H.APPS, 30000), '6. Chats’ tab bar, Apps: the framework’s Apps', here(q));

  // (the bar alone on each page: everything else made invisible through the page's own styles object, which the page's
  // CSP allows; the tabs that aren't current on either compared, and the bar's place and size)
  const alone = (pg, bar) => pg.evaluate((bar) => {
    const nav = document.querySelector(bar); if (!nav) return null;
    for (const e of document.body.querySelectorAll('*')) if (!e.contains(nav) && !nav.contains(e)) e.style.visibility = 'hidden';
    const r = nav.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  }, bar);
  for (const scheme of ['light', 'dark']) {
    const T = await open(`noor-${scheme}`, { scheme });
    await T.p.goto(`${HUB}/`); await todayUp(T.p); await wait(1500);
    const fb = await alone(T.p, 'nav#tabs'); await wait(300);
    const f = { apps: await T.p.locator(H.tab('apps')).screenshot().catch(() => null), you: await T.p.locator(H.tab('you')).screenshot().catch(() => null) };
    await shot(T.p, `6-tabs-today-${scheme}`);
    await T.p.goto(`${HUB}/chats/`); await hubPageUp(T.p, '/chats/'); await wait(2000);
    const cb = await alone(T.p, '.ifl-tabs'); await wait(300);
    const c = { apps: await T.p.locator('.ifl-tabs .ifl-tab[data-tab="apps"]').screenshot().catch(() => null), you: await T.p.locator('.ifl-tabs .ifl-tab[data-tab="you"]').screenshot().catch(() => null) };
    await shot(T.p, `6-tabs-chats-${scheme}`);
    ok(fb && cb && Math.abs(fb.x - cb.x) <= 1 && Math.abs(fb.y - cb.y) <= 1 && Math.abs(fb.w - cb.w) <= 1 && Math.abs(fb.h - cb.h) <= 1, `6. ${scheme}: the tab bar in the same place and size on framework Today and on /chats/ (UI2)`, js({ fb, cb }));
    for (const k of ['apps', 'you']) {
      const a = f[k] && c[k] ? alike(f[k], c[k]) : { same: 0 };
      ok(a.same >= 0.98, `6. ${scheme}: its ${k} tab the same pixels on both (${Math.round(a.same * 1000) / 10}% alike, D18, UI2)`, js(a));
    }
    await T.ctx.close();
  }
}

// ======================================================================================================================
await part(7, 'browser back with a sheet open', 'D22, RI3, UB5');
// ======================================================================================================================
{
  const q = N.p;
  await q.goto(`${HUB}/#apps`);
  await shown(q, H.appTile('weather'), 20000);
  await tapTile(q); await weatherUp(q);
  await q.click(H.HD_PICK);
  const up = await shown(q, `${H.PLACES_SHEET}[open]`);
  await q.goBack();
  await shown(q, H.APPS, 15000); await wait(500);
  const route = await attrOf(q, H.HTML_ROUTE, 'data-route'), loc = await q.evaluate(() => location.pathname + location.hash);
  ok(up && !(await count(q, 'dialog[open]')) && route === loc && loc === '/#apps', '7. the Places sheet up, browser back: no sheet left open, the route shown is the address (/#apps, D22)', js({ up, route, loc }));
}

// ======================================================================================================================
await part(8, 'the roof turned off mid-session (the client’s side): a shown Weather bounces once; a stale page’s import fails into the error state', 'D14, RB6b, RI7, RI9, RI13');
// ======================================================================================================================
{
  // (stood in with routes, as roof.yml state=off would leave the Worker: /api/hub roof false, the module's files 404,
  // /weather/ milestone 1's Weather page. No service worker, so the routes reach the page)
  const offOn = async (ph) => {
    ph.off = false;
    await ph.ctx.route(/^http:\/\/ifl\.test:8788\/api\/hub(\?|$)/, (r) => (ph.off ? r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: '{"ready":true,"roof":false}' }) : r.continue()));
    await ph.ctx.route(/^http:\/\/ifl\.test:8788\/weather\/roof\//, (r) => (ph.off ? r.fulfill({ status: 404, contentType: 'text/plain', headers: { 'Cache-Control': 'no-store' }, body: 'Not found' }) : r.continue()));
    await ph.ctx.route(/^http:\/\/ifl\.test:8788\/weather\/(index\.html)?(\?[^#]*)?$/, (r) => (ph.off && r.request().isNavigationRequest() ? r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>Weather</title><h1>MILESTONE 1 WEATHER</h1>' }) : r.continue()));
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
  const own = await attrOf(R2.p, H.ERROR_OWN, 'href');
  ok(err, '8. a page that hadn’t heard: its import refused (404) into the error state, “Weather didn’t open” with Try Again and Open Weather on Its Own (§3.12)', await textOf(R2.p, H.ERROR));
  ok(/^http:\/\/weather\.ifl\.test:8788\/(\?|#|$)/.test(own || ''), '8. …Open Weather on Its Own: Weather’s own address (§3.12)', own);
  await shot(R2.p, '8-error');
  await R2.p.click(H.ERROR_RETRY);
  ok(await shown(R2.p, H.ERROR_RELOAD, 20000), '8. Try Again failing too: Reload offered, the real recovery (RI13)');
  await R.ctx.close(); await R2.ctx.close();
}

const all = everyone.flatMap((x) => x.errs || []).filter((e) => !/MILESTONE|noor-(off|stale).*(404|Failed to fetch dynamically imported module|Importing a module script failed)/.test(e));
ok(!all.some((e) => /CSP violation|Refused to/.test(e)), 'no CSP violation on any page (§8.3)', js(all.filter((e) => /CSP|Refused/.test(e)).slice(0, 6)));
ok(!all.length, 'no page error and no console error on any page (the refused module of part 8 aside)', js(all.slice(0, 8)));
await closeAll();
console.log(`FAILS ${fails()}`);
process.exit(0);
