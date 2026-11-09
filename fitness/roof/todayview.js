// Fitness's Today under the roof (One roof stage 2, §4.3, BI2, BI5): a port of fitness/today.js, its names kept, its
// `from "./app.js"` now `from "./x.js"`; the plan's and Activities' sheets through ctx.open (§4.7's table: lazy files),
// Rhythm's intro and the device line ported here (plan.js rhythmIntro, dlFor) so the first paint needs no lazy file.
// view(el, ctx) → { draw(), hide(), destroy() }; ctx = { S, core, fw, open } (fitness.js). Exports beside it, as
// today.js's: askToday effortFigs effortsCard effortsOf effortsSeen lookAt nightsView stepDay todayView.
// The week grid's day drag (.gday[draggable], ≥ 980 px) is a move between days, never an upload (S2-D12: fitness.js's
// drop takes Files only); the drag's class sits on the module's screen, not the page's body.
import * as TC from "../todaycalc.js";
import { A, BT, C, DAY, isSet, resum, setNumber, wellByDay, nightsFrom, nightsSeries, sheetW, E, G, M, P, R, S, SPORTS, Sheet, TODAY, U, actsOn, addDays, canMorph, card, cardW,
  closeSheet, dayLong, dayName, dayShort, dist, dur, fitness, fitnessSeries, formSaid, h, held, icon, keep, lightNow, load, mapCredit, measure, missed,
  mondayOf, morph, myPlan, openSheet, pace, paceFor, perSecond, plan, planStart, plannedOn, plural, redraw, rh, rhDay, rhythmOn, routeOf, row, section, sheetEl, signed,
  sportIcon, startOfDay, sumOf, svgOf, toast, weeks, wkById, zoneOf, store, mapsAlways, wide, signedOutHere,
  dayChanges, dayStamp, progActs, rollAvg, sessionOf, effortsOf, effortFigs, setAsk } from "./x.js";
import { offerCards, undoToday } from "./offers.js";
import { withOffer, withLine, withChip } from "../invites.js";
import {coach} from "./core.js";
import { sessionSendCard, packCard } from "../send.js";

export { effortsOf, effortFigs };
// (the view's context, for the functions below as today.js had app.js's: set by view())
let ctx = null;
const use = (c) => { ctx = c; };
const scr = () => ctx?.fw?.screenEl || null;

// ---- Today ----
// Today, and every day around it (the Plan's days too): the day strip, the day you're looking at, what Rhythm's
// noticed, the check-in, the week, where it's heading, your fitness and form, and your week and workouts
function todayView() {
  // (the day looked at: today, unless another's been tapped, in this week or the next)
  const lo = addDays(mondayOf(TODAY), -7), hi = addDays(mondayOf(TODAY), 13);
  if (S.dayAt != null && (S.dayAt < lo || S.dayAt > hi || S.dayAt === TODAY)) S.dayAt = null;
  const sel = S.dayAt ?? TODAY, isToday = sel === TODAY;
  // (the week's weather, for Rhythm's wet days: asked for as the page is drawn, and the plan drawn again when it comes)
  if (rhythmOn()) rideWx();
  if(S.rhythm?.engine===2&&!coach.ready())return [card(null,"Fitness",coach.state().error||"Loading…",h("button.pill",{onclick:()=>coach.load({refresh:true}).catch(e=>toast(e.message))},"Retry"))];
  const id = plannedOn(TODAY), done = actsOn(TODAY), w = id && id !== "event" ? wkById(id) : null;
  const out = [];
  const planned = rhythmOn() || myPlan();
  const left = [isToday ? sessionCard(w, id, done) : dayCard(sel)], right = [];
  left[0]?.setAttribute?.("data-k", "daycard");
  if (S.dayFx && left[0]) { left[0].classList.add("day-in", S.dayFx); S.dayFx = null; }
  // (plans made in Chat, waiting to be added: above the day's card, soonest first: invites.js)
  if (isToday) left.unshift(...offerCards(ctx));
  // (on a computer: the two weeks as one grid across the top, the day under it, and beside it only what decides the
  // day: the morning's check-in and what Rhythm says; the week and where it's heading are the grid's and Progress's)
  if (wide()) {
    if (planned) out.push(weekGrid(sel));
    if (isToday && done.length) { left.push(tomorrowCard()); right.push(didCard(done[0])); }
    right.push(planned && weekCard(), isToday && morningCard(w), rhythmSays(), isToday && reviewCard(), planRows());
    out.push(h("div.cols", {}, h("div", {}, left.filter(Boolean)), h("div", {}, right.filter(Boolean))));
    return out;
  }
  if (planned) out.push(dayStrip(sel));
  if (planned && S.agenda) { const ag = agenda(sel); if (S.agendaFx) { ag.classList.add("open-in"); S.agendaFx = false; } out.push(ag); }
  if (isToday && done.length) { left.push(tomorrowCard()); right.push(didCard(done[0])); }
  left.push(planned && weekCard(), rhythmSays(), isToday && morningCard(w), isToday && reviewCard());
  right.push(headingCard(), planRows());
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
// ← and →: the day before or after, within the weeks Today shows (last week to the end of next)
function stepDay(k) {
  const lo = addDays(mondayOf(TODAY), -7), hi = addDays(mondayOf(TODAY), 13), d = addDays(S.dayAt ?? TODAY, k);
  if (d >= lo && d <= hi && (rhythmOn() || myPlan())) lookAt(d);
}
// when Rhythm (or the plan) began: a day before it wasn't planned, so it's neither a session nor missed (todaycalc.js
// dayKindOf), though Rhythm works its week out from the Monday
const beganOn = () => (rhythmOn() ? startOfDay(S.rhythm.at ?? S.rhythm.start ?? 0) : myPlan() ? planStart() : Infinity);
// what's on a day: Rhythm's (or the plan's) session, as changed; null for rest, or a day before it began
const idOn = (d) => { const id = d >= beganOn() ? plannedOn(d) : null; return id ?? null; };
// a ride's colour by how hard it is (todaycalc.js), a run's or swim's the tint
const toneOfW = (w) => (!w || w.sport !== "ride" ? "tint" : TC.toneOfIF(measure(w, paceFor(w.sport)).iF));
// The day strip: the week, a day each (its date, and a ring: ridden, to come in its colour, missed, or rest); a tap
// looks at it. The weeks either side, and both weeks as a list, a tap away.
function dayStrip(sel) {
  const mon = mondayOf(sel), began = beganOn();
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
      return h("button.sday" + (d === sel ? ".on" : "") + (d === TODAY ? ".today" : ""), { type: "button", "data-k": "day", "data-day": dayStamp(d), vars: d === sel ? { "view-transition-name": "sday-on" } : null, "aria-pressed": String(d === sel), "aria-label": `${dayLong(d)}: ${r.name}${r.kind === "did" ? ", ridden" : r.kind === "missed" ? ", missed" : ""}`, onclick: () => lookAt(d) },
        h("small", { text: dayName(d).slice(0, 3).toUpperCase() }), h("b", { text: new Date(d).getDate() }), svgOf(`<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">${r.svg}</svg>`)); })));
}
// On a computer, both weeks as one grid (this week and next, or last and this when looking back): each day what's on it,
// its shape and how it went, a click to look at it, and a session dragged to another day to move it there (Rhythm's
// days ahead, the week as it'd then be shown before it's kept: plan.js moveView)
let dragFrom = null;
const dragDone = () => { scr()?.classList.remove("day-drag"); if (redraw.later) { redraw.later = false; redraw(); } };
// (and should a drag end without saying so, the next click or key ends it)
function weekGrid(sel) {
  const thisMon = mondayOf(TODAY), first = mondayOf(sel) < thisMon ? addDays(thisMon, -7) : thisMon, began = beganOn();
  const ahead = new Set((rh()?.days || []).map((x) => x.date).filter((d) => d > TODAY));
  const movable = (d) => rhythmOn() && d >= TODAY && !actsOn(d).length && !!idOn(d) && idOn(d) !== "event";
  const cell = (d) => {
    const id = idOn(d), w = id && id !== "event" ? wkById(id) : null, did = actsOn(d), m = w ? measure(w, paceFor(w.sport)) : null;
    const kind = TC.dayKindOf({ day: d, today: TODAY, began, id, did: did.length }), later = unplanned(d) && !did.length;
    const title = later ? "Not planned yet" : did.length ? did[0].name : w ? w.name : id === "event" ? "Event" : "Rest";
    const sub = later ? "Planned nearer the time" : did.length ? `${did.length > 1 ? `${did.length} activities · ` : ""}${hmOf(did.reduce((a, x) => a + (sumOf(x)?.moving || 0), 0))}`
      : w ? `${hmOf(m.secs)}${kind === "missed" ? " · missed" : ""}` : id === "event" ? plan()?.name || "Your event" : d < TODAY ? "Rested" : d === TODAY ? "Let it sink in" : "";
    const drag = movable(d) && {
      draggable: "true",
      ondragstart: (e) => { dragFrom = d; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", w ? w.name : "Session"); e.currentTarget.classList.add("dragging"); scr()?.classList.add("day-drag"); },
      ondragend: (e) => { dragFrom = null; e.currentTarget.classList.remove("dragging"); scr()?.querySelectorAll(".gday.drop-on").forEach((x) => x.classList.remove("drop-on")); dragDone(); },
    };
    const target = {
      ondragover: (e) => { if (dragFrom == null || dragFrom === d || !ahead.has(d)) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; e.currentTarget.classList.add("drop-on"); },
      ondragleave: (e) => e.currentTarget.classList.remove("drop-on"),
      ondrop: (e) => { if (dragFrom == null || !ahead.has(d)) return; e.preventDefault(); const from = dragFrom; dragFrom = null; dragDone(); ctx.open.move(from, d); },
    };
    return h("button.gday" + (d === sel ? ".on" : "") + (d === TODAY ? ".today" : "") + (did.length ? ".did" : "") + (!w && !did.length && id !== "event" ? ".rest" : "") + (kind === "missed" ? ".missed" : "") + (d < TODAY ? ".past" : ""),
      { type: "button", "data-k": "day", "data-day": dayStamp(d), "aria-pressed": String(d === sel), "aria-label": `${dayLong(d)}: ${title}${sub ? `, ${sub}` : ""}`, onclick: () => lookAt(d), ...drag, ...target },
      h("small", { text: `${dayName(d).slice(0, 3)} ${new Date(d).getDate()}${d === TODAY ? " · today" : ""}` }), h("b", { text: title }), sub && h("em", { text: sub }),
      w && !did.length && !later && h("span.mini", {}, C.profile(w, { mini: true, ftp: w.sport === "ride" ? P().ftp : null, pace: paceFor(w.sport) })),
      did.length ? h("span.g-ok", {}, icon("check", 12, 3)) : null);
  };
  const week = (mon) => {
    const ds = Array.from({ length: 7 }, (_, i) => addDays(mon, i)), name = mon === thisMon ? "This week" : mon > thisMon ? "Next week" : "Last week";
    const planned = ds.reduce((a, d) => { const id = idOn(d), w = id && id !== "event" ? wkById(id) : null; return a + (w ? measure(w, paceFor(w.sport)).secs : 0); }, 0);
    const done = ds.reduce((a, d) => a + actsOn(d).reduce((b, x) => b + (sumOf(x)?.moving || 0), 0), 0);
    const said = mon > thisMon ? (planned ? `${dur(planned)} planned` : "") : done || planned ? `${dur(done)} done${planned && mon === thisMon ? ` of ${dur(planned)}` : ""}` : "";
    return h("div.wg-week", {}, h("h3", {}, name, said && h("span.aside", { text: said })), h("div.wg-days", {}, ds.map(cell)));
  };
  return h("nav.wgrid.glass", { "aria-label": "Two weeks" }, week(first), week(addDays(first, 7)));
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
  const id = idOn(day), w = id && id !== "event" ? wkById(id) : null, did = actsOn(day), past = day < TODAY, rd = rhythmOn() && day >= beganOn() ? rhDay(day) : null;
  if (did.length) return sessionCard(w, id, did, day);
  if (unplanned(day)) return h("div.card.hero.glass.session.rest", {}, heroTop(h("span.sport", {}, h("i.s-ride", {}, icon("calendar", 14, 2.2)), "Not planned yet"), "Planned nearer the time", null),
    h("p.about", { text: "Rhythm plans each day a week ahead, from what you’ve ridden and how you feel by then. Look again nearer the day." }));
  const restChip = h("span.sport", {}, h("i.s-walk", {}, icon("heart", 14, 2.2)), past ? "Rested" : "Rest day");
  if (!w && id !== "event") return h("div.card.hero.glass.session.rest", {}, heroTop(restChip, past ? "A rest day" : "Rest", null),
    h("p.about", { text: rd?.why || (past ? "Nothing recorded this day." : "Fitness is built while you recover.") }));
  if (id === "event") return h("div.card.hero.glass.session", {}, heroTop(h("span.sport", {}, h("i.s-ride", {}, sportIcon("ride", 14)), "Event day"), plan().name, null));
  const m = measure(w, paceFor(w.sport)), fig = (k, v) => h("div", {}, h("small", { text: k }), h("b", { text: v }));
  if (past) return h("div.card.hero.glass.session.missed", {}, heroTop(h("span.sport.miss", {}, h("i.s-" + w.sport, {}, sportIcon(w.sport, 14)), "Missed"), w.name, null),
    h("p.about", { text: rhythmOn() ? "Not ridden: Rhythm has taken it in, and the days after follow what you did." : "Not ridden." }));
  const changes = dayChanges(day, ctx.open);
  return h("div.card.hero.glass.session.ahead", {},
    heroTop(h("span.sport", {}, h("i.s-" + w.sport, {}, sportIcon(w.sport, 14)), `${SPORTS[w.sport].name} · ${w.kind}${mateOn(day) ? withChip(mateOn(day)) : S.swaps[day] !== undefined ? " · changed" : ""}`), w.name, null),
    mateOn(day) && h("p.with-mate", { text: withLine(mateOn(day)) }),
    h("div.hero-figs", {}, fig("Time", hmOf(m.secs)), w.sport !== "strength" && fig("Stress", String(Math.round(m.tss))), w.sport === "ride" && fig("Intensity", m.iF.toFixed(2))),
    h("div.profile", {}, C.profile(w, { ftp: w.sport === "ride" ? P().ftp : null, pace: paceFor(w.sport), label: `${w.name}, step by step`, W: cardW(true) })),
    rd && h("p.why", {}, h("b", { text: "Why: " }), S.swaps[day] !== undefined ? "you changed this day." : rd.why),
    changes.length > 0 && h("div.day-change", {}, h("small", { text: "Not the day for it?" }),
      h("div.chips", {}, changes.map((c) => h("button.chip-btn" + (c.key === "undo" ? ".undo" : ""), { type: "button", title: c.sub, onclick: c.run }, c.label)))),
    h("div.acts", {},
      w.sport !== "strength" && h("button.pill", { type: "button", onclick: () => ctx.open.sendDevice(w.id, day) }, icon("download", 17, 2.2), "Download"),
      h("button.pill", { type: "button", onclick: () => (rd ? ctx.open.session(day) : ctx.open.workout(w.id, day)) }, "Step by step")));
}
// Rhythm says: what it's noticed, and what it's done about it (up to three)
function rhythmSays() {
  if (!rhythmOn()) return null;
  const r = rh(), notes = [], rd = rhDay(TODAY), tw = rd?.id ? wkById(S.swaps[TODAY] !== undefined ? S.swaps[TODAY] : rd.id) : null, ready = readiness();
  const note = (tone, ic, title, text, act) => notes.push(h("div.say", {}, h("span.say-ic." + tone, {}, icon(ic, 16, 2.4)), h("span.tx", {}, h("b", { text: title }), h("small", { text: text }), act)));
  // (your night, from Garmin, where it's eased the day)
  if (rd?.night && !actsOn(TODAY).length) note("amber", "heart", "An easier day, from your night", `${rd.night[0].toUpperCase() + rd.night.slice(1)}: Rhythm keeps the ride and drops the intensity.`);
  // (FTP, where your rides say it's moved)
  const fs = r.ftpSeen;
  if (fs && fs.ftp !== P().ftp && isSet("ftp")) {
    const up = fs.ftp > P().ftp;
    note(up ? "green" : "amber", "bolt", `FTP ${up ? "up" : "down"} to about ${fs.ftp} W?`, fs.from === "cp" ? `Your best efforts from 2 to 20 minutes lately put it there, against the ${P().ftp} W set now.` : `Your best 20 minutes in six weeks puts it there, against the ${P().ftp} W set now.`,
      h("button.pill.small.primary.say-act", { type: "button", onclick: () => { setNumber("ftp", fs.ftp); resum(); redraw(); toast(`FTP set to ${fs.ftp} W`); } }, `Use ${fs.ftp} W`));
  }
  if (ready && tw && rd.hard && !actsOn(TODAY).length) {
    if (ready.v >= 80) note("green", "check", `Fresh for ${tw.name}`, `Readiness ${ready.v}: today’s hard day is well timed. Hold the targets from the start.`);
    else if (ready.v < 58) note("amber", "gauge", `Take ${tw.name} gently`, `Readiness ${ready.v}: ride the lower end of the targets, or swap it for an easier day below.`);
  } else if (ready && !tw && ready.v < 58) note("green", "heart", "A rest well timed", `Readiness ${ready.v}: today’s rest is just what’s needed.`);
  const mon = mondayOf(TODAY), from = startOfDay(S.rhythm.at ?? S.rhythm.start ?? mon);
  const missed = r.days.filter((d) => d.date >= mon && d.date >= from && d.date < TODAY && d.missed);
  if (missed.length) note("amber", "swap", missed.length === 1 ? `${dayName(missed[0].date)} missed` : `${missed.length} sessions missed`, "Rhythm has taken it in: the days ahead follow what you actually did, not what was planned.");
  const moved = r.days.find((d) => d.date >= TODAY && d.date < addDays(TODAY, 7) && d.moved);
  if (moved) note("blue", "calendar", `A rest day moved to ${dayName(moved.date)}`, "So the week still gets its hard days, with rest around them.");
  // (targets moved to what you've been holding)
  const said = [...(r.adjust?.said || [])].sort((x, y) => Math.abs(y.by) - Math.abs(x.by))[0];
  if (said) {
    const up = said.by > 0, by = `${Math.round(Math.abs(said.by) * 100)}%`, of = said.n === 1 ? `your last ${said.name} session` : `your last ${["", "", "two", "three"][said.n]} ${said.name} sessions`;
    note(up ? "green" : "amber", "gauge", `${said.name[0].toUpperCase() + said.name.slice(1)} targets ${up ? "up" : "down"} ${by}`,
      up ? `Every effort held in ${of}, and with room to spare: Rhythm has raised them to match.` : said.allHeld ? `Held, but only just, in ${of}: Rhythm has eased them a little.` : `Not every effort held in ${of}: Rhythm has eased them to what you’ve been riding.`);
  }
  // (your event: the day itself, and the taper before it)
  const ev = r.event, evName = ev ? ev.name || R.EVENTS[ev.kind].name.toLowerCase() : "";
  if (ev?.days === 0) note("green", "medal", "Today’s the day", "Warm up well, start steady, and eat and drink from the first hour. Enjoy it.");
  else if (ev && ev.days > 0 && ev.days <= 14 && notes.length < 3) note("indigo", "wave", `Tapering for ${evName}`, `Less riding, the intensity kept, so you arrive fresh: rest two days before, openers the day before.${ev.days <= 7 ? "" : " One more week of it."}`);
  else if (ev && ev.days > 14 && ev.days <= 42 && notes.length < 3) note("indigo", "trend", `Building for ${evName}`, `${plural(Math.round(ev.days / 7), "week")} to go: the sessions are shaped for it, then a two-week taper.`);
  if (notes.length < 3 && !(ev && ev.days >= 0 && ev.days <= 14)) {
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
    prefs && row({ icon: "calendar", tint: "blue", title: "Your week", sub: `${plural(nd, "day")}, ${dur(hrs * 60)}${prefs.run ? ", a run" : ""}${prefs.swim ? ", a swim" : ""} · ${prefs.mode === "hold" ? "holding" : "building"}`, onclick: () => ctx.open.rhythmSetup() }),
    prefs && row({ icon: "medal", tint: "green", title: "Riding towards", sub: prefs.event?.date >= TODAY ? `${prefs.event.name || R.EVENTS[prefs.event.kind].name}, ${new Date(prefs.event.date).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}` : "Nothing in particular: a sportive, a race or a time trial?", onclick: () => ctx.open.rhythmSetup("event") }),
    row({ icon: "list", tint: "indigo", title: "Workouts", sub: S.mine.length ? `The library, and ${plural(S.mine.length, "of your own", "of your own")}` : "The library, to ride any day", onclick: () => ctx.open.workouts() })));
}
// a length of time as a clock has it: 1:30
const hmOf = (s) => { const m = Math.round((s || 0) / 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`; };
// a section of Today: its title over it, as a heading, and what's said beside it
const todaySection = (title, aside, ...kids) => h("section.section.t-sec", {}, h("h3", {}, title, aside && h("span.aside", { text: aside })), ...kids);

// How ready you are, out of 100: your form, and how you said you are this morning. None till there are rides to go on.
function readiness() {
  if(S.rhythm?.engine===2)return null;
  if (!S.summed || !S.acts.some((a) => sumOf(a)?.tss)) return null;
  return TC.readinessOf(fitnessSeries().at(-1).tsb, S.feel[TODAY], R.nightOf(wellByDay(), TODAY));
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
const nextUp = (date, w) => h("button.next-up", { type: "button", onclick: () => ctx.open.workout(w.id) },
  h("span.tx", {}, h("small", { text: `Next · ${dayName(date)}` }), h("b", { text: w.name }), h("small", { text: metaOf(w) })),
  h("span.mini", {}, C.profile(w, { mini: true, ftp: w.sport === "ride" ? P().ftp : null, pace: paceFor(w.sport), label: `${w.name}, its shape` })), h("span.chev", {}, icon("chev", 15, 2.6)));

function sessionCard(w, id, done, day = TODAY) {
  // done: on its map, against what was planned (where it was the same sport); another day's, said as that day's
  if (done.length) {
    const a = done[0], s = sumOf(a), pl = w && w.sport === a.sport ? w : null, pt = pl ? Math.round(measure(pl, paceFor(pl.sport)).tss) : null;
    const fig = (k, v, u) => h("div", {}, h("small", { text: k }), h("b", {}, v, u && h("u", { text: u })));
    const third = s?.np ? fig("Norm. power", String(Math.round(s.np)), " W") : fig("Stress", s?.tss != null ? String(s.tss) : "–");
    const on = pl && s?.tss != null && pt ? (s.tss > pt * 1.1 ? "A bit more than planned" : s.tss < pt * 0.9 ? "A bit less: no matter" : "Right on target") : null;
    const bar = (k, v, max, cls) => h("div.vs-row", {}, h("small", { text: k }), h("span.vs-bar", {}, h("i." + cls, { vars: { width: Math.min(100, (v / max) * 100) + "%" } })), h("b", { text: String(v) }));
    const rec = newBest(a), ef = pl ? effortsNow(a) : null;
    return h("div.card.hero.glass.session.done", {},
      doneMap(a, day),
      heroTop(h("span.sport.ok", {}, h("i.s-" + a.sport, {}, icon("check", 14, 3)), pl ? "Done · as planned" : day === TODAY ? "Done today" : "Done"), pl ? pl.name : a.name, null),
      s && h("div.hero-figs", {}, fig("Time", hmOf(s.moving)), s.dist ? fig("Distance", dist(s.dist)) : fig("Stress", s.tss != null ? String(s.tss) : "–"), third),
      on && h("div.vs", {}, h("div.vs-head", {}, h("small", { text: "Training stress" }), h("small.ok", { text: on })),
        bar("Planned", pt, Math.max(pt, s.tss) * 1.08, "plan"), bar("Ridden", s.tss, Math.max(pt, s.tss) * 1.08, "done")),
      (rec || ef) && h("div.hero-chips", {}, rec && h("span.rec", {}, icon("medal", 14, 2.2), rec),
        ef && h("span.held" + (ef.held === ef.n ? ".ok" : ""), {}, icon(ef.held === ef.n ? "check" : "info", 14, 2.6), E.effortsSaid(ef))),
      h("div.acts", {}, h("button.pill", { type: "button", onclick: () => ctx.open.act(a.id) }, "See the ride", icon("chev", 15, 2.4)),
        day === TODAY && h("button.pill", { type: "button", "data-act": "send", onclick: () => sendToFriend(pl, a) }, sendIcon(), "Send to a friend")));
  }
  if (id === "event") {
    return h("div.card.hero.glass.session", {}, heroTop(h("span.sport", {}, h("i.s-ride", {}, sportIcon("ride", 14)), "Event day"), plan().name),
      h("p.about", { text: "This is what the weeks were for. Start steady, eat early, and enjoy it." }));
  }
  // (a plan made in Chat and added here: who it's with, from the account's agreed plans: invites.js)
  const mate = w ? withOffer(TODAY, S.swaps, S.offers) : null;
  if (!myPlan() && !rhythmOn() && !mate) return rhythmIntro();
  const rd = rhythmOn() && S.swaps[TODAY] === undefined ? rhDay(TODAY) : null;
  const restChip = h("span.sport", {}, h("i.s-walk", {}, icon("heart", 14, 2.2)), "Rest day");
  if (!w && rd) {
    const next = [1, 2, 3].map((n) => rhDay(addDays(TODAY, n))).find((x) => x?.id), nw = next && wkById(next.id);
    return h("div.card.hero.glass.session.rest", {}, heroTop(restChip, "Rest"), h("p.why", { text: rd.why }), rideAtRow(null), nw && nextUp(next.date, nw));
  }
  if (!w && myPlan() && TODAY < planStart()) {
    const first = weeks()[0].days.find((d) => d.id), fw = first && wkById(first.id);
    return h("div.card.hero.glass.session.rest", {},
      heroTop(h("span.sport", {}, h("i.s-ride", {}, icon("calendar", 14, 2.2)), "New plan"), `${plan().name} starts ${planStart() - TODAY < 7 * DAY ? dayName(planStart()) : dayShort(planStart())}`),
      h("p.about", { text: "Until then, ride as you like: easy miles are never wasted." }), rideAtRow(null), fw && nextUp(first.date, fw));
  }
  if (!w) {
    const next = [1, 2, 3].map((n) => addDays(TODAY, n)).find((d) => plannedOn(d));
    const nw = next && plannedOn(next) !== "event" ? wkById(plannedOn(next)) : null;
    return h("div.card.hero.glass.session.rest", {}, heroTop(restChip, "Rest"),
      h("p.about", { text: "Fitness is built while you recover. A walk is fine; anything harder can wait." }), rideAtRow(null), nw && nextUp(next, nw));
  }
  const m = measure(w, paceFor(w.sport)), swapped = S.swaps[TODAY] !== undefined;
  const fig = (k, v) => h("div", {}, h("small", { text: k }), h("b", { text: v }));
  return h("div.card.hero.glass.session.go", {},
    heroTop(h("span.sport", {}, h("i.s-" + w.sport, {}, sportIcon(w.sport, 14)), `${SPORTS[w.sport].name} · ${w.kind}${mate ? withChip(mate) : swapped ? " · swapped" : ""}`), w.name),
    mate && h("p.with-mate", { text: withLine(mate) }),
    h("div.hero-figs", {}, fig("Time", hmOf(m.secs)), w.sport !== "strength" && fig("Stress", String(Math.round(m.tss))), w.sport === "ride" && fig("Intensity", m.iF.toFixed(2))),
    h("div.profile", {}, C.profile(w, { ftp: w.sport === "ride" ? P().ftp : null, pace: paceFor(w.sport), label: `${w.name}, step by step`, W: cardW(true) })),
    rd ? h("p.why", {}, h("b", { text: "Why today: " }), whyToday(rd.why, w)) : h("p.about", { text: w.about }),
    rd && (rd.fuel || rd.strength) && h("div.extras", {},
      rd.fuel && h("span", {}, icon("bolt", 14, 2.2), `Fuel: ${rd.fuel}`),
      rd.strength && h("button.link.small", { type: "button", onclick: () => ctx.open.workout("strength-heavy") }, icon("strength", 14, 2.2), "Then heavy strength, 20 minutes")),
    // (the best time to ride: from the weather where you ride)
    (w.sport === "ride" || w.sport === "run") && bestTime(w),
    // (Ride At: the time of day you'll ride, for InFlite Today)
    rideAtRow(w),
    h("div.acts", {},
      w.sport !== "strength" && h("button.pill.primary", { type: "button", onclick: () => ctx.open.sendDevice(w.id, TODAY) }, icon("download", 17, 2.2), "Download"),
      h("button.pill", { type: "button", onclick: () => (rd ? ctx.open.session(TODAY) : ctx.open.workout(w.id, TODAY)) }, "Details"),
      // (a ride Today added: undone, so it isn't put back; any other swap: back to the plan's)
      swapped && (mate?.role === "today" ? h("button.pill", { type: "button", onclick: () => undoToday(ctx, mate) }, "Undo")
        : h("button.pill", { type: "button", onclick: () => { delete S.swaps[TODAY]; keep("swaps"); redraw(); } }, "Undo swap")),
      h("button.pill", { type: "button", "data-act": "send", onclick: () => sendToFriend(w, null) }, sendIcon(), "Send to a friend")),
    w.sport !== "strength" && dlFor(w, TODAY));
}
// a day's plan made in Chat, added (invites.js)
const mateOn = (day) => withOffer(day, S.swaps, S.offers);
// ---- Send to a friend: today's session, or what's done, as a card to Chat (send.js), which shows who it's for and
// tells them, when they open it, whether it got done. Nothing's asked of the account here: Chat makes the card's share
// id as the letter goes ----
const sendIcon = () => svgOf('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 3 10 14"/><path d="M21 3l-7 18-4-7-7-4z"/></svg>');
// (today's session, or what's done, as Send takes it: send.js sessionSendCard packed as packCard; instance.sendable)
function sendSpec(w, a) {
  const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (_) { return null; } })();
  const m = w ? measure(w, paceFor(w.sport)) : null, s = a ? sumOf(a) : null;
  const card = sessionSendCard({ day: TODAY, tz,
    w: w && { id: w.id, sport: w.sport, name: w.name, kind: w.kind, secs: m.secs, tss: w.sport !== "strength" ? m.tss : null },
    done: a && { sport: a.sport, name: a.name, secs: s?.moving ?? s?.secs ?? null, dist: s?.dist ?? null, tss: s?.tss ?? null },
    best: !a && w ? bestOf(w) : null });
  const words = card?.say || (w ? `Today: ${w.name}.` : "Trained today.");
  return { words, packed: card ? packCard(card) : null, what: w ? "today’s session" : "today’s ride" };
}
// (Chats' sheet over this page, the framework's send: the session as a card, its words first)
function sendToFriend(w, a) { ctx.fw.send(sendSpec(w, a)); }
// today's, for the header's Send (instance.sendable): the session planned, or the ride done; null on a rest day
export function sendableToday() {
  if (!S.me) return null;
  const id = plannedOn(TODAY), w = id && id !== "event" ? wkById(id) : null, a = actsOn(TODAY)[0] || null;
  if (!w && !a) return null;
  return sendSpec(a && w && w.sport !== a.sport ? null : w, a);
}
// ---- Ride At: the time of day you'll ride today, kept with your account (functions/_fittimes.js: PUT and DELETE
// /api/fitness/time), so InFlite Today plans the day around it (the weather you'll ride in, your calls, messages held
// while you ride). One Today set (Ride Then, or moved clear of a call) says so; one set here replaces it ----
const pad2 = (n) => String(n).padStart(2, "0");
const hhmm = (t) => { const d = new Date(t); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const phoneTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (_) { return "UTC"; } };
// (a day's ride time, as the account has it: GET me's times, by this phone's day key), or null
const rideTimeOn = (day) => (S.times || []).find((x) => x.day === dayStamp(day)) || null;
// The row on today's session: the time set, and who set it; or the way to set one (a ride's, or a time Today set: on a
// run's day or a rest day too, where Today set one, so it can be seen, changed or cleared here; w: null for a rest day)
function rideAtRow(w) {
  const t = rideTimeOn(TODAY);
  if (!t && w?.sport !== "ride") return null;
  return h("div.ride-at", {}, h("span.ic.blue", {}, icon("today", 16, 2.2)),
    h("span.tx", {}, h("b", { text: t ? `Ride at ${hhmm(t.start)}${t.source !== "set" ? " · from Today" : ""}` : "Ride at a time" }),
      h("small", { text: t ? `Till ${hhmm(t.stop)}. Today plans your day around it.` : "Set one, and Today plans your day around it." })),
    h("button.pill.small", { type: "button", onclick: () => openSheet(() => rideAtView(w), { sheet: "ride-at" }) }, t ? "Change" : "Ride At"));
}
// (the next five minutes on the clock, at or after a moment)
const nextFive = (t) => Math.ceil(t / 300e3) * 300e3;
function rideAtView(w) {
  const t = rideTimeOn(TODAY), secs = w ? measure(w, paceFor(w.sport)).secs : t ? (t.stop - t.start) / 1000 : 3600;
  const best = !t && w ? bestOf(w) : null, first = t ? t.start : best && best.start > Date.now() ? best.start : nextFive(Date.now() + 3600e3);
  const input = h("input.field.ride-at-time", { type: "time", step: 300, value: hhmm(first), "aria-label": "Starting at" });
  const set = async (btn) => {
    const [hh, mm] = String(input.value).split(":").map(Number);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return toast("Choose a time.", true);
    const d = new Date(TODAY), start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, Math.round(mm / 5) * 5).getTime();
    const len = Math.min(6 * 3600e3, Math.max(15 * 60e3, Math.round(secs / 300) * 300e3));
    btn.disabled = true;
    try {
      const r = await A.setTime({ day: dayStamp(TODAY), start, stop: start + len, tz: phoneTz() });
      S.times = [...(S.times || []).filter((x) => x.day !== r.time.day), r.time];
      closeSheet(); toast(`Ride at ${hhmm(start)}`); redraw();
    } catch (e) { btn.disabled = false; if (e.status === 401) return signedOutHere(); toast(e.message, true); }
  };
  const clear = async (btn) => {
    btn.disabled = true;
    try {
      await A.dropTime(dayStamp(TODAY));
      S.times = (S.times || []).filter((x) => x.day !== dayStamp(TODAY));
      closeSheet(); toast("No set time today"); redraw();
    } catch (e) { btn.disabled = false; if (e.status === 401) return signedOutHere(); toast(e.message, true); }
  };
  const setBtn = h("button.btn.ride-at-set", { type: "button", onclick: () => set(setBtn) }, t ? "Change the Time" : "Set the Time");
  const clearBtn = t && h("button.btn.quiet.ride-at-clear", { type: "button", onclick: () => clear(clearBtn) }, "No Set Time");
  return { title: "Ride At", body: [
    h("div.sheet-top", {}, h("h1", { text: "Ride At" }), h("div.sub", { text: w ? `${w.name} · ${dur(secs)}` : "Today’s ride" })),
    section(null, h("div.group", {}, h("label.row.plain", {}, h("span.tx", {}, h("b", { text: "Starting at" }), t && t.source !== "set" ? h("small", { text: "Set by Today" }) : null), input))),
    best && h("p.foot", { text: `Best time today: ${hhmm(best.start)} to ${hhmm(best.end)}.` }),
    h("p.foot", { text: "InFlite Today plans your day around it: the weather you’ll ride in, your calls, and messages held while you ride." }),
    setBtn, clearBtn] };
}
// the best time to go today, as the card shows it (bestTime): { start, end, dry } in real ms, or null (none good, or
// the made-up examples' day). From the ride weather already here, however old: sending asks nothing of the account
function bestOf(w) {
  if (w.sport !== "ride" && w.sport !== "run") return null;
  const d = S.wx?.d, b = d?.hours?.length ? BT.bestWindow(d, { secs: measure(w, paceFor(w.sport)).secs, sport: w.sport === "run" ? "run" : "ride" }) : null;
  return b && b.rating !== "Poor" ? { start: b.start, end: b.end, dry: !!b.dry && b.pop < 30 } : null;
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
// Today's why, with the weather's own say: a day Rhythm counts as wet (most of its riding hours) that has a dry spell
// after all, says so, so the two don't disagree
function whyToday(why, w) {
  if (!/Rain for much of the day/.test(why)) return why;
  const d = rideWx(), b = d?.hours?.length ? BT.bestWindow(d, { secs: measure(w, paceFor(w.sport)).secs, sport: w.sport === "run" ? "run" : "ride" }) : null;
  if (!b || !b.dry || b.pop >= 30 || b.rating === "Poor") return why;
  const at = (t) => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(t + (d.offset || 0) * 1000));
  return `${why}, or ride the dry spell, ${at(b.start)} to ${at(b.end)}`;
}
// today's ride on its map (kept between redraws, so the map isn't made again each time the page is)
let todayMap = null;
function doneMap(a, day = TODAY) {
  if (!(sumOf(a)?.route || a.sample) || (mapsAlways() && !M.able())) return null;
  // (one whose file couldn't be had, offline say: no map, rather than an empty box, till you're back online)
  if (todayMap?.id === a.id && todayMap.failed) return null;
  // (unless its map was let go meanwhile, with the screen away and a sheet closed: map.js sweep; its name as the day it's
  // now looked at from has it, today's ride being yesterday's once the day's moved on)
  const label = `${day === TODAY ? "Today" : dayName(day)}’s route: open the ride`;
  if (todayMap?.id === a.id && !M.lost(todayMap.el)) { todayMap.el.setAttribute("aria-label", label); return todayMap.el; }
  todayMap?.g?.remove();
  const el = h("div.done-map", { role: "button", tabindex: "0", "aria-label": label, onkeydown: (e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.currentTarget.click(); } }, onclick: () => ctx.open.act(a.id) }, mapsAlways() ? mapCredit() : null);
  todayMap = { id: a.id, el, g: null };
  (async () => {
    const x = await load(a);
    if (!x?.s?.lat?.some((v) => v != null)) throw 0;
    const ps = perSecond(x), roll = ps.pwr ? rollAvg(ps.pwr, 30) : null;
    const zoneAt = roll ? (i) => zoneOf((roll[Math.min(roll.length - 1, Math.round(x.s.t[i]))] || 0) / P().ftp).c : null;
    if (!mapsAlways()) { el.classList.add("drawn"); el.replaceChildren(C.route(x.s, zoneAt, cardW(), U.metric).el); return; }
    const g = await M.routeMap(el, { ...routeOf(x.s, zoneAt), light: lightNow() });
    if (todayMap?.el === el) todayMap.g = g; else g.remove();
  })().catch(() => { el.remove(); if (todayMap?.el === el) todayMap = { id: a.id, failed: true }; });
  return el;
}
// The efforts of a ride against the session it was for (fitness/efforts.js): the session planned on its day, of its
// sport (rides, with power); kept once worked out, the file read for it once, and the page drawn again when it's said
// (and kept with the ride, for Rhythm to set its targets by: rhythm.js adjustments; the kind of session from its id)
function keepEfforts(a, figs) {
  if (!figs.efforts || sumOf(a)?.efforts === figs.efforts && sumOf(a)?.effFtp === figs.effFtp) return;
  a.sum = { ...(a.sum || {}), ...figs }; const s = sumOf(a); if (s) S.sums.set(a.id, { ...s, ...figs });
  if (S.me) A.addFigures(a.id, figs).catch(() => {});
}
const effortsSeen = new Map();
function effortsNow(a) {
  if (effortsSeen.has(a.id)) return effortsSeen.get(a.id);
  effortsSeen.set(a.id, null);
  if (sessionOf(a)) load(a).then((x) => { const e = effortsOf(a, x); effortsSeen.set(a.id, e); if (e) { keepEfforts(a, effortFigs(a, x)); redraw(); } }).catch(() => {});
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
  return h("button.card.glass.tomorrow", { type: "button", onclick: () => ctx.open.day(d) },
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
// The week: hours ridden of what's planned, and how it's balanced, easy against hard (the strip has its days)
function weekCard() {
  const mon = mondayOf(TODAY), days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  const began = beganOn();
  const wOn = (d) => { const id = d >= began ? plannedOn(d) : null; return id && id !== "event" ? wkById(id) : null; };
  const rode = (d) => actsOn(d).reduce((a, x) => a + (sumOf(x)?.moving || 0), 0);
  // (the week's whole time: what's planned from when the plan began, and what you rode before it)
  const planSecs = days.reduce((a, d) => a + (d >= began ? (wOn(d) ? measure(wOn(d), paceFor(wOn(d).sport)).secs : 0) : rode(d)), 0), doneSecs = days.reduce((a, d) => a + rode(d), 0);
  const planned = days.filter((d) => wOn(d)).length;
  const available = rhythmOn() ? TC.weekAvailableSeconds(S.rhythm?.days || R.DEFAULTS.days) : null;
  const metric = (label, value) => h("div", {}, h("dt", { text: label }), h("dd", { text: dur(value) }));
  // (easy and hard: a hard session's hard part, about its first hour at 55%, as Rhythm reckons it)
  const hardSecs = days.reduce((a, d) => { const w = wOn(d); if (!w || w.sport !== "ride") return a; const m = measure(w, paceFor(w.sport)), hard = rhythmOn() && S.swaps[d] === undefined ? !!rhDay(d)?.hard : m.iF >= 0.84; return a + (hard ? Math.min(m.secs, 3600) * 0.55 : 0); }, 0);
  const easy = planSecs ? Math.round(100 * (1 - hardSecs / planSecs)) : 100;
  return todaySection("This week", planned ? `${planned} planned ${planned === 1 ? "day" : "days"}` : null, h("div.card.glass.week-card", {},
    h("dl.week-overview" + (available == null ? ".two" : ""), { "aria-label": "Weekly training time" }, available != null && metric("Available", available), metric("Planned", planSecs), metric("Completed", doneSecs)),
    planSecs > 0 && h("div.week-bar", { role: "img", "aria-label": `${dur(doneSecs)} completed of ${dur(planSecs)} planned` }, h("i", { vars: { width: Math.min(100, (doneSecs / planSecs) * 100) + "%" } })),
    planSecs > 0 && h("div.bal", { role: "img", "aria-label": `${easy}% easy, ${100 - easy}% hard this week` }, h("i.easy", { vars: { flex: String(easy) } }), h("i.hard", { vars: { flex: String(100 - easy) } })),
    planSecs > 0 && h("small.week-status", { text: `${easy}% easy · ${100 - easy}% hard` })));
}
// ---- Last night (rhythm.js nightOf): HRV, resting heart rate and sleep, from your Apple Watch or Garmin, each against
// your own usual, and what Rhythm made of it; tapped, the last two months and the rules ----
const hmN = (s) => `${Math.floor(s / 3600)} h ${String(Math.round((s % 3600) / 60)).padStart(2, "0")}`;
const capN = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const FROM = { apple: "From your Apple Watch", garmin: "From Garmin" };
// (today's night, else yesterday's, from wherever your nights come from)
function lastNight() {
  const src = nightsFrom();
  if (!src) return null;
  const w = wellByDay();
  for (const d of [TODAY, addDays(TODAY, -1)]) if (w[d]) return { day: d, n: R.nightOf(w, d), src };
  return null;
}
function nightVerdict(n) {
  if (n.trendLow && (n.hrvLow || n.rhrUp)) return ["amber", "Time for a rest", `${capN(n.said)}, after a week under your usual: Rhythm makes today a rest day.`];
  if (n.hrvLow || n.rhrUp) return ["amber", "Not quite recovered", `${capN(n.said)}.`];
  if (n.trendLow) return ["amber", "Under par all week", "HRV low most of this week: easy days until it recovers."];
  if (n.short || n.debt) return ["amber", "Short on sleep", `${capN(n.said)}.`];
  if (n.green) return ["green", "Recovered", "HRV and resting heart rate in your usual range, after a full night."];
  return n.lo || n.rb ? ["blue", "As usual", "Nothing out of the ordinary last night."] : ["blue", "Learning your usual", "Your first week establishes HRV and resting heart rate. Sleep counts from today."];
}
// This morning: last night (where your watch has it) and how you are, in one: the night's verdict and its three tiles
// (tapped, your nights in full), then the check-in, its sleep from your watch, so only legs and motivation are asked;
// once said, a line. With no nights, the check-in alone.
function morningCard(w) {
  const ln = lastNight();
  if (!ln) return feelCard(w);
  const { n, day } = ln, ser = nightsSeries(14), v = nightVerdict(n), rd = rhythmOn() ? rhDay(TODAY) : null, many = ser.filter((x) => x.hrv != null || x.sleep != null).length >= 2;
  const open = () => openSheet(nightsView, { sheet: "nights", tall: true });
  const tile = (cls, ic, label, val, unit, sub, tone, spark) => h("div.nt." + cls + (tone ? "." + tone : ""), {}, h("small", {}, icon(ic, 13, 2.4), label), h("b", {}, val, unit && h("u", { text: unit })), h("span.nt-sub", { text: sub }), many && spark);
  const hv = n.hrv != null, rr = n.rhr != null, sl = n.sleep != null;
  const effect = rd?.night ? "Today’s session eased for it" : rd?.green ? "Today’s hard session stands for it" : null;
  return todaySection("This morning", day !== TODAY ? "The night before" : null, h("div.card.glass.morning-card", {},
    h("button.nc-head", { type: "button", onclick: open, "aria-label": `Last night: ${v[1]}. ${v[2]} Your nights, in full` },
      h("span.nc-chip." + v[0], {}, icon(v[0] === "green" ? "check" : v[0] === "amber" ? "gauge" : "moon", 13, 2.6), v[1]), h("span.nc-more", {}, "Your nights", icon("chev", 14, 2.6))),
    h("p.nc-said", { text: v[2] }),
    h("button.nt-row" + (many ? "" : ".flat"), { type: "button", onclick: open, "aria-label": "Your nights, in full" },
      tile("hrv", "pulse", "HRV", hv ? String(Math.round(n.hrv)) : "–", hv ? " ms" : "", n.lo ? `usual ${Math.round(n.lo)}–${Math.round(n.hi)}` : "learning", hv && n.lo ? (n.hrvLow ? "low" : "ok") : "", C.nightSpark(ser.map((x) => x.hrv), { lo: n.lo, hi: n.hi, cls: "hrv" })),
      tile("rhr", "heart", "Resting", rr ? String(Math.round(n.rhr)) : "–", rr ? " bpm" : "", n.rb ? `usual ${Math.round(n.rb)}` : "learning", rr && n.rb ? (n.rhrUp ? "low" : "ok") : "", C.nightSpark(ser.map((x) => x.rhr), { cls: "rhr" })),
      tile("sleep", "moon", "Sleep", sl ? hmN(n.sleep) : "–", "", n.score ? `scored ${n.score}` : sl ? (n.sleep >= 7 * 3600 ? "a full night" : n.sleep >= 6 * 3600 ? "a little short" : "short") : "", sl ? (n.short || n.debt ? "low" : n.sleep >= 7 * 3600 ? "ok" : "") : "", C.nightSpark(ser.map((x) => x.sleep), { kind: "bars", cls: "sleep" }))),
    effect && h("div.nc-effect." + v[0], {}, icon("wave", 14, 2.4), effect),
    day === TODAY && h("div.mc-sep"),
    day === TODAY && feelCard(w, true)));
}
// ---- The week in review, on Sundays: what you rode against the plan, the efforts you held, your nights, how fitness
// and form moved, and what next week holds and why (Rhythm's next seven days) ----
function reviewCard() {
  if ((new Date(TODAY).getDay() + 6) % 7 !== 6 || !S.summed) return null;
  const mon = mondayOf(TODAY), days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  const began = beganOn();
  const planned = days.filter((d) => { const id = d >= began ? plannedOn(d) : null; return id && id !== "event"; });
  const done = days.filter((d) => actsOn(d).length), acts = days.flatMap((d) => actsOn(d));
  const secs = acts.reduce((t, a) => t + (sumOf(a)?.moving || 0), 0), planSecs = planned.reduce((t, d) => { const w = wkById(plannedOn(d)); return t + (w ? measure(w, paceFor(w.sport)).secs : 0); }, 0);
  const rows = [];
  const line = (ic, tint, title, text) => rows.push(h("div.rv-row", {}, h("span.ic." + tint, {}, icon(ic, 15, 2.3)), h("span.tx", {}, h("b", { text: title }), h("small", { text: text }))));
  // (rides against the plan)
  line("ride", "coral", planned.length ? `${done.length} of ${planned.length} ${planned.length === 1 ? "session" : "sessions"} ridden` : `${plural(done.length, "day")} out`,
    planSecs ? `${dur(secs)} of ${dur(planSecs)} planned${planned.filter((d) => d < TODAY && !actsOn(d).length).length ? `; ${dayList(planned.filter((d) => d < TODAY && !actsOn(d).length))} missed` : ""}` : `${dur(secs)} in all`);
  // (the efforts held)
  const eff = acts.map((a) => sumOf(a)).filter((x) => x?.efforts > 0), held = eff.reduce((t, x) => t + (x.held || 0), 0), all = eff.reduce((t, x) => t + x.efforts, 0);
  if (all) line("bolt", held === all ? "green" : "amber", held === all ? `Every effort held: ${all} of ${all}` : `${held} of ${all} efforts held`, held === all ? `Across ${plural(eff.length, "session")}: Rhythm nudges the targets up when it’s easy.` : "Rhythm sets the next ones to what you’ve been holding.");
  // (your nights)
  const well = wellByDay(), nights = days.map((d) => well[d]).filter(Boolean);
  if (nights.length >= 3) {
    const avg = (k) => { const xs = nights.map((n) => n[k]).filter((v) => v > 0); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
    const hv = avg("hrv"), sl = avg("sleep"), n = R.nightOf(well, days.filter((d) => well[d]).at(-1));
    line("moon", n?.trendLow ? "amber" : "indigo", sl ? `${hmN(sl)} a night` : "Your nights", [hv && `HRV ${Math.round(hv)} on average${n?.lo ? (hv < n.lo ? ", under your usual" : ", in your usual range") : ""}`, n?.trendLow && "a week under par"].filter(Boolean).join(", ") || "From your watch");
  }
  // (fitness and form)
  const f = fitnessSeries(), at = (d) => f.find((x) => x.day === d) || f.at(-1), a0 = at(addDays(mon, -1)), a1 = f.at(-1), gain = Math.round(a1.ctl - a0.ctl);
  line("trend", gain >= 0 ? "blue" : "grey", `Fitness ${Math.round(a1.ctl)}, ${gain > 0 ? `up ${gain}` : gain < 0 ? `down ${-gain}` : "level"}`, `Form ${signed(a1.tsb)}: ${formSaid(a1.tsb).word.toLowerCase()} going into the week ahead.`);
  // (next week, with Rhythm: the hard days, and where the block's going)
  let next = null;
  if (rhythmOn()) {
    const r = rh(), ahead = r.days.filter((d) => d.date > TODAY && d.date <= addDays(TODAY, 7)), hard = ahead.filter((d) => d.hard || d.kind === "long" || d.kind === "event");
    const b = ahead[0]?.block, theme = b ? `${R.THEMES[b.theme]} block, ${b.absorb ? "a lighter week to let it sink in" : `week ${b.week + 1} of 4`}` : "";
    const hrs = ahead.reduce((t, d) => t + (d.mins || 0), 0);
    next = h("div.rv-next", {}, h("div.rv-next-top", {}, h("b", { text: "Next week" }), h("small", { text: `${dur(hrs * 60)} · ${theme}` })),
      h("div.rv-days", {}, hard.map((d) => { const w = wkById(S.swaps[d.date] !== undefined ? S.swaps[d.date] : d.id); return w && h("button.rv-day", { type: "button", onclick: () => lookAt(d.date) }, h("small", { text: dayShortName(d.date) }), h("b", { text: w.name })); })),
      ahead[0]?.block?.absorb ? h("small.rv-why", { text: "Recovery week after three weeks of training." }) : hard[0] && h("small.rv-why", { text: hard[0].why }));
  }
  return todaySection("Your week", `${dayShort(mon)} to ${dayShort(TODAY)}`, h("div.card.glass.review-card", {}, rows, next));
}
const dayShortName = (d) => new Date(d).toLocaleDateString("en-GB", { weekday: "short" });
const dayList = (ds) => { const n = ds.map((d) => new Date(d).toLocaleDateString("en-GB", { weekday: "long" })); return n.length > 1 ? `${n.slice(0, -1).join(", ")} and ${n.at(-1)}` : n[0] || ""; };
// Your nights, in full: the last two months, what Rhythm does with them (today's in colour), and where they come from
function nightsView() {
  const src = nightsFrom(), ser = nightsSeries(60), n = lastNight()?.n, had = ser.filter((x) => x.hrv != null || x.rhr != null || x.sleep != null).length;
  const both = (S.health?.well?.length || 0) > 0 && (S.garmin?.well?.length || 0) > 0;
  const rule = (on, tint, ic, t, sub) => h("div.row.plain.n-rule" + (on ? ".on" : ""), {}, h("span.ic." + (on ? tint : "grey"), {}, icon(ic, 16, 2.2)), h("span.tx", {}, h("b", { text: t }), h("small", { text: sub })), on && h("span.val.n-today", { text: "Today" }));
  const opts = [["auto", "Automatic"], ["apple", "Apple Watch"], ["garmin", "Garmin"]], cur = S.nightsFrom || "auto", at = opts.findIndex(([k]) => k === cur);
  return { title: "Your nights", body: [
    h("div.sheet-top", {}, h("h1", { text: "Your nights" }), h("div.sub", { text: src ? `${FROM[src]} · ${plural(had, "night")} in the last two months` : "None yet" })),
    had > 1 ? card("nights-big", null, C.nightsChart(ser, { W: sheetW() }), h("div.n-key", {}, h("span", {}, h("i.k-band"), "Your usual range"), h("span", {}, h("i.k-trend"), "The week’s average"), h("span", {}, h("i.k-short"), "Under six hours")))
      : card(null, null, h("p.line-said", { text: "Your nights draw here as they come in." })),
    section("What Rhythm does with them", h("div.group", {},
      rule(n?.hrvLow, "amber", "pulse", "HRV under its usual range", "Eases the day: the ride stays, the intensity goes."),
      rule(n?.trendLow, "amber", "trend", "HRV under its usual most of the week", "No hard days till it’s back; with a low night too, a rest day."),
      rule(n?.rhrUp, "amber", "heart", "Resting heart rate up 5 or more", "Eases the day, as heavy legs do."),
      rule(n?.short || n?.debt, "amber", "moon", "Under six hours, or three short nights", "Eases the day, unless your check-in says you slept well."),
      rule(n?.green, "green", "check", "A good night", "Usual HRV and resting heart rate, with seven hours’ sleep: hard training may continue further into fatigue."))),
    both && section("Nights from", h("div.seg.wide", { vars: { "--n": 3, "--at": at }, role: "group", "aria-label": "Nights from" }, opts.map(([k, l]) =>
      h("button", { type: "button", "aria-pressed": String(cur === k), onclick: () => { S.nightsFrom = k; keep("prefs"); Sheet.redraw(); redraw(); } }, l))),
      h("p.foot", { text: "Watch and Garmin HRV stay separate. Automatic uses the source with more nights this month." })),
    section(null, h("p.foot", { text: "Your baseline uses the past month, or Garmin’s HRV range when provided. Nights are read the next morning." })),
  ] };
}
// How you feel: sleep, legs and motivation, a tap each, there on the page; what Rhythm (or the plan) makes of it under
// them. Once said, folded to a line, opened again to change it.
const FEEL = [["sleep", "Sleep", "contrast", ["Poor", "OK", "Great"], ["Slept poorly", "slept OK", "slept well"]],
  ["legs", "Legs", "run", ["Heavy", "Normal", "Fresh"], ["heavy legs", "normal legs", "fresh legs"]],
  ["mood", "Motivation", "bolt", ["Low", "OK", "High"], ["low motivation", "motivation OK", "keen"]]];
// (a check-in half answered is for its own day: one left last night isn't carried into the morning's, newDay)
let feelDraft = {}, feelOpen = false, feelDay = null;
const feelToday = () => { if (feelDay !== TODAY) { feelDraft = {}; feelOpen = false; feelDay = TODAY; } };
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
  feelToday();
  const was = S.feel[TODAY], all = (f) => FEEL.every(([x]) => f?.[x] != null);
  try { localStorage.setItem("fitness:asked", String(TODAY)); } catch (_) {}
  if (!all(was)) { const ws = watchSleep(); feelDraft = { ...(ws ? { sleep: ws.v } : {}), ...feelDraft, [k]: v }; if (!all(feelDraft)) return redraw(); }
  const before = rhythmOn() ? JSON.stringify([rhDay(TODAY)?.id, rhDay(addDays(TODAY, 1))?.id]) : null;
  S.feel[TODAY] = all(was) ? { ...was, [k]: v } : { ...feelDraft }; feelDraft = {}; keep("feel"); redraw();
  const after = rhythmOn() ? JSON.stringify([rhDay(TODAY)?.id, rhDay(addDays(TODAY, 1))?.id]) : null;
  if (!all(was) || after !== before) toast(before && after !== before ? "Rhythm has changed your plan to suit" : "Thanks: today stands");
}
function feelCard(w, inside = false) {
  feelToday();
  const f = S.feel[TODAY] || {}, done = FEEL.every(([k]) => f[k] != null), ws = !done && watchSleep(), cur = done ? f : { ...(ws ? { sleep: ws.v } : {}), ...feelDraft }, v = done && verdictOf(w);
  // (inside the morning card, the night's tiles have sleep: asked only once you open it again to change it)
  const box = inside ? "div.checkin.mc-check" : "div.card.glass.checkin", rows = FEEL.filter(([k]) => !(inside && ws && k === "sleep"));
  if (done && !feelOpen) {
    return h(box + ".done", {},
      h("span.ic." + v[0], {}, icon(v[1], 18, 2.4)),
      h("div.tx", {}, h("b", { text: v[2] }), h("small", { text: FEEL.map(([k, , , , said], i) => (i ? said[f[k]] : said[f[k]].charAt(0).toUpperCase() + said[f[k]].slice(1))).join(" · ") })),
      h("button.pill.small", { type: "button", onclick: () => { feelOpen = true; redraw(); }, "aria-label": "Change how you are today" }, "Change"));
  }
  return h(box + ".open", {},
    h("div.checkin-head", {}, h("b", { text: inside && ws ? "And how are you?" : "How are you this morning?" }), done && h("button.checkin-done", { type: "button", onclick: () => { feelOpen = false; redraw(); } }, "Done")),
    rows.map(([k, label, ic, words]) => h("div.checkin-row", {},
      h("span.lab", {}, h("span.ico", {}, icon(ic, 14, 2.3)), h("span.lt", { text: label })),
      h("div.seg3", { role: "group", "aria-label": label }, words.map((word, i) =>
        h("button.t" + i, { type: "button", vars: cur[k] === i ? { "view-transition-name": `seg-${k}` } : null, "aria-pressed": String(cur[k] === i), onclick: () => morph("feel", () => setFeel(k, i)) }, word))))),
    v ? h("div.checkin-said." + v[0], {}, h("span.cs-ic", {}, icon(v[1], 15, 2.8)), h("span.cs-tx", {}, h("b", { text: v[2] }), v[3] && h("small", { text: v[3] }))) :
      ws && h("small.checkin-hint", { text: ws ? (inside ? `Sleep’s from your ${ws.watch}: two taps for the rest.` : `Sleep’s from your ${ws.watch} (${ws.hm}): change it if it’s wrong. Two taps for the rest.`) : "" }));
}
// (sleep, from your watch where last night's in: seven hours or more, or a score of 80, slept well; six, or 60, OK)
function watchSleep() {
  const ln = lastNight();
  if (!ln || ln.day !== TODAY || (ln.n.sleep == null && ln.n.score == null)) return null;
  const n = ln.n, v = n.score != null ? (n.score >= 80 ? 2 : n.score >= 60 ? 1 : 0) : n.sleep >= 7 * 3600 ? 2 : n.sleep >= 6 * 3600 ? 1 : 0, watch = ln.src === "apple" ? "Apple Watch" : "Garmin";
  const hm = n.sleep != null ? hmN(n.sleep) : `scored ${n.score}`;
  return { v, watch, hm, said: `${hm}, from your ${watch}` };
}
// The day's check-in: sleep, legs and motivation, a tap each; with Rhythm, today and the days after follow it
function openCheckIn() {
  const ws = watchSleep(), f = { ...(ws && !S.feel[TODAY] ? { sleep: ws.v } : {}), ...(S.feel[TODAY] || {}) };
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
      h("div.checkin-q", {}, h("b", {}, "How did you sleep?", ws && h("span.from-watch", { text: ws.said })), seg("sleep", [[0, "Poorly"], [1, "OK"], [2, "Well"]])),
      h("div.checkin-q", {}, h("b", { text: "How are your legs?" }), seg("legs", [[0, "Heavy"], [1, "Normal"], [2, "Fresh"]])),
      h("div.checkin-q", {}, h("b", { text: "How motivated are you?" }), seg("mood", [[0, "Low"], [1, "OK"], [2, "High"]])),
      h("button.btn", { type: "button", disabled: !all, onclick: save }, "Done")] };
  };
  openSheet(view, { sheet: "checkin" });
}
// (asked once a day, as the app opens or comes back, while you're on Rhythm and haven't said)
function askToday() {
  if (!rhythmOn() || S.ask === false || S.feel[TODAY] || sheetEl.open) return;
  try { if (localStorage.getItem("fitness:asked") === String(TODAY)) return; } catch (_) {}
  setTimeout(() => { if (!sheetEl.open && !S.feel[TODAY]) openCheckIn(); }, 700);
}

// Rhythm, before it's set up (plan.js rhythmIntro): an example week, what it does, and Set up
function rhythmIntro(wk = [[0, "z1"], [44, "z4"], [30, "z2"], [40, "z6"], [0, "z1"], [62, "z2"], [36, "z2"]], feature = (ic, tint, b, t) => h("div.rh-feat", {}, h("span.ic." + tint, {}, icon(ic, 16, 2.2)), h("div", {}, h("b", { text: b }), h("span", { text: t })))) {
  return h("div.card.hero.glass.rhythm-intro", {},
    h("div.rh-brand", {}, h("span.tile.s-ride", {}, icon("wave", 18, 2.2)), h("span", { text: "Rhythm" })),
    h("h2", { text: "Training that fits your day" }),
    h("div.rh-example", { "aria-label": "An example week" },
      h("div.rh-ex-head", {}, h("span", { text: "A week, for example" }), h("span", { text: "6 h 30" })),
      h("div.rh-ex-bars", {}, wk.map(([v, z], i) => h("div", {}, h("i.bg-" + z + (v ? "" : ".rest"), { vars: { "--h": Math.max(6, v) + "px" } }), h("small", { text: "MTWTFSS"[i] })))),
      h("div.rh-ex-key", {}, [["z2", "Easy"], ["z4", "Threshold"], ["z6", "VO₂ max"], ["z1", "Rest"]].map(([z, l]) => h("span", {}, h("i.bg-" + z), l)))),
    feature("today", "blue", "Fits your week", "The days you ride, and for how long."),
    feature("heart", "green", "Listens to you", "Poor sleep eases the intensity."),
    feature("swap", "indigo", "Never goes stale", "Four-week blocks with recovery."),
    h("button.btn", { type: "button", onclick: () => ctx.open.rhythmSetup() }, "Set up Rhythm"),
    h("p.rh-note", { text: "Four questions, about a minute" }));
}
// (under a Download button: which device it's for, and another a tap away: plan.js dlFor)
function myDevice() {
  const k = store.get("device", null);
  if (k?.brand === "garmin" || k?.brand === "wahoo") return k;
  const d = S.own.find((a) => /garmin|wahoo/i.test(a.device || ""));
  return d ? { brand: /wahoo/i.test(d.device) ? "wahoo" : "garmin", name: d.device } : null;
}
function dlFor(w, day) {
  const dev = myDevice();
  return dev && h("p.dl-for", {}, `For your ${dev.name || (dev.brand === "wahoo" ? "Wahoo" : "Garmin")} · `, h("button.link.small", { type: "button", onclick: () => ctx.open.sendDevice(w.id, day) }, "Another device?"));
}
// The first use, until you've set up (S2-D7, §2.2): how your rides come in, your days, your numbers
function firstUse() {
  if (S.onboarded || S.rhythm || S.own.length || S.garmin?.on || S.strava?.on) return null;
  return card("first-use", "Getting started", h("div.group", {},
    row({ icon: "device", tint: "teal", title: "How your rides come in", sub: "Garmin, Strava or Apple Health", onclick: () => ctx.open.settings("devices") }),
    row({ icon: "calendar", tint: "blue", title: "Your days", sub: "When you ride, and for how long", onclick: () => ctx.open.rhythmSetup() }),
    row({ icon: "bolt", tint: "coral", title: "Your numbers", sub: "FTP, weight and heart rate", onclick: () => ctx.open.settings("numbers") })));
}

// ---- the section ----
// view(el, ctx): Today drawn into its section; drawn again on core's events while it shows (fitness.js)
export function view(el, ctx) {
  use(ctx);
  const doc = el.ownerDocument, win = doc.defaultView;
  // (should a drag end without saying so, the next click or key ends it; back online, a ride's map tried again):
  // listened for only while the section shows, added in draw() and taken off in hide() and destroy() (§4.1, S2-D4)
  const endDrag = () => { if (scr()?.classList.contains("day-drag")) dragDone(); };
  const online = () => { if (todayMap?.failed) { todayMap = null; if (S.me && on) redraw(); } };
  let on = false, listening = false;
  const listen = () => {
    if (listening) return;
    listening = true;
    win.addEventListener("pointerdown", endDrag, true); win.addEventListener("keydown", endDrag, true); win.addEventListener("online", online);
  };
  const unlisten = () => {
    if (!listening) return;
    listening = false;
    win.removeEventListener("pointerdown", endDrag, true); win.removeEventListener("keydown", endDrag, true); win.removeEventListener("online", online);
  };
  setAsk(() => askToday());
  return {
    draw() {
      // (shown again: a map that failed, maybe while offline and hidden, is tried again once)
      if (!on && todayMap?.failed) todayMap = null;
      on = true; listen();
      if (scr()?.classList.contains("day-drag")) { redraw.later = true; return; }
      const fu = firstUse();
      el.replaceChildren(h("div.screen.t-today", {}, fu, todayView()));
    },
    // (on screen again with nothing new: listening again, the day left as it was drawn)
    resume() { if (todayMap?.failed) { todayMap = null; on = true; listen(); this.draw(); return; } on = true; listen(); },
    hide() { on = false; unlisten(); dragDone(); },
    destroy() {
      unlisten();
      setAsk(null); todayMap?.g?.remove?.(); todayMap = null; effortsSeen.clear(); el.replaceChildren(); use(null); on = false;
    },
  };
}

export { askToday, effortsCard, effortsSeen, lookAt, nightsView, stepDay, todayView, rhythmIntro, dlFor };
