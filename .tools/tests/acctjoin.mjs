// Joining, and getting back in, on the account's own page only: accounts are made there (by invite, as on the real
// site), a forgotten password is reset there, and every app signs in there, handed the sign-in back (and the
// hand-back's own guarantees, at the end). Chat's older links (an invite, a reset) still work: they're passed on
// to the account's page. The apps' addresses are stood in for by ifl.test (the home page's by gfg.test), as in acctpage.mjs.
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { createHash, randomBytes } from 'crypto';
import { onAccountPage, fillJoin as joinSteps } from './join.mjs';
import { hostCall } from './handback.mjs';
const [,, S, out] = process.argv;
const CHAT = 'http://chat.ifl.test:8788', WX = 'http://weather.ifl.test:8788', ACCT = 'http://account.ifl.test:8788';
const PW = 'a long test password', PW2 = 'Orchard lantern 42 ferry', PW3 = 'Copper kettle 19 harbour';
const sql0 = (q) => execSync(`${S}/wr/node_modules/.bin/wrangler d1 execute bio-db --local --persist-to ${S}/wrstate --command "${q}"`, { cwd: process.env.APP_ROOT, stdio: 'pipe' }).toString();
const sql = (q) => { for (let i = 0; ; i++) { try { return sql0(q); } catch (e) { if (i > 5 || !/SQLITE_BUSY/.test(String(e.stdout) + String(e.stderr) + e.message)) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400); } } };
const rows = (q) => { const o = sql(q), m = o.match(/"results": (\[[\s\S]*?\])\s*,\s*"success"/); return m ? JSON.parse(m[1]) : []; };
let fails = 0; const errs = [];
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${extra ? '  — ' + extra : ''}`); if (!c) fails++; };

// (new accounts by invite only, as on the real site: the site restarted so, keeping its database)
execSync(`${S}/restartkeep.sh`, { env: { ...process.env, OPEN_SIGNUP: '0' }, stdio: 'ignore' });

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined,
  args: ['--host-resolver-rules=MAP *.gfg.test 127.0.0.1, MAP gfg.test 127.0.0.1, MAP *.ifl.test 127.0.0.1, MAP ifl.test 127.0.0.1', `--unsafely-treat-insecure-origin-as-secure=${CHAT},${WX},${ACCT}`] });
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
// (each with a passkey maker of its own, as a phone has: one that can hold a copy of Chat's key, PRF)
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
  await joinSteps(x.p, { name, handle, email, password });
}

// ---- 1. Without an invite: no way to make one, on the page or past it ----
const V = await browser('visitor');
await open(V, `${ACCT}/`);
await waitText(V, /Accounts are by invitation/);
const signin = await text(V);
ok(/Sign in with a passkey/.test(signin) && /or with your email/.test(signin) && /Forgot password\?/.test(signin) && /New here\? Accounts are by invitation: open the link you were sent to make yours\./.test(signin) && /One sign-in for Chat, Weather and Fitness/.test(signin) && !/Create your account/.test(signin),
  'the account\'s page, signed out: a passkey, then email and password; and, with no invite, accounts said to be by invitation', signin.slice(-160));
await open(V, `${ACCT}/#join`); await waitText(V, /You’ll need an invite/);
ok(/You’ll need an invite/.test(await text(V)) && !!(await V.p.$('main .signin input[name=invite]')) && !(await V.p.$('main input[name=name]')) && V.p.url() === `${ACCT}/`, 'Create your account, with no invite: what to do, a place for the link, and no form', await text(V, 'main .signin'));
const noInvite = await V.p.evaluate(async () => { const r = await fetch('/api/account/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'X', handle: 'xxx', email: 'x@example.com' }) }); return [r.status, (await r.json()).field]; });
ok(noInvite[0] === 403 && noInvite[1] === 'invite', 'and the server makes none without one', noInvite.join());
await shot(V, '01-invite-only');

// ---- 2. An invite, from a Chat link of before: passed on to the account's page, which makes the account ----
const T1 = invite();
await V.p.goto('about:blank'); await V.p.goto(`${CHAT}/#invite=${T1}`);
await V.p.waitForURL(`${ACCT}/`, { timeout: 20000 }).catch(() => {});
await V.p.waitForSelector('main .signin input[name=name]', { timeout: 20000 }).catch(() => {});
ok(V.p.url() === `${ACCT}/` && /You’ve been invited\./.test(await text(V)) && /Create your account/.test(await text(V)), 'Chat\'s invite link: on to the account\'s page (the invite out of the address), the form there', V.p.url());
await V.p.fill('main input[name=name]', 'Ivy Lane'); await V.p.click('main .signin form .btn'); await settle(V, 900);
ok(await V.p.inputValue('main input[name=handle]') === 'ivy_l' && /@ivy_l is yours/.test(await text(V)) && /2 of 4/.test(await text(V, 'main .signin')),
  'joining a step at a time: a handle suggested from the name, and checked as it\'s typed', await V.p.inputValue('main input[name=handle]'));
await shot(V, '02-join');
await V.p.click('main .signin .jhead .back'); await V.p.waitForSelector('main .signin input[name=name]', { state: 'visible' });
ok(await V.p.inputValue('main input[name=name]') === 'Ivy Lane' && /1 of 4/.test(await text(V, 'main .signin')), 'and Back, to the name, still there');
await fillJoin(V, { name: 'Ivy Lane', handle: 'ivy', email: 'ivy@example.com' });
await V.p.waitForSelector('main .hero', { timeout: 60000 }).catch(() => {});
ok(/Ivy Lane/.test(await text(V)) && /Welcome, Ivy\. Your account is ready\./.test(await text(V, '#toast')), 'made, and signed in: the account\'s own page', await text(V, '#toast'));
const ivy = user('ivy');
ok(!!ivy && ivy.salt.startsWith('a2:') && count(`SELECT COUNT(*) AS n FROM pg_invites WHERE used_by = '${ivy.id}'`) === 1, 'the account, its password in Argon2id\'s form, and the invite used up by it');
const confirmMail = await waitMail('ivy@example.com', /Confirm/);
ok(!!tokenIn(confirmMail, 'confirm') && new RegExp(`${ACCT}/#confirm=`).test(confirmMail.text) && !/Chat/.test(confirmMail.subject), 'an email to confirm the address, from the account\'s page', confirmMail?.subject);
await shot(V, '03-joined');
// the same invite again, or a wrong one
const W = await browser('second');
await open(W, `${ACCT}/#invite=${T1}`); await waitText(W, /already been used/);
ok(/That invite has already been used\./.test(await text(W)) && !(await W.p.$('main input[name=name]')), 'the same invite again: used, and said so', await text(W, 'main .signin'));
await open(W, `${ACCT}/#invite=${'x'.repeat(43)}`); await waitText(W, /isn’t right/);
ok(/That invite link isn’t right/.test(await text(W)), 'a made-up one: said not to be right');

// ---- 3. The apps: signing in, and anyone new, sent to the account's page (and back again) ----
const N = await browser('newcomer');
await N.p.goto(`${CHAT}/`); await N.p.waitForSelector('.welcome [data-act=acctsignin]', { timeout: 20000 });
const welcomeJoin = await N.p.$eval('.welcome .wnew a', (a) => a.href).catch(() => '');
ok(welcomeJoin === `${ACCT}/#join` && !(await N.p.$('[data-id=signup], [data-form=signup], [data-form=signin]')), 'Chat\'s welcome: Sign in, and New here? Create your account (both on the account\'s page)', welcomeJoin);
await N.p.click('.welcome [data-act=acctsignin]'); await N.p.waitForURL((u) => u.hostname.startsWith('account.'), { timeout: 20000 });
await N.p.waitForSelector('main .signin input[name=email]', { timeout: 20000 }); await settle(N);
const order = await N.p.evaluate(() => [...document.querySelectorAll('main .backapp, main .lead, main .signin > .btn, main .signin .or, main .signin form, main .signin .forgot')]
  .map((e) => e.matches('.backapp') ? `back to ${e.textContent.trim()}` : e.matches('.signin > .btn') ? 'passkey' : e.matches('form') ? 'form' : e.textContent.trim()));
ok(order.join(' | ') === 'back to Chat | Sign in to continue to Chat | passkey | or with your email | form | Forgot password?', 'Chat\'s Sign in: the account\'s page, saying so; a passkey, then email and password; a forgotten password', order.join(' | '));
await N.p.click('main .signin form .btn');
ok(await text(N, 'main .said') === 'Enter your email.', 'nothing typed: said, as everywhere on the site', await text(N, 'main .said'));
await shot(N, '04-inflight-signin');
// (and back, without signing in: Chat's welcome again)
await N.p.click('main .backapp'); await N.p.waitForURL((u) => u.hostname.startsWith('chat.'), { timeout: 20000 });
ok(await N.p.waitForSelector('.welcome [data-act=acctsignin]', { timeout: 20000 }).then(() => true, () => false), 'the way back from it: Chat\'s welcome, still signed out');
const forgotSays = await N.p.evaluate(() => fetch('/api/pigeon/reset-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((r) => r.status));
ok(forgotSays === 410, 'Chat\'s own reset is gone too (the account\'s page does it)', String(forgotSays));

// ---- 4. Ivy in Chat, with a passkey (which keeps a copy of her key) ----
await V.p.goto('about:blank'); await V.p.goto(`${CHAT}/`);
await V.p.waitForSelector('.welcome [data-act=acctsignin]:has-text("Continue as")', { timeout: 20000 }).catch(() => {});
ok(/Continue as Ivy/.test(await text(V, '.welcome')), 'Chat in the same browser: Continue as Ivy (signed in on the site already)', await text(V, '.welcome'));
// (on the account's page: her password, as that's what opens her key in Chat)
await V.p.click('.welcome [data-act=acctsignin]'); await onAccountPage(V.p, { email: 'ivy@example.com', password: PW });
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
// opened from Chat's older address for it, on the phone with the passkey
await V.p.goto('about:blank'); await V.p.goto(`${CHAT}/#reset=${RT}`);
await V.p.waitForURL(`${ACCT}/`, { timeout: 20000 }).catch(() => {}); await waitText(V, /Choose a new password/);
const resetSays = await text(V);
ok(V.p.url() === `${ACCT}/` && /For Ivy Lane \(@ivy, i\S*@example\.com\)/.test(resetSays) && /Keep messages with passkey/.test(resetSays) && /Start fresh instead/.test(resetSays),
  'the link: who it\'s for (the email half hidden), and, with a passkey that has her key, a way to keep it', resetSays.slice(0, 220));
await shot(V, '06-reset');
// (the link opened again in another tab before the first is used, as a second tap on it would: the first still works)
const V2 = await V.ctx.newPage(); await V2.goto(`${ACCT}/#reset=${RT}`);
const twice = await V2.waitForFunction(() => /Choose a new password/.test(document.querySelector('main')?.innerText || ''), null, { timeout: 30000 }).then(() => true, () => false);
await V2.close();
ok(twice, 'the same link opened again, in another tab');
await V.p.fill('main input[name=password]', PW2); await V.p.click('main .btn:has-text("Keep messages with passkey")');
await waitText(V, /Password changed/, '#toast');
const after = user('ivy');
ok(/Password changed\. Your messages are safe\./.test(await text(V, '#toast')) && after.pub === ivy.pub && after.salt !== ivy.salt, 'kept in the first tab all the same: the same key, a new password', await text(V, '#toast') || await text(V, 'main .said'));
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

// ---- 7. Weather: signing in sent to the account's page ----
const X = await browser('weather');
await X.ctx.route(/open-meteo\.com|bigdatacloud|rainviewer\.com|openstreetmap\.org|openfreemap\.org/, (r) => r.fulfill({ status: 503, body: '{}' }));
await X.p.goto(`${WX}/`); await X.p.waitForSelector('#settings-btn', { timeout: 30000 });
await X.p.click('#settings-btn'); await X.p.waitForSelector('#settings[open] #acct .acct-card', { timeout: 15000 });
ok(!(await X.p.$('#settings input[type=password], #settings [data-page=signin]')), 'Weather has no sign-in of its own');
await X.p.click('#acct-signin'); await X.p.waitForURL((u) => u.hostname.startsWith('account.'), { timeout: 20000 });
await X.p.waitForSelector('main .signin input[name=email]', { timeout: 20000 });
ok(/Sign in to continue to Weather/.test(await text(X, 'main .lead')) && /Weather/.test(await text(X, 'main .backapp')), 'Weather\'s Sign in: the account\'s page, saying so, with the way back to Weather', await text(X, 'main .lead'));

// ---- 8. A new email asked for: a word to the address as it is (confirmed or not) saying how to call it off; once it's
// changed, a word there saying how to get the account back ----
{
  const AC = 'account.ifl.test', ip = '10.8.0.3';
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']), pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const made = await hostCall(AC, '/api/account/signup', { invite: invite(), name: 'Eve Mead', handle: 'evemead', email: 'eve@example.com', salt: randomBytes(16).toString('base64url'),
    proof: randomBytes(32).toString('base64url'), vault: 'x'.repeat(40), pub: { kty: 'EC', crv: 'P-256', x: pub.x, y: pub.y } }, { ip });
  const asked = await hostCall(AC, '/api/account/email/change', { email: 'eve.new@example.com' }, { cookie: made.cookie, ip });
  const warn = await waitMail('eve@example.com', /new email was asked for/), link = await waitMail('eve.new@example.com', /Confirm your new email/);
  ok(made.s === 201 && asked.s === 200 && !rows("SELECT email_ok FROM pg_users WHERE handle = 'evemead'")[0].email_ok && /e•+@example\.com/.test(warn?.text || '')
    && /If this wasn’t you, sign in now and change your password\. That calls the change off and signs out every other device\./.test(warn?.text || ''),
    'a new email asked for: the address as it is told, confirmed or not, and how to call it off', `${made.s} ${asked.s} ${(warn?.text || '').slice(0, 200)}`);
  const done = await hostCall(AC, '/api/account/email/change-confirm', { token: tokenIn(link, 'email') }, { ip });
  const told = await waitMail('eve@example.com', /email was changed/);
  ok(done.s === 200 && /Ask the person who runs the site for a reset link, and you can put your email back\./.test(told?.text || ''),
    'opened: the old address told, and how to get the account back if it wasn\'t them', `${done.s} ${(told?.text || '').slice(0, 240)}`);
}

// ---- 9. The hand-back itself, straight against the API (functions/_handback.js) ----
{
  const AC = 'account.ifl.test', IN = 'chat.ifl.test', WE = 'weather.ifl.test', ip = '10.8.0.2';
  const word = () => { const w = randomBytes(32).toString('base64url'); return { w, ask: createHash('sha256').update(w).digest('base64url') }; };
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']), pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const made = await hostCall(AC, '/api/account/signup', { invite: invite(), name: 'Hal Back', handle: 'halback', email: 'hal@example.com', salt: randomBytes(16).toString('base64url'),
    proof: randomBytes(32).toString('base64url'), vault: 'x'.repeat(40), pub: { kty: 'EC', crv: 'P-256', x: pub.x, y: pub.y } }, { ip: '10.8.0.1' });
  ok(made.s === 201 && !!made.cookie, 'an account made on the account\'s page, signed in there', made.s);
  const ask = (app, k, cookie = made.cookie) => hostCall(AC, '/api/account/handback', { app, ask: k.ask, ...(app === 'inflight' ? { box: 'x'.repeat(48) } : {}) }, { cookie, ip });
  const code = async (app, k) => (await ask(app, k)).j.code;
  const take = (host, c, w, cookie = made.cookie) => hostCall(host, `/api/${host === IN ? 'pigeon' : 'weather'}/handback`, { code: c, verifier: w }, { cookie, ip });
  const k1 = word(), c1 = await code('weather', k1);
  ok(!!c1 && (await take(WE, c1, word().w)).s === 400 && (await take(WE, c1, k1.w)).s === 400, 'a code with the wrong word: refused, and used up');
  const k2 = word(), c2 = await code('weather', k2);
  ok(!!c2 && (await take(IN, c2, k2.w)).s === 400, 'Weather\'s code isn\'t Chat\'s');
  const k3 = word(), c3 = await code('weather', k3), once = await take(WE, c3, k3.w), again = await take(WE, c3, k3.w);
  ok(!!c3 && once.s === 200 && again.s === 400, 'a code is good once', `${once.s} ${again.s}`);
  // (two from one sign-in, Chat's used first: the sign-in moves to Chat, and Weather's still good)
  const ki = word(), ci = await code('inflight', ki), kw = word(), cw = await code('weather', kw);
  const inF = await take(IN, ci, ki.w), inW = await take(WE, cw, kw.w);
  ok(!!ci && !!cw && inF.s === 200 && inW.s === 200 && inW.j.signedIn === true, 'Chat\'s code and Weather\'s from one sign-in: both good, though Chat\'s takes the sign-in over',
    `${inF.s} ${inW.s} ${inW.j.error || ''}`);
  // (the sign-in here as if made long ago: no code for Chat without showing it's you, and Weather's, handed back
  // where the browser doesn't share it, no fresher)
  sql(`UPDATE pg_sessions SET auth_at = 0 WHERE site_hash = '${createHash('sha256').update((made.cookie || '=').split('=')[1]).digest('hex')}'`);
  const ko = word(), stale = await ask('inflight', ko), kx = word(), apart = await take(WE, await code('weather', kx), kx.w, null);
  const fromIt = apart.cookie ? await ask('inflight', word(), apart.cookie) : { s: 0 };
  ok(stale.s === 403 && apart.s === 200 && !!apart.cookie && fromIt.s === 403, 'a sign-in handed back is no fresher than the one it came from',
    `${stale.s} ${apart.s} ${fromIt.s}`);
}

ok(errs.length === 0, 'no errors on any page', errs.slice(0, 4).join(' | '));
await b.close();
console.log(`FAILS ${fails}`);
process.exit(0);
