// Admin → Incident Desk (account/admin.js, functions/_desk.js, functions/_status.js): what's gone wrong in one place. The
// incident still going said at the top of Admin, and the Desk's row saying how many things need you; on the Desk, Needs
// you (the incident, a slow server error) and Watching (last week's, not yet finished). A code's own page: what people
// saw, why (each part's time), Mark fixed with Undo. An incident: a suggested update posted to the status page, Undo,
// resolved; then finished (not an outage, out of uptime; a write-up) and into Done; a note for yourself that the public
// never sees. One started by hand, a banner in the app it names; maintenance planned and called off; how you're told;
// and an incident's notification link opening that incident. Light and dark at a phone's size.
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
const desk = async () => (await AD.ask('desk')).json;

// an incident the checks opened ten minutes ago, one from last week, and a slow server error with each part's time
ok((await AD.ask('desk')).status === 200, 'the Desk: there, its tables made by the first look');
// (no double quotes in it: the kit hands it to the shell in them)
const now = Date.now(), upd = (k, w, at) => `json_object('at', ${at}, 'k', '${k}', 'w', '${w}')`;
one(`INSERT INTO status_incidents (id, title, svcs, started, ended, updates) VALUES ('inc-now', 'Chat not answering', json_array('chat'), ${now - 10 * 60e3}, NULL, json_array(${upd('Spotted', 'Chat isn’t answering: two checks in a row failed (HTTP 502).', now - 5 * 60e3)})),
  ('inc-old', 'Weather not answering', json_array('weather'), ${now - 6 * 864e5}, ${now - 6 * 864e5 + 20 * 60e3}, json_array(${upd('Resolved', 'Weather is working again.', now - 6 * 864e5 + 20 * 60e3)}))`);
one(`INSERT INTO pg_bugs (id, code, app, kind, at, words, at_where, detail) VALUES ('b1', 'IF-S-MB90H', 'server', 'today day', ${now - 30 * 60e3}, 'Too slow.', 'today day',
  json_object('sev', 'slow', 'limit', 3000, 'steps', json_array(json_object('name', 'Your day’s data', 'ms', 900, 'done', 1), json_object('name', 'Ride forecast', 'ms', 2100, 'done', 0))))`);
const sum = (await AD.ask('summary')).json;
ok(sum.statusOpen?.length === 1 && sum.deskNeeds === 2, 'Admin’s figures: the incident going, and two things on the Desk that need you', JSON.stringify({ open: sum.statusOpen, needs: sum.deskNeeds }));

const actx = await K.b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'light' });
await actx.addCookies([AD.cookie]);
const ad = await actx.newPage();
ad.on('pageerror', (e) => K.errs.push(`admin: ${e.message}`));
const home = async () => { await ad.goto(AD.page + '/'); await ad.waitForSelector('main .row:has(b:text-is("Admin"))', { timeout: 20000 }); await ad.waitForTimeout(700); };
const toDesk = async () => { await home(); await ad.click('main .row:has(b:text-is("Admin"))'); await ad.click('#sheet .row:has(b:text-is("Incident Desk"))'); await ad.waitForSelector('#sheet .adm-sv', { timeout: 15000 }); await ad.waitForTimeout(300); };
await home();
await ad.click('main .row:has(b:text-is("Admin"))');
await ad.waitForSelector('#sheet .adm-alert:has-text("Chat not answering")', { timeout: 15000 });
ok(true, 'at the top of Admin: the incident still going');
ok(/2 need you/.test(await ad.locator('#sheet .row:has(b:text-is("Incident Desk"))').innerText()), 'and the Desk’s row: two need you');
await ad.click('#sheet .row:has(b:text-is("Incident Desk"))');
await ad.waitForSelector('#sheet .dk-row:has-text("Chat not answering")', { timeout: 15000 });
const txt = (await ad.locator('#sheet').innerText()).replace(/\s+/g, ' ');
const low = txt.toLowerCase();
ok(/2 things need you/.test(txt), 'the summary first: two things need you', txt.slice(0, 120));
ok(/needs you · 2 chat not answering investigating.*watching · 1 weather not answering/.test(low), 'Needs you: the incident going; Watching: last week’s, not finished', txt.slice(0, 400));
ok(/Today: building your day/.test(txt) && /Slow, handled/.test(txt), 'and the slow server error, in words, slow (not failed)');
ok(await ad.locator('#sheet .dk-app:has-text("Chat") .dk-mark[data-t="bad"]').count() === 1 && await ad.locator('#sheet .dk-app:has-text("Today") .dk-mark[data-t="warn"]').count() === 1, 'each app’s state in the strip: Chat red, Today amber');
await ad.screenshot({ path: `${out}/desk.png` });
// (one app's items only)
await ad.click('#sheet .dk-app:has-text("Today")');
ok(!(await ad.locator('#sheet .dk-row:has-text("Chat not answering")').count()) && await ad.locator('#sheet .dk-row:has-text("building your day")').count() === 1, 'Today’s strip chip: only Today’s');
await ad.click('#sheet .dk-app:has-text("Today")');

// a code's own page: what people saw, why; Mark fixed, and Undo
await ad.click('#sheet .dk-row:has-text("building your day")');
await ad.waitForSelector('#sheet .dk-steps', { timeout: 15000 });
const code = (await ad.locator('#sheet').innerText()).replace(/\s+/g, ' ');
ok(/People got their cards/.test(code) && /Ride forecast took longest/.test(code) && /of a 3 s limit/i.test(code), 'what people saw first, then why: the ride forecast took longest', code.slice(0, 300));
await ad.screenshot({ path: `${out}/desk-code.png` });
await ad.click('#sheet .dk-dock button:has-text("Mark fixed")');
await ad.waitForSelector('.toast.on .toast-act', { timeout: 10000 });
ok((await desk()).items.find((x) => x.id === 'IF-S-MB90H')?.bucket === 'watching', 'marked fixed: watching');
await ad.click('.toast.on .toast-act');
await ad.waitForTimeout(1200);
ok((await desk()).items.find((x) => x.id === 'IF-S-MB90H')?.bucket === 'needs', 'Undo: back in Needs you');
await ad.click('#sheet .sheet-head .back');

// an incident: a suggested update, posted; Undo; then resolved
await ad.waitForSelector('#sheet .dk-row:has-text("Chat not answering")', { timeout: 15000 });
await ad.click('#sheet .dk-row:has-text("Chat not answering")');
await ad.waitForSelector('#sheet .dk-composer', { timeout: 15000 });
ok(await ad.locator('#sheet .dk-stepper [data-s="now"]').innerText() === 'Investigating', 'its progress: Investigating');
await ad.click('#sheet .dk-suggest .adm-kind:text-is("Found the cause")');
ok(/found the cause/.test(await ad.locator('#sheet .dk-text').inputValue()), 'a suggestion fills the box');
await ad.fill('#sheet .dk-text', 'A bad update to the chat server. Rolling it back now.');
await ad.screenshot({ path: `${out}/desk-incident.png` });
await ad.click('#sheet .dk-post');
await ad.waitForSelector('.toast.on:has-text("as Identified")', { timeout: 15000 });
let page = await status(), inc = page.incidents.find((x) => x.id === 'inc-now');
ok(inc?.updates[0]?.k === 'Identified' && /Rolling it back/.test(inc.updates[0].w), 'on the status page as Identified', JSON.stringify(inc?.updates?.[0]));
ok(one(`SELECT COUNT(*) AS n FROM pg_admin_log WHERE action = 'status-update' AND target = 'inc-now'`)[0].n === 1, 'and in the Admin log');
await ad.click('.toast.on .toast-act');
await ad.waitForTimeout(1500);
inc = (await status()).incidents.find((x) => x.id === 'inc-now');
ok(!inc.updates.some((u) => /Rolling it back/.test(u.w)), 'Undo: taken back off the status page');
// (a private note: kept, never public)
await ad.click('#sheet .dk-seg button:text-is("Private")');
await ad.fill('#sheet .dk-text', 'Check the 18:40 deploy first');
await ad.click('#sheet .dk-post');
await ad.waitForSelector('#sheet .dk-ev:has-text("Check the 18:40 deploy first")', { timeout: 15000 });
ok(!JSON.stringify(await status()).includes('18:40 deploy'), 'a private note: on the timeline, never on the status page');
await ad.click('#sheet .dk-seg button:text-is("Public")');
await ad.click('#sheet .dk-suggest .adm-kind:text-is("Resolved")');
await ad.click('#sheet .dk-post');
await ad.waitForSelector('#sheet .dk-banner', { timeout: 15000 });
inc = (await status()).incidents.find((x) => x.id === 'inc-now');
ok(inc?.ended > now && inc.updates[0].k === 'Resolved', 'resolved, on the status page too');
// finished: not an outage, a write-up; then Done
await ad.click('#sheet .dk-check:has-text("Was it a real outage?")');
await ad.waitForSelector('#sheet button.btn:has-text("Mark as not an outage")', { timeout: 15000 });
await ad.screenshot({ path: `${out}/desk-outage.png` });
await ad.click('#sheet button.btn:has-text("Mark as not an outage")');
await ad.waitForSelector('#sheet .dk-check:has-text("taken out of uptime")', { timeout: 15000 });
inc = (await status()).incidents.find((x) => x.id === 'inc-now');
ok(inc?.notOutage === true && /kept working throughout/.test(inc.updates[0].w), 'not an outage: the status page says what happened', JSON.stringify(inc?.updates?.[0]));
await ad.click('#sheet .dk-check:has-text("Write it up")');
await ad.waitForSelector('#sheet .adm-kind:text-is("A deploy")', { timeout: 15000 });
await ad.click('#sheet .adm-kind:text-is("A deploy")');
await ad.click('#sheet .adm-kind:text-is("Nothing: it passed by itself")');
await ad.fill('#sheet textarea[aria-label="A sentence or two for anyone to read"]', 'A bad update; rolled back within ten minutes.');
await ad.click('#sheet button.btn:has-text("Save write-up")');
await ad.waitForTimeout(1500);
ok((await desk()).items.find((x) => x.id === 'inc-now')?.bucket === 'done', 'both answers in: Done');
inc = (await status()).incidents.find((x) => x.id === 'inc-now');
ok(inc.updates.some((u) => u.k === 'Summary' && /rolled back within ten minutes/.test(u.w)), 'the write-up’s summary on the status page');
await ad.emulateMedia({ colorScheme: 'dark' }); await ad.waitForTimeout(400);
await ad.screenshot({ path: `${out}/desk-dark.png` });
await ad.emulateMedia({ colorScheme: 'light' });
const r = await fetch('http://127.0.0.1:8788/api/account/admin/status-outage', { method: 'POST', headers: { Authorization: 'Bearer ' + as.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'inc-old', outage: false }) }).catch(() => ({ status: 0 }));
ok(r.status === 403 || r.status === 404 || r.status === 401, 'not from outside the admin’s own page', String(r.status));

// one started by hand: on the status page, and a banner in the app it names
await toDesk();
await ad.click('#sheet .row:has(b:text-is("Start an incident"))');
await ad.waitForSelector('#sheet .adm-kind:text-is("Account")', { timeout: 15000 });
await ad.click('#sheet .adm-kind:text-is("Account")');
await ad.fill('#sheet input[aria-label="Title"]', 'Signing in is slow');
await ad.fill('#sheet textarea', 'Some sign-ins are taking a minute. Looking into it.');
await ad.click('#sheet button.btn:has-text("Post to the status page")');
await ad.waitForSelector('#sheet .dk-ev:has-text("Some sign-ins are taking a minute")', { timeout: 15000 });
page = await status(); inc = page.incidents.find((x) => x.title === 'Signing in is slow');
ok(inc && !inc.ended && inc.kind === 'manual' && inc.svcs.join() === 'account', 'started by hand: on the status page, naming Account, opened on the Desk', JSON.stringify(inc));
await ad.goto(AD.page + '/'); await ad.waitForSelector('.ifl-sb', { timeout: 20000 });
const sb = (await ad.locator('.ifl-sb').innerText()).replace(/\s+/g, ' ');
ok(/Signing in is slow/.test(sb) && /Status/.test(sb), 'a banner in the app it names, linking to the status page', sb);
await ad.click('.ifl-sb .ifl-sb-x');

// its notification's link: straight to that incident
await ad.goto(AD.page + '/#admin=incident:' + inc.id);
await ad.waitForSelector('#sheet .dk-composer', { timeout: 20000 });
ok((await ad.locator('#sheet #sheet-title').innerText()) === 'Signing in is slow', 'an incident’s notification link opens that incident');

// maintenance planned, then called off; how you're told
await toDesk();
await ad.click('#sheet .row:has(b:text-is("Plan maintenance"))');
await ad.waitForSelector('#sheet input[type="datetime-local"]', { timeout: 15000 });
await ad.click('#sheet .adm-kind:text-is("Mail")');
await ad.fill('#sheet input[aria-label="Title"]', 'Mail server upgrade');
await ad.click('#sheet button.btn:has-text("Plan it")');
await ad.waitForTimeout(1200);
page = await status();
ok(page.maint?.[0]?.title === 'Mail server upgrade' && page.maint[0].svcs.join() === 'mail', 'maintenance planned: on the status page ahead', JSON.stringify(page.maint));
await toDesk();
await ad.click('#sheet .row:has(b:text-is("Maintenance and alerts"))');
await ad.waitForSelector('#sheet .row:has(b:text-is("Mail server upgrade")) button.mini', { timeout: 15000 });
await ad.click('#sheet .row:has(b:text-is("Mail server upgrade")) button.mini');
await ad.waitForTimeout(1200);
ok(!(await status()).maint?.length, 'called off: gone from the status page');
await ad.locator('#sheet label.row:has(b:text-is("And by email")) input.switch').click();
await ad.waitForTimeout(1200);
ok((await AD.ask('status')).json.prefs.email === false, 'how you’re told: email off, kept');
console.log('errs', K.errs);
ok(!K.errs.length, 'no errors on the page', K.errs.join(' | '));
console.log(`FAILS ${K.fails()}`);
process.exit(0);
