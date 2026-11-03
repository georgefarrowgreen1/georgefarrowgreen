// Plans made in Chat, arriving in Fitness: a ride or a run a friend and you said yes to in Chat (functions/_fitshare.js
// fx_offers, in GET me's offers). Each waits at the top of Today until you add it to your plan, leave it for now, or
// say no thanks; nothing in your plan changes till you tap. Added, it's a swap of that day's session, like any other
// (S.swaps), and who it's with is the offer's, kept by the account till its day is over, not in your record: so an
// older Fitness saving your record whole loses nothing.
// And InFlite Today's own rides (role "today", from nobody: Today's habit rule, functions/_todayacts.js), in GET me's offers
// only as Fitness asks for them (?today=1): one Today added (agreed already) waits on Today here with Keep and Undo, one
// it suggests with Add to My Plan; an agreed one is put in its day as a swap as Fitness opens, once (todaySwaps), and
// taken out again once it's undone, here or on Today, while the day still holds its workout.
// The rules are plain functions (node imports them for the tests); the cards and the sheet take app.js's own helpers
// (X: its exports, handed in by today.js), as this file can't import app.js without the page.
import { startOfDay, addDays, mondayOf, DAY } from "./workouts.js";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n) => String(n).padStart(2, "0");
const ok = (o) => !!o && typeof o === "object" && typeof o.id === "string" && Number.isFinite(o.start) && Number.isFinite(o.stop) && typeof o.wid === "string" && typeof o.who === "string";

// ---- the rules ----
// The agreed plan (state yes) that a day's session is: the day's swap its workout, on the day it starts here. → offer | null
export function withOffer(day, swaps, offers) {
  const id = swaps?.[day];
  if (typeof id !== "string" || !Array.isArray(offers)) return null;
  return offers.find((o) => ok(o) && o.state === "yes" && o.wid === id && startOfDay(o.start) === day) || null;
}
// …and who it's with (their first name), for " · with Leo" (one of Today's own: nobody)
export const withOf = (day, swaps, offers) => withOffer(day, swaps, offers)?.who || null;
// what the day's card says of it after the session's kind: " · with Leo", or " · from Today"
export const withChip = (o) => (o.role === "today" ? " · from Today" : ` · with ${o.who}`);
// The plans waiting (state new, not over yet, not left for now), soonest first
export const waiting = (offers, { now = Date.now(), hidden = null } = {}) =>
  (Array.isArray(offers) ? offers : []).filter((o) => ok(o) && o.state === "new" && o.stop > now && !hidden?.has(o.id)).sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : 1));
// a day, as Fitness says one near: "Today", "Tomorrow", "Saturday", further on "Sat 14 Nov"
export function dayWord(ms, now = Date.now()) {
  const n = Math.round((startOfDay(ms) - startOfDay(now)) / DAY), d = new Date(ms);
  return n === 0 ? "Today" : n === 1 ? "Tomorrow" : n > 1 && n < 7 ? DAYS[d.getDay()] : `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
}
// on the phone's clock, "10:00–12:00"
const clock = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const spanOf = (o) => `${clock(o.start)}–${clock(o.stop)}`;
// What a waiting plan says: { title: "Ride with Leo", when: "Saturday 10:00–12:00 · Ride how you like", line, far }
export function offerWords(o, now = Date.now()) {
  const verb = o.sport === "run" ? "Run" : "Ride";
  return {
    title: `${verb} with ${o.who}`,
    when: `${dayWord(o.start, now)} ${spanOf(o)} · ${o.name}`,
    line: o.role === "asked" ? `${o.who} said yes in Chat. Add it to your plan?` : `You said yes to ${o.who} in Chat. Add it to your plan?`,
    far: o.far ? "Same time, each where you are." : null,
  };
}
// The line on the day's card once it's in: "Riding with Leo, 10:00–12:00." (one of Today's own: "Added by Today,
// 10:00–12:00.")
export const withLine = (o) => (o.role === "today" ? `Added by Today, ${spanOf(o)}.` : `${o.sport === "run" ? "Running" : "Riding"} with ${o.who}, ${spanOf(o)}.`);
// Today's own rides to show at the top of Today: one it added and no tap has kept yet (state yes, not taken: Keep or
// Undo), and one it suggests (state new: Add to My Plan), not over yet, not left for now
export const fromToday = (offers, { now = Date.now(), hidden = null } = {}) =>
  (Array.isArray(offers) ? offers : []).filter((o) => ok(o) && o.role === "today" && (o.state === "new" || (o.state === "yes" && !o.taken)) && o.stop > now && !hidden?.has(o.id));
// What one of Today's says: { chip: "From Today", title: "Ride Thursday 10:00", when: "10:00–12:00 · Ride how you like",
// line }
export function todayWords(o, now = Date.now()) {
  const added = o.state === "yes";
  return {
    chip: "From Today",
    title: `${o.sport === "run" ? "Run" : "Ride"} ${dayWord(o.start, now)} ${clock(o.start)}`,
    when: `${spanOf(o)} · ${o.name}`,
    line: `${added ? "Today added this ride: you often ride then." : "Today suggests this ride: you often ride then."}${o.dry ? " It looks dry." : ""} ${added ? "Keep it, or undo it." : "Add it to your plan?"}`,
  };
}
// The swaps Today's own rides make (spec §9.2), worked out as Fitness opens with the account's own answer: each agreed one
// (state yes) put in its day as a swap the first time it's seen here (remembered in applied, by its id: its day and
// workout), unless that day's been changed by hand meanwhile; and each applied before that's no longer agreed (undone,
// here or on Today, or gone) taken out again, but only while its day, today or later, still holds its workout (withOffer's
// test). offers: GET me's; swaps: the record's; applied: { id: { day, wid } }, as last left; today: today's start.
// → { set: [[day, wid]], drop: [day], applied } (applied as it now is; set and drop for the record's swaps)
export function todaySwaps(offers, swaps, applied, today) {
  const yes = new Map((Array.isArray(offers) ? offers : []).filter((o) => ok(o) && o.role === "today" && o.state === "yes").map((o) => [o.id, o]));
  const was = applied && typeof applied === "object" ? applied : {}, out = {}, set = [], drop = [], sw = swaps || {};
  for (const o of yes.values()) {
    if (was[o.id]) { out[o.id] = was[o.id]; continue; }
    const day = startOfDay(o.start);
    if (sw[day] === undefined && !set.some(([d]) => d === day)) set.push([day, o.wid]);
    out[o.id] = { day, wid: o.wid };
  }
  for (const [id, a] of Object.entries(was)) {
    if (yes.has(id) || !a || !Number.isFinite(a.day)) continue;
    if (a.day >= today && sw[a.day] === a.wid) drop.push(a.day);
  }
  return { set, drop, applied: out };
}
// What adding it does to its day, in the sheet: was, what's planned there now (app.js plannedOn: a workout id, "event",
// null for a rest day, undefined for a day with nothing planned yet: past Rhythm's days, or no plan at all); ww, that
// workout (null for a rest day, or one gone from your workouts since, which Today shows as rest too)
// (who: none for one of Today's own, which is nobody's)
export function addWords({ word, was, ww, wid, name, who, span }) {
  const w = who ? ` with ${who}` : "", c = who ? `, with ${who}` : "";
  return was === "event" ? `${word} is your event day: ${name}${w} goes in its place.`
    : was === undefined ? `${word} isn't planned yet: ${name}${w} goes in.`
    : !ww ? `${word} is a rest day: ${name}${w} goes in its place.`
    : ww.id === wid ? `${word}: ${name}${c}, ${span}.`
    : `${word}: ${ww.name} becomes ${name}${c}, ${span}.`;
}

// ---- the cards, at the top of Today ----
// (left for now: till the app's next opened)
const later = new Set();
export function offerCards(X) {
  const { h, icon, S } = X;
  const friends = waiting(S.offers, { hidden: later }).filter((o) => o.role !== "today"), mine = fromToday(S.offers, { hidden: later });
  return [...friends, ...mine].filter((o) => X.wkById(o.wid)).sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : 1)).map((o) => {
    if (o.role === "today") {
      const w = todayWords(o), added = o.state === "yes";
      return h("div.card.glass.offer.from-today", { "data-offer": o.id },
        h("span.offer-chip", {}, icon("sparkle", 14, 2.2), w.chip),
        h("h2", { text: w.title }),
        h("p.offer-when", { text: w.when }),
        h("p.about", { text: w.line }),
        h("div.acts", {}, ...(added
          ? [h("button.pill.primary", { type: "button", onclick: () => keepToday(X, o) }, "Keep"), h("button.pill", { type: "button", onclick: () => undoToday(X, o) }, "Undo")]
          : [h("button.pill.primary", { type: "button", onclick: () => X.openSheet(() => addView(X, o)) }, "Add to My Plan"), h("button.pill", { type: "button", onclick: () => { later.add(o.id); X.redraw(); } }, "Not Now")])));
    }
    const w = offerWords(o);
    return h("div.card.glass.offer", { "data-offer": o.id },
      h("span.offer-chip", {}, icon("inbox", 14, 2.2), "From Chat"),
      h("h2", { text: w.title }),
      h("p.offer-when", { text: w.when }),
      h("p.about", { text: w.line + (w.far ? ` ${w.far}` : "") }),
      h("div.acts", {},
        h("button.pill.primary", { type: "button", onclick: () => X.openSheet(() => addView(X, o)) }, "Add to my plan"),
        h("button.pill", { type: "button", onclick: () => { later.add(o.id); X.redraw(); } }, "Not now"),
        h("button.pill", { type: "button", onclick: () => answer(X, o, "no") }, "No thanks")));
  });
}
// The plan's answer, told to the account (POST offers/<id>), and kept here as it's said (a yes is a tap: taken)
async function answer(X, o, a) {
  try {
    await X.A.offer(o.id, a);
    o.state = a;
    if (a === "yes") o.taken = true;
    X.redraw();
    if (a === "no" && o.role !== "today") X.toast("Fitness keeps your plan as it was.");
    return true;
  } catch (e) {
    // (one answered already on another phone, or gone: no longer waiting here either)
    if (e.status === 404) { o.state = "gone"; X.redraw(); }
    X.toast(e.message, true);
    return false;
  }
}
// One of Today's own, added by it: kept (a tap: from now on it's a ride of yours, as one you set), or undone (said no to,
// and its swap taken out again while its day still holds its workout: X.todayRides)
async function keepToday(X, o) {
  if (!(await answer(X, o, "yes"))) return;
  X.todayRides();
  X.toast(`Kept: ${dayWord(o.start)}’s ride stays in your plan.`);
}
export async function undoToday(X, o) {
  if (!(await answer(X, o, "no"))) return;
  X.todayRides();
  X.redraw();
  X.toast("Undone: your plan’s as it was.");
}
// An offer by its id (#offer=<id>: InFlite's links and notifications), opened: one waiting to be added, its sheet; one of
// Today's added already, its card, in sight. → whether there was one
export function openOffer(X, id) {
  const o = (X.S.offers || []).find((x) => ok(x) && x.id === String(id).toLowerCase() && x.stop > Date.now());
  if (!o || !X.wkById(o.wid)) return false;
  later.delete(o.id);
  if (o.state === "new") { X.openSheet(() => addView(X, o)); return true; }
  if (X.sheetEl?.open) X.closeSheet();
  X.redraw();
  requestAnimationFrame(() => document.querySelector(`[data-offer="${o.id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
  return true;
}

// ---- adding it: what it does to the day, and the week as it would be, before anything's kept ----
export function addView(X, o) {
  const { h, S } = X, day = startOfDay(o.start), word = dayWord(o.start), span = spanOf(o);
  const idOf = (d) => (d === day ? o.wid : X.plannedOn(d) ?? null), was = X.plannedOn(day);
  const ww = was && was !== "event" ? X.wkById(was) : null, nw = X.wkById(o.wid);
  const hardOn = (d) => { const id = X.plannedOn(d); if (!id || id === "event") return false; const w = X.wkById(id); return !!w && w.sport === "ride" && X.measure(w, X.paceFor(w.sport)).iF >= 0.84; };
  const name = nw?.name || o.name, mine = o.role === "today";
  let said = addWords({ word, was, ww, wid: o.wid, name, who: mine ? null : o.who, span });
  if (hardOn(addDays(day, -1)) || hardOn(addDays(day, 1))) said += " That puts it next to a hard day: go easy on the other.";
  // (the week as it would be: each day's minutes, in its colour)
  const wk = Array.from({ length: 7 }, (_, i) => addDays(mondayOf(day), i));
  const minsOf = (id) => { const w = id && id !== "event" ? X.wkById(id) : null; return w ? X.measure(w, X.paceFor(w.sport)).secs / 60 : 0; };
  const top = Math.max(60, ...wk.map((d) => minsOf(idOf(d))));
  const toneOf = (id) => { const w = id && id !== "event" ? X.wkById(id) : null; if (!w) return "rest"; if (w.sport !== "ride") return "tint"; const f = X.measure(w, X.paceFor(w.sport)).iF; return f >= 0.95 ? "z6" : f >= 0.84 ? "z4" : f >= 0.76 ? "z3" : "z2"; };
  const keepIt = async () => {
    // (the account told first, so the day says who it's with; only once it's agreed, the day's session swapped for the
    // plan's, as any change to a day is, and kept with your record: a plan answered already elsewhere changes nothing.
    // One of Today's own: remembered as put in, so it comes out again if it's undone on Today)
    X.closeSheet();
    if (!(await answer(X, o, "yes"))) return;
    S.swaps[day] = o.wid; X.keep("swaps");
    if (mine) X.todayRides();
    X.redraw();
    X.toast(mine ? `Added: ${word}, ${span}.` : `Added: ${word}, with ${o.who}.`);
  };
  return { title: "Add to your plan", body: [
    h("div.sheet-top", {}, h("h1", { text: mine ? `${o.sport === "run" ? "Run" : "Ride"} ${word}` : `${o.sport === "run" ? "Run" : "Ride"} with ${o.who}` }), h("div.sub", { text: `${word} ${span} · ${name}${mine ? " · from Today" : ""}` })),
    h("p.offer-said", { text: said }),
    h("div.card.glass.mv-week", {}, h("small", { text: "Your week, then" }),
      h("div.mv-bars", {}, wk.map((d) => { const id = idOf(d), m = minsOf(id); return h("div" + (d === day ? ".moved" : ""), {}, h("i." + toneOf(id), { vars: { height: Math.max(4, (m / top) * 64) + "px" } }), h("small", { text: X.dayLetter(d) })); }))),
    h("div.acts.offer-acts", {},
      h("button.btn", { type: "button", onclick: keepIt }, mine ? "Add to My Plan" : "Add to my plan"),
      h("button.btn.quiet", { type: "button", onclick: () => X.closeSheet() }, "Not now")),
  ] };
}
