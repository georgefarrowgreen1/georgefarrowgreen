// needs: hub mail
// Mail in InFlite's window (Today First, spec §9.4, §14.3): the site's admin opens Apps → Mail, and /mail/ (the hub's
// own small page, the inflite repo's today/src/mailhost.js) frames Mail at its own address (email.ifl.test, Mail's
// Worker), which knows it's framed (html.embed) and says hello to the hub; one Back to Apps, the hub's bar's (nothing in
// Mail's own in your photo's place); Mail's page has one Content-Security-Policy, framed by the hubs alone; Mail's Sign
// In goes the whole window to the sign-in page and the code comes back into the frame, where Mail's own hand-back is
// taken by the account; a message from another frame or another address, or a Sign In whose word could carry another
// part of an address, is ignored; Back to Apps lands on /#apps after moving about inside Mail (never history's back); someone not
// the admin has no Mail tile (and Mail itself, in the frame, doesn't let them in); Mail at its own address is as it
// was; and a page at another address can't frame Mail at all. One window throughout, no CSP violation, and no error on
// Mail's pages.
import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { kit } from './lib.mjs';
import { hostCall } from './handback.mjs';
import { makeAccount, PASSWORD } from './join.mjs';

const [,, S, out] = process.argv;
const K = await kit(S, out);
const { ok, one, hubPhone, hostAsk, HUB, errs } = K;
const MAIL = 'http://email.ifl.test:8788', ACCT = 'http://account.ifl.test:8788', AUTH = 'http://auth.ifl.test:8788';
const b64u = (u) => Buffer.from(u).toString('base64url');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// (every message any window or frame of a page is sent, as it's heard there: what it said and from which address)
const HEAR = () => addEventListener('message', (e) => { try { (window.__msgs ||= []).push({ data: JSON.parse(JSON.stringify(e.data ?? null)), origin: e.origin }); } catch (_) {} });
const SAY_CSP = () => document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`));

// ---- George, the site's admin (a passkey on the account, signed in just now), and his Home Screen InFlite ----
const george = await hubPhone('george', await K.makeKeys());
const { p, ctx, pages } = george;
await ctx.addInitScript(HEAR);
await ctx.addInitScript(SAY_CSP);
const navs = []; p.on('framenavigated', (f) => { if (f === p.mainFrame()) navs.push(f.url()); });
const frameNavs = []; p.on('framenavigated', (f) => { if (f.name() === 'ifl-mail') frameNavs.push(f.url()); });
// (Mail's page as each time it's fetched: every Content-Security-Policy header it came with)
// (Mail's own hand-back, from the frame: what it sent and what it was answered)
const handbacks = [];
p.on('request', (r) => { if (r.method() === 'POST' && r.url() === `${MAIL}/api/auth/handback`) handbacks.push({ frame: r.frame()?.name(), body: (() => { try { return JSON.parse(r.postData() || 'null'); } catch (_) { return null; } })(), status: null, req: r }); });
p.on('response', (r) => { const h = handbacks.find((x) => x.req === r.request()); if (h) h.status = r.status(); });
const mailDocs = []; p.on('response', async (r) => { if (r.url().startsWith(`${MAIL}/`) && r.request().resourceType() === 'document') mailDocs.push({ url: r.url(), csp: (await r.headersArray()).filter((h) => h.name.toLowerCase() === 'content-security-policy').map((h) => h.value) }); });
await makeAccount(p, `${ACCT}/`, { name: 'George Farrow-Green', handle: 'georgemail', email: 'george@example.com', password: PASSWORD });
const gid = one("SELECT id FROM pg_users WHERE handle = 'georgemail'")[0]?.id;
one(`INSERT OR REPLACE INTO pg_meta (k, v) VALUES ('admin_user', '${gid}')`);
one(`INSERT OR IGNORE INTO pg_passkeys (id, user_id, public_key, alg, created_at) VALUES ('hubmail-key', '${gid}', 'x', -7, ${Date.now()})`);
ok(!!gid, 'George’s account, made on the account’s page, the site’s admin with a passkey');

// (a message to Mail, as the mail that comes to it: through Mail's Worker's own email handler, which wrangler dev answers
// only at its own local address)
function deliver(from, subject, words) {
  const raw = [`From: ${from}`, 'To: hello@inflite.ai', `Subject: ${subject}`, `Message-ID: <${randomBytes(8).toString('hex')}@example.com>`, `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', '', words, ''].join('\r\n');
  const addr = /<([^>]+)>/.exec(from)?.[1] || from;
  return new Promise((done) => {
    const q = http.request({ host: '127.0.0.1', port: 8806, method: 'POST', agent: false, path: `/cdn-cgi/handler/email?from=${encodeURIComponent(addr)}&to=hello%40inflite.ai`,
      headers: { 'Content-Type': 'message/rfc822', 'Content-Length': Buffer.byteLength(raw) } }, (res) => { res.resume(); res.on('end', () => done(res.statusCode)); });
    q.on('error', () => done(0)); q.end(raw);
  });
}
const delivered = await deliver('Rowan Ash <rowan@example.com>', 'Lunch on Thursday?', 'Shall we meet at noon, by the river?');
ok(delivered >= 200 && delivered < 300, 'a message comes to Mail', String(delivered));

// ---- 1. Apps → Mail: the hub's /mail/, framing Mail at its own address, which knows it ----
const mailErrs0 = errs.length;
await p.goto(HUB + '/#apps');
const tile = await p.waitForSelector('a.ifl-tile[data-app="mail"], .ifl-tile[data-app="mail"] > a.ifl-tile-main, .atile[data-app="mail"] a.atile-go', { timeout: 30000 }).then(() => true, () => false);
ok(tile && (await p.$eval('a.ifl-tile[data-app="mail"], .ifl-tile[data-app="mail"] > a.ifl-tile-main, .atile[data-app="mail"] a.atile-go', (a) => a.getAttribute('href'))) === '/mail/', 'Apps: Mail’s tile for its admin, at /mail/');
await p.screenshot({ path: `${out}/apps.png` });
await p.click('a.ifl-tile[data-app="mail"], .ifl-tile[data-app="mail"] > a.ifl-tile-main, .atile[data-app="mail"] a.atile-go');
await p.waitForURL(`${HUB}/mail/`, { timeout: 20000 });
const fr = () => p.frame({ name: 'ifl-mail' });
const listed = await p.waitForFunction(() => document.querySelector('iframe[name="ifl-mail"]')?.src, null, { timeout: 15000 }).then(() => true, () => false);
// (Mail's list, open in the frame: its bar, with New Message)
const LISTED = '.pane.list .navbar .gbtn[aria-label="New Message"]';
const inMail = listed && await fr()?.waitForSelector(LISTED, { timeout: 30000 }).then(() => true, () => false);
const seen = inMail ? await fr().evaluate(() => ({ embed: document.documentElement.classList.contains('embed'), at: location.href,
  nav: [...document.querySelector('.pane.list .navbar').children].map((c) => c.getAttribute('aria-label') || c.className), photo: !!document.querySelector('.pane.list .gbtn.profile'),
  back: [...document.querySelectorAll('button, a')].filter((b) => /\bapps\b/i.test(`${b.getAttribute('aria-label') || ''} ${b.textContent}`)).length, heard: (window.__msgs || []).filter((m) => m.data?.ifl) })) : null;
ok(seen?.at === `${MAIL}/` && seen.embed === true, '/mail/ frames Mail at its own address, and Mail knows it’s framed (html.embed)', JSON.stringify(seen));
ok(seen && !seen.photo && seen.back === 0 && JSON.stringify(seen.nav) === JSON.stringify(['large-title', 'spacer', 'New Message']),
  'in the frame, nothing in your photo’s place and no second Back to Apps (the hub’s bar has the one)', JSON.stringify(seen));
// (the line under the lens's name lined up with the name, where your photo isn't)
// (where each one's words start: its first text, as drawn)
const lined = inMail ? await fr().evaluate(() => { const at = (s) => { const e = document.querySelector(s); if (!e || e.hidden) return null;
  const t = document.createTreeWalker(e, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.textContent.trim() ? 1 : 3) }).nextNode(); if (!t) return null;
  const r = document.createRange(); r.selectNodeContents(t); return { x: Math.round(r.getBoundingClientRect().left), text: t.textContent.trim() }; };
  return { title: at('.pane.list .navbar .large-title'), sub: at('.pane.list .subtitle') }; }) : null;
ok(lined?.title && lined.sub && Math.abs(lined.title.x - lined.sub.x) <= 3, 'and the line under its name (“1 unread”) lined up with the name', JSON.stringify(lined));
ok(JSON.stringify(seen?.heard) === JSON.stringify([{ data: { ifl: 'hello', v: 1 }, origin: HUB }]), 'the hub answered Mail’s hello, from the hub’s address', JSON.stringify(seen?.heard));
const host = await p.evaluate(() => ({ heard: (window.__msgs || []).filter((m) => m.data?.ifl), own: document.querySelector('.mh-own') && [document.querySelector('.mh-own').href, document.querySelector('.mh-own').target, document.querySelector('.mh-own').rel],
  back: document.querySelector('.mh-back')?.getAttribute('aria-label'), title: document.title, hub: document.querySelector('meta[name="ifl-hub"]')?.content ?? null }));
ok(JSON.stringify(host.heard) === JSON.stringify([{ data: { ifl: 'hello', v: 1 }, origin: MAIL }]), 'Mail said hello to the hub, from Mail’s address', JSON.stringify(host.heard));
ok(host.back === 'Back to Apps' && JSON.stringify(host.own) === JSON.stringify([`${MAIL}/`, '_blank', 'noopener']) && host.title === 'Mail', 'the bar: Back to Apps, and Open Mail on Its Own (a window of its own)', JSON.stringify(host));
const page = await hostAsk('ifl.test:8788', '/mail/');
ok(page.status === 200 && page.headers['content-security-policy'] === `default-src 'self'; script-src 'self'; style-src 'self'; frame-src ${MAIL}; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`
  && page.headers['x-robots-tag'] === 'noindex' && page.headers['cache-control'] === 'no-cache, private' && page.headers['cross-origin-opener-policy'] === 'same-origin',
  'the hub’s /mail/: its own rules (Mail’s address the one thing it frames, framed by nothing)', JSON.stringify(page.headers));

// ---- 2. Mail's page: one policy, framed by the hub alone ----
const doc = mailDocs.find((d) => d.url === `${MAIL}/`);
ok(doc && doc.csp.length === 1 && doc.csp[0].endsWith('; frame-ancestors http://ifl.test:8788') && !/'none'/.test(doc.csp[0].split('frame-ancestors')[1]),
  'Mail’s page came with one Content-Security-Policy, framed by the hub alone', JSON.stringify(doc));
const direct = await hostAsk('email.ifl.test:8788', '/'), file = await hostAsk('email.ifl.test:8788', '/app.js');
ok(direct.status === 200 && /frame-ancestors http:\/\/ifl\.test:8788$/.test(direct.headers['content-security-policy']) && !direct.headers['content-security-policy'].includes(', '),
  'asked straight: the same one policy', direct.headers['content-security-policy']);
ok(/frame-ancestors 'none'$/.test(file.headers['content-security-policy'] || ''), 'Mail’s other files: framed by no one, as before', file.headers['content-security-policy']);
await wait(800);
await p.screenshot({ path: `${out}/mail.png` });
// (the bar on one line, nothing over anything and no sideways scroll, at 390 and 320 wide, and on its side)
for (const [w, h] of [[390, 844], [320, 568], [844, 390]]) {
  await p.setViewportSize({ width: w, height: h });
  await wait(300);
  const bar = await p.evaluate(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(), b = r('.mh-back'), o = r('.mh-own'), f = r('iframe[name="ifl-mail"]');
    return { overlap: b.right > o.left, own: Math.round(o.height), back: Math.round(b.height), scroll: document.documentElement.scrollWidth - innerWidth, frame: Math.round(f.width) === innerWidth && f.height > 0 && f.top >= b.bottom - 1 }; });
  ok(!bar.overlap && bar.own <= 48 && bar.back >= 44 && bar.scroll <= 0 && bar.frame, `the bar at ${w}×${h}: one line, its buttons a finger high, the frame the width under it`, JSON.stringify(bar));
  if (w === 320) await p.screenshot({ path: `${out}/mail-320.png` });
}
await p.setViewportSize({ width: 390, height: 844 });

// ---- 3. what's not Mail's frame, or not Mail's word, is ignored ----
const stays = async (what, act) => { await act(); await wait(900); ok(p.url() === `${HUB}/mail/`, `${what}: ignored`, p.url()); };
await stays('“back” from the hub’s page itself, not the frame', () => p.evaluate(() => postMessage({ ifl: 'back' }, '*')));
await p.evaluate(() => { const f = document.createElement('iframe'); f.name = 'blank'; document.body.append(f); });
await stays('“back” from another frame, at the hub’s address', () => p.frame({ name: 'blank' }).evaluate(() => parent.postMessage({ ifl: 'back' }, '*')));
await p.evaluate((m) => { const f = document.createElement('iframe'); f.name = 'other'; f.src = m + '/'; document.body.append(f); }, MAIL);
for (let i = 0; i < 40 && !p.frame({ name: 'other' })?.url().startsWith('http'); i++) await wait(250);
const other = p.frame({ name: 'other' });
await other?.waitForLoadState('domcontentloaded').catch(() => {});
await stays('“back” from another frame at Mail’s own address', () => other.evaluate((h) => parent.postMessage({ ifl: 'back' }, h), HUB));
await stays('Sign In from another frame at Mail’s own address', () => other.evaluate((h) => parent.postMessage({ ifl: 'signin', ask: 'n4bQgYhMLqsPy5k9sA2FbvO0H3NWdF7Z8xJcU1ePtRw' }, h), HUB));
await stays('Sign In from Mail’s frame with “&” in its word (another part of the address)', () => fr().evaluate((h) => parent.postMessage({ ifl: 'signin', ask: 'n4bQgYhMLqsPy5k9sA2Fbv&back=http://evil.example/' }, h), HUB));
await stays('Sign In from Mail’s frame with a word too short', () => fr().evaluate((h) => parent.postMessage({ ifl: 'signin', ask: 'short' }, h), HUB));
await p.evaluate(() => document.querySelectorAll('iframe[name=blank], iframe[name=other]').forEach((f) => f.remove()));

// ---- 4. moving about inside Mail, then Back to Apps: /#apps, never history's back ----
const row = inMail && await fr().waitForSelector('.row-wrap[data-id] .row', { timeout: 20000 }).then(() => true, () => false);
ok(row, 'the message that came is in Mail’s list');
let moved = false;
if (row) {
  const before = await p.evaluate(() => history.length);
  await fr().click('.row-wrap[data-id] .row');
  moved = await fr().waitForSelector('.pane.detail[data-pos=current]', { timeout: 15000 }).then(() => true, () => false);
  const after = await p.evaluate(() => history.length);
  ok(moved && after > before, 'inside Mail: the conversation open, a step in the window’s history of Mail’s own', `${before} → ${after}`);
  await wait(700);
  await p.screenshot({ path: `${out}/mail-thread.png` });
}
await p.click('.mh-back');
await p.waitForURL(`${HUB}/#apps`, { timeout: 15000 }).catch(() => {});
ok(p.url() === `${HUB}/#apps` && await p.waitForSelector('.ifl-tile[data-app="mail"], .atile[data-app="mail"]', { timeout: 15000 }).then(() => true, () => false), 'Back to Apps (the bar’s): /#apps, after moving about inside Mail', p.url());
// (and Back said from Mail's frame itself, { ifl: "back" }, as the spec lets Mail say it: the same)
await p.click('a.ifl-tile[data-app="mail"], .ifl-tile[data-app="mail"] > a.ifl-tile-main, .atile[data-app="mail"] a.atile-go');
await p.waitForURL(`${HUB}/mail/`, { timeout: 15000 });
await fr()?.waitForSelector(LISTED, { timeout: 30000 }).catch(() => {});
await fr()?.evaluate((h) => parent.postMessage({ ifl: 'back' }, h), HUB).catch(() => {});
await p.waitForURL(`${HUB}/#apps`, { timeout: 15000 }).catch(() => {});
ok(p.url() === `${HUB}/#apps`, 'Back said from Mail’s frame: /#apps', p.url());

// ---- 5. Mail's Sign In: the whole window to the sign-in page, the code back into the frame ----
// (shown it's him 13 hours ago: Mail asks him to confirm it; Mail's Worker keeps a yes for 10 seconds)
one(`UPDATE pg_sessions SET auth_at = ${Date.now() - 13 * 3600e3} WHERE user_id = '${gid}'`);
await wait(11000);
await p.goto(`${HUB}/mail/`);
const gate = await fr()?.waitForSelector('.login[data-access=reauth] .w-go', { timeout: 30000 }).then(() => true, () => false);
ok(gate, 'Mail, in the frame, asks him to confirm it’s him');
await p.screenshot({ path: `${out}/mail-reauth.png` });
const navs0 = navs.length;
// (its Sign In beats gently for ever: clicked without waiting for it to be still)
await fr()?.click('.login .w-go', { force: true });
const atAuth = await p.waitForURL((u) => u.host === 'auth.ifl.test:8788', { timeout: 20000 }).then(() => true, () => false);
const trip = navs.slice(navs0).find((u) => u.startsWith(`${AUTH}/`)) || '';
const tp = new URLSearchParams(trip.split('#')[1] || '');
ok(atAuth && tp.get('signin') === 'mail' && /^[A-Za-z0-9_-]{43}$/.test(tp.get('ask') || '') && tp.get('back') === `${HUB}/mail/`,
  'Sign In: the whole window to the sign-in page, for Mail, with its word’s hash, back to the hub’s /mail/', trip.slice(0, 160));
ok(!frameNavs.some((u) => u.startsWith(AUTH)), 'the frame itself never went to the sign-in page (which is never framed)', JSON.stringify(frameNavs.filter((u) => !u.startsWith(MAIL))));
if (atAuth) {
  await p.waitForSelector('main .welcome .signin .btn', { timeout: 20000 });
  await wait(500);
  await p.click('main .welcome .signin .btn');
  const asked = await Promise.race([p.waitForSelector('#sheet[open] input[type=password]', { timeout: 15000 }).then(() => true), p.waitForURL((u) => u.host === 'ifl.test:8788', { timeout: 15000 }).then(() => false)]).catch(() => false);
  if (asked) { await p.fill('#sheet input[type=password]', PASSWORD); await p.click('#sheet form .btn'); }
  // (a passkey offered on the way: Not Now)
  const offer = await Promise.race([p.waitForURL((u) => u.host === 'ifl.test:8788', { timeout: 30000 }).then(() => false), p.waitForSelector('main .signin.offer .link', { timeout: 30000 }).then(() => true)]).catch(() => false);
  if (offer && new URL(p.url()).host !== 'ifl.test:8788') await p.click('main .signin.offer .link');
  await p.waitForURL((u) => u.host === 'ifl.test:8788', { timeout: 30000 }).catch(() => {});
}
const back = navs.slice(navs0).find((u) => u.startsWith(`${HUB}/mail/#signin=`)) || '';
ok(/^http:\/\/ifl\.test:8788\/mail\/#signin=[A-Za-z0-9_-]{16,128}(&|$)/.test(back), 'the sign-in page sent the code back to the hub’s /mail/', back.slice(0, 80));
const inAgain = await fr()?.waitForSelector(LISTED, { timeout: 30000 }).then(() => true, () => false);
const after = inAgain ? await fr().evaluate(() => ({ at: location.href, gate: !!document.querySelector('.login'), kept: sessionStorage.getItem('inflite:signin-verifier') })) : null;
// (Mail's own hand-back, in the frame: the code that came back, and the word it kept in this tab before the trip, whose
// hash is what went to the sign-in page)
const code = new URLSearchParams(back.split('#')[1] || '').get('signin'), hb = handbacks.at(-1);
const hashOf = (w) => createHash('sha256').update(String(w)).digest('base64url');
ok(handbacks.length === 1 && hb.frame === 'ifl-mail' && hb.body?.code === code && hashOf(hb.body?.verifier) === tp.get('ask'),
  'in the frame, Mail’s own hand-back: the code that came back, with the word it kept in this tab through the trip (its hash the one sent)', JSON.stringify(handbacks.map((h) => ({ frame: h.frame, code: h.body?.code === code, word: hashOf(h.body?.verifier) === tp.get('ask'), status: h.status }))));
ok(inAgain && after?.at === `${MAIL}/` && !after.gate && after.kept === null, 'Mail open in the frame, the word used up', JSON.stringify(after));
// (the account takes a hand-back only from Mail's own page, by the Origin Mail's Worker passes on: Mail's own, as the
// browser sent it. The kit must start Mail's Worker acting as email.ifl.test (hubstack.mjs: --local-upstream
// email.ifl.test:8788), or wrangler dev puts its first route's address, email.inflite.ai, in the browser's place, and the
// account rightly refuses it; then this fails, and says so, as Mail open just now would prove nothing of the hand-back:
// the sign-in page has just made the site's sign-in fresh)
const fwd = readFileSync(`${S}/hostpass.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.path === '/api/account/mail/handback').at(-1);
ok(fwd?.origin === MAIL && hb?.status === 200, 'and the account took it, from Mail’s own page',
  `${hb?.status}, Mail’s Worker spoke as ${fwd?.origin}${fwd?.origin === MAIL ? '' : ` (not ${MAIL}: hubstack.mjs must start it with --local-upstream email.ifl.test:8788)`}`);
ok(frameNavs.some((u) => /^http:\/\/email\.ifl\.test:8788\/#signin=[A-Za-z0-9_-]{16,128}$/.test(u)), 'the frame opened at Mail with the code (and nothing else) in its address', JSON.stringify(frameNavs.slice(-3).map((u) => u.slice(0, 60))));
ok(p.url() === `${HUB}/mail/`, 'and the code out of the hub’s address', p.url());
const fresh = Number(one(`SELECT MAX(auth_at) AS t FROM pg_sessions WHERE user_id = '${gid}'`)[0]?.t || 0);
ok(Date.now() - fresh < 5 * 60e3, 'shown it’s him just now', String(fresh));
await p.screenshot({ path: `${out}/mail-signedin.png` });

// ---- one window, no CSP violation, no error on Mail's pages ----
const mailErrs = errs.slice(mailErrs0).filter((e) => e.startsWith('george:'));
ok(pages.length === 1, 'one window throughout', String(pages.length));
const away = navs.filter((u) => { const h = new URL(u).host; return h !== 'ifl.test:8788' && !/^(auth|account)\.ifl\.test:8788$/.test(h); });
ok(!away.length, 'every page of the window stayed at the hub (bar the sign-in page’s)', JSON.stringify(away));
ok(!(await p.evaluate(() => window.__opened.length)), 'nothing asked for a new window');
ok(!mailErrs.length, 'no error and no CSP violation on Mail’s pages (the hub’s /mail/ and Mail in its frame)', JSON.stringify(mailErrs.slice(0, 4)));

// ---- 6. Open Mail on Its Own: Mail at its own address, in a window of its own, as it was ----
const popped = ctx.waitForEvent('page', { timeout: 15000 }).catch(() => null);
await p.click('.mh-own');
const own = await popped;
await own?.waitForLoadState('domcontentloaded').catch(() => {});
const ownSeen = own ? await own.waitForSelector('.pane.list .gbtn.profile', { timeout: 30000 }).then(() => own.evaluate(() => ({ at: location.href, embed: document.documentElement.classList.contains('embed'),
  back: !!document.querySelector('.gbtn.hub-back'), top: window.parent === window })), () => ({ at: own.url(), stuck: true })) : null;
ok(ownSeen?.at === `${MAIL}/` && ownSeen.embed === false && !ownSeen.back && ownSeen.top, 'Open Mail on Its Own: Mail at its own address, as it always was (your photo, no Back)', JSON.stringify(ownSeen));
// (Mail's later parts, the inflite repo's email/public/parts/: none asked for by the list; the compose sheet asked for
// ahead once a conversation's open, and opening at a tap; each kept by Mail's service worker under its Mail's build, and
// one asked for by another Mail than the one deployed turned away)
if (own && !ownSeen?.stuck) {
  await wait(2500);
  const asked = () => own.evaluate(() => performance.getEntriesByType('resource').map((e) => new URL(e.name)).filter((u) => u.pathname.startsWith('/parts/')).map((u) => u.pathname + u.search));
  const build = await own.evaluate(() => fetch('/api/version', { credentials: 'same-origin', headers: { 'X-Inflite': '1' } }).then((r) => r.json()).then((j) => j.app)).catch(() => null);
  const atList = await asked();
  ok(build && atList.length === 0, 'Mail’s list asks for none of its later parts', JSON.stringify({ build, atList }));
  await own.click('.row-wrap[data-id] .row').catch(() => {});
  await own.waitForSelector('.mcard', { timeout: 15000 }).catch(() => {});
  await wait(3500);
  const atRead = await asked();
  ok(JSON.stringify(atRead) === JSON.stringify([`/parts/compose.js?b=${build}`]), 'a conversation open: the compose sheet asked for ahead (the reply likely), as this Mail’s, and nothing else', JSON.stringify(atRead));
  // (back to the list, on a phone, where New Message is)
  await own.evaluate(() => history.back()).catch(() => {});
  await wait(900);
  await own.click('.pane.list .gbtn[aria-label="New Message"]').catch(() => {});
  const sheet = await own.waitForSelector('.sheet.open', { timeout: 5000 }).then(() => own.evaluate(() => document.activeElement?.getAttribute('aria-label')), () => null);
  ok(sheet === 'To', 'New Message: the sheet, To focused, at the tap', String(sheet));
  await own.keyboard.press('Escape').catch(() => {});
  const kept = await (async () => { for (let i = 0; i < 40; i++) { const k = await own.evaluate(() => caches.open('mail-app-2').then((c) => c.keys()).then((ks) => ks.map((r) => new URL(r.url)).map((u) => u.pathname + u.search).filter((x) => x.startsWith('/parts/')).sort())).catch(() => []);
    if (k.length >= 6) return k; await wait(500); } return own.evaluate(() => caches.open('mail-app-2').then((c) => c.keys()).then((ks) => ks.map((r) => new URL(r.url).pathname + new URL(r.url).search))).catch((e) => String(e)); })();
  ok(JSON.stringify(kept) === JSON.stringify(['/parts/compose.js', '/parts/search.js', '/parts/sheets.js', '/parts/spot.js', '/parts/viewer.js'].map((x) => `${x}?b=${build}`).concat('/parts/kept').sort()),
    'Mail’s worker keeps this Mail’s parts by its build, for opening offline', JSON.stringify(kept));
  const [mineAsk, oldAsk, noneAsk] = await Promise.all([`/parts/compose.js?b=${build}`, '/parts/compose.js?b=0.01', `/parts/nothing.js?b=${build}`].map((u) => hostAsk('email.ifl.test:8788', u)));
  ok(mineAsk.status === 200 && /javascript/.test(mineAsk.headers['content-type']) && mineAsk.headers['cache-control'] === 'no-cache' && oldAsk.status === 409 && noneAsk.status === 404,
    'a part asked for as the Mail deployed: there; as another Mail: turned away (409); one that isn’t there: 404, never Mail’s page', `${mineAsk.status} ${mineAsk.headers['content-type']} ${mineAsk.headers['cache-control']} ${oldAsk.status} ${noneAsk.status}`);
}
await own?.screenshot({ path: `${out}/mail-own.png` }).catch(() => {});
await own?.close().catch(() => {});

// ---- 7. someone who isn't the admin: no Mail tile, and Mail itself doesn't let them in ----
const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']), pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
const made = await hostCall('auth.ifl.test', '/api/account/signup', { name: 'Pat Reed', handle: 'patmail', email: 'pat@example.com', salt: b64u(randomBytes(16)), proof: b64u(randomBytes(32)),
  vault: 'x'.repeat(40), pub: { kty: 'EC', crv: 'P-256', x: pub.x, y: pub.y } }, { ip: '10.0.9.7' });
const [cname, cvalue] = (made.cookie || '=').split('=');
const pat = await hubPhone('pat', null, { path: '/#apps', cookies: made.cookie ? { [cname]: cvalue } : {} });
const patErrs0 = errs.length;
const tiles = await pat.p.waitForSelector('.ifl-tile[data-app="weather"], .atile[data-app="weather"]', { timeout: 30000 }).then(() => pat.p.$$eval('.ifl-tile[data-app], .atile', (ts) => ts.map((t) => t.dataset.app)), () => null);
ok(made.s === 201 && JSON.stringify(tiles) === JSON.stringify(['weather', 'fitness', 'markets']), 'Pat, not the admin: no Mail tile', JSON.stringify(tiles));
await pat.p.goto(`${HUB}/mail/`);
const notAdmin = await pat.p.frame({ name: 'ifl-mail' })?.waitForSelector('.login[data-access=notadmin]', { timeout: 30000 }).then(() => true, () => false);
ok(notAdmin, 'and at /mail/ by its address: Mail, in the frame, says it’s for the site’s admin alone');
ok(!errs.slice(patErrs0).filter((e) => e.startsWith('pat:')).length, 'no error on Mail’s pages for Pat', JSON.stringify(errs.slice(patErrs0).slice(0, 3)));
await pat.ctx.close();

// ---- 8. Mail at its own address, at the top: as it was; and framed by a page anywhere else: refused ----
const b2 = await K.hubBrowser(), c2 = await b2.newContext({ viewport: { width: 390, height: 844 } });
const q = await c2.newPage();
const refusals = []; q.on('console', (m) => { if (/frame-ancestors|Refused to frame/i.test(m.text())) refusals.push(m.text()); });
await q.goto(`${MAIL}/`);
const top = await q.waitForSelector('.login', { timeout: 30000 }).then(() => q.evaluate(() => ({ embed: document.documentElement.classList.contains('embed'), top: window.parent === window })), () => null);
ok(top && top.embed === false && top.top, 'Mail at email.ifl.test, at the top: no embed mode', JSON.stringify(top));
// (a page at another address framing Mail, under the name the hub gives it: Mail's page refused there)
await q.route('http://framer.gfg.test:8788/', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><title>Not the hub</title><iframe name="ifl-mail" src="${MAIL}/"></iframe>` }));
await q.goto('http://framer.gfg.test:8788/');
await wait(2500);
const framed = q.frame({ name: 'ifl-mail' });
const drawn = framed ? await framed.evaluate(() => !!document.querySelector('.login, #app, .pane')).catch(() => false) : false;
ok(!drawn && (refusals.length > 0 || !framed?.url().startsWith(MAIL)), 'a page at another address can’t frame Mail (frame-ancestors the hub alone)', `${framed?.url()} ${refusals[0]?.slice(0, 140) || ''}`);
// (and the hub's /mail/ itself can't be framed by anyone, the hub included)
await q.route('http://framer.gfg.test:8788/2', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><iframe name="host" src="${HUB}/mail/"></iframe>` }));
await q.goto('http://framer.gfg.test:8788/2');
await wait(2500);
const hostFramed = q.frame({ name: 'host' });
const hostDrawn = hostFramed ? await hostFramed.evaluate(() => !!document.querySelector('.mh-bar')).catch(() => false) : false;
ok(!hostDrawn, 'and the hub’s /mail/ is framed by no one', hostFramed?.url());
await c2.close();

console.log('notes (page errors and console errors):', JSON.stringify(errs.slice(0, 8)));
await ctx.close();
await (await K.hubBrowser()).close();
await K.b.close();
console.log(`FAILS ${K.fails()}`);
process.exit(0);
