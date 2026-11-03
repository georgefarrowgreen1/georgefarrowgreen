// Weather's module: its entry under InFlite's roof (One roof, spec §5.1, §7.1, D2, D4, D15). Loaded by the framework
// (roof/modules.js) with import("/weather/roof/weather.js") on first open and kept for the life of the page.
//
// Exports (frozen; roofcontract.test reads them from this file's text, so each stays a literal on one line):
//   CONTRACT = 1; BUILD and NEWS = weather/app.js's (equal, always: I raises both together); SECTIONS = the router's
//   REGISTRY.weather.sections = connector.sections; mount(root, fw) → Promise<instance>.
// instance = { show(route, hint) → Promise (resolves on first paint of that section), hide(), back() → boolean
//   (stage 1: false), busy() → boolean, sendable() → { words, packed, what } | null, unmount() }
//   route: the router's app Route { kind: "app", app: "weather", section, key, arg, query };
//   hint: { sky, temp, place } from a zoom off Today's card, or null.
//   show: the section (route.section); key "day" with an arg → openDay(ctx, arg) once there's a forecast; key
//   "settings" → openSettings(ctx, arg); a query → core.fromLink(query) (confirmPlace for a place that's new).
//
// What mount builds: in root (div.m-weather, inside main#m-weather), one section.wx-sec[data-sec=<id>] per section, in
// SECTIONS order, the shown one not hidden; each gets its view: now.js / days.js / radarview.js / warnings.js
// view(sectionEl, ctx). ctx (frozen) = { S: core.S, core, fw, open, hint }, where open holds the openers bound to ctx:
//   open.places() = openPlaces(ctx), open.confirm(p) = confirmPlace(ctx, p), open.day(key) = openDay(ctx, key),
//   open.detail(kind) = openDetail(ctx, kind), open.warning(w) = openWarning(ctx, w), open.credits(which) =
//   openCredits(ctx, which), open.settings(page) = openSettings(ctx, page);
//   hint: show()'s hint (null otherwise), set before the Now view's draw().
// A view's draw() runs when its section shows and on core's events while it shows; hide() when it's left; destroy() on
// unmount. The header (fw.header.set, while the screen shows): title = the place, pick { label: "Places", run: () =>
// open.places() } (the ▾), line "14° · Rain from 15:00" (core.headerLine), compactTitle "London · 14°", acts: Weather
// Settings only ({ icon: "settings", label: "Weather Settings", run: () => open.settings(null) }), badges { warnings: n }
// (official warnings in force). The module's search provider (your places on this device, and Weather Settings)
// replaces the framework's places provider while it's mounted (D16: the query never leaves the page).
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
import { nowWall } from "../format.js";
import * as I from "../insights.js";

export const CONTRACT = 1;
export const BUILD = "1.64";
export const NEWS = "Ready for InFlite: links open on Radar, a day or Warnings, and Turn Off for an old icon stays off";
export const SECTIONS = [["now", "Now"], ["days", "16 Days"], ["radar", "Radar"], ["warnings", "Warnings"]];

const VIEWS = { now: nowView, days: daysView, radar: radarView, warnings: warningsView };

// (the place's name as the header shows it)
const titleOf = (p) => (p ? (p.gps && p.name === "My Location" ? "My Location" : p.name) : "Weather");

export async function mount(root, fw) {
  const ctx = { S: core.S, core, fw, open: {}, hint: null };
  Object.assign(ctx.open, {
    places: () => openPlaces(ctx), confirm: (p) => confirmPlace(ctx, p), day: (key) => openDay(ctx, key),
    detail: (kind) => openDetail(ctx, kind), warning: (w) => openWarning(ctx, w), credits: (which) => openCredits(ctx, which),
    settings: (page) => openSettings(ctx, page),
  });
  core.start(fw);
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
  let shown = null, onScreen = false, opening = 0;
  const draw = (id = shown) => { if (onScreen && id) { try { views.get(id)?.draw(); } catch (e) { console.error(e); } } };
  const header = () => {
    if (!onScreen) return;
    const p = core.place(), S = core.S, t = titleOf(p), c = S.wx && (S.wx.current || I.hourAt(S.wx, nowWall(S.wx.place.offset)));
    fw.header.set({
      title: t,
      compactTitle: c ? `${t} · ${S.f.temp(c.temp)}` : t,
      pick: { label: "Places", run: () => ctx.open.places() },
      line: core.headerLine() || (S.loading ? "Loading the forecast…" : S.error && S.error !== core.SYNC_ERROR ? S.error : ""),
      acts: [{ icon: "settings", label: "Weather Settings", run: () => ctx.open.settings(null) }],
      badges: { warnings: core.warningsInForce() },
    });
  };
  const offs = [
    core.on("wx", () => { header(); draw(); }),
    core.on("place", () => { header(); draw(); }),
    core.on("settings", () => { header(); draw(); }),
    core.on("loading", () => { header(); draw(); }),
    core.on("error", () => { header(); draw(); }),
    // (only the section on show is drawn, §7.3: Now's account card when Now shows)
    core.on("ask", () => { if (shown === "now") draw("now"); }),
    core.on("acct", () => { if (shown === "now") draw("now"); }),
  ];
  // your saved places, on this device (connector.search, the same words), with their temperature now
  const unprovide = fw.search?.provide?.({
    id: "places", group: "Weather", order: 20,
    search: (q) => connector.search(q).map((e) => {
      if (!e.href.startsWith("/weather/?")) return e;
      const u = new URLSearchParams(e.href.slice(e.href.indexOf("?") + 1)), k = core.peek({ lat: Number(u.get("lat")), lon: Number(u.get("lon")) });
      return k ? { ...e, sub: [e.sub, core.S.f.temp(k.temp)].filter(Boolean).join(" · ") } : e;
    }),
  }) || (() => {});
  // (a day asked for in the address: opened once there's a forecast to open it on, up to 20 s; a later one takes over)
  const whenReady = (my) => new Promise((done) => {
    const t0 = Date.now(), look = () => (my !== opening ? done(false) : core.S.wx ? done(true) : Date.now() - t0 > 20e3 ? done(false) : setTimeout(look, 150));
    look();
  });
  const openDayWhenReady = async (key) => {
    const my = ++opening;
    if (!(await whenReady(my))) return;
    if (!core.S.wx.daily?.some((d) => d.key === key)) { fw.toast("That day isn’t in the forecast now."); return; }
    ctx.open.day(key);
  };
  return {
    async show(route, hint = null) {
      const id = core.sectionOf(route);
      ctx.hint = hint || null;
      if (route?.query) core.fromLink(route.query, { confirm: (p) => ctx.open.confirm(p) }).catch((e) => console.error(e));
      if (shown && shown !== id) { try { views.get(shown).hide(); } catch (e) { console.error(e); } }
      for (const [k, el] of secs) el.hidden = k !== id;
      shown = id; onScreen = true;
      core.shown(true);
      header();
      draw(id);
      if (route?.key === "day" && route.arg) openDayWhenReady(route.arg);
      else if (route?.key === "settings") ctx.open.settings(route.arg || null);
    },
    hide() {
      onScreen = false;
      core.shown(false);
      if (shown) { try { views.get(shown).hide(); } catch (e) { console.error(e); } }
    },
    back: () => false,
    busy: () => core.busy(),
    sendable() {
      const S = core.S, wx = S.wx;
      if (!wx) return null;
      const now = nowWall(wx.place.offset), said = I.headline(wx, now, S.f), p = core.place();
      let card = null;
      try { card = weatherSendCard(wx, now, S.f, { activities: S.settings.activities, name: p?.name || wx.place.name, headline: said }); } catch (e) { console.error(e); }
      const words = card?.say || said;
      return words ? { words, packed: packCard(card), what: "the forecast" } : null;
    },
    unmount() {
      opening++;
      onScreen = false;
      for (const off of offs) off();
      unprovide();
      for (const v of views.values()) { try { v.destroy(); } catch (e) { console.error(e); } }
      for (const el of secs.values()) el.remove();
      secs.clear(); views.clear(); shown = null;
      core.stop();
    },
  };
}
