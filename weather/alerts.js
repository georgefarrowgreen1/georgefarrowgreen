// What a notification says, and when one is due: a heads-up when rain is about
// to start, and a morning briefing. Pure, like insights.js, so the server sends
// exactly what the app would say (functions/_wxpush.js), and it's tested alone.
// Times are the place's wall time (format.js), except `last`, below.

import { nowcast, headline, insights } from "./insights.js";
import { HOUR, DAY, keyOf, dayStart } from "./format.js";
import { inForce, covered, titleOf, badgeOf, spanOf } from "./official.js";

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
  const tips = cards.filter((c) => c.id === "umbrella" && c.level === "tip").map((c) => c.title);
  const head = headline(wx, now, f);
  const title = `${wx.place.name ? `${wx.place.name} · ` : ""}${d ? `${f.temp(d.tmax)} / ${f.temp(d.tmin)}` : "Today"}`;
  const extra = [...official, warn.length ? `${warn.length > 1 ? "Warnings" : "Warning"}: ${warn.map((w) => w.toLowerCase()).join(" and ")}.` : "", ...tips.map((t) => `${t}.`)].filter(Boolean).join(" ");
  return { title, body: `${head}${extra ? ` ${extra}` : ""}`.slice(0, 240), tag: "brief" };
}
