// Named pigeons with careers, end to end against the local stack.
// Push goes to a stand-in push service (PIGEON_PUSH_URL); this script plays the
// phone: it makes the subscription keys and decrypts what arrives (RFC 8291).
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { joinChat } from './join.mjs';
const [,, S, out] = process.argv;
const BASE = 'http://localhost:8788', URL = BASE + '/pigeon/';
const AUDIT = new Function('return (' + readFileSync(`${S}/wr/audit.mjs`, 'utf8').match(/const AUDIT = (\(\) => \{[\s\S]*?\n\});/)[1] + ')')();
// the local database is a file shared with the running server; retry if it's busy
const sql0 = (q) => execSync(`${S}/wr/node_modules/.bin/wrangler d1 execute bio-db --local --persist-to ${S}/wrstate --command "${q}"`, { cwd: process.env.APP_ROOT, stdio: 'pipe' }).toString();
const sql = (q) => { for (let i = 0; ; i++) { try { return sql0(q); } catch (e) { if (i > 5 || !/SQLITE_BUSY/.test(String(e.stdout) + String(e.stderr) + e.message)) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400); } } };
const pushes = () => readFileSync(`${S}/pushbox.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const mails = () => readFileSync(`${S}/mailbox.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((m) => m.body || m);
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const errs = []; let fails = 0; process.on('exit', () => console.log('errs-at-exit', errs));
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${extra ? '  — ' + extra : ''}`); if (!c) fails++; };
const wc = globalThis.crypto.subtle;
const b64u = (u) => Buffer.from(u).toString('base64url'), unb64u = (s) => new Uint8Array(Buffer.from(s, 'base64url'));

// ---- a "phone" with push keys we control ----
async function makeKeys() {
  const kp = await wc.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  return { kp, pub: new Uint8Array(await wc.exportKey('raw', kp.publicKey)), auth: globalThis.crypto.getRandomValues(new Uint8Array(16)) };
}
async function hkdf(salt, ikm, info, len) { const k = await wc.importKey('raw', ikm, 'HKDF', false, ['deriveBits']); return new Uint8Array(await wc.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8)); }
const te = new TextEncoder();
async function decrypt(keys, body) {
  const buf = new Uint8Array(Buffer.from(body, 'base64'));
  const salt = buf.slice(0, 16), idlen = buf[20], asPub = buf.slice(21, 21 + idlen), ct = buf.slice(21 + idlen);
  const asKey = await wc.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await wc.deriveBits({ name: 'ECDH', public: asKey }, keys.kp.privateKey, 256));
  const ikm = await hkdf(keys.auth, shared, new Uint8Array([...te.encode('WebPush: info\0'), ...keys.pub, ...asPub]), 32);
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16), nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const pt = new Uint8Array(await wc.decrypt({ name: 'AES-GCM', iv: nonce }, await wc.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), ct));
  let end = pt.length - 1; while (end > 0 && pt[end] === 0) end--;
  if (pt[end] !== 2) throw new Error('bad padding delimiter');
  return JSON.parse(new TextDecoder().decode(pt.slice(0, end)));
}
async function vapidOk(h) {
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(h.authorization || ''); if (!m) return false;
  const [hd, cl, sig] = m[1].split('.');
  const key = await wc.importKey('raw', unb64u(m[2]), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const good = await wc.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, unb64u(sig), te.encode(`${hd}.${cl}`));
  const claims = JSON.parse(Buffer.from(cl, 'base64url'));
  return good && claims.aud === 'https://fcm.googleapis.com' && claims.exp > Date.now() / 1000;
}

async function phone(name, keys) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36', hasTouch: true, timezoneId: 'Europe/London',
    userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' });
  await ctx.grantPermissions(['notifications'], { origin: BASE });
  if (keys) await ctx.addInitScript(({ endpoint, p256dh, auth }) => {
    // headless Chromium has no real push service; stand in for one with keys the test holds
    // like a real browser, the subscription survives reloads
    const make = (key) => ({ endpoint, options: { applicationServerKey: key }, toJSON: () => ({ endpoint, keys: { p256dh, auth } }), unsubscribe: async () => { localStorage.removeItem('fakesub'); return true; } });
    const toB = (u8) => btoa(String.fromCharCode(...u8)), fromB = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer;
    PushManager.prototype.getSubscription = async function () { const k = localStorage.getItem('fakesub'); return k ? make(fromB(k)) : null; };
    PushManager.prototype.subscribe = async function (o) { const k = new Uint8Array(o.applicationServerKey.buffer || o.applicationServerKey); localStorage.setItem('fakesub', toB(k)); return make(k.buffer); };
  }, { endpoint: `https://fcm.googleapis.com/fcm/send/${name}-device`, p256dh: b64u(keys.pub), auth: b64u(keys.auth) });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${name}: ${e}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(`${name}: ${m.text()}`); });
  await p.goto(URL);
  return { p, ctx, name };
}
const txt = async (ph, s) => (await ph.p.locator(s).first().innerText()).replace(/\s+/g, ' ');
// (made on the account's own page, then Chat signed in to: join.mjs)
const signup = (ph, name, handle, email, city) => joinChat(ph.p, URL, { name, handle, email, city });
// (retry once: the local server can drop an idle keep-alive connection while sql() runs)
const tick = async (secret = 'tick-test-secret') => { const go = () => fetch(BASE + '/api/pigeon/notify-tick', { method: 'POST', headers: { Authorization: 'Bearer ' + secret } });
  let r; try { r = await go(); } catch (_) { r = await go(); } return { status: r.status, ...(await r.json()) }; };
const lastPush = async (keys, since) => { const ps = pushes().filter((x) => x.at > since); return ps.length ? { ...ps.at(-1), msg: await decrypt(keys, ps.at(-1).body) } : null; };
const idOf = (ph) => ph.p.evaluate(() => new Promise((res) => { const r = indexedDB.open('inflight'); r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('session'); g.onsuccess = () => res(g.result.me.id); }; }));
const sess = (ph) => ph.p.evaluate(() => new Promise((res) => { const r = indexedDB.open('inflight'); r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('session'); g.onsuccess = () => res(g.result); }; }));
const fetchRetry = async (...a) => { for (let i = 0; ; i++) { try { return await fetch(...a); } catch (e) { if (i > 3) throw e; await new Promise((r) => setTimeout(r, 300)); } } };
const api = (tk, path, body) => fetchRetry(BASE + '/api/pigeon/' + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => [r.status, await r.json().catch(() => ({}))]);
const one = (q) => { const o = sql(q); const m = o.match(/"results": (\[[\s\S]*?\])\s*,\s*"success"/); return m ? JSON.parse(m[1]) : []; };
const openChat = async (ph, id) => {
  for (let k = 0; k < 4; k++) {
    await ph.p.evaluate((id) => { history.replaceState(null, '', location.pathname); location.hash = '#open=' + id; }, id);
    if (await ph.p.waitForSelector('#msg', { timeout: 3000 }).then(() => true).catch(() => false)) break;
  }
  await ph.p.waitForSelector('#msg'); await ph.p.waitForTimeout(700);
};
// the pigeon is chosen in How It Flies, opened from the pigeon at the start of the message box
const pickKind = async (p, kind) => {
  for (let k = 0; k < 30; k++) {
    await p.waitForSelector('.compose .kind:not([hidden])', { timeout: 15000 }); await p.click('.compose .kind');
    const row = p.locator(`.sheet [data-act=pigeon][data-id=${kind}]`); await row.waitFor();
    const off = await row.isDisabled();
    if (!off) await row.click();
    await p.click('.sheet header [data-act=close]'); await p.waitForTimeout(450);
    if (!off) return;
  }
  throw new Error(`no ${kind} pigeon to pick`);
};
const sentCount = () => Number(one("SELECT COUNT(*) AS n FROM pg_msgs")[0].n);
const send = async (ph, kind, text) => {
  const n0 = sentCount();
  for (let k = 0; k < 2; k++) {
    await pickKind(ph.p, kind);
    await ph.p.fill('#msg', text); await ph.p.click('.send');
    for (let w = 0; w < 10 && sentCount() === n0; w++) await ph.p.waitForTimeout(400);
    if (sentCount() > n0) return;
    await ph.p.screenshot({ path: `${out}/send-fail-${ph.name}-${k}.png` });
    console.log('DEBUG send', ph.name, k, await ph.p.evaluate(() => ({ toast: document.querySelector('.toast')?.innerText, layer: document.querySelector('.layer')?.innerText.slice(0, 200), pop: document.querySelector('.poplayer')?.innerText.slice(0, 200), msg: document.querySelector('#msg')?.value })));
  }
};
async function pushOn(ph) {
  await ph.p.click('[data-act=tab][data-id=account]'); await ph.p.waitForTimeout(700);
  await ph.p.click('#screen > main.view [data-act=pushtoggle]'); await ph.p.waitForSelector('#screen > main.view [data-act=pushtoggle][aria-checked=true]', { timeout: 10000 });
  // (whether Mid-air Moments is on: the account's, as Chat has it from its sync)
  return ph.p.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('inflight'); r.onerror = () => res(null);
    r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('session'); g.onerror = () => res(null);
      g.onsuccess = () => fetch('/api/pigeon/sync', { headers: { Authorization: 'Bearer ' + g.result?.token } }).then((x) => x.json()).then((d) => res(String(!!d.me?.notify?.moments)), () => res(null)); };
  }));
}
await fetch('http://127.0.0.1:8798/mode', { method: 'POST', body: '201' });
const G = await phone('george'), R = await phone('rosa'), N = await phone('nia');
await signup(G, 'George Farrow-Green', 'george', 'george@example.com', 'London');
await signup(R, 'Rosa Bianchi', 'rosa', 'rosa@example.com', 'Paris');
await signup(N, 'Nia Brooks', 'nia', 'nia@example.com', 'New York');
const [gs, rs, ns] = [await sess(G), await sess(R), await sess(N)];
for (const x of [rs, ns]) { await api(gs.token, 'friends', { handle: x.me.handle }); await api(x.token, 'friends-respond', { id: gs.me.id, accept: true }); }
await G.p.reload(); await G.p.waitForSelector('.tabs');
const birds = () => one(`SELECT id, name, km, flights, longest, busy_until, retired_at, lost_at, lost_place FROM pg_birds WHERE owner = '${gs.me.id}' ORDER BY created_at`);
const byName = (n) => birds().find((b) => b.name === n);
const msgOf = (q) => one(`SELECT id, bird, bird_name, bird_rank, bird_up, bird_done, sent_at, deliver_at FROM pg_msgs WHERE ${q} ORDER BY sent_at DESC`)[0];
const sheetTxt = async () => (await G.p.locator('.sheet .body').innerText()).replace(/\s+/g, ' ');
const land = (id, ago = 10 * 60e3) => { const m = msgOf(`id = '${id}'`), x = m.deliver_at - Date.now() + ago; sql(`UPDATE pg_msgs SET sent_at = sent_at - ${x}, deliver_at = deliver_at - ${x} WHERE id = '${id}'`); };
// ---- naming one, from Account ----
await G.p.click('[data-act=tab][data-id=account]'); await G.p.waitForTimeout(500);
ok(/Your Pigeons Name them, and they build careers/.test(await txt(G, '[data-act=birds]')), 'Account has Your Pigeons');
await G.p.click('[data-act=birds]'); await G.p.waitForSelector('.sheet .birdempty');
await G.p.waitForTimeout(600); await G.p.screenshot({ path: `${out}/birds-empty.png` });
await G.p.click('.birdempty [data-act=birdnew]'); await G.p.waitForSelector('#f-bname'); await G.p.fill('#f-bname', '  Biscuit  ');
await G.p.click('.sheet [data-act=submit]'); await G.p.waitForSelector('.sheet [data-act=bird]');
let st = await sheetTxt();
ok(/Biscuit Fledgling · 0 mi · Ready/.test(st) && /Name a New Pigeon/.test(st) && byName('Biscuit')?.km === 0, 'naming one: it joins, a Fledgling, ready to fly', st);
// the rules for names, and five at most
let [s1, r1] = await api(gs.token, 'birds', { name: '<b>x' }); ok(s1 === 400, 'only letters, numbers and the like', JSON.stringify(r1));
[s1, r1] = await api(gs.token, 'birds', { name: 'BISCUIT' }); ok(s1 === 409 && /already have a pigeon called/.test(r1.error), 'no two the same', JSON.stringify(r1));
for (const n of ['Pip', 'Captain', 'Dot', 'Echo']) await api(gs.token, 'birds', { name: n });
[s1, r1] = await api(gs.token, 'birds', { name: 'Sixth' }); ok(s1 === 409 && /5 named pigeons/.test(r1.error), 'five at most', JSON.stringify(r1));
[s1, r1] = await api(rs.token, 'bird-name', { id: byName('Pip').id, name: 'Mine now' }); ok(s1 === 404, 'no one else can rename yours', JSON.stringify(r1));
await G.p.keyboard.press('Escape'); await G.p.waitForTimeout(400);
// ---- one carries what you send ----
await G.p.reload(); await G.p.waitForSelector('.tabs'); await openChat(G, rs.me.id);
// who carries it: chosen in How It Flies, named on the pigeon at the start of the message box
const carrier = async (name) => { await G.p.click('.compose .kind'); await G.p.waitForSelector('.sheet .carriers'); await G.p.click(`.sheet .cc:has-text("${name}")`); await G.p.waitForTimeout(300); await G.p.click('.sheet header [data-act=close]'); await G.p.waitForTimeout(450); };
const pill = () => txt(G, '.compose .kind').catch(() => '');
let chip = await pill();
ok(chip === 'Biscuit', 'the composer says who carries it: the first, none having flown yet', chip);
await G.p.screenshot({ path: `${out}/birds-composer.png` });
await send(G, 'standard', 'Hello from Biscuit');
const m1 = msgOf(`sender = '${gs.me.id}'`);
ok(m1.bird === byName('Biscuit').id && m1.bird_name === 'Biscuit' && m1.bird_rank === 'Fledgling', 'Biscuit carries it', JSON.stringify(m1));
await G.p.waitForTimeout(800);
await G.p.click(`.b[data-act=flymenu][data-id="${m1.id}"]`); await G.p.waitForSelector('.menu-pop'); const meta = await txt(G, '.menu-pop [data-act=map] small'); await G.p.keyboard.press('Escape'); await G.p.waitForTimeout(400);
ok(/^Biscuit · Standard · lands /.test(meta), 'the chat says so (tap it in the air)', meta);
chip = await pill();
ok(chip === 'Pip', 'Biscuit is flying: the next one is Pip', chip);
// pick no one
await G.p.click('.compose .kind'); await G.p.waitForSelector('.sheet .carriers');
const items = await G.p.$$eval('.sheet .cc', (l) => l.map((b) => `${b.innerText.replace(/\s+/g, ' ')}${b.disabled ? ' (off)' : ''}${b.getAttribute('aria-checked') === 'true' ? ' ✓' : ''}`));
ok(items.includes('B Biscuit Flying (off)') && items.includes('P Pip Fledgling ✓') && items.includes('Any Pigeon No name'), 'How It Flies: the ones ready to fly, the one flying, or any pigeon', JSON.stringify(items));
await G.p.click('.sheet .cc:has-text("Any Pigeon")'); await G.p.waitForTimeout(300); await G.p.click('.sheet header [data-act=close]'); await G.p.waitForTimeout(450);
ok(await pill() === 'Swift', 'choosing Any Pigeon: the pigeon by the message is just its kind', await pill());
await send(G, 'swift', 'No name on this one');
ok(!msgOf(`sender = '${gs.me.id}' AND pigeon = 'swift'`).bird, 'it flies unnamed');
ok(await pill() === 'Pip', 'and after that, back to the next ready one', await pill());
// Rosa sees its name and rank, not which of George's it is
let [, rl] = await api(rs.token, `messages?with=${gs.me.id}`);
const rb = rl.messages.find((x) => x.id === m1.id)?.bird;
ok(rb && rb.name === 'Biscuit' && rb.rank === 'Fledgling' && !rb.id, 'Rosa sees it’s Biscuit, a Fledgling', JSON.stringify(rb));
await R.p.reload(); await R.p.waitForSelector('.tabs'); await openChat(R, gs.me.id);
await R.p.click(`[data-act=map][data-id="${m1.id}"]`); await R.p.waitForSelector('.sheet .map'); await R.p.waitForTimeout(1200);
ok(/^Carried by Biscuit$/.test(await txt(R, '.mapcard .birdline').catch(() => '')) && /Carried by Biscuit Fledgling/.test(await txt(R, '.mapcard .fcwho').catch(() => '')), 'and her map says so', await txt(R, '.mapcard .birdline').catch(() => ''));
await R.p.screenshot({ path: `${out}/birds-rosa-map.png` });
// ---- it lands: its career ----
land(m1.id); await tick();
let bz = byName('Biscuit');
ok(bz.flights === 1 && bz.km > 334 && bz.km < 385 && bz.busy_until > Date.now(), 'when it lands, Biscuit gets the miles (by the short way over the Channel), and rests', JSON.stringify(bz));
await G.p.reload(); await G.p.waitForSelector('.tabs'); await G.p.click('[data-act=tab][data-id=account]'); await G.p.click('[data-act=birds]'); await G.p.waitForSelector('.sheet [data-act=bird]');
st = await sheetTxt();
ok(/Biscuit Fledgling · 2[12]\d mi · Resting · ready in \d+h \d+m/.test(st) && /Pip Fledgling · 0 mi · In the air/.test(st) === false, 'Your Pigeons: Biscuit resting', st);
await G.p.screenshot({ path: `${out}/birds-list.png` });
// ---- a rank up ----
sql(`UPDATE pg_birds SET km = 450, busy_until = 0 WHERE id = '${bz.id}'`);
await G.p.keyboard.press('Escape'); await G.p.reload(); await G.p.waitForSelector('.tabs'); await openChat(G, rs.me.id);
await carrier('Biscuit'); await pickKind(G.p, 'turbo');
ok(await pill() === 'Biscuit', 'pick Biscuit again', await pill());
await send(G, 'turbo', 'Biscuit again');
const m2 = msgOf(`sender = '${gs.me.id}' AND pigeon = 'turbo'`);
land(m2.id); await tick();
bz = byName('Biscuit');
ok(bz.flights === 2 && bz.km > 500 && msgOf(`id = '${m2.id}'`).bird_up === 'Courier', 'past 500 km Biscuit becomes a Courier, on that flight', JSON.stringify([bz, msgOf(`id = '${m2.id}'`)]));
await G.p.reload(); await G.p.waitForSelector('.tabs'); await openChat(G, rs.me.id);
const up = await G.p.locator('.sysline.rankup').allInnerTexts();
ok(up.length === 1 && /^Biscuit became a Courier on this flight$/.test(up[0].trim()), 'the chat marks it', JSON.stringify(up));
await G.p.screenshot({ path: `${out}/birds-rankup.png` });
await G.p.click('.sysline.rankup'); await G.p.waitForSelector('.sheet .bstats');
st = await sheetTxt();
ok(/Biscuit Courier/.test(st) && /Flights/.test(st) && /Next: Navigator \d[\d,]* mi to go/.test(st) && /Stamina \d+: after a flight it rests about \d+% as long as it flew/.test(st), 'tap it for Biscuit’s career', st);
await G.p.waitForTimeout(700); await G.p.screenshot({ path: `${out}/birds-detail.png` });
await G.p.keyboard.press('Escape'); await G.p.waitForTimeout(300);
// ---- a group: it flies the longest way ----
const [, cg] = await api(gs.token, 'groups', { name: 'Club', members: [rs.me.id, ns.me.id] });
const keys = Object.fromEntries([gs, rs, ns].map((x) => [x.me.id, 'k'.repeat(40)])), gid = crypto.randomUUID();
await api(gs.token, 'group-messages', { id: gid, group: cg.group.id, body: 'x'.repeat(40), keys, pigeon: 'swift', bird: byName('Pip').id });
const gm = one(`SELECT bird, bird_name, bird_to FROM pg_gmsgs WHERE id = '${gid}'`)[0];
ok(gm.bird === byName('Pip').id && gm.bird_to === ns.me.id, 'in a group, Pip flies the longest route (New York)', JSON.stringify(gm));
let [, nl] = await api(ns.token, `group-messages?id=${cg.group.id}`);
ok(nl.messages[0]?.bird?.name === 'Pip' && !nl.messages[0].bird.id, 'and everyone in it sees it’s Pip', JSON.stringify(nl.messages[0]?.bird));
const x = one(`SELECT deliver_at FROM pg_gdeliv WHERE msg_id = '${gid}' AND user_id = '${ns.me.id}'`)[0].deliver_at - Date.now() + 60000;
sql(`UPDATE pg_gmsgs SET sent_at = sent_at - ${x} WHERE id = '${gid}'`); sql(`UPDATE pg_gdeliv SET deliver_at = deliver_at - ${x} WHERE msg_id = '${gid}'`);
await tick();
const pip = byName('Pip');
ok(pip.flights === 1 && pip.km > 5000 && one(`SELECT bird_up FROM pg_gmsgs WHERE id = '${gid}'`)[0].bird_up === 'Navigator', 'it lands: Pip gets the miles to New York, and is a Navigator', JSON.stringify(pip));
// ---- called back: home again, no miles ----
await G.p.reload(); await G.p.waitForSelector('.tabs'); await openChat(G, rs.me.id);
await carrier('Dot');
await send(G, 'swift', 'Never mind');
const m3 = msgOf(`sender = '${gs.me.id}' AND bird_name = 'Dot'`);
await api(gs.token, 'recall', { id: m3.id }); await tick();
const dot = byName('Dot');
ok(dot.km === 0 && dot.flights === 0 && dot.busy_until > Date.now() && msgOf(`id = '${m3.id}'`).bird_done, 'called back, Dot flies home: no miles, and rests', JSON.stringify(dot));
// ---- Pigeon Death: lost, and remembered ----
await carrier('Captain');
await send(G, 'swift', 'Risky one');
const m4 = msgOf(`sender = '${gs.me.id}' AND bird_name = 'Captain'`);
sql(`UPDATE pg_msgs SET sent_at = sent_at - 3600000, lost_at = ${Date.now() - 60000}, risky = 1 WHERE id = '${m4.id}'`);
await tick();
const cap = byName('Captain');
ok(cap.lost_at > 0 && cap.lost_place && cap.km === 0, 'lost to Pigeon Death: Captain is gone, and where is kept', JSON.stringify(cap));
await G.p.reload(); await G.p.waitForSelector('.tabs'); await openChat(G, rs.me.id); await G.p.waitForTimeout(500);
ok(/Captain was lost · Pigeon Death/.test(await txt(G, '.msgs')), 'the chat says Captain was lost');
// ---- a Legend retires ----
sql(`UPDATE pg_birds SET km = 41000, flights = 40 WHERE id = '${byName('Echo').id}'`);
[s1, r1] = await api(gs.token, 'bird-retire', { id: byName('Pip').id }); ok(s1 === 409 && /Only Legends retire/.test(r1.error), 'only a Legend can retire', JSON.stringify(r1));
await G.p.reload(); await G.p.waitForSelector('.tabs'); await G.p.click('[data-act=tab][data-id=account]'); await G.p.click('[data-act=birds]'); await G.p.waitForSelector('.sheet [data-act=bird]');
await G.p.click(`.sheet [data-act=bird][data-id="${byName('Echo').id}"]`); await G.p.waitForSelector('.sheet .bstats');
st = await sheetTxt();
ok(/Echo Legend/.test(st) && /has flown once around the world/.test(st) && !/Next:/.test(st), 'Echo is a Legend', st);
await G.p.click('.sheet [data-act=birdretire]'); await G.p.waitForSelector('.menu-pop'); await G.p.click('.menu-pop [data-act=birdretired]'); await G.p.waitForTimeout(800);
ok(byName('Echo').retired_at > 0, 'Echo retires');
await G.p.click('.sheet [data-act=birds]').catch(() => {}); await G.p.waitForTimeout(500);
st = await sheetTxt();
ok(/Hall of Fame/.test(st) && /Echo Legend · [\d,]+ mi · retired/.test(st) && /Captain Lost over .+ · \d+ \w+ \d{4}/.test(st) && /Name a New Pigeon/.test(st), 'the Hall of Fame: Echo retired, Captain lost; room for a new one', st);
await G.p.screenshot({ path: `${out}/birds-hall.png` });
// ---- renaming ----
await G.p.click(`.sheet [data-act=bird][data-id="${byName('Pip').id}"]`); await G.p.waitForSelector('.sheet [data-act=birdrename]');
await G.p.click('.sheet [data-act=birdrename]'); await G.p.waitForSelector('#f-bname'); await G.p.fill('#f-bname', 'Pipkin'); await G.p.click('.sheet [data-act=submit]'); await G.p.waitForTimeout(800);
ok(birds().some((x) => x.name === 'Pipkin' && x.km > 5000), 'renaming keeps its career', JSON.stringify(birds().map((x) => x.name)));
[, nl] = await api(ns.token, `group-messages?id=${cg.group.id}`);
ok(nl.messages[0]?.bird?.name === 'Pip', 'what it carried keeps the name it flew under');
console.log('errors', errs); console.log('FAILS', fails); await b.close();
