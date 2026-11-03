// Weather's module: its entry under InFlite's roof (One roof, spec §5.1, §7.1, D2, D4, D15). Loaded by the framework
// (roof/modules.js) with import("/weather/roof/weather.js") on first open and kept for the life of the page. B0's stub
// (STUB = true): the exports and the instance's methods are frozen; WX writes the real entry.
//
// Exports (frozen; roofcontract.test reads them from this file's text, so each stays a literal on one line):
//   CONTRACT = 1; BUILD and NEWS = weather/app.js's (equal, always: I raises both together); SECTIONS = the router's
//   REGISTRY.weather.sections = connector.sections; mount(root, fw) → Promise<instance>.
// instance = { show(route, hint) → void | Promise (resolves on first paint of that section), hide(), back() → boolean
//   (stage 1: false), busy() → boolean, sendable() → { words, packed, what } | null, unmount() }
//   route: the router's app Route { kind: "app", app: "weather", section, key, arg, query };
//   hint: { sky, temp, place } from a zoom off Today's card, or null.
//   show: the section (route.section); key "day" with an arg → openDay(ctx, arg); key "settings" → openSettings(ctx,
//   arg); a query → core.fromLink(query).
//
// What mount builds: in root (div.m-weather, inside main#m-weather), one section.wx-sec[data-sec=<id>] per section, in
// SECTIONS order, the shown one not hidden; each gets its view: now.js / days.js / radarview.js / warnings.js
// view(sectionEl, ctx). ctx (frozen) = { S: core.S, core, fw, open, hint }, where open holds the openers bound to ctx:
//   open.places() = openPlaces(ctx), open.confirm(p) = confirmPlace(ctx, p), open.day(key) = openDay(ctx, key),
//   open.detail(kind) = openDetail(ctx, kind), open.warning(w) = openWarning(ctx, w), open.credits(which) =
//   openCredits(ctx, which), open.settings(page) = openSettings(ctx, page);
//   hint: show()'s hint (null otherwise), set before the Now view's draw().
// A view's draw() runs when its section shows and on core's events while it shows; hide() when it's left; destroy() on
// unmount. The header (fw.header.set): title = the place (▾ → open.places()), line, compactTitle "London · 14°", acts:
// Weather Settings only ({ icon: "settings", label: "Weather Settings", run: () => open.settings(null) }), badges
// { warnings: n }.
import * as core from "./core.js";
import { connector } from "./connector.js";
import { view as nowView } from "./now.js";
import { view as daysView, openDay } from "./days.js";
import { view as radarView } from "./radarview.js";
import { view as warningsView, openWarning } from "./warnings.js";
import { openPlaces, confirmPlace } from "./places.js";
import { openDetail, openCredits } from "./wxui.js";
import { openSettings } from "./wxsettings.js";
import { weatherSendCard, packCard } from "../send.js";

export const STUB = true;
export const CONTRACT = 1;
export const BUILD = "1.64";
export const NEWS = "Ready for InFlite: links open on Radar, a day or Warnings, and Turn Off for an old icon stays off";
export const SECTIONS = [["now", "Now"], ["days", "16 Days"], ["radar", "Radar"], ["warnings", "Warnings"]];

const VIEWS = { now: nowView, days: daysView, radar: radarView, warnings: warningsView };

export async function mount(root, fw) {
  const ctx = { S: core.S, core, fw, open: {}, hint: null };
  Object.assign(ctx.open, {
    places: () => openPlaces(ctx), confirm: (p) => confirmPlace(ctx, p), day: (key) => openDay(ctx, key),
    detail: (kind) => openDetail(ctx, kind), warning: (w) => openWarning(ctx, w), credits: (which) => openCredits(ctx, which),
    settings: (page) => openSettings(ctx, page),
  });
  const doc = root.ownerDocument;
  const secs = new Map(), views = new Map();
  for (const [id, name] of SECTIONS) {
    const el = doc.createElement("section");
    el.className = "wx-sec";
    el.dataset.sec = id;
    el.setAttribute("aria-label", name);
    el.hidden = true;
    root.append(el);
    secs.set(id, el);
    views.set(id, VIEWS[id](el, ctx));
  }
  let shown = null;
  return {
    show(route, hint = null) {
      const id = secs.has(route?.section) ? route.section : "now";
      ctx.hint = hint;
      if (shown && shown !== id) views.get(shown).hide();
      for (const [k, el] of secs) el.hidden = k !== id;
      shown = id;
      views.get(id).draw();
    },
    hide() { if (shown) views.get(shown).hide(); },
    back: () => false,
    busy: () => false,
    sendable: () => null,
    unmount() { for (const v of views.values()) v.destroy(); for (const el of secs.values()) el.remove(); secs.clear(); views.clear(); shown = null; },
  };
}
