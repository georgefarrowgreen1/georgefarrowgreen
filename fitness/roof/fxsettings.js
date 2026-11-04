// Fitness Settings under InFlite's roof (One roof stage 2, spec S2-D7, S2-D13, §2.2, §4.3 FXB): one framework sheet,
// its pages pushed onto it, as Weather Settings is. Ported from fitness/app.js settingsView, numbersView (Your Numbers),
// garminView, stravaView and healthView (Devices), and the account page's Fitness preferences (Units and Maps, Nights
// and Check-in, which standalone Fitness keeps in its record's prefs and the account page edits).
//
// Frozen: openSettings(ctx, page = null) → sheet Handle | null: dialog.ifl-sheet[data-sheet=fxsettings]; page: null (the
//   list of pages) or one of "numbers" | "units" | "nights" | "devices", opened straight at it (a pushed page whose
//   container is [data-page=<page>]); on the list, a row per page [data-go=<page>] and a Notifications row
//   a[href="/#you=notify"]; Devices' own pages [data-page=garmin|strava|health]. Preferences save
//   through ctx.core.saveSettings(patch) with only the keys edited (PATCH below: { prefs: {…} }, the part of the record
//   fitness/app.js record() writes); a number through ctx.core.setNumber(k, v), app.js's own rule (only it marked as set
//   by you, threshold heart rate following max), then "settings" said; either way the whole record kept and sent as
//   keep() does (PUT /api/fitness/me). Apple Health's address is Fitness's own host, never the hub's (fitnessOrigin).
// Strava (S2-D13): never a navigation of the page. The Devices page (and Strava's own) asks POST strava/connect as it
//   opens and draws the answer as a real link, a[data-k=strava].ifl-btn target=_blank rel=noopener href=<url> ("Connect
//   Strava"); till the address is in, the same link with no href, aria-disabled, "Getting Strava ready…"; asked again
//   once the page has been open 5 minutes. Strava's page ends on fitness.inflite.ai; here, on the next visible, the
//   account is asked again (core.pull) and the page redrawn from it.
// Not here (S2-D7): the account hand-off (openAccount) and Appearance: You has them; notifications are You's.
import { A, P, S, TODAY, U, ZONES, addDays, isSet, pace, plural, setActs, dropFile, fileKey, sumOf, weight, dayShort, estimate } from "./x.js";
import { paceOf } from "../ui.js";

export const PAGES = Object.freeze(["numbers", "units", "nights", "devices"]);
const TITLES = { numbers: "Your Numbers", units: "Units and Maps", nights: "Nights and Check-in", devices: "Devices", garmin: "Garmin Connect", strava: "Strava", health: "Apple Health" };
// (each row's icon, in Fitness's colour, as You's rows have)
const ICONS = { numbers: "data", units: "ruler", nights: "moon", devices: "watch", garmin: "link", strava: "link", health: "shield" };

/* ---------- the patch each page saves (only the keys it edits; pure: never mutates what it's given) ---------- */
// (one of your numbers set by you: kept as it is from then on, as fitness/app.js setNumber; FTP logged by the day for
// Progress; threshold heart rate follows your max till you set it too)
export function numberPatch(profile, k, v, today = TODAY) {
  const p = profile || {}, set = [...new Set([...(Array.isArray(p.set) ? p.set : []), k])];
  const out = { [k]: v, set };
  if (k === "ftp") out.ftpLog = [...(p.ftpLog || []).filter((x) => x[0] !== today), [today, Math.round(v), 1]].slice(-120);
  if (k === "maxHr" && !set.includes("lthr")) out.lthr = Math.round(v * 0.9);
  return out;
}
export const LIMITS = Object.freeze({ ftp: [5, 80, 500], weight: [0.5, 35, 150], lthr: [1, 100, 210], maxHr: [1, 120, 230], runPace: [5, 150, 600], css: [1, 50, 240] });
// (number: what setNumber leaves, for the tests' comparison and its clamping; the sheet saves it by core.setNumber, never
// by saveSettings, which would mark the threshold that only followed max as yours)
export const PATCH = {
  number: (profile, k, v) => (LIMITS[k] ? { profile: numberPatch(profile, k, Math.max(LIMITS[k][1], Math.min(LIMITS[k][2], Math.round(v * 10) / 10))) } : null),
  units: (v) => (v === "metric" || v === "imperial" ? { prefs: { units: v } } : null),
  maps: (v) => (v === "tap" || v === "always" ? { prefs: { maps: v } } : null),
  ask: (on) => ({ prefs: { ask: !!on } }),
  nights: (v) => (["auto", "apple", "garmin"].includes(v) ? { prefs: { nights: v } } : null),
};
// what the record says now (as fitness/app.js adopt() reads it into S)
const prefsNow = () => ({
  units: U.metric ? "metric" : "imperial",
  maps: S.maps === "always" ? "always" : "tap",
  ask: S.ask !== false,
  nights: ["apple", "garmin"].includes(S.nightsFrom) ? S.nightsFrom : "auto",
});

/* ---------- what each row on the list says ---------- */
export function summary(page, u = U) {
  const p = P() || {};
  switch (page) {
    case "numbers": return `FTP ${p.ftp} W · ${weight(p.weight)}`;
    case "units": return `${u.metric ? "Kilometres" : "Miles"} · Maps ${S.maps === "always" ? "always" : "on tap"}`;
    case "nights": return `${S.ask !== false ? "Asked each morning" : "Not asked"} · ${{ apple: "Apple Watch", garmin: "Garmin" }[S.nightsFrom] || "Nights from either"}`;
    case "devices": { if (stopped()) return `${stopped()}: reconnect`; const on = [S.garmin?.on && "Garmin", S.strava?.on && "Strava", S.health?.on && "Apple Health"].filter(Boolean); return on.length ? on.join(", ") : "None connected"; }
  }
  return "";
}
const stopped = () => (S.garmin?.on && !S.garmin.ok ? "Garmin" : S.strava?.on && !S.strava.ok ? "Strava" : null);
const ago = (t) => { const m = Math.round((Date.now() - t) / 60e3); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : dayShort(t); };

// Fitness's own address (Apple Health's Shortcut posts there), never the hub's: the hub refuses a POST that carries no
// Origin of its own, and a Shortcut sends none. The frame's link when it gives one; else as the frame's DEFAULT_LINKS
// makes it (https://fitness.inflite.ai live; fitness.<host> elsewhere); Fitness's own page keeps its own.
export function fitnessOrigin(fw, loc = location) {
  try { const l = fw?.session?.links?.fitness; if (l) { const u = new URL(l); if (/^https?:$/.test(u.protocol)) return u.origin; } } catch (_) {}
  if (/^fitness\./.test(loc.hostname)) return loc.origin;
  if (/(^|\.)inflite\.ai$/.test(loc.hostname)) return "https://fitness.inflite.ai";
  return `${loc.protocol}//fitness.${loc.hostname}${loc.port ? ":" + loc.port : ""}`;
}

/* ---------- the sheet ---------- */
let shown = null;

export function openSettings(ctx, page = null) {
  const { core, fw } = ctx, ui = fw.ui, el = ui.el;
  if (page != null && !PAGES.includes(page)) page = null;
  try { shown?.close(); } catch (_) {}
  const offs = [];
  let h = null, alive = true;
  const redraws = new Map();
  const track = (node, fn) => redraws.set(fn, node);
  const prune = () => { const body = h?.body; if (body) for (const [fn, node] of redraws) if (!body.contains(node)) redraws.delete(fn); };
  const redraw = () => { prune(); for (const fn of redraws.keys()) { try { fn(); } catch (e) { console.error(e); } } };
  const toast = (t) => fw.toast(t);
  const lost = () => { try { fw.session?.lost?.(); } catch (_) {} };
  // a save: the patch through core (the record, then the account), then every open page drawn from what's kept
  async function save(patch) {
    if (!patch) return;
    try { await core.saveSettings(patch); } catch (_) { toast("Couldn’t save that just now. Try again."); }
    if (alive) redraw();
  }
  // a number of yours: core.setNumber, fitness/app.js's own rule (only that number set by you; threshold heart rate
  // following max till you set it too), kept as keep() keeps it, then every page told as a save tells them. Not through
  // saveSettings: that marks every number in its patch as yours, the threshold that only followed max with it.
  function saveNumber(k, v) {
    const patch = PATCH.number(P(), k, v);
    if (!patch) return Promise.resolve();
    try { core.setNumber(k, patch.profile[k]); core.emit?.("settings", { keys: ["profile"] }); } catch (_) { toast("Couldn’t save that just now. Try again."); }
    if (alive) redraw();
    return Promise.resolve();
  }
  const foot = (text) => el("p", { class: "fxs-foot", text });

  /* -- the list -- */
  const rows = new Map();
  const goRow = (p) => {
    const r = ui.row({ lead: { icon: ICONS[p] }, title: TITLES[p], value: summary(p) || " ", trail: "chevron", run: () => go(p) });
    r.dataset.go = p;
    rows.set(p, r);
    return r;
  };
  const notifyRow = ui.row({ lead: { icon: "bell" }, title: "Notifications", sub: "Today’s morning, with every app’s", trail: "chevron", href: "/#you=notify", label: "Notifications, in You" });
  notifyRow.addEventListener("click", (e) => {
    if (e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    h?.close();
    fw.nav.go("/#you=notify");
  });
  const root = el("div", { class: "m-fitness fxs fxs-root" },
    ui.list(["numbers"].map(goRow), { label: "Training" }),
    ui.list(["units", "nights"].map(goRow), { label: "Preferences" }),
    ui.list(["devices"].map(goRow), { label: "Your rides" }),
    ui.list([notifyRow], { label: "Notifications" }),
    foot("Notifications for Fitness are in You, with every app’s."));
  track(root, () => { for (const [p, r] of rows) { const v = r.querySelector(".ifl-val"); if (v) v.textContent = summary(p) || " "; } });

  /* -- Your Numbers: every zone, target and training stress follows them -- */
  function numbersPage() {
    const box = el("div", { class: "m-fitness fxs fxs-numbers" });
    const said = (k) => {
      if (isSet(k)) return null;
      const e = core.estimates?.() || {};
      if (k === "ftp") return e.ftp ? `Estimated from ${plural(e.rides, "ride")}` : "A starting guess";
      if (k === "maxHr" || k === "lthr") return e.maxHr ? "From your rides" : "A starting guess";
      return "A starting guess";
    };
    const NUMS = [["FTP", "ftp", (v) => `${v} W`], ["Weight", "weight", (v) => weight(v)], ["Threshold heart rate", "lthr", (v) => `${v} bpm`],
      ["Max heart rate", "maxHr", (v) => `${v} bpm`], ["Threshold pace", "runPace", (v) => pace(paceOf(v))], ["CSS", "css", (v) => pace(v, "/100 m")]];
    const step = ([label, k, show]) => {
      const out = el("output", { class: "fxs-n" });
      const est = el("small", { class: "fxs-est" });
      // (− and + in words: the shared glyphs have no minus)
      const less = ui.btn("−", { small: true, label: `Less ${label}`, act: "less", run: () => change(-LIMITS[k][0]) });
      const more = ui.btn("+", { small: true, label: `More ${label}`, act: "more", run: () => change(LIMITS[k][0]) });
      const change = (d) => saveNumber(k, (P()[k] || 0) + d);
      const line = el("div", { class: "fxs-line fxs-step", data: { key: k } }, el("span", { class: "fxs-k" }, el("b", { text: label }), est), el("span", { class: "fxs-stepper", role: "group", "aria-label": label }, less, out, more));
      const draw = () => { out.textContent = show(P()[k]); const s = said(k); est.textContent = s || ""; est.hidden = !s; };
      draw();
      track(line, draw);
      return line;
    };
    const raise = el("div", { class: "fxs-raise" });
    const drawRaise = () => {
      // (your best 20 minutes of the last six weeks, offered only as a rise on an FTP you set: easy weeks never talk it down)
      const since = addDays(TODAY, -42), best20 = Math.max(0, ...S.acts.filter((a) => a.start >= since).map((a) => sumOf(a)?.curve?.[1200] || 0)), est = Math.round(best20 * 0.95);
      raise.replaceChildren(...(isSet("ftp") && est >= P().ftp + 5 ? [ui.card({ title: "From your rides", body: [el("p", { class: "fxs-foot", text: `Your best 20 minutes in the last six weeks: ${best20} W, an FTP of about ${est} W.` }),
        ui.btn(`Raise FTP to ${est} W`, { small: true, primary: true, act: "raise", run: () => saveNumber("ftp", est).then(() => toast(`FTP raised to ${est} W`)) })] })] : []));
    };
    const zones = el("div", { class: "fxs-zones" });
    const drawZones = () => { const ftp = P().ftp; zones.replaceChildren(ui.list(ZONES.map((z, i) => ui.row({ lead: el("span", { class: `zone-chip bg-${z.c}`, text: `Z${z.n}` }), title: z.name, value: `${i ? Math.round(ZONES[i - 1].top * ftp) : 0}${z.top < 9 ? `–${Math.round(z.top * ftp) - 1}` : "+"} W` })), { label: "Power zones" })); };
    drawRaise(); drawZones();
    box.append(ui.list(NUMS.map(step)), raise,
      foot(isSet("ftp") ? "FTP is the power you could hold for about an hour. Ride harder than it says for 20 minutes and Fitness will offer a rise; it never talks it down." : "FTP is the power you could hold for about an hour. Until you set it, Fitness works it out from your hardest rides, and it rises by itself when you ride harder."),
      zones, foot("Every zone, target and training stress follows these."));
    track(box, () => { drawRaise(); drawZones(); });
    return box;
  }

  /* -- Units and Maps -- */
  function unitsPage() {
    const units = ui.seg([["metric", "Kilometres"], ["imperial", "Miles"]], prefsNow().units, (v) => save(PATCH.units(v)), { label: "Distances" });
    const maps = ui.seg([["tap", "On Tap"], ["always", "Always"]], prefsNow().maps, (v) => save(PATCH.maps(v)), { label: "Ride maps" });
    const box = el("div", { class: "m-fitness fxs fxs-units" },
      el("div", { class: "fxs-opt", data: { key: "units" } }, el("span", { class: "fxs-opt-k", text: "Distances" }), units),
      el("div", { class: "fxs-opt", data: { key: "maps" } }, el("span", { class: "fxs-opt-k", text: "Ride maps" }), maps),
      foot("A ride’s map comes from OpenFreeMap, which sees where it is. On Tap, Fitness draws each route itself until you ask for the map."));
    track(box, () => { units.set?.(prefsNow().units); maps.set?.(prefsNow().maps); });
    return box;
  }

  /* -- Nights and Check-in -- */
  function nightsPage() {
    const ask = ui.sw(prefsNow().ask, (v) => save(PATCH.ask(v)), { label: "Ask how I am each morning" });
    const from = ui.seg([["auto", "Either"], ["apple", "Apple Watch"], ["garmin", "Garmin"]], prefsNow().nights, (v) => save(PATCH.nights(v)), { label: "Nights from" });
    const box = el("div", { class: "m-fitness fxs fxs-nights" },
      el("div", { class: "fxs-line", data: { key: "ask" } }, el("span", { text: "Ask how I am each morning" }), ask),
      foot("On Today: how you slept and how your legs feel, and Rhythm eases the day when you need it."),
      el("div", { class: "fxs-opt", data: { key: "nights" } }, el("span", { class: "fxs-opt-k", text: "Nights from" }), from),
      foot("HRV, resting heart rate and sleep, from your Apple Watch or your Garmin. With both, Either goes by whichever has more of this month’s nights."));
    track(box, () => { const b = ask.input || ask.querySelector?.("input"); if (b) b.checked = prefsNow().ask; from.set?.(prefsNow().nights); });
    return box;
  }

  /* -- Devices: Garmin, Strava, Apple Health, and what your files came from -- */
  // Strava's address: asked as Devices (or Strava's page) opens, again after 5 minutes; the link drawn from it (S2-D13)
  // (an answer that failed (offline, the server's error) is asked again only by a tap on the link; signed out (401),
  // the frame told once and not asked again: a redraw never asks after a failure)
  let stravaUrl = null, stravaAt = 0, stravaAsking = null, stravaGone = false, stravaFailed = false, stravaOut = false;
  const askStrava = () => {
    if (stravaAsking || stravaOut) return stravaAsking;
    stravaAsking = A.stravaConnect().then((r) => { stravaUrl = typeof r?.url === "string" && /^https:\/\//.test(r.url) ? r.url : null; stravaAt = Date.now(); stravaFailed = false; },
      (e) => { stravaUrl = null; stravaAt = Date.now(); stravaFailed = true; if (e?.status === 401) { stravaOut = true; lost(); } }).finally(() => { stravaAsking = null; if (alive) redraw(); });
    return stravaAsking;
  };
  const stravaLink = (label) => {
    const a = el("a", { class: "ifl-btn primary fxs-strava", target: "_blank", rel: "noopener", data: { k: "strava" } }, el("span"));
    const draw = () => {
      if (!stravaFailed && Date.now() - stravaAt > 5 * 60e3 && !stravaAsking) askStrava();
      if (stravaUrl) { a.setAttribute("href", stravaUrl); a.removeAttribute("aria-disabled"); a.querySelector("span").textContent = label(); }
      else { a.removeAttribute("href"); a.setAttribute("aria-disabled", "true"); a.querySelector("span").textContent = stravaAsking ? "Getting Strava ready…" : stravaOut ? "Sign in to connect Strava" : "Strava isn’t answering: tap to try again"; }
    };
    // (tapped: Strava's page in a window of its own; back here, the account asked again on the next visible)
    a.addEventListener("click", (e) => { if (!stravaUrl) { e.preventDefault(); askStrava(); return; } stravaGone = true; });
    draw();
    track(a, draw);
    return a;
  };
  offs.push(fw.on?.("visible", () => { if (!stravaGone || !alive) return; stravaGone = false; stravaAt = 0; Promise.resolve(core.pull?.()).finally(() => alive && redraw()); }) || (() => {}));
  // (where they came from: Garmin's g…, Strava's s…; disconnecting, or clearing up after, a second tap to be sure)
  const SRC = { garmin: { label: "Garmin", prefix: "g", off: (acts) => A.garminDisconnect(acts), set: (r) => { S.garmin = r; } },
    strava: { label: "Strava", prefix: "s", off: (acts) => A.stravaDisconnect(acts), set: (r) => { S.strava = r; } } };
  function leaving(src, on) {
    const c = SRC[src], re = new RegExp(`^${c.prefix}\\d`), n = S.own.filter((a) => re.test(a.id)).length;
    if (!on && !n) return null;
    const sure = el("div", { class: "fxs-sure" }); sure.hidden = true;
    const go2 = async (b, acts) => {
      b.disabled = true;
      let r;
      try { r = await c.off(acts); } catch (e) { b.disabled = false; if (e.status === 401) return lost(); return toast(e.message); }
      if (on) c.set({ ...r, gone: undefined });
      if (acts) { for (const a of S.own) if (re.test(a.id)) dropFile(fileKey(a)); S.own = S.own.filter((a) => !re.test(a.id)); for (const k of [...S.sums.keys()]) if (re.test(k)) S.sums.delete(k); setActs(); try { estimate(); } catch (_) {} }
      h.pop(); core.emit?.("acts"); redraw();
      toast([on && `Disconnected from ${c.label}`, acts && `${plural(r.gone || 0, "activity", "activities")} removed`].filter(Boolean).join("; "));
    };
    if (on) sure.append(ui.btn(n ? `Disconnect, and Keep Its ${plural(n, "Activity", "Activities")}` : "Disconnect", { act: "keep", run: (e) => go2(e.currentTarget, false) }));
    if (n) sure.append(ui.btn(`${on ? "Disconnect, and Remove" : "Remove"} ${n === 1 ? "the Activity" : `All ${n} Activities`} from ${c.label}`, { destructive: true, act: "drop", run: (e) => go2(e.currentTarget, true) }));
    const first = ui.btn(on ? "Disconnect" : `Remove What ${c.label} Brought In`, { destructive: true, act: "leave", run: (e) => { e.currentTarget.hidden = true; sure.hidden = false; } });
    return el("div", { class: "fxs-leave" }, on ? null : ui.label(`From ${c.label} before`), first, sure,
      foot(on ? "New activities stop coming in. You choose whether the ones it brought in stay." : `${plural(n, "activity", "activities")} here came from ${c.label}. If they’re not yours, remove them.`));
  }
  const stat = (title, value) => ui.row({ title, value });
  // (after connecting or asking for everything: to Activities, where they come in)
  const toActs = () => { h?.close(); fw.nav.section?.("activities"); };
  const bring = (o) => { if (core.bringIn) core.bringIn(o).catch?.(() => {}); else core.pull?.(); };

  function garminPage() {
    const box = el("div", { class: "m-fitness fxs fxs-garmin" });
    const draw = () => {
      const g = S.garmin;
      const field = ui.field({ type: "password", placeholder: "Personal API key", label: "Your Garmin Personal API key" });
      const key = field.querySelector?.("input") || field;
      const add = async (b) => {
        if (!key.value.trim()) return key.focus();
        b.disabled = true;
        try { S.garmin = await A.garminConnect(key.value); key.value = ""; }
        catch (e) { b.disabled = false; if (e.status === 401) return lost(); return toast(e.message); }
        toActs(); bring({});
      };
      const keyForm = (label) => { const b = ui.btn(label, { primary: true, act: "connect", run: () => add(b) }); key.addEventListener("keydown", (e) => { if (e.key === "Enter") add(b); }); return [field, b]; };
      if (!g?.on) {
        box.replaceChildren(el("p", { class: "fxs-lead", text: "Your rides, runs and swims, in Fitness by themselves." }),
          ui.list([ui.row({ lead: el("b", { class: "fxs-num", text: "1" }), title: "Make a key in Garmin Connect", sub: "Settings, then Personal API Key, then Create" }),
            ui.row({ lead: el("b", { class: "fxs-num", text: "2" }), title: "Copy it, and paste it here", sub: "Garmin shows it only once" })], { label: "How" }),
          el("div", { class: "fxs-key" }, ...keyForm("Connect")),
          foot("The key is kept locked with your account and never shown again. Garmin’s personal keys only read: Fitness brings in your activities from the last six months, then each new one. Workouts still go to your device by Download."),
          leaving("garmin", false) || "");
        return;
      }
      const check = async (b) => {
        b.disabled = true;
        try { S.garmin = await A.garminFetch(true); } catch (e) { b.disabled = false; return toast(e.message); }
        const n = (await core.fromSource?.("garmin", { quiet: true })) || 0;
        redraw(); toast(n ? `${plural(n, "activity", "activities")} from Garmin` : S.garmin.ok ? "Nothing new" : "Your key has stopped working: add a new one");
      };
      const all = async (b) => {
        b.disabled = true;
        try { S.garmin = await A.garminAll(); } catch (e) { b.disabled = false; if (e.status === 401) return lost(); return toast(e.message); }
        toActs(); bring({ all: true });
      };
      const backTo = g.back && g.backAt > Date.UTC(2000, 0, 2) ? new Date(g.backAt).toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : null;
      box.replaceChildren(el("p", { class: "fxs-lead", text: g.ok ? (g.said === "unreachable" ? "Connected, but Garmin didn’t answer last time" : g.said === "full" ? "Connected, but your activities have used all the space there is (2 GB)" : "Connected") : "Your key has expired, or was deleted" }),
        ui.list([stat("Last checked", g.last ? ago(g.last) : "Not yet"), stat("Connected", g.since ? dayShort(g.since) : "")]),
        g.ok ? ui.btn("Check Now", { act: "check", run: (e) => check(e.currentTarget) }) : el("div", { class: "fxs-key" }, ui.label("A new key"), ...keyForm("Add the New Key")),
        foot("Fitness looks for new activities every 15 minutes, and as you open it: a ride shows up a minute or two after your watch syncs with Garmin Connect."),
        g.ok ? ui.btn(g.back ? "Carry On Bringing Them In" : "Bring In All Your Rides", { act: "all", run: (e) => all(e.currentTarget) }) : "",
        g.ok ? foot(g.back ? `Part way${backTo ? `: up to ${backTo}` : ""}. It carries on by itself every 15 minutes; this brings the rest in now.` : "Everything on Garmin Connect, not just the last six months: oldest first, skipping what’s here already.") : "",
        leaving("garmin", true) || "");
    };
    draw();
    track(box, draw);
    return box;
  }

  function stravaPage() {
    const box = el("div", { class: "m-fitness fxs fxs-strava-page" });
    const draw = () => {
      const g = S.strava;
      if (!g?.on) {
        box.replaceChildren(el("p", { class: "fxs-lead", text: "Your rides, runs and swims from Strava, in Fitness by themselves." }),
          ui.list([ui.row({ lead: el("b", { class: "fxs-num", text: "1" }), title: "Say yes on Strava’s page", sub: "Fitness asks to read your activities, the private ones too" }),
            ui.row({ lead: el("b", { class: "fxs-num", text: "2" }), title: "Back here, they come in", sub: "The last six months, then each new one" })], { label: "How" }),
          stravaLink(() => "Connect Strava"),
          foot("Strava opens on its own; come back here when it says you’re connected."),
          foot("Fitness only reads: it never posts to Strava or changes anything there. Disconnect here or on Strava at any time; what’s already in Fitness stays."),
          leaving("strava", false) || "");
        return;
      }
      const check = async (b) => {
        b.disabled = true;
        try { S.strava = await A.stravaFetch(true); } catch (e) { b.disabled = false; return toast(e.message); }
        const n = (await core.fromSource?.("strava", { quiet: true })) || 0;
        redraw(); toast(n ? `${plural(n, "activity", "activities")} from Strava` : S.strava.ok && !S.strava.said ? "Nothing new" : "Strava didn’t say anything new");
      };
      const all = async (b) => {
        b.disabled = true;
        try { S.strava = await A.stravaAll(); } catch (e) { b.disabled = false; if (e.status === 401) return lost(); return toast(e.message); }
        toActs(); bring({ all: true, src: "strava" });
      };
      box.replaceChildren(el("p", { class: "fxs-lead", text: g.ok ? (g.name ? `Connected as ${g.name}` : "Connected") : "Strava’s stopped letting Fitness in" }),
        ui.list([stat("Last checked", g.last ? ago(g.last) : "Not yet"), stat("Connected", g.since ? dayShort(g.since) : "")]),
        g.ok ? ui.btn("Check Now", { act: "check", run: (e) => check(e.currentTarget) }) : stravaLink(() => "Connect Strava Again"),
        !g.ok ? foot("Strava opens on its own; come back here when it says you’re connected.") : "",
        foot("Strava tells Fitness as each new activity’s saved, so it shows up a minute or two after it’s on Strava."),
        g.ok ? ui.btn(g.back ? "Carry On Bringing Them In" : "Bring In All Your Rides", { act: "all", run: (e) => all(e.currentTarget) }) : "",
        leaving("strava", true) || "",
        el("p", { class: "fxs-foot fxs-powered", text: "Powered by Strava" }));
    };
    draw();
    track(box, draw);
    return box;
  }

  // Apple Health, by a Shortcut: a key of your own in the address the Shortcut sends to (functions/_health.js)
  let healthKey = null;
  const healthUrl = (key) => `${fitnessOrigin(fw)}/api/fitness/health/${key}`;
  function healthPage() {
    const box = el("div", { class: "m-fitness fxs fxs-health" });
    const draw = () => {
      const x = S.health, key = healthKey;
      const make = async (b) => {
        b.disabled = true;
        try { const r = await A.healthKey(); healthKey = r.key; S.health = { ...r, key: undefined }; }
        catch (e) { b.disabled = false; if (e.status === 401) return lost(); return toast(e.message); }
        redraw();
      };
      const copy = (text, what) => ui.btn("Copy", { small: true, act: "copy", run: () => navigator.clipboard?.writeText(text).then(() => toast(`${what} copied`), () => toast("Couldn’t copy: press and hold to select it")) });
      const step = (n, title, sub) => ui.row({ lead: el("b", { class: "fxs-num", text: String(n) }), title, sub });
      const steps = () => [
        key ? el("div", { class: "fxs-hk" }, ui.label("Your address"), el("div", { class: "hk-box" }, el("code", { class: "hk-key", text: healthUrl(key) }), copy(healthUrl(key), "Address")),
          foot("Yours alone, and shown till the Shortcut’s first morning: copy it now. It can only send your nights to Fitness, nothing more.")) : "",
        ui.list([
          step(1, "Shortcuts, then Automation, then New Automation", "Time of Day, 07:30, Daily, Run Immediately. Then New Blank Automation."),
          step(2, "Find Health Samples: Heart Rate Variability", "Start Date is in the last 12 hours."),
          step(3, "Find Health Samples: Resting Heart Rate", "Start Date is in the last 1 day."),
          step(4, "Find Health Samples: Sleep, then Get Details: Duration", "Start Date is in the last 16 hours, Value is not In Bed, Value is not Awake."),
          step(5, "Get Contents of URL", "Paste your address. Method POST. Request Body JSON."),
          step(6, "Add three fields to the body", "hrv, step 2’s Health Samples; rhr, step 3’s; sleep, step 4’s Duration."),
        ], { label: "Make the Shortcut" }),
        foot("Then tap Run once: Fitness answers with what it got, and this page shows it."),
      ];
      if (!x?.on && !key) {
        box.replaceChildren(el("p", { class: "fxs-lead", text: "Your nights from your Apple Watch: HRV, resting heart rate and sleep, each morning." }),
          foot("Apple keeps Health on your iPhone, with no way for a website to ask for it. So a Shortcut sends it: each morning, it finds last night in Health and sends it here, with a key of your own."),
          ui.btn("Make My Key", { primary: true, act: "make", run: (e) => make(e.currentTarget) }),
          foot("Only those three numbers are sent, once a morning, and only from your phone. Turning it off forgets the key and every night it sent."));
        return;
      }
      const off = ui.btn("Turn Off", { destructive: true, act: "off", run: async (e) => {
        const b = e.currentTarget;
        if (!b.dataset.sure) { b.dataset.sure = "1"; b.querySelector("span").textContent = "Turn Off Apple Health"; return; }
        try { S.health = await A.healthOff(); healthKey = null; } catch (err) { return toast(err.message); }
        h.pop(); redraw(); toast("Apple Health off");
      } });
      const again = ui.btn("Check Again", { act: "again", run: async (e) => {
        const b = e.currentTarget; b.disabled = true;
        try { S.health = await A.health(); } catch (err) { toast(err.message); } finally { b.disabled = false; }
        redraw();
      } });
      box.replaceChildren(el("p", { class: "fxs-lead", text: x?.last ? `Last sent ${ago(x.last)}` : "Waiting for the Shortcut’s first morning" }),
        x?.on ? ui.list([stat("Last sent", x.last ? ago(x.last) : "Not yet"), stat("Nights", String(x.well?.length || 0))]) : "",
        ...steps(), x?.on ? again : "",
        !key ? ui.btn("Make a New Key", { act: "make", run: (e) => make(e.currentTarget) }) : "",
        !key ? foot("A new key’s address replaces the one in your Shortcut: paste it into step 5 again.") : "",
        off);
    };
    draw();
    track(box, draw);
    return box;
  }

  function devicesPage() {
    const box = el("div", { class: "m-fitness fxs fxs-devices" });
    const draw = () => {
      const g = S.garmin, st = S.strava, x = S.health;
      const said = (c, off) => (!c?.on ? off : !c.ok ? "Stopped letting Fitness in: connect again" : c.last ? `Connected · checked ${ago(c.last)}` : "Connected");
      const devs = new Map(); for (const a of S.acts) if (a.device) devs.set(a.device, (devs.get(a.device) || 0) + 1);
      const sub = (p, title, sub2) => { const r = ui.row({ title, sub: sub2, trail: "chevron", run: () => push(p) }); r.dataset.go = p; return r; };
      box.replaceChildren(
        ui.list([sub("garmin", "Garmin Connect", said(g, "Your rides and nights, in by themselves")),
          st?.ready !== false ? sub("strava", "Strava", said(st, "What you record on Strava, in by itself")) : "",
          sub("health", "Apple Health", x?.on ? (x.last ? `Last sent ${ago(x.last)}` : "Waiting for the Shortcut’s first morning") : "Your nights from your Apple Watch, by a Shortcut")].filter(Boolean), { label: "Sources" }),
        st?.ready !== false && !st?.on ? el("div", { class: "fxs-connect" }, stravaLink(() => "Connect Strava"), foot("Strava opens on its own; come back here when it says you’re connected.")) : "",
        devs.size ? ui.list([...devs].sort((a, b) => b[1] - a[1]).map(([d, k]) => ui.row({ title: d, sub: `Seen in ${plural(k, "file")}` })), { label: "What your activities were recorded on" }) : "");
    };
    draw();
    track(box, draw);
    if (S.strava?.ready !== false && !S.strava?.on) askStrava();
    return box;
  }

  const BUILD = { numbers: numbersPage, units: unitsPage, nights: nightsPage, devices: devicesPage, garmin: garminPage, strava: stravaPage, health: healthPage };
  function go(p) { prune(); h.push({ page: p, title: TITLES[p], body: BUILD[p]() }); }
  function push(p) { if (p === "strava" && !S.strava?.on) askStrava(); go(p); }

  const hero = { app: "fitness", name: "Fitness", line: "Your numbers, units and devices, kept with your account." };
  h = fw.sheet.open({ sheet: "fxsettings", title: "Fitness Settings", hero, body: root, app: "fitness",
    onClose: () => { alive = false; redraws.clear(); for (const off of offs) { try { off(); } catch (_) {} } if (shown === h) shown = null; } });
  if (!h) return null;
  shown = h;
  for (const evt of ["settings", "me", "acts"]) offs.push(core.on?.(evt, () => { if (alive) redraw(); }) || (() => {}));
  redraw();
  if (page) go(page);
  return h;
}
