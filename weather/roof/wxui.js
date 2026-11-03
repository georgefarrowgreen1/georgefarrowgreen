// Weather's pieces on the framework's components (One roof, spec §7.1, WV): skyClass, the hour strip, the range bar,
// the detail sheet (ported from weather/detail.js l.39–250) and the credits sheet (ported verbatim from
// weather/index.html #credits), icon helpers. B0's stub (STUB = true); WV writes it.
// Frozen (used by other files): skyClass(wx, now) → one of the 14 "wx-sk-*" classes (Today's .tcard.wx skies);
//   openDetail(ctx, kind) → sheet Handle | null (kind: a Right now tile's id, e.g. "wind", "uv", "air");
//   openCredits(ctx, which) → sheet Handle | null (which: "weather" | "map" | null: the part to scroll to).
// ctx = { S, core, fw, open, hint } (weather.js makes it; see there).
import { makeFormat, keyOf, HOUR, DAY } from "../format.js";
import { codeInfo, iconOf, label } from "../codes.js";
import { weatherIcon, glyph } from "../icons.js";
import * as I from "../insights.js";
import { climateOn, rankIn } from "../climate.js";
import { timeChart } from "../charts.js";
import { skyDay } from "../sky.js";

export const STUB = true;
export function skyClass(wx, now) { return "wx-sk-clear-day"; }
export function openDetail(ctx, kind) { return null; }
export function openCredits(ctx, which) { return null; }
