// What a notification says, and when one is due: a heads-up when rain is about
// to start, a morning briefing, and an official warning as it's issued; and the briefing and a warning as emails, with
// more room. Pure, like insights.js, so the server sends exactly what the app would say (functions/_wxpush.js), and
// it's tested alone.
// Times are the place's wall time (format.js), except `last`, below.

import { nowcast, headline, insights, dayParts, phrase, hoursBetween, isWet } from "./insights.js";
import { HOUR, DAY, keyOf, dayStart, compass } from "./format.js";
import { iconOf, isWetCode, isSnowCode, HEAVY_MMH } from "./codes.js";
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
// null, told, fresh (those new or raised, worst first: [{ w, was (the level told of before, or 0) }]) }. list: the place's warnings now (functions/_wxwarn.js); told: those already told of, { id: [level, what,
// until (real ms)] }, or null where none have been looked at yet (warnings just turned on): then those in force now are
// taken as told (the page shows them), and nothing's sent. A warning of something already told of at its level or above
// (the same reissued, or a later one of the same) isn't news. Yellow ones wait out the quiet hours; amber and red don't.
// The worst of those new is said, and how many more there are. now: the place's wall time; real: real time; offset:
// the place's, in seconds
export function warningAlert(list, told, now, real, f, offset = 0, name = "") {
  const live = inForce(list, real), next = {};
  // (what's told of is kept while it's in force, or at least half a day for one with no end that's no longer listed: to
  // the next 6 hours, so what's kept isn't rewritten every tick)
  for (const [id, v] of Object.entries(told || {})) if (Array.isArray(v) && v[2] > real) next[id] = v;
  const until = (w) => (w.open ? Math.ceil((real + 12 * HOUR) / (6 * HOUR)) * 6 * HOUR : Date.parse(w.expires));
  if (!told) { for (const w of live) next[w.id] = [w.level, glyphOf(w), until(w)]; return { alert: null, told: next, fresh: [] }; }
  const fresh = [];
  for (const w of live) {
    if (!w.id || (w.level || 0) < 2) continue;
    if (next[w.id]) { next[w.id][2] = until(w); continue; }
    const what = glyphOf(w), before = Math.max(0, ...Object.values(next).filter((v) => v[1] === what).map((v) => v[0]));
    if (before >= w.level) { next[w.id] = [w.level, what, until(w)]; continue; }
    if (w.level < 3 && isQuiet(now)) continue;          // (yellow, overnight: in the morning)
    next[w.id] = [w.level, what, until(w)];
    fresh.push({ w, raised: before > 0, was: before });
  }
  if (!fresh.length) return { alert: null, told: next, fresh };
  fresh.sort((a, b) => b.w.level - a.w.level);
  const { w, raised } = fresh[0], badge = badgeOf(w), title = titleOf(w);
  const named = badge ? `${badge} ${title.replace(/^\w/, (c) => c.toLowerCase())}` : title;
  // (raised: to a colour, where warnings come in colours; elsewhere its new name says it, a Flood Watch become a Warning)
  const head = raised && badge ? `Raised to ${colourOf(w)}: ${title.replace(/^\w/, (c) => c.toLowerCase())}` : named;
  const more = fresh.length > 1 ? ` (and ${fresh.length - 1} more)` : "";
  const body = `${name ? `${name}: ` : ""}${w.issuer} · ${spanOf(w, now, f, offset)}.${w.headline ? ` ${w.headline}` : ""}${more}`;
  return { alert: { title: head, body: body.length > 240 ? `${body.slice(0, 239).replace(/\s+\S*$/, "")}…` : body, tag: "warn" }, told: next, fresh };
}

/* ---------- as emails ---------- */
// A warning's tone, for its pictures: yellow, amber (orange too) or red
export const toneOf = (w) => { const c = colourOf(w); return c === "red" ? "red" : c === "yellow" ? "yellow" : "amber"; };
// its name, with its colour where it has one: "Amber wind warning", "Flood Warning"
const named = (w) => { const b = badgeOf(w); return b ? `${b} ${titleOf(w).toLowerCase()}` : titleOf(w); };
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
// (a long text cut at the end of a sentence)
const clip = (s, n) => { s = String(s || "").trim(); if (s.length <= n) return s; const c = s.slice(0, n), end = Math.max(c.lastIndexOf(". "), c.lastIndexOf(".\n")); return end > n / 2 ? c.slice(0, end + 1) : `${c.replace(/\s+\S*$/, "")}…`; };

// The day's rain by the quarter hour from a (wall time) to b: the next hours' quarter hours where there are any (the
// radar's, where it sees), else each hour's rain spread over it (an hour's rain is the hour up to its time)
const Q = 15 * 60e3;
function quarters(wx, a, b) {
  const by = new Map((wx.minutely || []).map((q) => [q.t, q])), out = [];
  for (let t = a; t < b; t += Q) {
    const q = by.get(t);
    if (q) { out.push({ t, mmh: (q.precip || 0) * 4, code: q.code, fine: true }); continue; }
    const h = wx.hourly.find((x) => x.t - HOUR <= t && t < x.t);
    out.push({ t, mmh: h?.precip || 0, code: h?.code ?? 0 });
  }
  return out;
}
const wetQ = (q) => isWetCode(q.code) && q.mmh >= 0.05;
// its wet spells (gaps of half an hour or less bridged): { start, end, peak (mm/h), kind ("light rain", "drizzle"...) }
function wetSpells(qs) {
  const out = [];
  for (const q of qs) {
    if (!wetQ(q)) continue;
    const last = out[out.length - 1];
    if (last && q.t - last.end <= 2 * Q) { last.end = q.t + Q; last.qs.push(q); } else out.push({ start: q.t, end: q.t + Q, qs: [q] });
  }
  return out.map((s) => {
    const peak = Math.max(...s.qs.map((q) => q.mmh)), codes = s.qs.map((q) => q.code);
    const kind = codes.some((c) => c >= 95) ? "thunderstorms" : codes.some(isSnowCode) ? "snow" : codes.every((c) => c >= 51 && c <= 57) ? "drizzle"
      : codes.some((c) => c >= 80 && c <= 82) ? "showers" : peak < 1 ? "light rain" : peak >= 4 ? "heavy rain" : "rain";
    return { start: s.start, end: s.end, peak, kind, fine: s.qs.some((q) => q.fine) };
  });
}
// a spell in words, by the clock: "08:30–09:45", or around a time where it's short
// (the hours' own rain is only as sure as its hour: a spell of one is around a time)
const brief = (s) => s.end - s.start <= (s.fine ? 30 : 60) * 60e3;
const spellTime = (s, f) => (brief(s) ? `around ${f.time(s.start)}` : `${f.time(s.start)}–${f.said(s.end)}`);
// rain levels for the day's bar: 0 dry, 1 a trace or drizzle, 2 light, 3 moderate, 4 heavy
const level = (q) => (!wetQ(q) ? 0 : q.mmh < 0.5 ? 1 : q.mmh < 2 ? 2 : q.mmh < HEAVY_MMH ? 3 : 4);

// The morning briefing as an email: { subject, preheader, title (the day's look), pill (the place and date), lines (the
// day's rain by the clock, the high against yesterday's, and when the forecast was), notice (an official warning in
// force or starting today), strip (the morning, afternoon and evening: [name, icon, high, its rain]), bar (the day's
// rain by the quarter hour, under the strip), rows (the day in figures, tomorrow) } or null. now: the place's wall time.
// wx: one story already (agree.js oneRain), so each part's picture and its rain agree with the lines
export function briefMail(wx, now, f) {
  const di = wx.daily.findIndex((x) => x.key === keyOf(now)), d = wx.daily[di], name = wx.place.name || "", off = wx.place.offset || 0, real = now - off * 1000;
  if (!d) return null;
  const look = phrase(hoursBetween(wx, d.date + 7 * HOUR, d.date + 21 * HOUR)) || "the day ahead";
  const official = inForce(wx.official, real).filter((w) => (w.level || 0) >= 2 && !(Date.parse(w.onset) + off * 1000 >= dayStart(now) + DAY)).sort((a, b) => (b.level || 0) - (a.level || 0));
  const w = official[0], said = covered(wx.official, real);
  const notice = w ? { tone: toneOf(w), lead: named(w), text: `${spanOf(w, now, f, off).replace(/^\w/, (c) => c.toLowerCase())} · ${w.issuer}${official.length > 1 ? ` (and ${official.length - 1} more)` : ""}` } : null;
  // the day's rain, 06:00 to midnight, and its spells from now
  const qs = quarters(wx, d.date + 6 * HOUR, d.date + DAY), spells = wetSpells(qs.filter((q) => q.t + Q > now));
  const parts = dayParts(wx, d.key).filter((p) => p.name !== "overnight");
  const strip = parts.map((p) => {
    const a = p.hours[0].t - HOUR, b = p.hours[p.hours.length - 1].t, s = spells.find((x) => x.end > a && x.start < b), k = s && cap(s.kind.replace(/^light /, ""));
    // (when it starts in this part; or, going on from before it, when it stops)
    const rain = !s ? ((p.pop ?? 0) >= 20 ? `${Math.round(p.pop)}% rain` : "Dry") : s.start > Math.max(a, now) ? `${k} ${f.time(s.start)}` : s.end < b ? `${k} to ${f.said(s.end)}` : k;
    return [cap(p.name), iconOf(p.code, p.isDay), f.temp(p.name === "evening" ? p.tmin : p.tmax), rain];
  });
  const bar = { levels: qs.map(level), labels: [6, 9, 12, 15, 18, 21].map((h) => f.time(d.date + h * HOUR)) };
  // the rain in words: when, by the clock; then the high, against yesterday's
  const mm = qs.filter((q) => q.t + Q > now).reduce((a, q) => a + (wetQ(q) ? q.mmh / 4 : 0), 0), snow = (d.snow ?? 0) >= 0.5;
  const first = spells[0], next = spells[1], late = (s) => s.end >= d.date + DAY;
  const sky = (s) => { const after = !late(s) && phrase(hoursBetween(wx, s.end, s.end + 4 * HOUR).filter((h) => !isWet(h))); return after ? `, then ${after}` : ""; };
  // (a spell: going on now, until when; short, around a time; else from when to when, or on into the night)
  const when = (s) => (s.start <= now ? (late(s) ? "through the day" : `until about ${f.said(s.end)}`) : brief(s) ? spellTime(s, f)
    : late(s) ? `from about ${f.time(s.start)}` : `from about ${f.time(s.start)} to ${f.said(s.end)}`);
  const rainLine = first ? `${cap(first.kind)} ${when(first)}${sky(first)}.` : "Dry all day.";
  const nextLine = next ? ` ${next.kind === "drizzle" && next.peak < 0.5 ? "A little drizzle" : cap(next.kind)} ${spellTime(next, f)}.` : "";
  const y = wx.daily[di - 1], dt = y?.tmax != null && d.tmax != null ? f.tempNum(d.tmax) - f.tempNum(y.tmax) : 0;
  const vs = Math.abs(dt) >= 2 ? `, ${Math.abs(dt)}° ${dt < 0 ? "cooler" : "warmer"} than yesterday` : "";
  const lead = `${rainLine}${nextLine} High ${f.temp(d.tmax)}${vs}.`;
  const wettest = parts.reduce((x, p) => { const r = qs.filter((q) => q.t >= p.hours[0].t - HOUR && q.t < p.hours[p.hours.length - 1].t && wetQ(q)).reduce((a, q) => a + q.mmh / 4, 0); return r > (x?.r ?? 0) ? { p, r } : x; }, null);
  // (dry so far as anyone can say: the parts still to come's best chance, where it's worth saying)
  const odds = Math.max(0, ...parts.filter((p) => p.hours[p.hours.length - 1].t > now).map((p) => p.pop ?? 0));
  const rain = mm >= 0.2 ? `${snow ? `${f.snow(d.snow)} of snow` : f.precip(Math.round(mm * 10) / 10)}${wettest && wettest.r >= mm * 0.5 ? `, mostly ${wettest.p.name}` : ""}`
    : mm > 0 ? "A trace" : odds >= 20 ? `${Math.round(odds)}% chance` : "None expected";
  const own = insights(wx, now, f, {}).filter((c) => (c.level === "alert" || c.level === "warn") && !said.has(c.icon)).slice(0, 2).map((c) => c.title);
  const t = wx.daily[di + 1], tLook = t && phrase(hoursBetween(wx, t.date + 7 * HOUR, t.date + 21 * HOUR));
  const rows = [
    ["High, low", `${f.temp(d.tmax)} · ${f.temp(d.tmin)}`, "temp"],
    [snow ? "Snow" : "Rain", rain, "rain"],
    ...(d.windMax != null ? [["Wind", `${d.dir != null ? `${compass(d.dir)} ` : ""}${d.gustMax != null ? `${f.windNum(d.windMax)}, gusts ${f.wind(d.gustMax)}` : f.wind(d.windMax)}`, "wind"]] : []),
    ...(d.sunrise != null && d.sunset != null ? [["Sun", `Up ${f.time(d.sunrise)} · down ${f.time(d.sunset)}`, "sunrise"]] : []),
    ...(t ? [["Tomorrow", `${f.temp(t.tmax)} · ${f.temp(t.tmin)}${tLook ? `, ${tLook}` : ""}`, "clock"]] : []),
    ...(own.length ? [["Watch for", own.join(" · "), "warn"]] : []),
  ];
  // the subject: a warning first; else when it rains, by the clock; else the day's look
  const what = w ? named(w) : !first ? look
    : `${first.kind} ${first.start <= now ? (late(first) ? "through the day" : `until ${f.said(first.end)}`) : late(first) && !brief(first) ? `from ${f.time(first.start)}` : spellTime(first, f)}${sky(first)}`;
  return { subject: `${name ? `${name}: ` : ""}${what} · ${f.temp(d.tmax)}`, preheader: lead, title: cap(look),
    pill: ["pin", `${name ? `${name} · ` : ""}${f.dayName(now)} ${f.dateLong(now)}`], lines: [lead], asOf: `Forecast at ${f.time(now)}${(wx.minutely || []).some((q) => q.radar) ? ", with the radar" : ""}`,
    notice, strip, bar, rows };
}

// An official warning as an email (fresh: warningAlert's, worst first): the worst, in its issuer's own words, when and
// where, and how many more. { subject, preheader, title, icon (its tile: warn- and its tone), pill, lines, quote, rows,
// footer }. now: the place's
// wall time; offset: its, in seconds
export function warningMail(fresh, now, f, offset = 0, name = "") {
  const { w, was } = fresh[0], title = named(w), more = fresh.length - 1, when = spanOf(w, now, f, offset);
  // (raised: from which colour, where warnings come in colours; elsewhere its new name says it)
  const from = was >= 3 ? (/met office|environment agency/i.test(w.issuer || "") ? "amber" : "orange") : "yellow";
  const lines = [w.headline || `${title}${name ? ` for ${name}` : ""}.`,
    ...(was && badgeOf(w) ? [`Raised from ${from} by the ${w.issuer}.`] : []),
    ...(more ? [`And ${more} more warning${more > 1 ? "s" : ""} here: see ${more > 1 ? "them" : "it"} in Weather.`] : [])];
  return { subject: `${title}${name ? `: ${name}` : ""}${more ? ` (and ${more} more)` : ""}`, preheader: when, title, icon: `warn-${toneOf(w)}`,
    pill: ["pin", name || w.area || w.issuer], lines, quote: w.text ? clip(w.text, 600) : null,
    rows: [["When", when, "clock"], ...(w.area && w.area !== name ? [["Where", w.area, "pin"]] : []), ["Issued by", w.issuer, "warn"]],
    footer: `Official warnings${name ? ` for ${name}` : ""}, as they’re issued.` };
}
