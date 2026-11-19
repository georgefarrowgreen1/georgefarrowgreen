// Signing in to an app on the site happens on the account's own page (account.<site>), and only there. The app sends
// you there with a word of its own for this sign-in (ask: the hash of a secret it keeps); you sign in there (or,
// signed in already, carry on as yourself); and the page hands the sign-in back to the app, with a code in the
// address's # that's good once, for two minutes, and only with the app's secret. So a code seen anywhere else, or one
// a page elsewhere sends you back with, signs nothing in. The app swaps it for a sign-in of its own (Chat's:
// functions/api/pigeon handback; Weather's: functions/_wxacct.js; Fitness's: functions/api/fitness; Markets's: functions/api/markets;
// Mail's and Today's, whose servers ask the account's address: functions/_mailapp.js, functions/_todayapp.js).
//
// For Chat it brings what unlocks the key there (box): the password's first half, or the PRF secret of a passkey
// with its own copy of the key (pk: which one, for that copy), sealed on the account's page to a key pair Chat
// made for the trip (pigeon/crypto.js sealFor). Neither this server nor anyone else with the code can open it; and as
// the key's opened with it, a code for Chat is made only for a sign-in that's just shown it's you (requireFresh).

import { HttpError, db, hex, sha256, b64url, randomToken, limit, clientIp, requireFresh, transferSession } from "./_pigeon.js";
import { count } from "./_signincount.js";

const TTL = 2 * 60e3, APPS = new Set(["inflight", "weather", "fitness", "markets", "mail", "today"]);
const WORD = /^[A-Za-z0-9_-]{43}$/, CODE = /^[A-Za-z0-9_-]{20,64}$/;
export const PASSKEY_ID = /^[A-Za-z0-9_-]{16,1400}$/;

// (the account's page) a code for this sign-in, for the app that asked, and its word: { code }
export async function makeHandback(env, u, b) {
  if (u.handed) throw new HttpError(403, "Confirm it’s you first.", "reauth");
  const app = String(b.app || ""), ask = String(b.ask || "");
  if (!APPS.has(app) || !WORD.test(ask)) throw new HttpError(400, "That didn’t come from an app on the site. Go back to the app and sign in from there.");
  await limit(env, "handback:" + u.id, 30, 15 * 60e3);
  const D = await db(env), t = Date.now();
  let box = null, pk = null;
  if (app === "inflight") {
    requireFresh(u);
    box = String(b.box || "");
    if (box.length < 40 || box.length > 2000 || !/^[\x20-\x7e]+$/.test(box)) throw new HttpError(400, "This page sent an incomplete request. Reload and try again.");
    if (b.pk != null) {
      pk = String(b.pk);
      if (!PASSKEY_ID.test(pk) || !(await D.prepare("SELECT 1 FROM pg_passkeys WHERE id = ? AND user_id = ? AND vault IS NOT NULL").bind(pk, u.id).first()))
        throw new HttpError(400, "That passkey can’t open your messages.");
    }
  }
  const code = randomToken(24);
  await D.batch([D.prepare("DELETE FROM pg_handback WHERE expires < ?").bind(t),
    D.prepare("INSERT INTO pg_handback (hash, user_id, session, app, ask, box, pk, expires) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(hex(await sha256(code)), u.id, u.sessionHash, app, ask, box, pk, t + TTL)]);
  return { code };
}

// Redeem the code once for that app and verifier, while the original session is valid.
// Return the session's cookie hash and last authentication time without making it fresher.
// An app can supply its own rate limit key when this request does not have the browser's IP.
export async function takeHandback(env, request, app, b, { limitKey, max = 30 } = {}) {
  await limit(env, limitKey ?? "handback-ip:" + clientIp(request), max, 15 * 60e3);
  const source = await db(env), D = source.withSession ? source.withSession("first-primary") : source;
  const code = String(b.code || ""), verifier = String(b.verifier || ""), t = Date.now();
  const row = CODE.test(code) && WORD.test(verifier) && await D.prepare("DELETE FROM pg_handback WHERE hash = ? AND app = ? AND ask = ? AND expires >= ? RETURNING *")
    .bind(hex(await sha256(code)), app, b64url(await sha256(verifier)), t).first();
  if (!row) { await count(env, "handback-failed"); throw new HttpError(400, "That sign-in has run out. Sign in again.", "handback"); }
  const u = await D.prepare("SELECT * FROM pg_users WHERE id = ?").bind(row.user_id).first();
  const from = u && await transferSession(D, row.session, u.id, Date.now());
  if (!from) { await count(env, "handback-failed"); throw new HttpError(400, "That sign-in has ended. Sign in again.", "handback"); }
  return { row, u, siteHash: from.site_hash || null, authAt: from.auth_at || 0 };
}
