// A fake module for FW's kit (One roof, spec §5.1, §9.4 FW; stage 2 §9.2 FW), served at Weather's entry
// (/weather/roof/weather.js) unless the kit page asks for the real one, and by roofkit.mjs at any other REGISTRY app's
// entry for the per-app cases (/markets/roof/markets.js, /mail/roof/mail.js). Its sections are the app's own (REGISTRY),
// each tall enough to scroll; a hero that takes over from the card's clone (fw.zoomTarget); for Weather a header with a
// place ▾, a compact title, Weather Settings and a warnings count; Radar fills the window (fw.fill).
// window.kitMods[app] is the test's handle for each app (window.kitMod: Weather's, as stage 1's cases have it): what the
// instance was asked (shows, hides, backs, unmounts, flushes) and what it answers (back, busy, lost: set them), fw itself,
// and lazy(path) (an import through fw.lazy, its query as the frame gives it: fw.lazy((q) => import(path + q))).
import { REGISTRY } from "/roof/router.js";

export const CONTRACT = 1;
export const BUILD = "9.99";
export const NEWS = "The kit's fake module";
export const SECTIONS = [["now", "Now"], ["days", "16 Days"], ["radar", "Radar"], ["warnings", "Warnings"]];

export async function mount(root, fw) {
  const ui = fw.ui, app = fw.app, wx = app === "weather";
  const all = (window.kitMods ||= {});
  const K = (all[app] = { app, shows: [], hides: 0, backs: 0, unmounts: 0, flushes: 0, back: false, busy: false, lost: 0, lazyRan: 0, fw, mounted: (all[app]?.mounted || 0) + 1 });
  if (wx) window.kitMod = K;
  const secs = {}, list = wx ? SECTIONS : REGISTRY[app]?.sections || SECTIONS;
  for (const [id, label] of list) {
    const s = ui.el("section", { class: "wx-sec kit-sec", data: { sec: id }, hidden: true, "aria-label": label });
    if (id === list[0][0]) s.append(ui.el("div", { class: "wx-hero ifl-card hero" }, ui.el("b", { class: "kit-temp", text: wx ? "14°" : REGISTRY[app]?.name || app }), ui.el("p", { class: "ifl-sub", text: wx ? "Light rain" : "A stand-in hero" })));
    if (id === "radar") s.append(ui.el("div", { class: "radar-map", "data-no-edge": "" }, ui.el("p", { text: "Radar stand-in" })));
    else for (let i = 0; i < 16; i++) s.append(ui.card({ title: `${label} ${i + 1}`, body: ui.el("p", { class: "ifl-sub", text: "A stand-in card." }) }));
    if (id === list[0][0]) s.append(ui.btn("Open a sheet", { act: "kit-sheet", run: () => openPlaces() }));
    root.append(s);
    secs[id] = s;
  }
  function openPlaces() {
    return fw.sheet.open({ sheet: "places", title: "Places", body: ui.list([ui.row({ title: "London", sub: "England", trail: "chevron", run: () => {} }), ui.row({ title: "Weston-super-Mare", sub: "England", trail: "chevron", run: () => {} })]) });
  }
  if (wx) fw.header.set({ title: "London", compactTitle: "London · 14°", pick: { label: "Places", run: () => openPlaces() }, line: "Rain from 15:00", acts: [{ icon: "settings", label: "Weather Settings", run: () => { K.settings = (K.settings || 0) + 1; } }], badges: { warnings: 2 } });
  else fw.header.set({ line: "A stand-in module" });
  K.places = openPlaces;
  K.lazy = (path = "/kit/lazy.js") => fw.lazy((q = "") => { K.lazyRan++; return import(path + q); });
  const first = list[0][0];
  return {
    show(route, hint) {
      K.shows.push({ section: route.section, key: route.key, arg: route.arg, query: route.query, hint });
      for (const [id, s] of Object.entries(secs)) s.hidden = id !== route.section;
      fw.fill(route.section === "radar");
      return new Promise((ok) => setTimeout(() => { if (hint) fw.zoomTarget(secs[first].querySelector(".wx-hero")); ok(); }, 60));
    },
    hide() { K.hides++; },
    back() { K.backs++; return !!K.back; },
    busy() { return !!K.busy; },
    flush() { K.flushes++; return Promise.resolve({ lost: K.lost || 0 }); },
    sendable() { return { words: wx ? "London: light rain" : "A stand-in", packed: null, what: wx ? "the forecast" : "this" }; },
    unmount() { K.unmounts++; },
  };
}
