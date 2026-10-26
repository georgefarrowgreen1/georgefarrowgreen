// Fitness with a lot of rides: an account with 2,000 of them (written straight into the database: the upload limit
// would take hours), and how long the app takes to open, draw Today again, look at another day, and open Activities
// and Progress, on a phone's speed (the CPU slowed four times). Not a test: numbers, to compare before and after.
// Writes .state/out/perf/perf.json; PERF_N for another count.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { demo, samples, PROFILE } from '../../fitness/sample.js';
import { summarise } from '../../fitness/load.js';
import { routeShape } from '../../fitness/formats.js';
import { joinInFlight } from './join.mjs';
const [,, S, out] = process.argv;
const N = Number(process.env.PERF_N) || 2000;
const CHAT = 'http://chat.gfg.test:8788', FIT = 'http://fitness.gfg.test:8788', ACCT = 'http://account.gfg.test:8788';

// (rides as the phone would have summed them: a few made up, worked out, then varied)
const D = demo(Date.now()), tpl = D.history.filter((h) => h.sport === 'ride').slice(0, 6).map((h) => { const x = samples(h); return { s: summarise(x, PROFILE), route: routeShape(x.s), indoor: !!h.indoor }; });
const day = 86400e3, today = Math.floor(Date.now() / day) * day;
const rows = Array.from({ length: N }, (_, i) => {
  const t = tpl[i % tpl.length], k = 0.75 + ((i * 37) % 50) / 100, start = today - Math.floor(i * 1.1 + 1) * day + 9 * 3600e3;
  const sum = { ...t.s, moving: Math.round(t.s.moving * k), secs: Math.round(t.s.secs * k), dist: Math.round((t.s.dist || 0) * k), tss: Math.round((t.s.tss || 0) * k), route: t.route, xv: 3 };
  return { id: `p${i}`, start, sport: 'ride', indoor: t.indoor ? 1 : 0, name: `Ride ${i}`, device: 'Garmin Edge 840', file: `p${i}.fit`, type: 'fit', size: 200000, sum: JSON.stringify(sum) };
});

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--host-resolver-rules=MAP *.gfg.test 127.0.0.1, MAP gfg.test 127.0.0.1', `--unsafely-treat-insecure-origin-as-secure=${CHAT},${FIT},${ACCT}`] });
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const c = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-GB', isMobile: true, hasTouch: true, userAgent: UA, reducedMotion: 'reduce' });
await c.addInitScript(() => { try { const d = new Date(); d.setHours(0, 0, 0, 0); localStorage.setItem('fitness:asked', String(d.getTime())); localStorage.setItem('fitness:welcomed', 'true'); } catch (_) {} });
const p = await c.newPage(), errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.text().startsWith('TIME ') && process.env.PERF_TRACE) console.log(m.text()); });
await joinInFlight(p, `${CHAT}/`, { name: 'Sam Taylor', handle: 'sam', email: 'sam@example.com', password: 'a long test password', city: 'London' });
await p.goto(`${FIT}/`); await p.waitForSelector('.head .round.me', { timeout: 20000 });
// (Rhythm on, so Today is as full as it gets: kept, and the page reloaded with it, till it's there)
let me;
for (let k = 0; k < 4; k++) {
  me = await p.evaluate(async () => (await fetch('/api/fitness/me')).json());
  if (me.data?.rhythm) break;
  const st = await p.evaluate(async ({ ver, data }) => { const d = new Date(); d.setHours(0, 0, 0, 0); data = data || { profile: {}, plan: null, rhythm: null, swaps: {}, feel: {}, workouts: [], prefs: {} };
    data.rhythm = { days: [0, 60, 75, 60, 0, 150, 90], lean: 'balanced', mode: 'build', at: d.getTime() - 28 * 864e5, level: 'regular' };
    return (await fetch('/api/fitness/me', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base: ver, data }) })).status; }, me);
  console.log('rhythm put', st);
  await p.reload(); await p.waitForSelector('.head .round.me'); await p.waitForTimeout(1500);
}
console.log('rhythm on:', !!me.data?.rhythm);
// (the rides, into the database the server's running on)
const dir = `${S}/wrstate/v3/d1/miniflare-D1DatabaseObject`, db = `${dir}/${readdirSync(dir).find((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite')}`;
const rowsFile = `${out}/rows.json`; writeFileSync(rowsFile, JSON.stringify(rows));
execFileSync('python3', ['-c', `
import json, sqlite3, sys
con = sqlite3.connect(sys.argv[1]); rows = json.load(open(sys.argv[2])); uid = sys.argv[3]; now = ${Date.now()}
con.executemany("INSERT OR IGNORE INTO fx_acts (user_id, id, start, sport, indoor, name, device, file, type, size, sum, added, gz) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0)",
  [(uid, r['id'], r['start'], r['sport'], r['indoor'], r['name'], r['device'], r['file'], r['type'], r['size'], r['sum'], now) for r in rows])
con.commit(); print(con.execute("SELECT COUNT(*) FROM fx_acts WHERE user_id = ?", (uid,)).fetchone()[0])`, db, rowsFile, me.id], { stdio: 'inherit' });

const cdp = await c.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.PERF_CPU) || 4 });
const settle = () => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const timed = (fn) => p.evaluate(async (src) => { const t = performance.now(); new Function(src)(); await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))); return Math.round(performance.now() - t); }, fn).catch(() => null);
const med = (xs) => { const v = xs.filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[v.length >> 1] : null; };
const runs = [];
for (let r = 0; r < 3; r++) {
  let meBytes = 0; const onResp = async (res) => { if (res.url().includes('/api/fitness/me') && res.request().method() === 'GET') meBytes = (await res.body().catch(() => Buffer.alloc(0))).length; };
  p.on('response', onResp);
  await p.evaluate(() => { location.hash = '#today'; }); const t0 = Date.now(); await p.reload(); await p.waitForSelector('.strip-days .sday', { timeout: 600000 }).catch(async (e) => { await p.screenshot({ path: `${out}/stuck.png` }); console.log('stuck; errors: ' + errs.join(' | ')); throw e; }); await settle(); const open = Date.now() - t0; await p.waitForSelector('body[data-fresh]', { state: 'attached', timeout: 120000 }); const fresh = Date.now() - t0;
  p.off('response', onResp);
  await p.waitForTimeout(1500);
  // (each by a click, timed to the next frame: a redraw of Today, another day, Activities, Progress, back to Today)
  const clk = (sel) => `document.querySelector(${JSON.stringify(sel)}).click()`;
  const redraw = await timed(clk('.strip-all')); await settle();
  const dayPick = await timed(clk('.strip-days .sday:nth-child(5)')); await settle();
  const acts = await timed(clk('.tab:nth-child(2)')); await settle(); await p.waitForTimeout(500);
  const shown = await p.evaluate(() => document.querySelectorAll('main .row').length);
  const prog = await timed(clk('.tab:nth-child(3)')); await settle(); await p.waitForTimeout(500);
  const back = await timed(clk('.tab:nth-child(1)')); await settle();
  const heap = await p.evaluate(() => performance.memory?.usedJSHeapSize || 0);
  runs.push({ open, fresh, meKB: Math.round(meBytes / 1024), redraw, dayPick, acts, prog, back, heapMB: Math.round(heap / 1048576), rows: shown });
}
const res = { rides: N, open: med(runs.map((r) => r.open)), fresh: med(runs.map((r) => r.fresh)), meKB: runs[0].meKB, meKBthen: runs.at(-1).meKB, redrawToday: med(runs.map((r) => r.redraw)), pickDay: med(runs.map((r) => r.dayPick)),
  openActivities: med(runs.map((r) => r.acts)), activityRows: runs.at(-1).rows, openProgress: med(runs.map((r) => r.prog)), backToToday: med(runs.map((r) => r.back)), heapMB: med(runs.map((r) => r.heapMB)) };
writeFileSync(`${out}/perf.json`, JSON.stringify({ res, runs }, null, 1));
console.log(JSON.stringify(res)); console.log('page errors: ' + errs.slice(0, 3).join(' | ')); console.log('FAILS 0'); await b.close();
