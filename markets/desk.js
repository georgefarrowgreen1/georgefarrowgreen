// Markets on a big screen (an iPad held across, a Mac): the desk. Everything at once, and more of it than a phone has
// room for, in panes side by side:
//   - along the top, a command line (/ or ⌘K: a name or symbol to open, "vs FTSE", "alert NVDA 5", "add Tesco") and the
//     markets in a strip;
//   - on the left, your portfolio: what it's worth, its day and since you bought, then every holding in a table you sort
//     by any column, and what you follow under it; ↑ and ↓ move through them;
//   - in the middle, the one chosen: a large chart with its prices and times along the edges, volume under it, its 50-
//     and 200-day averages, set against the FTSE 100 or the S&P 500 if asked, and read exactly under the pointer; its
//     figures in a grid; why it's moving;
//   - on the right, a heat map of your money (sized by value, coloured by the day), your portfolio's year in risk
//     (volatility, its worst fall, how it moves with the market, its best and worst days), the news about what you hold,
//     and the dividends coming up.
// Keys: / or ⌘K the command line, ↑ ↓ the holdings, 1–5 the chart's range, A averages, V volume, C against the market.
import { S, h, A, $, icon, fmt, money, signed, pct, tone, priceSaid, plainSym, nameOf, valueOf, dayOf, totals, owned, rate, divsOf, paidFor, income, kindOf, KIND_SAID,
  INDEX_NAMES, INDICES, RANGES, openSheet, pushSheet, stockView, searchView, editView, alertView, toast, ago, dayKey, rangeSeries, marketSaid, whyMoving, sendInChat, meFace, youMenu, daySeries } from "./app.js";

const D = { sel: null, range: "1y", sort: { k: "value", dir: -1 }, ma: true, vol: true, vs: null, news: null, risk: null };
const VS = [["^FTSE", "FTSE 100"], ["^GSPC", "S&P 500"]];
const NS = "http://www.w3.org/2000/svg";
const el = (n, a = {}) => { const e = document.createElementNS(NS, n); for (const [k, v] of Object.entries(a)) if (v != null) e.setAttribute(k, v); return e; };
const short = (n) => (n.length > 18 ? n.slice(0, 17).trimEnd() + "…" : n);
// a small line of values, w by h, coloured by whether it ended above where it started (or above base)
function spark(vals, w, hh, base = vals[0]) {
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

export function deskView() {
  const own = owned(), all = S.list;
  if (!D.sel || !all.some((x) => x.symbol === D.sel)) D.sel = ([...own].sort((a, b) => valueOf(b) - valueOf(a))[0] || all[0])?.symbol;
  const root = h("section.desk", {}, topBar(), h("div.dgrid", {}, portPane(), instPane(), h("div.dcol", {}, heatPane(), riskPane(), newsPane(), comingPane())), statusBar());
  keys.on();
  return root;
}

// ---- along the top: the command line, and the markets ----
function topBar() {
  const input = h("input", { id: "dcmd", type: "text", autocomplete: "off", spellcheck: "false", placeholder: "Open a name or symbol, or a command: vs FTSE · alert NVDA 5 · add Tesco", "aria-label": "Command" });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape" || e.key === "Enter") e.stopPropagation();
    if (e.key === "Escape") { input.value = ""; input.blur(); }
    if (e.key === "Enter") { const v = input.value.trim(); if (v) command(v).then((ok) => { if (ok) { input.value = ""; input.blur(); } }); }
  });
  const tape = h("div.tape", {}, INDICES.filter((s) => S.q[s]).map((s) => { const q = S.q[s];
    return h("button.tick", { type: "button", onclick: () => openSheet(stockView, s) }, h("span", { text: INDEX_NAMES[s] }), h("b.num", { "data-px": s, text: priceSaid(q) }), h("i", { class: `num ${tone(q.chgPct)}`, "data-pct": s, text: pct(q.chgPct) })); }));
  const me = h("button.dme", { type: "button", "aria-label": "You, your apps and settings", onclick: (e) => youMenu(e.currentTarget) }, meFace());
  return h("div.dtop", {}, me, h("b.dbrand", { text: "Markets" }), h("label.dcmd", {}, h("span.prompt", { text: "›" }), input, h("kbd", { text: "/" })), tape,
    h("button.dme.act", { type: "button", "aria-label": "Find and add", onclick: () => openSheet(searchView) }, icon("search", 17, 2.4)));
}
// what's typed on the command line, done; true once it's done
async function command(v) {
  const [w0, ...rest] = v.split(/\s+/), w = w0.toLowerCase(), arg = rest.join(" ");
  const range = RANGES.find(([r, label]) => label.toLowerCase() === (rest.at(-1) || "").toLowerCase());
  if (w === "help" || v === "?") { toast("Type a name or symbol to open it (add 1D–5Y for its range) · vs FTSE / vs S&P / vs off · alert NVDA 5 · add Tesco · news"); return true; }
  if (w === "news") { $("#dnews")?.scrollIntoView({ behavior: "smooth", block: "nearest" }); return true; }
  if (w === "add") { openSheet(searchView); setTimeout(() => { const q = $("#mk-q"); if (q) { q.value = arg; q.dispatchEvent(new Event("input")); } }, 450); return true; }
  if (w === "vs" || w === "compare") {
    const a = arg.toLowerCase(), m = VS.find(([s, n]) => n.toLowerCase().startsWith(a) || plainSym(s).toLowerCase() === a || (a === "s&p" && s === "^GSPC") || (a === "ftse" && s === "^FTSE"));
    D.vs = a === "off" || a === "" ? null : m ? m[0] : null;
    if (!m && a && a !== "off") { toast(`Against what? Try vs FTSE or vs S&P.`, true); return false; }
    redrawInst(); return true;
  }
  if (w === "alert") {
    const p = Number(rest.at(-1)), who = find(rest.slice(0, -1).join(" ") || plainSym(D.sel));
    if (!who) { toast("Alert which? Try alert NVDA 5.", true); return false; }
    if (!Number.isFinite(p) || p < 0.5 || p > 50) { pushSheet(alertView, who.symbol); return true; }
    try { const r = await A.setAlert(who.symbol, true, p); S.list = r.holdings; toast(`You'll hear when ${who.name} moves ${p}% in a day`); return true; } catch (e) { toast(e.message, true); return false; }
  }
  // a name or symbol: one of yours is chosen here; any other, found and opened
  const q = range ? v.slice(0, v.lastIndexOf(" ")).trim() : v, mine = find(q);
  if (range) D.range = range[0];
  if (mine) { choose(mine.symbol); return true; }
  try {
    const r = await A.search(q);
    const x = r.results[0];
    if (!x) { toast(`Nothing found for “${q}”`, true); return false; }
    openSheet(stockView, x.symbol, { name: x.name });
    return true;
  } catch (e) { toast(e.message, true); return false; }
}
const find = (q) => { const k = q.trim().toLowerCase(); if (!k) return null;
  return S.list.find((x) => plainSym(x.symbol).toLowerCase() === k || x.symbol.toLowerCase() === k) || S.list.find((x) => x.name.toLowerCase().startsWith(k)) || S.list.find((x) => x.name.toLowerCase().includes(k)); };

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

// ---- the one chosen: its chart, its figures, why it's moving ----
function redrawInst() { $(".inst")?.replaceWith(instPane()); }
function instPane() {
  const sym = D.sel, q = S.q[sym], x = S.list.find((y) => y.symbol === sym);
  if (!q) return h("div.dpane.inst", {}, h("p.dempty", { text: "Choose one on the left." }));
  const seg = h("div.dseg", { role: "group", "aria-label": "Range" }, RANGES.map(([r, label], i) => h("button", { type: "button", "aria-pressed": String(r === D.range), title: `${label} (${i + 1})`, onclick: () => { D.range = r; redrawInst(); }, text: label })));
  const tog = (on, label, key, fn, disabled) => h("button.dtog", { type: "button", "aria-pressed": String(!!on), disabled: disabled || null, title: key, onclick: fn }, label);
  const maOk = D.range === "1y" || D.range === "5y";
  const tools = h("div.dtools", {}, seg, h("span.dsp"),
    tog(D.ma && maOk, "Averages", "A", () => { D.ma = !D.ma; redrawInst(); }, !maOk), tog(D.vol, "Volume", "V", () => { D.vol = !D.vol; redrawInst(); }),
    ...VS.map(([s, n]) => tog(D.vs === s, `vs ${n}`, "C", () => { D.vs = D.vs === s ? null : s; redrawInst(); })));
  const box = h("div.dchart", { id: "dchart" }), tip = h("div.dtip.num", { id: "dtip" }), legend = h("div.dlegend", { id: "dlegend" });
  const acts = x ? [
    h("button.dbtn", { type: "button", onclick: () => pushSheet(alertView, sym) }, icon("bell", 14, 2.4), x.alert ? `±${fmt(x.alert, 0)}%` : "Alert"),
    h("button.dbtn", { type: "button", onclick: () => sendInChat(sym) }, icon("send", 14, 2.4), "Send"),
    h("button.dbtn", { type: "button", onclick: () => openSheet(editView, sym) }, icon("pen", 14, 2.4), "Edit")]
    : [h("button.dbtn.go", { type: "button", onclick: () => openSheet(editView, sym, { name: q.name }) }, icon("plus", 14, 2.6), "Add")];
  const why = h("p.dwhy", { id: "why" });
  const pane = h("div.dpane.inst", {},
    h("div.ihead", {}, h("div", {}, h("small", { text: [plainSym(sym), q.ex, KIND_SAID[kindOf(q)]].filter(Boolean).join(" · ") }), h("h2", { text: x?.name || q.name }),
      h("div.iprice", {}, h("b.num", { "data-px": sym, text: priceSaid(q) }), h("span", { class: `num ${tone(q.chgPct)}`, id: "dchg", text: `${q.chg != null ? signed(q.chg, q.cur, q.price < 1 ? 4 : 2) + " " : ""}(${pct(q.chgPct)})` }), h("span.muted", { id: "dchgsaid", text: "today" }))),
      h("div.iacts", {}, acts)),
    tools, legend, h("div.dchartw", {}, box, tip), figures(sym, x, q), why);
  requestAnimationFrame(() => { drawChart(box, sym); whyMoving(sym, why); });
  return pane;
}
function figures(sym, x, q) {
  const y = S.years[sym], cells = [];
  const cell = (label, v, sub, cls) => cells.push(h("div.fig", {}, h("small", { text: label }), h("b", { class: `num ${cls || ""}`, text: v }), sub ? h("span.num", { text: sub }) : null));
  if (q.dayLo != null && q.dayHi != null) cell("Day's range", `${priceSaid(q, q.dayLo)} – ${priceSaid(q, q.dayHi)}`, q.prev ? `closed ${priceSaid(q, q.prev)}` : "");
  const hi = q.hi52 ?? y?.hi52, lo = q.lo52 ?? y?.lo52;
  if (hi && lo) cell("52-week range", `${priceSaid(q, lo)} – ${priceSaid(q, hi)}`, `${Math.round(((q.price - lo) / (hi - lo || 1)) * 100)}% of the way up`);
  if (y?.yr != null) cell("1 year", pct(y.yr, 1), "on its price", tone(y.yr));
  if (y?.div12 > 0 && q.price) cell("Dividend yield", `${fmt((y.div12 / q.price) * 100, 1)}%`, `${priceSaid(q, y.div12)} a share a year`);
  if (x?.qty > 0 && valueOf(x) != null) {
    const T = totals(), b = backOf(x), nx = income().events.find((e) => e.x.symbol === sym);
    cell("Yours", money(valueOf(x)), `${fmt(x.qty, x.qty % 1 ? 2 : 0)} shares · ${fmt((valueOf(x) / T.value) * 100, 1)}% of your money`);
    cell("Today", signed(dayOf(x) || 0), pct(q.chgPct), tone(q.chgPct));
    if (b != null) cell("Since bought", pct(b, 1), divsOf(x) >= 0.5 ? `with ${money(divsOf(x), "GBP", 0)} of dividends` : `on ${priceSaid(q, x.cost)} a share`, tone(b));
    if (nx) cell("Next dividend", `about ${money(nx.v, "GBP", 0)}`, `around ${nx.at.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`);
  }
  return h("div.figs", {}, cells);
}
// nice round steps for an axis: about n of them between lo and hi
function ticks(lo, hi, n = 5) {
  // (the round step that gives nearest n of them)
  const span = hi - lo || Math.abs(hi) || 1, mag = 10 ** Math.floor(Math.log10(span / n)), step = [1, 2, 2.5, 5, 10].map((m) => m * mag).reduce((a, b) => (Math.abs(span / b - n) < Math.abs(span / a - n) ? b : a));
  const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}
const avg = (vals, n) => vals.map((_, i) => (i < n - 1 ? null : vals.slice(i - n + 1, i + 1).reduce((a, b) => a + b, 0) / n));
// The large chart: its prices (or, set against a market, both as % from where the range starts), volume under it, its
// averages, prices and times along the edges, and exactly what's under the pointer
async function drawChart(box, sym) {
  const r = D.range, q = S.q[sym];
  box.classList.add("loading");
  let c, b = null;
  try { [c, b] = await Promise.all([chartOf(sym, r), D.vs && D.vs !== sym ? chartOf(D.vs, r).catch(() => null) : null]); } catch (e) { box.classList.remove("loading"); box.replaceChildren(h("p.dempty", { text: "Couldn't get its chart just now." })); return; }
  if (!box.isConnected || D.sel !== sym || D.range !== r) return;
  box.classList.remove("loading");
  const t = [...c.t], v = [...c.c], vol = c.v ? [...c.v] : null;
  if (r === "1d" && q.price != null && q.time && q.time > t.at(-1)) { t.push(q.time); v.push(q.price); vol?.push(0); }
  if (t.length < 2) { box.replaceChildren(h("p.dempty", { text: "Not enough of its prices to draw yet." })); return; }
  // (against a market: its price at each moment, the last before it)
  let bv = null;
  if (b?.t?.length) { let j = 0; bv = t.map((tt) => { while (j < b.t.length - 1 && b.t[j + 1] <= tt) j++; return b.t[j] <= tt ? b.c[j] : null; }); const f = bv.find((x) => x != null); bv = bv.map((x) => (x == null ? f : x)); }
  const rel = !!bv, base = r === "1d" ? (c.prev ?? q.prev ?? v[0]) : v[0], ys = rel ? v.map((x) => (x / v[0] - 1) * 100) : v, bs = rel ? bv.map((x) => (x / bv[0] - 1) * 100) : null;
  const mas = !rel && D.ma && (r === "1y" || r === "5y") ? (r === "1y" ? [[avg(v, 50), "50-day average"]] : [[avg(v, 10), "50-day average"], [avg(v, 40), "200-day average"]]) : [];
  const W = box.clientWidth || 700, H = box.clientHeight || 380, R = 64, B = 24, VH = D.vol && vol?.some((x) => x > 0) ? 56 : 0, top = 14, ph = H - B - VH - top - (VH ? 8 : 0);
  const session = r === "1d" && q.open ? q.open : null, t0 = session ? session.start : t[0], t1 = session ? session.end : t.at(-1);
  const X = (tt) => ((tt - t0) / (t1 - t0 || 1)) * (W - R);
  const all = [...ys, ...(bs || []), ...mas.flatMap(([m]) => m.filter((x) => x != null)), ...(rel ? [0] : [base])], lo = Math.min(...all), hi = Math.max(...all), padv = (hi - lo || 1) * 0.08;
  const Y = (val) => top + ph * (1 - (val - (lo - padv)) / ((hi + padv) - (lo - padv)));
  const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${nameOf(sym)}, ${RANGES.find((x) => x[0] === r)[2]}` });
  // the price axis, on the right, with its lines across
  for (const tv of ticks(lo - padv, hi + padv, 5)) { const yy = Y(tv); if (yy < top - 2 || yy > top + ph + 2) continue;
    svg.append(el("line", { class: "grid", x1: 0, x2: W - R, y1: yy, y2: yy }));
    const tx = el("text", { class: "ax", x: W - R + 8, y: yy + 4 }); tx.textContent = rel ? pct(tv, Math.abs(tv) < 10 ? 1 : 0) : priceSaid(q, tv); svg.append(tx); }
  // the times, along the bottom
  const tz = q.tz || undefined, n = W < 640 ? 4 : 6;
  for (let i = 0; i <= n; i++) { const tt = t0 + ((t1 - t0) * i) / n, xx = X(tt), d = new Date(tt * 1000);
    const said = r === "1d" ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz }) : r === "5d" ? d.toLocaleDateString("en-GB", { weekday: "short", timeZone: tz }) : r === "5y" ? d.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: tz }) : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: tz });
    const tx = el("text", { class: "ax", x: Math.min(W - R - 4, Math.max(2, xx)), y: H - 6, "text-anchor": i === 0 ? "start" : i === n ? "end" : "middle" }); tx.textContent = said; svg.append(tx); }
  // where it started (or closed yesterday), dashed
  svg.append(el("line", { class: "basel", x1: 0, x2: W - R, y1: Y(rel ? 0 : base), y2: Y(rel ? 0 : base) }));
  // volume, under it
  if (VH) { const vmax = Math.max(...vol), bw = Math.max(1, ((W - R) / t.length) * 0.66);
    vol.forEach((vv, i) => { if (!vv) return; const hh = (vv / vmax) * VH; svg.append(el("rect", { class: `volb ${i && v[i] < v[i - 1] ? "dn" : "up"}`, x: X(t[i]) - bw / 2, y: H - B - hh, width: bw, height: hh })); }); }
  const path = (vals) => vals.map((val, i) => (val == null ? null : `${X(t[i]).toFixed(1)} ${Y(val).toFixed(1)}`)).filter(Boolean).map((p, i) => (i ? "L" : "M") + p).join(" ");
  const up = ys.at(-1) >= (rel ? 0 : base), col = up ? "var(--up)" : "var(--down)";
  if (!rel) { const d = path(ys), a = el("path", { class: "area", d: `${d} L${X(t.at(-1)).toFixed(1)} ${top + ph} L${X(t[0]).toFixed(1)} ${top + ph} Z` }); a.style.fill = up ? "var(--up-soft)" : "var(--down-soft)"; svg.append(a); }
  mas.forEach(([m], i) => svg.append(el("path", { class: `ma ma${i}`, d: path(m) })));
  if (bs) svg.append(el("path", { class: "vsl", d: path(bs) }));
  const pl = el("path", { class: "pl", d: path(ys) }); pl.style.stroke = col; svg.append(pl);
  // (the year's high and low, marked where they were)
  if (!rel && v.length > 10) {
    const hiI = v.indexOf(Math.max(...v)), loI = v.indexOf(Math.min(...v));
    for (const [i, up2, said] of [[hiI, true, "High"], [loI, false, "Low"]]) {
      const xx = X(t[i]), yy = Y(v[i]), right = xx > (W - R) * 0.75, tx = el("text", { class: "hl", x: xx + (right ? -6 : 6), y: yy + (up2 ? -7 : 14), "text-anchor": right ? "end" : "start" });
      tx.textContent = `${said} ${priceSaid(q, v[i])}`; svg.append(el("circle", { class: "hld", cx: xx, cy: yy, r: 2.5 }), tx);
    }
  }
  // (its price now, on the axis, in its colour)
  const tagY = Math.max(top + 8, Math.min(top + ph - 8, Y(ys.at(-1)))), tagT = rel ? pct(ys.at(-1)) : priceSaid(q, v.at(-1));
  const tag = el("rect", { class: "tag", x: W - R + 2, y: tagY - 9, width: R - 4, height: 18, rx: 5 }); tag.style.fill = col;
  const tagTx = el("text", { class: "tagt", x: W - R + 8, y: tagY + 4 }); tagTx.textContent = tagT;
  svg.append(el("line", { class: "tagl", x1: X(t.at(-1)), x2: W - R, y1: Y(ys.at(-1)), y2: Y(ys.at(-1)) }), tag, tagTx);
  // under the pointer: a line down, a dot on each, and what they are
  const cross = el("line", { class: "cross", y1: top, y2: H - B }), hline = el("line", { class: "cross", x1: 0, x2: W - R }), dot = el("circle", { class: "cdot", r: 4 }), bdot = el("circle", { class: "cdot b", r: 3.5 });
  const yp = el("rect", { class: "pill", x: W - R + 2, width: R - 4, height: 18, rx: 5 }), ypt = el("text", { class: "pillt", x: W - R + 8 });
  const xp = el("rect", { class: "pill", y: H - B + 3, width: 92, height: 18, rx: 5 }), xpt = el("text", { class: "pillt", y: H - B + 16, "text-anchor": "middle" });
  svg.append(cross, hline, dot); if (bs) svg.append(bdot); svg.append(yp, ypt, xp, xpt);
  box.replaceChildren(svg);
  const tip = $("#dtip"), legend = $("#dlegend"), chg = ys.at(-1) - (rel ? 0 : base);
  legend.replaceChildren(...[h("span", {}, h("i", { style: `background:${col}` }), x0name(sym)), ...mas.map(([, label], i) => h("span", {}, h("i.ma" + i), label)), bs ? h("span", {}, h("i.vsi"), VS.find((x) => x[0] === D.vs)[1]) : null].filter(Boolean));
  const said = $("#dchg"), rs = $("#dchgsaid");
  if (said && r !== "1d") { said.className = `num ${tone(chg)}`; said.textContent = rel ? pct(chg) : `${signed(chg, q.cur, q.price < 1 ? 4 : 2)} (${pct((chg / base) * 100)})`; rs.textContent = RANGES.find((x) => x[0] === r)[2]; }
  const read = (px) => {
    let k = 0, best = Infinity; t.forEach((tt, i) => { const d = Math.abs(X(tt) - px); if (d < best) { best = d; k = i; } });
    const xx = X(t[k]), yy = Y(ys[k]); cross.setAttribute("x1", xx); cross.setAttribute("x2", xx); hline.setAttribute("y1", yy); hline.setAttribute("y2", yy); dot.setAttribute("cx", xx); dot.setAttribute("cy", yy); dot.style.fill = col;
    yp.setAttribute("y", yy - 9); ypt.setAttribute("y", yy + 4); ypt.textContent = rel ? pct(ys[k]) : priceSaid(q, v[k]);
    const px0 = Math.max(46, Math.min(W - R - 46, xx)); xp.setAttribute("x", px0 - 46); xpt.setAttribute("x", px0);
    if (bs) { bdot.setAttribute("cx", xx); bdot.setAttribute("cy", Y(bs[k])); }
    const d = new Date(t[k] * 1000), when = r === "1d" ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz }) : r === "5d" ? d.toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: tz }) : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: tz });
    xpt.textContent = r === "1d" ? when : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit", timeZone: tz });
    tip.replaceChildren(...[h("b", { text: when }), h("span", { text: priceSaid(q, v[k]) }), h("span", { class: tone(v[k] - base), text: `${pct((v[k] / base - 1) * 100)} ${r === "1d" ? "on yesterday" : "from the start"}` }),
      ...mas.map(([m], i) => (m[k] != null ? h("span.mut", { text: `${i ? "200" : "50"}-day ${priceSaid(q, m[k])}` }) : null)), bs ? h("span.mut", { text: `${VS.find((x) => x[0] === D.vs)[1]} ${pct(bs[k])}` }) : null,
      vol && vol[k] ? h("span.mut", { text: `vol ${vol[k] >= 1e6 ? fmt(vol[k] / 1e6, 1) + "m" : fmt(vol[k] / 1e3, 0) + "k"}` }) : null].filter(Boolean));
    box.classList.add("reading");
  };
  box.onpointermove = (e) => { const rr = box.getBoundingClientRect(); read(Math.max(0, Math.min(W - R, e.clientX - rr.left))); };
  box.onpointerleave = () => { box.classList.remove("reading"); tip.replaceChildren(); };
  // (drawn again at a new width)
  const ro = new ResizeObserver(() => { if (!box.isConnected) return ro.disconnect(); if (Math.abs((box.clientWidth || 0) - W) > 4 || Math.abs((box.clientHeight || 0) - H) > 4) { ro.disconnect(); drawChart(box, sym); } });
  ro.observe(box);
}
const x0name = (sym) => (S.list.find((x) => x.symbol === sym)?.name || nameOf(sym));

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
    h("span.keys", {}, ...[["/", "command"], ["↑↓", "holdings"], ["1–5", "range"], ["A", "averages"], ["V", "volume"], ["C", "vs market"]].map(([k, s]) => h("span", {}, h("kbd", { text: k }), s))));
}

// ---- the keys, and prices as they change ----
const keys = {
  ready: false,
  on() {
    if (this.ready) return; this.ready = true;
    addEventListener("keydown", (e) => {
      if (!document.body.classList.contains("desk-on") || document.body.classList.contains("sheet-up")) return;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (!typing && e.key === "/")) { e.preventDefault(); $("#dcmd")?.focus(); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const rows = [...document.querySelectorAll(".dt tr[data-sym]")], i = rows.findIndex((r) => r.dataset.sym === D.sel), n = rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
        if (n) { e.preventDefault(); choose(n.dataset.sym); } return;
      }
      if (/^[1-5]$/.test(e.key)) { D.range = RANGES[Number(e.key) - 1][0]; redrawInst(); return; }
      if (e.key === "a" || e.key === "A") { D.ma = !D.ma; redrawInst(); return; }
      if (e.key === "v" || e.key === "V") { D.vol = !D.vol; redrawInst(); return; }
      if (e.key === "c" || e.key === "C") { const i = VS.findIndex((x) => x[0] === D.vs); D.vs = i < 0 ? VS[0][0] : i === VS.length - 1 ? null : VS[i + 1][0]; redrawInst(); return; }
      if (e.key === "Enter" && D.sel) { openSheet(stockView, D.sel); }
    });
    addEventListener("mk:prices", () => {
      if (!document.body.classList.contains("desk-on")) return;
      const T = totals(), pv = $("#dpv"), pd = $("#dpd"), pp = $("#dpp"), up = $("#dupd");
      if (pv) pv.textContent = money(T.value);
      if (pd) { pd.textContent = signed(T.day); pd.className = `num ${tone(T.day)}`; pp.textContent = pct(T.dayPct); pp.className = `num ${tone(T.day)}`; }
      if (up) up.textContent = `Prices at ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
      const hb = $("#dheat"); if (hb) drawHeat(hb, owned(), T);
    });
  },
};
