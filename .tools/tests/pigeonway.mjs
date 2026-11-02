// Pigeons on (the kit's accounts, as accounts were before: new chats By Pigeon): each chat's way. The message box's Now
// button sends one message at once and goes back to the pigeon; the way pill in a chat's header makes the whole chat
// instant, and the friend sees a line for it; "New chats start as" applies to a friend added afterwards; the one-time
// note's two buttons; streaks count letters only, and their warning goes only to someone with pigeons on; and in a
// group, an instant message arrives for everyone without a tick, and a way change shows a line.
import { execSync } from 'child_process';
import { kit } from './lib.mjs';
const [,, S, out] = process.argv;
const K = await kit(S, out);
const { ok, sql, one, api, sess, openChat, tick } = K;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const reload = async (ph) => { await ph.p.reload(); await ph.p.waitForSelector('.tabs', { timeout: 30000 }); await ph.p.waitForTimeout(800); };
const write = async (ph, text) => { await ph.p.fill('#msg', text); await ph.p.click('.send'); await ph.p.waitForTimeout(1500); };
const msgsHas = (ph, re, ms = 15000) => ph.p.waitForFunction((src) => new RegExp(src).test(document.querySelector('.msgs')?.innerText || ''), re.source, { timeout: ms }).then(() => true, () => false);

const mKeys = await K.makeKeys(), pKeys = await K.makeKeys();
const M = await K.phone('mira', mKeys), L = await K.phone('leo'), P = await K.phone('pat', pKeys);
await K.signup(M, 'Mira Okafor', 'mira', 'mira@example.com', 'Norwich');
await K.signup(L, 'Leo Marsh', 'leo', 'leo@example.com', 'London');
await K.signup(P, 'Pat Lee', 'pat', 'pat@example.com', 'Paris');
const [ms, ls, ps] = [await sess(M), await sess(L), await sess(P)], MI = ms.me.id, LE = ls.me.id, PA = ps.me.id;
ok(JSON.stringify(one(`SELECT DISTINCT pigeons, new_way FROM pg_users`)) === '[{"pigeons":1,"new_way":"pigeon"}]', '0. the kit’s accounts: pigeons on, new chats By Pigeon');
await api(ms.token, 'friends', { handle: 'leo' }); await api(ls.token, 'friends-respond', { id: MI, accept: true });
await reload(M); await reload(L);
const newest = () => one(`SELECT * FROM pg_msgs WHERE sender = '${MI}' ORDER BY rowid DESC LIMIT 1`)[0];
const streaks = () => Number(one('SELECT COUNT(*) AS n FROM pg_streaks')[0].n);

// ---- 1. The message box: by pigeon, then Now for one message, then by pigeon again ----
await openChat(M, LE);
ok(await M.p.isVisible('.compose .kind') && (await M.p.getAttribute('.compose .mode', 'data-next')) === 'pigeon', '1. a chat By Pigeon: the bird pill, and the round Now button');
ok(/^Lands /.test(await M.p.getAttribute('#msg', 'placeholder')), '1. the placeholder says when it lands', await M.p.getAttribute('#msg', 'placeholder'));
ok((await M.p.getAttribute('.send', 'aria-label')) === 'Send by pigeon', '1. Send by pigeon');
await M.p.click('.compose .mode'); await M.p.waitForTimeout(300);
ok((await M.p.getAttribute('.compose .mode', 'data-next')) === 'now' && !(await M.p.isVisible('.compose .kind')), '1. Now: no pill');
ok((await M.p.getAttribute('#msg', 'placeholder')) === 'Message' && (await M.p.getAttribute('.send', 'aria-label')) === 'Send', '1. “Message”, and Send');
ok((await M.p.getAttribute('.compose .mode', 'aria-label')) === 'Next message goes now: send it by pigeon instead', '1. the Now button says what it does');
await M.p.screenshot({ path: `${out}/01-now.png` });
await write(M, 'Quick one');
ok(newest()?.instant === 1, '1. sent: a message (instant)', JSON.stringify({ instant: newest()?.instant }));
ok(streaks() === 0, '5. a message starts no streak');
ok((await M.p.getAttribute('.compose .mode', 'data-next')) === 'pigeon' && await M.p.isVisible('.compose .kind'), '1. the next one goes by pigeon again');
await write(M, 'A letter');
ok(newest()?.instant == null && newest().deliver_at > Date.now(), '1. then a letter, flying', JSON.stringify({ instant: newest()?.instant }));
ok(streaks() === 1, '5. and a letter does');

// ---- 2. The way pill, the way sheet, Instant: Leo sees a line ----
ok((await M.p.getAttribute('.mpill[data-act=waysheet]', 'data-way')) === 'pigeon' && (await M.p.getAttribute('.mpill', 'aria-label')) === 'How messages to Leo go', '2. the header pill: By Pigeon');
await M.p.click('.mpill[data-act=waysheet]'); await M.p.waitForSelector('.sheet [data-act=setway][data-id=instant]');
const sheet = await M.p.locator('.sheet').innerText();
ok(/Messages to Leo/.test(sheet) && /How this chat sends, unless you choose otherwise/.test(sheet) && /Messages arrive as soon as you send them/.test(sheet), '2. the sheet: “Messages to Leo”, Instant and By Pigeon', sheet.replace(/\s+/g, ' ').slice(0, 200));
await M.p.screenshot({ path: `${out}/02-waysheet.png` });
await M.p.click('.sheet [data-act=setway][data-id=instant]'); await M.p.waitForTimeout(1500);
ok((await M.p.getAttribute('.mpill[data-act=waysheet]', 'data-way')) === 'instant' && (await M.p.getAttribute('.compose .mode', 'data-next')) === 'now', '2. the chat is instant: the pill, and Now in the box');
ok(one(`SELECT way FROM pg_ways WHERE a = '${MI}' AND b = '${LE}'`)[0]?.way === 'instant' && one(`SELECT way FROM pg_wayev WHERE a = '${MI}' AND b = '${LE}'`)[0]?.way === 'instant', '2. kept, with a line’s row in pg_wayev');
await openChat(L, MI);
ok(await msgsHas(L, /Mira’s messages to you are instant now\./), '2. Leo sees “Mira’s messages to you are instant now.”', await L.p.locator('.msgs').innerText().catch(() => ''));
ok(!!(await L.p.$('.msgs .sysline.way')), '2. as a way line');
await L.p.click('.chatnav .back'); await M.p.click('.chatnav .back'); await M.p.waitForTimeout(500);

// ---- 3. New chats start as Instant (Chat's Account tab): a friend added afterwards ----
await M.p.click('[data-act=tab][data-id=account]'); await M.p.waitForSelector('[data-act=newchats][data-id=instant]');
ok((await M.p.getAttribute('#pg-switch', 'aria-checked')) === 'true' && (await M.p.getAttribute('[data-act=newchats][data-id=pigeon]', 'aria-pressed')) === 'true', '3. the Account tab: Pigeons on, new chats By Pigeon');
await M.p.click('[data-act=newchats][data-id=instant]'); await M.p.waitForTimeout(1200);
ok(one(`SELECT new_way FROM pg_users WHERE id = '${MI}'`)[0]?.new_way === 'instant', '3. New Chats Start As Instant: kept');
await api(ms.token, 'friends', { handle: 'pat' }); await api(ps.token, 'friends-respond', { id: MI, accept: true });
const wp = Object.fromEntries(one(`SELECT a, way FROM pg_ways WHERE (a = '${MI}' AND b = '${PA}') OR (a = '${PA}' AND b = '${MI}')`).map((r) => [r.a, r.way]));
ok(wp[MI] === 'instant' && wp[PA] === 'pigeon', '3. a friend added afterwards: Mira’s way to Pat instant, Pat’s to Mira by pigeon', JSON.stringify(wp));
await M.p.click('[data-act=tab][data-id=messages]');

// ---- 4. The one-time note ----
sql(`UPDATE pg_ways SET way = 'pigeon' WHERE a = '${MI}'; UPDATE pg_users SET noted_at = NULL, new_way = 'pigeon' WHERE id = '${MI}'`);
await reload(M);
await M.p.waitForSelector('.notecard', { timeout: 10000 }).catch(() => {});
const note = await M.p.locator('.notecard').innerText().catch(() => '');
ok(/Messages can be instant now/.test(note) && /Make Chats Instant/.test(note) && /Keep Them by Pigeon/.test(note), '4. the note shows, with its two buttons', note.replace(/\s+/g, ' '));
await M.p.screenshot({ path: `${out}/04-note.png` });
const toast4 = M.p.waitForSelector('.toast:has-text("Your chats are instant now. A letter by pigeon is a tap away in the message box.")', { state: 'attached', timeout: 10000 }).then(() => true, () => false);
await M.p.click('.notecard [data-act=noteinstant]'); await M.p.waitForTimeout(1500);
const mine = one(`SELECT way FROM pg_ways WHERE a = '${MI}'`).map((r) => r.way), mu = one(`SELECT noted_at, new_way FROM pg_users WHERE id = '${MI}'`)[0];
ok(mine.length === 2 && mine.every((w) => w === 'instant') && mu.noted_at != null && mu.new_way === 'instant', '4. Make Chats Instant: every chat of Mira’s instant, new chats too, the note seen', JSON.stringify({ mine, mu }));
ok(await toast4, '4. its toast: “Your chats are instant now. A letter by pigeon is a tap away in the message box.”');
await reload(M);
ok(!(await M.p.$('.notecard')), '4. it doesn’t come back');
const leoWays0 = JSON.stringify(one(`SELECT * FROM pg_ways WHERE a = '${LE}'`));
sql(`UPDATE pg_users SET noted_at = NULL WHERE id = '${LE}'`);
await reload(L);
await L.p.waitForSelector('.notecard [data-act=notekeep]', { timeout: 10000 }).catch(() => {});
await L.p.click('.notecard [data-act=notekeep]'); await L.p.waitForTimeout(1500);
ok(JSON.stringify(one(`SELECT * FROM pg_ways WHERE a = '${LE}'`)) === leoWays0 && one(`SELECT noted_at FROM pg_users WHERE id = '${LE}'`)[0]?.noted_at != null && !(await L.p.$('.notecard')),
  '4. a second account: Keep Them by Pigeon leaves the ways alone, and the note goes', leoWays0);

// ---- 6. Groups: an instant message for everyone without a tick; a way change, a line ----
const [, gr] = await api(ms.token, 'groups', { name: 'Trio', members: [LE, PA] });
const gid = gr?.group?.id;
ok(!!gid, '6. a group', JSON.stringify(gr).slice(0, 160));
await reload(M); await reload(L);
await openChat(M, gid); await openChat(L, gid);
ok((await M.p.getAttribute('.mpill[data-act=waysheet]', 'data-way')) === 'instant' && (await M.p.getAttribute('.compose .mode', 'data-next')) === 'now', '6. Mira’s way in it: instant (her new chats are)');
await write(M, 'Hello all');
const gm = one(`SELECT id, instant FROM pg_gmsgs ORDER BY rowid DESC LIMIT 1`)[0];
ok(gm?.instant === 1, '6. an instant group message', JSON.stringify(gm));
ok(await msgsHas(L, /Hello all/, 10000), '6. Leo’s open group has it, without a tick');
ok(Number(one(`SELECT COUNT(*) AS n FROM pg_gdeliv WHERE msg_id = '${gm?.id}'`)[0].n) === 2 && !one(`SELECT 1 FROM pg_gdeliv WHERE msg_id = '${gm?.id}' AND user_id = '${MI}'`).length, '6. delivered to the two others, never to Mira herself');
await L.p.click('.mpill[data-act=waysheet]'); await L.p.waitForSelector('.sheet [data-act=setway][data-id=instant]');
ok(/Your messages to the group/.test(await L.p.locator('.sheet').innerText()), '6. Leo’s sheet: “Your messages to the group”');
await L.p.click('.sheet [data-act=setway][data-id=instant]'); await L.p.waitForTimeout(1200);
ok(await msgsHas(M, /Leo’s messages to the group are instant now\./, 15000), '6. Mira sees “Leo’s messages to the group are instant now.”', await M.p.locator('.msgs').innerText().catch(() => ''));
await M.p.screenshot({ path: `${out}/06-group.png` });
await M.p.click('.chatnav .back'); await L.p.click('.chatnav .back');

// ---- 5. A streak's warning: only to whoever has pigeons on (the site restarted to warn at any hour) ----
await K.pushOn(M); await K.pushOn(P);
const d = Math.floor(Date.now() / 864e5), [a, b] = MI < PA ? [MI, PA] : [PA, MI];
sql(`INSERT OR IGNORE INTO pg_meta (k, v) VALUES ('streaks_v1', '1'); INSERT OR REPLACE INTO pg_streaks (a, b, start, last, best) VALUES ('${a}', '${b}', ${d - 3}, ${d - 1}, 3); UPDATE pg_users SET pigeons = 0 WHERE id = '${PA}'`);
execSync(`${S}/restartkeep.sh`, { env: { ...process.env, STREAK_ANYTIME: '1' }, stdio: 'ignore' });
const t5 = Date.now(); await tick(); await wait(2000);
const toM = (await K.allPushes(mKeys, 'mira', t5)).filter((x) => /streak/i.test(`${x.title} ${x.body}`)), toP = (await K.allPushes(pKeys, 'pat', t5)).filter((x) => /streak/i.test(`${x.title} ${x.body}`));
ok(toM.length === 1 && toM[0].title === 'Keep your streak going', '5. a 3-day streak about to end: Mira (pigeons on) is told', JSON.stringify(toM));
ok(toP.length === 0, '5. Pat (pigeons off) isn’t', JSON.stringify(toP));

const errs = K.errs.filter((e) => !/Failed to fetch|NetworkError|ERR_CONNECTION|net::/.test(e));
ok(errs.length === 0, 'no errors on the pages', JSON.stringify(errs.slice(0, 4)));
console.log(`FAILS ${K.fails()}`);
process.exit(0);
