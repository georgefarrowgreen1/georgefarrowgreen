// Fitness's Today: the day's card (the session, or rest, or the ride done: how ready you are, its shape, the best
// time for it, the efforts held), the morning's check-in, the week and your fitness and form. Drawn by app.js render.

import * as TC from "./todaycalc.js";
import { A, BT, C, DAY, E, G, M, P, R, S, SPORTS, Sheet, TODAY, U, actsOn, addDays, calendar, canMorph, card, cardW, chooseFiles, closeSheet, dayLetter, dayLong, dayName, dayShort, dist, dur, face, fitness, fitnessSeries, flatten, formSaid, go, h, head, height, held, icon, keep, lightNow, load, mapCredit, measure, missed, mondayOf, morph, myPlan, openSheet, pace, paceFor, perSecond, plan, planStart, plannedOn, plural, redraw, rh, rhDay, rhythmOn, rng, routeOf, row, section, setExamples, settingsView, sheetEl, signed, sportIcon, startOfDay, sumOf, svgOf, toast, wait, weekIndex, weeks, wkById, workoutById, zoneOf } from "./app.js";
import { dayChanges, dlFor, download, openDay, openWorkout, rhythmIntro, rhythmSaid, rhythmSetup, sessionView, workoutsView } from "./plan.js";
import { progActs } from "./progressview.js";
import { formView, openAct, rollAvg, uploadFilesView } from "./activities.js";

// ---- Today ----
// Today, and every day around it (the Plan's days too): the day strip, the day you're looking at, what Rhythm's
// noticed, the check-in, the week, where it's heading, your fitness and form, and your week and workouts
function todayView() {
  // (the day looked at: today, unless another's been tapped, in this week or the next)
  const lo = addDays(mondayOf(TODAY), -7), hi = addDays(mondayOf(TODAY), 13);
  if (S.dayAt != null && (S.dayAt < lo || S.dayAt > hi || S.dayAt === TODAY)) S.dayAt = null;
  const sel = S.dayAt ?? TODAY, isToday = sel === TODAY;
  const id = plannedOn(TODAY), done = actsOn(TODAY), w = id && id !== "event" ? wkById(id) : null;
  const title = isToday ? "Today" : sel === addDays(TODAY, 1) ? "Tomorrow" : sel === addDays(TODAY, -1) ? "Yesterday" : new Date(sel).toLocaleDateString("en-GB", { weekday: "long" });
  // (the date over the title, as Apple's own apps have Today; with Rhythm, where you are in its block)
  const out = [h("div.head.dated", {}, h("div.t", {}, h("div.sub", { text: rhythmOn() ? rhythmSaid() : dayLong(sel) }), h("h1", { text: title })),
    h("button.round.me", { type: "button", "aria-label": "You and settings", onclick: () => openSheet(settingsView) }, face()))];
  if (S.examples) {
    out.push(h("div.note.glass", {}, h("span.ic", {}, icon("sparkle", 16, 2.2)), h("div", {},
      h("b", { text: "Example rides are on. " }), "They’re made up, for a rider five weeks into a sportive plan, so there’s something to see. Import your own from a Garmin or a Wahoo, then turn the examples off to see only yours.",
      h("div.gos", {}, h("button.go", { type: "button", onclick: chooseFiles }, "Import files"), h("button.go", { type: "button", onclick: () => setExamples(false) }, "Use only my rides")))));
  }
  const planned = rhythmOn() || myPlan();
  if (planned) out.push(dayStrip(sel));
  if (planned && S.agenda) { const ag = agenda(sel); if (S.agendaFx) { ag.classList.add("open-in"); S.agendaFx = false; } out.push(ag); }
  const left = [isToday ? sessionCard(w, id, done) : dayCard(sel)], right = [];
  if (S.dayFx && left[0]) { left[0].classList.add("day-in", S.dayFx); S.dayFx = null; }
  if (isToday && done.length) { left.push(tomorrowCard()); right.push(didCard(done[0])); }
  left.push(rhythmSays(), isToday && feelCard(w));
  right.push(planned && weekCard(), headingCard(), formCard(), planRows());
  out.push(h("div.cols", {}, h("div", {}, left.filter(Boolean)), h("div", {}, right.filter(Boolean))));
  return out;
}
// (Rhythm plans this week and the next seven days: a day after that isn't planned yet, rather than a rest day)
const unplanned = (d) => { if (!rhythmOn()) return false; const ds = rh()?.days; return !!ds?.length && d > ds.at(-1).date && S.swaps[d] === undefined; };
// (looking at another day: its card slides in from the side it's on, once)
const lookAt = (d) => {
  const was = S.dayAt ?? TODAY, show = () => { S.dayAt = d === TODAY ? null : d; redraw(); };
  // (the chosen day's pill glides to the new day, and the day's card slides in from its side)
  if (d === was) return show();
  S.dayFx = d > was ? "next" : "prev";
  morph("day", show);
};
// what's on a day: Rhythm's (or the plan's) session, as changed; null for rest
const idOn = (d) => { const id = plannedOn(d); return id ?? null; };
// a ride's colour by how hard it is (todaycalc.js), a run's or swim's the tint
const toneOfW = (w) => (!w || w.sport !== "ride" ? "tint" : TC.toneOfIF(measure(w, paceFor(w.sport)).iF));
// The day strip: the week, a day each (its date, and a ring: ridden, to come in its colour, missed, or rest); a tap
// looks at it. The weeks either side, and both weeks as a list, a tap away.
function dayStrip(sel) {
  const mon = mondayOf(sel), began = rhythmOn() ? startOfDay(S.rhythm.at ?? S.rhythm.start ?? 0) : myPlan() ? planStart() : Infinity;
  const thisMon = mondayOf(TODAY), which = mon === thisMon ? "This week" : mon > thisMon ? "Next week" : "Last week";
  const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  const step = (k) => { const to = addDays(sel, 7 * k); lookAt(mondayOf(to) === thisMon ? TODAY : mondayOf(to) > thisMon ? (to < TODAY ? TODAY : to) : to); };
  const ring = (d) => {
    const id = idOn(d), did = actsOn(d).length, kind = TC.dayKindOf({ day: d, today: TODAY, began, id, did }), w = id && id !== "event" ? wkById(id) : null;
    if (unplanned(d)) return { kind: "later", svg: `<circle cx="11" cy="11" r="8.5" class="r-later"/>`, name: "planned nearer the time" };
    return { kind, svg: { did: `<circle cx="11" cy="11" r="8.5" class="r-did"/><path d="M7 11.5l2.6 2.6L15.5 8" class="r-tick"/>`, missed: `<circle cx="11" cy="11" r="8.5" class="r-missed"/><path d="M7.5 11h7" class="r-dash"/>`,
      plan: `<circle cx="11" cy="11" r="8.5" class="r-plan ${toneOfW(w)}"/>`, rest: `<circle cx="11" cy="11" r="2.4" class="r-rest"/>` }[kind], name: id === "event" ? "event" : w ? w.name : "rest" };
  };
  return h("nav.strip.glass", { "aria-label": "Days" },
    h("div.strip-top", {},
      h("button.strip-step", { type: "button", "aria-label": "The week before", disabled: mon <= addDays(thisMon, -7), onclick: () => step(-1) }, icon("back", 15, 2.6)),
      h("b", { text: which }),
      h("button.strip-step", { type: "button", "aria-label": "The week after", disabled: mon >= addDays(thisMon, 7), onclick: () => step(1) }, icon("chev", 15, 2.6)),
      h("button.strip-all" + (S.agenda ? ".on" : ""), { type: "button", "aria-expanded": String(!!S.agenda), onclick: () => morph("agenda", () => { S.agenda = !S.agenda; S.agendaFx = S.agenda && !canMorph(); redraw(); }) }, icon("list", 14, 2.4), S.agenda ? "Fold" : "Two weeks")),
    h("div.strip-days", {}, days.map((d) => { const r = ring(d);
      return h("button.sday" + (d === sel ? ".on" : "") + (d === TODAY ? ".today" : ""), { type: "button", vars: d === sel ? { "view-transition-name": "sday-on" } : null, "aria-pressed": String(d === sel), "aria-label": `${dayLong(d)}: ${r.name}${r.kind === "did" ? ", ridden" : r.kind === "missed" ? ", missed" : ""}`, onclick: () => lookAt(d) },
        h("small", { text: dayName(d).slice(0, 3).toUpperCase() }), h("b", { text: new Date(d).getDate() }), svgOf(`<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">${r.svg}</svg>`)); })));
}
// Both weeks as a list: each day, what's on it, its shape, and how it went
function agenda(sel) {
  const mon = mondayOf(TODAY), weeks2 = [0, 1].map((k) => Array.from({ length: 7 }, (_, i) => addDays(mon, 7 * k + i)));
  const rowOf = (d) => {
    const id = idOn(d), w = id && id !== "event" ? wkById(id) : null, did = actsOn(d), past = d < TODAY, m = w ? measure(w, paceFor(w.sport)) : null;
    if (unplanned(d) && !did.length) return h("button.row.ag-row.later", { type: "button", onclick: () => { S.agenda = false; lookAt(d); } },
      h("span.when", {}, h("small", { text: dayName(d).slice(0, 3).toUpperCase() }), h("b", { text: new Date(d).getDate() })),
      h("span.tx", {}, h("b", { text: "Not planned yet" }), h("small", { text: "Rhythm plans each day a week ahead" })));
    const sub = did.length ? `Ridden · ${hmOf(did.reduce((a, x) => a + (sumOf(x)?.moving || 0), 0))}` : w ? `${hmOf(m.secs)}${w.sport !== "strength" ? ` · stress ${Math.round(m.tss)}` : ""}${past ? " · missed" : ""}` : id === "event" ? "Your event" : "Rest";
    return h("button.row.ag-row" + (d === TODAY ? ".today" : "") + (d === sel ? ".sel" : ""), { type: "button", onclick: () => { S.agenda = false; lookAt(d); } },
      h("span.when", {}, h("small", { text: dayName(d).slice(0, 3).toUpperCase() }), h("b", { text: new Date(d).getDate() })),
      h("span.tx", {}, h("b", { text: did.length ? did[0].name : w ? w.name : id === "event" ? "Event" : "Rest" }), h("small", { text: sub })),
      w && !did.length && h("span.mini", {}, C.profile(w, { mini: true, ftp: w.sport === "ride" ? P().ftp : null, pace: paceFor(w.sport) })),
      did.length ? h("span.ag-ok", {}, icon("check", 14, 3)) : null);
  };
  return h("div.agenda", {}, weeks2.map((ds, k) => todaySection(k ? "Next week" : "This week", weekSum(ds), h("div.group.glass", {}, ds.map(rowOf)))));
}
const weekSum = (ds) => { const p = ds.reduce((a, d) => { const id = idOn(d), w = id && id !== "event" ? wkById(id) : null; return a + (w ? measure(w, paceFor(w.sport)).secs : 0); }, 0); return p ? `${dur(p)} planned` : null; };
// A day that isn't today: ridden (as Today has it), missed, rest, or what's planned, with its shape, why, and ways to
// change it
function dayCard(day) {
  const id = idOn(day), w = id && id !== "event" ? wkById(id) : null, did = actsOn(day), past = day < TODAY, rd = rhythmOn() ? rhDay(day) : null;
  if (did.length) return sessionCard(w, id, did);
  if (unplanned(day)) return h("div.card.hero.glass.session.rest", {}, heroTop(h("span.sport", {}, h("i.s-ride", {}, icon("calendar", 14, 2.2)), "Not planned yet"), "Planned nearer the time", null),
    h("p.about", { text: "Rhythm plans each day a week ahead, from what you’ve ridden and how you feel by then. Look again nearer the day." }));
  const restChip = h("span.sport", {}, h("i.s-walk", {}, icon("heart", 14, 2.2)), past ? "Rested" : "Rest day");
  if (!w && id !== "event") return h("div.card.hero.glass.session.rest", {}, heroTop(restChip, past ? "A rest day" : "Rest, and let it sink in", null),
    h("p.about", { text: rd?.why || (past ? "Nothing recorded this day." : "Fitness is built while you recover.") }));
  if (id === "event") return h("div.card.hero.glass.session", {}, heroTop(h("span.sport", {}, h("i.s-ride", {}, sportIcon("ride", 14)), "Event day"), plan().name, null));
  const m = measure(w, paceFor(w.sport)), fig = (k, v) => h("div", {}, h("small", { text: k }), h("b", { text: v }));
  if (past) return h("div.card.hero.glass.session.missed", {}, heroTop(h("span.sport.miss", {}, h("i.s-" + w.sport, {}, sportIcon(w.sport, 14)), "Missed"), w.name, null),
    h("p.about", { text: rhythmOn() ? "Not ridden: Rhythm has taken it in, and the days after follow what you did." : "Not ridden." }));
  const changes = dayChanges(day);
  return h("div.card.hero.glass.session.ahead", {},
    heroTop(h("span.sport", {}, h("i.s-" + w.sport, {}, sportIcon(w.sport, 14)), `${SPORTS[w.sport].name} · ${w.kind}${S.swaps[day] !== undefined ? " · changed" : ""}`), w.name, null),
    h("div.hero-figs", {}, fig("Time", hmOf(m.secs)), w.sport !== "strength" && fig("Stress", String(Math.round(m.tss))), w.sport === "ride" && fig("Intensity", m.iF.toFixed(2))),
    h("div.profile", {}, C.profile(w, { ftp: w.sport === "ride" ? P().ftp : null, pace: paceFor(w.sport), label: `${w.name}, step by step`, W: cardW(true) })),
    rd && h("p.why", {}, h("b", { text: "Why: " }), S.swaps[day] !== undefined ? "you changed this day." : rd.why),
    changes.length > 0 && h("div.day-change", {}, h("small", { text: "Not the day for it?" }),
      h("div.chips", {}, changes.map((c) => h("button.chip-btn" + (c.key === "undo" ? ".undo" : ""), { type: "button", title: c.sub, onclick: c.run }, c.label)))),
    h("div.acts", {},
      w.sport !== "strength" && h("button.pill", { type: "button", onclick: () => download(w, day) }, icon("download", 17, 2.2), "Download"),
      h("button.pill", { type: "button", onclick: () => (rd ? openSheet(() => sessionView(day), { tall: true }) : openWorkout(w)) }, "Step by step")));
}
// Rhythm says: what it's noticed, and what it's done about it (up to three)
function rhythmSays() {
  if (!rhythmOn()) return null;
  const r = rh(), notes = [], rd = rhDay(TODAY), tw = rd?.id ? wkById(S.swaps[TODAY] !== undefined ? S.swaps[TODAY] : rd.id) : null, ready = readiness();
  const note = (tone, ic, title, text) => notes.push(h("div.say", {}, h("span.say-ic." + tone, {}, icon(ic, 16, 2.4)), h("span.tx", {}, h("b", { text: title }), h("small", { text: text }))));
  if (ready && tw && rd.hard && !actsOn(TODAY).length) {
    if (ready.v >= 80) note("green", "check", `Fresh for ${tw.name}`, `Readiness ${ready.v}: today’s hard day is well timed. Hold the targets from the start.`);
    else if (ready.v < 58) note("amber", "gauge", `Take ${tw.name} gently`, `Readiness ${ready.v}: ride the lower end of the targets, or swap it for an easier day below.`);
  } else if (ready && !tw && ready.v < 58) note("green", "heart", "A rest well timed", `Readiness ${ready.v}: today’s rest is just what’s needed.`);
  const mon = mondayOf(TODAY), from = startOfDay(S.rhythm.at ?? S.rhythm.start ?? mon);
  const missed = r.days.filter((d) => d.date >= mon && d.date >= from && d.date < TODAY && d.missed);
  if (missed.length) note("amber", "swap", missed.length === 1 ? `${dayName(missed[0].date)} missed` : `${missed.length} sessions missed`, "Rhythm has taken it in: the days ahead follow what you actually did, not what was planned.");
  const moved = r.days.find((d) => d.date >= TODAY && d.date < addDays(TODAY, 7) && d.moved);
  if (moved) note("blue", "calendar", `A rest day moved to ${dayName(moved.date)}`, "So the week still gets its hard days, with rest around them.");
  if (notes.length < 3) {
    const b = r.block;
    if (b.absorb) note("indigo", "wave", "A lighter week", "Less riding this week, so the last three weeks sink in. Then the next block.");
    else if (b.week === 2) note("indigo", "wave", "Last full week of the block", `A lighter week follows, then ${({ aerobic: "threshold work", threshold: "top-end work", topend: "a new aerobic block" })[b.theme]}.`);
  }
  const next = r.days.find((d) => d.date > TODAY && d.hard);
  if (notes.length < 3 && next) { const nw = wkById(S.swaps[next.date] !== undefined ? S.swaps[next.date] : next.id); if (nw) note("blue", "bolt", `Next hard day: ${dayName(next.date)}`, `${nw.name}. Rest or ride easy the day before.`); }
  return notes.length ? h("section.card.glass.says", { "aria-label": "Rhythm says" }, h("div.says-head", {}, h("span.ic.indigo", {}, icon("wave", 14, 2.6)), h("b", { text: "Rhythm says" })), notes.slice(0, 3)) : null;
}
// Where it's heading: the block's four weeks, your fitness now and where the plan takes it, as a line
function headingCard() {
  if (!rhythmOn()) return null;
  const r = rh(), b = r.block, prefs = { ...R.DEFAULTS, ...S.rhythm }, line = r.line;
  if (!line?.length) return null;
  const lo = Math.min(...line.map((x) => x.ctl)), hi = Math.max(...line.map((x) => x.ctl)), span = Math.max(8, hi - lo), W = 320, H = 90;
  const pt = (x, i) => `${((i / (line.length - 1)) * W).toFixed(1)},${(H - 8 - ((x.ctl - lo) / span) * (H - 22)).toFixed(1)}`;
  const past = line.filter((x) => !x.future), cut = past.length - 1, end = line.at(-1), now = past.at(-1);
  const chart = svgOf(`<svg viewBox="0 0 ${W} ${H + 16}" preserveAspectRatio="none" role="img" aria-label="Your fitness, the last four weeks, and as planned to ${dayShort(end.date)}"><rect x="${pt(now, cut).split(",")[0]}" y="0" width="${(W - Number(pt(now, cut).split(",")[0])).toFixed(1)}" height="${H}" class="hd-ahead"/><line x1="0" y1="${H - 1}" x2="${W}" y2="${H - 1}" class="rh-axis"/><polyline class="rh-line up" points="${past.map(pt).join(" ")}"/><polyline class="rh-line up ahead" points="${line.slice(cut).map((x, i) => pt(x, i + cut)).join(" ")}"/><circle cx="${pt(now, cut).split(",")[0]}" cy="${pt(now, cut).split(",")[1]}" r="4.5" class="rh-now"/><text x="0" y="${H + 13}" class="hd-lab">4 weeks ago</text><text x="${W}" y="${H + 13}" text-anchor="end" class="hd-lab">${dayShort(end.date)}</text></svg>`);
  const up = Math.round(end.ctl) - Math.round(now.ctl), ramp = Math.max(1.5, 4.5 - r.ctl / 40), theme = { aerobic: "z2", threshold: "z4", topend: "z6" }[b.theme];
  return todaySection("Where it’s heading", prefs.mode === "hold" ? "Holding" : "Building", h("div.card.glass.heading", {},
    h("div.rb-weeks", {}, [0, 1, 2, 3].map((i) => h("div.rb-week" + (i === b.week ? ".now" : "") + (i < b.week ? ".past" : ""), {}, h("i.bg-" + (i === 3 ? "z1" : theme)), h("small", { text: i === b.week ? "This week" : i === 3 ? "Lighter" : i < b.week ? `Week ${i + 1} ✓` : `Week ${i + 1}` })))),
    h("div.hd-top", {}, h("b", { text: Math.round(now.ctl) }), h("span", { text: "fitness now" }), up > 0 && h("span.hd-to", { text: `${Math.round(end.ctl)} by ${dayShort(end.date)}` })),
    chart,
    h("p.line-said", { text: `${prefs.mode === "hold" ? "Holding your fitness where it is" : b.absorb ? "A lighter week, so the work sinks in" : `Up about ${Math.round(ramp)} points a week, then a lighter week so it sinks in`}. ${{ aerobic: "Steady riding and tempo first.", threshold: "Sweet spot and threshold now.", topend: "VO₂ max and short, hard efforts now." }[b.theme]}` })));
}
// yours to change: your week (Rhythm), and the workouts
function planRows() {
  const prefs = rhythmOn() ? { ...R.DEFAULTS, ...S.rhythm } : null, nd = prefs ? prefs.days.filter((x) => x > 0).length : 0, hrs = prefs ? prefs.days.reduce((a, x) => a + x, 0) : 0;
  return section(null, h("div.group.glass", {},
    prefs && row({ icon: "calendar", tint: "blue", title: "Your week", sub: `${plural(nd, "day")}, ${dur(hrs * 60)}${prefs.run ? ", a run" : ""}${prefs.swim ? ", a swim" : ""} · ${prefs.mode === "hold" ? "holding" : "building"}`, onclick: () => rhythmSetup() }),
    row({ icon: "list", tint: "indigo", title: "Workouts", sub: S.mine.length ? `The library, and ${plural(S.mine.length, "of your own", "of your own")}` : "The library, to ride any day", onclick: () => openSheet(workoutsView, { tall: true }) })));
}
// a length of time as a clock has it: 1:30
const hmOf = (s) => { const m = Math.round((s || 0) / 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`; };
// a section of Today: its title over it, as a heading, and what's said beside it
const todaySection = (title, aside, ...kids) => h("section.section.t-sec", {}, h("h3", {}, title, aside && h("span.aside", { text: aside })), ...kids);

// How ready you are, out of 100: your form, and how you said you are this morning. None till there are rides to go on.
function readiness() {
  if (!S.summed || !S.acts.some((a) => sumOf(a)?.tss)) return null;
  return TC.readinessOf(fitnessSeries().at(-1).tsb, S.feel[TODAY]);
}
function readyRing(size = 84) {
  const r = readiness();
  if (!r) return null;
  const c = size / 2, R = c - 7, C = 2 * Math.PI * R;
  return h("div.ready." + r.tone, { role: "img", "aria-label": `Readiness ${r.v} of 100: ${r.word}`, vars: { "--s": size + "px" } },
    svgOf(`<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle class="trk" cx="${c}" cy="${c}" r="${R}"/><circle class="arc" cx="${c}" cy="${c}" r="${R}" stroke-dasharray="${((r.v / 100) * C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 ${c} ${c})"/></svg>`),
    h("span", {}, h("b", { text: r.v }), h("small", { text: r.word })));
}
// the top of the day's card: what kind of day, its name, and how ready you are
const heroTop = (chip, title, ring = readyRing()) => h("div.hero-top", {}, h("div.tx", {}, chip, h("h2", { text: title })), ring);
const metaOf = (w) => { const m = measure(w, paceFor(w.sport)); return [dur(m.secs), w.sport !== "strength" ? `stress ${Math.round(m.tss)}` : null].filter(Boolean).join(" · "); };
// the next session, with its shape, a tap from the rest day
const nextUp = (date, w) => h("button.next-up", { type: "button", onclick: () => openWorkout(w) },
  h("span.tx", {}, h("small", { text: `Next · ${dayName(date)}` }), h("b", { text: w.name }), h("small", { text: metaOf(w) })),
  h("span.mini", {}, C.profile(w, { mini: true, ftp: w.sport === "ride" ? P().ftp : null, pace: paceFor(w.sport), label: `${w.name}, its shape` })), h("span.chev", {}, icon("chev", 15, 2.6)));

function sessionCard(w, id, done) {
  // done: on its map, against what was planned (where it was the same sport)
  if (done.length) {
    const a = done[0], s = sumOf(a), pl = w && w.sport === a.sport ? w : null, pt = pl ? Math.round(measure(pl, paceFor(pl.sport)).tss) : null;
    const fig = (k, v, u) => h("div", {}, h("small", { text: k }), h("b", {}, v, u && h("u", { text: u })));
    const third = s?.np ? fig("Norm. power", String(Math.round(s.np)), " W") : fig("Stress", s?.tss != null ? String(s.tss) : "–");
    const on = pl && s?.tss != null && pt ? (s.tss > pt * 1.1 ? "A bit more than planned" : s.tss < pt * 0.9 ? "A bit less: no matter" : "Right on target") : null;
    const bar = (k, v, max, cls) => h("div.vs-row", {}, h("small", { text: k }), h("span.vs-bar", {}, h("i." + cls, { vars: { width: Math.min(100, (v / max) * 100) + "%" } })), h("b", { text: String(v) }));
    const rec = newBest(a), ef = pl ? effortsNow(a) : null;
    return h("div.card.hero.glass.session.done", {},
      doneMap(a),
      heroTop(h("span.sport.ok", {}, h("i.s-" + a.sport, {}, icon("check", 14, 3)), pl ? "Done · as planned" : "Done today"), pl ? pl.name : a.name, null),
      s && h("div.hero-figs", {}, fig("Time", hmOf(s.moving)), s.dist ? fig("Distance", dist(s.dist)) : fig("Stress", s.tss != null ? String(s.tss) : "–"), third),
      on && h("div.vs", {}, h("div.vs-head", {}, h("small", { text: "Training stress" }), h("small.ok", { text: on })),
        bar("Planned", pt, Math.max(pt, s.tss) * 1.08, "plan"), bar("Ridden", s.tss, Math.max(pt, s.tss) * 1.08, "done")),
      (rec || ef) && h("div.hero-chips", {}, rec && h("span.rec", {}, icon("medal", 14, 2.2), rec),
        ef && h("span.held" + (ef.held === ef.n ? ".ok" : ""), {}, icon(ef.held === ef.n ? "check" : "info", 14, 2.6), E.effortsSaid(ef))),
      h("div.acts", {}, h("button.pill", { type: "button", onclick: () => openAct(a) }, "See the ride", icon("chev", 15, 2.4))));
  }
  if (id === "event") {
    return h("div.card.hero.glass.session", {}, heroTop(h("span.sport", {}, h("i.s-ride", {}, sportIcon("ride", 14)), "Event day"), plan().name),
      h("p.about", { text: "This is what the weeks were for. Start steady, eat early, and enjoy it." }));
  }
  if (!myPlan() && !rhythmOn()) return rhythmIntro();
  const rd = rhythmOn() && S.swaps[TODAY] === undefined ? rhDay(TODAY) : null;
  const restChip = h("span.sport", {}, h("i.s-walk", {}, icon("heart", 14, 2.2)), "Rest day");
  if (!w && rd) {
    const next = [1, 2, 3].map((n) => rhDay(addDays(TODAY, n))).find((x) => x?.id), nw = next && wkById(next.id);
    return h("div.card.hero.glass.session.rest", {}, heroTop(restChip, "Rest, and let it sink in"), h("p.why", { text: rd.why }), nw && nextUp(next.date, nw));
  }
  if (!w && myPlan() && TODAY < planStart()) {
    const first = weeks()[0].days.find((d) => d.id), fw = first && wkById(first.id);
    return h("div.card.hero.glass.session.rest", {},
      heroTop(h("span.sport", {}, h("i.s-ride", {}, icon("calendar", 14, 2.2)), "New plan"), `${plan().name} starts ${planStart() - TODAY < 7 * DAY ? dayName(planStart()) : dayShort(planStart())}`),
      h("p.about", { text: "Until then, ride as you like: easy miles are never wasted." }), fw && nextUp(first.date, fw));
  }
  if (!w) {
    const next = [1, 2, 3].map((n) => addDays(TODAY, n)).find((d) => plannedOn(d));
    const nw = next && plannedOn(next) !== "event" ? wkById(plannedOn(next)) : null;
    return h("div.card.hero.glass.session.rest", {}, heroTop(restChip, "Rest, and let it sink in"),
      h("p.about", { text: "Fitness is built while you recover. A walk is fine; anything harder can wait." }), nw && nextUp(next, nw));
  }
  const m = measure(w, paceFor(w.sport)), swapped = S.swaps[TODAY] !== undefined;
  const fig = (k, v) => h("div", {}, h("small", { text: k }), h("b", { text: v }));
  return h("div.card.hero.glass.session.go", {},
    heroTop(h("span.sport", {}, h("i.s-" + w.sport, {}, sportIcon(w.sport, 14)), `${SPORTS[w.sport].name} · ${w.kind}${swapped ? " · swapped" : ""}`), w.name),
    h("div.hero-figs", {}, fig("Time", hmOf(m.secs)), w.sport !== "strength" && fig("Stress", String(Math.round(m.tss))), w.sport === "ride" && fig("Intensity", m.iF.toFixed(2))),
    h("div.profile", {}, C.profile(w, { ftp: w.sport === "ride" ? P().ftp : null, pace: paceFor(w.sport), label: `${w.name}, step by step`, W: cardW(true) })),
    rd ? h("p.why", {}, h("b", { text: "Why today: " }), rd.why) : h("p.about", { text: w.about }),
    rd && (rd.fuel || rd.strength) && h("div.extras", {},
      rd.fuel && h("span", {}, icon("bolt", 14, 2.2), `Fuel: ${rd.fuel}`),
      rd.strength && h("button.link.small", { type: "button", onclick: () => openWorkout(workoutById("strength-heavy")) }, icon("strength", 14, 2.2), "Then heavy strength, 20 minutes")),
    // (the best time to ride: from the weather where you ride)
    (w.sport === "ride" || w.sport === "run") && bestTime(w),
    h("div.acts", {},
      w.sport !== "strength" && h("button.pill.primary", { type: "button", onclick: () => download(w) }, icon("download", 17, 2.2), "Download"),
      h("button.pill", { type: "button", onclick: () => (rd ? openSheet(() => sessionView(TODAY), { tall: true }) : openWorkout(w)) }, "Details"),
      swapped && h("button.pill", { type: "button", onclick: () => { delete S.swaps[TODAY]; keep("swaps"); redraw(); } }, "Undo swap")),
    w.sport !== "strength" && dlFor(w, TODAY));
}
// The weather where you ride (functions/_fitwx.js), asked for once and kept half an hour; the page drawn again when
// it comes
let wxAsking = false;
function rideWx() {
  if (S.wx && Date.now() - S.wx.at < 30 * 60e3) return S.wx.d;
  if (!wxAsking && S.me) {
    wxAsking = true;
    A.rideWeather().then((d) => { S.wx = { at: Date.now(), d }; redraw(); }).catch(() => { S.wx = { at: Date.now(), d: null }; }).finally(() => { wxAsking = false; });
  }
  return S.wx?.d || null;
}
// The best time for it today, as Weather would say it (fitness/besttime.js, from Weather's Best times): the stretch as
// long as the session, from now till dusk. In the demo, a made-up day.
function bestTime(w) {
  const m = measure(w, paceFor(w.sport));
  if (S.examples) {
    const r = rng("wx" + TODAY), hrs = Math.max(1, Math.ceil(m.secs / 3600));
    const from = 9 + Math.floor(r() * 3), to = Math.min(17, from + hrs + 1 + Math.floor(r() * 2)), temp = 9 + Math.floor(r() * 7);
    return h("div.best-time", {}, h("span.wxi", {}, C.weatherIcon()), h("span.tx", {}, h("b", { text: `Best ${from}:00 to ${to}:00` }), h("small", { text: `${temp}°, dry, ${BT.windWords(8 + r() * 14, r() * 360)} · an example day` })));
  }
  const d = rideWx(), b = d?.hours?.length ? BT.bestWindow(d, { secs: m.secs, sport: w.sport === "run" ? "run" : "ride" }) : null;
  if (!b) return null;
  const at = (t) => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(t + (d.offset || 0) * 1000));
  const deg = (c) => (c == null ? "" : U.metric ? `${Math.round(c)}°` : `${Math.round(c * 1.8 + 32)}°`);
  const where = d.place?.name ? ` · ${d.place.name}` : "";
  if (b.rating === "Poor") {
    const why = !b.dry || b.pop >= 60 ? "Rain on and off all day" : b.wind > 30 || b.gust > 55 ? "Windy all day" : `${deg(b.temp)} at best`;
    return h("div.best-time.poor", {}, h("span.wxi", {}, icon("info", 18, 2.2)), h("span.tx", {}, h("b", { text: `No good time outside today` }), h("small", { text: `${why}: the trainer, perhaps${where}` })));
  }
  return h("div.best-time", {}, h("span.wxi", {}, C.weatherIcon()),
    h("span.tx", {}, h("b", { text: `Best ${at(b.start)} to ${at(b.end)}` }),
      h("small", { text: `${deg(b.temp)}, ${b.dry && b.pop < 30 ? "dry" : `${Math.round(b.pop)}% chance of rain`}, ${BT.windWords(b.wind, b.dir)}${where}` })));
}
// today's ride on its map (kept between redraws, so the map isn't made again each time the page is)
let todayMap = null;
function doneMap(a) {
  if (!M.able() || !(sumOf(a)?.route || a.sample)) return null;
  if (todayMap?.id === a.id) return todayMap.el;
  todayMap?.g?.remove();
  const el = h("div.done-map", { role: "button", tabindex: "0", "aria-label": "Today’s route on a map: open the ride", onclick: () => openAct(a) }, mapCredit());
  todayMap = { id: a.id, el, g: null };
  (async () => {
    const x = await load(a);
    if (!x?.s?.lat?.some((v) => v != null)) throw 0;
    const ps = perSecond(x), roll = ps.pwr ? rollAvg(ps.pwr, 30) : null;
    const zoneAt = roll ? (i) => zoneOf((roll[Math.min(roll.length - 1, Math.round(x.s.t[i]))] || 0) / P().ftp).c : null;
    const g = await M.routeMap(el, { ...routeOf(x.s, zoneAt), light: lightNow() });
    if (todayMap?.el === el) todayMap.g = g; else g.remove();
  })().catch(() => el.remove());
  return el;
}
// The efforts of a ride against the session it was for (fitness/efforts.js): the session planned on its day, of its
// sport (rides, with power); kept once worked out, the file read for it once, and the page drawn again when it's said
const sessionOf = (a) => { if (a.sport !== "ride") return null; const id = a.workout || plannedOn(startOfDay(a.start)), w = id && id !== "event" ? wkById(id) : null; return w?.sport === "ride" ? w : null; };
const effortsOf = (a, x) => { const w = sessionOf(a); return w && x ? E.efforts(flatten(w, paceFor("ride")), perSecond(x).pwr, P().ftp) : null; };
const effortsSeen = new Map();
function effortsNow(a) {
  if (effortsSeen.has(a.id)) return effortsSeen.get(a.id);
  effortsSeen.set(a.id, null);
  if (sessionOf(a)) load(a).then((x) => { const e = effortsOf(a, x); effortsSeen.set(a.id, e); if (e) redraw(); }).catch(() => {});
  return null;
}
// the efforts, one by one: each a bar against its target (the line), green where it held
function effortsCard(e) {
  const top = Math.max(1.15, ...e.each.map((x) => x.got / x.target)), few = e.each.length <= 10, targets = new Set(e.each.map((x) => x.target));
  return card("eff-card", "The efforts",
    h("div.eff-head", {}, h("b." + (e.held === e.n ? "ok" : "part"), { text: E.effortsSaid(e) }),
      h("small", { text: `Target ${targets.size > 1 ? `${Math.min(...targets)}–${Math.max(...targets)}` : e.each[0].target} W · within 6% counts as held` })),
    h("div.eff-strip" + (few ? ".few" : ""), { role: "img", "aria-label": e.each.map((x, i) => `Effort ${i + 1}: ${x.got} W of ${x.target}`).join("; "), vars: { "--line": (1 / top) * 100 + "%" } },
      e.each.map((x) => h("span.eff" + (x.held ? ".ok" : ""), { title: `${x.got} W of ${x.target} W` }, few && h("small", { text: x.got }), h("i", { vars: { height: Math.min(100, (x.got / x.target / top) * 100) + "%" } })))),
    h("p.line-said", { text: "Each effort’s average power, from a few seconds in (getting up to it isn’t counted), against the dashed line: its target." }));
}
// a new best, from today's ride: the longest length it beat your best before at
function newBest(a) {
  const s = sumOf(a);
  if (a.sport !== "ride" || !s?.curve) return null;
  const before = G.bests(progActs().filter((x) => x.start < startOfDay(a.start)));
  if (!Object.keys(before).length) return null;
  const beat = [...G.LENGTHS].reverse().find(([k]) => s.curve[k] > (before[k]?.w || Infinity));
  return beat && `Best ${beat[2].replace(/^an /, "")}: ${Math.round(s.curve[beat[0]])} W`;
}
// what tomorrow brings, once today's ridden
function tomorrowCard() {
  const d = addDays(TODAY, 1), id = plannedOn(d), w = id && id !== "event" ? wkById(id) : null;
  const then = !w && [2, 3, 4].map((n) => addDays(TODAY, n)).find((x) => plannedOn(x) && plannedOn(x) !== "event"), tw = then && wkById(plannedOn(then));
  return h("button.card.glass.tomorrow", { type: "button", onclick: () => openDay(d) },
    h("span.ic." + (w ? "blue" : "indigo"), {}, icon(w ? "calendar" : "heart", 19, 2.2)),
    h("span.tx", {}, h("small", { text: "Tomorrow" }), h("b", { text: id === "event" ? "The event" : w ? w.name : "Rest, so today sinks in" }),
      h("small", { text: w ? metaOf(w) : tw ? `Then ${dayName(then)}: ${tw.name}, ${dur(measure(tw, paceFor(tw.sport)).secs)}` : "" })),
    h("span.chev", {}, icon("chev", 15, 2.4)));
}
// what today's ride did: fitness, and form for tomorrow
function didCard(a) {
  if (!S.summed || !sumOf(a)?.tss) return null;
  const f = fitnessSeries(), last = f.at(-1), prev = f.at(-2) || last, gain = last.ctl - prev.ctl, tm = last.ctl - last.atl, said = formSaid(tm);
  return todaySection("What it did", null, h("div.did", {},
    h("div.card.glass", {}, h("small", {}, h("i.dot-fit"), "Fitness"), h("span.v", {}, h("b", { text: Math.round(last.ctl) }), Math.round(gain) > 0 && h("em", { text: signed(gain) })), h("small.sub", { text: "From today’s ride" })),
    h("div.card.glass", {}, h("small", {}, h("i.dot-form"), "Form tomorrow"), h("span.v", {}, h("b", { text: signed(tm) })), h("small.sub", { text: said.word }))));
}
function formCard() {
  const box = (...kids) => todaySection("Fitness and form", null, ...kids);
  if (!S.summed) return box(card(null, null, wait(44), h("div", { vars: { height: "10px" } }), wait(120)));
  if (!S.acts.some((a) => sumOf(a)?.tss)) return box(card(null, null, h("p.line-said", { text: "Your fitness, fatigue and form come from your rides’ training stress, day by day. Import a few weeks of rides to see them; the more, the truer." }),
    h("div.acts", { vars: { "margin-top": "12px" } }, h("button.pill", { type: "button", onclick: () => openSheet(uploadFilesView) }, icon("inbox", 17, 2.1), "Bring your rides in"))));
  const f = fitnessSeries(), last = f.at(-1), said = formSaid(last.tsb), wk = f.at(-8);
  // (form on a band: strain, building, neutral, fresh, rested; -40 to +30)
  const at = Math.max(2, Math.min(98, ((last.tsb + 40) / 70) * 100));
  return box(h("button.card.glass.form-card", { type: "button", onclick: () => openSheet(formView), "aria-label": `Fitness ${Math.round(last.ctl)}, fatigue ${Math.round(last.atl)}, form ${Math.round(last.tsb)}: ${said.word}` },
    h("div.form-top", {}, h("div", {}, h("small", { text: "Form" }), h("b", { text: signed(last.tsb) })), h("span.word.pill-word.tone-" + said.tone, { text: said.word })),
    h("div.fband", { "aria-hidden": "true" }, h("span.track"), h("span.knob", { vars: { left: at + "%" } }), h("span.lab", {}, ["Strain", "Building", "Neutral", "Fresh", "Rested"].map((t) => h("span", { text: t })))),
    h("div.fit-tiles", {},
      h("div", {}, h("small", {}, h("i.dot-fit"), "Fitness"), h("b", { text: Math.round(last.ctl) }), h("small.sub", { text: `${last.ctl >= wk.ctl ? "+" : "−"}${Math.abs(Math.round(last.ctl - wk.ctl))} this week` })),
      h("div", {}, h("small", {}, h("i.dot-fat"), "Fatigue"), h("b", { text: Math.round(last.atl) }), h("small.sub", { text: last.atl < 5 ? "All but gone" : last.atl > last.ctl ? "Above your fitness" : "Below your fitness" }))),
    C.fitnessChart(f, { days: 42, W: cardW() }), h("p.line-said", { text: said.line })));
}
// The week: hours ridden of what's planned, and how it's balanced, easy against hard (the strip has its days)
function weekCard() {
  const mon = mondayOf(TODAY), days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  const began = rhythmOn() ? startOfDay(S.rhythm.at ?? S.rhythm.start ?? 0) : myPlan() ? planStart() : Infinity;
  const wOn = (d) => { const id = d >= began ? plannedOn(d) : null; return id && id !== "event" ? wkById(id) : null; };
  const rode = (d) => actsOn(d).reduce((a, x) => a + (sumOf(x)?.moving || 0), 0);
  // (the week's whole time: what's planned from when the plan began, and what you rode before it)
  const planSecs = days.reduce((a, d) => a + (d >= began ? (wOn(d) ? measure(wOn(d), paceFor(wOn(d).sport)).secs : 0) : rode(d)), 0), doneSecs = days.reduce((a, d) => a + rode(d), 0);
  const planned = days.filter((d) => wOn(d)).length, ridden = days.filter((d) => actsOn(d).length).length;
  // (easy and hard: a hard session's hard part, about its first hour at 55%, as Rhythm reckons it)
  const hardSecs = days.reduce((a, d) => { const w = wOn(d); if (!w || w.sport !== "ride") return a; const m = measure(w, paceFor(w.sport)), hard = rhythmOn() && S.swaps[d] === undefined ? !!rhDay(d)?.hard : m.iF >= 0.84; return a + (hard ? Math.min(m.secs, 3600) * 0.55 : 0); }, 0);
  const easy = planSecs ? Math.round(100 * (1 - hardSecs / planSecs)) : 100;
  return todaySection("This week", planned ? `${ridden} of ${planned} ${planned === 1 ? "ride" : "rides"}` : null, h("div.card.glass.week-card", {},
    h("div.wk-line", {}, h("span", {}, h("b", { text: hmOf(doneSecs) }), " ridden"), h("span", { text: planSecs ? `of ${dur(planSecs)} planned` : "" })),
    planSecs > 0 && h("div.week-bar", { role: "img", "aria-label": `${dur(doneSecs)} ridden of ${dur(planSecs)} planned` }, h("i", { vars: { width: Math.min(100, (doneSecs / planSecs) * 100) + "%" } })),
    planSecs > 0 && h("div.wk-line.bal-head", {}, h("span", { text: "Easy and hard" }), h("span", {}, h("b", { text: `${easy}%` }), " easy")),
    planSecs > 0 && h("div.bal", { role: "img", "aria-label": `${easy}% easy, ${100 - easy}% hard this week` }, h("i.easy", { vars: { flex: String(easy) } }), h("i.hard", { vars: { flex: String(100 - easy) } })),
    planSecs > 0 && h("small.week-status", { text: easy >= 75 && easy <= 88 ? "About 80/20: the mix that builds fitness fastest." : easy > 88 ? "Mostly easy this week: good for building the base." : "A hard week: rest well between the sessions." })));
}
// How you feel: sleep, legs and motivation, a tap each, there on the page; what Rhythm (or the plan) makes of it under
// them. Once said, folded to a line, opened again to change it.
const FEEL = [["sleep", "Sleep", "contrast", ["Poor", "OK", "Great"], ["Slept poorly", "slept OK", "slept well"]],
  ["legs", "Legs", "run", ["Heavy", "Normal", "Fresh"], ["heavy legs", "normal legs", "fresh legs"]],
  ["mood", "Motivation", "bolt", ["Low", "OK", "High"], ["low motivation", "motivation OK", "keen"]]];
let feelDraft = {}, feelOpen = false;
function verdictOf(w) {
  const f = S.feel[TODAY];
  const rd = rhythmOn() ? rhDay(TODAY) : null, tm = rhythmOn() ? rhDay(addDays(TODAY, 1)) : null;
  if (rd) {
    const eased = rd.feel !== "good", carry = tm && /yesterday/.test(tm.why || "");
    return !eased && !carry ? ["green", "check", "Ready for it", rd.id ? "Today’s session stands." : "Enjoy the rest day."]
      : ["amber", "swap", eased ? "Rhythm has eased today" : "Tomorrow eased", [eased && rd.why, carry && `Tomorrow: ${tm.why.charAt(0).toLowerCase()}${tm.why.slice(1)}.`].filter(Boolean).join(". ")];
  }
  const score = f.sleep + f.legs + f.mood, hard = w && measure(w).iF > 0.8;
  return score <= 2 && hard ? ["amber", "swap", "Take it easy today", `${w.name} would cost more than it gives today.`] : ["green", "check", score >= 5 ? "Ready for it" : "Good to go", w ? `${w.name} as planned.` : "Ride as you feel."];
}
function setFeel(k, v) {
  const was = S.feel[TODAY], all = (f) => FEEL.every(([x]) => f?.[x] != null);
  try { localStorage.setItem("fitness:asked", String(TODAY)); } catch (_) {}
  if (!all(was)) { feelDraft = { ...feelDraft, [k]: v }; if (!all(feelDraft)) return redraw(); }
  const before = rhythmOn() ? JSON.stringify([rhDay(TODAY)?.id, rhDay(addDays(TODAY, 1))?.id]) : null;
  S.feel[TODAY] = all(was) ? { ...was, [k]: v } : { ...feelDraft }; feelDraft = {}; keep("feel"); redraw();
  const after = rhythmOn() ? JSON.stringify([rhDay(TODAY)?.id, rhDay(addDays(TODAY, 1))?.id]) : null;
  if (!all(was) || after !== before) toast(before && after !== before ? "Rhythm has changed your plan to suit" : "Thanks: today stands");
}
function feelCard(w) {
  const f = S.feel[TODAY] || {}, done = FEEL.every(([k]) => f[k] != null), cur = done ? f : feelDraft, v = done && verdictOf(w);
  if (done && !feelOpen) {
    return h("div.card.glass.checkin.done", {},
      h("span.ic." + v[0], {}, icon(v[1], 18, 2.4)),
      h("div.tx", {}, h("b", { text: v[2] }), h("small", { text: FEEL.map(([k, , , , said], i) => (i ? said[f[k]] : said[f[k]].charAt(0).toUpperCase() + said[f[k]].slice(1))).join(" · ") })),
      h("button.pill.small", { type: "button", onclick: () => { feelOpen = true; redraw(); }, "aria-label": "Change how you are today" }, "Change"));
  }
  return h("div.card.glass.checkin.open", {},
    h("div.checkin-head", {}, h("b", { text: "How are you this morning?" }), done && h("button.checkin-done", { type: "button", onclick: () => { feelOpen = false; redraw(); } }, "Done")),
    FEEL.map(([k, label, ic, words]) => h("div.checkin-row", {},
      h("span.lab", {}, h("span.ico", {}, icon(ic, 14, 2.3)), h("span.lt", { text: label })),
      h("div.seg3", { role: "group", "aria-label": label }, words.map((word, i) =>
        h("button.t" + i, { type: "button", vars: cur[k] === i ? { "view-transition-name": `seg-${k}` } : null, "aria-pressed": String(cur[k] === i), onclick: () => morph("feel", () => setFeel(k, i)) }, word))))),
    v ? h("div.checkin-said." + v[0], {}, h("span.cs-ic", {}, icon(v[1], 15, 2.8)), h("span.cs-tx", {}, h("b", { text: v[2] }), v[3] && h("small", { text: v[3] }))) :
      h("small.checkin-hint", { text: rhythmOn() ? "Three taps. Today’s session, and the next days, follow what you say." : "Three taps, so today’s riding suits how you are." }));
}
// The day's check-in: sleep, legs and motivation, a tap each; with Rhythm, today and the days after follow it
function openCheckIn() {
  const f = { ...(S.feel[TODAY] || {}) };
  try { localStorage.setItem("fitness:asked", String(TODAY)); } catch (_) {}
  const before = rhythmOn() ? JSON.stringify([rhDay(TODAY)?.id, rhDay(addDays(TODAY, 1))?.id]) : null;
  const view = () => {
    const seg = (k, opts) => { const at = opts.findIndex(([v]) => v === f[k]);
      return h("div.seg" + (at < 0 ? ".none" : ""), { vars: { "--n": opts.length, "--at": Math.max(0, at) }, role: "group", "aria-label": k },
        opts.map(([v, label]) => h("button", { type: "button", "aria-pressed": String(f[k] === v), onclick: () => { f[k] = v; Sheet.redraw(); } }, label))); };
    const all = ["sleep", "legs", "mood"].every((k) => f[k] != null);
    const save = () => {
      S.feel[TODAY] = { ...f }; keep("feel"); closeSheet(); redraw();
      const after = rhythmOn() ? JSON.stringify([rhDay(TODAY)?.id, rhDay(addDays(TODAY, 1))?.id]) : null;
      toast(before && after !== before ? "Rhythm has changed your plan to suit" : "Thanks: today stands");
    };
    return { title: dayLong(TODAY), right: h("button.link.r", { type: "button", onclick: closeSheet }, "Not now"), body: [
      h("div.sheet-top", {}, h("h1", { text: "How are you today?" }), h("div.sub", { text: rhythmOn() ? "Today’s session, and the next days, follow what you say." : "So today’s riding suits how you are." })),
      h("div.checkin-q", {}, h("b", { text: "How did you sleep?" }), seg("sleep", [[0, "Poorly"], [1, "OK"], [2, "Well"]])),
      h("div.checkin-q", {}, h("b", { text: "How are your legs?" }), seg("legs", [[0, "Heavy"], [1, "Normal"], [2, "Fresh"]])),
      h("div.checkin-q", {}, h("b", { text: "How motivated are you?" }), seg("mood", [[0, "Low"], [1, "OK"], [2, "High"]])),
      h("button.btn", { type: "button", disabled: !all, onclick: save }, "Done")] };
  };
  openSheet(view);
}
// (asked once a day, as the app opens or comes back, while you're on Rhythm and haven't said)
function askToday() {
  if (!rhythmOn() || S.ask === false || S.feel[TODAY] || sheetEl.open) return;
  try { if (localStorage.getItem("fitness:asked") === String(TODAY)) return; } catch (_) {}
  setTimeout(() => { if (!sheetEl.open && !S.feel[TODAY]) openCheckIn(); }, 700);
}

export { askToday, effortsCard, effortsOf, effortsSeen, todayView };
