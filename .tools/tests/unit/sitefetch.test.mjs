// The site's requests to InFlite's other Workers (functions/_sites.js siteFetch): over the direct link to each (a
// service binding) where it has one, as the same request at the same address; anything else as a plain fetch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { siteFetch } from '../../../functions/_sites.js';
const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');

const link = (name, seen) => ({ fetch: async (req) => { seen.push([name, req.url, req.method, req.headers.get('Authorization')]); return new Response(name); } });

test('Mail’s and Today’s addresses go over their links, as the same request', async () => {
  const seen = [], env = { MAIL_APP: link('mail', seen), TODAY_APP: link('today', seen) };
  assert.equal(await (await siteFetch(env, 'https://email.inflite.ai/api/connector/card', { headers: { Authorization: 'Bearer k' } })).text(), 'mail');
  assert.equal(await (await siteFetch(env, 'https://inflite.ai/version', { method: 'GET' })).text(), 'today');
  assert.deepEqual(seen, [['mail', 'https://email.inflite.ai/api/connector/card', 'GET', 'Bearer k'], ['today', 'https://inflite.ai/version', 'GET', null]]);
});

test('anything else, and anywhere without the link, is a plain fetch', async () => {
  const was = globalThis.fetch, asked = [];
  globalThis.fetch = async (u) => { asked.push(String(u)); return new Response('net'); };
  try {
    const seen = [], env = { MAIL_APP: link('mail', seen), TODAY_APP: link('today', seen) };
    for (const u of ['https://chat.inflite.ai/x', 'http://email.inflite.ai/x', 'https://email.inflite.ai.evil.test/x', 'https://inflite.ai.evil.test/', 'https://api.open-meteo.com/v1'])
      assert.equal(await (await siteFetch(env, u)).text(), 'net', u);
    assert.equal(await (await siteFetch({}, 'https://email.inflite.ai/api/connector/card')).text(), 'net', 'no link: a fetch');
    assert.equal(seen.length, 0);
    assert.equal(asked.length, 6);
  } finally { globalThis.fetch = was; }
});

test('both Workers have the links, and the two calls use them', () => {
  for (const f of ['wrangler.worker.jsonc', 'wrangler.gfg.jsonc']) {
    const s = read(f);
    assert.match(s, /"binding": "MAIL_APP", "service": "inflite-email"/, f);
    assert.match(s, /"binding": "TODAY_APP", "service": "inflite"/, f);
  }
  assert.match(read('functions/_todaymail.js'), /siteFetch\(env, `\$\{mailAt\(env, request\)\}\/api\/connector\/card`/);
  assert.match(read('functions/_todayapp.js'), /siteFetch\(env, `\$\{todayOrigin\(env\)\}\/version`/);
});
