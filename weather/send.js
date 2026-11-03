// Weather's "Send to a friend": the forecast here, as a card for Chat (pigeon/cards.js: the same shape, made here from
// the page's own forecast), and the way to Chat with it. Chat draws the card in the letter, and looks the forecast up
// again for the friend, from the card's cell (about 5 km: never the place itself). Nothing here asks anything of a
// server: the card goes in the address's fragment, which never reaches one.
// (no page in it: node imports it too, for the tests)
import { nowcast, isWet, hourAt, dayOf, windows, ACTIVITIES } from "./insights.js";
import { makeFormat } from "./format.js";

const HOUR = 3600e3;
// (a place's cell, as Today's server cards and Chat have them: 0.05°, about 5 km)
const snap = (v) => Math.round(v * 20) / 20;
const r1 = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 10) / 10);
const lower = (s) => String(s).replace(/^\w/, (c) => c.toLowerCase());
// (a zone a browser knows, else none: the card's zone is only ever for its words)
function zoneOk(tz) {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try { new Intl.DateTimeFormat("en-GB", { timeZone: tz }); return true; } catch (_) { return false; }
}
// The headline's first sentence, as the page shows it in bold (app.js hero)
export const leadOf = (said) => (/^(.+?[.!?])\s+(?=[A-Z])(.*)$/s.exec(String(said || "")) || [, String(said || "")])[1];

// Rain at the place in real moments (epoch ms, not the place's wall ms), as Today's server card has it
// (functions/_todaywx.js rainOf): the quarter hours first (nowcast), then the first wet hour in the next 12, with when
// it stops. → { now, at?, end? }, or null: dry for 12 hours
function rainOf(wx, now, offset) {
  const real = (w) => (Number.isFinite(w) ? w - offset * 1000 : null), keep = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null));
  const nc = nowcast(wx, now, makeFormat({}));
  if (nc) return keep({ now: !!nc.now, at: nc.now ? null : real(nc.startsAt), end: real(nc.endsAt) });
  const q = (wx.minutely || []).filter((x) => x.t + 15 * 60e3 > now), past = q.length >= 4 ? q.at(-1).t + 15 * 60e3 : now;
  const hours = (wx.hourly || []).filter((h) => h.t + HOUR > past && h.t < now + 12 * HOUR), i = hours.findIndex((h) => isWet(h));
  if (i < 0) return null;
  const h = hours[i], on = h.t <= now && q.length < 4;
  const dry = wx.hourly.find((x) => x.t > h.t && !isWet(x));
  return keep({ now: on, at: on ? null : real(Math.max(h.t, past)), end: dry ? real(dry.t) : null });
}
// The best dry spell for a ride or a run in the next two days (over by 48 h from now), as the page's Best times has them (insights.js windows,
// with your own limits for each, where you've set them), not a poor one: for a plan made from the card in Chat
// → { act: "cycle" | "run", start, end, rating } in real ms, or null
function spellOf(wx, now, f, activities, offset) {
  const mine = Array.isArray(activities) ? activities : [];
  const acts = ["cycle", "run"].map((id) => ({ ...ACTIVITIES[id], ...(mine.find((a) => a?.id === id) || {}), id, on: true }));
  let best = null;
  for (const w of windows(wx, now, f, { activities: acts, extras: { laundry: false, stars: false, sunset: false } })) {
    if ((w.id !== "cycle" && w.id !== "run") || w.rating === "Poor" || w.start == null || w.end == null || w.end > now + 48 * HOUR) continue;
    if (!best || w.score > best.score) best = w;
  }
  return best ? { act: best.id, start: best.start - offset * 1000, end: best.end - offset * 1000, rating: best.rating } : null;
}

// The card (pigeon/cards.js §1.2, from "weather"), from the page's shaped forecast (wx: data.js shapeForecast, as
// app.js has it in S.wx), now in the place's wall ms (format.js nowWall), f the page's format (for the headline in your
// units). The place's name and its 0.05° cell; never its exact place, nor any warning (a card can't carry one). → card
// or null (nothing to say for now)
export function weatherSendCard(wx, now, f = makeFormat({}), { activities, name, headline } = {}) {
  if (!wx || !Array.isArray(wx.hourly) || !wx.hourly.length || !wx.place) return null;
  const lat = Number(wx.place.lat), lon = Number(wx.place.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const offset = Number(wx.place.offset) || 0, cur = wx.current || hourAt(wx, now), d = dayOf(wx, now);
  if (!cur) return null;
  const place = String(name || wx.place.name || "").replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "Here";
  const lead = leadOf(headline || "").slice(0, 140);
  const tz = zoneOk(wx.place.tz) ? wx.place.tz : null;
  const s = { place, ...(tz ? { tz } : {}), temp: r1(cur.temp), feels: r1(cur.feels), code: Number.isFinite(cur.code) ? cur.code : null, isDay: !!cur.isDay,
    hi: r1(d?.tmax), lo: r1(d?.tmin), lead, rain: rainOf(wx, now, offset), spell: spellOf(wx, now, f, activities, offset) };
  for (const k of Object.keys(s)) if ((s[k] == null || s[k] === "") && k !== "rain" && k !== "spell") delete s[k];
  const say = (lead ? `${place} today: ${lower(lead)}` : `The weather in ${place}.`).slice(0, 200);
  return { v: 1, kind: "weather", from: "weather", at: Math.round(now - offset * 1000), say, snap: s, ref: { cell: [snap(lat), snap(lon)].map((x) => +x.toFixed(2) + 0) } };
}

// ---- to Chat: the same four lines in every app (pigeon/cards.js chatHash), the words first, so an older Chat, which
// reads only those, puts them in its message box as ever ----
const b64url = (s) => { let b = ""; for (const x of new TextEncoder().encode(s)) b += String.fromCharCode(x); return btoa(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
export function chatHash(words, card) {
  const packed = card ? b64url(JSON.stringify(card)) : "";
  return `#${new URLSearchParams(packed && packed.length <= 6000 ? { share: words, card: packed } : { share: words })}`;
}
// Chat, beside Weather (weather. → chat.), ending in "/", for chatPage() + chatHash(…); elsewhere (on no address of
// its own) none
export const chatPage = (loc = globalThis.location) => (loc?.hostname?.startsWith("weather.") ? `${loc.origin.replace("//weather.", "//chat.")}/` : null);
// The card as Chat's links carry it (pigeon/cards.js packCard: base64url, 6000 characters at most), for InFlite's hub,
// which hands it to Chat's own sheet; too long, or none, null (the words go alone)
export function packCard(card) {
  if (!card) return null;
  const s = b64url(JSON.stringify(card));
  return s.length <= 6000 ? s : null;
}
// Where Send goes (app.js sendToFriend). At InFlite's hub (Weather as a page of inflite.ai, hub.on: IFL.hub), the hub's
// own way: Chat's sheet over the page, sending without leaving it (IFL.hub.send(words, packed)) → { hub: true, words,
// packed }. Elsewhere, as ever: Chat beside Weather, the words and the card in the address's fragment → { url }; on no
// address of its own, null (the phone's own sharing, or copied)
export function sendWay(words, card, { hub, loc = globalThis.location } = {}) {
  if (hub?.on) return { hub: true, words, packed: packCard(card) };
  const page = chatPage(loc);
  return page ? { url: page + chatHash(words, card) } : null;
}
