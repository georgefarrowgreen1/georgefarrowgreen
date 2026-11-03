// A fake connector for FW's kit (One roof, spec §6.1), served at Weather's connector address unless the kit page asks
// for the real module. Its places are stand-ins, searched on this page only.
export const CONNECTOR = 1;
const PLACES = [["London", "England", 51.5072, -0.1276], ["Weston-super-Mare", "England", 51.346, -2.977], ["Newcastle upon Tyne", "England", 54.978, -1.617]];
export const connector = {
  app: "weather", name: "Weather",
  shares: {
    cards: "Today’s weather card, rain on your ride, warnings",
    search: "Your saved places, on this phone",
    notifications: "Rain alerts, warnings, the morning briefing and sunshine for your panels, through InFlite",
    actions: "Open Now, 16 Days, Radar or Warnings; send the forecast",
    screens: "Now · 16 Days · Radar · Warnings",
  },
  sections: [["now", "Now"], ["days", "16 Days"], ["radar", "Radar"], ["warnings", "Warnings"]],
  aliases: { day: "days", settings: "now" },
  files: ["/weather/roof/weather.js", "/weather/roof/weather.css", "/weather/roof/wxcore.css", "/weather/roof/wxsettings.css", "/weather/roof/radar.css"],
  mini: () => ({ kind: "num-bars", num: "14°", bars: [10, 20, 60, 80, 30], label: "Rain from 15:00" }),
  search(q) {
    const s = String(q || "").trim().toLowerCase();
    const out = PLACES.filter(([n]) => n.toLowerCase().includes(s)).slice(0, 8).map(([n, r, lat, lon]) => ({ title: n, sub: r, icon: "weather", href: `/weather/?lat=${lat}&lon=${lon}&name=${encodeURIComponent(n)}` }));
    if (s && "weather settings".includes(s)) out.push({ title: "Weather Settings", sub: "Weather", icon: "weather", href: "/weather/#settings" });
    return out;
  },
};
