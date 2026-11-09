// Start before the first paint. The page itself remains the fallback if this script cannot run.
// The approved portrait is decoration: it never decides how long someone waits for the page.
(() => {
  const root = document.documentElement;
  if (root.classList.contains("back-on") || /^#signedin(?![\w-])/.test(location.hash) ||
      performance.getEntriesByType?.("navigation")[0]?.type === "back_forward") return;

  let active = true, mounted = false, revealed = false, engine = null, overlay = null, finishTimer = null, starting = false;
  let exitTimer = null, headExit = null, portraitFrame = 0, portraitShown = false, quick = false;
  let restore = [], wasBusy = null, busyTarget = null, watch = null, appReady;
  const app = new Promise(resolve => { appReady = resolve; });
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const image = new Image(720, 720);
  image.alt = ""; image.className = "loader-image"; image.decoding = "async"; image.fetchPriority = "low";
  const cleanup = () => {
    clearTimeout(finishTimer);
    clearTimeout(exitTimer); cancelAnimationFrame(portraitFrame);
    headExit?.cancel(); headExit = null;
    engine?.destroy(); engine = null;
    overlay?.remove(); overlay = null;
    root.classList.remove("intro-revealing", "intro-mounted", "intro-exiting", "intro-fast");
    motion.removeEventListener("change", changedMotion);
    watch?.disconnect(); watch = null;
    document.removeEventListener("load", checkMount, true);
    removeEventListener("loaderportraitready", startPortrait);
    removeEventListener("keydown", skip);
    removeEventListener("pagehide", leave);
    removeEventListener("pageshow", restored);
    image.onerror = null;
  };
  function revealPage(immediate = false) {
    if (revealed) { if (immediate) cleanup(); return; }
    revealed = true; clearTimeout(exitTimer);
    root.classList.remove("intro-loading", "intro-exiting");
    for (const [node, inert] of restore) node.inert = inert;
    restore = [];
    if (busyTarget) {
      if (wasBusy === null) busyTarget.removeAttribute("aria-busy");
      else busyTarget.setAttribute("aria-busy", wasBusy);
    }
    // A keyboard skip returns focus to the content, without moving the page or losing it in a removed button.
    if (overlay?.contains(document.activeElement)) {
      const page = document.getElementById("page");
      page?.setAttribute("tabindex", "-1"); page?.focus({ preventScroll: true });
      page?.addEventListener("blur", () => page.removeAttribute("tabindex"), { once: true });
    }
    overlay?.setAttribute("aria-hidden", "true");
    if (overlay) overlay.inert = true;
    dispatchEvent(new Event("home:revealed"));
    if (immediate || !mounted) { cleanup(); return; }
    root.classList.add("intro-revealing");
    finishTimer = setTimeout(cleanup, motion.matches ? 130 : quick ? 170 : 230);
  }
  function dismiss(immediate = false) {
    if (!active) { if (immediate) revealPage(true); return; }
    active = false; clearTimeout(limit); cancelAnimationFrame(portraitFrame);
    engine?.stop();
    quick = !portraitShown;
    if (immediate || !mounted) { revealPage(true); return; }
    if (quick) { root.classList.add("intro-fast"); revealPage(); return; }
    const portrait = document.getElementById("loader-portrait");
    const opacity = getComputedStyle(portrait).opacity;
    root.classList.add("intro-exiting");
    // The black backdrop and paused content remain until the head has completely disappeared.
    const duration = motion.matches ? 60 : 140;
    try {
      headExit = portrait.animate([{ opacity }, { opacity: 0 }], { duration, easing: "ease-out", fill: "forwards" });
      headExit.finished.then(() => revealPage(), () => {});
      exitTimer = setTimeout(() => { headExit?.finish(); revealPage(); }, duration + 80);
    } catch (_) { revealPage(); }
  }
  function skip(e) { if (e.key === "Escape") dismiss(); }
  function leave() { dismiss(true); }
  function restored(e) { if (e.persisted) dismiss(true); }
  function changedMotion() {
    engine?.motion();
    if (!active && motion.matches) revealPage(true);
  }
  // A failed API, missing app script or lost connection cannot leave the content behind a curtain.
  const limit = setTimeout(() => dismiss(), 4000);
  window.homeLoader = {
    ready(words) {
      Promise.resolve(words).catch(() => {}).then(appReady);
      // app.js runs at the body's end: don't wait for an optional deferred renderer to download.
      mount();
    },
    dismiss,
  };
  root.classList.add("intro-loading");
  addEventListener("pagehide", leave);
  addEventListener("pageshow", restored);
  addEventListener("keydown", skip);
  motion.addEventListener("change", changedMotion);
  addEventListener("loaderportraitready", startPortrait);
  image.onerror = () => dismiss();
  image.src = "/loading/contour-head-v1.avif";

  function checkMount() {
    if (!active || mounted || !document.getElementById("page") || !document.getElementById("bar")) return;
    const node = document.getElementById("site-loader");
    if (node && getComputedStyle(node).position === "fixed") mount();
  }
  function startPortrait() {
    if (!active || !mounted || starting || !window.createLoaderPortrait) return;
    starting = true;
    const portrait = document.getElementById("loader-portrait"), canvas = document.getElementById("loader-canvas");
    canvas.addEventListener("loaderportraiterror", () => {
      portrait.classList.remove("ready"); engine?.destroy(); engine = null;
    }, { once: true });
    window.createLoaderPortrait(canvas, image, () => motion.matches).then(value => {
      if (!active) { value.destroy(); return; }
      engine = value; portrait.classList.add("ready"); value.start();
    }).catch(() => { /* Static red contour art remains if WebGL is unavailable. */ });
  }
  async function mount() {
    if (!active || mounted) return;
    try {
      overlay = document.getElementById("site-loader");
      const portrait = document.getElementById("loader-portrait"), canvas = document.getElementById("loader-canvas");
      if (!overlay || !portrait || !canvas || getComputedStyle(overlay).position !== "fixed") return dismiss(true);
      watch?.disconnect(); watch = null;
      document.removeEventListener("load", checkMount, true);
      mounted = true; overlay.hidden = false;
      portrait.prepend(image); root.classList.add("intro-mounted");
      // Let already-ready pages begin their reveal before the decorative head's first visible frame.
      image.decode().then(() => {
        if (!active) return;
        portraitFrame = requestAnimationFrame(() => {
          portraitFrame = requestAnimationFrame(() => {
            if (!active) return;
            portraitShown = true; portrait.classList.add("shown");
          });
        });
      }).catch(() => {});
      busyTarget = document.getElementById("page");
      wasBusy = busyTarget.getAttribute("aria-busy"); busyTarget.setAttribute("aria-busy", "true");
      restore = [document.getElementById("bar"), document.getElementById("page")].filter(Boolean).map(node => [node, node.inert]);
      for (const [node] of restore) node.inert = true;
      document.getElementById("loader-skip")?.addEventListener("click", () => dismiss());
      // GPU setup and this image's decode run alongside readiness, never on its critical path.
      startPortrait();
      const cover = document.querySelector("#cover img");
      const photo = cover ? cover.decode().catch(() => {}) : Promise.resolve();
      const font = document.fonts?.load('700 1em "Space Grotesk"').catch(() => {});
      await Promise.all([photo, font, app]);
      dismiss();
    } catch (_) { dismiss(true); }
  }
  // Mount as the parser supplies the content, even if a later application script stalls.
  if (typeof MutationObserver === "function") {
    watch = new MutationObserver(checkMount);
    watch.observe(root, { childList: true, subtree: true });
    document.addEventListener("load", checkMount, true);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
