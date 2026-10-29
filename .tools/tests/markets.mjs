// Markets (markets/), at its own address (finance.<site>), signed in only, with the site's one account: signed out, what it
// is and Sign in; signed up to Chat in a browser, Markets there is signed in already, with nothing yet to show but the
// markets. Something found by name and added, with what you own and paid; then a portfolio of six: worth what their
// prices say (London's in pence, America's in dollars at the day's rate), its day drawn and said, and what's worth
// knowing (an odd one, one near its high, how much is in one company, the dividends). A stock's page: its chart drawn,
// reshaped to a year, read with the pointer; an alert, sent by the scheduler when it moves 3% (once that day); prices
// kept fresh and flashed as they change. Holdings' ring; News' stories; one taken off the list. Investment trusts found,
// said as such and explained, and how your money splits between them and shares. The API answers only
// signed in, and only at Markets's own address. Nothing scrolls sideways on a small phone. Signing out goes to the start.
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

// ---- 1. Signed out: what it is, and Sign in ----
await p.goto(MKT + '/'); await p.waitForSelector('.welcome #sign-in', { timeout: 20000 }); await settle(p, 2600);
await p.screenshot({ path: `${out}/1-welcome.png` });
ok(/Markets/.test(await text(p, '.ifl-title')) && /Your money, said simply/.test(await text(p, '.ifl-tagline')) && await p.isVisible('#sign-in'), 'signed out: Markets, its line, and Sign in');
ok((await p.locator('.scene path').count()) === 3, 'the welcome draws its three lines');

// ---- 2. Signed up to Chat: Markets is signed in, with nothing yet but the markets ----
const c = await ctx.newPage();
await joinChat(c, `${CHAT}/`, { name: 'Sam Lee', handle: 'samlee', email: 'sam@example.com', city: 'London' });
await c.close();
await p.goto(MKT + '/'); await p.waitForSelector('.empty h2', { timeout: 20000 }); await settle(p, 1400);
await p.screenshot({ path: `${out}/2-empty.png` });
ok(/Start with what you own/.test(await text(p, '.empty h2')) && /8,412\.6/.test(await text(p, '.markets')) && /\+0\.62%/.test(await text(p, '.markets')), 'signed in, nothing added: the way to start, and the FTSE at 8,412.6, +0.62%');
ok(/London open · closes in/.test(await text(p, '.ifh-line')), "the header says London's open, and when it closes", await text(p, '.ifh-line'));

// ---- 3. Found by name, and added with what you own and paid ----
await p.click('.ifh-act[aria-label="Find and add"]'); await p.waitForSelector('#mk-q'); await settle(p, 500);
await p.fill('#mk-q', 'rolls'); await p.waitForSelector('.res', { timeout: 10000 }); await settle(p, 300);
ok(/Rolls-Royce/.test(await text(p, '.res b')) && /RR · London/.test(await text(p, '.res small')), 'search: Rolls-Royce, its name said plainly, RR · London', await text(p, '.res'));
await p.click('.res'); await p.waitForSelector('.sprice'); await p.waitForSelector('.chartbox path.line[d]'); await settle(p, 1600);
ok((await text(p, '.sprice')) === '£8.94' && /\+£0\.17 \(\+1\.89%\)/.test(await text(p, '.sdelta')), "its page: £8.94 (London's pence, in pounds), +£0.17 today", `${await text(p, '.sprice')} ${await text(p, '.sdelta')}`);
await p.screenshot({ path: `${out}/3-stock.png` });
await p.click('button:has-text("Add to Your List")'); await p.waitForSelector('#mk-qty');
await p.fill('#mk-qty', '640'); await p.fill('#mk-cost', '6.10'); await p.click('#mk-save');
await p.waitForSelector('.fact:has-text("Yours")', { timeout: 10000 }); await settle(p, 700);
const rr = rows("SELECT symbol, name, qty, cost FROM mk_holdings")[0];
ok(rr?.symbol === 'RR.L' && rr.name === 'Rolls-Royce' && rr.qty === 640 && rr.cost === 6.1, 'kept with the account: RR.L, as Rolls-Royce, 640 at £6.10', JSON.stringify(rr));
ok(/£5,721\.60/.test(await text(p, '.fact:has-text("Yours")')) && /Since you bought/.test(await text(p, '.facts')), "back on its page: yours, worth £5,721.60, and how it's done since you bought", await text(p, '.facts'));
ok(/6\.00p a share a year/.test(await text(p, '.fact:has-text("Dividends")')) && /about £38 to you/.test(await text(p, '.fact:has-text("Dividends")')), 'its dividends: 6p a share over the year, about £38 to you', await text(p, '.fact:has-text("Dividends")'));
await p.keyboard.press('Escape'); await settle(p, 800);

// ---- 4. A portfolio of six: worth, its day, and what's worth knowing ----
const put = (h) => p.evaluate((h) => fetch('/api/markets/holding', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(h), credentials: 'same-origin' }).then((r) => r.status), h);
for (const h of [{ symbol: 'AAPL', qty: 10, cost: 180 }, { symbol: 'NVDA', qty: 12 }, { symbol: 'ARM', qty: 14 }, { symbol: 'TSCO.L', qty: 900, cost: 3.5 }, { symbol: 'SHEL.L', qty: 60 }]) ok(await put(h) === 200, `added ${h.symbol}`);
await p.reload(); await p.waitForSelector('#pv', { timeout: 20000 }); await settle(p, 3500);
await p.screenshot({ path: `${out}/4-today.png` });
const want = 894 / 100 * 640 + 412 / 100 * 900 + 2781 / 100 * 60 + (241.18 * 10 + 188.92 * 12 + 160.4 * 14) * 0.7731;
const pv = (await text(p, '#pv')).replace(/[£,\s]/g, '');
ok(Math.abs(Number(pv) - want) < 0.02, `your portfolio: £${want.toFixed(2)} (dollars at the day's rate, pence in pounds)`, pv);
ok(/^Rolls-Royce did most of the work, adding £106\.\d\d\. Arm gave back £35\.\d\d\.$/.test(await text(p, '#say')), "the day, said: who did the work, and who gave back (names said plainly)", await text(p, '#say'));
ok(await p.locator('#pchart path[data-draw]').count() === 1, 'its day drawn through the day');
const cards = await p.locator('.card').allInnerTexts();
ok(cards.some((t) => /Arm is falling while the S&P 500 rises/.test(t)), 'worth knowing: Arm going the other way from its market', cards.join(' | ').slice(0, 300));
ok(cards.some((t) => /Rolls-Royce is close to its 52-week high/.test(t)), 'and one near its high');
ok(cards.some((t) => /% of your money is in one company/.test(t)), 'and how much is in one company');
ok(cards.length <= 4 && cards.length >= 3, 'four at most, one at a time', String(cards.length));
const movers = await p.locator('#main .list .item').count();
ok(movers === 4, 'your four biggest movers today', String(movers));

// ---- 5. A stock's page: drawn, reshaped to a year, read with the pointer ----
await p.locator('.item:has-text("Nvidia"), .item:has-text("NVIDIA")').first().click(); await p.waitForSelector('.chartbox path.line[d]'); await settle(p, 1800);
const d1 = await p.getAttribute('.chartbox path.line', 'd');
await p.click('.seg button[data-r="1y"]'); await settle(p, 350);
const dMid = await p.getAttribute('.chartbox path.line', 'd');
await settle(p, 1200);
const d2 = await p.getAttribute('.chartbox path.line', 'd');
ok(d1 && d2 && d1 !== d2 && dMid !== d2, 'switching to a year reshapes the line (through the frames between, not a jump)');
ok(/this year/.test(await text(p, '#rsaid')), 'and says the change over the year', await text(p, '.sdelta'));
const box = await p.locator('.chartbox').boundingBox();
await p.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2); await settle(p, 300);
ok(/^\$\d+\.\d\d · \d+ \w+ \d\d$/.test(await text(p, '.scrub-tip')), 'read with the pointer: the price and the day there', await text(p, '.scrub-tip'));
await p.screenshot({ path: `${out}/5-chart.png` });
await p.waitForFunction(() => !/Finding out why/.test(document.querySelector('#why')?.textContent || ''), null, { timeout: 10000 }).catch(() => {});
ok(/move after the morning's update/.test(await text(p, '#why')) && /Reuters/.test(await text(p, '#why small')), "why it's moving: the day's story about it", await text(p, '#why'));

// ---- 6. An alert, from the scheduler, once ----
await p.click('#alert'); await p.waitForSelector('#alert.on', { timeout: 10000 });
const al = rows("SELECT symbol, pct FROM mk_alerts")[0], ph = rows("SELECT endpoint FROM mk_push")[0];
ok(al?.symbol === 'NVDA' && al.pct === 3 && /markets-phone/.test(ph?.endpoint || ''), 'Alert Me: on at 3%, and this phone kept to tell', JSON.stringify([al, ph]));
const tick = () => ask(MKT + '/api/markets/tick', { method: 'POST', headers: { Authorization: 'Bearer tick-test-secret' } }).then((r) => JSON.parse(r.body || '{}'));
const before = readFileSync(`${S}/pushbox.jsonl`, 'utf8').split('\n').filter((l) => l.includes('markets-phone')).length;
const t0 = await tick();
await mode({ bump: { NVDA: 4.2 } });
const t1 = await tick(), t2 = await tick();
const after = readFileSync(`${S}/pushbox.jsonl`, 'utf8').split('\n').filter((l) => l.includes('markets-phone')).length;
ok(t0.sent === 0, 'at +2.4% it says nothing', JSON.stringify(t0));
ok((t1.sent === 1 && t2.sent === 0) || after - before === 1, 'at +4.2%: sent once, and not again that day', `${JSON.stringify(t1)} ${JSON.stringify(t2)} ${before}→${after}`);

// ---- 7. Prices kept fresh, and flashed as they change ----
await p.keyboard.press('Escape'); await settle(p, 700);
await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await settle(p, 2500);
ok(/\$1(9[0-9]|8[0-9])\.\d\d/.test(await text(p, '[data-px="NVDA"]')), 'Nvidia\'s price, fresh, where it shows', await text(p, '[data-px="NVDA"]'));

// ---- 8. Holdings: the ring of your mix; News: the stories ----
await p.click('.tab[data-tab="holdings"]'); await settle(p, 1600);
await p.screenshot({ path: `${out}/6-holdings.png` });
ok(await p.locator('.ring .arc').count() === 6 && /Rolls-Royce/.test(await text(p, '.legend')), 'Holdings: the ring of your mix, the five largest and the rest', String(await p.locator('.ring .arc').count()));
ok(await p.locator('#main .list .item').count() === 6 && /since you bought/.test(await text(p, '.foot')), 'everything you own, and how it\'s done since you bought', await text(p, '.foot'));
await p.click('.tab[data-tab="news"]'); await p.waitForSelector('a.story', { timeout: 15000 }); await settle(p, 1000);
await p.screenshot({ path: `${out}/7-news.png` });
ok(/London is up 0\.6% and New York is up 0\.4% today/.test(await text(p, '.digest')) && await p.locator('a.story').count() >= 6, "News: the day in brief, then the stories about what you hold", await text(p, '.digest'));
ok((await p.getAttribute('a.story', 'href')).startsWith('https://example.com/news/') && (await p.getAttribute('a.story', 'target')) === '_blank', "each opens the publisher's page");

// ---- 9. One taken off the list ----
await p.click('.tab[data-tab="holdings"]'); await settle(p, 900);
await p.locator('.item:has-text("Arm")').first().click(); await p.waitForSelector('.links .danger'); await settle(p, 900);
await p.click('.links .danger'); await settle(p, 1200);
ok(!rows("SELECT symbol FROM mk_holdings WHERE symbol = 'ARM'").length && await p.locator('#main .list .item').count() === 5, 'Remove: off the list, and off the page');

// ---- 9b. Investment trusts: found, said as such, explained, and how your money splits between them and shares ----
await p.click('.ifh-act[aria-label="Find and add"]'); await p.waitForSelector('#mk-q'); await settle(p, 600);
ok(/Investment trusts/i.test(await text(p, '.browse h3')) && await p.locator('.browse .chip:has-text("Scottish Mortgage")').count() === 1, 'Find and Add: a few well-known investment trusts to start from', await text(p, '.browse'));
await p.fill('#mk-q', 'scottish'); await p.waitForSelector('.res', { timeout: 10000 }); await settle(p, 300);
ok((await text(p, '.res b')) === 'Scottish Mortgage' && /SMT · London · Investment trust/.test(await text(p, '.res small')), 'search: Scottish Mortgage, an investment trust', await text(p, '.res'));
const alw = await p.evaluate(() => fetch('/api/markets/search?q=alliance', { credentials: 'same-origin' }).then((r) => r.json()));
ok(alw.results?.[0]?.symbol === 'ALW.L' && alw.results[0].kind === 'trust' && alw.results[0].name === 'Alliance Witan', "and one whose name doesn't say so, known all the same", JSON.stringify(alw.results?.[0]));
await p.click('.res'); await p.waitForSelector('.sprice'); await p.waitForSelector('.chartbox path.line[d]'); await settle(p, 1400);
ok(/SMT · London · Investment trust/.test(await text(p, '.shead small')) && /A company that invests in many others/.test(await text(p, '.facts')) && /premium, or a discount/.test(await text(p, '.facts')), 'its page: said to be an investment trust, and what one is', await text(p, '.shead small'));
await p.screenshot({ path: `${out}/9b-trust.png` });
await p.click('button:has-text("Add to Your List")'); await p.waitForSelector('#mk-qty');
await p.fill('#mk-qty', '500'); await p.fill('#mk-cost', '8'); await p.click('#mk-save');
await p.waitForSelector('.fact:has-text("Yours")', { timeout: 10000 }); await settle(p, 600);
await p.keyboard.press('Escape'); await settle(p, 700);
await p.click('.tab[data-tab="holdings"]'); await settle(p, 1500);
const kinds = await text(p, '#kinds'), kp = [...kinds.matchAll(/(\d+)%/g)].map((m) => Number(m[1]));
ok(/Shares\s*\d+%/.test(kinds) && /Investment trusts\s*\d+%/.test(kinds) && Math.abs(kp.reduce((a, v) => a + v, 0) - 100) <= 1, 'Holdings: how your money splits between shares and investment trusts', kinds.replace(/\s+/g, ' '));
await p.screenshot({ path: `${out}/9b-kinds.png` });
await p.locator('.item:has-text("Scottish Mortgage")').first().click(); await p.waitForSelector('.links .danger'); await settle(p, 800);
await p.click('.links .danger'); await settle(p, 1200);
ok(!rows("SELECT symbol FROM mk_holdings WHERE symbol = 'SMT.L'").length && !(await p.isVisible('#kinds')), 'taken off again: all shares, no split to show');

// ---- 10. Only signed in, and only at Markets's own address ----
const fromFit = await (await ctx.newPage()).goto(FIT + '/api/markets/me').then((r) => r.status());
ok(fromFit === 404, "Markets's API isn't at Fitness's address", String(fromFit));
const anon = (await ask(MKT + '/api/markets/quotes?s=AAPL')).status;
ok(anon === 401, 'and asks for prices only signed in', String(anon));

// ---- 11. Nothing scrolls sideways on a small phone ----
const small = await ctx.newPage(); await small.setViewportSize({ width: 320, height: 640 });
await small.goto(MKT + '/'); await small.waitForSelector('#pv', { timeout: 20000 }); await settle(small, 1500);
ok(await small.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'nothing wider than a 320px phone');
await small.close();

// ---- 11b. Your account's page: Markets among your apps; its alerts in Notifications, one turned off there ----
const ACCT = 'http://account.ifl.test:8788';
const w = await ctx.newPage(); pages.push(w);
await w.goto(ACCT + '/'); await w.waitForSelector('.app:has-text("Markets")', { timeout: 30000 }); await settle(w, 800);
ok(/5 holdings/.test(await text(w, '.app:has-text("Markets")')) && /5 you own/.test(await text(w, '.app:has-text("Markets")')), "the account's page: Markets among your apps, with what you have there", await text(w, '.app:has-text("Markets")'));
await w.evaluate(() => history.replaceState(null, '', location.pathname + '#from=markets&open=notify-markets')); await w.reload();
await w.waitForSelector('#sheet[open] #nt-m-on', { timeout: 20000 }); await settle(w, 800);
await w.screenshot({ path: `${out}/9-account-notify.png` });
ok(/On 1 device/.test(await text(w, '#sheet')) && /Price Alerts/.test(await text(w, '#sheet')) && /NVIDIA/.test(await text(w, '#sheet')), 'its Notifications folder: on this phone, Price Alerts, and NVIDIA\'s alert', (await text(w, '#sheet')).replace(/\s+/g, ' ').slice(0, 200));
await w.click('#nt-m-NVDA'); await settle(w, 1500);
ok(!rows("SELECT symbol FROM mk_alerts").length, "NVIDIA's alert turned off from there");
await w.click('#nt-m-on'); await settle(w, 1500);
ok(rows("SELECT user_id FROM mk_off").length === 1, 'and every Markets alert off, for the account');
await w.close(); pages.pop();

// ---- 11c. Send in Chat: Chat opens, with it waiting for the friend you pick ----
await p.click('.tab[data-tab="holdings"]'); await settle(p, 800);
await p.locator('.item:has-text("Tesco")').first().click(); await p.waitForSelector('button:has-text("Send in Chat")'); await settle(p, 700);
await p.click('button:has-text("Send in Chat")');
await p.waitForURL((u) => u.hostname.startsWith('chat.'), { timeout: 20000 });
await p.waitForSelector('.toast:has-text("Pick who to send it to")', { timeout: 30000 }).catch(() => {});
ok(/Pick who to send it to/.test(await text(p, '.toast')), 'Send in Chat: Chat, saying to pick who to send it to', await text(p, '.toast'));
ok(await p.evaluate(() => !location.hash), "and the words aren't left in Chat's address");
await p.goto(MKT + '/'); await p.waitForSelector('#pv', { timeout: 20000 }); await settle(p, 1200);

// ---- 12. Light, as the account may have it ----
const lc = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, colorScheme: 'light' });
await lc.addCookies(await ctx.cookies());
const lp = await lc.newPage(); await lp.goto(MKT + '/'); await lp.waitForSelector('#pv', { timeout: 20000 }); await settle(lp, 3000);
await lp.screenshot({ path: `${out}/8-light.png` });
ok(await lp.evaluate(() => getComputedStyle(document.body).color) === 'rgb(12, 20, 32)', 'light, where the device is: dark words on the pale sky');
await lc.close();

// ---- 13. Signing out: back to the start ----
await p.click('.ifh-me'); await p.waitForSelector('.ifm-pop.open'); await settle(p, 500);
ok(/Markets 1\.\d\d/.test(await text(p, '.ifm-foot')) && /Find and Add/.test(await text(p, '.ifm-pop')), "InFlite's menu: Markets and its version, and Find and Add", await text(p, '.ifm-foot'));
await p.click('.ifm-out'); await p.waitForSelector('.welcome #sign-in', { timeout: 10000 });
ok(true, 'signed out: back to the start');

ok(!errs.length, 'no errors on the page', errs.join(' ; '));
console.log(`FAILS ${fails}`);
await b.close();
process.exit(0);
