// needs: hub
// Chats at the hub (Today First, spec §8.1, §8.4–§8.6, §11.1, §14.3): Chat as InFlite's page /chats/ (ifl.test:8788),
// George's phone there, Mira and Pat on Chat's own address (chat.ifl.test) as it was installed before, one database.
//   - signing in for the whole of InFlite in one trip (/chats/#signin-start&then=/), back on Today, a tap on the
//     welcome's Sign In while the trip gets ready starting no second one;
//   - only people and groups in the list (two friends and a group, and those rows alone); nowhere to ask an app;
//   - the hub's tab bar in place of Chat's own (which Chat at its own address still has); Friends from the people button;
//   - a message to Mira with typing dots on her phone (the typing Worker, through the hub);
//   - the + offering the rows of §8.5, for Mira and for the group; the weather where Mira is, sent, says "Where you are"
//     on her phone alone, and links to nowhere with her place in it, on either phone (George's at the hub, hers off it);
//     a stock you've both sent and the ride planned together, as rows;
//   - A Time to Talk asked, then George's page shut: Mira's Yes on her phone agrees it for both (td_times, both yes); a
//     ride planned with the send sheet, answered Yes with Mira's buttons: fx_offers for both, each with the other's id;
//   - the held row while George's ride holds his messages;
//   - the key step that can't finish: Not Now, back on Today, signed in to it.
import http from 'node:http';
import { execSync } from 'node:child_process';
import { kit } from './lib.mjs';
import { makeAccount, joinChat, onAccountPage } from './join.mjs';
import { chatHash } from '../../pigeon/cards.js';

const [,, S, out] = process.argv;
// (instant chats, as new accounts have them on the site: PIGEONS=0, the database kept)
execSync(`${S}/restartkeep.sh`, { env: { ...process.env, PIGEONS: '0' }, stdio: 'ignore' });
const K = await kit(S, out);
const { ok, one, sql, api, HUB, errs } = K;
const CHAT = 'http://chat.ifl.test:8788', ACCT = 'http://account.ifl.test:8788';
const MIN = 60e3, H = 3600e3;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 15000, step = 400) => { const end = Date.now() + ms; for (;;) { const v = await Promise.resolve().then(f).catch(() => null); if (v || Date.now() > end) return v; await wait(step); } };
const js = (x, n = 240) => String(JSON.stringify(x) ?? x).slice(0, n);
const shot = (ph, name) => ph.p.screenshot({ path: `${out}/${name}.png` }).catch(() => {});
// (Open-Meteo for the server, WXAPP_URL :8794, handed to the weather stand-in :8796: dry 10:00–12:00 every day everywhere)
http.createServer((q, s) => { const r = http.request({ host: '127.0.0.1', port: 8796, path: q.url, method: q.method, headers: q.headers }, (x) => { s.writeHead(x.statusCode, x.headers); x.pipe(s); }); r.on('error', () => { s.writeHead(502); s.end(); }); q.pipe(r); }).listen(8794, '127.0.0.1');
await fetch('http://127.0.0.1:8796/mode', { method: 'POST', body: JSON.stringify({ speed: 0, pattern: 'share-dry-window' }) });

// Chat's session where a page is (IndexedDB inflight at that page's origin), never making the database where there's none
const sessAt = (page) => page.evaluate(() => new Promise((res) => {
  try {
    const r = indexedDB.open('inflight');
    r.onupgradeneeded = () => { r.transaction.abort(); res(null); };
    r.onerror = () => res(null);
    r.onsuccess = () => { try { const g = r.result.transaction('kv').objectStore('kv').get('session'); g.onsuccess = () => res(g.result?.token ? { token: g.result.token, id: g.result.me?.id } : null); g.onerror = () => res(null); } catch (_) { res(null); } };
  } catch (_) { res(null); }
})).catch(() => null);
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
async function chatPhone(name) {
  const ctx = await (await K.hubBrowser()).newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-GB', timezoneId: 'Europe/London', userAgent: ANDROID });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${name}: ${e}`));
  await p.goto(CHAT + '/');
  return { p, ctx, name };
}
const reload = async (ph, sel = '.mlist, .firstrun, .empty') => { await ph.p.reload(); await ph.p.waitForSelector(sel, { timeout: 30000 }).catch(() => {}); await wait(700); };
// (an address as it reaches a server: + and %20 both a space)
const dec = (u) => { try { return decodeURIComponent(String(u).replace(/\+/g, ' ')); } catch (_) { return String(u); } };
// every link in the cards of a phone's open chat whose words match re
const hrefsIn = (ph, re) => ph.p.evaluate((src) => [...document.querySelectorAll('.msgs .cd-card')].filter((c) => new RegExp(src, 'i').test(c.textContent)).map((c) => [...c.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'))), re.source).catch(() => []);

// ---- 0. George's account, made on the account's page; Chats signed in by the one trip, and back on Today ----
const G = await K.hubPhone('george', await K.makeKeys());
await makeAccount(G.p, `${ACCT}/`, { name: 'George Farrow', handle: 'george', email: 'george@example.com' });
const navs = []; G.p.on('framenavigated', (f) => { if (f === G.p.mainFrame()) navs.push(f.url()); });
// (a tap on the welcome's Sign In while the trip gets ready, as someone who's just tapped Sign In on Today might: each
// one drawn is tapped at once, and noted as it was, in this site's own storage, for after)
await G.ctx.addInitScript(() => {
  if (location.host !== 'ifl.test:8788' || location.pathname !== '/chats/' || !/^#signin-start/.test(location.hash)) return;
  const seen = [];
  const tap = () => {
    for (const b of document.querySelectorAll('.welcome .ifl-go')) {
      if (b.__tapped) continue;
      b.__tapped = true; seen.push({ text: b.innerText.trim(), disabled: b.disabled, act: b.dataset.act || null });
      try { localStorage.setItem('t-cta', JSON.stringify(seen)); } catch (_) {}
      b.click();
    }
  };
  new MutationObserver(tap).observe(document, { childList: true, subtree: true });
});
await G.p.goto(`${HUB}/chats/#signin-start&then=/`);
const wentAway = await G.p.waitForURL((u) => /^(account|auth)\./.test(u.hostname), { timeout: 30000 }).then(() => true, () => false);
ok(wentAway, '0. /chats/#signin-start: straight to the sign-in page, nothing to tap first', G.p.url());
await onAccountPage(G.p, { email: 'george@example.com' }).catch((e) => console.log('DEBUG sign-in', e.message));
await G.p.waitForURL((u) => u.host === 'ifl.test:8788' && u.pathname === '/', { timeout: 60000 }).catch(() => {});
const gs = await until(() => sessAt(G.p), 20000);
ok(new URL(G.p.url()).pathname === '/' && !!gs?.token, '0. back on Today (then=/), with Chat’s key kept at the hub’s own address', `${G.p.url()} ${!!gs?.token}`);
ok(navs.some((u) => /\/chats\/#?/.test(new URL(u).pathname + new URL(u).hash) && /ifl\.test:8788/.test(u)) && !navs.some((u) => new URL(u).host === 'chat.ifl.test:8788'), '0. the trip went through /chats/, never Chat’s own address', js(navs.map((u) => u.replace(/#.*/, '#…'))));
const cta = await G.p.evaluate(() => { try { return JSON.parse(localStorage.getItem('t-cta') || 'null'); } catch (_) { return null; } }).catch(() => null);
ok(Array.isArray(cta) && cta.length > 0 && cta.every((b) => b.disabled && !b.act && /Signing in/.test(b.text)), '0. while the trip gets ready, the welcome says “Signing in…” and takes no tap (each one drawn was tapped, and no second trip began)', js(cta));
const GID = gs?.id;
const today = await G.p.evaluate(async () => { const r = await fetch('/api/session', { credentials: 'same-origin' }); return { s: r.status, j: await r.json().catch(() => null) }; });
ok(today.s === 200 && (today.j?.signedIn === true || !!today.j?.name || !!today.j?.user), '0. Today signed in by the same trip (the site’s cookie on the same sign-in)', js(today));

// ---- Mira and Pat: Chat at its own address; friends; a group of the three ----
const [M, P] = await Promise.all(['mira', 'pat'].map(chatPhone));
await Promise.all([[M, 'Mira Okafor', 'mira', 'Norwich'], [P, 'Pat Reed', 'pat', 'London']].map(([ph, name, handle, city]) => joinChat(ph.p, CHAT + '/', { name, handle, email: `${handle}@example.com`, city })));
for (const ph of [M, P]) Object.assign(ph, await sessAt(ph.p));
ok(!!(M.id && P.id), 'Mira and Pat: Chat at its own address');
for (const ph of [M, P]) { await api(gs.token, 'friends', { handle: ph.name }); await api(ph.token, 'friends-respond', { id: GID, accept: true }); }
const [gst, gj] = await api(gs.token, 'groups', { name: 'Weekend', members: [M.id, P.id] });
const GRP = gj?.group?.id;
ok(gst === 200 && !!GRP, 'a group of the three: Weekend', `${gst} ${js(gj)}`);
// (each friend says hello, so each one-to-one chat has a row)
for (const ph of [M, P]) {
  await reload(ph, '.tabs'); await K.openChat(ph, GID);
  await ph.p.fill('#msg', `Hello from ${ph.name}`); await ph.p.click('.send'); await wait(900);
}

// ---- 1. /chats/: those rows alone; the hub's tab bar, not Chat's; Friends from the people button ----
// (a push subscription on this phone already, as Chat at its own address leaves one, notifications allowed: at the hub
// Chat neither asks for its key nor posts the subscription as its own)
await G.p.evaluate(() => localStorage.setItem('fakesub', btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(65))))));
const pushAsks = [], onPush = (r) => { if (/\/api\/pigeon\/push-(sub|key)\b/.test(r.url())) pushAsks.push(`${r.method()} ${r.url()}`); };
G.ctx.on('request', onPush);
await G.p.goto(`${HUB}/chats/`);
// (Chat's first open here asks where you are, as a new sign-in does: London)
if (await G.p.waitForSelector('#city', { state: 'attached', timeout: 15000 }).catch(() => null)) {
  await G.p.selectOption('#city', 'London').catch(() => {});
  await G.p.click('[data-act=onbdone]', { timeout: 15000 }).catch(() => {});
}
await G.p.waitForSelector('.mlist .mrow', { timeout: 30000 }).catch(() => {});
await until(async () => (await G.p.locator('.mlist .mrow').count()) >= 3, 15000);
const rowIds = await G.p.$$eval('.mlist .mrow', (rs) => rs.map((r) => r.dataset.id));
ok(rowIds.length === 3 && [M.id, P.id, GRP].every((id) => rowIds.includes(id)), '1. Chats: Mira, Pat and the group, and no other row', js(rowIds));
ok(await G.p.$$eval('.mlist .mrow', (rs) => rs.every((r) => /^[0-9a-f-]{36}$/.test(r.dataset.id || ''))), '1. every row is a friend’s or a group’s');
const asks = await G.p.evaluate(() => [...document.querySelectorAll('input, textarea')].filter((x) => /^Ask\b/i.test(x.placeholder || '') || /^Ask\b/i.test(x.getAttribute('aria-label') || '')).length + (/(^|\s)Ask (Weather|Fitness|Markets|Today)\b/.test(document.body.innerText) ? 1 : 0));
ok(asks === 0, '1. nowhere to ask an app anything');
const bars = await G.p.evaluate(() => ({ chatTabs: !!document.querySelector('.tabbar .tabs') && !document.querySelector('.tabbar').hidden, hub: [...document.querySelectorAll('nav.hubtabs.ifl-tabs a.ifl-tab')].map((a) => [a.dataset.tab, a.getAttribute('href'), a.getAttribute('aria-current')]) }));
ok(!bars.chatTabs && bars.hub.length === 4 && bars.hub.map((x) => x[0]).join() === 'today,chats,apps,you' && bars.hub.find((x) => x[0] === 'chats')?.[2] === 'page', '1. the hub’s tab bar (Today · Chats · Apps · You, Chats chosen), not Chat’s own', js(bars));
await shot(G, '1-chats');
await M.p.goto(CHAT + '/'); await M.p.waitForSelector('.tabs', { timeout: 30000 }).catch(() => {});
const own = await M.p.evaluate(() => ({ tabs: !!document.querySelector('.tabbar .tabs') && !document.querySelector('.tabbar').hidden, hub: !!document.querySelector('nav.hubtabs') }));
ok(own.tabs && !own.hub, '1. Chat at its own address keeps its own tab bar', js(own));
await G.p.click('.hubpeople');
await G.p.waitForSelector('.navbar .nb-title:text-is("Friends"), .ifh-title:text-is("Friends")', { timeout: 8000 }).catch(() => {});
const fr = await G.p.evaluate(() => ({ title: document.querySelector('.view .navbar .nb-title, .view .ifh-title')?.innerText, back: !!document.querySelector('.view [data-act=to][data-id=messages]') }));
ok(/Friends/.test(fr.title || '') && fr.back, '1. the people button opens Friends, with a way back to Chats', js(fr));
await G.p.click('.view [data-act=to][data-id=messages]'); await wait(500);
// (and Chat's settings, from You: no tab bar, Back to You)
await G.p.goto(`${HUB}/chats/#account`); await G.p.waitForSelector('[data-act=hubyou]', { timeout: 15000 }).catch(() => {});
const acct = await G.p.evaluate(() => ({ back: !!document.querySelector('[data-act=hubyou]'), bar: !document.querySelector('nav.hubtabs')?.hidden }));
ok(acct.back && !acct.bar, '1. /chats/#account: Chat’s settings without a tab bar, and Back to You', js(acct));
const youGo = G.p.waitForURL((u) => u.pathname === '/' && u.hash === '#you', { timeout: 15000 }).then(() => true, () => false);
await G.p.click('[data-act=hubyou]');
ok(await youGo, '1. Back to You goes to /#you', G.p.url());
// (the Notifications row in InFlite's menu: set in You)
await G.p.goto(`${HUB}/chats/`); await G.p.waitForSelector('.mlist .mrow', { timeout: 30000 }).catch(() => {});
await G.p.click('.chead .ifh-me').catch(() => {});
const nrow = await G.p.locator('.ifm-pop [data-k=notify]').innerText().catch(() => '');
ok(/Set in You/.test(nrow), '1. Notifications: “Set in You” (the hub’s, from You)', nrow);
await G.p.keyboard.press('Escape'); await wait(400);
const subs = Number(one(`SELECT COUNT(*) AS n FROM pg_push WHERE user_id = '${GID}'`)[0]?.n || 0);
ok(subs === 0 && !pushAsks.length, '1. Chat asked for no push subscription of its own at the hub, with one on the phone (no push-key, no push-sub, no pg_push row)', js({ subs, pushAsks }));
G.ctx.off('request', onPush);
await G.p.evaluate(() => localStorage.removeItem('fakesub')).catch(() => {});

// ---- 2. a message to Mira, with typing dots on her phone ----
await reload(M, '.tabs'); await K.openChat(M, GID);
await K.openChat(G, M.id);
await G.p.type('#msg', 'On my way', { delay: 60 });
const dots = await M.p.waitForSelector('.msgs .typing', { timeout: 8000 }).then(() => true, () => false);
ok(dots, '2. Mira sees George typing (the typing Worker, through the hub)');
await G.p.click('.send');
const got = await until(() => M.p.evaluate(() => /On my way/.test(document.querySelector('.msgs')?.innerText || '')), 15000);
ok(!!got, '2. and his message arrives on her phone');
await shot(M, '2-mira');

// ---- 3. the +: the cards that fit this chat ----
const plusRows = async () => {
  await G.p.click('.compose .plus');
  await G.p.waitForSelector('.sheet .fromapps', { timeout: 8000 });
  await until(async () => !(await G.p.locator('.sheet .fromapps .csub', { hasText: '…' }).count()), 15000);
  await wait(300);
  return G.p.$$eval('.sheet .fromapps [data-act=fromapp]', (bs) => bs.map((b) => b.dataset.id));
};
const forMira = await plusRows();
await shot(G, '3-plus-mira');
ok(['photo', 'there', 'weather', 'timetalk'].every((k) => forMira.includes(k)), '3. for Mira: Photo, Where Mira is, Weather here, A Time to Talk', js(forMira));
const thereLine = await G.p.locator('.sheet [data-act=fromapp][data-id=there]').innerText().catch(() => '');
ok(/Where Mira is/.test(thereLine) && /Norwich/.test(thereLine), '3. “Where Mira is”, with her place and its weather', thereLine.replace(/\s+/g, ' '));
// (the weather where Mira is: in her chat's box, sent; on her phone, "Where you are". Her place, a Chat place, is in no
// link of the card on either phone (none to Weather at all), nor in any address either phone asks for from here)
const urls3 = [], onUrl3 = (r) => urls3.push(r.url());
G.ctx.on('request', onUrl3); M.ctx.on('request', onUrl3);
await G.p.click('.sheet [data-act=fromapp][data-id=there]');
await G.p.waitForSelector('.compose .cardatt:not([hidden])', { timeout: 8000 }).catch(() => {});
await G.p.fill('#msg', 'Looks wet up there'); await G.p.click('.send'); await wait(1200);
const gThere = await until(async () => { const h = await hrefsIn(G, /Where Mira is/); return h.length ? h : null; }, 10000) || [];
ok(gThere.length > 0 && gThere.flat().every((h) => !/Norwich/i.test(dec(h)) && !/weather/i.test(h)), '3. George’s copy, at the hub: no link with Mira’s place, none to Weather', js(gThere));
await reload(M, '.tabs'); await K.openChat(M, GID);
const where = await until(() => M.p.evaluate(() => [...document.querySelectorAll('.msgs .cd-card')].map((c) => c.textContent.replace(/\s+/g, ' ')).find((t) => /Where you are/i.test(t)) || null), 15000);
ok(!!where, '3. on Mira’s phone the card says “Where you are”', where || await M.p.locator('.msgs').innerText().catch(() => ''));
const mThere = await hrefsIn(M, /Where you are/);
ok(mThere.length > 0 && mThere.flat().every((h) => !/Norwich/i.test(dec(h)) && !/weather/i.test(h)), '3. Mira’s, off the hub (Chat’s own address): no link with her place, none to Weather', js(mThere));
G.ctx.off('request', onUrl3); M.ctx.off('request', onUrl3);
const placeAsked = urls3.filter((u) => /Norwich/i.test(dec(u)) || [...(() => { try { return new URL(u).searchParams.values(); } catch (_) { return []; } })()].some((v) => /Norwich/i.test(v)));
ok(urls3.length > 5 && !placeAsked.length, `3. and none of the ${urls3.length} addresses either phone asked for holds her place`, js(placeAsked));
await K.openChat(G, GRP);
const forGroup = await plusRows();
ok(forGroup.includes('photo') && forGroup.includes('weather') && !forGroup.includes('there') && !forGroup.includes('timetalk'), '3. for the group: Photo and Weather here; never where a friend is, nor A Time to Talk', js(forGroup));
await G.p.click('.sheet header [data-act=close]'); await wait(400);

// ---- 4. A Time to Talk: asked, George's page shut, Mira's Yes on her phone agrees it for both ----
await K.openChat(G, M.id);
await G.p.click('.compose .plus'); await G.p.waitForSelector('.sheet [data-act=fromapp][data-id=timetalk]', { timeout: 8000 });
await G.p.click('.sheet [data-act=fromapp][data-id=timetalk]');
await G.p.waitForSelector('.sheet [data-act=ttsend]', { timeout: 8000 });
await G.p.click('.sheet [data-act=ttmins][data-id="30"]').catch(() => {});
const optOn = await G.p.locator('.sheet [data-act=ttopt]').first().click().then(() => true, () => false);
await G.p.click('.sheet [data-act=ttsend]');
await G.p.waitForSelector('.sheet', { state: 'detached', timeout: 15000 }).catch(() => {});
const mine = await until(() => one(`SELECT id, state, kind, start, stop, with_id, opts FROM td_times WHERE user_id = '${GID}' ORDER BY made DESC LIMIT 1`)[0], 10000);
ok(mine?.state === 'pending' && mine.with_id === M.id && mine.kind === 'call' && Number(mine.stop) - Number(mine.start) === 30 * MIN, '4. as it goes, George’s own record: a call with Mira, pending', js(mine));
ok(!optOn || (mine?.opts && JSON.parse(mine.opts).length === 1), '4. with the other time it offered', js(mine?.opts));
const inviteRow = one(`SELECT id FROM pg_msgs WHERE sender = '${GID}' AND recipient = '${M.id}' ORDER BY rowid DESC LIMIT 1`)[0];
ok(inviteRow?.id === mine?.id, '4. keyed by the invite letter’s own id', js([inviteRow, mine?.id]));
const raw = one(`SELECT ct FROM pg_msgs WHERE id = '${inviteRow?.id}'`)[0]?.ct || '';
ok(raw && !/Call at|"when"/.test(raw), '4. the invite itself sealed: no time or words in the clear');
// (George's page shut: nothing more from his phone)
await G.p.goto('about:blank');
let fromG = 0; const countG = (r) => { if (/\/api\//.test(r.url())) fromG++; }; G.ctx.on('request', countG);
await reload(M, '.tabs'); await K.openChat(M, GID);
await M.p.waitForSelector('.msgs [data-act=whenans][data-a=yes]:not([data-t])', { timeout: 15000 }).catch(() => {});
const inviteSaid = await M.p.locator('.msgs .cd-when').last().innerText().catch(() => '');
ok(/Call at \d\d:\d\d\?|Call (today|tomorrow)/.test(inviteSaid.replace(/\s+/g, ' ')), '4. Mira: “Call at …?” with Yes · Another Time · No', inviteSaid.replace(/\s+/g, ' '));
await shot(M, '4-when-invite');
await M.p.locator('.msgs [data-act=whenans][data-a=yes]:not([data-t])').last().click();
const both = await until(() => { const r = one(`SELECT user_id, state, with_id, role FROM td_times WHERE id = '${mine?.id}' ORDER BY user_id`); return r.length === 2 && r.every((x) => x.state === 'yes') ? r : null; }, 15000);
ok(!!both && both.find((x) => x.user_id === GID)?.with_id === M.id && both.find((x) => x.user_id === M.id)?.with_id === GID, '4. Mira’s Yes, from her phone alone: td_times yes for both, each with the other', js(both || one(`SELECT user_id, state, with_id FROM td_times WHERE id = '${mine?.id}'`)));
ok(fromG === 0, '4. with George’s page shut (no request from it)', String(fromG));
G.ctx.off('request', countG);
const ans = await M.p.locator('.msgs').innerText().catch(() => '');
ok(/In Today for you both|Yes, \d\d:\d\d works|Yes, .* works/.test(ans), '4. her answer drawn: “Yes, … works”', ans.slice(-200).replace(/\s+/g, ' '));

// ---- 5. a ride planned with the send sheet, answered Yes with Mira's buttons: with_id on both sides ----
// (fx_offers is made by the server as the invite's own record is written: never here, so its columns are its own)
const day = new Date().toISOString().slice(0, 10);
const fcard = { v: 1, kind: 'fitness', from: 'fitness', at: Date.now() - 60e3, say: 'Today: Endurance 75.', snap: { day, tz: 'Europe/London', sport: 'ride', name: 'Endurance 75', kind: 'Endurance', wid: 'endurance-75', secs: 4500, tss: 62, best: null, done: null } };
// (the card link opened as an app opens it: Chats' address with the card in its #)
await G.p.goto(`${HUB}/chats/${chatHash(fcard.say, fcard)}`);
await G.p.waitForSelector(`.sheet [data-act=sendpick][data-id="${M.id}"]`, { timeout: 30000 });
await G.p.click(`.sheet [data-act=sendpick][data-id="${M.id}"]`);
await G.p.click('.sheet [data-act=sendplan]');
await G.p.waitForSelector('.sheet .planbox', { timeout: 20000 }).catch(() => {});
await G.p.click('.sheet [data-act=sendgo]');
await G.p.waitForSelector('.sheet', { state: 'detached', timeout: 20000 }).catch(() => {});
const planId = one(`SELECT id FROM pg_msgs WHERE sender = '${GID}' AND recipient = '${M.id}' ORDER BY rowid DESC LIMIT 1`)[0]?.id;
const asked = await until(() => one(`SELECT state, with_id, role FROM fx_offers WHERE user_id = '${GID}' AND id = '${planId}'`)[0], 10000);
ok(asked?.state === 'pending' && asked.with_id === M.id && asked.role === 'asked', '5. the invite, as it goes: George’s own offer, pending, with Mira', js(asked));
await G.p.goto('about:blank');
await reload(M, '.tabs'); await K.openChat(M, GID);
await M.p.waitForSelector('.msgs [data-act=planans][data-a=yes]', { timeout: 15000 }).catch(() => {});
await M.p.locator('.msgs [data-act=planans][data-a=yes]').last().click();
const rides = await until(() => { const g = one(`SELECT state, with_id FROM fx_offers WHERE user_id = '${GID}' AND id = '${planId}'`)[0], m = one(`SELECT state, with_id, role FROM fx_offers WHERE user_id = '${M.id}' ORDER BY made DESC LIMIT 1`)[0]; return g?.state === 'new' && m ? { g, m } : null; }, 15000);
ok(!!rides && rides.g.with_id === M.id && rides.m.with_id === GID && rides.m.role === 'answered', '5. Mira’s Yes (her button): her offer with George’s id, George’s agreed with hers, his page shut', js(rides || one(`SELECT user_id, state, with_id, role FROM fx_offers`)));

// ---- 5b. the + for Mira again: Tesco, which you've both sent (and George holds), and the ride you've planned together ----
const scard = { v: 1, kind: 'markets', from: 'markets', at: Date.now() - 60e3, say: 'Tesco is up 1.40% today.', snap: { name: 'Tesco', sym: 'TSCO.L', pct: 1.4, day }, ref: { sym: 'TSCO.L' } };
await G.p.goto(`${HUB}/`);
const heldTsco = await G.p.evaluate(() => fetch('/api/markets/holding', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: 'TSCO.L', qty: 100 }) }).then((r) => r.status)).catch(() => 0);
// (Tesco sent each way: George's from a card link at the hub, Mira's from one at Chat's own address)
for (const [ph, base, to] of [[G, `${HUB}/chats/`, M.id], [M, `${CHAT}/`, GID]]) {
  await ph.p.goto(base + chatHash(scard.say, scard));
  await ph.p.waitForSelector(`.sheet [data-act=sendpick][data-id="${to}"]`, { timeout: 30000 }).catch(() => {});
  await ph.p.click(`.sheet [data-act=sendpick][data-id="${to}"]`).catch(() => {});
  await ph.p.click('.sheet [data-act=sendgo]').catch(() => {});
  await ph.p.waitForSelector('.sheet', { state: 'detached', timeout: 20000 }).catch(() => {});
}
await G.p.goto(`${HUB}/chats/`); await G.p.waitForSelector('.mlist .mrow', { timeout: 30000 }).catch(() => {});
await K.openChat(G, M.id);
await until(async () => (await G.p.locator('.msgs .cd-card', { hasText: 'Tesco' }).count()) >= 2, 15000);
const rows5 = await plusRows().catch(() => []);
const rowText = (k) => G.p.locator(`.sheet [data-act=fromapp][data-id="${k}"]`).innerText().then((t) => t.replace(/\s+/g, ' '), () => '');
const stockRow = await rowText('markets:TSCO.L'), rideRow = await rowText('ride');
await shot(G, '5b-plus-mira');
ok(heldTsco === 200 && rows5.includes('markets:TSCO.L') && /Tesco/.test(stockRow) && /you’ve both sent it/.test(stockRow), '5b. the +: Tesco, “you’ve both sent it”', js({ heldTsco, rows5, stockRow }));
ok(rows5.includes('ride') && /(Today|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)’s ride together/.test(rideRow) && /\d\d:\d\d–\d\d:\d\d/.test(rideRow), '5b. and the ride planned with her: “Thursday’s ride together · 10:00–12:00”', rideRow);
await G.p.click('.sheet header [data-act=close]').catch(() => {}); await wait(400);

// ---- 6. the held row: George's ride holding his messages ----
sql(`CREATE TABLE IF NOT EXISTS fx_times (user_id TEXT NOT NULL, day TEXT NOT NULL, start INTEGER NOT NULL, stop INTEGER NOT NULL, tz TEXT NOT NULL, sport TEXT NOT NULL DEFAULT 'ride', source TEXT NOT NULL, made INTEGER NOT NULL, PRIMARY KEY (user_id, day))`);
const t0 = Date.now();
sql(`INSERT OR REPLACE INTO fx_times (user_id, day, start, stop, tz, sport, source, made) VALUES ('${GID}', '${day}', ${t0 - 5 * MIN}, ${t0 + 70 * MIN}, 'Europe/London', 'ride', 'set', ${t0})`);
await G.p.goto(`${HUB}/chats/`);
const held = await until(() => G.p.evaluate(() => document.querySelector('.heldrow')?.innerText || null), 20000);
ok(/Riding · messages held/.test(held || ''), '6. the held row: “Riding · messages held”', held);
await shot(G, '6-held');
sql(`DELETE FROM fx_times WHERE user_id = '${GID}'`);

// ---- 7. the key step that can't finish: Not Now, back on Today, signed in to it ----
const G2 = await K.hubPhone('george2', null);
await makeAccount(G2.p, `${ACCT}/`, { name: 'Gail Brook', handle: 'gail', email: 'gail@example.com' });
// (what unlocks the key here spoilt before it's used, as a box that won't open: the sign-in itself is fine)
await G2.ctx.addInitScript(() => {
  if (location.host !== 'ifl.test:8788' || !/^#signin=/.test(location.hash)) return;
  try { const k = JSON.parse(localStorage.getItem('inflight-signin')); if (k?.priv?.d) { k.priv = { ...k.priv, d: k.priv.d.split('').reverse().join('') }; localStorage.setItem('inflight-signin', JSON.stringify(k)); } } catch (_) {}
});
await G2.p.goto(`${HUB}/chats/#signin-start&then=/`);
await onAccountPage(G2.p, { email: 'gail@example.com' }).catch((e) => console.log('DEBUG sign-in 2', e.message));
const notNow = await G2.p.waitForSelector('[data-act=signinnotnow]', { timeout: 30000 }).then(() => true, () => false);
ok(notNow, '7. the key couldn’t be unlocked here: Not Now offered', await G2.p.locator('.welcome').innerText().catch(() => G2.p.url()));
await shot(G2, '7-not-now');
await G2.p.click('[data-act=signinnotnow]').catch(() => {});
await G2.p.waitForURL((u) => u.host === 'ifl.test:8788' && u.pathname === '/', { timeout: 20000 }).catch(() => {});
const t2 = await G2.p.evaluate(async () => { const r = await fetch('/api/session', { credentials: 'same-origin' }); return { s: r.status, j: await r.json().catch(() => null) }; });
ok(new URL(G2.p.url()).pathname === '/' && t2.s === 200 && (t2.j?.signedIn === true || !!t2.j?.name || !!t2.j?.user), '7. Not Now: back on Today, signed in to it by the site’s cookie', `${G2.p.url()} ${js(t2)}`);
ok(!(await sessAt(G2.p)), '7. and Chats asks for the key another time (none kept here)');

// ---- one window, and no page errors from Chat's pages ----
ok(G.pages.length === 1 && G2.pages.length === 1, 'one window throughout', `${G.pages.length} ${G2.pages.length}`);
ok(!(await G2.p.evaluate(() => window.__opened?.length || 0)), 'nothing asked for a new window');
const chatErrs = errs.filter((e) => /^(george|george2|mira|pat):/.test(e) && !/Failed to load|net::|404|429|navigator\.vibrate|ERR_ABORTED/.test(e));
ok(!chatErrs.length, 'no page errors from Chat’s pages', chatErrs.slice(0, 6).join(' | '));
console.log(`FAILS ${K.fails()}`);
await (await K.hubBrowser()).close();
await K.b.close();
process.exit(0);
