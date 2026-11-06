// InFlite Today's morning notification: one, at its time in the account's zone, instead of Weather's morning briefing
// and Fitness's morning reminder (which skip accounts with this on: functions/_today.js morningUsers). Its lines are
// the apps' own words, from the same cards Today's page shows (functions/_todaycards.js): Weather's briefing, Fitness's
// session and its best time, Markets' day, and Chat's pigeons on their way (named only where Chat's own names
// preference is on, and never a word of any letter). It comes whatever the Quiet Hours. Sent by the site's scheduler
// (workers/ticker, every 5 minutes: functions/api/today), with the site's Web Push (functions/_notify.js), to the
// devices Today's page turned it on on (functions/_today.js td_push). Each day's is claimed only once it's composed,
// so a tick cut off part way leaves it for the next. Since Today First (spec §7.5), each account's day is planned just
// before its morning's composed (functions/_todayacts.js planDay: a clash moved, a ride from habit added, each with
// Undo), so the notification can say what Today did, in the Fitness line, naming a friend only where Chat's own "Names
// on the Lock Screen" is on. Only for an account whose Today has planned a day itself before (Today 1.09's read of the
// day: functions/_todayacts.js hasPlanned), so nothing's done for anyone whose Today can't undo it (spec §15.4: MAIN goes
// live before Today 1.09); and not at all while the Pages var TODAY_ACTS is "0" (the off switch: an IFL rollback).

import { HttpError } from "./_pigeon.js";
import { prefsOf, pushToSub } from "./_notify.js";
import { todayLinks } from "./_sites.js";
import { CARDS, tddb, todayPrefs, morningTz, todayDevices, deviceOk, deviceGone, deviceFailed, tidyDevices, morningCandidates, claimMorning, releaseMorning, keepLast } from "./_today.js";
import { cardsFor, cardsMemo, Quiet } from "./_todaycards.js";
import { moneySaid, andSaid } from "./_markets.js";
import { planDay, actsFor, pushLine, hasPlanned, tidyOffers } from "./_todayacts.js";
import { mailCard } from "./_todaymail.js";

// how long a tick goes on beginning things (an account planned, composed, claimed and sent), from its start: the
// scheduler gives it 55 seconds, and a plan (PLAN_MS at most: its waits on the weather, hoursAt's and pastWet's, cut
// short there, and the habit, which waits twice, left for a later run when it's short), a compose (9) and a push (8)
// begun just before this still finish inside them: 25 + 10 + 9 + 8 = 52. The due accounts a tick takes at most (the 3
// hours a morning's let run late hold 36 ticks: 540 accounts a morning), and how many at once. Its lease lapses by itself
// if a tick dies part way: longer than any tick runs, shorter than the 5 minutes between them
export const TICK_MS = 25e3, PLAN_MS = 10e3, PER_TICK = 15, AT_ONCE = 4, LEASE = 3 * 60e3;
// The database's part, counted as the tick goes rather than guessed: D1 takes at most 1,000 queries a request (the paid
// plan), and an account's compose costs from about 20 statements to a couple of hundred (Markets' prices, two or three
// for each thing held), its plan from about 15 to 30 more (a clash moved and a ride from habit added), counted with it.
// Every statement the tick sends is counted (each of a batch's). Once it's sent DB_BUDGET, it begins no more accounts:
// the rest are left for the next tick, as those past PER_TICK are. The composes already begun go on, to DB_MOST; one
// that would take the tick past it stops those still composing (their statements refused, so each is left for the next
// tick, nothing claimed), all but the one begun first, which finishes, so every tick sends something. What follows a
// compose (the claim, each push's health, the day given back, what was sent) is never refused, as an account claimed
// must be sent or given back. So a tick sends DB_MOST at most, plus one compose, plus what follows the composes in
// flight (a few each, and one or two for each device)
export const DB_BUDGET = 650, DB_MOST = 700;
// (a morning missed by more than three hours goes unsaid, as Fitness's does: not sent at lunchtime)
const LATE = 3 * 60;
// (how often the scheduler asks: workers/ticker/wrangler.toml, every 5 minutes, on the minutes that are multiples of 5)
const EVERY = 5 * 60e3;
// (its words, at most, and how long a push service keeps one for a phone that's off)
const BODY_MAX = 400, TTL = 4 * 3600;
// the apps' lines, in the order the notification has them
const LINES = ["weather", "fitness", "chat", "markets"];
const NAMES = { weather: "Weather", fitness: "Fitness", chat: "Chat", markets: "Markets" };

// ---- time in the account's zone ----
const zoneOk = (tz) => { try { new Intl.DateTimeFormat("en-GB", { timeZone: tz }); return typeof tz === "string" && !!tz; } catch (_) { return false; } };
const zoneOf = (tz) => (zoneOk(tz) ? tz : "Europe/London");
const WALL = new Map();
const wallFormat = (tz) => WALL.get(tz) || WALL.set(tz, new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "long" })).get(tz);
const partsAt = (tz, t) => Object.fromEntries(wallFormat(tz).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
// where the account is, now: its day ("2026-10-26") and the minutes since its midnight (as Fitness's: functions/_fitpush.js)
function localNow(tz, t) {
  const p = partsAt(zoneOf(tz), t);
  return { day: `${p.year}-${p.month}-${p.day}`, mins: Number(p.hour) * 60 + Number(p.minute), weekday: p.weekday };
}
// how far ahead of UTC the zone's clocks are at t, ms
const offsetAt = (tz, t) => {
  const p = partsAt(tz, t);
  return Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(t / 1000) * 1000;
};
// "07:45", there
const hhmm = (tz, t) => { const p = partsAt(zoneOf(tz), t); return `${p.hour}:${p.minute}`; };
const nextDay = (day) => { const [y, m, d] = day.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10); };

// The moments a day's mins after midnight comes in a zone, soonest first → [ms]. (The wall time taken back by the zone's
// offset at it, then once more by the offset at that: so 07:00 on the days the clocks change is 07:00 by the new ones,
// and a minute the clocks jump past is the moment as far on as it would have been, 01:30 on the morning they go forward
// being 02:30's. A minute that comes twice, the night they go back, is both, the first by the offset of the hours before:
// 01:30 in London on 25 October 2026 is 00:30 by the clocks of the summer, when it's due, and 01:30 by the winter's)
function wallMoments(zone, day, mins) {
  const [y, m, d] = day.split("-").map(Number), wall = Date.UTC(y, m - 1, d) + mins * 60e3;
  const near = wall - offsetAt(zone, wall - offsetAt(zone, wall)), H3 = 3 * 3600e3;
  const all = [...new Set([near - H3, near, near + H3].map((x) => wall - offsetAt(zone, x)))].filter((x) => x + offsetAt(zone, x) === wall);
  return all.length ? all.sort((a, b) => a - b) : [near];
}
// The next time it's due: today's mins after midnight in tz if that's still to come, else tomorrow's (right across the
// clocks changing) → ms
export function nextAt(tz, mins, t) {
  const zone = zoneOf(tz), today = localNow(zone, t).day;
  return wallMoments(zone, today, mins).find((x) => x > t) ?? wallMoments(zone, nextDay(today), mins)[0];
}
// Whether an account's is due at t: its time come today where it is (no more than three hours ago), and today's not
// claimed yet. u: { id, notify_prefs }; row: its td_prefs row
export function isDue(u, row, t) {
  const { day, mins } = localNow(morningTz(u, row), t), at = Number(row.m_at);
  return row.m_sent !== day && mins >= at && mins <= at + LATE;
}

// ---- the words ----
// a length of time: "45 min", "1 h 12 min", "3 h" (Fitness's own: fitness/ui.js dur)
function dur(secs) {
  const m = Math.round(secs / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
const ok = (c) => c && typeof c === "object" && c.state === "ok";
const text = (v) => (typeof v === "string" ? v.trim() : "");
// "Sam", "Sam and Mum", "Sam, Mum and Leo"
const and = (a) => (a.length > 1 ? `${a.slice(0, -1).join(", ")} and ${a.at(-1)}` : a[0] || "");

// Weather's: its briefing's first sentence, and the official warning's, where there's one in force
function weatherLine(c) {
  if (!ok(c)) return null;
  return [text(c.lead), text(c.warning?.said)].filter(Boolean).join(" ") || null;
}
// Fitness's: today's session and its best time to ride, a rest day, an event, or what's been done today
function fitnessLine(c) {
  if (!ok(c)) return null;
  if (c.kind === "done") return text(c.done?.name) ? `Done: ${text(c.done.name)}` : null;
  if (c.kind === "rest") return "Rest day";
  if (c.kind === "event") return text(c.event?.name) ? `Event day: ${text(c.event.name)}` : null;
  if (c.kind !== "session" || !text(c.session?.name)) return null;
  const name = text(c.session.name), best = c.best;
  if (best && best.poor) return `${name} · no good time outside`;
  if (best && text(best.span)) return `${name} · best ${text(best.span)}`;
  return Number(c.session.secs) > 0 ? `${name}, ${dur(Number(c.session.secs))}` : name;
}
// Chat's: who has pigeons on their way to you. Named only where the account's Chat names people in its notifications
// (its names preference); never a word of any letter, nor what kind of pigeon it is. How many, and from how many
// friends, are the card's counts of them all (inboundTotal, inboundFrom); the names, its list of the soonest few
// With pigeons off (the card's pigeons false), the same said plainly, as letters: "A letter from Sam, arriving about 11:05".
// Instant messages are never in it (the card's inbound is letters in the air only).
function chatLine(c, names, tz, t) {
  if (!ok(c) || !Array.isArray(c.inbound) || !c.inbound.length) return null;
  const off = c.pigeons === false;
  const W = off ? { one: "A letter", many: "letters", Many: "Letters", lands: "arriving" } : { one: "A pigeon", many: "pigeons", Many: "Pigeons", lands: "landing" };
  const list = [...c.inbound].sort((a, b) => (Number(a?.landsAt) || 0) - (Number(b?.landsAt) || 0));
  const count = (v, least) => (Number.isInteger(v) && v > least ? v : least);
  const n = count(c.inboundTotal, list.length);
  if (!names) return n === 1 ? `${W.one} on its way` : `${n} ${W.many} on their way`;
  const firstOf = (p) => text(p?.who?.first) || text(p?.who?.name).split(/\s+/)[0] || "a friend";
  if (n === 1) {
    const lands = Number(list[0].landsAt);
    if (!Number.isFinite(lands)) return `${W.one} from ${firstOf(list[0])} on its way`;
    // (about, while it's more than 10 minutes out, as Chat gives a range until then; at, after)
    return `${W.one} from ${firstOf(list[0])}, ${W.lands} ${lands - t > 10 * 60e3 ? "about" : "at"} ${hhmm(tz, lands)}`;
  }
  // (the friends in the list, soonest first, each first name once; those sending pigeons further back than the list
  // goes aren't in it, and are among the others)
  const senders = [...new Map(list.map((p) => [text(p?.who?.id) || firstOf(p), firstOf(p)])).values()], firsts = [...new Set(senders)];
  const from = count(c.inboundFrom, senders.length);
  if (senders.length === from && firsts.length <= 3) return `${W.Many} from ${and(firsts)} on their way`;
  const shown = firsts.slice(0, 2), others = from - senders.filter((f) => shown.includes(f)).length;
  return `${W.Many} from ${and([...shown, `${others} other${others === 1 ? "" : "s"}`])} on their way`;
}
// Markets': the portfolio's day by Markets' own logic (only what's traded today, judged by its own market's day), in the
// evening wrap's words, or the markets shut today, or as it closed (before anything's traded)
function marketsLine(c) {
  if (!ok(c) || !(Number(c.owned) > 0) || !Number.isFinite(Number(c.value))) return null;
  const money = moneySaid(Math.abs(Number(c.value)), "GBP"), change = Number(c.change) || 0;
  if (c.traded) {
    if (Math.abs(change) < 1) return `Your portfolio’s little changed today, at ${money}`;
    return `Your portfolio is ${change >= 0 ? "up" : "down"} ${Math.abs(Number(c.pct) || 0).toFixed(1)}% today, at ${money}`;
  }
  const shut = Array.isArray(c.market?.shut) ? c.market.shut.filter((x) => typeof x === "string" && x) : [];
  if (shut.length) return `${andSaid(shut)} ${shut.length > 1 ? "are" : "is"} shut today. Your portfolio is at ${money}`;
  return `Your portfolio is at ${money}, as it closed`;
}

// Mail's (Mail on Your Day, stage 1, the admin's alone: the card's ahead, functions/_todaymail.js cardOf): today's
// bookings still to come and the first of tomorrow's, in a line: "Rockfish at 19:30 · Flight tomorrow 07:40". Travel by
// its kind ("Flight 07:40"), a table by where ("Table at Rockfish" is Rockfish), anything else by its name; at most
// three of today's. None today or tomorrow, no line
const TRAVEL = { flight: "Flight", train: "Train", bus: "Bus" };
const bookingName = (b) => {
  if (b.kind === "car") return "Car hire";
  const t = text(b.title);
  return [...(b.kind === "restaurant" ? t.replace(/^table\s+(for\s+\d+\s+)?at\s+/i, "") || t : t)].slice(0, 40).join("");
};
// Stage 2, in the same line (the notification's budget is the same): a parcel coming today ("Parcel 11:00–13:00", or
// "Parcel today" with no window) and a bill to pay due today or tomorrow, not one that pays itself ("Octopus £84.20 due
// tomorrow"); then today's bookings make room for them, at most four parts in all
// (a sender's name, short: "Octopus Energy" is Octopus, "British Gas" stays)
const senderShort = (s) => [...(text(s).replace(/\s+(energy|ltd|limited|plc|uk|group)\.?$/i, "") || text(s))].slice(0, 30).join("");
const pounds = (p) => `£${(p / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export function mailLine(c, tz, t) {
  if (!ok(c) || (!Array.isArray(c.ahead) && !Array.isArray(c.parcels) && !Array.isArray(c.bills))) return null;
  const zone = zoneOf(tz), today = localNow(zone, t).day, tomorrow = nextDay(today), dayOf = (ms) => localNow(zone, ms).day;
  const list = (Array.isArray(c.ahead) ? c.ahead : []).filter((b) => b && Number.isFinite(b.start) && text(b.title)).sort((a, b) => a.start - b.start);
  const said = (b, when) => (TRAVEL[b.kind] ? `${TRAVEL[b.kind]}${when} ${hhmm(zone, b.start)}` : `${bookingName(b)}${when} at ${hhmm(zone, b.start)}`);
  // (the parcel: out for delivery, or due today; its window where it has one)
  const pc = (Array.isArray(c.parcels) ? c.parcels : []).find((p) => p && p.stage < 3 && (p.window ? dayOf(p.window.from) === today && p.window.to > t : p.stage === 2 || (Number.isFinite(p.due) && dayOf(p.due) === today)));
  const parcel = pc ? (pc.window ? `Parcel ${hhmm(zone, pc.window.from)}–${hhmm(zone, pc.window.to)}` : "Parcel today") : null;
  // (the bill: to pay, due today or tomorrow, the soonest)
  const bl = (Array.isArray(c.bills) ? c.bills : []).filter((b) => b && b.kind === "bill" && !b.auto && Number.isFinite(b.due) && Number.isInteger(b.amount) && [today, tomorrow].includes(dayOf(b.due)))
    .sort((a, b) => a.due - b.due)[0];
  const bill = bl ? `${senderShort(bl.sender)} ${pounds(bl.amount)} due ${dayOf(bl.due) === today ? "today" : "tomorrow"}` : null;
  const extra = [parcel, bill].filter(Boolean);
  const next = list.find((b) => dayOf(b.start) === tomorrow);
  const room = Math.max(1, 4 - extra.length - (next ? 1 : 0));
  const now = list.filter((b) => b.start >= t && dayOf(b.start) === today).slice(0, Math.min(3, room)).map((b) => said(b, ""));
  const parts = [...now, ...extra, ...(next ? [said(next, " tomorrow")] : [])];
  return parts.length ? parts.join(" · ") : null;
}

// The notification's words, from the cards ({ weather, chat, fitness, markets }, each as functions/_todaycards.js gives
// it; and Mail's, where it's the admin's, whose bookings are a line after the weather's): { title, lines, out (apps whose
// line is on with nothing to say) }. names: Chat's names preference; tz: the
// account's zone; lines: { weather: false, … }, false turning one off; acts: what Today did or offers this morning, a
// sentence each (functions/_todayacts.js pushLine), said in the Fitness line, after the session (and said even where
// that line's off: it's Today's own doing, with an Undo that doesn't wait)
export function morningLines(cards, { names, tz, t, lines, acts = [] }) {
  const on = (k) => (lines || {})[k] !== false, c = cards && typeof cards === "object" ? cards : {};
  const said = { weather: weatherLine(c.weather), fitness: fitnessLine(c.fitness), chat: chatLine(c.chat, !!names, tz, t), markets: marketsLine(c.markets) };
  const doing = (Array.isArray(acts) ? acts : []).filter((x) => typeof x === "string" && x).join(" ");
  if (doing) said.fitness = [on("fitness") ? said.fitness : null, doing].filter(Boolean).join(". ");
  const out = [], got = [], booked = mailLine(c.mail, tz, t);
  for (const k of LINES) {
    if (on(k) || (k === "fitness" && doing)) { if (said[k]) got.push(said[k]); else out.push(NAMES[k]); }
    if (k === "weather" && booked) got.push(booked);
  }
  const brief = on("weather") && ok(c.weather) ? text(c.weather.brief?.title) : "";
  return { title: brief || `Your ${localNow(tz, t).weekday}`, lines: got, out };
}

// The notification for an account (cards: the page's, where it has them, so the preview is what's shown; memo: the
// tick's, shared between its accounts: forecasts, warnings, a ride's weather; purpose: the tick's "morning", or "page"
// for one the page asks for, which spends only a page's share of Open-Meteo's allowance, never what's kept for the
// briefings: functions/_todaywx.js) → { title, body, lines, out, tag, url, ttl }
export async function composeMorning(env, u, row, t, { memo, cards, purpose = "morning" } = {}) {
  const tz = morningTz(u, row), lines = row?.m_lines && typeof row.m_lines === "object" ? row.m_lines : {};
  const only = CARDS.filter((k) => lines[k] !== false);
  // (the page's own answer, or its cards alone)
  const have = cards && typeof cards === "object" ? (cards.cards && typeof cards.cards === "object" ? cards.cards : cards) : null;
  const got0 = have || (only.length ? (await cardsFor(env, u, { only, t, purpose: purpose === "page" ? "page" : "morning", tz, links: todayLinks(env, null), memo: memo || null })).cards : {});
  // (Mail's card, for its bookings' line: the page's where it has it, else asked of Mail as the page's day asks it, the
  // admin's alone and 700 ms at most (functions/_todaymail.js); not where Today's Edit hid it)
  const mailHidden = Array.isArray(row?.cards?.hidden) && row.cards.hidden.includes("mail");
  const got = got0.mail || mailHidden || !env?.MAIL_KEY ? got0 : { ...got0, mail: await mailCard(env, u, null, t).catch(() => null) };
  const names = !!prefsOf(u).names, today = localNow(tz, t).day;
  // (what Today did or offers this morning: the day's acts, as planned just before; none to be had, none said; nor any
  // while TODAY_ACTS is "0")
  const acts = env?.TODAY_ACTS === "0" ? [] : (await actsFor(env, u.id, today).catch(() => [])).filter((a) => a.day === today).map((a) => pushLine(a, { names, tz, today })).filter(Boolean);
  const m = morningLines(got, { names, tz, t, lines, acts });
  return { title: m.title, body: bodyOf(m.lines, acts.join(" ")), lines: m.lines, out: m.out, tag: "today-morning", url: "/", ttl: TTL, app: "today" };
}
// The body: the lines, cut at BODY_MAX (at a character, never through one), but never through what Today did: where
// that would be cut, the lines before it are cut shorter instead (to an ellipsis), so its Undo is always said
function bodyOf(lines, doing) {
  const cut = (s, n) => [...s].slice(0, Math.max(0, n)).join("");
  const body = cut(lines.join("\n"), BODY_MAX);
  if (!doing || body.includes(doing)) return body;
  const i = lines.findIndex((l) => l.includes(doing));
  if (i < 0) return body;
  const rest = lines.slice(i).join("\n"), room = BODY_MAX - [...rest].length - 1, head = lines.slice(0, i).join("\n");
  return cut(room > 1 ? `${cut(head, room - 1)}…\n${rest}` : rest, BODY_MAX);
}
// whether a notification has anything to say: some line, or Weather's title (with none, and Weather's line off or not
// to be had, there's nothing to send)
const worthSending = (note, tz, t) => note.lines.length > 0 || note.title !== `Your ${localNow(tz, t).weekday}`;

// What the Morning section shows: this morning's as it was sent, or the next as it would be now (cards: the page's, so
// nothing's worked out twice) → { kind, at, title, lines, out }. The next comes when the scheduler will send it: today's
// decided already (sent, or with nothing to say), tomorrow's; due now and not yet sent (turned on, or its time moved
// earlier, within the three hours it's let run late), with the scheduler's next turn; else at its time
export async function previewMorning(env, u, row, t, { cards } = {}) {
  const tz = morningTz(u, row), zone = zoneOf(tz), today = localNow(tz, t).day, last = row?.m_last, mins = Number(row?.m_at ?? 420);
  const decided = !!row?.m_sent && row.m_sent === today;
  // (sent today where the account is: a day claimed with nothing to say keeps the last one that went, from another day)
  if (decided && last && typeof last === "object" && Number.isFinite(last.at) && localNow(tz, last.at).day === today)
    return { kind: "sent", at: last.at, title: last.title || "", lines: Array.isArray(last.lines) ? last.lines : [], out: Array.isArray(last.out) ? last.out : [] };
  const note = await composeMorning(env, u, row, t, { cards, purpose: "page" }), turn = (Math.floor(t / EVERY) + 1) * EVERY;
  const at = decided ? wallMoments(zone, nextDay(today), mins)[0] : row?.m_on && isDue(u, row, turn) ? turn : nextAt(tz, mins, t);
  return { kind: "next", at, title: note.title, lines: note.lines, out: note.out };
}

// a device's push answered: kept, gone (forgotten), or one more failure in a row (forgotten at its fifth)
async function health(env, endpoint, r, out = null) {
  if (out) out[r === "sent" || r === "gone" ? r : "failed"]++;
  if (r === "sent") await deviceOk(env, endpoint);
  else if (r === "gone") await deviceGone(env, endpoint);
  else await deviceFailed(env, endpoint);
}

// "Show it on this phone": one now, to that device (endpoint: one of the account's), in the morning's words. It's the
// page's: from the cards it worked out in the last minute (functions/_todaycards.js cardsMemo), else worked out now as a
// page's are. It never counts as the day's (the day's claim and what was last sent are untouched), so the Morning
// section doesn't say this morning's came at 15:42 → { sent: 0 | 1 }
export async function sendMorningNow(env, u, { endpoint }) {
  const devs = await todayDevices(env, u.id), dev = devs.find((d) => d.endpoint === endpoint);
  if (!dev) throw new HttpError(400, "Turn the morning notification on on this device first.");
  const t = Date.now(), cards = cardsMemo.get(u.id)?.answer?.cards;
  const note = await composeMorning(env, u, await todayPrefs(env, u.id), t, { cards, purpose: "page" });
  const r = await pushToSub(env, dev, note).catch(() => "error");
  await health(env, dev.endpoint, r);
  return { sent: r === "sent" ? 1 : 0 };
}

// Tests only: what a tick composes each account's with, in place of composeMorning (one that fails, or runs late); what
// it plans each account's day with, in place of planDay; and the stand-ins (the weather) planDay is given
export const tickTest = { compose: null, plan: null, deps: null };
// The database, each statement counted as it's sent (a batch, each of those in it): on(n) is told of each n before it's
// sent, and where it says no, that's refused (a Quiet error, so a card that meets it isn't logged as failing) and not sent
export function countedDb(D, on) {
  const real = new WeakMap(), no = () => Promise.reject(new Quiet("The tick's had its share of the database."));
  const st = (s) => { const p = new Proxy(s, { get(o, k) { const v = o[k]; if (typeof v !== "function") return v;
    if (k === "bind") return (...a) => st(v.apply(o, a));
    if (k === "first" || k === "all" || k === "run" || k === "raw") return (...a) => (on(1) === false ? no() : v.apply(o, a));
    return v.bind(o); } }); real.set(p, s); return p; };
  return new Proxy(D, { get(o, k) { const v = o[k]; if (typeof v !== "function") return v;
    if (k === "prepare") return (q) => st(v.call(o, q));
    if (k === "batch") return (list) => (on(list.length) === false ? no() : v.call(o, list.map((x) => real.get(x) || x)));
    if (k === "exec") return (q) => (on(1) === false ? no() : v.call(o, q));
    return v.bind(o); } });
}

// The scheduler's turn → { accounts (with it on and a device), due, sent, gone, failed (pushes, to devices), left (due
// accounts not reached this tick, for the next), db (the statements it sent the database) }, or { busy: true } while
// another tick has it. One at a time (a lease, given back at the end); no Quiet Hours (it comes at its time, as Weather's
// briefing does)
export async function morningTick(env, t = Date.now()) {
  const used = { n: 0 };
  env = { ...env, DB: env.DB && countedDb(env.DB, (n) => { used.n += n; }) };
  const D = await tddb(env), mine = String(t + LEASE);
  await D.prepare("INSERT OR IGNORE INTO td_meta (k, v) VALUES ('tick', '0')").run();
  const lease = await D.prepare("UPDATE td_meta SET v = ?1 WHERE k = 'tick' AND CAST(v AS INTEGER) < ?2").bind(mine, t).run();
  if (!lease.meta?.changes) return { busy: true };
  // (given back only if it's still this tick's: one that's run past its lease leaves the next tick's alone)
  try { const out = await tick(env, t, used); out.db = used.n; return out; }
  finally { await D.prepare("UPDATE td_meta SET v = '0' WHERE k = 'tick' AND v = ?1").bind(mine).run().catch(() => {}); }
}
async function tick(env, t, used) {
  const until = Date.now() + TICK_MS;
  // (devices of sign-ins that have ended, and of accounts being deleted, let go first)
  await tidyDevices(env);
  const all = await morningCandidates(env);
  const due = all.filter(({ u, row }) => isDue(u, row, t));
  // (in a different order each tick, so those left for the next aren't always the same ones)
  for (let i = due.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [due[i], due[j]] = [due[j], due[i]]; }
  const queue = due.slice(0, PER_TICK), memo = new Map();
  const out = { accounts: all.length, due: due.length, sent: 0, gone: 0, failed: 0, left: due.length - queue.length };
  // (tests, PIGEON_COUNT_DB: each compose's statements)
  if (env.PIGEON_COUNT_DB) out.composes = [];
  // the composes in flight, the first begun first; and once the tick's statements would pass DB_MOST, the one let finish
  const flying = [];
  let last = null;
  const one = async ({ u, row }) => {
    const tz = morningTz(u, row), day = localNow(tz, t).day, was = row.m_sent ?? null;
    // composed first, nothing claimed: one that fails is tried again by a later tick, while it's still in time. Its
    // statements counted; past DB_MOST, refused (and it's left for the next tick), unless it's the one let finish
    const box = { n: 0, refused: false };
    const use = { ...env, DB: countedDb(env.DB, (n) => {
      if (!last && used.n + n > DB_MOST) { last = flying[0] || box; for (const b of flying) if (b !== last) b.refused = true; }
      if (box.refused || (last && box !== last)) return (box.refused = true, false);
      box.n += n;
    }) };
    flying.push(box);
    const note = await (async () => {
      // the day's plan first (Today's acts: functions/_todayacts.js), so the notification can say what Today did; its
      // statements the compose's, counted with them; PLAN_MS its deadline. Only where Today has planned a day itself
      // before, and TODAY_ACTS isn't "0". One that fails gives its day back (a later turn, or Today's page, plans it),
      // and the morning's composed all the same
      const by = Date.now() + PLAN_MS;
      if (env.TODAY_ACTS === "0" || !(await hasPlanned(use, u.id))) return (tickTest.compose || composeMorning)(use, u, row, t, { memo });
      await (tickTest.plan || planDay)(use, u, t, { ...(tickTest.deps || {}), left: () => by - Date.now() }).catch(async (e) => {
        if (!box.refused) console.error("today tick: plan", e && e.message);
        // (stopped part way: here, where nothing's refused (stopped by the tick's share, its own giving back was refused
        // too), the day's given back for the next turn to plan, and any ride it added with no act to undo it by is
        // answered no, so Fitness never adds a ride Today can't undo)
        await env.DB.prepare("DELETE FROM td_plans WHERE user_id = ? AND day = ? AND at = ?").bind(u.id, day, t).run().catch(() => {});
        await tidyOffers(env, u.id, t, { made: t }).catch((e2) => console.error("today tick: offers", e2 && e2.message));
      });
      return (tickTest.compose || composeMorning)(use, u, row, t, { memo });
    })()
      .catch((e) => { if (!box.refused) console.error("today tick: compose", e && e.message); return null; })
      .finally(() => flying.splice(flying.indexOf(box), 1));
    if (out.composes) out.composes.push(box.n);
    if (box.refused) { out.left++; return; }
    if (!note) return;
    // claimed only while the tick's still beginning things: one claimed after could be cut off with the tick before it's
    // sent, claimed and never sent; left, it goes with the next
    if (Date.now() >= until) { out.left++; return; }
    if (!(await claimMorning(env, u.id, day, was))) return;
    // (nothing to say: the day's decided all the same)
    if (!worthSending(note, tz, t)) return;
    let went = false;
    try {
      const devs = await todayDevices(env, u.id);
      const got = await Promise.all(devs.map((d) => pushToSub(env, d, note).catch(() => "error")));
      for (let i = 0; i < devs.length; i++) await health(env, devs[i].endpoint, got[i], out).catch((e) => console.error("today tick: device", e && e.message));
      went = got.includes("sent");
    } finally {
      // not sent anywhere (the push services down a moment, say, or this tick's trouble): the day given back, so a later
      // tick tries again
      if (!went) await releaseMorning(env, u.id, day, was);
    }
    if (went) await keepLast(env, u.id, { title: note.title, lines: note.lines, out: note.out, at: t });
  };
  // (AT_ONCE at a time; none begun once the tick's had its TICK_MS, or its share of the database: the rest wait for the next)
  const work = async () => {
    while (queue.length) {
      if (Date.now() >= until || used.n >= DB_BUDGET || last) { out.left += queue.length; queue.length = 0; return; }
      // (one account's trouble doesn't stop the others')
      await one(queue.shift()).catch((e) => console.error("today tick:", e && e.message));
    }
  };
  await Promise.all(Array.from({ length: AT_ONCE }, work));
  return out;
}
