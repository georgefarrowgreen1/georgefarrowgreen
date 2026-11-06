// Mail's card on Today (One roof stage 4, S4-D10, spec §2.5, §6.3): numbers only, asked of Mail's own Worker
// (email.inflite.ai, the inflite repo's email/) with the key the two share, for the site's admin alone. Never a word of
// anyone's mail: how many conversations from people are unread, how many in Updates, and how many are in Later with
// when the next comes back. Off the critical path: 700 ms at most, and anything but a 200 with those numbers is no card
// at all (Mail before 1.49 answers 401: never a stale or an error card).
//   mailCard(env, u, request?, t?) → null, or { state: "ok", href, people, updates, later: { n, next, href }, ahead?, trips? }
//     env.MAIL_KEY: the key (the Pages secret, the same as Mail's Worker's MAIL_KEY); none, no card and nothing asked
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
  return card;
}

// ---- the bookings and trips (Mail on Your Day, stage 1: the contract, yourday spec "The contract") ----
export const AHEAD_DAYS = 14, AHEAD_MAX = 40, TRIPS_MAX = 5, TRIP_SOON = 48 * 3600e3;
const BEFORE = 12 * 3600e3, DAY_MS = 864e5;
export const BOOKING_KINDS = ["flight", "train", "bus", "hotel", "car", "restaurant", "event", "booking"];
const ID = /^[A-Za-z0-9_-]{1,64}$/;
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
  return {
    id, kind, title, sub: plain(b.sub, 120), start, end, tz: zoneOk(b.tz) ? b.tz : null, place: placeOf(b.place), ref: plain(b.ref, 24) || null,
    trip: typeof b.trip === "string" && ID.test(b.trip) ? b.trip : null, thread, href: thread ? `${own}/#thread=${thread}` : `${own}/`,
  };
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
    out.push({ id: x.id, name, start, end: e != null && e >= start ? e : null, destination, items });
  }
  out.sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : 1));
  out.length = Math.min(out.length, TRIPS_MAX);
  // (a booking's trip, only where that trip's one of these and names it)
  const of = new Map(out.flatMap((tr) => tr.items.map((i) => [i, tr.id])));
  for (const b of ahead) b.trip = b.trip && of.get(b.id) === b.trip ? b.trip : of.get(b.id) || null;
  return { ahead, trips: out };
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
    if (tr.start <= t + TRIP_SOON && end >= t) return { id: tr.id, name: tr.name, start: tr.start, end, destination: { ...tr.destination }, items };
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

// Today's Hide: one booking hidden in Mail (POST /api/connector/hide { id }, with the key the two share), for the site's
// admin alone, as Mail's card is. Mail answers 204; anything else is said as not done. → { ok: true }
export async function mailHide(env, u, id, request = null) {
  const key = typeof env?.MAIL_KEY === "string" ? env.MAIL_KEY : "";
  if (typeof id !== "string" || !ID.test(id)) throw new HttpError(400, "Which booking?");
  if (!key) throw new HttpError(503, "Mail isn’t connected to Today just now.");
  const admin = await pigeon().then((m) => m.adminOf(env)).catch(() => null);
  if (!admin || admin.id !== u?.id) throw new HttpError(403, "Only Mail’s owner can do that.");
  let res;
  try {
    res = await siteFetch(env, `${mailAt(env, request)}/api/connector/hide`, {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ id }),
      redirect: "manual", signal: AbortSignal.timeout(5000),
    });
  } catch (_) { throw new HttpError(502, "Couldn’t reach Mail just now. Try again in a moment."); }
  res.body?.cancel?.().catch?.(() => {});
  // (a booking Mail no longer has, 404, is as good as hidden: gone from Mail, gone from Today)
  if ((res.status < 200 || res.status >= 300) && res.status !== 404) throw new HttpError(502, "Mail didn’t take it off just now. Try again in a moment.");
  return { ok: true };
}
