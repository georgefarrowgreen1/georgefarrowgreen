// Admin → Status page (account/admin.js, functions/_status.js): status.inflite.ai's incidents, the one still going said at
// the top of Admin; on it, an update written here (its kind, in your words), on the status page as soon as it's posted,
// and in the Admin log; Resolved closes it. Light and dark at a phone's size.
import { kit } from './lib.mjs';
import http from 'node:http';
const [,, S, out] = process.argv;
const K = await kit(S, out);
const { ok, one, sess } = K;
const A = await K.phone('ann');
await K.signup(A, 'Ann Ito', 'ann', 'ann@example.com', 'London');
const as = await sess(A);
await A.ctx.close();
const AD = await K.admin(as.me.id);
// (the status page's answer, at its own address on the tests' site)
const status = () => new Promise((done, fail) => {
  const r = http.request({ host: '127.0.0.1', port: 8788, path: '/api/status', headers: { Host: 'status.ifl.test:8788' } }, (res) => {
    let t = ''; res.on('data', (c) => (t += c)); res.on('end', () => { try { done(JSON.parse(t)); } catch (e) { fail(new Error(t.slice(0, 200))); } });
  });
  r.on('error', fail); r.end();
});

// an incident the checks opened ten minutes ago (the tables made first, as Admin's first look makes them), and one from last week
ok((await AD.ask('status')).status === 200, 'Admin’s list of incidents: there, empty to begin with');
// (no double quotes in it: the kit hands it to the shell in them)
const now = Date.now(), upd = (k, w, at) => `json_object('at', ${at}, 'k', '${k}', 'w', '${w}')`;
one(`INSERT INTO status_incidents (id, title, svcs, started, ended, updates) VALUES ('inc-now', 'Chat not answering', json_array('chat'), ${now - 10 * 60e3}, NULL, json_array(${upd('Spotted', 'Chat isn’t answering: two checks in a row failed (HTTP 502).', now - 5 * 60e3)})),
  ('inc-old', 'Weather not answering', json_array('weather'), ${now - 6 * 864e5}, ${now - 6 * 864e5 + 20 * 60e3}, json_array(${upd('Resolved', 'Weather is working again.', now - 6 * 864e5 + 20 * 60e3)}))`);
const sum = (await AD.ask('summary')).json;
ok(sum.statusOpen?.length === 1 && sum.statusOpen[0].title === 'Chat not answering', 'Admin’s figures: the incident still going', JSON.stringify(sum.statusOpen));

const actx = await K.b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'light' });
await actx.addCookies([AD.cookie]);
const ad = await actx.newPage();
ad.on('pageerror', (e) => K.errs.push(`admin: ${e.message}`));
await ad.goto(AD.page + '/'); await ad.waitForSelector('main .row:has(b:text-is("Admin"))', { timeout: 20000 }); await ad.waitForTimeout(900);
await ad.click('main .row:has(b:text-is("Admin"))');
await ad.waitForSelector('#sheet .adm-alert:has-text("Chat not answering")', { timeout: 15000 });
ok(true, 'at the top of Admin: the incident still going, to add an update to');
await ad.click('#sheet .row:has(b:text-is("Status page"))');
await ad.waitForSelector('#sheet .row:has(b:text-is("Weather not answering"))', { timeout: 15000 });
const list = (await ad.locator('#sheet').innerText()).replace(/\s+/g, ' ');
ok(list.indexOf('Chat not answering') < list.indexOf('Weather not answering') && /Ongoing/.test(list) && /Resolved/.test(list), 'the status page’s incidents: the one going first, then last week’s', list.slice(0, 300));
await ad.screenshot({ path: `${out}/status-list.png` });
await ad.click('#sheet .row:has(b:text-is("Chat not answering"))');
await ad.waitForSelector('#sheet textarea', { timeout: 15000 }); await ad.waitForTimeout(500);
ok(await ad.locator('#sheet .adm-kind[aria-checked="true"]').innerText() === 'Investigating', 'Investigating chosen to begin with');
await ad.click('#sheet .adm-kind:text-is("Identified")');
await ad.fill('#sheet textarea', 'A bad update to the chat server. Rolling it back now; messages sent meanwhile are kept.');
await ad.screenshot({ path: `${out}/status-write.png` });
await ad.click('#sheet button.btn:has-text("Post update")');
await ad.waitForSelector('#sheet .row.plain:has(b:text-is("Identified · by you"))', { timeout: 15000 });
ok(true, 'posted: at the top of what’s so far, by you');
let page = await status(), inc = page.incidents.find((x) => x.id === 'inc-now');
ok(inc?.updates[0]?.k === 'Identified' && /Rolling it back now/.test(inc.updates[0].w) && !inc.ended, 'on the status page as soon as it’s posted', JSON.stringify(inc?.updates?.[0]));
ok(one(`SELECT COUNT(*) AS n FROM pg_admin_log WHERE action = 'status-update' AND target = 'inc-now'`)[0].n === 1, 'and in the Admin log');
// Resolved: closes it
await ad.click('#sheet .adm-kind:text-is("Resolved")');
await ad.fill('#sheet textarea', 'Rolled back. Chat is working again.');
await ad.click('#sheet button.btn:has-text("Post and close it")');
await ad.waitForSelector('#sheet .row.plain:has(b:text-is("Resolved · by you"))', { timeout: 15000 });
page = await status(); inc = page.incidents.find((x) => x.id === 'inc-now');
ok(inc?.ended > now && inc.updates[0].k === 'Resolved', 'Resolved closes it, on the status page too', JSON.stringify(inc));
ok(!(await ad.locator('#sheet .adm-kind:text-is("Resolved")').count()), 'and once closed, it can’t be closed again (an update still can)');
ok(await ad.locator('#sheet .adm-kind[aria-checked="true"]').innerText() === 'Update', 'Update chosen to begin with, once it’s closed');
await ad.screenshot({ path: `${out}/status-closed.png` });
// nothing empty, nothing from anyone else
await ad.click('#sheet button.btn:has-text("Post update")');
await ad.waitForSelector('#sheet .said:has-text("Write what")', { timeout: 10000 });
ok(true, 'an empty update: said, not posted');
await ad.emulateMedia({ colorScheme: 'dark' }); await ad.waitForTimeout(400);
await ad.screenshot({ path: `${out}/status-dark.png` });
const r = await fetch('http://127.0.0.1:8788/api/account/admin/status-note', { method: 'POST', headers: { Authorization: 'Bearer ' + as.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'inc-old', kind: 'Update', text: 'x' }) }).catch(() => ({ status: 0 }));
ok(r.status === 403 || r.status === 404 || r.status === 401, 'not from outside the admin’s own page', String(r.status));
// an incident started by hand, for what the checks can't see: on the status page, and a banner in the apps it names
await ad.emulateMedia({ colorScheme: 'light' });
await ad.goto(AD.page + '/'); await ad.waitForSelector('main .row:has(b:text-is("Admin"))', { timeout: 20000 }); await ad.waitForTimeout(700);
await ad.click('main .row:has(b:text-is("Admin"))'); await ad.click('#sheet .row:has(b:text-is("Status page"))');
await ad.click('#sheet .row:has(b:text-is("Start an incident"))');
await ad.waitForSelector('#sheet .adm-kind:text-is("Account")', { timeout: 15000 });
await ad.click('#sheet .adm-kind:text-is("Account")');
await ad.fill('#sheet input[aria-label="Title"]', 'Signing in is slow');
await ad.fill('#sheet textarea', 'Some sign-ins are taking a minute. Looking into it.');
await ad.screenshot({ path: `${out}/status-start.png` });
await ad.click('#sheet button.btn:has-text("Post to the status page")');
await ad.waitForSelector('#sheet .row.plain:has(b:text-is("Investigating · by you"))', { timeout: 15000 });
page = await status(); inc = page.incidents.find((x) => x.title === 'Signing in is slow');
ok(inc && !inc.ended && inc.kind === 'manual' && inc.svcs.join() === 'account', 'started by hand: on the status page, naming Account', JSON.stringify(inc));
ok(one(`SELECT COUNT(*) AS n FROM pg_admin_log WHERE action = 'status-incident'`)[0].n === 1, 'and in the Admin log');
// (the account page's own banner, as every app's shared menu asks for it)
await ad.goto(AD.page + '/'); await ad.waitForSelector('.ifl-sb', { timeout: 20000 });
const sb = (await ad.locator('.ifl-sb').innerText()).replace(/\s+/g, ' ');
ok(/Signing in is slow/.test(sb) && /Status/.test(sb), 'a banner in the app it names, linking to the status page', sb);
await ad.screenshot({ path: `${out}/status-banner.png` });
await ad.click('.ifl-sb .ifl-sb-x');
ok(!(await ad.locator('.ifl-sb').count()), 'closed: gone for the visit');
// maintenance planned ahead, then called off; how you're told
await ad.click('main .row:has(b:text-is("Admin"))'); await ad.click('#sheet .row:has(b:text-is("Status page"))');
await ad.click('#sheet .row:has(b:text-is("Plan maintenance"))');
await ad.waitForSelector('#sheet input[type="datetime-local"]', { timeout: 15000 });
await ad.click('#sheet .adm-kind:text-is("Mail")');
await ad.fill('#sheet input[aria-label="Title"]', 'Mail server upgrade');
await ad.click('#sheet button.btn:has-text("Plan it")');
await ad.waitForTimeout(1200);
page = await status();
ok(page.maint?.[0]?.title === 'Mail server upgrade' && page.maint[0].svcs.join() === 'mail', 'maintenance planned: on the status page ahead', JSON.stringify(page.maint));
await ad.screenshot({ path: `${out}/status-maint.png` });
const st = (await AD.ask('status')).json;
ok(st.maint.length === 1 && st.prefs.push === true && st.catalogue.length > 10, 'Admin’s view: the maintenance, how you’re told, what can be named');
await ad.click('#sheet button.mini:has-text("Back"), #sheet .sheet-back, #sheet [aria-label="Back"]').catch(() => {});
await ad.goto(AD.page + '/'); await ad.waitForSelector('main .row:has(b:text-is("Admin"))', { timeout: 20000 }); await ad.waitForTimeout(700);
await ad.click('main .row:has(b:text-is("Admin"))'); await ad.click('#sheet .row:has(b:text-is("Status page"))');
await ad.waitForSelector('#sheet .row:has(b:text-is("Mail server upgrade")) button.mini', { timeout: 15000 });
await ad.click('#sheet .row:has(b:text-is("Mail server upgrade")) button.mini');
await ad.waitForTimeout(1200);
ok(!(await status()).maint?.length, 'called off: gone from the status page');
await ad.locator('#sheet label.row:has(b:text-is("And by email")) input.switch').click();
await ad.waitForTimeout(1200);
ok((await AD.ask('status')).json.prefs.email === false, 'how you’re told: email off, kept');
await ad.screenshot({ path: `${out}/status-admin.png`, fullPage: false });
console.log('errs', K.errs);
ok(!K.errs.length, 'no errors on the page', K.errs.join(' | '));
console.log(`FAILS ${K.fails()}`);
process.exit(0);
