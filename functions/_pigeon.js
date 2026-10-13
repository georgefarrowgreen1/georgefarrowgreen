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
export const MAX_SCHEDULE = 30 * DAY;    // how far ahead a pigeon can be told to land
export const PHOTO_TTL = DAY;            // photos are deleted 24 h after they land
export const SWIFT_MAX = 9;              // swift pigeons: 2× speed, 9 a day
export const TURBO_MAX = 3;              // turbo pigeons: 3× speed, 3 a day
export const ROCKET_MAX = 1;             // rocket pigeons: 9× speed, 1 a day
// Pigeon Death (each person's choice): what they send flies 1.25× faster, but
// 1 in 100 never arrives. Its fate is drawn on take-off and kept secret until
// the moment it's lost, somewhere along the way.
export const RISKY_SPEED = 1.25, RISKY_LOSS = 0.01;
export const isLost = (m, t) => m.lost_at != null && t >= m.lost_at;
// how fast a message's pigeon flies: its kind, plus Pigeon Death if it was on
export const msgSpeed = (m) => PIGEONS[m.pigeon || (m.swift ? "swift" : "standard")].speed * (m.risky ? RISKY_SPEED : 1);
// Wind changes how fast a pigeon cruises (80 km/h, plus or minus what blows its
// way); the 5-minute and 3-day limits still apply after it. So it's measured
// as distance: a 25% tailwind makes the route fly like one 20% shorter.
// Kinds of pigeon. Standard is free but waits its turn; swift, turbo and rocket
// can fly any time and come from a loft that refills through the day.
export const PIGEONS = {
  standard: { speed: 1, waits: true },
  swift: { speed: 2, max: SWIFT_MAX, every: DAY / SWIFT_MAX, col: "swift", atCol: "swift_at" },
  turbo: { speed: 3, max: TURBO_MAX, every: DAY / TURBO_MAX, col: "turbo", atCol: "turbo_at" },
  rocket: { speed: 9, max: ROCKET_MAX, every: DAY / ROCKET_MAX, col: "rocket", atCol: "rocket_at" },
  // a secret: start a message with /dumb. 3× slower, waits its turn like standard
  dumb: { speed: 1 / 3, waits: true },
};
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
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers },
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
  let bin;
  try { bin = atob(str); } catch (_) { throw new HttpError(400, "That request had a malformed field."); }
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
export async function sha256(data) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", typeof data === "string" ? enc.encode(data) : data));
}
export const hex = (u) => [...u].map((b) => b.toString(16).padStart(2, "0")).join("");
export function safeEqual(a, b) {
  a = String(a); b = String(b);
  let out = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i % (b.length || 1));
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
  // Groups (functions/_groups.js). A message is stored once (body sealed under
  // its own key, which the sender keeps a sealed copy of) and flies as one
  // delivery per member: their copy of the key, distance, landing and fate.
  `CREATE TABLE IF NOT EXISTS pg_groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_by TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS pg_group_members (group_id TEXT NOT NULL, user_id TEXT NOT NULL, added_by TEXT NOT NULL, joined_at INTEGER NOT NULL,
     muted INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (group_id, user_id))`,
  `CREATE INDEX IF NOT EXISTS pg_group_members_user ON pg_group_members(user_id)`,
  `CREATE TABLE IF NOT EXISTS pg_gmsgs (id TEXT PRIMARY KEY, group_id TEXT NOT NULL, sender TEXT NOT NULL, body TEXT NOT NULL, sender_key TEXT NOT NULL,
     photo INTEGER NOT NULL DEFAULT 0, photo_size INTEGER, pigeon TEXT NOT NULL, risky INTEGER NOT NULL DEFAULT 0, sent_at INTEGER NOT NULL, expires_at INTEGER,
     from_lat REAL, from_lon REAL, from_place TEXT)`,
  `CREATE INDEX IF NOT EXISTS pg_gmsgs_group ON pg_gmsgs(group_id, sent_at)`,
  `CREATE INDEX IF NOT EXISTS pg_gmsgs_photo ON pg_gmsgs(photo, expires_at)`,
  `CREATE TABLE IF NOT EXISTS pg_gdeliv (msg_id TEXT NOT NULL, user_id TEXT NOT NULL, wrap TEXT NOT NULL, km REAL NOT NULL, deliver_at INTEGER NOT NULL,
     lost_at INTEGER, read_at INTEGER, notified_at INTEGER, to_lat REAL, to_lon REAL, to_place TEXT, legs TEXT, PRIMARY KEY (msg_id, user_id))`,
  `CREATE INDEX IF NOT EXISTS pg_gdeliv_user ON pg_gdeliv(user_id, deliver_at)`,
  // reactions (functions/_reacts.js): sealed, one per person per message
  `CREATE TABLE IF NOT EXISTS pg_reacts (id TEXT PRIMARY KEY, msg_id TEXT NOT NULL, group_id TEXT, sender TEXT NOT NULL, recipient TEXT,
     ct TEXT NOT NULL, keys TEXT, sent_at INTEGER NOT NULL, deliver_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS pg_reacts_msg ON pg_reacts(msg_id)`,
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
  "ALTER TABLE pg_users ADD COLUMN notify_prefs TEXT",  // notification settings (JSON), defaults if null
  "ALTER TABLE pg_users ADD COLUMN appearance TEXT",
  "ALTER TABLE pg_users ADD COLUMN turbo INTEGER",       // turbo pigeons in the loft; null = full
  "ALTER TABLE pg_users ADD COLUMN turbo_at INTEGER",
  "ALTER TABLE pg_msgs ADD COLUMN pigeon TEXT",          // standard, swift or turbo (older rows: from swift)
  "ALTER TABLE pg_msgs ADD COLUMN legs TEXT",            // course changes: JSON [[lat, lon, at], ...] where it turned
  "ALTER TABLE pg_users ADD COLUMN loc_at INTEGER",      // when the location last changed
  "ALTER TABLE pg_users ADD COLUMN auto_loc INTEGER NOT NULL DEFAULT 0",   // update location on opening the app
  "ALTER TABLE pg_users ADD COLUMN seen_at INTEGER",     // last time the app checked in (Last Online)
  "ALTER TABLE pg_users ADD COLUMN rocket INTEGER",      // rocket pigeons in the loft; null = full
  "ALTER TABLE pg_users ADD COLUMN rocket_at INTEGER",
  "ALTER TABLE pg_users ADD COLUMN risky INTEGER NOT NULL DEFAULT 0",   // Pigeon Death on
  "ALTER TABLE pg_msgs ADD COLUMN risky INTEGER NOT NULL DEFAULT 0",    // sent with Pigeon Death on
  "ALTER TABLE pg_msgs ADD COLUMN lost_at INTEGER",                     // when it's lost (secret until then); null = arrives
  "ALTER TABLE pg_msgs ADD COLUMN recalled INTEGER NOT NULL DEFAULT 0", // its sender called it back (lost_at = when)
  "ALTER TABLE pg_gdeliv ADD COLUMN recalled INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE pg_msgs ADD COLUMN wind REAL",            // tailwind along the route at take-off, km/h (negative: headwind)
  "ALTER TABLE pg_msgs ADD COLUMN wind_f REAL",          // what that did to its speed (1 = none)
  "ALTER TABLE pg_gdeliv ADD COLUMN wind REAL",
  "ALTER TABLE pg_gdeliv ADD COLUMN wind_f REAL",
  "ALTER TABLE pg_users ADD COLUMN hide_online INTEGER NOT NULL DEFAULT 0",   // don't show when I'm online (nor see others')
  "ALTER TABLE pg_users ADD COLUMN no_receipts INTEGER NOT NULL DEFAULT 0",   // don't send read receipts (nor see others')
  "ALTER TABLE pg_reacts ADD COLUMN notified_at INTEGER",
  "ALTER TABLE pg_msgs ADD COLUMN sched INTEGER",
  "ALTER TABLE pg_users ADD COLUMN skin TEXT",           // rare pigeon look, unlocked by an achievement (null: the usual)
  "ALTER TABLE pg_msgs ADD COLUMN skin TEXT",            // the look it flew with
  "ALTER TABLE pg_gmsgs ADD COLUMN skin TEXT",
  "ALTER TABLE pg_users ADD COLUMN weekly_at INTEGER",   // last "your week in flight"        // scheduled: 1 = waiting to take off (sent_at), 2 = took off and its recipient was told
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
  // one statement, so parallel requests can't all slip under the limit
  const row = await D.prepare(`INSERT INTO pg_limits (key, count, reset_at) VALUES (?1, 1, ?2)
    ON CONFLICT(key) DO UPDATE SET count = CASE WHEN reset_at < ?3 THEN 1 ELSE count + 1 END,
      reset_at = CASE WHEN reset_at < ?3 THEN ?2 ELSE reset_at END
    RETURNING count, reset_at`).bind(key, t + windowMs, t).first();
  if (row.count > max) throw new HttpError(429, `Too many tries. Wait ${Math.ceil((row.reset_at - t) / MIN)} minutes and try again.`);
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
// The point a fraction f of the way along the great circle from a to b.
export function gcPoint(aLat, aLon, bLat, bLon, f) {
  const r = Math.PI / 180;
  const v = (la, lo) => [Math.cos(la * r) * Math.cos(lo * r), Math.cos(la * r) * Math.sin(lo * r), Math.sin(la * r)];
  const A = v(aLat, aLon), B = v(bLat, bLon);
  const w = Math.acos(Math.min(1, Math.max(-1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2])));
  if (w < 1e-9) return [aLat, aLon];
  const s1 = Math.sin((1 - f) * w) / Math.sin(w), s2 = Math.sin(f * w) / Math.sin(w);
  const x = s1 * A[0] + s2 * B[0], y = s1 * A[1] + s2 * B[1], z = s1 * A[2] + s2 * B[2];
  return [Math.atan2(z, Math.hypot(x, y)) / r, Math.atan2(y, x) / r];
}
export const REROUTE_KM = 5;             // smaller moves don't turn pigeons around
export function haversineKm(aLat, aLon, bLat, bLon) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
export function flightMs(km, speed = 1) {
  const t = Math.min(MAX_FLIGHT, Math.max(MIN_FLIGHT, (km / SPEED_KMH) * HOUR));
  return t / (speed === true ? 2 : speed || 1);
}
// The pigeon shuttles between two people: you may send for free only when it's on your windowsill.
export function turn(me, last, t) {
  if (!last) return { free: true, state: "fresh" };
  // a lost pigeon never arrived, so the turn goes back to whoever sent it
  if (isLost(last, t)) return last.sender === me ? { free: true, state: last.recalled ? "recalled" : "lost" } : { free: false, state: "theirs" };
  if (last.sender === me) return { free: false, state: t < last.deliver_at ? "outbound" : "theirs" };
  if (t < last.deliver_at) return { free: false, state: "inbound" };
  return { free: true, state: "sill" };
}
// How many swift, turbo or rocket pigeons are in the loft. One hatches every
// `every` until it's full; a loft that's never been used starts full. The
// admin can give extras past full: they stay until used, and hatching picks
// up again once the loft drops below full.
export function loft(u, kind, t) {
  const p = PIGEONS[kind], at = u[p.atCol] ?? t, have = u[p.col] ?? p.max;
  const hatched = Math.max(0, Math.floor((t - at) / p.every));
  const count = have >= p.max ? have : Math.min(p.max, have + hatched);
  return { count, hatched, at, nextAt: count >= p.max ? null : at + (hatched + 1) * p.every };
}
export const swiftState = (u, t) => loft(u, "swift", t);
// Recalling a pigeon sends a swift one after it (atomic, so two at once can't share one).
export async function spendSwift(D, u, t) {
  const p = PIGEONS.swift, l = loft(u, "swift", t);
  if (l.count <= 0) {
    const ms = l.nextAt - t, h = Math.floor(ms / HOUR), m = Math.max(1, Math.ceil((ms % HOUR) / MIN));
    throw new HttpError(409, `No swift pigeons left to send after it. The next one hatches in ${h ? `${h}h ${m}m` : `${m} minutes`}.`);
  }
  const [n, at] = l.count >= p.max ? [l.count - 1, t] : [l.count - 1, l.at + l.hatched * p.every];
  const r = await D.prepare("UPDATE pg_users SET swift = ?, swift_at = ? WHERE id = ? AND swift IS ? AND swift_at IS ?").bind(n, at, u.id, u.swift, u.swift_at).run();
  if (!r.meta.changes) throw new HttpError(409, "Another pigeon just left. Try again.");
}

// What one phone may see of a message. An inbound scroll's ciphertext stays
// on the server until it lands.
export function msgView(me, m, t) {
  const lost = isLost(m, t), flying = !lost && t < m.deliver_at;
  return {
    id: m.id, from: m.sender, to: m.recipient, km: m.km,
    pigeon: m.pigeon || (m.swift ? "swift" : "standard"), swift: (m.pigeon || (m.swift ? "swift" : "standard")) === "swift",
    sentAt: m.sent_at, deliverAt: m.deliver_at, expiresAt: flying ? null : m.expires_at, readAt: m.read_at,
    waiting: !lost && t < m.sent_at,             // scheduled, still in the loft (only its sender ever sees this)
    scheduled: !!m.sched,
    skin: m.skin || null,
    photo: m.photo, photoSize: m.photo_size, flying, risky: !!m.risky,
    lost, lostAt: lost ? m.lost_at : null,       // only once it has happened
    recalled: lost && !!m.recalled,              // called back by its sender: lost on purpose
    wind: m.wind ?? null,                        // tailwind at take-off (km/h; negative: headwind)
    route: m.from_lat == null || m.to_lat == null ? null : [m.from_lat, m.from_lon, m.to_lat, m.to_lon],
    legs: m.legs ? JSON.parse(m.legs) : [],      // points where it changed course: [lat, lon, at]
    fromPlace: m.from_place, toPlace: m.to_place,
    ct: (flying || lost) && m.recipient === me ? null : m.ct,
  };
}

// Delete photo blobs whose 24 hours are up. Cheap; runs alongside syncs.
export async function sweepPhotos(env) {
  const D = await db(env);
  const { results } = await D.prepare("SELECT id FROM pg_msgs WHERE photo = 1 AND expires_at < ? LIMIT 50").bind(Date.now()).all();
  if (results?.length) {
    const ids = results.map((r) => r.id);
    if (env.BIO_R2) await env.BIO_R2.delete(ids.map((id) => `pigeon/${id}`));
    await D.batch(ids.map((id) => D.prepare("UPDATE pg_msgs SET photo = 2 WHERE id = ?").bind(id)));
  }
  // group photos: 24 hours after the last member's pigeon lands
  const { results: g } = await D.prepare("SELECT id FROM pg_gmsgs WHERE photo = 1 AND expires_at < ? LIMIT 50").bind(Date.now()).all();
  if (!g?.length) return;
  if (env.BIO_R2) await env.BIO_R2.delete(g.map((r) => groupPhotoKey(r.id)));
  await D.batch(g.map((r) => D.prepare("UPDATE pg_gmsgs SET photo = 2 WHERE id = ?").bind(r.id)));
}
// group photos live apart from one-to-one ones, so one id can never land on another's photo
export const groupPhotoKey = (id) => `pigeon-g/${id}`;

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
  let cd;
  try { cd = JSON.parse(new TextDecoder().decode(fromB64url(b.clientDataJSON))); } catch (_) { cd = {}; }
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
// Locations are snapped to a 1-mile grid (about 1.6 km each way, anywhere on
// Earth): plenty for flight times, too coarse to find someone's street.
const MILE_DEG = 1.609344 / 111.32;            // degrees of latitude in a mile
export function snapToMile(lat, lon) {
  const la = Math.max(-90, Math.min(90, Math.round(lat / MILE_DEG) * MILE_DEG));
  const step = MILE_DEG / Math.max(Math.cos(la * Math.PI / 180), 0.01);
  let lo = Math.round(lon / step) * step; if (lo > 180) lo -= 360; if (lo < -180) lo += 360;
  return { lat: Math.round(la * 1e5) / 1e5, lon: Math.round(lo * 1e5) / 1e5 };
}
export function cleanPlace(b) {
  const lat = Number(b.lat), lon = Number(b.lon);
  if (b.lat == null || b.lon == null || b.lat === "" || b.lon === "" || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new HttpError(400, "That location isn’t valid.");
  return { ...snapToMile(lat, lon), place: String(b.place || "").trim().slice(0, 60) || null };
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
// Every InFlight email: the app's look (grouped card, coloured icon tile, bold
// title, a details box and a full-width button), built from tables and inline
// styles so it holds up in Gmail and Outlook, with a dark version for mail
// apps that support it. Icons are PNGs (mail apps block SVG) in /pigeon/mail/.
export const SITE = "https://georgefarrowgreen.com";
// Where links in emails point: this site, or a local test server. Never a
// *.pages.dev or preview host (the notification tick runs through one).
export function linkOrigin(request) {
  const u = new URL(typeof request === "string" ? request : request.url);
  return /^(localhost|127\.0\.0\.1)$/.test(u.hostname) ? u.origin : SITE;
}
// "12 Oct 2026, 22:15" in UK time, for "when" rows
export const ukTime = (t) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(t);
export function emailBody({ title, lines = [], button, icon = "bird", rows = [], footer, unsub, origin = SITE, preheader }) {
  const text = [title, ...lines, ...rows.map(([k, v]) => `${k}: ${v}`), button ? `${button.label}: ${button.url}` : "",
    footer || "", unsub ? `Turn these emails off: ${unsub}` : ""].filter(Boolean).join("\n\n");
  const e = escHtml, font = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Helvetica,Arial,sans-serif";
  const row = ([k, v], i) => `<tr><td class="ml-k" style="padding:12px 16px;font-size:15px;line-height:20px;color:#6e6e73;text-align:left;${i ? "border-top:1px solid #e5e5ea;" : ""}">${e(k)}</td>
    <td class="ml-v" style="padding:12px 16px;font-size:15px;line-height:20px;color:#1c1c1e;font-weight:600;text-align:right;${i ? "border-top:1px solid #e5e5ea;" : ""}">${e(v)}</td></tr>`;
  const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${e(title)}</title>
<style>
  a{color:#0a7aff}
  @media (prefers-color-scheme:dark){
    .ml-bg{background:#000000!important}.ml-card{background:#1c1c1e!important}.ml-box{background:#2c2c2e!important}
    .ml-t{color:#f5f5f7!important}.ml-p,.ml-k{color:#aeaeb2!important}.ml-v{color:#f5f5f7!important}
    .ml-k,.ml-v{border-color:#3a3a3c!important}.ml-f{color:#8e8e93!important}
  }
  @media (max-width:480px){.ml-card{padding:28px 20px 24px!important}}
</style></head>
<body class="ml-bg" style="margin:0;padding:0;background:#f2f2f7;font-family:${font};-webkit-font-smoothing:antialiased">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${e(preheader)}</div>` : ""}
<table role="presentation" class="ml-bg" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f7"><tr><td align="center" style="padding:28px 14px 36px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:460px">
  <tr><td align="center" style="padding:0 0 18px">
    <a href="${e(origin)}/pigeon/" style="text-decoration:none"><img src="${e(origin)}/pigeon/icon-192.png" width="36" height="36" alt="" style="vertical-align:middle;border:0;border-radius:9px">
    <span class="ml-t" style="vertical-align:middle;margin-left:8px;font-size:19px;font-weight:700;letter-spacing:-.2px;color:#1c1c1e">InFlight</span></a>
  </td></tr>
  <tr><td class="ml-card" align="center" style="background:#ffffff;border-radius:28px;padding:32px 26px 28px">
    <img src="${e(origin)}/pigeon/mail/${e(icon)}.png" width="64" height="64" alt="" style="display:block;margin:0 auto 18px;border:0">
    <h1 class="ml-t" style="margin:0 0 10px;font-size:24px;line-height:30px;font-weight:700;letter-spacing:-.3px;color:#1c1c1e">${e(title)}</h1>
    ${lines.map((l) => `<p class="ml-p" style="margin:0 0 10px;font-size:16px;line-height:23px;color:#6e6e73">${e(l)}</p>`).join("")}
    ${rows.length ? `<table role="presentation" class="ml-box" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 4px;background:#f2f2f7;border-radius:16px;border-collapse:separate">${rows.map(row).join("")}</table>` : ""}
    ${button ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0"><tr><td align="center" bgcolor="#0a7aff" style="background:#0a7aff;border-radius:999px">
      <a href="${e(button.url)}" style="display:block;padding:15px 20px;font-size:17px;line-height:22px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px">${e(button.label)}</a></td></tr></table>
    <p class="ml-f" style="margin:14px 0 0;font-size:12px;line-height:17px;color:#8e8e93;word-break:break-all">Button not working? Paste this into your browser:<br><a href="${e(button.url)}" style="color:#8e8e93">${e(button.url)}</a></p>` : ""}
  </td></tr>
  <tr><td align="center" class="ml-f" style="padding:18px 22px 0;font-size:12px;line-height:18px;color:#8e8e93">
    ${footer ? `${e(footer)}<br>` : ""}${unsub ? `<a href="${e(unsub)}" style="color:#8e8e93">Turn these emails off</a>` : ""}
  </td></tr>
</table></td></tr></table></body></html>`;
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
export const resetUrl = (request, token) => `${linkOrigin(request)}/pigeon/#reset=${token}`;
export function maskEmail(e) {
  const [a, b] = String(e).split("@");
  return `${a.slice(0, 2)}${"•".repeat(Math.max(1, Math.min(6, a.length - 2)))}@${b}`;
}
export async function adminLog(env, action, target, detail) {
  await (await db(env)).prepare("INSERT INTO pg_admin_log (at, action, target, detail) VALUES (?, ?, ?, ?)")
    .bind(Date.now(), action, target || null, detail || null).run();
}
