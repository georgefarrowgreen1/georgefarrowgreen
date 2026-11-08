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
// Loading on open (stage 2 S2-D5, §4.5, C4): the static graph is Now, Radar and what every section needs. days.js,
// warnings.js (sections), places.js, wxsettings.js and wxdetail.js (sheets) load through fw.lazy(() => import("…")) the
// first time they're wanted, once each, and are listed in connector.lazy. Till its file is in, a section shows a
// skeleton (a lazy stub view: the real view made and drawn once it loads, if its section still shows) and a sheet, if
// its file takes over LOADING_MS, a skeleton sheet of the same name, swapped for the real one (or, closed meanwhile, the
// opener does nothing). So an opener answers its Handle (file in) or a Promise of it (null if closed or failed);
// open.confirm always a Promise of "add" | "look" | null.
// A view's draw() runs when its section shows and on core's events while it shows; hide() when it's left; destroy() on
// unmount. The header (fw.header.set, while the screen shows): title = the place, pick { label: "Places", run: () =>
// open.places() } (the ▾), line "14° · Rain from 15:00" (core.headerLine), compactTitle "London · 14°", acts: Weather
// Settings only ({ icon: "settings", label: "Weather Settings", run: () => open.settings(null) }), badges { warnings: n }
// (official warnings in force). The module's search provider (your places on this device, and Weather Settings)
// replaces the framework's places provider while it's mounted (D16: the query never leaves the page).
import * as core from "./core.js";
import { connector } from "./connector.js";
import { view as nowView } from "./now.js";
import { view as radarView } from "./radarview.js";
import { weatherSendCard, packCard } from "../send.js";
import { nowWall } from "../format.js";
import * as I from "../insights.js";

export const CONTRACT = 1;
export const BUILD = "1.90";
export const NEWS = "Pinch zoom is available throughout InFlite";
export const SECTIONS = [["now", "Now"], ["days", "16 Days"], ["radar", "Radar"], ["warnings", "Warnings"]];

// (a sheet whose file takes longer than this to come shows a skeleton sheet till it's in)
const LOADING_MS = 150;

// A section whose file loads on its first show: a skeleton till then; its real view made once the file is in, and drawn
// if the section still shows. load() → Promise<module with view(el, ctx)>.
function lazyView(load) {
  return (el, ctx) => {
    let real = null, on = false, dead = false, asked = null;
    const get = () => (asked ||= load().then((m) => { if (!dead && !real) real = m.view(el, ctx); return real; }, (e) => { asked = null; throw e; }));
    const v = {
      // (its file fetched ahead, at a quiet moment once Weather shows: its first show then drawn at once, no skeleton)
      warm() { if (!real && !dead) get().catch(() => {}); },
      draw() {
        on = true;
        if (real) return real.draw();
        if (!el.firstChild || el.dataset.failed) { delete el.dataset.failed; el.replaceChildren(ctx.fw.ui.skeleton("rows", 3)); }
        get().then((rv) => { if (rv && on && !dead) rv.draw(); }).catch((e) => {
          console.error(e);
          if (dead || real) return;
          el.dataset.failed = "1";
          el.replaceChildren(ctx.fw.ui.error({ title: "This didn’t load.", body: globalThis.navigator?.onLine === false ? "It needs a connection the first time." : "Try again in a moment.",
            acts: [{ label: "Try Again", act: "retry", run: () => { if (on && !dead) v.draw(); } }] }));
        });
      },
      hide() { on = false; real?.hide(); },
      destroy() { dead = true; on = false; real?.destroy(); el.replaceChildren(); },
    };
    return v;
  };
}

// (the place's name as the header shows it)
const titleOf = (p) => (p ? (p.gps && p.name === "My Location" ? "My Location" : p.name) : "Weather");

export async function mount(root, fw) {
  const ctx = { S: core.S, core, fw, open: {}, hint: null };
  let alive = true;
  // the lazy files (C4: each a literal, for connector.lazy's test), asked for once; a failure lets the next ask try again
  // (fw.lazy's q: "" at first, "?retry=<n>" after a failed import, so Try Again fetches afresh: joint contracts §7;
  // none from a frame older than that)
  const LAZY = {
    days: () => fw.lazy((q) => import("./days.js" + (q || ""))),
    warnings: () => fw.lazy((q) => import("./warnings.js" + (q || ""))),
    places: () => fw.lazy((q) => import("./places.js" + (q || ""))),
    wxsettings: () => fw.lazy((q) => import("./wxsettings.js" + (q || ""))),
    wxdetail: () => fw.lazy((q) => import("./wxdetail.js" + (q || ""))),
  };
  const mods = {}, asked = {};
  const load = (f) => (asked[f] ||= LAZY[f]().then((m) => (mods[f] = m), (e) => { delete asked[f]; throw e; }));
  // (on screen: show() sets it, hide() clears it; seen: how many times Weather has been left, so a sheet asked for before
  // the person left never opens over what they went to, nor when they come back)
  let shown = null, onScreen = false, opening = 0, seen = 0;
  // an opener from a lazy file: at once once it's in; else, past LOADING_MS, a skeleton sheet of its name till it is. One
  // ask at a time: a second tap while the file comes gets the first's promise and opens nothing more. The real sheet opens
  // only if Weather still shows (never left meanwhile) and the skeleton sheet, if it came, wasn't put away (its close
  // begun: Escape, ✕, a drag, a route change's closeAll)
  const opener = (f, sheet, run) => {
    let pending = null;
    return (...a) => {
      if (mods[f]) return run(mods[f], ...a);
      if (pending) return pending;
      const mine = seen, here = () => alive && onScreen && seen === mine;
      let ph = null;
      const t = setTimeout(() => { if (here()) ph = fw.sheet.open({ sheet, label: "Loading", body: fw.ui.skeleton("rows", 3), app: "weather" }); }, LOADING_MS);
      const away = () => ph && (ph.closed || ph.el?.classList?.contains("closing"));
      return (pending = load(f).then((m) => {
        clearTimeout(t);
        if (away()) return null;
        ph?.now();
        return here() ? run(m, ...a) : null;
      }, (e) => {
        clearTimeout(t);
        ph?.now?.();
        console.error(e);
        if (alive) fw.toast(globalThis.navigator?.onLine === false ? "That needs a connection the first time." : "That didn’t open. Try again in a moment.");
        return null;
      }).finally(() => { pending = null; }));
    };
  };
  Object.assign(ctx.open, {
    places: opener("places", "places", (m) => m.openPlaces(ctx)),
    confirm: opener("places", "confirm-place", (m, p) => m.confirmPlace(ctx, p)),
    day: opener("days", "day", (m, key) => m.openDay(ctx, key)),
    detail: opener("wxdetail", "detail", (m, kind) => m.openDetail(ctx, kind)),
    warning: opener("warnings", "warning", (m, w) => m.openWarning(ctx, w)),
    credits: opener("wxdetail", "credits", (m, which) => m.openCredits(ctx, which)),
    settings: opener("wxsettings", "wxsettings", (m, page) => m.openSettings(ctx, page)),
  });
  const VIEWS = { now: nowView, days: lazyView(() => load("days")), radar: radarView, warnings: lazyView(() => load("warnings")) };
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
  // (the other sections' files fetched once (not when Save Data is asked for), a moment after Weather first shows, so a first switch to one is instant)
  let warmed = false, warmT = 0;
  const warm = () => { if (warmed || warmT) return; warmT = setTimeout(() => { warmT = 0; if (!onScreen || fw.stale?.() || globalThis.navigator?.connection?.saveData) return; warmed = true; for (const v of views.values()) v.warm?.(); }, 1200); };
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
  // (a section about to be swiped to and never drawn: drawn now, out of sight, so it comes in with its words; not Radar,
  // whose map is made as it shows: Today's swipe.js)
  const peek = (e) => { const id = e.detail; if (onScreen && id !== "radar" && views.has(id) && !secs.get(id)?.childElementCount) { try { views.get(id).draw(); } catch (x) { console.error(x); } } };
  root.addEventListener("ifl-peek", peek);
  const offs = [
    () => root.removeEventListener("ifl-peek", peek),
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
      warm();
    },
    hide() {
      onScreen = false;
      seen++;
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
      alive = false;
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
