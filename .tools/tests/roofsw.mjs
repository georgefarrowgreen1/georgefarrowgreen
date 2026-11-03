// needs: hub
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
// In real Chromium against the hub stack (hubstack.mjs). Selectors from roofhooks.mjs (§3.14).
import { rmSync } from 'node:fs';
import * as H from './roofhooks.mjs';
import { HUB, checker, phone, persistent, dress, account, wxServer, weatherAccount, shown, here, count, textOf, ownGuard, PLACES, wait, until, js, closeAll } from './rooflib.mjs';

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
  await ph.ctx.route(SW_URL, (r) => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', headers: { 'Cache-Control': 'no-cache' }, body: OLD_SW }));
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
const framework = (p) => p.evaluate(() => document.querySelector('meta[name="ifl-hub"]')?.content === '/' && !/OLD WEATHER/.test(document.body?.textContent || '')).catch(() => false);

wxServer();
const acct = await account('Ola Brandt', 'olaroof');
ok(!!acct.cookies, 'an account made at the tests’ sign-in page, its cookie on the tests’ site', js(acct.json));
const everyone = [];

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
  ok(await shown(A.p, 'a[href*="#signin-start&then="]', 20000), 'a. …signed out, InFlite’s way in (D12)');
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
  let p = ctx.pages()[0] || (await ctx.newPage());
  await p.goto(`${HUB}/robots.txt`);
  await weatherAccount(p, { places: [PLACES.London], settings: { temp: 'c' } });
  await p.goto(`${HUB}/`);
  await shown(p, H.TODAY, 30000);
  await p.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 30000 }).catch(() => {});
  await p.goto(`${HUB}/weather/#days`);
  const online = (await shown(p, H.wxSec('days'), 30000)) && (await until(async () => (await count(p, H.DAY_ROW)) >= 10, 20000));
  ok(online, 'c. online once, standalone: Weather’s 16 Days drawn');
  const kept = await until(async () => {
    const c = await cacheNames(p); const name = c?.find((k) => /^roof-weather-\d+\.\d{2}$/.test(k));
    if (!name) return null;
    const n = await p.evaluate((name) => caches.open(name).then((x) => x.keys()).then((k) => k.length), name);
    const cell = await p.evaluate(() => Object.keys(localStorage).some((k) => /^wx:-?\d/.test(k)));
    return n >= 20 && cell ? { name, n } : null;
  }, 30000);
  ok(!!kept, 'c. the module’s files kept by the root worker in roof-weather-<build> ({ ifl: "keep" }, all or nothing), and the forecast in wx:<cell>', js({ kept, caches: await cacheNames(p) }));
  await ctx.close();

  // a fresh window of the same profile: sessionStorage empty, offline
  ctx = await persistent(dir);
  await dress(ctx, 'ola-offline', { standalone: true });
  const guard = ownGuard(ctx);
  await ctx.route(/.*/, (r) => (/^(data|blob):/.test(r.request().url()) ? r.continue() : r.abort('internetdisconnected')));
  await ctx.setOffline(true);
  p = ctx.pages()[0] || (await ctx.newPage());
  await p.goto(`${HUB}/weather/#days`).catch((e) => console.log('note: goto offline:', e.message.split('\n')[0]));
  const blank = await p.evaluate(() => sessionStorage.length).catch(() => -1);
  const up = (await shown(p, H.M_WEATHER, 30000)) && (await shown(p, H.wxSec('days'), 20000));
  const rows = await until(async () => { const n = await count(p, H.DAY_ROW); return n >= 10 ? n : null; }, 20000);
  ok(up && !!rows, `c. offline, a fresh window (sessionStorage started empty: ${blank >= 0 ? 'yes' : '?'}), /weather/#days: the framework from the kept session, the module from roof-weather-*, 16 Days from wx:<cell> (${rows || 0} rows, D11)`, here(p));
  ok((await count(p, `${H.HD_TITLE}`)) === 1 && /London/.test((await textOf(p, H.HD_TITLE)) || ''), 'c. …its header: London (the kept place)', await textOf(p, H.HD_TITLE));
  await shot(p, 'c-offline-days');
  await p.click(H.hdSec('radar')).catch(() => {});
  const radar = await p.waitForFunction((s) => /Radar needs a connection/.test(document.querySelector(s)?.textContent || ''), H.wxSec('radar'), { timeout: 15000 }).then(() => true, () => false);
  ok(radar, 'c. Radar: “Radar needs a connection” (D11)', await textOf(p, H.wxSec('radar')));
  await shot(p, 'c-offline-radar');
  await p.goto(`${HUB}/`).catch(() => {});
  ok((await shown(p, H.TODAY, 30000)) && (await shown(p, H.HD_TITLE, 10000)), 'c. Today offline, standalone: from the kept session, as before (D11)');
  ok(!guard.hits.length && !(await guard.opened()).length, 'c. no navigation or request to Weather’s own address ever started (D23)', js(guard.hits));
  await ctx.close();
});

const all = everyone.flatMap((x) => x.errs || []).filter((e) => !/OLD WEATHER/.test(e));
ok(!all.some((e) => /CSP violation|Refused to/.test(e)), 'no CSP violation on any page (§8.3)', js(all.filter((e) => /CSP|Refused/.test(e)).slice(0, 6)));
await closeAll();
console.log(`FAILS ${fails()}`);
process.exit(0);
