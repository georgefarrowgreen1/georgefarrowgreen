// Fitness's plan sheets under InFlite's roof (One roof stage 2, spec §2.2, §4.3 FXB): a port of fitness/plan.js onto
// x.js (the names it took from app.js), lazy, loaded on the first of these sheets. (The Plan tab itself is Today now:
// its day strip, week and day card are todayview.js's; rhythmSaid, dayStamp and dayChanges are fxcalc.js's.)
//
// Exports (the ctx.open table, §4.7; each opener takes ctx first, as the entry binds them):
//   openSession(ctx, day)        dialog.ifl-sheet[data-sheet=session]: a day's session in full (no session: the day)
//   openWorkout(ctx, id, day?)   [data-sheet=workout]: a workout (yours or the library's), to read, ride and send
//   openDay(ctx, day)            [data-sheet=fx-day]: a day of Rhythm's (or a plan's): what's planned, what's done
//   openMove(ctx, day)           [data-sheet=move]: that day's session moved to another, the week shown before it's kept
//   openWorkouts(ctx)            [data-sheet=workouts]: yours, then the library's, by sport
//   openRhythmSetup(ctx, step)   [data-sheet=rhythm-setup]: setting Rhythm up, or your week changed; step 0 (or none)
//                                its first page, else a page by name (days, level, numbers, style, goal, event, preview);
//                                each page [data-page=<name>]
//   openSendDevice(ctx, wid, day) [data-sheet=send-device]: a workout's .fit file, for your Garmin or Wahoo
//   download(w, day?, dev?)      a workout as a .fit file named by its day: a blob through <a download> (saveFile),
//                                then how to get it onto the device; a choice of device the first time
// A day is the start of that day on this phone (startOfDay), as the rest of Fitness has it.
import {coach} from "./core.js";
import { C, DAY, P, R, S, SPORTS, TODAY, ZONES, actsOn, addDays, card, closeSheet, dayLetter, dayLong, dayName, dayStamp, dur, flatten, h, icon, isSet, keep, measure, mondayOf, openSheet, pace, paceFor, pct, plannedOn, plural, pushSheet, redraw, rh, rhDay, rhythmOn, row, runSpeed, saveFile, section, sheetW, sportTile, startOfDay, stepLen, stepper, store, sumOf, svgOf, swimSpeed, toast, weight, wkById, workoutById, zoneOf, dist, Sheet, sheetEl, WORKOUTS, zoneBars } from "./x.js";
import { actRow, paceOfSpeed } from "./actsview.js";

// ---- the module's handle: the ctx the entry gave the last opener ----
let X = null;
const use = (ctx) => { if (ctx) X = ctx; return X; };
let fmtP = null;
const formats = () => (fmtP ??= X.fw.lazy((q) => import("../formats.js" + (q || ""))).catch((e) => { fmtP = null; throw e; }));
// (a pushed page of the sheet: its name on its container, [data-page=<page>])
const push = (view, page) => pushSheet(() => ({ ...view(), page }));
const sheetUp = () => { try { return !!(typeof sheetEl === "function" ? sheetEl() : sheetEl)?.open; } catch (_) { return false; } };

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
    d?.strength && section("Afterwards", h("div.group.glass", {}, row({ icon: "strength", tint: "indigo", title: "Heavy strength, 20 minutes", sub: "Squats, Romanian deadlifts and step-ups: heavy, few, never to failure", onclick: () => push(() => workoutView(workoutById("strength-heavy")), "workout") }))),
    h("div.acts.rh-day-acts", {}, w.sport !== "strength" && h("button.btn", { type: "button", onclick: () => download(w, day) }, "Download"), day >= TODAY && h("button.btn.quiet", { type: "button", onclick: () => push(() => rhDayView(day), "change") }, "Change")),
  ] };
}
// A day of Rhythm's: the session in plain terms, why, and what to do when it isn't the day for it
function rhDayView(day) {
  const d = rhDay(day), id = S.swaps[day] !== undefined ? S.swaps[day] : d?.id, w = id ? wkById(id) : null, future = day >= TODAY;
  const watts = (() => { if (!w || w.sport !== "ride") return null; const xs = flatten(w).filter((x) => x.kind === "work").map((x) => Math.round(x.from * P().ftp)); return xs.length ? `${Math.min(...xs)}${Math.max(...xs) !== Math.min(...xs) ? `–${Math.max(...xs)}` : ""} W` : null; })();
  const set = (v, said) => { if (v === undefined) delete S.swaps[day]; else S.swaps[day] = v; keep("swaps"); closeSheet(); toast(said); redraw("plan"); };
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
      tm && opt("swap", "indigo", "Swap with tomorrow", `${tm.id ? (wkById(tm.id)?.name || "Tomorrow’s") : "Rest"} today, this on ${dayName(tomorrow)}`, () => { S.swaps[day] = tm.id ?? null; S.swaps[tomorrow] = id; keep("swaps"); closeSheet(); toast("Swapped"); redraw("plan"); }),
      opt("heart", "grey", "Rest today", "Rhythm makes up for it later in the week", () => set(null, "Rest today")))),
    S.swaps[day] !== undefined && future && h("button.btn.quiet", { type: "button", onclick: () => set(undefined, "Back to Rhythm’s plan") }, "Undo the change"),
    w && h("div.acts.rh-day-acts", {}, w.sport !== "strength" && h("button.btn", { type: "button", onclick: () => download(w, day) }, "Download"), h("button.btn.quiet", { type: "button", onclick: () => push(() => sessionView(day), "session") }, "Details")),
  ] };
}
// Moving a day's session to another: each day ahead with what's on it, the best (a rest day with no hard day either
// side) marked, and what the week then looks like, before anything's kept
function moveView(day) {
  const to = moveTo;
  const idOf = (d) => (S.swaps[d] !== undefined ? S.swaps[d] : rhDay(d)?.id ?? null), from = idOf(day), fw = from ? wkById(from) : null;
  const hardOn = (d) => { const id = idOf(d); if (!id) return false; const w = wkById(id); return !!w && w.sport === "ride" && measure(w, paceFor(w.sport)).iF >= 0.84; };
  const ahead = (rh()?.days || []).map((x) => x.date).filter((d) => d > TODAY && d !== day).slice(0, 10);
  const best = ahead.find((d) => !idOf(d) && !hardOn(addDays(d, -1)) && !hardOn(addDays(d, 1)));
  // (the week as it would be: that day's week, with the two swapped)
  const wk = to != null ? Array.from({ length: 7 }, (_, i) => addDays(mondayOf(to), i)) : [];
  const after = (d) => (d === day ? idOf(to) : d === to ? from : idOf(d));
  const minsOf = (id) => { const w = id ? wkById(id) : null; return w ? measure(w, paceFor(w.sport)).secs / 60 : 0; }, top = Math.max(60, ...wk.map((d) => minsOf(after(d))));
  const toneOf = (id) => { const w = id ? wkById(id) : null; return !w ? "rest" : w.sport !== "ride" ? "tint" : TCtone(measure(w, paceFor(w.sport)).iF); };
  const keepIt = () => { S.swaps[day] = idOf(to); S.swaps[to] = from; keep("swaps"); closeSheet(); toast(`Moved to ${dayName(to)}`); redraw("plan"); };
  return { title: dayLong(day), body: [
    h("div.sheet-top", {}, h("h1", { text: fw ? fw.name : "Rest" }), h("div.sub", { text: "Move it to another day" })),
    h("div.mv-days", { role: "radiogroup", "aria-label": "The day to move it to" }, ahead.map((d) => { const id = idOf(d), w = id ? wkById(id) : null;
      return h("button.mv-day" + (d === to ? ".on" : "") + (d === best ? ".best" : ""), { type: "button", role: "radio", "aria-checked": String(d === to), onclick: () => { moveTo = d; Sheet.redraw?.(); } },
        h("small", { text: dayName(d).slice(0, 3).toUpperCase() }), h("b", { text: new Date(d).getDate() }), h("small.w", { text: d === best ? "Best" : w ? (w.kind && w.kind !== SPORTS[w.sport].name ? w.kind : w.name.split(" ")[0]) : "Rest" })); })),
    to != null && h("div.card.glass.mv-week", {}, h("small", { text: "Your week, then" }),
      h("div.mv-bars", {}, wk.map((d) => { const id = after(d), m = minsOf(id); return h("div" + (d === to || d === day ? ".moved" : ""), {}, h("i." + toneOf(id), { vars: { height: Math.max(4, (m / top) * 64) + "px" } }), h("small", { text: dayLetter(d) })); })),
      h("p.line-said", { text: `${fw ? fw.name : "Rest"} on ${dayName(to)}; ${idOf(to) ? `${wkById(idOf(to))?.name || "its session"} on ${dayName(day)}` : `rest on ${dayName(day)}`}.${hardOn(addDays(to, -1)) || hardOn(addDays(to, 1)) ? " That puts it next to a hard day: go easy on the other." : ""}` })),
    h("button.btn.mv-go", { type: "button", "data-k": "move", disabled: to == null, onclick: keepIt }, to == null ? "Choose a Day" : `Move to ${dayName(to)}`),
  ] };
}
let moveTo = null;
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
function rhythmSetup({ first = false, at = null } = {}) {
  const editing = !!S.rhythm, draft = { ...R.DEFAULTS, ...(S.rhythm || {}) };
  draft.days = [...draft.days];
  // (the steps: someone new has had Garmin's first; little of your own riding to go by, a step asking where you've
  // been, so Rhythm starts there; your numbers, setting up, not changing your week)
  const needLevel = R.sparse(S.own.map((a) => ({ start: a.start })), TODAY);
  const STEPS = [first && "garmin", "days", needLevel && "level", !editing && "numbers", "style", "goal", "event", "preview"].filter(Boolean);
  const dots = (k) => { const n = STEPS.indexOf(k) + 1; return h("div.rh-dots", { role: "img", "aria-label": `Step ${n} of ${STEPS.length}` }, STEPS.map((_, i) => h("i" + (i + 1 === n ? ".now" : i + 1 < n ? ".done" : "")))); };
  const top = (k, title, sub) => [dots(k), h("div.sheet-top", {}, h("h1", { text: title }), sub && h("div.sub", { text: sub }))];
  const next = (label, view) => h("button.btn.rh-next", { type: "button", "data-k": "next", onclick: () => push(view, view.step) }, label);
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
      track.addEventListener("pointerdown", (e) => { if (e.button > 0) return; down = { y: e.clientY, moved: false }; track.classList.add("dragging"); track.setPointerCapture(e.pointerId); e.preventDefault(); });
      track.addEventListener("pointermove", (e) => { if (!down) return; if (Math.abs(e.clientY - down.y) > 4) down.moved = true; if (down.moved) { draft.days[i] = at(e); paint(); } });
      const release = () => { down = null; track.classList.remove("dragging"); };
      track.addEventListener("pointerup", () => { if (down) pick(i); release(); });
      track.addEventListener("pointercancel", release);
      track.addEventListener("lostpointercapture", release);
      track.addEventListener("focus", () => pick(i));
      track.addEventListener("keydown", (e) => { const d = { ArrowUp: 15, ArrowRight: 15, ArrowDown: -15, ArrowLeft: -15 }[e.key]; if (d) { e.preventDefault(); days.sel = i; step(d); } else if (e.key === "Home" || e.key === "End") { e.preventDefault(); days.sel = i; draft.days[i] = e.key === "Home" ? 0 : MAX; paint(); } });
      Object.assign(track, { tabIndex: 0 }); track.setAttribute("role", "slider"); track.setAttribute("aria-label", NAMES[i]); track.setAttribute("aria-orientation", "vertical"); track.setAttribute("aria-valuemin", 0); track.setAttribute("aria-valuemax", MAX);
      setTimeout(paint);
      return h("div.rh-day", {}, label, track, h("small", { text: "MTWTFSS"[i] }));
    });
    const preset = (name, v) => h("button.pill.small", { type: "button", onclick: () => { draft.days = [...v]; Sheet.redraw(); } }, name);
    setTimeout(sum);
    return { title: editing ? "Your week" : "Rhythm", body: [...top("days", "When do you ride?", draft.engine === 2 ? "Set your riding time for a usual week. Drag a bar, or tap a day and use − and +. All the way down is a rest day." : "Drag each day up to how long you usually have, or tap a day and use − and +. All the way down is a rest day."),
      h("div.card.rh-days", {}, h("div.rh-sum", {}, total, count), h("div.rh-bars", {}, cols)),
      h("div.rh-daystep", {}, selName, h("span.stepper", { role: "group", "aria-label": "That day’s time" },
        h("button", { type: "button", "aria-label": "15 minutes less", onclick: () => step(-15) }, icon("minus", 16, 2.4)), selVal,
        h("button", { type: "button", "aria-label": "15 minutes more", onclick: () => step(15) }, icon("plus", 16, 2.4)))),
      section("Or start from", h("div.rh-presets", {}, preset("Evenings and weekends", [0, 60, 60, 60, 0, 150, 90]), preset("Weekends only", [0, 0, 0, 0, 0, 180, 150]), preset("Most days", [45, 75, 60, 75, 0, 180, 120]))),
      h("button.btn.rh-next", { type: "button", onclick: () => (draft.days.some((x) => x) ? ((v) => push(v, v.step))(needLevel ? level : editing ? style : numbersStep) : toast("Choose at least one day to ride", true)) }, "Next")] };
  };
  // 1b. Where you've been riding lately (only with less than a month of your own rides to go by)
  const level = () => {
    if (!draft.level) draft.level = "some";
    const opt = (k, t, sub) => h("button.rh-choice" + (draft.level === k ? ".on" : ""), { type: "button", role: "radio", "aria-checked": String(draft.level === k), onclick: () => { draft.level = k; Sheet.redraw(); } },
      h("span.tx", {}, h("b", { text: t }), h("small", { text: sub })), h("span.tick", {}, draft.level === k ? icon("check", 13, 3.2) : null));
    return { title: editing ? "Your week" : "Rhythm", body: [dots("level"), h("div.sheet-top", {}, h("h1", { text: "How much have you been riding?" }),
      h("div.sub", { text: `The last month or so. ${S.own.length ? `You’ve uploaded ${plural(S.own.length, "ride")}, so` : "With no rides uploaded yet,"} Rhythm starts from this, and learns from every ride you add.` })),
      h("div.rh-choices", { role: "radiogroup", "aria-label": "Riding lately" },
        opt("none", "Hardly at all", "Starting again, or new to it"), opt("some", "A ride or two a week", "About 2 to 4 hours"), opt("regular", "Most weeks, regularly", "About 5 to 8 hours"), opt("lots", "A lot", "9 hours or more")),
      next("Next", editing ? style : numbersStep)] };
  };
  // 1c. Your numbers: every target's set from them (worked out from your rides till you set them)
  const numbersStep = () => ({ title: "Rhythm", body: [...top("numbers", "Your numbers", "Every target in your plan is set from these. Not sure? Leave them: Fitness works them out from your rides, and keeps them up to date."),
    h("div.group", {}, stepper("FTP", "ftp", (v) => `${v} W`, 5, 80, 500), stepper("Weight", "weight", (v) => weight(v), 0.5, 35, 150), stepper("Max heart rate", "maxHr", (v) => `${v} bpm`, 1, 120, 230)),
    h("p.rh-note", { text: "Threshold heart rate and paces follow from these. Change any of them in Settings, from your photo." }),
    next("Next", style)] });
  // 2. How you like to ride, and a run and a swim
  const pic = (bars) => h("span.rh-pic", { "aria-hidden": "true" }, bars.map(([v, z]) => h("i.bg-" + z, { vars: { "--h": v + "%" } })));
  const style = () => {
    const choice = (k, title, sub, bars) => h("button.rh-choice" + (draft.lean === k ? ".on" : ""), { type: "button", role: "radio", "aria-checked": String(draft.lean === k), onclick: () => { draft.lean = k; Sheet.redraw(); } },
      pic(bars), h("span.tx", {}, h("b", { text: title }), h("small", { text: sub })), h("span.tick", {}, draft.lean === k ? icon("check", 13, 3.2) : null));
    const tile = (k, ic, title) => h("button.rh-tile" + (draft[k] ? ".on." + k : ""), { type: "button", "aria-pressed": String(!!draft[k]), onclick: () => { draft[k] = !draft[k]; Sheet.redraw(); } },
      h("span.ic", {}, icon(ic, 18, 2)), h("b", { text: title }), h("small", { text: draft[k] ? "On" : "Off" }));
    return { title: editing ? "Your week" : "Rhythm", body: [...top("style", "How do you like to ride?", "Rhythm keeps every kind of effort sharp; this is where it leans."),
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
    return { title: editing ? "Your week" : "Rhythm", body: [...top("goal", "Build, or hold?", "You can change this any time, say for a busy month."),
      h("div.rh-goals", { role: "radiogroup", "aria-label": "Build or hold" },
        card("build", "Keep building", draft.engine === 2 ? "Use your scheduled riding time, with manageable intervals and recovery around them." : "Up a few points a week, never faster, with a lighter week every fourth. Uses all the time you gave.", "M0 54 C40 50, 60 46, 90 42 S 130 40, 150 40 C170 40, 190 32, 230 26 S 280 20, 300 18 L326 14", "up"),
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
    const go = () => { if (ev && !ev.date) { toast("Choose its date", true); return date.focus(); } push(preview, "preview"); };
    const weeksTo = ev?.date ? Math.round((ev.date - TODAY) / (7 * DAY)) : null;
    return { title: editing ? "Your week" : "Rhythm", body: [...top("event", "Riding towards something?", "Rhythm shapes the weeks before it for what it asks of you, then tapers, so you arrive fresh. Or nothing in particular: Rhythm keeps you getting fitter."),
      h("div.rh-choices", { role: "radiogroup", "aria-label": "Riding towards" },
        opt("none", "Nothing in particular", "Fitter, all year", "wave"), opt("sportive", "A sportive", "Long days, climbs: threshold and staying power", "mountain"),
        opt("race", "A road race", "Attacks and sprints: top-end work", "bolt"), opt("tt", "A time trial", "Steady and hard: threshold", "gauge")),
      ev && h("div.ev-when", {}, date, name, h("small.rh-note", { text: weeksTo != null ? (weeksTo >= 6 ? `${plural(weeksTo, "week")} away: the last six themed for it, then a two-week taper.` : weeksTo >= 2 ? `${plural(weeksTo, "week")} away: straight into the build for it, then the taper.` : "Close: Rhythm goes straight into the taper.") : "The day, so Rhythm can count back from it." })),
      h("button.btn.rh-next", { type: "button", onclick: go }, "See your first week")] };
  };
  // 4. The first week, as Rhythm would have it, before anything's kept
  let previewLoad = null, previewError = null;
  const loadPreview = () => {
    if (previewLoad) return;
    previewError = null;
    previewLoad = coach.load().catch(e => { previewError = e.message || "Training is temporarily unavailable."; }).finally(() => { previewLoad = null; Sheet.redraw?.(); });
  };
  const preview = () => {
    if (draft.engine === 2 && !coach.ready()) {
      const error = previewError || coach.state().error;
      if (!error) loadPreview();
      return { title: "Your week", body: [...top("preview", "Your next seven days", error || "Building your training preview…"),
        error && h("button.btn", { type: "button", onclick: () => { loadPreview(); Sheet.redraw?.(); } }, "Try again")] };
    }
    const acts = S.own.map((a) => ({ start: a.start, sport: a.sport, sum: sumOf(a) }));
    const prefs = { ...draft, start: S.rhythm?.start ?? mondayOf(TODAY), at: S.rhythm?.at ?? TODAY };
    const r = draft.engine === 2 ? coach.plan({ prefs }) : R.plan({ prefs, acts, feel: S.feel, today: TODAY, ftp: P().ftp, paces: { run: runSpeed(), swim: swimSpeed() } });
    const ds = r.days.filter((d) => d.date >= TODAY).slice(0, 7), t = R.targets ? r.targets : undefined;
    const mins = ds.reduce((a, d) => a + d.mins, 0), hard = ds.filter((d) => d.hard), easy = mins ? Math.round(100 * (1 - hard.reduce((a, d) => a + (r.beta ? (r.workouts[d.id]?.workSecs || 0) / 60 : Math.min(d.mins, 60) * 0.55), 0) / mins)) : 100;
    const rowOf = (d) => { const w = d.id ? r.workouts?.[d.id] || R.workoutOf(d.id, t) : null;
      return h("div.row.plain" + (d.date === TODAY ? ".today" : ""), {}, h("span.when", {}, h("b", { text: new Date(d.date).getDate() }), h("small", { text: d.date === TODAY ? "Today" : dayName(d.date).slice(0, 3) })),
        h("span.tx", {}, h("b", { text: w ? `${w.name}${d.strength ? " + strength" : ""}` : "Rest" }), h("small", { text: w ? [dur(d.mins * 60), d.fuel ? `eat ${d.fuel}` : null].filter(Boolean).join(" · ") : d.why })),
        w && h("span.mini", {}, C.profile(w, { mini: true, pace: paceFor(w.sport) }))); };
    const start = () => {
      S.rhythm = { ...draft, start: S.rhythm?.start ?? mondayOf(TODAY), at: S.rhythm?.at ?? TODAY };
      if (S.chosen) { S.chosen = null; S.swaps = {}; keep("plan", "swaps"); }
      keep("rhythm"); closeSheet(); toast(editing ? "Your week is saved" : "Rhythm has started"); X.fw.nav?.section?.("today"); redraw("plan");
    };
    return { title: editing ? "Your week" : "Rhythm", body: [...top("preview", editing ? "Your next seven days" : "Your first week", r.beta ? `${dur(r.weekly.minutes * 60)} weekly target. ${r.weekly.why}.` : `${R.THEMES[r.block.theme]} block${r.block.absorb ? ", a lighter week" : ""}. Each day firms up that morning, from what you’ve done and how you feel.`),
      h("div.group", {}, ds.map(rowOf)),
      h("div.rh-stats", {}, [["Time", dur(mins * 60)], ["Hard days", String(hard.length)], ["Easy", `${easy}%`]].map(([k, v]) => h("div", {}, h("small", { text: k }), h("b", { text: v })))),
      h("button.btn.rh-next", { type: "button", "data-k": "start", onclick: start }, editing ? "Save" : "Start Rhythm"),
      h("p.rh-note", { text: "Change your week any time from Your week, on Today" })] };
  };
  Object.assign(days, { step: "days" }); Object.assign(level, { step: "level" }); Object.assign(numbersStep, { step: "numbers" });
  Object.assign(style, { step: "style" }); Object.assign(goal, { step: "goal" }); Object.assign(event, { step: "event" }); Object.assign(preview, { step: "preview" });
  // (straight to a step: your event, from Today's Riding towards; or the one asked for)
  const first0 = at === "event" && editing ? event : { level, numbers: numbersStep, style, goal, event, preview }[at] || days;
  return openSheet(first0, { sheet: "rhythm-setup", tall: true });
}
// a day: what's planned, what's done
// (asDay: the day's own sheet, whatever's on it: a link to a day (#day=) opens the day, not the one thing on it)
function openDay(day, { asDay = false } = {}) {
  if (!asDay && rhythmOn() && actsOn(day).length === 1) return X.open.act(actsOn(day)[0].id);
  if (rhythmOn() && rhDay(day) && !actsOn(day).length) return openSheet(() => rhDayView(day), { sheet: "fx-day" });
  const id = plannedOn(day), w = id && id !== "event" ? wkById(id) : null, did = actsOn(day);
  if (!asDay && did.length === 1 && !w) return X.open.act(did[0].id);
  if (!asDay && !did.length && w) return openWorkout(w);
  openSheet(() => ({
    title: dayLong(day),
    body: [h("div.sheet-top", {}, h("h1", { text: dayLong(day) }), h("div.sub", { text: w ? `Planned: ${w.name}` : id === "event" ? "Event day" : "A rest day" })),
      w && section("Planned", h("div.group", {}, workoutRow(w))),
      did.length ? section("Done", h("div.group", {}, did.map(actRow))) : h("p", { text: day < TODAY ? "Nothing recorded this day." : "Nothing recorded yet." })],
  }), { sheet: "fx-day" });
}

function workoutRow(w) {
  const m = measure(w, paceFor(w.sport));
  return h("button.row", { type: "button", onclick: () => openWorkout(w) },
    h("span.mini", {}, C.profile(w, { mini: true, pace: paceFor(w.sport) })),
    h("span.tx", {}, h("b", { text: w.name }), h("small", { text: [dur(m.secs), w.sport === "swim" ? dist(F_metres(w), true) : null, w.sport !== "strength" ? `TSS ${Math.round(m.tss)}` : null].filter(Boolean).join(" · ") })),
    h("span.chev", {}, icon("chev", 17, 2.4)));
}
const F_metres = (w) => flatten(w).reduce((a, s) => a + (s.metres || 0), 0);
function openWorkout(w) { openSheet(() => workoutView(w), { sheet: "workout", tall: true }); }
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
        // (asked twice, as an activity is: a workout can't be brought in again once it's gone)
        h("button.row.action.danger", { type: "button", onclick: (e) => {
          const b = e.currentTarget;
          if (!b.dataset.sure) { b.dataset.sure = "1"; b.textContent = "Delete It, for Good"; return; }
          S.mine = S.mine.filter((x) => x.id !== w.id); keep("workouts"); closeSheet(); toast("Workout deleted"); redraw("plan");
        } }, "Delete Workout")),
    ],
  };
}
// (a workout's sport and kind, the kind left out where it only says the sport again: Strength, not Strength · Strength)
const kindSaid = (w) => (w.kind && w.kind !== SPORTS[w.sport].name ? `${SPORTS[w.sport].name} · ${w.kind}` : SPORTS[w.sport].name);
// Sending a workout: a file for each device and app, and how to get it there
// (named by the day it's for: 2026-10-25.fit; a workout from the library, today)
// Download: a workout as a .fit file named by its day. Straight away for the device you chose last (else the one your
// rides come from), then how to get it on; or a choice of device, the first time
function myDevice() {
  const k = store.get("device", null);
  if (k?.brand === "garmin" || k?.brand === "wahoo") return k;
  const d = S.own.find((a) => /garmin|wahoo/i.test(a.device || ""));
  return d ? { brand: /wahoo/i.test(d.device) ? "wahoo" : "garmin", name: d.device } : null;
}
async function download(w, day = TODAY, dev = myDevice()) {
  const show = (v, page) => (sheetUp() ? push(v, page) : openSheet(v, { sheet: "send-device" }));
  if (!dev) return show(() => sendView(w, day), "device");
  if(S.rhythm?.engine===2 && w.engine === "rhythm-2.0"){try{const r=await coach.record(day);w=coach.workout("r2p:"+r.id);}catch(e){return toast(e.message,true);}}
  const name = `${dayStamp(day)}.fit`;
  let F;
  try { F = await formats(); } catch (_) { return toast("That file couldn’t be made just now.", true); }
  // (a blob and an <a download>, saveFile's: the file saved in this tap's turn, nothing sent anywhere)
  saveFile(name, F.fitFromWorkout(w, { pace: paceFor(w.sport) }));
  show(() => savedView(w, day, dev, name), "saved");
}
const devName = (dev) => dev.name || (dev.brand === "wahoo" ? "Wahoo" : "Garmin");
// (under a Download button: which device it's for, and another a tap away)
function dlFor(w, day) {
  const dev = myDevice();
  return dev && h("p.dl-for", {}, `For your ${devName(dev)} · `, h("button.link.small", { type: "button", onclick: () => openSheet(() => sendView(w, day), { sheet: "send-device" }) }, "Another device?"));
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
    section(null, h("div.group", {}, row({ icon: "device", tint: "grey", title: "Another device", onclick: () => push(() => sendView(w, day), "device") }))),
  ] };
}

// ---- the openers the entry binds (ctx.open.*) ----
const dayArg = (d) => { const n = Number(d); return Number.isFinite(n) ? startOfDay(n) : TODAY; };
export function openSession(ctx, day) { use(ctx); const d = dayArg(day); openSheet(() => sessionView(d), { sheet: "session", tall: true }); }
function openWorkoutBy(ctx, id, day) {
  use(ctx);
  const w = typeof id === "object" && id ? id : wkById(id) || workoutById(id);
  if (!w) return toast("That workout isn’t here any more.", true);
  openWorkout(w);
}
export { openWorkoutBy as openWorkout };
function openDayOf(ctx, day, o) { use(ctx); openDay(dayArg(day), o); }
export { openDayOf as openDay };
export function openMove(ctx, day) { use(ctx); moveTo = null; const d = dayArg(day); openSheet(() => moveView(d), { sheet: "move" }); }
export function openWorkouts(ctx) { use(ctx); openSheet(workoutsView, { sheet: "workouts", tall: true }); }
// (open, it holds the framework's reloads back: S2-D21, core.busy() while Rhythm's setup is up)
export function openRhythmSetup(ctx, step = 0) {
  use(ctx);
  const hd = rhythmSetup({ at: typeof step === "string" ? step : null });
  if (hd?.el) { X.core.hold?.("rhythm-setup", true); hd.el.addEventListener("close", () => X.core.hold?.("rhythm-setup", false), { once: true }); }
}
export function openSendDevice(ctx, wid, day) {
  use(ctx);
  const w = wkById(wid) || workoutById(wid);
  if (!w) return toast("That workout isn’t here any more.", true);
  openSheet(() => sendView(w, day == null ? TODAY : dayArg(day)), { sheet: "send-device" });
}
export { dlFor, download, kindSaid, moveView, myDevice, rhDayView, sendView, sessionView, workoutRow, workoutView, workoutsView };
