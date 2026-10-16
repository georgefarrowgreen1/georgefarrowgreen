// InFlight Live: the desktop tracker, and everything it must never show.
import { kit } from './lib.mjs';
import { chromium } from 'playwright';
const [,, S, out] = process.argv;
const K = await kit(S, out);
const { ok, sql, api, sess } = K;
const T = await import(process.env.APP_ROOT + '/functions/_tracker.js');
const { haversineKm } = await import(process.env.APP_ROOT + '/functions/_pigeon.js');
const now = Date.now(), H = 3600e3;

// ---- the rules, one flight at a time ----
const fl = (o) => ({ from_lat: 51.5, from_lon: -0.12, to_lat: 40.7, to_lon: -74, sent_at: now - 10 * H, deliver_at: now + 60 * H, lost_at: null, legs: null, pigeon: 'standard', mystery: null, ...o });
let v = T.trackerView(fl({}), now);
ok(v && Object.keys(v).sort().join() === 'h,k,lat,lon,over,tr', 'a pigeon mid-Atlantic shows: only rough place, heading, kind, what it’s over', JSON.stringify(v));
ok(v && v.lat % 0.5 === 0 && v.lon % 0.5 === 0, 'snapped to a half-degree grid');
ok(!T.trackerView(fl({ sent_at: now - 0.5 * H }), now), 'just after take-off (near home): hidden');
ok(!T.trackerView(fl({ sent_at: now - 69.5 * H, deliver_at: now + 0.5 * H }), now), 'just before landing: hidden');
ok(!T.trackerView(fl({ to_lat: 50.8, to_lon: -1.1, sent_at: now - H, deliver_at: now + H }), now), 'a short flight: never shown');
ok(!T.trackerView(fl({ lost_at: now - 1000 }), now), 'a lost pigeon: gone');
ok(!T.trackerView(fl({ sent_at: now + H }), now), 'a scheduled one not yet off: not shown');
const rest = JSON.stringify([[48, -30, now - H], [48, -30, now + H]]);
ok(!T.trackerView(fl({ legs: rest }), now), 'resting at a stop: hidden');
ok(!T.trackerView(fl({ legs: JSON.stringify([[48, -30, now - 2 * H], [48, -30, now - 1.9 * H]]), sent_at: now - 30 * H }), now - 1.95 * H), 'near a stop where it rests: hidden');
ok(T.trackerView(fl({ mystery: 1, pigeon: 'rocket' }), now)?.k === 'mystery', 'a mystery pigeon stays a mystery');
const early = T.trackerView(fl({ sent_at: now - 5.2 * H }), now);
ok(early && early.tr.every((q) => haversineKm(q[0], q[1], 51.5, -0.12) >= 400 - 40), 'a trail stops before it gets near home', JSON.stringify(early?.tr));

// ---- people ----
const G = await K.phone('george'), M = await K.phone('mira'), R = await K.phone('reuben');
await K.signup(G, 'George Farrow-Green', 'geo', 'george@example.com', 'Norwich');
await K.signup(M, 'Mira Okafor', 'mira', 'mira@example.com', 'New York');
await K.signup(R, 'Reuben Tan', 'roobs', 'reuben@example.com', 'Paris');
const [gs, ms, rs] = [await sess(G), await sess(M), await sess(R)];
// Reuben keeps his pigeons off the tracker
const [st] = await api(rs.token, 'me', undefined).then(() => [0]);
await fetch(K.BASE + '/api/pigeon/me', { method: 'PATCH', headers: { Authorization: 'Bearer ' + rs.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ shareTracker: false }) });
ok(/"hide_tracker": 1/.test(sql(`SELECT hide_tracker FROM pg_users WHERE handle = 'roobs'`)), 'Live Tracker switch off is saved');

// ---- a busy sky: pigeons between real cities ----
const C = [[51.51, -0.13], [48.86, 2.35], [40.71, -74.01], [35.68, 139.69], [-33.87, 151.21], [-33.92, 18.42], [-22.91, -43.17], [55.76, 37.62], [28.61, 77.21], [30.04, 31.24],
  [6.52, 3.38], [34.05, -118.24], [19.43, -99.13], [-34.6, -58.38], [39.9, 116.4], [1.35, 103.82], [25.2, 55.27], [64.15, -21.94], [43.65, -79.38], [-1.29, 36.82], [37.57, 126.98], [41.01, 28.98], [52.52, 13.4], [59.33, 18.07], [-37.81, 144.96]];
const SP = { standard: 80, swift: 160, turbo: 240, rocket: 720 }, kinds = ['standard', 'standard', 'standard', 'swift', 'swift', 'turbo', 'rocket'];
let rnd = 7; const r = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
const seeded = [], rows = [];
for (let i = 0; i < 90; i++) {
  const a = C[Math.floor(r() * C.length)]; let b = C[Math.floor(r() * C.length)]; if (a === b) continue;
  const k = kinds[Math.floor(r() * kinds.length)], km = haversineKm(a[0], a[1], b[0], b[1]), dur = Math.min(72, km / SP[k]) * H;
  const sent = Math.round(now - dur * (0.08 + r() * 0.84)), off = i % 9 === 0;
  const [s, t] = off ? [gs.me.id, rs.me.id] : i % 2 ? [gs.me.id, ms.me.id] : [ms.me.id, gs.me.id];
  rows.push(`('t${i}-${now}', '${s}', '${t}', 'x', ${km.toFixed(1)}, ${sent}, ${Math.round(sent + dur)}, ${a[0]}, ${a[1]}, ${b[0]}, ${b[1]}, '${k}', ${k === 'rocket' && i % 2 ? 1 : 'NULL'})`);
  seeded.push({ a, b, off, km });
}
sql(`INSERT INTO pg_msgs (id, sender, recipient, ct, km, sent_at, deliver_at, from_lat, from_lon, to_lat, to_lon, pigeon, mystery) VALUES ${rows.join(', ')}`);
// landed today: five that count, two to Reuben (kept private) and one lost, which don't
const landedRow = (i, s, t, lost) => `('l${i}-${now}', '${s}', '${t}', 'x', 344, ${now - 2 * H}, ${now - 60e3}, 51.51, -0.13, 48.86, 2.35, 'swift', NULL, ${lost ? now - 30 * 60e3 : 'NULL'})`;
sql(`INSERT INTO pg_msgs (id, sender, recipient, ct, km, sent_at, deliver_at, from_lat, from_lon, to_lat, to_lon, pigeon, mystery, lost_at) VALUES ${[0, 1, 2, 3, 4].map((i) => landedRow(i, gs.me.id, ms.me.id)).join(', ')}, ${landedRow(5, gs.me.id, rs.me.id)}, ${landedRow(6, gs.me.id, rs.me.id)}, ${landedRow(7, ms.me.id, gs.me.id, true)}`);

// ---- the endpoint ----
const res = await fetch(K.BASE + '/api/pigeon/tracker?bust=' + Math.random(), { headers: { Cookie: 'x=y' } });
const body = await res.json();
ok(res.status === 200 && Object.keys(body).sort().join() === 'at,inAir,moon,pigeons,today' && Number.isInteger(body.moon), 'the answer: a time, counts (in the air, and out by the Moon), dots and today’s totals, nothing else', Object.keys(body).join());
const { isSea } = await import(process.env.APP_ROOT + '/functions/_passport.js');
ok(Object.keys(body.today).sort().join() === 'km,landed,seas' && body.today.landed === 5, 'today: landed counts only pigeons both ends share (not Reuben’s, not a lost one)', JSON.stringify({ ...body.today, seas: body.today.seas.length }));
ok(body.today.km > 1000 && body.today.km % 10 === 0, 'today: distance flown, rounded', String(body.today.km));
ok(body.today.seas.length > 2 && body.today.seas.every(isSea) && body.today.seas.includes('the North Atlantic'), 'today: the seas crossed (seas only, no countries)', body.today.seas.join(', '));
ok(body.pigeons.every((p) => Object.keys(p).sort().join() === 'h,k,lat,lon,over,tr'), 'every dot: lat, lon, heading, kind, over, trail: no ids, names or times');
const pts = body.pigeons.flatMap((p) => p.tr);
ok(pts.length > 20 && pts.every((q) => q.length === 2 && q[0] % 0.5 === 0 && q[1] % 0.5 === 0), 'trails: snapped points only', String(pts.length));
ok(body.pigeons.every((p) => p.tr.every((q) => haversineKm(p.lat, p.lon, q[0], q[1]) <= T.TRAIL_KM + 80)), 'trails: never more than 600 km back');
ok(!res.headers.get('set-cookie') && /public, max-age=60/.test(res.headers.get('cache-control')), 'no cookies; one answer a minute for everyone', res.headers.get('cache-control'));
const raw = JSON.stringify(body);
ok(!/\b(geo|mira|roobs|George|Mira|Reuben|Norwich|New York|Paris)\b|@example/.test(raw), 'no names, handles, emails or home places anywhere in it');
ok(body.at % 60000 === 0, 'its time is only to the minute');
const near = body.pigeons.flatMap((p) => [[p.lat, p.lon], ...p.tr]).filter(([la, lo]) => seeded.some((s) => haversineKm(la, lo, s.a[0], s.a[1]) < 110 || haversineKm(la, lo, s.b[0], s.b[1]) < 110));
ok(near.length === 0, 'no dot, and no point of any trail, near a city a pigeon set off from or is flying to', JSON.stringify(near.slice(0, 3)));
const inAir = seeded.length, offs = seeded.filter((s) => s.off).length;
ok(body.inAir >= inAir && body.pigeons.length <= inAir - offs, `opted-out pigeons aren’t drawn (${body.pigeons.length} shown of ${body.inAir}, ${offs} kept private)`);
const again = await fetch(K.BASE + '/api/pigeon/tracker?other=1').then((x) => x.json());
ok(again.at === body.at && again.pigeons.length === body.pigeons.length, 'asking again (any query) gets the same snapshot');
// shuffled: the same set, no stable order to link
console.log('shown', body.pigeons.length, 'of', body.inAir);

// ---- the page, on a computer ----
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const dctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const d = await dctx.newPage(); const errs = [], reqs = [];
d.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); d.on('pageerror', (e) => errs.push(String(e)));
d.on('request', (q) => reqs.push(q.url()));
await d.goto('http://chat.localhost:8788/tracker');
ok(await d.waitForFunction(() => /\d/.test(document.querySelector('.tk-n')?.textContent || ''), null, { timeout: 15000 }).then(() => true, () => false), 'desktop: the tracker loads and counts');
await d.waitForTimeout(1500);
await d.screenshot({ path: `${out}/tracker.png` });
ok(await d.isVisible('.tk-today') && /^\d/.test(await d.locator('.tk-landed').innerText()) && / mi$/.test(await d.locator('.tk-flown').innerText()), 'the Today strip shows landed, flown and seas', (await d.locator('.tk-today').innerText()).replace(/\s+/g, ' '));
ok(reqs.every((u) => /^http:\/\/chat\.localhost:8788\//.test(u)), 'it loads nothing from anywhere else', reqs.filter((u) => !/chat\.localhost/.test(u)).join());
ok(!errs.length, 'no errors (CSP included)', errs.join(' | '));
// hover the biggest cluster
const spot = await d.evaluate(() => { const c = document.querySelector('.tk-map'); return [c.clientWidth, c.clientHeight]; });
let hit = false;
for (let y = 120; y < spot[1] - 60 && !hit; y += 6) for (let x = 380; x < spot[0] - 20 && !hit; x += 6) {
  await d.mouse.move(x, y); if (await d.isVisible('.tk-tip')) hit = true;
  if (x % 60 === 0 && y % 30 !== 0) x += 0;
}
if (hit) { await d.waitForTimeout(200); await d.screenshot({ path: `${out}/tracker-hover.png` }); }
await d.click('.tk-zoom [data-z=reset]'); await d.mouse.move(5, 5); await d.waitForTimeout(400); await d.screenshot({ path: `${out}/tracker-world.png` });
ok(hit && /pigeon/.test(await d.locator('.tk-tip').innerText()) && /Over /.test(await d.locator('.tk-tip').innerText()), 'hovering a dot: kind, what it’s over, heading', hit ? await d.locator('.tk-tip').innerText() : 'no dot found');
// on a phone: a note instead
const pctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
const ph = await pctx.newPage(); await ph.goto('http://chat.localhost:8788/tracker'); await ph.waitForTimeout(800);
ok(await ph.isVisible('.tk-phone') && !(await ph.isVisible('.tk-map')), 'on a phone: made for bigger screens');
await ph.screenshot({ path: `${out}/tracker-phone.png` });
// the app's switch
await G.p.click('[data-act=tab][data-id=account]'); await G.p.waitForTimeout(500);
await G.p.click('#screen > main.view [data-act=securitysheet]'); await G.p.waitForSelector('.sheet [data-id=shareTracker]');
await G.p.locator('.sheet [data-id=shareTracker]').scrollIntoViewIfNeeded(); await G.p.waitForTimeout(400);
await G.p.screenshot({ path: `${out}/tracker-switch.png` });
ok(await G.p.getAttribute('.sheet [data-id=shareTracker]', 'aria-checked') === 'true', 'Privacy & Security has the Live Tracker switch, on');
// the computer page links to it
const cctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const cp = await cctx.newPage(); await cp.goto('http://chat.localhost:8788/');
ok(await cp.isVisible('.na-live') && (await cp.getAttribute('.na-live', 'href')) === '/tracker', 'the "not on a computer" page links to InFlight Live');
await cp.screenshot({ path: `${out}/tracker-na.png` });
console.log(`FAILS ${K.fails()}`);
process.exit(0);
