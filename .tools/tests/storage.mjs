// Keeping only what's needed (functions/_retention.js): messages go 30 days after they land, for everyone, and
// the flight log, badges and passport don't change; a group's history and the admin log are trimmed; an account
// unused for a year is warned by email, then deleted (and one that comes back isn't); the admin sees it all.
import { kit } from './lib.mjs';
import { readFileSync } from 'fs';
const [,, S, out] = process.argv;
const K = await kit(S, out);
const { ok, one, api, sess, openChat, say } = K;
const A = await K.phone('ann'), B = await K.phone('ben'), C = await K.phone('cal');
await K.signup(A, 'Ann Ito', 'ann', 'ann@example.com', 'London');
await K.signup(B, 'Ben Ode', 'ben', 'ben@example.com', 'New York');
await K.signup(C, 'Cal Roy', 'cal', 'cal@example.com', 'Paris');
const [as, bs, cs] = [await sess(A), await sess(B), await sess(C)];
for (const x of [bs, cs]) { await api(as.token, 'friends', { handle: x.me.handle }); await api(x.token, 'friends-respond', { id: as.me.id, accept: true }); }
const DAY = 864e5, now = () => Date.now();
const mails = () => readFileSync(`${S}/mailbox.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((m) => m.body || m);
const housekeep = async () => { one("DELETE FROM pg_meta WHERE k = 'keep_at'"); await K.tick(); };

// a month and more ago: Ann to Ben (it went round storms and sheltered 3 hours on the way), and to a group
await A.p.reload(); await A.p.waitForSelector('.tabs'); await openChat(A, bs.me.id); await say(A, 'standard', 'From last month');
const old1 = one(`SELECT id FROM pg_msgs WHERE sender = '${as.me.id}'`)[0].id;
const t0 = now() - 33 * DAY, land = now() - 31 * DAY;
one(`UPDATE pg_msgs SET sent_at = ${t0}, deliver_at = ${land}, km = 5600, read_at = ${land + 3600e3}, from_place = 'London', to_place = 'New York',
  legs = json_array(json_array(51.5, -0.1, ${t0}, 's'), json_array(53, -30, ${t0 + 8 * 3600e3}, 'h'), json_array(53, -30, ${t0 + 11 * 3600e3}, 'h'), json_array(40.7, -74, ${land})) WHERE id = '${old1}'`);
const [, cg] = await api(as.token, 'groups', { name: 'Trio', members: [bs.me.id, cs.me.id] });
await A.p.reload(); await A.p.waitForSelector('.tabs'); await openChat(A, cg.group.id); await say(A, 'standard', 'Group, last month');
const oldG = one(`SELECT id FROM pg_gmsgs WHERE sender = '${as.me.id}'`)[0].id;
one(`UPDATE pg_gmsgs SET sent_at = ${t0} WHERE id = '${oldG}'`); one(`UPDATE pg_gdeliv SET deliver_at = ${land}, read_at = ${land + 60e3} WHERE msg_id = '${oldG}'`);
// and this week: Ben's reply, which stays
await B.p.reload(); await B.p.waitForSelector('.tabs'); await openChat(B, as.me.id); await say(B, 'standard', 'This week');
const recent = one(`SELECT id FROM pg_msgs WHERE sender = '${bs.me.id}'`)[0].id;
one(`UPDATE pg_msgs SET sent_at = ${now() - 5 * DAY}, deliver_at = ${now() - 4 * DAY} WHERE id = '${recent}'`);
// old group history and an old admin log line, and a reaction on the old message
one(`INSERT INTO pg_gevents (group_id, at, kind, actor, actor_name) VALUES ('${cg.group.id}', ${now() - 40 * DAY}, 'join', '${cs.me.id}', 'Cal Roy')`);
one(`INSERT INTO pg_admin_log (at, action, target, detail) VALUES (${now() - 200 * DAY}, 'test-email', NULL, 'old'), (${now() - 2 * DAY}, 'test-email', NULL, 'new')`);
one(`INSERT INTO pg_reacts (id, msg_id, sender, recipient, ct, sent_at, deliver_at) VALUES ('r-${old1}', '${old1}', '${bs.me.id}', '${as.me.id}', 'x', ${land}, ${land})`).length;

// what Ann's log says before
await K.tick();
const pick = (l) => ({ sent: l.sent, landed: l.landed, km: Math.round(l.km), hours: Math.round(l.hours), dodged: l.dodged, sheltered: Math.round(l.sheltered), kinds: l.kinds,
  longest: l.longest, badges: l.badges.filter((b) => b.earned).map((b) => b.id).sort(), places: l.passport.places.length });
const [, logA0] = await api(as.token, 'flight-log'), [, logB0] = await api(bs.token, 'flight-log');
const before = pick(logA0);
console.log('before', JSON.stringify(before), 'ben received', logB0.received);

// 1. the cleanup: last month's messages go, this week's stays
await housekeep();
const left = one(`SELECT id FROM pg_msgs`).map((r) => r.id);
ok(!left.includes(old1) && left.includes(recent), 'a month on, a message goes; this week’s stays', JSON.stringify(left));
ok(!one(`SELECT id FROM pg_gmsgs WHERE id = '${oldG}'`).length && !one(`SELECT 1 FROM pg_gdeliv WHERE msg_id = '${oldG}'`).length, 'a group message goes too, with each of its pigeons');
ok(!one(`SELECT 1 FROM pg_reacts WHERE msg_id = '${old1}'`).length, 'and the reactions on it');
const lines = one(`SELECT id, grp, km, dodged, shelter_ms, from_place, to_place FROM pg_flights WHERE sender = '${as.me.id}' ORDER BY grp`);
ok(lines.length === 3 && lines[0].dodged === 1 && Math.round(lines[0].shelter_ms / 3600e3) === 3 && lines.filter((l) => l.grp).length === 2, 'what each pigeon did is kept: one line each (went round storms, 3 hours sheltering)', JSON.stringify(lines));

// (landed 46 days ago, so the clean-up takes it even without a passport stamp)
const b0 = now() - 48 * DAY, b1 = now() - 46 * DAY;
// 1b. one whose way is blurred (a month on, the hourly blur) before the clean-up gets to it: what its way said is kept
one(`INSERT INTO pg_msgs (id, sender, recipient, ct, km, sent_at, deliver_at, notified_at, pigeon, legs) VALUES ('blur1', '${as.me.id}', '${bs.me.id}', 'x', 4000, ${b0}, ${b1}, ${b1}, 'standard',
  json_array(json_array(51.5, -0.1, ${b0}, 's'), json_array(52, -20, ${b0 + 3600e3}, 'h'), json_array(52, -20, ${b0 + 3 * 3600e3}, 'h'), json_array(45, -60, ${b0 + 5 * 3600e3}, 'b'), json_array(40.7, -74, ${b1})))`);
one(`INSERT OR REPLACE INTO pg_meta (k, v) VALUES ('keep_at', '${now()}')`); one("DELETE FROM pg_meta WHERE k = 'blur_at'");
await K.tick();
const blurred = one(`SELECT legs, w_dodged, w_shelter, w_ship FROM pg_msgs WHERE id = 'blur1'`)[0];
ok(blurred && blurred.legs === null && blurred.w_dodged === 1 && Math.round(blurred.w_shelter / 3600e3) === 2 && blurred.w_ship === 1, 'blurred first: its way goes, what it said stays (round storms, 2 hours sheltering, a ship)', JSON.stringify(blurred));
await housekeep();
const kept = one(`SELECT dodged, shelter_ms, ship FROM pg_flights WHERE id = 'blur1'`)[0];
ok(kept && kept.dodged === 1 && Math.round(kept.shelter_ms / 3600e3) === 2 && kept.ship === 1, 'and its line says so', JSON.stringify(kept));
one(`DELETE FROM pg_flights WHERE id = 'blur1'`);       // (so the log below is as it was)

// 2. the flight log, badges and passport don't change
const [, logA1] = await api(as.token, 'flight-log'), [, logB1] = await api(bs.token, 'flight-log');
const after = pick(logA1);
ok(JSON.stringify(after) === JSON.stringify(before), 'Ann’s flight log, badges and passport are just as they were', JSON.stringify(after));
ok(logB1.received === logB0.received, 'Ben’s count of pigeons received is too', `${logB0.received} → ${logB1.received}`);
const trip = logA1.passport.trips?.[old1];
ok(trip && trip.from === 'London' && trip.to === 'New York', 'the passport still says where that journey went', JSON.stringify(trip));

// 3. the chat itself: only this week's
const [, chat] = await api(as.token, `messages?with=${bs.me.id}`);
ok(chat.messages.length === 1 && chat.messages[0].id === recent, 'the chat shows only this week’s message', chat.messages.map((m) => m.id).join(','));
await A.p.reload(); await A.p.waitForSelector('.tabs'); await openChat(A, bs.me.id); await A.p.waitForTimeout(800);
const shown = (await A.p.locator('#screen > .view').innerText()).replace(/\s+/g, ' ');
ok(/This week/.test(shown) && !/From last month/.test(shown), 'and so does the app (even its copy kept on the phone)', '');

// 4. history and logs trimmed
ok(!one(`SELECT 1 FROM pg_gevents WHERE at < ${now() - 35 * DAY}`).length, 'a group’s history over a month old goes');
const logs = one(`SELECT detail FROM pg_admin_log WHERE action = 'test-email'`).map((r) => r.detail);
ok(!logs.includes('old') && logs.includes('new'), 'the admin log keeps six months', JSON.stringify(logs));

// 5. an account unused for a year: an email a week before, then gone
// (their phones closed first: an open app checking in is someone using it)
for (const P of [B, C]) await P.ctx.close();
const yr = 365 * DAY, nearly = now() - yr + 6 * DAY;
one(`UPDATE pg_users SET seen_at = ${nearly}, created_at = ${nearly - DAY} WHERE id = '${cs.me.id}'`); one(`UPDATE pg_sessions SET seen_at = ${nearly} WHERE user_id = '${cs.me.id}'`);
const m0 = mails().length; await housekeep();
const warn = mails().slice(m0).filter((m) => /will be deleted soon/.test(m.subject || '') && JSON.stringify(m.to).includes('cal@example.com'));
ok(warn.length === 1 && /sign in before then/.test(warn[0].text || ''), 'almost a year unused: an email says the account will be deleted, and how to keep it', warn.map((m) => m.subject).join(' | '));
// (a much older one, warned only now, is given a date at least a week away, never one gone by)
ok(!!one(`SELECT 1 FROM pg_users WHERE id = '${cs.me.id}'`).length, 'it isn’t deleted yet');
await housekeep();
ok(mails().slice(m0).filter((m) => /will be deleted soon/.test(m.subject || '')).length === 1, 'and only one email');
// (and a pigeon Ann sent Cal three days ago, landed, plus one still flying to Cal)
one(`INSERT INTO pg_msgs (id, sender, recipient, ct, km, sent_at, deliver_at, notified_at, pigeon) VALUES ('tocal', '${as.me.id}', '${cs.me.id}', 'x', 340, ${now() - 3 * DAY}, ${now() - 3 * DAY + 3600e3}, ${now() - 3 * DAY + 3600e3}, 'standard'),
  ('tocal2', '${as.me.id}', '${cs.me.id}', 'x', 340, ${now() - 3600e3}, ${now() + 3600e3}, NULL, 'standard')`);
// a week on, still unused: deleted
one(`UPDATE pg_users SET warned_at = ${now() - 7 * DAY}, seen_at = ${now() - yr - DAY}, created_at = ${now() - yr - 2 * DAY} WHERE id = '${cs.me.id}'`); one(`UPDATE pg_sessions SET seen_at = ${now() - yr - DAY} WHERE user_id = '${cs.me.id}'`);
await housekeep();
ok(!one(`SELECT 1 FROM pg_users WHERE id = '${cs.me.id}'`).length && !one(`SELECT 1 FROM pg_links WHERE a = '${cs.me.id}' OR b = '${cs.me.id}'`).length, 'a year unused and a week after the email: the account is deleted');
ok(!!one(`SELECT 1 FROM pg_admin_log WHERE action = 'idle-deleted'`).length, 'the admin log says so');
ok(!!one(`SELECT 1 FROM pg_flights WHERE id = '${oldG}:${cs.me.id}' AND recipient IS NULL`).length, 'Ann’s pigeon to Cal stays in her log, unnamed');
ok(!!one(`SELECT 1 FROM pg_flights WHERE id = 'tocal' AND recipient IS NULL AND sender = '${as.me.id}'`).length && !one(`SELECT 1 FROM pg_flights WHERE id = 'tocal2'`).length && !one(`SELECT 1 FROM pg_msgs WHERE id IN ('tocal', 'tocal2')`).length,
  'and so does the one she sent him three days ago (one still flying to him just goes)');
// Ben is warned, then opens the app: kept, and the warning forgotten
one(`UPDATE pg_users SET seen_at = ${nearly}, created_at = ${nearly - DAY} WHERE id = '${bs.me.id}'`); one(`UPDATE pg_sessions SET seen_at = ${nearly} WHERE user_id = '${bs.me.id}'`);
await housekeep();
ok(!!one(`SELECT warned_at FROM pg_users WHERE id = '${bs.me.id}' AND warned_at IS NOT NULL`).length, 'Ben is warned too');
one(`UPDATE pg_users SET seen_at = ${now()} WHERE id = '${bs.me.id}'`);
one(`UPDATE pg_users SET warned_at = ${now() - 8 * DAY} WHERE id = '${bs.me.id}'`);
await housekeep();
ok(!!one(`SELECT 1 FROM pg_users WHERE id = '${bs.me.id}' AND warned_at IS NULL`).length, 'he came back: kept, and the warning forgotten');

// 6. the admin's Storage sheet, on its account's page
const AD = await K.admin(as.me.id);
const actx = await K.b.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
await actx.addCookies([AD.cookie]);
const ad = await actx.newPage();
ad.on('pageerror', (e) => K.errs.push(`admin: ${e.message}`));
await ad.goto(AD.page + '/'); await ad.waitForSelector('section.section:has(h3:text-is("Admin")) .row', { timeout: 20000 }); await ad.waitForTimeout(900);
await ad.click('section.section:has(h3:text-is("Admin")) .row:has(b:text-is("Storage"))');
await ad.waitForFunction(() => /Database/.test(document.querySelector('#sheet')?.innerText || ''), null, { timeout: 30000 }).catch(() => {});
const panel = (await ad.locator('#sheet').innerText()).replace(/\s+/g, ' ');
ok(/Database \d/.test(panel) && /pg_flights 4/.test(panel) && /Messages over 30 days/.test(panel) && /Last run/.test(panel), 'the admin’s Storage: the database’s size, rows per table, what’s waiting to go', panel.slice(0, 240));
await ad.screenshot({ path: `${out}/storage-panel.png` });
console.log('errs', K.errs);
console.log(`FAILS ${K.fails()}`);
process.exit(0);
