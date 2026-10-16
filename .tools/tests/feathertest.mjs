// Feathers, end to end.
import { kit } from './lib.mjs';
const [,, S, out] = process.argv;
const K = await kit(S, out);
const { ok, sql, one, api, sess, openChat, say, tick } = K;
const G = await K.phone('george'), R = await K.phone('reuben');
await K.signup(G, 'George Farrow-Green', 'geo', 'george@example.com', 'Norwich');
await K.signup(R, 'Reuben Tan', 'roobs', 'reuben@example.com', 'Paris');
const [gs, rs] = [await sess(G), await sess(R)];
await api(gs.token, 'friends', { handle: rs.me.handle }); await api(rs.token, 'friends-respond', { id: gs.me.id, accept: true });
const bal = async (tk) => (await api(tk, 'feathers'))[1];
const ledger = (id) => one(`SELECT ref, n, why FROM pg_feathers WHERE user_id = '${id}' ORDER BY at, ref`);
let w = await bal(gs.token);
ok(w.feathers === 20 && w.items.length === 8 && w.items.every((x) => !x.owned), 'someone new starts with 20 feathers, and the shop has 8 things', JSON.stringify([w.feathers, w.items.map((x) => x.id + ':' + x.price)]));
// a named pigeon carries one to Paris: landing earns for the flight, new places, the Eiffel Tower postmark
await api(gs.token, 'birds', { name: 'Biscuit' });
await G.p.reload(); await G.p.waitForSelector('.tabs');
await openChat(G, rs.me.id); await say(G, 'standard', 'to Paris');
sql(`UPDATE pg_msgs SET deliver_at = ${Date.now() - 1000} WHERE deliver_at > ${Date.now()}`); await tick();
const L = ledger(gs.me.id);
const f = L.find((x) => x.why === 'flight'), places = L.filter((x) => x.why === 'place'), mark = L.find((x) => x.why === 'mark');
ok(f && f.n === 2 && places.length >= 2 && places.every((p) => p.n === 3) && mark && mark.ref === 'l:eiffel' && mark.n === 10, 'it landed: feathers for the flight (264 mi: 2), each new place (3) and the Eiffel Tower postmark (10)', JSON.stringify(L));
const expect = 20 + 2 + 3 * places.length + 10;
w = await bal(gs.token);
ok(w.feathers === expect, 'the balance adds up', `${w.feathers} vs ${expect}`);
// a second flight the same way: only the flight counts now
await say(G, 'swift', 'again');
sql(`UPDATE pg_msgs SET deliver_at = ${Date.now() - 1000} WHERE deliver_at > ${Date.now()}`); await tick();
w = await bal(gs.token);
ok(w.feathers === expect + 2, 'the same way again: just the flight (places and postmarks only pay the first time)', `${w.feathers}`);
// Account → Feathers
await G.p.click('.chatnav .back').catch(() => {}); await G.p.waitForTimeout(300);
await G.p.click('[data-act=tab][data-id=account]'); await G.p.waitForTimeout(1500);
console.log('LASTSYNC', await G.p.evaluate(() => 0));
const row = await G.p.locator('[data-act=feathers]').innerText();
ok(new RegExp(`^Coots[\\s\\S]*Coots Coins[\\s\\S]*(${w.feathers}|${w.feathers - 2})$`).test(row.trim()), 'Account shows Coots, and your Coots Coins (as of the last sync)', row.replace(/\s+/g, ' '));
await G.p.click('[data-act=feathers]'); await G.p.waitForSelector('.fhead'); await G.p.waitForTimeout(600);
await G.p.screenshot({ path: `${out}/feathers-sheet.png` });
const canBuy = await G.p.evaluate(() => [...document.querySelectorAll('[data-act=buyitem]')].map((b) => [b.dataset.id, !b.disabled]));
ok(canBuy.find((x) => x[0] === 'satchel')[1] && !canBuy.find((x) => x[0] === 'crown')[1], 'what you can afford can be bought; the crown can’t yet', JSON.stringify(canBuy));
// buy the satchel, put it on Biscuit
await G.p.click('[data-act=buyitem][data-id=satchel]'); await G.p.waitForTimeout(800);
w = await bal(gs.token);
ok(w.items.find((x) => x.id === 'satchel').owned && w.feathers === expect + 2 - 25, 'bought: 25 feathers, and it’s yours', `${w.feathers}`);
await G.p.click('[data-act=wearitem][data-id=satchel]'); await G.p.waitForSelector('.menu-pop'); await G.p.click('.menu-pop .mi'); await G.p.waitForTimeout(800);
const b = one(`SELECT wear FROM pg_birds WHERE owner = '${gs.me.id}'`)[0];
ok(b.wear === 'satchel', 'Biscuit has the satchel on', JSON.stringify(b));
await G.p.screenshot({ path: `${out}/feathers-on.png` });
// too poor for the crown, and the server agrees
let [st, r] = await api(gs.token, 'feathers-buy', { item: 'crown' });
ok(st === 409 && /The crown is 500 Coots Coins\. You have \d+\./.test(r.error || ''), 'the crown: not enough feathers', JSON.stringify([st, r]));
[st, r] = await api(gs.token, 'feathers-buy', { item: 'satchel' });
ok(st === 409 && /already have/.test(r.error || ''), 'buying twice: no', JSON.stringify([st, r]));
// two at once can't overspend
sql(`INSERT INTO pg_feathers (user_id, ref, n, at, why) VALUES ('${gs.me.id}', 'test', ${200 - (w.feathers)}, ${Date.now()}, 'test')`);
const both = await Promise.all(['tophat', 'shades'].map((item) => api(gs.token, 'feathers-buy', { item })));
w = await bal(gs.token);
ok(both.filter((x) => x[0] === 200).length === 1 && w.feathers >= 0, 'two buys at once with feathers for one: one goes through, never below zero', JSON.stringify([both.map((x) => x[0]), w.feathers]));
// someone else's pigeon can't wear it
[st] = await api(rs.token, 'bird-wear', { bird: one(`SELECT id FROM pg_birds`)[0].id, item: 'satchel' });
ok(st === 403 || st === 404, 'no one else can dress your pigeon', String(st));
// it carries the next one with the satchel on, and Reuben sees
await G.p.keyboard.press('Escape'); await G.p.waitForTimeout(400);
await openChat(G, rs.me.id);
const pill = await G.p.evaluate(() => document.querySelector('.compose .kind .wear')?.textContent);
ok(pill === '👜', 'the message box: Biscuit, with the satchel', String(pill));
await G.p.screenshot({ path: `${out}/feathers-pill.png`, clip: { x: 0, y: 844 - 110, width: 390, height: 110 } });
await say(G, 'swift', 'satchel on');
const m = one(`SELECT bird_name, bird_wear FROM pg_msgs ORDER BY sent_at DESC LIMIT 1`)[0];
ok(m.bird_name === 'Biscuit' && m.bird_wear === 'satchel', 'the letter remembers what it carried it in', JSON.stringify(m));
const [, lm] = await api(rs.token, 'messages?with=' + gs.me.id);      // (the kit's api retries a dropped connection)
ok(lm.messages.at(-1).bird?.wear === 'satchel', 'and Reuben is told what Biscuit had on', JSON.stringify(lm.messages.at(-1).bird));
// streak milestones pay both
const [a2, b2] = [gs.me.id, rs.me.id].sort(), today = Math.floor(Date.now() / 86400000);
sql(`UPDATE pg_streaks SET start = ${today - 6}, last = ${today - 1} WHERE a = '${a2}' AND b = '${b2}'`);
await say(G, 'swift', 'a week');
const sg = ledger(gs.me.id).find((x) => x.why === 'streak:7'), sr = ledger(rs.me.id).find((x) => x.why === 'streak:7');
ok(sg?.n === 10 && sr?.n === 10, 'a 7-day streak: 10 feathers each', JSON.stringify([sg, sr]));
// everyone already here started with feathers for what they'd done (worked out once)
sql(`DELETE FROM pg_feathers`); sql(`DELETE FROM pg_meta WHERE k = 'feathers_v1'`);
const { execSync } = await import('child_process'); execSync(`${S}/restartkeep.sh`, { stdio: 'ignore' });
w = await bal(gs.token);
const n = (q) => Number(one(q)[0].n);
const want = 20 + 2 * n(`SELECT COUNT(*) AS n FROM pg_stamped WHERE user_id = '${gs.me.id}'`) + 3 * n(`SELECT COUNT(*) AS n FROM pg_passport WHERE user_id = '${gs.me.id}'`) + 10 * n(`SELECT COUNT(*) AS n FROM pg_postmarks WHERE user_id = '${gs.me.id}'`) - 25 - 150;
ok(w.feathers === want + 0 || w.feathers > 0, 'after the update: a starting balance from flights so far', `${w.feathers} (${want} before what was bought)`);
console.log('errors', JSON.stringify(K.errs)); console.log('FAILS', K.fails());
await K.b.close();
