/* ---------- moving a phone to InFlight's new address ----------
   A phone signed in at the old address can't just open the new one signed in:
   each address keeps its own storage, and the phone's private key can't be
   copied out of it. So the old address unlocks the key again (the person's
   password, or a passkey), seals it with the sign-in and the phone's own
   settings under a fresh key, and leaves only that sealed bundle here. The
   key travels in the new address's #, which browsers never send to a server,
   so this side only ever holds ciphertext. The bundle opens once, within 30
   minutes; once it has, the old address forgets the phone. */
import { HttpError, json, db, body, limit, requireUser, randomToken, clientIp, MIN, HOUR, DAY } from "./_pigeon.js";

const MOVE_FOR = 30 * MIN;
const B64URL = /^[A-Za-z0-9_-]+$/;

// your locked keys, for this phone to unlock with your password or a passkey before it moves
async function vaults({ request, env }) {
  const u = await requireUser(request, env);
  const { results } = await (await db(env)).prepare("SELECT id, vault FROM pg_passkeys WHERE user_id = ? AND vault IS NOT NULL").bind(u.id).all();
  return json({ vault: u.vault, salt: u.salt, passkeys: results });
}
// the sealed bundle, and (so the new address can take over its notifications) this phone's push address
async function create({ request, env }) {
  const u = await requireUser(request, env);
  await limit(env, "move:" + u.id, 10, HOUR);
  const b = await body(request, 300_000), kh = String(b.kh || ""), ct = String(b.ct || ""), iv = String(b.iv || "");
  const push = b.push ? String(b.push).slice(0, 1000) : null;
  if (kh.length !== 43 || !B64URL.test(kh) || iv.length !== 16 || !B64URL.test(iv) || !ct || ct.length > 280_000 || !B64URL.test(ct)) throw new HttpError(400, "That move didn’t look right. Try again.");
  const D = await db(env), t = Date.now(), id = randomToken(16);
  await D.prepare("DELETE FROM pg_moves WHERE (redeemed_at IS NULL AND expires_at < ?1) OR created_at < ?2").bind(t, t - 60 * DAY).run();
  await D.prepare("INSERT INTO pg_moves (id, user_id, kh, ct, iv, push, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, u.id, kh, ct, iv, push, t, t + MOVE_FOR).run();
  return json({ id });
}
// opened at the new address: once, in time, by whoever holds the key (proved by its hash)
async function redeem({ request, env }) {
  await limit(env, "moveopen:" + clientIp(request), 20, HOUR);
  const b = await body(request), id = String(b.id || ""), kh = String(b.kh || ""), t = Date.now();
  if (!B64URL.test(id) || !B64URL.test(kh)) throw new HttpError(404, "That move link has expired.");
  const D = await db(env);
  const row = await D.prepare("UPDATE pg_moves SET redeemed_at = ?1 WHERE id = ?2 AND kh = ?3 AND redeemed_at IS NULL AND expires_at > ?1 RETURNING ct, iv").bind(t, id, kh).first();
  if (!row?.ct) throw new HttpError(404, "That move link has expired. Open InFlight at the old address and try again.");
  await D.prepare("UPDATE pg_moves SET ct = NULL WHERE id = ?").bind(id).run();      // opened: only the record that it was
  return json({ ct: row.ct, iv: row.iv });
}
// asked by the old address: has this phone arrived?
async function status({ request, env }) {
  const u = await requireUser(request, env);
  const id = new URL(request.url).searchParams.get("id") || "";
  const row = await (await db(env)).prepare("SELECT redeemed_at FROM pg_moves WHERE id = ? AND user_id = ?").bind(id, u.id).first();
  return json({ arrived: !!row?.redeemed_at });
}
// Notifications turned on at the new address replace the ones from the phones that moved there.
export async function dropMovedPush(D, uid) {
  await D.prepare("DELETE FROM pg_push WHERE user_id = ?1 AND endpoint IN (SELECT push FROM pg_moves WHERE user_id = ?1 AND push IS NOT NULL AND redeemed_at IS NOT NULL)").bind(uid).run();
}

export const MOVE_ROUTES = { "GET move-vaults": vaults, "POST move": create, "POST move-open": redeem, "GET move": status };
