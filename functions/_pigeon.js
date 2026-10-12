// InFlight (/pigeon) — the server half.
//
// What this side knows: accounts (email, handle, a hash of a password-derived
// proof), public keys, who is friends with whom, and when each pigeon lands.
// What it never sees: passwords, private keys, message text or photos. Phones
// encrypt everything before upload; this code stores and relays ciphertext.
//
// Storage: D1 (env.DB) for everything structured, R2 (env.BIO_R2) for the
// encrypted photo blobs under pigeon/. Tables are created on first use.

export const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
export const SPEED_KMH = 80;             // a homing pigeon's cruising speed
export const MIN_FLIGHT = 5 * MIN;
export const MAX_FLIGHT = 3 * DAY;
export const PHOTO_TTL = DAY;            // photos are deleted 24 h after they land
export const SWIFT_MAX = 7;              // spare pigeons; one hatches per day
export const DEFAULT_KM = 500;           // if the recipient hasn't set a roost
export const HANDLE_EVERY = DAY;         // handles can change once a day
export const MAX_AVATAR = 400 * 1024;    // the phone sends a 512px JPEG, well under this
const SESSION_TTL = 180 * DAY;

const enc = new TextEncoder();

export class HttpError extends Error {
  constructor(status, message, field) { super(message); this.status = status; this.field = field; }
}

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

/* ---------------- encoding ---------------- */
export function b64url(buf) {
  const u = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function fromB64url(str) {
  str = String(str || "").replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
export async function sha256(data) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", typeof data === "string" ? enc.encode(data) : data));
}
export const hex = (u) => [...u].map((b) => b.toString(16).padStart(2, "0")).join("");
export function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
export const randomToken = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));

/* ---------------- database ---------------- */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS pg_users (
     id TEXT PRIMARY KEY, handle TEXT NOT NULL UNIQUE, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
     pub TEXT NOT NULL, salt TEXT NOT NULL, proof_hash TEXT NOT NULL, vault TEXT NOT NULL,
     lat REAL, lon REAL, place TEXT, swift INTEGER NOT NULL, swift_at INTEGER NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS pg_sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, seen_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS pg_sessions_user ON pg_sessions(user_id)`,
  `CREATE TABLE IF NOT EXISTS pg_passkeys (
     id TEXT PRIMARY KEY, user_id TEXT NOT NULL, public_key TEXT NOT NULL, alg INTEGER NOT NULL,
     label TEXT, vault TEXT, created_at INTEGER NOT NULL, used_at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS pg_passkeys_user ON pg_passkeys(user_id)`,
  `CREATE TABLE IF NOT EXISTS pg_challenges (challenge TEXT PRIMARY KEY, mode TEXT NOT NULL, user_id TEXT, expires_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS pg_links (a TEXT NOT NULL, b TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (a, b))`,
  `CREATE INDEX IF NOT EXISTS pg_links_b ON pg_links(b)`,
  `CREATE TABLE IF NOT EXISTS pg_msgs (
     id TEXT PRIMARY KEY, sender TEXT NOT NULL, recipient TEXT NOT NULL, ct TEXT NOT NULL,
     photo INTEGER NOT NULL DEFAULT 0, photo_size INTEGER, swift INTEGER NOT NULL DEFAULT 0, km REAL NOT NULL,
     sent_at INTEGER NOT NULL, deliver_at INTEGER NOT NULL, expires_at INTEGER, read_at INTEGER,
     from_lat REAL, from_lon REAL, from_place TEXT, to_lat REAL, to_lon REAL, to_place TEXT)`,
  `CREATE INDEX IF NOT EXISTS pg_msgs_pair ON pg_msgs(sender, recipient, sent_at)`,
  `CREATE INDEX IF NOT EXISTS pg_msgs_to ON pg_msgs(recipient, read_at)`,
  `CREATE INDEX IF NOT EXISTS pg_msgs_photo ON pg_msgs(photo, expires_at)`,
  `CREATE TABLE IF NOT EXISTS pg_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS pg_meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS pg_resets (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_by TEXT NOT NULL,
     created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS pg_resets_user ON pg_resets(user_id)`,
  `CREATE TABLE IF NOT EXISTS pg_push (endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL, session TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS pg_push_user ON pg_push(user_id)`,
  `CREATE TABLE IF NOT EXISTS pg_admin_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, action TEXT NOT NULL, target TEXT, detail TEXT)`,
];
// Columns added after launch. SQLite has no "ADD COLUMN IF NOT EXISTS", so a
// duplicate-column error just means the column is already there.
const MIGRATIONS = [
  "ALTER TABLE pg_users ADD COLUMN handle_at INTEGER",   // last handle change (one a day)
  "ALTER TABLE pg_users ADD COLUMN avatar_at INTEGER",   // profile picture version, null if none
  "ALTER TABLE pg_msgs ADD COLUMN notified_at INTEGER",  // when the recipient was told it landed
  "ALTER TABLE pg_users ADD COLUMN notify_email INTEGER NOT NULL DEFAULT 0",   // email when pigeons land
  "ALTER TABLE pg_users ADD COLUMN email_at INTEGER",    // last notification email
  "ALTER TABLE pg_users ADD COLUMN unsub TEXT",          // token for the unsubscribe link
];
let schemaReady = false;
export async function db(env) {
  if (!env.DB) throw new HttpError(503, "InFlight isn’t set up on this server yet (no database).");
  if (!schemaReady) {
    await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s)));
    for (const m of MIGRATIONS) {
      try { await env.DB.prepare(m).run(); }
      catch (e) { if (!/duplicate column/i.test(String(e && (e.cause?.message || e.message)))) throw e; }
    }
    schemaReady = true;
  }
  return env.DB;
}

/* ---------------- request helpers ---------------- */
export async function body(request) {
  try { return await request.json(); } catch (_) { throw new HttpError(400, "That request wasn’t valid JSON."); }
}
export const clientIp = (request) => request.headers.get("CF-Connecting-IP") || "local";

// Fixed-window counter in D1 (strongly consistent, unlike KV).
export async function limit(env, key, max, windowMs) {
  const D = await db(env), t = Date.now();
  const row = await D.prepare("SELECT count, reset_at FROM pg_limits WHERE key = ?").bind(key).first();
  if (!row || row.reset_at < t) {
    await D.prepare("INSERT OR REPLACE INTO pg_limits (key, count, reset_at) VALUES (?, 1, ?)").bind(key, t + windowMs).run();
    return;
  }
  if (row.count >= max) throw new HttpError(429, `Too many tries. Wait ${Math.ceil((row.reset_at - t) / MIN)} minutes and try again.`);
  await D.prepare("UPDATE pg_limits SET count = count + 1 WHERE key = ?").bind(key).run();
}

// A per-install random secret (used to fake salts for unknown emails).
export async function serverSecret(env) {
  const D = await db(env);
  const row = await D.prepare("SELECT v FROM pg_meta WHERE k = 'secret'").first();
  if (row) return row.v;
  const v = randomToken(32);
  await D.prepare("INSERT OR IGNORE INTO pg_meta (k, v) VALUES ('secret', ?)").bind(v).run();
  return (await D.prepare("SELECT v FROM pg_meta WHERE k = 'secret'").first()).v;
}

/* ---------------- sessions ---------------- */
export async function issueSession(env, userId) {
  const token = randomToken(32), t = Date.now();
  await (await db(env)).prepare("INSERT INTO pg_sessions (hash, user_id, created_at, seen_at) VALUES (?, ?, ?, ?)")
    .bind(hex(await sha256(token)), userId, t, t).run();
  return token;
}
// Bearer tokens (not cookies), so there is no cross-site request forgery to defend against.
export async function requireUser(request, env) {
  const m = /^Bearer ([A-Za-z0-9_-]{20,})$/.exec(request.headers.get("Authorization") || "");
  if (!m) throw new HttpError(401, "Please sign in.");
  const D = await db(env), h = hex(await sha256(m[1])), t = Date.now();
  const s = await D.prepare("SELECT user_id, seen_at FROM pg_sessions WHERE hash = ?").bind(h).first();
  if (!s || t - s.seen_at > SESSION_TTL) throw new HttpError(401, "Your session ended. Please sign in again.");
  if (t - s.seen_at > HOUR) await D.prepare("UPDATE pg_sessions SET seen_at = ? WHERE hash = ?").bind(t, h).run();
  const u = await D.prepare("SELECT * FROM pg_users WHERE id = ?").bind(s.user_id).first();
  if (!u) throw new HttpError(401, "This account no longer exists.");
  u.sessionHash = h;
  return u;
}

/* ---------------- flights ---------------- */
export function haversineKm(aLat, aLon, bLat, bLon) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
export function flightMs(km, swift) {
  const t = Math.min(MAX_FLIGHT, Math.max(MIN_FLIGHT, (km / SPEED_KMH) * HOUR));
  return swift ? t / 2 : t;
}
// The pigeon shuttles between two people: you may send for free only when it's on your windowsill.
export function turn(me, last, t) {
  if (!last) return { free: true, state: "fresh" };
  if (last.sender === me) return { free: false, state: t < last.deliver_at ? "outbound" : "theirs" };
  if (t < last.deliver_at) return { free: false, state: "inbound" };
  return { free: true, state: "sill" };
}
export function swiftState(u, t) {
  const hatched = Math.max(0, Math.floor((t - u.swift_at) / DAY));
  const count = Math.min(SWIFT_MAX, u.swift + hatched);
  return { count, hatched, nextAt: count >= SWIFT_MAX ? null : u.swift_at + (hatched + 1) * DAY };
}

// What one phone may see of a message. An inbound scroll's ciphertext stays
// on the server until it lands.
export function msgView(me, m, t) {
  const flying = t < m.deliver_at;
  return {
    id: m.id, from: m.sender, to: m.recipient, swift: !!m.swift, km: m.km,
    sentAt: m.sent_at, deliverAt: m.deliver_at, expiresAt: m.expires_at, readAt: m.read_at,
    photo: m.photo, photoSize: m.photo_size, flying,
    route: m.from_lat == null || m.to_lat == null ? null : [m.from_lat, m.from_lon, m.to_lat, m.to_lon],
    fromPlace: m.from_place, toPlace: m.to_place,
    ct: flying && m.recipient === me ? null : m.ct,
  };
}

// Delete photo blobs whose 24 hours are up. Cheap; runs alongside syncs.
export async function sweepPhotos(env) {
  const D = await db(env);
  const { results } = await D.prepare("SELECT id FROM pg_msgs WHERE photo = 1 AND expires_at < ? LIMIT 50").bind(Date.now()).all();
  if (!results?.length) return;
  const ids = results.map((r) => r.id);
  if (env.BIO_R2) await env.BIO_R2.delete(ids.map((id) => `pigeon/${id}`));
  await D.batch(ids.map((id) => D.prepare("UPDATE pg_msgs SET photo = 2 WHERE id = ?").bind(id)));
}

/* ---------------- WebAuthn (passkeys) ----------------
   Mirrors functions/api/passkeys.js: ES256 and RS256, "none" attestation,
   verified with Web Crypto only. */
function derToRawEcdsa(der) {
  const u = new Uint8Array(der);
  let i = 0;
  if (u[i++] !== 0x30) throw new Error("bad der");
  let seqLen = u[i++];
  if (seqLen & 0x80) { const n = seqLen & 0x7f; seqLen = 0; for (let k = 0; k < n; k++) seqLen = (seqLen << 8) | u[i++]; }
  const readInt = () => { if (u[i++] !== 0x02) throw new Error("bad der"); const len = u[i++]; const v = u.slice(i, i + len); i += len; return v; };
  const pad = (b) => {
    let s = 0; while (s < b.length - 1 && b[s] === 0) s++;
    b = b.slice(s); const out = new Uint8Array(32); out.set(b.slice(-32), 32 - Math.min(32, b.length)); return out;
  };
  const out = new Uint8Array(64); out.set(pad(readInt()), 0); out.set(pad(readInt()), 32);
  return out;
}
export function rpIdFor(request) { return new URL(request.url).hostname; }
function originOk(origin, request) {
  try {
    const o = new URL(origin), here = new URL(request.url);
    if (o.hostname === "localhost" || o.hostname === "127.0.0.1") return here.hostname === o.hostname;
    return o.protocol === "https:" && o.host === here.host;
  } catch (_) { return false; }
}
export async function newChallenge(env, mode, userId) {
  const c = randomToken(32), D = await db(env);
  await D.prepare("DELETE FROM pg_challenges WHERE expires_at < ?").bind(Date.now()).run();
  await D.prepare("INSERT INTO pg_challenges (challenge, mode, user_id, expires_at) VALUES (?, ?, ?, ?)").bind(c, mode, userId || null, Date.now() + 5 * MIN).run();
  return c;
}
async function takeChallenge(env, c, mode, userId) {
  const D = await db(env);
  const row = await D.prepare("SELECT * FROM pg_challenges WHERE challenge = ?").bind(String(c || "")).first();
  if (!row) throw new HttpError(400, "That passkey request expired. Try again.");
  await D.prepare("DELETE FROM pg_challenges WHERE challenge = ?").bind(row.challenge).run();
  if (row.mode !== mode || row.expires_at < Date.now() || (userId && row.user_id !== userId)) throw new HttpError(400, "That passkey request expired. Try again.");
}
export async function checkClientData(env, request, b, type, mode, userId) {
  await takeChallenge(env, b.challenge, mode, userId);
  const cd = JSON.parse(new TextDecoder().decode(fromB64url(b.clientDataJSON)));
  if (cd.type !== type || cd.challenge !== b.challenge || !originOk(cd.origin, request)) throw new HttpError(400, "The passkey response didn’t match this site.");
}
export async function verifyAssertion(cred, request, b) {
  const authData = fromB64url(b.authenticatorData);
  const rpHash = await sha256(rpIdFor(request));
  for (let i = 0; i < 32; i++) if (authData[i] !== rpHash[i]) return false;
  if (!(authData[32] & 0x01)) return false;                     // user present
  const clientHash = await sha256(fromB64url(b.clientDataJSON));
  const signed = new Uint8Array(authData.length + 32);
  signed.set(authData, 0); signed.set(clientHash, authData.length);
  const spki = fromB64url(cred.public_key), sig = fromB64url(b.signature);
  if (cred.alg === -7) {
    const k = await crypto.subtle.importKey("spki", spki, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, k, derToRawEcdsa(sig), signed);
  }
  if (cred.alg === -257) {
    const k = await crypto.subtle.importKey("spki", spki, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    return crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, k, sig, signed);
  }
  return false;
}

/* ---------------- validation ---------------- */
export const HANDLE_RE = /^[a-z0-9_]{3,20}$/;
export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function cleanPub(p) {
  const ok = p && p.kty === "EC" && p.crv === "P-256" && /^[A-Za-z0-9_-]{43}$/.test(p.x || "") && /^[A-Za-z0-9_-]{43}$/.test(p.y || "");
  if (!ok) throw new HttpError(400, "That public key isn’t valid.");
  return JSON.stringify({ kty: "EC", crv: "P-256", x: p.x, y: p.y });
}
export function cleanPlace(b) {
  const lat = Number(b.lat), lon = Number(b.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new HttpError(400, "That location isn’t valid.");
  // ~10 km: enough for flight times, too coarse to find someone's street
  return { lat: Math.round(lat * 10) / 10, lon: Math.round(lon * 10) / 10, place: String(b.place || "").trim().slice(0, 60) || null };
}

/* ---------------- email (Resend) ----------------
   Needs RESEND_API_KEY and a sender on a domain verified in Resend:
   PIGEON_FROM, else CONTACT_FROM, else noreply@georgefarrowgreen.com. */
export const emailReady = (env) => !!env.RESEND_API_KEY;
// Until a domain is verified in Resend, its test sender onboarding@resend.dev
// works, but only for mail to the Resend account's own address.
export const emailFrom = (env) => env.PIGEON_FROM || env.CONTACT_FROM || "InFlight <onboarding@resend.dev>";
export async function sendEmail(env, { to, subject, text, html, headers }, { explain = false } = {}) {
  if (!emailReady(env)) throw new HttpError(503, "Email isn’t set up on this server yet.");
  const r = await fetch(env.RESEND_API_URL || "https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: emailFrom(env), to, subject, text, html, ...(headers ? { headers } : {}) }),
  });
  if (!r.ok) {
    const why = await r.json().then((d) => d.message || d.error || "", () => "");
    console.error("pigeon email", r.status, why);
    // Resend's own reason is shown to the admin only; it can mention the sending setup.
    throw new HttpError(502, explain && why ? `Resend refused the email: ${why}` : "The email couldn’t be sent. Try again in a few minutes.");
  }
}
const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export function emailBody(lines, button, { footer, unsub } = {}) {
  const text = lines.join("\n\n") + (button ? `\n\n${button.label}: ${button.url}` : "")
    + (footer ? `\n\n${footer}` : "") + (unsub ? `\nTurn these emails off: ${unsub}` : "");
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
  const html = `<div style="background:#f2f2f7;padding:24px 12px"><div style="font-family:${font};font-size:16px;line-height:1.45;color:#1c1c1e;max-width:480px;margin:0 auto;background:#ffffff;border-radius:22px;padding:26px 24px">
    <p style="font-size:20px;font-weight:700;margin:0 0 16px">InFlight</p>
    ${lines.map((l) => `<p style="margin:0 0 14px">${escHtml(l)}</p>`).join("")}
    ${button ? `<p style="margin:22px 0 18px"><a href="${escHtml(button.url)}" style="display:inline-block;background:#0a7aff;color:#ffffff;padding:13px 24px;border-radius:999px;text-decoration:none;font-weight:600">${escHtml(button.label)}</a></p>
    <p style="font-size:13px;color:#8e8e93;margin:0">Or paste this into your browser: ${escHtml(button.url)}</p>` : ""}
    ${footer || unsub ? `<p style="font-size:12px;color:#8e8e93;margin:20px 0 0;border-top:1px solid #e5e5ea;padding-top:14px">${footer ? escHtml(footer) + " " : ""}${unsub ? `<a href="${escHtml(unsub)}" style="color:#8e8e93">Turn these emails off</a>` : ""}</p>` : ""}
  </div></div>`;
  return { text, html };
}

/* ---------------- password resets ----------------
   A reset link carries a random token; only its SHA-256 is stored. Links are
   single-use, and making a new one cancels any older unused link. */
export const RESET_TTL_EMAIL = HOUR;
export const RESET_TTL_ADMIN = DAY;
export async function createReset(env, userId, by, ttl) {
  const D = await db(env), token = randomToken(32), t = Date.now();
  await D.batch([
    D.prepare("DELETE FROM pg_resets WHERE user_id = ? AND used_at IS NULL").bind(userId),
    D.prepare("INSERT INTO pg_resets (hash, user_id, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
      .bind(hex(await sha256(token)), userId, by, t, t + ttl),
  ]);
  return token;
}
export async function findReset(env, token) {
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(String(token || ""))) throw new HttpError(400, "This reset link isn’t valid. Ask for a new one.");
  const D = await db(env);
  const r = await D.prepare("SELECT * FROM pg_resets WHERE hash = ?").bind(hex(await sha256(token))).first();
  if (!r) throw new HttpError(400, "This reset link isn’t valid. Ask for a new one.");
  if (r.used_at) throw new HttpError(410, "This reset link has already been used. Ask for a new one.");
  if (r.expires_at < Date.now()) throw new HttpError(410, "This reset link has expired. Ask for a new one.");
  const u = await D.prepare("SELECT * FROM pg_users WHERE id = ?").bind(r.user_id).first();
  if (!u) throw new HttpError(410, "This account no longer exists.");
  return { reset: r, user: u };
}
export const resetUrl = (request, token) => `${new URL(request.url).origin}/pigeon/#reset=${token}`;
export function maskEmail(e) {
  const [a, b] = String(e).split("@");
  return `${a.slice(0, 2)}${"•".repeat(Math.max(1, Math.min(6, a.length - 2)))}@${b}`;
}
export async function adminLog(env, action, target, detail) {
  await (await db(env)).prepare("INSERT INTO pg_admin_log (at, action, target, detail) VALUES (?, ?, ?, ?)")
    .bind(Date.now(), action, target || null, detail || null).run();
}
