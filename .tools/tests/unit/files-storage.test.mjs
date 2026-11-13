// Pure provisioning transport checks. No Cloudflare requests or bucket changes
// are made; every success/error is an explicit response fixture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FILES_BUCKET, prepareFilesStorage } from '../../workers/prepare-files-storage.mjs';

const ACCOUNT = '0123456789abcdef0123456789abcdef', TOKEN = 'test-private-token', BASE = 'https://api.cloudflare.com/client/v4';
const PATH = `/accounts/${ACCOUNT}/r2/buckets/${FILES_BUCKET}`;
const response = (result, status = 200, extra = {}) => Response.json({ success: status >= 200 && status < 300, result, ...extra }, { status });
function transport(steps) {
  const calls = [];
  const send = async (url, init) => {
    const next = steps[calls.length]; calls.push({ url, init }); assert.ok(next, 'no unplanned API request');
    assert.equal(url, BASE + next.path); assert.equal(init.method, next.method || 'GET'); assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${TOKEN}`); assert.ok(init.signal instanceof AbortSignal);
    if (next.body) assert.deepEqual(JSON.parse(init.body), next.body); else assert.equal(init.body, undefined);
    if (next.error) throw next.error;
    return next.reply || response(next.result, next.status, next.extra);
  };
  return { calls, send, done() { assert.equal(calls.length, steps.length, 'all planned responses were used'); } };
}
const privateChecks = (custom = { domains: [] }) => [
  { path: PATH, result: { name: FILES_BUCKET } },
  { path: PATH + '/domains/managed', result: { enabled: false } },
  { path: PATH + '/domains/custom', result: custom },
];
const run = t => prepareFilesStorage({ token: TOKEN, accountId: ACCOUNT, send: t.send });

test('an existing dedicated private bucket is verified only with exact read endpoints', async () => {
  const t = transport(privateChecks());
  assert.deepEqual(await run(t), { bucket: 'inflite-private-files', created: false, private: true, managedPublic: false, enabledCustomDomains: 0 });
  t.done(); assert.ok(t.calls.every(call => call.init.method === 'GET'));
});

test('a missing bucket creates only the dedicated named bucket then independently proves privacy', async () => {
  const t = transport([
    { path: PATH, status: 404, result: null },
    { path: `/accounts/${ACCOUNT}/r2/buckets`, method: 'POST', body: { name: FILES_BUCKET }, result: { name: FILES_BUCKET }, status: 201 },
    ...privateChecks(),
  ]);
  assert.equal((await run(t)).created, true); t.done();
  assert.deepEqual(t.calls.filter(call => call.init.method !== 'GET').map(call => ({ path: new URL(call.url).pathname, method: call.init.method })), [{ path: `/client/v4/accounts/${ACCOUNT}/r2/buckets`, method: 'POST' }]);
});

test('a concurrent creation conflict rereads once and never changes access settings', async () => {
  const t = transport([
    { path: PATH, status: 404, result: null },
    { path: `/accounts/${ACCOUNT}/r2/buckets`, method: 'POST', body: { name: FILES_BUCKET }, result: null, status: 409 },
    ...privateChecks([]),
  ]);
  assert.equal((await run(t)).private, true); t.done(); assert.equal(t.calls.filter(call => call.init.method === 'POST').length, 1);
  assert.ok(!t.calls.some(call => ['PUT', 'PATCH', 'DELETE'].includes(call.init.method)));
});

test('managed public access and unknown managed privacy fail closed without mutation', async () => {
  for (const managed of [{ enabled: true }, {}, { enabled: null }, null]) {
    const t = transport([{ path: PATH, result: { name: FILES_BUCKET } }, { path: PATH + '/domains/managed', result: managed }]);
    await assert.rejects(run(t), /not proven private/); t.done(); assert.ok(t.calls.every(call => call.init.method === 'GET'));
  }
});

test('enabled or unknown custom domains fail closed while explicitly disabled domains pass', async () => {
  for (const custom of [{ domains: [{ domain: 'public.example', enabled: true }] }, { domains: [{ domain: 'unknown.example' }] }, { domains: null }, {}, null]) {
    const t = transport(privateChecks(custom)); await assert.rejects(run(t), /not proven private/); t.done(); assert.ok(t.calls.every(call => call.init.method === 'GET'));
  }
  const disabled = transport(privateChecks({ domains: [{ domain: 'disabled.example', enabled: false }] }));
  assert.equal((await run(disabled)).enabledCustomDomains, 0); disabled.done();
});

test('account discovery requires exactly one valid account and rejects unsafe explicit identifiers before requests', async () => {
  for (const accountId of ['not-an-account', '../escape', 'g'.repeat(32), 123]) {
    let called = false; await assert.rejects(prepareFilesStorage({ token: TOKEN, accountId, send: async () => { called = true; throw Error('unexpected request'); } }), /valid Cloudflare account/); assert.equal(called, false);
  }
  for (const accounts of [[], [{ id: ACCOUNT }, { id: 'f'.repeat(32) }], [{ id: 'invalid' }]]) {
    const t = transport([{ path: '/accounts?per_page=50', result: accounts }]);
    await assert.rejects(prepareFilesStorage({ token: TOKEN, send: t.send }), /exactly one account|valid Cloudflare account/); t.done();
  }
  const single = transport([{ path: '/accounts?per_page=50', result: [{ id: ACCOUNT }] }, ...privateChecks()]);
  assert.equal((await prepareFilesStorage({ token: TOKEN, send: single.send })).private, true); single.done();
});

test('missing credentials, wrong bucket confirmations and unreadable API answers cannot authorize deployment', async () => {
  await assert.rejects(prepareFilesStorage({}), /TOKEN is required/);
  const wrong = transport([{ path: PATH, result: { name: 'bio-media' } }]); await assert.rejects(run(wrong), /did not confirm the dedicated Files bucket/); wrong.done();
  const unreadable = transport([{ path: PATH, reply: new Response('not JSON', { status: 200 }) }]); await assert.rejects(run(unreadable), /unexpected private-storage answer/); unreadable.done();
});

test('API errors expose only sanitized codes and never raw tokens, messages, headers or bodies', async () => {
  const t = transport([{ path: PATH, status: 403, result: null, extra: { errors: [{ code: '9bad77', message: 'secret response ' + TOKEN }], diagnostic: TOKEN } }]);
  await assert.rejects(run(t), error => { assert.match(error.message, /HTTP 403; codes 977/); assert.doesNotMatch(error.message, /secret response|test-private-token|Authorization|diagnostic/); return true; }); t.done();
});

test('an ambiguous network outcome during create is not retried and cannot mutate another bucket', async () => {
  const t = transport([
    { path: PATH, result: null, status: 404 },
    { path: `/accounts/${ACCOUNT}/r2/buckets`, method: 'POST', body: { name: FILES_BUCKET }, error: Error('secret network detail ' + TOKEN) },
  ]);
  await assert.rejects(run(t), error => { assert.match(error.message, /could not reach Cloudflare/); assert.doesNotMatch(error.message, /secret network detail|test-private-token/); return true; });
  t.done(); assert.equal(t.calls.filter(call => call.init.method === 'POST').length, 1);
  assert.ok(t.calls.every(call => !call.url.includes('bio-media')));
});
test('both production Workers retain native storage and bind the private drive only after storage verification', () => {
  for (const filename of ['wrangler.worker.jsonc', 'wrangler.gfg.jsonc']) {
    const config = readFileSync(new URL('../../../' + filename, import.meta.url), 'utf8');
    assert.match(config, /"binding":\s*"BIO_R2",\s*"bucket_name":\s*"bio-media"/);
    assert.match(config, /"binding":\s*"FILES_R2",\s*"bucket_name":\s*"inflite-private-files"/);
  }
  const workflow = readFileSync(new URL('../../../.github/workflows/worker-deploy.yml', import.meta.url), 'utf8');
  assert.ok(workflow.indexOf('node .tools/workers/prepare-files-storage.mjs') < workflow.indexOf('wrangler@4.158.0 deploy'));
});
