// Official warnings for a place, from the weather services that issue them:
//
//   Europe   MeteoAlarm (EUMETNET's feeds of its members' own warnings, CC BY 4.0), for the services
//            that draw their warnings' areas: the UK's Met Office, and Norway's, Sweden's, Switzerland's,
//            Slovenia's, Estonia's, Iceland's, Israel's, Ukraine's and Latvia's (the Netherlands', now
//            and then). The rest name regions by code only, and MeteoAlarm keeps the map of those to
//            registered users: there, the app's own warnings (worked out from the forecast) are all.
//   US       the National Weather Service (its API answers for a point).
//
// Each feed is fetched at most every 5 minutes, kept (shaped down to what's in force or to come) in
// Cloudflare's cache for everyone; the place asked about isn't kept at all. Only warnings yellow or
// above (MeteoAlarm's green is "nothing in particular"), in force or to come, and not since replaced.
//
// METEOALARM_URL, NWS_URL: tests only.

import { HttpError } from "./_pigeon.js";

const UA = { "User-Agent": "georgefarrowgreen-weather/1.0 (+https://weather.georgefarrowgreen.com)", Accept: "application/json" };
const TTL = 300;

// MeteoAlarm's feeds that draw their areas, with the boxes (south, west, north, east) they cover
const FEEDS = [
  ["united-kingdom", [49.7, -8.8, 61, 2]],
  ["norway", [57.8, 4.3, 71.3, 31.3]], ["norway", [74, 10, 81, 34]],
  ["sweden", [55.2, 10.8, 69.2, 24.3]],
  ["switzerland", [45.7, 5.8, 47.9, 10.6]],
  ["slovenia", [45.3, 13.3, 47, 16.7]],
  ["estonia", [57.4, 21.6, 59.9, 28.3]],
  ["iceland", [63.2, -24.7, 66.7, -13.3]],
  ["israel", [29.4, 34.2, 33.4, 35.95]],
  ["ukraine", [44.3, 22, 52.5, 40.3]],
  ["latvia", [55.6, 20.8, 58.1, 28.3]],
  ["netherlands", [50.7, 3.2, 53.7, 7.3]],
];
// where the National Weather Service warns: the lower 48, Alaska (both sides of 180°), Hawaii, Puerto Rico
// and the Virgin Islands, Guam and the Marianas, American Samoa
const NWS_BOXES = [[24.3, -125, 49.5, -66.8], [51, -180, 71.6, -129.9], [51, 172, 53.5, 180], [18.8, -160.4, 22.4, -154.6], [17.6, -67.4, 18.6, -64.5], [13.2, 144.5, 20.6, 146.1], [-14.6, -171.1, -14.1, -168.1]];
const inBox = (lat, lon, b) => lat >= b[0] && lat <= b[2] && lon >= b[1] && lon <= b[3];

// the names their senders give, made short enough for a tag
const ISSUERS = [
  [/met office/i, "Met Office"], [/^MET Norway/i, "MET Norway"], [/Norwegian Water Resources/i, "NVE"], [/^SMHI/i, "SMHI"],
  [/MeteoSwiss/i, "MeteoSwiss"], [/ARSO/i, "ARSO"], [/^IMO\b|Icelandic Met/i, "Icelandic Met Office"], [/^KNMI/i, "KNMI"],
  [/Latvian Environment/i, "LVĢMC"], [/Estonian Environment/i, "Estonian Environment Agency"], [/Israel Meteorological/i, "Israel Met Service"],
  [/Ukrainian Hydromet/i, "Ukrainian Hydromet Center"], [/Black and Azov/i, "Black Sea Hydromet Center"],
];
const issuerOf = (s = "") => (ISSUERS.find(([re]) => re.test(s)) || [null, String(s).length > 32 ? `${String(s).slice(0, 32).replace(/\s+\S*$/, "")}…` : String(s)])[1];
// (an event in capitals, as some send them: "COASTAL EVENT" → "Coastal event")
const calm = (s) => (s && s === s.toUpperCase() && /[A-Z]{3}/.test(s) ? s[0] + s.slice(1).toLowerCase() : s);

// (kept to n characters, at a word: "…" where it's cut)
const clip = (s, n) => { const t = typeof s === "string" ? s.trim() : ""; return !t ? null : t.length <= n ? t : `${t.slice(0, n - 1).replace(/\s+\S*$/, "")}…`; };
// A headline made by a machine ("Strong wind gusts, yellow level, Troms, 2026-10-19T04:00:00+00:00, …", as MET Norway's
// are): its description's first sentence instead, or failing that the headline without its dates
const STAMP = /,?\s*\d{4}-\d\d-\d\d(?:T\d\d:\d\d(?::\d\d)?(?:[+-]\d\d:?\d\d|Z)?)?/g;
function leadOf(headline, text) {
  if (!headline || !/\d{4}-\d\d-\d\d/.test(headline)) return headline;
  const first = /^[^.!?]+[.!?]/.exec(String(text || "").trim())?.[0];
  return first ? first[0].toUpperCase() + first.slice(1) : headline.replace(STAMP, "").trim() || null;
}
const link = (u) => (typeof u === "string" && /^https?:\/\/[^\s"<>]+$/.test(u) && u.length <= 500 ? u : null);
const iso = (s) => (typeof s === "string" && Number.isFinite(Date.parse(s)) ? s : null);
const param = (info, name) => (Array.isArray(info.parameter) ? info.parameter : []).filter((p) => p && p.valueName === name).map((p) => String(p.value ?? ""));

// "lat,lon lat,lon …" (CAP's polygons) → { b: box, p: [lat, lon, lat, lon, …] }, or null
export function polygon(s) {
  const p = [];
  for (const pair of String(s || "").trim().split(/\s+/)) {
    const [la, lo] = pair.split(",").map(Number);
    if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
    p.push(Math.round(la * 1e4) / 1e4, Math.round(lo * 1e4) / 1e4);
  }
  if (p.length < 8) return null;
  const lats = p.filter((_, i) => i % 2 === 0), lons = p.filter((_, i) => i % 2 === 1);
  return { b: [Math.min(...lats), Math.min(...lons), Math.max(...lats), Math.max(...lons)], p };
}
// whether a point is inside a polygon (crossing its edges, west to east)
export function inside(lat, lon, { b, p }) {
  if (!inBox(lat, lon, b)) return false;
  let c = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const yi = p[i], xi = p[i + 1], yj = p[j], xj = p[j + 1];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// A MeteoAlarm feed → its warnings in force or to come, yellow and above, with their drawn areas:
// [{ id, issuer, event, level (2 yellow, 3 orange/amber, 4 red), type, headline, text, instruction, impacts,
//   onset, expires, url, area, polys }]
export function shapeMeteoalarm(j, now = Date.now()) {
  const list = Array.isArray(j?.warnings) ? j.warnings : [];
  // (an update replaces the warnings it refers to: "sender,identifier,sent …")
  const replaced = new Set();
  for (const x of list) for (const r of String(x?.alert?.references || "").split(/\s+/)) { const id = r.split(",")[1]; if (id) replaced.add(id); }
  const out = [];
  for (const x of list) {
    const a = x?.alert;
    if (!a || a.status !== "Actual" || !["Alert", "Update"].includes(a.msgType) || replaced.has(a.identifier)) continue;
    const infos = Array.isArray(a.info) ? a.info : [];
    const inf = infos.find((i) => /^en/i.test(i?.language || "")) || infos[0];
    if (!inf) continue;
    const expires = iso(inf.expires), level = parseInt(param(inf, "awareness_level")[0], 10);
    if (!expires || Date.parse(expires) <= now || !(level >= 2 && level <= 4) || /^cancel/i.test(inf.event || "")) continue;
    const polys = (Array.isArray(inf.area) ? inf.area : []).flatMap((ar) => (Array.isArray(ar?.polygon) ? ar.polygon : []).map(polygon)).filter(Boolean);
    if (!polys.length) continue;
    out.push({
      id: String(a.identifier || x.uuid || "").slice(0, 200), issuer: issuerOf(inf.senderName), via: "MeteoAlarm",
      event: calm(clip(inf.event, 120)) || "Weather warning", level, type: parseInt(param(inf, "awareness_type")[0], 10) || null,
      headline: clip(leadOf(inf.headline, inf.description), 400), text: clip(inf.description, 4000), instruction: clip(inf.instruction, 2000),
      impacts: param(inf, "impacts").map((s) => clip(s, 700)).filter(Boolean).slice(0, 8),
      onset: iso(inf.onset) || iso(inf.effective) || iso(a.sent), expires, url: link(inf.web),
      area: clip((inf.area || []).map((ar) => ar?.areaDesc).filter(Boolean).join(", "), 200), polys,
    });
  }
  return out;
}

// The National Weather Service's alerts for a point → the same shape (without areas: it's already for the point).
// Its headline is in capitals, so the card says what's coming from its description's "* WHAT..." instead.
const SEVERITY = { Extreme: 4, Severe: 3, Moderate: 2, Minor: 2 };
const whatOf = (d) => { const m = /\*\s*WHAT\.\.\.([\s\S]*?)(?:\n\s*\n|\n\s*\*|$)/.exec(String(d || "")); const t = m && m[1].replace(/\s+/g, " ").trim(); return t ? t[0].toUpperCase() + t.slice(1) : null; };
export function shapeNws(j, lat, lon, now = Date.now()) {
  return (Array.isArray(j?.features) ? j.features : []).map((x) => x?.properties).filter((p) => {
    const end = iso(p?.ends) || iso(p?.expires);
    return p && p.status === "Actual" && ["Alert", "Update"].includes(p.messageType) && end && Date.parse(end) > now;
  }).map((p) => ({
    id: String(p.id || "").slice(0, 200), issuer: "National Weather Service", via: null,
    event: clip(p.event, 120) || "Weather alert", level: SEVERITY[p.severity] || 2, type: null,
    headline: clip(whatOf(p.description), 400) || clip(p.headline, 400), text: clip(p.description, 4000), instruction: clip(p.instruction, 2000),
    impacts: [], onset: iso(p.onset) || iso(p.effective), expires: iso(p.ends) || iso(p.expires),
    url: `https://forecast.weather.gov/MapClick.php?lat=${lat}&lon=${lon}`, area: clip(p.areaDesc, 200),
  }));
}

// a feed, shaped: from the cache, or asked for and kept for TTL (an answer that it's outside its map: none, kept too)
async function shaped(url, shape) {
  const cache = typeof caches !== "undefined" && caches.default ? caches.default : null;
  const key = new Request(`${url}${url.includes("?") ? "&" : "?"}shaped=2`);
  if (cache) { const hit = await cache.match(key).catch(() => null); if (hit) return hit.json(); }
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(10000) });
  if (!r.ok && r.status !== 400 && r.status !== 404) throw new Error(`${new URL(url).hostname} ${r.status}`);
  const out = r.ok ? shape(await r.json()) : [];
  if (cache) await cache.put(key, new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${TTL}` } })).catch(() => {});
  return out;
}

// { warnings: [...] } for a place, worst first, then soonest (each without its areas). If every source it asked
// failed, an error (502), so a phone keeps the warnings it had rather than being told there are none
export async function warningsAt(env, lat, lon, now = Date.now()) {
  const ma = env.METEOALARM_URL || "https://feeds.meteoalarm.org", nws = env.NWS_URL || "https://api.weather.gov";
  const feeds = [...new Set(FEEDS.filter(([, b]) => inBox(lat, lon, b)).map(([slug]) => slug))];
  const asks = feeds.map((slug) => shaped(`${ma}/api/v1/warnings/feeds-${slug}`, (j) => shapeMeteoalarm(j, now))
    .then((list) => list.filter((w) => w.polys.some((p) => inside(lat, lon, p))))
    .catch((e) => { console.error("weather warnings:", slug, e && e.message); return null; }));
  if (NWS_BOXES.some((b) => inBox(lat, lon, b))) {
    asks.push(shaped(`${nws}/alerts/active?point=${lat},${lon}`, (j) => shapeNws(j, lat, lon, now))
      .catch((e) => { console.error("weather warnings: NWS", e && e.message); return null; }));
  }
  const got = await Promise.all(asks);
  if (got.length && got.every((x) => x === null)) throw new HttpError(502, "Warnings aren't available right now.");
  // (and a warning issued twice over, under two names, once: as NVE's floods can be)
  const seen = new Set(), warnings = [];
  for (const w of got.filter(Boolean).flat()) {
    const same = `${w.issuer}|${w.event}|${w.level}|${w.onset}|${w.expires}|${w.area}`;
    if (Date.parse(w.expires) <= now || seen.has(w.id) || seen.has(same)) continue;
    seen.add(w.id); seen.add(same);
    const { polys, ...rest } = w;
    warnings.push(rest);
  }
  warnings.sort((a, b) => b.level - a.level || Date.parse(a.onset || 0) - Date.parse(b.onset || 0));
  return { warnings };
}
