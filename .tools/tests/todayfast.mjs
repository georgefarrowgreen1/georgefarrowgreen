// Today, quick to open (its root worker, today/public/sw.js; its way in, load() in today/public/app.js; the shared menu's
// VITALS), end to end in real Chromium: the inflite repo's Today Worker on :8787 against the stand-in account
// (mocks/todaystub.mjs on :8789), at the hub with the roof on (/api/hub stood in for).
//   a the way in in one trip: signed in here before, opening asks the account once (today/boot: who and the day), never
//     today/me or today/cards apart; the day drawn from it. Signed in for the first time here: today/me, then the day
//   b an account from before today/boot (the stand-in's v1: 404): who and the day asked apart, as before; the day drawn
//   c opened again with the root worker in charge: the page and its files from what it keeps, none fetched; the
//     updater's renew fetches every one of them again, past the browser's copy, and says renewed
//   d how fast it was, sent as the page is left (a beacon to /api/vitals: the app (Today's own name for itself, today),
//     phone or computer, and numbers only)
//     and passed on to the account by Today's Worker (POST /api/account/today/../vitals: /api/account/vitals)
//   node .tools/tests/todayfast.mjs [state dir] [screenshots dir]     (or ./run.sh todayfast)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HERE = new URL('./', import.meta.url).pathname;
const IFL = process.env.IFL_ROOT || new URL('../../../inflite/', import.meta.url).pathname;
const OUT = process.argv[3] || `${tmpdir()}/todayfast`;
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:8787', STUB = 'http://127.0.0.1:8789';
let fails = 0;
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${!c && extra ? '  — ' + extra : ''}`); if (!c) fails++; };
if (!existsSync(`${IFL}today/public/roof/router.js`)) { console.log('SKIP  the inflite repo (with its roof) isn’t beside this one'); console.log('FAILS 0'); process.exit(0); }

const MORNING = JSON.parse(readFileSync(new URL('./mocks/today/cards.morning.json', import.meta.url), 'utf8'));
const SESSION = 'stubsession0123456789abcdefABCDEF';

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
if (!(await up(`${STUB}/__log`)) || !(await up(`${BASE}/version`))) { console.log(wlog.slice(-2000)); ok(false, 'the stub and Today’s Worker start'); console.log(`FAILS ${fails}`); stop(); process.exit(1); }
const ctl = (path, body) => fetch(STUB + path, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }).then((r) => r.json());
const reqs = () => ctl('/__log');
const reset = () => ctl('/__reset', {});
const asked = async () => (await reqs()).filter((e) => e.path.startsWith('/api/account/')).map((e) => `${e.method} ${e.path.replace('/api/account/', '')}`);

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined) });
const errs = [];
async function context({ workers = false, clock = true } = {}) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, locale: 'en-GB', timezoneId: 'Europe/London', serviceWorkers: workers ? 'allow' : 'block' });
  await ctx.addCookies([{ name: 'account', value: SESSION, url: BASE }]);
  // (the page's clock at the morning's moment; not where the page's own timing is checked: a faked clock hides it)
  if (clock) await ctx.clock.install({ time: new Date(MORNING.at) });
  await ctx.route((u) => new URL(u).pathname === '/api/hub', (r) => r.fulfill({ json: { ready: true, roof: true }, headers: { 'Cache-Control': 'no-store' } }));
  await ctx.route((u) => new URL(u).pathname.startsWith('/chats/'), (r) => r.fulfill({ body: '<!doctype html><title>Chats</title>', contentType: 'text/html' }));
  await ctx.route((u) => /^\/weather\/.+/.test(new URL(u).pathname), (r) => r.fulfill({ status: 404, body: 'Not found', contentType: 'text/plain' }));
  return ctx;
}
// (Weather's module files aren't served by this stack: the root worker's own fetches of them, which no route can stand
// in for, answer 503, as the console says; anything else's is an error)
const watch = (p, tag) => {
  const bad = [];
  p.on('response', (r) => { if (r.status() >= 500) { console.log(`(${tag}: ${r.status()} ${r.url()})`); if (!/\/weather\//.test(r.url())) bad.push(r.url()); } });
  p.on('pageerror', (e) => errs.push(`${tag}: pageerror: ${e.message}`));
  p.on('console', (m) => {
    if (m.type() !== 'error' || /Failed to load resource: the server responded with a status of (40[134]|50[12])/.test(m.text())) return;
    if (/status of 503/.test(m.text()) && !bad.length) return;
    errs.push(`${tag}: ${m.text()}`);
  });
};
const drawn = (p) => p.waitForSelector('#today[data-phase] #top .day-top', { timeout: 15000 }).then(() => true, () => false);
async function part(name, fn) { try { await fn(); } catch (e) { ok(false, name, e.stack?.split('\n').slice(0, 3).join(' | ')); } }

await part('a. the way in in one trip', async () => {
  await ctl('/__mode', { phase: 'morning' }); await reset();
  const ctx = await context(), p = await ctx.newPage(); watch(p, 'a');
  await p.goto(BASE + '/');
  ok(await drawn(p), 'a. first time here: the day drawn');
  let a = await asked();
  ok(a.includes('GET today/me') && a.includes('GET today/cards') && !a.includes('GET today/boot'), 'a. first time here (nothing kept): who, then the day, as before', a.join(', '));
  await p.waitForTimeout(500);
  await reset();
  await p.goto(BASE + '/');
  ok(await drawn(p), 'a. opened again: the day drawn');
  await p.waitForTimeout(800);
  a = await asked();
  ok(a.filter((x) => x === 'GET today/boot').length === 1, 'a. opened again: the account asked once, for who and the day together (today/boot)', a.join(', '));
  ok(!a.includes('GET today/me') && !a.includes('GET today/cards'), 'a. … and never today/me or today/cards apart', a.join(', '));
  const boot = (await reqs()).find((e) => e.path.endsWith('/today/boot'));
  ok(boot?.query?.v === '2' && boot?.query?.with === 'morning', 'a. today/boot asked for version 2, with the morning', JSON.stringify(boot?.query));
  ok(await p.$eval('#today #top .day-top', (e) => e.textContent.trim().length > 0).catch(() => false), 'a. the day’s top card has words in it (from the boot answer)');
  await ctx.close();
});

await part('b. an account from before today/boot', async () => {
  await ctl('/__mode', { phase: 'morning', v1: true }); await reset();
  const ctx = await context(), p = await ctx.newPage(); watch(p, 'b');
  await p.goto(BASE + '/'); await drawn(p);
  await p.waitForTimeout(500); await reset();
  await p.goto(BASE + '/');
  ok(await p.waitForSelector('#in:not([hidden]) .tcard', { timeout: 15000 }).then(() => true, () => false), 'b. opened again: the day drawn (an account from before Today First: its cards)');
  await p.waitForTimeout(800);
  const a = await asked();
  ok(a.includes('GET today/boot') && a.includes('GET today/me') && a.includes('GET today/cards'), 'b. today/boot not there (404): who and the day asked apart, as before', a.join(', '));
  ok(!(await p.isVisible('#out')), 'b. never shown as signed out');
  await ctx.close();
});

await part('c. opened from what the root worker keeps; renewed by the updater', async () => {
  await ctl('/__mode', { phase: 'morning' }); await reset();
  const ctx = await context({ workers: true }), p = await ctx.newPage(); watch(p, 'c');
  // (each of Today's own files as it reached the page, and whether the worker answered it)
  const SHELL = ['/app.js', '/cards.js', '/app.css', '/day.css', '/roof/frame.js', '/roof/router.js'], seen = new Map();
  p.on('response', (r) => { const u = new URL(r.url()); if (u.origin === BASE && SHELL.includes(u.pathname)) seen.set(u.pathname, r.fromServiceWorker()); });
  await p.goto(BASE + '/'); await drawn(p);
  const controlled = await p.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 15000 }).then(() => true, () => false);
  ok(controlled, 'c. the root worker in charge of the page');
  // (its files all kept, as it installs or as the page asks for them)
  await p.waitForFunction(async () => { const c = await caches.open('today-app-4'); return !!(await c.match('/')) && !!(await c.match('/app.js')) && !!(await c.match('/roof/frame.js')); }, null, { timeout: 15000 }).catch(() => {});
  seen.clear();
  // (by way of another page: the same address typed again is a reload to Chrome, which goes past what's kept on purpose)
  await p.goto('about:blank');
  const t0 = Date.now();
  const doc = await p.goto(BASE + '/');
  ok(await drawn(p), 'c. opened again: the day drawn');
  const fromNet = SHELL.filter((f) => seen.get(f) !== true);
  ok(fromNet.length === 0, 'c. its files from what the worker keeps, every one', `not from the worker: ${fromNet.map((f) => `${f} (${seen.has(f) ? 'network' : 'not asked'})`).join(', ')}`);
  ok(doc?.fromServiceWorker() === true, 'c. the page itself answered by the root worker');
  console.log(`(c: opened again in ${Date.now() - t0} ms)`);
  // (the updater, before it loads a new Today: { ifl: "renew" }, as IFL.updates sends it). Each kept copy's Date, before
  // and after: every one fetched again (the worker's own fetches aren't Playwright's to see)
  const files = [...(/const FILES = (\[[\s\S]*?\]);/.exec(readFileSync(`${IFL}today/public/sw.js`, 'utf8'))?.[1] || '').matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const dates = () => p.evaluate(async (fs) => { const c = await caches.open('today-app-4'); const o = {}; for (const f of fs) o[f] = (await c.match(f))?.headers.get('date') || null; return o; }, files);
  const before = await dates();
  await p.waitForTimeout(1100);
  const renewed = await p.evaluate(() => new Promise((ok) => { const ch = new MessageChannel(); ch.port1.onmessage = (e) => ok(e.data); navigator.serviceWorker.controller.postMessage({ ifl: 'renew' }, [ch.port2]); setTimeout(() => ok(null), 12000); }));
  ok(renewed?.ifl === 'renewed', 'c. renew: the worker says renewed', JSON.stringify(renewed));
  const after = await dates();
  const stale = files.filter((f) => !after[f] || after[f] === before[f]);
  ok(files.length > 20 && stale.length === 0, `c. renew: every one of Today’s ${files.length} files fetched again and kept afresh`, `not renewed: ${stale.join(', ')}`);
  await ctx.close();
});

await part('d. how fast it was, sent as the page is left', async () => {
  await ctl('/__mode', { phase: 'morning' }); await reset();
  const ctx = await context({ clock: false }), p = await ctx.newPage(); watch(p, 'd');
  await p.goto(BASE + '/'); await drawn(p);
  await p.waitForTimeout(600);
  const beacon = p.waitForRequest((r) => new URL(r.url()).pathname === '/api/vitals', { timeout: 8000 }).catch(() => null);
  await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  const r = await beacon;
  let body = null; try { body = JSON.parse(r?.postData() || 'null'); } catch {}
  ok(!!r && r.method() === 'POST', 'd. a beacon to /api/vitals as the page goes out of sight');
  ok(body?.app === 'today' && body?.dev === 'computer' && typeof body?.m?.fcp === 'number' && typeof body?.m?.ttfb === 'number', 'd. the app (Today), the kind of device, and the numbers', JSON.stringify(body));
  ok(body && Object.keys(body).sort().join() === 'app,dev,m' && Object.keys(body.m).every((k) => ['ttfb', 'fcp', 'lcp', 'inp', 'cls'].includes(k)), 'd. nothing else: no account, page or address', JSON.stringify(body));
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await p.waitForTimeout(1500);
  const passed = (await reqs()).filter((e) => e.method === 'POST' && e.path === '/api/account/vitals');
  ok(passed.length === 1, 'd. passed on to the account by Today’s Worker, once', `${passed.length} passed on`);
  ok(passed[0] && JSON.parse(passed[0].body || '{}').app === 'today', 'd. as the page sent it', passed[0]?.body);
  await ctx.close();
});

ok(errs.length === 0, 'no console error or page error', errs.join(' | '));
await b.close(); stop();
console.log(`FAILS ${fails}`);
process.exit(fails ? 1 : 0);
