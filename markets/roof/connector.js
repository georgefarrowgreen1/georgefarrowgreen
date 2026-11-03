// Markets's connector (owner MK; s2/spec.md §4.2; s24-contracts §5): what Markets shares with InFlite, read
// by the framework without loading the module. ≤ 4096 bytes raw, no imports. shares' words frozen by B0 (j0).
// files = the entry's static import graph + REGISTRY's css; lazy = the closure of every literal fw.lazy import, less files,
// less NET (roofcontract.test checks both). search(q, { userId }) → [] unless the kept copy's id is userId; entries carry
// names and symbols only, never an amount; "Find … in Markets" has run, never an href with q (§2.5, RB1).
export const CONNECTOR = 1;
export const STUB = true;
const SECTIONS = [["today", "Today"], ["holdings", "Holdings"], ["news", "News"]];
export const connector = {
  app: "markets",
  name: "Markets",
  shares: {
    cards: "How your holdings are doing today",
    search: "Your holdings, on this phone",
    notifications: "Price alerts and the evening wrap",
    actions: "Open a stock or a section; send a stock’s day in percent",
    screens: "Today · Holdings · News",
  },
  sections: SECTIONS,
  aliases: { s: "today", income: "holdings", isa: "holdings", vs: "holdings", about: "holdings" },
  files: [
    "/markets/roof/markets.js",
    "/markets/roof/core.js",
    "/markets/roof/mkui.js",
    "/markets/roof/connector.js",
    "/markets/roof/todayview.js",
    "/markets/account.js",
    "/markets/charts.js",
    "/markets/send.js",
    "/markets/roof/markets.css",
  ],
  lazy: [
    "/markets/roof/holdings.js",
    "/markets/roof/news.js",
    "/markets/roof/stock.js",
    "/markets/roof/edit.js",
    "/markets/roof/money.js",
    "/markets/stories.js",
    "/markets/income.js",
  ],
  mini: (a) => {
    const c = a?.cards?.markets, p = Number(c?.pct), v = (c?.spark?.vals || []).map(Number).filter(Number.isFinite), lo = Math.min(...v), d = Math.max(...v) - lo || 1;
    return c?.traded && Number.isFinite(p) ? { kind: "pct-spark", pct: p, spark: v.length > 1 ? v.map((x) => (x - lo) / d) : null } : null;
  },
  search(q, { userId = null } = {}) { return []; },
};
