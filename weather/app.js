// Weather: the page. data.js fetches, insights.js thinks, this draws.
import { load, due, searchPlaces, nameOf, store, peek, cell } from "./data.js";
import { makeFormat, nowWall, dayStart, keyOf, hourOf, compass, compassWord, beaufort, HOUR, DAY } from "./format.js";
import * as I from "./insights.js";
import { codeInfo, iconOf, label } from "./codes.js";
import { weatherIcon, moonIcon, glyph } from "./icons.js";
import { timeChart, rangeChart } from "./charts.js";
import { climateOn, rankIn, yearsAgo } from "./climate.js";
import { nextPhases } from "./sky.js";
import { applyTuning, steady, refine, daysSaid, saidBefore, MIN_DAYS, TUNE_DAYS } from "./skill.js";
import { radar, rainAt } from "./radar.js";
import { blend } from "./rainmap.js";
import { oneRain } from "./agree.js";
import { inForce, covered, colourOf, titleOf, badgeOf, spanOf, glyphOf } from "./official.js";
import * as A from "./account.js";

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
  // (an icon in a span: just the icon, with no room for a line of text's descenders under it: styles.css .ic)
  if (attrs?.svg && tag === "span") n.classList.add("ic");
  return n;
}
const COLOR = { temp: "#D07A12", rain: "#3B8BE0", wind: "#14A08F" };     // (checked for contrast and colour-blind separation on the cards)
const T = () => (S.f.units.temp === "f" ? (c) => c * 9 / 5 + 32 : (c) => c);
const W = () => S.f.windNum;

/* ---------- state ---------- */
const S = { settings: null, f: null, places: [], cur: 0, base: null, wx: null, radar: null, mode: "temp", allInsights: false, allWins: false, loading: false, stale: false, error: null };
// the units to start with, whatever the phone's language: °C, mph, mm, hPa and the 24-hour clock (Settings → Units)
const defaults = () => ({ temp: "c", wind: "mph", precip: "mm", pressure: "hpa", clock: "24" });
function loadSettings() {
  const d = {
    ...defaults(), commute: { on: false, am: "08:00", pm: "17:30" }, tune: true,
    activities: I.DEFAULT_ACTIVITIES.map((a) => ({ ...a })), extras: { laundry: true, stars: true, sunset: true },
  };
  // (only values the app knows: a damaged or out-of-date one falls back to the default)
  const k = store.get("wx:settings"), o = k && typeof k === "object" && !Array.isArray(k) ? k : {};
  const one = (v, ok, dv) => (ok.includes(v) ? v : dv), obj = (v, dv) => ({ ...dv, ...(v && typeof v === "object" && !Array.isArray(v) ? v : {}) });
  S.settings = { ...d, ...o,
    temp: one(o.temp, ["c", "f"], d.temp), wind: one(o.wind, ["mph", "kmh", "ms", "kn"], d.wind), precip: one(o.precip, ["mm", "in"], d.precip),
    pressure: one(o.pressure, ["hpa", "inhg", "mmhg"], d.pressure), clock: one(o.clock, ["12", "24"], d.clock), tune: o.tune !== false,
    glass: one(o.glass, ["clear", "standard", "tinted"], "standard"),
    commute: obj(o.commute, d.commute), extras: obj(o.extras, d.extras), notify: notifyOf(o.notify),
    activities: Array.isArray(o.activities) ? o.activities.filter((a) => a && typeof a === "object" && typeof a.name === "string") : d.activities,
  };
  S.f = makeFormat(S.settings);
  document.body.dataset.glass = S.settings.glass;
}
// Which notifications for which places: { places: [{ lat, lon, name, gps?, rain, warn }], brief: { lat, lon, name, gps? }
// or null, briefAt, endpoint (this device's push address, while it has them), devId (the server's name for it), syncedAt }
// (kept from before as one place, for whichever were on: the same, for that place)
function notifyOf(n) {
  n = n && typeof n === "object" && !Array.isArray(n) ? n : {};
  const spot = (p) => (p && Number.isFinite(p.lat) && Number.isFinite(p.lon) ? { lat: p.lat, lon: p.lon, name: String(p.name || ""), ...(p.gps ? { gps: true } : {}) } : null);
  const at = /^\d\d:\d\d$/.test(n.briefAt || "") ? n.briefAt : "07:00", keep = { endpoint: n.endpoint || null, devId: n.devId || null, syncedAt: n.syncedAt || 0 };
  // (signed in: the warnings and the briefing by email too)
  const email = { warn: !!n.email?.warn, brief: !!n.email?.brief };
  if (!Array.isArray(n.places)) { const p = spot(n.place); return { places: p && (n.rain || n.warn) ? [{ ...p, rain: !!n.rain, warn: !!n.warn }] : [], brief: p && n.brief ? p : null, briefAt: at, email, ...keep }; }
  const places = n.places.map((x) => { const p = spot(x); return p && (x.rain || x.warn) ? { ...p, rain: !!x.rain, warn: !!x.warn } : null; }).filter(Boolean);
  return { places, brief: n.brief && typeof n.brief === "object" ? spot(n.brief) : null, briefAt: at, email, ...keep };
}
// (kept, and signed in, sent to the account soon after: inStepSoon)
const saveSettings = () => { store.set("wx:settings", S.settings); S.f = makeFormat(S.settings); document.body.dataset.glass = S.settings.glass; inStepSoon(); };
const place = () => S.places[S.cur] || null;
const savePlaces = () => { store.set("wx:places", S.places); store.set("wx:cur", S.cur); inStepSoon(); };

/* ---------- start ---------- */
async function start() {
  loadSettings();
  S.places = (store.get("wx:places") || []).filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon));
  const cur = store.get("wx:cur");
  S.cur = Math.min(Number.isInteger(cur) && cur > 0 ? cur : 0, Math.max(0, S.places.length - 1));
  // My Location first (lists kept from before it was), still showing the same place
  const g = S.places.findIndex((x) => x.gps);
  if (g > 0) { const was = place(); S.places.unshift(...S.places.splice(g, 1)); S.cur = S.places.indexOf(was); savePlaces(); }
  wire();
  // a shared link: ?lat=…&lon=…&name=…
  const q = new URLSearchParams(location.search), lat = parseFloat(q.get("lat")), lon = parseFloat(q.get("lon"));
  if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    const name = (q.get("name") || "").replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim().slice(0, 60);
    history.replaceState(null, "", location.pathname);
    const p = { name: name || `${lat.toFixed(2)}, ${lon.toFixed(2)}`, region: "", lat, lon }, have = S.places.findIndex((x) => !x.gps && Math.abs(x.lat - lat) < 0.02 && Math.abs(x.lon - lon) < 0.02);
    // (a first visit takes it as its place; a list of your own is added to only if you say so, so a link can't slip a
    // place into it, and on to every device your account's on)
    if (have >= 0) S.cur = have;
    else if (!S.places.length || confirm(`Add “${p.name}” to your places?`)) addPlace(p);
  }
  let located = false;
  if (!S.places.length) {
    // first time: your location if you've already allowed it, else roughly where you are (from your connection), else London
    let granted = false;
    try { granted = (await navigator.permissions?.query({ name: "geolocation" }))?.state === "granted"; } catch (_) {}
    located = granted && await locate(true);
    if (!located) try {
      const r = await fetch("/api/weather/where", { signal: AbortSignal.timeout(4000) });
      const j = r.ok ? await r.json() : null;
      if (j && Number.isFinite(j.lat)) addPlace({ name: j.name, region: j.region || "", lat: j.lat, lon: j.lon, approx: true });
    } catch (_) {}
    if (!S.places.length) addPlace({ name: "London", region: "England, United Kingdom", lat: 51.5072, lon: -0.1276 });
  }
  // (found, it's asked for already)
  if (!located) go();
  // keep "My Location" current, quietly, if you've allowed it (what was kept shows meanwhile)
  if (!located && place()?.gps) try { if ((await navigator.permissions?.query({ name: "geolocation" }))?.state === "granted") locate(true); } catch (_) {}
  // and if its name couldn't be found when it was saved, try again from where it is (no need to ask for the location)
  const unnamed = !located && S.places.find((x) => x.gps && x.name === "My Location");
  if (unnamed) nameOf(unnamed.lat, unnamed.lon, { live: false }).then((n) => { if (n && unnamed.name === "My Location") { Object.assign(unnamed, n); savePlaces(); showPlace(); } });
  if ("serviceWorker" in navigator) {
    // a new version: its worker arrives with every file fresh, so if the app has only just been opened (started, or
    // brought back: opened()), start again on it; if it comes later, the next time it's opened
    const had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!had) return;
      if (Date.now() - openedAt < 20e3 && !document.querySelector("dialog[open]") && !$("radar").classList.contains("radar-big")) location.reload();
      else newApp = true;
    });
    navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).catch(() => {});
    setTimeout(keepNotify, 4000);
  }
  // your account: signed in, as it was last time, till the server says (and whether you've signed in elsewhere on the site)
  const k = store.get("wx:acct");
  if (k?.handle) S.acct = { ...profileOf(k), devices: k.devices || [], state: "ok" };
  pull();
}
function addPlace(p, makeCurrent = true) {
  const near = (a) => Math.abs(a.lat - p.lat) < 0.02 && Math.abs(a.lon - p.lon) < 0.02;
  let i = p.gps ? S.places.findIndex((x) => x.gps) : S.places.findIndex((x) => !x.gps && near(x));
  if (i >= 0) S.places[i] = { ...S.places[i], ...p };
  else if (p.gps) { S.places.unshift(p); i = 0; if (!makeCurrent) S.cur++; }      // My Location first, as on iOS
  else { S.places.push(p); i = S.places.length - 1; }
  if (makeCurrent) S.cur = i;
  savePlaces();
  return i;
}

/* ---------- loading ---------- */
let seq = 0;
// (fresh: called once the forecast itself is in, or has failed: the rest comes in behind it)
async function go(force = false, fresh = null) {
  const p = place(); if (!p) return;
  const my = ++seq;
  S.loading = true; S.error = null; S.asked = force;
  // (busy only while there's nothing on the page yet: a refresh in the background leaves what's there to be read)
  if (!S.wx) $("main").setAttribute("aria-busy", "true");
  $("refresh-btn").disabled = true;
  showPlace();
  const moved = !S.wx || cell(S.wx.place.lat, S.wx.place.lon) !== cell(p.lat, p.lon);
  if (moved) { S.wx = S.base = null; S.allInsights = S.allWins = S.allDays = false; S.rain = null; }
  // (a place with nothing kept: its first picture waits, a second at most from the forecast's coming, for the warnings
  // and the radar's say, which would otherwise come in over the top of it and push it down as it's read: paint)
  clearTimeout(S.hold?.timer);
  // (a new place's first picture straight away, not held back by the last place's drawing: paint)
  if (moved) { clearTimeout(S.paintT); S.painted = 0; }
  S.hold = moved && !S.wx && !store.get(`wx:${cell(p.lat, p.lon)}`)?.forecast ? { id: cell(p.lat, p.lon), until: 0, timer: 0 } : null;
  // (meanwhile, a sky for the time of day, by this phone's clock: not a day's sky that turns to night as the forecast
  // comes, nor the last place's)
  if (S.hold) { const hr = new Date().getHours(); document.body.dataset.sky = hr >= 7 && hr < 19 ? "cloudy-day" : "cloudy-night"; }
  if (!S.radar) S.radar = radar($("radar"), { lat: p.lat, lon: p.lon, time: (t) => S.f.time(t + (S.wx?.place.offset ?? 0) * 1000), day: (t) => S.f.dayName(t + (S.wx?.place.offset ?? 0) * 1000), miles: () => S.f.units.wind === "mph", credits: () => openCredits("map"),
    temp: (c) => S.f.temp(c), tempUnit: () => (S.f.units.temp === "f" ? "°F" : "°C"), windNum: (k) => Math.round(S.f.windNum(k)), windUnit: () => S.f.windUnit,
    // (rain expected here in the next two hours: worth the models' grid, where the radar has no track to follow)
    rainSoon: () => { const w = S.wx; if (!w) return true; const now = nowWall(w.place.offset); return (w.minutely || []).some((x) => x.precip >= 0.05) || I.hoursFrom(w, now, 3).some((x) => (x.precip ?? 0) >= 0.1 || (x.pop ?? 0) >= 40); } });
  else S.radar.place(p.lat, p.lon);
  try {
    const loading = load(p, (wx, how) => {
      if (!how.partial) fresh?.();
      if (my !== seq || !wx) return;
      if (how.error) S.error = how.error;
      if (runOut(wx)) { render(); return; }
      S.base = wx; S.stale = !!how.stale;      // (shaped as it's drawn: render)
      if (!how.stale && !how.partial) snapshotNow(wx);
      paint();
    }, { force });
    // (a new place: what's kept of it is already showing, drawn once; with nothing kept, placeholders meanwhile)
    if (moved && !S.wx) render();
    radarRain(p, my);
    await loading;
  } catch (e) {
    if (my === seq) { S.error = e; render(); }
  } finally {
    fresh?.();
    if (my === seq) { S.loading = false; $("main").setAttribute("aria-busy", "false"); $("refresh-btn").disabled = false; status(); }
  }
}

/* ---------- fresh whenever it's opened ---------- */
// Each time the app's opened (started, brought back to the front, restored by the browser, its window focused, the
// phone back online), and every minute while it's on screen: whatever's due is asked for again (data.js due: the
// forecast after 10 minutes, warnings after 5, the models, ensembles, air and sea hourly), the radar's say on the next
// hours after 5, and the radar card's frames; and on opening, a new version of the app itself (its worker: start)
let openedAt = Date.now(), newApp = false, checkedAt = 0, appAt = 0;
function opened() {
  if (document.visibilityState !== "visible") return;
  // (a new version came while it was open: it starts on it now, as it's opened)
  if (newApp) { location.reload(); return; }
  openedAt = Date.now();
  if ("serviceWorker" in navigator && Date.now() - appAt > 60e3) { appAt = Date.now(); navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => {}); }
  if (Date.now() - pulledAt > 60e3) pull();
  check(true);
}
function check(opening = false) {
  const p = place();
  if (!p || S.loading || document.visibilityState !== "visible" || (!opening && Date.now() - checkedAt < 50e3) || Date.now() - checkedAt < 5e3) return;
  checkedAt = Date.now();
  if (!S.wx || due(p)) { go(); return; }
  if (!S.rain || Date.now() - S.rain.asked > 5 * 60e3) radarRain(p, seq);
  // (the radar card's frames, if it's on screen: scrolled to, it sees to them itself)
  const r = $("radar").getBoundingClientRect();
  if (r.bottom > 0 && r.top < innerHeight) S.radar?.refresh();
  status();
}
document.addEventListener("visibilitychange", opened);
addEventListener("pageshow", (e) => { if (e.persisted) opened(); });
addEventListener("focus", opened);
addEventListener("online", () => check(true));

// the forecast with its highs and lows tuned to how each model has done here (weather/skill.js), unless that's turned off
// The forecast tuned for here as Settings has it (its highs and lows: applyTuning), steadied from three days on with
// what the page said of those days a day and two days ago (skill.js steady), and its hours from now on as the
// airport's reports have found the forecast here (refine)
const tunedOnly = (wx, today) => (S.settings.tune !== false && wx.skill?.skill ? applyTuning(wx, wx.skill.skill, today) : wx);
const tuned = (wx) => {
  if (!wx) return wx;
  const now = nowWall(wx.place.offset), today = keyOf(now);
  const s = steady(tunedOnly(wx, today), saidBefore(store.get(saidKey(wx)), Date.now()), today);
  return S.settings.tune !== false && s.skill?.local ? refine(s, s.skill.local, now) : s;
};
// what the page said of the days ahead (before steadying them), kept three days, one every three hours: the latest of
// each three hours (so one kept before the tuning came in is replaced by the tuned)
const saidKey = (wx) => `wx:said:${cell(wx.place.lat, wx.place.lon)}`;
function keepSaid(wx) {
  const at = Date.now(), k = saidKey(wx), list = (store.get(k) || []).filter((x) => at - x.at < 3 * DAY);
  const today = keyOf(nowWall(wx.place.offset)), days = daysSaid(tunedOnly(wx, today), today);
  if (list.length && at - list[list.length - 1].from < 3 * HOUR) list[list.length - 1] = { ...list[list.length - 1], at, days };
  else list.push({ at, from: at, days });
  store.set(k, list);
}
// and its next couple of hours' rain led by the radar, where it sees (rainmap.js blend), while its frame is recent; and
// its rain one story throughout (agree.js)
const shaped = (wx) => {
  const t = tuned(wx), r = S.rain;
  if (!t) return t;
  const led = r && r.id === cell(t.place.lat, t.place.lon) && Date.now() - r.at <= 40 * 60e3 ? { ...t, minutely: blend(t.minutely, r.steps, r.at, t.place.offset) } : t;
  return oneRain(led, nowWall(led.place.offset));
};
// The radar's say on the next couple of hours here (radar.js rainAt), asked for with each forecast, and the page drawn
// again with it (unless the place has changed, or the forecast been asked for again, meanwhile)
async function radarRain(p, my) {
  const r = await rainAt(p.lat, p.lon).catch(() => null);
  if (my !== seq) return;
  // (none counts as asked too, so it's not asked again every minute while the radar's away; and the page is drawn
  // again only if what the radar says has changed)
  const was = S.rain, id = cell(p.lat, p.lon), said = r ? JSON.stringify([r.at, r.steps]) : "";
  S.rain = { ...r, id, asked: Date.now(), said };
  if (S.base && !(was?.id === id && was.said === said)) paint();
}
// The page drawn, unless a new place's first picture is still waiting (go): for its warnings and the radar's say, or
// until a second after its forecast came, whichever's first
function paint() {
  const h = S.hold;
  if (h) {
    const ready = S.base?.official != null && S.rain?.id === h.id;
    h.until ||= Date.now() + 1000;
    clearTimeout(h.timer);
    if (!ready && Date.now() < h.until) { h.timer = setTimeout(paint, h.until - Date.now()); return; }
    S.hold = null;
  }
  // (parts coming in close together, as they do, drawn together: twice a second at most, rather than the whole page
  // over again for each, moving under the eye each time)
  clearTimeout(S.paintT);
  const wait = (S.painted || 0) + 500 - Date.now();
  if (wait > 0) { S.paintT = setTimeout(paint, wait); return; }
  S.painted = Date.now();
  render();
}

// "since you last looked": a few snapshots of the days ahead as the page showed them, per place (snap2: since a day's
// rain chance has been of rain at some point in it)
function snapshotNow(wx) {
  keepSaid(wx);
  wx = shaped(wx);
  const k = `wx:snap2:${cell(wx.place.lat, wx.place.lon)}`, now = nowWall(wx.place.offset), list = store.get(k) || [];
  if (!list.length || now - list[list.length - 1].at >= HOUR) { list.push(I.snapshot(wx, now)); store.set(k, list.slice(-6)); }
}
function baseline(wx, now) {
  const list = store.get(`wx:snap2:${cell(wx.place.lat, wx.place.lon)}`) || [];
  return list.filter((s) => s.at <= now - 2 * HOUR && s.at >= now - 3 * DAY).pop() || null;
}

/* ---------- drawing ---------- */
function showPlace() {
  const p = place();
  $("place-name").textContent = p ? p.name : "Weather";
  $("sr-place").textContent = p ? p.name : "your place";
  const sub = p ? (p.gps && p.name !== "My Location" ? "My Location" : p.approx ? "Roughly where you are" : p.region || "") : "";
  $("place-sub").textContent = sub;
  $("place-btn").classList.toggle("no-sub", !sub);
  document.title = p ? `${p.name} · Weather` : "Weather";
  drawDots();
}
// the saved places as dots above the temperature, the one showing lit (an arrow for My Location)
function drawDots() {
  const box = $("dots"), n = S.places.length;
  box.hidden = n < 2;
  if (n < 2) return;
  box.replaceChildren(...S.places.map((p, i) => h("i", { class: `${i === S.cur ? "on" : ""}${p.gps ? " gps" : ""}`, svg: p.gps ? glyph("here", 9) : null })));
}
// Pull down past the top and let go, to refresh, as iOS's lists do. (On iPhone the page stretches past its top as
// it's pulled, its scroll going below zero. Elsewhere it doesn't, and Refresh at the foot of the page does the same.)
// iOS's spinner comes into the gap that opens above the bar, a tick at a time as the page is pulled, all of them once
// letting go would refresh. Let go then, and the page settles with the spinner held in a gap at its top, turning,
// until the forecast itself is in (the rest comes in behind it), and at least long enough to be seen; then the page
// glides back up as it goes. Scrolled on meanwhile, the gap closes and it goes; and it gives up after 15 seconds
// whatever happens. Let go of short of refreshing, it just goes.
function pullToRefresh() {
  const page = document.querySelector(".page");
  const ring = h("div", { class: "ptr", "aria-hidden": "true" });
  // (the ticks, from the top round; spinning, each a little fainter than the one ahead of it)
  ring.innerHTML = `<svg viewBox="0 0 28 28" width="28" height="28">${Array.from({ length: 8 }, (_, i) => `<line x1="14" y1="3.2" x2="14" y2="8.6" transform="rotate(${i * 45} 14 14)"/>`).join("")}</svg>`;
  ring.querySelectorAll("line").forEach((l, i) => { l.style.setProperty("--i", String(i)); l.style.setProperty("--o", (1 - ((8 - i) % 8) * 0.1).toFixed(1)); });
  document.body.append(ring);
  const FAR = 80, ROOM = 56, LEAST = 650;      // the pull that refreshes, the gap it's held open by, the least it spins
  let touching = false, armed = false, busy = false, held = false, ending = false, cap = 0, since = 0;
  // (in the middle of the gap above the bar, with the page pulled down y pixels: the gap is y and the bar's own 10)
  const at = (y, scale, opacity) => { ring.style.transform = `translateY(${(y / 2 - 9).toFixed(1)}px) scale(${scale})`; ring.style.opacity = String(opacity); };
  const follow = () => {
    const y = Math.max(0, -scrollY), k = Math.min(1, y / FAR);
    ring.style.setProperty("--pull", k.toFixed(3));
    at(y, 0.72 + k * 0.28, Math.min(1, Math.max(0, (y - 12) / 28)).toFixed(3));
    if (k >= 1 && !armed) { armed = true; ring.classList.add("armed"); }
    else if (k < 1 && armed) { armed = false; ring.classList.remove("armed"); }
  };
  const letGo = () => { held = false; page.classList.remove("held"); };
  const done = () => {
    if (!busy || ending) return;
    ending = true;
    setTimeout(() => {
      busy = ending = false; clearTimeout(cap);
      ring.classList.remove("busy");
      at(held ? ROOM : 0, 0.5, 0);
      letGo();
    }, Math.max(0, since + LEAST - performance.now()));
  };
  addEventListener("touchstart", (e) => {
    touching = !busy && e.touches.length === 1 && scrollY <= 4 && !document.querySelector("dialog[open]") && !$("radar").classList.contains("radar-big");
    if (touching) ring.classList.add("follow");
  }, { passive: true });
  addEventListener("scroll", () => {
    if (touching) follow();
    else if (held && scrollY > 2) { letGo(); at(0, 0.5, 0); }
  }, { passive: true });
  const end = () => {
    if (!touching) return;
    touching = false;
    ring.classList.remove("follow", "armed");
    if (!armed) { at(Math.max(0, -scrollY), 0.5, 0); return; }
    armed = false; busy = held = true; since = performance.now();
    ring.classList.add("busy"); page.classList.add("held");
    at(ROOM, 1, 1);
    cap = setTimeout(done, 15000);
    go(true, done).finally(done);
  };
  addEventListener("touchend", end, { passive: true });
  addEventListener("touchcancel", end, { passive: true });
}
// Let go of a swipe, the rest of the way goes as a spring (critically damped: no bounce) that starts at the speed it was
// let go at, as iOS's paging does, so nothing jumps ahead or stalls as the finger lifts: v, pixels a millisecond towards
// where it's going (less than none: away from it, at first); dist, the pixels there; span, the furthest any of it moves
// (for when it's near enough there to stop). As an animation's duration and easing: a CSS linear() curve, sampled from
// the spring (where there isn't linear(), `ease` instead)
const curves = !!globalThis.CSS?.supports?.("animation-timing-function", "linear(0, 1)");
function glide(v, dist, ease, span = dist) {
  const u = dist > 1 ? Math.min(0.08, Math.max(-0.04, v / dist)) : 0, k = Math.max(0.022, u);
  const left = (t) => (1 + (k - u) * t) * Math.exp(-k * t);
  let end = 16;
  while (Math.abs(left(end)) * Math.max(span, dist) > 0.5 && end < 800) end += 4;
  if (!curves) return { duration: end, easing: ease };
  return { duration: end, easing: `linear(${Array.from({ length: 31 }, (_, i) => (i === 30 ? 1 : +(1 - left((end * i) / 30)).toFixed(4))).join(", ")})` };
}
// Swipe across the top of the page to the next or previous saved place, as iOS Weather pages through its cities (the
// places sheet is still the way to choose one; this is the shortcut). The page follows the finger (giving at the first
// and last, as iOS's do at their ends), from where the swipe was told from a scroll, not with a jump. Let go far
// enough, or flicked, it carries on off the screen at the speed it was let go at as the next place's page comes in
// beside it (a view transition, of just what's on screen; where there aren't any, one goes and then the other comes);
// not far enough, it springs back. With Reduce Motion, the next place is just there.
// how fast a swipe was let go: pixels a millisecond over its last moment, up to the finger lifting (held still a moment
// before it lifted, it wasn't flicked, as on iOS). trail: [[ms, x], ...] as it moved
function flickSpeed(trail) {
  const now = performance.now(), last = trail.filter(([t]) => now - t <= 90);
  return last.length > 1 ? (last[last.length - 1][1] - last[0][1]) / (now - last[0][0]) : 0;
}
function placeSwipe() {
  // (it's the page's columns that follow the finger, not the page itself: a page that's been moved isn't one the
  // browser will turn from)
  const zone = document.querySelector(".hero"), main = $("main"), cols = [...main.querySelectorAll(":scope > .col")];
  let x0 = null, y0 = 0, dx = 0, axis = null, trail = [], raf = 0, turning = false;
  const W = () => document.documentElement.clientWidth;
  const atEnd = (d) => (d > 0 && S.cur === 0) || (d < 0 && S.cur === S.places.length - 1);
  // (past the first or last, the page gives less the further it's pulled, as iOS's rubber band does)
  const give = (d) => Math.sign(d) * (1 - 1 / ((Math.abs(d) * 0.55) / W() + 1)) * W();
  const band = (d) => 0.55 / ((Math.abs(d) * 0.55) / W() + 1) ** 2;     // (how far the page moves for the finger's pixel, there)
  const offset = () => (atEnd(dx) ? give(dx) : dx);
  const shift = (x) => { for (const c of cols) c.style.translate = x ? `${x.toFixed(1)}px 0` : ""; };
  const show = () => { raf = 0; shift(offset()); };
  zone.addEventListener("touchstart", (e) => {
    if (S.places.length < 2 || e.touches.length > 1 || turning) { x0 = null; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; axis = null;
  }, { passive: true });
  zone.addEventListener("touchmove", (e) => {
    if (x0 == null) return;
    const x = e.touches[0].clientX, mx = x - x0, my = e.touches[0].clientY - y0;
    if (!axis && Math.hypot(mx, my) > 10) {
      axis = Math.abs(mx) > Math.abs(my) * 1.2 ? "x" : "y";
      // (from here: the page starts where the finger is, rather than jumping the 10 pixels it took to tell)
      if (axis === "x") { x0 = x; trail = []; main.classList.add("paging"); }
    }
    if (axis !== "x") return;
    e.preventDefault(); dx = x - x0;
    const t = performance.now();
    trail.push([t, x]); while (trail.length > 2 && t - trail[0][0] > 90) trail.shift();
    raf ||= requestAnimationFrame(show);
  }, { passive: false });
  const end = () => {
    if (x0 == null) return;
    x0 = null;
    if (axis !== "x") return;
    cancelAnimationFrame(raf); raf = 0;
    const v = flickSpeed(trail), dir = dx < 0 ? 1 : -1, next = S.cur + dir, from = offset();
    const far = Math.abs(dx) > W() * 0.28, flung = Math.abs(v) > 0.3 && Math.sign(v) === Math.sign(dx) && Math.abs(dx) > 16;
    if (!atEnd(dx) && next >= 0 && next < S.places.length && (far || flung)) turn(dir, from, v);
    else back(from, atEnd(dx) ? v * band(dx) : v);
  };
  // not far enough: back into place from where it was let go, at the speed it was going
  const back = (from, v) => {
    shift(0);
    if (calm.matches || !from) { main.classList.remove("paging"); return; }
    const g = glide(-Math.sign(from) * v, Math.abs(from), "cubic-bezier(0.25, 1, 0.4, 1)");
    Promise.all(cols.map((c) => c.animate([{ translate: `${from}px 0` }, { translate: "0 0" }], g).finished))
      .catch(() => {}).finally(() => { if (!turning) main.classList.remove("paging"); });
  };
  // on to the next: this page off the screen the way it was going, the next one in beside it
  const turn = (dir, from, v) => {
    S.cur += dir; savePlaces();
    // (the page goes on at the finger's speed; the next, with further to come, comes in faster and meets it)
    const w = W(), ease = "cubic-bezier(0.22, 0.8, 0.3, 1)", g = glide(Math.max(0, -dir * v), w - Math.abs(from), ease, w);
    if (calm.matches) { shift(0); main.classList.remove("paging"); go(); return; }
    turning = true;
    const finish = () => { turning = false; main.classList.remove("paging"); for (const k of ["height", "overflow", "viewTransitionName"]) main.style[k] = ""; };
    if (document.startViewTransition) {
      // (just what's on screen is taken along: the rest of the page, out of sight, isn't drawn into the picture)
      main.style.height = `${Math.ceil(innerHeight - main.getBoundingClientRect().top)}px`;
      main.style.overflow = "clip";
      main.style.viewTransitionName = "page";
      const vt = document.startViewTransition(() => { shift(0); go(); });
      vt.ready.then(() => {
        const o = { ...g, fill: "both" };
        // (the page's picture has it where the finger left it: from there, on off the screen)
        document.documentElement.animate({ transform: ["translateX(0)", `translateX(${-dir * w - from}px)`] }, { ...o, pseudoElement: "::view-transition-old(page)" });
        document.documentElement.animate({ transform: [`translateX(${dir * w}px)`, "translateX(0)"] }, { ...o, pseudoElement: "::view-transition-new(page)" });
      }).catch(() => {});
      vt.finished.catch(() => {}).finally(finish);
      return;
    }
    // (no view transitions: this one goes, then the next comes)
    shift(0);
    const out = main.animate([{ translate: `${from}px 0` }, { translate: `${-dir * w}px 0` }], { duration: g.duration * 0.5, easing: "cubic-bezier(0.4, 0.2, 0.9, 0.6)", fill: "forwards" });
    out.finished.then(() => {
      go();
      const inn = main.animate([{ translate: `${dir * w}px 0` }, { translate: "0 0" }], { duration: g.duration, easing: ease });
      out.cancel();
      return inn.finished;
    }).catch(() => {}).finally(finish);
  };
  zone.addEventListener("touchend", end); zone.addEventListener("touchcancel", end);
}
// (one kept so long that it's run out, or all but, has nothing to show: two weeks away, say)
const runOut = (wx) => I.hoursFrom(wx, nowWall(wx.place.offset), 6).length < 6;
function render() {
  showPlace();
  if (S.base && runOut(S.base)) S.base = S.wx = null;
  if (S.base) S.wx = shaped(S.base);
  const wx = S.wx;
  // nothing to show yet: placeholders while it loads, or the hero's message and a way to try again
  if (wx) delete $("main").dataset.empty; else $("main").dataset.empty = S.error ? "error" : "loading";
  $("retry-btn").hidden = !!wx || !S.error;
  if (!wx) {
    $("now-temp").textContent = "–"; delete $("now-temp").dataset.shown; $("now-icon").replaceChildren(); $("place-now").textContent = $("place-temp").textContent = "";
    $("now-cond").textContent = S.error ? "Couldn't get the forecast" : "Loading the forecast…";
    $("now-hl").textContent = S.error ? "You may be offline, or the forecast service didn't answer." : "";
    $("brief").textContent = "";
    for (const id of ["alerts", "insights", "hourly-strip", "hourly-chart", "days", "win-grid", "tiles"]) $(id).replaceChildren();
    $("hourly-strip")._sig = null;
    $("nowcast").hidden = true;
    status(); return;
  }
  const now = nowWall(wx.place.offset);
  if (!S.modeChosen) { const v = viewFor(wx, now); if (v !== S.mode) showMode(v); }
  // (each part drawn by itself: a fault in one, on some odd piece of the forecast, leaves the others as they should be)
  const part = (fn, ...a) => { try { fn(...a); } catch (e) { console.error(e); } };
  const my = ++drawing, key = cell(wx.place.lat, wx.place.lon);
  // (the place drawn again with something new near the top (a warning come in, say) while the page is at the top: what's
  // under it glides down to its new place rather than jumping there; from where each was as last shown (tops, kept
  // once it's been: not measured now, which would lay the page out before it's drawn)
  const was = drawnFor === key && scrollY < 40 && !calm.matches ? tops : null;
  part(sky, wx, now);
  part(hero, wx, now);
  part(pinOnMap, wx, now);
  part(nowcast, wx, now);
  part(cards, wx, now);
  part(nudge);
  part(hourly, wx, now);
  status();
  const rest = () => {
    part(daily, wx, now);
    part(windows, wx, now);
    part(accuracy, wx);
    part(climate, wx, now);
    part(tiles, wx, now);
    balance(`${key}|${!!wx.climate}|${!!wx.skill?.station}`);
  };
  // a place's first drawing, on a phone: what's on the screen first, and the rest (all below it) a moment after, once
  // that's shown, rather than all at once before anything is; unless it's been drawn again meanwhile (all of it then)
  if (drawnFor !== key && !twoCols.matches) { drawnFor = key; requestAnimationFrame(() => setTimeout(() => { if (my === drawing) { rest(); requestAnimationFrame(keepTops); } }, 0)); return; }
  drawnFor = key;
  rest();
  // (where each is now, read as the page is about to be shown, when it's laid out anyway)
  requestAnimationFrame(() => {
    if (my !== drawing) return;
    if (was) for (const [x, t] of was) {
      if (x.hidden || !x.isConnected) continue;
      const top = x.offsetTop, d = t - top;
      if (Math.abs(d) > 2 && top - scrollY < innerHeight) x.animate([{ transform: `translateY(${d}px)` }, { transform: "none" }], { duration: 480, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", composite: "add" });
    }
    keepTops();
  });
}
let drawing = 0, drawnFor = "", tops = null;
addEventListener("resize", () => { tops = null; });
// (where the page's parts are laid out, as shown: once it's been laid out and shown; not as any glide has them meanwhile)
const keepTops = () => setTimeout(() => { tops = new Map([...document.querySelectorAll("main > .col > *")].filter((x) => !x.hidden).map((x) => [x, x.offsetTop])); }, 0);
// A wide screen's two columns kept about level: the radar (after the next 48 hours, or after Right now), the 15 days
// (at the foot of either) and this time of year (under the 15 days, or after the best times) each on whichever side
// does it. Worked out once a place's forecast is in (and again as its climate and its accuracy come), and as the
// window's resized: not as the page is used, so nothing moves under a finger (a list unfolded, say); not with the radar
// full screen. On a narrower one, one column, each in its own place
// (wide: two columns, as styles.css has them; not a phone on its side, its columns one list beside the weather now)
let levelled = "", keyed = "";
const twoCols = matchMedia("(min-width: 980px)"), onSide = matchMedia("(orientation: landscape) and (max-height: 500px) and (min-width: 600px)");
function balance(key = keyed, again = false) {
  const main = $("main"), a = main.querySelector(".col-a"), b = main.querySelector(".col-b"), radar = $("radar"), days = $("daily"), clim = $("climate");
  const wide = twoCols.matches && !onSide.matches, want = `${key}|${wide}`;
  if ((want === levelled && !again) || radar.classList.contains("radar-big")) return;
  levelled = want; keyed = key;
  // (each moved only if it isn't where it goes already: the radar's map, say, isn't taken out and put back for nothing)
  const put = ([r, d, c]) => {
    if (r ? radar.previousElementSibling !== $("hourly") : radar.nextElementSibling !== $("windows")) { if (r) $("hourly").after(radar); else $("windows").before(radar); }
    if (d ? days.parentElement !== a || (days.nextElementSibling && days.nextElementSibling !== clim) : days.parentElement !== b || days.nextElementSibling) (d ? a : b).append(days);
    if (c ? clim.parentElement !== a || clim.nextElementSibling : clim.previousElementSibling !== $("windows")) { if (c) a.append(clim); else $("windows").after(clim); }
  };
  const where = () => [radar, days, clim].map((x) => x.parentElement === a);
  if (!wide) { put([true, true, false]); return; }
  requestAnimationFrame(() => {
    const gap = 16, hs = [radar, days, clim].map((x) => (x.offsetHeight ? x.offsetHeight + gap : 0)), now = where();
    const baseA = a.offsetHeight - hs.reduce((t, x, k) => t + (now[k] ? x : 0), 0), baseB = b.offsetHeight - hs.reduce((t, x, k) => t + (now[k] ? 0 : x), 0);
    const off = (pick) => Math.abs(baseA - baseB + hs.reduce((t, x, k) => t + (pick[k] ? x : -x), 0));
    // (the radar and the 15 days on the left, this time of year under them, where it's as level as any)
    const picks = [[1, 1, 1], [1, 1, 0], [0, 1, 1], [0, 1, 0], [1, 0, 0], [1, 0, 1], [0, 0, 0], [0, 0, 1]].map((x) => x.map(Boolean));
    const best = picks.reduce((x, y) => (off(y) < off(x) ? y : x));
    // (only for a real difference: not back and forth over a few pixels)
    if (off(now) - off(best) > 60) put(best);
  });
}
let resized = 0, wasWide = null;
addEventListener("resize", () => {
  clearTimeout(resized);
  resized = setTimeout(() => { const w = Math.round(innerWidth / 40); if (w !== wasWide && S.wx) { wasWide = w; balance(keyed, true); } }, 250);
});
function status() {
  const wx = S.wx, el = $("status");
  if (!wx) { el.classList.remove("warn"); el.textContent = ""; $("updated").textContent = ""; return; }
  const mins = Math.round((Date.now() - wx.fetchedAt) / 60e3);
  const ago = mins < 1 ? "just now" : mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.floor(mins / 60)} h ago` : `${Math.floor(mins / 1440) === 1 ? "1 day" : `${Math.floor(mins / 1440)} days`} ago`;
  // (said once, not again every minute as the age goes up: that's in the line under the page; "Updating…" only when
  // it was asked for, not each time it refreshes by itself)
  const warn = (S.error || S.stale) && !S.loading && mins > 15, text = warn ? "Couldn't refresh: showing the last forecast." : S.loading && S.asked ? "Updating…" : "";
  el.classList.toggle("warn", warn);
  if (el.textContent !== text) el.textContent = text;
  $("updated").textContent = `Updated ${ago}`;
}

// the top of each sky (styles.css), for the browser's bar to match
const SKY_TOP = { "clear-day": "#1f5fae", "partly-day": "#2c5f99", "cloudy-day": "#43566c", "rain-day": "#303f52", storm: "#1c2130", "snow-day": "#4f6580", fog: "#59626e",
  "clear-night": "#070d22", "partly-night": "#0c1428", "cloudy-night": "#151b27", "rain-night": "#10151f", "snow-night": "#1b2335", dusk: "#1f2b55", dawn: "#24376a" };
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
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", SKY_TOP[s] || "#2b5d96");
  const top = { "clear-day": "#1f5fae", "partly-day": "#2c5f99", "cloudy-day": "#43566c", "rain-day": "#303f52", storm: "#1c2130", "snow-day": "#4f6580", fog: "#59626e", "clear-night": "#070d22", "partly-night": "#0c1428", "cloudy-night": "#151b27", "rain-night": "#10151f", "snow-night": "#1b2335", dusk: "#1f2b55", dawn: "#24376a" }[s];
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", top);
  document.documentElement.style.backgroundColor = top;      // (what shows when the page is pulled past its ends)
}

function hero(wx, now) {
  const f = S.f, c = wx.current || I.hourAt(wx, now), d = I.dayOf(wx, now);
  // (no reading for now, a gap in the hours say: what's there stays)
  if (!c) return;
  // a new temperature rolls in, up if it's warmer, down if it's cooler (as iOS's numbers do)
  const tEl = $("now-temp"), t = f.temp(c.temp);
  if (tEl.textContent !== t) {
    // (by the numbers themselves: a minus, as it's written, isn't one to parseFloat)
    const warmer = !(c.temp < Number(tEl.dataset.v));
    tEl.textContent = t; tEl.dataset.v = String(c.temp);
    // (started again on the next frame, rather than by having the whole page laid out here and now to restart it)
    if (tEl.dataset.shown && !calm.matches) { tEl.classList.remove("roll-up", "roll-down"); requestAnimationFrame(() => tEl.classList.add(warmer ? "roll-up" : "roll-down")); }
    tEl.dataset.shown = "1";
  }
  // (only when it changes: it's moving, and drawn again it would start over)
  const icon = iconOf(c.code, c.isDay), iconEl = $("now-icon");
  if (iconEl.dataset.icon !== icon || !iconEl.firstChild) { iconEl.innerHTML = weatherIcon(icon, 76); iconEl.dataset.icon = icon; }
  $("now-cond").textContent = label(c.code, c.isDay);
  $("place-now").textContent = `${f.temp(c.temp)} · ${label(c.code, c.isDay)}`;
  $("place-temp").textContent = f.temp(c.temp);
  $("now-hl").textContent = d ? `H ${f.temp(d.tmax)}  L ${f.temp(d.tmin)}  ·  Feels like ${f.temp(c.feels)}` : `Feels like ${f.temp(c.feels)}`;
  // (its first sentence, what's coming, in bold; the rest after it)
  // (and written, so read out, only when what it says has changed: not every minute, nor as each part comes in)
  const said = I.headline(wx, now, f), [, lead, rest] = /^(.+?[.!?])\s+(?=[A-Z])(.*)$/s.exec(said) || [, said, ""], brief = $("brief");
  if (brief.dataset.said !== said) { brief.replaceChildren(h("b", {}, lead), rest ? ` ${rest}` : ""); brief.dataset.said = said; }
}

// the place on the radar's map as Apple's Weather map marks it: its temperature and sky in a bubble the colour of how
// warm it is, its name under it
const PIN_HUES = [[-10, [110, 90, 210]], [0, [60, 120, 220]], [10, [58, 112, 196]], [15, [40, 145, 160]], [20, [80, 160, 70]], [25, [222, 148, 40]], [30, [222, 88, 50]], [35, [196, 40, 50]]];
const pinHue = (temp) => {
  const at = PIN_HUES.findIndex(([t]) => t >= temp), k = Math.max(1, at < 0 ? PIN_HUES.length - 1 : at), [t0, a] = PIN_HUES[k - 1], [t1, b] = PIN_HUES[k];
  const f = t1 > t0 ? Math.min(1, Math.max(0, (temp - t0) / (t1 - t0))) : 0;
  return `rgb(${a.map((v, j) => Math.round(v + (b[j] - v) * f)).join(",")})`;
};
// a saved place at a glance (peek), kept a minute: its whole kept forecast is read to get it, not one to read every
// drawing; for one that's never been opened here, its weather now as asked for with the others' (glanceAll)
const glances = new Map();
const glance = (q) => {
  const id = cell(q.lat, q.lon), had = glances.get(id);
  if (had && Date.now() - had.at < 60e3) return had.k;
  const k = peek(q) || store.get("wx:glances")?.[id] || null;
  glances.set(id, { at: Date.now(), k });
  return k;
};
// The saved places with no forecast kept here (added on another visit, say): their weather now, all of them in one
// request, once a half hour at most, kept (wx:glances); then the map's bubbles and the list of places drawn again
let glancedAt = 0;
async function glanceAll() {
  const want = S.places.filter((q) => !peek(q));
  if (!want.length || Date.now() - glancedAt < 30 * 60e3) return;
  glancedAt = Date.now();
  try {
    const q = new URLSearchParams({ latitude: want.map((x) => x.lat).join(","), longitude: want.map((x) => x.lon).join(","), current: "temperature_2m,weather_code,is_day", timezone: "auto" });
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return;
    const j = await r.json(), list = Array.isArray(j) ? j : [j], kept = store.get("wx:glances") || {};
    want.forEach((x, i) => { const c = list[i]?.current; if (c && Number.isFinite(c.temperature_2m)) kept[cell(x.lat, x.lon)] = { temp: c.temperature_2m, code: c.weather_code, isDay: c.is_day === 1, offset: list[i].utc_offset_seconds || 0, hi: null, lo: null, at: Date.now() }; });
    // (those no longer saved let go)
    const saved = new Set(S.places.map((x) => cell(x.lat, x.lon)));
    for (const id of Object.keys(kept)) if (!saved.has(id)) delete kept[id];
    store.set("wx:glances", kept); glances.clear();
    if (S.wx) pinOnMap(S.wx, nowWall(S.wx.place.offset));
    if ($("places").open) drawSaved();
  } catch (_) {}
}
function pinOnMap(wx, now) {
  const c = wx.current || I.hourAt(wx, now), p = place();
  if (!S.radar || !c) return;
  S.radar.mark({ temp: S.f.temp(c.temp), icon: weatherIcon(iconOf(c.code, c.isDay), 22), name: p?.gps ? "My Location" : p?.name || "", colour: pinHue(c.temp) });
  // the other saved places on the map too, their temperature now as the list of them has it, each a way to go to it;
  // and the official warnings' areas, where their services draw them
  const here = cell(wx.place.lat, wx.place.lon);
  glanceAll();
  S.radar.others(S.places.map((q, i) => ({ q, i })).filter(({ q, i }) => i !== S.cur && cell(q.lat, q.lon) !== here).map(({ q, i }) => {
    const k = glance(q);
    return { name: q.gps ? "My Location" : q.name, lat: q.lat, lon: q.lon, temp: k ? S.f.temp(k.temp) : "", colour: k ? pinHue(k.temp) : null, go: () => { S.cur = i; savePlaces(); go(); } };
  }));
  S.radar.warnings(inForce(wx.official).filter((w) => w.areas?.length).map((w) => ({ id: w.id, title: w.event || titleOf(w), colour: colourOf(w), onset: w.onset, expires: w.expires, open: !!w.open, rings: w.areas })));
}
function nowcast(wx, now) {
  const f = S.f, nc = I.nowcast(wx, now, f), box = $("nowcast");
  // the radar says it in a line too
  const quarters = (wx.minutely || []).filter((x) => x.t + 15 * 60e3 > now).length;
  S.radar?.note(nc ? nc.text : quarters >= 4 ? `No rain expected here for the next ${Math.round(quarters / 4) === 1 ? "hour" : `${Math.round(quarters / 4)} hours`}.` : "");
  // (the radar's line only where the card above isn't saying it already: when it's hidden, or the radar's full screen)
  const shown = !(!nc || (!nc.now && nc.startsAt - now > 2 * HOUR));
  $("radar").classList.toggle("said-above", shown);
  if (!shown) { box.hidden = true; return; }
  box.hidden = false;
  $("nowcast-text").textContent = nc.text;
  const m = wx.minutely.filter((x) => x.t + 15 * 60e3 > now), led = (x) => (x.radar ?? 0) >= 0.5;
  // (said where the radar's leading the timing for the first of it: rainmap.js blend)
  $("nowcast-src").hidden = !led(m[0] || {});
  // on the scale it's felt: light, moderate, heavy (under 0.6 mm an hour, to 4, over), so it needs no units
  // (a square root within light, so drizzle still shows; the amounts are in the readout)
  const band = (mmh) => (mmh <= 0 ? 0 : mmh < 0.6 ? Math.sqrt(mmh / 0.6) : mmh < 4 ? 1 + Math.log(mmh / 0.6) / Math.log(4 / 0.6) : Math.min(3, 2 + Math.log(mmh / 4) / Math.log(4)));
  timeChart($("nowcast-chart"), {
    kind: "columns", height: 120, color: COLOR.rain, key: cell(wx.place.lat, wx.place.lon),
    points: m.map((x) => ({ t: x.t, v: band(x.precip * 4), mm: x.precip, radar: led(x) })),
    y: { min: 0, max: 3, ticks: [1, 2, 3], fmt: (v) => ["", "Light", "Moderate", "Heavy"][v], inside: true },
    x: { step: 15 * 60e3, hour: (t) => f.time(t) },
    now, summary: `Rain, every 15 minutes for the next 4 hours, on a scale of light, moderate and heavy. ${nc.text}`,
    tip: (p) => ({ title: p.radar ? `${f.time(p.t)} · radar` : f.time(p.t), rows: [[f.rate(p.mm * 4), p.mm >= 0.05 ? (p.mm * 4 >= 4 ? "heavy" : p.mm * 4 >= 0.6 ? "moderate" : "light") : "dry"]] }),
    table: { head: ["Time", "Rain"], rows: m.map((x) => [f.time(x.t), f.rate(x.precip * 4)]) },
  });
}

function insightCard(c) {
  const tag = c.level === "alert" ? "Alert" : c.level === "warn" ? "Warning" : null, go = moreOf(c);
  return h("article", { class: "ins", "data-level": c.level },
    h("div", { class: "ins-icon", svg: glyph(c.icon, 18) }),
    h("h3", {}, tag ? [h("span", { class: "tag" }, tag), " "] : null, go ? h("button", { class: "ins-open", type: "button", "aria-haspopup": "dialog", onclick: go.open }, c.title) : c.title),
    h("p", {}, c.text));
}
// where an insight says more: its day's sheet, or the sheet of the tile it's about → { label, open } or null
function moreOf(c) {
  const wx = S.wx; if (!wx) return null;
  if (c.day) { const d = wx.daily.find((x) => x.key === c.day); return d ? { label: `${f0(d)} in full`, open: () => openDay(c.day) } : null; }
  const t = c.tile && TILES.find((x) => x[0] === c.tile);
  return t && S.say?.[c.tile] ? { label: c.tile === "sun" ? "Sunrise and sunset" : `${t[1]}, hour by hour`, open: () => openDetail(c.tile) } : null;
}
const f0 = (d) => S.f.day(d.date, nowWall(S.wx.place.offset));
// An official warning: its colour, what it is, who says so and when (all of it in a sheet, from its title)
function officialCard(w, wx, now) {
  const colour = colourOf(w), badge = badgeOf(w);
  return h("article", { class: "ins official", "data-level": colour === "red" ? "alert" : "warn", "data-colour": colour },
    h("div", { class: "ins-icon", svg: glyph(glyphOf(w), 18) }),
    h("h3", {}, badge ? [h("span", { class: "tag" }, badge), " "] : null,
      h("button", { class: "ins-open", type: "button", "aria-haspopup": "dialog", "aria-controls": "warning", onclick: () => openWarning(w) }, titleOf(w))),
    h("p", { class: "ins-from" }, `${w.issuer} · ${spanOf(w, now, S.f, wx.place.offset)}`),
    w.headline ? h("p", {}, w.headline) : null);
}
function openWarning(w) {
  const wx = S.wx, d = $("warning"), badge = badgeOf(w);
  if (!wx) return;
  // (blank lines part its paragraphs; single ones are only where its lines were wrapped; the US's "* WHAT..." as "What: ")
  const paras = (s) => String(s || "").split(/\n\s*\n/).map((x) => x.replace(/\s*\n\s*/g, " ").trim().replace(/^\*\s*([A-Z][A-Z /]*?)\.\.\.\s*/, (m, k) => `${k[0]}${k.slice(1).toLowerCase()}: `))
    .filter(Boolean).map((x) => h("p", {}, x));
  $("warning-title").textContent = titleOf(w);
  d.dataset.colour = colourOf(w);
  $("warning-body").replaceChildren(...[
    h("p", { class: "warn-from" }, badge ? [h("span", { class: "warn-badge" }, badge), " "] : null, w.issuer, w.area ? ` · ${w.area}` : ""),
    h("p", { class: "warn-when" }, spanOf(w, nowWall(wx.place.offset), S.f, wx.place.offset)),
    w.headline ? h("p", { class: "warn-headline" }, w.headline) : null,
    w.impacts?.length ? [h("h3", { class: "sheet-sub" }, "What to expect"), h("ul", { class: "warn-list" }, w.impacts.map((x) => h("li", {}, x)))] : null,
    w.text ? [h("h3", { class: "sheet-sub" }, "Details"), ...paras(w.text)] : null,
    w.instruction ? [h("h3", { class: "sheet-sub" }, "What to do"), ...paras(w.instruction)] : null,
    w.url ? h("p", { class: "warn-link" }, h("a", { href: w.url, target: "_blank", rel: "noopener" }, `${w.issuer} website`)) : null,
    h("p", { class: "credits-note" }, `Issued by ${/Office|Service|Center|Agency/.test(w.issuer) ? "the " : ""}${w.issuer}${w.via ? `, through ${w.via}` : ""}, and shown as issued.`)].flat().filter(Boolean));
  openSheet(d);
}
function cards(wx, now) {
  const all = I.insights(wx, now, S.f, { prev: baseline(wx, now), commute: S.settings.commute });
  // official warnings first; the app's own after, less any an official one already says
  const official = inForce(wx.official), said = covered(official);
  const warn = all.filter((c) => (c.level === "alert" || c.level === "warn") && !said.has(c.icon)), rest = all.filter((c) => c.level !== "alert" && c.level !== "warn");
  const n = official.length + warn.length;
  $("alerts").replaceChildren(...(n ? [h("h2", { class: "sr-only" }, n === 1 ? "Warning" : "Warnings"), ...official.map((w) => officialCard(w, wx, now)), ...warn.map(insightCard)] : []));
  // the app's own, in one card: the first three, and the rest under "N more"
  const shown = S.allInsights ? rest : rest.slice(0, FIRST_INSIGHTS);
  const box = $("insights");
  $("insights-card").hidden = !rest.length;
  box.replaceChildren(...shown.map(insightRow));
  box.nextElementSibling?.remove();
  // (under the list, not in it: a list holds only its items)
  if (rest.length > shown.length) box.after(h("button", { class: "ins-more", type: "button", onclick: () => {
    S.allInsights = true; cards(S.wx, nowWall(S.wx.place.offset));
    // the rest rise in under the first (those on screen: see .hero's), and the first of them has focus (where the button was)
    const more = [...box.children].slice(FIRST_INSIGHTS);
    more.forEach((c, i) => { if (c.getBoundingClientRect().top < innerHeight) { c.classList.add("rise"); c.style.setProperty("--i", String(i)); } });
    more[0]?.querySelector(".ins-head").focus({ preventScroll: true });
  } }, `${rest.length - shown.length} more`, h("span", { svg: glyph("chevron", 14) })));
  requestAnimationFrame(fits);
}
// An insight in its card: its title and a line of what it says (its own short line, where it has one, rather than the
// start of the whole cut off), and where there's more, a tap for the rest (the row opening to it, and closing again)
const FIRST_INSIGHTS = 3;
function insightRow(c) {
  const brief = c.short && c.short !== c.text;
  const row = h("div", { class: `ins-row${brief ? " has-short" : ""}`, role: "listitem", "data-level": c.level },
    h("button", { class: "ins-head", type: "button", "aria-expanded": "false", onclick: () => openRow(row) },
      h("span", { class: "ins-icon", svg: glyph(c.icon, 16) }),
      h("span", { class: "ins-words" }, h("span", { class: "ins-title" }, c.title), brief ? h("span", { class: "ins-short" }, c.short) : null, h("span", { class: "ins-line" }, c.text)),
      h("span", { class: "ins-chev", svg: glyph("chevron", 16) })));
  // (open, a way on to its day or its hours)
  const go = moreOf(c);
  if (go) { row.classList.add("goes"); row.append(h("button", { class: "ins-go", type: "button", "aria-haspopup": "dialog", onclick: go.open }, go.label, h("span", { svg: glyph("chevron", 12) }))); }
  return row;
}
function openRow(row) {
  if (row.classList.contains("whole")) return;
  const open = !row.classList.contains("open"), from = row.offsetHeight;
  row.getAnimations().forEach((a) => a.cancel());
  row.classList.toggle("open", open);
  row.querySelector(".ins-head").setAttribute("aria-expanded", String(open));
  if (calm.matches) return;
  // (closing, all of it stays in sight until the row has folded down to a line)
  const to = row.offsetHeight;
  if (!open) row.classList.add("fold");
  row.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 420, easing: "cubic-bezier(0.32, 0.72, 0, 1)" })
    .finished.then(() => row.classList.remove("fold"), () => row.classList.remove("fold"));
}
// which rows say all they have to in their line (nothing to open), measured again as the card's width changes
let insWidth = 0;
function fits() {
  const box = $("insights");
  insWidth = box.clientWidth;
  // (all measured, then all marked: measuring one after marking another would lay the page out again each time)
  const rows = [...box.querySelectorAll(".ins-row:not(.open)")].map((r) => {
    // (one with a short line always has more to say)
    const l = r.querySelector(".ins-line");
    return [r, !r.classList.contains("has-short") && !r.classList.contains("goes") && l.scrollHeight <= l.clientHeight + 1];
  });
  for (const [r, whole] of rows) {
    const head = r.querySelector(".ins-head");
    r.classList.toggle("whole", whole);
    whole ? head.removeAttribute("aria-expanded") : head.setAttribute("aria-expanded", "false");
  }
}
new ResizeObserver(() => { if ($("insights").clientWidth !== insWidth) fits(); }).observe($("insights"));

function hourly(wx, now) {
  const f = S.f, hrs = I.hoursFrom(wx, now, 48), strip = $("hourly-strip");
  // (the strip again only if what it shows has changed: not for every other part of the forecast arriving, but for
  // any that changes it, the ensembles' odds or the radar's say on the next hours, say)
  const sig = `${cell(wx.place.lat, wx.place.lon)}|${wx.current?.temp}|${wx.current?.code}|${JSON.stringify(f.units)}|${hrs.map((x) => `${x.t},${Math.round(x.temp * 10)},${x.code},${x.isDay ? 1 : 0},${Math.round(x.pop ?? 0)}`).join(";")}`;
  if (strip._sig === sig) { drawHourChart(wx, now, hrs, $("hourly-chart"), S.mode, true); return; }
  strip._sig = sig;
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
  drawHourChart(wx, now, hrs, $("hourly-chart"), S.mode, true);
}

// the chart for some hours (the next 48 on the page, or one day's in its sheet)
// the nights among some hours, as [from, to] (shaded softly on a chart)
function nightsOf(hrs) {
  const nights = [];
  let run = null;
  for (const x of hrs) { if (!x.isDay) { if (!run) run = [x.t, x.t + HOUR]; else run[1] = x.t + HOUR; } else if (run) { nights.push(run); run = null; } }
  if (run) nights.push(run);
  return nights;
}
function drawHourChart(wx, now, hrs, host, mode, showNow) {
  const f = S.f, t = T(), wn = W(), nights = nightsOf(hrs);
  const ens = new Map((wx.ensemble?.hourly || []).map((e) => [e.t, e]));
  const common = { x: { hour: (v) => f.hour(v), day: (v) => f.dayShort(v) }, nights, now: showNow ? now : null, height: 170, key: `${cell(wx.place.lat, wx.place.lon)}:${mode}` };
  const when = (v) => `${f.day(v, now)} ${f.time(v)}`;
  if (mode === "temp") {
    // the ensemble's spread, around the forecast shown (its own middle can sit a little apart, on its coarser grid)
    const pts = hrs.map((x) => { const e = ens.get(x.t); return { t: x.t, v: t(x.temp), lo: e ? t(x.temp + e.p10 - e.p50) : null, hi: e ? t(x.temp + e.p90 - e.p50) : null, x }; });
    const hi = pts.reduce((a, p) => (p.v > a.v ? p : a)), lo = pts.reduce((a, p) => (p.v < a.v ? p : a));
    timeChart(host, { ...common, kind: "line", color: COLOR.temp, points: pts,
      y: { fmt: (v) => f.deg(v) },
      marks: [{ t: hi.t, v: hi.v, text: f.temp(hi.x.temp) }, ...(hi.t !== lo.t ? [{ t: lo.t, v: lo.v, text: f.temp(lo.x.temp) }] : [])],
      summary: `Temperature, hour by hour: from ${f.temp(lo.x.temp)} to ${f.temp(hi.x.temp)}.`,
      tip: (p) => ({ title: when(p.t), rows: [[f.temp(p.x.temp), label(p.x.code, p.x.isDay)], [f.temp(p.x.feels), "feels like"], ...(p.lo != null ? [[Math.round(p.lo) < 0 ? `${f.deg(p.lo)} to ${f.deg(p.hi)}` : `${Math.round(p.lo)}–${f.deg(p.hi)}`, "could be"]] : [])] }),
      table: { head: ["Time", "Temperature", "Feels like"], rows: pts.map((p) => [when(p.t), f.temp(p.x.temp), f.temp(p.x.feels)]) } });
  } else if (mode === "rain") {
    const pts = hrs.map((x) => ({ t: x.t, v: x.pop ?? (x.precip >= 0.1 ? 100 : 0), x }));
    // each spell's rain, over its wettest hour (the wettest spells first, where they're too close for all of them)
    const marks = I.spells(hrs).map((s) => {
      const mm = s.hours.reduce((a, b) => a + (b.precip || 0), 0), top = s.hours.reduce((a, b) => (b.precip > a.precip ? b : a));
      return mm >= 0.3 ? { t: top.t, v: Math.min(100, top.pop ?? 100), text: f.precip(mm), mm, from: s.start } : null;
    }).filter(Boolean).sort((a, b) => b.mm - a.mm);
    timeChart(host, { ...common, kind: "columns", color: COLOR.rain, points: pts, marks,
      y: { min: 0, max: 100, ticks: [0, 50, 100], fmt: (v) => `${v}%` },
      summary: `Chance of rain, hour by hour. ${marks.length ? `Rain from ${[...marks].sort((a, b) => a.from - b.from).map((m) => `${when(Math.max(m.from, now))} (${m.text})`).join(", ")}.` : "Little or no rain expected."}`,
      tip: (p) => ({ title: when(p.t), rows: [[`${Math.round(p.v)}%`, "chance of rain"], [f.precip(p.x.precip), (p.x.snow ?? 0) > 0 ? "expected (snow)" : "expected"]] }),
      table: { head: ["Time", "Chance", "Amount"], rows: pts.map((p) => [when(p.t), `${Math.round(p.v)}%`, f.precip(p.x.precip)]) } });
  } else {
    const pts = hrs.map((x) => ({ t: x.t, v: wn(x.wind), lo: wn(x.wind), hi: wn(Math.max(x.gust ?? x.wind, x.wind)), x }));
    const top = hrs.reduce((a, b) => ((b.gust ?? 0) > (a.gust ?? 0) ? b : a));
    timeChart(host, { ...common, kind: "line", color: COLOR.wind, points: pts,
      y: { min: 0, fmt: (v) => String(Math.round(v)) },
      marks: [{ t: top.t, v: wn(top.gust ?? top.wind), text: `gusts ${f.wind(top.gust)}` }],
      summary: `Wind in ${f.windUnit}, hour by hour, with gusts up to ${f.wind(top.gust)}.`,
      tip: (p) => ({ title: when(p.t), rows: [[f.wind(p.x.wind), `from the ${compassWord(p.x.dir ?? 0)}`], [f.wind(p.x.gust), "gusts"]] }),
      table: { head: ["Time", "Wind", "Gusts", "From"], rows: pts.map((p) => [when(p.t), f.wind(p.x.wind), f.wind(p.x.gust), compassWord(p.x.dir ?? 0)]) } });
  }
}

// the view (temperature, rain or wind) on both switches
function showMode(mode) {
  S.mode = mode;
  for (const seg of [$("hourly-seg"), $("days-seg")]) {
    const tabs = [...seg.children], i = tabs.findIndex((x) => x.dataset.mode === mode);
    tabs.forEach((x, k) => x.setAttribute("aria-selected", String(k === i)));
    seg.style.setProperty("--seg-i", String(i));
  }
}
// until one's chosen, the view the weather calls for (as iOS's Weather picks): rain if it's raining or due within the
// hour, wind if it's blowing a gale, else temperature
function viewFor(wx, now) {
  const nc = I.nowcast(wx, now, S.f), c = wx.current || {};
  return nc && (nc.now || nc.startsAt - now <= HOUR) ? "rain" : (c.gust ?? 0) >= 62 ? "wind" : "temp";
}

function daily(wx, now) {
  const f = S.f, days = wx.daily.filter((d) => d.date >= dayStart(now)).slice(0, 16);
  if (!days.length) return;
  $("daily-n").textContent = `${days.length}-day`;
  const conf = I.confidence(wx);
  const lo = Math.min(...days.map((d) => d.tmin)), hi = Math.max(...days.map((d) => d.tmax)), span = Math.max(1, hi - lo);
  const curT = wx.current?.temp;
  // (in the rain and wind views, each day's hours drawn small: the wind on one scale for all the days)
  const mode = S.mode, hoursOf = (d) => I.hoursBetween(wx, d.date + HOUR, d.date + DAY + HOUR), gTop = Math.max(50, ...days.map((d) => d.gustMax ?? 0));
  $("days").className = `days v-${mode}`;
  // (the first ten; the rest, less certain, under "Show 6 more days")
  const rows = days.slice(0, S.allDays ? days.length : FIRST_DAYS).map((d, i) => {
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
    // (a chance of rain with next to none expected: a trace, not "dry" under its chance)
    const amount = (d.precip ?? 0) >= 0.1 ? f.precip(d.precip) : (d.popMax ?? 0) >= 20 ? "a trace" : "dry";
    const says = mode === "rain" ? `${Math.round(d.popMax ?? 0)}% chance of rain, ${amount}` : mode === "wind" ? `wind up to ${f.wind(d.windMax)}, gusts ${f.wind(d.gustMax)}`
      : `high ${f.temp(d.tmax)}, low ${f.temp(d.tmin)}${pop ? `, ${pop} chance of rain` : ""}`;
    // the temperatures and their range; or when the rain falls, its chance and how much; or the wind and its gusts
    const tail = mode === "rain" ? [h("span", { class: "d-chart", svg: dayRain(hoursOf(d), now) }), h("span", { class: "d-val" }, h("b", { class: "rain" }, `${Math.round((d.popMax ?? 0) / 10) * 10}%`), h("small", {}, amount))]
      : mode === "wind" ? [h("span", { class: "d-chart", svg: dayWind(hoursOf(d), gTop, now) }), h("span", { class: "d-val" }, h("b", {}, String(f.windNum(d.windMax)), h("small", { class: "u" }, ` ${f.windUnit}`)), h("small", {}, `gusts ${f.windNum(d.gustMax)}`))]
      : [h("span", { class: "d-lo" }, f.temp(d.tmin)), bar, h("span", { class: "d-hi" }, f.temp(d.tmax))];
    return h("li", { class: i === 7 ? "far" : null }, i === 7 ? h("span", { class: "far-note" }, "Less certain") : null, h("button", { class: "day-row", type: "button", onclick: () => openDay(d.key), "aria-label": `${f.day(d.date, now)}: ${label(d.code)}, ${says}${unsure ? ", uncertain" : ""}` },
      h("span", { class: "d-name" }, name, h("small", { class: unsure ? "unsure" : "" }, unsure ? "Uncertain" : f.date(d.date))),
      h("span", { class: "d-icon" }, h("span", { svg: weatherIcon(iconOf(d.code, true), 30) }), mode === "temp" ? h("span", { class: "d-pop" }, pop) : null),
      ...tail));
  });
  const list = $("days");
  list.replaceChildren(...rows);
  list.nextElementSibling?.remove();
  // (under the list, not in it, as the insights' "N more" is)
  if (days.length > rows.length) list.after(h("button", { class: "ins-more days-more", type: "button", onclick: () => {
    S.allDays = true; daily(S.wx, nowWall(S.wx.place.offset));
    // the rest rise in where the button was, the first of them with focus
    const more = [...list.children].slice(FIRST_DAYS);
    more.forEach((r, i) => { if (r.getBoundingClientRect().top < innerHeight) { r.classList.add("rise"); r.style.setProperty("--i", String(i)); } });
    more[0]?.querySelector(".day-row").focus({ preventScroll: true });
  } }, `Show ${days.length - rows.length} more days`, h("span", { svg: glyph("chevron", 14) })));
  motion("days", ...rows);
}
const FIRST_DAYS = 10;
// a day's rain, an hour a bar (by when it falls: the hour up to each hour's time), drizzle still showing; the hours gone
// fainter
function dayRain(hs, now) {
  const bars = hs.map((x) => {
    const mm = x.precip || 0, k = (new Date(x.t).getUTCHours() + 23) % 24, ht = mm >= 0.05 ? Math.max(2.5, Math.min(1, Math.sqrt(mm / 4)) * 22) : 1;
    return `<rect x="${k * 4 + 0.5}" y="${(24 - ht).toFixed(1)}" width="3" height="${ht.toFixed(1)}" rx="1"${mm >= 0.05 ? "" : ' class="dry"'}${x.t <= now ? ' opacity="0.45"' : ""}/>`;
  }).join("");
  return `<svg class="dr" viewBox="0 0 96 24" preserveAspectRatio="none" aria-hidden="true">${bars}</svg>`;
}
// a day's wind, hour by hour: its speed a line, its gusts a band above it, on one scale for all the days (top, km/h)
function dayWind(hs, top, now) {
  if (hs.length < 2) return "";
  const X = (x) => (((new Date(x.t).getUTCHours() + 23) % 24) * 4 + 2).toFixed(1), Y = (v) => (23 - Math.min(1, (v || 0) / top) * 21).toFixed(1);
  const line = hs.map((x, i) => `${i ? "L" : "M"}${X(x)} ${Y(x.wind)}`).join(""), band = `${line}${[...hs].reverse().map((x) => `L${X(x)} ${Y(Math.max(x.gust ?? x.wind, x.wind))}`).join("")}z`;
  // (the hours gone, fainter: drawn twice, the second time only from now on)
  const past = hs.filter((x) => x.t <= now), id = `dw${++dwN}`, from = past.length ? X(past[past.length - 1]) : 0;
  const draw = (attrs = "") => `<g${attrs}><path class="band" d="${band}"/><path class="line" d="${line}" vector-effect="non-scaling-stroke"/></g>`;
  return `<svg class="dw" viewBox="0 0 96 24" preserveAspectRatio="none" aria-hidden="true">${past.length ? `<clipPath id="${id}"><rect x="${from}" y="-4" width="${96 - from}" height="32"/></clipPath>${draw(' opacity="0.4"')}${draw(` clip-path="url(#${id})"`)}` : draw()}</svg>`;
}
let dwN = 0;

// The best times: those worth it today or tomorrow, each a tile; those that aren't, named in a line under them (a
// tap shows them too, faded)
function windows(wx, now) {
  const f = S.f, list = I.windows(wx, now, f, { activities: S.settings.activities, extras: S.settings.extras });
  const tile = (w) => h("div", { class: `win${w.rating === "Poor" ? " poor" : ""}` },
    h("div", { class: "win-name" }, h("span", { svg: glyph(w.icon, 16) }), w.name),
    h("div", { class: "win-day" }, h("span", {}, w.start == null ? "Not today or tomorrow" : f.day(w.start, now)), h("span", { class: "win-rate", "data-r": w.rating }, w.rating)),
    // (one that's begun already: from now)
    w.start == null ? null : h("div", { class: "win-time" }, `${w.end && w.start <= now && w.end > now ? "Now" : f.time(w.start)}${w.end ? `–${f.time(w.end)}` : ""}`),
    h("div", { class: "win-text" }, w.text));
  // (none chosen in Settings: no card at all)
  $("windows").hidden = !list.length;
  const good = list.filter((w) => w.rating !== "Poor"), poor = list.filter((w) => w.rating === "Poor");
  const grid = $("win-grid");
  grid.replaceChildren(...good.map(tile), ...(S.allWins ? poor.map(tile) : []));
  $("win-poor")?.remove();
  if (poor.length && !S.allWins) grid.after(h("button", { class: "win-poor", id: "win-poor", type: "button", "aria-label": `Not looking good today or tomorrow: ${poor.map((w) => w.name).join(", ")}. Show them`,
    // (they come in where the line was; the first of them has its focus)
    onclick: () => { S.allWins = true; windows(S.wx, nowWall(S.wx.place.offset)); const w = grid.children[good.length]; if (w) { w.tabIndex = -1; w.focus({ preventScroll: true }); } } },
    h("span", {}, h("b", {}, good.length ? "Not looking good: " : "Nothing looking good today or tomorrow: "), poor.map((w) => w.name).join(", ")), h("span", { svg: glyph("chevron", 14) })));
}

function climate(wx, now) {
  const f = S.f, t = T(), box = $("climate-body");
  if (!wx.climate) {
    const failed = store.get(`clim2:${cell(wx.place.lat, wx.place.lon)}`)?.failedAt;
    box.replaceChildren(h("p", { class: "muted small" }, failed ? "The climate archive is busy; this will fill in later." : "Gathering 30 years of weather…"));
    return;
  }
  const d = I.dayOf(wx, now), c = d && climateOn(wx.climate, d.date);
  if (!c?.tmax) { box.replaceChildren(h("p", { class: "muted small" }, "No climate record for this spot.")); return; }
  const p = rankIn(c.tmax.sorted, d.tmax);
  const lede = h("p", { class: "small" }, `Warmer than ${Math.round(p)}% of days here since ${wx.climate.years[0]}.`);
  const chart = h("div", { class: "range" });
  const ago = yearsAgo(wx.climate, d.date);
  const facts = h("ul", { class: "facts" },
    h("li", {}, h("b", {}, f.temp(c.tmax.mean)), "Normal high"),
    h("li", {}, h("b", {}, f.temp(c.tmin.mean)), "Normal low"),
    c.recordHigh ? h("li", {}, h("b", {}, `${f.temp(c.recordHigh.v)} (${c.recordHigh.year})`), `Warmest ${f.dateLong(d.date)}`) : null,
    c.recordLow ? h("li", {}, h("b", {}, `${f.temp(c.recordLow.v)} (${c.recordLow.year})`), `Coldest ${f.dateLong(d.date)} night`) : null,
    c.wet != null ? h("li", {}, h("b", {}, `${Math.round(c.wet * 100)}%`), "Days with rain") : null,
    ago ? h("li", {}, h("b", {}, `${f.temp(ago.tmax)}, ${ago.rain >= 0.5 ? f.precip(ago.rain) : "dry"}`), "This day last year") : null);
  box.replaceChildren(lede, chart, facts);
  rangeChart(chart, { p10: t(c.tmax.p10), p25: t(c.tmax.p25), p75: t(c.tmax.p75), p90: t(c.tmax.p90), mean: t(c.tmax.mean), value: t(d.tmax), valueLabel: `Today ${f.temp(d.tmax)}`, record: c.recordHigh ? { v: t(c.recordHigh.v), year: c.recordHigh.year } : null,
    fmt: (v) => f.deg(v), summary: `Today's high ${f.temp(d.tmax)} against the normal range for the date: ${f.temp(c.tmax.p10)} to ${f.temp(c.tmax.p90)}, normal ${f.temp(c.tmax.mean)}.` });
}

// the tiles that open, in their order: kind, title, icon
const TILES = [["feels", "Feels like", "heat"], ["wind", "Wind", "wind"], ["humidity", "Humidity", "drop"], ["rain", "Rain", "rain"],
  ["pressure", "Pressure", "gauge"], ["visibility", "Visibility", "eye"], ["uv", "UV index", "uv"], ["air", "Air quality", "air"], ["sea", "Sea", "waves", "wide"],
  ["sun", "Sun", "sunrise"], ["moon", "Moon", "moon"]];
const uvName = (u) => (u < 3 ? "Low" : u < 6 ? "Moderate" : u < 8 ? "High" : u < 11 ? "Very high" : "Extreme");
const airName = (q) => (q <= 20 ? "Good" : q <= 40 ? "Fair" : q <= 60 ? "Moderate" : q <= 80 ? "Poor" : q <= 100 ? "Very poor" : "Extremely poor");
const seaName = (c) => (c == null ? "" : c < 11 ? "Very cold" : c < 15 ? "Cold" : c < 18 ? "Cool" : c < 22 ? "Pleasant" : "Warm");
// a tile of what it's like right now, that opens to its own sheet (openDetail): its title a button that covers the whole tile
function tileFor([kind, title, icon, wide], ...kids) {
  return h("section", { class: `tile opens${wide ? " wide" : ""}`, "data-kind": kind }, h("h3", {}, h("span", { svg: glyph(icon, 14) }),
    h("button", { class: "tile-open", type: "button", "aria-haspopup": "dialog", "aria-controls": "detail", onclick: () => openDetail(kind) }, title),
    h("span", { class: "tile-chev", svg: glyph("chevron", 12) })), ...kids);
}
// a temperature's colour, cold blue to hot red (the 16 days' bars' colours: styles.css .d-fill)
const WARMTH = [[-5, [124, 196, 255]], [7, [142, 230, 168]], [17, [255, 209, 102]], [25, [255, 154, 77]], [32, [255, 93, 93]]];
function warmth(c) {
  const k = WARMTH.findIndex(([t]) => c < t);
  if (k === 0) return `rgb(${WARMTH[0][1]})`;
  if (k < 0) return `rgb(${WARMTH[WARMTH.length - 1][1]})`;
  const [t0, a] = WARMTH[k - 1], [t1, b] = WARMTH[k], q = (c - t0) / (t1 - t0);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * q)).join(",")})`;
}
// a thermometer filled to how warm it feels (in its colour), marked where the actual temperature is: −15° at the
// bulb, 40° at the top
function thermometer(feels, actual) {
  const y = (c) => +(58 - Math.min(1, Math.max(0, (c + 15) / 55)) * 50).toFixed(1), yf = y(feels), ya = y(actual), col = warmth(feels);
  return `<svg class="thermo" viewBox="0 0 44 80" aria-hidden="true"><path class="th-glass" d="M14 10a6 6 0 0 1 12 0v48a10 10 0 1 1 -12 0z"/>`
    + `<rect class="th-fill" x="17" y="${yf}" width="6" height="${(68 - yf).toFixed(1)}" rx="3" fill="${col}"/><circle cx="20" cy="66" r="7" fill="${col}"/>`
    + `<path class="th-mark" d="M29 ${ya}l6 -4v8z"/></svg>`;
}
// a pressure dial, 960 to 1050 hPa round three quarters of a circle, the reading marked, and which way it's going
// in the middle (rising, falling, steady)
function pressureDial(hpa, dp) {
  const q = Math.min(1, Math.max(0, (hpa - 960) / 90)), at = (k, r) => { const a = ((135 + k * 270) * Math.PI) / 180; return [40 + r * Math.cos(a), 40 + r * Math.sin(a)]; };
  let ticks = "";
  for (let i = 0; i <= 36; i++) { const [x1, y1] = at(i / 36, 30), [x2, y2] = at(i / 36, i % 9 ? 34 : 36); ticks += `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`; }
  const [a1, b1] = at(q, 24), [a2, b2] = at(q, 37);
  const way = dp == null || Math.abs(dp) < 1 ? "M32 37h16M32 43h16" : dp > 0 ? "M40 50V30M33 37l7-7 7 7" : "M40 30v20M33 43l7 7 7-7";
  const box = h("div", { svg: `<svg class="dial" viewBox="0 0 80 80" aria-hidden="true"><path class="dl-ticks" d="${ticks}"/>`
    + `<g class="dl-needle-g"><path class="dl-needle" d="M${a1.toFixed(1)} ${b1.toFixed(1)}L${a2.toFixed(1)} ${b2.toFixed(1)}"/></g><path class="dl-way" d="${way}"/></svg>` });
  // (where the needle swings round from, the dial's low end: set here, as the page's CSP allows no style attributes)
  box.firstElementChild.style.setProperty("--sw", `${(-q * 270).toFixed(0)}deg`);
  return box;
}
// the next hours' rain as little bars, one an hour, scaled to the wettest (or to 1 mm, so drizzle stays small)
function rainBars(hrs) {
  const top = Math.max(1, ...hrs.map((x) => x.precip || 0)), w = 240 / Math.max(1, hrs.length);
  const bars = hrs.map((x, i) => { const v = Math.max((x.precip || 0) > 0.05 ? 2.5 : 0.8, ((x.precip || 0) / top) * 26); return `<rect x="${(i * w + 1).toFixed(1)}" y="${(28 - v).toFixed(1)}" width="${(w - 2.5).toFixed(1)}" height="${v.toFixed(1)}" rx="1.5"${(x.precip || 0) > 0.05 ? "" : ' class="dry"'}/>`; }).join("");
  return h("div", { svg: `<svg class="rbars" viewBox="0 0 240 28" preserveAspectRatio="none" aria-hidden="true">${bars}</svg>` });
}
// a bar filled part of the way (0 to 1), and a scale with a knob on it and its ends named
const fillBar = (k, cls) => { const b = h("div", { class: `fbar ${cls}` }), i = h("i"); i.style.width = `${Math.min(100, Math.max(0, k * 100))}%`; b.append(i); return b; };
// the tide over the next day, as a little curve: the water under it, now marked, its highs and lows dotted
function tideCurve(m, now) {
  const pts = m.hourly.filter((x) => x.tide != null && x.t >= now - 2 * HOUR && x.t <= now + 22 * HOUR);
  if (pts.length < 8) return null;
  const t0 = now - 2 * HOUR, lo = Math.min(...pts.map((p) => p.tide)), r = Math.max(0.3, Math.max(...pts.map((p) => p.tide)) - lo);
  const X = (t) => ((t - t0) / (24 * HOUR)) * 160, Y = (v) => 52 - ((v - lo) / r) * 40, n = (v) => v.toFixed(1);
  const P = pts.map((p) => [X(p.t), Y(p.tide)]);
  // (a smooth line through the hours)
  const line = P.map((c, i) => { if (!i) return `M${n(c[0])} ${n(c[1])}`; const a = P[i - 2] || P[i - 1], b = P[i - 1], d = P[i + 1] || c;
    return `C${n(b[0] + (c[0] - a[0]) / 6)} ${n(b[1] + (c[1] - a[1]) / 6)} ${n(c[0] - (d[0] - b[0]) / 6)} ${n(c[1] - (d[1] - b[1]) / 6)} ${n(c[0])} ${n(c[1])}`; }).join("");
  const k = pts.findIndex((p) => p.t > now), a = pts[k - 1], b = pts[k], here = a && b ? a.tide + ((b.tide - a.tide) * (now - a.t)) / (b.t - a.t) : null;
  const dots = m.tides.filter((x) => x.t > pts[0].t && x.t < pts[pts.length - 1].t).map((x) => `<circle class="tc-mark" cx="${n(X(x.t))}" cy="${n(Y(x.h))}" r="2.2"/>`).join("");
  return h("div", { svg: `<svg class="tidec" viewBox="0 0 160 60" aria-hidden="true"><path class="tc-water" d="${line}L${n(P[P.length - 1][0])} 60L${n(P[0][0])} 60z"/><path class="tc-line" pathLength="1" d="${line}"/>${dots}`
    + `${here != null ? `<line class="tc-now" x1="${n(X(now))}" x2="${n(X(now))}" y1="4" y2="60"/><circle class="tc-here" cx="${n(X(now))}" cy="${n(Y(here))}" r="3.6"/>` : ""}</svg>` });
}
// (a knob along a meter: at, how far along, for it to slide in from the start: styles.css knob)
const knob = (pct) => { const i = h("i"); i.style.left = `${pct}%`; i.style.setProperty("--at", String(pct)); return i; };
const scaleBar = (k, cls, ends) => { const m = h("div", { class: `meter ${cls}` }); m.append(knob(Math.min(100, Math.max(0, k * 100)))); return [m, h("div", { class: "ends" }, h("span", {}, ends[0]), h("span", {}, ends[1]))]; };

function tiles(wx, now) {
  const f = S.f, c = wx.current || I.hourAt(wx, now), out = [], d = I.dayOf(wx, now);
  if (!c) return;
  // what each tile says, made afresh wherever it's shown (the tile, and its sheet: openDetail)
  const say = {};
  // feels like: a thermometer filled to it, with the actual temperature marked
  const diff = (c.feels ?? c.temp) - c.temp;
  const why = diff <= -2 ? ((c.wind ?? 0) >= 12 ? `wind makes it feel ${f.delta(diff)} colder` : `it feels ${f.delta(diff)} colder`) : diff >= 2 ? `humidity makes it feel ${f.delta(diff)} warmer` : "close to it";
  say.feels = () => [h("div", { class: "wind-row" }, h("div", { class: "big" }, f.temp(c.feels)), h("div", { svg: thermometer(c.feels ?? c.temp, c.temp) })),
    h("p", { class: "sub" }, `Actual ${f.temp(c.temp)}: ${why}.`)];
  // wind
  const bf = beaufort(c.wind ?? 0), dir = c.dir ?? 0;
  const comp = `<svg class="compass" viewBox="0 0 80 80" aria-hidden="true"><circle class="ring" cx="40" cy="40" r="33"/>${[0, 90, 180, 270].map((a) => `<line class="tick" x1="40" y1="6" x2="40" y2="11" transform="rotate(${a} 40 40)"/>`).join("")}<text x="40" y="20" text-anchor="middle">N</text><text x="62" y="43" text-anchor="middle">E</text><text x="40" y="66" text-anchor="middle">S</text><text x="18" y="43" text-anchor="middle">W</text><g class="needle-g"><path class="needle" transform="rotate(${(dir + 180) % 360} 40 40)" d="M40 14l6 30h-12z"/></g><circle cx="40" cy="40" r="3" fill="#fff"/></svg>`;
  say.wind = () => [h("div", { class: "wind-row" }, h("div", {}, h("div", { class: "big" }, String(f.windNum(c.wind)), h("small", {}, f.windUnit)), h("p", {}, `Gusts ${f.windNum(c.gust)}`)), h("div", { svg: comp })),
    h("p", { class: "sub" }, `${bf.name}, from the ${compassWord(dir)}.`)];
  // humidity: a bar filled to it
  const dew = c.dew, dr = dew == null ? null : Math.round(dew);     // (worded by the dew point as shown: 9.6° shows as 10°, so it's "comfortable")
  // (the air's feel, by its dew point: not "dry", which would sit oddly by a high humidity on a cool day)
  const comfort = dr == null ? "" : dr < 10 ? "Fresh" : dr < 15 ? "Comfortable" : dr < 18 ? "A little humid" : dr < 21 ? "Humid" : "Very humid and oppressive";
  say.humidity = () => [h("div", { class: "big" }, `${Math.round(c.rh ?? 0)}%`), fillBar((c.rh ?? 0) / 100, "wet"), h("p", { class: "sub" }, `Dew point ${f.temp(dew)}. ${comfort}.`)];
  // rain: the last day and the next
  const past = I.hoursBetween(wx, now - DAY, now).reduce((a, x) => a + (x.precip || 0), 0), next = I.hoursBetween(wx, now, now + DAY).reduce((a, x) => a + (x.precip || 0), 0);
  say.rain = () => [h("div", { class: "big" }, f.precip(next)), h("p", {}, "in the next 24 hours"), rainBars(I.hoursBetween(wx, now, now + DAY)), h("p", { class: "sub" }, `${f.precip(past)} in the last 24.`)];
  // pressure: a dial, and which way it's going
  const p3 = I.hourAt(wx, now - 3 * HOUR)?.pressure, dp = c.pressure != null && p3 != null ? c.pressure - p3 : null;
  // (its unit under it: four figures and a dial side by side fill a tile)
  say.pressure = () => [h("div", { class: "wind-row" }, h("div", {}, h("div", { class: "big" }, f.pressure(c.pressure).replace(/ (\S+)$/, "")), h("p", {}, f.pressure(c.pressure).split(" ").pop())), c.pressure != null ? pressureDial(c.pressure, dp) : null),
    h("p", { class: "sub" }, dp == null ? "" : Math.abs(dp) < 1 ? "Steady." : `${dp < 0 ? "Falling" : "Rising"} ${f.pressureDelta(dp)} in 3 hours${dp <= -3 ? ": unsettled" : dp >= 3 ? ": settling" : ""}.`)];
  // visibility: on a scale from fog to clear (by how far, on a log scale: 100 m to 30 km)
  const vis = c.vis;
  say.visibility = () => [h("div", { class: "big" }, f.dist(vis)), ...(vis != null ? scaleBar(Math.log10(Math.max(100, vis) / 100) / Math.log10(300), "clear", ["Fog", "Clear"]) : []),
    h("p", { class: "sub" }, vis == null ? "" : vis >= 20000 ? "Excellent." : vis >= 10000 ? "Good." : vis >= 4000 ? "A little haze." : vis >= 1000 ? "Mist or haze." : "Fog.")];
  // UV
  const todayH = I.hoursBetween(wx, dayStart(now), dayStart(now) + DAY), uvPeak = todayH.reduce((a, x) => ((x.uv ?? 0) > (a?.uv ?? -1) ? x : a), null);
  const uv = c.uv ?? 0, meter = (v, max) => { const m = h("div", { class: "meter" }); m.append(knob(Math.min(100, (v / max) * 100))); return m; };
  say.uv = () => [h("div", { class: "big" }, String(Math.round(uv)), h("small", {}, uvName(uv))), meter(uv, 11),
    h("p", { class: "sub" }, uvPeak && uvPeak.uv >= 1 ? `Peaks at ${Math.round(uvPeak.uv)} (${uvName(uvPeak.uv).toLowerCase()}) around ${f.time(uvPeak.t)}.` : "Low all day.")];
  // air quality and pollen
  if (wx.air?.current?.eaqi != null) {
    const a = wx.air.current, q = a.eaqi;
    const pol = (wx.air.hourly || []).filter((x) => x.t >= now - HOUR && x.t < now + 12 * HOUR);
    const top = ["grass", "birch", "alder", "olive", "ragweed", "mugwort"].map((k) => [k, Math.max(0, ...pol.map((x) => x[k] ?? 0))]).sort((x, y) => y[1] - x[1])[0];
    say.air = () => [h("div", { class: "big" }, String(Math.round(q)), h("small", {}, airName(q))), meter(q, 100),
      h("p", { class: "sub" }, `Fine particles ${a.pm25 != null ? Math.round(a.pm25) : "–"} µg/m³.${top && top[1] >= 10 ? ` ${top[0][0].toUpperCase() + top[0].slice(1)} pollen ${top[1] >= 80 ? "high" : top[1] >= 30 ? "moderate" : "low"}.` : pol.some((x) => x.grass != null) ? " Pollen low." : ""}`)];
  }
  // the sea, by it (data.js shapeMarine): how warm, the waves, and the tide
  if (wx.marine) {
    const m = wx.marine, near = (k) => m.hourly.filter((x) => x[k] != null).reduce((a, x) => (!a || Math.abs(x.t - now) < Math.abs(a.t - now) ? x : a), null);
    const s = near("sst"), w = near("wave"), soon = m.tides.filter((x) => x.t > now).slice(0, 2);
    const at = (t) => (f.day(t, now) === "Today" ? f.time(t) : `${f.day(t, now).toLowerCase()} ${f.time(t)}`);
    const tide = soon.length ? `${soon[0].high ? "Rising" : "Falling"}: ${soon.map((x, i) => `${x.high ? (i ? "high" : "High") : i ? "low" : "Low"} ${at(x.t)}`).join(", ")}.` : "";
    say.sea = () => [h("div", { class: "sea-row" },
      h("div", {}, s ? h("div", { class: "big" }, f.temp(s.sst), h("small", {}, seaName(s.sst))) : h("div", { class: "big" }, f.height(w?.wave)),
        w ? h("p", {}, `Waves ${f.height(w.wave)}${w.waveDir != null ? `, from the ${compassWord(w.waveDir)}` : ""}`) : null),
      tideCurve(m, now)),
      h("p", { class: "sub" }, tide)];
  }
  // the sun: when it next sets or rises, its path across the sky (and under it, at night); in its sheet, today's
  // times and the week's
  const more = {};
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
      up ? `<path class="done" pathLength="1" d="${done}"/><circle class="sun" cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="6"/>`
        : below ? `<path class="under" d="M180 70A80 11 0 0 1 20 70"/><circle class="sun down" cx="${below[0].toFixed(1)}" cy="${below[1].toFixed(1)}" r="5"/>` : ""}</svg>`;
    // (to five minutes an hour or more ahead; to the minute under that, "In 1 min" at the last)
    const until = (t) => { const m = Math.max(1, Math.round((t - now) / 60e3)); return f.dur((m >= 60 ? Math.round(m / 5) * 5 : m) * 60); };
    const nextAt = up ? set : night != null ? n1 : null;
    const change = (a, b) => (a?.daylight && b?.daylight ? ` (${b.daylight < a.daylight ? "−" : "+"}${Math.abs(Math.round((b.daylight - a.daylight) / 60))} min)` : "");
    // (and the sunset, against yesterday's: "17:48 (2 min earlier)")
    const moved = (a, b) => { const m = a?.sunset && b?.sunset ? Math.round(((b.sunset - b.date) - (a.sunset - a.date)) / 60e3) : 0; return m ? ` (${Math.abs(m)} min ${m < 0 ? "earlier" : "later"})` : ""; };
    say.sun = () => [h("div", { class: "big" }, nextAt ? f.time(nextAt) : f.dur(d.daylight), h("small", {}, nextAt ? (up ? "Sunset" : "Sunrise") : "daylight")), h("div", { class: "sun-arc", svg }),
      h("p", { class: "sub" }, nextAt ? `In ${until(nextAt)}. ${up ? `Sunrise ${f.time(rise)}` : `Sunset ${f.time(now >= set ? set : setBefore)}`}.` : "")];
    more.sun = () => {
      const kv = (rows) => h("dl", { class: "kv" }, ...rows.filter((r) => r[1]).flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]));
      const week = wx.daily.slice(wx.daily.indexOf(d) + 1, wx.daily.indexOf(d) + 8).filter((x) => x.sunrise && x.sunset);
      return [h("h3", { class: "day-section" }, "Today"), kv([
        ["First light", sk?.dawn && f.time(sk.dawn)], ["Sunrise", rise && f.time(rise)],
        ["Morning golden hour", rise && sk?.goldenAm?.[1] && `${f.time(rise)}–${f.time(sk.goldenAm[1])}`], ["Evening golden hour", sk?.goldenPm?.[0] && set && `${f.time(sk.goldenPm[0])}–${f.time(set)}`],
        ["Sunset", set && `${f.time(set)}${moved(y, d)}`], ["Dark by", sk?.dusk && f.time(sk.dusk)], ["Daylight", d.daylight && `${f.dur(d.daylight)}${change(y, d)}`]]),
        week.length ? [h("h3", { class: "day-section" }, "The week ahead"), kv(week.map((x) => [f.day(x.date, now), `${f.time(x.sunrise)}–${f.time(x.sunset)} (${f.dur(x.daylight)})`]))] : null].flat().filter(Boolean);
    };
    // the moon: how much of it's lit, when it next rises or sets, and the next full or new moon; in its sheet, all of
    // that and the week's
    if (sk) {
      const ph = sk.phase, nx = nextPhases(now - (sk.offset || 0) * 1000), toWall = (x) => x + (sk.offset || 0) * 1000;
      // (a day the Moon doesn't rise or set: when it next does, tomorrow's)
      const after = next && I.skyFor(wx, next.key);
      const moonAt = (t, k) => (t ? f.time(t) : after?.[k] ? `${f.day(after[k], now)} ${f.time(after[k])}` : "Not today");
      const rel = (t) => { const w = f.day(t, now); return w === "Today" ? f.time(t) : `${/^(Tomorrow|Yesterday)$/.test(w) ? w.toLowerCase() : w} ${f.time(t)}`; };
      const ev = [[sk.moonrise, "Rises"], [sk.moonset, "Sets"], [after?.moonrise, "Rises"], [after?.moonset, "Sets"]].filter(([t]) => t && t > now).sort((a, b) => a[0] - b[0])[0];
      const phase = [[nx.full, "Full Moon"], [nx.new, "New Moon"]].filter(([t]) => t).sort((a, b) => a[0] - b[0])[0];
      const lit = (p) => `${Math.round(p.lit * 100)}%`;
      say.moon = () => [h("div", { class: "moon-row" }, h("span", { svg: moonIcon(ph.lit, ph.waxing, 44, wx.place.lat < 0) }), h("div", {}, h("div", { class: "big" }, lit(ph)), h("p", {}, ph.name))),
        h("p", { class: "sub" }, [ev && `${ev[1]} ${rel(ev[0])}.`, phase && `${phase[1]} ${mid(f.day(toWall(phase[0]), now))}.`].filter(Boolean).join(" "))];
      more.moon = () => {
        const days = wx.daily.slice(wx.daily.indexOf(d) + 1, wx.daily.indexOf(d) + 8).map((x) => [x, I.skyFor(wx, x.key)]).filter(([, k]) => k);
        return [h("h3", { class: "day-section" }, "Tonight"), h("dl", { class: "kv" },
          h("dt", {}, "Moonrise"), h("dd", {}, moonAt(sk.moonrise, "moonrise")), h("dt", {}, "Moonset"), h("dd", {}, moonAt(sk.moonset, "moonset")),
          h("dt", {}, "Lit"), h("dd", {}, `${lit(ph)}, ${ph.name.toLowerCase()}`),
          nx.full ? [h("dt", {}, "Full Moon"), h("dd", {}, `${f.day(toWall(nx.full), now)}${toWall(nx.full) - now > 6 * DAY ? "" : ` ${f.time(toWall(nx.full))}`}`)] : null,
          nx.new ? [h("dt", {}, "New Moon"), h("dd", {}, f.day(toWall(nx.new), now))] : null),
          days.length ? [h("h3", { class: "day-section" }, "The week ahead"), h("dl", { class: "kv moons" }, ...days.flatMap(([x, k]) => [h("dt", {}, f.day(x.date, now)),
            h("dd", {}, h("span", { svg: moonIcon(k.phase.lit, k.phase.waxing, 16, wx.place.lat < 0) }), `${lit(k.phase)}${k.moonrise ? `, rises ${f.time(k.moonrise)}` : ""}`)]))] : null].flat().filter(Boolean);
      };
    }
  }
  for (const t of TILES) if (say[t[0]]) out.push(tileFor(t, ...say[t[0]]()));
  S.say = say; S.more = more;
  $("tiles").replaceChildren(...out);
  motion("tiles", ...out);
}

/* ---------- a tile, in full ---------- */
// A tile in its own sheet: what it says now (as the tile has it), the hours around now on a chart (for the wind, which
// way it'll blow too), and a line on what it means
const ABOUT = {
  feels: () => "How warm it feels on the skin: the temperature with the wind's chill, the air's dampness and the sun's warmth taken into account.",
  wind: () => "Its speed 10 m up, averaged over ten minutes. Gusts are its strongest few seconds.",
  humidity: (f) => `The dew point says best how muggy it is: under ${f.temp(10)} it's dry and fresh, from about ${f.temp(16)} humid, and from ${f.temp(20)} oppressive.`,
  rain: () => "What's expected to fall each hour (snow as its water).",
  pressure: (f) => `Falling pressure tends to bring cloud, wind and rain, and rising pressure settled weather. ${f.pressureDelta(3)} or more in 3 hours is quick.`,
  visibility: (f) => `How far you can see: under ${f.dist(1000)} is fog, up to ${f.dist(4000)} mist or haze, and over ${f.dist(10000)} good.`,
  uv: () => "From 3, sun cream and shade around the middle of the day; from 6, cover up; from 8, keep out of the midday sun.",
  air: () => "The European Air Quality Index: to 20 good, 40 fair, 60 moderate, 80 poor and 100 very poor; over that, extremely poor.",
  sun: () => "Golden hour: the sun low in the sky, its light soft and warm. Dark by: the end of twilight, when it's too dark to read outdoors. Worked out on your phone from where the place is.",
  moon: () => "Worked out on your phone from the Moon's orbit. Its rise and set are over a flat horizon: hills and buildings make it later to appear and sooner to go.",
  sea: (f, wx) => `From an ocean model about ${f.dist((wx.marine?.km || 1) * 1000)} offshore: a guide to the sea, not a tide table, and not for navigation. Tide times can be out by an hour or so on the coast, and heights are about mean sea level; waves are the average height of the biggest third.`,
};
// the tiles there are to open, in their order (air quality only where it's known)
const detailKinds = () => TILES.map((x) => x[0]).filter((k) => S.say?.[k]);
function stepDetail(n, quiet = false) {
  if (!S.wx || !$("detail").open) return;
  const kinds = detailKinds(), next = kinds[kinds.indexOf(S.detailKind) + n];
  if (next) openDetail(next, quiet ? 0 : n);
}
function openDetail(kind, dir = 0) {
  const wx = S.wx, say = S.say?.[kind];
  if (!wx || !say) return;
  S.detailKind = kind;
  const f = S.f, now = nowWall(wx.place.offset), [, title, icon] = TILES.find((x) => x[0] === kind);
  const when = (v) => `${f.day(v, now)} ${f.time(v)}`, hrs = I.hoursFrom(wx, now, 48);
  const chart = h("div"), chart2 = h("div"), kids = [h("div", { class: "detail-now" }, ...say())];
  const section = (text) => h("h3", { class: "day-section" }, text);
  let draw = null;
  // a chart of some hours: the nights shaded, now marked
  const plot = (hours, o, host = chart) => () => timeChart(host, { x: { hour: (v) => f.hour(v), day: (v) => f.dayShort(v) }, nights: nightsOf(hours), now, height: 180, key: `${cell(wx.place.lat, wx.place.lon)}:${kind}`, ...o });
  if (kind === "feels") {
    const t = T(), pts = hrs.map((x) => { const fl = x.feels ?? x.temp; return { t: x.t, v: t(fl), lo: t(Math.min(fl, x.temp)), hi: t(Math.max(fl, x.temp)), x }; });
    const hi = pts.reduce((a, p) => (p.v > a.v ? p : a)), lo = pts.reduce((a, p) => (p.v < a.v ? p : a));
    kids.push(section("Next 48 hours"), chart, h("p", { class: "chart-note" }, "Shaded: the difference from the actual temperature."));
    draw = plot(hrs, { kind: "line", color: COLOR.temp, bandColor: "#b8c6dc", points: pts, y: { fmt: (v) => f.deg(v) },
      marks: [{ t: hi.t, v: hi.v, text: f.temp(hi.x.feels) }, ...(hi.t !== lo.t ? [{ t: lo.t, v: lo.v, text: f.temp(lo.x.feels) }] : [])],
      summary: `Feels like, hour by hour: from ${f.temp(lo.x.feels)} to ${f.temp(hi.x.feels)}.`,
      tip: (p) => ({ title: when(p.t), rows: [[f.temp(p.x.feels), "feels like"], [f.temp(p.x.temp), "actual"], [f.wind(p.x.wind), "wind"]] }),
      table: { head: ["Time", "Feels like", "Actual"], rows: pts.map((p) => [when(p.t), f.temp(p.x.feels), f.temp(p.x.temp)]) } });
  } else if (kind === "wind") {
    // which way it'll blow, every three hours for a day: arrows going the way it goes
    const every = hrs.filter((_, i) => i % 3 === 0).slice(0, 8);
    const ways = h("div", { class: "ways", role: "list", "aria-label": "Wind every three hours" }, ...every.map((x) => h("div", { class: "way", role: "listitem", "aria-label": `${f.time(x.t)}: ${f.wind(x.wind)} from the ${compassWord(x.dir ?? 0)}` },
      h("span", { class: "w-time" }, f.hour(x.t)),
      h("span", { class: "w-arrow", svg: `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><g transform="rotate(${Math.round(((x.dir ?? 0) + 180) % 360)} 12 12)"><path d="M12 19V5M6.5 10.5 12 5l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></g></svg>` }),
      h("b", {}, String(f.windNum(x.wind))))));
    kids.push(section("Next 48 hours"), chart, section(`Which way, every 3 hours (${f.windUnit})`), ways);
    draw = () => drawHourChart(wx, now, hrs, chart, "wind", true);
  } else if (kind === "humidity") {
    const pts = hrs.map((x) => ({ t: x.t, v: x.rh ?? 0, x }));
    kids.push(section("Next 48 hours"), chart);
    draw = plot(hrs, { kind: "line", color: "#4C9BE8", points: pts, y: { min: 0, max: 100, ticks: [0, 50, 100], fmt: (v) => `${v}%` },
      summary: `Humidity, hour by hour, between ${Math.round(Math.min(...pts.map((p) => p.v)))}% and ${Math.round(Math.max(...pts.map((p) => p.v)))}%.`,
      tip: (p) => ({ title: when(p.t), rows: [[`${Math.round(p.v)}%`, "humidity"], [f.temp(p.x.dew), "dew point"]] }),
      table: { head: ["Time", "Humidity", "Dew point"], rows: pts.map((p) => [when(p.t), `${Math.round(p.v)}%`, f.temp(p.x.dew)]) } });
  } else if (kind === "rain") {
    // the last day and the next two, hour by hour
    const span = I.hoursBetween(wx, now - DAY, now + 2 * DAY), inch = f.units.precip === "in", amt = (mm) => (inch ? mm / 25.4 : mm);
    const pts = span.map((x) => ({ t: x.t, v: amt(x.precip || 0), x })), wet = span.reduce((a, x) => ((x.precip || 0) > (a.precip || 0) ? x : a), span[0]);
    kids.push(section("The last 24 hours and the next 48"), chart);
    draw = plot(span, { kind: "columns", color: COLOR.rain, points: pts, y: { min: 0, fmt: (v) => (inch ? v.toFixed(2) : String(Math.round(v * 10) / 10)) },
      marks: wet && (wet.precip || 0) >= 0.3 ? [{ t: wet.t, v: amt(wet.precip), text: f.precip(wet.precip) }] : [],
      summary: `Rain each hour, from a day ago to two days ahead${wet && (wet.precip || 0) >= 0.1 ? `; the wettest hour ${when(wet.t)}, ${f.precip(wet.precip)}` : ": little or none"}.`,
      tip: (p) => ({ title: when(p.t), rows: [[f.precip(p.x.precip), p.t < now ? "fell" : "expected"], ...(p.t >= now && p.x.pop != null ? [[`${Math.round(p.x.pop)}%`, "chance"]] : [])] }),
      table: { head: ["Time", "Rain"], rows: pts.map((p) => [when(p.t), f.precip(p.x.precip)]) } });
  } else if (kind === "pressure") {
    const span = I.hoursBetween(wx, now - DAY, now + 2 * DAY).filter((x) => x.pressure != null), u = f.units.pressure;
    const conv = (p) => (u === "inhg" ? p * 0.02953 : u === "mmhg" ? p * 0.750062 : p), pts = span.map((x) => ({ t: x.t, v: conv(x.pressure), x }));
    const first = span[0], last = span[span.length - 1];
    kids.push(section("The last 24 hours and the next 48"), chart);
    draw = plot(span, { kind: "line", color: "#9B8CF2", points: pts, y: { fmt: (v) => (u === "inhg" ? v.toFixed(2) : String(Math.round(v))) },
      summary: first && last ? `Pressure from ${f.pressure(first.pressure)} a day ago to ${f.pressure(last.pressure)} two days ahead.` : "Pressure, hour by hour.",
      tip: (p) => ({ title: when(p.t), rows: [[f.pressure(p.x.pressure), "pressure"]] }),
      table: { head: ["Time", "Pressure"], rows: pts.map((p) => [when(p.t), f.pressure(p.x.pressure)]) } });
  } else if (kind === "visibility") {
    const mi = f.units.wind === "mph", far = (m) => (mi ? m / 1609.34 : m / 1000), pts = hrs.filter((x) => x.vis != null).map((x) => ({ t: x.t, v: far(x.vis), x }));
    kids.push(section("Next 48 hours"), chart);
    draw = plot(hrs, { kind: "line", color: "#7FB8D9", points: pts, y: { min: 0, fmt: (v) => `${Math.round(v)}` },
      summary: `Visibility in ${mi ? "miles" : "kilometres"}, hour by hour.`,
      tip: (p) => ({ title: when(p.t), rows: [[f.dist(p.x.vis), "visibility"]] }),
      table: { head: ["Time", "Visibility"], rows: pts.map((p) => [when(p.t), f.dist(p.x.vis)]) } });
  } else if (kind === "uv") {
    // today and tomorrow, from midnight
    const span = I.hoursBetween(wx, dayStart(now), dayStart(now) + 2 * DAY), pts = span.map((x) => ({ t: x.t, v: x.uv ?? 0, x }));
    const peaks = [0, 1].map((k) => span.filter((x) => x.t >= dayStart(now) + k * DAY && x.t < dayStart(now) + (k + 1) * DAY).reduce((a, x) => ((x.uv ?? 0) > (a?.uv ?? -1) ? x : a), null)).filter((x) => x && x.uv >= 1);
    kids.push(section("Today and tomorrow"), chart);
    draw = plot(span, { kind: "columns", color: "#E0A100", points: pts, y: { min: 0, max: Math.max(8, Math.ceil(Math.max(...pts.map((p) => p.v)))), fmt: (v) => String(Math.round(v)) },
      marks: peaks.map((x) => ({ t: x.t, v: x.uv, text: String(Math.round(x.uv)) })),
      summary: `UV index, hour by hour, today and tomorrow.${peaks.length ? ` Peaks: ${peaks.map((x) => `${Math.round(x.uv)} at ${f.time(x.t)} ${f.day(x.t, now).toLowerCase()}`).join("; ")}.` : " Low throughout."}`,
      tip: (p) => ({ title: when(p.t), rows: [[String(Math.round(p.v)), uvName(p.v).toLowerCase()]] }),
      table: { head: ["Time", "UV index"], rows: pts.map((p) => [when(p.t), String(Math.round(p.v))]) } });
  } else if (kind === "air") {
    const span = (wx.air?.hourly || []).filter((x) => x.t >= now - HOUR && x.t < now + 2 * DAY && x.eaqi != null), pts = span.map((x) => ({ t: x.t, v: x.eaqi, x }));
    if (pts.length > 3) {
      kids.push(section("Next 48 hours"), chart);
      draw = plot(hrs, { kind: "line", color: "#5FC08A", points: pts, y: { min: 0, fmt: (v) => String(Math.round(v)) },
        summary: `Air quality (the European index), hour by hour, between ${Math.round(Math.min(...pts.map((p) => p.v)))} and ${Math.round(Math.max(...pts.map((p) => p.v)))}.`,
        tip: (p) => ({ title: when(p.t), rows: [[String(Math.round(p.v)), airName(p.v).toLowerCase()], ...(p.x.pm25 != null ? [[`${Math.round(p.x.pm25)} µg/m³`, "fine particles"]] : [])] }),
        table: { head: ["Time", "Index", "Fine particles"], rows: pts.map((p) => [when(p.t), String(Math.round(p.v)), p.x.pm25 != null ? `${Math.round(p.x.pm25)} µg/m³` : "–"]) } });
    }
  } else if (kind === "sun" || kind === "moon") {
    kids.push(...(S.more?.[kind]?.() || []));
  } else if (kind === "sea") {
    // the tide for two days, its highs and lows marked with their times; the waves alongside
    const m = wx.marine, span = m.hourly.filter((x) => x.t >= now - HOUR && x.t <= now + 2 * DAY), feet = f.units.temp === "f", ht = (v) => (feet ? v * 3.28084 : v);
    const tp = span.filter((x) => x.tide != null).map((x) => ({ t: x.t, v: ht(x.tide), x })), wp = span.filter((x) => x.wave != null).map((x) => ({ t: x.t, v: ht(x.wave), x }));
    const turns = m.tides.filter((x) => x.t > now && x.t <= now + 2 * DAY), say1 = (x) => `${x.high ? "High" : "Low"} ${when(x.t)}`;
    const fmt = (v) => { const n = feet ? Math.round(v) : Math.round(v * 10) / 10; return `${n < 0 ? "−" : ""}${feet ? Math.abs(n) : Math.abs(n).toFixed(1)}`; }, unit = feet ? "ft" : "m";
    const draws = [];
    if (tp.length > 6) {
      const lo = Math.min(...tp.map((p) => p.v)), hi = Math.max(...tp.map((p) => p.v)), r = Math.max(0.3, hi - lo);
      kids.push(section(`Tide, next 48 hours (${unit})`), chart);
      draws.push(plot(hrs, { kind: "line", color: "#5AC8FA", points: tp, y: { min: lo - r * 0.2, max: hi + r * 0.35, fmt },
        marks: turns.map((x) => ({ t: x.t, v: ht(x.h), text: f.time(x.t) })),
        summary: turns.length ? `The tide over the next two days: ${turns.map(say1).join("; ")}.` : "The tide over the next two days.",
        tip: (p) => ({ title: when(p.t), rows: [[f.height(p.x.tide), "tide"]] }),
        table: { head: ["Time", "Tide"], rows: tp.map((p) => [when(p.t), f.height(p.x.tide)]) }, key: `${cell(wx.place.lat, wx.place.lon)}:tide` }));
      // (and their times, day by day: the heights are the chart's, about mean sea level, not a tide table's)
      const days = [...new Set(turns.map((x) => f.day(x.t, now)))];
      if (turns.length) kids.push(h("dl", { class: "kv tides" }, ...days.flatMap((d) => [h("dt", {}, d), h("dd", {}, turns.filter((x) => f.day(x.t, now) === d).map((x) => `${x.high ? "High" : "Low"} ${f.time(x.t)}`).join(" · "))])));
    }
    if (wp.length > 6) {
      const top = wp.reduce((a, p) => (p.v > a.v ? p : a));
      kids.push(section(`Waves, next 48 hours (${unit})`), chart2);
      draws.push(plot(hrs, { kind: "line", color: "#4C9BE8", points: wp, y: { min: 0, fmt },
        marks: [{ t: top.t, v: top.v, text: f.height(top.x.wave) }],
        summary: `Wave height, hour by hour: highest ${f.height(top.x.wave)} ${when(top.t)}.`,
        tip: (p) => ({ title: when(p.t), rows: [[f.height(p.x.wave), "waves"], ...(p.x.period != null ? [[`${Math.round(p.x.period)} s`, "apart"]] : []), ...(p.x.waveDir != null ? [[compassWord(p.x.waveDir), "from"]] : [])] }),
        table: { head: ["Time", "Waves", "From"], rows: wp.map((p) => [when(p.t), f.height(p.x.wave), p.x.waveDir != null ? compassWord(p.x.waveDir) : "–"]) }, key: `${cell(wx.place.lat, wx.place.lon)}:waves` }, chart2));
    }
    draw = () => draws.forEach((d) => d());
  }
  kids.push(h("p", { class: "detail-about" }, ABOUT[kind](f, wx)));
  $("detail-title").replaceChildren(h("span", { class: "dt-icon", svg: glyph(icon, 18) }), title);
  // (which of them it is: a swipe sideways, or the arrow keys, for the one before or after)
  const kinds = detailKinds();
  $("detail-dots").replaceChildren(...kinds.map((k) => h("i", { class: k === kind ? "on" : null })));
  const body = $("detail-body");
  body.replaceChildren(...kids);
  const dlg = $("detail");
  if (!dlg.open) openSheet(dlg);
  dlg.querySelector(".sheet-body").scrollTop = 0;
  if (dir && !calm.matches) { body.classList.remove("from-left", "from-right"); void body.offsetWidth; body.classList.add(dir > 0 ? "from-right" : "from-left"); }
  if (draw) requestAnimationFrame(draw);
}

/* ---------- one day, in full ---------- */
// how close each model has been here (weather/skill.js, from the nearest airport's reports)
function accuracy(wx) {
  const f = S.f, box = $("accuracy-body"), k = wx.skill, note = (t) => h("p", { class: "small muted" }, t);
  // (only where there's a station to check against: nothing to say otherwise)
  $("accuracy").hidden = !k?.station;
  if (!k?.station) { box.replaceChildren(); return; }
  const st = k.station;
  if (!k.skill) { box.replaceChildren(note(k.obsDays >= MIN_DAYS ? `Not enough past forecasts to compare with ${st.name}'s reports yet.` : `Recording ${st.name}'s reports: ${k.obsDays} of ${MIN_DAYS} days.`)); return; }
  const s = k.skill;
  box.replaceChildren(...[
    h("p", { class: "small muted" }, `${st.name} (${f.dist(st.km * 1000)}) · last ${s.days} days`),
    h("table", { class: "models acc" }, h("caption", { class: "sr-only" }, "Each model's average error and lean, next-day forecasts"),
      h("tr", {}, h("th", { scope: "col" }, "Model"), h("th", { scope: "col" }, "Highs"), h("th", { scope: "col" }, "Lows"), h("th", { scope: "col" }, "Leans")),
      ...s.models.map((m, i) => h("tr", {}, h("td", {}, m.name, i === 0 ? h("span", { class: "best" }, "Best") : null), h("td", {}, `±${f.deltaFine(m.hiMae)}`),
        h("td", {}, m.loMae != null ? `±${f.deltaFine(m.loMae)}` : "–"), h("td", {}, Math.abs(m.hiBias) >= 0.5 ? `${f.deltaFine(m.hiBias)} ${m.hiBias > 0 ? "warm" : "cold"}` : "–")))),
    s.days < TUNE_DAYS ? h("p", { class: "chart-note" }, `Tuning starts at ${TUNE_DAYS} days.`) : null,
    tunedToo(k.local) ? h("p", { class: "chart-note" }, `Also tuned here: ${tunedToo(k.local)}.`) : null].filter(Boolean));
}

// what else the airport's reports have the hours tuned for (skill.js localSkill), in words: "nights 1.2° cooler, wind
// 15% stronger" (only what makes a difference worth saying)
function tunedToo(l) {
  if (!l || S.settings.tune === false) return "";
  const f = S.f, out = [], avg = (ks) => ks.reduce((a, k) => a + l.temp[k], 0) / ks.length;
  for (const [name, ks] of [["nights", [7, 0, 1]], ["mornings", [2, 3]], ["afternoons", [4, 5]], ["evenings", [6]]]) {
    const e = avg(ks);
    if (Math.abs(e) >= 0.5) out.push(`${name} ${f.deltaFine(e)} ${e > 0 ? "cooler" : "warmer"}`);
  }
  if (Math.abs(l.dew) >= 0.5) out.push(`dew point ${f.deltaFine(l.dew)} ${l.dew > 0 ? "lower" : "higher"}`);
  for (const [name, r] of [["wind", l.wind], ["gusts", l.gust]]) if (Math.abs(r - 1) >= 0.08) out.push(`${name} ${Math.round(Math.abs(r - 1) * 100)}% ${r > 1 ? "stronger" : "lighter"}`);
  return out.join(", ");
}
// One day in full, in its sheet; the days along the top to move between (or a swipe sideways, or the arrow keys)
// a day's name and its date, once: "Tomorrow, 22 October", "Wednesday, 28 October" (f.day dates those a week out itself)
const dayTitle = (w, now) => { const n = S.f.day(w, now); return `${/\d/.test(n) ? S.f.dayName(w) : n}, ${S.f.dateLong(w)}`; };
// Today, Tomorrow and Yesterday mid-sentence: "Full Moon tomorrow."
const mid = (s) => s.replace(/^(Today|Tomorrow|Yesterday)\b/, (m) => m.toLowerCase());
function openDay(key, dir = 0) {
  const wx = S.wx; if (!wx) return;
  const f = S.f, now = nowWall(wx.place.offset), d = wx.daily.find((x) => x.key === key); if (!d) return;
  S.dayKey = key;
  $("day-title").textContent = dayTitle(d.date, now);
  const days = sheetDays(wx, now), strip = $("day-strip"), inStrip = strip.contains(document.activeElement);
  strip.replaceChildren(...days.map((x, i) => h("button", { type: "button", class: "ds-day", "aria-current": x.key === key ? "true" : null, "aria-label": dayTitle(x.date, now),
    onclick: () => { if (x.key !== key) openDay(x.key, i > days.indexOf(d) ? 1 : -1); } },
    h("span", {}, i === 0 ? "Today" : f.dayShort(x.date)), h("b", {}, String(new Date(x.date).getUTCDate())))));
  const cur = strip.querySelector("[aria-current]");
  if (cur) { strip.scrollLeft = cur.offsetLeft - (strip.clientWidth - cur.offsetWidth) / 2; if (inStrip) cur.focus({ preventScroll: true }); }
  const body = $("day-body"), parts = I.dayParts(wx, key), conf = I.confidence(wx)[key];
  const kids = [
    h("div", { class: "day-top" }, h("span", { svg: weatherIcon(iconOf(d.code, true), 56) }), h("div", {}, h("div", { class: "dt-main" }, label(d.code)), h("div", { class: "dt-sub" }, `High ${f.temp(d.tmax)} · Low ${f.temp(d.tmin)}`))),
    // (only when the tuning changed what it says)
    d.tuned && (f.temp(d.tmax) !== f.temp(d.raw.tmax) || f.temp(d.tmin) !== f.temp(d.raw.tmin)) ? h("p", { class: "small tuned-note" }, `Tuned for here · forecast alone ${f.temp(d.raw.tmax)} / ${f.temp(d.raw.tmin)}`) : null,
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
    stat("Wind", `${f.wind(d.windMax)} ${compass(d.dir ?? 0)}`),
    stat("Gusts", f.wind(d.gustMax)),
    stat("Feels like", `${f.temp(d.fmin)} to ${f.temp(d.fmax)}`),
    stat("Peak UV", d.uvMax != null ? String(Math.round(d.uvMax)) : "–"),
    stat("Sunshine", d.sunshine != null ? f.dur(d.sunshine) : "–"),
    stat("Sun", `${f.time(d.sunrise)} – ${f.time(d.sunset)}`),
    (d.snow ?? 0) > 0 ? stat("Snow", f.snow(d.snow)) : null));
  // against the climate
  const c = wx.climate && climateOn(wx.climate, d.date);
  if (c?.tmax) {
    const p = rankIn(c.tmax.sorted, d.tmax), an = d.tmax - c.tmax.mean;
    kids.push(h("h3", { class: "day-section" }, "For the time of year"), h("div", { class: "stats" },
      stat("Against normal", Math.abs(an) < 1 ? "About normal" : `${f.delta(an)} ${an > 0 ? "warmer" : "colder"}`), stat("Normal high", f.temp(c.tmax.mean)),
      stat("Warmer than", `${Math.round(p)}% of days`), c.recordHigh ? stat("Record", `${f.temp(c.recordHigh.v)} · ${c.recordHigh.year}`) : null));
  }
  // how sure, and what each model says
  if (conf && d.date >= dayStart(now)) {
    const bar = h("span", { class: "conf-bar" }), fill = h("i"); fill.style.width = `${conf.score}%`; bar.append(fill);
    const why = conf.why.length ? `The models differ on the ${conf.why.join(" and the ")}.` : "";
    kids.push(h("h3", { class: "day-section" }, "Forecast confidence"), h("div", { class: "conf" }, bar, h("b", {}, `${conf.level[0].toUpperCase() + conf.level.slice(1)} (${conf.score})`)),
      why ? h("p", { class: "small muted" }, why) : null);
    // (the ensembles: where the high and low most likely land, the middle 80% of their runs, tuned as the day is)
    const ens = I.likely(d, wx.ensemble?.days?.[key]), span = (r) => `${f.temp(r[0])} to ${f.temp(r[1])}`;
    if (ens) kids.push(h("div", { class: "stats" }, stat("Likely high", span(ens.hi)), ens.lo ? stat("Likely low", span(ens.lo)) : null));
    const mods = wx.models?.days?.[key];
    if (mods?.length) kids.push(h("table", { class: "models" }, h("caption", { class: "sr-only" }, "What each weather model forecasts"),
      h("tr", {}, h("th", { scope: "col" }, "Model"), h("th", { scope: "col" }, "High"), h("th", { scope: "col" }, "Low"), h("th", { scope: "col" }, "Rain")),
      d.tuned ? h("tr", { class: "tuned-row" }, h("td", {}, "Tuned for here"), h("td", {}, f.temp(d.tmax)), h("td", {}, f.temp(d.tmin)), h("td", {}, "–")) : null,
      ...mods.map((m) => h("tr", {}, h("td", {}, m.name), h("td", {}, f.temp(m.tmax)), h("td", {}, f.temp(m.tmin)), h("td", {}, m.precip != null ? f.precip(m.precip) : "–")))));
  }
  body.replaceChildren(...kids.filter(Boolean));
  const dlg = $("day");
  if (!dlg.open) openSheet(dlg);
  dlg.querySelector(".sheet-body").scrollTop = 0;
  // (moving to the next day or the one before, it slides in from that side)
  if (dir && !calm.matches) { body.classList.remove("from-left", "from-right"); void body.offsetWidth; body.classList.add(dir > 0 ? "from-right" : "from-left"); }
  if (hrs.length > 3) requestAnimationFrame(() => {
    drawHourChart(wx, now, hrs, tChart, "temp", d.key === keyOf(now));
    drawHourChart(wx, now, hrs, rChart, "rain", d.key === keyOf(now));
    drawHourChart(wx, now, hrs, wChart, "wind", d.key === keyOf(now));
  });
}

/* ---------- places ---------- */
async function locate(quiet = false) {
  if (!navigator.geolocation) { if (!quiet) alert("Location isn't available in this browser."); return false; }
  const btn = $("locate-btn"); btn.classList.add("busy");
  try {
    const pos = await new Promise((ok, no) => navigator.geolocation.getCurrentPosition(ok, no, { enableHighAccuracy: false, timeout: 12000, maximumAge: 10 * 60e3 }));
    const lat = pos.coords.latitude, lon = pos.coords.longitude, before = S.places.find((x) => x.gps);
    // (hardly moved since last time, under a kilometre: the name it had, rather than asking again)
    const was = S.places.find((x) => x.gps && x.name !== "My Location" && Math.abs(x.lat - lat) < 0.009 && Math.abs(x.lon - lon) < 0.009 / Math.max(0.2, Math.cos(lat * Math.PI / 180)));
    // (found quietly, as it's opened: the place being looked at stays the one looked at; and still in the same square
    // of the forecast's, what's being asked for already is what's wanted)
    const mine = !quiet || !S.places.length || !!place()?.gps, same = quiet && before && cell(before.lat, before.lon) === cell(lat, lon);
    // (My Location's notifications, if it has any, follow it)
    const named = (name) => {
      const n = S.settings.notify, moved = (q) => q?.gps && (cell(q.lat, q.lon) !== cell(lat, lon) || q.name !== name);
      const all = [...n.places, n.brief].filter(moved);
      if (!all.length) return;
      for (const q of all) Object.assign(q, { lat, lon, name });
      saveSettings(); notifySaved().catch(() => {});
    };
    // (named as it was, until the new name's found, if it's not gone far; "My Location" if it has)
    const as = was || (same ? before : null);
    addPlace({ name: as?.name || "My Location", region: as?.region || "", lat, lon, gps: true }, mine);
    if (mine && !same) go(); else showPlace();
    // (its name looked up meanwhile, the forecast not kept waiting for it)
    if (was) named(was.name);
    else nameOf(lat, lon).then((nm) => {
      const p = S.places.find((x) => x.gps);
      if (!p || p.lat !== lat || p.lon !== lon) return;
      if (nm) { Object.assign(p, nm); savePlaces(); showPlace(); }
      named(p.name);
    });
    return true;
  } catch (e) {
    if (!quiet) $("status").textContent = e?.code === 1 ? "Location is turned off for this site. You can search for a place instead." : "Couldn't find your location just now.";
    return false;
  } finally { btn.classList.remove("busy"); }
}
// the saved places as cards, as iOS's Weather lists them: each in its own sky, its name, its clock and its weather, the
// temperature and the day's high and low; swiped left, a Delete behind it (or, with a mouse, a bin on it)
// what the page says of a place now, in peek()'s (data.js) form
const onPage = (wx) => { const now = nowWall(wx.place.offset), c = wx.current || I.hourAt(wx, now), d = I.dayOf(wx, now); return c && { temp: c.temp, code: c.code, isDay: c.isDay, offset: wx.place.offset, hi: d?.tmax ?? null, lo: d?.tmin ?? null }; };
// My Location on its own at the top (it's this device's, not one kept), then the places saved, under their header only
// when there are some
function drawSaved() {
  drawInStep();
  const f = S.f, all = () => [...$("here").children, ...$("saved").children];
  const had = document.activeElement?.closest?.("#places .pc-li"), at = had ? all().indexOf(had) : -1;
  const items = S.places.map((p, i) => {
    // (the place on show as the page has it, its sky and its high and low the same as there; the rest as last kept)
    const k = i === S.cur && S.wx && cell(S.wx.place.lat, S.wx.place.lon) === cell(p.lat, p.lon) ? onPage(S.wx) : glance(p), sky = k ? skyOf(k.code, k.isDay) : "cloudy-day";
    const card = h("button", { class: "place-card", type: "button", "data-sky": sky, "aria-current": i === S.cur ? "true" : "false",
      "aria-label": `${p.name}${k ? `: ${f.temp(k.temp)}, ${label(k.code, k.isDay)}${k.hi != null ? `, high ${f.temp(k.hi)}, low ${f.temp(k.lo)}` : ""}` : ""}${i === S.cur ? ", showing" : ""}`,
      onclick: () => { if (li.classList.contains("swiped")) { li.classList.remove("swiped"); return; } S.cur = i; savePlaces(); closeSheet($("places")); go(); } },
      h("span", { class: "pc-l" }, h("span", { class: "pc-name" }, p.gps ? [h("span", { class: "pc-here", svg: glyph("arrow", 12) }), " "] : null, p.name),
        h("span", { class: "pc-sub" }, [p.gps && p.name !== "My Location" ? "My Location" : p.region?.split(",")[0], k ? f.time(Date.now() + k.offset * 1000) : null].filter(Boolean).join(" · ")),
        k ? h("span", { class: "pc-cond" }, label(k.code, k.isDay)) : null),
      h("span", { class: "pc-r" }, k ? h("span", { class: "pc-temp" }, f.temp(k.temp)) : null, k && k.hi != null ? h("span", { class: "pc-hl" }, `H ${f.temp(k.hi)}  L ${f.temp(k.lo)}`) : null));
    const remove = () => {
      const was = place(), n = S.settings.notify, k = nkey(p);
      S.places.splice(i, 1); S.cur = Math.max(0, S.places.indexOf(was)); savePlaces(); drawSaved(); if (was !== place()) go();
      // (its notifications go with it)
      if (n.places.some((e) => nkey(e) === k) || (n.brief && nkey(n.brief) === k)) { n.places = n.places.filter((e) => nkey(e) !== k); if (n.brief && nkey(n.brief) === k) n.brief = null; saveSettings(); notifySaved().catch(() => {}); }
    };
    const li = h("li", { class: "pc-li" }, card, S.places.length > 1 ? [h("button", { class: "pc-del", type: "button", "aria-label": `Remove ${p.name}`, onclick: remove }, h("span", { svg: glyph("trash", 20) }), "Delete"),
      h("button", { class: "pc-bin", type: "button", "aria-label": `Remove ${p.name}`, svg: glyph("trash", 16), onclick: remove })] : null);
    if (S.places.length > 1) swipeOpen(li, card);
    return li;
  });
  $("here").replaceChildren(...items.filter((_, i) => S.places[i].gps));
  $("saved").replaceChildren(...items.filter((_, i) => !S.places[i].gps));
  $("saved-head").hidden = !S.places.some((p) => !p.gps);
  // (what had the focus keeps it, drawn anew: the same place, or the next along if it's the one that's gone)
  if (at >= 0) { const left = all(); left[Math.min(at, left.length - 1)]?.querySelector(".place-card")?.focus(); }
}
// a card swiped left narrows, following the finger, for the Delete beside it (let go past half way, it stays open);
// back, or a tap, closes it again
function swipeOpen(li, card) {
  const ROOM = 100;
  let x0 = null, y0 = 0, dx = 0, lock = null;
  card.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; lock = null; for (const o of document.querySelectorAll(".pc-li.swiped")) if (o !== li) o.classList.remove("swiped"); }, { passive: true });
  card.addEventListener("touchmove", (e) => {
    if (x0 == null) return;
    const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
    lock ??= Math.abs(mx) > 8 ? "x" : Math.abs(my) > 8 ? "y" : null;
    if (lock !== "x") return;
    dx = Math.min(0, mx + (li.classList.contains("swiped") ? -ROOM : 0));
    // (past the room it needs, it gives less and less)
    const give = -dx <= ROOM ? -dx : ROOM + (-dx - ROOM) * 0.3;
    card.style.transition = "none"; card.style.width = `calc(100% - ${give.toFixed(1)}px)`;
  }, { passive: true });
  card.addEventListener("touchend", () => { if (lock === "x") { card.style.transition = card.style.width = ""; li.classList.toggle("swiped", dx < -ROOM / 2); } x0 = null; });
}
// a sky for some weather, as the page's (styles.css body[data-sky])
const skyOf = (code, day) => { const kind = codeInfo(code).kind; return kind === "storm" ? "storm" : ["rain", "showers", "drizzle", "sleet"].includes(kind) ? (day ? "rain-day" : "rain-night") : kind === "snow" ? (day ? "snow-day" : "snow-night") : kind === "fog" ? "fog" : kind === "clear" ? (day ? "clear-day" : "clear-night") : kind === "partly" ? (day ? "partly-day" : "partly-night") : day ? "cloudy-day" : "cloudy-night"; };
let searchTimer = null, searchSeq = 0;
function onSearch(now = false) {
  clearTimeout(searchTimer);
  const q = $("search").value.trim(), out = $("results");
  if (q.length < 2) { out.replaceChildren(); $("results-said").textContent = ""; S.pick = S.searching = false; return; }
  if (now !== true) S.pick = false;
  S.searching = true;
  searchTimer = setTimeout(async () => {
    const my = ++searchSeq;
    try {
      const list = await searchPlaces(q);
      if (my !== searchSeq) return;
      S.searching = false;
      out.replaceChildren(...(list.length ? list.map((p) => h("li", {}, h("button", { class: "row-btn", type: "button", onclick: () => { addPlace(p); $("search").value = ""; out.replaceChildren(); closeSheet($("places")); go(); } },
        h("span", { class: "rb-main" }, h("span", { class: "rb-name" }, p.name), h("span", { class: "rb-sub" }, p.region))))) : [h("li", { class: "muted small" }, "No places found.")]));
      $("results-said").textContent = list.length ? `${list.length} ${list.length === 1 ? "place" : "places"} found` : "No places found";
      // (Enter pressed before the places came back: take the first now)
      if (S.pick && list.length) { S.pick = false; out.querySelector(".row-btn")?.click(); }
    } catch (_) { if (my === searchSeq) { S.searching = false; out.replaceChildren(h("li", { class: "muted small" }, "Search isn't available right now.")); $("results-said").textContent = "Search isn't available right now"; } }
  }, now === true ? 0 : 280);
}

/* ---------- settings ---------- */
function drawSettings() {
  drawAccount();
  const form = $("settings-form");
  for (const k of ["temp", "wind", "precip", "pressure", "clock", "glass"]) { const r = form.querySelector(`input[name="${k}"][value="${S.settings[k]}"]`); if (r) r.checked = true; }
  form.commute.checked = !!S.settings.commute?.on;
  fillTimes(form.am, S.settings.commute?.am || "08:00"); fillTimes(form.pm, S.settings.commute?.pm || "17:30");
  form.tune.checked = S.settings.tune !== false;
  for (const k of ["laundry", "stars", "sunset"]) form[`x_${k}`].checked = S.settings.extras?.[k] !== false;
  drawNotify(); drawActs(); drawFolders();
}
// Settings is a short list of folders (index.html), each with what's in it said beside it, opening over the list
// with a way back (‹) where the sheet's title is; an activity's own page is a folder in Best times. setStack: the
// folders open, in order, each with where it was opened from (focus goes back there) and how far the one under it
// had scrolled.
let setStack = [], actEdit = null;
function drawFolders() {
  const s = S.settings, form = $("settings-form"), said = (k) => form.querySelector(`input[name="${k}"]:checked`)?.closest("label").textContent.trim() || "";
  const acts = s.activities.filter((a) => a.on !== false).map((a) => a.name);
  $("fv-notify").textContent = notifying(s.notify) ? "On" : "Off";
  $("fv-commute").textContent = s.commute?.on ? `${atText(s.commute.am)}, ${atText(s.commute.pm)}` : "Off";
  $("fv-acts").textContent = acts.length ? acts.join(", ") : "Off";
  $("fv-units").textContent = ["temp", "wind", "precip"].map(said).join(", ");
  $("fv-look").textContent = said("glass");
  $("fv-forecast").textContent = s.tune !== false ? "Tuned" : "Off";
}
function setShow(name, back, quiet = false) {
  const top = setStack.at(-1), under = setStack.at(-2);
  for (const pg of $("settings").querySelectorAll(".set-page")) {
    const on = pg.dataset.page === name;
    pg.hidden = !on; pg.classList.remove("in-next", "in-back");
    if (on && !quiet && !calm.matches) pg.classList.add(back ? "in-back" : "in-next");
  }
  $("settings-title").textContent = name === "root" ? "Settings" : top?.title || "Settings";
  $("set-back").hidden = name === "root";
  $("set-back").setAttribute("aria-label", `Back to ${under?.title || "Settings"}`);
}
function setGo(name, title = $("settings").querySelector(`.set-page[data-page="${name}"]`)?.dataset.title) {
  const body = $("settings").querySelector(".sheet-body");
  setStack.push({ name, title, from: document.activeElement, scroll: body.scrollTop });
  setShow(name, false);
  body.scrollTop = 0;
  $("settings-title").focus({ preventScroll: true });
}
function setBack() {
  const top = setStack.pop(); if (!top) return;
  const prev = setStack.at(-1);
  setShow(prev?.name || "root", true);
  $("settings").querySelector(".sheet-body").scrollTop = top.scroll;
  if (!prev) drawFolders();
  // (an activity's changes kept on the way back, as iOS keeps them; its row, drawn anew, has the focus)
  if (top.name === "act" && actEdit) { const keep = actEdit; actEdit = null; keep(); }
  else top.from?.focus?.({ preventScroll: true });
}
const setHome = () => { setStack = []; setShow("root", true, true); $("settings").querySelector(".sheet-body").scrollTop = 0; };
function readSettings(e) {
  if (e?.target?.closest?.("#notify-set") || e?.target?.closest?.(".acts-list, .acts-add")) return;     // (their own handlers)
  const form = $("settings-form"), v = (k) => form.querySelector(`input[name="${k}"]:checked`)?.value;
  const units = ["temp", "wind", "precip", "clock"].map((k) => S.settings[k]).join();
  for (const k of ["temp", "wind", "precip", "pressure", "clock", "glass"]) if (v(k)) S.settings[k] = v(k);
  S.settings.commute = { on: form.commute.checked, am: form.am.value || "08:00", pm: form.pm.value || "17:30" };
  S.settings.tune = form.tune.checked;
  S.settings.extras = { laundry: form.x_laundry.checked, stars: form.x_stars.checked, sunset: form.x_sunset.checked };
  saveSettings(); afterFrame(redraw); drawFolders();
  // (the times to choose from said the new way)
  if (S.f.units.clock !== units.split(",")[3]) for (const k of ["am", "pm", "briefAt"]) fillTimes(form[k], form[k].value);
  // notifications speak your units too
  const n = S.settings.notify;
  if ((notifying(n) || n.endpoint) && units !== ["temp", "wind", "precip", "clock"].map((k) => S.settings[k]).join()) syncNotify().catch(() => {});
}

// The page behind redrawn once the next frame is out, so a choice's lens has begun to glide (started, it runs by
// itself; redrawn first, the lens would wait for it, then jump). A sheet closing does any that's waiting at once.
const waiting = new Set();
function afterFrame(fn) {
  if (waiting.has(fn)) return;
  waiting.add(fn);
  requestAnimationFrame(() => setTimeout(() => { if (waiting.delete(fn)) fn(); }, 0));
}
const flushWaiting = () => { for (const fn of [...waiting]) { waiting.delete(fn); fn(); } };
const redraw = () => { render(); drawActs(); };

/* ---------- notifications ---------- */
const b64u = (s) => { const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
// A word about the alerts, until they're on or it's put away (for a month): what they are, and a way to them (or, on an
// iPhone not yet running Weather from its Home Screen, how to get there first)
function nudge() {
  const box = $("nudge"), n = S.settings.notify, away = store.get("wx:nudge");
  if (notifying(n) || (away && Date.now() - away < 30 * DAY)) { box.hidden = true; return; }
  if (!box.hidden && box.childElementCount) return;
  const why = notifyWhy(), done = () => { store.set("wx:nudge", Date.now()); box.hidden = true; };
  box.replaceChildren(h("span", { class: "ins-icon", svg: glyph("bell", 18) }), h("h2", { id: "nudge-title" }, "Get rain alerts"),
    h("p", {}, why || "A heads-up here before rain starts, official warnings as they're issued, and a morning briefing if you'd like one."),
    h("div", { class: "nudge-btns" }, why ? null : h("button", { class: "pill-btn", type: "button", onclick: () => { done(); openSettingsAt("notify"); } }, "Turn on"),
      h("button", { class: "link", type: "button", onclick: done }, why ? "OK" : "Not now")));
  box.hidden = false;
}
// Settings, open at one of its folders
function openSettingsAt(page) { $("settings-btn").click(); setGo(page); }
// why this phone can't have them, if it can't
function notifyWhy() {
  if ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window) return Notification.permission === "denied" ? "Notifications are blocked for this site (browser settings)." : null;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  return ios && !standalone ? "Add Weather to your Home Screen first (Share, Add to Home Screen), then turn these on there." : "This browser can't show notifications.";
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
// tell the server what this device wants (or that it wants nothing); signed in, it's the account's choices this device
// gets (functions/_wxacct.js), and it's one of the account's devices
// (one at a time, each with the settings as they are when its turn comes: two quick changes can't race each other)
let syncs = Promise.resolve();
function syncNotify() {
  const run = syncs.then(syncNow);
  syncs = run.catch(() => {});
  return run;
}
const canShow = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && Notification.permission === "granted";
async function syncNow() {
  const n = S.settings.notify;
  if (!S.acct && !notifying(n)) {
    const sub = "serviceWorker" in navigator ? await pushSub(false).catch(() => null) : null;
    if (sub) { await post("/api/weather/unsubscribe", { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe().catch(() => {}); }
    n.endpoint = n.devId = null; saveSettings();
    return;
  }
  // (signed in, nothing on yet and nothing here before: nothing to tell)
  if (!canShow() || (S.acct && !notifying(n) && !n.endpoint)) return;
  const sub = await pushSub(true), j = sub.toJSON();
  const r = await post("/api/weather/subscribe", { sub: { endpoint: j.endpoint, keys: j.keys }, places: n.places, brief: n.brief, briefAt: n.briefAt, was: n.endpoint || undefined,
    units: { temp: S.settings.temp, wind: S.settings.wind, precip: S.settings.precip, clock: S.settings.clock } });
  n.endpoint = j.endpoint; n.devId = r.id || null; n.syncedAt = Date.now(); saveSettings();
}
// with notifications on, now and then (and whenever the browser's changed this device's subscription), the server's told
// again, so they keep coming (it forgets devices it hasn't heard from in months)
async function keepNotify() {
  const n = S.settings.notify;
  if ((!notifying(n) && !n.endpoint) || !canShow()) return;
  try {
    const sub = await pushSub(false);
    if (sub && sub.endpoint === n.endpoint && Date.now() - (n.syncedAt || 0) < 7 * 864e5) return;
    await syncNotify();
  } catch (_) {}
}
// a time to choose, as "HH:MM": every quarter of an hour, said as the Clock setting says them (and the one chosen,
// should it be between)
function fillTimes(sel, at) {
  const list = Array.from({ length: 96 }, (_, k) => `${String(Math.floor(k / 4)).padStart(2, "0")}:${String((k % 4) * 15).padStart(2, "0")}`);
  if (/^\d\d:\d\d$/.test(at) && !list.includes(at)) list.push(at), list.sort();
  sel.replaceChildren(...list.map((v) => h("option", { value: v }, atText(v))));
  sel.value = at;
}
// (any of them on: rain alerts or official warnings for a place, the briefing)
const notifying = (n) => !!(n.places.length || n.brief);
const atText = (at) => { const [hh, mm] = String(at || "07:00").split(":").map(Number); return S.f.time(Date.UTC(2000, 0, 1, hh || 0, mm || 0)); };
// a place, as notifications know it (My Location: wherever it is now)
const nkey = (p) => A.nkeyOf(p);
const nname = (p) => (p.gps ? "My Location" : p.name);
const spotOf = (p) => ({ lat: p.lat, lon: p.lon, name: p.name, ...(p.gps ? { gps: true } : {}) });
// Allowed to show them here? (asked straight away, while the tap still counts: Safari won't ask otherwise.) Signed in,
// a choice is the account's whether or not this device can show it: its other devices will. → [go on?, a word to say]
async function allowed() {
  const why = notifyWhy(), perm = why ? "denied" : Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (perm === "granted") return [true, ""];
  const said = why || "Notifications weren't allowed.";
  return S.acct ? [true, `${said} Your other devices will still get them.`] : [false, said];
}
const and = (a) => (a.length > 1 ? `${a.slice(0, -1).join(", ")} and ${a.at(-1)}` : a[0]);
// What's on is shown by the switches and chips, so the line that says it is only heard (a screen reader's); shown when
// there's more to it (saving, a note, why they can't be on)
function notifySay(text, quiet = false) { const st = $("notify-status"); st.textContent = text; st.classList.toggle("sr-only", quiet); }
function onText() {
  const n = S.settings.notify, rain = n.places.filter((p) => p.rain).map(nname), warn = n.places.filter((p) => p.warn).map(nname);
  const on = [rain.length ? `rain alerts for ${and(rain)}` : "", warn.length ? `official warnings for ${and(warn)}` : "", n.brief ? `a briefing at ${atText(n.briefAt)} for ${nname(n.brief)}` : ""].filter(Boolean);
  const mail = S.acct && [n.email?.warn && warn.length ? "the warnings" : "", n.email?.brief && n.brief ? "the briefing" : ""].filter(Boolean);
  return on.length ? `On: ${and(on)}.${mail?.length ? ` ${and(mail).replace(/^t/, "T")} by email too.` : ""}` : "Off.";
}
// a choice made: kept, and (signed in) the account's first, then this device told
async function notifySaved() {
  if (!S.acct) return syncNotify();
  await keepInStep();
  if (!hereToo() && canShow()) { await syncNotify(); refreshDevices(); }
}
async function notifyChanged(note = "") {
  saveSettings(); drawNotify(true);
  notifySay("Saving…");
  try { await notifySaved(); notifySay(`${onText()}${note ? ` ${note}` : ""}`, !note); }
  catch (err) { notifySay(`Couldn't save that just now (${err.message}).`); }
  drawNotify(true); drawAccount();
}
// rain alerts or official warnings (k) for a place, on or off
async function togglePlace(p, k) {
  const n = S.settings.notify, key = nkey(p), e = n.places.find((x) => nkey(x) === key), on = !e?.[k];
  let note = "";
  if (on) { const [go, said] = await allowed(); if (!go) { notifySay(said); return; } note = said; }
  if (e) e[k] = on; else n.places.push({ ...spotOf(p), rain: k === "rain", warn: k === "warn" });
  n.places = n.places.filter((x) => x.rain || x.warn);
  await notifyChanged(note);
}
// the warnings and the briefing by email too (signed in: the account's choice, kept with it; the server sends them to its
// email, once that's confirmed)
async function onMail() {
  const form = $("settings-form");
  S.settings.notify.email = { warn: form.mailWarn.checked, brief: form.mailBrief.checked };
  await notifyChanged();
}
// the briefing: on or off, for which place, at what time
async function onNotify() {
  const form = $("settings-form"), n = S.settings.notify;
  let note = "";
  if (form.brief.checked && !n.brief) { const [go, said] = await allowed(); if (!go) { form.brief.checked = false; notifySay(said); return; } note = said; }
  const key = form.briefFor.value, p = S.places.find((x) => nkey(x) === key) || (n.brief && nkey(n.brief) === key ? n.brief : place());
  n.brief = form.brief.checked && p ? spotOf(p) : null;
  n.briefAt = form.briefAt.value || "07:00";
  await notifyChanged(note);
}
function drawNotify(keepStatus = false) {
  const n = S.settings.notify, form = $("settings-form"), mine = (p) => n.places.find((e) => nkey(e) === nkey(p)) || {};
  // each saved place, and any notified of that isn't saved (from before)
  const rows = [...S.places, ...n.places.filter((e) => !S.places.some((p) => nkey(p) === nkey(e)))];
  $("notify-places").replaceChildren(...rows.map((p) => {
    const e = mine(p), name = nname(p);
    const chip = (k, text) => h("button", { class: "np-chip", type: "button", "data-k": k, "aria-pressed": String(!!e[k]), "aria-label": `${text} for ${name}`, onclick: () => togglePlace(p, k) }, text);
    return h("li", { class: "np-row", "data-key": nkey(p) }, h("span", { class: "np-name" }, name, p.gps && p.name !== "My Location" ? h("small", {}, p.name) : null), chip("rain", "Rain"), chip("warn", "Warnings"));
  }));
  form.brief.checked = !!n.brief;
  const opts = S.places.map((p) => h("option", { value: nkey(p) }, nname(p)));
  if (n.brief && !S.places.some((p) => nkey(p) === nkey(n.brief))) opts.push(h("option", { value: nkey(n.brief) }, n.brief.name));
  form.briefFor.replaceChildren(...opts);
  form.briefFor.value = n.brief ? nkey(n.brief) : place() ? nkey(place()) : "";
  fillTimes(form.briefAt, n.briefAt || "07:00");
  if (!keepStatus) notifySay(notifying(n) ? onText() : S.acct ? "" : notifyWhy() || "", notifying(n));
  drawMail(); drawNotifyAcct(); drawFolders();
}
// By email: signed in only, to the account's email once it's confirmed (the rain alerts not: an hour's notice by email
// comes too late)
function drawMail() {
  const a = S.acct, form = $("settings-form"), n = S.settings.notify;
  $("notify-mail").hidden = !a;
  if (!a) return;
  form.mailWarn.checked = !!n.email?.warn; form.mailBrief.checked = !!n.email?.brief;
  form.mailWarn.disabled = form.mailBrief.disabled = !a.emailOk;
  $("notify-mail-foot").replaceChildren(...(a.emailOk ? [`To ${a.email}, for the places and time above. Rain alerts aren’t emailed: they’d come too late.`]
    : ["Confirm your email first, on ", h("button", { class: "link", type: "button", onclick: openAccount }, "your account page"), "."]));
}

/* ---------- your account ---------- */
// Signed in to your georgefarrowgreen.com account (weather/account.js), your saved places, settings and notifications are
// kept with it, in step on every device you're signed in on. S.acct: { name, handle, devices, state } while signed in;
// kept (wx:acct) with the version last in step and what was kept then (snap), so a change made meanwhile, here or on
// another device, is put together with the other's rather than either being lost.
const SYNCED = ["temp", "wind", "precip", "pressure", "clock", "glass", "tune", "commute", "extras", "activities"];
const PERSON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8.5" r="3.6"/><path d="M4.8 19.6c1.3-3.4 4-5.1 7.2-5.1s5.9 1.7 7.2 5.1"/></svg>';
const PASSKEY = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="9" r="4"/><path d="M2.5 20c.8-3 2.9-4.6 5.5-4.6 1.1 0 2.1.3 3 .8M16.5 8.5a2.5 2.5 0 1 1 0 5v5l1.5-1.5 1.5 1.5v-3.2"/></svg>';
// (an object's keys in order, so the same settings always read the same)
const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
// what's here, as it's kept with the account (My Location is each device's own)
const mine = () => ({
  places: S.places.filter((p) => !p.gps).map((p) => ({ name: p.name, region: p.region || "", lat: p.lat, lon: p.lon })),
  settings: Object.fromEntries(SYNCED.map((k) => [k, S.settings[k]])),
  notify: { places: S.settings.notify.places, brief: S.settings.notify.brief, briefAt: S.settings.notify.briefAt, email: S.settings.notify.email },
});
const snapOf = (d) => ({ places: (d.places || []).map(A.keyOf), settings: canon(d.settings || null), notify: d.notify || null });
const sameAs = (now, snap) => canon(now.places.map(A.keyOf)) === canon(snap.places) && canon(now.settings) === snap.settings && !A.notifyChanges(now.notify, snap.notify).length;
// the account's and this device's put together (first: just signed in, so all of this device's is new to the account;
// the account's settings, if it has any)
function combine(theirs, now, snap, first = false) {
  const tn = theirs.notify || { places: [], brief: null }, theirSettings = theirs.settings && Object.keys(theirs.settings).length ? theirs.settings : null;
  return {
    places: A.mergePlaces(theirs.places || [], now.places, first ? [] : snap.places),
    settings: first ? theirSettings || now.settings : canon(now.settings) !== snap.settings ? now.settings : theirSettings || now.settings,
    notify: A.mergeNotify(tn, now.notify, first ? A.notifyChanges(now.notify, tn).filter((k) => k === "brief" ? !tn.brief : !tn.places.some((q) => nkey(q) === k)) : A.notifyChanges(now.notify, snap.notify)),
  };
}
// taken up here: the places (My Location first, as ever, and the one on show still on show), settings and notifications
function takeUp(d) {
  const here = place(), gps = S.places.find((p) => p.gps), units = canon([S.settings.temp, S.settings.wind, S.settings.precip, S.settings.clock]);
  const list = d.places.map((p) => ({ ...(S.places.find((x) => !x.gps && A.keyOf(x) === A.keyOf(p)) || {}), ...p }));
  if (gps || list.length) S.places = gps ? [gps, ...list] : list;
  const at = S.places.findIndex((p) => here && (p.gps ? here.gps : !here.gps && A.keyOf(p) === A.keyOf(here)));
  S.cur = Math.max(0, at);
  store.set("wx:places", S.places); store.set("wx:cur", S.cur);
  const n = S.settings.notify;
  const theirs = Object.fromEntries(SYNCED.filter((k) => d.settings && k in d.settings).map((k) => [k, d.settings[k]]));
  store.set("wx:settings", { ...S.settings, ...theirs, notify: { ...d.notify, endpoint: n.endpoint, devId: n.devId, syncedAt: n.syncedAt } });
  loadSettings();
  if (here && at < 0) go(); else if (S.wx) render();
  if (units !== canon([S.settings.temp, S.settings.wind, S.settings.precip, S.settings.clock]) && notifying(S.settings.notify)) syncNotify().catch(() => {});
  drawSaved(); if ($("settings").open) drawSettings();
}
// Sending what's changed here (one at a time; a change while one's going goes after it), and if the account's moved on
// meanwhile, putting the two together and sending that
let stepping = null, stepAgain = false, stepTimer = 0;
function inStepSoon() { if (!S.acct) return; clearTimeout(stepTimer); stepTimer = setTimeout(() => keepInStep().catch(() => {}), 1200); }
function keepInStep() {
  if (stepping) { stepAgain = true; return stepping; }
  stepping = (async () => { try { do { stepAgain = false; await stepOnce(); } while (stepAgain); } finally { stepping = null; } })();
  return stepping;
}
async function stepOnce() {
  for (let tries = 0; tries < 3; tries++) {
    const k = store.get("wx:acct");
    if (!k || !S.acct) return;
    const now = mine();
    if (sameAs(now, k.snap)) { inStep("ok"); return; }
    inStep("saving");
    let r;
    try { r = await A.save(k.ver, now); }
    catch (e) { if (e.status === 401) signedOutElsewhere(); else inStep(e.offline ? "waiting" : "error"); throw e; }
    if (!r.conflict) { store.set("wx:acct", { ...k, ver: r.ver, snap: snapOf(r.data) }); inStep("ok"); return; }
    takeUp(combine(r.data, now, k.snap));
    store.set("wx:acct", { ...k, ver: r.ver, snap: snapOf(r.data) });
  }
}
function inStep(state) { if (!S.acct || S.acct.state === state) return; S.acct.state = state; drawInStep(); drawAccount(); }
// The account as the server has it (on opening, and again on coming back after a minute): signed out elsewhere, signed
// in elsewhere on the site, or changed on another device
let pulledAt = 0;
async function pull() {
  pulledAt = Date.now();
  let r;
  try { r = await A.me(); }
  catch (e) {
    // (no account here at all: a preview of the site, say)
    if (e.status === 404) { S.noAcct = true; signedOut(); return; }
    if (S.acct && S.acct.state === "ok") inStep("waiting"); return;
  }
  if (!r.signedIn) { S.ask = null; if (S.acct || store.get("wx:acct")) signedOutElsewhere(); return; }
  await adopt(r);
}
// here: signed in on this page just now (so this device's places are meant for the account)
async function adopt(r, here = false) {
  const k = store.get("wx:acct"), fresh = !k || (k.id ? k.id !== r.id : k.handle !== r.handle);
  if (fresh && !here && mine().places.length) { S.ask = r; drawAccount(); return; }
  S.ask = null;
  S.acct = { ...profileOf(r), devices: r.devices || [], state: S.acct?.state || "ok" };
  if (fresh) takeUp(combine(r.data, mine(), snapOf({}), true));
  else if (r.ver !== k.ver) takeUp(combine(r.data, mine(), k.snap));
  store.set("wx:acct", { ...profileOf(r), devices: S.acct.devices, ver: r.ver, snap: snapOf(r.data) });
  drawAccount(); drawInStep(); drawMail();
  try { await keepInStep(); } catch (_) {}
  // (this device, if it shows notifications, one of the account's)
  if (fresh && canShow() && (notifying(S.settings.notify) || S.settings.notify.endpoint)) { await syncNotify().catch(() => {}); refreshDevices(); }
}
async function refreshDevices() {
  try { const r = await A.me(); if (r.signedIn && S.acct) { S.acct.devices = r.devices || []; const k = store.get("wx:acct"); if (k) store.set("wx:acct", { ...k, devices: S.acct.devices }); drawAccount(); } } catch (_) {}
}
// who, as the account has them: name, handle, email, the photo's time (and the account's own id, to know it again)
const profileOf = (r) => ({ id: r.id || null, name: r.name, handle: r.handle, email: r.email || "", emailOk: !!r.emailOk, photoAt: r.photoAt || null });
// this device among the account's that get its notifications
const hereToo = () => !!(S.acct && S.settings.notify.devId && S.acct.devices.some((d) => d.id === S.settings.notify.devId));
function signedOut() { store.del("wx:acct"); S.acct = null; drawAccount(); drawInStep(); if ($("settings").open) drawNotify(); }
// Signing out here (the foot of Settings): of the site's account in this browser; this device keeps its places and
// settings, and its notifications go on as its own
async function signOutHere() {
  const b = $("sign-out"); b.disabled = true;
  try { await A.signOut(S.settings.notify.endpoint || undefined); } catch (_) {}
  finally { b.disabled = false; }
  signedOut();
}
// Signed out somewhere else (the account's page, or another app on the site): this device's notifications stay, as its
// own, as when it's signed out here
function signedOutElsewhere() {
  const n = S.settings.notify;
  if (n.endpoint && n.devId) A.leave(n.endpoint).catch(() => {});
  signedOut();
}
async function signIn(how, email, password) {
  const said = $("acct-said"), btns = [...$("acct-in").querySelectorAll("button")];
  // (as on every page of the site that signs in: the same words for what's missing)
  if (how !== "passkey" && (!email || !password)) { said.textContent = email ? "Enter your password." : "Enter your email."; said.classList.add("bad"); return; }
  said.classList.remove("bad"); said.textContent = "Signing in…"; btns.forEach((b) => (b.disabled = true));
  try { await adopt(how === "passkey" ? await A.withPasskey() : await A.withPassword(email, password), true); }
  catch (e) { const s2 = $("acct-said"); if (s2) { s2.textContent = e.message; s2.classList.add("bad"); } }
  finally { btns.forEach((b) => (b.disabled = false)); }
}
// this device getting the account's notifications too
async function sendHere() {
  const [go, said] = await allowed();
  if (!go || !canShow()) { notifySay(said); return; }
  try { await syncNotify(); await refreshDevices(); } catch (e) { notifySay(`Couldn't do that just now (${e.message}).`); }
}
// (said only when there's something to say: in step, nothing; as a note under the saved places, and short on the account's card)
const STATES = { saving: ["Syncing…", "Syncing…"], waiting: ["Offline. Your places will sync when you’re back online.", "Offline, will sync later"],
  error: ["Couldn’t sync just now. It’ll try again.", "Couldn’t sync"] };
function drawAccount() {
  const box = $("acct"); if (!box) return;
  box.hidden = !!S.noAcct;
  // (signed in elsewhere on the site to an account this device hasn't been in step with: asked before its places go to it)
  if (S.ask && !S.acct) {
    const r = S.ask;
    return box.replaceChildren(
      h("div", { class: "acct-card" }, avatarOf(r), h("span", { class: "acct-txt" }, h("b", { id: "acct-title" }, r.name), h("span", {}, `@${r.handle} · signed in on this browser`))),
      h("p", { class: "acct-new" }, "Keep this device’s places and settings with this account, the same on every device it’s signed in on?"),
      h("button", { class: "acct-btn primary", type: "button", id: "acct-keep", onclick: () => adopt(r, true) }, `Keep them with @${r.handle}`),
      h("button", { class: "acct-btn", type: "button", id: "acct-notme", onclick: async () => { try { await A.signOut(); } catch (_) {} S.ask = null; signedOut(); } }, "Not you? Sign out"));
  }
  const a = S.acct, said = h("p", { class: "acct-said", id: "acct-said", role: "status" });
  $("about-app").textContent = a ? "Your places, settings and notifications are kept with your account." : "Settings and places stay on this device.";
  $("out-grp").hidden = !a;
  $("acct-in").replaceChildren();
  if (!a) {
    // (as on every page of the site that signs in: a passkey first, then your email and password; a forgotten password,
    // and a new account, on the account's own page)
    const pk = A.passkeysWork(), page = accountPage();
    const form = h("form", { class: "acct-form", novalidate: true, onsubmit: (e) => { e.preventDefault(); signIn("password", form.email.value.trim(), form.password.value); } },
      h("input", { type: "email", name: "email", autocomplete: "username webauthn", inputmode: "email", placeholder: "Email", "aria-label": "Email", autocapitalize: "off", spellcheck: "false" }),
      h("input", { type: "password", name: "password", autocomplete: "current-password", placeholder: "Password", "aria-label": "Password", onfocus: () => import("./argon2.js").catch(() => {}) }),
      h("button", { class: pk ? "acct-btn" : "acct-btn primary", type: "submit" }, "Sign in"));
    // (in Settings, a row; signing in, a folder of its own)
    box.replaceChildren(h("button", { class: "acct-card go", type: "button", id: "acct-signin", "data-go": "signin" }, h("span", { class: "acct-ic", svg: PERSON }),
      h("span", { class: "acct-txt" }, h("b", { id: "acct-title" }, "Sign in"), h("span", {}, "Your places on every device")), h("span", { class: "acct-chev", svg: glyph("chevron", 16) })));
    $("acct-in").replaceChildren(...[
      h("p", { class: "acct-lead" }, "Sign in with your georgefarrowgreen.com account to keep your places, settings and notifications the same on all your devices."),
      pk ? h("button", { class: "acct-btn primary", type: "button", id: "acct-passkey", onclick: () => signIn("passkey") }, h("span", { svg: PASSKEY }), "Sign in with a passkey") : null,
      pk ? h("p", { class: "acct-or" }, "or with your email") : null,
      form,
      page ? h("a", { class: "acct-link", href: `${page}#forgot` }, "Forgot password?") : null,
      said,
      page ? h("p", { class: "acct-new" }, "New here? ", h("a", { href: `${page}#join` }, "Create your account")) : null].filter(Boolean));
    return;
  }
  // (signed in from its own folder: back to the list, the account's card at its top)
  if (setStack.at(-1)?.name === "signin") setBack();
  // Just who, as a way to the account's own page (the profile, email, password, passkeys, devices and signing out are
  // there), and how your places and settings are doing, said only when there's something to say
  const said2 = STATES[a.state]?.[1];
  const who = [avatarOf(a), h("span", { class: "acct-txt" }, h("b", { id: "acct-title" }, a.name),
    h("span", { id: "acct-state", class: a.state === "error" ? "acct-bad" : "" }, `@${a.handle}${said2 ? ` · ${said2}` : ""}`))];
  box.replaceChildren(...[
    accountPage() ? h("button", { class: "acct-card in go", type: "button", id: "acct-open", onclick: openAccount }, ...who, h("span", { class: "acct-chev", svg: glyph("chevron", 16) }))
      : h("div", { class: "acct-card in" }, ...who),
    said].filter(Boolean));
  drawNotifyAcct();
}
// Where notifications go, signed in (in Notifications): the account's devices, and this one if it isn't among them yet
function drawNotifyAcct() {
  const box = $("notify-acct"); if (!box) return;
  const a = S.acct, n = S.settings.notify;
  if (!a) return box.replaceChildren();
  const to = a.devices.map((d) => (d.id === n.devId ? "this device" : d.label));
  box.replaceChildren(...[
    to.length ? h("p", { class: "note", id: "notify-where" }, `Notifications go to ${and(to)}.`) : null,
    notifying(n) && !hereToo() && !notifyWhy() ? h("button", { class: "acct-btn small", type: "button", id: "acct-here", onclick: sendHere }, "Send them here too") : null,
  ].filter(Boolean));
}
// The account's own page (account.<site>, beside weather.<site>), opened signed in as you: a code good once, for a
// minute, handed over in the address's # (the page swaps it for a sign-in of its own, in whichever browser it opens in,
// a Home Screen app's included, and takes it out of the address). The window's opened at once, from the tap (a phone
// won't open one later), and sent on when the code's back.
const accountPage = () => (location.hostname.startsWith("weather.") ? `${location.origin.replace("//weather.", "//account.")}/` : null);
async function openAccount() {
  const w = window.open("", "_blank");
  try {
    const { code } = await A.accountLink();
    const url = `${accountPage()}#${new URLSearchParams({ handoff: code, from: "weather" })}`;
    if (w && !w.closed) w.location.href = url; else location.href = url;
  } catch (e) { w?.close(); const said = $("acct-said"); if (said) { said.textContent = e.message; said.classList.add("bad"); } }
}
// Your photo (the account's: the same in every app on the site), or your initial
const avatarOf = (a, url = a.photoAt ? A.photoUrl(a.photoAt) : null) => h("span", { class: "acct-av", "aria-hidden": "true" },
  url ? h("img", { src: url, alt: "", width: "48", height: "48", decoding: "async" }) : (String(a.name || "").trim()[0] || "?").toUpperCase());
// beside "Saved" in Places: that they're in step with the account
function drawInStep() {
  const note = $("sync-note"), said = S.acct && STATES[S.acct.state]?.[0];
  if (!note) return;
  note.hidden = !said; note.textContent = said || "";
}

/* ---------- your activities ---------- */
// (focus: where the focus goes, the list drawn anew: [row, "on"] its switch, [row, "change"] its Change)
function saveActs(focus) { saveSettings(); if (S.wx) windows(S.wx, nowWall(S.wx.place.offset)); drawActs(focus); drawFolders(); }
function drawActs(focus) {
  const f = S.f, acts = S.settings.activities, have = new Set(acts.map((a) => a.id));
  $("acts-list").replaceChildren(...acts.map((a, i) => h("li", { class: "act" },
    h("button", { class: "act-open", type: "button", "aria-label": `${a.name}, ${I.limitsText(a, f)}: change`, onclick: () => editAct(i) },
      h("span", { class: "act-icon", svg: glyph(a.icon || "star", 18) }),
      h("span", { class: "act-txt" }, h("b", {}, a.name), h("span", { class: "act-lim" }, I.limitsText(a, f))),
      h("span", { class: "act-chev", svg: glyph("chevron", 14) })),
    h("label", { class: "switch act-on" }, h("input", { type: "checkbox", "aria-label": a.name, checked: a.on !== false, onchange: (e) => { a.on = e.target.checked; saveActs([i, "on"]); } })))));
  $("act-add").replaceChildren(h("option", { value: "" }, "Choose…"),
    ...Object.entries(I.ACTIVITIES).filter(([id]) => !have.has(id)).map(([id, a]) => h("option", { value: id }, a.name)), h("option", { value: "custom" }, "Something else…"));
  if (focus) { const li = $("acts-list").children[Math.min(focus[0], acts.length - 1)]; (li?.querySelector(focus[1] === "on" ? "input" : "button") || $("act-add")).focus(); }
}
function editAct(i) {
  const a = S.settings.activities[i], f = S.f;
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
    h("div", { class: "act-btns" }, h("button", { class: "pill-btn", type: "button", onclick: setBack }, "Done"),
      h("button", { class: "link danger", type: "button", onclick: () => { actEdit = null; S.settings.activities.splice(i, 1); setBack(); saveActs([i, "change"]); } }, "Remove")));
  const val = (k) => ed.querySelector(`[name="${k}"]`).value, n = (k, d) => { const v = parseFloat(val(k)); return Number.isFinite(v) ? v : d; };
  function done() {
    Object.assign(a, { name: val("name").trim().slice(0, 24) || a.name, tmin: tM(n("tmin", tU(a.tmin))), tmax: tM(n("tmax", tU(a.tmax))), windMin: Math.max(0, wM(n("windMin", 0))),
      windMax: Math.max(1, wM(n("windMax", wU(a.windMax)))), gustMax: Math.max(1, wM(n("gustMax", wU(a.gustMax)))), rain: val("rain"), hours: Math.max(1, Math.min(8, Math.round(n("hours", a.hours)))), from: Number(val("from")), to: Number(val("to")) });
    if (a.tmax < a.tmin) [a.tmin, a.tmax] = [a.tmax, a.tmin];
    if (a.to <= a.from) a.to = Math.min(24, a.from + a.hours);
    saveActs([i, "change"]);
  }
  $("act-page").replaceChildren(ed);
  actEdit = done;
  setGo("act", a.name);
}
function addAct() {
  const id = $("act-add").value; if (!id) return;
  const a = id === "custom" ? { id: `my${Date.now().toString(36)}`, name: "My activity", icon: "star", tmin: 10, tmax: 22, windMin: 0, windMax: 30, gustMax: 50, rain: "dry", hours: 2, from: 8, to: 20 } : { id, ...I.ACTIVITIES[id] };
  S.settings.activities.push({ ...a, on: true });
  saveActs();
  if (id === "custom") editAct(S.settings.activities.length - 1);
}

const sheetDays = (wx, now) => wx.daily.filter((x) => x.date >= dayStart(now)).slice(0, 16);
// (quiet: without its own slide in, when a swipe's moving it)
function stepDay(n, quiet = false) {
  if (!S.wx || !$("day").open) return;
  const days = sheetDays(S.wx, nowWall(S.wx.place.offset)), i = days.findIndex((x) => x.key === S.dayKey), next = days[i + n];
  if (i >= 0 && next) openDay(next.key, quiet ? 0 : n);
}

// A swipe across a sheet to the next of what it shows or the one before (a day, a tile), as across the page between
// places: what's shown follows the finger (giving at the first and last), and let go far enough, or flicked, it
// carries on out as the next comes in from the other side; not far enough, it springs back (a chart's own sideways is
// its readout). atEnd(dx): nothing more that way; step(n, quiet): show the one n along (quiet: no slide of its own)
function sideSwipe(dlg, page, atEnd, step) {
  const body = dlg.querySelector(".sheet-body");
  let x0 = null, y0 = 0, dx = 0, axis = null, trail = [], raf = 0, moving = false;
  const W = () => body.clientWidth;
  const give = (d) => Math.sign(d) * (1 - 1 / ((Math.abs(d) * 0.55) / W() + 1)) * W();
  const band = (d) => 0.55 / ((Math.abs(d) * 0.55) / W() + 1) ** 2;
  const offset = () => (atEnd(dx) ? give(dx) : dx);
  const fade = (o) => String(1 - Math.min(0.45, (Math.abs(o) / W()) * 0.6));
  const show = () => { raf = 0; const o = offset(); page.style.translate = `${o.toFixed(1)}px 0`; page.style.opacity = fade(o); };
  const clear = () => { page.style.translate = page.style.opacity = ""; };
  body.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1 || moving || !S.wx || e.target.closest(".chart")) { x0 = null; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; axis = null;
  }, { passive: true });
  body.addEventListener("touchmove", (e) => {
    if (x0 == null) return;
    const x = e.touches[0].clientX, mx = x - x0, my = e.touches[0].clientY - y0;
    if (!axis && Math.hypot(mx, my) > 10) { axis = Math.abs(mx) > Math.abs(my) * 1.2 ? "x" : "y"; if (axis === "x") { x0 = x; trail = []; } }
    if (axis !== "x") return;
    e.preventDefault(); dx = x - x0;
    const t = performance.now(); trail.push([t, x]); while (trail.length > 2 && t - trail[0][0] > 90) trail.shift();
    raf ||= requestAnimationFrame(show);
  }, { passive: false });
  const end = () => {
    if (x0 == null) return;
    x0 = null;
    if (axis !== "x") return;
    cancelAnimationFrame(raf); raf = 0;
    const v = flickSpeed(trail), dir = dx < 0 ? 1 : -1, from = offset(), o = fade(from), w = W(), edge = atEnd(dx);
    const far = Math.abs(dx) > w * 0.28, flung = Math.abs(v) > 0.3 && Math.sign(v) === Math.sign(dx) && Math.abs(dx) > 16;
    clear();
    if (edge || !(far || flung)) {
      if (!calm.matches && from) page.animate([{ translate: `${from}px 0`, opacity: o }, { translate: "0 0", opacity: 1 }], glide(-Math.sign(from) * (edge ? v * band(dx) : v), Math.abs(from), "cubic-bezier(0.25, 1, 0.4, 1)"));
      return;
    }
    if (calm.matches) { step(dir, true); return; }
    // (out the way it was going, at about the speed it was let go at; then the next in from the other side)
    moving = true;
    const ms = Math.round(Math.min(200, Math.max(110, (w * 0.45 - Math.abs(from)) / Math.max(Math.abs(v), 1.2) + 60)));
    const out = page.animate([{ translate: `${from}px 0`, opacity: o }, { translate: `${-dir * Math.max(w * 0.5, Math.abs(from) + 48)}px 0`, opacity: 0 }], { duration: ms, easing: "cubic-bezier(0.3, 0.3, 0.8, 0.6)", fill: "forwards" });
    out.finished.then(() => {
      step(dir, true);
      const inn = page.animate([{ translate: `${dir * w * 0.32}px 0`, opacity: 0 }, { translate: "0 0", opacity: 1 }], { duration: 400, easing: "cubic-bezier(0.22, 0.8, 0.3, 1)" });
      out.cancel();
      return inn.finished;
    }).catch(() => {}).finally(() => { moving = false; });
  };
  body.addEventListener("touchend", end); body.addEventListener("touchcancel", end);
  dlg.addEventListener("keydown", (e) => {
    if ((e.key !== "ArrowLeft" && e.key !== "ArrowRight") || e.target.closest(".chart, input, select")) return;
    e.preventDefault(); step(e.key === "ArrowRight" ? 1 : -1);
  });
}

/* ---------- motion ---------- */
// Small things that move once, as they first come into view for a place: the 16 days' bars sweep out from
// each low to its high, the compass needle swings round to the wind, the sun's path is traced, the UV and air
// knobs slide to their reading (styles.css, .pre and .play). Not again on the 10-minute refresh, and not at
// all with Reduce Motion. (The cards settling in as they're scrolled to are all styles.css.)
// (The page is drawn again as each part of the forecast arrives: each new row or tile takes over from the
// one it replaces: still waiting to be seen, it waits; moving, it carries on from where that one had got to.)
const drawn = new Map();                                 // place:what → the rows or tiles last drawn
const seen = typeof IntersectionObserver === "function" && new IntersectionObserver((es) => {
  let n = 0;
  for (const e of es) {
    if (!e.isIntersecting) continue;
    seen.unobserve(e.target);
    e.target.style.setProperty("--i", String(n++));      // (those seen together, one after another)
    e.target.classList.replace("pre", "play");
    e.target._t0 = performance.now();
  }
}, { threshold: 0.6 });
function motion(key, ...els) {
  if (!seen || calm.matches || !S.wx) return;
  const here = cell(S.wx.place.lat, S.wx.place.lon), k = `${here}:${key}`, old = drawn.get(k);
  // (what was drawn before, here or at another place, no longer watched for: it's off the page)
  old?.forEach((o) => seen.unobserve(o));
  for (const [x, list] of drawn) if (!x.startsWith(`${here}:`)) list.forEach((o) => seen.unobserve(o));
  drawn.set(k, els);
  els.forEach((e, i) => {
    const o = old?.[i];
    if (!old || !o || o.classList.contains("pre")) { e.classList.add("pre"); seen.observe(e); return; }
    const gone = performance.now() - (o._t0 ?? -1e9);
    if (gone < 1800) { e.classList.add("play"); e._t0 = o._t0; e.style.setProperty("--i", o.style.getPropertyValue("--i") || "0"); e.style.setProperty("--t0", `${-Math.round(gone)}ms`); }
  });
}

/* ---------- sheets ---------- */
// They rise over the page, which steps back; they slide away when closed (×, a tap outside, Escape),
// or when swiped down. With Reduce Motion, they simply come and go.
const calm = matchMedia("(prefers-reduced-motion: reduce)");
function openSheet(d) {
  // the page behind first (stepping back about the top of what's on screen, not the middle of the whole long page;
  // and still: styles.css), so it's restyled once, with the sheet (how far back, --recede, on the page alone and not
  // passed down to all that's on it: so a finger dragging the sheet down restyles just the page, not every card)
  document.querySelector(".page").style.transformOrigin = `50% ${scrollY}px`;
  document.querySelector(".page").style.setProperty("--recede", "1");
  document.body.classList.add("sheet-up"); document.querySelector(".hero").classList.add("still");
  d.classList.remove("closing"); d.style.transform = "";
  if (!d.open) d.showModal();
  // (the title has focus first, so it's what a screen reader says, and no ring lands on the close button)
  d.querySelector(".sheet-head h2")?.focus({ preventScroll: true });
}
function closeSheet(d, from = 0) {
  if (!d.open || d.classList.contains("closing")) return;
  flushWaiting();
  if (calm.matches) { d.close(); return; }
  d.style.setProperty("--from", `${from}px`); d.style.transform = "";
  d.classList.add("closing");
  document.querySelector(".page").style.setProperty("--recede", "0");
  let gone = false;
  const done = () => { if (gone) return; gone = true; d.classList.remove("closing"); d.close(); };
  d.addEventListener("animationend", done, { once: true });
  setTimeout(done, 450);
}
function sheetGestures(d) {
  d.addEventListener("cancel", (e) => { e.preventDefault(); closeSheet(d); });
  d.addEventListener("close", () => { if (!document.querySelector("dialog[open]")) { document.body.classList.remove("sheet-up", "sheet-drag"); document.querySelector(".hero").classList.remove("still"); } });
  d.addEventListener("click", (e) => { if (e.target === d) closeSheet(d); });
  // swipe down: from the grabber, or from the content once it's scrolled to the top (and down, not sideways: a day's
  // sheet goes sideways to another day)
  let y0 = null, x0 = 0, dy = 0, t0 = 0, head = false, told = false;
  const body = d.querySelector(".sheet-body");
  d.addEventListener("touchstart", (e) => {
    head = !!e.target.closest(".sheet-head");
    if (e.touches.length > 1 || e.target.closest("input, select, textarea, .leaflet-container") || (!head && body.scrollTop > 0)) { y0 = null; return; }
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; dy = 0; t0 = performance.now(); told = false;
  }, { passive: true });
  d.addEventListener("touchmove", (e) => {
    if (y0 == null) return;
    dy = e.touches[0].clientY - y0;
    if (!told) {
      const dx = e.touches[0].clientX - x0;
      if (Math.hypot(dx, dy) < 8) return;
      told = true;
      if (Math.abs(dx) > Math.abs(dy)) { y0 = null; return; }
    }
    if (dy <= 0 || (!head && body.scrollTop > 0)) { if (!d.classList.contains("dragging")) y0 = null; else d.style.transform = ""; return; }
    e.preventDefault();
    d.classList.add("dragging"); document.body.classList.add("sheet-drag");
    const pull = dy < 40 ? dy : 40 + (dy - 40) * 0.9;
    d.style.transform = `translateY(${pull}px)`;
    document.querySelector(".page").style.setProperty("--recede", String(Math.max(0, 1 - pull / 420)));
  }, { passive: false });
  const end = () => {
    if (y0 == null) return;
    const v = dy / Math.max(1, performance.now() - t0), dragged = d.classList.contains("dragging");
    y0 = null; d.classList.remove("dragging"); document.body.classList.remove("sheet-drag");
    if (!dragged) return;
    if (dy > 120 || (dy > 30 && v > 0.55)) closeSheet(d, dy);
    else { d.style.transform = ""; document.querySelector(".page").style.setProperty("--recede", "1"); }
  };
  d.addEventListener("touchend", end); d.addEventListener("touchcancel", end);
  // and the page behind holds still: a finger (or a wheel) on the dim, or on what in the sheet doesn't scroll, moves
  // nothing (done here, not by stopping the page scrolling, which has iOS Safari put a sheet in the wrong place)
  let free = false;
  d.addEventListener("touchstart", (e) => { free = e.touches.length > 1 || scrollsIn(e.target, d); }, { passive: true });
  d.addEventListener("touchmove", (e) => { if (!free && e.cancelable) e.preventDefault(); }, { passive: false });
  d.addEventListener("wheel", (e) => { if (!scrollsIn(e.target, d) && e.cancelable) e.preventDefault(); }, { passive: false });
}
// (whether what's under a finger, inside a sheet, would scroll: a list longer than it is, a strip wider; or a field or a
// map, which have their own)
function scrollsIn(el, top) {
  if (el.closest?.("input, select, textarea, [contenteditable], .leaflet-container, .maplibregl-map")) return true;
  for (; el && el !== top; el = el.parentElement) {
    const y = el.scrollHeight > el.clientHeight + 1, x = el.scrollWidth > el.clientWidth + 1;
    if (!y && !x) continue;
    const s = getComputedStyle(el);
    if ((y && /auto|scroll/.test(s.overflowY)) || (x && /auto|scroll/.test(s.overflowX))) return true;
  }
  return false;
}

// every source in one place (from the footer, or the map's ©), open at the part that was asked about
function openCredits(at) {
  const d = $("credits"), body = d.querySelector(".sheet-body");
  // (Copernicus asks for the year its information is used in)
  for (const y of d.querySelectorAll(".this-year")) y.textContent = String(new Date().getFullYear());
  openSheet(d);
  // (from the layout, not the screen: the sheet's still rising and scaling as this runs)
  body.scrollTop = at === "map" ? $("cr-map").offsetTop - body.offsetTop - 12 : 0;
}

/* ---------- wiring ---------- */
function wire() {
  $("locate-btn").innerHTML = glyph("locate", 20);
  $("settings-btn").innerHTML = glyph("gear", 20);
  for (const b of document.querySelectorAll("[data-close]")) { b.innerHTML = glyph("close", 18); b.addEventListener("click", () => closeSheet(b.closest("dialog"))); }
  for (const s of document.querySelectorAll(".ct-icon[data-g]")) s.innerHTML = glyph(s.dataset.g, 15);
  for (const s of document.querySelectorAll(".f-ic[data-g]")) s.innerHTML = glyph(s.dataset.g, 18);
  $("set-back").innerHTML = glyph("chevron", 18);
  // each sheet: closing by Escape or a tap outside, and swiping down
  for (const d of document.querySelectorAll("dialog.sheet")) sheetGestures(d);
  // a swipe across a day to the next or the one before, and across a tile's sheet to the next tile or the one before
  sideSwipe($("day"), $("day-body"), (d) => { const days = sheetDays(S.wx, nowWall(S.wx.place.offset)), i = days.findIndex((x) => x.key === S.dayKey); return (d > 0 && i <= 0) || (d < 0 && i >= days.length - 1); }, stepDay);
  sideSwipe($("detail"), $("detail-body"), (d) => { const kinds = detailKinds(), i = kinds.indexOf(S.detailKind); return (d > 0 && i <= 0) || (d < 0 && i >= kinds.length - 1); }, stepDetail);
  placeSwipe();
  pullToRefresh();
  $("place-btn").addEventListener("click", () => { drawSaved(); $("use-location").replaceChildren(h("span", { svg: glyph("locate", 18) }), " Use my location"); openSheet($("places")); });
  $("use-location").addEventListener("click", () => { closeSheet($("places")); locate(); });
  $("search").addEventListener("input", onSearch);
  $("search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const first = $("results").querySelector(".row-btn");
    if (first && !S.searching) first.click(); else { S.pick = true; onSearch(true); }
  });
  $("places").addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const list = [$("search"), ...$("results").querySelectorAll(".row-btn")], i = list.indexOf(document.activeElement);
    if (i < 0 || list.length < 2) return;
    e.preventDefault();
    list[Math.max(0, Math.min(list.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))].focus();
  });
  $("locate-btn").addEventListener("click", () => locate());
  $("settings-btn").addEventListener("click", () => { drawSettings(); setHome(); openSheet($("settings")); });
  $("settings").addEventListener("click", (e) => { const go = e.target.closest("[data-go]"); if (go) setGo(go.dataset.go); });
  $("set-back").addEventListener("click", setBack);
  // (closed while changing an activity: what's been changed kept)
  $("settings").addEventListener("close", () => { if (actEdit) { const keep = actEdit; actEdit = null; keep(); } });
  $("settings-form").addEventListener("change", readSettings);
  for (const k of ["brief", "briefFor", "briefAt"]) $("settings-form")[k].addEventListener("change", onNotify);
  for (const k of ["mailWarn", "mailBrief"]) $("settings-form")[k].addEventListener("change", onMail);
  $("sign-out").addEventListener("click", signOutHere);
  $("act-add").addEventListener("change", addAct);
  for (const b of document.querySelectorAll(".radar-play")) b.innerHTML = `<span class="ic g-off">${glyph("play", 16)}</span><span class="ic g-on">${glyph("pause", 16)}</span>`;
  // (full screen, it closes with an ×, as Apple's Weather map does)
  for (const b of document.querySelectorAll(".radar-full")) b.innerHTML = `<span class="ic g-off">${glyph("expand", 16)}</span><span class="ic g-on">${glyph("close", 18)}</span>`;
  $("refresh-btn").addEventListener("click", () => go(true));
  for (const b of document.querySelectorAll("[data-credits]")) b.addEventListener("click", () => openCredits(b.dataset.credits));
  for (const a of document.querySelectorAll(".credits a")) a.insertAdjacentHTML("beforeend", glyph("out", 16, "cr-out"));
  $("retry-btn").addEventListener("click", () => go(true));
  // temperature, rain or wind: the 48 hours' chart and the days alike, from either switch (and once chosen, kept:
  // otherwise as the weather has it, viewFor)
  const drawMode = () => { if (S.wx) { const now = nowWall(S.wx.place.offset); drawHourChart(S.wx, now, I.hoursFrom(S.wx, now, 48), $("hourly-chart"), S.mode, true); daily(S.wx, now); } };
  for (const g of document.querySelectorAll("#days-seg button")) g.innerHTML = glyph({ temp: "heat", rain: "drop", wind: "wind" }[g.dataset.mode], 16);
  for (const seg of [$("hourly-seg"), $("days-seg")]) {
    seg.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-mode]"); if (!b) return;
      S.modeChosen = true; showMode(b.dataset.mode);
      // (the chart and the days once the lens is on its way)
      afterFrame(drawMode);
    });
    seg.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const tabs = [...seg.children], i = tabs.findIndex((x) => x.getAttribute("aria-selected") === "true");
      const n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); n.click();
    });
  }
  // as the page scrolls past the big temperature, it fades and the bar takes up the temperature (iOS's collapsing title)
  const top = document.querySelector(".top"), heroEl = document.querySelector(".hero"), sideways = matchMedia("(orientation: landscape) and (max-height: 500px) and (min-width: 600px)");
  let ticking = 0;
  const onScroll = () => {
    ticking = 0;
    // (on its side, the weather now stays in sight on the left: the bar needn't take it up)
    // (the bar's taken up once the big one's mostly gone: a crossfade of its own, not one restyled with every frame of the scroll)
    const c = sideways.matches ? 0 : Math.min(1, Math.max(0, scrollY / Math.max(80, heroEl.offsetHeight - 40)));
    heroEl.style.setProperty("--c", c.toFixed(3)); top.classList.toggle("collapsed", c >= 0.72);
    heroEl.classList.toggle("away", c >= 0.99);          // (scrolled out of sight: its icon stops moving)
    document.body.classList.toggle("deep", c >= 0.99);   // (and the sky behind the cards: styles.css)
    top.classList.toggle("scrolled", scrollY > 8);
  };
  addEventListener("scroll", () => { ticking ||= requestAnimationFrame(onScroll); }, { passive: true });
  onScroll();
  // the glass: Safari only shows a press (:active) once the page listens for touches, and with a mouse
  // a soft light follows the pointer across the panels
  addEventListener("touchstart", () => {}, { passive: true });
  // (and no copying its words, by keys or a menu, nor dragging them off: styles.css; but what's typed into, as ever)
  const typing = (e) => e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable]");
  for (const t of ["copy", "cut", "contextmenu", "selectstart", "dragstart"]) document.addEventListener(t, (e) => { if (!typing(e)) e.preventDefault(); });
  if (matchMedia("(hover: hover) and (pointer: fine)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    // (on the pane it's over: styles.css .lit)
    let raf = 0, x = 0, y = 0, over = null, lit = null;
    addEventListener("pointermove", (e) => {
      x = e.clientX; y = e.clientY; over = e.target instanceof Element ? e.target.closest(".card, .ins, .tile, .section-title, dialog.sheet, .c-tip") : null;
      raf ||= requestAnimationFrame(() => {
        raf = 0;
        if (over !== lit) { lit?.classList.remove("lit"); lit = over; lit?.classList.add("lit"); }
        if (lit) { lit.style.setProperty("--lx", `${x}px`); lit.style.setProperty("--ly", `${y}px`); }
      });
    }, { passive: true });
    document.addEventListener("pointerleave", () => { lit?.classList.remove("lit"); lit = over = null; });
  }
  // the minute changes things like "in 20 minutes": redraw just what says so (the rest waits for the next forecast)
  // (a new hour: all of it again, the strip's Now and the days' Today moving on with it; else what tells the time, and
  // in the hour before a sunrise or sunset, the tiles, for the Sun's "In 25 min" (not while one of them's in hand))
  let tickHour = null;
  setInterval(() => {
    if (!S.wx || document.visibilityState !== "visible") return;
    const now = nowWall(S.wx.place.offset), hr = Math.floor(now / HOUR), d = I.dayOf(S.wx, now);
    if (tickHour != null && hr !== tickHour) render();
    else {
      sky(S.wx, now); hero(S.wx, now); nowcast(S.wx, now); status();
      if ([d?.sunrise, d?.sunset].some((t) => t && t > now && t - now <= HOUR) && !$("tiles").contains(document.activeElement)) tiles(S.wx, now);
    }
    tickHour = hr;
    check();
  }, 60e3);
}

start();
