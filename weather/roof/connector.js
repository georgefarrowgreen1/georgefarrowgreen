// Weather's connector, client part (One roof, spec §6.1, D5): what Weather shares with InFlite, read by the framework
// (roof/connectors.js, modules.js) without loading the module. ≤ 4 KB, no imports. Shape and `shares` words frozen by
// B0; WX keeps `files` equal to the module's static import graph plus its CSS (roofcontract.test walks the graph).
export const CONNECTOR = 1;

const SECTIONS = [["now", "Now"], ["days", "16 Days"], ["radar", "Radar"], ["warnings", "Warnings"]];
const near = (s) => String(s ?? "").toLowerCase();

export const connector = {
  app: "weather",
  name: "Weather",
  shares: {
    cards: "Today’s weather card, rain on your ride, warnings",
    search: "Your saved places, on this phone",
    notifications: "Rain alerts, warnings, the morning briefing and sunshine for your panels, through InFlite",
    actions: "Open Now, 16 Days, Radar or Warnings; send the forecast",
    screens: "Now · 16 Days · Radar · Warnings",
  },
  sections: SECTIONS,
  aliases: { day: "days", settings: "now" },
  // Every file of the module's static import graph (from weather.js: its own 11 and the 14 reused) and its 4
  // stylesheets: 29 files, absolute paths. Never vendor/, the radar stack, rainmap.js or radarrain.js (fw.lazy only).
  files: [
    "/weather/roof/weather.js", "/weather/roof/connector.js", "/weather/roof/core.js", "/weather/roof/sync.js",
    "/weather/roof/places.js", "/weather/roof/radarview.js", "/weather/roof/now.js", "/weather/roof/days.js",
    "/weather/roof/warnings.js", "/weather/roof/wxui.js", "/weather/roof/wxsettings.js",
    "/weather/data.js", "/weather/insights.js", "/weather/format.js", "/weather/codes.js", "/weather/climate.js",
    "/weather/sky.js", "/weather/skill.js", "/weather/solar.js", "/weather/official.js", "/weather/agree.js",
    "/weather/account.js", "/weather/send.js", "/weather/charts.js", "/weather/icons.js",
    "/weather/roof/weather.css", "/weather/roof/wxcore.css", "/weather/roof/wxsettings.css", "/weather/roof/radar.css",
  ],
  // mini(answer) → { kind: "num-bars", num: "14°", bars: [0..100 ×5], label: "Rain from 15:00" } | null: from
  // answer.cards.weather (now.temp, list[].pop); null unless its state is "ok". (B0: minimal; WX finishes it.)
  mini(answer) {
    const c = answer?.cards?.weather;
    if (!c || c.state !== "ok" || !Number.isFinite(c.now?.temp)) return null;
    const bars = (Array.isArray(c.list) ? c.list : []).slice(0, 5).map((h) => Math.max(0, Math.min(100, Math.round(Number(h?.pop) || 0))));
    while (bars.length < 5) bars.push(0);
    return { kind: "num-bars", num: `${Math.round(c.now.temp)}°`, bars, label: "" };
  },
  // search(q) → [{ title, sub, icon: "weather", href }]: your places (localStorage wx:places), case-insensitive
  // substring of the name, ≤ 8, then "Weather Settings". On this device only: q never leaves the page (D16).
  search(q) {
    const s = near(q).trim();
    if (!s) return [];
    let places = [];
    try { places = JSON.parse(globalThis.localStorage?.getItem("wx:places") || "[]"); } catch (_) {}
    const out = (Array.isArray(places) ? places : []).filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && near(p.name).includes(s)).slice(0, 8)
      .map((p) => ({ title: String(p.name), sub: String(p.region || ""), icon: "weather", href: `/weather/?${new URLSearchParams({ lat: p.lat, lon: p.lon, name: p.name })}` }));
    if ("weather settings".includes(s)) out.push({ title: "Weather Settings", sub: "Weather", icon: "weather", href: "/weather/#settings" });
    return out;
  },
};
