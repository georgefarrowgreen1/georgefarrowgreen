// Today's Coming Up (Today First, spec §7.6): the dated things of the next day, merged from what the answer has already
// worked out (the rain and its heaviest hour, the market's close, the ride, an agreed call, rides offered within three
// days, pigeons landing), asking nothing new of the weather, the markets or Chat. Pure: t is passed in.
//   upcomingFor(cards, extra, t) → [{ at, app, title, sub, href, id, share?, sendCard? }], soonest first, none passed
// cards: the answer's four cards (functions/_todaycards.js cardsFor; the Markets card's hours, held apart on it as
// forDay, where there); extra (functions/_todayday.js dayFor):
//   tz       the account's zone, for the times in the words
//   rides    today's explicit rides: [{ start, stop, name, sport, offerId?, who?, arrival?, cap, sub?, share?, sendCard? }]
//            (sub: the ride's weather in a few words, functions/_todayride.js; arrival: its activity's, where it's in)
//   offers   functions/_fitshare.js offersFor(…, { today: true })'s rows (Today's own and those agreed in Chat)
//   times    functions/_times.js timesFor's rows (agreed calls and meetings, 'yes' only)
//   hide     offer ids not to show (an add undone, functions/_todayday.js's overlay)
//   tomorrow the weather at 07:00 tomorrow ({ at, day, said, good }; the evening's), or null
// Every row is what it says and when, never a word of a message and never a Chat place (a pigeon's row says when it
// left, not where from). Rows with a card worth sending (the rain, the ride) carry share and sendCard. Nothing more than
// 24 hours ahead, but rides offered for the next three days (to the end of Thursday, on a Monday); nothing past, but a ride with nothing in by its cap ("Not in
// yet"), which stays until it's in or the day's done.
import { dayAfter } from "./_todaycards.js";

const HOUR = 3600e3, DAY = 24 * HOUR, AHEAD = DAY, OFFERS_DAYS = 3;
const CLOCK = new Map(), DAYKEY = new Map();
const clock = (tz) => CLOCK.get(tz) || CLOCK.set(tz, new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })).get(tz);
const dayKey = (tz) => DAYKEY.get(tz) || DAYKEY.set(tz, new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })).get(tz);
const zone = (tz) => { try { clock(tz); return tz; } catch (_) { return "Europe/London"; } };
const cap1 = (s) => String(s || "").replace(/^\w/, (c) => c.toUpperCase());
const signed = (p) => `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p).toFixed(1)}%`;
// (the order of rows at the same moment)
const ORDER = { weather: 0, markets: 1, fitness: 2, chat: 3 };

export function upcomingFor(cards, extra, t) {
  const x = extra || {}, tz = zone(x.tz || "Europe/London"), hm = (ms) => clock(tz).format(new Date(ms)), day = (ms) => dayKey(tz).format(new Date(ms));
  const lastDay = dayAfter(day(t), OFFERS_DAYS), rows = [], soon = (at, ahead = AHEAD) => Number.isFinite(at) && at > t && at <= t + ahead;
  const keep = (o) => { const r = { at: o.at, app: o.app, title: o.title, sub: o.sub || "", href: o.href, id: o.id }; if (o.share) r.share = o.share; if (o.sendCard) r.sendCard = o.sendCard; rows.push(r); };

  // the rain reaching the place, and its heaviest hour
  const w = cards?.weather;
  if (w?.state === "ok" && w.rain && !w.rain.now && soon(w.rain.at)) {
    keep({ at: w.rain.at, app: "weather", title: `Rain reaches ${w.place?.name || "you"}`, sub: Number.isFinite(w.rain.peak) ? `Heaviest around ${hm(w.rain.peak)}` : Number.isFinite(w.rain.end) ? `Until about ${hm(w.rain.end)}` : "",
      href: "/weather/#radar", id: "rain", share: w.share, sendCard: w.sendCard });
  }
  // each market you hold closing later today, with the biggest mover there so far (or when it opens)
  const m = cards?.markets;
  if (m?.state === "ok") {
    const hours = m.forDay?.hours || (Number.isFinite(m.market?.closesAt) ? [{ where: "London", open: null, close: m.market.closesAt }] : []);
    const held = m.forDay?.held || null;
    for (const h of hours) {
      if (!soon(h.close)) continue;
      let sub = "";
      if (Number.isFinite(h.open) && h.open > t) sub = `Opens at ${hm(h.open)}`;
      else {
        const there = held ? held.filter((r) => r.where === h.where) : [m.top, m.low].filter(Boolean).map((r) => ({ name: r.name, pct: r.pct }));
        const big = there.filter((r) => Number.isFinite(r.pct) && r.pct).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))[0];
        if (big) sub = `${big.name} ${signed(big.pct)} so far`;
      }
      keep({ at: h.close, app: "markets", title: `${h.where} closes`, sub, href: "/markets/#today", id: h.where === "London" ? "close" : `close:${h.where.toLowerCase().replace(/\s+/g, "-")}` });
    }
  }
  // today's rides: each still to come, with its weather; one with nothing in by its cap, "Not in yet"
  const rides = Array.isArray(x.rides) ? x.rides : [], rideOffers = new Set(rides.map((r) => r.offerId).filter(Boolean));
  rides.forEach((r, i) => {
    // (a ride with no name of its own is just a ride)
    const title = r.who ? `Ride with ${r.who}` : r.name && r.name !== "Ride" ? `Ride: ${r.name}` : "Ride", id = i ? `ride:${r.start}` : "ride";
    if (soon(r.start)) keep({ at: r.start, app: "fitness", title, sub: cap1(r.sub), href: "/fitness/#today", id, share: r.share, sendCard: r.sendCard });
    else if (r.arrival == null && Number.isFinite(r.cap) && r.cap <= t) keep({ at: r.start, app: "fitness", title, sub: "Not in yet", href: "/fitness/#activities", id });
  });
  // calls and meetings agreed in Chat
  for (const tm of Array.isArray(x.times) ? x.times : []) {
    if (!soon(tm.start)) continue;
    keep({ at: tm.start, app: "chat", title: tm.kind === "meet" ? `Meeting ${tm.who || "a friend"}` : `Call with ${tm.who || "a friend"}`, sub: "Agreed in Chat", href: `/chats/#open=${tm.withId}`, id: `time:${tm.id}` });
  }
  // rides offered within three days: agreed with a friend, or Today's own from your habit (added, kept or suggested)
  const hide = new Set(Array.isArray(x.hide) ? x.hide : []);
  for (const o of Array.isArray(x.offers) ? x.offers : []) {
    if (!soon(o.start, Infinity) || day(o.start) > lastDay || hide.has(o.id) || rideOffers.has(o.id) || !["new", "yes"].includes(o.state)) continue;
    let title, sub;
    if (o.role === "today") { title = "Ride"; sub = o.taken ? "Kept, from habit" : o.state === "yes" ? (o.dry ? "From habit, dry" : "From habit") : "Suggested, from habit"; }
    else { title = o.who ? `Ride with ${o.who}` : "Ride"; sub = o.state === "yes" ? (o.dry ? "In Fitness, dry for both" : "In Fitness") : o.dry ? "Dry for both" : "Agreed in Chat"; }
    keep({ at: o.start, app: "fitness", title, sub, href: `/fitness/#day=${day(o.start)}`, id: `offer:${o.id}` });
  }
  // pigeons landing (with pigeons on: the card has none otherwise), and when each left
  const c = cards?.chat, seen = new Set();
  if (c?.state === "ok" && c.pigeons !== false) {
    for (const p of Array.isArray(c.inbound) ? c.inbound : []) {
      if (!soon(p.landsAt) || !p.who?.id) continue;
      const id = seen.has(p.who.id) ? `pigeon:${p.who.id}:${p.landsAt}` : `pigeon:${p.who.id}`;
      seen.add(p.who.id);
      keep({ at: p.landsAt, app: "chat", title: `Pigeon from ${p.who.first || "a friend"} lands`, sub: Number.isFinite(p.sentAt) ? `On its way since ${hm(p.sentAt)}` : "", href: `/chats/#open=${p.who.id}`, id });
    }
  }
  // tomorrow's first: the weather at 07:00 (the evening's)
  const tw = x.tomorrow;
  if (tw && soon(tw.at)) keep({ at: tw.at, app: "weather", title: cap1(tw.said || "Tomorrow"), sub: tw.good ? `A good morning for a ${tw.good}` : `At ${hm(tw.at)}`, href: `/weather/#day=${tw.day || day(tw.at)}`, id: "tomorrow" });

  return rows.sort((a, b) => a.at - b.at || (ORDER[a.app] ?? 9) - (ORDER[b.app] ?? 9) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
