// Markets' fixtures for its module's unit tests (roofmkcore, roofmkviews; One roof stage 2, §9.1 MK): an account with
// holdings in three accounts, one followed, one without a price, quotes through a London day, a year of dividends, what's
// been paid, an ISA, the news; a second account to switch to; and the browser bits the module touches (storage, a
// network that answers like Markets' API, a stand-in fw). All times are worked out from `now` so the sums are the same on
// any day.
export const DAY = 864e5;

export function account(now = Date.now(), who = "a") {
  const t = Math.floor(now / 1000), open = { start: t - 3 * 3600, end: t + 2 * 3600 };
  const sparkT = Array.from({ length: 12 }, (_, i) => open.start + i * 900);
  const walk = (p0, k) => sparkT.map((_, i) => +(p0 * (1 + k * Math.sin(i / 2) + k * i / 10)).toFixed(4));
  const divs = (amount, months) => months.map((m) => ({ t: Math.floor((now - m * 30 * DAY) / 1000), amount }));
  if (who === "b") {
    return {
      signedIn: true, id: "u-b-0002", name: "Bea Jones", handle: "bea", photoAt: null,
      holdings: [{ symbol: "AAPL", name: "Apple", qty: 3, cost: 150, account: null, alert: null }],
      quotes: { AAPL: { symbol: "AAPL", name: "Apple Inc.", price: 190, prev: 188, chg: 2, chgPct: 1.06, cur: "USD", ex: "Nasdaq", type: "EQUITY", time: t - 60, tz: "America/New_York", spark: walk(188, 0.004), sparkT, open } },
      rates: { GBP: 1, USD: 0.79 }, isa: null, wrap: true, alertsOff: false,
    };
  }
  return {
    signedIn: true, id: "u-a-0001", name: "Sam Taylor", handle: "sam", photoAt: null,
    holdings: [
      { symbol: "TSCO.L", name: "Tesco", qty: 1000, cost: 2.8, account: "isa", alert: 3, buys: 0, since: now - 400 * DAY },
      { symbol: "VUSA.L", name: "Vanguard S&P 500", qty: 40, cost: 70, account: "sipp", alert: null, since: now - 300 * DAY },
      { symbol: "AAPL", name: "Apple", qty: 10, cost: 150, account: "gia", alert: null },
      { symbol: "SMT.L", name: "Scottish Mortgage", qty: 200, cost: null, account: "isa", alert: null },
      { symbol: "GONE.L", name: "Gone Ltd", qty: 50, cost: 1, account: null, alert: null },
      { symbol: "NVDA", name: "Nvidia", qty: 0, cost: null, account: null, alert: null },
    ],
    quotes: {
      "TSCO.L": { symbol: "TSCO.L", name: "Tesco PLC", price: 3.12, prev: 3.05, chg: 0.07, chgPct: 2.3, cur: "GBP", ex: "London", type: "EQUITY", kind: "share", time: t - 60, tz: "Europe/London", hi52: 3.15, lo52: 2.4, dayLo: 3.04, dayHi: 3.13, spark: walk(3.05, 0.006), sparkT, open },
      "VUSA.L": { symbol: "VUSA.L", name: "Vanguard S&P 500 UCITS ETF", price: 82.5, prev: 82.9, chg: -0.4, chgPct: -0.48, cur: "GBP", ex: "London", type: "ETF", kind: "fund", time: t - 60, tz: "Europe/London", spark: walk(82.9, -0.002), sparkT, open },
      AAPL: { symbol: "AAPL", name: "Apple Inc.", price: 190, prev: 191.5, chg: -1.5, chgPct: -0.78, cur: "USD", ex: "Nasdaq", type: "EQUITY", kind: "share", time: t - 60, tz: "America/New_York", spark: walk(191.5, -0.003), sparkT, open },
      "SMT.L": { symbol: "SMT.L", name: "Scottish Mortgage", price: 9.4, prev: 9.1, chg: 0.3, chgPct: 3.3, cur: "GBP", ex: "London", type: "EQUITY", kind: "trust", time: t - 60, tz: "Europe/London", spark: walk(9.1, 0.01), sparkT, open },
      NVDA: { symbol: "NVDA", name: "NVIDIA", price: 120, prev: 118, chg: 2, chgPct: 1.69, cur: "USD", ex: "Nasdaq", type: "EQUITY", kind: "share", time: t - 60, tz: "America/New_York", spark: walk(118, 0.005), sparkT, open },
      "^FTSE": { symbol: "^FTSE", name: "FTSE 100", price: 8120.5, prev: 8090, chg: 30.5, chgPct: 0.38, cur: "GBP", ex: "London", type: "INDEX", time: t - 60, tz: "Europe/London", open },
      "^GSPC": { symbol: "^GSPC", name: "S&P 500", price: 5800, prev: 5830, chg: -30, chgPct: -0.51, cur: "USD", ex: "SNP", type: "INDEX", time: t - 60, tz: "America/New_York", open: { start: t + 3 * 3600, end: t + 9 * 3600 } },
      "BTC-USD": { symbol: "BTC-USD", name: "Bitcoin", price: 68000, prev: 67000, chg: 1000, chgPct: 1.49, cur: "USD", ex: "CCC", type: "CRYPTOCURRENCY", time: t - 60 },
    },
    rates: { GBP: 1, USD: 0.79 }, isa: { year: "2026–27", allowance: 20000, paid: 6000, said: true }, wrap: true, alertsOff: false,
    years: {
      "TSCO.L": { hi52: 3.15, lo52: 2.4, yr: 18, wk: 7.5, div12: 0.12, divs: divs(0.04, [2, 7, 13, 19]), first: 2.64, last: 3.12, got12: 0.12 },
      "VUSA.L": { hi52: 85, lo52: 66, yr: 21, wk: -1, div12: 0.9, divs: divs(0.225, [1, 4, 7, 10]), first: 68, last: 82.5 },
      AAPL: { hi52: 200, lo52: 160, yr: 9, wk: 2, div12: 1, divs: divs(0.25, [1, 4, 7, 10]), first: 174, last: 190 },
      "SMT.L": { hi52: 9.6, lo52: 7.2, yr: 25, wk: 3, div12: 0.04, divs: divs(0.04, [5]), first: 7.5, last: 9.4 },
      "ISF.L": { first: 7.6, last: 8.2, div12: 0.3, divs: divs(0.075, [1, 4, 7, 10]) },
    },
    paid: { "TSCO.L": { paid: 120 }, "VUSA.L": { paid: 30 } },
    news: [
      { link: "https://news.example/tesco-1?utm=x", k: "s1", title: "Tesco raises its outlook", src: "Reuters", at: now - 2 * 3600e3, for: "TSCO.L", tickers: ["TSCO.L"], topic: null },
      { link: "https://news.example/ftse-1", k: "s2", title: "FTSE climbs as miners rally.", src: "Bloomberg", at: now - 3600e3, for: null, tickers: [], topic: "UK" },
      { link: "https://news.example/nvda-1", k: "s3", title: "Nvidia shows a new chip", src: "The Verge", at: now - 5 * 3600e3, for: "NVDA", tickers: ["NVDA"], topic: null },
      { link: "https://news.example/spx-1", k: "s4", title: "Wall Street waits on the Fed", src: "FT", at: now - 4 * 3600e3, for: null, tickers: [], topic: "US" },
    ],
    topics: { "VUSA.L": "US", "SMT.L": "WORLD" },
  };
}

// the state app.js's S and core.S share, from an account (what take() and the loaders leave)
export function stateOf(acc) {
  return {
    me: { id: acc.id, name: acc.name, handle: acc.handle, photoAt: acc.photoAt }, list: structuredClone(acc.holdings), q: structuredClone(acc.quotes), fx: { ...acc.rates },
    years: structuredClone(acc.years || {}), news: structuredClone(acc.news || null), newsTopics: { ...(acc.topics || {}) }, isa: acc.isa ? { ...acc.isa } : null,
    paid: acc.paid ? { at: Date.now(), v: structuredClone(acc.paid) } : null, inc: null, charts: new Map(), alertsOff: false, wrap: true, vs: null, prange: "1d", mix: "holding", fig: "day",
    imode: "coming", goal: 100, add: 0, reinvest: true, buyAmt: 1000, nfilter: "all", newsSince: null, pricesAt: Date.now(),
  };
}

// ---- the browser bits ----
export function memStorage() {
  const mem = new Map();
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), clear: () => mem.clear(),
    key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; }, keys: () => [...mem.keys()],
  };
}

// a network that answers as Markets' API does (/api/markets/*), for whichever account is signed in; calls kept in `log`.
// state: { acc, status (every call but me's), down (offline), wait: { path: a promise each call to it waits on first },
// fail: { path: a status that call answers with } }
export function marketsApi(state) {
  const log = [];
  const j = (o, status = 200) => ({ ok: status < 400, status, json: async () => o });
  const fetch = async (url, init = {}) => {
    const u = new URL(String(url), "https://inflite.test"), p = u.pathname.replace(/^\/api\/markets\//, "");
    log.push({ path: p, method: init.method || "GET", url: u.pathname + u.search, body: init.body || null });
    if (state.wait?.[p]) await state.wait[p];
    if (state.down) throw new TypeError("offline");
    if (state.fail?.[p]) return j({ error: `Something went wrong (${state.fail[p]}).` }, state.fail[p]);
    const acc = state.acc;
    if (state.status && p !== "me") return j({ error: "Sign in first." }, state.status);
    if (p === "me") return state.status === 401 ? j({ error: "Sign in first." }, 401) : j(acc ? { ...acc } : { signedIn: false });
    if (p === "quotes") { const syms = (u.searchParams.get("s") || "").split(",").map(decodeURIComponent); return j({ quotes: Object.fromEntries(syms.filter((s) => acc?.quotes?.[s]).map((s) => [s, acc.quotes[s]])), rates: acc?.rates || {} }); }
    if (p === "years") return j({ years: acc?.years || {} });
    if (p === "paid") return j({ paid: acc?.paid || {} });
    if (p === "income") return j({ income: {} });
    if (p === "news") return j({ news: acc?.news || [], topics: acc?.topics || {} });
    if (p === "order") { const { symbols } = JSON.parse(init.body); acc.holdings.sort((a, b) => symbols.indexOf(a.symbol) - symbols.indexOf(b.symbol)); return j({ holdings: acc.holdings }); }
    if (p === "alert") { const b = JSON.parse(init.body), h = acc.holdings.find((x) => x.symbol === b.symbol); if (h) h.alert = b.on ? b.pct : null; return j({ holdings: acc.holdings }); }
    if (p === "holding") return j({ holdings: acc.holdings });
    return j({ error: "Not found." }, 404);
  };
  return { fetch, log };
}

// a stand-in fw for core.start (no DOM): the session's user, lost() as given, visibility, its events, a toast's words
export function fakeFw({ userId = "u-a-0001", lost = async () => false, visible = true } = {}) {
  const subs = { visible: new Set(), hidden: new Set() }, said = [], sent = [];
  const fw = {
    app: "markets", contract: 1,
    session: { get user() { return { id: fw.userId, name: "Sam Taylor" }; }, lost: () => { fw.lostCalls++; return lost(); } },
    userId, lostCalls: 0, changes: 0, isVisible: visible,
    visible: () => fw.isVisible,
    on(ev, fn) { subs[ev]?.add(fn); return () => subs[ev]?.delete(fn); },
    fire(ev) { for (const f of [...(subs[ev] || [])]) f(); },
    subs, said, sent,
    toast: (t) => { said.push(t); return { close() {} }; },
    send: (spec) => { sent.push(spec); return Promise.resolve(true); },
    changed: () => { fw.changes++; },
    lazy: (fn) => Promise.resolve(fn("")),
    stale: () => false,
  };
  return fw;
}
