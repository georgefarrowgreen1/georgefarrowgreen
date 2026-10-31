// Every file Fitness reads and writes, and what's in each, as Fitness keeps it.
//
// A ride (or run, or swim) is an activity: when it started, the sport, the device it came from, and its samples
// (seconds from the start, and at each the place, height, heart rate, cadence, power, speed and distance, any of which
// can be missing), with its laps. It comes in as FIT (what Garmin and Wahoo devices record), GPX or TCX, and goes out as
// any of the three. A workout (workouts.js) goes out as FIT for a Garmin or a Wahoo, as ZWO for Zwift and the indoor
// apps that read it, as ERG or MRC for TrainerRoad and the others that read those, and as a .plan for an older Wahoo
// ELEMNT; and comes in from FIT, ZWO, ERG or MRC.
//
// Read on the device: nothing here is sent anywhere. GPX, TCX and ZWO are read by what they say rather than by an XML
// parser, so the same code runs in the tests.

import { readFit, writeFit, FILE, SPORT, SUB, MAKER, DURATION, TARGET, INTENSITY } from "./fit.js";
import { flatten } from "./workouts.js";

const SPORT_OF = { [SPORT.cycling]: "ride", [SPORT.eBiking]: "ride", [SPORT.running]: "run", [SPORT.swimming]: "swim", [SPORT.walking]: "walk", [SPORT.hiking]: "walk", 16: "walk", [SPORT.training]: "strength", [SPORT.fitnessEquipment]: "strength", [SPORT.rowing]: "row" };
const FIT_SPORT = { ride: SPORT.cycling, run: SPORT.running, swim: SPORT.swimming, walk: SPORT.walking, strength: SPORT.training, row: SPORT.rowing };
const round = (v, d = 0) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

// ---- activities ----
// a new activity, from samples taken at times `t` (seconds from `start`, which is ms since 1970)
function activity({ sport = null, indoor = false, start, name, device, file, t, lat, lon, ele, hr, cad, pwr, spd, dist, laps = [] }) {
  // (samples without a time, or out of order, are left out; and the rest of a file from a jump of more than a day on, as
  // a device that lost power mid-write leaves a last sample dated years away: a night's stop on a ride of a few days,
  // recorded as one, is kept. What's left out is said, by how many samples: cut)
  const keep = [];
  let cut = 0;
  for (let i = 0, last = -Infinity; i < t.length; i++) {
    if (t[i] == null || t[i] <= last || t[i] < 0) continue;
    if (keep.length && t[i] - last > 86400) { cut = t.length - i; break; }
    keep.push(i); last = t[i];
  }
  if (keep.length < 2) throw new Error("That file has too few samples to be a ride.");
  // (a sensor that was never there: a column of nothing but zeros, as some devices write for one they don't have)
  // (places and heights can be below nought; a sensor's readings can't)
  const n = keep.length, col = (a, sensor = true) => (a && keep.some((i) => (sensor ? a[i] > 0 : a[i] != null)) ? keep.map((i) => a[i] ?? null) : null);
  t = keep.map((i) => t[i]);
  const s = { t, lat: col(lat, false), lon: col(lon, false), ele: col(ele, false), hr: col(hr), cad: col(cad), pwr: col(pwr), spd: col(spd), dist: col(dist) };
  if (!s.lat || !s.lon) s.lat = s.lon = null;
  // (distance from this activity's own start: a multisport file counts on through each of its parts)
  if (s.dist) { const d0 = s.dist.find((v) => v != null) || 0; if (d0) s.dist = s.dist.map((v) => (v == null ? null : Math.round((v - d0) * 10) / 10)); }
  // (places of 0°, 0°: no fix yet, as some devices write before they have one)
  if (s.lat) for (let i = 0; i < n; i++) if (s.lat[i] === 0 && s.lon[i] === 0) s.lat[i] = s.lon[i] = null;
  // (no distance recorded, but places: measured along them)
  if (!s.dist && s.lat) {
    s.dist = new Array(n).fill(null);
    let d = 0, pi = -1;
    for (let i = 0; i < n; i++) {
      if (s.lat[i] == null || s.lon[i] == null) continue;
      if (pi >= 0) d += metresBetween(s.lat[pi], s.lon[pi], s.lat[i], s.lon[i]);
      s.dist[i] = d; pi = i;
    }
  }
  if (!s.spd && s.dist) {
    s.spd = new Array(n).fill(null);
    for (let i = 1; i < n; i++) if (s.dist[i] != null && s.dist[i - 1] != null && t[i] > t[i - 1]) s.spd[i] = (s.dist[i] - s.dist[i - 1]) / (t[i] - t[i - 1]);
  }
  // (a file that doesn't say what it was: worked out from how it went, and said to be a guess)
  const guessed = !sport;
  if (guessed) sport = guessSport(s);
  return { id: `a${start}`, sport, guessed, indoor: indoor || !s.lat, start, name: name || defaultName(sport, start, indoor || !s.lat), device: device || null, file: file || null, s, laps, ...(cut ? { cut } : {}) };
}
// What an activity was, from its samples alone: power or a cyclist's cadence is a ride; otherwise by its moving speed
// (a run from about 7 km/h to 20, a walk under it, a ride over it); nothing to go by, a ride
export function guessSport(s) {
  if (s.pwr) return "ride";
  let moving = 0, metres = 0;
  for (let i = 1; i < s.t.length; i++) {
    const v = s.spd?.[i], dt = s.t[i] - s.t[i - 1];
    if (v != null && v > 0.5 && dt > 0 && dt < 30) { moving += dt; metres += v * dt; }
  }
  if (moving < 60) return "ride";
  const kmh = (metres / moving) * 3.6;
  return kmh > 20 ? "ride" : kmh >= 7 ? "run" : "walk";
}
export function defaultName(sport, start, indoor) {
  const h = new Date(start).getHours(), part = h < 12 ? "Morning" : h < 17 ? "Afternoon" : h < 21 ? "Evening" : "Night";
  return indoor && sport === "ride" ? "Indoor ride" : `${part} ${{ ride: "ride", run: "run", swim: "swim", walk: "walk", strength: "workout", row: "row" }[sport] || "activity"}`;
}
export function metresBetween(a1, o1, a2, o2) {
  const r = Math.PI / 180, dA = (a2 - a1) * r, dO = (o2 - o1) * r;
  const h = Math.sin(dA / 2) ** 2 + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin(dO / 2) ** 2;
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function activityFromFit(bytes, file) {
  const fit = readFit(bytes), M = fit.messages;
  if (M.fileId[0].type === FILE.workout) throw Object.assign(new Error("That’s a workout, not a ride."), { workout: true });
  if (M.fileId[0].type === FILE.course) throw new Error("That’s a course (a route to follow). Fitness takes rides, runs and workouts.");
  if (M.fileId[0].type != null && M.fileId[0].type !== FILE.activity && !(M.record || []).length) throw new Error("That FIT file isn’t an activity (it’s settings or health data from the device).");
  const recs = (M.record || []).filter((r) => r.timestamp != null);
  if (!recs.length) throw new Error("That FIT file has no samples in it.");
  // (the oldest devices pack speed and distance into three bytes: twelve bits of speed in hundredths of a metre a second,
  // and twelve of distance in sixteenths of a metre, that go round every 256 m)
  if (recs.some((r) => Array.isArray(r.compressedSD)) && !recs.some((r) => r.distance != null)) {
    let total = 0, last = null;
    for (const r of recs) {
      const c = r.compressedSD;
      if (!Array.isArray(c) || c.some((x) => x == null)) continue;
      r.speed = (c[0] | ((c[1] & 0x0f) << 8)) / 100;
      const d = (c[1] >> 4) | (c[2] << 4);
      if (last != null) total += ((d - last + 4096) % 4096) / 16;
      last = d; r.distance = total;
    }
  }
  const maker = M.fileId[0].manufacturer, dev = (M.deviceInfo || []).find((d) => d.deviceIndex === 0 && d.productName) || (M.deviceInfo || []).find((d) => d.productName);
  const device = [MAKER[maker] || null, dev?.productName || M.fileId[0].productName || null].filter(Boolean).join(" ") || null;
  // A ride (or run, or swim) for each session: a triathlon from a multisport watch is three, its transitions left out
  const sessions = (M.session || []).filter((x) => x.sport !== 3 && x.startTime != null).sort((a, b) => a.startTime - b.startTime);
  const parts = sessions.length > 1 ? sessions.map((x) => ({ ses: x, recs: recs.filter((r) => r.timestamp >= x.startTime && r.timestamp <= x.startTime + (x.elapsed ?? x.timer ?? 0) + 1) })).filter((p) => p.recs.length > 1)
    : [{ ses: sessions[0] || (M.session || [])[0] || {}, recs }];
  return parts.map(({ ses, recs: rs }, k) => {
    const t0 = ses.startTime || rs[0].timestamp, pick = (key, alt) => rs.map((r) => r[key] ?? (alt ? r[alt] : null) ?? null);
    return activity({
      sport: SPORT_OF[ses.sport] || (ses.sport == null || ses.sport === 0 ? null : "other"), indoor: ses.subSport === SUB.indoorCycling || ses.subSport === SUB.virtual || ses.subSport === SUB.treadmill || ses.subSport === SUB.lapSwimming,
      start: t0 * 1000, device, file: parts.length > 1 ? `${file} (${k + 1} of ${parts.length})` : file,
      t: rs.map((r) => r.timestamp - t0), lat: pick("lat"), lon: pick("lon"), ele: pick("enhancedAltitude", "altitude").map((v) => round(v, 1)),
      hr: pick("heartRate"), cad: pick("cadence"), pwr: pick("power"), spd: pick("enhancedSpeed", "speed"), dist: pick("distance"),
      laps: (M.lap || []).filter((l) => (l.startTime ?? t0) >= t0 && (l.startTime ?? t0) <= t0 + (ses.elapsed ?? Infinity)).map((l) => ({ start: (l.startTime || t0) - t0, secs: l.timer ?? l.elapsed ?? 0, dist: l.distance ?? null })),
    });
  });
}

// An activity as FIT: a file Garmin Connect, Strava, TrainingPeaks and intervals.icu all take, as a device would
// write it (file id, start, the samples, stop, its laps, the session and the activity).
export function fitFromActivity(a, sum) {
  const s = a.s, t0 = Math.round(a.start / 1000), end = t0 + Math.round(s.t[s.t.length - 1] || 0), out = [];
  out.push(["fileId", { type: FILE.activity, manufacturer: 255, product: 0, serial: t0, created: t0, productName: "Fitness" }]);
  out.push(["event", { timestamp: t0, event: 0, eventType: 0 }]);
  for (let i = 0; i < s.t.length; i++) {
    out.push(["record", {
      timestamp: t0 + Math.round(s.t[i]), lat: s.lat?.[i], lon: s.lon?.[i], altitude: s.ele?.[i], heartRate: s.hr?.[i], cadence: s.cad?.[i],
      distance: s.dist?.[i], speed: s.spd?.[i], power: s.pwr?.[i],
    }]);
  }
  out.push(["event", { timestamp: end, event: 0, eventType: 4 }]);
  const laps = a.laps.length ? a.laps : [{ start: 0, secs: s.t[s.t.length - 1] || 0, dist: s.dist?.[s.dist.length - 1] }];
  laps.forEach((l, i) => out.push(["lap", { timestamp: t0 + Math.round(l.start + l.secs), messageIndex: i, event: 9, eventType: 1, startTime: t0 + Math.round(l.start), elapsed: l.secs, timer: l.secs, distance: l.dist, sport: FIT_SPORT[a.sport], trigger: i === laps.length - 1 ? 7 : 0 }]));
  out.push(["session", {
    timestamp: end, messageIndex: 0, event: 8, eventType: 1, startTime: t0, sport: FIT_SPORT[a.sport] ?? 0, subSport: a.indoor && a.sport === "ride" ? SUB.indoorCycling : 0,
    elapsed: end - t0, timer: sum?.moving ?? end - t0, distance: sum?.dist, avgHeartRate: sum?.avgHr, maxHeartRate: sum?.maxHr, avgCadence: sum?.avgCad,
    avgPower: sum?.avgPwr, maxPower: sum?.maxPwr, ascent: sum?.ascent, normalizedPower: sum?.np, tss: sum?.tss, intensityFactor: sum?.iF, thresholdPower: sum?.ftp,
    firstLap: 0, laps: laps.length, trigger: 0,
  }]);
  out.push(["activity", { timestamp: end, timer: end - t0, sessions: 1, type: 0, event: 26, eventType: 1, local: end - new Date(a.start).getTimezoneOffset() * 60 }]);
  return writeFit(out);
}

// A route's shape, for a list's row: up to 48 points along it, each across and down in a box 0 to 100 (north up, its
// own proportions kept, a little margin round it); none for one without places, or that never went anywhere
export function routeShape(s) {
  if (!s?.lat || !s?.lon) return null;
  const pts = [];
  for (let i = 0; i < s.lat.length; i++) if (s.lat[i] != null && s.lon[i] != null) pts.push([s.lon[i], s.lat[i]]);
  if (pts.length < 10) return null;
  const k = Math.cos((pts.reduce((a, p) => a + p[1], 0) / pts.length) * Math.PI / 180), xs = pts.map((p) => p[0] * k), ys = pts.map((p) => p[1]);
  // (by a loop, not Math.min(...xs): a day's ride at a point a second is more points than a call can be handed)
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let j = 0; j < xs.length; j++) { x0 = Math.min(x0, xs[j]); x1 = Math.max(x1, xs[j]); y0 = Math.min(y0, ys[j]); y1 = Math.max(y1, ys[j]); }
  const span = Math.max(x1 - x0, y1 - y0);
  if (span < 0.002) return null;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, n = Math.min(48, pts.length), out = [];
  for (let j = 0; j < n; j++) { const i = Math.round((j / (n - 1)) * (pts.length - 1)); out.push(Math.round(50 + ((xs[i] - cx) / span) * 88), Math.round(50 - ((ys[i] - cy) / span) * 88)); }
  return out;
}

// ---- GPX and TCX: XML, read by what each sample says ----
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unesc = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
// (the text of the first element of that name inside, whatever its namespace prefix)
const tag = (xml, name) => { const m = new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([^<]*)</(?:\\w+:)?${name}>`, "i").exec(xml); return m ? unesc(m[1].trim()) : null; };
const attr = (head, name) => { const m = new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(head); return m ? m[1] : null; };
const num = (v) => (v == null || v === "" || !Number.isFinite(+v) ? null : +v);
const blocks = (xml, name) => xml.match(new RegExp(`<(?:\\w+:)?${name}\\b[^>]*?(?:/>|>[\\s\\S]*?</(?:\\w+:)?${name}>)`, "gi")) || [];

export function activityFromGpx(text, file) {
  const pts = blocks(text, "trkpt");
  if (!pts.length) {
    if (/<rte\b/i.test(text)) throw new Error("That GPX is a route (a way to follow), with no ride recorded in it.");
    throw new Error("That GPX file has no track in it.");
  }
  const times = pts.map((p) => Date.parse(tag(p, "time")));
  if (!Number.isFinite(times[0])) throw new Error("That GPX has no times in it, so it’s a route rather than a ride.");
  const t0 = times[0], type = (tag(text, "type") || "").toLowerCase();
  const sport = /run/.test(type) ? "run" : /walk|hik/.test(type) ? "walk" : /swim/.test(type) ? "swim" : /cycl|bik|ride/.test(type) ? "ride" : null;
  return activity({
    sport, start: t0, file, name: tag(blocks(text, "trk")[0] || "", "name"), device: attr(text.slice(0, 600), "creator"),
    t: times.map((x) => (Number.isFinite(x) ? (x - t0) / 1000 : null)),
    lat: pts.map((p) => num(attr(p.slice(0, 200), "lat"))), lon: pts.map((p) => num(attr(p.slice(0, 200), "lon"))),
    ele: pts.map((p) => num(tag(p, "ele"))), hr: pts.map((p) => num(tag(p, "hr"))), cad: pts.map((p) => num(tag(p, "cad"))),
    pwr: pts.map((p) => num(tag(p, "power") ?? tag(p, "PowerInWatts"))),
  });
}
// An activity as GPX 1.1, with heart rate and cadence as Garmin's track point extension has them, and power as
// Strava and most others read it
export function gpxFromActivity(a) {
  const s = a.s;
  if (!s.lat) return null;
  const rows = [];
  for (let i = 0; i < s.t.length; i++) {
    if (s.lat[i] == null) continue;
    const ext = [s.hr?.[i] != null && `<gpxtpx:hr>${s.hr[i]}</gpxtpx:hr>`, s.cad?.[i] != null && `<gpxtpx:cad>${s.cad[i]}</gpxtpx:cad>`].filter(Boolean).join("");
    rows.push(`   <trkpt lat="${s.lat[i].toFixed(7)}" lon="${s.lon[i].toFixed(7)}">${s.ele?.[i] != null ? `<ele>${s.ele[i].toFixed(1)}</ele>` : ""}<time>${iso(a.start + s.t[i] * 1000)}</time>` +
      (ext || s.pwr?.[i] != null ? `<extensions>${s.pwr?.[i] != null ? `<power>${s.pwr[i]}</power>` : ""}${ext ? `<gpxtpx:TrackPointExtension>${ext}</gpxtpx:TrackPointExtension>` : ""}</extensions>` : "") + `</trkpt>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Fitness" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
 <metadata><name>${esc(a.name)}</name><time>${iso(a.start)}</time></metadata>
 <trk><name>${esc(a.name)}</name><type>${{ ride: "cycling", run: "running", swim: "swimming", walk: "walking" }[a.sport] || a.sport}</type><trkseg>
${rows.join("\n")}
 </trkseg></trk>
</gpx>
`;
}
const iso = (ms) => new Date(Math.round(ms / 1000) * 1000).toISOString().replace(".000Z", "Z");

export function activityFromTcx(text, file) {
  const acts = blocks(text, "Activity");
  if (!acts.length) {
    if (/<(\w+:)?Workouts?\b/i.test(text)) throw Object.assign(new Error("That TCX is a workout plan; Fitness reads workouts as FIT, ZWO, ERG or MRC."), { workout: true });
    throw new Error("That TCX file has no activity in it.");
  }
  const act = acts[0], pts = blocks(act, "Trackpoint"), head = act.slice(0, 200);
  const times = pts.map((p) => Date.parse(tag(p, "Time")));
  const t0 = Date.parse(tag(act, "Id")) || times.find(Number.isFinite);
  if (!pts.length || !Number.isFinite(t0)) throw new Error("That TCX has no samples in it.");
  const sp = (attr(head, "Sport") || "").toLowerCase();
  return activity({
    sport: sp === "running" ? "run" : sp === "biking" ? "ride" : null, start: t0, file, device: tag(blocks(act, "Creator")[0] || "", "Name"),
    t: times.map((x) => (Number.isFinite(x) ? (x - t0) / 1000 : null)), lat: pts.map((p) => num(tag(p, "LatitudeDegrees"))), lon: pts.map((p) => num(tag(p, "LongitudeDegrees"))),
    ele: pts.map((p) => num(tag(p, "AltitudeMeters"))), hr: pts.map((p) => num(tag(blocks(p, "HeartRateBpm")[0] || "", "Value"))),
    cad: pts.map((p) => num(tag(p, "Cadence") ?? tag(p, "RunCadence"))), pwr: pts.map((p) => num(tag(p, "Watts"))),
    spd: pts.map((p) => num(tag(p, "Speed"))), dist: pts.map((p) => num(tag(p, "DistanceMeters"))),
    laps: blocks(act, "Lap").map((l) => ({ start: (Date.parse(attr(l.slice(0, 120), "StartTime")) - t0) / 1000, secs: num(tag(l, "TotalTimeSeconds")) || 0, dist: num(tag(l, "DistanceMeters")) })),
  });
}
// An activity as TCX (Garmin's Training Center format: what older tools and TrainingPeaks read)
export function tcxFromActivity(a, sum) {
  const s = a.s, laps = a.laps.length ? a.laps : [{ start: 0, secs: s.t[s.t.length - 1] || 0, dist: s.dist?.[s.dist.length - 1] }];
  const lapXml = laps.map((l, li) => {
    const pts = [];
    for (let i = 0; i < s.t.length; i++) {
      if (s.t[i] < l.start || (li < laps.length - 1 && s.t[i] >= l.start + l.secs)) continue;
      pts.push(`     <Trackpoint><Time>${iso(a.start + s.t[i] * 1000)}</Time>` +
        (s.lat?.[i] != null ? `<Position><LatitudeDegrees>${s.lat[i].toFixed(7)}</LatitudeDegrees><LongitudeDegrees>${s.lon[i].toFixed(7)}</LongitudeDegrees></Position>` : "") +
        (s.ele?.[i] != null ? `<AltitudeMeters>${s.ele[i].toFixed(1)}</AltitudeMeters>` : "") + (s.dist?.[i] != null ? `<DistanceMeters>${s.dist[i].toFixed(1)}</DistanceMeters>` : "") +
        (s.hr?.[i] != null ? `<HeartRateBpm><Value>${s.hr[i]}</Value></HeartRateBpm>` : "") + (s.cad?.[i] != null && a.sport === "ride" ? `<Cadence>${s.cad[i]}</Cadence>` : "") +
        (s.pwr?.[i] != null || s.spd?.[i] != null ? `<Extensions><ns3:TPX>${s.spd?.[i] != null ? `<ns3:Speed>${s.spd[i].toFixed(3)}</ns3:Speed>` : ""}${s.pwr?.[i] != null ? `<ns3:Watts>${s.pwr[i]}</ns3:Watts>` : ""}</ns3:TPX></Extensions>` : "") +
        `</Trackpoint>`);
    }
    return `   <Lap StartTime="${iso(a.start + l.start * 1000)}"><TotalTimeSeconds>${l.secs.toFixed(1)}</TotalTimeSeconds><DistanceMeters>${(l.dist || 0).toFixed(1)}</DistanceMeters><Calories>0</Calories><Intensity>Active</Intensity><TriggerMethod>Manual</TriggerMethod>
    <Track>
${pts.join("\n")}
    </Track>
   </Lap>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
 <Activities>
  <Activity Sport="${a.sport === "run" ? "Running" : a.sport === "ride" ? "Biking" : "Other"}">
   <Id>${iso(a.start)}</Id>
${lapXml.join("\n")}
   <Creator xsi:type="Device_t" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Name>Fitness</Name><UnitId>0</UnitId><ProductID>0</ProductID></Creator>
  </Activity>
 </Activities>
</TrainingCenterDatabase>
`;
}

// ---- workouts ----
// A workout as a FIT workout file: what a Garmin Edge or watch takes in from its NewFiles folder, and a Wahoo ELEMNT
// ACE, BOLT or ROAM (the 2024 ones and later) from its plans folder. Power as a share of FTP (so the device's own FTP sets
// the watts); a run's pace as speed, from your threshold pace; a swim's by distance, in a 25 m pool. A held step gets a
// band around it (90% is 88–93%); a ramp (which FIT has no way to say) its range, which ERG mode holds the middle of.
// A ride or a run leaves its sub-sport out, as Garmin asks (an indoor ride's is one a watch may hide).
export function fitFromWorkout(w, { pace = 4, created = Date.now() } = {}) {
  const steps = [];
  const one = (s) => {
    const m = { messageIndex: steps.length, name: (s.name || "").slice(0, 15), intensity: { warmup: INTENSITY.warmup, cooldown: INTENSITY.cooldown, rest: INTENSITY.rest }[s.kind] ?? INTENSITY.active };
    if (s.secs != null) Object.assign(m, { durationType: DURATION.time, durationValue: Math.round(s.secs * 1000) });
    else if (s.metres != null) Object.assign(m, { durationType: DURATION.distance, durationValue: Math.round(s.metres * 100) });
    else Object.assign(m, { durationType: DURATION.open, durationValue: 0 });
    const lo = Math.min(s.from, s.to ?? s.from), hi = Math.max(s.from, s.to ?? s.from), held = lo === hi;
    if (s.kind === "free" || w.sport === "strength" || (w.sport === "swim") || !lo) Object.assign(m, { targetType: TARGET.open, targetValue: 0 });
    else if (w.sport === "ride") Object.assign(m, { targetType: TARGET.power, targetValue: 0, low: Math.round(lo * 100) - (held ? 2 : 0), high: Math.round(hi * 100) + (held ? 3 : 0) });
    else Object.assign(m, { targetType: TARGET.speed, targetValue: 0, low: Math.round(lo * pace * (held ? 0.97 : 1) * 1000), high: Math.round(hi * pace * (held ? 1.03 : 1) * 1000) });
    if (s.cad) Object.assign(m, { target2Type: TARGET.cadence, target2Value: 0, low2: s.cad[0], high2: s.cad[1] });
    if (s.note) m.notes = s.note.slice(0, 50);
    steps.push(m);
  };
  for (const s of w.steps) {
    if (!s.repeat) { one(s); continue; }
    const first = steps.length;
    s.steps.forEach(one);
    steps.push({ messageIndex: steps.length, durationType: DURATION.repeat, durationValue: first, targetType: TARGET.open, targetValue: s.repeat });
  }
  const sport = FIT_SPORT[w.sport] ?? SPORT.cycling, sub = w.sport === "swim" ? SUB.lapSwimming : w.sport === "strength" ? SUB.strength : 0;
  return writeFit([
    // (made, maker, product and serial number together are each workout file's own, as a device tells them apart by them)
    ["fileId", { type: FILE.workout, manufacturer: 255, product: 0, serial: Math.round(created / 1000), created: Math.round(created / 1000) }],
    ["workout", { name: w.name.slice(0, 31), sport, subSport: sub || null, steps: steps.length, ...(w.sport === "swim" ? { poolLength: 25, poolUnit: 0 } : {}) }],
    ...steps.map((s) => ["workoutStep", s]),
  ]);
}
export function workoutFromFit(bytes, file) {
  const M = readFit(bytes).messages;
  if (M.fileId[0].type !== FILE.workout || !M.workoutStep) throw new Error("That FIT file isn’t a workout.");
  const wk = (M.workout || [])[0] || {}, sport = SPORT_OF[wk.sport] || "ride", raw = M.workoutStep.slice().sort((a, b) => (a.messageIndex ?? 0) - (b.messageIndex ?? 0));
  const ftpPct = (v) => (v == null ? null : v >= 1000 ? null : v / 100);
  const step = (r) => {
    const s = { kind: { [INTENSITY.warmup]: "warmup", [INTENSITY.cooldown]: "cooldown", [INTENSITY.rest]: "rest", [INTENSITY.recovery]: "rest" }[r.intensity] || "work", name: r.name || null };
    if (r.durationType === DURATION.time) s.secs = r.durationValue / 1000;
    else if (r.durationType === DURATION.distance) s.metres = r.durationValue / 100;
    else s.secs = 300;
    let lo = null, hi = null;
    if (r.targetType === TARGET.power) {
      // (watts, as +1000, are taken as a share of the FTP the file was made for: unknown here, so of 250 W)
      lo = ftpPct(r.low) ?? (r.low != null ? (r.low - 1000) / 250 : null); hi = ftpPct(r.high) ?? (r.high != null ? (r.high - 1000) / 250 : null);
      if (lo == null && r.targetValue) { const z = [0, 0.5, 0.65, 0.83, 0.98, 1.13, 1.35, 1.6][r.targetValue] || 0.65; lo = hi = z; }
    } else if (r.targetType === TARGET.speed && r.low) { lo = r.low / 1000 / 4; hi = r.high / 1000 / 4; }
    s.from = lo != null && hi != null ? (lo + hi) / 2 : s.kind === "rest" ? 0.5 : 0.65;
    if (r.target2Type === TARGET.cadence && r.low2) s.cad = [r.low2, r.high2];
    if (r.notes) s.note = r.notes;
    return s;
  };
  // (a repeat step goes back to the step it names: those steps, from there to here, are its block)
  const out = [];
  raw.forEach((r) => {
    // (a repeat: so many times, or until a time, a distance, a heart rate or a power is reached, which is said as once)
    if (!(r.durationType >= DURATION.repeat && r.durationType <= 13)) { out.push({ at: r.messageIndex ?? out.length, s: step(r) }); return; }
    const from = out.findIndex((x) => x.at >= r.durationValue);
    if (from < 0) return;
    const inner = out.splice(from).map((x) => x.s);
    out.push({ at: r.durationValue, s: { repeat: r.durationType === DURATION.repeat ? r.targetValue || 1 : 1, steps: inner } });
  });
  return { id: `w${Date.now()}`, sport, kind: "Imported", name: wk.name || stem(file) || "Imported workout", about: `From ${file || "a FIT file"}.`, steps: out.map((x) => x.s), imported: true };
}

// ZWO: Zwift's workout file (it goes in Documents/Zwift/Workouts/<your Zwift ID>), which MyWhoosh, Golden Cheetah and
// others read too. Power as a share of FTP.
// A warm-up or a cool-down is a ramp (Zwift's cool-down runs from PowerLow down to PowerHigh, as the app draws it); a
// repeat of one hard step and one easy one is IntervalsT; anything else repeated is written out in full.
export function zwoFromWorkout(w) {
  const r2 = (x) => round(x, 3), rows = [];
  const step = (s) => {
    const lo = s.from, hi = s.to ?? s.from, cad = s.cad ? ` Cadence="${Math.round((s.cad[0] + s.cad[1]) / 2)}"` : "";
    if (s.kind === "free") rows.push(`    <FreeRide Duration="${Math.round(s.secs)}"/>`);
    else if (lo !== hi && s.kind === "warmup") rows.push(`    <Warmup Duration="${Math.round(s.secs)}" PowerLow="${r2(lo)}" PowerHigh="${r2(hi)}"${cad}/>`);
    else if (lo !== hi && s.kind === "cooldown") rows.push(`    <Cooldown Duration="${Math.round(s.secs)}" PowerLow="${r2(lo)}" PowerHigh="${r2(hi)}"${cad}/>`);
    else if (lo !== hi) rows.push(`    <Ramp Duration="${Math.round(s.secs)}" PowerLow="${r2(lo)}" PowerHigh="${r2(hi)}"${cad}/>`);
    else rows.push(`    <SteadyState Duration="${Math.round(s.secs)}" Power="${r2(lo)}"${cad}/>`);
  };
  for (const s of w.steps) {
    if (!s.repeat) { step(s); continue; }
    const [a, b] = s.steps;
    if (s.steps.length === 2 && a.to == null && b.to == null && a.secs && b.secs) {
      rows.push(`    <IntervalsT Repeat="${s.repeat}" OnDuration="${Math.round(a.secs)}" OffDuration="${Math.round(b.secs)}" OnPower="${r2(a.from)}" OffPower="${r2(b.from)}"${a.cad ? ` Cadence="${Math.round((a.cad[0] + a.cad[1]) / 2)}"` : ""}/>`);
    } else for (let i = 0; i < s.repeat; i++) s.steps.forEach(step);
  }
  return `<workout_file>
  <author>Fitness</author>
  <name>${esc(w.name)}</name>
  <description>${esc(w.about || "")}</description>
  <sportType>${w.sport === "run" ? "run" : "bike"}</sportType>
  <tags/>
  <workout>
${rows.join("\n")}
  </workout>
</workout_file>
`;
}
export function workoutFromZwo(text, file) {
  const body = (/<workout>([\s\S]*?)<\/workout>/i.exec(text) || [])[1];
  if (!body) throw new Error("That ZWO file has no workout in it.");
  const steps = [];
  for (const m of body.matchAll(/<(Warmup|Cooldown|Ramp|SteadyState|IntervalsT|FreeRide|MaxEffort|SolidState)\b([^>]*?)\/?>/gi)) {
    const [, el, a] = m, n = (k) => num(attr(a, k)), cad = n("Cadence") ? [n("Cadence") - 5, n("Cadence") + 5] : undefined;
    const kind = el.toLowerCase();
    if (kind === "intervalst") {
      steps.push({ repeat: n("Repeat") || 1, steps: [{ kind: "work", secs: n("OnDuration"), from: n("OnPower") ?? n("PowerOnHigh") ?? 1, name: "On", cad }, { kind: "rest", secs: n("OffDuration"), from: n("OffPower") ?? n("PowerOffLow") ?? 0.5, name: "Off" }] });
    } else if (kind === "freeride" || kind === "maxeffort") {
      steps.push({ kind: kind === "maxeffort" ? "work" : "free", secs: n("Duration"), from: kind === "maxeffort" ? 2 : 0.65, name: kind === "maxeffort" ? "Max effort" : "Free ride" });
    } else if (kind === "steadystate" || kind === "solidstate") {
      const p = n("Power") ?? ((n("PowerLow") ?? 0.6) + (n("PowerHigh") ?? 0.6)) / 2;
      steps.push({ kind: p < 0.6 ? "rest" : "steady", secs: n("Duration"), from: p, cad });
    } else {
      steps.push({ kind: kind === "ramp" ? "work" : kind, secs: n("Duration"), from: n("PowerLow") ?? 0.5, to: n("PowerHigh") ?? 0.75, cad });
    }
  }
  if (!steps.length) throw new Error("That ZWO file has no steps Fitness can read.");
  return { id: `w${Date.now()}`, sport: /run/i.test(tag(text, "sportType") || "") ? "run" : "ride", kind: "Imported", name: tag(text, "name") || stem(file) || "Imported workout",
    about: tag(text, "description") || `From ${file || "a ZWO file"}.`, steps, imported: true };
}

// ERG and MRC: the plain text files TrainerRoad's Workout Creator, Golden Cheetah, PerfPRO and other smart-trainer apps
// read. A list of (minute, load) corners joined by straight lines: in watts for ERG (so it needs your FTP), as a share
// of FTP for MRC.
export function ergFromWorkout(w, ftp) { return courseFile(w, ftp, "erg"); }
export function mrcFromWorkout(w) { return courseFile(w, 100, "mrc"); }
function courseFile(w, ftp, kind) {
  const pts = [], f = (x) => (kind === "erg" ? Math.round(x * ftp) : Math.round(x * 1000) / 10);
  let t = 0;
  for (const s of flatten(w)) {
    const a = s.kind === "free" ? 0.6 : s.from, b = s.kind === "free" ? 0.6 : s.to;
    pts.push([t, f(a)]); t += s.secs / 60; pts.push([t, f(b)]);
  }
  const rows = pts.map(([m, v]) => `${m.toFixed(2)}\t${v}`).join("\n");
  return `[COURSE HEADER]
VERSION = 2
UNITS = ENGLISH
DESCRIPTION = ${(w.about || "").replace(/[\r\n]+/g, " ")}
FILE NAME = ${w.name}
${kind === "erg" ? `FTP = ${ftp}\nMINUTES WATTS` : "MINUTES PERCENT"}
[END COURSE HEADER]
[COURSE DATA]
${rows}
[END COURSE DATA]
`;
}
// .plan: what the first ELEMNT, BOLT and ROAM (before 2024) read from their plans folder. Wahoo never published it;
// this is the shape the files those devices came with have, as others have written it down: a header, then each step
// as an interval with its target as a share of FTP and when it ends. Repeats are written out in full, as how a repeat's
// written was never pinned down.
export function planFromWorkout(w) {
  const steps = flatten(w), lines = ["=HEADER=", `NAME=${line(w.name)}`, `DESCRIPTION=${line(w.about || "")}`, `DURATION=${Math.round(steps.reduce((a, s) => a + s.secs, 0))}`,
    "PLAN_TYPE=0", `WORKOUT_TYPE=${w.sport === "run" ? 1 : 0}`, "LOCATION_TYPE=0", "=STREAM="];
  for (const s of steps) {
    const lo = Math.min(s.from, s.to), hi = Math.max(s.from, s.to), held = lo === hi;
    lines.push("=INTERVAL=", `INTERVAL_NAME=${line(s.name || (s.kind === "rest" ? "Easy" : "Interval"))}`);
    if (s.kind !== "free") lines.push(`PERCENT_FTP_LO=${Math.round(lo * 100) - (held ? 2 : 0)}`, `PERCENT_FTP_HI=${Math.round(hi * 100) + (held ? 3 : 0)}`);
    if (s.cad) lines.push(`CAD_LO=${s.cad[0]}`, `CAD_HI=${s.cad[1]}`);
    lines.push(s.metres && !s.secs ? `MESG_DISTANCE_M>=${Math.round(s.metres)}?EXIT` : `MESG_DURATION_SEC>=${Math.round(s.secs)}?EXIT`);
  }
  return lines.join("\n") + "\n";
}
const line = (s) => String(s).replace(/[\r\n=]+/g, " ").trim();
export function workoutFromCourse(text, file, ftp = 250) {
  const data = (/\[COURSE DATA\]([\s\S]*?)\[END COURSE DATA\]/i.exec(text) || [])[1];
  if (!data) throw new Error("That file has no course data in it.");
  const pct = /MINUTES\s+PERCENT/i.test(text), fileFtp = num((/FTP\s*=\s*(\d+)/i.exec(text) || [])[1]) || ftp;
  const pts = data.trim().split(/\r?\n/).map((l) => l.trim().split(/\s+/).map(Number)).filter((p) => p.length >= 2 && p.every(Number.isFinite));
  const steps = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [m0, v0] = pts[i], [m1, v1] = pts[i + 1], secs = (m1 - m0) * 60;
    if (secs <= 0) continue;
    const a = pct ? v0 / 100 : v0 / fileFtp, b = pct ? v1 / 100 : v1 / fileFtp;
    steps.push({ kind: a < 0.6 && b < 0.6 ? "rest" : "work", secs, from: round(a, 3), to: Math.abs(a - b) > 0.005 ? round(b, 3) : undefined });
  }
  if (!steps.length) throw new Error("That file has no steps Fitness can read.");
  const name = (/FILE NAME\s*=\s*(.+)/i.exec(text) || [])[1]?.trim();
  return { id: `w${Date.now()}`, sport: "ride", kind: "Imported", name: name || stem(file) || "Imported workout", about: (/DESCRIPTION\s*=\s*(.+)/i.exec(text) || [])[1]?.trim() || `From ${file}.`, steps, imported: true };
}
const stem = (file) => (file ? file.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() : null);

// ---- a file, whatever it is ----
// What's in a file you've chosen or dropped: { activities, workouts }, by its name and what it starts with. A zip (as
// Garmin Connect's "Export original" gives you) is opened and each file in it read.
// Each activity carries its file as it came (raw: its name, kind and bytes), to be kept as it is.
export async function readAny(name, bytes) {
  const out = await readFile(name, bytes);
  return out;
}
async function readFile(name, bytes) {
  const lower = name.toLowerCase(), u8 = new Uint8Array(bytes), text = () => new TextDecoder().decode(u8);
  const as = (type, acts) => acts.map((a) => Object.assign(a, { raw: { name, type, bytes: u8 } }));
  if (u8[0] === 0x50 && u8[1] === 0x4b) {
    const out = { activities: [], workouts: [], skipped: [] };
    for (const f of await unzip(u8)) {
      try { const r = await readFile(f.name, f.data); out.activities.push(...r.activities); out.workouts.push(...r.workouts); }
      catch (e) { out.skipped.push(`${f.name}: ${e.message}`); }
    }
    return out;
  }
  if (lower.endsWith(".fit") || String.fromCharCode(u8[8], u8[9], u8[10], u8[11]) === ".FIT") {
    try { return { activities: as("fit", activityFromFit(u8, name)), workouts: [] }; }
    catch (e) { if (e.workout) return { activities: [], workouts: [workoutFromFit(u8, name)] }; throw e; }
  }
  if (lower.endsWith(".gpx")) return { activities: as("gpx", [activityFromGpx(text(), name)]), workouts: [] };
  if (lower.endsWith(".tcx")) return { activities: as("tcx", [activityFromTcx(text(), name)]), workouts: [] };
  if (lower.endsWith(".zwo")) return { activities: [], workouts: [workoutFromZwo(text(), name)] };
  if (lower.endsWith(".erg") || lower.endsWith(".mrc")) return { activities: [], workouts: [workoutFromCourse(text(), name)] };
  const t = text().slice(0, 400);
  if (/<gpx\b/i.test(t)) return { activities: as("gpx", [activityFromGpx(text(), name)]), workouts: [] };
  if (/<TrainingCenterDatabase\b/i.test(t)) return { activities: as("tcx", [activityFromTcx(text(), name)]), workouts: [] };
  if (/<workout_file\b/i.test(t)) return { activities: [], workouts: [workoutFromZwo(text(), name)] };
  throw new Error("Fitness reads FIT, GPX, TCX, ZWO, ERG and MRC files (and zips of them).");
}

// ---- zip ----
// A zip of files, stored as they are (FIT files barely shrink): for several files at once, and for "Export everything".
// An entry: { name, data } (bytes, or a string), or { name, blob, crc, size }, a file already handed to the browser as
// it came, its check and length worked out then (zipBlob: a long history never in the page twice)
function zipParts(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let off = 0;
  const now = new Date(), dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const f of files) {
    const name = enc.encode(f.name), data = f.blob || (typeof f.data === "string" ? enc.encode(f.data) : f.data);
    const crc = f.blob ? f.crc : crc32(data), size = f.blob ? f.size : data.length;
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, dosTime, true); h.setUint16(12, dosDate, true); h.setUint32(14, crc, true); h.setUint32(18, size, true); h.setUint32(22, size, true);
    h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true); c.setUint32(16, crc, true); c.setUint32(20, size, true); c.setUint32(24, size, true);
    c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    parts.push(new Uint8Array(h.buffer), name, data);
    central.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + size;
  }
  const cdSize = central.reduce((a, p) => a + p.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
  return [...parts, ...central, new Uint8Array(end.buffer)];
}
export function zip(files) {
  const all = zipParts(files), out = new Uint8Array(all.reduce((a, p) => a + p.length, 0));
  let p = 0;
  for (const x of all) { out.set(x, p); p += x.length; }
  return out;
}
export const zipBlob = (files) => new Blob(zipParts(files), { type: "application/zip" });
// The files in a zip: stored, or deflated (unpacked by the browser's own DecompressionStream)
export async function unzip(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), out = [];
  let e = u8.length - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error("That zip file is damaged.");
  let p = dv.getUint32(e + 16, true);
  const n = dv.getUint16(e + 10, true);
  for (let i = 0; i < n; i++) {
    const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const at = dv.getUint32(p + 42, true), name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (name.endsWith("/") || /(^|\/)(__MACOSX|\.)/.test(name)) continue;
    const start = at + 30 + dv.getUint16(at + 26, true) + dv.getUint16(at + 28, true), raw = u8.subarray(start, start + size);
    const data = method === 0 ? raw : method === 8 ? new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer()) : null;
    if (data) out.push({ name: name.split("/").pop(), data });
  }
  return out;
}
const CRC32 = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC32[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

// a file name for something, safe on every system and every device's card: plain letters ("2026-10-25 Sweet spot 3 x
// 12.fit"), as browsers drop a name they don't like and some devices show only these
export const fileName = (stemText, ext) => `${String(stemText).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/×/g, "x").replace(/[–—]/g, "-").replace(/₂/g, "2")
  .replace(/[^\x20-\x7e]/g, "").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 80) || "Fitness"}.${ext}`;
