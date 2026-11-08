import { test } from 'node:test';
import assert from 'node:assert/strict';
import { API_PROBES, MONITOR_POLICY } from '../../../functions/_monitorlist.js';
import { performanceChecks, apiChecks } from '../../../functions/_monitoring.js';
import { probeApi } from '../../../workers/ticker/api-probe.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
test('API probes check the real signed-out contract, including Chat’s expected 401', async () => {
  for (const svc of API_PROBES) {
    const result = await probeApi(svc, { fetcher: async (url, init) => {
      assert.equal(url, svc.probe); assert.equal(init.method, 'GET'); assert.equal(init.credentials, 'omit');
      assert.equal(new Headers(init.headers).has('Authorization'), false);
      assert.equal(new Headers(init.headers).has('Cookie'), false);
      return json({ [svc.field]: svc.value }, svc.status);
    } });
    assert.equal(result.s, 'ok', svc.id);
  }
  const svc = API_PROBES[0];
  for (const response of [json({}, 200), json({ signedIn: false }, 500), new Response('<html>', { headers: { 'Content-Type': 'text/html' } }), new Response('{', { headers: { 'Content-Type': 'application/json' } }), new Response(null, { status: 302 })]) {
    assert.equal((await probeApi(svc, { fetcher: async () => response })).s, 'down');
  }
  assert.equal((await probeApi(svc, { fetcher: async () => new Response('', { status: 403, headers: { 'cf-mitigated': 'challenge' } }) })).s, 'none');
});

test('API latency includes body reading; bytes, connection waits and stalled bodies are bounded', async () => {
  let clock = 0;
  const svc = API_PROBES[0];
  const slow = await probeApi(svc, { now: () => clock, fetcher: async () => {
    clock = MONITOR_POLICY.apiSlowMs + 1; return json({ signedIn: false });
  } });
  assert.equal(slow.s, 'warn');
  assert.equal((await probeApi(svc, { timeoutMs: 5, fetcher: () => new Promise(() => {}) })).s, 'down');
  let cancelled = false;
  const stalled = new ReadableStream({ cancel() { cancelled = true; } });
  assert.equal((await probeApi(svc, { timeoutMs: 5, fetcher: async () => new Response(stalled, { headers: { 'Content-Type': 'application/json' } }) })).s, 'down');
  assert.equal(cancelled, true);
  let reads = 0;
  const tooBig = new ReadableStream({ pull(c) { reads++; c.enqueue(new Uint8Array(4097)); }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
  assert.equal((await probeApi(svc, { fetcher: async () => new Response(tooBig, { headers: { 'Content-Type': 'application/json' } }) })).s, 'down');
  assert.equal(reads, 1);
});

const metric = (p75, n = 20, dev = 'phone', app = 'today', name = 'lcp') => ({ rows: [{ app, dev, m: { [name]: { p75, n } } }] });
test('performance alerts require samples and a meaningful absolute or baseline regression', () => {
  assert.equal(performanceChecks(metric(9000, 19), null).get('today').s, 'none');
  assert.equal(performanceChecks(metric(4500), null).get('today').s, 'warn');
  assert.equal(performanceChecks(metric(2800), metric(2500, 100)).get('today').s, 'ok');
  assert.equal(performanceChecks(metric(3500), metric(1500, 99)).get('today').s, 'ok');
  assert.match(performanceChecks(metric(3500), metric(1500, 100)).get('today').why, /regressed/);
  const current = { rows: [...metric(4500).rows, ...metric(1000, 100, 'computer').rows] };
  assert.equal(performanceChecks(current, null).get('today').s, 'warn', 'a healthy computer does not hide slow phones');
  assert.equal(performanceChecks(metric(4500, 20, 'phone', 'chats'), null).get('chat').s, 'warn');
  assert.equal(performanceChecks(metric(0.3, 20, 'phone', 'mail', 'cls'), null).get('mail').ms, null, 'layout shift is a score, not milliseconds');
});

test('recorded error bursts override a passing probe and unknown reports/words stay out of monitoring', () => {
  const reports = [{ id: 'api-today', s: 'ok', ms: 100, why: 'private words' }, { id: 'secret', s: 'down' }];
  assert.equal(apiChecks(reports, { today: 4 }).find(r => r.svc === 'api-today').s, 'ok');
  const down = apiChecks(reports, { today: 5 }).find(r => r.svc === 'api-today');
  assert.equal(down.s, 'down'); assert.equal(down.why, '5 server errors in 15 minutes');
  assert.equal(JSON.stringify(apiChecks(reports, {})).includes('private words'), false);
  assert.equal(apiChecks([], {}).every(r => r.s === 'none'), true, 'missing checks do not imply recovery');
});

test('monitor notifications distinguish degradation from downtime and name recovery clearly', async () => {
  const { incidentMail } = await import('../../../functions/_status.js');
  const event = { open: true, id: 'monitor-mail-test', title: 'Mail performance needs attention', svcs: ['perf-mail'], text: 'Phone loading regressed.', started: Date.UTC(2026, 10, 8, 12) };
  assert.equal(incidentMail({}, event).subject, 'Alert: Mail performance needs attention');
  const recovered = incidentMail({}, { ...event, open: false, ended: event.started + 600000 });
  assert.match(recovered.subject, /^Resolved: Mail performance \(affected /);
  assert.doesNotMatch(recovered.subject, /needs attention|down /);
});
