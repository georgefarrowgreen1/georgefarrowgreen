// Weather's 16 Days section (One roof, spec §7.1, WV): "Days by" Temp / Rain / Wind, a row per day with its range bar;
// and the day sheet. B0's stub (STUB = true); WV writes it.
// Frozen: view(el, ctx) → { draw(), hide(), destroy() } (as now.js says);
//   openDay(ctx, key) → sheet Handle | null: that day's sheet (key "YYYY-MM-DD"; hourly chart, parts of the day, prev/next).
import { keyOf, dayStart, HOUR, DAY } from "../format.js";
import { codeInfo, iconOf, label } from "../codes.js";
import { weatherIcon } from "../icons.js";
import { timeChart, rangeChart } from "../charts.js";
import * as I from "../insights.js";
import { skyClass } from "./wxui.js";

export const STUB = true;
export function view(el, ctx) {
  return {
    draw() { if (el && !el.firstChild) el.textContent = "16 Days"; },
    hide() {},
    destroy() { if (el) el.textContent = ""; },
  };
}
export function openDay(ctx, key) { return null; }
