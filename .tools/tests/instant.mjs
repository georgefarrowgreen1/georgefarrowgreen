// Instant Chat, as new accounts have it (pigeons off): messages arrive at once, with no flight, no weather asked, no
// loft spent and no location needed; delivered and read ticks (and what read receipts and Show when I’m online do to
// them); typing dots, held in memory by the typing Worker and never in the database; the push at send, its words with
// names off and on, held by quiet hours; letters from a friend with pigeons on still fly to someone with them off,
// shown plainly and sealed; turning pigeons off never touches a letter in the air; and Send to a Friend with pigeons
// off (Now, and With Their Morning, sent at a time). The site is restarted with the real default (PIGEONS=0), keeping
// its database; the next test's fresh start goes back to the kit's (pigeons on).
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { kit } from './lib.mjs';
import { inflightSettings } from './join.mjs';
import { chatHash } from '../../pigeon/cards.js';
const [,, S, out] = process.argv;
const restart = (env = {}) => execSync(`${S}/restartkeep.sh`, { env: { ...process.env, PIGEONS: '0', ...env }, stdio: 'ignore' });
restart();
const K = await kit(S, out);
const { ok, sql, one, api, sess, openChat, tick } = K;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 15000, step = 400) => { const end = Date.now() + ms; for (;;) { const v = await f(); if (v || Date.now() > end) return v; await wait(step); } };
const weatherAsked = () => readFileSync(`${S}/weatherlog.jsonl`, 'utf8').split('\n').filter(Boolean).length;
const lastTk = (ph) => ph.p.evaluate(() => [...document.querySelectorAll('.msgs .mt .tk')].at(-1)?.dataset.st || null);
const msgsText = (ph) => ph.p.evaluate(() => document.querySelector('.msgs')?.innerText || '');
const reload = async (ph) => { await ph.p.reload(); await ph.p.waitForSelector('.tabs', { timeout: 30000 }); await ph.p.waitForTimeout(800); };
const back = async (ph) => { await ph.p.click('.chatnav .back'); await ph.p.waitForTimeout(700); };
const write = async (ph, text) => { await ph.p.fill('#msg', text); await ph.p.click('.send'); await ph.p.waitForTimeout(800); };
const newest = (who) => one(`SELECT * FROM pg_msgs WHERE sender = '${who}' ORDER BY rowid DESC LIMIT 1`)[0];
// one of Chat's switches on the account's page (Who sees what), as Settings in InFlite's menu opens it; then Chat again
const privacy = async (ph, key) => {
  const w = await inflightSettings(ph.p, 'Who sees what');
  await w.click(`#if-${key}`); await w.waitForFunction((id) => !document.getElementById(id)?.disabled, `if-${key}`); await w.waitForTimeout(300);
  await w.close(); await reload(ph);
};

// ---- 1. New accounts: pigeons off, chats instant; no note, the pigeons-off tip; nothing of the pigeons ----
const W = await K.phone('welcome');
await W.p.waitForSelector('.welcome .ifl-tagline', { timeout: 20000 });
ok((await W.p.locator('.welcome .ifl-tagline').innerText()).trim() === 'Messages, and letters by pigeon', '1. the welcome: “Messages, and letters by pigeon”');
await W.ctx.close();
const lKeys = await K.makeKeys();
const M = await K.phone('mira'), L = await K.phone('leo', lKeys);
await K.signup(M, 'Mira Okafor', 'mira', 'mira@example.com', 'Norwich');
await K.signup(L, 'Leo Marsh', 'leo', 'leo@example.com', 'London');
const [ms, ls] = [await sess(M), await sess(L)], MI = ms.me.id, LE = ls.me.id;
const acct = one(`SELECT pigeons, new_way, noted_at FROM pg_users WHERE id = '${MI}'`)[0];
ok(acct?.pigeons === 0 && acct.new_way === 'instant' && acct.noted_at != null, '1. a new account: pigeons off, new chats instant, the note already seen', JSON.stringify(acct));
await api(ms.token, 'friends', { handle: 'leo' }); await api(ls.token, 'friends-respond', { id: MI, accept: true });
ok(one(`SELECT way FROM pg_ways WHERE a = '${MI}' AND b = '${LE}'`)[0]?.way === 'instant', '1. their chat: instant both ways', JSON.stringify(one(`SELECT a, b, way FROM pg_ways`)));
await reload(M); await reload(L);
ok(!(await M.p.$('.notecard')) && !!(await M.p.$('.pgtip [data-act=pgtipon]')), '1. no note; the pigeons-off tip: “Pigeons are still here”', await M.p.locator('.pgtip').innerText().catch(() => ''));
ok(/Pigeons are still here/.test(await M.p.locator('.pgtip').innerText().catch(() => '')), '1. its words');
ok(!(await M.p.$('[data-act=skies]')) && !(await M.p.$('.airslot')) && !(await M.p.$('.mrow .streak')), '1. no globe, no In the air strip, no streak');
ok((await M.p.getAttribute('.birdt[data-act=pigeons]', 'aria-pressed')) === 'false', '1. the Pigeons switch at the top, off');
await M.p.screenshot({ path: `${out}/01-list-off.png` });
await openChat(M, LE);
ok(!(await M.p.isVisible('.compose .kind')) && !(await M.p.isVisible('.compose .mode')) && !(await M.p.$('.mpill')), '1. in a chat: no bird pill, no Now button, no way pill');
ok((await M.p.getAttribute('#msg', 'placeholder')) === 'Message' && (await M.p.getAttribute('.send', 'aria-label')) === 'Send', '1. “Message”, and Send');

// ---- 2. Mira sends “Running late”: no tick needed, no weather asked, no loft spent; Leo's open chat has it at once ----
await openChat(L, MI);
const lofts0 = one(`SELECT swift, turbo, rocket FROM pg_users WHERE id = '${MI}'`)[0], wx0 = weatherAsked();
const t2 = Date.now();
await write(M, 'Running late');
const r2 = newest(MI);
ok(r2?.instant === 1 && r2.sent_at === r2.deliver_at && r2.km === 0 && r2.from_lat == null, '2. the row: instant, sent and delivered at once, no distance, no route', JSON.stringify({ instant: r2?.instant, sent: r2?.sent_at, del: r2?.deliver_at, km: r2?.km }));
const seen2 = await L.p.waitForFunction(() => /Running late/.test(document.querySelector('.msgs')?.innerText || ''), null, { timeout: 6000 }).then(() => true, () => false);
ok(seen2, '2. Leo’s open chat shows it within 6 s, with no tick', `${Date.now() - t2} ms`);
ok(!!(await L.p.$('.msgs .b[data-instant]')), '2. as a message');
ok(weatherAsked() === wx0, '2. no weather asked for it', `${wx0} → ${weatherAsked()}`);
ok(JSON.stringify(one(`SELECT swift, turbo, rocket FROM pg_users WHERE id = '${MI}'`)[0]) === JSON.stringify(lofts0), '2. Mira’s lofts as they were');

// (a message the pulse's delta brought while its own answer was still on its way: shown once, not twice)
const isPost = (u) => new URL(u).pathname === '/api/pigeon/messages';
await M.p.route(isPost, async (r) => {
  if (r.request().method() !== 'POST') return r.continue();
  const res = await r.fetch(); await wait(5000); await r.fulfill({ response: res });
});
await write(M, 'Held on the way back');
const r2b = await until(async () => { const x = newest(MI); return x && x.id !== r2.id ? x : null; }, 6000, 200);
await wait(6000);
await M.p.unroute(isPost);
const twice = r2b ? await M.p.$$eval(`.msgs [data-mid="${r2b.id}"]`, (xs) => xs.length) : -1;
ok(twice === 1, '2. a message the delta brought before its own answer came back: shown once', `${twice} on screen`);
// ---- 3. Ticks: delivered once Leo's app has it, read when he opens the chat; read receipts off; online hidden ----
ok(await until(async () => (await lastTk(M)) === 'read', 15000), '3. Leo has the chat open: Mira’s tick turns read', await lastTk(M));
await back(L);
await write(M, 'Second');
ok(await until(async () => ['sent', 'delivered'].includes(await lastTk(M)), 6000, 200), '3. sent: one tick (or two, once Leo’s list has it)', await lastTk(M));
ok(await until(async () => (await lastTk(M)) === 'delivered', 25000), '3. delivered once Leo’s app has it (on his list)', await lastTk(M));
await M.p.screenshot({ path: `${out}/03-delivered.png` });
await openChat(L, MI);
ok(await until(async () => (await lastTk(M)) === 'read', 15000), '3. read when he opens the chat', await lastTk(M));
await M.p.screenshot({ path: `${out}/03-read.png` });
await back(L);
await privacy(L, 'receipts');
ok(one(`SELECT no_receipts FROM pg_users WHERE id = '${LE}'`)[0]?.no_receipts === 1, '3. Leo’s read receipts off (the account’s page)');
await openChat(L, MI);
await write(M, 'Third');
ok(await until(async () => (await lastTk(M)) === 'delivered', 15000), '3. receipts off: delivered…', await lastTk(M));
await wait(7000);
ok((await lastTk(M)) === 'delivered' && one(`SELECT read_at FROM pg_msgs WHERE id = '${newest(MI).id}'`)[0]?.read_at != null, '3. …and it stays delivered, though Leo has read it', await lastTk(M));
await back(L);
await privacy(L, 'showOnline');
ok(one(`SELECT hide_online FROM pg_users WHERE id = '${LE}'`)[0]?.hide_online === 1, '3. Leo’s Show when I’m online off');
await write(M, 'Fourth');
const r3 = newest(MI);
const got = await until(() => one(`SELECT got_at FROM pg_msgs WHERE id = '${r3.id}'`)[0]?.got_at, 25000, 500);
const nudge = one(`SELECT at FROM pg_pulse WHERE user_id = '${MI}' AND chat = '${LE}'`)[0]?.at;
ok(!!got && nudge != null && nudge < got, '3. online hidden: delivered for Leo, but no live nudge to Mira for it', JSON.stringify({ got, nudge }));
await reload(M); await openChat(M, LE);
ok(await until(async () => (await lastTk(M)) === 'delivered', 10000), '3. Mira’s tick turns delivered on her next full fetch', await lastTk(M));
const [, mchat] = await api(ms.token, 'messages?with=' + LE);
const m3 = (mchat.messages || []).find((x) => x.id === r3.id);
ok(m3?.delivered === true && m3.gotAt === null, '3. and no time of it reaches her (gotAt hidden)', JSON.stringify({ delivered: m3?.delivered, gotAt: m3?.gotAt }));
await privacy(L, 'showOnline'); await privacy(L, 'receipts');
ok(JSON.stringify(one(`SELECT hide_online, no_receipts FROM pg_users WHERE id = '${LE}'`)[0]) === '{"hide_online":0,"no_receipts":0}', '3. (both back on)');

// ---- 4. Typing: dots while Leo writes, gone when he stops; never in the database; his switch; no Worker ----
await openChat(L, MI); await openChat(M, LE);
const tables = () => one("SELECT name FROM sqlite_master WHERE name LIKE '%typ%'").map((x) => x.name);
const feed = () => JSON.stringify(one('SELECT COUNT(*) AS n, MAX(at) AS at FROM pg_pulse')[0]);
await wait(3500);
const feed0 = feed();
await L.p.click('#msg'); await L.p.type('#msg', 'On my way', { delay: 60 });
const dots = await M.p.waitForSelector('.msgs .typing', { timeout: 5000 }).then(() => true, () => false);
ok(dots, '4. Leo types: Mira sees the dots within 5 s');
ok(/typing…/.test(await M.p.locator('.chatwho .ty').innerText().catch(() => '')), '4. and “typing…” under his name', await M.p.locator('.chatwho').innerText().catch(() => ''));
ok(/Leo is typing/.test(await M.p.getAttribute('.msgs .typing', 'aria-label').catch(() => '') || ''), '4. said to a screen reader: “Leo is typing”');
await M.p.screenshot({ path: `${out}/04-typing.png` });
await L.p.fill('#msg', '');
ok(await M.p.waitForSelector('.msgs .typing', { state: 'detached', timeout: 10000 }).then(() => true, () => false), '4. he stops: gone within 10 s');
ok(!tables().length && feed() === feed0, '4. no table holds typing, and typing wrote no row (the change feed as it was)', `${tables()} ${feed0} → ${feed()}`);
await back(L);
await privacy(L, 'showTyping');
ok(one(`SELECT hide_typing FROM pg_users WHERE id = '${LE}'`)[0]?.hide_typing === 1, '4. Leo’s Show when I’m typing off');
await openChat(L, MI);
await L.p.click('#msg'); await L.p.type('#msg', 'Nearly there', { delay: 60 });
await wait(6000);
ok(!(await M.p.$('.msgs .typing')), '4. then Mira sees no dots');
await L.p.fill('#msg', ''); await back(L);
await privacy(L, 'showTyping');
// (no typing Worker: typing is off, everything else as ever)
restart({ TYPING: '0' });
await reload(M); await reload(L);
const [, p0] = await api(ls.token, 'pulse', { since: Date.now(), open: MI });
ok(p0 && p0.typing === null && Array.isArray(p0.changed), '4. no typing Worker: the pulse answers, with typing null', JSON.stringify(p0).slice(0, 160));
await openChat(L, MI); await openChat(M, LE);
await L.p.click('#msg'); await L.p.type('#msg', 'Hello?', { delay: 60 });
await wait(6000);
ok(!(await M.p.$('.msgs .typing')), '4. no dots');
await L.p.fill('#msg', '');
await write(M, 'Still arriving');
ok(await L.p.waitForFunction(() => /Still arriving/.test(document.querySelector('.msgs')?.innerText || ''), null, { timeout: 8000 }).then(() => true, () => false), '4. and messages still arrive');
restart();
await reload(M); await reload(L);

// ---- 5. The push at send: names off, then on; quiet hours hold it; never “A pigeon has landed” for a message ----
await K.pushOn(L);
await L.p.click('[data-act=tab][data-id=messages]'); await L.p.waitForTimeout(500);
await openChat(M, LE);
const pushesTo = (since) => K.allPushes(lKeys, 'leo', since);
let t5 = Date.now();
await write(M, 'Are you there?');
let ps = await until(async () => { const x = await pushesTo(t5); return x.length ? x : null; }, 10000);
ok(ps?.length === 1 && ps[0].title === 'Chat' && ps[0].body === 'You have a new message.' && ps[0].tag === `msg-${MI}`, '5. names off: “Chat”, “You have a new message.”', JSON.stringify(ps));
ok(!JSON.stringify(ps || []).includes('Are you there'), '5. never the words');
sql(`UPDATE pg_users SET notify_prefs = json_set(notify_prefs, '$.names', json('true')) WHERE id = '${LE}'`);
await wait(11000);          // (a friend's messages buzz at most once every 10 s)
t5 = Date.now();
await write(M, 'Hello again');
ps = await until(async () => { const x = await pushesTo(t5); return x.length ? x : null; }, 10000);
ok(ps?.length === 1 && ps[0].title === 'Mira' && /^Sent you (a message|\d+ messages)\.$/.test(ps[0].body), '5. names on: “Mira”, “Sent you a message.”', JSON.stringify(ps));
await wait(11000);
const hr = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
sql(`UPDATE pg_users SET notify_prefs = json_set(notify_prefs, '$.quiet', json('true'), '$.quietFrom', ${hr}, '$.quietTo', ${(hr + 1) % 24}, '$.tz', 'Europe/London') WHERE id = '${LE}'`);
t5 = Date.now();
await write(M, 'Quietly');
await wait(5000);
ok((await pushesTo(t5)).length === 0, '5. quiet hours: held');
sql(`UPDATE pg_users SET notify_prefs = json_set(notify_prefs, '$.quiet', json('false')) WHERE id = '${LE}'`);
t5 = Date.now(); await tick(); await wait(1500);
ps = await pushesTo(t5);
ok(ps.length === 1 && ps[0].title === 'Mira' && /^Sent you/.test(ps[0].body) && ps[0].tag === `msg-${MI}`, '5. told once when they end, as a message', JSON.stringify(ps));
t5 = Date.now(); await tick(); await wait(1000);
ok((await pushesTo(t5)).length === 0, '5. and not again');
ok(!(await pushesTo(0)).some((x) => /pigeon has landed/i.test(x.body || '')), '5. never “A pigeon has landed” for a message');

// ---- 6. A letter to someone with pigeons off: Mira turns them on and sends one by pigeon ----
await K.setPigeons(M, true);
await openChat(M, LE);
ok(await M.p.isVisible('.compose .mode'), '6. pigeons on: the Now button in the message box');
if ((await M.p.getAttribute('.compose .mode', 'data-next')) !== 'pigeon') await M.p.click('.compose .mode');
await M.p.waitForTimeout(300);
ok(await M.p.isVisible('.compose .kind') && /^Lands /.test(await M.p.getAttribute('#msg', 'placeholder')), '6. by pigeon: the bird pill, and when it lands', await M.p.getAttribute('#msg', 'placeholder'));
await write(M, 'A proper letter'); await M.p.waitForTimeout(1200);
const r6 = newest(MI);
ok(r6?.instant == null && r6.deliver_at > Date.now(), '6. a letter: it flies', JSON.stringify({ instant: r6?.instant, deliver_at: r6?.deliver_at }));
await reload(L); await openChat(L, MI);
const arrives = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(r6.deliver_at));
await L.p.waitForSelector('.sealedb', { timeout: 15000 }).catch(() => {});
const sealed = await L.p.locator('.sealedb').innerText().catch(() => '');
ok(/A letter from Mira/.test(sealed) && (sealed.includes(`Arrives at ${arrives}. Sealed until then.`) || sealed.includes(`Arrives tomorrow ${arrives}. Sealed until then.`)), '6. Leo sees it plainly: “A letter from Mira”, “Arrives at HH:MM. Sealed until then.”', sealed);
// (what Chat draws for a pigeon: the sealed bubble and flying rows open the map, with the bird on its track)
const BIRDS = '.msgs [data-act=map], .msgs .trk, .msgs .ctrack, .msgs .frr, .msgs .b.fly';
ok(!(await L.p.$(BIRDS)) && (await L.p.getAttribute('.sealedb', 'data-act')) === 'sealedtap', '6. no bird, no map', await L.p.$$eval(BIRDS, (xs) => xs.map((x) => x.outerHTML.slice(0, 120))).catch(() => ''));
ok(await M.p.waitForSelector(BIRDS, { timeout: 5000 }).then(() => true, () => false), '6. (and Mira, with pigeons on, sees her bird on its way: the check above can tell)');
await L.p.screenshot({ path: `${out}/06-sealed.png` });
const [, lchat] = await api(ls.token, 'messages?with=' + MI);
ok((lchat.messages || []).find((x) => x.id === r6.id)?.ct === null, '6. the API gives Leo no words until it lands');
// ---- 7. Turning pigeons off with a letter in the air: the row is the same ----
// (the next message goes Now again, the chat being instant: by pigeon once more)
if ((await M.p.getAttribute('.compose .mode', 'data-next')) !== 'pigeon') await M.p.click('.compose .mode');
await M.p.waitForTimeout(300);
// (the server refuses it once: the words come back, and it's still to go by pigeon, not Now)
await M.p.route(isPost, (r) => (r.request().method() === 'POST' ? r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Something went wrong. Try again.' }) }) : r.continue()));
await write(M, 'Another, still flying'); await M.p.waitForTimeout(800);
await M.p.unroute(isPost);
const kept7 = [await M.p.inputValue('#msg'), await M.p.getAttribute('.compose .mode', 'data-next')];
ok(kept7[0] === 'Another, still flying' && kept7[1] === 'pigeon', '7. refused by the server: the words back in the box, still by pigeon', JSON.stringify(kept7));
await M.p.click('.send'); await M.p.waitForTimeout(2000);
const r7 = newest(MI), before7 = JSON.stringify(one(`SELECT * FROM pg_msgs WHERE id = '${r7.id}'`));
await K.setPigeons(M, false);
const after7 = JSON.stringify(one(`SELECT * FROM pg_msgs WHERE id = '${r7.id}'`));
ok(r7.instant == null && r7.deliver_at > Date.now() && after7 === before7, '7. pigeons off with a letter in the air: its row as it was', `instant ${r7.instant}; ${after7 === before7 ? 'same' : 'changed'}`);
// (and the first one lands: “A pigeon has landed”, letters as ever)
await back(L);
sql(`UPDATE pg_msgs SET deliver_at = ${Date.now() - 2000} WHERE id = '${r6.id}'`);
t5 = Date.now(); await tick(); await wait(1500);
ps = await pushesTo(t5);
ok(ps.some((x) => x.body === 'A pigeon has landed.' && x.title === 'Mira' && x.tag === `from-${MI}`), '6. landed on the tick: “A pigeon has landed.”', JSON.stringify(ps));

// ---- 8. Send to a Friend with pigeons off (a card's link, as Weather makes it) ----
const N = await K.phone('nia');
await K.signup(N, 'Nia Brooks', 'nia', 'nia@example.com', 'London');
const ns = await sess(N);
await api(ms.token, 'friends', { handle: 'nia' }); await api(ns.token, 'friends-respond', { id: MI, accept: true });
await N.ctx.close();
sql(`UPDATE pg_users SET lat = NULL, lon = NULL, place = NULL, notify_prefs = json_remove(notify_prefs, '$.tz') WHERE id = '${ns.me.id}'`);
await reload(M);
const wcard = { v: 1, kind: 'weather', from: 'weather', at: Date.now() - 60e3, say: 'Dry in Norwich for now.',
  snap: { place: 'Norwich', tz: 'Europe/London', temp: 12.4, feels: 10.9, code: 2, isDay: true, hi: 14.1, lo: 8, lead: 'Dry for now.', rain: null, spell: null }, ref: { cell: [52.65, 1.3] } };
const sheet = async () => { await M.p.evaluate((h) => { location.hash = h; }, chatHash('Dry in Norwich for now.', wcard)); await M.p.waitForSelector('.sheet [data-act=sendwhen]', { timeout: 15000 }); await M.p.waitForTimeout(500); };
await sheet();
const chips = await M.p.$$eval('.sheet [data-act=sendwhen]', (bs) => bs.map((b) => [b.dataset.id, b.textContent.trim()]));
ok(JSON.stringify(chips) === '[["now","Now"],["morning","With Their Morning"]]', '8. chips: Now and With Their Morning only', JSON.stringify(chips));
ok(!(await M.p.isDisabled(`.sheet [data-act=sendpick][data-id="${ns.me.id}"]`)), '8. a friend with no location yet can be picked');
await M.p.click(`.sheet [data-act=sendpick][data-id="${ns.me.id}"]`); await M.p.waitForTimeout(300);
ok(await M.p.isDisabled('.sheet [data-act=sendwhen][data-id=morning]'), '8. With Their Morning off while only they are picked (their morning isn’t known)');
await M.p.click(`.sheet [data-act=sendpick][data-id="${ns.me.id}"]`); await M.p.click(`.sheet [data-act=sendpick][data-id="${LE}"]`); await M.p.waitForTimeout(300);
ok((await M.p.locator('.sheet [data-act=sendgo]').innerText()).trim() === 'Send to Leo', '8. the button: “Send to Leo”', await M.p.locator('.sheet [data-act=sendgo]').innerText());
ok(!/Lands in|pigeon/i.test(await M.p.locator('.sheet .sendrow').allInnerTexts().then((x) => x.join(' '))), '8. no “Lands in”, no pigeon words in the rows');
await M.p.screenshot({ path: `${out}/08-send-off.png` });
await M.p.click('.sheet [data-act=sendgo]'); await M.p.waitForTimeout(1200);
const r8 = newest(MI);
ok(r8?.instant === 1 && r8.sent_at === r8.deliver_at && r8.recipient === LE, '8. Now: a message, there at once', JSON.stringify({ instant: r8?.instant, s: r8?.sent_at, d: r8?.deliver_at }));
const [, l8] = await api(ls.token, 'messages?with=' + MI);
ok(!!(l8.messages || []).find((x) => x.id === r8.id && x.ct), '8. Leo has it, to read');
await wait(4000);
await sheet();
await M.p.click(`.sheet [data-act=sendpick][data-id="${LE}"]`); await M.p.click('.sheet [data-act=sendwhen][data-id=morning]'); await M.p.waitForTimeout(400);
await M.p.click('.sheet [data-act=sendgo]'); await M.p.waitForTimeout(1200);
const r9 = newest(MI);
// (07:30 next on Leo's clock, at least a minute from now)
const at730 = (() => { const t = Date.now() + 60e3; for (let d = 0; d < 3; d++) { const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(t + d * 864e5));
  for (const off of [0, -3600e3]) { const x = Date.parse(`${day}T07:30:00Z`) + off; if (new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(x)) === '07:30' && x > t) return x; } } return null; })();
ok(r9?.instant === 1 && r9.sched === 1 && r9.sent_at === at730 && r9.deliver_at === r9.sent_at, '8. With Their Morning: a message sent at 07:30 Leo’s time', JSON.stringify({ instant: r9?.instant, sched: r9?.sched, sent: r9?.sent_at, want: at730 }));
const [, l9] = await api(ls.token, 'messages?with=' + MI);
ok(!(l9.messages || []).some((x) => x.id === r9.id), '8. and Leo can’t see it before then');

const errs = K.errs.filter((e) => !/Failed to fetch|NetworkError|ERR_CONNECTION|net::/.test(e));
ok(errs.length === 0, 'no errors on the pages', JSON.stringify(errs.slice(0, 4)));
console.log(`FAILS ${K.fails()}`);
process.exit(0);
