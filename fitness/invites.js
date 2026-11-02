// Plans made in Chat, arriving in Fitness: a ride or a run a friend and you said yes to in Chat (functions/_fitshare.js
// fx_offers, in GET me's offers). Each waits at the top of Today until you add it to your plan, leave it for now, or
// say no thanks; nothing in your plan changes till you tap. Added, it's a swap of that day's session, like any other
// (S.swaps), and who it's with is the offer's, kept by the account till its day is over, not in your record: so an
// older Fitness saving your record whole loses nothing.
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
// …and who it's with (their first name), for " · with Leo"
export const withOf = (day, swaps, offers) => withOffer(day, swaps, offers)?.who || null;
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
// The line on the day's card once it's in: "Riding with Leo, 10:00–12:00."
export const withLine = (o) => `${o.sport === "run" ? "Running" : "Riding"} with ${o.who}, ${spanOf(o)}.`;
// What adding it does to its day, in the sheet: was, what's planned there now (app.js plannedOn: a workout id, "event",
// null for a rest day, undefined for a day with nothing planned yet: past Rhythm's days, or no plan at all); ww, that
// workout (null for a rest day, or one gone from your workouts since, which Today shows as rest too)
export function addWords({ word, was, ww, wid, name, who, span }) {
  return was === "event" ? `${word} is your event day: ${name} with ${who} goes in its place.`
    : was === undefined ? `${word} isn't planned yet: ${name} with ${who} goes in.`
    : !ww ? `${word} is a rest day: ${name} with ${who} goes in its place.`
    : ww.id === wid ? `${word}: ${name}, with ${who}, ${span}.`
    : `${word}: ${ww.name} becomes ${name}, with ${who}, ${span}.`;
}

// ---- the cards, at the top of Today ----
// (left for now: till the app's next opened)
const later = new Set();
export function offerCards(X) {
  const { h, icon, S } = X;
  return waiting(S.offers, { hidden: later }).filter((o) => X.wkById(o.wid)).map((o) => {
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
// The plan's answer, told to the account (POST offers/<id>), and kept here as it's said
async function answer(X, o, a) {
  try {
    await X.A.offer(o.id, a);
    o.state = a;
    X.redraw();
    if (a === "no") X.toast("Fitness keeps your plan as it was.");
    return true;
  } catch (e) {
    // (one answered already on another phone, or gone: no longer waiting here either)
    if (e.status === 404) { o.state = "gone"; X.redraw(); }
    X.toast(e.message, true);
    return false;
  }
}

// ---- adding it: what it does to the day, and the week as it would be, before anything's kept ----
function addView(X, o) {
  const { h, S } = X, day = startOfDay(o.start), word = dayWord(o.start), span = spanOf(o);
  const idOf = (d) => (d === day ? o.wid : X.plannedOn(d) ?? null), was = X.plannedOn(day);
  const ww = was && was !== "event" ? X.wkById(was) : null, nw = X.wkById(o.wid);
  const hardOn = (d) => { const id = X.plannedOn(d); if (!id || id === "event") return false; const w = X.wkById(id); return !!w && w.sport === "ride" && X.measure(w, X.paceFor(w.sport)).iF >= 0.84; };
  const name = nw?.name || o.name;
  let said = addWords({ word, was, ww, wid: o.wid, name, who: o.who, span });
  if (hardOn(addDays(day, -1)) || hardOn(addDays(day, 1))) said += " That puts it next to a hard day: go easy on the other.";
  // (the week as it would be: each day's minutes, in its colour)
  const wk = Array.from({ length: 7 }, (_, i) => addDays(mondayOf(day), i));
  const minsOf = (id) => { const w = id && id !== "event" ? X.wkById(id) : null; return w ? X.measure(w, X.paceFor(w.sport)).secs / 60 : 0; };
  const top = Math.max(60, ...wk.map((d) => minsOf(idOf(d))));
  const toneOf = (id) => { const w = id && id !== "event" ? X.wkById(id) : null; if (!w) return "rest"; if (w.sport !== "ride") return "tint"; const f = X.measure(w, X.paceFor(w.sport)).iF; return f >= 0.95 ? "z6" : f >= 0.84 ? "z4" : f >= 0.76 ? "z3" : "z2"; };
  const keepIt = async () => {
    // (the account told first, so the day says who it's with; only once it's agreed, the day's session swapped for the
    // plan's, as any change to a day is, and kept with your record: a plan answered already elsewhere changes nothing)
    X.closeSheet();
    if (!(await answer(X, o, "yes"))) return;
    S.swaps[day] = o.wid; X.keep("swaps");
    X.redraw();
    X.toast(`Added: ${word}, with ${o.who}.`);
  };
  return { title: "Add to your plan", body: [
    h("div.sheet-top", {}, h("h1", { text: `${o.sport === "run" ? "Run" : "Ride"} with ${o.who}` }), h("div.sub", { text: `${word} ${span} · ${name}` })),
    h("p.offer-said", { text: said }),
    h("div.card.glass.mv-week", {}, h("small", { text: "Your week, then" }),
      h("div.mv-bars", {}, wk.map((d) => { const id = idOf(d), m = minsOf(id); return h("div" + (d === day ? ".moved" : ""), {}, h("i." + toneOf(id), { vars: { height: Math.max(4, (m / top) * 64) + "px" } }), h("small", { text: X.dayLetter(d) })); }))),
    h("div.acts.offer-acts", {},
      h("button.btn", { type: "button", onclick: keepIt }, "Add to my plan"),
      h("button.btn.quiet", { type: "button", onclick: () => X.closeSheet() }, "Not now")),
  ] };
}
