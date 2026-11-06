// Mail on Your Day on Today's page (the inflite repo's today/public/trip.js, and day.js drawing it), its parts that need
// no browser: the answer's trip checked field by field on the page too (anything else dropped); the trip card's words
// (where, when, the time there against home's, the next booking, four days of weather); the trip day by day (each of
// its days, "Nothing booked" on one with nothing); Coming Up's rows from Mail ("from Mail", a tap for the booking's
// sheet, its email the link without one); the trip shown wherever Coming Up is and never beside a ride; nothing drawn
// unescaped, and no inline style, handler or box to type in. (The sheets, Hide and its Undo, in Chromium against the
// account and a stand-in for Mail: yourday.mjs.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { register } from "node:module";

const PUB = new URL("../../../../inflite/today/public/", import.meta.url);
const FIX = (p) => JSON.parse(readFileSync(new URL(`../mocks/today/cards.${p}.json`, import.meta.url), "utf8"));
const skip = !existsSync(new URL("trip.js", PUB)) && "the inflite repo beside has no trip.js (Mail on Your Day) yet";

if (!skip) register(`data:text/javascript,${encodeURIComponent(`
  const PUB = ${JSON.stringify(PUB.href)};
  export async function resolve(spec, ctx, next) {
    if (/^\\/[\\w.-]+\\.js$/.test(spec) && ctx.parentURL && ctx.parentURL.startsWith(PUB)) return next(new URL("." + spec, PUB).href, ctx);
    return next(spec, ctx);
  }`)}`);

// ---- just enough of a page for drawDay: sections whose markup is kept as written ----
class El {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.id = ""; this.className = ""; this.dataset = {}; this.children = []; this.parentNode = null; this.hidden = false; this._html = ""; this.listeners = {}; this.isConnected = true; }
  set innerHTML(h) { this._html = String(h); this.children = h ? [{}] : []; }
  get innerHTML() { return this._html; }
  replaceChildren(...kids) { this.children = kids; this._html = ""; }
  append(...kids) { for (const k of kids) { k.parentNode = this; this.children.push(k); } }
  querySelector(sel) { return sel.startsWith("#") ? this.children.find((c) => c.id === sel.slice(1)) || null : null; }
  querySelectorAll() { return []; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  contains() { return true; }
}
globalThis.document = { createElement: (t) => new El(t), querySelector: (s) => (s.startsWith("link") ? {} : null), addEventListener() {}, head: new El("head"), body: new El("body") };
globalThis.location = { protocol: "https:", hostname: "inflite.ai", port: "", origin: "https://inflite.ai" };
globalThis.fetch = async () => { throw new Error("no requests here"); };
const trip = skip ? {} : await import(new URL("trip.js", PUB).href);
const day = skip ? {} : await import(new URL("day.js", PUB).href);
const LINKS = { chat: "https://chat.inflite.ai", weather: "https://weather.inflite.ai", fitness: "https://fitness.inflite.ai", finance: "https://finance.inflite.ai", email: "https://email.inflite.ai" };

// ---- the midday fixture's Monday, with Lisbon from Tuesday and a table tonight, as the account would answer ----
const at = (d, hh, mm = 0) => Date.UTC(2026, 10, d, hh, mm);
const OWN = "https://email.inflite.ai", WX = (d) => `/weather/?lat=38.71667&lon=-9.13333&name=Lisbon#day=2026-11-${String(d).padStart(2, "0")}`;
const TRIP = {
  id: "trip-lisbon", name: "Lisbon", start: at(3, 7, 40), end: at(6, 20, 40), destination: { name: "Lisbon", lat: 38.71667, lon: -9.13333 }, tz: "Europe/Lisbon", apart: 0, href: "/weather/?lat=38.71667&lon=-9.13333&name=Lisbon",
  items: [
    { id: "K7QX2M-1", kind: "flight", title: "TP1351 to Lisbon", sub: "Heathrow T2 07:40 → 10:15 · seat 14C", start: at(3, 7, 40), end: at(3, 10, 15), tz: "Europe/London", place: { name: "Heathrow T2" }, ref: "K7QX2M", href: `${OWN}/#thread=t1`, wx: WX(3) },
    { id: "bk-5521876", kind: "hotel", title: "Memmo Alfama", sub: "Check-in from 15:00 · 3 nights", start: at(3, 15), end: at(6, 11), tz: "Europe/Lisbon", place: { name: "Memmo Alfama" }, ref: "5521876", href: `${OWN}/#thread=t2`, wx: WX(3) },
    { id: "gyg-1", kind: "event", title: "Sintra day trip", sub: "Meet 09:00, Rossio station", start: at(4, 9), end: at(4, 18), tz: "Europe/Lisbon", place: null, ref: null, href: `${OWN}/#thread=t3`, wx: WX(4) },
    { id: "K7QX2M-2", kind: "flight", title: "TP1366 home", sub: "Lisbon 18:05 → Heathrow T2 20:40", start: at(6, 18, 5), end: at(6, 20, 40), tz: "Europe/Lisbon", place: null, ref: "K7QX2M", href: `${OWN}/#thread=t1`, wx: WX(6) },
  ],
  days: [
    { day: "2026-11-03", hi: "19°", lo: "12°", icon: "sun", label: "Clear", said: "sunny" },
    { day: "2026-11-04", hi: "17°", lo: "13°", icon: "rain", label: "Rain", said: "rain from 13:00" },
    { day: "2026-11-05", hi: "18°", lo: "12°", icon: "cloud", label: "Overcast", said: "cloudy" },
    { day: "2026-11-06", hi: "20°", lo: "13°", icon: "partly-sun", label: "Partly Cloudy", said: "sunny spells" },
  ],
};
const ROCK = { at: at(2, 19, 30), app: "mail", title: "Table at Rockfish", sub: "2 people · Exeter Quay", href: `${OWN}/#thread=rock`, id: "mail-rock-0211", booking: "rock-0211", kind: "restaurant",
  wx: "/weather/?lat=50.7196&lon=-3.5311&name=Rockfish#day=2026-11-02", place: "Rockfish" };
const answerWith = (p = "midday", more = {}) => { const a = FIX(p); return { ...a, trip: TRIP, upcoming: [...a.upcoming, ROCK].sort((x, y) => x.at - y.at), ...more }; };
function drawn(answer, now, extra = {}) {
  const root = new El("div");
  root.id = "today";
  day.drawDay(root, answer, { now, links: LINKS, timers: false, ...extra });
  return { root, sec: (k) => root.querySelector(`#${k}`) };
}

test("tripOf: the answer's trip checked on the page, field by field; anything malformed dropped", { skip }, () => {
  const t = trip.tripOf({ trip: TRIP });
  assert.equal(t.name, "Lisbon");
  assert.equal(t.items.length, 4);
  assert.equal(t.days.length, 4);
  assert.equal(t.destination, "Lisbon");
  for (const bad of [null, "x", { ...TRIP, id: "a b" }, { ...TRIP, name: "" }, { ...TRIP, start: "soon" }, { ...TRIP, items: [] }, { ...TRIP, items: [{ id: "x" }] }])
    assert.equal(trip.tripOf({ trip: bad }), null, JSON.stringify(bad)?.slice(0, 60));
  const odd = trip.tripOf({ trip: { ...TRIP, tz: "Mars/Base", apart: "0", days: [...TRIP.days, { day: "soon" }, null, { day: "2026-11-07", icon: "<svg>" }],
    items: [...TRIP.items, { id: "x1", kind: "parcel", title: "P", start: 1 }, { ...TRIP.items[0], id: "x2", tz: "Nope/Nope", title: "x".repeat(300) }] } });
  assert.equal(odd.tz, null);
  assert.equal(odd.apart, null);
  assert.deepEqual(odd.days.map((d) => d.day), ["2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"]);
  assert.equal(odd.days[4].icon, "", "an icon name that isn't one: none");
  assert.deepEqual(odd.items.map((b) => b.id), ["K7QX2M-1", "x2", "bk-5521876", "gyg-1", "K7QX2M-2"], "a kind the page doesn't know: dropped");
  assert.equal(odd.items[1].title.length, 80);
  assert.equal(odd.items[1].tz, null);
});

test("the trip card: where and when, the time there against home's, the next booking and four days of weather", { skip }, () => {
  const now = at(2, 12, 30), t = trip.tripOf({ trip: TRIP });
  const html = trip.tripCardHtml(t, { now, tz: "Europe/London" });
  assert.match(html, /<button type="button" class="tcard glass trip-card" data-do="trip" data-trip="trip-lisbon"/);
  assert.match(html, /<b class="tp-h">Lisbon tomorrow<\/b><small>Tue 3 – Fri 6 Nov · same time as home<\/small>/);
  assert.match(html, /<span class="tp-pill">Booked<\/span><span class="tx"><b>TP1351 to Lisbon · Tue 07:40<\/b> <span>Heathrow T2 07:40 → 10:15 · seat 14C<\/span><\/span><span class="tp-ref">ref K7QX2M<\/span>/);
  const days = [...html.matchAll(/<span class="tp-day"><small>(\w+)<\/small><svg[^>]*aria-label="([^"]+)"[\s\S]*?<b>([^<]+)<\/b>/g)].map((m) => [m[1], m[2], m[3]]);
  assert.deepEqual(days, [["Tue", "Clear", "19°"], ["Wed", "Rain", "17°"], ["Thu", "Overcast", "18°"], ["Fri", "Partly Cloudy", "20°"]]);
  assert.match(trip.tripCardHtml(t, { now: at(1, 9), tz: "Europe/London" }), /Lisbon on Tuesday/);
  assert.match(trip.tripCardHtml(t, { now: at(3, 6), tz: "Europe/London" }), /Lisbon today/);
  const away = trip.tripCardHtml(t, { now: at(4, 20), tz: "Europe/London" });
  assert.match(away, /In Lisbon/);
  assert.match(away, /<b>TP1366 home · Fri 18:05<\/b>/, "the next booking from now");
  assert.equal([...away.matchAll(/class="tp-day"/g)].length, 3, "the weather from today on: Wednesday to Friday");
  assert.equal(trip.apartSaid(60), "1 h ahead of home");
  assert.equal(trip.apartSaid(-330), "5 h 30 min behind home");
  assert.equal(trip.apartSaid(30), "30 min ahead of home");
  assert.equal(trip.apartSaid(null), "");
  assert.equal(trip.datesSaid({ start: at(1, 9), end: at(1, 20), tz: null }, "Europe/London"), "Sun 1 Nov");
  assert.equal(trip.datesSaid({ start: Date.UTC(2026, 9, 31, 9), end: at(3, 9), tz: null }, "Europe/London"), "Sat 31 Oct – Tue 3 Nov");
  assert.equal(trip.tripCardHtml(null), "");
  const bare = trip.tripCardHtml(trip.tripOf({ trip: { ...TRIP, days: [], apart: null } }), { now, tz: "Europe/London" });
  assert.ok(!/tp-wx/.test(bare) && /<small>Tue 3 – Fri 6 Nov<\/small>/.test(bare), "no weather, no zone: neither said");
});

test("the trip day by day: each of its days with the weather there, its bookings under it, Nothing booked where there's none", { skip }, () => {
  const html = trip.tripDaysHtml(trip.tripOf({ trip: TRIP }), { now: at(2, 12, 30), tz: "Europe/London" });
  const heads = [...html.matchAll(/<h3 class="tv-day"><span>([^<]+)<\/span>(?:<span class="tv-wx">(?:<svg[\s\S]*?<\/svg>)?([^<]*)<\/span>)?<\/h3>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(heads, [["Tuesday 3", "19° sunny"], ["Wednesday 4", "17° rain from 13:00"], ["Thursday 5", "18° cloudy"], ["Friday 6", "20° sunny spells"]]);
  const rows = [...html.matchAll(/data-bid="([^"]+)"[\s\S]*?<b>([^<]+)<\/b>[\s\S]*?<span class="tv-tm">([^<]+)<\/span>/g)].map((m) => [m[1], m[2], m[3]]);
  assert.deepEqual(rows, [["K7QX2M-1", "TP1351 to Lisbon", "07:40"], ["bk-5521876", "Memmo Alfama", "15:00"], ["gyg-1", "Sintra day trip", "09:00"], ["K7QX2M-2", "TP1366 home", "18:05"]]);
  assert.match(html, /Thursday 5<\/span>[\s\S]*?<p class="tv-none">Nothing booked<\/p>/);
});

test("drawDay: the trip above Waiting for You and Mail's rows in Coming Up (from Mail, a tap for its sheet); never beside a ride", { skip }, () => {
  const a = answerWith(), { sec } = drawn(a, a.at);
  assert.equal(sec("trip").hidden, false);
  assert.match(sec("trip").innerHTML, /Lisbon tomorrow/);
  const coming = sec("coming").innerHTML;
  assert.match(coming, /<div class="dc-row dc-mail" data-due="\d+">\s*<a class="row dc-main" href="https:\/\/email\.inflite\.ai\/#thread=rock" data-do="booking" data-bid="rock-0211" aria-haspopup="dialog">/);
  assert.match(coming, /<b>Table at Rockfish<\/b><small>2 people · Exeter Quay<\/small><span class="dc-from"><i><\/i>from Mail<\/span>/);
  assert.match(coming, /<span class="dc-ic bk-ic"><svg/);
  // (at the hub, its email by the hub's own path)
  const hub = { on: true, base: "/", go: (u) => (u.startsWith(`${OWN}/`) ? `/mail/${u.slice(OWN.length + 1)}` : u), send: () => Promise.resolve(true), chat: () => Promise.resolve(null) };
  assert.match(drawn(a, a.at, { hub }).sec("coming").innerHTML, /href="\/mail\/#thread=rock" data-do="booking"/);
  // (before a ride: nothing but the ride; no trip)
  const p = answerWith("preride"), r = drawn(p, p.at);
  assert.equal(r.sec("trip").hidden, true);
  assert.equal(r.sec("trip").innerHTML, "");
  // (no trip in the answer: none drawn)
  const none = drawn({ ...FIX("midday") }, FIX("midday").at);
  assert.equal(none.sec("trip").hidden, true);
  // (a hostile title: escaped)
  const evil = { ...TRIP, name: '<img src=x onerror="alert(1)">', items: [{ ...TRIP.items[0], title: "<script>x</script>", sub: '"><u>' }] };
  const e = drawn(answerWith("midday", { trip: evil, upcoming: [{ ...ROCK, title: "<i>Rock</i>" }] }), a.at);
  const all = e.sec("trip").innerHTML + e.sec("coming").innerHTML;
  assert.ok(!/<img src=x|<script>|"><u>|<i>Rock/.test(all), all.match(/.{40}(<img src=x|<script>|"><u>|<i>Rock).{40}/)?.[0]);
  assert.match(e.sec("trip").innerHTML, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; tomorrow/);
});

test("trip.js: no inline style, handler, box to type in or storage; its file kept by Today's service worker", { skip }, () => {
  const js = readFileSync(new URL("trip.js", PUB), "utf8");
  assert.ok(!/style=\\?["']|setAttribute\(\s*["']style|\son[a-z]+=\\?["']|<input|<textarea|localStorage|sessionStorage|indexedDB/i.test(js));
  assert.ok(!/\b(openai|anthropic|llm|gpt)\b/i.test(js), "no AI anywhere");
  assert.match(readFileSync(new URL("sw.js", PUB), "utf8"), /"\/trip\.js"/);
  assert.match(readFileSync(new URL("index.html", PUB), "utf8"), /<div class="day-side" id="side"><section id="trip" hidden><\/section><section id="waiting"><\/section>/);
});
