// Today's day on the page (the inflite repo's today/public/day.js, Today First: spec §7.3, §7.4, §7.7, §14.2), its
// parts that need no browser: the phase at a moment, from the answer alone (phaseAt), against every fixture of the demo's
// day; the rows still to come (comingAt: in the evening, tonight's and tomorrow's first) and tickDay taking passed ones
// away and drawing the next phase at its minute with no request; a ride's phase with no top card of its own (the day's
// second ride) never blank; day.js's own timer stopping once the page takes the day back (signed out, its own four cards)
// or says stopDay; a planning answer asked again 5 s on only without the page's refresh(); Chat's engine asked at idle
// and only in sight; Undo's 401 told to the page; Send to Leo refused as { why }; the merge of the engine's words (only
// beside a row the server named, and only when the engine's message is as new as the server's); the header's line for
// each phase; and cards.js: safe()'s rule for a path of this site's, safeOrigin for an account's link, Send as a button at
// the hub and a link off it, the hub's paths for links, the page's own IFL.hub first. Nothing drawn has an inline style,
// an inline handler or a box to type in. (The page itself, in Chromium against the stand-in account: todayphases.mjs.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { register } from "node:module";

const PUB = new URL("../../../../inflite/today/public/", import.meta.url);
const FIX = (p) => JSON.parse(readFileSync(new URL(`../mocks/today/cards.${p}.json`, import.meta.url), "utf8"));
const PHASES = ["morning", "midday", "preride", "riding", "after", "after-fit", "evening"];
const skip = !existsSync(new URL("day.js", PUB)) && "the inflite repo isn’t beside this one";

// (Today's modules import each other by the site's own paths, "/cards.js": resolved here to the files beside them)
if (!skip) register(`data:text/javascript,${encodeURIComponent(`
  const PUB = ${JSON.stringify(PUB.href)};
  export async function resolve(spec, ctx, next) {
    if (/^\\/[\\w.-]+\\.js$/.test(spec) && ctx.parentURL && ctx.parentURL.startsWith(PUB)) return next(new URL("." + spec, PUB).href, ctx);
    return next(spec, ctx);
  }`)}`);
const day = skip ? {} : await import(new URL("day.js", PUB).href);
const cards = skip ? {} : await import(new URL("cards.js", PUB).href);

// ---- just enough of a page for drawDay and tickDay: sections whose markup is kept as written, and rows found in it ----
class El {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.id = ""; this.className = ""; this.dataset = {}; this.children = []; this.parentNode = null; this.hidden = false; this._html = ""; this.rows = []; this.listeners = {}; this.isConnected = true; }
  set innerHTML(h) { this._html = String(h); this.children = h ? [{}] : []; this.rows = [...this._html.matchAll(/data-due="(\d+)"/g)].map((m) => this.row({ due: m[1] })); this.undos = [...this._html.matchAll(/data-do="undo" data-id="([^"]+)"/g)].map((m) => this.row({ do: "undo", id: m[1] }, "undos")); }
  get innerHTML() { return this._html; }
  row(dataset, key = "rows") { const r = { dataset, remove: () => { this[key] = this[key].filter((x) => x !== r); } }; return r; }
  replaceChildren(...kids) { this.children = kids; this._html = ""; this.rows = []; }
  append(...kids) { for (const k of kids) { k.parentNode = this; this.children.push(k); } }
  querySelector(sel) {
    if (sel.startsWith("#")) return this.children.find((c) => c.id === sel.slice(1)) || null;
    if (sel === "[data-due]") return this.rows[0] || null;
    return null;
  }
  querySelectorAll(sel) {
    if (sel === "[data-due]") return this.rows;
    if (sel === '[data-do="undo"]') return this.undos || [];
    return [];
  }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  contains() { return true; }
}
globalThis.document = { createElement: (t) => new El(t), querySelector: (s) => (s.startsWith("link") ? {} : null), addEventListener() {}, head: new El("head"), body: new El("body") };
globalThis.location = { protocol: "https:", hostname: "inflite.ai", port: "", origin: "https://inflite.ai" };
const LINKS = { chat: "https://chat.inflite.ai", weather: "https://weather.inflite.ai", fitness: "https://fitness.inflite.ai", finance: "https://finance.inflite.ai" };
// (a page's root, drawn into with nothing timed, and every request it might make written down)
const asked = [];
globalThis.fetch = async (u) => { asked.push(String(u)); throw new Error("no requests here"); };
function drawn(answer, now, extra = {}) {
  const root = new El("div");
  root.id = "today";
  day.drawDay(root, answer, { now, links: LINKS, timers: false, ...extra });
  const sec = (k) => root.querySelector(`#${k}`);
  return { root, sec, html: () => ["top", "waiting", "coming", "rest"].map((k) => sec(k).innerHTML).join("\n") };
}
const hubAt = (calls = []) => ({ on: true, base: "/", go: (u) => { calls.push(["go", u]); const m = /^https:\/\/(chat|weather|fitness|finance)\.inflite\.ai\/(.*)$/.exec(u); return m ? `/${{ chat: "chats", weather: "weather", fitness: "fitness", finance: "markets" }[m[1]]}/${m[2]}` : u; }, send: (...a) => { calls.push(["send", ...a]); return Promise.resolve(true); }, chat: () => Promise.resolve(null) });

test("phaseAt: each fixture's phase at its own moment, and at each step of its timeline the phase that step names", { skip }, () => {
  for (const p of PHASES) {
    const a = FIX(p);
    assert.equal(day.phaseAt(a, a.at), a.phase, `${p} at its at`);
    assert.equal(day.phaseAt(a, a.since), a.phase, `${p} at its since`);
    for (const [i, x] of a.timeline.entries()) {
      assert.equal(day.phaseAt(a, x.at), x.phase, `${p}: ${x.phase} at ${new Date(x.at).toISOString()}`);
      if (i) assert.equal(day.phaseAt(a, x.at - 1), a.timeline[i - 1].phase, `${p}: still ${a.timeline[i - 1].phase} the moment before`);
    }
    // (until and the timeline agree: the phase changes at until, and not before)
    if (a.until != null) {
      assert.equal(day.phaseAt(a, a.until - 1), a.phase, `${p}: ${a.phase} until the moment before until`);
      assert.notEqual(day.phaseAt(a, a.until), a.phase, `${p}: another phase at until`);
    }
  }
  const m = FIX("midday"), preride = FIX("preride").at;
  assert.equal(day.phaseAt(m, preride - 60e3), "midday", "forty-one minutes before the ride: midday");
  assert.equal(day.phaseAt(m, preride), "preride", "forty minutes before: the ride, from the midday answer alone");
  const r = FIX("riding");
  assert.equal(r.until, null, "riding has no until (it needs data)");
  assert.equal(day.phaseAt(r, Date.UTC(2026, 10, 2, 18, 44)), "riding");
  assert.equal(day.phaseAt(r, Date.UTC(2026, 10, 2, 18, 45)), "midday", "no activity by the cap: back to the clock's phase");
  assert.equal(day.phaseAt(r, Date.UTC(2026, 10, 2, 19, 0)), "evening");
  assert.equal(day.phaseAt(r, Date.UTC(2026, 10, 3, 6, 0)), "morning", "the next dayStart");
});

test("phaseAt: the answer's own phase before its timeline, without one, or without a moment; junk steps ignored, steps in any order", { skip }, () => {
  const a = FIX("midday");
  assert.equal(day.phaseAt(a, a.since - 3600e3), "midday", "a clock behind the answer: the answer's phase");
  assert.equal(day.phaseAt({ ...a, timeline: undefined }, a.until + 1), "midday");
  assert.equal(day.phaseAt(a, undefined), "midday");
  assert.equal(day.phaseAt(a, NaN), "midday");
  assert.equal(day.phaseAt(null, a.at), undefined);
  const shuffled = { ...a, timeline: [...a.timeline].reverse().concat([{ phase: "nap", at: a.at }, { phase: "evening", at: "soon" }, null]) };
  assert.equal(day.phaseAt(shuffled, a.until), "preride");
  assert.equal(day.phaseAt(shuffled, a.at), "midday");
});

test("comingAt: the rows still to come, soonest first; in the evening, what's left of tonight and tomorrow's first thing", { skip }, () => {
  const a = FIX("midday"), rows = day.comingAt(a.upcoming, a.at, "midday");
  assert.deepEqual(rows.map((r) => r.title), a.upcoming.map((r) => r.title));
  const at = a.upcoming[0].at;
  assert.deepEqual(day.comingAt(a.upcoming, at, "midday").map((r) => r.title), a.upcoming.slice(1).map((r) => r.title), "a row at its own time is gone");
  assert.equal(day.comingAt([...a.upcoming].reverse(), a.at, "midday")[0].title, "Rain reaches London", "sorted");
  const e = FIX("evening");
  assert.deepEqual(day.comingAt(e.upcoming, e.at, "evening").map((r) => r.title), ["Dry and still"]);
  // (the evening: what's left of tonight, then tomorrow's first thing, and nothing after it)
  const call = { id: "time:9c1d2e3f-4a5b-4c6d-8e7f-8091a2b3c4d6", at: Date.UTC(2026, 10, 2, 21, 30), title: "Call with Mira", app: "chat" };
  const early = { id: "time:9c1d2e3f-4a5b-4c6d-8e7f-8091a2b3c4d7", at: Date.UTC(2026, 10, 3, 6, 30), title: "Call with Leo", app: "chat" };
  const dawn = e.timeline.find((x) => x.phase === "morning").at;
  assert.deepEqual(day.comingAt([...e.upcoming, call], e.at, "evening", { dawn }).map((r) => r.title), ["Call with Mira", "Dry and still"], "tonight’s call, then tomorrow’s first");
  assert.deepEqual(day.comingAt([...e.upcoming, call, early], e.at, "evening", { dawn }).map((r) => r.title), ["Call with Mira", "Call with Leo"], "tomorrow’s first, whatever it is");
  assert.deepEqual(day.comingAt([...e.upcoming, call], e.at, "evening", { tz: e.tz }).map((r) => r.title), ["Call with Mira", "Dry and still"], "without a timeline: tomorrow from midnight where the answer is");
  assert.deepEqual(day.comingAt([call], e.at, "evening", { dawn }).map((r) => r.title), ["Call with Mira"], "nothing tomorrow yet: tonight’s");
  const ev = drawn({ ...e, upcoming: [...e.upcoming, call] }, e.at);
  assert.equal(ev.sec("coming").rows.length, 2, "drawn: tonight’s call and tomorrow’s first");
  assert.ok(ev.sec("coming").innerHTML.indexOf("Call with Mira") < ev.sec("coming").innerHTML.indexOf("Dry and still"));
  assert.deepEqual(day.comingAt([{ at: "x", title: "Bad" }, { at: e.at + 1 }, null], e.at, "midday"), []);
});

test("tickDay: a passed row taken away with no request, and the section put away once none are left", { skip }, () => {
  const a = FIX("midday"), d = drawn(a, a.at);
  asked.length = 0;
  const n = d.sec("coming").rows.length;
  assert.equal(n, a.upcoming.length, "every row drawn");
  day.tickDay(d.root, a, a.upcoming[0].at);
  assert.equal(d.sec("coming").rows.length, n - 1, "the rain's row gone at 15:00");
  assert.ok(!d.sec("coming").hidden);
  assert.equal(d.root.dataset.phase, "midday", "still midday at 15:00");
  // (an answer where every row's passed by the next tick)
  const b = { ...a, upcoming: a.upcoming.slice(0, 2) }, e = drawn(b, b.at);
  day.tickDay(e.root, b, b.upcoming[1].at + 1);
  assert.equal(e.sec("coming").rows.length, 0);
  assert.ok(e.sec("coming").hidden, "Coming Up put away");
  assert.deepEqual(asked, [], "no request");
});

test("a ride not in yet (late) stays in Coming Up though its time has passed, drawn and ticked, until the next morning", { skip }, () => {
  const a = FIX("midday"), late = { at: a.at - 30 * 60000, app: "fitness", title: "Free ride", sub: "Not in yet", href: "/fitness/", id: "late", late: true };
  assert.deepEqual(day.comingAt([late, ...a.upcoming], a.at, "midday").map((r) => r.title), ["Free ride", ...a.upcoming.map((r) => r.title)], "kept, first");
  assert.deepEqual(day.comingAt([{ ...late, late: undefined }], a.at, "midday"), [], "a passed row that isn't late is gone");
  const b = { ...a, upcoming: [late, ...a.upcoming.slice(0, 1)] }, d = drawn(b, b.at);
  assert.equal(d.sec("coming").rows.length, 2, "drawn");
  day.tickDay(d.root, b, b.upcoming[1].at + 1);
  assert.equal(d.sec("coming").rows.length, 1, "the rain's row gone, the late ride kept");
  assert.ok(!d.sec("coming").hidden, "Coming Up still out");
  const dawn = (b.timeline || []).filter((x) => x.phase === "morning" && x.at > b.at).map((x) => x.at).sort((x, y) => x - y)[0];
  assert.ok(dawn, "the fixture has the next morning");
  day.tickDay(d.root, b, dawn);
  assert.equal(d.sec("coming").rows.length, 0, "gone by the next morning");
});

test("tickDay: at until, the next phase from the answer's tops, with no request; the ride alone before it", { skip }, () => {
  const a = FIX("midday"), d = drawn(a, a.at);
  asked.length = 0;
  assert.equal(d.root.dataset.phase, "midday");
  assert.match(d.sec("top").innerHTML, /14° · Dry until 15:00/);
  day.tickDay(d.root, a, a.until - 1);
  assert.equal(d.root.dataset.phase, "midday", "not a moment early");
  day.tickDay(d.root, a, a.until);
  assert.equal(d.root.dataset.phase, "preride");
  assert.match(d.sec("top").innerHTML, /data-phase="preride"/);
  assert.match(d.sec("top").innerHTML, /Endurance 75 at 16:45/);
  assert.ok(d.sec("waiting").hidden && d.sec("coming").hidden && d.sec("rest").hidden, "before a ride: the ride alone");
  day.tickDay(d.root, a, a.timeline.find((x) => x.phase === "riding").at);
  assert.equal(d.root.dataset.phase, "riding");
  assert.match(d.sec("top").innerHTML, /Riding · messages held/);
  // (the cap: the clock's phase again, which the answer has no top for (its midday top was the one before the ride), so
  // none drawn rather than the morning's weather or the ride's past its end)
  day.tickDay(d.root, a, Date.UTC(2026, 10, 2, 18, 45));
  assert.equal(d.root.dataset.phase, "midday");
  assert.ok(d.sec("top").hidden, "no top card that the answer didn't give");
  assert.deepEqual(asked, [], "no request at any boundary");
});

test("tickDay: an Undo whose time has gone is taken away", { skip }, () => {
  const m = FIX("morning"), a = { ...m, acts: [{ ...m.acts[0], undoUntil: m.at + 10 * 60e3 }, m.acts[1]] }, d = drawn(a, a.at);
  assert.deepEqual(d.sec("top").undos.map((u) => u.dataset.id), a.acts.map((x) => x.id), "both Undos drawn");
  day.tickDay(d.root, a, a.acts[0].undoUntil);
  assert.deepEqual(d.sec("top").undos.map((u) => u.dataset.id), [a.acts[1].id], "the move's Undo gone at its undoUntil");
  const late = drawn(a, a.acts[0].undoUntil + 1);
  assert.equal(late.root.dataset.phase, "morning");
  assert.doesNotMatch(late.sec("top").innerHTML, /Undo the Move/, "and not drawn after it");
  assert.match(late.sec("top").innerHTML, /Undo Thursday’s Ride/);
});

test("drawDay: each phase's sections, a Send on every card that has words, and never a box to type in", { skip }, () => {
  const SHOWS = { morning: "wcr", midday: "wcr", preride: "", riding: "", after: "cr", "after-fit": "cr", evening: "cr" };
  for (const p of PHASES) {
    const a = FIX(p), d = drawn(a, a.at), top = a.tops[a.phase];
    assert.equal(d.root.dataset.phase, a.phase, p);
    assert.match(d.sec("top").innerHTML, new RegExp(`data-phase="${a.phase}"`), `${p}: the top card says its phase`);
    assert.ok(d.sec("top").innerHTML.includes(cards.esc(top.title)), `${p}: the top card's title`);
    for (const l of top.lines) assert.ok(d.sec("top").innerHTML.includes(cards.esc(l)), `${p}: “${l}”`);
    for (const s of top.stats) assert.ok(d.sec("top").innerHTML.includes(`<dt>${cards.esc(s.label)}</dt><dd>${cards.esc(s.value)}</dd>`), `${p}: ${s.label}`);
    const want = SHOWS[p], waits = want.includes("w") && a.waiting.length > 0;
    assert.equal(!d.sec("waiting").hidden, waits, `${p}: Waiting for You ${waits ? "shown" : "not shown"}`);
    assert.equal(!d.sec("coming").hidden, want.includes("c"), `${p}: Coming Up`);
    assert.equal(!d.sec("rest").hidden, want.includes("r"), `${p}: The Rest of Today`);
    assert.ok(/data-send(?![\w-])/.test(d.sec("top").innerHTML), `${p}: Send on the top card`);
    if (want.includes("r")) assert.equal((d.sec("rest").innerHTML.match(/data-send(?![\w-])/g) || []).length, Object.values(a.cards).filter((c) => c.share).length, `${p}: Send on each of the four cards with words`);
    if (want.includes("c")) assert.equal((d.sec("coming").innerHTML.match(/data-send(?![\w-])/g) || []).length, day.comingAt(a.upcoming, a.at, a.phase).filter((r) => r.share).length, `${p}: Send on each row that has a card`);
    assert.doesNotMatch(d.html(), /<input|<textarea|contenteditable/i, `${p}: nothing to type in`);
    assert.doesNotMatch(d.html(), /\sstyle\s*=|\son[a-z]+\s*=/i, `${p}: no inline style or handler`);
  }
  const after = drawn(FIX("after"), FIX("after").at);
  assert.match(after.sec("top").innerHTML, /Open Fitness/, "the after card without Stress: Open Fitness");
  assert.doesNotMatch(after.sec("top").innerHTML, /<dt>Stress<\/dt>/);
  const fit = drawn(FIX("after-fit"), FIX("after-fit").at);
  assert.match(fit.sec("top").innerHTML, /<dt>Stress<\/dt><dd>68<\/dd>/);
  assert.match(fit.sec("top").innerHTML, /class="dt-up"><dt>Fitness<\/dt><dd>63 ↑<\/dd>/);
  assert.doesNotMatch(fit.sec("top").innerHTML, /Open Fitness/);
  const mid = drawn(FIX("midday"), FIX("midday").at);
  assert.match(mid.sec("waiting").innerHTML, /<b>Pat<\/b><small>2 messages, the last at 09:41<\/small>/, "Pat and when, never words, from the server");
});

test("drawDay: off the hub every link is the app's own address and Send is Chat's link; at the hub, the hub's paths through IFL.hub.go and Send a button", { skip }, () => {
  const a = FIX("after"), id = a.tops.after.sendTo.id;
  const off = drawn(a, a.at).sec("top").innerHTML;
  assert.match(off, /href="https:\/\/fitness\.inflite\.ai\/#activities"/, "Open Fitness at Fitness's own address");
  assert.match(off, new RegExp(`href="https://chat\\.inflite\\.ai/#open=${a.tops.after.wrote[0].id}"`), "Answer Mira at Chat's own address");
  assert.match(off, /<a class="pill" href="https:\/\/chat\.inflite\.ai\/#share=Done%3A%20Endurance%2075%2C%201%3A15%2C%2022\.4%20mi\.&amp;card=[\w-]+" data-send/, "Send: Chat's #share= link");
  assert.doesNotMatch(off, /<button[^>]*data-send/);
  const calls = [], on = drawn(a, a.at, { hub: hubAt(calls) }).sec("top").innerHTML;
  assert.match(on, /href="\/fitness\/#activities" data-do="open"/, "at the hub: the hub's path");
  assert.ok(calls.some(([k, u]) => k === "go" && u === "/fitness/#activities"), "through IFL.hub.go");
  assert.match(on, new RegExp(`<button class="pill" type="button" data-do="sendto" data-to="${id}">`), "Send to Leo: one tap, at the hub");
  assert.match(on, /<button class="pill" type="button" data-send data-share="Done: Endurance 75, 1:15, 22\.4 mi\." data-card="[\w-]+"/, "Send: a button at the hub");
  // (the hub there but not ready (degraded, its key not set yet): as off it)
  const degraded = drawn(a, a.at, { hub: { ...hubAt(), degraded: true } }).sec("top").innerHTML;
  assert.match(degraded, /href="https:\/\/fitness\.inflite\.ai\/#activities"/);
  // (the four cards, drawn by day.js where the page has none of its own: their links through the hub too)
  const m = FIX("midday"), rest = drawn(m, m.at, { hub: hubAt() }).sec("rest").innerHTML;
  assert.match(rest, /class="tc-head" href="\/weather\/\?lat=51\.5072/, "the Weather card's head at /weather/");
  assert.match(rest, /class="tc-head" href="\/markets\/"/, "the Markets card's head at /markets/");
  assert.doesNotMatch(rest, /(?<![\w-])href="https:\/\/(chat|weather|fitness|finance)\.inflite\.ai/, "no card link leaves the hub (Chat's own link kept only as the Send button's fallback)");
});

test("drawDay: the page's ctx: line(text) for the phase (null in the morning, the page's own date), and Edit's prefs", { skip }, () => {
  const lines = [], m = FIX("midday");
  drawn(m, m.at, { line: (t) => lines.push(t) });
  drawn(FIX("morning"), FIX("morning").at, { line: (t) => lines.push(t) });
  assert.deepEqual(lines, ["12:30 · what’s next", null]);
  const rest = drawn(m, m.at, { prefs: { order: ["markets", "weather", "chat", "fitness"], hidden: ["chat"] } }).sec("rest").innerHTML;
  assert.deepEqual([...rest.matchAll(/data-app="(\w+)"/g)].map((x) => x[1]), ["markets", "weather", "fitness"], "Edit's order, without what's hidden");
});

test("drawDay: a planning answer asked again once, 5 s on, by day.js only where the page hands in no refresh() (the page asks itself, §7.7)", { skip }, (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const m = FIX("midday");
  asked.length = 0;
  let refreshed = 0;
  day.drawDay(new El("div"), { ...m, planning: true }, { now: m.at, links: LINKS, refresh: () => refreshed++ });
  t.mock.timers.tick(6000);
  assert.equal(refreshed, 0, "with the page's refresh(): nothing timed here (the page asks again itself)");
  assert.deepEqual(asked, [], "and nothing fetched here");
  day.drawDay(new El("div"), { ...m, planning: true }, { now: m.at, links: LINKS });
  t.mock.timers.tick(4900);
  assert.deepEqual(asked, [], "without it: not before 5 s");
  t.mock.timers.tick(200);
  assert.deepEqual(asked, ["/api/today?v=2"], "then the day asked for once, version 2");
  t.mock.timers.tick(30000);
  assert.deepEqual(asked, ["/api/today?v=2"], "and once only");
});

test("drawDay's own timer stops once the page takes root back (its phase taken off: its own four cards drawn, or signed out), and with stopDay", { skip }, (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const m = FIX("midday");
  let now = m.until - 30e3;
  const lines = [];
  const page = () => { const root = new El("div"); day.drawDay(root, m, { now: () => now, links: LINKS, line: (x) => lines.push(x) }); return root; };
  // (as app.js's signedOutNow and drawFour do: the sections emptied, the phase taken off, the same root kept)
  const takeBack = (root) => { for (const k of ["top", "waiting", "coming", "rest"]) root.querySelector(`#${k}`).replaceChildren(); delete root.dataset.phase; };
  const a = page();
  assert.equal(a.dataset.phase, "midday");
  assert.equal(lines.length, 1);
  takeBack(a);
  now = m.until + 1e3;
  t.mock.timers.tick(90e3);
  assert.equal(a.dataset.phase, undefined, "the ride's phase not drawn into a page that's let the day go");
  assert.equal(a.querySelector("#top").innerHTML, "", "nothing drawn at the boundary");
  assert.equal(a.querySelector("#rest").innerHTML, "", "nor the four cards");
  assert.equal(lines.length, 1, "nothing said in the header");
  // (tickDay from the page, after it's taken root back: nothing either, and the timer gone with it)
  lines.length = 0;
  now = m.until - 30e3;
  const b = page();
  takeBack(b);
  day.tickDay(b, m, m.until + 1e3);
  now = m.until + 1e3;
  t.mock.timers.tick(90e3);
  assert.equal(b.dataset.phase, undefined, "tickDay: nothing drawn");
  assert.equal(lines.length, 1, "tickDay: nothing said");
  // (stopDay: the page saying so itself)
  lines.length = 0;
  now = m.until - 30e3;
  const c = page();
  day.stopDay(c);
  now = m.until + 1e3;
  t.mock.timers.tick(90e3);
  assert.equal(c.dataset.phase, "midday", "stopDay: nothing more drawn from here");
  assert.equal(lines.length, 1);
  day.stopDay(new El("div"));
  day.stopDay(null);
  // (a day that's still the page's goes on at its minute)
  now = m.until - 30e3;
  const d = page();
  now = m.until + 1e3;
  t.mock.timers.tick(31e3);
  assert.equal(d.dataset.phase, "preride", "a day still the page's: the ride's phase at its minute");
});

test("drawDay: a ride's phase with no top card of its own (the day's second ride, or a top left out) shows what's coming and the rest, never nothing", { skip }, () => {
  const m = FIX("midday"), at = (h, mi = 0) => Date.UTC(2026, 10, 2, h, mi);
  // (two rides: 10:00 and 16:45. The answer's tops are the first time each phase comes: the 10:00 ride's)
  const two = { ...m, at: at(9), since: at(6), until: at(9, 20), phase: "morning", timeline: [
    { phase: "morning", at: at(6) }, { phase: "preride", at: at(9, 20) }, { phase: "riding", at: at(10) }, { phase: "after", at: at(11, 20) },
    { phase: "midday", at: at(12, 50) }, { phase: "preride", at: at(16, 5) }, { phase: "riding", at: at(16, 45) }, { phase: "midday", at: at(18, 45) }, { phase: "evening", at: at(19) }] };
  const first = drawn(two, at(9, 30));
  assert.equal(first.root.dataset.phase, "preride");
  assert.ok(!first.sec("top").hidden, "the first ride: its card");
  assert.ok(first.sec("coming").hidden && first.sec("rest").hidden, "and the ride alone");
  for (const [when, phase] of [[at(16, 10), "preride"], [at(16, 50), "riding"]]) {
    const d = drawn(two, when);
    assert.equal(d.root.dataset.phase, phase, `the second ride's ${phase}`);
    assert.ok(d.sec("top").hidden, `${phase}: no card the answer didn't give`);
    assert.ok(!d.sec("coming").hidden, `${phase}: Coming Up shown`);
    assert.ok(!d.sec("rest").hidden, `${phase}: The Rest of Today shown`);
    assert.ok(d.sec("waiting").hidden);
  }
  assert.match(drawn(two, at(16, 10)).sec("coming").innerHTML, /Ride: Endurance 75/, "the second ride's own row among what's coming");
  // (tickDay to the second ride's minute, from the first's day: the same)
  const tk = drawn(two, at(12, 55));
  day.tickDay(tk.root, two, at(16, 5));
  assert.equal(tk.root.dataset.phase, "preride");
  assert.ok(tk.sec("top").hidden && !tk.sec("coming").hidden && !tk.sec("rest").hidden, "ticked into the second ride: Coming Up and the rest");
  // (a riding answer whose top the server left out)
  const r = FIX("riding"), bare = drawn({ ...r, tops: {} }, r.at);
  assert.equal(bare.root.dataset.phase, "riding");
  assert.ok(!bare.sec("coming").hidden && !bare.sec("rest").hidden, "riding with no top: what's coming and the rest");
});

// (a click on a drawn button: root's own listener, as the page's would call it)
const clickOn = (root, dataset) => { const el = { dataset, disabled: false }; el.closest = () => el; root.listeners.click[0]({ target: el, preventDefault() {} }); return el; };
const settle = () => new Promise((r) => setTimeout(r, 0));

test("Chat's engine asked at idle once the day's drawn, never in drawDay's own moment, and not while the page is out of sight", { skip }, async () => {
  const m = FIX("midday"), idles = [], docOn = {};
  let asks = 0, k = 0;
  const hub = { ...hubAt(), chat: () => { asks++; return Promise.resolve({ state: "ready", waiting: async () => [] }); } };
  // (a Waiting row the engine hasn't been asked about yet, each time)
  const answer = () => ({ ...m, waiting: [{ ...m.waiting[0], at: m.waiting[0].at + ++k }] });
  const doc = { add: document.addEventListener, remove: document.removeEventListener };
  globalThis.requestIdleCallback = (fn, o) => { idles.push([fn, o]); return idles.length; };
  document.addEventListener = (type, fn) => (docOn[type] ||= []).push(fn);
  document.removeEventListener = (type, fn) => { docOn[type] = (docOn[type] || []).filter((f) => f !== fn); };
  try {
    day.drawDay(new El("div"), answer(), { now: m.at, links: LINKS, timers: false, hub });
    assert.equal(asks, 0, "not in the same moment as the day's drawing");
    assert.equal(idles.length, 1, "asked for at idle");
    assert.ok(idles[0][1]?.timeout > 0 && idles[0][1].timeout <= 3000, "within a few seconds at most");
    idles.shift()[0]();
    assert.equal(asks, 1, "then the engine asked");
    // (out of sight: nothing made until it's seen again)
    document.visibilityState = "hidden";
    const root = new El("div");
    day.drawDay(root, answer(), { now: m.at, links: LINKS, timers: false, hub });
    assert.equal(idles.length, 0, "out of sight: not even at idle");
    assert.equal(asks, 1);
    assert.equal(docOn.visibilitychange?.length, 1, "waiting to be seen");
    document.visibilityState = "visible";
    for (const f of [...docOn.visibilitychange]) f();
    assert.equal(docOn.visibilitychange.length, 0, "and no longer waiting once seen");
    assert.equal(idles.length, 1);
    idles.shift()[0]();
    assert.equal(asks, 2, "seen: the engine asked, at idle");
    // (a day drawn again while one's waiting to be seen: only the newest asks)
    document.visibilityState = "hidden";
    day.drawDay(root, answer(), { now: m.at, links: LINKS, timers: false, hub });
    day.drawDay(root, answer(), { now: m.at, links: LINKS, timers: false, hub });
    assert.equal(docOn.visibilitychange.length, 1, "the older day's wait dropped");
    document.visibilityState = "visible";
    for (const f of [...docOn.visibilitychange]) f();
    for (const [f] of idles.splice(0)) f();
    assert.equal(asks, 3);
    await settle();
  } finally {
    delete globalThis.requestIdleCallback;
    delete document.visibilityState;
    document.addEventListener = doc.add;
    document.removeEventListener = doc.remove;
  }
});

test("Undo, Take or Keep answered 401: the page told at once (refresh), so its own way out of a 401 runs; another refusal asks nothing", { skip }, async () => {
  const m = FIX("morning");
  for (const [status, want] of [[401, 1], [403, 0]]) {
    let refreshed = 0;
    const toasts = [], root = new El("div");
    day.drawDay(root, m, { now: m.at, links: LINKS, timers: false, toast: (x) => toasts.push(x), refresh: () => { refreshed++; },
      call: async () => { throw Object.assign(new Error("Sign in again."), { status }); } });
    clickOn(root, { do: "undo", id: m.acts[1].id });
    await settle();
    assert.equal(refreshed, want, `${status}: refresh() ${want ? "called" : "not called"}`);
    assert.deepEqual(toasts, ["Sign in again."], `${status}: the account's words said`);
  }
});

test("Send to Leo: an engine that refuses (false, { ok: false }, or { why } alone) or says nothing opens Chat's sheet with Leo chosen; sent, or its own sheet, nothing more", { skip }, async () => {
  const a = FIX("after"), top = a.tops.after, id = top.sendTo.id;
  const cases = [[{ why: "tap" }, true], [{ ok: false, why: "tap" }, true], [{ ok: false }, true], [false, true], [null, true], [undefined, true], ["throws", true],
    [{ ok: true, say: "Sent to Leo. You’re still here" }, false], [true, false]];
  for (const [r, sheet] of cases) {
    const calls = [];
    const engine = { state: "ready", sendTo: async () => { if (r === "throws") throw new Error("no"); return r; } };
    const hub = { ...hubAt(calls), chat: () => Promise.resolve(engine), sent: (say) => calls.push(["sent", say]) };
    const root = new El("div");
    day.drawDay(root, a, { now: a.at, links: LINKS, timers: false, hub });
    clickOn(root, { do: "sendto", to: id });
    await settle();
    const sends = calls.filter((c) => c[0] === "send"), sent = calls.filter((c) => c[0] === "sent");
    assert.deepEqual(sends, sheet ? [["send", top.share, top.sendCard, { to: id }]] : [], `${JSON.stringify(r)}: ${sheet ? "Chat's sheet, Leo chosen" : "no sheet from here"}`);
    assert.equal(sent.length, r?.ok === true ? 1 : 0, `${JSON.stringify(r)}: its word said only when sent`);
  }
});

test("links: a row with nowhere to go isn't a link; a hub path of Mail's goes to Mail's own address off the hub; an account's link used as an origin only", { skip }, () => {
  const m = FIX("midday"), rows = [{ id: "x1", at: m.at + 3600e3, title: "No address", app: "weather" }, { id: "x2", at: m.at + 7200e3, title: "A letter", app: "chat", href: "/mail/#open=abc" }];
  const coming = drawn({ ...m, upcoming: rows }, m.at).sec("coming").innerHTML;
  assert.match(coming, /<div class="row dc-main"><span class="dc-tm">13:30/, "no address: a row to read, not a link");
  assert.doesNotMatch(coming, /href="#"/, "never a link to nowhere");
  assert.match(coming, /<a class="row dc-main" href="https:\/\/email\.inflite\.ai\/#open=abc">/, "Mail's hub path: Mail's own address, off the hub");
  // (an account's link that isn't an address (a path): Chat's #share= never made from it, nor an app's row's address)
  const bad = { ...LINKS, chat: "/", weather: "/x" };
  assert.equal(cards.sendButton({ share: "Hi" }, { links: bad }), "", "Chat's link a path: no Send link rather than “//#share=”");
  const top = drawn(FIX("after"), FIX("after").at, { links: { ...LINKS, chat: "/" } }).sec("top").innerHTML;
  assert.doesNotMatch(top, /href="\/\//, "no protocol-relative address anywhere");
  assert.equal(cards.safeOrigin("https://chat.inflite.ai"), "https://chat.inflite.ai");
  for (const h of ["/", "/x", "//evil.example", "javascript:alert(1)", "http://chat.inflite.ai", null]) assert.equal(cards.safeOrigin(h), null, JSON.stringify(h));
  assert.equal(cards.safe("/weather/#radar"), "/weather/#radar", "safe() still keeps this site's paths, for the answer's own addresses");
});

test("the hub: the page's own (window.IFL.hub) first, else ctx.hub; with neither, off the hub", { skip }, () => {
  const a = FIX("after"), calls = [];
  globalThis.IFL = { hub: hubAt(calls) };
  try {
    const top = drawn(a, a.at).sec("top").innerHTML;
    assert.match(top, /href="\/fitness\/#activities" data-do="open"/, "window.IFL.hub: the hub's path");
    assert.match(top, /<button class="pill" type="button" data-send/, "and Send a button");
    const both = drawn(a, a.at, { hub: { ...hubAt(), degraded: true } }).sec("top").innerHTML;
    assert.match(both, /href="\/fitness\/#activities"/, "the page's own hub before one handed in");
  } finally {
    delete globalThis.IFL;
  }
  assert.match(drawn(a, a.at).sec("top").innerHTML, /href="https:\/\/fitness\.inflite\.ai\/#activities"/, "neither: off the hub");
});

test("mergeWaiting: words only beside a row the server named, and only when the engine's message is as new as the server's", { skip }, () => {
  const rows = [{ id: "pat-0000001", first: "Pat", at: 1000, n: 2 }, { id: "mira-000001", first: "Mira", at: 2000, n: 1 }, { id: "leo-0000001", first: "Leo", at: 3000, n: 1 }];
  const said = [
    { id: "pat-0000001", first: "Pat", at: 1000, said: "Dinner Friday?", kind: "question", topics: ["TSCO.L"] },  // as new: shown
    { id: "mira-000001", first: "Mira", at: 1999, said: "Old words", kind: "message", topics: [] },                // older: not shown
    { id: "nia-0000001", first: "Nia", at: 9999, said: "Not named", kind: "message", topics: [] },                 // not named: never
    { id: "leo-0000001", first: "Leo", at: 3500, said: "  ", kind: "message" },                                    // nothing said
  ];
  const m = day.mergeWaiting(rows, said);
  assert.deepEqual(m.map((r) => r.id), rows.map((r) => r.id), "the server's rows, in its order, and only those");
  assert.equal(m[0].said, "Dinner Friday?");
  assert.deepEqual(m[0].topics, ["TSCO.L"]);
  assert.equal(m[1].said, undefined, "a stale engine never puts old words beside a new message");
  assert.equal(m[2].said, undefined);
  assert.ok(!m.some((r) => r.id === "nia-0000001"));
  assert.equal(day.mergeWaiting(rows, [{ id: "mira-000001", at: 1999, said: "old" }, { id: "mira-000001", at: 2500, said: "new" }])[1].said, "new", "the engine's newest for that friend");
  assert.equal(day.mergeWaiting([{ id: "pat-0000001", at: 5 }], [{ id: "pat-0000001", at: 5, said: "Hi" }])[0].kind, "message");
  assert.deepEqual(day.mergeWaiting(rows, null).map((r) => r.said), [undefined, undefined, undefined]);
  assert.deepEqual(day.mergeWaiting(null, said), []);
  assert.equal(rows[0].said, undefined, "the server's rows themselves are left as they were");
});

test("dayLine: the header's line for each phase", { skip }, () => {
  const line = (p) => day.dayLine(FIX(p), FIX(p).at).text;
  assert.equal(line("morning"), "Monday 2 November · London");
  assert.match(day.dayLine(FIX("morning"), FIX("morning").at).html, /^<span class="d-long">Monday 2 November<\/span><span class="d-short">Mon 2 Nov<\/span> · London$/);
  assert.equal(line("midday"), "12:30 · what’s next");
  assert.equal(line("preride"), "16:05 · your ride");
  assert.equal(line("riding"), "16:50 · riding");
  assert.equal(line("after"), "18:05 · ride done");
  assert.equal(line("evening"), "21:00 · closed");
  const m = FIX("midday");
  assert.equal(day.dayLine(m, m.until).text, "16:05 · your ride", "the next phase's at its minute, from the midday answer");
});

// (One roof §4.4: the Weather card's warning chip opens that place's Warnings, the combined query and hash the framework's
// router reads; its head and its hours open Now. Where the inflite repo beside has no roof yet, the chip is Weather's
// page for that place, as milestone 1 had it)
const roofThere = existsSync(new URL("roof/router.js", PUB));
test("cards.js: the Weather card's warning chip opens that place's Warnings (?lat…&name=…#warnings), its head that place's Now", { skip }, () => {
  const m = FIX("midday"), w = { ...m.cards.weather, warning: { colour: "amber", chip: "Amber wind", issuer: "Met Office" } };
  const at = (html, cls) => new RegExp(`<a class="${cls}[^"]*" href="([^"]+)"`).exec(html)?.[1];
  const off = cards.cardHTML("weather", w, { links: LINKS, tz: m.tz, now: m.at });
  const on = cards.cardHTML("weather", w, { links: LINKS, tz: m.tz, now: m.at, hub: hubAt() });
  const own = "https://weather.inflite.ai/?lat=51.5072&amp;lon=-0.1276&amp;name=London", hub = "/weather/?lat=51.5072&amp;lon=-0.1276&amp;name=London";
  assert.equal(at(on, "tc-head"), hub, "the head at the hub: that place's Now");
  assert.equal(at(off, "tc-head"), own, "off the hub: Weather's own address");
  if (roofThere) {
    assert.equal(at(on, "wx-warn"), `${hub}#warnings`, "the chip at the hub: that place, its Warnings");
    assert.equal(at(off, "wx-warn"), `${own}#warnings`, "off the hub: the same at Weather's own address");
  } else {
    assert.equal(at(on, "wx-warn"), hub, "milestone 1: the chip opens Weather's page for that place");
  }
  assert.ok(!cards.cardHTML("weather", { ...m.cards.weather, warning: null }, { links: LINKS, tz: m.tz, now: m.at }).includes("wx-warn"), "no warning, no chip");
});

test("cards.js safe(): https addresses, http only where Today itself is, and a path of this site's only by its rule", { skip }, () => {
  const ok = ["https://chat.inflite.ai/#open=x", "/weather/#radar", "/fitness/#day=2026-11-05", "/", "/#apps", "/chats/#open=b1c2d3e4-0000-4000-8000-000000000012", "/a:b"];
  for (const h of ok) assert.equal(cards.safe(h), h, h);
  const no = ["//evil.example/", "/\\evil.example", "\\/evil.example", "/\n/evil.example", "/\t/x", "/x\u0000", "/x\u007f", "javascript:alert(1)", "data:text/html,x",
    "weather/#radar", ":/x", "a:/x", "http://chat.inflite.ai/", "", " /x", null, undefined, 42, {}];
  for (const h of no) assert.equal(cards.safe(h), null, JSON.stringify(h));
  globalThis.location = { ...globalThis.location, protocol: "http:" };
  assert.equal(cards.safe("http://chat.localhost:8787/"), "http://chat.localhost:8787/", "http where Today itself is on http (a test on this computer)");
  globalThis.location = { ...globalThis.location, protocol: "https:" };
});

test("cards.js sendButton: a link to Chat's #share= off the hub, a button for IFL.hub.send at it; nothing to send, nothing drawn", { skip }, () => {
  const card = { share: "Tesco +1.2% today.", sendCard: "eyJ2IjoxfQ" };
  assert.equal(cards.sendButton(card, { links: LINKS }), `<a class="pill" href="https://chat.inflite.ai/#share=Tesco%20%2B1.2%25%20today.&amp;card=eyJ2IjoxfQ" data-send>${cards.G.bird}Send to a friend</a>`);
  assert.match(cards.sendButton({ ...card, sendCard: "not packed!" }, { links: LINKS }), /#share=Tesco%20%2B1\.2%25%20today\." data-send/, "a sendCard that isn't base64url is left out");
  assert.equal(cards.sendButton({ share: "" }, { links: LINKS }), "");
  assert.equal(cards.sendButton(card, {}), "", "off the hub with no Chat to link to: nothing");
  const b = cards.sendButton(card, { links: LINKS, hub: hubAt() }, { to: "b1c2d3e4-0000-4000-8000-000000000011", label: "Tesco", cls: "dw-chip" });
  assert.match(b, /^<button class="dw-chip" type="button" data-send data-share="Tesco \+1\.2% today\." data-card="eyJ2IjoxfQ" data-to="b1c2d3e4-0000-4000-8000-000000000011" data-href="https:\/\/chat\.inflite\.ai\/#share=/);
  assert.doesNotMatch(cards.sendButton(card, { links: LINKS, hub: hubAt() }, { to: "x\" onclick=\"1" }), /data-to/, "a friend's id only as an id");
  assert.match(cards.sendButton(card, { links: LINKS, hub: { ...hubAt(), on: false } }), /^<a /, "the hub off: Chat's link");
});

test("day.js and cards.js write no inline style, no inline handler and no box to type in", { skip }, () => {
  for (const f of ["day.js", "cards.js"]) {
    const js = readFileSync(new URL(f, PUB), "utf8");
    assert.ok(!/style=\\?["']/.test(js), `${f} writes a style attribute into markup`);
    assert.ok(!/setAttribute\(\s*["']style["']/.test(js), `${f} sets a style attribute`);
    assert.ok(!/\son[a-z]+=\\?["']/.test(js), `${f} writes an inline handler into markup`);
    assert.ok(!/<input|<textarea|contenteditable/i.test(js), `${f} draws something to type in`);
    assert.ok(!/localStorage|indexedDB|sessionStorage/.test(js), `${f} keeps something in the browser's storage`);
  }
  const css = readFileSync(new URL("day.css", PUB), "utf8");
  assert.ok(!/@import|url\(\s*["']?https?:/i.test(css), "day.css loads nothing from elsewhere");
});

// ---- Mail's card (One roof stage 4, s4/spec §2.5: the inflite repo's today/public/mailcard.js, which cards.js draws for
// key "mail"): numbers only; "3 from people" or "All caught up"; what's back from Later today, else Updates' unread; its
// links Mail's own address off the hub and the hub's /mail/ on it; nothing of the answer drawn but its numbers ----
const mailSkip = skip || (!existsSync(new URL("mailcard.js", PUB)) && "the inflite repo beside has no Mail card yet (today/public/mailcard.js)");
const mc = mailSkip ? {} : await import(new URL("mailcard.js", PUB).href);
const MAIL_AT = Date.UTC(2026, 10, 2, 10, 0), OWN = "https://email.inflite.ai";
const mailHub = { on: true, base: "/", go: (u) => (u.startsWith(`${OWN}/`) ? `/mail/${u.slice(OWN.length + 1)}` : u), send: () => Promise.resolve(true), chat: () => Promise.resolve(null) };
const mcard = (x = {}) => ({ state: "ok", href: `${OWN}/`, people: 3, updates: 5, later: { n: 2, next: MAIL_AT + 4 * 3600e3, href: `${OWN}/#later` }, ...x });

test("Mail's card: its words from the numbers alone, what's back from Later today first, else Updates, else nothing", { skip: mailSkip }, () => {
  const ctx = { now: MAIL_AT, tz: "Europe/London", links: LINKS };
  assert.deepEqual(mc.mailWords(mcard(), ctx), { big: "3 from people", line: "1 back from Later at 14:00", later: true });
  assert.deepEqual(mc.mailWords(mcard({ people: 0, later: { n: 0, next: null } }), ctx), { big: "All caught up", line: "Updates: 5 unread", later: false });
  assert.deepEqual(mc.mailWords(mcard({ updates: 0, later: { n: 1, next: MAIL_AT + 20 * 3600e3 } }), ctx), { big: "3 from people", line: "", later: false }, "Later's next tomorrow: not said");
  assert.deepEqual(mc.mailWords(mcard({ later: { n: 1, next: MAIL_AT - 60e3 } }), ctx).later, false, "one gone by: not said");
  for (const people of [-1, 1.5, "3", null, undefined, NaN]) assert.equal(mc.mailWords(mcard({ people }), ctx), null, String(people));
  assert.equal(mc.mailCard(mcard({ people: "3<b>" }), ctx), "", "nothing drawn from what isn't a number");
});

test("Mail's card: Mail's own address off the hub, the hub's /mail/ on it, anything else no link; no style, handler or box", { skip: mailSkip }, () => {
  const off = mc.mailCard(mcard(), { now: MAIL_AT, tz: "Europe/London", links: LINKS });
  assert.match(off, /^<a class="tc-head" href="https:\/\/email\.inflite\.ai\/" aria-label="Open Mail"><img src="\/apps\/mail\.svg" alt=""><span class="tc-app">Mail<\/span>/);
  assert.match(off, /<h3 class="tc-h">3 from people<\/h3>/);
  assert.match(off, /<a href="https:\/\/email\.inflite\.ai\/#later">.*1 back from Later at 14:00<\/a>/);
  const on = mc.mailCard(mcard(), { now: MAIL_AT, tz: "Europe/London", links: LINKS, hub: mailHub });
  assert.match(on, /class="tc-head" href="\/mail\/"/);
  assert.match(on, /<a href="\/mail\/#later">/);
  const bad = mc.mailCard(mcard({ href: "javascript:alert(1)", later: { n: 1, next: MAIL_AT + 3600e3, href: "//evil.test/" } }), { now: MAIL_AT, tz: "Europe/London", links: LINKS });
  assert.doesNotMatch(bad, /javascript:|evil\.test/);
  assert.equal((bad.match(/href="#"/g) || []).length, 2);
  // (Updates' line: words, not a link)
  assert.match(mc.mailCard(mcard({ later: { n: 0, next: null } }), { now: MAIL_AT, tz: "Europe/London" }), /<p class="tc-p ml-updates">Updates: 5 unread<\/p>$/);
  const js = readFileSync(new URL("mailcard.js", PUB), "utf8");
  assert.ok(!/style=\\?["']|setAttribute\(\s*["']style|\son[a-z]+=\\?["']|<input|<textarea|localStorage|sessionStorage|indexedDB/i.test(js), "mailcard.js: no style, handler, box or storage");
  assert.ok(!/subject|sender|snippet/i.test(js.replace(/^\s*\/\/.*$/gm, "")), "nothing of a message's words read");
});
