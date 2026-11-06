// How fast the apps are on people's own devices, in numbers only (functions/_vitals.js; the shared menu's VITALS sends
// them): a page's numbers kept as a count in a band, by day, app, kind of device and measure, never anything else; what
// isn't one of the few known apps, devices or measures, or is out of range, never kept; the admin's figure the 75th in a
// hundred; the route only from the page's own address; and Today's and Mail's servers pass it on, nothing kept there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { record, speed, vitalsRoute, band, bandValue, APPS, METRICS } from '../../../functions/_vitals.js';

const fakeDb = (sent) => ({
  prepare: (sql) => ({ bind: (...a) => ({ sql, a, first: async () => null, all: async () => ({ results: [] }), run: async () => ({}) }), first: async () => null, all: async () => ({ results: [] }), run: async () => ({}) }),
  batch: async (xs) => { sent.push(...xs.filter((x) => /pg_vitals/.test(x.sql))); return xs.map(() => ({ results: [] })); }, exec: async () => ({}),
});

test('bands: each a fifth wider than the last, and the number a band stands for inside it', () => {
  assert.equal(band(0), 0);
  assert.equal(band(0.5), 0);
  for (const v of [1, 7, 120, 950, 2500, 4000, 30000]) {
    const b = band(v), lo = bandValue(b) / Math.sqrt(1.2), hi = bandValue(b) * Math.sqrt(1.2);
    assert.ok(v >= lo * 0.999 && v < hi * 1.001, `${v} in its band [${lo.toFixed(1)}, ${hi.toFixed(1)})`);
  }
  assert.ok(band(1e9) <= 70, 'capped');
});

test('a page’s numbers: one upsert per measure, of day, app, device, measure and band only', async () => {
  const sent = [];
  const ok = await record({ DB: fakeDb(sent) }, { app: 'hub', dev: 'phone', m: { lcp: 1840, fcp: 900, ttfb: 210, inp: 96, cls: 0.04 } }, Date.UTC(2026, 10, 6, 12));
  assert.equal(ok, true);
  const ups = sent.filter((x) => /^INSERT INTO pg_vitals/.test(x.sql));
  assert.equal(ups.length, 5);
  for (const u of ups) assert.equal(u.a.length, 5, 'day, app, device, measure, band: nothing else');
  const cls = ups.find((u) => u.a[3] === 'cls');
  assert.equal(cls.a[4], band(40), 'cls kept as thousandths');
});

test('never kept: an unknown app, device or measure, a number out of range, or anything that isn’t one', async () => {
  const sent = [], env = { DB: fakeDb(sent) };
  assert.equal(await record(env, { app: 'fitting', dev: 'phone', m: { lcp: 100 } }), false);
  assert.equal(await record(env, { app: 'hub', dev: 'tv', m: { lcp: 100 } }), false);
  assert.equal(await record(env, { app: 'hub', dev: 'phone', m: { who: 'someone@example.com', lcp: -4, inp: 1e9, fcp: 'fast', ttfb: NaN } }), false);
  assert.equal(await record(env, null), false);
  assert.equal(sent.length, 0);
  await record(env, { app: 'weather', dev: 'computer', m: { lcp: 1200, path: '/weather/?lat=1' } });
  assert.deepEqual(sent.map((x) => x.a[3]), ['lcp'], 'only the known measures, never what else came');
  assert.ok(!APPS.includes('fitting'));
  assert.deepEqual(Object.keys(METRICS).sort(), ['cls', 'fcp', 'inp', 'lcp', 'ttfb']);
});

test('the admin’s figures: the 75th in a hundred over the days asked, and each day’s, by app and device', async () => {
  const rows = [];
  // (100 visits on day 11: 70 fast, 30 slow; so 3 in 4 beat the slow band)
  rows.push({ day: 11, app: 'hub', dev: 'phone', metric: 'lcp', b: band(1000), n: 70 }, { day: 11, app: 'hub', dev: 'phone', metric: 'lcp', b: band(5000), n: 30 });
  rows.push({ day: 12, app: 'hub', dev: 'phone', metric: 'lcp', b: band(1000), n: 10 });
  rows.push({ day: 12, app: 'hub', dev: 'phone', metric: 'cls', b: band(50), n: 3 });
  rows.push({ day: 12, app: 'nope', dev: 'phone', metric: 'lcp', b: 3, n: 3 }, { day: 9, app: 'hub', dev: 'phone', metric: 'lcp', b: band(60000), n: 999 });
  const D = { prepare: () => ({ bind: () => ({ all: async () => ({ results: rows }) }) }) };
  const s = await speed(D, 10, 12);
  assert.equal(s.rows.length, 1, 'only known apps, only the days asked');
  const lcp = s.rows[0].m.lcp;
  assert.equal(lcp.n, 110);
  assert.ok(Math.abs(lcp.p75 - 5000) / 5000 < 0.12, `3 in 4 beat the slow band: ${lcp.p75}`);
  assert.equal(lcp.days[0], null, 'a day with none: no figure');
  assert.ok(Math.abs(lcp.days[1] - 5000) / 5000 < 0.12 && Math.abs(lcp.days[2] - 1000) / 1000 < 0.12, JSON.stringify(lcp.days));
  assert.ok(Math.abs(s.rows[0].m.cls.p75 - 0.05) < 0.006, 'cls back as a score');
});

test('the route: a page’s own, a few a minute; never anything back but 204', async () => {
  const sent = [];
  const req = (h = {}, body = JSON.stringify({ app: 'hub', dev: 'phone', m: { fcp: 400 } })) => new Request('https://inflite.ai/api/vitals', { method: 'POST', headers: { 'CF-Connecting-IP': '203.0.113.9', ...h }, body });
  // (the Workers rate limiter, as wrangler.worker.jsonc binds it: each RL<n> lets everything through here)
  const envOf = () => new Proxy({ DB: fakeDb(sent) }, { get: (t, k) => (k in t ? t[k] : /^RL\d+$/.test(String(k)) ? { limit: async () => ({ success: true }) } : undefined) });
  const ctx = (r) => ({ request: r, env: envOf(), waitUntil: () => {} });
  let res = await vitalsRoute({ ...ctx(req({ 'Sec-Fetch-Site': 'cross-site' })) });
  assert.equal(res.status, 403, 'another site’s page: refused');
  res = await vitalsRoute(ctx(new Request('https://inflite.ai/api/vitals')));
  assert.equal(res.status, 405);
  res = await vitalsRoute(ctx(req({}, 'x'.repeat(700))));
  assert.equal(res.status, 413);
  res = await vitalsRoute(ctx(req({}, 'not json')));
  assert.equal(res.status, 204, 'unreadable: nothing kept, nothing said');
  res = await vitalsRoute({ request: req({ 'Sec-Fetch-Site': 'same-origin' }), env: envOf() });
  assert.equal(res.status, 204);
  assert.equal(sent.length, 1, 'kept');
});

test('every address takes them: the site’s middleware, and Today’s and Mail’s servers pass them on, nothing kept there', () => {
  const mw = readFileSync(new URL('../../../functions/_middleware.js', import.meta.url), 'utf8');
  assert.match(mw, /url\.pathname === "\/api\/vitals" \|\| url\.pathname === "\/api\/account\/vitals"\) return vitalsRoute\(ctx\)/);
  const today = readFileSync(new URL('../../../../inflite/today/src/index.js', import.meta.url), 'utf8');
  assert.match(today, /url\.pathname === "\/api\/vitals"\) return await vitals\(/);
  assert.match(today, /ask\(env, request, \{ method: "POST", path: "vitals"/);
  const mail = readFileSync(new URL('../../../../inflite/email/src/index.js', import.meta.url), 'utf8');
  assert.match(mail, /url\.pathname === "\/api\/vitals"\) return vitals\(/);
  assert.match(mail, /\$\{env\.ACCOUNT_ORIGIN\}\/api\/vitals/);
  const menu = readFileSync(new URL('../../inflite/menu.js', import.meta.url), 'utf8');
  assert.match(menu, /sendBeacon\("\/api\/vitals"/, 'the shared menu sends them, in every app');
  assert.match(menu, /window\.top !== window/, 'never from a frame');
});
