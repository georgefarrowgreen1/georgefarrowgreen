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
