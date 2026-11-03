// A fake module for FW's kit (One roof, spec §5.1, §9.4 FW), served at Weather's entry (/weather/roof/weather.js)
// unless the kit page asks for the real one. Four sections like Weather's, each tall enough to scroll; a hero that
// takes over from the card's clone (fw.zoomTarget); a header with a place ▾, a compact title, Weather Settings and a
// warnings count; Radar fills the window (fw.fill). window.kitMod is the test's handle: what the instance was asked
// (shows, hides, backs, unmounts) and what it answers (kitMod.back, kitMod.busy), fw itself, and lazy() (an import
// through fw.lazy, which a stale page turns into a reload without running it).
export const CONTRACT = 1;
export const BUILD = "9.99";
export const NEWS = "The kit's fake module";
export const SECTIONS = [["now", "Now"], ["days", "16 Days"], ["radar", "Radar"], ["warnings", "Warnings"]];

export async function mount(root, fw) {
  const ui = fw.ui;
  const K = (window.kitMod = { shows: [], hides: 0, backs: 0, unmounts: 0, back: false, busy: false, lazyRan: 0, fw, mounted: (window.kitMod?.mounted || 0) + 1 });
  const secs = {};
  for (const [id, label] of SECTIONS) {
    const s = ui.el("section", { class: "wx-sec", data: { sec: id }, hidden: true, "aria-label": label });
    if (id === "now") s.append(ui.el("div", { class: "wx-hero ifl-card hero" }, ui.el("b", { class: "kit-temp", text: "14°" }), ui.el("p", { class: "ifl-sub", text: "Light rain" })));
    if (id === "radar") s.append(ui.el("div", { class: "radar-map", "data-no-edge": "" }, ui.el("p", { text: "Radar stand-in" })));
    else for (let i = 0; i < 16; i++) s.append(ui.card({ title: `${label} ${i + 1}`, body: ui.el("p", { class: "ifl-sub", text: "A stand-in card." }) }));
    if (id === "now") s.append(ui.btn("Open a sheet", { act: "kit-sheet", run: () => openPlaces() }));
    root.append(s);
    secs[id] = s;
  }
  function openPlaces() {
    return fw.sheet.open({ sheet: "places", title: "Places", body: ui.list([ui.row({ title: "London", sub: "England", trail: "chevron", run: () => {} }), ui.row({ title: "Weston-super-Mare", sub: "England", trail: "chevron", run: () => {} })]) });
  }
  fw.header.set({ title: "London", compactTitle: "London · 14°", pick: { label: "Places", run: () => openPlaces() }, line: "Rain from 15:00", acts: [{ icon: "settings", label: "Weather Settings", run: () => { K.settings = (K.settings || 0) + 1; } }], badges: { warnings: 2 } });
  K.places = openPlaces;
  K.lazy = () => fw.lazy(() => { K.lazyRan++; return import("/kit/lazy.js"); });
  return {
    show(route, hint) {
      K.shows.push({ section: route.section, key: route.key, arg: route.arg, query: route.query, hint });
      for (const [id, s] of Object.entries(secs)) s.hidden = id !== route.section;
      fw.fill(route.section === "radar");
      return new Promise((ok) => setTimeout(() => { if (hint) fw.zoomTarget(secs.now.querySelector(".wx-hero")); ok(); }, 60));
    },
    hide() { K.hides++; },
    back() { K.backs++; return !!K.back; },
    busy() { return !!K.busy; },
    sendable() { return { words: "London: light rain", packed: null, what: "the forecast" }; },
    unmount() { K.unmounts++; },
  };
}
