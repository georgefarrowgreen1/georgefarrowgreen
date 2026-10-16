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
export const LAYOVER = HOUR;             // a stopover: how long it rests with the friend on the way
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
// Mystery pigeons: one a day, from no loft and on no one's turn, but which kind
// turns up (and so when it lands) is drawn as it takes off: maybe a rocket, maybe a dumb one.
export const MYSTERY = { max: 1, every: DAY, col: "mystery", atCol: "mystery_at" };
export const MYSTERY_ODDS = [["dumb", 10], ["standard", 32], ["swift", 30], ["turbo", 19], ["rocket", 9]];   // out of 100
export function drawMystery() {
  const r = (crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) * 100;
  let a = 0;
  for (const [k, w] of MYSTERY_ODDS) { a += w; if (r < a) return k; }
  return "standard";
}
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

// D1 binds at most 100 parameters a statement: lists for IN (...) go in slices.
export const chunks = (a, n = 90) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

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
  `CREATE TABLE IF NOT EXISTS pg_wxcache (cell TEXT PRIMARY KEY, at INTEGER NOT NULL, w TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS pg_owner_sessions (hash TEXT PRIMARY KEY, tag TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  // who joined, left or renamed a group, shown in its chat, so no one is added without everyone seeing
  `CREATE TABLE IF NOT EXISTS pg_gevents (group_id TEXT NOT NULL, at INTEGER NOT NULL, kind TEXT NOT NULL, actor TEXT NOT NULL, actor_name TEXT NOT NULL, target TEXT, target_name TEXT)`,
  `CREATE INDEX IF NOT EXISTS pg_gevents_group ON pg_gevents(group_id, at)`,
  // handles given up (changed, or the account deleted) stay held for 30 days, so no one can step into them
  `CREATE TABLE IF NOT EXISTS pg_handles_held (handle TEXT PRIMARY KEY, user_id TEXT, until INTEGER NOT NULL)`,
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
// Ids the phones choose (messages, group messages, reactions) share one
// space: a reaction can't take a message's id, nor a group message a direct one.
SCHEMA.push("CREATE TABLE IF NOT EXISTS pg_ids (id TEXT PRIMARY KEY, kind TEXT NOT NULL, at INTEGER NOT NULL)");
// The passport (functions/_passport.js): every place each person's pigeons have flown over, and each flight stamped once
SCHEMA.push(`CREATE TABLE IF NOT EXISTS pg_passport (user_id TEXT NOT NULL, place TEXT NOT NULL, first_at INTEGER NOT NULL, first_id TEXT, first_ord INTEGER, n INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (user_id, place))`);
SCHEMA.push("CREATE INDEX IF NOT EXISTS pg_passport_first ON pg_passport(first_id)");
SCHEMA.push("CREATE TABLE IF NOT EXISTS pg_stamped (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, at INTEGER NOT NULL, places TEXT)", "CREATE INDEX IF NOT EXISTS pg_stamped_user ON pg_stamped(user_id)");
// invites: sign-up is by one-time link (only its hash is kept), made by the site owner
SCHEMA.push("CREATE TABLE IF NOT EXISTS pg_invites (hash TEXT PRIMARY KEY, id TEXT NOT NULL UNIQUE, note TEXT, created_at INTEGER NOT NULL, used_at INTEGER, used_by TEXT, revoked_at INTEGER)");
// feathers (functions/_feathers.js): a ledger of what each person earned and spent, and what they bought
SCHEMA.push("CREATE TABLE IF NOT EXISTS pg_feathers (user_id TEXT NOT NULL, ref TEXT NOT NULL, n INTEGER NOT NULL, at INTEGER NOT NULL, why TEXT, PRIMARY KEY (user_id, ref))",
  "CREATE TABLE IF NOT EXISTS pg_kit (user_id TEXT NOT NULL, item TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (user_id, item))");
// landmark postmarks (functions/_landmarks.js): each person's collection (pg_stamped.marks: each flight's)
SCHEMA.push("CREATE TABLE IF NOT EXISTS pg_postmarks (user_id TEXT NOT NULL, mark TEXT NOT NULL, first_at INTEGER NOT NULL, first_id TEXT, n INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (user_id, mark))");
// Near misses: two pigeons that came within a few miles in mid-air (a < b, by id), where and when
// named pigeons (functions/_birds.js): yours, their careers, and your Hall of Fame
SCHEMA.push(`CREATE TABLE IF NOT EXISTS pg_birds (id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL, created_at INTEGER NOT NULL, km REAL NOT NULL DEFAULT 0,
  flights INTEGER NOT NULL DEFAULT 0, longest REAL NOT NULL DEFAULT 0, busy_until INTEGER, last_at INTEGER, retired_at INTEGER, lost_at INTEGER, lost_place TEXT)`,
  "CREATE INDEX IF NOT EXISTS pg_birds_owner ON pg_birds(owner)");
// flyovers (functions/_flyover.js): a pigeon over a friend of its sender, when, where they were, whether they were told and waved
SCHEMA.push(`CREATE TABLE IF NOT EXISTS pg_flyover (msg_id TEXT NOT NULL, user_id TEXT NOT NULL, sender TEXT NOT NULL, at INTEGER NOT NULL, km REAL, lat REAL, lon REAL,
  place TEXT, told INTEGER, waved INTEGER, PRIMARY KEY (msg_id, user_id))`, "CREATE INDEX IF NOT EXISTS pg_flyover_at ON pg_flyover(at)", "CREATE INDEX IF NOT EXISTS pg_flyover_pair ON pg_flyover(user_id, sender)");
SCHEMA.push(`CREATE TABLE IF NOT EXISTS pg_near (a TEXT NOT NULL, b TEXT NOT NULL, at INTEGER NOT NULL, lat REAL, lon REAL, km REAL, place TEXT,
  kind TEXT, lead TEXT, told INTEGER, coarse INTEGER, PRIMARY KEY (a, b))`, "CREATE INDEX IF NOT EXISTS pg_near_b ON pg_near(b)", "CREATE INDEX IF NOT EXISTS pg_near_at ON pg_near(at)");
// flight streaks (functions/_streaks.js): per pair (a < b), the run of UTC days with a take-off, its best, and the day it was last warned about
SCHEMA.push("CREATE TABLE IF NOT EXISTS pg_streaks (a TEXT NOT NULL, b TEXT NOT NULL, start INTEGER NOT NULL, last INTEGER NOT NULL, best INTEGER NOT NULL DEFAULT 1, warned INTEGER, PRIMARY KEY (a, b))",
  "CREATE INDEX IF NOT EXISTS pg_streaks_b ON pg_streaks(b)", "CREATE INDEX IF NOT EXISTS pg_streaks_last ON pg_streaks(last)");
export const claimId = (D, id, kind, t) => D.prepare("INSERT INTO pg_ids (id, kind, at) VALUES (?, ?, ?)").bind(id, kind, t);
export const idTaken = async (D, id) => !!(await D.prepare("SELECT 1 FROM pg_ids WHERE id = ?").bind(id).first());
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
  "ALTER TABLE pg_users ADD COLUMN weekly_at INTEGER",   // last "your week in flight"
  // stopovers: the friend it rests with on the way (an hour), their copy, and the line they add
  "ALTER TABLE pg_msgs ADD COLUMN via TEXT",
  "ALTER TABLE pg_msgs ADD COLUMN via_ct TEXT",          // sealed for the stopover friend
  "ALTER TABLE pg_msgs ADD COLUMN via_at INTEGER",       // lands with them
  "ALTER TABLE pg_msgs ADD COLUMN via_off INTEGER",      // flies on
  "ALTER TABLE pg_msgs ADD COLUMN via_place TEXT",
  "ALTER TABLE pg_msgs ADD COLUMN via_note TEXT",        // their line, sealed for the recipient
  "ALTER TABLE pg_msgs ADD COLUMN via_told INTEGER",     // they were told it arrived
  "ALTER TABLE pg_msgs ADD COLUMN wx TEXT",              // the worst weather on the way: {"k":"storms","lat":..,"lon":..}
  "ALTER TABLE pg_msgs ADD COLUMN wx_ms INTEGER",        // how much later (or, negative, earlier) the weather made it
  "ALTER TABLE pg_gdeliv ADD COLUMN wx TEXT",
  "ALTER TABLE pg_gdeliv ADD COLUMN wx_ms INTEGER",
  "ALTER TABLE pg_msgs ADD COLUMN wx_at INTEGER",        // when it flies into that weather (a notification then)
  "ALTER TABLE pg_msgs ADD COLUMN wx_told INTEGER",
  "ALTER TABLE pg_gdeliv ADD COLUMN wx_at INTEGER",
  "ALTER TABLE pg_gdeliv ADD COLUMN wx_told INTEGER",        // scheduled: 1 = waiting to take off (sent_at), 2 = took off and its recipient was told
  "ALTER TABLE pg_sessions ADD COLUMN auth_at INTEGER",      // when this sign-in last showed it's you (password or passkey)
  "ALTER TABLE pg_resets ADD COLUMN kx TEXT",                // a one-off key a reset that keeps the old key proves it against
  // declined and blocked links: a = who said no, b = who asked; asked_at = b still sees their request as waiting
  "ALTER TABLE pg_links ADD COLUMN asked_at INTEGER",
  "ALTER TABLE pg_users ADD COLUMN email_ok INTEGER",        // when the email address was confirmed (a link sent to it)
  "ALTER TABLE pg_users ADD COLUMN email_code TEXT",         // hash of the confirm link's token
  "ALTER TABLE pg_users ADD COLUMN email_sent INTEGER",
  // a month after landing, a route's ends are kept only to half a degree (about 50 km) and its turns go
  "ALTER TABLE pg_msgs ADD COLUMN coarse INTEGER",
  "ALTER TABLE pg_gmsgs ADD COLUMN coarse INTEGER",
  "ALTER TABLE pg_gdeliv ADD COLUMN coarse INTEGER",
  "ALTER TABLE pg_sessions ADD COLUMN label TEXT",           // what it's signed in on ("iPhone · Safari"), for the list of signed-in phones
  // cheers (functions/_cheers.js): who cheered it on, how many times each (JSON), and the time it saved
  "ALTER TABLE pg_msgs ADD COLUMN cheer_by TEXT",
  "ALTER TABLE pg_msgs ADD COLUMN cheer_ms INTEGER",
  "ALTER TABLE pg_gdeliv ADD COLUMN cheer_by TEXT",
  "ALTER TABLE pg_gdeliv ADD COLUMN cheer_ms INTEGER",
  // named pigeons (functions/_birds.js): which of yours carried it, its name and rank then, the rank it reached, and when it was settled
  ...["pg_msgs", "pg_gmsgs"].flatMap((t) => ["bird TEXT", "bird_name TEXT", "bird_rank TEXT", "bird_up TEXT", "bird_done INTEGER"].map((c) => `ALTER TABLE ${t} ADD COLUMN ${c}`)),
  "ALTER TABLE pg_gmsgs ADD COLUMN bird_to TEXT",
  // mystery pigeons: the loft (null = full) and which messages flew as one
  "ALTER TABLE pg_stamped ADD COLUMN marks TEXT",
  "ALTER TABLE pg_users ADD COLUMN hide_news INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE pg_users ADD COLUMN pins TEXT",
  // view-once photos: once = 1 (or null, sent before) means each recipient may download it once; viewed_at = when they did
  "ALTER TABLE pg_msgs ADD COLUMN once INTEGER", "ALTER TABLE pg_msgs ADD COLUMN viewed_at INTEGER",
  "ALTER TABLE pg_gmsgs ADD COLUMN once INTEGER", "ALTER TABLE pg_gdeliv ADD COLUMN viewed_at INTEGER",                // the keys this person has trusted, sealed so only their own key opens them   // don't share my news with friends (nor see theirs)
  "ALTER TABLE pg_birds ADD COLUMN wear TEXT",            // the accessory it has on (feathers)
  "ALTER TABLE pg_msgs ADD COLUMN bird_wear TEXT", "ALTER TABLE pg_gmsgs ADD COLUMN bird_wear TEXT",   // and had on when it carried this       // the landmarks it flew past (JSON ids, in order)
  "ALTER TABLE pg_users ADD COLUMN mystery INTEGER", "ALTER TABLE pg_users ADD COLUMN mystery_at INTEGER",
  "ALTER TABLE pg_msgs ADD COLUMN mystery INTEGER", "ALTER TABLE pg_gmsgs ADD COLUMN mystery INTEGER",            // (in a group: the member its route went to, the longest)
  "ALTER TABLE pg_msgs ADD COLUMN style TEXT", "ALTER TABLE pg_gmsgs ADD COLUMN style TEXT",                     // the route's style: scenic or safe (null: fastest)
  "ALTER TABLE pg_msgs ADD COLUMN live_at INTEGER", "ALTER TABLE pg_gdeliv ADD COLUMN live_at INTEGER",             // when the weather ahead was last looked at (in flight)
  "ALTER TABLE pg_msgs ADD COLUMN spread REAL",
  "ALTER TABLE pg_msgs ADD COLUMN noship INTEGER",                                                                // its sender asked it to fly an ocean itself, not take a ship
  "ALTER TABLE pg_msgs ADD COLUMN ship_told INTEGER", "ALTER TABLE pg_gdeliv ADD COLUMN ship_told INTEGER",       // told it boarded a ship (1), and came ashore (2)                                                                    // how sure its landing time is (the ensemble forecast: _weather.js)
  "CREATE INDEX IF NOT EXISTS pg_msgs_bird ON pg_msgs(bird)", "CREATE INDEX IF NOT EXISTS pg_gmsgs_bird ON pg_gmsgs(bird)",
  // the once-a-minute tick finds what's due by these, not by reading every message
  "CREATE INDEX IF NOT EXISTS pg_msgs_due ON pg_msgs(deliver_at) WHERE notified_at IS NULL",
  "CREATE INDEX IF NOT EXISTS pg_msgs_lostdue ON pg_msgs(lost_at) WHERE lost_at IS NOT NULL AND notified_at IS NULL",
  "CREATE INDEX IF NOT EXISTS pg_msgs_sched ON pg_msgs(sent_at) WHERE sched = 1",
  "CREATE INDEX IF NOT EXISTS pg_msgs_viaat ON pg_msgs(via_at) WHERE via IS NOT NULL AND via_told IS NULL",
  "CREATE INDEX IF NOT EXISTS pg_msgs_wx ON pg_msgs(wx_at) WHERE wx_at IS NOT NULL AND wx_told IS NULL",
  "CREATE INDEX IF NOT EXISTS pg_msgs_via ON pg_msgs(via, sender, sent_at) WHERE via IS NOT NULL",
  "CREATE INDEX IF NOT EXISTS pg_gdeliv_due ON pg_gdeliv(deliver_at) WHERE notified_at IS NULL",
  "CREATE INDEX IF NOT EXISTS pg_gdeliv_lostdue ON pg_gdeliv(lost_at) WHERE lost_at IS NOT NULL AND notified_at IS NULL",
  "CREATE INDEX IF NOT EXISTS pg_gdeliv_wx ON pg_gdeliv(wx_at) WHERE wx_at IS NOT NULL AND wx_told IS NULL",
  "CREATE INDEX IF NOT EXISTS pg_reacts_due ON pg_reacts(deliver_at) WHERE notified_at IS NULL",
];
// The schema's own fingerprint: when the database already has this one, a new
// copy of the server starts without re-running ~150 statements (any change to
// SCHEMA or MIGRATIONS changes it, so nothing needs bumping by hand).
const SCHEMA_FP = (() => { let h = 2166136261; for (const c of [...SCHEMA, ...MIGRATIONS].join("\n")) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return "s" + h.toString(36); })();
let schemaReady = null;
export async function db(env) {
  if (!env.DB) throw new HttpError(503, "InFlight isn’t set up on this server yet (no database).");
  // one setup per copy of the server, shared by every request that arrives while it runs
  await (schemaReady ||= setUp(env).catch((e) => { schemaReady = null; throw e; }));
  return env.DB;
}
async function setUp(env) {
  if ((await env.DB.prepare("SELECT v FROM pg_meta WHERE k = 'schema_fp'").first().catch(() => null))?.v === SCHEMA_FP) return;
  {
    await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s)));
    for (const m of MIGRATIONS) {
      try { await env.DB.prepare(m).run(); }
      catch (e) { if (!/duplicate column/i.test(String(e && (e.cause?.message || e.message)))) throw e; }
    }
    // every message, group message and reaction id, once: an id is only ever one thing
    if (!(await env.DB.prepare("SELECT 1 FROM pg_meta WHERE k = 'ids_v1'").first())) {
      await env.DB.batch([
        env.DB.prepare("INSERT OR IGNORE INTO pg_ids (id, kind, at) SELECT id, 'm', sent_at FROM pg_msgs"),
        env.DB.prepare("INSERT OR IGNORE INTO pg_ids (id, kind, at) SELECT id, 'g', sent_at FROM pg_gmsgs"),
        env.DB.prepare("INSERT OR IGNORE INTO pg_ids (id, kind, at) SELECT id, 'r', sent_at FROM pg_reacts"),
        env.DB.prepare("INSERT OR IGNORE INTO pg_meta (k, v) VALUES ('ids_v1', '1')"),
      ]);
    }
    // accounts from before addresses were confirmed count as confirmed
    if (!(await env.DB.prepare("SELECT 1 FROM pg_meta WHERE k = 'emailok_v1'").first())) {
      await env.DB.batch([
        env.DB.prepare("UPDATE pg_users SET email_ok = created_at WHERE email_ok IS NULL"),
        env.DB.prepare("INSERT OR IGNORE INTO pg_meta (k, v) VALUES ('emailok_v1', '1')"),
      ]);
    }
    await env.DB.prepare("INSERT OR REPLACE INTO pg_meta (k, v) VALUES ('schema_fp', ?)").bind(SCHEMA_FP).run();
  }
}

/* ---------------- request helpers ---------------- */
// JSON bodies are small (the biggest, a group message with a key for each of
// up to 50 people, is well under this); anything bigger is refused unread.
export const MAX_JSON = 512 * 1024;
export async function body(request, max = MAX_JSON) {
  if (Number(request.headers.get("Content-Length")) > max) throw new HttpError(413, "That request is too large.");
  const text = await request.text();
  if (text.length > max) throw new HttpError(413, "That request is too large.");
  try { return JSON.parse(text); } catch (_) { throw new HttpError(400, "That request wasn’t valid JSON."); }
}
export const clientIp = (request) => {
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  if (!ip.includes(":")) return ip;
  // IPv6: one connection usually has a whole /64 (written out in full first, so "a::b" can't dodge it)
  const [head, tail = ""] = ip.toLowerCase().split("::"), h = head ? head.split(":") : [], tl = ip.includes("::") && tail ? tail.split(":") : [];
  const full = ip.includes("::") ? [...h, ...Array(Math.max(0, 8 - h.length - tl.length)).fill("0"), ...tl] : h;
  return full.slice(0, 4).map((x) => x.replace(/^0+(?=.)/, "")).join(":") + "::/64";
};

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
let secret = null;
export async function serverSecret(env) {
  return (secret ||= readSecret(env).catch((e) => { secret = null; throw e; }));
}
async function readSecret(env) {
  const D = await db(env);
  const row = await D.prepare("SELECT v FROM pg_meta WHERE k = 'secret'").first();
  if (row) return row.v;
  const v = randomToken(32);
  await D.prepare("INSERT OR IGNORE INTO pg_meta (k, v) VALUES ('secret', ?)").bind(v).run();
  return (await D.prepare("SELECT v FROM pg_meta WHERE k = 'secret'").first()).v;
}

/* ---------------- sessions ---------------- */
// "iPhone · Safari": enough to tell your phones apart, from the browser's own description
export function deviceOf(request) {
  const ua = request?.headers.get("User-Agent") || "";
  const dev = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Macintosh/.test(ua) ? "Mac"
    : /Windows/.test(ua) ? "Windows" : /CrOS/.test(ua) ? "Chromebook" : /Linux/.test(ua) ? "Linux" : "Browser";
  const app = /Edg\//.test(ua) ? "Edge" : /Firefox\/|FxiOS/.test(ua) ? "Firefox" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  return app ? `${dev} · ${app}` : dev;
}
export async function issueSession(env, userId, request) {
  const token = randomToken(32), t = Date.now();
  await (await db(env)).prepare("INSERT INTO pg_sessions (hash, user_id, created_at, seen_at, auth_at, label) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(hex(await sha256(token)), userId, t, t, t, deviceOf(request)).run();
  return token;
}
// The few things a stolen sign-in mustn't be enough for (adding a passkey,
// deleting the account, fetching the password-locked key) need you to have
// shown it's you (password or passkey) in the last 10 minutes.
export const FRESH = 10 * MIN;
export function requireFresh(u) {
  if (!(Date.now() - (u.authAt || 0) < FRESH)) throw new HttpError(403, "Confirm it’s you first.", "reauth");
}
// Bearer tokens (not cookies), so there is no cross-site request forgery to defend against.
export async function requireUser(request, env) {
  const m = /^Bearer ([A-Za-z0-9_-]{20,})$/.exec(request.headers.get("Authorization") || "");
  if (!m) throw new HttpError(401, "Please sign in.", "session");
  const D = await db(env), h = hex(await sha256(m[1])), t = Date.now();
  // the session and its account in one look (every request starts here)
  const u = await D.prepare("SELECT u.*, s.seen_at AS s_seen, s.auth_at AS s_auth FROM pg_sessions s JOIN pg_users u ON u.id = s.user_id WHERE s.hash = ?").bind(h).first();
  if (!u || t - u.s_seen > SESSION_TTL) throw new HttpError(401, "Your session ended. Please sign in again.", "session");
  if (t - u.s_seen > HOUR) await D.prepare("UPDATE pg_sessions SET seen_at = ? WHERE hash = ?").bind(t, h).run();
  u.sessionHash = h; u.authAt = u.s_auth || 0; delete u.s_seen; delete u.s_auth;
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
  const p = kind === "mystery" ? MYSTERY : PIGEONS[kind], at = u[p.atCol] ?? t, have = u[p.col] ?? p.max;
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

// The weather's part in a flight: how much later (or earlier) it lands, and the
// worst of it on the way. Small changes aren't worth a word.
export function wxView(m) {
  if (m.wx_ms == null || Math.abs(m.wx_ms) < 5 * 60e3) return {};
  let wx = null; try { wx = m.wx ? JSON.parse(m.wx) : null; } catch (_) {}
  return { delay: m.wx_ms, wx };
}
// The weather's take on a flight: the worse leg's spot, the time it cost or
// saved, and when (after take-off) the pigeon reaches it. legs: [start, length]
// of each leg's flying, in ms after take-off.
export function wxOf(ws, calm, flight, legs = [[0, flight]]) {
  const i = ws.map((x, j) => j).filter((j) => ws[j]?.wx).sort((a, b) => Math.abs(Math.log(ws[b].f)) - Math.abs(Math.log(ws[a].f)))[0];
  if (i == null) return { wx: null, ms: Math.round(flight - calm), reach: null };
  const { at, ...wx } = ws[i].wx, [start, len] = legs[i] || legs[0];
  return { wx: JSON.stringify(wx), ms: Math.round(flight - calm), reach: Math.round(start + (at ?? 0.5) * len) };
}

// Cheers on a pigeon: how many in all, how many were mine, and the time they saved.
export function cheerView(row, me) {
  let by = {}; try { by = JSON.parse(row.cheer_by || "{}") || {}; } catch (_) {}
  const n = Object.values(by).reduce((a, x) => a + x, 0);
  return n ? { cheers: n, cheered: by[me] || 0, cheerMs: row.cheer_ms || 0 } : {};
}
// On a message: its named pigeon and rank (as it took off); to its sender also
// which of theirs it is, and the rank it reached if it went up on landing.
// View-once photos: the one download, then gone. Read whole (so it can go from
// storage before it's even sent), then deleted from R2 unless anyone may still view it.
export const isOnce = (m) => m.photo && m.once !== 0;
export async function serveOnce(env, key, keep) {
  const obj = env.BIO_R2 && (await env.BIO_R2.get(key));
  if (!obj) throw new HttpError(410, "This photo has flown away.");
  const buf = await obj.arrayBuffer();
  if (!keep) await env.BIO_R2.delete(key).catch(() => {});
  return new Response(buf, { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
export const birdOn = (m, me) => (m.bird_name ? { bird: { name: m.bird_name, rank: m.bird_rank, wear: m.bird_wear || null, ...(me === m.sender ? { id: m.bird, up: m.bird_up || null } : {}) } } : {});
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
    skin: m.skin || null, mystery: !!m.mystery,
    ...(m.photo ? { once: m.once !== 0, viewedAt: m.viewed_at || null } : {}),
    ...(m.spread != null && flying ? { spread: m.spread } : {}),
    ...(m.noship ? { noShip: true } : {}),                 // flying an ocean itself, not by ship
    // a stopover: who, where and when (the line they added only reaches the recipient, once it lands)
    ...(m.via ? { via: m.via, viaPlace: m.via_place, viaAt: m.via_at, viaOff: m.via_off,
      note: m.recipient === me && !flying && !lost ? m.via_note || null : null } : {}),
    photo: m.photo === 1 && m.expires_at != null && m.expires_at <= t ? 2 : m.photo,     // past its time: gone, even before the sweep deletes it
    photoSize: m.photo_size, flying, risky: !!m.risky,
    lost, lostAt: lost ? m.lost_at : null,       // only once it has happened
    recalled: lost && !!m.recalled,              // called back by its sender: lost on purpose
    wind: m.wind ?? null,                        // tailwind at take-off (km/h; negative: headwind)
    ...wxView(m),
    route: m.from_lat == null || m.to_lat == null ? null : [m.from_lat, m.from_lon, m.to_lat, m.to_lon],
    style: m.style || null,                      // the way it was sent: "scenic" or "safe" (null: the fastest)
    liveAt: flying ? m.live_at ?? null : null,   // when the weather ahead was last looked at (_live.js)
    legs: m.legs ? JSON.parse(m.legs) : [],      // points where it changed course: [lat, lon, at] (or sped up, cheered on: [lat, lon, at, "c"])
    ...cheerView(m, me), ...birdOn(m, me),
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
  // claimed and deleted in one statement, so two requests can't both use it
  const row = await D.prepare("DELETE FROM pg_challenges WHERE challenge = ? RETURNING *").bind(String(c || "")).first();
  if (!row) throw new HttpError(400, "That passkey request expired. Try again.");
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
  if (!(authData[32] & 0x04)) return false;                     // and verified (Face ID, Touch ID or the phone's passcode)
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
// an ordinary address: no spaces, quotes, commas or angle brackets (nothing that
// could read as a second recipient), and a real-looking domain
export const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@(?=.{4,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z][A-Za-z0-9-]{0,61}[A-Za-z0-9]$/;
// Is this handle free for this person? (Not anyone's, and not held for someone else.)
export async function handleTaken(D, handle, me = null) {
  if (await D.prepare("SELECT 1 FROM pg_users WHERE handle = ?").bind(handle).first()) return true;
  const held = await D.prepare("SELECT user_id FROM pg_handles_held WHERE handle = ? AND until > ?").bind(handle, Date.now()).first();
  return !!held && (held.user_id == null || held.user_id !== me);     // a deleted account's is held for no one
}
export const holdHandle = (D, handle, userId) =>
  D.prepare("INSERT OR REPLACE INTO pg_handles_held (handle, user_id, until) VALUES (?, ?, ?)").bind(handle, userId, Date.now() + 30 * DAY);
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
  // the place name goes into friends' notifications: plain words only
  const place = String(b.place || "").normalize("NFC").replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
  return { ...snapToMile(lat, lon), place: place && !/[@\\<>]|:\/\/|www\./i.test(place) ? place : null };
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
// A reset that keeps the account's key must show it holds that key: the phone
// signs the link with the secret its key shares with a one-off server key.
const ECDH_P256 = { name: "ECDH", namedCurve: "P-256" };
export async function resetKx(env, hash) {
  const kp = await crypto.subtle.generateKey(ECDH_P256, true, ["deriveBits"]);
  const priv = await crypto.subtle.exportKey("jwk", kp.privateKey), pub = await crypto.subtle.exportKey("jwk", kp.publicKey);
  await (await db(env)).prepare("UPDATE pg_resets SET kx = ? WHERE hash = ?").bind(JSON.stringify(priv), hash).run();
  return { kty: "EC", crv: "P-256", x: pub.x, y: pub.y };
}
export async function keyProofOk(reset, pubJson, proof) {
  if (!reset.kx || !/^[A-Za-z0-9_-]{43}$/.test(String(proof || ""))) return false;
  try {
    const priv = await crypto.subtle.importKey("jwk", JSON.parse(reset.kx), ECDH_P256, false, ["deriveBits"]);
    const pub = await crypto.subtle.importKey("jwk", { ...JSON.parse(pubJson), ext: true }, ECDH_P256, false, []);
    const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: pub }, priv, 256);
    const k = await crypto.subtle.importKey("raw", bits, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    return await crypto.subtle.verify("HMAC", k, fromB64url(proof), new TextEncoder().encode("inflight/key-proof/v1|reset|" + reset.hash));
  } catch (_) { return false; }
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
