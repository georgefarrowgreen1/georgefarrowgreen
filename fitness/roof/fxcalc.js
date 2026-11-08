// What Today needs on its first paint from Fitness's view files (One roof stage 2, §4.3), so Today never waits for a lazy
// file: ported under their own names and checked against them by rooffxcore.test (parity):
//   rhythmSaid() · dayStamp(day) · dayChanges(day, open) (fitness/plan.js :71, :557, :235; open = ctx.open, for "Another
//   day": open.move(day)) · progActs() (progressview.js :14) · rollAvg(arr, n, at) (activities.js :357) ·
//   sessionOf(a) · effortsOf(a, x) · effortFigs(a, x) · FAM (today.js 503-517, which activities.js reads as well).
import { plural, dur, dayName } from "../ui.js";
import { flatten, measure, startOfDay } from "../workouts.js";
import { perSecond } from "../load.js";
import * as R from "../rhythm.js";
import * as E from "../efforts.js";
import { S, TODAY, P, rh, rhDay, rhythmOn, wkById, keep, paceFor, sumOf, once, plannedOn } from "./core.js";
import { toast, redraw } from "./fxui.js";

export const rhythmSaid = () => {
  const r = rh(), b = r.block, ev = r.event;
  if(r.beta)return "Rhythm 2.0 · " + ({balanced:"all-round riding",endurance:"longer rides",threshold:"sustained power",topend:"hard efforts"}[r.objective]||"cycling beta");
  if (ev && ev.days >= 0 && ev.days <= 84) return `${ev.name || R.EVENTS[ev.kind].name} · ${ev.days === 0 ? "today" : ev.days < 14 ? `${plural(ev.days, "day")} to go` : `${plural(Math.round(ev.days / 7), "week")} to go`}`;
  return `${R.THEMES[b.theme]} block · ${b.absorb ? "lighter week" : `week ${b.week + 1} of 4`}`;
};
export const dayStamp = (day) => { const dt = new Date(day); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`; };
// The ways to change a day of Rhythm's, there on its card: shorter, easier, another day, rest; and back to Rhythm's own.
// → [{ key, label, sub, run }]
export function dayChanges(day, open = null) {
  const d = rhDay(day), id = S.swaps[day] !== undefined ? S.swaps[day] : d?.id, w = id ? wkById(id) : null;
  if (!rhythmOn() || day < TODAY) return [];
  const set = (v, said) => { if (v === undefined) delete S.swaps[day]; else S.swaps[day] = v; keep("swaps"); toast(said); redraw("plan"); };
  const mins = d?.mins || 60, kind = /^rh:([a-z0-9]+):/.exec(id || "")?.[1], out = [];
  if (w) {
    const steady = kind === "endurance" || kind === "long" || kind === "recovery";
    const sid = kind ? R.withMins(id, steady ? Math.max(30, Math.round(mins / 2 / 5) * 5) : Math.max(35, mins - 20)) : "recovery-45", sw = wkById(sid);
    const now = measure(w, paceFor(w.sport)).secs, then = sw ? measure(sw, paceFor(sw.sport)).secs : now;
    if (sw && then <= now - 300) out.push({ key: "short", label: "Short on time", sub: `${sw.name}: ${dur(then)} instead of ${dur(now)}`, run: () => set(sid, `${sw.name}: ${dur(then)}`) });
  }
  if (w && d?.hard) out.push({ key: "easier", label: "Easier", sub: "Steady all the way, no hard efforts", run: () => set(`rh:endurance:${Math.min(mins, 90)}`, "Easier") });
  if (w) out.push({ key: "move", label: "Another day", sub: "Swap it with another day this week or next", run: () => open?.move(day) });
  if (w) out.push({ key: "rest", label: "Rest", sub: S.rhythm?.engine===2?"The plan adapts to what you actually ride":"Rhythm makes up for it later in the week", run: () => set(null, day === TODAY ? "Rest today" : `Rest on ${dayName(day)}`) });
  if (S.swaps[day] !== undefined) out.push({ key: "undo", label: "Undo the change", sub: "Back to Rhythm’s plan", run: () => set(undefined, "Back to Rhythm’s plan") });
  return out;
}
export const progActs = once(() => S.own.map((a) => { const s = sumOf(a) || a.sum; return { id: a.id, name: a.name, start: a.start, sport: a.sport, sum: s && { ...s, zones: s.zones || a.sum?.zones, hrZones: s.hrZones || a.sum?.hrZones } }; }).filter((a) => a.sum));
export const rollAvg = (arr, n, at = null) => {
  if (at != null) { let t = 0, c = 0; for (let j = Math.max(0, at - n + 1); j <= at; j++) if (Number.isFinite(arr[j])) { t += arr[j]; c++; } return c ? t / c : null; }
  const out = new Float64Array(arr.length); let t = 0;
  for (let i = 0; i < arr.length; i++) { t += Number.isFinite(arr[i]) ? arr[i] : 0; if (i >= n) t -= Number.isFinite(arr[i - n]) ? arr[i - n] : 0; out[i] = t / Math.min(i + 1, n); }
  return out;
};
// The efforts of a ride against the session it was for (today.js 503-517): the session planned on its day, of its
// sport (rides, with power)
export const sessionOf = (a) => { if (a.sport !== "ride") return null; const id = a.workout || plannedOn(startOfDay(a.start)), w = id && id !== "event" ? wkById(id) : null; return w?.sport === "ride" ? w : null; };
export const effortsOf = (a, x) => { const w = sessionOf(a); return w && x ? E.efforts(flatten(w, paceFor("ride")), perSecond(x).pwr, P().ftp) : null; };
export const FAM = { vo2: 1, thirty: 4, threshold: 2 };
export function effortFigs(a, x) {
  const w = sessionOf(a), e = w && effortsOf(a, x);
  if (!e?.n) return {};
  return { efforts: e.n, held: e.held, effortPct: Math.round(e.ratio * 1000) / 10, effFtp: Math.round((e.target / P().ftp) * 1000), effFam: FAM[String(w.id).split(":")[1]] || 0, faded: e.faded };
}
