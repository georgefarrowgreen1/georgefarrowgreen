// Weather's connector (One roof, §6.1, D5): what Weather shares with InFlite, read by the framework without loading
// the module. ≤ 4096 bytes raw, comments included (roofcontract.test); no imports. Shape and `shares` frozen by B0.
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
  // files: weather.js's static import graph (8 own, 14 reused) and its 4 CSS; never vendor/, the radar stack or the
  // rain files. lazy (C4): the fw.lazy(() => import()) closure less files and NET, kept only on the Home Screen.
  files: [
    "/weather/roof/weather.js", "/weather/roof/connector.js", "/weather/roof/core.js", "/weather/roof/sync.js",
    "/weather/roof/radarview.js", "/weather/roof/now.js", "/weather/roof/wxui.js", "/weather/roof/wxwarn.js",
    "/weather/data.js", "/weather/insights.js", "/weather/format.js", "/weather/codes.js", "/weather/climate.js",
    "/weather/sky.js", "/weather/skill.js", "/weather/solar.js", "/weather/official.js", "/weather/agree.js",
    "/weather/account.js", "/weather/send.js", "/weather/charts.js", "/weather/icons.js",
    "/weather/roof/weather.css", "/weather/roof/wxcore.css", "/weather/roof/wxsettings.css", "/weather/roof/radar.css",
  ],
  lazy: ["/weather/roof/days.js", "/weather/roof/warnings.js", "/weather/roof/places.js", "/weather/roof/wxsettings.js", "/weather/roof/wxdetail.js"],
  // mini(answer) → { kind: "num-bars", num, bars: [0..100 ×5], label } | null, from answer.cards.weather (functions/
  // _todaywx.js weatherCard), null unless state "ok": num = now.temp as it is (already "14°"); bars = hours.list[0..4].pop;
  // label from rain (v=2): "Raining now", "Rain from 15:00" (at, on the place's clock: offset s, clock "12"/"24"), else "".
  mini(answer) {
    const c = answer?.cards?.weather;
    if (!c || c.state !== "ok" || typeof c.now?.temp !== "string") return null;
    const bars = (Array.isArray(c.hours?.list) ? c.hours.list : []).slice(0, 5).map((h) => Math.max(0, Math.min(100, Math.round(Number(h?.pop) || 0))));
    while (bars.length < 5) bars.push(0);
    const r = c.rain, d = Number.isFinite(r?.at) && new Date(r.at + (Number(c.offset) || 0) * 1000);
    const hh = d && d.getUTCHours(), mm = d && String(d.getUTCMinutes()).padStart(2, "0");
    const at = d && (c.clock === "12" ? `${hh % 12 || 12}:${mm}${hh < 12 ? "am" : "pm"}` : `${String(hh).padStart(2, "0")}:${mm}`);
    return { kind: "num-bars", num: c.now.temp, bars, label: r?.now ? "Raining now" : at ? `Rain from ${at}` : "" };
  },
  // search(q) → [{ title, sub, icon: "weather", href }]: wx:places whose name has q (any case), ≤ 8, then "Weather
  // Settings". On this device only: q never leaves the page (D16).
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
