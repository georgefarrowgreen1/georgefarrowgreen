// Fitness's Activities under InFlite's roof (One roof stage 2, spec §2.2, §4.3 FXB, S2-D4, S2-D8, S2-D22): a port of
// fitness/activities.js onto x.js (the names it took from app.js), lazy, loaded on Activities' first show or a ride's
// first opening. Every ride, run and swim, by week; each opened as a sheet with its route, figures, charts, zones,
// efforts and best efforts; its figures filled in, in the background, only while Fitness is shown.
//
// Exports (the ctx.open table, §4.7; each opener takes ctx first, as the entry binds them):
//   view(el, ctx) → { draw(), hide(), destroy() }       the Activities section (section.fx-sec[data-sec=activities])
//   openAct(ctx, id)        dialog.ifl-sheet[data-sheet=act]: one activity (its file read first where it isn't here);
//                           an id not here yet, with older rides still to come in (core.older), looked for again once
//                           they're in (the openTo rule of fitness/app.js:2727-2732), else "That activity isn’t here."
//   openActMap(ctx, id)     [data-sheet=act-map]: its route on a real map, to explore (destroyed when the sheet closes)
//   openActShare(ctx, id)   [data-sheet=act-share]: the ride as a picture to share
//   openRename(ctx, id)     the act sheet with Rename pushed on it ([data-page=rename])
//   openForm(ctx)           [data-sheet=form]: fitness and form, over longer
//   openUpload(ctx, got)    [data-sheet=upload]: the files read (the entry's reader: { acts, workouts, skipped, dupes }),
//                           each activity's sport to check, then Upload
// Also here, for progview.js and planview.js (lazy, as these are): actRow, zoneBars, shareView, uploadFilesView,
// figuresOf, withFigures, staying, routes, paceOfSpeed.
// Hooks (roofhooks.mjs): rows .m-fitness [data-k=act][data-id=<id>]; in the act sheet [data-k=map] (the map, or Show on
// Map) and [data-k=share].
// Not carried (S2-D8): the two-pane Activities and its right-click menu (fitness/activities.js actsWide, actMenu): at
// any width a ride opens as a sheet, which the framework centres on a wide screen.
import { A, C, F, HR_ZONES, M, P, S, SPORTS, Sheet, TODAY, U, XV, ZONES, addDays, card, chooseFiles, clock, closeSheet, dateShort, dayLong, dayShort, dist, distNum, drawSheet, dropFile, dur, effortFigs, effortsOf, fileKey, fitnessSeries, formSaid, full, h, height, held, hm, icon, lightNow, load, mapCredit, mapsAlways, measure, mondayOf, needF, openSheet, pace, paceFor, pct, perSecond, plannedOn, plural, pushSheet, redraw, rollAvg, routeOf, row, saveFile, section, setActs, sheetBack, sheetEl, sheetW, signed, speed, sportIcon, sportTile, startOfDay, stat, staying, stopped, store, sumOf, summarise, svgOf, timeOf, toast, upload as keepUploads, wait, wkById, zoneBars, zoneOf } from "./x.js";
import { effortsCard, effortsSeen } from "./todayview.js";

// ---- the module's handle: the ctx the entry gave the last view or opener (its fw, core and open) ----
let X = null;
const use = (ctx) => { if (ctx) X = ctx; return X; };
// (a 401: the framework asks whether the session's really gone; core stops if it is)
const lost = () => { try { X?.fw?.session?.lost?.(); } catch (_) {} };
// (NET files, never kept: the file formats (core's needF, filling F), the map (core's M), the share pictures; each
// loaded once, on first need)
let shareP = null;
const shares = () => (shareP ??= X.fw.lazy((q) => import("../share.js" + (q || ""))).catch((e) => { shareP = null; throw e; }));
// (a pushed page of the sheet: its name on its container, [data-page=<page>])
const push = (view, page) => pushSheet(() => ({ ...view(), page }));
// (whether Activities is on the screen now, and Fitness with it: background work starts nothing new otherwise, S2-D4)
let shownHere = false;
const working = () => shownHere && (X?.fw?.visible?.() ?? true);

// ---- Activities ----
const PAGE = 60;
// (the next weeks drawn as the list's end comes into view, as if it were all there)
let moreSeen = null;
function whenSeen(btn) {
  if (!("IntersectionObserver" in globalThis)) return;
  moreSeen?.disconnect();
  moreSeen = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { moreSeen.disconnect(); btn.click(); } }, { rootMargin: "600px 0px" });
  setTimeout(() => btn.isConnected && moreSeen?.observe(btn), 0);
}
function activitiesView() {
  const sports = [["all", "All"], ["ride", "Rides"], ["run", "Runs"], ["other", "Other"]], at = Math.max(0, sports.findIndex(([k]) => k === S.actSport));
  const sport = sports[at][0];
  const list = S.acts.filter((a) => sport === "all" || a.sport === sport || (sport === "other" && a.sport !== "ride" && a.sport !== "run"));
  const out = [];
  // Garmin's six months coming in
  if (S.bringing) out.push(bringingCard());
  // none yet: Garmin, or files
  if (!S.acts.length) return S.bringing ? out : [...out, ...firstUpload()];
  // (Garmin or Strava stopped: new rides aren't coming in, said where they'd show, a tap from putting it right)
  if (stopped()) out.push(stoppedRow());
  // the last four weeks, at a glance
  const since = addDays(TODAY, -27), recent = S.acts.filter((a) => a.start >= since);
  const tot = recent.reduce((t, a) => { const s = sumOf(a); if (s) { t.secs += s.moving || 0; t.dist += s.dist || 0; t.tss += s.tss || 0; t.asc += s.ascent || 0; } return t; }, { secs: 0, dist: 0, tss: 0, asc: 0 });
  out.push(card(null, "The last four weeks", S.summed ? h("div.stats", {}, stat("Time", hm(tot.secs), tot.secs >= 3600 ? "h" : null), stat("Distance", ...distNum(tot.dist)), stat("Climbing", ...height(tot.asc))) : wait(48)));
  out.push(h("div.seg.wide", { vars: { "--n": 4, "--at": at }, role: "group", "aria-label": "Sport" }, sports.map(([k, label]) => h("button", { type: "button", "data-sport": k, "aria-pressed": String(sport === k), onclick: () => { S.actSport = k; S.actShow = 0; redraw("acts"); } }, label))));
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
  if (list.length > show) { const more = h("button.more-acts.pill", { type: "button", onclick: () => { S.actShow = show + PAGE * 2; redraw("acts"); } }, `Show more · ${(list.length - show).toLocaleString("en-GB")} older`); out.push(h("div.more-wrap", {}, more)); whenSeen(more); }
  if (list.length) out.push(h("p.foot.more-up", {}, h("button.link", { type: "button", onclick: () => chooseFiles() }, "Upload more activities")));
  return out;
}
async function removeAct(a) {
  try { await A.remove(a.id); } catch (err) { if (err.status === 401) return lost(); return toast(err.message, true); }
  S.own = S.own.filter((y) => y.id !== a.id); setActs(); S.sums.delete(a.id); held.delete(a.id); dropFile(fileKey(a));
  closeSheet(); toast("Deleted"); redraw("acts");
}
// Your first activities: Garmin connected (six months in at once, then each new one by itself), or files uploaded,
// and what they're for
function firstUpload() {
  const choice = (tile, title, sub, onclick, best = false) => h("button.choice" + (best ? ".best" : ""), { type: "button", onclick }, tile,
    h("span.tx", {}, h("b", {}, title, best && h("small.badge", { text: "Best" })), h("small", { text: sub })), h("span.chev", {}, icon("chev", 17, 2)));
  const gets = (ic, cls, title, sub) => h("div.row.plain", {}, h("span.ic.soft." + cls, {}, icon(ic, 17, 2.2)), h("span.tx", {}, h("b", { text: title }), h("small", { text: sub })));
  const g = S.garmin?.on;
  return [
    h("div.card.glass.first", {},
      h("div.first-top", {}, h("h2", { text: "Bring your rides in" }), h("p", { text: "Rhythm plans from what you’ve done, so the more it sees, the better it gets." })),
      choice(h("span.big.ic.brand.garmin", {}, icon("device", 22, 2)), g ? "Garmin connected" : "Connect Garmin", g ? (S.garmin.ok ? "New activities come in by themselves" : "Your key has stopped working: add a new one") : "Six months in at once, then every ride by itself",
        () => X.open.settings("devices"), !g),
      choice(h("span.big.ic.coral", {}, icon("upload", 22, 2.2)), "Upload files", "From Wahoo, Strava, Zwift or anything else", () => openSheet(uploadFilesView, { sheet: "upload" }))),
    section("What you’ll get", h("div.group.glass", {},
      gets("gauge", "red", "Fitness, fatigue and form", "From every ride’s training stress"),
      gets("calendar", "blue", "A plan that follows you", "Rhythm starts from your real history"),
      gets("bolt", "green", "Your best power", "5 seconds to an hour, and an FTP to try"))),
  ];
}
// Garmin or Strava stopped (its key expired or deleted, or Strava's let Fitness go): a row to put it right
function stoppedRow() {
  const g = stopped() === "Garmin";
  return section(null, h("div.group.glass", {}, row({ tile: g ? h("span.ic.brand.garmin", {}, icon("device", 18, 2)) : h("span.ic.brand.strava", {}, icon("wave", 18, 2.2)),
    title: `${g ? "Garmin" : "Strava"} has stopped sending your rides`, sub: g ? "Your key has stopped working: add a new one" : "Strava’s stopped letting Fitness in: connect again",
    onclick: () => X.open.settings("devices") })));
}
// Garmin's six months, coming in: how many so far, and how far back it goes
function bringingCard() {
  const all = S.bringing.all, at = S.bringing.at > Date.UTC(2000, 0, 2) ? S.bringing.at : null;
  const back = all ? (at ? `up to ${new Date(at).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}` : "looking for your first") : new Date(addDays(TODAY, -183)).toLocaleDateString("en-GB", { month: "long" });
  return h("div.card.glass.bringing", { role: "status" },
    h("div.bringing-top", {}, S.bringing.src === "strava" ? h("span.ic.brand.strava", {}, icon("wave", 20, 2.2)) : h("span.ic.brand.garmin", {}, icon("device", 20, 2)),
      h("span.tx", {}, h("b", { text: `${all ? "Bringing in all your rides" : "Bringing in six months"} from ${S.bringing.src === "strava" ? "Strava" : "Garmin"}` }), h("small", { text: `${S.bringing.n ? `${plural(S.bringing.n, "activity", "activities")} so far${all && at ? `, ${back}` : ""}` : all ? `Starting from the oldest: ${back}` : `Back to ${back}`} · you can carry on meanwhile` }))),
    h("div.bar", {}, h("i")));
}
// Uploading files: choose them, and where each app keeps them (Garmin's connected instead)
function uploadFilesView() {
  const where = (letter, cls, title, sub) => h("div.row.plain", {}, h("span.ic." + cls, {}, h("b", { text: letter })), h("span.tx", {}, h("b", { text: title }), h("small", { text: sub })));
  return { title: "Upload Files", body: [
    h("div.drop-zone", {}, h("span.big.ic.coral", {}, icon("upload", 24, 2.2)),
      h("p", { text: "FIT, GPX or TCX, or a zip of them. Fitness works out what each one was, and you check before it’s saved. Or drop them onto Fitness." }),
      // (the picker opened in this tap, before the sheet closes: a phone gives a file picker only to a tap)
      h("button.btn", { type: "button", onclick: () => { chooseFiles(); closeSheet(); } }, "Choose Files")),
    section("Where to find them", h("div.group", {},
      where("W", "blue", "Wahoo", "In the Wahoo app: an activity, then Share › Download .fit"),
      where("S", "amber", "Strava", S.strava?.ready === false ? "On strava.com: an activity, then ⋯ › Export Original" : "Connect it in Fitness Settings, Devices, and they come in by themselves"),
      where("Z", "indigo", "Zwift", "Documents › Zwift › Activities, on the computer you ride on"))),
    !S.garmin?.on && h("div.note-garmin", {}, h("span.ic.brand.garmin", {}, icon("device", 15, 2.2)),
      h("span", {}, "On Garmin? ", h("button.link", { type: "button", onclick: () => { closeSheet(); X.open.settings("devices"); } }, "Connect it instead"), ", and skip the files.")),
  ] };
}
// An activity's row: its route's shape (or, indoors, its sport), its name with its distance, its day and the session
// it was from your plan (else the device it came from), and how long and how hard
function routeTile(r, sport) {
  const p = []; for (let i = 0; i + 1 < r.length; i += 2) p.push(`${i ? "L" : "M"}${Number(r[i]) || 0} ${Number(r[i + 1]) || 0}`);
  return h("span.tile.route.s-" + sport, {}, svgOf(`<svg viewBox="0 0 100 100" aria-hidden="true"><path d="${p.join("")}"/></svg>`));
}
function actRow(a) {
  const s = sumOf(a), r = s?.route, pid = a.sample ? null : plannedOn(startOfDay(a.start)), pw = pid && pid !== "event" ? wkById(pid) : null;
  const named = s?.dist > 100 && !/\d\s?(km|mi)\b/i.test(a.name) ? `${a.name} · ${dist(s.dist)}` : a.name;
  return h("button.row", { type: "button", "data-k": "act", "data-id": a.id, onclick: () => openAct(X, a.id) }, r ? routeTile(r, a.sport) : sportTile(a.sport),
    h("span.tx", {}, h("b", { text: named }), h("small.one-line", { text: `${dayShort(a.start)} · ${pw && pw.sport === a.sport ? pw.name : a.device || (a.sample ? "Example" : "Uploaded")}` })),
    h("span.val", {}, s ? hm(s.moving) : "", h("small", { text: s?.tss != null ? `TSS ${s.tss}` : "" })));
}
// (a ride's staying power, and its figures as the reader or this phone worked them out: core's staying, figuresOf and
// withFigures, marked with the version XV; its route's shape from formats.js, so needF() first)
// The ones kept before rows had these: each read from its file, a few at a time, and its route's shape and staying power
// added (one with no route, an indoor ride, remembered here so it isn't looked for again). Only while Activities (or
// Progress) is shown and the page is in sight: the one in hand is finished, and no other started, once it isn't (S2-D4).
async function routes() {
  if (routes.busy || !S.me || !X) return;
  routes.busy = true;
  const none = new Set(store.get("noroute", [])), me = S.me.id;
  try {
    await needF();
    for (const a of S.own.filter((x) => (!sumOf(x)?.route && !none.has(x.id)) || !(sumOf(x)?.xv >= XV)).slice(0, 40)) {
      if (S.me?.id !== me || !working() || X.core?.busy?.()) break;
      try {
        const x = await load(a, false), r = sumOf(a)?.route ? null : F.routeShape(x.s), figs = { ...staying(x), ...effortFigs(a, x), ...(r ? { route: r } : {}) };
        if (!r && !sumOf(a)?.route) none.add(a.id);
        await A.addFigures(a.id, figs);
        a.sum = { ...(a.sum || {}), ...figs }; const s = sumOf(a); if (s) S.sums.set(a.id, { ...s, ...figs });
        if (working()) redraw("acts");
      } catch (e) { if (e.status === 401) { lost(); break; } if (e.offline) break; none.add(a.id); }
    }
  } catch (_) {
  } finally {
    routes.busy = false;
    // (kept only for the account it was read for: after a sign-out, fitness:* is cleared and stays so, S2-D10)
    if (S.me?.id === me) store.set("noroute", [...none].slice(-2000));
  }
}
// ---- an activity, opened ----
// (the route maps drawn in a sheet: let go when it closes, S2-D22)
let openMaps = [];
const dropMaps = () => { for (const g of openMaps.splice(0)) { try { g.remove(); } catch (_) {} } try { M.sweep(); } catch (_) {} };
function sheetOf(view, sheet) {
  const hd = openSheet(view, { sheet, tall: true });
  if (hd?.el && !hd.el.dataset.fxMaps) { hd.el.dataset.fxMaps = "1"; hd.el.addEventListener("close", dropMaps); }
  return hd;
}
function findAct(id) { return S.acts.find((x) => x.id === id) || null; }
// its file read first, where it isn't here yet (from this device's copy, or the account's)
async function openActNow(a) {
  if (full(a)) return sheetOf(() => actView(a), "act");
  sheetOf(() => ({ title: a.name, body: [h("div.sheet-top", {}, h("div.sub", {}, sportTile(a.sport, true), `${dayLong(a.start)}, ${timeOf(a.start)}`), h("h1", { text: a.name }),
    h("div.sub", { text: "Opening its file…" })), wait(220), wait(160)] }), "act");
  try {
    await load(a);
    if (sheetEl.open && Sheet.stack.length) { Sheet.stack = [() => actView(a)]; drawSheet(); }
  } catch (e) { if (e.status === 401) return lost(); closeSheet(); toast(e.message, true); }
}
// (by its id, as the address and the other screens have it: one not among those here yet, with older ones still to come
// in, looked for again once they're in; only then said not to be here)
export async function openAct(ctx, id) {
  use(ctx);
  const a = typeof id === "object" && id ? id : findAct(id);
  if (a) return openActNow(a);
  if (S.me?.more || X.core?.older?.p) {
    try { await X.core.older(); } catch (_) {}
    const b = findAct(id);
    if (b) return openActNow(b);
  }
  toast("That activity isn’t here.", true);
}
// A ride as a picture to share (share.js): its route, its figures, and its efforts where it was a session
function rideCard(a, x, s) {
  const sum = sumOf(a) || s, e = effortsSeen.get(a.id), hd = e ? e.held : sum.held, n = e ? e.n : sum.efforts;
  const stats = [s.dist > 100 && ["Distance", dist(s.dist)], ["Time", dur(s.moving || s.secs)], s.ascent > 20 && ["Climbing", height(s.ascent).join(" ")],
    s.avgPwr && ["Power", `${s.np || s.avgPwr} W`], s.tss != null && ["Stress", String(s.tss)], s.avgHr && ["Heart rate", `${s.avgHr} bpm`], s.avgSpd && !s.avgPwr && ["Speed", speed(s.avgSpd).join(" ")]].filter(Boolean);
  return { name: a.name, when: `${dayLong(a.start)} · ${timeOf(a.start)}`, sport: a.sport, route: sum.route || F?.routeShape(x.s), zones: s.zones || null, stats,
    chip: n > 0 ? (hd >= n ? `Every effort held · ${n} of ${n}` : `${hd} of ${n} efforts held`) : null, chipOk: n > 0 && hd >= n };
}
const shareName = (a) => `${new Date(a.start).toISOString().slice(0, 10)} ${a.name}.png`.replace(/[\\/:*?"<>|]/g, "");
const rideShare = (a, x, s) => shareView(() => shares().then((SH) => SH.rideImage(rideCard(a, x, s))), { name: shareName(a), title: a.name });
// the route, coloured by the power there (30 seconds' average), on a real map: in its box, or the whole sheet
function realMap(holder, route, explore = false) {
  return M.routeMap(holder, { ...route, light: lightNow(), explore }).then((g) => { openMaps.push(g); return g; });
}
function actView(a) {
  // (one of yours worked out afresh from its file, its zones and all, for your numbers now)
  const x = full(a), s = a.sample ? sumOf(a) || summarise(x, P()) : summarise(x, P()), ps = perSecond(x), plannedId = plannedOn(startOfDay(a.start));
  const planned = plannedId && plannedId !== "event" ? wkById(plannedId) : null;
  const SW = sheetW(), body = [];
  body.push(h("div.sheet-top", {}, h("div.sub", {}, sportTile(a.sport, true), `${dayLong(a.start)}, ${timeOf(a.start)}`), h("h1", { text: a.name }),
    h("div.sub.act-links", {}, !a.sample && h("button.link.small", { type: "button", "data-k": "rename", onclick: () => push(() => renameView(a), "rename") }, "Rename"),
      h("button.link.small", { type: "button", "data-k": "share", onclick: () => push(rideShare(a, x, s), "share") }, icon("upload", 14, 2.4), "Share"),
      /^s\d{1,20}$/.test(a.id) && h("a.link.small.strava", { href: `https://www.strava.com/activities/${a.id.slice(1)}`, target: "_blank", rel: "noopener noreferrer" }, "View on Strava")),
    planned && planned.sport === a.sport && h("div.sub", {}, h("span.tick-badge", {}, icon("check", 14, 3)), `From your plan: ${planned.name}`)));
  // the route, coloured by the power there (30 seconds' average) or plain
  let mapAt = null;
  if (x.s.lat) {
    const roll = ps.pwr ? rollAvg(ps.pwr, 30) : null;
    const zoneAt = roll ? (i) => zoneOf((roll[Math.min(roll.length - 1, Math.round(x.s.t[i]))] || 0) / P().ftp).c : null;
    const r = C.route(x.s, zoneAt, SW + 36, U.metric), box = h("div.map", { "data-k": "map" }, r.el);
    let gl = null;
    const sampleAt = (sec) => { let lo = 0, hi = x.s.t.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (x.s.t[m] < sec) lo = m + 1; else hi = m; } return lo; };
    mapAt = (sec) => { if (sec == null) { r.at(null); gl?.at(null); return; } const i = sampleAt(sec); r.at(i); if (gl && x.s.lat[i] != null) gl.at([x.s.lon[i], x.s.lat[i]]); };
    // (on a real map, where the phone can draw one: the route as ridden, over it; a tap opens it to explore)
    const real = () => {
      const route = routeOf(x.s, zoneAt), holder = h("div.map-gl", { role: "button", tabindex: "0", "aria-label": "The route on a map: open it to explore",
        onkeydown: (e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.currentTarget.click(); } },
        onclick: () => push(() => bigMapView(a.name, route), "map") }, mapCredit(), h("span.map-open", { "aria-hidden": "true" }, icon("open", 15, 2.4)));
      box.replaceChildren(holder);
      // (and where it can't after all, its own drawing of the route back)
      realMap(holder, route).then((g) => { gl = g; }).catch(() => box.replaceChildren(r.el));
    };
    // (the map file only once it's wanted: always, as You chose, or on a tap)
    if (M.able()) {
      if (mapsAlways()) real();
      else box.append(h("button.pill.small.map-show", { type: "button", onclick: real }, icon("open", 14, 2.4), "Show on Map"));
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
    const cw = SW, pic = C.streams(ps, s.secs, cw), cur = pic.querySelector(".cursor"), read = h("p.readout", { text: "Touch the chart to see each moment." });
    const show = (e) => {
      const r = pic.getBoundingClientRect(), f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), sec = Math.round(f * (ps.moving.length - 1));
      cur.setAttribute("x1", f * cw); cur.setAttribute("x2", f * cw); cur.setAttribute("visibility", "visible");
      const v = (arr) => (arr && Number.isFinite(arr[sec]) ? arr[sec] : null), pw = ps.pwr ? rollAvg(ps.pwr, 3, sec) : null;
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
    body.push(card(null, "Best efforts", C.curve(s.curve, ftp, SW), best20 > 0 && h("p.line-said", { text: `Your best 20 minutes: ${best20} W, ${pct(best20 / ftp)} of your FTP.${est > ftp + 4 ? ` That’s an FTP of about ${est} W, above your ${ftp} W: worth a test.` : ""}` })));
  }
  if (x.laps.length > 1 && x.laps.length <= 30) {
    body.push(section(`Laps (${x.laps.length})`, h("div.group", {}, x.laps.map((l, i) => {
      const p = ps.pwr ? avgOver(ps.pwr, l.start, l.secs) : null, hr = ps.hr ? avgOver(ps.hr, l.start, l.secs) : null;
      return h("div.row.plain", {}, h("span.tx", {}, h("b", { text: `Lap ${i + 1}` }), h("small", { text: clock(l.secs) })), h("span.val", { text: [p != null && `${Math.round(p)} W`, hr != null && `${Math.round(hr)} bpm`].filter(Boolean).join(" · ") }));
    }))));
  }
  // and out again (the example rides only: your own are kept as you uploaded them)
  const stem = `${new Date(a.start).toISOString().slice(0, 10)} ${a.name}`;
  const out = (kind, make) => needF().then((f) => saveFile(f.fileName(stem, kind), make(f))).catch(() => toast("That file couldn’t be made just now.", true));
  if (a.sample) body.push(section("Export", h("div.group", {},
    row({ tile: h("span.ic.coral", {}, icon("file", 18, 2)), title: "FIT", sub: "For Garmin Connect, Strava, TrainingPeaks, intervals.icu, and the Wahoo app", chev: false, extra: h("span.get", {}, icon("download", 18, 2.2)), onclick: () => out("fit", (f) => f.fitFromActivity(x, s)) }),
    x.s.lat && row({ tile: h("span.ic.blue", {}, icon("file", 18, 2)), title: "GPX", sub: "For maps and route apps (Komoot, RideWithGPS), with heart rate, cadence and power", chev: false, extra: h("span.get", {}, icon("download", 18, 2.2)), onclick: () => out("gpx", (f) => f.gpxFromActivity(x)) }),
    row({ tile: h("span.ic.grey", {}, icon("file", 18, 2)), title: "TCX", sub: "Garmin’s older format, for tools that want it", chev: false, extra: h("span.get", {}, icon("download", 18, 2.2)), onclick: () => out("tcx", (f) => f.tcxFromActivity(x, s)) })),
    h("p.foot", { text: "Garmin Connect: Import Data takes any of these. The Wahoo app: History, then + and Upload, takes the FIT file." })));
  if (!a.sample) body.push(h("div.group", {}, h("button.row.action.danger", { type: "button", "data-k": "delete", onclick: async (e) => {
    const b = e.currentTarget;
    if (!b.dataset.sure) { b.dataset.sure = "1"; b.textContent = "Delete It, and Its File, for Good"; return; }
    removeAct(a);
  } }, "Delete This Activity")));
  return { title: a.name, body };
}
// a new name for one of yours
function renameView(a) {
  const field = h("input.field", { type: "text", value: a.name, maxlength: 80, "aria-label": "Name", "data-k": "name" });
  const save = async () => {
    const name = field.value.trim() || a.name;
    try { await A.rename(a.id, name); } catch (e) { if (e.status === 401) return lost(); return toast(e.message, true); }
    a.name = name; const x = held.get(a.id); if (x) x.name = name;
    for (const y of S.own) if (y.id === a.id) y.name = name;
    setActs(); redraw("acts"); sheetBack(); toast("Renamed");
  };
  setTimeout(() => field.isConnected && field.focus(), 350);
  field.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
  return { title: "Rename", body: [field, h("button.btn", { type: "button", "data-k": "save", onclick: save }, "Save")] };
}
const avgOver = (arr, from, secs) => { let t = 0, c = 0; for (let i = Math.round(from); i < Math.min(arr.length, from + secs); i++) if (Number.isFinite(arr[i])) { t += arr[i]; c++; } return c ? t / c : null; };
const paceOfSpeed = (ms) => (U.metric ? 1000 / ms : 1609.344 / ms);

// the route's map, the whole sheet, to move and zoom (let go when the sheet closes)
function bigMapView(name, route) {
  const holder = h("div.map-gl.big", {}, mapCredit());
  setTimeout(() => { if (holder.isConnected) realMap(holder, route, true).catch(() => {}); }, 350);
  return { title: name, body: [holder] };
}
// A picture to share (share.js): drawn, shown, then handed to the phone's share sheet (Messages, Instagram, Photos), or
// saved where there's none; shared on its own tap, as a phone shares only on a tap. → a sheet's view
function shareView(make, { name, title }) {
  const can = (() => { try { return !!navigator.canShare?.({ files: [new File([""], "x.png", { type: "image/png" })] }); } catch (_) { return false; } })();
  let blob = null, url = null;
  const img = h("img.share-img", { alt: title }), said = h("p.foot.share-said", { text: "Drawing it…" });
  const go = h("button.btn", { type: "button", "data-k": "share-go", disabled: true, onclick: async () => {
    if (!blob) return;
    const file = new File([blob], name, { type: "image/png" });
    if (can) { try { await navigator.share({ files: [file], title }); } catch (e) { if (e?.name !== "AbortError") toast("That couldn’t be shared", true); } }
    else saveFile(name, new Uint8Array(await blob.arrayBuffer()));
  } }, icon("upload", 18, 2.2), can ? "Share" : "Save the Picture");
  let made = null;
  return () => {
    // (drawn once, however often the page is drawn again)
    made ??= Promise.resolve().then(make).then((b) => { blob = b; if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(b); img.src = url; img.classList.add("in"); go.disabled = false; said.textContent = can ? "To Messages, Instagram, Photos or anywhere else." : "Saved as a picture, to share from there."; })
      .catch((e) => { said.textContent = e?.message || "The picture couldn’t be made."; });
    return { title: "Share", body: [h("div.share-frame", {}, img), go, said] };
  };
}

// ---- fitness and form, over longer ----
function formView() {
  const f = fitnessSeries(), last = f.at(-1), said = formSaid(last.tsb), days = [42, 90, 180].includes(S.formDays) ? S.formDays : 42;
  const seg = h("div.seg", { vars: { "--n": 3, "--at": [42, 90, 180].indexOf(days) }, role: "group", "aria-label": "How far back" },
    [[42, "6 weeks"], [90, "3 months"], [180, "6 months"]].map(([d, l]) => h("button", { type: "button", "aria-pressed": String(days === d), onclick: () => { S.formDays = d; Sheet.redraw?.(); } }, l)));
  const was = f.at(-8) || last;
  return {
    title: "Fitness and Form",
    body: [
      h("div.sheet-top", {}, h("h1", { text: `${said.word}, at ${signed(last.tsb)}` }), h("div.sub", { text: said.line })),
      // (form on its band: strain, building, neutral, fresh, rested, −40 to +30; and fitness and fatigue now)
      card("form-now", null,
        h("div.fband", { "aria-hidden": "true" }, h("span.track"), h("span.knob", { vars: { left: Math.max(2, Math.min(98, ((last.tsb + 40) / 70) * 100)) + "%" } }), h("span.lab", {}, ["Strain", "Building", "Neutral", "Fresh", "Rested"].map((t) => h("span", { text: t })))),
        h("div.fit-tiles", {},
          h("div", {}, h("small", {}, h("i.dot-fit"), "Fitness"), h("b", { text: Math.round(last.ctl) }), h("small.sub", { text: `${last.ctl >= was.ctl ? "+" : "−"}${Math.abs(Math.round(last.ctl - was.ctl))} this week` })),
          h("div", {}, h("small", {}, h("i.dot-fat"), "Fatigue"), h("b", { text: Math.round(last.atl) }), h("small.sub", { text: last.atl < 5 ? "All but gone" : last.atl > last.ctl ? "Above your fitness" : "Below your fitness" })))),
      seg,
      card(null, null, C.fitnessChart(f, { days: Math.min(days, f.length), W: sheetW() }), h("div.legend", {}, h("span", {}, h("i.lg-fit"), `Fitness ${Math.round(last.ctl)}`), h("span", {}, h("i.lg-fat"), `Fatigue ${Math.round(last.atl)}`), h("span", {}, h("i.lg-form"), "Form"))),
      h("p", { text: "Fitness is your training stress averaged over the last six weeks; fatigue, over the last one. Form is the gap between them: below zero you’re carrying fatigue, which is where training does its work; above it, you’re fresh." }),
      h("p", { text: "Each ride’s stress comes from its power against your FTP (an hour flat out is 100), or from heart rate where there’s no power. Keep fitness rising by about 3 to 6 a week, and take an easier week every fourth." }),
    ],
  };
}

// ---- uploading: what's in the files, before it's saved ----
const SPORT_NAMES = [["ride", "Ride"], ["run", "Run"], ["swim", "Swim"], ["walk", "Walk"], ["row", "Row"], ["strength", "Strength"], ["other", "Other"]];
// What's in the files: each activity with what it was (as its file says, or worked out from how it went, and a tap to
// change), then Upload
function uploadView(got) {
  const n = got.acts.length, nw = got.workouts.length;
  if (!n && !nw) return { title: "Upload", body: [h("div.sheet-top", {}, h("h1", { text: "Nothing to upload" }), h("div.sub", { text: got.dupes ? `${plural(got.dupes, "activity is", "activities are")} here already` : "" })),
    got.skipped.length > 0 && section("Not read", h("div.group", {}, got.skipped.map((t) => h("div.row.plain", {}, h("span.tx", {}, h("small", { text: t })))))),
    h("button.btn.quiet", { type: "button", onclick: () => { chooseFiles(); closeSheet(); } }, "Choose Other Files")] };
  const rows = got.acts.map((a) => {
    const sum = a.pre || summarise(a, P()), tile = h("span.tile.s-" + a.sport, {}, sportIcon(a.sport, 20)), name = h("b", { text: a.name });
    // (said only where it matters: a sport worked out, to check; or one you chose)
    const said = h("small.said", { text: "Fitness worked this out: check it" }); said.hidden = !a.guessed;
    const pick = h("select.sport-pick", { "aria-label": `What ${a.name} was`, onchange: () => {
      const was = defaultFor(a), old = a.sport, now = pick.value; a.sport = now; a.guessed = false; delete a.pre;   // (its figures, worked out again for its sport)
      // (named for its sport and time of day, as Fitness names one: its sport's word changed, whatever clock named it)
      const word = (sp) => F.defaultName(sp, a.start, false).replace(/^\S+ /, ""), named = new RegExp(`^(Morning|Afternoon|Evening|Night) ${word(old)}$`).exec(a.name);
      if (a.name === was || named) { a.name = named ? `${named[1]} ${word(now)}` : defaultFor(a); name.textContent = a.name; }
      tile.className = "tile s-" + now; tile.replaceChildren(sportIcon(now, 20)); said.textContent = "Chosen by you"; said.hidden = false;
    } }, SPORT_NAMES.map(([v, l]) => h("option", { value: v, selected: a.sport === v, text: l })));
    // (a file that jumps on more than a day partway (a device's clock gone wrong): what came after, left out, and said)
    const cut = a.cut ? h("small.said", { text: "Its file jumps on more than a day partway: what came after was left out" }) : null;
    return h("div.row.up" + (a.guessed ? ".guess" : ""), {}, tile,
      h("span.tx", {}, name, h("small", { text: [`${dayShort(a.start)}, ${timeOf(a.start)}`, sum.dist > 100 ? dist(sum.dist) : null, hm(sum.moving)].filter(Boolean).join(" · ") }), said, cut),
      h("label.pick", {}, pick, icon("chev", 14, 2.6)));
  });
  const go = h("button.btn", { type: "button", "data-k": "upload", onclick: () => upload(got, go) }, icon("upload", 19, 2.2), h("span", { text: n ? `Upload ${plural(n, "activity", "activities")}` : `Save ${plural(nw, "workout")}` }));
  return { title: "Upload", body: [
    h("div.sheet-top", {}, h("h1", { text: n ? (n === 1 ? "One activity" : `${n} activities`) : plural(nw, "workout") }),
      h("div.sub", { text: n ? "Check what each one was, then upload." : "To your workouts." })),
    n > 0 && h("div.group", {}, rows),
    nw > 0 && section("Workouts", h("div.group", {}, got.workouts.map((w) => h("div.row.plain", {}, h("span.mini", {}, C.profile(w, { mini: true, pace: paceFor(w.sport) })),
      h("span.tx", {}, h("b", { text: w.name }), h("small", { text: `${dur(measure(w, paceFor(w.sport)).secs)} · ${SPORTS[w.sport]?.name || w.sport}` })))))),
    (got.dupes || got.skipped.length) > 0 && section("Left out", h("div.group", {},
      got.dupes > 0 && h("div.row.plain", {}, h("span.tx", {}, h("small", { text: `${plural(got.dupes, "activity is", "activities are")} here already` }))),
      got.skipped.map((t) => h("div.row.plain", {}, h("span.tx", {}, h("small", { text: t })))))),
    go,
  ] };
}
const defaultFor = (a) => F.defaultName(a.sport, a.start, a.indoor);
// Each activity kept with your account, one at a time, the button saying how far it's got (core.upload); then the sheet
// closed, Activities shown and, for one ride, that ride opened (fitness/app.js upload's end)
function upload(got, btn) {
  return keepUploads(got, btn, ({ done, failed }) => {
    if (failed.length) return;
    closeSheet();
    if (done.length) { S.actSport = "all"; X.fw.nav?.section?.("activities"); }
    try { X.fw.changed?.(); } catch (_) {}
    if (done.length === 1 && !got.workouts?.length) setTimeout(() => openActNow(done[0]), 400);
  });
}

// ---- the openers the entry binds (ctx.open.*) ----
export function openActMap(ctx, id) {
  use(ctx);
  const a = findAct(id);
  if (!a) return toast("That activity isn’t here.", true);
  const go = (x) => { if (!x.s?.lat) return toast("That one has no route to show.", true); const roll = perSecond(x).pwr ? rollAvg(perSecond(x).pwr, 30) : null;
    sheetOf(() => bigMapView(a.name, routeOf(x.s, roll ? (i) => zoneOf((roll[Math.min(roll.length - 1, Math.round(x.s.t[i]))] || 0) / P().ftp).c : null)), "act-map"); };
  if (full(a)) return go(full(a));
  load(a).then(go, (e) => { if (e.status === 401) return lost(); toast(e.message, true); });
}
export function openActShare(ctx, id) {
  use(ctx);
  const a = findAct(id);
  if (!a) return toast("That activity isn’t here.", true);
  const go = (x) => needF().then(() => { const s = a.sample ? sumOf(a) || summarise(x, P()) : summarise(x, P()); openSheet(rideShare(a, x, s), { sheet: "act-share", tall: true }); });
  (full(a) ? Promise.resolve(full(a)) : load(a)).then(go).catch((e) => { if (e?.status === 401) return lost(); toast(e?.message || "That couldn’t be opened just now.", true); });
}
export async function openRename(ctx, id) {
  use(ctx);
  const a = findAct(id);
  if (!a || a.sample) return toast("That activity isn’t here.", true);
  await openActNow(a);
  if (sheetEl.open) push(() => renameView(a), "rename");
}
export function openForm(ctx) { use(ctx); openSheet(formView, { sheet: "form" }); }
export async function openUpload(ctx, got) {
  use(ctx);
  try { await needF(); } catch (_) { return toast("Fitness couldn’t read those files just now.", true); }
  const g = { acts: [], workouts: [], skipped: [], dupes: 0, ...(got || {}) };
  g.acts.sort((a, b) => b.start - a.start);
  openSheet(() => uploadView(g), { sheet: "upload", tall: g.acts.length > 2 });
}
// the Activities section: drawn on show and on core's events while it shows (the entry calls draw); the list's DOM let
// go after it's been out of sight a while (S2-D22) is the entry's; here, the observer and the background work stop
export function view(el, ctx) {
  use(ctx);
  el.classList.add("fx-acts");
  let first = true;
  return {
    draw() {
      shownHere = true;
      const y = el.scrollTop;
      el.replaceChildren(...activitiesView().filter(Boolean));
      el.scrollTop = y;
      // (the figures of the ones kept before rows had them: a few at a time, a little after Activities first shows)
      if (first) { first = false; setTimeout(() => { if (working()) routes(); }, 1500); } else if (working()) routes();
    },
    hide() { shownHere = false; moreSeen?.disconnect(); moreSeen = null; },
    destroy() { shownHere = false; moreSeen?.disconnect(); moreSeen = null; dropMaps(); el.replaceChildren(); },
  };
}

export { actRow, formView, paceOfSpeed, routes, shareView, uploadFilesView };
