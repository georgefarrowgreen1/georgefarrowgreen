import {
  DAY, PHOTO_TTL, SWIFT_MAX, DEFAULT_KM, HttpError, json, b64url, fromB64url, sha256, hex, safeEqual,
  db, body, clientIp, limit, serverSecret, issueSession, requireUser, haversineKm, flightMs, turn,
  swiftState, msgView, sweepPhotos, rpIdFor, newChallenge, checkClientData, verifyAssertion,
  HANDLE_RE, EMAIL_RE, UUID_RE, cleanPub, cleanPlace,
  emailReady, sendEmail, emailBody, createReset, findReset, resetUrl, maskEmail, adminLog, RESET_TTL_EMAIL, RESET_TTL_ADMIN,
} from "../../_pigeon.js";
import { isAuthed } from "../../_auth.js";

// All of InFlight's API lives under /api/pigeon/*. One router keeps the
// auth, error handling and schema setup in one place.

const MAX_CT = 70000;                 // an encrypted scroll (2,000 characters of text is far less)
const MAX_PHOTO = 8 * 1024 * 1024;    // encrypted photo blob

function meView(u, t) {
  const s = swiftState(u, t);
  return { id: u.id, handle: u.handle, name: u.name, email: u.email, pub: JSON.parse(u.pub),
    lat: u.lat, lon: u.lon, place: u.place, swift: s.count, swiftNextAt: s.nextAt };
}

/* ---------------- accounts ---------------- */
async function signup({ request, env }) {
  await limit(env, "signup:" + clientIp(request), 10, 60 * 60e3);
  const b = await body(request);
  const name = String(b.name || "").trim().slice(0, 50);
  const handle = String(b.handle || "").trim().replace(/^@/, "").toLowerCase();
  const email = String(b.email || "").trim().toLowerCase();
  if (!name) throw new HttpError(400, "Tell us your name.", "name");
  if (!HANDLE_RE.test(handle)) throw new HttpError(400, "Use 3 to 20 letters, numbers or underscores.", "handle");
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "That doesn’t look like an email address.", "email");
  if (fromB64url(b.salt).length !== 16 || fromB64url(b.proof).length !== 32) throw new HttpError(400, "Your app sent an incomplete sign-up. Reload and try again.");
  const vault = String(b.vault || "");
  if (vault.length < 20 || vault.length > 4000) throw new HttpError(400, "Your app sent an incomplete sign-up. Reload and try again.");
  const pub = cleanPub(b.pub);
  const D = await db(env);
  if (await D.prepare("SELECT 1 FROM pg_users WHERE handle = ?").bind(handle).first()) throw new HttpError(409, `@${handle} is taken.`, "handle");
  if (await D.prepare("SELECT 1 FROM pg_users WHERE email = ?").bind(email).first()) throw new HttpError(409, "There’s already an account with that email. Sign in instead.", "email");
  const id = crypto.randomUUID(), t = Date.now();
  await D.prepare(`INSERT INTO pg_users (id, handle, name, email, pub, salt, proof_hash, vault, swift, swift_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, handle, name, email, pub, b.salt, hex(await sha256(fromB64url(b.proof))), vault, SWIFT_MAX, t, t).run();
  const u = await D.prepare("SELECT * FROM pg_users WHERE id = ?").bind(id).first();
  return json({ token: await issueSession(env, id), me: meView(u, t) });
}

// The salt is public input to the phone's password stretching. Unknown emails
// get a stable made-up salt, so this can't be used to test who has an account.
async function salt({ request, env }) {
  await limit(env, "salt:" + clientIp(request), 60, 15 * 60e3);
  const email = String((await body(request)).email || "").trim().toLowerCase();
  const u = await (await db(env)).prepare("SELECT salt FROM pg_users WHERE email = ?").bind(email).first();
  if (u) return json({ salt: u.salt });
  const fake = await sha256(`${await serverSecret(env)}|salt|${email}`);
  return json({ salt: b64url(fake.slice(0, 16)) });
}

async function login({ request, env }) {
  const b = await body(request);
  const email = String(b.email || "").trim().toLowerCase();
  await limit(env, "login:" + clientIp(request), 10, 15 * 60e3);
  const D = await db(env);
  const u = await D.prepare("SELECT * FROM pg_users WHERE email = ?").bind(email).first();
  const given = hex(await sha256(fromB64url(b.proof)));
  if (!u || !safeEqual(given, u.proof_hash)) throw new HttpError(401, "That email and password don’t match an account.");
  return json({ token: await issueSession(env, u.id), me: meView(u, Date.now()), vault: u.vault });
}

async function logout({ request, env }) {
  const u = await requireUser(request, env);
  await (await db(env)).prepare("DELETE FROM pg_sessions WHERE hash = ?").bind(u.sessionHash).run();
  return json({ ok: true });
}

// The password-locked key, for a signed-in phone that needs to unlock it again
// (after a passkey sign-in on a phone without PRF support).
async function vault({ request, env }) {
  const u = await requireUser(request, env);
  return json({ vault: u.vault, salt: u.salt });
}

async function updateMe({ request, env }) {
  const u = await requireUser(request, env);
  const b = await body(request), D = await db(env);
  if (b.name !== undefined) {
    const name = String(b.name).trim().slice(0, 50);
    if (!name) throw new HttpError(400, "Your name can’t be empty.", "name");
    await D.prepare("UPDATE pg_users SET name = ? WHERE id = ?").bind(name, u.id).run();
  }
  if (b.lat !== undefined) {
    const p = cleanPlace(b);
    await D.prepare("UPDATE pg_users SET lat = ?, lon = ?, place = ? WHERE id = ?").bind(p.lat, p.lon, p.place, u.id).run();
  }
  const fresh = await D.prepare("SELECT * FROM pg_users WHERE id = ?").bind(u.id).first();
  return json({ me: meView(fresh, Date.now()) });
}

// Shared by "Delete my account" and the admin's delete.
async function removeAccount(env, id) {
  const D = await db(env);
  const { results } = await D.prepare("SELECT id FROM pg_msgs WHERE photo = 1 AND (sender = ?1 OR recipient = ?1)").bind(id).all();
  if (env.BIO_R2 && results.length) await env.BIO_R2.delete(results.map((r) => `pigeon/${r.id}`));
  await D.batch([
    D.prepare("DELETE FROM pg_msgs WHERE sender = ?1 OR recipient = ?1").bind(id),
    D.prepare("DELETE FROM pg_links WHERE a = ?1 OR b = ?1").bind(id),
    D.prepare("DELETE FROM pg_passkeys WHERE user_id = ?").bind(id),
    D.prepare("DELETE FROM pg_sessions WHERE user_id = ?").bind(id),
    D.prepare("DELETE FROM pg_resets WHERE user_id = ?").bind(id),
    D.prepare("DELETE FROM pg_users WHERE id = ?").bind(id),
  ]);
}
async function deleteMe({ request, env }) {
  const u = await requireUser(request, env);
  await removeAccount(env, u.id);
  return json({ ok: true });
}

/* ---------------- passkeys ---------------- */
async function passkeyOptions({ request, env }) {
  const b = await body(request), rpId = rpIdFor(request);
  if (b.mode === "register") {
    const u = await requireUser(request, env);
    const { results } = await (await db(env)).prepare("SELECT id FROM pg_passkeys WHERE user_id = ?").bind(u.id).all();
    return json({ challenge: await newChallenge(env, "register", u.id), rpId,
      user: { id: b64url(new TextEncoder().encode(u.id)), name: u.email, displayName: u.name },
      exclude: results.map((r) => r.id) });
  }
  await limit(env, "pkopt:" + clientIp(request), 60, 15 * 60e3);
  return json({ challenge: await newChallenge(env, "login"), rpId });
}

async function passkeyRegister({ request, env }) {
  const u = await requireUser(request, env);
  const b = await body(request);
  await checkClientData(env, request, b, "webauthn.create", "register", u.id);
  if (b.alg !== -7 && b.alg !== -257) throw new HttpError(400, "This passkey uses a key type InFlight doesn’t support.");
  if (!/^[A-Za-z0-9_-]{16,1400}$/.test(String(b.id || "")) || !b.publicKey) throw new HttpError(400, "The passkey response was incomplete.");
  const D = await db(env);
  if (await D.prepare("SELECT 1 FROM pg_passkeys WHERE id = ?").bind(b.id).first()) throw new HttpError(409, "This passkey is already saved.");
  await D.prepare("INSERT INTO pg_passkeys (id, user_id, public_key, alg, label, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(b.id, u.id, String(b.publicKey), b.alg, String(b.label || "Passkey").slice(0, 40), Date.now()).run();
  return json({ ok: true });
}

// A passkey's own copy of the private key, locked with that passkey's PRF secret.
async function passkeyVault({ request, env }) {
  const u = await requireUser(request, env);
  const b = await body(request);
  const v = String(b.vault || "");
  if (v.length < 20 || v.length > 4000) throw new HttpError(400, "That key copy wasn’t valid.");
  const r = await (await db(env)).prepare("UPDATE pg_passkeys SET vault = ? WHERE id = ? AND user_id = ?").bind(v, String(b.id), u.id).run();
  if (!r.meta.changes) throw new HttpError(404, "That passkey isn’t on your account.");
  return json({ ok: true });
}

async function passkeyLogin({ request, env }) {
  await limit(env, "pklogin:" + clientIp(request), 20, 15 * 60e3);
  const b = await body(request);
  await checkClientData(env, request, b, "webauthn.get", "login");
  const D = await db(env);
  const cred = await D.prepare("SELECT * FROM pg_passkeys WHERE id = ?").bind(String(b.id || "")).first();
  if (!cred) throw new HttpError(401, "This passkey isn’t linked to an InFlight account any more.");
  if (!(await verifyAssertion(cred, request, b))) throw new HttpError(401, "The passkey signature didn’t check out.");
  const u = await D.prepare("SELECT * FROM pg_users WHERE id = ?").bind(cred.user_id).first();
  if (!u) throw new HttpError(401, "This account no longer exists.");
  await D.prepare("UPDATE pg_passkeys SET used_at = ? WHERE id = ?").bind(Date.now(), cred.id).run();
  return json({ token: await issueSession(env, u.id), me: meView(u, Date.now()), pkVault: cred.vault, vault: u.vault, salt: u.salt });
}

async function passkeyDelete({ request, env }) {
  const u = await requireUser(request, env);
  const b = await body(request);
  await (await db(env)).prepare("DELETE FROM pg_passkeys WHERE id = ? AND user_id = ?").bind(String(b.id), u.id).run();
  return json({ ok: true });
}

/* ---------------- friends ---------------- */
async function addFriend({ request, env }) {
  const u = await requireUser(request, env);
  await limit(env, "friend:" + u.id, 40, 60 * 60e3);
  const handle = String((await body(request)).handle || "").trim().replace(/^@/, "").toLowerCase();
  const D = await db(env);
  const t = await D.prepare("SELECT id, handle FROM pg_users WHERE handle = ?").bind(handle).first();
  if (!t) return json({ message: "No one has that handle. Check the spelling." });
  if (t.id === u.id) return json({ message: "That’s you." });
  const l = await D.prepare("SELECT * FROM pg_links WHERE (a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1)").bind(u.id, t.id).first();
  if (l?.status === "ok") return json({ message: `@${t.handle} is already in your flock.` });
  if (l && l.a === u.id) return json({ message: `Your request to @${t.handle} is still waiting.` });
  if (l) {
    await D.prepare("UPDATE pg_links SET status = 'ok' WHERE a = ? AND b = ?").bind(t.id, u.id).run();
    return json({ message: `@${t.handle} joined your flock.` });
  }
  await D.prepare("INSERT INTO pg_links (a, b, status, created_at) VALUES (?, ?, 'pending', ?)").bind(u.id, t.id, Date.now()).run();
  return json({ message: `Request sent to @${t.handle}.` });
}
async function respondFriend({ request, env }) {
  const u = await requireUser(request, env);
  const b = await body(request), D = await db(env);
  if (b.accept) await D.prepare("UPDATE pg_links SET status = 'ok' WHERE a = ? AND b = ? AND status = 'pending'").bind(String(b.id), u.id).run();
  else await D.prepare("DELETE FROM pg_links WHERE a = ? AND b = ? AND status = 'pending'").bind(String(b.id), u.id).run();
  return json({ ok: true });
}
async function removeFriend({ request, env }) {
  const u = await requireUser(request, env);
  const id = String((await body(request)).id);
  await (await db(env)).prepare("DELETE FROM pg_links WHERE (a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1)").bind(u.id, id).run();
  return json({ ok: true });
}
async function areFriends(D, a, b) {
  return !!(await D.prepare("SELECT 1 FROM pg_links WHERE status = 'ok' AND ((a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1))").bind(a, b).first());
}
const lastBetween = (D, a, b) => D.prepare(
  "SELECT * FROM pg_msgs WHERE (sender = ?1 AND recipient = ?2) OR (sender = ?2 AND recipient = ?1) ORDER BY sent_at DESC LIMIT 1").bind(a, b).first();

/* ---------------- sync: everything the home screens need ---------------- */
async function sync({ request, env, waitUntil }) {
  const u = await requireUser(request, env);
  const D = await db(env), t = Date.now();
  waitUntil(sweepPhotos(env).catch(() => {}));
  const { results: links } = await D.prepare("SELECT a, b, status FROM pg_links WHERE a = ?1 OR b = ?1").bind(u.id).all();
  const other = (l) => (l.a === u.id ? l.b : l.a);
  const ids = [...new Set(links.map(other))];
  const people = new Map();
  if (ids.length) {
    const { results } = await D.prepare(`SELECT id, handle, name, pub, lat, lon, place FROM pg_users WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all();
    for (const p of results) people.set(p.id, p);
  }
  const { results: lasts } = await D.prepare(`
    SELECT * FROM (
      SELECT m.*, ROW_NUMBER() OVER (PARTITION BY CASE WHEN sender = ?1 THEN recipient ELSE sender END ORDER BY sent_at DESC) AS rn
      FROM pg_msgs m WHERE sender = ?1 OR recipient = ?1) WHERE rn = 1`).bind(u.id).all();
  const lastBy = new Map(lasts.map((m) => [m.sender === u.id ? m.recipient : m.sender, m]));
  const { results: unread } = await D.prepare("SELECT sender, COUNT(*) AS n FROM pg_msgs WHERE recipient = ? AND read_at IS NULL AND deliver_at <= ? GROUP BY sender").bind(u.id, t).all();
  const unreadBy = new Map(unread.map((r) => [r.sender, r.n]));
  const { results: pks } = await D.prepare("SELECT id, label, created_at, used_at, vault IS NOT NULL AS unlocks FROM pg_passkeys WHERE user_id = ? ORDER BY created_at").bind(u.id).all();
  const brief = (p) => ({ id: p.id, handle: p.handle, name: p.name });
  const friends = [], incoming = [], outgoing = [];
  for (const l of links) {
    const p = people.get(other(l)); if (!p) continue;
    if (l.status === "ok") {
      const last = lastBy.get(p.id);
      friends.push({ ...brief(p), pub: JSON.parse(p.pub), lat: p.lat, lon: p.lon, place: p.place,
        last: last ? msgView(u.id, last, t) : null, unread: unreadBy.get(p.id) || 0, turn: turn(u.id, last, t) });
    } else if (l.b === u.id) incoming.push(brief(p));
    else outgoing.push(brief(p));
  }
  return json({ now: t, me: meView(u, t), friends, incoming, outgoing,
    passkeys: pks.map((p) => ({ id: p.id, label: p.label, createdAt: p.created_at, usedAt: p.used_at, unlocks: !!p.unlocks })) });
}

/* ---------------- messages ---------------- */
async function listMessages({ request, env }) {
  const u = await requireUser(request, env);
  const other = new URL(request.url).searchParams.get("with") || "";
  const D = await db(env), t = Date.now();
  if (!(await areFriends(D, u.id, other))) throw new HttpError(403, "You can only read scrolls from your flock.");
  const { results } = await D.prepare(`SELECT * FROM (SELECT * FROM pg_msgs WHERE (sender = ?1 AND recipient = ?2) OR (sender = ?2 AND recipient = ?1)
    ORDER BY sent_at DESC LIMIT 300) ORDER BY sent_at`).bind(u.id, other).all();
  return json({ now: t, messages: results.map((m) => msgView(u.id, m, t)), turn: turn(u.id, results[results.length - 1], t), swift: swiftState(u, t).count });
}

async function sendMessage({ request, env }) {
  const u = await requireUser(request, env);
  await limit(env, "send:" + u.id, 120, 60 * 60e3);
  let meta, photo = null;
  if ((request.headers.get("Content-Type") || "").startsWith("multipart/form-data")) {
    const f = await request.formData();
    try { meta = JSON.parse(f.get("meta")); } catch (_) { throw new HttpError(400, "That scroll was malformed."); }
    const p = f.get("photo");
    if (p && typeof p !== "string") photo = p;
  } else meta = await body(request);
  const id = String(meta.id || ""), to = String(meta.to || ""), ct = String(meta.ct || "");
  if (!UUID_RE.test(id)) throw new HttpError(400, "That scroll was malformed.");
  if (ct.length < 20 || ct.length > MAX_CT) throw new HttpError(400, "That scroll is too long.");
  if (photo && photo.size > MAX_PHOTO) throw new HttpError(413, "That photo is too large. Try a smaller one.");
  if (photo && !env.BIO_R2) throw new HttpError(503, "Photos aren’t set up on this server yet.");
  const D = await db(env), t = Date.now();
  if (!u.lat && u.lat !== 0) throw new HttpError(409, "Set your roost in the Roost tab before sending pigeons.");
  if (!(await areFriends(D, u.id, to))) throw new HttpError(403, "You can only send pigeons to your flock.");
  const r = await D.prepare("SELECT lat, lon, place FROM pg_users WHERE id = ?").bind(to).first();

  // Free when the pigeon is on your windowsill; otherwise it costs a swift pigeon and flies twice as fast.
  const tn = turn(u.id, await lastBetween(D, u.id, to), t);
  let swift = 0;
  if (!tn.free) {
    const s = swiftState(u, t);
    if (s.count <= 0) throw new HttpError(409, "No swift pigeons left. One hatches every day.");
    const [n, at] = s.count >= SWIFT_MAX ? [SWIFT_MAX - 1, t] : [s.count - 1, u.swift_at + s.hatched * DAY];
    await D.prepare("UPDATE pg_users SET swift = ?, swift_at = ? WHERE id = ?").bind(n, at, u.id).run();
    swift = 1;
  }
  const hasTo = r && r.lat != null;
  const km = hasTo ? haversineKm(u.lat, u.lon, r.lat, r.lon) : DEFAULT_KM;
  const deliver = t + flightMs(km, swift);
  if (photo) await env.BIO_R2.put(`pigeon/${id}`, photo.stream(), { httpMetadata: { contentType: "application/octet-stream" } });
  try {
    await D.prepare(`INSERT INTO pg_msgs (id, sender, recipient, ct, photo, photo_size, swift, km, sent_at, deliver_at, expires_at,
      from_lat, from_lon, from_place, to_lat, to_lon, to_place) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, u.id, to, ct, photo ? 1 : 0, photo ? photo.size : null, swift, km, t, deliver, photo ? deliver + PHOTO_TTL : null,
        u.lat, u.lon, u.place, hasTo ? r.lat : null, hasTo ? r.lon : null, hasTo ? r.place : null).run();
  } catch (e) {
    if (photo) await env.BIO_R2.delete(`pigeon/${id}`);
    if (String(e).includes("UNIQUE")) throw new HttpError(409, "That scroll was already sent.");
    throw e;
  }
  const m = await D.prepare("SELECT * FROM pg_msgs WHERE id = ?").bind(id).first();
  return json({ message: msgView(u.id, m, t) });
}

async function markRead({ request, env }) {
  const u = await requireUser(request, env);
  const other = String((await body(request)).with || "");
  await (await db(env)).prepare("UPDATE pg_msgs SET read_at = ?1 WHERE recipient = ?2 AND sender = ?3 AND read_at IS NULL AND deliver_at <= ?1").bind(Date.now(), u.id, other).run();
  return json({ ok: true });
}

async function getPhoto({ request, env }, id) {
  const u = await requireUser(request, env);
  if (!UUID_RE.test(id || "")) throw new HttpError(404, "No such photo.");
  const m = await (await db(env)).prepare("SELECT sender, recipient, photo, deliver_at, expires_at FROM pg_msgs WHERE id = ?").bind(id).first();
  const t = Date.now();
  if (!m || (m.sender !== u.id && m.recipient !== u.id)) throw new HttpError(404, "No such photo.");
  if (m.photo !== 1 || t >= m.expires_at) throw new HttpError(410, "This photo has flown away.");
  if (m.recipient === u.id && t < m.deliver_at) throw new HttpError(425, "This photo is still in flight.");
  const obj = env.BIO_R2 && (await env.BIO_R2.get(`pigeon/${id}`));
  if (!obj) throw new HttpError(410, "This photo has flown away.");
  return new Response(obj.body, { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, no-store" } });
}

/* ---------------- password: change, forgotten, reset ----------------
   The password locks the private key, so a reset can only keep someone's
   scrolls if their phone unlocks the key another way (a passkey with PRF).
   Otherwise the phone makes a new key pair and old scrolls stay sealed. */
function checkNewSecret(b) {
  if (fromB64url(b.salt).length !== 16 || fromB64url(b.proof).length !== 32) throw new HttpError(400, "Your app sent an incomplete request. Reload and try again.");
  const vault = String(b.vault || "");
  if (vault.length < 20 || vault.length > 4000) throw new HttpError(400, "Your app sent an incomplete request. Reload and try again.");
  return vault;
}
async function notifyPasswordChanged(env, u, how) {
  if (!emailReady(env)) return;
  const { text, html } = emailBody([
    `Hi ${u.name},`,
    `The password for your InFlight account (@${u.handle}) was just changed ${how}.`,
    "If this wasn’t you, reply to this email straight away.",
  ]);
  await sendEmail(env, { to: u.email, subject: "Your InFlight password was changed", text, html }).catch(() => {});
}

async function changePassword({ request, env, waitUntil }) {
  const u = await requireUser(request, env);
  await limit(env, "pwchange:" + u.id, 10, 60 * 60e3);
  const b = await body(request);
  if (!safeEqual(hex(await sha256(fromB64url(b.oldProof))), u.proof_hash)) throw new HttpError(401, "Your current password isn’t right.", "current");
  const vault = checkNewSecret(b);
  const D = await db(env);
  await D.batch([
    D.prepare("UPDATE pg_users SET salt = ?, proof_hash = ?, vault = ? WHERE id = ?").bind(b.salt, hex(await sha256(fromB64url(b.proof))), vault, u.id),
    D.prepare("DELETE FROM pg_sessions WHERE user_id = ? AND hash != ?").bind(u.id, u.sessionHash),
    D.prepare("DELETE FROM pg_resets WHERE user_id = ?").bind(u.id),
  ]);
  waitUntil(notifyPasswordChanged(env, u, "from the app"));
  return json({ ok: true });
}

// Always answers the same way, so it can't be used to find out who has an account.
async function resetRequest({ request, env, waitUntil }) {
  await limit(env, "resetreq:" + clientIp(request), 5, 60 * 60e3);
  const email = String((await body(request)).email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "That doesn’t look like an email address.", "email");
  if (!emailReady(env)) throw new HttpError(503, "Reset emails aren’t switched on yet. Ask the person who runs InFlight for a reset link.");
  const u = await (await db(env)).prepare("SELECT * FROM pg_users WHERE email = ?").bind(email).first();
  let allowed = !!u;
  if (u) allowed = await limit(env, "resetmail:" + u.id, 3, 60 * 60e3).then(() => true, () => false);
  if (allowed) {
    const token = await createReset(env, u.id, "user", RESET_TTL_EMAIL);
    const { text, html } = emailBody([
      `Hi ${u.name},`,
      `Someone asked to reset the password for your InFlight account (@${u.handle}). This link works once, for the next hour.`,
      "If it wasn’t you, ignore this email. Your password won’t change.",
    ], { label: "Choose a new password", url: resetUrl(request, token) });
    waitUntil(sendEmail(env, { to: u.email, subject: "Reset your InFlight password", text, html }).catch((e) => console.error("reset mail", e.message)));
  }
  return json({ message: "If there’s an account for that email, a reset link is on its way. It works for one hour." });
}

async function resetCheck({ request, env }) {
  await limit(env, "resetcheck:" + clientIp(request), 30, 15 * 60e3);
  const { user: u } = await findReset(env, (await body(request)).token);
  // Passkey copies of the key are sealed with each passkey's own secret, so they're safe to give the link holder.
  const { results } = await (await db(env)).prepare("SELECT id, vault FROM pg_passkeys WHERE user_id = ? AND vault IS NOT NULL").bind(u.id).all();
  return json({ name: u.name, handle: u.handle, email: maskEmail(u.email), passkeys: results });
}

async function resetComplete({ request, env, waitUntil }) {
  await limit(env, "resetdo:" + clientIp(request), 10, 15 * 60e3);
  const b = await body(request);
  const { reset, user: u } = await findReset(env, b.token);
  const vault = checkNewSecret(b);
  const D = await db(env), t = Date.now();
  const fresh = b.pub !== undefined;
  const pub = fresh ? cleanPub(b.pub) : u.pub;
  // claim the link first, so two tabs can't both use it
  const used = await D.prepare("UPDATE pg_resets SET used_at = ? WHERE hash = ? AND used_at IS NULL").bind(t, reset.hash).run();
  if (!used.meta.changes) throw new HttpError(410, "This reset link has already been used. Ask for a new one.");
  const steps = [
    D.prepare("UPDATE pg_users SET salt = ?, proof_hash = ?, vault = ?, pub = ? WHERE id = ?").bind(b.salt, hex(await sha256(fromB64url(b.proof))), vault, pub, u.id),
    D.prepare("DELETE FROM pg_sessions WHERE user_id = ?").bind(u.id),
    D.prepare("DELETE FROM pg_resets WHERE user_id = ? AND used_at IS NULL").bind(u.id),
  ];
  // A new key pair makes the passkeys' copies of the old key useless; the passkeys still sign in.
  if (fresh) steps.push(D.prepare("UPDATE pg_passkeys SET vault = NULL WHERE user_id = ?").bind(u.id));
  await D.batch(steps);
  await adminLog(env, "reset-used", u.id, `${reset.created_by} link · ${fresh ? "new key" : "kept key with passkey"}`);
  waitUntil(notifyPasswordChanged(env, u, "with a reset link"));
  const updated = await D.prepare("SELECT * FROM pg_users WHERE id = ?").bind(u.id).first();
  return json({ token: await issueSession(env, u.id), me: meView(updated, t) });
}

/* ---------------- admin ----------------
   Uses the site owner's existing sign-in (the key icon on the home page:
   password or passkey, an HttpOnly SameSite=Strict cookie). Changes also need
   a custom header, which a form on another site can't send. Admins see account
   details, never passwords, keys or scrolls. */
async function requireAdmin(request, env, write) {
  if (!(await isAuthed(request, env))) throw new HttpError(401, "Sign in as the site owner first.");
  if (write && request.headers.get("X-InFlight-Admin") !== "1") throw new HttpError(403, "Admin changes must come from the admin page.");
}
async function adminStatus({ request, env }) {
  const authed = await isAuthed(request, env);
  return json({ authed, configured: !!env.EDIT_PASSWORD, email: authed ? emailReady(env) : undefined });
}
async function adminUsers({ request, env }) {
  await requireAdmin(request, env);
  const D = await db(env), t = Date.now();
  const { results } = await D.prepare(`
    SELECT u.id, u.name, u.handle, u.email, u.place, u.created_at,
      (SELECT MAX(seen_at) FROM pg_sessions s WHERE s.user_id = u.id) AS last_seen,
      (SELECT COUNT(*) FROM pg_sessions s WHERE s.user_id = u.id) AS sessions,
      (SELECT COUNT(*) FROM pg_passkeys p WHERE p.user_id = u.id) AS passkeys,
      (SELECT COUNT(*) FROM pg_passkeys p WHERE p.user_id = u.id AND p.vault IS NOT NULL) AS unlocking,
      (SELECT COUNT(*) FROM pg_links l WHERE l.status = 'ok' AND (l.a = u.id OR l.b = u.id)) AS friends,
      (SELECT COUNT(*) FROM pg_msgs m WHERE m.sender = u.id) AS sent
    FROM pg_users u ORDER BY u.created_at DESC LIMIT 1000`).all();
  const totals = await D.prepare("SELECT COUNT(*) AS msgs, COALESCE(SUM(CASE WHEN deliver_at > ? THEN 1 ELSE 0 END), 0) AS flying FROM pg_msgs").bind(t).first();
  return json({ now: t, users: results, totals });
}
async function adminTarget(env, b) {
  const u = await (await db(env)).prepare("SELECT * FROM pg_users WHERE id = ?").bind(String(b.id || "")).first();
  if (!u) throw new HttpError(404, "That account doesn’t exist any more.");
  return u;
}
async function adminReset({ request, env }) {
  await requireAdmin(request, env, true);
  const b = await body(request), u = await adminTarget(env, b);
  if (b.mode === "email") {
    if (!emailReady(env)) throw new HttpError(503, "Email isn’t set up yet. Use “Make a reset link” and send it yourself.");
    const token = await createReset(env, u.id, "admin-email", RESET_TTL_EMAIL);
    const { text, html } = emailBody([
      `Hi ${u.name},`,
      `Here’s a link to choose a new password for your InFlight account (@${u.handle}). It works once, for the next hour.`,
      "If you didn’t ask for this, you can ignore it. Your password won’t change.",
    ], { label: "Choose a new password", url: resetUrl(request, token) });
    await sendEmail(env, { to: u.email, subject: "Reset your InFlight password", text, html });
    await adminLog(env, "reset-emailed", u.id, `@${u.handle}`);
    return json({ message: `Reset link emailed to ${u.email}. It works for one hour.` });
  }
  const token = await createReset(env, u.id, "admin-link", RESET_TTL_ADMIN);
  await adminLog(env, "reset-link", u.id, `@${u.handle}`);
  return json({ url: resetUrl(request, token), message: `One-time link for @${u.handle}. It works for 24 hours. Send it to them privately.` });
}
async function adminSignOut({ request, env }) {
  await requireAdmin(request, env, true);
  const u = await adminTarget(env, await body(request));
  const r = await (await db(env)).prepare("DELETE FROM pg_sessions WHERE user_id = ?").bind(u.id).run();
  await adminLog(env, "signed-out", u.id, `@${u.handle} · ${r.meta.changes} device(s)`);
  return json({ message: `@${u.handle} was signed out on ${r.meta.changes} device${r.meta.changes === 1 ? "" : "s"}.` });
}
async function adminDelete({ request, env }) {
  await requireAdmin(request, env, true);
  const b = await body(request), u = await adminTarget(env, b);
  if (String(b.confirm || "").trim().replace(/^@/, "").toLowerCase() !== u.handle) throw new HttpError(400, `Type ${u.handle} to confirm.`);
  await removeAccount(env, u.id);
  await adminLog(env, "deleted", u.id, `@${u.handle} (${u.email})`);
  return json({ message: `@${u.handle} and their scrolls were deleted.` });
}
async function adminLogList({ request, env }) {
  await requireAdmin(request, env);
  const { results } = await (await db(env)).prepare("SELECT * FROM pg_admin_log ORDER BY id DESC LIMIT 100").all();
  return json({ log: results });
}

/* ---------------- router ---------------- */
const ROUTES = {
  "POST signup": signup, "POST salt": salt, "POST login": login, "POST logout": logout, "GET vault": vault,
  "PATCH me": updateMe, "DELETE me": deleteMe,
  "POST passkey-options": passkeyOptions, "POST passkey-register": passkeyRegister, "POST passkey-vault": passkeyVault,
  "POST passkey-login": passkeyLogin, "DELETE passkey": passkeyDelete,
  "GET sync": sync,
  "POST friends": addFriend, "POST friends-respond": respondFriend, "DELETE friends": removeFriend,
  "GET messages": listMessages, "POST messages": sendMessage, "POST read": markRead,
  "GET photo": getPhoto,
  "POST password": changePassword, "POST reset-request": resetRequest, "POST reset-check": resetCheck, "POST reset-complete": resetComplete,
  "GET admin-status": adminStatus, "GET admin-users": adminUsers, "POST admin-reset": adminReset,
  "POST admin-signout": adminSignOut, "POST admin-delete": adminDelete, "GET admin-log": adminLogList,
};

export async function onRequest(ctx) {
  const parts = new URL(ctx.request.url).pathname.replace(/^\/api\/pigeon\/?/, "").split("/");
  const handler = ROUTES[`${ctx.request.method} ${parts[0]}`];
  try {
    if (!handler) throw new HttpError(404, "Not found.");
    return await handler(ctx, parts[1]);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, field: e.field }, e.status);
    console.error("pigeon", e && e.stack || e);
    return json({ error: "Something went wrong on our side. Try again in a moment." }, 500);
  }
}
