// Today's Coming Up (Today First, spec §7.6): the dated things of the next day, merged from what the answer has already
// worked out (the rain and its heaviest hour, the market's close, the ride, an agreed call, rides offered within three
// days, pigeons landing), asking nothing new of the weather, the markets or Chat. Pure: t is passed in.
//   upcomingFor(cards, extra, t) → [{ at, app, title, sub, href, id, share?, sendCard?, late? }], soonest first, none
//     passed but a ride not in yet (late: true, at its start), which the page keeps until the next answer
// cards: the answer's four cards (functions/_todaycards.js cardsFor; the Markets card's hours, held apart on it as
// forDay, where there); extra (functions/_todayday.js dayFor):
//   tz       the account's zone, for the times in the words
//   rides    today's explicit rides: [{ start, stop, name, sport, offerId?, who?, arrival?, cap, sub?, share?, sendCard? }]
//            (sub: the ride's weather in a few words, functions/_todayride.js; arrival: its activity's, where it's in)
//   offers   functions/_fitshare.js offersFor(…, { today: true })'s rows (Today's own and those agreed in Chat)
//   times    functions/_times.js timesFor's rows (agreed calls and meetings, 'yes' only)
//   hide     offer ids not to show (an add undone, functions/_todayday.js's overlay)
//   tomorrow the weather at 07:00 tomorrow ({ at, day, said, good }; the evening's), or null
//   tripId   the trip the answer shows as a card (functions/_todaymail.js tripFor): its bookings aren't rows as well
// Mail's bookings (the admin's, cards.mail.ahead where Mail's "Trips and bookings" is on: functions/_todaymail.js cardOf)
// starting in the next 24 hours are rows of app "mail", each with Mail's own address for its email (href), and for the
// page's sheet, the booking's id, kind and reference, and Weather on its place that day where it has one (wx).
// Mail on Your Day, stages 2 and 3: a parcel out for delivery today, or due today, is a row too (its window on the right,
// "11–13" / "today", its stage for the page's four-part bar, and the courier's own tracking page), there until its
// window's end (until); a repeating invite's date says how it repeats at its sub's end ("· every other Thursday"), with
// the series' next dates for its sheet.
//   mailWaiting(cards, { tz }, t) → { rows, paid }: Waiting for You's rows from Mail (a bill to pay within 7 days, a
//     renewal within 10, a free trial ending within 2, a return's last day within 3), soonest first, and the bills that
//     paid themselves this week ({ n, pence, said }, or null)
//   moneyFor(cards, { tz }, t) → the Bills sheet (Mail's money and bills in words), or null where Mail's bills are off
// Every row is what it says and when, never a word of a message and never a Chat place (a pigeon's row says when it
// left, not where from). Rows with a card worth sending (the rain, the ride) carry share and sendCard. Nothing more than
// 24 hours ahead, but rides offered for the next three days (to the end of Thursday, on a Monday); nothing past, but a
// ride with nothing in by its cap ("Not in yet", late: true, its at the ride's start, which has passed: the page's tick
// keeps a late row, as it drops every other row whose time has come), which stays until it's in or the day's done.
import { dayAfter, localDay } from "./_todaycards.js";

const HOUR = 3600e3, DAY = 24 * HOUR, AHEAD = DAY, OFFERS_DAYS = 3;
const CLOCK = new Map(), DAYKEY = new Map();
const clock = (tz) => CLOCK.get(tz) || CLOCK.set(tz, new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })).get(tz);
const dayKey = (tz) => DAYKEY.get(tz) || DAYKEY.set(tz, new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })).get(tz);
const zone = (tz) => { try { clock(tz); return tz; } catch (_) { return "Europe/London"; } };
const cap1 = (s) => String(s || "").replace(/^\w/, (c) => c.toUpperCase());
const signed = (p) => `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p).toFixed(1)}%`;
// (the order of rows at the same moment)
const ORDER = { weather: 0, markets: 1, fitness: 2, chat: 3, mail: 4 };
// (Weather on a place, on a day: its own address for a place, ?lat=&lon=&name=, and the day, #day=)
export const weatherAt = (p, day) => `/weather/?lat=${p.lat}&lon=${p.lon}&name=${encodeURIComponent(p.name)}${day ? `#day=${day}` : ""}`;

export function upcomingFor(cards, extra, t) {
  const x = extra || {}, tz = zone(x.tz || "Europe/London"), hm = (ms) => clock(tz).format(new Date(ms)), day = (ms) => dayKey(tz).format(new Date(ms));
  const lastDay = dayAfter(day(t), OFFERS_DAYS), rows = [], soon = (at, ahead = AHEAD) => Number.isFinite(at) && at > t && at <= t + ahead;
  const keep = (o) => { const r = { at: o.at, app: o.app, title: o.title, sub: o.sub || "", href: o.href, id: o.id }; if (o.share) r.share = o.share; if (o.sendCard) r.sendCard = o.sendCard; if (o.late) r.late = true; if (o.booking) Object.assign(r, o.booking); if (o.parcel) Object.assign(r, o.parcel); rows.push(r); };

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
    else if (r.arrival == null && Number.isFinite(r.cap) && r.cap <= t) keep({ at: r.start, app: "fitness", title, sub: "Not in yet", href: "/fitness/#activities", id, late: true });
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
  // Mail's bookings in the next 24 hours (those of the trip shown as a card are in it, not here)
  const mc = cards?.mail;
  if (mc?.state === "ok" && Array.isArray(mc.ahead)) {
    for (const b of mc.ahead) {
      if (!b || typeof b.id !== "string" || !soon(b.start) || (x.tripId && b.trip === x.tripId)) continue;
      const p = b.place, at = p && Number.isFinite(p.lat) && Number.isFinite(p.lon);
      const sub = [b.sub || p?.name || "", b.repeat || ""].filter(Boolean).join(" · ");
      keep({ at: b.start, app: "mail", title: b.title, sub, href: b.href, id: `mail-${b.id}`,
        booking: { booking: b.id, kind: b.kind, ...(b.ref ? { ref: b.ref } : {}), ...(at ? { wx: weatherAt(p, dayKey(zone(b.tz || tz)).format(new Date(b.start))), place: p.name } : {}),
          ...(b.repeat ? { repeat: b.repeat, next: (b.next || []).map((n) => ({ ...n })) } : {}), ...(Number.isFinite(b.was) ? { was: b.was } : {}) } });
    }
  }
  // Mail's parcels: out for delivery today, or due today, until their window's end (or the day's)
  if (mc?.state === "ok" && Array.isArray(mc.parcels)) {
    const today = localDay(tz, t);
    for (const pc of mc.parcels) {
      if (!pc || typeof pc.id !== "string" || !(pc.stage < 3)) continue;
      const w = pc.window, from = w?.from ?? null, until = w?.to ?? today.end;
      const dueToday = [from, pc.due].some((x) => Number.isFinite(x) && x >= today.start && x < today.end);
      if (!(pc.stage === 2 || dueToday) || until <= t || (from != null && from >= today.end)) continue;
      const by = pc.carrier || pc.shop;
      keep({ at: from ?? Math.max(today.start, Math.min(t + 60e3, until - 1)), app: "mail", title: pc.shop ? `Parcel from ${pc.shop}` : "Parcel", sub: [STAGE[pc.stage], by].filter(Boolean).join(" · "), href: pc.href, id: `mail-${pc.id}`,
        parcel: { parcel: pc.id, stage: pc.stage, until, amt: w ? spanSaid(w, hm) : "Today", when: w ? "today" : "", ...(pc.carrier ? { carrier: pc.carrier } : {}), ...(pc.track ? { track: pc.track } : {}), ...(pc.ref ? { ref: pc.ref } : {}) } });
    }
  }
  // tomorrow's first: the weather at 07:00 (the evening's)
  const tw = x.tomorrow;
  if (tw && soon(tw.at)) keep({ at: tw.at, app: "weather", title: cap1(tw.said || "Tomorrow"), sub: tw.good ? `A good morning for a ${tw.good}` : `At ${hm(tw.at)}`, href: `/weather/#day=${tw.day || day(tw.at)}`, id: "tomorrow" });

  return rows.sort((a, b) => a.at - b.at || (ORDER[a.app] ?? 9) - (ORDER[b.app] ?? 9) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// ---- Mail's parcels, bills and money, in words (Mail on Your Day, stage 2) ----
const STAGE = ["Ordered", "Shipped", "Out for delivery", "Delivered"];
// (a delivery window: "11–13" on the hour, else "11:30–13:00")
const spanSaid = (w, hm) => { const a = hm(w.from), b = hm(w.to); return /:00$/.test(a) && /:00$/.test(b) ? `${Number(a.slice(0, 2))}–${Number(b.slice(0, 2))}` : `${a}–${b}`; };
// pence as pounds: "£84.20", "£1,412.60"; and rounded, "£71" (a usual, a bar's)
export const money = (p) => `£${(p / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const moneyRound = (p) => `£${Math.round(p / 100).toLocaleString("en-GB")}`;
const signedMoney = (p) => `${p > 0 ? "+" : p < 0 ? "−" : ""}${money(Math.abs(p))}`;
// (a bill against its usual: "+18%", where it's 5% or more either way; else null)
const against = (amount, usual) => { if (!usual || amount === usual) return null; const pc = Math.round(((amount - usual) / usual) * 100); return Math.abs(pc) >= 5 ? `${pc > 0 ? "+" : "−"}${Math.abs(pc)}%` : null; };
const DAYF = new Map();
const fmt = (tz, o) => { const k = `${tz}|${JSON.stringify(o)}`; return DAYF.get(k) || DAYF.set(k, new Intl.DateTimeFormat("en-GB", { timeZone: tz, ...o })).get(k); };
// a day, as a row says it: "today", "tomorrow", "Thu 12" within the week, else "16 Nov"
function daySaid(ms, t, tz) {
  const d = dayKey(tz).format(new Date(ms)), today = dayKey(tz).format(new Date(t));
  if (d === today) return "today";
  if (d === dayAfter(today, 1)) return "tomorrow";
  if (d > today && d < dayAfter(today, 7)) return `${fmt(tz, { weekday: "short" }).format(ms)} ${fmt(tz, { day: "numeric" }).format(ms)}`;
  return fmt(tz, { day: "numeric", month: "short" }).format(ms);
}
// one bill as a row (Waiting for You's, and the Bills sheet's): { id, item, kind, title, sub, chg, amt, when, at, href, auto }
function billRow(b, t, tz) {
  let title = b.sender, sub = "", chg = null;
  if (b.kind === "bill" || b.kind === "sub") {
    chg = against(b.amount, b.usual);
    const vs = chg ? `${chg} on your usual ${moneyRound(b.usual)}` : b.usual ? "Same as usual" : "";
    sub = b.auto || b.kind === "sub" ? vs : ["To pay", vs].filter(Boolean).join(" · ");
  } else if (b.kind === "renewal") {
    title = b.cat === "Car" ? "Car insurance renews" : `${b.sender} renews`;
    chg = b.was != null && b.was !== b.amount ? signedMoney(b.amount - b.was) : null;
    sub = [b.cat === "Car" ? b.sender : "", chg ? `${chg} on last year` : ""].filter(Boolean).join(" · ");
  } else if (b.kind === "trial") {
    title = `${b.sender} trial ends`;
    sub = `Then ${money(b.amount)}`;
  }
  return { id: `mail-${b.id}`, item: b.id, kind: b.kind, title, sub, chg, amt: money(b.amount), when: Number.isFinite(b.due) ? daySaid(b.due, t, tz) : "", at: b.due ?? null, href: b.href, auto: b.auto };
}
// (a parcel's last day to return, as a row)
const returnRow = (pc, t, tz) => ({ id: `mail-${pc.id}`, item: pc.id, kind: "return", title: pc.shop ? `Return to ${pc.shop}` : "Return", sub: pc.order ? `Order ${pc.order}` : "", chg: null,
  amt: daySaid(pc.returnBy, t, tz).replace(/^\w/, (c) => c.toUpperCase()), when: "last day", at: pc.returnBy, href: pc.href });

const WAIT_DAYS = { bill: 7, renewal: 10, trial: 2 }, RETURN_WAIT = 3;
export function mailWaiting(cards, extra, t) {
  const tz = zone(extra?.tz || "Europe/London"), mc = cards?.mail, rows = [];
  if (mc?.state !== "ok") return { rows, paid: null };
  // (by the day: due today up to so many days on, on the account's clock)
  const today = dayKey(tz).format(new Date(t)), within = (ms, days) => { const d = dayKey(tz).format(new Date(ms)); return d >= today && d <= dayAfter(today, days); };
  for (const b of Array.isArray(mc.bills) ? mc.bills : []) {
    const days = WAIT_DAYS[b?.kind];
    if (!days || !Number.isFinite(b.due) || !within(b.due, days) || (b.kind === "bill" && b.auto)) continue;
    rows.push(billRow(b, t, tz));
  }
  for (const pc of Array.isArray(mc.parcels) ? mc.parcels : []) {
    if (!pc || !Number.isFinite(pc.returnBy) || !within(pc.returnBy, RETURN_WAIT)) continue;
    rows.push(returnRow(pc, t, tz));
  }
  rows.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
  const ps = mc.money?.paidSelf, paid = ps && ps.n > 0 ? { n: ps.n, pence: ps.pence, said: `${ps.n} paid by themselves · ${money(ps.pence)}` } : null;
  return { rows, paid };
}

// The Bills sheet: { month ("£186.40"), n ("11 bills and subscriptions"), tag ("+£14.99 on June", or null), bars: [{ label,
// pct, said? }] (the last six months, the last with its amount), cats: [{ name, pence, said }], needs: [row], paid: [row] }
// (needs: a bill to pay, a renewal, a trial; paid: the rest, which pay themselves)
export function moneyFor(cards, extra, t) {
  const tz = zone(extra?.tz || "Europe/London"), mc = cards?.mail;
  if (mc?.state !== "ok" || !mc.money) return null;
  const m = mc.money, bills = Array.isArray(mc.bills) ? mc.bills : [];
  const [y, mo] = dayKey(tz).format(new Date(t)).split("-").map(Number);
  const monthAt = (back, o) => fmt("UTC", o).format(Date.UTC(y, mo - 1 - back, 15));
  // (a month from before Mail knew the bills: an empty bar, and the change counted from the first month it knew)
  const top = Math.max(1, ...m.months.filter((v) => v != null));
  const bars = m.months.map((v, i) => ({ label: monthAt(5 - i, { month: "short" }).slice(0, 3), pct: v == null ? 0 : Math.max(4, Math.round((v / top) * 100)), ...(i === 5 ? { said: moneyRound(v) } : {}) }));
  const from = m.months.findIndex((v) => v != null);
  const diff = m.months.length === 6 && from >= 0 && from < 5 ? m.months[5] - m.months[from] : 0;
  const rows = bills.map((b) => billRow(b, t, tz));
  const needs = (b) => b.kind === "renewal" || b.kind === "trial" || (b.kind === "bill" && !b.auto);
  return {
    month: money(m.month), n: m.n === 1 ? "1 bill or subscription" : `${m.n} bills and subscriptions`, tag: diff ? `${signedMoney(diff)} on ${monthAt(5 - from, { month: "long" })}` : null, bars,
    cats: m.cats.filter((c) => c.pence > 0).map((c) => ({ name: c.name, pence: c.pence, said: `${c.name} ${moneyRound(c.pence)}` })),
    needs: rows.filter((r, i) => needs(bills[i])), paid: rows.filter((r, i) => !needs(bills[i])),
  };
}
