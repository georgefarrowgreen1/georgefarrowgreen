// Chat's first screen loads less (pigeon/later.js, app.js's later()): the welcome, the chat list, a chat and sending a
// message ask for none of later.js, moon.js, land.js or rank.js (with no quiet moment to load them in, none at all);
// the first sheet asked for brings later.js, and opens as it always has; on its own, later.js comes at the first quiet
// moment once Chat is up, never before the list is drawn; and once Chat has been opened with signal, its worker keeps
// later.js, so with no signal Chat opens and its sheets still do.
import { kit } from './lib.mjs';
const [,, S, out] = process.argv;
const K = await kit(S, out);
const { ok, api, sess, openChat } = K;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LATE = '/pigeon/(later|moon|land|rank)\\.js';
// (what the page has loaded of them, by its own resource timings: from the network, the HTTP cache or the worker alike)
const late = (ph) => ph.p.evaluate((re) => performance.getEntriesByType('resource').filter((e) => new RegExp(re).test(new URL(e.name).pathname))
  .map((e) => ({ name: new URL(e.name).pathname, at: Math.round(e.startTime) })), LATE);
const names = (xs) => xs.map((x) => x.name).join(' ') || 'none';
// no quiet moment, ever: what app.js would load then waits for a sheet
const noIdle = (ctx) => ctx.addInitScript(() => { window.requestIdleCallback = () => 0; });
// (the moment the chat list is first drawn, by the page's clock)
const listClock = (ctx) => ctx.addInitScript(() => {
  new MutationObserver((_, o) => { if (document.querySelector('.mlist .mrow')) { window.__listAt = performance.now(); o.disconnect(); } }).observe(document, { childList: true, subtree: true });
});

// ---- 1. the welcome, signed out, with no quiet moment: none of them ----
const W = await K.phone('welcome');
await noIdle(W.ctx); await W.p.reload();
await W.p.waitForSelector('.welcome', { timeout: 20000 }); await wait(2500);
const w1 = await late(W);
ok(!w1.length, '1. the welcome loads none of later.js, moon.js, land.js or rank.js', names(w1));
await W.ctx.close();

// ---- 2. signed in, no quiet moment: the list, a chat and a message sent load none of them; a sheet brings later.js ----
const M = await K.phone('mira'), L = await K.phone('leo');
await K.signup(M, 'Mira Okafor', 'mira', 'mira@example.com', 'Norwich');
await K.signup(L, 'Leo Marsh', 'leo', 'leo@example.com', 'London');
const [ms, ls] = [await sess(M), await sess(L)], MI = ms.me.id, LE = ls.me.id;
await api(ms.token, 'friends', { handle: 'leo' }); await api(ls.token, 'friends-respond', { id: MI, accept: true });
await noIdle(M.ctx);
await M.p.reload(); await M.p.waitForSelector('.tabs', { timeout: 30000 }); await wait(2500);
const m1 = await late(M);
ok(!m1.length, '2. the chat list loads none of them', names(m1));
await openChat(M, LE);
await M.p.fill('#msg', 'Hello from the first screen'); await M.p.click('.send');
const sent = await M.p.waitForFunction(() => /Hello from the first screen/.test(document.querySelector('.msgs')?.innerText || ''), null, { timeout: 15000 }).then(() => true, () => false);
await wait(1500);
const m2 = await late(M);
ok(sent, '2. a chat opened, and a message sent in it');
ok(!m2.length, '2. …still none of them', names(m2));
await M.p.screenshot({ path: `${out}/02-chat.png` });
await M.p.click('.chatwho[data-act=friendinfo]');
const info = await M.p.waitForFunction(() => { const s = document.querySelector('.layer .sheet:not(.closing)'); return s && /Leo/.test(s.innerText) ? s.innerText.slice(0, 80) : null; }, null, { timeout: 15000 }).then((h) => h.jsonValue(), () => null);
const m3 = await late(M);
ok(!!info, '2. a friend’s details: the sheet opens, as before', String(info).replace(/\s+/g, ' '));
ok(m3.some((x) => x.name === '/pigeon/later.js'), '2. …brought by later.js, loaded for it', names(m3));
await M.p.screenshot({ path: `${out}/02-sheet.png` });

// ---- 3. as Chat is: later.js at the first quiet moment, after the list (Mira's chat in it now) is drawn ----
await listClock(L.ctx);
await L.p.reload(); await L.p.waitForSelector('.mlist .mrow', { timeout: 30000 });
const got = await (async () => { for (let i = 0; i < 40; i++) { const x = (await late(L)).find((e) => e.name === '/pigeon/later.js'); if (x) return x; await wait(250); } return null; })();
const listAt = await L.p.evaluate(() => window.__listAt ?? null);
ok(!!got, '3. later.js comes by itself, once Chat is up', got ? `at ${got.at} ms` : 'never');
ok(got && listAt != null && got.at > listAt, '3. …only after the chat list is drawn', `list at ${Math.round(listAt)} ms, later.js at ${got?.at} ms`);

// ---- 4. no signal: Chat opens from its worker's copy, and a sheet with it ----
const ready = await L.p.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 15000 }).then(() => true, () => false);
ok(ready, '4. Chat’s worker has the page');
await wait(1500);                                                      // (its copy of later.js put away)
await L.ctx.setOffline(true);
await L.p.reload(); await L.p.waitForSelector('.mlist .mrow', { timeout: 30000 });
await L.p.click('.nbtn[data-act=newmsg], [data-act=newmsg]');
const sheet = await L.p.waitForFunction(() => { const s = document.querySelector('.layer .sheet:not(.closing)'); return s ? s.innerText.slice(0, 80) : null; }, null, { timeout: 15000 }).then((h) => h.jsonValue(), () => null);
const toastNow = await L.p.evaluate(() => document.querySelector('.toast')?.innerText || '');
ok(!!sheet && !/No signal/.test(toastNow), '4. with no signal, New Message still opens', `${String(sheet).replace(/\s+/g, ' ')} ${toastNow}`);
await L.p.screenshot({ path: `${out}/04-offline-sheet.png` });
await L.ctx.setOffline(false);

const errs = K.errs.filter((e) => !/Failed to load|ERR_INTERNET_DISCONNECTED|net::|status of 4\d\d/.test(e));
ok(!errs.length, 'no errors on the pages', errs.slice(0, 3).join(' | '));
console.log(`FAILS ${K.fails()}`);
process.exit(0);
