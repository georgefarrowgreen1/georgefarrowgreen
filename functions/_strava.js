// Fitness and Strava, by Strava's own sign-in (OAuth): you're sent to Strava, say yes there, and come back connected.
// Strava keeps no files to hand out, only each activity's figures second by second (its streams), so each new one's
// written here as a TCX file (Garmin's Training Center format, which every tool reads) and waits, as Garmin's do
// (functions/_garmin.js), until the app reads it, as it reads any file you upload, and keeps it (with the id
// s<Strava's id>). Strava says when there's a new one (its webhook, below), so it's fetched then, not asked for over and
// over: Strava's limits are for the whole app (200 asks each quarter hour, 2,000 a day), not each person.
//
// What's kept (fx_strava): your Strava athlete's id; its tokens (six hours' access, and the refresh for the next),
// locked as the site locks its secrets (functions/_atrest.js, bound to the account) and never sent to the page; the
// newest start fetched, those already fetched, and how the last ask went. Disconnected (here, or on Strava, which tells
// us): the tokens and the files still waiting go; the activities already in Fitness are yours, and stay.
//
// Set up (the site's Cloudflare settings): STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET, from strava.com/settings/api,
// whose Authorization Callback Domain is fitness.georgefarrowgreen.com. STRAVA_API stands in for Strava in tests.
import { HttpError, limit, hex, sha256, serverSecret } from "./_pigeon.js";
import { lockVault, openVault } from "./_atrest.js";
import { fitdb, MAX_STORE } from "./_fitness.js";

const SITE = "https://www.strava.com";
const base = (env) => (env.STRAVA_API || SITE).replace(/\/$/, "");
export const stravaOn = (env) => !!(env.STRAVA_CLIENT_ID && env.STRAVA_CLIENT_SECRET);
const FIRST = 183;                 // days fetched when first connected: six months
const MOST = 10;                   // activities fetched in one go (each its own ask): the rest the next time
const SEEN = 600;                  // activities remembered as fetched
const EVERY = 6 * 3600e3;          // asked anyway, now and then, should Strava's word of a new one go astray
export const sNewKey = (userId, id) => `fitness/${userId}/strava/${id}`;
const owner = (userId) => "fitness/strava|" + userId;
const SCOPE = "read,activity:read_all";

async function tables(env) {
  const D = await fitdb(env);
  if (!tables.done) {
    await D.batch([
      D.prepare(`CREATE TABLE IF NOT EXISTS fx_strava (user_id TEXT PRIMARY KEY, athlete INTEGER NOT NULL, access TEXT NOT NULL, refresh TEXT NOT NULL, exp INTEGER NOT NULL,
        since INTEGER, seen TEXT, last INTEGER, due INTEGER NOT NULL DEFAULT 0, back INTEGER NOT NULL DEFAULT 0, back_at INTEGER, ok INTEGER NOT NULL DEFAULT 1, said TEXT, added INTEGER NOT NULL)`),
      D.prepare("CREATE UNIQUE INDEX IF NOT EXISTS fx_strava_athlete ON fx_strava (athlete)"),
      D.prepare("CREATE INDEX IF NOT EXISTS fx_strava_due ON fx_strava (ok, due, last)"),
      D.prepare(`CREATE TABLE IF NOT EXISTS fx_strava_new (user_id TEXT NOT NULL, id TEXT NOT NULL, start INTEGER, name TEXT, sport TEXT, indoor INTEGER NOT NULL DEFAULT 0,
        device TEXT, size INTEGER NOT NULL DEFAULT 0, added INTEGER NOT NULL, PRIMARY KEY (user_id, id))`),
    ]);
    // (whose Strava it is, by name, so the app can say)
    await D.prepare("ALTER TABLE fx_strava ADD COLUMN name TEXT").run().catch(() => {});
    tables.done = true;
  }
  return D;
}

// ---- the way in: to Strava's page, and back, the state signed so the answer's only taken for the one who asked ----
async function hmacKey(env) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode("fitness-strava|" + (await serverSecret(env))), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}
const sign = async (env, text) => hex(new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(env), new TextEncoder().encode(text))));
// Strava's page to say yes on → { url }
export async function connectUrl(env, userId, origin) {
  if (!stravaOn(env)) throw new HttpError(503, "Strava isn’t set up here yet.");
  await limit(env, `fxstravago:${userId}`, 30, 3600e3);
  const exp = Date.now() + 15 * 60e3, state = `${exp}.${(await sign(env, `${userId}|${exp}`)).slice(0, 32)}`;
  const q = new URLSearchParams({ client_id: env.STRAVA_CLIENT_ID, response_type: "code", redirect_uri: `${origin}/api/fitness/strava/back`, approval_prompt: "force", scope: SCOPE, state });
  return { url: `${base(env)}/oauth/authorize?${q}` };
}
// Strava's token endpoint: a code (once), or the refresh (each six hours) → { access_token, refresh_token, expires_at, athlete }
async function tokenFrom(env, params) {
  const r = await fetch(`${base(env)}/oauth/token`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: env.STRAVA_CLIENT_ID, client_secret: env.STRAVA_CLIENT_SECRET, ...params }), signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw Object.assign(new Error(`Strava said ${r.status}`), { status: r.status });
  return r.json();
}
// Back from Strava's page: the code swapped for tokens, and kept → where the app opens ("on", "no" or "error")
export async function connectBack(env, userId, q) {
  if (!stravaOn(env)) return "error";
  const [exp, sig] = String(q.get("state") || "").split(".");
  if (!(Number(exp) > Date.now()) || !sig || sig !== (await sign(env, `${userId}|${exp}`)).slice(0, 32)) return "error";
  if (q.get("error")) return "no";
  // (activities, private ones too, or nothing of use: said so)
  const scope = String(q.get("scope") || "");
  if (!/activity:read(_all)?/.test(scope)) return "no";
  let t;
  try { t = await tokenFrom(env, { code: String(q.get("code") || "").slice(0, 200), grant_type: "authorization_code" }); } catch (_) { return "error"; }
  const athlete = Number(t.athlete?.id);
  if (!t.access_token || !t.refresh_token || !Number.isFinite(athlete)) return "error";
  const D = await tables(env), now = Date.now();
  // (one Strava athlete, one Fitness account: already another's, refused, not moved; its rides are that account's.
  // Strava's told to forget this ask, so nothing's left connected for it)
  if (await D.prepare("SELECT user_id FROM fx_strava WHERE athlete = ? AND user_id != ?").bind(athlete, userId).first()) {
    await fetch(`${base(env)}/oauth/deauthorize`, { method: "POST", headers: { Authorization: `Bearer ${t.access_token}` }, signal: AbortSignal.timeout(15000) }).catch(() => {});
    return "taken";
  }
  const name = [t.athlete?.firstname, t.athlete?.lastname].filter((x) => typeof x === "string" && x.trim()).join(" ").slice(0, 80) || null;
  await D.prepare(`INSERT INTO fx_strava (user_id, athlete, access, refresh, exp, since, seen, last, due, back, ok, said, added, name) VALUES (?1, ?2, ?3, ?4, ?5, ?6, '[]', NULL, 1, 0, 1, NULL, ?7, ?8)
    ON CONFLICT(user_id) DO UPDATE SET athlete = ?2, access = ?3, refresh = ?4, exp = ?5, ok = 1, said = NULL, due = 1, name = ?8`)
    .bind(userId, athlete, await lockVault(env, owner(userId), t.access_token), await lockVault(env, owner(userId), t.refresh_token), Number(t.expires_at) * 1000, now - FIRST * 86400e3, now, name).run();
  await ensureHook(env).catch((e) => console.error("strava hook", e.message));
  return "on";
}
// the tokens, fresh: refreshed where they're about to run out → the access token
async function accessFor(env, D, g) {
  if (g.exp > Date.now() + 5 * 60e3) return openVault(env, owner(g.user_id), g.access);
  const t = await tokenFrom(env, { grant_type: "refresh_token", refresh_token: await openVault(env, owner(g.user_id), g.refresh) });
  if (!t.access_token) throw Object.assign(new Error("no token"), { status: 401 });
  await D.prepare("UPDATE fx_strava SET access = ?2, refresh = ?3, exp = ?4 WHERE user_id = ?1")
    .bind(g.user_id, await lockVault(env, owner(g.user_id), t.access_token), await lockVault(env, owner(g.user_id), t.refresh_token || (await openVault(env, owner(g.user_id), g.refresh))), Number(t.expires_at) * 1000).run();
  return t.access_token;
}
async function get(env, token, path) {
  const r = await fetch(`${base(env)}/api/v3${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw Object.assign(new Error(`Strava said ${r.status}`), { status: r.status });
  return r.json();
}

// ---- an activity as a file: Strava's streams, written as TCX ----
const RIDE = /^(Ride|VirtualRide|MountainBikeRide|GravelRide|EBikeRide|EMountainBikeRide|Velomobile|Handcycle)$/, RUN = /^(Run|TrailRun|VirtualRun)$/;
export const sportOf = (a) => { const t = String(a.sport_type || a.type || ""); return RIDE.test(t) ? "ride" : RUN.test(t) ? "run" : /Swim/.test(t) ? "swim" : /^(Walk|Hike)$/.test(t) ? "walk" : /WeightTraining|Workout|Crossfit/.test(t) ? "strength" : "other"; };
const esc = (s) => String(s).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]);
const iso = (ms) => new Date(Math.round(ms / 1000) * 1000).toISOString().replace(".000Z", "Z");
// (a: Strava's activity; st: its streams, by type (key_by_type), each { data: [...] }) → the TCX, as text
export function tcxOf(a, st) {
  const t0 = Date.parse(a.start_date), time = st.time?.data || [], n = time.length, d = (k) => st[k]?.data || [];
  const ll = d("latlng"), alt = d("altitude"), dist = d("distance"), hr = d("heartrate"), cad = d("cadence"), w = d("watts"), v = d("velocity_smooth");
  const num = (x, f) => (typeof x === "number" && Number.isFinite(x) ? (f == null ? Math.round(x) : x.toFixed(f)) : null);
  const sport = sportOf(a), pts = [];
  for (let i = 0; i < n; i++) {
    const lat = Array.isArray(ll[i]) ? num(ll[i][0], 7) : null, lon = Array.isArray(ll[i]) ? num(ll[i][1], 7) : null;
    const ext = [num(v[i], 3) != null && `<ns3:Speed>${num(v[i], 3)}</ns3:Speed>`, num(w[i]) != null && `<ns3:Watts>${num(w[i])}</ns3:Watts>`].filter(Boolean).join("");
    pts.push(`<Trackpoint><Time>${iso(t0 + time[i] * 1000)}</Time>` + (lat != null && lon != null ? `<Position><LatitudeDegrees>${lat}</LatitudeDegrees><LongitudeDegrees>${lon}</LongitudeDegrees></Position>` : "")
      + (num(alt[i], 1) != null ? `<AltitudeMeters>${num(alt[i], 1)}</AltitudeMeters>` : "") + (num(dist[i], 1) != null ? `<DistanceMeters>${num(dist[i], 1)}</DistanceMeters>` : "")
      + (num(hr[i]) != null ? `<HeartRateBpm><Value>${num(hr[i])}</Value></HeartRateBpm>` : "") + (num(cad[i]) != null && sport === "ride" ? `<Cadence>${num(cad[i])}</Cadence>` : "")
      + (ext ? `<Extensions><ns3:TPX>${ext}</ns3:TPX></Extensions>` : "") + `</Trackpoint>`);
  }
  const secs = n ? time[n - 1] : Number(a.elapsed_time) || 0, km = num(dist[n - 1], 1) ?? num(a.distance, 1) ?? "0.0";
  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
 <Activities>
  <Activity Sport="${sport === "ride" ? "Biking" : sport === "run" ? "Running" : "Other"}">
   <Id>${iso(t0)}</Id>
   <Lap StartTime="${iso(t0)}"><TotalTimeSeconds>${Number(secs).toFixed(1)}</TotalTimeSeconds><DistanceMeters>${km}</DistanceMeters><Calories>0</Calories><Intensity>Active</Intensity><TriggerMethod>Manual</TriggerMethod>
    <Track>
${pts.join("\n")}
    </Track>
   </Lap>
   <Creator xsi:type="Device_t" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Name>${esc(String(a.device_name || "Strava").slice(0, 60))}</Name><UnitId>0</UnitId><ProductID>0</ProductID></Creator>
  </Activity>
 </Activities>
</TrainingCenterDatabase>
`;
}
const gzip = async (text) => new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());

// ---- asking Strava what's new: as the app opens, as Strava says there's one, and now and then ----
export async function fetchStrava(env, userId, { force = false } = {}) {
  const D = await tables(env), g = await D.prepare("SELECT * FROM fx_strava WHERE user_id = ?").bind(userId).first();
  if (!g) return stravaOf(env, userId);
  const now = Date.now();
  if (!force && !g.due && g.last && now - g.last < 15 * 60e3) return stravaOf(env, userId);
  // (claimed first, so the scheduler and the app don't both ask at once)
  const claim = await D.prepare("UPDATE fx_strava SET last = ?2, due = 0 WHERE user_id = ?1 AND (last IS NULL OR last = ?3)").bind(userId, now, g.last ?? null).run();
  if (!claim.meta?.changes) return stravaOf(env, userId);
  const fail = async (said, ok = 1) => { await D.prepare("UPDATE fx_strava SET ok = ?2, said = ?3 WHERE user_id = ?1").bind(userId, ok, said).run(); return stravaOf(env, userId); };
  try {
    let token;
    try { token = await accessFor(env, D, g); } catch (e) { return e.status === 400 || e.status === 401 ? fail("revoked", 0) : fail("unreachable"); }
    const seen = new Set(JSON.parse(g.seen || "[]")), waiting = new Set((await D.prepare("SELECT id FROM fx_strava_new WHERE user_id = ?").bind(userId).all()).results.map((r) => r.id));
    for (const r of (await D.prepare("SELECT id FROM fx_acts WHERE user_id = ? AND id LIKE 's%'").bind(userId).all()).results) seen.add(r.id.slice(1));
    const fresh = (xs) => xs.filter((a) => /^\d{1,20}$/.test(String(a.id)) && !a.manual && !seen.has(String(a.id)) && !waiting.has(String(a.id)));
    let found = [], back = !!g.back, backAt = g.back_at || now, pageEnd = null;
    if (back) {
      // (all your history: back from where it's got to, a page at a time, till there's none older)
      const xs = await get(env, token, `/athlete/activities?before=${Math.floor(backAt / 1000)}&per_page=30`);
      if (!xs.length) back = false;
      else pageEnd = Math.min(...xs.map((a) => Date.parse(a.start_date)).filter(Number.isFinite));
      found = fresh(xs);
    } else {
      for (let page = 1; page <= 3; page++) {
        const xs = await get(env, token, `/athlete/activities?after=${Math.floor(((g.since || now - FIRST * 86400e3) - 86400e3) / 1000)}&per_page=50&page=${page}`);
        found.push(...fresh(xs));
        if (xs.length < 50) break;
      }
    }
    // a few at a time (each is its own ask), the rest next time: oldest first, so what's new fills in in order; going
    // back, newest first, so where it's got to moves back only past those fetched
    found.sort((a, b) => (back ? -1 : 1) * (Date.parse(a.start_date) - Date.parse(b.start_date)));
    const used = await D.prepare("SELECT (SELECT COALESCE(SUM(size), 0) FROM fx_acts WHERE user_id = ?1) + (SELECT COALESCE(SUM(size), 0) FROM fx_strava_new WHERE user_id = ?1) AS b").bind(userId).first();
    let room = MAX_STORE - (used?.b || 0), since = g.since || 0;
    for (const a of found.slice(0, MOST)) {
      const id = String(a.id), start = Date.parse(a.start_date);
      let st;
      try { st = await get(env, token, `/activities/${id}/streams?keys=time,latlng,altitude,distance,heartrate,cadence,watts,velocity_smooth&key_by_type=true`); }
      catch (e) { if (e.status === 404) { seen.add(id); continue; } throw e; }
      if (!st?.time?.data?.length) { seen.add(id); continue; }   // (nothing recorded: an entry made by hand)
      const bytes = await gzip(tcxOf(a, st));
      if (bytes.length > room) return fail("full");
      room -= bytes.length;
      if (!env.BIO_R2) throw new HttpError(503, "Not set up.");
      await env.BIO_R2.put(sNewKey(userId, id), bytes, { httpMetadata: { contentType: "application/octet-stream" } });
      await D.prepare("INSERT OR IGNORE INTO fx_strava_new (user_id, id, start, name, sport, indoor, device, size, added) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(userId, id, Number.isFinite(start) ? start : null, String(a.name || "").slice(0, 80) || null, sportOf(a), a.trainer || /^Virtual/.test(String(a.sport_type || "")) ? 1 : 0, String(a.device_name || "").slice(0, 60) || null, bytes.length, Date.now()).run();
      seen.add(id);
      if (!back && Number.isFinite(start)) since = Math.max(since, start);
      if (back && Number.isFinite(start)) backAt = Math.min(backAt, start);
    }
    const more = found.length > MOST;
    // (going back, the whole page done: on past its oldest, those already here too)
    if (back && !more && pageEnd != null) backAt = Math.min(backAt, pageEnd);
    await D.prepare("UPDATE fx_strava SET seen = ?2, since = ?3, ok = 1, said = NULL, back = ?4, back_at = ?5, due = ?6 WHERE user_id = ?1")
      .bind(userId, JSON.stringify([...seen].slice(-SEEN)), since || g.since, back ? 1 : 0, back ? backAt : null, more ? 1 : 0).run();
    return { ...(await stravaOf(env, userId)), more: more || back };
  } catch (e) {
    if (e instanceof HttpError) throw e;
    if (e.status === 429) return fail("busy");
    if (e.status === 401) return fail("revoked", 0);
    return fail("unreachable");
  }
}
// all your history: walked back from now, a page at a time, as the app asks and the scheduler's turns meanwhile
export async function stravaAll(env, userId) {
  const D = await tables(env);
  await limit(env, `fxstravaall:${userId}`, 10, 3600e3);
  const r = await D.prepare("UPDATE fx_strava SET back = 1, back_at = ?2, due = 1, last = NULL WHERE user_id = ?1").bind(userId, Date.now()).run();
  if (!r.meta?.changes) throw new HttpError(404, "Strava isn’t connected.");
  return fetchStrava(env, userId, { force: true });
}
// what the app's told: connected or not, how the last ask went, the files waiting
export async function stravaOf(env, userId) {
  if (!stravaOn(env)) return { on: false, ready: false };
  const D = await tables(env), g = await D.prepare("SELECT last, ok, said, added, back, back_at, name FROM fx_strava WHERE user_id = ?").bind(userId).first();
  if (!g) return { on: false, ready: true };
  const { results } = await D.prepare("SELECT id, start, name, sport, indoor, device FROM fx_strava_new WHERE user_id = ? ORDER BY start LIMIT 50").bind(userId).all();
  return { on: true, ready: true, name: g.name || null, ok: !!g.ok, said: g.said || null, last: g.last || null, since: g.added, waiting: results.map((w) => ({ ...w, indoor: !!w.indoor })), ...(g.back ? { back: true, backAt: g.back_at } : {}) };
}
export async function sWaitingFile(env, userId, id) {
  const D = await tables(env), row = await D.prepare("SELECT id FROM fx_strava_new WHERE user_id = ? AND id = ?").bind(userId, id).first();
  const obj = row && env.BIO_R2 ? await env.BIO_R2.get(sNewKey(userId, id)) : null;
  if (!obj) throw new HttpError(404, "That activity isn’t waiting any more.");
  return obj.body;
}
export async function sDone(env, userId, id) {
  const D = await tables(env);
  await D.prepare("DELETE FROM fx_strava_new WHERE user_id = ? AND id = ?").bind(userId, id).run();
  if (env.BIO_R2) await env.BIO_R2.delete(sNewKey(userId, id));
}
// Gone: the tokens and the files still waiting (Strava told too, where it's asked here)
export async function forget(env, userId) {
  const D = await tables(env), { results } = await D.prepare("SELECT id FROM fx_strava_new WHERE user_id = ?").bind(userId).all();
  if (env.BIO_R2 && results.length) await env.BIO_R2.delete(results.map((r) => sNewKey(userId, r.id)));
  await D.batch([D.prepare("DELETE FROM fx_strava WHERE user_id = ?").bind(userId), D.prepare("DELETE FROM fx_strava_new WHERE user_id = ?").bind(userId)]);
}
export async function disconnectStrava(env, userId) {
  const D = await tables(env), g = await D.prepare("SELECT * FROM fx_strava WHERE user_id = ?").bind(userId).first();
  if (g) {
    try {
      const token = await accessFor(env, D, g);
      await fetch(`${base(env)}/oauth/deauthorize`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
    } catch (_) { /* gone here anyway */ }
  }
  await forget(env, userId);
}

// ---- Strava's word: a new activity, a new name, or you've disconnected Fitness on Strava ----
// One subscription for the whole app, made the first time someone connects; Strava checks it's ours by a challenge,
// with a token only we and it know (the hook's verify token: a hash of the client secret)
const verifyToken = async (env) => hex(await sha256("fitness-strava-hook|" + env.STRAVA_CLIENT_SECRET)).slice(0, 32);
const hookUrl = (env) => `https://${(env.FITNESS_HOST || "fitness.georgefarrowgreen.com").split(",")[0]}/api/fitness/strava/hook`;
async function ensureHook(env) {
  const D = await fitdb(env);
  if ((await D.prepare("SELECT v FROM fx_meta WHERE k = 'strava_hook'").first())?.v) return;
  const auth = new URLSearchParams({ client_id: env.STRAVA_CLIENT_ID, client_secret: env.STRAVA_CLIENT_SECRET });
  // (one there already, made before: taken up; else made)
  const have = await fetch(`${base(env)}/api/v3/push_subscriptions?${auth}`, { signal: AbortSignal.timeout(15000) }).then((r) => (r.ok ? r.json() : []), () => []);
  let id = Array.isArray(have) && have[0]?.id;
  if (!id) {
    const r = await fetch(`${base(env)}/api/v3/push_subscriptions`, { method: "POST", body: new URLSearchParams({ client_id: env.STRAVA_CLIENT_ID, client_secret: env.STRAVA_CLIENT_SECRET, callback_url: hookUrl(env), verify_token: await verifyToken(env) }), signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`Strava said ${r.status} to the webhook`);
    id = (await r.json()).id;
  }
  if (id) await D.prepare("INSERT OR REPLACE INTO fx_meta (k, v) VALUES ('strava_hook', ?)").bind(String(id)).run();
}
// (Strava's check, as the subscription's made: its challenge, echoed, where the token's ours)
export async function hookCheck(env, q) {
  if (!stravaOn(env) || q.get("hub.mode") !== "subscribe" || q.get("hub.verify_token") !== (await verifyToken(env))) throw new HttpError(403, "No.");
  return { "hub.challenge": String(q.get("hub.challenge") || "").slice(0, 200) };
}
// (an event: only from our own subscription; whose it is, by the athlete)
export async function hookEvent(env, e) {
  if (!stravaOn(env) || !e || typeof e !== "object") return;
  const D = await tables(env), sub = (await D.prepare("SELECT v FROM fx_meta WHERE k = 'strava_hook'").first())?.v;
  if (!sub || String(e.subscription_id) !== sub) return;
  const g = await D.prepare("SELECT user_id FROM fx_strava WHERE athlete = ?").bind(Number(e.owner_id)).first();
  if (!g) return;
  if (e.object_type === "athlete" && String(e.updates?.authorized) === "false") return forget(env, g.user_id);
  if (e.object_type !== "activity" || !/^\d{1,20}$/.test(String(e.object_id))) return;
  if (e.aspect_type === "create") await D.prepare("UPDATE fx_strava SET due = 1 WHERE user_id = ?").bind(g.user_id).run();
  // (renamed on Strava: renamed here, where it's in already and still has Strava's name)
  if (e.aspect_type === "update" && typeof e.updates?.title === "string") {
    const name = e.updates.title.trim().slice(0, 80);
    if (name) { await D.prepare("UPDATE fx_acts SET name = ?, changed = ? WHERE user_id = ? AND id = ?").bind(name, Date.now(), g.user_id, `s${e.object_id}`).run(); await D.prepare("UPDATE fx_strava_new SET name = ? WHERE user_id = ? AND id = ?").bind(name, g.user_id, String(e.object_id)).run(); }
  }
}
// The scheduler's turn: those Strava's said have something new, or not asked for a while, a couple at a time
export async function stravaTick(env) {
  if (!stravaOn(env)) return { asked: 0 };
  const D = await tables(env), t = Date.now();
  const { results } = await D.prepare("SELECT user_id FROM fx_strava WHERE ok = 1 AND (due = 1 OR last IS NULL OR last < ?) ORDER BY due DESC, last LIMIT 2").bind(t - EVERY).all();
  for (const r of results) await fetchStrava(env, r.user_id).catch(() => null);
  return { asked: results.length };
}
