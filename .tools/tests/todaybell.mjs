// Today's bell (the inflite repo's today/public/bell.js, with the root worker's log in sw.js), end to end in real
// Chromium: Today's Worker by wrangler dev on :8787 against the stand-in account (mocks/todaystub.mjs on :8789), and
// pushes handed to the root worker as the browser hands them (DevTools' ServiceWorker.deliverPushMessage), with the
// worker's navigator.setAppBadge stood in for so the Home Screen badge can be read.
// Checked: the bell in the header's pill between Search and Edit, the same size and glyph weight as Search, named
// "Notifications"; its count as pushes come with the page open, the badge the same number; the sheet (Notifications,
// newest first: icon, title, body, time), opening it clearing the count and the badge while the rows stay; a push
// while it's open shown in it; a row swiped away (and back, short of a third); Clear by keyboard (its button, and
// Delete); a row tapped opening where it came from in the page (/#you), cleared, the sheet shut; Clear All, then "No
// notifications"; the log kept across a reload; reduced motion; 1280 wide; light and dark; axe on the sheet; no
// console error. Screenshots: phone light and dark (header with the count, the sheet with three, mid-swipe).
// And with a log laid out by days (written into the worker's IndexedDB, at times from the page's clock): the sections
// Today, Yesterday, Earlier; the times (Now, 5m, 11:02, Yesterday, Thu, 26 Oct) with each app's name; a dot on those
// unseen as it opened, gone the next time; Ann's three today one row with +2, opened out and shut again by it (aria-
// expanded); the stack swiped away as one, the toast in the sheet with Undo putting it back, in the log too; Clear All
// and its Undo; the sheet as tall as its rows, scrolling for many; the swipe a little stiff at first, the bin growing;
// the empty sheet's bell; Notification Settings at its foot opening You. Screenshots (bell2-*): the sections, the stack
// opened out, the toast, empty, light and dark.
//   node .tools/tests/todaybell.mjs [state dir] [screenshots dir]      (run.sh does this)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const HERE = new URL('./', import.meta.url).pathname;
const IFL = process.env.IFL_ROOT || new URL('../../../inflite/', import.meta.url).pathname;
const OUT = process.argv[3] || `${tmpdir()}/todaybell`;
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:8787', STUB = 'http://127.0.0.1:8789';
let fails = 0;
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${!c && extra ? '  — ' + extra : ''}`); if (!c) fails++; };
const same = (a, b, l) => ok(JSON.stringify(a) === JSON.stringify(b), l, `got ${JSON.stringify(a)?.slice(0, 400)}, wanted ${JSON.stringify(b)?.slice(0, 400)}`);
if (!existsSync(`${IFL}today/public/bell.js`)) { console.log('SKIP  the inflite repo beside has no bell (today/public/bell.js)'); console.log('FAILS 0'); process.exit(0); }
const MIDDAY = JSON.parse(readFileSync(new URL('./mocks/today/cards.midday.json', import.meta.url), 'utf8'));
const AXE = readFileSync(`${HERE}node_modules/axe-core/axe.min.js`, 'utf8');

// ---- the stand-in account and the site's Worker ----
const stub = spawn(process.execPath, [`${HERE}mocks/todaystub.mjs`, '8789'], { stdio: ['ignore', 'ignore', 'inherit'] });
const wbin = [`${IFL}node_modules/.bin/wrangler`, `${HERE}node_modules/.bin/wrangler`].find((f) => existsSync(f));
let wlog = '';
const wr = spawn(wbin, ['dev', '--port', '8787', '--var', 'ACCOUNT_ORIGIN:http://127.0.0.1:8789'], { cwd: IFL, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
wr.stdout.on('data', (d) => (wlog += d)); wr.stderr.on('data', (d) => (wlog += d));
let stopped = false;
const stop = () => { if (stopped) return; stopped = true; try { process.kill(-wr.pid, 'SIGTERM'); } catch {} try { stub.kill(); } catch {} };
process.on('exit', stop);
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { stop(); process.exit(1); });
const up = async (u) => { for (let i = 0; i < 90; i++) { try { if ((await fetch(u)).ok) return true; } catch {} await new Promise((r) => setTimeout(r, 1000)); } return false; };
if (!(await up(`${STUB}/__log`)) || !(await up(`${BASE}/version`))) { console.log(wlog.slice(-2000)); ok(false, 'the stub and the site’s Worker start'); console.log(`FAILS ${fails}`); stop(); process.exit(1); }
await fetch(`${STUB}/mode`, { method: 'POST', body: JSON.stringify({ phase: 'midday' }) });

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined) });
const errs = [];
const until = async (f, ms = 10000) => { const t = Date.now(); for (;;) { const v = await f().catch(() => null); if (v) return v; if (Date.now() - t > ms) return null; await new Promise((r) => setTimeout(r, 150)); } };
const BELL = '#hd .ifh-acts [data-act=bell]', SHEET = 'dialog.ifl-sheet[data-sheet=notifications][open]', ROW = `${SHEET} .ifl-nt-row`;

async function open({ w = 390, h = 844, scheme = 'light', reduced = false } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, reducedMotion: reduced ? 'reduce' : 'no-preference', locale: 'en-GB', timezoneId: 'Europe/London', serviceWorkers: 'allow' });
  await ctx.addCookies([{ name: 'account', value: 'stubsession0123456789abcdefABCDEF', url: BASE }]);
  await ctx.grantPermissions(['notifications'], { origin: BASE });
  await ctx.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`)));
  await ctx.route((u) => new URL(u).pathname === '/api/hub', (r) => r.fulfill({ json: { ready: true, roof: true }, headers: { 'Cache-Control': 'no-store' } }));
  await ctx.route((u) => new URL(u).pathname.startsWith('/chats/'), (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Chats</title><p>Chats</p>' }));
  await ctx.route((u) => /^\/(weather|fitness|markets|mail)\/.+/.test(new URL(u).pathname), (r) => r.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' }));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.clock.setFixedTime(new Date(MIDDAY.at));
  await p.goto(BASE + '/');
  await p.waitForSelector('#in:not([hidden]) #tabs .ifl-tab');
  await p.waitForSelector(BELL);
  // (the root worker up, its badge stood in for, and DevTools' push to it)
  const ready = await until(() => p.evaluate(async () => !!(await navigator.serviceWorker.getRegistration('/'))?.active), 20000);
  ok(!!ready, 'the root worker is up');
  const sw = await until(async () => ctx.serviceWorkers().find((x) => x.url() === `${BASE}/sw.js`), 10000);
  const stubBadge = () => sw?.evaluate(() => {
    self.__badges ||= [];
    const set = { value: async (n) => { self.__badges.push(n); }, configurable: true }, clear = { value: async () => { self.__badges.push(0); }, configurable: true };
    Object.defineProperty(self.navigator, 'setAppBadge', set); Object.defineProperty(self.navigator, 'clearAppBadge', clear);
  });
  await stubBadge();
  const cdp = await ctx.newCDPSession(p), regs = new Map();
  cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => { for (const x of e.registrations || []) if (!x.isDeleted) regs.set(x.scopeURL, x.registrationId); });
  await cdp.send('ServiceWorker.enable').catch(() => {});
  const reg = await until(async () => regs.get(`${BASE}/`), 10000);
  const push = async (d) => { await cdp.send('ServiceWorker.deliverPushMessage', { origin: BASE, registrationId: reg, data: JSON.stringify(d) }); await p.waitForTimeout(250); };
  const badges = () => sw.evaluate(() => self.__badges || []);
  return { ctx, p, sw, push, badges, stubBadge };
}
const count = (p) => p.$eval(BELL, (b) => b.querySelector('.ifh-act-badge')?.textContent || '').catch(() => '');
const rows = (p) => p.$$eval(ROW, (rs) => rs.filter((r) => !r.classList.contains('gone')).map((r) => [r.querySelector('img.ifl-appic')?.dataset.app, r.querySelector('.ifl-nt-t').textContent, r.querySelector('.ifl-nt-b')?.textContent || '', r.querySelector('.ifl-nt-when').textContent]));
const notes = (p) => p.evaluate(() => new Promise(async (ok) => { const r = await navigator.serviceWorker.getRegistration('/'); const ch = new MessageChannel(); ch.port1.onmessage = (e) => ok(e.data); r.active.postMessage({ ifl: 'notes' }, [ch.port2]); }));
const THREE = [
  { app: 'weather', title: 'Rain from 15:00', body: 'Heavy at times until about 18:00, so take a coat if you’re out this afternoon', tag: 'rain', url: './' },
  { app: 'chat', title: 'Ann', body: 'See you at six', url: '/pigeon/#open=abc' },
  { app: 'markets', title: 'TSCO up 4.2%', body: 'Tesco, after its results', tag: 'TSCO', url: './#s=TSCO' },
];
// (a row's card dragged sideways by the mouse, as a finger does: dx px, left at the end unless let go)
async function drag(p, sel, dx, { release = true, shot = null } = {}) {
  const box = await p.$eval(sel, (c, left) => { const r = c.getBoundingClientRect(); return { x: r.x + r.width * (left ? 0.85 : 0.15), y: r.y + r.height / 2 }; }, dx < 0);
  await p.mouse.move(box.x, box.y); await p.mouse.down();
  for (let i = 1; i <= 8; i++) await p.mouse.move(box.x + (dx * i) / 8, box.y + 1);
  if (shot) await p.screenshot({ path: shot });
  if (release) await p.mouse.up();
  return box;
}

// ======================================================================= the whole way, phone, light and dark
for (const scheme of ['light', 'dark']) {
  const full = scheme === 'light';
  const { ctx, p, push, badges, stubBadge } = await open({ scheme });
  // the bell in the pill
  same(await p.$$eval('#hd .ifh-acts [data-act]', (bs) => bs.map((x) => `${x.dataset.act}:${x.getAttribute('aria-label')}`)), ['search:Search', 'bell:Notifications', 'edit:Edit Today: hide and reorder cards'], `${scheme}: the pill: Search, the bell (Notifications), Edit`);
  const look = await p.$$eval('#hd .ifh-acts [data-act]', (bs) => bs.map((x) => { const r = x.getBoundingClientRect(), s = x.querySelector('svg'); return [Math.round(r.width), Math.round(r.height), s && getComputedStyle(s).strokeWidth, s && Math.round(s.getBoundingClientRect().width)]; }));
  same(look[1], look[0], `${scheme}: the bell the same size and glyph weight as Search`);
  same(await count(p), '', `${scheme}: no count with none`);
  // three pushes with the page open: the count, and the badge the same
  for (const d of THREE) await push(d);
  const c3 = await until(async () => (await count(p)) === '3', 8000);
  ok(!!c3, `${scheme}: three come: the bell says 3`, await count(p));
  same(await p.$eval(BELL, (b) => b.getAttribute('aria-label')), 'Notifications, 3 new', `${scheme}: and VoiceOver says so`);
  same((await badges()).at(-1), 3, `${scheme}: and the Home Screen badge 3`);
  await p.screenshot({ path: `${OUT}/bell-header-${scheme}.png`, clip: { x: 0, y: 0, width: 390, height: 150 } });
  await p.screenshot({ path: `${OUT}/bell-today-${scheme}.png` });
  // the sheet
  await p.click(BELL);
  await p.waitForSelector(ROW);
  await p.waitForTimeout(450);
  const three = await rows(p);
  same(three.map((r) => r.slice(0, 3)), THREE.slice().reverse().map((d) => [d.app, d.title, d.body]), `${scheme}: the sheet: newest first, each app’s icon, title and body`);
  // (the worker's clock is the machine's, ahead of the page's fixed one: "Now")
  ok(three.every((r) => r[3] === 'Now'), `${scheme}: each with its time`, JSON.stringify(three.map((r) => r[3])));
  same(await p.$$eval(`${ROW} .ifl-nt-app`, (xs) => xs.map((x) => x.textContent)), ['Markets', 'Chat', 'Weather'], `${scheme}: and its app’s name`);
  same(await p.$$eval(`${SHEET} .ifl-nt-h`, (xs) => xs.map((x) => x.textContent)), ['Today'], `${scheme}: under Today`);
  same(await p.$$eval(ROW, (rs) => rs.map((r) => r.dataset.fresh || '')), ['1', '1', '1'], `${scheme}: each with the dot, unseen as it opened`);
  same(await p.$eval(BELL, (b) => b.getAttribute('aria-label')), 'Notifications', `${scheme}: the bell, opened, named without a count`);
  const tall = await p.$eval(SHEET, (d) => [d.getBoundingClientRect().height, d.querySelector('.ifs-body').scrollHeight - d.querySelector('.ifs-body').clientHeight]);
  ok(tall[0] < 844 * 0.7 && tall[1] <= 1, `${scheme}: three: the sheet as tall as they are, no scrolling`, JSON.stringify(tall));
  same(await p.$eval(`${SHEET} h2`, (h) => h.textContent), 'Notifications', `${scheme}: titled Notifications`);
  const cleared = await until(async () => (await count(p)) === '' && (await badges()).at(-1) === 0, 5000);
  ok(!!cleared, `${scheme}: opened: the count and the badge cleared`, JSON.stringify([await count(p), (await badges()).at(-1)]));
  same((await notes(p)).list.length, 3, `${scheme}: the rows stay`);
  await p.screenshot({ path: `${OUT}/bell-sheet-${scheme}.png` });
  if (full) {
    await p.evaluate(AXE);
    const axe = await p.evaluate(async () => (await window.axe.run(document.querySelector('dialog[data-sheet=notifications]'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] }, resultTypes: ['violations'] })).violations.map((v) => `${v.id} ×${v.nodes.length}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ').slice(0, 160)}`));
    same(axe, [], 'the sheet: axe clean');
    same(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, 'no sideways scroll');
  }
  // mid-swipe (the second row, Ann's, to the left), shown; short of a third it comes back
  const at = await drag(p, `${ROW}:nth-child(2) .ifl-nt-card`, -130, { release: false, shot: `${OUT}/bell-swipe-${scheme}.png` });
  ok(await p.$eval(`${ROW}:nth-child(2)`, (r) => r.classList.contains('dragging') && r.querySelector('.ifl-nt-card').getBoundingClientRect().x < 0), `${scheme}: the row slides with the finger`);
  same(await p.$eval(`${ROW}:nth-child(2)`, (r) => [r.querySelector('.ifl-nt-card').style.getPropertyValue('--dx'), Number(r.style.getPropertyValue('--p')) > 0.9, getComputedStyle(r.querySelector('.ifl-nt-back > span:last-child')).visibility]), ['-114px', true, 'visible'], `${scheme}: a little behind it (the first pixels stiff), the bin grown, on the side it’s showing`);
  await p.mouse.move(at.x - 20, at.y + 1, { steps: 4 });
  await p.mouse.up();
  await p.waitForTimeout(450);
  same((await rows(p)).length, 3, `${scheme}: let go short of a third: it comes back`);
  if (!full) { await ctx.close(); continue; }
  // swiped away
  await drag(p, `${ROW}:nth-child(2) .ifl-nt-card`, -260);
  await p.waitForTimeout(600);
  same((await rows(p)).map((r) => r[1]), ['TSCO up 4.2%', 'Rain from 15:00'], 'swiped away: Ann’s gone');
  ok(!(await notes(p)).list.some((n) => n.title === 'Ann'), 'and out of the worker’s log');
  // Clear by keyboard: its button
  await p.focus(`${ROW}:nth-child(2) .ifl-nt-x`);
  ok(await p.$eval(`${ROW}:nth-child(2) .ifl-nt-x`, (x) => getComputedStyle(x).opacity === '1' || x.matches(':focus')), 'Clear shows as it’s focused');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  same((await rows(p)).map((r) => r[1]), ['TSCO up 4.2%'], 'Clear (keyboard): the rain gone');
  // a push while it's open: in the sheet, and seen at once
  await push({ app: 'today', title: 'Your day', body: 'Three things before lunch', url: '/#you' });
  const four = await until(async () => (await rows(p)).length === 2, 6000);
  ok(!!four, 'a push while it’s open: shown in it', JSON.stringify(await rows(p)));
  ok(!!(await until(async () => (await notes(p)).unread === 0, 4000)), 'and seen: no count');
  // tapped: where it came from (/#you, in the page), cleared, the sheet shut
  await p.click(`${ROW}:nth-child(1) .ifl-nt-main`);
  const went = await until(() => p.evaluate(() => !document.getElementById('you').hidden && location.hash === '#you'), 6000);
  ok(!!went, 'a row tapped: You, in the same page (/#you)', p.url());
  ok(!(await p.$(SHEET)), 'and the sheet shut');
  same((await notes(p)).list.map((n) => n.title), ['TSCO up 4.2%'], 'and it’s cleared');
  // the log kept across a reload; then Clear All
  await p.goto(BASE + '/');
  await p.waitForSelector(BELL);
  await stubBadge();
  await p.click(BELL);
  await p.waitForSelector(ROW);
  same((await rows(p)).map((r) => r[1]), ['TSCO up 4.2%'], 'kept across a reload');
  await p.click(`${SHEET} .ifl-nt-all`);
  await p.waitForFunction((s) => document.querySelector(`${s} .ifl-nt-none`), SHEET);
  same(await p.$eval(`${SHEET} .ifl-nt-none`, (b) => [b.textContent.trim(), !!b.querySelector('[data-icon=bell] svg')]), ['No notifications', true], 'Clear All: the bell and “No notifications”');
  ok(await p.$eval(`${SHEET} .ifl-nt-all`, (b) => b.hidden), 'and Clear All hidden with none');
  same((await notes(p)).list, [], 'and the log empty');
  await p.screenshot({ path: `${OUT}/bell-empty-light.png` });
  // the visibility recount: one comes while it's shut, the page back in sight
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
  await push({ app: 'weather', title: 'Sun later', body: '', tag: 'sun', url: './' });
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  ok(!!(await until(async () => (await count(p)) === '1', 6000)), 'one more, with the page back in sight: 1', await count(p));
  same((await badges()).at(-1), 1, 'the badge 1');
  await ctx.close();
}

// ======================================================================= by day, a stack, the dots, Undo; light and dark
// (the log written as the worker keeps it, at times from the page's clock (fixed at MIDDAY.at, 12:30 on Monday 2
// November), then the page told to ask again)
const T = MIDDAY.at, M = 60e3;
const LOG = [
  { id: 'w1', app: 'weather', title: 'Rain from 15:00', body: 'Heavy at times until about 18:00', url: '/weather/', tag: 'weather:rain', at: T - 20e3, seen: false },
  { id: 'a3', app: 'chat', title: 'Ann', body: 'Here now', url: '/chats/#open=ann', tag: 'chat:msg-ann', at: T - 5 * M, seen: false },
  { id: 'a2', app: 'chat', title: 'Ann', body: 'Running a little late', url: '/chats/#open=ann', tag: 'chat:cheer-2', at: T - 40 * M, seen: true },
  { id: 'm1', app: 'markets', title: 'TSCO up 4.2%', body: 'Tesco, after its results', url: '/markets/#s=TSCO', tag: 'markets:TSCO', at: T - 88 * M, seen: true },
  { id: 'a1', app: 'chat', title: 'Ann', body: 'See you at six', url: '/chats/#open=ann', tag: 'chat:cheer-1', at: T - 120 * M, seen: true },
  { id: 'y1', app: 'weather', title: 'Sun later', body: 'Bright from about 14:00', url: '/weather/', tag: 'weather:sun', at: T - 20 * 60 * M, seen: true },
  { id: 'e1', app: 'today', title: 'Your day', body: 'Three things before lunch', url: '/', tag: 'today:today-morning', at: T - (4 * 24 + 5) * 60 * M, seen: true },
  { id: 'e2', app: 'fitness', title: 'Morning check-in', body: 'How did you sleep?', url: '/fitness/', tag: 'fitness:fitness-morning', at: T - (7 * 24 + 5) * 60 * M, seen: true },
];
const seed = (p, list) => p.evaluate((list) => new Promise((ok, no) => {
  const r = indexedDB.open('inflite-notes', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onsuccess = () => { const tx = r.result.transaction('kv', 'readwrite'); tx.objectStore('kv').put({ list, gone: [] }, 'log'); tx.oncomplete = () => { r.result.close(); ok(true); }; tx.onerror = () => no(tx.error); };
  r.onerror = () => no(r.error);
}), list);
const ids = (p) => p.$$eval(ROW, (rs) => rs.filter((r) => !r.classList.contains('gone')).map((r) => r.dataset.id));
const toastUp = (p) => until(() => p.$eval(`${SHEET} .ifl-toast.on`, (t) => { const r = t.getBoundingClientRect(), d = t.closest('dialog').getBoundingClientRect(); return r.top >= d.top && r.bottom <= Math.min(d.bottom, innerHeight) && r.width > 0 ? t.textContent : null; }), 4000);
for (const scheme of ['light', 'dark']) {
  const full = scheme === 'light';
  const { ctx, p } = await open({ scheme });
  await seed(p, LOG);
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  ok(!!(await until(async () => (await count(p)) === '2', 6000)), `${scheme}: a log of eight, two unseen: the bell says 2`, await count(p));
  await p.click(BELL);
  await p.waitForSelector(ROW);
  await p.waitForTimeout(500);
  same(await p.$$eval(`${SHEET} .ifl-nt-h`, (xs) => xs.map((x) => x.textContent)), ['Today', 'Yesterday', 'Earlier'], `${scheme}: by day: Today, Yesterday, Earlier`);
  if (full) {
    same(await p.$$eval(`${SHEET} .ifl-nt-h`, (xs) => getComputedStyle(xs[0]).textTransform), 'uppercase', 'the days’ labels small capitals, as Today’s are');
    same(await ids(p), ['w1', 'a3', 'm1', 'y1', 'e1', 'e2'], 'Ann’s three today one row, the newest');
    same(await rows(p).then((r) => r.map((x) => x[3])), ['Now', '5m', '11:02', 'Yesterday', 'Thu', '26 Oct'], 'the times: Now, 5m, the clock, Yesterday, the day, the date');
    same(await p.$$eval(`${ROW} .ifl-nt-app`, (xs) => xs.map((x) => x.textContent)), ['Weather', 'Chat', 'Markets', 'Weather', 'Today', 'Fitness'], 'each by its app’s name');
    same(await p.$$eval(ROW, (rs) => rs.map((r) => r.dataset.fresh ? [r.dataset.id, getComputedStyle(r.querySelector('.ifl-nt-main'), '::before').width, getComputedStyle(r.querySelector('.ifl-nt-t')).fontWeight] : null).filter(Boolean)), [['w1', '7px', '700'], ['a3', '7px', '700']], 'a dot, and a bolder title, on the two unseen as it opened');
    same(await p.$eval(`${ROW}[data-id=a3] .ifl-nt-main`, (b) => b.getAttribute('aria-label')), 'New. Ann. Here now. Chat, 5 minutes ago. 2 more', 'the stack’s row, said');
    same(await p.$eval(`${ROW}[data-id=a3] .ifl-nt-more`, (b) => [b.textContent, b.getAttribute('aria-label'), b.getAttribute('aria-expanded')]), ['+2', '2 more', 'false'], 'its count: +2, a button, shut');
    const tall = await p.$eval(SHEET, (d) => [Math.round(d.getBoundingClientRect().height), d.querySelector('.ifs-body').scrollHeight > d.querySelector('.ifs-body').clientHeight + 10]);
    ok(tall[0] <= Math.round(844 * 0.78) + 1 && tall[0] > 844 * 0.6 && tall[1], 'many: the sheet most of the screen, its list scrolling', JSON.stringify(tall));
    await p.evaluate(AXE);
    const axe = await p.evaluate(async () => (await window.axe.run(document.querySelector('dialog[data-sheet=notifications]'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] }, resultTypes: ['violations'] })).violations.map((v) => `${v.id} ×${v.nodes.length}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ').slice(0, 160)}`));
    same(axe, [], 'by day, with a stack: axe clean');
  }
  await p.screenshot({ path: `${OUT}/bell2-sections-${scheme}.png` });
  // the stack opened out by its count, by the keyboard, and shut again
  await p.focus(`${ROW}[data-id=a3] .ifl-nt-more`);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(350);
  same((await ids(p)).slice(0, 5), ['w1', 'a3', 'a2', 'a1', 'm1'], `${scheme}: opened out: a row each`);
  same(await p.evaluate(() => [document.activeElement?.className, document.activeElement?.getAttribute('aria-expanded')]), ['ifl-nt-more', 'true'], `${scheme}: the focus kept on its count, now open`);
  await p.screenshot({ path: `${OUT}/bell2-stack-open-${scheme}.png` });
  await p.keyboard.press('Enter');
  await p.waitForTimeout(300);
  same((await ids(p)).length, 6, `${scheme}: and shut again`);
  if (full) {
    // the stack swiped away: all three, out of the log; the toast in the sheet, and Undo puts them back
    await drag(p, `${ROW}[data-id=a3] .ifl-nt-card`, -260);
    await p.waitForTimeout(600);
    same(await ids(p), ['w1', 'm1', 'y1', 'e1', 'e2'], 'the stack swiped away: all three');
    ok(!(await notes(p)).list.some((n) => n.app === 'chat'), 'and out of the log');
    same(await toastUp(p), '3 clearedUndo', 'the toast, in the sheet, in sight: “3 cleared”, Undo');
    same(await p.$eval(`${SHEET} p.vh[role=status]`, (x) => x.textContent), '3 cleared', 'and said');
    await p.screenshot({ path: `${OUT}/bell2-undo-light.png` });
    await p.click(`${SHEET} .ifl-toast-act`);
    await p.waitForTimeout(500);
    same(await ids(p), ['w1', 'a3', 'm1', 'y1', 'e1', 'e2'], 'Undo: back, as a stack');
    same(await p.evaluate(() => document.activeElement?.closest('.ifl-nt-row')?.dataset.id), 'a3', 'the focus on it');
    const log = await notes(p);
    same(log.list.filter((n) => n.app === 'chat').map((n) => [n.id, n.seen]), [['a3', true], ['a2', true], ['a1', true]], 'and in the log again, seen');
    same(log.unread, 0, 'no count for them');
    // one cleared by its button, then Clear All, each with Undo
    await p.focus(`${ROW}[data-id=m1] .ifl-nt-x`);
    await p.keyboard.press('Enter');
    await p.waitForTimeout(500);
    same(await toastUp(p), 'ClearedUndo', 'one cleared: “Cleared”, Undo');
    await p.click(`${SHEET} .ifl-nt-all`);
    await p.waitForSelector(`${SHEET} .ifl-nt-none`);
    same(await toastUp(p), '8 clearedUndo', 'then Clear All: the toast takes them all: “8 cleared”');
    await p.click(`${SHEET} .ifl-toast-act`);
    await p.waitForTimeout(500);
    same(await ids(p), ['w1', 'a3', 'm1', 'y1', 'e1', 'e2'], 'Undo: every one back');
    same((await notes(p)).list.length, 8, 'and in the log');
    // the dots, for that showing only
    await p.keyboard.press('Escape');
    await p.waitForTimeout(400);
    await p.click(BELL);
    await p.waitForSelector(ROW);
    same(await p.$$eval(ROW, (rs) => rs.filter((r) => r.dataset.fresh).length), 0, 'opened again: no dots');
  }
  // empty, then Notification Settings at its foot
  await p.click(`${SHEET} .ifl-nt-all`);
  await p.waitForSelector(`${SHEET} .ifl-nt-none`);
  await p.waitForTimeout(6500);
  await p.screenshot({ path: `${OUT}/bell2-empty-${scheme}.png` });
  if (full) {
    same(await p.$eval(`${SHEET} .ifl-nt-set`, (b) => [b.textContent, b.tagName]), ['Notification Settings', 'BUTTON'], 'at its foot: Notification Settings, a button');
    await p.click(`${SHEET} .ifl-nt-set`);
    const went = await until(() => p.evaluate(() => !document.getElementById('you').hidden && location.hash.startsWith('#you')), 6000);
    ok(!!went, 'Notification Settings: You, at its notifications', p.url());
    ok(!(await p.$(SHEET)), 'and the sheet shut');
  }
  await ctx.close();
}

// ======================================================================= reduced motion, a swipe right, Delete; and a computer
{
  const { ctx, p, push } = await open({ reduced: true });
  for (const d of THREE) await push(d);
  await p.click(BELL);
  await p.waitForSelector(ROW);
  await drag(p, `${ROW}:nth-child(1) .ifl-nt-card`, 260);
  await p.waitForTimeout(150);
  same((await rows(p)).map((r) => r[1]), ['Ann', 'Rain from 15:00'], 'reduced motion: swiped right, gone at once');
  await p.focus(`${ROW}:nth-child(1) .ifl-nt-main`);
  await p.keyboard.press('Delete');
  await p.waitForTimeout(150);
  same((await rows(p)).map((r) => r[1]), ['Rain from 15:00'], 'Delete on a row clears it');
  await p.click(`${SHEET} .ifl-toast-act`);
  await p.waitForTimeout(150);
  same((await rows(p)).map((r) => r[1]), ['TSCO up 4.2%', 'Ann', 'Rain from 15:00'], 'reduced motion: Undo, both back at once (cleared within its few seconds, one Undo)');
  await ctx.close();
}
{
  const { ctx, p, push } = await open({ w: 1280, h: 800, scheme: 'dark' });
  for (const d of THREE) await push(d);
  await until(async () => (await count(p)) === '3', 6000);
  await p.click(BELL);
  await p.waitForSelector(ROW);
  await p.waitForTimeout(450);
  const r = await p.$eval(SHEET, (d) => { const x = d.getBoundingClientRect(); return [Math.round(x.width), Math.round(x.left), Math.round(innerWidth - x.right)]; });
  ok(r[0] <= 560 && Math.abs(r[1] - r[2]) <= 1, '1280 wide: the sheet in the middle, no wider than 560', JSON.stringify(r));
  await p.hover(`${ROW}:nth-child(1)`);
  await p.waitForTimeout(300);
  ok(await p.$eval(`${ROW}:nth-child(1) .ifl-nt-x`, (x) => getComputedStyle(x).opacity === '1'), 'with a pointer that hovers, Clear shows on the row');
  await p.screenshot({ path: `${OUT}/bell-sheet-1280-dark.png` });
  await ctx.close();
}

same(errs, [], 'no CSP violation and no console error');
await b.close();
stop();
console.log(`FAILS ${fails}`);
process.exit(fails ? 1 : 0);
