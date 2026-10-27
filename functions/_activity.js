// What's happened to an account lately, for its page's Recent activity (account.inflite.ai): sign-ins, a new
// password, passkeys added and taken away, devices signed out, the email changed or confirmed, the data downloaded, a
// deletion asked for or called off. Each with the app it happened in, the device and roughly where (as the list of
// signed-in devices has them), kept 30 days (pg_events). Noting one never holds up what it's noting.
//
// And where a passkey's saved (iCloud Keychain, Google Password Manager…), from the authenticator's AAGUID in the
// authenticator data a new passkey comes with.

import { db, deviceOf, placeOf, appKey, DAY, fromB64url } from "./_pigeon.js";

export const KEEP_DAYS = 30;
// which app a request came from, by its API, as a word for the list
const appOf = (request) => ({ inflight: "InFlight", weather: "Weather", fitness: "Fitness", account: "Account" })[appKey(request)] || null;
export async function logEvent(env, userId, kind, request, detail = null) {
  try {
    const D = await db(env), t = Date.now();
    await D.batch([
      D.prepare("INSERT INTO pg_events (user_id, at, kind, app, device, place, detail) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(userId, t, kind, request ? appOf(request) : null, request ? deviceOf(request) : null, request ? placeOf(request) : null, detail == null ? null : String(detail).slice(0, 120)),
      D.prepare("DELETE FROM pg_events WHERE user_id = ? AND at < ?").bind(userId, t - KEEP_DAYS * DAY),
    ]);
  } catch (e) { console.error("account activity", e && e.message); }
}
export async function activityOf(env, userId) {
  const { results } = await (await db(env)).prepare("SELECT at, kind, app, device, place, detail FROM pg_events WHERE user_id = ? AND at >= ? ORDER BY at DESC LIMIT 100")
    .bind(userId, Date.now() - KEEP_DAYS * DAY).all();
  return results.map((r) => ({ at: r.at, kind: r.kind, app: r.app || null, device: r.device || null, place: r.place || null, detail: r.detail || null }));
}

// The best-known passkey providers' AAGUIDs (the community list at github.com/passkeydeveloper/passkey-authenticator-aaguids)
const PROVIDERS = {
  "fbfc3007-154e-4ecc-8c0b-6e020557d7bd": "iCloud Keychain",
  "dd4ec289-e01d-41c9-bb89-70fa845d4bf2": "iCloud Keychain",
  "ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4": "Google Password Manager",
  "adce0002-35bc-c60a-648b-0b25f1f05503": "Chrome on Mac",
  "08987058-cadc-4b81-b6e1-30de50dcbe96": "Windows Hello",
  "9ddd1817-af5a-4672-a2b9-3e3dd95000a9": "Windows Hello",
  "6028b017-b1d4-4c02-b4b3-afcdafc96bb2": "Windows Hello",
  "bada5566-a7aa-401f-bd96-45619a55120d": "1Password",
  "d548826e-79b4-db40-a3d8-11116f7e8349": "Bitwarden",
  "531126d6-e717-415c-9320-3d9aa6981239": "Dashlane",
  "53414d53-554e-4700-0000-000000000000": "Samsung Pass",
  "50726f74-6f6e-5061-7373-50726f746f6e": "Proton Pass",
  "fdb141b2-5d84-443e-8a35-4698c205a502": "KeePassXC",
  "b84e4048-15dc-4dd0-8640-f4f60813c8af": "NordPass",
  "0ea242b4-43c4-4a1b-8b17-dd6d0b6baec6": "Keeper",
  "f3809540-7f14-49c1-a8b3-8f813b225541": "Enpass",
  "b78a0a55-6ef8-d246-a042-ba0f6d55050c": "LastPass",
};
// The provider a new passkey's authenticator data names (null if it says none, or one not on the list). The data:
// the RP ID's hash (32 bytes), flags (1), the sign count (4), then, when the flags say a credential's attached, its AAGUID
export function providerOf(authenticatorData) {
  try {
    const a = fromB64url(String(authenticatorData || ""));
    if (a.length < 53 || !(a[32] & 0x40)) return null;
    const h = [...a.slice(37, 53)].map((b) => b.toString(16).padStart(2, "0")).join("");
    return PROVIDERS[`${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`] || null;
  } catch (_) { return null; }
}
