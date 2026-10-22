// Where a new passkey's saved, from the AAGUID in its authenticator data (functions/_activity.js providerOf)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { providerOf } from '../../../functions/_activity.js';

const b64url = (a) => Buffer.from(a).toString('base64url');
// authenticator data: the RP ID's hash, flags, the sign count, then (flag 0x40) the AAGUID and the rest of the credential
function authData(aaguid, flags = 0x45) {
  const a = new Uint8Array(37 + 16 + 2);
  a[32] = flags;
  Buffer.from(aaguid.replace(/-/g, ''), 'hex').copy(Buffer.from(a.buffer), 37);
  return b64url(a);
}
test('iCloud Keychain, Google Password Manager, 1Password, by their AAGUIDs', () => {
  assert.equal(providerOf(authData('fbfc3007-154e-4ecc-8c0b-6e020557d7bd')), 'iCloud Keychain');
  assert.equal(providerOf(authData('ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4')), 'Google Password Manager');
  assert.equal(providerOf(authData('bada5566-a7aa-401f-bd96-45619a55120d')), '1Password');
});
test('none named: an AAGUID of zeros, one not on the list, no credential attached, or nothing at all', () => {
  assert.equal(providerOf(authData('00000000-0000-0000-0000-000000000000')), null);
  assert.equal(providerOf(authData('01020304-0506-0708-0102-030405060708')), null);
  assert.equal(providerOf(authData('fbfc3007-154e-4ecc-8c0b-6e020557d7bd', 0x05)), null);
  assert.equal(providerOf(''), null);
  assert.equal(providerOf('not base64 at all!!'), null);
  assert.equal(providerOf(undefined), null);
});
