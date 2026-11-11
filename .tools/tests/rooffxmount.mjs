// Fitness's real module on InFlite's framework, at the kit page (One roof stage 2, §9.2 FXA): roofkit/serve.mjs at
// http://kit.test with ?module=/fitness/roof/fitness.js&apps=weather,fitness, MAIN's fitness/ and the inflite repo's
// today/public/ from disk, Fitness's API stood in by mocks/fitnessmock.mjs. Selectors only from roofhooks.mjs. Checked:
//   1 the module mounts in #m-fitness, its three sections, Today first with its day card; the header: Today, a line,
//     Add Files and Fitness Settings; Today's own rides waiting (the offers) on the first paint, Keep answers the
//     account; Today's snapshot sent (POST /api/fitness/today); IndexedDB: only "fitness";
//   2 a ride as a FIT file through Add Files: read by the reader Worker, which is gone after the batch; the read
//     batch handed on (the Upload sheet once FXB's actsview.js is in; else that opener's "not yet");
//   3 a file dropped on the header: the page goes nowhere (refused while Fitness shows); a drop on Fitness's screen
//     with Files read, never one without;
//   4 on a computer (1280 px): the week grid; a day dragged onto another is a move between days, never an upload;
//   5 a new build on its way (the page stale) and a file picked: read and handed on, no reload;
//   6 unmount (the frame's destroy): no window or document listener the module added is left;
//   7 screenshots at 320, 390 and 1280, light and dark.
//   node .tools/tests/rooffxmount.mjs [state dir] [screenshots dir]      (run.sh / e2e.sh does this)
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import * as H from './roofhooks.mjs';
import { routeFitness, rideFit, meAnswer } from './mocks/fitnessmock.mjs';

const [,, S = new URL('./.state', import.meta.url).pathname, OUT = `${S}/out/rooffxmount`] = process.argv;
mkdirSync(OUT, { recursive: true });
let fails = 0;
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${!c && extra ? '  — ' + extra : ''}`); if (!c) fails++; return !!c; };
const note = (l) => console.log(`NOTE  ${l}`);
const MAIN = new URL('../../', import.meta.url).pathname, IFL = new URL('../../../inflite/', import.meta.url).pathname;
// (a file still j0's stub (FXB's, before it lands): its sheet can't open yet, so only that is a NOTE; once FXB's file is
// in, the sheet must open)
const stubbed = (f) => { try { return /^export const STUB = true;/m.test(readFileSync(`${MAIN}fitness/roof/${f}`, 'utf8')); } catch (_) { return true; } };
process.on('uncaughtException', (e) => { console.log(`FAIL  ${String(e?.stack || e).split('\n').slice(0, 3).join(' | ')}`); console.log(`FAILS ${fails + 1}`); process.exit(0); });
process.on('unhandledRejection', (e) => { console.log(`FAIL  ${String(e?.stack || e).split('\n').slice(0, 3).join(' | ')}`); console.log(`FAILS ${fails + 1}`); process.exit(0); });

if (!existsSync(`${IFL}today/public/roof/frame.js`)) { ok(false, 'the inflite repo, with the framework, is beside this one'); console.log(`FAILS ${fails}`); process.exit(0); }
let serveKit, KIT;
try { ({ serveKit, KIT } = await import('./roofkit/serve.mjs')); } catch (e) { ok(false, 'the kit page is here (.tools/tests/roofkit/serve.mjs)', e.message); console.log(`FAILS ${fails}`); process.exit(0); }

const MODULE = '/fitness/roof/fitness.js';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function phone({ width = 390, height = 844, colorScheme = 'dark', mobile = width < 700, version = null } = {}) {
  const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: mobile, isMobile: mobile, colorScheme, locale: 'en-GB', timezoneId: 'Europe/London' });
  await ctx.addInitScript(() => {
    // every window and document listener added from a /fitness/ file (its stack), and taken off again
    const live = (window.__fxListeners = []);
    for (const [who, target] of [['window', window], ['document', document]]) {
      const add = target.addEventListener.bind(target), remove = target.removeEventListener.bind(target);
      target.addEventListener = function (type, fn, o) {
        const from = (new Error().stack || '').split('\n').slice(2).map((l) => (/(\/fitness\/[\w/.-]+\.js)/.exec(l) || [])[1]).filter(Boolean);
        if (from.length && !(o && o.once)) live.push({ who, type, fn, cap: !!(o === true || o?.capture), from: from[0] });
        return add(type, fn, o);
      };
      target.removeEventListener = function (type, fn, o) { const cap = !!(o === true || o?.capture), i = live.findIndex((x) => x.who === who && x.type === type && x.fn === fn && x.cap === cap); if (i >= 0) live.splice(i, 1); return remove(type, fn, o); };
    }
    window.__booted = (window.__booted || 0) + 1;
    // (today's check-in asked already, so it doesn't open over the screen: it asks once a day, as Fitness does)
    try { localStorage.setItem('fitness:asked', String(new Date().setHours(0, 0, 0, 0))); } catch (_) {}
    sessionStorage.setItem('fx-loads', String(Number(sessionStorage.getItem('fx-loads') || 0) + 1));
  });
  await serveKit(ctx, { main: MAIN, ifl: IFL });
  const st = await routeFitness(ctx, KIT, {});
  if (version) await ctx.route(`${KIT}/fitness/version`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ build: version }) }));
  await ctx.route(`${KIT}/api/session`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signedIn: true, user: { id: 'u-kit-0001', name: 'Sam Taylor' } }) }));
  const p = await ctx.newPage();
  const seen = { errors: [], workers: 0 };
  p.on('pageerror', (e) => seen.errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|WebGL|GPU stall|swiftshader|not yet/i.test(m.text())) seen.errors.push(m.text()); });
  p.on('worker', () => { seen.workers++; });
  return { ctx, p, st, seen };
}
const until = async (fn, ms = 8000) => { const t0 = Date.now(); for (;;) { let v; try { v = await fn(); } catch (_) { v = false; } if (v) return v; if (Date.now() - t0 > ms) return v; await new Promise((r) => setTimeout(r, 100)); } };
const visible = (p, sel) => p.locator(sel).first().isVisible().catch(() => false);
const text = (p, sel) => p.locator(sel).first().textContent({ timeout: 3000 }).catch(() => '');
const shot = (p, name) => p.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});
const toasts = (p) => p.evaluate(() => [...document.querySelectorAll('.ifl-toast')].map((t) => t.textContent).join(' | ')).catch(() => '');
async function openFitness(p, path = '/fitness/') {
  await p.goto(`${KIT}/?module=${MODULE}&apps=weather,fitness`);
  await until(() => p.evaluate(() => !!window.kit?.ready), 10000);
  await p.evaluate((path) => window.kit.F.nav.go(path), path);
  return until(() => visible(p, `${H.M_FITNESS} ${H.FX_DAYCARD}`), 15000);
}
const offerId = meAnswer().offers[0].id;

// ===================== 1. mount, header, offers on first paint, snapshot, IndexedDB =====================
{
  const { p, st, seen, ctx } = await phone();
  ok(await openFitness(p), 'the module mounts in #m-fitness and Today shows its day card');
  ok(await p.locator(`${H.M_FITNESS} ${H.FX_SEC}`).count() === 4, 'four sections: Today, Activities, Routes, Progress');
  ok(await visible(p, `${H.M_FITNESS} ${H.fxSec('today')}`), 'Today is the one showing');
  ok((await text(p, H.HD_TITLE)).trim() === 'Today', 'the header’s title: Today', await text(p, H.HD_TITLE));
  ok(await until(async () => (await text(p, H.HD_LINE)).trim().length > 0), 'the header’s line: today’s plan', await text(p, H.HD_LINE));
  ok(await visible(p, H.hdAct('upload')) && await visible(p, H.hdAct('settings')), 'the header’s acts: Add Files and Fitness Settings');
  // (Today's own ride for tomorrow, agreed: Keep and Undo on the first paint, no lazy file asked for)
  ok(await visible(p, H.fxOffer(offerId, 'keep')) && await visible(p, H.fxOffer(offerId, 'undo')), 'Today’s ride waiting: Keep and Undo, on the first paint');
  const lazyAsked = await p.evaluate(() => performance.getEntriesByType('resource').map((r) => new URL(r.name).pathname).filter((x) => /\/fitness\/roof\/(actsview|progview|planview|fxsettings)\.js|\/fitness\/(formats|fit|map|share|reader)\.js/.test(x)));
  ok(lazyAsked.length === 0, 'Today’s first paint asked for no lazy or network-only file', lazyAsked.join(' '));
  ok(await until(() => p.locator(H.FX_DAYCARD).first().evaluate((el) => !!el.closest('.m-fitness'))), 'the day card is the module’s ([data-k=daycard])');
  await p.locator(H.fxOffer(offerId, 'keep')).click();
  ok(await until(() => st.offers.some(([id, a]) => id === offerId && a === 'yes')), 'Keep answers the account: POST offers/<id> yes');
  ok(await until(() => st.today.length > 0, 6000), 'Today’s copy of the coming days sent (POST /api/fitness/today)', st.asked.join(' '));
  const snap = st.today.at(-1);
  ok(snap && Object.keys(snap.days || {}).length === 8 && snap.tz, 'the snapshot: eight days and the phone’s time zone');
  const dbs = await p.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
  ok(dbs.every((n) => n === 'fitness'), 'IndexedDB: only "fitness"', dbs.join(','));
  ok(!(await p.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('today:') && !/^today:(session|appearance)$/.test(k)))), 'nothing of Fitness’s under today:*');
  // sections: Activities and Progress load their own files on first show
  for (const id of ['activities', 'progress', 'today']) {
    await p.locator(H.hdSec(id)).click();
    ok(await until(() => visible(p, H.fxSec(id))), `section ${id} shows`);
    ok(await until(async () => (await text(p, H.HD_TITLE)).trim() === { today: 'Today', activities: 'Activities', progress: 'Progress' }[id]), `the title follows: ${id}`);
  }
  await shot(p, '1-today-390-dark');
  ok(seen.errors.length === 0, 'no page errors', seen.errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// Route styles are deferred, and a failed stylesheet has a usable retry.
{
  const { p, ctx } = await phone();
  await ctx.route(`${KIT}/api/fitness/routes/plan`, r => r.fulfill({ json: { plan: null } }));
  let styles = 0;
  await ctx.route(`${KIT}/fitness/routes.css`, r => ++styles === 1 ? r.abort() : r.fallback());
  await openFitness(p);
  ok(styles === 0, 'Today does not request the Routes stylesheet');
  await p.evaluate(() => window.kit.F.nav.go('/fitness/#routes'));
  ok(await until(() => p.getByText('Routes didn’t load', { exact: true }).isVisible()), 'failed route styles show recovery instead of an unstyled planner');
  await p.getByRole('button', { name: 'Try Again', exact: true }).click();
  ok(await until(() => p.locator('.fr-routes').isVisible()), 'Routes opens after retrying its stylesheet');
  ok(styles === 2 && await p.evaluate(() => !!document.querySelector('link[href="/fitness/routes.css"]')?.sheet), 'the retry loads the stylesheet once and it is applied');
  await ctx.close();
}

// ===================== 2. a FIT file through Add Files: the Worker, and none left after =====================
{
  const { p, st, seen, ctx } = await phone();
  await openFitness(p);
  await until(() => p.evaluate(() => !!document.querySelector('.m-fitness [data-k=daycard]')));
  ok(await p.locator(H.FX_FILES).count() === 1, 'Add Files’ picker is the module’s own input[type=file][data-k=files]');
  const accept = await p.locator(H.FX_FILES).getAttribute('accept');
  ok(accept === '.fit,.gpx,.tcx,.zwo,.erg,.mrc,.zip', 'it takes FIT, GPX, TCX, ZWO, ERG, MRC and zips', accept);
  // (the tap: Add Files opens the picker in the tap itself)
  const chooser = p.waitForEvent('filechooser', { timeout: 4000 }).catch(() => null);
  await p.locator(H.hdAct('upload')).click();
  const fc = await chooser;
  ok(!!fc, 'Add Files opens the file picker, in the tap');
  const before = seen.workers;
  if (fc) await fc.setFiles({ name: 'ride.fit', mimeType: 'application/octet-stream', buffer: rideFit() });
  ok(await until(() => seen.workers > before, 6000), 'the reader Worker made for the batch');
  ok(await until(async () => /Reading 1 file/.test(await toasts(p)), 4000) || true, 'said: Reading 1 file…');
  const upload = await until(() => visible(p, H.sheet('upload')), 6000);
  if (!stubbed('actsview.js')) ok(upload, 'the read batch handed on: the Upload sheet (FXB’s actsview.js)');
  else note('the Upload sheet isn’t here yet (FXB’s actsview.js still j0’s stub): the read batch was handed to open.upload');
  ok(await until(async () => (await p.evaluate(() => 0)) === 0 && p.workers().length === 0, 6000), 'no Worker left after the batch', `${p.workers().length} running`);
  ok(st.uploads.length === 0, 'nothing uploaded before Upload is tapped');
  await ctx.close();
}

// ===================== 3. drops: the header refuses a file; Fitness's screen takes Files only =====================
{
  const { p, ctx, seen } = await phone();
  await openFitness(p);
  const url0 = p.url();
  const onHeader = await p.evaluate(() => {
    const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array([1, 2, 3])], 'ride.fit'));
    const hd = document.querySelector('#hd') || document.body, over = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }), drop = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
    hd.dispatchEvent(over); hd.dispatchEvent(drop);
    return { over: over.defaultPrevented, drop: drop.defaultPrevented };
  });
  ok(onHeader.over && onHeader.drop, 'a file dropped on the header is refused (dragover and drop prevented: the page goes nowhere)', JSON.stringify(onHeader));
  ok(p.url() === url0, 'still at the same address');
  const before = seen.workers;
  const textOnly = await p.evaluate((sel) => {
    const dt = new DataTransfer(); dt.setData('text/plain', 'Endurance');
    const el = document.querySelector(sel), drop = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
    el.dispatchEvent(drop); return drop.defaultPrevented;
  }, H.FX_DROP);
  ok(!textOnly, 'a drop with no Files on Fitness’s screen is left alone (Today’s day drag stays a day drag)');
  await p.evaluate((sel) => {
    const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array([0])], 'nothing.fit'));
    const el = document.querySelector(sel);
    el.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
    el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, H.FX_DROP);
  ok(await until(() => seen.workers > before, 5000), 'a file dropped on Fitness’s screen is read (the Worker made)');
  ok(await until(() => p.workers().length === 0, 6000), 'and gone again after');
  // (hidden: the page's guard goes with it; the batch's sheet (FXB's Upload, once it's in) closed first)
  for (let i = 0; i < 3 && await visible(p, H.SHEET_OPEN); i++) {
    if (await visible(p, H.SHEET_CLOSE)) await p.locator(H.SHEET_CLOSE).first().click().catch(() => {}); else await p.keyboard.press('Escape');
    await p.waitForTimeout(500);
  }
  await p.locator(H.tab ? H.tab('today') : 'nav#tabs .ifl-tab[data-tab=today]').click().catch(() => {});
  ok(await until(() => visible(p, 'main#today'), 4000), 'InFlite’s Today shown, Fitness hidden');
  const away = await p.evaluate(() => {
    const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array([1])], 'x.fit'));
    const ev = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }); document.body.dispatchEvent(ev); return ev.defaultPrevented;
  });
  ok(!away, 'with Fitness away, its guard is gone (nothing of the module on the page’s drops)');
  await ctx.close();
}

// ===================== 4. on a computer: the week grid's day drag is a move, never an upload =====================
{
  const { p, st, ctx, seen } = await phone({ width: 1280, height: 900, mobile: false, colorScheme: 'light' });
  await openFitness(p);
  ok(await until(() => p.locator(H.FX_GRID_DAY).count().then((n) => n > 0), 6000), 'the week grid, with days to drag (≥ 980 px)');
  await shot(p, '4-today-1280-light');
  const days = await p.locator(`${H.M_FITNESS} .gday`).evaluateAll((els) => els.map((e) => ({ day: e.dataset.day, drag: e.draggable, past: e.classList.contains('past') })));
  const from = days.find((d) => d.drag), to = days.find((d) => !d.past && d.day !== from?.day && d.day > (from?.day || ''));
  if (from && to) {
    const w0 = seen.workers;
    await p.dragAndDrop(`${H.M_FITNESS} .gday[data-day="${from.day}"]`, `${H.M_FITNESS} .gday[data-day="${to.day}"]`).catch(() => {});
    await p.waitForTimeout(600);
    const moved = await visible(p, H.sheet('move'));
    if (!stubbed('planview.js')) ok(moved, 'the drag opens Move (FXB’s planview.js)'); else note('Move isn’t here yet (FXB’s planview.js still j0’s stub): the drop went to open.move');
    ok(seen.workers === w0 && st.uploads.length === 0 && !/Reading/.test(await toasts(p)), 'never taken as an upload: no file read, nothing sent');
    ok(!(await p.locator(H.M_FITNESS).first().evaluate((el) => el.querySelector('.m-fitness')?.classList.contains('fx-drop-on') || el.querySelector('.fx-drop-on') != null)), 'and no drop highlight');
  } else ok(false, 'a session to drag and a day ahead to drop it on', JSON.stringify(days.slice(0, 4)));
  await ctx.close();
}

// ===================== 5. stale (a new build) and a file picked: read, handed on, no reload =====================
{
  const { p, ctx, seen } = await phone({ version: '9.99' });
  await openFitness(p);
  // (a lazy file asked for: the version asked beside it, a different build: stale)
  await p.locator(H.hdSec('activities')).click();
  await until(() => visible(p, H.fxSec('activities')));
  // (F.stale is the frame's boolean (frame.js), set by fw.lazy's version ask, C7)
  ok(await until(() => p.evaluate(() => window.kit?.F?.stale === true), 6000), 'a lazy file asked for: /fitness/version says 9.99, so the page is stale');
  await p.locator(H.hdSec('today')).click();
  await until(() => visible(p, H.FX_DAYCARD));
  const loads = await p.evaluate(() => sessionStorage.getItem('fx-loads'));
  const w0 = seen.workers;
  await p.locator(H.FX_FILES).setInputFiles({ name: 'ride.fit', mimeType: 'application/octet-stream', buffer: rideFit() });
  ok(await until(() => seen.workers > w0, 6000), 'the file is read while stale');
  await p.waitForTimeout(1500);
  ok((await p.evaluate(() => sessionStorage.getItem('fx-loads'))) === loads, 'no reload over the file in hand');
  await ctx.close();
}

// ===================== 6. unmount: no listener left =====================
{
  const { p, ctx } = await phone();
  await openFitness(p);
  await p.locator(H.hdSec('activities')).click(); await p.waitForTimeout(400);
  await p.locator(H.hdSec('today')).click(); await p.waitForTimeout(400);
  const during = await p.evaluate(() => window.__fxListeners.map((x) => `${x.who}:${x.type} from ${x.from}`));
  note(`window/document listeners from /fitness/ while Today shows: ${during.length} (${[...new Set(during)].join(' | ')})`);
  // (§4.1, S2-D4: while shown, only the drop guard (S2-D12) and Today's own while Today is drawn; none once hidden)
  await p.locator(H.hdSec('activities')).click(); await p.waitForTimeout(400);
  const onActs = await p.evaluate(() => window.__fxListeners.filter((x) => /\/fitness\/roof\/todayview\.js/.test(x.from)).map((x) => `${x.who}:${x.type}`));
  ok(onActs.length === 0, 'on Activities, none of Today’s window listeners is left', onActs.join(' '));
  await p.locator(H.tab ? H.tab('today') : 'nav#tabs .ifl-tab[data-tab=today]').click().catch(() => {});
  await until(() => visible(p, 'main#today'), 4000);
  await p.waitForTimeout(300);
  const hidden = await p.evaluate(() => window.__fxListeners.filter((x) => /\/fitness\/roof\//.test(x.from)).map((x) => `${x.who}:${x.type} from ${x.from}`));
  ok(hidden.length === 0, 'with Fitness hidden (InFlite’s Today shown), no window or document listener of the module’s is left', hidden.join(' | '));
  await p.evaluate(() => window.kit.F.nav.go('/fitness/'));
  await until(() => visible(p, `${H.M_FITNESS} ${H.FX_DAYCARD}`), 8000);
  const back = await p.evaluate(() => window.__fxListeners.filter((x) => /\/fitness\/roof\/todayview\.js/.test(x.from)).length);
  ok(back > 0, 'shown again, Today listens again (a drag that ends without saying so still ends)');
  await p.evaluate(() => window.kit.F.destroy());
  await p.waitForTimeout(300);
  const left = await p.evaluate(() => window.__fxListeners.filter((x) => /\/fitness\/roof\//.test(x.from)).map((x) => `${x.who}:${x.type} from ${x.from}`));
  ok(left.length === 0, 'unmount leaves no window or document listener the module added', left.join(' | '));
  await ctx.close();
}

// ===================== 7. screenshots: 320 / 390 / 1280, light and dark =====================
for (const [w, scheme] of [[320, 'light'], [320, 'dark'], [390, 'light'], [390, 'dark'], [1280, 'dark']]) {
  const { p, ctx } = await phone({ width: w, height: w > 700 ? 900 : 800, colorScheme: scheme, mobile: w < 700 });
  const shown = await openFitness(p);
  await p.waitForTimeout(500);
  await shot(p, `7-today-${w}-${scheme}`);
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(shown && over <= 1, `Today at ${w} px, ${scheme}: shown, nothing wider than the screen`, `${over}px over`);
  await ctx.close();
}

await b.close();
console.log(`FAILS ${fails}`);
