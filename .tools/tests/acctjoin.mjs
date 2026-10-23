// Joining, and getting back in, on the account's own page only: accounts are made there (by invite, as on the real
// site), and a forgotten password is reset there; the apps only sign in, and send anyone new, or locked out, to it.
// InFlight's older links (an invite, a reset) still work: they're passed on to the account's page. The site's
// addresses are stood in for by gfg.test, as in acctpage.mjs.
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
const [,, S, out] = process.argv;
const CHAT = 'http://chat.gfg.test:8788', WX = 'http://weather.gfg.test:8788', ACCT = 'http://account.gfg.test:8788';
const PW = 'a long test password', PW2 = 'Orchard lantern 42 ferry', PW3 = 'Copper kettle 19 harbour';
const sql0 = (q) => execSync(`${S}/wr/node_modules/.bin/wrangler d1 execute bio-db --local --persist-to ${S}/wrstate --command "${q}"`, { cwd: process.env.APP_ROOT, stdio: 'pipe' }).toString();
const sql = (q) => { for (let i = 0; ; i++) { try { return sql0(q); } catch (e) { if (i > 5 || !/SQLITE_BUSY/.test(String(e.stdout) + String(e.stderr) + e.message)) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400); } } };
const rows = (q) => { const o = sql(q), m = o.match(/"results": (\[[\s\S]*?\])\s*,\s*"success"/); return m ? JSON.parse(m[1]) : []; };
let fails = 0; const errs = [];
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${extra ? '  — ' + extra : ''}`); if (!c) fails++; };

// (new accounts by invite only, as on the real site: the site restarted so, keeping its database)
execSync(`${S}/restartkeep.sh`, { env: { ...process.env, OPEN_SIGNUP: '0' }, stdio: 'ignore' });

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined,
  args: ['--host-resolver-rules=MAP *.gfg.test 127.0.0.1, MAP gfg.test 127.0.0.1', `--unsafely-treat-insecure-origin-as-secure=${CHAT},${WX},${ACCT}`] });
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
// (each with a passkey maker of its own, as a phone has: one that can hold a copy of InFlight's key, PRF)
async function browser(name) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'en-GB', isMobile: true, hasTouch: true, userAgent: IPHONE, colorScheme: 'dark' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${name}: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d|Cross-Origin-Opener-Policy header has been ignored/.test(m.text())) errs.push(`${name}: ${m.text()}`); });
  const cdp = await ctx.newCDPSession(p); await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true } });
  return { ctx, p, name };
}
const shot = (x, n) => x.p.screenshot({ path: `${out}/${n}.png` });
const settle = (x, ms = 900) => x.p.waitForTimeout(ms);
const text = (x, sel = 'main') => x.p.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ').trim() || '', sel);
const waitText = (x, re, sel = 'main', ms = 30000) => x.p.waitForFunction(([r, s]) => new RegExp(r).test(document.querySelector(s)?.innerText || ''), [re.source, sel], { timeout: ms }).catch(() => {});
const open = async (x, url) => { await x.p.goto('about:blank'); await x.p.goto(url); await x.p.waitForSelector('main:not([aria-busy])', { timeout: 20000 }); await settle(x); };
const mails = () => { try { return readFileSync(`${S}/mailbox.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((m) => m.body || m); } catch (_) { return []; } };
const mailsTo = (to, re) => mails().filter((m) => [].concat(m.to).includes(to) && re.test(m.subject || ''));
const waitMail = async (to, re, n = 1, ms = 15000) => { const t0 = Date.now(); for (;;) { const m = mailsTo(to, re); if (m.length >= n || Date.now() - t0 > ms) return m[n - 1]; await new Promise((r) => setTimeout(r, 300)); } };
const tokenIn = (m, kind) => (new RegExp(`#${kind}=([A-Za-z0-9_-]{40,50})`).exec(m?.text || '') || [])[1];
const user = (h) => rows(`SELECT id, pub, salt, email_ok FROM pg_users WHERE handle = '${h}'`)[0];
const count = (q) => rows(q)[0].n;
// an invite, as the site's owner makes one (only its hash kept)
const invite = () => { const t = Buffer.from(Array.from({ length: 32 }, () => Math.floor(Math.random() * 256))).toString('base64url'), hash = createHash('sha256').update(t).digest('hex');
  sql(`INSERT INTO pg_invites (hash, id, note, created_at) VALUES ('${hash}', '${hash.slice(0, 16)}', 'test', ${Date.now()})`); return t; };
// the account's page's join form, filled in and sent
async function fillJoin(x, { name, handle, email, password = PW }) {
  await x.p.waitForSelector('main .signin input[name=name]', { timeout: 20000 });
  await x.p.fill('main input[name=name]', name); await x.p.fill('main input[name=handle]', handle);
  await x.p.fill('main input[name=email]', email); await x.p.fill('main input[name=password]', password);
  await x.p.click('main .signin form .btn');
}

// ---- 1. Without an invite: no way to make one, on the page or past it ----
const V = await browser('visitor');
await open(V, `${ACCT}/`);
await waitText(V, /New accounts are by invitation/);
const signin = await text(V);
ok(/Sign in with a passkey/.test(signin) && /or with your email/.test(signin) && /Forgot password\?/.test(signin) && /New accounts are by invitation\./.test(signin) && !/Create your account/.test(signin),
  'the account\'s page, signed out: a passkey, then email and password; and, with no invite, accounts said to be by invitation', signin.slice(-160));
await open(V, `${ACCT}/#join`); await waitText(V, /by invitation/);
ok(/If someone sent you an invite link, open it to start/.test(await text(V)) && !(await V.p.$('main input[name=name]')) && V.p.url() === `${ACCT}/`, 'Create your account, with no invite: what to do, and no form', await text(V, 'main .signin'));
const noInvite = await V.p.evaluate(async () => { const r = await fetch('/api/account/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'X', handle: 'xxx', email: 'x@example.com' }) }); return [r.status, (await r.json()).field]; });
ok(noInvite[0] === 403 && noInvite[1] === 'invite', 'and the server makes none without one', noInvite.join());
await shot(V, '01-invite-only');

// ---- 2. An invite, from an InFlight link of before: passed on to the account's page, which makes the account ----
const T1 = invite();
await V.p.goto('about:blank'); await V.p.goto(`${CHAT}/#invite=${T1}`);
await V.p.waitForURL(`${ACCT}/`, { timeout: 20000 }).catch(() => {});
await V.p.waitForSelector('main .signin input[name=name]', { timeout: 20000 }).catch(() => {});
ok(V.p.url() === `${ACCT}/` && /You’ve been invited\./.test(await text(V)) && /Create your account/.test(await text(V)), 'InFlight\'s invite link: on to the account\'s page (the invite out of the address), the form there', V.p.url());
await V.p.fill('main input[name=name]', 'Ivy Lane'); await settle(V, 900);
ok(await V.p.inputValue('main input[name=handle]') === 'ivy_l' && /@ivy_l is yours/.test(await text(V)), 'a handle suggested from the name, and checked as it\'s typed', await V.p.inputValue('main input[name=handle]'));
await shot(V, '02-join');
await fillJoin(V, { name: 'Ivy Lane', handle: 'ivy', email: 'ivy@example.com' });
await V.p.waitForSelector('main .hero', { timeout: 60000 }).catch(() => {});
ok(/Ivy Lane/.test(await text(V)) && /Welcome, Ivy\. Your account is ready\./.test(await text(V, '#toast')), 'made, and signed in: the account\'s own page', await text(V, '#toast'));
const ivy = user('ivy');
ok(!!ivy && ivy.salt.startsWith('a2:') && count(`SELECT COUNT(*) AS n FROM pg_invites WHERE used_by = '${ivy.id}'`) === 1, 'the account, its password in Argon2id\'s form, and the invite used up by it');
const confirmMail = await waitMail('ivy@example.com', /Confirm/);
ok(!!tokenIn(confirmMail, 'confirm') && new RegExp(`${ACCT}/#confirm=`).test(confirmMail.text) && !/InFlight/.test(confirmMail.subject), 'an email to confirm the address, from the account\'s page', confirmMail?.subject);
await shot(V, '03-joined');
// the same invite again, or a wrong one
const W = await browser('second');
await open(W, `${ACCT}/#invite=${T1}`); await waitText(W, /already been used/);
ok(/That invite has already been used\./.test(await text(W)) && !(await W.p.$('main input[name=name]')), 'the same invite again: used, and said so', await text(W, 'main .signin'));
await open(W, `${ACCT}/#invite=${'x'.repeat(43)}`); await waitText(W, /isn’t right/);
ok(/That invite link isn’t right/.test(await text(W)), 'a made-up one: said not to be right');

// ---- 3. The apps: sign-in only, the same way as the account's page; anyone new sent to it ----
const N = await browser('newcomer');
await N.p.goto(`${CHAT}/`); await N.p.waitForSelector('.welcome', { timeout: 20000 });
const welcomeJoin = await N.p.$eval('.welcome .wnew a', (a) => a.href).catch(() => '');
ok(welcomeJoin === `${ACCT}/#join` && !(await N.p.$('[data-id=signup], [data-form=signup]')), 'InFlight\'s welcome: Sign in, and New here? Create your account (on the account\'s page)', welcomeJoin);
await N.p.click('[data-act=to][data-id=signin]'); await N.p.waitForSelector('[data-form=signin]');
const order = await N.p.evaluate(() => [...document.querySelector('[data-form=signin]').closest('.auth').querySelectorAll('[data-act=pkget], .orline, [data-form=signin], a.cell, .wnew a')].map((e) => e.matches('[data-act=pkget]') ? 'passkey' : e.matches('.orline') ? e.textContent : e.matches('form') ? 'form' : e.textContent + ' ' + e.getAttribute('href')));
ok(order.join(' | ') === `passkey | or with your email | form | Forgot password? ${ACCT}/#forgot | Create your account ${ACCT}/#join`, 'InFlight\'s Sign in: a passkey, then email and password; a forgotten password, and a new account, on the account\'s page', order.join(' | '));
await N.p.click('[data-form=signin] .btn');
ok(await text(N, '.ferr:not([hidden])') === 'Enter your email.', 'nothing typed: the same words as every page of the site', await text(N, '.ferr:not([hidden])'));
await shot(N, '04-inflight-signin');
const forgotSays = await N.p.evaluate(() => fetch('/api/pigeon/reset-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((r) => r.status));
ok(forgotSays === 410, 'InFlight\'s own reset is gone too (the account\'s page does it)', String(forgotSays));

// ---- 4. Ivy in InFlight, with a passkey (which keeps a copy of her key) ----
await V.p.goto('about:blank'); await V.p.goto(`${CHAT}/`);
await V.p.waitForSelector('.welcome [data-act=resume]', { timeout: 20000 }).catch(() => {});
ok(/Continue as Ivy/.test(await text(V, '.welcome')), 'InFlight in the same browser: Continue as Ivy (signed in on the site already)', await text(V, '.welcome'));
await V.p.click('[data-act=resume]'); await V.p.fill('[data-form=unlock] #f-password', PW); await V.p.click('[data-form=unlock] .btn');
await V.p.waitForSelector('#city', { state: 'attached', timeout: 40000 }); await V.p.selectOption('#city', 'London');
await V.p.waitForSelector('[data-act=pkadd]', { timeout: 20000 }); await V.p.click('[data-act=pkadd]'); await V.p.waitForSelector('.tabs', { timeout: 30000 });
ok(count(`SELECT COUNT(*) AS n FROM pg_passkeys WHERE user_id = '${ivy.id}' AND vault IS NOT NULL`) === 1, 'her passkey holds a copy of her key, sealed with its own secret');

// ---- 5. Forgot password, on the account's page: a link by email; kept her key with the passkey ----
const R = await browser('reset');
await open(R, `${ACCT}/#forgot`);
ok(/Forgot your password\?/.test(await text(R)) && /Remembered it\? Sign in/.test(await text(R)), 'Forgot password: its own card', await text(R));
await R.p.fill('main input[name=email]', 'nobody@example.com'); await R.p.click('main .signin form .btn'); await R.p.waitForSelector('main .sent', { timeout: 15000 });
const saysNobody = await text(R, 'main .sent');
await open(R, `${ACCT}/#forgot`);
await R.p.fill('main input[name=email]', 'ivy@example.com'); await R.p.click('main .signin form .btn'); await R.p.waitForSelector('main .sent', { timeout: 15000 });
const saysIvy = await text(R, 'main .sent');
ok(saysIvy === saysNobody && /If there’s an account for that email, a reset link is on its way/.test(saysIvy), 'said the same whether there\'s an account or not', saysIvy);
await shot(R, '05-forgot-sent');
const rm = await waitMail('ivy@example.com', /Reset your password/);
const RT = tokenIn(rm, 'reset');
ok(!!RT && new RegExp(`${ACCT}/#reset=`).test(rm.text) && !mailsTo('nobody@example.com', /./).length, 'an email with a link to the account\'s page (and none to an address with no account)', rm?.subject);
// opened from InFlight's older address for it, on the phone with the passkey
await V.p.goto('about:blank'); await V.p.goto(`${CHAT}/#reset=${RT}`);
await V.p.waitForURL(`${ACCT}/`, { timeout: 20000 }).catch(() => {}); await waitText(V, /Choose a new password/);
const resetSays = await text(V);
ok(V.p.url() === `${ACCT}/` && /For Ivy Lane \(@ivy, i\S*@example\.com\)/.test(resetSays) && /Keep messages with passkey/.test(resetSays) && /Start fresh instead/.test(resetSays),
  'the link: who it\'s for (the email half hidden), and, with a passkey that has her key, a way to keep it', resetSays.slice(0, 220));
await shot(V, '06-reset');
await V.p.fill('main input[name=password]', PW2); await V.p.click('main .btn:has-text("Keep messages with passkey")');
await waitText(V, /Password changed/, '#toast');
const after = user('ivy');
ok(/Password changed\. Your messages are safe\./.test(await text(V, '#toast')) && after.pub === ivy.pub && after.salt !== ivy.salt, 'kept: the same key, a new password', await text(V, '#toast'));
ok(count(`SELECT COUNT(*) AS n FROM pg_passkeys WHERE user_id = '${ivy.id}'`) === 0 && count(`SELECT COUNT(*) AS n FROM pg_sessions WHERE user_id = '${ivy.id}'`) === 1 && !!after.email_ok,
  'every other sign-in, and every passkey, gone (just this one, signed in now); and the email confirmed by the link');
await shot(V, '07-reset-kept');
await open(V, `${ACCT}/#reset=${RT}`); await waitText(V, /won’t work/);
ok(/This link won’t work/.test(await text(V)), 'the link again: used', await text(V));

// ---- 6. And without a passkey: a new key ----
await open(R, `${ACCT}/#forgot`);
await R.p.fill('main input[name=email]', 'ivy@example.com'); await R.p.click('main .signin form .btn'); await R.p.waitForSelector('main .sent', { timeout: 15000 });
const RT2 = tokenIn(await waitMail('ivy@example.com', /Reset your password/, 2), 'reset');
await open(R, `${ACCT}/#reset=${RT2}`); await waitText(R, /Choose a new password/);
ok(!/Keep messages with passkey/.test(await text(R)) && /Set new password/.test(await text(R)), 'no passkey with her key: a new password, and a new key');
await R.p.fill('main input[name=password]', 'short'); await R.p.click('main .btn:has-text("Set new password")');
ok(/at least 10 characters/.test(await text(R, 'main .said')), 'a short one refused', await text(R, 'main .said'));
await R.p.fill('main input[name=password]', PW3); await R.p.click('main .btn:has-text("Set new password")');
await waitText(R, /Password changed/, '#toast');
ok(/starting fresh with a new key/.test(await text(R, '#toast')) && user('ivy').pub !== ivy.pub && /Ivy Lane/.test(await text(R, 'main .hero')), 'a new key, and signed in', await text(R, '#toast'));
// (the old password no longer signs in; the new one does)
const tries = await R.p.evaluate(async ([a, b2]) => {
  const { E2E } = await import('/crypto.js').catch(() => import('/pigeon/crypto.js'));
  const say = async (pw) => { const { salt } = await (await fetch('/api/account/signin/salt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'ivy@example.com' }) })).json();
    const { proof } = await E2E.fromPassword(pw, salt);
    return (await fetch('/api/account/signin/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'ivy@example.com', proof }) })).status; };
  return [await say(a), await say(b2)];
}, [PW2, PW3]).catch((e) => [e.message]);
ok(tries.join() === '401,200', 'the password before it no longer signs in; the new one does', tries.join());
await shot(R, '08-reset-fresh');

// ---- 7. Weather: sign-in only, sent to the account's page for the rest ----
const X = await browser('weather');
await X.ctx.route(/open-meteo\.com|bigdatacloud|rainviewer\.com|openstreetmap\.org|openfreemap\.org/, (r) => r.fulfill({ status: 503, body: '{}' }));
await X.p.goto(`${WX}/`); await X.p.waitForSelector('#settings-btn', { timeout: 30000 });
await X.p.click('#settings-btn'); await X.p.waitForSelector('#settings[open] #acct .acct-card', { timeout: 15000 });
await X.p.click('#acct-signin'); await X.p.waitForSelector('#acct-in .acct-form');
const wxWays = await X.p.$$eval('#acct-in a', (as) => as.map((a) => a.getAttribute('href')));
ok(wxWays.join() === `${ACCT}/#forgot,${ACCT}/#join` && !(await X.p.$('#acct-in input[name=name]')) && !!(await X.p.$('#acct-in #acct-passkey')), 'Weather: a passkey, email and password; Forgot password? and Create your account on the account\'s page', wxWays.join());

ok(errs.length === 0, 'no errors on any page', errs.slice(0, 4).join(' | '));
await b.close();
console.log(`FAILS ${fails}`);
process.exit(0);
