// Chat's "Send to a friend", the server's part (pigeon/cards.js has the card itself, which travels sealed inside the
// letter: the server never sees a card, a request, an invite or an answer). Routes in Chat's API (functions/api/pigeon):
//   POST card-now    the live "Now" of up to 12 cards at once: a weather cell's weather, a stock's percent, whether a
//                    session sent by a friend got done. Names no letter.
//   POST share-rank  rain at a few friends' places, for the share sheet's reasons and "Before the Rain" (never their places)
//   GET  my-card     your own card of a kind, for "How's yours?": read from your own apps, nothing written
//   POST fit-share   a share id for your session as it's sent (or { drop } to take one back when nothing went)
//   GET  together    the best times for a ride or run with a friend, dry for you both (Fitness's own forecast for each)
//   POST fit-offer   a plan agreed in Chat put in your own Fitness, for you to add there; since Today First, with the
//                    friend (with, only once pg_links says so), the inviter's own row as the invite goes (state
//                    "pending", with its other times, opts), and the friend's Yes (re) making that row a plan to add
//   POST time-offer  a call or a meeting offered or agreed in Chat (Today First), each person's own row (functions/_times.js),
//                    the friend's Yes making the inviter's pending one agreed, with the inviter's phone shut (TIME_ROUTES)
// Every route: signed in to Chat, limited for each account, friends only (pg_links 'ok'), and each answer built from a
// list of what it may say (a unit test holds each to its list). Only fit-share, fit-offer and time-offer keep anything,
// and only times and ids (never a word of a letter): in the asker's own rows, and, for a Yes, the inviter's pending row
// for that friend alone (functions/_fitshare.js, functions/_times.js).

import { HttpError, json, body, db, limit, requireUser, haversineKm, logError, UUID_RE, pace } from "./_pigeon.js";
import { cellNow, weatherSend } from "./_todaywx.js";
import { cardsFor, Quiet } from "./_todaycards.js";
import { quotes, cleanSymbol, dayIn, holdings } from "./_markets.js";
import { kept } from "./_wxacct.js";
import { hoursAt } from "./_fitwx.js";
import { todayLinks } from "./_sites.js";
import { shareFor, dropShare, fitNowMany, addOffer, promoteOffer, SHARE_ID } from "./_fitshare.js";
import { addTime } from "./_times.js";
import { normCard, zoneOk, ASK_KINDS } from "../pigeon/cards.js";
import { bestTogether } from "../fitness/besttime.js";
import { workoutById, measure } from "../fitness/workouts.js";
import { stockSendCard } from "../markets/send.js";

const MIN = 60e3, HOUR = 60 * MIN;
const QUIET = Object.freeze({ quiet: true });
// (a place's cell, about 5 km: as Today's and the tick's are)
const snap = (v) => Math.round(v * 20) / 20;
const r2 = (v) => Math.round(v * 100) / 100;
const FLOCK = "You can only send pigeons to your flock.";

// One paid forecast for Chat's live looks, out of two allowances, each an hour: 4 for the account, 12 for everyone
// together (at most 84 of the ~333 an hour the ticks earn: functions/_wxpush.js). Over either, Quiet: nothing's fetched.
// Asked only on a miss (a forecast this data centre has already costs nothing).
export async function liveMiss(env, userId) {
  for (const [key, max] of [[`livewx:${userId}`, 4], ["livewx:site", 12]]) {
    try { await limit(env, key, max, HOUR); }
    catch (e) { if (e instanceof HttpError && e.status === 429) throw new Quiet("Live weather's allowance is spent for now."); throw e; }
  }
}

// Which of ids are the account's friends (one query) → Set
async function friendsOf(D, me, ids) {
  if (!ids.length) return new Set();
  const q = ids.map(() => "?").join(", ");
  const { results } = await D.prepare(`SELECT CASE WHEN a = ?1 THEN b ELSE a END AS id FROM pg_links WHERE status = 'ok' AND ((a = ?1 AND b IN (${q})) OR (b = ?1 AND a IN (${q})))`)
    .bind(me, ...ids, ...ids).all();
  return new Set((results || []).map((r) => r.id));
}
// A friend's first name, as their Chat name has it (their handle where it has none), only while they're the account's
// friend (pg_links 'ok') → the name, or null (not a friend, or not an id)
async function friendName(D, me, id) {
  if (typeof id !== "string" || !id || id.length > 64 || id === me) return null;
  const p = await D.prepare(`SELECT p.name, p.handle FROM pg_users p WHERE p.id = ?2
    AND EXISTS (SELECT 1 FROM pg_links WHERE status = 'ok' AND ((a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1)))`).bind(me, id).first();
  return p ? (String(p.name || "").trim().split(/\s+/)[0] || String(p.handle || "")).slice(0, 40) || null : null;
}
// (a live weather answer, as it may be said: °C, real ms)
const wxNow = (n) => ({ temp: n.temp, feels: n.feels, code: n.code, isDay: !!n.isDay, hi: n.hi, lo: n.lo, rain: rainOut(n.rain), at: n.at });
const rainOut = (r) => (r && typeof r === "object" ? { now: !!r.now, ...(Number.isFinite(r.at) ? { at: r.at } : {}), ...(Number.isFinite(r.end) ? { end: r.end } : {}) } : null);
const quietly = (env, where) => (e) => { if (!(e instanceof Quiet)) logError(env, where, e); return null; };

async function cardNow({ request, env }) {
  const u = await requireUser(request, env);
  await pace(env, `cardnow:${u.id}`, 240, HOUR);
  const b = await body(request, 16 * 1024), t = Date.now();
  const items = Array.isArray(b?.items) ? b.items.slice(0, 12) : [];
  const out = items.map(() => QUIET);
  // weather: 3 cells at most, each re-snapped here
  const cells = new Map();
  items.forEach((it, i) => {
    if (it?.k !== "weather" || !Array.isArray(it.cell) || it.cell.length !== 2) return;
    const lat = Number(it.cell[0]), lon = Number(it.cell[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
    const k = `${snap(lat).toFixed(2)},${snap(lon).toFixed(2)}`;
    if (!cells.has(k)) { if (cells.size >= 3) return; cells.set(k, { lat: snap(lat), lon: snap(lon), at: [] }); }
    cells.get(k).at.push(i);
  });
  // markets: 6 symbols at most
  const syms = new Map();
  items.forEach((it, i) => {
    if (it?.k !== "markets") return;
    let s; try { s = cleanSymbol(it.sym); } catch (_) { return; }
    if (!syms.has(s)) { if (syms.size >= 6) return; syms.set(s, []); }
    syms.get(s).push(i);
  });
  // fitness: 4 at most
  const fits = [];
  items.forEach((it, i) => { if (it?.k === "fitness" && typeof it.share === "string" && SHARE_ID.test(it.share) && fits.length < 4) fits.push(i); });

  await Promise.all([
    // (the cells one after another: each paid ask claims from the allowance as it was read, which two at once would race for)
    (async () => {
      for (const c of cells.values()) {
        const n = await cellNow(env, c.lat, c.lon, t, { userId: u.id }).catch(quietly(env, "card-now weather"));
        if (n) for (const i of c.at) out[i] = wxNow(n);
      }
    })(),
    (async () => {
      if (!syms.size) return;
      const q = await quotes(env, [...syms.keys()], Date.now() + 3000).catch(quietly(env, "card-now markets"));
      for (const [s, at] of syms) {
        const x = q?.[s];
        if (!x || !Number.isFinite(x.chgPct)) continue;
        const v = { pct: r2(x.chgPct), day: x.time ? dayIn(x.tz, x.time * 1000) : null, stale: !!x.stale, at: x.time ? x.time * 1000 : null };
        for (const i of at) out[i] = v;
      }
    })(),
    (async () => {
      if (!fits.length) return;
      const got = await fitNowMany(env, fits.map((i) => items[i].share), u.id).catch(quietly(env, "card-now fitness"));
      if (got) fits.forEach((i, j) => { const g = got[j]; out[i] = g?.gone ? { gone: true } : g?.done ? { done: true, ...Object.fromEntries(["secs", "dist", "tss"].filter((k) => Number.isFinite(g[k])).map((k) => [k, g[k]])) } : { done: false }; });
    })(),
  ]);
  return json({ now: out });
}

async function shareRank({ request, env }) {
  const u = await requireUser(request, env);
  await limit(env, `sharerank:${u.id}`, 10, HOUR);
  const b = await body(request, 8 * 1024), t = Date.now();
  if (b?.kind !== "weather" || !Array.isArray(b.ids)) throw new HttpError(400, "Bad request.");
  const ids = [...new Set(b.ids.filter((x) => typeof x === "string" && x && x.length <= 64))].slice(0, 6);
  const D = await db(env), ok = await friendsOf(D, u.id, ids);
  if (ids.some((id) => !ok.has(id))) throw new HttpError(403, FLOCK);
  const rain = {};
  if (!ids.length) return json({ rain });
  const { results } = await D.prepare(`SELECT id, lat, lon FROM pg_users WHERE id IN (${ids.map(() => "?").join(", ")})`).bind(...ids).all();
  const at = new Map((results || []).map((r) => [r.id, r]));
  // each friend's cell (their place, already snapped to a mile or 10 km, snapped again), 3 cells at most
  const cells = new Map();
  for (const id of ids) {
    const p = at.get(id);
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    const k = `${snap(p.lat).toFixed(2)},${snap(p.lon).toFixed(2)}`;
    if (!cells.has(k)) { if (cells.size >= 3) continue; cells.set(k, { lat: snap(p.lat), lon: snap(p.lon), ids: [] }); }
    cells.get(k).ids.push(id);
  }
  for (const c of cells.values()) {
    const n = await cellNow(env, c.lat, c.lon, t, { userId: u.id }).catch(quietly(env, "share-rank"));
    if (n) for (const id of c.ids) rain[id] = rainOut(n.rain);
  }
  return json({ rain });
}

// What each app's empty card says to "How's yours?", and where to go
const EMPTY = {
  weather: "Add a place in Weather, and yours can go back.",
  fitness: "Open Fitness first, and today’s session can go back.",
  markets: "Add a holding in Markets first, and yours can go back.",
};
// (an app with something, but nothing that day to send)
const NONE = { fitness: "There’s no session today to send back.", markets: "Nothing’s traded today yet, so there’s no move to send back." };
const COULDNT = "Couldn’t get yours just now. Try again in a moment.";
const APP = { weather: "weather", fitness: "fitness", markets: "finance" };
async function myCard({ request, env }) {
  const u = await requireUser(request, env);
  await pace(env, `mycard:${u.id}`, 60, HOUR);
  const q = new URL(request.url).searchParams, kind = q.get("kind"), tz = zoneOk(q.get("tz")) ? q.get("tz") : "Europe/London";
  if (!ASK_KINDS.includes(kind)) throw new HttpError(400, "Bad request.");
  const links = todayLinks(env, request), href = `${links[APP[kind]]}/`, t = Date.now();
  const answer = (card) => {
    const c = card ? normCard(card) : null;
    if (c && c.kind === kind) { if (c.ref?.share) delete c.ref; return json({ card: c }); }
    return null;
  };
  // (Today First: one stock of yours by its symbol, for the + sheet in a chat that's spoken of it)
  if (q.has("sym")) {
    if (kind !== "markets") throw new HttpError(400, "Bad request.");
    let sym; try { sym = cleanSymbol(q.get("sym")); } catch (_) { throw new HttpError(400, "Bad request."); }
    return stockCard(env, u, sym, t, href, answer);
  }
  let got = null;
  try { got = (await cardsFor(env, u, { only: [kind], t, request, purpose: "page", tz, links, keepSend: true, live: true })).cards[kind]; }
  catch (e) { if (!(e instanceof Quiet)) await logError(env, "my-card", e); }
  if (got?.state === "ok") return answer(got.send) || json({ card: null, said: NONE[kind] || COULDNT, href });
  // Weather with no place there: Chat's own place
  if (kind === "weather" && got?.state === "empty" && Number.isFinite(u.lat) && Number.isFinite(u.lon) && u.place) {
    const card = await weatherSend(env, { name: u.place, lat: u.lat, lon: u.lon }, t, { userId: u.id }).catch(quietly(env, "my-card weather"));
    return answer(card) || json({ card: null, said: COULDNT, href });
  }
  return json({ card: null, said: got?.state === "empty" ? EMPTY[kind] : COULDNT, href });
}

// A stock you hold (in Markets, with some owned: one you only follow isn't yours to send from here) as Markets sends it
// (markets/send.js stockSendCard): its day's move in percent, and nothing more: never a price, a value, what you hold or
// any amount. A symbol you don't hold is said so, with nothing looked up
const NOT_HELD = "That isn’t one of your holdings in Markets.";
async function stockCard(env, u, sym, t, href, answer) {
  const mine = (await holdings(env, u.id).catch(() => [])).find((h) => h.symbol === sym && h.qty > 0);
  if (!mine) return json({ card: null, said: NOT_HELD, href });
  const x = (await quotes(env, [sym], Date.now() + 3000).catch(quietly(env, "my-card stock")))?.[sym];
  if (!x || !Number.isFinite(x.chgPct)) return json({ card: null, said: COULDNT, href });
  return answer(stockSendCard(sym, mine.name, { chgPct: x.chgPct, tz: x.tz, time: x.time }, t)) || json({ card: null, said: COULDNT, href });
}

async function fitShare({ request, env }) {
  const u = await requireUser(request, env);
  await pace(env, `fitshare:${u.id}`, 60, HOUR);
  const b = await body(request, 4 * 1024);
  if (b && b.drop != null) {
    if (typeof b.drop !== "string" || !SHARE_ID.test(b.drop)) throw new HttpError(400, "Bad request.");
    await dropShare(env, u.id, b.drop);
    return json({ ok: true });
  }
  return json({ id: await shareFor(env, u.id, { day: b?.day, tz: b?.tz, sport: b?.sport }) });
}

// ---- a plan for two ----
const SOCIAL = { ride: "free-ride", run: "run-easy-40" };
// the workout: the card's, where it's in Fitness's library and of the plan's sport; else the social one
export function workoutFor(wid, sport) {
  let w = typeof wid === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(wid) ? workoutById(wid) : null;
  if (!w || w.sport !== sport) w = workoutById(SOCIAL[sport]);
  return { wid: w.id, name: w.name, secs: Math.round(measure(w).secs) };
}
const TOGETHER_S = 1800;
async function together({ request, env, waitUntil }) {
  const u = await requireUser(request, env);
  await limit(env, `together:${u.id}`, 10, HOUR);
  const q = new URL(request.url).searchParams, other = q.get("with") || "", sport = q.get("sport"), t = Date.now();
  if (!["ride", "run"].includes(sport) || !other || other.length > 64 || other === u.id) throw new HttpError(400, "Bad request.");
  const D = await db(env);
  if (!(await friendsOf(D, u.id, [other])).has(other)) throw new HttpError(403, FLOCK);
  const workout = workoutFor(q.get("wid"), sport);
  const asked = Number(q.get("after")), after = Math.min(t + 3 * 24 * HOUR, Math.max(t + 30 * MIN, Number.isFinite(asked) ? asked : 0));
  const quarter = Math.ceil(after / (15 * MIN)) * 15 * MIN;
  // (kept half an hour for the two of them, this sport, workout and start: a key that's never asked for anywhere)
  const cache = typeof caches !== "undefined" && caches.default ? caches.default : null;
  const key = cache && new Request(`https://together.cache.invalid/${encodeURIComponent(u.id)}/${encodeURIComponent(other)}/${sport}/${workout.wid}/${quarter}`);
  if (cache) { const hit = await cache.match(key).catch(() => null); if (hit) return json(await hit.json()); }
  const quiet = { workout, windows: [], hours: [], far: false, quiet: true };
  try { await limit(env, "together:site", 40, HOUR); } catch (e) { if (e instanceof HttpError && e.status === 429) return json(quiet); throw e; }
  // my place: my first in Weather, else Chat's; theirs: Chat's (never their Weather places)
  const mine = (await kept(env, u.id).catch(() => null))?.data?.places?.[0];
  const me = mine && Number.isFinite(+mine.lat) && Number.isFinite(+mine.lon) ? { lat: +mine.lat, lon: +mine.lon } : Number.isFinite(u.lat) && Number.isFinite(u.lon) ? { lat: u.lat, lon: u.lon } : null;
  const p = await D.prepare("SELECT lat, lon FROM pg_users WHERE id = ?").bind(other).first();
  const them = p && Number.isFinite(p.lat) && Number.isFinite(p.lon) ? { lat: snap(p.lat), lon: snap(p.lon) } : null;
  let out;
  if (!me || !them) out = { workout, windows: [], hours: [], far: false };
  else {
    let a, b;
    try { [a, b] = await Promise.all([hoursAt(env, me.lat, me.lon), hoursAt(env, them.lat, them.lon)]); }
    catch (_) { return json(quiet); }
    const bt = bestTogether(a, b, { len: Math.ceil(workout.secs / 3600), sport, now: t, after, days: 3, top: 3 });
    const side = (x) => ({ temp: Number.isFinite(x?.temp) ? x.temp : null, pop: Number.isFinite(x?.pop) ? x.pop : null });
    out = {
      workout,
      windows: (bt.windows || []).slice(0, 3).map((w) => ({ start: w.start, end: w.end, rating: w.rating, dry: !!w.dry, me: side(w.me), them: side(w.them) })),
      hours: (bt.hours || []).slice(0, 14).map((h) => ({ t: h.t, me: h.me, them: h.them })),
      far: haversineKm(me.lat, me.lon, them.lat, them.lon) > 40,
    };
  }
  if (cache) {
    const put = cache.put(key, new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${TOGETHER_S}` } })).catch(() => {});
    if (typeof waitUntil === "function") waitUntil(put); else await put;
  }
  return json(out);
}

// A plan put in your own Fitness (functions/_fitshare.js addOffer), built only from fields checked here or there, never
// the request passed on whole. with: the friend's id, stored only once pg_links says they're your friend (otherwise as
// an older Chat's offer is, with no friend's id: and an invite's pending row, which is only for a friend's answer, not at
// all). The inviter as the invite goes: state "pending" with its other times (opts), keyed by the invite letter's id.
// The friend's Yes (role "answered", with, re: the invite's id): their own plan as before, and the inviter's pending row
// for them alone, at its own time or one of its opts, becomes a plan to add in the inviter's Fitness (promoteOffer),
// with the inviter's phone shut; that's made even where the answerer's own Fitness has no room for one more. A pending
// row that comes after the friend's Yes did (the inviter's phone offline as the invite went) is made a plan at once
// where their answered plan with the inviter is there at one of the times it offered (answeredFirst). With a friend,
// who is always their first name as the server has it (as time-offer's is), so an older Chat's later call, which
// sends no with, still finds the same ride by it.
async function fitOffer({ request, env }) {
  const u = await requireUser(request, env);
  await pace(env, `fitoffer:${u.id}`, 30, HOUR);
  const b = await body(request, 4 * 1024), t = Date.now(), x = b && typeof b === "object" && !Array.isArray(b) ? b : {};
  if (x.with != null && (typeof x.with !== "string" || !x.with || x.with.length > 64)) throw new HttpError(400, "Bad request.");
  if (x.re != null && (typeof x.re !== "string" || !UUID_RE.test(x.re.toLowerCase()))) throw new HttpError(400, "Bad request.");
  const name = x.with != null ? await friendName(await db(env), u.id, x.with) : null, withId = name ? x.with : null, pending = x.state === "pending";
  if (pending && !withId) throw new HttpError(403, FLOCK);
  const o = { id: x.id, start: x.start, stop: x.stop, tz: x.tz, sport: x.sport, wid: x.wid, name: x.name, secs: x.secs, who: withId ? name : x.who,
    role: x.role, far: x.far, dry: x.dry, ...(withId ? { withId } : {}), ...(pending ? { state: "pending", opts: x.opts } : {}) };
  const promote = x.role === "answered" && withId && x.re != null;
  let held = null;
  try { await addOffer(env, u.id, o, { t, checked: true }); }
  catch (e) { if (!promote || !(e instanceof HttpError) || e.status !== 409) throw e; held = e; }
  if (promote) await promoteOffer(env, withId, x.re.toLowerCase(), u.id, Number(x.start), Number(x.stop), { t });
  if (held) throw held;
  if (pending) await answeredFirst(env, u.id, withId, x, t).catch((e) => logError(env, "fit-offer answered first", e));
  return json({ ok: true });
}
// (the invite's own pending row, just written, where the friend's Yes came first: their answered plan with the inviter
// (with_id) at one of the times the invite offered, new or added, still to come → promoteOffer at that time, as the
// Yes would have. Asked after the row's written, so a Yes coming in between is found by one or the other. Nothing said
// either way)
async function answeredFirst(env, me, withId, x, t) {
  const times = [[x.start, x.stop], ...(Array.isArray(x.opts) ? x.opts : []).map((w) => (Array.isArray(w) ? w : [w?.start, w?.stop ?? w?.end]))]
    .filter(([s, e]) => Number.isSafeInteger(s) && Number.isSafeInteger(e)).slice(0, 4);
  if (typeof x.id !== "string" || !times.length) return;
  const a = await (await db(env)).prepare(`SELECT start, stop FROM fx_offers WHERE user_id = ? AND with_id = ? AND role = 'answered' AND state IN ('new', 'yes')
      AND until > ? AND stop > ? AND (${times.map(() => "(start = ? AND stop = ?)").join(" OR ")}) ORDER BY start LIMIT 1`)
    .bind(withId, me, t, t, ...times.flat()).first();
  if (a) await promoteOffer(env, me, x.id.toLowerCase(), withId, a.start, a.stop, { t });
}

// ---- a time to talk (Today First, spec §6.3, §8.4) ----
// A call or a meeting with a friend, offered or agreed in Chat: { id (the invite letter's), kind ("call" | "meet"),
// start, stop, tz, with (the friend's id), role ("asked" | "answered"), state? ("pending": the inviter, as the invite
// goes), opts? (its other times, [[start, stop]], at most 3) }. Your own row only, with your friend's first name looked up
// here; the friend's Yes also makes the inviter's pending row agreed at the time chosen, in the same batch, with the
// inviter's phone shut. Says only { ok: true }: never whether the other side had a row. (functions/_times.js addTime)
async function timeOffer({ request, env }) {
  const u = await requireUser(request, env);
  await pace(env, `timeoffer:${u.id}`, 30, HOUR);
  const b = await body(request, 4 * 1024), t = Date.now(), x = b && typeof b === "object" && !Array.isArray(b) ? b : {};
  if (typeof x.with !== "string" || !x.with || x.with.length > 64 || x.with === u.id) throw new HttpError(400, "Bad request.");
  const who = await friendName(await db(env), u.id, x.with);
  if (!who) throw new HttpError(403, FLOCK);
  await addTime(env, u, { id: x.id, kind: x.kind, start: x.start, stop: x.stop, tz: x.tz, withId: x.with, who, role: x.role, state: x.state, opts: x.opts }, { t });
  return json({ ok: true });
}

export const SHARE_ROUTES = {
  "POST card-now": cardNow, "POST share-rank": shareRank, "GET my-card": myCard, "POST fit-share": fitShare, "GET together": together, "POST fit-offer": fitOffer,
};
// (Today First's, beside them in Chat's API: functions/api/pigeon. Its own list, as SHARE_ROUTES' keys are pinned)
export const TIME_ROUTES = { "POST time-offer": timeOffer };
