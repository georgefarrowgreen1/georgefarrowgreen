// InFlite Today's Weather card: the account's first place in Weather (functions/_wxacct.js), its weather now, the next
// hours, and the day in Weather's own words: its morning briefing's (weather/insights.js headline, weather/alerts.js
// briefing), with any official warning in force there (functions/_wxwarn.js, weather/official.js). The forecast is the
// one notifications use (not tuned), kept for its 0.05° cell, and asked for out of Open-Meteo's allowance Weather's own
// notifications share (functions/_wxpush.js allowance), so Today's pages can't spend the morning briefings' share.
// WXAPP_URL: tests only (a stand-in for Open-Meteo).

import { kept } from "./_wxacct.js";
import { wxdb, allowance, COST_FULL, OM_KEEP } from "./_wxpush.js";
import { warningsAt } from "./_wxwarn.js";
import { withDeadline, cardMs, couldnt, Quiet, zoneOk, offsetAt, withSend, withForDay } from "./_todaycards.js";
import { logError } from "./_pigeon.js";
import { shapeForecast, forecastQuery, placesFound } from "../weather/data.js";
import { makeFormat, nowWall, dayStart, HOUR, DAY } from "../weather/format.js";
import { headline, hoursFrom, hourAt, dayOf, phrase, hoursBetween } from "../weather/insights.js";
import { briefing } from "../weather/alerts.js";
import { codeInfo, label, iconOf } from "../weather/codes.js";
import { inForce, colourOf, titleOf, badgeOf, spanOf } from "../weather/official.js";
import { oneRain } from "../weather/agree.js";
import { nowcast, isWet } from "../weather/insights.js";
import { liveMiss } from "./_share.js";
import { hourScore, LIMITS } from "../fitness/besttime.js";

// a forecast kept this long for its cell (caches.default: each data centre its own)
const KEEP_S = 1800;
// (a place's cell: as the tick has them, about 5 km)
const snap = (v) => Math.round(v * 20) / 20;
const lower = (s) => String(s).replace(/^\w/, (c) => c.toLowerCase());

// One of Open-Meteo's forecasts paid for out of the allowance the ticks keep (wx_meta 'om_bucket'). For a page, only
// while what it leaves is at least half of what's kept for the morning's briefings (OM_KEEP), so a page can't spend
// what the briefings need between 06:00 and 08:00. For the morning's notification (purpose "morning"), from that
// reserve, down to nothing, as Weather's own briefing would have been: for an account with Today's morning on, it's in
// place of that briefing (Weather's tick doesn't send it, functions/_wxpush.js). Otherwise none (Quiet). Claimed
// against what was read, so a tick or another page writing between the two isn't written over: read again and tried
// once more.
async function charge(env, t, purpose) {
  const D = await wxdb(env), keep = purpose === "morning" ? 0 : OM_KEEP / 2;
  for (let i = 0; i < 2; i++) {
    const row = await D.prepare("SELECT v FROM wx_meta WHERE k = 'om_bucket'").first();
    let left = null;
    try { left = row ? JSON.parse(row.v) : null; } catch (_) {}
    const have = allowance(left, t);
    if (have - COST_FULL < keep) throw new Quiet(keep ? "Open-Meteo's allowance is kept for the morning's briefings." : "Open-Meteo's allowance is spent.");
    const v = JSON.stringify({ n: have - COST_FULL, at: t });
    const r = row ? await D.prepare("UPDATE wx_meta SET v = ?1 WHERE k = 'om_bucket' AND v IS ?2").bind(v, row.v).run()
      : await D.prepare("INSERT OR IGNORE INTO wx_meta (k, v) VALUES ('om_bucket', ?1)").bind(v).run();
    if (r.meta?.changes) return;
  }
  throw new Quiet("The allowance was busy.");
}

// The forecast for a place's cell (the JSON as Open-Meteo gives it): the tick's memo first, then this data centre's
// copy, then Open-Meteo itself, paid for (charge, as purpose allows). userId: for Chat's live cards and the like
// (functions/_share.js liveMiss), whose paid asks are counted for the account and for everyone, before any is made
async function forecastJson(env, slat, slon, t, purpose, userId = null, days = 3) {
  const url = `${env.WXAPP_URL || "https://api.open-meteo.com"}/v1/forecast?${forecastQuery(slat, slon, days)}`;
  const cache = typeof caches !== "undefined" && caches.default ? caches.default : null, key = cache && new Request(url);
  if (cache) { const hit = await cache.match(key).catch(() => null); if (hit) return hit.json(); }
  if (userId) await liveMiss(env, userId);
  await charge(env, t, purpose);
  // (Open-Meteo not answering, or not as it should, is no fault here: the card says so, and nothing's logged)
  const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } }).catch(() => { throw new Quiet("Open-Meteo didn't answer."); });
  if (!r.ok) throw new Quiet(`Open-Meteo answered ${r.status}.`);
  const text = await r.text(), j = JSON.parse(text);
  if (cache) {
    const put = cache.put(key, new Response(text, { headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${KEEP_S}` } })).catch(() => {});
    if (env.waitUntil) env.waitUntil(put); else await put;
  }
  return j;
}
// A cell's forecast and its official warnings, asked for together, once a tick however many accounts share the cell
// (memo: "wx:<lat>,<lon>" → { forecast, warnings }, each a promise). A place's warnings not had in 5 seconds are none.
function cellOf(env, slat, slon, t, memo, purpose, userId = null) {
  const k = `wx:${slat},${slon}`, had = memo?.get(k);
  if (had) return had;
  const c = {
    forecast: forecastJson(env, slat, slon, t, purpose, userId),
    warnings: withDeadline(warningsAt(env, slat, slon, t), 5000).then((r) => r?.warnings || []).catch(() => []),
  };
  c.forecast.catch(() => {});
  memo?.set(k, c);
  return c;
}

// ctx: functions/_todaycards.js cardsFor's
export async function weatherCard(env, u, ctx) {
  const started = Date.now(), { t, links, memo, purpose } = ctx;
  const { data } = await kept(env, u.id);
  const p = data?.places?.[0];
  if (!p || !Number.isFinite(+p.lat) || !Number.isFinite(+p.lon)) {
    return { state: "empty", href: `${links.weather}/`, said: "Add a place in Weather, and its day shows here.", action: { label: "Add a place in Weather", href: `${links.weather}/` } };
  }
  const place = { name: String(p.name || ""), lat: +p.lat, lon: +p.lon };
  const href = `${links.weather}/?lat=${place.lat}&lon=${place.lon}&name=${encodeURIComponent(place.name)}`;
  try {
    // (what's left of the card's time, a little kept back to say it couldn't, with its place)
    const left = cardMs(purpose) - (Date.now() - started) - 250;
    return await withDeadline(dayAt(env, place, href, data.settings || {}, t, memo, purpose, ctx.live || null, ctx.v === 2), Math.max(0, left));
  } catch (e) {
    if (!(e instanceof Quiet)) await logError(env, "today weather", e);
    return couldnt("weather", links, { href, place });
  }
}

async function dayAt(env, place, href, settings, t, memo, purpose, userId = null, v2 = false) {
  const slat = snap(place.lat), slon = snap(place.lon), c = cellOf(env, slat, slon, t, memo, purpose, userId);
  const [j, official] = await Promise.all([c.forecast, c.warnings]);
  let wx = shapeForecast(j, { name: place.name, lat: place.lat, lon: place.lon });
  if (!wx.hourly.length || !wx.daily.length) throw new Error("forecast: no hours");
  const offset = wx.place.offset || 0, now = nowWall(offset, t);
  // (its rain one story, as Weather tells it; no radar: the forecast's quarter hours lead, as the tick's do without it)
  wx = oneRain(wx, now);
  wx.official = official;
  const f = makeFormat(settings), clock = settings.clock === "12" ? "12" : "24";
  const cur = wx.current || hourAt(wx, now);
  if (!cur) throw new Error("forecast: nothing for now");
  const d = dayOf(wx, now);
  // the day's headline: its first sentence, and the rest
  const head = headline(wx, now, f), cut = /^(.+?[.!?])(?:\s+|$)([\s\S]*)$/.exec(head);
  const lead = cut ? cut[1] : head, more = cut ? cut[2].trim() : "";
  // the official warning in force now (the worst, then the soonest), in Weather's words: its briefing's sentence
  const w = inForce(wx.official, t)[0];
  let warning = null;
  if (w) {
    const title = titleOf(w), badge = badgeOf(w), span = spanOf(w, now, f, offset);
    warning = { colour: colourOf(w), chip: `${badge ? `${badge} ${title.toLowerCase()}` : title} ${lower(span)}`, issuer: w.issuer || "", title, span,
      said: `${w.issuer}: ${badge ? `${badge.toLowerCase()} ` : ""}${title.toLowerCase()} ${lower(span)}.` };
  }
  // the next hours (the first is now's, with the weather now), or from 19:00, tomorrow's day. Each hour's real moment is
  // at the offset the place has at that hour, not now's (realOf), so one past a clock change is right; the hour the
  // clocks go back over comes twice, the same on the clock, its second an hour after its first.
  const evening = new Date(now).getUTCHours() >= 19, tz = wx.place.tz;
  const from = evening ? [9, 11, 13, 15, 17].map((hr) => hourAt(wx, dayStart(now) + DAY + hr * HOUR)).filter(Boolean) : hoursFrom(wx, now, 5);
  const list = [];
  from.forEach((h, i) => {
    const x = i || evening ? h : { ...h, temp: cur.temp, code: cur.code, isDay: cur.isDay };
    const real = i && h.t === from[i - 1].t ? list[i - 1].t + HOUR : realOf(h.t, tz, offset);
    list.push({ t: real, time: i || evening ? (clock === "12" ? f.time(h.t) : f.hour(h.t)) : "Now", temp: f.temp(x.temp), icon: iconOf(x.code, x.isDay), label: label(x.code, x.isDay), pop: Math.round(x.pop ?? 0) });
  });
  const hours = { label: evening ? `Tomorrow in ${place.name}` : "Next four hours", wet: list.some((h) => h.pop >= 20), list };
  // (Today First's day, asked for with v=2: the rain on the card, with its heaviest hour; and, held apart for the day's
  // cards (functions/_todayday.js), tomorrow's 07:00 and the temperatures as Weather's settings say them)
  const forV2 = v2 ? { rain: rainCard(wx, now, offset) } : {};
  const card = withSend({
    state: "ok",
    place,
    href,
    clock,
    offset,
    sky: skyFor(wx, now),
    now: { temp: f.temp(cur.temp), feels: f.temp(cur.feels), label: label(cur.code, cur.isDay), icon: iconOf(cur.code, cur.isDay), isDay: !!cur.isDay },
    day: { hi: f.temp(d?.tmax), lo: f.temp(d?.tmin) },
    lead,
    more,
    warning,
    hours,
    brief: { title: briefing(wx, now, f).title },
    ...forV2,
    share: `${place.name} today: ${lower(lead)}${warning ? ` ${warning.said}` : ""}`,
  // (the card for Chat: functions/_todaycards.js packs it for the page's "Send to a friend")
  }, sendOf(wx, place.name, slat, slon, now, t, lead));
  return v2 ? withForDay(card, { tomorrow: tomorrowOf(wx, now, tz, offset), deg: (c) => f.temp(c) }) : card;
}

// ---- Today First's day (spec §7.3, §7.6) ----
// The heaviest hour of rain between two times on the place's clock (wall ms): the most rain to fall in an hour, the
// soonest of equals, among the wet hours. → its wall ms, or null where none of them is wet
export function heaviestOf(wx, from, to) {
  let best = null;
  for (const h of wx?.hourly || []) {
    if (h.t + HOUR <= from || h.t >= to || !isWet(h)) continue;
    const v = (h.precip ?? 0) * 1000 + (h.pop ?? 0);
    if (!best || v > best.v) best = { t: h.t, v };
  }
  return best ? best.t : null;
}
// The rain on the card, in real moments: whether it's raining now, when it starts, when it stops and its heaviest
// hour (null where it isn't known); null where it's dry for the next 12 hours
function rainCard(wx, now, offset) {
  const r = rainOf(wx, now, offset);
  if (!r) return null;
  const wall = (ms) => ms + offset * 1000, from = r.now ? now : Number.isFinite(r.at) ? wall(r.at) : now;
  const to = Number.isFinite(r.end) ? wall(r.end) : from + 12 * HOUR, peak = heaviestOf(wx, from, to);
  return { now: !!r.now, at: Number.isFinite(r.at) ? r.at : null, end: Number.isFinite(r.end) ? r.end : null, peak: peak == null ? null : Math.max(peak, from) - offset * 1000 };
}
// The next 07:00 where the place is (the evening's "Tomorrow first": tomorrow's, or in the small hours this morning's):
// its weather, raw (°C, km/h, real ms), in a few words ("dry and still"), and whether it's a good morning for a ride or a
// run (fitness/besttime.js hourScore, Good or better). → { at, day, temp, feels, code, label, pop, rain, wind, wet, said,
// good } or null
function tomorrowOf(wx, now, tz, offset) {
  const seven = dayStart(now) + 7 * HOUR, w = seven > now ? seven : seven + DAY, h = hourAt(wx, w);
  if (!h || Math.abs(h.t - w) >= HOUR) return null;
  const prev = hourAt(wx, h.t - HOUR), as = (x) => x && { temp: x.temp, feels: x.feels, wind: x.wind, gust: x.gust, rain: x.precip ?? 0, code: x.code };
  const score = (sport) => hourScore(as(h), prev && prev.t < h.t ? as(prev) : null, LIMITS[sport]);
  const wet = isWet(h), pop = Math.round(h.pop ?? 0), wind = h.wind ?? null;
  const sky = wet ? "rain" : pop >= 60 ? "rain likely" : pop >= 30 ? `a ${pop}% chance of rain` : "dry";
  const air = wind == null ? null : wind < 6 ? "still" : wind < 15 ? "a light breeze" : wind < 25 ? "breezy" : "windy";
  return { at: realOf(h.t, tz, offset), day: new Date(h.t).toISOString().slice(0, 10), temp: r1(h.temp), feels: r1(h.feels), code: Number.isFinite(h.code) ? h.code : null,
    label: label(h.code, h.isDay), pop, rain: r1(h.precip), wind: r1(wind), wet, said: air ? `${sky} and ${air}` : sky,
    good: wet ? null : score("ride") >= 0.6 ? "ride" : score("run") >= 0.6 ? "run" : null };
}

// ---- Chat's cards (pigeon/cards.js): the weather as it is, for a friend, and live again later ----
const r1 = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 10) / 10);
// Rain at a place in real moments (epoch ms, not the place's wall ms): from the quarter hours (nowcast), and past them,
// the first wet hour in the next 12 (isWet), with when it stops. → { now, at?, end? } or null (dry for 12 hours)
function rainOf(wx, now, offset) {
  const real = (w) => (Number.isFinite(w) ? w - offset * 1000 : null), keep = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null));
  const nc = nowcast(wx, now, makeFormat({}));
  if (nc) return keep({ now: !!nc.now, at: nc.now ? null : real(nc.startsAt), end: real(nc.endsAt) });
  const q = (wx.minutely || []).filter((x) => x.t + 15 * 60e3 > now), past = q.length >= 4 ? q.at(-1).t + 15 * 60e3 : now;
  const hours = wx.hourly.filter((h) => h.t + HOUR > past && h.t < now + 12 * HOUR), i = hours.findIndex((h) => isWet(h));
  if (i < 0) return null;
  const h = hours[i], on = h.t <= now && q.length < 4;
  const dry = wx.hourly.find((x) => x.t > h.t && !isWet(x));
  return keep({ now: on, at: on ? null : real(Math.max(h.t, past)), end: dry ? real(dry.t) : null });
}
// The weather now at a 0.05° cell, raw (°C, real ms): { temp, feels, code, isDay, hi, lo, rain, at }
function nowOf(wx, now, t) {
  const cur = wx.current || hourAt(wx, now), d = dayOf(wx, now);
  if (!cur) throw new Quiet("No hours.");
  return { temp: r1(cur.temp), feels: r1(cur.feels), code: Number.isFinite(cur.code) ? cur.code : null, isDay: !!cur.isDay, hi: r1(d?.tmax), lo: r1(d?.tmin), rain: rainOf(wx, now, wx.place.offset || 0), at: t };
}
// A weather card (pigeon/cards.js, from "today"): the place's name and its 0.05° cell, never the place itself
function sendOf(wx, name, slat, slon, now, t, lead) {
  const n = nowOf(wx, now, t), tz = zoneOk(wx.place.tz) ? wx.place.tz : null;
  const snap = { place: String(name || "").slice(0, 60), ...(tz ? { tz } : {}), temp: n.temp, feels: n.feels, code: n.code, isDay: n.isDay, hi: n.hi, lo: n.lo, lead: String(lead || "").slice(0, 140), rain: n.rain, spell: null };
  for (const k of Object.keys(snap)) if (snap[k] == null && k !== "rain" && k !== "spell") delete snap[k];
  return { v: 1, kind: "weather", from: "today", at: t, say: `${name} today: ${lower(lead)}`.slice(0, 200), snap, ref: { cell: [slat, slon] } };
}
// A cell's forecast for a live look (Chat's "Now" and the rain at friends' places): this data centre's copy, else a paid
// ask, counted first for the account and for everyone (liveMiss), at a page's share of the allowance. Throws Quiet.
async function liveWx(env, lat, lon, t, userId) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Quiet("No place.");
  const slat = snap(lat), slon = snap(lon), j = await forecastJson(env, slat, slon, t, "page", userId || "anyone");
  let wx = shapeForecast(j, { name: "", lat: slat, lon: slon });
  if (!wx.hourly.length || !wx.daily.length) throw new Quiet("No hours.");
  const now = nowWall(wx.place.offset || 0, t);
  wx = oneRain(wx, now);
  return { wx, now, slat, slon };
}
export async function cellNow(env, lat, lon, t, { userId } = {}) {
  const { wx, now } = await liveWx(env, Number(lat), Number(lon), t, userId);
  return nowOf(wx, now, t);
}
// The card for a place with no Weather place to go by (Chat's own place, for "How's yours?"). Throws Quiet.
export async function weatherSend(env, place, t, { userId } = {}) {
  const { wx, now, slat, slon } = await liveWx(env, Number(place?.lat), Number(place?.lon), t, userId);
  const head = headline(wx, now, makeFormat({})), cut = /^(.+?[.!?])(?:\s+|$)/.exec(head), lead = cut ? cut[1] : head;
  return sendOf(wx, String(place?.name || "").trim() || "Here", slat, slon, now, t, lead);
}

// A time on the place's clock (w: weather/format.js's wall ms) as the real moment, epoch ms, at the offset its zone (tz,
// the forecast's) has at that moment: of the offsets a day either side, the one that gives that time back (both, in the
// hour the clocks go back over: then the first time it's that time). Where the zone isn't known, at the place's offset
// now (offset, s).
function realOf(w, tz, offset) {
  if (!zoneOk(tz)) return w - offset * 1000;
  const ok = [w - offsetAt(tz, w - DAY), w - offsetAt(tz, w + DAY)].filter((r) => r + offsetAt(tz, r) === w);
  return ok.length ? Math.min(...ok) : w - offset * 1000;
}

// The sky at a time, as Weather's page draws it behind the place (a copy of weather/app.js's, which a unit test keeps
// the same): clear-day, partly-day, cloudy-day, rain-day, storm, snow-day, fog, clear-night, partly-night, cloudy-night,
// rain-night, snow-night, dusk or dawn
export function skyFor(wx, now) {
  const c = wx.current || hourAt(wx, now) || {}, kind = codeInfo(c.code).kind, day = !!c.isDay, d = dayOf(wx, now);
  let s;
  if (kind === "storm") s = "storm";
  else if (["rain", "showers", "drizzle", "sleet"].includes(kind)) s = day ? "rain-day" : "rain-night";
  else if (kind === "snow") s = day ? "snow-day" : "snow-night";
  else if (kind === "fog") s = "fog";
  else if (d && kind !== "cloudy" && d.sunrise && Math.abs(now - d.sunrise) < 40 * 60e3) s = "dawn";
  else if (d && kind !== "cloudy" && d.sunset && Math.abs(now - d.sunset) < 40 * 60e3) s = "dusk";
  else if (kind === "clear") s = day ? "clear-day" : "clear-night";
  else if (kind === "partly") s = day ? "partly-day" : "partly-night";
  else s = day ? "cloudy-day" : "cloudy-night";
  return s;
}


// ---- Mail on Your Day (stage 1): the weather where a trip goes, day by day ----
// A trip's destination (functions/_todaymail.js tripFor), found by Weather's own place search where Mail gave no
// latitude and longitude (Open-Meteo's geocoding, as weather/data.js searchPlaces asks it, its first place, kept a week
// in this data centre), and Weather's own forecast for its cell, 10 days of it (paid for as a page's: functions/_todaywx.js
// charge), shaped by Weather's code (weather/data.js shapeForecast) and said in Weather's words (weather/insights.js
// phrase, weather/codes.js label and iconOf), with temperatures as Weather's settings say them (deg).
//   tripWeather(env, trip, t, { memo, deg }) → { destination: { name, lat, lon }, tz, href, days: [{ day, hi, lo, icon,
//     label, said }] } (each day of the trip in the forecast, on the destination's clock), or null where the place can't be
//     found. Throws Quiet where the forecast can't be had
//   placeNamed(env, name) → { name, region, country, lat, lon } or null
export const TRIP_DAYS = 10;
const PLACE_KEEP_S = 7 * 86400;
export async function placeNamed(env, name) {
  const q = String(name || "").trim().slice(0, 60);
  if (!q) return null;
  // (as Weather's own search asks: weather/data.js searchPlaces)
  const url = `${env.WXAPP_URL || "https://geocoding-api.open-meteo.com"}/v1/search?${new URLSearchParams({ name: q, count: "8", language: "en", format: "json" })}`;
  const cache = typeof caches !== "undefined" && caches.default ? caches.default : null, key = cache && new Request(url);
  let j = null;
  if (cache) { const hit = await cache.match(key).catch(() => null); if (hit) j = await hit.json().catch(() => null); }
  if (!j) {
    const r = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { Accept: "application/json" } }).catch(() => null);
    if (!r?.ok) return null;
    const text = await r.text();
    try { j = JSON.parse(text); } catch (_) { return null; }
    if (cache) {
      const put = cache.put(key, new Response(text, { headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${PLACE_KEEP_S}` } })).catch(() => {});
      if (env.waitUntil) env.waitUntil(put); else await put;
    }
  }
  const p = placesFound(j?.results)[0];
  return p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180 ? p : null;
}
// (a day's weather in a few words, its daytime hours (08:00 to 21:00 there): Weather's phrase, or where it turns wet part
// way, when: "rain from 13:00")
function dayWords(wx, d) {
  const hours = hoursBetween(wx, d.date + 8 * HOUR, d.date + 21 * HOUR);
  if (!hours.length) return label(d.code, true).toLowerCase();
  const i = hours.findIndex((h) => isWet(h));
  if (i > 0 && hours.slice(i).filter((h) => isWet(h)).length >= 2) {
    // (an hour's rain is the hour up to its time, as Open-Meteo gives it: a wet 14:00 is rain from 13:00)
    const from = new Date(hours[i].t - HOUR).getUTCHours();
    return `${phrase(hours.slice(i).filter((h) => isWet(h)))} from ${String(from).padStart(2, "0")}:00`;
  }
  return phrase(hours);
}
export async function tripWeather(env, trip, t, { memo = null, deg = null } = {}) {
  let dest = trip?.destination;
  if (!dest || typeof dest.name !== "string") return null;
  if (!Number.isFinite(dest.lat) || !Number.isFinite(dest.lon)) {
    const k = `place:${dest.name.toLowerCase()}`;
    const found = memo?.get(k) || placeNamed(env, dest.name);
    memo?.set(k, found);
    const p = await found;
    if (!p) return null;
    dest = { name: dest.name, lat: p.lat, lon: p.lon };
  }
  const slat = snap(dest.lat), slon = snap(dest.lon), k = `wxtrip:${slat},${slon}`;
  const ask = memo?.get(k) || forecastJson(env, slat, slon, t, "page", null, TRIP_DAYS);
  memo?.set(k, ask);
  const wx = shapeForecast(await ask, { name: dest.name, lat: dest.lat, lon: dest.lon });
  if (!wx.daily.length) throw new Quiet("No days.");
  const offset = wx.place.offset || 0, keyAt = (ms) => new Date(ms + offset * 1000).toISOString().slice(0, 10);
  const say = typeof deg === "function" ? deg : (c) => `${Math.round(c) < 0 ? "−" : ""}${Math.abs(Math.round(c))}°`;
  const first = keyAt(trip.start), last = keyAt(Math.max(trip.start, trip.end ?? trip.start)), days = [];
  for (let d = first, n = 0; d <= last && n < 21; n++) {
    const x = wx.daily.find((y) => y.key === d);
    days.push(x ? { day: d, hi: say(x.tmax), lo: say(x.tmin), icon: iconOf(x.code, true), label: label(x.code, true), said: dayWords(wx, x) } : { day: d });
    const [y, m, dd] = d.split("-").map(Number);
    d = new Date(Date.UTC(y, m - 1, dd + 1)).toISOString().slice(0, 10);
  }
  return { destination: dest, tz: zoneOk(wx.place.tz) ? wx.place.tz : null, href: `/weather/?lat=${dest.lat}&lon=${dest.lon}&name=${encodeURIComponent(dest.name)}`, days };
}
