// Plans waiting on Today, under the roof (One roof stage 2, §4.3, BI2): the view half of fitness/invites.js (offerCards
// :112, undoToday :162, openOffer :170, addView :182), static so the offers are there on first paint. The rules are
// invites.js's own pure half, imported unchanged. ctx = fitness.js's { S, core, fw, open }.
//   offerCards(ctx) → [card]   each div.card.offer[data-offer=<id>], its buttons [data-k=keep|undo|add|later|no]
//   openOffer(ctx, id) → boolean   (#offer=<id>) one waiting: its sheet (data-sheet=offer); one of Today's added: its card
//     scrolled into sight (found in the module's screen, never the document)
//   undoToday(ctx, o), addView(ctx, o) (a sheet's view)
import { h, icon, S, A, wkById, plannedOn, measure, paceFor, dayLetter, keep, redraw, toast, todayRides, openSheet, closeSheet, sheetEl } from "./x.js";
import { waiting, fromToday, todayWords, offerWords, dayWord, spanOf, addWords } from "../invites.js";
import { startOfDay, addDays, mondayOf } from "../workouts.js";

const ok = (o) => !!o && typeof o === "object" && typeof o.id === "string" && Number.isFinite(o.start) && Number.isFinite(o.stop) && typeof o.wid === "string" && typeof o.who === "string";
// (left for now: till Fitness is opened again)
const later = new Set();
export function offerCards(ctx) {
  const friends = waiting(S.offers, { hidden: later }).filter((o) => o.role !== "today"), mine = fromToday(S.offers, { hidden: later });
  return [...friends, ...mine].filter((o) => wkById(o.wid)).sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : 1)).map((o) => {
    if (o.role === "today") {
      const w = todayWords(o), added = o.state === "yes";
      return h("div.card.glass.offer.from-today", { "data-offer": o.id },
        h("span.offer-chip", {}, icon("sparkle", 14, 2.2), w.chip),
        h("h2", { text: w.title }),
        h("p.offer-when", { text: w.when }),
        h("p.about", { text: w.line }),
        h("div.acts", {}, ...(added
          ? [h("button.pill.primary", { type: "button", "data-k": "keep", onclick: () => keepToday(ctx, o) }, "Keep"), h("button.pill", { type: "button", "data-k": "undo", onclick: () => undoToday(ctx, o) }, "Undo")]
          : [h("button.pill.primary", { type: "button", "data-k": "add", onclick: () => openSheet(() => addView(ctx, o), { sheet: "offer" }) }, "Add to My Plan"), h("button.pill", { type: "button", "data-k": "later", onclick: () => { later.add(o.id); redraw("offers"); } }, "Not Now")])));
    }
    const w = offerWords(o);
    return h("div.card.glass.offer", { "data-offer": o.id },
      h("span.offer-chip", {}, icon("inbox", 14, 2.2), "From Chat"),
      h("h2", { text: w.title }),
      h("p.offer-when", { text: w.when }),
      h("p.about", { text: w.line + (w.far ? ` ${w.far}` : "") }),
      h("div.acts", {},
        h("button.pill.primary", { type: "button", "data-k": "add", onclick: () => openSheet(() => addView(ctx, o), { sheet: "offer" }) }, "Add to My Plan"),
        h("button.pill", { type: "button", "data-k": "later", onclick: () => { later.add(o.id); redraw("offers"); } }, "Not Now"),
        h("button.pill", { type: "button", "data-k": "no", onclick: () => answer(o, "no") }, "No Thanks")));
  });
}
async function answer(o, a) {
  try {
    await A.offer(o.id, a);
    o.state = a;
    if (a === "yes") o.taken = true;
    redraw("offers");
    if (a === "no" && o.role !== "today") toast("Fitness keeps your plan as it was.");
    return true;
  } catch (e) {
    if (e.status === 404) { o.state = "gone"; redraw("offers"); }
    toast(e.message, true);
    return false;
  }
}
async function keepToday(ctx, o) {
  if (!(await answer(o, "yes"))) return;
  todayRides();
  toast(`Kept: ${dayWord(o.start)}’s ride stays in your plan.`);
  ctx.fw.changed?.();
}
export async function undoToday(ctx, o) {
  if (!(await answer(o, "no"))) return;
  todayRides();
  redraw("plan");
  toast("Undone: your plan’s as it was.");
  ctx.fw.changed?.();
}
export function openOffer(ctx, id) {
  const o = (S.offers || []).find((x) => ok(x) && x.id === String(id).toLowerCase() && (x.state === "new" || x.state === "yes") && x.stop > Date.now());
  if (!o || !wkById(o.wid)) return false;
  later.delete(o.id);
  if (o.state === "new") { openSheet(() => addView(ctx, o), { sheet: "offer" }); return true; }
  if (sheetEl.open) closeSheet();
  redraw("offers");
  requestAnimationFrame(() => ctx.fw.screenEl?.querySelector(`[data-offer="${o.id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
  return true;
}
export function addView(ctx, o) {
  const day = startOfDay(o.start), word = dayWord(o.start), span = spanOf(o);
  const idOf = (d) => (d === day ? o.wid : plannedOn(d) ?? null), was = plannedOn(day);
  const ww = was && was !== "event" ? wkById(was) : null, nw = wkById(o.wid);
  const hardOn = (d) => { const id = plannedOn(d); if (!id || id === "event") return false; const w = wkById(id); return !!w && w.sport === "ride" && measure(w, paceFor(w.sport)).iF >= 0.84; };
  const name = nw?.name || o.name, mine = o.role === "today";
  let said = addWords({ word, was, ww, wid: o.wid, name, who: mine ? null : o.who, span });
  if (hardOn(addDays(day, -1)) || hardOn(addDays(day, 1))) said += " That puts it next to a hard day: go easy on the other.";
  const wk = Array.from({ length: 7 }, (_, i) => addDays(mondayOf(day), i));
  const minsOf = (id) => { const w = id && id !== "event" ? wkById(id) : null; return w ? measure(w, paceFor(w.sport)).secs / 60 : 0; };
  const top = Math.max(60, ...wk.map((d) => minsOf(idOf(d))));
  const toneOf = (id) => { const w = id && id !== "event" ? wkById(id) : null; if (!w) return "rest"; if (w.sport !== "ride") return "tint"; const f = measure(w, paceFor(w.sport)).iF; return f >= 0.95 ? "z6" : f >= 0.84 ? "z4" : f >= 0.76 ? "z3" : "z2"; };
  const keepIt = async () => {
    closeSheet();
    if (!(await answer(o, "yes"))) return;
    S.swaps[day] = o.wid; keep("swaps");
    if (mine) todayRides();
    redraw("plan");
    toast(mine ? `Added: ${word}, ${span}.` : `Added: ${word}, with ${o.who}.`);
    ctx.fw.changed?.();
  };
  return { title: "Add to Your Plan", sheet: "offer", body: [
    h("div.sheet-top", {}, h("h1", { text: mine ? `${o.sport === "run" ? "Run" : "Ride"} ${word}` : `${o.sport === "run" ? "Run" : "Ride"} with ${o.who}` }), h("div.sub", { text: `${word} ${span} · ${name}${mine ? " · from Today" : ""}` })),
    h("p.offer-said", { text: said }),
    h("div.card.glass.mv-week", {}, h("small", { text: "Your week, then" }),
      h("div.mv-bars", {}, wk.map((d) => { const id = idOf(d), m = minsOf(id); return h("div" + (d === day ? ".moved" : ""), {}, h("i." + toneOf(id), { vars: { height: Math.max(4, (m / top) * 64) + "px" } }), h("small", { text: dayLetter(d) })); }))),
    h("div.acts.offer-acts", {},
      h("button.btn", { type: "button", "data-k": "keep", onclick: keepIt }, "Add to My Plan"),
      h("button.btn.quiet", { type: "button", onclick: () => closeSheet() }, "Not Now")),
  ] };
}
