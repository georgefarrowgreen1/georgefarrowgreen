// Weather's Warnings section (One roof, spec §7.1, WV): official warnings in force and alert-level insights, and the two
// empty states (wx.official [] vs null); the warnings slot's words for Now (app.js cards(), its banner); the warning sheet.
// Frozen: view(el, ctx) → { draw(), hide(), destroy() } (as now.js says);
//   openWarning(ctx, w) → sheet Handle | null: one warning in full (w: an entry of wx.official, or an alert insight),
//   fw.sheet.open({ sheet: "warning", … }) → dialog.ifl-sheet[data-sheet=warning].
// Hooks (frozen, .tools/tests/roofhooks.mjs; inside this section): each row's tappable element [data-warning=<i>] (i:
//   0-based, in the order shown: official warnings in force first, then alert insights) → open.warning(w); with no rows,
//   ui.empty() with data-empty="none" (wx.official is []) or data-empty="unavailable" (wx.official is null): .ifl-empty[data-empty].
// Loaded through fw.lazy on the section's first show or the first warning opened (stage 2 §4.5). The pure helpers
// (warningsOf, slotOf, emptyOf, emptyWords, nameOf, paras, listFor) live in wxwarn.js, static for Now, and are
// re-exported here.
import { colourOf, titleOf, badgeOf, spanOf, glyphOf } from "../official.js";
import { keyOf, HOUR, nowWall, makeFormat } from "../format.js";
import { glyph } from "../icons.js";
import { h } from "./wxui.js";
import { warningsOf, nameOf, slotOf, emptyOf, emptyWords, paras, listFor } from "./wxwarn.js";

export { warningsOf, nameOf, slotOf, emptyOf, emptyWords, paras, listFor };


// (the header's rule, weather.js titleOf: a GPS place by its own name; app.js's "here" when there's none)
const placeName = (ctx) => { const p = ctx.core?.place?.() || ctx.S.places?.[ctx.S.cur]; return (p?.gps && p.name === "My Location" ? "My Location" : p?.name) || ctx.S.wx?.place?.name || "here"; };
const fmt = (ctx) => ctx.S.f || makeFormat({});
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
    // (the warnings still on their way with the forecast in: rows to come, not yet an empty state that says they aren't
    // available, since wx.official is null till they're in; drawn again when the loading ends)
    if (!list.length && wx.official == null && S.loading) {
      if (sig === "wait") return;
      sig = "wait";
      el.replaceChildren(ctx.fw.ui.skeleton("rows", 3));
      return;
    }
    const s = JSON.stringify([wx.place.lat, wx.place.lon, wx.fetchedAt, wx.official == null, !!wx.noOfficial, list.map((x) => (x.kind === "official" ? [x.w.id, titleOf(x.w), spanOf(x.w, now, f, wx.place.offset)] : [x.c.title, x.c.text])), placeName(ctx)]);
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
