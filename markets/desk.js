// Markets on a big screen (an iPad held across, a Mac): the desk. Everything at once, and more of it than a phone has
// room for, on two screens:
//   - Portfolio: your holdings in a table you sort by any column (↑ ↓ through them); the one chosen in the middle, its
//     chart (line or candles, a log scale, 50- and 200-day averages, Bollinger bands, volume, RSI and MACD under it,
//     against any market or holding, read exactly under the pointer), its price history (to download), its dividends
//     and its news; on the right, a heat map of your money, your year's risk, the news and the dividends coming;
//   - World: the world's markets at once (indices by region, currencies and how each stands against the others,
//     commodities, US Treasury yields, crypto).
// Along the top, a command line that takes a terminal's function codes, suggesting as you type: RR GP (its chart),
// RR GPC (candles), RR HP (its prices), RR DVD (its dividends), RR N (its news), RR COMP SHEL, RR ALRT 5, WEI, FXC, PORT,
// ADD Tesco, HELP (and the words it took before: vs FTSE, vs off, alert NVDA 5, news). Keys: / or ⌘K the command line,
// ↑ ↓ the holdings, 1–5 the range, K candles, L log, A averages, B bands, V volume, R RSI, M MACD, C against the market,
// W world, P portfolio, ? help.
import { S, h, A, $, icon, fmt, money, signed, pct, tone, priceSaid, plainSym, nameOf, valueOf, dayOf, totals, owned, rate, divsOf, paidFor, income, kindOf, KIND_SAID,
  INDEX_NAMES, INDICES, RANGES, openSheet, pushSheet, stockView, searchView, editView, alertView, toast, ago, dayKey, rangeSeries, marketSaid, whyMoving, sendInChat, meFace, youMenu, daySeries } from "./app.js";

const D = { screen: "port", view: "chart", sel: null, range: "1y", sort: { k: "value", dir: -1 }, type: "line", log: false, ma: true, bb: false, vol: true, rsi: false, macd: false, vs: null, menu: null, news: null, risk: null };
const VS = [["^FTSE", "FTSE 100"], ["^GSPC", "S&P 500"]];
const NS = "http://www.w3.org/2000/svg";
const el = (n, a = {}) => { const e = document.createElementNS(NS, n); for (const [k, v] of Object.entries(a)) if (v != null) e.setAttribute(k, v); return e; };
const short = (n) => (n.length > 18 ? n.slice(0, 17).trimEnd() + "…" : n);
// a small line of values, w by h, coloured by whether it ended above where it started (or above base)
function spark(vals, w, hh, base = vals?.[0]) {
  const svg = el("svg", { width: w, height: hh, viewBox: `0 0 ${w} ${hh}`, "aria-hidden": "true", class: "spk" });
  if (!vals?.length) return svg;
  const lo = Math.min(...vals, base), hi = Math.max(...vals, base), Y = (v) => 1.5 + (hh - 3) * (1 - (v - lo) / (hi - lo || 1));
  const d = vals.map((v, i) => `${i ? "L" : "M"}${((i / (vals.length - 1 || 1)) * w).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
  const p = el("path", { d, fill: "none", "stroke-width": 1.4, "stroke-linejoin": "round" }); p.style.stroke = vals.at(-1) >= base ? "var(--up)" : "var(--down)";
  svg.append(el("line", { x1: 0, x2: w, y1: Y(base), y2: Y(base), class: "spkb" }), p);
  return svg;
}
// a chart, kept ten minutes (the day's, one)
async function chartOf(sym, r) {
  const k = `${sym}:${r}`, kept = S.charts.get(k), fresh = kept && Date.now() - kept.at < (r === "1d" ? 60e3 : 600e3);
  if (fresh) return kept.c;
  const c = await A.chart(sym, r);
  S.charts.set(k, { at: Date.now(), c });
  return c;
}

// ---- the world's markets: what the World screen shows, and the command line knows by name ----
const WORLD = {
  eq: [["Europe", [["^FTSE", "FTSE 100"], ["^FTMC", "FTSE 250"], ["^GDAXI", "DAX"], ["^FCHI", "CAC 40"], ["^STOXX50E", "Euro Stoxx 50"]]],
    ["Americas", [["^GSPC", "S&P 500"], ["^DJI", "Dow Jones"], ["^IXIC", "Nasdaq"]]], ["Asia-Pacific", [["^N225", "Nikkei 225"], ["^HSI", "Hang Seng"]]]],
  fx: [["GBPUSD=X", "GBP/USD"], ["GBPEUR=X", "GBP/EUR"], ["EURUSD=X", "EUR/USD"], ["USDJPY=X", "USD/JPY"], ["USDCHF=X", "USD/CHF"]],
  cmd: [["GC=F", "Gold"], ["SI=F", "Silver"], ["BZ=F", "Brent crude"], ["CL=F", "WTI crude"], ["NG=F", "Natural gas"], ["HG=F", "Copper"]],
  rates: [["^IRX", "US 3-month"], ["^FVX", "US 5-year"], ["^TNX", "US 10-year"], ["^TYX", "US 30-year"]],
  crypto: [["BTC-USD", "Bitcoin"], ["ETH-USD", "Ethereum"], ["SOL-USD", "Solana"]],
};
// (each currency's worth in pounds, for the grid of them)
const CCY = [["GBP", null], ["USD", "USDGBP=X"], ["EUR", "EURGBP=X"], ["JPY", "JPYGBP=X"], ["CHF", "CHFGBP=X"]];
const worldAll = () => [...WORLD.eq.flatMap(([, l]) => l), ...WORLD.fx, ...WORLD.cmd, ...WORLD.rates, ...WORLD.crypto];
const worldName = (sym) => worldAll().find(([s]) => s === sym)?.[1];
const isRate = (sym) => WORLD.rates.some(([s]) => s === sym);
// (a yield, said as one: Yahoo's are in percent, or now and then ten times that)
const yieldOf = (v) => (v > 25 ? v / 10 : v);

// ---- the function codes ----
const FN = [
  ["GP", "Chart", "its price chart", true], ["GPC", "Candles", "its chart as candlesticks", true], ["HP", "Price history", "its prices, day by day, to download", true],
  ["DVD", "Dividends", "every dividend it's paid", true], ["N", "News", "the news about it", true], ["COMP", "Compare", "set against another: RR COMP SHEL", true],
  ["ALRT", "Alert", "when it moves this much in a day: RR ALRT 5", true], ["WEI", "World markets", "indices, currencies, commodities, rates, crypto", false],
  ["FXC", "Currencies", "the pound, dollar, euro, yen and franc against each other", false], ["PORT", "Portfolio", "your holdings, and the one chosen", false],
  ["ADD", "Add", "find one to add or follow: ADD Tesco", false], ["HELP", "Help", "every function and key", false],
];
// (the words the command line took before it took codes, still taken)
const ALIAS = { VS: "COMP", COMPARE: "COMP", ALERT: "ALRT", NEWS: "N" };
const fnOf = (w) => { const k = w.toUpperCase(); return FN.find(([c]) => c === (ALIAS[k] || k)); };

export function deskView() {
  const own = owned();
  if (!D.sel || !S.q[D.sel]) D.sel = ([...own].sort((a, b) => valueOf(b) - valueOf(a))[0] || S.list[0])?.symbol;
  const body = D.screen === "world" ? worldGrid() : h("div.dgrid", {}, portPane(), instPane(), h("div.dcol", {}, heatPane(), riskPane(), newsPane(), comingPane()));
  const root = h("section.desk", {}, topBar(), body, statusBar());
  keys.on();
  return root;
}
const redraw = () => { const d = $(".desk"); if (d) d.replaceWith(deskView()); };

// ---- along the top: you, the two screens, the command line (suggesting as you type), the markets ----
function topBar() {
  const input = h("input", { id: "dcmd", type: "text", autocomplete: "off", spellcheck: "false", placeholder: "A name, a symbol or a function: RR GP · NVDA HP · WEI · HELP", "aria-label": "Command", "aria-controls": "dsug", "aria-autocomplete": "list" });
  const sug = h("div.dsug", { id: "dsug", role: "listbox", hidden: true });
  let items = [], at = 0;
  const draw = () => {
    sug.hidden = !items.length;
    sug.replaceChildren(...items.map((it, i) => h("button.sitem", { type: "button", role: "option", "aria-selected": String(i === at), onmousedown: (e) => { e.preventDefault(); pick(i); } },
      h("b", { class: it.fn ? "fn" : null, text: it.code }), h("span", { text: it.name }), h("small", { text: it.desc }))));
  };
  const close = () => { items = []; draw(); };
  const pick = (i) => { const it = items[i]; if (!it) return; close(); input.value = ""; input.blur(); it.run(); };
  input.addEventListener("input", () => { items = suggest(input.value); at = 0; draw(); });
  input.addEventListener("focus", () => { items = suggest(input.value); at = 0; draw(); });
  input.addEventListener("blur", () => setTimeout(close, 120));
  input.addEventListener("keydown", (e) => {
    if (["Escape", "Enter", "ArrowDown", "ArrowUp", "Tab"].includes(e.key)) e.stopPropagation();
    if (e.key === "Escape") { input.value = ""; close(); input.blur(); return; }
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && items.length) { e.preventDefault(); at = (at + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length; draw(); return; }
    if (e.key === "Tab" && items[at]?.fill) { e.preventDefault(); input.value = items[at].fill; items = suggest(input.value); at = 0; draw(); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      const v = input.value.trim();
      // (what's typed, if it says a function; else the suggestion chosen)
      if (v && v.split(/\s+/).some((w) => fnOf(w))) { close(); command(v).then((ok) => { if (ok) { input.value = ""; input.blur(); } }); return; }
      if (items[at]) return pick(at);
      if (v) command(v).then((ok) => { if (ok) { input.value = ""; input.blur(); } });
    }
  });
  const tape = h("div.tape", {}, INDICES.filter((s) => S.q[s]).map((s) => { const q = S.q[s];
    return h("button.tick", { type: "button", onclick: () => go(s) }, h("span", { text: INDEX_NAMES[s] }), h("b.num", { "data-px": s, text: priceSaid(q) }), h("i", { class: `num ${tone(q.chgPct)}`, "data-pct": s, text: pct(q.chgPct) })); }));
  const me = h("button.dme", { type: "button", "aria-label": "You, your apps and settings", onclick: (e) => youMenu(e.currentTarget) }, meFace());
  const tabs = h("div.dtabs", { role: "tablist" }, [["port", "Portfolio", "P"], ["world", "World", "W"]].map(([k, label, key]) =>
    h("button", { type: "button", role: "tab", "aria-selected": String(D.screen === k), title: `${label} (${key})`, onclick: () => { if (D.screen !== k) { D.screen = k; redraw(); } }, text: label })));
  return h("div.dtop", {}, me, h("b.dbrand", { text: "Markets" }), tabs, h("div.dcmdw", {}, h("label.dcmd", {}, h("span.prompt", { text: "›" }), input, h("kbd", { text: "/" })), sug), tape,
    h("button.dme.act", { type: "button", "aria-label": "Find and add", onclick: () => openSheet(searchView) }, icon("search", 17, 2.4)));
}
// what's suggested as you type: a holding or market to open (its symbol, then its functions), or a function
function suggest(v) {
  const words = v.trim().split(/\s+/).filter(Boolean), gap = /\s$/.test(v), last = gap ? "" : (words.at(-1) || "").toUpperCase(), head = (gap ? words : words.slice(0, -1)).join(" ");
  const fnRow = ([code, name, desc], sym) => ({ fn: true, code, name, desc, fill: sym ? `${plainSym(sym)} ${code}` : code, run: () => run(code, sym) });
  if (!words.length) return FN.filter(([, , , needs]) => !needs).map((f) => fnRow(f)).concat(FN.filter(([, , , needs]) => needs).slice(0, 4).map((f) => fnRow(f, D.sel)));
  // (after a holding's name: its functions)
  const sec = head && resolveLocal(head);
  if (sec) return FN.filter(([c, , , needs]) => needs && c.startsWith(last)).map((f) => fnRow(f, sec));
  const k = v.trim().toLowerCase(), out = [], seen = new Set();
  const add = (sym, name, desc) => { if (seen.has(sym) || out.length >= 6) return; seen.add(sym); out.push({ sym, code: plainSym(sym), name, desc, fill: `${plainSym(sym)} `, run: () => go(sym) }); };
  for (const x of S.list) if (plainSym(x.symbol).toLowerCase().startsWith(k) || x.name.toLowerCase().includes(k)) add(x.symbol, x.name, x.qty > 0 ? `Yours · ${money(valueOf(x) || 0, "GBP", 0)}` : "Following");
  for (const [sym, name] of worldAll()) if (name.toLowerCase().includes(k) || plainSym(sym).toLowerCase().startsWith(k)) add(sym, name, "Market");
  const fns = FN.filter(([c, name]) => c.startsWith(v.trim().toUpperCase()) || name.toLowerCase().startsWith(k)).map((f) => fnRow(f, f[3] ? D.sel : null));
  // (its symbol exactly: what can be done with it, under it)
  const its = !fns.length && out[0] && plainSym(out[0].sym).toLowerCase() === k ? FN.filter(([, , , needs]) => needs).slice(0, 5).map((f) => fnRow(f, out[0].sym)) : [];
  return [...fns, ...(its.length ? [out[0], ...its, ...out.slice(1)] : out)].slice(0, 8);
}
const resolveLocal = (q) => { const k = q.trim().toLowerCase(); if (!k) return null;
  const m = S.list.find((x) => plainSym(x.symbol).toLowerCase() === k || x.symbol.toLowerCase() === k) || S.list.find((x) => x.name.toLowerCase().startsWith(k));
  if (m) return m.symbol;
  const w = worldAll().find(([s, n]) => plainSym(s).toLowerCase() === k || n.toLowerCase() === k || n.toLowerCase().startsWith(k));
  return w ? w[0] : null; };
// a symbol from what's typed: yours, a market's, or found
async function resolve(q) {
  const mine = resolveLocal(q);
  if (mine) return mine;
  const r = await A.search(q), x = r.results[0];
  return x ? x.symbol : null;
}
// a function, done (for a symbol, where it needs one)
async function run(code, sym, arg) {
  if (code === "WEI") { D.screen = "world"; redraw(); return true; }
  if (code === "FXC") { D.screen = "world"; redraw(); requestAnimationFrame(() => $("#dfx")?.scrollIntoView({ block: "nearest", behavior: "smooth" })); return true; }
  if (code === "PORT") { D.screen = "port"; redraw(); return true; }
  if (code === "HELP") { help(); return true; }
  if (code === "ADD") { openSheet(searchView); if (arg) setTimeout(() => { const q = $("#mk-q"); if (q) { q.value = arg; q.dispatchEvent(new Event("input")); } }, 450); return true; }
  sym ??= D.sel;
  if (!sym) return false;
  if (code === "ALRT") {
    const p = Number(arg);
    if (!S.list.some((x) => x.symbol === sym)) { toast("Add it to your list first, to hear about it.", true); return false; }
    if (!Number.isFinite(p) || p < 0.5 || p > 50) { pushSheet(alertView, sym); return true; }
    try { const r = await A.setAlert(sym, true, p); S.list = r.holdings; toast(`You'll hear when ${nameOf(sym)} moves ${p}% in a day`); return true; } catch (e) { toast(e.message, true); return false; }
  }
  if (code === "COMP" && /^(off|none|clear)$/i.test(arg || "")) { D.vs = null; D.view = "chart"; await go(sym); return true; }
  if (code === "COMP") { const other = arg ? await resolve(arg) : null; if (arg && !other) { toast(`Couldn't find “${arg}” to compare with.`, true); return false; } D.vs = other; D.view = "chart"; await go(sym); return true; }
  D.view = code === "HP" ? "hp" : code === "DVD" ? "dvd" : code === "N" ? "news" : "chart";
  if (code === "GPC") D.type = "candle";
  if (code === "GP") D.type = "line";
  await go(sym);
  return true;
}
// one chosen, on the Portfolio screen (its price asked for first, if it isn't here yet)
async function go(sym) {
  if (!S.q[sym]) { try { const r = await A.quotes([sym]); Object.assign(S.q, r.quotes); Object.assign(S.fx, r.rates); } catch (_) {} }
  if (!S.q[sym]) { toast("Couldn't get its price just now.", true); return; }
  D.sel = sym;
  if (D.screen !== "port") { D.screen = "port"; redraw(); return; }
  choose(sym);
}
// what's typed on the command line, done: SYMBOL FUNCTION [arg], FUNCTION [arg], or a name or symbol (its chart)
async function command(v) {
  const words = v.split(/\s+/), fi = words.findIndex((w) => fnOf(w));
  const range = RANGES.find(([, label]) => label.toLowerCase() === (words.at(-1) || "").toLowerCase());
  if (range) { D.range = range[0]; words.pop(); }
  if (fi < 0) { const sym = await resolve(words.join(" ")); if (!sym) { toast(`Nothing found for “${v}”`, true); return false; } D.view = "chart"; await go(sym); return true; }
  const code = fnOf(words[fi])[0], before = words.slice(0, fi).join(" "), after = words.slice(fi + 1).join(" ");
  const sym = before ? await resolve(before) : null;
  if (before && !sym) { toast(`Nothing found for “${before}”`, true); return false; }
  return run(code, sym, after);
}
// every function and key, over the desk
function help() {
  if ($(".dhelp")) return;
  const esc = (e) => { if (e.key === "Escape") close(); };
  const close = () => { box.remove(); removeEventListener("keydown", esc, true); };
  const box = h("div.dhelp", { role: "dialog", "aria-label": "Functions and keys", onclick: (e) => { if (e.target === box) close(); } },
    h("div.dhelpc", {}, h("div.dhead", {}, h("h2", { text: "Functions" }), h("button.dbtn", { type: "button", onclick: close, text: "Close" })),
      h("div.hgrid", {}, FN.map(([c, n, d, needs]) => h("div", {}, h("b.fn", { text: c }), h("span", {}, h("strong", { text: n }), ` · ${d}`), h("small", { text: needs ? `e.g. RR ${c}` : c })))),
      h("div.dhead", { style: "margin-top:16px" }, h("h2", { text: "Keys" })),
      h("div.hkeys", {}, [["/ or ⌘K", "the command line"], ["↑ ↓", "your holdings"], ["1–5", "range"], ["K", "candles"], ["L", "log scale"], ["A", "averages"], ["B", "Bollinger bands"], ["V", "volume"], ["R", "RSI"], ["M", "MACD"], ["C", "vs the market"], ["W · P", "World · Portfolio"], ["Enter", "its page"]]
        .map(([k, s]) => h("span", {}, h("kbd", { text: k }), s)))));
  addEventListener("keydown", esc, true);
  $(".desk")?.append(box);
}

// ---- the portfolio: its totals; every holding, sortable; what you follow ----
const COLS = [["name", "Name"], ["spark", ""], ["day", "Day"], ["value", "Value"], ["back", "Since"]];
function backOf(x) { if (!x.cost) return null; const paid = paidFor(x); return ((valueOf(x) - paid + (divsOf(x) || 0)) / paid) * 100; }
function portPane() {
  const T = totals();
  const sum = h("div.dsum", {},
    h("div.pv", {}, h("small", { text: "Your portfolio" }), h("b.num", { id: "dpv", text: money(T.value) }), (() => { const ds = daySeries(); return ds ? spark(ds.vals, 120, 24, ds.base) : null; })()),
    h("div", {}, h("small", { text: "Today" }), h("b", { class: `num ${tone(T.day)}`, id: "dpd", text: `${signed(T.day)}` }), h("i", { class: `num ${tone(T.day)}`, id: "dpp", text: pct(T.dayPct) })),
    T.back != null ? h("div", {}, h("small", { text: "Since bought" }), h("b", { class: `num ${tone(T.back)}`, text: signed(T.back, "GBP", 0) }), h("i", { class: `num ${tone(T.back)}`, text: pct(T.backPct, 1) })) : null);
  const own = owned(), fol = S.list.filter((x) => !(x.qty > 0));
  return h("div.dpane.port", {}, h("div.dhead", {}, h("h2", { text: "Portfolio" }), h("button.dbtn", { type: "button", onclick: () => openSheet(searchView) }, icon("plus", 14, 2.6), "Add")),
    sum, own.length ? holdTable(own, T) : null,
    fol.length ? [h("h3.dsub", { text: "Following" }), followTable(fol)] : null);
}
function holdTable(own, T) {
  const val = { name: (x) => x.name.toLowerCase(), spark: (x) => S.q[x.symbol].chgPct ?? 0, day: (x) => S.q[x.symbol].chgPct ?? 0, value: valueOf, back: (x) => backOf(x) ?? -1e9 };
  const { k, dir } = D.sort, rows = [...own].sort((a, b) => { const p = val[k](a), q = val[k](b); return (p < q ? -1 : p > q ? 1 : 0) * dir; });
  const th = COLS.map(([key, label]) => key === "spark" ? h("th", { "aria-hidden": "true" }) : h("th", { scope: "col", title: key === "back" ? "Since you bought, with dividends" : key === "value" ? "Value, and its share of your money" : null, "aria-sort": key === k ? (dir > 0 ? "ascending" : "descending") : null },
    h("button", { type: "button", onclick: () => { D.sort = { k: key, dir: key === k ? -dir : key === "name" ? 1 : -1 }; $(".port")?.replaceWith(portPane()); } }, label, key === k ? h("span.ar", { text: dir > 0 ? "▲" : "▼" }) : null)));
  return h("table.dt", { id: "dhold" }, h("thead", {}, h("tr", {}, th)), h("tbody", {}, rows.map((x) => {
    const q = S.q[x.symbol], b = backOf(x), w = (valueOf(x) / T.value) * 100;
    return h("tr", { "data-sym": x.symbol, class: x.symbol === D.sel ? "on" : null, tabindex: "-1", onclick: () => choose(x.symbol) },
      h("td", {}, h("b", { text: x.name }), h("small", {}, `${plainSym(x.symbol)} · `, h("span.num", { "data-px": x.symbol, text: priceSaid(q) }))),
      h("td.sp", {}, spark(q.spark, 52, 20, q.prev)),
      h("td", { class: `num ${tone(q.chgPct)}`, "data-pct": x.symbol, text: pct(q.chgPct) }),
      h("td.num", {}, h("b.num", { "data-val": x.symbol, text: money(valueOf(x), "GBP", 0) }), h("small", {}, h("span.wt", {}, h("i", { style: `width:${Math.min(100, w * 2.5)}%` })), `${fmt(w, 1)}%`)),
      h("td", { class: `num ${b == null ? "flat-t" : tone(b)}`, text: b == null ? "–" : pct(b, 1) }));
  })));
}
function followTable(fol) {
  return h("table.dt.small", {}, h("tbody", {}, fol.map((x) => { const q = S.q[x.symbol];
    return h("tr", { "data-sym": x.symbol, class: x.symbol === D.sel ? "on" : null, onclick: () => choose(x.symbol) },
      h("td", {}, h("b", { text: x.name }), h("small", { text: [plainSym(x.symbol), q?.ex].filter(Boolean).join(" · ") })),
      h("td.sp", {}, q ? spark(q.spark, 52, 20, q.prev) : null), h("td.num", { "data-px": x.symbol, text: q ? priceSaid(q) : "–" }), h("td", { class: `num ${tone(q?.chgPct)}`, "data-pct": x.symbol, text: q ? pct(q.chgPct) : "" })); })));
}
function choose(sym) {
  D.sel = sym;
  document.querySelectorAll(".dt tr[data-sym]").forEach((r) => r.classList.toggle("on", r.dataset.sym === sym));
  document.querySelector(`.dt tr[data-sym="${CSS.escape(sym)}"]`)?.scrollIntoView({ block: "nearest" });
  redrawInst();
}

// ---- the one chosen: its chart (or prices, dividends, news), its figures, why it's moving ----
function redrawInst() { $(".inst")?.replaceWith(instPane()); }
const STUDIES = [["ma", "Averages", "50- and 200-day", "A"], ["bb", "Bollinger bands", "20-day, 2 deviations", "B"], ["vol", "Volume", "", "V"], ["rsi", "RSI", "14-day", "R"], ["macd", "MACD", "12, 26, 9", "M"], ["log", "Log scale", "", "L"]];
function instPane() {
  const sym = D.sel, q = S.q[sym], x = S.list.find((y) => y.symbol === sym);
  if (!q) return h("div.dpane.inst", {}, h("p.dempty", { text: "Choose one on the left." }));
  const name = x?.name || worldName(sym) || q.name;
  const views = h("div.ivtabs", { role: "tablist" }, [["chart", "Chart", "GP"], ["hp", "Prices", "HP"], ["dvd", "Dividends", "DVD"], ["news", "News", "N"]].map(([k, label, code]) =>
    h("button", { type: "button", role: "tab", "aria-selected": String(D.view === k), onclick: () => { D.view = k; redrawInst(); } }, label, h("small", { text: code }))));
  const acts = x ? [
    h("button.dbtn", { type: "button", onclick: () => pushSheet(alertView, sym) }, icon("bell", 14, 2.4), x.alert ? `±${fmt(x.alert, 0)}%` : "Alert"),
    h("button.dbtn", { type: "button", onclick: () => sendInChat(sym) }, icon("send", 14, 2.4), "Send"),
    h("button.dbtn", { type: "button", onclick: () => openSheet(editView, sym) }, icon("pen", 14, 2.4), "Edit")]
    : [h("button.dbtn.go", { type: "button", onclick: () => openSheet(editView, sym, { name }) }, icon("plus", 14, 2.6), "Add")];
  const headr = h("div.ihead", {}, h("div", {}, h("small", { text: [plainSym(sym), q.ex, KIND_SAID[kindOf(q)]].filter(Boolean).join(" · ") }), h("h2", { text: name }),
    h("div.iprice", {}, h("b.num", { "data-px": sym, text: isRate(sym) ? `${fmt(yieldOf(q.price), 3)}%` : priceSaid(q) }), h("span", { class: `num ${tone(q.chgPct)}`, id: "dchg", text: `${q.chg != null && !isRate(sym) ? signed(q.chg, q.cur, q.price < 1 ? 4 : 2) + " " : ""}(${pct(q.chgPct)})` }), h("span.muted", { id: "dchgsaid", text: "today" }))),
    h("div.iacts", {}, acts));
  const body = D.view === "hp" ? historyView(sym, q) : D.view === "dvd" ? divView(sym, q, x) : D.view === "news" ? symNews(sym) : chartView(sym, q, x);
  return h("div.dpane.inst", {}, headr, views, body);
}
function chartView(sym, q, x) {
  const seg = h("div.dseg", { role: "group", "aria-label": "Range" }, RANGES.map(([r, label], i) => h("button", { type: "button", "aria-pressed": String(r === D.range), title: `${label} (${i + 1})`, onclick: () => { D.range = r; redrawInst(); }, text: label })));
  const type = h("div.dseg", { role: "group", "aria-label": "Chart" }, [["line", "Line"], ["candle", "Candles"]].map(([k, label]) => h("button", { type: "button", "aria-pressed": String(D.type === k), title: k === "candle" ? "Candles (K)" : "Line (K)", onclick: () => { D.type = k; redrawInst(); }, text: label })));
  const menuBtn = (k, label) => h("button.dtog.menu", { type: "button", "aria-expanded": String(D.menu === k), onclick: (e) => { e.stopPropagation(); D.menu = D.menu === k ? null : k; redrawInst(); } }, label, h("span.car", { text: "▾" }));
  const on = STUDIES.filter(([k]) => D[k]).length;
  const tools = h("div.dtools", {}, seg, type, h("span.dsp"), menuBtn("studies", `Studies${on ? ` · ${on}` : ""}`), menuBtn("comp", D.vs ? `vs ${worldName(D.vs) || nameOf(D.vs)}` : "Compare"));
  if (D.menu === "studies") tools.append(h("div.dmenu", { role: "menu" }, STUDIES.map(([k, label, sub, key]) => h("button", { type: "button", role: "menuitemcheckbox", "aria-checked": String(!!D[k]), onclick: (e) => { e.stopPropagation(); D[k] = !D[k]; redrawInst(); } },
    h("i.chk"), h("span", {}, label, sub ? h("small", { text: ` ${sub}` }) : null), h("kbd", { text: key })))));
  if (D.menu === "comp") tools.append(h("div.dmenu.r", { role: "menu" }, [...VS, ...S.list.filter((y) => y.symbol !== sym).slice(0, 5).map((y) => [y.symbol, y.name])].map(([s, n]) =>
    h("button", { type: "button", role: "menuitemradio", "aria-checked": String(D.vs === s), onclick: (e) => { e.stopPropagation(); D.vs = D.vs === s ? null : s; D.menu = null; redrawInst(); } }, h("i.chk"), h("span", { text: n }))),
    D.vs ? h("button", { type: "button", onclick: (e) => { e.stopPropagation(); D.vs = null; D.menu = null; redrawInst(); } }, h("i"), h("span", { text: "Clear" })) : null, h("p", { text: "Or type: RR COMP SHEL" })));
  const subs = (D.vol ? 54 : 0) + (D.rsi ? 72 : 0) + (D.macd ? 72 : 0);
  const box = h("div.dchart", { id: "dchart" }), tip = h("div.dtip.num", { id: "dtip" }), legend = h("div.dlegend", { id: "dlegend" });
  const wrap = h("div.dchartw", { style: `height:calc(max(300px, 100svh - 560px) + ${subs}px)` }, box, tip);
  const why = h("p.dwhy", { id: "why" });
  requestAnimationFrame(() => { drawChart(box, sym); whyMoving(sym, why); });
  return [tools, legend, wrap, figures(sym, x, q), why];
}
// its prices, day by day (newest first), and a way to keep them
function historyView(sym, q) {
  const r = D.range === "1d" || D.range === "5d" ? "1mo" : D.range, body = h("div.hp", {}, h("p.dempty", { text: "Getting its prices…" }));
  const seg = h("div.dseg", { role: "group", "aria-label": "Range" }, RANGES.slice(2).map(([rr, label]) => h("button", { type: "button", "aria-pressed": String(rr === r), onclick: () => { D.range = rr; redrawInst(); }, text: label })));
  const dl = h("button.dbtn", { type: "button", disabled: true }, icon("plus", 13, 2.6), "Download (CSV)");
  chartOf(sym, r).then((c) => {
    if (!body.isConnected) return;
    const tz = q.tz || undefined, day = (t) => new Date(t * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: tz });
    const rows = c.t.map((t, i) => ({ t, o: c.o?.[i] ?? c.c[i], h: c.h?.[i] ?? c.c[i], l: c.l?.[i] ?? c.c[i], c: c.c[i], v: c.v?.[i] ?? 0, ch: i ? (c.c[i] / c.c[i - 1] - 1) * 100 : null })).reverse();
    const p = (v) => priceSaid(q, v);
    body.replaceChildren(h("table.dt.hpt", {}, h("thead", {}, h("tr", {}, ["Date", "Open", "High", "Low", "Close", "Change", "Volume"].map((s) => h("th", { scope: "col" }, h("button", { type: "button", tabindex: "-1", text: s }))))),
      h("tbody", {}, rows.map((x) => h("tr", {}, h("td", { text: day(x.t) }), h("td.num", { text: p(x.o) }), h("td.num", { text: p(x.h) }), h("td.num", { text: p(x.l) }), h("td.num", {}, h("b", { text: p(x.c) })),
        h("td", { class: `num ${x.ch == null ? "flat-t" : tone(x.ch)}`, text: x.ch == null ? "–" : pct(x.ch) }), h("td.num", { text: x.v ? (x.v >= 1e6 ? `${fmt(x.v / 1e6, 2)}m` : fmt(x.v, 0)) : "–" }))))));
    dl.disabled = false;
    dl.onclick = () => {
      const csv = ["Date,Open,High,Low,Close,Volume", ...rows.map((x) => [new Date(x.t * 1000).toISOString().slice(0, 10), x.o, x.h, x.l, x.c, x.v].join(","))].join("\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" })), a = h("a", { href: url, download: `${plainSym(sym)}-${r}.csv` });
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
  }, () => { if (body.isConnected) body.replaceChildren(h("p.dempty", { text: "Couldn't get its prices just now." })); });
  return [h("div.dtools", {}, seg, h("span.dsp"), dl), body];
}
// every dividend it's paid: each year's together, then each one
function divView(sym, q, x) {
  const body = h("div.dv", {}, h("p.dempty", { text: "Getting its dividends…" }));
  A.divs(sym).then((r) => {
    if (!body.isConnected) return;
    const divs = r.divs || [];
    if (!divs.length) return body.replaceChildren(h("p.dempty", { text: "It hasn't paid a dividend." }));
    const yr = (t) => new Date(t * 1000).getFullYear(), years = {}, now = Date.now() / 1000;
    for (const d of divs) years[yr(d.t)] = (years[yr(d.t)] || 0) + d.amount;
    const ys = Object.keys(years).map(Number).sort().slice(-12), max = Math.max(...ys.map((y) => years[y]));
    const last12 = divs.filter((d) => d.t > now - 365 * 86400).reduce((a, d) => a + d.amount, 0), five = divs.filter((d) => d.t > now - 6 * 365 * 86400 && d.t <= now - 5 * 365 * 86400).reduce((a, d) => a + d.amount, 0);
    const cell = (label, v, sub, cls) => h("div.fig", {}, h("small", { text: label }), h("b", { class: `num ${cls || ""}`, text: v }), sub ? h("span", { text: sub }) : null);
    body.replaceChildren(
      h("div.figs", {}, cell("Last 12 months", priceSaid(q, last12), "a share"), cell("Yield", q.price ? `${fmt((last12 / q.price) * 100, 2)}%` : "–", "on today's price"),
        cell("Over 5 years", five ? pct((last12 / five - 1) * 100, 0) : "–", five ? "growth in its yearly dividend" : "not 5 years of them", five ? tone(last12 - five) : ""),
        x?.qty > 0 && rate(q.cur) != null ? cell("To you", money(last12 * x.qty * rate(q.cur), "GBP", 0), "a year, on what you own") : cell("Paid", `${divs.length} times`, `since ${yr(divs[0].t)}`)),
      h("div.dvbars", { "aria-hidden": "true" }, ys.map((y) => h("div", {}, h("i", { style: `height:${Math.max(3, (years[y] / max) * 100)}%` }), h("small", { text: String(y).slice(2) })))),
      h("table.dt.dvt", {}, h("thead", {}, h("tr", {}, ["Went ex-dividend", "Amount", "Change"].map((s) => h("th", { scope: "col" }, h("button", { type: "button", tabindex: "-1", text: s }))))),
        h("tbody", {}, [...divs].reverse().slice(0, 40).map((d, i, all) => { const prev = all[i + 1], ch = prev ? (d.amount / prev.amount - 1) * 100 : null;
          return h("tr", {}, h("td", { text: new Date(d.t * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) }), h("td.num", { text: priceSaid(q, d.amount) }), h("td", { class: `num ${ch == null || Math.abs(ch) < 0.05 ? "flat-t" : tone(ch)}`, text: ch == null ? "–" : pct(ch, 1) })); }))));
  }, () => { if (body.isConnected) body.replaceChildren(h("p.dempty", { text: "Couldn't get its dividends just now." })); });
  return [body];
}
// the news about it
function symNews(sym) {
  const list = h("div.dnews.full", {}, h("p.dempty", { text: "Getting the news…" }));
  A.news([sym]).then((r) => {
    if (!list.isConnected) return;
    const items = r.news || [];
    list.replaceChildren(...(items.length ? items.slice(0, 20).map((n) => h("div.nrow", {}, h("a", { href: n.link, target: "_blank", rel: "noopener", text: n.title }), h("div.nm", {}, h("span", { text: `${n.src} · ${ago(n.at)}` })))) : [h("p.dempty", { text: "No news about it just now." })]));
  }, () => { if (list.isConnected) list.replaceChildren(h("p.dempty", { text: "Couldn't get the news just now." })); });
  return [list];
}
function figures(sym, x, q) {
  const y = S.years[sym], cells = [];
  const cell = (label, v, sub, cls) => cells.push(h("div.fig", {}, h("small", { text: label }), h("b", { class: `num ${cls || ""}`, text: v }), sub ? h("span.num", { text: sub }) : null));
  if (q.dayLo != null && q.dayHi != null && !isRate(sym)) cell("Day's range", `${priceSaid(q, q.dayLo)} – ${priceSaid(q, q.dayHi)}`, q.prev ? `closed ${priceSaid(q, q.prev)}` : "");
  const hi = q.hi52 ?? y?.hi52, lo = q.lo52 ?? y?.lo52;
  if (hi && lo && !isRate(sym)) cell("52-week range", `${priceSaid(q, lo)} – ${priceSaid(q, hi)}`, `${Math.round(((q.price - lo) / (hi - lo || 1)) * 100)}% of the way up`);
  if (y?.yr != null) cell("1 year", pct(y.yr, 1), "on its price", tone(y.yr));
  if (y?.div12 > 0 && q.price) cell("Dividend yield", `${fmt((y.div12 / q.price) * 100, 1)}%`, `${priceSaid(q, y.div12)} a share a year`);
  if (x?.qty > 0 && valueOf(x) != null) {
    const T = totals(), b = backOf(x), nx = income().events.find((e) => e.x.symbol === sym);
    cell("Yours", money(valueOf(x)), `${fmt(x.qty, x.qty % 1 ? 2 : 0)} shares · ${fmt((valueOf(x) / T.value) * 100, 1)}% of your money`);
    cell("Today", signed(dayOf(x) || 0), pct(q.chgPct), tone(q.chgPct));
    if (b != null) cell("Since bought", pct(b, 1), divsOf(x) >= 0.5 ? `with ${money(divsOf(x), "GBP", 0)} of dividends` : `on ${priceSaid(q, x.cost)} a share`, tone(b));
    if (nx) cell("Next dividend", `about ${money(nx.v, "GBP", 0)}`, `around ${nx.at.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`);
  }
  return cells.length ? h("div.figs", {}, cells) : null;
}
// nice round steps for an axis: nearest n of them between lo and hi
function ticks(lo, hi, n = 5) {
  const span = hi - lo || Math.abs(hi) || 1, mag = 10 ** Math.floor(Math.log10(span / n)), step = [1, 2, 2.5, 5, 10].map((m) => m * mag).reduce((a, b) => (Math.abs(span / b - n) < Math.abs(span / a - n) ? b : a));
  const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}
// the studies' numbers, from its closes
const avg = (vals, n) => vals.map((_, i) => (i < n - 1 ? null : vals.slice(i - n + 1, i + 1).reduce((a, b) => a + b, 0) / n));
const sdev = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
const ema = (vals, n) => { const k = 2 / (n + 1); let e = null; return vals.map((v) => (e = e == null ? v : v * k + e * (1 - k))); };
function rsiOf(vals, n = 14) {
  const out = vals.map(() => null); let g = 0, l = 0;
  for (let i = 1; i < vals.length; i++) {
    const d = vals[i] - vals[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0);
    if (i <= n) { g += up / n; l += dn / n; if (i < n) continue; } else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; }
    out[i] = 100 - 100 / (1 + g / (l || 1e-9));
  }
  return out;
}
function macdOf(vals) { const a = ema(vals, 12), b = ema(vals, 26), m = a.map((x, i) => x - b[i]), s = ema(m, 9); return { m, s, g: m.map((x, i) => x - s[i]) }; }
function bandsOf(vals, n = 20, k = 2) { const mid = avg(vals, n); return { mid, up: mid.map((m, i) => (m == null ? null : m + k * sdev(vals.slice(i - n + 1, i + 1)))), dn: mid.map((m, i) => (m == null ? null : m - k * sdev(vals.slice(i - n + 1, i + 1)))) }; }
const x0name = (sym) => (S.list.find((x) => x.symbol === sym)?.name || worldName(sym) || nameOf(sym));

// The large chart: its prices as a line or candles (log, if asked), its averages and bands, set against another if
// asked (both as % from where the range starts); volume, RSI and MACD in panes under it; prices and times on the edges;
// and exactly what's under the pointer, across every pane
async function drawChart(box, sym) {
  const r = D.range, q = S.q[sym];
  box.classList.add("loading");
  let c, b = null;
  try { [c, b] = await Promise.all([chartOf(sym, r), D.vs && D.vs !== sym ? chartOf(D.vs, r).catch(() => null) : null]); } catch (e) { box.classList.remove("loading"); box.replaceChildren(h("p.dempty", { text: "Couldn't get its chart just now." })); return; }
  if (!box.isConnected || D.sel !== sym || D.range !== r) return;
  box.classList.remove("loading");
  const t = [...c.t], v = [...c.c], vol = c.v?.length === c.c.length ? [...c.v] : null;
  const has = c.o?.length === c.c.length, o = has ? [...c.o] : null, hi = has ? [...c.h] : null, lw = has ? [...c.l] : null;
  if (r === "1d" && q.price != null && q.time && q.time > t.at(-1)) { const p0 = v.at(-1); t.push(q.time); v.push(q.price); vol?.push(0); if (has) { o.push(p0); hi.push(Math.max(p0, q.price)); lw.push(Math.min(p0, q.price)); } }
  if (t.length < 2) { box.replaceChildren(h("p.dempty", { text: "Not enough of its prices to draw yet." })); return; }
  let bv = null;
  if (b?.t?.length) { let j = 0; bv = t.map((tt) => { while (j < b.t.length - 1 && b.t[j + 1] <= tt) j++; return b.t[j] <= tt ? b.c[j] : null; }); const f = bv.find((x) => x != null); bv = bv.map((x) => (x == null ? f : x)); }
  const rel = !!bv, rate10 = isRate(sym), conv = (x) => (rate10 ? yieldOf(x) : x), vv = v.map(conv);
  const base = r === "1d" ? conv(c.prev ?? q.prev ?? v[0]) : vv[0], ys = rel ? v.map((x) => (x / v[0] - 1) * 100) : vv, bs = rel ? bv.map((x) => (x / bv[0] - 1) * 100) : null;
  const candle = D.type === "candle" && has && !rel, logs = D.log && !rel && Math.min(...vv) > 0;
  const mas = !rel && D.ma && (r === "1y" || r === "5y") ? (r === "1y" ? [[avg(vv, 50), "50-day average"]] : [[avg(vv, 10), "50-day average"], [avg(vv, 40), "200-day average"]]) : [];
  const bb = !rel && D.bb && vv.length > 25 ? bandsOf(vv) : null;
  const say = (val) => (rel ? pct(val) : rate10 ? `${fmt(val, 2)}%` : priceSaid(q, val));
  // (the panes: the price's, then volume, RSI and MACD, each with its height)
  const W = box.clientWidth || 700, H = box.clientHeight || 380, R = 64, B = 22, top = 12, G = 10;
  const panes = [D.vol && vol?.some((x) => x > 0) ? ["vol", 44] : null, D.rsi ? ["rsi", 62] : null, D.macd ? ["macd", 62] : null].filter(Boolean);
  const ph = H - top - B - panes.reduce((a, [, hh]) => a + hh + G, 0);
  const session = r === "1d" && q.open ? q.open : null, t0 = session ? session.start : t[0], t1 = session ? session.end : t.at(-1);
  const X = (tt) => ((tt - t0) / (t1 - t0 || 1)) * (W - R);
  const all = [...ys, ...(bs || []), ...mas.flatMap(([m]) => m.filter((x) => x != null)), ...(bb ? [...bb.up, ...bb.dn].filter((x) => x != null) : []), ...(candle ? [...hi, ...lw].map(conv) : []), ...(rel ? [0] : [base])];
  // (a candle a day where there's room for one; else a week's, a month's, or a few at a time)
  let cs = null, per = null;
  if (candle) {
    per = t.length > (W - R) / 6 ? (r === "1y" ? "week" : r === "5y" ? "month" : Math.ceil(t.length / ((W - R) / 6))) : null;
    const keyOf = (i) => (per === "week" ? Math.floor((t[i] / 86400 + 3) / 7) : per === "month" ? new Date(t[i] * 1000).getUTCFullYear() * 12 + new Date(t[i] * 1000).getUTCMonth() : per ? Math.floor(i / per) : i);
    cs = []; t.forEach((tt, i) => { const kk = keyOf(i), last = cs.at(-1);
      if (last && last.key === kk) { last.i1 = i; last.c = vv[i]; last.h = Math.max(last.h, conv(hi[i])); last.l = Math.min(last.l, conv(lw[i])); last.v += vol?.[i] || 0; }
      else cs.push({ key: kk, i0: i, i1: i, o: conv(o[i]), c: vv[i], h: conv(hi[i]), l: conv(lw[i]), v: vol?.[i] || 0 }); });
  }
  const lo = Math.min(...all), hiV = Math.max(...all), padv = (hiV - lo || 1) * 0.06, L0 = logs ? Math.log(lo * 0.98) : lo - padv, L1 = logs ? Math.log(hiV * 1.02) : hiV + padv;
  const Y = (val) => top + ph * (1 - ((logs ? Math.log(val) : val) - L0) / (L1 - L0));
  cs?.forEach((k) => { k.x = (X(t[k.i0]) + X(t[k.i1])) / 2; });
  const cOf = cs ? t.map(() => 0) : null; cs?.forEach((k, j) => { for (let i = k.i0; i <= k.i1; i++) cOf[i] = j; });
  const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${x0name(sym)}, ${RANGES.find((x) => x[0] === r)[2]}` });
  for (const tv of logs ? ticks(lo, hiV, 5) : ticks(L0, L1, 5)) { const yy = Y(tv); if (yy < top - 2 || yy > top + ph + 2) continue;
    svg.append(el("line", { class: "grid", x1: 0, x2: W - R, y1: yy, y2: yy }));
    const tx = el("text", { class: "ax", x: W - R + 8, y: yy + 4 }); tx.textContent = rel ? pct(tv, Math.abs(tv) < 10 ? 1 : 0) : say(tv); svg.append(tx); }
  const tz = q.tz || undefined, n = W < 640 ? 4 : 6;
  for (let i = 0; i <= n; i++) { const tt = t0 + ((t1 - t0) * i) / n, xx = X(tt), d = new Date(tt * 1000);
    const said = r === "1d" ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz }) : r === "5d" ? d.toLocaleDateString("en-GB", { weekday: "short", timeZone: tz }) : r === "5y" ? d.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: tz }) : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: tz });
    const tx = el("text", { class: "ax", x: Math.min(W - R - 4, Math.max(2, xx)), y: H - 6, "text-anchor": i === 0 ? "start" : i === n ? "end" : "middle" }); tx.textContent = said; svg.append(tx); }
  svg.append(el("line", { class: "basel", x1: 0, x2: W - R, y1: Y(rel ? 0 : base), y2: Y(rel ? 0 : base) }));
  const path = (vals, Yf = Y) => vals.map((val, i) => (val == null ? null : `${X(t[i]).toFixed(1)} ${Yf(val).toFixed(1)}`)).filter(Boolean).map((p, i) => (i ? "L" : "M") + p).join(" ");
  const up = ys.at(-1) >= (rel ? 0 : base), col = up ? "var(--up)" : "var(--down)";
  // (Bollinger bands: the space between them shaded, the middle dashed)
  if (bb) { const iu = bb.up.map((x, i) => (x == null ? null : [X(t[i]), Y(x)])).filter(Boolean), idn = bb.dn.map((x, i) => (x == null ? null : [X(t[i]), Y(x)])).filter(Boolean).reverse();
    svg.append(el("path", { class: "bbf", d: `M${[...iu, ...idn].map((p) => p.map((n2) => n2.toFixed(1)).join(" ")).join(" L")} Z` }), el("path", { class: "bbl", d: path(bb.up) }), el("path", { class: "bbl", d: path(bb.dn) }), el("path", { class: "bbm", d: path(bb.mid) })); }
  if (candle) {
    const bw = Math.max(1.4, ((W - R) / cs.length) * 0.62);
    for (const k of cs) { const upc = k.c >= k.o, g = el("g", { class: upc ? "cu" : "cd" });
      g.append(el("line", { x1: k.x, x2: k.x, y1: Y(k.h), y2: Y(k.l) }), el("rect", { x: k.x - bw / 2, y: Y(Math.max(k.o, k.c)), width: bw, height: Math.max(1, Math.abs(Y(k.o) - Y(k.c))) }));
      svg.append(g); }
  } else if (!rel) { const d = path(ys), a = el("path", { class: "area", d: `${d} L${X(t.at(-1)).toFixed(1)} ${top + ph} L${X(t[0]).toFixed(1)} ${top + ph} Z` }); a.style.fill = up ? "var(--up-soft)" : "var(--down-soft)"; svg.append(a); }
  mas.forEach(([m], i) => svg.append(el("path", { class: `ma ma${i}`, d: path(m) })));
  if (bs) svg.append(el("path", { class: "vsl", d: path(bs) }));
  if (!candle) { const pl = el("path", { class: "pl", d: path(ys) }); pl.style.stroke = col; svg.append(pl); }
  if (!rel && vv.length > 10) {
    const hiI = vv.indexOf(Math.max(...vv)), loI = vv.indexOf(Math.min(...vv));
    for (const [i, up2, said] of [[hiI, true, "High"], [loI, false, "Low"]]) {
      const xx = X(t[i]), yy = Y(vv[i]), right = xx > (W - R) * 0.75, tx = el("text", { class: "hl", x: xx + (right ? -6 : 6), y: yy + (up2 ? -7 : 14), "text-anchor": right ? "end" : "start" });
      tx.textContent = `${said} ${say(vv[i])}`; svg.append(el("circle", { class: "hld", cx: xx, cy: yy, r: 2.5 }), tx);
    }
  }
  const tagY = Math.max(top + 8, Math.min(top + ph - 8, Y(ys.at(-1))));
  const tag = el("rect", { class: "tag", x: W - R + 2, y: tagY - 9, width: R - 4, height: 18, rx: 5 }); tag.style.fill = col;
  const tagTx = el("text", { class: "tagt", x: W - R + 8, y: tagY + 4 }); tagTx.textContent = say(ys.at(-1));
  svg.append(el("line", { class: "tagl", x1: X(t.at(-1)), x2: W - R, y1: Y(ys.at(-1)), y2: Y(ys.at(-1)) }), tag, tagTx);
  // (the panes under it: volume; RSI, its 30 and 70; MACD, its signal and the bars between)
  let y0 = top + ph + G;
  const rsi = D.rsi ? rsiOf(vv) : null, md = D.macd ? macdOf(vv) : null, paneAt = {};
  for (const [k, hh] of panes) {
    paneAt[k] = [y0, hh];
    svg.append(el("line", { class: "psep", x1: 0, x2: W, y1: y0 - G / 2, y2: y0 - G / 2 }));
    const lab = el("text", { class: "plab", x: 2, y: y0 + 10 });
    if (k === "vol") { lab.textContent = "Volume";
      // (a bar a candle, when they're a week's or a month's)
      const bars = per ? cs.map((c2) => [c2.x, c2.v, c2.c < c2.o]) : vol.map((x, i) => [X(t[i]), x, i && v[i] < v[i - 1]]);
      const vmax = Math.max(...bars.map((b2) => b2[1])), bw = Math.max(1, ((W - R) / bars.length) * (per ? 0.62 : 0.66));
      for (const [xx, x, dn] of bars) { if (!x) continue; const bh = (x / vmax) * (hh - 2); svg.append(el("rect", { class: `volb ${dn ? "dn" : "up"}`, x: xx - bw / 2, y: y0 + hh - bh, width: bw, height: bh })); } }
    if (k === "rsi") { const Yr = (x) => y0 + hh * (1 - x / 100); lab.textContent = `RSI 14 · ${rsi.at(-1) != null ? fmt(rsi.at(-1), 1) : "–"}`;
      svg.append(el("rect", { class: "rsiz", x: 0, y: Yr(70), width: W - R, height: Yr(30) - Yr(70) }));
      for (const lv of [30, 70]) { svg.append(el("line", { class: "grid dash", x1: 0, x2: W - R, y1: Yr(lv), y2: Yr(lv) })); const tx = el("text", { class: "ax", x: W - R + 8, y: Yr(lv) + 4 }); tx.textContent = String(lv); svg.append(tx); }
      svg.append(el("path", { class: "rsil", d: path(rsi, Yr) })); }
    if (k === "macd") { const ext = Math.max(...[...md.m, ...md.s, ...md.g].map(Math.abs)) || 1, Ym = (x) => y0 + hh / 2 - (x / ext) * (hh / 2 - 2), bw = Math.max(1, ((W - R) / t.length) * 0.6);
      lab.textContent = `MACD 12 26 9 · ${fmt(md.m.at(-1), 3)}`;
      svg.append(el("line", { class: "grid", x1: 0, x2: W - R, y1: Ym(0), y2: Ym(0) }));
      md.g.forEach((x, i) => svg.append(el("rect", { class: `mh ${x >= 0 ? "up" : "dn"}`, x: X(t[i]) - bw / 2, y: Math.min(Ym(0), Ym(x)), width: bw, height: Math.abs(Ym(x) - Ym(0)) })));
      svg.append(el("path", { class: "mml", d: path(md.m, Ym) }), el("path", { class: "msl", d: path(md.s, Ym) })); }
    svg.append(lab);
    y0 += hh + G;
  }
  const cross = el("line", { class: "cross", y1: top, y2: H - B }), hline = el("line", { class: "cross", x1: 0, x2: W - R }), dot = el("circle", { class: "cdot", r: 4 }), bdot = el("circle", { class: "cdot b", r: 3.5 });
  const yp = el("rect", { class: "pill", x: W - R + 2, width: R - 4, height: 18, rx: 5 }), ypt = el("text", { class: "pillt", x: W - R + 8 });
  const xp = el("rect", { class: "pill", y: H - B + 3, width: 92, height: 18, rx: 5 }), xpt = el("text", { class: "pillt", y: H - B + 16, "text-anchor": "middle" });
  svg.append(cross, hline); if (!candle) svg.append(dot); if (bs) svg.append(bdot); svg.append(yp, ypt, xp, xpt);
  box.replaceChildren(svg);
  const tip = $("#dtip"), legend = $("#dlegend"), chg = ys.at(-1) - (rel ? 0 : base);
  legend.replaceChildren(...[h("span", {}, h("i", { style: `background:${col}` }), `${x0name(sym)}${candle ? ` · ${per === "week" ? "weekly " : per === "month" ? "monthly " : ""}candles` : ""}${logs ? " · log" : ""}`), ...mas.map(([, label], i) => h("span", {}, h("i.ma" + i), label)),
    bb ? h("span", {}, h("i.bbi"), "Bollinger 20, 2") : null, bs ? h("span", {}, h("i.vsi"), x0name(D.vs)) : null].filter(Boolean));
  const said = $("#dchg"), rs = $("#dchgsaid");
  if (said && r !== "1d") { said.className = `num ${tone(chg)}`; said.textContent = rel || rate10 ? `${rate10 && !rel ? `${chg >= 0 ? "+" : "−"}${fmt(Math.abs(chg) * 100, 0)}bp` : pct(chg)}` : `${signed(chg, q.cur, q.price < 1 ? 4 : 2)} (${pct((chg / base) * 100)})`; rs.textContent = RANGES.find((x) => x[0] === r)[2]; }
  const read = (px, py) => {
    let k = 0, best = Infinity; t.forEach((tt, i) => { const d = Math.abs(X(tt) - px); if (d < best) { best = d; k = i; } });
    const ck = cs ? cs[cOf[k]] : null, xx = ck ? ck.x : X(t[k]), yy = Y(ck ? ck.c : ys[k]); cross.setAttribute("x1", xx); cross.setAttribute("x2", xx); hline.setAttribute("y1", yy); hline.setAttribute("y2", yy); dot.setAttribute("cx", xx); dot.setAttribute("cy", yy); dot.style.fill = col;
    yp.setAttribute("y", yy - 9); ypt.setAttribute("y", yy + 4); ypt.textContent = say(ck ? ck.c : ys[k]);
    const px0 = Math.max(46, Math.min(W - R - 46, xx)); xp.setAttribute("x", px0 - 46); xpt.setAttribute("x", px0);
    if (bs) { bdot.setAttribute("cx", xx); bdot.setAttribute("cy", Y(bs[k])); }
    const d = new Date(t[k] * 1000), d0 = ck && per ? new Date(t[ck.i0] * 1000) : null, when = per === "week" ? `Week of ${d0.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: tz })}` : per === "month" ? d0.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: tz }) : r === "1d" ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz }) : r === "5d" ? d.toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: tz }) : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: tz });
    xpt.textContent = r === "1d" ? when : (d0 || d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit", timeZone: tz });
    tip.replaceChildren(...[h("b", { text: when }),
      ck ? h("span", { text: `O ${say(ck.o)}  H ${say(ck.h)}  L ${say(ck.l)}  C ${say(ck.c)}` }) : h("span", { text: rate10 ? `${fmt(vv[k], 3)}%` : priceSaid(q, v[k]) }),
      ck && per ? h("span", { class: tone(ck.c - ck.o), text: `${pct((ck.c / ck.o - 1) * 100)} in the ${per === "week" ? "week" : per === "month" ? "month" : "candle"}` }) : h("span", { class: tone(vv[k] - base), text: `${pct((vv[k] / base - 1) * 100)} ${r === "1d" ? "on yesterday" : "from the start"}` }),
      ...mas.map(([m], i) => (m[k] != null ? h("span.mut", { text: `${i ? "200" : "50"}-day ${say(m[k])}` }) : null)), bs ? h("span.mut", { text: `${x0name(D.vs)} ${pct(bs[k])}` }) : null,
      rsi && rsi[k] != null ? h("span.mut", { text: `RSI ${fmt(rsi[k], 1)}` }) : null, md ? h("span.mut", { text: `MACD ${fmt(md.m[k], 3)}` }) : null,
      ...[ck && per ? ck.v : vol?.[k]].filter(Boolean).map((x) => h("span.mut", { text: `vol ${x >= 1e6 ? fmt(x / 1e6, 1) + "m" : fmt(x / 1e3, 0) + "k"}` }))].filter(Boolean));
    box.classList.add("reading");
  };
  box.onpointermove = (e) => { const rr = box.getBoundingClientRect(); read(Math.max(0, Math.min(W - R, e.clientX - rr.left)), e.clientY - rr.top); };
  box.onpointerleave = () => { box.classList.remove("reading"); tip.replaceChildren(); };
  const ro = new ResizeObserver(() => { if (!box.isConnected) return ro.disconnect(); if (Math.abs((box.clientWidth || 0) - W) > 4 || Math.abs((box.clientHeight || 0) - H) > 4) { ro.disconnect(); drawChart(box, sym); } });
  ro.observe(box);
}

// ---- the World screen: the world's markets at once ----
function worldGrid() {
  // (asked for again at most every 30 seconds, whether or not each came back)
  const want = Date.now() - (D.wAt || 0) > 30e3 ? [...worldAll().map(([s]) => s), ...CCY.map(([, s]) => s).filter(Boolean)] : [];
  if (want.length) D.wAt = Date.now();
  const grid = h("div.wgrid", {},
    h("div.dpane.wcol", {}, h("div.dhead", {}, h("h2", { text: "Equity indices" }), h("small", { text: "WEI" })), ...WORLD.eq.map(([region, list]) => [h("h3.dsub", { text: region }), wTable(list)])),
    h("div.dpane.wcol", { id: "dfx" }, h("div.dhead", {}, h("h2", { text: "Currencies" }), h("small", { text: "FXC" })), wTable(WORLD.fx, { fx: true }), h("h3.dsub", { text: "Each against the others" }), fxMatrix(), h("h3.dsub", { text: "Crypto" }), wTable(WORLD.crypto)),
    h("div.dpane.wcol", {}, h("div.dhead", {}, h("h2", { text: "Commodities" })), wTable(WORLD.cmd), h("h3.dsub", { text: "US Treasury yields" }), wTable(WORLD.rates, { rate: true })));
  if (want.length) A.quotes(want.slice(0, 64)).then((r) => { Object.assign(S.q, r.quotes); Object.assign(S.fx, r.rates); if (D.screen === "world" && grid.isConnected) grid.replaceWith(worldGrid()); }, () => {});
  return grid;
}
// a market's row: its name, last, the day's change (in points, or basis points for a yield) and %, its day drawn, open or shut
function wTable(list, o = {}) {
  const now = Date.now() / 1000;
  return h("table.dt.wt", {}, h("thead", {}, h("tr", {}, ["", "Last", "Change", "%", "", ""].map((s, i) => h("th", { scope: "col", class: i === 0 ? "wn" : null }, s ? h("button", { type: "button", tabindex: "-1", text: s }) : null)))),
    h("tbody", {}, list.map(([sym, name]) => { const q = S.q[sym];
      if (!q) return h("tr", {}, h("td", {}, h("b", { text: name })), h("td.num.flat-t", { colspan: 5, text: "–" }));
      const last = o.rate ? `${fmt(yieldOf(q.price), 3)}%` : o.fx ? fmt(q.price, q.price >= 100 ? 2 : 4) : priceSaid(q), ch = q.chg ?? 0;
      const chs = o.rate ? `${ch >= 0 ? "+" : "−"}${fmt(Math.abs(yieldOf(q.price) - yieldOf(q.prev)) * 100, 1)}bp` : o.fx ? `${ch >= 0 ? "+" : "−"}${fmt(Math.abs(ch), q.price >= 100 ? 2 : 4)}` : `${ch >= 0 ? "+" : "−"}${fmt(Math.abs(ch), Math.abs(ch) >= 100 ? 1 : 2)}`;
      const open = q.open && now >= q.open.start && now < q.open.end;
      return h("tr", { "data-sym": sym, onclick: () => run("GP", sym), title: `${name}: open its chart` }, h("td.wn", {}, h("b", { text: name }), h("small", { text: plainSym(sym) })), h("td.num", {}, h("b", { "data-px": sym, text: last })),
        h("td", { class: `num ${tone(q.chgPct)}`, text: chs }), h("td", { class: `num ${tone(q.chgPct)}`, "data-pct": sym, text: pct(q.chgPct) }), h("td.sp", {}, spark(q.spark, 48, 18, q.prev)), h("td", {}, h("i", { class: `odot ${open ? "on" : ""}`, title: open ? "Open" : "Shut" })));
    })));
}
// how much of each currency one of each other buys, coloured by its day
function fxMatrix() {
  const gbp = (c, prev) => { const s = CCY.find(([k]) => k === c)[1]; if (!s) return 1; const q = S.q[s]; return q ? (prev ? q.prev : q.price) : null; };
  const said = (x) => (x >= 100 ? fmt(x, 2) : x >= 10 ? fmt(x, 3) : fmt(x, 4));
  return h("table.fxm", {}, h("thead", {}, h("tr", {}, h("th"), CCY.map(([c]) => h("th", { scope: "col", text: c })))),
    h("tbody", {}, CCY.map(([r]) => h("tr", {}, h("th", { scope: "row", text: r }), CCY.map(([cc]) => {
      if (r === cc) return h("td.self", { text: "—" });
      const a = gbp(r), b2 = gbp(cc), ap = gbp(r, true), bp = gbp(cc, true);
      if (a == null || b2 == null) return h("td", { text: "–" });
      const x = a / b2, xp = ap && bp ? ap / bp : x, ch = (x / xp - 1) * 100;
      return h("td", { class: `num ${Math.abs(ch) < 0.01 ? "" : ch > 0 ? "fup" : "fdn"}`, title: `1 ${r} = ${said(x)} ${cc} (${pct(ch)} today)`, text: said(x) });
    })))));
}

// ---- on the right: a heat map of your money ----
function heatPane() {
  const o = owned(), T = totals(), box = h("div.heat", { id: "dheat" });
  requestAnimationFrame(() => drawHeat(box, o, T));
  return h("div.dpane", {}, h("div.dhead", { title: "Each of yours, sized by what it's worth, coloured by how it's done today" }, h("h2", { text: "Heat map" }),
    h("span.hkey", { "aria-hidden": "true" }, h("small", { text: "−3%" }), h("i"), h("small", { text: "+3%" }))), box);
}
const GAP = 6;
function drawHeat(box, o, T) {
  const W = (box.clientWidth || 300) + GAP, H = (box.clientHeight || 190) + GAP;
  const items = o.map((x) => ({ x, v: valueOf(x) })).filter((i) => i.v > 0).sort((a, b) => b.v - a.v);
  box.replaceChildren(...squarify(items, -GAP / 2, -GAP / 2, W, H).map(({ it, x, y, w, h: hh }) => {
    const p = S.q[it.x.symbol].chgPct || 0, k = Math.min(1, Math.abs(p) / 3), mix = Math.round(14 + k * 72);
    // (a narrow one, its words smaller, so they still fit)
    return h("button.tile" + (w < 76 ? ".sm" : ""), { type: "button", title: `${it.x.name}: ${money(it.v, "GBP", 0)}, ${pct(p)} today`, onclick: () => choose(it.x.symbol),
      // (each set in from its neighbours by half the gap, all round)
      style: `left:${x + GAP / 2}px;top:${y + GAP / 2}px;width:${w - GAP}px;height:${hh - GAP}px;background-color:color-mix(in srgb, ${p >= 0 ? "var(--up)" : "var(--down)"} ${mix}%, var(--ctl))` },
      w > 40 && hh > 40 ? [h("b", { text: plainSym(it.x.symbol) }), h("span.num", { text: pct(p, 1) })] : null);
  }));
}
// a squarified tree map: each item a rectangle as near square as it can be, in rows along the shorter side
function squarify(items, x, y, w, hgt) {
  const out = []; let rest = [...items], sum = rest.reduce((a, i) => a + i.v, 0);
  while (rest.length && w > 0 && hgt > 0) {
    const across = w >= hgt, side = across ? hgt : w; let row = [], worst = Infinity;
    for (const it of rest) {
      const r = [...row, it], rs = r.reduce((a, i) => a + i.v, 0), thick = (rs / sum) * (across ? w : hgt);
      const wr = Math.max(...r.map((i) => { const l = (i.v / rs) * side; return Math.max(thick / l, l / thick); }));
      if (wr > worst) break;
      worst = wr; row = r;
    }
    const rs = row.reduce((a, i) => a + i.v, 0), thick = (rs / sum) * (across ? w : hgt); let off = 0;
    for (const it of row) { const l = (it.v / rs) * side; out.push(across ? { it, x, y: y + off, w: thick, h: l } : { it, x: x + off, y, w: l, h: thick }); off += l; }
    if (across) { x += thick; w -= thick; } else { y += thick; hgt -= thick; }
    sum -= rs; rest = rest.slice(row.length);
  }
  return out;
}

// ---- your portfolio's year, in risk: worked out from what you own now, as if held all year ----
function riskPane() {
  const body = h("div.risk", { id: "drisk" }, h("p.dempty", { text: "Working out your year…" }));
  requestAnimationFrame(() => drawRisk(body));
  return h("div.dpane", {}, h("div.dhead", { title: "Worked out from what you own now, as if you'd held it all year" }, h("h2", { text: "Risk" }), h("small", { text: "1 year" })), body);
}
async function drawRisk(body) {
  if (!D.risk || Date.now() - D.risk.at > 600e3) {
    try {
      const [s, b] = await Promise.all([rangeSeries("1y"), chartOf("^FTSE", "1y")]);
      if (!s) throw new Error("none");
      const rp = s.vals.slice(1).map((val, i) => val / s.vals[i] - 1), days = s.T.slice(1);
      const bm = new Map(b.t.map((t, i) => [dayKey(t), b.c[i]])), pairs = [];
      for (let i = 1; i < s.T.length; i++) { const k0 = dayKey(s.T[i - 1]), k1 = dayKey(s.T[i]); if (bm.has(k0) && bm.has(k1)) pairs.push([rp[i - 1], bm.get(k1) / bm.get(k0) - 1]); }
      const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1), sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
      let peak = s.vals[0], fall = 0, fallAt = null; for (let i = 0; i < s.vals.length; i++) { peak = Math.max(peak, s.vals[i]); const d = s.vals[i] / peak - 1; if (d < fall) { fall = d; fallAt = s.T[i]; } }
      const pm = mean(pairs.map((p) => p[0])), bmn = mean(pairs.map((p) => p[1]));
      const beta = pairs.length > 20 ? mean(pairs.map(([a, c]) => (a - pm) * (c - bmn))) / (sd(pairs.map((p) => p[1])) ** 2 || 1) : null;
      const bi = rp.indexOf(Math.max(...rp)), wi = rp.indexOf(Math.min(...rp));
      D.risk = { at: Date.now(), line: s.vals.filter((_, i) => i % 3 === 0 || i === s.vals.length - 1), vol: sd(rp) * Math.sqrt(252) * 100, fall: fall * 100, fallAt, beta, best: [rp[bi] * 100, days[bi]], worst: [rp[wi] * 100, days[wi]], yr: (s.vals.at(-1) / s.vals[0] - 1) * 100 };
    } catch (_) { if (body.isConnected) body.replaceChildren(h("p.dempty", { text: "Couldn't work out your year just now." })); return; }
  }
  if (!body.isConnected) return;
  const R = D.risk, day = (t) => new Date(t * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const cell = (label, v, sub, cls, tip) => h("div.rcell", { title: tip }, h("small", { text: label }), h("b", { class: `num ${cls || ""}` }, v), sub ? h("span", { text: sub }) : null);
  body.replaceChildren(
    h("div.ryear", {}, h("div", {}, h("span", { text: "Your year" }), h("b", { class: `num ${tone(R.yr)}`, text: pct(R.yr, 1) })), spark(R.line, 150, 34)),
    h("div.rgrid", {},
      cell("Volatility", `${fmt(R.vol, 1)}%`, R.vol < 12 ? "calm" : R.vol < 22 ? "like the market" : "lively", "", "How much it swings, over a year"),
      cell("Worst fall", pct(R.fall, 1), R.fallAt ? `to ${day(R.fallAt)}` : "", "down-t", "The most it fell from a high"),
      R.beta != null ? cell("vs FTSE 100", `${fmt(R.beta, 2)}×`, R.beta > 1.15 ? "moves more" : R.beta < 0.85 ? "moves less" : "moves with it", "", "How much it moves when the FTSE 100 does (its beta)") : null,
      cell("Best · worst day", [h("span.up-t", { text: pct(R.best[0], 1) }), " ", h("span.down-t", { text: pct(R.worst[0], 1) })], `${day(R.best[1])} · ${day(R.worst[1])}`)));
}

// ---- the news about what you hold ----
function newsPane() {
  const list = h("div.dnews", {}, h("p.dempty", { text: "Getting the news…" }));
  requestAnimationFrame(async () => {
    if (!D.news || Date.now() - D.news.at > 15 * 60e3) {
      try { const syms = [...S.list].sort((a, b) => (valueOf(b) ?? 0) - (valueOf(a) ?? 0)).slice(0, 10).map((x) => x.symbol); D.news = { at: Date.now(), list: syms.length ? (await A.news(syms)).news : [] }; }
      catch (_) { if (list.isConnected) list.replaceChildren(h("p.dempty", { text: "Couldn't get the news just now." })); return; }
    }
    if (!list.isConnected) return;
    list.replaceChildren(...D.news.list.slice(0, 12).map((n) => { const tag = n.tickers.find((t) => S.list.some((x) => x.symbol === t)) || n.for;
      return h("div.nrow", {}, h("a", { href: n.link, target: "_blank", rel: "noopener", text: n.title }),
        h("div.nm", {}, tag ? h("button.ntag", { type: "button", onclick: () => choose(tag), text: plainSym(tag) }) : null, h("span", { text: `${n.src} · ${ago(n.at)}` }))); }));
  });
  return h("div.dpane.grow", { id: "dnews" }, h("div.dhead", { title: "The latest about what you hold" }, h("h2", { text: "News" })), list);
}
// ---- the dividends coming up ----
function comingPane() {
  const ev = income().events.slice(0, 5);
  if (!ev.length) return null;
  return h("div.dpane", {}, h("div.dhead", {}, h("h2", { text: "Dividends" }), h("small", { text: "coming up" })), h("div.dcome", {}, ev.map((e) => h("button", { type: "button", onclick: () => choose(e.x.symbol) },
    h("span", { text: e.at.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) }), h("b", { text: e.x.name }), h("i.num", { text: `about ${money(e.v, "GBP", 0)}` })))));
}
// ---- along the bottom: the markets, open or shut; the keys ----
function statusBar() {
  const said = marketSaid();
  return h("div.dstat", {}, h("span", {}, h("i.live" + (said.open ? "" : ".shut")), said.text), h("span", { id: "dupd", text: `Prices at ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` }),
    h("span.keys", {}, ...[["/", "command"], ["↑↓", "holdings"], ["1–5", "range"], ["K", "candles"], ["R", "RSI"], ["M", "MACD"], ["W", "world"], ["?", "help"]].map(([k, s]) => h("span", {}, h("kbd", { text: k }), s))));
}

// ---- the keys, and prices as they change ----
const keys = {
  ready: false,
  on() {
    if (this.ready) return; this.ready = true;
    addEventListener("click", () => { if (D.menu) { D.menu = null; redrawInst(); } });
    addEventListener("keydown", (e) => {
      if (!document.body.classList.contains("desk-on") || document.body.classList.contains("sheet-up") || $(".dhelp")) return;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (!typing && e.key === "/")) { e.preventDefault(); $("#dcmd")?.focus(); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase(), port = D.screen === "port";
      if (e.key === "?") { help(); return; }
      if (k === "w") { if (port) { D.screen = "world"; redraw(); } return; }
      if (k === "p") { if (!port) { D.screen = "port"; redraw(); } return; }
      if (!port) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const rows = [...document.querySelectorAll(".port .dt tr[data-sym]")], i = rows.findIndex((r) => r.dataset.sym === D.sel), n = rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
        if (n) { e.preventDefault(); choose(n.dataset.sym); } return;
      }
      if (/^[1-5]$/.test(e.key)) { D.range = RANGES[Number(e.key) - 1][0]; redrawInst(); return; }
      const flip = { a: "ma", b: "bb", v: "vol", r: "rsi", m: "macd", l: "log" }[k];
      if (flip) { D[flip] = !D[flip]; D.view = "chart"; redrawInst(); return; }
      if (k === "k") { D.type = D.type === "candle" ? "line" : "candle"; D.view = "chart"; redrawInst(); return; }
      if (k === "c") { const i = VS.findIndex((x) => x[0] === D.vs); D.vs = i < 0 ? VS[0][0] : i === VS.length - 1 ? null : VS[i + 1][0]; redrawInst(); return; }
      if (e.key === "Enter" && D.sel) { openSheet(stockView, D.sel); }
    });
    addEventListener("mk:prices", () => {
      if (!document.body.classList.contains("desk-on")) return;
      const T = totals(), pv = $("#dpv"), pd = $("#dpd"), pp = $("#dpp"), up = $("#dupd");
      if (pv) pv.textContent = money(T.value);
      if (pd) { pd.textContent = signed(T.day); pd.className = `num ${tone(T.day)}`; pp.textContent = pct(T.dayPct); pp.className = `num ${tone(T.day)}`; }
      if (up) up.textContent = `Prices at ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
      const hb = $("#dheat"); if (hb) drawHeat(hb, owned(), T);
      if (D.screen === "world" && !$(".dcmdw:focus-within")) $(".wgrid")?.replaceWith(worldGrid());
    });
  },
};
