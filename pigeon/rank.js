// Send to a friend: who should know. The share sheet's friends, best first for the card, each with a plain reason
// ("The rain reaches Cromer at 14:40", "Rides too · 14 mi away", "Your 12-day streak ends tonight", "Lands in 8m").
// Only from what Chat already has: friends' places, zones, streaks and flight times, the letters on this phone (read
// in memory, never kept), and for a forecast, the rain at friends' places (POST share-rank). Nothing new is collected.
// Pure: Chat (pigeon/app.js) passes everything in.
import { payloadParts, clockIn, durShort } from "./cards.js";

const HOUR = 3600e3, DAY = 24 * HOUR;
const DOWL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const VERB = { ride: "Rides", run: "Runs", swim: "Swims", walk: "Walks", row: "Rows", strength: "Trains" };

export function haversineKm(aLat, aLon, bLat, bLon) {
  const r = Math.PI / 180, s = Math.sin((bLat - aLat) * r / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin((bLon - aLon) * r / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(s));
}
// as Chat says a distance (pigeon/app.js fmtMiles)
export const fmtMiles = (km) => Math.round(km * 0.621371).toLocaleString("en-GB") + " mi";
const place = (p) => p != null && Number.isFinite(p.lat) && Number.isFinite(p.lon);
const first = (name) => String(name ?? "").trim().split(/\s+/)[0] || "";
// the date in tz (a bad zone: the phone's own), as days since 1970
const dayNum = (ms, tz) => {
  let f;
  try { f = new Intl.DateTimeFormat("en-CA", { timeZone: tz || undefined, year: "numeric", month: "2-digit", day: "2-digit" }); } catch (_) { f = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }); }
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).filter((x) => x.type !== "literal").map((x) => [x.type, Number(x.value)]));
  return Math.round(Date.UTC(p.year, p.month - 1, p.day) / DAY);
};
const sameClock = (ms, a, b) => clockIn(ms, a) === clockIn(ms, b) && clockIn(ms + 6 * 30 * DAY, a) === clockIn(ms + 6 * 30 * DAY, b);

// What the letters on this phone show, per friend: the sports of the Fitness cards they've sent you, and whether
// Markets cards have gone either way. entries: [{ from, to, payload }] (S.msgs with S.plain).
export function seenFrom(entries, meId) {
  const out = new Map();
  for (const e of entries || []) {
    if (!e || (e.from !== meId && e.to !== meId)) continue;
    const card = payloadParts(e.payload).card;
    if (!card) continue;
    const mine = e.from === meId, id = mine ? e.to : e.from;
    if (!id) continue;
    const s = out.get(id) || { sports: new Set(), sentMarkets: false, gotMarkets: false };
    if (card.kind === "fitness" && !mine) s.sports.add(card.snap.sport);
    if (card.kind === "markets") { if (mine) s.sentMarkets = true; else s.gotMarkets = true; }
    out.set(id, s);
  }
  return out;
}

// For a forecast: the friends whose rain to ask about (POST share-rank), the nearest to the card's square, within 300 km
export function rainAsk(card, friends, max = 6) {
  const c = card?.kind === "weather" ? card.ref?.cell : null;
  if (!c) return [];
  return (friends || []).filter(place).map((f) => [f.id, haversineKm(c[0], c[1], f.lat, f.lon)]).filter(([, km]) => km <= 300)
    .sort((a, b) => a[1] - b[1]).slice(0, max).map(([id]) => id);
}

// Each friend's best (score, reason) for the card; picks that can't go (canFly's words) at the foot.
// → [{ id, score, reason, best, lands, can, why }]
export function rankFriends(card, { friends, me, now = Date.now(), rain, seen, landsIn, streakRisk, lastAt, canFly } = {}) {
  const myTz = me?.tz;
  const rows = (friends || []).map((f) => {
    const lands = (() => { const v = landsIn?.(f); return Number.isFinite(v) ? v : null; })();
    const km = place(me) && place(f) ? haversineKm(me.lat, me.lon, f.lat, f.lon) : null;
    const where = f.place || first(f.name) || "their place";
    const c = [];
    // a streak about to end, whatever the card
    const risk = streakRisk?.(f);
    if (risk && risk.n >= 3 && Number.isFinite(risk.endsAt)) {
      const left = risk.endsAt - now;
      if (left > 0 && left < 6 * HOUR) c.push([75, left < HOUR ? `Your ${risk.n}-day streak ends in ${durShort(left)}` : `Your ${risk.n}-day streak ends tonight`]);
    }
    if (card?.kind === "weather" && rain && Object.prototype.hasOwnProperty.call(rain, f.id)) {
      const r = rain[f.id];
      if (r && r.now) c.push([70, `Raining in ${where} now`]);
      else if (r && Number.isFinite(r.at) && r.at > now && r.at - now <= 12 * HOUR) {
        const theirs = f.tz && myTz && !sameClock(r.at, f.tz, myTz);
        c.push([Math.round(95 - 3 * ((r.at - now) / HOUR)), `The rain reaches ${where} at ${clockIn(r.at, f.tz || myTz)}${theirs ? " their time" : ""}`]);
      } else if (r === null) c.push([20, `Dry in ${where} all day`]);
    }
    const s = seen?.get?.(f.id);
    if (card?.kind === "fitness") {
      const sport = card.snap?.sport, verb = VERB[sport] || "Trains";
      if (s?.sports?.has(sport)) {
        if (km != null && km <= 40) c.push([90, `${verb} too · ${fmtMiles(km)} away`]);
        else if (km != null) c.push([35, `${verb} too · too far to join`]);
        else c.push([35, `${verb} too`]);
      } else if (km != null && km <= 25) c.push([55, `Near enough to join · ${fmtMiles(km)} away`]);
    }
    if (card?.kind === "markets" && s) {
      if (s.sentMarkets) c.push([55, "You’ve sent Markets cards before"]);
      else if (s.gotMarkets) c.push([50, "Sends you Markets cards too"]);
    }
    let [score, reason] = c.sort((a, b) => b[0] - a[0])[0] || [null, ""];
    // a letter between you in the last week
    const last = (() => { const v = lastAt?.(f); return Number.isFinite(v) ? v : null; })();
    if (last != null && now - last < 7 * DAY && last <= now) {
      if (score != null) score += 10;
      else {
        const d = dayNum(now, myTz) - dayNum(last, myTz);
        score = 15; reason = d <= 0 ? "Wrote today" : d === 1 ? "Wrote yesterday" : `Wrote on ${DOWL[new Date(dayNum(last, myTz) * DAY).getUTCDay()]}`;
      }
    }
    if (score == null) { score = lands != null ? 10 - lands / 60e3 / 60 : 0; reason = lands != null ? `Lands in ${durShort(lands)}` : ""; }
    const why = canFly ? canFly(f) : null;
    return { id: f.id, score, reason, best: false, lands, can: !why, why: why || null, _last: last ?? 0, _name: first(f.name) };
  });
  rows.sort((a, b) => (a.can !== b.can ? (a.can ? -1 : 1) : b.score - a.score || b._last - a._last || a._name.localeCompare(b._name, "en-GB")));
  if (rows[0]?.can && rows[0].score >= 60) rows[0].best = true;
  return rows.map(({ _last, _name, ...r }) => r);
}
