// Ask back ("How’s yours?", Chat 1.64): a card that asks; the friend sees exactly what would go back (their own card,
// from their own account, read and nothing written), "Not Now" sends nothing and keeps nothing anywhere, "Send" sends
// a reply drawn side by side with the request on both phones. A Fitness reply makes its one share id at Send.
// (Open-Meteo for the server (WXAPP_URL, :8794) is handed to the weather stand-in (:8796) and its 'share-…' patterns.)
import http from 'http';
import { kit } from './lib.mjs';
import { chatHash } from '../../pigeon/cards.js';
const [,, S, out] = process.argv;
const K = await kit(S, out);
const { ok, sql, one, api, sess, openChat } = K;
const H = 3600e3;
http.createServer((q, s) => { const r = http.request({ host: '127.0.0.1', port: 8796, path: q.url, method: q.method, headers: q.headers }, (x) => { s.writeHead(x.statusCode, x.headers); x.pipe(s); }); r.on('error', () => { s.writeHead(502); s.end(); }); q.pipe(r); }).listen(8794, '127.0.0.1');
await fetch('http://127.0.0.1:8796/mode', { method: 'POST', body: JSON.stringify({ speed: 0, pattern: 'share-rain-at', startAfter: 3 }) });

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
// every table's rows, but for the ones the server keeps for itself as it goes (rate limits, caches, its own notes)
const NOISE = /^(pg_limits|pg_meta|pg_wxcache|pg_active|pg_events|pg_challenges|pg_errors|wx_meta|mk_cache|_cf_METADATA|sqlite_sequence|td_meta|fx_meta)$/;
const tables = () => one("SELECT name FROM sqlite_master WHERE type = 'table'").map((r) => r.name).filter((n) => !NOISE.test(n));
const snapshot = () => { const ts = tables(); return one(`SELECT ${ts.map((t) => `(SELECT COUNT(*) FROM "${t}") AS "${t}"`).join(', ')}`)[0] || {}; };
const diff = (a, b) => Object.keys({ ...a, ...b }).filter((k) => a[k] !== b[k]).map((k) => `${k}: ${a[k]} → ${b[k]}`);

// George sends his forecast to Mira, asking how hers is
const wcard = { v: 1, kind: 'weather', from: 'weather', at: Date.now() - 60e3, say: 'Dry in London today.',
  snap: { place: 'London', tz: 'Europe/London', temp: 14, feels: 13, code: 1, isDay: true, hi: 15, lo: 9, lead: 'Dry all day.', rain: null, spell: null }, ref: { cell: [51.5, -0.15] } };
const sendAsk = async (card) => {
  await G.p.evaluate((h) => { location.hash = h; }, chatHash(card.say, card));
  await G.p.waitForSelector(`.sheet [data-act=sendpick][data-id="${ms.me.id}"]`, { timeout: 10000 });
  await G.p.click(`.sheet [data-act=sendpick][data-id="${ms.me.id}"]`); await G.p.click('.sheet [data-act=sendask]'); await G.p.waitForTimeout(300);
  const on = await G.p.getAttribute('.sheet [data-act=sendask]', 'aria-checked');
  await G.p.click('.sheet [data-act=sendgo]'); await G.p.waitForSelector('.sheet', { state: 'detached', timeout: 20000 }).catch(() => {});
  return on;
};
ok((await sendAsk(wcard)) === 'true', 'the sheet’s “Ask How’s Yours?” switch is on');
const askId = newest(gs.me.id);
land(`id = '${askId}'`);

// Mira: "George asks how yours is"
await reload(M); await openChat(M, gs.me.id);
await M.p.waitForSelector('.msgs [data-act=askshow]', { timeout: 15000 }).catch(() => {});
ok(/George asks how yours is/.test(await text(M, '.msgs')) && /Show What Would Go/.test(await text(M, '.msgs [data-act=askshow]')), 'Mira: “George asks how yours is”', await text(M, '.msgs .cd-ask'));
ok(/How’s yours\?/.test(await text(M, '.msgs')), 'its words ask too (what an older Chat shows)');
await M.p.click('.msgs [data-act=askshow]');
await M.p.waitForSelector('.sheet .cd-card, .sheet .empty b', { timeout: 20000 }).catch(() => {});
ok(/Send Yours Back\?/.test(await text(M, '.sheet h2')), 'the sheet: “Send Yours Back?”');
ok(!!(await M.p.$('.sheet .cd-card')), 'with Mira’s own card, as it would go', await text(M, '.sheet .body'));
ok(/Only this card goes back to George\. Nothing else from Weather is shared\./.test(await text(M, '.sheet .body')), 'saying only this card goes back');
ok((await M.p.inputValue('#f-askwords').catch(() => '')) === 'Here’s mine.', 'the words: “Here’s mine.”');
await M.p.screenshot({ path: `${out}/askback.png` });

// "Not Now": nothing sent, nothing kept anywhere
const before = snapshot();
await M.p.click('.sheet [data-act=askno]'); await M.p.waitForTimeout(2500);
const after = snapshot();
ok(!diff(before, after).length, '“Not Now” sends nothing, and adds no row to any table', diff(before, after).join(', '));
ok(/You didn’t send yours/.test(await text(M, '.msgs')) && /Send Yours After All/.test(await text(M, '.msgs [data-act=askshow]')), 'the letter then says “You didn’t send yours”');

// "Send Yours After All", then Send: a reply, side by side on both phones
const n0 = count('pg_msgs');
await M.p.click('.msgs [data-act=askshow]'); await M.p.waitForSelector('.sheet [data-act=asksend]', { timeout: 20000 });
await M.p.click('.sheet [data-act=asksend]'); await M.p.waitForSelector('.sheet', { state: 'detached', timeout: 20000 }).catch(() => {});
ok(count('pg_msgs') === n0 + 1, 'Send: one letter back');
land(`id = '${newest(ms.me.id)}'`);
await reload(M); await openChat(M, gs.me.id); await M.p.waitForTimeout(1500);
ok(/Here and there · now/.test(await text(M, '.msgs .cd-sbs')) && /You/.test(await text(M, '.msgs .cd-sbs')) && /George/.test(await text(M, '.msgs .cd-sbs')), 'Mira: side by side (you, George)', await text(M, '.msgs .cd-sbs'));
ok(/You sent yours back/.test(await text(M, '.msgs')), 'and the request says she sent hers back');
await M.p.screenshot({ path: `${out}/sidebyside-mira.png` });
await reload(G); await openChat(G, ms.me.id); await G.p.waitForTimeout(1500);
ok(/Here and there · now/.test(await text(G, '.msgs .cd-sbs')) && /Mira/.test(await text(G, '.msgs .cd-sbs')), 'George: side by side (you, Mira)', await text(G, '.msgs .cd-sbs'));
ok(/You asked how theirs is/.test(await text(G, '.msgs')), 'George’s own card: “You asked how theirs is”');
await G.p.click('.chatnav .back'); await G.p.waitForTimeout(400);

// A Fitness one: Mira's ride today, sent back; its share id made at Send, once
const today = new Date().toISOString().slice(0, 10);
const fcard = { v: 1, kind: 'fitness', from: 'fitness', at: Date.now() - 60e3, say: 'Today: Endurance 75.',
  snap: { day: today, tz: 'Europe/London', sport: 'ride', name: 'Endurance 75', kind: 'Endurance', wid: 'free-ride', secs: 4500, tss: 62, best: null, done: null } };
await sendAsk(fcard);
land(`id = '${newest(gs.me.id)}'`);
sql(`CREATE TABLE IF NOT EXISTS fx_acts (user_id TEXT NOT NULL, id TEXT NOT NULL, start INTEGER NOT NULL, sport TEXT NOT NULL, indoor INTEGER NOT NULL DEFAULT 0, name TEXT, device TEXT, file TEXT, type TEXT NOT NULL, size INTEGER NOT NULL, sum TEXT, added INTEGER NOT NULL, PRIMARY KEY (user_id, id))`);
sql(`INSERT INTO fx_acts (user_id, id, start, sport, name, type, size, sum, added) VALUES ('${ms.me.id}', 'ride-1', ${Date.now() - 30e3}, 'ride', 'Morning ride', 'fit', 1000, '{"secs":3720,"dist":30400,"tss":48}', ${Date.now()})`);
sql(`CREATE TABLE IF NOT EXISTS fx_shares (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, day TEXT NOT NULL, tz TEXT NOT NULL, sport TEXT NOT NULL, made INTEGER NOT NULL, until INTEGER NOT NULL)`);
const shares = () => count(`fx_shares WHERE user_id = '${ms.me.id}'`);
await reload(M); await openChat(M, gs.me.id);
await M.p.waitForSelector('.msgs [data-act=askshow]', { timeout: 15000 }).catch(() => {});
await M.p.locator('.msgs [data-act=askshow]').last().click();
await M.p.waitForSelector('.sheet .cd-card, .sheet .empty b', { timeout: 20000 }).catch(() => {});
ok(/Nothing else from Fitness is shared/.test(await text(M, '.sheet .body')), 'Fitness: only this card goes', await text(M, '.sheet .body'));
const s0 = shares();
ok(s0 === 0, 'showing what would go makes no share id');
await M.p.click('.sheet [data-act=asksend]'); await M.p.waitForSelector('.sheet', { state: 'detached', timeout: 20000 }).catch(() => {});
ok(shares() === 1, 'Send: exactly one share id, made then', String(shares()));

const errs = K.errs.filter((e) => !/Failed to load|net::|404|429|navigator\.vibrate/.test(e));     // (a landing's haptic on a page not tapped since it reloaded: the browser's rule, not an error of ours)
ok(!errs.length, 'no errors on any page', errs.join(' | '));
console.log(`FAILS ${K.fails()}`);
await K.b.close(); process.exit(0);
