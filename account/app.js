// Your georgefarrowgreen.com account, on its own page: the one account every app on the site signs in with
// (functions/_account.js), in one place. Signed out: signing in, with a passkey or your email and password. Signed in:
// your profile (photo, name, handle), your apps, and sign-in and security (your password, passkeys and signed-in
// devices), signing out, and deleting the account. Each opens in a sheet that comes up from below; what could hurt if
// someone had only your sign-in asks you to show it's you first (functions/api/account/[[path]].js). The page never
// holds the sign-in itself: the browser keeps it, out of any page's reach, and the page asks with it.
//
// The password is stretched here as everywhere on the site (crypto.js, InFlight's own, served here too): it never leaves
// this device, only a proof of it. A new one locks your key anew with it, here, so nothing that's locked changes hands.

import { E2E, b64url, fromB64url } from "./crypto.js";

const API = "/api/account";
const $ = (s, r = document) => r.querySelector(s);
const main = $("#main"), sheetEl = $("#sheet"), toastEl = $("#toast");
const still = matchMedia("(prefers-reduced-motion: reduce)"), dark = matchMedia("(prefers-color-scheme: dark)");
const S = { me: null, settled: false };

// ---- building the page ----
// h("button.row.action", { type: "button", onclick }, ...children): an element, its classes, attributes and children
function h(spec, props, ...kids) {
  const [tag, ...cls] = spec.split(".");
  const el = document.createElement(tag || "div");
  if (cls.length) el.className = cls.join(" ");
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "text") el.textContent = v;
    else if (k === "value" || k === "disabled" || k === "hidden") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  el.append(...kids.flat().filter((x) => x != null && x !== false && x !== ""));
  return el;
}
const ICONS = {
  chev: '<path d="M9.5 6l6 6-6 6"/>',
  back: '<path d="M14.5 6l-6 6 6 6"/>',
  key: '<circle cx="7.5" cy="15.5" r="4"/><path d="M10.4 12.6 20 3m-3.5 3.5 3 3m-5.5-.5 2 2"/>',
  passkey: '<circle cx="9" cy="8" r="3.8"/><path d="M2.5 20.5c.4-3.6 3.2-6 6.5-6 1.3 0 2.5.3 3.5 1"/><circle cx="18" cy="13.5" r="2.6"/><path d="M18 16.1v5.4m0-2h2.2"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.8"/><path d="M10.8 18.5h2.4"/>',
  computer: '<rect x="3" y="4" width="18" height="12.5" rx="2.2"/><path d="M8.5 20.5h7M12 16.5v4"/>',
  devices: '<rect x="2.5" y="4.5" width="13.5" height="10" rx="1.8"/><path d="M5.5 18.5h7"/><rect x="16" y="8.5" width="5.5" height="11" rx="1.4"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.6"/><path d="m3.8 7 8.2 6 8.2-6"/>',
  camera: '<path d="M4 8h3l1.8-2.6h6.4L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.2" r="3.4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M7 7l10 10M17 7 7 17"/>',
  open: '<path d="M8 16 16 8M9.5 8H16v6.5"/>',
  face: '<path d="M4 8.5V6.5A2.5 2.5 0 0 1 6.5 4h2M15.5 4h2A2.5 2.5 0 0 1 20 6.5v2M20 15.5v2a2.5 2.5 0 0 1-2.5 2.5h-2M8.5 20h-2A2.5 2.5 0 0 1 4 17.5v-2M9 9.2v1.2M15 9.2v1.2M12.2 9.2v3.8h-1M9.2 15.6c1.6 1.3 4 1.3 5.6 0"/>',
  person: '<circle cx="12" cy="8.6" r="3.9"/><path d="M4.6 20c1.2-3.6 4-5.6 7.4-5.6s6.2 2 7.4 5.6"/>',
  shield: '<path d="M12 3.2 19.5 6v5.6c0 4.7-3.2 7.9-7.5 9.2-4.3-1.3-7.5-4.5-7.5-9.2V6z"/><path d="m8.8 12 2.3 2.3 4.2-4.6"/>',
};
function icon(name, size = 20, width = 2) {
  const t = document.createElement("template");
  t.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  return t.content.firstChild;
}

// ---- asking the account ----
async function call(path, { method = "GET", body, type } = {}) {
  let r;
  const headers = type ? { "Content-Type": type } : body !== undefined ? { "Content-Type": "application/json" } : {};
  try { r = await fetch(`${API}/${path}`, { method, headers, body: type ? body : body !== undefined ? JSON.stringify(body) : undefined, credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(30000) }); }
  catch (_) { throw Object.assign(new Error("You’re offline. Try again when you’re back online."), { offline: true }); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `Something went wrong (${r.status}).`), { status: r.status, field: j.field });
  return j;
}
const post = (path, body = {}) => call(path, { method: "POST", body });
const passkeysWork = () => !!(window.PublicKeyCredential && navigator.credentials?.get);

// the rest of the site, from here (account.<site> → chat.<site>, weather.<site>, <site>)
function siteUrl(sub) {
  const { protocol, hostname, port } = location;
  if (!hostname.startsWith("account.")) return `https://${sub ? sub + "." : ""}georgefarrowgreen.com/`;
  return `${protocol}//${sub ? sub + "." : ""}${hostname.slice(8)}${port ? ":" + port : ""}/`;
}

// ---- words for times ----
const rtf = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });
function ago(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 90) return "just now";
  for (const [n, unit] of [[3600, "minute"], [86400, "hour"], [86400 * 7, "day"]]) if (s < n) return rtf.format(-Math.round(s / { minute: 60, hour: 3600, day: 86400 }[unit]), unit);
  return "on " + day(t);
}
const day = (t) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });

// ---- the page ----
async function load() {
  try { S.me = await call("me"); }
  catch (e) {
    main.removeAttribute("aria-busy");
    return main.replaceChildren(h("div.welcome.rise", {}, h("div.mark", {}, icon("shield", 44, 1.8)), h("h1", { text: "Can’t reach your account" }),
      h("p", { text: e.offline ? "You’re offline. Your account will be here when you’re back online." : e.message }),
      h("button.pill", { type: "button", onclick: () => location.reload() }, "Try again")));
  }
  render();
}
function render() {
  // (settling into place the first time each way round: signed in, or out)
  const rise = !S.settled; S.settled = true;
  let i = 0;
  const r = (el) => { if (rise) { el.classList.add("rise"); el.style.setProperty("--i", i++); } return el; };
  main.replaceChildren(...(S.me?.signedIn ? signedIn(r) : signedOut(r)));
  main.removeAttribute("aria-busy");
  document.title = S.me?.signedIn ? `${S.me.name} · Account` : "Account · georgefarrowgreen.com";
  scrolled();
}
function avatar(m, small) {
  const el = h(small ? "div.avatar.small" : "div.avatar", { "aria-hidden": "true" }, [...String(m.name || m.handle || "?").trim()][0]?.toUpperCase() || "?");
  if (m.photoAt) el.append(h("img", { src: `${API}/me/photo?v=${m.photoAt}`, alt: "", decoding: "async" }));
  return el;
}
function section(title, group, foot) {
  return h("section.section", {}, title && h("h3", { text: title }), group, foot && h("p.foot", { text: foot }));
}
function row({ icon: ic, tint, title, sub, value, onclick, label }) {
  return h("button.row", { type: "button", onclick, "aria-label": label },
    h(`span.ic.${tint}`, {}, icon(ic, 19)),
    h("span.tx", {}, h("b", { text: title }), sub && h("small", { text: sub })),
    value != null && h("span.val", { text: String(value) }),
    h("span.chev", {}, icon("chev", 16, 2.4)));
}

function signedIn(r) {
  const m = S.me, n = m.apps?.weather?.places || 0;
  const app = (name, img, what, href) => h("a.app.glass", { href },
    h("img", { src: img, alt: "", width: 54, height: 54 }), h("b", { text: name }), h("span", { text: what }),
    h("span.open", {}, "Open", icon("open", 15, 2.4)));
  return [
    r(h("h1.large", { text: "Account" })),
    r(h("section.hero.glass", { "aria-label": "Your profile" }, avatar(m),
      h("h2", { text: m.name }),
      h("div.who", { text: `@${m.handle}` }),
      m.email && h("div.mail", {}, icon("mail", 15), h("span", { text: m.email })),
      h("button.pill", { type: "button", onclick: () => openSheet(profileView) }, "Edit profile"))),
    r(section("Your apps", h("div.apps", {},
      app("InFlight", "/apps/inflight.png", "Letters carried by pigeon, end-to-end encrypted.", siteUrl("chat")),
      app("Weather", "/apps/weather.png", n ? `${n} saved ${n === 1 ? "place" : "places"}, in step on every device.` : "Forecasts, radar and alerts, in step on every device.", siteUrl("weather"))))),
    r(section("Sign-in and security", h("div.group.glass", {},
      row({ icon: "key", tint: "blue", title: "Password", value: "Change", onclick: () => openSheet(passwordView) }),
      row({ icon: "passkey", tint: "indigo", title: "Passkeys", value: m.passkeys.length || "None", onclick: () => openSheet(passkeysView) }),
      row({ icon: "devices", tint: "green", title: "Signed-in devices", value: m.devices.length, onclick: () => openSheet(devicesView) })),
      "Your password and passkeys sign you in to every app on the site.")),
    r(section(null, h("div.group.glass", {}, h("button.row.action", { type: "button", onclick: (e) => signOut(e.currentTarget) }, "Sign out")),
      "Signs you out of every app on the site, in this browser.")),
    r(section(null, h("div.group.glass", {}, h("button.row.action.danger", { type: "button", onclick: () => openSheet(deleteView) }, "Delete account")))),
    r(h("footer.foot", {}, h("div", { text: `Your account since ${new Date(m.since).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}` }),
      h("a", { href: siteUrl(""), text: "georgefarrowgreen.com" }))),
  ];
}

function signedOut(r) {
  const said = h("p.said", { role: "alert" });
  const email = h("input", { type: "email", name: "email", autocomplete: "username webauthn", inputmode: "email", autocapitalize: "none", spellcheck: "false", required: true });
  const pw = h("input", { type: "password", name: "password", autocomplete: "current-password", required: true });
  const go = h("button.btn" + (passkeysWork() ? ".quiet" : ""), { type: "submit" }, "Sign in");
  const form = h("form.form", { onsubmit: async (e) => {
    e.preventDefault(); say(said, "");
    if (!email.value.trim()) return say(said, "Enter your email.", email);
    if (!pw.value) return say(said, "Enter your password.", pw);
    try {
      const m = await busy(go, "Signing in…", async () => {
        const { salt } = await post("signin/salt", { email: email.value.trim() });
        return post("signin/password", { email: email.value.trim(), proof: (await E2E.fromPassword(pw.value, salt)).proof });
      });
      welcome(m);
    } catch (err) { say(said, err.message, err.field === "email" ? email : pw); }
  } }, field("Email", email), field("Password", pw), go);
  const pk = passkeysWork() && h("button.btn", { type: "button", onclick: async (e) => {
    const b = e.currentTarget; say(said, "");
    try { welcome(await busy(b, "Waiting for your passkey…", signInWithPasskey)); }
    catch (err) { say(said, err.message); }
  } }, icon("face", 21, 1.9), "Sign in with a passkey");
  return [h("div.welcome", {},
    // (the mark floats; it rises in inside something else, as one animation can't do both)
    r(h("div", {}, h("div.mark", {}, icon("person", 48, 1.7)))),
    r(h("h1", { text: "Your account" })),
    r(h("p", { text: "One sign-in for every app on georgefarrowgreen.com. Your profile, password, passkeys and devices, in one place." })),
    r(h("div.signin.glass", {}, pk, pk && h("div.or", { text: "or with your email" }), form, said)),
    r(h("div.works", {}, h("span", { text: "Works with" }), h("img", { src: "/apps/inflight.png", alt: "InFlight", title: "InFlight" }), h("img", { src: "/apps/weather.png", alt: "Weather", title: "Weather" }))),
    r(h("p.foot.new", {}, "New here? Make your account in ", h("a", { href: siteUrl("chat"), text: "InFlight" }), "."))),
  ];
}
async function signInWithPasskey() {
  const o = await post("signin/options");
  let a;
  try { a = await navigator.credentials.get({ publicKey: { challenge: fromB64url(o.challenge), rpId: o.rpId, userVerification: "required", timeout: 120000 } }); }
  catch (e) { throw new Error(e?.name === "NotAllowedError" ? "No passkey was used." : "Your passkey couldn’t be used here."); }
  if (!a) throw new Error("No passkey was used.");
  return post("signin/passkey", { challenge: o.challenge, id: a.id, clientDataJSON: b64url(a.response.clientDataJSON),
    authenticatorData: b64url(a.response.authenticatorData), signature: b64url(a.response.signature) });
}
function welcome(m) {
  S.me = m; S.settled = false; render(); scrollTo(0, 0);
  toast(`Welcome back, ${String(m.name).trim().split(/\s+/)[0]}.`);
}
async function signOut(btn) {
  try { await busy(btn, "Signing out…", () => post("signout")); }
  catch (e) { if (!e.offline) return toast(e.message, true); }
  S.me = { signedIn: false }; S.settled = false; render(); scrollTo(0, 0);
  toast("Signed out.");
}

// ---- small things ----
function field(label, input) { return h("label.field", {}, h("span", { text: label }), input); }
function say(el, text, input) {
  el.textContent = text; el.classList.toggle("bad", !!text);
  if (text && !still.matches) el.animate([{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(5px)" }, { transform: "translateX(-3px)" }, { transform: "translateX(0)" }], { duration: 380, easing: "ease-out" });
  if (input) input.focus();
}
async function busy(btn, label, fn) {
  const kids = [...btn.childNodes], was = btn.disabled;
  btn.disabled = true; btn.replaceChildren(h("span.spin"), h("span", { text: label }));
  try { return await fn(); }
  finally { btn.disabled = was; btn.replaceChildren(...kids); }
}
let toastT = 0;
function toast(text, bad) {
  const top = !!toastEl.showPopover;
  toastEl.replaceChildren(bad ? icon("x", 18, 2.4) : icon("check", 18, 2.4), h("span", { text }));
  toastEl.classList.toggle("bad", !!bad);
  // (above an open sheet too: the top layer)
  if (top && !toastEl.matches(":popover-open")) { toastEl.showPopover(); void toastEl.offsetWidth; }
  toastEl.classList.add("on");
  clearTimeout(toastT);
  toastT = setTimeout(() => { toastEl.classList.remove("on"); toastT = setTimeout(() => top && toastEl.matches(":popover-open") && toastEl.hidePopover(), 600); }, 2800);
}
if (toastEl.showPopover) toastEl.popover = "manual";
// a button that asks once more before it acts ("Remove" → "Remove?"), going back after a moment
function twice(label, sure, act) {
  let t = 0;
  const b = h("button.mini", { type: "button", onclick: () => {
    if (!b.classList.contains("sure")) { b.classList.add("sure"); b.textContent = sure; clearTimeout(t); t = setTimeout(() => { b.classList.remove("sure"); b.textContent = label; }, 3500); return; }
    clearTimeout(t); act(b);
  } }, label);
  return b;
}
async function leave(el) {
  if (!el?.isConnected || still.matches) return;
  el.classList.add("leaving");
  await new Promise((ok) => setTimeout(ok, 380));
}

// ---- sheets: one dialog, each view drawn into it; the page steps back while it's up ----
const Sheet = { stack: [], cancel: null };
function openSheet(view) {
  Sheet.stack = [view]; draw(false);
  if (!sheetEl.open) { sheetEl.showModal(); document.body.classList.add("sheet-up"); }
}
function pushSheet(view) { Sheet.stack.push(view); draw(true); }
function popSheet() { Sheet.stack.pop(); if (Sheet.stack.length) draw(true); else closeSheet(); }
const redraw = () => sheetEl.open && Sheet.stack.length && draw(false);
function draw(swap) {
  const v = Sheet.stack.at(-1)(), deep = Sheet.stack.length > 1;
  const left = v.left || (deep ? h("button.link.back", { type: "button", onclick: () => (v.onBack || popSheet)() }, h("span.vh", { text: "Back" }), icon("back", 22, 2.4)) : null);
  const right = v.right || h("button.x", { type: "button", "aria-label": "Close", onclick: closeSheet }, icon("x", 17, 2.6));
  // (the sheet's own button first, so a phone's keyboard doesn't jump up before you ask for it)
  (left || right).setAttribute("autofocus", "");
  const body = h("div.sheet-body", {}, ...v.body);
  if (swap && !still.matches) body.classList.add("swap");
  sheetEl.replaceChildren(h("div.grab", { "aria-hidden": "true" }), h("div.sheet-head", {}, h("div.l", {}, left), h("h2", { id: "sheet-title", text: v.title }), h("div.r", {}, right)), body);
}
function closeSheet() {
  if (!sheetEl.open || sheetEl.classList.contains("closing")) return;
  const cancel = Sheet.cancel; Sheet.cancel = null;
  document.body.classList.remove("sheet-up");
  const done = () => { sheetEl.classList.remove("closing"); sheetEl.style.removeProperty("--from"); sheetEl.close(); sheetEl.replaceChildren(); Sheet.stack = []; cancel?.(); };
  if (still.matches) return done();
  sheetEl.classList.add("closing");
  const end = (e) => { if (e.target !== sheetEl) return; sheetEl.removeEventListener("animationend", end); clearTimeout(t); done(); };
  const t = setTimeout(() => { sheetEl.removeEventListener("animationend", end); done(); }, 700);
  sheetEl.addEventListener("animationend", end);
}
sheetEl.addEventListener("cancel", (e) => { e.preventDefault(); closeSheet(); });
sheetEl.addEventListener("click", (e) => {
  if (e.target !== sheetEl) return;
  const b = sheetEl.getBoundingClientRect();
  if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) closeSheet();
});
// swiping it down, by its top
{
  let y0 = null, dy = 0, t0 = 0;
  sheetEl.addEventListener("pointerdown", (e) => {
    if (!e.target.closest(".grab, .sheet-head") || e.target.closest("button, input, a")) return;
    y0 = e.clientY; t0 = e.timeStamp; dy = 0;
    sheetEl.setPointerCapture(e.pointerId); sheetEl.classList.add("dragging");
  });
  sheetEl.addEventListener("pointermove", (e) => {
    if (y0 == null) return;
    const d = e.clientY - y0; dy = d > 0 ? d : d / 6;
    sheetEl.style.transform = `translateY(${dy}px)`;
  });
  const up = (e) => {
    if (y0 == null) return;
    y0 = null; sheetEl.classList.remove("dragging");
    const fast = dy / Math.max(1, e.timeStamp - t0) > 0.55;
    sheetEl.style.transform = "";
    if (dy > 110 || (fast && dy > 30)) { sheetEl.style.setProperty("--from", `${dy}px`); closeSheet(); }
    else if (dy) sheetEl.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 420, easing: "cubic-bezier(0.32, 0.72, 0, 1)" });
  };
  sheetEl.addEventListener("pointerup", up);
  sheetEl.addEventListener("pointercancel", up);
}

// ---- showing it's you: for what needs it, asked when it's needed, then on with what you were doing ----
async function freshly(act) {
  try { return await act(); }
  catch (e) { if (e.status !== 403 || e.field !== "reauth") throw e; }
  await new Promise((ok, no) => {
    const quiet = () => no(Object.assign(new Error(""), { quiet: true }));
    Sheet.cancel = quiet;
    pushSheet(() => confirmView(() => { Sheet.cancel = null; Sheet.stack.pop(); draw(true); ok(); }, () => { Sheet.cancel = null; Sheet.stack.pop(); draw(true); quiet(); }));
  });
  return act();
}
function confirmView(ok, back) {
  const m = S.me, said = h("p.said", { role: "alert" }), pk = passkeysWork() && m.passkeys.length > 0;
  const pw = h("input", { type: "password", autocomplete: "current-password", name: "password" });
  const go = h("button.btn" + (pk ? ".quiet" : ""), { type: "submit" }, "Continue");
  return { title: "Confirm it’s you", onBack: back, body: [
    h("p", { text: "This needs you to show it’s you again, with a passkey or your password." }),
    pk && h("button.btn", { type: "button", onclick: async (e) => {
      say(said, "");
      try {
        await busy(e.currentTarget, "Waiting for your passkey…", async () => {
          const o = await post("signin/options");
          let a;
          try { a = await navigator.credentials.get({ publicKey: { challenge: fromB64url(o.challenge), rpId: o.rpId, userVerification: "required", timeout: 120000,
            allowCredentials: m.passkeys.map((p) => ({ type: "public-key", id: fromB64url(p.id) })) } }); }
          catch (_) { throw new Error("No passkey was used."); }
          await post("reauth", { challenge: o.challenge, id: a.id, clientDataJSON: b64url(a.response.clientDataJSON),
            authenticatorData: b64url(a.response.authenticatorData), signature: b64url(a.response.signature) });
        });
        ok();
      } catch (err) { say(said, err.message); }
    } }, icon("face", 21, 1.9), "Use a passkey"),
    pk && h("div.or", { text: "or your password" }),
    h("form.form", { onsubmit: async (e) => {
      e.preventDefault(); say(said, "");
      if (!pw.value) return say(said, "Enter your password.", pw);
      try { await busy(go, "Checking…", async () => post("reauth", { proof: (await E2E.fromPassword(pw.value, m.salt)).proof })); ok(); }
      catch (err) { say(said, err.message, pw); }
    } }, h("input.vh", { type: "email", autocomplete: "username", value: m.email || "", tabindex: "-1", "aria-hidden": "true", readonly: true }), field("Password", pw), go),
    said] };
}

// ---- your profile ----
function profileView() {
  const m = S.me, said = h("p.said", { role: "alert" });
  const name = h("input", { type: "text", value: m.name, autocomplete: "name", maxlength: "50", enterkeyhint: "done" });
  const handle = h("input", { type: "text", value: m.handle, autocomplete: "off", autocapitalize: "none", spellcheck: "false", maxlength: "20", enterkeyhint: "done" });
  const file = h("input.vh", { type: "file", accept: "image/*", tabindex: "-1", onchange: () => file.files[0] && changePhoto(file.files[0]) });
  const done = h("button.link.done", { type: "button", onclick: save }, "Done");
  const pic = avatar(m, true);
  async function save() {
    const changes = {};
    if (name.value.trim() !== m.name) changes.name = name.value.trim();
    if (handle.value.trim().replace(/^@/, "").toLowerCase() !== m.handle) changes.handle = handle.value.trim().replace(/^@/, "").toLowerCase();
    if (!Object.keys(changes).length) return closeSheet();
    try {
      S.me = await busy(done, "Saving…", () => call("me/profile", { method: "PATCH", body: changes }));
      closeSheet(); render(); toast(changes.handle ? `You’re @${S.me.handle} now.` : "Profile saved.");
    } catch (e) { say(said, e.message, e.field === "handle" ? handle : name); }
  }
  async function changePhoto(f) {
    pic.append(h("span.spin.on-photo"));
    try {
      const jpeg = await asPhoto(f);
      S.me = await call("me/photo", { method: "PUT", body: jpeg, type: "image/jpeg" });
      redraw(); render(); toast("Photo updated.");
    } catch (e) { pic.querySelector(".spin")?.remove(); say(said, e.message); }
  }
  for (const i of [name, handle]) i.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); save(); } });
  return { title: "Edit profile",
    left: h("button.link", { type: "button", onclick: closeSheet }, "Cancel"), right: done,
    body: [
      h("div.photo-row", {}, pic, h("div.photo-acts", {},
        h("button.pill", { type: "button", onclick: () => file.click() }, icon("camera", 17), m.photoAt ? "Change photo" : "Add a photo"),
        m.photoAt && h("button.pill.quiet", { type: "button", onclick: async (e) => {
          try { S.me = await busy(e.currentTarget, "Removing…", () => call("me/photo", { method: "DELETE" })); redraw(); render(); toast("Photo removed."); }
          catch (err) { say(said, err.message); }
        } }, "Remove")), file),
      h("div.form", {}, field("Name", name), field("Handle", h("div.at", {}, "@", handle)),
        field("Email", h("input", { type: "email", value: m.email || "", readonly: true, tabindex: "-1" }))),
      h("p.hint", { text: "Your photo, name and handle are the same in every app on the site. Your handle can change once a day." }),
      said] };
}
// A picture as a profile photo: the middle square of it, at most 512 pixels across, as a JPEG (which leaves out anything
// else in the file, such as where it was taken)
async function asPhoto(file) {
  let img;
  try { img = await createImageBitmap(file); }
  catch (_) {
    const url = URL.createObjectURL(file);
    try { img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; }); }
    catch (_) { throw new Error("That picture couldn’t be read. Try another one."); }
    finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  const w = img.width, ht = img.height, side = Math.min(w, ht), size = Math.min(512, side), c = document.createElement("canvas");
  c.width = c.height = size;
  c.getContext("2d").drawImage(img, (w - side) / 2, (ht - side) / 2, side, side, 0, 0, size, size);
  const jpg = await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.85));
  if (!jpg) throw new Error("That picture couldn’t be read. Try another one.");
  return jpg;
}

// ---- your password ----
// Has this password turned up in a data breach? Only the first 5 characters of its SHA-1 are asked (k-anonymity), and
// the answers checked here. No answer: no check.
async function leakedCount(pw) {
  try {
    const hx = [...new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(pw)))].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
    const r = await fetch(`${API}/pwned?p=${hx.slice(0, 5)}`, { cache: "no-store" });
    if (!r.ok) return 0;
    for (const line of (await r.text()).split("\n")) { const [suf, n] = line.trim().split(":"); if (suf === hx.slice(5)) return Number(n) || 0; }
  } catch (_) {}
  return 0;
}
const leakedSay = (n) => `This password has turned up in ${n === 1 ? "a data breach" : `${n.toLocaleString("en-GB")} data breaches`}, so it’s one of the first anyone would try. Choose another.`;
// how strong a password looks, 0 to 4 (at least 10 characters to count at all)
function strength(pw) {
  if (pw.length < 10 || /^(.)\1+$/.test(pw)) return 0;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(pw)).length;
  return Math.min(4, 1 + (pw.length >= 14) + (pw.length >= 18) + (kinds >= 3));
}
function passwordView() {
  const m = S.me, said = h("p.said", { role: "alert" });
  const pw = (ac) => h("input", { type: "password", autocomplete: ac });
  const cur = pw("current-password"), nw = pw("new-password"), again = pw("new-password");
  const bar = h("i"), meter = h("div.meter", { "aria-hidden": "true" }, bar), hint = h("p.hint", { "aria-live": "polite" });
  const go = h("button.btn", { type: "submit" }, "Change password");
  let leakT = 0, leaked = 0;
  const rate = () => {
    const s = strength(nw.value), v = nw.value;
    bar.style.setProperty("--m", v ? (leaked ? 0.12 : [0.12, 0.4, 0.62, 0.84, 1][s]) : 0);
    bar.style.setProperty("--mc", leaked || s === 0 ? "var(--danger)" : s === 1 ? "var(--warn)" : "var(--good)");
    hint.className = "hint" + (v && (leaked || !s) ? " bad" : v && s >= 2 ? " ok" : "");
    hint.textContent = !v ? "At least 10 characters. A few unrelated words make a strong one." : leaked ? leakedSay(leaked) : ["Use at least 10 characters.", "Fair. Longer would be stronger.", "Good.", "Strong.", "Very strong."][s];
  };
  nw.addEventListener("input", () => {
    leaked = 0; rate(); clearTimeout(leakT);
    if (nw.value.length >= 10) { const v = nw.value; leakT = setTimeout(async () => { const n = await leakedCount(v); if (nw.value === v) { leaked = n; rate(); } }, 450); }
  });
  rate();
  return { title: "Change password", body: [
    h("p", { text: "Your password signs you in to every app on the site. Changing it signs you out on your other devices." }),
    h("form.form", { onsubmit: async (e) => {
      e.preventDefault(); say(said, "");
      if (!cur.value) return say(said, "Enter your current password.", cur);
      if (nw.value.length < 10) return say(said, "Use at least 10 characters for your new password.", nw);
      if (nw.value !== again.value) return say(said, "The new passwords don’t match.", again);
      if (nw.value === cur.value) return say(said, "That’s your current password. Choose a new one.", nw);
      try {
        S.me = await busy(go, "Changing…", async () => {
          const n = await leakedCount(nw.value);
          if (n) throw Object.assign(new Error(leakedSay(n)), { field: "password" });
          // the key, unlocked with the current password, and locked anew with the new one, here
          const old = await E2E.fromPassword(cur.value, m.salt);
          const { vault } = await post("password/vault", { proof: old.proof });
          let inner;
          try { inner = await E2E.unlock(old.lockKey, vault); } catch (_) { throw Object.assign(new Error("Your current password isn’t right."), { field: "current" }); }
          const salt = E2E.newSalt(), next = await E2E.fromPassword(nw.value, salt);
          return post("password", { oldProof: old.proof, salt, proof: next.proof, vault: await E2E.lock(next.lockKey, inner) });
        });
        closeSheet(); render(); toast("Password changed. Your other devices were signed out.");
      } catch (err) { say(said, err.message, err.field === "current" ? cur : nw); }
    } }, h("input.vh", { type: "email", autocomplete: "username", value: m.email || "", tabindex: "-1", "aria-hidden": "true", readonly: true }),
      field("Current password", cur), field("New password", nw), meter, hint, field("New password again", again), go),
    said] };
}

// ---- passkeys ----
function passkeysView() {
  const m = S.me, said = h("p.said", { role: "alert" }), can = !!(window.PublicKeyCredential && navigator.credentials?.create);
  const list = m.passkeys.length
    ? h("div.group", {}, m.passkeys.map((p) => {
      const el = h("div.row", {}, h("span.ic.indigo", {}, icon("passkey", 19)),
        h("span.tx", {}, h("b", { text: p.label }), h("small", { text: `Added ${day(p.createdAt)}${p.usedAt ? ` · used ${ago(p.usedAt)}` : ""}` })),
        twice("Remove", "Remove?", async (b) => {
          try {
            const next = await freshly(() => busy(b, "", () => post("passkeys/remove", { id: p.id })));
            await leave(el); S.me = next; redraw(); render(); toast("Passkey removed.");
          } catch (e) { if (!e.quiet) say(sheetEl.querySelector(".said"), e.message); }
        }));
      return el;
    }))
    : h("div.group", {}, h("div.empty", { text: "No passkeys yet." }));
  return { title: "Passkeys", body: [
    h("p", { text: "A passkey signs you in with Face ID, Touch ID or your device’s passcode, in every app on the site. Nothing to remember, and nothing for anyone to steal." }),
    list,
    can && h("button.btn", { type: "button", onclick: async (e) => {
      const b = e.currentTarget; say(said, "");
      try { await freshly(() => busy(b, "Waiting for your device…", addPasskey)); redraw(); render(); toast("Passkey added."); }
      catch (err) { if (!err.quiet) say(sheetEl.querySelector(".said"), err.message); }
    } }, icon("plus", 19, 2.4), "Add a passkey"),
    said] };
}
async function addPasskey() {
  const o = await post("passkeys/options");
  let cred;
  try {
    cred = await navigator.credentials.create({ publicKey: {
      challenge: fromB64url(o.challenge), rp: { id: o.rpId, name: "georgefarrowgreen.com" },
      user: { id: fromB64url(o.user.id), name: o.user.name, displayName: o.user.displayName },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "required" },
      excludeCredentials: o.exclude.map((id) => ({ type: "public-key", id: fromB64url(id) })), attestation: "none", timeout: 120000 } });
  } catch (e) {
    throw new Error(e?.name === "InvalidStateError" ? "This device already has a passkey for your account." : e?.name === "NotAllowedError" ? "No passkey was saved." : "A passkey couldn’t be made here.");
  }
  const r = cred.response, spki = r.getPublicKey?.(), alg = r.getPublicKeyAlgorithm?.();
  if (!spki) throw new Error("This browser can’t save passkeys here yet.");
  S.me = await post("passkeys", { challenge: o.challenge, id: cred.id, publicKey: b64url(spki), alg, clientDataJSON: b64url(r.clientDataJSON) });
}

// ---- signed-in devices ----
function devicesView() {
  const m = S.me, others = m.devices.filter((d) => !d.current);
  const end = async (b, body, el) => {
    try {
      const next = await freshly(() => busy(b, "", () => post("devices/end", body)));
      if (el) await leave(el); else await Promise.all([...sheetEl.querySelectorAll(".row:not(.current)")].map(leave));
      S.me = next; redraw(); render(); toast(el ? "Signed out." : "Your other devices were signed out.");
    } catch (e) { if (!e.quiet) say(sheetEl.querySelector(".said"), e.message); }
  };
  return { title: "Signed-in devices", body: [
    h("p", { text: "Everywhere your account’s signed in. Signing a device out signs it out of every app on the site." }),
    h("div.group", {}, m.devices.map((d) => {
      const el = h(d.current ? "div.row.current" : "div.row", {},
        h("span.ic.grey", {}, icon(/iphone|android|phone|ipad|mobile/i.test(d.label) ? "phone" : "computer", 19)),
        h("span.tx", {}, h("b", {}, d.label, d.current && h("span.tag", { text: "This browser" })),
          h("small", { text: [d.place, d.current ? "Active now" : `Active ${ago(d.seenAt)}`].filter(Boolean).join(" · ") })),
        !d.current && twice("Sign out", "Sign out?", (b) => end(b, { id: d.id }, el)));
      return el;
    })),
    others.length > 1 && h("div.group", {}, h("button.row.action.danger", { type: "button", onclick: (e) => end(e.currentTarget, { others: true }) }, "Sign out of all other devices")),
    h("p.said", { role: "alert" })] };
}

// ---- deleting the account ----
function deleteView() {
  const m = S.me, said = h("p.said", { role: "alert" });
  const sure = h("input", { type: "text", autocomplete: "off", autocapitalize: "none", spellcheck: "false", placeholder: m.handle, "aria-label": `Type ${m.handle} to confirm` });
  const go = h("button.btn.danger", { type: "submit", disabled: true }, "Delete account");
  sure.addEventListener("input", () => { go.disabled = sure.value.trim().replace(/^@/, "").toLowerCase() !== m.handle; });
  return { title: "Delete account", body: [
    h("p", { text: "This deletes your account and everything kept with it, in every app on the site. It can’t be undone." }),
    h("ul.gone", {}, h("li", { text: "InFlight: your letters, friends and keys" }), h("li", { text: "Weather: your saved places and notifications" }),
      h("li", { text: "Your profile, password and passkeys" })),
    h("form.form", { onsubmit: async (e) => {
      e.preventDefault(); say(said, "");
      const confirm = sure.value.trim();
      try {
        await freshly(() => busy(go, "Deleting…", () => post("delete", { confirm })));
        S.me = { signedIn: false }; S.settled = false; closeSheet(); render(); scrollTo(0, 0);
        toast("Your account was deleted.");
      } catch (err) { if (!err.quiet) say(sheetEl.querySelector(".said"), err.message); }
    } }, field(`Type ${m.handle} to confirm`, h("div.at", {}, "@", sure)), go),
    said] };
}

// ---- the large title, giving way to the bar ----
let ticking = false;
function scrolled() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    const t = Math.min(1, Math.max(0, (scrollY - (S.me?.signedIn ? 6 : 120)) / 38));
    document.documentElement.style.setProperty("--bar", t.toFixed(3));
  });
}
addEventListener("scroll", scrolled, { passive: true });

// ---- the stars: a slow twinkle on a dark night (still with Reduce Motion), none by day ----
function stars() {
  const c = $(".stars"), g = c.getContext("2d");
  let pts = [], w = 0, ht = 0, raf = 0, last = 0;
  const seed = () => { pts = Array.from({ length: 170 }, () => ({ x: Math.random(), y: Math.random() * 0.9, r: Math.random() * 1.05 + 0.3, p: Math.random() * 6.28, s: 0.35 + Math.random() * 1.1 })); };
  const fit = () => {
    const d = Math.min(2, devicePixelRatio || 1);
    w = innerWidth; ht = innerHeight; c.width = Math.round(w * d); c.height = Math.round(ht * d); g.setTransform(d, 0, 0, d, 0, 0);
  };
  const paint = (t) => {
    g.clearRect(0, 0, w, ht); g.fillStyle = "#fff";
    const n = Math.min(pts.length, Math.round((w * ht) / 5200));
    for (let i = 0; i < n; i++) {
      const s = pts[i], tw = still.matches ? 0.7 : 0.5 + 0.5 * Math.sin((t / 1000) * s.s + s.p);
      g.globalAlpha = (0.25 + 0.6 * tw) * (1 - s.y * 0.75);
      g.beginPath(); g.arc(s.x * w, s.y * ht, s.r, 0, 6.2832); g.fill();
    }
  };
  const frame = (t) => { raf = 0; if (t - last > 66) { last = t; paint(t); } go(); };
  const go = () => { if (!raf && dark.matches && !still.matches && !document.hidden) raf = requestAnimationFrame(frame); };
  const start = () => { if (!dark.matches) return; fit(); paint(performance.now()); go(); };
  seed();
  addEventListener("resize", start);
  document.addEventListener("visibilitychange", go);
  dark.addEventListener?.("change", start);
  still.addEventListener?.("change", start);
  start();
}

stars();
load();
