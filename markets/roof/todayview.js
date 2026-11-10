// Markets' Today section (One roof stage 2, spec §2.1, §4.2): your portfolio (what it's worth, its day in pounds and
// percent, the day drawn, 1D/1W/1M/1Y), the day in words, what's worth knowing, what's moving, what's coming and the
// markets; the portfolio's Send (S2-D6: percent only). Moved from markets/app.js (todayView :1260, daySaid :1303,
// portfolioBox :1319, rangeSeries' words :1388, portfolioChart :1396, itemRow :1409, figOf :1425, emptyView :1433)
// onto mkui.js's helpers; itemRow, figOf and emptyView are Holdings' too.
// view(el, ctx) → { draw(), patch(was), hide(), destroy() }: draw() draws it afresh from core.S; patch(was) takes new
// prices in where they show (app.js refresh's part of the page: the total counted up, the day, the words, the line).
// notIn() → what a section shows before your list is in (the framework's states, spec §2.1, §6): a skeleton while it's
// on its way, else why it couldn't come (offline: "needs a connection") with Try Again; null once it's in. Every
// section asks it first, so "Start with what you own" (emptyView) is only ever said to a list that's in and empty.
import * as core from "./core.js";
import { h, C, el as $el, M, go, toast, openStock, viz, keepFocus, afterDraw } from "./mkui.js";

const { S, INDICES, INDEX_NAMES, PRANGES, fmt, money, signed, pct, tone, priceSaid, plainSym, plural, valueOf, dayOf, divsOf, paidFor, totals, leftOutSaid, income, insights, daySeries, rangeSeries } = core;

function todayView() {
  const wait = notIn();
  if (wait) return wait;
  if (!S.list.length && !S.cash?.length) return emptyView();
  const T = totals(), parts = [];
  if (T.o.length || S.cash?.length) {
    const [a, b] = fmt(T.value).split(".");
    parts.push(h("div.hero", { "data-k": "portfolio" },
      h("div.mk-herohead", {}, h("span.eyebrow", { text: "Your portfolio" }), core.portfolioSend() ? sendBtn() : null),
      h("span.big.num", { "data-el": "pv" }, `£${a}`, h("span.p", { text: "." + b })),
      h("span.delta.num", {}, h("span", { "data-el": "pd", class: tone(T.day), text: signed(T.day) }), h("span", { "data-el": "pp", class: tone(T.day), text: pct(T.dayPct) }), h("span.muted", { "data-el": "ps", text: "today" })),
      leftOutSaid() ? h("span.leftout", { text: leftOutSaid() }) : null));
    parts.push(T.value > 0 || T.o.length ? portfolioBox() : h("p.hint.cash-chart-note", { text: "Add an amount to see your portfolio chart." }));
  } else {
    const up = S.list.filter((x) => (S.q[x.symbol]?.chgPct || 0) > 0).length;
    parts.push(h("div.hero", {}, h("span.eyebrow", { text: "Your list" }), h("span.big.small", {}, `${up} of ${S.list.length} up`), h("span.delta", {}, h("span.muted", { text: "today" }))));
  }
  parts.push(h("p.say", { "data-el": "say" }, ...daySaid(T)));
  const cards = insights();
  if (cards.length) {
    parts.push(h("h3.label", {}, "Worth knowing", h("span", { "data-el": "cardn", text: cards.length > 1 ? `1 of ${cards.length}` : "" })));
    const box = h("div.cards", {}, cards.map((c, i) => h("button.card.glass.press.rise", { type: "button", vars: { c: c.c, i: String(i) }, onclick: () => openInsight(c) },
      h("span.kick", { text: c.kick }), h("h4", { text: c.h }), h("p", { text: c.p }), viz(c.viz))));
    const dots = h("div.dots", { role: "group", "aria-label": "Cards" }, cards.map((_, i) => h("button", { type: "button", "aria-label": `Card ${i + 1} of ${cards.length}`,
      onclick: () => box.scrollTo({ left: i * (box.firstElementChild.offsetWidth + 12), behavior: C.still() ? "auto" : "smooth" }) }, h("i", { class: i ? null : "on" }))));
    box.addEventListener("scroll", () => { const w = box.firstElementChild.offsetWidth + 12, i = Math.round(box.scrollLeft / w); [...dots.children].forEach((d, k) => d.firstChild.classList.toggle("on", k === i)); const n = $el("cardn"); if (n) n.textContent = `${i + 1} of ${cards.length}`; }, { passive: true });
    parts.push(box, cards.length > 1 ? dots : null);
  }
  const movers = [...S.list].filter((x) => S.q[x.symbol]).sort((a, b) => Math.abs(S.q[b.symbol].chgPct ?? 0) - Math.abs(S.q[a.symbol].chgPct ?? 0)).slice(0, 4);
  parts.push(h("h3.label", {}, "Moving today", S.list.length > 4 ? h("button", { type: "button", onclick: () => go("holdings"), text: "See all" }) : null));
  parts.push(h("div.list", { "data-el": "movers" }, movers.map((x, i) => itemRow(x, i, "day"))));
  // (what's coming up: the dividends expected in the next two months)
  const soon = T.o.length ? income().events.filter((e) => e.at - Date.now() < 62 * 864e5).slice(0, 3) : [];
  if (soon.length) {
    parts.push(h("h3.label", {}, "Coming up", h("button", { type: "button", onclick: () => M.open.income(), text: "Income" })));
    parts.push(h("div.list", {}, soon.map((e, i) => { const d = Math.max(1, Math.round((e.at - Date.now()) / 864e5));
      return h("button.item.two.rise", { type: "button", vars: { i: String(i) }, onclick: () => openStock(e.x.symbol) },
        h("span", {}, h("b", { text: e.x.name }), h("small", { text: `Dividend, around ${e.at.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` })),
        h("span.r", {}, h("b.num", { text: `about ${money(e.v, "GBP", e.v >= 100 ? 0 : 2)}` }), h("small", { text: d < 14 ? plural(d, "day") : `${Math.round(d / 7)} weeks` }))); })));
  }
  parts.push(h("h3.label", {}, "Markets"));
  parts.push(h("div.markets", {}, INDICES.filter((s) => S.q[s]).map((s, i) => { const q = S.q[s];
    return h("button.mk.rise.press", { type: "button", vars: { i: String(i + 4) }, onclick: () => openStock(s) }, h("small", { text: INDEX_NAMES[s] }), h("b.num", { "data-px": s, text: priceSaid(q) }), h("span", { class: `num ${tone(q.chgPct)}`, "data-pct": s, text: pct(q.chgPct) })); })));
  return parts;
}
function daySaid(T) {
  if (!T.o.length && S.cash?.length) return [`Cash interest: about ${money(T.interest)} a year at your current rates.`];
  const o = T.o;
  if (o.length >= 2) {
    const by = [...o].sort((a, b) => (dayOf(b) || 0) - (dayOf(a) || 0)), top = by[0], low = by.at(-1), tg = dayOf(top) || 0, lg = dayOf(low) || 0;
    if (Math.abs(T.day) < 0.01) return ["No change today yet: your holdings are as they closed."];
    const out = [];
    if (tg > 0) out.push(h("b", { text: top.name }), ` did most of the work, adding ${money(tg)}.`);
    if (lg < 0) out.push(out.length ? " " : "", h("b", { text: low.name }), ` ${out.length ? "gave back" : "took away"} ${money(-lg)}.`);
    return out;
  }
  if (o.length === 1) { const q = S.q[o[0].symbol]; return [h("b", { text: o[0].name }), ` is ${q.chgPct >= 0 ? "up" : "down"} ${fmt(Math.abs(q.chgPct))}% today.`]; }
  const big = [...S.list].filter((x) => S.q[x.symbol]?.chgPct != null).sort((a, b) => Math.abs(S.q[b.symbol].chgPct) - Math.abs(S.q[a.symbol].chgPct))[0];
  return big ? ["Biggest mover: ", h("b", { text: big.name }), `, ${pct(S.q[big.symbol].chgPct)}. Add what you own to see your portfolio.`] : [];
}
// Your portfolio's chart, in a box you can read along, with its ranges under it: the day's from its prices through the
// day; a week's, a month's and a year's from each holding's chart, what you own now at today's exchange rates
function portfolioBox() {
  const svg = portfolioChart(), chart = svg.portfolio, box = h("div.pbox", { "data-el": "pbox" }, svg);
  // (the range chosen kept when the page is drawn again: the day's drawn first, then reshaped to it)
  const kept = PRANGES.some(([r]) => r === S.prange) ? S.prange : "1d";
  const seg = h("div.seg.pseg.range-controls", { role: "group", "aria-label": "Your portfolio over" }, PRANGES.map(([r, label]) => h("button", { type: "button", "aria-pressed": String(r === kept), "data-r": r, text: ({ "1d": "Day", "5d": "Week", "1mo": "Month", "1y": "Year", "5y": "5yr" })[r] || label })));
  S.prange = "1d";
  if (kept !== "1d") requestAnimationFrame(() => { if (!seg.isConnected) return; const b = seg.querySelector(`[data-r="${kept}"]`); if (b) show(kept); });
  // (the range drawn: where another can't be, it stays, pressed again, and today's goes on being kept fresh: refresh)
  let seq = 0, drawn = "1d";
  const press = (r) => { const b = seg.querySelector(`[data-r="${r}"]`); if (!b) return; seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); };
  const show = async (r) => {
    const n = ++seq;
    S.prange = r;
    box.classList.add("loading");
    const s = r === "1d" ? daySeries() : await rangeSeries(r);
    if (n !== seq || !box.isConnected) return;
    box.classList.remove("loading");
    if (!s) { S.prange = drawn; press(drawn); toast("Couldn't draw that just now. Try again in a moment.", true); return; }
    drawn = r;
    const t0 = s.T[0], t1 = s.T.at(-1), { pts, baseY } = C.place(s.vals, 390, 150, { pad: 14, xs: s.T.map((t) => (t - t0) / (t1 - t0 || 1)), base: s.base });
    const up = s.vals.at(-1) >= s.base, line = svg.querySelector("path[data-draw]"), fill = svg.querySelectorAll("path")[0];
    svg.querySelectorAll("stop").forEach((x) => x.setAttribute("stop-color", up ? "#5fe0a6" : "#ff8a80"));
    line.setAttribute("stroke", up ? "var(--up)" : "var(--down)");
    const base = svg.querySelector("line.base");
    base.setAttribute("y1", baseY); base.setAttribute("y2", baseY); base.setAttribute("visibility", "visible");
    const from = chart.pts, version = ++chart.seq;
    const k = Math.max(pts.length, from?.length || 0), rs = (p) => C.resample(p.map((x) => x[0]), k).map((x, i) => [x, C.resample(p.map((y) => y[1]), k)[i]]);
    const paint = (p) => { if (version === chart.seq && box.isConnected) { line.setAttribute("d", C.smooth(p)); fill.setAttribute("d", C.area(p, 150)); } };
    // Commit the selected series together; a failed next request must not leave
    // its labels or scrubber pointing at the previous series mid-animation.
    chart.pts = pts; chart.raw = { pts, s, r };
    // (and what's said over it: the change over the range, and who did it)
    const ch = s.vals.at(-1) - s.base, chp = s.base ? (ch / s.base) * 100 : 0, pd = $el("pd"), pp = $el("pp"), ps = $el("ps"), say = $el("say");
    if (pd) { pd.textContent = signed(ch); pd.className = tone(ch); pp.textContent = pct(chp); pp.className = tone(ch); ps.textContent = PRANGES.find((x) => x[0] === r)[2]; }
    if (say) say.replaceChildren(...(r === "1d" ? daySaid(totals()) : rangeSaid(s, r)));
    if (from?.length) await C.tween(rs(from), rs(pts), 700, paint); else paint(pts);
  };
  C.scrubber(box, (x, w) => {
    const raw = chart.raw;
    if (!raw?.pts?.length || !raw.s) return null;
    const xv = (x / w) * 390;
    let k = 0, best = Infinity;
    raw.pts.forEach((p, i) => { const d = Math.abs(p[0] - xv); if (d < best) { best = d; k = i; } });
    const t = raw.s.T[k] * 1000, r = raw.r;
    const when = r === "1d" ? new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : r === "5d" ? new Date(t).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" }) : new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    return { x: (raw.pts[k][0] / 390) * w, y: raw.pts[k][1], label: `${money(raw.s.vals[k], "GBP", 0)} · ${when}` };
  });
  seg.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-r]");
    if (!b || b.getAttribute("aria-pressed") === "true") return;
    press(b.dataset.r);
    show(b.dataset.r);
  });
  return [box, seg, S.cash?.length ? h("p.hint.cash-chart-note", { text: "Cash uses your current balance throughout this chart." }) : null];
}
function rangeSaid(s, r) {
  const by = [...s.by].sort((a, b) => b.v - a.v), top = by[0], low = by.at(-1), out = [];
  const over = { "5d": "the week", "1mo": "the month", "1y": "the year" }[r];
  if (top?.v > 0) out.push(`Over ${over}, `, h("b", { text: top.x.name }), ` did most of the work, adding ${money(top.v, "GBP", 0)}.`);
  if (low && low !== top && low.v < 0) out.push(out.length ? " " : `Over ${over}, `, h("b", { text: low.x.name }), ` ${out.length ? "gave back" : "took away"} ${money(-low.v, "GBP", 0)}.`);
  out.push(h("small", { text: " As if you'd held what you own now all along." }));
  return out;
}
function portfolioChart() {
  const s = daySeries(), svg = C.el("svg", { class: "pchart", viewBox: "0 0 390 150", preserveAspectRatio: "none", role: "img", "aria-label": "Your portfolio today", "data-el": "pchart" });
  // Prices may arrive without an intraday series. Keep an empty drawing ready
  // for history or a later quote, and keep its samples with this SVG instance.
  const up = !s || s.vals.at(-1) >= s.base, col = up ? "var(--up)" : "var(--down)", t0 = s?.T[0], t1 = s?.T.at(-1);
  const { pts, baseY } = s ? C.place(s.vals, 390, 150, { pad: 14, xs: s.T.map((t) => (t - t0) / (t1 - t0 || 1)), base: s.base }) : { pts: [], baseY: 150 };
  svg.innerHTML = `<defs><linearGradient id="mk-pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${up ? "#5fe0a6" : "#ff8a80"}" stop-opacity=".22"/><stop offset="1" stop-color="${up ? "#5fe0a6" : "#ff8a80"}" stop-opacity="0"/></linearGradient></defs>`;
  svg.append(C.el("line", { class: "base", x1: 0, x2: 390, y1: baseY, y2: baseY, visibility: s ? "visible" : "hidden", "vector-effect": "non-scaling-stroke" }));
  const fill = C.el("path", { d: C.area(pts, 150), fill: "url(#mk-pg)", class: "pfill" }), line = C.el("path", { d: C.smooth(pts), fill: "none", stroke: col, "stroke-width": 2, "stroke-linecap": "round", "vector-effect": "non-scaling-stroke", "data-draw": "0" });
  svg.append(fill, line);
  requestAnimationFrame(() => fill.classList.add("on"));
  svg.portfolio = { pts, raw: s ? { pts, s, r: "1d" } : null, seq: 0 };
  return svg;
}
function itemRow(x, i, mode, open = (s) => openStock(s)) {
  const q = S.q[x.symbol];
  // (one with no price, still yours to open, move, change or remove: one that's stopped trading, as when it's been taken over)
  if (!q) return h("button.item.rise", { type: "button", vars: { i: String(i) }, "data-k": "holding", "data-sym": x.symbol, onclick: () => open(x.symbol) },
    h("span", {}, h("b", { text: x.name }), h("small", { text: "Price not available just now" })));
  const own = x.qty > 0, sp = C.el("svg", { viewBox: "0 0 64 26", "aria-hidden": "true" });
  sp.append(C.el("path", { d: C.spark(q.spark, 64, 26, q.prev), fill: "none", stroke: (q.chgPct || 0) >= 0 ? "var(--up)" : "var(--down)", "stroke-width": 1.6, "stroke-linecap": "round", "data-draw": String(0.15 + i * 0.05) }));
  // (yours, but not in pounds yet, its currency's rate not in: nothing said as £0.00, and it's said as left out (figOf))
  const out = own && valueOf(x) == null;
  const right = mode === "value" && own ? [h("b.num", { "data-val": x.symbol, text: out ? "–" : money(valueOf(x)) })] : own ? [h("b.num", { "data-dg": x.symbol, text: out ? "–" : signed(dayOf(x)) })] : [h("b.num", { "data-px": x.symbol, text: priceSaid(q) })];
  return h("button.item.rise", { type: "button", vars: { i: String(i) }, "data-k": "holding", "data-sym": x.symbol, onclick: () => open(x.symbol) },
    h("span", {}, h("b", { text: x.name }), h("small", {}, mode === "value" ? (own ? `${fmt(x.qty, x.qty % 1 ? 2 : 0)} ${x.qty === 1 ? "share" : "shares"} · ` : "") : "",
      mode === "day" && !own ? "Following" : mode === "value" && !own ? [plainSym(x.symbol), q.ex].filter(Boolean).join(" · ") : h("span.num", { "data-px": x.symbol, text: priceSaid(q) }))),
    sp, h("span.r", {}, ...right, mode === "value" && own ? figOf(x) : h("small", { class: `num ${tone(q.chgPct)}`, "data-pct": x.symbol, text: pct(q.chgPct) })));
}
// under a holding's worth: today's change, or (switched) how it's done since you bought, with its dividends
function figOf(x) {
  const q = S.q[x.symbol];
  if (valueOf(x) == null) return h("small.flat-t", { text: "Not in total" });
  if (S.fig !== "back") return h("small", { class: `num ${tone(q.chgPct)}`, "data-pct": x.symbol, text: pct(q.chgPct) });
  if (x.cost == null || !x.cost) return h("small", { class: "num flat-t", text: "–" });
  const paid = paidFor(x), g = valueOf(x) - paid + (divsOf(x) || 0);
  return h("small", { class: `num ${tone(g)}`, text: pct((g / paid) * 100, 1) });
}
function notIn() {
  if (S.me) return null;
  const ui = M.fw.ui;
  if (!S.err || S.loading) return [h("div.mk-wait", { "data-k": "loading" }, ui.skeleton("hero"), ui.skeleton("rows", 4))];
  const again = [{ label: "Try Again", act: "retry", primary: true, run: () => core.retry() }];
  return [ui.error(S.err.offline || globalThis.navigator?.onLine === false
    ? { title: "Markets needs a connection", body: "Your list shows here once you’re back online.", acts: again }
    : { title: "Markets didn’t open", body: S.err.words || "Couldn’t get your list just now.", acts: again })];
}
function emptyView() {
  const picks = [["RR.L", "Rolls-Royce"], ["AAPL", "Apple"], ["VUSA.L", "Vanguard S&P 500"], ["SMT.L", "Scottish Mortgage"], ["NVDA", "Nvidia"], ["TSCO.L", "Tesco"], ["BTC-USD", "Bitcoin"]];
  return [h("div.empty", {}, h("h2.rise", { text: "Start with what you own" }),
    h("p.rise", { vars: { i: "1" }, text: "Add your shares, funds and investment trusts, and Markets tells you each day what they're worth, what moved them and what's worth knowing. Or just follow a few." }),
    h("div.rise", { vars: { i: "2" } }, h("button.btn.go.press", { type: "button", onclick: () => M.open.addStock() }, "Add a Stock"), h("button.btn.press", { type: "button", onclick: () => M.open.cash() }, "Add cash")),
    h("div.chips.rise", { vars: { i: "3" } }, picks.map(([s, n]) => h("button.chip.glass.press", { type: "button", onclick: () => openStock(s, { name: n }), text: n })))),
  h("h3.label", {}, "Markets"),
  h("div.markets", {}, INDICES.filter((s) => S.q[s]).map((s, i) => { const q = S.q[s];
    return h("button.mk.rise.press", { type: "button", vars: { i: String(i + 4) }, onclick: () => openStock(s) }, h("small", { text: INDEX_NAMES[s] }), h("b.num", { "data-px": s, text: priceSaid(q) }), h("span", { class: `num ${tone(q.chgPct)}`, "data-pct": s, text: pct(q.chgPct) })); }))];
}

// (an insight's tap, as core.insights names it)
function openInsight(c) {
  if (c.open === "income") return M.open.income();
  if (c.open === "isa") return M.open.isa();
  if (c.open === "back") { S.fig = "back"; return go("holdings"); }
  if (c.sym) openStock(c.sym);
}
// the portfolio's Send: its day in percent, never an amount (core.portfolioSend)
const sendBtn = () => M.fw.ui.btn("Send", { icon: "send", act: "send", small: true, label: "Send your portfolio’s day to a friend", run: () => { const s = core.portfolioSend(); if (s) M.fw.send(s); else toast("Nothing you own has traded today yet.", true); } });

export function view(el, ctx) {
  const sec = el;
  let zoomed = false;
  return {
    draw(animate = true) {
      keepFocus(() => sec.replaceChildren(h("div.mk-view", {}, todayView())));
      afterDraw(sec, animate);
      const hero = sec.querySelector("[data-k=portfolio]");
      if (hero && !zoomed) { zoomed = true; ctx.fw.zoomTarget(hero); }
    },
    // new prices: the total counted from where it was, the day, the words and the day's line reshaped (app.js 2920-2935)
    patch(was) {
      const T = totals(), wasT = was ? totalsWith(was) : null, pv = $el("pv");
      if (!pv || !wasT) return;
      if (Math.abs(T.value - wasT.value) > 0.004) C.count(wasT.value, T.value, 700, (v) => { const [a, b] = fmt(v).split("."); pv.replaceChildren(`£${a}`, h("span.p", { text: "." + b })); });
      const pd = S.prange === "1d" && $el("pd"), pp = $el("pp"), ps = $el("ps");
      if (pd) { pd.textContent = signed(T.day); pd.className = tone(T.day); pp.textContent = pct(T.dayPct); pp.className = tone(T.day); if (ps) ps.textContent = "today"; }
      const say = S.prange === "1d" && $el("say"); if (say) say.replaceChildren(...daySaid(T));
      const svg = S.prange === "1d" && $el("pchart"), line = svg?.querySelector("path[data-draw]"), fill = svg?.querySelectorAll("path")[0], s = daySeries();
      if (line && s) {
        const chart = svg.portfolio, seq = ++chart.seq;
        const up = s.vals.at(-1) >= s.base;
        line.setAttribute("stroke", up ? "var(--up)" : "var(--down)");
        svg.querySelectorAll("stop").forEach((x) => x.setAttribute("stop-color", up ? "#5fe0a6" : "#ff8a80"));
        const t0 = s.T[0], t1 = s.T.at(-1), { pts, baseY } = C.place(s.vals, 390, 150, { pad: 14, xs: s.T.map((t) => (t - t0) / (t1 - t0 || 1)), base: s.base });
        const base = svg.querySelector("line.base"); base.setAttribute("y1", baseY); base.setAttribute("y2", baseY); base.setAttribute("visibility", "visible");
        const n = Math.max(pts.length, chart.pts.length), rs = (p) => C.resample(p.map((x) => x[0]), n).map((x, i) => [x, C.resample(p.map((y) => y[1]), n)[i]]);
        const paint = (p) => { if (seq === chart.seq && svg.isConnected && S.prange === "1d") { line.setAttribute("d", C.smooth(p)); fill?.setAttribute("d", C.area(p, 150)); } };
        if (chart.pts.length) C.tween(rs(chart.pts), rs(pts), 800, paint); else paint(pts);
        chart.pts = pts; chart.raw = { pts, s, r: "1d" };
      }
    },
    hide() {},
    destroy() { sec.replaceChildren(); },
  };
}
// (the total as it was, with the quotes before the new ones)
function totalsWith(q) { const now = S.q; S.q = q; try { return totals(); } finally { S.q = now; } }

export { todayView, daySaid, portfolioBox, portfolioChart, rangeSaid, itemRow, figOf, emptyView, notIn };
