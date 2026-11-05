// InFlite's menu: one menu, the same in every app, opened from your photo. You (a tap to your account), the app's own
// few rows, and a foot with its version and Sign Out. With it: the same note in every app after it's updated itself,
// the updater every app shares (updates, below), and the hub (hub, below: every app as a page of inflite.ai).
// (Plain script, no imports: it's the same in a module and in Mail's script. Images only ever blob: or the app's own,
// as each app's rules allow; the apps' icons are drawn here, made blob: once each.)
const IFL = (() => {
  // (no app's page pinched bigger, as no app's is: iPhone takes no notice of a page's viewport saying so, only of its own
  // gesture events refused. A map or a photo still pinches itself, by its touches; menu.css says the rest, touch-action)
  for (const n of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(n, (e) => e.preventDefault(), { passive: false });
  const APPS = [["chat", "Chat"], ["weather", "Weather"], ["fitness", "Fitness"], ["markets", "Markets"], ["mail", "Mail"], ["account", "Account"]];
  const NAME = Object.fromEntries(APPS);
  const ICONS = /*ICONS*/{};
  const GLYPHS = {
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
    ruler: '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2M11.5 9.5l2-2M8.5 6.5l2-2M17.5 15.5l2-2"/>',
    sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    haptics: '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M3 9v6M21 9v6"/>',
    faceid: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M9 9v1.5M15 9v1.5M12 9v4h-1M9 16c1.7 1.3 4.3 1.3 6 0"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
    at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    rain: '<path d="M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 7.9"/><path d="M9 20l-1 2M13 20l-1 2M17 20l-1 2"/>',
    watch: '<rect x="7" y="6" width="10" height="12" rx="3"/><path d="M9 6l1-3h4l1 3M9 18l1 3h4l1-3"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z"/><path d="m9 12 2 2 4-4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
    data: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    back: '<path d="m15 5-7 7 7 7"/>',
    signout: '<path d="M9.5 19.5h-3a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2h3M15.5 16.5 20 12l-4.5-4.5M20 12H9.5"/>',
    install: '<path d="M12 4v12m-5-5 5 5 5-5M5 20h14"/>',
    person: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    compose: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    locate: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    upload: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/>',
    share: '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
    addp: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6"/>',
    bubble: '<path d="M21 11.5a8.4 8.4 0 0 1-12.2 7.5L3 21l2-5.4A8.4 8.4 0 1 1 21 11.5Z"/>',
    grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8"/>',
    // (and the ones the hub's sections ask for by name: InFlite Today's framework, ui.icon, today/public/roof/ui.js)
    up: '<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/>',
    mic: '<rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    minus: '<path d="M5 12h14"/>',
    more: '<circle cx="5.5" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="18.5" cy="12" r="1.2" fill="currentColor"/>',
    reply: '<path d="M10 8 4 13l6 5"/><path d="M4 13h10a6 6 0 0 1 6 6v1"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4.5 2 4.5H5"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9Z"/>',
    warn: '<path d="M10.3 3.9 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9.5v4.5M12 17.3v.1"/>',
    map: '<path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5Z"/><path d="M9 4v13.5M15 6.5V20"/>',
    bird: '<path d="M16 7h.01"/><path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.3-2.3L2 20"/><path d="m20 7 2 .5-2 .5"/><path d="M10 18v3M14 17.8V21"/>',
    gif: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 10H8.5a1.5 1.5 0 0 0 0 3H10v-1.5M12.5 9.5v5M15.5 14.5v-5H18M15.5 12H17"/>',
    attachment: '<path d="m21 11-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4L15.5 7"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    heart: '<path d="M19.5 13.6 12 21l-7.5-7.4A5 5 0 1 1 12 7a5 5 0 1 1 7.5 6.6Z"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/>',
    inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.5 5h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Z"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/>',
    swap: '<path d="M7 4 3 8l4 4M3 8h14M17 12l4 4-4 4M21 16H7"/>',
    trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7Z"/>',
    sparkle: '<path d="M12 3c.6 4.4 2.6 6.4 7 7-4.4.6-6.4 2.6-7 7-.6-4.4-2.6-6.4-7-7 4.4-.6 6.4-2.6 7-7Z"/><path d="M19 15.5c.2 1.5.9 2.2 2.5 2.5-1.6.3-2.3 1-2.5 2.5-.3-1.5-1-2.2-2.5-2.5 1.5-.3 2.2-1 2.5-2.5Z"/>',
    open: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    device: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    wave: '<path d="M3 12h3l2.5-6 4 13 3-9 2 2H21"/>',
    ride: '<circle cx="5.5" cy="16.5" r="3.5"/><circle cx="18.5" cy="16.5" r="3.5"/><path d="m5.5 16.5 4-8h6l3 8M9.5 8.5 12.5 16.5M14 5.5h3"/>',
    medal: '<circle cx="12" cy="15" r="6"/><path d="M8.5 10 6 3h4l2 4 2-4h4l-2.5 7"/><path d="m12 12.5.9 1.7 1.9.3-1.4 1.3.3 1.9-1.7-.9-1.7.9.3-1.9-1.4-1.3 1.9-.3Z"/>',
    strength: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  };
  // (the same glyph, by the other names the apps' sections use for it)
  const ALSO = { photo: "image", edit: "pen", done: "check", later: "clock", chat: "bubble", clip: "attachment", today: "calendar", news: "file", weather: "sun", markets: "trend", fitness: "heart" };
  const svg = (name, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPHS[name] || GLYPHS[ALSO[name]] || ""}</svg>`;
  const urls = {};
  // (an app's icon, by its name or the hub's for it (its sections: chats, finance); one it hasn't, no picture at all, never
  // a broken one)
  const APP_AS = { chats: "chat", finance: "markets", email: "mail" };
  const iconUrl = (a) => { a = APP_AS[a] || a; return !ICONS[a] ? "" : urls[a] || (urls[a] = URL.createObjectURL(new Blob([ICONS[a]], { type: "image/svg+xml" }))); };
  const el = (tag, cls, ...kids) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    for (const k of kids) if (k != null && k !== false) n.append(k);
    return n;
  };

  // the same short note in every app
  // (read out from a place that's always there, unseen, as the home page's toast is: a note only just put in the page
  // with its words already in it often isn't read out at all)
  const sayEl = el("p", "ifm-say"); sayEl.setAttribute("role", "status"); sayEl.setAttribute("aria-live", "polite");
  document.body?.append(sayEl);
  let noteEl = null, noteT = 0;
  function note(app, title, sub) {
    noteEl?.remove();
    clearTimeout(noteT);
    const img = el("img", "ifm-note-ic"); img.src = iconUrl(app); img.alt = "";
    noteEl = el("div", "ifm-note", img, el("span", "ifm-note-tx", el("b", "", title), sub ? el("small", "", sub) : null));
    document.body.append(noteEl);
    if (!sayEl.isConnected) document.body.append(sayEl);
    sayEl.textContent = "";
    const n = noteEl;
    requestAnimationFrame(() => requestAnimationFrame(() => { if (noteEl !== n) return; n.classList.add("on"); sayEl.textContent = sub ? `${title}. ${sub}` : title; }));
    // (what it said emptied as it goes, so the same words next time are a change, and read out again)
    noteT = setTimeout(() => { n.classList.remove("on"); sayEl.textContent = ""; setTimeout(() => n.remove(), 400); }, 3600);
  }
  // Notifications on this device, asked for in one tap (a phone asks each app for itself, and only from a tap): when
  // the app's opened from the account's Notifications page to turn them on (#notify), or from the menu's row where
  // they're off. What they tell you is the account's. turnOn(): asks the browser first thing, → true once they're on
  let allowEl = null;
  function allow(app, line, turnOn) {
    allowEl?.remove();
    const img = el("img", "ifa-ic"); img.src = iconUrl(app); img.alt = "";
    const go = el("button", "ifa-go", "Allow Notifications"), later = el("button", "ifa-later", "Not Now");
    go.type = later.type = "button";
    const sheet = el("div", "ifa-sheet", img, el("h2", "ifa-t", "Notifications on this device"), el("p", "ifa-p", line), go, later);
    sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true"); sheet.setAttribute("aria-label", "Notifications on this device");
    const layer = allowEl = el("div", "ifa-layer", sheet), was = document.activeElement;
    const key = (e) => {
      if (e.key === "Escape") shut();
      else if (e.key === "Tab") { e.preventDefault(); (document.activeElement === go ? later : go).focus(); }
    };
    const shut = () => { document.removeEventListener("keydown", key, true); layer.classList.remove("on"); setTimeout(() => layer.remove(), 320); if (allowEl === layer) allowEl = null; was?.focus?.({ preventScroll: true }); };
    later.onclick = shut;
    layer.addEventListener("pointerdown", (e) => { if (e.target === layer) shut(); });
    go.onclick = async () => {
      go.disabled = true; go.textContent = "Turning On…";
      const on = await Promise.resolve().then(turnOn).catch(() => false);
      if (on) { shut(); note(app, "Notifications on", "On this device"); } else { go.disabled = false; go.textContent = "Allow Notifications"; }
    };
    document.addEventListener("keydown", key, true);
    document.body.append(layer);
    requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add("on")));
    go.focus({ preventScroll: true });
  }
  // (opened to turn them on: #notify, taken out of the address, and whether it was there)
  function wantsAllow() {
    if (!/(^#|&)notify(&|$)/.test(location.hash)) return false;
    try { history.replaceState(null, "", location.pathname + location.search); } catch (_) {}
    return true;
  }
  // this app's version, as it opens: said once if it's new since last time, with what's new in it (news: a line, set
  // beside the app's version with each one that goes out)
  function built(app, build, news) {
    let was = null;
    try { was = localStorage.getItem(`ifl-build:${app}`); localStorage.setItem(`ifl-build:${app}`, build); } catch (_) {}
    if (was && was !== build) setTimeout(() => note(app, `${NAME[app]} updated`, news ? `V${build} · ${news}` : `Now V${build}`), 600);
  }

  // ---- updates, the same in every app ----
  // A new version's looked for as the app opens, every time you come back to it, and every five minutes while it's on
  // the screen (an app on a phone's Home Screen is brought back, not opened again, so looking only as it opened left it
  // days behind): at the app's own address (/version: functions/_version.js), against the version it's running. Once
  // there's one, it's put in at the first moment it's not in your way: straight away if you've only just opened the app
  // or come back to it and not touched it yet (before you'd notice); else once you've left it be for a minute, never
  // while you're typing, in a sheet or a menu, or the app says it's busy (sending, recording, uploading). One that must
  // go in (min: a fix that can't wait) goes in at the first moment you're not busy. Meanwhile the menu's foot has Update
  // instead of its green dot. The new version's files are fetched afresh first, past any copy the app or the browser
  // keeps, so it's never a mix of the old and the new (and if you start on something meanwhile, it waits again); then
  // where you are is kept (the app's save()) and it opens there again (here()); once for each new version, so a copy
  // that's still the old one mid-release isn't loaded over and over.
  // o: { app, build, url (default "version"), field (in its answer, default "build"), busy() → true while it's not to
  //      be interrupted, save() → where you are (to JSON), files: what to fetch afresh where there's no service worker }
  const U = { app: "", build: "", url: "version", field: "build", busy: null, save: null, files: null, ready: null, fresh: "", at: 0, back: Date.now(), touch: 0, going: false, told: "" };
  const typing = () => { const a = document.activeElement; return !!a && (a.isContentEditable || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || (a.tagName === "INPUT" && !a.readOnly && !/^(button|checkbox|radio|range|submit|reset|file|color)$/.test(a.type))); };
  const busyNow = () => typing() || !!open || !!document.querySelector("dialog[open], .ifa-layer, [aria-busy='true']") || !!U.busy?.();
  // (a version's parts as numbers: 1.76 after 1.8, as 1.80 is written)
  const older = (a, b) => { const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); return false; };
  function updates(o) {
    Object.assign(U, o);
    const touched = () => { U.touch = Date.now(); };
    for (const ev of ["pointerdown", "keydown", "wheel"]) addEventListener(ev, touched, { capture: true, passive: true });
    const back = () => { U.back = Date.now(); U.touch = 0; check(true); };
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") back(); });
    addEventListener("pageshow", (e) => { if (e.persisted) back(); });
    addEventListener("online", () => check(true));
    // (a service worker that's noticed the app's files change, as it opened: looked at now)
    navigator.serviceWorker?.addEventListener("message", (e) => { if (/:new$/.test(e.data?.type || "")) check(true); });
    setInterval(() => { if (document.visibilityState === "visible") check(); }, 5 * 60e3);
    setInterval(soon, 4000);
    setTimeout(() => check(true), 2000);     // (as it opens, a moment after: out of the way of its opening)
  }
  async function check(now) {
    const t = Date.now();
    if (!U.app || U.going || t - U.at < (now ? 3e3 : 4 * 60e3)) return;     // (now: back, online, a worker's word, as one)
    U.at = t;
    try {
      const r = await fetch(U.url, { cache: "no-store", credentials: "same-origin" });
      if (r.ok) { const j = await r.json(); offer(j[U.field], j.min); }
    } catch (_) {}
  }
  // the version deployed: from /version, or handed over by an app that asks its server anyway (Mail, as it syncs)
  function offer(build, min) {
    if (!build) return;
    build = String(build);
    if (build === U.build) { U.ready = null; return; }
    if (U.ready?.build !== build) U.ready = { build, at: Date.now(), must: !!min && older(U.build, min) };
    soon();
  }
  function soon() {
    const r = U.ready, t = Date.now();
    if (!r || U.going || document.visibilityState !== "visible") return;
    if (busyNow()) return tell();
    const fresh = t - U.back < 8e3 && !U.touch, still = t - (U.touch || U.back) > (window.__iflQuiet || 60e3);     // (__iflQuiet: tests' shorter minute)
    if (fresh || still || r.must) return apply();
    tell();
  }
  // (said once, if it's been waiting a while: it'll go in by itself, or now from the menu)
  function tell() {
    const r = U.ready;
    if (!r || U.told === r.build || Date.now() - r.at < 90e3) return;
    U.told = r.build;
    note(U.app, `A new ${NAME[U.app]} is ready`, r.must ? "It updates as soon as you’re done" : "It updates itself, or tap Update in the menu");
  }
  async function apply(asked) {
    const r = U.ready;
    if (!r || U.going) return;
    // (its files already fetched afresh, the last time it was about to go in: U.fresh, below)
    const key = `ifl-upd:${U.app}`, got = U.fresh === r.build;
    try {
      const k = JSON.parse(sessionStorage.getItem(key) || "null");
      if (!asked && !got && k?.build === r.build && Date.now() - k.at < 10 * 60e3) return;
      sessionStorage.setItem(key, JSON.stringify({ build: r.build, at: Date.now() }));
    } catch (_) {}
    U.going = true;
    close(true);
    if (!got) {
      const t = U.touch;
      if (!(await afresh())) {
        // (a new version's worker that couldn't fetch all its files (Weather's are all or none), or hasn't yet: loaded
        // now, it'd be the old version again. Still offered, it's tried again once that worker's taken over, else in ten
        // minutes; tried afresh, not taken as fresh: a worker taking over has fetched its own files, not always the
        // app's (Mail's are fetched by the page, U.files))
        U.going = false;
        navigator.serviceWorker?.addEventListener("controllerchange", () => { if (U.ready?.build === r.build) try { sessionStorage.removeItem(key); } catch (_) {} }, { once: true });
        if (asked) note(U.app, `${NAME[U.app]} couldn’t update just now`, "It tries again by itself");
        return;
      }
      // (and if you've started on something meanwhile (typing, a sheet, a tap), it waits for the next moment you're not)
      if (!asked && (busyNow() || (!r.must && U.touch !== t))) { U.fresh = r.build; U.going = false; return; }
    }
    // (where you are kept as it goes, not before the wait: you may have scrolled meanwhile)
    try { const at = U.save?.(); if (at != null) sessionStorage.setItem(`ifl-here:${U.app}`, JSON.stringify({ at, t: Date.now() })); } catch (_) {}
    location.reload();
  }
  // the new version's files, fetched afresh before it loads: a service worker of the app's own for each version (as
  // Weather's) installed with all of them; one that keeps one version's files (Markets', Fitness') asked to fetch them
  // again; and without one, the page and its files asked of the network past the browser's own copy. → false if a new
  // worker was being installed and hasn't taken over (its files not all fetched, or not yet)
  async function afresh() {
    const sw = navigator.serviceWorker, wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
    try {
      const reg = await sw?.getRegistration();
      if (reg) {
        const was = reg.active;
        await Promise.race([reg.update().catch(() => {}), wait(6000)]);
        if (reg.installing || reg.waiting) {
          await Promise.race([new Promise((ok) => sw.addEventListener("controllerchange", ok, { once: true })), wait(10000)]);
          if (reg.active === was) return false;
        }
        const c = sw.controller;
        if (c) await Promise.race([new Promise((ok) => { const ch = new MessageChannel(); ch.port1.onmessage = ok; c.postMessage({ ifl: "renew" }, [ch.port2]); }), wait(8000)]);
      }
      if (U.files) await Promise.race([Promise.all(U.files.map((u) => fetch(u, { cache: "reload", credentials: "same-origin" }).catch(() => null))), wait(4000)]);
    } catch (_) {}
    return true;
  }
  // where you were as it updated (save()), as the new version opens: once, and only if moments ago; else null
  function here(app) {
    try {
      const k = JSON.parse(sessionStorage.getItem(`ifl-here:${app}`) || "null");
      sessionStorage.removeItem(`ifl-here:${app}`);
      return k && Date.now() - k.t < 2 * 60e3 ? k.at : null;
    } catch (_) { return null; }
  }

  // the menu, from your photo: o = { app, build, me: { name, line, photo: an element }, rows: [{ icon, color, label,
  // on, toggle(next) → on, value, warn (the value in amber: it needs you), open }], account(), signOut(), update: a function when a newer version's ready }
  let open = null;
  function close(now) {
    const m = open;
    if (!m) return;
    open = null;
    m.behind?.forEach((c) => { c.inert = false; });
    m.anchor.classList.remove("ifm-lit");
    document.removeEventListener("keydown", m.key, true);
    window.visualViewport?.removeEventListener("resize", m.fit);
    // (focus back on your photo, if it was in the menu: else it's left on nothing, and a screen reader starts again at the top)
    if (m.layer.contains(document.activeElement) || document.activeElement === document.body) m.anchor.focus?.({ preventScroll: true });
    m.layer.classList.remove("open");
    m.pop.classList.remove("open");
    if (now) m.layer.remove();
    else { m.pop.classList.add("closing"); setTimeout(() => m.layer.remove(), 260); }
    m.onClose?.();
  }
  function menu(anchor, o) {
    if (open) { const same = open.anchor === anchor; close(); if (same) return; }
    const act = (fn) => () => { close(); fn?.(); };
    const photo = el("span", "ifm-photo", o.me.photo || null);
    const card = el("button", "ifm-card", photo, el("span", "ifm-who", el("b", "", o.me.name || "Your account"), o.me.line ? el("small", "", o.me.line) : null));
    card.insertAdjacentHTML("beforeend", svg("chev", "ifm-chev"));
    card.type = "button";
    card.setAttribute("aria-label", `${o.me.name || "You"}: your InFlite account`);
    card.onclick = act(o.account);
    // (the app's rows: "-" between two starts another group; each row's key, data-k, is its handle)
    const drawRows = (list) => {
      const groups = [el("div", "ifm-grp")];
      for (const r of (list || []).filter(Boolean)) {
        if (r === "-") { groups.push(el("div", "ifm-grp")); continue; }
        const rows = groups[groups.length - 1];
        const ic = el("span", `ifm-ic ${r.color || "grey"}`); ic.innerHTML = svg(r.icon);
        if (r.on !== undefined) {
          const sw = el("button", "ifm-switch"); sw.type = "button"; sw.setAttribute("role", "switch");
          sw.setAttribute("aria-checked", String(!!r.on)); sw.setAttribute("aria-label", r.label);
          if (r.key) sw.dataset.k = r.key;
          sw.disabled = !!r.disabled;
          sw.onclick = async () => { const next = sw.getAttribute("aria-checked") !== "true"; sw.setAttribute("aria-checked", String(next)); let v; try { v = await r.toggle?.(next); } catch (_) { v = !next; } if (typeof v === "boolean") sw.setAttribute("aria-checked", String(v)); };
          rows.append(el("div", "ifm-row" + (r.disabled ? " off" : ""), ic, el("span", "ifm-l", r.label), sw));
        } else {
          // (a value or none, its chevron in the same column: lined up with every other row's)
          const b = el("button", "ifm-row go", ic, el("span", "ifm-l", r.label), el("span", "ifm-val" + (r.warn ? " ifm-warn" : ""), r.value || ""));
          b.insertAdjacentHTML("beforeend", svg("chev", "ifm-chev"));
          b.type = "button"; b.onclick = r.stay ? () => r.open?.(b) : act(r.open);
          if (r.key) b.dataset.k = r.key;
          rows.append(b);
        }
      }
      return groups.filter((g) => g.childNodes.length);
    };
    // (and last, in every app: Report a Problem, the bug window for anything that isn't right)
    const rowsBox = el("div", "ifm-rows", ...drawRows([...(o.rows || []), "-", { icon: "warn", color: "grey", label: "Report a Problem", key: "bug", open: () => BUG.report() }]));
    const mark = el("img", "ifm-foot-ic"); mark.src = iconUrl(o.app); mark.alt = "";
    // (its foot: the app and its version, quietly, a green dot while it's up to date; a new version waiting, an Update
    // button in the dot's place; and Sign Out, the one round button at the end, named for screen readers)
    const said = (t) => el("span", "ifm-sr", t);
    let status;
    const update = o.update || (U.ready ? () => apply(true) : null);
    if (update) { status = el("button", "ifm-upd"); status.innerHTML = svg("install"); status.append("Update"); status.type = "button"; status.onclick = act(update); }
    else { status = el("span", "ifm-dot", said(" · Up to date")); }
    const out = el("button", "ifm-out", said("Sign Out")); out.insertAdjacentHTML("afterbegin", svg("signout")); out.type = "button"; out.onclick = act(o.signOut);
    const foot = el("div", "ifm-foot", el("span", "ifm-ver", mark, `${NAME[o.app]} ${o.build}`, update ? null : status), update ? status : null, o.signOut ? out : null);
    const pop = el("div", `ifm-pop ifm-in-${o.app}`, card, rowsBox, foot);
    pop.setAttribute("role", "dialog"); pop.setAttribute("aria-modal", "true"); pop.setAttribute("aria-label", "You and your apps");
    const layer = el("div", "ifm-layer", pop);
    layer.addEventListener("pointerdown", (e) => { if (e.target === layer) { e.preventDefault(); close(); } });
    const key = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); close(); anchor.focus?.({ preventScroll: true }); }
      else if (e.key === "Tab") {
        const f = [...pop.querySelectorAll("button, a")];
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener("keydown", key, true);
    // (the page behind out of reach while it's open: a screen reader stays in the menu. Not the notes' place, so one
    // said meanwhile (a new version's ready) is still read out)
    const behind = [...document.body.children].filter((c) => !c.inert && c.tagName !== "SCRIPT" && c !== sayEl);
    behind.forEach((c) => { c.inert = true; });
    document.body.append(layer);
    // (under your photo, from where it grows; over it, if your photo's low on the screen. Under it, no taller than the
    // screen leaves it, so on a short one (a phone on its side) it scrolls, and its foot's never out of reach below;
    // fitted again as what's in sight changes while it's open: the keyboard going as the menu takes the focus from a
    // field, which left it short, or the phone turned)
    const tall = () => Math.min(window.innerHeight, window.visualViewport?.height || Infinity);
    const r = anchor.getBoundingClientRect(), H = tall(), W = window.innerWidth;
    const left = Math.max(12, Math.min(r.left - 2, W - pop.offsetWidth - 12));
    const below = r.bottom + 10 + pop.offsetHeight <= H - 12 || r.top < H / 2;
    const top = below ? r.bottom + 10 : Math.max(12, r.top - 10 - pop.offsetHeight);
    const fit = () => { if (below) pop.style.maxHeight = `${Math.max(0, tall() - top - 12)}px`; };
    fit();
    window.visualViewport?.addEventListener("resize", fit);
    pop.style.top = `${top}px`;
    pop.style.left = `${left}px`;
    pop.style.transformOrigin = `${r.left + r.width / 2 - left}px ${below ? "-10px" : "calc(100% + 10px)"}`;
    anchor.classList.add("ifm-lit");
    open = { anchor, layer, pop, key, fit, behind, onClose: o.onClose, redraw: (list) => {
      // (the focus kept on the row it was on, by its key)
      const k = document.activeElement?.dataset?.k;
      rowsBox.replaceChildren(...drawRows(list));
      if (k) rowsBox.querySelector(`[data-k="${k}"]`)?.focus({ preventScroll: true });
    } };
    requestAnimationFrame(() => requestAnimationFrame(() => { layer.classList.add("open"); pop.classList.add("open"); }));
    card.focus({ preventScroll: true });
  }
  // InFlite's header, the same in every app: your photo (InFlite's menu; signed out, an outline that signs in) · the
  // screen's name, large, with its one line under it (a ▾ after the name when tapping it switches) · the app's actions in
  // one capsule. Scrolled, the same row, compact, on a soft glass band: --p, from 0 to 1 over the first 64px, set on each
  // .ifh in what's scrolled (watch), and again whenever the page is drawn anew (settle)
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  // o: { me: your photo's html (none: signed out), meAttrs, title, pickAttrs (set: the name's a button, with ▾), line: html,
  //      acts: [{ icon: a glyph's name or svg html, label, attrs }] } (attrs: the app's own, as html: data-act="…", id="…")
  function headerHtml(o) {
    const me = `<button type="button" class="ifh-me${o.me ? "" : " out"}" aria-label="${o.me ? "You and your apps" : "Sign in"}" aria-haspopup="${o.me ? "dialog" : "false"}" ${o.meAttrs || ""}>${o.me || svg("person")}</button>`;
    const name = o.pickAttrs != null ? `<button type="button" class="ifh-pick" ${o.pickAttrs}><span>${esc(o.title)}</span>${svg("down", "ifh-down")}</button>` : esc(o.title);
    const acts = (o.acts || []).filter(Boolean).map((a) => `<button type="button" class="ifh-act" aria-label="${esc(a.label)}" title="${esc(a.label)}" ${a.attrs || ""}>${GLYPHS[a.icon] ? svg(a.icon) : a.icon}</button>`).join("");
    return `<header class="ifh${o.cls ? " " + o.cls : ""}">${me}<div class="ifh-t"><h1 class="ifh-name">${name}</h1><span class="ifh-line">${o.line || ""}</span></div><div class="ifh-acts">${acts}</div></header>`;
  }
  // as an element, with what's tapped wired: o.onMe(button), o.onPick(button), each act's onclick(button)
  function header(o) {
    const t = document.createElement("template");
    t.innerHTML = headerHtml({ ...o, pickAttrs: o.onPick ? o.pickAttrs || "" : o.pickAttrs });
    const hd = t.content.firstElementChild;
    if (o.me instanceof Node) { const b = hd.querySelector(".ifh-me"); b.replaceChildren(o.me); b.classList.remove("out"); b.setAttribute("aria-label", "You and your apps"); }
    if (o.onMe) hd.querySelector(".ifh-me").onclick = (e) => o.onMe(e.currentTarget);
    if (o.onPick) hd.querySelector(".ifh-pick").onclick = (e) => o.onPick(e.currentTarget);
    if (o.lineNode) hd.querySelector(".ifh-line").replaceChildren(o.lineNode);
    hd.querySelectorAll(".ifh-act").forEach((b, i) => { const a = (o.acts || []).filter(Boolean)[i]; if (a?.onclick) b.onclick = (e) => a.onclick(e.currentTarget); });
    return hd;
  }
  const watched = new Set();
  // (--p is 0 or 1, never a fraction tracking the finger: the header goes compact past 28px and back above 8px, and CSS
  // animates the change in one smooth movement (menu.css registers --p), instead of a resize on every scroll frame)
  // (no pinch zoom: iOS keeps it even with the viewport's user-scalable=no, so its gestures are refused here; and a copy
  // from the page is empty, but never from a field you type in)
  if (!globalThis.__iflNoZoom && typeof document !== "undefined") {
    globalThis.__iflNoZoom = true;
    for (const ev of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
    document.addEventListener("touchmove", (e) => { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });
    const typing = (t) => t && t.closest?.("input, textarea, select, [contenteditable]");
    document.addEventListener("copy", (e) => { if (!typing(e.target)) e.preventDefault(); });
    document.addEventListener("selectstart", (e) => { if (!typing(e.target)) e.preventDefault(); });
  }
  const upNow = new WeakMap();
  function settle(t = window) {
    const y = t === window ? scrollY : t.scrollTop, was = upNow.get(t) || false, up = was ? y > 8 : y > 28;
    upNow.set(t, up);
    for (const hd of (t === window ? document : t).querySelectorAll(".ifh")) { if (hd.style.getPropertyValue("--p") !== (up ? "1" : "0")) hd.style.setProperty("--p", up ? "1" : "0"); hd.classList.toggle("ifh-up", up); }
  }
  function watch(t = window) {
    if (!watched.has(t)) { watched.add(t); let q = 0; t.addEventListener("scroll", () => { if (!q) q = requestAnimationFrame(() => { q = 0; settle(t); }); }, { passive: true }); }
    settle(t);
  }
  const glyph = (name) => svg(name);

  // (the open menu's rows drawn again, as what they say changes: one that's come or gone)
  const redraw = (rows) => open?.redraw(rows);

  // ---- the hub: every app a page of inflite.ai, in one window ----
  // At inflite.ai, Today, Apps and You are one page (/, /#apps, /#you), and Chats, Weather, Fitness and Markets are pages
  // beside it (/chats/, /weather/, /fitness/, /markets/), each fetched from the app's own address by the site's Worker,
  // which marks each one it serves with a meta tag named ifl-hub, its content the app's path ("/weather/"; Today's own page has "/"). That
  // marker, and never the address, is what says an app is at the hub: at chat.inflite.ai, chat.localhost or a test's
  // address there's none, and every app is exactly what it was. (Mail stays at its own address, framed at /mail/.)
  //   on, base           the marker's there; what it says ("" where it isn't)
  //   go(url)            an app's own address as the hub's: https://chat.<site>/#x → /chats/#x, weather. → /weather/,
  //                      fitness. → /fitness/, finance. → /markets/, email. → /mail/, <site>/ → /; account., auth. and
  //                      any other site as they are (a test's site, ifl.test, the same way); off the hub, url as it is
  //   href(app, section) an app at a section: ("weather", "radar") → "/weather/#radar", ("markets", "s=TSCO") →
  //                      "/markets/#s=TSCO", ("chat", "open=<id>") → "/chats/#open=<id>"; off the hub, null (the hub's
  //                      paths aren't pages at an app's own address: the app links its own way, as it always has)
  //   tabs(el, current)  Today · Chats · Apps · You, the hub's tab bar, into el; current (its key: today, chats, apps or
  //                      you) marked; off the hub, el left as it is
  //   back()             back where you came from in the window (the breadcrumb, below), else to Apps; never history's
  //                      own back (Mail keeps history of its own, and an app opened from a notification has none). → true;
  //                      off the hub, nothing done: false
  //   chat()             Chat's engine: Chat's own page (/chats/?engine=1) in a frame over this one, unseen until it shows
  //                      its send sheet, which sends a card without leaving. A promise of it (its IFLChat, ready), or of
  //                      null: not ready (signed out of Chats, its key not here yet, locked), or no answer in 15 seconds.
  //                      Made on first use, kept while the page is open, dropped after 10 minutes out of sight
  //   send(words, packed, { to })   a card to a friend: the engine's sheet over this page, else Chats' own, which comes
  //                      back here after (#share=…&card=…&back=<this page>). → a promise of what the engine's sheet says,
  //                      or true once it's gone to Chats'; off the hub, of false, nothing done (the app sends its own
  //                      way, chat.<site>/#share=…, as it always has)
  //   sent(say), closed()           the engine's word that it's sent (the frame put away, and "Sent to Pat. You’re still
  //                      here" said) or that its sheet's shut (put away)
  //   signIn()           a signed-out app at the hub signs in by Today's own trip (never waiting on Chat's key, which
  //                      only Chats needs), and comes back here. → true; off the hub,
  //                      nothing done: false
  //   moved(app, { off })           an old Home Screen icon (off the hub, opened from the Home Screen, filling it: never
  //                      iOS's small browser, which a link from another Home Screen app opens): once, the card saying
  //                      InFlite is one app now, with How to Add and Turn Off Notifications Here (off). → true if shown
  //   degrade(links)     this page of the hub runs as the apps did before it (its Worker can't serve them yet: Today's
  //                      /api/hub says not ready): go, href and the tabs give the apps' own addresses (links: { chat,
  //                      weather, fitness, finance, email }, each an origin; else <app>.<site>), send goes to
  //                      chat.<site>/#share=…, and there's no engine. degraded: whether it does
  // The breadcrumb: where a page of the hub was left from, for its Back (Chat's pages send no Referer). Written, as the
  // page you're on (its path, ≤ 200 characters), by go and href to another page, the tabs and links to one, and a
  // notification opened on another page; read once as a page opens (what it was left from); taken as Back goes, so Back
  // never bounces between two pages.
  // A notification tapped while a page of the hub is open: the root worker (/sw.js) posts { ifl: "open", url } to the
  // window, and the page goes there (a path of this site's only), in the same window; within an app, its hashchange.
  // Sent from Chats' own sheet (send's way through Chats): sessionStorage["ifl-sent"], said once here as the page opens.
  const CRUMB = "ifl-crumb", SENT = "ifl-sent";
  const SUBS = { chat: "/chats/", weather: "/weather/", fitness: "/fitness/", finance: "/markets/", email: "/mail/" };
  const HUB_APPS = { today: "/", chat: "/chats/", chats: "/chats/", weather: "/weather/", fitness: "/fitness/", markets: "/markets/", mail: "/mail/" };
  // (each hub path's app, by its own address's first part: degraded, the way back to it)
  const OWN = { chats: "chat", weather: "weather", fitness: "fitness", markets: "finance", mail: "email" };
  // (keys, not words: no app's copy but Today's names Today as an app, iflmenu.test.mjs)
  const TABS = { today: ["Today", "/", "sun"], chats: ["Chats", "/chats/", "bubble"], apps: ["Apps", "/#apps", "grid"], you: ["You", "/#you", "person"] };
  const marker = typeof document !== "undefined" ? document.querySelector?.('meta[name="ifl-hub"]') : null;
  // (a path of this site's: starts /, not //, no \ and nothing unseen (a tab or a new line, which an address drops, so
  // "/\n/x" would be "//x"), no more than 200 characters)
  const ownPath = (p) => typeof p === "string" && p.length <= 200 && /^\/(?!\/)/.test(p) && !/[\\\u0000-\u001f\u007f]/.test(p);
  const pageOf = (p) => { try { return new URL(p, location.origin).pathname; } catch (_) { return null; } };
  const store = () => { try { return sessionStorage; } catch (_) { return null; } };
  const crumb = () => { const p = location.pathname + location.hash; try { if (ownPath(p)) store()?.setItem(CRUMB, p); } catch (_) {} };
  // (what this page was left from, read as it opens: its own later writes are for the page it goes to next)
  const cameFrom = (() => { try { const c = store()?.getItem(CRUMB); return ownPath(c) ? c : null; } catch (_) { return null; } })();
  const leaving = (p) => ownPath(p) && pageOf(p) !== location.pathname;
  const standalone = () => { try { return navigator.standalone === true || !!matchMedia?.("(display-mode: standalone)").matches; } catch (_) { return false; } };
  // (the app's own Home Screen icon, filling the screen: not iOS's small browser, which a link from another Home Screen
  // app opens it in, "standalone" too but under its own bars and short of the screen, where moved()'s card would cover
  // the page. On an iPhone or iPad (navigator.standalone): filling the screen from top to bottom (upright, its height; on
  // its side, its short side: the small browser's bars leave it short either way), or running up behind the status bar
  // (a top inset: every app's page is viewport-fit=cover); elsewhere, standalone is enough)
  const ownIcon = () => {
    if (navigator.standalone !== true) return true;
    try {
      const w = window.screen?.width || 0, h = window.screen?.height || 0;
      const tall = matchMedia("(orientation: portrait)").matches ? h : (w && h ? Math.min(w, h) : w || h);
      if (tall && innerHeight >= tall - 2) return true;
      const p = document.createElement("div");
      p.style.cssText = "position:fixed;top:0;left:0;width:1px;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none";
      document.body.append(p);
      const inset = p.offsetHeight;
      p.remove();
      return inset > 0;
    } catch (_) { return true; }
  };
  // The screen's foot, on an iPhone's or iPad's Home Screen: iOS can lay the page out shorter than the screen (by about
  // the status bar's height, after a while away, or from the start), and what's fixed to its foot (a background, the tab
  // bar, a sheet) then stops that much above the screen's bottom, with the page's own colour showing under it. The gap,
  // measured against the screen itself, is --fix-gap on html, for each app's styles to take back (markets/app.js did it
  // first). Only filling the screen, behind the status bar (not iOS's small browser, short of it by its own bars); never
  // the keyboard (that shortens the visual viewport, not innerHeight).
  const fitScreen = () => {
    if (navigator.standalone !== true || !window.screen?.width || !window.screen?.height) return;
    const doc = document.documentElement;
    const behind = () => {
      if (!matchMedia("(orientation: portrait)").matches) return true;
      const p = document.createElement("div");
      p.style.cssText = "position:fixed;top:0;left:0;width:1px;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none";
      document.body.append(p);
      const t = p.offsetHeight;
      p.remove();
      return t > 0;
    };
    const fit = () => {
      try {
        const portrait = matchMedia("(orientation: portrait)").matches, a = screen.width, b = screen.height;
        const w = portrait ? Math.min(a, b) : Math.max(a, b), h = portrait ? Math.max(a, b) : Math.min(a, b);
        const gap = Math.abs(innerWidth - w) < 2 && behind() ? Math.round(h - innerHeight) : 0;
        doc.style.setProperty("--fix-gap", `${gap > 0 && gap < 120 ? gap : 0}px`);
      } catch (_) {}
    };
    fit();
    for (const ev of ["resize", "pageshow", "focus"]) addEventListener(ev, fit);
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && fit());
    addEventListener("orientationchange", () => setTimeout(fit, 300));
  };
  if (document.body) fitScreen(); else document.addEventListener("DOMContentLoaded", fitScreen, { once: true });
  // degraded: the apps' own addresses (degrade's links, else <app>.<site>), and a hub path back to its app's
  let links = {};
  const origin = (sub) => links[sub] || `${location.protocol}//${sub}.${location.host.replace(/^next\./, "")}`;
  const ownAt = (p) => { const m = /^\/(chats|weather|fitness|markets|mail)(?=$|[/?#])\/?([\s\S]*)$/.exec(p); return m ? `${origin(OWN[m[1]])}/${m[2]}` : null; };
  const stillHere = (say) => (/still here/i.test(say) ? say : `${say.replace(/[.\s]+$/, "")}. You’re still here`);
  const hub = {
    on: !!marker,
    base: marker ? marker.getAttribute("content") || "/" : "",
    degraded: false,
    go(url) {
      if (!hub.on) return url;
      let u;
      try { u = new URL(String(url), location.href); } catch (_) { return url; }
      if (!/^https?:$/.test(u.protocol) || u.username || u.password) return url;
      // (the site: this page's, the staging hub's next. taken off, so its links to the apps' own addresses come here too)
      const site = location.host.replace(/^next\./, ""), rest = u.pathname + u.search + u.hash, sub = /^([a-z]+)\.(.+)$/.exec(u.host);
      let p = null;
      if (u.host === location.host || u.host === site) p = rest;
      else if (sub && sub[2] === site && SUBS[sub[1]]) p = SUBS[sub[1]].slice(0, -1) + rest;
      if (p == null) return url;
      if (hub.degraded) return ownAt(p) || (ownPath(p) ? p : url);
      if (leaving(p)) crumb();
      return p;
    },
    href(app, section = "") {
      if (!hub.on) return null;
      const s = String(section || ""), p = (HUB_APPS[app] || "/") + (!s ? "" : /^[#?]/.test(s) ? s : "#" + s);
      if (hub.degraded) return ownAt(p) || p;
      if (leaving(p)) crumb();
      return p;
    },
    tabs(nav, current) {
      if (!nav || !hub.on) return nav;
      if (nav.tagName !== "NAV") nav.setAttribute("role", "navigation");
      nav.setAttribute("aria-label", "InFlite");
      nav.classList.add("ifl-tabs");
      nav.replaceChildren(...Object.entries(TABS).map(([k, [label, to, icon]]) => {
        const a = document.createElement("a"), href = hub.degraded ? ownAt(to) || to : to;
        a.className = "ifl-tab"; a.href = href; a.dataset.tab = k;
        a.insertAdjacentHTML("afterbegin", svg(icon, "ifl-tab-ic"));
        a.append(el("span", "ifl-tab-l", label));
        if (k === current) a.setAttribute("aria-current", "page");
        a.addEventListener("click", () => { if (!hub.degraded && leaving(to)) crumb(); });
        return a;
      }));
      return nav;
    },
    back() {
      if (!hub.on) return false;
      const to = cameFrom && pageOf(cameFrom) !== location.pathname ? cameFrom : "/#apps";
      try { store()?.removeItem(CRUMB); } catch (_) {}
      location.assign(to);
      return true;
    },
    chat,
    send(words, packed, { to } = {}) {
      if (!hub.on) return Promise.resolve(false);
      const card = typeof packed === "string" && /^[A-Za-z0-9_-]+$/.test(packed) ? "&card=" + packed : "";
      if (hub.degraded) {
        location.assign(`${origin("chat")}/#share=${encodeURIComponent(String(words ?? ""))}${card}`);
        return Promise.resolve(true);
      }
      return hub.chat().then((c) => {
        if (c && c.state === "ready") return c.share(words, packed, { to });
        location.assign("/chats/#share=" + encodeURIComponent(String(words ?? "")) + card + "&back=" + encodeURIComponent(location.pathname + location.hash));
        return true;
      });
    },
    sent(say) { hide(); if (say) toast(stillHere(String(say).slice(0, 200))); },
    closed() { hide(); },
    signIn() {
      if (!hub.on || hub.degraded) return false;
      // (Today's own trip, on every device, and back here: no app but Chats needs Chat's key, and Chats asks to unlock
      // itself the first time it's opened)
      location.assign("/#signin-today&then=" + encodeURIComponent(location.pathname + location.hash));
      return true;
    },
    moved(app, { off } = {}) {
      if (hub.on || !standalone() || !document.body || !NAME[app] || !ownIcon()) return false;
      const k = `ifl-moved:${app}`;
      try { if (localStorage.getItem(k)) return false; localStorage.setItem(k, String(Date.now())); } catch (_) { return false; }
      movedCard(app, typeof off === "function" ? off : null);
      return true;
    },
    degrade(own = {}) {
      if (!hub.on) return false;
      links = {};
      for (const k of Object.values(OWN)) if (typeof own?.[k] === "string" && /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(own[k])) links[k] = own[k];
      hub.degraded = true;
      dropEngine();
      return true;
    },
  };

  // Chat's engine: /chats/?engine=1 in a frame over the page, its IFLChat once it says it's ready (ifl-chat-ready, on
  // this window), and the frame seen only while it shows its sheet (put away by sent or closed, or when its answer says
  // no sheet is showing). The frame is in a dialog of its own: shown, the dialog's modal, so it's in the top layer, over
  // every sheet of the page's own (a modal one too, which would otherwise make it inert) and the only thing a tap
  // reaches; put away, the dialog's shut but still laid out (unseen, never in the way of a tap: menu.css), so the engine
  // runs on and its sheet opens at once. The frame is never moved (that would load it again)
  const ENGINE_WAIT = 15e3, ENGINE_DROP = 10 * 60e3;
  let engine = null, resting = false;
  function dropEngine() { engine?.box.remove(); engine = null; }
  function hide() {
    const b = engine?.box;
    if (!b) return;
    b.classList.remove("on");
    try { if (b.open) b.close(); } catch (_) {}
  }
  function show() {
    const b = engine?.box;
    if (!b) return;
    b.classList.add("on");
    try { if (!b.open) b.showModal(); } catch (_) {}
  }
  // (the engine as the page uses it: its own calls, the frame shown for its sheet, and put away where nothing's showing:
  // a card refused (false, { ok: false }, { why }); sendTo's one tap sent ({ ok: true, say }: said here too). A sheet
  // that's shown is put away by its own word, sent or closed)
  const none = (r) => r === false || (!!r && typeof r === "object" && (r.ok === false || !!r.why));
  const wrap = (c) => ({
    get state() { return c.state; },
    share(...a) { show(); return Promise.resolve().then(() => c.share(...a)).then((r) => { if (none(r)) hide(); return r; }, (e) => { hide(); throw e; }); },
    sendTo(...a) {
      show();
      return Promise.resolve().then(() => c.sendTo(...a)).then((r) => { if (r?.ok === true) hub.sent(r.say || "Sent"); else if (none(r)) hide(); return r; }, (e) => { hide(); throw e; });
    },
    waiting: (...a) => c.waiting(...a),
    since: (...a) => c.since(...a),
    refresh: (...a) => c.refresh(...a),
    signOut: (...a) => c.signOut(...a),
  });
  const ready = () => { const c = engine?.api; return c && c.state === "ready" ? wrap(c) : null; };
  function chat() {
    if (!hub.on || hub.degraded || resting || !document.body) return Promise.resolve(null);
    if (engine) return engine.api ? Promise.resolve(ready()) : engine.wait;
    const box = document.createElement("dialog"), f = document.createElement("iframe");
    box.className = "ifl-engine-box";
    box.setAttribute("aria-label", "Chats");
    // (shut some other way (Escape, while the page has the focus): put away, as closed() would. Not when it's been shown
    // again since: this word comes a moment after it's shut)
    box.addEventListener("close", () => { if (!box.open) box.classList.remove("on"); });
    f.name = "ifl-chat"; f.className = "ifl-engine"; f.src = "/chats/?engine=1";
    f.setAttribute("title", "Chats");
    box.append(f);
    const e = engine = { box, frame: f, api: null, wait: null };
    e.wait = new Promise((ok) => {
      let t = 0;
      const done = () => {
        clearTimeout(t);
        removeEventListener("ifl-chat-ready", done);
        if (engine !== e) return ok(null);
        let c = null;
        try { c = f.contentWindow?.IFLChat || null; } catch (_) {}
        // (no engine in time: the frame dropped, and for two minutes none asked for again (a Send goes through Chats'
        // own sheet at once meanwhile); after that, the next use asks again)
        if (!c) { dropEngine(); resting = true; setTimeout(() => { resting = false; }, 2 * 60e3); return ok(null); }
        e.api = c;
        ok(ready());
      };
      addEventListener("ifl-chat-ready", done);
      t = setTimeout(done, ENGINE_WAIT);
    });
    document.body.append(box);
    return e.wait;
  }
  // (out of sight for ten minutes, the engine's let go: made again when it's next wanted)
  let hiddenAt = 0, dropT = 0;
  if (hub.on) document.addEventListener("visibilitychange", () => {
    clearTimeout(dropT);
    if (document.visibilityState === "hidden") { hiddenAt = Date.now(); dropT = setTimeout(() => { if (document.visibilityState === "hidden") dropEngine(); }, ENGINE_DROP); return; }
    if (hiddenAt && Date.now() - hiddenAt >= ENGINE_DROP) dropEngine();
    hiddenAt = 0;
  });

  // (a link to another of the hub's pages, followed: the breadcrumb, as the page is left, with where it was scrolled to)
  if (hub.on) document.addEventListener("click", (e) => {
    const a = e.target?.closest?.("a[href]");
    if (hub.degraded || !a || a.target === "_blank" || a.hasAttribute("download")) return;
    let u;
    try { u = new URL(a.href, location.href); } catch (_) { return; }
    if (u.origin === location.origin && leaving(u.pathname + u.hash)) crumb();
  }, true);
  // (a notification tapped while this page is open: the root worker's word, to a path of this site's only. Heard, it's
  // said so on the port the worker gave, else the worker opens it some other way: a page that has no ear for it)
  if (hub.on) navigator.serviceWorker?.addEventListener?.("message", (e) => {
    const d = e.data;
    if (!d || d.ifl !== "open" || !ownPath(d.url)) return;
    try { e.ports?.[0]?.postMessage({ ifl: "opened" }); } catch (_) {}
    if (hub.degraded) return location.assign(hub.go(d.url));
    if (leaving(d.url)) crumb();
    location.assign(d.url);
  });
  // (the hub's look: html.ifl-hub, and pages that cross-fade into each other, the tab bar staying put. menu.css asks for
  // it of every page (@view-transition, which can't be kept to html.ifl-hub there, and must be in a stylesheet to be
  // there as the next page's first shown): off the hub, every page lets it go as it's left, so nothing changes there; at
  // the hub, one that can't be done is let go quietly, before it can fail out loud: below)
  if (hub.on) document.documentElement?.classList.add("ifl-hub");
  // (the Home Screen icon's badge, as many notifications as are still showing: counted again by the root worker as a
  // page of the hub opens and each time it's back in sight, so those tapped or cleared meanwhile are gone from it)
  const recount = () => { try { navigator.serviceWorker?.getRegistration?.("/")?.then?.((r) => r?.active?.postMessage({ ifl: "badge" }), () => {}); } catch (_) {} };
  if (hub.on) {
    recount();
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") recount(); });
  }
  // A cross-fade that ends on a page that doesn't ask for it (one of this site's that isn't the hub's: an /api/ answer,
  // a 404) is called off in that page, which then says so as an error no script of its own can catch ("Transition was
  // aborted because of invalid state. ViewTransition opt-in disabled"). So a page of the hub lets go of one that's
  // bound anywhere but the hub's own pages (Today, Chats, the apps and Mail's, whose stylesheets all ask for it), as
  // it's left. And the one this page opened with is caught as it starts (document.activeViewTransition): called off
  // before it's shown, it would say so out loud too. This runs from the page's module, which a slow load can bring in
  // after that's happened: Today's page catches it first, as its head is read (the inflite repo's today/public/fade.js),
  // and any page of the hub that loads that script before its module does the same.
  const FADES = /^\/(?:index\.html)?$|^\/(?:chats|weather|fitness|markets|mail)\/(?:index\.html)?$/;
  const fades = (to) => { try { const u = new URL(to, location.href); return u.origin === location.origin && FADES.test(u.pathname); } catch (_) { return false; } };
  const hush = (t) => { if (t) for (const k of ["ready", "finished", "updateCallbackDone"]) t[k]?.catch?.(() => {}); return t; };
  const vt = (e) => {
    const t = hush(e.viewTransition), to = e.type === "pageswap" ? e.activation?.entry?.url : null;
    if (t && (!hub.on || (to && !fades(to)))) t.skipTransition?.();
  };
  try { hush(document.activeViewTransition); } catch (_) {}
  addEventListener("pageswap", vt);
  addEventListener("pagereveal", vt);

  // the card for an old Home Screen icon: InFlite is one app now (as allow's sheet looks)
  function movedCard(app, off) {
    const img = el("img", "ifa-ic"); img.src = iconUrl(app); img.alt = "";
    const how = el("button", "ifa-go", "How to Add"), stop = off ? el("button", "ifa-later ifa-off", "Turn Off Notifications Here") : null, later = el("button", "ifa-later", "Not Now");
    for (const b of [how, stop, later]) if (b) b.type = "button";
    const steps = el("p", "ifa-p ifa-steps", "In Safari, open inflite.ai, tap Share, then Add to Home Screen. Sign in there once, and every app is in it.");
    steps.hidden = true;
    const sheet = el("div", "ifa-sheet", img, el("h2", "ifa-t", "InFlite is one app now"), el("p", "ifa-p", "Today, Chats and every app in one place. Add inflite.ai to your Home Screen."), steps, how, stop, later);
    sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true"); sheet.setAttribute("aria-label", "InFlite is one app now");
    const layer = el("div", "ifa-layer ifl-moved", sheet), was = document.activeElement;
    const shut = () => { document.removeEventListener("keydown", key, true); layer.classList.remove("on"); setTimeout(() => layer.remove(), 320); was?.focus?.({ preventScroll: true }); };
    // (Escape shuts it; Tab and Shift-Tab go round its buttons, never behind it)
    const key = (e) => {
      if (e.key === "Escape") return shut();
      if (e.key !== "Tab") return;
      const f = [how, stop, later].filter((b) => b && !b.hidden && !b.disabled);
      if (!f.length) return;
      e.preventDefault();
      const i = f.indexOf(document.activeElement);
      f[i < 0 ? (e.shiftKey ? f.length - 1 : 0) : (i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus({ preventScroll: true });
    };
    how.onclick = () => { steps.hidden = false; how.hidden = true; later.textContent = "Done"; later.focus({ preventScroll: true }); };
    if (stop) stop.onclick = async () => {
      stop.disabled = true; stop.textContent = "Turning Off…";
      const done = await Promise.resolve().then(off).then(() => true, () => false);
      if (done) { shut(); note(app, "Notifications off here", "They come to InFlite instead, once it’s on your Home Screen"); }
      else { stop.disabled = false; stop.textContent = "Turn Off Notifications Here"; }
    };
    later.onclick = shut;
    layer.addEventListener("pointerdown", (e) => { if (e.target === layer) shut(); });
    document.addEventListener("keydown", key, true);
    document.body.append(layer);
    requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add("on")));
    how.focus?.({ preventScroll: true });
  }
  // a plain toast: the words alone, said out, gone in a few seconds
  let toastEl = null, toastT = 0;
  function toast(text) {
    toastEl?.remove();
    clearTimeout(toastT);
    const t = toastEl = el("div", "ifm-note ifl-toast", el("span", "ifm-note-tx", el("b", "", text)));
    document.body.append(t);
    if (!sayEl.isConnected) document.body.append(sayEl);
    sayEl.textContent = "";
    requestAnimationFrame(() => requestAnimationFrame(() => { if (toastEl !== t) return; t.classList.add("on"); sayEl.textContent = text; }));
    toastT = setTimeout(() => { t.classList.remove("on"); sayEl.textContent = ""; setTimeout(() => t.remove(), 400); }, 3600);
  }
  // (sent from Chats' own sheet, and back: said once, here)
  if (hub.on) {
    let said = null;
    try { said = store()?.getItem(SENT); store()?.removeItem(SENT); } catch (_) {}
    if (said) toast(stillHere(String(said).slice(0, 200)));
  }

  // ---- Something went wrong: the window every app shows when it breaks, each issue its own code ----
  // What broke in this app's own code (an error nothing caught, a promise that failed with a real bug in it), or an API of
  // the site's that failed and said under what code (the site files those itself: functions/_bugs.js), shown once a page
  // in a window that can be screenshotted as it is: the code (IF-, the app's letter, five more: the same for the same bug
  // every time, as functions/_bugs.js works it out), what happened in a line, the app and its version, the page, when,
  // the device, and Send to InFlite, which files it (POST /api/bugs) for a GitHub Action to make an issue of, where it's
  // fixed. Report a Problem (the menu's last row) opens it for anything else. Never anything of what's on the screen or
  // anyone's words: the page's path alone, an error's words with addresses, numbers and anything like a key taken out.
  //   bug({ words, where, kind }) → the window for one an app caught itself; bug.report() → Report a Problem
  const BUG = (() => {
    const ALPHA = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    const LETTER = { chat: "C", chats: "C", weather: "W", fitness: "F", markets: "M", finance: "M", account: "A", auth: "A", hub: "T", mail: "E", email: "E", home: "H", fitting: "P" };
    const HOSTS = { chat: "chat", weather: "weather", fitness: "fitness", finance: "markets", account: "account", auth: "auth", email: "mail", fitting: "fitting" };
    const HUB = { chats: "chats", weather: "weather", fitness: "fitness", markets: "markets", mail: "mail" };
    const NAMES = { chats: "Chats", auth: "Sign in", home: "georgefarrowgreen.com", fitting: "Fit Studio", hub: "InFlite" };
    const same = (s) => String(s || "").toLowerCase().replace(/https?:\/\/\S+/g, "<url>").replace(/[0-9a-f]{8,}/g, "#").replace(/\d+/g, "#")
      .replace(/(["'`]).*?\1/g, "''").replace(/\s+/g, " ").trim().slice(0, 200);
    const fnv = (s) => { let h = 2166136261; for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
    const codeOf = (app, kind, words, where = "") => {
      let h = fnv(`${kind}|${same(words)}|${String(where).replace(/:\d+(:\d+)?$/, "")}`), out = "";
      for (let i = 0; i < 5; i++) { out += ALPHA[h % 32]; h = Math.floor(h / 32); }
      return `IF-${letterOf(app)}-${out}`;
    };
    const scrub = (s, n = 400) => String(s ?? "").replace(/[^\s@]+@[^\s@]+\.[a-z]{2,}/gi, "<email>")
      .replace(/[A-Za-z0-9_\-+/=]{32,}/g, "<long>").replace(/(https?:\/\/[^\s?#]+)[?#]\S*/g, "$1").slice(0, n);
    // (the app it's in: at the hub, the section's (its own page's own app aside); else the app's address, or what it said)
    const appNow = () => {
      const host = HOSTS[location.hostname.split(".")[0]], seg = HUB[location.pathname.split("/")[1]];
      if (seg && !host) return seg;
      return U.app || host || (/georgefarrowgreen|gfg/.test(location.hostname) ? "home" : "hub");
    };
    const letterOf = (a) => LETTER[a] || String(a || "X")[0].toUpperCase();
    const nameOf = (a) => NAMES[a] || NAME[a] || a;
    const device = () => {
      const ua = navigator.userAgent || "";
      const kind = /iPhone/.test(ua) ? "iPhone" : /iPad|Macintosh.*Mobile/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Computer";
      const b = /Edg\/(\d+)/.exec(ua) ? `Edge ${RegExp.$1}` : /Firefox\/(\d+)/.exec(ua) ? `Firefox ${RegExp.$1}` : /CriOS\/(\d+)|Chrome\/(\d+)/.exec(ua) ? `Chrome ${RegExp.$1 || RegExp.$2}` : /Version\/(\d+)[^ ]* .*Safari/.exec(ua) ? `Safari ${RegExp.$1}` : "a browser";
      const home = navigator.standalone === true || (() => { try { return matchMedia("(display-mode: standalone)").matches; } catch (_) { return false; } })();
      return `${kind} · ${b}${home ? " · Home Screen" : ""}`;
    };
    // (where in this site's own code: the file and line, from an error's stack, its other frames for the report)
    const FRAME = /(?:https?:\/\/[^/\s]+)?(\/[^\s():]*\.m?js)(?:\?[^\s():]*)?:(\d+)(?::\d+)?/;
    const frames = (stack) => String(stack || "").split("\n").map((l) => FRAME.exec(l)).filter(Boolean).map((m) => `${m[1]}:${m[2]}`);
    const ours = (stack) => String(stack || "").includes(location.origin);
    const shownNow = new Set();
    let showing = null, count = 0;
    const when = () => { try { return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()); } catch (_) { return new Date().toISOString(); } };
    const reportId = () => [...crypto.getRandomValues(new Uint8Array(6))].map((b) => ALPHA[b % 32]).join("").replace(/^(.{4})/, "$1-");

    function show(r) {
      if (showing || !document.body) return;
      if (r.kind !== "manual" && (shownNow.has(r.code) || ++count > 3)) return;
      shownNow.add(r.code);
      const manual = r.kind === "manual", app = r.app, ver = r.version;
      const facts = [["App", `${nameOf(app)}${ver ? " " + ver : ""}`], ["Page", r.path || "/"], ["When", r.when], ["Device", r.device]];
      if (!manual && r.words) facts.push(["What", r.words + (r.where ? `\n${r.where}` : "")]);
      facts.push(["Report", r.id]);
      const dl = el("dl", "ifb-facts", ...facts.flatMap(([k, v]) => [el("dt", "", k), el("dd", k === "What" ? "ifb-tech" : "", v)]));
      const head = el("div", "ifb-head"); head.innerHTML = svg("warn", "ifb-ic");
      const title = el("b", "", manual ? "Report a Problem" : "Something went wrong"); title.id = "ifb-t"; head.append(title);
      const note = el("textarea", "ifb-note"); note.rows = 2; note.maxLength = 1000;
      note.placeholder = manual ? "What’s wrong? What were you doing?" : "What were you doing? (if you like)"; note.setAttribute("aria-label", note.placeholder);
      const send = el("button", "ifb-btn ifb-go", "Send to InFlite"), copy = el("button", "ifb-btn", "Copy"), shut = el("button", "ifb-btn", "Close");
      for (const b of [send, copy, shut]) b.type = "button";
      const said = el("p", "ifb-said"); said.setAttribute("role", "status");
      const box = el("div", "ifb",
        head, el("p", "ifb-code", r.code),
        el("p", "ifb-say", manual ? "Say what’s wrong, and send it with this code. A screenshot of the screen it’s on helps too."
          : "InFlite hit a problem it didn’t expect. Send it on and it’ll be looked into: the code says which."),
        dl, note, el("p", "ifb-who", "What you write here is read by InFlite’s owner alone."), el("div", "ifb-acts", send, copy, shut), said);
      box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-labelledby", "ifb-t");
      const layer = el("div", "ifb-layer", box);
      const text = () => [`${manual ? "Problem report" : "Bug report"} ${r.code}`, ...facts.map(([k, v]) => `${k}: ${String(v).replace(/\n/g, " · ")}`), note.value.trim() ? `Note: ${note.value.trim()}` : ""].filter(Boolean).join("\n");
      const done = () => { layer.remove(); document.removeEventListener("keydown", key, true); showing = null; };
      const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); done(); } };
      shut.onclick = done;
      layer.addEventListener("pointerdown", (e) => { if (e.target === layer) done(); });
      copy.onclick = async () => { try { await navigator.clipboard.writeText(text()); said.textContent = "Copied."; } catch (_) { said.textContent = "Couldn’t copy: a screenshot works as well."; } };
      send.onclick = async () => {
        if (manual && !note.value.trim()) { said.textContent = "Say what’s wrong first."; note.focus(); return; }
        send.disabled = true; said.textContent = "Sending…";
        try {
          const res = await (fetch.__iflReal || fetch)("/api/bugs", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({ code: r.code, app, kind: r.kind, version: ver, words: r.words, where: r.where, stack: r.stack, path: r.path, device: r.device, note: note.value.trim() }) });
          if (!res.ok) throw new Error(String(res.status));
          send.textContent = "Sent"; said.textContent = "Sent. Thank you: it’ll be looked into.";
        } catch (_) { send.disabled = false; said.textContent = "That didn’t send. Try again, or screenshot this and send it on."; }
      };
      document.body.append(layer);
      document.addEventListener("keydown", key, true);
      showing = layer;
      (manual ? note : shut).focus({ preventScroll: true });
    }
    // one this app caught, or found: { words, where, stack, kind, code }
    function bug(o = {}) {
      try {
        const app = appNow(), kind = o.kind || "crash", words = scrub(o.words, 300), where = scrub(o.where, 160);
        show({ code: o.code || codeOf(app, kind, words, where), app, kind, version: U.build || "", words, where, stack: scrub(o.stack, 1500),
          path: location.pathname, when: when(), device: device(), id: reportId() });
      } catch (_) {}
    }
    bug.report = () => { try { const app = appNow(); show({ code: `IF-${letterOf(app)}-R${reportId().replace("-", "").slice(0, 4)}`, app, kind: "manual", version: U.build || "", path: location.pathname, when: when(), device: device(), id: reportId() }); } catch (_) {} };
    bug.code = codeOf;
    // (once a page, whichever copy of the menu runs first)
    if (typeof window !== "undefined" && typeof addEventListener === "function" && !window.__iflBugs) {
      window.__iflBugs = true;
      addEventListener("error", (e) => {
        if (!(e instanceof ErrorEvent) || !e.filename || !e.filename.startsWith(location.origin)) return;
        const m = String(e.message || "");
        if (/^(Uncaught )?Script error\.?$/i.test(m) || /ResizeObserver loop/i.test(m)) return;
        const st = e.error?.stack || "", where = frames(st)[0] || `${new URL(e.filename).pathname}:${e.lineno || 0}`;
        bug({ words: e.error ? `${e.error.name || "Error"}: ${e.error.message || m}` : m, where, stack: frames(st).slice(0, 8).join("\n") });
      });
      addEventListener("unhandledrejection", (e) => {
        const r = e.reason;
        // (a real bug only: a mistake in the code, never a request that failed, was called off or met no signal)
        if (!(r instanceof Error) || !/^(TypeError|ReferenceError|RangeError|SyntaxError)$/.test(r.name) || !navigator.onLine) return;
        if (/fetch|load failed|network|abort/i.test(r.message) || !ours(r.stack)) return;
        bug({ words: `${r.name}: ${r.message}`, where: frames(r.stack)[0] || "", stack: frames(r.stack).slice(0, 8).join("\n") });
      });
      // (an API of the site's that failed, and said under what code it's filed: its window, for the person to send theirs)
      const real = window.fetch;
      if (typeof real === "function" && !real.__iflReal) {
        const watched = function (input) {
          const p = real.apply(globalThis, arguments);
          p.then((res) => {
            try {
              if (res.status < 500) return;
              const u = new URL(res.url || input?.url || String(input), location.href);
              if (u.origin !== location.origin || !u.pathname.startsWith("/api/") || u.pathname === "/api/bugs") return;
              res.clone().json().then((j) => { if (typeof j?.code === "string" && /^IF-S-[0-9A-Z]{5}$/.test(j.code)) bug({ kind: "server", code: j.code, words: j.error || `The server said ${res.status}`, where: u.pathname }); }).catch(() => {});
            } catch (_) {}
          }, () => {});
          return p;
        };
        watched.__iflReal = real;
        window.fetch = watched;
      }
    }
    bug.app = appNow;
    return bug;
  })();

  // ---- Something's wrong with this app: a slim banner under its header while status.inflite.ai has an incident going on
  // that touches it, or maintenance (the site's functions/_status.js bannerFor, asked at this app's own address, as
  // /api/status-banner), linking there. Asked a moment after the page opens and every five minutes it's on screen; one
  // closed stays closed for the visit; gone by itself when the incident is ----
  const BANNER = (() => {
    if (typeof window === "undefined" || typeof document === "undefined" || typeof addEventListener !== "function" || typeof fetch !== "function") return null;
    let now = null, el = null, off = false, gone = new Set();
    try { gone = new Set(JSON.parse(sessionStorage.getItem("ifl-sb") || "[]")); } catch (_) {}
    const hhmm = (t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const place = () => {
      if (!now || gone.has(now.id)) { el?.remove(); return; }
      const hd = [...document.querySelectorAll(".ifh")].find((x) => x.offsetParent !== null || x.getClientRects().length);
      if (!el) {
        el = document.createElement("div"); el.className = "ifl-sb"; el.setAttribute("role", "status");
        el.addEventListener("click", (e) => {
          if (e.target.closest(".ifl-sb-x")) { gone.add(now.id); try { sessionStorage.setItem("ifl-sb", JSON.stringify([...gone])); } catch (_) {} el.remove(); return; }
          if (now?.url) window.open(now.url, "_blank", "noopener");
        });
      }
      const maint = now.kind === "maint";
      el.dataset.k = now.kind;
      el.innerHTML = `<span class="ifl-sb-dot" aria-hidden="true"></span><span class="ifl-sb-t"><b>${esc(maint ? `Maintenance: ${now.title}` : now.title)}</b><small>${esc(maint ? `Until ${hhmm(now.until)}${now.text ? ` · ${now.text}` : ""}` : now.text || "Being looked into.")}</small></span>`
        + `<span class="ifl-sb-go">Status${svg("chev")}</span><button type="button" class="ifl-sb-x" aria-label="Hide this">${svg("x")}</button>`;
      if (hd) { if (el.previousElementSibling !== hd) hd.after(el); el.classList.remove("float"); }
      else { if (el.parentNode !== document.body) document.body.prepend(el); el.classList.add("float"); }
    };
    const ask = async () => {
      if (off || document.visibilityState === "hidden") return;
      try {
        const r = await (fetch.__iflReal || fetch)(`/api/status-banner?app=${encodeURIComponent(BUG.app ? BUG.app() : "hub")}`, { credentials: "same-origin", headers: { Accept: "application/json" } });
        if (r.status === 404) { off = true; return; }
        if (!r.ok) return;
        now = (await r.json())?.banner || null;
        place();
      } catch (_) {}
    };
    // (timers that never keep anything running that would otherwise end: a test's stand-in window, under Node)
    const loose = (t) => (t && typeof t.unref === "function" ? t.unref() : t);
    loose(setTimeout(ask, 2500));
    loose(setInterval(ask, 5 * 60e3));
    // (an app that draws its header anew: put back under it)
    loose(setInterval(() => { if (now) place(); }, 3000));
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") ask(); });
    return { ask, place };
  })();

  const api = { bug: BUG, banner: BANNER, header, headerHtml, watch, settle, glyph, APPS, NAME, menu, close, redraw, isOpen: () => !!open, built, note, iconUrl, allow, wantsAllow,
    updates, offer, here, update: () => apply(true), updateReady: () => !!U.ready, hub };
  // (at the hub, the page's IFL on its window too: so Chat's engine, a frame of this page's, can say it's sent or shut its
  // sheet (parent.IFL.hub.sent(say), parent.IFL.hub.closed(), §8.2), and Today's day and cards find the page's own hub.
  // A const at the top of a module or a script is never the window's own. It can be taken back (configurable), so a
  // page's own global IFL never clashes with it, and one put there first (a test's stand-in) is left as it is)
  if (hub.on && typeof window !== "undefined") try { Object.defineProperty(window, "IFL", { value: api, configurable: true, writable: true }); } catch (_) {}
  return api;
})();
