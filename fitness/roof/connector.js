// Fitness's connector (One roof stage 2, §4.3, C4, C6): what Fitness shares with InFlite, read without the module.
// ≤ 4096 bytes raw, no imports (roofcontract). files = fitness.js's static graph + REGISTRY css; lazy = the lazy views'
// closure less files less NET (map, share, formats, fit, reader: never kept).
export const CONNECTOR = 1;
const SECTIONS = [["today", "Today"], ["activities", "Activities"], ["progress", "Progress"]];
const ENTRIES = [["Fitness Settings", "", "settings fitness"], ["Your Numbers", "=numbers", "your numbers ftp weight heart rate zones"], ["Garmin, Strava and Apple Health", "=devices", "garmin strava apple health devices"]];
export const connector = {
  app: "fitness",
  name: "Fitness",
  shares: {
    cards: "Today’s session or the ride you’ve done",
    notifications: "Your session, in the morning notification",
    actions: "Open Today, Activities or Progress; send a session",
    screens: "Today · Activities · Progress",
  },
  sections: SECTIONS,
  aliases: { plan: "today", day: "today", offer: "today", settings: "today", act: "activities" },
  files: [
    "/fitness/roof/fitness.js", "/fitness/roof/core.js", "/fitness/roof/idb.js", "/fitness/roof/fxcalc.js",
    "/fitness/roof/connector.js", "/fitness/roof/fxui.js", "/fitness/roof/todayview.js", "/fitness/roof/x.js",
    "/fitness/roof/offers.js",
    "/fitness/ui.js", "/fitness/workouts.js", "/fitness/load.js", "/fitness/account.js", "/fitness/rhythm.js",
    "/fitness/progress.js", "/fitness/besttime.js", "/fitness/efforts.js", "/fitness/charts.js", "/fitness/invites.js",
    "/fitness/todaycalc.js", "/fitness/send.js",
    "/fitness/roof/fitness.css", "/fitness/roof/fxviews.css"
  ],
  lazy: [],
  // mini(answer) → { kind: "num", num, label: "Fitness" } from answer.cards.fitness.ctl, else null
  mini(a) { const c = a?.cards?.fitness; return c && Number.isFinite(Number(c.ctl)) ? { kind: "num", num: String(Math.round(Number(c.ctl))), label: "Fitness" } : null; },
  // search(q) → Fitness Settings, Your Numbers, the devices page: on this phone, q never leaves it (D16)
  search(q) {
    const s = String(q ?? "").toLowerCase().trim();
    if (!s) return [];
    return ENTRIES.filter(([t, , k]) => t.toLowerCase().includes(s) || k.includes(s)).map(([title, at]) => ({ title, sub: "Fitness", icon: "fitness", href: `/fitness/#settings${at}` }));
  },
};
