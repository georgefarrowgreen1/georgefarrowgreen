// Weather's notifications: a heads-up when rain is about to start, and a
// morning briefing, for one place per phone. Sent with InFlight's Web Push
// (functions/_notify.js: encrypted to the phone, so the push service sees
// nothing of what it says) and worded by the app's own code (weather/alerts.js),
// so a notification says what the app would.
//
// A tick (.github/workflows/weather-tick.yml, every 10 minutes) looks at each
// place that needs it: rain alerts outside the quiet hours (22:00 to 07:00 there),
// briefings around their time. Places are kept to two decimal places (about a
// kilometre) and forgotten when notifications are turned off or the phone
// unsubscribes.
//
// WXAPP_URL: tests only (a stand-in for Open-Meteo).

import { pushEndpointOk, pushToSub, vapid } from "./_notify.js";
import { HttpError } from "./_pigeon.js";
import { shapeForecast, forecastQuery } from "../weather/data.js";
import { makeFormat, nowWall, keyOf } from "../weather/format.js";
import { rainAlert, briefDue, briefing, isQuiet } from "../weather/alerts.js";

const MAX_SUBS = 300;
let ready = null;
export async function wxdb(env) {
  if (!env.DB) throw new HttpError(503, "Not set up.");
  if (!ready) ready = env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS wx_subs (id TEXT PRIMARY KEY, endpoint TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
      lat REAL NOT NULL, lon REAL NOT NULL, name TEXT, rain INTEGER NOT NULL DEFAULT 0, brief INTEGER NOT NULL DEFAULT 0, brief_at TEXT,
      units TEXT, tz_off INTEGER, last_rain INTEGER, last_brief TEXT, created INTEGER, updated INTEGER)`),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS wx_obs (station TEXT NOT NULL, day TEXT NOT NULL, tmax REAL, tmin REAL, n INTEGER, PRIMARY KEY (station, day))"),
  ]).catch((e) => { ready = null; throw e; });
  await ready;
  return env.DB;
}
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const idOf = async (endpoint) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint))).slice(0, 32);
const r2 = (v) => Math.round(v * 100) / 100;
const B64U = /^[A-Za-z0-9_-]+={0,2}$/;

export const publicKey = async (env) => (await vapid(env)).pub;

// { sub: { endpoint, keys: { p256dh, auth } }, place: { lat, lon, name }, rain, brief, briefAt: "07:00", units: {...} }
export async function subscribe(env, b) {
  const sub = b?.sub, p = b?.place;
  if (!sub || typeof sub.endpoint !== "string" || !pushEndpointOk(sub.endpoint)) throw new HttpError(400, "That isn't a push subscription this server can send to.");
  const p256dh = sub.keys?.p256dh, auth = sub.keys?.auth;
  if (typeof p256dh !== "string" || typeof auth !== "string" || !B64U.test(p256dh) || !B64U.test(auth) || p256dh.length > 120 || auth.length > 40) throw new HttpError(400, "Bad subscription keys.");
  const lat = Number(p?.lat), lon = Number(p?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new HttpError(400, "Bad place.");
  const name = String(p?.name || "").replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, "").trim().slice(0, 60);
  const briefAt = /^([01]\d|2[0-3]):[0-5]\d$/.test(b.briefAt || "") ? b.briefAt : "07:00";
  const U = b.units || {}, units = JSON.stringify({ temp: U.temp === "f" ? "f" : "c", wind: ["mph", "kmh", "ms", "kn"].includes(U.wind) ? U.wind : "mph", precip: U.precip === "in" ? "in" : "mm", clock: U.clock === "12" ? "12" : "24" });
  const rain = b.rain ? 1 : 0, brief = b.brief ? 1 : 0;
  const D = await wxdb(env), id = await idOf(sub.endpoint), t = Date.now();
  if (!rain && !brief) { await D.prepare("DELETE FROM wx_subs WHERE id = ?").bind(id).run(); return { ok: true, on: false }; }
  const have = await D.prepare("SELECT 1 FROM wx_subs WHERE id = ?").bind(id).first();
  if (!have && (await D.prepare("SELECT COUNT(*) AS n FROM wx_subs").first()).n >= MAX_SUBS) throw new HttpError(429, "Notifications are full right now.");
  await D.prepare(`INSERT INTO wx_subs (id, endpoint, p256dh, auth, lat, lon, name, rain, brief, brief_at, units, created, updated)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)
    ON CONFLICT(id) DO UPDATE SET endpoint = ?2, p256dh = ?3, auth = ?4, lat = ?5, lon = ?6, name = ?7, rain = ?8, brief = ?9, brief_at = ?10, units = ?11, updated = ?12,
      tz_off = CASE WHEN abs(lat - ?5) > 0.05 OR abs(lon - ?6) > 0.05 THEN NULL ELSE tz_off END`)
    .bind(id, sub.endpoint, p256dh, auth, r2(lat), r2(lon), name, rain, brief, briefAt, units, t).run();
  return { ok: true, on: true };
}
export async function unsubscribe(env, endpoint) {
  if (typeof endpoint !== "string" || endpoint.length > 1000) throw new HttpError(400, "Bad request.");
  await (await wxdb(env)).prepare("DELETE FROM wx_subs WHERE id = ?").bind(await idOf(endpoint)).run();
  return { ok: true };
}

// The tick: every place that needs a look, one forecast request for them all (in batches), then each phone's notes
export async function wxTick(env, t = Date.now()) {
  const D = await wxdb(env);
  const { results: subs } = await D.prepare("SELECT * FROM wx_subs WHERE rain = 1 OR brief = 1").all();
  const local = (s) => t + (s.tz_off || 0) * 1000;
  const need = subs.filter((s) => s.tz_off == null || (s.rain && !isQuiet(local(s))) || (s.brief && briefDue(local(s), s.brief_at, s.last_brief)));
  const cells = [...new Map(need.map((s) => [`${s.lat},${s.lon}`, { lat: s.lat, lon: s.lon }])).values()];
  const forecasts = new Map();
  for (let i = 0; i < cells.length; i += 40) {
    const part = cells.slice(i, i + 40);
    try {
      const r = await fetch(`${env.WXAPP_URL || "https://api.open-meteo.com"}/v1/forecast?${forecastQuery(part.map((c) => c.lat), part.map((c) => c.lon), 3)}`, { signal: AbortSignal.timeout(15000), headers: { Accept: "application/json" } });
      if (!r.ok) { console.error("weather tick: forecast", r.status); continue; }
      const j = await r.json(), list = Array.isArray(j) ? j : [j];
      part.forEach((c, k) => list[k] && forecasts.set(`${c.lat},${c.lon}`, list[k]));
    } catch (e) { console.error("weather tick: forecast", e && e.message); }
  }
  const out = { subs: subs.length, looked: need.length, places: cells.length, rain: 0, brief: 0, gone: 0 }, writes = [];
  for (const s of need) {
    const j = forecasts.get(`${s.lat},${s.lon}`); if (!j) continue;
    const wx = shapeForecast(j, { name: s.name, lat: s.lat, lon: s.lon }), now = nowWall(wx.place.offset, t);
    let units = {}; try { units = JSON.parse(s.units || "{}"); } catch (_) {}
    const f = makeFormat(units), url = `./?lat=${s.lat}&lon=${s.lon}&name=${encodeURIComponent(s.name || "")}`;
    const set = { tz_off: wx.place.offset };
    let gone = false;
    if (s.rain) {
      const a = rainAlert(wx, now, f, s.last_rain ? t - s.last_rain : null);
      if (a) {
        const r = await pushToSub(env, s, { ...a, url, ttl: 1800, urgency: "high" });
        if (r === "sent") { set.last_rain = t; out.rain++; } else if (r === "gone") gone = true;
      }
    }
    if (!gone && s.brief && briefDue(now, s.brief_at, s.last_brief)) {
      const r = await pushToSub(env, s, { ...briefing(wx, now, f), url, ttl: 3 * 3600 });
      if (r === "sent") { set.last_brief = keyOf(now); out.brief++; } else if (r === "gone") gone = true;
    }
    if (gone) { writes.push(D.prepare("DELETE FROM wx_subs WHERE id = ?").bind(s.id)); out.gone++; continue; }
    const cols = Object.keys(set);
    writes.push(D.prepare(`UPDATE wx_subs SET ${cols.map((c, k) => `${c} = ?${k + 2}`).join(", ")} WHERE id = ?1`).bind(s.id, ...cols.map((c) => set[c])));
  }
  if (writes.length) await D.batch(writes);
  return out;
}
