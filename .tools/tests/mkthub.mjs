// needs: hub
// Markets at InFlite's hub (Today First, spec §9.2, §14.3): /markets/ a page of the hub (ifl.test:8788, the inflite
// repo's Worker), opened on a section by its address (#s=TSCO.L, #holdings, #news) and told again by the hash while it's
// open (a link, or the hub's notification listener's location.assign: the same document); a stock sent through
// IFL.hub.send (spied), its card percent only (name, sym, pct, day) and its words too; the icon's badge and the
// notifications left alone at the hub (InFlite's, Chat's count among them), and off it cleared as ever; the hub's
// subscription never kept with Markets, nor let go; Back where you came from (Today), else to Apps; signed out, the
// hub's Sign In through Chats; one window throughout; and at Markets' own address, the app as it was.
import { createHash, randomBytes } from 'node:crypto';
import { kit } from './lib.mjs';
import { hostCall } from './handback.mjs';

const [,, S, out] = process.argv;
const K = await kit(S, out);
const { ok, one, hubPhone, HUB } = K;
const MKT = 'http://finance.ifl.test:8788';
const b64u = (u) => Buffer.from(u).toString('base64url');
const settle = (p, ms = 500) => p.waitForTimeout(ms);
const text = (p, sel) => p.locator(sel).first().innerText().catch(() => '');
const pathOf = (u) => { const x = new URL(u); return x.pathname + x.hash; };
process.on('uncaughtException', (e) => { console.log(`FAIL  ${String(e.message).split('\n')[0]}`); console.log(String(e.stack).split('\n').slice(0, 6).join('\n')); console.log(`FAILS ${K.fails() + 1}`); process.exit(1); });

// ---- an account, made at the sign-in page of the tests' site (its cookie covers ifl.test) ----
const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']), pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
const made = await hostCall('auth.ifl.test', '/api/account/signup', { name: 'George Hale', handle: 'georgemk', email: 'george.mk@example.com', salt: b64u(randomBytes(16)), proof: b64u(randomBytes(32)),
  vault: 'x'.repeat(40), pub: { kty: 'EC', crv: 'P-256', x: pub.x, y: pub.y } }, { ip: '10.0.9.7' });
ok(made.s === 201 && made.cookie, 'an account made, signed in on the tests’ site', `${made.s} ${JSON.stringify(made.j)}`);
const [cname, cvalue] = made.cookie.split('=');

// ---- George's phone, InFlite on its Home Screen; Markets opened at the hub ----
const ph = await hubPhone('george', await K.makeKeys(), { cookies: { [cname]: cvalue }, path: '/markets/' });
const { p, ctx, pages } = ph;
const navs = []; p.on('framenavigated', (f) => { if (f === p.mainFrame()) navs.push(f.url()); });
// (every page error and console error on Markets' pages, at the hub or its own address: none expected)
const mktErrs = [], onMkt = () => /\/markets\/|\/\/finance\./.test(p.url());
// (by where it came from: Chats' engine, a frame over the page at the hub, has its own)
const fromChats = (where) => /\/chats\//.test(where || '');
p.on('pageerror', (e) => { if (onMkt() && !fromChats(e.stack)) mktErrs.push(`${p.url()}: ${e.message}`); });
p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text()) && onMkt() && !fromChats(m.location()?.url)) mktErrs.push(`${p.url()}: ${m.text()}`); });
// (what Markets asked of its push routes: nothing, at the hub)
const pushAsks = []; p.on('request', (r) => { if (/\/api\/markets\/push(\b|-)/.test(r.url())) pushAsks.push(`${r.method()} ${r.url()}`); });
await p.waitForSelector('main:not([aria-busy="true"])', { timeout: 30000 });
const put = await p.evaluate(async () => {
  const one = (b) => fetch('/api/markets/holding', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.status);
  return [await one({ symbol: 'TSCO.L', name: 'Tesco', qty: 200, cost: 3.5 }), await one({ symbol: 'RR.L', name: 'Rolls-Royce', qty: 40 })];
});
ok(put.every((s) => s === 200), 'two holdings added through the hub (its API at Markets’ own host)', JSON.stringify(put));
// (from here: the badge and the notifications watched, Chat's engine left out of the way, and a subscription at the
// hub's origin as InFlite's own would leave it: Markets must neither keep it with the account nor let it go)
await ctx.addInitScript(() => {
  window.__badge = [];
  Navigator.prototype.clearAppBadge = function () { window.__badge.push('clear'); return Promise.resolve(); };
  Navigator.prototype.setAppBadge = function (n) { window.__badge.push(`set ${n}`); return Promise.resolve(); };
  if (window.ServiceWorkerRegistration) ServiceWorkerRegistration.prototype.getNotifications = async function () { window.__badge.push('notifications'); return [{ close() { window.__badge.push('close'); } }]; };
});
await p.evaluate(() => localStorage.setItem('fakesub', btoa('k'.repeat(65))));

// ---- 1. a stock by the address: /markets/#s=TSCO.L ----
await p.goto(HUB + '/markets/#s=TSCO.L');
await p.waitForSelector('#sheet .sname:has-text("Tesco")', { timeout: 30000 });
await p.waitForSelector('#sheet .tool:has-text("Send in Chat")', { timeout: 20000 }); await settle(p, 900);
await p.screenshot({ path: `${out}/1-stock.png` });
ok(new URL(p.url()).origin === HUB && (await text(p, '#sheet .sname')) === 'Tesco', '/markets/#s=TSCO.L: a page of the hub, opened on Tesco’s page', p.url());
ok(await p.evaluate(() => location.hash) === '#today', 'and the address says the tab under it, so the stock isn’t asked for again on a reload', await p.evaluate(() => location.hash));
ok(await p.locator('.mhead .ifl-back').count() === 1 && await p.locator('.mhead .ifh-me').count() === 0, 'the menu button is Back at the hub');
ok(await p.locator('.mhead .ifh-act[aria-label="Settings"]').count() === 1, 'and Markets’ own settings beside Find and Add');
ok(await p.locator('.ifl-moved').count() === 0, 'at the hub, on the Home Screen: no “InFlite is one app now” card');
ok(JSON.stringify(await p.evaluate(() => window.__badge)) === '[]', 'opened at the hub: the badge and the notifications left alone', JSON.stringify(await p.evaluate(() => window.__badge)));
const backBox = await p.locator('.mhead .ifl-back').boundingBox();
ok(backBox && backBox.height >= 40 && backBox.width >= 44 && backBox.x >= 12, 'Back: a full-size control, inside the screen', JSON.stringify(backBox));

// ---- 2. Send a stock: IFL.hub.send, spied, with a percent-only card ----
await p.evaluate(async () => {
  const src = document.querySelector('script[type="module"][src*="app.js"]').src, m = await import(src);
  window.__sent = []; window.__hubSend = m.IFL.hub.send;
  m.IFL.hub.send = (...a) => { window.__sent.push(a); return Promise.resolve(true); };
});
const reqsAtSend = []; const onReq = (r) => reqsAtSend.push(r.url()); p.on('request', onReq);
await p.click('#sheet .tool:has-text("Send in Chat")'); await settle(p, 400);
p.off('request', onReq);
const sent = await p.evaluate(() => window.__sent);
ok(sent.length === 1, 'Send in Chat calls IFL.hub.send, once', JSON.stringify(sent));
const [words, packed, opts] = sent[0] || [];
const card = (() => { try { return JSON.parse(Buffer.from(packed, 'base64url').toString()); } catch (_) { return null; } })();
ok(card?.kind === 'markets' && JSON.stringify(Object.keys(card.snap || {}).sort()) === '["day","name","pct","sym"]' && card.snap.sym === 'TSCO.L' && card.snap.name === 'Tesco' && typeof card.snap.pct === 'number',
  'its card: a markets card with name, sym, pct and day, nothing more', JSON.stringify(card));
ok(card && !/price|value|qty|cost|amount|£|GBP|412|4\.12|3\.5/.test(JSON.stringify(card)), 'no price, value, holding or pound anywhere in the card', JSON.stringify(card));
ok(typeof words === 'string' && /^Tesco \(TSCO\) is up \d+\.\d% today\.$/.test(words) && !/£|\dp\b/.test(words), 'its words in percent too, never the price', words);
ok(opts === undefined, 'no friend chosen for George');
ok(new URL(p.url()).pathname === '/markets/' && !reqsAtSend.some((u) => /\/chats\//.test(u)), 'and the page stays where it is (the hub’s sheet is over it)', JSON.stringify(reqsAtSend.slice(0, 4)));
// (the hub's own send, put back: with no Chats engine ready here, Chats' own sheet, which comes back to this page)
await p.evaluate(async () => { const m = await import(document.querySelector('script[type="module"][src*="app.js"]').src); m.IFL.hub.send = window.__hubSend; });
await Promise.all([p.waitForURL((u) => u.pathname === '/chats/', { timeout: 40000 }), p.click('#sheet .tool:has-text("Send in Chat")')]);
const viaChats = navs.find((u) => new URL(u).pathname === '/chats/' && /#share=/.test(u)) || p.url(), q = new URLSearchParams(new URL(viaChats).hash.slice(1));
const card2 = (() => { try { return JSON.parse(Buffer.from(q.get('card') || '', 'base64url').toString()); } catch (_) { return null; } })();
ok(new URL(viaChats).origin === HUB && q.get('share') === words && JSON.stringify(card2?.snap) === JSON.stringify(card?.snap) && q.get('back') === '/markets/#today',
  'unspied: Chats’ own sheet at the hub, with the same words and card, and the way back to Markets', viaChats.slice(0, 200));

// ---- 3. sections by the address, at opening ----
for (const [hash, tab, title] of [['holdings', 'holdings', 'Holdings'], ['news', 'news', 'News']]) {
  await p.goto(`${HUB}/markets/#${hash}`);
  await p.waitForSelector(`.tab[data-tab="${tab}"][aria-current="page"]`, { timeout: 30000 }); await settle(p, 600);
  ok((await text(p, '.mhead .ifh-name')) === title && await p.evaluate(() => location.hash) === `#${hash}`, `/markets/#${hash}: opened on ${title}`, `${await text(p, '.mhead .ifh-name')} ${p.url()}`);
  await p.screenshot({ path: `${out}/3-${hash}.png` });
}

// ---- 4. told again while it's open: hashchange, in the same document ----
await p.evaluate(() => { window.__same = 'yes'; });
await p.evaluate(() => { location.hash = 'holdings'; });
await p.waitForSelector('.tab[data-tab="holdings"][aria-current="page"]');
ok((await text(p, '.mhead .ifh-name')) === 'Holdings', 'hash #holdings while News is open: Holdings');
await p.evaluate(() => { location.hash = 's=RR.L'; });
await p.waitForSelector('#sheet .sname:has-text("Rolls-Royce")', { timeout: 20000 }); await settle(p, 700);
ok(true, 'hash #s=RR.L while open: Rolls-Royce’s page over Holdings');
ok(await p.evaluate(() => location.hash) === '#holdings', 'the address back to the tab under it', await p.evaluate(() => location.hash));
// (as the hub's listener does for a notification tapped while Markets is open: location.assign to a path of the hub)
await p.evaluate(() => location.assign('/markets/#news'));
await p.waitForSelector('.tab[data-tab="news"][aria-current="page"]');
await settle(p, 700);
ok(!(await p.isVisible('#sheet .sname')) && (await text(p, '.mhead .ifh-name')) === 'News', 'location.assign("/markets/#news") with a stock open: the sheet shut, News');
ok(await p.evaluate(() => window.__same) === 'yes', 'all in the same document, never loaded again');
// (the tabs keep the address: Back from another page comes back to the one you were on)
await p.click('.tab[data-tab="today"]'); await settle(p, 500);
ok(await p.evaluate(() => location.hash) === '#today', 'a tab chosen: the address says it (#today)');

// ---- 5. the badge and notifications: InFlite's, left alone at the hub ----
await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await settle(p, 800);
const badge = await p.evaluate(() => window.__badge);
ok(Array.isArray(badge) && badge.length === 0, 'at the hub, Markets never clears the badge nor closes a notification (opened, and back in front)', JSON.stringify(badge));

// ---- 6. push stands down at the hub: the subscription InFlite's, never kept with Markets, never let go ----
await p.click('.mhead .ifh-act[aria-label="Settings"]'); await p.waitForSelector('#mk-wrap'); await settle(p, 700);
await p.screenshot({ path: `${out}/6-settings.png` });
ok(/In You/.test(await text(p, '#sheet .rows .srow:has-text("Notifications")')) && await p.locator('#sheet .srow.danger:has-text("Sign Out")').count() === 0,
  'Settings at the hub: notifications are in You, and no Sign Out of Markets’ own', await text(p, '#sheet .rows'));
const wrapWas = await p.getAttribute('#mk-wrap', 'aria-checked');
await p.click('#mk-wrap'); await p.waitForFunction((w) => document.querySelector('#mk-wrap')?.getAttribute('aria-checked') !== w && !document.querySelector('#mk-wrap').disabled, wrapWas); await settle(p, 400);
if (wrapWas === 'true') { await p.click('#mk-wrap'); await p.waitForFunction(() => document.querySelector('#mk-wrap')?.getAttribute('aria-checked') === 'true' && !document.querySelector('#mk-wrap').disabled); await settle(p, 400); }
ok(/once your markets close/.test(await text(p, '#toast')) && !/off on this phone/.test(await text(p, '#toast')), 'Evening Wrap on at the hub: said, with no word of this phone’s notifications', await text(p, '#toast'));
await p.keyboard.press('Escape'); await settle(p, 700);
await p.evaluate(() => { location.hash = 's=TSCO.L'; });
await p.waitForSelector('#sheet #alert'); await settle(p, 600);
await p.click('#sheet #alert'); await p.waitForSelector('#sheet .choice.amt'); await p.click('#sheet .choice.amt button:has-text("3%")');
await p.waitForFunction(() => /You'll hear when/.test(document.querySelector('#toast')?.textContent || ''), null, { timeout: 10000 }).catch(() => {});
ok(/You'll hear when Tesco moves 3% in a day$/.test(await text(p, '#toast')), 'an alert set at the hub, said plainly', await text(p, '#toast'));
const pushRows = (() => { try { return Number(one('SELECT COUNT(*) AS n FROM mk_push')[0]?.n ?? 0); } catch (_) { return 0; } })();
ok(!pushAsks.length && pushRows === 0, 'Markets asked nothing of its push routes at the hub, and keeps no subscription', JSON.stringify({ pushAsks, pushRows }));
ok(await p.evaluate(() => !!localStorage.getItem('fakesub')), 'and the hub’s subscription is still there (never let go from Markets)');
await p.keyboard.press('Escape'); await settle(p, 500);

// ---- 7. Back: where you came from, else Apps ----
await p.goto(HUB + '/markets/#news'); await p.waitForSelector('.mhead .ifl-back'); await settle(p, 500);
await Promise.all([p.waitForURL((u) => u.pathname === '/' && u.hash === '#apps', { timeout: 20000 }), p.click('.mhead .ifl-back')]);
ok(pathOf(p.url()) === '/#apps', 'opened straight (from nowhere in the window): Back goes to Apps', p.url());
await p.goto(HUB + '/'); await settle(p, 1200);
const fromAt = await p.evaluate(() => location.pathname + location.hash);
await Promise.all([p.waitForURL((u) => u.pathname === '/markets/', { timeout: 20000 }), p.evaluate(() => {
  const a = document.createElement('a'); a.href = '/markets/#holdings'; a.textContent = 'Markets'; document.body.append(a); a.click(); })]);
await p.waitForSelector('.tab[data-tab="holdings"][aria-current="page"]', { timeout: 30000 }); await settle(p, 500);
await p.screenshot({ path: `${out}/7-back.png` });
await Promise.all([p.waitForURL((u) => u.pathname === '/', { timeout: 20000 }), p.click('.mhead .ifl-back')]);
ok(pathOf(p.url()) === fromAt, 'opened from Today: Back goes back to Today, where it was left', `${p.url()} (left from ${fromAt})`);

// ---- 8. one window throughout ----
ok(pages.length === 1, 'one window throughout: nothing opened beside it', String(pages.length));
const away = navs.filter((u) => { const h = new URL(u).host; return h !== 'ifl.test:8788' && !/^(auth|account)\.ifl\.test:8788$/.test(h); });
ok(!away.length, 'every page stayed at the hub', JSON.stringify(away));
ok(!(await p.evaluate(() => window.__opened.length)), 'nothing asked for a new window');

// ---- 9. at Markets' own address: as it was (its menu button, the badge cleared, a section read and taken out of the address);
// and, opened from an old Home Screen icon there, once, that InFlite is one app now, whose Turn Off Notifications Here
// takes Markets' subscription off the account (DELETE push) and lets it go ----
await ctx.addInitScript(() => { if (location.hostname.startsWith('finance.') && !sessionStorage.getItem('subbed')) { sessionStorage.setItem('subbed', '1'); localStorage.setItem('fakesub', btoa('m'.repeat(65))); } });
const offAsks = []; p.on('request', (r) => { if (/\/\/finance\.ifl\.test:8788\/api\/markets\/push$/.test(r.url()) && r.method() === 'DELETE') offAsks.push(r.postData() || ''); });
await p.goto(MKT + '/#holdings');
await p.waitForSelector('.tab[data-tab="holdings"][aria-current="page"]', { timeout: 30000 }); await settle(p, 1200);
ok(await p.locator('.mhead .ifh-me').count() === 1 && await p.locator('.ifl-back').count() === 0 && await p.locator('.mhead .ifh-act[aria-label="Settings"]').count() === 0,
  'finance.ifl.test: no hub, so the menu button as ever, and no Back');
ok(await p.evaluate(() => location.hash) === '', 'its own address: #holdings opened, then taken out of the address', p.url());
ok((await p.evaluate(() => window.__badge)).includes('clear'), 'and there, opened, Markets clears its badge as ever', JSON.stringify(await p.evaluate(() => window.__badge)));
const moved = await p.waitForSelector('.ifl-moved .ifa-off', { timeout: 8000 }).then(() => true, () => false);
await p.screenshot({ path: `${out}/9-moved.png` });
ok(moved, 'off the hub, on the Home Screen: once, “InFlite is one app now”, with Turn Off Notifications Here');
if (moved) {
  await p.click('.ifl-moved .ifa-off');
  await p.waitForFunction(() => !document.querySelector('.ifl-moved .ifa-off') || !localStorage.getItem('fakesub'), null, { timeout: 15000 }).catch(() => {});
  await settle(p, 800);
  ok(offAsks.length === 1 && /fcm\.googleapis\.com\/fcm\/send\/george-device/.test(offAsks[0]) && !(await p.evaluate(() => localStorage.getItem('fakesub'))),
    'Turn Off Notifications Here: Markets’ subscription taken off the account (DELETE push) and let go', JSON.stringify(offAsks));
  ok(await p.locator('.ifl-moved').count() === 0, 'and the card put away');
}
await p.keyboard.press('Escape').catch(() => {});
await p.screenshot({ path: `${out}/9-own.png` });
await ctx.close();

// ---- 10. signed out at the hub: the hub's Sign In, through Chats, and back to this page ----
const out2 = await hubPhone('signedout', null, { path: '/markets/' });
const so = out2.p, soNavs = []; so.on('framenavigated', (f) => { if (f === so.mainFrame()) soNavs.push(f.url()); });
so.on('pageerror', (e) => { if (/\/markets\//.test(so.url())) mktErrs.push(`${so.url()}: ${e.message}`); });
await so.waitForSelector('.welcome #sign-in', { timeout: 30000 }); await settle(so, 2200);
await so.screenshot({ path: `${out}/10-signedout.png` });
ok(!(await so.isDisabled('#sign-in')) && await so.locator('.welcome .ifl-back').count() === 1 && !/finance\.inflite\.ai/.test(await text(so, '.ifl-cta')),
  'signed out at the hub: Sign in ready, with Back, and no word of Markets’ own address', await text(so, '.ifl-cta'));
await Promise.all([so.waitForURL((u) => u.pathname === '/chats/', { timeout: 20000 }), so.click('#sign-in')]);
const toChats = soNavs.find((u) => new URL(u).pathname === '/chats/') || so.url();
ok(pathOf(toChats) === `/chats/#signin-start&then=${encodeURIComponent('/markets/')}`, 'Sign in goes to the hub’s: Chats’ sign-in, then back to /markets/', toChats);
ok(out2.pages.length === 1 && soNavs.every((u) => new URL(u).host === 'ifl.test:8788'), 'in the same window, at the hub', JSON.stringify(soNavs));
await out2.ctx.close();

// ---- what's left: no page or console error on Markets' pages ----
ok(!mktErrs.length, 'no page or console error on Markets’ pages', JSON.stringify(mktErrs.slice(0, 6)));
console.log('notes (all page errors seen, for other batches):', JSON.stringify(K.errs.slice(0, 8)));
await (await K.hubBrowser()).close();
await K.b.close();
console.log(`FAILS ${K.fails()}`);
process.exit(0);
