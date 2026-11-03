// needs: hub mail roof-mail
// Getting to Mail under the roof (One roof stage 4, spec §10.2 roofmailnav): notifications, every address, the switch,
// sign-out elsewhere and offline. George, the site's admin, at InFlite's hub with Mail's module switched on; his InFlite
// device a push subscription with keys this test holds (as hubpush.mjs), and Mail's own subscription another, so every
// push the stack sends him is opened here and read. In real Chromium against the hub stack.
//   A notices: the push holds none of the mail's words; the shown notification has them (from Mail), or the fixed words
//     with Mail unreachable; a tap → in-page /mail/#thread= with sheets closed, or a new window there; one delivery
//     (Mail's own push only with Through InFlite off; held → neither)
//   B every §2.3 address with the switch on
//   C the switch off (the client's side, stood in with routes as roof.yml app=mail state=off leaves the Workers:
//     apps.mail false, /mail/roof/* 404, Mail's CORS refused, /mail/ the framed page): a shown Mail bounces once, not
//     while composing; §2.3's addresses off; the framed page opens a notification tap with it already open (RI5)
//   D signed out elsewhere: no mail:* key left
//   E offline on the Home Screen after one online open: Mail's offline words, compose opens, no navigation to Mail's own
//     address
// Every check's line names the spec section it proves; selectors are roofhooks.mjs's (spec §10.2), or a control's role
// and the words on it.
import http from 'node:http';
import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash, randomBytes } from 'node:crypto';
import * as H from './roofhooks.mjs';
import {
  HUB, IFL, EXCEPT, checker, phone, persistent, dress, account, hostCall, pageCall, alive, loads, history, here, shown, gone, textOf, attrOf, count,
  storage, hide, show, route, passed, tapNotification, rootWorker, wait, until, js, closeAll,
} from './rooflib.mjs';
import { kit } from './lib.mjs';

const [,, S, out] = process.argv;
const { ok, part, fails } = checker();
process.on('uncaughtException', (e) => { console.log(`FAIL  crashed: ${String(e?.message || e).split('\n')[0]}`); console.log(`FAILS ${fails() + 1}`); process.exit(0); });
const ROOT = process.env.APP_ROOT || new URL('../../', import.meta.url).pathname;
const MAIL = 'http://email.ifl.test:8788', MAILHOST = 'email.ifl.test:8788', AUTH = 'http://auth.ifl.test:8788';
const shot = (p, name) => p.screenshot({ path: `${out}/${name}.png` }).catch(() => {});
// (the push stand-in, keys, and opening what it got: lib.mjs's)
const K = await kit(S, out);

// ---- Mail's hooks (roofhooks.mjs, spec §10.2) ----
const M_MAIL = H.M_MAIL, ROW = H.MAIL_THREAD, BODY = H.MAIL_BODY;
const row = (id) => H.mailThread(id);
const SH = (name) => H.mailSheet(name);
const COMPOSE = SH('mail-compose');

const sql = (q) => {
  for (let i = 0; ; i++) {
    try {
      const o = execSync(`${S}/wr/node_modules/.bin/wrangler d1 execute bio-db --local --persist-to ${S}/wrstate --command "${q.replace(/(["$`\\])/g, '\\$1')}"`, { cwd: ROOT, stdio: 'pipe' }).toString();
      const m = o.match(/"results": (\[[\s\S]*?\])\s*,\s*"success"/); return m ? JSON.parse(m[1]) : [];
    } catch (e) { if (i > 5 || !/SQLITE_BUSY/.test(String(e.stdout) + String(e.stderr))) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400); }
  }
};
const mailAsk = (path, { cookie, method, body, headers = {} } = {}) => hostCall(MAILHOST, path, body, { cookie, method, headers: { ...(method && method !== 'GET' && method !== 'OPTIONS' ? { 'X-Inflite': '1' } : {}), ...headers } });
function deliver({ from, subject, text }) {
  const raw = [`From: ${from}`, 'To: hello@inflite.ai', `Subject: ${subject}`, `Message-ID: <${randomBytes(8).toString('hex')}@example.com>`, `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', '', text, ''].join('\r\n');
  const addr = /<([^>]+)>/.exec(from)?.[1] || from;
  return new Promise((done) => {
    const q = http.request({ host: '127.0.0.1', port: 8806, method: 'POST', agent: false, path: `/cdn-cgi/handler/email?from=${encodeURIComponent(addr)}&to=hello%40inflite.ai`,
      headers: { 'Content-Type': 'message/rfc822', 'Content-Length': Buffer.byteLength(raw) } }, (res) => { res.resume(); res.on('end', () => done(res.statusCode)); });
    q.on('error', () => done(0)); q.end(raw);
  });
}
const b64u = (u) => Buffer.from(u).toString('base64url');
const at = (p, path, ms = 15000) => p.waitForFunction((u) => location.pathname + location.search + location.hash === u, path, { timeout: ms }).then(() => true, () => false);
const mailUp = async (p, ms = 30000) => (await shown(p, M_MAIL, ms)) && (await shown(p, ROW, ms));
const readerUp = async (p, ms = 30000) => (await shown(p, M_MAIL, ms)) && (await shown(p, BODY, ms));
const todayUp = async (p, ms = 30000) => (await shown(p, H.TODAY, ms)) && (await shown(p, H.HD_TITLE, ms));
const sheetUp = (p, name, ms = 10000) => shown(p, `${SH(name)}[open]`, ms);
const framed = (p, ms = 20000) => p.waitForFunction(() => !!document.querySelector('iframe[name="ifl-mail"]'), null, { timeout: ms }).then(() => true, () => false);
const frameSrc = (p) => p.evaluate(() => document.querySelector('iframe[name="ifl-mail"]')?.src || null).catch(() => null);
const mailKeys = (p) => p.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)].filter((k) => k.startsWith('mail:'))).catch(() => null);

// ======================================================================================================================
// George, the admin; his InFlite device (Today's td_push, as This Phone puts it there) and Mail's own subscription
// ======================================================================================================================
const acct = await account('George Farrow-Green', 'georgeroofmailnav');
const cookies = acct.cookies || {}, cookie = acct.cookie || '';
const GID = sql("SELECT id FROM pg_users WHERE handle = 'georgeroofmailnav'")[0]?.id;
sql(`INSERT OR REPLACE INTO pg_meta (k, v) VALUES ('admin_user', '${GID}')`);
sql(`INSERT OR IGNORE INTO pg_passkeys (id, user_id, public_key, alg, created_at) VALUES ('roofmailnav-key', '${GID}', 'x', -7, ${Date.now()})`);
sql(`UPDATE pg_sessions SET auth_at = ${Date.now()} WHERE user_id = '${GID}'`);
const SESS = sql(`SELECT hash FROM pg_sessions WHERE user_id = '${GID}' ORDER BY created_at DESC LIMIT 1`)[0]?.hash;
const KEYS = { georgenav: await K.makeKeys(), georgemail: await K.makeKeys() };
const endpointOf = (n) => `https://fcm.googleapis.com/fcm/send/${n}-device`;
sql(`INSERT OR REPLACE INTO td_push (endpoint, user_id, p256dh, auth, session, added, fails) VALUES ('${endpointOf('georgenav')}', '${GID}', '${b64u(KEYS.georgenav.pub)}', '${b64u(KEYS.georgenav.auth)}', '${SESS}', ${Date.now()}, 0)`);
const sub = await mailAsk('/api/push/subscribe', { cookie, method: 'POST', body: { endpoint: endpointOf('georgemail'), keys: { p256dh: b64u(KEYS.georgemail.pub), auth: b64u(KEYS.georgemail.auth) } } });
ok(!!GID && !!SESS && sub.status === 200, 'George the admin; his InFlite device (td_push) and Mail’s own subscription (Mail’s push_subs), each with keys the test holds', js({ GID: !!GID, SESS: !!SESS, sub: sub.status }));
// (every push since a moment, to one device, opened)
const pushesTo = async (name, since) => Promise.all(K.pushes().filter((x) => x.at > since && (x.headers['x-endpoint'] || '').endsWith(`/${name}-device`)).map(async (x) => ({ at: x.at, ...(await K.decrypt(KEYS[name], x.body).catch(() => ({ undecrypted: true }))) })));
const threadId = async (subject) => ((await mailAsk('/api/threads?view=all&limit=100', { cookie })).json?.threads || []).find((t) => t.subject === subject)?.id || null;

const everyone = [];
const open = async (name, o = {}) => { const ph = await phone(name, { cookies, ...o }); everyone.push(ph); return ph; };
const G = await open('george');
const { p } = G;
await p.goto(`${HUB}/robots.txt`);
const prefOn = async (on) => pageCall(G.p, 'PATCH', '/api/notify', { mail: { inflite: on } });
// (the account's Quiet Hours: on for the hour now in London, or off; Mail keeps them from its next look at the account)
const quiet = async (on) => {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  const r = await pageCall(G.p, 'PATCH', '/api/notify', { quiet: { on, from: h, to: (h + 2) % 24, tz: 'Europe/London' } });
  await wait(11000); await mailAsk('/api/session', { cookie }); await mailAsk('/api/me', { cookie });
  return r;
};
// (a push handed to the root worker as the browser hands it one: DevTools' ServiceWorker.deliverPushMessage, hubpush.mjs)
let cdp = null; const regs = new Map();
const deliverPush = async (ph, payload) => {
  if (!cdp) { cdp = await ph.ctx.newCDPSession(ph.p); cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => { for (const x of e.registrations || []) if (!x.isDeleted) regs.set(x.scopeURL, x.registrationId); }); await cdp.send('ServiceWorker.enable').catch(() => {}); }
  const reg = await until(() => regs.get(`${HUB}/`), 15000);
  return reg ? cdp.send('ServiceWorker.deliverPushMessage', { origin: HUB, registrationId: reg, data: JSON.stringify(payload) }).then(() => true, () => false) : false;
};
const shownNotes = async (ctx) => { const sw = await rootWorker(ctx); return sw ? sw.evaluate(async () => (await self.registration.getNotifications()).map((n) => ({ title: n.title, body: n.body, tag: n.tag, silent: n.silent, data: n.data }))).catch(() => []) : []; };

let T1 = null;
// ======================================================================================================================
await part('A', 'notices: no words in the push; the words from Mail on the phone; taps; one delivery; held', 'S4-D8, §2.6, §6.4, §9', async () => {
// ======================================================================================================================
  const pr = await prefOn(true);
  const now = await pageCall(p, 'GET', '/api/notify');
  ok(pr.s === 200 && now.j?.mail?.inflite === true, 'A. Through InFlite on (the account’s preference, through Today’s /api/notify, §6.3)', js({ s: pr.s, mail: now.j?.mail }));
  // the framework open on Today, its root worker running
  await p.goto(`${HUB}/`);
  await todayUp(p);
  await p.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 30000 }).catch(() => {});
  ok(!!(await rootWorker(G.ctx, 30000)), 'A. the root worker running (scope /)');

  const t0 = Date.now();
  const WORDS = ['Isla', 'Moor', 'isla@example.com', 'Harbour', 'lantern', 'lighthouse'];
  const came = await deliver({ from: 'Isla Moor <isla@example.com>', subject: 'Harbour lantern plan', text: 'Meet at the lighthouse at six.' });
  ok(came >= 200 && came < 300, 'A. new mail from a person comes to Mail (its email handler)', String(came));
  T1 = await until(() => threadId('Harbour lantern plan'), 10000);
  const push = await until(async () => (await pushesTo('georgenav', t0)).find((x) => x.app === 'mail'), 20000);
  const { at: _a, ...payload } = push || {};
  const sorted = (o) => js(Object.fromEntries(Object.entries(o || {}).sort(([a], [b]) => a.localeCompare(b))));
  ok(!!push && sorted(payload) === sorted({ app: 'mail', title: 'Mail', body: 'New mail from people', tag: T1, url: `/mail/#thread=${T1}` }), 'A. the account’s push to his InFlite device: { app: "mail", title: "Mail", body: "New mail from people", tag: <thread>, url: "/mail/#thread=<thread>" } (S4-D8, §2.6)', js(payload));
  ok(!!push && !WORDS.some((w) => JSON.stringify(payload).includes(w)), 'A. …none of the subject’s, the sender’s or the message’s words in it (§9)', js(payload));
  const told = passed(S, t0).filter((x) => x.path === '/api/account/mail/notice');
  ok(told.length >= 1 && told.every((x) => x.method === 'POST' && x.auth && !x.cookie), 'A. Mail told the account with its key, no cookie (POST /api/account/mail/notice, §6.1)', js(told.map((x) => ({ m: x.method, auth: x.auth, cookie: x.cookie }))));
  await wait(6000);
  const own = await pushesTo('georgemail', t0);
  ok(!own.length, 'A. …and Mail didn’t push through its own subscription: one delivery (S4-D8)', js(own.length));

  // the push on the phone: shown at once with its own words, then Mail's words in its place (same tag, silent)
  const handed = await deliverPush(G, payload);
  const words = await until(async () => (await shownNotes(G.ctx)).find((n) => n.tag === `mail:${T1}` && n.title === 'Isla Moor'), 10000);
  ok(handed && !!words && words.body === 'Harbour lantern plan' && words.silent === true, 'A. on the phone: the notification says who and what (“Isla Moor”, “Harbour lantern plan”), fetched from Mail, same tag, silent (§6.4, S4-D8)', js({ handed, words, all: await shownNotes(G.ctx) }));
  const fromHub = passed(S, t0).filter((x) => /\/api\/notice\//.test(x.path));
  ok(!fromHub.length, 'A. …the words fetched from Mail by the phone itself, never through InFlite’s Worker or the account (§9)', js(fromHub.map((x) => x.path)));

  // Mail unreachable: the fixed words stay
  await route(G.ctx, /^http:\/\/email\.ifl\.test:8788\/api\/notice\//, (r) => r.abort('connectionrefused'));
  const t1 = Date.now();
  await deliver({ from: 'Ivo Fenn <ivo@example.com>', subject: 'Copper beech by the gate', text: 'It needs cutting back.' });
  const T2 = await until(() => threadId('Copper beech by the gate'), 10000);
  const push2 = await until(async () => (await pushesTo('georgenav', t1)).find((x) => x.app === 'mail' && x.tag === T2), 20000);
  const { at: _b, ...payload2 } = push2 || {};
  await deliverPush(G, payload2); await wait(4500);
  const fixed = (await shownNotes(G.ctx)).find((n) => n.tag === `mail:${T2}`);
  ok(!!fixed && fixed.title === 'Mail' && fixed.body === 'New mail from people', 'A. Mail unreachable: the notification keeps the push’s own words (“Mail”, “New mail from people”, §6.4)', js(fixed));
  await G.ctx.unroute(/^http:\/\/email\.ifl\.test:8788\/api\/notice\//).catch(() => {});

  // tapped with the framework open and a sheet up: in the page, the sheet closed first
  await p.goto(`${HUB}/`); await todayUp(p);
  await p.click(H.HD_SEARCH);
  const sheet = await shown(p, `${H.SEARCH_SHEET}[open]`);
  const life = await alive(p), docs = loads(p);
  const r = await tapNotification(G.ctx, { app: 'mail', url: `/mail/#thread=${T1}` });
  const went = (await readerUp(p)) && (await at(p, `/mail/#thread=${T1}`));
  ok(sheet && r === 'done' && went && !(await count(p, H.SHEET_OPEN)) && (await life.same()) && docs.n() === 0, 'A. tapped, Today open with a sheet up: the reader at /mail/#thread=<id>, the sheet closed, in the same page ({ ifl: "route" }, §2.6)', js({ r, url: here(p), docs: docs.list }));
  docs.stop();
  await shot(p, 'A-tapped');
  // tapped with no window open: a new window there
  const keep = await G.ctx.newPage(); await keep.goto('about:blank');
  for (const pg of G.ctx.pages()) if (pg !== keep) await pg.close();
  const r2 = await tapNotification(G.ctx, { app: 'mail', url: `/mail/#thread=${T1}` }, { window: 'record' });
  ok(r2 === `open ${HUB}/mail/#thread=${T1}`, 'A. tapped with no window: a new window at /mail/#thread=<id> (§2.6)', r2);
  G.p = await G.ctx.newPage(); await keep.close();
  const q = G.p;
  await q.goto(`${HUB}/mail/#thread=${T1}`);
  ok(await readerUp(q), 'A. …that window: the reader');

  // Through InFlite off: Mail's own push, none through the account
  await q.goto(`${HUB}/robots.txt`);
  G.p = q;
  const off = await pageCall(q, 'PATCH', '/api/notify', { mail: { inflite: false } });
  const t2 = Date.now();
  await deliver({ from: 'Noor Haddad <noor@example.com>', subject: 'Keys under the mat', text: 'Back on Tuesday.' });
  const mine = await until(async () => (await pushesTo('georgemail', t2)).length ? await pushesTo('georgemail', t2) : null, 20000);
  await wait(4000);
  const hubs = (await pushesTo('georgenav', t2)).filter((x) => x.app === 'mail');
  ok(off.s === 200 && !!mine?.length && !hubs.length, 'A. Through InFlite off: Mail’s own push (its own subscription), none to his InFlite device: one delivery (S4-D8)', js({ off: off.s, mine: mine?.length, hubs: hubs.length }));

  // held (Quiet Hours now): neither
  await pageCall(q, 'PATCH', '/api/notify', { mail: { inflite: true } });
  const qr = await quiet(true);
  const t3 = Date.now();
  await deliver({ from: 'Sam Reed <sam@example.com>', subject: 'Late note about the shed', text: 'No rush.' });
  await wait(12000);
  const any = [...(await pushesTo('georgenav', t3)), ...(await pushesTo('georgemail', t3))].filter((x) => !x.undecrypted);
  ok(qr.s === 200 && !any.length, 'A. in Quiet Hours: held, neither the account nor Mail pushes (S4-D8, §2.6)', js({ qr: qr.s, any: any.map((x) => x.title) }));
  await quiet(false);
});

// ======================================================================================================================
await part('B', 'every address of §2.3 with the switch on', '§2.3, S4-D5, S4-D6, S4-D25', async () => {
// ======================================================================================================================
  const q = G.p;
  const cold = async (path) => { await q.goto(`${HUB}/robots.txt`); await q.goto(`${HUB}${path}`); };
  const r301 = await hostCall('ifl.test:8788', '/mail');
  ok(r301.status === 301 && /\/mail\/$/.test(r301.headers.location || ''), 'B. /mail: 301 → /mail/ (§2.3)', js({ s: r301.status, l: r301.headers.location }));
  for (const [path, want, sec] of [['/mail/', '/mail/', 'people'], ['/mail/index.html', null, 'people'], ['/mail/#people', '/mail/', 'people'], ['/mail/#updates', '/mail/#updates', 'updates'],
    ['/mail/#later', '/mail/#later', 'later'], ['/mail/#done', '/mail/#done', 'done'], ['/mail/#nothing-here', '/mail/', 'people'], ['/mail/?demo', '/mail/', 'people']]) {
    await cold(path);
    const up = await shown(q, M_MAIL, 30000);
    const tidy = want ? await at(q, want, 10000) : true;
    const on = await q.waitForFunction((s) => document.querySelector(s)?.getAttribute('aria-selected') === 'true', H.hdSec(sec), { timeout: 10000 }).then(() => true, () => false);
    ok(up && tidy && on, `B. ${path}: the framework, ${sec}${want ? `, the address ${want}` : ''} (§2.3)`, js({ url: here(q), on }));
  }
  await cold(`/mail/#thread=${T1}`);
  ok((await readerUp(q)) && (await at(q, `/mail/#thread=${T1}`)), 'B. /mail/#thread=<id>: the reader, the address kept (phone, S4-D6)', here(q));
  await cold('/mail/#settings');
  ok((await shown(q, M_MAIL, 30000)) && (await sheetUp(q, 'mail-settings', 15000)), 'B. /mail/#settings: People and Mail Settings (§2.3)', here(q));
  await cold('/#you=notify-mail');
  ok((await shown(q, H.YOU, 30000)) && (await shown(q, `${H.SH_MAILNOTIFY}[open]`, 15000)), 'B. /#you=notify-mail: You, the Mail Notifications sheet (§2.3)', here(q));
  const css = await hostCall('ifl.test:8788', '/mail/host.css');
  ok(css.status === 200 && /css/.test(css.headers['content-type'] || ''), 'B. /mail/host.css: served (the rollback page needs it, §2.3)', String(css.status));
  const mjs = await hostCall('ifl.test:8788', '/mail/roof/mail.js'), ver = await hostCall('ifl.test:8788', '/mail/version');
  ok(mjs.status === 200 && /javascript/.test(mjs.headers['content-type'] || '') && ver.status === 200 && typeof ver.json?.build === 'string', 'B. /mail/roof/mail.js and /mail/version: Mail’s module and { build } through the root Worker (§2.3)', js({ js: mjs.status, ver: ver.json }));
  const body = await mailAsk('/body/');
  ok(body.status === 200 && (body.headers['content-security-policy'] || '').includes(`frame-ancestors ${HUB}`), 'B. email…/body/: the shell, framed only by the hub origins switched on (§2.3, §3.4)', js({ s: body.status, csp: (body.headers['content-security-policy'] || '').split('frame-ancestors')[1] }));
  const pre = await mailAsk('/api/threads', { method: 'OPTIONS', headers: { Origin: HUB, 'Access-Control-Request-Method': 'GET' } });
  ok(pre.status === 204 && pre.headers['access-control-allow-origin'] === HUB && pre.headers['access-control-allow-credentials'] === 'true', 'B. Mail’s preflight from the hub: 204, the hub allowed with credentials (§3.5)', js({ s: pre.status, acao: pre.headers['access-control-allow-origin'] }));
  // Mail on its own: unchanged
  const own = await mailAsk('/');
  ok(own.status === 200 && /frame-ancestors/.test(own.headers['content-security-policy'] || ''), 'B. email.inflite.ai/: Mail on its own, as it was (§2.3)', String(own.status));
});

// ======================================================================================================================
await part('C', 'the switch off: a shown Mail bounces once, not while composing; the addresses off; the framed page opens a tap (RI5)', '§8, C1, D14, §2.3, RI5', async () => {
// ======================================================================================================================
  // (the framed page as the root Worker writes it with the switch off: today/src/mailhost.js's own hostPage)
  let FRAMED = null;
  try { const m = await import(`${IFL}/today/src/mailhost.js`); FRAMED = { html: m.hostPage(MAIL, AUTH), headers: m.pageHeaders(MAIL) }; } catch (e) { console.log(`note: the framed page couldn’t be built from mailhost.js (${e.message})`); }
  ok(!!FRAMED, 'C. the switch-off page, from the root Worker’s own mailhost.js (hostPage)');
  const offOn = async (ph, start = false) => {
    ph.off = start;
    await route(ph.ctx, /^http:\/\/ifl\.test:8788\/api\/hub(\?|$)/, (r) => (ph.off ? r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify({ ready: true, roof: true, apps: { weather: true, markets: false, fitness: false, mail: false } }) }) : r.continue()));
    await route(ph.ctx, /^http:\/\/ifl\.test:8788\/mail\/(roof\/|version)/, (r) => (ph.off ? r.fulfill({ status: 404, contentType: 'text/plain', headers: { 'Cache-Control': 'no-store' }, body: 'Not found.' }) : r.continue()));
    // (a page load of /mail/, from the page or through the root worker's own fetch for it: a GET asking for HTML)
    await route(ph.ctx, /^http:\/\/ifl\.test:8788\/mail\/(index\.html)?([?#].*)?$/, (r) => (ph.off && FRAMED && r.request().method() === 'GET' && (r.request().resourceType() === 'document' || /text\/html/.test(r.request().headers().accept || '')) ? r.fulfill({ status: 200, headers: FRAMED.headers, body: FRAMED.html }) : r.continue()));
    // (Mail's API to the hub's origin: refused, no CORS headers, as HUB_API "0" leaves it)
    await route(ph.ctx, /^http:\/\/email\.ifl\.test:8788\/(api\/|body\/)/, (r) => (ph.off && (r.request().headers().origin === HUB || /\/body\//.test(r.request().url())) ? r.fulfill({ status: r.request().url().includes('/body/') ? 404 : 403, contentType: 'application/json', body: '{"error":"no"}' }) : r.continue()));
  };

  // a shown Mail, the switch turned off: no bounce while composing; once compose is closed, one bounce to the framed page
  const R = await open('george-off', { sw: 'block', clock: true });
  await offOn(R);
  const q = R.p, docs = loads(q);
  await q.goto(`${HUB}/mail/`);
  await mailUp(q);
  await q.click(H.HD_COMPOSE);
  await sheetUp(q, 'mail-compose');
  await q.locator(COMPOSE).getByRole('textbox', { name: /^Subject/i }).first().fill('Roof switch draft').catch(() => {});
  docs.reset();
  R.off = true;
  await hide(q); await R.ctx.clock.fastForward('06:00'); await show(q);
  await wait(5000);
  const held = (await count(q, `${COMPOSE}[open]`)) === 1 && docs.n() === 0;
  ok(held, 'C. switched off while composing: no bounce, compose still open (C1: never over unsaved work)', js({ docs: docs.list, compose: await count(q, `${COMPOSE}[open]`) }));
  await q.keyboard.press('Escape');
  const bounced = await framed(q, 25000);
  await wait(2500);
  const marker = await q.evaluate(() => sessionStorage.getItem('ifl-roof-bounce')).catch(() => null);
  ok(bounced && docs.n() === 1 && marker === '1', 'C. compose closed: one bounce to the framed page at /mail/ (marker ifl-roof-bounce, D14)', js({ docs: docs.list, marker }));
  const draft = await until(async () => ((await mailAsk('/api/messages?folder=drafts&limit=50', { cookie })).json?.messages || []).find((m) => m.subject === 'Roof switch draft'), 10000);
  ok(!!draft, 'C. …the words written kept as a draft at Mail (flush before the bounce, C1, §8)');
  await shot(q, 'C-bounced');
  docs.stop(); await R.ctx.close();

  // the addresses with the switch off: the framed page, the hash passed into the frame
  const R2 = await open('george-off2', { sw: 'block' });
  await offOn(R2, true);
  for (const [path, hash] of [['/mail/', ''], [`/mail/#thread=${T1}`, `#thread=${T1}`], ['/mail/#settings', '#settings'], ['/mail/#settings=signature', '#settings']]) {
    await R2.p.goto(`${HUB}/robots.txt`); await R2.p.goto(`${HUB}${path}`);
    const f = await framed(R2.p);
    const src = await until(() => frameSrc(R2.p), 8000);
    ok(f && src === `${MAIL}/${hash}` && !(await count(R2.p, M_MAIL)), `C. off, ${path}: the framed page, Mail’s frame at ${MAIL}/${hash} (§2.3, RI5)`, js({ src, url: here(R2.p) }));
  }
  await R2.p.goto(`${HUB}/#you=notify-mail`);
  const sheetOff = await shown(R2.p, `${H.SH_MAILNOTIFY}[open]`, 20000);
  ok(sheetOff && /Choose which addresses notify you in Mail Settings/.test((await textOf(R2.p, `${H.SH_MAILNOTIFY}[open]`)) || ''), 'C. off, /#you=notify-mail: the sheet says “Choose which addresses notify you in Mail Settings” (S4-D11)', await textOf(R2.p, `${H.SH_MAILNOTIFY}[open]`));
  await R2.ctx.close();

  // the framed page open, a notification tapped: the frame goes to the conversation, the page stays (RI5)
  const R3 = await open('george-off3');
  await offOn(R3, true);
  await R3.p.goto(`${HUB}/`); await todayUp(R3.p);
  await R3.p.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 30000 }).catch(() => {});
  await R3.p.goto(`${HUB}/mail/`);
  await framed(R3.p); await wait(2500);
  const life = await alive(R3.p);
  const r = await tapNotification(R3.ctx, { app: 'mail', url: `/mail/#thread=${T1}` });
  const src = await until(async () => { const s = await frameSrc(R3.p); return s === `${MAIL}/#thread=${T1}` ? s : null; }, 10000);
  ok(r === 'done' && !!src && (await life.same()) && new URL(R3.p.url()).pathname === '/mail/' && R3.pages.length === 1, 'C. off, the framed page open, a notification tapped: its frame at Mail’s #thread=<id>, the page the same, one window (RI5)', js({ r, src: await frameSrc(R3.p), url: R3.p.url(), pages: R3.pages.length }));
  await shot(R3.p, 'C-framed-tap');
  await R3.ctx.close();
});

// ======================================================================================================================
await part('D', 'signed out elsewhere: no mail:* key left', 'C10, S4-D16', async () => {
// ======================================================================================================================
  const D = await open('george-d', { clock: true });
  const q = D.p;
  await q.goto(`${HUB}/mail/`);
  await mailUp(q);
  await q.click(H.hdSec('later')); await wait(800);
  await q.click(H.hdSec('people')); await wait(500);
  await q.click(H.HD_COMPOSE); await sheetUp(q, 'mail-compose');
  await q.locator(COMPOSE).getByRole('textbox', { name: /^Subject/i }).first().fill('Roof remote sign out').catch(() => {});
  await q.keyboard.press('Escape'); await wait(1500);
  const before = await mailKeys(q);
  ok(Array.isArray(before) && before.length >= 1, 'D. using Mail kept some mail:* keys on the phone (the last lens, what was written: S4-D16)', js(before));
  // (his sign-in ended elsewhere: every session of his gone at the account)
  sql(`DELETE FROM pg_sessions WHERE user_id = '${GID}'`);
  await q.click(H.tab('today')).catch(() => {});
  await hide(q); await D.ctx.clock.fastForward('06:00'); await show(q);
  const cleared = await until(async () => { const k = await mailKeys(q); return Array.isArray(k) && !k.length; }, 20000);
  ok(!!cleared, 'D. signed out elsewhere, found out by the page: no mail:* key left in either storage (signedOutNow, C10)', js(await mailKeys(q)));
  await shot(q, 'D-signed-out');
  await D.ctx.close();
});

// ======================================================================================================================
await part('E', 'offline on the Home Screen after one online open: Mail’s offline words, compose opens, no way out to Mail’s address', '§7, S4-D15, C11, C12', async () => {
// ======================================================================================================================
  // (signed in again: a new sign-in for George, as signing in leaves one)
  const t = Date.now(), site = randomBytes(32).toString('base64url'), hx = (s) => createHash('sha256').update(s).digest('hex');
  sql(`INSERT INTO pg_sessions (hash, user_id, created_at, seen_at, auth_at, site_hash) VALUES ('${hx(randomBytes(32).toString('base64url'))}', '${GID}', ${t}, ${t}, ${t}, '${hx(site)}')`);
  const dir = mkdtempSync(`${tmpdir()}/roofmail-`);
  let ctx = await persistent(dir);
  await dress(ctx, 'george-home', { cookies: { account: site }, standalone: true });
  let q = ctx.pages()[0] || (await ctx.newPage());
  await q.goto(`${HUB}/mail/`);
  const online = await mailUp(q);
  // (kept: the module's files and its two lazy ones, at idle, ≥ 10 s after the first show, on the Home Screen, C11)
  const kept = await until(() => q.evaluate(async () => (await caches.keys()).some((k) => /^roof-mail-/.test(k))), 30000);
  await wait(12000);
  const files = await q.evaluate(async () => { const k = (await caches.keys()).find((x) => /^roof-mail-/.test(x)); return k ? (await (await caches.open(k)).keys()).map((r) => new URL(r.url).pathname) : []; });
  ok(online && kept && files.includes('/mail/roof/compose.js') && files.includes('/mail/roof/mail.js'), `E. opened once online on the Home Screen: the module kept as roof-mail-<build>, compose.js among them (${files.length} files, C11, C12)`, js(files));
  await ctx.close();
  ctx = await persistent(dir);
  await dress(ctx, 'george-home-offline', { standalone: true });
  const navs = [], wins = [];
  ctx.on('page', (pg) => { wins.push(pg); pg.on('framenavigated', (f) => { if (f === pg.mainFrame()) navs.push(f.url()); }); });
  for (const pg of ctx.pages()) pg.on('framenavigated', (f) => { if (f === pg.mainFrame()) navs.push(f.url()); });
  await ctx.setOffline(true);
  q = ctx.pages()[0] || (await ctx.newPage());
  await q.goto(`${HUB}/mail/`).catch(() => {});
  const words = await q.waitForFunction((s) => /Mail needs a connection/.test(document.querySelector(s)?.textContent || ''), M_MAIL, { timeout: 30000 }).then(() => true, () => false);
  ok(words, 'E. offline: Mail’s own words, “Mail needs a connection. Your mail is safe at Mail…” (S4-D15)', await textOf(q, M_MAIL));
  await shot(q, 'E-offline');
  await q.click(H.HD_COMPOSE).catch(() => {});
  ok(await sheetUp(q, 'mail-compose', 15000), 'E. …Write opens compose offline (compose.js kept, S4-D15, C11)');
  await shot(q, 'E-offline-compose');
  const away = navs.filter((u) => { try { return new URL(u).origin === MAIL; } catch (_) { return false; } });
  const opened = await q.evaluate(() => window.__opened?.length || 0).catch(() => 0);
  ok(!away.length && !opened && new URL(q.url()).origin === HUB, 'E. …and never a navigation to Mail’s own address (D23’s rule at /mail/, §7)', js({ away, opened, url: q.url() }));
  await ctx.close();
});

const errs = everyone.flatMap((x) => x.errs || []).filter((e) => !/Failed to fetch|NetworkError|ERR_|george-off.*(404|403|CORS|Access-Control|dynamically imported)/.test(e));
ok(!errs.some((e) => /CSP violation|Refused to/.test(e)), 'no CSP violation on any page of the hub (C13)', js(errs.filter((e) => /CSP|Refused/.test(e)).slice(0, 6)));
ok(!errs.length, 'no page error and no console error on any page (the switched-off stand-ins’ refusals aside)', js(errs.slice(0, 8)));
await closeAll();
await K.b.close().catch(() => {});
console.log(`FAILS ${fails()}`);
process.exit(0);
