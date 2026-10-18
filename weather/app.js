// Weather: the page. data.js fetches, insights.js thinks, this draws.
import { load, searchPlaces, nameOf, store, peek, cell } from "./data.js";
import { makeFormat, nowWall, dayStart, keyOf, hourOf, compassWord, beaufort, HOUR, DAY } from "./format.js";
import * as I from "./insights.js";
import { codeInfo, iconOf, label } from "./codes.js";
import { weatherIcon, moonIcon, glyph } from "./icons.js";
import { timeChart, rangeChart } from "./charts.js";
import { climateOn, rankIn, yearsAgo } from "./climate.js";
import { nextPhases } from "./sky.js";
import { applyTuning, MIN_DAYS, TUNE_DAYS } from "./skill.js";
import { radar } from "./radar.js";

const $ = (id) => document.getElementById(id);
function h(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "svg") n.innerHTML = v;                 // (only ever the app's own icons)
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c instanceof Node ? c : String(c));
  return n;
}
const COLOR = { temp: "#D07A12", rain: "#3B8BE0", wind: "#14A08F" };     // (checked for contrast and colour-blind separation on the cards)
const T = () => (S.f.units.temp === "f" ? (c) => c * 9 / 5 + 32 : (c) => c);
const W = () => S.f.windNum;

/* ---------- state ---------- */
const S = { settings: null, f: null, places: [], cur: 0, base: null, wx: null, radar: null, mode: "temp", allInsights: false, loading: false, stale: false, error: null };
function defaults() {
  const lang = (navigator.languages?.[0] || navigator.language || "en-GB");
  if (/^en-US|^en-LR|^my/i.test(lang)) return { temp: "f", wind: "mph", precip: "in", pressure: "inhg", clock: "12" };
  if (/^en-GB|^en-IE/i.test(lang)) return { temp: "c", wind: "mph", precip: "mm", pressure: "hpa", clock: "24" };
  return { temp: "c", wind: "kmh", precip: "mm", pressure: "hpa", clock: /^en-(AU|NZ|CA|IN|PH)/i.test(lang) ? "12" : "24" };
}
function loadSettings() {
  S.settings = {
    ...defaults(), commute: { on: false, am: "08:00", pm: "17:30" }, tune: true,
    activities: I.DEFAULT_ACTIVITIES.map((a) => ({ ...a })), extras: { laundry: true, stars: true, sunset: true },
    notify: { rain: false, brief: false, briefAt: "07:00", place: null },
    ...(store.get("wx:settings") || {}),
  };
  S.f = makeFormat(S.settings);
}
const saveSettings = () => { store.set("wx:settings", S.settings); S.f = makeFormat(S.settings); };
const place = () => S.places[S.cur] || null;
const savePlaces = () => { store.set("wx:places", S.places); store.set("wx:cur", S.cur); };

/* ---------- start ---------- */
async function start() {
  loadSettings();
  S.places = (store.get("wx:places") || []).filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon));
  S.cur = Math.min(Math.max(0, store.get("wx:cur") || 0), Math.max(0, S.places.length - 1));
  wire();
  // a shared link: ?lat=…&lon=…&name=…
  const q = new URLSearchParams(location.search), lat = parseFloat(q.get("lat")), lon = parseFloat(q.get("lon"));
  if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    addPlace({ name: (q.get("name") || "").slice(0, 60) || `${lat.toFixed(2)}, ${lon.toFixed(2)}`, region: "", lat, lon });
    history.replaceState(null, "", location.pathname);
  }
  if (!S.places.length) {
    // first time: your location if you've already allowed it, else roughly where you are (from your connection), else London
    let granted = false;
    try { granted = (await navigator.permissions?.query({ name: "geolocation" }))?.state === "granted"; } catch (_) {}
    if (granted && await locate(true)) return;
    try {
      const r = await fetch("/api/weather/where", { signal: AbortSignal.timeout(4000) });
      const j = r.ok ? await r.json() : null;
      if (j && Number.isFinite(j.lat)) addPlace({ name: j.name, region: j.region || "", lat: j.lat, lon: j.lon, approx: true });
    } catch (_) {}
    if (!S.places.length) addPlace({ name: "London", region: "England, United Kingdom", lat: 51.5072, lon: -0.1276 });
  }
  go();
  // keep "My Location" current, quietly, if you've allowed it (what was kept shows meanwhile)
  if (place()?.gps) try { if ((await navigator.permissions?.query({ name: "geolocation" }))?.state === "granted") locate(true); } catch (_) {}
  if ("serviceWorker" in navigator) {
    // a new version: its worker arrives with every file fresh, so if this page has only just opened, start again on it
    const had = !!navigator.serviceWorker.controller, opened = Date.now();
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (had && Date.now() - opened < 20e3) location.reload(); });
    navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).catch(() => {});
  }
}
function addPlace(p, makeCurrent = true) {
  const near = (a) => Math.abs(a.lat - p.lat) < 0.02 && Math.abs(a.lon - p.lon) < 0.02;
  let i = p.gps ? S.places.findIndex((x) => x.gps) : S.places.findIndex((x) => !x.gps && near(x));
  if (i >= 0) S.places[i] = { ...S.places[i], ...p };
  else { S.places.push(p); i = S.places.length - 1; }
  if (makeCurrent) S.cur = i;
  savePlaces();
  return i;
}

/* ---------- loading ---------- */
let seq = 0, timer = null;
async function go(force = false) {
  const p = place(); if (!p) return;
  const my = ++seq;
  S.loading = true; S.error = null;
  $("main").setAttribute("aria-busy", "true");
  $("refresh-btn").disabled = true;
  showPlace();
  if (!S.wx || cell(S.wx.place.lat, S.wx.place.lon) !== cell(p.lat, p.lon)) { S.wx = S.base = null; S.allInsights = false; render(); }
  if (!S.radar) S.radar = radar($("radar"), { lat: p.lat, lon: p.lon, time: (t) => S.f.time(t + (S.wx?.place.offset ?? 0) * 1000), miles: S.f.units.wind === "mph" });
  else S.radar.place(p.lat, p.lon);
  try {
    await load(p, (wx, how) => {
      if (my !== seq || !wx) return;
      S.base = wx; S.wx = tuned(wx); S.stale = !!how.stale;
      if (how.error) S.error = how.error;
      if (!how.stale && !how.partial) snapshotNow(wx);
      render();
    }, { force });
  } catch (e) {
    if (my === seq) { S.error = e; render(); }
  } finally {
    if (my === seq) { S.loading = false; $("main").setAttribute("aria-busy", "false"); $("refresh-btn").disabled = false; status(); }
  }
  clearTimeout(timer);
  timer = setTimeout(() => { if (document.visibilityState === "visible") go(); }, 10 * 60e3);
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && S.wx && Date.now() - S.wx.fetchedAt > 10 * 60e3) go();
});

// the forecast with its highs and lows tuned to how each model has done here (weather/skill.js), unless that's turned off
const tuned = (wx) => (wx && S.settings.tune !== false && wx.skill?.skill ? applyTuning(wx, wx.skill.skill, keyOf(nowWall(wx.place.offset))) : wx);

// "since you last looked": a few snapshots of the days ahead, per place
function snapshotNow(wx) {
  const k = `wx:snap:${cell(wx.place.lat, wx.place.lon)}`, now = nowWall(wx.place.offset), list = store.get(k) || [];
  if (!list.length || now - list[list.length - 1].at >= HOUR) { list.push(I.snapshot(wx, now)); store.set(k, list.slice(-6)); }
}
function baseline(wx, now) {
  const list = store.get(`wx:snap:${cell(wx.place.lat, wx.place.lon)}`) || [];
  return list.filter((s) => s.at <= now - 2 * HOUR && s.at >= now - 3 * DAY).pop() || null;
}

/* ---------- drawing ---------- */
function showPlace() {
  const p = place();
  $("place-name").textContent = p ? p.name : "Weather";
  $("sr-place").textContent = p ? p.name : "your place";
  $("place-sub").textContent = p ? (p.gps && p.name !== "My Location" ? "My Location" : p.approx ? "Roughly where you are" : p.region || "") : "";
  document.title = p ? `${p.name} · Weather` : "Weather";
}
function render() {
  showPlace();
  if (S.base) S.wx = tuned(S.base);
  const wx = S.wx;
  // nothing to show yet: placeholders while it loads, or the hero's message and a way to try again
  if (wx) delete $("main").dataset.empty; else $("main").dataset.empty = S.error ? "error" : "loading";
  $("retry-btn").hidden = !!wx || !S.error;
  if (!wx) {
    $("now-temp").textContent = "–"; $("now-icon").replaceChildren();
    $("now-cond").textContent = S.error ? "Couldn't get the forecast" : "Loading the forecast…";
    $("now-hl").textContent = S.error ? "You may be offline, or the forecast service didn't answer." : "";
    $("brief").textContent = "";
    for (const id of ["alerts", "insights", "hourly-strip", "hourly-chart", "days", "win-grid", "tiles"]) $(id).replaceChildren();
    $("nowcast").hidden = true;
    status(); return;
  }
  const now = nowWall(wx.place.offset);
  sky(wx, now);
  hero(wx, now);
  nowcast(wx, now);
  cards(wx, now);
  hourly(wx, now);
  daily(wx, now);
  windows(wx, now);
  accuracy(wx);
  climate(wx, now);
  tiles(wx, now);
  status();
}
function status() {
  const wx = S.wx, el = $("status");
  el.classList.remove("warn");
  if (!wx) { el.textContent = ""; $("updated").textContent = ""; return; }
  const mins = Math.round((Date.now() - wx.fetchedAt) / 60e3);
  const ago = mins < 1 ? "just now" : mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.floor(mins / 60)} h ago` : `${Math.floor(mins / 1440)} days ago`;
  if ((S.error || S.stale) && !S.loading && mins > 15) { el.textContent = `Couldn't refresh: showing the forecast from ${ago}.`; el.classList.add("warn"); }
  else el.textContent = S.loading ? "Updating…" : "";
  $("updated").textContent = `Updated ${ago}`;
}

function sky(wx, now) {
  const c = wx.current || I.hourAt(wx, now) || {}, kind = codeInfo(c.code).kind, day = !!c.isDay, d = I.dayOf(wx, now);
  let s;
  if (kind === "storm") s = "storm";
  else if (["rain", "showers", "drizzle", "sleet"].includes(kind)) s = day ? "rain-day" : "rain-night";
  else if (kind === "snow") s = day ? "snow-day" : "snow-night";
  else if (kind === "fog") s = "fog";
  else if (d && kind !== "cloudy" && d.sunrise && Math.abs(now - d.sunrise) < 40 * 60e3) s = "dawn";
  else if (d && kind !== "cloudy" && d.sunset && Math.abs(now - d.sunset) < 40 * 60e3) s = "dusk";
  else if (kind === "clear") s = day ? "clear-day" : "clear-night";
  else if (kind === "partly") s = day ? "partly-day" : "partly-night";
  else s = day ? "cloudy-day" : "cloudy-night";
  document.body.dataset.sky = s;
  const top = { "clear-day": "#1f5fae", "partly-day": "#2c5f99", "cloudy-day": "#43566c", "rain-day": "#303f52", storm: "#1c2130", "snow-day": "#4f6580", fog: "#59626e", "clear-night": "#070d22", "partly-night": "#0c1428", "cloudy-night": "#151b27", "rain-night": "#10151f", "snow-night": "#1b2335", dusk: "#1f2b55", dawn: "#24376a" }[s];
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", top);
  document.documentElement.style.backgroundColor = top;      // (what shows when the page is pulled past its ends)
}

function hero(wx, now) {
  const f = S.f, c = wx.current || I.hourAt(wx, now), d = I.dayOf(wx, now);
  $("now-temp").textContent = f.temp(c.temp);
  $("now-icon").innerHTML = weatherIcon(iconOf(c.code, c.isDay), 76);
  $("now-cond").textContent = label(c.code, c.isDay);
  $("now-hl").textContent = d ? `H ${f.temp(d.tmax)}  L ${f.temp(d.tmin)}  ·  Feels like ${f.temp(c.feels)}` : `Feels like ${f.temp(c.feels)}`;
  $("brief").textContent = I.headline(wx, now, f);
}

function nowcast(wx, now) {
  const f = S.f, nc = I.nowcast(wx, now, f), box = $("nowcast");
  // the radar says it in a line too
  const quarters = (wx.minutely || []).filter((x) => x.t + 15 * 60e3 > now).length;
  S.radar?.note(nc ? nc.text : quarters >= 4 ? `No rain expected here for the next ${Math.round(quarters / 4)} hours.` : "");
  // (the radar's line only where the card above isn't saying it already: when it's hidden, or the radar's full screen)
  const shown = !(!nc || (!nc.now && nc.startsAt - now > 2 * HOUR));
  $("radar").classList.toggle("said-above", shown);
  if (!shown) { box.hidden = true; return; }
  box.hidden = false;
  $("nowcast-text").textContent = nc.text;
  const m = wx.minutely.filter((x) => x.t + 15 * 60e3 > now);
  const toRate = (mm) => (f.units.precip === "in" ? (mm * 4) / 25.4 : mm * 4);
  const peak = Math.max(...m.map((x) => toRate(x.precip)));
  $("nowcast-note").textContent = `Rain every 15 minutes, in ${f.units.precip === "in" ? "inches" : "mm"} an hour (light under ${f.units.precip === "in" ? "0.02" : "0.5"}, heavy over ${f.units.precip === "in" ? "0.16" : "4"}).`;
  timeChart($("nowcast-chart"), {
    kind: "columns", height: 120, color: COLOR.rain,
    points: m.map((x) => ({ t: x.t, v: toRate(x.precip), mm: x.precip })),
    y: { min: 0, max: Math.max(f.units.precip === "in" ? 0.1 : 2, peak), fmt: (v) => (f.units.precip === "in" ? v.toFixed(2) : String(Math.round(v * 10) / 10)) },
    x: { step: 15 * 60e3, hour: (t) => f.time(t) },
    now, summary: `Rain, every 15 minutes for the next 4 hours, in ${f.units.precip === "in" ? "inches" : "millimetres"} an hour. ${nc.text}`,
    tip: (p) => ({ title: f.time(p.t), rows: [[f.rate(p.mm * 4), p.mm >= 0.05 ? (p.mm * 4 >= 4 ? "heavy" : p.mm * 4 >= 0.6 ? "moderate" : "light") : "dry"]] }),
    table: { head: ["Time", "Rain"], rows: m.map((x) => [f.time(x.t), f.rate(x.precip * 4)]) },
  });
}

function insightCard(c) {
  const tag = c.level === "alert" ? "Alert" : c.level === "warn" ? "Warning" : null;
  return h("article", { class: "ins", "data-level": c.level },
    h("div", { class: "ins-icon", svg: glyph(c.icon, 18) }),
    h("h3", {}, tag ? [h("span", { class: "tag" }, tag), " "] : null, c.title),
    h("p", {}, c.text));
}
function cards(wx, now) {
  const all = I.insights(wx, now, S.f, { prev: baseline(wx, now), commute: S.settings.commute });
  const warn = all.filter((c) => c.level === "alert" || c.level === "warn"), rest = all.filter((c) => !warn.includes(c));
  $("alerts").replaceChildren(...warn.map(insightCard));
  const shown = S.allInsights ? rest : rest.slice(0, 6);
  const box = $("insights");
  box.replaceChildren(...shown.map(insightCard));
  if (rest.length > shown.length) box.append(h("button", { class: "more-btn", type: "button", onclick: () => { S.allInsights = true; cards(S.wx, nowWall(S.wx.place.offset)); } }, `Show ${rest.length - shown.length} more`));
}

function hourly(wx, now) {
  const f = S.f, hrs = I.hoursFrom(wx, now, 48), strip = $("hourly-strip");
  const items = [];
  hrs.forEach((x, i) => {
    const isNow = i === 0, c = isNow && wx.current ? wx.current : x;
    items.push(h("div", { class: `hour${isNow ? " now" : ""}`, role: "listitem", "aria-label": `${isNow ? "Now" : f.time(x.t)}: ${f.temp(c.temp)}, ${label(c.code, c.isDay)}${(x.pop ?? 0) >= 20 ? `, ${Math.round(x.pop)}% chance of rain` : ""}` },
      h("span", { class: "h-time" }, isNow ? "Now" : f.hour(x.t)),
      h("span", { class: "h-icon", svg: weatherIcon(iconOf(c.code, c.isDay), 30) }),
      h("span", { class: "h-pop" }, (x.pop ?? 0) >= 20 ? `${Math.round(x.pop / 10) * 10}%` : ""),
      h("span", { class: "h-temp" }, f.temp(c.temp))));
    // sunrise and sunset, in their place
    for (const d of wx.daily) for (const [what, t] of [["Sunrise", d.sunrise], ["Sunset", d.sunset]]) {
      if (t && t > Math.max(now, x.t) && t < x.t + HOUR && i < hrs.length - 1) {
        items.push(h("div", { class: "hour sunev", role: "listitem", "aria-label": `${what} at ${f.time(t)}` },
          h("span", { class: "h-time" }, f.time(t)), h("span", { class: "h-icon", svg: glyph(what === "Sunrise" ? "sunrise" : "sunset", 26) }), h("span", { class: "h-pop" }), h("span", { class: "h-temp" }, what)));
      }
    }
  });
  strip.setAttribute("role", "list");
  strip.replaceChildren(...items);
  drawHourChart(wx, now, hrs, $("hourly-chart"), $("hourly-note"), S.mode, true);
}

// the chart for some hours (the next 48 on the page, or one day's in its sheet)
function drawHourChart(wx, now, hrs, host, note, mode, showNow) {
  const f = S.f, t = T(), wn = W();
  const nights = [];
  let run = null;
  for (const x of hrs) { if (!x.isDay) { if (!run) run = [x.t, x.t + HOUR]; else run[1] = x.t + HOUR; } else if (run) { nights.push(run); run = null; } }
  if (run) nights.push(run);
  const ens = new Map((wx.ensemble?.hourly || []).map((e) => [e.t, e]));
  const common = { x: { hour: (v) => f.hour(v), day: (v) => f.dayShort(v) }, nights, now: showNow ? now : null, height: 170 };
  const when = (v) => `${f.day(v, now)} ${f.time(v)}`;
  if (mode === "temp") {
    // the ensemble's spread, around the forecast shown (its own middle can sit a little apart, on its coarser grid)
    const pts = hrs.map((x) => { const e = ens.get(x.t); return { t: x.t, v: t(x.temp), lo: e ? t(x.temp + e.p10 - e.p50) : null, hi: e ? t(x.temp + e.p90 - e.p50) : null, x }; });
    const hi = pts.reduce((a, p) => (p.v > a.v ? p : a)), lo = pts.reduce((a, p) => (p.v < a.v ? p : a));
    timeChart(host, { ...common, kind: "line", color: COLOR.temp, points: pts,
      y: { fmt: (v) => `${Math.round(v)}°` },
      marks: [{ t: hi.t, v: hi.v, text: f.temp(hi.x.temp) }, ...(hi.t !== lo.t ? [{ t: lo.t, v: lo.v, text: f.temp(lo.x.temp) }] : [])],
      summary: `Temperature, hour by hour: from ${f.temp(lo.x.temp)} to ${f.temp(hi.x.temp)}.`,
      tip: (p) => ({ title: when(p.t), rows: [[f.temp(p.x.temp), label(p.x.code, p.x.isDay)], [f.temp(p.x.feels), "feels like"], ...(p.lo != null ? [[`${Math.round(p.lo)}–${Math.round(p.hi)}°`, "could be"]] : [])] }),
      table: { head: ["Time", "Temperature", "Feels like"], rows: pts.map((p) => [when(p.t), f.temp(p.x.temp), f.temp(p.x.feels)]) } });
    if (note) note.textContent = ens.size ? "Shaded: how far it could go either way (the spread of ECMWF's 51-run ensemble, 10th to 90th percentile)." : "";
  } else if (mode === "rain") {
    const pts = hrs.map((x) => ({ t: x.t, v: x.pop ?? (x.precip >= 0.1 ? 100 : 0), x }));
    const marks = I.spells(hrs).slice(0, 3).map((s) => { const top = s.hours.reduce((a, b) => (b.precip > a.precip ? b : a)); return top.precip >= 0.3 ? { t: top.t, v: Math.min(100, top.pop ?? 100), text: f.precip(top.precip) } : null; }).filter(Boolean);
    timeChart(host, { ...common, kind: "columns", color: COLOR.rain, points: pts, marks,
      y: { min: 0, max: 100, ticks: [0, 50, 100], fmt: (v) => `${v}%` },
      summary: `Chance of rain, hour by hour. ${marks.length ? `Wettest hours: ${marks.map((m) => `${f.time(m.t)} (${m.text})`).join(", ")}.` : "Little or no rain expected."}`,
      tip: (p) => ({ title: when(p.t), rows: [[`${Math.round(p.v)}%`, "chance of rain"], [f.precip(p.x.precip), (p.x.snow ?? 0) > 0 ? "expected (snow)" : "expected"]] }),
      table: { head: ["Time", "Chance", "Amount"], rows: pts.map((p) => [when(p.t), `${Math.round(p.v)}%`, f.precip(p.x.precip)]) } });
    if (note) note.textContent = "Columns: the chance of rain each hour. Labels: the amount in the wettest hour of each spell.";
  } else {
    const pts = hrs.map((x) => ({ t: x.t, v: wn(x.wind), lo: wn(x.wind), hi: wn(Math.max(x.gust ?? x.wind, x.wind)), x }));
    const top = hrs.reduce((a, b) => ((b.gust ?? 0) > (a.gust ?? 0) ? b : a));
    timeChart(host, { ...common, kind: "line", color: COLOR.wind, points: pts,
      y: { min: 0, fmt: (v) => String(Math.round(v)) },
      marks: [{ t: top.t, v: wn(top.gust ?? top.wind), text: `gusts ${f.wind(top.gust)}` }],
      summary: `Wind in ${f.windUnit}, hour by hour, with gusts up to ${f.wind(top.gust)}.`,
      tip: (p) => ({ title: when(p.t), rows: [[f.wind(p.x.wind), `from the ${compassWord(p.x.dir ?? 0)}`], [f.wind(p.x.gust), "gusts"]] }),
      table: { head: ["Time", "Wind", "Gusts", "From"], rows: pts.map((p) => [when(p.t), f.wind(p.x.wind), f.wind(p.x.gust), compassWord(p.x.dir ?? 0)]) } });
    if (note) note.textContent = `Line: the average wind (${f.windUnit}). Shaded up to the gusts.`;
  }
}

function daily(wx, now) {
  const f = S.f, days = wx.daily.filter((d) => d.date >= dayStart(now)).slice(0, 16);
  if (!days.length) return;
  $("daily-n").textContent = `${days.length}-day`;
  $("daily-note").textContent = days.some((d) => d.tuned) ? `Highs and lows from tomorrow are tuned to how each model has done at ${wx.tunedBy && wx.skill?.station ? wx.skill.station.name : "the nearest weather station"} (see Forecast accuracy).` : "";
  const conf = I.confidence(wx);
  const lo = Math.min(...days.map((d) => d.tmin)), hi = Math.max(...days.map((d) => d.tmax)), span = Math.max(1, hi - lo);
  const curT = wx.current?.temp;
  $("days").replaceChildren(...days.map((d, i) => {
    const left = (d.tmin - lo) / span, width = Math.max(0.03, (d.tmax - d.tmin) / span);
    const fill = h("i", { class: "d-fill" });
    fill.style.left = `${left * 100}%`; fill.style.width = `${width * 100}%`;
    fill.style.backgroundSize = `${(1 / width) * 100}% 100%`;
    fill.style.backgroundPosition = `${width >= 0.999 ? 0 : (left / (1 - width)) * 100}% 0`;
    const bar = h("span", { class: "d-bar" }, fill);
    if (i === 0 && curT != null) { const dot = h("i", { class: "d-now" }); dot.style.left = `${Math.min(1, Math.max(0, (curT - lo) / span)) * 100}%`; bar.append(dot); }
    const c = conf[d.key], unsure = c?.level === "low" && i > 0 && i < 7;
    const pop = (d.popMax ?? 0) >= 20 ? `${Math.round(d.popMax / 10) * 10}%` : "";
    const name = i === 0 ? "Today" : f.dayShort(d.date);
    return h("li", { class: i === 7 ? "far" : null }, i === 7 ? h("span", { class: "far-note" }, "Further ahead: less certain, best for the general trend") : null, h("button", { class: "day-row", type: "button", onclick: () => openDay(d.key), "aria-label": `${f.day(d.date, now)}: ${label(d.code)}, high ${f.temp(d.tmax)}, low ${f.temp(d.tmin)}${pop ? `, ${pop} chance of rain` : ""}${unsure ? ", uncertain" : ""}` },
      h("span", { class: "d-name" }, name, h("small", { class: unsure ? "unsure" : "" }, unsure ? "Uncertain" : f.date(d.date))),
      h("span", { class: "d-icon" }, h("span", { svg: weatherIcon(iconOf(d.code, true), 30) }), h("span", { class: "d-pop" }, pop)),
      h("span", { class: "d-lo" }, f.temp(d.tmin)), bar, h("span", { class: "d-hi" }, f.temp(d.tmax))));
  }));
}

function windows(wx, now) {
  const f = S.f, list = I.windows(wx, now, f, { activities: S.settings.activities, extras: S.settings.extras });
  $("win-grid").replaceChildren(...list.map((w) => {
    const when = w.start == null ? [h("span", {}, "Not today or tomorrow")] : [h("span", { class: "ww-day" }, f.day(w.start, now)), " ", h("span", { class: "ww-time" }, `${f.time(w.start)}${w.end ? `–${f.time(w.end)}` : ""}`)];
    return h("div", { class: "win" },
      h("div", { class: "win-top" }, h("span", { class: "win-name" }, h("span", { svg: glyph(w.icon, 16) }), w.name), h("span", { class: "win-rate", "data-r": w.rating }, w.rating)),
      h("div", { class: "win-when" }, ...when), h("div", { class: "win-text" }, w.text));
  }));
}

function climate(wx, now) {
  const f = S.f, t = T(), box = $("climate-body");
  if (!wx.climate) {
    const failed = store.get(`clim:${cell(wx.place.lat, wx.place.lon)}`)?.failedAt;
    box.replaceChildren(h("p", { class: "muted" }, failed ? "The climate archive is busy right now; this will fill in later." : "Gathering thirty years of this place's weather…"));
    return;
  }
  const d = I.dayOf(wx, now), c = d && climateOn(wx.climate, d.date);
  if (!c?.tmax) { box.replaceChildren(h("p", { class: "muted" }, "No climate record for this spot.")); return; }
  const p = rankIn(c.tmax.sorted, d.tmax), yrs = `${wx.climate.years[0]}–${wx.climate.years[1]}`;
  const lede = h("p", { class: "small" }, `Today's high of ${f.temp(d.tmax)} is warmer than ${Math.round(p)}% of days around ${f.dateLong(d.date)} (${yrs}).`);
  const chart = h("div", { class: "range" });
  const ago = yearsAgo(wx.climate, d.date);
  const facts = h("ul", { class: "facts" },
    h("li", {}, h("b", {}, f.temp(c.tmax.mean)), "Normal high"),
    h("li", {}, h("b", {}, f.temp(c.tmin.mean)), "Normal low"),
    c.recordHigh ? h("li", {}, h("b", {}, `${f.temp(c.recordHigh.v)} (${c.recordHigh.year})`), `Warmest ${f.dateLong(d.date)}`) : null,
    c.recordLow ? h("li", {}, h("b", {}, `${f.temp(c.recordLow.v)} (${c.recordLow.year})`), `Coldest ${f.dateLong(d.date)} night`) : null,
    c.wet != null ? h("li", {}, h("b", {}, `${Math.round(c.wet * 100)}%`), "of days get 1 mm+ of rain") : null,
    ago ? h("li", {}, h("b", {}, `${f.temp(ago.tmax)}, ${ago.rain >= 0.5 ? f.precip(ago.rain) : "dry"}`), "This day last year") : null);
  box.replaceChildren(lede, chart, facts);
  rangeChart(chart, { p10: t(c.tmax.p10), p25: t(c.tmax.p25), p75: t(c.tmax.p75), p90: t(c.tmax.p90), mean: t(c.tmax.mean), value: t(d.tmax), valueLabel: `Today ${f.temp(d.tmax)}`, record: c.recordHigh ? { v: t(c.recordHigh.v), year: c.recordHigh.year } : null,
    fmt: (v) => `${Math.round(v)}°`, summary: `Today's high ${f.temp(d.tmax)} against the normal range for the date: ${f.temp(c.tmax.p10)} to ${f.temp(c.tmax.p90)}, normal ${f.temp(c.tmax.mean)}.` });
}

function tile(title, icon, ...kids) { return h("section", { class: "tile" }, h("h3", {}, h("span", { svg: glyph(icon, 14) }), title), ...kids); }
function tiles(wx, now) {
  const f = S.f, c = wx.current || I.hourAt(wx, now), out = [], d = I.dayOf(wx, now);
  // feels like
  const diff = (c.feels ?? c.temp) - c.temp;
  out.push(tile("Feels like", "heat", h("div", { class: "big" }, f.temp(c.feels)),
    h("p", { class: "sub" }, diff <= -2 ? ((c.wind ?? 0) >= 12 ? `The wind makes it feel ${f.delta(diff)} colder.` : `Feels ${f.delta(diff)} colder.`) : diff >= 2 ? `Humidity makes it feel ${f.delta(diff)} warmer.` : "Close to the actual temperature.")));
  // wind
  const bf = beaufort(c.wind ?? 0), dir = c.dir ?? 0;
  const comp = `<svg class="compass" viewBox="0 0 80 80" aria-hidden="true"><circle class="ring" cx="40" cy="40" r="33"/>${[0, 90, 180, 270].map((a) => `<line class="tick" x1="40" y1="6" x2="40" y2="11" transform="rotate(${a} 40 40)"/>`).join("")}<text x="40" y="20" text-anchor="middle">N</text><text x="62" y="43" text-anchor="middle">E</text><text x="40" y="66" text-anchor="middle">S</text><text x="18" y="43" text-anchor="middle">W</text><path class="needle" transform="rotate(${(dir + 180) % 360} 40 40)" d="M40 14l6 30h-12z"/><circle cx="40" cy="40" r="3" fill="#fff"/></svg>`;
  out.push(tile("Wind", "wind", h("div", { class: "wind-row" }, h("div", {}, h("div", { class: "big" }, String(f.windNum(c.wind)), h("small", {}, f.windUnit)), h("p", {}, `Gusts ${f.wind(c.gust)}`)), h("div", { svg: comp })),
    h("p", { class: "sub" }, `${bf.name}, from the ${compassWord(dir)}.`)));
  // humidity
  const dew = c.dew;
  const comfort = dew == null ? "" : dew < 10 ? "Dry and fresh" : dew < 15 ? "Comfortable" : dew < 18 ? "A little humid" : dew < 21 ? "Humid" : "Very humid and oppressive";
  out.push(tile("Humidity", "drop", h("div", { class: "big" }, `${Math.round(c.rh ?? 0)}%`), h("p", { class: "sub" }, `Dew point ${f.temp(dew)}. ${comfort}.`)));
  // rain: the last day and the next
  const past = I.hoursBetween(wx, now - DAY, now).reduce((a, x) => a + (x.precip || 0), 0), next = I.hoursBetween(wx, now, now + DAY).reduce((a, x) => a + (x.precip || 0), 0);
  out.push(tile("Rain", "rain", h("div", { class: "big" }, f.precip(next)), h("p", {}, "expected in the next 24 hours"), h("p", { class: "sub" }, `${f.precip(past)} in the last 24 hours.`)));
  // pressure
  const p3 = I.hourAt(wx, now - 3 * HOUR)?.pressure, dp = c.pressure != null && p3 != null ? c.pressure - p3 : null;
  out.push(tile("Pressure", "gauge", h("div", { class: "big" }, f.pressure(c.pressure).replace(/ (\S+)$/, ""), h("small", {}, f.pressure(c.pressure).split(" ").pop())),
    h("p", { class: "sub" }, dp == null ? "" : Math.abs(dp) < 1 ? "Steady over the last 3 hours." : `${dp < 0 ? "Falling" : "Rising"} ${f.pressureDelta(dp)} in 3 hours${dp <= -3 ? ": unsettled weather on the way" : dp >= 3 ? ": settling down" : ""}.`)));
  // visibility
  const vis = c.vis;
  out.push(tile("Visibility", "eye", h("div", { class: "big" }, f.dist(vis)), h("p", { class: "sub" }, vis == null ? "" : vis >= 20000 ? "Excellent: a clear view." : vis >= 10000 ? "Good." : vis >= 4000 ? "Moderate: a little haze." : vis >= 1000 ? "Poor: mist or haze." : "Fog.")));
  // UV
  const todayH = I.hoursBetween(wx, dayStart(now), dayStart(now) + DAY), uvPeak = todayH.reduce((a, x) => ((x.uv ?? 0) > (a?.uv ?? -1) ? x : a), null);
  const uv = c.uv ?? 0, uvName = (u) => (u < 3 ? "Low" : u < 6 ? "Moderate" : u < 8 ? "High" : u < 11 ? "Very high" : "Extreme");
  const meter = (v, max) => { const m = h("div", { class: "meter" }), i = h("i"); i.style.left = `${Math.min(100, (v / max) * 100)}%`; m.append(i); return m; };
  out.push(tile("UV index", "uv", h("div", { class: "big" }, String(Math.round(uv)), h("small", {}, uvName(uv))), meter(uv, 11),
    h("p", { class: "sub" }, uvPeak && uvPeak.uv >= 1 ? `Peaks at ${Math.round(uvPeak.uv)} (${uvName(uvPeak.uv).toLowerCase()}) around ${f.time(uvPeak.t)}.` : "Low all day.")));
  // air quality and pollen
  if (wx.air?.current?.eaqi != null) {
    const a = wx.air.current, q = a.eaqi, name = q <= 20 ? "Good" : q <= 40 ? "Fair" : q <= 60 ? "Moderate" : q <= 80 ? "Poor" : q <= 100 ? "Very poor" : "Extremely poor";
    const pol = (wx.air.hourly || []).filter((x) => x.t >= now - HOUR && x.t < now + 12 * HOUR);
    const top = ["grass", "birch", "alder", "olive", "ragweed", "mugwort"].map((k) => [k, Math.max(0, ...pol.map((x) => x[k] ?? 0))]).sort((x, y) => y[1] - x[1])[0];
    out.push(tile("Air quality", "air", h("div", { class: "big" }, String(Math.round(q)), h("small", {}, name)), meter(q, 100),
      h("p", { class: "sub" }, `Fine particles ${a.pm25 != null ? Math.round(a.pm25) : "–"} µg/m³.${top && top[1] >= 10 ? ` ${top[0][0].toUpperCase() + top[0].slice(1)} pollen ${top[1] >= 80 ? "high" : top[1] >= 30 ? "moderate" : "low"}.` : pol.some((x) => x.grass != null) ? " Pollen low." : ""}`)));
  }
  // the sun
  if (d) {
    const sk = I.skyFor(wx, d.key), y = wx.daily[wx.daily.indexOf(d) - 1];
    const rise = d.sunrise, set = d.sunset, frac = rise && set ? Math.min(1, Math.max(0, (now - rise) / (set - rise))) : 0;
    const arc = (k) => { const a = Math.PI * (1 - k); return [100 + 80 * Math.cos(a), 70 - 56 * Math.sin(a)]; };
    const [sx, sy] = arc(frac), up = now > rise && now < set;
    let done = ""; for (let k = 0; k <= frac + 1e-9; k += 0.02) { const [x, yy] = arc(Math.min(k, frac)); done += `${done ? "L" : "M"}${x.toFixed(1)} ${yy.toFixed(1)}`; }
    // at night, the sun goes on under the horizon, from where it set to where it'll rise
    const next = wx.daily[wx.daily.indexOf(d) + 1], setBefore = y?.sunset ?? (rise ? rise - 12 * HOUR : null);
    const [n0, n1] = now >= set ? [set, next?.sunrise] : [setBefore, rise];
    const night = !up && n0 && n1 ? Math.min(1, Math.max(0, (now - n0) / (n1 - n0))) : null;
    const below = night != null ? [100 + 80 * Math.cos(Math.PI * night), 70 + 11 * Math.sin(Math.PI * night)] : null;
    const svg = `<svg class="sunarc" viewBox="0 0 200 84" aria-hidden="true"><line class="hz" x1="6" y1="70" x2="194" y2="70"/><path class="arc" d="M20 70A80 56 0 0 1 180 70"/>${
      up ? `<path class="done" d="${done}"/><circle class="sun" cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="6"/>`
        : below ? `<path class="under" d="M180 70A80 11 0 0 1 20 70"/><circle class="sun down" cx="${below[0].toFixed(1)}" cy="${below[1].toFixed(1)}" r="5"/>` : ""}</svg>`;
    const until = (t) => f.dur(Math.max(300, Math.round((t - now) / 300e3) * 300));
    const sunNext = up ? `Sunset in ${until(set)}` : night != null ? `Sunrise in ${until(n1)}` : null;
    const change = y?.daylight && d.daylight ? d.daylight - y.daylight : null;
    out.push(h("section", { class: "tile wide" }, h("h3", {}, h("span", { svg: glyph("sunrise", 14) }), "Sun"), h("div", { svg }),
      sunNext ? h("p", { class: "sun-next" }, sunNext) : null,
      h("dl", { class: "kv" },
        h("dt", {}, "Sunrise"), h("dd", {}, f.time(rise)), h("dt", {}, "Sunset"), h("dd", {}, f.time(set)),
        sk?.goldenPm?.[0] ? [h("dt", {}, "Golden hour"), h("dd", {}, `${f.time(sk.goldenPm[0])}–${f.time(set)}`)] : null,
        sk?.dusk ? [h("dt", {}, "Dark by"), h("dd", {}, f.time(sk.dusk))] : null,
        h("dt", {}, "Daylight"), h("dd", {}, `${f.dur(d.daylight)}${change != null ? ` (${change < 0 ? "−" : "+"}${Math.abs(Math.round(change / 60))} min)` : ""}`))));
    // the moon
    if (sk) {
      const ph = sk.phase, nx = nextPhases(now - (sk.offset || 0) * 1000), toWall = (x) => x + (sk.offset || 0) * 1000;
      out.push(h("section", { class: "tile wide" }, h("h3", {}, h("span", { svg: glyph("moon", 14) }), "Moon"),
        h("div", { class: "moon-row" }, h("span", { svg: moonIcon(ph.lit, ph.waxing, 48, wx.place.lat < 0) }), h("div", {}, h("div", { class: "big" }, `${Math.round(ph.lit * 100)}%`), h("p", {}, ph.name))),
        h("dl", { class: "kv" },
          h("dt", {}, "Moonrise"), h("dd", {}, sk.moonrise ? f.time(sk.moonrise) : "–"), h("dt", {}, "Moonset"), h("dd", {}, sk.moonset ? f.time(sk.moonset) : "–"),
          nx.full ? [h("dt", {}, "Full Moon"), h("dd", {}, `${f.day(toWall(nx.full), now)}${toWall(nx.full) - now > 6 * DAY ? "" : ` ${f.time(toWall(nx.full))}`}`)] : null,
          nx.new ? [h("dt", {}, "New Moon"), h("dd", {}, f.day(toWall(nx.new), now))] : null)));
    }
  }
  $("tiles").replaceChildren(...out);
}

/* ---------- one day, in full ---------- */
// how close each model has been here (weather/skill.js, from the nearest airport's reports)
function accuracy(wx) {
  const f = S.f, box = $("accuracy-body"), k = wx.skill, note = (t) => h("p", { class: "small muted" }, t);
  if (!k) { box.replaceChildren(note("Checking the forecasts against what actually happened…")); return; }
  if (!k.station) { box.replaceChildren(note(k.failed ? "Couldn't check the forecasts just now; it'll try again later." : "There's no airport weather station within 40 km to check the forecasts against, so the forecast here isn't tuned.")); return; }
  const st = k.station, where = `${st.name} (${st.km} km away)`;
  if (!k.skill) { box.replaceChildren(note(`Recording what actually happens at ${where}: ${k.obsDays} of the ${MIN_DAYS} days needed so far. The record builds up as the days go by.`)); return; }
  const s = k.skill;
  box.replaceChildren(
    h("p", { class: "small" }, `How far off each model's next-day forecasts have been at ${where}, over the last ${s.days} days.`),
    h("table", { class: "models acc" }, h("caption", { class: "sr-only" }, "Each model's average error and lean, next-day forecasts"),
      h("tr", {}, h("th", { scope: "col" }, "Model"), h("th", { scope: "col" }, "Highs"), h("th", { scope: "col" }, "Lows"), h("th", { scope: "col" }, "Leans")),
      ...s.models.map((m, i) => h("tr", {}, h("td", {}, m.name, i === 0 ? h("span", { class: "best" }, "Most accurate") : null), h("td", {}, `±${f.deltaFine(m.hiMae)}`),
        h("td", {}, m.loMae != null ? `±${f.deltaFine(m.loMae)}` : "–"), h("td", {}, Math.abs(m.hiBias) >= 0.5 ? `${f.deltaFine(m.hiBias)} ${m.hiBias > 0 ? "warm" : "cold"}` : "–")))),
    h("p", { class: "chart-note" }, s.days < TUNE_DAYS ? `Tuning starts once there are ${TUNE_DAYS} days to go on.` : S.settings.tune !== false
      ? "From tomorrow, the highs and lows are tuned with this: each model's usual error taken off, the closest counting most." : "Tuning is turned off (Settings)."));
}

function openDay(key) {
  const wx = S.wx; if (!wx) return;
  const f = S.f, now = nowWall(wx.place.offset), d = wx.daily.find((x) => x.key === key); if (!d) return;
  $("day-title").textContent = `${f.day(d.date, now)}, ${f.dateLong(d.date)}`;
  const body = $("day-body"), parts = I.dayParts(wx, key), conf = I.confidence(wx)[key];
  const kids = [
    h("div", { class: "day-top" }, h("span", { svg: weatherIcon(iconOf(d.code, true), 56) }), h("div", {}, h("div", { class: "dt-main" }, label(d.code)), h("div", { class: "dt-sub" }, `High ${f.temp(d.tmax)} · Low ${f.temp(d.tmin)}`))),
    d.tuned ? h("p", { class: "small tuned-note" }, `Tuned for here from six models and how each has done at ${wx.skill?.station?.name || "the nearest station"}. The forecast on its own said ${f.temp(d.raw.tmax)} / ${f.temp(d.raw.tmin)}.`) : null,
    h("p", { class: "day-desc" }, I.describeDay(wx, key, f)),
    h("div", { class: "parts" }, ...parts.map((p) => h("div", { class: "part" }, h("span", { class: "p-name" }, p.name[0].toUpperCase() + p.name.slice(1)),
      h("span", { svg: weatherIcon(iconOf(p.code, p.isDay), 34) }), h("span", { class: "p-temp" }, f.temp(p.name === "overnight" ? p.tmin : p.tmax)), h("span", { class: "p-pop" }, (p.pop ?? 0) >= 20 ? `${Math.round(p.pop)}%` : "")))),
  ];
  const hrs = I.hoursBetween(wx, d.date, d.date + DAY);
  const tChart = h("div"), rChart = h("div"), wChart = h("div");
  if (hrs.length > 3) kids.push(h("h3", { class: "day-section" }, "Temperature"), tChart, h("h3", { class: "day-section" }, "Chance of rain"), rChart, h("h3", { class: "day-section" }, "Wind"), wChart);
  const stat = (k, v) => h("div", { class: "stat" }, h("span", {}, k), h("b", {}, v));
  kids.push(h("h3", { class: "day-section" }, "Details"), h("div", { class: "stats" },
    stat("Rain", `${f.precip(d.precip)}${d.precipHours ? ` over ${Math.round(d.precipHours)} h` : ""}`),
    stat("Chance of rain", d.popMax != null ? `${Math.round(d.popMax)}%` : "–"),
    stat("Wind", `${f.wind(d.windMax)}, gusts ${f.wind(d.gustMax)}`),
    stat("From the", compassWord(d.dir ?? 0)),
    stat("Feels like", `${f.temp(d.fmin)} to ${f.temp(d.fmax)}`),
    stat("UV", d.uvMax != null ? `${Math.round(d.uvMax)} max` : "–"),
    stat("Sunshine", d.sunshine != null ? f.dur(d.sunshine) : "–"),
    stat("Sun", `${f.time(d.sunrise)} – ${f.time(d.sunset)}`),
    (d.snow ?? 0) > 0 ? stat("Snow", f.snow(d.snow)) : null));
  // against the climate
  const c = wx.climate && climateOn(wx.climate, d.date);
  if (c?.tmax) {
    const p = rankIn(c.tmax.sorted, d.tmax), an = d.tmax - c.tmax.mean;
    kids.push(h("h3", { class: "day-section" }, "For the time of year"), h("p", { class: "small" }, `${f.temp(d.tmax)} is ${Math.abs(an) < 1 ? "about normal" : `${f.delta(an)} ${an > 0 ? "above" : "below"} normal`} (normal high ${f.temp(c.tmax.mean)}): warmer than ${Math.round(p)}% of days at this time of year since ${wx.climate.years[0]}.${c.recordHigh ? ` Record: ${f.temp(c.recordHigh.v)} in ${c.recordHigh.year}.` : ""}`));
  }
  // how sure, and what each model says
  if (conf && d.date >= dayStart(now)) {
    const bar = h("span", { class: "conf-bar" }), fill = h("i"); fill.style.width = `${conf.score}%`; bar.append(fill);
    const why = conf.why.length ? ` The models differ on the ${conf.why.join(" and the ")}.` : "";
    kids.push(h("h3", { class: "day-section" }, "Forecast confidence"), h("div", { class: "conf" }, bar, h("b", {}, `${conf.level[0].toUpperCase() + conf.level.slice(1)} (${conf.score})`)),
      h("p", { class: "small muted" }, `${conf.level === "high" ? "The forecast is unlikely to change much." : conf.level === "medium" ? "Some uncertainty: details could shift." : "Low confidence: this could change a lot."}${why}`));
    const ens = wx.ensemble?.days?.[key];
    if (ens) kids.push(h("p", { class: "small" }, `ECMWF's ${ens.members}-run ensemble: high most likely ${f.temp(ens.tmaxP10)} to ${f.temp(ens.tmaxP90)}${ens.wet != null ? `; ${Math.round(ens.wet * 100)}% of runs bring 1 mm+ of rain` : ""}.`));
    const mods = wx.models?.days?.[key];
    if (mods?.length) kids.push(h("table", { class: "models" }, h("caption", { class: "sr-only" }, "What each weather model forecasts"),
      h("tr", {}, h("th", { scope: "col" }, "Model"), h("th", { scope: "col" }, "High"), h("th", { scope: "col" }, "Low"), h("th", { scope: "col" }, "Rain")),
      d.tuned ? h("tr", { class: "tuned-row" }, h("td", {}, "Tuned for here"), h("td", {}, f.temp(d.tmax)), h("td", {}, f.temp(d.tmin)), h("td", {}, "–")) : null,
      ...mods.map((m) => h("tr", {}, h("td", {}, m.name), h("td", {}, f.temp(m.tmax)), h("td", {}, f.temp(m.tmin)), h("td", {}, m.precip != null ? f.precip(m.precip) : "–")))));
  }
  body.replaceChildren(...kids.filter(Boolean));
  const dlg = $("day");
  if (!dlg.open) dlg.showModal();
  dlg.querySelector(".sheet-body").scrollTop = 0;
  if (hrs.length > 3) requestAnimationFrame(() => {
    drawHourChart(wx, now, hrs, tChart, null, "temp", d.key === keyOf(now));
    drawHourChart(wx, now, hrs, rChart, null, "rain", d.key === keyOf(now));
    drawHourChart(wx, now, hrs, wChart, null, "wind", d.key === keyOf(now));
  });
}

/* ---------- places ---------- */
async function locate(quiet = false) {
  if (!navigator.geolocation) { if (!quiet) alert("Location isn't available in this browser."); return false; }
  const btn = $("locate-btn"); btn.classList.add("busy");
  try {
    const pos = await new Promise((ok, no) => navigator.geolocation.getCurrentPosition(ok, no, { enableHighAccuracy: false, timeout: 12000, maximumAge: 10 * 60e3 }));
    const lat = pos.coords.latitude, lon = pos.coords.longitude;
    const name = await nameOf(lat, lon);
    addPlace({ name: name?.name || "My Location", region: name?.region || "", lat, lon, gps: true });
    const n = S.settings.notify;
    if ((n.rain || n.brief) && n.place?.gps && cell(n.place.lat, n.place.lon) !== cell(lat, lon)) { n.place = { lat, lon, name: name?.name || "My Location", gps: true }; saveSettings(); syncNotify().catch(() => {}); }
    go();
    return true;
  } catch (e) {
    if (!quiet) $("status").textContent = e?.code === 1 ? "Location is turned off for this site. You can search for a place instead." : "Couldn't find your location just now.";
    return false;
  } finally { btn.classList.remove("busy"); }
}
function drawSaved() {
  const f = S.f;
  $("saved").replaceChildren(...S.places.map((p, i) => {
    const k = peek(p);
    return h("li", {},
      h("button", { class: "row-btn", type: "button", "aria-current": i === S.cur ? "true" : "false", onclick: () => { S.cur = i; savePlaces(); $("places").close(); go(); } },
        k ? h("span", { svg: weatherIcon(iconOf(k.code, k.isDay), 30) }) : null,
        h("span", { class: "rb-main" }, h("span", { class: "rb-name" }, p.name), h("span", { class: "rb-sub" }, p.gps && p.name !== "My Location" ? "My Location" : p.region || "")),
        k ? h("span", { class: "rb-temp" }, f.temp(k.temp)) : null),
      S.places.length > 1 ? h("button", { class: "del", type: "button", "aria-label": `Remove ${p.name}`, svg: glyph("trash", 18), onclick: () => {
        const was = place(); S.places.splice(i, 1); S.cur = Math.max(0, S.places.indexOf(was)); savePlaces(); drawSaved(); if (was !== place()) go();
      } }) : null);
  }));
}
let searchTimer = null, searchSeq = 0;
function onSearch() {
  clearTimeout(searchTimer);
  const q = $("search").value.trim(), out = $("results");
  if (q.length < 2) { out.replaceChildren(); return; }
  searchTimer = setTimeout(async () => {
    const my = ++searchSeq;
    try {
      const list = await searchPlaces(q);
      if (my !== searchSeq) return;
      out.replaceChildren(...(list.length ? list.map((p) => h("li", {}, h("button", { class: "row-btn", type: "button", onclick: () => { addPlace(p); $("search").value = ""; out.replaceChildren(); $("places").close(); go(); } },
        h("span", { class: "rb-main" }, h("span", { class: "rb-name" }, p.name), h("span", { class: "rb-sub" }, p.region))))) : [h("li", { class: "muted small" }, "No places found.")]));
    } catch (_) { if (my === searchSeq) out.replaceChildren(h("li", { class: "muted small" }, "Search isn't available right now.")); }
  }, 280);
}

/* ---------- settings ---------- */
function drawSettings() {
  const form = $("settings-form");
  for (const k of ["temp", "wind", "precip", "pressure", "clock"]) { const r = form.querySelector(`input[name="${k}"][value="${S.settings[k]}"]`); if (r) r.checked = true; }
  form.commute.checked = !!S.settings.commute?.on;
  form.am.value = S.settings.commute?.am || "08:00"; form.pm.value = S.settings.commute?.pm || "17:30";
  form.tune.checked = S.settings.tune !== false;
  for (const k of ["laundry", "stars", "sunset"]) form[`x_${k}`].checked = S.settings.extras?.[k] !== false;
  drawNotify(); drawActs();
}
function readSettings(e) {
  if (e?.target?.closest?.("#notify-set") || e?.target?.closest?.(".acts-list, .acts-add")) return;     // (their own handlers)
  const form = $("settings-form"), v = (k) => form.querySelector(`input[name="${k}"]:checked`)?.value;
  const units = ["temp", "wind", "precip", "clock"].map((k) => S.settings[k]).join();
  for (const k of ["temp", "wind", "precip", "pressure", "clock"]) if (v(k)) S.settings[k] = v(k);
  S.settings.commute = { on: form.commute.checked, am: form.am.value || "08:00", pm: form.pm.value || "17:30" };
  S.settings.tune = form.tune.checked;
  S.settings.extras = { laundry: form.x_laundry.checked, stars: form.x_stars.checked, sunset: form.x_sunset.checked };
  saveSettings(); render(); drawActs();
  // notifications speak your units too
  const n = S.settings.notify;
  if ((n.rain || n.brief) && units !== ["temp", "wind", "precip", "clock"].map((k) => S.settings[k]).join()) syncNotify().catch(() => {});
}

/* ---------- notifications ---------- */
const b64u = (s) => { const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
// why this phone can't have them, if it can't
function notifyWhy() {
  if ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window) return Notification.permission === "denied" ? "Notifications are blocked for this site in your browser's settings." : null;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  return ios && !standalone ? "On iPhone and iPad, add Weather to your Home Screen first (Share, then Add to Home Screen) and turn these on from there." : "This browser can't show notifications.";
}
async function pushSub(make) {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub && make) {
    const r = await fetch("/api/weather/key");
    if (!r.ok) throw new Error("no key");
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u((await r.json()).key) });
  }
  return sub;
}
async function post(path, body) {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
// tell the server what this phone wants (or that it wants nothing)
async function syncNotify() {
  const n = S.settings.notify;
  if (!n.rain && !n.brief) {
    const sub = "serviceWorker" in navigator ? await pushSub(false).catch(() => null) : null;
    if (sub) { await post("/api/weather/unsubscribe", { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe().catch(() => {}); }
    return;
  }
  const sub = await pushSub(true), j = sub.toJSON();
  await post("/api/weather/subscribe", { sub: { endpoint: j.endpoint, keys: j.keys }, place: n.place, rain: n.rain, brief: n.brief, briefAt: n.briefAt,
    units: { temp: S.settings.temp, wind: S.settings.wind, precip: S.settings.precip, clock: S.settings.clock } });
}
const hereForNotify = () => { const p = place(); return p ? { lat: p.lat, lon: p.lon, name: p.name, gps: !!p.gps } : null; };
const atText = (at) => { const [hh, mm] = String(at || "07:00").split(":").map(Number); return S.f.time(Date.UTC(2000, 0, 1, hh || 0, mm || 0)); };
async function onNotify() {
  const form = $("settings-form"), n = S.settings.notify, st = $("notify-status");
  const want = { rain: form.rain.checked, brief: form.brief.checked, briefAt: form.briefAt.value || "07:00" };
  if ((want.rain && !n.rain) || (want.brief && !n.brief)) {
    const why = notifyWhy();
    if (why) { st.textContent = why; drawNotify(true); return; }
    // asked straight away, while the tap still counts (Safari won't ask otherwise)
    const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (perm !== "granted") { st.textContent = "Notifications weren't allowed, so nothing can be sent."; drawNotify(true); return; }
    if (!(n.rain || n.brief) || !n.place) n.place = hereForNotify();
  }
  Object.assign(n, want);
  saveSettings();
  st.textContent = "Saving…";
  try {
    await syncNotify();
    st.textContent = n.rain || n.brief ? `On: ${[n.rain ? "rain alerts" : "", n.brief ? `a briefing at ${atText(n.briefAt)}` : ""].filter(Boolean).join(" and ")}.` : "Off.";
  } catch (err) { st.textContent = `Couldn't save that just now (${err.message}).`; }
  drawNotify(true);
}
function drawNotify(keepStatus = false) {
  const n = S.settings.notify, form = $("settings-form"), p = place(), on = n.rain || n.brief;
  form.rain.checked = !!n.rain; form.brief.checked = !!n.brief; form.briefAt.value = n.briefAt || "07:00";
  $("notify-place").textContent = on && n.place ? `For ${n.place.gps ? `My Location (${n.place.name})` : n.place.name}.` : "For the place you're looking at when you turn them on.";
  $("notify-here").hidden = !(on && n.place && p && cell(p.lat, p.lon) !== cell(n.place.lat, n.place.lon));
  if (!keepStatus) $("notify-status").textContent = on ? "" : notifyWhy() || "";
}

/* ---------- your activities ---------- */
function saveActs() { saveSettings(); if (S.wx) windows(S.wx, nowWall(S.wx.place.offset)); drawActs(); }
function drawActs() {
  const f = S.f, acts = S.settings.activities, have = new Set(acts.map((a) => a.id));
  $("acts-list").replaceChildren(...acts.map((a, i) => h("li", { class: "act" },
    h("label", { class: "switch" }, h("input", { type: "checkbox", checked: a.on !== false, onchange: (e) => { a.on = e.target.checked; saveActs(); } }), h("span", { class: "act-icon", svg: glyph(a.icon || "star", 16) }), a.name),
    h("span", { class: "act-lim" }, I.limitsText(a, f)),
    h("button", { class: "link", type: "button", "aria-label": `Change ${a.name}`, onclick: () => editAct(i) }, "Change"))));
  $("act-add").replaceChildren(h("option", { value: "" }, "Choose…"),
    ...Object.entries(I.ACTIVITIES).filter(([id]) => !have.has(id)).map(([id, a]) => h("option", { value: id }, a.name)), h("option", { value: "custom" }, "Something else…"));
}
function editAct(i) {
  const a = S.settings.activities[i], f = S.f, li = $("acts-list").children[i];
  const tU = (c) => Math.round(f.units.temp === "f" ? c * 9 / 5 + 32 : c), tM = (v) => (f.units.temp === "f" ? (v - 32) * 5 / 9 : v);
  const wk = f.windNum(1000) / 1000, wU = (k) => Math.round(k * wk), wM = (v) => v / wk;
  const num = (name, text, v, unit) => h("label", { class: "fld" }, h("span", {}, text), h("span", { class: "fld-in" }, h("input", { type: "number", name, value: String(v), inputmode: "numeric", step: "1" }), unit ? h("small", {}, unit) : null));
  const hour = (name, text, v) => h("label", { class: "fld" }, h("span", {}, text), h("select", { name }, ...Array.from({ length: 25 }, (_, k) => h("option", { value: String(k), selected: k === v ? true : null }, k === 24 ? "midnight" : f.time(Date.UTC(2000, 0, 1, k))))));
  const ed = h("div", { class: "act-edit" },
    h("label", { class: "fld wide" }, h("span", {}, "Name"), h("input", { type: "text", name: "name", value: a.name, maxlength: "24" })),
    num("tmin", "Feels like from", tU(a.tmin), "°"), num("tmax", "to", tU(a.tmax), "°"),
    num("windMin", "Wind at least", wU(a.windMin || 0), f.windUnit), num("windMax", "Wind at most", wU(a.windMax), f.windUnit),
    num("gustMax", "Gusts at most", wU(a.gustMax), f.windUnit),
    h("label", { class: "fld" }, h("span", {}, "Rain"), h("select", { name: "rain" }, ...[["dry", "Must be dry"], ["light", "Light rain is fine"], ["any", "Any weather"]].map(([v, t]) => h("option", { value: v, selected: a.rain === v ? true : null }, t)))),
    num("hours", "For (hours)", a.hours), hour("from", "Between", a.from), hour("to", "and", a.to),
    h("div", { class: "act-btns" }, h("button", { class: "pill-btn", type: "button", onclick: () => done() }, "Done"), h("button", { class: "link danger", type: "button", onclick: () => { S.settings.activities.splice(i, 1); saveActs(); } }, "Remove")));
  const val = (k) => ed.querySelector(`[name="${k}"]`).value, n = (k, d) => { const v = parseFloat(val(k)); return Number.isFinite(v) ? v : d; };
  function done() {
    Object.assign(a, { name: val("name").trim().slice(0, 24) || a.name, tmin: tM(n("tmin", tU(a.tmin))), tmax: tM(n("tmax", tU(a.tmax))), windMin: Math.max(0, wM(n("windMin", 0))),
      windMax: Math.max(1, wM(n("windMax", wU(a.windMax)))), gustMax: Math.max(1, wM(n("gustMax", wU(a.gustMax)))), rain: val("rain"), hours: Math.max(1, Math.min(8, Math.round(n("hours", a.hours)))), from: Number(val("from")), to: Number(val("to")) });
    if (a.tmax < a.tmin) [a.tmin, a.tmax] = [a.tmax, a.tmin];
    if (a.to <= a.from) a.to = Math.min(24, a.from + a.hours);
    saveActs();
  }
  li.replaceChildren(ed);
  ed.querySelector("input").focus();
}
function addAct() {
  const id = $("act-add").value; if (!id) return;
  const a = id === "custom" ? { id: `my${Date.now().toString(36)}`, name: "My activity", icon: "star", tmin: 10, tmax: 22, windMin: 0, windMax: 30, gustMax: 50, rain: "dry", hours: 2, from: 8, to: 20 } : { id, ...I.ACTIVITIES[id] };
  S.settings.activities.push({ ...a, on: true });
  saveActs();
  if (id === "custom") editAct(S.settings.activities.length - 1);
}

/* ---------- wiring ---------- */
function wire() {
  $("locate-btn").innerHTML = glyph("locate", 20);
  $("settings-btn").innerHTML = glyph("gear", 20);
  for (const b of document.querySelectorAll("[data-close]")) { b.innerHTML = glyph("close", 18); b.addEventListener("click", () => b.closest("dialog").close()); }
  for (const s of document.querySelectorAll(".ct-icon[data-g]")) s.innerHTML = glyph(s.dataset.g, 15);
  // a tap on the dimmed backdrop closes a sheet
  for (const d of document.querySelectorAll("dialog")) d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
  $("place-btn").addEventListener("click", () => { drawSaved(); $("use-location").replaceChildren(h("span", { svg: glyph("locate", 18) }), " Use my location"); $("places").showModal(); });
  $("use-location").addEventListener("click", () => { $("places").close(); locate(); });
  $("search").addEventListener("input", onSearch);
  $("search-form").addEventListener("submit", (e) => { e.preventDefault(); onSearch(); });
  $("locate-btn").addEventListener("click", () => locate());
  $("settings-btn").addEventListener("click", () => { drawSettings(); $("settings").showModal(); });
  $("settings-form").addEventListener("change", readSettings);
  for (const k of ["rain", "brief", "briefAt"]) $("settings-form")[k].addEventListener("change", onNotify);
  $("notify-here").addEventListener("click", () => { S.settings.notify.place = hereForNotify(); saveSettings(); $("notify-status").textContent = "Saving…"; syncNotify().then(() => { $("notify-status").textContent = "Moved to this place."; }, (e) => { $("notify-status").textContent = `Couldn't save that just now (${e.message}).`; }); drawNotify(true); });
  $("act-add").addEventListener("change", addAct);
  for (const b of document.querySelectorAll(".radar-play")) b.innerHTML = `<span class="g-off">${glyph("play", 16)}</span><span class="g-on">${glyph("pause", 16)}</span>`;
  for (const b of document.querySelectorAll(".radar-full")) b.innerHTML = `<span class="g-off">${glyph("expand", 16)}</span><span class="g-on">${glyph("shrink", 16)}</span>`;
  $("refresh-btn").addEventListener("click", () => go(true));
  $("retry-btn").addEventListener("click", () => go(true));
  $("hourly-seg").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-mode]"); if (!b) return;
    S.mode = b.dataset.mode;
    const tabs = [...$("hourly-seg").children];
    for (const x of tabs) x.setAttribute("aria-selected", String(x === b));
    $("hourly-seg").style.setProperty("--seg-i", String(tabs.indexOf(b)));
    if (S.wx) { const now = nowWall(S.wx.place.offset); drawHourChart(S.wx, now, I.hoursFrom(S.wx, now, 48), $("hourly-chart"), $("hourly-note"), S.mode, true); }
  });
  $("hourly-seg").addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const tabs = [...$("hourly-seg").children], i = tabs.findIndex((x) => x.getAttribute("aria-selected") === "true");
    const n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); n.click();
  });
  // on a wide screen the climate card joins the left column, under the 16 days, so the columns balance
  const wide = matchMedia("(min-width: 980px)"), dock = () => (wide.matches ? $("daily") : $("windows")).after($("climate"));
  dock(); wide.addEventListener("change", dock);
  const top = document.querySelector(".top");
  addEventListener("scroll", () => top.classList.toggle("scrolled", scrollY > 8), { passive: true });
  // the glass: Safari only shows a press (:active) once the page listens for touches, and with a mouse
  // a soft light follows the pointer across the panels
  addEventListener("touchstart", () => {}, { passive: true });
  if (matchMedia("(hover: hover) and (pointer: fine)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    let raf = 0, x = 0, y = 0;
    addEventListener("pointermove", (e) => {
      x = e.clientX; y = e.clientY;
      raf ||= requestAnimationFrame(() => { raf = 0; document.documentElement.style.setProperty("--lx", `${x}px`); document.documentElement.style.setProperty("--ly", `${y}px`); });
    }, { passive: true });
  }
  // the minute changes things like "in 20 minutes": redraw just what says so (the rest waits for the next forecast)
  setInterval(() => {
    if (!S.wx || document.visibilityState !== "visible") return;
    const now = nowWall(S.wx.place.offset);
    sky(S.wx, now); hero(S.wx, now); nowcast(S.wx, now); status();
  }, 60e3);
}

start();
