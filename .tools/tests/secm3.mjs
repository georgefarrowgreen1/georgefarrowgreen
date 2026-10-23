// Confirm it's you: adding or removing a passkey, deleting the account and fetching the
// password-locked key need a password or passkey in the last 10 minutes; passkeys must verify.
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { makeAccount, signInInFlight, accountUrl } from './join.mjs';
const [,, S, out] = process.argv;
const BASE = 'http://localhost:8788';
const sql0 = (q) => execSync(`${S}/wr/node_modules/.bin/wrangler d1 execute bio-db --local --persist-to ${S}/wrstate --command "${q}"`, { cwd: process.env.APP_ROOT, stdio: 'pipe' }).toString();
const sql = (q) => { for (let i = 0; ; i++) { try { return sql0(q); } catch (e) { if (i > 5) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400); } } };
const mails = () => readFileSync(`${S}/mailbox.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((m) => m.body || m);
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
let fails = 0; const ok = (c, l, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? ' — ' + x : ''}`); if (!c) fails++; };
const errs = [];
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36', hasTouch: true });
const G = await ctx.newPage();
G.on('pageerror', (e) => errs.push(`${e}`)); G.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
const cdp = await ctx.newCDPSession(G); await cdp.send('WebAuthn.enable');
const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true } });
// (the account made on the account's own page, then InFlight signed in to: join.mjs)
await makeAccount(G, accountUrl(BASE + '/pigeon/'), { name: 'George Farrow-Green', handle: 'george', email: 'george@example.com' });
await signInInFlight(G, BASE + '/pigeon/', { email: 'george@example.com' }); await G.waitForSelector('#city', { state: 'attached', timeout: 20000 });
await G.selectOption('#city', 'London'); await G.waitForSelector('[data-act=onbdone]', { timeout: 20000 });
await G.click('[data-act=onbdone]'); await G.waitForSelector('.tabs');
const sess = await G.evaluate(() => new Promise((res) => { const r = indexedDB.open('inflight'); r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('session'); g.onsuccess = () => res(g.result); }; }));
const api = (path, method = 'GET', body) => fetch(BASE + '/api/pigeon/' + path, { method, headers: { Authorization: 'Bearer ' + sess.token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => [r.status, await r.json().catch(() => ({}))]);
sql('UPDATE pg_users SET email_ok = 1');
const stale = () => sql(`UPDATE pg_sessions SET auth_at = ${Date.now() - 11 * 60e3}`);
const txt = async (s) => (await G.locator(s).first().innerText()).replace(/\s+/g, ' ');

// fresh straight after signing up
let [st] = await api('vault'); ok(st === 200, 'just signed in: the locked key comes back', String(st));
stale();
for (const [path, method, body] of [['vault', 'GET'], ['passkey-options', 'POST', { mode: 'register' }], ['me', 'DELETE'], ['passkey', 'DELETE', { id: 'x' }], ['passkey-vault', 'POST', { id: 'x', vault: 'v'.repeat(30) }]]) {
  const [s, j] = await api(path, method, body);
  ok(s === 403 && j.field === 'reauth', `10 minutes on, ${method} ${path} asks to confirm it's you`, `${s} ${j.field}`);
}
const [s2, j2] = await api('passkey-options', 'POST', { mode: 'login' }); ok(s2 === 200 && j2.challenge, 'signing in with a passkey still works without it');
[st] = await api('reauth', 'POST', { proof: 'A'.repeat(43) }); ok(st === 401, 'a wrong password proof is refused', String(st));
[st] = await api('vault', 'POST', { proof: 'A'.repeat(43) }); ok(st === 401, 'and can’t fetch the locked key either', String(st));

// adding a passkey: the sheet asks for the password first
await G.click('[data-act=tab][data-id=account]'); await G.waitForTimeout(300);
await G.waitForSelector('#screen > main.view [data-act=securitysheet]'); await G.click('#screen > main.view [data-act=securitysheet]');
await G.waitForSelector('.sheet [data-act=applock]'); await G.click('.sheet [data-act=applock]'); await G.waitForSelector('.sheet [data-act=pkadd]');   // (Lock InFlight needs a passkey: it opens Passkeys)
await G.click('.sheet [data-act=pkadd]'); await G.waitForSelector('#reauth-form', { timeout: 8000 });
ok(/Confirm It’s You/.test(await txt('.sheet')), 'Add a Passkey opens “Confirm It’s You”');
ok(!(await G.locator('[data-act=reauthpk]').count()), 'with no passkey saved there’s no passkey option');
await G.screenshot({ path: `${out}/reauth.png` });
await G.fill('#f-password', 'not my password'); await G.click('.sheet .nbtn.r'); await G.waitForTimeout(1500);
ok(/isn’t right/.test(await txt('.sheet')), 'a wrong password says so', await txt('.sheet .ferr, .sheet .err').catch(() => ''));
await G.fill('#f-password', 'a long test password'); await G.click('.sheet .nbtn.r');
await G.waitForSelector('.toast', { timeout: 15000 });
ok(/Passkey saved/.test(await txt('.toast')), 'the right one carries on and saves the passkey', await txt('.toast'));
[st] = await api('vault'); ok(st === 200, 'and counts for the next 10 minutes');
await G.waitForTimeout(800);
const pkMail = mails().find((m) => /passkey was added/i.test(m.subject || ''));
ok((pkMail && pkMail.to?.includes?.('george@example.com') || pkMail?.to === 'george@example.com') && pkMail.from === 'Account <account@georgefarrowgreen.com>', 'an email, from the account, says a passkey was added', `${pkMail?.from} · ${pkMail?.subject}`);

// removing it: Cancel leaves it be, a passkey also confirms
stale();
await G.waitForSelector('.sheet [data-act=pkdel]'); await G.waitForTimeout(400);
await G.click('.sheet [data-act=pkdel]'); await G.waitForSelector('#reauth-form', { timeout: 8000 });
ok(await G.locator('[data-act=reauthpk]').count() === 1, 'now “Use a Passkey Instead” is offered');
await G.click('.sheet .nbtn.l'); await G.waitForTimeout(800);
ok(await G.locator('.sheet [data-act=pkdel]').count() === 1 && !(await G.locator('.toast').filter({ hasText: 'Cancelled' }).count()), 'Cancel goes back to Passkeys with the passkey still there, and no error');
await G.click('.sheet [data-act=pkdel]'); await G.waitForSelector('[data-act=reauthpk]', { timeout: 8000 });
await G.click('[data-act=reauthpk]');
await G.waitForFunction(() => /Passkey removed/.test(document.querySelector('.toast')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
ok(/Passkey removed/.test(await txt('.toast').catch(() => '')), 'the passkey confirms it, and the passkey is removed', await txt('.toast').catch(() => ''));

// passkeys must verify the person (Face ID, fingerprint or passcode), not just be present:
// a key with no way to check who's holding it can be saved, but can't sign in
await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
const { authenticatorId: bare } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'usb', hasResidentKey: true, hasUserVerification: false, automaticPresenceSimulation: true } });
const r = await G.evaluate(async (token) => {
  const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
  const d = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4)), (c) => c.charCodeAt(0));
  const e = (u) => btoa(String.fromCharCode(...new Uint8Array(u))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  try {
    const o = await (await fetch('/api/pigeon/passkey-options', { method: 'POST', headers: H, body: '{"mode":"register"}' })).json();
    const c = await navigator.credentials.create({ publicKey: { challenge: d(o.challenge), rp: { id: o.rpId, name: 'InFlight' }, user: { id: d(o.user.id), name: o.user.name, displayName: o.user.displayName },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }], authenticatorSelection: { residentKey: 'discouraged', userVerification: 'discouraged' } } }).catch((x) => { throw new Error('create ' + x); });
    const reg = await fetch('/api/pigeon/passkey-register', { method: 'POST', headers: H, body: JSON.stringify({ challenge: o.challenge, id: c.id, publicKey: e(c.response.getPublicKey()), alg: c.response.getPublicKeyAlgorithm(), clientDataJSON: e(c.response.clientDataJSON), label: 'Key' }) });
    const o2 = await (await fetch('/api/pigeon/passkey-options', { method: 'POST', headers: H, body: '{"mode":"login"}' })).json();
    const a = await navigator.credentials.get({ publicKey: { challenge: d(o2.challenge), rpId: o2.rpId, userVerification: 'discouraged', allowCredentials: [{ type: 'public-key', id: c.rawId }] } }).catch((x) => { throw new Error('get ' + x); });
    const flags = new Uint8Array(a.response.authenticatorData)[32];
    const res = await fetch('/api/pigeon/passkey-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challenge: o2.challenge, id: a.id, clientDataJSON: e(a.response.clientDataJSON), authenticatorData: e(a.response.authenticatorData), signature: e(a.response.signature) }) });
    return { reg: reg.status, flags, status: res.status };
  } catch (err) { return { err: String(err) }; }
}, sess.token);
ok(r.reg === 200 && r.status === 401 && (r.flags & 1) && !(r.flags & 4), 'a passkey that didn’t verify the person can’t sign in', JSON.stringify(r));
await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: bare });

// changing the password is on the account's page too (which locks the messages' key with the new one), not in InFlight
await G.click('.sheet .nbtn.l'); await G.waitForSelector('.sheet [data-act=encryptionsheet]');
ok(!(await G.$('.sheet [data-act=changepw]')) && !(await G.$('.sheet [data-act=passkeys]')), 'no Change Password or Passkeys in InFlight’s Privacy & Security');

// deleting the account is on its own page, not in InFlight
if (await G.$('.sheet')) { await G.click('.sheet header [data-act=close]').catch(() => {}); await G.waitForTimeout(500); }
await G.click('[data-act=tab][data-id=account]').catch(() => {}); await G.waitForSelector('#screen > main.view [data-act=signout]');
ok(!(await G.$('#screen > main.view [data-act=delask]')), 'no Delete Account in InFlight');
console.log('errors', errs); console.log('FAILS', fails); await b.close();
