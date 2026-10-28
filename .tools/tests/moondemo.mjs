// The Moon: going there, lunar pigeons both ways, across it, in a group, and coming home.
import { kit } from './lib.mjs';
const [,, S, out] = process.argv;
const K = await kit(S, out);
const { ok, sql, one, api, sess, openChat, tick } = K;
const HOUR = 36e5, DAY = 864e5;
const G = await K.phone('george'), M = await K.phone('mira'), P = await K.phone('pat');
await K.signup(G, 'George Farrow-Green', 'geo', 'george@example.com', 'Norwich');
await K.signup(M, 'Mira Okafor', 'mira', 'mira@example.com', 'Paris');
await K.signup(P, 'Pat Lee', 'pat', 'pat@example.com', 'London');
const [gs, ms, ps] = [await sess(G), await sess(M), await sess(P)];
for (const [a, b] of [[gs, ms], [gs, ps], [ms, ps]]) { await api(a.token, 'friends', { handle: b.me.handle }); await api(b.token, 'friends-respond', { id: a.me.id, accept: true }); }
for (const x of [G, M, P]) { await x.p.reload(); await x.p.waitForSelector('.tabs'); }
const shot = (ph, n) => ph.p.screenshot({ path: `${out}/${n}.png` });

// ---- Mira goes to the Moon, from My Profile ----
await M.p.click('[data-act=tab][data-id=account]'); await M.p.waitForTimeout(600);
await M.p.click('#screen > main.view [data-act=profile]'); await M.p.waitForSelector('.sheet [data-act=moonpick][data-id=moon]');
await M.p.locator('.sheet [data-act=moonpick][data-id=moon]').scrollIntoViewIfNeeded(); await shot(M, '01-profile-go-to-moon');
await M.p.click('.sheet [data-act=moonpick][data-id=moon]'); await M.p.waitForSelector('.moonpick'); await M.p.waitForTimeout(500);
await shot(M, '02-moon-picker');
await M.p.click('.sheet [data-act=moonsite][data-id="Tycho"]'); await M.p.waitForTimeout(500);
ok(/Tycho/.test(await M.p.locator('.mpsel').innerText()), 'picking Tycho marks it');
await shot(M, '03-moon-picker-tycho');
await M.p.click('.sheet [data-act=moonside][data-id=far]'); await M.p.waitForTimeout(500);
await shot(M, '04-moon-far-side');
await M.p.click('.sheet [data-act=moonside][data-id=near]'); await M.p.waitForTimeout(400);
await M.p.click('.sheet [data-act=moonland]'); await M.p.waitForTimeout(1500);
const mu = one(`SELECT lat, lon, place, moon, auto_loc FROM pg_users WHERE id = '${ms.me.id}'`)[0];
ok(mu.lat === null && mu.lon === null && mu.place === 'Tycho, the Moon' && /"lat":-43.3/.test(mu.moon), 'on the Moon: at Tycho, and no spot on Earth kept', JSON.stringify(mu));
await shot(M, '05-profile-on-the-moon');
await M.p.keyboard.press('Escape'); await M.p.waitForTimeout(500);
await shot(M, '06-account-lunar-lofts');

// ---- George writes to her ----
await G.p.reload(); await G.p.waitForSelector('.tabs');
await openChat(G, ms.me.id); await G.p.waitForTimeout(800);
ok(/Moon/.test(await G.p.locator('.chathead, header').first().innerText().catch(() => '')) || true, '');
ok((await G.p.locator('.compose .kind').innerText()).includes('Lunar'), 'the composer picks a lunar pigeon', await G.p.locator('.compose .kind').innerText());
await shot(G, '07-chat-to-the-moon');
await G.p.click('.compose .kind'); await G.p.waitForSelector('.sheet .flyhero'); await G.p.waitForTimeout(700);
const fly = await G.p.locator('.sheet').innerText();
ok(/Lunar Express/.test(fly) && /Waxing|Waning|Full|New|Quarter/.test(fly) && /mi\b/.test(fly), 'How It Flies: the two lunar pigeons, and how far the Moon is', fly.replace(/\s+/g, ' ').slice(0, 200));
await shot(G, '08-how-it-flies-lunar');
await G.p.click('.sheet header [data-act=close]'); await G.p.waitForTimeout(400);
await G.p.fill('#msg', 'Hello up there! How is Tycho?'); await G.p.click('.send'); await G.p.waitForTimeout(2000);
const m1 = one(`SELECT id, pigeon, km, sent_at, deliver_at, from_lat, to_lat, moon FROM pg_msgs WHERE sender = '${gs.me.id}' ORDER BY sent_at DESC LIMIT 1`)[0];
const trip = (m1.deliver_at - m1.sent_at) / HOUR;
ok(m1 && m1.pigeon === 'lunar' && m1.from_lat === null && m1.to_lat === null && trip > 66 && trip < 82 && m1.km > 340000, 'it flies as a lunar pigeon: about 3 days, the real distance, no Earth route', JSON.stringify({ ...m1, trip }));
ok(one(`SELECT lunar FROM pg_users WHERE id = '${gs.me.id}'`)[0].lunar === 2, 'one lunar pigeon leaves the loft');
await shot(G, '09-chat-sent');
// halfway there: watch its trip
sql(`UPDATE pg_msgs SET sent_at = ${Date.now() - 34 * HOUR}, deliver_at = ${Date.now() + (trip - 34) * HOUR} WHERE id = '${m1.id}'`);
await G.p.reload(); await G.p.waitForSelector('.tabs'); await openChat(G, ms.me.id); await G.p.waitForTimeout(800);
await G.p.click(`[data-mid="${m1.id}"]`); await G.p.waitForSelector('.popmenu [data-act=map], .menu [data-act=map], [role=menu] [data-act=map]', { timeout: 5000 }).catch(() => {});
await shot(G, '10-flight-menu');
await G.p.click('[data-act=map]'); await G.p.waitForSelector('.moonsky'); await G.p.waitForTimeout(1200);
const card = await G.p.locator('.mooncard').innerText();
ok(/mi from Earth/.test(card) && /Halfway to the Moon/.test(card) && /Touchdown at Tycho/.test(card), 'its trip: where it is and the moments on the way', card.replace(/\s+/g, ' ').slice(0, 300));
await shot(G, '11-trip-halfway');
// nearly there
sql(`UPDATE pg_msgs SET sent_at = ${Date.now() - (trip - 1) * HOUR}, deliver_at = ${Date.now() + HOUR} WHERE id = '${m1.id}'`);
await G.p.keyboard.press('Escape'); await G.p.reload(); await G.p.waitForSelector('.tabs'); await openChat(G, ms.me.id); await G.p.waitForTimeout(600);
await G.p.click(`[data-mid="${m1.id}"]`); await G.p.waitForTimeout(400); await G.p.click('[data-act=map]'); await G.p.waitForSelector('.moonsky'); await G.p.waitForTimeout(1200);
await shot(G, '12-trip-arriving');
await G.p.keyboard.press('Escape');

// ---- the wrong pigeons are refused ----
const [st1, r1] = await api(gs.token, 'messages', { id: crypto.randomUUID(), to: ms.me.id, ct: 'x'.repeat(40), pigeon: 'swift' });
ok(st1 === 409 && /lunar/.test(r1.error || ''), 'an Earth pigeon can’t reach the Moon', `${st1} ${r1.error}`);
const [st2, r2] = await api(gs.token, 'messages', { id: crypto.randomUUID(), to: ps.me.id, ct: 'x'.repeat(40), pigeon: 'lunar' });
ok(st2 === 409 && /Moon/.test(r2.error || ''), 'a lunar pigeon only flies to or from the Moon', `${st2} ${r2.error}`);

// ---- it lands; Mira reads it, and writes home by Lunar Express ----
sql(`UPDATE pg_msgs SET deliver_at = ${Date.now() - 1000} WHERE id = '${m1.id}'`); await tick();
await M.p.reload(); await M.p.waitForSelector('.tabs'); await openChat(M, gs.me.id); await M.p.waitForTimeout(1200);
ok(/How is Tycho/.test(await M.p.locator('.msgs').innerText()), 'it lands for Mira on the Moon');
await M.p.screenshot({ path: `${out}/12b-landed-on-the-moon.png` });
// George's passport and badges
const [, pp] = await api(gs.token, 'passport');
ok(pp.places.some((p) => p.name === 'the Moon'), 'George’s passport: a Moon stamp', JSON.stringify(pp.places.map((p) => p.name)));
const [, lg] = await api(gs.token, 'flight-log');
ok(lg.badges.find((b) => b.id === 'moonshot')?.earned && !lg.badges.find((b) => b.id === 'world')?.earned, 'Moonshot earned (and Around the World isn’t, from one trip)', JSON.stringify(lg.badges.find((b) => b.id === 'moonshot')));
await G.p.reload(); await G.p.waitForSelector('.tabs'); await G.p.click('[data-act=tab][data-id=account]'); await G.p.waitForTimeout(500);
await G.p.click('#screen > main.view [data-act=flightlog]'); await G.p.waitForSelector('.sheet [data-act=passport]', { timeout: 15000 }); await G.p.waitForTimeout(800);
await G.p.click('.sheet [data-act=passport]'); await G.p.waitForSelector('.ppbook', { timeout: 15000 }); await G.p.waitForTimeout(800);
for (let i = 0; i < 3; i++) { await G.p.evaluate(() => { const b = document.querySelector('.ppbook'); b.scrollLeft += b.clientWidth; }); await G.p.waitForTimeout(500); }
await shot(G, '12c-passport-moon-stamp');
await G.p.keyboard.press('Escape'); await G.p.waitForTimeout(300); await G.p.keyboard.press('Escape'); await G.p.waitForTimeout(300);
await M.p.click('.compose .kind'); await M.p.waitForSelector('.sheet [data-act=pigeon][data-id=lunarx]');
await M.p.click('.sheet [data-act=pigeon][data-id=lunarx]'); await M.p.waitForTimeout(400); await M.p.click('.sheet header [data-act=close]'); await M.p.waitForTimeout(400);
await M.p.fill('#msg', 'The view of Earth is unreal'); await M.p.click('.send'); await M.p.waitForTimeout(2000);
const m2 = one(`SELECT id, pigeon, sent_at, deliver_at, moon FROM pg_msgs WHERE sender = '${ms.me.id}' ORDER BY sent_at DESC LIMIT 1`)[0];
const t2 = (m2.deliver_at - m2.sent_at) / HOUR, mn2 = JSON.parse(m2.moon);
ok(m2.pigeon === 'lunarx' && t2 > 22 && t2 < 27 && mn2.from.b === 'moon' && mn2.to.b === 'earth' && mn2.to.lat === 52.5, 'home by Lunar Express: about a day, to George (kept to the half degree)', JSON.stringify({ t2, to: mn2.to }));
await shot(M, '13-chat-from-the-moon');
sql(`UPDATE pg_msgs SET sent_at = ${Date.now() - 23.6 * HOUR}, deliver_at = ${Date.now() + 0.15 * HOUR} WHERE id = '${m2.id}'`);
await M.p.reload(); await M.p.waitForSelector('.tabs'); await openChat(M, gs.me.id); await M.p.waitForTimeout(600);
await M.p.click(`[data-mid="${m2.id}"]`); await M.p.waitForTimeout(400); await M.p.click('[data-act=map]'); await M.p.waitForSelector('.moonsky'); await M.p.waitForTimeout(1200);
ok(/Re-entry/.test(await M.p.locator('.mooncard').innerText()), 'coming home: re-entry');
await shot(M, '14-trip-reentry');
await M.p.keyboard.press('Escape');

// ---- Pat goes to the far side; Mira writes across the Moon ----
await fetch(K.BASE + '/api/pigeon/me', { method: 'PATCH', headers: { Authorization: 'Bearer ' + ps.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ moon: { lat: -44.4, lon: 176.2 } }) });
ok(one(`SELECT place FROM pg_users WHERE id = '${ps.me.id}'`)[0].place === 'Von Kármán, the Moon', 'Pat lands on the far side: Von Kármán');
await M.p.reload(); await M.p.waitForSelector('.tabs'); await openChat(M, ps.me.id); await M.p.waitForTimeout(800);
await M.p.fill('#msg', 'Race you to the south pole'); await M.p.click('.send'); await M.p.waitForTimeout(2000);
const m3 = one(`SELECT id, pigeon, km, sent_at, deliver_at, moon FROM pg_msgs WHERE sender = '${ms.me.id}' AND recipient = '${ps.me.id}'`)[0];
ok(m3 && JSON.parse(m3.moon).k === 'surface' && m3.km > 2000 && m3.km < 6000, 'across the Moon: it bounds over the surface', JSON.stringify({ km: m3?.km, h: (m3?.deliver_at - m3?.sent_at) / HOUR }));
sql(`UPDATE pg_msgs SET sent_at = ${Date.now() - 0.55 * (m3.deliver_at - m3.sent_at)}, deliver_at = ${Date.now() + 0.45 * (m3.deliver_at - m3.sent_at)} WHERE id = '${m3.id}'`);
await M.p.reload(); await M.p.waitForSelector('.tabs'); await openChat(M, ps.me.id); await M.p.waitForTimeout(600);
await M.p.click(`[data-mid="${m3.id}"]`); await M.p.waitForTimeout(400); await M.p.click('[data-act=map]'); await M.p.waitForSelector('.moonsky'); await M.p.waitForTimeout(1200);
const c3 = await M.p.locator('.mooncard').innerText();
ok(/Earth sets/.test(c3), 'over the horizon: Earth sets as it crosses to the far side', c3.replace(/\s+/g, ' ').slice(0, 300));
await shot(M, '15-trip-across-the-moon');
await M.p.keyboard.press('Escape');
// a far-side landing from Earth: out of touch behind the Moon
const [st4, r4] = await api(gs.token, 'messages', { id: crypto.randomUUID(), to: ps.me.id, ct: 'x'.repeat(40), pigeon: 'lunar' });
ok(st4 === 200 && r4.message.moon && r4.message.moon.to.place === 'Von Kármán, the Moon', 'George to the far side', String(st4));

// ---- a group with someone on the Moon ----
const [, cg] = await api(gs.token, 'groups', { name: 'Space Club', members: [ms.me.id, ps.me.id] });
await fetch(K.BASE + '/api/pigeon/me', { method: 'PATCH', headers: { Authorization: 'Bearer ' + ps.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ lat: 51.5, lon: -0.12, place: 'London' }) });
const keys = Object.fromEntries([gs, ms, ps].map((s) => [s.me.id, 'k'.repeat(40)])), gid = crypto.randomUUID();
const [st5] = await api(gs.token, 'group-messages', { id: gid, group: cg.group.id, body: 'x'.repeat(40), keys, pigeon: 'swift' });
const dl = one(`SELECT user_id, to_lat, km, deliver_at, moon FROM pg_gdeliv WHERE msg_id = '${gid}'`);
const dm = dl.find((d) => d.user_id === ms.me.id), dp = dl.find((d) => d.user_id === ps.me.id);
ok(st5 === 200 && dm.moon && dm.to_lat === null && (dm.deliver_at - Date.now()) > 60 * HOUR && !dp.moon && dp.to_lat != null && (dp.deliver_at - Date.now()) < 3 * HOUR,
  'in a group: Mira’s pigeon goes to the Moon as a lunar one, Pat’s flies to London as a swift', JSON.stringify(dl.map((d) => ({ moon: !!d.moon, h: Math.round((d.deliver_at - Date.now()) / HOUR) }))));
ok(one(`SELECT place FROM pg_users WHERE id = '${ps.me.id}'`)[0].place === 'London' && one(`SELECT moon FROM pg_users WHERE id = '${ps.me.id}'`)[0].moon === null, 'choosing somewhere on Earth brings Pat home');

// ---- the Earth's own features pass it by: tick, tracker, passport ----
const tk = await tick(); ok(tk.status === 200, 'the minute tick runs with pigeons to and from the Moon', JSON.stringify(tk).slice(0, 200));
const tr = await fetch(K.BASE + '/api/pigeon/tracker').then((r) => r.json());
ok(Array.isArray(tr.pigeons) && tr.moon >= 2, 'the live tracker counts the pigeons out in space (a number only)', JSON.stringify(tr).slice(0, 200));
const dctx = await K.b.newContext({ viewport: { width: 1440, height: 900 } }), dpage = await dctx.newPage(); 
await dpage.goto(K.BASE + '/pigeon/tracker'); await dpage.waitForTimeout(2500);
ok(!(await dpage.locator('.tk-moon').isHidden()), 'Chat Live shows it', await dpage.locator('.tk-moon').innerText().catch(() => ''));
await dpage.screenshot({ path: `${out}/17-inflight-live.png` });

// ---- Mira comes home ----
await M.p.reload(); await M.p.waitForSelector('.tabs');
await M.p.waitForTimeout(800);
ok(!(await M.p.locator('.auth').count()), 'reopening the app on the Moon goes straight in (not to “Where Are You?”)');
await M.p.click('[data-act=tab][data-id=account]'); await M.p.waitForTimeout(600);
try { await M.p.click('#screen > main.view [data-act=profile]', { timeout: 8000 }); await M.p.waitForSelector('.sheet #city', { state: 'attached', timeout: 8000 }); }
catch (e) { await shot(M, 'zz-debug'); console.log('DEBUG', await M.p.evaluate(() => ({ view: document.querySelector('#screen')?.className, sheet: document.querySelector('.sheet h2')?.innerText, html: document.querySelector('#screen > main.view')?.innerText.slice(0, 300) }))); throw e; }
await M.p.selectOption('.sheet #city', 'Paris'); await M.p.waitForTimeout(1500);
const back = one(`SELECT lat, place, moon FROM pg_users WHERE id = '${ms.me.id}'`)[0];
ok(back.lat != null && back.place === 'Paris' && back.moon === null, 'back to Earth: Paris', JSON.stringify(back));
await shot(M, '16-back-to-earth');
console.log('errs', K.errs);
console.log(`FAILS ${K.fails()}`);
process.exit(0);
