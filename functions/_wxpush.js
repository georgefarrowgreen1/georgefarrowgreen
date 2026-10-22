// Weather's notifications: a heads-up when rain is about to start, a morning
// briefing, and an official warning as it's issued, for one place per phone. Sent with InFlight's Web Push
// (functions/_notify.js: encrypted to the phone, so the push service sees
// nothing of what it says) and worded by the app's own code (weather/alerts.js),
// so a notification says what the app would.
//
// A tick (.github/workflows/weather-tick.yml, every 10 minutes) looks at each
// place that needs it: rain alerts outside the quiet hours (22:00 to 07:00 there),
// briefings around their time (with any official warnings: functions/_wxwarn.js), and each place's warnings (its
// weather service's feeds, kept a few minutes for all: a warning new, or raised, since the last told). For rain it asks only for the next few hours'
// rain (one small request for every place at once); the whole forecast only
// where a briefing is due; and no more each tick than Open-Meteo's free service
// allows over a day (the rest wait for the next). Where there's radar, the next
// couple of hours' rain is led by it, as the app's is (functions/_wxradar.js),
// for the places whose rain alerts could go now. Places are kept to two decimal places (about a
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
import { rainAlert, briefDue, briefing, warningAlert, isQuiet, RAIN_GAP } from "../weather/alerts.js";
import { blend } from "../weather/rainmap.js";
import { warningsAt } from "./_wxwarn.js";
import { radarForTick } from "./_wxradar.js";

const MAX_SUBS = 300, PER_TICK = 200, MAX_FAILS = 5, KEEP_IDLE = 120 * 864e5, OBS_DAYS = 46, LEASE = 8 * 60e3;
// what Open-Meteo is asked each tick, in its own measure: a place's rain is one call, its whole forecast about seven
// (its free service allows 10,000 a day: this keeps the ticks to about 8,000 at most)
const BUDGET = 55, COST_FULL = 7;
// the places the radar's read for in a tick (each costs a few tiles, shared with any place near it)
const RADAR_PLACES = 40;
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
    // (warn: official warnings wanted; told: those already told of, alerts.js warningAlert)
    for (const col of ["fails INTEGER NOT NULL DEFAULT 0", "last_ok INTEGER", "warn INTEGER NOT NULL DEFAULT 0", "told TEXT"]) await env.DB.prepare(`ALTER TABLE wx_subs ADD COLUMN ${col}`).run().catch(() => {});
    // (each day's hours at the airport: temperature, dew point, wind and gusts, for tuning more than the highs and lows)
    await env.DB.prepare("ALTER TABLE wx_obs ADD COLUMN hours TEXT").run().catch(() => {});
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

// { sub: { endpoint, keys: { p256dh, auth } }, place: { lat, lon, name }, rain, brief, warn, briefAt: "07:00", units: {...}, was?: the endpoint before }
export async function subscribe(env, b) {
  const s = await checkSub(b.sub), p = b.place;
  if (!p || typeof p.lat !== "number" || typeof p.lon !== "number" || !Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) throw new HttpError(400, "Bad place.");
  const lat = r2(p.lat), lon = r2(p.lon);
  const name = String(p.name || "").replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, "").trim().slice(0, 60);
  const briefAt = /^([01]\d|2[0-3]):[0-5]\d$/.test(b.briefAt || "") ? b.briefAt : "07:00";
  const U = b.units && typeof b.units === "object" ? b.units : {};
  const units = JSON.stringify({ temp: U.temp === "f" ? "f" : "c", wind: ["mph", "kmh", "ms", "kn"].includes(U.wind) ? U.wind : "mph", precip: U.precip === "in" ? "in" : "mm", clock: U.clock === "12" ? "12" : "24" });
  const rain = b.rain ? 1 : 0, brief = b.brief ? 1 : 0, warn = b.warn ? 1 : 0;
  const D = await wxdb(env), id = await idOf(s.endpoint), t = Date.now();
  // the browser gave this phone a new subscription: its place moves over from the old one (no need to say hello again)
  const was = typeof b.was === "string" && b.was.length <= 1000 && b.was !== s.endpoint ? await idOf(b.was) : null;
  if (was) await D.prepare("UPDATE wx_subs SET id = ?1, endpoint = ?2, p256dh = ?3, auth = ?4, fails = 0 WHERE id = ?5 AND NOT EXISTS (SELECT 1 FROM wx_subs WHERE id = ?1)")
    .bind(id, s.endpoint, s.p256dh, s.auth, was).run();
  if (!rain && !brief && !warn) { await D.prepare("DELETE FROM wx_subs WHERE id = ?").bind(id).run(); return { ok: true, on: false }; }
  const have = await D.prepare("SELECT 1 FROM wx_subs WHERE id = ?").bind(id).first();
  if (!have) {
    if ((await D.prepare("SELECT COUNT(*) AS n FROM wx_subs").first()).n >= MAX_SUBS) throw new HttpError(429, "Notifications are full right now.");
    // a new phone: a first notification, to say they're on; it's only kept if that arrives
    const f = makeFormat(JSON.parse(units)), [hh, mm] = briefAt.split(":").map(Number);
    const parts = [rain ? "rain alerts" : "", warn ? "official warnings" : "", brief ? `a briefing at ${f.time(Date.UTC(2000, 0, 1, hh, mm))}` : ""].filter(Boolean);
    const what = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];
    const r = await pushToSub(env, s, { title: "Notifications on", body: `${what[0].toUpperCase()}${what.slice(1)}${name ? ` for ${name}` : ""}.`, tag: "wx-on", ttl: 600, url: linkTo(lat, lon, name) });
    if (r !== "sent") throw new HttpError(400, "This phone's notifications couldn't be reached. Try again in a moment.");
    const ins = await D.prepare(`INSERT INTO wx_subs (id, endpoint, p256dh, auth, lat, lon, name, rain, brief, brief_at, units, created, updated, last_ok, warn)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12, ?12, ?14 WHERE (SELECT COUNT(*) FROM wx_subs) < ?13
      ON CONFLICT(id) DO UPDATE SET lat = ?5, lon = ?6, name = ?7, rain = ?8, brief = ?9, brief_at = ?10, units = ?11, updated = ?12, warn = ?14, told = NULL`)
      .bind(id, s.endpoint, s.p256dh, s.auth, lat, lon, name, rain, brief, briefAt, units, t, MAX_SUBS, warn).run();
    if (!ins.meta?.changes && !(await D.prepare("SELECT 1 FROM wx_subs WHERE id = ?").bind(id).first())) throw new HttpError(429, "Notifications are full right now.");
    return { ok: true, on: true };
  }
  // (warnings turned on, or the place moved: those in force there taken as told when it's next looked at, not sent)
  await D.prepare(`UPDATE wx_subs SET endpoint = ?2, p256dh = ?3, auth = ?4, lat = ?5, lon = ?6, name = ?7, rain = ?8, brief = ?9, brief_at = ?10, units = ?11, updated = ?12,
      tz_off = CASE WHEN abs(lat - ?5) > 0.05 OR abs(lon - ?6) > 0.05 THEN NULL ELSE tz_off END,
      told = CASE WHEN ?13 = 0 OR warn = 0 OR abs(lat - ?5) > 0.005 OR abs(lon - ?6) > 0.005 THEN NULL ELSE told END, warn = ?13 WHERE id = ?1`)
    .bind(id, s.endpoint, s.p256dh, s.auth, lat, lon, name, rain, brief, briefAt, units, t, warn).run();
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
  const { results: subs } = await D.prepare("SELECT * FROM wx_subs WHERE rain = 1 OR brief = 1 OR warn = 1").all();
  const local = (s) => t + (s.tz_off || 0) * 1000, due = (s) => !!s.brief && briefDue(local(s), s.brief_at, s.last_brief);
  // briefings first (they're kept to their time), and only so many a tick (the rest wait ten minutes)
  const need = subs.filter((s) => s.tz_off == null || (s.rain && !isQuiet(local(s))) || due(s)).sort((a, b) => due(b) - due(a)).slice(0, PER_TICK);
  // places a few kilometres apart share a forecast (0.05°); the whole of it only where a briefing's due (or the clock's not known yet)
  const snap = (v) => Math.round(v * 20) / 20, cellOf = (s) => `${snap(s.lat)},${snap(s.lon)}`;
  const cells = new Map();
  for (const s of need) { const k = cellOf(s), c = cells.get(k) || { lat: snap(s.lat), lon: snap(s.lon), full: false }; c.full ||= due(s) || s.tz_off == null; cells.set(k, c); }
  const asked = budgeted([...cells]);
  const forecasts = new Map(), base = env.WXAPP_URL || "https://api.open-meteo.com";
  ask: for (const full of [true, false]) {
    const list = asked.filter(([, c]) => c.full === full);
    for (let i = 0; i < list.length; i += 40) {
      const part = list.slice(i, i + 40), lats = part.map(([, c]) => c.lat), lons = part.map(([, c]) => c.lon);
      try {
        const r = await fetch(`${base}/v1/forecast?${full ? forecastQuery(lats, lons, 3) : rainQuery(lats, lons)}`, { signal: AbortSignal.timeout(15000), headers: { Accept: "application/json" } });
        // (turned away for asking too much: no more this tick)
        if (r.status === 429) { console.error("weather tick: Open-Meteo's limit reached", (await r.text().catch(() => "")).slice(0, 200)); break ask; }
        if (!r.ok) { console.error("weather tick: forecast", r.status); continue; }
        const j = await r.json(), got = Array.isArray(j) ? j : [j];
        part.forEach(([k], n) => got[n] && forecasts.set(k, got[n]));
      } catch (e) { console.error("weather tick: forecast", e && e.message); }
    }
  }
  // the radar's say on the next couple of hours, as the app has it, for each place whose rain alert could go now (not
  // in its quiet hours, nor within three hours of the last) or whose briefing's due: read all at once, while the
  // phones are gone through
  const radar = radarForTick(env, t), rains = new Map(), spot = (s) => `${s.lat},${s.lon}`;
  const could = (s) => s.rain && (s.tz_off == null || !isQuiet(local(s))) && !(s.last_rain && t - s.last_rain < RAIN_GAP);
  for (const s of need) if (rains.size < RADAR_PLACES && !rains.has(spot(s)) && (could(s) || due(s))) rains.set(spot(s), radar.at(s.lat, s.lon));
  const out = { subs: subs.length, looked: need.length, places: cells.size, asked: asked.length, radar: rains.size, rain: 0, brief: 0, warn: 0, gone: 0 };
  for (const s of need) {
    // (one phone's trouble doesn't stop the others')
    try { await notify(env, D, s, forecasts.get(cellOf(s)), t, out, await rains.get(spot(s))); } catch (e) { console.error("weather tick:", e && e.message); }
  }
  // official warnings, every tick, for each place that wants them (once its clock's known, for saying when): each
  // place's asked for once a tick, however many phones are there
  const warned = new Map();
  for (const s of subs) {
    if (!s.warn || s.tz_off == null) continue;
    try { await warnNotify(env, D, s, t, out, warned); } catch (e) { console.error("weather tick: warnings", e && e.message); }
  }
  return out;
}
// A warning new, or raised, since the last told (alerts.js warningAlert), sent; the record of what's been told kept
// either way (and claimed before it's sent, as the others are, so it can't go twice)
async function warnNotify(env, D, s, t, out, cache) {
  const k = `${s.lat},${s.lon}`;
  if (!cache.has(k)) cache.set(k, warningsAt(env, s.lat, s.lon, t).then((r) => r.warnings).catch(() => null));
  const list = await cache.get(k);
  if (!list) return;          // (not to be had this tick: nothing's taken as told)
  let told = null, units = {};
  try { told = s.told ? JSON.parse(s.told) : null; } catch (_) {}
  try { units = JSON.parse(s.units || "{}"); } catch (_) {}
  const off = s.tz_off || 0, { alert, told: next } = warningAlert(list, told, t + off * 1000, t, makeFormat(units), off, s.name);
  const json = JSON.stringify(next);
  if (!alert) { if (json !== s.told) await D.prepare("UPDATE wx_subs SET told = ?2 WHERE id = ?1").bind(s.id, json).run(); return; }
  if (!(await claim(D, s, "told", json))) return;
  const r = await pushToSub(env, s, { ...alert, url: linkTo(s.lat, s.lon, s.name), ttl: 6 * 3600, urgency: "high" });
  if (r === "sent") { out.warn++; await D.prepare("UPDATE wx_subs SET fails = 0, last_ok = ?2 WHERE id = ?1").bind(s.id, t).run(); return; }
  await giveBack(D, s, "told", json);
  if (r === "gone") { await D.prepare("DELETE FROM wx_subs WHERE id = ?").bind(s.id).run(); out.gone++; }
}
// The places asked about in a tick ([key, { full }] each), within the budget: whole forecasts first, then rain (in a
// shuffled order, so the places left for the next tick aren't always the same ones)
export function budgeted(cells, budget = BUDGET, rnd = Math.random) {
  const order = cells.map((e) => [e, e[1].full ? -1 : rnd()]).sort((a, b) => a[1] - b[1]).map(([e]) => e);
  let spend = 0;
  return order.filter(([, c]) => { const cost = c.full ? COST_FULL : 1; if (spend + cost > budget) return false; spend += cost; return true; });
}
const claim = async (D, s, col, v) => !!(await D.prepare(`UPDATE wx_subs SET ${col} = ?1 WHERE id = ?2 AND ${col} IS ?3`).bind(v, s.id, s[col] ?? null).run()).meta?.changes;
const giveBack = (D, s, col, v) => D.prepare(`UPDATE wx_subs SET ${col} = ?1 WHERE id = ?2 AND ${col} IS ?3`).bind(s[col] ?? null, s.id, v).run();
// (rain: the radar's say on the next couple of hours here, if it was read: rainmap.js radarAt)
async function notify(env, D, s, j, t, out, rain = null) {
  if (!j) return;
  const wx = shapeForecast(j, { name: s.name, lat: s.lat, lon: s.lon }), now = nowWall(wx.place.offset, t);
  if (rain) wx.minutely = blend(wx.minutely, rain.steps, rain.at, wx.place.offset);
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
      // (with the official warnings for the place, from its weather service, where there are any)
      wx.official = (await warningsAt(env, s.lat, s.lon, t).catch(() => null))?.warnings || null;
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
