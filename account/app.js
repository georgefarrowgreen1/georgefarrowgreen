// Your georgefarrowgreen.com account, on its own page: the one account every app on the site signs in with
// (functions/_account.js), in one place. Signed out: signing in, with a passkey or your email and password. Signed in:
// your profile (photo, name, handle), your apps, and sign-in and security (your password, passkeys and signed-in
// devices), signing out, and deleting the account. Each opens in a sheet that comes up from below; what could hurt if
// someone had only your sign-in asks you to show it's you first (functions/api/account/[[path]].js). The page never
// holds the sign-in itself: the browser keeps it, out of any page's reach, and the page asks with it.
//
// The password is stretched here as everywhere on the site (crypto.js, InFlight's own, served here too): it never leaves
// this device, only a proof of it. A new one locks your key anew with it, here, so nothing that's locked changes hands.
//
// Also: a security check-up (email confirmed, a passkey, the password against data breaches, devices long unused), your
// email (confirming it, changing it), recent activity, passkeys' names and where they're saved, preferences for every app
// (appearance; Weather's units), your data as a PDF (datapdf.js) or a JSON file, and deleting the account in 7 days unless it's kept. The page keeps
// up with changes made elsewhere when you come back to it. Links in the account's emails open here (#confirm=, #email=,
// #keep=).
//
// And: your photo changed by tapping it; your code (a QR code of the link that adds you in InFlight); each app's card, a
// way into it and what you have there (what it keeps of yours in its own sheet, behind ⓘ); the check-up kept in Sign-in
// and security, opened as a sheet; rows that say how things are (and, where there's something to do, a button); your
// name and photo kept at the top once the profile's scrolled away; what each app emails you; recent activity with a
// filter, the app on each, the place said once a day; "Not you?" on a password sign-in from somewhere else; a word about
// a passkey after signing in with a password; device and passkey rows that slide to sign out or remove (on a touch
// screen); and two even columns on a wide one.

import { E2E, b64url, fromB64url } from "./crypto.js";

const API = "/api/account";
const $ = (s, r = document) => r.querySelector(s);
const main = $("#main"), sheetEl = $("#sheet"), toastEl = $("#toast");
const still = matchMedia("(prefers-reduced-motion: reduce)"), dark = matchMedia("(prefers-color-scheme: dark)");
const S = { me: null, settled: false, pulled: 0 };
try { S.invite = sessionStorage.getItem("acct:invite") || null; } catch (_) {}
// Opened from an app (InFlight's profile, Weather's account card): a sign-in handed over by a code in the address's #
// (good once, for a minute: taken out of the address at once, so it's never in the history or a bookmark), what to open,
// and the way back. (Kept for the visit, so a reload still knows the way back.)
const APPS = { inflight: { name: "InFlight", sub: "chat" }, weather: { name: "Weather", sub: "weather" } };
const HANDOFF = (() => {
  const p = new URLSearchParams(location.hash.slice(1)), code = p.get("handoff");
  if (!code) return null;
  history.replaceState(null, "", location.pathname + location.search);
  if (APPS[p.get("from")]) try { sessionStorage.setItem("acct-from", p.get("from")); } catch (_) {}
  return { code, open: p.get("open") };
})();
// (which app sent you here: InFlight's profile, or Weather's account card)
function fromApp() { try { const f = sessionStorage.getItem("acct-from"); return APPS[f] ? f : null; } catch (_) { return null; } }
// (sent here only to edit your profile: Done and Cancel go straight back)
const justEditing = () => HANDOFF?.open === "profile" && fromApp();
// back to InFlight: this window closed where InFlight opened it, else InFlight opened here
function backToApp() {
  const app = APPS[fromApp()] || APPS.inflight;
  try { sessionStorage.removeItem("acct-from"); } catch (_) {}
  try { window.close(); } catch (_) {}
  setTimeout(() => { location.href = siteUrl(app.sub); }, 250);
}

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
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  download: '<path d="M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 19.5h14"/>',
  contrast: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/>',
  ruler: '<path d="M3.5 15.5 15.5 3.5l5 5-12 12z"/><path d="m7.5 11.5 2 2m1-5 2 2m1-5 2 2"/>',
  trash: '<path d="M4.5 7h15M10 11v6m4-6v6M6.5 7l.9 11.3a2 2 0 0 0 2 1.7h5.2a2 2 0 0 0 2-1.7L17.5 7M9.5 7V4.5h5V7"/>',
  alert: '<path d="M12 4 21 19.5H3z"/><path d="M12 10v4.2M12 17h.01"/>',
  signin: '<path d="M14.5 4.5h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3M10.5 16.5 15 12l-4.5-4.5M15 12H4.5"/>',
  signout: '<path d="M9.5 19.5h-3a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2h3M15.5 16.5 20 12l-4.5-4.5M20 12H9.5"/>',
  pencil: '<path d="M4.5 19.5 5.3 15.6 15.8 5.1a2 2 0 0 1 2.8 0l.3.3a2 2 0 0 1 0 2.8L8.4 18.7z"/>',
  undo: '<path d="M9 14 4.5 9.5 9 5"/><path d="M4.5 9.5H14a5.5 5.5 0 0 1 0 11h-3"/>',
  qr: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><path d="M13.5 13.5h3v3h-3zM17.5 17.5h3v3h-3zM13.5 20.5v-1M20.5 13.5v1"/>',
  info: '<circle cx="12" cy="12" r="8.6"/><path d="M12 11v5.4"/><path d="M12 7.7v.1" stroke-width="2.8"/>',
  share: '<path d="M12 3.5v11M8 7.5l4-4 4 4"/><path d="M6.5 11H5.5a1.5 1.5 0 0 0-1.5 1.5v6.5A1.5 1.5 0 0 0 5.5 20.5h13a1.5 1.5 0 0 0 1.5-1.5v-6.5a1.5 1.5 0 0 0-1.5-1.5h-1"/>',
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
// (a day as briefly as it'll go, for a row's value: today, yesterday, 3 Oct, or Oct 2025)
function when(t) {
  const d = new Date(t), now = new Date();
  if (d.toDateString() === now.toDateString()) return "today";
  if (d.toDateString() === new Date(Date.now() - 86400e3).toDateString()) return "yesterday";
  return d.toLocaleDateString("en-GB", d.getFullYear() === now.getFullYear() ? { day: "numeric", month: "short" } : { month: "short", year: "numeric" });
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---- appearance: the account's (Automatic, Light or Dark, as InFlight has it), remembered here for next time ----
function theme(pref) {
  const root = document.documentElement;
  if (pref === "light" || pref === "dark") root.dataset.theme = pref; else delete root.dataset.theme;
  try { localStorage.setItem("acct:appearance", pref || "auto"); } catch (_) {}
  const top = isDark() ? "#0b1024" : "#eef1fb";
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.setAttribute("content", top);
}
const isDark = () => (document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : dark.matches);
try { const t = localStorage.getItem("acct:appearance"); if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; } catch (_) {}

// ---- the page ----
async function load() {
  fromGate();
  await fromLink();
  // (a sign-in handed over by an app: who it's for asked first, and only taken once that's said yes to, as a page
  // elsewhere could send this browser here with a code of its own; never over a different account's sign-in here)
  if (HANDOFF) {
    try {
      const now = await call("me"), who = await post("handoff/who", { code: HANDOFF.code });
      if (now.signedIn && now.id === who.id) S.me = await post("handoff", { code: HANDOFF.code });
      else if (now.signedIn) { S.me = now; S.said = { text: `You’re signed in here as @${now.handle}. Sign out first to use @${who.handle} here.`, bad: true }; }
      else S.handoff = who;
    } catch (e) { setTimeout(() => toast(e.message, true), 400); }
  }
  try { if (!S.me?.signedIn) S.me = await call("me"); S.pulled = Date.now(); }
  catch (e) {
    main.removeAttribute("aria-busy");
    return main.replaceChildren(h("div.welcome.rise", {}, h("div.mark", {}, icon("shield", 44, 1.8)), h("h1", { text: "Can’t reach your account" }),
      h("p", { text: e.offline ? "You’re offline. Your account will be here when you’re back online." : e.message }),
      h("button.pill", { type: "button", onclick: () => location.reload() }, "Try again")));
  }
  if (S.me.prefs) theme(S.me.prefs.appearance);
  // (an invite, or a link to make an account, opened signed in: said, as making another means signing out first)
  if (S.me?.signedIn && S.gate === "join") S.said = { text: `You’re signed in as @${S.me.handle}. To make another account, sign out first.` };
  if (S.me?.signedIn) S.gate = null;
  render();
  if (HANDOFF?.open === "profile" && S.me?.signedIn) openSheet(profileView);
}
// A way in from elsewhere: #join and #forgot (the apps link here for both), #invite= (an invite, kept for the visit) and
// #reset= (a reset link from the email). Taken out of the address at once.
function fromGate() {
  const m = /^#(join|forgot|signin)$|^#(invite|reset)=([A-Za-z0-9_-]{40,50})$/.exec(location.hash);
  if (!m) return false;
  history.replaceState(null, "", location.pathname + location.search);
  if (m[1]) S.gate = m[1];
  else if (m[2] === "invite") { S.invite = m[3]; S.join = null; S.gate = "join"; try { sessionStorage.setItem("acct:invite", m[3]); } catch (_) {} }
  else { S.reset = { token: m[3] }; resetCheck(); }
  return true;
}
// A link from one of the account's emails: confirming the email, a new email, or keeping the account. The link's own
// token is what counts, so it works signed in or not, in whichever browser the email opens it in.
async function fromLink() {
  const m = /^#(confirm|email|keep)=([A-Za-z0-9_-]{40,50})$/.exec(location.hash);
  if (!m) return;
  history.replaceState(null, "", location.pathname + location.search);
  const [, kind, token] = m;
  try {
    const r = await post({ confirm: "email/confirm", email: "email/change-confirm", keep: "delete/keep" }[kind], { token });
    S.said = { kind, text: kind === "confirm" ? "Your email is confirmed." : kind === "email" ? `Your account’s email is now ${r.email}.` : "Your account is staying. Sign in to carry on." };
  } catch (e) { S.said = { kind, bad: true, text: e.message }; }
}
// (and one opened in a tab where the page is already open)
addEventListener("hashchange", async () => {
  if (fromGate()) { if (sheetEl.open) closeSheet(); S.settled = false; return render(); }
  if (!/^#(confirm|email|keep)=/.test(location.hash)) return;
  await fromLink();
  try { S.me = await call("me"); S.pulled = Date.now(); } catch (_) {}
  if (sheetEl.open) closeSheet();
  S.settled = false; render();
});
function render() {
  // (settling into place the first time each way round: signed in, out, or being deleted)
  const rise = !S.settled; S.settled = true;
  let i = 0;
  const r = (el) => { if (rise) { el.classList.add("rise"); el.style.setProperty("--i", i++); } return el; };
  main.replaceChildren(...(S.reset ? resetPage(r) : S.me?.deleting ? deleting(r) : S.me?.signedIn ? signedIn(r) : signedOut(r)).filter(Boolean));
  if (rise) S.riseUntil = Date.now() + i * 70 + 950;
  main.removeAttribute("aria-busy");
  document.title = S.me?.signedIn ? `${S.me.name} · Account` : "Account · georgefarrowgreen.com";
  whoBar();
  scrolled();
  if (S.said) { const { text, bad } = S.said; S.said = null; toast(text, bad, 5000); }
}
// the page drawn again with what's new, once it's settled into place (what changed behind the scenes)
function patch() { clearTimeout(S.patchT); S.patchT = setTimeout(render, Math.max(0, (S.riseUntil || 0) - Date.now())); }
function avatar(m, small) {
  const el = h(small ? "div.avatar.small" : "div.avatar", { "aria-hidden": "true" }, [...String(m.name || m.handle || "?").trim()][0]?.toUpperCase() || "?");
  if (m.photoAt) el.append(h("img", { src: `${API}/me/photo?v=${m.photoAt}`, alt: "", decoding: "async" }));
  return el;
}
function section(title, group, foot) {
  return h("section.section", {}, title && h("h3", { text: title }), group, foot && h("p.foot", { text: foot }));
}
// (value: how things are, amber where it needs you (warn); or, where there's one thing to do, that (a node: a button's look))
function row({ icon: ic, tint, title, sub, value, warn, onclick, label, cls = "" }) {
  return h("button.row" + cls, { type: "button", onclick, "aria-label": label },
    h(`span.ic.${tint}`, {}, icon(ic, 19)),
    h("span.tx", {}, h("b", { text: title }), sub && h("small", { text: sub })),
    value != null && (value instanceof Node ? h("span.val", {}, value) : h("span.val" + (warn ? ".warn" : ""), { text: String(value) })),
    h("span.chev", {}, icon("chev", 16, 2.4)));
}
const unitsSaid = (u) => [u.temp === "f" ? "°F" : "°C", { mph: "mph", kmh: "km/h", ms: "m/s", kn: "knots" }[u.wind], u.precip].join(" · ");

// (two even columns on a wide screen: who you are, your apps and your data on the left, the settings on the right)
const wide = matchMedia("(min-width: 1000px)");
wide.addEventListener("change", () => { if (S.me?.signedIn && !S.me.deleting && !S.reset) render(); });
// (this device, as Signed-in devices names it, in a word: "This iPhone")
const thisOne = (d) => { const k = String(d.label || "").split(" · ")[0]; return /^(iPhone|iPad|Mac)$/.test(k) ? `This ${k}` : "This device"; };
function signedIn(r) {
  const m = S.me, ap = m.apps || {}, pw = m.password || {}, here = m.devices.find((d) => d.current);
  // each app: a way into it, and what you have there (what it keeps of yours, behind ⓘ)
  const app = (id, name, img, use, sub) => h("div.app.glass", {},
    h("div.app-top", {}, h("img", { src: img, alt: "", width: 54, height: 54 }),
      h("button.about", { type: "button", "aria-label": `About ${name}`, onclick: () => openSheet(() => appView(id)) }, icon("info", 17, 1.9))),
    h("b", { text: name }), h("span.use", { text: use }), h("span.sub", { text: sub }),
    h("a.open-app", { href: siteUrl(id === "inflight" ? "chat" : "weather"), "aria-label": `Open ${name}` }, "Open", icon("open", 15, 2.6)));
  const f = ap.inflight || {}, w = ap.weather || {}, alerts = !!(w.notify?.places || w.notify?.brief), plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const apps = r(section("Your apps", h("div.apps", {},
    app("inflight", "InFlight", "/apps/inflight.png", f.friends ? `${plural(f.friends, "friend", "friends")} · ${f.sent || 0} sent` : "No friends yet",
      f.places ? `${plural(f.places, "place", "places")} in your passport` : "Letters carried by pigeon"),
    app("weather", "Weather", "/apps/weather.png", w.places ? plural(w.places, "place", "places") : "No places yet",
      w.places ? (alerts ? "Alerts on" : "Alerts off") : "Forecasts, radar and alerts"))));
  const top = [
    fromApp() && r(h("button.pill.quiet.backapp", { type: "button", onclick: backToApp }, icon("back", 17, 2.4), APPS[fromApp()].name)),
    r(h("h1.large", { text: "Account" })),
    r(h("section.hero.glass", { "aria-label": "Your profile" }, avatarButton(m),
      h("h2", { text: m.name }),
      h("div.who", { text: `@${m.handle}` }),
      m.email && h("div.mail", {}, icon("mail", 15), h("span", { text: m.email })),
      h("div.hero-acts", {},
        h("button.pill", { type: "button", onclick: () => openSheet(profileView) }, "Edit profile"),
        h("button.pill", { type: "button", onclick: () => openSheet(codeView) }, icon("qr", 17, 2), "Your code")))),
    (!m.emailOk || m.emailNew) && r(banner(m)),
    pw.leaked && r(leakBanner()),
  ];
  // each row says how things are; where there's one thing to do, it says so
  const security = r(section("Sign-in and security", h("div.group.glass", {},
    checkupRow(m),
    row({ icon: "mail", tint: "blue", title: "Email", value: m.emailOk ? "Confirmed" : "Not confirmed", warn: !m.emailOk, onclick: () => openSheet(emailView) }),
    row({ icon: "key", tint: "blue", title: "Password",
      value: pw.setAt ? `${Math.abs(pw.setAt - m.since) < 5 * 60e3 ? "Set" : "Changed"} ${when(pw.setAt)}` : null, onclick: () => openSheet(passwordView) }),
    row({ icon: "passkey", tint: "indigo", title: "Passkeys", value: m.passkeys.length || h("span.mini.go", { text: "Add one" }), onclick: () => openSheet(passkeysView) }),
    row({ icon: "devices", tint: "green", title: "Signed-in devices", value: m.devices.length === 1 && here ? thisOne(here) : m.devices.length, onclick: () => openSheet(devicesView) }),
    row({ icon: "clock", tint: "grey", title: "Recent activity", value: m.lastActivity ? cap(when(m.lastActivity)) : null, onclick: () => openSheet(activityView) })),
    "Your email, password and passkeys sign you in to every app on the site."));
  const prefs = r(section("Preferences", h("div.group.glass", {},
    row({ icon: "contrast", tint: "indigo", title: "Appearance", value: { auto: "Automatic", light: "Light", dark: "Dark" }[m.prefs.appearance], onclick: () => openSheet(appearanceView) }),
    row({ icon: "ruler", tint: "blue", title: "Units", value: unitsSaid({ ...unitsHere(), ...(m.prefs.units || {}) }), onclick: () => openSheet(unitsView) }),
    row({ icon: "mail", tint: "red", title: "Emails", value: m.emails?.inflight ? "All on" : "Security only", onclick: () => openSheet(emailsView) })),
    "For every app on the site that has them."));
  const data = r(section("Your data", h("div.group.glass", {},
    row({ icon: "download", tint: "green", title: "Download your data", onclick: () => openSheet(exportView) }))));
  const ending = [
    r(section(null, h("div.group.glass", {}, h("button.row.action", { type: "button", onclick: (e) => signOut(e.currentTarget) }, "Sign out")),
      "Signs you out of every app on the site, in this browser.")),
    r(section(null, h("div.group.glass", {}, h("button.row.action.danger", { type: "button", onclick: () => openSheet(deleteView) }, "Delete account")))),
    r(h("footer.foot", {}, h("div", { text: `Your account since ${new Date(m.since).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}` }),
      h("a", { href: siteUrl(""), text: "georgefarrowgreen.com" }))),
  ];
  const [a, b] = wide.matches ? [[...top, apps, data], [security, prefs, ...ending]] : [top, [apps, security, prefs, data, ...ending]];
  return [h("div.cols", {}, h("div.col-a", {}, a.filter(Boolean)), h("div.col-b", {}, b.filter(Boolean)))];
}
// Your photo, tapped: a new one, straight from the picker (the camera badge says so)
function avatarButton(m) {
  const file = h("input.vh", { type: "file", accept: "image/*", tabindex: "-1", "aria-hidden": "true", onchange: () => file.files[0] && heroPhoto(file.files[0], btn) });
  const btn = h("button.avatar-btn", { type: "button", "aria-label": m.photoAt ? "Change your photo" : "Add a photo", onclick: () => file.click() },
    avatar(m), h("span.cam", { "aria-hidden": "true" }, icon("camera", 15, 2.2)));
  return [btn, file];
}
async function heroPhoto(f, btn) {
  btn.querySelector(".avatar")?.append(h("span.spin.on-photo"));
  try { const jpeg = await asPhoto(f); S.me = await call("me/photo", { method: "PUT", body: jpeg, type: "image/jpeg" }); render(); toast("Photo updated."); }
  catch (e) { btn.querySelector(".spin")?.remove(); toast(e.message, true); }
}
// Your code: a QR code of the link that adds you in InFlight, to show a friend (or share the link itself)
function codeView() {
  const m = S.me, link = `${siteUrl("chat")}#add=${m.handle}`, qr = h("div.qr");
  import("./qr.js").then(({ qrSvg }) => { qr.innerHTML = qrSvg(link, { dark: "#0d1020", light: "#ffffff", title: `Add @${m.handle} in InFlight` }); })
    .catch(() => qr.replaceChildren(h("span.qr-none", { text: "The code couldn’t be drawn here. Copy the link instead." })));
  return { title: "Your code", body: [
    h("div.code-card", {}, avatar(m, true), h("b", { text: m.name }), h("span", { text: `@${m.handle}` }), qr),
    h("p.hint.center", { text: "A friend points their phone’s camera at it to add you in InFlight." }),
    h("div.code-acts", {},
      navigator.share && h("button.btn", { type: "button", onclick: () => navigator.share({ title: `${m.name} on InFlight`, text: `Add me on InFlight: @${m.handle}`, url: link }).catch(() => {}) }, icon("share", 19, 2), "Share"),
      h("button.btn" + (navigator.share ? ".quiet" : ""), { type: "button", onclick: async () => { try { await navigator.clipboard.writeText(link); toast("Link copied."); } catch (_) { toast(link); } } }, "Copy link")),
  ] };
}
const notifySaid = (n) => [n?.places && `${n.places} ${n.places === 1 ? "place" : "places"}`, n?.brief && "morning brief"].filter(Boolean).join(" · ") || "Off";
// An app: what it keeps of yours, in a word or two, and the way into it
function appView(id) {
  const m = S.me, ap = m.apps || {}, inflight = id === "inflight";
  const head = h("div.app-head", {}, h("img", { src: inflight ? "/apps/inflight.png" : "/apps/weather.png", alt: "", width: 64, height: 64 }),
    h("b", { text: inflight ? "InFlight" : "Weather" }), h("span", { text: inflight ? "Letters carried by pigeon" : "A forecast that explains itself" }));
  const stat = (n, label) => h("div.stat", {}, h("b", { text: String(n) }), h("span", { text: label }));
  const open = h("a.btn", { href: siteUrl(inflight ? "chat" : "weather") }, `Open ${inflight ? "InFlight" : "Weather"}`, icon("open", 18, 2.4));
  if (inflight) {
    const f = ap.inflight || {};
    return { title: "InFlight", quiet: true, body: [head,
      h("div.stats", {}, stat(f.friends || 0, f.friends === 1 ? "friend" : "friends"), stat(f.sent || 0, f.sent === 1 ? "pigeon sent" : "pigeons sent"),
        stat(f.places || 0, f.places === 1 ? "place in your passport" : "places in your passport"), stat(f.groups || 0, f.groups === 1 ? "group" : "groups")),
      h("p.hint", { text: "Your letters are end-to-end encrypted: only your phones can read them, so they’re not counted here." }), open] };
  }
  const w = ap.weather || {}, names = w.placeNames || [];
  return { title: "Weather", quiet: true, body: [head,
    h("div.group", {},
      h("div.row.plain.info", {}, h("span.tx", {}, h("b", { text: "Saved places" })), h("span.val", { text: String(w.places || 0) })),
      names.length > 0 && h("div.row.plain.places", {}, h("span.tx", {}, h("small", { text: names.join(" · ") + (w.places > names.length ? ` · and ${w.places - names.length} more` : "") }))),
      h("div.row.plain.info", {}, h("span.tx", {}, h("b", { text: "Notifications" })), h("span.val", { text: notifySaid(w.notify) })),
      h("div.row.plain.info", {}, h("span.tx", {}, h("b", { text: "Units" })), h("span.val", { text: unitsSaid({ ...unitsHere(), ...(m.prefs.units || {}) }) }))),
    h("p.hint", { text: "Kept with your account, so they’re the same on every device you use Weather on." }), open] };
}

// Your email isn't confirmed (or a new one's waiting to be): said up top, with what to do
function banner(m) {
  const sending = async (b) => {
    try { await busy(b, "Sending…", () => post("email/confirm-send")); toast(`A link is on its way to ${m.email}.`); }
    catch (e) { toast(e.message, true); }
  };
  return m.emailNew
    ? h("section.banner.glass", { role: "status" }, h("span.ic.blue", {}, icon("mail", 19)),
      h("span.tx", {}, h("b", { text: "Confirm your new email" }), h("small", { text: `We sent a link to ${m.emailNew}. Your email changes when you open it.` })),
      h("button.mini.go", { type: "button", onclick: () => openSheet(emailView) }, "Details"))
    : h("section.banner.warn.glass", { role: "status" }, h("span.ic.amber", {}, icon("alert", 19)),
      h("span.tx", {}, h("b", { text: "Confirm your email" }), h("small", { text: "So password resets and security notes reach you. We’ll send a link to it." })),
      h("button.mini.go", { type: "button", onclick: (e) => sending(e.currentTarget) }, "Send link"));
}
// Your password found in a data breach: said up top, as it's the one check that can't wait
function leakBanner() {
  return h("section.banner.warn.glass", { role: "alert" }, h("span.ic.red", {}, icon("alert", 19)),
    h("span.tx", {}, h("b", { text: "Your password is in a data breach" }), h("small", { text: "It’s one of the first anyone would try. Change it to keep your account safe." })),
    h("button.mini.go", { type: "button", onclick: () => openSheet(passwordView) }, "Change"));
}
// The security check-up: what keeps the account safe, done or to do. A row in Sign-in and security says how it
// stands; tapped, a sheet with a ring for how far along and each check with its fix (opened over it, Back to return).
function checks(m) {
  const stale = m.devices.filter((d) => d.stale).length, pw = m.password || {};
  return [
    { ok: m.emailOk, label: m.emailOk ? "Email confirmed" : "Confirm your email", go: "Send link", act: async (b) => {
      try { await busy(b, "", () => post("email/confirm-send")); toast(`A link is on its way to ${m.email}.`); } catch (e) { toast(e.message, true); } } },
    { ok: m.passkeys.length > 0, label: m.passkeys.length ? `Passkey saved${m.passkeys.length > 1 ? ` (${m.passkeys.length})` : ""}` : "Add a passkey", go: "Add", act: () => pushSheet(passkeysView) },
    { ok: pw.leaked === false, label: pw.leaked ? "Password found in a data breach" : pw.leaked === false ? "Password not in a known data breach" : "Check your password for data breaches",
      go: pw.leaked ? "Change" : "Check", act: () => pushSheet(pw.leaked ? passwordView : checkView) },
    { ok: !stale, label: stale ? `${stale} device${stale > 1 ? "s" : ""} unused for 3 months` : "No devices left unused", go: "Review", act: () => pushSheet(devicesView) },
  ];
}
function checkupRow(m) {
  const todo = checks(m).filter((x) => !x.ok).length;
  return row({ icon: "shield", tint: todo ? "amber" : "green", title: "Security check-up", value: todo ? `${todo} to do` : "All done", warn: !!todo, onclick: () => openSheet(checkupView) });
}
function checkupView() {
  const items = checks(S.me), todo = items.filter((x) => !x.ok).length, frac = (items.length - todo) / items.length;
  const ring = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  ring.setAttribute("viewBox", "0 0 64 64"); ring.setAttribute("aria-hidden", "true"); ring.classList.add("ring");
  ring.innerHTML = `<circle class="trk" cx="32" cy="32" r="27"/><circle class="arc" cx="32" cy="32" r="27" pathLength="100" stroke-dasharray="${(frac * 100).toFixed(1)} 100"/>`;
  return { title: "Security check-up", body: [h(`div.checkup${todo ? ".todo" : ".ok"}`, {},
    h("div.ck-top", {}, h("span.ck-ring", {}, ring, icon("shield", 24, 1.9)),
      h("span.tx", {}, h("b", { text: todo ? `${todo} thing${todo > 1 ? "s" : ""} to do` : "Well protected" }),
        h("small", { text: todo ? "A minute each, and your account is safer." : "Everything that keeps your account safe is on." }))),
    h("div.group.ck-list", {}, items.map((x) => h("div.ck-row" + (x.ok ? ".ok" : ""), {},
      h("span.ck-dot", { "aria-hidden": "true" }, x.ok && icon("check", 13, 3)), h("span.ck-t", { text: x.label }),
      !x.ok && h("button.mini.go", { type: "button", onclick: (e) => x.act(e.currentTarget) }, x.go)))))] };
}
// Being deleted: when, and keeping it
function deleting(r) {
  const m = S.me;
  return [h("div.welcome", {},
    r(h("div", {}, h("div.mark.red", {}, icon("trash", 44, 1.7)))),
    r(h("h1", { text: "Your account is being deleted" })),
    r(h("p", { text: `On ${new Date(m.deleteAt).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}, @${m.handle} and everything kept with it, in every app on the site, will be deleted. Until then, you can keep it.` })),
    r(h("div.signin.glass", {},
      h("button.btn", { type: "button", onclick: async (e) => {
        try { S.me = await busy(e.currentTarget, "Keeping it…", () => post("delete/cancel")); S.settled = false; theme(S.me.prefs?.appearance); render(); toast("Your account is staying."); }
        catch (err) { toast(err.message, true); }
      } }, icon("undo", 20, 2.2), "Keep my account"),
      h("button.btn.quiet", { type: "button", onclick: (e) => signOut(e.currentTarget) }, "Sign out")))),
  ];
}

// ---- signed out: signing in; or making an account (by invite: accounts are made here, and only here); or a forgotten
// password (a link to the email), and a new one from its link (resetPage). Which: S.gate, "signin", "join" or "forgot"
// (#join, #forgot and #invite= open the last two, as the apps link here) ----
const HANDLE_OK = /^[a-z0-9_]{3,20}$/, EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// the way between them: the form below changed in place, the rest of the page staying put
// the account's own icon (icon.svg: a warm head, frosted glass shoulders, as Weather's sun and cloud)
const logo = () => h("div.mark.logo", {}, h("img", { src: "/icon.svg?v=2", alt: "", width: 92, height: 92 }));
function gate(to) { S.gate = to; S.settled = true; render(); $("main .signin input")?.focus(); }
function signedOut(r) {
  if (S.handoff) return handoffPage(r);
  const mode = S.gate || "signin";
  if (!S.join) joinState();
  const head = { signin: ["Your account"],
    join: ["Create your account", "One account for every app on georgefarrowgreen.com, made here and used everywhere."],
    forgot: ["Forgot your password?", "We’ll email you a link to choose a new one. It works once, for an hour."] }[mode];
  const sw = (lead, label, to) => h("p.foot.new", {}, lead, h("button.link", { type: "button", onclick: () => gate(to) }, label));
  return [h("div.welcome", {},
    // (the mark floats; it rises in inside something else, as one animation can't do both)
    r(h("div", {}, mode === "forgot" ? h("div.mark", {}, icon("key", 48, 1.7)) : logo())),
    r(h("h1", { text: head[0] })),
    head[1] && r(h("p", { text: head[1] })),
    mode === "signin" && r(h("p.lead", {}, "One sign-in for ", h("img", { src: "/apps/inflight.png", alt: "" }), h("b", { text: "InFlight" }),
      " and ", h("img", { src: "/apps/weather.png", alt: "" }), h("b", { text: "Weather" }))),
    r(mode === "join" ? joinCard() : mode === "forgot" ? forgotCard() : signinCard()),
    r(mode === "signin" ? joinLine() : sw(mode === "join" ? "Already have an account? " : "Remembered it? ", "Sign in", "signin"))),
  ];
}
// (how a new account's made: here, where anyone can, or with the invite this page was opened with; else by invitation,
// said plainly rather than a link to a page that says so)
function joinLine() {
  return S.join?.open || S.join?.ok ? h("p.foot.new", { id: "joinline" }, "New here? ", h("button.link", { type: "button", onclick: () => gate("join") }, "Create your account"))
    : h("p.foot.new.invite", { id: "joinline" }, ...(S.join && !S.join.pending ? [h("b", { text: "New here?" }), " Accounts are by invitation: open the link you were sent to make yours."] : []));
}
// Opened from an app, signed in there: carry on as that account here, said yes to
function handoffPage(r) {
  const w = S.handoff, said = h("p.said", { role: "alert" }), app = APPS[fromApp()]?.name;
  const go = h("button.btn", { type: "button", onclick: async () => {
    try {
      const m = await busy(go, "Signing in…", () => post("handoff", { code: HANDOFF.code }));
      S.handoff = null; welcome(m);
      if (HANDOFF.open === "profile") openSheet(profileView);
    } catch (err) { S.handoff = null; S.settled = false; render(); toast(err.message, true, 4000); }
  } }, `Continue as ${String(w.name).trim().split(/\s+/)[0]}`);
  return [h("div.welcome", {},
    r(h("div", {}, logo())),
    r(h("h1", { text: w.name })),
    r(h("p", { text: `@${w.handle}${app ? `, from ${app}` : ""}. Carry on as this account in this browser?` })),
    r(h("div.signin.glass", {}, go, h("button.link.forgot", { type: "button", onclick: () => { S.handoff = null; gate("signin"); } }, "Not you? Sign in"), said)))];
}
// (can an account be made: by anyone, on a test server; else with the invite this page was opened with)
async function joinState() {
  S.join = { pending: true };
  try { S.join = await post("join", { invite: S.invite || undefined }); } catch (_) { S.join = { open: false, ok: !!S.invite }; }
  if (S.me?.signedIn || S.reset) return;
  if (S.gate === "join") { S.settled = true; render(); } else $("#joinline")?.replaceWith(joinLine());
}
function signinCard() {
  const said = h("p.said", { role: "alert" });
  const email = h("input", { type: "email", name: "email", autocomplete: "username webauthn", inputmode: "email", autocapitalize: "none", spellcheck: "false", required: true });
  const pw = h("input", { type: "password", name: "password", autocomplete: "current-password", required: true, onfocus: warmUp });
  const go = h("button.btn" + (passkeysWork() ? ".quiet" : ""), { type: "submit" }, "Sign in");
  const form = h("form.form", { onsubmit: async (e) => {
    e.preventDefault(); say(said, "");
    if (!email.value.trim()) return say(said, "Enter your email.", email);
    if (!pw.value) return say(said, "Enter your password.", pw);
    try {
      let proof;
      const m = await busy(go, "Signing in…", async () => {
        const { salt } = await post("signin/salt", { email: email.value.trim() });
        ({ proof } = await E2E.fromPassword(pw.value, salt));
        return post("signin/password", { email: email.value.trim(), proof });
      });
      welcome(m);
      if (!m.deleting) { checkQuietly(pw.value, proof); maybeNudge(m); }
    } catch (err) { say(said, err.message, err.field === "email" ? email : pw); }
  } }, field("Email", email), field("Password", pw), go);
  const pk = passkeysWork() && h("button.btn", { type: "button", onclick: async (e) => {
    const b = e.currentTarget; say(said, "");
    try { welcome(await busy(b, "Waiting for your passkey…", signInWithPasskey)); }
    catch (err) { say(said, err.message); }
  } }, icon("face", 21, 1.9), "Sign in with a passkey");
  return h("div.signin.glass", {}, pk, pk && h("div.or", { text: "or with your email" }), form,
    h("button.link.forgot", { type: "button", onclick: () => gate("forgot") }, "Forgot password?"), said);
}
// (the password's stretching needs its WebAssembly: fetched as soon as a password field's used, not when it's sent)
function warmUp() { import("./argon2.js").catch(() => {}); }

// A new account: name, handle (suggested from the name, and checked as it's typed), email and password. The slow parts
// (the key pair, the password's stretching) start while it's typed, so creating it is quick; the key's made, and locked
// with the password, here: the server only ever has it locked.
const handleFrom = (name) => { const p = String(name).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/\s+/).filter(Boolean); return (p.length > 1 ? p[0] + "_" + p[p.length - 1][0] : p[0] || "").replace(/[^a-z0-9_]/g, "").slice(0, 20); };
function joinCard() {
  const said = h("p.said", { role: "alert" });
  if (S.join?.pending) return h("div.signin.glass", {}, h("div.empty", {}, h("span.spin")));
  if (!(S.join?.open || S.join?.ok)) return h("div.signin.glass", {}, h("p.hint.center", { text: S.invite ? S.join?.error || "That invite doesn’t work." : "New accounts are by invitation. If someone sent you an invite link, open it to start." }));
  const prep = {};
  const ready = () => { prep.keys ||= E2E.newIdentity(); };
  const name = h("input", { type: "text", name: "name", autocomplete: "name", maxlength: "50", required: true });
  const handle = h("input", { type: "text", name: "handle", autocomplete: "off", autocapitalize: "none", spellcheck: "false", maxlength: "20", required: true });
  const email = h("input", { type: "email", name: "email", autocomplete: "username", inputmode: "email", autocapitalize: "none", spellcheck: "false", required: true });
  const pw = h("input", { type: "password", name: "password", autocomplete: "new-password", required: true, onfocus: warmUp });
  const hstat = h("p.hint", { "aria-live": "polite", text: "Friends see your name, and find you by your handle." }), { meter, hint } = rated(pw);
  const go = h("button.btn", { type: "submit" }, "Create account");
  let touched = false, hT = 0, pT = 0;
  const handleNow = () => handle.value.trim().replace(/^@/, "").toLowerCase();
  const check = async () => {
    const v = handleNow();
    if (v.length < 3) { hstat.className = "hint"; hstat.textContent = "Friends see your name, and find you by your handle."; return; }
    try {
      const r = await call(`handle?h=${encodeURIComponent(v)}`);
      if (handleNow() !== v) return;
      hstat.className = "hint " + (r.free ? "ok" : "bad");
      hstat.replaceChildren(r.free ? `@${v} is yours.` : r.reason, ...(r.try?.length ? [" Try ", ...r.try.flatMap((t, i) => [i ? " or " : "",
        h("button.link", { type: "button", onclick: () => { handle.value = t; touched = true; check(); } }, `@${t}`)]), "."] : []));
    } catch (_) { /* checked again when it's made */ }
  };
  name.addEventListener("input", () => { ready(); if (!touched) { handle.value = handleFrom(name.value); clearTimeout(hT); hT = setTimeout(check, 350); } });
  handle.addEventListener("input", () => { ready(); touched = true; clearTimeout(hT); hT = setTimeout(check, 350); });
  pw.addEventListener("input", () => {
    ready(); clearTimeout(pT);
    if (pw.value.length >= 10) { const v = pw.value; pT = setTimeout(() => { const salt = E2E.newSalt(); prep.pw = { pw: v, salt, p: E2E.fromPassword(v, salt) }; prep.pw.p.catch(() => {}); }, 700); }
  });
  const form = h("form.form", { onsubmit: async (e) => {
    e.preventDefault(); say(said, "");
    const v = { name: name.value.trim(), handle: handleNow(), email: email.value.trim(), password: pw.value };
    if (!v.name) return say(said, "Enter your name.", name);
    if (!HANDLE_OK.test(v.handle)) return say(said, "Handles use 3 to 20 letters, numbers or underscores.", handle);
    if (!EMAIL_OK.test(v.email)) return say(said, "That doesn’t look like an email address.", email);
    if (v.password.length < 10) return say(said, "Use at least 10 characters for your password.", pw);
    try {
      let proof;
      const m = await busy(go, "Creating your account…", async () => {
        const n = await leakedCount(v.password);
        if (n) throw Object.assign(new Error(leakedSay(n)), { field: "password" });
        ready();
        const { privJwk, pub } = await prep.keys;
        const done = prep.pw?.pw === v.password ? prep.pw : null, salt = done ? done.salt : E2E.newSalt();
        const k = await (done ? done.p : E2E.fromPassword(v.password, salt));
        proof = k.proof;
        return post("signup", { name: v.name, handle: v.handle, email: v.email, salt, proof, vault: await E2E.lock(k.lockKey, { ecdh: privJwk }), pub, invite: S.invite || undefined });
      });
      S.invite = null; S.gate = null; try { sessionStorage.removeItem("acct:invite"); } catch (_) {}
      welcome(m, `Welcome, ${String(m.name).trim().split(/\s+/)[0]}. Your account is ready.`);
      checkQuietly(v.password, proof); maybeNudge(m);
    } catch (err) {
      if (err.field === "invite") { S.join = { open: false, ok: false, error: err.message }; S.settled = true; return render(); }
      say(said, err.message, { name, handle, email, password: pw }[err.field] || null);
    }
  } }, field("Name", name), field("Handle", h("div.at", {}, "@", handle)), hstat, field("Email", email), field("Password", pw), meter, hint, go);
  return h("div.signin.glass", {}, S.invite && !S.join.open && h("p.invited", { text: "You’ve been invited." }), form,
    h("p.hint.center", { text: "Your password also locks your InFlight encryption key, here on this device: the key is never sent anywhere unlocked." }), said);
}
// A forgotten password: a link to the email (said the same whether there's an account for it or not)
function forgotCard() {
  const said = h("p.said", { role: "alert" });
  const email = h("input", { type: "email", name: "email", autocomplete: "username", inputmode: "email", autocapitalize: "none", spellcheck: "false", required: true });
  const go = h("button.btn", { type: "submit" }, "Email me a link");
  const box = h("div.signin.glass", {}, h("form.form", { onsubmit: async (e) => {
    e.preventDefault(); say(said, "");
    if (!EMAIL_OK.test(email.value.trim())) return say(said, "Enter the email your account uses.", email);
    try {
      const r = await busy(go, "Sending…", () => post("reset/request", { email: email.value.trim() }));
      box.replaceChildren(h("div.sent", {}, icon("mail", 28, 1.8), h("p", { text: r.message })));
    } catch (err) { say(said, err.message, email); }
  } }, field("Email", email), go),
  h("p.hint.center", { text: "With a passkey, a reset keeps your InFlight messages. Without one, you start with a new key, and older messages can’t be opened." }), said);
  return box;
}
// A reset link's own page: who it's for, and a new password. With a passkey that holds a copy of the key (one made in
// InFlight, where it can), the key's kept: unlocked with it here, and locked anew with the new password. Otherwise a
// new key pair, and older messages stay sealed.
async function resetCheck() {
  try { S.reset.info = await post("reset/check", { token: S.reset.token }); } catch (e) { S.reset.error = e.message; }
  S.settled = false; render();
}
function resetPage(r) {
  const R = S.reset, info = R.info;
  if (!info && !R.error) return [h("div.welcome", {}, r(h("div.empty", {}, h("span.spin"))))];
  if (R.error) return [h("div.welcome", {},
    r(h("div", {}, h("div.mark.red", {}, icon("key", 44, 1.8)))), r(h("h1", { text: "This link won’t work" })), r(h("p", { text: R.error })),
    r(h("div.signin.glass", {}, h("button.btn", { type: "button", onclick: () => { S.reset = null; gate("forgot"); } }, "Get a new link"),
      h("button.btn.quiet", { type: "button", onclick: () => { S.reset = null; gate("signin"); } }, "Sign in"))))];
  const said = h("p.said", { role: "alert" });
  const pw = h("input", { type: "password", name: "password", autocomplete: "new-password", required: true, onfocus: warmUp }), { meter, hint } = rated(pw);
  const canKeep = info.passkeys.length > 0 && passkeysWork(), other = S.me?.signedIn && S.me.handle !== info.handle;
  const act = (mode) => async (e) => {
    const b = e.currentTarget; say(said, "");
    if (pw.value.length < 10) return say(said, "Use at least 10 characters.", pw);
    try {
      let proof;
      const m = await busy(b, mode === "keep" ? "Waiting for your passkey…" : "Making your new key…", async () => {
        const n = await leakedCount(pw.value);
        if (n) throw new Error(leakedSay(n));
        let ecdh, pub;
        if (mode === "keep") {
          let a;
          try { a = await navigator.credentials.get({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), rpId: info.rpId, userVerification: "required", timeout: 120000,
            allowCredentials: info.passkeys.map((p) => ({ type: "public-key", id: fromB64url(p.id) })), extensions: { prf: { eval: { first: await E2E.prfSalt() } } } } }); }
          catch (_) { throw new Error("No passkey was used. You can start fresh instead."); }
          const res = a?.getClientExtensionResults?.().prf?.results?.first, pk = a && info.passkeys.find((p) => p.id === a.id);
          if (!res || !pk) throw new Error("That passkey couldn’t unlock your key here. You can start fresh instead.");
          try { ({ ecdh } = await E2E.unlock(await E2E.fromSecret(new Uint8Array(res)), pk.vault)); }
          catch (_) { throw new Error("That passkey couldn’t unlock your key. You can start fresh instead."); }
        } else ({ privJwk: ecdh, pub } = await E2E.newIdentity());
        const salt = E2E.newSalt(), k = await E2E.fromPassword(pw.value, salt);
        proof = k.proof;
        const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(R.token)))].map((x) => x.toString(16).padStart(2, "0")).join("");
        const keyProof = pub ? undefined : await E2E.keyProof(await E2E.importPriv(ecdh), info.kx, "reset|" + hash);
        return post("reset/complete", { token: R.token, salt, proof, vault: await E2E.lock(k.lockKey, { ecdh }), ...(pub ? { pub } : { keyProof }) });
      });
      S.reset = null; S.gate = null;
      welcome(m, m.kept ? "Password changed. Your messages are safe." : "Password changed. You’re starting fresh with a new key.");
      checkQuietly(pw.value, proof);
    } catch (err) { say(said, err.message, pw); }
  };
  return [h("div.welcome", {},
    r(h("div", {}, h("div.mark", {}, icon("key", 48, 1.7)))),
    r(h("h1", { text: "Choose a new password" })),
    r(h("p", { text: `For ${info.name} (@${info.handle}, ${info.email}).` })),
    r(h("div.signin.glass", {},
      other && h("p.hint.bad", { text: `You’re signed in here as @${S.me.handle}. This link is for a different account: only carry on if it’s yours.` }),
      h("form.form", { onsubmit: (e) => { e.preventDefault(); e.currentTarget.parentNode.querySelector(".btn")?.click(); } },
        h("input.vh", { type: "email", autocomplete: "username", value: info.email, tabindex: "-1", "aria-hidden": "true", readonly: true }),
        field("New password", pw), meter, hint),
      h("p.hint", { text: `${canKeep ? "Use your passkey to keep your InFlight messages readable. Starting fresh" : "This"} makes a new key: your friends stay, but older messages can’t be opened, and friends see that your key changed. Every device is signed out.` }),
      canKeep && h("button.btn", { type: "button", onclick: act("keep") }, icon("passkey", 20, 2), "Keep messages with passkey"),
      h("button.btn" + (canKeep ? ".quiet" : ""), { type: "button", onclick: act("fresh") }, canKeep ? "Start fresh instead" : "Set new password"),
      S.me?.signedIn && h("button.link", { type: "button", onclick: () => { S.reset = null; S.settled = false; render(); } }, "Cancel"),
      said))),
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
function welcome(m, word) {
  S.me = m; S.settled = false; S.pulled = Date.now();
  if (m.prefs) theme(m.prefs.appearance);
  render(); scrollTo(0, 0);
  toast(word || `Welcome back, ${String(m.name).trim().split(/\s+/)[0]}.`, false, word ? 4000 : 2800);
}
// Signed in with a password, no passkey yet, on a device that can make one (Face ID, Touch ID, Windows Hello…): a word
// about one, once a month at most
async function maybeNudge(m) {
  if (!passkeysWork() || m.passkeys?.length) return;
  try { if (Date.now() - Number(localStorage.getItem("acct:nudged") || 0) < 30 * 86400e3) return; } catch (_) {}
  let can = false;
  try { can = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch (_) {}
  if (!can) return;
  setTimeout(() => {
    if (sheetEl.open || !S.me?.signedIn || S.me.passkeys.length) return;
    try { localStorage.setItem("acct:nudged", String(Date.now())); } catch (_) {}
    openSheet(nudgeView);
  }, 1500);
}
function nudgeView() {
  const add = h("button.btn", { type: "button", onclick: async () => {
    try { await freshly(() => busy(add, "Waiting for your device…", addPasskey)); closeSheet(); patch(); toast("Passkey added."); }
    catch (e) { if (!e.quiet) say(sheetEl.querySelector(".said"), e.message); }
  } }, icon("face", 21, 1.9), "Add a passkey");
  return { title: "Add a passkey", quiet: true, right: h("button.x", { type: "button", "aria-label": "Not now", onclick: closeSheet }, icon("x", 17, 2.6)), body: [
    h("div.nudge", {}, h("div.nudge-art", { "aria-hidden": "true" }, icon("face", 56, 1.5)),
      h("h3", { text: "Sign in faster next time" }),
      h("p", { text: "A passkey signs you in with Face ID, Touch ID or your device’s passcode, in every app on the site. Nothing to type, and nothing for anyone to steal." })),
    add, h("button.btn.quiet", { type: "button", onclick: closeSheet }, "Not now"), h("p.said", { role: "alert" })] };
}
// The password just typed, checked against data breaches (only 5 characters of its hash asked), and how it went kept
// with the account (with its proof), for the check-up
async function checkQuietly(pw, proof) {
  try { const n = await leakedCount(pw); S.me = await post("password/checked", { proof, leaked: n > 0 }); patch(); } catch (_) {}
}
async function signOut(btn) {
  try { await busy(btn, "Signing out…", () => post("signout")); }
  catch (e) { if (!e.offline) return toast(e.message, true); }
  if (sheetEl.open) closeSheet();
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
function toast(text, bad, ms = 2800) {
  const top = !!toastEl.showPopover;
  toastEl.replaceChildren(bad ? icon("x", 18, 2.4) : icon("check", 18, 2.4), h("span", { text }));
  toastEl.classList.toggle("bad", !!bad);
  // (above an open sheet too: the top layer)
  if (top && !toastEl.matches(":popover-open")) { toastEl.showPopover(); void toastEl.offsetWidth; }
  toastEl.classList.add("on");
  clearTimeout(toastT);
  toastT = setTimeout(() => { toastEl.classList.remove("on"); toastT = setTimeout(() => top && toastEl.matches(":popover-open") && toastEl.hidePopover(), 600); }, ms);
}
if (toastEl.showPopover) toastEl.popover = "manual";
// a button that asks once more before it acts ("Remove" → "Remove?"), going back after a moment
function twice(label, sure, act, spec = "button.mini") {
  let t = 0;
  const b = h(spec, { type: "button", onclick: () => {
    if (!b.classList.contains("sure")) { b.classList.add("sure"); b.textContent = sure; clearTimeout(t); t = setTimeout(() => { b.classList.remove("sure"); b.textContent = label; }, 3500); return; }
    clearTimeout(t); act(b);
  } }, label);
  return b;
}
// A row that slides left to show what it does (sign out, remove), as a list does on a phone; the button's there
// for a keyboard too
function swipeable(row, label, act) {
  const btn = h("button.swipe-act", { type: "button", tabindex: "-1", onclick: (e) => act(e.currentTarget) }, label);
  const box = h("div.swipe", {}, btn, row), W = 92;
  let down = false, x0 = 0, y0 = 0, dx = 0, open = false, way = null;
  const slide = (x, held) => { box.classList.toggle("dragging", held); box.style.setProperty("--dx", `${x}px`); };
  const shut = () => { open = false; slide(0, false); box.classList.remove("open"); };
  row.addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") return; down = true; x0 = e.clientX; y0 = e.clientY; way = null; });
  row.addEventListener("pointermove", (e) => {
    if (!down) return;
    const mx = e.clientX - x0, my = e.clientY - y0;
    // (sideways or not, decided by the first few pixels: up and down scrolls the sheet as ever)
    if (!way && Math.abs(mx) + Math.abs(my) > 8) way = Math.abs(mx) > Math.abs(my) ? "x" : "y";
    if (way !== "x") return;
    dx = Math.max(-W * 1.6, Math.min(0, (open ? -W : 0) + mx)); slide(dx, true);
  });
  const up = () => { if (down && way === "x") { open = dx < -W / 2; slide(open ? -W : 0, false); box.classList.toggle("open", open); } down = false; way = null; };
  row.addEventListener("pointerup", up); row.addEventListener("pointercancel", up);
  // (a tap on a row that's open closes it, rather than doing what the row does)
  row.addEventListener("click", (e) => { if (open) { e.preventDefault(); e.stopImmediatePropagation(); shut(); } }, true);
  return box;
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
  // (the sheet itself takes the focus, not a field in it, so a phone's keyboard doesn't jump up before you ask for it,
  // nor a button, with a ring round it)
  if (!sheetEl.open) { sheetEl.showModal(); sheetEl.focus({ preventScroll: true }); document.body.classList.add("sheet-up"); }
}
sheetEl.tabIndex = -1;
function pushSheet(view) { Sheet.stack.push(view); draw(true); }
function popSheet() { Sheet.stack.pop(); if (Sheet.stack.length) draw(true); else closeSheet(); }
const redraw = () => sheetEl.open && Sheet.stack.length && draw(false);
function draw(swap) {
  const v = Sheet.stack.at(-1)(), deep = Sheet.stack.length > 1;
  const left = v.left || (deep ? h("button.link.back", { type: "button", onclick: () => (v.onBack || popSheet)() }, h("span.vh", { text: "Back" }), icon("back", 22, 2.4)) : null);
  const right = v.right || h("button.x", { type: "button", "aria-label": "Close", onclick: closeSheet }, icon("x", 17, 2.6));
  const body = h("div.sheet-body", {}, ...v.body);
  if (swap && !still.matches) body.classList.add("swap");
  sheetEl.replaceChildren(h("div.grab", { "aria-hidden": "true" }), h("div.sheet-head", {}, h("div.l", {}, left), h(v.quiet ? "h2.vh" : "h2", { id: "sheet-title", text: v.title }), h("div.r", {}, right)), body);
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
      try {
        let proof;
        await busy(go, "Checking…", async () => { ({ proof } = await E2E.fromPassword(pw.value, m.salt)); return post("reauth", { proof }); });
        ok(); checkQuietly(pw.value, proof);
      }
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
    if (!Object.keys(changes).length) return justEditing() ? backToApp() : closeSheet();
    try {
      S.me = await busy(done, "Saving…", () => call("me/profile", { method: "PATCH", body: changes }));
      closeSheet(); render(); toast(changes.handle ? `You’re @${S.me.handle} now.` : "Profile saved.");
      if (justEditing()) setTimeout(backToApp, 1100);         // (back to InFlight, where it shows already)
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
    left: h("button.link", { type: "button", onclick: () => (justEditing() ? backToApp() : closeSheet()) }, "Cancel"), right: done,
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
// A new password, as it's typed: how strong, and whether it's turned up in a data breach (asked a moment after typing
// stops). { meter, hint } go under its field.
function rated(nw) {
  const bar = h("i"), meter = h("div.meter", { "aria-hidden": "true" }, bar), hint = h("p.hint", { "aria-live": "polite" });
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
  return { meter, hint };
}
// (then: what to open once it's changed, as "Not you?" goes on to the passkeys)
function passwordView({ then } = {}) {
  const m = S.me, said = h("p.said", { role: "alert" });
  const pw = (ac) => h("input", { type: "password", autocomplete: ac });
  const cur = pw("current-password"), nw = pw("new-password"), again = pw("new-password");
  const { meter, hint } = rated(nw);
  const go = h("button.btn", { type: "submit" }, "Change password");
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
        if (then) setTimeout(() => openSheet(then), 500);
      } catch (err) { say(said, err.message, err.field === "current" ? cur : nw); }
    } }, h("input.vh", { type: "email", autocomplete: "username", value: m.email || "", tabindex: "-1", "aria-hidden": "true", readonly: true }),
      field("Current password", cur), field("New password", nw), meter, hint, field("New password again", again), go),
    said] };
}

// ---- passkeys: each with its name (yours to change) and where it's saved ----
function passkeysView() {
  const m = S.me, said = h("p.said", { role: "alert" }), can = !!(window.PublicKeyCredential && navigator.credentials?.create);
  const list = m.passkeys.length
    ? h("div.group", {}, m.passkeys.map((p) => swipeable(h("button.row", { type: "button", onclick: () => pushSheet(() => passkeyView(p.id)) },
      h("span.ic.indigo", {}, icon("passkey", 19)),
      h("span.tx", {}, h("b", { text: p.label }), h("small", { text: [p.provider, `added ${day(p.createdAt)}`].filter(Boolean).join(" · ") })),
      h("span.chev", {}, icon("chev", 16, 2.4))), "Remove", async (b) => {
        try { S.me = await freshly(() => busy(b, "", () => post("passkeys/remove", { id: p.id }))); await leave(b.parentNode); redraw(); patch(); toast("Passkey removed."); }
        catch (e) { if (!e.quiet) say(sheetEl.querySelector(".said"), e.message); }
      })))
    : h("div.group", {}, h("div.empty", { text: "No passkeys yet." }));
  return { title: "Passkeys", body: [
    h("p", { text: "A passkey signs you in with Face ID, Touch ID or your device’s passcode, in every app on the site. Nothing to remember, and nothing for anyone to steal." }),
    list,
    can && h("button.btn", { type: "button", onclick: async (e) => {
      const b = e.currentTarget; say(said, "");
      try { await freshly(() => busy(b, "Waiting for your device…", addPasskey)); redraw(); patch(); toast("Passkey added."); }
      catch (err) { if (!err.quiet) say(sheetEl.querySelector(".said"), err.message); }
    } }, icon("plus", 19, 2.4), "Add a passkey"),
    said] };
}
// One passkey: its name, where it's saved, when it was added and last used, and taking it away
function passkeyView(id) {
  const p = S.me.passkeys.find((x) => x.id === id), said = h("p.said", { role: "alert" });
  if (!p) return { title: "Passkey", body: [h("div.empty", { text: "This passkey has been taken away." })] };
  const name = h("input", { type: "text", value: p.label, maxlength: "40", autocomplete: "off", enterkeyhint: "done", "aria-label": "Name" });
  const save = h("button.link.done", { type: "button", onclick: async () => {
    if (name.value.trim() === p.label) return popSheet();
    try { S.me = await busy(save, "Saving…", () => post("passkeys/rename", { id, label: name.value })); patch(); popSheet(); toast("Renamed."); }
    catch (e) { say(said, e.message, name); }
  } }, "Save");
  name.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); save.click(); } });
  const info = (k, v) => h("div.row.plain.info", {}, h("span.tx", {}, h("b", { text: k })), h("span.val", { text: v }));
  return { title: p.label, right: save, body: [
    h("div.form", {}, field("Name", name)),
    h("div.group", {}, info("Saved in", p.provider || "Not known"), info("Added", day(p.createdAt)), info("Last used", p.usedAt ? ago(p.usedAt) : "Not yet")),
    h("div.group", {}, twice("Remove passkey", "Remove it? Tap again", async (b) => {
      try { S.me = await freshly(() => busy(b, "Removing…", () => post("passkeys/remove", { id }))); patch(); popSheet(); toast("Passkey removed."); }
      catch (e) { if (!e.quiet) say(sheetEl.querySelector(".said"), e.message); }
    }, "button.row.action.danger")),
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
  // (the authenticator data says where it's saved: iCloud Keychain, Google Password Manager…)
  S.me = await post("passkeys", { challenge: o.challenge, id: cred.id, publicKey: b64url(spki), alg, clientDataJSON: b64url(r.clientDataJSON),
    authenticatorData: r.getAuthenticatorData ? b64url(r.getAuthenticatorData()) : undefined });
}

// ---- signed-in devices: each with where and when; those unused for 3 months marked, to sign out in one go ----
function devicesView() {
  const m = S.me, others = m.devices.filter((d) => !d.current), stale = others.filter((d) => d.stale);
  const end = async (b, body, rows) => {
    try {
      const next = await freshly(() => busy(b, "", () => post("devices/end", body)));
      await Promise.all(rows.map(leave));
      S.me = next; redraw(); patch();
      toast(body.id ? "Signed out." : body.stale ? `${stale.length} unused device${stale.length > 1 ? "s were" : " was"} signed out.` : "Your other devices were signed out.");
    } catch (e) { if (!e.quiet) say(sheetEl.querySelector(".said"), e.message); }
  };
  const rows = m.devices.map((d) => {
    const el = h(d.current ? "div.row.current" : "div.row", {},
      h("span.ic.grey", {}, icon(/iphone|android|phone|ipad|mobile/i.test(d.label) ? "phone" : "computer", 19)),
      h("span.tx", {}, h("b", {}, d.label, d.current && h("span.tag", { text: "This browser" })),
        h(d.stale ? "small.warn" : "small", { text: [d.place, d.current ? "Active now" : d.stale ? `Not used for ${monthsSince(d.seenAt)}` : `Active ${ago(d.seenAt)}`].filter(Boolean).join(" · ") })),
      !d.current && twice("Sign out", "Sign out?", (b) => end(b, { id: d.id }, [el])));
    el.dataset.stale = d.stale ? "1" : "";
    return d.current ? el : swipeable(el, "Sign out", (b) => end(b, { id: d.id }, [b.parentNode]));
  });
  return { title: "Signed-in devices", body: [
    h("p", { text: "Everywhere your account’s signed in. Signing a device out signs it out of every app on the site." }),
    h("div.group", {}, rows),
    (stale.length > 0 || others.length > 1) && h("div.group", {},
      stale.length > 0 && h("button.row.action", { type: "button", onclick: (e) => end(e.currentTarget, { stale: true }, rows.filter((r) => r.dataset.stale)) },
        `Sign out ${stale.length} unused device${stale.length > 1 ? "s" : ""}`),
      others.length > 1 && h("button.row.action.danger", { type: "button", onclick: (e) => end(e.currentTarget, { others: true }, rows.filter((r) => !r.classList.contains("current"))) }, "Sign out of all other devices")),
    h("p.said", { role: "alert" })] };
}
const monthsSince = (t) => { const n = Math.max(3, Math.floor((Date.now() - t) / (30.44 * 86400e3))); return n >= 24 ? `${Math.floor(n / 12)} years` : `${n} months`; };

// ---- recent activity: the last 30 days, newest first, by day ----
const DID = {
  signin: (e) => (e.detail === "Passkey" ? "Signed in with a passkey" : e.detail === "Password" ? "Signed in with your password" : "Signed in"),
  signup: () => "Account made", password: () => "Password changed", reset: () => "Password reset by email",
  "passkey-add": (e) => `Passkey added${e.detail ? `: ${e.detail}` : ""}`, "passkey-remove": (e) => `Passkey removed${e.detail ? `: ${e.detail}` : ""}`,
  "signout-device": (e) => `Signed out ${e.detail || "a device"}`, "signout-others": () => "Signed out of all other devices",
  "signout-stale": (e) => `Signed out ${e.detail || "some"} unused device${e.detail === "1" ? "" : "s"}`,
  "email-confirmed": () => "Email confirmed", "email-change-asked": (e) => `New email asked for${e.detail ? `: ${e.detail}` : ""}`,
  "email-changed": (e) => `Email changed${e.detail ? ` to ${e.detail}` : ""}`, export: () => "Your data downloaded",
  "delete-asked": () => "Deletion asked for", "delete-cancelled": () => "Deletion called off",
};
const KIND_LOOK = { signin: ["signin", "green"], signup: ["person", "green"], password: ["key", "blue"], reset: ["key", "amber"], "passkey-add": ["passkey", "indigo"],
  "passkey-remove": ["passkey", "grey"], "signout-device": ["signout", "grey"], "signout-others": ["signout", "grey"], "signout-stale": ["signout", "grey"],
  "email-confirmed": ["mail", "blue"], "email-change-asked": ["mail", "amber"], "email-changed": ["mail", "blue"], export: ["download", "green"],
  "delete-asked": ["trash", "red"], "delete-cancelled": ["undo", "green"] };
const SIGNINS = new Set(["signin", "signup", "signout-device", "signout-others", "signout-stale"]);
const APP_MARK = { InFlight: "/apps/inflight.png", Weather: "/apps/weather.png", Account: "/icon.svg?v=2" };
function activityView() {
  let events = null, show = "all";
  const box = h("div.activity", { "aria-busy": "true" }, h("div.empty", {}, h("span.spin")));
  const draw = () => {
    const list = events.filter((e) => show === "all" || (show === "signins") === SIGNINS.has(e.kind));
    if (!list.length) return box.replaceChildren(h("div.group", {}, h("div.empty", { text: show === "all" ? "Nothing in the last 30 days." : "None of these in the last 30 days." })));
    const byDay = new Map();
    for (const e of list) { const k = dayWord(e.at); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(e); }
    box.replaceChildren(...[...byDay].map(([k, day]) => {
      // (where most of the day's happened, said once by the day; a row's own place only where it's somewhere else)
      const n = new Map(); for (const e of day) if (e.place) n.set(e.place, (n.get(e.place) || 0) + 1);
      const place = [...n].sort((x, y) => y[1] - x[1])[0]?.[0] || null;
      return h("div.day", {}, h("h4", {}, k, place && h("small", { text: ` · ${place}` })),
        h("div.group", {}, day.map((e) => { const [ic, tint] = KIND_LOOK[e.kind] || ["clock", "grey"];
          return h("div.row", {}, h(`span.ic.${tint}`, {}, icon(ic, 18), e.app && APP_MARK[e.app] && h("img.app-mark", { src: APP_MARK[e.app], alt: e.app })),
            h("span.tx", {}, h("b", { text: (DID[e.kind] || (() => e.kind))(e) }), h("small", { text: [e.device, e.place !== place && e.place].filter(Boolean).join(" · ") || e.app || "" })),
            h("span.end", {}, h("span.t", { text: new Date(e.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) }),
              elsewhere(e) && h("button.mini", { type: "button", onclick: () => pushSheet(() => notMeView(e)) }, "Not you?"))); })));
    }));
  };
  call("activity").then((r) => { if (!box.isConnected) return; events = r.events; box.removeAttribute("aria-busy"); draw(); })
    .catch((e) => { if (box.isConnected) box.replaceChildren(h("div.group", {}, h("div.empty", { text: e.message }))); });
  return { title: "Recent activity", body: [
    h("p", { text: "What’s happened to your account in the last 30 days, in every app on the site. Something you don’t recognise? Change your password." }),
    seg("Show", [["all", "All"], ["signins", "Sign-ins"], ["changes", "Changes"]], "all", (v) => { show = v; if (events) draw(); }),
    box] };
}
// (a sign-in with a password from a device or place other than this browser's: a passkey one needs your own device)
function elsewhere(e) {
  const here = S.me.devices.find((d) => d.current);
  return e.kind === "signin" && e.detail !== "Passkey" && here && (e.device !== here.label || (e.place && e.place !== here.place));
}
// A sign-in you don't recognise: everywhere else signed out, then a new password, in two steps
function notMeView(e) {
  const said = h("p.said", { role: "alert" });
  const go = h("button.btn.danger", { type: "button", onclick: async () => {
    try {
      S.me = await freshly(() => busy(go, "Signing out…", () => post("devices/end", { others: true })));
      patch(); toast("Every other device was signed out."); pushSheet(() => passwordView({ then: passkeysView }));
    } catch (err) { if (!err.quiet) say(said, err.message); }
  } }, "Secure my account");
  const step = (n, t, sub) => h("li", {}, h("span.n", { text: String(n) }), h("span.tx", {}, h("b", { text: t }), h("small", { text: sub })));
  return { title: "Not you?", body: [
    h("div.group", {}, h("div.row.plain", {}, h("span.ic.amber", {}, icon("signin", 18)),
      h("span.tx", {}, h("b", { text: (DID[e.kind] || (() => e.kind))(e) }),
        h("small", { text: [`${dayWord(e.at)}, ${new Date(e.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`, e.app, e.device, e.place].filter(Boolean).join(" · ") })))),
    h("p", { text: "If this wasn’t you, someone may know your password. Three steps put it right:" }),
    h("ol.steps", {},
      step(1, "Sign out everywhere else", "Every device but this one, in every app on the site."),
      step(2, "Choose a new password", "So whoever it was can’t sign back in."),
      step(3, "Look over your passkeys", "Remove any you don’t know: one someone else added would still sign in.")),
    go, said] };
}
const dayWord = (t) => {
  const d = new Date(t), today = new Date(), y = new Date(Date.now() - 86400e3);
  return d.toDateString() === today.toDateString() ? "Today" : d.toDateString() === y.toDateString() ? "Yesterday" : d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
};

// ---- your email: confirmed or not, and a new one (a link to it; it changes only when that's opened) ----
function emailView() {
  const m = S.me, said = h("p.said", { role: "alert" });
  const input = h("input", { type: "email", autocomplete: "email", inputmode: "email", autocapitalize: "none", spellcheck: "false", placeholder: "you@example.com" });
  const go = h("button.btn", { type: "submit" }, "Send a link to it");
  const status = h("div.group", {},
    h("div.row.plain.info", {}, h("span.tx", {}, h("b", { text: m.email })),
      m.emailOk ? h("span.badge", {}, "Confirmed") : h("button.mini.go", { type: "button", onclick: async (e) => {
        try { await busy(e.currentTarget, "", () => post("email/confirm-send")); toast(`A link is on its way to ${m.email}.`); } catch (err) { say(said, err.message); }
      } }, "Send link")));
  return { title: "Email", body: [
    h("p", { text: "Your email signs you in, and gets password resets and security notes, for every app on the site." }),
    status,
    !m.emailOk && h("p.hint", { text: "Not confirmed yet: open the link we send to it." }),
    m.emailNew && h("div.pending.glass", {}, h("span.ic.blue", {}, icon("mail", 18)),
      h("span.tx", {}, h("b", { text: `Waiting for ${m.emailNew}` }), h("small", { text: "Open the link we sent there (it lasts 2 days). Until then, nothing changes." })),
      h("button.mini", { type: "button", onclick: async (e) => {
        try { S.me = await busy(e.currentTarget, "", () => post("email/cancel")); redraw(); patch(); toast("Cancelled. Your email stays as it is."); } catch (err) { say(said, err.message); }
      } }, "Cancel")),
    h("form.form", { onsubmit: async (e) => {
      e.preventDefault(); say(said, "");
      const email = input.value.trim();
      if (!email) return say(said, "Enter the new email.", input);
      try { S.me = await freshly(() => busy(go, "Sending…", () => post("email/change", { email }))); redraw(); patch(); toast(`A link is on its way to ${email}.`); }
      catch (err) { if (!err.quiet) say(sheetEl.querySelector(".said"), err.message, sheetEl.querySelector("input[type=email]")); }
    } }, field(m.emailNew ? "Or another new email" : "New email", input), go),
    said] };
}

// ---- checking the password against data breaches (it's typed here; only 5 characters of its hash are asked) ----
function checkView() {
  const m = S.me, said = h("p.said", { role: "alert" });
  const pw = h("input", { type: "password", autocomplete: "current-password" });
  const go = h("button.btn", { type: "submit" }, "Check");
  return { title: "Check your password", body: [
    h("p", { text: "See if your password has turned up in a known data breach. It’s checked here, on this device: only the first 5 characters of a scrambled copy of it are sent to Have I Been Pwned, so neither they nor the site learn it." }),
    h("form.form", { onsubmit: async (e) => {
      e.preventDefault(); say(said, "");
      if (!pw.value) return say(said, "Enter your password.", pw);
      try {
        const n = await busy(go, "Checking…", async () => {
          const { proof } = await E2E.fromPassword(pw.value, m.salt), n = await leakedCount(pw.value);
          S.me = await post("password/checked", { proof, leaked: n > 0 });
          return n;
        });
        patch();
        if (n) { say(said, leakedSay(n).replace("Choose another.", "Change it now.")); sheetEl.querySelector(".sheet-body").append(h("button.btn.danger", { type: "button", onclick: () => pushSheet(passwordView) }, "Change password")); }
        else { if (Sheet.stack.length > 1) popSheet(); else closeSheet(); toast("Your password isn’t in any known data breach."); }
      } catch (err) { say(said, err.message, pw); }
    } }, h("input.vh", { type: "email", autocomplete: "username", value: m.email || "", tabindex: "-1", "aria-hidden": "true", readonly: true }), field("Your password", pw), go),
    said] };
}

// ---- preferences, for every app on the site that has them ----
const APPEAR = [["auto", "Automatic"], ["light", "Light"], ["dark", "Dark"]];
async function setPrefs(changes) {
  try { S.me = await call("prefs", { method: "PUT", body: changes }); patch(); }
  catch (e) { toast(e.message, true); }
}
function appearanceView() {
  const m = S.me;
  const opts = APPEAR.map(([k, label]) => h(`button.appear${m.prefs.appearance === k ? ".on" : ""}`, { type: "button", "aria-pressed": String(m.prefs.appearance === k), onclick: () => {
    m.prefs.appearance = k; theme(k);
    for (const b of sheetEl.querySelectorAll(".appear")) { const on = b === opts[APPEAR.findIndex(([x]) => x === k)]; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); }
    setPrefs({ appearance: k });
  } }, h(`span.shot.${k}`, { "aria-hidden": "true" }, h("i"), h("i"), h("i")), h("span", { text: label }), h("span.tick", { "aria-hidden": "true" }, icon("check", 13, 3))));
  return { title: "Appearance", body: [
    h("div.appears", {}, opts),
    h("p.hint", { text: "Here and in InFlight, on every device you’re signed in on. Automatic follows your device’s light or dark setting. (Weather’s look follows the sky.)" })] };
}
// the units where the account has none chosen yet, whatever the device's language (as Weather starts with them)
const unitsHere = () => ({ temp: "c", wind: "mph", precip: "mm", pressure: "hpa", clock: "24" });
const UNIT_OPTS = [
  ["temp", "Temperature", [["c", "°C"], ["f", "°F"]]],
  ["wind", "Wind", [["mph", "mph"], ["kmh", "km/h"], ["ms", "m/s"], ["kn", "knots"]]],
  ["precip", "Rain", [["mm", "mm"], ["in", "in"]]],
  ["pressure", "Pressure", [["hpa", "hPa"], ["inhg", "inHg"], ["mmhg", "mmHg"]]],
  ["clock", "Time", [["24", "24-hour"], ["12", "12-hour"]]],
];
// a segmented control, its thumb sliding to what's chosen
function seg(name, opts, value, onpick) {
  const thumb = h("span.thumb", { "aria-hidden": "true" }), el = h("div.seg", { role: "radiogroup", "aria-label": name }, thumb);
  const place = (k) => { el.style.setProperty("--n", opts.length); el.style.setProperty("--k", Math.max(0, opts.findIndex(([v]) => v === k))); };
  for (const [v, label] of opts) el.append(h("button", { type: "button", role: "radio", "aria-checked": String(v === value), onclick: () => {
    for (const b of el.querySelectorAll("button")) b.setAttribute("aria-checked", String(b.textContent === label));
    place(v); onpick(v);
  } }, label));
  place(value);
  return el;
}
function unitsView() {
  const m = S.me, u = { ...unitsHere(), ...(m.prefs.units || {}) };
  return { title: "Units", body: [
    h("p", { text: "For Weather, on every device it’s signed in on: forecasts, the map and notifications." }),
    h("div.units", {}, UNIT_OPTS.map(([k, label, opts]) => h("div.unit", {}, h("span", { text: label }), seg(label, opts, u[k], (v) => { u[k] = v; setPrefs({ units: { [k]: v } }); })))),
  ] };
}

// ---- emails: what each app sends you (each from its own address). The account's, about signing in and its security,
// always; InFlight's, on or off here as in its own Notifications (which ones, those say); Weather's are on the phone ----
function emailsView() {
  const m = S.me, said = h("p.said", { role: "alert" });
  const sw = h("input.switch", { type: "checkbox", role: "switch", checked: !!m.emails?.inflight, disabled: !m.emailOk, onchange: async () => {
    sw.disabled = true; say(said, "");
    try { S.me = await call("prefs", { method: "PUT", body: { emails: { inflight: sw.checked } } }); patch(); }
    catch (e) { sw.checked = !sw.checked; say(said, e.message); }
    finally { sw.disabled = !S.me.emailOk; }
  } });
  const head = (img, name) => h("h4.app-k", {}, h("img", { src: img, alt: "" }), name);
  return { title: "Emails", body: [
    h("p", { text: "What each app emails you, from its own address." }),
    head("/icon.svg?v=2", "Account"),
    h("div.group", {}, h("div.row.plain.info", {}, h("span.tx", {}, h("b", { text: "Sign-ins and security" }), h("small", { text: "So you’d know if it wasn’t you" })),
      h("span.val", { text: "Always on" }))),
    head("/apps/inflight.png", "InFlight"),
    h("div.group", {}, h("label.row.plain.info", {}, h("span.tx", {}, h("b", { text: "Notifications by email" }),
      h("small", { text: m.emailOk ? "Pigeons landing, friend requests and your week in flight, as its Notifications have them" : "Confirm your email first" })), sw)),
    h("p.hint", { text: "Weather tells you on your phone instead: its alerts are in its own Settings." }),
    said] };
}

// ---- your data, as a file ----
function exportView() {
  const said = h("p.said", { role: "alert" });
  // (as a PDF to read and keep, written here from what the export gives: datapdf.js; or as it is, for another app)
  const get = (kind) => async (e) => {
    const b = e.currentTarget; say(said, "");
    try {
      const file = await freshly(() => busy(b, kind === "pdf" ? "Making your PDF…" : "Gathering it…", async () => {
        const data = await post("export");
        if (kind === "json") return new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const { dataPdf } = await import("./datapdf.js");
        return dataPdf(data, { did: (x) => (DID[x.kind] || (() => x.kind))(x), units: (u) => unitsSaid({ ...unitsHere(), ...u }) });
      }));
      const a = h("a", { href: URL.createObjectURL(file), download: `georgefarrowgreen-account-${S.me.handle}.${kind}` });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 30000);
      toast("Your data is downloading.");
    } catch (err) { if (!err.quiet) say(sheetEl.querySelector(".said"), err.message); }
  };
  return { title: "Your data", body: [
    h("p", { text: "Everything kept with your account that can be read, as a PDF to read and keep:" }),
    h("ul.gone", {},
      h("li", { text: "Your profile and photo, sign-in (passkeys, devices) and recent activity" }),
      h("li", { text: "InFlight: friends, groups, passport, birds, settings, and how many pigeons you’ve sent and had" }),
      h("li", { text: "Weather: your saved places, settings and notifications" })),
    h("p.hint", { text: "Your InFlight letters aren’t included: they’re end-to-end encrypted, with keys only your phones have. The server can’t read them." }),
    h("button.btn", { type: "button", onclick: get("pdf") }, icon("download", 20, 2.2), "Download as PDF"),
    h("button.btn.quiet", { type: "button", onclick: get("json") }, "Download as JSON"),
    h("p.hint.center", { text: "JSON is the same data, in a form other apps can read." }),
    said] };
}

// ---- deleting the account: in 7 days, unless you keep it ----
function deleteView() {
  const m = S.me, said = h("p.said", { role: "alert" });
  const sure = h("input", { type: "text", autocomplete: "off", autocapitalize: "none", spellcheck: "false", placeholder: m.handle, "aria-label": `Type ${m.handle} to confirm` });
  const go = h("button.btn.danger", { type: "submit", disabled: true }, "Delete account");
  sure.addEventListener("input", () => { go.disabled = sure.value.trim().replace(/^@/, "").toLowerCase() !== m.handle; });
  return { title: "Delete account", body: [
    h("p", { text: "This deletes your account and everything kept with it, in every app on the site:" }),
    h("ul.gone", {}, h("li", { text: "InFlight: your letters, friends and keys" }), h("li", { text: "Weather: your saved places and notifications" }),
      h("li", { text: "Your profile, password and passkeys" })),
    h("p", { text: "It’s signed out everywhere now and deleted in 7 days. Until then you can keep it: sign in here, or use the link we’ll email you." }),
    h("form.form", { onsubmit: async (e) => {
      e.preventDefault(); say(said, "");
      const confirm = sure.value.trim();
      try {
        const r = await freshly(() => busy(go, "Deleting…", () => post("delete", { confirm })));
        S.me = { signedIn: false }; S.settled = false; closeSheet(); render(); scrollTo(0, 0);
        toast(`Your account will be deleted on ${new Date(r.deleteAt).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}.`, false, 6000);
      } catch (err) { if (!err.quiet) say(sheetEl.querySelector(".said"), err.message); }
    } }, field(`Type ${m.handle} to confirm`, h("div.at", {}, "@", sure)), go),
    said] };
}

// ---- keeping up with changes made elsewhere: looked at again on coming back to the page, and now and then ----
async function refresh() {
  if (document.hidden || !S.me || Date.now() - S.pulled < 15000) return;
  S.pulled = Date.now();
  let m;
  try { m = await call("me"); } catch (_) { return; }
  const was = S.me, same = (x) => JSON.stringify({ ...x, fresh: 0, devices: x.devices?.map((d) => ({ ...d, seenAt: 0 })) });
  if (!!was.signedIn !== !!m.signedIn || !!was.deleting !== !!m.deleting) {
    if (sheetEl.open) closeSheet();
    S.me = m; S.settled = false; render();
    if (was.signedIn && !m.signedIn) toast("You were signed out.", true);
    return;
  }
  if (m.signedIn && same(was) !== same(m)) {
    S.me = m;
    if (m.prefs && m.prefs.appearance !== was.prefs?.appearance) theme(m.prefs.appearance);
    patch();
  }
}
document.addEventListener("visibilitychange", refresh);
addEventListener("focus", refresh);
setInterval(refresh, 60000);

// ---- whose account, kept in sight: once the profile's scrolled away, your photo and name in a bar of glass at the top
// (a tap on it goes back to the top) ----
const bar = h("div.whobar", { "aria-hidden": "true", onclick: () => scrollTo({ top: 0, behavior: still.matches ? "auto" : "smooth" }) });
document.body.append(bar);
const heroSeen = new IntersectionObserver(([e]) => bar.classList.toggle("on", !e.isIntersecting && e.boundingClientRect.top < 0), { rootMargin: "-64px 0px 0px 0px" });
function whoBar() {
  heroSeen.disconnect();
  const m = S.me, hero = $("main .hero");
  if (!m?.signedIn || !hero) { bar.classList.remove("on"); return; }
  bar.replaceChildren(avatar(m, true), h("b", { text: m.name }));
  heroSeen.observe(hero);
}

// ---- glass behind the status bar, once the page has scrolled under it ----
let ticking = false;
function scrolled() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    const t = Math.min(1, Math.max(0, scrollY / 24));
    document.documentElement.style.setProperty("--bar", t.toFixed(3));
  });
}
addEventListener("scroll", scrolled, { passive: true });

load();
