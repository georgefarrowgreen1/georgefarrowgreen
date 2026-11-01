// InFlite Today's Weather card: the account's first place in Weather (functions/_wxacct.js), its weather now, the next
// hours, and the day in Weather's own words: its morning briefing's (weather/insights.js headline, weather/alerts.js
// briefing), with any official warning in force there (functions/_wxwarn.js, weather/official.js). The forecast is the
// one notifications use (not tuned), kept for its 0.05° cell, and asked for out of Open-Meteo's allowance Weather's own
// notifications share (functions/_wxpush.js allowance), so Today's pages can't spend the morning briefings' share.
// WXAPP_URL: tests only (a stand-in for Open-Meteo).

import { kept } from "./_wxacct.js";
import { wxdb, allowance, COST_FULL, OM_KEEP } from "./_wxpush.js";
import { warningsAt } from "./_wxwarn.js";
import { withDeadline, cardMs, couldnt, Quiet, zoneOk, offsetAt } from "./_todaycards.js";
import { logError } from "./_pigeon.js";
import { shapeForecast, forecastQuery } from "../weather/data.js";
import { makeFormat, nowWall, dayStart, HOUR, DAY } from "../weather/format.js";
import { headline, hoursFrom, hourAt, dayOf } from "../weather/insights.js";
import { briefing } from "../weather/alerts.js";
import { codeInfo, label, iconOf } from "../weather/codes.js";
import { inForce, colourOf, titleOf, badgeOf, spanOf } from "../weather/official.js";
import { oneRain } from "../weather/agree.js";

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
// copy, then Open-Meteo itself, paid for (charge, as purpose allows)
async function forecastJson(env, slat, slon, t, purpose) {
  const url = `${env.WXAPP_URL || "https://api.open-meteo.com"}/v1/forecast?${forecastQuery(slat, slon, 3)}`;
  const cache = typeof caches !== "undefined" && caches.default ? caches.default : null, key = cache && new Request(url);
  if (cache) { const hit = await cache.match(key).catch(() => null); if (hit) return hit.json(); }
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
function cellOf(env, slat, slon, t, memo, purpose) {
  const k = `wx:${slat},${slon}`, had = memo?.get(k);
  if (had) return had;
  const c = {
    forecast: forecastJson(env, slat, slon, t, purpose),
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
    return await withDeadline(dayAt(env, place, href, data.settings || {}, t, memo, purpose), Math.max(0, left));
  } catch (e) {
    if (!(e instanceof Quiet)) await logError(env, "today weather", e);
    return couldnt("weather", links, { href, place });
  }
}

async function dayAt(env, place, href, settings, t, memo, purpose) {
  const slat = snap(place.lat), slon = snap(place.lon), c = cellOf(env, slat, slon, t, memo, purpose);
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
  return {
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
    share: `${place.name} today: ${lower(lead)}${warning ? ` ${warning.said}` : ""}`,
  };
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
