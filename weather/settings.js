// Settings: its folders and what's in them (units, the look, notifications, Best times' activities, your account and
// signing in), opened from the page (app.js openSettings) and fetched the first time it is: seldom wanted, it needn't
// be read each time the app opens. The service worker keeps it with the rest, so it opens offline too. (What has to run
// whether or not it's ever opened, keeping notifications and your account in step, stays in app.js.)
import { $, S, CARDS, balance, STATES, adopt, afterFrame, calm, canShow, go, h, hereToo, mine, nkey, notifySaved, notifyWhy, notifying, place, redraw, refreshDevices, saveSettings, signedOut, signOutHere, syncNotify, windows } from "./app.js";
import * as A from "./account.js";
import * as I from "./insights.js";
import { glyph } from "./icons.js";
import { store } from "./data.js";
import { nowWall } from "./format.js";

/* ---------- settings ---------- */
export function drawSettings() {
  drawAccount();
  const form = $("settings-form");
  for (const k of ["temp", "wind", "precip", "pressure", "clock", "glass"]) { const r = form.querySelector(`input[name="${k}"][value="${S.settings[k]}"]`); if (r) r.checked = true; }
  form.commute.checked = !!S.settings.commute?.on;
  fillTimes(form.am, S.settings.commute?.am || "08:00"); fillTimes(form.pm, S.settings.commute?.pm || "17:30");
  form.tune.checked = S.settings.tune !== false;
  for (const k of ["laundry", "stars", "sunset"]) form[`x_${k}`].checked = S.settings.extras?.[k] !== false;
  drawNotify(); drawActs(); drawArrange(); drawFolders();
  // the word about the alerts, put away on the page: here instead, a row of its own at the top, till they're on
  $("alerts-row").hidden = !store.get("wx:nudge") || notifying(S.settings.notify) || !!notifyWhy();
}

// Settings is a short list of folders (index.html), each with what's in it said beside it, opening over the list
// with a way back (‹) where the sheet's title is; an activity's own page is a folder in Best times. setStack: the
// folders open, in order, each with where it was opened from (focus goes back there) and how far the one under it
// had scrolled.
let setStack = [], actEdit = null;

function drawFolders() {
  const s = S.settings, form = $("settings-form"), said = (k) => form.querySelector(`input[name="${k}"]:checked`)?.closest("label").textContent.trim() || "";
  const acts = s.activities.filter((a) => a.on !== false).map((a) => a.name);
  $("fv-notify").textContent = notifying(s.notify) ? "On" : "Off";
  $("fv-commute").textContent = s.commute?.on ? `${atText(s.commute.am)}, ${atText(s.commute.pm)}` : "Off";
  $("fv-acts").textContent = acts.length ? acts.join(", ") : "Off";
  $("fv-units").textContent = ["temp", "wind", "precip"].map(said).join(", ");
  $("fv-look").textContent = said("glass");
  $("fv-forecast").textContent = s.tune !== false ? "Tuned" : "Off";
  const L = s.layout, usual = L.order.join() === CARDS.map((c) => c[0]).join();
  $("fv-arrange").textContent = usual && !L.off.length ? "As usual" : L.off.length ? `${L.off.length} off` : "Your order";
}

/* ---------- arranging the page ---------- */
// The page's cards in your order, each with a switch to show it or not and a handle to move it by: dragged, or with the
// arrow keys on it. Kept with your settings, so the same on every device you're signed in on (app.js balance lays the
// page out as it says)
const nameOf = (k) => CARDS.find((c) => c[0] === k)[1];
function drawArrange(focus) {
  const L = S.settings.layout, list = $("arrange-list");
  list.replaceChildren(...L.order.map((k, i) => {
    const on = !L.off.includes(k), name = nameOf(k);
    const box = h("input", { type: "checkbox", checked: on, "aria-label": `Show ${name}`, onchange: (e) => showCard(k, e.target.checked) });
    const grip = h("button", { class: "arr-grip", type: "button", "aria-label": `Move ${name}`, "aria-description": "Drag up or down, or use the arrow keys", svg: glyph("grip", 20),
      onkeydown: (e) => { if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return; e.preventDefault(); moveCard(i, i + (e.key === "ArrowUp" ? -1 : 1), true); },
      onpointerdown: (e) => dragCard(e, li, i) });
    const li = h("li", { class: on ? null : "is-off", "data-k": k }, h("label", { class: "switch" }, box, ` ${name}`), grip);
    return li;
  }));
  if (focus != null) list.children[focus]?.querySelector(".arr-grip").focus({ preventScroll: true });
}
function arranged(focus) { saveSettings(); drawArrange(focus); drawFolders(); balance(undefined, true); }
function moveCard(from, to, keys = false) {
  const L = S.settings.layout;
  if (to < 0 || to >= L.order.length || to === from) return;
  const [k] = L.order.splice(from, 1); L.order.splice(to, 0, k);
  arranged(keys ? to : null);
  $("arrange-said").textContent = `${nameOf(k)}: ${to + 1} of ${L.order.length}.`;
}
function showCard(k, on) {
  const L = S.settings.layout;
  L.off = on ? L.off.filter((x) => x !== k) : [...new Set([...L.off, k])];
  arranged();
}
// a row dragged by its handle: it follows the finger, the others making way, and drops where it's let go
function dragCard(e, li, from) {
  if (e.button > 0) return;
  e.preventDefault(); e.stopPropagation();
  const grip = e.currentTarget, rows = [...li.parentElement.children], boxes = rows.map((r) => r.getBoundingClientRect()), hgt = boxes[from].height, y0 = e.clientY;
  let to = from;
  grip.setPointerCapture(e.pointerId);
  li.classList.add("dragging");
  for (const r of rows) if (r !== li) r.classList.add("shifting");
  const move = (ev) => {
    const dy = Math.max(boxes[0].top - boxes[from].top, Math.min(boxes.at(-1).bottom - boxes[from].bottom, ev.clientY - y0)), mid = boxes[from].top + hgt / 2 + dy;
    li.style.transform = `translateY(${dy}px)`;
    to = boxes.filter((b, i) => i !== from && b.top + b.height / 2 < mid).length;
    rows.forEach((r, i) => { if (r === li) return; const j = i < from ? i : i - 1, at = j < to ? j : j + 1; r.style.transform = at !== i ? `translateY(${(at - i) * hgt}px)` : ""; });
  };
  let over = false;
  const done = () => {
    if (over) return;
    over = true;
    grip.removeEventListener("pointermove", move);
    for (const r of rows) { r.style.transform = ""; r.classList.remove("shifting", "dragging"); }
    if (to !== from) moveCard(from, to);
  };
  grip.addEventListener("pointermove", move);
  grip.addEventListener("pointerup", done, { once: true });
  grip.addEventListener("pointercancel", done, { once: true });
  grip.addEventListener("lostpointercapture", done, { once: true });
}

function setShow(name, back, quiet = false) {
  const top = setStack.at(-1), under = setStack.at(-2);
  for (const pg of $("settings").querySelectorAll(".set-page")) {
    const on = pg.dataset.page === name;
    pg.hidden = !on; pg.classList.remove("in-next", "in-back");
    if (on && !quiet && !calm.matches) pg.classList.add(back ? "in-back" : "in-next");
  }
  $("settings-title").textContent = name === "root" ? "Settings" : top?.title || "Settings";
  $("set-back").hidden = name === "root";
  $("set-back").setAttribute("aria-label", `Back to ${under?.title || "Settings"}`);
}

export function setGo(name, title = $("settings").querySelector(`.set-page[data-page="${name}"]`)?.dataset.title) {
  const body = $("settings").querySelector(".sheet-body");
  setStack.push({ name, title, from: document.activeElement, scroll: body.scrollTop });
  setShow(name, false);
  body.scrollTop = 0;
  $("settings-title").focus({ preventScroll: true });
}

function setBack() {
  const top = setStack.pop(); if (!top) return;
  const prev = setStack.at(-1);
  setShow(prev?.name || "root", true);
  $("settings").querySelector(".sheet-body").scrollTop = top.scroll;
  if (!prev) drawFolders();
  // (an activity's changes kept on the way back, as iOS keeps them; its row, drawn anew, has the focus)
  if (top.name === "act" && actEdit) { const keep = actEdit; actEdit = null; keep(); }
  else top.from?.focus?.({ preventScroll: true });
}

export const setHome = () => { setStack = []; setShow("root", true, true); $("settings").querySelector(".sheet-body").scrollTop = 0; };

function readSettings(e) {
  if (e?.target?.closest?.("#notify-set") || e?.target?.closest?.(".acts-list, .acts-add")) return;     // (their own handlers)
  const form = $("settings-form"), v = (k) => form.querySelector(`input[name="${k}"]:checked`)?.value;
  const units = ["temp", "wind", "precip", "clock"].map((k) => S.settings[k]).join();
  for (const k of ["temp", "wind", "precip", "pressure", "clock", "glass"]) if (v(k)) S.settings[k] = v(k);
  S.settings.commute = { on: form.commute.checked, am: form.am.value || "08:00", pm: form.pm.value || "17:30" };
  S.settings.tune = form.tune.checked;
  S.settings.extras = { laundry: form.x_laundry.checked, stars: form.x_stars.checked, sunset: form.x_sunset.checked };
  saveSettings(); afterFrame(redraw); drawFolders();
  // (the times to choose from said the new way)
  if (S.f.units.clock !== units.split(",")[3]) for (const k of ["am", "pm", "briefAt"]) fillTimes(form[k], form[k].value);
  // notifications speak your units too
  const n = S.settings.notify;
  if ((notifying(n) || n.endpoint) && units !== ["temp", "wind", "precip", "clock"].map((k) => S.settings[k]).join()) syncNotify().catch(() => {});
}

// a time to choose, as "HH:MM": every quarter of an hour, said as the Clock setting says them (and the one chosen,
// should it be between)
function fillTimes(sel, at) {
  const list = Array.from({ length: 96 }, (_, k) => `${String(Math.floor(k / 4)).padStart(2, "0")}:${String((k % 4) * 15).padStart(2, "0")}`);
  if (/^\d\d:\d\d$/.test(at) && !list.includes(at)) list.push(at), list.sort();
  sel.replaceChildren(...list.map((v) => h("option", { value: v }, atText(v))));
  sel.value = at;
}

const atText = (at) => { const [hh, mm] = String(at || "07:00").split(":").map(Number); return S.f.time(Date.UTC(2000, 0, 1, hh || 0, mm || 0)); };

const nname = (p) => (p.gps ? "My Location" : p.name);

const spotOf = (p) => ({ lat: p.lat, lon: p.lon, name: p.name, ...(p.gps ? { gps: true } : {}) });

// Allowed to show them here? (asked straight away, while the tap still counts: Safari won't ask otherwise.) Signed in,
// a choice is the account's whether or not this device can show it: its other devices will. → [go on?, a word to say]
async function allowed() {
  const why = notifyWhy(), perm = why ? "denied" : Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (perm === "granted") return [true, ""];
  const said = why || "Notifications weren't allowed.";
  return S.acct ? [true, `${said} Your other devices will still get them.`] : [false, said];
}

const and = (a) => (a.length > 1 ? `${a.slice(0, -1).join(", ")} and ${a.at(-1)}` : a[0]);

// What's on is shown by the switches and chips, so the line that says it is only heard (a screen reader's); shown when
// there's more to it (saving, a note, why they can't be on)
function notifySay(text, quiet = false) { const st = $("notify-status"); st.textContent = text; st.classList.toggle("sr-only", quiet); }

function onText() {
  const n = S.settings.notify, rain = n.places.filter((p) => p.rain).map(nname), warn = n.places.filter((p) => p.warn).map(nname);
  const on = [rain.length ? `rain alerts for ${and(rain)}` : "", warn.length ? `official warnings for ${and(warn)}` : "", n.brief ? `a briefing at ${atText(n.briefAt)} for ${nname(n.brief)}` : ""].filter(Boolean);
  const mail = S.acct && [n.email?.warn && warn.length ? "the warnings" : "", n.email?.brief && n.brief ? "the briefing" : ""].filter(Boolean);
  return on.length ? `On: ${and(on)}.${mail?.length ? ` ${and(mail).replace(/^t/, "T")} by email too.` : ""}` : "Off.";
}

async function notifyChanged(note = "") {
  saveSettings(); drawNotify(true);
  notifySay("Saving…");
  try { await notifySaved(); notifySay(`${onText()}${note ? ` ${note}` : ""}`, !note); }
  catch (err) { notifySay(`Couldn't save that just now (${err.message}).`); }
  drawNotify(true); drawAccount();
}

// rain alerts or official warnings (k) for a place, on or off
async function togglePlace(p, k) {
  const n = S.settings.notify, key = nkey(p), e = n.places.find((x) => nkey(x) === key), on = !e?.[k];
  let note = "";
  if (on) { const [go, said] = await allowed(); if (!go) { notifySay(said); return; } note = said; }
  if (e) e[k] = on; else n.places.push({ ...spotOf(p), rain: k === "rain", warn: k === "warn" });
  n.places = n.places.filter((x) => x.rain || x.warn);
  await notifyChanged(note);
}

// the warnings and the briefing by email too (signed in: the account's choice, kept with it; the server sends them to its
// email, once that's confirmed)
async function onMail() {
  const form = $("settings-form");
  S.settings.notify.email = { warn: form.mailWarn.checked, brief: form.mailBrief.checked };
  await notifyChanged();
}

// the briefing: on or off, for which place, at what time
async function onNotify() {
  const form = $("settings-form"), n = S.settings.notify;
  let note = "";
  if (form.brief.checked && !n.brief) { const [go, said] = await allowed(); if (!go) { form.brief.checked = false; notifySay(said); return; } note = said; }
  const key = form.briefFor.value, p = S.places.find((x) => nkey(x) === key) || (n.brief && nkey(n.brief) === key ? n.brief : place());
  n.brief = form.brief.checked && p ? spotOf(p) : null;
  n.briefAt = form.briefAt.value || "07:00";
  await notifyChanged(note);
}

export function drawNotify(keepStatus = false) {
  const n = S.settings.notify, form = $("settings-form"), mine = (p) => n.places.find((e) => nkey(e) === nkey(p)) || {};
  // each saved place, and any notified of that isn't saved (from before)
  const rows = [...S.places, ...n.places.filter((e) => !S.places.some((p) => nkey(p) === nkey(e)))];
  $("notify-places").replaceChildren(...rows.map((p) => {
    const e = mine(p), name = nname(p);
    const chip = (k, text) => h("button", { class: "np-chip", type: "button", "data-k": k, "aria-pressed": String(!!e[k]), "aria-label": `${text} for ${name}`, onclick: () => togglePlace(p, k) }, text);
    return h("li", { class: "np-row", "data-key": nkey(p) }, h("span", { class: "np-name" }, name, p.gps && p.name !== "My Location" ? h("small", {}, p.name) : null), chip("rain", "Rain"), chip("warn", "Warnings"));
  }));
  form.brief.checked = !!n.brief;
  const opts = S.places.map((p) => h("option", { value: nkey(p) }, nname(p)));
  if (n.brief && !S.places.some((p) => nkey(p) === nkey(n.brief))) opts.push(h("option", { value: nkey(n.brief) }, n.brief.name));
  form.briefFor.replaceChildren(...opts);
  form.briefFor.value = n.brief ? nkey(n.brief) : place() ? nkey(place()) : "";
  fillTimes(form.briefAt, n.briefAt || "07:00");
  if (!keepStatus) notifySay(notifying(n) ? onText() : S.acct ? "" : notifyWhy() || "", notifying(n));
  drawMail(); drawNotifyAcct(); drawFolders();
}

// By email: signed in only, to the account's email once it's confirmed (the rain alerts not: an hour's notice by email
// comes too late)
export function drawMail() {
  const a = S.acct, form = $("settings-form"), n = S.settings.notify;
  $("notify-mail").hidden = !a;
  if (!a) return;
  form.mailWarn.checked = !!n.email?.warn; form.mailBrief.checked = !!n.email?.brief;
  form.mailWarn.disabled = form.mailBrief.disabled = !a.emailOk;
  $("notify-mail-foot").replaceChildren(...(a.emailOk ? [`To ${a.email}, for the places and time above. Rain alerts aren’t emailed: they’d come too late.`]
    : ["Confirm your email first, on ", h("button", { class: "link", type: "button", onclick: openAccount }, "your account page"), "."]));
}

const PERSON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8.5" r="3.6"/><path d="M4.8 19.6c1.3-3.4 4-5.1 7.2-5.1s5.9 1.7 7.2 5.1"/></svg>';

const PASSKEY = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="9" r="4"/><path d="M2.5 20c.8-3 2.9-4.6 5.5-4.6 1.1 0 2.1.3 3 .8M16.5 8.5a2.5 2.5 0 1 1 0 5v5l1.5-1.5 1.5 1.5v-3.2"/></svg>';

async function signIn(how, email, password) {
  const said = $("acct-said"), btns = [...$("acct-in").querySelectorAll("button")];
  // (as on every page of the site that signs in: the same words for what's missing)
  if (how !== "passkey" && (!email || !password)) { said.textContent = email ? "Enter your password." : "Enter your email."; said.classList.add("bad"); return; }
  said.classList.remove("bad"); said.textContent = "Signing in…"; btns.forEach((b) => (b.disabled = true));
  try { await adopt(how === "passkey" ? await A.withPasskey() : await A.withPassword(email, password), true); }
  catch (e) { const s2 = $("acct-said"); if (s2) { s2.textContent = e.message; s2.classList.add("bad"); } }
  finally { btns.forEach((b) => (b.disabled = false)); }
}

// this device getting the account's notifications too
async function sendHere() {
  const [go, said] = await allowed();
  if (!go || !canShow()) { notifySay(said); return; }
  try { await syncNotify(); await refreshDevices(); } catch (e) { notifySay(`Couldn't do that just now (${e.message}).`); }
}

export function drawAccount() {
  const box = $("acct"); if (!box) return;
  box.hidden = !!S.noAcct;
  // (signed in elsewhere on the site to an account this device hasn't been in step with: asked before its places go to it)
  if (S.ask && !S.acct) {
    const r = S.ask;
    return box.replaceChildren(
      h("div", { class: "acct-card" }, avatarOf(r), h("span", { class: "acct-txt" }, h("b", { id: "acct-title" }, r.name), h("span", {}, `@${r.handle} · signed in on this browser`))),
      h("p", { class: "acct-new" }, "Keep this device’s places and settings with this account, the same on every device it’s signed in on?"),
      h("button", { class: "acct-btn primary", type: "button", id: "acct-keep", onclick: () => adopt(r, true) }, `Keep them with @${r.handle}`),
      h("button", { class: "acct-btn", type: "button", id: "acct-notme", onclick: async () => { try { await A.signOut(); } catch (_) {} S.ask = null; signedOut(); } }, "Not you? Sign out"));
  }
  const a = S.acct, said = h("p", { class: "acct-said", id: "acct-said", role: "status" });
  $("about-app").textContent = a ? "Your places, settings and notifications are kept with your account." : "Settings and places stay on this device.";
  $("out-grp").hidden = !a;
  $("acct-in").replaceChildren();
  if (!a) {
    // (as on every page of the site that signs in: a passkey first, then your email and password; a forgotten password,
    // and a new account, on the account's own page)
    const pk = A.passkeysWork(), page = accountPage();
    const form = h("form", { class: "acct-form", novalidate: true, onsubmit: (e) => { e.preventDefault(); signIn("password", form.email.value.trim(), form.password.value); } },
      h("input", { type: "email", name: "email", autocomplete: "username webauthn", inputmode: "email", placeholder: "Email", "aria-label": "Email", autocapitalize: "off", spellcheck: "false" }),
      h("input", { type: "password", name: "password", autocomplete: "current-password", placeholder: "Password", "aria-label": "Password", onfocus: () => import("./argon2.js").catch(() => {}) }),
      h("button", { class: pk ? "acct-btn" : "acct-btn primary", type: "submit" }, "Sign in"));
    // (in Settings, a row; signing in, a folder of its own)
    box.replaceChildren(h("button", { class: "acct-card go", type: "button", id: "acct-signin", "data-go": "signin" }, h("span", { class: "acct-ic", svg: PERSON }),
      h("span", { class: "acct-txt" }, h("b", { id: "acct-title" }, "Sign in"), h("span", {}, "Your places on every device")), h("span", { class: "acct-chev", svg: glyph("chevron", 16) })));
    $("acct-in").replaceChildren(...[
      h("p", { class: "acct-lead" }, "Sign in with your georgefarrowgreen.com account to keep your places, settings and notifications the same on all your devices."),
      pk ? h("button", { class: "acct-btn primary", type: "button", id: "acct-passkey", onclick: () => signIn("passkey") }, h("span", { svg: PASSKEY }), "Sign in with a passkey") : null,
      pk ? h("p", { class: "acct-or" }, "or with your email") : null,
      form,
      page ? h("a", { class: "acct-link", href: `${page}#forgot` }, "Forgot password?") : null,
      said,
      page ? h("p", { class: "acct-new" }, "New here? ", h("a", { href: `${page}#join` }, "Create your account")) : null].filter(Boolean));
    return;
  }
  // (signed in from its own folder: back to the list, the account's card at its top)
  if (setStack.at(-1)?.name === "signin") setBack();
  // Just who, as a way to the account's own page (the profile, email, password, passkeys, devices and signing out are
  // there), and how your places and settings are doing, said only when there's something to say
  const said2 = STATES[a.state]?.[1];
  const who = [avatarOf(a), h("span", { class: "acct-txt" }, h("b", { id: "acct-title" }, a.name),
    h("span", { id: "acct-state", class: a.state === "error" ? "acct-bad" : "" }, `@${a.handle}${said2 ? ` · ${said2}` : ""}`))];
  box.replaceChildren(...[
    accountPage() ? h("button", { class: "acct-card in go", type: "button", id: "acct-open", onclick: openAccount }, ...who, h("span", { class: "acct-chev", svg: glyph("chevron", 16) }))
      : h("div", { class: "acct-card in" }, ...who),
    said].filter(Boolean));
  drawNotifyAcct();
}

// Where notifications go, signed in (in Notifications): the account's devices, and this one if it isn't among them yet
function drawNotifyAcct() {
  const box = $("notify-acct"); if (!box) return;
  const a = S.acct, n = S.settings.notify;
  if (!a) return box.replaceChildren();
  const to = a.devices.map((d) => (d.id === n.devId ? "this device" : d.label));
  box.replaceChildren(...[
    to.length ? h("p", { class: "note", id: "notify-where" }, `Notifications go to ${and(to)}.`) : null,
    notifying(n) && !hereToo() && !notifyWhy() ? h("button", { class: "acct-btn small", type: "button", id: "acct-here", onclick: sendHere }, "Send them here too") : null,
  ].filter(Boolean));
}

// The account's own page (account.<site>, beside weather.<site>), opened signed in as you: a code good once, for a
// minute, handed over in the address's # (the page swaps it for a sign-in of its own, in whichever browser it opens in,
// a Home Screen app's included, and takes it out of the address). The window's opened at once, from the tap (a phone
// won't open one later), and sent on when the code's back.
const accountPage = () => (location.hostname.startsWith("weather.") ? `${location.origin.replace("//weather.", "//account.")}/` : null);

async function openAccount() {
  const w = window.open("", "_blank");
  try {
    const { code } = await A.accountLink();
    const url = `${accountPage()}#${new URLSearchParams({ handoff: code, from: "weather" })}`;
    if (w && !w.closed) w.location.href = url; else location.href = url;
  } catch (e) { w?.close(); const said = $("acct-said"); if (said) { said.textContent = e.message; said.classList.add("bad"); } }
}

// Your photo (the account's: the same in every app on the site), or your initial
const avatarOf = (a, url = a.photoAt ? A.photoUrl(a.photoAt) : null) => h("span", { class: "acct-av", "aria-hidden": "true" },
  url ? h("img", { src: url, alt: "", width: "48", height: "48", decoding: "async" }) : (String(a.name || "").trim()[0] || "?").toUpperCase());

/* ---------- your activities ---------- */
// (focus: where the focus goes, the list drawn anew: [row, "on"] its switch, [row, "change"] its Change)
function saveActs(focus) { saveSettings(); if (S.wx) windows(S.wx, nowWall(S.wx.place.offset)); drawActs(focus); drawFolders(); }

export function drawActs(focus) {
  const f = S.f, acts = S.settings.activities, have = new Set(acts.map((a) => a.id));
  $("acts-list").replaceChildren(...acts.map((a, i) => h("li", { class: "act" },
    h("button", { class: "act-open", type: "button", "aria-label": `${a.name}, ${I.limitsText(a, f)}: change`, onclick: () => editAct(i) },
      h("span", { class: "act-icon", svg: glyph(a.icon || "star", 18) }),
      h("span", { class: "act-txt" }, h("b", {}, a.name), h("span", { class: "act-lim" }, I.limitsText(a, f))),
      h("span", { class: "act-chev", svg: glyph("chevron", 14) })),
    h("label", { class: "switch act-on" }, h("input", { type: "checkbox", "aria-label": a.name, checked: a.on !== false, onchange: (e) => { a.on = e.target.checked; saveActs([i, "on"]); } })))));
  $("act-add").replaceChildren(h("option", { value: "" }, "Choose…"),
    ...Object.entries(I.ACTIVITIES).filter(([id]) => !have.has(id)).map(([id, a]) => h("option", { value: id }, a.name)), h("option", { value: "custom" }, "Something else…"));
  if (focus) { const li = $("acts-list").children[Math.min(focus[0], acts.length - 1)]; (li?.querySelector(focus[1] === "on" ? "input" : "button") || $("act-add")).focus(); }
}

function editAct(i) {
  const a = S.settings.activities[i], f = S.f;
  const tU = (c) => Math.round(f.units.temp === "f" ? c * 9 / 5 + 32 : c), tM = (v) => (f.units.temp === "f" ? (v - 32) * 5 / 9 : v);
  const wk = f.windNum(1000) / 1000, wU = (k) => Math.round(k * wk), wM = (v) => v / wk;
  const num = (name, text, v, unit) => h("label", { class: "fld" }, h("span", {}, text), h("span", { class: "fld-in" }, h("input", { type: "number", name, value: String(v), inputmode: "numeric", step: "1" }), unit ? h("small", {}, unit) : null));
  const hour = (name, text, v) => h("label", { class: "fld" }, h("span", {}, text), h("select", { name }, ...Array.from({ length: 25 }, (_, k) => h("option", { value: String(k), selected: k === v ? true : null }, k === 24 ? "midnight" : f.time(Date.UTC(2000, 0, 1, k))))));
  const ed = h("div", { class: "act-edit" },
    h("label", { class: "fld wide" }, h("span", {}, "Name"), h("input", { type: "text", name: "name", value: a.name, maxlength: "24" })),
    num("tmin", "Feels like from", tU(a.tmin), "°"), num("tmax", "to", tU(a.tmax), "°"),
    num("windMin", "Wind at least", wU(a.windMin || 0), f.windUnit), num("windMax", "Wind at most", wU(a.windMax), f.windUnit),
    num("gustMax", "Gusts at most", wU(a.gustMax), f.windUnit),
    h("label", { class: "fld" }, h("span", {}, "Rain"), h("select", { name: "rain" }, ...[["dry", "Must be dry"], ["light", "Light rain is fine"], ["any", "Any weather"]].map(([v, t]) => h("option", { value: v, selected: a.rain === v ? true : null }, t)))),
    num("hours", "For (hours)", a.hours), hour("from", "Between", a.from), hour("to", "and", a.to),
    h("div", { class: "act-btns" }, h("button", { class: "pill-btn", type: "button", onclick: setBack }, "Done"),
      h("button", { class: "link danger", type: "button", onclick: () => { actEdit = null; S.settings.activities.splice(i, 1); setBack(); saveActs([i, "change"]); } }, "Remove")));
  const val = (k) => ed.querySelector(`[name="${k}"]`).value, n = (k, d) => { const v = parseFloat(val(k)); return Number.isFinite(v) ? v : d; };
  function done() {
    Object.assign(a, { name: val("name").trim().slice(0, 24) || a.name, tmin: tM(n("tmin", tU(a.tmin))), tmax: tM(n("tmax", tU(a.tmax))), windMin: Math.max(0, wM(n("windMin", 0))),
      windMax: Math.max(1, wM(n("windMax", wU(a.windMax)))), gustMax: Math.max(1, wM(n("gustMax", wU(a.gustMax)))), rain: val("rain"), hours: Math.max(1, Math.min(8, Math.round(n("hours", a.hours)))), from: Number(val("from")), to: Number(val("to")) });
    if (a.tmax < a.tmin) [a.tmin, a.tmax] = [a.tmax, a.tmin];
    if (a.to <= a.from) a.to = Math.min(24, a.from + a.hours);
    saveActs([i, "change"]);
  }
  $("act-page").replaceChildren(ed);
  actEdit = done;
  setGo("act", a.name);
}

function addAct() {
  const id = $("act-add").value; if (!id) return;
  const a = id === "custom" ? { id: `my${Date.now().toString(36)}`, name: "My activity", icon: "star", tmin: 10, tmax: 22, windMin: 0, windMax: 30, gustMax: 50, rain: "dry", hours: 2, from: 8, to: 20 } : { id, ...I.ACTIVITIES[id] };
  S.settings.activities.push({ ...a, on: true });
  saveActs();
  if (id === "custom") editAct(S.settings.activities.length - 1);
}

// what's in it, answering from now on (wired once, as this comes)
const form = $("settings-form");
$("settings").addEventListener("click", (e) => { const go = e.target.closest("[data-go]"); if (go) setGo(go.dataset.go); });
$("set-back").addEventListener("click", setBack);
// (closed while changing an activity: what's been changed kept)
$("settings").addEventListener("close", () => { if (actEdit) { const keep = actEdit; actEdit = null; keep(); } });
form.addEventListener("change", readSettings);
for (const k of ["brief", "briefFor", "briefAt"]) form[k].addEventListener("change", onNotify);
for (const k of ["mailWarn", "mailBrief"]) form[k].addEventListener("change", onMail);
$("sign-out").addEventListener("click", signOutHere);
$("act-add").addEventListener("change", addAct);
$("alerts-go").addEventListener("click", () => setGo("notify"));
$("arrange-reset").addEventListener("click", () => { S.settings.layout = { order: CARDS.map((c) => c[0]), off: [] }; arranged(); $("arrange-said").textContent = "Put back as it was."; });
for (const x of document.querySelectorAll(".arr-hint")) x.innerHTML = glyph("grip", 16);
