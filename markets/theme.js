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
// Light or Dark, as your account has it (app.js remembers it in this browser), set as the page is read, before it's first
// drawn, and the browser's bar with it. (Automatic needs nothing: the stylesheet follows the device. A file of its own:
// the page's rules run no script written in it)
try {
  const t = localStorage.getItem("markets:appearance");
  if (t === "light" || t === "dark") {
    document.documentElement.dataset.theme = t;
    for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.setAttribute("content", t === "dark" ? "#101210" : "#f8f9f6");
  }
} catch (_) {}
// Back from signing in on the account's page (#signin=…): its sky from the very first frame (styles.css html.arriving),
// until app.js clears it
try { if (/^#signin=/.test(location.hash)) document.documentElement.classList.add("arriving"); } catch (_) {}
// Your list and its prices, asked for as the page is read: on its way while the app's code loads, not after
// (account.js me takes it up). Not when back from signing in: that's asked for otherwise.
try {
  if (!/^#signin=/.test(location.hash)) {
    const stop = new AbortController(); setTimeout(() => stop.abort(), 20000);
    window.mkEarly = fetch("/api/markets/me", { credentials: "same-origin", signal: stop.signal });
    window.mkEarly.catch(() => {});
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
