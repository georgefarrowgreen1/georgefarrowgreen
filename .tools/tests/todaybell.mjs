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
  same((await badges()).at(-1), 3, `${scheme}: and the Home Screen badge 3`);
  await p.screenshot({ path: `${OUT}/bell-header-${scheme}.png`, clip: { x: 0, y: 0, width: 390, height: 150 } });
  await p.screenshot({ path: `${OUT}/bell-today-${scheme}.png` });
  // the sheet
  await p.click(BELL);
  await p.waitForSelector(ROW);
  await p.waitForTimeout(450);
  const three = await rows(p);
  same(three.map((r) => r.slice(0, 3)), THREE.slice().reverse().map((d) => [d.app, d.title, d.body]), `${scheme}: the sheet: newest first, each app’s icon, title and body`);
  ok(three.every((r) => /^\d\d:\d\d$/.test(r[3])), `${scheme}: each with its time`, JSON.stringify(three.map((r) => r[3])));
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
  same(await p.$eval(`${SHEET} .ifs-body`, (b) => b.textContent.trim()), 'No notifications', 'Clear All: “No notifications”');
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
