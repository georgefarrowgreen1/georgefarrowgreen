// Pigeons' sheets under the roof (stage 3 spec §2.2; Chat's flight views and sheets, pigeon/app.js): the Flight Log and
// its passport, the map of a flight, the skies and Look Up, how a chat sends (the way), a spot on the Moon or Mars, your
// pigeons (each one, and naming one), a friend's loft, Coots and the shop, friends' news. Lazy and network-only (not
// kept offline: "Needs a connection"); the geodata it reads (../moon.js, ../space.js, ../land.js, ../placegrid.js,
// ../places.js, ../countries.js, ../shapes.js) comes with it.
// Frozen openers (ctx = { fw, svc, store, open }), each → sheet Handle:
//   openFlightLog(ctx) flightlog · openPassport(ctx) passport · openMap(ctx, msgId) map · openSkies(ctx) skies ·
//   openLookUp(ctx) lookup · openWay(ctx, id) way · openMoonPick(ctx, which) moonpick · openBirds(ctx) birds ·
//   openBird(ctx, id) bird · openBirdName(ctx, id?) birdname · openLoft(ctx, id?) loft · openFeathers(ctx) feathers ·
//   openNews(ctx) news
// Everything comes through meta() (META's names: flight-log, loft, feathers, feathers-buy, bird-wear, bird-retire, skies,
// way, news, me) and the store (me, friends, groups, chat:<id>); nothing here carries message words. Countries and
// postmarks of a friend are counted, never named (the loft, as Chat). Drawings are canvases and qr/shape SVG made here
// from numbers; every string from data goes in through textContent.
import { LAND } from "../land.js";
import { BODIES, siteName, farSide, drawPick, pickAt } from "../moon.js";
import { placeAt } from "../placegrid.js";
import { nearestPlace } from "../places.js";
import { COUNTRIES } from "../countries.js";
import { SHAPES } from "../shapes.js";
import { earthKm } from "../space.js";

export const NEEDS_NET = "Needs a connection";
export const BIRDS_MAX = 5;
export const RANKS = Object.freeze([["Fledgling", 0], ["Courier", 500], ["Navigator", 2000], ["Veteran", 8000], ["Ace", 20000], ["Legend", 40075]]);
export const WEAR = Object.freeze({ satchel: ["Satchel", "👜"], daisy: ["Daisy", "🌼"], ribbon: ["Ribbon", "🎀"], scarf: ["Scarf", "🧣"], goggles: ["Goggles", "🥽"], shades: ["Sunglasses", "🕶️"], tophat: ["Top Hat", "🎩"], crown: ["Crown", "👑"] });
export const KIND_NAME = Object.freeze({ standard: "Standard", swift: "Swift", turbo: "Turbo", rocket: "Rocket", mystery: "Mystery", orbital: "Orbital", lunar: "Lunar", lunarx: "Lunar Express", laser: "Laser", dumb: "Lost" });
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const n0 = (x) => Math.round(+x || 0).toLocaleString("en-GB");
export const miles = (km) => `${n0((+km || 0) * 0.621371)} mi`;
const fmtDate = (t) => { const d = new Date(t); return Number.isFinite(+d) ? `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}` : ""; };
const fmtTime = (t) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
export function dur(ms) {
  const m = Math.max(0, Math.round(ms / 60e3));
  return m < 60 ? `${m} min` : m < 48 * 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${Math.round(m / 1440)} days`;
}
const first = (n) => String(n || "").trim().split(/\s+/)[0] || "";
// the flight log's figures as tiles: [value, label, sub]
export function logTiles(d) {
  const lap = (+d.km || 0) * 0.621371 / 24901, hrs = +d.hours || 0;
  return [
    [n0(d.sent), "Pigeons sent", d.flying ? `${d.flying} in the air now` : ""],
    [n0(d.received), "Pigeons received", ""],
    [hrs >= 48 ? `${n0(hrs / 24)} days` : `${n0(hrs)} h`, "In the air", "landed pigeons, end to end"],
    [d.longest ? miles(d.longest.km) : "–", "Longest flight", d.longest?.place ? `to ${d.longest.place}` : ""],
    [d.fastest ? `${n0(d.fastest.kmh * 0.621371)} mph` : "–", "Fastest pigeon", d.fastest?.kind ? `a ${String(KIND_NAME[d.fastest.kind] || "").toLowerCase()} pigeon` : ""],
    [d.tailwind ? `${n0(d.tailwind * 0.621371)} mph` : "–", "Best tailwind", ""],
    [n0(d.dodged), "Storms dodged", "went around them"],
    [lap >= 1 ? `${lap.toFixed(1)}×` : `${Math.round(lap * 100)}%`, "Around the world", ""],
  ];
}
export function rankNext(b) {
  const i = RANKS.findIndex((r) => r[0] === b.rank), next = RANKS[i + 1];
  return next ? { rank: next[0], km: next[1], from: RANKS[i][1] } : null;
}

function kit(ctx) {
  const { fw, svc, store, open = {} } = ctx, ui = fw.ui, el = ui.el;
  const get = (t) => store?.get?.(t);
  const meta = (name, args = { method: "GET" }) => svc.call("meta", name, args);
  const foot = (text) => el("p", { class: "chs-foot", text });
  const gone = [];
  const sheet = (spec) => fw.sheet.open({ app: "chats", ...spec, onClose: () => { for (const f of gone.splice(0)) { try { f(); } catch (_) {} } spec.onClose?.(); } });
  const row = (o, data = {}) => { const r = ui.row(o); for (const [k, v] of Object.entries(data)) if (v != null) r.dataset[k] = v; return r; };
  const fail = (box, e, again) => box.replaceChildren(ui.error({ title: e?.why === "offline" ? NEEDS_NET : "Couldn’t open this", body: e?.why === "offline" ? "This opens once you’re back online." : "Try again in a moment.", acts: again ? [{ label: "Try Again", act: "again", run: again }] : [] }));
  const stats = (pairs) => el("div", { class: "chf-stats" }, pairs.map(([v, l, s]) => el("div", { class: "chf-stat" }, el("b", { text: String(v) }), el("span", { text: l }), s ? el("small", { text: s }) : null)));
  // a body that asks once, then draws (with a Try Again on failure)
  const loads = (box, ask, draw) => { const go = () => { box.replaceChildren(ui.skeleton("rows", 3)); ask().then((d) => { if (box.isConnected !== false) draw(d); }, (e) => fail(box, e, go)); }; go(); };
  return { fw, svc, store, open, ui, el, get, meta, foot, sheet, row, stats, loads, gone, ctx };
}
const boxOf = (k, cls = "chs") => k.el("div", { class: cls });

/* ---------- the Flight Log ---------- */
export function openFlightLog(ctx) {
  const k = kit(ctx), { ui, el } = k, box = boxOf(k, "chs chf");
  const h = k.sheet({ sheet: "flightlog", title: "Flight Log", body: (b) => b.append(box) });
  k.loads(box, () => k.meta("flight-log"), (d) => {
    box.replaceChildren();
    if (!d?.sent) { box.append(ui.empty({ title: "No flights yet", body: "Send your first pigeon and its miles start here." })); return; }
    const lap = (+d.km || 0) * 0.621371 / 24901;
    const globe = el("div", { class: "chf-globe", "aria-hidden": "true" });
    globe.style.setProperty("--lap", Math.min(1, lap % 1 || (lap >= 1 ? 1 : 0)).toFixed(3));
    box.append(el("div", { class: "chf-hero" }, globe, el("div", {}, el("b", { text: miles(d.km) }), el("span", { text: "flown by your pigeons" }),
      el("small", { text: lap >= 1 ? `That’s ${lap.toFixed(1)} times around the world.` : `${Math.round(lap * 100)}% of the way around the world.` }))));
    box.append(k.stats(logTiles(d)));
    const pp = d.passport;
    if (pp) box.append(ui.list([k.row({ lead: { icon: "globe" }, title: "Passport", sub: `${+pp.countries || 0} countries · ${+pp.seas || 0} seas`, trail: "chevron", run: () => openPassport(ctx, d) }, { act: "passport" })], { label: "Passport" }));
    const kinds = Object.entries(d.kinds || {}).filter(([, v]) => v > 0), most = Math.max(1, ...kinds.map(([, v]) => v));
    if (kinds.length) box.append(ui.list(kinds.map(([kk, v]) => {
      const r = k.row({ title: KIND_NAME[kk] || kk, value: n0(v) }, { kind: kk });
      const bar = el("i", { class: "chf-bar", "aria-hidden": "true" }); bar.style.setProperty("--w", (v / most).toFixed(3)); r.append(bar);
      return r;
    }), { label: "By pigeon" }));
    const badges = Array.isArray(d.badges) ? d.badges : [];
    if (badges.length) box.append(el("h3", { class: "ifl-label", text: `Achievements · ${badges.filter((b) => b.earned).length} of ${badges.length}` }),
      el("div", { class: "chf-badges" }, [...badges].sort((a, b) => b.earned - a.earned).map((b) => el("div", { class: `chf-badge${b.earned ? " earned" : ""}` }, el("b", { text: b.name }), el("small", { text: b.desc })))));
    box.append(ui.list([k.row({ title: "Lost to Pigeon Death", value: n0(d.lost) }), k.row({ title: "Called back", value: n0(d.recalled) })]),
      k.foot(`${d.since ? `Since ${fmtDate(d.since)}. ` : ""}Worked out from distances and times only: what you wrote stays between you and your friends.`));
  });
  return h;
}

/* ---------- the passport ---------- */
export function openPassport(ctx, log = null) {
  const k = kit(ctx), { ui, el } = k, box = boxOf(k, "chs chp");
  const h = k.sheet({ sheet: "passport", title: "Passport", body: (b) => b.append(box) });
  const draw = (d) => {
    box.replaceChildren();
    const pp = d?.passport, list = Array.isArray(pp?.places) ? pp.places : [];
    if (!list.length) { box.append(ui.empty({ title: "No stamps yet", body: "Each country and sea your pigeons fly over gets a stamp, once they’ve landed." })); return; }
    box.append(k.stats([[+pp.countries || 0, "Countries", `of ${COUNTRIES.length}`], [+pp.seas || 0, "Seas"], [list.length, "Stamps"]]));
    box.append(el("div", { class: "chp-stamps" }, list.map((p) => {
      const s = el("div", { class: `chp-stamp${p.sea ? " sea" : ""}`, data: { name: p.name } });
      const path = !p.sea && SHAPES[String(p.name || "").replace(/^the /, "")];
      if (path) { const t = s.ownerDocument.createElement("template"); t.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true" class="chp-shape"><path d="${String(path).replace(/[^MmLlHhVvZz0-9 .,-]/g, "")}"/></svg>`; s.append(t.content); }
      s.append(el("b", { text: String(p.name || "").replace(/^the /, "") }), el("small", { text: p.at ? fmtDate(p.at) : "" }));
      return s;
    })));
    box.append(k.foot(`Each country and sea your pigeons fly over gets a stamp: only where, never what they carried.`));
  };
  if (log) draw(log); else k.loads(box, () => k.meta("flight-log"), draw);
  return h;
}

/* ---------- a flight on the map ---------- */
// the world's coastlines on a canvas, equirectangular, with the pins given ([lat, lon, tone])
export function drawWorld(cv, pins = []) {
  const g = cv.getContext?.("2d"); if (!g) return;
  const w = cv.width = cv.clientWidth * (globalThis.devicePixelRatio || 1) || 640, hh = cv.height = Math.round(w / 2);
  const X = (lon) => ((lon + 180) / 360) * w, Y = (lat) => ((90 - lat) / 180) * hh;
  const css = getComputedStyle(cv);
  g.fillStyle = css.getPropertyValue("--chf-sea") || "#cfe3f5"; g.fillRect(0, 0, w, hh);
  g.fillStyle = css.getPropertyValue("--chf-land") || "#e9e3d3";
  for (const ring of LAND.split(";")) {
    const v = ring.split(",").map(Number);
    g.beginPath();
    for (let i = 0; i < v.length; i += 2) { const x = X(v[i] / 2), y = Y(v[i + 1] / 2); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.closePath(); g.fill();
  }
  for (const [lat, lon, tone] of pins) { g.fillStyle = tone || "#ff9f0a"; g.beginPath(); g.arc(X(lon), Y(lat), 5 * (globalThis.devicePixelRatio || 1), 0, 2 * Math.PI); g.fill(); }
}
export function openMap(ctx, msgId) {
  const k = kit(ctx), { ui, el } = k, box = boxOf(k, "chs chm");
  let m = null;
  for (const c of [ctx.chat, ...(k.get("rows") || []).map((r) => r.id)]) { const v = c && k.get(`chat:${c}`); m = v?.msgs?.find((x) => x.id === msgId) || null; if (m) break; }
  const f = m?.flight;
  const h = k.sheet({ sheet: "map", title: f?.flying ? "Pigeon in Flight" : "The Flight", body: (b) => b.append(box) });
  const cv = el("canvas", { class: "chm-map", "aria-label": "World map" });
  box.append(cv);
  const me = k.get("me") || {};
  try { drawWorld(cv, me.lat != null ? [[me.lat, me.lon, "#5a4fe0"]] : []); } catch (_) {}
  if (!f) { box.append(ui.empty({ title: "This flight isn’t on screen any more" })); return h; }
  const facts = [];
  if (f.lost) facts.push(k.row({ title: "Lost", sub: "To Pigeon Death" }));
  else if (f.waiting) facts.push(k.row({ title: "Booked to fly", value: f.landsAt ? `lands ${fmtTime(f.landsAt)}` : "" }));
  else if (f.flying) facts.push(k.row({ title: "Lands", value: f.landsAt ? `in ${dur(f.landsAt - Date.now())}` : "" }, { eta: f.landsAt ? String(f.landsAt) : null }));
  else facts.push(k.row({ title: "Landed", value: f.landsAt ? fmtTime(f.landsAt) : "" }));
  if (f.pigeon) facts.push(k.row({ title: "Pigeon", value: KIND_NAME[f.pigeon] || f.pigeon }));
  if (f.way) facts.push(k.row({ title: "The way", value: f.way }));
  box.append(ui.list(facts), k.foot("Only the places and the times are drawn here: never what it carries."));
  if (f.flying && f.landsAt) {
    const t = setInterval(() => { const r = box.querySelector("[data-eta] .ifl-val"); if (r) r.textContent = `in ${dur(f.landsAt - Date.now())}`; }, 1000);
    k.gone.push(() => clearInterval(t));
  }
  return h;
}

/* ---------- the skies, and Look Up ---------- */
export function openSkies(ctx) {
  const k = kit(ctx), { ui, el } = k, box = boxOf(k, "chs chm");
  const h = k.sheet({ sheet: "skies", title: "The Skies", body: (b) => b.append(box) });
  k.loads(box, () => k.meta("skies"), (d) => {
    box.replaceChildren();
    const birds = Array.isArray(d?.birds) ? d.birds : Array.isArray(d?.pigeons) ? d.pigeons : [];
    const cv = el("canvas", { class: "chm-map", "aria-label": `${birds.length} pigeons in the air` });
    box.append(cv);
    try { drawWorld(cv, birds.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon)).map((p) => [p.lat, p.lon])); } catch (_) {}
    box.append(k.foot(`${n0(birds.length)} pigeons in the air now, as rough dots: never a name, a message or a route.`));
  });
  return h;
}
export function openLookUp(ctx) {
  const k = kit(ctx), { ui, el } = k, box = boxOf(k, "chs");
  const h = k.sheet({ sheet: "lookup", title: "Look Up", body: (b) => b.append(box) });
  box.append(k.foot("Finding where you are…"));
  const g = globalThis.navigator?.geolocation;
  const near = (here, d) => {
    box.replaceChildren();
    const birds = (Array.isArray(d?.birds) ? d.birds : Array.isArray(d?.pigeons) ? d.pigeons : []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
      .map((p) => ({ ...p, km: earthKm(here.lat, here.lon, p.lat, p.lon) })).filter((p) => p.km < 500).sort((a, b) => a.km - b.km).slice(0, 8);
    const where = placeAt(here.lat, here.lon) || nearestPlace(here.lat, here.lon) || "";
    box.append(el("p", { class: "chs-foot", text: where ? `Over ${where}` : "Overhead" }));
    if (!birds.length) { box.append(ui.empty({ title: "Clear skies", body: "No pigeons within 300 miles just now." })); return; }
    box.append(ui.list(birds.map((p) => k.row({ lead: { icon: "bird" }, title: KIND_NAME[p.kind] || "A pigeon", value: miles(p.km) }))));
  };
  if (!g) { box.replaceChildren(ui.empty({ title: "Can’t tell where you are", body: "This browser can’t share your location." })); return h; }
  g.getCurrentPosition((pos) => {
    const here = { lat: pos.coords.latitude, lon: pos.coords.longitude };
    k.meta("skies").then((d) => { if (!h.closed) near(here, d); }, (e) => { if (!h.closed) box.replaceChildren(ui.error({ title: e?.why === "offline" ? NEEDS_NET : "Couldn’t look just now" })); });
  }, () => box.replaceChildren(ui.empty({ title: "Location is off", body: "Allow it for this site to look up." })), { maximumAge: 60e3, timeout: 15e3 });
  return h;
}

/* ---------- how a chat sends ---------- */
export function openWay(ctx, id) {
  const k = kit(ctx), { ui, el } = k, box = boxOf(k, "chs");
  const g = (k.get("groups") || []).find((x) => x.id === id), f = g ? null : (k.get("friends") || []).find((x) => x.id === id);
  const row = (k.get("rows") || []).find((r) => r.id === id);
  let cur = row?.way || f?.way || g?.way || null;
  const h = k.sheet({ sheet: "way", title: f ? `Messages to ${first(f.name)}` : "Your messages to the group", body: (b) => b.append(box) });
  async function set(v) {
    if (v === cur) return;
    const was = cur; cur = v; draw();
    try { await k.meta("way", { method: "POST", ...(g ? { group: id } : { with: id }), way: v }); }
    catch (e) { cur = was; draw(); k.fw.toast(e?.why === "offline" ? "No signal. Try again when you’re back online." : "Couldn’t change it just now."); }
  }
  function draw() {
    box.replaceChildren(el("p", { class: "chs-foot", text: "How this chat sends, unless you choose otherwise" }));
    const opt = (v, title, sub) => { const r = k.row({ title, sub, run: () => set(v) }, { act: "way", value: v }); r.setAttribute("role", "radio"); r.setAttribute("aria-checked", String(cur === v)); return r; };
    const list = ui.list([opt("instant", "Instant", "Messages arrive as soon as you send them"), opt("pigeon", "By Pigeon", "Every message flies by pigeon")]);
    list.setAttribute("role", "radiogroup"); list.setAttribute("aria-label", "How this chat sends");
    box.append(list, k.foot(f ? `${first(f.name)} sees a line in your chat when this changes. You can still send any one message the other way, from the button in the message box.` : "Everyone in the group sees a line in the chat when this changes."));
  }
  draw();
  return h;
}

/* ---------- a spot on the Moon or Mars ---------- */
export function openMoonPick(ctx, which = "moon") {
  const k = kit(ctx), { ui, el } = k, body = which === "mars" ? "mars" : "moon", mars = body === "mars", box = boxOf(k, "chs chmo");
  const me = k.get("me") || {}, mine = me.moon && (me.moon.body || "moon") === body ? me.moon : null;
  let side = mars ? (mine && mine.lon < 0 ? "west" : "east") : mine && farSide(mine.lon) ? "far" : "near", mark = mine || null, view = null;
  const world = BODIES[body].name;
  const h = k.sheet({ sheet: "moonpick", title: mars ? "Somewhere on Mars" : "Somewhere on the Moon", body: (b) => b.append(box),
    acts: [{ label: `Go to ${world.replace(/^the /, "the ")}`, primary: true, act: "go", run: go }] });
  const cv = el("canvas", { class: "chmo-map", "aria-label": `${world}: tap to choose a spot` });
  const name = el("p", { class: "chs-foot", "aria-live": "polite" });
  const sides = ui.seg(mars ? [["east", "East"], ["west", "West"]] : [["near", "Near Side"], ["far", "Far Side"]], side, (v) => { side = v; draw(); }, { label: "Side" });
  cv.addEventListener("click", (e) => { if (!view) return; const r = cv.getBoundingClientRect(), dpr = cv.width / (r.width || 1); const p = pickAt(view, (e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr); if (p) { mark = p; draw(); } });
  const sites = el("div", { class: "chsend-chips", role: "radiogroup", "aria-label": "Places" }, BODIES[body].sites.slice(0, 12).map(([n, la, lo]) => {
    const b = el("button", { type: "button", role: "radio", class: "chsend-chip", data: { act: "site" }, aria: { checked: "false" }, text: n });
    b.addEventListener("click", () => { mark = { lat: la, lon: lo }; side = mars ? (lo < 0 ? "west" : "east") : farSide(lo) ? "far" : "near"; sides.set(side); draw(); });
    return b;
  }));
  box.append(sides, cv, name, sites);
  function draw() {
    try { view = drawPick(cv, { body, side, mark }); } catch (_) { view = null; }
    name.textContent = mark ? siteName(mark.lat, mark.lon, body) : "Tap the map, or choose a place.";
  }
  async function go() {
    if (!mark) { k.fw.toast("Choose a spot first."); return; }
    h.setBusy?.(true);
    try { await k.meta("me", { method: "PATCH", moon: { lat: mark.lat, lon: mark.lon, body } }); k.fw.toast(`You’re on ${world}: ${siteName(mark.lat, mark.lon, body)}.`); h.close(); }
    catch (e) { k.fw.toast(e?.why === "offline" ? "No signal. Try again when you’re back online." : "Couldn’t move you just now."); }
    finally { h.setBusy?.(false); }
  }
  draw();
  return h;
}

/* ---------- your pigeons ---------- */
const birdsOf = (k) => { const me = k.get("me") || {}; return { birds: Array.isArray(me.birds) ? me.birds : [], hall: Array.isArray(me.hall) ? me.hall : [] }; };
export function birdSub(b) {
  if (b.lostAt) return `Lost${b.lostPlace ? ` over ${b.lostPlace}` : ""} · ${fmtDate(b.lostAt)}`;
  if (b.retiredAt) return `${b.rank} · ${miles(b.km)} · retired ${fmtDate(b.retiredAt)}`;
  const st = b.state === "flying" ? `In the air${b.landAt ? ` · lands ${fmtTime(b.landAt)}` : ""}` : b.state === "waiting" ? "Booked to fly" : !b.busyUntil || b.busyUntil <= Date.now() ? "Ready" : `Resting · ready in ${dur(b.busyUntil - Date.now())}`;
  return `${b.rank} · ${miles(b.km)} · ${st}`;
}
export function openBirds(ctx) {
  const k = kit(ctx), { ui } = k, box = boxOf(k);
  const h = k.sheet({ sheet: "birds", title: "Your Pigeons", body: (b) => b.append(box) });
  function draw() {
    box.replaceChildren();
    const { birds, hall } = birdsOf(k);
    if (!birds.length && !hall.length) {
      box.append(ui.empty({ title: "Name your pigeons", body: `Give up to ${BIRDS_MAX} of your pigeons names. They take turns carrying what you send, gain miles and stamina, rise from Fledgling to Legend, and retire to your Hall of Fame.`,
        acts: [{ label: "Name a Pigeon", primary: true, act: "birdnew", run: () => openBirdName(ctx) }] }));
      return;
    }
    const rows = birds.map((b) => k.row({ lead: { icon: "bird" }, title: b.name, sub: birdSub(b), trail: "chevron", run: () => openBird(ctx, b.id) }, { act: "bird", id: b.id }));
    if (birds.length < BIRDS_MAX) rows.push(k.row({ lead: { icon: "plus" }, title: "Name a New Pigeon", run: () => openBirdName(ctx) }, { act: "birdnew" }));
    box.append(ui.list(rows), k.foot(`They take turns carrying what you send, and rest between flights. Miles bring rank: ${RANKS.slice(1).map(([r, km]) => `${r} at ${miles(km)}`).join(", ")}, once around the world.`));
    if (hall.length) box.append(ui.list(hall.map((b) => k.row({ lead: { icon: b.lostAt ? "warn" : "bird" }, title: b.name, sub: birdSub(b), trail: "chevron", run: () => openBird(ctx, b.id) }, { act: "bird", id: b.id })), { label: "Hall of Fame" }));
  }
  draw();
  if (k.store?.on) k.gone.push(k.store.on("me", () => { if (!h.closed) draw(); }));
  return h;
}
export function openBird(ctx, id) {
  const k = kit(ctx), { ui, el } = k, box = boxOf(k, "chs chb");
  const h = k.sheet({ sheet: "bird", label: "Pigeon", body: (b) => b.append(box) });
  function draw() {
    box.replaceChildren();
    const { birds, hall } = birdsOf(k), b = [...birds, ...hall].find((x) => x.id === id);
    if (!b) { box.append(ui.empty({ title: "Not one of your pigeons any more" })); return; }
    const active = !b.lostAt && !b.retiredAt, next = active ? rankNext(b) : null;
    box.append(el("div", { class: "chs-head" }, el("span", { class: "chb-bird", "aria-hidden": "true", text: b.wear && WEAR[b.wear] ? WEAR[b.wear][1] : "🐦" }), el("b", { class: "chs-name", text: b.name }), el("span", { class: "chs-sub", text: birdSub(b) })));
    box.append(k.stats([[miles(b.km), "Flown"], [n0(b.flights), +b.flights === 1 ? "Flight" : "Flights"], [miles(b.longest), "Longest"], [n0(b.stamina), "Stamina"]]));
    if (next) {
      const bar = el("i", { class: "chf-bar", "aria-hidden": "true" });
      bar.style.setProperty("--w", Math.max(0, Math.min(1, ((+b.km || 0) - next.from) / (next.km - next.from))).toFixed(3));
      const r = k.row({ title: `Next: ${next.rank}`, sub: `${miles(next.km - (+b.km || 0))} to go` }); r.append(bar);
      box.append(ui.list([r]));
    }
    if (active) {
      const acts = [k.row({ title: "Rename", run: () => openBirdName(ctx, b.id) }, { act: "birdrename", id: b.id })];
      if (b.rank === "Legend") acts.push(k.row({ title: "Retire to the Hall of Fame", run: async () => { try { await k.meta("bird-retire", { method: "POST", id: b.id }); k.fw.toast(`${b.name} has retired to your Hall of Fame.`); h.close(); } catch (e) { k.fw.toast("Couldn’t do that just now."); } } }, { act: "birdretire", id: b.id }));
      box.append(ui.list(acts));
    }
  }
  draw();
  if (k.store?.on) k.gone.push(k.store.on("me", () => { if (!h.closed) draw(); }));
  return h;
}
export function openBirdName(ctx, id = null) {
  const k = kit(ctx), { ui, el } = k, b = id ? birdsOf(k).birds.find((x) => x.id === id) : null;
  let name = b?.name || "";
  const save = async () => {
    const v = String(name).trim().slice(0, 20); if (!v) return;
    h.setBusy?.(true);
    // (Chat's own endpoints for these: birds POST { name }, bird-name POST { id, name })
    try { await k.meta(b ? "bird-name" : "birds", { method: "POST", ...(b ? { id: b.id } : {}), name: v }); h.close(); }
    catch (e) { k.fw.toast(e?.why === "offline" ? "No signal. Try again when you’re back online." : "Couldn’t save the name just now."); }
    finally { h.setBusy?.(false); }
  };
  const f = ui.field({ value: name, placeholder: b ? "New name" : "Biscuit, Captain, Pip…", label: "Pigeon name", onInput: (v) => { name = v; }, onEnter: save });
  f.input.maxLength = 20; f.dataset.act = "name";
  const h = k.sheet({ sheet: "birdname", title: b ? "Rename" : "Name a Pigeon", focus: f.input, acts: [{ label: b ? "Save" : "Add", primary: true, act: "save", run: save }],
    body: (bd) => bd.append(el("div", { class: "chs" }, f, k.foot(`${b ? "Its career stays as it is." : "It starts as a Fledgling."} Everyone it flies to sees its name.`))) });
  return h;
}

/* ---------- a friend's loft (counted, never named) ---------- */
export function openLoft(ctx, id = null) {
  const k = kit(ctx), { ui, el } = k, box = boxOf(k, "chs chb");
  const f = id ? (k.get("friends") || []).find((x) => x.id === id) : null, me = k.get("me") || {};
  const who = first(f?.name || me.name || "Your");
  const h = k.sheet({ sheet: "loft", title: `${who}’s Loft`, body: (b) => b.append(box) });
  k.loads(box, () => k.meta("loft", { method: "GET", id: id || me.id }), (L) => {
    box.replaceChildren();
    if (L?.private) { box.append(ui.empty({ title: "The loft is closed", body: L.self ? "You don’t share your news, so lofts stay closed to you too. Turn on Share My News in Chat Settings to visit." : `${who} doesn’t share their news, so their loft stays private.` })); return; }
    const l = L?.loft || {};
    box.append(k.stats([[miles(l.km), "Flown"], [n0(l.landed), +l.landed === 1 ? "Landing" : "Landings"], [n0(l.countries), +l.countries === 1 ? "Country" : "Countries"], [n0(l.postmarks), +l.postmarks === 1 ? "Postmark" : "Postmarks"]]));
    const birds = Array.isArray(l.birds) ? l.birds : [];
    box.append(birds.length ? ui.list(birds.map((b) => k.row({ lead: { icon: "bird" }, title: b.name, sub: `${b.rank}${b.wear && WEAR[b.wear] ? ` · wearing the ${WEAR[b.wear][0].toLowerCase()}` : ""}` })), { label: "Pigeons" }) : k.foot(`${who} hasn’t named any pigeons yet.`));
    const badges = Array.isArray(l.badges) ? l.badges : [];
    if (badges.length) box.append(el("h3", { class: "ifl-label", text: "Achievements" }), el("div", { class: "chf-badges" }, badges.map((b) => el("div", { class: "chf-badge earned" }, el("b", { text: b.name }), el("small", { text: b.desc })))));
    box.append(k.foot(`Where ${who}’s pigeons have been stays theirs: countries and postmarks are counted here, never named.`));
  });
  return h;
}

/* ---------- Coots and the shop ---------- */
export function openFeathers(ctx) {
  const k = kit(ctx), { ui, el } = k, box = boxOf(k, "chs chb");
  const h = k.sheet({ sheet: "feathers", title: "Coots", body: (b) => b.append(box) });
  const draw = (w) => {
    box.replaceChildren();
    const coins = +w?.feathers || 0, items = Array.isArray(w?.items) ? w.items : [];
    box.append(el("div", { class: "chs-head" }, el("b", { class: "chs-name", text: coins.toLocaleString("en-GB") }), el("span", { class: "chs-sub", text: `Coots Coin${coins === 1 ? "" : "s"}` })));
    box.append(ui.list(items.map((x) => {
      const r = k.row({ lead: el("span", { class: "chb-emo", "aria-hidden": "true", text: x.emoji || "" }), title: x.name, sub: x.owned ? (x.on ? `On ${x.on.name}` : "Yours") : `${x.price} Coots Coins` }, { item: x.id });
      if (!x.owned) {
        const buy = ui.btn(`${x.price}`, { small: true, act: "buy", label: `Buy for ${x.price} Coots Coins`, run: async () => {
          buy.disabled = true;
          try { draw(await k.meta("feathers-buy", { method: "POST", item: x.id })); k.fw.toast(`The ${x.name} is yours.`); }
          catch (e) { buy.disabled = false; k.fw.toast(e?.why === "offline" ? "No signal." : "Couldn’t buy it just now."); }
        } });
        buy.disabled = coins < x.price;
        r.append(buy);
      }
      return r;
    }), { label: "Shop" }));
    box.append(ui.list([
      k.row({ title: "A pigeon of yours lands", sub: "One more for every 250 miles", value: "1–6" }),
      k.row({ title: "A new country or sea", sub: "In your passport", value: "3" }),
      k.row({ title: "A new postmark", sub: "Flying past somewhere famous", value: "10" }),
      k.row({ title: "A streak reaches 7, 30 or 100 days", sub: "For you both", value: "10–100" }),
    ], { label: "How to Earn Them" }));
  };
  k.loads(box, () => k.meta("feathers"), draw);
  return h;
}

/* ---------- friends' news (never what anyone wrote, or where anyone is) ---------- */
export function openNews(ctx) {
  const k = kit(ctx), { ui } = k, box = boxOf(k);
  const h = k.sheet({ sheet: "news", title: "Friends’ News", body: (b) => b.append(box) });
  k.loads(box, () => k.meta("news"), (d) => {
    box.replaceChildren();
    const news = Array.isArray(d?.news) ? d.news : [];
    if (!news.length) { box.append(ui.empty({ title: "No news yet", body: "When your friends’ pigeons reach somewhere new, rise a rank or keep a streak going, it’ll show here." })); return; }
    box.append(ui.list(news.map((x) => k.row({ lead: { avatar: x.who?.name || "?" }, title: x.text, sub: x.at ? fmtDate(x.at) : "", run: () => { h.close(); if (x.who?.id) k.fw.nav.go(k.fw.nav.href("open", x.who.id)); } }, { kind: x.kind }))),
      k.foot("The last two weeks of your friends’ pigeons: new countries, postmarks, ranks, streaks and more. Never what anyone wrote, or where anyone is."));
  });
  return h;
}
