// Markets' Holdings section and its two sheets (One roof stage 2, spec §2.1, §4.2, S2-D7, D8, D19): your holdings and
// those you follow (in your order: Change Order moves one a step at a time, said through a live line, in place of
// app.js's press and hold), the ring of your mix, how you've done, your accounts (each opens mk-account), your income and
// your year against the market; the foot's "About These Prices" (mk-about: values in pounds, where the prices come from,
// not advice) and, at 980 px and wider, the desk's row. Moved from markets/app.js (holdingsView :1444, mix :1471-1528,
// statsPart :1529, orderView :1612, accountsPart :1635, incomePart :1648, vsQuick/vsPart :1830-1843, accountView :1924;
// the About words from settingsView :2766-2769). Loaded through fw.lazy on Holdings' first show (connector.lazy).
// view(el, ctx) → { draw(), hide(), destroy() }; openAccount(ctx, name) → mk-account; openAbout(ctx) → mk-about.
import * as core from "./core.js";
import { h, C, el, M, toast, render, openSheet, pushSheet, closeBtn, incomeBars, allowBar, icon, keepFocus, afterDraw } from "./mkui.js";
import { itemRow, figOf, emptyView } from "./todayview.js";

const { S, A, ACCOUNT_NAME, BENCHES, KINDS_SAID, fmt, money, signed, pct, tone, plainSym, plural, kindOf, valueOf, divsOf, paidFor, totals, leftOutSaid, byAccount, income, isaYear, tracksIsa, aroundMonth, owned, rate } = core;
// (Markets on its own, where the desk is: its own address, not this one)
const OWN = "https://finance.inflite.ai/";

// ---- the section ----
// (Change Order: on while it's on, the live line saying where the last one moved went)
const E = { on: false, said: "" };
function holdingsView() {
  if (!S.list.length) return emptyView();
  const T = totals(), parts = [];
  if (T.o.length) parts.push(...mixPart(T));
  if (T.o.length) parts.push(...statsPart(T));
  const own = S.list.filter((x) => x.qty > 0), fol = S.list.filter((x) => !(x.qty > 0));
  const editBtn = S.list.length > 1 ? h("button.mk-edit", { type: "button", "data-k": "edit", "aria-pressed": String(E.on), onclick: () => { E.on = !E.on; E.said = ""; redraw(); }, text: E.on ? "Done" : "Change Order" }) : null;
  if (own.length) {
    // (under each one's worth: today's change, or how it's done since you bought, switched here)
    const fig = T.costed.length && !E.on ? h("div.per", { role: "group", "aria-label": "Under each, show" }, [["day", "Today"], ["back", "Since bought"]].map(([k, label]) => h("button", { type: "button", "data-k": k, "aria-pressed": String(k === S.fig), text: label,
      onclick: (e) => { if (S.fig === k) return; S.fig = k; e.currentTarget.parentNode.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === k))); el("all")?.querySelectorAll(".item[data-sym]").forEach((r) => r.querySelector(".r small")?.replaceWith(figOf(S.list.find((x) => x.symbol === r.dataset.sym)))); } }))) : null;
    parts.push(h("h3.label", {}, "Your holdings", fig));
    parts.push(E.on ? orderList(own, own, fol) : h("div.list", { "data-el": "all" }, own.map((x, i) => itemRow(x, i, "value"))));
  }
  if (fol.length) {
    parts.push(h("h3.label", {}, "Following", h("span", { text: "price today" })));
    parts.push(E.on ? orderList(fol, own, fol) : h("div.list", { "data-el": "following" }, fol.map((x, i) => itemRow(x, i, "value"))));
  }
  if (E.on) parts.push(h("p.vh", { "aria-live": "polite", "data-el": "order-say", tabindex: "-1", text: E.said }));
  parts.push(h("div.links", {}, h("button", { type: "button", onclick: () => M.open.addStock(), text: "Add a Stock" }), editBtn));
  if (T.o.length) parts.push(...accountsPart(T), ...incomePart(), ...vsPart());
  parts.push(h("p.foot.mk-foot", {}, h("button.inline", { type: "button", "data-k": "about", onclick: () => M.open.about(), text: "About These Prices" })));
  parts.push(h("p.foot.mk-desk", {}, "The desk view is in Markets on its own. ", h("a.inline", { href: OWN, target: "_blank", rel: "noopener", text: "Open Markets" })));
  return parts;
}
// Your list's order, a step at a time (S2-D19, app.js orderView :1612): each one's Move Up and Move Down; each change
// kept with your account as it's made, in turn (the last one's answer taken as the list); one at the top or foot can't
// go further but keeps the keyboard where it is. While one's waiting to be kept, Markets is busy (core.ordering)
const ORDER = { q: Promise.resolve(), n: 0 };
function orderList(group, own, fol) {
  const move = (i, by) => {
    const j = i + by;
    if (j < 0 || j >= group.length) return;
    const x = group[i];
    [group[i], group[j]] = [group[j], group[i]];
    S.list = [...own, ...fol];
    E.said = `${x.name}: ${j + 1} of ${group.length}`;
    redraw();
    M.root?.querySelector(`[data-k="move-${by < 0 ? "up" : "down"}"][data-sym="${String(x.symbol).replace(/["\\]/g, "\\$&")}"]`)?.focus({ preventScroll: true });
    const n = ++ORDER.n, syms = S.list.map((y) => y.symbol);
    core.ordering(1);
    ORDER.q = ORDER.q.then(() => A.order(syms)).then((r) => { if (n === ORDER.n) { S.list = r.holdings; core.changed(); } }, (e) => { toast(e.message, true); })
      .finally(() => core.ordering(-1));
    core.ordering(0, ORDER.q);
  };
  return h("div.list.mk-order", {}, group.map((x, i) => h("div.item.ord", {},
    h("span", {}, h("b", { text: x.name }), h("small", { text: plainSym(x.symbol) })),
    h("button.mv", { type: "button", "data-k": "move-up", "data-sym": x.symbol, "aria-label": `Move ${x.name} up`, "aria-disabled": String(i === 0), onclick: () => move(i, -1) }, icon("up", 18, 2.4)),
    h("button.mv", { type: "button", "data-k": "move-down", "data-sym": x.symbol, "aria-label": `Move ${x.name} down`, "aria-disabled": String(i === group.length - 1), onclick: () => move(i, 1) }, icon("down", 18, 2.4)))));
}
let redraw = () => {};

// Your mix: a dial of it, by holding (the five largest, and the rest), by kind (shares, trusts, funds), or by account,
// switched above it. Its slices are rounded and apart, on a faint track; what it's worth in the middle. Tap a slice,
// or its name under the dial, and it's lifted out (the others fade back), what it's worth said in the middle; tap it
// again, or another, to change that
const MIX = ["var(--m1)", "var(--m2)", "var(--m3)", "var(--m4)", "var(--m5)", "var(--m6)"];
const MIX_KINDS = { share: MIX[0], trust: MIX[2], fund: MIX[1], crypto: MIX[3] }, MIX_ACCTS = { isa: MIX[2], sipp: MIX[1], gia: MIX[0] };
function mixSlices(T, by) {
  if (by === "kind") {
    const kinds = {};
    for (const x of T.o) { const k = kindOf(S.q[x.symbol]); kinds[k] = (kinds[k] || 0) + valueOf(x); }
    return Object.entries(kinds).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ n: KINDS_SAID[k] || "Other", v, c: MIX_KINDS[k] || MIX[5] }));
  }
  if (by === "account") return byAccount(T.o).map((a) => ({ n: a.name, v: a.value, c: MIX_ACCTS[a.key] || MIX[5], key: a.key }));
  // (the biggest five and the rest together; six, each its own: one on its own is no "everything else")
  const all = [...T.o].sort((a, b) => valueOf(b) - valueOf(a)), n = all.length === 6 ? 6 : 5, top = all.slice(0, n), rest = all.slice(n).reduce((a, x) => a + valueOf(x), 0);
  return [...top.map((x, i) => ({ n: x.name, v: valueOf(x), c: MIX[i], sym: x.symbol })), ...(rest > 0 ? [{ n: "Everything else", v: rest, c: MIX[5] }] : [])];
}
const bigMoney = (v) => (v >= 1e6 ? `£${fmt(v / 1e6, 2)}m` : money(v, "GBP", 0));
function mixRing(T, by) {
  const slices = mixSlices(T, by), R = 82, SW = 17, cap = SW / 2 / R, gapA = slices.length > 1 ? 2 * cap + 0.045 : 0;
  const svg = C.el("svg", { viewBox: "0 0 200 200", class: "dialsvg", role: "img", "aria-label": `Your mix, by ${by}: ${slices.map((sl) => `${sl.n} ${Math.round((sl.v / T.value) * 100)}%`).join(", ")}` });
  svg.append(C.el("circle", { class: "track", cx: 100, cy: 100, r: R }));
  let a0 = -Math.PI / 2;
  const arcs = slices.map((sl, i) => {
    const span = (sl.v / T.value) * Math.PI * 2, s0 = a0 + gapA / 2, s1 = Math.max(s0 + 0.001, a0 + span - gapA / 2), P = (a) => [100 + R * Math.cos(a), 100 + R * Math.sin(a)];
    a0 += span;
    const el = slices.length === 1 ? C.el("circle", { class: "arc", cx: 100, cy: 100, r: R, pathLength: 1 })
      : (() => { const [x0, y0] = P(s0), [x1, y1] = P(s1); return C.el("path", { class: "arc", d: `M${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 ${s1 - s0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`, pathLength: 1 }); })();
    el.style.cssText = `--c:${sl.c};--i:${i}`;
    el.addEventListener("click", () => pick(i));
    svg.append(el);
    return el;
  });
  const big = h("b.num", { text: bigMoney(T.value) }), name = h("span", { text: plural(T.o.length, "holding") }), share = h("small.num");
  const centre = h("div.dialc", { "aria-live": "polite" }, name, big, share);
  const keys = slices.map((sl, i) => h("button.mkey", { type: "button", "aria-pressed": "false", onclick: () => pick(i) }, h("i", { style: `background:${sl.c}` }), h("span", { text: sl.n }), h("b.num", { text: `${Math.round((sl.v / T.value) * 100)}%` })));
  let on = -1;
  function pick(i) {
    on = on === i ? -1 : i;
    arcs.forEach((a, k) => { a.classList.toggle("on", k === on); a.classList.toggle("dim", on >= 0 && k !== on); });
    keys.forEach((b, k) => b.setAttribute("aria-pressed", String(k === on)));
    const sl = slices[on];
    if (!sl) { name.textContent = plural(T.o.length, "holding"); big.textContent = bigMoney(T.value); share.textContent = ""; return; }
    name.textContent = sl.n; big.textContent = bigMoney(sl.v); share.textContent = `${Math.round((sl.v / T.value) * 100)}% of your money`;
  }
  return h("div.dial", { "data-el": "ring" }, h("div.dialw", {}, svg, centre), h("div.mkeys", {}, keys));
}
function mixPart(T) {
  const ways = [["holding", "Holdings"], ["kind", "Kinds"], ["account", "Accounts"]].filter(([k]) => k === "holding" || mixSlices(T, k).length > 1);
  if (!ways.some(([k]) => k === S.mix)) S.mix = "holding";
  const ring = mixRing(T, S.mix);
  if (ways.length < 2) return [ring];
  // (a segmented control, its thumb sliding to the one chosen)
  const at = ways.findIndex(([k]) => k === S.mix);
  const seg = h("div.seg.ways", { role: "group", "aria-label": "Your mix, by", vars: { n: String(ways.length) } }, h("span.sl", { style: `transform:translateX(${at * 100}%)` }),
    ways.map(([k, label], i) => h("button", { type: "button", "data-k": k, "aria-pressed": String(k === S.mix), text: label,
      onclick: () => { if (S.mix === k) return; S.mix = k; seg.querySelector(".sl").style.transform = `translateX(${i * 100}%)`; seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === k))); el("ring")?.replaceWith(mixRing(totals(), k)); } })));
  return [h("div.mixrow", {}, seg), ring];
}
// How you've done, under the ring: since you bought (with the dividends it's paid you), or where that's not known, a
// year's dividends; and today. Then what it's from, where that's not everything, and a day asked for where one that
// pays has none to count its dividends from
function statsPart(T) {
  const I = T.back == null ? income() : null, stat = (label, v, cls, sub) => h("div.stat", {}, h("small", { text: label }), h("b", { class: `num ${cls}`, text: v }), h("span.num", { text: sub }));
  const notes = [];
  if (leftOutSaid()) notes.push(`${leftOutSaid()} `);
  if (T.back != null && T.costed.length < T.o.length) notes.push(`Since you bought is from the ${T.costed.length} of your ${T.o.length} holdings you've said what you paid for. `);
  if (T.undated.length === 1) notes.push("Say when you bought ", h("button.inline", { type: "button", onclick: () => M.open.holding(T.undated[0].symbol), text: T.undated[0].name }), " to count the dividends it's paid you.");
  else if (T.undated.length) notes.push("Say when you bought each (Edit Holding, on its page) to count the dividends they've paid you.");
  return [h("div.stats", {},
      T.back != null ? stat("Since you bought", signed(T.back, "GBP", Math.abs(T.back) >= 1e4 ? 0 : 2), tone(T.back), `${pct(T.backPct, 1)}${T.divs >= 0.5 ? ` · ${money(T.divs, "GBP", 0)} in dividends` : ""}`)
        : I?.total ? stat("Dividends", `${money(I.total, "GBP", 0)}`, "", "a year, expected") : null,
      stat("Today", signed(T.day, "GBP", Math.abs(T.day) >= 1e4 ? 0 : 2), tone(T.day), pct(T.dayPct))),
    notes.length ? h("p.stats-note", {}, notes) : null];
}
// Your accounts: each one's worth and day; and the ISA's allowance, what's left of it this tax year
function accountsPart(T) {
  const accts = byAccount(T.o), tagged = accts.some((a) => a.key), iy = isaYear();
  if (!tagged && !tracksIsa()) return [h("p.foot", { class: "foot", style: "padding-top:22px" }, "Hold some in an ISA or a pension? Say which on each one's page (Edit Holding) to see each account's total. ",
    h("button.inline", { type: "button", onclick: () => M.open.isa(), text: "Track your ISA allowance" }))];
  const rows = (tagged ? accts : []).map((a, i) => h("button.item.two.rise", { type: "button", vars: { i: String(i) }, "data-k": "account", "data-acct": a.key || "none", onclick: () => M.open.account(a.key) },
    h("span", {}, h("b", { text: a.name }), h("small", { text: `${plural(a.o.length, "holding")} · ${Math.round((a.value / T.value) * 100)}% of your money` })),
    h("span.r", {}, h("b.num", { text: money(a.value) }), h("small", { class: `num ${tone(a.day)}`, text: `${signed(a.day)} today` }))));
  if (iy && tracksIsa()) rows.push(h("button.item.two.rise", { type: "button", vars: { i: String(rows.length) }, onclick: () => M.open.isa() },
    h("span", {}, h("b", { text: "ISA allowance" }), h("small", { text: `${iy.year} · ${plural(iy.days, "day")} left to use it` })),
    h("span.r", {}, h("b.num", { text: money(iy.left, "GBP", 0) }), h("small", { text: "left" })), S.isa.said === false ? h("span.todo", { text: "Say what you've paid in so far" }) : allowBar(iy.used)));
  return [h("h3.label", {}, "Accounts"), h("div.list", {}, rows)];
}
// Your income, in a row: a year of dividends, the next one coming, and the year's shape
function incomePart() {
  const I = income();
  if (!I.total) return [];
  const next = I.events[0];
  return [h("h3.label", {}, "Income"), h("div.list", {}, h("button.item.two.rise", { type: "button", onclick: () => M.open.income() },
    h("span", {}, h("b", { text: "Dividends" }), h("small", { text: next ? `Next: about ${money(next.v, "GBP", 0)} in ${aroundMonth(next.at)}, from ${next.x.name}` : `From ${plural(I.payers.length, "holding")}` })),
    h("span.r", {}, h("b.num", { text: money(I.total, "GBP", 0) }), h("small", { text: "a year" })),
    h("div.mini", {}, incomeBars(I, -1, null, 26))))];
}
// Your year against the market, from your holdings' years and the market's (before its chart's been drawn): what you own
// now, as if held all year, with the dividends it paid, beside the first market's, with its
function vsQuick() {
  const b = S.years[BENCHES[0][0]], o = owned().filter((x) => S.years[x.symbol]?.first);
  if (!b?.first || !o.length) return null;
  let a0 = 0, a1 = 0;
  for (const x of o) { const y = S.years[x.symbol], k = x.qty * rate(S.q[x.symbol].cur); a0 += y.first * k; a1 += (y.last + (y.got12 ?? y.div12)) * k; }
  return { you: (a1 / a0 - 1) * 100, bench: ((b.last + (b.got12 ?? b.div12)) / b.first - 1) * 100, name: BENCHES[0][1] };
}
// Your year against the market, in a row
function vsPart() {
  const v = S.vs?.at && Date.now() - S.vs.at < 3600e3 ? S.vs : vsQuick(), gap = v ? v.you - v.bench : 0;
  return [h("h3.label", {}, "Against the market"), h("div.list", {}, h("button.item.two.rise", { type: "button", onclick: () => M.open.vs() },
    h("span", {}, h("b", { text: "Your year" }), h("small", { text: v ? `${fmt(Math.abs(gap), 1)} points ${gap >= 0 ? "ahead of" : "behind"} ${v.name}` : "Against the FTSE 100, the world and the S&P 500" })),
    h("span.r", {}, v ? h("b", { class: `num ${tone(v.you)}`, text: pct(v.you, 1) }) : icon("chev", 16, 2.4))))];
}
// One account: what's in it, worth what, and how it's done
function accountView(key) {
  const T = totals(), a = byAccount(T.o).find((x) => x.key === key) || { key, name: ACCOUNT_NAME[key] || "Not in an account", o: [], value: 0, day: 0 };
  const costed = a.o.filter((x) => x.cost != null), paid = costed.reduce((s, x) => s + paidFor(x), 0), divs = costed.reduce((s, x) => s + (divsOf(x) || 0), 0), gain = costed.reduce((s, x) => s + valueOf(x), 0) - paid + divs, iy = isaYear();
  return [h("div.shead", {}, h("small", { text: key === "isa" ? "Stocks & Shares ISA" : key === "sipp" ? "Pension (SIPP)" : key === "gia" ? "General account" : "Your holdings" }), closeBtn()),
    h("div.sname", { text: a.name }),
    h("div.sprice.num", { text: money(a.value) }),
    h("div.sdelta.num", {}, h("span", { class: tone(a.day), text: `${signed(a.day)} (${pct(a.value - a.day ? (a.day / (a.value - a.day)) * 100 : 0)})` }), h("span", { style: "color:var(--text-3)", text: "today" })),
    h("div.facts", {},
      costed.length ? h("div.fact", {}, h("span", { text: "Since you bought" }), h("b", { class: `num ${tone(gain)}`, text: signed(gain) }), h("i.num", { text: `${pct(paid ? (gain / paid) * 100 : 0, 1)} on ${money(paid, "GBP", 0)}${divs >= 0.5 ? `, with ${money(divs, "GBP", 0)} of dividends` : ""}` })) : null,
      key === "isa" && iy ? h("button.fact.press", { type: "button", onclick: () => pushSheet("isa") }, h("span", { text: `Allowance, ${iy.year}` }), h("b.num", { text: `${money(iy.left, "GBP", 0)} left` }), h("i.num", { text: `of ${money(iy.allowance, "GBP", 0)}` }), allowBar(iy.used)) : null),
    h("h3.slabel", { text: plural(a.o.length, "holding") }),
    h("div.list.flush", {}, [...a.o].sort((x, y) => valueOf(y) - valueOf(x)).map((x, i) => itemRow(x, i, "value", (s) => pushSheet("stock", s))))];
}
accountView.sheet = "mk-account";

// About these prices (S2-D7: the words from Markets' settings, app.js 2766-2769)
function aboutView() {
  return [h("div.shead", {}, h("small", { text: "About These Prices" }), closeBtn()),
    h("div.facts", {},
      h("div.fact", {}, h("span", { text: "Values in" }), h("b", { text: "Pounds" }), h("i", { text: "Holdings in other currencies at today's rate" })),
      h("div.fact", {}, h("span", { text: "Prices" }), h("b", { text: "Yahoo Finance" }), h("i", { text: "Up to 20 min behind" }))),
    h("p.hint", { text: "Markets shows prices and news to help you follow your money. It isn't financial advice." })];
}
aboutView.sheet = "mk-about";

export function openAccount(ctx, name) { return openSheet(accountView, name); }
export function openAbout(ctx) { return openSheet(aboutView); }

export function view(el, ctx) {
  const sec = el;
  const draw = (animate = true) => { keepFocus(() => sec.replaceChildren(h("div.mk-view", {}, holdingsView()))); afterDraw(sec, animate); };
  return {
    draw(animate) { redraw = () => draw(false); core.loadPaid(); draw(animate); },
    hide() { if (E.on && !ORDER.n) E.on = false; },
    destroy() { E.on = false; sec.replaceChildren(); redraw = () => {}; },
  };
}

export { holdingsView, mixSlices, mixRing, mixPart, statsPart, accountsPart, incomePart, vsQuick, vsPart, accountView, aboutView };
