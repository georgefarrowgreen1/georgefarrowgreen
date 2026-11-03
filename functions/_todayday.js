// Today's day, version 2 of the answer (Today First, spec §7.1, §7.2): what GET today/cards?v=2 adds to the four
// cards, worked out by functions/_todaycards.js cardsFor when it's asked with { v: 2 }.
//   dayInputs(env, u, t, tz, cards) → the phase engine's inputs (functions/_todayphase.js phaseOf): { dayStart,
//     eveningAt, rides (today's explicit rides only: functions/_fittimes.js explicitRide), dones (functions/_fitshare.js
//     donesIn) }
//   dayFor(env, u, t, cards, { request, tz }) → { v: 2, phase, since, until, timeline, tops, waiting, upcoming, acts,
//     planning?, ride, quiet, apps }, merged into the answer. Never words of a message (waiting names who and when);
//     never an amount (Markets' cards carry percents). The day's plan (functions/_todayacts.js planDay) runs inside
//     env.waitUntil on the first read after dayStart, never awaited, and the answer says planning: true meanwhile.
// The day's walls: dayStart is quiet hours' end where they're on, else the morning notification's time where that's on,
// else 05:00; eveningAt is 19:00, or 5 minutes after the last close of a market you hold where that's later, but no
// later than quiet hours' start. Rides are today's explicit ones (every fx_times row; an fx_offers row added in Fitness,
// or one of Today's kept with a tap), an overlapping offer winning over a time; an auto-added habit ride not yet kept,
// and an agreed plan still new, are Coming Up's rows and the morning's lines, never a phase.
// The acts' overlay: an add undone hides its ride everywhere (Fitness's own plan still shows the swap until Fitness next
// opens), and the Fitness line says what the day was before (a rest day, or nothing planned); a move done shows the
// moved time, which is what the ride's row has.
// tops: a Top for the current phase and each later one today that needs no new data (up to and including riding, whose
// end needs an activity; the evening's once the markets you hold have closed and no ride is still to come):
//   { kind: "plan" | "weather" | "ride" | "done" | "closed", chip, title, lines: [text], stats: [{ label, value, tone? }],
//     buttons: [{ do: "undo" | "take" | "open" | "answer" | "sendto", id?, label, href?, to? }], share?, sendCard?,
//     sendTo?: { id, first, why }, wrote?: [{ id, first, at }] }
// Every word is plain text (the page draws it escaped); every card for Chat is built by the module whose data it is
// (functions/_todaywx.js, _todayfit.js, _todaymkt.js), packed here (pigeon/cards.js packCard), and its line cut by
// shareCut. The links are the hub's own paths (/weather/#radar, /fitness/#today, /chats/#open=…).
import { localDay, dayAfter, weekdayOf, zoneOk, shareCut, withDeadline } from "./_todaycards.js";
import { phaseOf, ridesWithDones, wallAt, DAY_START, EVENING_AT } from "./_todayphase.js";
import { upcomingFor } from "./_todaycoming.js";
import { rideWx } from "./_todayride.js";
import { waitingFor, wroteWhile } from "./_todaychat.js";
import { rideSend, doneSend, ctlOf, loadOf } from "./_todayfit.js";
import { stockSend } from "./_todaymkt.js";
import { actsFor, planned, ruleLevel, planDay } from "./_todayacts.js";
import { timesOf, explicitRide } from "./_fittimes.js";
import { offersFor, donesIn } from "./_fitshare.js";
import { timesFor } from "./_times.js";
import { heldCount } from "./_busy.js";
import { todayPrefs } from "./_today.js";
import { prefsOf } from "./_notify.js";
import { logError } from "./_pigeon.js";
import { packCard } from "../pigeon/cards.js";

const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
// a ride's weather has this long (the cards have had theirs); the holds start this long before a ride (functions/_busy.js)
const WX_MS = 3500, HOLD_EARLY = 10 * MIN;
const NOUN = { ride: "Ride", run: "Run", swim: "Swim", walk: "Walk", row: "Row", strength: "Strength" };

// ---- words ----
const pad = (n) => String(n).padStart(2, "0");
const CLOCK = new Map(), WALL = new Map(), DAYKEY = new Map();
const clockOf = (tz) => CLOCK.get(tz) || CLOCK.set(tz, new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })).get(tz);
const wallOf = (tz) => WALL.get(tz) || WALL.set(tz, new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "numeric", minute: "numeric", hourCycle: "h23" })).get(tz);
const dayOf = (tz) => DAYKEY.get(tz) || DAYKEY.set(tz, new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })).get(tz);
// (a moment's minutes after midnight on the zone's clock)
const wallMins = (tz, ms) => { const p = Object.fromEntries(wallOf(tz).formatToParts(new Date(ms)).map((x) => [x.type, x.value])); return Number(p.hour) * 60 + Number(p.minute); };
const cap1 = (s) => String(s || "").replace(/^\w/, (c) => c.toUpperCase());
const stop = (s) => String(s || "").trim().replace(/[.\s]+$/, "");
const poss = (name) => `${name}’s`;
const andList = (xs) => (xs.length < 2 ? xs.join("") : xs.length === 2 ? `${xs[0]} and ${xs[1]}` : `${xs.slice(0, -1).join(", ")}, and ${xs.at(-1)}`);
const signed = (p) => `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p).toFixed(1)}%`;
const hmOf = (secs) => { const m = Math.round(secs / 60); return `${Math.floor(m / 60)}:${pad(m % 60)}`; };
const distSaid = (m, units) => (units === "imperial" ? `${(m / 1609.344).toFixed(1)} mi` : `${(m / 1000).toFixed(1)} km`);
const distRound = (m, units, long) => (units === "imperial" ? `${Math.round(m / 1609.344)} ${long ? "miles" : "mi"}` : `${Math.round(m / 1000)} km`);
const FROM = { garmin: "From your watch", strava: "From Strava", fitness: "From Fitness" };
const pack = (c) => { try { return c ? packCard(c) : null; } catch (_) { return null; } };
const callOf = (tm) => (tm.kind === "meet" ? "meeting" : "call");
// (who wrote, in a line: "Mira", "Mira and Pat", "Mira and 2 others")
const whoSaid = (list) => { const n = list.map((w) => w.group?.name || w.first || "Someone"); return n.length <= 2 ? andList(n) : `${n[0]} and ${n.length - 1} others`; };

// a promise's answer, or what to use instead where it fails (logged: a fault here is ours to see)
const soft = (env, what, p, or) => Promise.resolve().then(() => p).catch(async (e) => { await logError(env, `today day ${what}`, e); return or; });

// ---- what the day's worked out from ----
async function gather(env, u, t, zone, cards) {
  const today = localDay(zone, t), D = today.day, p = prefsOf(u), quietOn = !!p.quiet && p.quietFrom !== p.quietTo;
  const [row, fxt, offers, times, dones, holdLevel, actDays, isPlanned] = await Promise.all([
    soft(env, "prefs", todayPrefs(env, u.id), null),
    soft(env, "times", timesOf(env, u.id, D, D), []),
    soft(env, "offers", offersFor(env, u.id, { today: true, t }), []),
    soft(env, "agreed", timesFor(env, u.id, today.start, Math.max(today.end, t + DAY), { t }), []),
    soft(env, "dones", donesIn(env, u.id, today.start, t + 1), []),
    soft(env, "hold", ruleLevel(env, u.id, "holdRide"), "do"),
    Promise.all([0, 1, 2, 3].map((n) => soft(env, "acts", actsFor(env, u.id, dayAfter(D, -n)), []))),
    soft(env, "planned", planned(env, u.id, D), true),
  ]);
  // the walls: the day's start, and the evening's
  const dayStart = quietOn ? p.quietTo * 60 : row?.m_on ? row.m_at : DAY_START;
  let eveningAt = EVENING_AT;
  const m = cards?.markets?.state === "ok" ? cards.markets : null;
  const hours = m?.forDay?.hours || (Number.isFinite(m?.market?.closesAt) ? [{ where: "London", open: null, close: m.market.closesAt }] : []);
  for (const h of hours) if (Number.isFinite(h.close) && h.close >= today.start && h.close < today.end) eveningAt = Math.max(eveningAt, wallMins(zone, h.close) + 5);
  if (quietOn && p.quietFrom * 60 > dayStart) eveningAt = Math.min(eveningAt, p.quietFrom * 60);
  // the acts' overlay: the rides an undone add hides
  const acts = actDays[0], allActs = actDays.flat();
  const undone = allActs.filter((a) => a.state === "undone" && (a.kind === "add" || a.rule === "addRide"));
  const hide = new Set(undone.flatMap((a) => [a.now?.id, a.now?.offerId, a.target, String(a.target || "").replace(/^offer:/, "")]).filter((x) => typeof x === "string" && x));
  for (const a of undone) for (const o of offers) if (o.role === "today" && a.now && o.start === a.now.start && o.stop === a.now.stop) hide.add(o.id);
  // today's explicit rides: offers first (an overlapping time gives way to one), then the times set
  const hold = holdLevel !== "quiet", inDay = (ms) => ms >= today.start && ms < today.end;
  const fromOffers = offers.filter((o) => inDay(o.start) && explicitRide(o) && !hide.has(o.id)).map((o) => ({
    start: o.start, stop: o.stop, secs: Number.isFinite(o.secs) ? o.secs : (o.stop - o.start) / 1000, sport: o.sport || "ride", source: "offer", tz: zone, name: o.name || null,
    offerId: o.id, who: o.role !== "today" && o.who ? o.who : null, withId: o.role !== "today" ? o.withId || null : null, hold }));
  const fromTimes = fxt.filter((r) => !fromOffers.some((o) => o.start < r.stop && r.start < o.stop)).map((r) => ({
    start: r.start, stop: r.stop, secs: (r.stop - r.start) / 1000, sport: r.sport || "ride", source: r.source, tz: zone, name: null, offerId: null, who: null, withId: null, hold }));
  const f = cards?.fitness?.state === "ok" && cards.fitness.day === D ? cards.fitness : null;
  const rides = [...fromOffers, ...fromTimes].sort((a, b) => a.start - b.start).map((r) => {
    // (with: a friend agreed to ride then, in Chat)
    const agreed = r.who ? null : offers.find((o) => (o.role === "asked" || o.role === "answered") && o.who && !hide.has(o.id) && o.start < r.stop && r.start < o.stop);
    const name = r.name || (f?.session && f.session.sport === r.sport ? f.session.name : null) || NOUN[r.sport] || "Ride";
    return { ...r, name, who: r.who || agreed?.who || null, withId: r.withId || agreed?.withId || null };
  });
  return { today, D, p, quietOn, row, offers, times, dones, holdLevel, acts, allActs, hide, isPlanned, dayStart, eveningAt, rides, undone };
}

export async function dayInputs(env, u, t, tz, cards) {
  const g = await gather(env, u, t, zoneOk(tz) ? tz : "Europe/London", cards);
  return { dayStart: g.dayStart, eveningAt: g.eveningAt, rides: g.rides, dones: g.dones };
}

export async function dayFor(env, u, t, cards, opts = {}) {
  const zone = zoneOk(opts.tz) ? opts.tz : "Europe/London", hm = (ms) => clockOf(zone).format(new Date(ms));
  const g = await gather(env, u, t, zone, cards), { today, D, rides, dones } = g;
  const ph = phaseOf(t, zone, { dayStart: g.dayStart, eveningAt: g.eveningAt, rides, dones });
  const matched = ridesWithDones(rides, dones);
  const over = (x) => (x.arrival != null ? x.arrival <= t : x.cap <= t);
  const next = matched.find((x) => !over(x)) || null, last = [...matched].reverse().find(over) || null;
  const afterOf = matched.find((x) => x.arrival != null && x.arrival <= t && t < x.arrival + 90 * MIN) || null;

  // the day's plan, once, in the background (never awaited: the habit rule may wait on Open-Meteo)
  const ds0 = wallAt(zone, D, g.dayStart);
  let planning = false;
  if (!g.isPlanned && t >= ds0) { env.waitUntil?.(planDay(env, u, t).catch(() => {})); planning = true; }

  // what the cards need besides: each ride's weather, who's waiting, the held count, who wrote, Fitness's figures
  const doneToday = afterOf?.done || last?.done || dones[0] || null;
  const wantCtl = doneToday && doneToday.from === "fitness" && Number.isFinite(doneToday.tss);
  const [wxs, waiting, held, wrote, load] = await Promise.all([
    Promise.all(matched.map((x) => (over(x) ? null : withDeadline(rideWx(env, u, x.ride, t), WX_MS).catch(() => null)))),
    soft(env, "waiting", waitingFor(env, u, t), []),
    ph.phase === "riding" && next ? soft(env, "held", heldCount(env, u.id, next.ride.start - HOLD_EARLY), 0) : 0,
    afterOf ? soft(env, "wrote", wroteWhile(env, u, afterOf.ride.start, afterOf.arrival), []) : [],
    wantCtl ? soft(env, "load", loadOf(env, u.id, t), []) : [],
  ]);
  const ctl = wantCtl ? ctlOf(load, t, { start: doneToday.start }) : null;
  const wxOf = (x) => (x ? wxs[matched.indexOf(x)] || null : null);

  // the cards for Chat, built where their data lives, and their lines
  const fc = cards?.fitness?.state === "ok" ? cards.fitness : null, units = fc?.units === "imperial" ? "imperial" : "metric";
  const rideCard = (x) => {
    if (!x) return {};
    const r = x.ride, w = wxOf(x), noun = NOUN[r.sport] || "Ride";
    // (a ride with no name of its own is said as itself: "My ride today at 16:20.")
    const share = shareCut(r.who ? `Riding with ${r.who} today at ${hm(r.start)}.` : r.name === noun ? `My ${noun.toLowerCase()} today at ${hm(r.start)}.` : `My ride today: ${r.name} at ${hm(r.start)}.`);
    const card = rideSend(fc, r, t, { say: share, day: D, tz: zone, dry: !!w && !w.hours.some((h) => h.wet), with: r.who ? [r.who] : [] });
    return { share, sendCard: pack(card) };
  };
  // (the next agreed ride with a friend: the after card's Send to them)
  const ahead = g.offers.filter((o) => (o.role === "asked" || o.role === "answered") && o.withId && o.who && ["new", "yes"].includes(o.state) && o.start > t && !g.hide.has(o.id))
    .sort((a, b) => a.start - b.start)[0];
  const sendTo = ahead ? { id: ahead.withId, first: ahead.who, why: `Riding with you ${whenSaid(dayOf(zone).format(new Date(ahead.start)), D)}` } : null;

  const x = { t, zone, hm, D, today, cards, g, ph, matched, next, last, afterOf, doneToday, wxOf, waiting, held, wrote, ctl, units, fc, rideCard, sendTo };
  const forComing = matched.map((m) => ({ start: m.ride.start, stop: m.ride.stop, name: m.ride.name, sport: m.ride.sport, offerId: m.ride.offerId, who: m.ride.who, arrival: m.arrival, cap: m.cap,
    sub: wxOf(m)?.short || "", ...rideCard(m) }));
  const upcoming = upcomingFor(cards, { tz: zone, rides: forComing, offers: g.offers, times: g.times, hide: [...g.hide], tomorrow: ph.phase === "evening" ? cards?.weather?.forDay?.tomorrow || null : null }, t);
  x.upcoming = upcoming;

  // the top cards: the current phase's, and each later one's that needs no new data
  const tops = {}, line = ph.timeline.length > 1 ? ph.timeline.slice(0, -1) : ph.timeline;
  const settled = !matched.some((m) => !over(m)) && !(cards?.markets?.forDay?.hours || []).some((h) => h.close > t);
  for (const [i, e] of line.entries()) {
    if (!tops[e.phase] && (i === 0 || e.phase !== "evening" || settled)) {
      const top = topFor(e.phase, x, i === 0 ? t : e.at);
      if (top) tops[e.phase] = top;
    }
    if (e.phase === "riding") break;
  }
  const r = (next || last)?.ride || null, rm = next || last;
  return {
    v: 2, phase: ph.phase, since: ph.since, until: ph.until, timeline: ph.timeline, tops, waiting, upcoming,
    acts: g.acts.map((a) => ({ id: a.id, rule: a.rule, kind: a.kind, state: a.state, level: a.level, said: a.said, undoUntil: a.undoUntil })),
    ...(planning ? { planning: true } : {}),
    ride: r ? { start: r.start, stop: r.stop, name: r.name, secs: Math.round(r.secs), sport: r.sport, source: r.source, ...(r.who ? { with: [r.who] } : {}), ...(r.withId ? { withId: r.withId } : {}),
      hold: r.hold, ...(rm.arrival != null && rm.arrival <= t ? { doneAt: rm.arrival } : {}) } : null,
    quiet: { on: g.quietOn, from: g.p.quietFrom, to: g.p.quietTo },
    apps: appsOf(x),
  };
}

// "today", "tomorrow", or the weekday ("Thursday")
const whenSaid = (day, today) => (day === today ? "today" : day === dayAfter(today, 1) ? "tomorrow" : weekdayOf(day));

function topFor(phase, x, at) {
  if (phase === "morning") return planTop(x);
  if (phase === "midday") return weatherTop(x, at);
  if (phase === "preride" || phase === "riding") return x.next ? rideTop(x, x.next, phase, at) : null;
  if (phase === "after") return x.afterOf ? doneTop(x, x.afterOf) : null;
  if (phase === "evening") return closedTop(x);
  return null;
}

// (the weather card's temperatures as Weather's settings say them)
const degOf = (x) => x.cards?.weather?.forDay?.deg || ((c) => `${Math.round(c) < 0 ? "−" : ""}${Math.abs(Math.round(c))}°`);
// (the next agreed call or meeting after a moment, today)
const nextTime = (x, after) => x.g.times.filter((tm) => tm.start > after && tm.start < x.today.end).sort((a, b) => a.start - b.start)[0] || null;
// (an act's offer, by its id or its time, among those listed)
const offerOf = (a, offers) => {
  const ids = [a.now?.id, a.now?.offerId, a.target, String(a.target || "").replace(/^offer:/, "")].filter(Boolean);
  return offers.find((o) => ids.includes(o.id)) || offers.find((o) => o.role === "today" && a.now && o.start === a.now.start && o.stop === a.now.stop) || null;
};
const actDay = (x, a) => (Number.isFinite(a.now?.start) ? dayOf(x.zone).format(new Date(a.now.start)) : null);

// ---- morning: the plan, joined up ----
function planTop(x) {
  const { t, hm, cards, g } = x, lines = [], stats = [], buttons = [];
  const w = cards?.weather?.state === "ok" ? cards.weather : null, rain = w ? w.rain : undefined;
  const R = x.next?.ride || null, call = nextTime(x, t);
  // the day in a line: the rain, the ride, the call
  const parts = [];
  if (w && rain !== undefined) parts.push(!rain ? "dry all day" : rain.now ? (rain.end ? `rain until ${hm(rain.end)}` : "rain now") : `rain from ${hm(rain.at)}${Number.isFinite(rain.peak) ? `, heaviest at ${hm(rain.peak)}` : ""}`);
  if (R) parts.push(`your ride at ${hm(R.start)}${call && R.stop <= call.start ? ` before ${poss(call.who)} ${callOf(call)} at ${hm(call.start)}` : ""}`);
  if (call && !(R && R.stop <= call.start)) parts.push(`${poss(call.who)} ${callOf(call)} at ${hm(call.start)}`);
  if (parts.length) lines.push(`Today: ${parts.join(", ")}.`);
  // what Today did or offers today: each at do with Undo, each suggestion with its button
  const weekday = (a) => { const d = actDay(x, a); return d ? weekdayOf(d) : null; };
  let chip = null;
  for (const a of g.acts) {
    const said = stop(a.said);
    if (a.state === "done") {
      if (said) lines.push(`${said}.`);
      if (a.undoUntil > t) buttons.push({ do: "undo", id: a.id, label: a.rule === "moveRide" ? "Undo the Move" : a.rule === "addRide" ? `Undo ${weekday(a) ? `${poss(weekday(a))} Ride` : "the Ride"}` : "Undo" });
      chip = chip || (a.rule === "moveRide" ? "Moved" : a.rule === "addRide" ? "From habit" : "Done");
    } else if (a.state === "offered") {
      if (said) lines.push(`${said}.`);
      const label = a.rule === "moveRide" && Number.isFinite(a.now?.start) ? `Move It to ${hm(a.now.start)}` : a.rule === "addRide" ? `Add ${weekday(a) ? `${poss(weekday(a))} Ride` : "the Ride"}` : a.rule === "rideThen" ? "Ride Then" : "Do It";
      buttons.push({ do: "take", id: a.id, label });
      chip = chip || "A suggestion";
    } else if ((a.state === "taken" || a.state === "kept") && said) lines.push(`${said}.`);
  }
  // a ride from your habit on its day, added and not kept yet: Keep
  for (const o of g.offers) {
    if (o.role !== "today" || o.state !== "yes" || o.taken || g.hide.has(o.id) || !(o.start >= x.today.start && o.start < x.today.end)) continue;
    lines.push(`From your habit: a ride at ${hm(o.start)} today.`);
    const act = g.allActs.find((a) => (a.rule === "addRide" || a.kind === "add") && a.state === "done" && offerOf(a, [o]));
    if (act) buttons.push({ do: "take", id: act.id, label: "Keep" });
  }
  // a ride agreed in Chat today, not added in Fitness yet
  for (const o of g.offers) {
    if ((o.role !== "asked" && o.role !== "answered") || o.state !== "new" || g.hide.has(o.id) || !(o.start > t && o.start < x.today.end)) continue;
    lines.push(`${o.who || "A friend"} agreed a ride at ${hm(o.start)}.`);
    if (!buttons.some((b) => b.label === "Add in Fitness")) buttons.push({ do: "open", label: "Add in Fitness", href: "/fitness/#today" });
  }
  // today's session with no time yet, and its best time
  const fc = x.fc;
  if (!R && fc?.kind === "session" && fc.session) lines.push(`${fc.session.name} today${fc.best && !fc.best.poor ? ` · best ${fc.best.span}` : ""}.`);
  // the markets you hold: when they open, or that they're shut
  const m = cards?.markets?.state === "ok" ? cards.markets : null;
  if (m) {
    const h = (m.forDay?.hours || [])[0];
    if (h && h.open > t) lines.push(`${h.where} opens at ${hm(h.open)}.`);
    else if (h && h.close > t) lines.push(`${h.where} is open until ${hm(h.close)}.`);
    else if (m.market?.shut?.length) lines.push(`${andList(m.market.shut)} shut today.`);
  }
  if (!g.acts.some((a) => a.state === "done" || a.state === "offered")) lines.push("Nothing needed moving.");
  if (w && rain !== undefined) stats.push({ label: "Rain", value: !rain ? "Dry" : rain.now ? "Now" : `From ${hm(rain.at)}` });
  if (R) stats.push({ label: "Ride", value: hm(R.start) });
  if (call) stats.push({ label: cap1(callOf(call)), value: hm(call.start) });
  const send = R ? x.rideCard(x.next) : fc?.share ? { share: fc.share, sendCard: fc.sendCard ?? null } : w ? { share: w.share, sendCard: w.sendCard ?? null } : {};
  return { kind: "plan", chip: chip || "Your day", title: "Your day, joined up", lines, stats, buttons, ...sent(send) };
}
// (share and sendCard, where there's a line to send)
const sent = (s) => (s && s.share ? { share: s.share, sendCard: s.sendCard ?? null } : {});

// ---- midday: the weather you'll ride in (or, with no ride, the day's weather and what's next) ----
function weatherTop(x, at) {
  const { t, hm, cards } = x, w = cards?.weather?.state === "ok" ? cards.weather : null;
  if (!w) return nextTop(x);
  const rain = w.rain || null, lines = [];
  // (now's temperature; for a midday still to come, the hour's from the card's next hours where it has it)
  const hour = at > t ? (w.hours?.list || []).find((h) => h.t <= at && at < h.t + HOUR) : null, temp = hour?.temp || w.now?.temp || "";
  const head = !rain ? "Dry all day" : rain.now ? (Number.isFinite(rain.end) ? `Rain until ${hm(rain.end)}` : "Raining") : `Dry until ${hm(rain.at)}`;
  if (rain && !rain.now) lines.push(`Then rain${Number.isFinite(rain.peak) ? `, heaviest at ${hm(rain.peak)}` : ""}.`);
  else if (rain?.now && Number.isFinite(rain.peak) && rain.peak > at) lines.push(`Heaviest at ${hm(rain.peak)}.`);
  const R = x.next?.ride, wx = x.wxOf(x.next);
  if (R) {
    if (!wx) lines.push(`Your ride at ${hm(R.start)}.`);
    else if (wx.short === "dry throughout") lines.push(`Your ride at ${hm(R.start)} stays dry.`);
    else if (wx.short.startsWith("dry until")) lines.push(`Your ride at ${hm(R.start)} is ${wx.words}.`);
    else lines.push(`Your ride at ${hm(R.start)} catches ${wx.words}.`);
  } else {
    const n = (x.upcoming || []).find((r) => r.id !== "rain" && r.at > at && r.at < x.today.end);
    if (n) lines.push(`Next: ${n.title} at ${hm(n.at)}.`);
  }
  if (w.warning?.said) lines.push(w.warning.said);
  const stats = [{ label: "Now", value: temp }, { label: "Rain", value: !rain ? "Dry" : rain.now ? "Now" : `From ${hm(rain.at)}` }];
  if (rain && Number.isFinite(rain.peak)) stats.push({ label: "Heaviest", value: hm(rain.peak) });
  return { kind: "weather", chip: `${w.place?.name || "Here"} · now`, title: `${temp}${temp ? " · " : ""}${head}`, lines, stats, buttons: [{ do: "open", label: "Radar", href: "/weather/#radar" }], ...sent({ share: w.share, sendCard: w.sendCard }) };
}
// (no weather to go by: what's next today)
function nextTop(x) {
  const rows = (x.upcoming || []).filter((r) => r.at < x.today.end).slice(0, 3);
  return { kind: "plan", chip: "What’s next", title: rows[0] ? `${rows[0].title} at ${x.hm(rows[0].at)}` : "Nothing else today", lines: rows.slice(1).map((r) => `${x.hm(r.at)} ${r.title}`), stats: [], buttons: [] };
}

// ---- preride and riding: the ride ----
function rideTop(x, m, phase, at) {
  const { hm, g } = x, r = m.ride, wx = x.wxOf(m), deg = degOf(x), lines = [], level = g.holdLevel;
  if (wx) lines.push(cap1(`${wx.words}${wx.wind ? `, ${wx.wind}` : ""}`));
  if (phase === "preride" && wx?.jacket) lines.push("A jacket for the first half hour");
  if (r.who) lines.push(`With ${r.who}`);
  const held = phase === "riding" && at <= x.t ? x.held : 0;
  if (phase === "preride") { if (level === "do") lines.push("Messages are held while you ride, except warnings"); else if (level === "suggest") lines.push("App notices are held while you ride"); }
  else if (level !== "quiet") lines.push(held ? `${held} held; warnings still get through` : "Nothing held yet; warnings still get through");
  const after = nextTime(x, r.start);
  if (after) lines.push(r.stop <= after.start ? `Done before ${poss(after.who)} ${callOf(after)} at ${hm(after.start)}` : `${cap1(poss(after.who))} ${callOf(after)} at ${hm(after.start)}`);
  const stats = [{ label: "Time", value: hmOf(r.secs) }];
  if (phase === "preride" && wx?.out != null) stats.push({ label: "Out in", value: deg(wx.out) });
  if (phase === "riding") stats.push({ label: "Held", value: String(held) });
  if (wx?.roads) stats.push(wx.roads === "wet" ? { label: "Roads", value: "Wet", tone: "warn" } : { label: "Roads", value: "Dry" });
  const mins = Math.round((r.start - Math.max(x.t, at)) / MIN);
  const chip = phase === "preride" ? (mins >= 60 ? `At ${hm(r.start)}` : mins > 1 ? `In ${mins} minutes` : "In a minute")
    : level === "do" ? "Riding · messages held" : level === "suggest" ? "Riding · notices held" : "Riding";
  return { kind: "ride", chip, title: phase === "preride" ? `${r.name} at ${hm(r.start)}` : `${r.name} · since ${hm(r.start)}`, lines, stats,
    buttons: [{ do: "open", label: "Radar", href: "/weather/#radar" }, { do: "open", label: "The Session", href: "/fitness/#today" }], ...sent(x.rideCard(m)) };
}

// ---- after: your ride, from what the server has (honest: Stress and Fitness only once Fitness has the ride) ----
function doneTop(x, m) {
  const { t, units, ctl } = x, r = m.ride, d = m.done, lines = [], stats = [], buttons = [];
  const secs = Number.isFinite(d.secs) ? d.secs : null, dist = Number.isFinite(d.dist) ? d.dist : null, figures = ctl && Number.isFinite(d.tss);
  lines.push(FROM[d.from] || "From Fitness");
  if (!figures) lines.push("Stress and fitness once Fitness has it");
  if (x.wrote.length) lines.push(`${whoSaid(x.wrote)} wrote while you rode`);
  if (secs != null) stats.push({ label: "Time", value: hmOf(secs) });
  if (dist != null) stats.push({ label: "Distance", value: distSaid(dist, units) });
  if (figures) {
    stats.push({ label: "Stress", value: String(Math.round(d.tss)) });
    stats.push({ label: "Fitness", value: `${Math.round(ctl.ctl)} ${ctl.ctl >= ctl.was ? "↑" : "↓"}`, tone: ctl.ctl >= ctl.was ? "up" : "down" });
    if (stats.length > 3) stats.shift();
  } else buttons.push({ do: "open", label: "Open Fitness", href: "/fitness/#activities" });
  const w = x.wrote[0];
  if (w) buttons.push({ do: "answer", id: w.id, label: `Answer ${w.group?.name || w.first || "Them"}`, href: `/chats/#open=${w.id}` });
  if (x.sendTo) buttons.push({ do: "sendto", id: x.sendTo.id, to: x.sendTo.id, label: `Send to ${x.sendTo.first}` });
  const share = shareCut(`Done: ${r.name}${secs != null ? `, ${hmOf(secs)}` : ""}${dist != null ? `, ${distSaid(dist, units)}` : ""}.`);
  const card = doneSend(x.fc, r, d, t, { say: share, day: x.D, tz: x.zone });
  return { kind: "done", chip: "Done", title: `${r.name}${secs != null ? ` · ${hmOf(secs)}` : ""}`, lines, stats, buttons, share, sendCard: pack(card),
    ...(x.sendTo ? { sendTo: x.sendTo } : {}), wrote: x.wrote.map((v) => ({ id: v.id, first: v.first, at: v.at, ...(v.group ? { group: v.group } : {}) })) };
}

// ---- evening: the day closed ----
function closedTop(x) {
  const { t, hm, cards, g, units, ctl } = x, lines = [], stats = [], buttons = [], title = [];
  const m = cards?.markets?.state === "ok" ? cards.markets : null, d = x.doneToday, w = cards?.weather?.state === "ok" ? cards.weather : null;
  const alert = m?.forDay?.alerts?.[0] || null;
  if (m?.traded) {
    title.push(m.pct > 0 ? `Up ${Math.abs(m.pct).toFixed(1)}%` : m.pct < 0 ? `Down ${Math.abs(m.pct).toFixed(1)}%` : "Level");
    stats.push({ label: "Portfolio", value: signed(m.pct), ...(m.pct > 0 ? { tone: "up" } : m.pct < 0 ? { tone: "down" } : {}) });
  }
  if (alert) lines.push(`Markets: ${alert.name} finished ${signed(alert.pct)}, past your ${+alert.alert.toFixed(1)}% alert`);
  else if (m?.traded) lines.push(`Markets: ${m.pct > 0 ? "up" : m.pct < 0 ? "down" : "level"}${m.pct ? ` ${Math.abs(m.pct).toFixed(1)}%` : ""} today`);
  else if (m?.market?.shut?.length) lines.push(`Markets: ${andList(m.market.shut)} shut today`);
  if (d) {
    const secs = Number.isFinite(d.secs) ? d.secs : null, dist = Number.isFinite(d.dist) ? d.dist : null, figures = ctl && Number.isFinite(d.tss);
    title.push(dist != null ? distRound(dist, units, true) : secs != null ? hmOf(secs) : "a ride");
    const bits = [secs != null ? hmOf(secs) : "done"];
    lines.push(`Fitness: ${bits[0]}${figures ? `, stress ${Math.round(d.tss)}, fitness ${ctl.ctl >= ctl.was ? "up" : "down"} to ${Math.round(ctl.ctl)}` : "; stress once Fitness has it"}`);
    if (dist != null) stats.push({ label: "Ride", value: distRound(dist, units, false) });
    else if (secs != null) stats.push({ label: "Ride", value: hmOf(secs) });
    if (figures) stats.push({ label: "Fitness", value: `${Math.round(ctl.ctl)} ${ctl.ctl >= ctl.was ? "↑" : "↓"}`, tone: ctl.ctl >= ctl.was ? "up" : "down" });
  } else if (x.fc?.kind === "rest") lines.push("Fitness: a rest day");
  const calls = g.times.filter((tm) => tm.start >= x.today.start && tm.start < x.today.end);
  if (calls[0]) title.push(`${poss(calls[0].who)} ${callOf(calls[0])}`);
  if (x.waiting.length) lines.push(`${andList(x.waiting.map((v) => v.group?.name || v.first))} ${x.waiting.length === 1 ? "is" : "are"} waiting for an answer`);
  const tw = w?.forDay?.tomorrow;
  if (tw) lines.push(`Tomorrow first: ${tw.said} at ${hm(tw.at)}${tw.good ? `, a good morning for a ${tw.good}` : ""}`);
  if (g.quietOn) lines.push(`Quiet hours until ${pad(g.p.quietTo)}:00`);
  if (m) buttons.push({ do: "open", label: "Markets", href: "/markets/#today" });
  if (d) buttons.push({ do: "open", label: "The Ride", href: "/fitness/#activities" });
  // the line to send: the stock past its alert, else the portfolio's percent, else the ride
  let send = {};
  if (alert) {
    const held = (m.forDay?.held || []).find((h) => h.sym === alert.sym), share = shareCut(`${alert.name} finished ${alert.pct > 0 ? "up" : "down"} ${Math.abs(alert.pct).toFixed(1)}% today.`);
    send = { share, sendCard: pack(stockSend({ sym: alert.sym, name: alert.name, pct: alert.pct, day: held?.day || x.D }, t, { finished: true })) };
  } else if (m?.share) send = { share: m.share, sendCard: m.sendCard ?? null };
  else if (d) {
    const share = shareCut(`Done today: ${(x.last?.ride || {}).name || NOUN[d.sport] || "a ride"}${Number.isFinite(d.secs) ? `, ${hmOf(d.secs)}` : ""}.`);
    send = { share, sendCard: pack(doneSend(x.fc, x.last?.ride || null, d, t, { say: share, day: x.D, tz: x.zone })) };
  }
  return { kind: "closed", chip: "The day closed", title: title.length ? cap1(andList(title)) : "A quiet day", lines, stats, buttons, ...sent(send) };
}

// ---- each app's one line, for the Apps view ----
function appsOf(x) {
  const { cards, hm, ph, g } = x, w = cards?.weather?.state === "ok" ? cards.weather : null, m = cards?.markets?.state === "ok" ? cards.markets : null, f = x.fc;
  let weather = null;
  if (w) {
    const rain = w.rain;
    const said = rain?.now ? (Number.isFinite(rain.end) ? `dry by ${hm(rain.end)}` : String(w.now?.label || "rain").toLowerCase()) : Number.isFinite(rain?.at) ? `rain from ${hm(rain.at)}` : ph.phase === "evening" ? "dry tonight" : "dry today";
    weather = `${w.now?.temp || ""}${w.now?.temp ? ", " : ""}${said}`;
  }
  let fitness = null;
  const d = x.doneToday, R = x.next?.ride;
  // (an add undone today: the day as it was before, whatever Fitness's own plan still says)
  const undoneToday = g.undone.find((a) => actDay(x, a) === x.D);
  if (ph.phase === "riding") fitness = "Riding now";
  else if (d) fitness = ph.phase === "evening" && x.ctl && Number.isFinite(d.tss) && Number.isFinite(d.secs) ? `${hmOf(d.secs)}, stress ${Math.round(d.tss)}` : `${(x.last?.ride || x.afterOf?.ride)?.name || f?.session?.name || NOUN[d.sport] || "A ride"} done`;
  else if (ph.phase === "preride" && R) fitness = `${R.name} at ${hm(R.start)}`;
  else if (undoneToday) fitness = undoneToday.was?.planned === "rest" ? "Rest day" : "Nothing planned";
  else if (f?.kind === "session" && f.session) fitness = `${f.session.name} today`;
  else if (f?.kind === "rest") fitness = "Rest day";
  else if (f?.kind === "event" && f.event) fitness = `${f.event.name} today`;
  else if (f) fitness = f.next ? `Next: ${f.next.name}, ${f.next.label === "Tomorrow" ? "tomorrow" : f.next.label}` : "Nothing planned";
  let markets = null;
  if (m) {
    const h = (m.forDay?.hours || [])[0], movers = [m.top, m.low].filter((r) => r && Number.isFinite(r.pct) && r.pct).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
    if (h && h.open > x.t) markets = `Opens at ${hm(h.open)}`;
    else if (m.traded && movers[0]) markets = `${movers[0].name} ${signed(movers[0].pct)}`;
    else if (m.traded) markets = `Portfolio ${signed(m.pct)}`;
    else if (m.market?.shut?.length) markets = `${andList(m.market.shut)} shut today`;
    else markets = "No change yet";
  }
  return { weather, fitness, markets, mail: false };
}
