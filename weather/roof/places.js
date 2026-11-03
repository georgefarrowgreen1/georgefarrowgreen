// Weather's Places sheet (One roof, spec §7.1, WX, D19, UI8, UI10, RI19) and the "Add “X” to your places?" sheet.
// openPlaces(ctx) → sheet Handle | null: data-sheet=places; your places as one-tap rows [data-place=<index in S.places>]
//   at the top (the current one aria-current="true", ticked, each with core.peek's temperature); Edit ([data-act=edit]:
//   delete [data-act=delete], Move Up/Down [data-act=up|down], each move said in an aria-live line); Find a place
//   (input[type=search], focused by its own tap; results [data-found], from data.js searchPlaces); Use My Location
//   ([data-act=locate], core.locate).
// confirmPlace(ctx, p) → Promise<"add" | "look" | null>: data-sheet=confirm-place, buttons [data-act=add] (Add) and
//   [data-act=look] (Just Look); null when it's closed otherwise.
// Every string from data goes in through textContent; no style attribute, no inline handler.
import { searchPlaces } from "../data.js";
import { weatherIcon } from "../icons.js";
import { iconOf, label } from "../codes.js";

// an element: attrs (class, text, data, aria, on, any other attribute), children (Node | string | null)
function h(doc, tag, attrs = {}, ...kids) {
  const n = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k === "data") for (const [d, x] of Object.entries(v)) n.dataset[d] = x;
    else if (k === "on") for (const [e, fn] of Object.entries(v)) n.addEventListener(e, fn);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
  return n;
}
// (one of the app's own icons, an SVG string of its own making, never data)
const svg = (doc, markup, cls) => { const t = doc.createElement("template"); t.innerHTML = markup; const s = h(doc, "span", { class: cls, "aria-hidden": "true" }); s.append(t.content); return s; };
const TICK = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.2 4.2L19 7"/></svg>';
const ARROW = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M20.2 3.8 3.9 10.6c-.7.3-.6 1.3.1 1.5l6.6 1.3 1.3 6.6c.2.7 1.2.8 1.5.1l6.8-16.3z"/></svg>';

const docOf = (ctx) => ctx.fw.screenEl?.ownerDocument || globalThis.document;
const nameOf = (p) => (p.gps && p.name === "My Location" ? "My Location" : p.name);

export function openPlaces(ctx) {
  const { core, fw } = ctx, S = core.S, doc = docOf(ctx);
  let editing = false, handle = null, timer = 0, seq = 0;
  const list = h(doc, "div", { class: "ifl-list wx-places", role: "list", "aria-label": "Your places" });
  const say = h(doc, "p", { class: "wx-say", "aria-live": "polite" });
  const edit = h(doc, "button", { class: "ifl-btn ifl-btn-sm wx-edit", type: "button", data: { act: "edit" }, "aria-pressed": "false", on: { click: () => { editing = !editing; draw(); } } }, "Edit");
  const locate = h(doc, "button", { class: "ifl-btn wx-locate", type: "button", data: { act: "locate" }, on: { click: async () => {
    if (locate.disabled) return;
    locate.disabled = true; locate.setAttribute("aria-busy", "true");
    const p = await core.locate(false);
    locate.disabled = false; locate.removeAttribute("aria-busy");
    if (p) handle?.close();
  } } }, svg(doc, ARROW, "wx-ic"), "Use My Location");
  const field = h(doc, "input", { type: "search", class: "wx-find", placeholder: "Find a place", "aria-label": "Find a place", autocomplete: "off", enterkeyhint: "search", spellcheck: "false" });
  const found = h(doc, "div", { class: "ifl-list wx-found", role: "list", "aria-label": "Places found" });
  const foundSaid = h(doc, "p", { class: "wx-say", "aria-live": "polite" });

  function row(p, i) {
    const k = core.peek(p), f = S.f, current = i === S.cur && !core.looking();
    const sub = [p.gps && p.name !== "My Location" ? "My Location" : p.approx ? "Roughly where you are" : (p.region || "").split(",")[0], k ? f.time(Date.now() + (k.offset || 0) * 1000) : null].filter(Boolean).join(" · ");
    const go = h(doc, "button", { class: "wx-place-go", type: "button", disabled: editing,
      "aria-label": `${nameOf(p)}${k ? `: ${f.temp(k.temp)}, ${label(k.code, k.isDay)}` : ""}${current ? ", showing" : ""}`,
      on: { click: () => { if (editing) return; handle?.close(); if (!current) core.setPlace(i); } } },
      h(doc, "span", { class: "wx-place-tick", "aria-hidden": "true" }, current ? svg(doc, TICK, "wx-ic") : null),
      h(doc, "span", { class: "wx-place-t" }, h(doc, "span", { class: "wx-place-name" }, p.gps ? svg(doc, ARROW, "wx-ic wx-here") : null, nameOf(p)), sub ? h(doc, "span", { class: "wx-place-sub" }, sub) : null),
      k ? svg(doc, weatherIcon(iconOf(k.code, k.isDay), 26), "wx-place-icon") : null,
      h(doc, "span", { class: "wx-place-temp" }, k ? f.temp(k.temp) : ""));
    const moved = (by) => {
      if (!core.movePlace(i, by)) return;
      const at = i + by, p2 = S.places[at];
      draw();
      say.textContent = `${nameOf(p2)} moved to ${at + 1} of ${S.places.length}.`;
      list.querySelector(`[data-place="${at}"] [data-act="${by < 0 ? "up" : "down"}"]:not([disabled])`)?.focus() || list.querySelector(`[data-place="${at}"] button:not([disabled])`)?.focus();
    };
    const tools = editing ? h(doc, "span", { class: "wx-place-tools" },
      h(doc, "button", { class: "ifl-icon-btn", type: "button", data: { act: "up" }, "aria-label": `Move ${nameOf(p)} up`, disabled: i === 0, on: { click: () => moved(-1) } }, "↑"),
      h(doc, "button", { class: "ifl-icon-btn", type: "button", data: { act: "down" }, "aria-label": `Move ${nameOf(p)} down`, disabled: i === S.places.length - 1, on: { click: () => moved(1) } }, "↓"),
      S.places.length > 1 ? h(doc, "button", { class: "ifl-icon-btn wx-del", type: "button", data: { act: "delete" }, "aria-label": `Delete ${nameOf(p)}`, on: { click: () => {
        const name = nameOf(p);
        core.removePlace(i);
        draw();
        say.textContent = `${name} removed.`;
        (list.querySelector(`[data-place="${Math.min(i, S.places.length - 1)}"] [data-act=delete]`) || edit).focus();
      } } }, "Delete") : null) : null;
    return h(doc, "div", { class: "ifl-row wx-place", role: "listitem", data: { place: String(i) }, "aria-current": current ? "true" : "false" }, go, tools);
  }
  function draw() {
    list.replaceChildren(...S.places.map(row));
    edit.textContent = editing ? "Done" : "Edit";
    edit.setAttribute("aria-pressed", String(editing));
    edit.hidden = S.places.length < 2 && !editing;
  }
  // Find a place: Open-Meteo's place search, a moment after the typing stops (data.js searchPlaces; the words go to it
  // only from this field, as in Weather today)
  function search() {
    clearTimeout(timer);
    const q = field.value.trim();
    if (q.length < 2) { seq++; found.replaceChildren(); foundSaid.textContent = ""; return; }
    timer = setTimeout(async () => {
      const my = ++seq;
      let got = null;
      try { got = await searchPlaces(q); } catch (_) {}
      if (my !== seq) return;
      if (!got) { found.replaceChildren(); foundSaid.textContent = "Search isn’t available right now."; return; }
      found.replaceChildren(...got.map((p, n) => h(doc, "button", { class: "ifl-row wx-found-row", type: "button", role: "listitem", data: { found: String(n) }, on: { click: () => {
        const i = core.addPlace(p, false);
        handle?.close();
        core.setPlace(i);
      } } }, h(doc, "span", { class: "wx-place-t" }, h(doc, "span", { class: "wx-place-name" }, p.name), p.region ? h(doc, "span", { class: "wx-place-sub" }, p.region) : null))));
      foundSaid.textContent = got.length ? `${got.length} ${got.length === 1 ? "place" : "places"} found` : "No places found.";
    }, 280);
  }
  field.addEventListener("input", search);
  field.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); found.querySelector("[data-found]")?.click(); } });

  const body = h(doc, "div", { class: "wx-places-sheet" },
    h(doc, "div", { class: "wx-places-head" }, h(doc, "h3", { class: "ifl-label", text: "Your places" }), edit),
    list, say, locate,
    h(doc, "label", { class: "wx-find-label" }, h(doc, "span", { class: "ifl-label", text: "Find a place" }), field),
    foundSaid, found);
  draw();
  const offs = [core.on("place", draw), core.on("wx", () => { if (!editing) draw(); })];
  handle = fw.sheet.open({ sheet: "places", title: "Places", body, app: "weather", onClose: () => { clearTimeout(timer); seq++; for (const off of offs) off(); } });
  // (the places' temperatures, for those with no forecast kept here)
  core.glanceAll().then((news) => { if (news && !editing) draw(); }).catch(() => {});
  return handle;
}

export async function confirmPlace(ctx, p) {
  const { fw } = ctx, doc = docOf(ctx);
  return new Promise((done) => {
    let answered = false, handle = null;
    const answer = (a) => { if (answered) return; answered = true; done(a); handle?.close(); };
    const body = h(doc, "div", { class: "wx-confirm" },
      h(doc, "p", { class: "wx-confirm-line", text: p.region ? `${p.region}. It’ll be kept with your places on every device you’re signed in on.` : "It’ll be kept with your places on every device you’re signed in on." }),
      h(doc, "div", { class: "wx-confirm-acts" },
        h(doc, "button", { class: "ifl-btn ifl-btn-primary", type: "button", data: { act: "add" }, on: { click: () => answer("add") } }, "Add"),
        h(doc, "button", { class: "ifl-btn", type: "button", data: { act: "look" }, on: { click: () => answer("look") } }, "Just Look")));
    handle = fw.sheet.open({ sheet: "confirm-place", title: `Add “${p.name}” to your places?`, body, app: "weather", onClose: () => { if (!answered) { answered = true; done(null); } } });
    if (!handle) { answered = true; done(null); }
  });
}
