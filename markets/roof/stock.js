// A stock's sheet (One roof stage 2, spec §2.1, §4.2, S2-D6): its price, a chart you read with your finger across five
// ranges, yours (what it's worth, its day, since you bought), why it's moving and its news, its facts and What If, your
// buys and sales, Alert Me (a move in a day worth hearing about), Send (its day in percent: name, sym, pct and day, never
// a price or anything you hold) and Remove. Moved from markets/app.js (stockView :2220, yoursPart :2260, alertView :2287,
// facts :2300, drawBuys :2316, buyView :2348, whyMoving :2392, stockChart :2416, removeBtn :2657, removeHolding :2667,
// sendInChat :2720 at the hub). Loaded through fw.lazy on a stock's first open (connector.lazy).
// openStock(ctx, sym, o) → the stock sheet (sym checked against Markets' own rule first).
import * as core from "./core.js";
import { h, C, el, M, toast, render, openSheet, pushSheet, backSheet, closeSheet, drawSheet, closeBtn, backBtn, icon, range52, readsIn, Sheet, topView, topArg } from "./mkui.js";
import { whatIf } from "./money.js";

const { S, A, INDEX_NAMES, MARKET_OF, ACCOUNT_NAME, RANGES, SYM, fmt, money, signed, pct, tone, isIndex, kindOf, KIND_SAID, priceSaid, chgSaid, priceIn, penceMeant, nameOf, plainSym, ago, plural,
  rate, valueOf, dayOf, divsOf, paidFor, income, aroundDay, loadPaid, refresh } = core;
const SYMBOL = /^[A-Z0-9^][A-Z0-9.=^-]{0,19}$/;

// A stock's page
function stockView(sym, o = {}) {
  const held = S.list.find((x) => x.symbol === sym), q = S.q[sym];
  if (!q) {
    const head = [h("div.shead", {}, backBtn(), h("small", { text: plainSym(sym) }), closeBtn()), h("div.sname", { text: o.name || held?.name || sym })];
    // (asked for once: where there's no price for it, that's said, with a way to ask again)
    // (and one of yours kept yours to change or take off: one that's stopped trading never has a price again)
    if (stockView.failed.has(sym)) return [...head, h("p.why", { text: "Couldn't get its price just now." }, h("small", { text: "The markets' data may be busy, or it may not be traded any more." })),
      h("div.btns", {}, h("button.btn.press.wide", { type: "button", onclick: () => { stockView.failed.delete(sym); drawSheet(); } }, "Try Again")),
      held ? h("div.links", {}, h("button", { type: "button", onclick: () => pushSheet("holding", sym), text: held.qty > 0 ? "Edit Holding" : "Add What You Own" }), removeBtn(sym, held)) : null];
    const here = () => Sheet.stack.at(-1)?.[1]?.[0] === sym;
    A.quotes([sym]).then((r) => { Object.assign(S.q, r.quotes); Object.assign(S.fx, r.rates); if (!r.quotes[sym]) stockView.failed.add(sym); if (here()) drawSheet(); },
      () => { stockView.failed.add(sym); if (here()) drawSheet(); });
    return [...head, h("div.sprice", { style: "opacity:.3", text: "–" })];
  }
  const name = held?.name || INDEX_NAMES[sym] || o.name || q.name;
  const box = h("div.chartbox", { "data-el": "cb" });
  const seg = h("div.seg", { role: "group", "aria-label": "Chart range" }, h("span.sl"), RANGES.map(([r, label], i) => h("button", { type: "button", "aria-pressed": String(i === 0), "data-r": r, text: label })));
  const why = h("p.why", { "data-el": "why" }, h("span", { style: "opacity:.35", text: "Finding out why…" }));
  const parts = [
    h("div.shead", {}, backBtn(), h("small", { text: [plainSym(sym), q.ex, ["trust", "fund"].includes(kindOf(q)) ? KIND_SAID[kindOf(q)] : null].filter(Boolean).join(" · ") }), closeBtn()),
    h("div.sname", { text: name }),
    h("div.sprice.num", { "data-px": sym, text: priceSaid(q) }),
    h("div.sdelta.num", {}, h("span", { class: tone(q.chgPct), "data-pct": sym, "data-el": "rpct", text: q.chg != null && !isIndex(q) ? `${chgSaid(q)} (${pct(q.chgPct)})` : pct(q.chgPct) }), h("span", { style: "color:var(--text-3)", "data-el": "rsaid", text: "today" })),
    held?.qty > 0 && valueOf(held) != null ? yoursPart(sym, held, q) : null,
    box, seg, why, h("div", { "data-el": "snews" }), facts(sym, held, q),
    held ? h("div", { "data-el": "buys" }) : null,
  ];
  // what can be done with it
  const tool = (sel, ic, label, on, attrs = {}) => h(`button.tool.press${sel}`, { type: "button", onclick: on, ...attrs }, icon(ic, 20, 2), h("span", { text: label }));
  if (held) parts.push(h("div.links", {}, removeBtn(sym, held)),
    h("div.sbar", {},
      tool(held.alert ? ".on" : "", "bell", held.alert ? `Alert On · ±${fmt(held.alert, 0)}%` : "Alert Me", () => pushSheet(alertView, sym), { "data-el": "alert" }),
      tool("", "send", "Send in Chat", () => sendInChat(sym), { "data-act": "send", "aria-label": `Send ${name}’s day to a friend` }),
      tool("", "pen", held.qty > 0 ? "Edit Holding" : "Add What You Own", () => pushSheet("holding", sym))));
  else parts.push(h("div.sbar.two", {}, h("button.btn.go.press", { type: "button", onclick: () => pushSheet("holding", sym, { name }) }, "Add to Your List"), tool("", "send", "Send in Chat", () => sendInChat(sym, name), { "data-act": "send", "aria-label": `Send ${name}’s day to a friend` })));
  // (next frame: not if the sheet's gone by then, closed or Markets let go)
  requestAnimationFrame(() => { if (!box.isConnected || !S.q[sym]) return; stockChart(sym, box, seg); whyMoving(sym, why); if (held) drawBuys(sym); });
  return parts;
}
stockView.failed = new Set();
// what you have of it, up top: what it's worth, its day, and since you bought (with its dividends)
function yoursPart(sym, held, q) {
  const v = valueOf(held), d = dayOf(held) || 0, dv = divsOf(held) || 0, paid = held.cost ? paidFor(held) : null, g = paid != null ? v - paid + dv : null;
  const stat = (label, b, sub) => h("div.ystat", {}, h("small", { text: label }), b, sub);
  return h("div", { "data-el": "yours" }, h("div.ystats", {},
      stat("Yours", h("b.num", { "data-val": sym, text: money(v, "GBP", v >= 1e5 ? 0 : 2) }), h("span", { text: `${fmt(held.qty, held.qty % 1 ? 2 : 0)} shares` })),
      stat("Today", h("b", { class: `num ${tone(d)}`, "data-dg": sym, text: signed(d) }), h("span", { class: `num ${tone(q.chgPct)}`, "data-pct": sym, text: pct(q.chgPct) })),
      g != null ? stat("Since bought", h("b", { class: `num ${tone(g)}`, text: signed(g, "GBP", Math.abs(g) >= 1e4 ? 0 : 2) }), h("span", { class: `num ${tone(g)}`, text: pct((g / paid) * 100, 1) }))
        : stat("Since bought", h("button.inline", { type: "button", onclick: () => pushSheet("holding", sym), text: "Add cost" }), h("span", { text: "to see it" }))),
    h("p.ynote", { text: [held.account ? `In your ${ACCOUNT_NAME[held.account]}` : null, held.cost != null ? `${held.buys > 1 ? "average" : "paid"} ${priceSaid(q, held.cost)} a share` : null, dv >= 0.5 ? `${money(dv, "GBP", 0)} of dividends counted` : null].filter(Boolean).join(" · ") }));
}
function facts(sym, held, q) {
  const rows = [], y = S.years[sym];
  if (q.dayLo != null && q.dayHi != null && q.dayHi > q.dayLo) { const at = (q.price - q.dayLo) / (q.dayHi - q.dayLo);
    rows.push(h("div.fact", {}, h("span", { text: "Today's range" }), h("b", { text: at >= 0.85 ? "Near the day's high" : at <= 0.15 ? "Near the day's low" : "Mid-range" }), h("i.num", { text: q.prev ? `closed ${priceSaid(q, q.prev)} yesterday` : "" }), ...range52(q, q.dayLo, q.dayHi, at))); }
  const hi = q.hi52 ?? y?.hi52, lo = q.lo52 ?? y?.lo52;
  if (hi && lo && hi > lo) { const at = (q.price - lo) / (hi - lo); rows.push(h("div.fact", {}, h("span", { text: "52-week range" }), h("b", { text: at >= 0.9 ? "Near its high" : at <= 0.1 ? "Near its low" : at >= 0.5 ? "In the upper half" : "In the lower half" }), h("i.num", { text: y?.yr != null ? `${pct(y.yr, 1)} on a year ago` : "" }), ...range52(q, lo, hi, at))); }
  if (y?.div12 > 0 && q.price) { const nx = held?.qty > 0 ? income().events.find((e) => e.x.symbol === sym) : null;
    rows.push(h("div.fact", {}, h("span", { text: "Dividends" }), h("b.num", { text: `${priceSaid(q, y.div12)} a share a year` }), h("i.num", { text: `yield ${fmt((y.div12 / q.price) * 100, 1)}%` }),
      held?.qty > 0 && rate(q.cur) != null ? h("p", {}, `About ${money(y.div12 * held.qty * rate(q.cur), "GBP", 0)} a year to you`, nx ? h("span.nx", { text: ` · next about ${money(nx.v, "GBP", nx.v >= 100 ? 0 : 2)}, around ${aroundDay(nx.at)}` }) : null) : null)); }
  if (y?.div12 > 0 && q.price && rate(q.cur) != null && !isIndex(q) && y.divs?.length) rows.push(whatIf(q, y));
  if (kindOf(q) === "trust") rows.push(h("details.more", {}, h("summary", {}, h("b", { text: "What's an investment trust?" }), icon("chev", 16, 2.4)),
    h("p", { text: "A company that invests in many others. You buy its shares like any other, and it spreads your money across what it holds. Its share price can sit above or below what those holdings are worth: a premium, or a discount." })));
  if (!y && !isIndex(q) && q.type !== "CURRENCY") A.years([sym]).then((r) => { if (r.years[sym]) { S.years[sym] = r.years[sym]; const f = el("facts"); if (f && Sheet.stack.at(-1)?.[1]?.[0] === sym) f.replaceWith(facts(sym, S.list.find((x) => x.symbol === sym), S.q[sym])); } }, () => {});
  return h("div.facts", { "data-el": "facts" }, rows);
}
// Your buys and sales of one: each, newest first, and what sales have made; one more, or one taken off
async function drawBuys(sym) {
  const box = el("buys");
  if (!box) return;
  const held = S.list.find((x) => x.symbol === sym), q = S.q[sym];
  let b = null, failed = false;
  if (held?.buys) { try { b = await A.buys(sym); } catch (_) { failed = true; } }
  if (!box.isConnected) return;
  const add = h("button", { type: "button", onclick: () => pushSheet(buyView, sym), text: held?.buys ? "Add a Buy or Sale" : held?.qty > 0 ? "Record Your Buys" : "Record a Buy" });
  // (ones that couldn't come: said, with Try Again, and one more can still be added)
  if (failed) { box.replaceChildren(h("h3.slabel", {}, "Buys and sales"), h("p.hint", {}, "Couldn't get your buys and sales just now. ", h("button.inline", { type: "button", onclick: () => drawBuys(sym), text: "Try Again" })), h("div.links", { style: "margin-top:14px" }, add)); return; }
  if (!b?.buys?.length) { box.replaceChildren(h("div.links", { style: "margin-top:20px" }, add)); return; }
  const when = (t) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const row = (x, i) => {
    const del = h("button.del.press", { type: "button", "aria-label": "Delete" }, icon("x", 14, 2.6));
    del.onclick = async (e) => {
      e.stopPropagation();
      if (!del.classList.contains("sure")) { del.classList.add("sure"); del.replaceChildren("Delete"); setTimeout(() => { if (del.isConnected) { del.classList.remove("sure"); del.replaceChildren(icon("x", 14, 2.6)); } }, 3000); return; }
      del.disabled = true;
      try { const r = await A.dropBuy(x.id); S.list = r.holdings; toast(x.qty > 0 ? "Buy taken off" : "Sale taken off"); await refresh(true); drawSheet(); core.changed(); loadPaid(true); S.inc = null; }
      catch (err) { toast(err.message, true); del.disabled = false; }
    };
    return h("div.item.buy.rise", { vars: { i: String(i) } },
      h("span", {}, h("b", { text: `${x.qty > 0 ? "Bought" : "Sold"} ${fmt(Math.abs(x.qty), Math.abs(x.qty) % 1 ? 2 : 0)}` }), h("small", { text: when(x.at) })),
      h("span.r", {}, h("b.num", { text: x.price != null ? priceSaid(q, x.price) : "–" }), h("small", { text: x.price != null ? (rate(q.cur) != null ? money(Math.abs(x.qty) * x.price * rate(q.cur)) : money(Math.abs(x.qty) * x.price, q.cur)) : "price not said" })), del);
  };
  // (what's made on sales only once there's been one: replaceChildren writes a null out as the word, as h() doesn't)
  box.replaceChildren(...[h("h3.slabel", {}, "Buys and sales"),
    h("div.list.flush", {}, [...b.buys].reverse().map(row)),
    b.made != null ? h("div.facts", { style: "margin-top:8px" }, h("div.fact", {}, h("span", { text: "Made on what you've sold" }), h("b", { class: `num ${tone(b.made)}`, text: rate(q.cur) != null ? signed(b.made * rate(q.cur)) : signed(b.made, q.cur) }), h("i", { text: "over what it cost you on average" }))) : null,
    h("div.links", { style: "margin-top:14px" }, add)].filter(Boolean));
}
// A buy or a sale: which, the day, how many and the price each (today's to start with)
function buyView(sym) {
  const held = S.list.find((x) => x.symbol === sym), q = S.q[sym], cs = SYM[q?.cur] ?? "", name = held?.name || q?.name || sym;
  let sold = false;
  const kind = h("div.choice", { role: "group", "aria-label": "Bought or sold" }, [["buy", "Bought"], ["sell", "Sold"]].map(([k, n]) => h("button.press", { type: "button", "data-k": k, "aria-pressed": String(k === "buy"), text: n,
    onclick: () => { sold = k === "sell"; kind.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === k))); save.textContent = sold ? "Save Sale" : "Save Buy"; } })));
  const today = new Date().toLocaleDateString("en-CA");
  const day = h("input", { type: "date", id: "mk-day", value: today, max: today, "aria-label": "The day" });
  const qty = h("input", { type: "text", inputmode: "decimal", id: "mk-bqty", placeholder: "0", "aria-label": "How many" });
  const price = h("input", { type: "text", inputmode: "decimal", id: "mk-bprice", value: q?.price != null ? String(+q.price.toFixed(q.price < 1 ? 4 : 2)) : "", "aria-label": "Price each" });
  const save = h("button.btn.go.press", { type: "button", style: "width:100%;margin-top:26px", id: "mk-bsave" }, "Save Buy");
  // (a price in pence typed as pounds, by the look of it: asked about under it, and once more on saving)
  let sure = false;
  const echo = h("p.echo", { id: "mk-becho", "aria-live": "polite" });
  const tell = () => {
    const p = penceMeant(priceIn(price.value, q), q, price.value);
    sure = false;
    echo.replaceChildren(p ? h("button.inline", { type: "button", onclick: () => { price.value = p; tell(); price.focus(); }, text: `Did you mean ${p}?` }) : "");
  };
  price.addEventListener("input", tell);
  save.onclick = async () => {
    const num = (s) => (s.trim() === "" ? null : Number(s.replace(/[,£$€\s]/g, "")));
    const n = num(qty.value), p = priceIn(price.value, q), at = day.value ? Date.parse(day.value + "T12:00:00Z") : Date.now();
    if (!n || !Number.isFinite(n) || n <= 0) return toast("How many should be a number.", true);
    if (p != null && (!Number.isFinite(p) || p < 0)) return toast("The price should be a number.", true);
    const pp = penceMeant(p, q, price.value);
    if (pp && !sure) { sure = true; return toast(`Did you mean ${pp}? Save again to keep ${money(p, q.cur)} a share.`, true); }
    save.disabled = true;
    try {
      const r = await A.addBuy({ symbol: sym, qty: n, price: p, at, sold });
      S.list = r.holdings;
      toast(sold ? "Sale saved" : "Buy saved");
      await refresh(true);
      backSheet(); core.changed(); loadPaid(true); S.inc = null;
    } catch (e) { toast(e.message, true); save.disabled = false; }
  };
  return [h("div.shead", {}, backBtn(), h("h2", { text: name }), closeBtn()),
    h("div.form", {}, kind,
      h("label", { for: "mk-day", text: "On" }), h("div.field", {}, day),
      h("label", { for: "mk-bqty", text: "How many shares" }), h("div.field", {}, qty),
      h("label", { for: "mk-bprice", text: `Price each${cs || !q?.cur ? "" : ` (${q.cur})`}${q?.cur === "GBP" ? ", in pounds or as pence (52p)" : ""}` }), h("div.field", {}, cs ? h("span.unit", { text: cs }) : null, price), echo),
    h("p.hint", { text: held?.qty > 0 && !held?.buys ? `Your ${fmt(held.qty, held.qty % 1 ? 2 : 0)} shares${held.cost != null ? ` at ${priceSaid(q, held.cost)}` : ""} are kept as your first buy, and this one's added to them. How many you own and what they cost on average are worked out from them all from now on.` : "How many you own and what they cost on average are worked out from all your buys and sales: a sale takes shares out at the average." }), save];
}

// Why it's moving: the day's story about it, where it's moved enough for one to matter; else how it's done against its market
async function whyMoving(sym, el) {
  const q = S.q[sym], m = S.q[MARKET_OF[q.ex]], said = (text, small, n) => el.replaceChildren(n ? h("a", { href: n.link, target: "_blank", rel: "noopener", onclick: readsIn(n), text }) : text, small ? h("small", { text: small }) : null);
  if (isIndex(q) || q.type === "CRYPTOCURRENCY" || q.type === "CURRENCY") {
    const big = q.symbol === "^FTSE" || q.symbol === "^GSPC" ? S.list.filter((x) => MARKET_OF[S.q[x.symbol]?.ex] === sym && S.q[x.symbol]?.chgPct != null).sort((a, b) => Math.abs(S.q[b.symbol].chgPct) - Math.abs(S.q[a.symbol].chgPct))[0] : null;
    return said(`${INDEX_NAMES[sym] || q.name} is ${Math.abs(q.chgPct || 0) < 0.05 ? "flat" : `${q.chgPct >= 0 ? "up" : "down"} ${fmt(Math.abs(q.chgPct), 1)}%`} today.${big ? ` Of yours here, ${big.name} has moved most, ${pct(S.q[big.symbol].chgPct, 1)}.` : ""}`, "From the day's prices");
  }
  let story = null, about = [];
  try {
    const r = await A.news([sym], false);
    about = r.news.filter((n) => n.tickers.includes(sym) || n.for === sym);
    story = about.find((n) => Date.now() - n.at < 36 * 3600e3) || null;
  } catch (_) {}
  if (!el.isConnected) return;
  // (the latest few about it, under what's said: not the one said, where it's the day's story)
  const move = q.chgPct || 0, vsMarket = m?.chgPct != null ? ` The ${INDEX_NAMES[MARKET_OF[q.ex]]} is ${m.chgPct >= 0 ? "up" : "down"} ${fmt(Math.abs(m.chgPct), 1)}%.` : "";
  const shown = story && Math.abs(move) >= 1 ? story : null, rest = about.filter((n) => n !== shown).slice(0, 3), list = el.parentNode?.querySelector("[data-el=snews]");
  if (list && rest.length) list.replaceChildren(h("h3.slabel", { text: "News" }), h("div.snews", {}, rest.map((n) => h("a.story", { href: n.link, target: "_blank", rel: "noopener", onclick: readsIn(n) },
    h("span.m", {}, h("span", { text: `${n.src} · ${ago(n.at)}` })), h("b", { text: n.title })))));
  if (shown) return said(shown.title, `${shown.src} · ${ago(shown.at)}`, shown);
  // (a quiet day: its latest story said small, unless it's in the news just under this, to tap there; on the desk there's none)
  if (Math.abs(move) < 1) return said(`A quiet day for it, moving with the market.${vsMarket}`, !story ? "No news about it today" : list && rest.includes(story) ? "From the day's prices" : `Latest: ${story.title.slice(0, 90)}${story.title.length > 90 ? "…" : ""}`);
  return said(`No news about it today, so it's ${m && Math.sign(m.chgPct) === Math.sign(move) ? "moving with the market" : "moving on its own"}.${vsMarket}`, "From the day's prices and news");
}
// The chart: drawn in, then reshaped as the range changes; read with a finger along it
async function stockChart(sym, box, seg) {
  const N = 120, W = () => box.clientWidth || 390, H = 210;
  const svg = C.el("svg", { viewBox: `0 0 ${W()} ${H}`, preserveAspectRatio: "none", role: "img", "aria-label": "Price chart" });
  const gid = "g" + Math.random().toString(36).slice(2, 8);
  svg.innerHTML = `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-opacity=".2"/><stop offset="1" stop-opacity="0"/></linearGradient></defs>`;
  const base = C.el("line", { class: "base", x1: 0, x2: W(), "vector-effect": "non-scaling-stroke" }), fill = C.el("path", { class: "fill", fill: `url(#${gid})` }), line = C.el("path", { class: "line", "vector-effect": "non-scaling-stroke" });
  svg.append(base, fill, line); box.append(svg);
  const axis = h("div.axis.num"), now = h("i.nowdot"), blabel = h("span.blabel.num");
  box.append(now, blabel); box.after(axis);
  // (drawn: the range shown. One that can't be drawn leaves it as it was, pressed again, so it can be asked for again)
  let shown = null, raw = null, range = "1d", drawn = "1d", seq = 0;
  const press = (r) => { const b = seg.querySelector(`[data-r="${r}"]`); if (!b) return; seg.querySelector(".sl").style.transform = `translateX(${b.offsetLeft}px)`; seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); };
  const back = (n, why) => { if (n !== seq) return; range = drawn; box.dataset.range = drawn; press(drawn); if (why) toast(why, true); };
  const show = async (r, first) => {
    const n = ++seq;
    range = r; box.dataset.range = r;
    const key = `${sym}:${r}`;
    box.classList.add("loading");
    const kept = S.charts.get(key), fresh = kept && Date.now() - kept.at < (r === "1d" ? 60e3 : 600e3);
    let c = fresh ? kept.c : null;
    if (!c) { try { c = await A.chart(sym, r); S.charts.set(key, { at: Date.now(), c }); } catch (e) { box.classList.remove("loading"); if (kept) c = kept.c; else return back(n, e.message); } }
    if (n !== seq || !box.isConnected) return;
    box.classList.remove("loading");
    if (!c.c.length) return back(n, shown ? "Nothing to draw for that just now." : null);
    drawn = r;
    const q = S.q[sym], w = W(), session = r === "1d" && q.open && c.t.length ? q.open : null;
    const vals = [...c.c], ts = [...c.t];
    // (today's line to now: the price as it is, at the end)
    if (r === "1d" && q.price != null && q.time && q.time > ts.at(-1)) { vals.push(q.price); ts.push(q.time); }
    const xs = session ? ts.map((t) => Math.max(0, Math.min(1, (t - session.start) / (session.end - session.start)))) : null;
    const b = r === "1d" ? (c.prev ?? q.prev ?? vals[0]) : vals[0];
    const { pts, baseY } = C.place(vals, w, H, { pad: 26, xs, base: b });
    raw = { pts, vals, ts, cur: q };
    const up = vals.at(-1) >= b, col = up ? "var(--up)" : "var(--down)";
    svg.setAttribute("viewBox", `0 0 ${w} ${H}`);
    base.setAttribute("x2", w); base.setAttribute("y1", baseY); base.setAttribute("y2", baseY);
    line.style.stroke = col;
    svg.querySelectorAll("stop").forEach((s) => s.setAttribute("stop-color", up ? "#5fe0a6" : "#ff8a80"));
    const target = C.resample(pts.map((p) => p[0]), N).map((x, i) => [x, C.resample(pts.map((p) => p[1]), N)[i]]);
    const draw = (p) => { line.setAttribute("d", C.smooth(p)); fill.setAttribute("d", C.area(p, H)); };
    if (!shown || first) { draw(target); C.drawIn(line, 0.1, 1.2); fill.style.opacity = "0"; requestAnimationFrame(() => { fill.style.opacity = "1"; }); }
    else await C.tween(shown, target, 700, draw);
    shown = target;
    // (along the bottom: the day's open and close, or where the range starts and ends; on the line, now, while it's
    // open; and on the dashed line, what it is)
    const tz = q.tz || undefined, tm = (t) => new Date(t * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz });
    const dd = (t) => new Date(t * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: r === "1y" || r === "5y" ? "numeric" : undefined, timeZone: tz });
    axis.replaceChildren(...(session ? [tm(session.start), tm((session.start + session.end) / 2), tm(session.end)] : [dd(ts[0]), r === "5d" ? "Now" : "Today"]).map((t) => h("span", { text: t })));
    const live = session && Date.now() / 1000 < session.end, last = pts.at(-1);
    now.hidden = !live;
    if (live) { now.style.transform = `translate(${last[0]}px, ${last[1]}px)`; now.style.color = col; }
    blabel.textContent = r === "1d" ? `${priceSaid(q, b)} yesterday` : `${priceSaid(q, b)} then`;
    blabel.style.top = `${Math.max(0, baseY - 20)}px`;
    // what's said over it: the change over the range
    const ch = vals.at(-1) - b, chp = (vals.at(-1) / b - 1) * 100, rp = el("rpct"), rs = el("rsaid");
    if (rp && rs) { rp.className = `num ${tone(chp)}`; rp.textContent = isIndex(q) ? pct(chp) : `${chgSaid(q, ch)} (${pct(chp)})`; rs.textContent = RANGES.find((x) => x[0] === r)[2]; }
  };
  C.scrubber(box, (x) => {
    if (!raw) return null;
    let k = 0, best = Infinity;
    raw.pts.forEach((p, i) => { const d = Math.abs(p[0] - x); if (d < best) { best = d; k = i; } });
    const [px, py] = raw.pts[k], t = raw.ts[k] * 1000, tz = raw.cur.tz || undefined;
    const when = range === "1d" ? new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz })
      : range === "5d" ? new Date(t).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: tz })
      : range === "5y" ? new Date(t).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: tz })
      : new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: range === "1y" ? "2-digit" : undefined, timeZone: tz });
    return { x: px, y: py, label: `${priceSaid(raw.cur, raw.vals[k])} · ${when}` };
  });
  seg.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-r]");
    if (!b || b.dataset.r === range) return;
    press(b.dataset.r);
    show(b.dataset.r);
  });
  // (the phone turned, or the window resized: drawn again at the new width)
  let drawnW = W();
  const ro = new ResizeObserver(() => { if (!box.isConnected) return ro.disconnect(); if (shown && Math.abs(W() - drawnW) > 2) { drawnW = W(); show(range, true); } });
  ro.observe(box);
  await show("1d", true);
}
// Remove: a second tap to be sure, saying what goes with it (its buys and sales, its alert)
function removeBtn(sym, held) {
  const b = h("button.danger", { type: "button", "data-k": "remove", text: "Remove" });
  b.onclick = () => {
    if (b.classList.contains("sure")) return removeHolding(sym);
    b.classList.add("sure");
    b.textContent = held.buys ? `Remove, with ${plural(held.buys, "buy and sale", "buys and sales")}?` : "Tap again to remove";
    setTimeout(() => { if (b.isConnected) { b.classList.remove("sure"); b.textContent = "Remove"; } }, 3500);
  };
  return b;
}
async function removeHolding(sym) {
  const name = nameOf(sym);
  try { await core.removeHolding(sym); closeSheet(); toast(`${name} removed`); }
  catch (e) { toast(e.message, true); }
}
// Alert Me: how much a move in a day is worth hearing about, a tap on one of four or a number of your own, or off
// (app.js alertView; the number's field is the hook's input[data-k=alert])
function alertView(sym) {
  const held = S.list.find((x) => x.symbol === sym), name = held?.name || nameOf(sym), cur = held?.alert || null;
  const pick = async (p, btn) => {
    if (!(p === 0 || (Number.isFinite(p) && p >= 1 && p <= 50))) return toast("Say a move of 1% to 50%.", true);
    if (btn) btn.disabled = true;
    try { toast(await core.alertSet(sym, p)); backSheet(); }
    catch (e) { toast(e.message, true); if (btn) btn.disabled = false; }
  };
  const own = h("input", { type: "text", inputmode: "decimal", id: "mk-alert", "data-k": "alert", placeholder: "3", value: cur ? String(cur) : "", "aria-label": "A move of this many percent" });
  own.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); pick(Number(own.value.replace(/[%\s]/g, "")), null); } });
  return [h("div.shead", {}, backBtn(), h("h2", { text: "Alert Me" }), closeBtn()),
    h("p.why", { text: `When ${name} moves this much in a day, up or down:` }),
    h("div.choice.amt", { role: "group", "aria-label": "How much" }, [2, 3, 5, 10].map((p) => h("button.press", { type: "button", "aria-pressed": String(cur === p), onclick: (e) => pick(p, e.currentTarget), text: `${p}%` }))),
    h("div.form", {}, h("label", { for: "mk-alert", text: "Or a move of your own, in percent" }), h("div.field", {}, own, h("span.unit", { text: "%" })),
      h("button.btn.go.press.wide", { type: "button", "data-k": "alert-save", onclick: (e) => pick(Number(own.value.replace(/[%\s]/g, "")), e.currentTarget) }, "Set Alert")),
    h("p.hint", { text: "You'll hear once a day at most, on the phones you've turned notifications on for in You. Your account's Quiet Hours are kept." }),
    cur ? h("div.links", {}, h("button.danger", { type: "button", onclick: (e) => pick(0, e.currentTarget), text: "Turn Off" })) : null];
}
// Send: its day in percent, never a price or anything you hold (core.stockSend, S2-D6)
function sendInChat(sym, name = nameOf(sym)) { M.fw.send(core.stockSend(sym, name)); }
stockView.sheet = "stock";
// (your list changed, or what's paid you came in, while its page is up: its facts and yours said again, app.js loadPaid)
core.on("list", () => {
  if (topView() !== stockView) return;
  const sym = topArg(), held = S.list.find((x) => x.symbol === sym), f = el("facts");
  if (f && S.q[sym]) f.replaceWith(facts(sym, held, S.q[sym]));
  if (held?.qty > 0 && valueOf(held) != null && S.q[sym]) el("yours")?.replaceWith(yoursPart(sym, held, S.q[sym]));
});

export function openStock(ctx, sym, o = {}) {
  sym = String(sym || "").toUpperCase();
  if (!SYMBOL.test(sym)) { toast("That isn’t a stock Markets knows."); return null; }
  return (o.push ? pushSheet : openSheet)(stockView, sym, o);
}

export { stockView, yoursPart, alertView, facts, drawBuys, buyView, whyMoving, stockChart, removeBtn, removeHolding, sendInChat };
