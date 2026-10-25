// Fitness and Garmin Connect, by your own Personal API key (made in Garmin Connect: Settings → Personal API Key). The
// key is Garmin's for one person's own data, read-only, and pulled, never pushed: so Fitness asks Garmin what's new,
// as you open the app and every few minutes from the site's scheduler (workers/ticker), and fetches each new
// activity's file, as Garmin keeps it (a zip of its FIT file).
//
// What's kept (fx_garmin): the key, locked as the site locks its secrets (functions/_atrest.js, bound to the account),
// and never shown again; the day's token Garmin swaps it for (24 hours at most, no refresh: swapped again); the newest
// start seen, the activities already fetched (so one you delete isn't fetched again), and how the last ask went.
// Each new activity's file waits in R2 (fitness/<account>/garmin/<id>, a row in fx_garmin_new) until the app reads it,
// as it reads any file you upload, and keeps it with its figures (POST /api/fitness/acts, with the id g<Garmin's id>),
// which clears it. Nothing here reads a file: the phone does that, as with every upload.
import { HttpError, limit } from "./_pigeon.js";
import { lockVault, openVault } from "./_atrest.js";
import { fitdb } from "./_fitness.js";

const API = "https://personal.connectapi.garmin.com";
const TOKEN = "/personalapitoken-service/personal-api/personal-api-key/token";
const SEARCH = "/activitylist-service/activities/search/activities";
const FILE = (id) => `/download-service/files/activity/${id}`;
export const EVERY = 15 * 60e3;          // how often the scheduler asks for each account
const FIRST = 42;                        // days fetched when first connected: the six weeks fitness is worked out over
const MOST = 10;                         // files fetched in one go (the rest the next time)
const SEEN = 600;                        // activities remembered as fetched
export const newKey = (userId, id) => `fitness/${userId}/garmin/${id}`;
const base = (env) => (env.GARMIN_API || API).replace(/\/$/, "");
const owner = (userId) => "fitness/garmin|" + userId;

async function tables(env) {
  const D = await fitdb(env);
  if (!tables.done) {
    await D.batch([
      D.prepare(`CREATE TABLE IF NOT EXISTS fx_garmin (user_id TEXT PRIMARY KEY, apikey TEXT NOT NULL, token TEXT, token_exp INTEGER, since INTEGER, seen TEXT,
        last INTEGER, ok INTEGER NOT NULL DEFAULT 1, said TEXT, added INTEGER NOT NULL)`),
      D.prepare("CREATE INDEX IF NOT EXISTS fx_garmin_last ON fx_garmin (ok, last)"),
      D.prepare(`CREATE TABLE IF NOT EXISTS fx_garmin_new (user_id TEXT NOT NULL, id TEXT NOT NULL, start INTEGER, name TEXT, added INTEGER NOT NULL, PRIMARY KEY (user_id, id))`),
    ]);
    tables.done = true;
  }
  return D;
}

// ---- asking Garmin ----
const garminSaid = (status) => Object.assign(new Error(`Garmin said ${status}`), { status });
// the key swapped for a token: { token, exp }
async function swap(env, key) {
  const r = await fetch(base(env) + TOKEN, { method: "POST", headers: { Authorization: `ApiKey ${key}`, Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw garminSaid(r.status);
  const j = await r.json().catch(() => ({}));
  const token = j.access_token || j.accessToken || j.token;
  if (!token) throw garminSaid("no token");
  // (its life as Garmin gives it, in seconds from now or as a time; else the day it's said to last)
  const at = Number(j.expires_in ?? j.expiresIn) > 0 ? Date.now() + Number(j.expires_in ?? j.expiresIn) * 1000
    : j.expires_at ?? j.expiresAt ? (Number(j.expires_at ?? j.expiresAt) > 1e12 ? Number(j.expires_at ?? j.expiresAt) : Number(j.expires_at ?? j.expiresAt) > 1e9 ? Number(j.expires_at ?? j.expiresAt) * 1000 : Date.parse(j.expires_at ?? j.expiresAt)) : NaN;
  return { token, exp: Number.isFinite(at) ? at : Date.now() + 23 * 3600e3 };
}
async function get(env, token, path, raw = false) {
  const r = await fetch(base(env) + path, { headers: { Authorization: `Bearer ${token}`, Accept: raw ? "*/*" : "application/json" }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw garminSaid(r.status);
  return raw ? new Uint8Array(await r.arrayBuffer()) : r.json();
}
// a time as Garmin writes it ("2026-10-25 08:12:03", in GMT, or milliseconds)
const when = (v) => (typeof v === "number" ? v : typeof v === "string" ? Date.parse(v.replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? "" : "Z")) : NaN);
const ymd = (t) => new Date(t).toISOString().slice(0, 10);

// ---- connecting, and not ----
// Your key: tried at once (a key Garmin won't take isn't kept), then kept, locked, and the first six weeks fetched
export async function connect(env, userId, rawKey) {
  const key = String(rawKey || "").trim();
  if (!/^[\x21-\x7e]{16,2048}$/.test(key)) throw new HttpError(400, "That doesn’t look like a Personal API key. Copy it again from Garmin Connect.", "key");
  const D = await tables(env);
  await limit(env, `fxgarmin:${userId}`, 20, 3600e3);
  let t;
  try { t = await swap(env, key); }
  catch (e) {
    if (e.status === 401 || e.status === 403 || e.status === 400) throw new HttpError(400, "Garmin didn’t take that key. Check it’s the whole key, and that it hasn’t been deleted or expired.", "key");
    throw new HttpError(502, "Garmin Connect didn’t answer. Try again in a moment.");
  }
  const now = Date.now();
  await D.prepare(`INSERT INTO fx_garmin (user_id, apikey, token, token_exp, since, seen, last, ok, said, added) VALUES (?1, ?2, ?3, ?4, ?5, '[]', NULL, 1, NULL, ?6)
    ON CONFLICT(user_id) DO UPDATE SET apikey = ?2, token = ?3, token_exp = ?4, ok = 1, said = NULL`)
    .bind(userId, await lockVault(env, owner(userId), key), await lockVault(env, owner(userId), t.token), t.exp, now - FIRST * 86400e3, now).run();
  return fetchNew(env, userId, { force: true });
}
// Disconnected: the key forgotten, and the files still waiting
export async function disconnect(env, userId) {
  const D = await tables(env), { results } = await D.prepare("SELECT id FROM fx_garmin_new WHERE user_id = ?").bind(userId).all();
  if (env.BIO_R2 && results.length) await env.BIO_R2.delete(results.map((r) => newKey(userId, r.id)));
  await D.batch([D.prepare("DELETE FROM fx_garmin WHERE user_id = ?").bind(userId), D.prepare("DELETE FROM fx_garmin_new WHERE user_id = ?").bind(userId)]);
}

// ---- what's new ----
// Garmin asked for what's started since the newest seen (a day's overlap, as it lists by day): each new one's file
// fetched to wait for the app. → the state, as garminOf has it. Not more than once every couple of minutes, unless forced.
export async function fetchNew(env, userId, { force = false } = {}) {
  const D = await tables(env);
  const g = await D.prepare("SELECT * FROM fx_garmin WHERE user_id = ?").bind(userId).first();
  if (!g) return garminOf(env, userId);
  const now = Date.now();
  if (!force && g.last && now - g.last < 2 * 60e3) return garminOf(env, userId);
  // (claimed first, so the scheduler and the app don't both ask at once)
  const claim = await D.prepare("UPDATE fx_garmin SET last = ?2 WHERE user_id = ?1 AND (last IS NULL OR last = ?3)").bind(userId, now, g.last ?? null).run();
  if (!claim.meta?.changes && !force) return garminOf(env, userId);
  const fail = async (said, ok = 1) => { await D.prepare("UPDATE fx_garmin SET ok = ?2, said = ?3 WHERE user_id = ?1").bind(userId, ok, said).run(); return garminOf(env, userId); };
  try {
    let token = g.token && g.token_exp > now + 5 * 60e3 ? await openVault(env, owner(userId), g.token) : null;
    if (!token) {
      try {
        const t = await swap(env, await openVault(env, owner(userId), g.apikey));
        token = t.token;
        await D.prepare("UPDATE fx_garmin SET token = ?2, token_exp = ?3 WHERE user_id = ?1").bind(userId, await lockVault(env, owner(userId), t.token), t.exp).run();
      } catch (e) {
        if (e.status === 401 || e.status === 403 || e.status === 400) return fail("expired", 0);
        throw e;
      }
    }
    const seen = new Set(JSON.parse(g.seen || "[]")), waiting = new Set((await D.prepare("SELECT id FROM fx_garmin_new WHERE user_id = ?").bind(userId).all()).results.map((r) => r.id));
    const from = ymd((g.since || now - FIRST * 86400e3) - 86400e3), found = [];
    for (let start = 0; start < 200; start += 50) {
      const page = await get(env, token, `${SEARCH}?start=${start}&limit=50&startDate=${from}&endDate=${ymd(now + 86400e3)}`);
      const list = Array.isArray(page) ? page : page?.activities || page?.activityList || page?.results || [];
      for (const a of list) {
        const id = String(a.activityId ?? a.id ?? "");
        if (/^\d{1,20}$/.test(id) && !seen.has(id) && !waiting.has(id)) found.push({ id, start: when(a.startTimeGMT ?? a.beginTimestamp ?? a.startTimeLocal), name: String(a.activityName || "").slice(0, 80) || null });
      }
      if (list.length < 50) break;
    }
    // oldest first, so a long gap fills in order; a few at a time
    found.sort((a, b) => (a.start || 0) - (b.start || 0));
    let since = g.since || 0;
    for (const a of found.slice(0, MOST)) {
      let bytes;
      try { bytes = await get(env, token, FILE(a.id), true); }
      catch (e) { if (e.status === 404) { seen.add(a.id); continue; } throw e; }   // (one with no file: a manual entry)
      if (!env.BIO_R2) throw new HttpError(503, "Not set up.");
      await env.BIO_R2.put(newKey(userId, a.id), bytes, { httpMetadata: { contentType: "application/octet-stream" } });
      await D.prepare("INSERT OR IGNORE INTO fx_garmin_new (user_id, id, start, name, added) VALUES (?, ?, ?, ?, ?)").bind(userId, a.id, Number.isFinite(a.start) ? a.start : null, a.name, Date.now()).run();
      seen.add(a.id);
      if (Number.isFinite(a.start)) since = Math.max(since, a.start);
    }
    await D.prepare("UPDATE fx_garmin SET seen = ?2, since = ?3, ok = 1, said = NULL WHERE user_id = ?1").bind(userId, JSON.stringify([...seen].slice(-SEEN)), since || g.since).run();
    return { ...(await garminOf(env, userId)), more: found.length > MOST };
  } catch (e) {
    if (e instanceof HttpError) throw e;
    return fail("unreachable");
  }
}
// What the app's told: connected or not, how the last ask went, and the files waiting to be read
export async function garminOf(env, userId) {
  const D = await tables(env), g = await D.prepare("SELECT last, ok, said, added FROM fx_garmin WHERE user_id = ?").bind(userId).first();
  if (!g) return { on: false };
  const { results } = await D.prepare("SELECT id, start, name FROM fx_garmin_new WHERE user_id = ? ORDER BY start LIMIT 50").bind(userId).all();
  return { on: true, ok: !!g.ok, said: g.said || null, last: g.last || null, since: g.added, waiting: results };
}
export async function waitingFile(env, userId, id) {
  const D = await tables(env), row = await D.prepare("SELECT id FROM fx_garmin_new WHERE user_id = ? AND id = ?").bind(userId, id).first();
  const obj = row && env.BIO_R2 ? await env.BIO_R2.get(newKey(userId, id)) : null;
  if (!obj) throw new HttpError(404, "That activity isn’t waiting any more.");
  return obj.body;
}
// read by the app (kept as an activity, or found to be one you have, or not one Fitness can read): no longer waiting
export async function done(env, userId, id) {
  const D = await tables(env);
  await D.prepare("DELETE FROM fx_garmin_new WHERE user_id = ? AND id = ?").bind(userId, id).run();
  if (env.BIO_R2) await env.BIO_R2.delete(newKey(userId, id));
}
// The scheduler's turn: the accounts asked about longest ago, a couple at a time (each ask is a few dozen requests)
export async function garminTick(env) {
  const D = await tables(env), t = Date.now();
  const { results } = await D.prepare("SELECT user_id FROM fx_garmin WHERE ok = 1 AND (last IS NULL OR last < ?) ORDER BY last LIMIT 2").bind(t - EVERY).all();
  const out = [];
  for (const r of results) out.push(await fetchNew(env, r.user_id).then((g) => g.waiting?.length || 0, () => -1));
  return { asked: results.length, waiting: out };
}
