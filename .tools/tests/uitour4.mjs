// Every screen and sheet of InFlight, with real (encrypted) data: screenshots,
// overlap/clipping audit and axe, in light and dark, at 390 and 320 wide.
import { madeIn } from './handback.mjs';
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { joinInFlight } from './join.mjs';
const [,, S, out, only] = process.argv;
const BASE = 'http://localhost:8788';
const sql0 = (q) => execSync(`${S}/wr/node_modules/.bin/wrangler d1 execute bio-db --local --persist-to ${S}/wrstate --command "${q}"`, { cwd: process.env.APP_ROOT, stdio: 'pipe' }).toString();
const sql = (q) => { for (let i = 0; ; i++) { try { return sql0(q); } catch (e) { if (i > 5) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400); } } };
const AXE = readFileSync(`${S}/wr/node_modules/axe-core/axe.min.js`, 'utf8');
const src = readFileSync(`${S}/wr/audit.mjs`, 'utf8'); const AUDIT = eval(src.slice(src.indexOf('const AUDIT = ') + 14, src.indexOf('\nconst b = await')).replace(/;\s*$/, ''));
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const errs = [], report = [];
const IPH = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
async function phone(name, handle, city, pk) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36', hasTouch: true, userAgent: IPH });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${name}: ${e}`)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|Content Security/.test(m.text())) errs.push(`${name}: ${m.text()}`); });
  if (pk) { const cdp = await ctx.newCDPSession(p); await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true } }); }
  await joinInFlight(p, BASE + '/pigeon/', { name, handle, email: handle + '@example.com', city, passkey: !!pk });
  return p;
}
const sess = (p) => p.evaluate(() => new Promise((res) => { const r = indexedDB.open('inflight'); r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('session'); g.onsuccess = () => res(g.result); }; }));
const api = (t, path, body, method) => fetch(BASE + '/api/pigeon/' + path, { method: method || (body ? 'POST' : 'GET'), headers: { ...(t ? { Authorization: 'Bearer ' + t } : {}), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => [r.status, await r.json().catch(() => ({}))]);
const rnd = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
// (a real key: the app seals to it, so a made-up point won't do)
const realPub = async () => { const k = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']); const j = await crypto.subtle.exportKey('jwk', k.publicKey); return { kty: j.kty, crv: j.crv, x: j.x, y: j.y }; };
// (made where accounts are made, the account's page: account.localhost beside InFlight run locally; and signed in to
// InFlight from there, as a phone is: handback.mjs)
const apiUser = async (h, name) => { const proof = rnd(), email = h + '@example.com';
  return (await madeIn({ name, handle: h, email, salt: rnd().slice(0, 22), proof, vault: 'v'.repeat(40), pub: await realPub() })).j; };
const act = (p, a, id) => p.evaluate(([a, id]) => { const x = document.createElement('button'); x.hidden = true; x.dataset.act = a; if (id) x.dataset.id = id; document.querySelector('#screen').append(x); x.click(); x.remove(); }, [a, id]);
const openChat = async (p, id) => { await p.evaluate((id) => { location.hash = '#open=' + id; }, id); await p.waitForSelector('#msg', { timeout: 10000 }); await p.waitForTimeout(500); };
const send = async (p, text, kind) => { if (kind) await p.click(`.pick [data-act=pigeon][data-id=${kind}]`).catch(() => {}); await p.fill('#msg', text); const t0 = Date.now(); await p.waitForSelector('.compose .send:enabled', { timeout: 30000 }).catch(() => console.log('DIAG send still disabled', text)); if (Date.now() - t0 > 300) console.log('DIAG waited', Date.now() - t0, 'ms to send', text); await p.click('.send'); await p.waitForTimeout(1500); };
const refresh = async (p) => { await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await p.waitForTimeout(1200); };

// ---- the cast and their pigeons ----
const G = await phone('George Farrow-Green', 'george', 'London', true);
const P = await phone('Pierre Martin', 'pierre', 'Paris'), N = await phone('Nia Brooks', 'nia', 'New York');
const [gs, ps, ns] = [await sess(G), await sess(P), await sess(N)];
for (const [h, x] of [['pierre', ps], ['nia', ns]]) { await api(gs.token, 'friends', { handle: h }); await api(x.token, 'friends-respond', { id: gs.me.id, accept: true }); }
const T = await apiUser('theo', 'Theo Lark'); await api(T.token, 'me', { lat: 55.95, lon: -3.19, place: 'Edinburgh' }, 'PATCH'); await api(T.token, 'friends', { handle: 'george' });
const Z = await apiUser('zara', 'Zara Quinn'); await api(gs.token, 'friends', { handle: 'zara' });
const X = await apiUser('spammer', 'Spam Bot'); await api(gs.token, 'block', { id: X.me.id });
await refresh(G); await refresh(P); await refresh(N);
await openChat(G, ps.me.id); await send(G, 'Shall we meet at the café on Friday? I’ll bring the book.');
sql("UPDATE pg_msgs SET deliver_at = (strftime('%s','now') * 1000) - 600000, sent_at = (strftime('%s','now') * 1000) - 9000000");
await refresh(P); await openChat(P, gs.me.id); await send(P, 'Yes! 7pm by the river? I’ve nearly finished it.');
sql(`UPDATE pg_msgs SET deliver_at = (strftime('%s','now') * 1000) - 120000, sent_at = (strftime('%s','now') * 1000) - 4000000 WHERE sender = '${ps.me.id}'`);
await refresh(G); await openChat(G, ps.me.id); await send(G, 'Perfect. See you there 🕊');
await refresh(N); await openChat(N, gs.me.id); await send(N, 'Landed in New York! The flight took forever.'); await send(N, 'Also: the bagels here are unreal.', 'swift');
const [, cg] = await api(gs.token, 'groups', { name: 'Book Club', members: [ps.me.id, ns.me.id] }); const gid = cg.group.id;
await refresh(P); await openChat(P, gid); await send(P, 'Finished chapter 3. No spoilers, but wow.');
sql(`UPDATE pg_gdeliv SET deliver_at = (strftime('%s','now') * 1000) - 60000`);
await refresh(G); await openChat(G, gid); await send(G, 'Same! Chapter 4 by Sunday?');
sql("UPDATE pg_users SET email_ok = 1");
// named pigeons, feathers and kit, a streak, news
await api(gs.token, 'birds', { name: 'Biscuit' }); await api(gs.token, 'birds', { name: 'Captain Featherbottom' });
await api(ps.token, 'birds', { name: 'Pip' }); await api(ps.token, 'birds', { name: 'Ziggy' });
sql(`INSERT INTO pg_feathers (user_id, ref, n, at, why) VALUES ('${gs.me.id}', 'gift', 400, ${Date.now()}, 'test'), ('${ps.me.id}', 'gift', 400, ${Date.now()}, 'test')`);
for (const t of [gs.token, ps.token]) { await api(t, 'feathers-buy', { item: 'scarf' }); await api(t, 'feathers-buy', { item: 'tophat' }); }
const gb = (await api(gs.token, 'birds'))[1].birds, pb = (await api(ps.token, 'birds'))[1].birds;
await api(gs.token, 'bird-wear', { bird: gb[0].id, item: 'scarf' }); await api(ps.token, 'bird-wear', { bird: pb[0].id, item: 'tophat' });
{ const [a2, b2] = [gs.me.id, ps.me.id].sort(), d = Math.floor(Date.now() / 86400000); sql(`INSERT OR REPLACE INTO pg_streaks (a, b, start, last, best) VALUES ('${a2}', '${b2}', ${d - 8}, ${d}, 9)`); }
await api(ns.token, 'birds', { name: 'Liberty' });

await refresh(G); await openChat(G, ns.me.id); await send(G, 'On its way by sea, apparently.');
// off the Earth: Luna on the Moon, Marco on Mars; a lunar and a laser pigeon on their way, an orbital one landed
const L = await apiUser('luna', 'Luna Vega'); await api(L.token, 'me', { moon: { lat: -43.3, lon: -11.4 } }, 'PATCH'); await api(gs.token, 'friends', { handle: 'luna' }); await api(L.token, 'friends-respond', { id: gs.me.id, accept: true });
const Mk = await apiUser('marco', 'Marco Reyes'); await api(Mk.token, 'me', { moon: { lat: 18.4, lon: 77.6, body: 'mars' } }, 'PATCH'); await api(gs.token, 'friends', { handle: 'marco' }); await api(Mk.token, 'friends-respond', { id: gs.me.id, accept: true });
await refresh(G); await openChat(G, L.me.id); const lg = (m) => console.log('DIAG net', m); G.on('request', (r) => r.url().includes('/api/') && lg(r.method() + ' ' + r.url().split('/api/pigeon/')[1])); G.on('response', (r) => r.url().includes('/api/') && r.status() >= 400 && lg('status ' + r.status() + ' ' + r.url())); G.on('console', (m) => lg('console ' + m.type() + ' ' + m.text())); G.on('pageerror', (e) => lg('pageerror ' + e.message)); await send(G, 'How is the view of Earth?'); await G.waitForTimeout(2000); G.removeAllListeners('request'); G.removeAllListeners('console'); G.removeAllListeners('response');
console.log('DIAG luna', JSON.stringify(await G.evaluate(() => ({ note: document.querySelector('.compose .note')?.textContent, toast: document.querySelector('.toast')?.textContent, ta: document.querySelector('#msg')?.value, kind: document.querySelector('.compose .kind')?.textContent }))), sql(`SELECT COUNT(*) AS n FROM pg_msgs WHERE recipient = '${L.me.id}'`).replace(/\s+/g, ' ').slice(-120));
sql(`UPDATE pg_msgs SET sent_at = sent_at - 100000000, deliver_at = deliver_at - 100000000 WHERE recipient = '${L.me.id}'`);
await openChat(G, Mk.me.id); await send(G, 'Hello Mars!');
await openChat(G, ps.me.id); await G.fill('#msg', 'By orbit'); await act(G, 'pigeon', 'orbital'); await G.click('.send'); await G.waitForTimeout(1500);
await act(G, 'tab', 'messages'); await refresh(G);

// ---- capture ----
let size = '390', theme = 'light';
async function snap(p, name) {
  await p.waitForTimeout(650);
  const tag = `${size}-${theme}-${name}`;
  await p.screenshot({ path: `${out}/${tag}.png` });
  const lay = await p.evaluate(AUDIT);
  const ax = await p.evaluate(async (src) => { if (!window.axe) (0, eval)(src);
    const r = await axe.run(document, { resultTypes: ['violations'], rules: { region: { enabled: false } } });
    return r.violations.map((v) => `${v.id}(${v.nodes.length}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' ; ')}`); }, AXE);
  lay.issues = lay.issues.filter((i) => !/<rail>|<sr>|^OFFSCREEN "(1d|2d|\d+h)/.test(i));
  report.push({ tag, layout: lay.issues, ellipsis: lay.trunc, axe: ax });
  console.log(`${tag}: ${lay.issues.length || ax.length ? [...lay.issues, ...ax].join(' | ') : 'ok'}`);
}
const home = async (p) => { await act(p, 'closepop'); await act(p, 'close'); await p.waitForTimeout(250); await act(p, 'tab', 'messages'); await p.waitForTimeout(300); };
const screens = [
  ['messages', async () => {}],
  ['chat', async () => { await openChat(G, ps.me.id); }],
  ['chat-swift', async () => { await openChat(G, ps.me.id); await G.fill('#msg', 'One more thing'); await G.click('.pick [data-act=pigeon][data-id=swift]').catch(() => {}); await G.waitForTimeout(500); await snap(G, 'chat-swift'); await G.fill('#msg', ''); throw 'done'; }],
  ['msgmenu', async () => { await openChat(G, ps.me.id); await G.locator('.msgs .b:not(.me)').last().click(); await G.waitForSelector('.menu-pop', { timeout: 4000 }); }],
  ['reply', async () => { await openChat(G, ps.me.id); await G.locator('.msgs .b:not(.me)').last().click(); await G.click('.menu-pop [data-act=reply]'); }],
  ['schedule', async () => { await openChat(G, ps.me.id); await act(G, 'schedule'); await G.waitForSelector('.sheet'); }],
  ['stopover', async () => { await openChat(G, ps.me.id); await act(G, 'via'); await G.waitForSelector('.sheet'); }],
  ['gifs', async () => { await openChat(G, ps.me.id); await act(G, 'gifs'); await G.waitForSelector('.sheet'); }],
  ['search', async () => { await G.fill('#msearch', 'river'); await G.waitForTimeout(800); }],
  ['drafts', async () => { await openChat(G, ps.me.id); await G.fill('#msg', 'A draft for Pierre'); await openChat(G, ns.me.id); const v1 = await G.inputValue('#msg'); await openChat(G, ps.me.id); const v2 = await G.inputValue('#msg'); report.push({ tag: 'draftcheck', layout: v1 === '' && v2 === 'A draft for Pierre' ? [] : [`DRAFT BUG nia="${v1}" pierre="${v2}"`], ellipsis: [], axe: [] }); await G.fill('#msg', ''); }],
  ['chatmenu', async () => { await openChat(G, ps.me.id); await G.click('[data-act=chatmenu]'); await G.waitForSelector('.menu-pop'); }],
  ['map', async () => { await openChat(G, ps.me.id); await G.click('[data-act=map]'); await G.waitForSelector('.sheet .map', { timeout: 8000 }); await G.waitForTimeout(1500); }],
  ['flysheet', async () => { await openChat(G, ps.me.id); await act(G, 'flysheet'); await G.waitForSelector('.sheet .flyhero'); await G.waitForTimeout(1500); }],
  ['flysheet-bottom', async () => { await openChat(G, ps.me.id); await act(G, 'flysheet'); await G.waitForSelector('.sheet .flyhero'); await G.waitForTimeout(1500); await G.evaluate(() => { const x = document.querySelector('.sheet .body'); x.scrollTo(0, x.scrollHeight); }); }],
  ['map-ship', async () => { await openChat(G, ns.me.id); await G.click('[data-act=map]'); await G.waitForSelector('.sheet .map', { timeout: 8000 }); await G.waitForTimeout(2000); }],
  ['map-ship-open', async () => { await G.evaluate(() => localStorage.setItem('inflight-mapcard', 'open')); await openChat(G, ns.me.id); await G.click('[data-act=map]'); await G.waitForSelector('.sheet .map', { timeout: 8000 }); await G.waitForTimeout(2000); await G.evaluate(() => localStorage.setItem('inflight-mapcard', 'fold')); }],
  ['maplayers', async () => { await openChat(G, ps.me.id); await G.click('[data-act=map]'); await G.waitForSelector('.sheet .map', { timeout: 8000 }); await act(G, 'maplayers'); await G.waitForTimeout(800); }],
  ['friendinfo', async () => { await openChat(G, ps.me.id); await act(G, 'friendinfo', ps.me.id); await G.waitForSelector('.sheet'); }],
  ['safety', async () => { await act(G, 'safety', ps.me.id); await G.waitForSelector('.sheet .digits'); }],
  ['chat-inbound', async () => { await openChat(G, ns.me.id); }],
  ['group', async () => { await openChat(G, gid); }],
  ['groupinfo', async () => { await openChat(G, gid); await act(G, 'groupinfo', gid); await G.waitForSelector('.sheet'); }],
  ['whohas', async () => { await openChat(G, gid); await G.click('[data-act=whohas]'); await G.waitForSelector('.sheet'); }],
  ['skies', async () => { await act(G, 'skies'); await G.waitForSelector('.sheet .map', { timeout: 8000 }); await G.waitForTimeout(1500); }],
  ['newmsg', async () => { await act(G, 'newmsg'); await G.waitForSelector('.sheet'); }],
  ['friends', async () => { await act(G, 'tab', 'friends'); }],
  ['addfriend', async () => { await act(G, 'tab', 'friends'); await act(G, 'addfriend'); await G.waitForSelector('.sheet'); await G.fill('#add-h', 'pierre'); await G.waitForTimeout(900); }],
  ['decline', async () => { await act(G, 'tab', 'friends'); await act(G, 'addfriend'); await G.waitForSelector('.addreqs [data-act=decline]'); await G.click('.addreqs [data-act=decline]'); await G.waitForSelector('.asheet'); }],
  ['account', async () => { await act(G, 'tab', 'account'); }],
  ['account-bottom', async () => { await act(G, 'tab', 'account'); await G.evaluate(() => document.querySelector('#screen > main.view').scrollTo(0, 9999)); }],
  ['feathers', async () => { await act(G, 'tab', 'account'); await act(G, 'feathers'); await G.waitForSelector('.sheet .fhead', { timeout: 8000 }); }],
  ['birds', async () => { await act(G, 'tab', 'account'); await act(G, 'birds'); await G.waitForSelector('.sheet'); }],
  ['bird', async () => { await act(G, 'tab', 'account'); await act(G, 'bird', gb[0].id); await G.waitForSelector('.sheet .bstats'); }],
  ['loft', async () => { await openChat(G, ps.me.id); await act(G, 'loft', ps.me.id); await G.waitForSelector('.sheet .bstats', { timeout: 8000 }); }],
  ['newsall', async () => { await act(G, 'tab', 'friends'); await act(G, 'newsall'); await G.waitForSelector('.sheet'); await G.waitForTimeout(800); }],
  ['stampsall', async () => { await act(G, 'tab', 'account'); await act(G, 'flightlog'); await G.waitForSelector('.sheet'); await G.waitForTimeout(800); await act(G, 'stampsall'); await G.waitForTimeout(600); }],

  ['whatsnew', async () => { await act(G, 'tab', 'account'); await act(G, 'whatsnew'); await G.waitForSelector('.sheet'); }],
  ['credits', async () => { await act(G, 'tab', 'account'); await act(G, 'creditsheet'); await G.waitForSelector('.sheet'); }],
  ['profile', async () => { await act(G, 'tab', 'account'); await act(G, 'profile'); await G.waitForSelector('.sheet'); }],
  ['appearance', async () => { await act(G, 'appearancesheet'); await G.waitForSelector('.sheet'); }],
  ['notifications', async () => { await act(G, 'notifysheet'); await G.waitForSelector('.sheet [data-act=pushtoggle], .sheet .group'); }],
  ['security', async () => { await act(G, 'securitysheet'); await G.waitForSelector('.sheet'); }],
  ['passkeys', async () => { await act(G, 'passkeys'); await G.waitForSelector('.sheet'); }],
  ['encryption', async () => { await act(G, 'encryptionsheet'); await G.waitForSelector('.sheet'); }],
  ['safetylist', async () => { await act(G, 'safetylist'); await G.waitForSelector('.sheet'); }],
  ['blocked', async () => { await act(G, 'blockedsheet'); await G.waitForSelector('.sheet [data-act=unblock]'); }],
  ['sessions', async () => { await act(G, 'sessionssheet'); await G.waitForSelector('.sheet .cell'); await G.waitForTimeout(600); }],
  ['flightlog', async () => { await act(G, 'tab', 'account'); await act(G, 'flightlog'); await G.waitForSelector('.sheet'); await G.waitForTimeout(800); }],
  ['flightlog-bottom', async () => { await act(G, 'tab', 'account'); await act(G, 'flightlog'); await G.waitForSelector('.sheet'); await G.waitForTimeout(800); await G.evaluate(() => { const x = document.querySelector('.sheet .body'); x.scrollTo(0, x.scrollHeight); }); }],
  ['reauth', async () => { sql(`UPDATE pg_sessions SET auth_at = 0 WHERE user_id = '${gs.me.id}'`); await act(G, 'tab', 'account'); await act(G, 'securitysheet'); await act(G, 'passkeys'); await G.waitForSelector('.sheet [data-act=pkadd]'); await G.click('.sheet [data-act=pkadd]'); await G.waitForSelector('#reauth-form', { timeout: 8000 }); }],
  ['chat-moon', async () => { await openChat(G, L.me.id); }],
  ['flysheet-moon', async () => { await openChat(G, L.me.id); await act(G, 'flysheet'); await G.waitForSelector('.sheet .flyhero'); }],
  ['trip-moon', async () => { await openChat(G, L.me.id); const id = await G.evaluate(() => document.querySelector('.msgs [data-mid]')?.dataset.mid); await act(G, 'map', id); await G.waitForSelector('.moonsky'); await G.waitForTimeout(1200); }],
  ['trip-moon-bottom', async () => { await openChat(G, L.me.id); const id = await G.evaluate(() => document.querySelector('.msgs [data-mid]')?.dataset.mid); await act(G, 'map', id); await G.waitForSelector('.moonsky'); await G.waitForTimeout(1200); await G.evaluate(() => { const x = document.querySelector('.sheet .body'); x.scrollTo(0, x.scrollHeight); }); }],
  ['chat-mars', async () => { await openChat(G, Mk.me.id); }],
  ['trip-laser', async () => { await openChat(G, Mk.me.id); const id = await G.evaluate(() => document.querySelector('.msgs [data-mid]')?.dataset.mid); await act(G, 'map', id); await G.waitForSelector('.moonsky'); await G.waitForTimeout(1200); }],
  ['trip-orbit', async () => { await openChat(G, ps.me.id); const id = await G.evaluate(() => [...document.querySelectorAll('.msgs [data-mid]')].at(-1)?.dataset.mid); await act(G, 'map', id); await G.waitForSelector('.moonsky'); await G.waitForTimeout(1200); }],
  ['flysheet-orbital', async () => { await openChat(G, ps.me.id); await act(G, 'pigeon', 'orbital'); await act(G, 'flysheet'); await G.waitForSelector('.sheet .flyhero'); }],
  ['friendinfo-moon', async () => { await openChat(G, L.me.id); await act(G, 'friendinfo', L.me.id); await G.waitForSelector('.sheet'); }],
  ['moonpick', async () => { await act(G, 'tab', 'account'); await act(G, 'moonpick', 'moon'); await G.waitForSelector('.moonpick'); await G.waitForTimeout(600); }],
  ['marspick', async () => { await act(G, 'tab', 'account'); await act(G, 'moonpick', 'mars'); await G.waitForSelector('.moonpick'); await G.waitForTimeout(600); }],
];
const want = only ? new Set(only.split(',')) : null;
for (const [w, h, th] of [[390, 844, 'light'], [390, 844, 'dark'], [320, 568, 'light']]) {
  size = String(w); theme = th;
  await G.setViewportSize({ width: w, height: h });
  await api(gs.token, 'me', { appearance: th }, 'PATCH'); await G.evaluate((t) => { try { localStorage.setItem('inflight-theme', t); } catch (_) {} }, th);
  await G.reload(); await G.waitForSelector('.tabs'); await G.waitForTimeout(1200);
  for (const [name, go] of screens) {
    if (want && !want.has(name)) continue;
    try { await home(G); await go(); await snap(G, name); }
    catch (e) { if (e === 'done') continue; report.push({ tag: `${size}-${theme}-${name}`, error: String(e).split('\n')[0] }); console.log(`${size}-${theme}-${name}: ERROR ${String(e).split('\n')[0]}`); }
  }
  sql(`UPDATE pg_sessions SET auth_at = ${Date.now()} WHERE user_id = '${gs.me.id}'`);
}
// signed out
const W = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36', hasTouch: true })).newPage();
size = '390'; theme = 'light';
await W.goto(BASE + '/pigeon/'); await W.waitForSelector('.welcome'); await W.waitForTimeout(3500); await snap(W, 'welcome');
// (Sign in: the account's page, for InFlight)
const toSignIn = async () => { await W.click('.welcome [data-act=acctsignin]'); await W.waitForURL((u) => u.hostname.startsWith('account.')); await W.waitForSelector('main .signin input[name=email]'); await W.waitForTimeout(1500); };
await toSignIn(); await snap(W, 'signin');
await W.setViewportSize({ width: 320, height: 568 }); size = '320';
await W.goto(BASE + '/pigeon/'); await W.waitForTimeout(3500); await snap(W, 'welcome'); await toSignIn(); await snap(W, 'signin');
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
console.log('errors', errs); await b.close();
