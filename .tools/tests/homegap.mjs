// The screen's foot on an iPhone's Home Screen (the shared menu's --fix-gap, .tools/inflite/menu.js fitScreen): iOS can
// lay a Home Screen app's page out shorter than the screen, and what's fixed to its foot then stopped short, a band of
// the page's flat colour under the tab bar (inflite.ai's Apps and Chats, 5 November). Here, in Chromium, an iPhone's
// Home Screen stood in for (navigator.standalone, the screen 60 px taller than the window, a status bar's inset at the
// top): the gap's measured, and Today's sky, its tab bar and its sheet reach the screen's own foot. And in a browser tab,
// nothing moves.
//   node .tools/tests/homegap.mjs   (starts the stand-in account and the inflite repo's Worker, as roofshell.mjs does)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const HERE = new URL('./', import.meta.url).pathname;
const IFL = process.env.IFL_ROOT || new URL('../../../inflite/', import.meta.url).pathname;
const BASE = 'http://localhost:8787', STUB = 'http://127.0.0.1:8789';
let fails = 0;
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${!c && extra ? '  — ' + extra : ''}`); if (!c) fails++; };

const stub = spawn(process.execPath, [`${HERE}mocks/todaystub.mjs`, '8789'], { stdio: ['ignore', 'ignore', 'inherit'] });
const wbin = [`${IFL}node_modules/.bin/wrangler`, `${HERE}node_modules/.bin/wrangler`].find((f) => existsSync(f));
let wlog = '';
const wr = spawn(wbin, ['dev', '--port', '8787', '--var', 'ACCOUNT_ORIGIN:http://127.0.0.1:8789'], { cwd: IFL, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
wr.stdout.on('data', (d) => (wlog += d)); wr.stderr.on('data', (d) => (wlog += d));
let stopped = false;
const stop = () => { if (stopped) return; stopped = true; try { process.kill(-wr.pid, 'SIGTERM'); } catch {} try { stub.kill(); } catch {} };
process.on('exit', stop);
const up = async (u) => { for (let i = 0; i < 90; i++) { try { if ((await fetch(u)).ok) return true; } catch {} await new Promise((r) => setTimeout(r, 1000)); } return false; };
if (!(await up(`${STUB}/__log`)) || !(await up(`${BASE}/version`))) { console.log(wlog.slice(-2000)); ok(false, 'the stub and the site’s Worker start'); console.log(`FAILS ${fails}`); stop(); process.exit(1); }

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined) });
const W = 390, SCREEN = 844, SHORT = 784, GAP = SCREEN - SHORT;
async function look(homeScreen) {
  const ctx = await b.newContext({ viewport: { width: W, height: SHORT }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, colorScheme: 'dark',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  if (homeScreen) await ctx.addInitScript(({ w, h }) => {
    Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true });
    Object.defineProperty(Screen.prototype, 'width', { get: () => w, configurable: true });
    Object.defineProperty(Screen.prototype, 'height', { get: () => h, configurable: true });
  }, { w: W, h: SCREEN });
  const p = await ctx.newPage();
  // (the status bar's inset at the top: a Home Screen page runs up behind it)
  if (homeScreen) { const s = await ctx.newCDPSession(p); await s.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 47, bottom: 34 } }).catch((e) => console.log('(no safe-area override:', e.message, ')')); }
  await p.goto(`${BASE}/`, { waitUntil: 'load' });
  await p.waitForTimeout(800);
  const got = await p.evaluate(() => {
    const css = getComputedStyle(document.documentElement).getPropertyValue('--fix-gap').trim();
    const sky = document.querySelector('.sky')?.getBoundingClientRect();
    // (the tab bar and a sheet, as the hub's styles place them: stand-ins, so no sign-in is needed)
    const t = document.createElement('nav'); t.className = 'ifl-tabs'; document.body.append(t);
    const d = document.createElement('dialog'); d.className = 'ifl-sheet'; document.body.append(d);
    const tabsFoot = t.getBoundingClientRect().bottom, sheetBottom = getComputedStyle(d).bottom;
    const inset = (() => { const q = document.createElement('div'); q.style.cssText = 'position:fixed;bottom:0;height:env(safe-area-inset-bottom,0px)'; document.body.append(q); const v = q.offsetHeight; q.remove(); return v; })();
    t.remove(); d.remove();
    return { css, skyBottom: sky ? Math.round(sky.bottom) : null, tabsFoot: Math.round(tabsFoot), sheetBottom, inset, ih: innerHeight };
  });
  await ctx.close();
  return got;
}

const home = await look(true);
ok(home.css === `${GAP}px`, `on the Home Screen, laid out ${GAP} px short: the gap's measured`, JSON.stringify(home));
ok(home.skyBottom === SCREEN, 'the sky reaches the screen’s own foot, not the page’s', JSON.stringify(home));
ok(home.tabsFoot === SCREEN - 10 - home.inset, 'the tab bar sits as far above the screen’s foot as it should above the page’s', JSON.stringify(home));
ok(home.sheetBottom === `${-GAP}px`, 'a sheet runs to the screen’s foot', JSON.stringify(home));

const tab = await look(false);
ok(tab.css === '0px' || tab.css === '', 'in a browser tab: no gap', JSON.stringify(tab));
ok(tab.skyBottom === SHORT && tab.tabsFoot === SHORT - 10 - tab.inset, 'and nothing moved', JSON.stringify(tab));

await b.close(); stop();
console.log(`FAILS ${fails}`);
process.exit(fails ? 1 : 0);
