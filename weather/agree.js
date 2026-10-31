// One forecast, one story: wherever the rain's told on the page, it's told the same.
//
// The first hours are the next four hours' (data.js minutely, with the radar leading where it sees: rainmap.js
// blend): each hour's rain and weather from its quarter hours, and where the radar leads, its chance too; and the
// weather now (the top of the page, its sky, the hours' first) raining or not as the next four hours have it. Every other
// hour's chance of rain is the ensembles' (their runs pooled: data.js ENSEMBLES), the share of runs with 0.2 mm or more
// in it. A day's chance, and a part of a day's, is of rain at some point in it (insights.js rainChance), counted run by
// run as the umbrella's and the best times' are, rather than its wettest hour's. Where the ensembles don't reach, the
// forecast's own. So the hours, the days, the briefing, the next four hours, the umbrella and the best times all agree.
// Pure: no page, no network.

import { rainChance } from "./insights.js";
import { isWetCode, wetAt } from "./codes.js";
import { HOUR, DAY } from "./format.js";

const QUARTER = 15 * 60e3;
const SNOW = new Set([71, 73, 75, 77, 85, 86]);
// a quarter hour's weather, wet: its kind of weather (as given: kind, else its own), as heavy as its rate (codes.js)
const wetCode = (q, kind = q.code) => wetAt(isWetCode(kind) ? kind : q.code, (q.precip || 0) * 4, SNOW.has(q.code));

export function oneRain(wx, now) {
  if (!wx?.hourly?.length) return wx;
  // each hour's chance: the ensembles' where they reach
  const odds = new Map((wx.ensemble?.hourly || []).filter((e) => e.wet != null).map((e) => [e.t, e.wet]));
  let hourly = wx.hourly.map((h) => (odds.has(h.t) ? { ...h, pop: Math.round(odds.get(h.t) * 100) } : h));
  // the first hours: from the next four hours' quarter hours (an hour's rain is the hour up to its time, as
  // Open-Meteo gives it: its four quarters are the hour before)
  const qs = wx.minutely || [];
  if (qs.length) {
    const first = qs[0].t, last = qs[qs.length - 1].t + QUARTER;
    hourly = hourly.map((h) => {
      if (h.t <= now || h.t > last) return h;
      const mine = qs.filter((q) => q.t >= h.t - HOUR && q.t < h.t);
      // (the hour now's in, partly gone: if what's left of it is wet, it's a wet hour, whatever it was)
      if (h.t - HOUR < first) {
        const wet = mine.filter((q) => (q.precip || 0) >= 0.05);
        if (!wet.length || isWetCode(h.code)) return h;
        const most = wet.reduce((a, q) => (q.precip > a.precip ? q : a)), fell = Math.round(mine.reduce((a, q) => a + (q.precip || 0), 0) * 100) / 100;
        return { ...h, code: wetCode(most), precip: Math.max(h.precip || 0, fell) };
      }
      if (mine.length < 4) return h;
      const precip = Math.round(mine.reduce((a, q) => a + (q.precip || 0), 0) * 100) / 100;
      const led = mine.reduce((a, q) => a + (q.radar || 0), 0) / 4, wettest = mine.reduce((a, q) => ((q.precip || 0) > (a.precip || 0) ? q : a));
      const snow = mine.some((q) => SNOW.has(q.code));
      // (wet: the kind of weather the quarters or the hour have it as, as heavy as the hour's rain)
      const code = precip >= 0.1 ? wetAt(isWetCode(wettest.code) ? wettest.code : h.code, precip, snow) : isWetCode(h.code) ? (led >= 0.5 ? 3 : h.code) : h.code;
      if (!led) return { ...h, precip, code };
      // (where the radar leads: its say on whether it rains, as far as it leads)
      const seen = precip >= 0.2 ? 95 : precip >= 0.05 ? 60 : 3;
      return { ...h, precip, code, pop: Math.round(led * seen + (1 - led) * (h.pop ?? 0)), led };
    });
  }
  // now: raining as the next four hours say (insights.js nowcast: this quarter hour wet, or the next one with rain
  // falling now), and as heavily (its kind of weather the forecast's, if it has it wet), else not, so the top of the page
  // says what the card under it does: not "Light Rain" over a card reading 1.2 mm an hour, moderate. And only while it's
  // the weather lately: a forecast kept from hours ago (opened offline, say) has the weather as it was then, and the
  // forecast for this hour says now better (the page takes that, insights.js hourAt, where there's no weather now)
  let current = wx.current && now - wx.current.t < HOUR ? wx.current : null;
  const left = qs.filter((q) => q.t + QUARTER > now);
  if (current && left.length >= 4) {
    const wet = (q) => (q?.precip || 0) >= 0.05, raining = wet(left[0]) || ((current.precip || 0) > 0.05 && wet(left[1]));
    if (raining) current = { ...current, code: wetCode(wet(left[0]) ? left[0] : left[1], current.code) };
    else if (isWetCode(current.code)) current = { ...current, code: (current.cloud ?? 100) >= 70 ? 3 : 2 };
  }
  const told = { ...wx, hourly, current };
  // each day: the chance of rain at some point in it (today's from now)
  const daily = wx.daily.map((d) => {
    const a = Math.max(d.date, now), b = d.date + DAY;
    if (b <= now) return d;
    const c = rainChance(told, a, b);
    return c == null ? d : { ...d, popMax: Math.round(c * 100) };
  });
  return { ...told, daily };
}
