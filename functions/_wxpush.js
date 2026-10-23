// Weather's notifications: a heads-up when rain is about to start, a morning
// briefing, and an official warning as it's issued, for the places each phone or computer wants them for (a device:
// wx_devs; each of its places a row of wx_subs, with what's been told there). Signed in to the site's account
// (functions/_account.js), the choices are the account's (functions/_wxacct.js), and every device signed in to it with
// notifications on gets them. Sent with the site's Web Push
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
// Turning them on sends a first notification ("Notifications on"), and the device
// is only kept if that arrives: so only a real phone or computer can take one of the places.
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

// (MAX_SUBS: devices not signed in, at most, and NET_DAY of them a day from one network; MAX_ALL: every device, the
// account's included: accounts are by invite, so theirs aren't held back by anyone else's)
const MAX_SUBS = 300, NET_DAY = 3, MAX_ALL = 2000, PER_TICK = 200, MAX_FAILS = 5, KEEP_IDLE = 120 * 864e5, OBS_DAYS = 46, LEASE = 8 * 60e3;
// (a device's places with notifications: as many as a list of saved places is likely to want)
export const MAX_PLACES = 12;
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
    // (dev: the device's, a row for each of its places)
    for (const col of ["fails INTEGER NOT NULL DEFAULT 0", "last_ok INTEGER", "warn INTEGER NOT NULL DEFAULT 0", "told TEXT", "dev TEXT"]) await env.DB.prepare(`ALTER TABLE wx_subs ADD COLUMN ${col}`).run().catch(() => {});
    // The devices: each one's push address and keys, its units, its briefing's time, and the account it's signed in to
    // (if it is: user_id). A device from before (one place, its row's id its own) becomes one here, once.
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS wx_devs (dev TEXT PRIMARY KEY, endpoint TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, user_id TEXT,
        label TEXT, units TEXT, brief_at TEXT, created INTEGER, updated INTEGER)`),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS wx_devs_user ON wx_devs (user_id)"),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS wx_subs_dev ON wx_subs (dev)"),
      env.DB.prepare("CREATE TABLE IF NOT EXISTS wx_accts (user_id TEXT PRIMARY KEY, data TEXT NOT NULL, ver INTEGER NOT NULL, updated INTEGER)"),
    ]);
    // (net: a hash of the network a device not signed in was turned on from, so one network can only turn on so many)
    await env.DB.prepare("ALTER TABLE wx_devs ADD COLUMN net TEXT").run().catch(() => {});
    if (!(await env.DB.prepare("SELECT 1 FROM wx_meta WHERE k = 'devs_v1'").first())) await env.DB.batch([
      env.DB.prepare("UPDATE wx_subs SET dev = id WHERE dev IS NULL"),
      env.DB.prepare(`INSERT OR IGNORE INTO wx_devs (dev, endpoint, p256dh, auth, units, brief_at, created, updated)
        SELECT dev, endpoint, p256dh, auth, units, brief_at, created, updated FROM wx_subs`),
      env.DB.prepare("INSERT OR IGNORE INTO wx_meta (k, v) VALUES ('devs_v1', '1')"),
    ]);
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

// What a device wants, made safe: { places: [{ lat, lon, name, rain, warn }] (each with one or the other, two decimal
// places, at most MAX_PLACES), brief: { lat, lon, name } or null, briefAt: "HH:MM" }. From an app from before (one place,
// for whichever were on: { place, rain, warn, brief }) as the same.
const cleanName = (v) => String(v || "").replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim().slice(0, 60);
const spotOf = (p) => (p && typeof p === "object" && typeof p.lat === "number" && typeof p.lon === "number" && Number.isFinite(p.lat) && Number.isFinite(p.lon)
  && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180 ? { lat: r2(p.lat), lon: r2(p.lon), name: cleanName(p.name), ...(p.gps ? { gps: true } : {}) } : null);
export function wantOf(b) {
  if (!b || typeof b !== "object") b = {};
  const briefAt = /^([01]\d|2[0-3]):[0-5]\d$/.test(b.briefAt || "") ? b.briefAt : "07:00";
  if (!Array.isArray(b.places) && b.place) {        // (the app from before)
    const p = spotOf(b.place);
    if (!p) throw new HttpError(400, "Bad place.");
    return { places: b.rain || b.warn ? [{ ...p, rain: !!b.rain, warn: !!b.warn }] : [], brief: b.brief ? p : null, briefAt };
  }
  const seen = new Set(), places = [];
  for (const x of Array.isArray(b.places) ? b.places : []) {
    const p = spotOf(x), k = p && `${p.lat},${p.lon}`;
    if (!p || seen.has(k) || !(x.rain || x.warn)) continue;
    seen.add(k); places.push({ ...p, rain: !!x.rain, warn: !!x.warn });
  }
  if (places.length > MAX_PLACES) throw new HttpError(400, `Notifications can be on for ${MAX_PLACES} places at most.`);
  const brief = b.brief && typeof b.brief === "object" ? spotOf(b.brief) : null;
  if (b.brief && typeof b.brief === "object" && !brief) throw new HttpError(400, "Bad place.");
  return { places, brief, briefAt };
}
const wanted = (w) => w.places.length > 0 || !!w.brief;
function unitsOf(U) {
  U = U && typeof U === "object" ? U : {};
  return JSON.stringify({ temp: U.temp === "f" ? "f" : "c", wind: ["mph", "kmh", "ms", "kn"].includes(U.wind) ? U.wind : "mph", precip: U.precip === "in" ? "in" : "mm", clock: U.clock === "12" ? "12" : "24" });
}
// "Rain alerts and official warnings for London and 2 more places." (what a device has just been given)
function onText(w, units) {
  const f = makeFormat(JSON.parse(units)), [hh, mm] = w.briefAt.split(":").map(Number);
  const kinds = [w.places.some((p) => p.rain) ? "rain alerts" : "", w.places.some((p) => p.warn) ? "official warnings" : "", w.brief ? `a briefing at ${f.time(Date.UTC(2000, 0, 1, hh, mm))}` : ""].filter(Boolean);
  if (!kinds.length) return "Notifications you turn on will come here.";
  const names = [...new Set([...w.places.map((p) => p.name), w.brief?.name].filter(Boolean))];
  const what = kinds.length > 1 ? `${kinds.slice(0, -1).join(", ")} and ${kinds.at(-1)}` : kinds[0];
  return `${what[0].toUpperCase()}${what.slice(1)}${names.length ? ` for ${names[0]}${names.length > 1 ? ` and ${names.length - 1} more place${names.length > 2 ? "s" : ""}` : ""}` : ""}.`;
}
// A device's rows made to match what it wants (dv: its wx_devs row): places no longer wanted gone, the rest kept with what's
// been told there (warnings turned on, or a new place: those in force there are taken as told when it's next looked at)
async function setRows(D, dv, w, t) {
  const rows = new Map();
  for (const p of w.places) rows.set(`${p.lat},${p.lon}`, { ...p, brief: 0 });
  if (w.brief) { const k = `${w.brief.lat},${w.brief.lon}`; rows.set(k, { rain: false, warn: false, ...w.brief, ...rows.get(k), brief: 1 }); }
  const { results: have } = await D.prepare("SELECT id, lat, lon, warn FROM wx_subs WHERE dev = ?").bind(dv.dev).all();
  const steps = [], had = new Map(have.map((h) => [`${h.lat},${h.lon}`, h]));
  for (const [k, h] of had) if (!rows.has(k)) steps.push(D.prepare("DELETE FROM wx_subs WHERE id = ?").bind(h.id));
  for (const [k, r] of rows) {
    const h = had.get(k), rain = r.rain ? 1 : 0, warn = r.warn ? 1 : 0;
    if (h) steps.push(D.prepare(`UPDATE wx_subs SET endpoint = ?2, p256dh = ?3, auth = ?4, name = ?5, rain = ?6, brief = ?7, brief_at = ?8, units = ?9, updated = ?10,
        told = CASE WHEN ?11 = 0 OR warn = 0 THEN NULL ELSE told END, warn = ?11 WHERE id = ?1`)
      .bind(h.id, dv.endpoint, dv.p256dh, dv.auth, r.name, rain, r.brief, w.briefAt, dv.units, t, warn));
    else steps.push(D.prepare(`INSERT INTO wx_subs (id, dev, endpoint, p256dh, auth, lat, lon, name, rain, brief, brief_at, units, created, updated, last_ok, warn)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13, ?13, ?14)`)
      .bind(`${dv.dev}:${k}`, dv.dev, dv.endpoint, dv.p256dh, dv.auth, r.lat, r.lon, r.name, rain, r.brief, w.briefAt, dv.units, t, warn));
  }
  if (steps.length) await D.batch(steps);
}
// A device moved to a new push address by its browser (was: the old one): its places go with it
async function moveDev(D, from, s, to, t) {
  const r = await D.prepare("UPDATE wx_devs SET dev = ?1, endpoint = ?2, p256dh = ?3, auth = ?4, updated = ?5 WHERE dev = ?6 AND NOT EXISTS (SELECT 1 FROM wx_devs WHERE dev = ?1)")
    .bind(to, s.endpoint, s.p256dh, s.auth, t, from).run();
  if (!r.meta?.changes) return false;
  await D.prepare("UPDATE wx_subs SET dev = ?1, id = ?1 || ':' || lat || ',' || lon, endpoint = ?2, p256dh = ?3, auth = ?4, fails = 0 WHERE dev = ?5").bind(to, s.endpoint, s.p256dh, s.auth, from).run();
  return true;
}
// The account's choices (functions/_wxacct.js), for each of its devices
export async function applyAccount(env, userId, notify) {
  const D = await wxdb(env), w = wantOf(notify), t = Date.now();
  const { results: devs } = await D.prepare("SELECT * FROM wx_devs WHERE user_id = ?").bind(userId).all();
  for (const dv of devs) await setRows(D, { ...dv }, w, t);
}
// The devices signed in to an account that get its notifications: [{ id, label }]
// New units for an account (set on its own page): its devices' notifications say them from now on
export async function unitsForAccount(env, userId, U) {
  const D = await wxdb(env), units = unitsOf(U);
  await D.batch([
    D.prepare("UPDATE wx_subs SET units = ?2 WHERE dev IN (SELECT dev FROM wx_devs WHERE user_id = ?1)").bind(userId, units),
    D.prepare("UPDATE wx_devs SET units = ?2 WHERE user_id = ?1").bind(userId, units)]);
}
export async function devicesOf(env, userId) {
  const { results } = await (await wxdb(env)).prepare("SELECT dev, label FROM wx_devs WHERE user_id = ? ORDER BY created").bind(userId).all();
  return results.map((d) => ({ id: d.dev, label: d.label || "A device" }));
}

// A device's notifications: { sub: { endpoint, keys: { p256dh, auth } }, places: [{ lat, lon, name, rain, warn }],
// brief: { lat, lon, name } | null, briefAt: "07:00", units: {...}, was?: the endpoint before } (or, from an app from
// before, one place: { place, rain, warn, brief }). user: the account the browser's signed in to on the site, if it
// is (functions/_account.js): then it's the account's choices this device gets (account: its notify), and this device is
// one of the account's; label: what to call it ("iPhone · Safari"); net: a hash of the network it's asked from
export async function subscribe(env, b, user = null, account = null, label = "", net = null) {
  const s = await checkSub(b.sub), w = wantOf(user ? account || {} : b), units = unitsOf(b.units);
  const D = await wxdb(env), dev = await idOf(s.endpoint), t = Date.now();
  // the browser gave this device a new push address: its places move over from the old one (no need to say hello again)
  const was = typeof b.was === "string" && b.was.length <= 1000 && b.was !== s.endpoint ? await idOf(b.was) : null;
  if (was) await moveDev(D, was, s, dev, t);
  // (signed out with nothing wanted: forgotten)
  if (!user && !wanted(w)) { await D.batch([D.prepare("DELETE FROM wx_subs WHERE dev = ?").bind(dev), D.prepare("DELETE FROM wx_devs WHERE dev = ?").bind(dev)]); return { ok: true, on: false }; }
  let dv = await D.prepare("SELECT * FROM wx_devs WHERE dev = ?").bind(dev).first();
  if (!dv) {
    // (anyone can turn them on, signed in or not: so a device that isn't is held to what one network turns on in a day,
    // and to a share of the whole; a signed-in one only to the whole)
    const full = user ? (await D.prepare("SELECT COUNT(*) AS n FROM wx_devs").first()).n >= MAX_ALL
      : (await D.prepare("SELECT COUNT(*) AS n FROM wx_devs WHERE user_id IS NULL").first()).n >= MAX_SUBS;
    if (full) throw new HttpError(429, "Notifications are full right now.");
    // (WX_NET_DAY: a test server's own number, as its devices all come from one address)
    if (!user && net && (await D.prepare("SELECT COUNT(*) AS n FROM wx_devs WHERE net = ? AND created > ?").bind(net, t - 864e5).first()).n >= (Number(env.WX_NET_DAY) || NET_DAY))
      throw new HttpError(429, "Notifications were turned on for enough devices here today. Try again tomorrow.");
    // a new device: a first notification, to say they're on; it's only kept if that arrives
    const r = await pushToSub(env, s, { title: "Notifications on", body: onText(w, units), tag: "wx-on", ttl: 600, url: w.places[0] ? linkTo(w.places[0].lat, w.places[0].lon, w.places[0].name) : "./" });
    if (r !== "sent") throw new HttpError(400, "This device's notifications couldn't be reached. Try again in a moment.");
    const ins = await D.prepare(`INSERT INTO wx_devs (dev, endpoint, p256dh, auth, user_id, label, units, brief_at, created, updated, net)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9, ?11 WHERE (SELECT COUNT(*) FROM wx_devs) < ?10 ON CONFLICT(dev) DO NOTHING`)
      .bind(dev, s.endpoint, s.p256dh, s.auth, user?.id || null, label || null, units, w.briefAt, t, MAX_ALL, user ? null : net).run();
    if (!ins.meta?.changes && !(await D.prepare("SELECT 1 FROM wx_devs WHERE dev = ?").bind(dev).first())) throw new HttpError(429, "Notifications are full right now.");
  } else {
    await D.prepare("UPDATE wx_devs SET endpoint = ?2, p256dh = ?3, auth = ?4, user_id = ?5, label = COALESCE(?6, label), units = ?7, brief_at = ?8, updated = ?9 WHERE dev = ?1")
      .bind(dev, s.endpoint, s.p256dh, s.auth, user?.id || null, label || null, units, w.briefAt, t).run();
  }
  dv = { dev, endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth, units };
  await setRows(D, dv, w, t);
  return { ok: true, on: true, id: dev };
}
export async function unsubscribe(env, endpoint) {
  if (typeof endpoint !== "string" || endpoint.length > 1000) throw new HttpError(400, "Bad request.");
  const D = await wxdb(env), dev = await idOf(endpoint);
  await D.batch([D.prepare("DELETE FROM wx_subs WHERE dev = ?").bind(dev), D.prepare("DELETE FROM wx_devs WHERE dev = ?").bind(dev)]);
  return { ok: true };
}
// signed out of the account on a device: it keeps what it has, as its own (user: the account it was signed in to)
export async function leaveAccount(env, endpoint, userId) {
  if (typeof endpoint !== "string" || endpoint.length > 1000) return;
  await (await wxdb(env)).prepare("UPDATE wx_devs SET user_id = NULL WHERE dev = ? AND user_id = ?").bind(await idOf(endpoint), userId).run();
}
// A device signed out of its account somewhere else (its push address shows it's this device): its notifications its own
export async function leaveAny(env, endpoint) {
  if (typeof endpoint !== "string" || !endpoint || endpoint.length > 1000) throw new HttpError(400, "Bad request.");
  await (await wxdb(env)).prepare("UPDATE wx_devs SET user_id = NULL WHERE dev = ?").bind(await idOf(endpoint)).run();
  return { ok: true };
}
// the browser replaced a device's subscription by itself (sw.js, pushsubscriptionchange): its places move to the new one
export async function moveSub(env, b) {
  if (typeof b.was !== "string" || b.was.length > 1000) throw new HttpError(400, "Bad request.");
  const s = await checkSub(b.sub), D = await wxdb(env), from = await idOf(b.was), to = await idOf(s.endpoint);
  if (from === to) return { ok: true, moved: false };
  return { ok: true, moved: await moveDev(D, from, s, to, Date.now()) };
}
// An account gone (functions/_accounts.js): what Weather kept with it, and its devices' notifications
export async function dropAccount(env, userId) {
  const D = await wxdb(env);
  await D.batch([
    D.prepare("DELETE FROM wx_subs WHERE dev IN (SELECT dev FROM wx_devs WHERE user_id = ?)").bind(userId),
    D.prepare("DELETE FROM wx_devs WHERE user_id = ?").bind(userId),
    D.prepare("DELETE FROM wx_accts WHERE user_id = ?").bind(userId),
  ]);
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
    // (and devices with nothing left: not signed in, or not heard from in months)
    D.prepare("DELETE FROM wx_devs WHERE (user_id IS NULL OR coalesce(updated, 0) < ?) AND NOT EXISTS (SELECT 1 FROM wx_subs s WHERE s.dev = wx_devs.dev)").bind(t - KEEP_IDLE),
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
  if (r === "gone") { await forget(D, s); out.gone++; }
}
// The places asked about in a tick ([key, { full }] each), within the budget: whole forecasts first, then rain (in a
// shuffled order, so the places left for the next tick aren't always the same ones)
export function budgeted(cells, budget = BUDGET, rnd = Math.random) {
  const order = cells.map((e) => [e, e[1].full ? -1 : rnd()]).sort((a, b) => a[1] - b[1]).map(([e]) => e);
  let spend = 0;
  return order.filter(([, c]) => { const cost = c.full ? COST_FULL : 1; if (spend + cost > budget) return false; spend += cost; return true; });
}
// a device its push service says is gone: all its places, and it
const forget = (D, s) => D.batch([D.prepare("DELETE FROM wx_subs WHERE dev = ?").bind(s.dev || s.id), D.prepare("DELETE FROM wx_devs WHERE dev = ?").bind(s.dev || s.id)]);
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
  if (got.includes("gone")) { await forget(D, s); out.gone++; }
  else if (got.includes("sent")) await D.prepare("UPDATE wx_subs SET fails = 0, last_ok = ?2 WHERE id = ?1").bind(s.id, t).run();
  else if (got.includes("error")) {
    const r = await D.prepare("DELETE FROM wx_subs WHERE id = ?1 AND fails + 1 >= ?2").bind(s.id, MAX_FAILS).run();
    if (r.meta?.changes) out.gone++; else await D.prepare("UPDATE wx_subs SET fails = fails + 1 WHERE id = ?").bind(s.id).run();
  }
}
