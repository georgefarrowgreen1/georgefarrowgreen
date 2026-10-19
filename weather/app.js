// Weather: the page. data.js fetches, insights.js thinks, this draws.
import { load, searchPlaces, nameOf, store, peek, cell } from "./data.js";
import { makeFormat, nowWall, dayStart, keyOf, hourOf, compass, compassWord, beaufort, HOUR, DAY } from "./format.js";
import * as I from "./insights.js";
import { codeInfo, iconOf, label } from "./codes.js";
import { weatherIcon, moonIcon, glyph } from "./icons.js";
import { timeChart, rangeChart } from "./charts.js";
import { climateOn, rankIn, yearsAgo } from "./climate.js";
import { nextPhases } from "./sky.js";
import { applyTuning, MIN_DAYS, TUNE_DAYS } from "./skill.js";
import { radar, rainAt } from "./radar.js";
import { blend } from "./rainmap.js";
import { inForce, covered, colourOf, titleOf, badgeOf, spanOf, glyphOf } from "./official.js";

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
function defaults() {
  const lang = (navigator.languages?.[0] || navigator.language || "en-GB");
  if (/^en-US|^en-LR|^my/i.test(lang)) return { temp: "f", wind: "mph", precip: "in", pressure: "inhg", clock: "12" };
  if (/^en-GB|^en-IE/i.test(lang)) return { temp: "c", wind: "mph", precip: "mm", pressure: "hpa", clock: "24" };
  return { temp: "c", wind: "kmh", precip: "mm", pressure: "hpa", clock: /^en-(AU|NZ|CA|IN|PH)/i.test(lang) ? "12" : "24" };
}
function loadSettings() {
  const d = {
    ...defaults(), commute: { on: false, am: "08:00", pm: "17:30" }, tune: true,
    activities: I.DEFAULT_ACTIVITIES.map((a) => ({ ...a })), extras: { laundry: true, stars: true, sunset: true },
    notify: { rain: false, brief: false, briefAt: "07:00", place: null },
  };
  // (only values the app knows: a damaged or out-of-date one falls back to the default)
  const k = store.get("wx:settings"), o = k && typeof k === "object" && !Array.isArray(k) ? k : {};
  const one = (v, ok, dv) => (ok.includes(v) ? v : dv), obj = (v, dv) => ({ ...dv, ...(v && typeof v === "object" && !Array.isArray(v) ? v : {}) });
  S.settings = { ...d, ...o,
    temp: one(o.temp, ["c", "f"], d.temp), wind: one(o.wind, ["mph", "kmh", "ms", "kn"], d.wind), precip: one(o.precip, ["mm", "in"], d.precip),
    pressure: one(o.pressure, ["hpa", "inhg", "mmhg"], d.pressure), clock: one(o.clock, ["12", "24"], d.clock), tune: o.tune !== false,
    commute: obj(o.commute, d.commute), extras: obj(o.extras, d.extras), notify: obj(o.notify, d.notify),
    activities: Array.isArray(o.activities) ? o.activities.filter((a) => a && typeof a === "object" && typeof a.name === "string") : d.activities,
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
    addPlace({ name: name || `${lat.toFixed(2)}, ${lon.toFixed(2)}`, region: "", lat, lon });
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
  // and if its name couldn't be found when it was saved, try again from where it is (no need to ask for the location)
  const unnamed = S.places.find((x) => x.gps && x.name === "My Location");
  if (unnamed) nameOf(unnamed.lat, unnamed.lon, { live: false }).then((n) => { if (n && unnamed.name === "My Location") { Object.assign(unnamed, n); savePlaces(); showPlace(); } });
  if ("serviceWorker" in navigator) {
    // a new version: its worker arrives with every file fresh, so if this page has only just opened, start again on it
    const had = !!navigator.serviceWorker.controller, opened = Date.now();
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (had && Date.now() - opened < 20e3) location.reload(); });
    navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).catch(() => {});
    setTimeout(keepNotify, 4000);
  }
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
let seq = 0, timer = null;
// (fresh: called once the forecast itself is in, or has failed: the rest comes in behind it)
async function go(force = false, fresh = null) {
  const p = place(); if (!p) return;
  const my = ++seq;
  S.loading = true; S.error = null;
  $("main").setAttribute("aria-busy", "true");
  $("refresh-btn").disabled = true;
  showPlace();
  const moved = !S.wx || cell(S.wx.place.lat, S.wx.place.lon) !== cell(p.lat, p.lon);
  if (moved) { S.wx = S.base = null; S.allInsights = S.allWins = false; S.rain = null; }
  if (!S.radar) S.radar = radar($("radar"), { lat: p.lat, lon: p.lon, time: (t) => S.f.time(t + (S.wx?.place.offset ?? 0) * 1000), miles: S.f.units.wind === "mph", credits: () => openCredits("map"),
    // (rain expected here in the next two hours: worth the models' grid, where the radar has no track to follow)
    rainSoon: () => { const w = S.wx; if (!w) return true; const now = nowWall(w.place.offset); return (w.minutely || []).some((x) => x.precip >= 0.05) || I.hoursFrom(w, now, 3).some((x) => (x.precip ?? 0) >= 0.1 || (x.pop ?? 0) >= 40); } });
  else S.radar.place(p.lat, p.lon);
  try {
    const loading = load(p, (wx, how) => {
      if (!how.partial) fresh?.();
      if (my !== seq || !wx) return;
      S.base = wx; S.wx = shaped(wx); S.stale = !!how.stale;
      if (how.error) S.error = how.error;
      if (!how.stale && !how.partial) snapshotNow(wx);
      render();
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
  clearTimeout(timer);
  timer = setTimeout(() => { if (document.visibilityState === "visible") go(); }, 10 * 60e3);
}
addEventListener("online", () => { if (S.wx && Date.now() - S.wx.fetchedAt > 60e3) go(); });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && S.wx && Date.now() - S.wx.fetchedAt > 10 * 60e3) go();
});

// the forecast with its highs and lows tuned to how each model has done here (weather/skill.js), unless that's turned off
const tuned = (wx) => (wx && S.settings.tune !== false && wx.skill?.skill ? applyTuning(wx, wx.skill.skill, keyOf(nowWall(wx.place.offset))) : wx);
// and its next couple of hours' rain led by the radar, where it sees (rainmap.js blend), while its frame is recent
const shaped = (wx) => {
  const t = tuned(wx), r = S.rain;
  if (!t || !r || r.id !== cell(t.place.lat, t.place.lon) || Date.now() - r.at > 40 * 60e3) return t;
  return { ...t, minutely: blend(t.minutely, r.steps, r.at, t.place.offset) };
};
// The radar's say on the next couple of hours here (radar.js rainAt), asked for with each forecast, and the page drawn
// again with it (unless the place has changed, or the forecast been asked for again, meanwhile)
async function radarRain(p, my) {
  const r = await rainAt(p.lat, p.lon).catch(() => null);
  if (my !== seq) return;
  S.rain = r && { ...r, id: cell(p.lat, p.lon) };
  if (S.base) render();
}

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
    // how fast it was let go (pixels a millisecond, over the last moment of the swipe)
    const [ta, xa] = trail[0] || [0, 0], [tb, xb] = trail[trail.length - 1] || [0, 0], v = tb > ta ? (xb - xa) / (tb - ta) : 0;
    const dir = dx < 0 ? 1 : -1, next = S.cur + dir, from = offset();
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
function render() {
  showPlace();
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
  // a new temperature rolls in, up if it's warmer, down if it's cooler (as iOS's numbers do)
  const tEl = $("now-temp"), t = f.temp(c.temp);
  if (tEl.textContent !== t) {
    const warmer = parseFloat(t) >= parseFloat(tEl.textContent);
    tEl.textContent = t;
    if (tEl.dataset.shown && !calm.matches) { tEl.classList.remove("roll-up", "roll-down"); void tEl.offsetWidth; tEl.classList.add(warmer ? "roll-up" : "roll-down"); }
    tEl.dataset.shown = "1";
  }
  // (only when it changes: it's moving, and drawn again it would start over)
  const icon = iconOf(c.code, c.isDay), iconEl = $("now-icon");
  if (iconEl.dataset.icon !== icon || !iconEl.firstChild) { iconEl.innerHTML = weatherIcon(icon, 76); iconEl.dataset.icon = icon; }
  $("now-cond").textContent = label(c.code, c.isDay);
  $("place-now").textContent = `${f.temp(c.temp)} · ${label(c.code, c.isDay)}`;
  $("place-temp").textContent = f.temp(c.temp);
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
  const tag = c.level === "alert" ? "Alert" : c.level === "warn" ? "Warning" : null;
  return h("article", { class: "ins", "data-level": c.level },
    h("div", { class: "ins-icon", svg: glyph(c.icon, 18) }),
    h("h3", {}, tag ? [h("span", { class: "tag" }, tag), " "] : null, c.title),
    h("p", {}, c.text));
}
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
// An insight in its card: its title and a line of what it says, and where there's more than a line, a tap for the
// rest (the row opening to it, and closing again)
const FIRST_INSIGHTS = 3;
function insightRow(c) {
  const row = h("div", { class: "ins-row", role: "listitem", "data-level": c.level },
    h("button", { class: "ins-head", type: "button", "aria-expanded": "false", onclick: () => openRow(row) },
      h("span", { class: "ins-icon", svg: glyph(c.icon, 16) }),
      h("span", { class: "ins-words" }, h("span", { class: "ins-title" }, c.title), h("span", { class: "ins-line" }, c.text)),
      h("span", { class: "ins-chev", svg: glyph("chevron", 16) })));
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
  for (const r of box.querySelectorAll(".ins-row:not(.open)")) {
    const l = r.querySelector(".ins-line");
    const whole = l.scrollHeight <= l.clientHeight + 1, head = r.querySelector(".ins-head");
    r.classList.toggle("whole", whole);
    whole ? head.removeAttribute("aria-expanded") : head.setAttribute("aria-expanded", "false");
  }
}
new ResizeObserver(() => { if ($("insights").clientWidth !== insWidth) fits(); }).observe($("insights"));

function hourly(wx, now) {
  const f = S.f, hrs = I.hoursFrom(wx, now, 48), strip = $("hourly-strip");
  // (the strip again only if what it shows has changed: not for every other part of the forecast arriving)
  const sig = `${cell(wx.place.lat, wx.place.lon)}|${wx.fetchedAt}|${hrs[0]?.t}|${wx.current?.temp}|${wx.current?.code}|${JSON.stringify(f.units)}`;
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
function drawHourChart(wx, now, hrs, host, mode, showNow) {
  const f = S.f, t = T(), wn = W();
  const nights = [];
  let run = null;
  for (const x of hrs) { if (!x.isDay) { if (!run) run = [x.t, x.t + HOUR]; else run[1] = x.t + HOUR; } else if (run) { nights.push(run); run = null; } }
  if (run) nights.push(run);
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
    const marks = I.spells(hrs).slice(0, 3).map((s) => { const top = s.hours.reduce((a, b) => (b.precip > a.precip ? b : a)); return top.precip >= 0.3 ? { t: top.t, v: Math.min(100, top.pop ?? 100), text: f.precip(top.precip) } : null; }).filter(Boolean);
    timeChart(host, { ...common, kind: "columns", color: COLOR.rain, points: pts, marks,
      y: { min: 0, max: 100, ticks: [0, 50, 100], fmt: (v) => `${v}%` },
      summary: `Chance of rain, hour by hour. ${marks.length ? `Wettest hours: ${marks.map((m) => `${f.time(m.t)} (${m.text})`).join(", ")}.` : "Little or no rain expected."}`,
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

function daily(wx, now) {
  const f = S.f, days = wx.daily.filter((d) => d.date >= dayStart(now)).slice(0, 16);
  if (!days.length) return;
  $("daily-n").textContent = `${days.length}-day`;
  const conf = I.confidence(wx);
  const lo = Math.min(...days.map((d) => d.tmin)), hi = Math.max(...days.map((d) => d.tmax)), span = Math.max(1, hi - lo);
  const curT = wx.current?.temp;
  const rows = days.map((d, i) => {
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
    return h("li", { class: i === 7 ? "far" : null }, i === 7 ? h("span", { class: "far-note" }, "Less certain") : null, h("button", { class: "day-row", type: "button", onclick: () => openDay(d.key), "aria-label": `${f.day(d.date, now)}: ${label(d.code)}, high ${f.temp(d.tmax)}, low ${f.temp(d.tmin)}${pop ? `, ${pop} chance of rain` : ""}${unsure ? ", uncertain" : ""}` },
      h("span", { class: "d-name" }, name, h("small", { class: unsure ? "unsure" : "" }, unsure ? "Uncertain" : f.date(d.date))),
      h("span", { class: "d-icon" }, h("span", { svg: weatherIcon(iconOf(d.code, true), 30) }), h("span", { class: "d-pop" }, pop)),
      h("span", { class: "d-lo" }, f.temp(d.tmin)), bar, h("span", { class: "d-hi" }, f.temp(d.tmax))));
  });
  $("days").replaceChildren(...rows);
  motion("days", ...rows);
}

// The best times: those worth it today or tomorrow, each a tile; those that aren't, named in a line under them (a
// tap shows them too, faded)
function windows(wx, now) {
  const f = S.f, list = I.windows(wx, now, f, { activities: S.settings.activities, extras: S.settings.extras });
  const tile = (w) => h("div", { class: `win${w.rating === "Poor" ? " poor" : ""}` },
    h("div", { class: "win-name" }, h("span", { svg: glyph(w.icon, 16) }), w.name),
    h("div", { class: "win-day" }, h("span", {}, w.start == null ? "Not today or tomorrow" : f.day(w.start, now)), h("span", { class: "win-rate", "data-r": w.rating }, w.rating)),
    w.start == null ? null : h("div", { class: "win-time" }, `${f.time(w.start)}${w.end ? `–${f.time(w.end)}` : ""}`),
    h("div", { class: "win-text" }, w.text));
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

function tile(title, icon, ...kids) { return h("section", { class: "tile" }, h("h3", {}, h("span", { svg: glyph(icon, 14) }), title), ...kids); }
function tiles(wx, now) {
  const f = S.f, c = wx.current || I.hourAt(wx, now), out = [], d = I.dayOf(wx, now);
  // feels like
  const diff = (c.feels ?? c.temp) - c.temp;
  out.push(tile("Feels like", "heat", h("div", { class: "big" }, f.temp(c.feels)),
    h("p", { class: "sub" }, diff <= -2 ? ((c.wind ?? 0) >= 12 ? `Wind makes it feel ${f.delta(diff)} colder.` : `Feels ${f.delta(diff)} colder.`) : diff >= 2 ? `Humidity makes it feel ${f.delta(diff)} warmer.` : "Close to the actual temperature.")));
  // wind
  const bf = beaufort(c.wind ?? 0), dir = c.dir ?? 0;
  const comp = `<svg class="compass" viewBox="0 0 80 80" aria-hidden="true"><circle class="ring" cx="40" cy="40" r="33"/>${[0, 90, 180, 270].map((a) => `<line class="tick" x1="40" y1="6" x2="40" y2="11" transform="rotate(${a} 40 40)"/>`).join("")}<text x="40" y="20" text-anchor="middle">N</text><text x="62" y="43" text-anchor="middle">E</text><text x="40" y="66" text-anchor="middle">S</text><text x="18" y="43" text-anchor="middle">W</text><g class="needle-g"><path class="needle" transform="rotate(${(dir + 180) % 360} 40 40)" d="M40 14l6 30h-12z"/></g><circle cx="40" cy="40" r="3" fill="#fff"/></svg>`;
  out.push(tile("Wind", "wind", h("div", { class: "wind-row" }, h("div", {}, h("div", { class: "big" }, String(f.windNum(c.wind)), h("small", {}, f.windUnit)), h("p", {}, `Gusts ${f.windNum(c.gust)}`)), h("div", { svg: comp })),
    h("p", { class: "sub" }, `${bf.name}, from the ${compassWord(dir)}.`)));
  // humidity
  const dew = c.dew;
  const comfort = dew == null ? "" : dew < 10 ? "Dry and fresh" : dew < 15 ? "Comfortable" : dew < 18 ? "A little humid" : dew < 21 ? "Humid" : "Very humid and oppressive";
  out.push(tile("Humidity", "drop", h("div", { class: "big" }, `${Math.round(c.rh ?? 0)}%`), h("p", { class: "sub" }, `Dew point ${f.temp(dew)}. ${comfort}.`)));
  // rain: the last day and the next
  const past = I.hoursBetween(wx, now - DAY, now).reduce((a, x) => a + (x.precip || 0), 0), next = I.hoursBetween(wx, now, now + DAY).reduce((a, x) => a + (x.precip || 0), 0);
  out.push(tile("Rain", "rain", h("div", { class: "big" }, f.precip(next)), h("p", {}, "in the next 24 hours"), h("p", { class: "sub" }, `${f.precip(past)} in the last 24.`)));
  // pressure
  const p3 = I.hourAt(wx, now - 3 * HOUR)?.pressure, dp = c.pressure != null && p3 != null ? c.pressure - p3 : null;
  out.push(tile("Pressure", "gauge", h("div", { class: "big" }, f.pressure(c.pressure).replace(/ (\S+)$/, ""), h("small", {}, f.pressure(c.pressure).split(" ").pop())),
    h("p", { class: "sub" }, dp == null ? "" : Math.abs(dp) < 1 ? "Steady." : `${dp < 0 ? "Falling" : "Rising"} ${f.pressureDelta(dp)} in 3 hours${dp <= -3 ? ": unsettled" : dp >= 3 ? ": settling" : ""}.`)));
  // visibility
  const vis = c.vis;
  out.push(tile("Visibility", "eye", h("div", { class: "big" }, f.dist(vis)), h("p", { class: "sub" }, vis == null ? "" : vis >= 20000 ? "Excellent." : vis >= 10000 ? "Good." : vis >= 4000 ? "A little haze." : vis >= 1000 ? "Mist or haze." : "Fog.")));
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
      up ? `<path class="done" pathLength="1" d="${done}"/><circle class="sun" cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="6"/>`
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
  motion("tiles", ...out);
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
    h("p", { class: "small muted" }, `${st.name} (${st.km} km) · last ${s.days} days`),
    h("table", { class: "models acc" }, h("caption", { class: "sr-only" }, "Each model's average error and lean, next-day forecasts"),
      h("tr", {}, h("th", { scope: "col" }, "Model"), h("th", { scope: "col" }, "Highs"), h("th", { scope: "col" }, "Lows"), h("th", { scope: "col" }, "Leans")),
      ...s.models.map((m, i) => h("tr", {}, h("td", {}, m.name, i === 0 ? h("span", { class: "best" }, "Best") : null), h("td", {}, `±${f.deltaFine(m.hiMae)}`),
        h("td", {}, m.loMae != null ? `±${f.deltaFine(m.loMae)}` : "–"), h("td", {}, Math.abs(m.hiBias) >= 0.5 ? `${f.deltaFine(m.hiBias)} ${m.hiBias > 0 ? "warm" : "cold"}` : "–")))),
    s.days < TUNE_DAYS ? h("p", { class: "chart-note" }, `Tuning starts at ${TUNE_DAYS} days.`) : null].filter(Boolean));
}

// One day in full, in its sheet; the days along the top to move between (or a swipe sideways, or the arrow keys)
function openDay(key, dir = 0) {
  const wx = S.wx; if (!wx) return;
  const f = S.f, now = nowWall(wx.place.offset), d = wx.daily.find((x) => x.key === key); if (!d) return;
  S.dayKey = key;
  $("day-title").textContent = `${f.day(d.date, now)}, ${f.dateLong(d.date)}`;
  const days = sheetDays(wx, now), strip = $("day-strip"), inStrip = strip.contains(document.activeElement);
  strip.replaceChildren(...days.map((x, i) => h("button", { type: "button", class: "ds-day", "aria-current": x.key === key ? "true" : null, "aria-label": `${f.day(x.date, now)}, ${f.dateLong(x.date)}`,
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
    // (ECMWF's ensemble: where the high and low most likely land, the middle 80% of its runs, tuned as the day is)
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
    const lat = pos.coords.latitude, lon = pos.coords.longitude;
    // (hardly moved since last time, under a kilometre: the name it had, rather than asking again)
    const was = S.places.find((x) => x.gps && x.name !== "My Location" && Math.abs(x.lat - lat) < 0.009 && Math.abs(x.lon - lon) < 0.009 / Math.max(0.2, Math.cos(lat * Math.PI / 180)));
    const name = was ? { name: was.name, region: was.region } : await nameOf(lat, lon);
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
      h("button", { class: "row-btn", type: "button", "aria-current": i === S.cur ? "true" : "false", onclick: () => { S.cur = i; savePlaces(); closeSheet($("places")); go(); } },
        k ? h("span", { svg: weatherIcon(iconOf(k.code, k.isDay), 30) }) : null,
        h("span", { class: "rb-main" }, h("span", { class: "rb-name" }, p.name), h("span", { class: "rb-sub" }, p.gps && p.name !== "My Location" ? "My Location" : p.region || "")),
        k ? h("span", { class: "rb-temp" }, f.temp(k.temp)) : null),
      S.places.length > 1 ? h("button", { class: "del", type: "button", "aria-label": `Remove ${p.name}`, svg: glyph("trash", 18), onclick: () => {
        const was = place(); S.places.splice(i, 1); S.cur = Math.max(0, S.places.indexOf(was)); savePlaces(); drawSaved(); if (was !== place()) go();
      } }) : null);
  }));
}
let searchTimer = null, searchSeq = 0;
function onSearch(now = false) {
  clearTimeout(searchTimer);
  const q = $("search").value.trim(), out = $("results");
  if (q.length < 2) { out.replaceChildren(); S.pick = S.searching = false; return; }
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
      // (Enter pressed before the places came back: take the first now)
      if (S.pick && list.length) { S.pick = false; out.querySelector(".row-btn")?.click(); }
    } catch (_) { if (my === searchSeq) { S.searching = false; out.replaceChildren(h("li", { class: "muted small" }, "Search isn't available right now.")); } }
  }, now === true ? 0 : 280);
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
  saveSettings(); afterFrame(redraw);
  // notifications speak your units too
  const n = S.settings.notify;
  if ((n.rain || n.brief) && units !== ["temp", "wind", "precip", "clock"].map((k) => S.settings[k]).join()) syncNotify().catch(() => {});
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
// tell the server what this phone wants (or that it wants nothing)
// (one at a time, each with the settings as they are when its turn comes: two quick changes can't race each other)
let syncs = Promise.resolve();
function syncNotify() {
  const run = syncs.then(syncNow);
  syncs = run.catch(() => {});
  return run;
}
async function syncNow() {
  const n = S.settings.notify;
  if (!n.rain && !n.brief) {
    const sub = "serviceWorker" in navigator ? await pushSub(false).catch(() => null) : null;
    if (sub) { await post("/api/weather/unsubscribe", { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe().catch(() => {}); }
    n.endpoint = null; saveSettings();
    return;
  }
  const sub = await pushSub(true), j = sub.toJSON();
  await post("/api/weather/subscribe", { sub: { endpoint: j.endpoint, keys: j.keys }, place: n.place, rain: n.rain, brief: n.brief, briefAt: n.briefAt, was: n.endpoint || undefined,
    units: { temp: S.settings.temp, wind: S.settings.wind, precip: S.settings.precip, clock: S.settings.clock } });
  n.endpoint = j.endpoint; n.syncedAt = Date.now(); saveSettings();
}
// with notifications on, now and then (and whenever the browser's changed this phone's subscription), the server's told
// again, so they keep coming (it forgets phones it hasn't heard from in months)
async function keepNotify() {
  const n = S.settings.notify;
  if (!(n.rain || n.brief) || !("serviceWorker" in navigator) || !("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const sub = await pushSub(false);
    if (sub && sub.endpoint === n.endpoint && Date.now() - (n.syncedAt || 0) < 7 * 864e5) return;
    await syncNotify();
  } catch (_) {}
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
    if (perm !== "granted") { st.textContent = "Notifications weren't allowed."; drawNotify(true); return; }
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
  $("notify-place").textContent = on && n.place ? `For ${n.place.gps ? `My Location (${n.place.name})` : n.place.name}.` : "For the place on screen when you turn them on.";
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

const sheetDays = (wx, now) => wx.daily.filter((x) => x.date >= dayStart(now)).slice(0, 16);
// (quiet: without its own slide in, when a swipe's moving it)
function stepDay(n, quiet = false) {
  if (!S.wx || !$("day").open) return;
  const days = sheetDays(S.wx, nowWall(S.wx.place.offset)), i = days.findIndex((x) => x.key === S.dayKey), next = days[i + n];
  if (i >= 0 && next) openDay(next.key, quiet ? 0 : n);
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
  const k = `${cell(S.wx.place.lat, S.wx.place.lon)}:${key}`, old = drawn.get(k);
  drawn.set(k, els);
  els.forEach((e, i) => {
    const o = old?.[i];
    if (o) seen.unobserve(o);
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
  // and still: styles.css), so it's restyled once, with the sheet
  document.querySelector(".page").style.transformOrigin = `50% ${scrollY}px`;
  document.body.style.setProperty("--recede", "1");
  document.body.classList.add("sheet-up");
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
  document.body.style.setProperty("--recede", "0");
  let gone = false;
  const done = () => { if (gone) return; gone = true; d.classList.remove("closing"); d.close(); };
  d.addEventListener("animationend", done, { once: true });
  setTimeout(done, 450);
}
function sheetGestures(d) {
  d.addEventListener("cancel", (e) => { e.preventDefault(); closeSheet(d); });
  d.addEventListener("close", () => { if (!document.querySelector("dialog[open]")) document.body.classList.remove("sheet-up", "sheet-drag"); });
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
    document.body.style.setProperty("--recede", String(Math.max(0, 1 - pull / 420)));
  }, { passive: false });
  const end = () => {
    if (y0 == null) return;
    const v = dy / Math.max(1, performance.now() - t0), dragged = d.classList.contains("dragging");
    y0 = null; d.classList.remove("dragging"); document.body.classList.remove("sheet-drag");
    if (!dragged) return;
    if (dy > 120 || (dy > 30 && v > 0.55)) closeSheet(d, dy);
    else { d.style.transform = ""; document.body.style.setProperty("--recede", "1"); }
  };
  d.addEventListener("touchend", end); d.addEventListener("touchcancel", end);
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
  // each sheet: closing by Escape or a tap outside, and swiping down
  for (const d of document.querySelectorAll("dialog.sheet")) sheetGestures(d);
  {
    // a swipe across the day to the next day or the one before, as across the page between places: the day follows the
    // finger (giving at the first and last), and let go far enough, or flicked, it carries on out as the next comes in
    // from the other side; not far enough, it springs back (a chart's own sideways is its readout)
    const body = $("day").querySelector(".sheet-body"), page = $("day-body");
    let x0 = null, y0 = 0, dx = 0, axis = null, trail = [], raf = 0, moving = false;
    const W = () => body.clientWidth;
    const atEnd = (d) => { const days = sheetDays(S.wx, nowWall(S.wx.place.offset)), i = days.findIndex((x) => x.key === S.dayKey); return (d > 0 && i <= 0) || (d < 0 && i >= days.length - 1); };
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
      const [ta, xa] = trail[0] || [0, 0], [tb, xb] = trail[trail.length - 1] || [0, 0], v = tb > ta ? (xb - xa) / (tb - ta) : 0;
      const dir = dx < 0 ? 1 : -1, from = offset(), o = fade(from), w = W(), edge = atEnd(dx);
      const far = Math.abs(dx) > w * 0.28, flung = Math.abs(v) > 0.3 && Math.sign(v) === Math.sign(dx) && Math.abs(dx) > 16;
      clear();
      if (edge || !(far || flung)) {
        if (!calm.matches && from) page.animate([{ translate: `${from}px 0`, opacity: o }, { translate: "0 0", opacity: 1 }], glide(-Math.sign(from) * (edge ? v * band(dx) : v), Math.abs(from), "cubic-bezier(0.25, 1, 0.4, 1)"));
        return;
      }
      if (calm.matches) { stepDay(dir, true); return; }
      // (out the way it was going, at about the speed it was let go at; then the next in from the other side)
      moving = true;
      const ms = Math.round(Math.min(200, Math.max(110, (w * 0.45 - Math.abs(from)) / Math.max(Math.abs(v), 1.2) + 60)));
      const out = page.animate([{ translate: `${from}px 0`, opacity: o }, { translate: `${-dir * Math.max(w * 0.5, Math.abs(from) + 48)}px 0`, opacity: 0 }], { duration: ms, easing: "cubic-bezier(0.3, 0.3, 0.8, 0.6)", fill: "forwards" });
      out.finished.then(() => {
        stepDay(dir, true);
        const inn = page.animate([{ translate: `${dir * w * 0.32}px 0`, opacity: 0 }, { translate: "0 0", opacity: 1 }], { duration: 400, easing: "cubic-bezier(0.22, 0.8, 0.3, 1)" });
        out.cancel();
        return inn.finished;
      }).catch(() => {}).finally(() => { moving = false; });
    };
    body.addEventListener("touchend", end); body.addEventListener("touchcancel", end);
    $("day").addEventListener("keydown", (e) => {
      if ((e.key !== "ArrowLeft" && e.key !== "ArrowRight") || e.target.closest(".chart, input, select")) return;
      e.preventDefault(); stepDay(e.key === "ArrowRight" ? 1 : -1);
    });
  }
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
  $("settings-btn").addEventListener("click", () => { drawSettings(); openSheet($("settings")); });
  $("settings-form").addEventListener("change", readSettings);
  for (const k of ["rain", "brief", "briefAt"]) $("settings-form")[k].addEventListener("change", onNotify);
  $("notify-here").addEventListener("click", () => { S.settings.notify.place = hereForNotify(); saveSettings(); $("notify-status").textContent = "Saving…"; syncNotify().then(() => { $("notify-status").textContent = "Moved to this place."; }, (e) => { $("notify-status").textContent = `Couldn't save that just now (${e.message}).`; }); drawNotify(true); });
  $("act-add").addEventListener("change", addAct);
  for (const b of document.querySelectorAll(".radar-play")) b.innerHTML = `<span class="ic g-off">${glyph("play", 16)}</span><span class="ic g-on">${glyph("pause", 16)}</span>`;
  for (const b of document.querySelectorAll(".radar-full")) b.innerHTML = `<span class="ic g-off">${glyph("expand", 16)}</span><span class="ic g-on">${glyph("shrink", 16)}</span>`;
  $("refresh-btn").addEventListener("click", () => go(true));
  for (const b of document.querySelectorAll("[data-credits]")) b.addEventListener("click", () => openCredits(b.dataset.credits));
  for (const a of document.querySelectorAll(".credits a")) a.insertAdjacentHTML("beforeend", glyph("out", 16, "cr-out"));
  $("retry-btn").addEventListener("click", () => go(true));
  const drawModeChart = () => { if (S.wx) { const now = nowWall(S.wx.place.offset); drawHourChart(S.wx, now, I.hoursFrom(S.wx, now, 48), $("hourly-chart"), S.mode, true); } };
  $("hourly-seg").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-mode]"); if (!b) return;
    S.mode = b.dataset.mode;
    const tabs = [...$("hourly-seg").children];
    for (const x of tabs) x.setAttribute("aria-selected", String(x === b));
    $("hourly-seg").style.setProperty("--seg-i", String(tabs.indexOf(b)));
    // (the chart once the lens is on its way)
    afterFrame(drawModeChart);
  });
  $("hourly-seg").addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const tabs = [...$("hourly-seg").children], i = tabs.findIndex((x) => x.getAttribute("aria-selected") === "true");
    const n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); n.click();
  });
  // on a wide screen the climate card joins the left column, under the 16 days, so the columns balance
  const wide = matchMedia("(min-width: 980px)"), dock = () => (wide.matches ? $("daily") : $("windows")).after($("climate"));
  dock(); wide.addEventListener("change", dock);
  // as the page scrolls past the big temperature, it fades and the bar takes up the temperature (iOS's collapsing title)
  const top = document.querySelector(".top"), heroEl = document.querySelector(".hero");
  let ticking = 0;
  const onScroll = () => {
    ticking = 0;
    const c = Math.min(1, Math.max(0, scrollY / Math.max(80, heroEl.offsetHeight - 40))), cs = Math.min(1, Math.max(0, (c - 0.55) / 0.35));
    heroEl.style.setProperty("--c", c.toFixed(3)); top.style.setProperty("--cs", (cs * cs * (3 - 2 * cs)).toFixed(3));
    heroEl.classList.toggle("away", c >= 0.99);          // (scrolled out of sight: its icon stops moving)
    document.body.classList.toggle("deep", c >= 0.99);   // (and the sky behind the cards: styles.css)
    top.classList.toggle("scrolled", scrollY > 8);
  };
  addEventListener("scroll", () => { ticking ||= requestAnimationFrame(onScroll); }, { passive: true });
  onScroll();
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
