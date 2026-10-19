// One forecast, one story: wherever the rain's told on the page, it's told the same.
//
// The first hours are the next four hours' (data.js minutely, with the radar leading where it sees: rainmap.js
// blend): each hour's rain and weather from its quarter hours, and where the radar leads, its chance too. Every other
// hour's chance of rain is the ensembles' (their runs pooled: data.js ENSEMBLES), the share of runs with 0.2 mm or more
// in it. A day's chance, and a part of a day's, is of rain at some point in it (insights.js rainChance), counted run by
// run as the umbrella's and the best times' are, rather than its wettest hour's. Where the ensembles don't reach, the
// forecast's own. So the hours, the days, the briefing, the next four hours, the umbrella and the best times all agree.
// Pure: no page, no network.

import { rainChance } from "./insights.js";
import { isWetCode } from "./codes.js";
import { HOUR, DAY } from "./format.js";

const QUARTER = 15 * 60e3;
// a rate's weather, as the radar's are (rainmap.js blend)
const rate = (mmh, snow) => (snow ? (mmh < 1 ? 71 : mmh < 4 ? 73 : 75) : mmh < 2.5 ? 61 : mmh < 7.6 ? 63 : 65);
const SNOW = new Set([71, 73, 75, 77, 85, 86]);

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
      if (h.t <= now || h.t - HOUR < first || h.t > last) return h;
      const mine = qs.filter((q) => q.t >= h.t - HOUR && q.t < h.t);
      if (mine.length < 4) return h;
      const precip = Math.round(mine.reduce((a, q) => a + (q.precip || 0), 0) * 100) / 100;
      const led = mine.reduce((a, q) => a + (q.radar || 0), 0) / 4, wettest = mine.reduce((a, q) => ((q.precip || 0) > (a.precip || 0) ? q : a));
      const snow = mine.some((q) => SNOW.has(q.code));
      const code = precip >= 0.1 ? (isWetCode(wettest.code) ? wettest.code : isWetCode(h.code) ? h.code : rate(precip, snow)) : isWetCode(h.code) ? (led >= 0.5 ? 3 : h.code) : h.code;
      if (!led) return { ...h, precip, code };
      // (where the radar leads: its say on whether it rains, as far as it leads)
      const seen = precip >= 0.2 ? 95 : precip >= 0.05 ? 60 : 3;
      return { ...h, precip, code, pop: Math.round(led * seen + (1 - led) * (h.pop ?? 0)), led };
    });
  }
  const told = { ...wx, hourly };
  // each day: the chance of rain at some point in it (today's from now)
  const daily = wx.daily.map((d) => {
    const a = Math.max(d.date, now), b = d.date + DAY;
    if (b <= now) return d;
    const c = rainChance(told, a, b);
    return c == null ? d : { ...d, popMax: Math.round(c * 100) };
  });
  return { ...told, daily };
}
