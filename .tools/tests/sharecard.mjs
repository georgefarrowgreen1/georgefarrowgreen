// Send to a Friend, smarter (Chat 1.64): an app's card link opens Chat's sheet, friends ranked for the card, sent one
// letter at a time inside the sealed payload (padded to a size bucket), drawn in the letter with "When sent" and
// "Now". The old #share= link still works as before; old and broken letters still draw; nothing about a card reaches a
// notification or the server in the clear; only public cards of a friend's can be sent on; and a send that fails
// keeps who it failed for, takes back a share id no letter carries, and is never sent twice.
// (Open-Meteo for the server's live "Now" (WXAPP_URL, :8794) is handed to the weather stand-in (:8796), so its
// 'share-…' patterns answer both.)
import http from 'http';
import { kit } from './lib.mjs';
import { chatHash } from '../../pigeon/cards.js';
const [,, S, out] = process.argv;
const K = await kit(S, out);
const { ok, sql, one, api, sess, openChat, say } = K;
const H = 3600e3, DAY = 864e5;
http.createServer((q, s) => { const r = http.request({ host: '127.0.0.1', port: 8796, path: q.url, method: q.method, headers: q.headers }, (x) => { s.writeHead(x.statusCode, x.headers); x.pipe(s); }); r.on('error', () => { s.writeHead(502); s.end(); }); q.pipe(r); }).listen(8794, '127.0.0.1');
const wx = (m) => fetch('http://127.0.0.1:8796/mode', { method: 'POST', body: JSON.stringify(m) });
// (raining everywhere from the start: the server keeps a cell's forecast half an hour, so the first look is the one kept)
await wx({ speed: 0, pattern: 'share-wet' });

// ---- George (London), Mira (Norwich, with push), Pat (Paris) ----
const mKeys = await K.makeKeys();
const G = await K.phone('george'), M = await K.phone('mira', mKeys), P = await K.phone('pat');
await K.signup(G, 'George Farrow-Green', 'geo', 'george@example.com', 'London');
await K.signup(M, 'Mira Okafor', 'mira', 'mira@example.com', 'Norwich');
await K.signup(P, 'Pat Lee', 'pat', 'pat@example.com', 'Paris');
const [gs, ms, ps] = [await sess(G), await sess(M), await sess(P)];
for (const x of [ms, ps]) { await api(gs.token, 'friends', { handle: x.me.handle }); await api(x.token, 'friends-respond', { id: gs.me.id, accept: true }); }
await K.pushOn(M);
const reload = async (ph) => { await ph.p.reload(); await ph.p.waitForSelector('.tabs'); await ph.p.waitForTimeout(600); };
await reload(G);
const toastText = (ph) => ph.p.locator('.toast').last().innerText().catch(() => '');
const hashTo = (ph, h) => ph.p.evaluate((h) => { location.hash = h; }, h);
const lofts = (id, n) => sql(`UPDATE pg_users SET swift = ${n}, swift_at = ${Date.now()}, turbo = 0, turbo_at = ${Date.now()}, rocket = 0, rocket_at = ${Date.now()} WHERE id = '${id}'`);
// A letter sealed on a phone as Chat seals one (its own key, the friend's from sync), with whatever payload is given
const sealSend = (ph, to, payload, pigeon = 'swift') => ph.p.evaluate(async ({ to, payload, pigeon }) => {
  const { E2E } = await import('/pigeon/crypto.js');
  const s = await new Promise((res) => { const r = indexedDB.open('inflight'); r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('session'); g.onsuccess = () => res(g.result); }; });
  const sync = await (await fetch('/api/pigeon/sync', { headers: { Authorization: 'Bearer ' + s.token } })).json();
  const f = sync.friends.find((x) => x.id === to), id = crypto.randomUUID();
  const ct = await E2E.seal(await E2E.pair(s.priv, f.pub), { id, from: s.me.id, to, type: 'msg' }, payload);
  const r = await fetch('/api/pigeon/messages', { method: 'POST', headers: { Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ id, to, ct, pigeon }) });
  return { status: r.status, id };
}, { to, payload, pigeon });
const land = (where) => sql(`UPDATE pg_msgs SET sent_at = ${Date.now() - 2 * H}, deliver_at = ${Date.now() - 2000} WHERE ${where}`);

const CELL = [52.65, 1.3];
const wcard = (over = {}) => ({ v: 1, kind: 'weather', from: 'weather', at: Date.now() - 60e3, say: 'Dry in Norwich for now.',
  snap: { place: 'Norwich', tz: 'Europe/London', temp: 12.4, feels: 10.9, code: 2, isDay: true, hi: 14.1, lo: 8, lead: 'Dry for now.', rain: null, spell: null }, ref: { cell: CELL }, ...over });
const fcard = { v: 1, kind: 'fitness', from: 'fitness', at: Date.now() - 60e3, say: 'Today: Endurance 75.',
  snap: { day: new Date().toISOString().slice(0, 10), tz: 'Europe/London', sport: 'ride', name: 'Endurance 75', kind: 'Endurance', wid: 'free-ride', secs: 4500, tss: 62, best: null, done: null } };

// ---- 1. an old link, words only: in the next chat's message box, with the same toast as before ----
await hashTo(G, '#share=' + encodeURIComponent('Rolls-Royce is up 1.2% today.'));
await G.p.waitForSelector('.toast:has-text("Pick who to send it to")', { timeout: 10000 }).catch(() => {});
ok(/Pick who to send it to\. It’s waiting in the message box\./.test(await toastText(G)), '1. an old #share= link: the same toast', await toastText(G));
ok(!(await G.p.$('.sheet')), '1. and no sheet');
await openChat(G, ms.me.id);
ok((await G.p.inputValue('#msg')).includes('Rolls-Royce is up 1.2% today.'), '1. the words wait in the next chat’s box', await G.p.inputValue('#msg'));
await G.p.fill('#msg', ''); await G.p.click('.chatnav .back'); await G.p.waitForTimeout(500);

// ---- 2. a card link: the sheet, with the card and the words; no toast ----
const nToasts = await G.p.locator('.toast').count();
await hashTo(G, chatHash('Rain later in Norwich, I hear.', wcard()));
await G.p.waitForSelector('.sheet h2:text-is("Send to a Friend")', { timeout: 10000 }).catch(() => {});
ok(!!(await G.p.$('.sheet h2:text-is("Send to a Friend")')), '2. a card link opens Send to a Friend');
const sheetCard = (await G.p.locator('.sheet .cd-card').first().textContent().catch(() => '') || '').replace(/\s+/g, ' ');
ok(/Weather · Norwich/.test(sheetCard), '2. with the card drawn', sheetCard);
ok((await G.p.inputValue('#f-sendwords')) === 'Rain later in Norwich, I hear.', '2. and the link’s words in its box', await G.p.inputValue('#f-sendwords'));
ok(!/Pick who to send it to/.test(await G.p.locator('.toasts').innerText().catch(() => '')) || (await G.p.locator('.toast').count()) <= nToasts, '2. no toast');
ok(!(await G.p.evaluate(() => location.hash)), '2. the card is out of the address at once');
await G.p.screenshot({ path: `${out}/sheet.png` });
await G.p.click('.sheet header [data-act=close]'); await G.p.waitForTimeout(500);

// ---- 3. ranking, and pigeons counted as they're picked ----
// George writes to both first (his free turns, so neither turn is free now); one swift pigeon left, nothing faster
await openChat(G, ms.me.id); await say(G, 'standard', 'Morning Mira');
await openChat(G, ps.me.id); await say(G, 'standard', 'Morning Pat');
const wordsOnly = one(`SELECT LENGTH(ct) AS n FROM pg_msgs WHERE sender = '${gs.me.id}' AND recipient = '${ms.me.id}'`)[0]?.n;
lofts(gs.me.id, 1);
// (Pat's streak with George: 5 days, nothing sent today, three hours left: as the server would say it late in the day)
await G.ctx.route('**/api/pigeon/sync*', async (route) => {
  const r = await route.fetch(); const j = await r.json().catch(() => null);
  if (j?.friends) for (const f of j.friends) if (f.id === ps.me.id) f.streak = { n: 5, today: false, endsAt: Date.now() + 3 * H, best: 7 };
  await route.fulfill({ response: r, json: j });
});
await G.p.click('.chatnav .back'); await reload(G);
await hashTo(G, chatHash('Dry in Norwich for now.', wcard()));
await G.p.waitForSelector('.sheet [data-act=sendpick]', { timeout: 10000 });
const rowOf = (id) => G.p.locator(`.sheet [data-act=sendpick][data-id="${id}"]`);
const patRow = await rowOf(ps.me.id).innerText();
ok(/Your 5-day streak ends tonight/.test(patRow), '3. a streak at risk is the reason', patRow);
const allRows = await G.p.locator('.sheet .sendrow').allInnerTexts();
ok(allRows.some((r) => /Lands in /.test(r)), '3. rows say when it lands', allRows.join(' | '));
await rowOf(ms.me.id).click(); await G.p.waitForTimeout(400);
const patAfter = await rowOf(ps.me.id).innerText(), patOff = await rowOf(ps.me.id).isDisabled();
ok(/No pigeon free just now/.test(patAfter) && patOff, '3. one swift pigeon, picked for Mira: Pat greys out', patAfter);
const spend = await G.p.locator('.sheet .sendgo .spend').innerText().catch(() => '');
ok(spend === 'Uses a swift pigeon', '3. the line says what it spends', spend);
ok(/Send a Pigeon to Mira/.test(await G.p.locator('.sheet [data-act=sendgo]').innerText()), '3. the button names who');
await G.p.screenshot({ path: `${out}/sheet-ranked.png` });
await G.p.click('.sheet header [data-act=close]'); await G.p.waitForTimeout(400);
await G.ctx.unroute('**/api/pigeon/sync*');

// ---- 4. to two friends: one letter after the other, padded, sealed; a chat's own landing time untouched ----
lofts(gs.me.id, 5); await reload(G);
await openChat(G, ms.me.id);
await G.p.click('.compose .kind'); await G.p.waitForSelector('.sheet [data-act=schedset]', { timeout: 10000 });
await G.p.locator('.sheet [data-act=schedset]', { hasText: 'Tomorrow Morning' }).first().click(); await G.p.waitForTimeout(300);
await G.p.click('.sheet header [data-act=close]').catch(() => {}); await G.p.waitForTimeout(400);
const hint0 = await G.p.getAttribute('#msg', 'placeholder');
ok(/^Lands \w{3} 08:00$/.test(hint0), '4. Mira’s chat is set to land tomorrow morning', hint0);
await G.p.click('.chatnav .back'); await G.p.waitForTimeout(400);
const n0 = Number(one('SELECT COUNT(*) AS n FROM pg_msgs')[0].n), pushAt = Date.now();
await hashTo(G, chatHash('Dry in Norwich for now.', wcard()));
await G.p.waitForSelector('.sheet [data-act=sendpick]', { timeout: 10000 });
await rowOf(ms.me.id).click(); await rowOf(ps.me.id).click(); await G.p.waitForTimeout(300);
ok(/Send 2 Pigeons to (Mira and Pat|Pat and Mira)/.test(await G.p.locator('.sheet [data-act=sendgo]').innerText()), '4. two picked', await G.p.locator('.sheet [data-act=sendgo]').innerText());
await G.p.click('.sheet [data-act=sendgo]');
await G.p.waitForSelector('.sheet', { state: 'detached', timeout: 20000 }).catch(() => {});
const sentSay = await toastText(G);
const card2 = one(`SELECT id, recipient, ct, sched, sent_at FROM pg_msgs ORDER BY rowid DESC LIMIT 2`);
ok(Number(one('SELECT COUNT(*) AS n FROM pg_msgs')[0].n) === n0 + 2 && /^Sent · /.test(sentSay), '4. two letters went, no “Another pigeon just left”', sentSay);
ok(card2.every((r) => r.ct.length === wordsOnly), '4. each the size of a words-only letter (padded to the same bucket)', `${card2.map((r) => r.ct.length)} vs ${wordsOnly}`);
const rawRows = sql(`SELECT * FROM pg_msgs WHERE id IN ('${card2.map((r) => r.id).join("','")}')`);
ok(!/Norwich|"kind"|weather/i.test(rawRows.replace(/"to_place": "[^"]*"|"from_place": "[^"]*"/g, '')), '4. nothing of the card in the clear');
ok(card2.every((r) => !r.sched), '4. the sheet’s letters go as soon as they can (sched not set)', JSON.stringify(card2.map((r) => r.sched)));
await openChat(G, ms.me.id);
ok((await G.p.getAttribute('#msg', 'placeholder')) === hint0, '4. and Mira’s chat still lands tomorrow morning', await G.p.getAttribute('#msg', 'placeholder'));
// (George's own letter, on its way, a clear bubble in light mode: the card in it dark on light, not the blue bubble's white)
await G.p.waitForSelector('.msgs .b.me.up .cd-card', { timeout: 8000 }).catch(() => {});
const upInk = await G.p.evaluate(() => { const c = document.querySelector('.msgs .b.me.up .cd-card'); if (!c) return null; const rgb = (x) => (getComputedStyle(x).color.match(/\d+/g) || []).slice(0, 3).map(Number); return { big: rgb(c.querySelector('.cd-big') || c), head: rgb(c.querySelector('.cd-head') || c) }; });
await G.p.screenshot({ path: `${out}/card-on-its-way.png` });
ok(!!upInk && [upInk.big, upInk.head].every((v) => v.length === 3 && v.reduce((a, x) => a + x, 0) < 3 * 160), '4. on its way, the card’s words are dark (light mode)', JSON.stringify(upInk));
await G.p.click('.compose .kind'); await G.p.waitForSelector('.sheet [data-act=schednow]'); await G.p.click('.sheet [data-act=schednow]'); await G.p.waitForTimeout(300);
await G.p.click('.sheet header [data-act=close]').catch(() => {}); await G.p.click('.chatnav .back'); await G.p.waitForTimeout(400);

// ---- 5. landed: "When sent" dry, "Now" raining; and 8. its notification: no word of the card ----
land(`id = '${card2.find((r) => r.recipient === ms.me.id).id}'`);
await K.tick(); await G.p.waitForTimeout(1500);
const mp = await K.allPushes(mKeys, 'mira', pushAt);
ok(mp.length > 0 && !mp.some((x) => /Norwich|Dry in|weather|Rain/i.test(JSON.stringify(x))), '8. Mira’s notification carries no card words', JSON.stringify(mp.map((x) => x.body || x.title)));
const nowSaid = []; M.p.on('response', async (r) => { if (/\/api\/pigeon\/card-now/.test(r.url())) nowSaid.push(await r.text().catch(() => '')); });
await reload(M); await openChat(M, gs.me.id);
await M.p.waitForSelector('.msgs .cd-card', { timeout: 15000 }).catch(() => {});
const cardTxt = async () => ((await M.p.locator('.msgs .cd-card').last().textContent().catch(() => '')) || '').replace(/\s+/g, ' ');
ok(/When sent/.test(await cardTxt()) && /Now/.test(await cardTxt()), '5. the card: “When sent” and “Now”', await cardTxt());
await M.p.waitForFunction(() => /Changed since it was sent/.test(document.querySelector('.msgs')?.innerText || ''), null, { timeout: 20000 }).catch(() => {});
ok(/Changed since it was sent/.test(await cardTxt()) && /Raining in Norwich now\./.test(await cardTxt()), '5. the first answer: raining now, and said so', `${await cardTxt()} | card-now: ${nowSaid.join(' ')}`);
await M.p.screenshot({ path: `${out}/card-live.png` });

// ---- 7. old and broken letters all draw ----
lofts(gs.me.id, 9);
const odd = [];
odd.push((await sealSend(G, ms.me.id, { t: 'An old letter, words only' })).id);
odd.push((await sealSend(G, ms.me.id, { t: 'A letter with a broken card', c: { kind: 'weather', snap: 'nonsense', ref: 7 } })).id);
odd.push((await sealSend(G, ms.me.id, { t: 'A card in a zone that isn’t one', c: wcard({ say: 'Odd zone card.', snap: { ...wcard().snap, tz: 'x', place: 'Cromer' } }) })).id);
land(`id IN ('${odd.join("','")}')`);
await reload(M); await openChat(M, gs.me.id); await M.p.waitForTimeout(1500);
const mtxt = await M.p.locator('.msgs').innerText();
ok(/An old letter, words only/.test(mtxt) && /A letter with a broken card/.test(mtxt) && /A card in a zone that isn’t one/.test(mtxt), '7. each one draws its words', mtxt.slice(-400));
ok(!/couldn’t be opened/.test(mtxt), '7. none “couldn’t be opened”');
ok(/Weather · Cromer/.test((await M.p.locator('.msgs').textContent()).replace(/\s+/g, ' ')), '7. the odd zone’s card still draws (in the viewer’s zone)');

// ---- 9. sending a card on: a friend's fitness card can't be, a forecast can ----
lofts(gs.me.id, 9);
const fid = (await sealSend(G, ms.me.id, { t: 'Today: Endurance 75.', c: fcard })).id;
land(`id = '${fid}'`);
await reload(M); await openChat(M, gs.me.id); await M.p.waitForTimeout(1200);
const menuOf = async (id) => { await M.p.click(`.msgs [data-mid="${id}"] .cd-head`, { timeout: 8000 }); await M.p.waitForSelector('.menu-pop', { timeout: 5000 }).catch(() => {}); const t = await M.p.locator('.menu-pop').innerText().catch(() => ''); await M.p.keyboard.press('Escape'); await M.p.waitForTimeout(300); return t; };
ok(!/Send to a Friend/.test(await menuOf(fid)), '9. a friend’s fitness card: no “Send to a Friend”');
const wid = card2.find((r) => r.recipient === ms.me.id).id;
ok(/Send to a Friend/.test(await menuOf(wid)), '9. a friend’s forecast: “Send to a Friend”');
// 9c. a tall letter (a card in it) a little above the middle of a short screen (Chat in iOS's small browser): its
// menu is all on the screen, not run off the foot below the letter
await M.p.setViewportSize({ width: 390, height: 720 }); await M.p.waitForTimeout(400);
const tall = await M.p.evaluate(() => { const bs = [...document.querySelectorAll('.msgs [data-mid]')].filter((b) => b.querySelector('.cd-card')), b = bs.at(-1), v = b.closest('.view') || document.scrollingElement;
  const pad = Object.assign(document.createElement('div'), { id: 'zzpad' }); pad.style.height = '600px'; b.parentElement.append(pad);   // (room to scroll it up, as a longer chat has)
  v.scrollTop += b.getBoundingClientRect().top - innerHeight * 0.45; return b.dataset.mid; });
await M.p.waitForTimeout(300);
await M.p.click(`.msgs [data-mid="${tall}"] .cd-head`); await M.p.waitForSelector('.menu-pop'); await M.p.waitForTimeout(500);
const mr = await M.p.evaluate((id) => { const r = document.querySelector('.menu-pop').getBoundingClientRect(), b = document.querySelector(`.msgs [data-mid="${id}"]`).getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: innerHeight, bTop: Math.round(b.top), bBottom: Math.round(b.bottom) }; }, tall);
await M.p.screenshot({ path: `${out}/menu-tall-letter.png` });
ok(mr.top >= 0 && mr.bottom <= mr.h, '9c. a tall letter’s menu is all on a short screen', JSON.stringify(mr));
ok(mr.bTop > mr.h * 0.3 && mr.bTop < mr.h * 0.55 && mr.h - mr.bBottom < mr.bottom - mr.top + 18, '9c. (the letter a little above the middle, too little room for the menu under it)', JSON.stringify(mr));
await M.p.keyboard.press('Escape'); await M.p.waitForTimeout(300); await M.p.evaluate(() => document.getElementById('zzpad')?.remove()); await M.p.setViewportSize({ width: 390, height: 844 }); await M.p.waitForTimeout(300);

// ---- 9b. "Write More in the Chat" from inside that same chat: the words go in its box, not the next chat's ----
lofts(gs.me.id, 9); await reload(G);
await openChat(G, ms.me.id); await G.p.fill('#msg', '');
await hashTo(G, chatHash('Dry in Norwich for now.', wcard()));
await G.p.waitForSelector(`.sheet [data-act=sendpick][data-id="${ms.me.id}"]`, { timeout: 10000 });
await G.p.fill('#f-sendwords', 'Look at this rain');
await rowOf(ms.me.id).click(); await G.p.waitForTimeout(300);
await G.p.click('.sheet [data-act=sendchat]'); await G.p.waitForSelector('.sheet', { state: 'detached', timeout: 10000 }).catch(() => {});
await G.p.waitForTimeout(400);
ok((await G.p.inputValue('#msg')) === 'Look at this rain', '9b. from inside Mira’s chat: the words in her box', await G.p.inputValue('#msg'));
await G.p.fill('#msg', ''); if (await G.p.$('[data-act=cardrm]')) await G.p.click('[data-act=cardrm]');
await G.p.click('.chatnav .back'); await G.p.waitForTimeout(400);
await openChat(G, ps.me.id);
ok(!(await G.p.inputValue('#msg')).includes('Look at this rain'), '9b. and not waiting in the next chat opened', await G.p.inputValue('#msg'));
await G.p.click('.chatnav .back'); await G.p.waitForTimeout(400);

// ---- 6. "With Their Morning": a friend in New York, 07:30 their time ----
await wx({ speed: 0, pattern: '' });         // (calm skies: a pigeon booked to land at a time flies the way it was planned)
const nctx = await K.b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'America/New_York', userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' });
const N = { ctx: nctx, p: await nctx.newPage(), name: 'nia' };
await N.p.goto(K.URL);
await K.signup(N, 'Nia Brooks', 'nia', 'nia@example.com', 'New York');
const ns = await sess(N);
await api(gs.token, 'friends', { handle: 'nia' }); await api(ns.token, 'friends-respond', { id: gs.me.id, accept: true });
await reload(N); await N.p.waitForTimeout(1500);           // (her phone's zone reaches the server as it opens)
lofts(gs.me.id, 5); await reload(G);
await hashTo(G, chatHash('Dry in Norwich for now.', wcard()));
await G.p.waitForSelector(`.sheet [data-act=sendpick][data-id="${ns.me.id}"]`, { timeout: 10000 });
await rowOf(ns.me.id).click(); await G.p.click('.sheet [data-act=sendwhen][data-id=morning]'); await G.p.waitForTimeout(300);
const wl = await G.p.locator('.sheet .whenlines').innerText().catch(() => '');
ok(/Nia’s lands 07:30 .*their time/.test(wl), '6. the line says 07:30, their time', wl);
ok(/^Good morning\. /.test(await G.p.inputValue('#f-sendwords')), '6. words for the morning', await G.p.inputValue('#f-sendwords'));
await G.p.click('.sheet [data-act=sendgo]'); await G.p.waitForSelector('.sheet', { state: 'detached', timeout: 20000 }).catch(() => {});
const nrow = one(`SELECT sched, deliver_at FROM pg_msgs WHERE recipient = '${ns.me.id}' ORDER BY rowid DESC LIMIT 1`)[0];
const nyClock = nrow ? new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(nrow.deliver_at)) : '';
ok(nrow?.sched === 1 && nyClock === '07:30', '6. booked to land at 07:30 in New York', JSON.stringify({ ...nrow, nyClock, toast: await toastText(G) }));

// ---- 10. a send that fails: for one friend, for both, and a reply that never came ----
// (George's own ride card, so each send makes a Fitness share id: kept while a letter carries it, taken back when none does)
sql(`CREATE TABLE IF NOT EXISTS fx_shares (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, day TEXT NOT NULL, tz TEXT NOT NULL, sport TEXT NOT NULL, made INTEGER NOT NULL, until INTEGER NOT NULL)`);
const shares = () => Number(one(`SELECT COUNT(*) AS n FROM fx_shares WHERE user_id = '${gs.me.id}'`)[0]?.n || 0);
const sentTo = (id) => Number(one(`SELECT COUNT(*) AS n FROM pg_msgs WHERE sender = '${gs.me.id}' AND recipient = '${id}'`)[0]?.n || 0);
const refuse = new Set(), cut = new Set();
const msgsUrl = (u) => u.pathname === '/api/pigeon/messages';
await G.ctx.route(msgsUrl, async (route) => {
  const q = route.request(); let b = null; try { b = JSON.parse(q.postData() || 'null'); } catch (_) {}
  if (q.method() !== 'POST' || !b) return route.continue();
  if (refuse.has(b.to)) return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Check the new safety number first.' }) });
  if (cut.has(b.to)) { await route.fetch().catch(() => {}); return route.abort('timedout'); }     // (it reached the server; its reply never came)
  return route.continue();
});
const picked = async (id) => (await rowOf(id).getAttribute('aria-checked')) === 'true';
const lastToast = async (re) => { await G.p.waitForFunction((src) => [...document.querySelectorAll('.toast')].some((t) => new RegExp(src).test(t.innerText)), re.source, { timeout: 20000 }).catch(() => {}); return (await G.p.locator('.toast').allInnerTexts()).reverse().find((t) => re.test(t)) || await toastText(G); };
lofts(gs.me.id, 9); await reload(G);
await hashTo(G, chatHash(fcard.say, fcard));
await G.p.waitForSelector(`.sheet [data-act=sendpick][data-id="${ps.me.id}"]`, { timeout: 10000 });
// 10a. Pat's refused, Mira's goes: Pat stays picked, the sheet stays open, the share id stays (Mira's letter carries it)
const [sh0, m0, p0] = [shares(), sentTo(ms.me.id), sentTo(ps.me.id)];
refuse.add(ps.me.id);
await rowOf(ms.me.id).click(); await rowOf(ps.me.id).click(); await G.p.waitForTimeout(300);
await G.p.click('.sheet [data-act=sendgo]');
const t10a = await lastToast(/Couldn’t send to/);
await G.p.waitForTimeout(800);
ok(t10a === 'Couldn’t send to Pat: Check the new safety number first.', '10a. one refused: “Couldn’t send to Pat: …”', t10a);
ok(!!(await G.p.$('.sheet h2:text-is("Send to a Friend")')) && await picked(ps.me.id) && !(await picked(ms.me.id)), '10a. the sheet stays open, Pat still picked, Mira not');
ok(sentTo(ms.me.id) === m0 + 1 && sentTo(ps.me.id) === p0, '10a. Mira’s letter went, Pat’s didn’t', `${sentTo(ms.me.id) - m0}, ${sentTo(ps.me.id) - p0}`);
ok(shares() === sh0 + 1, '10a. the share id kept (a letter carries it)', `${shares() - sh0}`);
// 10b. both refused: nothing went, so the share id made for it is taken back
refuse.add(ms.me.id);
await rowOf(ms.me.id).click(); await G.p.waitForTimeout(300);
await G.p.click('.sheet [data-act=sendgo]');
const t10b = await lastToast(/Couldn’t send to (Mira and Pat|Pat and Mira)\./);
await G.p.waitForTimeout(1500);
ok(/^Couldn’t send to (Mira and Pat|Pat and Mira)\. Try again\.$/.test(t10b), '10b. both refused: “Couldn’t send to Mira and Pat. Try again.”', t10b);
ok(await picked(ms.me.id) && await picked(ps.me.id), '10b. both still picked');
ok(shares() === sh0 + 1, '10b. and the share id made for it taken back', `${shares() - sh0}`);
// 10c. Mira's reaches the server but its reply never comes: "No signal…", still picked; tried again, it isn't sent twice
refuse.clear(); cut.add(ms.me.id);
const m1 = sentTo(ms.me.id);
await G.p.click('.sheet [data-act=sendgo]');
await G.p.waitForSelector('.sheet .gfoot.bad', { timeout: 40000 }).catch(() => {});
const err10 = await G.p.locator('.sheet .gfoot.bad').innerText().catch(() => '');
ok(err10 === 'No signal. Try again when you have some.' && await picked(ms.me.id), '10c. no reply: “No signal…”, Mira still picked', err10);
ok(sentTo(ms.me.id) === m1 + 1, '10c. (the letter did reach the server)', `${sentTo(ms.me.id) - m1}`);
cut.clear();
await G.p.click('.sheet [data-act=sendgo]');
await G.p.waitForSelector('.sheet', { state: 'detached', timeout: 20000 }).catch(() => {});
const t10c = await toastText(G);
ok(!(await G.p.$('.sheet h2:text-is("Send to a Friend")')) && /^Sent · /.test(t10c), '10c. tried again: sent, and the sheet closes', t10c);
ok(/Mira(,|$)/.test(t10c) && !/Mira in /.test(t10c), '10c. (Mira’s, gone already, with no made-up landing time)', t10c);
ok(sentTo(ms.me.id) === m1 + 1 && sentTo(ps.me.id) === p0 + 1, '10c. one letter to Mira, not two (and Pat’s went)', `${sentTo(ms.me.id) - m1}, ${sentTo(ps.me.id) - p0}`);
await G.ctx.unroute(msgsUrl).catch(() => {});

const errs = K.errs.filter((e) => !/Failed to load|net::|404|429|navigator\.vibrate/.test(e));     // (a landing's haptic on a page not tapped since it reloaded: the browser's rule, not an error of ours)
ok(!errs.length, 'no errors on any page', errs.join(' | '));
console.log(`FAILS ${K.fails()}`);
await K.b.close(); process.exit(0);
