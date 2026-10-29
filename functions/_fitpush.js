// Fitness's morning notification: today's session (or a rest day), at the time you chose, on each phone you turned it
// on on. The app writes the next days' words itself, from Rhythm as it has it (Rhythm is worked out on the phone, never
// here), and sends them again whenever it opens; the site's scheduler (workers/ticker) sends the day's, once, when your
// time comes where you are. Sent as Chat's and Weather's are (functions/_notify.js: the site's one VAPID key).
//
// fx_push: one row a phone (its subscription's endpoint), the account it's for, the time (minutes after midnight, in its
// time zone), the days' words ({ "2026-10-26": { title, body } }, a week or so ahead), and the last day it was sent.
import { HttpError, limit, fromB64url } from "./_pigeon.js";
import { pushEndpointOk, pushToSub, vapid } from "./_notify.js";
import { fitdb } from "./_fitness.js";

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const LATE = 3 * 60;   // (a tick missed by more than three hours: that day's left unsaid, not sent mid-morning)

async function tables(env) {
  const D = await fitdb(env);
  if (!tables.done) {
    await D.prepare(`CREATE TABLE IF NOT EXISTS fx_push (endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, at INTEGER NOT NULL,
      tz TEXT NOT NULL, days TEXT NOT NULL DEFAULT '{}', sent TEXT, added INTEGER NOT NULL)`).run();
    await D.prepare("CREATE INDEX IF NOT EXISTS fx_push_user ON fx_push (user_id)").run();
    // (the account's own choice, from its Notifications page: on or off, and the time, for every phone it's on)
    await D.prepare("CREATE TABLE IF NOT EXISTS fx_morning (user_id TEXT PRIMARY KEY, off INTEGER NOT NULL DEFAULT 0, at INTEGER)").run();
    tables.done = true;
  }
  return D;
}
export const pushKey = async (env) => (await vapid(env)).pub;

// a phone's keys, as the push standard has them: a P-256 public key (65 bytes, uncompressed) and a 16-byte secret
const B64U = /^[A-Za-z0-9_-]+={0,2}$/;
async function keysOk(sub) {
  const p256dh = sub?.keys?.p256dh, auth = sub?.keys?.auth;
  if (typeof p256dh !== "string" || typeof auth !== "string" || !B64U.test(p256dh) || !B64U.test(auth) || p256dh.length > 120 || auth.length > 40) return null;
  try {
    const pub = fromB64url(p256dh);
    if (pub.length !== 65 || pub[0] !== 4 || fromB64url(auth).length !== 16) return null;
    await crypto.subtle.importKey("raw", pub, { name: "ECDH", namedCurve: "P-256" }, false, []);
    return { p256dh, auth };
  } catch (_) { return null; }
}
const tzOk = (tz) => { try { new Intl.DateTimeFormat("en-GB", { timeZone: tz }); return typeof tz === "string" && tz.length < 64; } catch (_) { return false; } };
const clean = (s, n) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n);
function cleanDays(d) {
  const out = {};
  for (const [k, v] of Object.entries(d && typeof d === "object" ? d : {}).slice(0, 10)) {
    if (!DAY_KEY.test(k) || !v || typeof v !== "object") continue;
    const title = clean(v.title, 60), body = clean(v.body, 180);
    if (title) out[k] = { title, body };
  }
  return out;
}

// Turned on (or its time changed, or its words sent again) on this phone: { sub, at, tz, days }
export async function setMorning(env, userId, b) {
  const sub = b?.sub, keys = await keysOk(sub);
  if (!sub || !pushEndpointOk(sub.endpoint) || !keys) throw new HttpError(400, "That isn’t a push subscription this server can send to.");
  // (the time's the account's, where it's chosen one on its Notifications page; else the phone's, as it was)
  const mine = await morningOf(env, userId);
  const at = mine.at ?? Number(b.at);
  if (!Number.isInteger(at) || at < 0 || at >= 24 * 60) throw new HttpError(400, "Bad request.");
  if (!tzOk(b.tz)) throw new HttpError(400, "Bad request.");
  const D = await tables(env);
  await limit(env, `fxpush:${userId}`, 120, 3600e3);
  await D.prepare(`INSERT INTO fx_push (endpoint, user_id, p256dh, auth, at, tz, days, sent, added) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, ?8)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = ?2, p256dh = ?3, auth = ?4, at = ?5, tz = ?6, days = ?7`)
    .bind(sub.endpoint, userId, keys.p256dh, keys.auth, at, b.tz, JSON.stringify(cleanDays(b.days)), Date.now()).run();
  // (ten phones an account at most: the oldest goes as an eleventh comes)
  await D.prepare("DELETE FROM fx_push WHERE user_id = ?1 AND endpoint NOT IN (SELECT endpoint FROM fx_push WHERE user_id = ?1 ORDER BY added DESC LIMIT ?2)").bind(userId, PHONES).run();
  return { on: true, at };
}
// The account's morning reminder, as its Notifications page has it: { on, at (minutes after midnight, or null: each
// phone's own, as it was set there), phones (how many it's on) }
export async function morningOf(env, userId) {
  const D = await tables(env);
  const [m, n] = await Promise.all([D.prepare("SELECT off, at FROM fx_morning WHERE user_id = ?").bind(userId).first(),
    D.prepare("SELECT COUNT(*) AS n, MIN(at) AS at FROM fx_push WHERE user_id = ?").bind(userId).first()]);
  return { on: !m?.off, at: m?.at ?? n?.at ?? null, phones: n?.n || 0 };
}
// …changed there: { on, at }, for every phone it's on, now and to come
export async function setMorningFor(env, userId, b) {
  const was = await morningOf(env, userId), on = b.on === undefined ? was.on : !!b.on;
  let at = b.at === undefined ? was.at : Number(b.at);
  if (at != null && (!Number.isInteger(at) || at < 0 || at >= 24 * 60)) throw new HttpError(400, "Choose a time.");
  const D = await tables(env);
  await D.batch([D.prepare("INSERT INTO fx_morning (user_id, off, at) VALUES (?1, ?2, ?3) ON CONFLICT(user_id) DO UPDATE SET off = ?2, at = ?3").bind(userId, on ? 0 : 1, at),
    ...(at != null ? [D.prepare("UPDATE fx_push SET at = ?2 WHERE user_id = ?1").bind(userId, at)] : [])]);
  return morningOf(env, userId);
}
// Turned off on this phone (or the phone's gone)
// The browser renewed a phone's subscription by itself (sw.js, pushsubscriptionchange): its morning notification moves
// to the new one, time, place and words as they were. Only a phone of the signed-in account's.
export async function moveMorning(env, userId, b) {
  const sub = b?.sub, keys = await keysOk(sub), was = String(b?.was || "");
  if (!sub || !pushEndpointOk(sub.endpoint) || !keys || !was || was.length > 1000) throw new HttpError(400, "Bad request.");
  const D = await tables(env);
  const r = await D.prepare("UPDATE fx_push SET endpoint = ?1, p256dh = ?2, auth = ?3 WHERE endpoint = ?4 AND user_id = ?5 AND NOT EXISTS (SELECT 1 FROM fx_push WHERE endpoint = ?1)")
    .bind(sub.endpoint, keys.p256dh, keys.auth, was, userId).run();
  return { moved: !!r.meta?.changes };
}
export async function stopMorning(env, userId, endpoint) {
  const D = await tables(env);
  await D.prepare("DELETE FROM fx_push WHERE endpoint = ? AND user_id = ?").bind(String(endpoint || ""), userId).run();
}
// where a phone is, now: its day ("2026-10-26") and the minutes since its midnight
function localNow(tz, t) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, mins: Number(p.hour) * 60 + Number(p.minute) };
}
// The scheduler's turn: each phone whose time has come today, and that hasn't had today's, sent it
const PHONES = 10, PER_TICK = 200;
export async function morningTick(env, t = Date.now()) {
  const D = await tables(env);
  // (not those whose account has turned it off on its Notifications page)
  const { results } = await D.prepare("SELECT p.endpoint, p.p256dh, p.auth, p.at, p.tz, p.days, p.sent FROM fx_push p LEFT JOIN fx_morning m ON m.user_id = p.user_id WHERE coalesce(m.off, 0) = 0").all();
  let sent = 0;
  for (const r of results) {
    const now = localNow(r.tz, t);
    if (r.sent === now.day || now.mins < r.at || now.mins > r.at + LATE) continue;
    // (claimed first, so two ticks at once send it once)
    const claim = await D.prepare("UPDATE fx_push SET sent = ?2 WHERE endpoint = ?1 AND (sent IS NULL OR sent != ?2)").bind(r.endpoint, now.day).run();
    if (!claim.meta?.changes) continue;
    if (sent >= PER_TICK) { await D.prepare("UPDATE fx_push SET sent = ?2 WHERE endpoint = ?1").bind(r.endpoint, r.sent).run(); break; }   // (the rest next minute, still in time)
    let days = {}; try { days = JSON.parse(r.days || "{}"); } catch (_) {}
    const note = days[now.day];
    if (!note) continue;   // (its words run out: the app hasn't been opened for a week or more)
    const out = await pushToSub(env, r, { title: note.title, body: note.body, tag: "fitness-morning", url: "./", ttl: 4 * 3600 }).catch(() => "failed");
    if (out === "gone") await D.prepare("DELETE FROM fx_push WHERE endpoint = ?").bind(r.endpoint).run();
    else if (out === "sent") sent++;
    // (not sent, the push service down a moment, say: the day given back, so the next tick, still in time, tries again)
    else await D.prepare("UPDATE fx_push SET sent = ?2 WHERE endpoint = ?1 AND sent = ?3").bind(r.endpoint, r.sent ?? null, now.day).run();
  }
  return { phones: results.length, sent };
}
