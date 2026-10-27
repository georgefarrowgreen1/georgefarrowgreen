// Official warnings for a place, from the weather services that issue them:
//
//   Europe   MeteoAlarm (EUMETNET's feeds of its members' own warnings, CC BY 4.0), for the services
//            that draw their warnings' areas: the UK's Met Office, and Norway's, Sweden's, Switzerland's,
//            Slovenia's, Estonia's, Iceland's, Israel's, Ukraine's and Latvia's (the Netherlands', now
//            and then). The rest name regions by code only, and MeteoAlarm keeps the map of those to
//            registered users: there, the app's own warnings (worked out from the forecast) are all.
//   US       the National Weather Service (its API answers for a point).
//   England  the Environment Agency's flood alerts and warnings (its flood-monitoring API, Open Government
//            Licence), for the flood areas the place is in or within 3 km of (each area's outline, from the same
//            API, kept a week). They've no end time: in force while they're listed. (Scotland's SEPA and
//            Wales's NRW offer no open feed to ask.)
//
// Each feed is fetched at most every 5 minutes, kept (shaped down to what's in force or to come) in
// Cloudflare's cache for everyone; the place asked about isn't kept at all. Only warnings yellow or
// above (MeteoAlarm's green is "nothing in particular"), in force or to come, and not since replaced.
//
// METEOALARM_URL, NWS_URL, EA_URL, WARN_TTL (how long a feed's kept, in seconds; 0, not at all): tests only.

import { HttpError } from "./_pigeon.js";

const UA = { "User-Agent": "georgefarrowgreen-weather/1.0 (+https://weather.inflite.ai)", Accept: "application/json" };
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
// where the Environment Agency warns of floods: England (a box about it; its areas are England's alone)
const EA_BOX = [49.8, -6.5, 55.9, 1.9], EA_NEAR_KM = 3;

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
// An outline made light enough to send for the map: the points that hardly change its shape left out (within tol degrees
// of the line between those kept either side; tol doubled until there are no more than max), each to 3 decimal places
// (about 100 m). p: [lat, lon, lat, lon, …], as polygon() makes them
export function simplify(p, tol = 0.004, max = 120) {
  const n = p.length / 2, r3 = (v) => Math.round(v * 1000) / 1000;
  if (n <= 4) return p.map(r3);
  for (let t = tol; ; t *= 2) {
    const keep = new Uint8Array(n), stack = [[0, n - 1]];
    keep[0] = keep[n - 1] = 1;
    while (stack.length) {
      const [a, b] = stack.pop(), ay = p[2 * a], ax = p[2 * a + 1], dy = p[2 * b] - ay, dx = p[2 * b + 1] - ax, l = Math.hypot(dx, dy);
      let far = -1, most = t;
      for (let i = a + 1; i < b; i++) {
        const e = l ? Math.abs(dy * (p[2 * i + 1] - ax) - dx * (p[2 * i] - ay)) / l : Math.hypot(p[2 * i] - ay, p[2 * i + 1] - ax);
        if (e > most) { most = e; far = i; }
      }
      if (far >= 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
    }
    const out = [];
    for (let i = 0; i < n; i++) if (keep[i]) out.push(r3(p[2 * i]), r3(p[2 * i + 1]));
    if (out.length / 2 <= max || t > 1) return out;
  }
}
// a warning's areas for the map: its outlines (no more than 12), each made light
const areasOf = (polys) => (Array.isArray(polys) ? polys : []).slice(0, 12).map((r) => simplify(r.p)).filter((r) => r.length >= 8);

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

// The National Weather Service's alerts for a point → the same shape, with the area each is drawn for where it's drawn
// (its geometry; one for a forecast zone has none: there, it's said for the point alone).
// Its headline is in capitals, so the card says what's coming from its description's "* WHAT..." instead.
const SEVERITY = { Extreme: 4, Severe: 3, Moderate: 2, Minor: 2 };
const whatOf = (d) => { const m = /\*\s*WHAT\.\.\.([\s\S]*?)(?:\n\s*\n|\n\s*\*|$)/.exec(String(d || "")); const t = m && m[1].replace(/\s+/g, " ").trim(); return t ? t[0].toUpperCase() + t.slice(1) : null; };
export function shapeNws(j, lat, lon, now = Date.now()) {
  return (Array.isArray(j?.features) ? j.features : []).filter((x) => {
    const p = x?.properties, end = iso(p?.ends) || iso(p?.expires);
    return p && p.status === "Actual" && ["Alert", "Update"].includes(p.messageType) && end && Date.parse(end) > now;
  }).map((x) => [x.properties, x.geometry ? outlineOf(x.geometry) : []]).map(([p, polys]) => ({
    id: String(p.id || "").slice(0, 200), issuer: "National Weather Service", via: null,
    event: clip(p.event, 120) || "Weather alert", level: SEVERITY[p.severity] || 2, type: null,
    headline: clip(whatOf(p.description), 400) || clip(p.headline, 400), text: clip(p.description, 4000), instruction: clip(p.instruction, 2000),
    impacts: [], onset: iso(p.onset) || iso(p.effective), expires: iso(p.ends) || iso(p.expires),
    url: `https://forecast.weather.gov/MapClick.php?lat=${lat}&lon=${lon}`, area: clip(p.areaDesc, 200), polys,
  }));
}

// The Environment Agency's floods near a point → the same shape, each with its flood area's id: severe flood warnings
// red, flood warnings amber, flood alerts yellow (those no longer in force left out). No end time: listed, in force.
const EA_LEVEL = { 1: 4, 2: 3, 3: 2 }, EA_SAYS = { 4: "Severe flooding: danger to life.", 3: "Flooding is expected: act now.", 2: "Flooding is possible: be prepared." };
const eaTime = (s) => (typeof s === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(s) ? iso(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`) : null);
export function shapeEa(j) {
  return (Array.isArray(j?.items) ? j.items : []).filter((x) => x && EA_LEVEL[x.severityLevel] && typeof x.floodAreaID === "string" && /^[\w-]{1,24}$/.test(x.floodAreaID)).map((x) => {
    const level = EA_LEVEL[x.severityLevel];
    return {
      id: `ea-${x.floodAreaID}-${x.severityLevel}`, issuer: "Environment Agency", via: null,
      event: ["", "Severe flood warning", "Flood warning", "Flood alert"][x.severityLevel], level, type: null,
      headline: EA_SAYS[level], text: clip(x.message, 4000), instruction: null, impacts: [],
      onset: eaTime(x.timeSeverityChanged) || eaTime(x.timeRaised), expires: null, open: true,
      url: `https://check-for-flooding.service.gov.uk/target-area/${x.floodAreaID}`, area: clip(x.description || x.floodArea?.label, 200), floodArea: x.floodAreaID,
    };
  });
}
// a flood area's outline (GeoJSON, lon/lat) → [{ b, p }] as polygon() makes them (each ring), or []
export function outlineOf(j) {
  const rings = [], g = j?.features?.[0]?.geometry || j?.geometry || j;
  const add = (ring) => { if (!Array.isArray(ring) || ring.length < 4) return; const p = []; for (const pt of ring) { if (!Array.isArray(pt) || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) return; p.push(Math.round(pt[1] * 1e4) / 1e4, Math.round(pt[0] * 1e4) / 1e4); } const lats = p.filter((_, i) => i % 2 === 0), lons = p.filter((_, i) => i % 2 === 1); rings.push({ b: [Math.min(...lats), Math.min(...lons), Math.max(...lats), Math.max(...lons)], p }); };
  if (g?.type === "Polygon") (g.coordinates || []).forEach(add);
  else if (g?.type === "MultiPolygon") (g.coordinates || []).forEach((poly) => (poly || []).forEach(add));
  return rings.slice(0, 200);
}
// how far (km) a point is from an outline: 0 inside it, else to its nearest edge
const KM_LAT = 111.32;
export function kmFrom(lat, lon, rings) {
  let best = Infinity;
  for (const r of rings) {
    if (inside(lat, lon, r)) return 0;
    const kx = KM_LAT * Math.cos((lat * Math.PI) / 180);
    for (let i = 0; i + 3 < r.p.length; i += 2) {
      const ay = (r.p[i] - lat) * KM_LAT, ax = (r.p[i + 1] - lon) * kx, by = (r.p[i + 2] - lat) * KM_LAT, bx = (r.p[i + 3] - lon) * kx;
      const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l)) : 0;
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return best;
}
// a flood area's outline, kept a week (they hardly change)
async function outlineAt(base, id) {
  const cache = typeof caches !== "undefined" && caches.default ? caches.default : null, url = `${base}/flood-monitoring/id/floodAreas/${encodeURIComponent(id)}/polygon`, key = new Request(`${url}?outline=1`);
  if (cache) { const hit = await cache.match(key).catch(() => null); if (hit) return hit.json(); }
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`floods outline ${r.status}`);
  const rings = outlineOf(await r.json());
  if (cache) await cache.put(key, new Response(JSON.stringify(rings), { headers: { "Content-Type": "application/json", "Cache-Control": "max-age=604800" } })).catch(() => {});
  return rings;
}
// the floods for a place: those listed within 15 km of it (the API's own reckoning), then only those whose area it's
// in or within 3 km of
async function floodsAt(env, lat, lon) {
  const base = env.EA_URL || "https://environment.data.gov.uk";
  const near = await shaped(`${base}/flood-monitoring/id/floods?lat=${lat.toFixed(2)}&long=${lon.toFixed(2)}&dist=15`, shapeEa);
  const kept = await Promise.all(near.slice(0, 12).map((w) => outlineAt(base, w.floodArea).then((rings) => (kmFrom(lat, lon, rings) <= EA_NEAR_KM ? rings : null), () => null)));
  return near.slice(0, 12).map((w, i) => kept[i] && { ...w, polys: kept[i] }).filter(Boolean);
}

// a feed, shaped: from the cache, or asked for and kept for TTL (an answer that it's outside its map: none, kept too)
async function shaped(url, shape, ttl = TTL) {
  const cache = ttl > 0 && typeof caches !== "undefined" && caches.default ? caches.default : null;
  const key = new Request(`${url}${url.includes("?") ? "&" : "?"}shaped=3`);
  if (cache) { const hit = await cache.match(key).catch(() => null); if (hit) return hit.json(); }
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(10000) });
  if (!r.ok && r.status !== 400 && r.status !== 404) throw new Error(`${new URL(url).hostname} ${r.status}`);
  const out = r.ok ? shape(await r.json()) : [];
  if (cache) await cache.put(key, new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${ttl}` } })).catch(() => {});
  return out;
}

// { warnings: [...] } for a place, worst first, then soonest (each with its areas, made light, where it has them: for the
// map). If every source it asked
// failed, an error (502), so a phone keeps the warnings it had rather than being told there are none
export async function warningsAt(env, lat, lon, now = Date.now()) {
  const ma = env.METEOALARM_URL || "https://feeds.meteoalarm.org", nws = env.NWS_URL || "https://api.weather.gov";
  const ttl = env.WARN_TTL != null && env.WARN_TTL !== "" ? Number(env.WARN_TTL) : TTL;
  const feeds = [...new Set(FEEDS.filter(([, b]) => inBox(lat, lon, b)).map(([slug]) => slug))];
  const asks = feeds.map((slug) => shaped(`${ma}/api/v1/warnings/feeds-${slug}`, (j) => shapeMeteoalarm(j, now), ttl)
    .then((list) => list.filter((w) => w.polys.some((p) => inside(lat, lon, p))))
    .catch((e) => { console.error("weather warnings:", slug, e && e.message); return null; }));
  if (NWS_BOXES.some((b) => inBox(lat, lon, b))) {
    asks.push(shaped(`${nws}/alerts/active?point=${lat},${lon}`, (j) => shapeNws(j, lat, lon, now), ttl)
      .catch((e) => { console.error("weather warnings: NWS", e && e.message); return null; }));
  }
  if (inBox(lat, lon, EA_BOX)) asks.push(floodsAt(env, lat, lon).catch((e) => { console.error("weather warnings: floods", e && e.message); return null; }));
  const got = await Promise.all(asks);
  if (got.length && got.every((x) => x === null)) throw new HttpError(502, "Warnings aren't available right now.");
  // (and a warning issued twice over, under two names, once: as NVE's floods can be)
  const seen = new Set(), warnings = [];
  for (const w of got.filter(Boolean).flat()) {
    const same = `${w.issuer}|${w.event}|${w.level}|${w.onset}|${w.expires}|${w.area}`;
    if (Date.parse(w.expires) <= now || seen.has(w.id) || seen.has(same)) continue;
    seen.add(w.id); seen.add(same);
    // (one without an end time is in force as of now: the phone lets it go if it's not heard of it again for long)
    const { polys, floodArea, ...rest } = w, areas = areasOf(polys);
    if (areas.length) rest.areas = areas;
    warnings.push(rest.open ? { ...rest, checked: new Date(now).toISOString() } : rest);
  }
  warnings.sort((a, b) => b.level - a.level || Date.parse(a.onset || 0) - Date.parse(b.onset || 0));
  return { warnings };
}
