// needs: hub mail
// Mail on Your Day, stage 1 (trips and bookings), on Mail's own page (email.ifl.test, Mail's Worker, the inflite repo's
// email/): George, the site's admin, on an iPhone, with real booking mail in Mail (the unit tests' fixtures/yourday/,
// delivered through Mail's own email handler: TAP's return flight in JSON-LD, a hotel, a table in microdata, and a
// letter with no booking). Off as it starts: no strip, and Today's card (asked with the shared key) has neither ahead nor
// trips. Settings' "Spot in your mail" → "Trips and bookings" turned on: the last 60 days read back, and the card has
// them, grouped as the Lisbon trip. The conversation's strip, as the approved mock-up's "In Mail": what, when, the
// facts, "On Your Day · part of Lisbon, …", how Mail knows; Remove → "Not on Your Day" / Put It Back; Wrong; a
// conversation opened by its address (#thread=<id>) while Mail's open, as Today's Open Email does; Today's Hide (the
// key-only route) seen on the strip; turned off: gone. No error on Mail's page.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { kit } from './lib.mjs';
import { makeAccount, PASSWORD } from './join.mjs';

const [,, S, out] = process.argv;
const K = await kit(S, out);
const { ok, one, hubPhone, hostAsk, errs } = K;
const MAIL = 'http://email.ifl.test:8788', ACCT = 'http://account.ifl.test:8788';
const KEY = 'mail-test-key';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 20000) => { const end = Date.now() + ms; for (;;) { const v = await Promise.resolve().then(f).catch(() => null); if (v || Date.now() > end) return v; await wait(300); } };
const js = (x) => String(JSON.stringify(x)).slice(0, 400);

// (a fixture, its dates from today, as unit/mailyourday.test.mjs fills them)
const FIX = new URL('./unit/fixtures/yourday/', import.meta.url);
const iso = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const fixture = (name) => readFileSync(new URL(name, FIX), 'utf8').replace(/@D([+-]\d+)@/g, (_, n) => iso(+n)).replace(/@C([+-]\d+)@/g, (_, n) => iso(+n).replace(/-/g, ''))
  .replace(/@MAILDATE@/g, new Date().toUTCString()).replace(/\r?\n/g, '\r\n');
function deliver(raw, from) {
  return new Promise((done) => {
    const q = http.request({ host: '127.0.0.1', port: 8806, method: 'POST', agent: false, path: `/cdn-cgi/handler/email?from=${encodeURIComponent(from)}&to=hello%40inflite.ai`,
      headers: { 'Content-Type': 'message/rfc822', 'Content-Length': Buffer.byteLength(raw) } }, (res) => { res.resume(); res.on('end', () => done(res.statusCode)); });
    q.on('error', () => done(0)); q.end(raw);
  });
}
const card = () => hostAsk('email.ifl.test:8788', '/api/connector/card', { headers: { Authorization: `Bearer ${KEY}` } }).then((r) => r.json);

// ---- George, the site's admin, signed in just now with a passkey ----
const george = await hubPhone('george', await K.makeKeys());
const { p, ctx } = george;
await makeAccount(p, `${ACCT}/`, { name: 'George Farrow-Green', handle: 'georgeday', email: 'george@example.com', password: PASSWORD });
const gid = one("SELECT id FROM pg_users WHERE handle = 'georgeday'")[0]?.id;
one(`INSERT OR REPLACE INTO pg_meta (k, v) VALUES ('admin_user', '${gid}')`);
one(`INSERT OR IGNORE INTO pg_passkeys (id, user_id, public_key, alg, created_at) VALUES ('yourday-key', '${gid}', 'x', -7, ${Date.now()})`);
ok(!!gid, 'George, the site’s admin, with a passkey');

const sent = [];
for (const [f, from] of [['plain.eml', 'rowan@example.com'], ['tap-return.eml', 'bookings@flytap.com'], ['hotel.eml', 'reservations@memmohotels.com'], ['restaurant-microdata.eml', 'no-reply@opentable.com']])
  sent.push(await deliver(fixture(f), from));
ok(sent.every((s) => s >= 200 && s < 300), 'four emails come to Mail (three with bookings in them)', js(sent));

// ---- off, as it starts ----
const c0 = await card();
ok(c0 && 'people' in c0 && !('ahead' in c0) && !('trips' in c0), 'off: Today’s card as it was, neither ahead nor trips', js(c0));
const errs0 = errs.length;
await p.goto(`${MAIL}/`);
const listed = await p.waitForSelector('.pane.list .row-wrap[data-id] .row', { timeout: 30000 }).then(() => true, () => false);
ok(listed, 'Mail’s own page, its list');
const openRow = async (who) => {
  await p.locator('.row-wrap[data-id] .row', { hasText: who }).first().click();
  return p.waitForSelector('.mcard', { timeout: 15000 }).then(() => true, () => false);
};
const back = async () => { await p.evaluate(() => history.back()).catch(() => {}); await wait(700); };
ok(await openRow('TAP Air Portugal'), 'TAP’s conversation opens');
await wait(1200);
ok((await p.locator('.spot').count()) === 0, 'off: no strip');
await back();

// ---- Settings: Spot in your mail → Trips and bookings ----
await p.goto(`${MAIL}/#settings`);
const SW = '.set-sheet button.switch[aria-label="Trips and bookings"]';
const sw = await p.waitForSelector(SW, { timeout: 20000 }).then(() => true, () => false);
const group = sw ? await p.evaluate((s) => { const b = document.querySelector(s); const g = b.closest('.set-group'); return { k: g.previousElementSibling?.textContent, row: b.closest('.set-row').textContent, on: b.getAttribute('aria-checked'), hint: g.nextElementSibling?.textContent }; }, SW) : null;
ok(group?.k === 'Spot in your mail' && /Trips and bookings/.test(group.row) && group.on === 'false' && /no AI/.test(group.hint || ''), 'Settings: “Spot in your mail”, “Trips and bookings”, off, read by rules alone', js(group));
await p.screenshot({ path: `${out}/settings-off.png` });
await p.click(SW);
const saved = await until(async () => (await card())?.ahead);
ok((await p.getAttribute(SW, 'aria-checked')) === 'true', 'turned on');
const c1 = await until(async () => { const c = await card(); return c?.ahead?.length >= 4 ? c : null; }, 30000);
ok(saved && c1?.ahead.length === 4, 'the last 60 days read back: four bookings ahead (two flights, a hotel, a table)', js(c1?.ahead?.map((a) => a.title)));
ok(c1?.trips?.length === 1 && c1.trips[0].name === 'Lisbon' && c1.trips[0].items.length === 4 && c1.ahead.every((a) => a.trip === c1.trips[0].id), 'grouped as one trip, Lisbon', js(c1?.trips));
await p.screenshot({ path: `${out}/settings-on.png` });
await p.click('.set-sheet button.ifs-btn[aria-label="Close"]').catch(() => {});
await wait(800);

// ---- the strip ----
ok(await openRow('TAP Air Portugal'), 'TAP’s conversation again');
const strips = await p.waitForSelector('.spot', { timeout: 15000 }).then(() => p.$$eval('.spot', (els) => els.map((e) => ({
  state: e.querySelector('.spot-state')?.textContent, title: e.querySelector('.spot-tx b')?.textContent,
  facts: [...e.querySelectorAll('.spot-facts > div')].map((d) => d.textContent), how: e.querySelector('.spot-how')?.textContent,
  btns: [...e.querySelectorAll('.spot-btns button')].map((b) => b.textContent), top: e.getBoundingClientRect().top }))), () => []);
const first = strips[0];
ok(strips.length === 2, 'the strip: both legs of the booking', js(strips));
ok(first && /^On Your Day · part of Lisbon, /.test(first.state) && /^Flight to Lisbon · \w+day 07:40$/.test(first.title), 'what it is, when, and that it’s on Your Day, part of Lisbon', js(first));
ok(first && JSON.stringify(first.facts) === JSON.stringify(['FromLHR T2 07:40', 'ToLIS 10:15', 'StatusBooked']), 'the facts: from, to, status', js(first?.facts));
ok(first && first.how === 'Read from the booking details TAP Air Portugal puts in its email · ref K7QX2M' && JSON.stringify(first.btns) === JSON.stringify(['Remove', 'Wrong']), 'how Mail knows; Remove and Wrong', js(first));
const above = await p.evaluate(() => { const s = document.querySelector('.spot'), m = document.querySelector('.mcard'); return !!s && !!m && s.getBoundingClientRect().bottom <= m.getBoundingClientRect().top + 1; });
ok(above, 'at the top of the conversation, above its messages');
await p.screenshot({ path: `${out}/strip.png` });
const outId = await p.getAttribute('.spot', 'data-spot');
await p.click('.spot >> nth=0 >> button[data-act="remove"]');
const removed = await until(() => p.evaluate(() => { const s = document.querySelector('.spot'); return s?.classList.contains('gone') && s.querySelector('.spot-state')?.textContent === 'Not on Your Day' && s.querySelector('button')?.textContent === 'Put it back'; }));
ok(removed, 'Remove: “Not on Your Day”, and Put It Back');
ok(!(await card()).ahead.some((a) => a.id === outId), 'and it’s off Today’s card');
await p.screenshot({ path: `${out}/strip-removed.png` });
await p.click('.spot >> nth=0 >> button[data-act="back"]');
ok(await until(() => p.evaluate(() => /^On Your Day/.test(document.querySelector('.spot .spot-state')?.textContent || ''))), 'Put It Back: on Your Day again');
ok((await card()).ahead.some((a) => a.id === outId), 'and on the card');

// ---- a conversation opened by its address while Mail's open (Today's Open Email), and Wrong ----
const table = (await card()).ahead.find((a) => a.kind === 'restaurant');
await p.evaluate((t) => { location.hash = `thread=${t}`; }, table.thread);
const byHash = await until(() => p.evaluate(() => [...document.querySelectorAll('.spot .spot-tx b')].map((b) => b.textContent).find((t) => /^Table at Taberna/.test(t)) || null));
ok(!!byHash && !/#thread=/.test(p.url()), '#thread=<id> with Mail open: that conversation, its strip (the table), the address tidied', `${byHash} ${p.url()}`);
await p.click('.spot >> nth=0 >> button[data-act="wrong"]');
const wronged = await until(() => p.evaluate(() => document.querySelector('.spot .spot-state')?.textContent === 'Not on Your Day' && /won’t read tables from/.test(document.querySelector('.toast')?.textContent || '')));
ok(wronged, 'Wrong: taken off, and said that sender’s tables won’t be read again');
ok(!(await card()).ahead.some((a) => a.id === table.id), 'off the card');

// ---- Today's Hide, seen on the strip ----
const hotel = (await card()).ahead.find((a) => a.kind === 'hotel');
const refused = await hostAsk('email.ifl.test:8788', '/api/connector/hide', { method: 'POST', body: { id: hotel.id } });
const hid = await hostAsk('email.ifl.test:8788', '/api/connector/hide', { method: 'POST', body: { id: hotel.id }, headers: { Authorization: `Bearer ${KEY}` } });
ok(refused.status === 401 && hid.status === 204 && !(await card()).ahead.some((a) => a.id === hotel.id), 'Today’s Hide: refused without the key; with it, 204, and off the card', `${refused.status} ${hid.status}`);
await p.evaluate((t) => { location.hash = `thread=${t}`; }, hotel.thread);
ok(await until(() => p.evaluate(() => { const s = document.querySelector('.spot'); return s && /^Memmo Alfama/.test(s.querySelector('.spot-tx b')?.textContent || '') && s.querySelector('.spot-state')?.textContent === 'Not on Your Day'; })), 'the hotel’s strip says it’s not on Your Day');

// ---- turned off ----
await p.goto(`${MAIL}/#settings`);
await p.waitForSelector(SW, { timeout: 20000 }).catch(() => {});
await p.click(SW);
const off = await until(async () => { const c = await card(); return c && !('ahead' in c) ? c : null; });
ok(!!off && !('trips' in off), 'turned off: the card has neither again', js(off));
await p.click('.set-sheet button.ifs-btn[aria-label="Close"]').catch(() => {});
await wait(600);
ok(await openRow('TAP Air Portugal'), 'TAP’s conversation');
await wait(1500);
ok((await p.locator('.spot').count()) === 0, 'and no strip');

const mine = errs.slice(errs0).filter((e) => e.startsWith('george:'));
ok(!mine.length, 'no error on Mail’s page', js(mine));
await ctx.close();
await (await K.hubBrowser()).close();
await K.b.close();
console.log(`FAILS ${K.fails()}`);
process.exit(0);
