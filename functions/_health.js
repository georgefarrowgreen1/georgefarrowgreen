// Fitness and Apple Health, by a Shortcut on your iPhone. Apple keeps Health on the phone (there's no web API to ask,
// as there is Garmin's), so the phone sends it: a personal automation each morning finds last night's heart rate
// variability, resting heart rate and sleep in Health, and posts them to an address of your own: the key is in it
// (/api/fitness/health/<key>; or Authorization: Bearer, to the plain address), so there's one thing to copy and no
// header to type. The key can only send nights, nothing more.
//
// What's kept: the key's hash (fx_health_key; the key itself shown once, as it's made, and made again to replace it),
// when it last sent, and each night (fx_health: hrv in ms, as the Watch has it, its SDNN, not Garmin's RMSSD, so the two
// are never mixed; rhr, beats a minute; sleep, seconds). Two months of nights go to the app with your record.
//
// What the Shortcut sends is read leniently, as Shortcuts writes it: numbers, text with units ("45 ms", "7 hr 12 min"),
// or lists of either (several samples; a list put in a text field is one a line); as JSON or as a form, whichever the
// Shortcut's Request Body is set to (readBody). HRV: their average; resting heart rate:
// their middle; sleep: their total (a plain number under 24 is hours, under 1,440 minutes, else seconds). The day is
// today where you are (Cloudflare's guess of your time zone), unless it says { day: "YYYY-MM-DD" }.
import { HttpError, hex, sha256, limit, randomToken } from "./_pigeon.js";
import { fitdb } from "./_fitness.js";

async function tables(env) {
  const D = await fitdb(env);
  if (!tables.done) {
    await D.batch([
      D.prepare("CREATE TABLE IF NOT EXISTS fx_health_key (user_id TEXT PRIMARY KEY, hash TEXT NOT NULL UNIQUE, added INTEGER NOT NULL, last INTEGER, said TEXT)"),
      D.prepare("CREATE TABLE IF NOT EXISTS fx_health (user_id TEXT NOT NULL, day TEXT NOT NULL, hrv REAL, rhr INTEGER, sleep INTEGER, at INTEGER NOT NULL, PRIMARY KEY (user_id, day))"),
    ]);
    tables.done = true;
  }
  return D;
}
const ymd = (t) => new Date(t).toISOString().slice(0, 10);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// ---- reading what Shortcuts sends ----
// (every value in it: a list's items, a text's lines)
const items = (v) => (Array.isArray(v) ? v.flatMap(items) : typeof v === "string" ? v.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean) : v == null ? [] : [v]);
const num = (x) => (typeof x === "number" ? x : Number(/-?\d+(?:\.\d+)?/.exec(String(x).replace(/,(?=\d{3}\b)/g, ""))?.[0]));
// a length of time in seconds: "7 hr 12 min", "1:03:00", "25200 s", or a plain number (null: plain, units unknown)
function secsOf(x) {
  if (typeof x === "number") return null;
  const s = String(x).toLowerCase();
  const clock = /^(\d+):(\d{2})(?::(\d{2}))?$/.exec(s.trim());
  if (clock) return clock[3] != null ? +clock[1] * 3600 + +clock[2] * 60 + +clock[3] : +clock[1] * 3600 + +clock[2] * 60;
  let t = 0, any = false;
  for (const [, v, u] of s.matchAll(/(\d+(?:\.\d+)?)\s*(h(?:ou)?rs?|h|min(?:ute)?s?|m|s(?:ec(?:ond)?s?)?)\b/g)) { any = true; t += +v * (u.startsWith("h") ? 3600 : u.startsWith("m") ? 60 : 1); }
  return any ? t : null;
}
export function nightFrom(b) {
  const hrv = items(b.hrv).map(num).filter((v) => v >= 5 && v <= 300);
  const rhr = items(b.rhr ?? b.restingHeartRate).map(num).filter((v) => v >= 25 && v <= 130).sort((x, y) => x - y);
  const sl = items(b.sleep);
  let sleep = null;
  if (sl.length) {
    const withUnits = sl.map(secsOf);
    if (withUnits.every((v) => v != null)) sleep = withUnits.reduce((a, v) => a + v, 0);
    else { const t = sl.map(num).filter(Number.isFinite).reduce((a, v) => a + v, 0); sleep = t <= 24 ? t * 3600 : t <= 1440 ? t * 60 : t; }
    if (!(sleep >= 600 && sleep <= 86400)) sleep = null;
  }
  return { hrv: hrv.length ? Math.round((hrv.reduce((a, v) => a + v, 0) / hrv.length) * 10) / 10 : null, rhr: rhr.length ? Math.round(rhr[rhr.length >> 1]) : null, sleep: sleep == null ? null : Math.round(sleep) };
}
// today where you are, by your time zone's name (Cloudflare's), else UTC's
export function dayIn(tz, t = Date.now()) {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(t); } catch (_) { return ymd(t); }
}

// ---- the key ----
// A new key (replacing any old one, which stops working), shown this once → { key }
export async function newKey(env, userId) {
  const D = await tables(env);
  await limit(env, `fxhealthkey:${userId}`, 20, 3600e3);
  const key = "fxh_" + randomToken(32);
  await D.prepare("INSERT INTO fx_health_key (user_id, hash, added) VALUES (?1, ?2, ?3) ON CONFLICT(user_id) DO UPDATE SET hash = ?2, added = ?3, last = NULL, said = NULL")
    .bind(userId, hex(await sha256(key)), Date.now()).run();
  return { key, ...(await healthOf(env, userId)) };
}
// Off: the key forgotten, and the nights it sent
export async function forget(env, userId) {
  const D = await tables(env);
  await D.batch([D.prepare("DELETE FROM fx_health_key WHERE user_id = ?").bind(userId), D.prepare("DELETE FROM fx_health WHERE user_id = ?").bind(userId)]);
  return { on: false };
}
// What the app's told: on or not, when the Shortcut last sent and what, and the last two months of nights
export async function healthOf(env, userId) {
  const D = await tables(env), k = await D.prepare("SELECT added, last, said FROM fx_health_key WHERE user_id = ?").bind(userId).first();
  if (!k) return { on: false };
  const { results } = await D.prepare("SELECT day, hrv, rhr, sleep FROM fx_health WHERE user_id = ? AND day >= ? ORDER BY day").bind(userId, ymd(Date.now() - 60 * 86400e3)).all();
  return { on: true, since: k.added, last: k.last || null, said: k.said ? JSON.parse(k.said) : null, well: results.map((r) => Object.fromEntries(Object.entries(r).filter(([, v]) => v != null))) };
}

// ---- the Shortcut's morning post ----
// (the Shortcut's body: JSON, or a form, its fields kept as they came, a field sent twice as a list)
export async function readBody(request, max = 64 * 1024) {
  if (Number(request.headers.get("Content-Length")) > max) throw new HttpError(413, "Too big.");
  const ct = (request.headers.get("Content-Type") || "").toLowerCase();
  if (/multipart\/form-data|application\/x-www-form-urlencoded/.test(ct)) {
    const out = {};
    for (const [k, v] of (await request.formData()).entries()) if (typeof v === "string") out[k] = k in out ? [].concat(out[k], v) : v;
    return out;
  }
  const text = await request.text();
  if (text.length > max) throw new HttpError(413, "Too big.");
  try { const b = JSON.parse(text || "{}"); if (b && typeof b === "object" && !Array.isArray(b)) return b; } catch (_) {}
  throw new HttpError(400, "Fitness reads JSON or a form: set the Shortcut’s Request Body to JSON.");
}
export async function takeNight(env, request, b, inPath = null) {
  const auth = request.headers.get("Authorization") || "", key = inPath || /^Bearer\s+(\S+)$/i.exec(auth)?.[1] || (typeof b.key === "string" ? b.key.trim() : "");
  if (!/^fxh_[A-Za-z0-9_-]{20,80}$/.test(key)) throw new HttpError(401, "No key, or not a Fitness one: copy it again from Fitness, Apple Health.");
  const D = await tables(env), hash = hex(await sha256(key)), k = await D.prepare("SELECT user_id FROM fx_health_key WHERE hash = ?").bind(hash).first();
  if (!k) throw new HttpError(401, "That key isn’t Fitness’s any more: make a new one in Fitness, Apple Health.");
  await limit(env, `fxhealth:${k.user_id}`, 60, 86400e3);
  const n = nightFrom(b), day = typeof b.day === "string" && DATE.test(b.day) ? b.day : dayIn(request.cf?.timezone);
  if (n.hrv == null && n.rhr == null && n.sleep == null) {
    await D.prepare("UPDATE fx_health_key SET last = ?2, said = ?3 WHERE user_id = ?1").bind(k.user_id, Date.now(), JSON.stringify({ day, none: true })).run();
    throw new HttpError(400, "Nothing Fitness could read: it looks for hrv, rhr and sleep.");
  }
  await D.batch([
    D.prepare(`INSERT INTO fx_health (user_id, day, hrv, rhr, sleep, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
      ON CONFLICT(user_id, day) DO UPDATE SET hrv = COALESCE(?3, hrv), rhr = COALESCE(?4, rhr), sleep = COALESCE(?5, sleep), at = ?6`).bind(k.user_id, day, n.hrv, n.rhr, n.sleep, Date.now()),
    D.prepare("UPDATE fx_health_key SET last = ?2, said = ?3 WHERE user_id = ?1").bind(k.user_id, Date.now(), JSON.stringify({ day, ...n })),
    D.prepare("DELETE FROM fx_health WHERE user_id = ? AND day < ?").bind(k.user_id, ymd(Date.now() - 120 * 86400e3)),
  ]);
  const said = [n.hrv != null && `HRV ${n.hrv} ms`, n.rhr != null && `resting ${n.rhr} bpm`, n.sleep != null && `${Math.floor(n.sleep / 3600)} h ${Math.round((n.sleep % 3600) / 60)} min asleep`].filter(Boolean).join(", ");
  return { ok: true, day, ...n, said: `Fitness has it: ${said}.` };
}
