// Weather's views under InFlite's roof (One roof, spec §7.1 WV rows, §9.4 WV): the sky the hero takes (the same as
// Today's card's, for every code by day and night, at dusk and dawn), the 16 Days' range bars by "Days by", the detail
// sheet's words against weather/detail.js and the tiles against weather/app.js, the warnings slot (one card or a banner),
// the Warnings section's two empty states, and the credits against weather/index.html #credits, word for word.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// (what charts.js asks of the browser as it loads)
globalThis.innerWidth ??= 390; globalThis.addEventListener ??= () => {};
// a small stand-in DOM, enough for the views' element builders (wxui.js h()) to be run and their words read
class Node {
  constructor(tag) { this.tagName = tag; this.childNodes = []; this.attrs = {}; this.dataset = {}; this.className = ""; this.parentNode = null; this.style = { setProperty() {} }; this.listeners = {}; }
  append(...xs) { for (const x of xs) { if (x instanceof Node && x.tagName === "#fragment") this.append(...x.childNodes); else { if (x instanceof Node) x.parentNode = this; this.childNodes.push(x); } } }
  appendChild(x) { this.append(x); return x; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  hasAttribute(k) { return k in this.attrs; }
  addEventListener(k, fn) { this.listeners[k] = fn; }
  get classList() { const n = this; return { add: (...c) => { n.className = [...new Set([...n.className.split(" ").filter(Boolean), ...c])].join(" "); }, toggle() {}, contains: (c) => n.className.split(" ").includes(c) }; }
  get children() { return this.childNodes.filter((x) => x instanceof Node); }
  get textContent() { return this.childNodes.map((x) => (x instanceof Node ? x.textContent : x)).join(""); }
  set innerHTML(_) {}
  get content() { return { cloneNode: () => new Node("#fragment") }; }
}
globalThis.Node ??= Node;
globalThis.document ??= { createElement: (t) => new Node(t) };
const MOD = new URL("../../../weather/roof/", import.meta.url);
const read = (p) => readFileSync(new URL(p, new URL("../../../", import.meta.url)), "utf8");
const UI = await import(new URL("wxui.js", MOD));
const DETAIL = await import(new URL("wxdetail.js", MOD));
const WXWARN = await import(new URL("wxwarn.js", MOD));
const WARN = await import(new URL("warnings.js", MOD));
const DAYS = await import(new URL("days.js", MOD));
const NOW = await import(new URL("now.js", MOD));
const I = await import("../../../weather/insights.js");
const { skyFor } = await import("../../../functions/_todaywx.js");
const F = await import("../../../weather/format.js"), { makeFormat, DAY, HOUR } = F;
const SKY = await import("../../../weather/sky.js");

// the source of `head` up to its matching close (brace or bracket matched, strings skipped)
function extract(src, head) {
  const i = src.indexOf(head);
  assert.ok(i >= 0, `found ${head}`);
  const open = src.slice(i).search(/[{[]/) + i, pair = { "{": "}", "[": "]" }, stack = [];
  let q = null;
  for (let k = open; k < src.length; k++) {
    const c = src[k];
    if (q) { if (c === "\\") k++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === "`") { q = c; continue; }
    if (c === "{" || c === "[") stack.push(pair[c]);
    else if (c === "}" || c === "]") { assert.equal(c, stack.pop()); if (!stack.length) return src.slice(i, k + 1); }
  }
  throw new Error(`unclosed ${head}`);
}
const SKIES = ["clear-day", "partly-day", "cloudy-day", "rain-day", "storm", "snow-day", "fog", "clear-night", "partly-night", "cloudy-night", "rain-night", "snow-night", "dusk", "dawn"];
const CODES = [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99, 42];
const D0 = Date.UTC(2026, 10, 3), RISE = D0 + 7 * HOUR, SET = D0 + 16.5 * HOUR;
const wxAt = (code, isDay) => ({ current: { code, isDay, temp: 10 }, hourly: [], daily: [{ key: "2026-11-03", date: D0, sunrise: RISE, sunset: SET }], place: { lat: 51.5, lon: -0.1, offset: 0 } });

test("skyClass: the hero's sky is Today's card's (functions/_todaywx.js skyFor) for every code, by day and night, at dusk and at dawn", () => {
  const seen = new Set();
  for (const code of CODES) for (const isDay of [true, false]) for (const now of [D0 + 12 * HOUR, D0 + 22 * HOUR, RISE + 10 * 60e3, RISE - 30 * 60e3, SET - 20 * 60e3, SET + 39 * 60e3, SET + 41 * 60e3]) {
    const wx = wxAt(code, isDay), want = skyFor(wx, now), got = UI.skyClass(wx, now);
    assert.equal(got, `wx-sk-${want}`, `code ${code}, ${isDay ? "day" : "night"}, ${new Date(now).toISOString()}`);
    assert.ok(SKIES.includes(got.slice(6)));
    seen.add(want);
  }
  for (const s of SKIES) assert.ok(seen.has(s), `the fixtures reach ${s}`);
  assert.equal(UI.skyClass(null, D0), "wx-sk-cloudy-day", "no forecast yet: a plain sky");
  // (the copy is app.js's, word for word, as Today's is)
  const body = (src, head) => { const i = src.indexOf(head); return src.slice(i, src.indexOf("\n}\n", i) + 2); };
  assert.equal(body(read("weather/roof/wxui.js"), "export function skyName(wx, now) {").replace("export function skyName", "function skyFor"), body(read("weather/app.js"), "function skyFor(wx, now) {"));
});

test("16 Days' range bar, by Days by: temperature low to high, rain from nothing to its chance, wind to its gusts", () => {
  const days = [{ tmin: 4, tmax: 12, popMax: 80, windMax: 20, gustMax: 45 }, { tmin: 8, tmax: 16, popMax: 10, windMax: 10, gustMax: 18 }, { tmin: 6, tmax: 6.1, popMax: 0, windMax: 70, gustMax: 95 }];
  const t = UI.daysScale(days, "temp");
  assert.deepEqual([t.lo, t.span], [4, 12]);
  assert.deepEqual(UI.rangeBar(days[0], t), { left: 0, width: 8 / 12 });
  assert.deepEqual(UI.rangeBar(days[1], t), { left: 4 / 12, width: 8 / 12 });
  const thin = UI.rangeBar(days[2], t);
  assert.equal(thin.width, 0.03, "a day that barely moves still shows");
  assert.ok(thin.left + thin.width <= 1);
  const r = UI.daysScale(days, "rain");
  assert.deepEqual(UI.rangeBar(days[0], r), { left: 0, width: 0.8 });
  assert.deepEqual(UI.rangeBar(days[2], r), { left: 0, width: 0 });
  const w = UI.daysScale(days, "wind");
  assert.equal(w.span, 95, "to the strongest gust");
  const b = UI.rangeBar(days[0], w);
  assert.ok(Math.abs(b.left - 20 / 95) < 1e-9 && Math.abs(b.width - 25 / 95) < 1e-9);
  assert.equal(UI.daysScale([{ windMax: 5, gustMax: 9 }], "wind").span, 50, "a calm fortnight on a 50 km/h scale, not a stormy-looking one");
  // (and what each row says on the right)
  const f = makeFormat({ temp: "c", wind: "mph", precip: "mm", clock: "24" });
  assert.equal(DAYS.rowWords({ ...days[0], precip: 3.2 }, "rain", f).value, "80%");
  assert.match(DAYS.rowWords({ ...days[0], precip: 0 }, "rain", f).small, /a trace/);
  assert.match(DAYS.rowWords(days[0], "wind", f).small, /^gusts \d+$/);
  assert.equal(DAYS.rowWords(days[0], "temp", f).value, f.temp(12));
});

test("the detail sheet's words are weather/detail.js's, and the tiles weather/app.js's (kinds, names, order)", () => {
  const detail = read("weather/detail.js"), app = read("weather/app.js");
  const ABOUT = new Function(`${extract(detail, "const ABOUT = {")}; return ABOUT;`)();
  const wx = { marine: { km: 7 } };
  for (const units of [{ temp: "c", wind: "mph", precip: "mm", pressure: "hpa" }, { temp: "f", wind: "kmh", precip: "in", pressure: "inhg" }]) {
    const f = makeFormat(units);
    assert.deepEqual(Object.keys(DETAIL.ABOUT), Object.keys(ABOUT));
    for (const k of Object.keys(ABOUT)) assert.equal(DETAIL.ABOUT[k](f, wx), ABOUT[k](f, wx), k);
  }
  const TILES = new Function(`return ${extract(app, "const TILES = [").replace(/^const TILES = /, "")};`)();
  assert.deepEqual(UI.TILES, TILES);
  for (const name of ["uvName", "airName", "seaName"]) {
    const line = app.split("\n").find((l) => l.startsWith(`const ${name} = `));
    const theirs = new Function(`${line}; return ${name};`)();
    for (const v of [null, 0, 2.9, 5, 7.5, 10, 12, 19, 21, 39, 59, 79, 99, 101, 14, 17, 25]) assert.equal(UI[name](v), theirs(v), `${name}(${v})`);
  }
  // the tiles a forecast gives, in their order, each with a value (no page needed to work them out)
  const f = makeFormat({});
  const fx = { place: { lat: 51.5, lon: -0.1, offset: 0 }, current: { t: D0 + 12 * HOUR, temp: 11, feels: 9, wind: 18, gust: 30, dir: 220, rh: 70, dew: 6, pressure: 1012, vis: 15000, uv: 2, code: 3, isDay: true },
    hourly: Array.from({ length: 72 }, (_, i) => ({ t: D0 - DAY + i * HOUR, temp: 10, precip: 0.2, pressure: 1010, uv: 1, isDay: true, code: 3 })), daily: [{ key: "2026-11-03", date: D0, sunrise: RISE, sunset: SET, daylight: 9.5 * 3600 }] };
  const { tiles } = UI.tileSays(fx, D0 + 12 * HOUR, f);
  const kinds = tiles.map((t) => t[0]);
  assert.deepEqual(kinds, TILES.map((t) => t[0]).filter((k) => kinds.includes(k)), "in app.js's order");
  for (const k of ["feels", "wind", "humidity", "rain", "pressure", "visibility", "uv", "sun"]) assert.ok(kinds.includes(k), k);
  for (const t of tiles) assert.ok(typeof t[3] === "string" && t[3], `${t[0]} has a value`);
  assert.equal(tiles.find((t) => t[0] === "wind")[3], `${f.windNum(18)} ${f.windUnit}`);
});

// One place, its forecast with the air, the sea and the sky in it: a day, the hours around it, and the week ahead
const NOON = D0 + 12 * HOUR;
function fixture() {
  const hourly = Array.from({ length: 24 * 9 }, (_, i) => {
    const t = D0 - DAY + i * HOUR, hr = ((t - D0) / HOUR + 240) % 24, day = hr >= 7 && hr < 16.5;
    return { t, temp: 6 + 6 * Math.sin(((hr - 9) / 24) * 2 * Math.PI), feels: 3 + 6 * Math.sin(((hr - 9) / 24) * 2 * Math.PI), wind: 10 + (i % 7) * 3, gust: 25 + (i % 5) * 6, dir: (200 + i * 7) % 360,
      rh: 60 + (i % 30), dew: 4 + (i % 5) * 0.4, pressure: 1016 - i * 0.12, vis: 8000 + (i % 9) * 2500, uv: day ? Math.max(0, 3 * Math.sin(((hr - 7) / 9.5) * Math.PI)) : 0,
      precip: i % 11 === 0 ? 1.4 : i % 5 === 0 ? 0.2 : 0, pop: (i * 13) % 100, code: i % 11 === 0 ? 61 : 3, isDay: day };
  });
  const daily = Array.from({ length: 9 }, (_, k) => { const date = D0 + (k - 1) * DAY; return { key: new Date(date).toISOString().slice(0, 10), date, sunrise: date + 7 * HOUR + k * 2 * 60e3, sunset: date + 16.5 * HOUR - k * 2 * 60e3, daylight: (9.5 * 3600) - k * 240, tmax: 12 + k % 3, tmin: 3 + k % 2, code: 3 }; });
  const air = { current: { eaqi: 34, pm25: 7.6 }, hourly: Array.from({ length: 60 }, (_, i) => ({ t: NOON - 2 * HOUR + i * HOUR, eaqi: 20 + (i % 12) * 3, pm25: 5 + (i % 6), grass: i < 14 ? 35 : 5 })) };
  const marine = { km: 7, hourly: Array.from({ length: 60 }, (_, i) => ({ t: NOON - 3 * HOUR + i * HOUR, sst: 12.4, wave: 0.8 + 0.3 * Math.sin(i / 4), waveDir: 240, period: 7, tide: 1.8 * Math.sin(((i - 3) / 12.4) * 2 * Math.PI) })),
    tides: [{ t: NOON + 3 * HOUR, h: 1.8, high: true }, { t: NOON + 9.2 * HOUR, h: -1.8, high: false }, { t: NOON + 15.4 * HOUR, h: 1.8, high: true }, { t: NOON + 21.6 * HOUR, h: -1.8, high: false }] };
  return { place: { lat: 51.5, lon: -0.1, offset: 0, name: "Brighton" }, current: { ...hourly.find((x) => x.t === NOON), t: NOON }, hourly, daily, air, marine, fetchedAt: NOON };
}
// a top-level function's source, to its closing brace at the start of a line
const top = (src, head) => { const i = src.indexOf(head); assert.ok(i >= 0, `found ${head}`); return src.slice(i, src.indexOf("\n}\n", i) + 2); };
const words = (nodes) => (nodes || []).flat(Infinity).filter(Boolean).map((n) => (typeof n === "string" ? n : n.textContent).replace(/\s+/g, " ").trim()).filter(Boolean);

test("Right now's sheets say what weather/app.js tiles() and weather/detail.js openDetail() say, word for word, on one forecast with the air, the sea and the sky", () => {
  const app = read("weather/app.js"), detail = read("weather/detail.js");
  const fmt = F, wx = fixture();
  const line = (head) => app.split("\n").find((l) => l.startsWith(head));
  const fns = ["thermometer", "pressureDial", "rainBars", "tideCurve"];
  for (const units of [{ temp: "c", wind: "mph", precip: "mm", pressure: "hpa", clock: "24" }, { temp: "f", wind: "kmh", precip: "in", pressure: "inhg", clock: "12" }]) {
    const f = makeFormat(units), S = { f, wx };
    // app.js tiles(), run as it is: its drawings stand-ins (no words in them), the rest app.js's own
    const scope = { S, I, DAY, HOUR, dayStart: fmt.dayStart, compassWord: fmt.compassWord, beaufort: fmt.beaufort, h: UI.h, uvName: UI.uvName, airName: UI.airName, seaName: UI.seaName, TILES: UI.TILES,
      moonIcon: () => "", nextPhases: SKY.nextPhases, cell: () => "c", tileFor: () => null, $: () => ({ replaceChildren() {}, children: [] }), moving: () => false, rewords() {}, motion() {}, innerHeight: 800,
      fillBar: () => null, ...Object.fromEntries(fns.map((k) => [k, () => (k === "thermometer" ? "" : null)])) };
    const tilesSrc = [line("const knob = "), line("const scaleBar = "), line("const mid = "), top(app, "function tiles(wx, now) {")].join("\n");
    new Function(...Object.keys(scope), `${tilesSrc}\ntiles(S.wx, ${NOON});`)(...Object.values(scope));
    const mine = UI.tileSays(wx, NOON, f);
    assert.deepEqual(Object.keys(mine.say).sort(), Object.keys(S.say).sort(), "the same tiles");
    for (const k of ["air", "sea", "sun", "moon"]) assert.ok(S.say[k], `the fixture has ${k}`);
    for (const k of Object.keys(S.say)) assert.deepEqual(words(mine.say[k]()), words(S.say[k]()), `${k}: what it says now`);
    for (const k of Object.keys(S.more)) assert.deepEqual(words(mine.more[k]()), words(S.more[k]()), `${k}: the rest of its sheet`);
    // detail.js openDetail(), run as it is: the sheet's words (charts aside), against detailBody's
    let got = null;
    const dscope = { S, TILES: UI.TILES, nowWall: () => NOON, I, h: UI.h, cell: () => "c", timeChart() {}, nightsOf: UI.nightsOf, T: () => (f.units.temp === "f" ? (c) => c * 9 / 5 + 32 : (c) => c), COLOR: UI.COLOR,
      compassWord: fmt.compassWord, compass: fmt.compass, dayStart: fmt.dayStart, keyOf: fmt.keyOf, uvName: UI.uvName, airName: UI.airName, HOUR, DAY, drawHourChart() {}, calm: () => false, glyph: () => "",
      $: (id) => (id === "detail-body" ? { replaceChildren: (...k) => { got = k; } } : { open: false, children: [], replaceChildren() {}, querySelector: () => ({}) }),
      retitle() {}, detailKinds: () => [], easeHeight: (_, fn) => fn(), openSheet() {}, slideIn() {}, requestAnimationFrame() {} };
    const ABOUT = extract(detail, "const ABOUT = {");
    const open = new Function(...Object.keys(dscope), `${ABOUT};\n${top(detail, "export function openDetail(kind, dir = 0) {").replace(/^export /, "")}\nreturn openDetail;`)(...Object.values(dscope));
    for (const k of Object.keys(S.say)) {
      got = null;
      open(k);
      assert.ok(got, `${k}: detail.js drew its sheet`);
      assert.deepEqual(words(DETAIL.detailBody(wx, NOON, f, k).kids), words(got), `${k}: the sheet's words (${units.temp})`);
    }
  }
});

test("Now's status line: nothing while it refreshes by itself (a stale forecast included); Offline · from its time, with Retry, once it fails; the sync error without Retry; Updating… when asked", () => {
  const f = makeFormat({ clock: "24" }), wx = fixture(), sync = "Couldn’t sync with your account", at = f.time(NOON);
  const S = (o) => ({ loading: false, error: null, stale: false, updatedAt: NOON, ...o });
  // (data.js load() reports the kept forecast as stale as the refresh starts: not "Offline")
  assert.deepEqual(NOW.statusOf(S({ loading: true, stale: true }), wx, f, false, sync), { text: "", warn: false, retry: false, failed: null });
  // (the refresh failed with a forecast in hand: Offline, from when it was fetched, and Try Again)
  const off = NOW.statusOf(S({ error: "Couldn’t get the forecast", stale: false }), wx, f, false, sync);
  assert.equal(off.text, `Offline · from ${at}`); assert.equal(off.retry, true); assert.equal(off.warn, true);
  assert.equal(NOW.statusOf(S({ stale: true }), wx, f, false, sync).text, `Offline · from ${at}`, "kept, and nothing come since");
  assert.match(NOW.statusOf(S({ error: "The forecast service is busy" }), wx, f, false, sync).text, /^Forecast service busy · from /);
  // (the account's sync: said, no Retry, even while a refresh is under way)
  assert.deepEqual(NOW.statusOf(S({ error: sync }), wx, f, false, sync), { text: sync, warn: true, retry: false, failed: null });
  assert.equal(NOW.statusOf(S({ error: sync, loading: true }), wx, f, false, sync).retry, false);
  // (asked for: Updating…, though the kept one is stale)
  assert.deepEqual(NOW.statusOf(S({ loading: true, stale: true }), wx, f, true, sync), { text: "Updating…", warn: false, retry: false, failed: null });
  // (no forecast at all: the hero says it failed; the line's empty and Try Again shows)
  assert.deepEqual(NOW.statusOf(S({ error: "Couldn’t get the forecast" }), null, f, false, sync), { text: "", warn: false, retry: true, failed: "Couldn’t get the forecast" });
  assert.equal(NOW.statusOf(S({ loading: true }), null, f, false, sync).text, "");
  assert.equal(NOW.statusOf(S({}), wx, f, false, sync).text, "", "fresh: nothing to say");
});

const W = (o) => ({ id: o.id, issuer: "Met Office", via: "MeteoAlarm", onset: "2026-11-03T06:00:00Z", expires: "2099-01-01T00:00:00Z", ...o });
test("the warnings slot: nothing, one warning as its card, or one banner for more, the most severe first", () => {
  const f = makeFormat({}), now = Date.UTC(2026, 10, 3, 12), real = Date.UTC(2026, 10, 3, 12);
  const base = { place: { lat: 51.5, lon: -0.1, offset: 0 }, hourly: [], daily: [] };
  const none = WARN.warningsOf({ ...base, official: [] }, now, f, { insights: [], real });
  assert.deepEqual(WARN.slotOf(none), { n: 0, kind: "none", text: "", line: "", colour: null, level: null });
  const one = WARN.warningsOf({ ...base, official: [W({ id: "a", event: "Yellow rain warning", level: 2, type: 10 })] }, now, f, { insights: [], real });
  const s1 = WARN.slotOf(one);
  assert.equal(s1.kind, "one"); assert.equal(s1.text, "Rain warning"); assert.equal(s1.colour, "yellow"); assert.equal(s1.level, "warn");
  const two = WARN.warningsOf({ ...base, official: [W({ id: "a", event: "Yellow rain warning", level: 2, type: 10 }), W({ id: "b", event: "Amber wind warning", level: 3, type: 1 })] }, now, f, { insights: [], real });
  const s2 = WARN.slotOf(two);
  assert.equal(s2.kind, "banner");
  assert.equal(s2.text, "2 warnings · Amber wind, Yellow rain", "the worst first, in the banner's words");
  assert.equal(s2.colour, "amber");
  // (an official warning says the app's own already: that one's left out; another of the app's own stays, after)
  const ins = [{ level: "warn", icon: "rain", title: "Heavy rain", text: "x" }, { level: "alert", icon: "frost", title: "Hard frost", text: "y" }, { level: "info", icon: "sun", title: "Sunny", text: "z" }];
  const mixed = WARN.warningsOf({ ...base, official: [W({ id: "a", event: "Yellow rain warning", level: 2, type: 10 })] }, now, f, { insights: ins, real });
  assert.deepEqual(mixed.map((x) => (x.kind === "official" ? x.w.id : x.c.title)), ["a", "Hard frost"]);
  assert.equal(WARN.slotOf(mixed).text, "2 warnings · Yellow rain, Hard frost");
  const mine = WARN.warningsOf({ ...base, official: null }, now, f, { insights: ins.slice(1), real });
  assert.deepEqual(WARN.slotOf(mine), { n: 1, kind: "one", text: "Hard frost", line: "Hard frost", colour: null, level: "alert" });
  // (one over is gone)
  const over = WARN.warningsOf({ ...base, official: [W({ id: "x", event: "Yellow wind warning", level: 2, expires: "2026-11-03T08:00:00Z" })] }, now, f, { insights: [], real });
  assert.equal(over.length, 0);
});

// (stage 2 §4.5: what Now needs of the warnings is static in wxwarn.js; the section and its sheet, warnings.js, are lazy;
// the detail and credits sheets moved out of wxui.js into lazy wxdetail.js, wxui.js keeping what draws the tiles)
test("loading on open: wxwarn.js has the warnings' helpers and warnings.js re-exports the same; the detail and credits sheets are wxdetail.js's, not wxui.js's; Now imports neither lazy file", () => {
  for (const k of ["warningsOf", "nameOf", "slotOf", "emptyOf", "emptyWords", "paras", "listFor"]) {
    assert.equal(typeof WXWARN[k], "function", `wxwarn.js exports ${k}`);
    assert.equal(WARN[k], WXWARN[k], `warnings.js re-exports wxwarn.js's ${k}`);
  }
  for (const k of ["view", "openWarning"]) assert.equal(typeof WARN[k], "function", `warnings.js keeps ${k}`);
  for (const k of ["view", "openWarning"]) assert.ok(!(k in WXWARN), `${k} isn't in static wxwarn.js`);
  for (const k of ["openDetail", "openCredits", "detailBody", "CREDITS", "creditsText", "ABOUT"]) {
    assert.ok(k in DETAIL, `wxdetail.js exports ${k}`);
    assert.ok(!(k in UI), `wxui.js no longer has ${k}`);
  }
  for (const k of ["tileSays", "tilesEl", "h", "chartHost", "hourChart", "nightsOf", "COLOR", "TILES", "skyClass"]) assert.ok(k in UI, `wxui.js keeps ${k}`);
  for (const k of ["openDetail", "openCredits"]) assert.ok(!(k in NOW), `now.js no longer re-exports ${k}`);
  const imports = (f) => [...read(`weather/roof/${f}`).matchAll(/^import[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1]);
  for (const f of ["now.js", "wxui.js", "wxwarn.js", "weather.js"]) {
    const has = imports(f);
    for (const lazy of ["./days.js", "./warnings.js", "./places.js", "./wxsettings.js", "./wxdetail.js"]) assert.ok(!has.includes(lazy), `${f} doesn't import ${lazy} statically`);
  }
  assert.ok(imports("now.js").includes("./wxwarn.js"), "Now's warnings slot from wxwarn.js");
});

test("Warnings' empty states: none in force ([]) or no official feed for the place (null), in the spec's words", () => {
  assert.equal(WARN.emptyOf({ official: [] }), "none");
  assert.equal(WARN.emptyOf({ official: null }), "unavailable");
  assert.equal(WARN.emptyOf({}), "unavailable", "no feed at all: unavailable");
  assert.deepEqual(WARN.emptyWords("none", "London"), { title: "No warnings for London.", body: "You’ll hear about any here, and on Today." });
  assert.deepEqual(WARN.emptyWords("unavailable", "Leeds"), { title: "Official warnings aren’t available for Leeds.", body: "Check your national weather service." });
  assert.deepEqual(WARN.paras("* WHAT...Heavy rain.\n\nSecond\nline"), ["What: Heavy rain.", "Second line"]);
});

test("the credits: every provider, link, licence and the closing note of weather/index.html #credits, word for word", () => {
  const html = read("weather/index.html");
  const i = html.indexOf('id="credits"'), sheet = html.slice(i, html.indexOf("</dialog>", i));
  const plain = (s) => s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  const text = DETAIL.creditsText(), year = String(new Date().getFullYear());
  const items = [...sheet.matchAll(/<li><a href="([^"]+)"[^>]*><span><b>([\s\S]*?)<\/b><small>([\s\S]*?)<\/small><\/span><\/a><\/li>/g)];
  assert.ok(items.length >= 19, `read ${items.length} providers`);
  const mine = DETAIL.CREDITS.groups.flatMap((g) => g.items);
  assert.equal(mine.length, items.length);
  items.forEach(([, href, name, small], k) => {
    const m = mine[k], said = typeof m.small === "function" ? m.small() : m.small;
    assert.equal(m.href, href);
    assert.equal(m.name, plain(name));
    assert.equal(said, plain(small.replace(/<span class="this-year">\d+<\/span>/, year)), plain(name));
  });
  for (const lic of ["CC BY 4.0", "CC BY-SA 4.0", "ODbL", "BSD-3-Clause", "BSD-2-Clause", "Open Government Licence", "public domain"]) assert.ok(text.includes(lic), lic);
  assert.deepEqual(DETAIL.CREDITS.groups.map((g) => g.title), [...sheet.matchAll(/<h3 class="sheet-sub"[^>]*>([^<]+)<\/h3>/g)].map((m) => m[1]));
  const note = plain(/<p class="credits-note">([\s\S]*?)<\/p>/.exec(sheet)[1]);
  assert.equal(DETAIL.CREDITS.note, note);
  assert.ok(note.includes("Forecasts can be wrong"));
  const lead = /<p class="credits-lead">([\s\S]*?)<\/p>/.exec(sheet)[1];
  assert.equal(plain(lead), `${DETAIL.CREDITS.lead.text} (${DETAIL.CREDITS.lead.licence}).`);
  assert.ok(lead.includes(DETAIL.CREDITS.lead.href) && lead.includes(DETAIL.CREDITS.lead.licenceHref));
});

test("Now: the cards in your order, those you've switched off left off, the 16 days and the radar never (they're sections)", () => {
  assert.deepEqual(NOW.nowOrder(null), ["nowcast", "solar", "hourly", "right-now", "insights-card", "windows", "accuracy", "climate"]);
  assert.deepEqual(NOW.nowOrder({ order: ["climate", "daily", "radar", "hourly", "nowcast", "solar", "right-now", "insights-card", "windows", "accuracy"], off: ["windows", "daily"] }),
    ["climate", "hourly", "nowcast", "solar", "right-now", "insights-card", "accuracy"]);
  assert.deepEqual(NOW.nowOrder({ order: ["hourly"], off: [] }).slice(0, 2), ["hourly", "nowcast"], "a card the layout doesn't name yet still shows");
  assert.equal(NOW.agoOf(Date.now() - 20e3), "just now");
  assert.equal(NOW.agoOf(Date.now() - 5 * 60e3), "5 min ago");
  assert.equal(NOW.agoOf(Date.now() - 3 * 3600e3), "3 h ago");
  assert.deepEqual(NOW.splitBrief("Dry until 15:00. Then rain, heaviest at 17:00."), ["Dry until 15:00.", "Then rain, heaviest at 17:00."]);
});

test("weather.css: tokens, not white, outside the hero; each data colour with a light value; the cloud fix", () => {
  const css = read("weather/roof/weather.css").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const [, sel, body] = m;
    if (/\.tcard\.wx/.test(sel)) continue;
    assert.ok(!/#fff\b|#ffffff\b|rgba?\(\s*255\s*,\s*255\s*,\s*255/i.test(body), `white outside the hero: ${sel.trim()}`);
  }
  assert.ok(/\.m-weather, \.wx-sheet\) svg \[fill="#EEF3F9" i\] \{ fill: var\(--cloud-glass\); \}/.test(css));
  for (const k of ["--wx-temp", "--wx-rain", "--wx-wind", "--wx-temp-text", "--wx-rain-text", "--wx-wind-text"]) {
    assert.ok(/@media \(prefers-color-scheme: light\)[\s\S]*?\{[\s\S]*?\{[^}]*/.test(css) && css.split(`${k}:`).length >= 5, `${k} in dark, light and both themes`);
  }
});
