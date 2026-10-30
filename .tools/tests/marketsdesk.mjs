// Markets on a big screen (markets/desk.js): the desk, at a Mac's size. Your portfolio in a table, sorted by any column,
// moved through with the keys; the one chosen, its chart (prices and times on its edges, volume, averages, against the
// market, read under the pointer) and its figures; a heat map of your money, your year's risk, the news, the dividends
// coming; the command line. At an iPad's size held across, two columns with the rest under them; on a phone, no desk.
// (The markets' data is mocks/marketsmock.mjs, standing in for Yahoo Finance's.)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { joinChat } from './join.mjs';
import http from 'node:http';
// (asked of the site as the browser would at an address of its own: this machine, with that address's name)
const ask = (url, { method = 'GET', headers = {} } = {}) => new Promise((done) => { const u = new URL(url); const r = http.request({ host: '127.0.0.1', port: 8788, path: u.pathname + u.search, method, agent: false, headers: { Host: u.host, ...headers } }, (res) => { let t = ''; res.on('data', (x) => (t += x)); res.on('end', () => done({ status: res.statusCode, body: t })); }); r.end(); });

const [,, S, out] = process.argv;
const CHAT = 'http://chat.ifl.test:8788', MKT = 'http://finance.ifl.test:8788', FIT = 'http://fitness.ifl.test:8788';
const sql0 = (q) => execSync(`${S}/wr/node_modules/.bin/wrangler d1 execute bio-db --local --persist-to ${S}/wrstate --command "${q}"`, { cwd: process.env.APP_ROOT, stdio: 'pipe' }).toString();
const rows = (q) => { const o = sql0(q), m = o.match(/"results": (\[[\s\S]*?\])\s*,\s*"success"/); return m ? JSON.parse(m[1]) : []; };
let fails = 0; const errs = [], pages = [];
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${extra ? '  — ' + extra : ''}`); if (!c) fails++; };
process.on('uncaughtException', async (e) => { console.log(`FAIL  ${e.message.split('\n')[0]}`); console.log(String(e.stack).split('\n').slice(0, 6).join('\n')); for (const x of pages) await x.screenshot({ path: `${out}/failed-${pages.indexOf(x)}.png` }).catch(() => {}); console.log(`FAILS ${fails + 1}`); process.exit(1); });
const mode = (o) => fetch('http://127.0.0.1:8801/mode', { method: 'POST', body: JSON.stringify(o) });
const settle = (p, ms = 600) => p.waitForTimeout(ms);
const text = (p, sel) => p.locator(sel).first().innerText().catch(() => '');

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined,
  args: ['--host-resolver-rules=MAP *.gfg.test 127.0.0.1, MAP gfg.test 127.0.0.1, MAP *.ifl.test 127.0.0.1, MAP ifl.test 127.0.0.1', `--unsafely-treat-insecure-origin-as-secure=${CHAT},${MKT},${CHAT.replace('//chat.', '//account.')}`] });
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPHONE, locale: 'en-GB', colorScheme: 'dark', serviceWorkers: 'allow' });
await ctx.grantPermissions(['notifications'], { origin: MKT });
// (headless Chromium has no push service: one stood in for, as the other apps' tests do)
await ctx.addInitScript(() => {
  if (!location.hostname.startsWith('finance.')) return;
  const endpoint = 'https://fcm.googleapis.com/fcm/send/markets-phone';
  const make = () => ({ endpoint, toJSON: () => ({ endpoint, keys: { p256dh: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U', auth: 'tBHItJI5svbpez7KI4CCXg' } }), unsubscribe: async () => true });
  PushManager.prototype.getSubscription = async function () { return localStorage.getItem('fakesub') ? make() : null; };
  PushManager.prototype.subscribe = async function () { localStorage.setItem('fakesub', '1'); return make(); };
});
const p = await ctx.newPage(); pages.push(p);
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 40[13]/.test(m.text())) errs.push(m.text()); });


const c = await ctx.newPage();
await joinChat(c, `${CHAT}/`, { name: 'Sam Lee', handle: 'samlee', email: 'sam@example.com', city: 'London' });
await c.close();
await p.goto(MKT + '/'); await p.waitForSelector('.empty h2', { timeout: 20000 }); await settle(p, 800);
const put = (h) => p.evaluate((h) => fetch('/api/markets/holding', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(h), credentials: 'same-origin' }).then((r) => r.status), h);
const D = 864e5;
for (const h of [
  { symbol: 'RR.L', name: 'Rolls-Royce', qty: 640, cost: 6.1, account: 'isa', since: Date.now() - 400 * D },
  { symbol: 'JAM.L', name: 'JPMorgan American', qty: 572, cost: 12.27, account: 'isa', since: Date.now() - 500 * D },
  { symbol: 'AAPL', qty: 10, cost: 180, account: 'gia' }, { symbol: 'NVDA', qty: 12, cost: 120, account: 'isa' },
  { symbol: 'TSCO.L', qty: 900, cost: 3.5, account: 'isa', since: Date.now() - 300 * D }, { symbol: 'SHEL.L', qty: 60, cost: 25, account: 'sipp' },
  { symbol: 'AZN.L', qty: 0 },
]) ok(await put(h) === 200, `added ${h.symbol}`);
// ---- on a phone: no desk ----
await p.reload(); await p.waitForSelector('.hero', { timeout: 20000 }); await settle(p, 1500);
ok(!(await p.$('.desk')) && await p.isVisible('.tabbar'), 'on a phone: the phone layout, its tabs, no desk');
const state = await ctx.storageState();
const dctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'en-GB', colorScheme: 'dark', storageState: state, serviceWorkers: 'block' });
const d = await dctx.newPage(); pages.push(d);
d.on('pageerror', (e) => errs.push(e.message));
d.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 40[13]/.test(m.text())) errs.push(m.text()); });
await d.goto(MKT + '/'); await d.waitForSelector('.desk', { timeout: 20000 }); await d.waitForSelector('#dchart svg path.pl', { timeout: 15000 }); await settle(d, 2500);
await d.screenshot({ path: `${out}/1-desk.png` });
// ---- the portfolio ----
ok(!(await d.isVisible('.tabbar')) && await d.locator('#dhold tbody tr').count() === 6 && await d.locator('.dt.small tbody tr').count() === 1, 'on a Mac: the desk; your six holdings in its table, and the one you follow under it', String(await d.locator('#dhold tbody tr').count()));
ok((await d.getAttribute('#dhold tbody tr:first-child', 'data-sym')) === 'JAM.L' && (await d.getAttribute('#dhold tbody tr.on', 'data-sym')) === 'JAM.L' && /JPMorgan American/.test(await d.locator('.inst h2').innerText()),
  'largest first, and it chosen: its chart and figures in the middle', await d.locator('.inst h2').innerText());
ok(/£[\d,]+\.\d\d/.test(await d.locator('#dpv').innerText()) && await d.locator('.dsum .spk path').count() === 1 && await d.locator('#dhold td.sp svg').count() === 6, "your portfolio's worth, with its day drawn; each holding's day drawn in its row");
await d.locator('.dt th button:has-text("Since")').click(); await settle(d, 600);
ok((await d.getAttribute('#dhold tbody tr:first-child', 'data-sym')) === 'NVDA' && (await d.getAttribute('.dt th[aria-sort]', 'aria-sort')) === 'descending', 'sorted by since you bought: Nvidia first', await d.getAttribute('#dhold tbody tr:first-child', 'data-sym'));
await d.locator('.dt th button:has-text("Since")').click(); await settle(d, 400);
ok((await d.getAttribute('.dt th[aria-sort]', 'aria-sort')) === 'ascending', 'and again: the other way');
await d.locator('.dt th button:has-text("Value")').click(); await settle(d, 400);
// ---- the keys ----
await d.locator('.desk').click({ position: { x: 5, y: 5 } }).catch(() => {});
await d.keyboard.press('ArrowDown'); await settle(d, 1500);
ok((await d.getAttribute('#dhold tbody tr.on', 'data-sym')) === 'RR.L' && /Rolls-Royce/.test(await d.locator('.inst h2').innerText()), '↓: the next one, chosen', await d.locator('.inst h2').innerText());
await d.keyboard.press('5'); await d.waitForFunction(() => document.querySelector('.dseg button[aria-pressed="true"]')?.textContent === '5Y'); await settle(d, 1800);
ok(/in 5 years/.test(await d.locator('#dchgsaid').innerText()) && await d.locator('#dchart path.ma').count() === 2 && /200-day average/.test(await d.locator('#dlegend').innerText()), '5: five years, with its 50- and 200-day averages', await d.locator('#dlegend').innerText());
ok(await d.locator('#dchart .volb').count() > 50 && await d.locator('#dchart text.ax').count() >= 8 && await d.locator('#dchart .tag').count() === 1 && /High /.test(await d.locator('#dchart').textContent()), 'its volume under it, prices and times on its edges, its price now tagged, its high and low marked', (await d.locator('#dchart').textContent()).slice(0, 120));
await d.keyboard.press('c'); await d.waitForFunction(() => /FTSE 100/.test(document.querySelector('#dlegend')?.textContent || '')); await settle(d, 1500);
ok(await d.locator('#dchart path.vsl').count() === 1 && /%/.test(await d.locator('#dchart text.ax').first().textContent()), 'C: against the FTSE 100, both as % from the start');
const bx = await d.locator('#dchart').boundingBox(); await d.mouse.move(bx.x + bx.width * 0.4, bx.y + bx.height * 0.4); await settle(d, 400);
ok(/\d{4}/.test(await d.locator('#dtip').innerText()) && /£\d/.test(await d.locator('#dtip').innerText()) && /FTSE 100/.test(await d.locator('#dtip').innerText()), 'read under the pointer: the day, its price, and the FTSE 100 then', (await d.locator('#dtip').innerText()).replace(/\s+/g, ' '));
await d.screenshot({ path: `${out}/2-reading.png` });
await d.mouse.move(2, 2);
// ---- the command line ----
await d.keyboard.press('/'); await settle(d, 200);
ok(await d.evaluate(() => document.activeElement?.id === 'dcmd'), '/: the command line');
await d.keyboard.type('vs off'); await d.keyboard.press('Enter'); await settle(d, 1500);
ok(!/FTSE 100/.test(await d.locator('#dlegend').innerText()) && !(await d.$('.sheet:not([hidden])')), 'vs off: back to its price alone (and no page opened)');
await d.keyboard.press('/'); await d.keyboard.type('tesco 1y'); await d.keyboard.press('Enter'); await settle(d, 1800);
ok((await d.getAttribute('#dhold tbody tr.on', 'data-sym')) === 'TSCO.L' && (await d.locator('.dseg button[aria-pressed="true"]').innerText()) === '1Y', 'tesco 1y: Tesco chosen, over a year', await d.locator('.inst h2').innerText());
// ---- on the right ----
ok(await d.locator('#dheat .tile').count() === 6 && /TSCO/.test(await d.locator('#dheat').innerText()), 'a heat map of your money: a tile each');
await d.waitForSelector('.rgrid', { timeout: 15000 }).catch(() => {});
ok(/Your year/.test(await d.locator('#drisk').innerText()) && await d.locator('.rcell').count() === 4 && /Volatility/.test(await d.locator('#drisk').innerText()), "your year's risk: four figures under your year", (await d.locator('#drisk').innerText()).replace(/\s+/g, ' '));
await d.waitForSelector('.nrow', { timeout: 15000 }).catch(() => {});
ok(await d.locator('.nrow').count() >= 3 && await d.locator('.nrow .ntag').count() >= 1, 'the news about what you hold, each with its symbol');
ok(await d.locator('.dcome button').count() >= 1, 'the dividends coming');
await d.locator('#dheat .tile').first().click(); await settle(d, 1500);
ok((await d.getAttribute('#dhold tbody tr.on', 'data-sym')) === 'JAM.L', 'a tile tapped: it chosen');
await d.locator('.iacts button:has-text("Edit")').click(); await d.waitForSelector('#mk-qty', { timeout: 10000 });
ok(true, 'Edit: its page, over the desk');
await d.keyboard.press('Escape'); await settle(d, 800);
await dctx.close();
// ---- an iPad, held across ----
const ictx = await b.newContext({ viewport: { width: 1180, height: 820 }, locale: 'en-GB', storageState: state, serviceWorkers: 'block' });
const ip = await ictx.newPage(); pages.push(ip); ip.on('pageerror', (e) => errs.push(e.message));
await ip.goto(MKT + '/'); await ip.waitForSelector('.desk', { timeout: 20000 }); await settle(ip, 2500);
const lay = await ip.evaluate(() => { const g = document.querySelector('.dgrid'), c = document.querySelector('.dcol'), pr = document.querySelector('.port').getBoundingClientRect(), cr = c.getBoundingClientRect(); return { cols: getComputedStyle(g).gridTemplateColumns.split(' ').length, under: cr.top > pr.bottom - 2 }; });
ok(lay.cols === 2 && lay.under && !(await ip.isVisible('#dhold th.cp')), "on an iPad held across: two columns, the heat map, risk and news under them", JSON.stringify(lay));
await ip.screenshot({ path: `${out}/3-ipad.png` });
await ictx.close();
ok(!errs.length, 'no errors on the page', errs.join(' ; '));
console.log(`FAILS ${fails}`);
await b.close();
process.exit(0);
