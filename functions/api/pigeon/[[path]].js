import {
  HANDLE_EVERY, MAX_AVATAR, DAY, PHOTO_TTL, SWIFT_MAX, DEFAULT_KM, HttpError, json, b64url, fromB64url, sha256, hex, safeEqual,
  db, body, clientIp, limit, serverSecret, issueSession, requireUser, haversineKm, flightMs, turn,
  swiftState, loft, PIGEONS, spendSwift, msgView, RISKY_SPEED, RISKY_LOSS, msgSpeed, gcPoint, REROUTE_KM, MIN_FLIGHT, MAX_FLIGHT, MAX_SCHEDULE, LAYOVER, SPEED_KMH, sweepPhotos, rpIdFor, newChallenge, checkClientData, verifyAssertion,
  HANDLE_RE, EMAIL_RE, UUID_RE, cleanPub, cleanPlace,
  emailReady, emailFrom, sendEmail, emailBody, ukTime, linkOrigin, createReset, findReset, resetUrl, maskEmail, adminLog, RESET_TTL_EMAIL, RESET_TTL_ADMIN,
} from "../../_pigeon.js";
import { isAuthed } from "../../_auth.js";
import { GROUP_ROUTES, groupsForSync, rerouteGroups, removeFromGroups } from "../../_groups.js";
import { GIF_ROUTES, gifsReady } from "../../_gifs.js";
import { windsFor } from "../../_weather.js";
import { REACT_ROUTES, reactsFor, dropReacts } from "../../_reacts.js";
import { STATS_ROUTES, skinOpen } from "../../_stats.js";
import { SKIES_ROUTES } from "../../_skies.js";
import { WINDMAP_ROUTES } from "../../_windmap.js";
import { vapid, pushTo, pushEndpointOk, tick, maybeTick, tickAuthOk, friendRequested, friendAccepted, pigeonSent, pigeonRerouted, prefsOf, cleanPrefs } from "../../_notify.js";

// All of InFlight's API lives under /api/pigeon/*. One router keeps the
// auth, error handling and schema setup in one place.

const MAX_CT = 70000;                 // an encrypted scroll (2,000 characters of text is far less)
const MAX_PHOTO = 8 * 1024 * 1024;    // encrypted photo blob

function meView(u, t) {
  const s = swiftState(u, t), tb = loft(u, "turbo", t), rk = loft(u, "rocket", t);
  return { id: u.id, handle: u.handle, name: u.name, email: u.email, pub: JSON.parse(u.pub),
    lat: u.lat, lon: u.lon, place: u.place, swift: s.count, swiftNextAt: s.nextAt, turbo: tb.count, turboNextAt: tb.nextAt, rocket: rk.count, rocketNextAt: rk.nextAt, avatarAt: u.avatar_at || null, notifyEmail: !!u.notify_email, notify: prefsOf(u), appearance: u.appearance || null, autoLocation: !!u.auto_loc, risky: !!u.risky, locAt: u.loc_at || null, showOnline: !u.hide_online, receipts: !u.no_receipts, skin: u.skin || null,
    handleNextAt: u.handle_at && t - u.handle_at < HANDLE_EVERY ? u.handle_at + HANDLE_EVERY : null };
}

/* ---------------- accounts ---------------- */
// Names go into emails and notifications other people get, so they can't look
// like a web address, an email or a handle.
function cleanName(v, empty) {
  const name = String(v || "").normalize("NFC").replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim().replace(/\s+/g, " ").slice(0, 50);
  if (!name) throw new HttpError(400, empty, "name");
  if (/[@/\\:<>]|\.\S|www\./i.test(name)) throw new HttpError(400, "Names can’t include web addresses or symbols like @ / :", "name");
  return name;
}
async function signup({ request, env }) {
  await limit(env, "signup:" + clientIp(request), 10, 60 * 60e3);
  const b = await body(request);
  const name = cleanName(b.name, "Tell us your name.");
  const handle = String(b.handle || "").trim().replace(/^@/, "").toLowerCase();
  const email = String(b.email || "").trim().toLowerCase();
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
  // new accounts start with names hidden on the lock screen (they can turn them on)
  await D.prepare(`INSERT INTO pg_users (id, handle, name, email, pub, salt, proof_hash, vault, swift, swift_at, created_at, notify_prefs)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, handle, name, email, pub, b.salt, hex(await sha256(fromB64url(b.proof))), vault, SWIFT_MAX, t, t, JSON.stringify({ names: false })).run();
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
  await limit(env, "loginacct:" + email, 30, 60 * 60e3);
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

function waitText(ms) {
  const h = Math.floor(ms / 3600e3), m = Math.ceil((ms % 3600e3) / 60e3);
  return h ? `${h}h ${m}m` : `${m} minute${m === 1 ? "" : "s"}`;
}
// The recipient has moved: every pigeon flying to them turns in mid-air and
// heads for the new spot from wherever it is now, at its own speed. The turn
// point is kept so the map can draw the path. A pigeon still can't take
// longer than its 3-day limit from when it was sent. Small moves are added up:
// a pigeon turns once you're more than REROUTE_KM from where it's heading, and
// at most every 10 minutes, so a drive doesn't send it zig-zagging.
const TURN_EVERY = 10 * 60e3;
async function reroute(env, u, p, t, waitUntil) {
  const D = await db(env);
  const { results } = await D.prepare("SELECT * FROM pg_msgs WHERE recipient = ?1 AND deliver_at > ?2 AND to_lat IS NOT NULL AND (lost_at IS NULL OR lost_at > ?2)").bind(u.id, t).all();
  for (const m of results) {
    const legs = m.legs ? JSON.parse(m.legs) : [];
    if (haversineKm(m.to_lat, m.to_lon, p.lat, p.lon) <= REROUTE_KM) continue;
    // resting with a friend (or on its way to them): it flies on at the same time, to the new spot
    if (m.via && t < m.via_off) {
      const [[vLat, vLon]] = legs, ahead = haversineKm(vLat, vLon, p.lat, p.lon);
      const deliver = m.via_off + Math.round(flightMs(ahead / (m.wind_f || 1), msgSpeed(m)));
      const km = m.km - haversineKm(vLat, vLon, m.to_lat, m.to_lon) + ahead;
      const lostAt = m.lost_at == null || m.lost_at < m.via_off ? m.lost_at : Math.round(m.via_off + ((m.lost_at - m.via_off) / (m.deliver_at - m.via_off)) * (deliver - m.via_off));
      const r = await D.prepare(`UPDATE pg_msgs SET to_lat = ?, to_lon = ?, to_place = ?, deliver_at = ?, km = ?, lost_at = ?,
        expires_at = CASE WHEN photo = 1 THEN ? ELSE expires_at END WHERE id = ? AND via_off > ?`)
        .bind(p.lat, p.lon, p.place, deliver, km, lostAt, lostAt ?? deliver + PHOTO_TTL, m.id, t).run();
      if (r.meta.changes && (await areFriends(D, u.id, m.sender))) waitUntil(pigeonRerouted(env, m.sender, { ...u, place: p.place }, deliver).catch(() => {}));
      continue;
    }
    // still in its loft: it plans a new take-off so it lands when it was asked to (or as soon as it can)
    if (t < m.sent_at) {
      const km = haversineKm(m.from_lat, m.from_lon, p.lat, p.lon), flight = Math.round(flightMs(km / (m.wind_f || 1), msgSpeed(m)));
      const off = Math.max(t, m.deliver_at - flight), deliver = off + flight;
      const lostAt = m.lost_at == null ? null : Math.round(off + ((m.lost_at - m.sent_at) / (m.deliver_at - m.sent_at)) * flight);
      await D.prepare(`UPDATE pg_msgs SET to_lat = ?, to_lon = ?, to_place = ?, km = ?, sent_at = ?, deliver_at = ?, lost_at = ?,
        expires_at = CASE WHEN photo = 1 THEN ? ELSE expires_at END WHERE id = ? AND sent_at > ?`)
        .bind(p.lat, p.lon, p.place, km, off, deliver, lostAt, lostAt ?? deliver + PHOTO_TTL, m.id, t).run();
      continue;
    }
    if (legs.length && t - legs[legs.length - 1][2] < TURN_EVERY) continue;
    const [sLat, sLon, sAt] = legs.length ? legs[legs.length - 1] : [m.from_lat, m.from_lon, m.sent_at];
    const f = Math.min(1, Math.max(0, (t - sAt) / (m.deliver_at - sAt)));
    const [pLat, pLon] = gcPoint(sLat, sLon, m.to_lat, m.to_lon, f);           // where it is right now
    const ahead = haversineKm(pLat, pLon, p.lat, p.lon);
    const speed = msgSpeed(m);
    const latest = m.sent_at + MAX_FLIGHT / speed;
    const deliver = Math.max(t + MIN_FLIGHT / speed / 5, Math.min(latest, t + (ahead / (SPEED_KMH * (m.wind_f || 1))) * 3600e3 / speed));
    const km = Math.max(0, m.km - haversineKm(pLat, pLon, m.to_lat, m.to_lon)) + ahead;
    legs.push([Math.round(pLat * 1e5) / 1e5, Math.round(pLon * 1e5) / 1e5, t]);
    // a doomed pigeon is still lost before it would land, now on its new course
    const lostAt = m.lost_at == null ? null : m.lost_at < deliver ? m.lost_at : t + (deliver - t) / 2;
    const r = await D.prepare(`UPDATE pg_msgs SET to_lat = ?, to_lon = ?, to_place = ?, deliver_at = ?, km = ?, legs = ?, lost_at = ?,
      expires_at = CASE WHEN photo = 1 THEN ? ELSE expires_at END WHERE id = ? AND deliver_at > ?`)
      .bind(p.lat, p.lon, p.place, deliver, km, JSON.stringify(legs), lostAt, lostAt ?? deliver + PHOTO_TTL, m.id, t).run();
    if (r.meta.changes && (await areFriends(D, u.id, m.sender))) waitUntil(pigeonRerouted(env, m.sender, { ...u, place: p.place }, deliver).catch(() => {}));
  }
}
async function updateMe({ request, env, waitUntil }) {
  const u = await requireUser(request, env);
  const b = await body(request), D = await db(env), t = Date.now();
  if (b.handle !== undefined) {
    const handle = String(b.handle).trim().replace(/^@/, "").toLowerCase();
    if (!HANDLE_RE.test(handle)) throw new HttpError(400, "Use 3 to 20 letters, numbers or underscores.", "handle");
    if (handle !== u.handle) {
      if (u.handle_at && t - u.handle_at < HANDLE_EVERY) throw new HttpError(429, `You can change your handle once a day. Try again in ${waitText(u.handle_at + HANDLE_EVERY - t)}.`, "handle");
      if (await D.prepare("SELECT 1 FROM pg_users WHERE handle = ?").bind(handle).first()) throw new HttpError(409, `@${handle} is taken.`, "handle");
      try { await D.prepare("UPDATE pg_users SET handle = ?, handle_at = ? WHERE id = ?").bind(handle, t, u.id).run(); }
      catch (e) { if (String(e).includes("UNIQUE")) throw new HttpError(409, `@${handle} is taken.`, "handle"); throw e; }
    }
  }
  if (b.name !== undefined) {
    const name = cleanName(b.name, "Your name can’t be empty.");
    await D.prepare("UPDATE pg_users SET name = ? WHERE id = ?").bind(name, u.id).run();
  }
  if (b.appearance !== undefined) {
    if (!["light", "dark", "auto"].includes(b.appearance)) throw new HttpError(400, "Choose Light, Dark or Automatic.");
    await D.prepare("UPDATE pg_users SET appearance = ? WHERE id = ?").bind(b.appearance, u.id).run();
  }
  if (b.notify && typeof b.notify === "object")
    await D.prepare("UPDATE pg_users SET notify_prefs = ? WHERE id = ?").bind(JSON.stringify(cleanPrefs(prefsOf(u), b.notify)), u.id).run();
  if (b.notifyEmail !== undefined)
    await D.prepare("UPDATE pg_users SET notify_email = ?, email_at = COALESCE(email_at, ?) WHERE id = ?").bind(b.notifyEmail ? 1 : 0, t, u.id).run();
  if (b.autoLocation !== undefined) await D.prepare("UPDATE pg_users SET auto_loc = ? WHERE id = ?").bind(b.autoLocation ? 1 : 0, u.id).run();
  if (b.risky !== undefined) await D.prepare("UPDATE pg_users SET risky = ? WHERE id = ?").bind(b.risky ? 1 : 0, u.id).run();
  // a rare pigeon: only one whose achievement you've earned (null: back to the usual look)
  if (b.skin !== undefined) {
    if (b.skin !== null && !(await skinOpen(env, u.id, String(b.skin)))) throw new HttpError(403, "Earn its achievement first.");
    await D.prepare("UPDATE pg_users SET skin = ? WHERE id = ?").bind(b.skin, u.id).run();
  }
  if (b.showOnline !== undefined) await D.prepare("UPDATE pg_users SET hide_online = ? WHERE id = ?").bind(b.showOnline ? 0 : 1, u.id).run();
  if (b.receipts !== undefined) await D.prepare("UPDATE pg_users SET no_receipts = ? WHERE id = ?").bind(b.receipts ? 0 : 1, u.id).run();
  if (b.lat !== undefined) {
    const p = cleanPlace(b);
    const moved = u.lat == null ? Infinity : haversineKm(u.lat, u.lon, p.lat, p.lon);
    if (u.lat != null && moved > 0.1) await limit(env, "move:" + u.id, 30, 15 * 60e3);   // automatic updates check once a minute
    await D.prepare("UPDATE pg_users SET lat = ?, lon = ?, place = ?, loc_at = ? WHERE id = ?").bind(p.lat, p.lon, p.place, t, u.id).run();
    if (u.lat != null) { await reroute(env, u, p, t, waitUntil); await rerouteGroups(env, u, p, t, waitUntil); }   // also catches up a turn held back by TURN_EVERY
  }
  const fresh = await D.prepare("SELECT * FROM pg_users WHERE id = ?").bind(u.id).first();
  return json({ me: meView(fresh, Date.now()) });
}

/* ---------------- profile pictures ----------------
   Not end-to-end encrypted (the server shows them to several people), so
   they're only served to the owner, their friends, people in a group with
   them, and people they've sent a friend request to. Asking to be someone's friend shows you nothing of
   them until they say yes. */
const avatarKey = (id) => `pigeon-avatars/${id}`;
async function putAvatar({ request, env }) {
  const u = await requireUser(request, env);
  if (!env.BIO_R2) throw new HttpError(503, "Photos aren’t set up on this server yet.");
  await limit(env, "avatar:" + u.id, 20, DAY);
  if (Number(request.headers.get("Content-Length")) > MAX_AVATAR) throw new HttpError(413, "That picture is too large. Try another one.");
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > MAX_AVATAR) throw new HttpError(413, "That picture is too large. Try another one.");
  if (bytes.length < 100 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new HttpError(400, "Profile pictures must be JPEG images.");
  const t = Date.now();
  await env.BIO_R2.put(avatarKey(u.id), bytes, { httpMetadata: { contentType: "image/jpeg" } });
  await (await db(env)).prepare("UPDATE pg_users SET avatar_at = ? WHERE id = ?").bind(t, u.id).run();
  return json({ me: meView({ ...u, avatar_at: t }, t) });
}
async function deleteAvatar({ request, env }) {
  const u = await requireUser(request, env);
  if (env.BIO_R2) await env.BIO_R2.delete(avatarKey(u.id));
  await (await db(env)).prepare("UPDATE pg_users SET avatar_at = NULL WHERE id = ?").bind(u.id).run();
  return json({ me: meView({ ...u, avatar_at: null }, Date.now()) });
}
async function getAvatar({ request, env }, id) {
  const u = await requireUser(request, env);
  id = String(id || "");
  if (id !== u.id) {
    // or someone in a group with you
    const l = await (await db(env)).prepare(`SELECT 1 FROM pg_links WHERE (a = ?2 AND b = ?1) OR (a = ?1 AND b = ?2 AND status = 'ok')
      UNION ALL SELECT 1 FROM pg_group_members x JOIN pg_group_members y ON y.group_id = x.group_id WHERE x.user_id = ?1 AND y.user_id = ?2 LIMIT 1`).bind(u.id, id).first();
    if (!l) throw new HttpError(404, "No picture.");
  }
  const obj = env.BIO_R2 && (await env.BIO_R2.get(avatarKey(id)));
  if (!obj) throw new HttpError(404, "No picture.");
  return new Response(obj.body, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" } });
}

// Shared by "Delete my account" and the admin's delete.
async function removeAccount(env, id) {
  await dropReacts(env, { user: id });
  await removeFromGroups(env, id);
  const D = await db(env);
  if (env.BIO_R2) await env.BIO_R2.delete(avatarKey(id));
  const { results } = await D.prepare("SELECT id FROM pg_msgs WHERE photo = 1 AND (sender = ?1 OR recipient = ?1)").bind(id).all();
  if (env.BIO_R2 && results.length) await env.BIO_R2.delete(results.map((r) => `pigeon/${r.id}`));
  await D.batch([
    D.prepare("DELETE FROM pg_msgs WHERE sender = ?1 OR recipient = ?1").bind(id),
    D.prepare("UPDATE pg_msgs SET via_ct = '', via_note = NULL WHERE via = ?1").bind(id),     // a stopover with them: their copy goes
    D.prepare("DELETE FROM pg_links WHERE a = ?1 OR b = ?1").bind(id),
    D.prepare("DELETE FROM pg_passkeys WHERE user_id = ?").bind(id),
    D.prepare("DELETE FROM pg_sessions WHERE user_id = ?").bind(id),
    D.prepare("DELETE FROM pg_push WHERE user_id = ?").bind(id),
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
  if (!/^[A-Za-z0-9_-]{16,1400}$/.test(String(b.id || "")) || !/^[A-Za-z0-9_-]{60,1200}$/.test(String(b.publicKey || ""))) throw new HttpError(400, "The passkey response was incomplete.");
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
async function addFriend({ request, env, waitUntil }) {
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
    waitUntil(friendAccepted(env, u, t.id).catch(() => {}));
    return json({ message: `@${t.handle} joined your flock.` });
  }
  await D.prepare("INSERT INTO pg_links (a, b, status, created_at) VALUES (?, ?, 'pending', ?)").bind(u.id, t.id, Date.now()).run();
  waitUntil(friendRequested(env, linkOrigin(request), u, t.id).catch(() => {}));
  return json({ message: `Request sent to @${t.handle}.` });
}
async function respondFriend({ request, env, waitUntil }) {
  const u = await requireUser(request, env);
  const b = await body(request), D = await db(env);
  if (b.accept) {
    const r = await D.prepare("UPDATE pg_links SET status = 'ok' WHERE a = ? AND b = ? AND status = 'pending'").bind(String(b.id), u.id).run();
    if (r.meta.changes) waitUntil(friendAccepted(env, u, String(b.id)).catch(() => {}));
  }
  else await D.prepare("DELETE FROM pg_links WHERE a = ? AND b = ? AND status = 'pending'").bind(String(b.id), u.id).run();
  return json({ ok: true });
}
async function removeFriend({ request, env }) {
  const u = await requireUser(request, env);
  const id = String((await body(request)).id);
  await (await db(env)).prepare("DELETE FROM pg_links WHERE (a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1)").bind(u.id, id).run();
  return json({ ok: true });
}
// Friends you share with someone: where a pigeon to them could stop over.
async function mutuals({ request, env }) {
  const u = await requireUser(request, env), D = await db(env), other = new URL(request.url).searchParams.get("with") || "";
  if (!(await areFriends(D, u.id, other))) throw new HttpError(403, "You can only send pigeons to your flock.");
  const { results } = await D.prepare(`SELECT CASE WHEN a = ?1 THEN b ELSE a END AS id FROM pg_links WHERE status = 'ok' AND (a = ?1 OR b = ?1)
    INTERSECT SELECT CASE WHEN a = ?2 THEN b ELSE a END FROM pg_links WHERE status = 'ok' AND (a = ?2 OR b = ?2)`).bind(u.id, other).all();
  return json({ ids: results.map((r) => r.id).filter((id) => id !== u.id && id !== other) });
}
async function areFriends(D, a, b) {
  return !!(await D.prepare("SELECT 1 FROM pg_links WHERE status = 'ok' AND ((a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1))").bind(a, b).first());
}
// (a scheduled pigeon still in its loft isn't part of the conversation yet: it doesn't take a turn)
const lastBetween = (D, a, b, t) => D.prepare(
  "SELECT * FROM pg_msgs WHERE ((sender = ?1 AND recipient = ?2) OR (sender = ?2 AND recipient = ?1)) AND sent_at <= ?3 ORDER BY sent_at DESC LIMIT 1").bind(a, b, t).first();

// Read receipts go both ways: if either of you has them off, neither sees them.
const receipts = (me, other, v) => (v.from === me.id && (me.no_receipts || other?.no_receipts) ? { ...v, readAt: null } : v);

/* ---------------- sync: everything the home screens need ---------------- */
const SEEN_EVERY = 60e3;
async function sync({ request, env, waitUntil }) {
  const u = await requireUser(request, env);
  const D = await db(env), t = Date.now();
  waitUntil(sweepPhotos(env).catch(() => {}));
  // an open app syncs every 15 s; note it at most once a minute for Last Online
  if (!(t - (u.seen_at || 0) < SEEN_EVERY)) await D.prepare("UPDATE pg_users SET seen_at = ? WHERE id = ?").bind(t, u.id).run();
  const { results: links } = await D.prepare("SELECT a, b, status FROM pg_links WHERE a = ?1 OR b = ?1").bind(u.id).all();
  const other = (l) => (l.a === u.id ? l.b : l.a);
  const ids = [...new Set(links.map(other))];
  const people = new Map();
  if (ids.length) {
    const { results } = await D.prepare(`SELECT id, handle, name, pub, lat, lon, place, loc_at, seen_at, avatar_at, hide_online, no_receipts, notify_prefs FROM pg_users WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all();
    for (const p of results) people.set(p.id, p);
  }
  const { results: lasts } = await D.prepare(`
    SELECT * FROM (
      SELECT m.*, ROW_NUMBER() OVER (PARTITION BY CASE WHEN sender = ?1 THEN recipient ELSE sender END ORDER BY sent_at DESC) AS rn
      FROM pg_msgs m WHERE (sender = ?1 OR recipient = ?1) AND sent_at <= ?2) WHERE rn = 1`).bind(u.id, t).all();
  const lastBy = new Map(lasts.map((m) => [m.sender === u.id ? m.recipient : m.sender, m]));
  const { results: unread } = await D.prepare("SELECT sender, COUNT(*) AS n FROM pg_msgs WHERE recipient = ? AND read_at IS NULL AND deliver_at <= ? AND lost_at IS NULL GROUP BY sender").bind(u.id, t).all();
  const unreadBy = new Map(unread.map((r) => [r.sender, r.n]));
  const { results: pks } = await D.prepare("SELECT id, label, created_at, used_at, vault IS NOT NULL AS unlocks FROM pg_passkeys WHERE user_id = ? ORDER BY created_at").bind(u.id).all();
  const brief = (p) => ({ id: p.id, handle: p.handle, name: p.name, avatarAt: p.avatar_at || null });
  const friends = [], incoming = [], outgoing = [];
  for (const l of links) {
    const p = people.get(other(l)); if (!p) continue;
    if (l.status === "ok") {
      const last = lastBy.get(p.id);
      friends.push({ ...brief(p), pub: JSON.parse(p.pub), lat: p.lat, lon: p.lon, place: p.place, locAt: p.loc_at || null,
        seenAt: u.hide_online || p.hide_online ? null : p.seen_at || null,           // hiding yours hides theirs too
        tz: ((z) => (z && z !== "UTC" ? z : null))(prefsOf(p).tz),                    // their phone's time zone: "lands 08:12 their time"
        last: last ? receipts(u, p, msgView(u.id, last, t)) : null, unread: unreadBy.get(p.id) || 0, turn: turn(u.id, last, t) });
    } else if (l.b === u.id) incoming.push(brief(p));
    else outgoing.push({ id: p.id, handle: p.handle, name: null, avatarAt: null });   // nothing of them until they say yes
  }
  return json({ now: t, me: meView(u, t), friends, groups: await groupsForSync(env, u, t), incoming, outgoing, emailOn: emailReady(env), gifsOn: gifsReady(env),
    passkeys: pks.map((p) => ({ id: p.id, label: p.label, createdAt: p.created_at, usedAt: p.used_at, unlocks: !!p.unlocks })) });
}

/* ---------------- messages ---------------- */
async function listMessages({ request, env }) {
  const u = await requireUser(request, env);
  const other = new URL(request.url).searchParams.get("with") || "";
  const D = await db(env), t = Date.now();
  if (!(await areFriends(D, u.id, other))) throw new HttpError(403, "You can only read scrolls from your flock.");
  const them = await D.prepare("SELECT no_receipts FROM pg_users WHERE id = ?").bind(other).first();
  // yours waiting to take off show (to you only); theirs only once they're in the air
  const { results } = await D.prepare(`SELECT * FROM (SELECT * FROM pg_msgs WHERE ((sender = ?1 AND recipient = ?2) OR (sender = ?2 AND recipient = ?1)) AND (sender = ?1 OR sent_at <= ?3)
    ORDER BY sent_at DESC LIMIT 300) ORDER BY sent_at`).bind(u.id, other, t).all();
  const { results: stops } = await D.prepare("SELECT * FROM pg_msgs WHERE via = ?1 AND sender = ?2 AND sent_at <= ?3 ORDER BY sent_at DESC LIMIT 50").bind(u.id, other, t).all();
  const views = [...results.map((m) => receipts(u, them, msgView(u.id, m, t))), ...stops.map((m) => stopView(u.id, m, t))].sort((a, b) => a.sentAt - b.sentAt);
  return json({ now: t, messages: views, reacts: await reactsFor(env, u.id, results.map((m) => m.id)), turn: turn(u.id, results.filter((m) => m.sent_at <= t).at(-1), t), swift: swiftState(u, t).count, turbo: loft(u, "turbo", t).count, rocket: loft(u, "rocket", t).count });
}

async function sendMessage({ request, env, waitUntil }) {
  const u = await requireUser(request, env);
  await limit(env, "send:" + u.id, 120, 60 * 60e3);
  let meta, photo = null;
  if (Number(request.headers.get("Content-Length")) > MAX_PHOTO + MAX_CT + 4096) throw new HttpError(413, "That photo is too large. Try a smaller one.");
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
  if (await D.prepare("SELECT 1 FROM pg_msgs WHERE id = ?").bind(id).first()) throw new HttpError(409, "That scroll was already sent.");
  if (!u.lat && u.lat !== 0) throw new HttpError(409, "Set your roost in the Roost tab before sending pigeons.");
  if (!(await areFriends(D, u.id, to))) throw new HttpError(403, "You can only send pigeons to your flock.");
  const r = await D.prepare("SELECT lat, lon, place FROM pg_users WHERE id = ?").bind(to).first();

  // Standard pigeons are free but only fly when it's your turn. Swift (2×),
  // turbo (3×) and rocket (9×) fly any time, and each one sent leaves the loft.
  // A phone that doesn't say which (older versions) sends standard if it can,
  // else swift.
  const tn = turn(u.id, await lastBetween(D, u.id, to, t), t);
  // Scheduled: told when to land, it waits in the loft and takes off in time.
  // Standard pigeons can't wait for a turn that far ahead, so it's swift or faster.
  const landAt = meta.landAt == null ? null : Number(meta.landAt);
  if (landAt != null && !(Number.isFinite(landAt) && landAt > t && landAt <= t + MAX_SCHEDULE)) throw new HttpError(400, "Pick a time in the next 30 days for it to land.");
  const kind = Object.hasOwn(PIGEONS, meta.pigeon) ? meta.pigeon : tn.free && landAt == null ? "standard" : "swift";
  if (landAt != null && PIGEONS[kind].waits) throw new HttpError(409, "Scheduled pigeons are swift, turbo or rocket pigeons.");
  if (PIGEONS[kind].waits && !tn.free) throw new HttpError(409, "It isn’t your turn yet. Send a swift, turbo or rocket pigeon to write now.");
  const swift = PIGEONS[kind].waits ? 0 : 1;
  const hasTo = r && r.lat != null;
  const risky = u.risky ? 1 : 0, speed = PIGEONS[kind].speed * (risky ? RISKY_SPEED : 1);
  // A stopover: it rests an hour with a friend you both have, who can read it
  // (their own sealed copy) and add a line for the recipient, then flies on.
  const via = meta.via == null ? null : await stopover(D, u, to, r, String(meta.via), String(meta.viaCt || ""), landAt);
  let km, w, flight;
  if (via) {
    const [w1, w2] = await windsFor(env, [[u.lat, u.lon, via.lat, via.lon], [via.lat, via.lon, r.lat, r.lon]]);
    const k1 = haversineKm(u.lat, u.lon, via.lat, via.lon), k2 = haversineKm(via.lat, via.lon, r.lat, r.lon);
    const f1 = Math.round(flightMs(k1 / w1.f, speed)), f2 = Math.round(flightMs(k2 / w2.f, speed));
    Object.assign(via, { at: t + f1, off: t + f1 + LAYOVER });
    km = k1 + k2; flight = f1 + LAYOVER + f2;
    w = { wind: w1.wind == null || w2.wind == null ? w1.wind ?? w2.wind : (w1.wind * k1 + w2.wind * k2) / Math.max(1, km), f: (k1 / w1.f + k2 / w2.f) ? km / (k1 / w1.f + k2 / w2.f) : 1 };
  } else {
    km = hasTo ? haversineKm(u.lat, u.lon, r.lat, r.lon) : DEFAULT_KM;
    [w] = hasTo ? await windsFor(env, [[u.lat, u.lon, r.lat, r.lon]]) : [{ wind: null, f: 1 }];     // the weather along the way
    flight = Math.round(flightMs(km / w.f, speed));
  }
  const off = landAt == null ? t : Math.round(landAt) - flight;                 // take-off
  if (off < t) throw new HttpError(409, `That’s too soon: a ${kind} pigeon takes ${waitText(flight)} to get there.`);
  const deliver = off + flight;
  if (PIGEONS[kind].max) {
    const p = PIGEONS[kind], l = loft(u, kind, t);
    if (l.count <= 0) throw new HttpError(409, `No ${kind} pigeons left. The next one hatches in ${waitText(l.nextAt - t)}.`);
    const [n, at] = l.count >= p.max ? [l.count - 1, t] : [l.count - 1, l.at + l.hatched * p.every];
    // only if the loft is still as we read it, so two sends at once can't share a pigeon
    const r = await D.prepare(`UPDATE pg_users SET ${p.col} = ?, ${p.atCol} = ? WHERE id = ? AND ${p.col} IS ? AND ${p.atCol} IS ?`).bind(n, at, u.id, u[p.col], u[p.atCol]).run();
    if (!r.meta.changes) throw new HttpError(409, "Another pigeon just left. Try again.");
  }
  // Pigeon Death: 1 in 100 is lost somewhere between 15% and 85% of the way
  const roll = crypto.getRandomValues(new Uint32Array(2));
  let lostAt = risky && roll[0] / 2 ** 32 < RISKY_LOSS ? Math.round(off + (0.15 + 0.7 * (roll[1] / 2 ** 32)) * (deliver - off)) : null;
  if (via && lostAt != null && lostAt >= via.at && lostAt < via.off) lostAt = via.off + (lostAt - via.at);   // never while resting with a friend
  if (photo) await env.BIO_R2.put(`pigeon/${id}`, photo.stream(), { httpMetadata: { contentType: "application/octet-stream" } });
  try {
    await D.prepare(`INSERT INTO pg_msgs (id, sender, recipient, ct, photo, photo_size, swift, pigeon, risky, lost_at, km, sent_at, deliver_at, expires_at,
      from_lat, from_lon, from_place, to_lat, to_lon, to_place, wind, wind_f, sched, skin, via, via_ct, via_at, via_off, via_place, legs)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, u.id, to, ct, photo ? 1 : 0, photo ? photo.size : null, swift, kind, risky, lostAt, km, off, deliver, photo ? (lostAt ?? deliver + PHOTO_TTL) : null,
        u.lat, u.lon, u.place, hasTo ? r.lat : null, hasTo ? r.lon : null, hasTo ? r.place : null, w.wind, w.f, landAt == null ? null : 1, u.skin || null,
        via?.id ?? null, via?.ct ?? null, via?.at ?? null, via?.off ?? null, via?.place ?? null,
        // the map draws it resting there: two stops at the same spot
        via ? JSON.stringify([[via.lat, via.lon, via.at], [via.lat, via.lon, via.off]]) : null).run();
  } catch (e) {
    if (photo && !String(e).includes("UNIQUE")) await env.BIO_R2.delete(`pigeon/${id}`);
    if (String(e).includes("UNIQUE")) throw new HttpError(409, "That scroll was already sent.");
    throw e;
  }
  const m = await D.prepare("SELECT * FROM pg_msgs WHERE id = ?").bind(id).first();
  if (landAt == null) waitUntil(pigeonSent(env, u, to, deliver, kind).catch(() => {}));       // scheduled: told when it takes off
  const me = landAt == null ? null : await D.prepare("SELECT * FROM pg_users WHERE id = ?").bind(u.id).first();
  return json({ message: msgView(u.id, m, t), ...(me ? { me: meView(me, t) } : {}) });
}

// A scheduled pigeon that hasn't taken off yet: it never leaves. No one was
// told about it, so it just goes, and the pigeon goes back in its loft.
async function cancelScheduled(env, D, u, m, t) {
  const r = await D.prepare("DELETE FROM pg_msgs WHERE id = ?1 AND sender = ?2 AND sent_at > ?3").bind(m.id, u.id, t).run();
  if (!r.meta.changes) throw new HttpError(409, "It’s just taken off. Try again to call it back.");
  if (m.photo === 1 && env.BIO_R2) await env.BIO_R2.delete(`pigeon/${m.id}`);
  const p = PIGEONS[m.pigeon];
  for (let i = 0; p?.max && i < 3; i++) {
    const me = await D.prepare("SELECT * FROM pg_users WHERE id = ?").bind(u.id).first(), l = loft(me, m.pigeon, t);
    // one more in the loft; a full loft stops hatching, so its clock restarts from now
    const at = l.count + 1 >= p.max ? t : l.at + l.hatched * p.every;
    const ok = await D.prepare(`UPDATE pg_users SET ${p.col} = ?, ${p.atCol} = ? WHERE id = ? AND ${p.col} IS ? AND ${p.atCol} IS ?`).bind(l.count + 1, at, u.id, me[p.col], me[p.atCol]).run();
    if (ok.meta.changes) break;
  }
  const me = await D.prepare("SELECT * FROM pg_users WHERE id = ?").bind(u.id).first();
  return json({ cancelled: m.id, me: meView(me, t) });
}

// Checks a stopover and finds where it is: a friend of you both, with a location.
async function stopover(D, u, to, r, viaId, viaCt, landAt) {
  if (landAt != null) throw new HttpError(400, "A scheduled pigeon can’t make a stopover.");
  if (!UUID_RE.test(viaId) || viaId === to || viaId === u.id) throw new HttpError(400, "Pick a friend for it to stop with.");
  if (viaCt.length < 20 || viaCt.length > MAX_CT) throw new HttpError(400, "That scroll was malformed.");
  if (!(await areFriends(D, u.id, viaId)) || !(await areFriends(D, viaId, to))) throw new HttpError(403, "It can only stop with a friend you both have.");
  const v = await D.prepare("SELECT id, lat, lon, place FROM pg_users WHERE id = ?").bind(viaId).first();
  if (v?.lat == null || r?.lat == null) throw new HttpError(409, "A stopover needs both friends’ locations.");
  return { ...v, ct: viaCt };
}
// The friend it stops with adds a line, sealed for the recipient, while it rests with them.
async function stopoverNote({ request, env }) {
  const u = await requireUser(request, env);
  await limit(env, "note:" + u.id, 60, 60 * 60e3);
  const b = await body(request), id = String(b.id || ""), ct = String(b.ct || ""), D = await db(env), t = Date.now();
  if (!UUID_RE.test(id) || ct.length < 20 || ct.length > 4000) throw new HttpError(400, "That line was malformed.");
  const m = await D.prepare("SELECT * FROM pg_msgs WHERE id = ? AND via = ?").bind(id, u.id).first();
  if (!m) throw new HttpError(404, "That pigeon isn’t stopping with you.");
  if (t < m.via_at) throw new HttpError(409, "It hasn’t reached you yet.");
  const r = await D.prepare("UPDATE pg_msgs SET via_note = ?1 WHERE id = ?2 AND via = ?3 AND via_note IS NULL AND via_off > ?4 AND (lost_at IS NULL OR lost_at > ?4)").bind(ct, id, u.id, t).run();
  if (!r.meta.changes) throw new HttpError(409, m.via_note ? "You’ve already added a line." : "Too late: it has flown on.");
  return json({ ok: true });
}
// What the friend on the way sees: whose pigeon, to whom, when, and (once it reaches them) what it says.
function stopView(me, m, t) {
  const lost = m.lost_at != null && t >= m.lost_at, here = !lost && t >= m.via_at;
  return { id: m.id, from: m.sender, to: me, stopover: true, finalTo: m.recipient, pigeon: m.pigeon, skin: m.skin || null, risky: !!m.risky,
    sentAt: m.sent_at, viaAt: m.via_at, viaOff: m.via_off, deliverAt: m.via_at, km: null, flying: !lost && t < m.via_at, resting: here && t < m.via_off,
    lost, recalled: lost && !!m.recalled, ct: here || (!lost && t >= m.via_off) ? m.via_ct : null, mine: m.via_note || null, photo: 0 };
}

// Call a pigeon back while it's still in the air: a swift pigeon flies after it.
// It never arrives, what it carried is deleted, and it's the sender's turn again.
async function recallMessage({ request, env }) {
  const u = await requireUser(request, env);
  await limit(env, "recall:" + u.id, 30, 60 * 60e3);
  const id = String((await body(request)).id || ""), D = await db(env), t = Date.now();
  const m = UUID_RE.test(id) && await D.prepare("SELECT * FROM pg_msgs WHERE id = ? AND sender = ?").bind(id, u.id).first();
  if (!m) throw new HttpError(404, "That pigeon isn’t yours to call back.");
  if (t >= m.deliver_at || (m.lost_at != null && t >= m.lost_at)) throw new HttpError(409, "Too late: that pigeon has already landed.");
  if (t < m.sent_at) return cancelScheduled(env, D, u, m, t);
  await spendSwift(D, u, t);
  // (notified_at: nobody is told it was lost; it wasn't, it came home)
  const r = await D.prepare(`UPDATE pg_msgs SET lost_at = ?1, recalled = 1, notified_at = ?1, ct = '', via_ct = CASE WHEN via IS NULL THEN NULL ELSE '' END, via_note = NULL, photo = CASE WHEN photo = 1 THEN 2 ELSE photo END
    WHERE id = ?2 AND sender = ?3 AND deliver_at > ?1 AND (lost_at IS NULL OR lost_at > ?1)`).bind(t, id, u.id).run();
  if (!r.meta.changes) throw new HttpError(409, "Too late: that pigeon has already landed.");
  if (m.photo === 1 && env.BIO_R2) await env.BIO_R2.delete(`pigeon/${id}`);
  const fresh = await D.prepare("SELECT * FROM pg_msgs WHERE id = ?").bind(id).first();
  const me = await D.prepare("SELECT * FROM pg_users WHERE id = ?").bind(u.id).first();
  return json({ message: msgView(u.id, fresh, t), me: meView(me, t) });
}

async function markRead({ request, env }) {
  const u = await requireUser(request, env);
  const other = String((await body(request)).with || "");
  await (await db(env)).prepare("UPDATE pg_msgs SET read_at = ?1 WHERE recipient = ?2 AND sender = ?3 AND read_at IS NULL AND deliver_at <= ?1 AND lost_at IS NULL").bind(Date.now(), u.id, other).run();
  return json({ ok: true });
}

async function getPhoto({ request, env }, id) {
  const u = await requireUser(request, env);
  if (!UUID_RE.test(id || "")) throw new HttpError(404, "No such photo.");
  const m = await (await db(env)).prepare("SELECT sender, recipient, photo, deliver_at, expires_at, lost_at FROM pg_msgs WHERE id = ?").bind(id).first();
  const t = Date.now();
  if (!m || (m.sender !== u.id && m.recipient !== u.id)) throw new HttpError(404, "No such photo.");
  if (m.photo !== 1 || t >= m.expires_at) throw new HttpError(410, "This photo has flown away.");
  if (m.recipient === u.id && m.lost_at != null && t >= m.lost_at) throw new HttpError(410, "This photo was lost with its pigeon.");
  if (m.recipient === u.id && t < m.deliver_at) throw new HttpError(425, "This photo is still in flight.");
  const obj = env.BIO_R2 && (await env.BIO_R2.get(`pigeon/${id}`));
  if (!obj) throw new HttpError(410, "This photo has flown away.");
  return new Response(obj.body, { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
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
async function notifyPasswordChanged(env, u, how, origin) {
  if (!emailReady(env)) return;
  const { text, html } = emailBody({
    origin, icon: "shield", title: "Your password was changed",
    preheader: `The password for @${u.handle} was just changed.`,
    lines: [`Hi ${String(u.name).trim().split(/\s+/)[0]}, the password for your InFlight account was just changed. Your messages are still safe.`,
      "If this wasn’t you, reply to this email straight away."],
    rows: [["Account", `@${u.handle}`], ["Changed", how], ["When", ukTime(Date.now())]],
    button: { label: "Review Your Account", url: `${origin}/pigeon/#account` },
  });
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
  waitUntil(notifyPasswordChanged(env, u, "In the app", linkOrigin(request)));
  return json({ ok: true });
}

// Always answers the same way, so it can't be used to find out who has an account.
async function resetRequest({ request, env, waitUntil }) {
  await limit(env, "resetreq:" + clientIp(request), 5, 60 * 60e3);
  const email = String((await body(request)).email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "That doesn’t look like an email address.", "email");
  if (!emailReady(env)) throw new HttpError(503, "Reset emails aren’t switched on yet. Ask the person who runs InFlight for a reset link.");
  const u = await (await db(env)).prepare("SELECT * FROM pg_users WHERE email = ?").bind(email).first();
  // limit by email, existing or not, so the timing is the same either way
  const allowed = await limit(env, "resetmail:" + hex(await sha256(email)).slice(0, 24), 3, 60 * 60e3).then(() => !!u, () => false);
  if (allowed) {
    const token = await createReset(env, u.id, "user", RESET_TTL_EMAIL);
    const { text, html } = emailBody({
      origin: linkOrigin(request), icon: "key", title: "Reset your password",
      preheader: "A link to choose a new password. It works once, for the next hour.",
      lines: [`Hi ${String(u.name).trim().split(/\s+/)[0]}, someone asked to reset the password for your InFlight account.`,
        "If it wasn’t you, ignore this email. Your password won’t change."],
      rows: [["Account", `@${u.handle}`], ["Link works", "Once, for 1 hour"]],
      button: { label: "Choose a New Password", url: resetUrl(request, token) },
    });
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
  waitUntil(notifyPasswordChanged(env, u, "With a reset link", linkOrigin(request)));
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
  return json({ authed, configured: !!env.EDIT_PASSWORD, email: authed ? emailReady(env) : undefined,
    from: authed ? emailFrom(env) : undefined, testTo: authed ? ownerEmail(env) : undefined });
}
async function adminUsers({ request, env }) {
  await requireAdmin(request, env);
  const D = await db(env), t = Date.now();
  const { results } = await D.prepare(`
    SELECT u.id, u.name, u.handle, u.email, u.place, u.created_at, u.avatar_at, u.swift, u.swift_at, u.turbo, u.turbo_at, u.rocket, u.rocket_at,
      MAX(COALESCE(u.seen_at, 0), COALESCE((SELECT MAX(seen_at) FROM pg_sessions s WHERE s.user_id = u.id), 0)) AS last_seen,
      (SELECT COUNT(*) FROM pg_sessions s WHERE s.user_id = u.id) AS sessions,
      (SELECT COUNT(*) FROM pg_passkeys p WHERE p.user_id = u.id) AS passkeys,
      (SELECT COUNT(*) FROM pg_passkeys p WHERE p.user_id = u.id AND p.vault IS NOT NULL) AS unlocking,
      (SELECT COUNT(*) FROM pg_links l WHERE l.status = 'ok' AND (l.a = u.id OR l.b = u.id)) AS friends,
      (SELECT COUNT(*) FROM pg_msgs m WHERE m.sender = u.id) + (SELECT COUNT(*) FROM pg_gmsgs m WHERE m.sender = u.id) AS sent,
      (SELECT COUNT(*) FROM pg_group_members g WHERE g.user_id = u.id) AS groups
    FROM pg_users u ORDER BY u.created_at DESC LIMIT 1000`).all();
  // a group message counts once; each of its pigeons still in the air counts as flying
  const totals = await D.prepare(`SELECT (SELECT COUNT(*) FROM pg_msgs) + (SELECT COUNT(*) FROM pg_gmsgs) AS msgs,
    (SELECT COUNT(*) FROM pg_msgs WHERE deliver_at > ?1 AND (lost_at IS NULL OR lost_at > ?1)) + (SELECT COUNT(*) FROM pg_gdeliv WHERE deliver_at > ?1 AND (lost_at IS NULL OR lost_at > ?1)) AS flying,
    (SELECT COUNT(*) FROM pg_groups) AS groups`).bind(t).first();
  const users = results.map(({ swift, swift_at, turbo, turbo_at, rocket, rocket_at, ...u }) => {
    const row = { swift, swift_at, turbo, turbo_at, rocket, rocket_at };
    return { ...u, pigeons: Object.fromEntries(GIFTABLE.map((k) => [k, loft(row, k, t).count])) };
  });
  return json({ now: t, users, totals });
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
    const { text, html } = emailBody({
      origin: linkOrigin(request), icon: "key", title: "Reset your password",
      preheader: "Here’s a link to choose a new password for InFlight.",
      lines: [`Hi ${String(u.name).trim().split(/\s+/)[0]}, here’s a link to choose a new password for your InFlight account.`,
        "If you didn’t ask for this, you can ignore it. Your password won’t change."],
      rows: [["Account", `@${u.handle}`], ["Link works", "Once, for 1 hour"]],
      button: { label: "Choose a New Password", url: resetUrl(request, token) },
    });
    await sendEmail(env, { to: u.email, subject: "Reset your InFlight password", text, html }, { explain: true });
    await adminLog(env, "reset-emailed", u.id, `@${u.handle}`);
    return json({ message: `Reset link emailed to ${u.email}. It works for one hour.` });
  }
  const token = await createReset(env, u.id, "admin-link", RESET_TTL_ADMIN);
  await adminLog(env, "reset-link", u.id, `@${u.handle}`);
  return json({ url: resetUrl(request, token), message: `One-time link for @${u.handle}. It works for 24 hours. Send it to them privately.` });
}
// Someone's profile picture, for the admin's account list.
async function adminAvatar({ request, env }, id) {
  await requireAdmin(request, env);
  const obj = env.BIO_R2 && (await env.BIO_R2.get(avatarKey(String(id || ""))));
  if (!obj) throw new HttpError(404, "No picture.");
  return new Response(obj.body, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" } });
}
// Give someone extra swift, turbo or rocket pigeons, even past a full loft.
// (Standard and dumb pigeons are unlimited: they just wait their turn.)
const GIFTABLE = ["swift", "turbo", "rocket"], GIFT_CAP = 99;
async function adminPigeons({ request, env }) {
  await requireAdmin(request, env, true);
  const b = await body(request), u = await adminTarget(env, b), t = Date.now();
  const kind = String(b.kind || ""), add = Math.floor(Number(b.add));
  if (!GIFTABLE.includes(kind)) throw new HttpError(400, "Choose swift, turbo or rocket.");
  if (!(add >= 1 && add <= GIFT_CAP)) throw new HttpError(400, `Add between 1 and ${GIFT_CAP}.`);
  const p = PIGEONS[kind], l = loft(u, kind, t), n = Math.min(GIFT_CAP, l.count + add);
  // keep the hatching clock where it was, so a gift doesn't delay the next one
  const at = l.count >= p.max ? t : l.at + l.hatched * p.every;
  await (await db(env)).prepare(`UPDATE pg_users SET ${p.col} = ?, ${p.atCol} = ? WHERE id = ?`).bind(n, at, u.id).run();
  await adminLog(env, "pigeons-added", u.id, `@${u.handle} · +${n - l.count} ${kind} (now ${n})`);
  return json({ count: n, message: n - l.count ? `@${u.handle} now has ${n} ${kind} pigeon${n === 1 ? "" : "s"}.` : `@${u.handle} already has the most ${kind} pigeons (${GIFT_CAP}).` });
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
  await adminLog(env, "deleted", u.id, `@${u.handle}`);
  return json({ message: `@${u.handle} and their scrolls were deleted.` });
}
// Resend's "first email": proves the key and sender work, to the owner's own inbox.
const ownerEmail = (env) => env.PIGEON_ADMIN_EMAIL || env.CONTACT_TO || "georgefarrowgreen@icloud.com";
async function adminTestEmail({ request, env }) {
  await requireAdmin(request, env, true);
  if (!emailReady(env)) throw new HttpError(503, "Add RESEND_API_KEY in Cloudflare first, then redeploy.");
  const to = ownerEmail(env);
  const { text, html } = emailBody({
    origin: linkOrigin(request), icon: "bird", title: "Email is working",
    preheader: "InFlight can send password resets and notifications.",
    lines: ["This is a test from the InFlight admin page. Password resets and notifications will arrive just like this."],
    rows: [["From", emailFrom(env).replace(/^.*<|>$/g, "")], ["Sent", ukTime(Date.now())]],
    button: { label: "Back to Admin", url: `${linkOrigin(request)}/pigeon/admin/` },
  });
  await sendEmail(env, { to, subject: "InFlight email is working", text, html }, { explain: true });
  await adminLog(env, "test-email", null, to);
  return json({ message: `Test email sent to ${to} from ${emailFrom(env)}. Check your inbox.` });
}
async function adminLogList({ request, env }) {
  await requireAdmin(request, env);
  const { results } = await (await db(env)).prepare("SELECT * FROM pg_admin_log ORDER BY id DESC LIMIT 100").all();
  return json({ log: results });
}

/* ---------------- router ---------------- */
/* ---------------- notifications ---------------- */
async function pushKey({ request, env }) {
  await requireUser(request, env);
  return json({ key: (await vapid(env)).pub });
}
async function pushSubscribe({ request, env }) {
  const u = await requireUser(request, env);
  const b = await body(request), endpoint = String(b.endpoint || ""), p256dh = String(b.keys?.p256dh || ""), auth = String(b.keys?.auth || "");
  if (!pushEndpointOk(endpoint) || endpoint.length > 1000) throw new HttpError(400, "This browser’s push service isn’t supported.");
  if (fromB64url(p256dh).length !== 65 || fromB64url(auth).length !== 16) throw new HttpError(400, "That push subscription was malformed.");
  const D = await db(env);
  await D.prepare("DELETE FROM pg_push WHERE user_id = ? AND session = ? AND endpoint != ?").bind(u.id, u.sessionHash, endpoint).run();
  await D.prepare("INSERT OR REPLACE INTO pg_push (endpoint, user_id, session, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(endpoint, u.id, u.sessionHash, p256dh, auth, Date.now()).run();
  await D.prepare("DELETE FROM pg_push WHERE user_id = ?1 AND endpoint NOT IN (SELECT endpoint FROM pg_push WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 10)").bind(u.id).run();
  return json({ ok: true });
}
async function pushUnsubscribe({ request, env }) {
  const u = await requireUser(request, env);
  const endpoint = String((await body(request)).endpoint || "");
  await (await db(env)).prepare("DELETE FROM pg_push WHERE user_id = ? AND (endpoint = ? OR session = ?)").bind(u.id, endpoint, u.sessionHash).run();
  return json({ ok: true });
}
async function pushTest({ request, env }) {
  const u = await requireUser(request, env);
  await limit(env, "pushtest:" + u.id, 10, 60 * 60e3);
  const n = await pushTo(env, u.id, { title: "InFlight", body: "Notifications are on. You’ll hear when a pigeon lands.", tag: "test", url: "/pigeon/" });
  return json({ sent: n });
}
async function notifyTick({ request, env }) {
  tickAuthOk(request, env);
  return json(await tick(env, linkOrigin(request)));
}
// The link at the bottom of notification emails. GET shows a button (so mail
// scanners that follow links don't unsubscribe anyone); POST turns email off,
// which also serves one-click unsubscribe (RFC 8058).
const unsubPage = (title, msg, form) => new Response(`<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta name="color-scheme" content="light dark"><title>InFlight Emails</title>
<style>
  :root{--bg:#f2f2f7;--card:#fff;--label:#1c1c1e;--label-2:#6e6e73;--tint:#0a7aff}
  @media (prefers-color-scheme:dark){:root{--bg:#1c1c1f;--card:#2a2a2e;--label:#f5f5f7;--label-2:#a1a1a6;--tint:#3d9bff}}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px;background:var(--bg);color:var(--label);font:17px/1.35 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;letter-spacing:-.41px;-webkit-font-smoothing:antialiased}
  main{width:100%;max-width:380px;display:flex;flex-direction:column;align-items:center;text-align:center}
  img{width:88px;height:88px;border-radius:22px;box-shadow:0 10px 30px -10px rgba(10,111,240,.5);margin-bottom:22px}
  h1{margin:0 0 10px;font-size:28px;line-height:34px;font-weight:700;letter-spacing:.2px}
  p{margin:0 0 26px;color:var(--label-2);font-size:17px;line-height:23px;text-wrap:balance}
  form{width:100%}
  .btn{display:flex;align-items:center;justify-content:center;width:100%;min-height:52px;border:0;border-radius:999px;background:var(--tint);color:#fff;font:600 17px -apple-system,BlinkMacSystemFont,system-ui,sans-serif;text-decoration:none;cursor:pointer}
  .btn.plain{background:none;color:var(--tint);margin-top:6px}
</style></head>
<body><main><img src="/pigeon/icon-192.png" alt=""><h1>${title}</h1><p>${msg}</p>${form || `<a class="btn" href="/pigeon/">Open InFlight</a>`}</main></body></html>`,
  { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" } });
async function unsubUser(env, request) {
  const q = new URL(request.url).searchParams, id = q.get("u") || "", tok = q.get("t") || "";
  const u = UUID_RE.test(id) && tok ? await (await db(env)).prepare("SELECT id, unsub FROM pg_users WHERE id = ?").bind(id).first() : null;
  return u && u.unsub && safeEqual(u.unsub, tok) ? u : null;
}
async function unsubscribeGet({ request, env }) {
  if (!(await unsubUser(env, request))) return unsubPage("Link expired", "This link doesn’t work any more. You can turn emails off in InFlight, under Account → Notifications.");
  const q = new URL(request.url).search.replace(/"/g, "");
  return unsubPage("Turn off emails?", "You won’t get emails when pigeons land or friends add you. Notifications on your phone aren’t affected.",
    `<form method="post" action="/api/pigeon/unsubscribe${q}"><button class="btn">Turn Off Emails</button></form><a class="btn plain" href="/pigeon/">Keep Them On</a>`);
}
async function unsubscribePost({ request, env }) {
  const u = await unsubUser(env, request);
  if (!u) return unsubPage("Link expired", "This link doesn’t work any more. You can turn emails off in InFlight, under Account → Notifications.");
  await (await db(env)).prepare("UPDATE pg_users SET notify_email = 0 WHERE id = ?").bind(u.id).run();
  return unsubPage("Emails turned off", "InFlight won’t email you any more. You can turn them back on any time in Account → Notifications.");
}

const ROUTES = {
  "POST signup": signup, "POST salt": salt, "POST login": login, "POST logout": logout, "GET vault": vault,
  "PATCH me": updateMe, "DELETE me": deleteMe,
  "POST passkey-options": passkeyOptions, "POST passkey-register": passkeyRegister, "POST passkey-vault": passkeyVault,
  "POST passkey-login": passkeyLogin, "DELETE passkey": passkeyDelete,
  "GET sync": sync,
  "POST friends": addFriend, "POST friends-respond": respondFriend, "DELETE friends": removeFriend,
  "GET messages": listMessages, "POST messages": sendMessage, "POST read": markRead, "POST recall": recallMessage, "POST stopover-note": stopoverNote, "GET mutuals": mutuals,
  "GET photo": getPhoto,
  "POST avatar": putAvatar, "DELETE avatar": deleteAvatar, "GET avatar": getAvatar,
  "POST password": changePassword, "POST reset-request": resetRequest, "POST reset-check": resetCheck, "POST reset-complete": resetComplete,
  "GET admin-status": adminStatus, "GET admin-users": adminUsers, "POST admin-reset": adminReset,
  "POST admin-signout": adminSignOut, "POST admin-pigeons": adminPigeons, "GET admin-avatar": adminAvatar, "POST admin-delete": adminDelete, "GET admin-log": adminLogList,
  "POST admin-test-email": adminTestEmail,
  "GET push-key": pushKey, "POST push-sub": pushSubscribe, "DELETE push-sub": pushUnsubscribe, "POST push-test": pushTest,
  "POST notify-tick": notifyTick, "GET unsubscribe": unsubscribeGet, "POST unsubscribe": unsubscribePost,
  ...GROUP_ROUTES, ...GIF_ROUTES, ...REACT_ROUTES, ...STATS_ROUTES, ...SKIES_ROUTES, ...WINDMAP_ROUTES,
};

export async function onRequest(ctx) {
  const parts = new URL(ctx.request.url).pathname.replace(/^\/api\/pigeon\/?/, "").split("/");
  const handler = ROUTES[`${ctx.request.method} ${parts[0]}`];
  // pigeons land on a timer; let ordinary traffic notice them (at most once a minute)
  if (ctx.env.DB && parts[0] !== "notify-tick") ctx.waitUntil(maybeTick(ctx.env, linkOrigin(ctx.request)).catch((e) => console.error("pigeon tick", e && e.message)));
  try {
    if (!handler) throw new HttpError(404, "Not found.");
    return await handler(ctx, parts[1]);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, field: e.field }, e.status);
    console.error("pigeon", e && e.stack || e);
    return json({ error: "Something went wrong on our side. Try again in a moment." }, 500);
  }
}
