// needs: hub roof-markets
// Markets under the roof at InFlite's hub (One roof stage 2, spec §9.2): inflite.ai (ifl.test:8788 here) one page that
// never reloads between Today, Apps, You, Weather and Markets, Markets drawn by its module (markets/roof/*, served through
// the hub, switched on by ROOF_MARKETS: hubstack's roof-markets) with the framework's header, switcher, sheets, search and
// Send. In real Chromium against the hub stack, signed in by the account's cookie; prices from the site's Markets stand-in
// (mocks/marketsmock.mjs: Tesco 412p, Rolls-Royce 894p), Chat's engine stood in for (rooflib engine). Every check's line
// names the spec section it proves; every selector is roofhooks.mjs's (B0), save rooflib's declared exceptions.
//   1 Today's card and Apps' tile open Markets in-page (one document; zoom from the card), the header (§2.1, S2-D18)
//   2 sections by replaceState and their addresses; Back with the scroll kept; Apps tab from inside Markets
//   3 cold links #s=TSCO.L, #s=%5EGSPC, #holdings, #news, #income: shown, then the address tidied (C1, §2.6, D6)
//   4 the stock sheet: alert %, Send (engine stand-in: the card percent only), Remove; the portfolio's Send (S2-D6)
//   5 polling: nothing of /api/markets/* while Weather is shown or the page hidden (S2-D4)
//   6 the budget: first open of Today (§4.6: JS ≤ 40, CSS ≤ 12 KB gzip, requests ≤ files + 2)
//   7 storage and privacy: no new key, no today:* change, no amount in URLs, history.state, sessionStorage, console
//   8 a 401 with the session alive: no sign-out; 8b a confirmed sign-out leaves no markets:* (RB1)
//   9 a new Markets build mid-session: no reload in use; a lazy section while stale and idle
//     reloads first, at its address (D21, C7)
//   10 a price alert's tap: the stock sheet, in the page (§2.7)
//   11 You's Evening Wrap → PATCH /api/notify { markets: { wrap } } (S2-D7)
//   12 a holding changed in Markets → Today's cards asked for again on return (RI3, C8)
//   13 Search from Markets: a Weather place still found (RI1, C6); Markets' own entries, no amounts; Find "…" (§2.5)
//   14 axe, 320/390 light and dark (Back to Today, the crumb), 1280 two columns with the desk row (S2-D8, BI15)
import { readFileSync } from 'node:fs';
import * as H from './roofhooks.mjs';
import {
  HUB, ROOT, EXCEPT, checker, phone, account, wxServer, engine, weatherAccount, pageCall, alive, loads, history, said, here, shown, textOf, attrOf, count,
  storage, changed, axe, meter, visible, connectorFiles, connectorLazy, hide, show, route, hostCall, tapNotification, rootWorker, PLACES, wait, until, js, closeAll,
} from './rooflib.mjs';

const [,, S, out] = process.argv;
const { ok, part, fails } = checker();
process.on('uncaughtException', (e) => { console.log(`FAIL  crashed: ${String(e?.message || e).split('\n')[0]}`); console.log(`FAILS ${fails() + 1}`); process.exit(0); });
const shot = (p, name) => p.screenshot({ path: `${out}/${name}.png` }).catch(() => {});
const APP = 'markets';

// ---- what this test needs before it can prove anything: B0's hooks, MK's module, the switch on at the hub ----
const HOOKS = ['M_MARKETS', 'MK_SEC', 'mkSec', 'mkRow', 'MK_HERO', 'MK_PORTFOLIO_SEND', 'MK_STOCK_SEND', 'MK_STOCK_REMOVE', 'MK_ALERT', 'MK_ADD_INPUT', 'MK_ADD_RESULT',
  'MK_ABOUT', 'TODAY_MK_CARD', 'TODAY_MK_OPEN', 'YOU_MK_WRAP', 'hdAct', 'hdSec', 'sheet', 'SEARCH_INPUT', 'SEARCH_RESULT'];
const noHook = HOOKS.filter((k) => H[k] === undefined);
const src = (f) => { try { return readFileSync(`${ROOT}/${f}`, 'utf8'); } catch (_) { return null; } };
const entry = src('markets/roof/markets.js');
const hubSays = await hostCall('ifl.test:8788', '/api/hub').catch(() => null);
const notReady = [
  ...noHook.map((k) => `roofhooks.mjs has no ${k} (B0)`),
  ...(!entry ? ['no markets/roof/markets.js (B0, MK)'] : /export const STUB\s*=\s*true/.test(entry) ? ['markets/roof/markets.js is still B0’s stub (MK)'] : []),
  ...(hubSays?.json?.apps?.markets === true ? [] : [`/api/hub says ${js(hubSays?.json)}: not apps.markets true (SV: ROOF_MARKETS, hubstack roof-markets)`]),
];
if (notReady.length) { for (const r of notReady) console.log(`SKIPPED  ${r}`); console.log('FAILS 1'); process.exit(0); }

// ---- the module's own numbers, read from its files ----
const FILES = connectorFiles(APP), LAZY = connectorLazy(APP);
const BUILD = /^export const BUILD = "([^"]+)";/m.exec(entry)?.[1] || null;
// (an amount of George's: the two holdings' values, the total, the day's change in pounds: none may leave the screen)
const AMOUNTS = /£|824\.00|357\.60|1,181|1181\.6|9\.04|\b6\.64\b|\b2\.40\b/;

wxServer();
const acct = await account('Imogen Ferris', 'imogenroof');
ok(!!acct.cookies, 'an account made at the tests’ sign-in page, its cookie on the tests’ site (Today’s session at the hub)', js(acct.json));
const cookies = acct.cookies || {};
const everyone = [];
const open = async (name, o = {}) => { const ph = await phone(name, { cookies, ...o }); everyone.push(ph); return ph; };

// ---- helpers over the hooks ----
const SEC = (id) => `${H.M_MARKETS} ${H.mkSec(id)}`;
// (a holding's row as shown: Today's movers use the same row (data-k=holding) in the Today section, which comes first in
// the DOM and is hidden once Holdings shows, so only the visible match is waited for or tapped)
const MK_ANY = `${H.M_MARKETS} ${H.MK_SEC}`;
const ROW = (sym) => `${H.M_MARKETS} ${H.mkRow(sym)} >> visible=true`;
// (local aliases, no hook frozen for them yet (asked of j0 as MK_ALERT_OPEN and MK_ADD_FOLLOW): the stock sheet's
// Alert Me tool, which pushes the view holding MK_ALERT's field (stock.js alertView), and a result's + to follow it)
const ALERT_OPEN = `${H.sheet('stock')} [data-el=alert]`;
const ADD_FOLLOW = (sym) => `${H.MK_ADD_RESULT}[data-sym="${sym}"] button[aria-label^="Follow"]`;
// (Remove asks for a second tap on the same button within 3.5 s, "Tap again to remove": both taps given)
const removeTwice = async (p) => { await p.locator(H.MK_STOCK_REMOVE).scrollIntoViewIfNeeded().catch(() => {}); await p.click(H.MK_STOCK_REMOVE); await wait(300); await p.click(H.MK_STOCK_REMOVE); };
const titleIs = (p, want, ms = 20000) => p.waitForFunction(([s, w]) => document.querySelector(s)?.textContent.trim() === w, [H.HD_TITLE, want], { timeout: ms }).then(() => true, () => false);
const at = (p, path, ms = 10000) => p.waitForFunction((u) => location.pathname + location.search + location.hash === u, path, { timeout: ms }).then(() => true, () => false);
const marketsUp = async (p, sec = 'today', ms = 30000) => (await shown(p, H.M_MARKETS, ms)) && (await shown(p, SEC(sec), ms)) && (sec !== 'today' || (await shown(p, `${H.M_MARKETS} ${H.MK_HERO}`, ms)));
const todayUp = async (p, ms = 30000) => (await shown(p, H.TODAY, ms)) && (await shown(p, H.HD_TITLE, ms));
const weatherUp = async (p, ms = 30000) => (await shown(p, H.M_WEATHER, ms)) && (await shown(p, `${H.M_WEATHER} ${H.WX_HERO}`, ms));
const cold = async (p, path) => { await p.goto(`${HUB}/robots.txt`); const d = loads(p); await p.goto(`${HUB}${path}`); return d; };
const tapTile = (p, app = APP) => p.evaluate((s) => { const a = document.querySelector(s); if (!a) return false; a.click(); return true; }, EXCEPT.tileLink(app));
const tapEl = (p, sel) => p.evaluate((s) => { const a = document.querySelector(s); if (!a) return false; a.click(); return true; }, sel);
const sheetOpen = (p, name, ms = 15000) => shown(p, `${H.sheet(name)}[open]`, ms);
const closeSheets = async (p) => { for (let i = 0; i < 4 && (await count(p, H.SHEET_OPEN)); i++) { await p.click(H.SHEET_CLOSE).catch(() => p.keyboard.press('Escape')); await wait(450); } };
const sections = (p) => p.$$eval(H.HD_SEC, (els) => els.map((e) => ({ id: e.dataset.sec, label: e.childNodes[0]?.textContent.trim() || e.textContent.trim(), on: e.getAttribute('aria-selected') }))).catch(() => []);
// (the requests the page makes to Markets' API, noted from now: method, path and query)
const apiLog = (p, re = /\/api\/markets\//) => { const list = []; const on = (r) => { try { const u = new URL(r.url()); if (re.test(u.pathname)) list.push({ m: r.method(), u: u.pathname + u.search, body: r.postData(), t: Date.now() }); } catch (_) {} }; p.on('request', on); return { list, n: () => list.length, reset: () => { list.length = 0; }, stop: () => p.off('request', on) }; };
const card = (packed) => { try { return JSON.parse(Buffer.from(String(packed), 'base64url').toString()); } catch (_) { return null; } };
const keys = (o) => Object.keys(o || {}).sort().join(',');

// M: Imogen's phone, a browser tab at 390×844, Chat's engine stood in for; two holdings and a Weather place in the account
const M = await open('imogen');
await engine(M.ctx);
const { p } = M;
const consoleAll = []; M.ctx.on('console', (m) => consoleAll.push(m.text()));
const urls = []; M.ctx.on('request', (r) => urls.push(r.url()));
await p.goto(`${HUB}/robots.txt`);
await weatherAccount(p, { places: [PLACES.London], settings: { temp: 'c' } });
const put = [await pageCall(p, 'PUT', '/api/markets/holding', { symbol: 'TSCO.L', name: 'Tesco', qty: 200, cost: 3.5 }), await pageCall(p, 'PUT', '/api/markets/holding', { symbol: 'RR.L', name: 'Rolls-Royce', qty: 40 })];
ok(put.every((r) => r.s === 200), 'Imogen’s two holdings in the account through the hub (Tesco 200, Rolls-Royce 40), and London in Weather', js(put.map((r) => r.s)));
await p.goto(`${HUB}/`);
await todayUp(p);
// (the baseline once Today has kept its own copy, today:cards:<id> and today:session (today/public/app.js keepSession),
// so the host's own writes aren't taken for the module's)
await until(async () => (Object.keys((await storage(p)).local).some((k) => k.startsWith('today:cards:')) ? 'kept' : null), 20000);
const before = await storage(p);
// (Today's own keys, written by the host whenever it draws: not the module's; never removed while signed in)
const HOST_KEYS = /^local:today:(session$|cards:)/;
// (money as it would sit in a kept value: pounds, or one of George's figures written out)
const MONEY = /£|824\.00|357\.60|1,181|1181\.6/;

// ======================================================================================================================
await part(1, 'Today’s card and Apps’ tile open Markets in the page; the header', '§2.1, §2.4, S2-D17, S2-D18, D2, D6', async () => {
// ======================================================================================================================
  const up = await shown(p, H.TODAY_MK_OPEN, 40000);
  ok(up, '1. Today, its Markets card drawn (pounds, as ever: R2)', await textOf(p, H.TODAY_MK_CARD));
  const life = await alive(p), docs = loads(p), h0 = (await history(p)).length;
  const z = await p.evaluate(async ({ open, scr, clone }) => {
    const a = document.querySelector(open); if (!a) return { tapped: false };
    a.click();
    const seen = [];
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      const m = document.querySelector(scr);
      seen.push({ shown: !!m && !m.hidden && m.getClientRects().length > 0, clone: !!document.querySelector(clone) });
      if (seen.at(-1).shown) break;
    }
    return { tapped: true, frames: seen.length, last: seen.at(-1), clone: seen.some((s) => s.clone) };
  }, { open: H.TODAY_MK_OPEN, scr: H.M_MARKETS, clone: `${H.M_MARKETS} .ifl-zoom-slot` });
  ok(z.tapped && z.last?.shown && z.frames <= 4, '1. the card’s head tapped: Markets’ screen within a few frames (zoom from .tcard, S2-D17)', js(z));
  ok(await marketsUp(p), '1. …then Markets’ Today: the portfolio box (MK_HERO, fw.zoomTarget)');
  ok(await p.waitForFunction((c) => !document.querySelector(c), `${H.M_MARKETS} .ifl-zoom-slot`, { timeout: 15000 }).then(() => true, () => false), '1. …the card’s clone taken away once the hero is in (S2-D17)');
  ok(await at(p, '/markets/'), '1. the address tidied to /markets/ once shown (D6)', here(p));
  const hs = (await history(p)).slice(h0);
  // (the card's head links finance.inflite.ai/, which maps to /markets/ exactly: one push and nothing to tidy; a replace
  // is asked for only when the pushed address had a hash to take away)
  const pushed = hs[0]?.kind === 'push' ? new URL(hs[0].url) : null;
  const plain = (u) => u.pathname === '/markets/' && !u.hash && !u.search;
  ok(!!pushed && (plain(pushed) || hs.some((x) => x.kind === 'replace' && plain(new URL(x.url)))), '1. pushed with the card’s address (/markets/), replaced by /markets/ only if it had a hash', js(hs.map((x) => `${x.kind} ${x.url}`)));
  ok((await life.same()) && docs.n() === 0, '1. one page: the same document, no document fetched (D2)', js(docs.list));
  await shot(p, '1-today-from-card');

  ok(/Markets/.test((await textOf(p, H.HD_CRUMB)) || ''), '1. header crumb: Markets (S2-D18)', await textOf(p, H.HD_CRUMB));
  ok(await titleIs(p, 'Today'), '1. header title: the section, Today (S2-D18)', await textOf(p, H.HD_TITLE));
  const line = (await textOf(p, H.HD_LINE)) || '';
  ok(line.length > 0 && !AMOUNTS.test(line), '1. the line: the market’s state, never your money (“London open · closes 16:30”, S2-D18)', line);
  ok((await count(p, H.HD_PICK)) === 0, '1. no ▾ pick for Markets (S2-D18)');
  ok((await count(p, H.hdAct('plus'))) === 1 && /Add a Stock/.test((await attrOf(p, H.hdAct('plus'), 'aria-label')) || (await textOf(p, H.hdAct('plus'))) || ''), '1. one act beside Search: Add a Stock (icon plus, S2-D18)', await attrOf(p, H.hdAct('plus'), 'aria-label'));
  ok((await count(p, H.HD_SEARCH)) === 1, '1. Search in the header (§2.5)');
  ok((await attrOf(p, H.HD_BACK, 'aria-label')) === 'Back to Today' && (await p.isVisible(H.HD_BACK).catch(() => false)), '1. Back, labelled “Back to Today” (kept over a section titled Today, S2-D18)', await attrOf(p, H.HD_BACK, 'aria-label'));
  const secs = await sections(p);
  ok(js(secs.map((s) => s.id)) === js(['today', 'holdings', 'news']) && /Today/.test(secs[0]?.label) && /Holdings/.test(secs[1]?.label) && /News/.test(secs[2]?.label) && secs[0]?.on === 'true',
    '1. the switcher: Today · Holdings · News, Today selected (§2.1, C2)', js(secs));
  ok((await count(p, H.htmlApp(APP))) === 1 && (await attrOf(p, H.tab('apps'), 'aria-current')) === 'true', '1. html[data-app=markets]; the tab bar’s Apps current');
  await p.evaluate(() => scrollTo(0, 500));
  const compact = await p.waitForFunction((s) => /^Markets · /.test(document.querySelector(s)?.textContent.trim() || ''), H.HD_TITLE, { timeout: 5000 }).then(() => true, () => false);
  const ct = (await textOf(p, H.HD_TITLE)) || '';
  ok(compact && /%|flat/i.test(ct) && !AMOUNTS.test(ct), '1. scrolled, the compact title: “Markets · +0.8%”, the day’s percent, never pounds (S2-D18, S2-D6)', ct);
  await p.evaluate(() => scrollTo(0, 0)); await wait(400);

  await p.click(H.HD_BACK);
  ok((await todayUp(p)) && (await at(p, '/')), '1. Back: Today', here(p));
  await p.click(H.tab('apps'));
  await shown(p, H.appTile(APP), 20000);
  const d2 = loads(p), h1 = (await history(p)).length;
  ok(await tapTile(p), '1. Apps’ Markets tile tapped (its link)');
  ok(await marketsUp(p), '1. Markets in the page from the tile (§2.4)');
  ok(d2.n() === 0 && (await history(p)).slice(h1).some((x) => x.kind === 'push') && (await count(p, `${H.M_MARKETS} .ifl-zoom-slot`)) === 0, '1. …pushed, no document fetched, no clone (a tile isn’t a card)', js(d2.list));
  ok((await attrOf(p, H.HD_BACK, 'aria-label')) === 'Back to Apps', '1. …Back says “Back to Apps”', await attrOf(p, H.HD_BACK, 'aria-label'));
  d2.stop(); docs.stop();
});

// ======================================================================================================================
await part(2, 'sections by replaceState; Back with the scroll kept; Apps tab from inside Markets', '§2.1, D6, D20', async () => {
// ======================================================================================================================
  const life = await alive(p), h0 = (await history(p)).length;
  await p.click(H.hdSec('holdings'));
  const hold = (await shown(p, SEC('holdings'), 30000)) && (await shown(p, ROW('TSCO.L'), 30000));
  ok(hold && (await at(p, '/markets/#holdings')), '2. Holdings (lazy, its file loaded on first open): Tesco’s row; the address /markets/#holdings', here(p));
  ok(await titleIs(p, 'Holdings'), '2. …the title Holdings', await textOf(p, H.HD_TITLE));
  await p.click(H.hdSec('news'));
  ok((await shown(p, SEC('news'), 30000)) && (await at(p, '/markets/#news')), '2. News: /markets/#news', here(p));
  await p.click(H.hdSec('today'));
  ok((await shown(p, SEC('today'))) && (await at(p, '/markets/')), '2. Today: /markets/', here(p));
  const hs = (await history(p)).slice(h0);
  ok(hs.length >= 3 && hs.every((x) => x.kind === 'replace'), '2. each section by replaceState, never a push (D6)', js(hs.map((x) => `${x.kind} ${x.url}`)));
  ok(await life.same(), '2. one page throughout');
  for (const x of hs) ok(!AMOUNTS.test(js(x.state)) && !AMOUNTS.test(x.url || ''), `2. history entry ${x.url}: no amount in its address or state (S2-D6)`, js(x));

  // Back to Today with Today's scroll kept
  await p.click(H.HD_BACK); await shown(p, H.APPS); await p.click(H.tab('today')); await todayUp(p);
  const y0 = await p.evaluate(() => { scrollTo(0, Math.min(500, document.documentElement.scrollHeight - innerHeight)); return Math.round(scrollY); });
  await wait(300);
  await p.locator(H.TODAY_MK_OPEN).scrollIntoViewIfNeeded().catch(() => {});
  const y1 = await p.evaluate(() => Math.round(scrollY));
  await tapEl(p, H.TODAY_MK_OPEN); await marketsUp(p);
  await p.click(H.HD_BACK); await todayUp(p);
  const y2 = await until(async () => { const y = await p.evaluate(() => Math.round(scrollY)); return Math.abs(y - y1) <= 6 ? String(y) : null; }, 6000);
  ok(y2 != null, `2. Back to Today: its scroll as it was when the card was tapped (${y1}px, D20)`, js({ y0, y1, now: await p.evaluate(() => scrollY) }));

  // the tab bar's Apps from inside Markets, and back in: Markets kept mounted (the tile's address is /markets/, Markets'
  // Today, D6: no section is promised back from a tile)
  await tapEl(p, H.TODAY_MK_OPEN); await marketsUp(p);
  await p.click(H.hdSec('holdings')); await shown(p, SEC('holdings'));
  await p.click(H.tab('apps'));
  ok((await shown(p, H.APPS)) && (await at(p, '/#apps')), '2. the tab bar’s Apps from inside Markets: Apps', here(p));
  const d3 = loads(p);
  await tapTile(p);
  ok((await shown(p, H.M_MARKETS, 30000)) && (await shown(p, MK_ANY, 30000)) && d3.n() === 0 && new URL(p.url()).pathname === '/markets/', '2. Markets again from its tile: mounted, in the same page, no document fetched', js({ at: here(p), docs: d3.list }));
  ok(await life.same(), '2. …still the one page');
  d3.stop();
});

// ======================================================================================================================
await part(3, 'cold links, shown, then the address tidied', 'C1, §2.6, S2-D15, D6', async () => {
// ======================================================================================================================
  for (const [path, sec, sheetName, title, tidy] of [
    ['/markets/#s=TSCO.L', 'today', 'stock', /Tesco/, '/markets/'],
    ['/markets/#s=%5EGSPC', 'today', 'stock', /S&P 500/, '/markets/'],
    ['/markets/#holdings', 'holdings', null, null, '/markets/#holdings'],
    ['/markets/#news', 'news', null, null, '/markets/#news'],
    ['/markets/#income', 'holdings', 'income', null, '/markets/#holdings'],
  ]) {
    const d = await cold(p, path);
    const up = await marketsUp(p, sec);
    ok(up && d.n() === 1, `3. ${path} cold: one document, Markets on ${sec} (§2.6)`, js({ docs: d.list, at: here(p) }));
    if (sheetName) {
      const sh = await sheetOpen(p, sheetName, 30000);
      // (the whole open sheet's words: Markets' stock sheet heads itself "TSCO · London" and puts the name in its body)
      const t = (await textOf(p, `${H.sheet(sheetName)}[open]`)) || '';
      ok(sh && (!title || title.test(t)), `3. …the ${sheetName} sheet open${title ? ` (${title.source})` : ''} (C1: the symbol decoded once)`, t.replace(/\s+/g, ' ').slice(0, 120));
    }
    const tidied = await until(() => { const u = new URL(p.url()); return u.pathname === new URL(tidy, HUB).pathname && !/[#&](s|income)=|#income$/.test(u.hash) && !u.search ? 'y' : null; }, 10000);
    ok(!!tidied && (sheetName || here(p) === tidy), `3. …the address tidied to ${tidy} once shown (D6)`, here(p));
    d.stop();
    await shot(p, `3-${path.replace(/[^a-z0-9]+/gi, '-')}`);
    await closeSheets(p);
  }
});

// ======================================================================================================================
await part(4, 'the stock sheet: alert %, Send through Chat’s engine (percent only), Remove; the portfolio’s Send', 'S2-D6, §2.1, R2', async () => {
// ======================================================================================================================
  await cold(p, '/markets/#holdings');
  await marketsUp(p, 'holdings'); await shown(p, ROW('TSCO.L'), 30000);
  const api = apiLog(p);
  await p.click(ROW('TSCO.L'));
  ok(await sheetOpen(p, 'stock', 20000), '4. Tesco’s row: its stock sheet (ctx.open.stock)');
  // the alert: 5%, from the sheet's Alert Me (a page pushed in the same sheet, its own field MK_ALERT; Enter sets it)
  await p.locator(ALERT_OPEN).scrollIntoViewIfNeeded().catch(() => {});
  await p.click(ALERT_OPEN, { timeout: 10000 }).catch(() => {});
  const field = await shown(p, H.MK_ALERT, 10000);
  ok(field, '4. Alert Me: its page, with the field for a move of your own (stock.js alertView)');
  if (field) { await p.fill(H.MK_ALERT, '5'); await p.press(H.MK_ALERT, 'Enter').catch(() => {}); }
  const al = await until(() => api.list.find((x) => x.m === 'PUT' && /\/api\/markets\/alert$/.test(x.u)), 10000);
  let body = null; try { body = JSON.parse(al?.body || 'null'); } catch (_) {}
  ok(!!al && body?.symbol === 'TSCO.L' && Number(body?.pct) === 5 && body?.on !== false, '4. the alert at 5%: PUT /api/markets/alert { symbol: TSCO.L, pct: 5 } (§2.1)', js(al));
  // (set, Alert Me steps back to the stock sheet, where Send is)
  await shown(p, H.MK_STOCK_SEND, 10000);
  // Send: the engine stand-in hears it
  await p.evaluate(() => { delete window.__shared; });
  await p.click(H.MK_STOCK_SEND);
  const sh = await p.waitForFunction(() => window.__shared || null, null, { timeout: 15000 }).then((h) => h.jsonValue(), () => null);
  const c = card(sh?.packed);
  ok(!!sh && c?.kind === 'markets', '4. Send: Chat’s engine (stood in) handed the words and a markets card (fw.send)', js(sh));
  ok(keys(c) === 'at,from,kind,ref,say,snap,v' && keys(c?.snap) === 'day,name,pct,sym' && keys(c?.ref) === 'sym' && c?.snap?.sym === 'TSCO.L' && typeof c?.snap?.pct === 'number',
    '4. …the card packed as packCard: v kind from at say snap{name sym pct day} ref{sym}, nothing more (S2-D6)', js(c));
  ok(!!sh && !AMOUNTS.test(js(c)) && !/price|value|qty|cost|412|4\.12|3\.5\b/.test(js(c)), '4. …no price, value, holding or pound in the card', js(c));
  ok(typeof sh?.words === 'string' && /\b(up|down) \d+(\.\d+)?% today|flat today/.test(sh.words) && !/£|\dp\b|\bat\b \d/.test(sh.words), '4. …its words the hub path’s percent words, never “at <price>” (S2-D6)', sh?.words);
  ok(await until(async () => (await said(p)).some((t) => /Sent to Pat/.test(t)), 8000), '4. …said as sent (“Sent to Pat”)', js(await said(p)));
  await closeSheets(p);

  // Remove Rolls-Royce from its sheet
  api.reset();
  await p.click(ROW('RR.L'));
  await sheetOpen(p, 'stock', 20000);
  await removeTwice(p);
  const del = await until(() => api.list.find((x) => x.m === 'DELETE' && /\/api\/markets\/holding\?s=RR\.L$/.test(x.u)), 10000);
  ok(!!del, '4. Remove, tapped twice (“Tap again to remove”): DELETE /api/markets/holding?s=RR.L (§2.1)', js(api.list));
  await closeSheets(p);
  ok(await p.waitForSelector(ROW('RR.L'), { state: 'detached', timeout: 10000 }).then(() => true, () => false), '4. …its row gone from Holdings');
  const me = await pageCall(p, 'GET', '/api/markets/me');
  ok(js(me.j).includes('TSCO.L') && !js(me.j).includes('"RR.L"'), '4. …and from the account (GET /api/markets/me)', js(me.j, 200));

  // the portfolio's Send, from Today
  await p.click(H.hdSec('today')); await marketsUp(p);
  await p.evaluate(() => { delete window.__shared; });
  await p.click(H.MK_PORTFOLIO_SEND);
  const ps = await p.waitForFunction(() => window.__shared || null, null, { timeout: 15000 }).then((h) => h.jsonValue(), () => null);
  const pc = card(ps?.packed);
  ok(pc?.snap?.name === 'Portfolio' && pc?.snap?.sym === null && typeof pc?.snap?.pct === 'number' && keys(pc?.snap) === 'day,name,pct,sym', '4. the portfolio’s Send: card { name: Portfolio, sym: null, pct, day } (_todaymkt.js:99, S2-D6)', js(pc));
  ok(/^My portfolio is (up \d+(\.\d+)?% today|down \d+(\.\d+)?% today|flat today)/.test(ps?.words || '') && !AMOUNTS.test(js(ps)), '4. …its words “My portfolio is up 0.8% today”, no pounds anywhere', ps?.words);
  api.stop();
});

// ======================================================================================================================
await part(5, 'polling: nothing of /api/markets/* while Weather is shown or the page hidden', 'S2-D4, BI12', async () => {
// ======================================================================================================================
  const T = await open('imogen-poll', { sw: 'block', clock: true });
  const q = T.p;
  await q.goto(`${HUB}/#apps`); await shown(q, H.appTile(APP), 30000);
  await tapTile(q); await marketsUp(q); await wait(1500);
  const api = apiLog(q);
  await T.ctx.clock.fastForward('00:40');
  ok(await until(() => api.list.some((x) => /\/api\/markets\/(quotes|me)/.test(x.u)), 8000), '5. shown and visible: the prices asked for again within 30 s (live, S2-D4)', js(api.list));
  // Weather shown
  await q.click(H.tab('apps')); await shown(q, H.APPS); await tapTile(q, 'weather'); await weatherUp(q);
  await wait(800); api.reset();
  await T.ctx.clock.fastForward('03:00'); await wait(1500);
  ok(api.n() === 0, '5. Weather shown for 3 minutes: no request to /api/markets/* (S2-D4)', js(api.list));
  // Markets again, then hidden
  await q.click(H.tab('apps')); await shown(q, H.APPS); await tapTile(q); await marketsUp(q); await wait(1500);
  await hide(q); await wait(300); api.reset();
  await T.ctx.clock.fastForward('03:00'); await wait(1500);
  ok(api.n() === 0, '5. Markets shown but the page hidden for 3 minutes: no request to /api/markets/* (S2-D4)', js(api.list));
  await show(q);
  const back = await until(() => api.list.some((x) => /\/api\/markets\/(quotes|me)/.test(x.u)), 8000);
  ok(back && api.list.filter((x) => /\/api\/markets\/(quotes|me)/.test(x.u)).length <= 2, '5. visible again after ≥ 30 s: refreshed once (S2-D4)', js(api.list));
  api.stop();
  await T.ctx.close();
});

// ======================================================================================================================
await part(6, 'the budget: first open of Markets’ Today', '§4.6, S2-D5, BI1', async () => {
// ======================================================================================================================
  const most = FILES.length + 2;
  const B = await open('imogen-budget', { sw: 'block' });
  const m = meter(B.p, APP);
  await B.p.goto(`${HUB}/#apps`); await shown(B.p, H.appTile(APP), 30000);
  await tapTile(B.p);
  const up = await marketsUp(B.p); await wait(2500);
  const r = await m.report();
  const sizes = (kind) => r.rows.filter((x) => x.kind === kind).sort((a, b) => b.gz - a.gz).map((x) => `${x.path.replace(/^\/markets\//, '')} ${x.gz}`);
  console.log('first open:', js({ requests: r.requests, js: r.js, css: r.css, unminified: (r.unminified || []).length }, 600));
  ok(up && r.requests > 0 && r.requests <= most, `6. first open: ${r.requests} same-origin /markets/ script and style requests (≤ ${most}: connector.files + 2)`, js(r.rows.map((x) => x.path), 1500));
  ok(r.js <= 40 * 1024, `6. first open: JS ${Math.round(r.js / 1024)} KB gzip (≤ 40, §4.6)`, js(sizes('js'), 1500));
  ok(r.css <= 12 * 1024, `6. first open: CSS ${Math.round(r.css / 1024)} KB gzip (≤ 12, §4.6)`, js(sizes('css')));
  const lazyIn = r.rows.filter((x) => LAZY.includes(x.path)).map((x) => x.path);
  ok(LAZY.length > 0 && !lazyIn.length, '6. …none of connector.lazy (holdings, news, stock, edit, money) on Today’s first open (S2-D5, C4)', js({ lazyIn, LAZY }));
  await B.ctx.close();
});

// ======================================================================================================================
await part(7, 'storage and privacy: no new key, no today:* change, no amount in URLs, history, sessionStorage or console', 'S2-D6, S2-D10, §2.5', async () => {
// ======================================================================================================================
  await p.goto(`${HUB}/`); await todayUp(p);
  const after = await storage(p), ch = changed(before, after);
  const allowed = (k) => /^local:markets:/.test(k) || /^local:ifl-build:markets$/.test(k) || /^session:ifl-/.test(k) || /^local:(wx:|ifl-build:weather|ifl-here)/.test(k);
  const odd = [...ch.added, ...ch.changed].filter((k) => !allowed(k) && !HOST_KEYS.test(k));
  ok(!odd.length, '7. after Markets in use: only Markets’ own markets:* keys (and the framework’s ifl-*, Today’s own today:session / today:cards:*) added or changed (no new key, S2-D10)', js(ch));
  ok(![...ch.added, ...ch.changed].some((k) => /today:/.test(k) && !HOST_KEYS.test(k)) && !ch.removed.some((k) => /today:/.test(k)), '7. no today:* key added or changed beyond Today’s own, none removed (§5.1)', js(ch));
  const todayMoney = Object.entries(after.local).filter(([k, v]) => /^today:/.test(k) && MONEY.test(v || '')).map(([k]) => k);
  ok(!todayMoney.length, '7. no today:* value holds an amount (Today keeps no Markets figure, §5.1)', js(todayMoney));
  const last = (() => { try { return JSON.parse(after.local['markets:last'] || 'null'); } catch (_) { return null; } })();
  const uid = await p.evaluate(() => fetch('/api/session', { credentials: 'same-origin' }).then((r) => r.json()).then((j) => j?.user?.id || j?.id || null, () => null));
  ok(!!last && last.id && (!uid || last.id === uid), '7. markets:last carries the account’s id (S2-D9)', js({ id: last?.id, uid }));
  const sess = Object.entries(after.session).filter(([, v]) => AMOUNTS.test(v || ''));
  ok(!sess.length, '7. no amount in sessionStorage', js(sess.map(([k]) => k)));
  const leakU = urls.filter((u) => { try { return AMOUNTS.test(decodeURIComponent(u)); } catch (_) { return AMOUNTS.test(u); } });
  ok(!leakU.length, `7. no amount in any request URL of the session (${urls.length} requests)`, js(leakU.slice(0, 4)));
  const hist = (await history(p)).filter((x) => AMOUNTS.test(js(x)));
  ok(!hist.length, '7. no amount in any history entry’s address or state in this document', js(hist.slice(0, 3)));
  const con = consoleAll.filter((t) => AMOUNTS.test(t));
  ok(!con.length, '7. no amount in the console, from anything on the page (the module never console.*s figures)', js(con.slice(0, 3)));
});

// ======================================================================================================================
await part(8, 'a 401 with the session alive: no sign-out; a confirmed sign-out leaves no markets:*', 'D3, RB1, S2-D2, S2-D10', async () => {
// ======================================================================================================================
  // (Markets hands a 401 to fw.session.lost() from its loaders: the half-minute refresh, me at start (core.js refresh,
  // start): so the refusal is met by the refresh, with the page's clock moved on while Markets is shown, as part 5 does)
  const E = await open('imogen-401', { sw: 'block', clock: true });
  const q = E.p;
  let refuse = 0;
  await route(E.ctx, /\/api\/markets\/quotes(\?|$)/, (r) => (refuse > 0 ? (refuse--, r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Sign in"}' })) : r.continue()));
  // (counted as answered, not as asked: the account's answer can renew the session's cookie (Set-Cookie through the hub's
  // /api/session), so the cookie is cleared below only once the check of 8 has come back, never under it)
  const sessAsks = []; q.on('response', (r) => { if (/\/api\/session(\?|$)/.test(r.url())) sessAsks.push(Date.now()); });
  await q.goto(`${HUB}/markets/`); await marketsUp(q); await wait(1500);
  const s0 = sessAsks.length;
  refuse = 2;
  await E.ctx.clock.fastForward('00:40');
  await until(() => sessAsks.length > s0, 8000);
  await wait(1000);
  ok(sessAsks.length > s0, '8. the half-minute prices refused 401: the framework asks /api/session (fw.session.lost, D3)', js({ before: s0, after: sessAsks.length, refusedLeft: refuse }));
  // (the way in is in the page's markup at all times, in index.html's hidden #signin: counted only when on screen)
  const still = { shown: await shown(q, H.M_MARKETS, 3000), wayIn: await visible(q, EXCEPT.SIGNIN) };
  ok(still.shown && !still.wayIn, '8. …still signed in: Markets shown, no way in offered on screen (D3)', js(still));
  ok(Object.keys((await storage(q)).local).some((k) => k.startsWith('markets:')), '8. …Markets’ kept copy left alone');
  // signed out for real: the cookie gone from this phone, then Markets' next refresh refused by the server itself
  // (in the page, no reload: a sign-out the page finds out about, signedOutNow, not a signed-out boot; past lost()'s
  // 30 s share)
  refuse = 0;
  await E.ctx.clearCookies();
  await E.ctx.clock.fastForward('00:40');
  const goneKeys = await until(async () => { const l = (await storage(q)).local; return !Object.keys(l).some((k) => k.startsWith('markets:')) ? 'gone' : null; }, 20000);
  ok(!!goneKeys, '8b. signed out (confirmed): no markets:* key left on this phone (signedOutNow → forgetApps, RB1)', js(Object.keys((await storage(q)).local)));
  ok(await shown(q, EXCEPT.SIGNIN, 20000), '8b. …and the way in offered');
  await E.ctx.close();
});

// ======================================================================================================================
await part(9, 'a new Markets build mid-session: no reload in use; a lazy section while stale reloads first', 'D21, C7, RB2, RB3', async () => {
// ======================================================================================================================
  const R = await open('imogen-release', { sw: 'block', clock: true });
  let release = null;
  await route(R.ctx, /\/markets\/version(\?|$)/, (r) => (release ? r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify({ app: APP, build: release, min: null }) }) : r.continue()));
  await route(R.ctx, /\/markets\/roof\/markets\.js(\?|$)/, async (r) => {
    if (!release) return r.continue();
    const u = new URL(r.request().url()), res = await hostCall('ifl.test:8788', u.pathname + u.search);
    if (res.status !== 200) return r.continue();
    return r.fulfill({ status: 200, contentType: res.headers['content-type'] || 'text/javascript; charset=utf-8', headers: { 'Cache-Control': 'no-store' }, body: res.text.replace(/(BUILD\s*=\s*)"[^"]*"/, `$1"${release}"`) });
  });
  const q = R.p, docs = loads(q), versions = [];
  q.on('request', (r) => { if (/\/markets\/version/.test(r.url())) versions.push(Date.now()); });
  await q.goto(`${HUB}/#apps`); await shown(q, H.appTile(APP), 30000);
  await tapTile(q); await marketsUp(q);
  const life = await alive(q);
  docs.reset();
  await R.ctx.clock.fastForward('11:00');
  release = '9.98';
  const v0 = versions.length;
  await hide(q); await wait(400); await show(q);
  const asked = await until(() => versions.length > v0, 8000);
  await wait(2500);
  ok(asked && (await life.same()) && docs.n() === 0, '9. a new build at /markets/version, learnt on coming back: no reload while Markets is in use (D21)', js({ asked, docs: docs.list }));
  // (a lazy section while stale and nothing unsaved: the page reloads first, at its address, so no file of the new build
  // joins the old module: frame.js fw.lazy, s2 C7/RB2; while busy it would import as normal)
  const order = [];
  const onR = (r) => { if (r.isNavigationRequest() && r.frame() === q.mainFrame()) order.push('document'); else if (/\/markets\/roof\/holdings\.js/.test(r.url())) order.push('holdings.js'); };
  q.on('request', onR);
  await q.click(H.hdSec('holdings'));
  const reloaded = await until(() => docs.n() >= 1, 15000);
  ok(reloaded && order[0] === 'document', '9. Holdings tapped (its file not loaded yet, nothing unsaved): the page reloads first, no lazy file joins the old module (C7)', js(order));
  ok((await at(q, '/markets/#holdings', 15000)) && (await marketsUp(q, 'holdings')), '9. …at /markets/#holdings, Holdings shown in the new page', here(q));
  q.off('request', onR);
  await wait(2000);
  ok((await said(q)).filter((t) => /Markets updated/.test(t)).length === 1, '9. the new build mounted: “Markets updated” once (IFL.built, S2-D16)', js(await said(q)));
  await R.ctx.close();
});

// ======================================================================================================================
await part(10, 'a price alert’s tap: the stock sheet, in the page', '§2.7, §2.6, D10', async () => {
// ======================================================================================================================
  await p.goto(`${HUB}/`); await todayUp(p);
  const sw = await rootWorker(M.ctx, 30000);
  await p.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 30000 }).catch(() => {});
  const life = await alive(p), docs = loads(p);
  const r = await tapNotification(M.ctx, { app: APP, url: './#s=TSCO.L' });
  const went = (await marketsUp(p)) && (await sheetOpen(p, 'stock', 30000));
  const t = ((await textOf(p, `${H.sheet('stock')}[open]`)) || '').replace(/\s+/g, ' ');
  ok(!!sw && r === 'done' && went && /Tesco/.test(t), '10. a Tesco alert tapped (./#s=TSCO.L) with Today open: Markets, Tesco’s stock sheet (the worker’s { ifl: "route" })', js({ r, at: here(p), t }));
  ok((await life.same()) && docs.n() === 0 && M.pages.length === 1, '10. …in the same page, one window', js({ docs: docs.list, pages: M.pages.length }));
  docs.stop();
  await closeSheets(p);
});

// ======================================================================================================================
await part(11, 'You’s Evening Wrap switch → PATCH /api/notify { markets: { wrap } }', 'S2-D7, §2.4', async () => {
// ======================================================================================================================
  const n0 = await pageCall(p, 'GET', '/api/notify');
  const was = n0.j?.markets?.wrap === true;
  await p.goto(`${HUB}/#you`); await shown(p, H.YOU, 30000);
  const sw = await shown(p, H.YOU_MK_WRAP, 20000);
  ok(sw, '11. You › From Each App, Markets: an Evening Wrap switch beside Markets Alerts (S2-D7)', await textOf(p, `${H.YOU_NOTIFY} [data-app=markets]`));
  const pat = [];
  const onP = (r) => { if (/\/api\/notify(\?|$)/.test(r.url()) && r.method() === 'PATCH') pat.push(r.postData()); };
  p.on('request', onP);
  await p.click(H.YOU_MK_WRAP);
  const sent = await until(() => pat[0], 10000);
  let b = null; try { b = JSON.parse(sent || 'null'); } catch (_) {}
  ok(b?.markets && typeof b.markets.wrap === 'boolean' && b.markets.wrap === !was && Object.keys(b).length === 1, `11. tapped: PATCH /api/notify { markets: { wrap: ${!was} } } and nothing else`, js(b));
  const n1 = await until(async () => { const r = await pageCall(p, 'GET', '/api/notify'); return r.j?.markets?.wrap === !was ? r : null; }, 8000);
  ok(!!n1, '11. …kept with the account (GET /api/notify says it)', js(n1?.j?.markets));
  p.off('request', onP);
});

// ======================================================================================================================
await part(12, 'a holding changed in Markets: Today’s cards asked for again on return', 'RI3, C8, S2-D11', async () => {
// ======================================================================================================================
  // (as §9.2 has it, a holding added in the module: Shell followed from Add a Stock's result, its + (edit.js follow →
  // core.follow → fw.changed); then Rolls-Royce, put back through the API first, taken out from its sheet, which Today's
  // card counts: qty 0 isn't one of its holdings)
  await pageCall(p, 'PUT', '/api/markets/holding', { symbol: 'RR.L', name: 'Rolls-Royce', qty: 40 });
  await p.goto(`${HUB}/`); await todayUp(p);
  await p.waitForFunction((s) => /2 holdings/.test(document.querySelector(s)?.textContent || ''), H.TODAY_MK_CARD, { timeout: 30000 }).catch(() => {});
  const meta0 = (await textOf(p, H.TODAY_MK_CARD)) || '';
  const cards = []; const onC = (r) => { if (/\/api\/today(\?|$)/.test(r.url())) cards.push(r.url()); }; p.on('request', onC);
  const puts = apiLog(p, /\/api\/markets\/holding$/);
  // the add
  await tapEl(p, H.TODAY_MK_OPEN); await marketsUp(p);
  await p.click(H.hdAct('plus')); await sheetOpen(p, 'add-stock');
  await p.fill(H.MK_ADD_INPUT, 'Shell');
  await shown(p, ADD_FOLLOW('SHEL.L'), 15000);
  await p.click(ADD_FOLLOW('SHEL.L')).catch(() => {});
  const added = await until(() => puts.list.find((x) => x.m === 'PUT' && /SHEL\.L/.test(x.body || '')), 10000);
  ok(!!added, '12. Add a Stock, Shell’s +: followed (PUT /api/markets/holding { symbol: SHEL.L })', js(puts.list));
  await wait(800); await closeSheets(p);
  let c0 = cards.length;
  await p.click(H.HD_BACK); await todayUp(p);
  ok(await until(() => cards.length > c0, 10000), '12. back on Today after a holding added in Markets: Today’s cards asked for again (GET /api/today, fw.changed → opts.changed, RI3)', js({ before: c0, now: cards.length }));
  // the removal
  await tapEl(p, H.TODAY_MK_OPEN); await marketsUp(p);
  await p.click(H.hdSec('holdings')); await shown(p, ROW('RR.L'), 30000);
  await p.click(ROW('RR.L')); await sheetOpen(p, 'stock');
  await removeTwice(p);
  await p.waitForSelector(ROW('RR.L'), { state: 'detached', timeout: 10000 }).catch(() => {});
  await closeSheets(p);
  c0 = cards.length;
  await p.click(H.HD_BACK); await todayUp(p);
  const asked = await until(() => cards.length > c0, 10000);
  ok(asked, '12. …and after a holding removed in Markets: asked for again', js({ before: c0, now: cards.length }));
  // (the card's words run together in textContent, "Markets1 holdingOpen": no \b around them)
  const meta1 = await p.waitForFunction((s) => /(^|\D)1 holding(?!s)/.test(document.querySelector(s)?.textContent || ''), H.TODAY_MK_CARD, { timeout: 15000 }).then(() => true, () => false);
  ok(/2 holdings/.test(meta0) && meta1, '12. …its Markets card says 1 holding now (was 2)', (await textOf(p, H.TODAY_MK_CARD))?.slice(0, 120));
  puts.stop();
  p.off('request', onC);
});

// ======================================================================================================================
await part(13, 'Search from Markets: a Weather place still found; Markets’ entries without amounts; Find “…” in Markets', 'RI1, C6, §2.5, BI3, D16', async () => {
// ======================================================================================================================
  // (Weather opened on this phone first, so its places are here: then Markets, whose provider is registered while mounted)
  await p.goto(`${HUB}/#apps`); await shown(p, H.appTile('weather'), 30000);
  await tapTile(p, 'weather'); await weatherUp(p); await wait(1500);
  await p.click(H.tab('apps')); await shown(p, H.APPS); await tapTile(p); await marketsUp(p);
  const api = apiLog(p, /\/api\/markets\/search/);
  await p.click(H.HD_SEARCH); await shown(p, `${H.SEARCH_SHEET}[open]`);
  await p.fill(H.SEARCH_INPUT, 'Lond');
  const place = await p.waitForFunction((s) => [...document.querySelectorAll(s)].some((e) => /London/.test(e.textContent)), H.SEARCH_RESULT, { timeout: 10000 }).then(() => true, () => false);
  ok(place, '13. Markets open, Search “Lond”: Weather’s London still found (one connector provider per module, RI1, C6)', js(await p.$$eval(H.SEARCH_RESULT, (es) => es.map((e) => e.textContent.trim().slice(0, 60))).catch(() => [])));
  await p.fill(H.SEARCH_INPUT, 'Tes');
  // (the results drawn for "Tes", not still "Lond"'s: Today's own entries can name Tesco too ("London closes · Tesco
  // +0.3%"), so the list is read once Markets' Find row says "Tes")
  await p.waitForFunction((s) => [...document.querySelectorAll(s)].some((e) => /Find [“"]Tes[”"]/.test(e.textContent)), H.SEARCH_RESULT, { timeout: 10000 }).catch(() => {});
  const got = await p.waitForFunction((s) => [...document.querySelectorAll(s)].some((e) => /TSCO/.test(e.textContent)), H.SEARCH_RESULT, { timeout: 10000 }).then(() => true, () => false);
  const rows = await p.$$eval(H.SEARCH_RESULT, (es) => es.map((e) => e.textContent.replace(/\s+/g, ' ').trim())).catch(() => []);
  const tesco = rows.find((t) => /Tesco/.test(t) && /TSCO/.test(t)) || rows.find((t) => /Tesco/.test(t)) || '';
  ok(got && /TSCO · Shares/.test(tesco), '13. “Tes”: Tesco from your holdings, “TSCO · Shares” (plain symbol and kind, §2.5)', js(rows));
  ok(!rows.some((t) => AMOUNTS.test(t) || /\d+\.\d{2}/.test(t.replace(/\d+(\.\d+)?%/g, ''))), '13. …no entry carries a value or a price (S2-D6)', js(rows));
  const find = rows.findIndex((t) => /Find “Tes” in Markets|Find "Tes" in Markets/.test(t));
  ok(find >= 0 && api.n() === 0, '13. …“Find “Tes” in Markets” offered, and nothing asked of Markets’ search yet (on device only, D16)', js({ rows, asked: api.list }));
  const findHref = find >= 0 ? await p.evaluate(([s, i]) => document.querySelectorAll(s)[i]?.closest('a')?.getAttribute('href') ?? document.querySelectorAll(s)[i]?.getAttribute('href') ?? null, [H.SEARCH_RESULT, find]) : null;
  ok(!findHref || !/Tes/.test(findHref), '13. …the Find entry runs, no address with the words in it (BI3)', String(findHref));
  if (find >= 0) await p.evaluate(([s, i]) => document.querySelectorAll(s)[i]?.click(), [H.SEARCH_RESULT, find]);
  const sheetUp = await sheetOpen(p, 'add-stock', 15000);
  const v = await p.evaluate((s) => document.querySelector(s)?.value ?? null, H.MK_ADD_INPUT).catch(() => null);
  ok(sheetUp && v === 'Tes', '13. tapped: the Add a Stock sheet, “Tes” in its field (§2.5)', js({ sheetUp, v }));
  ok(await until(() => api.list.some((x) => /\/api\/markets\/search\?q=Tes/.test(x.u)), 10000), '13. …only now Markets’ search asked (the words leave the phone on that tap, Question 13)', js(api.list));
  await closeSheets(p);
  // the header's Add a Stock: the field focused in the tap (RI9)
  await p.click(H.hdAct('plus'));
  const focused = await p.waitForFunction((s) => document.activeElement?.matches?.(s), H.MK_ADD_INPUT, { timeout: 3000 }).then(() => true, () => false);
  ok((await sheetOpen(p, 'add-stock')) && focused, '13. Add a Stock from the header: its field focused, so the keyboard comes up (RI9)');
  await p.fill(H.MK_ADD_INPUT, 'Shell');
  ok(await shown(p, `${H.MK_ADD_RESULT}[data-sym="SHEL.L"]`, 15000), '13. …“Shell”: Shell plc among the results (edit.js, lazy)');
  await closeSheets(p);
  api.stop();
});

// ======================================================================================================================
await part(14, 'axe, 320/390 light and dark, the 1280 layout', '§2.1, S2-D8, S2-D18, BI15', async () => {
// ======================================================================================================================
  await p.goto(`${HUB}/markets/`); await marketsUp(p);
  for (const id of ['today', 'holdings', 'news']) {
    await p.click(H.hdSec(id)); await shown(p, SEC(id)); await wait(800);
    const v = await axe(p, id);
    ok(!v.length, `14. axe, 390 light, ${id}: no serious or critical issue`, js(v));
    ok((await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, `14. 390 light, ${id}: no sideways scroll`);
    await shot(p, `14-390-light-${id}`);
  }
  await p.click(H.hdSec('holdings')); await shown(p, SEC('holdings'));
  await p.locator(H.MK_ABOUT).scrollIntoViewIfNeeded().catch(() => {});
  await p.click(H.MK_ABOUT).catch(() => {});
  ok(await sheetOpen(p, 'mk-about'), '14. Holdings’ foot “About these prices”: the About sheet (S2-D7)');
  await closeSheets(p);
  for (const [scheme, width] of [['dark', 390], ['light', 320], ['dark', 320]]) {
    const X = await open(`imogen-${scheme}-${width}`, { scheme, width, height: width === 320 ? 640 : 844 });
    await X.p.goto(`${HUB}/`); await todayUp(X.p);
    await shown(X.p, H.TODAY_MK_OPEN, 30000); await tapEl(X.p, H.TODAY_MK_OPEN);
    await marketsUp(X.p); await wait(900);
    for (const id of ['today', 'holdings', 'news']) {
      await X.p.click(H.hdSec(id)); await shown(X.p, SEC(id)); await wait(800);
      if (scheme === 'dark' && width === 390) { const v = await axe(X.p, id); ok(!v.length, `14. axe, 390 dark, ${id}: no serious or critical issue`, js(v)); }
      ok((await X.p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, `14. ${width} ${scheme}, ${id}: no sideways scroll`);
      await shot(X.p, `14-${width}-${scheme}-${id}`);
    }
    if (width === 320) {
      await X.p.click(H.hdSec('today')); await wait(500);
      const fit = await X.p.evaluate(([t, b]) => { const h = document.querySelector(t), r = document.createRange(); r.selectNodeContents(h); const x = r.getBoundingClientRect(), bk = document.querySelector(b)?.getBoundingClientRect(); return { title: h.textContent.trim(), right: Math.round(x.right), left: Math.round(x.left), backRight: Math.round(bk?.right ?? 0), w: innerWidth }; }, [H.HD_TITLE, H.HD_BACK]);
      ok((await attrOf(X.p, H.HD_BACK, 'aria-label')) === 'Back to Today' && fit.title === 'Today' && fit.left >= fit.backRight && fit.right <= fit.w, `14. 320 ${scheme}: “Back to Today” over a section titled Today, the title whole (the crumb gives way first, BI15)`, js(fit));
    }
    await X.ctx.close();
  }
  const W = await open('imogen-wide', { width: 1280, height: 900 });
  await W.p.goto(`${HUB}/markets/`); await marketsUp(W.p); await wait(1200);
  const cols = await W.p.evaluate(([s, hero]) => { const kids = [...document.querySelector(s)?.querySelectorAll(':scope > *, :scope > * > *') || []].filter((e) => !e.matches(hero) && e.getClientRects().length && e.getBoundingClientRect().height > 60); return new Set(kids.map((e) => Math.round(e.getBoundingClientRect().left))).size; }, [SEC('today'), H.MK_HERO]);
  ok(cols >= 2 && (await W.p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, '14. 1280 wide: Today in two columns, no sideways scroll (S2-D8)', String(cols));
  await shot(W.p, '14-1280-today');
  await W.p.click(H.hdSec('holdings')); await shown(W.p, SEC('holdings')); await wait(1000);
  // (the row whose words say "desk view", and its link (“Open Markets”) to Markets' own address)
  const desk = await W.p.evaluate((s) => { const row = [...document.querySelectorAll(`${s} *`)].reverse().find((e) => /desk view/i.test(e.textContent) && e.querySelector('a[href]')); const a = row?.querySelector('a[href]'); return row ? { t: row.textContent.replace(/\s+/g, ' ').trim().slice(0, 100), h: a?.href || null, shown: row.getClientRects().length > 0 } : null; }, SEC('holdings'));
  ok(!!desk && desk.shown && /^https?:\/\/finance\./.test(desk.h || ''), '14. 1280, Holdings: the desk row, “The desk view is in Markets on its own”, its link to Markets’ own address (S2-D8)', js(desk));
  await shot(W.p, '14-1280-holdings');
  await W.ctx.close();

  const all = everyone.flatMap((x) => x.errs || []).filter((e) => !/imogen-401/.test(e));
  ok(!all.some((e) => /CSP violation|Refused to/.test(e)), '14. no CSP violation on any page (no inline style or handler, §4.1)', js(all.filter((e) => /CSP|Refused/.test(e)).slice(0, 6)));
  ok(!all.length, '14. no page error and no console error on any page (part 8’s refused asks aside)', js(all.slice(0, 8)));
  const own = urls.filter((u) => /^https?:\/\/finance\.ifl\.test/.test(u) && !/^https?:\/\/finance\.ifl\.test:8788\/(?:$|#)/.test(u));
  ok(!own.length, '14. nothing of all this went to Markets’ own address from the page (the hub serves it, §5.3)', js(own.slice(0, 4)));
});

await closeAll();
console.log(`FAILS ${fails()}`);
process.exit(0);
