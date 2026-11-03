// Adding a stock, and changing one you have (One roof stage 2, spec §2.1, §4.2, RI9): the add-stock sheet's results
// (before anything's typed, what you looked at last and rows to browse; as you type, what matches here at once, then
// Markets' own answer from GET /api/markets/search, each with its price and day and a + to follow it), and the holding
// sheet (how many you own, what you paid, when you bought, which account). The add-stock sheet itself and its field
// are markets.js's (made and focused in the tap); fill() gives it life once this file is in. Moved from markets/app.js
// (BROWSE :2502, marked :2510, follow :2515, addBtn :2527, dayOfQ :2529, searchView :2530, editView :2586). Loaded
// through fw.lazy (connector.lazy).
// fill(input, results, q) · editView(sym, o) · openHolding(ctx, sym, o).
import * as core from "./core.js";
import { h, M, toast, render, openSheet, pushSheet, closeSheet, drawSheet, closeBtn, backBtn, icon, Sheet } from "./mkui.js";

const { S, A, ACCOUNTS, SYM, TRUST_PICKS, KIND_SAID, fmt, money, pct, tone, kindOf, priceSaid, priceIn, penceMeant, plainSym, store, recent, loadYears, loadPaid, refresh } = core;

// Find something to add
// Find and Add. Before anything's typed: what you looked at last, and rows to browse (each with its price today). As
// you type: what matches in your list and those rows, at once, then the markets' own answer under them; each with its
// price and day, the letters typed shown bold, and a + to follow it in one tap (a tick once it's in your list).
// Return opens the first
const BROWSE = [
  ["Popular in the UK", [["SHEL.L", "Shell"], ["AZN.L", "AstraZeneca"], ["HSBA.L", "HSBC"], ["ULVR.L", "Unilever"], ["BP.L", "BP"], ["RR.L", "Rolls-Royce"], ["LLOY.L", "Lloyds"], ["TSCO.L", "Tesco"]]],
  ["Index funds", [["VWRL.L", "Vanguard All-World"], ["VUSA.L", "Vanguard S&P 500"], ["ISF.L", "iShares FTSE 100"], ["VUKE.L", "Vanguard FTSE 100"], ["VFEM.L", "Vanguard Emerging Markets"]]],
  ["Investment trusts", TRUST_PICKS],
  ["US tech", [["AAPL", "Apple"], ["NVDA", "Nvidia"], ["MSFT", "Microsoft"], ["GOOGL", "Alphabet"], ["AMZN", "Amazon"], ["META", "Meta"]]],
];
// the letters typed, bold where they are in a name
function marked(name, q) {
  const k = q ? name.toLowerCase().indexOf(q.toLowerCase()) : -1;
  return k < 0 ? [name] : [name.slice(0, k), h("mark", { text: name.slice(k, k + q.length) }), name.slice(k + q.length)];
}
// following one in a tap: added with none owned; the + turns to a tick
async function follow(sym, name, btn) {
  if (S.list.some((x) => x.symbol === sym)) return pushSheet("stock", sym, { name });
  btn.disabled = true;
  try {
    if (!(await core.follow(sym, name))) return;
    btn.classList.add("on"); btn.replaceChildren(icon("check", 15, 2.8)); btn.setAttribute("aria-label", `${name} is in your list`);
    navigator.vibrate?.(8);
    toast(`Following ${name}`);
  } catch (e) { toast(e.message, true); } finally { btn.disabled = false; }
}
const addBtn = (sym, name) => { const have = S.list.some((x) => x.symbol === sym), b = h("button.addb.press" + (have ? ".on" : ""), { type: "button", "aria-label": have ? `${name} is in your list` : `Follow ${name}` }, icon(have ? "check" : "plus", 15, 2.8));
  b.onclick = (e) => { e.stopPropagation(); follow(sym, name, b); }; return b; };
const dayOfQ = (sym) => { const q = S.q[sym]; return q?.price != null ? [h("b.num", { text: priceSaid(q) }), h("small", { class: `num ${tone(q.chgPct)}`, text: pct(q.chgPct) })] : [h("b.num.dimmed", { text: "–" })]; };
// the add-stock sheet given life: its field (made and focused by markets.js), its results, and q typed in already
function fill(input, results, q = "") {
  const open = (sym, name) => { recent.add(sym, name); pushSheet("stock", sym, { name }); };
  // one result: its name (what's typed, bold), what it is, its price and day, and a + to follow it
  const row = (x, q) => h("div.res", { "data-k": "result", "data-sym": x.symbol },
    h("button.resopen", { type: "button", onclick: () => open(x.symbol, x.name), "aria-label": x.name }),
    h("span.rn", {}, h("b", {}, marked(x.name, q)), h("small", { text: [plainSym(x.symbol), x.ex, KIND_SAID[x.kind]].filter(Boolean).join(" · ") })),
    h("span.rp", {}, dayOfQ(x.symbol)), addBtn(x.symbol, x.name));
  // a row to browse: cards across, each with its price today
  const card = ([sym, name], i) => h("div.bcard.glass.rise", { vars: { i: String(i) }, "data-k": "result", "data-sym": sym },
    h("button.resopen", { type: "button", onclick: () => open(sym, name), "aria-label": name }),
    h("b", { text: name }), h("small", { text: [plainSym(sym), S.q[sym]?.ex].filter(Boolean).join(" · ") }), h("span.bp", {}, dayOfQ(sym)), addBtn(sym, name));
  const start = () => {
    const rec = recent.get();
    return [
      rec.length ? h("div.browse", {}, h("h3", {}, "Recent", h("button", { type: "button", onclick: () => { store.del("recent"); results.replaceChildren(...start()); }, text: "Clear" })),
        h("div.list.flush", {}, rec.slice(0, 4).map((x) => row({ symbol: x.s, name: x.n, ex: S.q[x.s]?.ex, kind: S.q[x.s] ? kindOf(S.q[x.s]) : null }, "")))) : null,
      ...BROWSE.map(([title, list]) => h("div.browse", {}, h("h3", { text: title }), h("div.brow", {}, list.map(card))))].filter(Boolean);
  };
  results.replaceChildren(...start());
  // (the prices for what's to browse, and what was looked at last: asked for once, drawn in as they come)
  const want = [...new Set([...BROWSE.flatMap(([, l]) => l.map((x) => x[0])), ...recent.get().map((x) => x.s)])].filter((sym) => !S.q[sym]);
  if (want.length) A.quotes(want.slice(0, 64)).then((r) => { Object.assign(S.q, r.quotes); Object.assign(S.fx, r.rates); if (!input.value.trim() && results.isConnected) results.replaceChildren(...start()); }, () => {});
  // (what matches here already, before the markets answer: in your list first, then the rows)
  const local = (q) => {
    const k = q.toLowerCase(), pool = [...S.list.map((x) => [x.symbol, x.name]), ...BROWSE.flatMap(([, l]) => l)], seen = new Set();
    return pool.filter(([sym, name]) => (name.toLowerCase().includes(k) || plainSym(sym).toLowerCase().startsWith(k)) && !seen.has(sym) && seen.add(sym))
      .slice(0, 4).map(([sym, name]) => ({ symbol: sym, name, ex: S.q[sym]?.ex || "", kind: S.q[sym] ? kindOf(S.q[sym]) : null }));
  };
  let t = null, n = 0, shown = [];
  const draw = (list, q) => { shown = list; results.replaceChildren(h("div.list.flush", {}, list.map((x) => row(x, q)))); };
  input.addEventListener("input", () => {
    clearTimeout(t);
    const q = input.value.trim();
    if (!q) { shown = []; results.replaceChildren(...start()); return; }
    const mine = local(q);
    if (mine.length) draw(mine, q);
    t = setTimeout(async () => {
      const k = ++n;
      try {
        const r = await A.search(q);
        if (k !== n) return;
        const seen = new Set(), all = [...mine, ...r.results].filter((x) => !seen.has(x.symbol) && seen.add(x.symbol)).slice(0, 10);
        if (!all.length) { shown = []; results.replaceChildren(h("div.nores", {}, h("b", { text: `Nothing found for “${q}”` }), h("p", { text: "Check the spelling, or try its symbol (like RR or AAPL). For a fund, paste its ISIN from your broker (like GB00B41YBW71)." }))); return; }
        draw(all, q);
        // (their prices, for those that haven't one here yet)
        const need = all.map((x) => x.symbol).filter((sym) => !S.q[sym]);
        if (need.length) A.quotes(need).then((qr) => { Object.assign(S.q, qr.quotes); Object.assign(S.fx, qr.rates); if (k === n && results.isConnected) draw(all, q); }, () => {});
      } catch (e) { if (k === n) results.replaceChildren(h("p.hint", { text: e.message })); }
    }, 250);
  });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && shown[0]) { e.preventDefault(); open(shown[0].symbol, shown[0].name); } });
  if (q) { input.value = q; input.dispatchEvent(new Event("input")); }
}
// Adding one to your list, or changing how many you own and what you paid
function editView(sym, o = {}) {
  const held = S.list.find((x) => x.symbol === sym), q = S.q[sym], name = held?.name || o.name || q?.name || sym, cs = SYM[q?.cur] ?? "";
  const qty = h("input", { type: "text", inputmode: "decimal", id: "mk-qty", placeholder: "0", value: held?.qty ? String(held.qty) : "", "aria-label": "Shares you own" });
  const cost = h("input", { type: "text", inputmode: "decimal", id: "mk-cost", placeholder: q?.price ? fmt(q.price, 2).replace(/,/g, "") : "", value: held?.cost != null ? String(held.cost) : "", "aria-label": "What you paid per share" });
  // (when you bought it: for the dividends it's paid you since)
  const today = new Date().toLocaleDateString("en-CA");
  const since = h("input", { type: "date", id: "mk-since", max: today, value: held?.since ? new Date(held.since).toISOString().slice(0, 10) : "", "aria-label": "When you bought" });
  // (what you paid: for each, or in total, as your broker may say it; and what that comes to, said under it as you type,
  // asking where it looks like pence typed as pounds)
  const num = (s) => (s.trim() === "" ? null : Number(s.replace(/[,£$€\s]/g, "")));
  const curMoney = (v) => (cs ? money(v, q.cur) : `${fmt(v)} ${q?.cur || ""}`.trim());
  let per = "each", sure = false;
  const echo = h("p.echo", { id: "mk-echo", "aria-live": "polite" });
  const meant = () => (per === "each" ? penceMeant(priceIn(cost.value, q), q, cost.value) : null);
  const tell = () => {
    const n = num(qty.value) ?? 0, c = priceIn(cost.value, q), p = meant();
    sure = false;
    echo.replaceChildren(c == null || !Number.isFinite(c) || !(n > 0) ? "" : per === "each" ? `${curMoney(c * n)} in all, for ${fmt(n, n % 1 ? 2 : 0)} shares` : `${curMoney(c / n)} each`,
      p ? h("button.inline.mk-ml6", { type: "button", onclick: () => { cost.value = p; tell(); cost.focus(); }, text: `Did you mean ${p}?` }) : "");
  };
  const perSeg = h("div.per", { role: "group", "aria-label": "What you paid is" }, [["each", "Each"], ["total", "In total"]].map(([k, label]) => h("button", { type: "button", "data-k": k, "aria-pressed": String(k === per), text: label,
    onclick: () => {
      if (k === per) return;
      const n = num(qty.value) ?? 0, c = priceIn(cost.value, q);
      if (c != null && Number.isFinite(c) && n > 0) cost.value = String(k === "total" ? +(c * n).toFixed(2) : +(c / n).toFixed(4));
      per = k;
      perSeg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === per)));
      cost.setAttribute("aria-label", per === "each" ? "What you paid per share" : "What you paid in total");
      cost.placeholder = q?.price ? fmt(per === "each" ? q.price : q.price * (n || 1), 2).replace(/,/g, "") : "";
      tell();
    } })));
  qty.addEventListener("input", tell); cost.addEventListener("input", tell);
  tell();
  let acct = held?.account ?? null;
  const choice = h("div.choice", { role: "group", "aria-label": "Held in" }, ACCOUNTS.map(([k, n]) => h("button.press", { type: "button", "data-a": k, "aria-pressed": String(acct === k), text: n,
    onclick: (e) => { acct = acct === k ? null : k; choice.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.a === acct))); } })));
  const save = h("button.btn.go.press.mk-save", { type: "button", id: "mk-save" }, held ? "Save" : "Add to Your List");
  save.onclick = async () => {
    const n = num(qty.value) ?? 0, c0 = priceIn(cost.value, q), t = since.value ? Date.parse(since.value + "T12:00:00Z") : null;
    if (!Number.isFinite(n) || n < 0) return toast("How many you own should be a number.", true);
    if (c0 != null && (!Number.isFinite(c0) || c0 < 0)) return toast("What you paid should be a number.", true);
    if (c0 != null && per === "total" && !(n > 0)) return toast("Say how many shares you own, to work out what each cost.", true);
    // (pounds that look like pence: asked once, kept as typed if it's saved again)
    const p = meant();
    if (p && !sure) { sure = true; return toast(`Did you mean ${p}? Save again to keep ${curMoney(c0)} a share.`, true); }
    const c = c0 != null && per === "total" ? +(c0 / n).toPrecision(10) : c0;
    if (t != null && (!Number.isFinite(t) || t > Date.now() + 864e5)) return toast("Choose the day you bought it, as on a calendar.", true);
    save.disabled = true;
    try {
      const g = core.genNow(), r = await A.putHolding({ symbol: sym, name, qty: n, cost: c, account: acct, ...(held?.buys ? {} : { since: t }) });
      // (an answer for an account that's gone since: dropped)
      if (!core.mine(g)) return;
      S.list = r.holdings; S.news = null;
      toast(held ? "Saved" : `${name} added`);
      const back = Sheet.stack.length > 1 && Sheet.stack.at(-2)[0].sheet === "stock";
      await refresh(true);
      if (back) { Sheet.stack.pop(); drawSheet(); } else closeSheet();
      core.changed();
      loadYears(); loadPaid(true); S.inc = null;
    } catch (e) { toast(e.message, true); save.disabled = false; }
  };
  if (held?.buys) return [h("div.shead", {}, backBtn(), h("h2", { text: name }), closeBtn()),
    h("div.form", {}, h("label", { text: "Held in" }), choice),
    h("p.hint", { text: `How many you own (${fmt(held.qty, held.qty % 1 ? 2 : 0)}) and what each cost${held.cost != null ? ` (${q ? priceSaid(q, held.cost) : fmt(held.cost)} on average)` : ""} come from your buys and sales, on its page.` }), save];
  return [h("div.shead", {}, backBtn(), h("h2", { text: held ? name : `Add ${name}` }), closeBtn()),
    h("div.form", {},
      h("label", { for: "mk-qty", text: "Shares you own" }), h("div.field", {}, qty),
      h("div.lrow", {}, h("label", { for: "mk-cost", text: `What you paid${cs || !q?.cur ? "" : ` (${q.cur})`}` }), perSeg), h("div.field", {}, cs ? h("span.unit", { text: cs }) : null, cost), echo,
      h("label", { for: "mk-since", text: "When you bought" }), h("div.field", {}, since),
      h("label", { text: "Held in" }), choice),
    h("p.hint", { text: `Leave shares at 0 to just follow it. The rest is optional, for how you've done since you bought (dividends included) and each account's total.${q?.cur === "GBP" ? " A price in pence? Type it as 52p." : ""} Bought at different times? Record each buy on its page instead.` }), save];
}
editView.sheet = "holding";
export function openHolding(ctx, sym, o = {}) { return (Sheet.stack.length ? pushSheet : openSheet)(editView, sym, o); }
// (B0's stub name, kept: searchView fills the add-stock sheet markets.js makes)
export const searchView = fill;
export { BROWSE, marked, follow, addBtn, dayOfQ, fill, editView };
