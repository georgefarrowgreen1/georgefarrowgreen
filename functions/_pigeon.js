// InFlight (/pigeon) — the server half.
//
// What this side knows: accounts (email, handle, a hash of a password-derived
// proof), public keys, who is friends with whom, and when each pigeon lands.
// What it never sees: passwords, private keys, message text or photos. Phones
// encrypt everything before upload; this code stores and relays ciphertext.
//
// Storage: D1 (env.DB) for everything structured, R2 (env.BIO_R2) for the
// encrypted photo blobs under pigeon/. Tables are created on first use.

import { HttpError } from "./_http.js";
import { SITE, ACCOUNT_APP } from "./_email.js";
export { HttpError };

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
// Space pigeons (functions/_moon.js): the only ones off the Earth (and the orbital one round it), from lofts of their own
export const LUNAR_LOFTS = { lunar: { max: 3, every: DAY / 3, col: "lunar", atCol: "lunar_at" }, lunarx: { max: 1, every: DAY, col: "lunarx", atCol: "lunarx_at" },
  laser: { max: 5, every: DAY / 5, col: "laser", atCol: "laser_at" }, orbital: { max: 2, every: DAY / 2, col: "orbital", atCol: "orbital_at" } };
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
export const MAX_POSTER = 2 * 1024 * 1024;   // the poster: the same photo at most 1600px on its longer side
export const SESSION_TTL = 180 * DAY;
export const SESSION_MAX = 365 * DAY;     // (however much it's used: functions/_pigeon.js sessionUser)

const enc = new TextEncoder();


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
// What each pigeon did, kept after its message has gone (functions/_retention.js)
SCHEMA.push(
  `CREATE TABLE IF NOT EXISTS pg_flights (id TEXT PRIMARY KEY, msg_id TEXT NOT NULL, sender TEXT NOT NULL, recipient TEXT, grp INTEGER NOT NULL DEFAULT 0,
    group_id TEXT, pigeon TEXT, km REAL, sent_at INTEGER NOT NULL, deliver_at INTEGER, lost_at INTEGER, recalled INTEGER, wind REAL, from_place TEXT,
    to_place TEXT, risky INTEGER, from_lon REAL, to_lon REAL, wx_ms INTEGER, dodged INTEGER, shelter_ms INTEGER, ship INTEGER, moon TEXT)`,
  "CREATE INDEX IF NOT EXISTS pg_flights_sender ON pg_flights(sender, sent_at)",
  "CREATE INDEX IF NOT EXISTS pg_flights_to ON pg_flights(recipient)",
  "CREATE INDEX IF NOT EXISTS pg_flights_msg ON pg_flights(msg_id)",
);
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
  "ALTER TABLE pg_resets ADD COLUMN kx TEXT",                // the link's own key a reset that keeps the old key proves it against
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
  "ALTER TABLE pg_sessions ADD COLUMN place TEXT",
  // the London days each account used the app (a row a day, kept 60 days), for the admin's Insights
  "CREATE TABLE IF NOT EXISTS pg_active (day INTEGER NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (day, user_id)) WITHOUT ROWID",
  // what a pigeon's way said (round storms, hours sheltering, a ship), kept when the way itself is blurred a month on
  ...["pg_msgs", "pg_gdeliv"].flatMap((t) => ["w_dodged INTEGER", "w_shelter INTEGER", "w_ship INTEGER"].map((c) => `ALTER TABLE ${t} ADD COLUMN ${c}`)),           // roughly where it signed in ("London, United Kingdom", as Cloudflare has it), for the same list
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
  "ALTER TABLE pg_users ADD COLUMN hide_tracker INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE pg_users ADD COLUMN loc_approx INTEGER NOT NULL DEFAULT 0",   // keep my spot to about 10 km, not a mile
  // disappearing messages (functions/_vanish.js): the chat's setting when it was sent, and when it went
  "ALTER TABLE pg_msgs ADD COLUMN vanish INTEGER", "ALTER TABLE pg_msgs ADD COLUMN gone_at INTEGER",
  "ALTER TABLE pg_gmsgs ADD COLUMN vanish INTEGER", "ALTER TABLE pg_gmsgs ADD COLUMN gone_at INTEGER",
  "ALTER TABLE pg_groups ADD COLUMN vanish INTEGER", "ALTER TABLE pg_groups ADD COLUMN vanish_by TEXT",
  "CREATE TABLE IF NOT EXISTS pg_vanish (a TEXT NOT NULL, b TEXT NOT NULL, ms INTEGER NOT NULL, by TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (a, b))",
  "CREATE INDEX IF NOT EXISTS pg_vanish_b ON pg_vanish(b)",      // (looked up from either side: a = ? OR b = ?)
  "CREATE INDEX IF NOT EXISTS pg_msgs_vanish ON pg_msgs(read_at) WHERE vanish IS NOT NULL AND gone_at IS NULL",
  "CREATE INDEX IF NOT EXISTS pg_gmsgs_vanish ON pg_gmsgs(sent_at) WHERE vanish IS NOT NULL AND gone_at IS NULL",   // keep my pigeons off the public live tracker (functions/_tracker.js)
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
  // the Moon (functions/_moon.js): where on it you are (JSON; null: on Earth), your lunar lofts, and a flight's two ends
  "ALTER TABLE pg_users ADD COLUMN moon TEXT",
  "ALTER TABLE pg_users ADD COLUMN lunar INTEGER", "ALTER TABLE pg_users ADD COLUMN lunar_at INTEGER",
  "ALTER TABLE pg_users ADD COLUMN lunarx INTEGER", "ALTER TABLE pg_users ADD COLUMN lunarx_at INTEGER",
  "ALTER TABLE pg_msgs ADD COLUMN moon TEXT", "ALTER TABLE pg_gdeliv ADD COLUMN moon TEXT",
  // Mars and orbit: laser and orbital lofts, and which of a space flight's moments its sender has been told
  "ALTER TABLE pg_users ADD COLUMN laser INTEGER", "ALTER TABLE pg_users ADD COLUMN laser_at INTEGER",
  "ALTER TABLE pg_users ADD COLUMN orbital INTEGER", "ALTER TABLE pg_users ADD COLUMN orbital_at INTEGER",
  "ALTER TABLE pg_msgs ADD COLUMN moon_told INTEGER",
  "CREATE INDEX IF NOT EXISTS pg_msgs_space ON pg_msgs(deliver_at) WHERE moon IS NOT NULL",
  "CREATE INDEX IF NOT EXISTS pg_gdeliv_space ON pg_gdeliv(deliver_at) WHERE moon IS NOT NULL",
  // an account unused for almost a year: when it was told it would be deleted (functions/_retention.js)
  "ALTER TABLE pg_users ADD COLUMN warned_at INTEGER",
  // the session's token for the browser's cookie for the whole site (functions/_account.js): its own, so the cookie
  // isn't a key to InFlight's API
  "ALTER TABLE pg_sessions ADD COLUMN site_hash TEXT",
  // a sign-in handed from InFlight to the account's page (functions/api/pigeon account-link, functions/api/account
  // handoff): a code good once, for a minute
  // what went wrong on the server, for the admin (Admin's alerts): when, where and what, kept 14 days (functions/_notify.js tick)
  "CREATE TABLE IF NOT EXISTS pg_errors (at INTEGER NOT NULL, src TEXT NOT NULL, msg TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS pg_errors_at ON pg_errors(at)",
  "CREATE TABLE IF NOT EXISTS pg_handoff (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, session TEXT NOT NULL, expires INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS pg_sessions_site ON pg_sessions(site_hash)",
  // the account's own page (functions/api/account): what's happened to the account lately (functions/_activity.js), kept
  // 30 days; where each passkey's saved (its provider, from the passkey); a new email waiting to be confirmed (a hash of
  // its link's token); whether the password's been checked against data breaches; and a deletion asked for, with the
  // hash of the email link that keeps the account
  "CREATE TABLE IF NOT EXISTS pg_events (user_id TEXT NOT NULL, at INTEGER NOT NULL, kind TEXT NOT NULL, app TEXT, device TEXT, place TEXT, detail TEXT)",
  "CREATE INDEX IF NOT EXISTS pg_events_user ON pg_events(user_id, at)",
  "ALTER TABLE pg_passkeys ADD COLUMN provider TEXT",
  // (how many times the passkey says it's been used, where it counts: a copy of it would fall behind)
  "ALTER TABLE pg_passkeys ADD COLUMN sign_count INTEGER",
  "ALTER TABLE pg_users ADD COLUMN email_new TEXT", "ALTER TABLE pg_users ADD COLUMN email_new_code TEXT", "ALTER TABLE pg_users ADD COLUMN email_new_at INTEGER",
  "ALTER TABLE pg_users ADD COLUMN pw_leaked INTEGER", "ALTER TABLE pg_users ADD COLUMN pw_checked_at INTEGER",
  "ALTER TABLE pg_users ADD COLUMN delete_at INTEGER", "ALTER TABLE pg_users ADD COLUMN delete_code TEXT",
  "ALTER TABLE pg_users ADD COLUMN pw_at INTEGER",          // when the password was last set (made, changed or reset)
  "CREATE INDEX IF NOT EXISTS pg_users_delete ON pg_users(delete_at) WHERE delete_at IS NOT NULL",
  // which apps each sign-in's been used in ("weather,account"), so Signed-in devices can name it by its app (a Home
  // Screen app on an iPhone has cookies of its own, so it's a sign-in of its own); and, for the account's page opened
  // from an app (functions/api/account handoff), the app's sign-in it came from: listed as part of that one, and
  // ending with it
  "ALTER TABLE pg_sessions ADD COLUMN apps TEXT",
  "ALTER TABLE pg_sessions ADD COLUMN parent TEXT",
  // (and the app it's a Home Screen app of, as that app says: the account's page on the Home Screen is "Account", the
  // same page in Safari is Safari)
  "ALTER TABLE pg_sessions ADD COLUMN home TEXT",
  "CREATE INDEX IF NOT EXISTS pg_sessions_parent ON pg_sessions(parent) WHERE parent IS NOT NULL",
  // (one handed over from an app to a browser signed in to nothing: the account's page's alone, until it's shown it's
  // you there: functions/api/account handoff, reauth)
  "ALTER TABLE pg_sessions ADD COLUMN handed INTEGER",
  // the home page's own owner sign-ins, from when it had a password of its own (it's the admin account's now: functions/_auth.js)
  "DROP TABLE IF EXISTS pg_owner_sessions",
  // the profile card's poster: a larger copy of your photo (functions/_profile.js putPoster), and the point of it that
  // stays in view ("x y", in percent)
  "ALTER TABLE pg_users ADD COLUMN poster_at INTEGER", "ALTER TABLE pg_users ADD COLUMN poster_focus TEXT",
  // a sign-in made on the account's page for an app that sent you there, handed back to it (functions/_handback.js): a
  // code good once, for two minutes, only with the word the app's tab kept for it (ask: its hash); for InFlight, what
  // unlocks the key there, sealed to that tab (box), and the passkey whose own copy of the key it opens (pk)
  "CREATE TABLE IF NOT EXISTS pg_handback (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, session TEXT NOT NULL, app TEXT NOT NULL, ask TEXT NOT NULL, box TEXT, pk TEXT, expires INTEGER NOT NULL)",
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
  return env.PIGEON_COUNT_DB ? counted(env.DB) : env.DB;
}
// Tests only (PIGEON_COUNT_DB): how many trips to the database this copy of the server has made, each
// query or batch one, so a test can see what a request costs (sync says so in X-DB-Trips)
export const TRIPS = { n: 0 };
const real = new WeakMap();
function counted(D) {
  const st = (s) => { const p = new Proxy(s, { get(o, k) { const v = o[k]; if (typeof v !== "function") return v;
    if (k === "bind") return (...a) => st(v.apply(o, a));
    if (k === "first" || k === "all" || k === "run" || k === "raw") return (...a) => { TRIPS.n++; return v.apply(o, a); };
    return v.bind(o); } }); real.set(p, s); return p; };
  return new Proxy(D, { get(o, k) { const v = o[k]; if (typeof v !== "function") return v;
    if (k === "prepare") return (q) => st(v.call(o, q));
    if (k === "batch") return (list) => { TRIPS.n++; return v.call(o, list.map((x) => real.get(x) || x)); };
    return v.bind(o); } });
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
    // when each password was last set, for accounts from before that was kept: as far as recent activity goes back
    if (!(await env.DB.prepare("SELECT 1 FROM pg_meta WHERE k = 'pwat_v1'").first())) {
      await env.DB.batch([
        env.DB.prepare("UPDATE pg_users SET pw_at = (SELECT MAX(at) FROM pg_events e WHERE e.user_id = pg_users.id AND e.kind IN ('signup', 'password', 'reset')) WHERE pw_at IS NULL"),
        env.DB.prepare("INSERT OR IGNORE INTO pg_meta (k, v) VALUES ('pwat_v1', '1')"),
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
// A network, as one asker: the address, or for IPv6 its whole /48 (as a provider hands them out). For limits where many
// addresses from one place mustn't count as many askers.
export const clientNet = (request) => { const ip = clientIp(request); return ip.endsWith("::/64") ? ip.split(":").slice(0, 3).join(":") + "::/48" : ip; };
// (n: how much this one uses up, where asks differ in cost)
export async function limit(env, key, max, windowMs, n = 1) {
  const D = await db(env), t = Date.now();
  // one statement, so parallel requests can't all slip under the limit
  const row = await D.prepare(`INSERT INTO pg_limits (key, count, reset_at) VALUES (?1, ?4, ?2)
    ON CONFLICT(key) DO UPDATE SET count = CASE WHEN reset_at < ?3 THEN ?4 ELSE count + ?4 END,
      reset_at = CASE WHEN reset_at < ?3 THEN ?2 ELSE reset_at END
    RETURNING count, reset_at`).bind(key, t + windowMs, t, n).first();
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
// A country's name from Cloudflare's two-letter code ("" if it doesn't know)
export function regionOf(cc) { try { return cc && cc !== "XX" && cc !== "T1" ? new Intl.DisplayNames(["en-GB"], { type: "region" }).of(cc) || "" : ""; } catch (_) { return ""; } }
// Roughly where a sign-in came from: the city and country Cloudflare puts its address in (often the nearest big
// town, never closer), kept with that sign-in only so you'd know one that wasn't you, and gone when it's signed out
export function placeOf(request) {
  const cf = request?.cf || {}, country = regionOf(cf.country), city = String(cf.city || "").slice(0, 60);
  return [city, country].filter(Boolean).join(", ") || null;
}
// Which app a request's for, by its API: "inflight", "weather" or "account" (the account's own page)
export function appKey(request) {
  const p = request ? new URL(request.url).pathname : "";
  return p.startsWith("/api/pigeon/") ? "inflight" : p.startsWith("/api/weather/") ? "weather" : p.startsWith("/api/account/") ? "account" : null;
}
// The app a request's from when it's open as a Home Screen app (it says so: X-Home-Screen), or null
const homeOf = (request) => (request?.headers.get("X-Home-Screen") === "1" ? appKey(request) : null);
// The sign-ins other than this one's own, in SQL (with othersOf's four): not itself, nor the app's sign-in it was
// handed from (the account's page opened from an app), nor the account pages handed from it
export const OTHERS = "hash NOT IN (?, ?) AND COALESCE(parent, '') NOT IN (?, ?)";
export const othersOf = (u) => { const a = u.sessionHash, b = u.parent || u.sessionHash; return [a, b, a, b]; };
// (authAt: when it was last shown it's you, where that wasn't just now: a sign-in handed on from another, no fresher)
export async function issueSession(env, userId, request, authAt) {
  const token = randomToken(32), t = Date.now();
  const D = await db(env);
  await D.batch([D.prepare("INSERT INTO pg_sessions (hash, user_id, created_at, seen_at, auth_at, label, place, apps, home) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(hex(await sha256(token)), userId, t, t, authAt ?? t, deviceOf(request), placeOf(request), appKey(request), homeOf(request)),
    D.prepare("INSERT OR IGNORE INTO pg_active (day, user_id) VALUES (?, ?)").bind(londonDay(t), userId)]);
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
// London's offset from UTC at a moment, in ms (summer time and all), and the London day a moment falls on
export function londonOffset(t) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(t / MIN) * MIN;
}
export const londonDay = (t) => Math.floor((t + londonOffset(t)) / DAY);
export async function requireUser(request, env) {
  const m = /^Bearer ([A-Za-z0-9_-]{20,})$/.exec(request.headers.get("Authorization") || "");
  if (!m) throw new HttpError(401, "Please sign in.", "session");
  const u = await sessionUser(env, m[1], true, false, request);
  // (an account being deleted is signed in only on its own page, to keep it: functions/api/account)
  if (u.delete_at) throw new HttpError(401, "This account is being deleted. To keep it, sign in at account.georgefarrowgreen.com.", "session");
  return u;
}
// The account a session's token is for (and that it's still going): its bearer token, or (site) the token of the
// browser's cookie for the site (functions/_account.js), which is a different one. (inflight: InFlight itself is being
// used, a day of it noted for its Insights; request: the app it's used in noted, as it's first used there)
// Something gone wrong, noted for the admin (pg_errors): never throws, and no more than 20 a minute from one copy of the
// server, so a loop of failures can't fill the database. (Also to the console, as before.)
let errWindow = 0, errCount = 0;
export async function logError(env, src, e) {
  console.error(src, e && (e.stack || e.message || e));
  const t = Date.now();
  if (t - errWindow > MIN) { errWindow = t; errCount = 0; }
  if (++errCount > 20 || !env?.DB) return;
  try { await (await db(env)).prepare("INSERT INTO pg_errors (at, src, msg) VALUES (?, ?, ?)").bind(t, String(src).slice(0, 40), String(e && (e.message || e)).slice(0, 300)).run(); } catch (_) {}
}
export async function sessionUser(env, token, inflight = true, site = false, request = null) {
  const D = await db(env), h = hex(await sha256(token)), t = Date.now();
  // the session and its account in one look (every request starts here); an account page opened from an app lasts as
  // long as the app's sign-in it came from
  const u = await D.prepare(`SELECT u.*, s.hash AS s_hash, s.site_hash AS s_site, s.seen_at AS s_seen, s.created_at AS s_made, s.auth_at AS s_auth, s.apps AS s_apps, s.parent AS s_parent, s.home AS s_home, s.handed AS s_handed,
      (s.parent IS NULL OR EXISTS (SELECT 1 FROM pg_sessions p WHERE p.hash = s.parent)) AS s_held
    FROM pg_sessions s JOIN pg_users u ON u.id = s.user_id WHERE s.${site ? "site_hash" : "hash"} = ?`).bind(h).first();
  // (a sign-in lasts while it's used, up to a year from when it was made: then it's asked for again, wherever it's in use)
  const over = u && t - (u.s_made || t) > SESSION_MAX;
  if (u && (!u.s_held || over)) await D.prepare("DELETE FROM pg_sessions WHERE hash = ?").bind(u.s_hash).run();
  if (!u || t - u.s_seen > SESSION_TTL || !u.s_held || over) throw new HttpError(401, "Your session ended. Please sign in again.", "session");
  // (an app's first use of it noted: one that's an account page opened from an app, used by an app too, is the
  // browser's own sign-in now, listed by itself)
  const app = appKey(request), apps = String(u.s_apps || "").split(",").filter(Boolean), learn = app && !apps.includes(app);
  // (one handed over from an app to a browser signed in to nothing is the account's page's alone until it's shown it's
  // you there: anywhere else the browser's signed out, so a code a page elsewhere sent it there with can't sign it in
  // to that page's own account across the site)
  if (u.s_handed && app !== "account") throw new HttpError(401, "Please sign in.", "session");
  const parent = learn && app !== "account" ? null : u.s_parent || null, home = homeOf(request) || u.s_home || null;
  // (and the London day noted as one they used it on, for the admin's Insights: functions/_insights.js)
  if (learn || home !== (u.s_home || null) || t - u.s_seen > HOUR || londonDay(t) !== londonDay(u.s_seen)) await D.batch([
    D.prepare("UPDATE pg_sessions SET seen_at = ?, apps = ?, parent = ?, home = ? WHERE hash = ?").bind(t, learn ? [...apps, app].join(",") : u.s_apps || null, parent, home, u.s_hash),
    ...(inflight ? [D.prepare("INSERT OR IGNORE INTO pg_active (day, user_id) VALUES (?, ?)").bind(londonDay(t), u.id)] : [])]);
  u.sessionHash = u.s_hash; u.siteHash = u.s_site || null; u.authAt = u.s_auth || 0; u.parent = parent; u.sessionApps = learn ? [...apps, app] : apps; u.sessionHome = home; u.handed = !!u.s_handed;
  delete u.s_hash; delete u.s_site; delete u.s_seen; delete u.s_made; delete u.s_auth; delete u.s_apps; delete u.s_parent; delete u.s_home; delete u.s_held; delete u.s_handed;
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
  const p = kind === "mystery" ? MYSTERY : PIGEONS[kind] || LUNAR_LOFTS[kind], at = u[p.atCol] ?? t, have = u[p.col] ?? p.max;
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
// (the spot it names fits what the weather costs all told: a tailwind only when it's early, else what slowed it)
export function wxOf(ws, calm, flight, legs = [[0, flight]]) {
  const early = flight < calm;
  const i = ws.map((x, j) => j).filter((j) => ws[j]?.wx && (ws[j].wx.k === "tailwind") === early).sort((a, b) => Math.abs(Math.log(ws[b].f)) - Math.abs(Math.log(ws[a].f)))[0];
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
    sentAt: m.sent_at, deliverAt: m.deliver_at, expiresAt: flying ? null : m.expires_at, readAt: m.read_at, vanish: m.vanish || null,
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
    ...(m.moon ? { moon: JSON.parse(m.moon) } : {}),       // to, from or on the Moon: its two ends (functions/_moon.js)
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
// Passkeys belong to the site, georgefarrowgreen.com, whichever of its apps' addresses you're at (the site's own,
// chat., weather. or account.): one passkey works at all of them (functions/_account.js). A passkey's answer is only taken at the
// address it was given at, though, but for InFlight's two (georgefarrowgreen.com/pigeon and chat.), which are one app.
// (ACCOUNT_SITE in the environment: tests, which stand in a site of their own, over plain http)
const RP_SITE = "georgefarrowgreen.com", ADDRESSES = new Set([RP_SITE, "chat." + RP_SITE]);
export function rpIdFor(request, env) {
  const h = new URL(request.url).hostname, site = env?.ACCOUNT_SITE || RP_SITE;
  return [site, `chat.${site}`, `weather.${site}`, `account.${site}`].includes(h) ? site : h;
}
function originOk(origin, request, env) {
  try {
    const o = new URL(origin), here = new URL(request.url);
    if (/(^|\.)localhost$/.test(o.hostname) || o.hostname === "127.0.0.1") return here.hostname === o.hostname;   // local testing
    if (env?.ACCOUNT_SITE && o.host === here.host) return true;                                                    // (and the tests' site)
    return o.protocol === "https:" && (o.host === here.host || (ADDRESSES.has(o.host) && ADDRESSES.has(here.host)));
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
  if (cd.type !== type || cd.challenge !== b.challenge || !originOk(cd.origin, request, env)) throw new HttpError(400, "The passkey response didn’t match this site.");
}
// A passkey being added: what the authenticator itself says of it (its data, as the browser hands it over), not only what
// the page sends: made for this site (the hash of its id), with a person there and verified, and the id and public key
// the page sends are the ones in it. Returns how many times it says it's been used (0 where it doesn't count). (Who made
// the authenticator isn't asked: attestation "none", as for every passkey of a phone's own.)
export async function checkRegistration(request, env, b) {
  const bad = () => new HttpError(400, "The passkey response didn’t match this site.");
  let ad = null; try { ad = fromB64url(String(b.authenticatorData || "")); } catch (_) {}
  if (!ad || ad.length < 55) throw new HttpError(400, "This browser didn’t say enough about the passkey. Update it and try again.");
  const rpHash = await sha256(rpIdFor(request, env));
  for (let i = 0; i < 32; i++) if (ad[i] !== rpHash[i]) throw bad();
  if (!(ad[32] & 0x01) || !(ad[32] & 0x04) || !(ad[32] & 0x40)) throw bad();     // present, verified, and the key in it
  const n = (ad[53] << 8) | ad[54];
  if (b64url(ad.slice(55, 55 + n)) !== String(b.id || "")) throw bad();
  let cose; try { cose = cbor(ad, 55 + n).v; } catch (_) { throw bad(); }
  if (!(cose instanceof Map) || cose.get(3) !== b.alg) throw bad();
  let jwk;
  try { jwk = await crypto.subtle.exportKey("jwk", await crypto.subtle.importKey("spki", fromB64url(String(b.publicKey || "")),
    b.alg === -7 ? { name: "ECDSA", namedCurve: "P-256" } : { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, true, ["verify"])); }
  catch (_) { throw bad(); }
  const same = (bytes, v) => bytes instanceof Uint8Array && b64url(bytes) === v;
  if (b.alg === -7 ? !(cose.get(1) === 2 && cose.get(-1) === 1 && same(cose.get(-2), jwk.x) && same(cose.get(-3), jwk.y))
    : !(cose.get(1) === 3 && same(cose.get(-1), jwk.n) && same(cose.get(-2), jwk.e))) throw bad();
  return ((ad[33] << 24) | (ad[34] << 16) | (ad[35] << 8) | ad[36]) >>> 0;
}
// (the least of CBOR, for a passkey's public key: numbers, byte and text strings, arrays and maps; { v, at: where it ends })
function cbor(u8, at) {
  const head = u8[at++], major = head >> 5, info = head & 31;
  let len = info;
  if (info === 24) len = u8[at++];
  else if (info === 25) { len = (u8[at] << 8) | u8[at + 1]; at += 2; }
  else if (info === 26) { len = ((u8[at] << 24) | (u8[at + 1] << 16) | (u8[at + 2] << 8) | u8[at + 3]) >>> 0; at += 4; }
  else if (info > 26) throw new Error("cbor");
  if (major === 0) return { v: len, at };
  if (major === 1) return { v: -1 - len, at };
  if (major === 2 || major === 3) { if (at + len > u8.length) throw new Error("cbor"); const x = u8.slice(at, at + len); return { v: major === 2 ? x : new TextDecoder().decode(x), at: at + len }; }
  if (major === 4) { const a = []; for (let i = 0; i < len; i++) { const r = cbor(u8, at); a.push(r.v); at = r.at; } return { v: a, at }; }
  if (major === 5) { const m = new Map(); for (let i = 0; i < len; i++) { const k = cbor(u8, at), v = cbor(u8, k.at); m.set(k.v, v.v); at = v.at; } return { v: m, at }; }
  throw new Error("cbor");
}
export async function verifyAssertion(cred, request, b, env) {
  const authData = fromB64url(b.authenticatorData);
  const rpHash = await sha256(rpIdFor(request, env));
  for (let i = 0; i < 32; i++) if (authData[i] !== rpHash[i]) return false;
  if (!(authData[32] & 0x01)) return false;                     // user present
  if (!(authData[32] & 0x04)) return false;                     // and verified (Face ID, Touch ID or the phone's passcode)
  const clientHash = await sha256(fromB64url(b.clientDataJSON));
  const signed = new Uint8Array(authData.length + 32);
  signed.set(authData, 0); signed.set(clientHash, authData.length);
  const spki = fromB64url(cred.public_key), sig = fromB64url(b.signature);
  let ok = false;
  if (cred.alg === -7) {
    const k = await crypto.subtle.importKey("spki", spki, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, k, derToRawEcdsa(sig), signed);
  } else if (cred.alg === -257) {
    const k = await crypto.subtle.importKey("spki", spki, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    ok = await crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, k, sig, signed);
  }
  if (!ok) return false;
  // (a passkey that counts its uses must count up: one that's fallen behind is a copy. Most of a phone's own say 0)
  const count = ((authData[33] << 24) | (authData[34] << 16) | (authData[35] << 8) | authData[36]) >>> 0, had = cred.sign_count || 0;
  if ((count || had) && count <= had) return false;
  if (count) await (await db(env)).prepare("UPDATE pg_passkeys SET sign_count = ? WHERE id = ?").bind(count, cred.id).run();
  return true;
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
export const snapApprox = (lat, lon) => snapTo(lat, lon, APPROX_KM);
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// (a real point on the curve, not just the right shape: everyone who writes to them seals to it,
// and a made-up one would only fail on their friends' phones, one send at a time)
export async function cleanPub(p) {
  const ok = p && p.kty === "EC" && p.crv === "P-256" && /^[A-Za-z0-9_-]{43}$/.test(p.x || "") && /^[A-Za-z0-9_-]{43}$/.test(p.y || "");
  const jwk = ok && { kty: "EC", crv: "P-256", x: p.x, y: p.y };
  if (!ok || !(await crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, []).then(() => true, () => false)))
    throw new HttpError(400, "That public key isn’t valid.");
  return JSON.stringify(jwk);
}
// Locations are snapped to a 1-mile grid (about 1.6 km each way, anywhere on
// Earth): plenty for flight times, too coarse to find someone's street.
// (Approximate Location, in Privacy & Security, makes it a 10 km grid instead.)
const MILE_KM = 1.609344, APPROX_KM = 10;
export const snapToMile = (lat, lon) => snapTo(lat, lon, MILE_KM);
export function snapTo(lat, lon, km) {
  const deg = km / 111.32;                   // degrees of latitude in that many km
  const la = Math.max(-90, Math.min(90, Math.round(lat / deg) * deg));
  const step = deg / Math.max(Math.cos(la * Math.PI / 180), 0.01);
  let lo = Math.round(lon / step) * step; if (lo > 180) lo -= 360; if (lo < -180) lo += 360;
  return { lat: Math.round(la * 1e5) / 1e5, lon: Math.round(lo * 1e5) / 1e5 };
}
export function cleanPlace(b, approx = false) {
  const lat = Number(b.lat), lon = Number(b.lon);
  if (b.lat == null || b.lon == null || b.lat === "" || b.lon === "" || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new HttpError(400, "That location isn’t valid.");
  // the place name goes into friends' notifications: plain words only
  const place = String(b.place || "").normalize("NFC").replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
  return { ...snapTo(lat, lon, approx ? APPROX_KM : MILE_KM), place: place && !/[@\\<>]|:\/\/|www\./i.test(place) ? place : null };
}

// Where links into the app point: InFlight's address (chat.georgefarrowgreen.com, since the
// move), or the app under a local test server. `hash` is what to open: "#reset=…", "#open=…".
// (The site's email, every app's, is functions/_email.js.)
export const APP = "https://chat.georgefarrowgreen.com";
export const appLink = (origin, hash = "") => (origin === SITE ? APP + "/" : origin + "/pigeon/") + hash;

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
// signs the link with the secret its key shares with a server key of the link's
// own. It's made the first time the link's looked at and kept for its life, so
// opening it again (another tab, another device) doesn't undo the first one.
const ECDH_P256 = { name: "ECDH", namedCurve: "P-256" };
export async function resetKx(env, reset) {
  let jwk = reset.kx ? JSON.parse(reset.kx) : null;
  if (!jwk) {
    const D = await db(env), kp = await crypto.subtle.generateKey(ECDH_P256, true, ["deriveBits"]);
    await D.prepare("UPDATE pg_resets SET kx = ? WHERE hash = ? AND kx IS NULL")
      .bind(JSON.stringify(await crypto.subtle.exportKey("jwk", kp.privateKey)), reset.hash).run();
    // (two looks at once: both are given whichever key was kept first)
    const row = await D.prepare("SELECT kx FROM pg_resets WHERE hash = ?").bind(reset.hash).first();
    if (!row?.kx) throw new HttpError(410, "This reset link has already been used. Ask for a new one.");
    jwk = JSON.parse(row.kx);
  }
  return { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y };
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
// Links to the account's own page (accounts are made, and passwords reset, only there: functions/_join.js): its address,
// or under a test server, the account's address there (account.<the stood-in site>, or account.localhost)
export function accountPage(request, env) {
  const u = new URL(typeof request === "string" ? request : request.url), port = u.port ? ":" + u.port : "", site = env?.ACCOUNT_SITE;
  if (site && (u.hostname === site || u.hostname.endsWith("." + site))) return `${u.protocol}//account.${site}${port}`;
  if (u.hostname === "localhost" || u.hostname.endsWith(".localhost")) return `${u.protocol}//account.localhost${port}`;
  return ACCOUNT_APP;
}
export const resetUrl = (request, env, token) => `${accountPage(request, env)}/#reset=${token}`;
export function maskEmail(e) {
  const [a, b] = String(e).split("@");
  return `${a.slice(0, 2)}${"•".repeat(Math.max(1, Math.min(6, a.length - 2)))}@${b}`;
}
export async function adminLog(env, action, target, detail) {
  await (await db(env)).prepare("INSERT INTO pg_admin_log (at, action, target, detail) VALUES (?, ?, ?, ?)")
    .bind(Date.now(), action, target || null, detail || null).run();
}
