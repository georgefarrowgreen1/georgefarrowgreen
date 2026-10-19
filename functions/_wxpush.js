// Weather's notifications: a heads-up when rain is about to start, and a
// morning briefing, for one place per phone. Sent with InFlight's Web Push
// (functions/_notify.js: encrypted to the phone, so the push service sees
// nothing of what it says) and worded by the app's own code (weather/alerts.js),
// so a notification says what the app would.
//
// A tick (.github/workflows/weather-tick.yml, every 10 minutes) looks at each
// place that needs it: rain alerts outside the quiet hours (22:00 to 07:00 there),
// briefings around their time. For rain it asks only for the next few hours'
// rain (one small request for every place at once); the whole forecast only
// where a briefing is due. Places are kept to two decimal places (about a
// kilometre) and forgotten when notifications are turned off, the phone
// unsubscribes, its push service says it's gone or keeps failing, or nothing's
// been heard of it for four months.
//
// Turning them on sends a first notification ("Notifications on"), and the phone
// is only kept if that arrives: so only a real phone can take one of the places.
// Each notification is claimed before it's sent (so a tick that runs over, or
// two at once, can't send it twice) and given back if it doesn't go.
//
// WXAPP_URL: tests only (a stand-in for Open-Meteo).

import { pushEndpointOk, pushToSub, vapid } from "./_notify.js";
import { HttpError, fromB64url } from "./_pigeon.js";
import { shapeForecast, forecastQuery, rainQuery } from "../weather/data.js";
import { makeFormat, nowWall, keyOf } from "../weather/format.js";
import { rainAlert, briefDue, briefing, isQuiet } from "../weather/alerts.js";

const MAX_SUBS = 300, PER_TICK = 200, MAX_FAILS = 5, KEEP_IDLE = 120 * 864e5, OBS_DAYS = 46, LEASE = 8 * 60e3;
let ready = null;
export async function wxdb(env) {
  if (!env.DB) throw new HttpError(503, "Not set up.");
  if (!ready) ready = (async () => {
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS wx_subs (id TEXT PRIMARY KEY, endpoint TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
        lat REAL NOT NULL, lon REAL NOT NULL, name TEXT, rain INTEGER NOT NULL DEFAULT 0, brief INTEGER NOT NULL DEFAULT 0, brief_at TEXT,
        units TEXT, tz_off INTEGER, last_rain INTEGER, last_brief TEXT, created INTEGER, updated INTEGER, fails INTEGER NOT NULL DEFAULT 0, last_ok INTEGER)`),
      env.DB.prepare("CREATE TABLE IF NOT EXISTS wx_obs (station TEXT NOT NULL, day TEXT NOT NULL, tmax REAL, tmin REAL, n INTEGER, PRIMARY KEY (station, day))"),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS wx_obs_day ON wx_obs (day)"),
      env.DB.prepare("CREATE TABLE IF NOT EXISTS wx_meta (k TEXT PRIMARY KEY, v TEXT)"),
    ]);
    // columns added since the table was first made (an older table gains them and keeps its rows)
    for (const col of ["fails INTEGER NOT NULL DEFAULT 0", "last_ok INTEGER"]) await env.DB.prepare(`ALTER TABLE wx_subs ADD COLUMN ${col}`).run().catch(() => {});
  })().catch((e) => { ready = null; throw e; });
  await ready;
  return env.DB;
}
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const idOf = async (endpoint) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint))).slice(0, 32);
const r2 = (v) => Math.round(v * 100) / 100;
const B64U = /^[A-Za-z0-9_-]+={0,2}$/;
const linkTo = (lat, lon, name) => `./?lat=${lat}&lon=${lon}&name=${encodeURIComponent(name || "")}`;

export const publicKey = async (env) => (await vapid(env)).pub;

// a phone's keys, as the push standard has them: a P-256 public key (65 bytes, uncompressed) and a 16-byte secret
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
async function checkSub(sub) {
  if (!sub || typeof sub !== "object" || !pushEndpointOk(sub.endpoint)) throw new HttpError(400, "That isn't a push subscription this server can send to.");
  const keys = await keysOk(sub);
  if (!keys) throw new HttpError(400, "Bad subscription keys.");
  return { endpoint: sub.endpoint, ...keys };
}

// { sub: { endpoint, keys: { p256dh, auth } }, place: { lat, lon, name }, rain, brief, briefAt: "07:00", units: {...}, was?: the endpoint before }
export async function subscribe(env, b) {
  const s = await checkSub(b.sub), p = b.place;
  if (!p || typeof p.lat !== "number" || typeof p.lon !== "number" || !Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) throw new HttpError(400, "Bad place.");
  const lat = r2(p.lat), lon = r2(p.lon);
  const name = String(p.name || "").replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, "").trim().slice(0, 60);
  const briefAt = /^([01]\d|2[0-3]):[0-5]\d$/.test(b.briefAt || "") ? b.briefAt : "07:00";
  const U = b.units && typeof b.units === "object" ? b.units : {};
  const units = JSON.stringify({ temp: U.temp === "f" ? "f" : "c", wind: ["mph", "kmh", "ms", "kn"].includes(U.wind) ? U.wind : "mph", precip: U.precip === "in" ? "in" : "mm", clock: U.clock === "12" ? "12" : "24" });
  const rain = b.rain ? 1 : 0, brief = b.brief ? 1 : 0;
  const D = await wxdb(env), id = await idOf(s.endpoint), t = Date.now();
  // the browser gave this phone a new subscription: its place moves over from the old one (no need to say hello again)
  const was = typeof b.was === "string" && b.was.length <= 1000 && b.was !== s.endpoint ? await idOf(b.was) : null;
  if (was) await D.prepare("UPDATE wx_subs SET id = ?1, endpoint = ?2, p256dh = ?3, auth = ?4, fails = 0 WHERE id = ?5 AND NOT EXISTS (SELECT 1 FROM wx_subs WHERE id = ?1)")
    .bind(id, s.endpoint, s.p256dh, s.auth, was).run();
  if (!rain && !brief) { await D.prepare("DELETE FROM wx_subs WHERE id = ?").bind(id).run(); return { ok: true, on: false }; }
  const have = await D.prepare("SELECT 1 FROM wx_subs WHERE id = ?").bind(id).first();
  if (!have) {
    if ((await D.prepare("SELECT COUNT(*) AS n FROM wx_subs").first()).n >= MAX_SUBS) throw new HttpError(429, "Notifications are full right now.");
    // a new phone: a first notification, to say they're on; it's only kept if that arrives
    const f = makeFormat(JSON.parse(units)), [hh, mm] = briefAt.split(":").map(Number);
    const what = [rain ? "rain alerts" : "", brief ? `a briefing at ${f.time(Date.UTC(2000, 0, 1, hh, mm))}` : ""].filter(Boolean).join(" and ");
    const r = await pushToSub(env, s, { title: "Notifications on", body: `${what[0].toUpperCase()}${what.slice(1)}${name ? ` for ${name}` : ""}.`, tag: "wx-on", ttl: 600, url: linkTo(lat, lon, name) });
    if (r !== "sent") throw new HttpError(400, "This phone's notifications couldn't be reached. Try again in a moment.");
    const ins = await D.prepare(`INSERT INTO wx_subs (id, endpoint, p256dh, auth, lat, lon, name, rain, brief, brief_at, units, created, updated, last_ok)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12, ?12 WHERE (SELECT COUNT(*) FROM wx_subs) < ?13
      ON CONFLICT(id) DO UPDATE SET lat = ?5, lon = ?6, name = ?7, rain = ?8, brief = ?9, brief_at = ?10, units = ?11, updated = ?12`)
      .bind(id, s.endpoint, s.p256dh, s.auth, lat, lon, name, rain, brief, briefAt, units, t, MAX_SUBS).run();
    if (!ins.meta?.changes && !(await D.prepare("SELECT 1 FROM wx_subs WHERE id = ?").bind(id).first())) throw new HttpError(429, "Notifications are full right now.");
    return { ok: true, on: true };
  }
  await D.prepare(`UPDATE wx_subs SET endpoint = ?2, p256dh = ?3, auth = ?4, lat = ?5, lon = ?6, name = ?7, rain = ?8, brief = ?9, brief_at = ?10, units = ?11, updated = ?12,
      tz_off = CASE WHEN abs(lat - ?5) > 0.05 OR abs(lon - ?6) > 0.05 THEN NULL ELSE tz_off END WHERE id = ?1`)
    .bind(id, s.endpoint, s.p256dh, s.auth, lat, lon, name, rain, brief, briefAt, units, t).run();
  return { ok: true, on: true };
}
export async function unsubscribe(env, endpoint) {
  if (typeof endpoint !== "string" || endpoint.length > 1000) throw new HttpError(400, "Bad request.");
  await (await wxdb(env)).prepare("DELETE FROM wx_subs WHERE id = ?").bind(await idOf(endpoint)).run();
  return { ok: true };
}
// the browser replaced a phone's subscription by itself (sw.js, pushsubscriptionchange): its place moves to the new one
export async function moveSub(env, b) {
  if (typeof b.was !== "string" || b.was.length > 1000) throw new HttpError(400, "Bad request.");
  const s = await checkSub(b.sub), D = await wxdb(env), from = await idOf(b.was), to = await idOf(s.endpoint);
  if (from === to) return { ok: true, moved: false };
  const r = await D.prepare("UPDATE wx_subs SET id = ?1, endpoint = ?2, p256dh = ?3, auth = ?4, fails = 0, updated = ?5 WHERE id = ?6 AND NOT EXISTS (SELECT 1 FROM wx_subs WHERE id = ?1)")
    .bind(to, s.endpoint, s.p256dh, s.auth, Date.now(), from).run();
  return { ok: true, moved: !!r.meta?.changes };
}

// The tick: one at a time (a lease, given back at the end; it lapses by itself if a tick dies part way)
export async function wxTick(env, t = Date.now()) {
  const D = await wxdb(env);
  await D.prepare("INSERT OR IGNORE INTO wx_meta (k, v) VALUES ('tick', '0')").run();
  const lease = await D.prepare("UPDATE wx_meta SET v = ?1 WHERE k = 'tick' AND CAST(v AS INTEGER) < ?2").bind(String(t + LEASE), t).run();
  if (!lease.meta?.changes) return { busy: true };
  try { return await tick(env, D, t); }
  finally { await D.prepare("UPDATE wx_meta SET v = '0' WHERE k = 'tick'").run().catch(() => {}); }
}
async function tick(env, D, t) {
  // once a day, at the first tick after 03:00 UTC: airport reports older than six weeks, and phones gone quiet for months
  const at = new Date(t);
  if (at.getUTCHours() === 3 && at.getUTCMinutes() < 10) await D.batch([
    D.prepare("DELETE FROM wx_obs WHERE day < ?").bind(new Date(t - OBS_DAYS * 864e5).toISOString().slice(0, 10)),
    D.prepare("DELETE FROM wx_subs WHERE max(coalesce(updated, 0), coalesce(last_ok, 0)) < ?").bind(t - KEEP_IDLE),
  ]);
  const { results: subs } = await D.prepare("SELECT * FROM wx_subs WHERE rain = 1 OR brief = 1").all();
  const local = (s) => t + (s.tz_off || 0) * 1000, due = (s) => !!s.brief && briefDue(local(s), s.brief_at, s.last_brief);
  // briefings first (they're kept to their time), and only so many a tick (the rest wait ten minutes)
  const need = subs.filter((s) => s.tz_off == null || (s.rain && !isQuiet(local(s))) || due(s)).sort((a, b) => due(b) - due(a)).slice(0, PER_TICK);
  // places a few kilometres apart share a forecast (0.05°); the whole of it only where a briefing's due (or the clock's not known yet)
  const snap = (v) => Math.round(v * 20) / 20, cellOf = (s) => `${snap(s.lat)},${snap(s.lon)}`;
  const cells = new Map();
  for (const s of need) { const k = cellOf(s), c = cells.get(k) || { lat: snap(s.lat), lon: snap(s.lon), full: false }; c.full ||= due(s) || s.tz_off == null; cells.set(k, c); }
  const forecasts = new Map(), base = env.WXAPP_URL || "https://api.open-meteo.com";
  for (const full of [true, false]) {
    const list = [...cells].filter(([, c]) => c.full === full);
    for (let i = 0; i < list.length; i += 40) {
      const part = list.slice(i, i + 40), lats = part.map(([, c]) => c.lat), lons = part.map(([, c]) => c.lon);
      try {
        const r = await fetch(`${base}/v1/forecast?${full ? forecastQuery(lats, lons, 3) : rainQuery(lats, lons)}`, { signal: AbortSignal.timeout(15000), headers: { Accept: "application/json" } });
        if (!r.ok) { console.error("weather tick: forecast", r.status); continue; }
        const j = await r.json(), got = Array.isArray(j) ? j : [j];
        part.forEach(([k], n) => got[n] && forecasts.set(k, got[n]));
      } catch (e) { console.error("weather tick: forecast", e && e.message); }
    }
  }
  const out = { subs: subs.length, looked: need.length, places: cells.size, rain: 0, brief: 0, gone: 0 };
  for (const s of need) {
    // (one phone's trouble doesn't stop the others')
    try { await notify(env, D, s, forecasts.get(cellOf(s)), t, out); } catch (e) { console.error("weather tick:", e && e.message); }
  }
  return out;
}
const claim = async (D, s, col, v) => !!(await D.prepare(`UPDATE wx_subs SET ${col} = ?1 WHERE id = ?2 AND ${col} IS ?3`).bind(v, s.id, s[col] ?? null).run()).meta?.changes;
const giveBack = (D, s, col, v) => D.prepare(`UPDATE wx_subs SET ${col} = ?1 WHERE id = ?2 AND ${col} IS ?3`).bind(s[col] ?? null, s.id, v).run();
async function notify(env, D, s, j, t, out) {
  if (!j) return;
  const wx = shapeForecast(j, { name: s.name, lat: s.lat, lon: s.lon }), now = nowWall(wx.place.offset, t);
  let units = {}; try { units = JSON.parse(s.units || "{}"); } catch (_) {}
  const f = makeFormat(units), url = linkTo(s.lat, s.lon, s.name), got = [];
  if (s.tz_off !== wx.place.offset) await D.prepare("UPDATE wx_subs SET tz_off = ?2 WHERE id = ?1").bind(s.id, wx.place.offset).run();
  if (s.rain) {
    const a = rainAlert(wx, now, f, s.last_rain ? t - s.last_rain : null);
    if (a && await claim(D, s, "last_rain", t)) {
      const r = await pushToSub(env, s, { ...a, url, ttl: 1800, urgency: "high" });
      got.push(r); if (r === "sent") out.rain++; else await giveBack(D, s, "last_rain", t);
    }
  }
  if (!got.includes("gone") && s.brief && wx.daily.length && briefDue(now, s.brief_at, s.last_brief)) {
    const key = keyOf(now);
    if (await claim(D, s, "last_brief", key)) {
      const r = await pushToSub(env, s, { ...briefing(wx, now, f), url, ttl: 3 * 3600 });
      got.push(r); if (r === "sent") out.brief++; else await giveBack(D, s, "last_brief", key);
    }
  }
  // gone: forgotten; arrived: all's well; failed: one more strike (five in a row, and it's forgotten)
  if (got.includes("gone")) { await D.prepare("DELETE FROM wx_subs WHERE id = ?").bind(s.id).run(); out.gone++; }
  else if (got.includes("sent")) await D.prepare("UPDATE wx_subs SET fails = 0, last_ok = ?2 WHERE id = ?1").bind(s.id, t).run();
  else if (got.includes("error")) {
    const r = await D.prepare("DELETE FROM wx_subs WHERE id = ?1 AND fails + 1 >= ?2").bind(s.id, MAX_FAILS).run();
    if (r.meta?.changes) out.gone++; else await D.prepare("UPDATE wx_subs SET fails = fails + 1 WHERE id = ?").bind(s.id).run();
  }
}
