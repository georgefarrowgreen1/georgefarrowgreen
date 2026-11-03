// Weather's Now section (One roof, spec §7.1, WV): the hero (.wx-hero, Today's .tcard.wx markup, hint.sky until its own
// forecast), its status line, the warnings slot (.wx-alerts), the cards in S.settings.layout order (not daily, not
// radar), the "ask" card, the foot with the credits line (.wx-credits). B0's stub (STUB = true); WV writes it.
// Frozen: view(el, ctx) → { draw(), hide(), destroy() } (every section view's signature):
//   el: the section.wx-sec[data-sec=now] weather.js made; ctx = { S, core, fw, open, hint } (see weather.js).
//   draw(): (re)draw from ctx.S; called when the section shows and on core events while it shows; cheap when nothing
//   changed. hide(): its section or screen left (pause timers, observers). destroy(): unmount (remove what it added).
// Hooks (frozen, .tools/tests/roofhooks.mjs; inside this section): the hero's Send, fw.sendButton()'s button
//   ([data-act=send], FW) placed in .wx-hero; the hero's Retry .wx-hero [data-act=retry] while the forecast failed
//   (S.error; → core.refresh()); the foot's Refresh [data-act=refresh]; Next 48 hours' metric ui.seg wrapped in (or
//   being) [data-key=metric], values "temp" | "rain" | "wind"; each Right now tile's tappable element [data-detail=<kind>]
//   (weather/detail.js's kinds: feels, wind, humidity, rain, pressure, visibility, uv, air, sun, moon, sea) → open.detail(kind).
import { makeFormat, keyOf, HOUR } from "../format.js";
import * as I from "../insights.js";
import { codeInfo, iconOf, label } from "../codes.js";
import { weatherIcon, glyph } from "../icons.js";
import { timeChart } from "../charts.js";
import { climateOn, rankIn } from "../climate.js";
import { inForce, colourOf, titleOf } from "../official.js";
import { zonesSay } from "../solar.js";
import { weatherSendCard, packCard } from "../send.js";
import { skyClass, openDetail, openCredits } from "./wxui.js";

export const STUB = true;
export function view(el, ctx) {
  return {
    draw() { if (el && !el.firstChild) el.textContent = "Now"; },
    hide() {},
    destroy() { if (el) el.textContent = ""; },
  };
}
