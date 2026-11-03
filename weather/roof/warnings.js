// Weather's Warnings section (One roof, spec §7.1, WV): official warnings in force and alert-level insights, and the two
// empty states (wx.official [] vs null); the warnings slot's words for Now (app.js cards(), its banner); the warning sheet.
// Frozen: view(el, ctx) → { draw(), hide(), destroy() } (as now.js says);
//   openWarning(ctx, w) → sheet Handle | null: one warning in full (w: an entry of wx.official, or an alert insight),
//   fw.sheet.open({ sheet: "warning", … }) → dialog.ifl-sheet[data-sheet=warning].
// Hooks (frozen, .tools/tests/roofhooks.mjs; inside this section): each row's tappable element [data-warning=<i>] (i:
//   0-based, in the order shown: official warnings in force first, then alert insights) → open.warning(w); with no rows,
//   ui.empty() with data-empty="none" (wx.official is []) or data-empty="unavailable" (wx.official is null): .ifl-empty[data-empty].
// Pure (no page): warningsOf, slotOf, emptyOf, nameOf, paras.
import { inForce, covered, colourOf, titleOf, badgeOf, spanOf, glyphOf } from "../official.js";
import * as I from "../insights.js";
import { keyOf, HOUR, nowWall, makeFormat } from "../format.js";
import { glyph } from "../icons.js";
import { h } from "./wxui.js";

// What's in force for the forecast shown, worst first: official warnings (by level), then the app's own alert- and
// warn-level insights less any an official one already says (app.js cards()). insights: I.insights' list, or null to work
// it out. → [{ kind: "official", w } | { kind: "insight", c }]
export function warningsOf(wx, now, f, { insights = null, prev = null, commute = null, real = Date.now() } = {}) {
  if (!wx) return [];
  const all = insights || I.insights(wx, now, f, { prev, commute });
  const official = inForce(wx.official, real), said = covered(official, real);
  const mine = all.filter((c) => (c.level === "alert" || c.level === "warn") && !said.has(c.icon)).sort((a, b) => (b.level === "alert") - (a.level === "alert"));
  const worst = [...official].sort((a, b) => (b.level || 0) - (a.level || 0));
  return [...worst.map((w) => ({ kind: "official", w })), ...mine.map((c) => ({ kind: "insight", c }))];
}
// an official warning by its colour and kind, for the banner: "Amber wind", "Yellow rain" (app.js cards() name)
export const nameOf = (w) => { const b = badgeOf(w), t = titleOf(w).replace(/\s+warning$/i, ""); return b ? `${b} ${t.toLowerCase()}` : t; };
// The slot under Now's hero: none; one warning as its card; more, one banner "2 warnings · Amber wind, Yellow rain"
// (the most severe first) that opens Warnings. → { n, kind: "none" | "one" | "banner", text, line, colour, level }
export function slotOf(list) {
  const n = list.length;
  if (!n) return { n: 0, kind: "none", text: "", line: "", colour: null, level: null };
  const top = list.find((x) => x.kind === "official")?.w || null, colour = top ? colourOf(top) : null;
  const level = colour === "red" || (!top && list[0].c.level === "alert") ? "alert" : "warn";
  if (n === 1) {
    const x = list[0], title = x.kind === "official" ? titleOf(x.w) : x.c.title;
    return { n, kind: "one", text: title, line: title, colour, level };
  }
  const line = list.map((x) => (x.kind === "official" ? nameOf(x.w) : x.c.title)).join(", ");
  return { n, kind: "banner", text: `${n} warnings · ${line}`, line, colour, level };
}
// with nothing in force: which empty state (wx.official null: no official feed covers the place)
export const emptyOf = (wx) => (wx && wx.official == null ? "unavailable" : "none");
export const emptyWords = (which, place) => (which === "unavailable"
  ? { title: `Official warnings aren’t available for ${place}.`, body: "Check your national weather service." }
  : { title: `No warnings for ${place}.`, body: "You’ll hear about any here, and on Today." });
// (blank lines part a warning's paragraphs; single ones are only where its lines were wrapped; the US's "* WHAT..." as
// "What: ")
export const paras = (s) => String(s || "").split(/\n\s*\n/).map((x) => x.replace(/\s*\n\s*/g, " ").trim().replace(/^\*\s*([A-Z][A-Z /]*?)\.\.\.\s*/, (m, k) => `${k[0]}${k.slice(1).toLowerCase()}: `)).filter(Boolean);

const placeName = (ctx) => { const p = ctx.S.places?.[ctx.S.cur]; return p?.gps ? "My Location" : p?.name || ctx.S.wx?.place?.name || "this place"; };
const fmt = (ctx) => ctx.S.f || makeFormat({});
// the list the views draw (Now's slot and this section), from ctx
export function listFor(ctx, now) {
  const S = ctx.S;
  let prev = null;
  try { prev = ctx.core.baseline?.(S.wx, now) ?? null; } catch (_) {}
  return warningsOf(S.wx, now, fmt(ctx), { prev, commute: S.settings?.commute });
}

export function view(el, ctx) {
  let sig = null;
  function draw() {
    const S = ctx.S, wx = S.wx;
    if (!wx) {
      if (sig === "none") return;
      sig = "none";
      el.replaceChildren(ctx.fw.ui.skeleton("rows", 3));
      return;
    }
    const f = fmt(ctx), now = nowWall(wx.place.offset), list = listFor(ctx, now);
    const s = JSON.stringify([wx.place.lat, wx.place.lon, wx.fetchedAt, wx.official == null, list.map((x) => (x.kind === "official" ? [x.w.id, titleOf(x.w), spanOf(x.w, now, f, wx.place.offset)] : [x.c.title, x.c.text])), placeName(ctx)]);
    if (s === sig) return;
    sig = s;
    if (!list.length) {
      const which = emptyOf(wx), e = ctx.fw.ui.empty(emptyWords(which, placeName(ctx)));
      e.dataset.empty = which;
      e.querySelector("b")?.after(" ");      // (read as one: "No warnings for York. You’ll hear…")
      el.replaceChildren(e);
      return;
    }
    const rows = list.map((x, i) => {
      const w = x.w, c = x.c, colour = w ? colourOf(w) : c.level === "alert" ? "red" : "yellow";
      const chip = h("span", { class: "wx-wchip", data: { colour }, svg: glyph(w ? glyphOf(w) : c.icon, 18) });
      const r = ctx.fw.ui.row({
        lead: chip,
        title: w ? `${badgeOf(w) ? `${badgeOf(w)} · ` : ""}${titleOf(w)}` : c.title,
        sub: w ? `${spanOf(w, now, f, wx.place.offset)} · ${w.issuer}` : c.text,
        trail: "chevron", run: () => ctx.open.warning(w || c), label: w ? `${titleOf(w)}, ${spanOf(w, now, f, wx.place.offset)}, from ${w.issuer}` : c.title,
      });
      r.dataset.warning = String(i);
      r.dataset.level = w ? (colour === "red" ? "alert" : "warn") : c.level;
      return r;
    });
    el.replaceChildren(ctx.fw.ui.list(rows, { label: list.length === 1 ? "In force" : `${list.length} in force` }));
  }
  return { draw, hide() {}, destroy() { sig = null; el.replaceChildren(); } };
}

// One warning in full (app.js openWarning); an alert insight: its title and words
export function openWarning(ctx, w) {
  const wx = ctx.S.wx;
  if (!wx || !w) return null;
  const f = fmt(ctx), now = nowWall(wx.place.offset);
  let title, body;
  if (w.issuer) {
    const badge = badgeOf(w);
    title = titleOf(w);
    body = h("div", { class: "wx-sheet wx-warning", data: { colour: colourOf(w) } },
      h("p", { class: "wx-warn-from" }, badge ? [h("span", { class: "wx-warn-badge", data: { colour: colourOf(w) } }, badge), " "] : null, w.issuer, w.area ? ` · ${w.area}` : ""),
      h("p", { class: "wx-warn-when" }, spanOf(w, now, f, wx.place.offset)),
      w.headline ? h("p", { class: "wx-warn-headline" }, w.headline) : null,
      w.impacts?.length ? [h("h3", { class: "wx-sub" }, "What to expect"), h("ul", { class: "wx-warn-list" }, w.impacts.map((x) => h("li", {}, x)))] : null,
      w.text ? [h("h3", { class: "wx-sub" }, "Details"), ...paras(w.text).map((x) => h("p", {}, x))] : null,
      w.instruction ? [h("h3", { class: "wx-sub" }, "What to do"), ...paras(w.instruction).map((x) => h("p", {}, x))] : null,
      w.url && /^https:\/\//.test(w.url) ? h("p", { class: "wx-warn-link" }, h("a", { href: w.url, target: "_blank", rel: "noopener" }, `${w.issuer} website`)) : null,
      h("p", { class: "wx-note" }, `Issued by ${/Office|Service|Center|Agency/.test(w.issuer) ? "the " : ""}${w.issuer}${w.via ? `, through ${w.via}` : ""}, and shown as issued.`));
  } else {
    title = w.title || "Warning";
    body = h("div", { class: "wx-sheet wx-warning", data: { colour: w.level === "alert" ? "red" : "yellow" } },
      h("p", { class: "wx-warn-from" }, w.level === "alert" ? "Alert" : "Warning", " · worked out from the forecast"),
      h("p", {}, w.text || ""),
      h("p", { class: "wx-note" }, "From the forecast, not an official warning. For warnings, check your national weather service."));
  }
  return ctx.fw.sheet.open({ sheet: "warning", title, body, app: "weather" });
}

export { keyOf, HOUR };
