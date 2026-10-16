// Pigeons go around storms: the way bends, the map says so, and cheers and moves keep the plan in order.
import { kit } from './lib.mjs';
const [,, S, out] = process.argv;
const K = await kit(S, out);
const { ok, sql, one, api, sess, openChat, say } = K;
const mode = (m) => fetch('http://127.0.0.1:8796/mode', { method: 'POST', body: JSON.stringify(m) });
const hav = (a, b, c, d) => { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
const G = await K.phone('george'), R = await K.phone('reuben');
await K.signup(G, 'George Farrow-Green', 'geo', 'george@example.com', 'London');
await K.signup(R, 'Reuben Tan', 'roobs', 'reuben@example.com', 'Rome');
const [gs, rs] = [await sess(G), await sess(R)];
await api(gs.token, 'friends', { handle: rs.me.handle }); await api(rs.token, 'friends-respond', { id: gs.me.id, accept: true });
const straight = hav(51.51, -0.13, 41.90, 12.50);
// calm: straight as before
await mode({ speed: 0, pattern: '' });
await G.p.reload(); await G.p.waitForSelector('.tabs'); await openChat(G, rs.me.id); await say(G, 'standard', 'calm day');
let m = one(`SELECT km, legs FROM pg_msgs ORDER BY sent_at DESC LIMIT 1`)[0];
ok(JSON.parse(m.legs || '[]').every((l) => l[3] === 'p') && m.km < straight * 1.05, 'clear skies: no bends but the pass through the Alps', JSON.stringify(m));
sql(`DELETE FROM pg_msgs`);
// thunderstorms right on the straight line, over eastern France
await mode({ speed: 0, pattern: 'cell', cell: [46.9, 5.3, 1.3] });
await G.p.reload(); await G.p.waitForSelector('.tabs'); await openChat(G, rs.me.id); await say(G, 'swift', 'mind the storms');
m = one(`SELECT id, km, legs, sent_at, deliver_at, wx FROM pg_msgs ORDER BY sent_at DESC LIMIT 1`)[0];
const all = JSON.parse(m.legs || '[]'), legs = all.filter((l) => l[3] === 's');
ok(legs.length >= 2 && all.every((l) => l[2] > m.sent_at && l[2] < m.deliver_at), 'storms on the way: it plans a bend around them, timed along the flight', m.legs);
ok(Array.isArray(legs[0]?.[5]?.storm) && Math.abs(legs[0][5].storm[0] - 46.9) < 1.6, 'its first bend says where the storms are, for the map', JSON.stringify(legs[0]));
ok(m.km > straight + 10 && m.km < straight * 1.15, 'a little further than the straight line', `${Math.round(m.km)} vs ${Math.round(straight)}`);
ok(/France|Switzerland|Alps/.test(legs[0][4] || ''), 'it knows where the storms are', String(legs[0][4]));
// the map: the card says what it's doing
await G.p.click('[data-act=map]').catch(() => {}); await G.p.waitForSelector('.sheet .mapcard', { timeout: 8000 }); await G.p.waitForTimeout(1500);
const note = await G.p.evaluate(() => [...document.querySelectorAll('.mapcard .fctitle')].map((e) => e.textContent).join(' | '));
ok(/Goes around storms over /.test(note), 'the map card says so', note);
await G.p.screenshot({ path: `${out}/storm-map.png` });
await G.p.keyboard.press('Escape'); await G.p.waitForTimeout(400);
// cheered on: the bend keeps its place, sooner; everything stays in order
const was = m;
const [cs] = await api(rs.token, 'cheer', { id: m.id });
m = one(`SELECT legs, deliver_at FROM pg_msgs WHERE id = '${m.id}'`)[0];
const l2 = JSON.parse(m.legs), times = l2.map((l) => l[2]);
ok(cs === 200 && l2.some((l) => l[3] === 'c') && l2.some((l) => l[3] === 's') && times.every((x, i) => !i || x >= times[i - 1]) && m.deliver_at < was.deliver_at, 'cheered on: still around the storms, sooner, in order', m.legs);
// Reuben moves to Naples: it turns from where it is, the old plan dropped
await fetch(K.BASE + '/api/pigeon/me', { method: 'PATCH', headers: { Authorization: 'Bearer ' + rs.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ lat: 40.85, lon: 14.27, place: 'Naples' }) });
m = one(`SELECT legs, deliver_at, to_place FROM pg_msgs WHERE id = '${was.id}'`)[0];
const l3 = JSON.parse(m.legs), t3 = l3.map((l) => l[2]), now = Date.now(), turn = l3.find((l) => !l[3]);
ok(m.to_place === 'Naples' && turn && Math.abs(turn[2] - now) < 60000 && t3.every((x, i) => !i || x >= t3[i - 1]) && l3.filter((l) => l[2] > now + 60000 && l[3] === 's').length === 0, 'Reuben moves: it turns from where it is, and the rest of the old plan goes', m.legs);
// ---- storms on the line and to one side of it: it goes round the other side ----
const side = (legsJson) => { const ls = JSON.parse(legsJson || '[]').filter((l) => l[3] === 's'); return ls.reduce((a, l) => a + Math.sign((12.5 + 0.13) * (l[0] - 51.51) - (41.9 - 51.51) * (l[1] + 0.13)), 0); };
const viaCells = async (cells) => { sql(`DELETE FROM pg_msgs`); await mode({ speed: 0, pattern: 'cell', cell: cells }); const [, r] = await api(gs.token, 'messages', { id: crypto.randomUUID(), to: rs.me.id, ct: 'x'.repeat(40), pigeon: 'swift' }); return one(`SELECT legs FROM pg_msgs WHERE id = '${r.message.id}'`)[0].legs; };
const north = await viaCells([[46.9, 5.3, 1.3], [48.6, 7.6, 1.6]]), south = await viaCells([[46.9, 5.3, 1.3], [45.6, 3.4, 1.6]]);
ok(side(north) * side(south) < 0 && side(north) !== 0, 'more storms on one side: it goes round the other', JSON.stringify([side(north), side(south)]));
await mode({ speed: 0, pattern: '' });
console.log('errors', JSON.stringify(K.errs)); console.log('FAILS', K.fails());
await K.b.close();
