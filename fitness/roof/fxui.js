// Fitness's adapter under the roof (One roof stage 2, §4.1, BB2): fitness/app.js's helper names over the framework's fw,
// so a view moves across with `from "./app.js"` → `from "./x.js"` and little else.
//   elements: h svg icon sportIcon card row section stat wait sportTile face head (null: the framework's header is the
//     title) zoneBars mapCredit routeOf stepper; the ui.js formatters (U dur hm clock … pct), re-exported
//   sheets: openSheet(view, { sheet, tall }) pushSheet(view) sheetBack() drawSheet() closeSheet() → Promise, Sheet
//     (Sheet.redraw()), sheetEl ({ open }): a view is app.js's, () → { title, body, right?, sheet? }, drawn into
//     fw.sheet.open({ sheet, app: "fitness" }) (data-sheet = the view's sheet, else openSheet's, else "fitness"); a pushed
//     view is the sheet's handle.push (its framework ‹ Back pops it here too)
//   toast(text, bad, ms) → fw.toast; redraw(part) → core's event; go(tab) → fw.nav.section; morph(kind, fn) runs fn (the
//     framework's transitions take View Transitions' place, S2-D8); canMorph() false
//   widths, from a ResizeObserver on the module's root (disconnected in detach()): wide() (≥ 980 px: two columns, S2-D8),
//     mainW() partW(part) cardW(hero, part) sheetW(); mapsAlways()
//   chooseFiles() the picker fitness.js made, opened in the tap; calendar(wks) a week or two as an .ics file
//   attach(root, fw) / detach()   fitness.js, at mount and unmount
import { h, svg, icon, sportIcon, U, dur, hm, clock, stepLen, dist, distNum, height, speed, pace, paceOf, weight, dayLong, dayShort, dayName, dayLetter, dateShort, timeOf, plural, pct } from "../ui.js";
import { SPORTS, flatten, measure } from "../workouts.js";
import { S, P, setNumber, resum, isSet, redraw, toast, M, needF, saveFile, paceFor, wkById, estimates } from "./core.js";

export { h, svg, svg as svgOf, icon, sportIcon, U, dur, hm, clock, stepLen, dist, distNum, height, speed, pace, paceOf, weight, dayLong, dayShort, dayName, dayLetter, dateShort, timeOf, plural, pct, redraw, toast };

const Q = { root: null, fw: null, ro: null, w: 0, pick: null };
export const fwUi = () => Q.fw;
export function attach(root, fw) {
  Q.root = root; Q.fw = fw;
  Q.w = root.clientWidth || root.ownerDocument.documentElement.clientWidth || 390;
  let last = Q.w, t = 0;
  if (typeof ResizeObserver === "function") {
    Q.ro = new ResizeObserver((es) => {
      const w = Math.round(es[0]?.contentRect?.width || 0);
      if (!w) return;
      Q.w = w;
      clearTimeout(t);
      t = setTimeout(() => { if (Math.abs(Q.w - last) > 40) { last = Q.w; redraw(); } }, 250);
    });
    Q.ro.observe(root);
  }
}
export function detach() {
  Q.ro?.disconnect(); Q.ro = null;
  if (Sheet.handle && !Sheet.handle.closed) Sheet.handle.now?.();
  Sheet.stack = []; Sheet.handle = null; Sheet.redraw = null;
  Q.root = null; Q.fw = null; Q.pick = null;
}
export const setPicker = (fn) => { Q.pick = fn; };

// ---- elements (app.js 1286-1305) ----
export const section = (title, ...kids) => h("section.section", {}, title && h("h3", {}, title), ...kids);
export const card = (cls, title, ...kids) => h("div.card.glass" + (cls ? "." + cls : ""), {}, title && h("h3", {}, ...[].concat(title)), ...kids);
export function row({ icon: ic, tint, tile, title, sub, value, onclick, chev = true, cls = "", extra = null, href = null }) {
  const tag = href ? "a.row" : onclick ? "button.row" : "div.row";
  return h(tag + (cls ? "." + cls : ""), { type: onclick && !href ? "button" : null, onclick, href, target: href ? "_blank" : null, rel: href ? "noopener" : null },
    tile || (ic && h("span.ic." + (tint || "grey"), {}, icon(ic, 18, 2.1))),
    h("span.tx", {}, h("b", { text: title }), sub && h("small", { text: sub })),
    extra, value != null && h("span.val", {}, ...[].concat(value)), (onclick || href) && chev && h("span.chev", {}, icon(href ? "open" : "chev", 17, 2.4)));
}
export const sportTile = (sport, small = false) => h("span.tile.s-" + sport + (small ? ".small" : ""), {}, sportIcon(sport, small ? 17 : 20));
export const stat = (label, v, unit) => h("div.stat", {}, h("small", { text: label }), h("b", {}, v ?? "–", unit && v != null ? h("u", { text: unit }) : null));
export const wait = (hgt) => h("div.wait", { vars: { "min-height": hgt + "px" } });
// (you, as the framework has you: your initial; the photo is the framework's, in its header)
export const face = () => (Q.fw?.session?.user?.name || S.me?.name || "Y").trim().slice(0, 1).toUpperCase();
// (the framework's header is each section's title: a view's own head draws nothing)
export const head = () => null;
export function zoneBars(secs, labels, cls) {
  const total = secs.reduce((a, b) => a + b, 0) || 1, max = Math.max(...secs) || 1;
  const bars = secs.map((v, i) => {
    const fill = h("i.bg-" + cls[i]);
    requestAnimationFrame(() => requestAnimationFrame(() => fill.style.setProperty("width", `${(v / max) * 100}%`)));
    return h("div.zrow", { title: labels[i] }, h("span", { text: `Z${i + 1}` }), h("span.zbar", { role: "img", "aria-label": `${labels[i]}: ${dur(v)}, ${pct(v / total)}` }, fill), h("span.zv", { text: v >= 60 ? `${dur(v)}` : v ? "<1 min" : "–" }));
  });
  return h("div.zones", {}, bars);
}
export function mapCredit() {
  const b = h("button.map-credit.folded", { type: "button", "aria-label": "Map data © OpenStreetMap, OpenFreeMap", "aria-expanded": "false",
    onclick: (e) => { e.stopPropagation(); const open = b.classList.toggle("folded"); b.setAttribute("aria-expanded", String(!open)); } },
  h("span.mc-c", { "aria-hidden": "true", text: "©" }), h("span.mc-t", { "aria-hidden": "true", text: " OpenStreetMap, OpenFreeMap" }));
  b.addEventListener("keydown", (e) => e.stopPropagation());
  return b;
}
export function routeOf(s, zoneAt) {
  const idx = []; for (let i = 0; i < s.t.length; i++) if (s.lat[i] != null && s.lon[i] != null) idx.push(i);
  const step = Math.max(1, Math.ceil(idx.length / 3000)), use = idx.filter((_, j) => j % step === 0 || j === idx.length - 1);
  const css = Q.root ? getComputedStyle(Q.root) : null, col = {};
  const colourOf = (z) => (col[z] ??= css?.getPropertyValue("--" + z).trim() || "#0a84ff");
  return { coords: use.map((i) => [s.lon[i], s.lat[i]]), colours: zoneAt ? use.map((i) => colourOf(zoneAt(i))) : null };
}
export function numberSaid(k) {
  if (isSet(k)) return null;
  const e = estimates();
  if (k === "ftp") return e.ftp ? `Estimated from ${plural(e.rides, "ride")}` : "A starting guess";
  if (k === "maxHr" || k === "lthr") return e.maxHr ? "From your rides" : "A starting guess";
  return "A starting guess";
}
export function stepper(label, key, show, by, lo, hi, after) {
  const change = (d) => { setNumber(key, Math.max(lo, Math.min(hi, Math.round((P()[key] + d) * 10) / 10))); Sheet.redraw?.(); clearTimeout(stepper.t); stepper.t = setTimeout(() => { resum(); redraw("settings"); after?.(); }, 600); };
  const said = numberSaid(key);
  return h("div.row.plain", {}, h("span.tx", {}, h("b", { text: label }), said && h("small.est", { text: said })),
    h("span.stepper", { role: "group", "aria-label": label },
      h("button", { type: "button", "aria-label": `Less ${label}`, onclick: () => change(-by) }, icon("minus", 16, 2.4)),
      h("output", { text: show(P()[key]) }),
      h("button", { type: "button", "aria-label": `More ${label}`, onclick: () => change(by) }, icon("plus", 16, 2.4))));
}

// ---- widths (app.js 1159-1167, 1302-1305), from the module's root ----
const vw = () => Q.root?.ownerDocument.documentElement.clientWidth || Q.w || 390;
export const wide = () => (Q.w || vw()) >= 980;
export const mainW = () => Math.max(260, (Q.w || vw()) - 32);
export const partW = (part) => Math.round((mainW() + 20) * part - 20);
export const cardW = (hero = false, part = null) => (wide() ? (part != null ? partW(part) : partW(0.5)) : Math.min(mainW(), 648)) - (hero ? 40 : 36);
export const sheetW = () => Math.round(Math.min(vw() - 16, 560) - 32 - 36);
export const mapsAlways = () => S.maps === "always";
export const canMorph = () => false;
export const morph = (kind, fn) => fn();

// ---- the toast, the tabs ----
export const go = (tab) => Q.fw?.nav?.section?.(tab);
export const chooseFiles = () => Q.pick?.();

// ---- sheets (app.js 2214-2293), on the framework's ----
export const Sheet = { stack: [], conts: [], handle: null, redraw: null, closing: null };
export const sheetEl = { get open() { return !!Sheet.handle && !Sheet.handle.closed; }, get el() { return Sheet.handle?.el || null; } };
const nodesOf = (v) => [].concat(v.right ? [h("div.fx-sheet-right", {}, v.right)] : [], v.body || []).flat(Infinity).filter((x) => x != null && x !== false && x !== "");
function paint(cont, v, keepScroll = false) {
  const body = Sheet.handle?.body, top = body ? body.scrollTop : 0;
  cont.replaceChildren(...nodesOf(v));
  const h2 = Sheet.handle?.el.querySelector(".ifs-head h2");
  if (h2 && v.title != null) h2.textContent = v.title;
  if (keepScroll && body) body.scrollTop = top;
}
export function openSheet(view, o = {}) {
  if (!Q.fw) return null;
  const v = view();
  if (sheetEl.open && !Sheet.closing) {
    Sheet.stack = [view];
    while (Sheet.conts.length > 1) { Sheet.conts.pop(); Sheet.handle.pop(true); }
    paint(Sheet.conts[0], v);
    Sheet.handle.el.dataset.sheet = v.sheet || o.sheet || "fitness";
    return Sheet.handle;
  }
  const cont = h("div.fx-sheet");
  Sheet.stack = [view]; Sheet.conts = [cont];
  const handle = Q.fw.sheet.open({
    sheet: v.sheet || o.sheet || "fitness", title: v.title || "", label: v.title || "Fitness", app: "fitness",
    body: (bodyEl) => { bodyEl.append(cont); },
    onClose: () => { if (Sheet.handle !== handle) return; Sheet.stack = []; Sheet.conts = []; Sheet.handle = null; Sheet.redraw = null; Sheet.closing = null; M.sweep(); },
  });
  Sheet.handle = handle;
  if (o.tall) handle.el.classList.add("tall");
  // (the framework's ‹ Back pops its page; the view under it is ours to pop too)
  handle.el.addEventListener("click", (e) => { if (e.target.closest?.("[data-back]") && Sheet.stack.length > 1) { Sheet.stack.pop(); Sheet.conts.pop(); } }, true);
  paint(cont, v);
  Sheet.redraw = () => drawSheet(true);
  return handle;
}
export function pushSheet(view) {
  if (!sheetEl.open) return openSheet(view);
  const v = view(), cont = h("div.fx-sheet");
  Sheet.stack.push(view);
  const pg = Sheet.handle.push({ page: v.page || v.sheet || `p${Sheet.stack.length}`, title: v.title || "", body: cont });
  Sheet.conts.push(cont);
  paint(cont, v);
  return pg;
}
export function sheetBack() {
  if (Sheet.stack.length > 1) { Sheet.stack.pop(); Sheet.conts.pop(); Sheet.handle.pop(); } else closeSheet();
}
export function drawSheet(keepScroll = false) {
  const view = Sheet.stack.at(-1), cont = Sheet.conts.at(-1);
  if (!view || !cont || !sheetEl.open) return;
  paint(cont, view(), keepScroll);
}
export function closeSheet() {
  if (!sheetEl.open) return Promise.resolve();
  if (Sheet.closing) return Sheet.closing;
  const handle = Sheet.handle;
  Sheet.closing = new Promise((done) => {
    const t0 = Date.now(), look = () => (handle.closed || Date.now() - t0 > 1500 ? done() : setTimeout(look, 40));
    handle.close(); look();
  });
  return Sheet.closing;
}

// ---- a week or two as calendar events (app.js 1483-1499) ----
export async function calendar(wks) {
  const F = await needF();
  const z = (n) => String(n).padStart(2, "0"), stamp = (t) => { const d = new Date(t); return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}T${z(d.getHours())}${z(d.getMinutes())}00`; };
  const fold = (s) => s.replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
  const ev = [];
  for (const wk of wks) for (const d of wk.days) {
    const id = S.swaps[d.date] !== undefined ? S.swaps[d.date] : d.id, w = id && id !== "event" ? wkById(id) : null;
    if (!w) continue;
    const m = measure(w, paceFor(w.sport)), start = d.date + 7 * 3600e3;
    const notes = `${w.about}\n\n` + flatten(w, paceFor(w.sport)).map((s) => `${stepLen(s)} ${s.name || s.kind}${w.sport === "ride" && s.kind !== "free" ? ` at ${pct(s.from)}${s.to !== s.from ? `–${pct(s.to)}` : ""}` : ""}`).join("\n");
    ev.push(["BEGIN:VEVENT", `UID:${w.id}-${d.date}@fitness.inflite.ai`, `DTSTAMP:${stamp(Date.now())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(start + m.secs * 1000)}`,
      `SUMMARY:${fold(`${w.name} (${SPORTS[w.sport].name})`)}`, `DESCRIPTION:${fold(notes)}`, "END:VEVENT"].join("\r\n"));
  }
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//inflite.ai//Fitness//EN", "CALSCALE:GREGORIAN", ...ev, "END:VCALENDAR", ""].join("\r\n");
  saveFile(F.fileName(`Fitness week ${wks[0].week}`, "ics"), ics);
}
