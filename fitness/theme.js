// ==== InFlite motion: shared lifecycle ====
// Pause presentation motion before first paint and while the page is in the app
// switcher. This does not pause data, requests, navigation or authentication.
(() => {
  const doc = globalThis.document, root = doc?.documentElement;
  if (!root?.toggleAttribute || globalThis.__iflMotionReady) return;
  globalThis.__iflMotionReady = true;
  const sync = () => root.toggleAttribute("data-motion-paused", doc.visibilityState === "hidden");
  doc.addEventListener?.("visibilitychange", sync);
  globalThis.addEventListener?.("pagehide", () => root.toggleAttribute("data-motion-paused", true));
  globalThis.addEventListener?.("pageshow", sync);
  sync();
})();
// ==== End InFlite motion ====
// ==== InFlite page zoom: shared guard ====
// InFlite's page zoom policy. Runs before sign-in and independently of the menu.
// Components such as maps and photo viewers retain their own gesture handling.
(() => {
  if (globalThis.__iflZoomBlocked) return;
  globalThis.__iflZoomBlocked = true;
  for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
    document.addEventListener(type, (event) => event.preventDefault(), { passive: false });
  }
  document.addEventListener("touchmove", (event) => {
    if (event.touches?.length > 1) event.preventDefault();
  }, { passive: false });
})();
// ==== End InFlite page zoom ====
// Light or Dark, as chosen in Settings (app.js remembers it in this browser), set as the page is read, before it's first
// drawn, and the browser's bar with it. (Automatic needs nothing: the stylesheet follows the device. A file of its own:
// the page's rules run no script written in it)
try {
  const t = localStorage.getItem("fitness:appearance");
  if (t === "light" || t === "dark") {
    document.documentElement.dataset.theme = t;
    for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.setAttribute("content", t === "dark" ? "#101210" : "#f8f9f6");
  }
} catch (_) {}
// Back from signing in on the account's page (#signin=…): the page's last picture, its sky and you, from the very first
// frame (styles.css html.arriving), until app.js puts up its own copy of it (arriving), as Chat's does. You: the
// initial and the small copy of your photo the page sent in the # (f, p), the photo made a blob: here
try {
  if (/^#signin=/.test(location.hash)) {
    const root = document.documentElement, q = new URLSearchParams(location.hash.slice(1)), f = q.get("f") || "", p = q.get("p") || "";
    root.classList.add("arriving");
    if (Array.from(f).length === 1 && !/[\s"'\\]/.test(f)) { root.style.setProperty("--arv-i", JSON.stringify(f)); root.classList.add("arv-face"); }
    if (/^[A-Za-z0-9_-]{200,60000}$/.test(p)) {
      const bin = atob(p.replace(/-/g, "+").replace(/_/g, "/")), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      window.arvPhoto = URL.createObjectURL(new Blob([u], { type: "image/jpeg" }));
      root.style.setProperty("--arv-p", `url("${window.arvPhoto}")`); root.style.setProperty("--arv-i", '""'); root.classList.add("arv-face");
    }
  }
} catch (_) { /* no picture of you: the sky alone */ }
// What's changed in your account since this phone's copy of it, asked for as the page is read: on its way while the
// app's code loads, not after (account.js me takes it up; app.js keeps the copy's time, fitness:meAt). Not when back
// from signing in: that's asked for otherwise.
try {
  if (!/^#signin=/.test(location.hash)) {
    const k = JSON.parse(localStorage.getItem("fitness:meAt") || "null"), since = k && Number.isFinite(k.at) ? Math.round(k.at) : null;
    // (given up on after 20 seconds: one that hangs mustn't hold up every later sync this session)
    const stop = new AbortController(); setTimeout(() => stop.abort(), 20000);
    // (as account.js meQuery asks it: InFlite Today's own rides among the plans, and the rides' times by this phone's days)
    let tz = ""; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (_) {}
    window.fxEarly = { since, today: true, got: fetch(`/api/fitness/me?${since ? `since=${since}&` : ""}today=1${tz ? `&tz=${encodeURIComponent(tz)}` : ""}`, { credentials: "same-origin", signal: stop.signal }) };
    window.fxEarly.got.catch(() => {});   // (offline, or not taken up: no matter, it's asked again)
  }
} catch (_) {}

// ==== Bio arrival ====
// Continue the bio's icon transition over this app's own, already-selected appearance.
// A pseudo-element cover is bounded by CSS as well as script: it can never hold an app behind a failed request.
(() => {
  const root = document.documentElement;
  let source;
  try { source = new URL(document.referrer); } catch (_) { return; }
  if (!/^(www\.)?georgefarrowgreen\.com$/.test(source.hostname) || window.top !== window ||
      performance.getEntriesByType?.('navigation')[0]?.type === 'back_forward' ||
      matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const icon = document.querySelector('link[rel="apple-touch-icon"]');
  if (icon) root.style.setProperty('--bio-entry-icon', `url(${JSON.stringify(icon.href)})`);
  root.classList.add('bio-arrival');
  let end, safety;
  function clean() {
    clearTimeout(end); clearTimeout(safety);
    root.classList.remove('bio-arrival', 'bio-arrived'); root.style.removeProperty('--bio-entry-icon');
    removeEventListener('pagehide', clean); removeEventListener('pageshow', restored);
    document.removeEventListener('visibilitychange', visibility); document.removeEventListener('focusin', clean);
    document.removeEventListener('pointerdown', clean);
  }
  function ready() { if (!root.classList.contains('bio-arrival')) return; root.classList.add('bio-arrived'); end = setTimeout(clean, 360); }
  function restored(e) { if (e.persisted) clean(); }
  function visibility() { if (document.hidden) clean(); }
  addEventListener('pagehide', clean); addEventListener('pageshow', restored);
  document.addEventListener('visibilitychange', visibility); document.addEventListener('focusin', clean);
  document.addEventListener('pointerdown', clean, { passive: true });
  safety = setTimeout(clean, 1400);
  const paint = () => requestAnimationFrame(() => requestAnimationFrame(ready));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paint, { once: true }); else paint();
})();
// ==== End Bio arrival ====
