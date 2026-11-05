// status.inflite.ai on the site as a Worker (SERVE=worker: its workers.dev address is where the ticker reports): a
// report taken there with the jobs' key, and refused without it; the page at status.ifl.test drawing it (each address,
// each job, the verdict), an open row's 24 hours, light and dark at a phone's size and a desk's, nothing sideways; the
// page's files not at any other address. Here Today's and Mail's Workers aren't running, so from inside (over their
// links) they don't answer: the page says so, though the report from outside said they were fine.
//   SERVE=worker run.sh statuspage   (needs: worker)
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
ok(page.status === 200 && /default-src 'none'/.test(page.headers['content-security-policy'] || ''), 'the page, with its own strict rules', `${page.status} ${page.headers['content-security-policy']}`);

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined),
  args: ['--host-resolver-rules=MAP status.ifl.test 127.0.0.1'] });
for (const [w, scheme] of [[390, 'dark'], [390, 'light'], [1100, 'light'], [1100, 'dark']]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 }, colorScheme: scheme, deviceScaleFactor: 1 }), errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Cross-Origin-Opener-Policy header has been ignored/.test(m.text()) && errs.push(m.text()));   // (over the tests' plain http only)
  await p.goto('http://status.ifl.test:8788/', { waitUntil: 'networkidle' });
  await p.waitForSelector('.item');
  const title = await p.textContent('#vtitle');
  ok(/^Today, Mail, Home page, Market alerts.* are down$/.test(title), `${w} ${scheme}: the verdict names what’s down`, title);
  ok((await p.locator('.item').count()) === 9 && (await p.locator('.group:has(h2:text-is("Behind the scenes")) .tile').count()) === 5 && (await p.locator('.group:has(h2:text-is("What they rely on")) .tile').count()) >= 3, `${w} ${scheme}: nine addresses, five jobs, what they rely on`);
  ok((await p.locator('.bars').first().locator('i').count()) === 90, `${w} ${scheme}: ninety days of bars`);
  ok(/Live · checked/.test(await p.textContent('#live')), `${w} ${scheme}: when it was checked`);
  await p.locator('.item[data-svc="chat"] .row').click();
  await p.waitForFunction(() => { const d = document.querySelector('.item[data-svc="chat"] .day'); return d && d.textContent && !/Loading/.test(d.textContent); }, null, { timeout: 10000 }).catch(() => {});
  const day = await p.textContent('.item[data-svc="chat"] .day');
  ok(/Not enough checks yet/.test(day), `${w} ${scheme}: Chat’s row open, its 24 hours (one check so far)`, day);
  const cks = await p.locator('.item[data-svc="chat"] .checks > div').allInnerTexts();
  ok(cks.length === 3 && /Answers/.test(cks[0]) && /Database and storage/.test(cks[1]) && /Chat notifications/.test(cks[2]), `${w} ${scheme}: and its checks: it answers, the database, its job`, cks.join(' | '));
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${w} ${scheme}: nothing sideways`);
  ok(!errs.length, `${w} ${scheme}: no errors`, errs.join(' | '));
  await p.waitForTimeout(400);   // (the row's opening)
  await p.screenshot({ path: `${OUT}/status-${w}-${scheme}.png`, fullPage: true });
  await p.close();
}
await b.close();
console.log(`FAILS ${fails}`);
process.exit(fails ? 1 : 0);
