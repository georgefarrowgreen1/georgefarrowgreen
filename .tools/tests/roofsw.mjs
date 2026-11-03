// needs: hub roof-markets roof-fitness
// Service workers under the roof (One roof, spec §10.2, D10, D11, §8.2, §8.4): Weather's old worker at scope /weather/
// (milestone 1's, on phones that opened Weather at the hub) retired two ways, and Weather opened offline from the Home
// Screen. Weather's old worker is stood in for, served for the first register("/weather/sw.js", { scope: "/weather/",
// updateViaCache: "none" }) through the context's routes: skipWaiting, claim, a wx-1.64 cache, /weather/ navigations
// answered cache-first with an "OLD WEATHER" page, as weather/sw.js does (MAIN's real one can't install here: its SUMS
// check fails against the framework's page).
//   a opening / (signed out too) unregisters it, and /weather/ then shows the framework (D10, RI10)
//   b in a fresh context with it registered and the route gone, /weather/ shows the old page once, the update check
//     installs the hub's retiring worker (§8.4), the page is navigated to the framework within 10 s, wx-* caches gone
//   c offline [RB1]: after one online open, a fresh window of the same profile (empty sessionStorage), standalone,
//     offline: /weather/#days → the framework from the kept session, the module from roof-weather-*, the forecast from
//     wx:<cell>; Radar says it needs a connection; no navigation to Weather's own address ever started; Today offline as
//     before (D11, D23)
//   Stage 2 (its spec §9.2, S2-D14, C4, §6), Markets and Fitness modules here (hubstack's roof-markets, roof-fitness):
//   d Markets' and Fitness's old workers at /markets/ and /fitness/ (stood in as Weather's is, their markets-app-* and
//     fitness-app-* caches) unregistered by opening /, and retired by the hub's script when one still answers
//   e offline from the Home Screen: Markets from its kept copy (markets:last, "Prices from …"), Fitness from me:last, each
//     module from roof-<app>-*; their lazy files kept too, standalone, at idle (C4)
//   f in a browser tab (not standalone): only connector.files kept, never the lazy files (RI8)
// In real Chromium against the hub stack (hubstack.mjs). Selectors from roofhooks.mjs (§3.14), save rooflib's declared
// exceptions (EXCEPT: the hub's marker, the way in).
import { rmSync, readFileSync } from 'node:fs';
import * as H from './roofhooks.mjs';
import { HUB, ROOT, EXCEPT, checker, connectorFiles, phone, persistent, dress, account, wxServer, weatherAccount, shown, here, count, textOf, ownGuard, route, PLACES, wait, until, js, closeAll } from './rooflib.mjs';

const [,, S, out] = process.argv;
const { ok, part, fails } = checker();
process.on('uncaughtException', (e) => { console.log(`FAIL  crashed: ${String(e?.message || e).split('\n')[0]}`); console.log(`FAILS ${fails() + 1}`); process.exit(0); });
const shot = (p, name) => p.screenshot({ path: `${out}/${name}.png` }).catch(() => {});

const OLD_PAGE = '<!doctype html><meta charset="utf-8"><title>Weather</title><h1>OLD WEATHER</h1>';
const OLD_SW = `const OLD = ${JSON.stringify(OLD_PAGE)};
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open("wx-1.64").then((c) => c.put("/weather/", new Response(OLD, { headers: { "Content-Type": "text/html; charset=utf-8" } })))); });
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => { const u = new URL(e.request.url); if (e.request.mode === "navigate" && u.pathname.startsWith("/weather/")) e.respondWith(caches.match("/weather/").then((r) => r || fetch(e.request))); });`;
const SW_URL = /^http:\/\/ifl\.test:8788\/weather\/sw\.js(\?|$)/;
// (the stand-in registered from a page of the site's that isn't a framework page (robots.txt), and active)
async function oldWorker(ph) {
  await route(ph.ctx, SW_URL, (r) => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', headers: { 'Cache-Control': 'no-cache' }, body: OLD_SW }));
  await ph.p.goto(`${HUB}/robots.txt`);
  const state = await ph.p.evaluate(async () => {
    try {
      const r = await navigator.serviceWorker.register('/weather/sw.js', { scope: '/weather/', updateViaCache: 'none' });
      const w = r.installing || r.waiting || r.active;
      if (w.state !== 'activated') await new Promise((ok) => { w.addEventListener('statechange', () => w.state === 'activated' && ok()); setTimeout(ok, 10000); });
      return `${new URL(r.scope).pathname} ${w.state}`;
    } catch (e) { return `refused: ${e.message}`; }
  });
  await ph.ctx.unroute(SW_URL);
  return state;
}
const regs = (p) => p.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((r) => new URL(r.scope).pathname)).catch(() => null);
const cacheNames = (p) => p.evaluate(() => caches.keys()).catch(() => null);
// (the framework's page: Today's, with its hub marker for /; never the old one)
const framework = (p) => p.evaluate((m) => document.querySelector(m)?.content === '/' && !/OLD WEATHER/.test(document.body?.textContent || ''), EXCEPT.HUB_MARKER).catch(() => false);

wxServer();
const acct = await account('Ola Brandt', 'olaroof');
ok(!!acct.cookies, 'an account made at the tests’ sign-in page, its cookie on the tests’ site', js(acct.json));
const everyone = [];
const kept = [];   // (the persistent contexts' noted errors, part c)

// ======================================================================================================================
await part('a', 'opening / unregisters Weather’s old worker, signed out too; /weather/ is then the framework', 'D10, RI10, §8.4', async () => {
// ======================================================================================================================
  const A = await phone('ola-out'); everyone.push(A);
  const st = await oldWorker(A);
  ok(st === '/weather/ activated', 'a. Weather’s old worker (stood in) active at scope /weather/', st);
  await A.p.goto(`${HUB}/`);
  const goneOld = await until(async () => { const r = await regs(A.p); return r && !r.includes('/weather/'); }, 20000);
  ok(!!goneOld, 'a. / opened, signed out: the /weather/ registration unregistered (start(), as soon as /api/hub says roof, RI10)', js(await regs(A.p)));
  await A.p.goto(`${HUB}/weather/`);
  await wait(1500);
  ok(await framework(A.p), 'a. /weather/ then: the framework’s page, not the old one (D7, D10)', (await textOf(A.p, 'body'))?.slice(0, 120));
  ok(await shown(A.p, EXCEPT.SIGNIN, 20000), 'a. …signed out, InFlite’s way in (D12)');
  await A.ctx.close();
});

// ======================================================================================================================
await part('b', 'the old worker serves its page once; the update check installs the retiring worker, which sends the page to the framework', '§8.4, D10', async () => {
// ======================================================================================================================
  const B = await phone('ola-old'); everyone.push(B);
  const st = await oldWorker(B);
  ok(st === '/weather/ activated', 'b. a fresh context, the old worker (stood in) active, its route gone', st);
  ok((await cacheNames(B.p))?.includes('wx-1.64'), 'b. …with its wx-1.64 cache', js(await cacheNames(B.p)));
  const docs = [];
  B.p.on('framenavigated', (f) => { if (f === B.p.mainFrame()) docs.push(f.url()); });
  await B.p.goto(`${HUB}/weather/`);
  const oldOnce = /OLD WEATHER/.test((await textOf(B.p, 'body')) || '');
  ok(oldOnce, 'b. /weather/: the old worker answers with its old page, once (§8.4)', (await textOf(B.p, 'body'))?.slice(0, 80));
  const t0 = Date.now();
  const moved = await until(() => framework(B.p), 10000);
  ok(!!moved, `b. the update check installed the hub’s retiring worker, which navigated the page: the framework within 10 s (${Math.round((Date.now() - t0) / 100) / 10} s, §8.4)`, js(docs));
  ok(new URL(B.p.url()).pathname === '/weather/', 'b. …still at /weather/', B.p.url());
  const left = await until(async () => { const c = await cacheNames(B.p); const r = await regs(B.p); return c && r && !c.some((k) => k.startsWith('wx-')) && !r.includes('/weather/') ? { c, r } : null; }, 8000);
  ok(!!left, 'b. every wx-* cache deleted and the /weather/ registration gone (RETIRE_SW)', js({ caches: await cacheNames(B.p), regs: await regs(B.p) }));
  await B.ctx.close();
});

// ======================================================================================================================
await part('c', 'offline from the Home Screen: Weather from the kept session, the module from roof-weather-*, the forecast from wx:<cell>', 'D11, D23, RB1, §8.2', async () => {
// ======================================================================================================================
  const dir = `${S}/roofsw-profile`;
  rmSync(dir, { recursive: true, force: true });
  // online once: Today, then Weather on 16 Days (the root worker keeps / and the module's files; Weather keeps its forecast)
  let ctx = await persistent(dir);
  await dress(ctx, 'ola', { cookies: acct.cookies || {}, standalone: true });
  kept.push(ctx.__errs);
  let p = ctx.pages()[0] || (await ctx.newPage());
  await p.goto(`${HUB}/robots.txt`);
  await weatherAccount(p, { places: [PLACES.London], settings: { temp: 'c' } });
  await p.goto(`${HUB}/`);
  await shown(p, H.TODAY, 30000);
  await p.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 30000 }).catch(() => {});
  await p.goto(`${HUB}/weather/#days`);
  const online = (await shown(p, H.wxSec('days'), 30000)) && (await until(async () => (await count(p, H.DAY_ROW)) >= 10, 20000));
  ok(online, 'c. online once, standalone: Weather’s 16 Days drawn');
  const keptFiles = await until(async () => {
    const c = await cacheNames(p); const name = c?.find((k) => /^roof-weather-\d+\.\d{2}$/.test(k));
    if (!name) return null;
    const n = await p.evaluate((name) => caches.open(name).then((x) => x.keys()).then((k) => k.length), name);
    const cell = await p.evaluate(() => Object.keys(localStorage).some((k) => /^wx:-?\d/.test(k)));
    return n >= 20 && cell ? { name, n } : null;
  }, 30000);
  ok(!!keptFiles, 'c. the module’s files kept by the root worker in roof-weather-<build> ({ ifl: "keep" }, all or nothing), and the forecast in wx:<cell>', js({ kept: keptFiles, caches: await cacheNames(p) }));
  await ctx.close();

  // a fresh window of the same profile: sessionStorage empty, offline
  ctx = await persistent(dir);
  await dress(ctx, 'ola-offline', { standalone: true });
  kept.push(ctx.__errs);
  // (sessionStorage as each document starts, before any of its own scripts: a fresh window's is empty)
  await ctx.addInitScript(() => { window.__roofSS0 = sessionStorage.length; });
  const guard = ownGuard(ctx);
  await route(ctx, /.*/, (r) => (/^(data|blob):/.test(r.request().url()) ? r.continue() : r.abort('internetdisconnected')));
  await ctx.setOffline(true);
  p = ctx.pages()[0] || (await ctx.newPage());
  await p.goto(`${HUB}/weather/#days`).catch((e) => console.log('note: goto offline:', e.message.split('\n')[0]));
  const blank = await p.evaluate(() => window.__roofSS0 ?? null).catch(() => null);
  ok(blank === 0, 'c. a fresh window of the same profile: its sessionStorage empty as the page started (no kept session in it)', String(blank));
  const up = (await shown(p, H.M_WEATHER, 30000)) && (await shown(p, H.wxSec('days'), 20000));
  const rows = await until(async () => { const n = await count(p, H.DAY_ROW); return n >= 10 ? n : null; }, 20000);
  ok(up && !!rows, `c. offline, that fresh window, /weather/#days: the framework from the kept session, the module from roof-weather-*, 16 Days from wx:<cell> (${rows || 0} rows, D11)`, here(p));
  ok((await count(p, `${H.HD_TITLE}`)) === 1 && /London/.test((await textOf(p, H.HD_TITLE)) || ''), 'c. …its header: London (the kept place)', await textOf(p, H.HD_TITLE));
  await shot(p, 'c-offline-days');
  await p.click(H.hdSec('radar')).catch(() => {});
  const radar = await p.waitForFunction((s) => /Radar needs a connection/.test(document.querySelector(s)?.textContent || ''), H.wxSec('radar'), { timeout: 15000 }).then(() => true, () => false);
  ok(radar, 'c. Radar: “Radar needs a connection” (D11)', await textOf(p, H.wxSec('radar')));
  await shot(p, 'c-offline-radar');
  await p.goto(`${HUB}/`).catch(() => {});
  ok((await shown(p, H.TODAY, 30000)) && (await shown(p, H.HD_TITLE, 10000)), 'c. Today offline, standalone: from the kept session, as before (D11)');
  ok(!guard.hits.length, 'c. no navigation or request to Weather’s own address ever started (D23)', js(guard.hits));
  await ctx.close();
});

// ---- stage 2: Markets and Fitness ----
// (an app's old hub worker, stood in as Weather's above: its own cache, its page answered cache-first at its scope)
const OLD_APP = { markets: { cache: 'markets-app-1.95', page: 'OLD MARKETS' }, fitness: { cache: 'fitness-app-1.67', page: 'OLD FITNESS' } };
const oldSw = (app) => { const o = OLD_APP[app], page = `<!doctype html><meta charset="utf-8"><title>${app}</title><h1>${o.page}</h1>`;
  return `const OLD = ${JSON.stringify(page)};
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(${JSON.stringify(o.cache)}).then((c) => c.put("/${app}/", new Response(OLD, { headers: { "Content-Type": "text/html; charset=utf-8" } })))); });
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => { const u = new URL(e.request.url); if (e.request.mode === "navigate" && u.pathname.startsWith("/${app}/")) e.respondWith(caches.match("/${app}/").then((r) => r || fetch(e.request))); });`; };
async function oldAppWorker(ph, app) {
  const re = new RegExp(`^http://ifl\\.test:8788/${app}/sw\\.js(\\?|$)`);
  await route(ph.ctx, re, (r) => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', headers: { 'Cache-Control': 'no-cache' }, body: oldSw(app) }));
  await ph.p.goto(`${HUB}/robots.txt`);
  const st = await ph.p.evaluate(async (app) => {
    try {
      const r = await navigator.serviceWorker.register(`/${app}/sw.js`, { scope: `/${app}/`, updateViaCache: 'none' });
      const w = r.installing || r.waiting || r.active;
      if (w.state !== 'activated') await new Promise((ok) => { w.addEventListener('statechange', () => w.state === 'activated' && ok()); setTimeout(ok, 10000); });
      return `${new URL(r.scope).pathname} ${w.state}`;
    } catch (e) { return `refused: ${e.message}`; }
  }, app);
  await ph.ctx.unroute(re);
  return st;
}
const lazyOf = (app) => { const t = (() => { try { return readFileSync(`${ROOT}/${app}/roof/connector.js`, 'utf8'); } catch (_) { return ''; } })(); const m = /lazy:\s*\[([\s\S]*?)\]/.exec(t); return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : []; };
// (the paths kept in an app's roof-<app>-<build> cache: { name, paths } or null)
const keptOf = (p, app) => p.evaluate(async (app) => {
  const name = (await caches.keys()).find((k) => new RegExp(`^roof-${app}-\\d+\\.\\d{2}$`).test(k));
  if (!name) return null;
  return { name, paths: (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname) };
}, app).catch(() => null);
const SCREEN = { markets: [H.M_MARKETS, () => `${H.M_MARKETS} ${H.MK_HERO}`], fitness: [H.M_FITNESS, () => `${H.M_FITNESS} ${H.FX_DAYCARD}`] };

// ======================================================================================================================
await part('d', 'Markets’ and Fitness’s old workers: unregistered by opening /, and retired by the hub’s script', 'stage 2 S2-D14, §6, §5.3', async () => {
// ======================================================================================================================
  for (const app of ['markets', 'fitness']) {
    const A = await phone(`ola-${app}-out`); everyone.push(A);
    const st = await oldAppWorker(A, app);
    ok(st === `/${app}/ activated`, `d. ${app}: its old worker (stood in) active at scope /${app}/`, st);
    await A.p.goto(`${HUB}/`);
    const goneOld = await until(async () => { const r = await regs(A.p); return r && !r.includes(`/${app}/`) ? 'gone' : null; }, 20000);
    ok(!!goneOld, `d. ${app}: / opened: the /${app}/ registration unregistered (retireOld, ${app} known on)`, js(await regs(A.p)));
    await A.ctx.close();

    const B = await phone(`ola-${app}-old`); everyone.push(B);
    const st2 = await oldAppWorker(B, app);
    ok(st2 === `/${app}/ activated` && (await cacheNames(B.p))?.includes(OLD_APP[app].cache), `d. ${app}: a fresh context, the old worker active with its ${OLD_APP[app].cache} cache`, js({ st2, caches: await cacheNames(B.p) }));
    await B.p.goto(`${HUB}/${app}/`);
    ok(new RegExp(OLD_APP[app].page).test((await textOf(B.p, 'body')) || ''), `d. ${app}: /${app}/ answered once by the old worker’s page`, (await textOf(B.p, 'body'))?.slice(0, 60));
    const t0 = Date.now();
    const moved = await until(() => framework(B.p), 10000);
    ok(!!moved && new URL(B.p.url()).pathname === `/${app}/`, `d. ${app}: the update check installed the hub’s retiring worker, which navigated the page to the framework within 10 s (${Math.round((Date.now() - t0) / 100) / 10} s)`, B.p.url());
    const left = await until(async () => { const c = await cacheNames(B.p), r = await regs(B.p); return c && r && !c.some((k) => k.startsWith(`${app}-app-`)) && !r.includes(`/${app}/`) ? 'clean' : null; }, 8000);
    ok(!!left, `d. ${app}: every ${app}-app-* cache deleted, the /${app}/ registration gone (RETIRE_SW(${app}))`, js({ caches: await cacheNames(B.p), regs: await regs(B.p) }));
    await B.ctx.close();
  }
});

// ======================================================================================================================
await part('e', 'offline from the Home Screen: Markets and Fitness from their kept copies; their lazy files kept too', 'stage 2 §6, D11, C4, S2-D9', async () => {
// ======================================================================================================================
  const dir = `${S}/roofsw-profile-24`;
  rmSync(dir, { recursive: true, force: true });
  let ctx = await persistent(dir);
  await dress(ctx, 'ola-24', { cookies: acct.cookies || {}, standalone: true });
  kept.push(ctx.__errs);
  let p = ctx.pages()[0] || (await ctx.newPage());
  await p.goto(`${HUB}/robots.txt`);
  await p.evaluate(() => fetch('/api/markets/holding', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: 'TSCO.L', name: 'Tesco', qty: 10 }) }));
  await p.goto(`${HUB}/`); await shown(p, H.TODAY, 30000);
  await p.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 30000 }).catch(() => {});
  for (const app of ['markets', 'fitness']) {
    await p.goto(`${HUB}/${app}/`);
    const [scr, hero] = SCREEN[app];
    ok((await shown(p, scr, 30000)) && (await shown(p, hero(), 30000)), `e. online once, standalone: ${app}’s Today drawn`);
    const files = connectorFiles(app), lazy = lazyOf(app);
    // (files kept after mount; files ∪ lazy only standalone, at idle, ≥ 10 s after the first show: C4)
    const all = await until(async () => { const k = await keptOf(p, app); return k && files.every((f) => k.paths.includes(f)) && lazy.every((f) => k.paths.includes(f)) ? k : null; }, 45000);
    ok(!!all && lazy.length > 0, `e. ${app}: kept in ${all?.name || 'roof-' + app + '-*'}: its ${files.length} files and, standalone, its ${lazy.length} lazy files (C4)`, js({ kept: (await keptOf(p, app))?.paths?.length, files: files.length, lazy: lazy.length, missing: lazy.filter((f) => !((all?.paths) || []).includes(f)).slice(0, 4) }));
    ok(!((all?.paths) || []).some((x) => /\/weather\/vendor\/|\/fitness\/(map|mapstyle|share|formats|fit|reader)\.js$/.test(x)), `e. ${app}: no NET file kept (vendor, map, share, formats, fit, reader: C4)`, js(all?.paths?.filter((x) => /vendor|map|share|formats|fit\.js|reader/.test(x))));
  }
  const local = await p.evaluate(() => Object.keys(localStorage));
  ok(local.includes('markets:last') && local.some((k) => /^me:last$|^fitness:/.test(k)), 'e. the kept copies: markets:last, and Fitness’s', js(local.filter((k) => /markets|fitness|me:/.test(k))));
  await ctx.close();

  ctx = await persistent(dir);
  await dress(ctx, 'ola-24-offline', { standalone: true });
  kept.push(ctx.__errs);
  await route(ctx, /.*/, (r) => (/^(data|blob):/.test(r.request().url()) ? r.continue() : r.abort('internetdisconnected')));
  await ctx.setOffline(true);
  p = ctx.pages()[0] || (await ctx.newPage());
  await p.goto(`${HUB}/markets/`).catch((e) => console.log('note: goto offline:', e.message.split('\n')[0]));
  const mk = (await shown(p, H.M_MARKETS, 30000)) && (await shown(p, `${H.M_MARKETS} ${H.MK_HERO}`, 20000));
  ok(mk, 'e. offline, a fresh window, /markets/: the framework from the kept session, Markets from roof-markets-*, Today from markets:last (§6)', here(p));
  ok(/Prices from \d{1,2}:\d{2}/.test((await textOf(p, H.M_MARKETS)) || ''), 'e. …saying “Prices from HH:MM” (§2.1, §6)', (await textOf(p, H.M_MARKETS))?.slice(0, 160));
  await shot(p, 'e-offline-markets');
  await p.goto(`${HUB}/fitness/`).catch(() => {});
  const fx = (await shown(p, H.M_FITNESS, 30000)) && (await shown(p, `${H.M_FITNESS} ${H.FX_DAYCARD}`, 20000));
  ok(fx, 'e. offline, /fitness/: Fitness’s Today from me:last and roof-fitness-* (§6)', here(p));
  await p.click(H.hdSec('activities')).catch(() => {});
  ok(await shown(p, `${H.M_FITNESS} ${H.fxSec('activities')}`, 20000) && !(await count(p, `${H.M_FITNESS} ${H.ERROR}`)), 'e. …Activities offline too, its lazy file from the kept copy (no error state, C4)');
  await shot(p, 'e-offline-fitness');
  await ctx.close();
});

// ======================================================================================================================
await part('f', 'in a browser tab: only connector.files kept, never the lazy files', 'stage 2 RI8, C4', async () => {
// ======================================================================================================================
  const T = await phone('ola-tab', { cookies: acct.cookies || {} }); everyone.push(T);
  await T.p.goto(`${HUB}/`); await shown(T.p, H.TODAY, 30000);
  await T.p.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 30000 }).catch(() => {});
  await T.p.goto(`${HUB}/markets/`);
  await shown(T.p, `${H.M_MARKETS} ${H.MK_HERO}`, 30000);
  const files = connectorFiles('markets'), lazy = lazyOf('markets');
  const k = await until(async () => { const x = await keptOf(T.p, 'markets'); return x && files.every((f) => x.paths.includes(f)) ? x : null; }, 30000);
  await wait(15000);
  const k2 = await keptOf(T.p, 'markets');
  const extra = (k2?.paths || []).filter((x) => lazy.includes(x));
  ok(!!k && !extra.length, `f. a browser tab, Markets open 15 s and more: its ${files.length} files kept, none of its ${lazy.length} lazy files (RI8)`, js({ kept: k2?.paths?.length, extra }));
  await T.ctx.close();
});

// (the old page stood in for aside: it's the test's, not the site's)
const all = [...everyone.flatMap((x) => x.errs || []), ...kept.flat()].filter((e) => !/OLD (WEATHER|MARKETS|FITNESS)/.test(e));
ok(!all.some((e) => /CSP violation|Refused to/.test(e)), 'no CSP violation on any page (§8.3)', js(all.filter((e) => /CSP|Refused/.test(e)).slice(0, 6)));
ok(!all.length, 'no page error and no console error on any page, offline included', js(all.slice(0, 8)));
await closeAll();
console.log(`FAILS ${fails()}`);
process.exit(0);
