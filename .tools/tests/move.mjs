// The move to inflite.ai: the apps on a site of their own (stood in for by ifl.test), the home page on its own
// (gfg.test). georgefarrowgreen.com says inflite.ai's apps may use its passkeys; inflite.ai itself is the home page's
// apps for now; the apps' old addresses send every page on to the new ones, signed in still if the browser was (a hop:
// functions/_hop.js), and their service worker is a stand-in that only shows notifications; the home page, back from
// signing in on the account's page, is signed in itself, and signed out with it. A hop can't be forged or used twice.
import { chromium } from 'playwright';
import http from 'http';
import { execSync } from 'child_process';
import { makeAccount } from './join.mjs';
const [,, S, out] = process.argv;
const HOME = 'http://gfg.test:8788', ACCT = 'http://account.ifl.test:8788', CHAT = 'http://chat.ifl.test:8788', WX = 'http://weather.ifl.test:8788', PW = 'a long test password';
const sql0 = (q) => execSync(`${S}/wr/node_modules/.bin/wrangler d1 execute bio-db --local --persist-to ${S}/wrstate --command "${q}"`, { cwd: process.env.APP_ROOT, stdio: 'pipe' }).toString();
const rows = (q) => { const o = sql0(q), m = o.match(/"results": (\[[\s\S]*?\])\s*,\s*"success"/); return m ? JSON.parse(m[1]) : []; };
let fails = 0; const errs = [];
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${extra ? '  — ' + extra : ''}`); if (!c) fails++; };
// a request to any of the addresses, as a browser would make it (by its name), and what came back, not followed
const get = (url, { cookie } = {}) => new Promise((done, fail) => {
  const u = new URL(url);
  const r = http.request({ host: '127.0.0.1', port: 8788, path: u.pathname + u.search, agent: false, headers: { Host: u.host, ...(cookie ? { Cookie: cookie } : {}), 'Sec-Fetch-Dest': 'document' } }, (res) => {
    let t = ''; res.on('data', (x) => (t += x)); res.on('end', () => done({ status: res.statusCode, location: res.headers.location || '', cookies: res.headers['set-cookie'] || [], body: t, type: res.headers['content-type'] || '' }));
  });
  r.on('error', fail); r.end();
});
const cookieOf = (set, name) => (set.map((c) => c.split(';')[0]).find((c) => c.startsWith(name + '=')) || '');

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined,
  args: ['--host-resolver-rules=MAP *.gfg.test 127.0.0.1, MAP gfg.test 127.0.0.1, MAP *.ifl.test 127.0.0.1, MAP ifl.test 127.0.0.1', `--unsafely-treat-insecure-origin-as-secure=${HOME},${ACCT},${CHAT},${WX}`] });
async function browser(name) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'en-GB', isMobile: true, hasTouch: true });
  ctx.on('page', (p) => p.on('pageerror', (e) => errs.push(`${name}: ${e.message}`)));
  return { ctx, p: await ctx.newPage(), name };
}

// ---- 1. what the two sites say about each other ----
const wk = await get(`${HOME}/.well-known/webauthn`);
let origins = []; try { origins = JSON.parse(wk.body).origins; } catch (_) {}
ok(wk.status === 200 && /application\/json/.test(wk.type) && [ACCT, CHAT, WX, 'http://fitness.ifl.test:8788'].every((o) => origins.includes(o)),
  'the home page’s site says the apps on inflite.ai may use its passkeys', wk.body);
const apex = await get('http://ifl.test:8788/');
ok(apex.status === 302 && apex.location === `${HOME}/#apps`, 'inflite.ai itself: the home page’s apps, for now', apex.location);

// ---- 2. an account, made on the account's page (signed in for the apps' site) ----
const A = await browser('a');
await makeAccount(A.p, `${ACCT}/`, { name: 'Sam Moss', handle: 'sam', email: 'sam@example.com', password: PW });
await A.p.waitForSelector('main .hero', { timeout: 30000 });
const appsCookie = (await A.ctx.cookies(ACCT)).find((c) => c.name === 'account');
ok(appsCookie?.domain === '.ifl.test', 'signed in for every app on inflite.ai', JSON.stringify(appsCookie?.domain));

// ---- 3. the home page: Sign in, and back, signed in there too (its own sign-in, ending with the apps') ----
await A.p.goto(`${HOME}/`); await A.p.waitForSelector('#sign-in', { timeout: 20000 });
ok((await A.p.getAttribute('#app-inflight', 'href')) === `${CHAT}/` && (await A.p.getAttribute('#app-weather', 'href')) === `${WX}/`, 'the home page’s apps open on inflite.ai',
  await A.p.getAttribute('#app-inflight', 'href'));
await A.p.click('#sign-in'); await A.p.waitForURL(/account\.ifl\.test/, { timeout: 20000 });
await A.p.waitForSelector('main .signin .btn, main .hero', { timeout: 20000 }); await A.p.waitForTimeout(600);
if (await A.p.$('main .signin .btn')) await A.p.click('main .signin .btn');
await A.p.waitForURL(/^http:\/\/gfg\.test:8788\//, { timeout: 30000 }); await A.p.waitForSelector('body.signed', { timeout: 20000 });
const homeCookie = (await A.ctx.cookies(HOME)).find((c) => c.name === 'account');
ok(homeCookie?.domain === '.gfg.test' && !/api\/hop/.test(A.p.url()), 'back on the home page, signed in there too', `${A.p.url()} ${homeCookie?.domain}`);
const sessions = rows("SELECT s.parent IS NOT NULL AS held FROM pg_sessions s JOIN pg_users u ON u.id = s.user_id WHERE u.handle = 'sam'");
ok(sessions.length === 2 && sessions.filter((s) => s.held).length === 1, 'a sign-in of its own, that ends with the apps’', JSON.stringify(sessions));
await A.p.screenshot({ path: `${out}/01-home-signed-in.png` });

// ---- 4. an app's old address: every page on to the new one, signed in still ----
const B = await browser('b');
await B.ctx.addCookies([{ ...homeCookie }]);          // (signed in on the old site only, as before the move)
const wxOld = await get('http://weather.gfg.test:8788/?lat=51.5&lon=-0.12&name=London', { cookie: `account=${homeCookie.value}` });
ok(new URL(wxOld.location).searchParams.get('to') === `${WX}/?lat=51.5&lon=-0.12&name=London`, 'Weather’s old address: on to the same place at the new one', wxOld.location);
await B.p.goto('http://weather.gfg.test:8788/?lat=51.5&lon=-0.12&name=London'); await B.p.waitForLoadState('domcontentloaded');
ok(B.p.url().startsWith(`${WX}/`), 'and there, in the browser', B.p.url());
const carried = (await B.ctx.cookies(WX)).find((c) => c.name === 'account');
ok(carried?.domain === '.ifl.test', 'and signed in there too, carried over', JSON.stringify(carried?.domain));
await B.p.goto(`${ACCT}/`); await B.p.waitForSelector('main .hero', { timeout: 20000 });
ok(/Sam Moss/.test(await B.p.innerText('main')), 'the account’s page knows who you are');
const C = await browser('c');
const plain = await get('http://chat.gfg.test:8788/tracker');
ok(plain.status === 302 && plain.location === `${CHAT}/tracker`, 'not signed in: straight on, no hop', plain.location);
const signed = await get('http://chat.gfg.test:8788/tracker', { cookie: `account=${homeCookie.value}` });
ok(signed.status === 302 && signed.location.startsWith(`${ACCT}/api/hop/start?to=`), 'signed in: through a hop', signed.location);
const pigeon = await get(`${HOME}/pigeon/#open=x`);
ok(pigeon.status === 302 && pigeon.location === `${CHAT}/`, 'InFlight’s first address, /pigeon/, too', pigeon.location);
await C.p.goto('http://fitness.gfg.test:8788/'); ok(C.p.url() === 'http://fitness.ifl.test:8788/', 'Fitness’s too', C.p.url());

// ---- 5. the old address's service worker: notifications only, opened at the new address ----
for (const [old, now, at] of [['http://chat.gfg.test:8788/sw.js', CHAT, 'chat'], ['http://weather.gfg.test:8788/sw.js', WX, 'weather'], [`${HOME}/pigeon/sw.js`, CHAT, '/pigeon/']]) {
  const sw = await get(old);
  ok(sw.status === 200 && /javascript/.test(sw.type) && sw.body.includes(`const TO = "${now}"`) && /addEventListener\("push"/.test(sw.body) && !/addEventListener\("fetch"/.test(sw.body),
    `the old service worker (${at}): a stand-in, showing notifications and opening them at ${now}`, sw.body.slice(0, 120));
}

// ---- 6. a hop that isn't this browser's own isn't taken ----
const bad = await get(`${ACCT}/api/hop/start?to=${encodeURIComponent('https://evil.example/')}`);
ok(bad.status === 400, 'a hop on to anywhere off the site: refused', String(bad.status));
const start = await get(`${ACCT}/api/hop/start?to=${encodeURIComponent(`${CHAT}/`)}`);
const note = cookieOf(start.cookies, 'hop');
const issue = await get(start.location, { cookie: `account=${homeCookie.value}` });
ok(start.location.startsWith(`${HOME}/api/hop/issue?n=`) && note && issue.location.startsWith(`${ACCT}/api/hop/finish?c=`), 'start, then issue: a code for this browser’s note', issue.location);
const stolen = await get(issue.location);
ok(stolen.status === 302 && stolen.location === `${CHAT}/` && !cookieOf(stolen.cookies, 'account').replace('account=', ''), 'the code without the note it was made for (another browser): not signed in');
const again = await get(issue.location, { cookie: note });
ok(!cookieOf(again.cookies, 'account').replace('account=', ''), 'and once tried, it’s gone: not even with the note');
const start2 = await get(`${ACCT}/api/hop/start?to=${encodeURIComponent(`${CHAT}/`)}`), note2 = cookieOf(start2.cookies, 'hop');
const issue2 = await get(start2.location, { cookie: `account=${homeCookie.value}` });
const done = await get(issue2.location, { cookie: note2 });
ok(cookieOf(done.cookies, 'account').replace('account=', '').length > 20 && done.location === `${CHAT}/`, 'with its own note: signed in, and on');
const notSigned = await get(`${HOME}/api/hop/issue?n=${'a'.repeat(64)}&to=${encodeURIComponent(`${CHAT}/`)}`);
ok(notSigned.status === 302 && notSigned.location === `${CHAT}/`, 'not signed in where it’s asked: just on, with no code', notSigned.location);

// ---- 7. signing out on the account's page signs the home page out too ----
await A.p.goto(`${ACCT}/`); await A.p.waitForSelector('main .hero', { timeout: 20000 });
await A.p.click('main .row.action.danger'); await A.p.waitForTimeout(1500);
const me = await get(`${HOME}/api/me`, { cookie: `account=${homeCookie.value}` });
ok(/"signedIn":false/.test(me.body), 'signed out on inflite.ai: the home page’s sign-in ends with it', me.body.slice(0, 80));

ok(errs.length === 0, 'no errors on any page', errs.slice(0, 4).join(' | '));
console.log(`FAILS ${fails}`);
await b.close();
