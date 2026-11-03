// Weather Settings under the roof (One roof, spec §7.1, §7.4, §4.3, WS): one framework sheet, its pages pushed onto it.
// Frozen: openSettings(ctx, page) → sheet Handle | null: data-sheet=wxsettings; page: null (the list of pages) or one of
//   "units" | "arrange" | "best" | "commute" | "solar" | "forecast", opened straight at it (a pushed page whose container
//   is [data-page=<page>]); on the list, a row per page [data-go=<page>], and a Notifications row
//   a[href="/#you=notify-weather"]. Each control sits in an element [data-key=<top-level wx:settings key>] (temp, wind,
//   precip, pressure, clock, layout, activities, commute, solar, tune, extras); a segmented control is ui.seg's
//   button[role=radio][data-value]. Saves go through ctx.core.saveSettings(patch) with only the keys edited.
// Also here (added, for the pages and roofwxsettings.test): PATCH, the patch each page saves, built from the settings as
// they are (pure: never mutates what it's given); moveCard / showCard / resetLayout, Arrange Now's moves, which never
// list `daily` or `radar` (sections under the roof) and leave their positions and off-state in `layout` as they were.
// Not here: the Look page (no glass under the roof; core.saveSettings keeps `glass`), notifications (You's Weather
// Notifications sheet, /#you=notify-weather; settings.notify travels untouched), the account (You).
import { FACES, PITCHES, MAX_ZONES, zoneSaid, facesName } from "../solar.js";
import { ACTIVITIES, limitsText } from "../insights.js";
import { makeFormat } from "../format.js";
import { nkeyOf } from "../account.js";

export const PAGES = Object.freeze(["units", "arrange", "best", "commute", "solar", "forecast"]);
const TITLES = { units: "Units", arrange: "Arrange Now", best: "Best Times", commute: "Commute", solar: "Solar", forecast: "Forecast" };

// Units: the same choices as Weather's own Settings, in the same order (index.html #settings-form)
export const UNITS = Object.freeze({
  temp: ["Temperature", [["c", "°C"], ["f", "°F"]]],
  wind: ["Wind", [["mph", "mph"], ["kmh", "km/h"], ["ms", "m/s"], ["kn", "knots"]]],
  precip: ["Rain", [["mm", "mm"], ["in", "inches"]]],
  pressure: ["Pressure", [["hpa", "hPa"], ["inhg", "inHg"], ["mmhg", "mmHg"]]],
  clock: ["Clock", [["24", "24-hour"], ["12", "12-hour"]]],
});
export const EXTRAS = Object.freeze([["laundry", "Drying washing outside"], ["stars", "Stargazing"], ["sunset", "Sunset and sunrise colour"]]);
// the cards that are sections under the roof: never listed in Arrange Now, left where they are
export const FIXED = Object.freeze(["daily", "radar"]);
const ZSIZES = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 10, 12, 15, 20];
const ZNAMES = ["Roof", "Second roof", "Third roof", "Garage", "Shed", "Zone 6"];
const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

/* ---------- Arrange Now: pure moves over layout { order, off } ---------- */
const slotsOf = (order) => order.map((k, i) => (FIXED.includes(k) ? -1 : i)).filter((i) => i >= 0);
// k moved by one place among the listed cards (by -1 up, +1 down): it trades places with its listed neighbour, so the
// fixed cards keep their indices. → the new layout, or null when it can't move
export function moveCard(layout, k, by) {
  const order = [...layout.order], slots = slotsOf(order), j = slots.findIndex((i) => order[i] === k), t = j + by;
  if (j < 0 || t < 0 || t >= slots.length) return null;
  [order[slots[j]], order[slots[t]]] = [order[slots[t]], order[slots[j]]];
  return { order, off: [...layout.off] };
}
export function showCard(layout, k, on) {
  if (FIXED.includes(k) || !layout.order.includes(k)) return null;
  const off = on ? layout.off.filter((x) => x !== k) : [...new Set([...layout.off, k])];
  return { order: [...layout.order], off };
}
// the listed cards back in their usual order (CARDS) and all shown; the fixed ones as they were
export function resetLayout(layout, cards) {
  const usual = cards.map((c) => c[0]).filter((k) => !FIXED.includes(k) && layout.order.includes(k)), order = [...layout.order];
  slotsOf(order).forEach((i, n) => { order[i] = usual[n]; });
  return { order, off: layout.off.filter((k) => FIXED.includes(k)) };
}
const listed = (layout) => layout.order.filter((k) => !FIXED.includes(k));

/* ---------- the patch each page saves (only the keys it edits) ---------- */
export const PATCH = {
  units: (s, key, value) => (UNITS[key]?.[1].some(([v]) => v === value) ? { [key]: value } : null),
  arrange: (s, layout) => (layout ? { layout: clone(layout) } : null),
  best: (s, activities) => ({ activities: clone(activities) }),
  commute: (s, change) => ({ commute: { on: false, am: "08:00", pm: "17:30", ...clone(s.commute), ...change } }),
  // (on only with a zone to be on for, as Weather's own Settings has it)
  solar: (s, change) => { const v = { on: false, alert: true, zones: [], ...clone(s.solar), ...clone(change) }; v.on = !!v.on && v.zones.length > 0; return { solar: v }; },
  tune: (s, on) => ({ tune: !!on }),
  extras: (s, k, on) => ({ extras: { laundry: true, stars: true, sunset: true, ...clone(s.extras), [k]: !!on } }),
};
// a new zone, at the place shown (or another saved one; with only My Location saved, where that is now, and kept there)
export function newZone(s, places, cur) {
  const zones = s.solar?.zones || [], here = places[cur];
  const p = (here && !here.gps ? here : null) || places.find((x) => !x.gps) || places.find((x) => x.gps);
  if (!p || zones.length >= MAX_ZONES) return null;
  const names = new Set(zones.map((z) => z.name));
  return { id: `z${Date.now().toString(36)}`, name: ZNAMES.find((x) => !names.has(x)) || "Zone", lat: p.lat, lon: p.lon,
    place: p.gps && p.name === "My Location" ? "" : String(p.name || "").slice(0, 60), faces: "S", pitch: 35, kw: null };
}
export function newActivity(id) {
  const a = id === "custom" ? { id: `my${Date.now().toString(36)}`, name: "My activity", icon: "star", tmin: 10, tmax: 22, windMin: 0, windMax: 30, gustMax: 50, rain: "dry", hours: 2, from: 8, to: 20 }
    : ACTIVITIES[id] ? { id, ...ACTIVITIES[id] } : null;
  return a && { ...a, on: true };
}

/* ---------- what each row on the list says ---------- */
const atText = (f, at) => { const [hh, mm] = String(at || "07:00").split(":").map(Number); return f.time(Date.UTC(2000, 0, 1, hh || 0, mm || 0)); };
const unitWord = (key, v) => UNITS[key][1].find((o) => o[0] === v)?.[1] || "";
export function summary(page, s, f, cards = []) {
  switch (page) {
    case "units": return ["temp", "wind", "precip"].map((k) => unitWord(k, s[k])).join(", ");
    case "arrange": {
      const L = s.layout || { order: [], off: [] }, mine = listed(L), off = mine.filter((k) => L.off.includes(k)).length;
      const usual = mine.join() === cards.map((c) => c[0]).filter((k) => mine.includes(k)).join();
      return off ? `${off} off` : usual ? "As usual" : "Your order";
    }
    case "best": { const on = (s.activities || []).filter((a) => a.on !== false).map((a) => a.name); return on.length ? on.join(", ") : "Off"; }
    case "commute": return s.commute?.on ? `${atText(f, s.commute.am)}, ${atText(f, s.commute.pm)}` : "Off";
    case "solar": { const z = s.solar?.zones || []; return !s.solar?.on ? "Off" : z.length > 1 ? `${z.length} zones` : `${facesName(z[0].faces)}, ${z[0].pitch ? `${z[0].pitch}°` : "flat"}`; }
    case "forecast": return s.tune !== false ? "Tuned" : "Not tuned";
  }
  return "";
}

/* ---------- the sheet ---------- */
let shown = null;

export function openSettings(ctx, page = null) {
  const { core, fw } = ctx, S = ctx.S || core.S, ui = fw.ui;
  if (page != null && !PAGES.includes(page)) page = null;
  try { shown?.close(); } catch (_) {}
  const el = ui.el, cards = () => core.CARDS || [];
  const fmt = () => S.f || makeFormat(S.settings || {});
  const st = () => S.settings || core.loadSettings();
  const offs = [];
  let h = null, alive = true, heard = 0;
  const redraws = new Set();
  const redraw = () => { for (const fn of redraws) { try { fn(); } catch (_) {} } };

  // a save: the patch through core (wx:settings + the account), then every open page drawn from what's kept
  async function save(patch) {
    if (!patch) return;
    const was = heard;
    try { await core.saveSettings(patch); }
    catch (_) { fw.toast("Couldn’t save that just now. Try again."); }
    // (core's "settings" event has drawn them already, as a rule)
    if (alive && heard === was) redraw();
  }

  /* -- the list -- */
  // (ui.row's value is words, drawn once: its .ifl-val span is put right on each redraw)
  const rows = new Map();
  const goRow = (p) => {
    const r = ui.row({ title: TITLES[p], value: summary(p, st(), fmt(), cards()) || " ", trail: "chevron", run: () => go(p) });
    r.dataset.go = p;
    rows.set(p, r);
    return r;
  };
  const notifyRow = ui.row({ title: "Notifications", sub: "Rain and warnings for the places you choose", trail: "chevron", href: "/#you=notify-weather", label: "Weather Notifications, in You" });
  notifyRow.addEventListener("click", (e) => {
    if (e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    h?.close();
    fw.nav.go("/#you=notify-weather");
  });
  const root = el("div", { class: "wxs wxs-root" },
    ui.list(["units", "arrange"].map(goRow), { label: "Your page" }),
    ui.list(["best", "commute", "solar", "forecast"].map(goRow), { label: "Highlights" }),
    ui.list([notifyRow], { label: "Notifications" }),
    el("p", { class: "wxs-foot", text: "Notifications for Weather are in You, with every app’s." }));
  redraws.add(() => { const s = st(), f = fmt(); for (const [p, r] of rows) { const v = r.querySelector(".ifl-val"); if (v) v.textContent = summary(p, s, f, cards()); } });

  /* -- Units -- */
  function unitsPage() {
    const box = el("div", { class: "wxs wxs-units" });
    const segs = {};
    for (const [key, [name, opts]] of Object.entries(UNITS)) {
      const seg = ui.seg(opts, st()[key], (v) => save(PATCH.units(st(), key, v)), { label: name });
      segs[key] = seg;
      box.append(el("div", { class: "wxs-opt", data: { key } }, el("span", { class: "wxs-opt-k", aria: { hidden: "true" }, text: name }), seg));
    }
    redraws.add(() => { const s = st(); for (const k in segs) segs[k].set?.(s[k]); });
    return box;
  }

  /* -- Arrange Now -- */
  function arrangePage() {
    const nameOf = (k) => cards().find((c) => c[0] === k)?.[1] || k;
    const said = el("p", { class: "wxs-said", aria: { live: "polite" } });
    const rows = el("div", { class: "wxs-arrange" });
    const wrap = el("div", { class: "wxs", data: { key: "layout" } },
      el("p", { class: "wxs-foot", text: "The cards on Now, in your order. 16 Days and Radar have their own tabs." }),
      rows, said,
      ui.btn("Put Back as It Was", { small: true, act: "reset", run: () => { said.textContent = "Put back as it was."; save(PATCH.arrange(st(), resetLayout(st().layout, cards()))); } }));
    let focus = null;
    function draw() {
      const L = st().layout, ks = listed(L), at = rows.ownerDocument.activeElement;
      // (the button that had the focus has it again in the rows drawn anew)
      if (!focus && at && rows.contains(at)) focus = [at.closest("[data-card]")?.dataset.card, at.dataset.act || (at.tagName === "INPUT" ? "sw" : "up")];
      rows.replaceChildren(...ks.map((k, i) => {
        const name = nameOf(k), on = !L.off.includes(k);
        const up = ui.btn("↑", { small: true, act: "up", label: `Move ${name} up`, run: () => move(k, -1) });
        const down = ui.btn("↓", { small: true, act: "down", label: `Move ${name} down`, run: () => move(k, 1) });
        up.disabled = i === 0; down.disabled = i === ks.length - 1;
        const r = el("div", { class: `wxs-card${on ? "" : " is-off"}`, data: { card: k } },
          ui.sw(on, (v) => { save(PATCH.arrange(st(), showCard(st().layout, k, v))); }, { label: `Show ${name}` }),
          el("span", { class: "wxs-card-n", text: name }), up, down);
        return r;
      }));
      if (focus) { const [k, act] = focus; focus = null; const b = rows.querySelector(act === "sw" ? `[data-card="${k}"] input` : `[data-card="${k}"] [data-act="${act}"]`); (b && !b.disabled ? b : rows.querySelector(`[data-card="${k}"] [data-act]:not(:disabled)`))?.focus({ preventScroll: true }); }
    }
    function move(k, by) {
      const L = moveCard(st().layout, k, by);
      if (!L) return;
      const ks = listed(L);
      said.textContent = `${nameOf(k)}: ${ks.indexOf(k) + 1} of ${ks.length}.`;
      focus = [k, by < 0 ? "up" : "down"];
      save(PATCH.arrange(st(), L));
    }
    draw();
    redraws.add(draw);
    return wrap;
  }

  /* -- Best Times -- */
  function bestPage() {
    const list = el("div", { class: "wxs-acts" });
    const add = el("select", { class: "wxs-sel", aria: { label: "Add an activity" } });
    add.addEventListener("change", () => {
      const a = newActivity(add.value); add.value = "";
      if (!a) return;
      const acts = [...clone(st().activities || []), a];
      save(PATCH.best(st(), acts)).then(() => { if (a.id.startsWith("my")) actPage(acts.length - 1); });
    });
    const wrap = el("div", { class: "wxs", data: { key: "activities" } }, list,
      el("label", { class: "wxs-line" }, el("span", { text: "Add an activity" }), add),
      el("p", { class: "wxs-foot", text: "The best hours for each, from the weather you like it in." }));
    const draw = () => keepFocus(list, "activity", () => {
      const acts = st().activities || [], f = fmt(), have = new Set(acts.map((a) => a.id));
      list.replaceChildren(ui.list(acts.map((a, i) => {
        const r = el("div", { class: "wxs-act", data: { activity: a.id } },
          ui.row({ title: a.name, sub: limitsText(a, f), trail: "chevron", run: () => actPage(i), label: `${a.name}, ${limitsText(a, f)}: change` }),
          ui.sw(a.on !== false, (v) => { const next = clone(st().activities); if (!next[i]) return; next[i].on = v; save(PATCH.best(st(), next)); }, { label: a.name }));
        return r;
      })));
      add.replaceChildren(el("option", { value: "", text: "Choose…" }),
        ...Object.entries(ACTIVITIES).filter(([id]) => !have.has(id)).map(([id, a]) => el("option", { value: id, text: a.name })),
        el("option", { value: "custom", text: "Something else…" }));
    });
    draw();
    redraws.add(draw);
    return wrap;
  }
  // one activity's limits, in your units; each change kept as it's made
  function actPage(i) {
    const a0 = st().activities?.[i];
    if (!a0) return;
    const id = a0.id, f = fmt();
    const tU = (c) => Math.round(f.units.temp === "f" ? c * 9 / 5 + 32 : c), tM = (v) => (f.units.temp === "f" ? (v - 32) * 5 / 9 : v);
    const wk = f.windNum(1000) / 1000, wU = (k) => Math.round(k * wk), wM = (v) => v / wk;
    const num = (name, text, v, unit, signed) => el("label", { class: "wxs-fld" }, el("span", { text }),
      el("span", { class: "wxs-in" }, el("input", { type: "number", name, value: String(v), step: "1", ...(signed ? {} : { inputmode: "numeric" }) }), unit ? el("small", { text: unit }) : null));
    const sel = (name, text, opts, v) => el("label", { class: "wxs-fld" }, el("span", { text }),
      el("select", { name, class: "wxs-sel" }, ...opts.map(([k, t]) => { const o = el("option", { value: String(k), text: t }); o.selected = String(k) === String(v); return o; })));
    const hours = Array.from({ length: 25 }, (_, k) => [k, k === 24 ? "midnight" : f.time(Date.UTC(2000, 0, 1, k))]);
    const form = el("div", { class: "wxs wxs-edit", data: { key: "activities" } },
      el("label", { class: "wxs-fld wide" }, el("span", { text: "Name" }), el("input", { type: "text", name: "name", value: a0.name, maxlength: "24" })),
      num("tmin", "Feels like from", tU(a0.tmin), "°", true), num("tmax", "to", tU(a0.tmax), "°", true),
      num("windMin", "Wind at least", wU(a0.windMin || 0), f.windUnit), num("windMax", "Wind at most", wU(a0.windMax), f.windUnit),
      num("gustMax", "Gusts at most", wU(a0.gustMax), f.windUnit),
      sel("rain", "Rain", [["dry", "Must be dry"], ["light", "Light rain is fine"], ["any", "Any weather"]], a0.rain),
      num("hours", "For (hours)", a0.hours), sel("from", "Between", hours, a0.from), sel("to", "and", hours, a0.to));
    const sure = ui.btn("Remove", { destructive: true, act: "delete", run: () => {
      if (!sure.dataset.sure) { sure.dataset.sure = "1"; sure.textContent = `Remove “${a0.name}”?`; return; }
      const acts = clone(st().activities), at = acts.findIndex((x) => x.id === id);
      if (at < 0) return;
      acts.splice(at, 1); gone = true; h.pop(); save(PATCH.best(st(), acts));
    } });
    form.append(el("div", { class: "wxs-btns wide" }, sure));
    let gone = false;
    const val = (k) => form.querySelector(`[name="${k}"]`).value, n = (k, d) => { const v = parseFloat(val(k)); return Number.isFinite(v) ? v : d; };
    form.addEventListener("change", () => {
      if (gone) return;
      const acts = clone(st().activities), at = acts.findIndex((x) => x.id === id);
      if (at < 0) return;
      const a = acts[at];
      Object.assign(a, { name: val("name").trim().slice(0, 24) || a.name, tmin: tM(n("tmin", tU(a.tmin))), tmax: tM(n("tmax", tU(a.tmax))), windMin: Math.max(0, wM(n("windMin", 0))),
        windMax: Math.max(1, wM(n("windMax", wU(a.windMax)))), gustMax: Math.max(1, wM(n("gustMax", wU(a.gustMax)))), rain: val("rain"),
        hours: Math.max(1, Math.min(8, Math.round(n("hours", a.hours)))), from: Number(val("from")), to: Number(val("to")) });
      if (a.tmax < a.tmin) [a.tmin, a.tmax] = [a.tmax, a.tmin];
      if (a.to <= a.from) a.to = Math.min(24, a.from + a.hours);
      save(PATCH.best(st(), acts));
    });
    h.push({ page: "activity", title: a0.name, body: form });
  }

  /* -- Commute -- */
  function timeSel(name, at, label, onChange) {
    const s = el("select", { name, class: "wxs-sel", aria: { label } });
    const fill = (v) => {
      const list = Array.from({ length: 96 }, (_, k) => `${String(Math.floor(k / 4)).padStart(2, "0")}:${String((k % 4) * 15).padStart(2, "0")}`);
      if (/^\d\d:\d\d$/.test(v) && !list.includes(v)) { list.push(v); list.sort(); }
      s.replaceChildren(...list.map((x) => el("option", { value: x, text: atText(fmt(), x) })));
      s.value = v;
    };
    fill(at);
    s.addEventListener("change", () => onChange(s.value));
    s.fill = fill;
    return s;
  }
  function commutePage() {
    const c = () => st().commute || { on: false, am: "08:00", pm: "17:30" };
    const on = ui.sw(!!c().on, (v) => save(PATCH.commute(st(), { on: v })), { label: "On weekdays" });
    const am = timeSel("am", c().am || "08:00", "Leave", (v) => save(PATCH.commute(st(), { am: v })));
    const pm = timeSel("pm", c().pm || "17:30", "Return", (v) => save(PATCH.commute(st(), { pm: v })));
    const wrap = el("div", { class: "wxs", data: { key: "commute" } },
      el("div", { class: "wxs-line" }, el("span", { text: "On weekdays" }), on),
      el("label", { class: "wxs-line" }, el("span", { text: "Leave" }), am),
      el("label", { class: "wxs-line" }, el("span", { text: "Return" }), pm),
      el("p", { class: "wxs-foot", text: "The weather for your journeys there and back, in Highlights." }));
    redraws.add(() => { const v = c(); setSw(on, !!v.on); am.fill(v.am || "08:00"); pm.fill(v.pm || "17:30"); });
    return wrap;
  }

  /* -- Solar -- */
  function solarPage() {
    const sol = () => st().solar || { on: false, alert: true, zones: [] };
    const on = ui.sw(!!sol().on, (v) => {
      const s = st(), zones = clone(sol().zones);
      if (v && !zones.length) { const z = newZone(s, S.places || [], S.cur || 0); if (z) zones.push(z); }
      save(PATCH.solar(s, { on: v, zones }));
    }, { label: "Solar panels" });
    const alertSw = ui.sw(sol().alert !== false, (v) => save(PATCH.solar(st(), { alert: v })), { label: "Tell me when the sun’s coming out" });
    const zones = el("div", { class: "wxs-zones" });
    const addBtn = ui.btn("Add a Zone", { small: true, act: "add", run: () => {
      const z = newZone(st(), S.places || [], S.cur || 0);
      if (!z) return;
      const all = [...clone(sol().zones), z];
      save(PATCH.solar(st(), { on: true, zones: all })).then(() => zonePage(z.id));
    } });
    const here = el("p", { class: "wxs-foot", text: "With only My Location saved, a new zone goes where you are now, and stays there." });
    const wrap = el("div", { class: "wxs", data: { key: "solar" } },
      el("div", { class: "wxs-line" }, el("span", { text: "Solar panels" }), on),
      ui.label("Zones"), zones, addBtn, here,
      el("p", { class: "wxs-foot", text: `A zone is a set of panels facing one way: an east roof and a west roof are two. A card when the sun’s coming out on them: when, and how long for. Nothing on grey days. Up to ${MAX_ZONES} zones.` }),
      el("div", { class: "wxs-line" }, el("span", { text: "Tell me when the sun’s coming out" }), alertSw),
      el("p", { class: "wxs-foot", text: "A notification up to an hour and a half before a sunny spell, twice a day at most. With a briefing for the same place, a line in it too." }));
    const draw = () => keepFocus(zones, "zone", () => {
      const s = sol(), places = S.places || [];
      setSw(on, !!s.on); setSw(alertSw, s.alert !== false);
      const box = alertSw.querySelector?.("input"); if (box) box.disabled = !s.on;
      zones.replaceChildren(...(s.zones.length ? [ui.list(s.zones.map((z) => {
        const where = z.place || places.find((p) => !p.gps && nkeyOf(p) === nkeyOf(z))?.name || "Your place";
        const r = ui.row({ title: z.name, sub: `${zoneSaid(z)} · ${where}`, trail: "chevron", run: () => zonePage(z.id), label: `${z.name}, ${zoneSaid(z)}: change` });
        r.dataset.zone = z.id;
        return r;
      }))] : []));
      addBtn.hidden = s.zones.length >= MAX_ZONES;
      here.hidden = s.zones.length >= MAX_ZONES || places.some((p) => !p.gps);
    });
    draw();
    redraws.add(draw);
    return wrap;
  }
  function zonePage(zid) {
    const z0 = sol0().zones.find((z) => z.id === zid);
    if (!z0) return;
    const spots = (S.places || []).filter((p) => !p.gps).map((p) => ({ name: p.name, lat: p.lat, lon: p.lon }));
    if (!spots.some((p) => nkeyOf(p) === nkeyOf(z0))) spots.unshift({ name: z0.place || "Your place", lat: z0.lat, lon: z0.lon });
    const sel = (name, text, opts, v) => el("label", { class: "wxs-fld" }, el("span", { text }),
      el("select", { name, class: "wxs-sel" }, ...opts.map(([k, t]) => { const o = el("option", { value: String(k), text: t }); o.selected = String(k) === String(v); return o; })));
    const form = el("div", { class: "wxs wxs-edit", data: { key: "solar" } },
      el("label", { class: "wxs-fld wide" }, el("span", { text: "Name" }), el("input", { type: "text", name: "zname", value: z0.name, maxlength: "24" })),
      sel("zwhere", "Where", spots.map((p) => [nkeyOf(p), p.name || "Your place"]), nkeyOf(z0)),
      sel("zfaces", "Faces", FACES.map(([k, t]) => [k, t]), z0.faces),
      sel("zpitch", "Pitch", PITCHES.map((p) => [p, p ? `${p}°` : "Flat"]), z0.pitch),
      sel("zkw", "Size", [["", "Not known"], ...ZSIZES.map((k) => [k, `${k} kW`])], z0.kw ?? ""),
      el("p", { class: "wxs-foot wide", text: "Size is optional: from your installer’s paperwork. With it, a bigger zone counts for more when they’re put together." }));
    let gone = false;
    const sure = ui.btn("Remove This Zone", { destructive: true, act: "delete", run: () => {
      if (!sure.dataset.sure) { sure.dataset.sure = "1"; sure.textContent = `Remove “${z0.name}”?`; return; }
      const zs = clone(sol0().zones).filter((z) => z.id !== zid);
      gone = true; h.pop(); save(PATCH.solar(st(), { zones: zs, on: zs.length ? sol0().on : false }));
    } });
    form.append(el("div", { class: "wxs-btns wide" }, sure));
    const val = (k) => form.querySelector(`[name="${k}"]`).value;
    form.addEventListener("change", () => {
      if (gone) return;
      const zs = clone(sol0().zones), z = zs.find((x) => x.id === zid);
      if (!z) return;
      const p = spots.find((x) => nkeyOf(x) === val("zwhere")) || z;
      Object.assign(z, { name: val("zname").trim().slice(0, 24) || z.name, lat: p.lat, lon: p.lon, place: String(p.name || z.place || "").slice(0, 60),
        faces: val("zfaces"), pitch: Number(val("zpitch")), kw: val("zkw") ? Number(val("zkw")) : null });
      save(PATCH.solar(st(), { zones: zs }));
    });
    h.push({ page: "zone", title: z0.name, body: form });
  }
  const sol0 = () => st().solar || { on: false, alert: true, zones: [] };

  /* -- Forecast -- */
  function forecastPage() {
    const tune = ui.sw(st().tune !== false, (v) => save(PATCH.tune(st(), v)), { label: "Tune highs and lows for here" });
    const xs = EXTRAS.map(([k, name]) => [k, ui.sw(st().extras?.[k] !== false, (v) => save(PATCH.extras(st(), k, v)), { label: name }), name]);
    const wrap = el("div", { class: "wxs" },
      el("div", { class: "wxs-line", data: { key: "tune" } }, el("span", { text: "Tune highs and lows for here" }), tune),
      el("p", { class: "wxs-foot", text: "Highs, lows and wind put right by how far the forecast has been out here lately." }),
      ui.label("Also look out for"),
      el("div", { class: "wxs-group", data: { key: "extras" } }, ...xs.map(([k, s, name]) => el("div", { class: "wxs-line", data: { extra: k } }, el("span", { text: name }), s))));
    redraws.add(() => { const s = st(); setSw(tune, s.tune !== false); for (const [k, sw] of xs) setSw(sw, s.extras?.[k] !== false); });
    return wrap;
  }

  const BUILD = { units: unitsPage, arrange: arrangePage, best: bestPage, commute: commutePage, solar: solarPage, forecast: forecastPage };
  function go(p) { h.push({ page: p, title: TITLES[p], body: BUILD[p]() }); }

  const hero = { app: "weather", name: "Weather", line: S.acct ? "Your places and settings are kept with your account." : "Settings and places stay on this device." };
  h = fw.sheet.open({ sheet: "wxsettings", title: "Weather Settings", hero, body: root, app: "weather",
    onClose: () => { alive = false; redraws.clear(); for (const off of offs) off(); if (shown === h) shown = null; } });
  if (!h) return null;
  shown = h;
  offs.push(core.on("settings", () => { heard++; if (alive) redraw(); }));
  redraw();
  if (page) go(page);
  return h;
}

// a switch put right without telling its onChange (ui.sw's label.ifl-switch around its checkbox)
function setSw(sw, on) { const box = sw?.querySelector?.("input") || sw; if (box && "checked" in box && box.checked !== on) box.checked = on; }
// a list drawn anew with the focus where it was: the same row's (by its data-<attr>) switch, or its button
function keepFocus(box, attr, draw) {
  const at = box.ownerDocument.activeElement, host = at && box.contains(at) ? at.closest(`[data-${attr}]`) : null;
  const key = host?.dataset[attr], kind = at?.tagName === "INPUT" ? "input" : "button, a";
  draw();
  if (key == null) return;
  const row = [...box.querySelectorAll(`[data-${attr}]`)].find((x) => x.dataset[attr] === key);
  (row?.matches(kind) ? row : row?.querySelector(kind))?.focus({ preventScroll: true });
}
