// Weather's Radar section (One roof, spec §7.1, WX, RB3, UB1, UI9, RI11): stamps the radar card markup weather/radar.js
// expects (.radar-map in [data-no-edge], #radar-said, .radar-wrap, .radar-play, .radar-slider, .radar-time,
// .radar-status, .radar-chip, .radar-hint, .radar-scale, .radar-legend, .card-title, .radar-note; no .radar-full), and:
//   fw.fill(true) on show (the map fills the window from the header to the tab bar, the root doesn't scroll);
//   the radar stack only through fw.lazy(() => import("../radar.js")), on first show;
//   radar(card, { full: false, explore: true, light: fw.theme() === "light" }), destroyed and made again when the theme
//   changes (fw.on("theme"));
//   the place, the other saved places, the warnings' areas and the place's bubble fed from core (app.js pinOnMap);
//   hide() lets its IntersectionObserver pause it; after 5 minutes out of sight the map is destroyed, made again on its
//   next show; unmount (destroy) destroys it;
//   offline with no map yet: "Radar needs a connection";
//   Send: the forecast card (fw.sendButton), in the overlay with the legend.
// view(el, ctx) → { draw(), hide(), destroy() } (every section view's signature, now.js says how).
import { weatherSendCard, packCard } from "../send.js";
import { nowWall } from "../format.js";
import * as I from "../insights.js";
import { weatherIcon } from "../icons.js";
import { iconOf } from "../codes.js";
import { inForce, colourOf, titleOf } from "../official.js";
import { cell } from "../data.js";
import * as A from "../account.js";

const AWAY = 5 * 60e3;

function h(doc, tag, attrs = {}, ...kids) {
  const n = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k === "data") for (const [d, x] of Object.entries(v)) n.dataset[d] = x;
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
  return n;
}
// (the play button's two glyphs, as Weather's own page puts them in: app.js wire)
const PLAY = '<span class="ic g-off"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 5.6v12.8c0 .8.9 1.3 1.6.9l10-6.4c.6-.4.6-1.3 0-1.7l-10-6.4C8.9 4.3 8 4.8 8 5.6z"/></svg></span>'
  + '<span class="ic g-on"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg></span>';

export function view(el, ctx) {
  const { core, fw } = ctx, S = core.S, doc = el.ownerDocument;
  let card = null, sendSlot = null, off = null, r = null, lib = null, starting = null, awayT = 0, onScreen = false, dead = false, fedAt = "";
  const offs = [];

  function stamp() {
    if (card) return;
    const play = h(doc, "button", { class: "icon-btn small radar-play", type: "button", "aria-label": "Play", data: { on: "0" } });
    const t = doc.createElement("template"); t.innerHTML = PLAY; play.append(t.content);
    off = h(doc, "p", { class: "wx-radar-off", role: "status", hidden: true }, "Radar needs a connection");
    sendSlot = h(doc, "div", { class: "wx-radar-send" });
    card = h(doc, "div", { class: "radar wx-radar", "data-no-edge": true, "aria-labelledby": "wx-radar-title" },
      h(doc, "h2", { class: "card-title wx-sr", id: "wx-radar-title" }, "Rain radar"),
      h(doc, "p", { class: "radar-note" }, h(doc, "span")),
      h(doc, "div", { class: "radar-wrap" },
        h(doc, "div", { class: "radar-map", role: "region", "aria-label": "Rain radar map", "aria-describedby": "radar-said" }),
        h(doc, "p", { class: "wx-radar-said", id: "radar-said" }),
        h(doc, "span", { class: "radar-chip", data: { kind: "radar" }, "aria-hidden": "true" }, h(doc, "span", { class: "rc-l", data: { k: "radar" } }, "Radar"), h(doc, "span", { class: "rc-l", data: { k: "model" } }, "Forecast")),
        h(doc, "span", { class: "radar-hint", hidden: true }, "Tap to explore"),
        off),
      h(doc, "div", { class: "wx-radar-over" },
        h(doc, "div", { class: "wx-radar-top" },
          h(doc, "div", { class: "radar-legend", role: "img", "aria-label": "Colours: light rain blue, moderate purple, heavy orange to yellow, extreme pale yellow; snow cyan to teal" }),
          sendSlot),
        h(doc, "div", { class: "radar-dock" },
          h(doc, "div", { class: "radar-bar" }, play,
            h(doc, "div", { class: "radar-track" },
              h(doc, "input", { class: "radar-slider", type: "range", min: "0", max: "0", value: "0", step: "1", "aria-label": "Radar time" }),
              h(doc, "div", { class: "radar-scale", "aria-hidden": "true" }))),
          h(doc, "p", { class: "radar-time", "aria-live": "off" })),
        h(doc, "p", { class: "chart-note radar-status" }, h(doc, "span"))));
    el.replaceChildren(card);
  }
  // the map let go of (5 minutes out of sight, the theme changed, unmount): made again on the next show
  function release() {
    clearTimeout(awayT); awayT = 0;
    try { r?.destroy(); } catch (e) { console.error(e); }
    r = null; starting = null; fedAt = "";
    card?.remove(); card = null; sendSlot = null; off = null;
  }
  const opts = () => ({
    time: (t) => S.f.time(t + (S.wx?.place.offset ?? 0) * 1000), day: (t) => S.f.dayName(t + (S.wx?.place.offset ?? 0) * 1000), miles: () => S.f.units.wind === "mph",
    credits: () => ctx.open.credits("map"), temp: (c) => S.f.temp(c), tempUnit: () => (S.f.units.temp === "f" ? "°F" : "°C"), windNum: (k) => Math.round(S.f.windNum(k)), windUnit: () => S.f.windUnit,
    // (rain expected here in the next two hours: worth the models' grid, where the radar has no track to follow)
    rainSoon: () => { const w = S.wx; if (!w) return true; const now = nowWall(w.place.offset); return (w.minutely || []).some((x) => x.precip >= 0.05) || I.hoursFrom(w, now, 3).some((x) => (x.precip ?? 0) >= 0.1 || (x.pop ?? 0) >= 40); },
  });
  function make() {
    if (r || starting || dead) return;
    const p = core.place();
    if (!p) return;
    const online = globalThis.navigator?.onLine !== false;
    if (off) off.hidden = online || !!lib;
    if (!online && !lib) return;
    const my = card;
    let run = null;
    run = starting = (async () => {
      lib ||= await fw.lazy(() => import("../radar.js"));
      if (dead || my !== card || r) return;
      if (off) off.hidden = true;
      r = lib.radar(card, { ...opts(), lat: p.lat, lon: p.lon, full: false, explore: true, light: fw.theme() === "light" });
      // (the radar's handle on its card, for the tests and the console: card.radar.state())
      card.radar = r;
      feed(true);
    })().catch((e) => {
      console.error(e);
      if (my === card && off) { off.textContent = globalThis.navigator?.onLine === false ? "Radar needs a connection" : "The radar isn’t available right now."; off.hidden = false; }
    }).finally(() => { if (starting === run) starting = null; });
  }
  // the place, its bubble, the other saved places (a tap goes to one) and the warnings' areas (app.js pinOnMap)
  function feed(force = false) {
    if (!r) return;
    const p = core.place(), wx = S.wx;
    if (!p) return;
    r.place(p.lat, p.lon);
    if (!wx) return;
    const now = nowWall(wx.place.offset), c = wx.current || I.hourAt(wx, now);
    const key = JSON.stringify([p.lat, p.lon, wx.fetchedAt, S.now, S.places.length, S.cur, S.settings.temp]);
    if (!force && key === fedAt) return;
    fedAt = key;
    if (c) r.mark({ temp: S.f.temp(c.temp), icon: weatherIcon(iconOf(c.code, c.isDay), 22), name: p.gps ? "My Location" : p.name || "", colour: core.pinHue(c.temp) });
    const here = cell(wx.place.lat, wx.place.lon);
    const at = (q) => S.places.findIndex((x) => (q.gps ? x.gps : !x.gps && A.keyOf(x) === A.keyOf(q)));
    r.others(S.places.map((q, i) => ({ q, i })).filter(({ q, i }) => (core.looking() || i !== S.cur) && cell(q.lat, q.lon) !== here).map(({ q }) => {
      const k = core.peek(q);
      return { name: q.gps ? "My Location" : q.name, lat: q.lat, lon: q.lon, temp: k ? S.f.temp(k.temp) : "", colour: k ? core.pinHue(k.temp) : null, go: () => { const i = at(q); if (i >= 0) core.setPlace(i); } };
    }));
    r.warnings(inForce(wx.official).filter((w) => w.areas?.length).map((w) => ({ id: w.id, title: w.event || titleOf(w), colour: colourOf(w), onset: w.onset, expires: w.expires, open: !!w.open, rings: w.areas })));
  }
  // Send: the forecast here, as a card (send.js), through InFlite's one Send (fw.sendButton)
  let sentFor = "";
  function sendButton() {
    const wx = S.wx;
    if (!sendSlot) return;
    // (no Send on the radar inside InFlite: the slot stays empty, and the legend takes the width)
    if (sendSlot) { sendSlot.replaceChildren(); sentFor = ""; return; }
    if (!wx || typeof fw.sendButton !== "function") { sendSlot.replaceChildren(); sentFor = ""; return; }
    const key = `${wx.fetchedAt}|${S.now}|${core.place()?.name}|${S.settings.temp}`;
    if (key === sentFor && sendSlot.firstChild) return;
    sentFor = key;
    const now = nowWall(wx.place.offset), said = I.headline(wx, now, S.f), p = core.place();
    let c = null;
    try { c = weatherSendCard(wx, now, S.f, { activities: S.settings.activities, name: p?.name || wx.place.name, headline: said }); } catch (e) { console.error(e); }
    const b = fw.sendButton({ words: c?.say || said, packed: packCard(c), what: "the forecast" });
    sendSlot.replaceChildren(...(b ? [b] : []));
  }
  offs.push(fw.on?.("theme", () => {
    // (the map's day or night style is chosen as it's made: made again in the new one, if it's on show; else on its next)
    if (!r && !starting) return;
    release();
    if (onScreen) { stamp(); make(); sendButton(); }
  }) || (() => {}));
  offs.push(core.on("place", () => { if (r) feed(true); }));

  // (Radar used on this device before: its map made ahead, out of sight, so its next show is at once; else only its files)
  const USED = "wx:radar-used";
  const used = () => { try { return localStorage.getItem(USED) === "1"; } catch (_) { return false; } };
  return {
    warm() {
      if (dead || r || starting || onScreen || globalThis.navigator?.onLine === false || globalThis.navigator?.connection?.saveData) return;
      const go = () => {
        if (dead || r || starting || onScreen || fw.stale?.()) return;
        if (!used()) { if (!lib) fw.lazy(() => import("../radar.js")).then((m) => { lib ||= m; }, () => {}); return; }
        stamp(); make();
        // (made and never shown: let go after the same five minutes as one shown and left)
        clearTimeout(awayT); awayT = setTimeout(() => { if (!onScreen) release(); }, AWAY);
      };
      (globalThis.requestIdleCallback || ((f) => setTimeout(f, 1)))(() => setTimeout(go, 1500), { timeout: 4000 });
    },
    draw() {
      if (dead) return;
      onScreen = true;
      try { localStorage.setItem(USED, "1"); } catch (_) {}
      clearTimeout(awayT); awayT = 0;
      fw.fill(true);
      stamp();
      if (r) { feed(); r.refresh(); } else make();
      sendButton();
    },
    hide() {
      onScreen = false;
      fw.fill(false);
      clearTimeout(awayT);
      if (r || starting) awayT = setTimeout(() => { if (!onScreen) release(); }, AWAY);
    },
    destroy() {
      dead = true; onScreen = false;
      for (const o of offs.splice(0)) { try { o(); } catch (_) {} }
      release();
      el.replaceChildren();
    },
  };
}
