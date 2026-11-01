// InFlite Today's Fitness card: today's session as Fitness planned it (the days it last sent: functions/_fittoday.js),
// whether it's done (what's been ridden today, and what's waiting from Garmin or Strava, by your own day), and its best
// time to ride (functions/_fitwx.js rideWeather, fitness/besttime.js bestWindow). Starting, skipping, moving or logging
// a session are Fitness's own: the card opens it.

import { snapshotOf } from "./_fittoday.js";
import { fitdb } from "./_fitness.js";
import { rideWeather } from "./_fitwx.js";
import { kept } from "./_wxacct.js";
import { localDay, dayAfter, weekdayOf } from "./_todaycards.js";
import { bestWindow, hourScore, ratingOf, windWords, LIMITS } from "../fitness/besttime.js";
import { dur } from "../fitness/ui.js";

// what Fitness sent is good this long (its eight days: today's and the week ahead's)
const DAY = 864e5, FRESH = 8 * DAY;
// how far ahead a rest day looks for the next session
const NEXT_DAYS = 3;
const pad = (n) => String(n).padStart(2, "0");
// (a done thing's verb, by its sport; "Rode" for a ride, as the line's said)
const DID = { ride: "Rode", run: "Ran", swim: "Swam", walk: "Walked", row: "Rowed" };
const OUT_ON = new Set(["ride", "run", "swim", "walk", "row"]);

// ctx: functions/_todaycards.js cardsFor's
export async function fitnessCard(env, u, ctx) {
  const { t, tz, links, memo, request } = ctx, href = `${links.fitness}/#today`;
  const snap = await snapshotOf(env, u.id), fresh = !!snap && Number(snap.at) >= t - FRESH && !!snap.days && typeof snap.days === "object";
  // the day: the account's own (as the morning has it), where Fitness sent that day; else the phone's, by its zone
  const byTz = localDay(tz, t);
  let day = byTz, zone = tz;
  if (fresh && !snap.days[byTz.day]) { zone = snap.tz; day = localDay(snap.tz, t); }
  const today = fresh ? snap.days[day.day] : undefined;

  // done, whatever was planned: anything started today, in Fitness, or waiting to come in from Garmin or Strava (their
  // tables may not be made yet)
  const D = await fitdb(env), win = [u.id, day.start, day.end];
  const [acts, garmin, strava] = await Promise.all([
    D.prepare("SELECT id, start, sport, name, sum FROM fx_acts WHERE user_id = ?1 AND start >= ?2 AND start < ?3 ORDER BY start DESC LIMIT 5").bind(...win).all().then((r) => r.results || []),
    D.prepare("SELECT id, start, name FROM fx_garmin_new WHERE user_id = ?1 AND start >= ?2 AND start < ?3 ORDER BY start DESC LIMIT 5").bind(...win).all().then((r) => r.results || []).catch(() => []),
    D.prepare("SELECT id, start, name, sport FROM fx_strava_new WHERE user_id = ?1 AND start >= ?2 AND start < ?3 ORDER BY start DESC LIMIT 5").bind(...win).all().then((r) => r.results || []).catch(() => []),
  ]);
  const sumOf = (s) => { try { const v = JSON.parse(s || "{}"); return v && typeof v === "object" ? v : {}; } catch (_) { return {}; } };
  const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const dones = [
    ...acts.map((a) => { const s = sumOf(a.sum); return { name: a.name || "Activity", sport: a.sport || null, start: a.start, secs: num(s.secs), dist: num(s.dist), tss: num(s.tss), from: "fitness" }; }),
    ...garmin.map((g) => ({ name: g.name || "Activity", sport: null, start: g.start, secs: null, dist: null, tss: null, from: "garmin" })),
    ...strava.map((a) => ({ name: a.name || "Activity", sport: a.sport || null, start: a.start, secs: null, dist: null, tss: null, from: "strava" })),
  ].sort((a, b) => b.start - a.start);
  const done = dones[0] || null;

  if (!done && !today) return { state: "empty", href, said: "Open Fitness, and today’s session shows here.", action: { label: "Open Fitness", href } };

  const session = today?.state === "session" ? {
    id: String(today.id || ""), sport: today.sport || "ride", name: String(today.name || ""), kind: String(today.kind || ""), secs: num(today.secs) ?? 0, tss: num(today.tss) ?? 0,
    hard: today.hard === true, why: String(today.why || ""), steps: Array.isArray(today.steps) ? today.steps : [],
  } : null;
  // a session on one of the days after today, from what Fitness sent: { day, label, name, secs, kind }
  const sessionOn = (k, n) => { const x = fresh && snap.days[k]; return x?.state === "session" ? { day: k, label: n === 1 ? "Tomorrow" : weekdayOf(k), name: String(x.name || ""), secs: num(x.secs) ?? 0, kind: String(x.kind || "") } : null; };
  const nextIn = (most) => { for (let n = 1; n <= most; n++) { const s = sessionOn(dayAfter(day.day, n), n); if (s) return s; } return null; };
  const kind = done ? "done" : today.state === "none" ? "none" : ["session", "rest", "event"].includes(today.state) ? today.state : "none";
  const out = {
    state: "ok", href, day: day.day, tz: zone, kind,
    session: kind === "done" || kind === "session" ? session : null,
    done, best: null,
    next: kind === "done" ? sessionOn(dayAfter(day.day, 1), 1) : kind === "rest" || kind === "none" ? nextIn(NEXT_DAYS) : null,
    event: kind === "event" ? { name: String(today.name || "Your event") } : null,
    units: snap?.units === "imperial" ? "imperial" : "metric",
    snapshotAt: snap ? snap.at : null,
    share: null,
  };
  // the best time for a ride or a run that isn't done, from the weather where you ride (shared by the morning's
  // accounts riding in the same place: memo "ride:<lat>,<lon>")
  if (kind === "session" && (session.sport === "ride" || session.sport === "run")) out.best = await bestOf(env, u, session, t, out.units, memo, request).catch(() => null);
  if (kind === "done") {
    const s = out.session, verb = s && DID[s.sport];
    out.share = s && verb ? `${verb} my ${s.kind ? `${s.kind.toLowerCase()} ` : ""}session today: ${s.name}.` : OUT_ON.has(done.sport) ? `Out on a ${done.sport} today.` : "Trained today.";
  } else if (kind === "rest") out.share = "A rest day today, letting the week sink in.";
  else if (kind === "event") out.share = `Event day today: ${out.event.name}.`;
  else if (kind === "session") out.share = `Today: ${session.name}, ${dur(session.secs)}.${out.best && !out.best.poor ? ` Best time to ${session.sport === "run" ? "run" : "ride"} ${out.best.span.replace("–", " to ")}.` : ""}`;
  return out;
}

// The best stretch today, as Fitness says it (fitness/today.js bestTime): "Best 10:00 to 11:00", "11°, dry, a light
// westerly · London"; or "No good time outside today", "Rain on and off all day: the trainer, perhaps · London". With
// each daylight hour's rating, in the sport's hours. null where there's nowhere to go on, or no daylight left today.
async function bestOf(env, u, session, t, units, memo, request) {
  const saved = memo ? (await kept(env, u.id).catch(() => null))?.data?.places?.[0] : null;
  const k = saved && Number.isFinite(+saved.lat) && Number.isFinite(+saved.lon) ? `ride:${(+saved.lat).toFixed(2)},${(+saved.lon).toFixed(2)}` : null;
  let p = k ? memo.get(k) : undefined;
  if (!p) { p = rideWeather(env, u.id, request || { cf: {} }); if (k) { memo.set(k, p); p.catch(() => {}); } }
  const rw = await p;
  if (!rw?.place || !rw.hours?.length) return null;
  const sport = session.sport === "run" ? "run" : "ride", a = LIMITS[sport];
  const b = bestWindow(rw, { secs: session.secs, now: t, sport });
  if (!b) return null;
  const off = (rw.offset || 0) * 1000, clock = (ms) => { const d = new Date(ms + off); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
  const deg = (c) => (c == null ? "" : units === "imperial" ? `${Math.round(c * 1.8 + 32)}°` : `${Math.round(c)}°`);
  const where = rw.place.name ? ` · ${rw.place.name}` : "", poor = b.rating === "Poor";
  const why = !b.dry || b.pop >= 60 ? "Rain on and off all day" : b.wind > 30 || b.gust > 55 ? "Windy all day" : `${deg(b.temp)} at best`;
  // (each of today's daylight hours in the sport's window, as bestWindow weighs them)
  const local = (ms) => new Date(ms + off), today = local(t).toISOString().slice(0, 10);
  const grid = rw.hours.filter((h) => h.day && local(h.t).toISOString().slice(0, 10) === today && local(h.t).getUTCHours() >= a.from && local(h.t).getUTCHours() + 1 <= a.to)
    .map((h) => ({ t: h.t, rating: ratingOf(hourScore(h, rw.hours.find((x) => x.t === h.t - 3600e3), a)) }));
  return {
    start: b.start, end: b.end, span: `${clock(b.start)}–${clock(b.end)}`, rating: b.rating, poor,
    said: poor ? "No good time outside today" : `Best ${clock(b.start)} to ${clock(b.end)}`,
    sub: poor ? `${why}: the trainer, perhaps${where}` : `${deg(b.temp)}, ${b.dry && b.pop < 30 ? "dry" : `${Math.round(b.pop)}% chance of rain`}, ${windWords(b.wind, b.dir)}${where}`,
    grid,
  };
}
