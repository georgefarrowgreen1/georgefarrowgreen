// Pigeons follow you to another world: Mira (Paris) leaves for the Moon, then Mars, then a new spot
// on Mars, then home, while Reuben's pigeons (one to one, and in a group) are on their way to her.
import { kit } from './lib.mjs';
const [,, S, out] = process.argv;
const K = await kit(S, out);
const { ok, one, api, sess, openChat, say } = K;
const kR = await K.makeKeys(), kM = await K.makeKeys();
const R = await K.phone('reuben', kR), M = await K.phone('mira', kM), Q = await K.phone('quinn');
await K.signup(R, 'Reuben Tan', 'reuben', 'reuben@example.com', 'London');
await K.signup(M, 'Mira Okafor', 'mira', 'mira@example.com', 'Paris');
await K.signup(Q, 'Quinn Lee', 'quinn', 'quinn@example.com', 'Rome');
const [rs, ms, qs] = [await sess(R), await sess(M), await sess(Q)];
await K.pushOn(R); await K.pushOn(M);
for (const [a, b] of [[rs, ms], [rs, qs], [ms, qs]]) { await api(a.token, 'friends', { handle: b.me.handle }); await api(b.token, 'friends-respond', { id: a.me.id, accept: true }); }
const move = (tk, body) => fetch(K.BASE + '/api/pigeon/me', { method: 'PATCH', headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
const row = (id) => one(`SELECT sent_at, deliver_at, km, to_lat, from_lat, legs, moon, to_place FROM pg_msgs WHERE id = '${id}'`)[0];
const grow = () => one(`SELECT d.deliver_at, d.to_lat, d.moon, d.to_place FROM pg_gdeliv d JOIN pg_gmsgs m ON m.id = d.msg_id WHERE m.sender = '${rs.me.id}' AND d.user_id = '${ms.me.id}'`)[0];
const H = 3600e3;

// Reuben sends Mira a standard pigeon (London to Paris: a couple of hours), and one to a group with her and Quinn
await R.p.reload(); await R.p.waitForSelector('.tabs');
await openChat(R, ms.me.id); await say(R, 'standard', 'Bring back a rock');
const mid = one(`SELECT id FROM pg_msgs WHERE sender = '${rs.me.id}' AND recipient = '${ms.me.id}'`)[0].id;
const [, cg] = await api(rs.token, 'groups', { name: 'Book Club', members: [ms.me.id, qs.me.id] }); const gid = cg.group.id;
await R.p.reload(); await R.p.waitForSelector('.tabs'); await openChat(R, gid); await say(R, 'standard', 'Chapter 4 by Sunday?');
// a little way into the flight
one(`UPDATE pg_msgs SET sent_at = sent_at - 1800000, deliver_at = deliver_at - 1800000 WHERE id = '${mid}'`);
const r0 = row(mid), g0 = grow();
ok(r0 && r0.to_lat != null && !r0.moon && g0 && g0.to_lat != null, 'two Earth pigeons on their way to Mira', JSON.stringify({ to: r0?.to_place, lands: Math.round((r0?.deliver_at - Date.now()) / 60e3) + ' min' }));

// 1. Mira goes to the Moon: each is handed to a lunar pigeon from where it is
let t = Date.now(); await move(ms.token, { moon: { lat: -43.3, lon: -11.4 } });
const r1 = row(mid), m1 = JSON.parse(r1.moon || 'null'), g1 = grow(), gm1 = JSON.parse(g1.moon || 'null');
ok(m1 && m1.hand === 1 && m1.k === 'trip' && m1.pk === 'lunar' && m1.from.b === 'earth' && m1.to.b === 'moon' && r1.to_lat == null && r1.from_lat == null && r1.legs == null,
  'one to one: handed to a lunar pigeon over Europe, off to Tycho', JSON.stringify({ from: m1?.from?.place, to: m1?.to?.place }));
ok(Math.abs(m1.t0 - t) < 60e3 && r1.deliver_at - t > 2 * 24 * H && r1.deliver_at - t < 5 * 24 * H, 'it lands in about three days (the Moon is that far)', `${((r1.deliver_at - t) / H).toFixed(1)} h`);
ok(gm1 && gm1.hand === 1 && gm1.to.b === 'moon' && g1.to_lat == null, 'the group pigeon follows her too', JSON.stringify({ to: gm1?.to?.place }));
ok(Array.isArray(m1.ground) && m1.ground.length >= 2 && m1.ground[0][0] > 51 && m1.ground.at(-1)[2] === m1.t0, 'it keeps the way it flew on Earth, for the passport', JSON.stringify(m1.ground?.map((g) => g.slice(0, 2))));
await R.p.waitForTimeout(1500);
const rp = (await K.allPushes(kR, 'reuben', t - 1000)).map((x) => x.body || '').join(' | '), mp = (await K.allPushes(kM, 'mira', t - 1000)).map((x) => x.body || '').join(' | ');
ok(/Your pigeon was handed to a lunar pigeon( over .+)?: (Mira’s|they’ve) gone to the Moon\. It now lands in \d+d/.test(rp), 'Reuben hears how it followed her', rp.slice(0, 200));
ok(/2 pigeons on their way to you are following you to the Moon/.test(mp), 'Mira hears they’re following her', mp.slice(0, 200));

// Reuben watches it: the trip sheet, with the hand-off as its first moment
await R.p.reload(); await R.p.waitForSelector('.tabs'); await openChat(R, ms.me.id);
await R.p.click(`[data-mid="${mid}"]`); await R.p.waitForTimeout(400);
await R.p.click('[data-act=map]').catch(() => {}); await R.p.waitForSelector('.moonsky', { timeout: 10000 }); await R.p.waitForTimeout(1500);
const steps1 = await R.p.locator('.mcsteps').innerText();
ok(/Handed to a lunar pigeon over .+: they’d left the Earth/.test(steps1), 'the trip says where it was handed on', steps1.split('\n')[0]);
await R.p.screenshot({ path: `${out}/1-handed-to-lunar.png` });
await R.p.click('.sheet header [data-act=close]'); await R.p.waitForTimeout(400);

// 2. then Mars: it can't turn round in space, so it gets to Tycho and is relayed on by laser
t = Date.now(); await move(ms.token, { moon: { lat: 18.4, lon: 77.5, body: 'mars' } });
const r2 = row(mid), m2 = JSON.parse(r2.moon);
ok(m2.prev && m2.prev.k === 'trip' && m2.k === 'laser' && m2.pk === 'laser' && m2.from.b === 'moon' && m2.to.b === 'mars' && m2.t0 === r1.deliver_at,
  'Mars: on to Tycho first, then relayed by laser', JSON.stringify({ relayFrom: m2.from.place, to: m2.to.place }));
ok(r2.deliver_at > r1.deliver_at && r2.deliver_at - r1.deliver_at < 25 * 60e3, 'the laser adds only minutes (light from the Moon to Mars)', `${((r2.deliver_at - r1.deliver_at) / 60e3).toFixed(1)} min`);
await R.p.reload(); await R.p.waitForSelector('.tabs'); await openChat(R, ms.me.id);
await R.p.click(`[data-mid="${mid}"]`); await R.p.waitForTimeout(400);
await R.p.click('[data-act=map]').catch(() => {}); await R.p.waitForSelector('.moonsky', { timeout: 10000 }); await R.p.waitForTimeout(1500);
const steps2 = await R.p.locator('.mcsteps').innerText(), eta2 = await R.p.locator('.mceta').innerText();
ok(/Relayed by laser to Jezero Crater, Mars, where they are now/.test(steps2), 'the trip shows the relay still to come', steps2.split('\n').at(-2) + ' ' + steps2.split('\n').at(-1));
ok(/lands/.test(eta2), 'and says when it really lands', eta2.replace(/\s+/g, ' '));
await R.p.screenshot({ path: `${out}/2-relay-to-mars.png` });
await R.p.click('.sheet header [data-act=close]'); await R.p.waitForTimeout(400);

// 3. a new spot on Mars: the relay heads there instead
await move(ms.token, { moon: { lat: -4.6, lon: 137.4, body: 'mars' } });
const m3 = JSON.parse(row(mid).moon);
ok(m3.k === 'laser' && /Gale/.test(m3.to.place) && m3.prev?.k === 'trip', 'a new spot on Mars: the same relay, to Gale Crater', m3.to.place);

// 4. home to Paris while it's still on its way to the Moon: the relay comes back down to Earth
await move(ms.token, { lat: 48.86, lon: 2.35, place: 'Paris' });
const r4 = row(mid), m4 = JSON.parse(r4.moon);
ok(m4.k === 'trip' && m4.pk === 'lunar' && m4.from.b === 'moon' && m4.to.b === 'earth' && m4.prev?.k === 'trip' && r4.to_lat == null,
  'back to Paris: from Tycho it comes home by lunar pigeon', JSON.stringify({ from: m4.from.place, to: m4.to.place, days: ((r4.deliver_at - Date.now()) / 24 / H).toFixed(1) }));

// 5. a space pigeon to someone on the Moon, who moves on the Moon: it heads to the new crater
await move(qs.token, { moon: { lat: 0.7, lon: 23.5 } });
await Q.p.reload(); await Q.p.waitForSelector('.tabs');
await R.p.reload(); await R.p.waitForSelector('.tabs'); await openChat(R, qs.me.id); await say(R, 'lunar', 'Moonwalk?');
const qid = one(`SELECT id FROM pg_msgs WHERE sender = '${rs.me.id}' AND recipient = '${qs.me.id}'`)[0]?.id;
const q0 = qid && row(qid);
await move(qs.token, { moon: { lat: 26.1, lon: 3.6 } });
const q1 = qid && row(qid), qm = q1 && JSON.parse(q1.moon);
ok(qm && qm.k === 'trip' && qm.to.lat === 26.1 && !qm.prev && Math.abs(q1.deliver_at - q0.deliver_at) < H, 'across the Moon: a lunar pigeon heads for the new crater, same day', qm && qm.to.place);

// 6. a group's space pigeons, each its own way: Mira on the Moon again, Quinn already there
await move(ms.token, { moon: { lat: 20.2, lon: 30.8 } });
await R.p.reload(); await R.p.waitForSelector('.tabs'); await openChat(R, gid); await say(R, 'swift', 'Moon book club');
const gmid = one(`SELECT id FROM pg_gmsgs WHERE sender = '${rs.me.id}' ORDER BY sent_at DESC LIMIT 1`)[0].id;
const spaceDels = Number(one(`SELECT COUNT(*) AS n FROM pg_gdeliv WHERE msg_id = '${gmid}' AND moon IS NOT NULL`)[0].n);
await R.p.reload(); await R.p.waitForSelector('.tabs'); await openChat(R, gid);
await R.p.click(`[data-mid="${gmid}"]`); await R.p.waitForTimeout(400);
await R.p.click('[data-act=map]').catch(() => {}); await R.p.waitForSelector('.moonsky', { timeout: 10000 }); await R.p.waitForTimeout(1200);
const who = await R.p.locator('.mcw').allInnerTexts(), head0 = await R.p.locator('.mct b').innerText();
await R.p.locator('.mcw:not(.on)').first().click(); await R.p.waitForTimeout(600);
const head1 = await R.p.locator('.mct b').innerText(), where1 = await R.p.locator('.mcwhere').innerText();
ok(spaceDels === 2 && who.length === 2 && head0 !== head1, 'a group’s two lunar pigeons: pick whose to watch', JSON.stringify({ who, head0, head1, where1 }));
await R.p.screenshot({ path: `${out}/3-group-whose.png` });
await R.p.click('.sheet header [data-act=close]'); await R.p.waitForTimeout(300);

// 7. the first one lands (moved on in time): its passport has the countries it crossed, then space
one(`UPDATE pg_msgs SET sent_at = sent_at - 900000000, deliver_at = ${Date.now() - 60000} WHERE id = '${mid}'`);
await K.tick();
const st = one(`SELECT places FROM pg_stamped WHERE id = '${mid}'`)[0], pl = st ? JSON.parse(st.places) : [];
ok(pl.some((x) => !/Moon|Mars|Orbit/.test(x)) && pl.includes('the Moon'), 'landed: stamped with where it flew on Earth, and the Moon', JSON.stringify(pl));

// nothing broke on the way
const sync = await api(rs.token, 'sync'); ok(sync[0] === 200, 'sync still answers', String(sync[0]));
console.log('errs', K.errs);
console.log(`FAILS ${K.fails()}`);
process.exit(0);
