// InFlite Today (inflite.ai): what the account keeps for it. Today is a Worker of its own (the inflite repo's today/),
// which asks here, at the account's address (functions/_todayapp.js), as Mail does. Kept here:
// - each account's cards, in its order and with those it hid (Edit), and its morning notification: on or off, its time
//   in the account's zone, which apps' lines it has, the day it was last sent and what it said (td_prefs);
// - the devices the morning notification goes to: each a push subscription made by inflite.ai's own service worker,
//   with the site's one key (functions/_notify.js vapid), and the sign-in it was last handed over with (td_push). It
//   lasts until it's turned off there, signed out there, its push service says it's gone, or the account goes: never
//   only because a sign-in ended (expired, ended from elsewhere), so This Phone never turns itself off;
// - the account's own word on its notifications, whichever device said it (td_prefs push_on, push_every: pushPrefs);
// - what Today did or offered, each kept for Undo (td_acts), the days its plan has run (td_plans), and each rule's level
//   and record (td_rules), all read and written by functions/_todayacts.js.
// The cards themselves are worked out by functions/_todaycards.js, and the morning composed and sent by
// functions/_todaymorning.js. (This never imports those, nor Weather's or Fitness's: they import it.)

import { HttpError, sha256, b64url, fromB64url } from "./_pigeon.js";
import { pushEndpointOk } from "./_notify.js";
import { timesExport, dropTimes } from "./_times.js";

// the cards a saved order may name (Mail's: the site's admin's alone, whose card is drawn only for them)
export const CARDS = ["weather", "chat", "fitness", "markets", "mail"];
// the four every account has, in the order a new account has them, and the morning notification's lines: the cards but
// Mail's, which is never a line of the morning (One roof stage 4, BI14) and never added to a saved order (Mail's card is
// in one only where the admin's Edit saved it: the account's page and data say the four, as before; Today's page adds a
// card missing from the order at its end)
export const LINES = ["weather", "chat", "fitness", "markets"];
// devices an account keeps (an eleventh drops the oldest: a device's page hands it over again as it opens, so it's
// never one in use)
const DEVICES = 10;

let ready = null;
export async function tddb(env) {
  if (!env.DB) throw new HttpError(503, "Not set up.");
  if (!ready) ready = (async () => {
    // (the tables made as setup() makes them already, by this or another copy of the server: one look, not a few trips)
    if ((await env.DB.prepare("SELECT v FROM td_meta WHERE k = 'schema_fp'").first().catch(() => null))?.v === SCHEMA_FP) return;
    await setup(env);
    await env.DB.prepare("INSERT OR REPLACE INTO td_meta (k, v) VALUES ('schema_fp', ?)").bind(SCHEMA_FP).run();
  })().catch((e) => { ready = null; throw e; });
  await ready;
  return env.DB;
}
// The tables (each step safe to run again; a column added later is an ALTER TABLE here, its failure ignored).
// SCHEMA_FP is its own text's fingerprint, so any change here has every copy of the server run it once more.
async function setup(env) {
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS td_meta (k TEXT PRIMARY KEY, v TEXT)"),
    // (cards: { order, hidden }, Edit's; m_at: minutes after local midnight; m_tz: the browser's zone, sent with each
    // change from Today's page; m_lines: { chat: false, … }, false turning a line off, one not there on; m_sent: the
    // local day ("YYYY-MM-DD") it was last sent, its claim; m_last: what that said, { title, lines, out, at })
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS td_prefs (user_id TEXT PRIMARY KEY, cards TEXT NOT NULL DEFAULT '{}', m_on INTEGER NOT NULL DEFAULT 0,
      m_at INTEGER NOT NULL DEFAULT 420, m_tz TEXT, m_lines TEXT NOT NULL DEFAULT '{}', m_sent TEXT, m_last TEXT, updated INTEGER NOT NULL)`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS td_prefs_on ON td_prefs (m_on) WHERE m_on = 1"),
    // (session: the sign-in it was made with, so it's gone with that)
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS td_push (endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
      session TEXT, added INTEGER NOT NULL, fails INTEGER NOT NULL DEFAULT 0, ok_at INTEGER)`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS td_push_user ON td_push (user_id)"),
    // (Today First, functions/_todayacts.js: what Today did or offered, kept for Undo. rule: moveRide | addRide | rideThen;
    // day: YYYY-MM-DD in the account's zone; kind: move | add | time; state: done | offered | taken | undone | kept |
    // ignored; was, now: JSON, the target before and after; one a rule, day and target)
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS td_acts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, rule TEXT NOT NULL, day TEXT NOT NULL,
      target TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL, state TEXT NOT NULL, level TEXT NOT NULL, was TEXT, now TEXT, said TEXT NOT NULL,
      made INTEGER NOT NULL, undo_until INTEGER NOT NULL, UNIQUE (user_id, rule, day, target))`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS td_acts_user ON td_acts (user_id, day)"),
    // (one a day once its plan has run: claimed first with INSERT OR IGNORE, so the morning's tick and a page never both act)
    env.DB.prepare("CREATE TABLE IF NOT EXISTS td_plans (user_id TEXT NOT NULL, day TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (user_id, day))"),
    // (each rule's level and record, on the account. level: do | suggest | quiet; set_by: auto | you; kept_since: kept since
    // the last level change)
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS td_rules (user_id TEXT NOT NULL, rule TEXT NOT NULL, level TEXT NOT NULL DEFAULT 'do',
      set_by TEXT NOT NULL DEFAULT 'auto', done INTEGER NOT NULL DEFAULT 0, kept INTEGER NOT NULL DEFAULT 0, undone INTEGER NOT NULL DEFAULT 0,
      ignored INTEGER NOT NULL DEFAULT 0, held INTEGER NOT NULL DEFAULT 0, kept_since INTEGER NOT NULL DEFAULT 0, level_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, rule))`),
  ]);
  // (the account's word on its notifications, added later: push_on, wanted, said on any device, and unsaid only by
  // turning off the last one that has them; push_every, Get Every App's Notifications Here chosen, on any device)
  for (const c of ["push_on", "push_every"]) await env.DB.prepare(`ALTER TABLE td_prefs ADD COLUMN ${c} INTEGER NOT NULL DEFAULT 0`).run().catch(() => {});
  // (said already, before it was kept: by a device that has them, and by every app's rows made from the tap)
  await env.DB.prepare(`INSERT INTO td_prefs (user_id, push_on, updated) SELECT DISTINCT user_id, 1, ?1 FROM td_push WHERE true
    ON CONFLICT(user_id) DO UPDATE SET push_on = 1`).bind(Date.now()).run().catch(() => {});
  await env.DB.prepare("UPDATE td_prefs SET push_every = 1 WHERE push_on = 1 AND user_id IN (SELECT user_id FROM pg_push WHERE via = 'hub')").run().catch(() => {});
}
const fingerprint = (text) => { let h = 2166136261; for (const c of text) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return "t" + h.toString(36); };
const SCHEMA_FP = fingerprint(setup.toString());


// (a zone the clocks know, by its IANA name)
const tzOk = (tz) => {
  if (typeof tz !== "string" || !tz || tz.length >= 64) return false;
  try { new Intl.DateTimeFormat("en-GB", { timeZone: tz }); return true; } catch (_) { return false; }
};
const parsed = (s, or) => { try { const v = JSON.parse(s); return v && typeof v === "object" && !Array.isArray(v) ? v : or; } catch (_) { return or; } };
const hhmm = (mins) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

// ---- the cards and the morning, as the account has them ----
// (the cards in the account's order, those it doesn't know left out and any missing put at the end; and those it hid)
function cardsOf(c) {
  const order = [...new Set((Array.isArray(c?.order) ? c.order : []).filter((k) => CARDS.includes(k)))];
  return { order: [...order, ...LINES.filter((k) => !order.includes(k))], hidden: [...new Set((Array.isArray(c?.hidden) ? c.hidden : []).filter((k) => CARDS.includes(k)))] };
}
// (the lines turned off: false for each, nothing for one that's on)
const linesOf = (l) => Object.fromEntries(LINES.filter((k) => l?.[k] === false).map((k) => [k, false]));
const COLS = "cards, m_on, m_at, m_tz, m_lines, m_sent, m_last, updated";
// (updated: when it was last changed; null for an account that's never changed anything here)
const rowOf = (r) => ({
  m_on: r?.m_on ? 1 : 0, m_at: Number.isInteger(r?.m_at) ? r.m_at : 420, m_tz: tzOk(r?.m_tz) ? r.m_tz : null, m_lines: linesOf(parsed(r?.m_lines, {})),
  m_sent: r?.m_sent || null, m_last: r?.m_last ? parsed(r.m_last, null) : null, cards: cardsOf(parsed(r?.cards, {})), updated: r?.updated ?? null,
});
// A row is td_prefs' columns, with m_lines, m_last and cards read: { m_on, m_at, m_tz, m_lines, m_sent, m_last, cards }
// (an account with none has the defaults)
export async function todayPrefs(env, userId) {
  const D = await tddb(env);
  return rowOf(await D.prepare(`SELECT ${COLS} FROM td_prefs WHERE user_id = ?`).bind(userId).first());
}
// Edit's: the cards' order and those hidden, either or both ({ order, hidden }: lists of the cards' names; one the
// server doesn't know is left out). The one not sent stays as it was, kept against a change made meanwhile elsewhere.
export async function savePrefs(env, userId, { order, hidden }) {
  const list = (v) => {
    if (v === undefined) return undefined;
    if (!Array.isArray(v) || v.length > 20 || !v.every((k) => typeof k === "string")) throw new HttpError(400, "Bad request.");
    return v;
  };
  const o = list(order), hid = list(hidden), D = await tddb(env), t = Date.now();
  if (o && hid) {
    await D.prepare("INSERT INTO td_prefs (user_id, cards, updated) VALUES (?1, ?2, ?3) ON CONFLICT(user_id) DO UPDATE SET cards = ?2, updated = ?3")
      .bind(userId, JSON.stringify(cardsOf({ order: o, hidden: hid })), t).run();
    return todayPrefs(env, userId);
  }
  for (let i = 0; i < 3; i++) {
    const r = await D.prepare("SELECT cards FROM td_prefs WHERE user_id = ?").bind(userId).first(), was = cardsOf(parsed(r?.cards, {}));
    const now = JSON.stringify(cardsOf({ order: o ?? was.order, hidden: hid ?? was.hidden }));
    const w = r
      ? await D.prepare("UPDATE td_prefs SET cards = ?2, updated = ?3 WHERE user_id = ?1 AND cards = ?4").bind(userId, now, t, r.cards).run()
      : await D.prepare("INSERT INTO td_prefs (user_id, cards, updated) VALUES (?1, ?2, ?3) ON CONFLICT(user_id) DO NOTHING").bind(userId, now, t).run();
    if (w.meta?.changes) return todayPrefs(env, userId);
  }
  throw new HttpError(409, "Your cards were changing on another device. Try again.");
}
// The morning notification's settings, any of them: on (true or false); at (minutes after midnight, on the five
// minutes); lines ({ weather, fitness, chat, markets }, each true or false); tz (the browser's zone, kept where it's
// one the clocks know). Each a change in the one statement, so two made at once both stay.
// (at, the first time it's turned on, is the caller's: functions/_todayapp.js firstMorningAt)
export async function saveMorning(env, userId, { on, at, lines, tz }) {
  if (on !== undefined && typeof on !== "boolean") throw new HttpError(400, "Choose on or off.");
  if (at !== undefined && !(Number.isInteger(at) && at >= 0 && at <= 1435 && at % 5 === 0)) throw new HttpError(400, "Choose a time.");
  // (a line turned off is kept as false; one turned on is taken out, as one not there is on)
  const patch = {};
  if (lines !== undefined) {
    if (!lines || typeof lines !== "object" || Array.isArray(lines)) throw new HttpError(400, "Choose on or off.");
    for (const k of LINES) if (lines[k] !== undefined) { if (typeof lines[k] !== "boolean") throw new HttpError(400, "Choose on or off."); patch[k] = lines[k] ? null : false; }
  }
  const D = await tddb(env);
  await D.prepare(`INSERT INTO td_prefs (user_id, m_on, m_at, m_tz, m_lines, updated) VALUES (?1, COALESCE(?2, 0), COALESCE(?3, 420), ?4, json_patch('{}', ?5), ?6)
    ON CONFLICT(user_id) DO UPDATE SET m_on = COALESCE(?2, m_on), m_at = COALESCE(?3, m_at), m_tz = COALESCE(?4, m_tz),
      m_lines = json_patch(CASE WHEN json_valid(m_lines) THEN m_lines ELSE '{}' END, ?5), updated = ?6`)
    .bind(userId, on === undefined ? null : on ? 1 : 0, at ?? null, tzOk(tz) ? tz : null, JSON.stringify(patch), Date.now()).run();
  return todayPrefs(env, userId);
}
// The account's zone, for the morning and the cards' day: its Quiet Hours' zone where it chose one (notify_prefs.tz, as
// stored: not the default Chat's preferences fill in), else the one Today's page last sent, else London's.
// u: { id, notify_prefs }
export function morningTz(u, row) {
  const p = parsed(u?.notify_prefs || "{}", {});
  if (tzOk(p.tz)) return p.tz;
  if (tzOk(row?.m_tz)) return row.m_tz;
  return "Europe/London";
}

// ---- the devices ----
// a device as a page names it, never by its push address (an address ends up in logs): the first 16 characters of
// the address's SHA-256, b64url
export async function deviceHash(endpoint) {
  return b64url(await sha256(String(endpoint ?? ""))).slice(0, 16);
}
// a phone's keys, as the push standard has them: a P-256 public key (65 bytes, uncompressed) and a 16-byte secret (as
// Fitness checks them: functions/_fitpush.js)
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
const howMany = async (D, userId) => (await D.prepare("SELECT COUNT(*) AS n FROM td_push WHERE user_id = ?").bind(userId).first())?.n || 0;
// the account's devices: [{ endpoint, p256dh, auth, session, fails }]
export async function todayDevices(env, userId) {
  const D = await tddb(env);
  return (await D.prepare("SELECT endpoint, p256dh, auth, session, fails FROM td_push WHERE user_id = ? ORDER BY added").bind(userId).all()).results;
}
// The account's word on its notifications → { on, every }: on, wanted (a device that can have them, without one of its
// own yet, takes one as its page opens); every, every app's to come to each device that has them, not only Today's
export async function pushPrefs(env, userId) {
  const r = await (await tddb(env)).prepare("SELECT push_on, push_every FROM td_prefs WHERE user_id = ?").bind(userId).first();
  return { on: !!r?.push_on, every: !!r?.push_every };
}
// …changed, either or both ({ on, every }: true or false)
export async function setPushPrefs(env, userId, { on, every }) {
  const b = (v) => (v === undefined ? null : v ? 1 : 0);
  await (await tddb(env)).prepare(`INSERT INTO td_prefs (user_id, push_on, push_every, updated) VALUES (?1, COALESCE(?2, 0), COALESCE(?3, 0), ?4)
    ON CONFLICT(user_id) DO UPDATE SET push_on = COALESCE(?2, push_on), push_every = COALESCE(?3, push_every)`).bind(userId, b(on), b(every), Date.now()).run();
}
// Turned on on a device: its subscription (as the browser gives it), for this account and this sign-in, taken from
// another account or sign-in where it was theirs, its failures forgotten; and the account wants them from now on.
// u: { id, sessionHash } → { ok: true, devices }
export async function addDevice(env, u, sub) {
  const keys = await keysOk(sub);
  if (!sub || typeof sub !== "object" || !pushEndpointOk(sub.endpoint) || !keys) throw new HttpError(400, "That isn’t a push subscription this server can send to.");
  const D = await tddb(env);
  await D.prepare(`INSERT INTO td_push (endpoint, user_id, p256dh, auth, session, added, fails) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = ?2, p256dh = ?3, auth = ?4, session = ?5, added = ?6, fails = 0, ok_at = NULL`)
    .bind(sub.endpoint, u.id, keys.p256dh, keys.auth, u.sessionHash || null, Date.now()).run();
  // (ten an account at most: the oldest goes as an eleventh comes)
  await D.prepare("DELETE FROM td_push WHERE user_id = ?1 AND endpoint NOT IN (SELECT endpoint FROM td_push WHERE user_id = ?1 ORDER BY added DESC LIMIT ?2)").bind(u.id, DEVICES).run();
  await setPushPrefs(env, u.id, { on: true });
  return { ok: true, devices: await howMany(D, u.id) };
}
// The browser renewed a device's subscription by itself (sw.js, pushsubscriptionchange): it moves to the new one, only
// where it's this account's and the new one isn't already someone's. → { moved }
export async function moveDevice(env, u, { sub, was }) {
  const keys = await keysOk(sub), from = typeof was === "string" ? was : "";
  if (!sub || typeof sub !== "object" || !pushEndpointOk(sub.endpoint) || !keys || !from || from.length > 1000) throw new HttpError(400, "Bad request.");
  const D = await tddb(env);
  const r = await D.prepare(`UPDATE td_push SET endpoint = ?1, p256dh = ?2, auth = ?3, session = COALESCE(?6, session), fails = 0, ok_at = NULL
    WHERE endpoint = ?4 AND user_id = ?5 AND NOT EXISTS (SELECT 1 FROM td_push WHERE endpoint = ?1)`).bind(sub.endpoint, keys.p256dh, keys.auth, from, u.id, u.sessionHash || null).run();
  return { moved: !!r.meta?.changes };
}
// Turned off on a device: only where it's this account's; the last one turned off, the account doesn't want them any
// more (a device signed out isn't turned off: its sign-out's own) → { ok: true, devices }
export async function removeDevice(env, userId, endpoint) {
  if (typeof endpoint !== "string" || !endpoint || endpoint.length > 1000) throw new HttpError(400, "Bad request.");
  const D = await tddb(env);
  await D.prepare("DELETE FROM td_push WHERE endpoint = ? AND user_id = ?").bind(endpoint, userId).run();
  return { ok: true, devices: await lastOff(env, D, userId) };
}
// (how many it's on now; none, and push_on's unsaid)
export async function lastOff(env, D, userId) {
  const n = await howMany(D, userId);
  if (!n) await D.prepare("UPDATE td_prefs SET push_on = 0 WHERE user_id = ?").bind(userId).run();
  return n;
}
// how a send to a device went: taken (its failures forgotten), gone (the push service says so, 404 or 410: forgotten),
// or failed (counted, and kept: a push service that's down, or slow, for a while never turns a phone off)
export async function deviceOk(env, endpoint) {
  await (await tddb(env)).prepare("UPDATE td_push SET fails = 0, ok_at = ? WHERE endpoint = ?").bind(Date.now(), endpoint).run();
}
export async function deviceGone(env, endpoint) {
  await (await tddb(env)).prepare("DELETE FROM td_push WHERE endpoint = ?").bind(endpoint).run();
}
// → whether it's been dropped: never (a device goes only as deviceGone says)
export async function deviceFailed(env, endpoint) {
  await (await tddb(env)).prepare("UPDATE td_push SET fails = fails + 1 WHERE endpoint = ?").bind(endpoint).run();
  return false;
}
// devices of accounts being deleted → how many went
export async function tidyDevices(env) {
  const D = await tddb(env);
  const r = await D.prepare("DELETE FROM td_push WHERE EXISTS (SELECT 1 FROM pg_users u WHERE u.id = td_push.user_id AND u.delete_at IS NOT NULL)").run();
  return r.meta?.changes || 0;
}

// ---- the morning's send (functions/_todaymorning.js) ----
// the accounts with the morning on, not being deleted, with a device: [{ u: { id, notify_prefs, pigeons }, row }] (pigeons: Chat's
// card says letters plainly to someone with them off)
export async function morningCandidates(env) {
  const D = await tddb(env);
  const { results } = await D.prepare(`SELECT p.user_id, ${COLS.split(", ").map((c) => "p." + c).join(", ")}, u.notify_prefs, u.pigeons FROM td_prefs p JOIN pg_users u ON u.id = p.user_id
    WHERE p.m_on = 1 AND u.delete_at IS NULL AND EXISTS (SELECT 1 FROM td_push p2 WHERE p2.user_id = p.user_id)`).all();
  return results.map((r) => ({ u: { id: r.user_id, notify_prefs: r.notify_prefs ?? null, pigeons: r.pigeons ?? 1 }, row: rowOf(r) }));
}
// the day claimed, only where it's still as it was (was: the row's m_sent) → whether it's this one's
export async function claimMorning(env, userId, day, was) {
  const D = await tddb(env);
  return !!(await D.prepare("UPDATE td_prefs SET m_sent = ?2 WHERE user_id = ?1 AND m_sent IS ?3").bind(userId, day, was ?? null).run()).meta?.changes;
}
// and given back, only where it's still this day's
export async function releaseMorning(env, userId, day, was) {
  const D = await tddb(env);
  await D.prepare("UPDATE td_prefs SET m_sent = ?3 WHERE user_id = ?1 AND m_sent = ?2").bind(userId, day, was ?? null).run();
}
// what the day's said, for the Morning section's "This morning's"
export async function keepLast(env, userId, { title, lines, out, at }) {
  const text = (s, n) => String(s ?? "").slice(0, n), list = (v, n) => (Array.isArray(v) ? v : []).slice(0, 8).map((x) => text(x, n));
  const last = { title: text(title, 200), lines: list(lines, 500), out: list(out, 40), at: Number.isFinite(at) ? at : Date.now() };
  await (await tddb(env)).prepare("UPDATE td_prefs SET m_last = ? WHERE user_id = ?").bind(JSON.stringify(last), userId).run();
}
// the accounts whose morning comes from Today, so Weather's briefing and Fitness's morning reminder don't: on, with a
// device → a Set of their ids
export async function morningUsers(env) {
  const D = await tddb(env);
  const { results } = await D.prepare("SELECT DISTINCT d.user_id FROM td_prefs t JOIN td_push d ON d.user_id = t.user_id WHERE t.m_on = 1").all();
  return new Set(results.map((r) => r.user_id));
}

// ---- the account going, and what it keeps ----
// (each on its own, as the tables may not be made yet): its cards and morning, its devices, what Today did or offered,
// the days its plan ran, its rules' levels and records, and the times it agreed in Chat (functions/_times.js)
export async function dropToday(env, userId) {
  if (!env.DB) return;
  for (const t of ["td_push", "td_prefs", "td_acts", "td_plans", "td_rules"]) await env.DB.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(userId).run().catch(() => {});
  await dropTimes(env, userId);
}
// (each act as the account can read it: what it was and did, never another account's id; was and now, as kept)
const actOut = (r) => ({ rule: r.rule, day: r.day, kind: r.kind, state: r.state, level: r.level, said: r.said, made: r.made, undoUntil: r.undo_until,
  was: parsed(r.was, null), now: parsed(r.now, null) });
const ruleOut = (r) => ({ rule: r.rule, level: r.level, setBy: r.set_by, levelAt: r.level_at || null,
  record: { done: r.done, kept: r.kept, undone: r.undone, ignored: r.ignored, held: r.held, keptSince: r.kept_since } });
// For the account's data (functions/api/account export): the cards as the account has them, its morning notification
// and how many devices it's on; and Today First's: what Today did or offered (acts), its rules with their levels and
// records, the days its plan has run, and the times agreed in Chat (no ids: the letter's or the friend's)
export async function todayExport(env, userId) {
  const D = await tddb(env);
  const all = (q) => D.prepare(q).bind(userId).all().then((r) => r.results || [], () => []);
  const [row, devs, u, acts, rules, plans, times] = await Promise.all([todayPrefs(env, userId), todayDevices(env, userId),
    D.prepare("SELECT notify_prefs FROM pg_users WHERE id = ?").bind(userId).first().catch(() => null),
    all("SELECT rule, day, kind, state, level, said, made, undo_until, was, now FROM td_acts WHERE user_id = ? ORDER BY made, id"),
    all("SELECT rule, level, set_by, done, kept, undone, ignored, held, kept_since, level_at FROM td_rules WHERE user_id = ? ORDER BY rule"),
    all("SELECT day FROM td_plans WHERE user_id = ? ORDER BY day"),
    timesExport(env, userId).catch(() => [])]);
  return {
    cards: row.cards,
    morning: { on: !!row.m_on, at: hhmm(row.m_at), timeZone: morningTz({ id: userId, notify_prefs: u?.notify_prefs }, row),
      lines: Object.fromEntries(LINES.map((k) => [k, row.m_lines[k] !== false])), lastSent: row.m_sent || null },
    devices: devs.length,
    acts: acts.map(actOut),
    rules: rules.map(ruleOut),
    planned: plans.map((r) => r.day),
    times,
  };
}
