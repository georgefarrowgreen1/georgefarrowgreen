// The site's admin is an account: Admin is a section of its own page (the old InFlight dashboard, and the owner's
// sign-in for it, are gone: their addresses come here). It's the account linked to it (pg_meta admin_user), or, with
// none (or that one gone), the account with the site owner's email once that's confirmed. On its page: the figures,
// Accounts (one account: pigeons given, a reset link, signing out, deleting), Invites, Insights, Storage, Email and the
// admin log; looking needs a sign-in shown in the last 12 hours, a change one in the last 10 minutes; each change in the
// account's Recent activity; another account gets none of it. (The site's addresses stood in for by gfg.test.)
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import http from 'http';
import { joinInFlight } from './join.mjs';
const [,, S, out] = process.argv;
const SITE = 'http://gfg.test:8788', CHAT = 'http://chat.gfg.test:8788', ACCT = 'http://account.gfg.test:8788', PW = 'a long test password';
const sql0 = (q) => execSync(`${S}/wr/node_modules/.bin/wrangler d1 execute bio-db --local --persist-to ${S}/wrstate --command "${q}"`, { cwd: process.env.APP_ROOT, stdio: 'pipe' }).toString();
const sql = (q) => { for (let i = 0; ; i++) { try { return sql0(q); } catch (e) { if (i > 5 || !/SQLITE_BUSY/.test(String(e.stdout) + String(e.stderr) + e.message)) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400); } } };
let fails = 0; const errs = [];
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${extra ? '  — ' + extra : ''}`); if (!c) fails++; };

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined,
  args: ['--host-resolver-rules=MAP *.gfg.test 127.0.0.1, MAP gfg.test 127.0.0.1', `--unsafely-treat-insecure-origin-as-secure=${SITE},${CHAT},${ACCT}`] });
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
async function browser(name) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'en-GB', isMobile: true, hasTouch: true, userAgent: IPHONE, colorScheme: 'dark' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${name}: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d|Cross-Origin-Opener-Policy header has been ignored/.test(m.text())) errs.push(`${name}: ${m.text()}`); });
  const cdp = await ctx.newCDPSession(p); await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true } });
  return { ctx, p, name };
}
// a request from outside the browser, as the browser would send it (its cookies)
async function req(x, url, { method = 'GET', headers = {}, data } = {}) {
  const u = new URL(url), cookie = (await x.ctx.cookies(url)).map((c) => `${c.name}=${c.value}`).join('; ');
  return new Promise((ok, no) => {
    const r = http.request({ host: '127.0.0.1', port: u.port, path: u.pathname + u.search, method, agent: false, headers: { Host: u.host, ...(cookie ? { Cookie: cookie } : {}), ...headers } }, (res) => {
      const parts = []; res.on('data', (c) => parts.push(c));
      res.on('end', () => { const body = Buffer.concat(parts).toString(); let j = null; try { j = JSON.parse(body); } catch (_) {} ok({ status: res.statusCode, json: j }); });
    });
    r.on('error', no); if (data) r.write(data); r.end();
  });
}
const settle = (x, ms = 900) => x.p.waitForTimeout(ms);
const text = (x, sel = 'main') => x.p.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ').trim() || '', sel);
const sheetText = (x) => text(x, '#sheet');
const adminRow = (x, title) => x.p.click(`section.section:has(h3:text-is("Admin")) .row:has(b:text-is("${title}"))`);
const account = async (x) => { await x.p.goto(`${ACCT}/`); await x.p.waitForSelector('main:not([aria-busy])', { timeout: 20000 }); await settle(x); };
const adminText = (x) => x.p.evaluate(() => [...document.querySelectorAll('section.section')].find((s) => s.querySelector('h3')?.textContent === 'Admin')?.innerText.replace(/\s+/g, ' ').trim() || '');
const waitSheet = (x, re, ms = 15000) => x.p.waitForFunction((r) => new RegExp(r).test(document.querySelector('#sheet')?.innerText || ''), re.source, { timeout: ms }).then(() => true, () => false);

// ---- 1. The owner's email (PIGEON_ADMIN_EMAIL, here owner@example.com) on an account with a passkey; another account ----
const G = await browser('admin'), P = await browser('pat');
await joinInFlight(G.p, `${CHAT}/`, { name: 'Gail Admin', handle: 'gail', email: 'owner@example.com', password: PW, city: 'London', passkey: true });
await joinInFlight(P.p, `${CHAT}/`, { name: 'Pat Reed', handle: 'pat', email: 'pat@example.com', password: PW, city: 'Leeds' });
const idOf = (h) => sql(`SELECT id FROM pg_users WHERE handle = '${h}'`).match(/"id": "([^"]+)"/)[1];
const gail = idOf('gail'), pat = idOf('pat');
await account(G);
ok(!(await adminText(G)), 'the owner’s email not confirmed yet: no Admin');
let r = await req(G, `${ACCT}/api/account/admin/users`);
ok(r.status === 403, 'nor its API', String(r.status));

// ---- 2. Confirmed: Admin, on its page; a link to another account goes first; gone, back to the owner's email ----
sql(`UPDATE pg_users SET email_ok = ${Date.now()} WHERE id = '${gail}'`);
await account(G);
for (let i = 0; i < 20 && !/Accounts 2/.test(await adminText(G)); i++) await settle(G, 500);
const sec = await adminText(G);
ok(/Accounts 2/.test(sec) && /Invites 0 unused/.test(sec) && /Email Working/.test(sec), 'confirmed: Admin, with its figures (2 accounts, no invites, email working)', sec);
sql(`INSERT OR REPLACE INTO pg_meta (k, v) VALUES ('admin_user', '${pat}')`);
r = await req(G, `${ACCT}/api/account/admin/users`);
const rp = await req(P, `${ACCT}/api/account/admin/users`);
ok(r.status === 403 && rp.status === 403 && rp.json?.field === 'passkey', 'linked to @pat instead: @gail’s Admin goes, and @pat’s needs a passkey first', `${r.status} ${rp.status} ${JSON.stringify(rp.json)}`);
sql(`UPDATE pg_users SET delete_at = ${Date.now() + 7 * 864e5} WHERE id = '${pat}'`);
r = await req(G, `${ACCT}/api/account/admin/users`);
ok(r.status === 200, 'the linked account being deleted: back to the owner’s email', String(r.status));
sql(`UPDATE pg_users SET delete_at = NULL WHERE id = '${pat}'`); sql("DELETE FROM pg_meta WHERE k = 'admin_user'");

// ---- 3. The old dashboard's addresses come here; its API is gone ----
await G.p.goto(`${SITE}/pigeon/admin/`); await G.p.waitForURL(/account\.gfg\.test/, { timeout: 15000 }).catch(() => {});
ok(G.p.url().startsWith(`${ACCT}/#admin`) || G.p.url().startsWith(ACCT), 'the old dashboard’s address: on to Admin on the account’s page', G.p.url());
await G.p.goto(`${CHAT}/admin`); await G.p.waitForURL(/account\.gfg\.test/, { timeout: 15000 }).catch(() => {});
ok(G.p.url().startsWith(ACCT), 'and InFlight’s /admin', G.p.url());
r = await req(G, `${CHAT}/api/pigeon/admin-users`);
const r2 = await req(G, `${CHAT}/api/pigeon/admin-status`);
ok(r.status === 404 && r2.status === 404, 'InFlight’s old admin API: gone', `${r.status} ${r2.status}`);

// ---- 4. Accounts: the list, one account, pigeons given, a reset link, signing out ----
await account(G);
await adminRow(G, 'Accounts'); await waitSheet(G, /Pat Reed/);
ok(/Gail Admin/.test(await sheetText(G)) && /Pat Reed/.test(await sheetText(G)), 'Accounts: both, by name and handle', await sheetText(G));
await G.p.fill('#sheet input[type=search]', 'pat'); await settle(G, 300);
ok(!/Gail Admin/.test(await sheetText(G)) && /Pat Reed/.test(await sheetText(G)), 'searching narrows it');
await G.p.click('#sheet .row:has(b:text-is("Pat Reed"))'); await waitSheet(G, /pat@example\.com/);
ok(/pat@example\.com/.test(await sheetText(G)) && /Pigeons/.test(await sheetText(G)), 'one account: its details', await sheetText(G));
await G.p.click('#sheet [aria-label="Give 1 swift pigeon"]');
await G.p.waitForFunction(() => /swift pigeon/.test(document.querySelector('.toast')?.textContent || ''), null, { timeout: 10000 }).catch(() => {});
ok(/swift pigeon/.test(await text(G, '.toast')), 'a pigeon given (signed in just now: no asking)', await text(G, '.toast'));
await G.p.click('#sheet .row.action:text-is("Make a reset link")'); await waitSheet(G, /#reset=/);
ok(/#reset=[A-Za-z0-9_-]{30,}/.test(await sheetText(G)), 'a reset link, to copy');
// (a change needs a sign-in in the last 10 minutes: older, and it asks)
sql(`UPDATE pg_sessions SET auth_at = ${Date.now() - 30 * 60e3} WHERE user_id = '${gail}'`);
await G.p.click('#sheet .row.action:text-is("Sign out everywhere")');
ok(await G.p.waitForSelector('#sheet h2:text-is("Confirm it’s you")', { timeout: 8000 }).then(() => true, () => false), 'a change, half an hour on: Confirm it’s you first');
await G.p.click('#sheet .btn:has-text("Use a passkey")');
await G.p.waitForFunction(() => /signed out/.test(document.querySelector('.toast')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
ok(/signed out/.test(await text(G, '.toast')), 'with the passkey: done', await text(G, '.toast'));
r = await req(P, `${CHAT}/api/pigeon/sync`);
ok(r.status === 401, '@pat signed out', String(r.status));

// ---- 5. Looking needs a sign-in in the last 12 hours ----
sql(`UPDATE pg_sessions SET auth_at = ${Date.now() - 13 * 3600e3} WHERE user_id = '${gail}'`);
r = await req(G, `${ACCT}/api/account/admin/users`);
ok(r.status === 403 && r.json?.field === 'reauth', 'a sign-in 13 hours old: asked to confirm before looking', `${r.status} ${JSON.stringify(r.json)}`);
sql(`UPDATE pg_sessions SET auth_at = ${Date.now()} WHERE user_id = '${gail}'`);

// ---- 6. Invites, Insights, Storage, Email, the log ----
await account(G);
await adminRow(G, 'Invites'); await G.p.waitForSelector('#sheet form input');
await G.p.fill('#sheet form input', 'Sam'); await G.p.click('#sheet form .btn'); await waitSheet(G, /#invite=/); await waitSheet(G, /Unused · made/);
ok(/#invite=/.test(await sheetText(G)) && /Sam/.test(await sheetText(G)), 'an invite made: its link once, and in the list', await sheetText(G));
await G.p.click('#sheet .row:has(b:text-is("Sam")) .mini');
await G.p.waitForFunction(() => /Invite cancelled/.test(document.querySelector('.toast')?.textContent || ''), null, { timeout: 10000 }).catch(() => {});
ok(/Cancelled/.test(await sheetText(G)), 'and cancelled');
await G.p.click('#sheet .x'); await settle(G, 600);
await adminRow(G, 'Insights'); ok(await waitSheet(G, /Pigeons sent/), 'Insights', (await sheetText(G)).slice(0, 120));
await G.p.click('#sheet .x'); await settle(G, 600);
await adminRow(G, 'Storage'); ok(await waitSheet(G, /Database/, 30000), 'Storage', (await sheetText(G)).slice(0, 120));
await G.p.click('#sheet .x'); await settle(G, 600);
await adminRow(G, 'Email'); ok(await waitSheet(G, /Send a test email/), 'Email: on, with a test');
await G.p.click('#sheet .x'); await settle(G, 600);
await adminRow(G, 'Admin log'); await waitSheet(G, /Pigeons given/);
ok(/Pigeons given/.test(await sheetText(G)) && /Signed out everywhere/.test(await sheetText(G)), 'the admin log', await sheetText(G));
await G.p.click('#sheet .x'); await settle(G, 600);

// ---- 7. Deleting an account (not your own); each change in your Recent activity ----
await adminRow(G, 'Accounts'); await waitSheet(G, /Pat Reed/);
await G.p.click('#sheet .row:has(b:text-is("Pat Reed"))'); await waitSheet(G, /pat@example\.com/);
await G.p.click('#sheet .row.action.danger'); await G.p.waitForSelector('#sheet form input');
await G.p.fill('#sheet form input', 'pat'); await G.p.click('#sheet form .btn.danger');
await G.p.waitForFunction(() => /deleted/.test(document.querySelector('.toast')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
ok(/deleted/.test(await text(G, '.toast')) && !/Pat Reed/.test(await sheetText(G)), '@pat deleted', await text(G, '.toast'));
await G.p.click('#sheet .row:has(b:text-is("Gail Admin"))'); await waitSheet(G, /gail@example\.com/);
ok(!(await G.p.$('#sheet .row.action.danger')), 'your own account: no Delete here');
r = await req(G, `${ACCT}/api/account/admin/delete`, { method: 'POST', headers: { Origin: ACCT, 'Content-Type': 'application/json' }, data: JSON.stringify({ id: gail, confirm: 'gail' }) });
ok(r.status === 400, 'nor through the API', String(r.status));
const ev = sql(`SELECT detail FROM pg_events WHERE user_id = '${gail}' AND kind = 'admin'`);
ok(/Gave pigeons/.test(ev) && /Deleted an account/.test(ev) && /Signed an account out/.test(ev), 'each change in your Recent activity');

// ---- 8. Another account gets none of it; a change from elsewhere is refused ----
const O = await browser('other');
await joinInFlight(O.p, `${CHAT}/`, { name: 'Olly Other', handle: 'olly', email: 'olly@example.com', password: PW, city: 'York', passkey: true });
await account(O);
ok(!(await O.p.$('section.section:has(h3:text-is("Admin"))')), 'another account: no Admin');
r = await req(O, `${ACCT}/api/account/admin/users`);
ok(r.status === 403, 'nor its API', String(r.status));
r = await req(G, `${ACCT}/api/account/admin/invite`, { method: 'POST', headers: { Origin: 'http://evil.example', 'Content-Type': 'application/json' }, data: '{}' });
ok(r.status === 403, 'a change sent from another site: refused', String(r.status));

await G.p.screenshot({ path: `${out}/admin.png` });
ok(!errs.length, 'no errors', errs.join(' | '));
console.log(`FAILS ${fails}`); await b.close(); process.exit(0);
