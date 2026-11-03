// Weather's Warnings section (One roof, spec §7.1, WV): official warnings in force and alert-level insights, and the two
// empty states (wx.official [] vs null). B0's stub (STUB = true); WV writes it.
// Frozen: view(el, ctx) → { draw(), hide(), destroy() } (as now.js says);
//   openWarning(ctx, w) → sheet Handle | null: one warning in full (w: an entry of wx.official, or an alert insight).
import { inForce, covered, colourOf, titleOf, badgeOf, spanOf, glyphOf } from "../official.js";
import * as I from "../insights.js";
import { keyOf, HOUR } from "../format.js";

export const STUB = true;
export function view(el, ctx) {
  return {
    draw() { if (el && !el.firstChild) el.textContent = "Warnings"; },
    hide() {},
    destroy() { if (el) el.textContent = ""; },
  };
}
export function openWarning(ctx, w) { return null; }
