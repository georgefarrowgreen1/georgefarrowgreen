// Weather's "Send to a friend" (weather/send.js): the forecast as a card for Chat, checked by Chat's own rules
// (pigeon/cards.js normCard), its place only ever a 0.05° cell, its rain in real moments, and the address it goes to;
// at InFlite's hub, handed to the hub's own Send (IFL.hub.send) instead, and off it, as ever.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { weatherSendCard, chatHash, chatPage, leadOf, packCard, sendWay } from "../../../weather/send.js";
import { shapeForecast } from "../../../weather/data.js";
import { makeFormat, nowWall } from "../../../weather/format.js";
import * as I from "../../../weather/insights.js";
import { normCard, readShareHash, unpackCard } from "../../../pigeon/cards.js";
import * as F from "../mocks/wxappdata.mjs";

const f = makeFormat({ temp: "c", wind: "mph", precip: "mm", clock: "24" });
const LAT = 51.5072, LON = -0.1276;
// (the Weather app's own test forecast, as Open-Meteo would send it, shaped as the page shapes it; London's, in UTC)
const forecastAt = (now, sc) => shapeForecast(F.forecast(now, sc), { name: "London", lat: LAT, lon: LON });

test("the card passes Chat's checks, its place a 0.05° cell, never the place itself, and no warning", () => {
  const now0 = Date.now(), wx = forecastAt(now0, { rainIn: 90 }), now = nowWall(wx.place.offset, now0);
  const said = I.headline(wx, now, f), c = weatherSendCard(wx, now, f, { name: "London", headline: said });
  assert.ok(c, "a card");
  const n = normCard(c);
  assert.ok(n, "normCard keeps it");
  assert.equal(n.kind, "weather"); assert.equal(n.from, "weather");
  assert.deepEqual(c.ref.cell, [51.5, -0.15]);
  assert.deepEqual(n.ref.cell, c.ref.cell, "already on Chat's 0.05° grid");
  const json = JSON.stringify(c);
  assert.ok(!json.includes("51.5072") && !json.includes("0.1276"), "no exact coordinates");
  assert.ok(!("warn" in c.snap) && !("warning" in c.snap), "no warning field");
  assert.equal(n.snap.place, "London");
  assert.equal(c.snap.lead, leadOf(said));
  assert.ok(c.say.startsWith("London today: "), c.say);
  assert.ok(Math.abs(c.at - now0) < 1000, "at: the real moment, not the place's wall time");
  // (Chat's own normCard changes nothing a sent card holds, but the words it rebuilds the same)
  for (const k of ["temp", "feels", "hi", "lo", "code", "isDay", "rain"]) assert.deepEqual(n.snap[k], c.snap[k], k);
});

test("rain in real milliseconds, not the place's wall time", () => {
  // (a place an hour ahead of UTC: its wall times an hour on from the real ones)
  const now0 = Date.UTC(2026, 9, 19, 9, 7), j = F.forecast(now0 + 3600e3, { rainIn: 60 });
  j.utc_offset_seconds = 3600; j.timezone = "Europe/Paris";
  const wx = shapeForecast(j, { name: "Paris", lat: 48.8566, lon: 2.3522 }), now = nowWall(3600, now0);
  const c = weatherSendCard(wx, now, f, { name: "Paris", headline: I.headline(wx, now, f) });
  assert.ok(c.snap.rain && c.snap.rain.now === false, JSON.stringify(c.snap.rain));
  // (the rain is due about an hour from now, really: within the quarter hours, so wall − offset)
  const inMin = (c.snap.rain.at - now0) / 60e3;
  assert.ok(inMin > 30 && inMin < 90, `rain at in ${inMin} min`);
  assert.equal(c.snap.tz, "Europe/Paris");
  assert.ok(normCard(c), "and Chat keeps it");
  assert.equal(normCard(c).snap.rain.at, c.snap.rain.at);
  // (the card's moment the real one too, not Paris's wall time, an hour on)
  assert.ok(Math.abs(c.at - now0) < 1000, `at ${(c.at - now0) / 60e3} min from now`);
});

test("a place hours ahead of UTC, or behind: the card's moment and its dry spell in real ms, as many hours from now as on the place's clock", () => {
  for (const [offset, tz] of [[9 * 3600, "Asia/Tokyo"], [-5 * 3600, "America/New_York"]]) {
    // (the test forecast written in the place's wall time, as Open-Meteo sends it for a zone)
    const now0 = Date.UTC(2026, 9, 19, 7, 20) - offset * 1000, j = F.forecast(now0 + offset * 1000, {});
    j.utc_offset_seconds = offset; j.timezone = tz;
    const wx = shapeForecast(j, { name: "There", lat: 40, lon: 10 }), now = nowWall(offset, now0);
    assert.equal(now - now0, offset * 1000, "(wall and real differ by the offset)");
    const c = weatherSendCard(wx, now, f, { name: "There", headline: I.headline(wx, now, f) });
    assert.ok(Math.abs(c.at - now0) < 1000, `${tz}: at is the real moment, ${(c.at - now0) / 3600e3} h out`);
    const sp = c.snap.spell;
    assert.ok(sp, `${tz}: a dry spell`);
    // (the page's own Best times tile for it, in wall ms: the card's the same hours from now, so wall − offset)
    const tile = I.windows(wx, now, f, { activities: [{ ...I.ACTIVITIES[sp.act], id: sp.act, on: true }], extras: { laundry: false, stars: false, sunset: false } }).find((w) => w.id === sp.act);
    assert.equal(sp.start, tile.start - offset * 1000, `${tz}: start in real ms`);
    assert.equal(sp.end, tile.end - offset * 1000, `${tz}: end in real ms`);
    assert.notEqual(sp.start, tile.start, `${tz}: not the wall time`);
    assert.ok(sp.start >= now0 - 3600e3 && sp.end <= now0 + 48 * 3600e3, `${tz}: within 48 h of now, really`);
    assert.equal(new Date(sp.start + offset * 1000).getUTCMinutes(), 0, "on the hour, on the place's clock");
    assert.deepEqual(normCard(c).snap.spell, sp, `${tz}: and Chat keeps it`);
  }
});

test("dry: rain is null; a dry spell for a ride or a run, in real ms, inside the next two days", () => {
  const now0 = Date.UTC(2026, 9, 19, 7, 0), wx = forecastAt(now0, {}), now = nowWall(wx.place.offset, now0);
  const c = weatherSendCard(wx, now, f, { name: "London", headline: I.headline(wx, now, f) });
  assert.equal(c.snap.rain, null);
  const sp = c.snap.spell;
  assert.ok(sp, "a dry spell: the test day is mild and dry"); {
    assert.ok(["cycle", "run"].includes(sp.act) && ["Great", "Good", "Fair"].includes(sp.rating), JSON.stringify(sp));
    assert.ok(sp.start >= now0 - 3600e3 && sp.end <= now0 + 48 * 3600e3 && sp.end > sp.start);
    assert.deepEqual(normCard(c).snap.spell, sp);
  }
  // (your own limits for a ride, where you've set them: none of the day fits them, so no spell)
  const fussy = weatherSendCard(wx, now, f, { activities: [{ id: "cycle", tmin: 40, tmax: 45 }, { id: "run", tmin: 40, tmax: 45 }], headline: "" });
  assert.equal(fussy.snap.spell, null);
  assert.equal(fussy.say, "The weather in London.", "no headline: plain words");
});

test("no forecast, or no place: no card", () => {
  assert.equal(weatherSendCard(null, Date.now(), f), null);
  assert.equal(weatherSendCard({ place: { lat: NaN, lon: 0 }, hourly: [{ t: 0 }] }, 0, f), null);
});

test("to Chat: chatPage() + chatHash(…) has /#share= first, and Chat reads both back", () => {
  const now0 = Date.now(), wx = forecastAt(now0, { rainIn: 90 }), now = nowWall(wx.place.offset, now0);
  const c = weatherSendCard(wx, now, f, { name: "London", headline: I.headline(wx, now, f) });
  const page = chatPage({ hostname: "weather.inflite.ai", origin: "https://weather.inflite.ai" });
  assert.equal(page, "https://chat.inflite.ai/");
  assert.equal(chatPage({ hostname: "localhost", origin: "http://localhost:8788" }), null, "elsewhere: none");
  const url = page + chatHash(c.say, c);
  assert.ok(url.startsWith("https://chat.inflite.ai/#share="), url.slice(0, 60));
  const hash = new URL(url).hash, got = readShareHash(hash);
  assert.equal(got.words, c.say);
  assert.ok(got.card && got.card.kind === "weather");
  assert.deepEqual(got.card.ref.cell, c.ref.cell);
  // (an older Chat reads only the words)
  assert.equal(new URLSearchParams(hash.slice(1)).get("share"), c.say);
  assert.ok(!url.includes("51.5072") && !decodeURIComponent(url).includes("51.5072"));
  // (the same four lines as Chat's own)
  assert.deepEqual(unpackCard(new URLSearchParams(hash.slice(1)).get("card")).snap.place, "London");
});

// ---- at InFlite's hub (Today First, spec §8.3, §9.2): Weather a page of inflite.ai, Send is the hub's (IFL.hub.send:
// Chat's own sheet over the page, or Chats' own and back), with the card packed as Chat's links carry it; off the hub
// (Weather at its own address), exactly as before ----
const cardNow = () => {
  const now0 = Date.now(), wx = forecastAt(now0, { rainIn: 90 }), now = nowWall(wx.place.offset, now0);
  return weatherSendCard(wx, now, f, { name: "London", headline: I.headline(wx, now, f) });
};

test("at the hub: the words and the card, packed as Chat's links carry it, for IFL.hub.send, and no address of Chat's own", () => {
  const c = cardNow(), hub = { on: true, base: "/weather/" };
  for (const loc of [{ hostname: "inflite.ai", origin: "https://inflite.ai" }, { hostname: "ifl.test", origin: "http://ifl.test:8788" }]) {
    const way = sendWay(c.say, c, { hub, loc });
    assert.equal(way.hub, true, loc.hostname);
    assert.equal(way.words, c.say);
    assert.ok(!("url" in way), "no address of Chat's: the hub sends");
    assert.equal(way.packed, packCard(c));
  }
  const { packed } = sendWay(c.say, c, { hub, loc: { hostname: "inflite.ai", origin: "https://inflite.ai" } });
  // (what the hub's own way through Chats takes: base64url alone, so a card can't put a back= of its own before the hub's)
  assert.match(packed, /^[A-Za-z0-9_-]+$/);
  assert.ok(packed.length <= 6000);
  // (Chat reads it back as the card sent: its own rules keep it, its place a 0.05° cell and nothing exact)
  const back = unpackCard(packed);
  assert.ok(back && back.kind === "weather" && back.from === "weather", JSON.stringify(back).slice(0, 120));
  assert.deepEqual(back.ref.cell, [51.5, -0.15]);
  assert.equal(back.snap.place, "London");
  assert.deepEqual(back, normCard(c), "the same card Chat's own checks make of it");
  const plain = Buffer.from(packed, "base64url").toString("utf8");
  assert.ok(!plain.includes("51.5072") && !plain.includes("0.1276"), "no exact coordinates in what's handed over");
  // (and as the hub's way through Chats puts it in Chats' address: read back there the same)
  const got = readShareHash(`#share=${encodeURIComponent(c.say)}&card=${packed}&back=${encodeURIComponent("/weather/")}`);
  assert.equal(got.words, c.say);
  assert.deepEqual(got.card, back);
});

test("at the hub: no card, or one too long to carry, and the words go alone", () => {
  const hub = { on: true };
  assert.deepEqual(sendWay("Rain at three", null, { hub }), { hub: true, words: "Rain at three", packed: null });
  const c = cardNow(), big = { ...c, snap: { ...c.snap, lead: "x".repeat(5000) } };
  assert.equal(packCard(big), null);
  assert.equal(sendWay(big.say, big, { hub }).packed, null);
});

test("off the hub: Send exactly as it always was, Chat beside Weather, the address IFL.hub.go leaves as it is", () => {
  const c = cardNow(), loc = { hostname: "weather.inflite.ai", origin: "https://weather.inflite.ai" };
  const was = chatPage(loc) + chatHash(c.say, c);
  for (const hub of [undefined, null, { on: false, base: "" }]) assert.deepEqual(sendWay(c.say, c, { hub, loc }), { url: was }, String(hub && JSON.stringify(hub)));
  // (on no address of its own, none: the phone's own sharing, as before)
  assert.equal(sendWay(c.say, c, { hub: { on: false }, loc: { hostname: "localhost", origin: "http://localhost:8788" } }), null);
  // (Weather's own copy of InFlite's hub, run as Weather's page at its own address: off, and go() hands back what it's given)
  const own = weatherHub("https://weather.inflite.ai/");
  assert.equal(own.on, false);
  assert.equal(own.base, "");
  assert.equal(own.go(was), was, "go() is the identity off the hub");
  assert.equal(own.href("weather", "radar"), null);
  assert.equal(own.signIn(), false);
  assert.deepEqual(sendWay(c.say, c, { hub: own, loc }), { url: was });
  // (and at the hub, the same copy, marked by the hub's Worker: on, its Send the hub's)
  const there = weatherHub("https://inflite.ai/weather/", "/weather/");
  assert.equal(there.on, true);
  assert.equal(there.base, "/weather/");
  assert.equal(sendWay(c.say, c, { hub: there, loc: { hostname: "inflite.ai", origin: "https://inflite.ai" } }).hub, true);
});

// Weather's own copy of InFlite's menu (weather/app.js, between its marks), run in a made-up page at href, marked as the
// hub's page (marker: the <meta name="ifl-hub"> content the hub's Worker puts in) or not → its IFL.hub
function weatherHub(href, marker = null) {
  const src = readFileSync(new URL("../../../weather/app.js", import.meta.url), "utf8");
  const block = /\nconst IFL = \(\(\) => \{[\s\S]*?\n\}\)\(\);\n(?=\/\/ ==== end of InFlite's menu ====)/.exec(src)?.[0];
  assert.ok(block, "Weather's copy of InFlite's menu");
  const node = () => ({ style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, dataset: {}, children: [], setAttribute() {}, getAttribute: () => null,
    append() {}, remove() {}, addEventListener() {}, replaceChildren() {}, insertAdjacentHTML() {}, querySelector: () => null, querySelectorAll: () => [] });
  const meta = marker == null ? null : { getAttribute: (k) => (k === "content" ? marker : null) };
  const document = { ...node(), body: node(), documentElement: node(), createElement: node, addEventListener() {},
    querySelector: (sel) => (sel === 'meta[name="ifl-hub"]' ? meta : null), querySelectorAll: () => [] };
  const at = new URL(href), assigned = [];
  const location = { href: at.href, origin: at.origin, host: at.host, hostname: at.hostname, protocol: at.protocol, pathname: at.pathname, search: at.search, hash: at.hash, assign: (u) => assigned.push(String(u)), replace: (u) => assigned.push(String(u)), reload() {} };
  const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
  const ctx = { document, location, sessionStorage: store(), localStorage: store(), history: { replaceState() {}, pushState() {}, back() {} }, navigator: {}, URL, URLSearchParams, Blob,
    requestAnimationFrame: (fn) => fn(), setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }), innerHeight: 800, innerWidth: 400 };
  ctx.window = ctx;
  return vm.runInNewContext(`${block};IFL.hub`, ctx);
}
