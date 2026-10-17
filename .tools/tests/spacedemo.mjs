// Further out (1.2.0): Mars and laser pigeons, orbital pigeons, day and night up there, moments
// from space, postmarks and badges, replay and share, and the In the air strip.
import { kit } from './lib.mjs';
const [,, S, out] = process.argv;
const K = await kit(S, out);
const { ok, sql, one, api, sess, openChat, tick, allPushes, makeKeys } = K;
const HOUR = 36e5, MIN = 6e4, DAY = 864e5;
const gk = await makeKeys();
const G = await K.phone('george', gk), M = await K.phone('mira'), P = await K.phone('pat');
await K.signup(G, 'George Farrow-Green', 'geo', 'george@example.com', 'Norwich');
await K.signup(M, 'Mira Okafor', 'mira', 'mira@example.com', 'Paris');
await K.signup(P, 'Pat Lee', 'pat', 'pat@example.com', 'London');
const [gs, ms, ps] = [await sess(G), await sess(M), await sess(P)];
for (const [a, b] of [[gs, ms], [gs, ps], [ms, ps]]) { await api(a.token, 'friends', { handle: b.me.handle }); await api(b.token, 'friends-respond', { id: a.me.id, accept: true }); }
for (const x of [G, M, P]) { await x.p.reload(); await x.p.waitForSelector('.tabs'); }
await K.pushOn(G);
const shot = (ph, n) => ph.p.screenshot({ path: `${out}/${n}.png` });
const patch = (s, b) => fetch(K.BASE + '/api/pigeon/me', { method: 'PATCH', headers: { Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());
const back = async (ph) => { await ph.p.reload(); await ph.p.waitForSelector('.tabs'); };
const openTrip = async (ph, chat, id) => {
  await back(ph); await openChat(ph, chat); await ph.p.waitForTimeout(500);
  await ph.p.click(`[data-mid="${id}"], [data-id="${id}"][data-act=map]`); await ph.p.waitForTimeout(400);
  if (!(await ph.p.locator('.moonsky').count())) { await ph.p.click('[data-act=map]'); }
  await ph.p.waitForSelector('.moonsky'); await ph.p.waitForTimeout(1400);
};

// ---- 10. an orbital pigeon, George to Pat (both on Earth) ----
await openChat(G, ps.me.id); await G.p.waitForTimeout(600);
await G.p.click('.compose .kind'); await G.p.waitForSelector('.sheet [data-act=pigeon][data-id=orbital]');
await G.p.click('.sheet [data-act=pigeon][data-id=orbital]'); await G.p.waitForTimeout(700);
const fs = await G.p.locator('.sheet').innerText();
ok(/Orbital/.test(fs) && /92 minutes/.test(fs) && /\d+ laps? this time/.test(fs), 'How It Flies offers the orbital pigeon', fs.replace(/\s+/g, ' ').slice(0, 260));
await shot(G, '01-how-it-flies-orbital');
await G.p.click('.sheet header [data-act=close]'); await G.p.waitForTimeout(400);
await G.p.fill('#msg', 'Sent via low Earth orbit'); await G.p.click('.send'); await G.p.waitForTimeout(2000);
const o1 = one(`SELECT id, pigeon, sent_at, deliver_at, from_lat, moon FROM pg_msgs WHERE sender = '${gs.me.id}' ORDER BY sent_at DESC LIMIT 1`)[0], om = JSON.parse(o1.moon);
const oh = (o1.deliver_at - o1.sent_at) / HOUR;
ok(o1.pigeon === 'orbital' && om.k === 'orbit' && o1.from_lat === null && oh > 0.5 && oh < 25 && om.laps >= 0, 'it flies by orbit: hours, so many laps, no Earth route', JSON.stringify({ oh: oh.toFixed(1), laps: om.laps, i: om.i }));
ok(one(`SELECT orbital FROM pg_users WHERE id = '${gs.me.id}'`)[0].orbital === 1, 'one orbital pigeon leaves the loft');
// a good way round: watch it
const T = o1.deliver_at - o1.sent_at;
sql(`UPDATE pg_msgs SET sent_at = ${Date.now() - Math.round(T * 0.55)}, deliver_at = ${Date.now() + Math.round(T * 0.45)} WHERE id = '${o1.id}'`);
await openTrip(G, ps.me.id, o1.id);
const oc = await G.p.locator('.mooncard').innerText();
ok(/lap \d/.test(oc) && /Re-entry/.test(oc) && /Touchdown in London/.test(oc), 'its trip: over somewhere, which lap, re-entry and touchdown', oc.replace(/\s+/g, ' ').slice(0, 300));
await shot(G, '02-orbit-trip');
// 8. replay: scrub back to near the start
await G.p.evaluate(() => { const r = document.querySelector('.mcreplay'); r.value = '80'; r.dispatchEvent(new Event('input', { bubbles: true })); });
await G.p.waitForTimeout(500);
ok(/replay/.test(await G.p.locator('.mceta').innerText()) && !(await G.p.locator('.mclive').isHidden()), 'scrubbing back replays the trip (and Live comes back)');
await shot(G, '03-orbit-replay');
await G.p.click('[data-act=moonlive]'); await G.p.waitForTimeout(400);
ok(!/replay/.test(await G.p.locator('.mceta').innerText()), 'Live goes back to now');
await G.p.keyboard.press('Escape');

// ---- 9. Mira goes to Mars, from My Profile ----
await M.p.click('[data-act=tab][data-id=account]'); await M.p.waitForTimeout(500);
await M.p.click('#screen > main.view [data-act=profile]'); await M.p.waitForSelector('.sheet [data-act=moonpick][data-id=mars]');
await M.p.click('.sheet [data-act=moonpick][data-id=mars]'); await M.p.waitForSelector('.moonpick'); await M.p.waitForTimeout(500);
await M.p.click('.sheet [data-act=moonsite][data-id="Jezero Crater"]'); await M.p.waitForTimeout(500);
await shot(M, '04-mars-picker');
await M.p.click('.sheet [data-act=moonside][data-id=west]'); await M.p.waitForTimeout(500);
await shot(M, '05-mars-west');
await M.p.click('.sheet [data-act=moonland]'); await M.p.waitForTimeout(1500);
const mu = one(`SELECT lat, place, moon FROM pg_users WHERE id = '${ms.me.id}'`)[0];
ok(mu.lat === null && mu.place === 'Jezero Crater, Mars' && /"b":"mars"/.test(mu.moon), 'on Mars: Jezero Crater, and no spot on Earth', JSON.stringify(mu));
await shot(M, '06-profile-on-mars');
await M.p.keyboard.press('Escape');

// ---- a laser pigeon to her ----
await back(G); await openChat(G, ms.me.id); await G.p.waitForTimeout(700);
ok(/Jezero Crater/.test(await G.p.locator('.chatwho').first().innerText()) && /sun(rise|set) in/.test(await G.p.locator('.chatwho').first().innerText()), 'her chat: the time at Jezero, and when the Sun next rises or sets', await G.p.locator('.chatwho').first().innerText());
ok((await G.p.locator('.compose .kind').innerText()).includes('Laser'), 'the composer picks a laser pigeon');
await shot(G, '07-chat-to-mars');
await G.p.click('.compose .kind'); await G.p.waitForSelector('.sheet .flyhero'); await G.p.waitForTimeout(600);
ok(/Light takes/.test(await G.p.locator('.sheet').innerText()), 'How It Flies: how long light takes today');
await shot(G, '08-how-it-flies-laser');
await G.p.click('.sheet header [data-act=close]'); await G.p.waitForTimeout(300);
await G.p.fill('#msg', 'Hello Mars!'); await G.p.click('.send'); await G.p.waitForTimeout(2000);
const l1 = one(`SELECT id, pigeon, km, sent_at, deliver_at, moon FROM pg_msgs WHERE sender = '${gs.me.id}' AND recipient = '${ms.me.id}'`)[0];
const lmin = (l1.deliver_at - l1.sent_at) / MIN;
ok(l1.pigeon === 'laser' && lmin > 3 && lmin < 23 && l1.km > 50e6, 'at the speed of light: minutes, the real distance to Mars', JSON.stringify({ min: lmin.toFixed(1), km: l1.km }));
const LT = l1.deliver_at - l1.sent_at;
sql(`UPDATE pg_msgs SET sent_at = ${Date.now() - Math.round(LT * 0.4)}, deliver_at = ${Date.now() + Math.round(LT * 0.6)} WHERE id = '${l1.id}'`);
await openTrip(G, ms.me.id, l1.id);
ok(/speed of light/.test(await G.p.locator('.mooncard').innerText()), 'its trip: a pulse of light on its way');
await shot(G, '09-laser-trip');
await G.p.keyboard.press('Escape');
const [st1, r1] = await api(gs.token, 'messages', { id: crypto.randomUUID(), to: ms.me.id, ct: 'x'.repeat(40), pigeon: 'lunar' });
ok(st1 === 409 && /laser/.test(r1.error || ''), 'only a laser pigeon reaches Mars', `${st1} ${r1.error}`);

// ---- 2. Pat goes to the Moon: day or night at Tycho ----
await patch(ps, { moon: { lat: -43.3, lon: -11.4 } });
await back(G); await openChat(G, ps.me.id); await G.p.waitForTimeout(700);
const hd = await G.p.locator('.chatwho').first().innerText();
ok(/(Day|Night) at Tycho · sun(rise|set) in/.test(hd), 'his chat: day or night at Tycho, and when that changes', hd.replace(/\s+/g, ' '));
await shot(G, '10-chat-night-at-tycho');
// ---- 5. moments from space: halfway to the Moon, as a notification ----
await G.p.fill('#msg', 'Lunar post'); await G.p.click('.send'); await G.p.waitForTimeout(2000);
const n1 = one(`SELECT id, sent_at, deliver_at FROM pg_msgs WHERE sender = '${gs.me.id}' AND recipient = '${ps.me.id}' AND pigeon = 'lunar'`)[0];
const NT = n1.deliver_at - n1.sent_at, since = Date.now();
sql(`UPDATE pg_msgs SET sent_at = ${Date.now() - Math.round(NT * 0.4)}, deliver_at = ${Date.now() + Math.round(NT * 0.6)} WHERE id = '${n1.id}'`);
await tick();
const told = (await allPushes(gk, 'george', since)).map((x) => x.body || '');
ok(told.some((b) => /Your lunar pigeon: halfway to the Moon/.test(b)), 'George hears it’s halfway to the Moon', JSON.stringify(told));
await tick();
ok((await allPushes(gk, 'george', since)).filter((x) => /halfway/.test(x.body || '')).length === 1, 'and only once');

// ---- 7. a lunar trip through a real eclipse (28 Aug 2026), and postmarks and badges once it lands ----
// (that's over a month ago, when its message would be let go: the clean-up waits while this test looks at it)
sql("INSERT OR REPLACE INTO pg_meta (k, v) VALUES ('keep_at', '99999999999999')");
const E0 = Date.parse('2026-08-26T12:00:00Z'), E1 = Date.parse('2026-08-29T13:00:00Z');
sql(`UPDATE pg_msgs SET sent_at = ${E0}, deliver_at = ${E1}, moon = json_set(moon, '$.dist', 358500) WHERE id = '${n1.id}'`);
await tick();
const [, lg] = await api(gs.token, 'flight-log');
const has = (id) => !!lg.badges.find((b) => b.id === id)?.earned;
ok(has('eclipse') && has('supermoon') && has('moonshot'), 'badges: Through the Shadow, Supermoon, Moonshot', JSON.stringify(lg.badges.filter((b) => b.earned).map((b) => b.id)));
const [, lg2] = await api(gs.token, 'flight-log');
ok((lg2.postmarks?.marks || []).some((x) => x.id === 'm_tycho'), 'a Tycho postmark for landing there', JSON.stringify(lg2.postmarks?.marks?.map((x) => x.id)));
await openTrip(G, ps.me.id, n1.id);
ok(/Lunar eclipse/.test(await G.p.locator('.mooncard').innerText()), 'its trip shows the eclipse on the way');
await shot(G, '11-trip-with-eclipse');
// 3. share it
await G.p.click('.mcshare [data-act=shareflight]'); await G.p.waitForSelector('.shpick'); await G.p.waitForFunction(() => document.querySelector('.shopt.postcard img'), null, { timeout: 20000 });
await G.p.waitForTimeout(800);
await shot(G, '12-share-moon-trip');
const pc = await G.p.evaluate(() => document.querySelector('.shopt.postcard img')?.src);
if (pc) { const b = await G.p.evaluate(() => { const i = document.querySelector('.shopt.postcard img'), c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; c.getContext('2d').drawImage(i, 0, 0); return c.toDataURL('image/jpeg', 0.9).split(',')[1]; }); (await import('fs')).writeFileSync(`${out}/13-postcard.jpg`, Buffer.from(b, 'base64')); }
ok(!!pc, 'the postcard for a Moon trip');
await G.p.keyboard.press('Escape'); await G.p.waitForTimeout(300);

// ---- the orbital and laser ones land: their badges ----
sql(`UPDATE pg_msgs SET deliver_at = ${Date.now() - 1000} WHERE id IN ('${o1.id}', '${l1.id}')`); await tick();
const [, lg3] = await api(gs.token, 'flight-log');
ok(lg3.badges.find((b) => b.id === 'orbiter')?.earned && lg3.badges.find((b) => b.id === 'redplanet')?.earned, 'badges: Orbiter and Red Planet');
const [, pp] = await api(gs.token, 'passport');
ok(['the Moon', 'Mars', 'Low Earth Orbit'].every((x) => pp.places.some((p) => p.name === x)), 'passport stamps: the Moon, Mars, Low Earth Orbit', JSON.stringify(pp.places.map((p) => p.name)));

// ---- 4. the In the air strip, with space pigeons up ----
const [, s2] = await api(gs.token, 'messages', { id: crypto.randomUUID(), to: ps.me.id, ct: 'x'.repeat(40), pigeon: 'lunarx' });
await back(G); await G.p.click('[data-act=tab][data-id=messages]').catch(() => {}); await G.p.waitForTimeout(2500);
const air = await G.p.locator('.air').innerText().catch(() => '');
ok(/mi from Earth|Climbing|lap/.test(air), 'In the air: where a space pigeon is, not just when it lands', air.replace(/\s+/g, ' ').slice(0, 200));
await shot(G, '14-in-the-air');
// Flight Log: the badges and postmarks
await G.p.click('[data-act=tab][data-id=account]'); await G.p.waitForTimeout(500);
await shot(G, '15-account-space-pigeons');
await G.p.click('#screen > main.view [data-act=flightlog]'); await G.p.waitForTimeout(2500);
await G.p.evaluate(() => { const h = [...document.querySelectorAll('.sheet .ghead')].find((x) => /Postmarks/.test(x.textContent)); h?.scrollIntoView(); });
await G.p.waitForTimeout(500);
await shot(G, '16-postmarks');
void s2;
console.log('errs', K.errs);
console.log(`FAILS ${K.fails()}`);
process.exit(0);
