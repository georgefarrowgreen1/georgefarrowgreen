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
ok(/disappear 1 day after they’re read · set by you/.test(await G.p.locator('.msgs').innerText()), 'George’s chat says so', (await G.p.locator('.vanishline').innerText().catch(() => '')));
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
console.log(`FAILS ${K.fails()}`); process.exit(0);
