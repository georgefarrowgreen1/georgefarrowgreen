// Today's phase of the day (Today First, spec §7.1): which part of the day it is for an account at t, and the rest of
// its day as a timeline. Pure: it never reads the clock (t is passed in) and asks nothing of anyone; its times are
// walls in the account's zone (tz), worked out with functions/_todaycards.js localDay, offsetAt and dayAfter, which
// handle the clocks changing. The phases, highest first: riding (from the next ride's start until its activity
// arrives, or its cap), preride (40 minutes before a ride), after (90 minutes from an activity's arrival), evening
// (from eveningAt to the next dayStart), morning (dayStart to 11:00), midday (11:00 to eveningAt).
//   phaseOf(t, tz, { dayStart, eveningAt, rides: [{ start, stop, secs, sport, source, withId, who, hold }],
//     dones: [{ start, secs, dist, tss, from }] })
//   → { phase: "morning" | "midday" | "preride" | "riding" | "after" | "evening", since, until (the next boundary
//       known now; null while riding), timeline: [{ phase, at }] }
// dayStart and eveningAt are walls: minutes after midnight on the account's clock (06:00 is 360), the same each day.
// rides are today's explicit rides (functions/_fittimes.js explicitRide: a row that isn't one is left out, so an
// auto-added habit ride not yet kept has no preride); dones are what's come in today, newest or oldest first.
// The timeline is the current phase (at its since), each later one today, and the next dayStart's morning.
// Each ride is matched to the first activity that started at or after 40 minutes before it and before its cap (one
// activity a ride); it arrives at its end (its start and length; with no length, the ride's planned length). A ride
// with no activity by its cap gives way to the clock's phase then, with no after.
//   ridesWithDones(rides, dones) → [{ ride, done, arrival, cap }], soonest first (done and arrival null where none)
//   wallAt(tz, day, mins) → the real moment a day's wall time is in tz (the first, where the clocks go back over it)
import { localDay, offsetAt, dayAfter, zoneOk } from "./_todaycards.js";
import { explicitRide } from "./_fittimes.js";

const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
export const PHASES = ["morning", "midday", "preride", "riding", "after", "evening"];
// how long before a ride preride begins (before-src.html: r.start - 40 * MIN); how long after lasts; the cap
export const PRERIDE_MS = 40 * MIN, AFTER_MS = 90 * MIN, CAP_MS = 2 * HOUR, CAP_MORE_MS = 30 * MIN;
// midday from 11:00; with nothing set, the day from 05:00 and the evening from 19:00
export const NOON = 11 * 60, DAY_START = 5 * 60, EVENING_AT = 19 * 60;
const RANK = { riding: 6, preride: 5, after: 4, evening: 3, morning: 2, midday: 1 };

// (a wall's minutes, whole and within the day; else the default)
const mins = (v, or) => (typeof v === "number" && Number.isFinite(v) ? Math.min(23 * 60 + 59, Math.max(0, Math.round(v))) : or);

export function wallAt(tz, day, m) {
  const [y, mo, d] = day.split("-").map(Number), w = Date.UTC(y, mo - 1, d) + Math.round(m * MIN);
  const c = [w - offsetAt(tz, w - DAY), w - offsetAt(tz, w + DAY)];
  const ok = c.filter((r) => r + offsetAt(tz, r) === w);
  // (a wall the clocks jump over is the moment it would have been at the offset before the jump)
  return ok.length ? Math.min(...ok) : c[0];
}

// a ride's length (s), and its cap: its start and the longer of 2 hours and its length and half an hour
const secsOf = (r) => (Number.isFinite(r.secs) && r.secs > 0 ? r.secs : (r.stop - r.start) / 1000);
export const capOf = (r) => r.start + Math.max(CAP_MS, secsOf(r) * 1000 + CAP_MORE_MS);
const fine = (r) => r && Number.isFinite(r.start) && Number.isFinite(r.stop) && r.stop > r.start;

export function ridesWithDones(rides, dones) {
  // (an offer's row that isn't explicit is left out; a plain ride, with no offer's fields, is one)
  const list = (Array.isArray(rides) ? rides : []).filter((r) => fine(r) && ((r.state == null && r.role == null) || explicitRide(r)))
    .sort((a, b) => a.start - b.start);
  const ins = (Array.isArray(dones) ? dones : []).filter((d) => d && Number.isFinite(d.start)).sort((a, b) => a.start - b.start), used = new Set();
  return list.map((ride) => {
    const cap = capOf(ride), i = ins.findIndex((d, k) => !used.has(k) && d.start >= ride.start - PRERIDE_MS && d.start < cap);
    if (i < 0) return { ride, done: null, arrival: null, cap };
    used.add(i);
    const d = ins[i], secs = Number.isFinite(d.secs) && d.secs > 0 ? d.secs : secsOf(ride);
    return { ride, done: d, arrival: d.start + secs * 1000, cap };
  });
}

export function phaseOf(t, tz, inputs) {
  const zone = zoneOk(tz) ? tz : "Europe/London";
  const ds = mins(inputs?.dayStart, DAY_START);
  // (the evening always after the day's start)
  let ev = mins(inputs?.eveningAt, EVENING_AT);
  if (ev <= ds) ev = Math.min(23 * 60 + 59, ds + 60);
  const D = localDay(zone, t).day, Dm = dayAfter(D, -1), Dp = dayAfter(D, 1);
  const ds0 = wallAt(zone, D, ds), ds1 = wallAt(zone, Dp, ds), ev_1 = wallAt(zone, Dm, ev), ev0 = wallAt(zone, D, ev), noon0 = wallAt(zone, D, NOON);
  const iv = [
    { phase: "evening", from: ev_1, to: ds0 },
    { phase: "morning", from: ds0, to: Math.min(noon0, ev0) },
    { phase: "midday", from: Math.max(noon0, ds0), to: ev0 },
    { phase: "evening", from: ev0, to: ds1 },
    // (tomorrow's morning, only so the timeline can end on it)
    { phase: "morning", from: ds1, to: Math.max(ds1 + HOUR, wallAt(zone, Dp, Math.max(NOON, ds + 60))) },
  ];
  for (const m of ridesWithDones(inputs?.rides, inputs?.dones)) {
    const { ride, arrival, cap } = m;
    if (arrival == null) {
      iv.push({ phase: "preride", from: ride.start - PRERIDE_MS, to: ride.start }, { phase: "riding", from: ride.start, to: cap, open: true });
      continue;
    }
    iv.push({ phase: "preride", from: ride.start - PRERIDE_MS, to: Math.min(ride.start, arrival) });
    if (arrival > ride.start) iv.push({ phase: "riding", from: ride.start, to: arrival });
    iv.push({ phase: "after", from: arrival, to: arrival + AFTER_MS });
  }
  const lo = ev_1, hi = iv[4].to;
  const points = [...new Set(iv.flatMap((x) => [x.from, x.to]).filter((p) => p >= lo && p <= hi))].sort((a, b) => a - b);
  // each stretch between two boundaries is the highest phase holding at its start
  const segs = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i], b = points[i + 1];
    let best = null;
    for (const x of iv) if (x.from <= a && a < x.to && x.to > x.from && (!best || RANK[x.phase] > RANK[best.phase])) best = x;
    if (!best) continue;
    const open = !!best.open && best.to === b, last = segs.at(-1);
    if (last && last.phase === best.phase && last.to === a) { last.to = b; last.open = open; } else segs.push({ phase: best.phase, from: a, to: b, open });
  }
  const k = segs.findIndex((s) => s.from <= t && t < s.to);
  if (k < 0) return { phase: "evening", since: t, until: null, timeline: [{ phase: "evening", at: t }] };
  const now = segs[k], next = t < ds0 ? ds0 : ds1, timeline = [];
  for (let i = k; i < segs.length; i++) {
    timeline.push({ phase: segs[i].phase, at: segs[i].from });
    if (segs[i].from >= next) break;
  }
  return { phase: now.phase, since: now.from, until: now.open ? null : now.to, timeline };
}
