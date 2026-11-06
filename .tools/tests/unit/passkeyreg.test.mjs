// A passkey being added (functions/_pigeon.js checkRegistration): what the authenticator says of it must match what the
// page sends: made for this site, a person there and verified, the same id and the same public key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRegistration, b64url } from '../../../functions/_pigeon.js';

const request = new Request('https://account.georgefarrowgreen.com/api/account/passkeys', { method: 'POST' });
const sha = async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
// (CBOR, the little of it a COSE key needs)
const cb = {
  int: (n) => (n >= 0 ? (n < 24 ? [n] : [24, n]) : (-1 - n < 24 ? [0x20 | (-1 - n)] : [0x38, -1 - n])),
  bytes: (u8) => [...(u8.length < 24 ? [0x40 | u8.length] : u8.length < 256 ? [0x58, u8.length] : [0x59, u8.length >> 8, u8.length & 255]), ...u8],
  map: (pairs) => [0xa0 | pairs.length, ...pairs.flat()],
};
const neg = (n) => (n >= -24 ? [0x20 | (-1 - n)] : -1 - n < 256 ? [0x38, -1 - n] : [0x39, (-1 - n) >> 8, (-1 - n) & 255]);
const fromB64 = (s) => Uint8Array.from(Buffer.from(s, 'base64url'));

async function made({ alg = -7, rpId = 'georgefarrowgreen.com', flags = 0x45, id = crypto.getRandomValues(new Uint8Array(32)), count = 0, other = false } = {}) {
  const params = alg === -7 ? { name: 'ECDSA', namedCurve: 'P-256' } : { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
  const kp = await crypto.subtle.generateKey(params, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', (other ? await crypto.subtle.generateKey(params, true, ['sign', 'verify']) : kp).publicKey);
  const cose = alg === -7
    ? cb.map([[...cb.int(1), ...cb.int(2)], [...cb.int(3), ...neg(-7)], [...neg(-1), ...cb.int(1)], [...neg(-2), ...cb.bytes(fromB64(jwk.x))], [...neg(-3), ...cb.bytes(fromB64(jwk.y))]])
    : cb.map([[...cb.int(1), ...cb.int(3)], [...cb.int(3), ...neg(-257)], [...neg(-1), ...cb.bytes(fromB64(jwk.n))], [...neg(-2), ...cb.bytes(fromB64(jwk.e))]]);
  const ad = new Uint8Array([...(await sha(rpId)), flags, (count >>> 24) & 255, (count >>> 16) & 255, (count >>> 8) & 255, count & 255, ...new Uint8Array(16), id.length >> 8, id.length & 255, ...id, ...cose]);
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', kp.publicKey));
  return { id: b64url(id), alg, publicKey: b64url(spki), authenticatorData: b64url(ad) };
}

test('a passkey made for this site, with a person there and verified: taken, with its count', async () => {
  assert.equal(await checkRegistration(request, {}, await made()), 0);
  assert.equal(await checkRegistration(request, {}, await made({ count: 7 })), 7);
  assert.equal(await checkRegistration(request, {}, await made({ alg: -257 })), 0);
});
test('made for another site, with no one verified, or no key in it: refused', async () => {
  await assert.rejects(checkRegistration(request, {}, await made({ rpId: 'example.com' })), /didn’t match/);
  await assert.rejects(checkRegistration(request, {}, await made({ flags: 0x41 })), /didn’t match/);          // present, not verified
  await assert.rejects(checkRegistration(request, {}, await made({ flags: 0x05 })), /didn’t match/);          // no key in it
});
test('an id or a public key other than the one in it: refused', async () => {
  const b = await made();
  await assert.rejects(checkRegistration(request, {}, { ...b, id: b64url(new Uint8Array(32)) }), /didn’t match/);
  await assert.rejects(checkRegistration(request, {}, await made({ other: true })), /didn’t match/);
  await assert.rejects(checkRegistration(request, {}, await made({ other: true, alg: -257 })), /didn’t match/);
  await assert.rejects(checkRegistration(request, {}, { ...b, alg: -257 }), /didn’t match/);
});
test('nothing said of it at all: asked to update the browser', async () => {
  const b = await made();
  await assert.rejects(checkRegistration(request, {}, { ...b, authenticatorData: undefined }), /Update it/);
});

// ---- whose a passkey is (functions/_pigeon.js passkeySites, newRpFor, askRp, verifyAssertion) ----
// Every passkey made before inflite.ai had its own belongs to georgefarrowgreen.com (used on inflite.ai through related
// origins); one made at an app's address from now on belongs to inflite.ai, and needs nothing of the home site.
import { passkeySites, newRpFor, rpOf, askRp, verifyAssertion } from '../../../functions/_pigeon.js';
const at = (u) => new Request(u, { method: 'POST' });
const AUTH = at('https://auth.inflite.ai/api/account/signin/options'), HOME = at('https://georgefarrowgreen.com/api/account/x');
test('the two sites: inflite.ai’s own at an app’s address, the home site’s at the home page’s (and nothing else there)', () => {
  assert.deepEqual(passkeySites(AUTH, {}), { home: 'georgefarrowgreen.com', apps: 'inflite.ai' });
  assert.deepEqual(passkeySites(at('https://chat.inflite.ai/api/pigeon/x'), {}), { home: 'georgefarrowgreen.com', apps: 'inflite.ai' });
  assert.deepEqual(passkeySites(HOME, {}), { home: 'georgefarrowgreen.com', apps: 'georgefarrowgreen.com' });
  assert.equal(newRpFor(AUTH, {}), 'inflite.ai');
  assert.equal(newRpFor(HOME, {}), 'georgefarrowgreen.com');
  assert.equal(rpOf({ rp: null }, AUTH, {}), 'georgefarrowgreen.com', 'saved before passkeys said: the home site’s');
  assert.equal(rpOf({ rp: 'inflite.ai' }, AUTH, {}), 'inflite.ai');
});
test('a new passkey at an app’s address must be inflite.ai’s; one for the home site is refused there', async () => {
  assert.equal(await checkRegistration(AUTH, {}, await made({ rpId: 'inflite.ai' })), 0);
  await assert.rejects(checkRegistration(AUTH, {}, await made({ rpId: 'georgefarrowgreen.com' })), /didn’t match/);
});
// (a database that knows a few passkeys and accounts; everything else (the schema's setting up) answers nothing)
function fakeDb({ pks = {}, users = {} } = {}) {
  const st = (sql, args = []) => ({
    bind: (...a) => st(sql, a),
    first: async () => /SELECT rp FROM pg_passkeys WHERE id/.test(sql) ? (pks[args[0]] ? { rp: pks[args[0]].rp } : null)
      : /SELECT id FROM pg_users WHERE email/.test(sql) ? (users[args[0]] ? { id: users[args[0]] } : null) : null,
    all: async () => ({ results: /SELECT rp FROM pg_passkeys WHERE user_id/.test(sql) ? Object.values(pks).filter((p) => p.user === args[0]).map((p) => ({ rp: p.rp })) : [] }),
    run: async () => ({ meta: {} }), raw: async () => [],
  });
  return { prepare: (sql) => st(sql), batch: async (xs) => xs.map(() => ({ results: [], meta: {} })), exec: async () => ({}) };
}
test('which site to ask: the passkey named, the browser’s last, the signed-in account’s, else the home site’s (or inflite.ai’s where a related site can’t be used)', async () => {
  const env = { DB: fakeDb({ pks: { ['n'.repeat(22)]: { rp: 'inflite.ai', user: 'u1' }, ['o'.repeat(22)]: { rp: null, user: 'u2' }, ['p'.repeat(22)]: { rp: 'inflite.ai', user: 'u2' } }, users: { 'new@example.com': 'u1', 'both@example.com': 'u2' } }) };
  assert.equal(await askRp(env, AUTH, { id: 'n'.repeat(22) }), 'inflite.ai');
  assert.equal(await askRp(env, AUTH, { id: 'o'.repeat(22) }), 'georgefarrowgreen.com');
  assert.equal(await askRp(env, AUTH, { id: 'o'.repeat(22), ror: false }), 'inflite.ai', 'one of the home site’s can’t be used without related origins');
  assert.equal(await askRp(env, AUTH, { rpId: 'inflite.ai' }), 'inflite.ai');
  assert.equal(await askRp(env, AUTH, { rpId: 'evil.example' }), 'georgefarrowgreen.com', 'a site of neither: the usual');
  assert.equal(await askRp(env, AUTH, {}, { id: 'u1' }), 'inflite.ai', 'signed in to an account whose passkeys are all inflite.ai’s');
  assert.equal(await askRp(env, AUTH, {}, { id: 'u2' }), 'georgefarrowgreen.com', 'one with some of each: the home site’s, which works here too');
  assert.equal(await askRp(env, AUTH, { ror: false }, { id: 'u2' }), 'inflite.ai');
  assert.equal(await askRp(env, AUTH, {}), 'georgefarrowgreen.com');
  assert.equal(await askRp(env, AUTH, { ror: false }), 'inflite.ai');
  assert.equal(await askRp(env, HOME, { rpId: 'inflite.ai' }), 'georgefarrowgreen.com', 'at the home page, only its own');
});
test('signed in to nothing, an email sent changes nothing: the answer never says whether there’s an account, or whose passkeys are whose', async () => {
  const env = { DB: fakeDb({ pks: { ['n'.repeat(22)]: { rp: 'inflite.ai', user: 'u1' }, ['o'.repeat(22)]: { rp: null, user: 'u2' } }, users: { 'new@example.com': 'u1', 'old@example.com': 'u2', 'none@example.com': 'u3' } }) };
  for (const ror of [true, false]) {
    const usual = await askRp(env, AUTH, { ror });
    for (const email of ['new@example.com', 'old@example.com', 'none@example.com', 'nobody@example.com'])
      assert.equal(await askRp(env, AUTH, { email, ror }), usual, `${email}, ror ${ror}`);
  }
});
// (a passkey's answer, signed with its key, for the site it says)
async function signed(rpId) {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const ad = new Uint8Array([...(await sha(rpId)), 0x05, 0, 0, 0, 0]);
  const cdj = new TextEncoder().encode(JSON.stringify({ type: 'webauthn.get', challenge: 'c', origin: 'https://auth.inflite.ai' }));
  const msg = new Uint8Array([...ad, ...(await sha2(cdj))]);
  const raw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, msg));
  const der = (x) => { let i = 0; while (i < x.length - 1 && x[i] === 0) i++; x = x.slice(i); return x[0] & 0x80 ? [0, ...x] : [...x]; };
  const r = der(raw.slice(0, 32)), s = der(raw.slice(32));
  const sig = new Uint8Array([0x30, r.length + s.length + 4, 0x02, r.length, ...r, 0x02, s.length, ...s]);
  return { b: { authenticatorData: b64url(ad), clientDataJSON: b64url(cdj), signature: b64url(sig) }, public_key: b64url(new Uint8Array(await crypto.subtle.exportKey('spki', kp.publicKey))) };
}
const sha2 = async (u8) => new Uint8Array(await crypto.subtle.digest('SHA-256', u8));
test('a passkey’s answer is checked for the site it belongs to, and only where that site may be asked', async () => {
  const mine = await signed('inflite.ai'), old = await signed('georgefarrowgreen.com');
  assert.equal(await verifyAssertion({ id: 'x', alg: -7, public_key: mine.public_key, rp: 'inflite.ai' }, AUTH, mine.b, {}), true);
  assert.equal(await verifyAssertion({ id: 'x', alg: -7, public_key: old.public_key, rp: null }, AUTH, old.b, {}), true, 'one from before: the home site’s, still taken');
  assert.equal(await verifyAssertion({ id: 'x', alg: -7, public_key: mine.public_key, rp: null }, AUTH, mine.b, {}), false, 'an inflite.ai answer for a passkey of the home site’s');
  assert.equal(await verifyAssertion({ id: 'x', alg: -7, public_key: old.public_key, rp: 'inflite.ai' }, AUTH, old.b, {}), false);
  assert.equal(await verifyAssertion({ id: 'x', alg: -7, public_key: mine.public_key, rp: 'inflite.ai' }, HOME, mine.b, {}), false, 'inflite.ai’s passkey isn’t the home page’s to ask');
});
