// Look up: from a pigeon's map, which way it is from here. Without a compass, a dial says which way to face; with
// one (simulated: the phone's orientation), the sky ahead, turning to it, and "There it is" when facing it.
import { kit } from './lib.mjs';
const [,, S, out] = process.argv;
const K = await kit(S, out);
const { ok, one, api, sess, openChat, say } = K;
const A = await K.phone('ann'), B = await K.phone('ben');
await K.signup(A, 'Ann Ito', 'ann', 'ann@example.com', 'London');
await K.signup(B, 'Ben Ode', 'ben', 'ben@example.com', 'New York');
const [as, bs] = [await sess(A), await sess(B)];
await api(as.token, 'friends', { handle: bs.me.handle }); await api(bs.token, 'friends-respond', { id: as.me.id, accept: true });
const H = 3600e3, now = () => Date.now();
const openMap = async (P, id) => { await P.p.evaluate((id) => { const x = document.createElement('button'); x.hidden = true; x.dataset.act = 'map'; x.dataset.id = id; document.querySelector('#screen').append(x); x.click(); x.remove(); }, id); await P.p.waitForTimeout(1500); };
const hud = async () => (await A.p.locator('.lookhud').innerText()).replace(/\s+/g, ' ');

// Ann's pigeon to New York, a third of the way over the Atlantic
await A.p.reload(); await A.p.waitForSelector('.tabs'); await openChat(A, bs.me.id); await say(A, 'standard', 'Look up!');
const m = one(`SELECT id FROM pg_msgs WHERE sender = '${as.me.id}'`)[0];
one(`UPDATE pg_msgs SET sent_at = ${now() - 4 * H}, deliver_at = ${now() + 8 * H}, legs = NULL WHERE id = '${m.id}'`);
await A.p.reload(); await A.p.waitForSelector('.tabs'); await openChat(A, bs.me.id); await openMap(A, m.id);
ok(await A.p.locator('.mapcard .lookbtn').isVisible(), 'its map has Look Up while it flies');

// 1. no compass: a dial, and which way to face in words
await A.p.click('.mapcard .lookbtn'); await A.p.waitForSelector('.looksheet .lookhud'); await A.p.waitForTimeout(700);
const h1 = await hud();
const az = Number((h1.match(/\((\d+)°\)/) || [])[1]);
ok(/[\d,]+ mi away/.test(h1) && /Over /.test(h1), 'how far, and over where', h1);
ok(/Face (west|west-north-west|north-west)/.test(h1) && az > 250 && az < 320, 'no compass: face west-north-west (towards New York)', `${az}°`);
ok(/below the horizon, past the curve of the Earth/.test(h1), 'and it’s far past the curve of the Earth', '');
await A.p.screenshot({ path: `${out}/look-dial.png` });

// 2. with a compass: turn towards it, then facing it
const face = (heading, beta = 90) => A.p.evaluate(([h, b]) => { for (let i = 0; i < 40; i++) dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute', { alpha: (360 - h) % 360, beta: b, gamma: 0, absolute: true })); }, [heading, beta]);
await face(az - 60); await A.p.waitForTimeout(600);
const h2 = await hud();
ok(/Turn right about (50|60|70)°/.test(h2), 'facing too far left: turn right, by about how much', h2.match(/Turn[^.]*\./)?.[0] || h2);
await A.p.screenshot({ path: `${out}/look-turn.png` });
await face(az + 90); await A.p.waitForTimeout(600);
ok(/Turn left about (80|90|100)°/.test(await hud()), 'too far right: turn left');
await face(az); await A.p.waitForTimeout(600);
const h3 = await hud();
ok(/There it is/.test(h3), 'facing it: “There it is”', h3.match(/There[^.]*\./)?.[0] || h3);
await A.p.screenshot({ path: `${out}/look-facing.png` });

// 3. back to its map; and a pigeon that has landed has no Look Up
await A.p.click('.looksheet header [data-act=lookback]'); await A.p.waitForTimeout(900);
ok(await A.p.locator('.mapcard').isVisible(), 'Back: its map again');
one(`UPDATE pg_msgs SET deliver_at = ${now() - 60e3} WHERE id = '${m.id}'`);
await A.p.reload(); await A.p.waitForSelector('.tabs'); await openChat(A, bs.me.id); await openMap(A, m.id);
ok(!(await A.p.locator('.mapcard .lookbtn').isVisible()), 'landed: no Look Up');
console.log('errs', K.errs);
console.log(`FAILS ${K.fails()}`);
process.exit(0);
