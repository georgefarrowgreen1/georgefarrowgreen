import { estimate, geometry } from "../fitness/routes-geometry.js";
import { hoursAt } from "./_fitwx.js";
import { warningsAt } from "./_wxwarn.js";

const HOUR = 3600000;
const maxOf = values => {
  const known = values.filter(Number.isFinite);
  return known.length ? Math.max(...known) : null;
};

function routePoint(track, fraction) {
  const { coords, distances, metres } = track;
  if (fraction === 0) return coords[0];
  if (fraction === 1) return coords.at(-1);
  const target = metres * fraction;
  const index = distances.findIndex(distance => distance >= target);
  const [fromLon, fromLat] = coords[index - 1], [toLon, toLat] = coords[index];
  const step = (target - distances[index - 1]) / (distances[index] - distances[index - 1]);
  const deltaLon = (toLon - fromLon + 540) % 360 - 180;
  return [(fromLon + deltaLon * step + 540) % 360 - 180, fromLat + (toLat - fromLat) * step];
}

export async function rideDepartures(env, plan, { minutes, now = Date.now(), forecast = hoursAt, warnings = warningsAt } = {}) {
  if (!plan?.route) return { state: "no-route" };
  const { route, tz, day, time } = plan;
  const duration = Number.isInteger(minutes) && minutes > 0 && minutes <= 1440 ? minutes : Math.min(1440, estimate(route));
  const track = geometry(route), cells = new Map(), locations = new Map(), asking = new Map();
  const stops = [0, 1 / 3, 2 / 3, 1].map(fraction => {
    const [lon, lat] = routePoint(track, fraction);
    const key = lat.toFixed(2) + "," + lon.toFixed(2);
    const point = `${lat},${lon}`;
    if (!cells.has(key)) cells.set(key, forecast(env, lat, lon).catch(() => null));
    if (!locations.has(point)) locations.set(point, warnings(env, lat, lon, now, asking).catch(() => null));
    return { fraction, forecast: cells.get(key), warnings: locations.get(point) };
  });
  const timed = await Promise.all(stops.map(async stop => {
    const [wx, warning] = await Promise.all([stop.forecast, stop.warnings]);
    const hours = Array.isArray(wx?.hours) ? wx.hours : [];
    return { ...stop, hours, byHour: new Map(hours.map(hour => [hour.t, hour])), warning };
  }));
  if (!timed[0].hours.length) return { state: "forecast-unavailable" };
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const clock = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const today = date.format(now), target = day < today ? today : day;
  const slots = timed[0].hours.filter(hour => hour.day && hour.t >= now - HOUR && date.format(hour.t) >= target);
  const onPlan = slots.filter(hour => date.format(hour.t) === target);
  const nextDay = slots.length ? date.format(slots[0].t) : null;
  const daySlots = onPlan.length || target > today ? onPlan : slots.filter(hour => date.format(hour.t) === nextDay);
  const savedHour = daySlots.find(hour => clock.format(hour.t).slice(0, 2) === time?.slice(0, 2));
  const preferred = savedHour ? savedHour.t + Number(time.slice(3)) * 60000 : null;
  const candidates = [...new Set([...daySlots.map(hour => hour.t), preferred].filter(start => start != null && start >= now))];
  const chosen = preferred == null ? candidates.slice(0, 4) : candidates.sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred)).slice(0, 4).sort((a, b) => a - b);
  const departures = [];
  for (const start of chosen) {
    const end = start + duration * 60000, alerts = new Map();
    const samples = timed.map(stop => {
      const arrival = start + (end - start) * stop.fraction;
      for (const warning of stop.warning?.warnings || []) {
        const from = Date.parse(warning.onset), to = Date.parse(warning.expires);
        if ((!Number.isFinite(from) || from <= arrival) && (!Number.isFinite(to) || to >= arrival)) {
          const { event, issuer, area, level } = warning;
          alerts.set(warning.id || event + issuer + area, { event, issuer, area, level });
        }
      }
      const anchor = stop.hours[0]?.t;
      return stop.byHour.get(anchor + Math.floor((arrival - anchor) / HOUR) * HOUR);
    });
    if (samples.every(sample => !sample)) continue;
    const rainChance = maxOf(samples.map(sample => sample?.pop)), gust = maxOf(samples.map(sample => sample?.gust));
    const daylight = samples.some(sample => sample?.day === false) ? false : samples.every(sample => sample?.day === true) || null;
    departures.push({ start, end, rainChance, gust, daylight, planned: start === preferred,
      forecastPartial: samples.some(sample => !Number.isFinite(sample?.pop) || !Number.isFinite(sample?.gust)),
      warnings: [...alerts.values()].sort((a, b) => b.level - a.level).slice(0, 6) });
  }
  return { state: departures.length ? "ready" : "outside-forecast", route: route.name, timezone: tz, duration,
    warningCoverage: timed.every(stop => stop.warning && !stop.warning.uncovered && !stop.warning.missing?.length) ? "complete" : "partial",
    departures };
}
