// What a notification says, and when one is due: a heads-up when rain is about
// to start, a morning briefing, and an official warning as it's issued. Pure, like insights.js, so the server sends
// exactly what the app would say (functions/_wxpush.js), and it's tested alone.
// Times are the place's wall time (format.js), except `last`, below.

import { nowcast, headline, insights } from "./insights.js";
import { HOUR, DAY, keyOf, dayStart } from "./format.js";
import { inForce, covered, titleOf, badgeOf, spanOf, glyphOf, colourOf } from "./official.js";

export const QUIET = { from: 22, to: 7 };          // no rain alerts overnight
export const RAIN_LEAD = 60;                       // minutes: tell me if it starts within the hour
export const RAIN_GAP = 3 * HOUR;                  // and not again for three hours

export const isQuiet = (now) => { const h = new Date(now).getUTCHours(); return h >= QUIET.from || h < QUIET.to; };

// Rain about to start: { title, body, tag } or null. `sinceLast`: ms since the last rain alert (or null)
export function rainAlert(wx, now, f, sinceLast = null) {
  if (isQuiet(now) || (sinceLast != null && sinceLast < RAIN_GAP)) return null;
  const nc = nowcast(wx, now, f);
  if (!nc || nc.now || nc.startsAt == null) return null;
  const lead = Math.round((nc.startsAt - now) / 60e3);
  if (lead < 0 || lead > RAIN_LEAD || nc.peak < 0.4) return null;     // (a trace isn't worth a buzz)
  const what = nc.kind.replace(/^\w/, (c) => c.toUpperCase());
  return { title: `${what} in ${lead <= 5 ? "a few minutes" : `about ${Math.max(5, Math.round(lead / 5) * 5)} min`}`, body: `${wx.place.name ? `${wx.place.name}: ` : ""}${nc.text}`, tag: "rain" };
}

// Is the morning briefing due? at: "07:00"; lastKey: the date it was last sent ("YYYY-MM-DD")
export function briefDue(now, at = "07:00", lastKey = null) {
  const [hh, mm] = String(at).split(":").map(Number), when = dayStart(now) + ((hh || 0) * 60 + (mm || 0)) * 60e3;
  return now >= when && now < when + 3 * HOUR && lastKey !== keyOf(now);
}

// The morning briefing: the day in a sentence, and what to know about it. Official warnings first (wx.official,
// those in force or starting today: "Met Office: yellow wind warning until 18:00."), then the app's own, less
// those an official one says already
export function briefing(wx, now, f) {
  const d = wx.daily.find((x) => x.key === keyOf(now)), off = wx.place.offset || 0, real = now - off * 1000;
  const official = inForce(wx.official, real).filter((w) => !(Date.parse(w.onset) + off * 1000 >= dayStart(now) + DAY)).slice(0, 2)
    .map((w) => { const b = badgeOf(w); return `${w.issuer}: ${b ? `${b.toLowerCase()} ` : ""}${titleOf(w).toLowerCase()} ${spanOf(w, now, f, off).replace(/^\w/, (c) => c.toLowerCase())}.`; });
  const said = covered(wx.official, real);
  const cards = insights(wx, now, f, {});
  const warn = cards.filter((c) => (c.level === "alert" || c.level === "warn") && !said.has(c.icon)).slice(0, 2).map((c) => c.title);
  const tips = cards.filter((c) => c.id === "umbrella" && c.level === "tip").map((c) => c.act || c.title);
  const head = headline(wx, now, f);
  const title = `${wx.place.name ? `${wx.place.name} · ` : ""}${d ? `${f.temp(d.tmax)} / ${f.temp(d.tmin)}` : "Today"}`;
  const extra = [...official, warn.length ? `${warn.length > 1 ? "Warnings" : "Warning"}: ${warn.map((w) => w.toLowerCase()).join(" and ")}.` : "", ...tips.map((t) => `${t}.`)].filter(Boolean).join(" ");
  return { title, body: `${head}${extra ? ` ${extra}` : ""}`.slice(0, 240), tag: "brief" };
}

// An official warning as it's issued, or raised (yellow to amber, say), for a place: { alert: { title, body, tag } or
// null, told }. list: the place's warnings now (functions/_wxwarn.js); told: those already told of, { id: [level, what,
// until (real ms)] }, or null where none have been looked at yet (warnings just turned on): then those in force now are
// taken as told (the page shows them), and nothing's sent. A warning of something already told of at its level or above
// (the same reissued, or a later one of the same) isn't news. Yellow ones wait out the quiet hours; amber and red don't.
// The worst of those new is said, and how many more there are. now: the place's wall time; real: real time; offset:
// the place's, in seconds
export function warningAlert(list, told, now, real, f, offset = 0, name = "") {
  const live = inForce(list, real), next = {};
  // (what's told of is kept while it's in force, or half a day for one with no end that's no longer listed)
  for (const [id, v] of Object.entries(told || {})) if (Array.isArray(v) && v[2] > real) next[id] = v;
  const until = (w) => (w.open ? real + 12 * HOUR : Date.parse(w.expires));
  if (!told) { for (const w of live) next[w.id] = [w.level, glyphOf(w), until(w)]; return { alert: null, told: next }; }
  const fresh = [];
  for (const w of live) {
    if (!w.id || (w.level || 0) < 2) continue;
    if (next[w.id]) { next[w.id][2] = until(w); continue; }
    const what = glyphOf(w), before = Math.max(0, ...Object.values(next).filter((v) => v[1] === what).map((v) => v[0]));
    if (before >= w.level) { next[w.id] = [w.level, what, until(w)]; continue; }
    if (w.level < 3 && isQuiet(now)) continue;          // (yellow, overnight: in the morning)
    next[w.id] = [w.level, what, until(w)];
    fresh.push({ w, raised: before > 0 });
  }
  if (!fresh.length) return { alert: null, told: next };
  fresh.sort((a, b) => b.w.level - a.w.level);
  const { w, raised } = fresh[0], badge = badgeOf(w), title = titleOf(w);
  const named = badge ? `${badge} ${title.replace(/^\w/, (c) => c.toLowerCase())}` : title;
  // (raised: to a colour, where warnings come in colours; elsewhere its new name says it, a Flood Watch become a Warning)
  const head = raised && badge ? `Raised to ${colourOf(w)}: ${title.replace(/^\w/, (c) => c.toLowerCase())}` : named;
  const more = fresh.length > 1 ? ` (and ${fresh.length - 1} more)` : "";
  const body = `${name ? `${name}: ` : ""}${w.issuer} · ${spanOf(w, now, f, offset)}.${w.headline ? ` ${w.headline}` : ""}${more}`;
  return { alert: { title: head, body: body.length > 240 ? `${body.slice(0, 239).replace(/\s+\S*$/, "")}…` : body, tag: "warn" }, told: next };
}
