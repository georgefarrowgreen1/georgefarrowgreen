// Weather's notifications: a heads-up when rain is about to start, a morning
// briefing, and an official warning as it's issued, for the places each phone or computer wants them for (a device:
// wx_devs; each of its places a row of wx_subs, with what's been told there). Signed in to the site's account
// (functions/_account.js), the choices are the account's (functions/_wxacct.js), and every device signed in to it with
// notifications on gets them. Sent with the site's Web Push
// (functions/_notify.js: encrypted to the phone, so the push service sees
// nothing of what it says) and worded by the app's own code (weather/alerts.js),
// so a notification says what the app would.
//
// A tick (workers/ticker, every 5 minutes, and .github/workflows/weather-tick.yml, every 10) looks at each
// place that needs it: rain alerts outside the quiet hours (22:00 to 07:00 there),
// briefings around their time (with any official warnings: functions/_wxwarn.js), and each place's warnings (its
// weather service's feeds, kept a few minutes for all: a warning new, or raised, since the last told). For rain it asks only for the next few hours'
// rain (one small request for every place at once); the whole forecast only
// where a briefing is due; and no more, however often the ticks come, than Open-Meteo's free service
// allows over a day (the rest wait for a later one). Where there's radar, the next
// couple of hours' rain is led by it, as the app's is (functions/_wxradar.js),
// for the places whose rain alerts could go now. Places are kept to two decimal places (about a
// kilometre) and forgotten when notifications are turned off, the phone
// unsubscribes, its push service says it's gone or keeps failing, or nothing's
// been heard of it for four months.
//
// Turning them on sends a first notification ("Notifications on"), and the device
// is only kept if that arrives: so only a real phone or computer can take one of the places.
//
// Signed in, the warnings and the briefing can come by email too (the account's choice, notify.email): the account's
// email is then one more of its devices (dev "mail:" and the account), sent to by email rather than push, from Weather's
// own address (functions/_email.js), and only to an email the account has confirmed. Not rain alerts: an hour's notice
// comes too late by email. The site's sending plan is shared by every app's email, so Weather sends at most WX_MAIL_DAY
// a day (60 unless set), warnings before briefings, and the rest wait.
// Each notification is claimed before it's sent (so a tick that runs over, or
// two at once, can't send it twice) and given back if it doesn't go.
//
// WXAPP_URL: tests only (a stand-in for Open-Meteo).

import { pushEndpointOk, pushToSub, vapid, unsubToken } from "./_notify.js";
import { HttpError, fromB64url, logError, MIN } from "./_pigeon.js";
import { emailBody, emailReady, sendEmail, SITE } from "./_email.js";
import { WEATHER_HOST } from "./_wxapp.js";
import { shapeForecast, forecastQuery, rainQuery } from "../weather/data.js";
import { makeFormat, nowWall, keyOf, parseWall, dayStart } from "../weather/format.js";
import { solarQuery, shapeSolar, sunSpell, FACES, PITCHES } from "../weather/solar.js";
import { rainAlert, briefDue, briefing, warningAlert, isQuiet, RAIN_GAP, briefMail, warningMail } from "../weather/alerts.js";
import { blend } from "../weather/rainmap.js";
import { oneRain } from "../weather/agree.js";
import { warningsAt } from "./_wxwarn.js";
import { radarForTick } from "./_wxradar.js";

// (MAX_SUBS: devices not signed in, at most, and NET_DAY of them a day from one network; MAX_ALL: every device, the
// account's included: accounts are by invite, so theirs aren't held back by anyone else's)
const MAX_SUBS = 300, NET_DAY = 3, MAX_ALL = 2000, PER_TICK = 200, MAX_FAILS = 5, KEEP_IDLE = 120 * 864e5, OBS_DAYS = 46, LEASE = 8 * 60e3;
// (a device's places with notifications: as many as a list of saved places is likely to want)
export const MAX_PLACES = 12;
// what Open-Meteo is asked, in its own measure: a place's rain is one call, its whole forecast about seven (its free
// service allows 10,000 a day: the ticks have OM_DAY a day between them, earned evenly through it, however often they
// come, and at most BUDGET in one; what the quiet hours don't use is kept, up to OM_KEEP, an hour and a half's, for the
// morning's briefings)
const BUDGET = 55, COST_FULL = 7, OM_DAY = 8000, OM_KEEP = 500;
// the places the radar's read for in a tick (each costs a few tiles, shared with any place near it)
const RADAR_PLACES = 40;
// the places whose official warnings are asked for in a tick, at most, how many at once, and none begun once the tick's
// had WARN_MS (inside the 30 seconds a tick the site's traffic starts is given), or once they've had WARN_LEAST, if
// that's later (a slow Open-Meteo, or a morning's many briefings, mustn't leave them no time: still inside the
// schedulers' minute)
const WARN_PLACES = 150, WARN_AT_ONCE = 6, WARN_MS = 20e3, WARN_LEAST = 10e3;
// Weather's emails a day, at most (WX_MAIL_DAY sets another), a briefing only within four-fifths of them
const MAIL_DAY = 60, MAIL = "mail:";
// roofs looked at for the sun coming out a tick, at most; and how long before a sunny spell it's told of
const SUN_PLACES = 20, SUN_AHEAD = 90 * 60e3;
let ready = null;
export async function wxdb(env) {
  if (!env.DB) throw new HttpError(503, "Not set up.");
  if (!ready) ready = (async () => {
    // (the tables made as setup() makes them already, by this or another copy of the server: one look, not a dozen trips)
    if ((await env.DB.prepare("SELECT v FROM wx_meta WHERE k = 'schema_fp'").first().catch(() => null))?.v === SCHEMA_FP) return;
    await setup(env);
    await env.DB.prepare("INSERT OR REPLACE INTO wx_meta (k, v) VALUES ('schema_fp', ?)").bind(SCHEMA_FP).run();
  })().catch((e) => { ready = null; throw e; });
  await ready;
  return env.DB;
}
// The tables and their columns (each step safe to run again). SCHEMA_FP is its own text's fingerprint, so any change
// here has every copy of the server run it once more.
async function setup(env) {
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
    // (solar: the roof there, for the sun coming out on its panels, { faces, pitch, alert }; last_sun: when that was last
    // told of, { day, n, start })
    for (const col of ["fails INTEGER NOT NULL DEFAULT 0", "last_ok INTEGER", "warn INTEGER NOT NULL DEFAULT 0", "told TEXT", "dev TEXT", "solar TEXT", "last_sun TEXT"]) await env.DB.prepare(`ALTER TABLE wx_subs ADD COLUMN ${col}`).run().catch(() => {});
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
    // (sess: the sign-in a signed-in device was made one of the account's with; once that's ended, from anywhere, the
    // device is no longer the account's: unlinkEnded)
    await env.DB.prepare("ALTER TABLE wx_devs ADD COLUMN sess TEXT").run().catch(() => {});
    if (!(await env.DB.prepare("SELECT 1 FROM wx_meta WHERE k = 'devs_v1'").first())) await env.DB.batch([
      env.DB.prepare("UPDATE wx_subs SET dev = id WHERE dev IS NULL"),
      env.DB.prepare(`INSERT OR IGNORE INTO wx_devs (dev, endpoint, p256dh, auth, units, brief_at, created, updated)
        SELECT dev, endpoint, p256dh, auth, units, brief_at, created, updated FROM wx_subs`),
      env.DB.prepare("INSERT OR IGNORE INTO wx_meta (k, v) VALUES ('devs_v1', '1')"),
    ]);
    // (each day's hours at the airport: temperature, dew point, wind and gusts, for tuning more than the highs and lows)
    await env.DB.prepare("ALTER TABLE wx_obs ADD COLUMN hours TEXT").run().catch(() => {});
}
const SCHEMA_FP = (() => { let h = 2166136261; for (const c of setup.toString()) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return "w" + h.toString(36); })();
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const idOf = async (endpoint) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint))).slice(0, 32);
const r2 = (v) => Math.round(v * 100) / 100;
const B64U = /^[A-Za-z0-9_-]+={0,2}$/;
const linkTo = (lat, lon, name) => `./?lat=${lat}&lon=${lon}&name=${encodeURIComponent(name || "")}`;
// "07:00" as the units say a time ("7am")
const atOf = (f, at) => { const [hh, mm] = String(at || "07:00").split(":").map(Number); return f.time(Date.UTC(2000, 0, 1, hh || 0, mm || 0)); };

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
  // (by email too: the warnings, the briefing; signed in only, as the account's)
  const email = { warn: !!b.email?.warn, brief: !!b.email?.brief };
  if (!Array.isArray(b.places) && b.place) {        // (the app from before)
    const p = spotOf(b.place);
    if (!p) throw new HttpError(400, "Bad place.");
    return { places: b.rain || b.warn ? [{ ...p, rain: !!b.rain, warn: !!b.warn }] : [], brief: b.brief ? p : null, briefAt, email };
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
  return { places, brief, briefAt, email };
}
// The roof a device's panels are on (Settings › Solar), made safe: { lat, lon, name, faces, pitch, alert } or null
export function solarWant(v) {
  const p = v && typeof v === "object" && v.on ? spotOf(v) : null;
  return p ? { ...p, faces: FACES.some((x) => x[0] === v.faces) ? v.faces : "S", pitch: PITCHES.includes(v.pitch) ? v.pitch : 35, alert: v.alert !== false } : null;
}
const wanted = (w) => w.places.length > 0 || !!w.brief || !!w.solar?.alert;
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
  // (the panels' place: its roof, for the sun coming out there, and the briefing's line on it)
  if (w.solar) { const { faces, pitch, alert } = w.solar, k = `${w.solar.lat},${w.solar.lon}`; rows.set(k, { rain: false, warn: false, brief: 0, ...w.solar, ...rows.get(k), solar: JSON.stringify({ faces, pitch, alert }) }); }
  const { results: have } = await D.prepare("SELECT id, lat, lon, warn FROM wx_subs WHERE dev = ?").bind(dv.dev).all();
  const steps = [], had = new Map(have.map((h) => [`${h.lat},${h.lon}`, h]));
  for (const [k, h] of had) if (!rows.has(k)) steps.push(D.prepare("DELETE FROM wx_subs WHERE id = ?").bind(h.id));
  for (const [k, r] of rows) {
    const h = had.get(k), rain = r.rain ? 1 : 0, warn = r.warn ? 1 : 0;
    if (h) steps.push(D.prepare(`UPDATE wx_subs SET endpoint = ?2, p256dh = ?3, auth = ?4, name = ?5, rain = ?6, brief = ?7, brief_at = ?8, units = ?9, updated = ?10,
        told = CASE WHEN ?11 = 0 OR warn = 0 THEN NULL ELSE told END, warn = ?11, solar = ?12 WHERE id = ?1`)
      .bind(h.id, dv.endpoint, dv.p256dh, dv.auth, r.name, rain, r.brief, w.briefAt, dv.units, t, warn, r.solar || null));
    else steps.push(D.prepare(`INSERT INTO wx_subs (id, dev, endpoint, p256dh, auth, lat, lon, name, rain, brief, brief_at, units, created, updated, last_ok, warn, solar)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13, ?13, ?14, ?15)`)
      .bind(`${dv.dev}:${k}`, dv.dev, dv.endpoint, dv.p256dh, dv.auth, r.lat, r.lon, r.name, rain, r.brief, w.briefAt, dv.units, t, warn, r.solar || null));
  }
  if (steps.length) await D.batch(steps);
}
// The sunlight on a sub's roof (solar.js), with its place's offset, or null
async function roofSun(env, s) {
  let o = null; try { o = JSON.parse(s.solar); } catch (_) {}
  if (!o) return null;
  const r = await fetch(`${env.WXAPP_URL || "https://api.open-meteo.com"}/v1/forecast?${solarQuery(s.lat, s.lon, o.faces, o.pitch)}`, { signal: AbortSignal.timeout(10000), headers: { Accept: "application/json" } });
  if (!r.ok) return null;
  const j = await r.json();
  return { o, off: j.utc_offset_seconds ?? 0, hours: shapeSolar(j, parseWall) };
}
// The sun coming out on a place's panels: told of up to an hour and a half before a sunny spell (or as one starts), once a
// spell, twice a day at most, outside the quiet hours (last_sun claimed first, so two ticks never both tell it)
async function sunNotify(env, D, s, t, out, origin) {
  const got = await roofSun(env, s);
  if (!got?.o.alert) return;
  const now = nowWall(got.off, t), sp = sunSpell(got.hours, now);
  if (!sp || isQuiet(now) || (sp.on ? now - sp.start > 30 * 60e3 : sp.start - now > SUN_AHEAD)) return;
  let told = {}; try { told = JSON.parse(s.last_sun || "{}") || {}; } catch (_) {}
  const day = keyOf(now);
  if (told.day === day && (told.n >= 2 || told.start === sp.start)) return;
  const next = JSON.stringify({ day, n: told.day === day ? (told.n || 0) + 1 : 1, start: sp.start });
  if (!(await D.prepare("UPDATE wx_subs SET last_sun = ?1 WHERE id = ?2 AND last_sun IS ?3").bind(next, s.id, s.last_sun ?? null).run()).meta?.changes) return;
  let units = {}; try { units = JSON.parse(s.units || "{}"); } catch (_) {}
  const f = makeFormat(units), at = s.name ? `${s.name}: ` : "";
  const r = await pushToSub(env, s, sp.on
    ? { title: "Sun’s out", body: `${at}sunny on your panels now, until about ${f.said(sp.end)}.`, tag: "sun", ttl: 1800, url: linkTo(s.lat, s.lon, s.name) }
    : { title: "Sun’s coming out", body: `${at}sunny on your panels from about ${f.time(sp.start)}, until about ${f.said(sp.end)}.`, tag: "sun", ttl: 3600, url: linkTo(s.lat, s.lon, s.name) });
  if (r === "sent") out.sun = (out.sun || 0) + 1;
  else if (r === "gone") await forget(D, s);
  else await D.prepare("UPDATE wx_subs SET last_sun = ?1 WHERE id = ?2 AND last_sun = ?3").bind(s.last_sun ?? null, s.id, next).run();
}
// A device moved to a new push address by its browser (was: the old one): its places go with it
async function moveDev(D, from, s, to, t) {
  const r = await D.prepare("UPDATE wx_devs SET dev = ?1, endpoint = ?2, p256dh = ?3, auth = ?4, updated = ?5 WHERE dev = ?6 AND NOT EXISTS (SELECT 1 FROM wx_devs WHERE dev = ?1)")
    .bind(to, s.endpoint, s.p256dh, s.auth, t, from).run();
  if (!r.meta?.changes) return false;
  await D.prepare("UPDATE wx_subs SET dev = ?1, id = ?1 || ':' || lat || ',' || lon, endpoint = ?2, p256dh = ?3, auth = ?4, fails = 0 WHERE dev = ?5").bind(to, s.endpoint, s.p256dh, s.auth, from).run();
  return true;
}
// The account's choices (functions/_wxacct.js), for each of its devices, its email among them (settings: the account's
// Weather settings, for the units its emails are in)
export async function applyAccount(env, userId, notify, settings = null) {
  const D = await wxdb(env), w = { ...wantOf(notify), solar: solarWant(settings?.solar) }, t = Date.now();
  await unlinkEnded(D, userId);
  const { results: devs } = await D.prepare(`SELECT * FROM wx_devs WHERE user_id = ? AND dev NOT LIKE '${MAIL}%'`).bind(userId).all();
  for (const dv of devs) await setRows(D, { ...dv }, w, t);
  await setMailDev(D, userId, w, unitsOf(settings), t);
}
// The account's email, as a device: its places with warnings on (if they're to be emailed) and the briefing (if that is),
// never rain alerts; there while either is on
const isMail = (s) => String(s.dev || "").startsWith(MAIL);
export function mailWant(w) {
  const e = w.email || {};
  return { places: e.warn ? w.places.filter((p) => p.warn).map((p) => ({ ...p, rain: false })) : [], brief: e.brief ? w.brief : null, briefAt: w.briefAt };
}
async function setMailDev(D, userId, w, units, t) {
  const dev = MAIL + userId, mw = mailWant(w);
  if (!wanted(mw)) return D.batch([D.prepare("DELETE FROM wx_subs WHERE dev = ?").bind(dev), D.prepare("DELETE FROM wx_devs WHERE dev = ?").bind(dev)]);
  await D.prepare(`INSERT INTO wx_devs (dev, endpoint, p256dh, auth, user_id, label, units, brief_at, created, updated) VALUES (?1, ?1, '', '', ?2, 'Email', ?3, ?4, ?5, ?5)
    ON CONFLICT(dev) DO UPDATE SET user_id = ?2, units = ?3, brief_at = ?4, updated = ?5`).bind(dev, userId, units, mw.briefAt, t).run();
  await setRows(D, { dev, endpoint: dev, p256dh: "", auth: "", units }, mw, t);
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
  // (those whose sign-in has ended let go first, in the same trip)
  const D = await wxdb(env);
  const [, { results }] = await D.batch([ended(D, userId), D.prepare(`SELECT dev, label FROM wx_devs WHERE user_id = ? AND dev NOT LIKE '${MAIL}%' ORDER BY created`).bind(userId)]);
  return results.map((d) => ({ id: d.dev, label: d.label || "A device" }));
}

// A device's notifications: { sub: { endpoint, keys: { p256dh, auth } }, places: [{ lat, lon, name, rain, warn }],
// brief: { lat, lon, name } | null, briefAt: "07:00", units: {...}, was?: the endpoint before } (or, from an app from
// before, one place: { place, rain, warn, brief }). user: the account the browser's signed in to on the site, if it
// is (functions/_account.js): then it's the account's choices this device gets (account: its notify), and this device is
// one of the account's; label: what to call it ("iPhone · Safari"); net: a hash of the network it's asked from
export async function subscribe(env, b, user = null, account = null, label = "", net = null) {
  const s = await checkSub(b.sub), w = { ...wantOf(user ? account || {} : b), solar: solarWant(b.solar) }, units = unitsOf(b.units);
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
    const ins = await D.prepare(`INSERT INTO wx_devs (dev, endpoint, p256dh, auth, user_id, label, units, brief_at, created, updated, net, sess)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9, ?11, ?12 WHERE (SELECT COUNT(*) FROM wx_devs) < ?10 ON CONFLICT(dev) DO NOTHING`)
      .bind(dev, s.endpoint, s.p256dh, s.auth, user?.id || null, label || null, units, w.briefAt, t, MAX_ALL, user ? null : net, user?.sessionHash || null).run();
    if (!ins.meta?.changes && !(await D.prepare("SELECT 1 FROM wx_devs WHERE dev = ?").bind(dev).first())) throw new HttpError(429, "Notifications are full right now.");
  } else {
    await D.prepare("UPDATE wx_devs SET endpoint = ?2, p256dh = ?3, auth = ?4, user_id = ?5, label = COALESCE(?6, label), units = ?7, brief_at = ?8, updated = ?9, sess = ?10 WHERE dev = ?1")
      .bind(dev, s.endpoint, s.p256dh, s.auth, user?.id || null, label || null, units, w.briefAt, t, user?.sessionHash || null).run();
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
  await (await wxdb(env)).prepare("UPDATE wx_devs SET user_id = NULL, sess = NULL WHERE dev = ? AND user_id = ?").bind(await idOf(endpoint), userId).run();
}
// A device signed out of its account somewhere else (its push address shows it's this device): its notifications its own
export async function leaveAny(env, endpoint) {
  if (typeof endpoint !== "string" || !endpoint || endpoint.length > 1000) throw new HttpError(400, "Bad request.");
  await (await wxdb(env)).prepare("UPDATE wx_devs SET user_id = NULL, sess = NULL WHERE dev = ?").bind(await idOf(endpoint)).run();
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

// Devices whose sign-in has ended (signed out, here or from elsewhere; a password changed; ended in Signed-in devices):
// no longer the account's, as if signed out on the device itself. They keep the places they had as their own, but hear
// nothing more of the account (its changes, its places to come), so a phone someone else had signed in is cut off.
// (Signed in again on the phone, the app makes it one of the account's again.) Each tick, and before the account's
// choices go out or its devices are listed (then only the account's: userId, as its devices' index has them; a device
// has a sign-in only while it's the account's).
const ended = (D, userId) => {
  const q = D.prepare(`UPDATE wx_devs SET user_id = NULL, sess = NULL WHERE ${userId ? "user_id = ?1 AND " : ""}sess IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_sessions p WHERE p.hash = wx_devs.sess)`);
  return userId ? q.bind(userId) : q;
};
export async function unlinkEnded(D, userId = null) {
  await ended(D, userId).run();
}

// Ticks are asked for every 5 minutes by schedulers, which can run late (GitHub's by hours): so the site's traffic
// asks too, as InFlight's does (functions/_notify.js maybeTick), when the last one was over 5 minutes ago. (At most a look
// every 20 seconds from one copy of the server.)
let wxLook = 0;
export async function maybeWxTick(env, origin) {
  if (env.WX_TRAFFIC_TICK === "0") return;           // (a test server, which asks for its ticks itself, to count what they do)
  const t = Date.now();
  if (t - wxLook < 20e3) return;
  wxLook = t;
  const D = await wxdb(env);
  await D.prepare("INSERT OR IGNORE INTO wx_meta (k, v) VALUES ('tick_at', '0')").run();
  const r = await D.prepare("UPDATE wx_meta SET v = ?1 WHERE k = 'tick_at' AND CAST(v AS INTEGER) < ?2").bind(String(t), t - 5 * MIN).run();
  if (r.meta?.changes) await wxTick(env, t, origin);
}
// The tick: one at a time (a lease, given back at the end; it lapses by itself if a tick dies part way)
// (origin: where links in its emails go, this site or a test server: functions/_email.js linkOrigin)
export async function wxTick(env, t = Date.now(), origin = SITE) {
  const D = await wxdb(env);
  await D.prepare("INSERT OR IGNORE INTO wx_meta (k, v) VALUES ('tick', '0')").run();
  const lease = await D.prepare("UPDATE wx_meta SET v = ?1 WHERE k = 'tick' AND CAST(v AS INTEGER) < ?2").bind(String(t + LEASE), t).run();
  if (!lease.meta?.changes) return { busy: true };
  let out = null;
  try { return (out = await tick(env, D, t, origin)); }
  catch (e) { await logError(env, "weather tick", e); throw e; }
  finally {
    await D.prepare("UPDATE wx_meta SET v = '0' WHERE k = 'tick'").run().catch(() => {});
    // (when it last ran, how long it took and what it did: Admin warns when it hasn't run lately)
    await D.batch([D.prepare("INSERT OR REPLACE INTO wx_meta (k, v) VALUES ('tick_last', ?)").bind(JSON.stringify({ at: t, ms: Date.now() - t, ok: !!out, ...(out && typeof out === "object" ? { rain: out.rain || 0, brief: out.brief || 0, briefLate: out.briefLate ?? null, sun: out.sun || 0 } : {}) })),
      D.prepare("INSERT OR REPLACE INTO wx_meta (k, v) VALUES ('tick_at', ?)").bind(String(t))]).catch(() => {});
  }
}
async function tick(env, D, t, origin) {
  await unlinkEnded(D);
  // once a day, at the first tick after 03:00 UTC: airport reports older than six weeks, phones gone quiet for months
  // (an account's email isn't a phone: it's there while the account wants it), and the count of emails from days gone
  const at = new Date(t);
  if (at.getUTCHours() === 3 && at.getUTCMinutes() < 10) await D.batch([
    D.prepare("DELETE FROM wx_obs WHERE day < ?").bind(new Date(t - OBS_DAYS * 864e5).toISOString().slice(0, 10)),
    D.prepare(`DELETE FROM wx_subs WHERE max(coalesce(updated, 0), coalesce(last_ok, 0)) < ? AND dev NOT LIKE '${MAIL}%'`).bind(t - KEEP_IDLE),
    D.prepare("DELETE FROM wx_meta WHERE k LIKE 'mails:%' AND k < ?").bind(dayCount(t - 2 * 864e5)),
    // (and devices with nothing left: not signed in, or not heard from in months)
    D.prepare("DELETE FROM wx_devs WHERE (user_id IS NULL OR coalesce(updated, 0) < ?) AND NOT EXISTS (SELECT 1 FROM wx_subs s WHERE s.dev = wx_devs.dev)").bind(t - KEEP_IDLE),
  ]);
  const { results: subs } = await D.prepare("SELECT * FROM wx_subs WHERE rain = 1 OR brief = 1 OR warn = 1 OR solar IS NOT NULL").all();
  const local = (s) => t + (s.tz_off || 0) * 1000, due = (s) => !!s.brief && briefDue(local(s), s.brief_at, s.last_brief);
  const need = toLook(subs, t);
  // places a few kilometres apart share a forecast (0.05°); the whole of it only where a briefing's due (or the clock's not known yet)
  const snap = (v) => Math.round(v * 20) / 20, cellOf = (s) => `${snap(s.lat)},${snap(s.lon)}`;
  const cells = new Map();
  for (const s of need) { const k = cellOf(s), c = cells.get(k) || { lat: snap(s.lat), lon: snap(s.lon), full: false }; c.full ||= due(s) || s.tz_off == null; cells.set(k, c); }
  // (what's left of Open-Meteo's allowance, kept between ticks: they run one at a time)
  let left = null; try { left = JSON.parse((await D.prepare("SELECT v FROM wx_meta WHERE k = 'om_bucket'").first())?.v); } catch (_) {}
  const have = allowance(left, t), asked = budgeted([...cells], Math.floor(Math.min(have, BUDGET))), cost = asked.reduce((a, [, c]) => a + (c.full ? COST_FULL : 1), 0);
  if (cost) await D.prepare("INSERT OR REPLACE INTO wx_meta (k, v) VALUES ('om_bucket', ?)").bind(JSON.stringify({ n: have - cost, at: t })).run();
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
  // in its quiet hours, nor within three hours of the last) or whose briefing's due, and whose forecast came: read all
  // at once, while the phones are gone through
  const radar = radarForTick(env, t), rains = new Map(), spot = (s) => `${s.lat},${s.lon}`;
  const could = (s) => s.rain && (s.tz_off == null || !isQuiet(local(s))) && !(s.last_rain && t - s.last_rain < RAIN_GAP);
  for (const s of need) if (rains.size < RADAR_PLACES && forecasts.has(cellOf(s)) && !rains.has(spot(s)) && (could(s) || due(s))) rains.set(spot(s), radar.at(s.lat, s.lon));
  const out = { subs: subs.length, looked: need.length, places: cells.size, asked: asked.length, radar: rains.size, rain: 0, brief: 0, warn: 0, gone: 0 };
  for (const s of need) {
    // (one phone's trouble doesn't stop the others')
    try { await notify(env, D, s, forecasts.get(cellOf(s)), t, out, await rains.get(spot(s)), origin); } catch (e) { console.error("weather tick:", e && e.message); }
  }
  // official warnings, every tick, for each place that wants them (warningsFor), and sent from those looked at
  const warned = await warningsFor(subs, (s) => warningsAt(env, s.lat, s.lon, t).then((r) => r.warnings), t);
  out.warnPlaces = warned.size;
  for (const s of subs) {
    if (!s.warn || s.tz_off == null || !warned.has(spot(s))) continue;
    try { await warnNotify(env, D, s, t, out, warned, origin); } catch (e) { console.error("weather tick: warnings", e && e.message); }
  }
  // the sun coming out on panels: each roof looked at once a half hour (the first tick in it), outside the quiet hours
  if (new Date(t).getUTCMinutes() % 30 < 5) {
    const roofs = subs.filter((s) => s.solar && !isMail(s) && (s.tz_off == null || !isQuiet(local(s)))).slice(0, SUN_PLACES);
    for (const s of roofs) { try { await sunNotify(env, D, s, t, out, origin); } catch (e) { console.error("weather tick: sun", e && e.message); } }
  }
  return out;
}
// The places a tick looks at (subs: those with anything on): those whose clock isn't known yet, rain alerts outside the
// quiet hours there, briefings due. Briefings first (they're kept to their time), and only so many a tick: the rest wait
// for a later tick, in a different order each time (so the same ones aren't always left out)
export function toLook(subs, t, most = PER_TICK, rnd = Math.random) {
  const local = (s) => t + (s.tz_off || 0) * 1000, due = (s) => !!s.brief && briefDue(local(s), s.brief_at, s.last_brief);
  return subs.filter((s) => s.tz_off == null || (s.rain && !isQuiet(local(s))) || due(s))
    .map((s) => [s, due(s) ? -1 : rnd()]).sort((a, b) => a[1] - b[1]).map(([s]) => s).slice(0, most);
}
// What's kept of Open-Meteo's allowance for the ticks (left: what the last tick that asked left, { n, at }): that, and
// what's been earned since (OM_DAY a day), up to OM_KEEP; the whole of OM_KEEP the first time. (A tick asks for no more
// than BUDGET of it)
export const allowance = (left, t) => Math.min(OM_KEEP, left && Number.isFinite(left.n) && Number.isFinite(left.at) ? left.n + Math.max(0, t - left.at) * OM_DAY / 864e5 : OM_KEEP);
// Official warnings for the places that want them, once each place's clock is known (for saying when): each place's
// asked for once, however many phones are there, a few at a time; at most WARN_PLACES a tick, and none begun once the
// tick (begun at t) has had WARN_MS, or they've had WARN_LEAST, if that's later. The rest wait for a later tick, in a
// different order each time (nothing's taken as told for them meanwhile). look(s): a place's warnings. → "lat,lon" → its
// warnings (null: not to be had this tick), for those looked at
export async function warningsFor(subs, look, t, most = WARN_PLACES, rnd = Math.random) {
  const places = new Map(), got = new Map(), end = Math.max(t + WARN_MS, Date.now() + WARN_LEAST);
  for (const s of subs) if (s.warn && s.tz_off != null) places.set(`${s.lat},${s.lon}`, s);
  const queue = [...places].map((e) => [e, rnd()]).sort((a, b) => a[1] - b[1]).map(([e]) => e).slice(0, most);
  const ask = async () => { while (queue.length && Date.now() < end) { const [k, s] = queue.shift(); got.set(k, await look(s).catch(() => null)); } };
  // (all of them from the start: a place whose feed is slow, a flood's, holds up only its own)
  await Promise.all(Array.from({ length: WARN_AT_ONCE }, () => ask()));
  return got;
}
// A warning new, or raised, since the last told (alerts.js warningAlert), sent; the record of what's been told kept
// either way (and claimed before it's sent, as the others are, so it can't go twice)
async function warnNotify(env, D, s, t, out, cache, origin) {
  const k = `${s.lat},${s.lon}`;
  if (!cache.has(k)) cache.set(k, warningsAt(env, s.lat, s.lon, t).then((r) => r.warnings).catch(() => null));
  const list = await cache.get(k);
  if (!list) return;          // (not to be had this tick: nothing's taken as told)
  let told = null, units = {};
  try { told = s.told ? JSON.parse(s.told) : null; } catch (_) {}
  try { units = JSON.parse(s.units || "{}"); } catch (_) {}
  const off = s.tz_off || 0, f = makeFormat(units), now = t + off * 1000, { alert, told: next, fresh } = warningAlert(list, told, now, t, f, off, s.name);
  const json = JSON.stringify(next);
  if (!alert) { if (json !== s.told) await D.prepare("UPDATE wx_subs SET told = ?2 WHERE id = ?1").bind(s.id, json).run(); return; }
  if (!(await claim(D, s, "told", json))) return;
  const r = isMail(s) ? await mailOut(env, D, s, t, origin, { kind: "warn", ...warningMail(fresh, now, f, off, s.name) })
    : await pushToSub(env, s, { ...alert, url: linkTo(s.lat, s.lon, s.name), ttl: 6 * 3600, urgency: "high" });
  if (r === "sent") { out.warn++; await D.prepare("UPDATE wx_subs SET fails = 0, last_ok = ?2 WHERE id = ?1").bind(s.id, t).run(); return; }
  if (r === "skip") return;
  await giveBack(D, s, "told", json);
  if (r === "gone") { await forget(D, s); out.gone++; }
}
// The account's email (s: a row of its email's): sent only to an address the account's confirmed (one not yet, or an
// account being deleted: "skip", as if sent), within the day's emails (none left: "held", to be tried again); links in
// it to Weather (as the place), and to turning them off (one tap, or the mail app's own Unsubscribe: RFC 8058).
// m: briefMail's or warningMail's, and its kind. → "sent", "skip", "held", "gone" (no such account) or "error"
async function mailOut(env, D, s, t, origin, m) {
  if (!emailReady(env)) return "held";
  const u = await D.prepare("SELECT id, email, email_ok, delete_at FROM pg_users WHERE id = ?").bind(s.dev.slice(MAIL.length)).first();
  if (!u) return "gone";
  if (!u.email || !u.email_ok || u.delete_at) return "skip";
  if (!(await spend(env, D, t, m.kind))) return "held";
  const app = origin === SITE ? `https://${WEATHER_HOST}` : `${origin}/weather`, api = origin === SITE ? `https://${WEATHER_HOST}/api/weather` : `${origin}/api/weather`;
  const unsub = `${api}/email-off?u=${encodeURIComponent(u.id)}&t=${await unsubToken(env, u.id)}`;
  const url = `${app}/?lat=${s.lat}&lon=${s.lon}&name=${encodeURIComponent(s.name || "")}`;
  // (no address under the button: it only opens Weather; a briefing's picture small, so its rain sits higher)
  const { text, html } = emailBody({ ...m, brand: "weather", origin, unsub, fallback: false, compact: m.kind === "brief", button: { label: m.kind === "warn" ? "See it in Weather" : "See the latest", url } });
  try {
    await sendEmail(env, { brand: "weather", to: u.email, subject: m.subject, text, html, headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } });
    return "sent";
  } catch (e) {
    console.error("weather tick: email", e && e.message);
    await D.prepare("UPDATE wx_meta SET v = CAST(MAX(0, CAST(v AS INTEGER) - 1) AS TEXT) WHERE k = ?").bind(dayCount(t)).run();
    return "error";
  }
}
// One of the day's emails (UTC), if there's one left: a briefing only within four-fifths of them, so warnings still go
const dayCount = (t) => `mails:${new Date(t).toISOString().slice(0, 10)}`;
async function spend(env, D, t, kind) {
  const most = Number(env.WX_MAIL_DAY) || MAIL_DAY, k = dayCount(t);
  await D.prepare("INSERT OR IGNORE INTO wx_meta (k, v) VALUES (?, '0')").bind(k).run();
  return !!(await D.prepare("UPDATE wx_meta SET v = CAST(CAST(v AS INTEGER) + 1 AS TEXT) WHERE k = ? AND CAST(v AS INTEGER) < ?")
    .bind(k, kind === "brief" ? Math.floor(most * 0.8) : most).run()).meta?.changes;
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
async function notify(env, D, s, j, t, out, rain = null, origin = SITE) {
  if (!j) return;
  let wx = shapeForecast(j, { name: s.name, lat: s.lat, lon: s.lon });
  const now = nowWall(wx.place.offset, t);
  if (rain) wx.minutely = blend(wx.minutely, rain.steps, rain.at, wx.place.offset);
  // (its rain one story, as the app tells it: the hours, their pictures and their odds as the next hours have them)
  wx = oneRain(wx, now);
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
      // (an email's: the morning, afternoon and evening drawn with Weather's own pictures, mail/wx-*.png)
      const m = isMail(s) && briefMail(wx, now, f);
      if (m) m.strip = m.strip.map(([part, icon, temp, chance]) => [part, `wx-${icon}`, temp, chance]);
      // (where the panels are, and a sunny spell's to come today: when, in a line of its own; Settings › Solar)
      const sun = s.solar ? await roofSun(env, s).catch(() => null) : null, sp = sun && sunSpell(sun.hours, now, Infinity);
      const sunny = sp && `${f.time(Math.max(sp.start, now))}–${f.said(sp.end)}`;
      if (m && sunny) m.rows.splice(m.rows.findIndex((x) => x[0] === "Sun") + 1 || m.rows.length, 0, ["Solar", `Sunny about ${sunny}`, "sunrise"]);
      const b = !isMail(s) && briefing(wx, now, f);
      if (b && sunny) b.body = `${b.body} Sun on your panels about ${sunny}.`.slice(0, 280);
      const r = !isMail(s) ? await pushToSub(env, s, { ...b, url, ttl: 3 * 3600 })
        : m ? await mailOut(env, D, s, t, origin, { kind: "brief", ...m, footer: `Your morning briefing for ${s.name || "your place"}, at ${atOf(f, s.brief_at)}.` }) : "held";
      got.push(r); if (r !== "sent" && r !== "skip") await giveBack(D, s, "last_brief", key);
      // (and how long after its time it went, the latest a tick sent: kept with the tick's own record, tick_last)
      if (r === "sent") { out.brief++; const [hh, mm] = String(s.brief_at || "07:00").split(":").map(Number); out.briefLate = Math.max(out.briefLate || 0, Math.round((now - dayStart(now) - (hh * 60 + mm) * 60e3) / 60e3)); }
    }
  }
  // gone: forgotten; arrived: all's well; failed: one more strike (five in a row, and it's forgotten; not an email's,
  // which is the account's while it wants it)
  if (got.includes("gone")) { await forget(D, s); out.gone++; }
  else if (got.includes("sent")) await D.prepare("UPDATE wx_subs SET fails = 0, last_ok = ?2 WHERE id = ?1").bind(s.id, t).run();
  else if (got.includes("error") && !isMail(s)) {
    const r = await D.prepare("DELETE FROM wx_subs WHERE id = ?1 AND fails + 1 >= ?2").bind(s.id, MAX_FAILS).run();
    if (r.meta?.changes) out.gone++; else await D.prepare("UPDATE wx_subs SET fails = fails + 1 WHERE id = ?").bind(s.id).run();
  }
}
