// Fitness's connector (owner FXA; s2/spec.md §4.3; s24-contracts §5): what Fitness shares with InFlite, read
// by the framework without loading the module. ≤ 4096 bytes raw, no imports. shares' words frozen by B0 (j0).
// files = the entry's static import graph + REGISTRY's css; lazy = the closure of every literal fw.lazy import, less files,
// less NET (roofcontract.test checks both). search(q, { userId }) → entries on this phone only (§2.5).
export const CONNECTOR = 1;
export const STUB = true;
const SECTIONS = [["today", "Today"], ["activities", "Activities"], ["progress", "Progress"]];
export const connector = {
  app: "fitness",
  name: "Fitness",
  shares: {
    cards: "Today’s session or the ride you’ve done",
    search: "Your activities and sessions, on this phone",
    notifications: "Your session, in the morning notification",
    actions: "Open Today, Activities or Progress; send a session",
    screens: "Today · Activities · Progress",
  },
  sections: SECTIONS,
  aliases: { plan: "today", day: "today", offer: "today", settings: "today", act: "activities" },
  files: [
    "/fitness/roof/fitness.js",
    "/fitness/roof/core.js",
    "/fitness/roof/fxui.js",
    "/fitness/roof/x.js",
    "/fitness/roof/fxcalc.js",
    "/fitness/roof/connector.js",
    "/fitness/roof/todayview.js",
    "/fitness/roof/offers.js",
    "/fitness/roof/idb.js",
    "/fitness/workouts.js",
    "/fitness/load.js",
    "/fitness/rhythm.js",
    "/fitness/progress.js",
    "/fitness/ui.js",
    "/fitness/account.js",
    "/fitness/invites.js",
    "/fitness/todaycalc.js",
    "/fitness/besttime.js",
    "/fitness/efforts.js",
    "/fitness/charts.js",
    "/fitness/send.js",
    "/fitness/roof/fitness.css",
    "/fitness/roof/fxviews.css",
  ],
  lazy: [
    "/fitness/roof/actsview.js",
    "/fitness/roof/progview.js",
    "/fitness/roof/planview.js",
    "/fitness/roof/fxsettings.js",
  ],
  mini: (a) => { const c = a?.cards?.fitness; return c && Number.isFinite(Number(c.ctl)) ? { kind: "num", num: String(Math.round(Number(c.ctl))), label: "Fitness" } : null; },
  search(q, { userId = null } = {}) { return []; },
};
