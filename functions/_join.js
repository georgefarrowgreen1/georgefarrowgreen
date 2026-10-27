// Joining the site, and getting back in: a new georgefarrowgreen.com account, and a forgotten password reset. Both are
// the account's own page's (account.inflite.ai, functions/api/account/[[path]].js): no app makes accounts or
// resets passwords itself any more. They were InFlight's, and keep its rules:
//
// - An account needs a one-time invite link from the site owner (pg_invites; a server with PIGEON_OPEN_SIGNUP=1, for
//   testing, lets anyone in). Its key pair is made on the device and its private half locked there with the password,
//   so the server only ever holds it locked (functions/_atrest.js locks it again, at rest).
// - A reset link carries a random token (only its hash is kept), works once, for an hour, and ends every sign-in and
//   passkey. It keeps the account's key only for someone who can unlock it with a passkey (proved by signing the link
//   with it: functions/_pigeon.js keyProofOk); otherwise the device makes a new key pair.

import { HttpError, db, limit, clientIp, hex, sha256, fromB64url, HANDLE_RE, EMAIL_RE, handleTaken, cleanPub, SWIFT_MAX,
  createReset, findReset, resetKx, keyProofOk, maskEmail, adminLog, RESET_TTL_EMAIL } from "./_pigeon.js";
import { emailReady } from "./_email.js";
import { cleanName } from "./_profile.js";
import { proofHash, lockVault, openVault } from "./_atrest.js";

// ---- invites ----
const INVITE_RE = /^[A-Za-z0-9_-]{40,50}$/;
export const inviteOpen = (env) => env.PIGEON_OPEN_SIGNUP === "1";
async function inviteRow(D, token) {
  if (!INVITE_RE.test(String(token || ""))) return null;
  return D.prepare("SELECT * FROM pg_invites WHERE hash = ?").bind(hex(await sha256(String(token)))).first();
}
const inviteWhy = (r) => (!r ? "That invite link isn’t right. Check you have the whole link." : r.revoked_at ? "That invite has been cancelled." : r.used_at ? "That invite has already been used." : null);
// Before showing the form: is this invite good? (and does this server need one at all)
export async function inviteState(env, request, token) {
  await limit(env, "invitecheck:" + clientIp(request), 30, 15 * 60e3);
  if (inviteOpen(env)) return { open: true, ok: true };
  if (!token) return { open: false, ok: false };
  const why = inviteWhy(await inviteRow(await db(env), token));
  return { open: false, ok: !why, ...(why ? { error: why } : {}) };
}

// ---- what the device sends for a password ----
// A password's salt: "a2:" and 16 bytes for Argon2id (every new one), or a bare 16 bytes for PBKDF2 (accounts from before)
export function saltOk(s) {
  const m = /^(a2:)?([A-Za-z0-9_-]{22})$/.exec(String(s || ""));
  return !!m && fromB64url(m[2]).length === 16;
}
// a new password's salt, its proof (32 bytes) and the key locked with it
export function checkNewSecret(b) {
  if (!saltOk(b.salt) || fromB64url(b.proof).length !== 32) throw new HttpError(400, "Your browser sent an incomplete request. Reload and try again.");
  const vault = String(b.vault || "");
  if (vault.length < 20 || vault.length > 4000) throw new HttpError(400, "Your browser sent an incomplete request. Reload and try again.");
  return vault;
}

// ---- a handle: free, or what's near it that is ----
export async function handleFree(env, request, h) {
  await limit(env, "hfree:" + clientIp(request), 150, 15 * 60e3);
  h = String(h || "").trim().replace(/^@/, "").toLowerCase();
  if (!HANDLE_RE.test(h)) return { free: false, reason: "Handles use 3 to 20 letters, numbers or underscores." };
  const D = await db(env);
  if (!(await handleTaken(D, h))) return { free: true };
  const base = h.slice(0, 17), cands = [2, 3, 4, 5, 7, 8, 9, 11, 22, 99].map((n) => base + n).concat(["_", "_x", "_hq"].map((x) => (base + x).slice(0, 20)));
  const { results } = await D.prepare(`SELECT handle FROM pg_users WHERE handle IN (${cands.map(() => "?").join(",")})`).bind(...cands).all();
  const { results: held } = await D.prepare(`SELECT handle FROM pg_handles_held WHERE until > ? AND handle IN (${cands.map(() => "?").join(",")})`).bind(Date.now(), ...cands).all();
  const taken = new Set([...results, ...held].map((r) => r.handle));
  return { free: false, reason: `@${h} is taken.`, try: cands.filter((c) => HANDLE_RE.test(c) && !taken.has(c)).slice(0, 3) };
}

// ---- a new account: { name, handle, email, salt, proof, vault, pub, invite } → its row ----
export async function makeAccount(env, request, b) {
  await limit(env, "signup:" + clientIp(request), 10, 60 * 60e3);
  if (!inviteOpen(env)) { const why = inviteWhy(await inviteRow(await db(env), b.invite)); if (why) throw new HttpError(403, why, "invite"); }
  const name = cleanName(b.name, "Tell us your name.");
  const handle = String(b.handle || "").trim().replace(/^@/, "").toLowerCase();
  const email = String(b.email || "").trim().toLowerCase();
  if (!HANDLE_RE.test(handle)) throw new HttpError(400, "Use 3 to 20 letters, numbers or underscores.", "handle");
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "That doesn’t look like an email address.", "email");
  const vault = checkNewSecret(b), pub = await cleanPub(b.pub), D = await db(env);
  if (await handleTaken(D, handle)) throw new HttpError(409, `@${handle} is taken.`, "handle");
  // (said only to someone with a working invite, and at most a few times an hour: it can't be used to look emails up)
  if (await D.prepare("SELECT 1 FROM pg_users WHERE email = ?").bind(email).first()) {
    if (!inviteOpen(env)) await limit(env, "signup-email:" + hex(await sha256(String(b.invite))), 3, 3600e3);
    throw new HttpError(409, "There’s already an account with that email. Sign in instead.", "email");
  }
  const id = crypto.randomUUID(), t = Date.now();
  // the invite is used up first (so one link can't make two accounts at once), and handed back if the account can't be made
  let claimed = null;
  if (!inviteOpen(env)) {
    claimed = hex(await sha256(String(b.invite)));
    const c = await D.prepare("UPDATE pg_invites SET used_at = ?, used_by = ? WHERE hash = ? AND used_at IS NULL AND revoked_at IS NULL").bind(t, id, claimed).run();
    if (!c.meta.changes) throw new HttpError(403, "That invite has already been used.", "invite");
  }
  // (new accounts start with names hidden on the lock screen: they can turn them on)
  try {
    await D.prepare(`INSERT INTO pg_users (id, handle, name, email, pub, salt, proof_hash, vault, swift, swift_at, created_at, pw_at, notify_prefs)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, handle, name, email, pub, b.salt, await proofHash(env, b.proof), await lockVault(env, id, vault), SWIFT_MAX, t, t, t, JSON.stringify({ names: false })).run();
  } catch (e) {
    if (claimed) await D.prepare("UPDATE pg_invites SET used_at = NULL, used_by = NULL WHERE hash = ? AND used_by = ?").bind(claimed, id).run();
    throw e;
  }
  return D.prepare("SELECT * FROM pg_users WHERE id = ?").bind(id).first();
}

// ---- a forgotten password ----
// A link to the email, if there's an account for it: said the same either way, and in the same time (the link's made and
// sent after the answer: later(promise) carries on with it). send(u, token) sends it.
export async function requestReset(env, request, email, later, send) {
  await limit(env, "resetreq:" + clientIp(request), 5, 60 * 60e3);
  email = String(email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "That doesn’t look like an email address.", "email");
  if (!emailReady(env)) throw new HttpError(503, "Reset emails aren’t switched on yet. Ask the person who runs the site for a reset link.");
  const u = await (await db(env)).prepare("SELECT * FROM pg_users WHERE email = ?").bind(email).first();
  // limited by email, an account's or not, so the time it takes is the same either way
  const eh = hex(await sha256(email)).slice(0, 24);
  // (an address gets at most 3 an hour, and 10 a day, wherever they're asked from)
  const allowed = await limit(env, "resetmail:" + eh + ":" + clientIp(request), 3, 60 * 60e3)
    .then(() => limit(env, "resetmail:" + eh, 3, 60 * 60e3)).then(() => limit(env, "resetmail-day:" + eh, 10, 24 * 60 * 60e3)).then(() => !!u, () => false);
  if (allowed) later((async () => send(u, await createReset(env, u.id, "user", RESET_TTL_EMAIL)))().catch((e) => console.error("reset mail", e.message)));
  return { message: "If there’s an account for that email, a reset link is on its way. It works for one hour." };
}
// What the link's for (the email half hidden), and the passkeys that can keep the key: their copies of it are sealed
// with each passkey's own secret, so they're safe to give the link's holder
export async function checkReset(env, request, token) {
  await limit(env, "resetcheck:" + clientIp(request), 30, 15 * 60e3);
  const { reset, user: u } = await findReset(env, token);
  const { results } = await (await db(env)).prepare("SELECT id, vault FROM pg_passkeys WHERE user_id = ? AND vault IS NOT NULL").bind(u.id).all();
  for (const r of results) r.vault = await openVault(env, u.id, r.vault);
  return { name: u.name, handle: u.handle, email: maskEmail(u.email), passkeys: results, kx: results.length ? await resetKx(env, reset) : null };
}
// The new password: { token, salt, proof, vault, and pub (a new key pair) or keyProof (the old key kept) } → the
// account's row now, and whether it kept its key
export async function completeReset(env, request, b) {
  await limit(env, "resetdo:" + clientIp(request), 10, 15 * 60e3);
  const { reset, user: u } = await findReset(env, b.token);
  const vault = checkNewSecret(b), D = await db(env), t = Date.now();
  const fresh = b.pub !== undefined, pub = fresh ? await cleanPub(b.pub) : u.pub;
  // keeping the key: only a device that has it (unlocked with a passkey) can
  if (!fresh && !(await keyProofOk(reset, u.pub, b.keyProof))) throw new HttpError(400, "That passkey couldn’t unlock your key. You can start fresh instead.");
  // the link claimed first, so two tabs can't both use it
  const used = await D.prepare("UPDATE pg_resets SET used_at = ? WHERE hash = ? AND used_at IS NULL").bind(t, reset.hash).run();
  if (!used.meta.changes) throw new HttpError(410, "This reset link has already been used. Ask for a new one.");
  await D.batch([
    // (an email change still waiting is called off: it may have been asked for by whoever made the reset needed)
    D.prepare("UPDATE pg_users SET salt = ?, proof_hash = ?, vault = ?, pub = ?, pw_at = ?, pw_leaked = 0, pw_checked_at = NULL, email_new = NULL, email_new_code = NULL, email_new_at = NULL WHERE id = ?").bind(b.salt, await proofHash(env, b.proof), await lockVault(env, u.id, vault), pub, t, u.id),
    // (a link that came by email shows the address is theirs too)
    ...(reset.created_by !== "admin-link" ? [D.prepare("UPDATE pg_users SET email_ok = COALESCE(email_ok, ?) WHERE id = ?").bind(t, u.id)] : []),
    D.prepare("DELETE FROM pg_sessions WHERE user_id = ?").bind(u.id),
    D.prepare("DELETE FROM pg_resets WHERE user_id = ? AND used_at IS NULL").bind(u.id),
    // passkeys go too: one added by someone who had the old password would otherwise still sign in
    D.prepare("DELETE FROM pg_passkeys WHERE user_id = ?").bind(u.id),
    // (pins are sealed to the old key: no use with a new one)
    ...(fresh ? [D.prepare("UPDATE pg_users SET pins = NULL WHERE id = ?").bind(u.id)] : []),
  ]);
  await adminLog(env, "reset-used", u.id, `${reset.created_by} link · ${fresh ? "new key" : "kept key with passkey"}`);
  return { u: await D.prepare("SELECT * FROM pg_users WHERE id = ?").bind(u.id).first(), kept: !fresh, byEmail: reset.created_by !== "admin-link" };
}
