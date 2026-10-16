// Everything said about one pigeon agrees: the card, the chat list, the map's title and the pushes.
// (Each part sets a pigeon up in the state that once made two of them disagree.)
import { kit } from './lib.mjs';
import { randomUUID } from 'crypto';
const [,, S, out] = process.argv;
const K = await kit(S, out);
const { ok, one, api, sess, openChat, say } = K;
const kA = await K.makeKeys(), kB = await K.makeKeys();
const A = await K.phone('ann', kA), B = await K.phone('ben', kB), C = await K.phone('cal'), D = await K.phone('dee');
await K.signup(A, 'Ann Ito', 'ann', 'ann@example.com', 'London');
await K.signup(B, 'Ben Ode', 'ben', 'ben@example.com', 'New York');
await K.signup(C, 'Cal Roy', 'cal', 'cal@example.com', 'Paris');
await K.signup(D, 'Dee Fox', 'dee', 'dee@example.com', 'Rome');
const [as, bs, cs, ds] = [await sess(A), await sess(B), await sess(C), await sess(D)];
for (const x of [bs, cs, ds]) { await api(as.token, 'friends', { handle: x.me.handle }); await api(x.token, 'friends-respond', { id: as.me.id, accept: true }); }
await K.pushOn(A); await K.pushOn(B);
const H = 3600e3, now = () => Date.now();
const openMap = async (P, id) => { await P.p.evaluate((id) => { const x = document.createElement('button'); x.hidden = true; x.dataset.act = 'map'; x.dataset.id = id; document.querySelector('#screen').append(x); x.click(); x.remove(); }, id); await P.p.waitForTimeout(1800); };
const card = async (P) => (await P.p.locator('body').innerText()).replace(/\s+/g, ' ');
const closeSheet = async (P) => { await P.p.keyboard.press('Escape'); await P.p.waitForTimeout(400); };

// 1. across the Atlantic by ship: 5 days, mostly at sea. Its speed is its flying, not 3 mph
await A.p.reload(); await A.p.waitForSelector('.tabs'); await openChat(A, bs.me.id); await say(A, 'standard', 'By sea, apparently');
const m1 = one(`SELECT id, sent_at FROM pg_msgs WHERE sender = '${as.me.id}' AND recipient = '${bs.me.id}'`)[0];
const t0 = now() - 5 * 24 * H, port = t0 + 2 * H, sail = t0 + 3 * H, ashore = t0 + 5 * 24 * H - 3 * H;
one(`UPDATE pg_msgs SET sent_at = ${t0}, deliver_at = ${now() - 60e3}, km = 600, legs = json_array(json_array(50.9, -1.4, ${port}, 'b', 'Southampton'), json_array(50.9, -1.4, ${sail}, 'b'), json_array(40.7, -74, ${ashore}, 'b', 'New York')) WHERE id = '${m1.id}'`);
await A.p.reload(); await A.p.waitForSelector('.tabs'); await openChat(A, bs.me.id); await openMap(A, m1.id);
const c1 = await card(A), avg = Number((c1.match(/averaged (\d+) mph/) || [])[1]);
ok(avg > 30, 'by ship: it averaged its flying speed, not the days at sea', (c1.match(/Flew [^·]+· averaged [^A-Z]*/) || [''])[0]);
await closeSheet(A);

// 2. called back: the card says so (not "Lost on the way", not Pigeon Death)
await openChat(A, cs.me.id); await say(A, 'standard', 'Never mind');
const m2 = one(`SELECT id FROM pg_msgs WHERE sender = '${as.me.id}' AND recipient = '${cs.me.id}'`)[0];
await api(as.token, 'recall', { id: m2.id });
await A.p.reload(); await A.p.waitForSelector('.tabs'); await openChat(A, cs.me.id); await openMap(A, m2.id);
const c2 = await card(A);
ok(/Called back/.test(c2) && !/Lost on the way|Pigeon Death/.test(c2), 'called back: the card says “Called back”', (c2.match(/Called back[^.]{0,40}/) || [''])[0]);
await closeSheet(A);

// 3. resting with a friend on the way: a stopover, with no speed
await openChat(A, ds.me.id); await say(A, 'standard', 'Via Cal');
const m3 = one(`SELECT id, sent_at, deliver_at FROM pg_msgs WHERE sender = '${as.me.id}' AND recipient = '${ds.me.id}'`)[0];
one(`UPDATE pg_msgs SET via = '${cs.me.id}', via_place = 'Paris', via_at = ${now() - 10 * 60e3}, via_off = ${now() + 50 * 60e3}, deliver_at = ${now() + 3 * H},
  legs = json_array(json_array(48.86, 2.35, ${now() - 10 * 60e3}), json_array(48.86, 2.35, ${now() + 50 * 60e3})) WHERE id = '${m3.id}'`);
await A.p.reload(); await A.p.waitForSelector('.tabs'); await openChat(A, ds.me.id); await openMap(A, m3.id);
const c3 = await card(A);
ok(/Stopover/.test(c3) && !/\d+ mph/.test(c3), 'on a stopover: it says so, and shows no speed', (c3.match(/Stopover/) || ['-'])[0]);
const ph3 = await A.p.evaluate(() => [...document.querySelectorAll('canvas')].flatMap((c) => (c._birds || []).map((b) => b.phase)));
ok(ph3.includes('rest') && !ph3.some((x) => x === 'cruise' || x === 'up' || x === 'down'), 'on a stopover: the map’s pigeon has its wings folded, not flapping', JSON.stringify(ph3));
await closeSheet(A);

// 4. a group pigeon lost all round: the chat list doesn't show what it said as if it had gone
const [, cg] = await api(as.token, 'groups', { name: 'Trio', members: [bs.me.id, cs.me.id, ds.me.id] });
await A.p.reload(); await A.p.waitForSelector('.tabs'); await openChat(A, cg.group.id); await say(A, 'standard', 'Hello all');
const gm = one(`SELECT id FROM pg_gmsgs WHERE sender = '${as.me.id}'`)[0];
one(`UPDATE pg_gdeliv SET lost_at = ${now() - 30e3}, notified_at = NULL WHERE msg_id = '${gm.id}'`);
await A.p.click('[data-act=tab][data-id=messages]'); await A.p.reload(); await A.p.waitForSelector('.tabs'); await A.p.waitForTimeout(800);
const list = await card(A);
ok(/Your pigeons were lost on the way/.test(list) && !/You: Hello all/.test(list), 'all lost: the chat list says so', (list.match(/Your pigeons were lost[^·]*/) || ['-'])[0]);

// 5. …and its sender hears it once, naming all three
const t5 = now(); await K.tick();
const lostPush = (await K.allPushes(kA, 'ann', t5)).filter((x) => /didn’t make it/.test(x.body || ''));
ok(lostPush.length === 1 && /3 of your pigeons|Ben, Cal and Dee|to Ben, Cal and Dee/.test(lostPush[0].body), 'a group’s losses: one push for all three', lostPush.map((x) => x.body).join(' | '));

// 6. lost, but another of yours has flown since: no "it's your turn again"
await openChat(A, bs.me.id); await say(A, 'swift', 'Second try');
const first = one(`SELECT id FROM pg_msgs WHERE sender = '${as.me.id}' AND recipient = '${bs.me.id}' ORDER BY sent_at LIMIT 1`)[0];
one(`UPDATE pg_msgs SET lost_at = ${now() - 30e3}, notified_at = NULL, deliver_at = ${now() + H} WHERE id = '${first.id}'`);
const t6 = now(); await K.tick();
const p6 = (await K.allPushes(kA, 'ann', t6)).filter((x) => /didn’t make it/.test(x.body || ''));
ok(p6.length === 1 && !/your turn again/.test(p6[0].body), 'lost while a later one flies: no “your turn again”', p6.map((x) => x.body).join(' | '));

// 7. Ben blocks Ann: her pigeon's weather on the way isn't news to him any more
await openChat(A, bs.me.id).catch(() => {});
const swift = one(`SELECT id FROM pg_msgs WHERE sender = '${as.me.id}' AND recipient = '${bs.me.id}' AND pigeon = 'swift'`)[0];
await api(bs.token, 'block', { id: as.me.id });
one(`UPDATE pg_msgs SET wx = json_object('k', 'storms', 'lat', 50, 'lon', -30), wx_ms = ${2 * H}, wx_at = ${now() - 30e3}, wx_told = NULL, deliver_at = ${now() + 6 * H} WHERE id = '${swift.id}'`);
const t7 = now(); await K.tick();
const toBen = (await K.allPushes(kB, 'ben', t7)).filter((x) => /flew into/.test(x.body || '')), toAnn = (await K.allPushes(kA, 'ann', t7)).filter((x) => /flew into/.test(x.body || ''));
ok(toBen.length === 0 && toAnn.length === 1, 'blocked: the sender still hears of the storm, the blocker doesn’t', JSON.stringify({ ben: toBen.length, ann: toAnn.length }));

// 8. the map's title follows the flight: "Pigeon in Flight", then "The Flight" once it's down
await openChat(A, ds.me.id);
one(`UPDATE pg_msgs SET via = NULL, legs = NULL, deliver_at = ${now() + 20e3} WHERE id = '${m3.id}'`);
await A.p.reload(); await A.p.waitForSelector('.tabs'); await openChat(A, ds.me.id); await openMap(A, m3.id);
const before = await A.p.locator('.sheet header h2').innerText(); await A.p.waitForTimeout(24000);
const after = await A.p.locator('.sheet header h2').innerText();
ok(before === 'Pigeon in Flight' && after === 'The Flight', 'the map’s title follows it down', `${before} → ${after}`);

// 9. a group's pigeons lost in two rounds: the second push (which replaces the first) names both,
//    and the In the air card counts the lost one (Ben blocked Ann, so it flies to Cal and Dee: "0 of 2 landed · 1 lost")
await A.p.reload(); await A.p.waitForSelector('.tabs'); await openChat(A, cg.group.id); await say(A, 'standard', 'Round two');
const g2 = one(`SELECT id FROM pg_gmsgs WHERE sender = '${as.me.id}' ORDER BY sent_at DESC LIMIT 1`)[0];
one(`UPDATE pg_gdeliv SET lost_at = ${now() - 30e3}, notified_at = NULL WHERE msg_id = '${g2.id}' AND user_id = '${cs.me.id}'`);
const t9 = now(); await K.tick();
await A.p.click('[data-act=tab][data-id=messages]'); await A.p.reload(); await A.p.waitForSelector('.tabs'); await A.p.waitForTimeout(1500);
const sub9 = await A.p.locator('.acard.grp .asub').first().innerText().catch(() => '-');
ok(/^0 of 2 landed · 1 lost$/.test(sub9.trim()), 'In the air: the group card counts the lost one too', sub9);
one(`UPDATE pg_gdeliv SET lost_at = ${now()}, notified_at = NULL WHERE msg_id = '${g2.id}' AND user_id = '${ds.me.id}'`); await A.p.waitForTimeout(1000);
await K.tick();
const p9 = (await K.allPushes(kA, 'ann', t9)).filter((x) => /didn’t make it/.test(x.body || ''));
ok(p9.length === 2 && /Cal and Dee|2 of your pigeons/.test(p9[1].body) && !/Ben/.test(p9[1].body), 'lost in two rounds: the later push counts both', p9.map((x) => x.body).join(' | '));
console.log('errs', K.errs);
console.log(`FAILS ${K.fails()}`);
process.exit(0);
