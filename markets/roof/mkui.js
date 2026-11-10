// Markets' adapter onto InFlite's framework (One roof stage 2, spec §4.1, §4.2, S2-D3, BB2): app.js's helper names
// (h, icon, openSheet, pushSheet, backSheet, drawSheet, closeSheet, toast, render, go, keepFocus, paint) over fw, so the
// views move across from markets/app.js with little more than their imports changed. Markets' pieces that every section
// draws with (sparkCard, mixBar, vbars, range52, allowBar, incomeBars, the insight pictures) are here too.
//
// M (set by markets.js at mount, let go at unmount): { fw, root (div.m-markets), open (ctx.open: the sheet openers),
//   views ({ name: () => Promise<view> }, the lazy files' views, for a sheet pushed from another file) }.
// Sheets: app.js's one stack of views (Sheet.stack: [[view, args]]) drawn into one framework sheet (fw.sheet.open);
//   a view's own head (div.shead) gives the sheet's h2 its words and goes (the framework's head has ✕ and ‹); the
//   dialog's data-sheet is the name of the top view that has one (view.sheet: stock, add-stock, holding, income, isa,
//   vs, story, mk-account, mk-about); pushed pages without one (Alert Me, a buy) keep the one under them. A view may be
//   given by its name ("stock"), loaded through M.views first.
// The DOM: only the module's root, its sheet and what they made (S2-D3). Elements app.js found by id are found by
// data-el inside them ($('[data-el="pd"]')); nothing here looks in document.
import * as C from "../charts.js";
import * as core from "./core.js";

const { S } = core;
export { C };
// (B0's stub names, kept: CHARTS = charts.js, bind = init, chart = a chart read with a finger, ring = a goal's ring)
export const CHARTS = C;
let owner = 0;
export const M = { fw: null, root: null, open: {}, views: {}, current: () => () => true };
export function init(fw, root, open, views, current = () => () => true) { owner++; Object.assign(M, { fw, root, open, views, current }); }
export function cashContext() {
  return { h, state: core.S, money: core.money, fmt: core.fmt, accounts: core.ACCOUNTS,
    open: (id) => M.open.cash(id), save: core.cashStore.save, remove: core.cashStore.remove,
    current: () => { const g = core.genNow(); return () => core.mine(g); }, close: closeSheet, toast };
}
export const bind = (...a) => init(...a);
export const chart = (box, at) => C.scrubber(box, at);
export function ring(f) {
  const c = 2 * Math.PI * 22, s = C.el("svg", { viewBox: "0 0 56 56", width: 56, height: 56, "aria-hidden": "true" });
  s.append(C.el("circle", { class: "rbg", cx: 28, cy: 28, r: 22 }), C.el("circle", { class: "rfg", cx: 28, cy: 28, r: 22, "stroke-dasharray": c.toFixed(1), "stroke-dashoffset": (c * (1 - Math.max(0, Math.min(1, f)))).toFixed(1), transform: "rotate(-90 28 28)" }));
  return s;
}
export function release() { owner++; Object.assign(M, { fw: null, root: null, open: {}, views: {}, current: () => () => false }); Sheet.stack = []; Sheet.handle = null; Sheet.body = null; Sheet.say = null; }

// ---- building (app.js 821-838) ----
export function h(sel, attrs = {}, ...kids) {
  const m = /^([a-z0-9]+)((?:[.#][\w-]+)*)$/i.exec(sel), e = M.root.ownerDocument.createElement(m[1]);
  for (const part of m[2].match(/[.#][\w-]+/g) || []) part[0] === "." ? e.classList.add(part.slice(1)) : (e.dataset.el = part.slice(1));
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "text") e.textContent = v;
    // (no style strings: classes in markets.css, and a figure a drawing needs as a custom property through vars)
    else if (k === "style") throw new Error("h: never style");
    else if (k === "vars") for (const [n, x] of Object.entries(v)) e.style.setProperty("--" + n, x);
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat(9)) if (k != null && k !== false) e.append(k?.nodeType ? k : String(k));
  return e;
}
// (InFlite's glyphs through the framework's icon, and Markets' own few drawn here; size through --ic)
const GLYPHS_MK = { check: "m5 12.5 4.5 4.5L19 7", up: "m6 15 6-6 6 6", down: "m6 9 6 6 6-6" };
export function icon(name, size = 18, w = 2.2) {
  if (GLYPHS_MK[name]) {
    const s = C.el("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": w, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" });
    s.append(C.el("path", { d: GLYPHS_MK[name] }));
    return s;
  }
  const s = M.fw.ui.icon(name);
  s.classList.add("mk-ic");
  s.style.setProperty("--ic", `${size}px`);
  return s;
}
// a lookup inside the module's root, then its open sheet (never document)
export const $ = (sel) => M.root?.querySelector(sel) || Sheet.handle?.el?.querySelector(sel) || null;
export const el = (k) => $(`[data-el="${k}"]`);

// ---- the sheet: one stack of Markets' views in one framework sheet (app.js 2172-2216) ----
export const Sheet = { stack: [], handle: null, body: null, say: null };
const resolve = (v) => {
  const mine = owner, valid = M.current(), current = () => mine === owner && valid();
  return M.views[v]().then((view) => current() ? view : null, (error) => { if (current()) throw error; return null; });
};
const named = () => { for (let i = Sheet.stack.length - 1; i >= 0; i--) if (Sheet.stack[i][0].sheet) return Sheet.stack[i][0].sheet; return "stock"; };
function frame(view) {
  const say = h("p.vh", { "aria-live": "polite", "data-el": "sheet-say" }), body = h("div.mk-sheet");
  const hd = M.fw.sheet.open({
    sheet: view.sheet || "stock", title: "Markets", body: (b) => b.append(body, say),
    onClose: () => {
      if (Sheet.handle !== hd) return;
      Sheet.stack = []; Sheet.handle = null; Sheet.body = null; Sheet.say = null;
      core.sheetIs(false);
      core.stockOpen(null);
      core.emit("list");
    },
  });
  // (‹ in the framework's head: a step back in Markets' own stack)
  hd.el.querySelector(".ifs-back")?.addEventListener("click", () => backSheet());
  Object.assign(Sheet, { handle: hd, body, say });
  core.sheetIs(true);
}
function focusSheet() {
  const view = Sheet.stack.at(-1)?.[0], d = Sheet.handle?.el;
  if (!d) return;
  const f = (view?.focus && Sheet.body.querySelector(view.focus)) || d.querySelector(".ifs-head h2");
  f?.focus?.({ preventScroll: true });
}
// open(view, …args): a sheet of its own (one already up shows it instead); pushSheet: on top, ‹ back to the one under
export function openSheet(view, ...args) {
  if (typeof view === "string") return resolve(view).then((v) => v ? openSheet(v, ...args) : null);
  Sheet.stack = [[view, args]];
  if (!Sheet.handle || Sheet.handle.closed) frame(view);
  drawSheet();
  focusSheet();
  return Sheet.handle;
}
export function pushSheet(view, ...args) {
  if (typeof view === "string") return resolve(view).then((v) => v ? pushSheet(v, ...args) : null);
  if (!Sheet.handle || Sheet.handle.closed) return openSheet(view, ...args);
  Sheet.stack.push([view, args]);
  drawSheet();
  focusSheet();
  return Sheet.handle;
}
export function backSheet() { Sheet.stack.pop(); if (!Sheet.stack.length) return closeSheet(); drawSheet(); focusSheet(); }
export function drawSheet() {
  const top = Sheet.stack.at(-1);
  if (!top || !Sheet.body) return;
  const [view, args] = top, d = Sheet.handle.el;
  keepFocus(() => Sheet.body.replaceChildren(...[view(...args)].flat(9).filter(Boolean)), d);
  const sh = Sheet.body.querySelector(".shead"), h2 = d.querySelector(".ifs-head h2");
  if (sh) { if (h2) h2.textContent = sh.querySelector("h2, small")?.textContent || "Markets"; sh.remove(); }
  d.dataset.sheet = named();
  d.classList.toggle("pushed", Sheet.stack.length > 1);
  Sheet.body.querySelectorAll("h2, .sname").forEach((e) => e.setAttribute("tabindex", "-1"));
  if (Sheet.handle.body) Sheet.handle.body.scrollTop = 0;
}
export function closeSheet() { const hd = Sheet.handle; Sheet.stack = []; hd?.close(); }
// (the views' own ✕ and ‹ go with their head: the framework's sheet has its own)
export const closeBtn = () => null;
export const backBtn = () => null;
// the top view, and the symbol it's for (its first argument)
export const topView = () => Sheet.stack.at(-1)?.[0] || null;
export const topArg = () => Sheet.stack.at(-1)?.[1]?.[0];

// ---- said and drawn again ----
// (said inside an open sheet too: a reader there hears nothing outside it; bad: said all the same, as the framework's toast)
export function toast(msg, bad = false) {
  if (Sheet.say) Sheet.say.textContent = msg;
  M.fw?.toast(msg, bad ? { tone: "bad" } : undefined);
}
// app.js's render(): the section showing drawn again (markets.js redraws on "list")
export const render = () => core.emit("list");
export const go = (sec) => M.fw?.nav.section(sec);
export const openStock = (sym, o = {}) => M.open.stock?.(sym, o);
// Something drawn again under you, your place kept: what had the keyboard has it again, found by its data-el or data-k
// (or, where that's gone, the control it came from: "m:comp:SPY", then "m:comp"), with what was typed in it (app.js
// keepFocus, inside scope: the module's root or its sheet; S2-D3, UI12)
export function keepFocus(redo, scope = M.root) {
  const a = scope?.ownerDocument?.activeElement, inside = a && scope?.contains(a);
  const id = inside ? a.dataset?.el || null : null, k = inside ? a.dataset?.k || null : null, sym = inside ? a.dataset?.sym || null : null, v = inside && a.tagName === "INPUT" ? a.value : null;
  let s = null, e = null;
  try { s = a?.selectionStart ?? null; e = a?.selectionEnd ?? null; } catch (_) {}
  redo();
  if (!inside || a.isConnected || (!id && !k)) return;
  const esc = (x) => String(x).replace(/["\\]/g, "\\$&");
  let n = id ? scope.querySelector(`[data-el="${esc(id)}"]`) : null;
  if (!n && k && sym) n = scope.querySelector(`[data-k="${esc(k)}"][data-sym="${esc(sym)}"]`);
  for (let key = k; !n && key; key = key.includes(":") ? key.slice(0, key.lastIndexOf(":")) : "") n = scope.querySelector(`[data-k="${esc(key)}"]`);
  if (!n) return;
  if (v && n.tagName === "INPUT" && !n.value) n.value = v;
  n.focus({ preventScroll: true });
  if (s != null && n.tagName === "INPUT") try { n.setSelectionRange(s, e); } catch (_) {}
}
// (once drawn: the lines drawn in)
export function afterDraw(scope, animate = true) {
  if (!scope) return;
  if (!animate) {
    // Finish only this new view’s CSS entrances, never a chart tween or an active control transition.
    for (const a of scope.getAnimations?.({ subtree: true }) || []) try { if (a.animationName && a.effect.getTiming().iterations !== Infinity) a.finish(); } catch (_) {}
    return;
  }
  scope.querySelectorAll("path[data-draw]").forEach((p, i) => C.drawIn(p, Number(p.dataset.draw) || i * 0.05));
}
// one symbol's numbers, wherever they show in Markets, said afresh and flashed up or down (app.js paint, scoped)
export function paint(sym, up) {
  const q = S.q[sym], held = S.list.find((x) => x.symbol === sym), all = (sel) => [M.root, Sheet.handle?.el].filter(Boolean).flatMap((r) => [...r.querySelectorAll(sel)]);
  const k = String(sym).replace(/["\\]/g, "\\$&");
  const flash = (n) => { n.classList.remove("flash-up", "flash-down"); void n.offsetWidth; n.classList.add(up ? "flash-up" : "flash-down"); };
  all(`[data-px="${k}"]`).forEach((n) => { n.textContent = core.priceSaid(q); flash(n); });
  all(`[data-pct="${k}"]`).forEach((n) => {
    // (a stock's page showing a longer range than today says its change over that, not today's)
    const range = n.dataset.el === "rpct";
    if (range && (el("cb")?.dataset.range || "1d") !== "1d") return;
    n.textContent = range && q.chg != null && !core.isIndex(q) ? `${core.chgSaid(q)} (${core.pct(q.chgPct)})` : core.pct(q.chgPct); n.classList.remove("up-t", "down-t", "flat-t"); n.classList.add(core.tone(q.chgPct)); });
  if (held?.qty > 0 && core.valueOf(held) != null) {
    all(`[data-val="${k}"]`).forEach((n) => { n.textContent = core.money(core.valueOf(held)); flash(n); });
    all(`[data-dg="${k}"]`).forEach((n) => { n.textContent = n.tagName === "I" ? `${core.signed(core.dayOf(held))} today` : core.signed(core.dayOf(held)); n.classList.remove("up-t", "down-t", "flat-t"); n.classList.add(core.tone(core.dayOf(held))); });
    const paid = held.cost ? core.paidFor(held) : null, gain = paid != null ? core.valueOf(held) - paid + (core.divsOf(held) || 0) : null;
    if (gain != null) for (const [attr, text] of [["data-gain", core.signed(gain, "GBP", Math.abs(gain) >= 1e4 ? 0 : 2)], ["data-gain-pct", core.pct((gain / paid) * 100, 1)]]) {
      all(`[${attr}="${k}"]`).forEach((n) => { n.textContent = text; n.classList.remove("up-t", "down-t", "flat-t"); n.classList.add(core.tone(gain)); });
    }
  }
}

// ---- Markets' small pictures (app.js 999-1006, 1016, 1135-1145) ----
const { pct, tone, money, priceSaid, valueOf, monthSaid } = core;
export const vbars = (rows, say = (v) => pct(v), max = Math.max(...rows.map((r) => Math.abs(r[1])), 0.01)) =>
  h("div.vbar", {}, rows.map(([k, v], i) => h("div", {}, h("span", { text: k }), h("s", { class: v >= 0 ? "up" : "down", vars: { w: `${Math.max(4, (Math.abs(v) / max) * 100)}%`, d: `${i * 0.12 + 0.2}s` } }), h("b.num", { class: `num ${tone(v)}`, text: say(v) }))));
export const range52 = (q, lo, hi, at) => [h("div.range52", { vars: { c: at > 0.5 ? "var(--up-soft)" : "var(--down-soft)" } }, h("i", { vars: { at: `${Math.max(0, Math.min(100, at * 100))}%` } })), h("div.ends.num", {}, h("span", { text: priceSaid(q, lo) }), h("span", { text: priceSaid(q, hi) }))];
export const MIXC = ["var(--m1)", "var(--m2)", "var(--m3)", "var(--m4)", "var(--m5)", "var(--m6)"];
export const mixBar = (o) => h("div.mix", {}, [...o].sort((a, b) => valueOf(b) - valueOf(a)).slice(0, 6).map((x, i) => h("i", { vars: { f: String(valueOf(x)), c: MIXC[i], d: `${0.2 + i * 0.06}s` } })));
export function sparkCard(sym) {
  const q = S.q[sym], s = C.el("svg", { viewBox: "0 0 300 44", preserveAspectRatio: "none", class: "mk-sparkline", "aria-hidden": "true" });
  const p = C.el("path", { d: C.spark(q.spark, 300, 44, q.prev), fill: "none", stroke: q.chgPct >= 0 ? "var(--up)" : "var(--down)", "stroke-width": 2, "stroke-linecap": "round", "vector-effect": "non-scaling-stroke" });
  s.append(p); requestAnimationFrame(() => C.drawIn(p, 0.3)); return s;
}
export const allowBar = (used) => h("div.allow", {}, h("i", { vars: { w: `${Math.max(used > 0 ? 2 : 0, used * 100)}%` } }));
// an insight's picture, as core.insights names it ([kind, …args])
export function viz(v) {
  if (!Array.isArray(v)) return null;
  const [kind, ...a] = v;
  if (kind === "vbars") return a[1] === "money" ? vbars(a[0], (x) => money(x, "GBP", 0), a[2]) : vbars(a[0]);
  if (kind === "range52") return range52(...a);
  if (kind === "spark") return S.q[a[0]] ? sparkCard(a[0]) : null;
  if (kind === "mix") return mixBar(a[0]);
  if (kind === "allow") return allowBar(a[0]);
  return null;
}
// a year of it, a bar a month (the chosen one bright). o: { add: twelve more, drawn on top apart, est (m) → still to come }
export function incomeBars(I, chosen, onPick, tall = 120, o = {}) {
  const max = Math.max(...I.months.map((m, i) => m.total + (o.add?.[i] || 0)), 0.01), bar = (v) => ({ ht: `${Math.max(3, Math.round((v / max) * tall))}px` });
  return h("div.ibars", onPick ? { role: "group", "aria-label": "Dividends by month" } : { "aria-hidden": "true" }, I.months.map((m, i) => h(onPick ? "button.ib" : "span.ib", { ...(onPick ? { type: "button", "aria-pressed": String(i === chosen), onclick: () => onPick(i), "aria-label": `${monthSaid(m.d, true)}: ${money(m.total, "GBP", 0)}` } : {}), vars: { k: String(i) } },
    o.add?.[i] ? h("i.add", { vars: bar(o.add[i]) }) : null,
    h("i", { class: m.total > 0 ? (o.est?.(m) ? "est" : null) : "none", vars: bar(m.total) }), h("span", { text: monthSaid(m.d).slice(0, onPick ? 3 : 1) }))));
}

// ---- a story: read in Markets (app.js readsIn, markRead) ----
// (over the sheet that's up, else on its own; a click held for a new tab, as one)
export const readsIn = (n) => (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return markRead(n); e.preventDefault(); (Sheet.stack.length ? pushSheet : openSheet)("story", n); };
export function markRead(n) {
  const r = core.store.get("newsRead", []), k = core.newsKey(n);
  if (!r.includes(k)) { r.push(k); core.store.set("newsRead", r.slice(-300)); }
  setTimeout(() => {
    const e = [...(M.root?.querySelectorAll(".nstory[data-key]") || [])].find((x) => x.dataset.key === k);
    e?.classList.add("read"); e?.classList.remove("fresh");
    core.emit("news");
  }, 400);
}
