// Fitness and Chat's Send to a friend: today's session goes to Chat as a card (in the address's fragment, the words
// first), with no share id and no request to the server (nothing kept for a card only sent from here); and a plan made
// in Chat (an fx_offers row, put in as Chat's server would) waits at the top of Today, "Ride with Leo", and nothing in
// the plan changes till it's tapped. "Add to my plan" says what it replaces, then swaps the day, tells the account
// (state yes), and the day says it's with Leo; "Undo swap" takes it off as any swap; "Not now" leaves it till the app's
// next opened; "No thanks" says no. The record never gains a "together" key: who it's with is the offer's.
// (the apps' addresses stood in for by ifl.test, mapped to this machine, so the sign-in is shared as it is on the site)
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { joinChat } from './join.mjs';

const [,, S, out] = process.argv;
const CHAT = 'http://chat.ifl.test:8788', FIT = 'http://fitness.ifl.test:8788', PW = 'a long test password';
const sql0 = (q) => execSync(`${S}/wr/node_modules/.bin/wrangler d1 execute bio-db --local --persist-to ${S}/wrstate --command "${q}"`, { cwd: process.env.APP_ROOT, stdio: 'pipe' }).toString();
const sql = (q) => { for (let i = 0; ; i++) { try { return sql0(q); } catch (e) { if (i > 5 || !/SQLITE_BUSY/.test(String(e.stdout) + String(e.stderr) + e.message)) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400); } } };
const rows = (q) => { const o = sql(q), m = o.match(/"results": (\[[\s\S]*?\])\s*,\s*"success"/); return m ? JSON.parse(m[1]) : []; };
let fails = 0; const errs = [], pages = [];
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${extra ? '  — ' + extra : ''}`); if (!c) fails++; };
process.on('uncaughtException', async (e) => { console.log(`FAIL  ${e.message.split('\n')[0]}`); for (const x of pages) await x.p.screenshot({ path: `${out}/failed-${x.name}.png` }).catch(() => {}), console.log(`${x.name}: ${x.p.url()}`); if (errs.length) console.log('page errors: ' + errs.join(' | ')); console.log(`FAILS ${fails + 1}`); process.exit(0); });

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined,
  args: ['--host-resolver-rules=MAP *.gfg.test 127.0.0.1, MAP gfg.test 127.0.0.1, MAP *.ifl.test 127.0.0.1, MAP ifl.test 127.0.0.1', `--unsafely-treat-insecure-origin-as-secure=${CHAT},${FIT},http://account.ifl.test:8788`] });
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
// (no service workers: Chat's, from signing up, would answer for its page, past the stand-in below)
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-GB', timezoneId: 'Europe/London', serviceWorkers: 'block', isMobile: true, hasTouch: true, userAgent: IPHONE });
// (the day's check-in and the welcome, as if already seen)
await ctx.addInitScript(() => { try { const d = new Date(); d.setHours(0, 0, 0, 0); localStorage.setItem('fitness:asked', String(d.getTime())); localStorage.setItem('fitness:welcomed', 'true'); } catch (_) {} });
const p = await ctx.newPage();
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 40[13]|Cross-Origin-Opener-Policy header has been ignored/.test(m.text())) errs.push(m.text()); });
pages.push({ p, name: 'phone' });
const settle = (ms = 600) => p.waitForTimeout(ms);
const waitFor = async (fn, ms = 12000) => { for (let free = 0; ; free += 300) { const v = await fn(); if (v || free > ms) return v; await new Promise((r) => setTimeout(r, 300)); } };
const toastSays = () => p.waitForFunction(() => document.querySelector('#toast.on')?.textContent || null, null, { timeout: 15000 }).then((v) => v.jsonValue(), () => '');
const state = (uid) => { const r = rows(`SELECT data FROM fx_state WHERE user_id = '${uid}'`)[0]; return r ? JSON.parse(r.data) : null; };
const hasTable = (t) => rows(`SELECT name FROM sqlite_master WHERE type='table' AND name='${t}'`).length > 0;

// ---- signed up to Chat; Fitness in the same browser signed in, a plan with a ride today ----
await joinChat(p, `${CHAT}/`, { name: 'Sam Taylor', handle: 'sam', email: 'sam@example.com', password: PW, city: 'London' });
const sam = rows("SELECT id FROM pg_users WHERE handle = 'sam'")[0].id;
await p.goto(`${FIT}/`);
await p.waitForSelector('.ifh-me', { timeout: 20000 });
// (the plan chosen by the page's own hand, as fitness.mjs opens its sheets: a ride today, whatever the plan has)
const today = await p.evaluate(async () => { const m = await import('./app.js'); m.choosePlan({ id: 'sportive', start: m.mondayOf(m.TODAY) }); m.S.swaps[m.TODAY] = 'endurance-90'; m.keep('swaps'); m.redraw(); return m.TODAY; });
const saved = await waitFor(() => state(sam)?.swaps?.[today] === 'endurance-90');
ok(saved, 'a plan, with Endurance 90 today (kept with the account)');
await p.waitForSelector('.session.go .acts');

// ---- 1. Send to a friend: to Chat with the card, and no request to any server ----
// (Chat's page stood in for, so the address it was sent to stays to be read)
await ctx.route(/^http:\/\/chat\.ifl\.test:8788\/$/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Chat</title><p>Chat</p>' }));
const pill = p.locator('.session.go .acts button', { hasText: 'Send to a friend' });
ok(await pill.count() === 1, 'today\'s session: "Send to a friend"');
await p.screenshot({ path: `${out}/session.png` });
// (the ride weather held here made an hour old, as on a page left open: sending still asks nothing for it)
await p.evaluate(async () => { const m = await import('./app.js'); m.S.wx = { at: Date.now() - 3600e3, d: m.S.wx?.d ?? null }; });
// (every request to any server's API, GETs too, from the tap till Chat's page is up)
const asked = [];
const watch = (r) => { if (/\/api\//.test(r.url())) asked.push(`${r.method()} ${new URL(r.url()).pathname}`); };
p.on('request', watch);
await Promise.all([p.waitForURL(/^http:\/\/chat\.ifl\.test:8788\/#share=/, { timeout: 15000 }), pill.click()]);
p.off('request', watch);
await p.waitForLoadState('domcontentloaded');
const url = await p.evaluate(() => location.href), q = new URLSearchParams(new URL(url).hash.slice(1));
const card = JSON.parse(Buffer.from(q.get('card') || '', 'base64url').toString('utf8') || 'null');
ok(url.startsWith(`${CHAT}/#share=`) && [...q.keys()].join() === 'share,card', 'to Chat, beside Fitness: /#share=…&card=…, the words first', url.slice(0, 80));
ok(/^Today: Endurance 90, 1 h 30 min\./.test(q.get('share')), 'the words: today\'s session, as Today says it', q.get('share'));
ok(card?.kind === 'fitness' && card.from === 'fitness' && card.snap?.name === 'Endurance 90' && card.snap.sport === 'ride' && card.snap.wid === 'endurance-90' && card.snap.done === null && /^\d{4}-\d\d-\d\d$/.test(card.snap.day),
  'the card: today\'s session (its day, sport, name, workout)', JSON.stringify(card?.snap));
ok(card && !('ref' in card), 'with no share id: Chat makes that as the letter goes');
ok(asked.length === 0, 'and nothing asked of any server to send it, not even a GET', asked.join(', '));
ok(!hasTable('fx_shares') || rows(`SELECT COUNT(*) AS n FROM fx_shares WHERE user_id = '${sam}'`)[0].n === 0, 'no fx_shares row');
await ctx.unroute(/^http:\/\/chat\.ifl\.test:8788\/$/);

// ---- 2. A plan made in Chat waits at the top of Today; nothing changes till it's tapped ----
sql(`CREATE TABLE IF NOT EXISTS fx_offers (
  user_id TEXT NOT NULL, id TEXT NOT NULL,
  start INTEGER NOT NULL, stop INTEGER NOT NULL, tz TEXT NOT NULL,
  sport TEXT NOT NULL, wid TEXT NOT NULL, name TEXT NOT NULL, secs INTEGER NOT NULL,
  who TEXT NOT NULL,
  role TEXT NOT NULL,
  far INTEGER NOT NULL DEFAULT 0, dry INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'new',
  made INTEGER NOT NULL, until INTEGER NOT NULL,
  PRIMARY KEY (user_id, id))`.replace(/\s+/g, ' '));
sql('CREATE INDEX IF NOT EXISTS fx_offers_until ON fx_offers (until)');
// (today, a little from now: on today's clock still, even late in the evening)
const start = Math.min(Date.now() + 10 * 60e3, today + 24 * 3600e3 - 60e3), stop = start + 2 * 3600e3;
const offer = (id, s, e, extra = {}) => { const o = { sport: 'ride', wid: 'free-ride', name: 'Ride how you like', secs: 7200, who: 'Leo', role: 'asked', far: 0, dry: 1, ...extra };
  sql(`INSERT INTO fx_offers (user_id, id, start, stop, tz, sport, wid, name, secs, who, role, far, dry, state, made, until) VALUES ('${sam}', '${id}', ${s}, ${e}, 'Europe/London', '${o.sport}', '${o.wid}', '${o.name}', ${o.secs}, '${o.who}', '${o.role}', ${o.far}, ${o.dry}, 'new', ${Date.now()}, ${e + 12 * 3600e3})`); };
const A = randomUUID(); offer(A, start, stop);
const before = JSON.stringify(state(sam));
await p.goto(`${FIT}/`);
await p.waitForSelector('.offer', { timeout: 20000 }); await settle();
const clock = (t) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/London' }).format(t), span = `${clock(start)}–${clock(stop)}`;
const offerSays = (await p.innerText('.offer')).replace(/\s+/g, ' ');
ok(/From Chat/.test(offerSays) && /Ride with Leo/.test(offerSays) && offerSays.includes(`Today ${span} · Ride how you like`) && /Leo said yes in Chat\. Add it to your plan\?/.test(offerSays), 'at the top of Today: From Chat, "Ride with Leo", when, and Add it to your plan?', offerSays);
ok(await p.evaluate(() => { const o = document.querySelector('.offer'), s = document.querySelector('.session'); return !!o && !!s && !!(o.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING); }), 'above the day\'s card');
ok((await p.locator('.offer .acts button').allInnerTexts()).map((x) => x.trim()).join('|') === 'Add to my plan|Not now|No thanks', 'Add to my plan, Not now, No thanks');
await p.screenshot({ path: `${out}/offer.png` });
await settle(1000);
ok(JSON.stringify(state(sam)) === before && rows(`SELECT state FROM fx_offers WHERE id = '${A}'`)[0].state === 'new', 'nothing in the plan changed before a tap');

// ---- 3. Add to my plan: what it replaces, then the day's swapped and the account told ----
await p.locator('.offer .acts button', { hasText: 'Add to my plan' }).click();
await p.waitForSelector('#sheet[open] .offer-said'); await settle(500);
const sheetSays = (await p.innerText('#sheet')).replace(/\s+/g, ' ');
ok(/Add to your plan/.test(sheetSays) && sheetSays.includes(`Today: Endurance 90 becomes Ride how you like, with Leo, ${span}.`) && /Your week, then/.test(sheetSays), 'the sheet: what it replaces, and the week as it would be', sheetSays.slice(0, 200));
await p.screenshot({ path: `${out}/add.png` });
ok(JSON.stringify(state(sam)) === before, 'still nothing changed with the sheet open');
await p.locator('#sheet .offer-acts .btn', { hasText: 'Add to my plan' }).click();
const added = await toastSays();
ok(added === 'Added: Today, with Leo.', 'said: Added: Today, with Leo.', added);
const swapped = await waitFor(() => state(sam)?.swaps?.[today] === 'free-ride');
ok(swapped, 'the day\'s swap kept with the account');
ok(rows(`SELECT state FROM fx_offers WHERE id = '${A}'`)[0].state === 'yes', 'and the plan answered yes (POST offers/<id>)');
await settle(800);
const chip = (await p.innerText('.session .hero-top .sport')).trim(), line = await p.locator('.session .with-mate').innerText().catch(() => '');
ok(/with Leo$/.test(chip) && line === `Riding with Leo, ${span}.` && /Ride how you like/.test(await p.innerText('.session h2')), 'the day: Ride how you like, " · with Leo", and when', `${chip} | ${line}`);
ok(!(await p.$('.offer')), 'and the waiting card gone');
ok(!('together' in (state(sam) || {})) && !JSON.stringify(state(sam)).includes('Leo'), 'the record has no "together" key, nor Leo in it');
await p.screenshot({ path: `${out}/with.png` });
// (opened again, from the account: still with Leo)
await p.reload(); await p.waitForSelector('.session .with-mate', { timeout: 20000 });
ok(/with Leo/.test(await p.innerText('.session .hero-top .sport')), 'opened again: still with Leo (the account\'s agreed plan)');

// ---- 4. Undo swap: off as any swap is ----
await p.locator('.session .acts button', { hasText: 'Undo swap' }).click(); await settle(800);
ok(!(await p.$('.session .with-mate')) && !/with Leo/.test(await p.innerText('.session')), 'Undo swap: the day back as it was, no "with Leo"');
ok(await waitFor(() => state(sam)?.swaps?.[today] === undefined), 'the swap gone from the record');

// ---- 5. Not now, till the app's next opened; No thanks, no ----
const B = randomUUID(), C = randomUUID(), tomorrow = today + 24 * 3600e3;
offer(B, tomorrow + 10 * 3600e3, tomorrow + 11 * 3600e3, { sport: 'run', wid: 'run-easy-40', name: 'Easy run 40', secs: 2400, role: 'answered', far: 1 });
offer(C, tomorrow + 15 * 3600e3, tomorrow + 17 * 3600e3, { who: 'Ade' });
const was = JSON.stringify(state(sam));
await p.reload(); await p.waitForSelector('.offer', { timeout: 20000 }); await settle();
const two = await p.locator('.offer h2').allInnerTexts();
ok(two.join('|') === 'Run with Leo|Ride with Ade', 'two waiting, soonest first', two.join('|'));
ok(/You said yes to Leo in Chat\. Add it to your plan\? Same time, each where you are\./.test((await p.innerText('.offer >> nth=0')).replace(/\s+/g, ' ')), 'your own yes, and far apart: "Same time, each where you are."');
await p.locator('.offer >> nth=0').locator('button', { hasText: 'Not now' }).click(); await settle();
ok((await p.locator('.offer h2').allInnerTexts()).join('|') === 'Ride with Ade' && rows(`SELECT state FROM fx_offers WHERE id = '${B}'`)[0].state === 'new', 'Not now: left for now, nothing told');
await p.locator('.offer', { hasText: 'Ade' }).locator('button', { hasText: 'No thanks' }).click();
const no = await toastSays();
ok(await waitFor(() => rows(`SELECT state FROM fx_offers WHERE id = '${C}'`)[0].state === 'no') && no === 'Fitness keeps your plan as it was.', 'No thanks: the plan answered no', no);
ok(!(await p.$('.offer')), 'and both cards gone');
await p.reload(); await p.waitForSelector('.session', { timeout: 20000 }); await settle();
ok((await p.locator('.offer h2').allInnerTexts()).join('|') === 'Run with Leo', 'opened again: the one left for now is back, the one said no to isn\'t');
ok(JSON.stringify(state(sam)) === was, 'and the plan unchanged by any of it');
// ---- 5b. said no to on another phone, then Add to my plan on this one (not opened again since): nothing swapped ----
sql(`UPDATE fx_offers SET state = 'no' WHERE id = '${B}'`);
await p.locator('.offer', { hasText: 'Run with Leo' }).locator('button', { hasText: 'Add to my plan' }).click();
await p.waitForSelector('#sheet[open] .offer-said'); await settle(500);
await p.locator('#sheet .offer-acts .btn', { hasText: 'Add to my plan' }).click();
const stale = await toastSays(); await settle(800);
ok(/isn’t there any more/.test(stale), 'answered elsewhere: said it isn’t there any more', stale);
ok(JSON.stringify(state(sam)) === was && rows(`SELECT state FROM fx_offers WHERE id = '${B}'`)[0].state === 'no', 'and nothing swapped in the plan, the no kept');
ok(!(await p.$('.offer')), 'and the card no longer waiting');

// ---- the account's API: an offer that isn't there ----
const gone = await p.evaluate(async (id) => (await fetch(`/api/fitness/offers/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answer: 'yes' }) })).status, randomUUID());
ok(gone === 404, 'an offer that isn\'t there: 404', String(gone));
await p.setViewportSize({ width: 320, height: 640 }); await settle();
ok(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'at 320 px wide, nothing scrolls sideways');
await p.screenshot({ path: `${out}/small.png` });
ok(!errs.length, 'no errors on the page', errs.slice(0, 3).join(' | '));
await b.close();
console.log(`FAILS ${fails}`);
process.exit(0);
