// Today on a computer (the desktop layout, from 1100 px wide), end to end in real Chromium: the inflite repo's Today
// Worker run by wrangler dev on :8787 against the stand-in account (mocks/todaystub.mjs on :8789), at the hub with the
// roof on (/api/hub stood in for), the page's clock at the morning fixture's moment (Monday 2 November 2026, London).
// Checked: the tab bar is a rail down the left (Today, Chats, Apps, You, then your apps, then you at its foot), the page
// beside it, never under it; Today's top card across the top, its four cards in two columns, and Waiting for You and
// Coming Up in a column of their own on the right, Coming Up as a timeline with Now on it; keys 1–4 switch Today,
// Chats, Apps and You, "/" opens search; You as two panes (its sections on the left, the one you're on beside them);
// at 820 and 390 wide, the phone's layout as it was (the tab bar at the foot, one column). No console error, CSP
// violation or sideways scroll anywhere.
//   node .tools/tests/todaydesk.mjs [state dir] [screenshots dir]     (or ./run.sh todaydesk)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HERE = new URL('./', import.meta.url).pathname;
const IFL = process.env.IFL_ROOT || new URL('../../../inflite/', import.meta.url).pathname;
const OUT = process.argv[3] || `${tmpdir()}/todaydesk`;
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:8787', STUB = 'http://127.0.0.1:8789';
let fails = 0;
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${!c && extra ? '  — ' + extra : ''}`); if (!c) fails++; };
const same = (a, b, l) => ok(JSON.stringify(a) === JSON.stringify(b), l, `got ${JSON.stringify(a)?.slice(0, 400)}, wanted ${JSON.stringify(b)?.slice(0, 400)}`);
if (!existsSync(`${IFL}today/public/roof/router.js`)) { console.log('SKIP  the inflite repo (with its roof) isn’t beside this one'); console.log('FAILS 0'); process.exit(0); }

const FIX = (p) => JSON.parse(readFileSync(new URL(`./mocks/today/cards.${p}.json`, import.meta.url), 'utf8'));
const MORNING = FIX('morning');
const SESSION = 'stubsession0123456789abcdefABCDEF';

// ---- the stand-in account and Today's Worker ----
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

// ---- the browser ----
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined) });
const errs = [];
async function open({ w = 1440, h = 900, scheme = 'light', path = '/', label = '' } = {}) {
  await ctl('/__mode', { phase: 'morning' });
  const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, locale: 'en-GB', timezoneId: 'Europe/London', serviceWorkers: 'block' });
  await ctx.addCookies([{ name: 'account', value: SESSION, url: BASE }]);
  await ctx.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`)));
  await ctx.clock.install({ time: new Date(MORNING.at) });
  const p = await ctx.newPage();
  const tag = label || `${w} ${scheme}`;
  p.on('pageerror', (e) => errs.push(`${tag}: pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource: the server responded with a status of (40[14]|50[12])/.test(m.text())) errs.push(`${tag}: ${m.text()}`); });
  p.on('response', (r) => { if (r.status() >= 500) console.log(`(${tag}: ${r.status()} ${r.url()})`); });
  await p.route((u) => new URL(u).pathname === '/api/hub', (r) => r.fulfill({ json: { ready: true, roof: true }, headers: { 'Cache-Control': 'no-store' } }));
  await p.route((u) => new URL(u).pathname.startsWith('/chats/'), (r) => r.fulfill({ body: '<!doctype html><title>Chats</title>', contentType: 'text/html' }));
  // (Weather's module files aren't served by this stack: stood in for as missing, as todayphases.mjs does)
  await p.route((u) => /^\/weather\/.+/.test(new URL(u).pathname), (r) => r.fulfill({ status: 404, body: 'Not found', contentType: 'text/plain' }));
  await p.goto(BASE + path);
  await p.waitForSelector('#tabs .ifl-tab', { timeout: 15000 });
  if (path === '/') await p.waitForSelector('#today[data-phase] #top .day-top', { timeout: 15000 });
  await p.waitForTimeout(400);
  return { ctx, p };
}
const box = (p, s) => p.$eval(s, (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), shown: !e.hidden && e.getClientRects().length > 0 }; }).catch(() => null);
const sideways = (p) => p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
const ONLY = process.env.ONLY?.split(',');
async function part(name, fn) { if (ONLY && !ONLY.some((o) => name.includes(o))) return; try { await fn(); } catch (e) { ok(false, name, e.stack?.split('\n').slice(0, 3).join(' | ')); } }

if (process.env.PROBE) {
  for (const [w, scheme] of [[1440, 'light'], [1440, 'dark'], [1180, 'light'], [820, 'light'], [390, 'dark']]) {
    const { ctx, p } = await open({ w, scheme });
    await p.screenshot({ path: `${OUT}/probe-${w}-${scheme}.png`, fullPage: true });
    if (w === 1440 && scheme === 'light') {
      console.log(await p.evaluate(() => { const o = []; const walk = (e, d) => { if (d > 5) return; for (const c of e.children) { if (/^(SCRIPT|STYLE|svg|path)$/i.test(c.tagName)) continue; const r = c.getBoundingClientRect(); o.push(`${'  '.repeat(d)}${c.tagName.toLowerCase()}${c.id ? '#' + c.id : ''}${c.className && typeof c.className === 'string' ? '.' + c.className.trim().split(/\s+/).join('.') : ''} [${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}]${c.hidden ? ' hidden' : ''}`); walk(c, d + 1); } }; walk(document.getElementById('in'), 0); return o.join('\n'); }));
      await p.goto(BASE + '/#you'); await p.waitForTimeout(800);
      await p.screenshot({ path: `${OUT}/probe-you-${w}.png`, fullPage: true });
      await p.click('.you-tab[data-pane="youRules-pane"]').catch((e) => console.log('rules tab', e.message)); await p.waitForTimeout(400);
      await p.screenshot({ path: `${OUT}/probe-you-rules-${w}.png` });
      await p.goto(BASE + '/weather/'); await p.waitForTimeout(1500);
      await p.screenshot({ path: `${OUT}/probe-weather-${w}.png` });
      await p.goto(BASE + '/#apps'); await p.waitForTimeout(800);
      await p.screenshot({ path: `${OUT}/probe-apps-${w}.png`, fullPage: true });
    }
    await ctx.close();
  }
  console.log(errs.join('\n'));
  console.log(`FAILS ${fails}`); await b.close(); stop(); process.exit(0);
}

// ---- a computer: the rail, Today in columns, Your Day beside it ----
await part('1440: the rail, Today in columns, Your Day beside it', async () => {
  const { ctx, p } = await open({ w: 1440, h: 900 });
  const rail = await box(p, '#tabs'), today = await box(p, '#today');
  ok(rail && rail.x === 0 && rail.y === 0 && rail.h === 900 && rail.w >= 200 && rail.w <= 260, 'the tab bar is a rail down the left, the window’s height', JSON.stringify(rail));
  ok(today && today.x >= rail.x + rail.w, 'Today beside the rail, never under it', JSON.stringify({ rail, today }));
  same(await p.$$eval('#tabs .ifl-tab', (as) => as.map((a) => a.dataset.tab)), ['today', 'chats', 'apps', 'you'], 'the four tabs, in order, down the rail');
  ok(await p.$eval('#tabs .ifl-rail-brand', (e) => getComputedStyle(e).display !== 'none' && /InFlite/.test(e.textContent)).catch(() => false), 'InFlite’s name at the rail’s head');
  same(await p.$$eval('#tabs .ifl-tab .ifl-tab-k', (ks) => ks.map((k) => k.textContent)), ['1', '2', '3', '4'], 'each tab with its key, 1–4');
  const apps = await p.$$eval('#tabs .ifl-rail-app', (as) => as.map((a) => a.dataset.app));
  ok(apps.includes('weather'), 'your apps in the page under the tabs (Weather, with the roof on)', apps.join(','));
  const me = await box(p, '#tabs .ifl-rail-me');
  ok(me?.shown && me.y + me.h > 900 - 40, 'you, at the rail’s foot', JSON.stringify(me));
  const top = await box(p, '#top'), side = await box(p, '#side'), rest = await box(p, '#rest');
  ok(side?.shown && side.x > top.x + top.w && Math.abs(side.y - top.y) < 60, 'Waiting for You and Coming Up in a column of their own, on the right, level with the top card', JSON.stringify({ top, side }));
  ok(rest.y > top.y + top.h - 2 && Math.abs(rest.x - top.x) < 2, 'The Rest of Today under the top card', JSON.stringify({ top, rest }));
  const cols = await p.$$eval('#rest > article.tcard', (as) => [...new Set(as.map((a) => Math.round(a.getBoundingClientRect().left)))].length);
  ok(cols === 2, 'the cards in two columns', `${cols} columns`);
  const wx = await p.$eval('#rest > .slabel + .wx', (e) => Math.round(e.getBoundingClientRect().width)).catch(() => 0);
  ok(wx > rest.w - 4, 'the weather across both, where it leads', `${wx} of ${rest.w}`);
  const now = await p.$eval('#side #coming > .group', (g) => getComputedStyle(g, '::before').content).catch(() => '');
  ok(/Now/.test(now), 'Coming Up a timeline from Now', now);
  ok(await p.evaluate(() => { const r = document.querySelector('#coming .dc-row + .dc-row'); return !r || getComputedStyle(r, '::before').display === 'none'; }), 'no rules between the timeline’s rows');
  ok(!(await sideways(p)), 'no sideways scroll');
  await p.screenshot({ path: `${OUT}/1440-today.png` });
  // (the cards scroll; Your Day stays in view)
  await p.mouse.move(700, 500); await p.mouse.wheel(0, 600); await p.waitForTimeout(500);
  const side2 = await box(p, '#side');
  ok(side2.y > 0 && side2.y < 120, 'Your Day stays in view as the cards scroll', JSON.stringify(side2));
  await p.evaluate(() => scrollTo(0, 0));
  // keys: 4 is You, 3 Apps, 1 Today; "/" search; not while typing
  await p.keyboard.press('4'); await p.waitForURL(/#you$/, { timeout: 3000 }).catch(() => {}); await p.waitForTimeout(300);
  ok(/#you$/.test(p.url()) && await p.$eval('#tabs .ifl-tab[data-tab=you]', (a) => a.getAttribute('aria-current') === 'page'), 'key 4: You', p.url());
  await p.keyboard.press('3'); await p.waitForURL(/#apps$/, { timeout: 3000 }).catch(() => {});
  ok(/#apps$/.test(p.url()), 'key 3: Apps', p.url());
  await p.keyboard.press('1'); await p.waitForURL(`${BASE}/`, { timeout: 3000 }).catch(() => {});
  ok(new URL(p.url()).pathname === '/' && !new URL(p.url()).hash, 'key 1: Today', p.url());
  await p.keyboard.press('/'); await p.waitForTimeout(500);
  ok(await p.evaluate(() => { const i = document.activeElement; return !!(i && i.matches('input[type=search]') && i.closest('dialog[open]')); }), '“/”: search, its field ready to type in');
  await p.keyboard.type('4'); await p.waitForTimeout(300);
  ok(!/#you/.test(p.url()) && await p.evaluate(() => document.activeElement?.value === '4'), 'keys typed in search are words, not tabs');
  // (the first Escape empties the field, the second closes search)
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  if (await p.$('dialog[data-sheet=search][open]')) await p.keyboard.press('Escape');
  await p.waitForFunction(() => !document.querySelector('dialog[data-sheet=search][open]'), null, { timeout: 3000 }).catch(() => {});
  // the rail's Weather: Weather in the page, its row the one you're on
  await p.click('#tabs .ifl-rail-app[data-app=weather]'); await p.waitForURL(/\/weather\//, { timeout: 5000 }).catch(() => {});
  const marked = await p.waitForFunction(() => document.querySelector('#tabs .ifl-rail-app[data-app=weather]')?.getAttribute('aria-current') === 'page', null, { timeout: 4000 }).then(() => true, () => false);
  ok(/\/weather\//.test(p.url()) && marked, 'the rail’s Weather opens Weather here, its row marked', p.url());
  await p.waitForTimeout(1500);
  // (Weather's own files aren't served by this stack: its error state, as todayphases.mjs has it)
  for (let i = errs.length - 1; i >= 0; i--) if (/weather\/roof\/weather\.js/.test(errs[i])) errs.splice(i, 1);
  await ctx.close();
});

await part('1440: You as two panes', async () => {
  const { ctx, p } = await open({ w: 1440, h: 900, path: '/#you' });
  await p.waitForSelector('#you .you-nav .you-tab', { timeout: 10000 });
  const side = await box(p, '#you .you-side'), main = await box(p, '#you .you-main');
  ok(side?.shown && main?.shown && main.x > side.x + side.w, 'your account and its parts on the left, the part you’re on beside them', JSON.stringify({ side, main }));
  const tabs = await p.$$eval('#you .you-tab', (bs) => bs.map((b) => b.textContent.trim()));
  ok(['Notifications', 'From Each App', 'What Today Does for You', 'Connected Apps', 'About InFlite', 'Chat Settings', 'Sign Out'].every((t) => tabs.includes(t)), 'the list of its parts', tabs.join(', '));
  const shownSecs = () => p.$$eval('#you .you-main .you-sec', (ss) => ss.filter((s) => s.getClientRects().length).map((s) => s.id));
  same(await shownSecs(), ['youNotify'], 'one part shown at a time: Notifications first');
  await p.click('#you .you-tab[data-pane="youRules-pane"]'); await p.waitForTimeout(300);
  same(await shownSecs(), ['youRules-pane'], 'What Today Does for You in the pane, not a sheet');
  ok(!(await p.$('#sh-youfolder[open]')) && (await p.$$('#youRules-pane [data-rulepick]')).length > 0, 'its rules there, each with its level');
  ok(await p.$eval('#you .you-tab[data-pane="youRules-pane"]', (b) => b.getAttribute('aria-current') === 'page'), 'its item marked in the list');
  await p.screenshot({ path: `${OUT}/1440-you-rules.png` });
  // /#you=apps: Connected Apps in the pane
  await p.goto(BASE + '/#you=apps'); await p.waitForTimeout(1500);
  same(await shownSecs(), ['youApps-pane'], '/#you=apps: Connected Apps in the pane');
  ok(!(await sideways(p)), 'no sideways scroll');
  await ctx.close();
});

// ---- a tablet and a phone: as they were ----
for (const [w, h] of [[820, 1180], [390, 844]]) await part(`${w}: the phone’s layout, as it was`, async () => {
  const { ctx, p } = await open({ w, h, scheme: 'dark' });
  const bar = await box(p, '#tabs');
  ok(bar && bar.y > h - 120 && bar.w < w, 'the tab bar floats at the foot', JSON.stringify(bar));
  ok(!(await p.$eval('#tabs .ifl-rail-brand', (e) => e.getClientRects().length > 0).catch(() => false)), 'nothing of the rail shown');
  const top = await box(p, '#top'), side = await box(p, '#side'), rest = await box(p, '#rest');
  ok(side.y > top.y + top.h - 2 && rest.y > side.y && Math.abs(side.x - top.x) < 2, 'one column: the top card, Waiting and Coming Up, then the rest', JSON.stringify({ top, side, rest }));
  ok(!(await sideways(p)), 'no sideways scroll');
  await p.goto(BASE + '/#you'); await p.waitForSelector('#you .you-sec', { timeout: 10000 });
  ok(await p.evaluate(() => { const ss = [...document.querySelectorAll('#you .you-main > .you-sec')]; return !document.querySelector('#you .you-nav')?.getClientRects().length && ss.length > 2 && ss.every((s) => s.getClientRects().length); }), 'You one column, every part shown, no list of them');
  await p.click('#you [data-folder="rules"]'); await p.waitForSelector('#sh-youfolder[open] [data-rulepick]', { timeout: 5000 }).catch(() => {});
  ok(!!(await p.$('#sh-youfolder[open] [data-rulepick]')), 'a folder in its sheet, as before');
  await p.screenshot({ path: `${OUT}/${w}-you-folder.png` });
  await ctx.close();
});

console.log(errs.length ? errs.join('\n') : '');
ok(!errs.length, 'no console error, page error or CSP violation', errs.slice(0, 5).join(' | '));
console.log(`FAILS ${fails}`);
await b.close(); stop(); process.exit(fails ? 1 : 0);
