// Set the initial paper colour before the document paints. A missing or delayed
// application bundle must never strand the visitor behind the opening.
(() => {
  const root = document.documentElement;
  const key = "gfg-bio-theme";
  const system = matchMedia("(prefers-color-scheme: dark)");
  const themeColor = document.querySelector('meta[name="theme-color"]');
  let choice;
  try { choice = localStorage.getItem(key); } catch (_) {}
  let toggle;
  function apply() {
    const theme = choice === "light" || choice === "dark" ? choice : system.matches ? "dark" : "light";
    root.dataset.theme = theme;
    if (themeColor) themeColor.content = theme === "dark" ? "#181818" : "#f4f4f2";
    if (toggle) {
      toggle.setAttribute("aria-checked", String(theme === "dark"));
      toggle.title = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
    }
  }
  apply();
  system.addEventListener("change", apply);
  addEventListener("storage", event => {
    if (event.key === key || event.key === null) {
      try { choice = localStorage.getItem(key); } catch (_) {}
      apply();
    }
  });
  document.addEventListener("DOMContentLoaded", () => {
    toggle = document.getElementById("fi-theme");
    if (!toggle) return;
    apply();
    toggle.hidden = false;
    toggle.addEventListener("click", () => {
      choice = root.dataset.theme === "dark" ? "light" : "dark";
      apply();
      try { localStorage.setItem(key, choice); } catch (_) {}
    });
  }, {once: true});

  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let active;

  function route(url) {
    if (!url) return null;
    const target = new URL(url);
    if (target.origin !== location.origin) return null;
    if (target.pathname === "/" || target.pathname === "/index.html") return "bio";
    if (/^\/contact(?:\/|\/index\.html)?$/.test(target.pathname)) return "contact";
    return null;
  }

  // Cross-origin account discovery can discard the outgoing snapshot.
  // Mark just the journey back to the bio, in this tab, before the browser leaves.
  const returnKey = "gfg-contact-return";
  const onBio = route(location.href) === "bio";
  const positionKey = "gfg-contact-origin-y";
  const fromBio = route(document.referrer) === "bio";
  function rememberPosition() {
    try { sessionStorage.setItem(positionKey, String(scrollY)); } catch (_) {}
  }
  function markReturn(restorePosition) {
    try {
      const position = restorePosition && fromBio ? sessionStorage.getItem(positionKey) : null;
      sessionStorage.setItem(returnKey, JSON.stringify({ at: Date.now(), y: position === null ? null : Number(position) }));
    } catch (_) {}
  }
  window.navigation?.addEventListener("navigate", event => {
    const to = route(event.destination.url);
    if (onBio && to === "contact") rememberPosition();
    if (!onBio && to === "bio") markReturn(event.navigationType === "traverse");
  });
  document.addEventListener("click", event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const link = event.target.closest?.("a[href]");
    if (onBio && link && route(link.href) === "contact") rememberPosition();
    if (!onBio && link?.closest(".mast")) markReturn(link.matches(".back"));
  }, true);
  function takeReturn() {
    if (!onBio) return null;
    try {
      const saved = JSON.parse(sessionStorage.getItem(returnKey));
      sessionStorage.removeItem(returnKey);
      return saved && Date.now() - saved.at < 30000 ? saved : null;
    } catch (_) { return null; }
  }
  function revealReturn() {
    if (reduced.matches) return;
    root.classList.add("contact-return");
    setTimeout(() => root.classList.remove("contact-return"), 650);
  }
  const returning = takeReturn();
  if (returning) {
    revealReturn();
    // Account discovery may have replaced the history entry and its scroll offset.
    if (Number.isFinite(returning.y)) document.addEventListener("DOMContentLoaded", () => {
      scrollTo({ top: returning.y, behavior: "instant" });
    }, { once: true });
  }

  addEventListener("pagereveal", event => {
    const transition = event.viewTransition;
    const restoredReturn = takeReturn();
    if (!transition) {
      if (restoredReturn) revealReturn();
      return;
    }
    root.classList.remove("contact-return");
    const from = route(window.navigation?.activation?.from?.url || document.referrer);
    const to = route(location.href);
    if (reduced.matches || !to || from === to) {
      transition.skipTransition();
      return;
    }
    active = transition;
    root.classList.add("contact-handoff", "contact-settled");
    root.classList.toggle("to-bio", to === "bio");
    transition.finished.finally(() => {
      if (active !== transition) return;
      active = undefined;
      root.classList.remove("contact-handoff", "to-bio");
    });
  });
  reduced.addEventListener("change", () => { if (reduced.matches) active?.skipTransition(); });

  if (returning || route(document.referrer) === "contact" || route(location.href) !== "bio" ||
      location.hash || reduced.matches || performance.getEntriesByType("navigation")[0]?.type === "back_forward") return;
  root.classList.add("photo-wait");
  setTimeout(() => root.classList.remove("photo-wait"), 1800);
})();
