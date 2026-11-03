// needs: hub roof-fitness
// Fitness under the roof at InFlite's hub (One roof stage 2, spec §9.2): inflite.ai (ifl.test:8788 here) one page that
// never reloads between Today, Apps, You, Weather and Fitness, Fitness drawn by its module (fitness/roof/*, served through
// the hub, switched on by ROOF_FITNESS: hubstack's roof-fitness). In real Chromium against the hub stack, signed in by the
// account's cookie; a plan, older rides and Today's offers put in the account (the API from the page, D1 for the rows the
// server writes). Every check's line names the spec section it proves; every selector is roofhooks.mjs's (B0), save
// rooflib's declared exceptions.
//   1 Today's card and Apps' tile open Fitness in-page (one document; zoom from the card), the header (§2.2, S2-D18)
//   2 sections by replaceState and their addresses; Back with the scroll kept
//   3 cold links: #act=<id> (older rides fetched first), #day= near and far, #offer=, #settings=numbers, #plan (§2.6)
//   4 Today's snapshot written as Fitness loads (POST /api/fitness/today, S2-D11)
//   5 Keep an offer → Today's cards asked for again, its card showing the ride (RI3, C8)
//   6 the budget: first open of Today (§4.6: JS ≤ 85, CSS ≤ 22 KB gzip, requests ≤ files + 2)
//   7 storage: no new key, no today:* change (S2-D10)
//   8 a 401 with the session alive: no sign-out; 8b a confirmed sign-out leaves no fitness:* and no fitness store (RB1)
//   9 a new Fitness build mid-session: no reload in use; a lazy section while stale and idle
//     reloads first, at its address (D21, C7)
//   10 files: through Add Files (a picker in the tap) and dropped onto the screen (S2-D12)
//   11 Fitness Settings: a save keeps the other prefs (S2-D7, saveSettings)
//   12 Weather's 16 Days within 700 ms of a Fitness edit: the edit saved, no reload (RB2, S2-D21)
//   14 axe, 320/390 light and dark, 1280 two columns and a ride as a centred sheet (S2-D8)
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as H from './roofhooks.mjs';
import { gpxFromActivity } from '../../fitness/formats.js';
import { demo, samples } from '../../fitness/sample.js';
import {
  HUB, ROOT, EXCEPT, checker, phone, account, wxServer, weatherAccount, pageCall, alive, loads, history, said, here, shown, textOf, attrOf, count,
  storage, changed, axe, meter, visible, connectorFiles, connectorLazy, hide, show, route, hostCall, PLACES, wait, until, js, closeAll,
} from './rooflib.mjs';

const [,, S, out] = process.argv;
const { ok, part, fails } = checker();
process.on('uncaughtException', (e) => { console.log(`FAIL  crashed: ${String(e?.message || e).split('\n')[0]}`); console.log(`FAILS ${fails() + 1}`); process.exit(0); });
const shot = (p, name) => p.screenshot({ path: `${out}/${name}.png` }).catch(() => {});
const APP = 'fitness';

// ---- what this test needs before it can prove anything: B0's hooks, FXA's and FXB's module, the switch on ----
const HOOKS = ['M_FITNESS', 'FX_SEC', 'fxSec', 'fxDay', 'FX_DAYCARD', 'FX_FILES', 'fxOffer', 'fxAct', 'fxSettingsPage', 'TODAY_FX_CARD', 'TODAY_FX_OPEN', 'hdAct', 'hdSec', 'sheet', 'segValue'];
const noHook = HOOKS.filter((k) => H[k] === undefined);
const src = (f) => { try { return readFileSync(`${ROOT}/${f}`, 'utf8'); } catch (_) { return null; } };
const entry = src('fitness/roof/fitness.js');
const stubs = ['fitness.js', 'core.js', 'todayview.js', 'actsview.js', 'fxsettings.js'].filter((f) => /export const STUB\s*=\s*true/.test(src(`fitness/roof/${f}`) || ''));
const hubSays = await hostCall('ifl.test:8788', '/api/hub').catch(() => null);
const notReady = [
  ...noHook.map((k) => `roofhooks.mjs has no ${k} (B0)`),
  ...(!entry ? ['no fitness/roof/fitness.js (B0, FXA)'] : stubs.map((f) => `fitness/roof/${f} is still B0’s stub (FXA/FXB)`)),
  ...(hubSays?.json?.apps?.fitness === true ? [] : [`/api/hub says ${js(hubSays?.json)}: not apps.fitness true (SV: ROOF_FITNESS, hubstack roof-fitness)`]),
];
if (notReady.length) { for (const r of notReady) console.log(`SKIPPED  ${r}`); console.log('FAILS 1'); process.exit(0); }

const FILES = connectorFiles(APP), LAZY = connectorLazy(APP);

// ---- the database (the rows the server writes itself: older rides, Today's offers), as lib.mjs's kit asks it ----
const sql0 = (q) => execSync(`${S}/wr/node_modules/.bin/wrangler d1 execute bio-db --local --persist-to ${S}/wrstate --command "${q}"`, { cwd: process.env.APP_ROOT || ROOT, stdio: 'pipe' }).toString();
const sql = (q) => { for (let i = 0; ; i++) { try { return sql0(q); } catch (e) { if (i > 5 || !/SQLITE_BUSY/.test(String(e.stdout) + String(e.stderr) + e.message)) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400); } } };
const one = (q) => { const o = sql(q), m = o.match(/"results": (\[[\s\S]*?\])\s*,\s*"success"/); return m ? JSON.parse(m[1]) : []; };

// ---- days as London has them (the phones' zone) ----
const ZONE = 'Europe/London';
const keyOf = (k) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(Date.now() + k * 864e5);
// (London's date and hour now, and an hour of a day k days on there, as ridetime.mjs's hourAt: the offers seeded at a
// fixed hour of their day, never "now + n minutes", which near midnight falls on tomorrow)
const NOW = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  .formatToParts(Date.now()).filter((x) => x.type !== 'literal').map((x) => [x.type, Number(x.value)]));
const OFF_MS = Date.UTC(NOW.year, NOW.month - 1, NOW.day, NOW.hour, NOW.minute) - Math.floor(Date.now() / 60e3) * 60e3;
const hourAt = (k, h) => Date.UTC(NOW.year, NOW.month - 1, NOW.day + k, h) - OFF_MS;
// (within an hour of London's midnight the day turns during the run: Today's offer can't be proved as today's then)
const NEAR_MIDNIGHT = NOW.hour >= 23;

// ---- a ride as a file (a GPX, as fitness.mjs makes one), two days ago, and another for the drop ----
const D = demo(Date.now()), ride = samples(D.history.find((x) => x.workout === 'endurance-90' && !x.indoor));
const t0 = Math.round(Date.now() / 1000 / 3600) * 3600 - 86400 * 2;
const gpxAt = (t, name) => gpxFromActivity({ ...ride, start: t * 1000, name });

wxServer();
const acct = await account('Tamsin Okoro', 'tamsinroof');
ok(!!acct.cookies, 'an account made at the tests’ sign-in page, its cookie on the tests’ site (Today’s session at the hub)', js(acct.json));
const cookies = acct.cookies || {};
const uid = one("SELECT id FROM pg_users WHERE handle = 'tamsinroof'")[0]?.id;
const everyone = [];
const open = async (name, o = {}) => { const ph = await phone(name, { cookies, ...o }); everyone.push(ph); return ph; };

// ---- helpers over the hooks ----
const SEC = (id) => `${H.M_FITNESS} ${H.fxSec(id)}`;
const titleIs = (p, want, ms = 20000) => p.waitForFunction(([s, w]) => document.querySelector(s)?.textContent.trim() === w, [H.HD_TITLE, want], { timeout: ms }).then(() => true, () => false);
const at = (p, path, ms = 10000) => p.waitForFunction((u) => location.pathname + location.search + location.hash === u, path, { timeout: ms }).then(() => true, () => false);
const fitnessUp = async (p, sec = 'today', ms = 30000) => (await shown(p, H.M_FITNESS, ms)) && (await shown(p, SEC(sec), ms)) && (sec !== 'today' || (await shown(p, `${H.M_FITNESS} ${H.FX_DAYCARD}`, ms)));
const todayUp = async (p, ms = 30000) => (await shown(p, H.TODAY, ms)) && (await shown(p, H.HD_TITLE, ms));
const cold = async (p, path) => { await p.goto(`${HUB}/robots.txt`); const d = loads(p); await p.goto(`${HUB}${path}`); return d; };
const tapTile = (p, app = APP) => p.evaluate((s) => { const a = document.querySelector(s); if (!a) return false; a.click(); return true; }, EXCEPT.tileLink(app));
const tapEl = (p, sel) => p.evaluate((s) => { const a = document.querySelector(s); if (!a) return false; a.click(); return true; }, sel);
const sheetOpen = (p, name, ms = 15000) => shown(p, `${H.sheet(name)}[open]`, ms);
const closeSheets = async (p) => { for (let i = 0; i < 4 && (await count(p, H.SHEET_OPEN)); i++) { await p.click(H.SHEET_CLOSE).catch(() => p.keyboard.press('Escape')); await wait(450); } };
const sections = (p) => p.$$eval(H.HD_SEC, (els) => els.map((e) => ({ id: e.dataset.sec, label: e.childNodes[0]?.textContent.trim() || e.textContent.trim(), on: e.getAttribute('aria-selected') }))).catch(() => []);
const apiLog = (p, re = /\/api\/fitness\//) => { const list = []; const on = (r) => { try { const u = new URL(r.url()); if (re.test(u.pathname)) list.push({ m: r.method(), u: u.pathname + u.search, body: r.postData(), t: Date.now() }); } catch (_) {} }; p.on('request', on); return { list, n: () => list.length, reset: () => { list.length = 0; }, stop: () => p.off('request', on) }; };
const record = async (p) => (await pageCall(p, 'GET', '/api/fitness/me')).j || null;
const actsN = () => Number(one(`SELECT COUNT(*) AS n FROM fx_acts WHERE user_id = '${uid}' AND id NOT LIKE 'old%'`)[0]?.n ?? -1);
// (an in-page link put into the shown screen by the test and clicked: a way to another route at once, as a row would be)
const goVia = (p, path) => p.evaluate((x) => { const a = document.createElement('a'); a.href = x; a.textContent = 'go'; (document.querySelector('main:not([hidden])') || document.body).append(a); a.click(); a.remove(); }, path);

// F: Tamsin's phone at 390×844; the plan (Sportive from this Monday), her prefs (onboarded, maps always, metric), 405
// older rides, an offer of Today's for today and a suggestion of Today's for the day after tomorrow
const F = await open('tamsin');
const { p } = F;
const urls = []; F.ctx.on('request', (r) => urls.push(r.url()));
await p.goto(`${HUB}/robots.txt`);
await weatherAccount(p, { places: [PLACES.London], settings: { temp: 'c' } });
const r0 = await record(p);
const seeded = await p.evaluate(async (base) => {
  const d = new Date(); d.setHours(0, 0, 0, 0); const today = d.getTime(); const mon = today - ((d.getDay() + 6) % 7) * 864e5;
  const r = await fetch('/api/fitness/me', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base, data: { plan: { id: 'sportive', start: mon, at: today }, swaps: { [today]: 'endurance-90' }, prefs: { onboarded: true, maps: 'always', units: 'metric' } } }) });
  return r.status;
}, r0?.ver || 0);
ok(seeded === 200 && !!uid, 'Tamsin’s Fitness record: the Sportive plan, Endurance 90 today, prefs onboarded / maps always / metric (PUT /api/fitness/me)', js({ seeded, uid }));
sql(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 405) INSERT INTO fx_acts (user_id, id, start, sport, indoor, name, type, size, sum, added) SELECT '${uid}', 'old' || i, ${Date.now() - 40 * 864e5} - i * 86400000, 'ride', 0, 'Old ride ' || i, 'fit', 1, json_object('secs', 3600, 'dist', 30000, 'tss', 50), ${Date.now()} FROM n`);
const offer = (startAt, state, name = 'Ride how you like') => { const id = randomUUID(), s = startAt, e = s + 2 * 3600e3;
  one(`INSERT INTO fx_offers (user_id, id, start, stop, tz, sport, wid, name, secs, who, role, far, dry, state, made, until, taken) VALUES ('${uid}', '${id}', ${s}, ${e}, '${ZONE}', 'ride', 'free-ride', '${name}', 7200, '', 'today', 0, 1, '${state}', ${Date.now()}, ${e + 12 * 3600e3}, 0)`);
  return id; };
const KEEP = offer(hourAt(0, Math.min(Math.max(NOW.hour, 6), 20)), 'yes'), SUGGEST = offer(hourAt(2, 10), 'new', 'Ride with the sun');
await p.goto(`${HUB}/`);
await todayUp(p);
// (the baseline once Today has kept its own copy, today:cards:<id> and today:session (today/public/app.js keepSession),
// so the host's own writes aren't taken for the module's)
await until(async () => (Object.keys((await storage(p)).local).some((k) => k.startsWith('today:cards:')) ? 'kept' : null), 20000);
const before = await storage(p);
const HOST_KEYS = /^local:today:(session$|cards:)/;
const snaps = apiLog(p, /\/api\/fitness\/today$/);

// ======================================================================================================================
await part(1, 'Today’s card and Apps’ tile open Fitness in the page; the header', '§2.2, §2.4, S2-D17, S2-D18, D2, D6', async () => {
// ======================================================================================================================
  ok(await shown(p, H.TODAY_FX_OPEN, 40000), '1. Today, its Fitness card drawn', await textOf(p, H.TODAY_FX_CARD));
  const life = await alive(p), docs = loads(p), h0 = (await history(p)).length;
  const z = await p.evaluate(async ({ open, scr }) => {
    const a = document.querySelector(open); if (!a) return { tapped: false };
    a.click(); const seen = [];
    for (let i = 0; i < 8; i++) { await new Promise((r) => requestAnimationFrame(r)); const m = document.querySelector(scr); seen.push(!!m && !m.hidden && m.getClientRects().length > 0); if (seen.at(-1)) break; }
    return { tapped: true, frames: seen.length, shown: seen.at(-1) };
  }, { open: H.TODAY_FX_OPEN, scr: H.M_FITNESS });
  ok(z.tapped && z.shown && z.frames <= 4, '1. the card’s head tapped: Fitness’s screen within a few frames (zoom from .tcard, S2-D17)', js(z));
  ok(await fitnessUp(p), '1. …then Fitness’s Today: the day card (FX_DAYCARD, fw.zoomTarget)');
  ok(await p.waitForFunction((c) => !document.querySelector(c), `${H.M_FITNESS} .ifl-zoom-slot`, { timeout: 15000 }).then(() => true, () => false), '1. …the card’s clone taken away once the day card is in (S2-D17)');
  ok(await at(p, '/fitness/'), '1. the address tidied to /fitness/ once shown (D6)', here(p));
  const hs = (await history(p)).slice(h0);
  ok(hs[0]?.kind === 'push' && hs.some((x) => x.kind === 'replace' && new URL(x.url).pathname === '/fitness/' && !new URL(x.url).hash), '1. pushed with the card’s address (/fitness/#today), then replaced by /fitness/', js(hs.map((x) => `${x.kind} ${x.url}`)));
  ok((await life.same()) && docs.n() === 0, '1. one page: the same document, no document fetched (D2)', js(docs.list));
  await shot(p, '1-today-from-card');

  ok(/Fitness/.test((await textOf(p, H.HD_CRUMB)) || ''), '1. header crumb: Fitness (S2-D18)', await textOf(p, H.HD_CRUMB));
  ok(await titleIs(p, 'Today'), '1. header title: Today (S2-D18)', await textOf(p, H.HD_TITLE));
  ok(((await textOf(p, H.HD_LINE)) || '').length > 0, '1. the line: today’s plan (“Endurance · 1 h 30”, “Rest day”, S2-D18)', await textOf(p, H.HD_LINE));
  ok((await count(p, H.HD_PICK)) === 0, '1. no ▾ pick for Fitness (S2-D18)');
  const lab = async (icon) => (await attrOf(p, H.hdAct(icon), 'aria-label')) || (await textOf(p, H.hdAct(icon))) || '';
  ok((await count(p, H.hdAct('upload'))) === 1 && /Add Files/.test(await lab('upload')) && (await count(p, H.hdAct('settings'))) === 1 && /Fitness Settings/.test(await lab('settings')),
    '1. two acts beside Search: Add Files (upload) and Fitness Settings (settings), S2-D18', js({ up: await lab('upload'), set: await lab('settings') }));
  ok((await attrOf(p, H.HD_BACK, 'aria-label')) === 'Back to Today', '1. Back: “Back to Today” (S2-D18)', await attrOf(p, H.HD_BACK, 'aria-label'));
  const secs = await sections(p);
  ok(js(secs.map((s) => s.id)) === js(['today', 'activities', 'progress']) && /Today/.test(secs[0]?.label) && /Activities/.test(secs[1]?.label) && /Progress/.test(secs[2]?.label) && secs[0]?.on === 'true',
    '1. the switcher: Today · Activities · Progress, Today selected (§2.2, C2)', js(secs));
  ok((await count(p, H.htmlApp(APP))) === 1 && (await attrOf(p, H.tab('apps'), 'aria-current')) === 'true', '1. html[data-app=fitness]; the tab bar’s Apps current');
  await p.evaluate(() => scrollTo(0, 600));
  ok(await p.waitForFunction((s) => /^Fitness · ./.test(document.querySelector(s)?.textContent.trim() || ''), H.HD_TITLE, { timeout: 5000 }).then(() => true, () => false), '1. scrolled, the compact title “Fitness · <line>” (S2-D18)', await textOf(p, H.HD_TITLE));
  await p.evaluate(() => scrollTo(0, 0)); await wait(400);

  await p.click(H.HD_BACK); await todayUp(p);
  await p.click(H.tab('apps')); await shown(p, H.appTile(APP), 20000);
  const d2 = loads(p);
  await tapTile(p);
  ok((await fitnessUp(p)) && d2.n() === 0 && (await attrOf(p, H.HD_BACK, 'aria-label')) === 'Back to Apps', '1. from Apps’ tile: in the page, Back says “Back to Apps” (§2.4)', js(d2.list));
  d2.stop(); docs.stop();
});

// ======================================================================================================================
await part(2, 'sections by replaceState; Back with the scroll kept', '§2.2, D6, D20', async () => {
// ======================================================================================================================
  const life = await alive(p), h0 = (await history(p)).length;
  await p.click(H.hdSec('activities'));
  ok((await fitnessUp(p, 'activities')) && (await at(p, '/fitness/#activities')) && (await titleIs(p, 'Activities')), '2. Activities (lazy): /fitness/#activities, titled Activities', here(p));
  ok(await shown(p, `${H.M_FITNESS} ${H.fxAct('old1')}`, 20000), '2. …your rides listed (the newest of the older ones, “Old ride 1”)');
  await p.click(H.hdSec('progress'));
  ok((await fitnessUp(p, 'progress')) && (await at(p, '/fitness/#progress')), '2. Progress: /fitness/#progress', here(p));
  await p.click(H.hdSec('today'));
  ok((await fitnessUp(p)) && (await at(p, '/fitness/')), '2. Today: /fitness/', here(p));
  const hs = (await history(p)).slice(h0);
  ok(hs.length >= 3 && hs.every((x) => x.kind === 'replace') && (await life.same()), '2. each section by replaceState, one page (D6)', js(hs.map((x) => `${x.kind} ${x.url}`)));
  await p.click(H.HD_BACK); await shown(p, H.APPS);
  await p.click(H.tab('today')); await todayUp(p);
  await p.locator(H.TODAY_FX_OPEN).scrollIntoViewIfNeeded().catch(() => {});
  const y1 = await p.evaluate(() => Math.round(scrollY));
  await tapEl(p, H.TODAY_FX_OPEN); await fitnessUp(p);
  await p.click(H.HD_BACK); await todayUp(p);
  ok(await until(async () => Math.abs((await p.evaluate(() => Math.round(scrollY))) - y1) <= 6, 6000), `2. Back to Today: its scroll as when the card was tapped (${y1}px, D20)`, String(await p.evaluate(() => scrollY)));
});

// ======================================================================================================================
await part(3, 'cold links: #act= (older fetched first), #day= near and far, #offer=, #settings=numbers, #plan', '§2.6, S2-D15, D6', async () => {
// ======================================================================================================================
  // (#act= on a phone with no kept copy of Fitness: the part 2 phone has listed Activities already, so its older rides
  // are kept there and "fetched first" couldn't be shown on it)
  const C = await open('tamsin-cold', { sw: 'block' });
  const api = apiLog(C.p, /\/api\/fitness\/me\/older/);
  let d = await cold(C.p, '/fitness/#act=old405');
  const act = (await fitnessUp(C.p, 'activities')) && (await sheetOpen(C.p, 'act', 40000));
  ok(act && d.n() === 1 && api.n() > 0, '3. /fitness/#act=old405 cold, a fresh phone: Activities and that ride’s sheet, the older rides fetched first (GET me/older, §2.6)', js({ older: api.n(), at: here(C.p) }));
  ok(/Old ride 405/.test((await textOf(C.p, `${H.sheet('act')}[open]`)) || ''), '3. …the sheet is “Old ride 405”', (await textOf(C.p, `${H.sheet('act')}[open]`))?.slice(0, 80));
  ok(await until(() => (new URL(C.p.url()).hash === '#activities' ? 'y' : null), 10000), '3. …the address tidied to /fitness/#activities (D6)', here(C.p));
  d.stop(); api.stop();
  await C.ctx.close();

  const near = keyOf(1), far = keyOf(20);
  d = await cold(p, `/fitness/#day=${near}`);
  ok((await fitnessUp(p)) && (await shown(p, `${H.M_FITNESS} ${H.fxDay(near)}`, 20000)) && !(await count(p, H.SHEET_OPEN)), `3. #day=${near} (near): Today, on that day, no sheet (lookAt)`, here(p));
  ok(await until(() => (here(p) === '/fitness/' ? 'y' : null), 10000), '3. …tidied to /fitness/', here(p));
  d.stop();
  d = await cold(p, `/fitness/#day=${far}`);
  ok((await fitnessUp(p)) && (await sheetOpen(p, 'fx-day', 20000)), `3. #day=${far} (far): Today and that day’s sheet (openDay)`, here(p));
  await closeSheets(p); d.stop();

  d = await cold(p, `/fitness/#offer=${SUGGEST}`);
  ok((await fitnessUp(p)) && (await sheetOpen(p, 'offer', 20000)) && /Ride with the sun/.test((await textOf(p, `${H.sheet('offer')}[open]`)) || ''), '3. #offer=<a suggestion of Today’s>: Today and its offer sheet (openOffer, offers.js)', (await textOf(p, H.SHEET_TITLE))?.slice(0, 80));
  await closeSheets(p); d.stop();

  d = await cold(p, '/fitness/#settings=numbers');
  ok((await fitnessUp(p)) && (await sheetOpen(p, 'fxsettings', 20000)) && (await shown(p, H.fxSettingsPage('numbers'), 15000)), '3. #settings=numbers: Fitness Settings on Your Numbers (S2-D7)', here(p));
  await closeSheets(p); d.stop();

  d = await cold(p, '/fitness/#plan');
  ok((await fitnessUp(p)) && (await until(() => (here(p) === '/fitness/' ? 'y' : null), 10000)), '3. #plan (the old Plan tab): Today, tidied to /fitness/ (alias)', here(p));
  d.stop();
});

// ======================================================================================================================
await part(4, 'Today’s snapshot written as Fitness loads', 'S2-D11', async () => {
// ======================================================================================================================
  ok(snaps.list.some((x) => x.m === 'POST'), `4. POST /api/fitness/today as Fitness’s data loaded in the page (todaySnap, ${snaps.n()} so far)`, js(snaps.list.map((x) => x.u)));
  const leak = snaps.list.filter((x) => /"(name|notes|words)":"[^"]{40,}/.test(x.body || ''));
  ok(!leak.length, '4. …carrying the days’ plan only (no long free text)', js(leak.slice(0, 1)));
});

// ======================================================================================================================
await part(5, 'Keep an offer: Today’s cards asked for again on return, the ride on its card', 'RI3, C8, S2-D11', async () => {
// ======================================================================================================================
  await p.goto(`${HUB}/`); await todayUp(p); await shown(p, H.TODAY_FX_OPEN, 30000);
  const cards = []; const onC = (r) => { if (/\/api\/today(\?|$)/.test(r.url())) cards.push(r.url()); }; p.on('request', onC);
  const api = apiLog(p, /\/api\/fitness\/offers\//);
  await tapEl(p, H.TODAY_FX_OPEN); await fitnessUp(p);
  if (NEAR_MIDNIGHT) ok(false, `5. SKIPPED: the run began within an hour of London’s midnight (${NOW.hour}:${String(NOW.minute).padStart(2, '0')}), so today’s offer can’t be proved as today’s; run again after midnight`);
  const keep = `${H.M_FITNESS} ${H.fxOffer(KEEP, 'keep')}`;
  ok(await shown(p, keep, 20000), '5. Today’s offer on Fitness’s Today at first paint, with Keep (offers.js, BI2)');
  await p.click(keep);
  ok(await until(() => api.list.some((x) => x.m === 'POST' && x.u.includes(KEEP)), 10000), '5. Keep: POST /api/fitness/offers/<id>', js(api.list));
  ok(await until(() => one(`SELECT taken FROM fx_offers WHERE id = '${KEEP}'`)[0]?.taken === 1, 10000), '5. …taken in the account');
  await wait(1500);
  const c0 = cards.length;
  await p.click(H.HD_BACK); await todayUp(p);
  ok(await until(() => cards.length > c0, 10000), '5. back on Today: its cards asked for again (fw.changed after A.today(), RI3)', js({ before: c0, now: cards.length }));
  const shows = await p.waitForFunction((s) => /Ride how you like/.test(document.querySelector(s)?.textContent || ''), H.TODAY_FX_CARD, { timeout: 15000 }).then(() => true, () => false);
  ok(shows, '5. …Today’s Fitness card shows the kept ride (“Ride how you like”)', (await textOf(p, H.TODAY_FX_CARD))?.slice(0, 160));
  p.off('request', onC); api.stop();
});

// ======================================================================================================================
await part(6, 'the budget: first open of Fitness’s Today', '§4.6, S2-D5, RI12', async () => {
// ======================================================================================================================
  const most = FILES.length + 2;
  const B = await open('tamsin-budget', { sw: 'block' });
  const m = meter(B.p, APP);
  await B.p.goto(`${HUB}/#apps`); await shown(B.p, H.appTile(APP), 30000);
  await tapTile(B.p);
  const up = await fitnessUp(B.p); await wait(3000);
  const r = await m.report();
  const sizes = (kind) => r.rows.filter((x) => x.kind === kind).sort((a, b) => b.gz - a.gz).map((x) => `${x.path.replace(/^\/fitness\//, '')} ${x.gz}`);
  console.log('first open:', js({ requests: r.requests, js: r.js, css: r.css, unminified: (r.unminified || []).length }, 600));
  ok(up && r.requests > 0 && r.requests <= most, `6. first open: ${r.requests} same-origin /fitness/ script and style requests (≤ ${most}: connector.files + 2)`, js(r.rows.map((x) => x.path), 1500));
  ok(r.js <= 85 * 1024, `6. first open: JS ${Math.round(r.js / 1024)} KB gzip (≤ 85, §4.6)`, js(sizes('js'), 1500));
  ok(r.css <= 22 * 1024, `6. first open: CSS ${Math.round(r.css / 1024)} KB gzip (≤ 22, §4.6)`, js(sizes('css')));
  const lazyIn = r.rows.filter((x) => LAZY.includes(x.path) || /\/fitness\/(map|mapstyle|share|formats|fit|reader|sample)\.js$/.test(x.path)).map((x) => x.path);
  ok(!lazyIn.length, '6. …none of connector.lazy nor the NET files on Today’s first open (C4)', js(lazyIn));
  await B.ctx.close();
});

// ======================================================================================================================
await part(7, 'storage: no new key, no today:* change', 'S2-D10, §5.1', async () => {
// ======================================================================================================================
  await p.goto(`${HUB}/`); await todayUp(p);
  const after = await storage(p), ch = changed(before, after);
  const allowed = (k) => /^local:(fitness:|me:last$|ifl-build:fitness$)/.test(k) || /^session:ifl-/.test(k) || /^local:(wx:|ifl-build:weather|ifl-here)/.test(k);
  const odd = [...ch.added, ...ch.changed].filter((k) => !allowed(k) && !HOST_KEYS.test(k));
  ok(!odd.length, '7. after Fitness in use: only Fitness’s own keys (fitness:*, me:last), the framework’s ifl-* and Today’s own today:session / today:cards:* added or changed (no new key)', js(ch));
  ok(![...ch.added, ...ch.changed].some((k) => /today:/.test(k) && !HOST_KEYS.test(k)) && !ch.removed.some((k) => /today:/.test(k)), '7. no today:* key added or changed beyond Today’s own, none removed (§5.1)', js(ch));
  const dbs = await p.evaluate(async () => (indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : null)).catch(() => null);
  ok(!dbs || dbs.filter((n) => /fit|files|market|roof/i.test(n)).every((n) => n === 'fitness'), '7. IndexedDB: only the databases there were (Fitness’s own “fitness”, C5)', js(dbs));
});

// ======================================================================================================================
await part(8, 'a 401 with the session alive: no sign-out; a confirmed sign-out leaves nothing of Fitness', 'D3, RB1, S2-D2, S2-D10', async () => {
// ======================================================================================================================
  const E = await open('tamsin-401', { sw: 'block', clock: true });
  const q = E.p;
  let refuse = 0;
  await route(E.ctx, /\/api\/fitness\/me(\?|$)/, (r) => (refuse > 0 && r.request().method() === 'GET' ? (refuse--, r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Sign in"}' })) : r.continue()));
  const sessAsks = []; q.on('request', (r) => { if (/\/api\/session(\?|$)/.test(r.url())) sessAsks.push(Date.now()); });
  await q.goto(`${HUB}/fitness/`); await fitnessUp(q); await wait(1500);
  const s0 = sessAsks.length;
  refuse = 2;
  await hide(q); await E.ctx.clock.fastForward('01:30'); await show(q);
  await wait(4000);
  ok(sessAsks.length > s0, '8. back after a minute and a half, Fitness asks again (pull) and is refused 401: the framework asks /api/session (D3)', js({ before: s0, after: sessAsks.length }));
  // (the way in is in the page's markup at all times, in index.html's hidden #signin: counted only when on screen)
  const still = { shown: await shown(q, H.M_FITNESS, 3000), wayIn: await visible(q, EXCEPT.SIGNIN) };
  ok(still.shown && !still.wayIn, '8. …still signed in: Fitness shown, no way in offered on screen (D3)', js(still));
  await E.ctx.clearCookies();
  await hide(q); await E.ctx.clock.fastForward('01:30'); await show(q);
  const gone = await until(async () => { const l = (await storage(q)).local; return !Object.keys(l).some((k) => /^fitness:|^me:last$/.test(k)) ? 'gone' : null; }, 20000);
  ok(!!gone, '8b. signed out (confirmed): no fitness:* key, no me:last left (signedOutNow → forgetApps, RB1)', js(Object.keys((await storage(q)).local)));
  const store = await q.evaluate(() => new Promise((res) => { const r = indexedDB.open('fitness'); r.onsuccess = () => { const db = r.result; if (!db.objectStoreNames.contains('files')) { db.close(); return res(0); } const c = db.transaction('files').objectStore('files').count(); c.onsuccess = () => { db.close(); res(c.result); }; c.onerror = () => res(-1); }; r.onerror = () => res(-1); })).catch(() => -1);
  ok(store === 0, '8b. …and Fitness’s file store empty (S2-D10)', String(store));
  ok(await shown(q, EXCEPT.SIGNIN, 20000), '8b. …the way in offered');
  await E.ctx.close();
});

// ======================================================================================================================
await part(9, 'a new Fitness build mid-session: no reload in use; a lazy section while stale reloads first', 'D21, C7, RB2, RB3', async () => {
// ======================================================================================================================
  const R = await open('tamsin-release', { sw: 'block', clock: true });
  let release = null;
  await route(R.ctx, /\/fitness\/version(\?|$)/, (r) => (release ? r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify({ app: APP, build: release, min: null }) }) : r.continue()));
  await route(R.ctx, /\/fitness\/roof\/fitness\.js(\?|$)/, async (r) => {
    if (!release) return r.continue();
    const u = new URL(r.request().url()), res = await hostCall('ifl.test:8788', u.pathname + u.search);
    if (res.status !== 200) return r.continue();
    return r.fulfill({ status: 200, contentType: res.headers['content-type'] || 'text/javascript; charset=utf-8', headers: { 'Cache-Control': 'no-store' }, body: res.text.replace(/(BUILD\s*=\s*)"[^"]*"/, `$1"${release}"`) });
  });
  const q = R.p, docs = loads(q), versions = [];
  q.on('request', (r) => { if (/\/fitness\/version/.test(r.url())) versions.push(Date.now()); });
  await q.goto(`${HUB}/#apps`); await shown(q, H.appTile(APP), 30000);
  await tapTile(q); await fitnessUp(q); await wait(1500);
  const life = await alive(q);
  docs.reset();
  await R.ctx.clock.fastForward('11:00');
  release = '9.98';
  const v0 = versions.length;
  await hide(q); await wait(400); await show(q);
  const asked = await until(() => versions.length > v0, 8000);
  await wait(2500);
  ok(asked && (await life.same()) && docs.n() === 0, '9. a new build at /fitness/version, learnt on coming back: no reload while Fitness is in use (D21)', js({ asked, docs: docs.list }));
  // (a lazy section while stale and nothing unsaved: the page reloads first, at its address, so no file of the new build
  // joins the old module: frame.js fw.lazy, s2 C7/RB2; while busy it would import as normal)
  const order = [];
  const onR = (r) => { if (r.isNavigationRequest() && r.frame() === q.mainFrame()) order.push('document'); else if (/\/fitness\/roof\/actsview\.js/.test(r.url())) order.push('actsview.js'); };
  q.on('request', onR);
  await q.click(H.hdSec('activities'));
  const reloaded = await until(() => docs.n() >= 1, 15000);
  ok(reloaded && order[0] === 'document', '9. Activities tapped (its file not loaded yet, nothing unsaved): the page reloads first, no lazy file joins the old module (C7)', js(order));
  ok((await at(q, '/fitness/#activities', 15000)) && (await fitnessUp(q, 'activities')), '9. …at /fitness/#activities, Activities shown in the new page', here(q));
  q.off('request', onR);
  await wait(2000);
  ok((await said(q)).filter((t) => /Fitness updated/.test(t)).length === 1, '9. the new build mounted: “Fitness updated” once (IFL.built, S2-D16)', js(await said(q)));
  await R.ctx.close();
});

// ======================================================================================================================
await part(10, 'files: through Add Files, and dropped onto Fitness’s screen', 'S2-D12, RI10, RI11', async () => {
// ======================================================================================================================
  await p.goto(`${HUB}/fitness/`); await fitnessUp(p); await wait(1000);
  const api = apiLog(p, /\/api\/fitness\/acts$/);
  const n0 = actsN();
  const [chooser] = await Promise.all([p.waitForEvent('filechooser', { timeout: 10000 }).catch(() => null), p.click(H.hdAct('upload'))]);
  ok(!!chooser && chooser.isMultiple(), '10. Add Files: the file picker opens in the tap, several files at once (S2-D12)');
  if (chooser) await chooser.setFiles([{ name: 'morning.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(gpxAt(t0, 'Morning ride')) }]);
  ok(await until(() => api.list.some((x) => x.m === 'POST'), 30000), '10. …the ride read and sent: POST /api/fitness/acts', js(api.list.map((x) => x.u)));
  ok(await until(() => (actsN() === n0 + 1 ? 'y' : null), 20000), '10. …kept with the account (one more ride)', `${n0} → ${actsN()}`);
  // dropped onto the screen: a drag of Files over Fitness's screen, then the drop
  api.reset();
  const life = await alive(p);
  const dropped = await p.evaluate(async ([scr, text]) => {
    const el = document.querySelector(scr); if (!el) return 'no screen';
    const dt = new DataTransfer(); dt.items.add(new File([text], 'evening.gpx', { type: 'application/gpx+xml' }));
    const r = el.getBoundingClientRect(), o = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + r.width / 2, clientY: r.top + 200 };
    el.dispatchEvent(new DragEvent('dragenter', o));
    const over = new DragEvent('dragover', o); el.dispatchEvent(over);
    el.dispatchEvent(new DragEvent('drop', o));
    return over.defaultPrevented ? 'taken' : 'not taken';
  }, [H.FX_DROP || H.M_FITNESS, gpxAt(t0 + 3 * 3600, 'Evening ride')]);
  ok(dropped === 'taken', '10. Files dragged over Fitness’s screen: taken (dragover prevented, Files only)', dropped);
  ok(await until(() => api.list.some((x) => x.m === 'POST'), 30000) && (await until(() => (actsN() === n0 + 2 ? 'y' : null), 20000)), '10. …dropped: read and kept (two more rides in all)', `${n0} → ${actsN()}`);
  ok(await life.same(), '10. …the same page (a drop never navigates it away, RI11)');
  const workers = F.p.workers().length;
  ok(await until(() => (F.p.workers().length === 0 ? 'y' : null), 15000), '10. no reader Worker left once the files are in (RI10)', `${workers} → ${F.p.workers().length}`);
  api.stop();
});

// ======================================================================================================================
await part(11, 'Fitness Settings: a save keeps the other prefs', 'S2-D7, §2.2', async () => {
// ======================================================================================================================
  await cold(p, '/fitness/#settings=units');
  const up = (await fitnessUp(p)) && (await sheetOpen(p, 'fxsettings', 20000)) && (await shown(p, H.fxSettingsPage('units'), 15000));
  ok(up, '11. #settings=units: Fitness Settings on Units and Maps', here(p));
  const api = apiLog(p, /\/api\/fitness\/me$/);
  await p.click(`${H.fxSettingsPage('units')} ${H.segValue('imperial')}`);
  ok(await until(() => api.list.some((x) => x.m === 'PUT'), 8000), '11. miles chosen: PUT /api/fitness/me (saveSettings)', js(api.list.map((x) => x.m)));
  const rec = await until(async () => { const r = await record(p); return r?.data?.prefs?.units === 'imperial' ? r : null; }, 8000);
  const pr = rec?.data?.prefs || {};
  ok(pr.units === 'imperial' && pr.onboarded === true && pr.maps === 'always' && rec?.data?.plan?.id === 'sportive', '11. …the record: units imperial, the other prefs (onboarded, maps always) and the plan kept', js(rec?.data, 400));
  await closeSheets(p);
  api.stop();
});

// ======================================================================================================================
await part(12, 'Weather’s 16 Days within 700 ms of a Fitness edit: the edit saved, no reload', 'RB2, S2-D21, C7', async () => {
// ======================================================================================================================
  // (Weather opened once in this page, so its module is mounted; then Fitness Settings, metric chosen, and at once 16 Days)
  await p.goto(`${HUB}/#apps`); await shown(p, H.appTile('weather'), 30000);
  await tapTile(p, 'weather'); await shown(p, H.M_WEATHER, 30000); await wait(1000);
  await goVia(p, '/fitness/#settings=units');
  await sheetOpen(p, 'fxsettings', 20000); await shown(p, H.fxSettingsPage('units'), 15000);
  const life = await alive(p), docs = loads(p), api = apiLog(p, /\/api\/fitness\/me$/);
  await p.evaluate(([seg]) => { document.querySelector(seg)?.click(); const a = document.createElement('a'); a.href = '/weather/#days'; document.body.append(a); a.click(); a.remove(); }, [`${H.fxSettingsPage('units')} ${H.segValue('metric')}`]);
  const days = (await shown(p, H.wxSec('days'), 30000)) && (await until(async () => (await count(p, H.DAY_ROW)) >= 10, 20000));
  ok(days, '12. metric tapped and, within the same moment, Weather’s 16 Days: shown', here(p));
  ok(await until(() => api.list.some((x) => x.m === 'PUT'), 5000), '12. …Fitness’s pending save sent as it was hidden (flushed, not lost: S2-D21)', js(api.list.map((x) => `${x.m} ${x.t}`)));
  ok(!!(await until(async () => ((await record(p))?.data?.prefs?.units === 'metric' ? 'y' : null), 8000)), '12. …the record says metric');
  ok((await life.same()) && docs.n() === 0, '12. …and no reload: the same page throughout (RB2)', js(docs.list));
  api.stop(); docs.stop();
});

// ======================================================================================================================
await part(14, 'axe, 320/390 light and dark, the 1280 layout', '§2.2, S2-D8, S2-D18, BI15', async () => {
// ======================================================================================================================
  await p.goto(`${HUB}/fitness/`); await fitnessUp(p);
  for (const id of ['today', 'activities', 'progress']) {
    await p.click(H.hdSec(id)); await shown(p, SEC(id)); await wait(900);
    const v = await axe(p, id);
    ok(!v.length, `14. axe, 390 light, ${id}: no serious or critical issue`, js(v));
    ok((await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, `14. 390 light, ${id}: no sideways scroll`);
    await shot(p, `14-390-light-${id}`);
  }
  for (const [scheme, width] of [['dark', 390], ['light', 320], ['dark', 320]]) {
    const X = await open(`tamsin-${scheme}-${width}`, { scheme, width, height: width === 320 ? 640 : 844 });
    await X.p.goto(`${HUB}/`); await todayUp(X.p);
    await shown(X.p, H.TODAY_FX_OPEN, 30000); await tapEl(X.p, H.TODAY_FX_OPEN);
    await fitnessUp(X.p); await wait(900);
    for (const id of ['today', 'activities', 'progress']) {
      await X.p.click(H.hdSec(id)); await shown(X.p, SEC(id)); await wait(900);
      if (scheme === 'dark' && width === 390) { const v = await axe(X.p, id); ok(!v.length, `14. axe, 390 dark, ${id}: no serious or critical issue`, js(v)); }
      ok((await X.p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, `14. ${width} ${scheme}, ${id}: no sideways scroll`);
      await shot(X.p, `14-${width}-${scheme}-${id}`);
    }
    if (width === 320) {
      await X.p.click(H.hdSec('today')); await wait(500);
      const fit = await X.p.evaluate(([t, b]) => { const h = document.querySelector(t), r = document.createRange(); r.selectNodeContents(h); const x = r.getBoundingClientRect(), bk = document.querySelector(b)?.getBoundingClientRect(); return { title: h.textContent.trim(), right: Math.round(x.right), left: Math.round(x.left), backRight: Math.round(bk?.right ?? 0), w: innerWidth }; }, [H.HD_TITLE, H.HD_BACK]);
      ok((await attrOf(X.p, H.HD_BACK, 'aria-label')) === 'Back to Today' && fit.title === 'Today' && fit.left >= fit.backRight && fit.right <= fit.w, `14. 320 ${scheme}: “Back to Today” over Today, the title whole (BI15)`, js(fit));
    }
    await X.ctx.close();
  }
  const W = await open('tamsin-wide', { width: 1280, height: 900 });
  await W.p.goto(`${HUB}/fitness/`); await fitnessUp(W.p); await wait(1200);
  const cols = await W.p.evaluate(([s, hero]) => { const kids = [...document.querySelector(s)?.querySelectorAll(':scope > *, :scope > * > *') || []].filter((e) => !e.matches(hero) && e.getClientRects().length && e.getBoundingClientRect().height > 60); return new Set(kids.map((e) => Math.round(e.getBoundingClientRect().left))).size; }, [SEC('today'), H.FX_DAYCARD]);
  ok(cols >= 2 && (await W.p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, '14. 1280 wide: Today in two columns of cards, no sideways scroll (S2-D8)', String(cols));
  await shot(W.p, '14-1280-today');
  await W.p.click(H.hdSec('activities')); await shown(W.p, `${H.M_FITNESS} ${H.fxAct('old1')}`, 20000);
  await W.p.click(`${H.M_FITNESS} ${H.fxAct('old1')}`);
  await sheetOpen(W.p, 'act', 20000); await wait(800);
  const box = await W.p.evaluate((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? { l: Math.round(r.left), r: Math.round(innerWidth - r.right), w: Math.round(r.width) } : null; }, `${H.sheet('act')}[open]`);
  ok(!!box && box.w < 1100 && Math.abs(box.l - box.r) <= 4, '14. 1280: a ride opens as a centred sheet (S2-D8, Question 4)', js(box));
  await shot(W.p, '14-1280-act');
  await W.ctx.close();

  const all = everyone.flatMap((x) => x.errs || []).filter((e) => !/tamsin-401/.test(e));
  ok(!all.some((e) => /CSP violation|Refused to/.test(e)), '14. no CSP violation on any page (§4.1)', js(all.filter((e) => /CSP|Refused/.test(e)).slice(0, 6)));
  ok(!all.length, '14. no page error and no console error on any page (part 8’s refused asks aside)', js(all.slice(0, 8)));
  const own = urls.filter((u) => /^https?:\/\/fitness\.ifl\.test/.test(u));
  ok(!own.length, '14. nothing of all this went to Fitness’s own address from the page (the hub serves it)', js(own.slice(0, 4)));
});

await closeAll();
console.log(`FAILS ${fails()}`);
process.exit(0);
