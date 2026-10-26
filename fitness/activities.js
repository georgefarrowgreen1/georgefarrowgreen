// Fitness's Activities: every ride, run and swim, each with its route, figures, charts, zones, efforts and best
// efforts; their figures filled in, in the background. Drawn by app.js render.

import { A, C, F, HR_ZONES, M, P, S, Sheet, TODAY, U, ZONES, addDays, bigMapView, calendar, card, chooseFiles, clock, closeSheet, dateShort, dayLong, dayShort, dist, distNum, drawSheet, dur, fileKey, fitness, fitnessSeries, formSaid, full, garminView, h, head, height, held, hm, icon, idb, lightNow, load, mapCredit, mondayOf, openSheet, pace, pct, perSecond, plan, plannedOn, plural, pushSheet, redraw, routeOf, row, saveFile, section, setActs, sheetBack, sheetEl, sheetW, signed, signedOutHere, speed, sportTile, startOfDay, stat, store, sumOf, summarise, svgOf, timeOf, toast, upload, wait, weeks, wkById, zoneOf } from "./app.js";
import { effortFigs, effortsCard, effortsOf, effortsSeen } from "./today.js";
import { download, paceOfSpeed } from "./plan.js";

// ---- Activities ----
const PAGE = 60;
// (the next weeks drawn as the list's end comes into view, as if it were all there)
let moreSeen = null;
function whenSeen(btn) {
  if (!("IntersectionObserver" in window)) return;
  moreSeen?.disconnect();
  moreSeen = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { moreSeen.disconnect(); btn.click(); } }, { rootMargin: "600px 0px" });
  setTimeout(() => btn.isConnected && moreSeen.observe(btn), 0);
}
function activitiesView() {
  const sports = [["all", "All"], ["ride", "Rides"], ["run", "Runs"], ["other", "Other"]], at = sports.findIndex(([k]) => k === S.actSport);
  const list = S.acts.filter((a) => S.actSport === "all" || a.sport === S.actSport || (S.actSport === "other" && a.sport !== "ride" && a.sport !== "run"));
  const out = [head("Activities", S.acts.length ? `${plural(S.acts.length, "activity", "activities")}${S.bringing ? " so far" : ""}` : "None yet", h("button.round", { type: "button", "aria-label": "Upload files", onclick: () => openSheet(uploadFilesView) }, icon("upload", 21, 2.1)))];
  // Garmin's six months coming in
  if (S.bringing) out.push(bringingCard());
  // none yet: Garmin, or files
  if (!S.acts.length) return S.bringing ? out : [...out, ...firstUpload()];
  // the last four weeks, at a glance
  const since = addDays(TODAY, -27), recent = S.acts.filter((a) => a.start >= since);
  const tot = recent.reduce((t, a) => { const s = sumOf(a); if (s) { t.secs += s.moving || 0; t.dist += s.dist || 0; t.tss += s.tss || 0; t.asc += s.ascent || 0; } return t; }, { secs: 0, dist: 0, tss: 0, asc: 0 });
  if (S.acts.length) out.push(card(null, "The last four weeks", S.summed ? h("div.stats", {}, stat("Time", hm(tot.secs), tot.secs >= 3600 ? "h" : null), stat("Distance", ...distNum(tot.dist)), stat("Climbing", ...height(tot.asc))) : wait(48)));
  out.push(h("div.seg.wide", { vars: { "--n": 4, "--at": at }, role: "group", "aria-label": "Sport" }, sports.map(([k, label]) => h("button", { type: "button", "aria-pressed": String(S.actSport === k), onclick: () => { S.actSport = k; redraw(); } }, label))));
  // by week, newest first: the first weeks drawn, more as you come to the end of them (a long history isn't drawn at once)
  const show = S.actShow || PAGE, shown = list.slice(0, show);
  const byWeek = new Map();
  for (const a of shown) { const k = mondayOf(a.start); if (!byWeek.has(k)) byWeek.set(k, []); byWeek.get(k).push(a); }
  const thisMon = mondayOf(TODAY);
  if (!list.length) out.push(h("p.foot.none", { text: `No ${sports[at][1].toLowerCase()} yet.` }));
  for (const [mon, acts] of byWeek) {
    const name = mon === thisMon ? "This week" : mon === addDays(thisMon, -7) ? "Last week" : `${dateShort(mon)} – ${dateShort(addDays(mon, 6))}`;
    const secs = acts.reduce((t, a) => t + (sumOf(a)?.moving || 0), 0);
    out.push(section([name, h("span.aside", { text: S.summed ? dur(secs) : "" })], h("div.group.glass", {}, acts.map(actRow))));
  }
  if (list.length > show) { const more = h("button.more-acts.pill", { type: "button", onclick: () => { S.actShow = show + PAGE * 2; redraw(); } }, `Show more · ${(list.length - show).toLocaleString("en-GB")} older`); out.push(h("div.more-wrap", {}, more)); whenSeen(more); }
  if (list.length) out.push(h("p.foot", { vars: { "text-align": "center" } }, h("button.link", { type: "button", onclick: () => openSheet(uploadFilesView) }, "Upload more activities")));
  return out;
}
// Your first activities: Garmin connected (six months in at once, then each new one by itself), or files uploaded,
// and what they're for
function firstUpload() {
  const choice = (tile, title, sub, onclick, best = false) => h("button.choice" + (best ? ".best" : ""), { type: "button", onclick }, tile,
    h("span.tx", {}, h("b", {}, title, best && h("small.badge", { text: "Best" })), h("small", { text: sub })), h("span.chev", {}, icon("chev", 17, 2.4)));
  const gets = (ic, cls, title, sub) => h("div.row.plain", {}, h("span.ic.soft." + cls, {}, icon(ic, 17, 2.2)), h("span.tx", {}, h("b", { text: title }), h("small", { text: sub })));
  const g = S.garmin?.on;
  return [
    h("div.card.glass.first", {},
      h("div.first-top", {}, h("h2", { text: "Bring your rides in" }), h("p", { text: "Rhythm plans from what you’ve done, so the more it sees, the better it gets." })),
      choice(h("span.big.ic.brand.garmin", {}, icon("device", 22, 2)), g ? "Garmin connected" : "Connect Garmin", g ? (S.garmin.ok ? "New activities come in by themselves" : "Your key has stopped working: add a new one") : "Six months in at once, then every ride by itself",
        () => openSheet(garminView), !g),
      choice(h("span.big.ic.coral", {}, icon("upload", 22, 2.2)), "Upload files", "From Wahoo, Strava, Zwift or anything else", () => openSheet(uploadFilesView))),
    section("What you’ll get", h("div.group.glass", {},
      gets("gauge", "red", "Fitness, fatigue and form", "From every ride’s training stress"),
      gets("calendar", "blue", "A plan that follows you", "Rhythm starts from your real history"),
      gets("bolt", "green", "Your best power", "5 seconds to an hour, and an FTP to try"))),
  ];
}
// Garmin's six months, coming in: how many so far, and how far back it goes
function bringingCard() {
  const all = S.bringing.all, at = S.bringing.at > Date.UTC(2000, 0, 2) ? S.bringing.at : null;
  const back = all ? (at ? `up to ${new Date(at).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}` : "looking for your first") : new Date(addDays(TODAY, -183)).toLocaleDateString("en-GB", { month: "long" });
  return h("div.card.glass.bringing", { role: "status" },
    h("div.bringing-top", {}, h("span.ic.brand.garmin", {}, icon("device", 20, 2)),
      h("span.tx", {}, h("b", { text: all ? "Bringing in all your rides from Garmin" : "Bringing in six months from Garmin" }), h("small", { text: `${S.bringing.n ? `${plural(S.bringing.n, "activity", "activities")} so far${all && at ? `, ${back}` : ""}` : all ? `Starting from the oldest: ${back}` : `Back to ${back}`} · you can carry on meanwhile` }))),
    h("div.bar", {}, h("i")));
}
// Uploading files: choose them, and where each app keeps them (Garmin's connected instead)
function uploadFilesView() {
  const where = (letter, cls, title, sub) => h("div.row.plain", {}, h("span.ic." + cls, {}, h("b", { text: letter })), h("span.tx", {}, h("b", { text: title }), h("small", { text: sub })));
  return { title: "Upload files", body: [
    h("div.drop-zone", {}, h("span.big.ic.coral", {}, icon("upload", 24, 2.2)),
      h("p", { text: "FIT, GPX or TCX, or a zip of them. Fitness works out what each one was, and you check before it’s saved." }),
      h("button.btn", { type: "button", onclick: () => { chooseFiles(); closeSheet(); } }, "Choose files")),
    section("Where to find them", h("div.group", {},
      where("W", "blue", "Wahoo", "In the Wahoo app: an activity, then Share › Download .fit"),
      where("S", "amber", "Strava", "On strava.com: an activity, then ⋯ › Export Original"),
      where("Z", "indigo", "Zwift", "Documents › Zwift › Activities, on the computer you ride on"))),
    !S.garmin?.on && h("div.note-garmin", {}, h("span.ic.brand.garmin", {}, icon("device", 15, 2.2)),
      h("span", {}, "On Garmin? ", h("button.link", { type: "button", onclick: () => pushSheet(garminView) }, "Connect it instead"), ", and skip the files.")),
  ] };
}
// An activity's row: its route's shape (or, indoors, its sport), its name with its distance, its day and the session
// it was from your plan (else the device it came from), and how long and how hard
const withRoute = (sum, a) => { const r = F.routeShape(a.s); return r ? { ...sum, route: r } : sum; };
function routeTile(r, sport) {
  const p = []; for (let i = 0; i + 1 < r.length; i += 2) p.push(`${i ? "L" : "M"}${Number(r[i]) || 0} ${Number(r[i + 1]) || 0}`);
  return h("span.tile.route.s-" + sport, {}, svgOf(`<svg viewBox="0 0 100 100" aria-hidden="true"><path d="${p.join("")}"/></svg>`));
}
function actRow(a) {
  const s = sumOf(a), r = s?.route, pid = a.sample ? null : plannedOn(startOfDay(a.start)), pw = pid && pid !== "event" ? wkById(pid) : null;
  const named = s?.dist > 100 && !/\d\s?(km|mi)\b/i.test(a.name) ? `${a.name} · ${dist(s.dist)}` : a.name;
  return h("button.row", { type: "button", onclick: () => openAct(a) }, r ? routeTile(r, a.sport) : sportTile(a.sport),
    h("span.tx", {}, h("b", { text: named }), h("small.one-line", { text: `${dayShort(a.start)} · ${pw && pw.sport === a.sport ? pw.name : a.device || (a.sample ? "Example" : "Uploaded")}` })),
    h("span.val", {}, s ? hm(s.moving) : "", h("small", { text: s?.tss != null ? `TSS ${s.tss}` : "" })));
}
// A ride's staying power, from its samples: heart rate's drift against power, its second half on its first (rides of 90
// minutes and more with both: under 5% is a well-built base), and its best 20 minutes after the first two hours
const XV = 2;
function staying(a) {
  const out = { xv: XV };
  if (a.sport !== "ride" || !a.s?.pwr) return out;
  const ps = perSecond(a), p = ps.pwr, hr = ps.hr, n = p?.length || 0;
  if (hr && n >= 5400) {
    const ef = (from, to) => { let w = 0, b = 0, c = 0; for (let i = from; i < to; i++) if (ps.moving[i] && p[i] > 0 && hr[i] > 0) { w += p[i]; b += hr[i]; c++; } return c > 600 ? w / b : null; };
    const e1 = ef(0, n >> 1), e2 = ef(n >> 1, n);
    if (e1 && e2) out.drift = Math.round(((e1 - e2) / e1) * 1000) / 10;
  }
  if (n >= 7200 + 1200) {
    let sum = 0, best = 0;
    for (let i = 7200; i < n; i++) { sum += Number.isFinite(p[i]) ? p[i] : 0; if (i >= 7200 + 1200) sum -= Number.isFinite(p[i - 1200]) ? p[i - 1200] : 0; if (i >= 7200 + 1199) best = Math.max(best, sum / 1200); }
    if (best > 0) out.late20 = Math.round(best);
  }
  return out;
}
const withFigures = (sum, a) => ({ ...withRoute(sum, a), ...staying(a), ...effortFigs(a, a) });
// The ones kept before rows had these: each read from its file as the app opens, a few at a time, and its route's shape
// and staying power added (one with no route, an indoor ride, remembered here so it isn't looked for again)
async function routes() {
  if (routes.busy || !S.me) return;
  routes.busy = true;
  const none = new Set(store.get("noroute", [])), me = S.me.id;
  try {
    for (const a of S.own.filter((x) => (!sumOf(x)?.route && !none.has(x.id)) || !(sumOf(x)?.xv >= XV)).slice(0, 40)) {
      if (S.me?.id !== me || document.querySelector(".btn[disabled]")) break;
      try {
        const x = await load(a), r = sumOf(a)?.route ? null : F.routeShape(x.s), figs = { ...staying(x), ...effortFigs(a, x), ...(r ? { route: r } : {}) };
        if (!r && !sumOf(a)?.route) none.add(a.id);
        await A.addFigures(a.id, figs);
        a.sum = { ...(a.sum || {}), ...figs }; const s = sumOf(a); if (s) S.sums.set(a.id, { ...s, ...figs });
        if (S.tab === "activities" || S.tab === "progress") redraw();
      } catch (e) { if (e.status === 401 || e.offline) break; none.add(a.id); }
    }
  } finally { routes.busy = false; store.set("noroute", [...none].slice(-2000)); }
}
// an activity, opened: its file read first, where it isn't here yet (from this device's copy, or the account's)
async function openAct(a) {
  if (full(a)) return openSheet(() => actView(a), { tall: true });
  openSheet(() => ({ title: a.name, body: [h("div.sheet-top", {}, h("div.sub", {}, sportTile(a.sport, true), `${dayLong(a.start)}, ${timeOf(a.start)}`), h("h1", { text: a.name }),
    h("div.sub", { text: "Opening its file…" })), wait(220), wait(160)] }), { tall: true });
  try {
    await load(a);
    if (sheetEl.open && !sheetEl.classList.contains("closing")) { Sheet.stack = [() => actView(a)]; drawSheet(); }
  } catch (e) { if (e.status === 401) return signedOutHere(); closeSheet(); toast(e.message, true); }
}
function actView(a) {
  // (one of yours worked out afresh from its file, its zones and all, for your numbers now)
  const x = full(a), s = a.sample ? sumOf(a) || summarise(x, P()) : summarise(x, P()), ps = perSecond(x), w = a.workout ? wkById(a.workout) : null, plannedId = plannedOn(startOfDay(a.start));
  const planned = plannedId && plannedId !== "event" ? wkById(plannedId) : null;
  const body = [];
  body.push(h("div.sheet-top", {}, h("div.sub", {}, sportTile(a.sport, true), `${dayLong(a.start)}, ${timeOf(a.start)}`), h("h1", { text: a.name }),
    !a.sample && h("div.sub", {}, h("button.link.small", { type: "button", onclick: () => pushSheet(() => renameView(a)) }, "Rename")),
    planned && planned.sport === a.sport && h("div.sub", {}, h("span.tick-badge", {}, icon("check", 14, 3)), `From your plan: ${planned.name}`)));
  // the route, coloured by the power there (30 seconds' average) or plain
  let mapAt = null;
  if (x.s.lat) {
    const roll = ps.pwr ? rollAvg(ps.pwr, 30) : null;
    const zoneAt = roll ? (i) => zoneOf((roll[Math.min(roll.length - 1, Math.round(x.s.t[i]))] || 0) / P().ftp).c : null;
    const r = C.route(x.s, zoneAt, sheetW() + 36, U.metric), box = h("div.map", {}, r.el);
    let gl = null;
    const sampleAt = (sec) => { let lo = 0, hi = x.s.t.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (x.s.t[m] < sec) lo = m + 1; else hi = m; } return lo; };
    mapAt = (sec) => { if (sec == null) { r.at(null); gl?.at(null); return; } const i = sampleAt(sec); r.at(i); if (gl && x.s.lat[i] != null) gl.at([x.s.lon[i], x.s.lat[i]]); };
    // (on a real map, where the phone can draw one: the route as ridden, over it; a tap opens it to explore)
    if (M.able()) {
      const route = routeOf(x.s, zoneAt), holder = h("div.map-gl", { role: "button", tabindex: "0", "aria-label": "The route on a map: open it to explore", onclick: () => pushSheet(() => bigMapView(a.name, route)) }, mapCredit(), h("span.map-open", { "aria-hidden": "true" }, icon("open", 15, 2.4)));
      box.replaceChildren(holder);
      // (and where it can't after all, its own drawing of the route back)
      M.routeMap(holder, { ...route, light: lightNow() }).then((g) => { gl = g; }).catch(() => box.replaceChildren(r.el));
    }
    body.push(box);
  }
  const ftp = P().ftp;
  body.push(card(null, null, h("div.stats", {},
    s.dist > 100 && stat("Distance", ...distNum(s.dist)), stat("Moving time", clock(s.moving)), s.ascent > 0 && stat("Climbing", ...height(s.ascent)),
    a.sport === "ride" && s.avgSpd > 0 && stat("Average speed", ...speed(s.avgSpd)), a.sport === "run" && s.avgSpd > 0 && stat("Average pace", pace(paceOfSpeed(s.avgSpd)).split(" ")[0], U.metric ? "/km" : "/mi"),
    s.avgPwr != null && stat("Average power", s.avgPwr, "W"), s.np != null && stat("Normalized Power", s.np, "W"), s.iF != null && stat("Intensity", s.iF.toFixed(2)),
    s.tss != null && stat({ hr: "TSS (heart rate)", pace: "TSS (pace)" }[s.kind] || "Training stress", s.tss), s.avgHr > 0 && stat("Average heart rate", s.avgHr, "bpm"), s.maxHr > 0 && stat("Max heart rate", s.maxHr, "bpm"),
    s.avgCad > 0 && stat("Cadence", s.avgCad, a.sport === "run" ? "spm" : "rpm"), s.kj != null ? stat("Work", s.kj.toLocaleString("en-GB"), "kJ") : stat("Energy", s.kcal, "kcal"))));
  // power, heart rate and height, with a cursor that says what each was there (and moves a marker on the map)
  if (ps.moving.length > 60) {
    const cw = sheetW(), pic = C.streams(ps, s.secs, cw), cur = pic.querySelector(".cursor"), read = h("p.readout", { text: "Touch the chart to see each moment." });
    const show = (e) => {
      const r = pic.getBoundingClientRect(), f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), sec = Math.round(f * (ps.moving.length - 1));
      cur.setAttribute("x1", f * cw); cur.setAttribute("x2", f * cw); cur.setAttribute("visibility", "visible");
      const v = (arr, k = 0) => (arr && Number.isFinite(arr[sec]) ? arr[sec] : null), pw = ps.pwr ? rollAvg(ps.pwr, 3, sec) : null;
      read.replaceChildren(h("b", { text: clock(sec) }), pw != null ? ` · ${Math.round(pw)} W` : "", v(ps.hr) != null ? ` · ${Math.round(v(ps.hr))} bpm` : "",
        v(ps.spd) != null ? ` · ${speed(v(ps.spd)).join(" ")}` : "", v(ps.ele) != null ? ` · ${height(v(ps.ele)).join(" ")}` : "");
      mapAt?.(sec);
    };
    pic.addEventListener("pointermove", show); pic.addEventListener("pointerdown", show);
    pic.addEventListener("pointerleave", () => { cur.setAttribute("visibility", "hidden"); mapAt?.(null); });
    body.push(card(null, "Through the ride", read, pic, h("div.legend", {}, ps.pwr && h("span", {}, h("i.lg-pwr"), "Power"), ps.hr && h("span", {}, h("i.lg-hr"), "Heart rate"), !ps.pwr && ps.spd && h("span", {}, h("i.lg-spd"), "Speed"), ps.ele && h("span", {}, h("i.lg-ele"), "Height"))));
  // (the efforts, against the session it was for)
  { const e = effortsOf(a, x); if (e) { effortsSeen.set(a.id, e); body.push(effortsCard(e)); } }
  }
  // time in zones
  if (s.zones) body.push(card(null, `Time in power zones · FTP ${ftp} W`, zoneBars(s.zones, ZONES.map((z, i) => `${z.name} · ${i ? Math.round(ZONES[i - 1].top * ftp) : 0}${z.top < 9 ? `–${Math.round(z.top * ftp)}` : "+"} W`), ZONES.map((z) => z.c))));
  if (s.hrZones) body.push(card(null, `Time in heart rate zones · threshold ${P().lthr} bpm`, zoneBars(s.hrZones, HR_ZONES.map((z, i) => `${z.name} · ${i ? Math.round(HR_ZONES[i - 1].top * P().lthr) : 0}${z.top < 9 ? `–${Math.round(z.top * P().lthr)}` : "+"} bpm`), ["z1", "z2", "z3", "z4", "z6"])));
  if (s.curve && Object.keys(s.curve).length > 2) {
    // (an FTP read from the best 20 minutes only where they were ridden hard: an easy ride's says nothing about it)
    const best20 = s.curve[1200], est = best20 ? Math.round(best20 * 0.95) : 0;
    body.push(card(null, "Best efforts", C.curve(s.curve, ftp, sheetW()), best20 > 0 && h("p.line-said", { text: `Your best 20 minutes: ${best20} W, ${pct(best20 / ftp)} of your FTP.${est > ftp + 4 ? ` That’s an FTP of about ${est} W, above your ${ftp} W: worth a test.` : ""}` })));
  }
  if (x.laps.length > 1 && x.laps.length <= 30) {
    body.push(section(`Laps (${x.laps.length})`, h("div.group", {}, x.laps.map((l, i) => {
      const p = ps.pwr ? avgOver(ps.pwr, l.start, l.secs) : null, hr = ps.hr ? avgOver(ps.hr, l.start, l.secs) : null;
      return h("div.row.plain", {}, h("span.tx", {}, h("b", { text: `Lap ${i + 1}` }), h("small", { text: clock(l.secs) })), h("span.val", { text: [p != null && `${Math.round(p)} W`, hr != null && `${Math.round(hr)} bpm`].filter(Boolean).join(" · ") }));
    }))));
  }
  // and out again (the example rides only: your own are kept as you uploaded them)
  const stem = `${new Date(a.start).toISOString().slice(0, 10)} ${a.name}`;
  if (a.sample) body.push(section("Export", h("div.group", {},
    row({ tile: h("span.ic.coral", {}, icon("file", 18, 2)), title: "FIT", sub: "For Garmin Connect, Strava, TrainingPeaks, intervals.icu, and the Wahoo app", chev: false, extra: h("span.get", {}, icon("download", 18, 2.2)), onclick: () => saveFile(F.fileName(stem, "fit"), F.fitFromActivity(x, s)) }),
    x.s.lat && row({ tile: h("span.ic.blue", {}, icon("file", 18, 2)), title: "GPX", sub: "For maps and route apps (Komoot, RideWithGPS), with heart rate, cadence and power", chev: false, extra: h("span.get", {}, icon("download", 18, 2.2)), onclick: () => saveFile(F.fileName(stem, "gpx"), F.gpxFromActivity(x)) }),
    row({ tile: h("span.ic.grey", {}, icon("file", 18, 2)), title: "TCX", sub: "Garmin’s older format, for tools that want it", chev: false, extra: h("span.get", {}, icon("download", 18, 2.2)), onclick: () => saveFile(F.fileName(stem, "tcx"), F.tcxFromActivity(x, s)) })),
    h("p.foot", { text: "Garmin Connect: Import Data takes any of these. The Wahoo app: History, then + and Upload, takes the FIT file." })));
  if (!a.sample) body.push(h("div.group", {}, h("button.row.action.danger", { type: "button", onclick: async (e) => {
    const b = e.currentTarget;
    if (!b.dataset.sure) { b.dataset.sure = "1"; b.textContent = "Delete it, and its file, for good"; return; }
    try { await A.remove(a.id); } catch (err) { if (err.status === 401) return signedOutHere(); return toast(err.message, true); }
    S.own = S.own.filter((y) => y.id !== a.id); setActs(); S.sums.delete(a.id); held.delete(a.id); idb.del(fileKey(a)).catch(() => {});
    closeSheet(); toast("Deleted"); redraw();
  } }, "Delete this activity")));
  return { title: a.name, body };
}
// a new name for one of yours
function renameView(a) {
  const field = h("input.field", { type: "text", id: "act-name", value: a.name, maxlength: 80, "aria-label": "Name" });
  const save = async () => {
    const name = field.value.trim() || a.name;
    try { await A.rename(a.id, name); } catch (e) { return toast(e.message, true); }
    a.name = name; const x = held.get(a.id); if (x) x.name = name;
    for (const y of S.own) if (y.id === a.id) y.name = name;
    setActs(); redraw(); sheetBack(); toast("Renamed");
  };
  setTimeout(() => field.focus(), 350);
  field.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
  return { title: "Rename", right: h("button.link.done.r", { type: "button", onclick: save }, "Save"), body: [field] };
}
function zoneBars(secs, labels, cls) {
  const total = secs.reduce((a, b) => a + b, 0) || 1, max = Math.max(...secs);
  const bars = secs.map((v, i) => {
    const fill = h("i.bg-" + cls[i]);
    requestAnimationFrame(() => requestAnimationFrame(() => fill.style.setProperty("width", `${(v / max) * 100}%`)));
    return h("div.zrow", { title: labels[i] }, h("span", { text: `Z${i + 1}` }), h("span.zbar", { "aria-label": `${labels[i]}: ${dur(v)}, ${pct(v / total)}` }, fill), h("span.zv", { text: v >= 60 ? `${dur(v)}` : v ? "<1 min" : "–" }));
  });
  return h("div.zones", {}, bars);
}
const rollAvg = (arr, n, at = null) => {
  if (at != null) { let t = 0, c = 0; for (let j = Math.max(0, at - n + 1); j <= at; j++) if (Number.isFinite(arr[j])) { t += arr[j]; c++; } return c ? t / c : null; }
  const out = new Float64Array(arr.length); let t = 0;
  for (let i = 0; i < arr.length; i++) { t += Number.isFinite(arr[i]) ? arr[i] : 0; if (i >= n) t -= Number.isFinite(arr[i - n]) ? arr[i - n] : 0; out[i] = t / Math.min(i + 1, n); }
  return out;
};
const avgOver = (arr, from, secs) => { let t = 0, c = 0; for (let i = Math.round(from); i < Math.min(arr.length, from + secs); i++) if (Number.isFinite(arr[i])) { t += arr[i]; c++; } return c ? t / c : null; };

// fitness and form, over longer
function formView() {
  const f = fitnessSeries(), last = f.at(-1), said = formSaid(last.tsb), days = S.formDays;
  const seg = h("div.seg", { vars: { "--n": 3, "--at": [42, 90, 180].indexOf(days) }, role: "group", "aria-label": "How far back" },
    [[42, "6 weeks"], [90, "3 months"], [180, "6 months"]].map(([d, l]) => h("button", { type: "button", "aria-pressed": String(days === d), onclick: () => { S.formDays = d; Sheet.redraw(); } }, l)));
  return {
    title: "Fitness and form",
    body: [
      h("div.sheet-top", {}, h("h1", { text: `${said.word}, at ${signed(last.tsb)}` }), h("div.sub", { text: said.line })),
      // (form on its band: strain, building, neutral, fresh, rested, −40 to +30; and fitness and fatigue now)
      card("form-now", null,
        h("div.fband", { "aria-hidden": "true" }, h("span.track"), h("span.knob", { vars: { left: Math.max(2, Math.min(98, ((last.tsb + 40) / 70) * 100)) + "%" } }), h("span.lab", {}, ["Strain", "Building", "Neutral", "Fresh", "Rested"].map((t) => h("span", { text: t })))),
        h("div.fit-tiles", {},
          h("div", {}, h("small", {}, h("i.dot-fit"), "Fitness"), h("b", { text: Math.round(last.ctl) }), h("small.sub", { text: `${last.ctl >= (f.at(-8) || last).ctl ? "+" : "−"}${Math.abs(Math.round(last.ctl - (f.at(-8) || last).ctl))} this week` })),
          h("div", {}, h("small", {}, h("i.dot-fat"), "Fatigue"), h("b", { text: Math.round(last.atl) }), h("small.sub", { text: last.atl < 5 ? "All but gone" : last.atl > last.ctl ? "Above your fitness" : "Below your fitness" })))),
      seg,
      card(null, null, C.fitnessChart(f, { days: Math.min(days, f.length), W: sheetW() }), h("div.legend", {}, h("span", {}, h("i.lg-fit"), `Fitness ${Math.round(last.ctl)}`), h("span", {}, h("i.lg-fat"), `Fatigue ${Math.round(last.atl)}`), h("span", {}, h("i.lg-form"), "Form"))),
      h("p", { text: "Fitness is your training stress averaged over the last six weeks; fatigue, over the last one. Form is the gap between them: below zero you’re carrying fatigue, which is where training does its work; above it, you’re fresh." }),
      h("p", { text: "Each ride’s stress comes from its power against your FTP (an hour flat out is 100), or from heart rate where there’s no power. Keep fitness rising by about 3 to 6 a week, and take an easier week every fourth." }),
    ],
  };
}

export { actRow, activitiesView, formView, openAct, rollAvg, routes, staying, uploadFilesView, withFigures, zoneBars };
