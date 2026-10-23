// The site's home page (index.html, app.js): your words over a slideshow of your photos, the apps, and a way to get in
// touch. A visitor sees Sign in; someone signed in on the site sees their photo and their figures in each app; the
// site's owner (its admin account: functions/_auth.js) sees Edit, and edits the words in place (Undo after) and the
// photos from a sheet. There's no password of the page's own any more: anyone else's change is refused. What's sent
// through Get in touch is emailed and kept, and read in Admin on the owner's account page. (gfg.test for the site.)
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import http from 'http';
import { joinInFlight } from './join.mjs';
const [,, S, out] = process.argv;
const SITE = 'http://gfg.test:8788', CHAT = 'http://chat.gfg.test:8788', ACCT = 'http://account.gfg.test:8788', PW = 'a long test password';
const sql0 = (q) => execSync(`${S}/wr/node_modules/.bin/wrangler d1 execute bio-db --local --persist-to ${S}/wrstate --command "${q.replace(/"/g, '\\"')}"`, { cwd: process.env.APP_ROOT, stdio: 'pipe' }).toString();
const sql = (q) => { for (let i = 0; ; i++) { try { return sql0(q); } catch (e) { if (i > 5 || !/SQLITE_BUSY/.test(String(e.stdout) + String(e.stderr) + e.message)) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400); } } };
let fails = 0; const errs = [];
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${extra ? '  — ' + extra : ''}`); if (!c) fails++; };
const mails = () => readFileSync(`${S}/mailbox.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).body);

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined,
  args: ['--host-resolver-rules=MAP *.gfg.test 127.0.0.1, MAP gfg.test 127.0.0.1', `--unsafely-treat-insecure-origin-as-secure=${SITE},${CHAT},${ACCT}`] });
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
async function browser(name, desktop = false) {
  const ctx = await b.newContext(desktop ? { viewport: { width: 1440, height: 900 }, locale: 'en-GB', colorScheme: 'dark' }
    : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'en-GB', isMobile: true, hasTouch: true, userAgent: IPHONE, colorScheme: 'dark' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${name}: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d|Cross-Origin-Opener-Policy header has been ignored/.test(m.text())) errs.push(`${name}: ${m.text()}`); });
  const cdp = await ctx.newCDPSession(p); await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true } });
  return { ctx, p, name };
}
// a request from outside the browser, as the browser would send it (its cookies)
async function req(x, url, { method = 'GET', headers = {}, data } = {}) {
  const u = new URL(url), cookie = x ? (await x.ctx.cookies(url)).map((c) => `${c.name}=${c.value}`).join('; ') : '';
  return new Promise((ok, no) => {
    const r = http.request({ host: '127.0.0.1', port: u.port, path: u.pathname + u.search, method, agent: false, headers: { Host: u.host, ...(cookie ? { Cookie: cookie } : {}), ...headers } }, (res) => {
      const parts = []; res.on('data', (c) => parts.push(c));
      res.on('end', () => { const body = Buffer.concat(parts).toString(); let j = null; try { j = JSON.parse(body); } catch (_) {} ok({ status: res.statusCode, json: j, body, headers: res.headers }); });
    });
    r.on('error', no); if (data) r.write(data); r.end();
  });
}
const put = (x, path, body, origin = SITE) => req(x, SITE + path, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, data: JSON.stringify(body) });
const settle = (x, ms = 700) => x.p.waitForTimeout(ms);
const home = async (x) => { await x.p.goto(`${SITE}/`); await x.p.waitForSelector('body.known', { timeout: 20000 }); await settle(x); };
const text = (x, sel) => x.p.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ').trim() || '', sel);
const shown = (x, sel) => x.p.isVisible(sel);
const shot = (x, name, full = false) => x.p.screenshot({ path: `${out}/${name}.png`, fullPage: full });
const idOf = (h) => sql(`SELECT id FROM pg_users WHERE handle = '${h}'`).match(/"id": "([^"]+)"/)[1];

// ---- 1. A visitor: the words, Sign in, the apps; nothing to change ----
const V = await browser('visitor');
await home(V);
ok(await text(V, '.hero h1') === 'George Farrow-Green' && /^Photography · Cycling · Apps$/i.test(await text(V, '.eyebrow')) && /I ride, I take photos/.test(await text(V, '.lede')),
  'the name, the line above it and the one under it', await text(V, '.hero'));
ok(await shown(V, '#sign-in') && !(await shown(V, '#edit')) && !(await shown(V, '#me')), 'a visitor: Sign in, no Edit and no photo');
ok(await V.p.getAttribute('#sign-in', 'href') === `${ACCT}/#from=home`, 'Sign in goes to the account’s page', await V.p.getAttribute('#sign-in', 'href'));
ok(await V.p.getAttribute('#app-inflight', 'href') === `${CHAT}/` && await V.p.getAttribute('#app-weather', 'href') === 'http://weather.gfg.test:8788/', 'the apps open at their own addresses');
ok(await text(V, '#app-inflight small') === 'Letters carried by pigeon' && await text(V, '#app-weather small') === 'Forecasts, radar and alerts', 'each app says what it is');
ok(await V.p.evaluate(() => [...document.querySelectorAll('.apps img')].every((i) => i.complete && i.naturalWidth > 0)), 'with its icon');
await V.p.click('#sign-in'); await V.p.waitForSelector('main .backapp', { timeout: 20000 }).catch(() => {});
ok(await text(V, 'main .backapp') === 'Home' && await V.p.isVisible('main .signin'), 'Sign in: the account’s sign-in, with Home to go back');
await V.p.click('main .backapp'); await V.p.waitForSelector('body.known', { timeout: 20000 }).catch(() => {}); await settle(V);
ok(V.p.url() === `${SITE}/`, 'and Home goes back', V.p.url());
let r = await put(V, '/api/content', { name: 'Someone Else' });
ok(r.status === 403 && /Sign in/.test(r.json?.error), 'a visitor can’t change the words', `${r.status} ${r.body}`);
r = await put(V, '/api/background', { image: 'data:image/png;base64,AAAA' });
ok(r.status === 403, 'nor add a photo', String(r.status));
r = await req(V, `${SITE}/api/history`);
ok(r.status === 403, 'nor see the words before', String(r.status));
r = await req(null, `${SITE}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, data: '{"password":"x"}' });
ok(r.status >= 400 && !r.headers['set-cookie'], 'the page’s own password sign-in is gone', String(r.status));
await shot(V, 'visitor-nophotos');

// ---- 2. Get in touch: a message from a sheet, and a thank-you ----
await V.p.click('.cta [data-contact]');
await V.p.waitForSelector('#contact-sheet[open]'); await settle(V, 500);
ok(await V.p.evaluate(() => document.body.classList.contains('sheet-up')), 'the page steps back behind the sheet');
ok(await V.p.isDisabled('#contact-send'), 'Send is off while there’s nothing to send');
ok(await V.p.evaluate(() => [...document.querySelectorAll('#contact-sheet label.fld > span')].map((e) => e.textContent).join() === 'Name,Email'), 'each field says what it’s for');
await V.p.fill('#c-name', 'Sam Okoro'); await V.p.fill('#c-email', 'sam@example');
await V.p.fill('#c-message', 'Loved the photos from the climb. Are you riding the sportive in May?');
ok(!(await V.p.isDisabled('#contact-send')), 'and on once there is');
await V.p.click('#contact-send');
ok(/email doesn’t look right/.test(await text(V, '#contact-err')), 'an email that can’t be one is said', await text(V, '#contact-err'));
await V.p.fill('#c-email', 'sam@example.com');
ok(await V.p.isHidden('#contact-err'), 'and the warning goes as it’s put right');
await shot(V, 'contact');
const mails0 = mails().length;
await V.p.click('#contact-send');
await V.p.waitForSelector('#contact-sent:not([hidden])', { timeout: 10000 }).catch(() => {});
ok(await text(V, '#contact-sent') === 'Sent Thanks, Sam. You’ll hear back by email. Done', 'sent: a tick and a thank-you', await text(V, '#contact-sent'));
const m = mails().slice(mails0).at(-1) || {};
ok(m.reply_to === 'sam@example.com' && /Loved the photos/.test(m.text || ''), 'it’s emailed, a reply going to them', `${m.reply_to}`);
ok(/Sam Okoro/.test(sql('SELECT name FROM messages')), 'and kept');
await shot(V, 'sent');
await V.p.click('#contact-sent [data-close]'); await settle(V, 500);
ok(!(await V.p.evaluate(() => document.querySelector('#contact-sheet').open || document.body.classList.contains('sheet-up'))), 'Done closes it, and the page comes back');

// ---- 3. The owner: their account (the site owner's email, confirmed); someone else's ----
const G = await browser('owner'), P = await browser('pat');
await joinInFlight(G.p, `${CHAT}/`, { name: 'Gail Owner', handle: 'gail', email: 'owner@example.com', password: PW, city: 'London', passkey: true });
await joinInFlight(P.p, `${CHAT}/`, { name: 'Pat Reed', handle: 'pat', email: 'pat@example.com', password: PW, city: 'Leeds' });
const gail = idOf('gail'), pat = idOf('pat');
sql(`UPDATE pg_users SET email_ok = 1 WHERE id = '${gail}'`);
await home(P);
ok(await shown(P, '#me') && !(await shown(P, '#sign-in')) && !(await shown(P, '#edit')), 'someone signed in: their photo’s place, no Sign in, and no Edit');
ok(await text(P, '#face') === 'P' && await P.p.getAttribute('#me', 'href') === `${ACCT}/#from=home`, 'their initial, a tap from their account');
// the account's page, from here: a way back to the home page (and Back from the home page doesn't go there again)
await P.p.click('#me'); await P.p.waitForSelector('main .backapp', { timeout: 20000 }).catch(() => {});
ok(await text(P, 'main .backapp') === 'Home' && !P.p.url().includes('#'), 'their account’s page has Home, to go back', `${await text(P, 'main .backapp')} ${P.p.url()}`);
await P.p.click('main .backapp'); await P.p.waitForSelector('body.known', { timeout: 20000 }).catch(() => {});
ok(P.p.url() === `${SITE}/`, 'Home: back on the home page', P.p.url());
await settle(P);
ok(await text(P, '#app-inflight small') === 'Letters carried by pigeon', 'an app they’ve not used yet says what it is');
r = await put(P, '/api/content', { name: 'Pat’s Page' });
ok(r.status === 403 && /owner/.test(r.json?.error), 'they can’t change the words', `${r.status} ${r.body}`);
ok(await P.p.evaluate(() => document.querySelector('#c-name').value === 'Pat Reed' && document.querySelector('#c-email').value === 'pat@example.com'), 'a message from them has their name and email filled in');
await P.p.click('.cta [data-contact]'); await P.p.waitForSelector('#contact-sheet[open]'); await settle(P, 500);
ok(await text(P, '#from') === 'P Pat Reed pat@example.com' && await P.p.isHidden('#c-name'), 'shown as one From row', await text(P, '#from'));
await P.p.click('#from-change');
ok(await P.p.isVisible('#c-name') && await P.p.isVisible('#c-email') && await P.p.isHidden('#from'), 'Change: the name and email to change');
await P.p.keyboard.press('Escape'); await settle(P, 500);

// their figures in each app: a friend, and a place with alerts
sql(`INSERT INTO pg_links (a, b, status, created_at) VALUES ('${gail}', '${pat}', 'ok', ${Date.now()})`);
sql('CREATE TABLE IF NOT EXISTS wx_accts (user_id TEXT PRIMARY KEY, data TEXT NOT NULL, ver INTEGER NOT NULL, updated INTEGER)');
sql(`INSERT INTO wx_accts (user_id, data, ver, updated) VALUES ('${gail}', '${JSON.stringify({ places: [{ name: 'London', lat: 51.5, lon: -0.1 }], settings: {}, notify: { places: [{ name: 'London', lat: 51.5, lon: -0.1, rain: true }], brief: null, briefAt: '07:00' } })}', 1, ${Date.now()})`);
await home(G);
ok(await shown(G, '#edit') && await shown(G, '#me') && !(await shown(G, '#sign-in')), 'the owner: Edit, and their photo’s place');
ok(await text(G, '#app-inflight small') === '1 friend · 0 sent' && await text(G, '#app-weather small') === '1 place · Alerts on', 'their figures in each app',
  `${await text(G, '#app-inflight small')} | ${await text(G, '#app-weather small')}`);
r = await put(G, '/api/content', { name: 'From Elsewhere' }, 'http://evil.example');
ok(r.status === 403, 'even the owner’s change is refused when another site sends it', String(r.status));
r = await put(G, '/api/content', { name: 'From Elsewhere' }, null);
ok(r.status === 403, 'or when it doesn’t say where it’s from', String(r.status));

// ---- 4. Editing the words in place, and Undo ----
await G.p.click('#edit'); await settle(G, 600);
ok(await G.p.evaluate(() => document.body.classList.contains('edit') && [...document.querySelectorAll('[data-edit]')].every((e) => e.isContentEditable)), 'Edit: the three lines can be typed in');
ok(await shown(G, '#done') && await shown(G, '#editbar') && !(await shown(G, '#edit')), 'Done in its place, and the photos’ bar at the foot');
await G.p.click('.eyebrow'); await G.p.keyboard.press('ControlOrMeta+A'); await G.p.keyboard.type('Rides · Photos · Apps');
await G.p.keyboard.press('Enter');
await G.p.click('.lede'); await G.p.keyboard.press('ControlOrMeta+A'); await G.p.keyboard.type('Out on the bike most weekends, camera in the back pocket.');
await shot(G, 'edit');
await G.p.click('#done'); await settle(G, 900);
ok(/^Saved/.test(await text(G, '#toast')) && await shown(G, '#toast-undo'), 'Done saves it: Saved, with Undo', await text(G, '#toast'));
r = await req(null, `${SITE}/api/content`);
ok(r.json?.role === 'Rides · Photos · Apps' && /camera in the back pocket/.test(r.json?.bio) && r.json?.name === 'George Farrow-Green', 'the new words are kept', r.body);
r = await req(null, `${SITE}/`);
ok(r.body.includes('data-edit>Out on the bike most weekends, camera in the back pocket.</p>') && r.body.includes('<meta name="description" content="Out on the bike most weekends'),
  'and they’re in the page as it’s sent, for search and link previews');
await G.p.click('#toast-undo'); await settle(G, 900);
ok(/I ride, I take photos/.test(await text(G, '.lede')) && /Photography/i.test(await text(G, '.eyebrow')), 'Undo puts them back', await text(G, '.lede'));
ok(/I ride, I take photos/.test((await req(null, `${SITE}/api/content`)).json?.bio || ''), 'for everyone');
// once more, kept; and Escape leaves what was there
await G.p.click('#edit'); await settle(G, 400);
await G.p.click('.eyebrow'); await G.p.keyboard.press('ControlOrMeta+A'); await G.p.keyboard.type('Rides · Photos · Apps'); await G.p.keyboard.press('Enter');
await G.p.click('#done'); await settle(G, 900);
await G.p.click('#edit'); await settle(G, 400);
await G.p.click('.hero h1'); await G.p.keyboard.press('ControlOrMeta+A'); await G.p.keyboard.type('Not This'); await G.p.keyboard.press('Escape'); await settle(G, 600);
ok(await text(G, '.hero h1') === 'George Farrow-Green' && (await req(null, `${SITE}/api/content`)).json?.name === 'George Farrow-Green' && /Rides/i.test(await text(G, '.eyebrow')),
  'Escape leaves editing without saving', await text(G, '.hero h1'));

// ---- 5. The photos: added, their focus and screens chosen, one removed ----
await G.p.click('#edit'); await settle(G, 400);
await G.p.click('#change-photos'); await G.p.waitForSelector('#photos-sheet[open]'); await settle(G, 500);
ok(/No photos yet/.test(await text(G, '#tiles')), 'no photos yet');
const APP = process.env.APP_ROOT;
await G.p.setInputFiles('#photo-input', [`${APP}/og.png`, `${APP}/apple-touch-icon.png`]);
await G.p.waitForFunction(() => document.querySelectorAll('#tiles .tile').length === 2, null, { timeout: 20000 }).catch(() => {});
ok(await G.p.evaluate(() => document.querySelectorAll('#tiles .tile').length === 2 && document.querySelectorAll('#thumbs i').length === 2 && document.querySelectorAll('#bg .slide').length === 2),
  'two photos added: in the sheet, the bar and the slideshow');
let list = (await req(null, `${SITE}/api/background`)).json.images;
const box = await G.p.locator('#tiles .tile img').first().boundingBox();
await G.p.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.3); await settle(G, 800);
list = (await req(null, `${SITE}/api/background`)).json.images;
ok(list[0].focus === '20% 30%', 'a tap on a photo: the part that stays in view', list[0].focus);
await G.p.locator('#tiles .tile .where').first().click(); await settle(G, 700);
ok(await text(G, '#tiles .tile .where') === 'Phone' && (await req(null, `${SITE}/api/background`)).json.images[0].device === 'mobile', 'its screens: Both, then Phone');
await G.p.locator('#tiles .tile .where').nth(1).click(); await settle(G, 700);
await G.p.locator('#tiles .tile .where').nth(1).click(); await settle(G, 700);
ok((await req(null, `${SITE}/api/background`)).json.images[1].device === 'desktop', 'then Computer');
r = await req(null, `${SITE}/api/background?id=${list[0].id}`);
ok(r.status === 200 && /immutable/.test(r.headers['cache-control']), 'a photo is kept by browsers for good', r.headers['cache-control']);
r = await req(null, `${SITE}/api/background?id=cover&d=mobile`, { method: 'HEAD' });
ok(r.status === 200 && /^image\//.test(r.headers['content-type']) && /max-age=600/.test(r.headers['cache-control']), 'the first one, for a link preview’s look', `${r.status} ${r.headers['content-type']}`);
await shot(G, 'photos');
G.p.once('dialog', (d) => d.accept());
await G.p.locator('#tiles .tile .rm').nth(1).click(); await settle(G, 900);
ok((await req(null, `${SITE}/api/background`)).json.images.length === 1 && await G.p.evaluate(() => document.querySelectorAll('#tiles .tile').length) === 1, 'one removed');
r = await req(P, `${SITE}/api/background`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', Origin: SITE }, data: JSON.stringify({ id: list[0].id }) });
ok(r.status === 403 && (await req(null, `${SITE}/api/background`)).json.images.length === 1, 'someone else can’t remove one', String(r.status));
await G.p.keyboard.press('Escape'); await settle(G, 500);
await G.p.click('#done'); await settle(G, 600);
ok(!(await G.p.evaluate(() => document.body.classList.contains('edit'))), 'Done: back to the page');

// ---- 6. The page, as it looks: phone (top, scrolled), computer ----
await G.p.setInputFiles('#photo-input', [`${APP}/og.png`]);
for (let i = 0; i < 40 && (await req(null, `${SITE}/api/background`)).json.images.length < 2; i++) await settle(G, 300);
await home(V);
await shot(V, 'visitor');
ok(await V.p.evaluate(() => document.querySelectorAll('#bg .slide').length === 2 && document.querySelectorAll('#bg .slide.on').length === 1 && document.querySelectorAll('#segs i').length === 2),
  'the slideshow: one photo at a time, a segment for each');
await V.p.evaluate(() => scrollTo(0, document.body.scrollHeight)); await settle(V, 800);
ok(await V.p.evaluate(() => Number(getComputedStyle(document.querySelector('.bar .mid')).opacity) > 0.5 && Number(getComputedStyle(document.querySelector('.hero h1')).opacity) < 0.2
  && getComputedStyle(document.querySelector('#soft')).visibility === 'visible' && /url\("data:image\/png/.test(document.querySelector('#soft').style.backgroundImage)),
  'scrolled: the name comes into the bar, the hero fades under it, the photo softens (a softened copy of it)');
ok(await V.p.evaluate(() => document.body.classList.contains('paused') && document.querySelector('#bg .slide.on').getAnimations().every((a) => a.playState === 'paused')),
  'and the photo holds still while it’s scrolled');
await V.p.evaluate(() => scrollTo(0, 0)); await settle(V, 500);
ok(await V.p.evaluate(() => !document.body.classList.contains('paused') && document.querySelector('#bg .slide.on').getAnimations().some((a) => a.playState === 'running')
  && Number(getComputedStyle(document.querySelector('.hero h1')).opacity) > 0.95), 'back at the top it drifts again, the name back');
await V.p.evaluate(() => scrollTo(0, document.body.scrollHeight)); await settle(V, 600);
await shot(V, 'visitor-scrolled');
await home(G); await shot(G, 'owner');
const D = await browser('desktop', true);
await D.ctx.addCookies(await G.ctx.cookies(SITE));
await home(D); await shot(D, 'desktop-owner');
ok(await D.p.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 60), 'on a computer the page fits on one screen', String(await D.p.evaluate(() => document.documentElement.scrollHeight)));

// ---- 7. Messages: in Admin on the owner's account page ----
await G.p.goto(`${ACCT}/`); await G.p.waitForSelector('main:not([aria-busy])', { timeout: 20000 }); await settle(G, 1500);
const adminText = () => G.p.evaluate(() => [...document.querySelectorAll('section.section')].find((s) => s.querySelector('h3')?.textContent === 'Admin')?.innerText.replace(/\s+/g, ' ').trim() || '');
ok(/Messages 1/.test(await adminText()), 'Admin: Messages, and how many', await adminText());
await G.p.click('section.section:has(h3:text-is("Admin")) .row:has(b:text-is("Messages"))');
await G.p.waitForFunction(() => /Sam Okoro/.test(document.querySelector('#sheet')?.innerText || ''), null, { timeout: 15000 }).catch(() => {});
const sheet = await text(G, '#sheet');
ok(/Sam Okoro/.test(sheet) && /sam@example\.com/.test(sheet) && /Are you riding the sportive in May\?/.test(sheet), 'the message: who, their email and what they wrote', sheet.slice(0, 160));
ok(await G.p.getAttribute('#sheet a.pill', 'href') === 'mailto:sam@example.com?subject=Re%3A%20your%20message', 'Reply writes back to them');
await shot(G, 'admin-messages');
r = await req(P, `${ACCT}/api/account/admin/messages`);
ok(r.status === 403, 'someone else can’t read them', String(r.status));
await G.p.click('#sheet .adm-acts button'); await settle(G, 1200);
ok(/No messages yet/.test(await text(G, '#sheet')) && !/Sam Okoro/.test(sql('SELECT name FROM messages')), 'Delete: gone', await text(G, '#sheet'));

console.log('errs', errs);
ok(!errs.length, 'no errors on any page', errs.join(' | '));
console.log(`FAILS ${fails}`);
await b.close(); process.exit(0);
