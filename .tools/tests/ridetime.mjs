// needs: hub
// Fitness at InFlite's hub (Today First, spec §9.2, §9.3, §14.3): /fitness/ a page of the hub (ifl.test:8788, the inflite
// repo's Worker), Back in the photo's place and Fitness's own few under their own button; Ride At on today's session
// writes the ride's time (fx_times, source set) through the hub, and GET me gives it back (times); InFlite Today's own
// rides (fx_offers role "today", put in as Today's habit rule writes them) drawn "From Today · Ride <day> 10:00": one
// added put in its day as a swap as Fitness opens, Keep sets taken, Undo here says no and takes the swap out, one undone
// on Today comes out at the next open, and one suggested is added with Add to My Plan (taken); sections by the address
// (#activities, #day=) as it opens and told again by the hash while it's open; Send through the hub's send (spied), and
// unspied, Chats' own sheet with the way back; push never asked for at the hub; the Connect Strava row says Strava opens
// on its own; Back to Apps (opened from its tile); signed out, the hub's Sign In through Chats; one window; no page errors.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { kit } from './lib.mjs';
import { hostCall } from './handback.mjs';

const [,, S, out] = process.argv;
const K = await kit(S, out);
const { ok, one, hubPhone, HUB } = K;
const b64u = (u) => Buffer.from(u).toString('base64url');
const settle = (p, ms = 500) => p.waitForTimeout(ms);
const pathOf = (u) => { const x = new URL(u); return x.pathname + x.hash; };
const waitFor = async (fn, ms = 15000) => { for (let t = 0; ; t += 300) { const v = await fn(); if (v || t > ms) return v; await new Promise((r) => setTimeout(r, 300)); } };
process.on('uncaughtException', (e) => { console.log(`FAIL  ${String(e.message).split('\n')[0]}`); console.log(String(e.stack).split('\n').slice(0, 6).join('\n')); console.log(`FAILS ${K.fails() + 1}`); process.exit(1); });

// (the phone's zone chosen so that it's early afternoon there now, whatever the real hour: a ride at 15:00 is still today,
// and the days ahead are plain days; Etc/GMT-5 is UTC+5)
const OFF = ((13 - new Date().getUTCHours() + 36) % 24) - 12;
const ZONE = OFF === 0 ? 'Etc/GMT' : `Etc/GMT${OFF > 0 ? '-' : '+'}${Math.abs(OFF)}`;
const local = new Date(Date.now() + OFF * 3600e3), Y = local.getUTCFullYear(), M = local.getUTCMonth(), D = local.getUTCDate();
// (a day k days from today, as Fitness keeps days (its start, by the phone's clock), its key, and an hour that day)
const dayAt = (k) => Date.UTC(Y, M, D + k) - OFF * 3600e3;
const keyOf = (k) => new Date(Date.UTC(Y, M, D + k)).toISOString().slice(0, 10);
const hourAt = (k, h) => Date.UTC(Y, M, D + k, h) - OFF * 3600e3;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const weekdayOf = (k) => WEEKDAYS[new Date(Date.UTC(Y, M, D + k)).getUTCDay()];
console.log(`zone ${ZONE}: ${keyOf(0)} ${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')} there`);

// ---- an account, made at the sign-in page of the tests' site (its cookie covers ifl.test) ----
const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']), pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
const made = await hostCall('auth.ifl.test', '/api/account/signup', { name: 'Rhea Walsh', handle: 'rheafit', email: 'rhea.fit@example.com', salt: b64u(randomBytes(16)), proof: b64u(randomBytes(32)),
  vault: 'x'.repeat(40), pub: { kty: 'EC', crv: 'P-256', x: pub.x, y: pub.y } }, { ip: '10.0.9.8' });
ok(made.s === 201 && made.cookie, 'an account made, signed in on the tests’ site', `${made.s} ${JSON.stringify(made.j)}`);
const [cname, cvalue] = made.cookie.split('=');
const uid = one("SELECT id FROM pg_users WHERE handle = 'rheafit'")[0]?.id;

// ---- Rhea's phone, InFlite on its Home Screen; Fitness opened at the hub ----
const ph = await hubPhone('rhea', await K.makeKeys(), { cookies: { [cname]: cvalue }, path: '/fitness/', zone: ZONE });
const { p, ctx, pages } = ph;
// (the day's check-in and the welcome, as if already seen; and Fitness's own module, as the page loaded it, for the
// test's looks inside: window.__fx())
await ctx.addInitScript(() => {
  try { const d = new Date(); d.setHours(0, 0, 0, 0); localStorage.setItem('fitness:asked', String(d.getTime())); localStorage.setItem('fitness:welcomed', 'true'); } catch (_) {}
  window.__fx = () => import(document.querySelector('script[type="module"][src*="app.js"]').src);
});
// (every page error and console error on Fitness's pages: none expected; Chats' engine, a frame over the page, has its own)
const fitErrs = [], onFit = () => /\/fitness\//.test(p.url());
p.on('pageerror', (e) => { if (onFit() && !/\/chats\//.test(e.stack || '')) fitErrs.push(`${p.url()}: ${e.message}`); });
p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text()) && onFit() && !/\/chats\//.test(m.location()?.url || '')) fitErrs.push(`${p.url()}: ${m.text()}`); });
// (what Fitness asked of its push routes: nothing, at the hub)
const pushAsks = []; p.on('request', (r) => { if (/\/api\/fitness\/push(\b|-)/.test(r.url())) pushAsks.push(`${r.method()} ${r.url()}`); });
const meAsks = []; p.on('request', (r) => { if (new URL(r.url()).pathname === '/api/fitness/me' && r.method() === 'GET') meAsks.push(r.url()); });
// (every address the window went to: Chats' page takes its #share=… out of the address as it reads it)
const navs = []; p.on('framenavigated', (f) => { if (f === p.mainFrame()) navs.push(f.url()); });
const fresh = async (url) => { await p.goto('about:blank'); await p.goto(url); await p.waitForSelector('.fhead .ifl-back', { timeout: 30000 }); await settle(p, 600); };
const state = () => { const r = one(`SELECT data FROM fx_state WHERE user_id = '${uid}'`)[0]; return r ? JSON.parse(r.data) : null; };

await fresh(HUB + '/fitness/');
ok(new URL(p.url()).origin === HUB && await p.evaluate(() => document.head.firstElementChild?.getAttribute('content')) === '/fitness/', '/fitness/: a page of the hub', p.url());
ok(meAsks.some((u) => /[?&]today=1(&|$)/.test(u) && /[?&]tz=/.test(u)), 'GET me asked with ?today=1 and the phone’s zone', meAsks.slice(-2).join(' '));
ok(await p.locator('.fhead .ifl-back').count() === 1 && await p.locator('.fhead .ifh-me').count() === 0, 'the menu button is Back at the hub');
ok(await p.locator('.fhead .hub-more[aria-label="Fitness Settings"]').count() === 1, 'and Fitness’s own few under their own button');
const backBox = await p.locator('.fhead .ifl-back').boundingBox();
ok(backBox && backBox.height >= 40 && backBox.width >= 44 && backBox.x >= 12, 'Back: a full-size control, inside the screen', JSON.stringify(backBox));
ok(await p.locator('.ifl-moved').count() === 0, 'at the hub, on the Home Screen: no “InFlite is one app now” card');

// (a plan with a ride today, chosen by the page's own hand, as fitshare.mjs does)
await p.evaluate(async () => { const m = await window.__fx(); m.choosePlan({ id: 'sportive', start: m.mondayOf(m.TODAY) }); m.S.swaps[m.TODAY] = 'endurance-90'; m.keep('swaps'); m.redraw(); });
ok(await waitFor(() => state()?.swaps?.[dayAt(0)] === 'endurance-90'), 'a plan, with Endurance 90 today, kept with the account through the hub');
await p.waitForSelector('.session.go .ride-at', { timeout: 15000 });

// ---- 1. Ride At: today's ride at 15:00, kept as fx_times (source set), and in GET me's times ----
ok((await p.locator('.session.go .ride-at b').innerText()) === 'Ride at a time', 'today’s session: the Ride At row, no time yet');
await p.click('.session.go .ride-at button:has-text("Ride At")');
await p.waitForSelector('#sheet input.ride-at-time', { timeout: 10000 }); await settle(p, 400);
await p.screenshot({ path: `${out}/1-ride-at.png` });
await p.fill('#sheet input.ride-at-time', '15:00');
await p.click('#sheet .ride-at-set');
const row = await waitFor(() => one(`SELECT day, start, stop, tz, sport, source FROM fx_times WHERE user_id = '${uid}'`)[0]);
ok(row && row.day === keyOf(0) && row.start === hourAt(0, 15) && row.stop === hourAt(0, 15) + 90 * 60e3 && row.tz === ZONE && row.sport === 'ride' && row.source === 'set',
  'Ride At wrote fx_times: today, 15:00 for the session’s 1:30, in the phone’s zone, source set', JSON.stringify(row));
await p.waitForSelector('.session.go .ride-at b:text-is("Ride at 15:00")', { timeout: 10000 }).catch(() => {});
ok((await p.locator('.session.go .ride-at b').innerText().catch(() => '')) === 'Ride at 15:00', 'the row says it: Ride at 15:00');
const me = await p.evaluate(async (z) => (await fetch(`/api/fitness/me?today=1&tz=${encodeURIComponent(z)}`)).json(), ZONE);
ok(Array.isArray(me.times) && me.times.some((t) => t.day === keyOf(0) && t.start === hourAt(0, 15) && t.source === 'set') && me.times.every((t) => Object.keys(t).sort().join() === 'day,source,start,stop'),
  'GET me gives it back in times (day, start, stop, source)', JSON.stringify(me.times));
// (set by Today since, the row says so; and cleared from Fitness)
one(`UPDATE fx_times SET source = 'today' WHERE user_id = '${uid}'`);
await fresh(HUB + '/fitness/');
ok((await p.locator('.session.go .ride-at b').innerText().catch(() => '')) === 'Ride at 15:00 · from Today', 'one Today set: “Ride at 15:00 · from Today”');
await p.click('.session.go .ride-at button:has-text("Change")'); await p.waitForSelector('#sheet .ride-at-clear'); await settle(p, 300);
await p.click('#sheet .ride-at-clear');
ok(await waitFor(() => one(`SELECT COUNT(*) AS n FROM fx_times WHERE user_id = '${uid}'`)[0]?.n === 0), 'No Set Time: the day’s row gone (DELETE /api/fitness/time)');
await p.click('.session.go .ride-at button:has-text("Ride At")'); await p.waitForSelector('#sheet input.ride-at-time'); await settle(p, 300);
await p.fill('#sheet input.ride-at-time', '15:00'); await p.click('#sheet .ride-at-set');
ok(await waitFor(() => one(`SELECT source FROM fx_times WHERE user_id = '${uid}'`)[0]?.source === 'set'), 'and set again: source set');

// ---- 2. InFlite Today's own rides: added (Keep, Undo), undone on Today, suggested (Add to My Plan) ----
const offer = (k, state) => { const id = randomUUID(), s = hourAt(k, 10), e = s + 2 * 3600e3;
  one(`INSERT INTO fx_offers (user_id, id, start, stop, tz, sport, wid, name, secs, who, role, far, dry, state, made, until, taken) VALUES ('${uid}', '${id}', ${s}, ${e}, '${ZONE}', 'ride', 'free-ride', 'Ride how you like', 7200, '', 'today', 0, 1, '${state}', ${Date.now()}, ${e + 12 * 3600e3}, 0)`);
  return id; };
const offerRow = (id) => one(`SELECT state, taken FROM fx_offers WHERE id = '${id}'`)[0];
const swapOf = (k) => p.evaluate(async (d) => (await window.__fx()).S.swaps[d] ?? null, dayAt(k));
const tabNow = () => p.evaluate(async () => { const m = await window.__fx(); return [m.S.tab, m.S.dayAt]; });
const A = offer(2, 'yes'), B = offer(3, 'yes'), C = offer(4, 'yes'), Dn = offer(5, 'new');
await fresh(HUB + '/fitness/');
await p.waitForSelector(`.offer.from-today[data-offer="${A}"]`, { timeout: 15000 });
await p.screenshot({ path: `${out}/2-from-today.png` });
const cardA = p.locator(`.offer.from-today[data-offer="${A}"]`);
ok((await cardA.locator('.offer-chip').innerText()).trim() === 'From Today' && (await cardA.locator('h2').innerText()) === `Ride ${weekdayOf(2)} 10:00`,
  `drawn “From Today · Ride ${weekdayOf(2)} 10:00”`, `${await cardA.locator('.offer-chip').innerText()} · ${await cardA.locator('h2').innerText()}`);
ok(await cardA.locator('button:text-is("Keep")').count() === 1 && await cardA.locator('button:text-is("Undo")').count() === 1, 'added by Today: Keep and Undo');
const cardD = p.locator(`.offer.from-today[data-offer="${Dn}"]`);
ok(await cardD.locator('button:text-is("Add to My Plan")').count() === 1 && await cardD.locator('button:text-is("Not Now")').count() === 1, 'suggested by Today: Add to My Plan (and Not Now)');
ok(await swapOf(2) === 'free-ride' && await swapOf(3) === 'free-ride' && await swapOf(4) === 'free-ride' && await swapOf(5) === null, 'the added ones applied as swaps on opening; the suggested one not');
ok(await waitFor(() => { const sw = state()?.swaps || {}; return sw[dayAt(2)] === 'free-ride' && sw[dayAt(3)] === 'free-ride' && sw[dayAt(4)] === 'free-ride'; }), 'and kept with the record (its version), as any swap');
ok([A, B, C].every((id) => offerRow(id)?.taken === 0), 'opening applies them, but taps nothing: none taken');
// Keep
await cardA.locator('button:text-is("Keep")').click();
ok(await waitFor(() => offerRow(A)?.taken === 1 && offerRow(A)?.state === 'yes'), 'Keep: POST offers/<id> yes, taken = 1');
await p.waitForSelector(`.offer.from-today[data-offer="${A}"]`, { state: 'detached', timeout: 10000 }).catch(() => {});
ok(await p.locator(`.offer.from-today[data-offer="${A}"]`).count() === 0 && await swapOf(2) === 'free-ride', 'kept: the card gone, the ride still in its day');
// Undo here
await p.locator(`.offer.from-today[data-offer="${B}"] button:text-is("Undo")`).click();
ok(await waitFor(() => offerRow(B)?.state === 'no'), 'Undo in Fitness: the offer turns no');
ok(await swapOf(3) === null && await waitFor(() => state()?.swaps?.[dayAt(3)] === undefined), 'and its swap taken out (it still held the offer’s workout), in the record too');
// Undo on Today (the offer turned no on the server): taken out at the next open
one(`UPDATE fx_offers SET state = 'no' WHERE id = '${C}'`);
await fresh(HUB + '/fitness/');
ok(await swapOf(4) === null && await waitFor(() => state()?.swaps?.[dayAt(4)] === undefined), 'undone on Today: its swap comes out as Fitness next opens');
ok(await swapOf(2) === 'free-ride', 'the kept one stays');
// (one past its time on its own day stays in it: a ride Today added for this morning, then the evening's open, 12 hours
// after it ended, when it's no longer in GET me's list: forgotten here, never taken out)
await p.evaluate(async (d) => { const m = await window.__fx(); delete m.S.swaps[d]; m.keep('swaps'); m.redraw(); }, dayAt(0));
await waitFor(() => state()?.swaps?.[dayAt(0)] === undefined);
const T0 = offer(0, 'yes');
await fresh(HUB + '/fitness/');
ok(await swapOf(0) === 'free-ride' && await waitFor(() => state()?.swaps?.[dayAt(0)] === 'free-ride'), 'one Today added for this morning, applied to today');
one(`UPDATE fx_offers SET until = ${Date.now() - 1000} WHERE id = '${T0}'`);
await fresh(HUB + '/fitness/');
const appliedNow = await p.evaluate(() => { try { return Object.keys(JSON.parse(localStorage.getItem('fitness:today-swaps')).applied); } catch (_) { return null; } });
ok(await swapOf(0) === 'free-ride' && state()?.swaps?.[dayAt(0)] === 'free-ride' && Array.isArray(appliedNow) && !appliedNow.includes(T0) && appliedNow.includes(A),
  'past its time on its own day: its swap stays (here and in the record), forgotten from what Fitness put in', JSON.stringify(appliedNow));
// (today back to Endurance 90 for what follows)
await p.evaluate(async (d) => { const m = await window.__fx(); m.S.swaps[d] = 'endurance-90'; m.keep('swaps'); m.redraw(); }, dayAt(0));
await waitFor(() => state()?.swaps?.[dayAt(0)] === 'endurance-90');
// (a day changed by hand isn't taken back: one added again, its day then changed, then undone on Today)
const E = offer(6, 'yes');
await fresh(HUB + '/fitness/');
ok(await swapOf(6) === 'free-ride', 'another added one, applied');
await p.evaluate(async (d) => { const m = await window.__fx(); m.S.swaps[d] = 'endurance-90'; m.keep('swaps'); }, dayAt(6));
await waitFor(() => state()?.swaps?.[dayAt(6)] === 'endurance-90');
one(`UPDATE fx_offers SET state = 'no' WHERE id = '${E}'`);
await fresh(HUB + '/fitness/');
ok(await swapOf(6) === 'endurance-90', 'undone on Today after its day was changed by hand: the day left as you made it');
// Add to My Plan
await p.locator(`.offer.from-today[data-offer="${Dn}"] button:text-is("Add to My Plan")`).click();
await p.waitForSelector('#sheet .offer-acts .btn:text-is("Add to My Plan")', { timeout: 10000 }); await settle(p, 400);
await p.screenshot({ path: `${out}/3-add.png` });
await p.click('#sheet .offer-acts .btn:text-is("Add to My Plan")');
ok(await waitFor(() => offerRow(Dn)?.state === 'yes' && offerRow(Dn)?.taken === 1), 'Add to My Plan: yes, taken = 1');
ok(await swapOf(5) === 'free-ride' && await waitFor(() => state()?.swaps?.[dayAt(5)] === 'free-ride'), 'and its day swapped for it, kept with the record');

// ---- 3. sections by the address: #activities as it opens; #day= told again while it's open ----
await fresh(HUB + '/fitness/#activities');
ok((await tabNow())[0] === 'activities' && await p.locator('#tabs .tab[aria-current="page"][title="Activities"]').count() === 1, '/fitness/#activities: opened on Activities', JSON.stringify(await tabNow()));
await p.evaluate((k) => { location.hash = `#day=${k}`; }, keyOf(2)); await settle(p, 900);
const seen = await tabNow();
ok(seen[0] === 'today' && seen[1] === dayAt(2), `#day=${keyOf(2)} while open: Today, on that day`, JSON.stringify(seen));
const chip = await p.locator('.session.ahead .hero-top .sport').innerText().catch(() => '');
ok(/from Today/.test(chip), 'that day’s card: the ride “from Today”', chip);
ok(await p.evaluate(() => location.hash) === '#today', 'the address left saying the tab, so the same link again is told again', await p.evaluate(() => location.hash));
await p.screenshot({ path: `${out}/4-day.png` });
await p.evaluate(() => { location.hash = '#progress'; }); await settle(p, 600);
ok((await tabNow())[0] === 'progress', '#progress while open: Progress');
// #offer=: a suggestion of Today's, as it opens: its Add to Your Plan sheet; one of Today's added, while open: its card, in
// sight, no sheet
const G = offer(1, 'yes'), Hn = offer(7, 'new');
await fresh(HUB + `/fitness/#offer=${Hn}`);
await p.waitForSelector('#sheet .offer-acts .btn:text-is("Add to My Plan")', { timeout: 10000 }).catch(() => {});
ok(await p.locator('#sheet .offer-acts .btn:text-is("Add to My Plan")').count() === 1 && (await tabNow())[0] === 'today', `#offer=<a suggestion> as it opens: Add to Your Plan`);
await p.evaluate(async () => (await window.__fx()).closeSheet()); await settle(p, 500);
await p.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await settle(p, 400);
const cardG = p.locator(`.offer.from-today[data-offer="${G}"]`), inView = async () => { const b = await cardG.boundingBox(); return !!b && b.y >= 0 && b.y + b.height <= 844; };
const wasInView = await inView();
await p.evaluate((id) => { location.hash = `#offer=${id}`; }, G); await settle(p, 1200);
ok(!wasInView && await inView() && !(await p.evaluate(async () => (await window.__fx()).sheetEl.open)), '#offer=<one Today added> while open: its card brought into sight from the foot of the page, no sheet', `in view before: ${wasInView}`);
ok(await p.evaluate(() => location.hash) === '#today', 'and the address left saying the tab');

// ---- 4. Send: through the hub's send (spied), never an address; unspied, Chats' own sheet, with the way back ----
await fresh(HUB + '/fitness/#today');
await p.waitForSelector('.session.go .acts button:has-text("Send to a friend")', { timeout: 15000 });
await p.evaluate(async () => { const m = await window.__fx(); window.__sent = []; window.__send = m.IFL.hub.send; m.IFL.hub.send = (...a) => { window.__sent.push(a); return Promise.resolve(true); }; });
const navsBefore = p.url();
await p.click('.session.go .acts button:has-text("Send to a friend")'); await settle(p, 600);
const sent = await p.evaluate(() => window.__sent);
const card = sent?.[0]?.[1] ? JSON.parse(Buffer.from(sent[0][1], 'base64url').toString('utf8')) : null;
ok(sent.length === 1 && /^Today: Endurance 90/.test(sent[0][0]) && card?.kind === 'fitness' && card.snap?.name === 'Endurance 90' && !('ref' in card), 'Send to a friend: IFL.hub.send(words, packed card), no share id', JSON.stringify(sent).slice(0, 200));
ok(p.url() === navsBefore, 'and the page stays where it is');
await p.evaluate(async () => { (await window.__fx()).IFL.hub.send = window.__send; });
await Promise.all([p.waitForURL((u) => u.pathname === '/chats/', { timeout: 40000 }), p.click('.session.go .acts button:has-text("Send to a friend")')]);
const viaChats = navs.find((u) => new URL(u).pathname === '/chats/' && /#share=/.test(u)) || p.url(), q = new URLSearchParams(new URL(viaChats).hash.slice(1));
const card2 = (() => { try { return JSON.parse(Buffer.from(q.get('card') || '', 'base64url').toString()); } catch (_) { return null; } })();
ok(new URL(viaChats).origin === HUB && /^Today: Endurance 90/.test(q.get('share') || '') && q.get('back') === '/fitness/#today' && JSON.stringify(card2?.snap) === JSON.stringify(card?.snap),
  'unspied, with no Chats engine ready: Chats’ own sheet at the hub, the same words and card, and the way back', viaChats.slice(0, 200));

// ---- 5. Strava's row at the hub; push never asked for ----
await fresh(HUB + '/fitness/');
await p.evaluate(async () => { const m = await window.__fx(); m.openSheet(m.stravaView); }); await settle(p, 600);
ok(/Strava opens on its own; come back here when it says you’re connected/.test(await p.locator('#sheet').innerText()), 'Connect Strava: says Strava opens on its own');
await p.evaluate(async () => (await window.__fx()).closeSheet()); await settle(p, 500);
await p.locator('.fhead .hub-more').click(); await p.waitForSelector('.ifm-pop [data-k=notify]', { timeout: 10000 });
ok((await p.locator('.ifm-pop [data-k=notify] .ifm-val').innerText().catch(() => '')) === 'In You', 'Fitness Settings: Notifications are You’s at the hub');
ok(await p.locator('.ifm-pop .ifm-out').count() === 0, 'Fitness Settings at the hub: no Sign Out of its own (signing out is You’s)');
await p.keyboard.press('Escape'); await settle(p, 400);
await p.evaluate(async () => { const m = await window.__fx(); m.openSheet(m.settingsView); }); await settle(p, 600);
ok(await p.locator('#sheet button:text-is("Sign Out")').count() === 0, 'nor in its Settings');
await p.evaluate(async () => (await window.__fx()).closeSheet()); await settle(p, 400);
// (an old morning reminder of Fitness's own kept at the hub's address, InFlite's own subscription there, and #notify
// asked: nothing asked of Fitness's push routes, nothing subscribed, nothing let go; every subscribe and unsubscribe here
// noted with the page it came from)
await ctx.addInitScript(() => {
  const note = (k) => { try { const l = JSON.parse(localStorage.getItem('__push') || '[]'); l.push(`${k} ${location.pathname}`); localStorage.setItem('__push', JSON.stringify(l)); } catch (_) {} };
  const P = PushManager.prototype, sub = P.subscribe, get = P.getSubscription;
  const wrap = (x) => (x && typeof x.unsubscribe === 'function' ? Object.assign(x, { unsubscribe: ((u) => function (...a) { note('unsubscribe'); return u.apply(this, a); })(x.unsubscribe) }) : x);
  P.subscribe = async function (...a) { note('subscribe'); return wrap(await sub.apply(this, a)); };
  P.getSubscription = async function (...a) { return wrap(await get.apply(this, a)); };
});
await p.evaluate(() => { localStorage.setItem('fitness:morning', JSON.stringify({ at: 420, endpoint: 'https://fcm.googleapis.com/fcm/send/rhea-old-fitness' })); localStorage.setItem('fakesub', btoa('inflite-root')); localStorage.removeItem('__push'); });
await fresh(HUB + '/fitness/#notify'); await settle(p, 3800);
const pushNoted = () => p.evaluate(() => JSON.parse(localStorage.getItem('__push') || '[]'));
ok(pushAsks.length === 0 && (await pushNoted()).length === 0 && await p.evaluate(() => localStorage.getItem('fakesub')) === btoa('inflite-root'),
  'at the hub, with Fitness’s old reminder kept there and #notify: no push route asked, nothing subscribed or let go, InFlite’s subscription still there', `${pushAsks.join(', ')} ${JSON.stringify(await pushNoted())}`);
// (Sign Out, asked of Fitness at the hub: to You, where InFlite's is; Fitness signs nothing out and lets nothing go)
const outAsks = []; const onOut = (r) => { if (/\/api\/fitness\/(signout|push)/.test(r.url())) outAsks.push(`${r.method()} ${r.url()}`); }; p.on('request', onOut);
await Promise.all([p.waitForURL((u) => u.pathname === '/' && u.hash === '#you', { timeout: 20000 }).catch(() => {}), p.evaluate(async () => { (await window.__fx()).signOutHere(); }).catch(() => {})]);
p.off('request', onOut);
ok(pathOf(p.url()) === '/#you' && outAsks.length === 0 && !(await pushNoted()).some((x) => / \/fitness\//.test(x)),
  'signOutHere at the hub: on to You (/#you), no /api/fitness/signout or push, nothing let go by Fitness', `${p.url()} ${outAsks.join(', ')} ${JSON.stringify(await pushNoted())}`);
const still = await p.evaluate(async () => (await fetch('/api/fitness/me')).json());
ok(still.signedIn === true, 'and still signed in');
await p.evaluate(() => { localStorage.removeItem('fitness:morning'); });
ok(pushAsks.length === 0, 'at the hub, Fitness never asked its push routes for anything', pushAsks.join(', '));

// ---- 6. Back: opened from Apps' tile, back to Apps ----
await p.goto(HUB + '/#apps');
const tile = await p.waitForSelector('.atile[data-app="fitness"] a.atile-go', { timeout: 20000 }).then(() => true, () => false);
if (tile) await Promise.all([p.waitForURL((u) => u.pathname === '/fitness/', { timeout: 20000 }), p.click('.atile[data-app="fitness"] a.atile-go')]);
else await p.evaluate(() => location.assign(window.IFL.hub.href('fitness')));
await p.waitForSelector('.fhead .ifl-back', { timeout: 30000 }); await settle(p, 500);
await Promise.all([p.waitForURL((u) => u.pathname === '/' && u.hash === '#apps', { timeout: 20000 }), p.click('.fhead .ifl-back')]);
ok(pathOf(p.url()) === '/#apps', `opened from Apps${tile ? '’ Fitness tile' : ''}: Back to Apps`, p.url());

// ---- 7. signed out at the hub: Sign In through Chats, coming back to Fitness ----
const out2 = await hubPhone('rhea-out', null, { path: '/fitness/' });
await out2.p.waitForSelector('#sign-in:not([disabled])', { timeout: 30000 });
ok(await out2.p.locator('.w-back .ifl-back').count() === 1, 'signed out: Back over the morning too');
await Promise.all([out2.p.waitForURL((u) => u.pathname === '/chats/', { timeout: 20000 }), out2.p.click('#sign-in')]);
ok(pathOf(out2.p.url()) === '/chats/#signin-start&then=%2Ffitness%2F', 'Sign In: the hub’s, through Chats, and back to /fitness/', out2.p.url());
await out2.ctx.close();

// ---- 8. #act= on a phone new to the account, the ride beyond the first page of activities: opened once the older ones
// are in, never said not to be there; one on the first page at once; one that isn't anywhere, said so once they're in ----
// (one statement, no double quotes: the tests' SQL goes to wrangler inside them)
one(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 405) INSERT INTO fx_acts (user_id, id, start, sport, indoor, name, type, size, sum, added) SELECT '${uid}', 'old' || i, ${dayAt(-30)} - i * 86400000, 'ride', 0, 'Old ride ' || i, 'fit', 1, json_object('secs', 3600, 'dist', 30000, 'tss', 50), ${Date.now()} FROM n`);
ok(one(`SELECT COUNT(*) AS n FROM fx_acts WHERE user_id = '${uid}'`)[0]?.n >= 405, 'Rhea’s account: 405 older rides, more than the first page (400)');
const nu = await hubPhone('rhea-new', null, { cookies: { [cname]: cvalue }, path: '/api/hub', zone: ZONE });
const nuErrs = []; nu.p.on('pageerror', (e) => { if (/\/fitness\//.test(nu.p.url())) nuErrs.push(e.message); });
await nu.ctx.addInitScript(() => {
  try { const d = new Date(); d.setHours(0, 0, 0, 0); localStorage.setItem('fitness:asked', String(d.getTime())); localStorage.setItem('fitness:welcomed', 'true'); } catch (_) {}
  window.__fx = () => import(document.querySelector('script[type="module"][src*="app.js"]').src);
  // (every sheet title and toast this page shows, in order)
  window.__seen = [];
  addEventListener('DOMContentLoaded', () => new MutationObserver(() => {
    for (const x of [document.querySelector('#sheet h1')?.textContent, document.querySelector('#toast span')?.textContent].map((v, i) => v && `${i ? 'toast' : 'sheet'}: ${v}`))
      if (x && window.__seen.at(-1) !== x) window.__seen.push(x);
  }).observe(document.documentElement, { subtree: true, childList: true, characterData: true }));
});
await nu.p.goto(HUB + '/fitness/#act=old405');
await nu.p.waitForSelector('.fhead .ifl-back', { timeout: 30000 });
const seenNu = () => nu.p.evaluate(() => window.__seen);
// (its file isn't kept by these tests, so the sheet then says so, “That activity isn’t here any more.”: the account's own
// answer for the file, after the sheet's opened, not Fitness's “That activity isn’t here.” for one it couldn't find)
ok(await waitFor(async () => (await seenNu()).includes('sheet: Old ride 405'), 20000) && !(await seenNu()).includes('toast: That activity isn’t here.'),
  '#act=<a ride beyond the first page>, on a phone new to the account: its sheet, once the older ones are in; never “isn’t here”', JSON.stringify(await seenNu()));
await nu.p.evaluate(async () => { const m = await window.__fx(); if (m.sheetEl.open) await m.closeSheet(); }); await settle(nu.p, 500);
await nu.p.evaluate(() => { location.hash = '#act=old1'; });
ok(await waitFor(async () => (await seenNu()).includes('sheet: Old ride 1'), 8000), '#act=<one on the first page> while open: its sheet at once');
await nu.p.evaluate(async () => { const m = await window.__fx(); if (m.sheetEl.open) await m.closeSheet(); }); await settle(nu.p, 500);
await nu.p.evaluate(() => { location.hash = '#act=nowhere1'; });
ok(await waitFor(async () => (await seenNu()).includes('toast: That activity isn’t here.'), 8000), '#act=<one that isn’t anywhere>: “That activity isn’t here.”');
ok(nuErrs.length === 0, 'no page errors there', nuErrs.slice(0, 3).join(' | '));
await nu.ctx.close();

// ---- 9. off the hub, from an old Home Screen icon of Fitness's own (fitness.<site>, standalone): the card saying InFlite
// is one app now, once; its Turn Off Notifications Here takes this phone's morning reminder off (DELETE /api/fitness/push)
// and lets its subscription go ----
const OWN = 'http://fitness.ifl.test:8788';
const own = await hubPhone('rhea-own', await K.makeKeys(), { cookies: { [cname]: cvalue }, path: '/api/hub', zone: ZONE });
await own.ctx.grantPermissions(['notifications'], { origin: OWN });
await own.ctx.addInitScript(() => {
  if (!location.host.startsWith('fitness.')) return;
  try {
    const d = new Date(); d.setHours(0, 0, 0, 0); localStorage.setItem('fitness:asked', String(d.getTime())); localStorage.setItem('fitness:welcomed', 'true');
    if (!localStorage.getItem('__seeded')) { localStorage.setItem('__seeded', '1'); localStorage.setItem('fitness:morning', JSON.stringify({ at: 420, endpoint: 'https://fcm.googleapis.com/fcm/send/rhea-own-device' })); localStorage.setItem('fakesub', btoa('fitness-own')); }
  } catch (_) {}
});
const ownErrs = []; own.p.on('pageerror', (e) => ownErrs.push(e.message));
const ownPush = []; own.p.on('request', (r) => { if (/\/api\/fitness\/push$/.test(new URL(r.url()).pathname)) ownPush.push(`${r.method()} ${r.postData() || ''}`); });
await own.p.goto(OWN + '/');
await own.p.waitForSelector('.ifl-moved', { timeout: 30000 }).catch(() => {});
ok(new URL(own.p.url()).host === 'fitness.ifl.test:8788' && await own.p.locator('.ifl-moved').count() === 1 && await own.p.locator('.fhead .ifl-back').count() === 0,
  'off the hub, standalone at fitness.<site>: “InFlite is one app now”, and no Back (not the hub)', own.p.url());
await own.p.screenshot({ path: `${out}/9-moved.png` });
await own.p.locator('.ifl-moved .ifa-off').click();
ok(await waitFor(() => ownPush.some((x) => /^DELETE .*rhea-own-device/.test(x)), 10000), 'Turn Off Notifications Here: DELETE /api/fitness/push, for this phone’s reminder', ownPush.join(' | '));
ok(await waitFor(async () => await own.p.evaluate(() => localStorage.getItem('fitness:morning')) === 'null' && await own.p.evaluate(() => localStorage.getItem('fakesub')) === null, 8000),
  'its reminder forgotten here, and its subscription let go');
await own.p.waitForSelector('.ifl-moved', { state: 'detached', timeout: 5000 }).catch(() => {});
await own.p.reload(); await own.p.waitForSelector('.fhead', { timeout: 30000 }); await settle(own.p, 2500);
ok(await own.p.locator('.ifl-moved').count() === 0, 'the card once: not again on the next open');
ok(ownErrs.length === 0, 'no page errors there', ownErrs.slice(0, 3).join(' | '));
await own.ctx.close();

// ---- one window, no page errors ----
ok(pages.length === 1 && JSON.stringify(await p.evaluate(() => window.__opened || [])) === '[]', 'one window throughout', `${pages.length} ${JSON.stringify(await p.evaluate(() => window.__opened || []))}`);
ok(fitErrs.length === 0, 'no page or console errors on Fitness’s pages', fitErrs.slice(0, 4).join(' | '));
console.log(`FAILS ${K.fails()}`);
process.exit(0);
