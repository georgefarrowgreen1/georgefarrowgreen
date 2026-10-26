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
import { fitdb, MAX_FILE, MAX_STORE } from "./_fitness.js";

const API = "https://personal.connectapi.garmin.com";
const TOKEN = "/personalapitoken-service/personal-api/personal-api-key/token";
const SEARCH = "/activitylist-service/activities/search/activities";
const FILE = (id) => `/download-service/files/activity/${id}`;
export const EVERY = 15 * 60e3;          // how often the scheduler asks for each account
const FIRST = 183;                       // days fetched when first connected: six months
const MOST = 25;                         // files fetched in one go (the rest the next time)
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
    // (each waiting file's size, counted with your activities' against the space there is: a table made before it had none)
    await D.prepare("ALTER TABLE fx_garmin_new ADD COLUMN size INTEGER NOT NULL DEFAULT 0").run().catch(() => {});
    // (your nights, as Garmin has them: fx_well; and when they were last asked for)
    await D.prepare(`CREATE TABLE IF NOT EXISTS fx_well (user_id TEXT NOT NULL, day TEXT NOT NULL, hrv REAL, hrv_lo REAL, hrv_hi REAL, rhr INTEGER, sleep INTEGER, score INTEGER, PRIMARY KEY (user_id, day))`).run();
    await D.prepare("ALTER TABLE fx_garmin ADD COLUMN well_at INTEGER").run().catch(() => {});
    tables.done = true;
  }
  return D;
}

// ---- asking Garmin ----
const garminSaid = (status) => Object.assign(new Error(`Garmin said ${status}`), { status });
// the key swapped for a token: { token, exp }. Garmin answers with the token itself, as text (a JWT, its life in its
// own exp), as Garmin's own client (github.com/garmin/connect-personal-api-python) reads it
async function swap(env, key) {
  const r = await fetch(base(env) + TOKEN, { method: "POST", headers: { Authorization: `ApiKey ${key}`, Accept: "*/*" }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw garminSaid(r.status);
  let token = (await r.text()).trim();
  if (token.startsWith("{")) { try { const j = JSON.parse(token); token = j.access_token || j.accessToken || j.token || ""; } catch (_) { token = ""; } }
  if (!token || /\s/.test(token)) throw garminSaid("no token");
  let exp = NaN;
  try { exp = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).exp * 1000; } catch (_) {}
  return { token, exp: Number.isFinite(exp) ? exp : Date.now() + 23 * 3600e3 };
}
async function get(env, token, path, raw = false) {
  const r = await fetch(base(env) + path, { headers: { Authorization: `Bearer ${token}`, Accept: raw ? "application/zip, application/x-zip-compressed, application/octet-stream" : "application/json" }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw garminSaid(r.status);
  if (!raw) return r.json();
  // (a file no bigger than one Fitness keeps: said so up front, or found so as it's read)
  if (Number(r.headers.get("Content-Length")) > MAX_FILE) { r.body?.cancel(); throw garminSaid("too big"); }
  const u8 = new Uint8Array(await r.arrayBuffer());
  if (u8.length > MAX_FILE) throw garminSaid("too big");
  return u8;
}
// a time as Garmin writes it ("2026-10-25 08:12:03", in GMT, or milliseconds)
const when = (v) => (typeof v === "number" ? v : typeof v === "string" ? Date.parse(v.replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? "" : "Z")) : NaN);
const ymd = (t) => new Date(t).toISOString().slice(0, 10);

// ---- connecting, and not ----
// Your key: tried at once (a key Garmin won't take isn't kept), then kept, locked, and the last six months fetched
export async function connect(env, userId, rawKey) {
  const key = String(rawKey || "").trim();
  if (!/^[\x21-\x7e]{16,2048}$/.test(key)) throw new HttpError(400, "That doesn’t look like a Personal API key. Copy it again from Garmin Connect.", "key");
  const D = await tables(env);
  await limit(env, `fxgarmin:${userId}`, 20, 3600e3);
  let t;
  try { t = await swap(env, key); }
  catch (e) {
    if (e.status === 401 || e.status === 403 || e.status === 400) throw new HttpError(400, "Garmin didn’t take that key. Check it’s the whole key, and that it hasn’t been deleted or expired.", "key");
    // (what Garmin said, or why it didn't answer, in the words shown: a 502 of our own is taken over by Cloudflare's)
    console.error("garmin token", e.status, e.message);
    throw new HttpError(424, `Garmin Connect didn’t answer (${e.status || e.name || "no answer"}). Try again in a moment.`);
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
  await D.batch([D.prepare("DELETE FROM fx_garmin WHERE user_id = ?").bind(userId), D.prepare("DELETE FROM fx_garmin_new WHERE user_id = ?").bind(userId), D.prepare("DELETE FROM fx_well WHERE user_id = ?").bind(userId)]);
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
    for (let start = 0; start < 1000; start += 100) {
      const page = await get(env, token, `${SEARCH}?start=${start}&limit=100&startDate=${from}&endDate=${ymd(now + 86400e3)}`);
      const list = Array.isArray(page) ? page : page?.activities || page?.activityList || page?.results || [];
      for (const a of list) {
        const id = String(a.activityId ?? a.id ?? "");
        if (/^\d{1,20}$/.test(id) && !seen.has(id) && !waiting.has(id)) found.push({ id, start: when(a.startTimeGMT ?? a.beginTimestamp ?? a.startTimeLocal), name: String(a.activityName || "").slice(0, 80) || null });
      }
      if (list.length < 100) break;
    }
    // oldest first, so a long gap fills in order; a few at a time
    found.sort((a, b) => (a.start || 0) - (b.start || 0));
    let since = g.since || 0;
    // (the space you've used: your activities, and the files waiting)
    const used = await D.prepare("SELECT (SELECT COALESCE(SUM(size), 0) FROM fx_acts WHERE user_id = ?1) + (SELECT COALESCE(SUM(size), 0) FROM fx_garmin_new WHERE user_id = ?1) AS b").bind(userId).first();
    let room = MAX_STORE - (used?.b || 0);
    for (const a of found.slice(0, MOST)) {
      let bytes;
      try { bytes = await get(env, token, FILE(a.id), true); }
      // (one with no file, a manual entry; or too big to keep: passed over)
      catch (e) { if (e.status === 404 || e.status === "too big") { seen.add(a.id); continue; } throw e; }
      if (bytes.length > room) return fail("full");
      room -= bytes.length;
      if (!env.BIO_R2) throw new HttpError(503, "Not set up.");
      await env.BIO_R2.put(newKey(userId, a.id), bytes, { httpMetadata: { contentType: "application/octet-stream" } });
      await D.prepare("INSERT OR IGNORE INTO fx_garmin_new (user_id, id, start, name, added, size) VALUES (?, ?, ?, ?, ?, ?)").bind(userId, a.id, Number.isFinite(a.start) ? a.start : null, a.name, Date.now(), bytes.length).run();
      seen.add(a.id);
      if (Number.isFinite(a.start)) since = Math.max(since, a.start);
    }
    await D.prepare("UPDATE fx_garmin SET seen = ?2, since = ?3, ok = 1, said = NULL WHERE user_id = ?1").bind(userId, JSON.stringify([...seen].slice(-SEEN)), since || g.since).run();
    // (and your nights: every few hours, the last few days; two months the first time)
    if (!g.well_at || now - g.well_at > WELL_EVERY) await wellness(env, D, userId, token, g.well_at ? now - 4 * 86400e3 : now - 60 * 86400e3, now).catch((e) => console.error("garmin well", e.status, e.message));
    return { ...(await garminOf(env, userId)), more: found.length > MOST };
  } catch (e) {
    if (e instanceof HttpError) throw e;
    return fail("unreachable");
  }
}
// ---- your nights: heart rate variability, resting heart rate, sleep ----
// Garmin's daily summaries (as its own client asks for them), read for what's needed and nothing else: each day's
// overnight HRV and its usual range, resting heart rate, how long you slept and its score. Garmin's answers are read
// for the fields by name wherever they sit, so a reshuffle of its JSON doesn't lose them; a day with none, left out.
const WELL_EVERY = 3 * 3600e3;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// (the first number under any of these names, looked for a few levels down; "a.b" a name inside a name)
function pick(o, names, depth = 3) {
  if (!o || typeof o !== "object" || depth < 0) return null;
  for (const n of names) {
    const v = n.split(".").reduce((x, k) => (x && typeof x === "object" ? x[k] : undefined), o);
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  for (const v of Object.values(o)) if (v && typeof v === "object" && !Array.isArray(v)) { const got = pick(v, names, depth - 1); if (got != null) return got; }
  return null;
}
// (every object in the answer that's for a day)
function daysIn(j, out = [], depth = 6) {
  if (!j || typeof j !== "object" || depth < 0) return out;
  if (Array.isArray(j)) { for (const x of j) daysIn(x, out, depth - 1); return out; }
  const day = [j.calendarDate, j.date, j.summaryDate].find((v) => typeof v === "string" && DATE.test(v.slice(0, 10)));
  if (day) out.push([day.slice(0, 10), j]);
  for (const v of Object.values(j)) if (v && typeof v === "object") daysIn(v, out, depth - 1);
  return out;
}
export function wellFrom({ hrv, sleep, daily }) {
  const by = new Map(), at = (d) => { if (!by.has(d)) by.set(d, {}); return by.get(d); };
  const put = (row, k, v, lo, hi) => { if (v != null && v >= lo && v <= hi && row[k] == null) row[k] = Math.round(v * 10) / 10; };
  for (const [d, o] of daysIn(hrv)) { const r = at(d); put(r, "hrv", pick(o, ["lastNightAvg", "lastNightAvgHrv", "hrvValue", "avgOvernightHrv"]), 5, 300); put(r, "hrv_lo", pick(o, ["baseline.balancedLow", "balancedLow", "baselineLowUpper", "baseline.lowUpper"]), 5, 300); put(r, "hrv_hi", pick(o, ["baseline.balancedUpper", "balancedUpper"]), 5, 300); }
  for (const [d, o] of daysIn(sleep)) { const r = at(d); put(r, "sleep", pick(o, ["sleepTimeSeconds", "totalSleepTimeSeconds", "sleepTimeInSeconds", "totalSleepSeconds"]), 600, 86400); put(r, "score", pick(o, ["sleepScores.overall.value", "overallSleepScore.value", "overallSleepScore", "sleepScore.value", "sleepScore", "overallScore"]), 0, 100); }
  for (const [d, o] of daysIn(daily)) { const r = at(d); put(r, "rhr", pick(o, ["restingHeartRate", "restingHeartRateValue", "restingHr", "currentDayRestingHeartRate"]), 25, 130); }
  return [...by].filter(([, r]) => Object.keys(r).length).map(([day, r]) => ({ day, ...r }));
}
async function wellness(env, D, userId, token, from, to) {
  const got = { hrv: [], sleep: [], daily: [] };
  // (four weeks at a time, as Garmin's ranges are short)
  for (let a = from; a < to; a += 28 * 86400e3) {
    const s = ymd(a), e = ymd(Math.min(to, a + 27 * 86400e3)), ask = (path) => get(env, token, path).catch(() => null);
    const [h, sl, dl] = await Promise.all([ask(`/hrv-service/hrv/daily/${s}/${e}`), ask(`/sleep-service/sleep/dailySleepSummariesByDate?startDate=${s}&endDate=${e}`), ask(`/usersummary-service/v2/dailysummaries?startDate=${s}&endDate=${e}`)]);
    got.hrv.push(h); got.sleep.push(sl); got.daily.push(dl);
  }
  const rows = wellFrom(got);
  if (rows.length) await D.batch(rows.map((r) => D.prepare(`INSERT INTO fx_well (user_id, day, hrv, hrv_lo, hrv_hi, rhr, sleep, score) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
    ON CONFLICT(user_id, day) DO UPDATE SET hrv = COALESCE(?3, hrv), hrv_lo = COALESCE(?4, hrv_lo), hrv_hi = COALESCE(?5, hrv_hi), rhr = COALESCE(?6, rhr), sleep = COALESCE(?7, sleep), score = COALESCE(?8, score)`)
    .bind(userId, r.day, r.hrv ?? null, r.hrv_lo ?? null, r.hrv_hi ?? null, r.rhr ?? null, r.sleep ?? null, r.score ?? null)));
  await D.prepare("UPDATE fx_garmin SET well_at = ?2 WHERE user_id = ?1").bind(userId, Date.now()).run();
  await D.prepare("DELETE FROM fx_well WHERE user_id = ? AND day < ?").bind(userId, ymd(Date.now() - 120 * 86400e3)).run();
}
// What the app's told: connected or not, how the last ask went, and the files waiting to be read
export async function garminOf(env, userId) {
  const D = await tables(env), g = await D.prepare("SELECT last, ok, said, added FROM fx_garmin WHERE user_id = ?").bind(userId).first();
  if (!g) return { on: false };
  const { results } = await D.prepare("SELECT id, start, name FROM fx_garmin_new WHERE user_id = ? ORDER BY start LIMIT 50").bind(userId).all();
  // (and the last two months of your nights)
  const well = (await D.prepare("SELECT day, hrv, hrv_lo, hrv_hi, rhr, sleep, score FROM fx_well WHERE user_id = ? AND day >= ? ORDER BY day").bind(userId, ymd(Date.now() - 60 * 86400e3)).all()).results
    .map((r) => Object.fromEntries(Object.entries(r).filter(([, v]) => v != null)));
  return { on: true, ok: !!g.ok, said: g.said || null, last: g.last || null, since: g.added, waiting: results, well };
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
