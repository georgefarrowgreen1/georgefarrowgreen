// Weather's 16 Days section (One roof, spec §7.1, WV): "Days by" Temp / Rain / Wind, a row per day with its range bar;
// and the day sheet (weather/detail.js openDay: hourly charts, parts of the day, details, climate, confidence, models).
// Frozen: view(el, ctx) → { draw(), hide(), destroy() } (as now.js says);
//   openDay(ctx, key) → sheet Handle | null: that day's sheet (key "YYYY-MM-DD"; hourly chart, parts of the day, prev/next),
//   fw.sheet.open({ sheet: "day", … }) → dialog.ifl-sheet[data-sheet=day].
// Hooks (frozen, .tools/tests/roofhooks.mjs; inside this section): the "Days by" ui.seg wrapped in (or being)
//   [data-key=daysby], values "temp" | "rain" | "wind"; one row per day (16), its tappable element [data-day=YYYY-MM-DD]
//   (the openDay key) → open.day(key).
import { keyOf, dayStart, HOUR, DAY, nowWall, makeFormat, compass } from "../format.js";
import { codeInfo, iconOf, label } from "../codes.js";
import { weatherIcon } from "../icons.js";
import { timeChart, rangeChart } from "../charts.js";
import * as I from "../insights.js";
import { climateOn, rankIn } from "../climate.js";
import { skyClass, h, setVar, daysScale, rangeBar, rangeEl, chartHost, hourChart, icon } from "./wxui.js";

export const MODES = [["temp", "Temp"], ["rain", "Rain"], ["wind", "Wind"]];
// the days shown: from today, 16 at most
export const daysOf = (wx, now) => (wx?.daily || []).filter((d) => d.date >= dayStart(now)).slice(0, 16);
// what a row says on the right, by mode (app.js daily's says), and its accessible words
export function rowWords(d, mode, f, i) {
  const pop = (d.popMax ?? 0) >= 20 ? `${Math.round(d.popMax / 10) * 10}%` : "";
  const amount = (d.precip ?? 0) >= 0.1 ? f.precip(d.precip) : (d.popMax ?? 0) >= 20 ? "a trace" : "dry";
  if (mode === "rain") return { value: `${Math.round((d.popMax ?? 0) / 10) * 10}%`, small: amount, said: `${Math.round(d.popMax ?? 0)}% chance of rain, ${amount}` };
  if (mode === "wind") return { value: `${f.windNum(d.windMax)} ${f.windUnit}`, small: `gusts ${f.windNum(d.gustMax)}`, said: `wind up to ${f.wind(d.windMax)}, gusts ${f.wind(d.gustMax)}` };
  return { value: f.temp(d.tmax), small: f.temp(d.tmin), pop, said: `high ${f.temp(d.tmax)}, low ${f.temp(d.tmin)}${pop ? `, ${pop} chance of rain` : ""}` };
}

export function view(el, ctx) {
  let mode = "temp", sig = null;
  const seg = ctx.fw.ui.seg(MODES, mode, (v) => { mode = v; sig = null; draw(); }, { label: "Days by" });
  seg.dataset.key = "daysby";
  const head = h("div", { class: "wx-days-head" }, h("h2", { class: "wx-days-title" }, "Days by"), seg);
  const box = h("div", { class: "wx-days" });
  function draw() {
    const S = ctx.S, wx = S.wx;
    if (!head.isConnected) el.replaceChildren(head, box);
    if (!wx) { if (sig !== "none") { sig = "none"; box.replaceChildren(ctx.fw.ui.skeleton("rows", 6)); } return; }
    const f = S.f || makeFormat({}), now = nowWall(wx.place.offset), days = daysOf(wx, now);
    const s = JSON.stringify([wx.place.lat, wx.place.lon, wx.fetchedAt, mode, f.units, keyOf(now)]);
    if (s === sig) return;
    sig = s;
    if (!days.length) { box.replaceChildren(ctx.fw.ui.empty({ title: "No days to show", body: "The forecast hasn’t come yet." })); return; }
    const sc = daysScale(days, mode), conf = I.confidence(wx), curT = (wx.current || I.hourAt(wx, now))?.temp;
    const rows = days.map((d, i) => {
      const w = rowWords(d, mode, f, i), c = conf[d.key], unsure = c?.level === "low" && i > 0 && i < 7;
      const name = i === 0 ? "Today" : f.dayShort(d.date);
      const dot = mode === "temp" && i === 0 && curT != null ? (curT - sc.lo) / sc.span : null;
      const r = ctx.fw.ui.row({
        lead: h("span", { class: "wx-dname" }, h("b", {}, name), h("small", { class: unsure ? "unsure" : null }, unsure ? "Uncertain" : f.date(d.date))),
        title: label(d.code),
        sub: mode === "temp" && w.pop ? `${w.pop} chance of rain` : mode === "temp" ? "" : w.small,
        trail: h("span", { class: "wx-dtail", data: { mode } }, icon(iconOf(d.code, true), 28),
          mode === "temp" ? [h("span", { class: "wx-lo" }, w.small), rangeEl(rangeBar(d, sc), mode, dot), h("span", { class: "wx-hi" }, w.value)]
            : [rangeEl(rangeBar(d, sc), mode), h("span", { class: `wx-val${mode === "rain" ? " rain" : ""}` }, w.value)]),
        run: () => ctx.open.day(d.key),
        label: `${f.day(d.date, now)}: ${label(d.code)}, ${w.said}${unsure ? ", uncertain" : ""}`,
      });
      r.dataset.day = d.key;
      r.classList.add("wx-day");
      if (i === 7) r.classList.add("far");
      return r;
    });
    const list = ctx.fw.ui.list(rows.slice(0, 7));
    const later = rows.length > 7 ? ctx.fw.ui.list(rows.slice(7), { label: "Less certain" }) : null;
    box.replaceChildren(...[list, later].filter(Boolean));
  }
  return { draw, hide() {}, destroy() { sig = null; el.replaceChildren(); } };
}

// a day's name and its date, once: "Tomorrow, 22 October", "Wednesday, 28 October"
const dayTitle = (f, w, now) => { const n = f.day(w, now); return `${/\d/.test(n) ? f.dayName(w) : n}, ${f.dateLong(w)}`; };
const stat = (k, v) => [k, v];

// One day in full (detail.js openDay), with the day before and after a tap away
export function openDay(ctx, key) {
  const wx = ctx.S.wx;
  if (!wx) return null;
  const f = ctx.S.f || makeFormat({}), now = nowWall(wx.place.offset), days = daysOf(wx, now);
  const at = days.findIndex((x) => x.key === key), d = at >= 0 ? days[at] : wx.daily.find((x) => x.key === key);
  if (!d) return null;
  let handle = null;
  const fill = (day) => {
    const i = days.findIndex((x) => x.key === day.key);
    const parts = I.dayParts(wx, day.key), conf = I.confidence(wx)[day.key];
    const hrs = I.hoursBetween(wx, day.date, day.date + DAY);
    const charts = hrs.length > 3 ? [["temp", "Temperature"], ["rain", "Chance of rain"], ["wind", "Wind"]].map(([m, t]) => [m, t, chartHost(m)]) : [];
    const ui = ctx.fw.ui;
    const kids = [
      h("div", { class: "wx-day-top" }, icon(iconOf(day.code, true), 56), h("div", {}, h("div", { class: "wx-dt-main" }, label(day.code)), h("div", { class: "wx-dt-sub" }, `High ${f.temp(day.tmax)} · Low ${f.temp(day.tmin)}`))),
      day.tuned && day.raw && (f.temp(day.tmax) !== f.temp(day.raw.tmax) || f.temp(day.tmin) !== f.temp(day.raw.tmin)) ? h("p", { class: "wx-note" }, `Tuned for here · forecast alone ${f.temp(day.raw.tmax)} / ${f.temp(day.raw.tmin)}`) : null,
      h("p", { class: "wx-day-desc" }, I.describeDay(wx, day.key, f)),
      h("div", { class: "wx-parts" }, ...parts.map((p) => h("div", { class: "part" }, h("span", { class: "p-name" }, p.name[0].toUpperCase() + p.name.slice(1)),
        icon(iconOf(p.code, p.isDay), 34), h("span", { class: "p-temp" }, f.temp(p.name === "overnight" ? p.tmin : p.tmax)), h("span", { class: "p-pop" }, (p.pop ?? 0) >= 20 ? `${Math.round(p.pop)}%` : "")))),
      ...charts.flatMap(([, t, host]) => [h("h3", { class: "wx-sub" }, t), host]),
      h("h3", { class: "wx-sub" }, "Details"),
      ui.stats([
        stat("Rain", `${f.precip(day.precip)}${day.precipHours ? ` over ${Math.round(day.precipHours)} h` : ""}`),
        stat("Chance of rain", day.popMax != null ? `${Math.round(day.popMax)}%` : "–"),
        stat("Wind", `${f.wind(day.windMax)} ${compass(day.dir ?? 0)}`),
        stat("Gusts", f.wind(day.gustMax)),
        stat("Feels like", `${f.temp(day.fmin)} to ${f.temp(day.fmax)}`),
        stat("Peak UV", day.uvMax != null ? String(Math.round(day.uvMax)) : "–"),
        stat("Sunshine", day.sunshine != null ? f.dur(day.sunshine) : "–"),
        stat("Sun", `${f.time(day.sunrise)} – ${f.time(day.sunset)}`),
        ...((day.snow ?? 0) > 0 ? [stat("Snow", f.snow(day.snow))] : []),
      ]),
    ];
    const c = wx.climate && climateOn(wx.climate, day.date);
    if (c?.tmax) {
      const p = rankIn(c.tmax.sorted, day.tmax), an = day.tmax - c.tmax.mean;
      kids.push(h("h3", { class: "wx-sub" }, "For the time of year"), ui.stats([
        stat("Against normal", Math.abs(an) < 1 ? "About normal" : `${f.delta(an)} ${an > 0 ? "warmer" : "colder"}`), stat("Normal high", f.temp(c.tmax.mean)),
        stat("Warmer than", `${Math.round(p)}% of days`), ...(c.recordHigh ? [stat("Record", `${f.temp(c.recordHigh.v)} · ${c.recordHigh.year}`)] : [])]));
    }
    if (conf && day.date >= dayStart(now)) {
      const bar = h("span", { class: "wx-conf-bar" }, setVar(h("i"), "--k", (conf.score / 100).toFixed(3)));
      const why = conf.why.length ? `The models differ on the ${conf.why.join(" and the ")}.` : "";
      kids.push(h("h3", { class: "wx-sub" }, "Forecast confidence"), h("div", { class: "wx-conf" }, bar, h("b", {}, `${conf.level[0].toUpperCase() + conf.level.slice(1)} (${conf.score})`)),
        why ? h("p", { class: "wx-note" }, why) : null);
      const ens = I.likely(day, wx.ensemble?.days?.[day.key]), span = (r) => `${f.temp(r[0])} to ${f.temp(r[1])}`;
      if (ens) kids.push(ui.stats([stat("Likely high", span(ens.hi)), ...(ens.lo ? [stat("Likely low", span(ens.lo))] : [])]));
      const mods = wx.models?.days?.[day.key];
      if (mods?.length) kids.push(h("table", { class: "wx-models" }, h("caption", { class: "vh" }, "What each weather model forecasts"),
        h("tr", {}, h("th", { scope: "col" }, "Model"), h("th", { scope: "col" }, "High"), h("th", { scope: "col" }, "Low"), h("th", { scope: "col" }, "Rain")),
        day.tuned ? h("tr", { class: "tuned-row" }, h("td", {}, "Tuned for here"), h("td", {}, f.temp(day.tmax)), h("td", {}, f.temp(day.tmin)), h("td", {}, "–")) : null,
        ...mods.map((m) => h("tr", {}, h("td", {}, m.name), h("td", {}, f.temp(m.tmax)), h("td", {}, f.temp(m.tmin)), h("td", {}, m.precip != null ? f.precip(m.precip) : "–")))));
    }
    // the day before and after
    const prev = i > 0 ? days[i - 1] : null, next = i >= 0 && i < days.length - 1 ? days[i + 1] : null;
    const go = (x) => () => { fill(x); };
    kids.push(h("div", { class: "wx-day-step" },
      ui.btn(prev ? (i - 1 === 0 ? "Today" : f.dayName(prev.date)) : "Earlier", { small: true, run: prev ? go(prev) : null, label: prev ? `The day before: ${dayTitle(f, prev.date, now)}` : "No day before", act: "prev" }),
      ui.btn(next ? f.dayName(next.date) : "Later", { small: true, run: next ? go(next) : null, label: next ? `The day after: ${dayTitle(f, next.date, now)}` : "No day after", act: "next" })));
    const steps = kids[kids.length - 1].querySelectorAll("[data-act]");
    if (!prev && steps[0]) steps[0].disabled = true;
    if (!next && steps[1]) steps[1].disabled = true;
    const body = h("div", { class: "wx-sheet wx-dayx", data: { day: day.key } }, ...kids.filter(Boolean));
    const title = dayTitle(f, day.date, now);
    if (!handle || !handle.el?.isConnected || !handle.el.open) {
      handle = ctx.fw.sheet.open({ sheet: "day", title, body, app: "weather" });
    } else {
      const b = handle.body || handle.el.querySelector(".ifs-body"), t = handle.el.querySelector("h2");
      if (t) t.textContent = title;
      if (b) { b.replaceChildren(body); b.scrollTop = 0; }
    }
    const draw = () => { for (const [m, , host] of charts) hourChart(host, wx, now, hrs, m, day.key === keyOf(now), f); };
    (typeof requestAnimationFrame === "function" ? requestAnimationFrame : (fn) => setTimeout(fn, 0))(() => { try { draw(); } catch (e) { console.error(e); } });
    return handle;
  };
  return fill(d);
}

export { codeInfo, weatherIcon, timeChart, rangeChart, HOUR, skyClass };
