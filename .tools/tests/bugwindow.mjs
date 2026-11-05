// The bug window (the shared menu's BUG, .tools/inflite/menu.js), in Today's page on the stand-in stack homegap.mjs uses:
// an API that fails and says its code (IF-S-…) opens it with that code; Send to InFlite files it (POST /api/bugs) with
// the page's path alone and nothing of the page's words; a crash in the site's own script opens it with its own code
// (IF-, the app's letter, five more), the same bug once a page; Report a Problem opens it to write in, not sent empty.
// Screenshots of each, light and dark, at a phone's size, in the out dir.
//   node .tools/tests/bugwindow.mjs [out dir]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';

const HERE = new URL('./', import.meta.url).pathname;
const IFL = process.env.IFL_ROOT || new URL('../../../inflite/', import.meta.url).pathname;
const OUT = process.argv[2] || '/tmp/bugwindow'; mkdirSync(OUT, { recursive: true });
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
for (const scheme of ['dark', 'light']) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  const p = await ctx.newPage(), sent = [], errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/api/bugs', async (r) => { sent.push(JSON.parse(r.request().postData() || '{}')); await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'T3ST', code: 'x', status: 'https://status.inflite.ai/#IF-S-7KQ2M' }) }); });
  await p.route('**/api/boom', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Something went wrong on our side.', code: 'IF-S-7KQ2M' }) }));
  await p.route('**/__boom.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'setTimeout(function boom() { const o = null; o.secretThing = 1; }, 0);' }));
  await p.goto(`${BASE}/?private=1#k=secret`, { waitUntil: 'load' });
  await p.waitForTimeout(600);
  const win = () => p.locator('.ifb-layer .ifb');
  const tag = scheme === 'dark' ? '' : '-light';

  // ---- a server error with its code ----
  await p.evaluate(() => fetch('/api/boom').catch(() => {}));
  await win().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  ok(await win().isVisible(), `${scheme}: an API that fails with its code opens the window`);
  ok((await p.locator('.ifb-code').textContent())?.trim() === 'IF-S-7KQ2M', `${scheme}: with that code`);
  await p.screenshot({ path: `${OUT}/server${tag}.png` });
  await p.fill('.ifb-note', 'Opened Apps');
  await p.click('.ifb-go');
  await p.waitForFunction(() => /Sent/.test(document.querySelector('.ifb-said')?.textContent || ''), null, { timeout: 5000 }).catch(() => {});
  const link = p.locator('.ifb-said a.ifb-link');
  ok((await link.count()) === 1 && (await link.getAttribute('href')) === 'https://status.inflite.ai/#IF-S-7KQ2M' && (await link.getAttribute('target')) === '_blank', `${scheme}: once sent, See where this stands, to its code on the status page`);
  const s0 = sent[0] || {};
  ok(s0.code === 'IF-S-7KQ2M' && s0.kind === 'server' && s0.path === '/' && s0.note === 'Opened Apps' && /iPhone/.test(s0.device || ''), `${scheme}: Send files it: its code, the page's path alone, the note, the device`, JSON.stringify(s0));
  ok(!JSON.stringify(s0).includes('secret') && !JSON.stringify(s0).includes('private'), `${scheme}: never the address's query or #`);
  await p.click('.ifb-btn:has-text("Close")');
  ok(!(await p.locator('.ifb-layer').count()), `${scheme}: Close closes it`);

  // ---- a crash in the site's own script ----
  await p.evaluate(() => { const s = document.createElement('script'); s.src = '/__boom.js'; document.head.append(s); });
  await win().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  const code = (await p.locator('.ifb-code').textContent().catch(() => ''))?.trim();
  ok(/^IF-[A-Z]-[0-9A-HJKMNP-TV-Z]{5}$/.test(code || ''), `${scheme}: a crash in its own script opens the window with its own code`, code);
  ok(/TypeError/.test(await p.locator('.ifb-tech').textContent().catch(() => '')) && /__boom\.js:1/.test(await p.locator('.ifb-tech').textContent().catch(() => '')), `${scheme}: what and where`);
  await p.screenshot({ path: `${OUT}/crash${tag}.png` });
  await p.click('.ifb-btn:has-text("Close")');
  await p.evaluate(() => { const s = document.createElement('script'); s.src = '/__boom.js?again'; document.head.append(s); });
  await p.waitForTimeout(600);
  ok(!(await p.locator('.ifb-layer').count()), `${scheme}: the same bug again: not shown twice on one page`);

  // ---- Report a Problem (where the page's IFL is reachable; else from the menu, signed in, which the stub doesn't do here) ----
  const can = await p.evaluate(() => { try { return typeof IFL !== 'undefined' && typeof IFL.bug?.report === 'function' ? (IFL.bug.report(), true) : false; } catch (_) { return false; } });
  if (can) {
    await win().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    ok((await p.locator('#ifb-t').textContent()) === 'Report a Problem', `${scheme}: Report a Problem opens it to write in`);
    await p.click('.ifb-go');
    ok(/Say what/.test(await p.locator('.ifb-said').textContent()), `${scheme}: not sent empty`);
    await p.fill('.ifb-note', 'The tab bar sits too high');
    await p.screenshot({ path: `${OUT}/report${tag}.png` });
    await p.click('.ifb-go');
    await p.waitForTimeout(500);
    ok(sent.at(-1)?.kind === 'manual' && /^IF-[A-Z]-R/.test(sent.at(-1)?.code || ''), `${scheme}: and sent, under a code of its own`, JSON.stringify(sent.at(-1)));
  } else console.log(`(${scheme}: the page's IFL isn't a global here; Report a Problem is checked in the unit tests)`);
  ok(!errs.filter((m) => !/secretThing/.test(m)).length, `${scheme}: no other page errors`, errs.join(' | '));
  await ctx.close();
}
await b.close(); stop();
console.log(`FAILS ${fails}`);
process.exit(fails ? 1 : 0);
