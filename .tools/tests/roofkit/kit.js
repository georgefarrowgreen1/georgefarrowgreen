// FW's kit page script (One roof, spec §9.4 FW): the framework made as Today's app.js will make it, with stand-in tab
// screens, so the framework is seen and driven on its own (roofkit.mjs), and a module's screens before Today is on it
// (?module=/weather/roof/weather.js: roofwxmount.mjs). window.kit is the test's handle:
//   kit.F (the frame), kit.ui, kit.state (what the stand-ins saw: lost() calls, session checks, hub re-asks, shows),
//   kit.morning() (what app.js does for #morning: the entry's state wiped by replaceState(null), then F.restamp()),
//   kit.set({ signedIn, hub, roof, apps }) (what the stand-in session answers next; apps: { [app]: boolean }, s24 §2).
// The session: signed in as Sam Taylor, hub and roof on; checkSession answers kit.state.signedIn. ?apps=weather,markets
// gives the session those apps on (stages 2–4; default: Weather alone, as a stage-1 host: no apps at all), and keeps
// them for the page's life in this browser (the cookie kit-apps, which roofkit/serve.mjs reads to serve the kit page at
// those apps' addresses). ?module=/<app>/roof/<app>.js mounts that app's real module from disk.
// Stage 3 (Chats): ?apps=weather,chats puts Chats' real module (MAIN's pigeon/roof/) at /chats/; its service (F.service,
// fw.service) runs MAIN's core.js, or with ?service=stub the stub core (roofkit/chatcore-stub.js) in the state ?state=…
// (ready, signin, key, locked, device, offline, ended); both kept in cookies for the page's life (kit-service,
// kit-chat-state). kit.state.serviceStates: each "app:state" the frame's opts.serviceState heard.
import { createFrame } from "/roof/frame.js";
import * as ui from "/roof/ui.js";

// (which Weather this page gets: the fake one, or MAIN's real module with ?module=; roofkit/serve.mjs reads the cookie)
// (kept for the page's life in this browser, so a reload at a tidied address keeps the same Weather)
// (the module asked for: Weather's real one is "real" as stage 1 had it; another app's names it, and Weather stays fake)
const wanted = new URLSearchParams(location.search).get("module");
if (wanted != null) document.cookie = `kit-module=${/^\/(markets|fitness|mail|chats)\/roof\//.exec(wanted)?.[1] || "real"}; path=/; SameSite=Strict`;
else if (!/kit-module=/.test(document.cookie)) document.cookie = "kit-module=fake; path=/; SameSite=Strict";

// (the session's apps: ?apps=… (kept in the cookie), else none said, which the frame reads as Weather's roof alone)
const svcAsked = new URLSearchParams(location.search).get("service"), stAsked = new URLSearchParams(location.search).get("state");
if (svcAsked != null && /^(stub|real)$/.test(svcAsked)) document.cookie = `kit-service=${svcAsked}; path=/; SameSite=Strict`;
if (stAsked != null && /^\w+$/.test(stAsked)) document.cookie = `kit-chat-state=${stAsked}; path=/; SameSite=Strict`;
const asked = new URLSearchParams(location.search).get("apps");
if (asked != null && /^[\w,]*$/.test(asked)) document.cookie = `kit-apps=${asked}; path=/; SameSite=Strict`;
const kept = asked ?? /(?:^|;\s*)kit-apps=([\w,]*)/.exec(document.cookie)?.[1] ?? null;
const apps = kept == null ? undefined : Object.fromEntries(kept.split(",").filter(Boolean).map((a) => [a, true]));
const state = { signedIn: true, hub: true, roof: true, apps, lost: 0, checks: 0, hubAgain: 0, shows: [], hides: [], me: 0, edit: 0, csp: [], changed: 0, serviceStates: [] };
document.addEventListener("securitypolicyviolation", (e) => state.csp.push(`${e.violatedDirective} ${e.blockedURI}`));
const user = { id: "u-kit-0001", name: "Sam Taylor", handle: "sam" };

// ---- stand-in tab screens, tall enough to scroll
const $ = (id) => document.getElementById(id);
const filler = (n, what) => Array.from({ length: n }, (_, i) => ui.card({ title: `${what} ${i + 1}`, body: ui.el("p", { class: "ifl-sub", text: "A stand-in card, so the screen scrolls." }) }));
function wxCard() {
  const a = ui.el("a", { class: "tc-head", href: "/weather/?lat=51.5072&lon=-0.1276&name=London", "aria-label": "Open Weather for London" },
    ui.icon(null, { app: "weather", size: 24 }), ui.el("span", { class: "tc-app", text: "Weather" }), ui.el("span", { class: "tc-meta", text: "London · 09:41" }));
  const now = ui.el("div", { class: "wx-now" }, ui.el("span", { class: "t num", text: "14°" }), ui.el("span", { class: "d" }, ui.el("b", { text: "Light rain" })));
  const warn = ui.el("a", { class: "wx-warn yellow", href: "/weather/?lat=51.5072&lon=-0.1276&name=London#warnings", text: "Yellow warning for rain" });
  return ui.el("article", { class: "tcard glass wx wx-sk-rain-day", data: { app: "weather", state: "ok" }, "aria-label": "Weather" }, a, now, ui.el("p", { class: "wx-brief" }, ui.el("b", { text: "Rain from 15:00." })), warn);
}
$("today").append(wxCard(), ui.el("p", {}, ui.el("a", { id: "toFitness", href: "/fitness/", text: "Fitness, a page beside" }), " · ", ui.el("a", { id: "toMorning", href: "#morning", text: "Morning" })), ...filler(14, "Today"));
const appsList = ui.el("div", { class: "kit-tiles" },
  ui.tile({ app: "weather", name: "Weather", line: "Rain from 15:00", href: "/weather/", chips: [{ text: "Radar", href: "/weather/#radar" }, { text: "Warnings", href: "/weather/#warnings" }] }),
  ui.tile({ app: "fitness", name: "Fitness", line: "Easy ride, 60 min", href: "/fitness/" }));
$("apps").append(appsList, ...filler(12, "Apps"));
const youRows = ui.list([
  ui.row({ lead: { app: "weather" }, title: "Weather", sub: "Cards · Search · Notifications · Actions · Screens", trail: "chevron", act: "connector-weather", run: () => import("/roof/connectors.js").then((c) => c.openConnector(F, "weather")) }),
  ui.row({ lead: { app: "fitness" }, title: "Fitness", sub: "Cards · Notifications · Actions · Screens", trail: "chevron", act: "connector-fitness", run: () => import("/roof/connectors.js").then((c) => c.openConnector(F, "fitness")) }),
  ui.row({ title: "Notifications", trail: "switch", checked: true }),
], { label: "Connected Apps" });
youRows.id = "youApps";
$("you").append(youRows, ...filler(10, "You"));

const me = () => { const s = document.createElement("span"); s.className = "me-ph"; s.textContent = "S"; return s; };
const F = createFrame({
  root: $("in"), header: $("hd"), views: $("views"), tabs: $("tabs"),
  session: () => ({ view: { user, apps: state.apps }, hub: state.hub, roof: state.roof, apps: state.apps, links: { weather: "https://weather.kit.test", chat: "https://chat.kit.test", finance: "https://finance.kit.test", fitness: "https://fitness.kit.test", email: "https://email.kit.test" } }),
  changed: () => { state.changed++; },
  retired: Promise.resolve(),
  serviceState: (app, s) => { state.serviceStates.push(`${app}:${s}`); },
  lost: () => { state.lost++; },
  checkSession: async () => { state.checks++; return state.signedIn; },
  hubAgain: async () => { state.hubAgain++; },
  save: () => ({ y: Math.round(scrollY) }),
  onMe: () => { state.me++; },
  me,
  today: { el: $("today"), title: () => "Today", crumb: () => "Tuesday 3 November", line: () => "London · Rain from 15:00", acts: [{ icon: "edit", label: "Edit Today: hide and reorder cards", run: () => { state.edit++; } }], onShow: (r) => state.shows.push(`today${r.arg ? "=" + r.arg : ""}`), onHide: () => state.hides.push("today") },
  apps: { el: $("apps"), title: () => "Apps", line: () => "Each one here, in this window", onShow: () => state.shows.push("apps"), onHide: () => state.hides.push("apps") },
  you: { el: $("you"), title: () => "You", line: () => "@sam", onShow: (r) => state.shows.push(`you${r.arg ? "=" + r.arg : ""}`), onHide: () => state.hides.push("you") },
});

// #morning as app.js has it: the sheet, and the entry's state wiped (as the shared block's wantsAllow() does), then re-stamped
function morning() {
  F.sheet.openEl($("morning"));
  try { history.replaceState(null, "", location.pathname + location.search); } catch (_) {}
  F.restamp();
}
addEventListener("hashchange", () => { if (location.hash === "#morning") morning(); });
window.kit = { F, ui, state, morning, set: (o) => Object.assign(state, o), ready: true };
document.documentElement.classList.remove("boot");
document.documentElement.classList.add("kit-ready");
