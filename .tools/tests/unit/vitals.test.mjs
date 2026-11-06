// How fast the apps are on people's own devices, in numbers only (functions/_vitals.js; the shared menu's VITALS sends
// them): a page's numbers kept as a count in a band, by day, app, kind of device and measure, never anything else; what
// isn't one of the few known apps, devices or measures, or is out of range, never kept; the admin's figure the 75th in a
// hundred; the route only from the page's own address; and Today's and Mail's servers pass it on, nothing kept there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { record, speed, vitalsRoute, band, bandValue, APPS, METRICS, DAY_CAP } from '../../../functions/_vitals.js';

const fakeDb = (sent) => ({
  prepare: (sql) => ({ bind: (...a) => ({ sql, a, first: async () => (/pg_limits/.test(sql) ? { count: 1, reset_at: Date.now() + 1000 } : null), all: async () => ({ results: [] }), run: async () => ({}) }), first: async () => null, all: async () => ({ results: [] }), run: async () => ({}) }),
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

function d1() {
  const s = new DatabaseSync(':memory:');
  // (the site's own tables, as functions/_pigeon.js makes them: its setup's run once in these tests, on the stand-in above)
  s.exec('CREATE TABLE pg_vitals (day INTEGER NOT NULL, app TEXT NOT NULL, dev TEXT NOT NULL, metric TEXT NOT NULL, b INTEGER NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, app, dev, metric, b))');
  s.exec('CREATE TABLE pg_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL)');
  const exec = (sql, args) => { const p = s.prepare(sql); if (p.columns().length) return { results: p.all(...args), success: true, meta: { changes: 0 } }; const r = p.run(...args); return { results: [], success: true, meta: { changes: Number(r.changes) } }; };
  const st = (sql, args = []) => ({ sql, a: args, bind: (...a) => st(sql, a), first: async () => s.prepare(sql).get(...args) ?? null, all: async () => exec(sql, args), run: async () => exec(sql, args), now: () => exec(sql, args) });
  return { sql: s, prepare: (q) => st(q), async batch(list) { s.exec('BEGIN'); try { const r = list.map((x) => x.now()); s.exec('COMMIT'); return r; } catch (e) { s.exec('ROLLBACK'); throw e; } }, exec: async (q) => s.exec(q) };
}

test('a day’s numbers for one app and device: kept up to a cap, so made-up ones can’t swamp them', async () => {
  const DB = d1(), env = { DB }, t = Date.UTC(2026, 10, 6, 12);
  await record(env, { app: 'hub', dev: 'phone', m: { lcp: 900 } }, t);
  const day = DB.sql.prepare("SELECT day FROM pg_vitals").get().day;
  DB.sql.prepare("UPDATE pg_vitals SET n = ?").run(DAY_CAP - 1);
  await record(env, { app: 'hub', dev: 'phone', m: { lcp: 900, fcp: 300 } }, t);
  await record(env, { app: 'hub', dev: 'phone', m: { lcp: 50000 } }, t);
  const sum = (metric, dev = 'phone') => DB.sql.prepare("SELECT COALESCE(SUM(n), 0) AS n FROM pg_vitals WHERE day = ? AND app = 'hub' AND dev = ? AND metric = ?").get(day, dev, metric).n;
  assert.equal(sum('lcp'), DAY_CAP, 'up to the cap, then no more, in any band');
  assert.equal(sum('fcp'), 1, 'each measure its own');
  await record(env, { app: 'hub', dev: 'computer', m: { lcp: 900 } }, t);
  assert.equal(sum('lcp', 'computer'), 1, 'each kind of device its own');
  await record(env, { app: 'hub', dev: 'phone', m: { lcp: 900 } }, t + 864e5);
  assert.equal(DB.sql.prepare("SELECT SUM(n) AS n FROM pg_vitals WHERE day = ? AND metric = 'lcp'").get(day + 1).n, 1, 'and each day');
});

test('the route: a few from each network (an IPv6 /48, not each /64), and too big refused before it’s read', async () => {
  const DB = d1(), env = { DB };
  const req = (ip, body = JSON.stringify({ app: 'hub', dev: 'phone', m: { fcp: 400 } }), h = {}) => new Request('https://inflite.ai/api/vitals', { method: 'POST', headers: { 'CF-Connecting-IP': ip, ...h }, body });
  let last;
  for (let i = 0; i < 41; i++) last = await vitalsRoute({ request: req(`2001:db8:aa:${i.toString(16)}::1`), env });
  assert.equal(last.status, 204);
  assert.equal(DB.sql.prepare("SELECT SUM(n) AS n FROM pg_vitals").get().n, 40, 'forty a quarter of an hour from one /48, however many /64s');
  assert.equal(DB.sql.prepare("SELECT key FROM pg_limits WHERE key LIKE 'vitals:%'").get().key, 'vitals:2001:db8:aa::/48');
  let read = false;
  const stream = new ReadableStream({ pull(c) { read = true; c.enqueue(new TextEncoder().encode('x'.repeat(100))); } }, { highWaterMark: 0 });
  const big = new Request('https://inflite.ai/api/vitals', { method: 'POST', headers: { 'Content-Length': '5000000', 'CF-Connecting-IP': '203.0.113.5' }, body: stream, duplex: 'half' });
  assert.equal((await vitalsRoute({ request: big, env })).status, 413);
  assert.equal(read, false, 'never read');
  const sly = new Request('https://inflite.ai/api/vitals', { method: 'POST', headers: { 'CF-Connecting-IP': '203.0.113.5' }, body: new ReadableStream({ pull(c) { c.enqueue(new TextEncoder().encode('x'.repeat(400))); } }), duplex: 'half' });
  assert.equal((await vitalsRoute({ request: sly, env })).status, 413, 'saying nothing of its size: read no further than the cap');
});

// (Today's Worker, where the inflite repo's checked out beside this one)
const TODAY = new URL('../../../../inflite/today/src/index.js', import.meta.url);
test('Today’s server passes on a page’s few hundred bytes, never more: too big by what it says, or as it’s read, refused unread', { skip: !existsSync(TODAY) && 'no inflite repo beside' }, async () => {
  const worker = (await import(TODAY)).default, sent = [], was = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => { sent.push({ url: String(url), body: init.body }); return new Response(null, { status: 204 }); };
  try {
    const env = { ACCOUNT_ORIGIN: 'https://account.inflite.ai', ASSETS: { fetch: async () => new Response('') } };
    const at = (body, h = {}) => new Request('https://inflite.ai/api/vitals', { method: 'POST', headers: { 'Sec-Fetch-Site': 'same-origin', ...h }, body, duplex: 'half' });
    const ok = JSON.stringify({ app: 'hub', dev: 'phone', m: { fcp: 400 } });
    assert.equal((await worker.fetch(at(ok), env, {})).status, 204);
    assert.equal(sent.length, 1); assert.match(sent[0].url, /\/api\/account\/vitals$/); assert.equal(sent[0].body, ok);
    let read = false;
    const big = at(new ReadableStream({ pull(c) { read = true; c.enqueue(new Uint8Array(100)); } }, { highWaterMark: 0 }), { 'Content-Length': '9000000' });
    assert.equal((await worker.fetch(big, env, {})).status, 413);
    assert.equal(read, false, 'never read');
    const sly = at(new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(400)); } }));
    assert.equal((await worker.fetch(sly, env, {})).status, 413, 'saying nothing of its size: read no further than the cap');
    assert.equal(sent.length, 1, 'neither passed on');
  } finally { globalThis.fetch = was; }
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
