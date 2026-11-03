// Make it a plan (Chat 1.64): a ride card sent as an invite, with a window dry for both (none before it lands, plus
// half an hour); the timed landings off while it's a plan; Yes puts it in both people's Fitness to add (and changes
// no one's plan), Later offers the other times and the inviter answers Yes or No, No adds nothing; an invite whose time
// has passed can't be answered. Today First (spec §8.4): the inviter's own row made as the invite goes (pending), and
// the friend's Yes, from the friend's phone alone, making it a plan to add in the inviter's Fitness, with the friend's
// id on both (and the same for a call: td_times), with the inviter's page shut; the inviter's later backstop adding no
// second row. (Sent as §8.4's table has Chat send them; Chat's own client sends them from batch C on.)
// (Open-Meteo for the server (WXAPP_URL, :8794) is handed to the weather stand-in (:8796): 'share-dry-window', dry
// 10:00–12:00 every day at every place.)
import http from 'http';
import { kit } from './lib.mjs';
import { chatHash, planWords } from '../../pigeon/cards.js';
const [,, S, out] = process.argv;
const K = await kit(S, out);
const { ok, sql, one, api, sess, openChat } = K;
const H = 3600e3;
http.createServer((q, s) => { const r = http.request({ host: '127.0.0.1', port: 8796, path: q.url, method: q.method, headers: q.headers }, (x) => { s.writeHead(x.statusCode, x.headers); x.pipe(s); }); r.on('error', () => { s.writeHead(502); s.end(); }); q.pipe(r); }).listen(8794, '127.0.0.1');
await fetch('http://127.0.0.1:8796/mode', { method: 'POST', body: JSON.stringify({ speed: 0, pattern: 'share-dry-window' }) });

const G = await K.phone('george'), M = await K.phone('mira');
await K.signup(G, 'George Farrow-Green', 'geo', 'george@example.com', 'London');
await K.signup(M, 'Mira Okafor', 'mira', 'mira@example.com', 'Norwich');
const [gs, ms] = [await sess(G), await sess(M)];
await api(gs.token, 'friends', { handle: ms.me.handle }); await api(ms.token, 'friends-respond', { id: gs.me.id, accept: true });
const reload = async (ph) => { await ph.p.reload(); await ph.p.waitForSelector('.tabs'); await ph.p.waitForTimeout(600); };
await reload(G); await reload(M);
const count = (t) => Number(one(`SELECT COUNT(*) AS n FROM ${t}`)[0]?.n || 0);
const land = (where) => sql(`UPDATE pg_msgs SET sent_at = ${Date.now() - 2 * H}, deliver_at = ${Date.now() - 2000} WHERE ${where}`);
const newest = (from) => one(`SELECT id FROM pg_msgs WHERE sender = '${from}' ORDER BY rowid DESC LIMIT 1`)[0]?.id;
const text = async (ph, sel) => ((await ph.p.locator(sel).last().textContent().catch(() => '')) || '').replace(/\s+/g, ' ');
const lofts = (id) => sql(`UPDATE pg_users SET swift = 9, swift_at = ${Date.now()} WHERE id = '${id}'`);
// (the tables the server makes as it's first asked: made here with the same words, so they can be read before then)
sql(`CREATE TABLE IF NOT EXISTS fx_offers (user_id TEXT NOT NULL, id TEXT NOT NULL, start INTEGER NOT NULL, stop INTEGER NOT NULL, tz TEXT NOT NULL, sport TEXT NOT NULL, wid TEXT NOT NULL, name TEXT NOT NULL, secs INTEGER NOT NULL, who TEXT NOT NULL, role TEXT NOT NULL, far INTEGER NOT NULL DEFAULT 0, dry INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'new', made INTEGER NOT NULL, until INTEGER NOT NULL, PRIMARY KEY (user_id, id))`);
const fxState = () => sql('SELECT * FROM fx_state ORDER BY user_id').replace(/"duration": [\d.]+/g, '');
const state0 = fxState();

const today = new Date().toISOString().slice(0, 10);
const fcard = { v: 1, kind: 'fitness', from: 'fitness', at: Date.now() - 60e3, say: 'Today: Endurance 75.',
  snap: { day: today, tz: 'Europe/London', sport: 'ride', name: 'Endurance 75', kind: 'Endurance', wid: 'endurance-75', secs: 4500, tss: 62, best: null, done: null } };
// George's invite, from a ride card: → the together answer's windows and the earliest asked for
async function invite(shot) {
  lofts(gs.me.id); await reload(G);
  await G.p.evaluate((h) => { location.hash = h; }, chatHash(fcard.say, fcard));
  await G.p.waitForSelector(`.sheet [data-act=sendpick][data-id="${ms.me.id}"]`, { timeout: 10000 });
  await G.p.click(`.sheet [data-act=sendpick][data-id="${ms.me.id}"]`);
  const answer = G.p.waitForResponse((r) => /\/api\/pigeon\/together\?/.test(r.url()), { timeout: 20000 }).catch(() => null);
  const t0 = Date.now();
  await G.p.click('.sheet [data-act=sendplan]');
  const r = await answer, j = r ? await r.json().catch(() => ({})) : {}, after = r ? Number(new URL(r.url()).searchParams.get('after')) : NaN;
  await G.p.waitForSelector('.sheet .planbox, .sheet [data-act=sendplan][aria-checked=false]', { timeout: 20000 }).catch(() => {});
  await G.p.waitForTimeout(400);
  const timedOff = await G.p.locator('.sheet [data-act=sendwhen][data-id=morning]').isDisabled();
  if (shot) await G.p.screenshot({ path: `${out}/plan-sheet.png` });
  await G.p.click('.sheet [data-act=sendgo]'); await G.p.waitForSelector('.sheet', { state: 'detached', timeout: 20000 }).catch(() => {});
  const id = newest(gs.me.id); land(`id = '${id}'`);
  return { j, after, timedOff, id, t0 };
}
const answer = async (a, pickLater) => {
  lofts(ms.me.id); await reload(M); await openChat(M, gs.me.id);
  await M.p.waitForSelector('.msgs [data-act=planans]', { timeout: 15000 }).catch(() => {});
  await M.p.locator(`.msgs [data-act=planans][data-a=${a}]`).last().click(); await M.p.waitForTimeout(800);
  if (pickLater) { await M.p.locator('.msgs [data-act=planlater]').last().click({ timeout: 8000 }).catch(() => {}); await M.p.waitForTimeout(800); }
  await M.p.waitForTimeout(1500);
};

// ---- an invite: windows dry for both, none before it lands + 30 min; the timed landings off ----
const one1 = await invite(true);
const ws = one1.j.windows || [];
ok(ws.length > 0 && ws.every((w) => w.dry), 'windows dry for both', JSON.stringify(ws.map((w) => [new Date(w.start).toISOString(), w.dry])));
// (the flight London–Norwich as Chat works it out: 80 km/h, twice that for a swift, the fastest George could have had; five minutes either way)
const [ga, ma] = [gs.me.id, ms.me.id].map((id) => one(`SELECT lat, lon FROM pg_users WHERE id = '${id}'`)[0]);
const rad = (d) => (d * Math.PI) / 180, km = 12742 * Math.asin(Math.sqrt(Math.sin(rad(ma.lat - ga.lat) / 2) ** 2 + Math.cos(rad(ga.lat)) * Math.cos(rad(ma.lat)) * Math.sin(rad(ma.lon - ga.lon) / 2) ** 2));
const flight = Math.min(3 * 864e5, Math.max(5 * 60e3, (km / 80) * H)) / 2;
ok(Number.isFinite(one1.after) && ws.every((w) => w.start >= one1.after) && one1.after >= one1.t0 + flight + 30 * 60e3 - 5 * 60e3, 'none starts before it lands, plus half an hour', `${new Date(one1.after).toISOString()} vs at least ${new Date(one1.t0 + flight + 25 * 60e3).toISOString()} (${Math.round(km)} km)`);
ok(!JSON.stringify(one1.j).match(/"lat"|"lon"/), 'the answer names no place');
ok(one1.timedOff, 'with Make It a Plan on, the timed landings are off');
await reload(M); await openChat(M, gs.me.id);
await M.p.waitForSelector('.msgs .cd-invite', { timeout: 15000 }).catch(() => {});
ok(/Ride (together|at the same time)\?/.test(await text(M, '.msgs')) && !!(await M.p.$('.msgs [data-act=planans][data-a=yes]')), 'Mira: the invite, with Yes / Later / No', await text(M, '.msgs .cd-invite'));
await M.p.screenshot({ path: `${out}/plan-invite.png` });

// ---- Yes: in Fitness for both to add; no one's plan changed ----
await answer('yes');
ok(count(`fx_offers WHERE user_id = '${ms.me.id}' AND role = 'answered'`) === 1, 'Yes: in Mira’s Fitness, to add (answered)');
land(`id = '${newest(ms.me.id)}'`);
await reload(G); await openChat(G, ms.me.id); await G.p.waitForTimeout(2500);
ok(/Mira: Yes, .*✓/.test(await text(G, '.msgs')), 'George: “Mira: Yes, … ✓”', await text(G, '.msgs .cd-answer'));
ok(count(`fx_offers WHERE user_id = '${gs.me.id}' AND role = 'asked'`) === 1, 'and in George’s Fitness, to add (asked)');
ok(fxState() === state0, 'nobody’s Fitness plan changed');
await G.p.click('.chatnav .back'); await G.p.waitForTimeout(400);

// ---- Later, with another time: George gets Yes / No ----
await invite();
await answer('later', true);
land(`id = '${newest(ms.me.id)}'`);
await reload(G); await openChat(G, ms.me.id);
await G.p.waitForSelector('.msgs .cd-answer [data-act=planans][data-a=yes]', { timeout: 15000 }).catch(() => {});
ok(/Mira: Later suits me better/.test(await text(G, '.msgs')) && !!(await G.p.$('.msgs .cd-answer [data-act=planans][data-a=no]')) && !(await G.p.$('.msgs .cd-answer [data-act=planans][data-a=later]')), 'Later: George answers Yes or No', await text(G, '.msgs .cd-answer'));
await G.p.click('.chatnav .back'); await G.p.waitForTimeout(400);

// ---- No: nothing added ----
const o0 = count('fx_offers');
await invite();
await answer('no');
ok(count('fx_offers') === o0, 'No: nothing in anyone’s Fitness');
ok(fxState() === state0, 'and no plan changed');

// ---- typed words, then another time picked: the letter names the time picked, never the earlier one ----
{
  lofts(gs.me.id); await reload(G);
  await G.p.evaluate((h) => { location.hash = h; }, chatHash(fcard.say, fcard));
  await G.p.waitForSelector(`.sheet [data-act=sendpick][data-id="${ms.me.id}"]`, { timeout: 10000 });
  await G.p.click(`.sheet [data-act=sendpick][data-id="${ms.me.id}"]`);
  const got = G.p.waitForResponse((r) => /\/api\/pigeon\/together\?/.test(r.url()), { timeout: 20000 }).catch(() => null);
  await G.p.click('.sheet [data-act=sendplan]');
  const tr = await got, tj = tr ? await tr.json().catch(() => ({})) : {}, tw = tj.windows || [];
  await G.p.waitForSelector('.sheet [data-act=planpick]', { timeout: 20000 }).catch(() => {});
  const pw = (w) => planWords({ sport: 'ride', start: w.start, end: w.end, dry: !!w.dry, far: !!tj.far }, { tz: 'Europe/London' });
  const w0 = await G.p.inputValue('#f-sendwords');
  await G.p.fill('#f-sendwords', `${w0} Fancy it?`); await G.p.waitForTimeout(200);
  await G.p.click('.sheet [data-act=planpick][data-id="1"]').catch(() => {}); await G.p.waitForTimeout(400);
  const w1 = await G.p.inputValue('#f-sendwords');
  ok(tw.length > 1 && w0 === pw(tw[0]) && w1 === `${pw(tw[1])} Fancy it?`, 'typed words, then another time: the box names the time picked, the typed words kept', `${w0} → ${w1} (${tw.length} windows)`);
  await G.p.click('.sheet [data-act=sendgo]'); await G.p.waitForSelector('.sheet', { state: 'detached', timeout: 20000 }).catch(() => {});
  const id = newest(gs.me.id); land(`id = '${id}'`);
  await reload(M); await openChat(M, gs.me.id); await M.p.waitForTimeout(1500);
  const said = ((await M.p.locator(`.msgs [data-mid="${id}"]`).textContent().catch(() => '')) || '').replace(/\s+/g, ' ');
  ok(tw.length > 1 && said.includes(`${pw(tw[1])} Fancy it?`) && !said.includes(pw(tw[0])), 'and Mira’s letter says only that time', said);
  await G.p.click('.chatnav .back').catch(() => {}); await G.p.waitForTimeout(400);
}

// ---- a Yes whose reply never came (it reached the server): tapped again, one letter and one offer, not two ----
{
  const inv = await invite();
  lofts(ms.me.id); await reload(M); await openChat(M, gs.me.id);
  await M.p.waitForSelector(`.msgs [data-mid="${inv.id}"] [data-act=planans][data-a=yes]`, { timeout: 15000 }).catch(() => {});
  const sent = () => count(`pg_msgs WHERE sender = '${ms.me.id}'`), offers = () => count(`fx_offers WHERE user_id = '${ms.me.id}' AND role = 'answered'`);
  const [s0, o0] = [sent(), offers()];
  let cut = true;
  const isMsgs = (u) => u.pathname === '/api/pigeon/messages', isSync = (u) => u.pathname === '/api/pigeon/sync';
  await M.ctx.route(isMsgs, async (route) => { if (cut && route.request().method() === 'POST') { await route.fetch().catch(() => {}); return route.abort('timedout'); } return route.continue(); });
  await M.ctx.route(isSync, (route) => (cut ? route.abort('failed') : route.continue()));     // (no sync in between brings the letter in)
  await M.p.click(`.msgs [data-mid="${inv.id}"] [data-act=planans][data-a=yes]`);
  await M.p.waitForFunction(() => [...document.querySelectorAll('.toast')].some((t) => /No signal/.test(t.innerText)), null, { timeout: 30000 }).catch(() => {});
  ok(sent() === s0 + 1, 'Yes, its reply lost: the letter did reach the server', `${sent() - s0}`);
  cut = false;
  // the buttons still there to tap again; or, the chat having heard from the server since (Chat 1.67's pulse), the Yes
  // already in it and its buttons gone, the Fitness plan made all the same
  const YES = `.msgs [data-mid="${inv.id}"] [data-act=planans][data-a=yes]`;
  // (seen: Mira's own answer, the letter that reached the server, in her chat; not any "Yes" on the screen)
  const answer = newest(ms.me.id), hers = () => M.p.waitForSelector(`.msgs [data-mid="${answer}"]`, { timeout: 8000 }).then(() => true, () => false);
  const again = await M.p.$(YES);
  // (by its selector, and only while it's there: Chat may draw the chat again between finding the button and tapping it,
  // and then it's her answer that must be there)
  const tapped = !!again && await M.p.click(YES, { timeout: 5000 }).then(() => true, () => false);
  const seen = !tapped && await hers();
  ok(tapped || seen, 'the buttons still there to tap again, or Mira’s own Yes already in the chat', tapped ? 'tapped' : seen ? 'seen' : 'neither');
  await M.p.waitForTimeout(2500);
  ok(sent() === s0 + 1 && offers() === o0 + 1, 'tapped again: one letter and one offer in Mira’s Fitness, not two', `${sent() - s0} letters, ${offers() - o0} offers`);
  await M.ctx.unroute(isMsgs).catch(() => {}); await M.ctx.unroute(isSync).catch(() => {});
}

// ---- an invite whose time has passed: said so, no buttons ----
const start = Math.floor((Date.now() - 3 * H) / H) * H;
lofts(gs.me.id);
const past = await G.p.evaluate(async ({ to, plan }) => {
  const { E2E } = await import('/pigeon/crypto.js');
  const s = await new Promise((res) => { const r = indexedDB.open('inflight'); r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('session'); g.onsuccess = () => res(g.result); }; });
  const sync = await (await fetch('/api/pigeon/sync', { headers: { Authorization: 'Bearer ' + s.token } })).json();
  const f = sync.friends.find((x) => x.id === to), id = crypto.randomUUID();
  const ct = await E2E.seal(await E2E.pair(s.priv, f.pub), { id, from: s.me.id, to, type: 'msg' }, { t: 'Ride together? Earlier today, dry for both.', plan });
  const r = await fetch('/api/pigeon/messages', { method: 'POST', headers: { Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ id, to, ct, pigeon: 'swift' }) });
  return { status: r.status, id };
}, { to: ms.me.id, plan: { sport: 'ride', wid: 'free-ride', name: 'Ride how you like', secs: 7200, start, end: start + 2 * H, tz: 'Europe/London', opts: [], dry: true, far: false } });
land(`id = '${past.id}'`);
await reload(M); await openChat(M, gs.me.id); await M.p.waitForTimeout(1500);
const pastCard = await M.p.locator(`.msgs [data-mid="${past.id}"]`).textContent().catch(() => '');
ok(/This time has passed\./.test(pastCard) && !(await M.p.$(`.msgs [data-mid="${past.id}"] [data-act=planans]`)), 'a passed invite: “This time has passed.”, no buttons', pastCard);

// ---- Today First: the inviter's row made as the invite goes; the friend's Yes makes it a plan, the inviter's page shut ----
{
  const hourAt = (h) => Math.ceil(Date.now() / H) * H + h * H, q15 = (h) => Math.ceil(Date.now() / 9e5) * 9e5 + h * H;
  const plan = { tz: 'Europe/London', sport: 'ride', wid: 'free-ride', name: 'Ride how you like', secs: 7200, far: false, dry: true };
  const inv = crypto.randomUUID(), call = crypto.randomUUID(), [s1, s2] = [hourAt(30), hourAt(54)], [c1, c2] = [q15(3), q15(5)];
  // George's Chat, as it sends the invite: his own pending rows (a ride and a call), with the other times offered
  const [a1] = await api(gs.token, 'fit-offer', { ...plan, id: inv, start: s1, stop: s1 + 2 * H, opts: [[s2, s2 + 2 * H]], who: 'Mira', role: 'asked', with: ms.me.id, state: 'pending' });
  const [a2] = await api(gs.token, 'time-offer', { id: call, kind: 'call', start: c1, stop: c1 + 30 * 60e3, tz: 'Europe/London', opts: [[c2, c2 + 30 * 60e3]], with: ms.me.id, role: 'asked', state: 'pending' });
  ok(a1 === 200 && a2 === 200, 'George’s invites: his own pending rows as they go', `${a1} ${a2}`);
  ok(one(`SELECT state FROM fx_offers WHERE user_id = '${gs.me.id}' AND id = '${inv}'`)[0]?.state === 'pending', 'a pending ride, not yet in his Fitness');
  // George's Chat shut from here on: nothing more from his page (counted once it's gone, so a sync or pulse his page
  // began just before can't count)
  await G.p.goto('about:blank');
  let fromG = 0;
  G.p.on('request', (r) => { if (r.url().includes('/api/')) fromG++; });
  // Mira's Yes, from her phone alone, at the other times George offered
  const answer = crypto.randomUUID();
  const [y1] = await api(ms.token, 'fit-offer', { ...plan, id: answer, start: s2, stop: s2 + 2 * H, who: 'George', role: 'answered', with: gs.me.id, re: inv });
  const [y2] = await api(ms.token, 'time-offer', { id: call, kind: 'call', start: c2, stop: c2 + 30 * 60e3, tz: 'Europe/London', with: gs.me.id, role: 'answered' });
  ok(y1 === 200 && y2 === 200, 'Mira’s Yes to both', `${y1} ${y2}`);
  const g = one(`SELECT state, start, with_id, role FROM fx_offers WHERE user_id = '${gs.me.id}' AND id = '${inv}'`)[0] || {};
  ok(g.state === 'new' && g.start === s2 && g.with_id === ms.me.id && g.role === 'asked', 'the ride in George’s Fitness to add, at Mira’s time, with her id, his page shut', JSON.stringify(g));
  const m = one(`SELECT with_id, role FROM fx_offers WHERE user_id = '${ms.me.id}' AND id = '${answer}'`)[0] || {};
  ok(m.with_id === gs.me.id && m.role === 'answered', 'with_id on Mira’s Yes: George’s id on her plan', JSON.stringify(m));
  const tt = one(`SELECT user_id, state, start, with_id FROM td_times WHERE id = '${call}' ORDER BY user_id = '${gs.me.id}' DESC`);
  ok(tt.length === 2 && tt.every((x) => x.state === 'yes' && x.start === c2) && tt[0].with_id === ms.me.id && tt[1].with_id === gs.me.id, 'the call agreed for both, George’s page shut', JSON.stringify(tt));
  ok(fromG === 0, 'and not one request from George’s page since the invite', String(fromG));
  // George's Chat, next time it draws the Yes (offerSoon, as an older Chat sends it): no second plan; his sync says both
  const n0 = Number(one(`SELECT COUNT(*) AS n FROM fx_offers WHERE user_id = '${gs.me.id}'`)[0]?.n);
  await api(gs.token, 'fit-offer', { ...plan, id: answer, start: s2, stop: s2 + 2 * H, who: 'Mira', role: 'asked' });
  ok(Number(one(`SELECT COUNT(*) AS n FROM fx_offers WHERE user_id = '${gs.me.id}'`)[0]?.n) === n0, 'offerSoon’s later call adds no second plan');
  const [, sy] = await api(gs.token, 'sync?quiet=1');
  ok((sy.rides || []).some((r) => r.id === inv && r.with === ms.me.id && r.state === 'new') && (sy.times || []).some((x) => x.id === call && x.with === ms.me.id && x.start === c2),
    'George’s sync: the ride and the call with Mira', JSON.stringify({ rides: sy.rides, times: sy.times }));
}

const errs = K.errs.filter((e) => !/Failed to load|net::|404|429|navigator\.vibrate/.test(e));     // (a landing's haptic on a page not tapped since it reloaded: the browser's rule, not an error of ours)
ok(!errs.length, 'no errors on any page', errs.join(' | '));
console.log(`FAILS ${K.fails()}`);
await K.b.close(); process.exit(0);
