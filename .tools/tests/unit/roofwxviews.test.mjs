// Weather's views under InFlite's roof (One roof, spec §7.1 WV rows, §9.4 WV): the sky the hero takes (the same as
// Today's card's, for every code by day and night, at dusk and dawn), the 16 Days' range bars by "Days by", the detail
// sheet's words against weather/detail.js and the tiles against weather/app.js, the warnings slot (one card or a banner),
// the Warnings section's two empty states, and the credits against weather/index.html #credits, word for word.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// (what charts.js asks of the browser as it loads)
globalThis.innerWidth ??= 390; globalThis.addEventListener ??= () => {};
const MOD = new URL("../../../weather/roof/", import.meta.url);
const read = (p) => readFileSync(new URL(p, new URL("../../../", import.meta.url)), "utf8");
const UI = await import(new URL("wxui.js", MOD));
const WARN = await import(new URL("warnings.js", MOD));
const DAYS = await import(new URL("days.js", MOD));
const NOW = await import(new URL("now.js", MOD));
const { skyFor } = await import("../../../functions/_todaywx.js");
const { makeFormat, DAY, HOUR } = await import("../../../weather/format.js");

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
    assert.deepEqual(Object.keys(UI.ABOUT), Object.keys(ABOUT));
    for (const k of Object.keys(ABOUT)) assert.equal(UI.ABOUT[k](f, wx), ABOUT[k](f, wx), k);
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
  const text = UI.creditsText(), year = String(new Date().getFullYear());
  const items = [...sheet.matchAll(/<li><a href="([^"]+)"[^>]*><span><b>([\s\S]*?)<\/b><small>([\s\S]*?)<\/small><\/span><\/a><\/li>/g)];
  assert.ok(items.length >= 19, `read ${items.length} providers`);
  const mine = UI.CREDITS.groups.flatMap((g) => g.items);
  assert.equal(mine.length, items.length);
  items.forEach(([, href, name, small], k) => {
    const m = mine[k], said = typeof m.small === "function" ? m.small() : m.small;
    assert.equal(m.href, href);
    assert.equal(m.name, plain(name));
    assert.equal(said, plain(small.replace(/<span class="this-year">\d+<\/span>/, year)), plain(name));
  });
  for (const lic of ["CC BY 4.0", "CC BY-SA 4.0", "ODbL", "BSD-3-Clause", "BSD-2-Clause", "Open Government Licence", "public domain"]) assert.ok(text.includes(lic), lic);
  assert.deepEqual(UI.CREDITS.groups.map((g) => g.title), [...sheet.matchAll(/<h3 class="sheet-sub"[^>]*>([^<]+)<\/h3>/g)].map((m) => m[1]));
  const note = plain(/<p class="credits-note">([\s\S]*?)<\/p>/.exec(sheet)[1]);
  assert.equal(UI.CREDITS.note, note);
  assert.ok(note.includes("Forecasts can be wrong"));
  const lead = /<p class="credits-lead">([\s\S]*?)<\/p>/.exec(sheet)[1];
  assert.equal(plain(lead), `${UI.CREDITS.lead.text} (${UI.CREDITS.lead.licence}).`);
  assert.ok(lead.includes(UI.CREDITS.lead.href) && lead.includes(UI.CREDITS.lead.licenceHref));
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
