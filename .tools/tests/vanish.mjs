// Disappearing messages, one to one and in a group.
import { kit } from './lib.mjs';
const [,, S, out] = process.argv;
const K = await kit(S, out);
const { ok, sql, one, api, sess, openChat, say, tick } = K;
const DAY = 864e5;
const G = await K.phone('george'), M = await K.phone('mira'), P = await K.phone('pat');
await K.signup(G, 'George Farrow-Green', 'geo', 'george@example.com', 'Norwich');
await K.signup(M, 'Mira Okafor', 'mira', 'mira@example.com', 'Paris');
await K.signup(P, 'Pat Lee', 'pat', 'pat@example.com', 'London');
const [gs, ms, ps] = [await sess(G), await sess(M), await sess(P)];
for (const x of [ms, ps]) { await api(gs.token, 'friends', { handle: x.me.handle }); await api(x.token, 'friends-respond', { id: gs.me.id, accept: true }); }
await G.p.reload(); await G.p.waitForSelector('.tabs');
// a message before it's on: stays
await openChat(G, ms.me.id); await say(G, 'swift', 'before the timer');
// George turns it on from Mira's info sheet: 1 day
await G.p.click('.chatwho'); await G.p.waitForSelector('.sheet [data-act=vanishask]');
await G.p.screenshot({ path: `${out}/vanish-sheet.png` });
await G.p.click('.sheet [data-act=vanishask]'); await G.p.waitForSelector('.asheet [data-act=vanishset]');
await G.p.screenshot({ path: `${out}/vanish-choose.png` });
await G.p.click(`.asheet [data-act=vanishset][data-id="${ms.me.id}|${DAY}"]`); await G.p.waitForTimeout(1500);
ok(/"ms": 86400000/.test(sql("SELECT ms FROM pg_vanish")), 'turned on: 1 day after reading');
await G.p.keyboard.press('Escape'); await G.p.waitForTimeout(500);
ok(/disappear 1 day after they’re read \(or land, if read receipts are off\) · set by you/.test(await G.p.locator('.msgs').innerText()), 'George’s chat says so', (await G.p.locator('.vanishline').innerText().catch(() => '')));
await say(G, 'swift', 'this one disappears');
const row = one("SELECT id, vanish FROM pg_msgs WHERE vanish IS NOT NULL")[0];
ok(row && row.vanish === DAY, 'a message sent after carries the setting');
sql(`UPDATE pg_msgs SET deliver_at = ${Date.now() - 1000}`); await tick();
await M.p.reload(); await M.p.waitForSelector('.tabs'); await openChat(M, gs.me.id);
await M.p.waitForFunction(() => /this one disappears/.test(document.querySelector('.msgs')?.innerText || ''), null, { timeout: 15000 }).catch(() => {});
ok(/set by George/.test(await M.p.locator('.msgs').innerText()), 'Mira’s chat says who set it');
await M.p.screenshot({ path: `${out}/vanish-chat.png` });
ok(!!one(`SELECT read_at FROM pg_msgs WHERE id = '${row.id}'`)[0].read_at, 'Mira reads it');
// a day after she read it: hidden on her phone at once, then wiped by the server
sql(`UPDATE pg_msgs SET read_at = ${Date.now() - DAY - 5000} WHERE id = '${row.id}'`);
await M.p.reload(); await M.p.waitForSelector('.tabs'); await openChat(M, gs.me.id); await M.p.waitForTimeout(1500);
let txt = await M.p.locator('.msgs').innerText();
ok(!/this one disappears/.test(txt) && /before the timer/.test(txt), 'its time up: gone from Mira’s chat (the older one stays)');
await tick();
const gone = one(`SELECT ct, gone_at, km FROM pg_msgs WHERE id = '${row.id}'`)[0];
ok(gone.ct === '' && gone.gone_at && gone.km > 0, 'the server wipes what was said, and keeps the flight', JSON.stringify({ ...gone, ct: gone.ct.length }));
const [, list] = await api(gs.token, `messages?with=${ms.me.id}`);
ok(!list.messages.some((m) => m.id === row.id) && list.messages.length === 1, 'George’s chat no longer has it either');
await G.p.reload(); await G.p.waitForSelector('.tabs'); await openChat(G, ms.me.id); await G.p.waitForTimeout(1200);
ok(!/this one disappears/.test(await G.p.locator('.msgs').innerText()), 'and it’s gone from George’s phone');
// with either one's read receipts off, its time counts from landing, read or not (its going would say when it was read);
// one that landed before they went off, from then, so turning them off doesn't wipe it at once
await say(G, 'swift', 'gone unread');
const quiet = one("SELECT id FROM pg_msgs WHERE vanish IS NOT NULL AND gone_at IS NULL")[0];
sql(`UPDATE pg_msgs SET deliver_at = ${Date.now() - DAY - 5000}, read_at = NULL WHERE id = '${quiet.id}'`);
const off = await fetch(K.BASE + '/api/pigeon/me', { method: 'PATCH', headers: { Authorization: 'Bearer ' + ms.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ receipts: false }) });
await tick();
ok(off.status === 200 && !one(`SELECT gone_at FROM pg_msgs WHERE id = '${quiet.id}'`)[0].gone_at, 'Mira turns read receipts off: it isn’t wiped at once', String(off.status));
const offAt = one(`SELECT no_receipts_at FROM pg_users WHERE id = '${ms.me.id}'`)[0].no_receipts_at;
const qv = (await api(gs.token, `messages?with=${ms.me.id}`))[1].messages.find((m) => m.id === quiet.id);
ok(qv && !qv.readAt && offAt && qv.vanishAt === offAt + DAY, 'George’s phone is told when it goes: a day after she turned them off', JSON.stringify({ vanishAt: qv?.vanishAt, offAt }));
sql(`UPDATE pg_users SET no_receipts_at = ${Date.now() - DAY - 1000} WHERE id = '${ms.me.id}'`);
// (its time up, not yet wiped: George's phone hides it already, by that; no tick meanwhile)
sql(`INSERT OR REPLACE INTO pg_meta (k, v) VALUES ('tick', '${Date.now()}')`);
await G.p.reload(); await G.p.waitForSelector('.tabs'); await openChat(G, ms.me.id);
// (the phone's own copy of the chat shows first, from before; it's gone once the chat as it is now comes in)
await G.p.waitForFunction(() => !/gone unread/.test(document.querySelector('.msgs')?.innerText || ''), null, { timeout: 6000 }).catch(() => {});
{ const shown = /gone unread/.test(await G.p.locator('.msgs').innerText()), wiped = one(`SELECT gone_at FROM pg_msgs WHERE id = '${quiet.id}'`)[0].gone_at;
  ok(!shown && !wiped, 'its time up: gone from George’s phone before the server wipes it', JSON.stringify({ shown, wiped })); }
await tick();
const q = one(`SELECT ct, gone_at FROM pg_msgs WHERE id = '${quiet.id}'`)[0];
ok(q.gone_at && q.ct === '', 'read receipts off: wiped a day after that, though unread', JSON.stringify({ ...q, ct: q.ct.length }));
const [, sy] = await api(ms.token, 'sync');
ok(!sy.friends.find((f) => f.id === gs.me.id)?.unread, 'and it isn’t counted as unread');
sql(`UPDATE pg_users SET no_receipts = 0, no_receipts_at = NULL WHERE id = '${ms.me.id}'`);
// turned off: new ones stay
const [st] = await api(ms.token, 'vanish', { with: gs.me.id, ms: 0 });
ok(st === 200 && !/"ms": 86400000/.test(sql("SELECT ms FROM pg_vanish")), 'Mira can turn it off');
const [st2] = await api(ms.token, 'vanish', { with: gs.me.id, ms: 12345 });
ok(st2 === 400, 'only off, 1, 7 or 30 days', String(st2));
const [st3] = await api(ps.token, 'vanish', { with: ms.me.id, ms: DAY });
ok(st3 === 403, 'only between friends', String(st3));
// ---- a group ----
const [, cg] = await api(gs.token, 'groups', { name: 'Book Club', members: [ms.me.id, ps.me.id] });
const gid = cg.group.id;
const [gst] = await api(ps.token, 'group-vanish', { id: gid, ms: 7 * DAY });
ok(gst === 200, 'anyone in a group can turn it on');
const keys = Object.fromEntries([gs, ms, ps].map((s) => [s.me.id, 'k'.repeat(40)])), mid = crypto.randomUUID();
await api(gs.token, 'group-messages', { id: mid, group: gid, body: 'x'.repeat(40), keys, pigeon: 'swift' });
ok(one(`SELECT vanish FROM pg_gmsgs WHERE id = '${mid}'`)[0].vanish === 7 * DAY, 'a group message carries it');
await G.p.reload(); await G.p.waitForSelector('.tabs'); await openChat(G, gid); await G.p.waitForTimeout(1000);
ok(/Pat set messages to disappear 7 days after they’re read/.test(await G.p.locator('.msgs').innerText()), 'the group chat shows who set it');
await G.p.screenshot({ path: `${out}/vanish-group.png` });
sql(`UPDATE pg_gdeliv SET deliver_at = ${Date.now() - 1000}, read_at = ${Date.now() - 8 * DAY} WHERE msg_id = '${mid}' AND user_id = '${ms.me.id}'`); await tick();
ok(!one(`SELECT gone_at FROM pg_gmsgs WHERE id = '${mid}'`)[0].gone_at, 'not while someone hasn’t read it yet');
// (Mira read it 8 days ago, Pat not yet: her phone keeps it, as the server does, rather than going by her own read)
await M.p.reload(); await M.p.waitForSelector('.tabs'); await openChat(M, gid); await M.p.waitForTimeout(1500);
ok(await M.p.locator(`.msgs [data-key^="m:${mid}"]`).count() > 0, 'and it’s still in Mira’s group chat');
sql(`UPDATE pg_gdeliv SET deliver_at = ${Date.now() - 1000}, read_at = ${Date.now() - 8 * DAY} WHERE msg_id = '${mid}'`); await tick();
const gg = one(`SELECT body, sender_key, gone_at FROM pg_gmsgs WHERE id = '${mid}'`)[0];
ok(gg.gone_at && gg.body === '' && gg.sender_key === '' && !/k{40}/.test(sql(`SELECT wrap FROM pg_gdeliv WHERE msg_id = '${mid}'`)), 'everyone read it a week ago: wiped');
const [, gl] = await api(gs.token, `group-messages?id=${gid}`);
ok(!gl.messages.some((m) => m.id === mid), 'and gone from the group chat');
// with anyone's read receipts off, a week after the last of its pigeons landed, read or not
sql(`UPDATE pg_users SET no_receipts = 1 WHERE id = '${ps.me.id}'`);
const mid2 = crypto.randomUUID();
const [gs2] = await api(gs.token, 'group-messages', { id: mid2, group: gid, body: 'y'.repeat(40), keys, pigeon: 'swift' });
sql(`UPDATE pg_gdeliv SET deliver_at = ${Date.now() - 7 * DAY - 5000}, read_at = NULL WHERE msg_id = '${mid2}'`);
const gv2 = (await api(gs.token, `group-messages?id=${gid}`))[1].messages?.find((m) => m.id === mid2), landed = one(`SELECT MAX(deliver_at) AS d FROM pg_gdeliv WHERE msg_id = '${mid2}'`)[0].d;
ok(gv2?.vanishAt === landed + 7 * DAY, 'George’s phone is told when it goes', JSON.stringify({ vanishAt: gv2?.vanishAt, landed }));
await tick();
ok(gs2 === 200 && !!one(`SELECT gone_at FROM pg_gmsgs WHERE id = '${mid2}'`)[0]?.gone_at, 'read receipts off in the group: wiped a week after landing, though unread', String(gs2));
console.log(`FAILS ${K.fails()}`); process.exit(0);
