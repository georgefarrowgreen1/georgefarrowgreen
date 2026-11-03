// Markets' money sheets (One roof stage 2, spec §2.1, §4.2): Income (what's coming month by month, what's paid you, the
// tax year with its allowance, what it pays on what you paid, where it could go, who pays, each tax year to keep),
// Against the Market (your year beside the FTSE 100's, the world's and the S&P 500's), the ISA's allowance, and What If
// (a stock's dividends on your year, on its page). Moved from markets/app.js (incomeView :1659 and its parts :1711-1806,
// whatIf :1807, vsView/vsDraw :1848-1921, isaView :1938). Loaded through fw.lazy (connector.lazy).
// openIncome(ctx), openIsa(ctx), openVs(ctx); whatIf(q, y) for stock.js.
import * as core from "./core.js";
import { project, csv } from "../income.js";
import { h, C, el, M, ring, toast, render, openSheet, pushSheet, backSheet, closeSheet, drawSheet, closeBtn, backBtn, incomeBars, allowBar, topView, Sheet } from "./mkui.js";

const { S, A, ACCOUNT_NAME, BENCHES, DIVIDEND_ALLOWANCE, fmt, money, pct, tone, plural, and2, rate, owned, valueOf, paidFor, totals, income, received, taxMonths, growthOf, gotAll, divHistory,
  monthSaid, aroundDay, isaYear, store, dayKey, loadYears, loadIncome, markDivs, health, taxYearOf, yearDivs, yearOn } = core;

// Your income: what's coming, month by month; what's paid you; the tax year, with its allowance; what it pays on what
// you paid; where it could go; who pays, and how dependably; and each tax year's payments, to keep
function incomeView() {
  const I = income();
  // (dividends asked for where they aren't here yet, and your income's history: once)
  if (!incomeView.asked && owned().some((x) => !S.years[x.symbol]?.divs)) { incomeView.asked = true; loadYears().then(() => { if (Sheet.stack.at(-1)?.[0] === incomeView) drawSheet(); }); }
  loadIncome();
  const mode = S.imode, have = !!S.inc;
  const sw = h("div.per.imode", { role: "group", "aria-label": "Show" }, [["coming", "Coming"], ["received", "Received"], ["tax", "Tax year"]].map(([k, label]) => h("button", { type: "button", "data-k": `im:${k}`, "aria-pressed": String(mode === k), text: label,
    onclick: () => { if (S.imode !== k) { S.imode = k; drawSheet(); } } })));
  const top = [h("div.shead", {}, h("small", { text: "Income" }), closeBtn()), sw];
  if (mode !== "coming" && !have) return [...top, loadIncome.failed && !loadIncome.busy
    ? h("p.hint", { style: "margin-top:18px" }, "Couldn't count what's been paid just now. ", h("button.inline", { type: "button", "data-k": "inc:again", onclick: () => { loadIncome(true); drawSheet(); }, text: "Try Again" }))
    : h("p.hint", { style: "margin-top:18px", text: "Counting what's been paid…" })];
  const R = mode === "received" ? received() : null, T = have ? taxMonths(I) : null, M = mode === "coming" ? I : mode === "received" ? R : T;
  const total = mode === "coming" ? I.total : mode === "received" ? R.total : T.paid + T.coming;
  // (the month first shown: the next with anything coming; the last that paid; this one)
  let chosen = mode === "coming" ? Math.max(0, M.months.findIndex((m) => m.total > 0)) : mode === "received" ? Math.max(0, M.months.findLastIndex((m) => m.total > 0)) : Math.max(0, M.months.findIndex((m) => m.d.getMonth() === new Date().getMonth()));
  const month = h("div", { "data-el": "imonth" }), say = h("p.why", { style: "margin-top:22px" });
  const dayMon = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const row = (e) => e.done || mode === "received"
    ? h("button.item.two.rise", { type: "button", onclick: () => pushSheet("stock", e.x.symbol) }, h("span", {}, h("b", { text: e.x.name }), h("small", { text: `Went ex-dividend ${dayMon(e.at)} · ${fmt(e.qty, e.qty % 1 ? 2 : 0)} ${e.qty === 1 ? "share" : "shares"}${e.special ? " · a one-off" : ""}` })), h("span.r", {}, h("b.num", { text: money(e.v) })))
    // (one whose day's been, with nothing paid yet, counted in this month: said as due, not as a day that's been)
    : h("button.item.two.rise", { type: "button", onclick: () => pushSheet("stock", e.x.symbol) }, h("span", {}, h("b", { text: e.x.name }), h("small", { text: +e.at < new Date().setHours(0, 0, 0, 0) ? `Ex-dividend due, was around ${dayMon(e.at)}` : `Goes ex-dividend around ${aroundDay(e.at)}` })), h("span.r", {}, h("b.num", { text: `about ${money(e.v)}` })));
  const pick = (i) => {
    chosen = i;
    bars.querySelectorAll(".ib").forEach((b, k) => b.setAttribute("aria-pressed", String(k === i)));
    const m = M.months[i], past = mode === "received" || (mode === "tax" && m.paid >= m.total - 0.005 && m.total > 0);
    // (this month's, where all that's in it is next year's: said as next year's)
    const later = mode === "coming" && m.items.length && m.items.every((e) => yearOn(e.at));
    say.replaceChildren(m.total > 0 ? `${past ? "" : "About "}${money(m.total, "GBP", 0)} in ${monthSaid(m.d, true)}${mode === "coming" ? (later ? ` ${m.items[0].at.getFullYear()}` : "") : ` ${m.d.getFullYear()}`}` : `Nothing ${mode === "received" ? "paid" : "expected"} in ${monthSaid(m.d, true)}`,
      h("small", { text: m.total > 0 ? `From ${and2([...new Set(m.items.map((e) => e.x.name))])}` : "Tap another month" }));
    month.replaceChildren(h("div.list.flush", {}, m.items.slice().sort((a, b) => b.v - a.v).map((e, k) => { const r = row(e); r.style.setProperty("--i", String(k)); return r; })));
  };
  const bars = incomeBars(M, chosen, pick, 120, mode === "tax" ? { est: (m) => m.paid < m.total / 2 } : {});
  pick(chosen);
  const head = mode === "coming" ? (I.total ? `${money(I.total, "GBP", 0)} a year` : "No dividends yet") : mode === "received" ? `${money(R.total, "GBP", 0)} in a year` : `${money(T.paid, "GBP", 0)} this tax year`;
  const sub = mode === "coming"
    ? (I.total ? `About ${money(I.total / 12, "GBP", 0)} a month on average, from ${plural(I.payers.length, "holding")}, at what each paid over the last year for what you own now.${I.specials.length ? ` One-offs left out: ${and2(I.specials.map((e) => `${money(e.v, "GBP", 0)} from ${e.x.name}`))}.` : ""}` : "None of what you own has paid a dividend in the last year.")
    : mode === "received" ? (R.from ? `${money(R.since, "GBP", 0)} since ${new Date(R.from).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}, on the shares you had each time one went ex-dividend. In pounds at today's rate.` : "Say when you bought each holding (on its page) to count what it's paid you.")
    : `${T.name}, so far. About ${money(T.paid + T.coming, "GBP", 0)} by 5 April, with what's still to come outlined.`;
  return [...top,
    h("div.sprice.num", { style: "margin-top:14px", text: head }),
    h("p.hint", { style: "margin-top:8px", text: sub }),
    ...(total || mode !== "coming" ? [h("div.ichart", {}, bars), mode === "tax" ? h("div.ilegend", {}, h("span", {}, h("i"), "Paid"), h("span", {}, h("i.est"), "To come")) : null, say, month] : []),
    ...(I.total ? yieldPart(I) : []),
    ...(T ? allowancePart(T) : []),
    ...(I.total ? [h("h3.slabel", { text: "Where it could go" }), planCard(I)] : []),
    ...(I.payers.length || I.none.length ? [h("h3.slabel", { text: "Who pays" }), h("div.list.flush", {}, I.payers.map((p, k) => payerRow(p, k, I)), I.none.map((x) => h("button.item.two", { type: "button", onclick: () => pushSheet("stock", x.symbol) },
      h("span", {}, h("b", { text: x.name }), h("small", { text: /\b(acc|accumulating|accumulation)\b/i.test(x.name) ? "Accumulation units: it reinvests inside the fund" : "No dividends in the last year" })), h("span.r", {}, h("b.flat-t", { text: "None" })))))] : []),
    ...exportPart(),
    h("p.hint", { text: "Expected from last year's dividends, in the month each went ex-dividend (it's paid a few weeks after); one-offs are left out. Amounts and dates can change, and ones paid in dollars are shown in pounds at today's rate." })];
}
// what it pays on what it's worth, and on what you paid
function yieldPart(I) {
  const T = totals(), costed = I.payers.filter((p) => p.x.cost != null), paidIn = costed.reduce((a, p) => a + paidFor(p.x), 0), fromCosted = costed.reduce((a, p) => a + p.year, 0);
  const stat = (label, v, sub) => h("div.stat", {}, h("small", { text: label }), h("b.num", { text: v }), h("span", { text: sub }));
  return [h("h3.slabel", { text: "What it pays you" }), h("div.stats.flush", {},
    stat("Yield, at today's prices", T.value ? `${fmt((I.total / T.value) * 100, 1)}%` : "–", `on the ${money(T.value, "GBP", 0)} it's all worth`),
    paidIn ? stat("On what you paid", `${fmt((fromCosted / paidIn) * 100, 1)}%`, `on the ${money(paidIn, "GBP", 0)} you put in`) : stat("On what you paid", "–", "Say what you paid on each one's page"))];
}
// the tax year's dividend allowance: what outside an ISA or pension has used of it
function allowancePart(T) {
  const used = Math.min(1, T.outside / DIVIDEND_ALLOWANCE), soon = Math.min(1 - used, T.outsideComing / DIVIDEND_ALLOWANCE);
  return [h("h3.slabel", { text: `Dividend allowance, ${T.name}` }),
    h("div.irow", {}, h("b.num", { text: `${money(T.outside, "GBP", 0)} of ${money(DIVIDEND_ALLOWANCE, "GBP", 0)} used` }), h("small", { text: T.outsideComing >= 0.5 ? `about ${money(T.outside + T.outsideComing, "GBP", 0)} by 5 April` : `${money(Math.max(0, DIVIDEND_ALLOWANCE - T.outside), "GBP", 0)} left` })),
    h("div.allow2", {}, h("i", { style: `width:${used * 100}%` }), h("i.soon", { style: `width:${soon * 100}%` })),
    h("p.ismall", { text: `Dividends outside an ISA or pension count towards it; in one they're tax-free${T.inside >= 0.5 ? ` (${money(T.inside, "GBP", 0)} so far)` : ""}. Counted by when each went ex-dividend: it's paid, and taxed, a few weeks after.` })];
}
// a payer, and how dependable it's been
function payerRow(p, k, I) {
  const r = health(divHistory(p.x.symbol)), tags = [];
  if (r?.raised >= 2) tags.push(["up", `Raised ${r.raised} years running`]);
  else if (r?.held >= 3) tags.push(["", `No cut in ${r.held} years`]);
  if (r?.cut) tags.push(["warn", `Cut in ${r.cut}`]);
  if (r?.growth != null && Math.abs(r.growth) >= 0.005) tags.push(["", `${r.growth > 0 ? "+" : "−"}${fmt(Math.abs(r.growth) * 100, 1)}% a year over 5 years`]);
  for (const e of I.specials.filter((e) => e.x === p.x)) tags.push(["warn", `One-off ${money(e.v, "GBP", 0)} in ${monthSaid(e.at, true)}, left out`]);
  return h("button.item.two.rise", { type: "button", vars: { i: String(k) }, onclick: () => pushSheet("stock", p.x.symbol) },
    h("span", {}, h("b", { text: p.x.name }), h("small", { text: `${p.yld != null ? `Yield ${fmt(p.yld, 1)}% · ` : ""}${plural(p.n, "payment")} a year · ${p.x.account ? ACCOUNT_NAME[p.x.account] : "Not in an account"}` }),
      tags.length ? h("span.ichips", {}, tags.map(([c, t]) => h(c ? `span.ichip.${c}` : "span.ichip", { text: t }))) : null),
    h("span.r", {}, h("b.num", { text: money(p.year, "GBP", 0) }), h("small", { text: `${Math.round((p.year / I.total) * 100)}%` })));
}
// Where it could go: a monthly income to aim for, how far along you are, and twenty years ahead, reinvesting or not
function planCard(I) {
  const T = totals(), g = growthOf(I), growth = g ?? 0.03, y = T.value ? I.total / T.value : 0, year0 = new Date().getFullYear();
  const ring = h("span.gring"), head = h("b"), sub = h("small"), goalSaid = h("span"), addSaid = h("span"), chart = h("div.proj"), out = h("p.out"), note = h("p.ismall");
  const update = () => {
    const P = project({ worth: T.value, yield: y, growth, add: S.add, reinvest: S.reinvest, goal: S.goal * 12 }), now = I.total / 12;
    goalSaid.textContent = `${money(S.goal, "GBP", 0)} a month`; addSaid.textContent = money(S.add, "GBP", 0);
    ring.replaceChildren(ringSvg(now / S.goal));
    head.textContent = `${money(now, "GBP", 0)} of ${money(S.goal, "GBP", 0)} a month`;
    sub.textContent = `${Math.round(Math.min(1, now / S.goal) * 100)}% of your goal, at today's yield`;
    chart.replaceChildren(projSvg(P, S.goal * 12, year0));
    out.textContent = P.reach === 0 ? "You're there already." : P.reach != null ? `About ${money(S.goal, "GBP", 0)} a month by ${year0 + P.reach}, in ${plural(P.reach, "year")}.` : "Not within 60 years like this. Try adding more each month.";
    note.textContent = `${S.reinvest ? "" : `Paid to you over 20 years: about ${money(P.cash, "GBP", 0)}. `}Assumes today's yield (${fmt(y * 100, 1)}%), and that dividends and prices grow ${fmt(growth * 100, 1)}% a year${g != null ? ", as your holdings' dividends have over five years" : " (there's too little history to go on)"}. Before inflation and tax.`;
    store.set("plan", { goal: S.goal, add: S.add, reinvest: S.reinvest });
  };
  const knob = (id, label, said, key, min, max, step) => h("div.knob", {}, h("label", { for: id }, label, said),
    h("input", { id, type: "range", min: String(min), max: String(max), step: String(step), value: String(S[key]), oninput: (e) => { S[key] = +e.target.value; update(); } }));
  const sw = h("div.per", { role: "group", "aria-label": "Dividends" }, [[true, "Reinvest"], [false, "Take as cash"]].map(([v, label]) => h("button", { type: "button", "aria-pressed": String(S.reinvest === v), text: label,
    onclick: () => { S.reinvest = v; sw.querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-pressed", String((i === 0) === v))); update(); } })));
  update();
  return h("div.plan", { "data-el": "plan" }, h("div.goal", {}, ring, h("span", {}, head, sub)),
    knob("igoal", "Your goal", goalSaid, "goal", 25, 1000, 25), knob("iadd", "Adding each month", addSaid, "add", 0, 1500, 50),
    h("div.knob.inline", {}, h("span", { text: "Dividends" }), sw), chart, out, note);
}
const ringSvg = (f) => ring(f);
// twenty years of a year's income, drawn to scale, with the goal across it
function projSvg(P, goal, year0) {
  const W = 320, H = 150, l = 40, r = 8, t = 14, b = 22, top = Math.max(...P.income, goal) * 1.08;
  const step = [50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000, 200000, 250000, 500000].find((v) => v * 2 >= top) || Math.ceil(top / 2), ymax = step * 2;
  const X = (i) => l + (i / 20) * (W - l - r), Y = (v) => t + (1 - v / ymax) * (H - t - b), k = (v) => (v >= 1000 ? `£${fmt(v / 1000, v % 1000 ? 1 : 0)}k` : money(v, "GBP", 0));
  const txt = (x, y, said, anchor) => { const e = C.el("text", { x, y, "text-anchor": anchor }); e.textContent = said; return e; };
  const s = C.el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `A year's dividends, ${year0} to ${year0 + 20}` });
  for (const v of [0, step, ymax]) s.append(C.el("line", { class: "pg", x1: l, x2: W - r, y1: Y(v), y2: Y(v) }), txt(l - 6, Y(v) + 3.5, k(v), "end"));
  const line = P.income.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
  s.append(C.el("path", { class: "pa", d: `${line} L${X(20)} ${Y(0)} L${X(0)} ${Y(0)} Z` }), C.el("path", { class: "pl", d: line }));
  s.append(C.el("line", { class: "pgoal", x1: l, x2: W - r, y1: Y(goal), y2: Y(goal) }), txt(W - r, Y(goal) - 5, `Goal ${k(goal)} a year`, "end"));
  if (P.reach != null && P.reach <= 20) s.append(C.el("circle", { class: "pdot", r: 4.5, cx: X(P.reach), cy: Y(P.income[P.reach]) }));
  for (const i of [0, 10, 20]) s.append(txt(X(i), H - 6, String(year0 + i), i === 0 ? "start" : i === 20 ? "end" : "middle"));
  return s;
}
// each tax year's dividends, as a spreadsheet to keep (the last whole one, and this one so far)
function exportPart() {
  const got = gotAll(), ty = taxYearOf(), last = taxYearOf(ty.from - 864e5);
  const years = [[last, `The ${last.name} tax year`], [ty, `${ty.name}, so far`]].filter(([y]) => got.some((e) => +e.at >= y.from && +e.at < y.to));
  if (!years.length) return [];
  return [h("h3.slabel", { text: "For your tax return" }), h("div.list.flush", {}, years.map(([y, label]) => h("button.item.two", { type: "button", onclick: () => keepFile(`dividends-${y.name}.csv`, yearCsv(got, y)) },
    h("span", {}, h("b", { text: label }), h("small", { text: "Each dividend, its holding and account, as a spreadsheet" })), h("span.r", {}, h("b.tint-t", { text: "CSV" }))))),
    h("p.ismall", { text: "Dated when each went ex-dividend; your broker's statements say when each was paid." })];
}
function yearCsv(got, y) {
  const rows = [["Went ex-dividend", "Holding", "Symbol", "Account", "Shares", "Per share", "Currency", "Amount", "In pounds, at today's rate", "One-off"]];
  for (const e of got) if (+e.at >= y.from && +e.at < y.to) rows.push([e.at.toLocaleDateString("en-CA"), e.x.name, e.x.symbol, e.x.account ? ACCOUNT_NAME[e.x.account] : "Not in an account", +e.qty.toFixed(6), +e.amount.toFixed(6), e.cur, +(e.amount * e.qty).toFixed(2), +e.v.toFixed(2), e.special ? "Yes" : ""]);
  return csv(rows);
}
// a file of the app's own, to keep: offered to share where the phone can (an iPhone's way to save one), else downloaded
async function keepFile(name, text, type = "text/csv") {
  const file = new File([text], name, { type });
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e?.name === "AbortError") return; } }
  const a = h("a", { href: URL.createObjectURL(file), download: name });
  M.root.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
// If you bought some of one: what a year of its dividends would add (at what it paid over the last year, one-offs aside)
// and when, drawn on your own year, and whether it pays when nothing else does
function whatIf(q, y) {
  const box = h("div.whatif", { "data-el": "whatif" }), r = rate(q.cur), one = new Set(markDivs(y.divs).filter((d) => d.special).map((d) => d.t)), now = new Date(), y0 = now.getFullYear(), m0 = now.getMonth();
  const draw = () => {
    const shares = S.buyAmt / (q.price * r), add = Array(12).fill(0), I = income();
    for (const d of yearDivs(y.divs, now / 1000)) {
      if (one.has(d.t)) continue;
      const at = new Date(d.t * 1000); at.setFullYear(at.getFullYear() + 1);
      let k = (at.getFullYear() - y0) * 12 + at.getMonth() - m0; if (k >= 12) k -= 12;
      add[Math.max(0, k)] += d.amount * shares * r;
    }
    const per = add.reduce((a, v) => a + v, 0), when = I.months.map((m, i) => (add[i] ? monthSaid(m.d) : null)).filter(Boolean), gaps = I.months.map((m, i) => (add[i] && !m.total ? monthSaid(m.d) : null)).filter(Boolean);
    const said = !I.total ? `In ${and2(when)}.` : gaps.length === when.length ? `In ${and2(when)}, when nothing comes now.` : gaps.length ? `In ${and2(when)}: ${and2(gaps)} when nothing comes now.` : `In ${and2(when)}, beside what you have.`;
    box.replaceChildren(h("div.whead", {}, h("span", { text: "If you bought" }), h("div.per", { role: "group", "aria-label": "How much" }, [500, 1000, 5000].map((v) => h("button", { type: "button", "aria-pressed": String(S.buyAmt === v), text: money(v, "GBP", 0), onclick: () => { S.buyAmt = v; draw(); } })))),
      h("b.num", { text: `About ${money(per, "GBP", 0)} a year` }),
      h("p", { text: `${said}${I.total ? ` Your year would go from ${money(I.total, "GBP", 0)} to about ${money(I.total + per, "GBP", 0)}.` : ""}` }),
      h("div.mini", {}, incomeBars(I, -1, null, 30, { add })));
  };
  draw();
  return box;
}

// Your year against the market: what you own now, as if held all year (at today's exchange rates), its value through
// the year beside a market's, both from where they started; the market changed with a tap, the lines reshaping to it
function vsView() {
  const box = h("div.chartbox.vsbox.loading", { "data-el": "vsbox" }), say = h("p.why", { "data-el": "vssay" }, h("span", { style: "opacity:.35", text: "Working out your year…" }));
  const big = h("div.sprice.num", { style: "margin-top:14px", text: "–" });
  const seg = h("div.seg.thirds", { role: "group", "aria-label": "Against" }, h("span.sl"), BENCHES.map(([sym, name], i) => h("button", { type: "button", "aria-pressed": String(i === 0), "data-b": sym, text: name === "the world" ? "World" : name })));
  const legend = h("div.vslegend", {}, h("span.you", {}, h("i"), "You"), h("span.mk", {}, h("i"), h("b", { "data-el": "vsname", text: BENCHES[0][1] })));
  requestAnimationFrame(() => { if (box.isConnected) vsDraw(box, seg, big, say); });
  return [h("div.shead", {}, h("small", { text: "Against the market · this year" }), closeBtn()), big,
    h("div.sdelta", {}, h("span", { style: "color:var(--text-3)", text: "your year, on what you own now" })), box, legend, seg, say,
    h("p.hint", { text: "As if you'd held what you own now all year, at today's exchange rates, with the dividends it paid. Each market is followed through a fund that tracks it (iShares' FTSE 100, Vanguard's All-World, SPDR's S&P 500), with its dividends too." })];
}
async function vsDraw(box, seg, big, say) {
  const o = owned(), W = () => box.clientWidth || 390, H = 210, N = 120;
  const get = async (sym) => { const k = `${sym}:1y`, kept = S.charts.get(k); if (kept && Date.now() - kept.at < 600e3) return kept.c; const c = await A.chart(sym, "1y"); S.charts.set(k, { at: Date.now(), c }); return c; };
  const charts = {};
  try {
    const syms = [...o.map((x) => x.symbol), ...BENCHES.map((b) => b[0])];
    for (let i = 0; i < syms.length; i += 6) await Promise.all(syms.slice(i, i + 6).map((s) => get(s).then((c) => { charts[s] = c; }, () => {})));
  } catch (_) {}
  if (!box.isConnected) return;
  box.classList.remove("loading");
  const held = o.filter((x) => charts[x.symbol]?.c?.length > 1);
  if (!held.length) { say.replaceChildren("Couldn't work out your year just now. Try again in a minute."); return; }
  // (the days, across every market; each price carried over the days its market was shut; and its dividends added from
  // the day each went ex-dividend, as cash, a share's)
  const days = [...new Set(held.flatMap((x) => charts[x.symbol].t.map(dayKey)))].sort();
  const along = (c) => {
    const m = new Map(c.t.map((t, i) => [dayKey(t), c.c[i]])), divs = (c.divs || []).map((d) => [dayKey(d.t), d.amount]).filter(([k]) => k > days[0]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    let last = c.c[0], paid = 0, j = 0;
    // (one gone ex-dividend since the last price there is, counted at the end)
    return days.map((d, i) => { if (m.has(d)) last = m.get(d); while (j < divs.length && (divs[j][0] <= d || i === days.length - 1)) paid += divs[j++][1]; return last + paid; });
  };
  const value = days.map(() => 0);
  for (const x of held) { const r = rate(S.q[x.symbol].cur), p = along(charts[x.symbol]); p.forEach((v, i) => { value[i] += v * x.qty * r; }); }
  const you = value.map((v) => (v / value[0] - 1) * 100);
  const svg = C.el("svg", { viewBox: `0 0 ${W()} ${H}`, preserveAspectRatio: "none", role: "img", "aria-label": "Your year against the market" });
  const base = C.el("line", { class: "base", x1: 0, x2: W(), "vector-effect": "non-scaling-stroke" });
  const mk = C.el("path", { class: "line mkline", "vector-effect": "non-scaling-stroke" }), yl = C.el("path", { class: "line", "vector-effect": "non-scaling-stroke" });
  svg.append(base, mk, yl); box.append(svg);
  let shown = null, cur = null;
  const show = async (bsym, first) => {
    const c = charts[bsym], name = BENCHES.find((b) => b[0] === bsym)[1];
    const bench = c?.c?.length > 1 ? along(c).map((v, i, a) => (v / a[0] - 1) * 100) : days.map(() => 0);
    const w = W(), all = [...you, ...bench, 0], lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1, pad = 26;
    const y = (v) => pad + (H - 2 * pad) * (1 - (v - lo) / span), at = (vals) => C.resample(vals, N).map((v, i) => [(i / (N - 1)) * w, y(v)]);
    const target = { you: at(you), mk: at(bench) };
    svg.setAttribute("viewBox", `0 0 ${w} ${H}`); base.setAttribute("x2", w); base.setAttribute("y1", y(0)); base.setAttribute("y2", y(0));
    yl.style.stroke = you.at(-1) >= 0 ? "var(--up)" : "var(--down)";
    const draw = (p, q) => { yl.setAttribute("d", C.smooth(p)); mk.setAttribute("d", C.smooth(q)); };
    if (!shown || first) { draw(target.you, target.mk); C.drawIn(yl, 0.15, 1.3); mk.style.opacity = "0"; requestAnimationFrame(() => { mk.style.transition = "opacity 0.9s ease 0.6s"; mk.style.opacity = "1"; }); }
    else { const from = shown; await C.tween([...from.you, ...from.mk], [...target.you, ...target.mk], 700, (p) => draw(p.slice(0, N), p.slice(N))); }
    shown = target; cur = { bench, name };
    const yv = you.at(-1), bv = bench.at(-1), gap = yv - bv;
    big.className = `sprice num ${tone(yv)}`; big.textContent = pct(yv, 1);
    const nm = el("vsname"); if (nm) nm.textContent = name === "the world" ? "World" : name;
    say.replaceChildren(`You're ${yv >= 0 ? "up" : "down"} ${fmt(Math.abs(yv), 1)}% over the year with dividends, and ${name} is ${bv >= 0 ? "up" : "down"} ${fmt(Math.abs(bv), 1)}%: ${Math.abs(gap) < 0.05 ? "level with it" : `${fmt(Math.abs(gap), 1)} points ${gap >= 0 ? "ahead" : "behind"}`}.`,
      h("small", { text: held.length < o.length ? `From ${plural(held.length, "holding")} of your ${o.length} with a year's prices` : held.length === 1 ? "From your one holding" : `From all ${held.length} of your holdings` }));
    S.vs = { at: Date.now(), you: yv, bench: bv, name };
  };
  C.scrubber(box, (x, w) => {
    if (!cur) return null;
    const i = Math.max(0, Math.min(days.length - 1, Math.round((x / w) * (days.length - 1)))), k = Math.round((i / Math.max(1, days.length - 1)) * (N - 1));
    const when = new Date(days[i] + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    return { x: shown.you[k][0], y: shown.you[k][1], label: `You ${pct(you[i], 1)} · ${cur.name === "the world" ? "World" : cur.name} ${pct(cur.bench[i], 1)} · ${when}` };
  });
  seg.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-b]");
    if (!b || b.getAttribute("aria-pressed") === "true") return;
    const i = [...seg.querySelectorAll("button")].indexOf(b);
    seg.querySelector(".sl").style.transform = `translateX(${i * 100}%)`;
    seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    show(b.dataset.b);
  });
  await show(BENCHES[0][0], true);
}
// The ISA's allowance: what you've paid in this tax year, and what's left
function isaView() {
  const iy = isaYear() || { year: "", paid: 0, allowance: 20000, left: 20000, days: 0, used: 0 };
  const paid = h("input", { type: "text", inputmode: "decimal", id: "mk-isa", placeholder: "0", value: iy.paid ? String(iy.paid) : "", "aria-label": "Paid in this tax year" });
  const inIsa = owned().filter((x) => x.account === "isa"), worth = inIsa.reduce((a, x) => a + valueOf(x), 0);
  const save = h("button.btn.go.press", { type: "button", style: "width:100%;margin-top:26px", id: "mk-isa-save" }, "Save");
  save.onclick = async () => {
    const v = paid.value.trim() === "" ? 0 : Number(paid.value.replace(/[,£\s]/g, ""));
    if (!Number.isFinite(v) || v < 0) return toast("What you've paid in should be a number.", true);
    save.disabled = true;
    try { S.isa = (await A.setIsa(v)).isa; toast("Saved"); if (Sheet.stack.length > 1) backSheet(); else closeSheet(); core.changed(); }
    catch (e) { toast(e.message, true); save.disabled = false; }
  };
  return [h("div.shead", {}, backBtn(), h("small", { text: `ISA allowance · ${iy.year}` }), closeBtn()),
    h("div.sprice.num", { style: "margin-top:14px", text: iy.left > 0 ? `${money(iy.left, "GBP", 0)} left` : "All used" }),
    h("p.why", { style: "margin-top:6px" }, `Of your ${money(iy.allowance, "GBP", 0)} for this tax year, with ${plural(iy.days, "day")} to use it: it ends on 5 April, and what's left doesn't carry over.`),
    allowBar(iy.used),
    inIsa.length ? h("div.facts", {}, h("div.fact", {}, h("span", { text: "In your ISA now" }), h("b.num", { text: money(worth) }), h("i", { text: plural(inIsa.length, "holding") }))) : null,
    h("div.form", {}, h("label", { for: "mk-isa", text: "Paid in so far this tax year" }), h("div.field", {}, h("span.unit", { text: "£" }), paid)),
    h("p.hint", { text: "What you've put in, not what it's grown to. Money moved in from past years' ISAs doesn't count. It starts again on 6 April." }), save];
}
incomeView.sheet = "income";
vsView.sheet = "vs";
isaView.sheet = "isa";
// (drawn again when your income's history comes in, if the Income sheet is the one showing)
core.on("settings", (d) => { if (d?.keys?.includes("inc") && topView() === incomeView) drawSheet(); });

export function openIncome(ctx) { return openSheet(incomeView); }
export function openIsa(ctx) { return openSheet(isaView); }
export function openVs(ctx) { return openSheet(vsView); }

export { incomeView, yieldPart, allowancePart, payerRow, planCard, ringSvg, projSvg, exportPart, yearCsv, keepFile, whatIf, vsView, vsDraw, isaView };
