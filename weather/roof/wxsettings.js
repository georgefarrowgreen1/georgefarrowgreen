// Weather Settings under the roof (One roof, spec §7.1, §7.4, WS). B0's stub (STUB = true); WS writes it.
// Frozen: openSettings(ctx, page) → sheet Handle | null: data-sheet=wxsettings; page: null (the list of pages) or one of
//   "units" | "arrange" | "best" | "commute" | "solar" | "forecast", opened straight at it (a pushed page whose container
//   is [data-page=<page>]); on the list, a row per page [data-go=<page>], and a Notifications row
//   a[href="/#you=notify-weather"]. Each control sits in an element [data-key=<top-level wx:settings key>] (temp, wind,
//   precip, pressure, clock, layout, activities, commute, solar, tune, …); a segmented control is ui.seg's
//   button[role=radio][data-value]. Saves go through ctx.core.saveSettings(patch) with only the keys edited.
import { FACES, PITCHES, MAX_ZONES, zoneSaid, facesName } from "../solar.js";
import { ACTIVITIES } from "../insights.js";
import { makeFormat } from "../format.js";

export const STUB = true;
export const PAGES = Object.freeze(["units", "arrange", "best", "commute", "solar", "forecast"]);
export function openSettings(ctx, page = null) { return null; }
