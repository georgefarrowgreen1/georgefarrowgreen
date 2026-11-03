// Weather's warnings, worked out (One roof, stage 2 §4.5, WX-L): what's in force for the forecast shown, the slot under
// Now's hero, the empty states' words. Static, for Now (now.js: listFor, slotOf), so Now never waits on the Warnings
// section's file; warnings.js (lazy: the section and the warning sheet) imports these and re-exports them.
// Pure (no page): warningsOf, nameOf, slotOf, emptyOf, emptyWords, paras; listFor(ctx, now) reads ctx.S and ctx.core.
import { inForce, covered, colourOf, titleOf, badgeOf } from "../official.js";
import * as I from "../insights.js";
import { makeFormat } from "../format.js";

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
// with nothing in force: which empty state ("unavailable": no official service covers the place, the server's uncovered,
// data.js wx.noOfficial; or none could be asked, wx.official null)
export const emptyOf = (wx) => (wx && (wx.official == null || wx.noOfficial) ? "unavailable" : "none");
export const emptyWords = (which, place) => (which === "unavailable"
  ? { title: `Official warnings aren’t available for ${place}.`, body: "Check your national weather service." }
  : { title: `No warnings for ${place}.`, body: "You’ll hear about any here, and on Today." });
// (blank lines part a warning's paragraphs; single ones are only where its lines were wrapped; the US's "* WHAT..." as
// "What: ")
export const paras = (s) => String(s || "").split(/\n\s*\n/).map((x) => x.replace(/\s*\n\s*/g, " ").trim().replace(/^\*\s*([A-Z][A-Z /]*?)\.\.\.\s*/, (m, k) => `${k[0]}${k.slice(1).toLowerCase()}: `)).filter(Boolean);

const fmt = (ctx) => ctx.S.f || makeFormat({});
// the list the views draw (Now's slot and this section), from ctx
export function listFor(ctx, now) {
  const S = ctx.S;
  let prev = null;
  try { prev = ctx.core.baseline?.(S.wx, now) ?? null; } catch (_) {}
  return warningsOf(S.wx, now, fmt(ctx), { prev, commute: S.settings?.commute });
}
