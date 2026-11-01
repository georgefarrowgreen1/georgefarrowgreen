// Fitness's coming days for InFlite Today (functions/_fittoday.js): POST /api/fitness/today, at Fitness's own address
// (fitness.ifl.test) only, from Fitness's own page, signed in, within its limits, each part made safe (a bad zone, too many
// days or steps, too big: refused). Then Fitness itself, opened signed in: with no plan at all it sends eight days with
// nothing planned; with a Rhythm plan that starts next Monday, the days before it as nothing planned and the rest as
// Rhythm has them (sessions with their steps, rest days); opened again with nothing changed, it sends nothing more; a wet
// week's forecast come in after (no change through keep), sent again where it moves the plan, as Fitness itself then has
// it; signed out, nothing. Each checked in fx_today. (The site's addresses stood in for by ifl.test.)
import { chromium } from 'playwright';
import http from 'node:http';
import { execSync } from 'node:child_process';
import { acctCall } from './handback.mjs';

const [,, S, out] = process.argv;
const FIT = 'http://fitness.ifl.test:8788';
const sql0 = (q) => execSync(`${S}/wr/node_modules/.bin/wrangler d1 execute bio-db --local --persist-to ${S}/wrstate --command "${q}"`, { cwd: process.env.APP_ROOT, stdio: 'pipe' }).toString();
const sql = (q) => { for (let i = 0; ; i++) { try { return sql0(q); } catch (e) { if (i > 5 || !/SQLITE_BUSY/.test(String(e.stdout) + String(e.stderr) + e.message)) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400); } } };
const rows = (q) => { const o = sql(q), m = o.match(/"results": (\[[\s\S]*?\])\s*,\s*"success"/); return m ? JSON.parse(m[1]) : []; };
let fails = 0; const errs = [], pages = [];
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${extra !== '' ? '  — ' + extra : ''}`); if (!c) fails++; };
process.on('uncaughtException', async (e) => { console.log(`FAIL  ${e.message.split('\n')[0]}`); console.log(String(e.stack).split('\n').slice(0, 6).join('\n')); for (const p of pages) await p.screenshot({ path: `${out}/failed-${pages.indexOf(p)}.png` }).catch(() => {}); console.log(`FAILS ${fails + 1}`); process.exit(1); });
const b64u = (u) => Buffer.from(u).toString('base64url');
const rnd = (n) => crypto.getRandomValues(new Uint8Array(n));

// (a request to Fitness's address as its page makes it: the site's cookie, and its own Origin unless said otherwise)
function fit(method, path, { cookie, origin = FIT, body, raw, host = 'fitness.ifl.test:8788' } = {}) {
  const data = raw ?? (body !== undefined ? JSON.stringify(body) : '');
  return new Promise((done, no) => {
    const q = http.request({ host: '127.0.0.1', port: 8788, path: '/api/fitness/' + path, method, agent: false, headers: { Host: host,
      ...(origin ? { Origin: origin } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) } }, (res) => {
      const parts = []; res.on('data', (c) => parts.push(c));
      res.on('end', () => { let j = {}; try { j = JSON.parse(Buffer.concat(parts).toString()); } catch (_) {} done({ s: res.statusCode, j }); });
    });
    q.on('error', no); q.end(data);
  });
}
async function signup(name, handle, email) {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']), pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const r = await acctCall('signup', { name, handle, email, salt: b64u(rnd(16)), proof: b64u(rnd(32)), vault: 'x'.repeat(40), pub: { kty: 'EC', crv: 'P-256', x: pub.x, y: pub.y } },
    { ip: '10.0.7.' + (handle.length + 20) });
  if (r.s !== 201 || !r.cookie) throw new Error(`signup ${handle}: ${r.s} ${JSON.stringify(r.j)}`);
  return r.cookie;
}
const idOf = (h) => rows(`SELECT id FROM pg_users WHERE handle = '${h}'`)[0]?.id;
// (none, before its table's made: the first one kept makes it)
const kept = (id) => { let r; try { r = rows(`SELECT tz, units, days, at FROM fx_today WHERE user_id = '${id}'`)[0]; } catch (e) { if (/no such table/.test(String(e.stderr) + String(e.stdout))) return null; throw e; } return r ? { ...r, days: JSON.parse(r.days) } : null; };

// ---- 1. The route: at Fitness's address, from its page, signed in; each part made safe ----
const sam = await signup('Sam Rider', 'samrider', 'samrider@example.com'), samId = idOf('samrider');
const good = { tz: 'Europe/London', units: 'metric', days: { '2026-11-02': { state: 'session', id: 'rh:tempo:60', sport: 'ride', name: 'Tempo 2 × 15', kind: 'Tempo', secs: 3600, tss: 62, hard: true, why: 'A good day for some tempo.', steps: [[600, 0.5, 0.75], [900, 0.88, 0.88]] },
  '2026-11-03': { state: 'rest', why: 'Let it sink in' }, '2026-11-04': { state: 'none' } } };
let r = await fit('POST', 'today', { body: good });
ok(r.s === 401, 'signed out: refused', `${r.s} ${JSON.stringify(r.j)}`);
r = await fit('POST', 'today', { cookie: sam, origin: 'http://chat.ifl.test:8788', body: good });
ok(r.s === 403, 'from another app’s page: refused', `${r.s}`);
r = await fit('POST', 'today', { cookie: sam, origin: null, body: good });
ok(r.s === 403, 'from no page at all: refused', `${r.s}`);
r = await fit('POST', 'today', { cookie: sam, body: good, host: 'localhost:8788', origin: 'http://localhost:8788' });
ok(r.s === 404, 'at another address than Fitness’s: not there', `${r.s}`);
ok(kept(samId) === null, 'and nothing kept by any of those');
const refuse = async (b, label, status = 400) => { const x = await fit('POST', 'today', { cookie: sam, ...(typeof b === 'string' ? { raw: b } : { body: b }) }); ok(x.s === status && (status !== 400 || x.j.error === 'Bad request.'), label, `${x.s} ${JSON.stringify(x.j)}`); };
await refuse({ ...good, tz: 'Mars/Olympus' }, 'a zone that isn’t one: 400');
await refuse({ ...good, tz: '+01:00' }, 'an offset for a zone: 400');
await refuse({ ...good, units: 'furlongs' }, 'units that aren’t metric or imperial: 400');
await refuse({ ...good, days: Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`2026-11-${String(i + 1).padStart(2, '0')}`, { state: 'none' }])) }, 'eleven days: 400');
await refuse({ ...good, days: { 'next tuesday': { state: 'none' } } }, 'a day that isn’t a date: 400');
await refuse({ ...good, days: { '2026-11-02': { ...good.days['2026-11-02'], steps: Array.from({ length: 81 }, () => [60, 0.5, 0.5]) } } }, '81 steps: 400');
await refuse('{"tz": "Europe/London", ', 'not JSON: 400');
await refuse('[1, 2]', 'a list: 400');
await refuse({ ...good, pad: 'p'.repeat(33 * 1024) }, 'over 32 KB: refused, too big', 413);
ok(kept(samId) === null, 'nothing kept by any of those either');
const dirty = structuredClone(good);
dirty.days['2026-11-02'].name = 'Tempo\u0000\u0007 2 × 15'; dirty.days['2026-11-02'].sport = 'kayak'; dirty.days['2026-11-02'].secs = 999999; dirty.days['2026-11-02'].steps.push([0, 9, -2]);
dirty.days['2026-11-05'] = { state: 'race' };
r = await fit('POST', 'today', { cookie: sam, body: dirty });
const k1 = kept(samId);
ok(r.s === 200 && r.j.ok === true && Number.isFinite(r.j.at) && k1?.at === r.j.at, 'a good one: kept, with when', `${r.s} ${JSON.stringify(r.j)}`);
ok(k1?.tz === 'Europe/London' && k1.units === 'metric' && JSON.stringify(Object.keys(k1.days)) === JSON.stringify(['2026-11-02', '2026-11-03', '2026-11-04']), 'its zone, units and days (a day of no known kind left out)', JSON.stringify(k1));
const d1 = k1?.days['2026-11-02'];
ok(d1?.name === 'Tempo 2 × 15' && d1.sport === 'ride' && d1.secs === 86400 && JSON.stringify(d1.steps) === '[[600,0.5,0.75],[900,0.88,0.88],[1,5,0]]' && d1.hard === true,
  'made safe as it’s kept: control characters out, a sport Fitness has, figures within bounds', JSON.stringify(d1));
ok(JSON.stringify(k1?.days['2026-11-03']) === '{"state":"rest","why":"Let it sink in"}' && JSON.stringify(k1?.days['2026-11-04']) === '{"state":"none"}', 'a rest day and a day with nothing planned, as sent');
r = await fit('POST', 'today', { cookie: sam, body: { tz: 'America/New_York', units: 'imperial', days: { '2026-11-02': { state: 'event', name: 'Dragon Ride' } } } });
ok(r.s === 200 && kept(samId)?.tz === 'America/New_York' && kept(samId)?.days['2026-11-02']?.name === 'Dragon Ride' && rows(`SELECT COUNT(*) AS n FROM fx_today WHERE user_id = '${samId}'`)[0]?.n === 1,
  'another in its place: one row an account', JSON.stringify(kept(samId)));
// (120 an hour: the next refused, before its body's read)
const lee = await signup('Lee Limit', 'leelimit', 'leelimit@example.com');
let last = null, refusedAt = null;
for (let i = 1; i <= 121 && !refusedAt; i++) { last = await fit('POST', 'today', { cookie: lee, raw: '{}' }); if (last.s === 429) refusedAt = i; }
ok(refusedAt === 121, '120 an hour, then refused', `refused at ${refusedAt} (${last?.s} ${JSON.stringify(last?.j)})`);

// ---- 2. Fitness, opened signed in, sends the days itself ----
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined,
  args: ['--host-resolver-rules=MAP *.ifl.test 127.0.0.1, MAP ifl.test 127.0.0.1', `--unsafely-treat-insecure-origin-as-secure=${FIT}`] });
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
async function phone(cookie) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-GB', timezoneId: 'Europe/London', isMobile: true, hasTouch: true, userAgent: IPHONE });
  // (the site's cookie, for every address on it, as the account's page gives it: so the one Fitness renews it with takes its place)
  if (cookie) { const [name, ...v] = cookie.split('='); await ctx.addCookies([{ name, value: v.join('='), domain: '.ifl.test', path: '/', httpOnly: true, sameSite: 'Lax' }]); }
  // (the day's check-in, asked as the app opens, as if asked already today)
  await ctx.addInitScript(() => { try { const d = new Date(); d.setHours(0, 0, 0, 0); localStorage.setItem('fitness:asked', String(d.getTime())); localStorage.setItem('fitness:welcomed', 'true'); } catch (_) {} });
  const p = await ctx.newPage(); pages.push(p);
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 40[13]/.test(m.text())) errs.push(m.text()); });
  const sent = [];
  p.on('request', (q) => { if (q.method() === 'POST' && new URL(q.url()).pathname === '/api/fitness/today') sent.push(q); });
  return { ctx, p, sent };
}
// (the phone's own days, today and the next 7, and next Monday, by its clock: as Fitness counts them)
const daysOf = (p) => p.evaluate(() => {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const mon = new Date(t); mon.setDate(t.getDate() - ((t.getDay() + 6) % 7) + 7);
  return { today: t.getTime(), monday: mon.getTime(), mondayKey: key(mon), keys: Array.from({ length: 8 }, (_, i) => { const d = new Date(t); d.setDate(t.getDate() + i); return { key: key(d), dow: (d.getDay() + 6) % 7, before: d < mon }; }) };
});
const sentBy = (x, n) => x.p.waitForResponse((res) => res.request().method() === 'POST' && new URL(res.url()).pathname === '/api/fitness/today' && x.sent.length >= n, { timeout: 30000 });
const tom = await signup('Tom Plan', 'tomplan', 'tomplan@example.com'), tomId = idOf('tomplan');

// (no plan at all: eight days, each with nothing planned)
const P = await phone(tom);
let got = sentBy(P, 1);
await P.p.goto(`${FIT}/`);
let res = await got;
const sent1 = res.request().postDataJSON(), days = await daysOf(P.p);
ok(res.status() === 200 && (await res.json()).ok === true, 'Fitness sends its days by itself as it opens', `${res.status()}`);
const k2 = kept(tomId);
ok(k2 && JSON.stringify(Object.keys(k2.days)) === JSON.stringify(days.keys.map((d) => d.key)), 'today and the next 7, by the phone’s own days', JSON.stringify(k2 && Object.keys(k2.days)));
ok(k2 && Object.values(k2.days).every((d) => JSON.stringify(d) === '{"state":"none"}'), 'no plan at all: each day with nothing planned', JSON.stringify(k2?.days));
ok(k2?.tz === 'Europe/London' && k2.units === 'metric' && sent1.tz === 'Europe/London', 'with the phone’s zone, and its units', `${k2?.tz} ${k2?.units}`);
await P.p.screenshot({ path: `${out}/1-no-plan.png` });

// (a Rhythm plan, set up to start next Monday: four days a week)
const MINS = [60, 0, 60, 0, 90, 0, 120];
const put = await P.p.evaluate(async ([mins, start, at]) => {
  for (let i = 0; i < 3; i++) {
    const me = await (await fetch('/api/fitness/me', { credentials: 'same-origin' })).json();
    const data = { ...(me.data || {}), rhythm: { days: mins, run: false, swim: false, lean: 'balanced', mode: 'build', level: 'regular', start, at }, plan: null, prefs: { ...(me.data?.prefs || {}), onboarded: true } };
    const r = await fetch('/api/fitness/me', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base: me.ver, data }) });
    if (r.status !== 409) return r.status;
  }
  return 409;
}, [MINS, days.monday, days.today]);
ok(put === 200, 'a Rhythm plan kept with the account, from next Monday', String(put));
got = sentBy(P, 2);
await P.p.reload();
res = await got;
const k3 = kept(tomId), planned = days.keys.filter((d) => !d.before), sessions = planned.filter((d) => k3?.days[d.key]?.state === 'session');
ok(res.status() === 200 && JSON.stringify(Object.keys(k3?.days || {})) === JSON.stringify(days.keys.map((d) => d.key)), 'changed: sent again, the same eight days', JSON.stringify(Object.keys(k3?.days || {})));
ok(days.keys.filter((d) => d.before).every((d) => JSON.stringify(k3.days[d.key]) === '{"state":"none"}'), `the days before the plan starts (${days.mondayKey}): nothing planned`, JSON.stringify(k3?.days));
ok(planned.every((d) => ['session', 'rest'].includes(k3.days[d.key]?.state)) && planned.filter((d) => !MINS[d.dow]).every((d) => k3.days[d.key].state === 'rest'),
  'from then, each a session or a rest day, a day with no time to ride a rest day', planned.map((d) => `${d.key}:${k3?.days[d.key]?.state}`).join(' '));
const sOk = (s) => s.id && s.name && s.kind && ['ride', 'run', 'swim', 'strength'].includes(s.sport) && s.secs > 0 && s.tss >= 0 && typeof s.hard === 'boolean' && typeof s.why === 'string'
  && Array.isArray(s.steps) && (s.steps.length > 0 || s.sport === 'strength') && s.steps.length <= 80 && s.steps.every((st) => st.length === 3 && st[0] >= 1 && st[1] >= 0 && st[1] <= 5 && st[2] >= 0 && st[2] <= 5)
  && Math.abs(s.steps.reduce((a, st) => a + st[0], 0) - s.secs) <= s.steps.length;
ok(sessions.length > 0 && sessions.every((d) => sOk(k3.days[d.key])), 'each session with its name, kind, sport, length, load, why and steps ([secs, from, to], adding up to its length)',
  sessions.map((d) => { const s = k3.days[d.key]; return `${d.key} ${s.name} ${s.secs}s ${s.tss} ${s.steps.length} steps`; }).join(' | '));
ok(planned.filter((d) => k3.days[d.key]?.state === 'rest').every((d) => typeof k3.days[d.key].why === 'string' && Object.keys(k3.days[d.key]).join() === 'state,why'), 'each rest day with its why');
await P.p.screenshot({ path: `${out}/2-rhythm.png` });

// (opened again, nothing changed: nothing more sent)
const before = P.sent.length, at3 = k3.at;
await Promise.all([P.p.waitForResponse((x) => new URL(x.url()).pathname === '/api/fitness/me', { timeout: 30000 }), P.p.reload()]);
await P.p.waitForTimeout(6000);
ok(P.sent.length === before && kept(tomId)?.at === at3, 'opened again with nothing changed: nothing sent', `${P.sent.length - before} sent`);

// (the forecast come after Fitness has sent its days, with no change through keep: a wet week. What's kept is the plan
// Rhythm works out with it, as Fitness itself shows it, sent again where the rain's moved anything)
const wx = await P.p.evaluate(async () => {
  const m = await import('/app.js');
  // (the forecast asked for as Today was drawn: its answer first, so it can't come after this one)
  for (let i = 0; i < 80 && !m.S.wx; i++) await new Promise((r) => setTimeout(r, 250));
  const of = () => Array.from({ length: 8 }, (_, i) => { const d = m.addDays(m.TODAY, i), id = m.plannedOn(d); return { none: id === undefined, id: id ?? null, why: m.rhDay(d)?.why ?? '' }; });
  const was = of(), hours = [];
  for (let i = 0; i < 9; i++) for (let hr = 0; hr < 24; hr++) { const t = new Date(m.TODAY); t.setDate(t.getDate() + i); t.setHours(hr); hours.push({ t: t.getTime(), temp: 9, feels: 7, pop: 90, rain: 1.4, code: 63, wind: 14, gust: 24, dir: 220, day: hr >= 7 && hr < 17 }); }
  m.S.wx = { at: Date.now(), d: { place: { name: 'London', rough: false }, offset: -new Date().getTimezoneOffset() * 60, hours } };
  m.redraw();
  return { was, now: of() };
});
const moved = wx.now.some((d, i) => d.id !== wx.was[i].id || d.why !== wx.was[i].why), sentWet = P.sent.length;
if (moved) await sentBy(P, sentWet + 1); else await P.p.waitForTimeout(5000);
const k4 = kept(tomId), agrees = (k, n) => (n.none ? k?.state === 'none' : n.id ? k?.state === 'session' && k.id === n.id && k.why === n.why.trim().slice(0, 240) : k?.state === 'rest' && k.why === n.why.trim().slice(0, 240));
ok(moved ? P.sent.length === sentWet + 1 && k4?.at > at3 : P.sent.length === sentWet, moved ? 'a wet week come in behind the scenes, the plan moved: sent again, by itself' : 'a wet week come in behind the scenes, nothing moved in these days: nothing sent',
  `${P.sent.length - sentWet} sent; ${wx.now.map((d, i) => (d.id !== wx.was[i].id || d.why !== wx.was[i].why ? `${days.keys[i].key} ${d.id}: ${d.why}` : '')).filter(Boolean).join(' | ') || 'no day changed'}`);
ok(days.keys.every((d, i) => agrees(k4?.days[d.key], wx.now[i])), 'and what’s kept is the plan as Fitness itself now works it out, rain and all',
  days.keys.map((d, i) => `${d.key}: ${JSON.stringify({ id: k4?.days[d.key]?.id, why: k4?.days[d.key]?.why })} vs ${JSON.stringify(wx.now[i])}`).filter((_, i) => !agrees(k4?.days[days.keys[i].key], wx.now[i])).join(' | '));

// (signed out: Fitness's welcome, and nothing sent)
const O = await phone(null);
await O.p.goto(`${FIT}/`);
await O.p.waitForSelector('.welcome #sign-in', { timeout: 20000 });
await O.p.waitForTimeout(5000);
ok(O.sent.length === 0, 'signed out: nothing sent', String(O.sent.length));

ok(!errs.length, 'no errors on the pages', errs.join(' | '));
await b.close();
console.log(`FAILS ${fails}`);
process.exit(0);
