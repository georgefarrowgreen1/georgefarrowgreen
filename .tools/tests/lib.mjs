// Shared test kit: phones with push we can read, sign-up, the database, the API, ticks.
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { createHash, randomBytes } from 'crypto';
import http from 'http';
import { joinInFlight } from './join.mjs';
export async function kit(S, out, BASE = 'http://localhost:8788') {
const URL = process.env.APPURL || BASE + '/pigeon/';
const sql0 = (q) => execSync(`${S}/wr/node_modules/.bin/wrangler d1 execute bio-db --local --persist-to ${S}/wrstate --command "${q}"`, { cwd: process.env.APP_ROOT, stdio: 'pipe' }).toString();
const sql = (q) => { for (let i = 0; ; i++) { try { return sql0(q); } catch (e) { if (i > 5 || !/SQLITE_BUSY/.test(String(e.stdout) + String(e.stderr) + e.message)) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400); } } };
const pushes = () => readFileSync(`${S}/pushbox.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
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
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36', hasTouch: true, timezoneId: name === 'reuben' ? 'Asia/Singapore' : 'Europe/London',
    userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' });
  await ctx.grantPermissions(['notifications'], { origin: BASE });
  // the map card opens pulled up, so the tests can read its details (fcdemo folds it)
  await ctx.addInitScript(() => { try { if (!localStorage.getItem('inflight-mapcard')) localStorage.setItem('inflight-mapcard', 'open'); } catch (_) {} });
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
// (made on the account's own page, then InFlight signed in to: join.mjs)
const signup = (ph, name, handle, email, city) => joinInFlight(ph.p, URL, { name, handle, email, city });
// (retry once: the local server can drop an idle keep-alive connection while sql() runs)
const tick = async (secret = 'tick-test-secret') => { const go = () => fetch(BASE + '/api/pigeon/notify-tick', { method: 'POST', headers: { Authorization: 'Bearer ' + secret } });
  let r; try { r = await go(); } catch (_) { r = await go(); } return { status: r.status, ...(await r.json()) }; };
const lastPush = async (keys, since) => { const ps = pushes().filter((x) => x.at > since); return ps.length ? { ...ps.at(-1), msg: await decrypt(keys, ps.at(-1).body) } : null; };
const idOf = (ph) => ph.p.evaluate(() => new Promise((res) => { const r = indexedDB.open('inflight'); r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('session'); g.onsuccess = () => res(g.result.me.id); }; }));
const sess = (ph) => ph.p.evaluate(() => new Promise((res) => { const r = indexedDB.open('inflight'); r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('session'); g.onsuccess = () => res(g.result); }; }));
const fetchRetry = async (...a) => { for (let i = 0; ; i++) { try { return await fetch(...a); } catch (e) { if (i > 3) throw e; await new Promise((r) => setTimeout(r, 300)); } } };
const api = (tk, path, body) => fetchRetry(BASE + '/api/pigeon/' + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => [r.status, await r.json().catch(() => ({}))]);
const one = (q) => { const o = sql(q); const m = o.match(/"results": (\[[\s\S]*?\])\s*,\s*"success"/); return m ? JSON.parse(m[1]) : []; };
// The site's admin, on its account's page (functions/api/pigeon admin): this account made it (as linking it once did),
// with a passkey on it and a sign-in just shown, for the account's address; ask(path) asks Admin's API as that would
async function admin(userId) {
  const hx = (x) => createHash('sha256').update(x).digest('hex'), t = Date.now(), site = randomBytes(32).toString('base64url');
  one(`INSERT INTO pg_sessions (hash, user_id, created_at, seen_at, auth_at, site_hash) VALUES ('${hx(randomBytes(32).toString('base64url'))}', '${userId}', ${t}, ${t}, ${t}, '${hx(site)}')`);
  one(`INSERT OR REPLACE INTO pg_meta (k, v) VALUES ('admin_user', '${userId}')`);
  one(`INSERT OR IGNORE INTO pg_passkeys (id, user_id, public_key, alg, created_at) VALUES ('admin-test-key', '${userId}', 'x', -7, ${t})`);
  const ask = (path) => new Promise((ok, no) => {
    const r = http.request({ host: '127.0.0.1', port: 8788, path: `/api/account/admin/${path}`, agent: false, headers: { Host: 'account.localhost:8788', Cookie: `account=${site}` } }, (res) => {
      const parts = []; res.on('data', (c) => parts.push(c));
      res.on('end', () => { let json = null; try { json = JSON.parse(Buffer.concat(parts).toString()); } catch (_) {} ok({ status: res.statusCode, json }); });
    });
    r.on('error', no); r.end();
  });
  return { ask, page: 'http://account.localhost:8788', cookie: { name: 'account', value: site, domain: 'account.localhost', path: '/' } };
}
const openChat = async (ph, id) => {
  for (let k = 0; k < 4; k++) {
    await ph.p.evaluate((id) => { history.replaceState(null, '', location.pathname); location.hash = '#open=' + id; }, id);
    if (await ph.p.waitForSelector('#msg', { timeout: 3000 }).then(() => true).catch(() => false)) break;
  }
  await ph.p.waitForSelector('#msg'); await ph.p.waitForTimeout(700);
};
const sentCount = () => Number(one("SELECT COUNT(*) AS n FROM pg_msgs")[0].n);
const send = async (ph, kind, text) => {
  const n0 = sentCount();
  for (let k = 0; k < 2; k++) {
    await ph.p.waitForSelector(`[data-act=pigeon][data-id=${kind}]:not([disabled])`, { timeout: 15000 }); await ph.p.click(`[data-act=pigeon][data-id=${kind}]`);
    await ph.p.fill('#msg', text); await ph.p.click('.send');
    for (let w = 0; w < 10 && sentCount() === n0; w++) await ph.p.waitForTimeout(400);
    if (sentCount() > n0) return;
    await ph.p.screenshot({ path: `${out}/send-fail-${ph.name}-${k}.png` });
    console.log('DEBUG send', ph.name, k, await ph.p.evaluate(() => ({ toast: document.querySelector('.toast')?.innerText, layer: document.querySelector('.layer')?.innerText.slice(0, 200), pop: document.querySelector('.poplayer')?.innerText.slice(0, 200), msg: document.querySelector('#msg')?.value })));
  }
};
async function pushOn(ph) {
  await ph.p.click('[data-act=tab][data-id=account]'); await ph.p.waitForTimeout(700); await ph.p.click('#screen > main.view [data-act=notifysheet]'); await ph.p.waitForSelector('[data-act=pushtoggle]');
  await ph.p.click('[data-act=pushtoggle]'); await ph.p.waitForSelector('[data-act=pushtoggle][aria-checked=true]', { timeout: 10000 });
  const sw = await ph.p.locator('[role=switch][data-id=moments]').getAttribute('aria-checked').catch(() => null);
  await ph.p.keyboard.press('Escape'); await ph.p.waitForTimeout(400); await ph.p.keyboard.press('Escape'); await ph.p.waitForTimeout(400);
  return sw;
}

// ---- choosing a pigeon now happens in How It Flies, opened from the pigeon by the message ----
const pick = async (ph, kind) => {
  for (let k = 0; k < 30; k++) {
    await ph.p.click('.compose .kind'); await ph.p.waitForSelector(`.sheet [data-act=pigeon][data-id=${kind}]`);
    const off = await ph.p.locator(`.sheet [data-act=pigeon][data-id=${kind}]`).isDisabled();
    if (!off) { await ph.p.click(`.sheet [data-act=pigeon][data-id=${kind}]`); await ph.p.click('.sheet header [data-act=close]'); await ph.p.waitForTimeout(450); return; }
    await ph.p.click('.sheet header [data-act=close]'); await ph.p.waitForTimeout(500);
  }
  await ph.p.screenshot({ path: `${out}/fail-${ph.name}.png` }); throw new Error('no ' + kind + ' for ' + ph.name);
};
const say = async (ph, kind, text) => { await pick(ph, kind); await ph.p.fill('#msg', text); await ph.p.click('.send'); await ph.p.waitForTimeout(1500); };
// every push to one phone since a moment, opened
const allPushes = async (keys, name, since = 0) => Promise.all(pushes().filter((x) => x.at > since && (x.headers['x-endpoint'] || '').includes(`/${name}-device`)).map(async (x) => ({ at: x.at, ...(await decrypt(keys, x.body).catch(() => ({}))) })));
return { b, errs, ok, sql, one, admin, pushes, allPushes, makeKeys, decrypt, phone, signup, tick, lastPush, sess, api, openChat, pick, say, send, pushOn, txt, fails: () => fails, URL, BASE };
}
