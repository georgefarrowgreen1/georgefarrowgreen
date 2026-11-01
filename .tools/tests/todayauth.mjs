// InFlite Today (inflite.ai, the inflite repo's root Worker) asks the account's address for everything it shows and keeps
// (functions/_todayapp.js), passing on the browser's cookie and its own Origin, which every route checks, GETs too.
// Signing in is the account's page's, handed back to Today with a code good once, and only with Today's word for it.
// Straight against the API, as Today's server asks it (the site stood in for by ifl.test: Today at ifl.test itself),
// with the account's page's own calls beside it (Notifications, your data, deleting the account).
import http from 'http';
import { execSync } from 'child_process';
import { createHash, randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { acctCall } from './handback.mjs';
const [,, S] = process.argv;
const ACCT = 'account.ifl.test:8788', TODAY = 'http://ifl.test:8788', ACCT_ORIGIN = 'http://account.ifl.test:8788';
let fails = 0; const ok = (c, l, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x !== '' ? ' — ' + x : ''}`); if (!c) fails++; };
const sql0 = (q) => execSync(`${S}/wr/node_modules/.bin/wrangler d1 execute bio-db --local --persist-to ${S}/wrstate --json --command "${q}"`, { cwd: process.env.APP_ROOT, stdio: 'pipe' }).toString();
const sql = (q) => { for (let i = 0; ; i++) { try { return sql0(q); } catch (e) { if (i > 5 || !/SQLITE_BUSY/.test(String(e.stdout) + String(e.stderr) + e.message)) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400); } } };
const rows = (q) => { try { return JSON.parse(sql(q))[0]?.results || []; } catch (_) { return []; } };
const b64u = (u) => Buffer.from(u).toString('base64url');
const rnd = (n) => crypto.getRandomValues(new Uint8Array(n));
const MORNING = JSON.parse(readFileSync(new URL('./mocks/today/morning.json', import.meta.url), 'utf8'));

// (a request to the account's address: Today's own as its server makes them, the browser's cookie and its Origin passed
// on; or the account's page's own, from its address)
function ask(method, path, { cookie, origin, body, host = ACCT, ip } = {}) {
  const data = body !== undefined ? JSON.stringify(body) : '';
  return new Promise((done, no) => {
    const t = Date.now();
    const q = http.request({ host: '127.0.0.1', port: 8788, path, method, agent: false, headers: { Host: host,
      ...(origin ? { Origin: origin } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(ip ? { 'CF-Connecting-IP': ip } : {}),
      ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) } }, (res) => {
      const parts = []; res.on('data', (c) => parts.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(parts); let j = {}; try { j = JSON.parse(raw.toString()); } catch (_) {}
        const set = (res.headers['set-cookie'] || []).find((x) => /^account=/.test(x)) || null;
        done({ s: res.statusCode, j, raw, type: res.headers['content-type'] || '', set, cookie: set ? set.split(';')[0] : null, ms: Date.now() - t });
      });
    });
    q.on('error', no); q.end(data);
  });
}
const today = (method, path, { origin = TODAY, ...o } = {}) => ask(method, '/api/account/today/' + path, { origin, ...o });
const page = (method, path, o = {}) => ask(method, '/api/account/' + path, { origin: ACCT_ORIGIN, ...o });
async function signup(name, handle, email) {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']), pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const r = await acctCall('signup', { name, handle, email, salt: b64u(rnd(16)), proof: b64u(rnd(32)), vault: 'x'.repeat(40), pub: { kty: 'EC', crv: 'P-256', x: pub.x, y: pub.y } },
    { ip: '10.0.7.' + (handle.length + 10) });
  if (r.s !== 201 || !r.cookie) throw new Error(`signup ${handle}: ${r.s} ${JSON.stringify(r.j)}`);
  return r.cookie;
}
const word = () => { const w = randomBytes(32).toString('base64url'); return { w, ask: createHash('sha256').update(w).digest('base64url') }; };
// a device's subscription, as a browser makes one (its keys a real P-256 pair, so a push to it can be sealed)
async function device(n) {
  const k = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  return { endpoint: `https://fcm.googleapis.com/fcm/send/today-test-${n}-${randomBytes(4).toString('hex')}`, keys: { p256dh: b64u(new Uint8Array(await crypto.subtle.exportKey('raw', k.publicKey))), auth: b64u(rnd(16)) } };
}
const hashOf = (ep) => createHash('sha256').update(ep).digest('base64url').slice(0, 16);
// (a small JPEG, as far as the server looks: its first bytes, and enough of it)
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 7), Buffer.from([0xff, 0xd9])]);
function putPhoto(cookie) {
  return new Promise((done, no) => {
    const q = http.request({ host: '127.0.0.1', port: 8788, path: '/api/account/me/photo', method: 'PUT', agent: false, headers: { Host: ACCT, Origin: ACCT_ORIGIN, Cookie: cookie,
      'Content-Type': 'image/jpeg', 'Content-Length': JPEG.length } }, (res) => { res.resume(); res.on('end', () => done(res.statusCode)); });
    q.on('error', no); q.end(JPEG);
  });
}

// ---- 1. Who's asking: no one, then someone; the cookie renewed as it's used ----
let r = await today('GET', 'me');
ok(r.s === 200 && r.j.signedIn === false && r.j.links?.chat === 'http://chat.ifl.test:8788' && r.j.links?.auth === 'http://auth.ifl.test:8788' && !r.j.user, 'no cookie: signed out, with the apps’ addresses', JSON.stringify(r.j));
const alex = await signup('Alex Morgan', 'alexphone', 'alex@example.com');
const ids = Object.fromEntries(rows("SELECT id, handle FROM pg_users").map((x) => [x.handle, x.id]));
r = await today('GET', 'me', { cookie: alex });
ok(r.s === 200 && r.j.signedIn && r.j.user?.id === ids.alexphone && r.j.user.first === 'Alex' && r.j.user.handle === 'alexphone' && r.j.user.appearance === 'auto' && r.j.user.photoAt === null,
  'signed in: who, as Today shows it', JSON.stringify(r.j.user));
ok(JSON.stringify(r.j.prefs) === JSON.stringify({ order: ['weather', 'chat', 'fitness', 'markets'], hidden: [] }) && JSON.stringify(r.j.morning) === JSON.stringify({ on: false, at: 420, devices: 0 }),
  'the cards in their usual order, the morning off', JSON.stringify([r.j.prefs, r.j.morning]));
ok(r.cookie === alex && /Max-Age=\d+/.test(r.set || '') && /Domain=ifl\.test/.test(r.set || ''), 'the cookie renewed, for the whole site', r.set);
const session = JSON.parse(readFileSync(new URL('./mocks/today/session.json', import.meta.url), 'utf8'));
ok(['signedIn', 'user', 'prefs', 'morning', 'links'].every((k) => k in r.j) && Object.keys(session.user).every((k) => k in r.j.user) && Object.keys(session.links).every((k) => k in r.j.links),
  'the session view’s shape, as session.json has it (accountOrigin is Today’s server’s to add)', Object.keys(r.j).join());

// ---- 2. Every route refuses a request without Today's Origin, GETs included ----
const ROUTES = [['GET', 'me'], ['POST', 'handback', {}], ['POST', 'signout', {}], ['GET', 'cards'], ['PUT', 'prefs', {}], ['GET', 'morning'], ['PUT', 'morning', {}], ['POST', 'morning/try', {}],
  ['GET', 'push-key'], ['POST', 'push', {}], ['POST', 'push-move', {}], ['DELETE', 'push', {}], ['POST', 'account-link', {}], ['GET', `avatar?id=${ids.alexphone}`]];
const wrong = [];
for (const [m, p, body] of ROUTES) for (const origin of [null, 'http://chat.ifl.test:8788', ACCT_ORIGIN, 'https://inflite.ai', 'http://ifl.test:9999']) {
  const x = await ask(m, '/api/account/today/' + p, { cookie: alex, origin, body });
  if (x.s !== 403 || x.j.error !== 'That request didn’t come from Today.') wrong.push(`${m} ${p} ${origin}: ${x.s}`);
}
ok(!wrong.length, `every one of the ${ROUTES.length} routes refuses a missing or wrong Origin (403), GETs included`, wrong.join('; '));
r = await ask('GET', '/api/account/today/me', { host: 'auth.ifl.test:8788', origin: TODAY, cookie: alex });
ok(r.s === 404, 'not answered at the sign-in page’s address', `${r.s}`);

// ---- 3. Handed back to Today: a code for Today, swapped only with Today's word, from Today's own page, once ----
let { w, ask: asked } = word();
let made = await acctCall('handback', { app: 'today', ask: asked }, { cookie: alex });
ok(made.s === 200 && made.j.code, 'the account’s page makes a code for Today', JSON.stringify(made.j));
r = await today('POST', 'handback', { origin: 'http://email.ifl.test:8788', body: { code: made.j.code, verifier: w } });
ok(r.s === 403 && !r.cookie, 'from another app’s page: refused, and no sign-in given', `${r.s} ${JSON.stringify(r.j)}`);
r = await today('POST', 'handback', { body: { code: made.j.code, verifier: word().w } });
ok(r.s === 400 && !r.cookie && r.j.field === 'handback', 'with the wrong word: refused (and the code used up)', `${r.s} ${JSON.stringify(r.j)}`);
({ w, ask: asked } = word());
made = await acctCall('handback', { app: 'today', ask: asked }, { cookie: alex });
r = await today('POST', 'handback', { body: { code: made.j.code, verifier: w }, ip: '10.0.7.200' });
ok(r.s === 200 && r.cookie && r.cookie !== alex && r.j.signedIn && r.j.user?.id === ids.alexphone, 'Today’s word, from Today, in a browser with no sign-in (a Home Screen Today): a sign-in of its own, and the view', `${r.s} ${JSON.stringify(r.j).slice(0, 200)}`);
ok(/Domain=ifl\.test/.test(r.set || '') && /HttpOnly/.test(r.set || '') && /SameSite=Lax/.test(r.set || ''), 'given as the site’s cookie (every address on it, HttpOnly, SameSite=Lax)', r.set);
const homeScreen = r.cookie;
const again = await today('POST', 'handback', { body: { code: made.j.code, verifier: w } });
ok(again.s === 400 && !again.cookie, 'the same code again: refused', `${again.s}`);
ok(rows("SELECT key FROM pg_limits WHERE key = 'handback-ip:10.0.7.200'").length === 1, 'its tries counted under the address it came from', '');
const hsRow = rows(`SELECT hash, apps FROM pg_sessions WHERE user_id = '${ids.alexphone}' ORDER BY created_at DESC LIMIT 1`)[0];
ok(hsRow?.apps === 'today', 'the new sign-in is Today’s (Signed-in devices names it so)', JSON.stringify(hsRow));
({ w, ask: asked } = word());
made = await acctCall('handback', { app: 'today', ask: asked }, { cookie: alex });
r = await today('POST', 'handback', { cookie: alex, body: { code: made.j.code, verifier: w } });
ok(r.s === 200 && r.cookie === alex, 'in a browser that shares the site’s sign-in: the same one, renewed', `${r.s} ${r.cookie === alex}`);
({ w, ask: asked } = word());
made = await acctCall('handback', { app: 'mail', ask: asked }, { cookie: alex });
r = await today('POST', 'handback', { body: { code: made.j.code, verifier: w } });
ok(r.s === 400, 'a code made for Mail doesn’t open Today', `${r.s}`);

// ---- 4. A sign-in handed over to a browser signed in to nothing is the account's page's alone: not Today's ----
sql(`UPDATE pg_sessions SET handed = 1 WHERE hash = '${hsRow.hash}'`);
r = await today('GET', 'me', { cookie: homeScreen });
ok(r.s === 200 && r.j.signedIn === false, 'handed over and not yet shown it’s you: today/me says signed out (200)', `${r.s} ${JSON.stringify(r.j).slice(0, 80)}`);
const handedWrong = [];
for (const [m, p, body] of [['GET', 'cards'], ['GET', 'morning'], ['PUT', 'prefs', { hidden: [] }], ['PUT', 'morning', { on: true }], ['POST', 'push', { sub: await device('h') }],
  ['POST', 'push-move', { sub: await device('h2'), was: 'x' }], ['DELETE', 'push', { endpoint: 'x' }], ['POST', 'morning/try', { endpoint: 'x' }], ['POST', 'account-link', {}], ['GET', `avatar?id=${ids.alexphone}`]]) {
  const x = await today(m, p, { cookie: homeScreen, body });
  if (x.s !== 401 || x.j.field !== 'session') handedWrong.push(`${m} ${p}: ${x.s}`);
}
ok(!handedWrong.length, 'and every other route answers 401 (field "session"), so the page shows signed out', handedWrong.join('; '));
sql(`UPDATE pg_sessions SET handed = NULL WHERE hash = '${hsRow.hash}'`);

// ---- 5. Edit's cards, kept with the account ----
r = await today('PUT', 'prefs', { cookie: alex, body: { order: ['markets', 'weather', 'nope'], hidden: ['chat'] } });
ok(r.s === 200 && JSON.stringify(r.j) === JSON.stringify({ prefs: { order: ['markets', 'weather', 'chat', 'fitness'], hidden: ['chat'] } }), 'Edit’s order and hidden, made safe', JSON.stringify(r.j));
r = await today('GET', 'me', { cookie: homeScreen });
ok(JSON.stringify(r.j.prefs) === JSON.stringify({ order: ['markets', 'weather', 'chat', 'fitness'], hidden: ['chat'] }), 'and they follow the account to its other sign-in', JSON.stringify(r.j.prefs));
r = await today('PUT', 'prefs', { cookie: alex, body: { order: 'markets' } });
ok(r.s === 400 && r.j.error === 'Bad request.', 'a bad body: refused', `${r.s} ${JSON.stringify(r.j)}`);

// ---- 6. The morning: checked, its first time from Weather's briefing, the view as morning.json has it ----
for (const [b, words] of [[{ at: 421 }, 'Choose a time.'], [{ at: 1440 }, 'Choose a time.'], [{ on: 'yes' }, 'Choose on or off.'], [{ lines: { chat: 1 } }, 'Choose on or off.']]) {
  r = await today('PUT', 'morning', { cookie: alex, body: b });
  ok(r.s === 400 && r.j.error === words, `the morning: ${JSON.stringify(b)} refused`, `${r.s} ${JSON.stringify(r.j)}`);
}
r = await page('PATCH', 'notify', { cookie: alex, body: { weather: { brief: { name: 'London', lat: 51.5072, lon: -0.1276 }, briefAt: '06:30' } } });
ok(r.s === 200 && r.j.weather?.briefAt === '06:30', 'Weather’s briefing on at 06:30, on the account’s Notifications page', `${r.s} ${JSON.stringify(r.j.weather || r.j).slice(0, 120)}`);
// (and a place saved in Weather, as Weather saves it: the version it was made from, and what's kept)
const wxNow = await ask('GET', '/api/weather/me', { host: 'weather.ifl.test:8788', origin: 'http://weather.ifl.test:8788', cookie: alex });
r = await ask('PUT', '/api/weather/me', { host: 'weather.ifl.test:8788', origin: 'http://weather.ifl.test:8788', cookie: alex,
  body: { base: wxNow.j.ver, data: { ...wxNow.j.data, places: [{ name: 'London', region: 'England', lat: 51.5072, lon: -0.1276 }] } } });
ok(r.s === 200, 'a place saved in Weather', `${r.s} ${JSON.stringify(r.j).slice(0, 120)}`);
r = await today('PUT', 'morning', { cookie: alex, body: { on: true, tz: 'Europe/London' } });
ok(r.s === 200 && r.j.on === true && r.j.at === 390 && r.j.tz === 'Europe/London', 'turned on for the first time: at Weather’s briefing time', `${r.s} ${JSON.stringify(r.j).slice(0, 200)}`);
const shapeOk = (v) => JSON.stringify(Object.keys(v).sort()) === JSON.stringify(Object.keys(MORNING).sort()) && JSON.stringify(Object.keys(v.lines)) === JSON.stringify(Object.keys(MORNING.lines))
  && JSON.stringify(Object.keys(v.replaces).sort()) === JSON.stringify(Object.keys(MORNING.replaces).sort()) && typeof v.names === 'boolean' && typeof v.sentToday === 'boolean' && typeof v.devices === 'number';
ok(shapeOk(r.j), 'the view’s shape is morning.json’s', Object.keys(r.j).join());
ok(r.j.devices === 0 && r.j.thisDevice === null && r.j.names === false && r.j.place === 'London', 'on, on no device yet; names as Chat has them (off); the Weather place’s name', JSON.stringify([r.j.devices, r.j.thisDevice, r.j.names, r.j.place]));
ok(r.j.replaces?.weather === false && r.j.replaces?.fitness === false, 'nothing to come instead of yet (Weather’s briefing has no device)', JSON.stringify(r.j.replaces));
ok(r.j.preview === null || (['next', 'sent'].includes(r.j.preview.kind) && typeof r.j.preview.title === 'string' && Array.isArray(r.j.preview.lines)), 'a preview (or none, where it can’t be said just now)', JSON.stringify(r.j.preview).slice(0, 200));
r = await today('PUT', 'morning', { cookie: alex, body: { at: 455, lines: { markets: false }, tz: 'Not/AZone' } });
ok(r.s === 200 && r.j.at === 455 && r.j.lines.markets === false && r.j.lines.weather === true && r.j.tz === 'Europe/London', 'its time and a line changed; a zone the clocks don’t know left out', JSON.stringify([r.j.at, r.j.lines, r.j.tz]));
await today('PUT', 'morning', { cookie: alex, body: { on: false } });
r = await today('PUT', 'morning', { cookie: alex, body: { on: true } });
ok(r.j.at === 455, 'turned on again: the time chosen, not Weather’s', `${r.j.at}`);

// ---- 7. Devices: added, moved, taken off; a bad one refused; one that's someone else's now moves to them ----
const phone = await device('alex');
r = await today('POST', 'push', { cookie: alex, body: { sub: phone } });
ok(r.s === 200 && r.j.ok && r.j.devices === 1, 'a device added', `${r.s} ${JSON.stringify(r.j)}`);
r = await today('POST', 'push', { cookie: alex, body: { sub: { ...phone, endpoint: 'https://evil.example/push/x' } } });
ok(r.s === 400 && r.j.error === 'That isn’t a push subscription this server can send to.', 'one at an address no push service has: refused', `${r.s} ${JSON.stringify(r.j)}`);
r = await today('GET', 'push-key');
ok(r.s === 200 && /^[A-Za-z0-9_-]{80,90}$/.test(r.j.key || ''), 'the site’s push key', JSON.stringify(r.j));

// ---- 8. The cards and the Morning section in one; this device known by its hash; an address in the query ignored ----
r = await today('GET', `cards?with=morning&device=${hashOf(phone.endpoint)}&endpoint=${encodeURIComponent(phone.endpoint)}`, { cookie: alex });
ok(r.s === 200 && ['weather', 'chat', 'fitness', 'markets'].every((k) => typeof r.j.cards?.[k]?.state === 'string') && typeof r.j.at === 'number' && r.j.tz === 'Europe/London',
  'the four cards, each with its state', `${r.s} ${JSON.stringify(r.j).slice(0, 300)}`);
ok(r.j.morning && shapeOk(r.j.morning) && r.j.morning.thisDevice === true && r.j.morning.devices === 1, 'and the Morning section with them: this device is one it goes to', JSON.stringify(r.j.morning).slice(0, 300));
r = await today('GET', `cards?with=morning&endpoint=${encodeURIComponent(phone.endpoint)}`, { cookie: alex });
ok(r.j.morning?.thisDevice === null, 'a device named only by its address: not looked at (no device said)', JSON.stringify(r.j.morning?.thisDevice));
r = await today('GET', 'cards?only=weather,nope&with=morning', { cookie: alex });
ok(r.s === 200 && Object.keys(r.j.cards || {}).join() === 'weather' && !('morning' in r.j), 'only those asked for, and no Morning section with them', JSON.stringify(Object.keys(r.j)));

// ---- 9. "Show it on this phone": sent at once, and the Morning section's "this morning's" as it was ----
const before = rows(`SELECT m_sent, m_last FROM td_prefs WHERE user_id = '${ids.alexphone}'`)[0];
const kindBefore = (await today('GET', 'morning', { cookie: alex })).j.preview?.kind ?? null;
r = await today('POST', 'morning/try', { cookie: alex, body: { endpoint: 'https://fcm.googleapis.com/fcm/send/someone-else' } });
ok(r.s === 400 && r.j.error === 'Turn the morning notification on on this device first.', 'to a device it isn’t on: refused', `${r.s} ${JSON.stringify(r.j)}`);
r = await today('POST', 'morning/try', { cookie: alex, body: { endpoint: phone.endpoint } });
ok(r.s === 200 && r.j.sent === 1, 'to this device: sent', `${r.s} ${JSON.stringify(r.j)}`);
const after = rows(`SELECT m_sent, m_last FROM td_prefs WHERE user_id = '${ids.alexphone}'`)[0];
const kindAfter = (await today('GET', 'morning', { cookie: alex })).j.preview?.kind ?? null;
ok(JSON.stringify(before) === JSON.stringify(after) && kindBefore === kindAfter, 'and never counted as the day’s (m_sent, m_last and the preview as they were)', JSON.stringify([before, after, kindBefore, kindAfter]));

// ---- 10. Moved by the browser; taken off; re-added by another account, it's theirs ----
const renewed = await device('alex-renewed');
r = await today('POST', 'push-move', { cookie: alex, body: { sub: renewed, was: phone.endpoint } });
ok(r.s === 200 && r.j.moved === true, 'renewed by the browser: moved', JSON.stringify(r.j));
const sam = await signup('Sam Lee', 'samlee', 'sam@example.com');
Object.assign(ids, Object.fromEntries(rows("SELECT id, handle FROM pg_users").map((x) => [x.handle, x.id])));
r = await today('POST', 'push-move', { cookie: sam, body: { sub: await device('sam'), was: renewed.endpoint } });
ok(r.s === 200 && r.j.moved === false, 'another account can’t move it', JSON.stringify(r.j));
r = await today('DELETE', 'push', { cookie: sam, body: { endpoint: renewed.endpoint } });
ok(r.s === 200 && rows(`SELECT user_id FROM td_push WHERE endpoint = '${renewed.endpoint}'`)[0]?.user_id === ids.alexphone, 'nor take it off', JSON.stringify(r.j));
r = await today('POST', 'push', { cookie: sam, body: { sub: renewed } });
const moved = rows(`SELECT user_id, fails FROM td_push WHERE endpoint = '${renewed.endpoint}'`)[0];
ok(r.s === 200 && moved?.user_id === ids.samlee && moved.fails === 0, 'the same browser, signed in as someone else, turning it on: it’s theirs now', JSON.stringify(moved));
r = await today('DELETE', 'push', { cookie: sam, body: { endpoint: renewed.endpoint } });
ok(r.s === 200 && r.j.devices === 0, 'taken off', JSON.stringify(r.j));
await today('POST', 'push', { cookie: alex, body: { sub: phone } });

// ---- 11. Its version, for the account's About sheet: asked only then, and never holding the account's page up ----
r = await page('GET', 'apps/today-build', { cookie: alex });
ok(r.s === 200 && 'build' in r.j && r.j.build === null && r.ms < 2600, 'GET apps/today-build: null under tests (nothing at ifl.test/version), within two seconds', `${r.s} ${JSON.stringify(r.j)} ${r.ms} ms`);
r = await page('GET', 'apps/today-build', {});
ok(r.s === 401, '…signed in only', `${r.s}`);
r = await page('GET', 'me', { cookie: alex });
ok(r.s === 200 && r.j.apps?.today && !('build' in r.j.apps.today) && JSON.stringify(r.j.apps.today.order) === JSON.stringify(['markets', 'weather', 'chat', 'fitness']) && r.j.apps.today.morning?.on === true && r.j.apps.today.morning.at === 455,
  'the account’s page: Today’s cards and morning, never its version', JSON.stringify(r.j.apps?.today));

// ---- 12. The account's page, from Today: a code good once, for a minute ----
r = await today('POST', 'account-link', { cookie: alex, body: {} });
ok(r.s === 200 && /^[A-Za-z0-9_-]{32}$/.test(r.j.code || ''), 'a code for the account’s page', JSON.stringify(r.j));
const who = await page('POST', 'handoff/who', { body: { code: r.j.code } });
ok(who.s === 200 && who.j.handle === 'alexphone', 'which says whose it is there', `${who.s} ${JSON.stringify(who.j)}`);

// ---- 13. Photos: your own (the header's), and a friend's, as Chat would show them; never a stranger's, or across a block ----
ok(await putPhoto(alex) === 200 && await putPhoto(sam) === 200, 'photos set on the account’s page');
r = await today('GET', `avatar?id=${ids.alexphone}&v=1`, { cookie: alex });
ok(r.s === 200 && /^image\/jpeg/.test(r.type) && r.raw.length === JPEG.length, 'your own photo, through today/avatar (never me/photo)', `${r.s} ${r.type} ${r.raw.length}`);
r = await today('GET', 'me', { cookie: alex });
ok(typeof r.j.user?.photoAt === 'number', 'and the session view says when it was set', JSON.stringify(r.j.user));
r = await today('GET', `avatar?id=${ids.samlee}`, { cookie: alex });
ok(r.s === 404, 'someone who isn’t a friend: no picture', `${r.s}`);
sql(`INSERT INTO pg_links (a, b, status, created_at) VALUES ('${ids.alexphone}', '${ids.samlee}', 'ok', ${Date.now()})`);
r = await today('GET', `avatar?id=${ids.samlee}`, { cookie: alex });
ok(r.s === 200 && /^image\/jpeg/.test(r.type), 'a friend’s', `${r.s} ${r.type}`);
sql(`DELETE FROM pg_links WHERE a = '${ids.alexphone}' AND b = '${ids.samlee}'`);
sql(`INSERT INTO pg_links (a, b, status, created_at) VALUES ('${ids.samlee}', '${ids.alexphone}', 'blocked', ${Date.now()})`);
sql(`INSERT INTO pg_group_members (group_id, user_id, added_by, joined_at) VALUES ('g-today', '${ids.alexphone}', '${ids.alexphone}', 0), ('g-today', '${ids.samlee}', '${ids.alexphone}', 0)`);
r = await today('GET', `avatar?id=${ids.samlee}`, { cookie: alex });
ok(r.s === 404, 'someone who’s blocked you, even in a group with you: no picture', `${r.s}`);
r = await today('GET', 'avatar?id=../../x', { cookie: alex });
ok(r.s === 404, 'an id that isn’t one: no picture', `${r.s}`);

// ---- 14. The account's Notifications page: Today's folder, from the same row ----
r = await page('GET', 'notify', { cookie: alex });
ok(r.s === 200 && r.j.today?.on === true && r.j.today.at === 455 && r.j.today.devices === 1 && r.j.today.lines?.markets === false && r.j.today.lines.weather === true, 'Notifications: Today’s on, its time, its device, its lines', JSON.stringify(r.j.today));
ok(r.j.weather?.on === 0, '(Weather on no device: its briefing isn’t replaced)', `${r.j.weather?.on}`);
r = await page('PATCH', 'notify', { cookie: alex, body: { today: { at: 425 } } });
ok(r.s === 200 && r.j.today?.at === 425, '…its time changed there', JSON.stringify(r.j.today));
r = await page('PATCH', 'notify', { cookie: alex, body: { today: { on: false } } });
ok(r.s === 200 && r.j.today?.on === false && r.j.today.at === 425, '…turned off there', JSON.stringify(r.j.today));
r = await page('PATCH', 'notify', { cookie: alex, body: { today: { at: 7 } } });
ok(r.s === 400 && r.j.error === 'Choose a time.', '…a time not on the five minutes: refused', `${r.s} ${JSON.stringify(r.j)}`);
r = await page('PATCH', 'notify', { cookie: alex, body: { today: 'on' } });
ok(r.s === 400, '…nor anything but its settings', `${r.s}`);
r = await today('GET', 'morning', { cookie: alex });
ok(r.j.on === false && r.j.at === 425, 'and Today’s Morning section says the same', JSON.stringify([r.j.on, r.j.at]));
r = await page('PATCH', 'notify', { cookie: sam, body: { today: { on: true, tz: 'America/New_York' } } });
ok(r.s === 200 && r.j.today?.on === true && r.j.today.at === 420 && r.j.today.devices === 0, 'turned on in Account, first time, nothing else set: 07:00, on no device yet', JSON.stringify(r.j.today));
ok(rows(`SELECT m_tz FROM td_prefs WHERE user_id = '${ids.samlee}'`)[0]?.m_tz === 'America/New_York', '…with that browser’s zone', '');
await today('PUT', 'morning', { cookie: alex, body: { on: true } });

// ---- 15. Your data: Today's, and the days Fitness keeps for it ----
let x = await page('POST', 'export', { cookie: alex, body: {} });
sql(`INSERT OR REPLACE INTO fx_today (user_id, tz, units, days, at) VALUES ('${ids.alexphone}', 'Europe/London', 'metric', '{\\"2026-11-02\\":{\\"state\\":\\"rest\\",\\"why\\":\\"\\"}}', 1793559720000)`);
x = await page('POST', 'export', { cookie: alex, body: {} });
ok(x.s === 200 && x.j.today && JSON.stringify(x.j.today.cards) === JSON.stringify({ order: ['markets', 'weather', 'chat', 'fitness'], hidden: ['chat'] }) && x.j.today.morning?.on === true && x.j.today.morning.at === '07:05'
  && x.j.today.morning.timeZone === 'Europe/London' && x.j.today.morning.lines?.markets === false && x.j.today.morning.lastSent === null && x.j.today.devices === 1, 'the export has Today’s', `${x.s} ${JSON.stringify(x.j.today)}`);
ok(x.j.fitness?.upcoming && x.j.fitness.upcoming.timeZone === 'Europe/London' && x.j.fitness.upcoming.updatedAt === new Date(1793559720000).toISOString() && x.j.fitness.upcoming.days?.['2026-11-02']?.state === 'rest',
  '…and the days Fitness keeps for Today', JSON.stringify(x.j.fitness?.upcoming));

// ---- 16. Signing out from Today ends the sign-in, and the devices it turned the morning on on ----
const hsDev = await device('home-screen');
await today('POST', 'push', { cookie: homeScreen, body: { sub: hsDev } });
r = await today('POST', 'signout', { origin: 'http://chat.ifl.test:8788', cookie: homeScreen, body: {} });
ok(r.s === 403, 'from another page: refused', `${r.s}`);
r = await today('POST', 'signout', { cookie: homeScreen, body: {} });
ok(r.s === 200 && /Max-Age=0/.test(r.set || ''), 'from Today: signed out, and the cookie cleared', `${r.s} ${r.set}`);
ok(rows(`SELECT COUNT(*) AS n FROM td_push WHERE endpoint = '${hsDev.endpoint}'`)[0]?.n === 0 && rows(`SELECT COUNT(*) AS n FROM td_push WHERE endpoint = '${phone.endpoint}'`)[0]?.n === 1,
  'that sign-in’s device went with it; the other sign-in’s stayed', '');
r = await today('GET', 'me', { cookie: homeScreen });
ok(r.j.signedIn === false, 'that sign-in has ended', JSON.stringify(r.j).slice(0, 80));
r = await today('GET', 'me', { cookie: alex });
ok(r.j.signedIn === true, 'the browser’s own carries on', '');

// ---- 17. The account deleted: what Today kept goes with it ----
const del = await page('POST', 'delete', { cookie: alex, body: { confirm: 'alexphone' } });
ok(del.s === 200, 'deleting the account', `${del.s} ${JSON.stringify(del.j)}`);
sql(`UPDATE pg_users SET delete_at = ${Date.now() - 1000} WHERE id = '${ids.alexphone}'`); sql("UPDATE pg_meta SET v = '0' WHERE k = 'keep_at'");
await ask('POST', '/api/pigeon/notify-tick', { host: 'chat.ifl.test:8788' }).catch(() => null);
await new Promise((done) => { const q = http.request({ host: '127.0.0.1', port: 8788, path: '/api/pigeon/notify-tick', method: 'POST', agent: false, headers: { Host: 'chat.ifl.test:8788', Authorization: 'Bearer tick-test-secret' } }, (res) => { res.resume(); res.on('end', done); }); q.on('error', done); q.end(); });
const left = rows(`SELECT (SELECT COUNT(*) FROM pg_users WHERE id = '${ids.alexphone}') AS u, (SELECT COUNT(*) FROM td_prefs WHERE user_id = '${ids.alexphone}') AS p, (SELECT COUNT(*) FROM td_push WHERE user_id = '${ids.alexphone}') AS d`)[0];
ok(left && left.u === 0 && left.p === 0 && left.d === 0, 'gone, and Today’s rows with it', JSON.stringify(left));

console.log(`FAILS ${fails}`);
process.exit(0);
