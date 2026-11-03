// Weather's Radar section (One roof, spec §7.1, WX, RB3, UB1): stamps the radar card markup weather/radar.js expects
// (.radar-map in [data-no-edge], no .radar-full), fw.fill(true) on show, the radar stack only through
// fw.lazy(() => import("../radar.js")) on first show, radar(card, { full: false, explore: true, light }), rebuilt on
// theme, destroyed after 5 minutes out of sight; "Radar needs a connection" offline. B0's stub (STUB = true); WX writes it.
// Frozen: view(el, ctx) → { draw(), hide(), destroy() } (as now.js says).
import { weatherSendCard, packCard } from "../send.js";

export const STUB = true;
export function view(el, ctx) {
  return {
    draw() { if (el && !el.firstChild) el.textContent = "Radar"; },
    hide() {},
    destroy() { if (el) el.textContent = ""; },
  };
}
