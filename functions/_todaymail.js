// Mail's card on Today (One roof stage 4, S4-D10, spec §2.5, §6.3): numbers only, asked of Mail's own Worker
// (email.inflite.ai, the inflite repo's email/) with the key the two share, for the site's admin alone. Never a word of
// anyone's mail: how many conversations from people are unread, how many in Updates, and how many are in Later with
// when the next comes back. Off the critical path: 700 ms at most, and anything but a 200 with those numbers is no card
// at all (Mail before 1.49 answers 401: never a stale or an error card).
//   mailCard(env, u, request?, t?) → null, or { state: "ok", href, people, updates, later: { n, next, href }, ahead?, trips?,
//     parcels?, bills?, money? }
//     env.MAIL_KEY: the key (the Worker secret, the same as Mail's Worker's MAIL_KEY); none, no card and nothing asked
//     env.MAIL_VIA: where Mail's Worker is reached, in place of its address (the tests' stand-in)
//     href: Mail's own address (the hub's /mail/ at inflite.ai: IFL.hub.go), and Later's, #later
// Mail on Your Day, stage 1 (trips and bookings, read from booking details and calendar invites by rules alone, on Mail's
// own server): with Mail's "Trips and bookings" on, its answer has two lists more, ahead and trips, kept here only as far
// as every field of each entry is what the contract says (anything else dropped, never the card): the bookings of the
// next 14 days (each with Mail's own address for its conversation, href, #thread=<id>), and the trips they make up. Both
// absent where Mail left them out (the switch off), so "off" and "nothing booked" are told apart.
//   tripFor(card, t) → the trip Today shows as a card (the soonest starting within 48 hours, or under way), with its
//     bookings, or null
//   mailHide(env, u, id, request?) → { ok: true }: one booking hidden in Mail (Today's Hide), Mail's POST
//     /api/connector/hide with the same key, for the admin alone; an HttpError where it can't be
//   mailUnhide(env, u, id, request?) → { ok: true }: one hidden again put back (Today's Put back), Mail's POST
//     /api/connector/unhide, the same way
// Stages 2 and 3 (yourday2 spec "The contract"): with "Parcels and returns" on, parcels (each with Mail's address for
// its email and the courier's own tracking page, https only); with "Bills and subscriptions" on, bills and money (amounts
// in pence, GBP); per trip, its hidden bookings (hidden: { id, title, sub, start }, for Put back); per booking of a
// repeating invite, repeat (its words: "every other Thursday"), next (the series' next dates: { start, cancelled?,
// was? }) and was (a moved one's first time). Each checked as the bookings are: anything malformed dropped, never the
// card; each list absent where Mail left it out (its switch off). A repeating invite's ids are <series>~<yyyymmdd>.
import { appOrigin, siteFetch } from "./_sites.js";
import { HttpError } from "./_pigeon.js";

// (Chat's API, for who the site's admin is: asked for when first needed, not imported here, as Chat's API imports Chat's
// "Send to a friend", which imports Today's cards, which import this: a static import would have it run too early)
const pigeon = () => import("./api/pigeon/[[path]].js");

export const MAIL_CARD_MS = 700;
const ORIGIN = /^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/i;
// (a count: a whole number, none below 0, and no more than any inbox has)
const count = (v) => (Number.isInteger(v) && v >= 0 && v <= 1e7 ? v : null);
// (a time: ms since 1970, after 2020 and before 2100; or none)
const when = (v) => (v == null ? null : Number.isFinite(v) && v > 1.5e12 && v < 4.1e12 ? v : undefined);

// (where Mail's Worker is asked: its stand-in where the tests set one, else its address)
function mailAt(env, request) {
  const via = typeof env?.MAIL_VIA === "string" && ORIGIN.test(env.MAIL_VIA.replace(/\/+$/, "")) ? env.MAIL_VIA.replace(/\/+$/, "") : null;
  return via || appOrigin("email", env, request);
}

// Mail's answer, { people, updates, later: { n, next }, ahead?, trips? }, as numbers this card can say (and, where Mail
// gave them, the bookings and trips as the contract has them), or null. t: now, for the bookings' window
export function cardOf(a, own, t = Date.now()) {
  if (!a || typeof a !== "object" || Array.isArray(a)) return null;
  const people = count(a.people), updates = count(a.updates), l = a.later;
  if (people == null || updates == null || !l || typeof l !== "object" || Array.isArray(l)) return null;
  const n = count(l.n), next = when(l.next);
  if (n == null || next === undefined) return null;
  const card = { state: "ok", href: `${own}/`, people, updates, later: { n, next: n ? next : null, href: `${own}/#later` } };
  if (Array.isArray(a.ahead)) Object.assign(card, bookingsOf(a.ahead, a.trips, own, t));
  if (Array.isArray(a.parcels)) card.parcels = parcelsOf(a.parcels, own, t);
  if (Array.isArray(a.bills)) card.bills = billsOf(a.bills, own, t);
  if (Array.isArray(a.bills) || (a.money && typeof a.money === "object")) { const m = moneyOf(a.money); if (m) card.money = m; }
  return card;
}

// ---- the bookings and trips (Mail on Your Day, stage 1: the contract, yourday spec "The contract") ----
export const AHEAD_DAYS = 14, AHEAD_MAX = 40, TRIPS_MAX = 5, TRIP_SOON = 48 * 3600e3;
const BEFORE = 12 * 3600e3, DAY_MS = 864e5;
export const BOOKING_KINDS = ["flight", "train", "bus", "hotel", "car", "restaurant", "event", "booking"];
// (an id: Mail's, [A-Za-z0-9_-], and a repeating invite's dates <series>~<yyyymmdd>)
const ID = /^[A-Za-z0-9_~-]{1,64}$/;
// (plain text: no control or direction-changing characters, spaces made one, trimmed, and cut at a character to n, never
// through one; "" where nothing's left)
const plain = (v, n) => (typeof v === "string" ? [...v.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, " ").replace(/\s+/g, " ").trim()].slice(0, n).join("").trim() : "");
const zoneOk = (tz) => { if (typeof tz !== "string" || !tz || tz.length > 64) return false; try { new Intl.DateTimeFormat("en-GB", { timeZone: tz }); return true; } catch (_) { return false; } };
// (a place: its name, and where it gives both, its latitude and longitude; null where there's no name)
function placeOf(p) {
  if (!p || typeof p !== "object" || Array.isArray(p)) return null;
  const name = plain(p.name, 60);
  if (!name) return null;
  const lat = p.lat, lon = p.lon, at = typeof lat === "number" && typeof lon === "number" && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  return at ? { name, lat, lon } : { name };
}
// one of ahead's entries as the contract has it, or null
function bookingOf(b, own, t) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return null;
  const id = typeof b.id === "string" && ID.test(b.id) ? b.id : null, kind = BOOKING_KINDS.includes(b.kind) ? b.kind : null, title = plain(b.title, 80);
  const start = when(b.start);
  if (!id || !kind || !title || start == null || b.status === "cancelled" || (b.status != null && b.status !== "confirmed")) return null;
  const e = when(b.end), end = e != null && e >= start ? e : null;
  // (the contract's window: started no more than 12 hours ago (or not yet ended), and starting within 14 days)
  if (start > t + AHEAD_DAYS * DAY_MS || (end ?? start) < t - BEFORE) return null;
  const thread = typeof b.thread === "string" && ID.test(b.thread) ? b.thread : null;
  const out = {
    id, kind, title, sub: plain(b.sub, 120), start, end, tz: zoneOk(b.tz) ? b.tz : null, place: placeOf(b.place), ref: plain(b.ref, 24) || null,
    trip: typeof b.trip === "string" && ID.test(b.trip) ? b.trip : null, thread, href: thread ? `${own}/#thread=${thread}` : `${own}/`,
  };
  // (a repeating invite's: its words, the series' next dates, and where this one was moved, when it was)
  const repeat = plain(b.repeat, 40);
  if (repeat) {
    out.repeat = repeat;
    out.next = nextOf(b.next);
  }
  const was = when(b.was);
  if (was != null && was !== start) out.was = was;
  return out;
}
// (a series' next dates, at most 5, soonest first: { start, cancelled?: true, was? })
function nextOf(list) {
  const out = [];
  for (const x of Array.isArray(list) ? list.slice(0, 20) : []) {
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    const start = when(x.start), was = when(x.was);
    if (start == null || out.some((o) => o.start === start)) continue;
    out.push({ start, ...(x.cancelled === true ? { cancelled: true } : {}), ...(was != null && was !== start ? { was } : {}) });
  }
  return out.sort((a, b) => a.start - b.start).slice(0, NEXT_MAX);
}
// ahead and trips, each entry checked: { ahead, trips } (trips: [] where Mail gave ahead and no list of trips)
function bookingsOf(list, trips, own, t) {
  const seen = new Set(), ahead = [];
  for (const x of list.slice(0, 200)) {
    const b = bookingOf(x, own, t);
    if (b && !seen.has(b.id)) { seen.add(b.id); ahead.push(b); }
  }
  ahead.sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : 1));
  ahead.length = Math.min(ahead.length, AHEAD_MAX);
  const ids = new Set(ahead.map((b) => b.id)), out = [];
  for (const x of Array.isArray(trips) ? trips.slice(0, 50) : []) {
    if (!x || typeof x !== "object" || Array.isArray(x) || typeof x.id !== "string" || !ID.test(x.id) || out.some((o) => o.id === x.id)) continue;
    const name = plain(x.name, 60), start = when(x.start), e = when(x.end), destination = placeOf(x.destination);
    if (!name || start == null || !destination) continue;
    // (its bookings among ahead's, each once; a trip with none of them isn't one Today shows)
    const items = [...new Set(Array.isArray(x.items) ? x.items.filter((i) => typeof i === "string" && ids.has(i)) : [])];
    if (!items.length) continue;
    out.push({ id: x.id, name, start, end: e != null && e >= start ? e : null, destination, items, ...(Array.isArray(x.hidden) ? { hidden: hiddenOf(x.hidden, ids) } : {}) });
  }
  out.sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : 1));
  out.length = Math.min(out.length, TRIPS_MAX);
  // (a booking's trip, only where that trip's one of these and names it)
  const of = new Map(out.flatMap((tr) => tr.items.map((i) => [i, tr.id])));
  for (const b of ahead) b.trip = b.trip && of.get(b.id) === b.trip ? b.trip : of.get(b.id) || null;
  return { ahead, trips: out };
}

// (a trip's hidden bookings, for Put back: at most 10, each once, none that's also shown, soonest first)
function hiddenOf(list, shown) {
  const out = [];
  for (const x of Array.isArray(list) ? list.slice(0, 50) : []) {
    if (!x || typeof x !== "object" || Array.isArray(x) || typeof x.id !== "string" || !ID.test(x.id) || shown.has(x.id) || out.some((o) => o.id === x.id)) continue;
    const title = plain(x.title, 80), start = when(x.start);
    if (!title || start == null) continue;
    out.push({ id: x.id, title, sub: plain(x.sub, 120), start });
  }
  return out.sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : 1)).slice(0, HIDDEN_MAX);
}

// ---- parcels, bills and money (Mail on Your Day, stage 2: the contract, yourday2 spec "The contract") ----
export const PARCELS_MAX = 10, BILLS_MAX = 20, NEXT_MAX = 5, HIDDEN_MAX = 10;
export const BILL_KINDS = ["bill", "renewal", "trial", "sub"];
export const BILL_CATS = ["Home", "Phone and internet", "Subscriptions", "Car", "Other"];
const DELIVERED = 18 * 3600e3, RETURN_DAYS = 3, BILL_DAYS = 14;
// (an amount: whole pence, none below 0, and no more than a household's bill could be)
const pence = (v) => (Number.isInteger(v) && v >= 0 && v <= 1e8 ? v : null);
// (the courier's own tracking page: https, a host, no one's name or password in it; or none)
function trackOf(v) {
  if (typeof v !== "string" || v.length > 400 || /[\s\u0000-\u001f\u007f]/.test(v)) return null;
  try { const u = new URL(v); return u.protocol === "https:" && u.hostname && !u.username && !u.password ? u.href : null; } catch (_) { return null; }
}
// one of parcels' entries as the contract has it, or null
function parcelOf(p, own, t) {
  if (!p || typeof p !== "object" || Array.isArray(p)) return null;
  const id = typeof p.id === "string" && ID.test(p.id) ? p.id : null, shop = plain(p.shop, 40), carrier = plain(p.carrier, 40);
  const stage = Number.isInteger(p.stage) && p.stage >= 0 && p.stage <= 3 ? p.stage : null;
  if (!id || stage == null || (!shop && !carrier)) return null;
  const due = when(p.due) ?? null, deliveredAt = when(p.deliveredAt) ?? null, returnBy = when(p.returnBy) ?? null;
  let window = null;
  if (p.window && typeof p.window === "object" && !Array.isArray(p.window)) {
    const from = when(p.window.from), to = when(p.window.to);
    if (from != null && to != null && to >= from && to - from <= DAY_MS) window = { from, to };
  }
  // (the contract's: still on its way, or delivered within 18 hours, or its last day to return within 3 days (a day's
  // grace either side, as that day's end may be past 3 days from now, or a moment ago))
  const on = stage < 3 || (deliveredAt != null && deliveredAt >= t - DELIVERED) || (returnBy != null && returnBy >= t - DAY_MS && returnBy <= t + (RETURN_DAYS + 1) * DAY_MS);
  if (!on) return null;
  const thread = typeof p.thread === "string" && ID.test(p.thread) ? p.thread : null;
  return { id, shop, carrier, stage, window, due, deliveredAt, note: plain(p.note, 60), track: trackOf(p.track), ref: plain(p.ref, 32), order: plain(p.order, 32),
    thread, href: thread ? `${own}/#thread=${thread}` : `${own}/`, returnBy };
}
function parcelsOf(list, own, t) {
  const seen = new Set(), out = [];
  for (const x of list.slice(0, 100)) {
    const p = parcelOf(x, own, t);
    if (p && !seen.has(p.id)) { seen.add(p.id); out.push(p); }
  }
  const key = (p) => p.window?.from ?? p.due ?? p.returnBy ?? p.deliveredAt ?? Infinity;
  return out.sort((a, b) => key(a) - key(b) || (a.id < b.id ? -1 : 1)).slice(0, PARCELS_MAX);
}
// one of bills' entries as the contract has it, or null
function billOf(b, own, t) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return null;
  const id = typeof b.id === "string" && ID.test(b.id) ? b.id : null, kind = BILL_KINDS.includes(b.kind) ? b.kind : null, sender = plain(b.sender, 40), amount = pence(b.amount);
  if (!id || !kind || !sender || amount == null) return null;
  const due = when(b.due) ?? null;
  // (the contract's: due within 14 days (a day's grace for one due today), or a receipt with no date)
  if (due != null && (due > t + BILL_DAYS * DAY_MS || due < t - DAY_MS)) return null;
  const last = (Array.isArray(b.last) ? b.last.slice(-24) : []).map(pence).filter((v) => v != null).slice(-6);
  const thread = typeof b.thread === "string" && ID.test(b.thread) ? b.thread : null;
  return { id, kind, sender, cat: BILL_CATS.includes(b.cat) ? b.cat : "Other", amount, due, auto: b.auto === true, usual: pence(b.usual), was: pence(b.was), last,
    thread, href: thread ? `${own}/#thread=${thread}` : `${own}/` };
}
function billsOf(list, own, t) {
  const seen = new Set(), out = [];
  for (const x of list.slice(0, 200)) {
    const b = billOf(x, own, t);
    if (b && !seen.has(b.id)) { seen.add(b.id); out.push(b); }
  }
  return out.sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity) || (a.id < b.id ? -1 : 1)).slice(0, BILLS_MAX);
}
// money as the contract has it ({ month, n, months: [6, a month before Mail knew null], cats: [{ name, pence }], paidSelf: { n, pence } }), or null
// where its month isn't an amount; a part that's malformed left empty, never the rest
function moneyOf(m) {
  if (!m || typeof m !== "object" || Array.isArray(m)) return null;
  const month = pence(m.month);
  if (month == null) return null;
  const months = Array.isArray(m.months) && m.months.length === 6 && m.months.every((v) => v === null || pence(v) != null) && m.months[5] !== null ? [...m.months] : [];
  const cats = [];
  for (const c of Array.isArray(m.cats) ? m.cats.slice(0, 20) : []) {
    if (!c || typeof c !== "object" || !BILL_CATS.includes(c.name) || pence(c.pence) == null || cats.some((x) => x.name === c.name)) continue;
    cats.push({ name: c.name, pence: c.pence });
  }
  const ps = m.paidSelf && typeof m.paidSelf === "object" ? m.paidSelf : {};
  const paidSelf = count(ps.n) != null && pence(ps.pence) != null ? { n: ps.n, pence: ps.pence } : { n: 0, pence: 0 };
  return { month, n: count(m.n) ?? 0, months, cats, paidSelf };
}

// The trip Today shows as a card: of the card's trips, the soonest that starts within 48 hours or is under way (its end,
// or where it has none its last booking's, not yet past), with its bookings (soonest first). → { id, name, start, end,
// destination, items } or null
export function tripFor(card, t) {
  if (!card || !Array.isArray(card.trips) || !Array.isArray(card.ahead)) return null;
  for (const tr of card.trips) {
    const items = card.ahead.filter((b) => tr.items.includes(b.id)).sort((a, b) => a.start - b.start);
    if (!items.length) continue;
    const end = tr.end ?? Math.max(...items.map((b) => b.end ?? b.start));
    if (tr.start <= t + TRIP_SOON && end >= t) return { id: tr.id, name: tr.name, start: tr.start, end, destination: { ...tr.destination }, items, ...(tr.hidden ? { hidden: tr.hidden.map((x) => ({ ...x })) } : {}) };
  }
  return null;
}

// (the whole of it on one clock, from the moment it's asked: who the admin is, then Mail; past MAIL_CARD_MS, no card,
// however slow the database or Mail)
export async function mailCard(env, u, request = null, t = Date.now()) {
  const key = typeof env?.MAIL_KEY === "string" ? env.MAIL_KEY : "";
  if (!key || !u?.id) return null;
  const until = Date.now() + MAIL_CARD_MS, ac = new AbortController();
  const ask = (async () => {
    const admin = await pigeon().then((m) => m.adminOf(env)).catch(() => null);
    if (!admin || admin.id !== u.id || ac.signal.aborted) return null;
    const own = appOrigin("email", env, request);
    const res = await siteFetch(env, `${mailAt(env, request)}/api/connector/card`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, redirect: "manual",
      signal: AbortSignal.any([ac.signal, AbortSignal.timeout(Math.max(1, until - Date.now()))]),
    });
    if (res.status !== 200 || !/^application\/json\b/i.test(res.headers.get("Content-Type") || "")) { res.body?.cancel?.().catch?.(() => {}); return null; }
    return cardOf(await res.json(), own, t);
  })();
  // (however it goes, never longer than its time: then what's still asked is called off)
  let timer;
  const late = new Promise((done) => { timer = setTimeout(() => { ac.abort(); done(null); }, Math.max(0, until - Date.now())); });
  try { return await Promise.race([ask.catch(() => null), late]); } finally { clearTimeout(timer); }
}

// Today's Hide: one booking (or parcel, or bill; a repeating invite's date hides its series) hidden in Mail (POST
// /api/connector/hide { id }, with the key the two share), for the site's admin alone, as Mail's card is; and Put back,
// one hidden put back (POST /api/connector/unhide { id }). Mail answers 204; one it no longer has (404) is as good as
// done; anything else is said as not done. → { ok: true }
export const mailHide = (env, u, id, request = null) => mailSays(env, u, id, request, "hide");
export const mailUnhide = (env, u, id, request = null) => mailSays(env, u, id, request, "unhide");
async function mailSays(env, u, id, request, what) {
  const key = typeof env?.MAIL_KEY === "string" ? env.MAIL_KEY : "";
  if (typeof id !== "string" || !ID.test(id)) throw new HttpError(400, "Which booking?");
  if (!key) throw new HttpError(503, "Mail isn’t connected to Today just now.");
  const admin = await pigeon().then((m) => m.adminOf(env)).catch(() => null);
  if (!admin || admin.id !== u?.id) throw new HttpError(403, "Only Mail’s owner can do that.");
  let res;
  try {
    res = await siteFetch(env, `${mailAt(env, request)}/api/connector/${what}`, {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ id }),
      redirect: "manual", signal: AbortSignal.timeout(5000),
    });
  } catch (_) { throw new HttpError(502, "Couldn’t reach Mail just now. Try again in a moment."); }
  res.body?.cancel?.().catch?.(() => {});
  // (one Mail no longer has, 404, is as good as done: gone from Mail, or nothing there to put back)
  if ((res.status < 200 || res.status >= 300) && res.status !== 404) throw new HttpError(502, what === "hide" ? "Mail didn’t take it off just now. Try again in a moment." : "Mail didn’t put it back just now. Try again in a moment.");
  return { ok: true };
}
