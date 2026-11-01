// InFlite Today's cards, worked out for the account: each card from its own app's data, with that app's own words
// (functions/_todaywx.js, _todaychat.js, _todayfit.js, _todaymkt.js), each in its own time, so one that's slow, or
// fails, is an error on its own card and not the page's. For Today's page (functions/_todayapp.js GET today/cards) and
// for the morning notification (functions/_todaymorning.js).

import { weatherCard } from "./_todaywx.js";
import { chatCard } from "./_todaychat.js";
import { fitnessCard } from "./_todayfit.js";
import { marketsCard } from "./_todaymkt.js";
import { db, logError } from "./_pigeon.js";
import { photoOf } from "./_profile.js";
import { todayLinks } from "./_sites.js";

export const CARD_KEYS = ["weather", "chat", "fitness", "markets"];

// how long each card has: the page's, and the morning's (the tick's, which has a little longer, nobody waiting on it)
const DEADLINE = { page: 7000, morning: 9000 };
export const cardMs = (purpose) => DEADLINE[purpose] || DEADLINE.page;

// A card not had, for a reason that's no fault of ours (it took too long, or what it needed from elsewhere wasn't to be
// had just now): its card says so, and nothing's logged
export class Quiet extends Error {}
// p, or a Quiet error once ms have gone
export function withDeadline(p, ms) {
  let timer;
  const late = new Promise((_, no) => { timer = setTimeout(() => no(new Quiet("Too slow.")), ms); });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

// What each card says when it couldn't be had (each card's own module says it too, with what it knows by then: the
// Weather card its place)
const COULDNT = { weather: "Couldn’t get the forecast just now.", chat: "Couldn’t get your pigeons just now.", fitness: "Couldn’t get today’s session just now.", markets: "Couldn’t get prices just now." };
const HEADS = { weather: (l) => `${l.weather}/`, chat: (l) => `${l.chat}/`, fitness: (l) => `${l.fitness}/#today`, markets: (l) => `${l.finance}/` };
export const couldnt = (key, links, more = {}) => ({ state: "error", href: HEADS[key](links), said: COULDNT[key], retry: true, ...more });

// A "Send to a friend" line, at most 500 characters (Chat's #share takes no more), cut at a word
export const SHARE_MAX = 500;
export function shareCut(s, n = SHARE_MAX) {
  if (typeof s !== "string") return null;
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 1), at = cut.lastIndexOf(" ");
  return `${(at > n / 2 ? cut.slice(0, at) : cut).replace(/[\s,;:.–—-]+$/, "")}…`;
}
// a name's first word ("Sam" for "Sam Lee"), as Chat calls people
export const firstWord = (name) => String(name ?? "").trim().split(/\s+/)[0] || "";
// whether a zone's a real one (cardsFor uses London's where it isn't)
export const zoneOk = (tz) => { if (typeof tz !== "string" || !tz || tz.length > 64) return false; try { dayFormat(tz); return true; } catch (_) { return false; } };

// The cards asked for (only), as at t, in the account's zone (tz), with the apps' addresses (links: functions/_sites.js
// todayLinks); memo: a Map the morning's tick shares between its accounts (forecasts, warnings, a ride's weather).
// purpose: "page" or "morning", which differ in how long each card has. env carries waitUntil where it can.
// → { at, tz, cards }
export async function cardsFor(env, u, { only = CARD_KEYS, t = Date.now(), request = null, purpose = "page", tz = "Europe/London", links, memo = null } = {}) {
  // (the cards' own functions, looked up here and not above: the card modules import this one back)
  const make = { weather: weatherCard, chat: chatCard, fitness: fitnessCard, markets: marketsCard };
  // (none asked for: none worked out; only left out: all four)
  const keys = CARD_KEYS.filter((k) => (Array.isArray(only) ? only : CARD_KEYS).includes(k));
  const zone = zoneOk(tz) ? tz : "Europe/London", ln = links || todayLinks(env, request), ms = cardMs(purpose);
  const ctx = { only: keys, t, request, purpose: purpose === "morning" ? "morning" : "page", tz: zone, links: ln, memo };
  const got = await Promise.all(keys.map((k) => withDeadline(Promise.resolve().then(() => make[k](env, u, ctx)), ms).catch(async (e) => {
    if (!(e instanceof Quiet)) await logError(env, `today ${k}`, e);
    return couldnt(k, ln);
  })));
  const cards = {};
  keys.forEach((k, i) => {
    const c = got[i];
    if (c && c.state === "ok" && "share" in c) c.share = c.share == null ? null : shareCut(c.share);
    cards[k] = c;
  });
  return { at: t, tz: zone, cards };
}

// Each account's last whole answer, kept a minute in this copy of the server, so a change to the morning's settings
// re-composes its preview from the same cards rather than working them all out again (200 accounts at most, the
// longest kept going first). get → { at, answer } or null
const MEMO_MS = 60e3, MEMO_MAX = 200, lastAnswers = new Map();
export const cardsMemo = {
  get(userId) {
    const m = lastAnswers.get(userId);
    if (m && Date.now() - m.at < MEMO_MS) return m;
    lastAnswers.delete(userId);
    return null;
  },
  set(userId, answer) {
    lastAnswers.delete(userId);
    lastAnswers.set(userId, { at: Date.now(), answer });
    if (lastAnswers.size > MEMO_MAX) lastAnswers.delete(lastAnswers.keys().next().value);
  },
};

// A friend's picture (or your own), for a card: as Chat shows it (functions/api/pigeon/[[path]].js getAvatar), only to
// a friend, someone who's asked to be yours, or someone in a group with you, and never across a block. → the picture's
// Response, or null
export async function avatarFor(env, viewerId, id) {
  id = String(id ?? "");
  if (!id || id.length > 64 || !viewerId) return null;
  if (id !== viewerId) {
    const l = await (await db(env)).prepare(`SELECT 1 FROM pg_links WHERE (a = ?2 AND b = ?1 AND status IN ('ok', 'pending')) OR (a = ?1 AND b = ?2 AND status = 'ok')
      UNION ALL SELECT 1 FROM pg_group_members x JOIN pg_group_members y ON y.group_id = x.group_id WHERE x.user_id = ?1 AND y.user_id = ?2
        AND NOT EXISTS (SELECT 1 FROM pg_links k WHERE k.status = 'blocked' AND ((k.a = ?1 AND k.b = ?2) OR (k.a = ?2 AND k.b = ?1))) LIMIT 1`).bind(viewerId, id).first();
    if (!l) return null;
  }
  return photoOf(env, id);
}

// The day it is in a zone at t, and when it starts and ends there: { day: "YYYY-MM-DD", start, end } (a day the clocks
// change on is 23 or 25 hours long)
const DAYKEY = new Map();
const dayFormat = (tz) => DAYKEY.get(tz) || DAYKEY.set(tz, new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })).get(tz);
const WALL = new Map();
const wallFormat = (tz) => WALL.get(tz) || WALL.set(tz, new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })).get(tz);
// (how far ahead of UTC the zone's clocks are at t, ms)
export const offsetAt = (tz, t) => {
  const p = Object.fromEntries(wallFormat(tz).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(t / 1000) * 1000;
};
// (the first moment of a day there: its midnight by the zone's clocks then, or, where the clocks jump past midnight,
// the moment they do)
const dayStartIn = (tz, day) => {
  const [y, m, d] = day.split("-").map(Number), wall = Date.UTC(y, m - 1, d), once = wall - offsetAt(tz, wall), twice = wall - offsetAt(tz, once);
  const ok = [once, twice].filter((s) => dayFormat(tz).format(new Date(s)) === day);
  return ok.length ? Math.min(...ok) : twice;
};
export function localDay(tz, t) {
  let zone = tz;
  try { dayFormat(zone); } catch (_) { zone = "Europe/London"; }
  const day = dayFormat(zone).format(new Date(t)), start = dayStartIn(zone, day);
  const [y, m, d] = day.split("-").map(Number), next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return { day, start, end: dayStartIn(zone, next) };
}
// a day key so many days on ("2026-11-02", 1 → "2026-11-03"), and its weekday's name
export const dayAfter = (day, n = 1) => { const [y, m, d] = day.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const weekdayOf = (day) => { const [y, m, d] = day.split("-").map(Number); return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]; };
