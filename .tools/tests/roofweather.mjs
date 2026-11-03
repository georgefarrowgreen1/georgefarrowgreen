// needs: hub
// Weather under the roof at InFlite's hub (One roof, spec §10.2): inflite.ai (ifl.test:8788 here) one page that never
// reloads between Today, Apps, You and Weather, Weather drawn by its module (weather/roof/*, served through the hub) with
// the framework's header, switcher, sheets and toast. In real Chromium against the hub stack (hubstack.mjs), signed in by
// the account's cookie; Open-Meteo, the radar and the map stood in for in the browser, the forecast for Today's card and
// the official warnings at the site's own stand-in (rooflib wxServer: two warnings over London, one over Bristol, France's
// feed down). Every check's line names the spec section it proves; every selector is roofhooks.mjs's (§3.14), save
// rooflib's declared exceptions (EXCEPT: the way in, the zoom's clone, a tile's link, Chat's engine frame).
//   1 open Weather from Today's card (zoom: the card's clone at once, then the module's hero) and from Apps' tile (push):
//     one page, the header (crumb, place ▾, line, compactTitle, Weather Settings, the warnings badge), the switcher
//   2 sections by replaceState and their URLs; Back to Apps and to Today with the scroll kept; Apps tab from in Weather
//   3 cold deep links: #day=, #radar, #warnings, #settings=units, ?lat&lon&name (known: switched; new: asked), the
//     address tidied after show; Today's warning chip → that place's Warnings
//   4 the Places sheet: one-tap rows, switch, Find a Place, delete, Use My Location
//   5 Send from Now → Chat's engine (stood in) through IFL.hub.send, its toast
//   6 Weather Settings: every page, a save synced (PUT /api/weather/me, glass kept), Notifications → You's sheet
//   7 the module's files from Weather's host through the hub: minified where their copy is current, no cookie; the
//     "Weather updated" note once
//   8 the budget (§7.3) for a first open and a cold deep link
//   9 storage: only Weather's own keys added, no today:* change; search typing leaves nothing anywhere
//   10 a 401 at /api/weather/me with the session alive: no sign-out; signed out: the way in, back to the route
//   11 a new Weather build mid-session (D21): no reload in use, no lazy file joins the old module (an idle page reloads
//     first, C7), the reload at a boundary with URL and scroll kept, "Weather updated" once
//   12 warnings on Now (banner, single card), the empty states ([] and null), the credits sheet
//   13 CSP clean, axe, 390 light and dark, the 1280 layout
//   14 loading on open (stage 2 §4.5): a first open fetches none of 16 Days, Warnings, Places, Weather Settings and the
//     detail/credits file; each is fetched once, when first opened
//   14b a release that changes a wxui.js export, deployed while the page is open, then 16 Days: a reload to the new
//     build at /weather/#days, not an error (stage 2 C7, RB3)
import { readFileSync } from 'node:fs';
import * as OW from './mocks/wxwarnings.mjs';
import * as H from './roofhooks.mjs';
import {
  HUB, ROOT, EXCEPT, checker, phone, account, wxServer, engine, weatherAccount, alive, loads, history, said, here, shown, gone, textOf, attrOf, count, visible,
  storage, changed, axe, meter, connectorFiles, moduleBuild, minKnows, passed, WEATHER_PORT, ownGuard, hide, show, route, hostCall, RADAR_STACK, PLACES, dayKey, wait, until, js, closeAll,
} from './rooflib.mjs';

const [,, S, out] = process.argv;
const { ok, part, fails } = checker();
process.on('uncaughtException', (e) => { console.log(`FAIL  crashed: ${String(e?.message || e).split('\n')[0]}`); console.log(`FAILS ${fails() + 1}`); process.exit(0); });
const shot = (p, name) => p.screenshot({ path: `${out}/${name}.png` }).catch(() => {});
const { London, Bristol, York, Cromer, Leeds, Paris } = PLACES;
const link = (x) => `/weather/?${new URLSearchParams({ lat: x.lat, lon: x.lon, name: x.name })}`;
const SETTINGS = { temp: 'c', wind: 'mph', precip: 'mm', pressure: 'hpa', clock: '24', glass: 'clear' };
const FILES = connectorFiles(), BUILD = moduleBuild();
const CLONE = EXCEPT.ZOOM_CLONE;

wxServer();
const acct = await account('Wren Adeyemi', 'wrenroof');
ok(!!acct.cookies, 'an account made at the tests’ sign-in page, its cookie on the tests’ site (Today’s session at the hub)', js(acct.json));
const cookies = acct.cookies || {};
const everyone = [];
const open = async (name, o = {}) => { const ph = await phone(name, { cookies, ...o }); everyone.push(ph); return ph; };

// ---- helpers over the hooks ----
const title = (p) => textOf(p, H.HD_TITLE);
const titleIs = (p, want, ms = 20000) => p.waitForFunction(([s, w]) => document.querySelector(s)?.textContent.trim() === w, [H.HD_TITLE, want], { timeout: ms }).then(() => true, () => false);
const at = (p, path, ms = 10000) => p.waitForFunction((u) => location.pathname + location.search + location.hash === u, path, { timeout: ms }).then(() => true, () => false);
// (Weather on Now: its screen and the hero; screenUp: Weather's screen and, when said, that section, for a boot on another
// section, where Now and its hero are hidden)
const weatherUp = async (p, ms = 30000) => (await shown(p, H.M_WEATHER, ms)) && (await shown(p, `${H.M_WEATHER} ${H.WX_HERO}`, ms));
const screenUp = async (p, sec = null, ms = 30000) => (await shown(p, H.M_WEATHER, ms)) && (!sec || (await shown(p, `${H.M_WEATHER} ${H.wxSec(sec)}`, ms)));
// (a cold load of path: from a page that isn't the framework's, so it's a document load, never a same-document hash
// change; → the documents fetched from then on (n() === 1 for a cold one))
const cold = async (p, path) => { await p.goto(`${HUB}/robots.txt`); const d = loads(p); await p.goto(`${HUB}${path}`); return d; };
const todayUp = async (p, ms = 30000) => (await shown(p, H.TODAY, ms)) && (await shown(p, H.HD_TITLE, ms));
// (Apps' Weather tile: its link (§4.2: tiles keep their hrefs), tapped as a script's click, so the scroll stays)
const tapTile = (p, app = 'weather') => p.evaluate((s) => { const a = document.querySelector(s); if (!a) return false; a.click(); return true; }, EXCEPT.tileLink(app));
const tapEl = (p, sel) => p.evaluate((s) => { const a = document.querySelector(s); if (!a) return false; a.click(); return true; }, sel);
const stored = (p, k) => p.evaluate((k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (_) { return null; } }, k);
const placesHave = async (p, name) => ((await stored(p, 'wx:places')) || []).some((x) => x?.name === name);
const sheetOpen = (p, sel, ms = 10000) => shown(p, `${sel}[open]`, ms);
const closeSheets = async (p) => { for (let i = 0; i < 3 && (await count(p, H.SHEET_OPEN)); i++) { await p.click(H.SHEET_CLOSE).catch(() => p.keyboard.press('Escape')); await wait(450); } };
const sections = (p) => p.$$eval(H.HD_SEC, (els) => els.map((e) => ({ id: e.dataset.sec, label: e.childNodes[0]?.textContent.trim() || e.textContent.trim(), on: e.getAttribute('aria-selected') }))).catch(() => []);
const visibleSecs = (p) => p.$$eval(H.WX_SEC, (els) => els.filter((e) => !e.hidden && e.getClientRects().length).map((e) => e.dataset.sec)).catch(() => []);

// A: Wren's phone, a browser tab at 390×844, Chat's engine stood in for; Weather's places in the account: London, Bristol
const A = await open('wren');
await engine(A.ctx);
const guard = ownGuard(A.ctx);
const { p } = A;
const meterA = meter(p);
await p.goto(`${HUB}/robots.txt`);
const seeded = await weatherAccount(p, { places: [London, Bristol], settings: SETTINGS });
ok(seeded.s === 200, 'Wren’s Weather places in the account (London, Bristol), glass "clear" among its settings', js(seeded));

// ======================================================================================================================
await part(1, 'open Weather from Today’s card and from Apps’ tile: one page, the header, the switcher', '§2.3, §3.5, §3.7, D2, D4, D6, D18', async () => {
// ======================================================================================================================
  await p.goto(`${HUB}/`);
  const up = (await todayUp(p)) && (await shown(p, H.TODAY_WX_OPEN, 40000));
  ok(up, '1. Today, signed in by the cookie, its weather card drawn (§4)', await textOf(p, 'body').then((t) => t?.slice(0, 200)));
  const life = await alive(p), docs = loads(p);
  const h0 = (await history(p)).length;
  // (the card's head tapped: in the next frames Weather's screen shows, its hero slot already the card's clone, §2.3 step 3)
  const z = await p.evaluate(async ({ open, scr, clone }) => {
    const a = document.querySelector(open); if (!a) return { tapped: false };
    a.click();
    const seen = [];
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      const m = document.querySelector(scr);
      seen.push({ shown: !!m && !m.hidden && m.getClientRects().length > 0, clone: !!document.querySelector(clone) });
      if (seen.at(-1).shown && seen.at(-1).clone) break;
    }
    return { tapped: true, frames: seen.length, last: seen.at(-1) };
  }, { open: H.TODAY_WX_OPEN, scr: H.M_WEATHER, clone: CLONE });
  ok(z.tapped && z.last?.shown && z.last?.clone && z.frames <= 4, '1. the card tapped: Weather’s screen within a few frames, the card’s clone in its hero slot at once (zoom, §2.3 step 3, §3.7)', js(z));
  const hero = await weatherUp(p);
  const cloneGone = await p.waitForFunction((c) => !document.querySelector(c), CLONE, { timeout: 15000 }).then(() => true, () => false);
  ok(hero && cloneGone, '1. then the module’s own hero (.wx-hero), the clone taken away (fw.zoomTarget, §2.3 step 4)');
  ok(await at(p, '/weather/'), '1. the address tidied to /weather/ once shown (no ?lat…&name=, D6)', here(p));
  const hs = (await history(p)).slice(h0);
  ok(hs[0]?.kind === 'push' && /\/weather\/\?/.test(hs[0]?.url || '') && hs.some((x) => x.kind === 'replace' && new URL(x.url).pathname === '/weather/' && !new URL(x.url).search), '1. pushed with the card’s address, then replaced by /weather/ (§2.3 steps 3 and 5)', js(hs.map((x) => `${x.kind} ${x.url}`)));
  ok((await life.same()) && docs.n() === 0, '1. one page: the same document, no document fetched (D2, D6)', js(docs.list));
  await shot(p, '1-now-from-card');

  // the header (§3.5): crumb, place ▾, line, compactTitle, Weather Settings, Back's label; the switcher; the badge
  ok(/Weather/.test((await textOf(p, H.HD_CRUMB)) || ''), '1. header crumb: Weather (§3.5)', await textOf(p, H.HD_CRUMB));
  ok(await titleIs(p, 'London'), '1. header title: the place, London (§7.1 weather.js)', await title(p));
  ok((await count(p, H.HD_PICK)) === 1, '1. the title’s ▾ (Places, D19)');
  ok(/-?\d+°/.test((await textOf(p, H.HD_LINE)) || ''), '1. the line under the title: “14° · …” (§7.1)', await textOf(p, H.HD_LINE));
  ok((await count(p, H.HD_SETTINGS)) === 1 && (await count(p, `${H.hdAct('edit')}`)) === 0, '1. one act beside Search: Weather Settings (UI3)');
  ok((await count(p, H.HD_SEARCH)) === 1, '1. Search in the header on Weather too (§3.10)');
  const meShown = await p.isVisible(H.HD_ME).catch(() => false), backShown = await p.isVisible(H.HD_BACK).catch(() => false);
  ok((await attrOf(p, H.HD_BACK, 'aria-label')) === 'Back to Today' && backShown && !meShown, '1. Back, labelled where it goes: “Back to Today”, shown in place of the photo (UI3)', js({ label: await attrOf(p, H.HD_BACK, 'aria-label'), backShown, meShown }));
  const secs = await sections(p);
  ok(js(secs.map((s) => s.id)) === js(['now', 'days', 'radar', 'warnings']) && /Now/.test(secs[0]?.label) && /16 Days/.test(secs[1]?.label) && /Radar/.test(secs[2]?.label) && /Warnings/.test(secs[3]?.label) && secs[0]?.on === 'true' && secs.slice(1).every((s) => s.on === 'false'),
    '1. the switcher: Now · 16 Days · Radar · Warnings, Now selected (§3.5 row 2)', js(secs));
  const badge = await p.waitForFunction(([s]) => document.querySelector(s)?.textContent.trim() === '2', [`${H.hdSec('warnings')} ${H.SEC_BADGE}`], { timeout: 20000 }).then(() => true, () => false);
  const named = await p.getByRole('tab', { name: /Warnings, 2 in force/ }).count().catch(() => 0);
  ok(badge && named === 1, '1. Warnings’ badge: 2 in force over London, its tab named “Warnings, 2 in force” (UB2)', `${await textOf(p, `${H.hdSec('warnings')} ${H.SEC_BADGE}`)} ${named}`);
  ok((await count(p, H.htmlApp('weather'))) === 1 && (await attrOf(p, H.tab('apps'), 'aria-current')) === 'true', '1. html[data-app=weather]; the tab bar’s Apps current (aria-current="true", §3.6)');
  // (compact: scrolled, the title says the place and its temperature, UI4)
  await p.evaluate(() => scrollTo(0, 400));
  const compact = await p.waitForFunction((s) => /^London · -?\d+°$/.test(document.querySelector(s)?.textContent.trim() || ''), H.HD_TITLE, { timeout: 5000 }).then(() => true, () => false);
  ok(compact, '1. scrolled, the header compact: “London · 14°” (compactTitle, UI4)', await title(p));
  await p.evaluate(() => scrollTo(0, 0)); await wait(400);
  ok(await titleIs(p, 'London', 4000), '1. back at the top: the title London again');

  // from Apps' tile: push, no clone (§3.7)
  await p.click(H.HD_BACK);
  ok((await todayUp(p)) && (await at(p, '/')), '1. Back: Today (§3.4)', here(p));
  await p.click(H.tab('apps'));
  ok((await shown(p, H.APPS)) && (await at(p, '/#apps')), '1. the tab bar’s Apps: Apps, in the page (§3.6)', here(p));
  await shown(p, H.appTile('weather'), 20000);
  const pushed = await p.evaluate(async ([tile, scr, clone]) => {
    const a = document.querySelector(tile);
    if (!a) return { tapped: false };
    a.click();
    let cl = false;
    for (let i = 0; i < 8; i++) { await new Promise((r) => requestAnimationFrame(r)); if (document.querySelector(clone)) cl = true; const m = document.querySelector(scr); if (m && !m.hidden && m.getClientRects().length) break; }
    return { tapped: true, clone: cl };
  }, [EXCEPT.tileLink('weather'), H.M_WEATHER, CLONE]);
  ok(pushed.tapped && !pushed.clone && (await weatherUp(p)), '1. Apps’ Weather tile: Weather pushed (no card clone: push, not zoom, §3.7)', js(pushed));
  ok((await attrOf(p, H.HD_BACK, 'aria-label')) === 'Back to Apps', '1. Back says “Back to Apps” now (UI3)', await attrOf(p, H.HD_BACK, 'aria-label'));
  ok((await life.same()) && docs.n() === 0, '1. still the one page throughout (Today → Weather → Today → Apps → Weather)', js(docs.list));
  docs.stop();
});

// ======================================================================================================================
await part(2, 'sections by replaceState; Back to Apps and Today with the scroll kept; Apps tab from inside Weather', '§3.4, §3.6, D6, D20', async () => {
// ======================================================================================================================
  const life = await alive(p);
  const len0 = await p.evaluate(() => history.length);
  for (const [id, url] of [['days', '/weather/#days'], ['radar', '/weather/#radar'], ['warnings', '/weather/#warnings'], ['now', '/weather/']]) {
    const h0 = (await history(p)).length;
    await p.click(H.hdSec(id));
    const up = (await shown(p, H.wxSec(id))) && (await at(p, url));
    const sel = await attrOf(p, H.hdSec(id), 'aria-selected'), vis = await visibleSecs(p);
    const hs = (await history(p)).slice(h0), len = await p.evaluate(() => history.length);
    ok(up && sel === 'true' && js(vis) === js([id]) && hs.length > 0 && hs.every((x) => x.kind === 'replace') && len === len0,
      `2. ${id}: its section alone, the switcher on it, ${url} by replaceState (no history entry, D6)`, js({ url: here(p), sel, vis, hs: hs.map((x) => x.kind), len, len0 }));
    if (id === 'radar') ok((await count(p, H.HTML_FILL)) === 1 && (await shown(p, `${H.wxSec('radar')} ${H.RADAR_MAP}`)), '2. Radar fills the window (html.ifl-fill, D20), its map made (§7.1 radarview)');
    if (id === 'now') ok((await count(p, H.HTML_FILL)) === 0, '2. back on Now: the fill cleared (D20)');
    await shot(p, `2-${id}`);
  }
  await p.click(H.HD_BACK);
  ok((await shown(p, H.APPS)) && (await at(p, '/#apps')) && (await p.evaluate(() => history.length)) === len0, '2. Back from Weather opened from Apps: Apps, history’s own back (§3.4)', here(p));

  // Today's scroll kept round a trip into Weather (§3.4, D20)
  await p.click(H.tab('today'));
  await todayUp(p);
  const y0 = await p.evaluate(() => { scrollTo(0, Math.min(300, document.documentElement.scrollHeight - innerHeight)); return Math.round(scrollY); });
  await wait(300);
  await tapEl(p, H.TODAY_WX_OPEN);
  await weatherUp(p);
  ok(await p.evaluate(() => scrollY === 0), '2. a new screen starts at the top (§3.4)', String(await p.evaluate(() => scrollY)));
  await p.click(H.HD_BACK);
  await todayUp(p);
  const y1 = await until(async () => { const y = await p.evaluate(() => Math.round(scrollY)); return Math.abs(y - y0) <= 4 ? y : null; }, 4000);
  ok(y1 != null, `2. Back to Today: its scroll as it was (${y0}px, §3.4)`, String(await p.evaluate(() => scrollY)));
  if (y0 < 50) console.log(`note: Today is short here (scrolled ${y0}px only)`);

  // Apps tab from inside Weather (UB4): opened from Today → Apps pushed; opened from Apps → history's back
  await p.evaluate(() => scrollTo(0, 0));
  await tapEl(p, H.TODAY_WX_OPEN);
  await weatherUp(p);
  let h0 = (await history(p)).length;
  await p.click(H.tab('apps'));
  const pushedApps = (await shown(p, H.APPS)) && (await at(p, '/#apps'));
  const hs = (await history(p)).slice(h0);
  ok(pushedApps && hs.some((x) => x.kind === 'push' && /\/#apps$/.test(x.url)), '2. in Weather opened from Today, the Apps tab: Apps pushed (UB4)', js(hs.map((x) => `${x.kind} ${x.url}`)));
  await p.goBack();
  ok((await shown(p, H.wxSec('now'))) && (await at(p, '/weather/')), '2. browser back: Weather again, as it was (kept alive, D2)', here(p));
  await p.click(H.HD_BACK); await todayUp(p);
  await p.click(H.tab('apps')); await shown(p, H.APPS);
  await shown(p, H.appTile('weather'), 15000);
  await tapTile(p);
  await weatherUp(p);
  const len1 = await p.evaluate(() => history.length);
  h0 = (await history(p)).length;
  await p.click(H.tab('apps'));
  const backApps = (await shown(p, H.APPS)) && (await at(p, '/#apps'));
  const hs2 = (await history(p)).slice(h0);
  ok(backApps && !hs2.some((x) => x.kind === 'push') && (await p.evaluate(() => history.length)) === len1, '2. in Weather opened from Apps, the Apps tab: history’s back to that Apps, no new entry (UB4)', js(hs2));
  await p.goForward();
  ok(await shown(p, H.wxSec('now')), '2. …so forward is Weather again', here(p));
  await p.click(H.HD_BACK); await shown(p, H.APPS);
  ok(await life.same(), '2. one page throughout');
});

// ======================================================================================================================
await part(3, 'cold deep links, the address tidied after show; Today’s warning chip → that place’s Warnings', '§3.3, D6, RB5d, UB5b, UI5, UI14', async () => {
// ======================================================================================================================
  // (each a cold load: from a page that isn't the framework's, so one document is fetched and the frame starts afresh)
  const day = dayKey(2);
  let d = await cold(p, `/weather/#day=${day}`);
  const dd = (await screenUp(p, 'days')) && (await sheetOpen(p, H.DAY_SHEET));
  ok(dd && (await attrOf(p, H.hdSec('days'), 'aria-selected')) === 'true' && d.n() === 1, `3. /weather/#day=${day}, cold (one document): 16 Days, that day’s sheet open (D6)`, js({ at: here(p), docs: d.list }));
  ok(await at(p, '/weather/#days'), '3. …the address tidied to /weather/#days (no #day=, RB5d)', here(p));
  await shot(p, '3-day');
  await closeSheets(p); d.stop();

  d = await cold(p, '/weather/#radar');
  ok((await screenUp(p, 'radar')) && (await count(p, H.HTML_FILL)) === 1 && (await shown(p, H.RADAR_MAP)) && (await at(p, '/weather/#radar')) && d.n() === 1, '3. /weather/#radar, cold: Radar, the window filled, its map', js({ at: here(p), docs: d.list }));
  ok((await attrOf(p, H.HD_BACK, 'aria-label')) === 'Back to Apps', '3. a cold deep link’s Back: “Back to Apps” (§3.4)', await attrOf(p, H.HD_BACK, 'aria-label'));
  let h0 = (await history(p)).length;
  await p.click(H.HD_BACK);
  const hs = (await history(p)).slice(h0);
  ok((await shown(p, H.APPS)) && (await at(p, '/#apps')) && hs.some((x) => x.kind === 'replace' && /\/#apps$/.test(x.url)) && !hs.some((x) => x.kind === 'push') && d.n() === 1, '3. …and it goes to Apps in place (replace, §3.4), no document fetched', js({ hs, docs: d.list }));
  d.stop();

  d = await cold(p, '/weather/#warnings');
  ok((await screenUp(p, 'warnings')) && (await until(async () => (await count(p, H.WARNING_ROW)) === 2, 20000)) && d.n() === 1, '3. /weather/#warnings, cold: Warnings, London’s two in force', js({ rows: await count(p, H.WARNING_ROW), docs: d.list }));
  d.stop();

  d = await cold(p, '/weather/#settings=units');
  ok((await sheetOpen(p, H.WXSETTINGS, 30000)) && (await shown(p, H.wxPage('units'))) && (await shown(p, H.wxSec('now'))) && d.n() === 1, '3. /weather/#settings=units, cold: Now, Weather Settings open at Units (D6)', js({ docs: d.list }));
  ok(await at(p, '/weather/'), '3. …the address tidied to /weather/ (no #settings, RB5d)', here(p));
  await closeSheets(p); d.stop();

  await cold(p, link(Bristol));
  const sw = await titleIs(p, 'Bristol');
  await wait(1500);
  ok(sw && !(await count(p, `${H.CONFIRM_SHEET}[open]`)) && (await at(p, '/weather/')), '3. ?lat&lon&name of a place you have (Bristol): switched to it, nothing asked, the query gone (UI5, D6)', `${await title(p)} ${here(p)}`);

  await cold(p, link(Cromer));
  ok(await sheetOpen(p, H.CONFIRM_SHEET, 30000), '3. a new place (Cromer): “Add “Cromer” to your places?” asked (§7.1 confirmPlace)');
  await p.click(H.CONFIRM_LOOK);
  ok((await titleIs(p, 'Cromer')) && !(await placesHave(p, 'Cromer')) && (await at(p, '/weather/')), '3. Just Look: Cromer shown, not added; the query gone (RB5d)', `${await title(p)} ${here(p)}`);
  await cold(p, link(Cromer));
  await sheetOpen(p, H.CONFIRM_SHEET, 30000);
  await p.click(H.CONFIRM_ADD);
  ok((await titleIs(p, 'Cromer')) && (await until(() => placesHave(p, 'Cromer'), 8000)), '3. asked again, Add: Cromer added to your places (wx:places)');

  await p.goto(`${HUB}/`);
  await todayUp(p);
  const chip = await shown(p, H.TODAY_WX_WARN, 30000), href = await attrOf(p, H.TODAY_WX_WARN, 'href');
  ok(chip && /^\/weather\/\?[^#]*lat=[^#]*#warnings$/.test(href || ''), '3. Today’s weather card: its warning chip links that place’s Warnings (…#warnings, §4.4)', href);
  const life = await alive(p);
  await tapEl(p, H.TODAY_WX_WARN);
  ok((await shown(p, H.wxSec('warnings'), 20000)) && (await titleIs(p, 'London')) && (await at(p, '/weather/#warnings')) && (await life.same()), '3. tapped: London’s Warnings, in the page, the address /weather/#warnings (UB2, UI14)', `${await title(p)} ${here(p)}`);
});

// ======================================================================================================================
await part(4, 'the Places sheet: one-tap rows, switch, Find a Place, delete, Use My Location', '§7.1 places.js, D19, UI8, UI10', async () => {
// ======================================================================================================================
  await p.click(H.hdSec('now')); await shown(p, H.wxSec('now'));
  await p.click(H.HD_PICK);
  ok(await sheetOpen(p, H.PLACES_SHEET), '4. the title’s ▾: the Places sheet');
  const rows = await p.$$eval(H.PLACE_ROW, (els) => els.map((e) => ({ i: e.dataset.place, t: e.textContent.replace(/\s+/g, ' ').trim(), cur: e.getAttribute('aria-current') }))).catch(() => []);
  const cur = rows.filter((r) => r.cur === 'true');
  ok(rows.length >= 3 && cur.length === 1 && /London/.test(cur[0].t), '4. your places as rows at the top, the current one (London) ticked (UI8)', js(rows));
  ok(rows.length && rows.every((r) => /-?\d+°/.test(r.t)), '4. each with its temperature (core.peek, UI8)', js(rows.map((r) => r.t)));
  const bi = rows.find((r) => /Bristol/.test(r.t))?.i;
  if (bi != null) await p.click(H.placeRow(bi));
  ok((await titleIs(p, 'Bristol')) && (await gone(p, `${H.PLACES_SHEET}[open]`)), '4. one tap on Bristol: switched, the sheet put away', await title(p));

  await p.click(H.HD_PICK); await sheetOpen(p, H.PLACES_SHEET);
  // (Find a Place: its field takes the keyboard in the tap that opens it, UI10; the stand-in geocoder answers York)
  await p.click(H.PLACES_FIND).catch(() => {});
  await p.fill(H.PLACES_FIND, 'York');
  const found = await shown(p, H.PLACES_FOUND, 10000);
  ok(found && /York/.test((await textOf(p, H.PLACES_FOUND)) || ''), '4. Find a Place: “York” found (data.js searchPlaces, through the stand-in geocoder)', await textOf(p, H.PLACES_FOUND));
  if (found) await p.click(H.PLACES_FOUND);
  ok((await titleIs(p, 'York')) && (await until(() => placesHave(p, 'York'), 8000)), '4. chosen: on York, and York among your places', await title(p));
  await closeSheets(p);

  await p.click(H.HD_PICK); await sheetOpen(p, H.PLACES_SHEET);
  await p.click(H.PLACES_EDIT);
  const n0 = await count(p, H.PLACE_ROW);
  const ci = await p.$$eval(H.PLACE_ROW, (els) => els.find((e) => /Cromer/.test(e.textContent))?.dataset.place).catch(() => null);
  if (ci != null) await p.click(`${H.placeRow(ci)} ${H.PLACE_DELETE}`);
  ok(ci != null && (await until(async () => (await count(p, H.PLACE_ROW)) === n0 - 1, 6000)) && (await until(async () => !(await placesHave(p, 'Cromer')), 6000)), '4. Edit, Cromer’s Delete: gone from the rows and from wx:places', js({ ci, n0, now: await count(p, H.PLACE_ROW) }));
  await closeSheets(p);

  await A.ctx.grantPermissions(['geolocation'], { origin: HUB });
  await A.ctx.setGeolocation({ latitude: Leeds.lat, longitude: Leeds.lon });
  await p.click(H.HD_PICK); await sheetOpen(p, H.PLACES_SHEET);
  await p.click(H.PLACES_LOCATE);
  const leeds = (await titleIs(p, 'Leeds')) && (await until(async () => ((await stored(p, 'wx:places')) || []).some((x) => x?.gps && Math.abs(x.lat - Leeds.lat) < 0.05), 10000));
  ok(leeds, '4. Use My Location (a granted location in Leeds): on Leeds, kept as your location (gps)', `${await title(p)} ${js(await stored(p, 'wx:places'))}`);
  await closeSheets(p);
  await shot(p, '4-places');
});

// ======================================================================================================================
await part(5, 'Send from Now → Chat’s engine through IFL.hub.send, its toast', '§3.11, D17', async () => {
// ======================================================================================================================
  await p.goto(`${HUB}${link(London)}`);
  await weatherUp(p); await titleIs(p, 'London');
  const life = await alive(p);
  const asked = [], watch = (r) => { if (/\/api\//.test(r.url())) asked.push(`${r.method()} ${new URL(r.url()).pathname}`); };
  p.on('request', watch);
  const btn = await shown(p, H.NOW_SEND, 20000);
  ok(btn && /Send .* to a friend/.test((await attrOf(p, H.NOW_SEND, 'aria-label')) || ''), '5. Now’s Send in the hero, “Send … to a friend” (fw.sendButton, §3.11)', await attrOf(p, H.NOW_SEND, 'aria-label'));
  // (the engine made at idle; tapped once it's there)
  await until(() => p.evaluate((s) => !!document.querySelector(s)?.contentWindow?.IFLChat, EXCEPT.CHAT_ENGINE), 20000);
  await p.click(H.NOW_SEND);
  const shared = await until(() => p.evaluate(() => window.__shared || null), 20000);
  p.off('request', watch);
  let card = null; try { card = JSON.parse(Buffer.from(shared?.packed || '', 'base64url').toString('utf8')); } catch (_) {}
  ok(/^London/.test(shared?.words || ''), '5. Chat’s engine handed the words (IFL.hub.send, D17)', js(shared?.words));
  ok(card?.kind === 'weather' && card?.snap?.place === 'London' && Array.isArray(card?.ref?.cell), '5. …and Weather’s card, packed as Chat’s links carry it, its place a cell (weather/send.js)', js(card?.ref));
  ok(!/51\.5072|-0\.1276/.test(JSON.stringify(card) + (shared?.words || '')), '5. the exact place in neither (rule 6)');
  ok(!asked.some((a) => /pigeon|share/.test(a)), '5. nothing of the card sent to a server by Weather', asked.join(', '));
  const toast = await until(async () => (await said(p)).find((t) => /Sent to Pat\. You’re still here/.test(t)), 8000);
  ok(!!toast, '5. the toast: “Sent to Pat. You’re still here” (IFL.hub.sent, §3.9)', js(await said(p)));
  ok((await life.same()) && here(p) === '/weather/', '5. still on Weather, the one page', here(p));
});

// ======================================================================================================================
await part(6, 'Weather Settings: every page; a save synced, glass kept; Notifications → You’s Weather Notifications', '§7.1 wxsettings.js, §7.4, RI6, UB3', async () => {
// ======================================================================================================================
  const puts = [], onReq = (r) => { if (r.method() === 'PUT' && new URL(r.url()).pathname === '/api/weather/me') { try { puts.push(JSON.parse(r.postData() || 'null')); } catch (_) { puts.push(null); } } };
  p.on('request', onReq);
  const t0 = Date.now();
  for (const page of H.WX_PAGES) {
    await p.click(H.HD_SETTINGS);
    const open = await sheetOpen(p, H.WXSETTINGS);
    await p.click(H.wxGo(page)).catch(() => {});
    ok(open && (await shown(p, H.wxPage(page), 8000)), `6. Weather Settings, ${page}: its page`);
    await shot(p, `6-settings-${page}`);
    if (page === 'units') {
      await p.click(`${H.wxSetting('temp')} ${H.segValue('f')}`);
      const sent = await until(() => puts.find((b) => b?.data?.settings?.temp === 'f'), 15000);
      const kept = await stored(p, 'wx:settings');
      ok(!!sent && sent.data.settings.glass === 'clear', '6. Units, °F: synced (PUT /api/weather/me with temp "f"), glass "clear" kept in what’s sent (RI6)', js(sent?.data?.settings));
      ok(kept?.temp === 'f' && kept?.glass === 'clear', '6. …and in wx:settings, every other key kept (RI6)', js(kept));
      const hp = passed(S, t0).filter((x) => x.port === WEATHER_PORT && x.method === 'PUT' && x.path.startsWith('/api/weather/me'));
      ok(hp.length >= 1 && hp.every((x) => x.cookie), '6. the PUT reached Weather’s own server through the hub, with the cookie (hostpass)', js(hp.slice(0, 2)));
      await p.click(`${H.wxSetting('temp')} ${H.segValue('c')}`);
      await until(() => puts.find((b) => b?.data?.settings?.temp === 'c'), 15000);
    }
    await closeSheets(p);
  }
  p.off('request', onReq);
  await p.click(H.HD_SETTINGS); await sheetOpen(p, H.WXSETTINGS);
  await p.click(H.WX_NOTIFY_ROW).catch(() => {});
  ok((await shown(p, H.YOU, 15000)) && (await sheetOpen(p, H.SH_WXNOTIFY, 15000)), '6. Notifications in Weather Settings: You, its Weather Notifications sheet open (UB3, §4.3)', here(p));
  await shot(p, '6-wxnotify');
  await closeSheets(p);
});

// ======================================================================================================================
let B = null;   // (part 7's phone, whose first open part 8 measures)
await part(7, 'the module’s files from Weather’s host through the hub: minified where current, no cookie; “Weather updated” once', '§6.2, §8.1, D1, D15', async () => {
// ======================================================================================================================
  // (the hub forwards /weather/<file> to Weather's own host as /<file>: hostpass at Weather's port has /roof/core.js, /data.js…)
  const want = FILES.map((f) => f.replace(/^\/weather/, ''));
  const statics = passed(S).filter((x) => x.port === WEATHER_PORT && !/^\/api\//.test(x.path) && /\.(?:js|css)(?:\?|$)/.test(x.path));
  const got = new Set(statics.map((x) => x.path.split('?')[0]));
  const missing = want.filter((f) => !got.has(f)), withCookie = statics.filter((x) => x.cookie || x.auth).map((x) => x.path);
  ok(want.length > 0 && !missing.length && !withCookie.length, `7. all ${want.length} of the module’s files (connector.files) fetched from Weather’s host by the hub, as /<file>, each without a cookie or a bearer (§8.1, D1)`, js({ missing, withCookie, fetched: statics.length }));
  // minified: every first-open file once integration has run minify.mjs over the module (min/manifest.json names
  // weather/roof/*), or with ROOF_INTEGRATED=1; before that, only the files whose minified copy is current can be held to it
  const rep = await meterA.report();
  const mods = rep.rows.filter((r) => r.status === 200 && FILES.includes(r.path));
  const integrated = process.env.ROOF_INTEGRATED === '1' || minKnows('weather/roof/');
  if (integrated) {
    const notMin = [...new Set(mods.filter((r) => !r.minified).map((r) => `${r.path}${r.fresh ? '' : ' (its min/ copy out of date)'}`))];
    ok(mods.length > 0 && !notMin.length, `7. every one of the module’s files sent minified (functions/_min.js; min/ made by minify.mjs)`, js({ notMin }));
  } else {
    const wrong = mods.filter((r) => r.fresh && !r.minified).map((r) => r.path), stale = [...new Set(mods.filter((r) => !r.fresh).map((r) => r.path))];
    ok(mods.length > 0 && !wrong.length, `7. each file whose minified copy is current sent minified (${mods.filter((r) => r.minified).length} of ${mods.length})`, js({ wrong }));
    if (stale.length) console.log(`note: not yet proven, minified: ${stale.length} module files have no current min/ copy, as minify.mjs hasn’t run over weather/roof/* (integration does, rule 3; then, or with ROOF_INTEGRATED=1, every file must be minified)`);
  }

  // the note (D15): a phone that last had an older Weather
  B = await open('wren-b');
  await B.ctx.addInitScript(() => { if (location.host === 'ifl.test:8788' && !sessionStorage.getItem('t-seeded')) { sessionStorage.setItem('t-seeded', '1'); localStorage.setItem('ifl-build:weather', '0.01'); } });
  const m = meter(B.p);
  await B.p.goto(`${HUB}/`);
  await todayUp(B.p);
  await B.p.click(H.tab('apps')); await shown(B.p, H.appTile('weather'), 20000);
  await tapTile(B.p);
  const up = await weatherUp(B.p);
  // (part 8's first open: everything from the page's load to Weather drawn, read now, before this phone opens it again)
  B.first = up ? await m.report() : null;
  m.stop();
  await wait(2500);
  const notes = (await said(B.p)).filter((t) => /Weather updated/.test(t));
  ok(notes.length === 1 && (await B.p.evaluate(() => localStorage.getItem('ifl-build:weather'))) === BUILD, `7. first mount after an older Weather: “Weather updated” once, ifl-build:weather now ${BUILD} (IFL.built, D15)`, js(await said(B.p)));
  await B.p.click(H.HD_BACK); await shown(B.p, H.APPS);
  await tapTile(B.p); await weatherUp(B.p); await wait(1500);
  ok((await said(B.p)).filter((t) => /Weather updated/.test(t)).length === 1, '7. opened again in the page: not said again (mounted once, kept)');
  await B.p.reload(); await weatherUp(B.p); await wait(2000);
  ok(!(await said(B.p)).some((t) => /Weather updated/.test(t)), '7. a new page of the same build: not said');
});

// ======================================================================================================================
await part(8, 'the budget: a first open and a cold deep link', '§7.3, RB7, RI5', async () => {
// ======================================================================================================================
  const most = FILES.length + 2;
  // (B's first open, in a fresh browser profile: everything fetched from the page's load to Weather drawn)
  const r1 = B?.first;
  if (!r1) { ok(false, '8. part 7’s first open wasn’t measured (Weather never drawn there)'); return; }
  // (what's beyond connector.files, and anything fetched twice, first in the detail: those are what a count over says)
  const beyond = (r) => ({ beyond: r.rows.filter((x) => !FILES.includes(x.path)).map((x) => x.path + x.query), twice: r.twice });
  const sizes = (r, kind) => r.rows.filter((x) => x.kind === kind).sort((a, b) => b.gz - a.gz).map((x) => `${x.path.replace(/^\/weather\//, '')} ${x.gz}`);
  console.log('first open:', js({ requests: r1.requests, js: r1.js, css: r1.css, unminified: r1.unminified.length, ...beyond(r1) }, 800));
  ok(r1.requests > 0 && r1.requests <= most, `8. first open: ${r1.requests} same-origin /weather/ script and style requests (≤ ${most}: connector.files + 2)`, js({ ...beyond(r1), all: r1.rows.map((r) => r.path.replace(/^\/weather\//, '')) }, 1500));
  // (back to 90 KB: stage 2 loads 16 Days, Warnings, Places, Weather Settings and the detail and credits sheets only when
  // they're opened, so a first open is ≈ 84–85 KB; it was 110 while all of them came with it, stage 2 spec §4.5)
  const JS_MOST = 90;
  ok(r1.js <= JS_MOST * 1024, `8. first open: module JS ${Math.round(r1.js / 1024)} KB gzip (≤ ${JS_MOST})`, js(sizes(r1, 'js'), 1500));
  ok(r1.css <= 14 * 1024, `8. first open: CSS ${Math.round(r1.css / 1024)} KB gzip (≤ 14)`, js(sizes(r1, 'css')));
  ok(!r1.radar.length, '8. first open on Now: nothing of the radar stack (radar.js, radarmix.js, the map, vendor/: lazy, D2; the rain files may load for Now’s next hour, outside the budget, §7.3)', js({ radar: r1.radar, rain: r1.lazy.filter((x) => !RADAR_STACK.test(x)) }));
  if (r1.unminified.length) console.log(`note: measured as minify.mjs would send them (no current copy yet): ${r1.unminified.length} files`);

  // a cold deep link, an empty cache, signed in
  const C = await open('wren-c');
  const m = meter(C.p);
  await C.p.goto(`${HUB}/weather/#radar`, { waitUntil: 'commit' });
  const t = await C.p.waitForFunction((s) => { const e = document.querySelector(s); return e && !e.hidden && e.getClientRects().length ? performance.now() : false; }, H.M_WEATHER, { timeout: 30000, polling: 'raf' }).then((h) => h.jsonValue(), () => null);
  ok(t != null && t <= 1500, `8. cold deep link /weather/#radar: Weather’s screen (skeleton) ${t == null ? 'never' : Math.round(t) + ' ms'} after the navigation began (≤ 1500)`);
  await shown(C.p, H.RADAR_MAP, 30000); await wait(2500);
  const r2 = await m.report();
  console.log('cold deep link:', js({ requests: r2.requests, js: r2.js, css: r2.css, lazy: r2.lazy.length, ...beyond(r2) }, 800));
  ok(r2.requests <= most && r2.js <= JS_MOST * 1024 && r2.css <= 14 * 1024, `8. cold deep link: ${r2.requests} requests (≤ ${most}), ${Math.round(r2.js / 1024)} KB JS (≤ ${JS_MOST}), ${Math.round(r2.css / 1024)} KB CSS gzip (≤ 14), the radar stack and rain files apart (§7.3)`, js({ ...beyond(r2), js: sizes(r2, 'js'), css: sizes(r2, 'css') }, 1500));
  ok(r2.lazy.some((x) => /\/weather\/radar\.js$/.test(x)), '8. …the radar stack loaded for Radar, lazily (fw.lazy, D2)', js(r2.lazy));
  await C.ctx.close();
});

// ======================================================================================================================
await part(9, 'storage: only Weather’s own keys; no today:* change; search typing leaves nothing', '§7.2, D16, §3.10', async () => {
// ======================================================================================================================
  await p.goto(`${HUB}/`);
  await todayUp(p); await wait(1500);
  const s0 = await storage(p);
  await p.click(H.tab('apps')); await shown(p, H.appTile('weather'), 20000);
  await tapTile(p); await weatherUp(p);
  for (const id of ['days', 'warnings', 'now']) { await p.click(H.hdSec(id)); await shown(p, H.wxSec(id)); }
  await wait(2500);
  const s1 = await storage(p), d = changed(s0, s1);
  const WX = /^local:(wx:|skill4:|clim2?:|climf:|radar(fc|hr|fld):|ifl-build:weather$)|^session:(ifl-roof|ifl-roof-bounce|ifl-roof-y|ifl-here:today|ifl-hub-ready|ifl-crumb)$/;
  const odd = [...d.added, ...d.changed].filter((k) => !WX.test(k) && !/^local:today:cards:/.test(k));
  ok(!odd.length, '9. opening and using Weather added or changed only Weather’s own keys (wx:*, skill4:, clim*, radar*:) and the framework’s ifl-* (§7.2, D16)', js({ odd, added: d.added }));
  const today = [...d.added, ...d.changed, ...d.removed].filter((k) => /^(local|session):today:/.test(k) && !/^local:today:cards:/.test(k));
  ok(!today.length, '9. no today:* key added, removed or changed by it (Today’s own refreshed copy of its cards aside)', js(today));

  // search: on device only (D16)
  const words = [], onReq = (r) => words.push(`${r.url()} ${r.postData() || ''}`);
  A.ctx.on('request', onReq);
  const u0 = here(p), st0 = await storage(p);
  await p.click(H.HD_SEARCH);
  const focused = await p.waitForFunction((s) => document.activeElement?.matches(s), H.SEARCH_INPUT, { timeout: 4000 }).then(() => true, () => false);
  ok((await sheetOpen(p, H.SEARCH_SHEET)) && focused, '9. Search: its sheet, the field focused in the tap (iOS keyboard, UI10)');
  await p.keyboard.type('Brist', { delay: 40 });
  const hit = await until(async () => (await p.$$eval(H.SEARCH_RESULT, (els) => els.map((e) => e.textContent))).find((t) => /Bristol/.test(t)), 6000);
  ok(!!hit, '9. “Brist”: Bristol among the results (your places, on this phone: Places provider, §3.10)', js(await p.$$eval(H.SEARCH_RESULT, (els) => els.map((e) => e.textContent.trim())).catch(() => [])));
  await p.fill(H.SEARCH_INPUT, '');
  await p.keyboard.type('Qzxvroof', { delay: 30 });
  const none = await p.waitForFunction((s) => /Nothing for “Qzxvroof”/.test(document.querySelector(s)?.textContent || ''), H.SEARCH_SHEET, { timeout: 6000 }).then(() => true, () => false);
  ok(none, '9. “Qzxvroof”: “Nothing for “Qzxvroof”” (§3.10)');
  await wait(800);
  A.ctx.off('request', onReq);
  const st1 = await storage(p), stHist = await p.evaluate(() => JSON.stringify(history.state));
  const leakReq = words.filter((w) => /Brist|Qzxv/i.test(w)), leakStore = JSON.stringify(st1).match(/Brist(?!ol)|Qzxv/gi) || [];
  ok(!leakReq.length, '9. what was typed in no request’s address or body (D16)', js(leakReq));
  ok(!leakStore.length && js(changed(st0, st1).added.filter((k) => !/^local:today:cards:/.test(k))) === '[]', '9. …nor in storage', js({ leakStore, added: changed(st0, st1).added }));
  ok(here(p) === u0 && !/Brist|Qzxv/.test(stHist || ''), '9. …nor in the address or history.state', `${here(p)} ${stHist}`);
  await closeSheets(p);
});

// ======================================================================================================================
await part(10, 'a 401 at /api/weather/me with the session alive: no sign-out; signed out: the way in', 'D3, D12, RI4, RI15', async () => {
// ======================================================================================================================
  await route(A.ctx, /\/api\/weather\/me(\?|$)/, (r) => r.fulfill({ status: 401, contentType: 'application/json', body: '{"signedIn":false}' }));
  await cold(p, '/weather/');
  await weatherUp(p);
  const line = await p.waitForFunction((s) => /Couldn’t sync with your account/.test(document.querySelector(s)?.textContent || ''), H.M_WEATHER, { timeout: 15000 }).then(() => true, () => false);
  await wait(1500);
  const still = { weather: await shown(p, H.M_WEATHER, 2000), tabs: await shown(p, H.tab('apps'), 2000), wayIn: await visible(p, EXCEPT.SIGNIN) };
  ok(line && still.weather && still.tabs && !still.wayIn, '10. Weather’s account answering 401, the session still signed in: no sign-out, no way in shown (fw.session.lost() asked /api/session), “Couldn’t sync with your account” (D3, RI4)', js({ line, ...still }));
  await A.ctx.unroute(/\/api\/weather\/me(\?|$)/);

  const D = await phone('anon', {});
  everyone.push(D);
  const g = ownGuard(D.ctx);
  await D.p.goto(`${HUB}/weather/#radar`);
  const way = await shown(D.p, EXCEPT.SIGNIN, 30000);
  const href = await attrOf(D.p, EXCEPT.SIGNIN, 'href');
  ok(way && href === `/chats/#signin-start&then=${encodeURIComponent('/weather/#radar')}`, '10. signed out at /weather/#radar: InFlite’s way in, its Sign In back to /weather/#radar (D12, RI15)', href);
  ok(!(await shown(D.p, H.M_WEATHER, 1000)) && !g.hits.length, '10. …no Weather drawn signed out, nothing sent to Weather’s own address (D12, D23)', js(g.hits));
  await D.ctx.close();
});

// ======================================================================================================================
await part(11, 'a new Weather build mid-session: no reload in use, no lazy file joins the old module, reload at a boundary', 'D21, stage 2 C7, RB2, UI13, D15', async () => {
// ======================================================================================================================
  // (no service worker here, so the page's own fetches are all there is to stand in for: with the root worker, its kept
  // copy of the module and its own version checks would be a second source of the old build)
  const E = await open('wren-e', { sw: 'block', clock: true });
  let release = null;
  await route(E.ctx, /\/weather\/version(\?|$)/, (r) => (release ? r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify({ app: 'weather', build: release, min: null }) }) : r.continue()));
  // (the new build's weather.js: the hub's own, fetched from Node at the hub's real port with its Host (Node doesn't
  // follow the browser's resolver rules), its BUILD swapped)
  await route(E.ctx, /\/weather\/roof\/weather\.js(\?|$)/, async (r) => {
    if (!release) return r.continue();
    const u = new URL(r.request().url());
    const res = await hostCall('ifl.test:8788', u.pathname + u.search);
    if (res.status !== 200) return r.continue();
    return r.fulfill({ status: 200, contentType: res.headers['content-type'] || 'text/javascript; charset=utf-8', headers: { 'Cache-Control': 'no-store' }, body: res.text.replace(/(BUILD\s*=\s*)"[^"]*"/, `$1"${release}"`) });
  });
  const q = E.p, docs = loads(q);
  const versions = []; q.on('request', (r) => { if (/\/weather\/version/.test(r.url())) versions.push(Date.now()); });
  await q.goto(`${HUB}/`);
  await todayUp(q);
  await q.click(H.tab('apps')); await shown(q, H.appTile('weather'), 20000);
  await tapTile(q); await weatherUp(q);
  // (16 Days once before the release: its file, lazy since stage 2, is in the page, so switching to it later loads nothing)
  await q.click(H.hdSec('days')); await shown(q, H.wxSec('days')); await until(async () => (await count(q, H.DAY_ROW)) >= 10, 20000);
  await q.click(H.hdSec('now')); await shown(q, H.wxSec('now'));
  const life = await alive(q);
  docs.reset();
  // a release: learnt as the page comes back (a short while away, more than 10 minutes since it last asked)
  await E.ctx.clock.fastForward('11:00');
  release = '9.98';
  const v0 = versions.length;
  await hide(q); await wait(400); await show(q);
  const asked = await until(() => versions.length > v0, 8000);
  await wait(2500);
  ok(asked && (await life.same()) && docs.n() === 0, '11. a new build at /weather/version, learnt on coming back after a short while: no reload while Weather’s in use (D21)', js({ asked, docs: docs.list }));
  await q.click(H.hdSec('days')); await shown(q, H.wxSec('days'));
  await q.click(H.hdSec('now')); await shown(q, H.wxSec('now'));
  ok((await life.same()) && docs.n() === 0, '11. sections switched meanwhile: still the same page');
  // Radar's first tap while stale and nothing unsaved: its lazy file would join the old module, so the page reloads at
  // /weather/#radar instead (stage 2 C7 keeps this for an idle page: frame.js fw.lazy; while busy it imports as normal)
  const order = [];
  const onR = (r) => { if (r.isNavigationRequest() && r.frame() === q.mainFrame()) order.push('document'); else if (/\/weather\/radar\.js/.test(r.url())) order.push('radar.js'); };
  q.on('request', onR);
  await q.click(H.hdSec('radar'));
  const reloaded = await until(() => docs.n() >= 1, 15000);
  ok(reloaded && order[0] === 'document', '11. Radar tapped (its code not loaded yet, nothing unsaved): the page reloads first, no lazy file fetched into the old module (fw.lazy, D21, C7)', js(order));
  ok((await at(q, '/weather/#radar', 15000)) && (await shown(q, H.wxSec('radar'), 30000)), '11. …at /weather/#radar, Radar shown in the new page', here(q));
  q.off('request', onR);
  await screenUp(q, 'radar').catch(() => {}); await wait(2000);
  ok((await said(q)).filter((t) => /Weather updated/.test(t)).length === 1, '11. the new build mounted: “Weather updated” once (IFL.built, D15)', js(await said(q)));

  // another release, learnt; then away a minute or more: the reload at that boundary, the address and scroll kept
  const life2 = await alive(q);
  docs.reset();
  await E.ctx.clock.fastForward('11:00');
  release = '9.99';
  const v1 = versions.length;
  await hide(q); await wait(400); await show(q);
  await until(() => versions.length > v1, 8000); await wait(1500);
  ok((await life2.same()) && docs.n() === 0, '11. learnt again on a short return: no reload yet');
  await q.click(H.hdSec('now')); await shown(q, H.wxSec('now'));
  const y0 = await q.evaluate(() => { scrollTo(0, Math.min(300, document.documentElement.scrollHeight - innerHeight)); return Math.round(scrollY); });
  await wait(300);
  await hide(q);
  await E.ctx.clock.fastForward('01:05');
  await show(q);
  const went = await until(() => docs.n() >= 1, 15000);
  await screenUp(q, 'now').catch(() => {});
  ok(went && (await at(q, '/weather/', 15000)), '11. back after more than 60 s away, no sheet open: reloaded, at /weather/ still (D21 boundary a)', js({ docs: docs.list, at: here(q) }));
  const y1 = await until(async () => { const y = await q.evaluate(() => Math.round(scrollY)); return Math.abs(y - y0) <= 6 ? String(y) : null; }, 6000);
  ok(y1 != null, `11. …the scroll kept (${y0}px, ifl-here:today, D21)`, String(await q.evaluate(() => scrollY)));
  await wait(1500);
  ok((await said(q)).filter((t) => /Weather updated/.test(t)).length === 1, '11. …and “Weather updated” once', js(await said(q)));
  await E.ctx.close();
});

// ======================================================================================================================
await part(12, 'warnings on Now (banner, single card), the empty states, the credits sheet', '§7.1 now.js, warnings.js, wxui.js, UB2, UB6', async () => {
// ======================================================================================================================
  await p.goto(`${HUB}${link(London)}`);
  await weatherUp(p); await titleIs(p, 'London');
  const slot = `${H.wxSec('now')} ${H.WX_ALERTS}`;
  const banner = await p.waitForFunction((s) => /2 warnings/.test(document.querySelector(s)?.textContent || ''), slot, { timeout: 20000 }).then(() => true, () => false);
  ok(banner, '12. London, two in force: the slot under the hero a banner, “2 warnings · …” (UB2)', await textOf(p, slot));
  const heroBottom = await p.evaluate(([h, a]) => { const x = document.querySelector(h)?.getBoundingClientRect(), y = document.querySelector(a)?.getBoundingClientRect(); return x && y ? Math.round(y.top - x.bottom) : null; }, [`${H.wxSec('now')} ${H.WX_HERO}`, slot]);
  ok(heroBottom != null && heroBottom >= 0 && heroBottom < 40, '12. …straight under the hero (UB2)', String(heroBottom));
  await shot(p, '12-banner');
  await p.click(slot);
  ok((await shown(p, H.wxSec('warnings'))) && (await at(p, '/weather/#warnings')), '12. the banner tapped: Warnings (fw.nav.section)', here(p));

  await p.goto(`${HUB}${link(Bristol)}`);
  await weatherUp(p); await titleIs(p, 'Bristol');
  // (the one over Bristol, as mocks/wxwarnings.mjs has it: its headline on the card)
  const brs = OW.ukFeed(Date.now()).warnings.map((x) => x.alert.info[0]).find((i) => i.area[0].polygon?.[0] === OW.BRISTOL);
  const one = await p.waitForFunction(([s, head]) => { const t = document.querySelector(s)?.textContent.replace(/\s+/g, ' ').trim() || ''; return t.includes(head) && /wind/i.test(t) && !/\d+ warnings/.test(t); }, [slot, brs.headline], { timeout: 20000 }).then(() => true, () => false);
  ok(one, `12. Bristol, one in force: its own card in the slot (a wind warning, “${brs.headline}”), no banner of several (UB2)`, await textOf(p, slot));

  await p.goto(`${HUB}${link(York)}`);
  await weatherUp(p); await titleIs(p, 'York');
  await p.click(H.hdSec('warnings'));
  const yorkNone = await shown(p, H.warningsEmpty('none'), 20000);
  ok(yorkNone && /No warnings for York\. You’ll hear about any here, and on Today\./.test((await textOf(p, H.warningsEmpty('none'))) || ''), '12. York, none in force (official []): “No warnings for York. You’ll hear about any here, and on Today.” (UB2)', await textOf(p, H.WARNINGS_EMPTY));

  await p.goto(`${HUB}${link(Paris)}`);
  if (await sheetOpen(p, H.CONFIRM_SHEET, 20000)) await p.click(H.CONFIRM_LOOK);
  await titleIs(p, 'Paris');
  await p.click(H.hdSec('warnings'));
  const parisNull = await shown(p, H.warningsEmpty('unavailable'), 20000);
  ok(parisNull && /Official warnings aren’t available for Paris\. Check your national weather service\./.test((await textOf(p, H.warningsEmpty('unavailable'))) || ''), '12. Paris, no official feed to say (official null): “Official warnings aren’t available for Paris. Check your national weather service.” (UB2)', await textOf(p, H.WARNINGS_EMPTY));

  await p.click(H.hdSec('now')); await shown(p, H.wxSec('now'));
  await p.locator(H.WX_CREDITS).scrollIntoViewIfNeeded().catch(() => {});
  await p.click(H.WX_CREDITS);
  const cred = await sheetOpen(p, H.CREDITS_SHEET);
  const want = [...(/id="credits"[\s\S]*?<\/dialog>/.exec(readFileSync(`${ROOT}/weather/index.html`, 'utf8'))?.[0] || '').matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  const have = await p.$$eval(`${H.CREDITS_SHEET} a[href]`, (as) => as.map((a) => a.getAttribute('href'))).catch(() => []);
  const missing = want.filter((h) => !have.includes(h));
  ok(cred && want.length >= 10 && !missing.length, `12. “Learn more about weather data and map data”: the credits sheet, every provider and licence of Weather’s own (${want.length} links, UB6)`, js(missing));
  ok(/wrong/i.test((await textOf(p, `${H.CREDITS_SHEET}[open]`)) || ''), '12. …with the note that forecasts can be wrong');
  await shot(p, '12-credits');
  await closeSheets(p);
});

// ======================================================================================================================
await part(14, 'loading on open: none of the lazy five on a first open; each fetched once, when first opened', 'stage 2 §4.5, C4, S2-D5, BB6', async () => {
// ======================================================================================================================
  const LAZY5 = { days: /\/weather\/roof\/days\.js(\?|$)/, warnings: /\/weather\/roof\/warnings\.js(\?|$)/, places: /\/weather\/roof\/places\.js(\?|$)/, wxsettings: /\/weather\/roof\/wxsettings\.js(\?|$)/, wxdetail: /\/weather\/roof\/wxdetail\.js(\?|$)/ };
  const L = await open('wren-lazy', { sw: 'block' });
  const q = L.p, got = Object.fromEntries(Object.keys(LAZY5).map((k) => [k, 0]));
  q.on('request', (r) => { for (const [k, re] of Object.entries(LAZY5)) if (re.test(r.url())) got[k]++; });
  await q.goto(`${HUB}/#apps`); await shown(q, H.appTile('weather'), 30000);
  await tapTile(q); await weatherUp(q); await titleIs(q, 'London'); await wait(3000);
  ok(Object.values(got).every((n) => n === 0), '14. Weather’s first open on Now: none of days.js, warnings.js, places.js, wxsettings.js, wxdetail.js fetched (§4.5)', js(got));
  await q.click(H.hdSec('days')); await shown(q, H.wxSec('days'));
  ok(await until(async () => (await count(q, H.DAY_ROW)) >= 10, 20000), '14. 16 Days opened: its rows drawn (a skeleton while its file loads, §2.3)');
  await q.click(H.hdSec('now')); await shown(q, H.wxSec('now'));
  await q.click(H.hdSec('days')); await shown(q, H.wxSec('days')); await wait(800);
  ok(got.days === 1, '14. …days.js fetched once, and not again on a second visit', js(got));
  await q.click(H.hdSec('warnings')); await shown(q, H.wxSec('warnings'));
  await until(async () => (await count(q, H.WARNING_ROW)) + (await count(q, H.WARNINGS_EMPTY)) > 0, 20000);
  ok(got.warnings === 1, '14. Warnings opened: warnings.js fetched once', js(got));
  await q.click(H.hdSec('now')); await shown(q, H.wxSec('now'));
  await q.click(H.HD_PICK);
  ok((await sheetOpen(q, H.PLACES_SHEET, 20000)) && got.places === 1, '14. the Places sheet: places.js fetched once', js(got));
  await closeSheets(q);
  await q.click(H.HD_SETTINGS);
  ok((await sheetOpen(q, H.WXSETTINGS, 20000)) && got.wxsettings === 1, '14. Weather Settings: wxsettings.js fetched once', js(got));
  await closeSheets(q);
  await q.locator(H.WX_CREDITS).scrollIntoViewIfNeeded().catch(() => {});
  await q.click(H.WX_CREDITS);
  ok((await sheetOpen(q, H.CREDITS_SHEET, 20000)) && got.wxdetail === 1, '14. the credits sheet: wxdetail.js fetched once', js(got));
  await closeSheets(q);
  await L.ctx.close();
});

// ======================================================================================================================
await part('14b', 'a changed wxui.js export deployed mid-session, then 16 Days: a reload to the new build, not an error', 'stage 2 C7, RB3, D21', async () => {
// ======================================================================================================================
  // (the release, stood in: /weather/version says it; weather.js its BUILD; wxui.js gains an export that the new days.js
  // imports, so the new days.js can't link against the old wxui.js already in the page's module map: the import rejects,
  // as a real release that changed a wxui.js export would. No service worker, so the routes are the only source)
  const RELEASE = '9.97';
  const E = await open('wren-14b', { sw: 'block' });
  let release = null;
  const swapped = (re, fix) => route(E.ctx, re, async (r) => {
    if (!release) return r.continue();
    const u = new URL(r.request().url()), res = await hostCall('ifl.test:8788', u.pathname + u.search);
    if (res.status !== 200) return r.continue();
    return r.fulfill({ status: 200, contentType: res.headers['content-type'] || 'text/javascript; charset=utf-8', headers: { 'Cache-Control': 'no-store' }, body: fix(res.text) });
  });
  await route(E.ctx, /\/weather\/version(\?|$)/, (r) => (release ? r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify({ app: 'weather', build: release, min: null }) }) : r.continue()));
  await swapped(/\/weather\/roof\/weather\.js(\?|$)/, (t) => t.replace(/(BUILD\s*=\s*)"[^"]*"/, `$1"${RELEASE}"`));
  await swapped(/\/weather\/roof\/wxui\.js(\?|$)/, (t) => `${t}\nexport const RELEASED_${RELEASE.replace('.', '_')} = 1;\n`);
  await swapped(/\/weather\/roof\/days\.js(\?|$)/, (t) => `import { RELEASED_${RELEASE.replace('.', '_')} } from "./wxui.js";\nvoid RELEASED_${RELEASE.replace('.', '_')};\n${t}`);
  const q = E.p, docs = loads(q);
  const errsAt = [];
  q.on('console', (m) => { if (m.type() === 'error') errsAt.push(m.text().slice(0, 160)); });
  await q.goto(`${HUB}/#apps`); await shown(q, H.appTile('weather'), 30000);
  await tapTile(q); await weatherUp(q); await titleIs(q, 'London'); await wait(1500);
  const life = await alive(q);
  docs.reset();
  release = RELEASE;
  await q.click(H.hdSec('days'));
  const went = await until(() => docs.n() >= 1, 20000);
  ok(went, '14b. 16 Days tapped after the release: the page reloads (the import refused or the version asked, C7)', js({ docs: docs.list, same: await life.same() }));
  const up = (await at(q, '/weather/#days', 20000)) && (await shown(q, H.wxSec('days'), 30000)) && (await until(async () => (await count(q, H.DAY_ROW)) >= 10, 20000));
  ok(up, '14b. …at /weather/#days, 16 Days drawn by the new build', here(q));
  ok(!(await visible(q, `${H.M_WEATHER} ${H.ERROR}`)), '14b. …and no error state left on screen (Try Again isn’t the answer to a release, RB3)', await textOf(q, H.ERROR));
  ok(docs.n() <= 2, `14b. …one reload, not a loop (${docs.n()} documents)`, js(docs.list));
  await wait(1500);
  ok((await said(q)).filter((t) => /Weather updated/.test(t)).length === 1, '14b. the new build mounted: “Weather updated” once', js(await said(q)));
  if (errsAt.length) console.log(`note: 14b's console said (the old page's refused import expected): ${js(errsAt.slice(0, 3))}`);
  await E.ctx.close();
});

// ======================================================================================================================
await part(13, 'CSP clean, axe, 390 light and dark, the 1280 layout', '§3.13, §3.15, §8.3, UI8, UI12', async () => {
// ======================================================================================================================
  await p.goto(`${HUB}${link(London)}`);
  await weatherUp(p); await titleIs(p, 'London');
  for (const id of ['now', 'days', 'warnings']) {
    await p.click(H.hdSec(id)); await shown(p, H.wxSec(id)); await wait(600);
    const v = await axe(p, id);
    ok(!v.length, `13. axe, 390 light, ${id}: no serious or critical issue (UI12)`, js(v));
    ok((await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, `13. 390 light, ${id}: no sideways scroll`);
    await shot(p, `13-390-light-${id}`);
  }
  const Dk = await open('wren-dark', { scheme: 'dark' });
  await Dk.p.goto(`${HUB}${link(London)}`);
  await weatherUp(Dk.p);
  for (const id of ['now', 'days', 'radar', 'warnings']) {
    await Dk.p.click(H.hdSec(id)); await shown(Dk.p, H.wxSec(id)); await wait(800);
    if (id !== 'radar') { const v = await axe(Dk.p, id); ok(!v.length, `13. axe, 390 dark, ${id}: no serious or critical issue`, js(v)); }
    ok((await Dk.p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, `13. 390 dark, ${id}: no sideways scroll`);
    await shot(Dk.p, `13-390-dark-${id}`);
  }
  await Dk.ctx.close();
  const W = await open('wren-wide', { width: 1280, height: 900 });
  await W.p.goto(`${HUB}${link(London)}`);
  await weatherUp(W.p); await wait(1200);
  const box = (s) => W.p.evaluate((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? { l: Math.round(r.left), r: Math.round(innerWidth - r.right), w: Math.round(r.width) } : null; }, s);
  const now = await box(H.wxSec('now'));
  ok(now && now.w <= 1140 && Math.abs(now.l - now.r) <= 4 && (await W.p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, '13. 1280 wide: Now at most 1100 px of cards, centred, no sideways scroll (UI8)', js(now));
  const cols = await W.p.evaluate(([s, hero]) => { const kids = [...document.querySelector(s)?.querySelectorAll(':scope > *, :scope > * > *') || []].filter((e) => !e.matches(hero) && e.getClientRects().length && e.getBoundingClientRect().height > 60); return new Set(kids.map((e) => Math.round(e.getBoundingClientRect().left))).size; }, [H.wxSec('now'), H.WX_HERO]);
  ok(cols >= 2, '13. …in two columns (UI8)', String(cols));
  await shot(W.p, '13-1280-now');
  await W.p.click(H.hdSec('radar')); await shown(W.p, H.RADAR_MAP, 20000); await wait(1000);
  const map = await box(H.RADAR_MAP);
  ok(map && map.w > 900 && map.w <= 1180 && Math.abs(map.l - map.r) <= 4, '13. 1280 wide: the radar map full width up to 1180 px, centred (§7.1 radarview)', js(map));
  await shot(W.p, '13-1280-radar');
  await W.ctx.close();

  // (14b's old page, whose import of the new days.js is refused by design, aside)
  const all = everyone.flatMap((x) => x.errs || []).filter((e) => !/^wren-14b .*(does not provide an export|Failed to fetch dynamically imported module|Importing a module script failed|SyntaxError)/.test(e));
  ok(!all.some((e) => /CSP violation|Refused to/.test(e)), '13. no CSP violation on any page (§8.3: no inline style, no inline handler, only the origins allowed)', js(all.filter((e) => /CSP|Refused/.test(e)).slice(0, 6)));
  ok(!all.length, '13. no page error and no console error on any page', js(all.slice(0, 8)));
  ok(!guard.hits.length, '13. nothing of all this went to Weather’s own address (D23)', js(guard.hits.slice(0, 4)));
});

await closeAll();
console.log(`FAILS ${fails()}`);
process.exit(0);
