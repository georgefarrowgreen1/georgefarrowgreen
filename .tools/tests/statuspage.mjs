// status.inflite.ai on the site as a Worker (its workers.dev address is where the ticker reports): a
// report taken there with the jobs' key, and refused without it; the page at status.ifl.test drawing it (each address,
// each job, the verdict), an open row's 24 hours, light and dark at a phone's size and a desk's, nothing sideways; the
// page's files not at any other address. Here Today's and Mail's Workers aren't running, so from inside (over their
// links) they don't answer: the page says so, though the report from outside said they were fine.
//   run.sh statuspage   (needs: worker)
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import http from 'node:http';

const OUT = process.argv[3] || '/tmp/statuspage'; mkdirSync(OUT, { recursive: true });
let fails = 0;
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${!c && extra ? '  — ' + extra : ''}`); if (!c) fails++; };
// (a request to the site at 8788 as the given address)
const ask = (host, path, { method = 'GET', body, auth } = {}) => new Promise((done, fail) => {
  const r = http.request({ host: '127.0.0.1', port: 8788, path, method, headers: { Host: host, ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) } }, (res) => {
    let t = ''; res.on('data', (c) => (t += c)); res.on('end', () => done({ status: res.statusCode, headers: res.headers, text: t }));
  });
  r.on('error', fail); if (body) r.write(body); r.end();
});
const TICK = 'inflite-apps.georgefarrowgreen.workers.dev', SECRET = 'tick-test-secret';
const IDS = ['today', 'chat', 'weather', 'fitness', 'markets', 'mail', 'auth', 'account', 'home'];
const JOBS = ['/api/pigeon/notify-tick', '/api/weather/tick', '/api/fitness/garmin-tick', '/api/markets/tick', '/api/today/tick'];
const report = JSON.stringify({ checks: IDS.map((id) => ({ id, s: id === 'home' ? 'none' : 'ok', ms: 140, why: id === 'home' ? 'bot check' : null })), jobs: JOBS.map((path, i) => ({ path, ok: i !== 3, ms: 900 })) });

ok((await ask(TICK, '/api/status/report', { method: 'POST', body: report })).status === 401, 'a report without the key: refused');
ok((await ask('status.ifl.test:8788', '/api/status/report', { method: 'POST', body: report, auth: SECRET })).status === 404, 'nor at the page’s own address');
const kept = await ask(TICK, '/api/status/report', { method: 'POST', body: report, auth: SECRET });
ok(kept.status === 200 && JSON.parse(kept.text).kept === true, 'a report taken at the workers.dev address with the key', kept.text.slice(0, 200));
const api = await ask('status.ifl.test:8788', '/api/status');
const j = api.status === 200 ? JSON.parse(api.text) : null;
ok(j && j.services.map((s) => s.id).join() === IDS.join(), 'the page’s answer: every address, in order', api.text.slice(0, 200));
const by = Object.fromEntries((j?.services || []).map((s) => [s.id, s]));
ok(by.chat?.s === 'ok' && by.chat.version && by.chat.ms === 140, 'Chat working, its version from its files', JSON.stringify(by.chat));
ok(by.today?.s === 'down' && by.mail?.s === 'down', 'Today and Mail not answering from inside: down, whatever the outside said', `${by.today?.s} ${by.mail?.s}`);
ok(by.home?.s === 'down', 'the home page behind a bot check: asked from inside over its link instead, and its Worker isn’t running here, so down');
ok(j?.jobs.find((x) => x.id === 'mkttick')?.s === 'down' && j.jobs.filter((x) => x.s === 'ok').length === 4, 'the jobs: Market alerts failed, the rest ran');
ok(!api.text.includes('fitting'), 'no Fit Studio');
ok((await ask('chat.ifl.test:8788', '/status/')).status === 404 && (await ask('chat.ifl.test:8788', '/status/app.js')).status === 404, 'the page’s files at no other address');
ok((await ask('chat.ifl.test:8788', '/api/status')).status !== 200 || !(await ask('chat.ifl.test:8788', '/api/status')).text.includes('services'), 'nor its answers');
const page = await ask('status.ifl.test:8788', '/');
ok(page.status === 200 && /default-src 'none'/.test(page.headers['content-security-policy'] || '') && /worker-src 'self'/.test(page.headers['content-security-policy'] || ''), 'the page, with its own strict rules (and its service worker allowed)', `${page.status} ${page.headers['content-security-policy']}`);
const seed = /<script type="application\/json" id="seed">([^<]*)<\/script>/.exec(page.text);
ok(seed && JSON.parse(seed[1]).services.length === IDS.length, 'the page arrives with the answer in it: drawn at once, no wait for /api/status');
const sw = await ask('status.ifl.test:8788', '/sw.js'), man = await ask('status.ifl.test:8788', '/manifest.webmanifest');
ok(sw.status === 200 && /showNotification/.test(sw.text) && man.status === 200 && /manifest\+json/.test(man.headers['content-type'] || ''), 'its service worker and its manifest', `${sw.status} ${man.status} ${man.headers['content-type']}`);
const hours = await ask('status.ifl.test:8788', `/api/status/hours?svc=chat&day=${j.dayKeys.at(-1)}`), hj = hours.status === 200 ? JSON.parse(hours.text) : {};
ok(hj.kept === true && hj.q?.length === 96, 'a day’s quarter-hours', hours.text.slice(0, 120));
const code = await ask('status.ifl.test:8788', '/api/status/code?c=IF-C-ZZZZZ');
ok(code.status === 200 && JSON.parse(code.text).found === false, 'a code looked up: not seen', code.text);
ok((await ask('status.ifl.test:8788', '/api/status/code?c=nonsense')).status === 400, 'and nonsense refused');
const key = await ask('status.ifl.test:8788', '/api/status/push-key');
ok(key.status === 200 && JSON.parse(key.text).key?.length > 40, 'the push key, for updates without an account', key.text.slice(0, 80));
const bad = await ask('status.ifl.test:8788', '/api/status/subscribe', { method: 'POST', body: JSON.stringify({ sub: { endpoint: 'https://evil.example/x', keys: {} }, apps: ['chat'] }) });
ok(bad.status === 400, 'a subscription to anywhere but a push service: refused', `${bad.status} ${bad.text}`);

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined),
  args: ['--host-resolver-rules=MAP status.ifl.test 127.0.0.1'] });
for (const [w, scheme] of [[390, 'dark'], [390, 'light'], [1100, 'light'], [1100, 'dark']]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 }, colorScheme: scheme, deviceScaleFactor: 1 }), errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Cross-Origin-Opener-Policy header has been ignored/.test(m.text()) && errs.push(m.text()));   // (over the tests' plain http only)
  await p.goto('http://status.ifl.test:8788/', { waitUntil: 'networkidle' });
  await p.waitForSelector('.app');
  const title = await p.textContent('#verdict h2');
  ok(/^Today, Mail, Home page, Market alerts.* aren’t answering$/.test(title), `${w} ${scheme}: the verdict names what’s down`, title);
  ok(/last checked/.test(await p.textContent('#verdict .vstats')), `${w} ${scheme}: when it was last checked`);
  ok((await p.locator('.app').count()) === 9 && (await p.locator('.group:has(h2:text-is("Scheduled jobs")) .tile').count()) === 5 && (await p.locator('.group:has(h2:text-is("What the apps rely on")) .tile').count()) >= 3, `${w} ${scheme}: nine addresses, five jobs, what they rely on`);
  ok((await p.locator('.app[data-id="chat"] .days button').count()) === 1, `${w} ${scheme}: bars only from the first day checked`);
  ok((await p.locator('.app img, .app svg').count()) >= 9, `${w} ${scheme}: each with its logo`);
  await p.locator('.arow[data-toggle="chat"]').click();
  await p.waitForFunction(() => { const d = document.querySelector('.app[data-id="chat"] .chart'); return d && !/Loading/.test(d.textContent); }, null, { timeout: 10000 }).catch(() => {});
  const day = await p.textContent('.app[data-id="chat"] .chart');
  ok(/A line appears after a few more checks/.test(day), `${w} ${scheme}: Chat’s row open, its 24 hours (one check so far)`, day);
  const cks = await p.locator('.app[data-id="chat"] .checks > div').allInnerTexts();
  ok(cks.length === 3 && /Answers/.test(cks[0]) && /Database and storage/.test(cks[1]) && /Chat notifications/.test(cks[2]), `${w} ${scheme}: and its checks: it answers, the database, its job`, cks.join(' | '));
  await p.locator('.app[data-id="chat"] .days button').first().click();
  await p.waitForSelector('#sheet.on #hours .q', { timeout: 10000 }).catch(() => {});
  ok((await p.locator('#hours .q i').count()) === 96 && /1 check · none slow|checks · none slow/.test(await p.textContent('#sheet .sub2')), `${w} ${scheme}: a day tapped: its counts and its quarter-hours`, await p.textContent('#sheet').catch(() => ''));
  await p.waitForTimeout(350);
  if (w === 390) await p.screenshot({ path: `${OUT}/status-${w}-${scheme}-day.png` });
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.fill('#lookIn', 'if c zzzzz'); await p.press('#lookIn', 'Enter');
  await p.waitForFunction(() => /seen/.test(document.querySelector('#found')?.textContent || ''), null, { timeout: 10000 }).catch(() => {});
  ok(/IF-C-ZZZZZ/.test(await p.textContent('#found')) && (await p.inputValue('#lookIn')) === 'IF-C-ZZZZZ', `${w} ${scheme}: a code typed any way, looked up`, await p.textContent('#found'));
  await p.click('#subBtn');
  await p.waitForSelector('#sheet.on .chips', { timeout: 5000 }).catch(() => {});
  ok((await p.locator('#sheet .chip').count()) === 6, `${w} ${scheme}: Get updates: the six apps to choose from`);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${w} ${scheme}: nothing sideways`);
  ok(!errs.length, `${w} ${scheme}: no errors`, errs.join(' | '));
  await p.screenshot({ path: `${OUT}/status-${w}-${scheme}.png`, fullPage: true });
  await p.close();
}
{
  // (a phone that slept for hours and wakes with no connection: the page says it's behind, not that the checks are late;
  // and once it's back, the latest)
  const p = await b.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 1 });
  await p.clock.install();
  await p.goto('http://status.ifl.test:8788/', { waitUntil: 'networkidle' });
  await p.waitForSelector('.app');
  await p.route('**/api/status', (r) => r.abort());
  await p.clock.fastForward('03:00:00');
  await p.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await p.waitForFunction(() => /out of date/.test(document.querySelector('#verdict h2')?.textContent || ''), null, { timeout: 5000 }).catch(() => {});
  const behind = await p.textContent('#verdict');
  ok(/This page is out of date/.test(behind) && /Trying again/.test(behind) && !/running late/.test(behind), 'woken with no connection: the page says it’s behind, not that the checks are late', behind);
  await p.unroute('**/api/status');
  await p.clock.fastForward('00:00:16');
  await p.waitForFunction(() => !/out of date/.test(document.querySelector('#verdict h2')?.textContent || ''), null, { timeout: 5000 }).catch(() => {});
  // (the page's clock is three hours on from the checks' here, so what it's then told is, rightly, the checks running late)
  ok(/running late/.test(await p.textContent('#verdict h2')), 'and once it’s back, asked again by itself: the latest, judged as such', await p.textContent('#verdict h2'));
  await p.close();
}
await b.close();
console.log(`FAILS ${fails}`);
process.exit(fails ? 1 : 0);
