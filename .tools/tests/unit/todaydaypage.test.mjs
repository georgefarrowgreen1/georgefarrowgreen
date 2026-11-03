// Today's day on the page (the inflite repo's today/public/day.js, Today First: spec §7.3, §7.4, §7.7, §14.2), its
// parts that need no browser: the phase at a moment, from the answer alone (phaseAt), against every fixture of the demo's
// day; the rows still to come (comingAt) and tickDay taking passed ones away and drawing the next phase at its minute
// with no request; the merge of the engine's words (only beside a row the server named, and only when the engine's
// message is as new as the server's); the header's line for each phase; and cards.js: safe()'s rule for a path of this
// site's, Send as a button at the hub and a link off it, the hub's paths for links. Nothing drawn has an inline style, an
// inline handler or a box to type in. (The page itself, in Chromium against the stand-in account: todayphases.mjs.)
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

test("comingAt: the rows still to come, soonest first; in the evening, tomorrow's first thing alone", { skip }, () => {
  const a = FIX("midday"), rows = day.comingAt(a.upcoming, a.at, "midday");
  assert.deepEqual(rows.map((r) => r.title), a.upcoming.map((r) => r.title));
  const at = a.upcoming[0].at;
  assert.deepEqual(day.comingAt(a.upcoming, at, "midday").map((r) => r.title), a.upcoming.slice(1).map((r) => r.title), "a row at its own time is gone");
  assert.equal(day.comingAt([...a.upcoming].reverse(), a.at, "midday")[0].title, "Rain reaches London", "sorted");
  const e = FIX("evening");
  assert.deepEqual(day.comingAt(e.upcoming, e.at, "evening").map((r) => r.title), ["Dry and still"]);
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

test("drawDay: the page's ctx: line(text) for the phase (null in the morning, the page's own date), Edit's prefs, and no request of its own beside refresh()", { skip }, async () => {
  const lines = [], m = FIX("midday");
  drawn(m, m.at, { line: (t) => lines.push(t) });
  drawn(FIX("morning"), FIX("morning").at, { line: (t) => lines.push(t) });
  assert.deepEqual(lines, ["12:30 · what’s next", null]);
  const rest = drawn(m, m.at, { prefs: { order: ["markets", "weather", "chat", "fitness"], hidden: ["chat"] } }).sec("rest").innerHTML;
  assert.deepEqual([...rest.matchAll(/data-app="(\w+)"/g)].map((x) => x[1]), ["markets", "weather", "fitness"], "Edit's order, without what's hidden");
  // (a planning answer, with the page's own refresh(): the page asks again itself (§7.7), so nothing's timed or asked here)
  asked.length = 0;
  let refreshed = 0;
  const root = new El("div");
  day.drawDay(root, { ...m, planning: true }, { now: m.at, links: LINKS, refresh: () => refreshed++ });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(refreshed, 0);
  assert.deepEqual(asked, []);
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
