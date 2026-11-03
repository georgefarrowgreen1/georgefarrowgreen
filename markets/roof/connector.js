// Markets' connector (One roof stage 2, §2.5, §4.2, C4, C6): read without loading the module. ≤ 4 KB, no imports.
export const CONNECTOR = 1;

const SECTIONS = [["today", "Today"], ["holdings", "Holdings"], ["news", "News"]];
const KIND = { ETF: "Fund", MUTUALFUND: "Fund", INDEX: "Index", CRYPTOCURRENCY: "Crypto", CURRENCY: "Currency" };
const SAID = { share: "Shares", trust: "Investment trust", fund: "Fund", crypto: "Crypto" };
const low = (s) => String(s ?? "").toLowerCase();
const plain = (s) => String(s).replace(/\.L$/, "").replace(/^\^/, "");
// (a search's Find, when Markets isn't on the screen: q kept here, never in an address; markets.js takes it)
export const want = { q: null, at: 0, open: null };
const SHEETS = [["Income", "income"], ["ISA", "isa"], ["Against the Market", "vs"], ["About these prices", "about"]];

export const connector = {
  app: "markets",
  name: "Markets",
  shares: {
    cards: "How your holdings are doing today",
    search: "Your holdings, on this phone",
    notifications: "Price alerts and the evening wrap",
    actions: "Open a stock or a section; send a stock's day in percent",
    screens: "Today · Holdings · News",
  },
  sections: SECTIONS,
  aliases: { s: "today", income: "holdings", isa: "holdings", vs: "holdings", about: "holdings" },
  files: [
    "/markets/roof/markets.js", "/markets/roof/connector.js", "/markets/roof/core.js", "/markets/roof/mkui.js", "/markets/roof/todayview.js",
    "/markets/account.js", "/markets/income.js", "/markets/send.js", "/markets/charts.js", "/markets/roof/markets.css",
  ],
  lazy: ["/markets/roof/holdings.js", "/markets/roof/news.js", "/markets/roof/stock.js", "/markets/roof/edit.js", "/markets/roof/money.js", "/markets/stories.js"],
  // mini(answer): the day's percent and its shape, never an amount (as roof/connectors.js's fallback)
  mini(a) {
    const c = a?.cards?.markets, p = Number(c?.pct), v = (c?.spark?.vals || []).map(Number).filter(Number.isFinite), lo = Math.min(...v), d = Math.max(...v) - lo || 1;
    return c?.traded && Number.isFinite(p) ? { kind: "pct-spark", pct: p, spark: v.length > 1 ? v.map((x) => (x - lo) / d) : null } : null;
  },
  // search(q, { userId }): nothing unless this phone's copy (markets:last) is userId's; then your holdings and follows by
  // name or symbol (≤ 8, never a value), Markets' sheets, and Find "q" in Markets (q leaves the phone only when tapped)
  search(q, { userId, kept } = {}) {
    const s = low(q).trim();
    let k = kept;
    if (!k) { try { k = JSON.parse(globalThis.localStorage?.getItem("markets:last") || "null"); } catch (_) {} }
    if (!s || userId == null || !k || (k.id ?? k.me?.id) !== userId) return [];
    const quotes = k.quotes || {}, out = (Array.isArray(k.holdings) ? k.holdings : []).filter((x) => x && typeof x.symbol === "string" && (low(x.name).includes(s) || low(plain(x.symbol)).startsWith(s))).slice(0, 8)
      .map((x) => { const t = quotes[x.symbol]; return { title: String(x.name || x.symbol), sub: [plain(x.symbol), SAID[t?.kind] || KIND[t?.type] || "Shares"].join(" · "), icon: "markets", href: `/markets/#s=${encodeURIComponent(x.symbol)}` }; });
    for (const [t, h] of SHEETS) if (low(t).includes(s) || low("markets " + t).includes(s)) out.push({ title: `Markets · ${t}`, sub: "Markets", icon: "markets", href: `/markets/#${h}` });
    if (s.length >= 2) {
      const typed = String(q).trim().slice(0, 40);
      out.push({ title: `Find “${typed}” in Markets`, sub: "Markets", icon: "markets", run: () => {
        Object.assign(want, { q: typed, at: Date.now() });
        if (want.open) return want.open();
        const d = globalThis.document, a = d.createElement("a");
        a.href = "/markets/"; d.body.append(a); a.click(); a.remove();
      } });
    }
    return out;
  },
};
