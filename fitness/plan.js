// Fitness's Plan: Rhythm (rhythm.js) on its tab, where you are in the block and the days ahead, each day's session,
// changing one, and setting Rhythm up; the plans, workouts and their sheets. Drawn by app.js render.

import { A, C, DAY, F, P, PLANS, R, S, SPORTS, Sheet, TODAY, U, WORKOUTS, ZONES, actsOn, addDays, calendar, card, cardW, choosePlan, closeSheet, dateShort, dayLetter, dayLong, dayName, dayShort, dist, dur, eventDay, fitness, flatten, full, go, h, head, icon, isSet, keep, layOut, measure, missed, mondayOf, myPlan, numbers, openSheet, pace, paceFor, pct, plan, planStart, plannedOn, plural, pushSheet, redraw, rh, rhDay, rhythmOn, row, runSpeed, saveFile, section, sheetEl, sheetW, sportTile, startOfDay, stepLen, stepper, store, sumOf, svgOf, swimSpeed, toast, weekIndex, weekZip, weeks, weight, wkById, workoutById, zoneOf } from "./app.js";
import { actRow, openAct, zoneBars } from "./activities.js";

// ---- Plan ----
function planView() {
  if (rhythmOn()) return rhythmView();
  if (!myPlan()) return noPlanView();
  const p = plan(), ws = weeks(), now = Math.max(0, Math.min(ws.length - 1, weekIndex(TODAY))), ev = eventDay(), left = Math.round((ev - TODAY) / DAY);
  const planWeekTss = ws.map((w) => ({ phase: w.phase, tss: w.days.reduce((a, d) => a + (d.id && d.id !== "event" ? measure(wkById(d.id), paceFor(wkById(d.id).sport)).tss : 0), 0) }));
  const doneWeek = ws.map((w) => w.days.reduce((a, d) => a + actsOn(d.date).reduce((x, act) => x + (sumOf(act)?.tss || 0), 0), 0));
  const phaseCls = { Base: "z2", Build: "z4", Peak: "z5", Taper: "z3" };
  const out = [head("Plan", TODAY < planStart() ? `${p.name} · starts ${dayShort(planStart())}` : `${p.name} · week ${now + 1} of ${p.weeks}`)];
  out.push(h("div.card.hero.glass", {},
    h("h3", {}, "Your goal"),
    h("div.countdown", {}, h("b", { text: left > 0 ? left : "Today" }), h("span", { text: left > 0 ? `days to ${p.name.toLowerCase().includes("sportive") ? "your sportive" : "the end"}, ${dayShort(ev)}` : "" })),
    h("div.phases", {}, p.phases.map(([name, n]) => h("i.bg-" + phaseCls[name], { vars: { flex: n } }))),
    h("div.phase-names", {}, p.phases.map(([name, n]) => h("span" + (ws[now].phase === name ? ".now" : ""), { vars: { flex: n }, text: name }))),
    h("div", { vars: { "margin-top": "16px" } }, C.planWeeks(planWeekTss, doneWeek, now, cardW(true))),
    h("p.line-said", { text: `${p.about} Week ${now + 1} is ${ws[now].recovery ? "an easier week, to recover" : ws[now].phase.toLowerCase()}.` })));
  const dayRows = (w) => w.days.map((d) => {
    const id = S.swaps[d.date] !== undefined ? S.swaps[d.date] : d.id, wk = id && id !== "event" ? wkById(id) : null, did = actsOn(d.date), past = d.date < TODAY;
    const m = wk ? measure(wk, paceFor(wk.sport)) : null;
    return h("button.row" + (d.date === TODAY ? ".today" : "") + (past ? ".past" : ""), { type: "button", onclick: () => openDay(d.date) },
      h("span.when", {}, h("b", { text: new Date(d.date).getDate() }), h("small", { text: d.date === TODAY ? "Today" : dayName(d.date).slice(0, 3) })),
      h("span.tx", {}, h("b", { text: id === "event" ? "Event day" : wk ? wk.name : "Rest" }), h("small", { text: wk ? `${dur(m.secs)}${wk.sport !== "strength" ? ` · TSS ${Math.round(m.tss)}` : ""}${S.swaps[d.date] !== undefined ? " · swapped" : ""}` : id === "event" ? p.name : "Recover" })),
      wk && h("span.mini", {}, C.profile(wk, { mini: true, pace: paceFor(wk.sport) })),
      did.length ? h("span.badge", {}, "Done") : missed(d.date, wk) ? h("span.badge.plan", {}, "Missed") : null);
  });
  const started = TODAY >= planStart(), wkName = (i) => (started ? (i === now ? "This week" : "Next week") : `Week ${i + 1}`);
  out.push(section([`${wkName(now)} · ${ws[now].phase}${ws[now].recovery ? " (easier)" : ""}`, h("span.aside", { text: `${dateShort(ws[now].days[0].date)} – ${dateShort(ws[now].days[6].date)}` })],
    h("div.group.glass", {}, dayRows(ws[now])),
    h("p.foot", {}, "Tap a day for its workout. Workouts go to your Garmin or Wahoo from there, or all of this week's at once below.")));
  if (ws[now + 1]) out.push(section([`${wkName(now + 1)} · ${ws[now + 1].phase}${ws[now + 1].recovery ? " (easier)" : ""}`, h("span.aside", { text: `${dateShort(ws[now + 1].days[0].date)} – ${dateShort(ws[now + 1].days[6].date)}` })], h("div.group.glass", {}, dayRows(ws[now + 1]))));
  out.push(section("This week’s files", h("div.group.glass", {},
    row({ icon: "zip", tint: "coral", title: started ? "Send this week’s workouts" : "Send week 1’s workouts", sub: "One zip: a FIT file for each, for your Garmin or Wahoo", onclick: () => weekZip(ws[now]) }),
    row({ icon: "calendar", tint: "red", title: "Add to your calendar", sub: "This week and next as events (.ics), with each workout in its notes", onclick: () => calendar([ws[now], ws[now + 1]].filter(Boolean)) }))));
  out.push(plansList(p.id));
  if (S.chosen) out.push(section(null, h("div.group.glass", {}, h("button.row.action.danger", { type: "button", onclick: () => { S.chosen = null; S.swaps = {}; keep("plan", "swaps"); toast(S.rhythm ? "Back to Rhythm" : "Plan stopped"); redraw(); } }, S.rhythm ? "Stop, and go back to Rhythm" : "Stop this plan"))));
  if (!S.rhythm) out.push(section(null, h("div.group.glass", {}, row({ icon: "calendar", tint: "blue", title: "Switch to Rhythm", sub: "No event: a session or rest each day, all year", onclick: () => rhythmSetup() }))));
  return out;
}
const plansList = (current) => section("Plans", h("div.group.glass", {}, PLANS.map((x) => row({ icon: x.sport === "run" ? "run" : x.sport === "multi" ? "swim" : "ride", tint: x.id === current ? "coral" : "grey",
  title: x.name, sub: `${x.weeks} weeks · ${x.phases.map(([n]) => n).join(", ")}`, value: x.id === current ? "Yours" : null, onclick: () => openSheet(() => planSheet(x)) }))));
// no plan yet: Rhythm
function noPlanView() {
  // (an example week, drawn: what Rhythm gives you, before the words)
  const wk = [[0, "z1"], [44, "z4"], [30, "z2"], [40, "z6"], [0, "z1"], [62, "z2"], [36, "z2"]];
  const feature = (ic, tint, b, t) => h("div.rh-feat", {}, h("span.ic." + tint, {}, icon(ic, 16, 2.2)), h("div", {}, h("b", { text: b }), h("span", { text: t })));
  return [head("Plan", "Rhythm · not set up"), rhythmIntro(wk, feature)];
}
// Rhythm, before it's set up: an example week, what it does, and Set up
function rhythmIntro(wk = [[0, "z1"], [44, "z4"], [30, "z2"], [40, "z6"], [0, "z1"], [62, "z2"], [36, "z2"]], feature = (ic, tint, b, t) => h("div.rh-feat", {}, h("span.ic." + tint, {}, icon(ic, 16, 2.2)), h("div", {}, h("b", { text: b }), h("span", { text: t })))) {
  return h("div.card.hero.glass.rhythm-intro", {},
      h("div.rh-brand", {}, h("span.tile.s-ride", {}, icon("wave", 18, 2.2)), h("span", { text: "Rhythm" })),
      h("h2", { text: "A session or rest, decided each morning" }),
      h("div.rh-example", { "aria-label": "An example week" },
        h("div.rh-ex-head", {}, h("span", { text: "A week, for example" }), h("span", { text: "6 h 30" })),
        h("div.rh-ex-bars", {}, wk.map(([v, z], i) => h("div", {}, h("i.bg-" + z + (v ? "" : ".rest"), { vars: { "--h": Math.max(6, v) + "px" } }), h("small", { text: "MTWTFSS"[i] })))),
        h("div.rh-ex-key", {}, [["z2", "Easy"], ["z4", "Threshold"], ["z6", "VO₂ max"], ["z1", "Rest"]].map(([z, l]) => h("span", {}, h("i.bg-" + z), l)))),
      feature("today", "blue", "Fits your week", "The days you ride, and for how long."),
      feature("heart", "green", "Listens to you", "Slept badly? Today gets easier, not shorter."),
      feature("swap", "indigo", "Never goes stale", "Four-week blocks, a lighter week every fourth."),
      h("button.btn", { type: "button", onclick: () => rhythmSetup() }, "Set up Rhythm"),
      h("p.rh-note", { text: "Four questions, about a minute" }));
}
// ---- Rhythm, on the Plan tab: where you are in the block, the days ahead, and your week ----
// (where you are in Rhythm: counting down to your event, in its last twelve weeks; else the block and its week)
const rhythmSaid = () => {
  const r = rh(), b = r.block, ev = r.event;
  if (ev && ev.days >= 0 && ev.days <= 84) return `${ev.name || R.EVENTS[ev.kind].name} · ${ev.days === 0 ? "today" : ev.days < 14 ? `${plural(ev.days, "day")} to go` : `${plural(Math.round(ev.days / 7), "week")} to go`}`;
  return `${R.THEMES[b.theme]} block · ${b.absorb ? "lighter week" : `week ${b.week + 1} of 4`}`;
};
function rhythmView() {
  const r = rh(), b = r.block, prefs = { ...R.DEFAULTS, ...S.rhythm }, mon = mondayOf(TODAY), from = S.rhythm.at ?? S.rhythm.start ?? mon;
  const out = [head("Plan", rhythmSaid())];
  // this week at a glance: a circle a day (ridden, rested, today, missed, or what's planned), and how it's balanced
  const wk = r.days.filter((d) => mondayOf(d.date) === mon);
  const dot = (d) => {
    const did = actsOn(d.date).length > 0;
    if (d.date < from && !did) return ["pre", null];
    if (did) return ["done", icon("check", 14, 3)];
    if (d.date === TODAY) return ["today", h("i")];
    if (d.missed) return ["missed", h("i")];
    return d.id ? ["plan" + (d.hard ? ".hard" : ""), h("i")] : ["rest", "–"];
  };
  const doneMins = wk.reduce((a, d) => a + actsOn(d.date).reduce((x, act) => x + (sumOf(act)?.moving || 0) / 60, 0), 0);
  // (the week's whole time: what's planned from when Rhythm began, and what you rode before it)
  const rode = (d) => actsOn(d.date).reduce((x, act) => x + (sumOf(act)?.moving || 0) / 60, 0);
  const planMins = wk.reduce((a, d) => a + (d.date >= from ? d.mins : rode(d)), 0);
  const hardMins = wk.filter((d) => d.date >= from && d.hard).reduce((a, d) => a + Math.min(d.mins, 60) * 0.55, 0), easy = planMins ? Math.round(100 * (1 - hardMins / planMins)) : 100;
  out.push(h("div.card.glass.rh-week", {},
    h("div.rh-week-head", {}, h("b", { text: "This week" }), h("button.pill.small.tinted", { type: "button", onclick: () => rhythmSetup() }, icon("edit", 14, 2.4), "Your days")),
    h("div.rh-circles", {}, wk.map((d) => { const [cls, inner] = dot(d); return h("button" + (d.date === TODAY ? ".is-today" : ""), { type: "button", onclick: () => openDay(d.date), "aria-label": `${dayLong(d.date)}: ${cls === "done" ? "done" : d.id ? wkById(d.id)?.name : "rest"}` },
      h("small", { text: d.date === TODAY ? "TODAY" : dayName(d.date).slice(0, 3).toUpperCase() }), h("span.c." + cls.replace(".", "."), {}, inner), h("small.n", { text: new Date(d.date).getDate() })); })),
    h("div.rh-balance", {}, h("div.bar", { role: "img", "aria-label": `${easy}% easy, ${100 - easy}% hard this week` }, h("i.easy", { vars: { "--w": easy + "%" } }), h("i.hard", { vars: { "--w": 100 - easy + "%" } })),
      h("span", {}, h("b", { text: dur(doneMins * 60) }), ` of ${dur(planMins * 60)} done`))));
  // today, first
  const td = rhDay(TODAY), tw = td?.id ? wkById(S.swaps[TODAY] !== undefined ? S.swaps[TODAY] : td.id) : null, tdone = actsOn(TODAY);
  if (tdone.length) out.push(h("button.card.glass.rh-today.done", { type: "button", onclick: () => openAct(tdone[0]) }, h("span.rh-chip", {}, icon("check", 13, 3), "Today · done"), h("h2", { text: tdone[0].name }), h("p", { text: "Nice work. Tomorrow’s plan takes it in." })));
  else if (tw) {
    const m = measure(tw, paceFor(tw.sport));
    out.push(h("div.card.glass.rh-today", {},
      h("div.rh-today-top", {}, h("span.rh-chip", {}, sportTile(tw.sport, true), `Today · ${tw.kind}`), h("span", { text: `${dur(m.secs)}${tw.sport !== "strength" ? ` · TSS ${Math.round(m.tss)}` : ""}` })),
      h("h2", { text: tw.name }),
      h("div.profile", {}, C.profile(tw, { ftp: tw.sport === "ride" ? P().ftp : null, pace: paceFor(tw.sport), label: `${tw.name}, step by step`, W: cardW(true) })),
      h("p", { text: td.why }),
      (td.fuel || td.strength) && h("div.extras", {}, td.fuel && h("span", {}, icon("bolt", 14, 2.2), `Eat ${td.fuel}`), td.strength && h("span", {}, icon("strength", 14, 2.2), "Then 20 min strength")),
      h("div.acts", {}, tw.sport !== "strength" && h("button.pill.primary", { type: "button", onclick: () => download(tw) }, "Download"), h("button.pill", { type: "button", onclick: () => openSheet(() => sessionView(TODAY), { tall: true }) }, "Details"), h("button.pill", { type: "button", onclick: () => openDay(TODAY) }, "Change")),
      tw.sport !== "strength" && dlFor(tw, TODAY)));
  } else out.push(h("button.card.glass.rh-today.rest", { type: "button", onclick: () => openDay(TODAY) }, h("span.rh-chip", {}, icon("heart", 13, 2.4), "Today · rest"), h("h2", { text: "Rest, and let it sink in" }), h("p", { text: td?.why || "Fitness is built while you recover." })));
  // coming up: three days, the rest of the week ahead a tap away
  const ahead = r.days.filter((d) => d.date > TODAY), shown = S.planMore ? ahead : ahead.slice(0, 3);
  const rowOf = (d) => { const id = S.swaps[d.date] !== undefined ? S.swaps[d.date] : d.id, w = id ? wkById(id) : null;
    return h("button.row", { type: "button", onclick: () => openDay(d.date) }, h("span.when", {}, h("b", { text: new Date(d.date).getDate() }), h("small", { text: dayName(d.date).slice(0, 3) })),
      h("span.tx", {}, h("b", { text: w ? `${w.name}${d.strength ? " + strength" : ""}` : "Rest" }), h("small", { text: w ? `${dur(d.mins * 60)} · ${d.hard ? "hard" : "easy"}${d.moved ? " · rest day moved" : ""}` : d.why })),
      w && h("span.mini", {}, C.profile(w, { mini: true, pace: paceFor(w.sport) }))); };
  out.push(section(null, h("div.group.glass.rh-coming", {}, h("div.rh-week-head", {}, h("b", { text: "Coming up" })), shown.map(rowOf),
    ahead.length > 3 && h("button.row.action", { type: "button", onclick: () => { S.planMore = !S.planMore; redraw(); } }, S.planMore ? "Show fewer" : `Show the next ${ahead.length - 3} days`))));
  // where it's heading: the block's four weeks, and your fitness, with the week ahead as planned
  const line = r.line, lo = Math.min(...line.map((x) => x.ctl)), hi = Math.max(...line.map((x) => x.ctl)), span = Math.max(8, hi - lo), W = 320, H = 70;
  const pt = (x, i) => `${((i / (line.length - 1)) * W).toFixed(1)},${(H - 6 - ((x.ctl - lo) / span) * (H - 16)).toFixed(1)}`;
  const past = line.filter((x) => !x.future), cut = past.length - 1;
  const chart = svgOf(`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Your fitness, the last four weeks and the week ahead"><line x1="0" y1="${H - 1}" x2="${W}" y2="${H - 1}" class="rh-axis"/><polyline class="rh-line up" points="${past.map(pt).join(" ")}"/><polyline class="rh-line up ahead" points="${line.slice(cut).map((x, i) => pt(x, i + cut)).join(" ")}"/><circle cx="${pt(line[cut], cut).split(",")[0]}" cy="${pt(line[cut], cut).split(",")[1]}" r="4" class="rh-now"/></svg>`);
  const ramp = Math.max(1.5, 4.5 - r.ctl / 40);
  out.push(h("div.card.glass.rh-heading", {}, h("div.rh-week-head", {}, h("b", { text: "Where it’s heading" }), h("span", { text: prefs.mode === "hold" ? "Holding" : "Building" })),
    h("div.rb-weeks", {}, [0, 1, 2, 3].map((i) => h("div.rb-week" + (i === b.week ? ".now" : "") + (i < b.week ? ".past" : ""), {}, h("i.bg-" + (i === 3 ? "z1" : { aerobic: "z2", threshold: "z4", topend: "z6" }[b.theme])), h("small", { text: i === b.week ? "This week" : i === 3 ? "Lighter" : `Week ${i + 1}` })))),
    chart,
    h("p.line-said", { text: `${prefs.mode === "hold" ? "Holding your fitness where it is" : b.absorb ? "A lighter week, so the work sinks in" : `Up about ${Math.round(ramp)} points a week, then a lighter week so it sinks in`}. ${{ aerobic: "Steady riding and tempo first.", threshold: "Sweet spot and threshold now.", topend: "VO₂ max and sprints now." }[b.theme]}` })));
  const nd = prefs.days.filter((x) => x > 0).length, hrs = prefs.days.reduce((a, x) => a + x, 0);
  out.push(section(null, h("div.group.glass", {},
    row({ icon: "calendar", tint: "blue", title: "Your week", sub: `${plural(nd, "day")}, ${dur(hrs * 60)}${prefs.run ? ", a run" : ""}${prefs.swim ? ", a swim" : ""}`, onclick: () => rhythmSetup() }))));
  return out;
}
// A day's session in full: its shape, every step in order with the clock, the watts and how it should feel, time in
// each zone, when to eat, what follows it, and why it's today
const CUES = { warmup: "Spin up gradually; nothing hard yet.", cooldown: "Ease right off and spin the legs out.", rest: "Spin easy and let your breathing settle.",
  z1: "Very easy: barely pressing on the pedals.", z2: "Conversational: you could talk in full sentences.", z3: "Comfortably hard: steady pressure, breathing deep.",
  z4: "Hard but steady: a few words at a time. Even, not heroic.", z5: "As hard as you can hold for the whole effort. Breathing hard.", z6: "Very hard and short: everything but a sprint.", z7: "All out, from a rolling start." };
function sessionView(day) {
  const d = rhDay(day), id = S.swaps[day] !== undefined ? S.swaps[day] : d?.id, w = id ? wkById(id) : null;
  if (!w) return rhDayView(day);
  const m = measure(w, paceFor(w.sport)), ftp = P().ftp, ride = w.sport === "ride", steps = flatten(w, paceFor(w.sport));
  const clk = (sec) => `${Math.floor(sec / 3600)}:${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")}`;
  const watts = (x) => (x.from === x.to ? `${Math.round(x.from * ftp)} W` : `${Math.round(x.from * ftp)}–${Math.round(x.to * ftp)} W`);
  const zOf = (x) => (x.kind === "free" ? ZONES[1] : zoneOf((x.from + x.to) / 2));
  // Step by step: in its phases (warm up, the main set, cool down), each with its length and its clock; a run of the same
  // step, or two, three times or more said once ("13 × 30 s hard, 15 s easy"); each cue the first time it's needed;
  // the watts large, with their share of FTP, a ramp as it goes (163 → 234 W); the zone a coloured chip
  const lenOf = (x) => (x.metres ? stepLen(x) : dur(x.secs));
  const wattsOf = (x) => (x.from === x.to ? `${Math.round(x.from * ftp)} W` : `${Math.round(x.from * ftp)} → ${Math.round(x.to * ftp)} W`);
  const pctOf = (x) => (x.from === x.to ? `${pct(x.from)} FTP` : `${pct(x.from)} → ${pct(x.to)}`);
  const nameOf = (x) => (x.rep && x.kind === "work" ? `${x.name || "Effort"} ${x.rep[0]} of ${x.rep[1]}` : x.name || { warmup: "Warm up", cooldown: "Cool down", rest: "Easy", steady: "Steady" }[x.kind] || "Effort");
  const same = (p, q) => p.kind === q.kind && p.secs === q.secs && p.from === q.from && p.to === q.to && (p.name || "") === (q.name || "");
  const seen = new Set(), cueOf = (x) => { const c = x.note || (["warmup", "cooldown", "rest"].includes(x.kind) ? CUES[x.kind] : CUES[zOf(x).c]); if (!c || seen.has(c)) return null; seen.add(c); return c; };
  const zchip = (z) => ride && h("span.zchip", {}, h("i.bg-" + z.c), `Z${z.n} ${z.name}`);
  const when = (from, to) => h("span.ss-when", {}, h("span.ss-at", { text: clk(from) }), h("span.ss-end", { text: clk(to) }));
  const stepRow = (x, at) => {
    const z = zOf(x);
    return h("div.ss-step", {}, when(at, at + x.secs), h("i.bg-" + z.c),
      h("div.ss-tx", {}, h("b", { text: nameOf(x) }), h("small.ss-meta", {}, h("span", { text: lenOf(x) }), zchip(z), x.cad && h("span", { text: `${x.cad[0]}–${x.cad[1]} rpm` })), (() => { const c = cueOf(x); return c && h("small.cue", { text: c }); })()),
      ride && x.kind !== "free" ? h("span.ss-w", {}, h("b", { text: wattsOf(x) }), h("small", { text: pctOf(x) })) : h("span"));
  };
  const patRow = (pat, k, at) => {
    const hard = pat.find((x) => x.kind === "work") || pat[0], z = zOf(hard), each = pat.reduce((a, x) => a + x.secs, 0);
    const said = pat.map((x) => `${lenOf(x)} ${(x.kind === "work" ? x.name || "hard" : x.kind === "rest" ? "easy" : nameOf(x)).toLowerCase()}`).join(", ");
    return h("div.ss-step.ss-pat", {}, when(at, at + each * k), h("i.bg-" + z.c),
      h("div.ss-tx", {}, h("b", { text: `${k} × ${said}` }), h("small.ss-meta", {}, h("span", { text: `${dur(each * k)} in all` }), zchip(z)),
        (() => { const c = cueOf(hard); return c && h("small.cue", { text: c }); })()),
      ride ? h("span.ss-w", {}, h("b", { text: wattsOf(hard) }), h("small", { text: pat.filter((x) => x !== hard).map((x) => `then ${wattsOf(x)}`).join(" ") || pctOf(hard) })) : h("span"));
  };
  // (the phases: warm up, the main set, cool down)
  const phaseOf = (x) => (x.kind === "warmup" ? "warm" : x.kind === "cooldown" ? "cool" : "main");
  const phases = [];
  for (const x of steps) { const k = phaseOf(x); if (!phases.length || phases.at(-1).k !== k) phases.push({ k, xs: [] }); phases.at(-1).xs.push(x); }
  let t = 0;
  const rows = phases.flatMap((ph) => {
    const from = t, secs = ph.xs.reduce((a, x) => a + x.secs, 0), out = [];
    for (let i = 0; i < ph.xs.length;) {
      let best = null;
      for (const p of [2, 1]) { let k = 1; while (i + (k + 1) * p <= ph.xs.length && ph.xs.slice(i + k * p, i + (k + 1) * p).every((y, j) => same(y, ph.xs[i + j]))) k++; if (k >= 3 && (!best || k * p > best.k * best.p)) best = { p, k }; }
      if (best) { const pat = ph.xs.slice(i, i + best.p); out.push(patRow(pat, best.k, t)); t += pat.reduce((a, x) => a + x.secs, 0) * best.k; i += best.p * best.k; }
      else { out.push(stepRow(ph.xs[i], t)); t += ph.xs[i].secs; i++; }
    }
    const title = { warm: "Warm up", cool: "Cool down", main: phases.length > 1 ? "Main set" : "The ride" }[ph.k];
    return [h("div.ss-phase", {}, h("b", { text: title }), h("small", { text: `${dur(secs)} · ${clk(from)}–${clk(from + secs)}` })), ...out];
  });
  // (the same steps again, merged where one follows another at the same effort, for long steady rides)
  const zsecs = ZONES.map(() => 0); for (const x of steps) zsecs[zOf(x).n - 1] += x.secs;
  const g = /(\d+)(?:–(\d+))? g/.exec(d?.fuel || ""), perHour = g ? (+g[1] + +(g[2] || g[1])) / 2 : 0;
  const feeds = [];
  if (perHour) for (let at = 20 * 60; at < m.secs - 10 * 60; at += 20 * 60) feeds.push(at);
  const each = perHour ? Math.round(perHour / 3 / 5) * 5 : 0;
  return { title: dayLong(day), body: [
    h("div.sheet-top", {}, h("div.sub", {}, sportTile(w.sport, true), kindSaid(w)), h("h1", { text: w.name }),
      h("div.sub.num", { text: [dur(m.secs), w.sport !== "strength" ? `TSS ${Math.round(m.tss)}` : null, ride ? `IF ${m.iF.toFixed(2)}` : null, ride ? `${Math.round((m.avg * ftp * m.secs) / 1000)} kJ` : null].filter(Boolean).join(" · ") })),
    card(null, ride ? `Power, at your FTP of ${ftp} W` : "Effort", C.profile(w, { ftp: ride ? ftp : null, pace: paceFor(w.sport), label: `${w.name}, step by step`, W: sheetW() })),
    d && h("div.rh-why", {}, h("b", { text: "Why today: " }), S.swaps[day] !== undefined ? "you changed this day." : d.why),
    w.about && h("p", { text: w.about }),
    section("Step by step", h("div.card.glass.ss-steps", {}, rows)),
    ride && section("Time in each zone", card(null, null, zoneBars(zsecs, ZONES.map((z) => z.name), ZONES.map((z) => z.c)))),
    perHour > 0 && section("Eating and drinking", h("div.card.glass.ss-fuel", {},
      h("p", {}, h("b", { text: `About ${Math.round(perHour)} g of carbs an hour` }), `, ${Math.round((perHour * m.secs) / 3600)} g in all: ${each} g every 20 minutes (a gel is about 25 g, a bar 40). A bottle an hour, more if it’s warm.`),
      h("div.ss-feeds", {}, feeds.map((at) => h("span", {}, h("b", { text: clk(at) }), `${each} g`))))),
    !perHour && ride && h("p.rh-note", { text: "Under 75 minutes: water is enough." }),
    d?.strength && section("Afterwards", h("div.group.glass", {}, row({ icon: "strength", tint: "indigo", title: "Heavy strength, 20 minutes", sub: "Squats, Romanian deadlifts and step-ups: heavy, few, never to failure", onclick: () => pushSheet(() => workoutView(workoutById("strength-heavy"))) }))),
    h("div.acts.rh-day-acts", {}, w.sport !== "strength" && h("button.btn", { type: "button", onclick: () => download(w, day) }, "Download"), day >= TODAY && h("button.btn.quiet", { type: "button", onclick: () => pushSheet(() => rhDayView(day)) }, "Change")),
  ] };
}
// A day of Rhythm's: the session in plain terms, why, and what to do when it isn't the day for it
function rhDayView(day) {
  const d = rhDay(day), id = S.swaps[day] !== undefined ? S.swaps[day] : d?.id, w = id ? wkById(id) : null, future = day >= TODAY;
  const watts = (() => { if (!w || w.sport !== "ride") return null; const xs = flatten(w).filter((x) => x.kind === "work").map((x) => Math.round(x.from * P().ftp)); return xs.length ? `${Math.min(...xs)}${Math.max(...xs) !== Math.min(...xs) ? `–${Math.max(...xs)}` : ""} W` : null; })();
  const set = (v, said) => { if (v === undefined) delete S.swaps[day]; else S.swaps[day] = v; keep("swaps"); closeSheet(); toast(said); redraw(); };
  const tomorrow = addDays(day, 1), tm = rhDay(tomorrow);
  const opt = (ic, tint, t, sub, fn) => row({ icon: ic, tint, title: t, sub, onclick: fn });
  const mins = d?.mins || 60, kind = /^rh:([a-z0-9]+):/.exec(id || "")?.[1];
  return { title: dayLong(day), body: [
    h("div.sheet-top", {}, h("h1", { text: w ? w.name : "Rest" }), h("div.sub", { text: w ? [dur(measure(w, paceFor(w.sport)).secs), watts && `efforts at ${watts}`].filter(Boolean).join(" · ") : "Recover" })),
    d && h("div.rh-why", {}, h("b", { text: "Why: " }), S.swaps[day] !== undefined ? "you changed this day." : d.why),
    w && d?.fuel && h("p.rh-note", { text: `Eat ${d.fuel}${d.strength ? ", then 20 minutes of heavy strength" : ""}.` }),
    future && w && section("Not the day for it?", h("div.group", {},
      mins > 50 && opt("today", "blue", "Short on time", kind && kind !== "endurance" && kind !== "long" ? `The same work in ${dur(Math.max(50, mins - 30) * 60)}` : `${dur(Math.max(40, Math.round(mins / 2 / 5) * 5) * 60)} instead`, () => set(kind ? R.withMins(id, kind === "endurance" || kind === "long" ? Math.max(40, Math.round(mins / 2 / 5) * 5) : Math.max(50, mins - 30)) : "recovery-45", "Shorter, same purpose")),
      d?.hard && opt("gauge", "green", "Make it easier", "Steady all the way, no hard efforts", () => set(`rh:endurance:${Math.min(mins, 90)}`, "Easier today")),
      tm && opt("swap", "indigo", "Swap with tomorrow", `${tm.id ? (wkById(tm.id)?.name || "Tomorrow’s") : "Rest"} today, this on ${dayName(tomorrow)}`, () => { S.swaps[day] = tm.id ?? null; S.swaps[tomorrow] = id; keep("swaps"); closeSheet(); toast("Swapped"); redraw(); }),
      opt("heart", "grey", "Rest today", "Rhythm makes up for it later in the week", () => set(null, "Rest today")))),
    S.swaps[day] !== undefined && future && h("button.btn.quiet", { type: "button", onclick: () => set(undefined, "Back to Rhythm’s plan") }, "Undo the change"),
    w && h("div.acts.rh-day-acts", {}, w.sport !== "strength" && h("button.btn", { type: "button", onclick: () => download(w, day) }, "Download"), h("button.btn.quiet", { type: "button", onclick: () => pushSheet(() => sessionView(day)) }, "Details")),
  ] };
}
// The ways to change a day of Rhythm's, there on its card: shorter, easier, another day, rest; and back to Rhythm's own.
// → [{ key, label, sub, run }]
function dayChanges(day) {
  const d = rhDay(day), id = S.swaps[day] !== undefined ? S.swaps[day] : d?.id, w = id ? wkById(id) : null;
  if (!rhythmOn() || day < TODAY) return [];
  const set = (v, said) => { if (v === undefined) delete S.swaps[day]; else S.swaps[day] = v; keep("swaps"); toast(said); redraw(); };
  const mins = d?.mins || 60, kind = /^rh:([a-z0-9]+):/.exec(id || "")?.[1], out = [];
  // (shorter: the same kind of work, less of it; offered only where that's really shorter, by five minutes at least)
  if (w) {
    const steady = kind === "endurance" || kind === "long" || kind === "recovery";
    const sid = kind ? R.withMins(id, steady ? Math.max(30, Math.round(mins / 2 / 5) * 5) : Math.max(35, mins - 20)) : "recovery-45", sw = wkById(sid);
    const now = measure(w, paceFor(w.sport)).secs, then = sw ? measure(sw, paceFor(sw.sport)).secs : now;
    if (sw && then <= now - 300) out.push({ key: "short", label: "Short on time", sub: `${sw.name}: ${dur(then)} instead of ${dur(now)}`, run: () => set(sid, `${sw.name}: ${dur(then)}`) });
  }
  if (w && d?.hard) out.push({ key: "easier", label: "Easier", sub: "Steady all the way, no hard efforts", run: () => set(`rh:endurance:${Math.min(mins, 90)}`, "Easier") });
  if (w) out.push({ key: "move", label: "Another day", sub: "Swap it with another day this week or next", run: () => openSheet(() => moveView(day)) });
  if (w) out.push({ key: "rest", label: "Rest", sub: "Rhythm makes up for it later in the week", run: () => set(null, day === TODAY ? "Rest today" : `Rest on ${dayName(day)}`) });
  if (S.swaps[day] !== undefined) out.push({ key: "undo", label: "Undo the change", sub: "Back to Rhythm’s plan", run: () => set(undefined, "Back to Rhythm’s plan") });
  return out;
}
// Moving a day's session to another: each day ahead with what's on it, the best (a rest day with no hard day either
// side) marked, and what the week then looks like, before anything's kept
function moveView(day, to = null) {
  const idOf = (d) => (S.swaps[d] !== undefined ? S.swaps[d] : rhDay(d)?.id ?? null), from = idOf(day), fw = from ? wkById(from) : null;
  const hardOn = (d) => { const id = idOf(d); if (!id) return false; const w = wkById(id); return !!w && w.sport === "ride" && measure(w, paceFor(w.sport)).iF >= 0.84; };
  const ahead = (rh()?.days || []).map((x) => x.date).filter((d) => d > TODAY && d !== day).slice(0, 10);
  const best = ahead.find((d) => !idOf(d) && !hardOn(addDays(d, -1)) && !hardOn(addDays(d, 1)));
  // (the week as it would be: that day's week, with the two swapped)
  const wk = to != null ? Array.from({ length: 7 }, (_, i) => addDays(mondayOf(to), i)) : [];
  const after = (d) => (d === day ? idOf(to) : d === to ? from : idOf(d));
  const minsOf = (id) => { const w = id ? wkById(id) : null; return w ? measure(w, paceFor(w.sport)).secs / 60 : 0; }, top = Math.max(60, ...wk.map((d) => minsOf(after(d))));
  const toneOf = (id) => { const w = id ? wkById(id) : null; return !w ? "rest" : w.sport !== "ride" ? "tint" : TCtone(measure(w, paceFor(w.sport)).iF); };
  const keepIt = () => { S.swaps[day] = idOf(to); S.swaps[to] = from; keep("swaps"); closeSheet(); toast(`Moved to ${dayName(to)}`); redraw(); };
  return { title: dayLong(day), right: h("button.link.r", { type: "button", disabled: to == null, onclick: keepIt }, "Move"), body: [
    h("div.sheet-top", {}, h("h1", { text: fw ? fw.name : "Rest" }), h("div.sub", { text: "Move it to another day" })),
    h("div.mv-days", { role: "radiogroup", "aria-label": "The day to move it to" }, ahead.map((d) => { const id = idOf(d), w = id ? wkById(id) : null;
      return h("button.mv-day" + (d === to ? ".on" : "") + (d === best ? ".best" : ""), { type: "button", role: "radio", "aria-checked": String(d === to), onclick: () => { Sheet.stack[Sheet.stack.length - 1] = () => moveView(day, d); Sheet.redraw(); } },
        h("small", { text: dayName(d).slice(0, 3).toUpperCase() }), h("b", { text: new Date(d).getDate() }), h("small.w", { text: d === best ? "Best" : w ? (w.kind && w.kind !== SPORTS[w.sport].name ? w.kind : w.name.split(" ")[0]) : "Rest" })); })),
    to != null && h("div.card.glass.mv-week", {}, h("small", { text: "Your week, then" }),
      h("div.mv-bars", {}, wk.map((d) => { const id = after(d), m = minsOf(id); return h("div" + (d === to || d === day ? ".moved" : ""), {}, h("i." + toneOf(id), { vars: { height: Math.max(4, (m / top) * 64) + "px" } }), h("small", { text: dayLetter(d) })); })),
      h("p.line-said", { text: `${fw ? fw.name : "Rest"} on ${dayName(to)}; ${idOf(to) ? `${wkById(idOf(to))?.name || "its session"} on ${dayName(day)}` : `rest on ${dayName(day)}`}.${hardOn(addDays(to, -1)) || hardOn(addDays(to, 1)) ? " That puts it next to a hard day: go easy on the other." : ""}` })),
  ] };
}
const TCtone = (iF) => (iF >= 0.95 ? "z6" : iF >= 0.84 ? "z4" : iF >= 0.76 ? "z3" : "z2");
// The workouts: yours, then the library's, by sport, each to read, ride and send
function workoutsView() {
  const bySport = Object.keys(SPORTS).map((sp) => [sp, WORKOUTS.filter((w) => w.sport === sp)]).filter(([, ws]) => ws.length);
  return { title: "Workouts", body: [h("div.sheet-top", {}, h("h1", { text: "Workouts" }), h("div.sub", { text: "To ride any day, or send to your device" })),
    S.mine.length > 0 && section("Yours", h("div.group", {}, S.mine.map(workoutRow))),
    ...bySport.map(([sp, ws]) => section(SPORTS[sp].name, h("div.group", {}, ws.map(workoutRow))))] };
}
// Setting Rhythm up (or changing it): four short steps, each a page of the sheet (Back pops it): when you ride, how you
// like to ride, build or hold, and the first week it gives you before anything's kept
// (onboard: as part of the first-use welcome (app.js onboarding), whose own screens come before and between: its views
// handed back, not opened; riding style a balanced default, and its goal one screen, "What are you riding for?")
function rhythmSetup({ first = false, at = null, onboard = null } = {}) {
  const editing = !!S.rhythm && !onboard, draft = { ...R.DEFAULTS, ...(S.rhythm || {}) };
  draft.days = [...draft.days];
  const cancel = () => (onboard ? h("span.r") : h("button.link.r", { type: "button", onclick: closeSheet }, "Cancel"));
  // (the steps: someone new has had Garmin's first; little of your own riding to go by, a step asking where you've
  // been, so Rhythm starts there; your numbers, setting up, not changing your week)
  const needLevel = R.sparse(S.own.map((a) => ({ start: a.start })), TODAY);
  const STEPS = onboard ? ["rides", "days", needLevel && "level", "aim", "extras", "preview"].filter(Boolean)
    : [first && "garmin", "days", needLevel && "level", !editing && "numbers", "style", "goal", "event", "preview"].filter(Boolean);
  const dots = (k) => { const n = STEPS.indexOf(k) + 1; return h("div.rh-dots", { "aria-label": `Step ${n} of ${STEPS.length}` }, STEPS.map((_, i) => h("i" + (i + 1 === n ? ".now" : i + 1 < n ? ".done" : "")))); };
  const top = (k, title, sub) => [dots(k), h("div.sheet-top", {}, h("h1", { text: title }), sub && h("div.sub", { text: sub }))];
  const next = (label, view) => h("button.btn.rh-next", { type: "button", onclick: () => pushSheet(view) }, label);
  // 1. When you ride: a bar a day, dragged up to how long you have (to 6 hours, by quarter hours); or a day tapped, and
  // its time a quarter hour at a time (all the way down: a rest day)
  // (said short, so a day's label fits over its bar: 45m, 1h, 1h45)
  const MAX = 360, said = (v) => (!v ? "Rest" : v < 60 ? `${v}m` : `${Math.floor(v / 60)}h${v % 60 ? String(v % 60).padStart(2, "0") : ""}`);
  const days = () => {
    const total = h("b"), count = h("span"), NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const sum = () => { const n = draft.days.filter((x) => x).length; total.textContent = n ? dur(draft.days.reduce((a, x) => a + x, 0) * 60) : "No days yet"; count.textContent = `${plural(n, "day")} · ${plural(7 - n, "rest")}`; };
    if (days.sel == null) days.sel = Math.max(0, draft.days.findIndex((x) => x));
    const paints = [], selName = h("b"), selVal = h("output");
    const step = (d) => { const i = days.sel, x = draft.days[i]; let v = x + d; if (d > 0 && !x) v = 30; else if (v < 30) v = 0; draft.days[i] = Math.max(0, Math.min(MAX, v)); paints[i](); };
    const pick = (i) => { days.sel = i; paints.forEach((p) => p()); };
    const cols = draft.days.map((v, i) => {
      const label = h("span.v", { text: said(v) }), bar = h("i"), track = h("div.track", {}, bar);
      const paint = () => { const x = draft.days[i]; bar.className = x ? "" : "rest"; bar.style.setProperty("--h", (x ? Math.max(8, (x / MAX) * 100) : 4) + "%"); label.textContent = said(x); track.setAttribute("aria-valuenow", x); track.setAttribute("aria-valuetext", said(x)); sum();
        track.classList.toggle("sel", days.sel === i); if (days.sel === i) { selName.textContent = NAMES[i]; selVal.textContent = x ? dur(x * 60) : "Rest"; } };
      paints[i] = paint;
      const at = (e) => { const r = track.getBoundingClientRect(), f = 1 - (e.clientY - r.top) / r.height, m = Math.round((f * MAX) / 15) * 15; return m < 30 ? 0 : Math.min(MAX, m); };
      let down = null;
      track.addEventListener("pointerdown", (e) => { down = { y: e.clientY, moved: false }; track.setPointerCapture(e.pointerId); e.preventDefault(); });
      track.addEventListener("pointermove", (e) => { if (!down) return; if (Math.abs(e.clientY - down.y) > 4) down.moved = true; if (down.moved) { draft.days[i] = at(e); paint(); } });
      track.addEventListener("pointerup", () => { if (down) pick(i); down = null; });
      track.addEventListener("focus", () => pick(i));
      track.addEventListener("keydown", (e) => { const d = { ArrowUp: 15, ArrowRight: 15, ArrowDown: -15, ArrowLeft: -15 }[e.key]; if (d) { e.preventDefault(); days.sel = i; step(d); } });
      Object.assign(track, { tabIndex: 0 }); track.setAttribute("role", "slider"); track.setAttribute("aria-label", ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][i]); track.setAttribute("aria-valuemin", 0); track.setAttribute("aria-valuemax", MAX);
      setTimeout(paint);
      return h("div.rh-day", {}, label, track, h("small", { text: "MTWTFSS"[i] }));
    });
    const preset = (name, v) => h("button.pill.small", { type: "button", onclick: () => { draft.days = [...v]; Sheet.redraw(); } }, name);
    setTimeout(sum);
    return { title: editing ? "Your week" : "Rhythm", right: cancel(), body: [...top("days", "When do you ride?", "Drag each day up to how long you usually have, or tap a day and use − and +. All the way down is a rest day."),
      h("div.card.rh-days", {}, h("div.rh-sum", {}, total, count), h("div.rh-bars", {}, cols)),
      h("div.rh-daystep", {}, selName, h("span.stepper", { role: "group", "aria-label": "That day’s time" },
        h("button", { type: "button", "aria-label": "15 minutes less", onclick: () => step(-15) }, icon("minus", 16, 2.4)), selVal,
        h("button", { type: "button", "aria-label": "15 minutes more", onclick: () => step(15) }, icon("plus", 16, 2.4)))),
      section("Or start from", h("div.rh-presets", {}, preset("Evenings and weekends", [0, 60, 60, 60, 0, 150, 90]), preset("Weekends only", [0, 0, 0, 0, 0, 180, 150]), preset("Most days", [45, 75, 60, 75, 0, 180, 120]))),
      onboard?.coming?.(),
      h("button.btn.rh-next", { type: "button", onclick: () => (draft.days.some((x) => x) ? pushSheet(needLevel ? level : onboard ? aim : editing ? style : numbersStep) : toast("Choose at least one day to ride", true)) }, "Next")] };
  };
  // 1b. Where you've been riding lately (only with less than a month of your own rides to go by)
  const level = () => {
    if (!draft.level) draft.level = "some";
    const opt = (k, t, sub) => h("button.rh-choice" + (draft.level === k ? ".on" : ""), { type: "button", role: "radio", "aria-checked": String(draft.level === k), onclick: () => { draft.level = k; Sheet.redraw(); } },
      h("span.tx", {}, h("b", { text: t }), h("small", { text: sub })), h("span.tick", {}, draft.level === k ? icon("check", 13, 3.2) : null));
    return { title: editing ? "Your week" : "Rhythm", right: cancel(), body: [dots("level"), h("div.sheet-top", {}, h("h1", { text: "How much have you been riding?" }),
      h("div.sub", { text: `The last month or so. ${S.own.length ? `You’ve uploaded ${plural(S.own.length, "ride")}, so` : "With no rides uploaded yet,"} Rhythm starts from this, and learns from every ride you add.` })),
      h("div.rh-choices", { role: "radiogroup", "aria-label": "Riding lately" },
        opt("none", "Hardly at all", "Starting again, or new to it"), opt("some", "A ride or two a week", "About 2 to 4 hours"), opt("regular", "Most weeks, regularly", "About 5 to 8 hours"), opt("lots", "A lot", "9 hours or more")),
      next("Next", onboard ? aim : editing ? style : numbersStep)] };
  };
  // 1c. Your numbers: every target's set from them (worked out from your rides till you set them)
  const numbersStep = () => ({ title: "Rhythm", right: cancel(), body: [...top("numbers", "Your numbers", "Every target in your plan is set from these. Not sure? Leave them: Fitness works them out from your rides, and keeps them up to date."),
    h("div.group", {}, stepper("FTP", "ftp", (v) => `${v} W`, 5, 80, 500), stepper("Weight", "weight", (v) => weight(v), 0.5, 35, 150), stepper("Max heart rate", "maxHr", (v) => `${v} bpm`, 1, 120, 230)),
    h("p.rh-note", { text: "Threshold heart rate and paces follow from these. Change any of them in You." }),
    next("Next", style)] });
  // 2. How you like to ride, and a run and a swim
  const pic = (bars) => h("span.rh-pic", { "aria-hidden": "true" }, bars.map(([v, z]) => h("i.bg-" + z, { vars: { "--h": v + "%" } })));
  const style = () => {
    const choice = (k, title, sub, bars) => h("button.rh-choice" + (draft.lean === k ? ".on" : ""), { type: "button", role: "radio", "aria-checked": String(draft.lean === k), onclick: () => { draft.lean = k; Sheet.redraw(); } },
      pic(bars), h("span.tx", {}, h("b", { text: title }), h("small", { text: sub })), h("span.tick", {}, draft.lean === k ? icon("check", 13, 3.2) : null));
    const tile = (k, ic, title) => h("button.rh-tile" + (draft[k] ? ".on." + k : ""), { type: "button", "aria-pressed": String(!!draft[k]), onclick: () => { draft[k] = !draft[k]; Sheet.redraw(); } },
      h("span.ic", {}, icon(ic, 18, 2)), h("b", { text: title }), h("small", { text: draft[k] ? "On" : "Off" }));
    return { title: editing ? "Your week" : "Rhythm", right: cancel(), body: [...top("style", "How do you like to ride?", "Rhythm keeps every kind of effort sharp; this is where it leans."),
      h("div.rh-choices", { role: "radiogroup", "aria-label": "Lean towards" },
        choice("balanced", "Balanced", "A bit of everything, all year", [[45, "z2"], [75, "z4"], [45, "z2"], [85, "z6"], [55, "z2"], [65, "z3"]]),
        choice("endurance", "Long days", "Sportives, hills, all-day rides", [[55, "z2"], [65, "z3"], [55, "z2"], [65, "z4"], [95, "z2"], [95, "z2"]]),
        choice("punch", "Punchy rides", "Group rides, short climbs, sprints", [[45, "z2"], [90, "z6"], [45, "z2"], [100, "z7"], [45, "z2"], [80, "z6"]])),
      section("Alongside riding", h("div.rh-tiles", {}, tile("run", "run", "A run a week"), tile("swim", "swim", "A swim a week"))),
      next("Next", goal)] };
  };
  // 3. Build or hold
  const goal = () => {
    const card = (k, title, sub, path, c) => h("button.rh-goal" + (draft.mode === k ? ".on" : ""), { type: "button", role: "radio", "aria-checked": String(draft.mode === k), onclick: () => { draft.mode = k; Sheet.redraw(); } },
      h("span.rh-goal-top", {}, h("b", { text: title }), h("span.tick", {}, draft.mode === k ? icon("check", 13, 3.2) : null)),
      svgOf(`<svg viewBox="0 0 326 64" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="63" x2="326" y2="63" class="rh-axis"/><path d="${path}" class="rh-line ${c}"/></svg>`),
      h("small", { text: sub }));
    return { title: editing ? "Your week" : "Rhythm", right: cancel(), body: [...top("goal", "Build, or hold?", "You can change this any time, say for a busy month."),
      h("div.rh-goals", { role: "radiogroup", "aria-label": "Build or hold" },
        card("build", "Keep building", "Up a few points a week, never faster, with a lighter week every fourth. Uses all the time you gave.", "M0 54 C40 50, 60 46, 90 42 S 130 40, 150 40 C170 40, 190 32, 230 26 S 280 20, 300 18 L326 14", "up"),
        card("hold", "Hold where I am", "Fitness kept level with less riding: shorter sessions, the hard work kept.", "M0 32 C40 28, 70 34, 110 31 S 170 28, 200 32 S 270 34, 326 30", "level")),
      h("div.rh-ftp", {}, icon("info", 18, 2), h("span", {}, "Your FTP is ", h("b", { text: `${P().ftp} W` }), isSet("ftp") ? ", as you set it." : ", worked out from your rides till you set it.", " Rhythm sets every interval from it, and from your power curve once your rides show it.")),
      next("Next", event)] };
  };
  // 3b. Riding towards something: a sportive, a race or a time trial, its date and its name; or nothing in particular
  const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const event = () => {
    const ev = draft.event || null, k = ev?.kind || "none";
    const set = (kind) => { draft.event = kind === "none" ? null : { kind, date: ev?.date ?? null, name: ev?.name || "" }; Sheet.redraw(); };
    const opt = (kind, t, sub, ic) => h("button.rh-choice" + (k === kind ? ".on" : ""), { type: "button", role: "radio", "aria-checked": String(k === kind), onclick: () => set(kind) },
      h("span.ic.ev-ic." + kind, {}, icon(ic, 16, 2.2)), h("span.tx", {}, h("b", { text: t }), h("small", { text: sub })), h("span.tick", {}, k === kind ? icon("check", 13, 3.2) : null));
    const date = h("input.field", { type: "date", "aria-label": "Its date", min: ymd(addDays(TODAY, 3)), max: ymd(addDays(TODAY, 365)), value: ev?.date ? ymd(ev.date) : "",
      onchange: () => { const [y, m, d] = date.value.split("-").map(Number); if (ev && y) { ev.date = startOfDay(new Date(y, m - 1, d, 12).getTime()); Sheet.redraw(); } } });
    const name = h("input.field", { type: "text", maxlength: "60", placeholder: "Its name (optional)", "aria-label": "Its name", value: ev?.name || "", oninput: () => { if (ev) ev.name = name.value.trim().slice(0, 60); } });
    const go = () => { if (ev && !ev.date) { toast("Choose its date", true); return date.focus(); } pushSheet(preview); };
    const weeksTo = ev?.date ? Math.round((ev.date - TODAY) / (7 * DAY)) : null;
    return { title: editing ? "Your week" : "Rhythm", right: cancel(), body: [...top("event", "Riding towards something?", "Rhythm shapes the weeks before it for what it asks of you, then tapers, so you arrive fresh. Or nothing in particular: Rhythm keeps you getting fitter."),
      h("div.rh-choices", { role: "radiogroup", "aria-label": "Riding towards" },
        opt("none", "Nothing in particular", "Fitter, all year", "wave"), opt("sportive", "A sportive", "Long days, climbs: threshold and staying power", "mountain"),
        opt("race", "A road race", "Attacks and sprints: top-end work", "bolt"), opt("tt", "A time trial", "Steady and hard: threshold", "gauge")),
      ev && h("div.ev-when", {}, date, name, h("small.rh-note", { text: weeksTo != null ? (weeksTo >= 6 ? `${plural(weeksTo, "week")} away: the last six themed for it, then a two-week taper.` : weeksTo >= 2 ? `${plural(weeksTo, "week")} away: straight into the build for it, then the taper.` : "Close: Rhythm goes straight into the taper.") : "The day, so Rhythm can count back from it." })),
      h("button.btn.rh-next", { type: "button", onclick: go }, "See your first week")] };
  };
  // (the welcome's goal: four, each Rhythm's own settings: fitter, balanced; further, long days; faster, punchy rides;
  // or a date in mind, its kind and day, built towards and tapered for)
  const aim = () => {
    const ev = draft.event, k = ev ? "date" : draft.lean === "endurance" ? "further" : draft.lean === "punch" ? "faster" : "fitter";
    const set = (x) => { draft.mode = "build"; if (x === "date") { draft.lean = "balanced"; draft.event = draft.event || { kind: "sportive", date: null, name: "" }; } else { draft.event = null; draft.lean = { fitter: "balanced", further: "endurance", faster: "punch" }[x]; } Sheet.redraw(); };
    const card = (x, ic, tint, title, sub) => h("button.onb-goal" + (k === x ? ".on" : ""), { type: "button", role: "radio", "aria-checked": String(k === x), onclick: () => set(x) },
      h("span.ic." + tint, {}, icon(ic, 16, 2.2)), h("b", { text: title }), h("small", { text: sub }));
    const kind = (x, t) => h("button" + (ev?.kind === x ? ".on" : ""), { type: "button", "aria-pressed": String(ev?.kind === x), onclick: () => { ev.kind = x; Sheet.redraw(); } }, t);
    const date = ev && h("input.field", { type: "date", "aria-label": "Its date", min: ymd(addDays(TODAY, 3)), max: ymd(addDays(TODAY, 365)), value: ev.date ? ymd(ev.date) : "",
      onchange: () => { const [y, m, d] = date.value.split("-").map(Number); if (y) { ev.date = startOfDay(new Date(y, m - 1, d, 12).getTime()); Sheet.redraw(); } } });
    const name = ev && h("input.field", { type: "text", maxlength: "60", placeholder: "Its name (optional)", "aria-label": "Its name", value: ev.name || "", oninput: () => { ev.name = name.value.trim().slice(0, 60); } });
    const go = () => { if (ev && !ev.date) { toast("Choose its date", true); return date.focus(); } pushSheet(onboard.extras); };
    return { title: "", right: cancel(), body: [...top("aim", "What are you riding for?"),
      h("div.onb-goals", { role: "radiogroup", "aria-label": "Riding for" },
        card("fitter", "trend", "green", "Get fitter", "A steady build, week by week"), card("further", "mountain", "blue", "Go further", "Longer rides, more endurance"),
        card("faster", "bolt", "red", "Get faster", "More intensity, a higher FTP"), card("date", "calendar", "indigo", "A date in mind", "A sportive, a race or a time trial")),
      ev && h("div.card.onb-event", {}, h("div.onb-kinds", { role: "group", "aria-label": "What kind" }, kind("sportive", "Sportive"), kind("race", "Race"), kind("tt", "Time trial")), date, name,
        h("small.rh-note", { text: "Fitness builds towards it, then eases off before it, so you arrive fresh." })),
      h("button.btn.rh-next", { type: "button", onclick: go }, "Next")] };
  };
  // 4. The first week, as Rhythm would have it, before anything's kept
  const preview = () => {
    const acts = S.own.map((a) => ({ start: a.start, sport: a.sport, sum: sumOf(a) }));
    const r = R.plan({ prefs: { ...draft, start: S.rhythm?.start ?? mondayOf(TODAY), at: S.rhythm?.at ?? TODAY }, acts, feel: S.feel, today: TODAY, ftp: P().ftp, paces: { run: runSpeed(), swim: swimSpeed() } });
    const ds = r.days.filter((d) => d.date >= TODAY).slice(0, 7), t = R.targets ? r.targets : undefined;
    const mins = ds.reduce((a, d) => a + d.mins, 0), hard = ds.filter((d) => d.hard), easy = mins ? Math.round(100 * (1 - hard.reduce((a, d) => a + Math.min(d.mins, 60), 0) * 0.55 / mins)) : 100;
    const rowOf = (d) => { const w = d.id ? R.workoutOf(d.id, t) : null;
      return h("div.row.plain" + (d.date === TODAY ? ".today" : ""), {}, h("span.when", {}, h("b", { text: new Date(d.date).getDate() }), h("small", { text: d.date === TODAY ? "Today" : dayName(d.date).slice(0, 3) })),
        h("span.tx", {}, h("b", { text: w ? `${w.name}${d.strength ? " + strength" : ""}` : "Rest" }), h("small", { text: w ? [dur(d.mins * 60), d.fuel ? `eat ${d.fuel}` : null].filter(Boolean).join(" · ") : d.why })),
        w && h("span.mini", {}, C.profile(w, { mini: true, pace: paceFor(w.sport) }))); };
    const start = () => {
      S.rhythm = { ...draft, start: S.rhythm?.start ?? mondayOf(TODAY), at: S.rhythm?.at ?? TODAY };
      if (onboard) { if (S.chosen) { S.chosen = null; S.swaps = {}; keep("plan", "swaps"); } keep("rhythm"); return onboard.done(); }
      if (S.chosen) { S.chosen = null; S.swaps = {}; keep("plan", "swaps"); }
      keep("rhythm"); closeSheet(); toast(editing ? "Your week is saved" : "Rhythm has started"); if (S.tab !== "today") go("today"); else redraw();
    };
    return { title: editing ? "Your week" : "Rhythm", right: cancel(), body: [...top("preview", editing ? "Your next seven days" : "Your first week", `${R.THEMES[r.block.theme]} block${r.block.absorb ? ", a lighter week" : ""}. Each day firms up that morning, from what you’ve done and how you feel.`),
      h("div.group", {}, ds.map(rowOf)),
      h("div.rh-stats", {}, [["Time", dur(mins * 60)], ["Hard days", String(hard.length)], ["Easy", `${easy}%`]].map(([k, v]) => h("div", {}, h("small", { text: k }), h("b", { text: v })))),
      onboard && h("div.rh-ftp", {}, icon("info", 18, 2), h("span", {}, "Your FTP is ", h("b", { text: `${P().ftp} W` }), S.own.length ? ", worked out from your rides. " : ", a starting guess till your rides say. ", "Every zone and target follows it; change it in You.")),
      h("button.btn.rh-next", { type: "button", onclick: start }, onboard ? "Start training" : editing ? "Save" : "Start Rhythm"),
      h("p.rh-note", { text: "Change your week any time in Plan" })] };
  };
  if (onboard) return { days, preview, dots };
  // (straight to your event, from Today's Riding towards: then on to the next seven days, and saved)
  openSheet(at === "event" && editing ? event : days, { tall: true });
}
// A plan: what a week of it looks like, and when to start it: next Monday, or so it ends on your event's day (a plan of
// 16 weeks to an event 10 weeks off starts six weeks in)
function planSheet(p) {
  const mine = p.id === myPlan()?.id, next = mondayOf(addDays(TODAY, 7)), ws = layOut(p, next), first = ws[0];
  const endOf = (start) => addDays(start, p.weeks * 7 - 1), startFor = (end) => addDays(mondayOf(end), -(p.weeks - 1) * 7);
  let end = endOf(next);
  const iso = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const byEnd = h("button.btn.quiet", { type: "button", onclick: () => start(startFor(end)) });
  const said = () => { const st = startFor(end), wk = Math.floor((mondayOf(TODAY) - st) / (7 * DAY)) + 1; byEnd.textContent = st > TODAY ? `Start ${dayShort(st)}, to end ${dayShort(end)}` : `Start at week ${Math.min(p.weeks, wk)}, to end ${dayShort(end)}`; };
  const start = (st) => { choosePlan({ id: p.id, start: st }); closeSheet(); toast(st > TODAY ? `${p.name} starts on ${dayShort(st)}` : `${p.name}: you’re in week ${weekIndex(TODAY) + 1}`); redraw(); };
  said();
  const endField = h("input.field", { type: "date", id: "plan-end", value: iso(end), min: iso(addDays(TODAY, 7)), "aria-label": "Your event’s day, or when the plan should end",
    oninput: (e) => { const v = e.target.valueAsDate; if (v) { end = startOfDay(v.getTime() + v.getTimezoneOffset() * 60e3); said(); } } });
  return {
    title: p.name,
    body: [
      h("div.sheet-top", {}, h("h1", { text: p.name }), h("div.sub", { text: `${p.weeks} weeks · ${p.phases.map(([n, w]) => `${n} ${w}`).join(" · ")}` })),
      h("p", { text: p.about }),
      card(null, "A typical week", h("div.steps", {}, first.days.map((d) => { const w = d.id && d.id !== "event" ? wkById(d.id) : null; return h("div.step", {}, h("i.bg-" + (w ? zoneOf(measure(w).iF).c : "z1")), h("div", {}, h("b", { text: dayName(d.date) }), h("small", { text: w ? w.name : "Rest" })), h("div.v", { text: w ? dur(measure(w, paceFor(w.sport)).secs) : "" })); }))),
      mine && h("p", { text: "You’re on this plan. Starting it again starts it afresh." }),
      h("button.btn", { type: "button", onclick: () => start(next) }, `Start next Monday, ${dayShort(next)}`),
      section("Or end it on your event’s day", h("label", { for: "plan-end", class: "vh", text: "Your event’s day" }), endField), byEnd,
    ],
  };
}
// a day: what's planned, what's done
function openDay(day) {
  if (rhythmOn() && actsOn(day).length) return actsOn(day).length === 1 ? openAct(actsOn(day)[0]) : null;
  if (rhythmOn() && rhDay(day)) return openSheet(() => rhDayView(day));
  const id = plannedOn(day), w = id && id !== "event" ? wkById(id) : null, did = actsOn(day);
  if (did.length === 1 && !w) return openAct(did[0]);
  if (!did.length && w) return openWorkout(w);
  openSheet(() => ({
    title: dayLong(day),
    body: [h("div.sheet-top", {}, h("h1", { text: dayLong(day) }), h("div.sub", { text: w ? `Planned: ${w.name}` : id === "event" ? "Event day" : "A rest day" })),
      w && section("Planned", h("div.group", {}, workoutRow(w))),
      did.length ? section("Done", h("div.group", {}, did.map(actRow))) : h("p", { text: day < TODAY ? "Nothing recorded this day." : "Nothing recorded yet." })],
  }));
}

function workoutRow(w) {
  const m = measure(w, paceFor(w.sport));
  return h("button.row", { type: "button", onclick: () => openWorkout(w) },
    h("span.mini", {}, C.profile(w, { mini: true, pace: paceFor(w.sport) })),
    h("span.tx", {}, h("b", { text: w.name }), h("small", { text: [dur(m.secs), w.sport === "swim" ? dist(F_metres(w), true) : null, w.sport !== "strength" ? `TSS ${Math.round(m.tss)}` : null].filter(Boolean).join(" · ") })),
    h("span.chev", {}, icon("chev", 17, 2.4)));
}
const F_metres = (w) => flatten(w).reduce((a, s) => a + (s.metres || 0), 0);
function openWorkout(w) { openSheet(() => workoutView(w), { tall: true }); }
function workoutView(w) {
  const m = measure(w, paceFor(w.sport)), ftp = P().ftp, mine = S.mine.some((x) => x.id === w.id);
  const target = (s) => {
    if (s.kind === "free") return "As you like";
    if (w.sport === "ride") return s.from === s.to ? `${pct(s.from)} · ${Math.round(s.from * ftp)} W` : `${pct(s.from)}–${pct(s.to)} · ${Math.round(s.from * ftp)}–${Math.round(s.to * ftp)} W`;
    if (w.sport === "run") return pace(paceOfSpeed(runSpeed() * s.from));
    if (w.sport === "swim") return s.from ? pace(100 / (swimSpeed() * s.from), "/100 m") : "Rest";
    return "";
  };
  const stepEl = (s) => h("div.step", {}, h("i.bg-" + (s.kind === "free" ? "z1" : zoneOf((s.from + (s.to ?? s.from)) / 2).c)),
    h("div", {}, h("b", { text: s.name || { warmup: "Warm up", cooldown: "Cool down", rest: "Easy", work: "Interval", steady: "Steady" }[s.kind] }), h("small", { text: [stepLen(s), s.cad ? `${s.cad[0]}–${s.cad[1]} rpm` : null, s.note].filter(Boolean).join(" · ") })),
    h("div.v", { text: target({ ...s, to: s.to ?? s.from }) }));
  // (a run of the same step, or the same two, three times or more: said once, with how many, not listed out: 30/15s are
  // "13 × 30 s hard, 15 s easy", not twenty-six lines)
  const same = (a, b) => a.kind === b.kind && a.secs === b.secs && a.metres === b.metres && a.from === b.from && (a.to ?? a.from) === (b.to ?? b.from) && a.name === b.name;
  const runs = (xs) => {
    const out = [];
    for (let i = 0; i < xs.length;) {
      let best = null;
      for (const p of [2, 1]) { let k = 1; while (i + (k + 1) * p <= xs.length && xs.slice(i + k * p, i + (k + 1) * p).every((x, j) => same(x, xs[i + j]))) k++; if (k >= 3 && (!best || k * p > best.k * best.p)) best = { p, k }; }
      if (best) { out.push({ pattern: xs.slice(i, i + best.p), times: best.k }); i += best.k * best.p; } else out.push(xs[i++]);
    }
    return out;
  };
  const secsOf = (xs) => xs.reduce((a, x) => a + (x.secs || 0), 0);
  const patternEl = ({ pattern, times }) => h("div.pattern", {},
    h("div.pt-head", {}, h("b", { text: `${times} ×` }), h("small", { text: `${dur(secsOf(pattern) * times)} in all` })),
    h("div.pt-parts", {}, pattern.map((x) => h("div.pt-part", {}, h("i.bg-" + zoneOf((x.from + (x.to ?? x.from)) / 2).c),
      h("span", {}, h("b", { text: `${stepLen(x)} ${(x.name || { rest: "easy", work: "hard" }[x.kind] || "steady").toLowerCase()}` }), h("small", { text: target({ ...x, to: x.to ?? x.from }) }))))));
  const list = (xs) => runs(xs).map((x) => (x.pattern ? patternEl(x) : stepEl(x)));
  const steps = w.steps.map((s) => (s.repeat
    ? h("div.repeat", {}, h("div.rh", {}, icon("swap", 14, 2.4), s.repeat === 2 ? "Twice" : `${s.repeat} times`, h("span.rh-len", { text: `${dur(secsOf(flatten({ steps: s.steps })))} each` })), h("div.steps", {}, list(s.steps)))
    : stepEl(s)));
  return {
    title: "Workout",
    body: [
      h("div.sheet-top", {}, h("div.sub", {}, sportTile(w.sport, true), kindSaid(w)), h("h1", { text: w.name }),
        h("div.sub.num", { text: [dur(m.secs), w.sport === "swim" ? dist(F_metres(w), true) : null, w.sport !== "strength" ? `TSS ${Math.round(m.tss)}` : null, w.sport === "ride" ? `IF ${m.iF.toFixed(2)}` : null, w.sport === "ride" ? `${Math.round((m.avg * ftp * m.secs) / 1000)} kJ` : null].filter(Boolean).join(" · ") })),
      card(null, w.sport === "ride" ? `Power, at your FTP of ${ftp} W` : w.sport === "run" ? "Effort, against your threshold pace" : "Effort", C.profile(w, { ftp: w.sport === "ride" ? ftp : null, pace: paceFor(w.sport), label: `${w.name}, step by step`, W: sheetW() })),
      w.about && h("p", { text: w.about }),
      card(null, "Steps", h("div.steps", {}, steps)),
      w.sport !== "strength" && h("button.btn", { type: "button", onclick: () => download(w) }, icon("download", 19, 2.2), "Download"),
      mine && h("div.group", {},
        h("button.row.action.danger", { type: "button", onclick: () => { S.mine = S.mine.filter((x) => x.id !== w.id); keep("workouts"); closeSheet(); toast("Workout deleted"); redraw(); } }, "Delete workout")),
    ],
  };
}
// (a workout's sport and kind, the kind left out where it only says the sport again: Strength, not Strength · Strength)
const kindSaid = (w) => (w.kind && w.kind !== SPORTS[w.sport].name ? `${SPORTS[w.sport].name} · ${w.kind}` : SPORTS[w.sport].name);
const paceOfSpeed = (ms) => (U.metric ? 1000 / ms : 1609.344 / ms);

// Sending a workout: a file for each device and app, and how to get it there
// (named by the day it's for: 2026-10-25.fit; a workout from the library, today)
// Download: a workout as a .fit file named by its day. Straight away for the device you chose last (else the one your
// rides come from), then how to get it on; or a choice of device, the first time
const dayStamp = (day) => { const dt = new Date(day); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`; };
function myDevice() {
  const k = store.get("device", null);
  if (k?.brand === "garmin" || k?.brand === "wahoo") return k;
  const d = S.own.find((a) => /garmin|wahoo/i.test(a.device || ""));
  return d ? { brand: /wahoo/i.test(d.device) ? "wahoo" : "garmin", name: d.device } : null;
}
function download(w, day = TODAY, dev = myDevice()) {
  const show = (v) => (sheetEl.open ? pushSheet(v) : openSheet(v));
  if (!dev) return show(() => sendView(w, day));
  const name = `${dayStamp(day)}.fit`;
  saveFile(name, F.fitFromWorkout(w, { pace: paceFor(w.sport) }));
  show(() => savedView(w, day, dev, name));
}
const devName = (dev) => dev.name || (dev.brand === "wahoo" ? "Wahoo" : "Garmin");
// (under a Download button: which device it's for, and another a tap away)
function dlFor(w, day) {
  const dev = myDevice();
  return dev && h("p.dl-for", {}, `For your ${devName(dev)} · `, h("button.link.small", { type: "button", onclick: () => openSheet(() => sendView(w, day)) }, "Another device?"));
}
function sendView(w, day = TODAY) {
  const file = (title, brand) => row({ tile: h("span.ic.brand." + brand, {}, icon("device", 18, 2)), title, sub: ".fit workout file", chev: false,
    extra: h("span.get", { "aria-hidden": "true" }, icon("download", 18, 2.2)), onclick: () => {
      const was = myDevice(), dev = was?.brand === brand ? was : { brand, name: brand === "wahoo" ? "Wahoo" : "Garmin" };
      store.set("device", dev); download(w, day, dev);
    } });
  return { title: "Download", body: [h("div.sheet-top", {}, h("h1", { text: dayStamp(day) }), h("div.sub", { text: "Which device is it for?" })), h("div.group", {}, file("Garmin", "garmin"), file("Wahoo", "wahoo"))] };
}
// Saved: and how to get it onto your device, step by step
function savedView(w, day, dev, name) {
  const steps = dev.brand === "wahoo"
    ? ["Open the file on your phone, and share it to the ELEMNT app", "The ELEMNT app sends it to your device", "On your ELEMNT, it’s under Workouts"]
    : ["Plug it into a computer with its cable", "Copy the file into the Garmin › NewFiles folder", "Unplug it: the workout’s under Training › Workouts"];
  return { title: dayStamp(day), body: [
    h("div.saved", {}, h("span.ok", {}, icon("check", 15, 3)), h("span", {}, h("b", { text: "Saved" }), ` as ${name}, in your downloads`)),
    section(`Onto your ${devName(dev)}`, h("div.group", {}, steps.map((t, i) => h("div.row.plain", {}, h("span.ic.soft.blue.num", {}, h("b", { text: String(i + 1) })), h("span.tx", {}, h("b.light", { text: t })))))),
    section(null, h("div.group", {}, row({ icon: "device", tint: "grey", title: "Another device", onclick: () => pushSheet(() => sendView(w, day)) }))),
  ] };
}

export { dayChanges, dayStamp, dlFor, download, moveView, openDay, openWorkout, paceOfSpeed, planView, rhythmIntro, rhythmSaid, rhythmSetup, sessionView, workoutRow, workoutsView };