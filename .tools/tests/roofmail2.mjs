// needs: hub mail roof-mail
// Mail under the roof, the rest of it (One roof stage 4, spec §10.2 roofmail2): George, the site's admin (an account made
// on the account's page with a password, so his sign-in can be confirmed again), at InFlite's hub with Mail's module
// switched on, real mail in Mail's Worker; Pat, who isn't the admin. In real Chromium against the hub stack.
//   7  Mail Settings: a change saved at Mail; New Address opens Mail Settings at Mail's own address; Notifications → You's
//      Mail Notifications sheet
//   8  Today's Mail card (numbers only), the Apps tile's line, mini and chips; Pat: no Mail in Edit Today or Apps
//   9  storage: using Mail adds only mail:* (and the framework's own ifl-*), no word of a message anywhere in it
//   10 the module's files through InFlite's Worker from Mail's, no cookie; "Mail updated" once (IFL.built); the budget
//   11 the gate: Confirm It's You round trip (Mail's hand-back over CORS); Pat's admin-only state after one call
//   12 CSP clean, axe, 390 light and dark, 1024
// Every check's line names the spec section it proves; selectors are roofhooks.mjs's (spec §10.2), or a control's role
// and the words on it.
import http from 'node:http';
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import * as H from './roofhooks.mjs';
import {
  HUB, EXCEPT, AXE, checker, phone, account, hostCall, pageCall, alive, loads, history, here, shown, gone, textOf, attrOf, count, visible,
  storage, changed, said, passed, meter, connectorFiles, moduleBuild, wait, until, js, closeAll,
} from './rooflib.mjs';
import { makeAccount, onAccountPage } from './join.mjs';

const [,, S, out] = process.argv;
const { ok, part, fails } = checker();
process.on('uncaughtException', (e) => { console.log(`FAIL  crashed: ${String(e?.message || e).split('\n')[0]}`); console.log(`FAILS ${fails() + 1}`); process.exit(0); });
const ROOT = process.env.APP_ROOT || new URL('../../', import.meta.url).pathname;
const MAIL = 'http://email.ifl.test:8788', MAILHOST = 'email.ifl.test:8788', ACCT = 'http://account.ifl.test:8788', AUTH = 'http://auth.ifl.test:8788';
const MAIL_PASS = 8807;    // the pass-through the root Worker reaches Mail's Worker through (hubstack.mjs MAIL_VIA, noted in hostpass.jsonl)
const shot = (p, name) => p.screenshot({ path: `${out}/${name}.png` }).catch(() => {});

// ---- Mail's hooks (roofhooks.mjs, spec §10.2) ----
const M_MAIL = H.M_MAIL, ROW = H.MAIL_ROW, BODY = H.MAIL_BODY;
const row = (id) => H.mailRow(id);
const SH = (name) => H.sheet(name);

// ---- the site's database (as lib.mjs reads it) ----
const sql = (q) => {
  for (let i = 0; ; i++) {
    try {
      const o = execSync(`${S}/wr/node_modules/.bin/wrangler d1 execute bio-db --local --persist-to ${S}/wrstate --command "${q.replace(/(["$`\\])/g, '\\$1')}"`, { cwd: ROOT, stdio: 'pipe' }).toString();
      const m = o.match(/"results": (\[[\s\S]*?\])\s*,\s*"success"/); return m ? JSON.parse(m[1]) : [];
    } catch (e) { if (i > 5 || !/SQLITE_BUSY/.test(String(e.stdout) + String(e.stderr))) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400); }
  }
};
const mailAsk = (path, { cookie, method, body } = {}) => hostCall(MAILHOST, path, body, { cookie, method, headers: method && method !== 'GET' ? { 'X-Inflite': '1' } : {} });
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
// (axe without descending into frames: the message frames are Mail's own document at Mail's address, never this page's;
// roofmailbody proves what's in them)
const axe = (p, label) => p.evaluate(AXE).then(() => p.evaluate(async () => (await window.axe.run(document, { iframes: false, runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] }, rules: { 'meta-viewport': { enabled: false } }, resultTypes: ['violations'] })).violations
  .filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} ×${v.nodes.length}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ').slice(0, 160)}`))).catch((e) => [`axe failed (${label}): ${e.message}`]);

const everyone = [], asked = [];
const watch = (ph) => { ph.ctx.on('request', (r) => { let main = false; try { main = !r.frame()?.parentFrame(); } catch (_) {} asked.push({ who: ph.name, url: r.url(), method: r.method(), post: r.postData() || '', main, nav: r.isNavigationRequest() }); }); everyone.push(ph); return ph; };
const at = (p, path, ms = 15000) => p.waitForFunction((u) => location.pathname + location.search + location.hash === u, path, { timeout: ms }).then(() => true, () => false);
const mailUp = async (p, ms = 30000) => (await shown(p, M_MAIL, ms)) && (await shown(p, ROW, ms));
const readerUp = async (p, ms = 30000) => (await shown(p, M_MAIL, ms)) && (await shown(p, BODY, ms));
const todayUp = async (p, ms = 30000) => (await shown(p, H.TODAY, ms)) && (await shown(p, H.HD_TITLE, ms));
const tapTile = (p, app = 'mail') => p.evaluate((s) => { const a = document.querySelector(s); if (!a) return false; a.click(); return true; }, EXCEPT.tileLink(app));
const sheetUp = (p, name, ms = 10000) => shown(p, `${SH(name)}[open]`, ms);
const closeSheets = async (p) => { for (let i = 0; i < 3 && (await count(p, H.SHEET_OPEN)); i++) { await p.click(H.SHEET_CLOSE).catch(() => p.keyboard.press('Escape')); await wait(450); } };
const jar = () => { const c = cookie.split(';')[0], i = c.indexOf('='); return i > 0 ? { [c.slice(0, i)]: c.slice(i + 1) } : {}; };
const cookieOf = async (ctx) => (await ctx.cookies(ACCT)).filter((c) => /^(__Secure-)?account$/.test(c.name)).map((c) => `${c.name}=${c.value}`).join('; ');

// ======================================================================================================================
// George: made on the account's page (a password he can confirm with), the site's admin with a passkey; mail for him
// ======================================================================================================================
const G = watch(await phone('george'));
const { p, ctx } = G;
await makeAccount(p, `${ACCT}/`, { name: 'George Farrow-Green', handle: 'georgeroofmail2', email: 'george2@example.com' });
const GID = sql("SELECT id FROM pg_users WHERE handle = 'georgeroofmail2'")[0]?.id;
sql(`INSERT OR REPLACE INTO pg_meta (k, v) VALUES ('admin_user', '${GID}')`);
sql(`INSERT OR IGNORE INTO pg_passkeys (id, user_id, public_key, alg, created_at) VALUES ('roofmail2-key', '${GID}', 'x', -7, ${Date.now()})`);
sql(`UPDATE pg_sessions SET auth_at = ${Date.now()} WHERE user_id = '${GID}'`);
const cookie = await cookieOf(ctx);
ok(!!GID && !!cookie, 'George’s account, made on the account’s page, the site’s admin with a passkey, signed in', js({ GID: !!GID, cookie: !!cookie }));
const SUBJECTS = ['Larkspur meeting notes', 'Crane hire on Friday', 'Moss on the north side', 'Invoice for lead flashing'];
const got = [];
for (const [i, s] of SUBJECTS.entries()) got.push(await deliver({ from: `Pat Smith <pat${i}@example.com>`, subject: s, text: `About ${s.toLowerCase()}.` }));
got.push(await deliver({ from: 'Roof Co <news@roofco.example>', subject: 'Weekly roofing digest', text: 'Read online.' }));
ok(got.every((s) => s >= 200 && s < 300), `${got.length} messages came to Mail`, js(got));
const T = Object.fromEntries(((await mailAsk('/api/threads?view=all&limit=100', { cookie })).json?.threads || []).map((t) => [t.subject, t.id]));
const counts = async () => (await mailAsk('/api/counts', { cookie })).json || null;

// ======================================================================================================================
await part(7, 'Mail Settings: a change saved at Mail; New Address at Mail’s own address; Notifications → You’s sheet', 'S4-D11, §2.2', async () => {
// ======================================================================================================================
  await p.goto(`${HUB}/mail/`);
  await mailUp(p);
  await p.click(H.HD_PICK);
  await sheetUp(p, 'mail-views');
  await p.locator(`${SH('mail-views')}[open]`).getByRole('button', { name: /Mail Settings/ }).last().click();
  const up = await sheetUp(p, 'mail-settings');
  const words = up ? (await textOf(p, `${SH('mail-settings')}[open]`)) || '' : '';
  ok(up && ['Signature', 'Unknown Addresses', 'Remote Images', 'Notifications'].every((w) => words.includes(w)), '7. ▾ → Mail Settings: the sheet (mail-settings) with Signature, Unknown Addresses, Remote Images, Notifications (§2.2)', words.slice(0, 300));
  ok(!/Delete Address|Send From\b(?! open)/.test(words.replace(/New Address, Delete or Send From.*/, '')), '7. …no Delete Address or Send From of its own (S4-D11)', words.slice(0, 300));
  await shot(p, '7-settings');
  // (a signature: there's one per account; it may be on a page of the sheet of its own)
  const sig = p.locator(`${SH('mail-settings')}[open]`).getByRole('textbox', { name: /Signature/ }).first();
  if (!(await sig.count())) await p.locator(`${SH('mail-settings')}[open]`).getByRole('button', { name: /Signature/ }).first().click().catch(() => {});
  await sig.fill('George · sent from under the roof').catch(() => {});
  await sig.press('Tab').catch(() => {});
  await p.locator(`${SH('mail-settings')}[open]`).getByRole('button', { name: /^(Save|Done)$/ }).first().click({ timeout: 2000 }).catch(() => {});
  const saved = await until(async () => ((await mailAsk('/api/settings', { cookie })).json?.signature === 'George · sent from under the roof'), 10000);
  ok(!!saved, '7. the signature changed: saved at Mail (PATCH from the hub, S4-D11)', js((await mailAsk('/api/settings', { cookie })).json?.signature));
  // New Address, Delete or Send From: Mail Settings at Mail's own address, in a tab of its own
  const popped = ctx.waitForEvent('page', { timeout: 10000 }).catch(() => null);
  await p.locator(`${SH('mail-settings')}[open]`).getByRole('link', { name: /Open Mail Settings at Mail.s own address/ }).first().click().catch(() =>
    p.locator(`${SH('mail-settings')}[open]`).getByRole('button', { name: /Open Mail Settings at Mail.s own address/ }).first().click().catch(() => {}));
  const own = await popped;
  await own?.waitForLoadState('domcontentloaded').catch(() => {});
  ok(!!own && own.url() === `${MAIL}/#settings` && new URL(p.url()).origin === HUB, '7. New Address, Delete or Send From: Mail Settings at Mail’s own address (MAIL/#settings) in a new tab, the hub’s page where it was (S4-D11)', own?.url());
  await own?.close().catch(() => {});
  // Notifications → You's Mail Notifications (/#you=notify-mail)
  await p.locator(`${SH('mail-settings')}[open]`).getByRole('link', { name: /Notifications/ }).first().click().catch(() => {});
  ok((await at(p, '/#you=notify-mail', 10000) || (await shown(p, H.YOU, 10000))) && (await shown(p, `${H.SH_MAILNOTIFY}[open]`, 15000)), '7. Notifications: You’s Mail Notifications sheet (dialog#sh-mailnotify, /#you=notify-mail, S4-D11)', here(p));
  const mn = (await textOf(p, `${H.SH_MAILNOTIFY}[open]`)) || '';
  ok(/Through InFlite/.test(mn), '7. …with Through InFlite (S4-D11)', mn.slice(0, 200));
  await shot(p, '7-mailnotify');
  await closeSheets(p);
});

// ======================================================================================================================
await part(8, 'Today’s Mail card, the Apps tile’s line, mini and chips; Pat sees no Mail in Edit Today or Apps', '§2.5, S4-D10, S4-D21', async () => {
// ======================================================================================================================
  const c = await counts(), n = c?.people?.unread ?? 0;
  const wantLine = n > 0 ? `${n} from people` : 'All caught up';
  await p.goto(`${HUB}/`);
  await todayUp(p);
  const card = H.todayCard('mail');
  const drawn = await shown(p, card, 30000);
  const ct = drawn ? (await textOf(p, card)) || '' : '';
  ok(drawn && /^Mail\b/.test(ct) && ct.includes(wantLine) && !SUBJECTS.some((s) => ct.includes(s)) && !/Pat/.test(ct), `8. Today: Mail’s card, “${wantLine}”, numbers only (no subject, no sender, S4-D10)`, ct.slice(0, 200));
  if (c?.updates?.unread) ok(ct.includes(`Updates: ${c.updates.unread} unread`), `8. …its second line: “Updates: ${c.updates.unread} unread” (§2.5)`, ct);
  const kept = await p.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith('today:')).map(([, v]) => v).join(' '));
  ok(!SUBJECTS.some((s) => kept.includes(s)) && !kept.includes('pat0@example.com'), '8. today:* storage: numbers only, no word of mail (§9)');
  await shot(p, '8-today-card');
  const life = await alive(p);
  await p.click(`${card} a`).catch(() => {});
  ok((await mailUp(p)) && (await at(p, '/mail/')) && (await life.same()), '8. the card tapped: Mail at /mail/, in the page (§2.5)', here(p));
  await p.click(H.tab('apps'));
  await shown(p, H.appTile('mail'), 20000);
  const tile = (await textOf(p, H.appTile('mail'))) || '';
  ok(tile.includes(wantLine), `8. Apps: Mail’s tile says “${wantLine}” (apps.mail, §2.5)`, tile);
  ok(tile.includes(String(n)) && /From people/.test(tile), `8. …its mini: ${n}, From people (connector.mini, §2.5)`, tile);
  const chips = await p.$$eval(`${H.appTile('mail')} a[href]`, (as) => as.map((a) => a.getAttribute('href'))).catch(() => []);
  ok(['/mail/#updates', '/mail/#later', '/mail/#done'].every((h) => chips.includes(h)) && chips.some((h) => h === '/mail/' || h === '/mail/#people'), '8. …and its chips: People, Updates, Later, Done (§2.5)', js(chips));
  await shot(p, '8-apps-tile');

  // Pat, who isn't the admin: no Mail tile, no Mail card, no Mail in Edit Today, no request to Mail (S4-D21)
  const pa = await account('Pat Reed', 'patroofmail');
  const P = watch(await phone('pat', { cookies: pa.cookies || {} }));
  await P.p.goto(`${HUB}/`);
  await todayUp(P.p); await wait(1500);
  ok(!(await count(P.p, H.todayCard('mail'))), '8. Pat: no Mail card on Today (S4-D21)');
  await P.p.click(H.HD_EDIT);
  const edit = await shown(P.p, H.SHEET_OPEN, 10000);
  const list = edit ? (await textOf(P.p, H.SHEET_OPEN)) || '' : '';
  ok(edit && !/\bMail\b/.test(list), '8. Pat’s Edit Today: no Mail in its list (admin only, S4-D21)', list.slice(0, 200));
  await closeSheets(P.p);
  await P.p.click(H.tab('apps')); await shown(P.p, H.APPS);
  await shown(P.p, H.appTile('weather'), 20000);
  ok(!(await count(P.p, H.appTile('mail'))), '8. Pat’s Apps: no Mail tile (S4-D21)');
  const patMail = asked.filter((r) => r.who === 'pat' && r.url.startsWith(MAIL));
  ok(!patMail.length, '8. …and nothing on Pat’s phone asked Mail anything (S4-D21)', js(patMail.slice(0, 3).map((r) => r.url)));
  await P.ctx.close();
});

// ======================================================================================================================
await part(9, 'storage: using Mail adds only mail:* and the framework’s own; no word of mail in any of it', 'S4-D16, §9', async () => {
// ======================================================================================================================
  await p.goto(`${HUB}/`);
  await todayUp(p); await wait(1500);
  const s0 = await storage(p);
  await p.click(H.tab('apps')); await shown(p, H.appTile('mail'), 20000);
  await tapTile(p); await mailUp(p);
  for (const id of ['updates', 'later', 'done', 'people']) { await p.click(H.hdSec(id)); await wait(700); }
  await p.click(row(T[SUBJECTS[0]])); await readerUp(p); await wait(1500);
  await p.click(H.HD_BACK); await mailUp(p); await wait(1500);
  const s1 = await storage(p), d = changed(s0, s1);
  const OK = /^local:(mail:(replies|unsent|outbox|remote-images|lens)$|ifl-build:mail$|today:cards:)|^session:(mail:signin-verifier|ifl-[\w:-]+)$/;
  const odd = [...d.added, ...d.changed].filter((k) => !OK.test(k));
  ok(!odd.length, '9. opening and using Mail added or changed only mail:* (S4-D16’s keys) and the framework’s ifl-* (§9)', js({ odd, added: d.added }));
  const all = JSON.stringify(s1);
  const words = [...SUBJECTS, 'pat0@example.com', 'Pat Smith'].filter((w) => all.includes(w));
  ok(!words.length, '9. no subject, sender or address of a message in any key or value (“never mail you got”, S4-D16)', js(words));
  ok(!d.added.some((k) => /indexedDB|idb/i.test(k)) && !(await p.evaluate(async () => (await indexedDB.databases?.() || []).some((x) => /mail/i.test(x.name)))), '9. no IndexedDB of Mail’s at inflite.ai (S4-D16)');
});

// ======================================================================================================================
await part(10, 'the module’s files through InFlite’s Worker, from Mail’s, without a cookie; “Mail updated” once; the budget', '§6.2, §4.5, D15, S4-D19', async () => {
// ======================================================================================================================
  const FILES = connectorFiles('mail'), BUILD = moduleBuild('mail');
  ok(FILES.length === 15 && !!BUILD, `10. Mail’s connector names its 15 static files; its build ${BUILD} (§4.4, S4-D19)`, js({ n: FILES.length, BUILD }));
  // a phone that last had an older Mail: "Mail updated", once
  const B = watch(await phone('george-b', { cookies: jar() }));
  await B.ctx.addInitScript(() => { if (location.host === 'ifl.test:8788' && !sessionStorage.getItem('t-seeded')) { sessionStorage.setItem('t-seeded', '1'); localStorage.setItem('ifl-build:mail', '0.01'); } });
  const m = meter(B.p, 'mail');
  const t0 = Date.now();
  await B.p.goto(`${HUB}/#apps`);
  await shown(B.p, H.appTile('mail'), 30000);
  await tapTile(B.p);
  const up = await mailUp(B.p);
  await wait(2500);
  const rep = up ? await m.report() : null;
  m.stop();
  const notes = (await said(B.p)).filter((x) => /Mail updated/.test(x));
  ok(notes.length === 1 && (await B.p.evaluate(() => localStorage.getItem('ifl-build:mail'))) === BUILD, `10. first mount after an older Mail: “Mail updated” once, ifl-build:mail now ${BUILD} (IFL.built, D15)`, js(await said(B.p)));
  await B.p.click(H.HD_BACK); await shown(B.p, H.APPS);
  await tapTile(B.p); await mailUp(B.p); await wait(1500);
  ok((await said(B.p)).filter((x) => /Mail updated/.test(x)).length === 1, '10. opened again in the page: not said again');
  // through the root Worker: each of the files fetched from Mail's Worker as /roof/<file>, no cookie, no bearer
  const hops = passed(S, t0).filter((x) => x.port === MAIL_PASS);
  const want = FILES.map((f) => f.replace(/^\/mail/, '')), gotP = new Set(hops.map((x) => x.path.split('?')[0]));
  const missing = want.filter((f) => !gotP.has(f)), withCookie = hops.filter((x) => x.cookie || x.auth).map((x) => x.path);
  ok(!missing.length && !withCookie.length, `10. all ${want.length} files fetched by InFlite’s Worker from Mail’s as /roof/<file>, none with a cookie or a bearer (§6.2)`, js({ missing, withCookie, n: hops.length }));
  const onlyCode = hops.filter((x) => !/^\/roof\/([\w.-]+\.(js|css)|version)(\?|$)/.test(x.path));
  ok(!onlyCode.length, '10. …and nothing else of Mail’s through InFlite’s Worker: code and /roof/version only, never an API call (§9, S4-D2)', js(onlyCode.map((x) => x.path).slice(0, 5)));
  const ver = await hostCall('ifl.test:8788', '/mail/version');
  ok(ver.status === 200 && ver.json?.build === BUILD && /no-store/.test(ver.headers['cache-control'] || ''), `10. /mail/version: { build: ${BUILD} }, no-store (§6.2)`, js({ s: ver.status, j: ver.json, cc: ver.headers['cache-control'] }));
  const f1 = await hostCall('ifl.test:8788', '/mail/roof/mail.js', undefined, { cookie });
  ok(f1.status === 200 && /javascript/.test(f1.headers['content-type'] || '') && /no-cache/.test(f1.headers['cache-control'] || '') && f1.headers['x-content-type-options'] === 'nosniff', '10. /mail/roof/mail.js: JavaScript, no-cache, nosniff (§6.2)', js({ s: f1.status, h: [f1.headers['content-type'], f1.headers['cache-control']] }));
  // the budget (§4.5): first open, static JS ≤ 55 KB, CSS ≤ 12 KB, ≤ files + 2 requests under /mail/roof/
  if (rep) {
    const mine = rep.rows.filter((r) => r.path.startsWith('/mail/roof/'));
    const jsKB = mine.filter((r) => r.kind === 'js' && !/\/(compose|signin|mailsettings|viewer)\.js$/.test(r.path)).reduce((a, r) => a + r.gz, 0) / 1024;
    const cssKB = mine.filter((r) => r.kind === 'css').reduce((a, r) => a + r.gz, 0) / 1024;
    console.log('first open:', js({ requests: mine.length, js: Math.round(jsKB * 10) / 10, css: Math.round(cssKB * 10) / 10, twice: rep.twice }, 600));
    ok(mine.length > 0 && mine.length <= FILES.length + 2, `10. first open: ${mine.length} same-origin /mail/roof/ requests (≤ ${FILES.length + 2}, §4.5)`, js(mine.map((r) => r.path.replace('/mail/roof/', ''))));
    ok(jsKB <= 55, `10. first open: static JS ${jsKB.toFixed(1)} KB gzip (≤ 55, §4.5)`, js(mine.filter((r) => r.kind === 'js').map((r) => `${r.path.replace('/mail/roof/', '')} ${r.gz}`)));
    ok(cssKB <= 12, `10. first open: CSS ${cssKB.toFixed(1)} KB gzip (≤ 12, §4.5)`, js(mine.filter((r) => r.kind === 'css').map((r) => `${r.path.replace('/mail/roof/', '')} ${r.gz}`)));
  } else ok(false, '10. the first open wasn’t measured (Mail never drawn)');
  await B.ctx.close();
});

// ======================================================================================================================
await part(11, 'the gate: Confirm It’s You round trip over CORS; Pat’s admin-only state after one call', 'S4-D12, S4-D21, §3.5', async () => {
// ======================================================================================================================
  // (shown it's him 13 hours ago; Mail's Worker keeps a yes for 10 seconds)
  sql(`UPDATE pg_sessions SET auth_at = ${Date.now() - 13 * 3600e3} WHERE user_id = '${GID}'`);
  await wait(11000);
  await p.goto(`${HUB}/mail/`);
  const confirmBtn = p.locator(M_MAIL).getByRole('button', { name: /Confirm It.s You/ }).first();
  const gate = await confirmBtn.waitFor({ state: 'visible', timeout: 30000 }).then(() => true, () => false);
  ok(gate && (await textOf(p, H.HD_TITLE)) === 'Mail', '11. a check older than 12 hours: Mail’s plain state, “Confirm It’s You”, the title Mail (S4-D12, §2.1)', await textOf(p, M_MAIL));
  await shot(p, '11-reauth');
  const navs = []; p.on('framenavigated', (f) => { if (f === p.mainFrame()) navs.push(f.url()); });
  await confirmBtn.click();
  const atAuth = await p.waitForURL((u) => u.host === 'auth.ifl.test:8788', { timeout: 20000 }).then(() => true, () => false);
  const trip = navs.find((u) => u.startsWith(`${AUTH}/`)) || '';
  const tp = new URLSearchParams(trip.split('#')[1] || '');
  ok(atAuth && tp.get('signin') === 'mail' && /^[A-Za-z0-9_-]{43}$/.test(tp.get('ask') || '') && tp.get('back') === `${HUB}/mail/`, '11. the whole window to the sign-in page, for Mail, its word’s hash, back to the hub’s /mail/ (S4-D12)', trip.slice(0, 200));
  const verifierKept = await p.evaluate(() => sessionStorage.getItem('mail:signin-verifier')).catch(() => null);
  if (atAuth) await onAccountPage(p, { email: 'george2@example.com' }).catch((e) => console.log('note: sign-in page', e.message));
  await p.waitForURL((u) => u.host === 'ifl.test:8788', { timeout: 30000 }).catch(() => {});
  const back = navs.find((u) => u.startsWith(`${HUB}/mail/#signin=`)) || '';
  ok(/^http:\/\/ifl\.test:8788\/mail\/#signin=[A-Za-z0-9_-]{16,128}(&|$)/.test(back), '11. the code back at the hub’s /mail/#signin=<code> (S4-D12, §2.3)', back.slice(0, 80));
  const hb = asked.filter((r) => r.who === 'george' && r.url === `${MAIL}/api/auth/handback` && r.method === 'POST').at(-1);
  const inAgain = await mailUp(p);
  ok(!!hb && hb.main && inAgain, '11. the module swapped it at Mail’s /api/auth/handback over CORS, and Mail’s list is in (S4-D12)', js({ hb: !!hb, inAgain }));
  ok((await at(p, '/mail/', 10000)) && !(await p.evaluate(() => sessionStorage.getItem('mail:signin-verifier'))), '11. the address tidied to /mail/, the verifier used up (§2.3, S4-D16)', js({ url: here(p), verifierKept: !!verifierKept }));
  const fresh = Number(sql(`SELECT MAX(auth_at) AS t FROM pg_sessions WHERE user_id = '${GID}'`)[0]?.t || 0);
  ok(Date.now() - fresh < 5 * 60e3, '11. shown it’s him just now (the account took the hand-back from the hub, §6.3 fromMail)', String(fresh));

  // Pat: the admin-only state, after one call to Mail
  const pa = await account('Pat Reed', 'patroofmail2');
  const P = watch(await phone('pat2', { cookies: pa.cookies || {} }));
  await P.p.goto(`${HUB}/mail/`);
  const said11 = await P.p.waitForFunction((s) => /admin/i.test(document.querySelector(s)?.textContent || ''), M_MAIL, { timeout: 30000 }).then(() => true, () => false);
  await wait(2500);
  const calls = asked.filter((r) => r.who === 'pat2' && r.url.startsWith(`${MAIL}/api/`) && r.method !== 'OPTIONS');
  ok(said11 && calls.length === 1 && calls[0].url === `${MAIL}/api/session`, '11. Pat at /mail/: Mail’s admin-only state, after one call (/api/session, S4-D21)', js({ text: await textOf(P.p, M_MAIL), calls: calls.map((r) => r.url) }));
  await shot(P.p, '11-notadmin');
  await P.ctx.close();
});

// ======================================================================================================================
await part(12, 'CSP clean, axe, 390 light and dark, 1024', '§2.1, C13, §4.3', async () => {
// ======================================================================================================================
  for (const scheme of ['light', 'dark']) {
    const D = watch(await phone(`george-${scheme}`, { scheme, cookies: jar() }));
    await D.p.goto(`${HUB}/mail/`);
    await mailUp(D.p); await wait(1200);
    let v = await axe(D.p, `list ${scheme}`);
    ok(!v.length, `12. axe, 390 ${scheme}, the list: no serious or critical issue`, js(v));
    ok((await D.p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, `12. 390 ${scheme}, the list: no sideways scroll`);
    await shot(D.p, `12-390-${scheme}-list`);
    await D.p.click(row(T[SUBJECTS[1]])); await readerUp(D.p); await wait(1500);
    v = await axe(D.p, `reader ${scheme}`);
    ok(!v.length, `12. axe, 390 ${scheme}, the reader: no serious or critical issue`, js(v));
    ok((await D.p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, `12. 390 ${scheme}, the reader: no sideways scroll`);
    await shot(D.p, `12-390-${scheme}-reader`);
    await D.ctx.close();
  }
  const W = watch(await phone('george-1024', { width: 1024, height: 1366, cookies: jar() }));
  await W.p.goto(`${HUB}/mail/`);
  await mailUp(W.p);
  await W.p.click(row(T[SUBJECTS[2]])); await readerUp(W.p); await wait(1500);
  const v = await axe(W.p, '1024');
  ok(!v.length, '12. axe, 1024, list and pane: no serious or critical issue', js(v));
  ok((await W.p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, '12. 1024: no sideways scroll');
  await shot(W.p, '12-1024');
  await W.ctx.close();

  const errs = everyone.flatMap((x) => x.errs || []).filter((e) => !/^\S+ auth\.ifl\.test|^\S+ account\.ifl\.test/.test(e));
  ok(!errs.some((e) => /CSP violation|Refused to/.test(e)), '12. no CSP violation on any page of the hub (C13: no inline style or handler, only the origins allowed)', js(errs.filter((e) => /CSP|Refused/.test(e)).slice(0, 6)));
  ok(!errs.length, '12. no page error and no console error on any page of the hub', js(errs.slice(0, 8)));
});

await closeAll();
console.log(`FAILS ${fails()}`);
process.exit(0);
