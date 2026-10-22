// Look up: from a pigeon's map, which way it is from here. Without a compass, a dial says which way to face; with
// one (simulated: the phone's orientation), the sky ahead, turning to it, and "There it is" when facing it; and the
// camera's picture under it all.
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

// its whole way across the sky, from where it set off to where it lands
const aria = await A.p.locator('.lookcv').getAttribute('aria-label');
ok(/its way from London to New York/.test(aria), 'its way across the sky, from London to New York', aria);
ok(/From London/.test(await hud()), 'measured from where your profile says', (await hud()).match(/From [^.]*$/)?.[0] || '');

// Where I Am: from where you really are (here, Halifax, Nova Scotia: a third of the way over from London, the pigeon is
// further from there, and to the east)
await A.ctx.grantPermissions(['notifications', 'geolocation'], { origin: K.BASE }); await A.ctx.setGeolocation({ latitude: 44.65, longitude: -63.57, accuracy: 12 });
const km0 = Number((await hud()).match(/([\d,]+) mi away/)[1].replace(/,/g, ''));
await A.p.click('.lookhere'); await A.p.waitForTimeout(1500);
const h4 = await hud(), km1 = Number((h4.match(/([\d,]+) mi away/) || [, '0'])[1].replace(/,/g, ''));
ok(/From where you are now \(to within 10 m\)/.test(h4) && km1 > km0 + 300, 'Where I Am: measured from where you are now instead', `${km0} → ${km1} mi · ${h4.match(/From [^.]*$/)?.[0]}`);
ok(/Turn (left|right)/.test(h4) && !/There it is/.test(h4), 'and from there it’s another way to face', h4.match(/Turn[^.]*\./)?.[0] || h4);
const turn4 = Number((h4.match(/Turn (left|right) about (\d+)/) || [])[2] || 0) * (/Turn left/.test(h4) ? -1 : 1);
await face(az + turn4, 85); await A.p.waitForTimeout(700); await A.p.screenshot({ path: `${out}/look-here.png` });
await A.p.click('.lookhere'); await A.p.waitForTimeout(800);
ok(/From London/.test(await hud()), 'off again: back to where your profile says');
await A.p.screenshot({ path: `${out}/look-route.png` });

// 3. through the camera (a stand-in camera: a plain picture): the drawing goes see-through over it, and the camera
// goes off on leaving
await A.ctx.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { const c = document.createElement('canvas'); c.width = 720; c.height = 960;
  const g = c.getContext('2d'); const draw = () => { g.fillStyle = '#4a7f3a'; g.fillRect(0, 0, 720, 960); requestAnimationFrame(draw); }; draw(); window.__cam = c.captureStream(30); return window.__cam; }; });
await A.p.click('.looksheet header [data-act=lookback]'); await A.p.waitForTimeout(700);
await A.p.reload(); await A.p.waitForSelector('.tabs'); await openChat(A, bs.me.id); await openMap(A, m.id);
await A.p.click('.mapcard .lookbtn'); await A.p.waitForSelector('.looksheet .lookhud'); await face(az); await A.p.waitForTimeout(500);
ok(await A.p.locator('.lookcam').isVisible(), 'with a compass, a Camera button');
await A.p.click('.lookcam'); await face(az); await A.p.waitForTimeout(900);
const cam = await A.p.evaluate(() => { const v = document.querySelector('.lookvid'), cv = document.querySelector('.lookcv');
  const px = cv.getContext('2d').getImageData(4, 4, 1, 1).data[3]; return { on: !!v.srcObject && !v.hidden && v.videoWidth > 0, pressed: document.querySelector('.lookcam').getAttribute('aria-pressed'), corner: px }; });
ok(cam.on && cam.pressed === 'true' && cam.corner === 0, 'the camera’s picture under the drawing, which goes see-through (no painted sky)', JSON.stringify(cam));
ok(/There it is/.test(await hud()), 'and still lines the pigeon up');
await A.p.screenshot({ path: `${out}/look-camera.png` });
await A.p.click('.looksheet header [data-act=close]'); await A.p.waitForTimeout(700);
ok(await A.p.evaluate(() => window.__cam.getTracks().every((t) => t.readyState === 'ended')), 'closed: the camera is off');

// 4. back to its map (the camera off then too: Back takes the sheet away at once); a double tap opens one camera;
// and a pigeon that has landed has no Look Up
await openMap(A, m.id); await A.p.click('.mapcard .lookbtn'); await A.p.waitForSelector('.looksheet .lookhud'); await face(az); await A.p.waitForTimeout(400);
await A.p.evaluate(() => { const real = navigator.mediaDevices.getUserMedia; window.__cams = []; navigator.mediaDevices.getUserMedia = async (c) => { await new Promise((r) => setTimeout(r, 300)); const s = await real(c); window.__cams.push(s); return s; }; });
await A.p.click('.lookcam'); await A.p.click('.lookcam'); await A.p.click('.lookcam'); await A.p.waitForTimeout(1200);
const taps = await A.p.evaluate(() => ({ live: window.__cams.filter((s) => s.getTracks().some((t) => t.readyState === 'live')).length, pressed: document.querySelector('.lookcam').getAttribute('aria-pressed') }));
ok(taps.live === 1 && taps.pressed === 'true', 'three quick taps: on, off, on, and one camera running', JSON.stringify(taps));
await A.p.click('.looksheet header [data-act=lookback]'); await A.p.waitForTimeout(900);
ok(await A.p.locator('.mapcard').isVisible(), 'Back: its map again');
ok(await A.p.evaluate(() => window.__cams.every((s) => s.getTracks().every((t) => t.readyState === 'ended'))), 'and the camera is off');
one(`UPDATE pg_msgs SET deliver_at = ${now() - 60e3} WHERE id = '${m.id}'`);
await A.p.reload(); await A.p.waitForSelector('.tabs'); await openChat(A, bs.me.id); await openMap(A, m.id);
ok(!(await A.p.locator('.mapcard .lookbtn').isVisible()), 'landed: no Look Up');
console.log('errs', K.errs);
console.log(`FAILS ${K.fails()}`);
process.exit(0);
