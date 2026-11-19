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
    const menu = document.querySelector(".fi-menu");
    if (menu) {
      const button = menu.querySelector(".fi-menubtn");
      const links = menu.querySelector("nav");
      function setMenu(open) {
        links.inert = !open;
        button.setAttribute("aria-expanded", String(open));
      }
      menu.hidden = false;
      button.addEventListener("click", () => setMenu(links.inert));
      links.addEventListener("click", event => {
        if (event.target.closest("a, [data-contact]")) setMenu(false);
      });
      document.addEventListener("pointerdown", event => {
        if (!menu.contains(event.target)) setMenu(false);
      });
      menu.addEventListener("focusout", event => {
        if (!menu.contains(event.relatedTarget)) setMenu(false);
      });
      menu.addEventListener("keydown", event => {
        if (event.key === "Escape" && !links.inert) {
          setMenu(false);
          button.focus();
        }
      });
    }
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

  // Remember the contact journey in this tab, including its scroll position.
  const returnKey = "gfg-contact-return";
  const onBio = route(location.href) === "bio";
  const onContact = route(location.href) === "contact";
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
    if (onContact && to === "bio") markReturn(event.navigationType === "traverse");
  });
  document.addEventListener("click", event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const link = event.target.closest?.("a[href]");
    if (onBio && link && route(link.href) === "contact") rememberPosition();
    if (onContact && link?.closest(".mast") && route(link.href) === "bio") markReturn(link.matches(".back"));
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
  function takePhotoReturn() {
    if (!onBio) return null;
    try {
      const saved = JSON.parse(sessionStorage.getItem("gfg-photo-return"));
      sessionStorage.removeItem("gfg-photo-return");
      if (!saved || Date.now() - saved.at > 15000 || location.hash) return null;
      const navigation = performance.getEntriesByType("navigation")[0];
      if (navigation && navigation.type !== "navigate") return null;
      if (document.referrer) {
        const previous = new URL(document.referrer);
        if (previous.origin !== location.origin || previous.pathname !== saved.from) return null;
      }
      return saved;
    } catch (_) { return null; }
  }
  const photoReturn = takePhotoReturn();
  const returning = takeReturn();
  let handledPhotos = reduced.matches;
  function photoWindows() {
    if (!photoReturn || reduced.matches || Math.abs(innerWidth - photoReturn.width) > 2 ||
        photoReturn.frames?.length !== 2) return null;
    const windows = photoReturn.frames.map((frame, i) => {
      if (!frame) return null;
      const win = document.querySelector(`[data-scene="${i}"]:not([hidden]) .fi-window`);
      return win?.firstElementChild?.getAttribute("src") === frame.src &&
        frame.width > 0 && frame.height > 0 && frame.y < innerHeight && frame.y + frame.height > 0 ? win : null;
    });
    return windows.every(Boolean) ? windows : null;
  }
  if (photoReturn && !reduced.matches) {
    // Include the gallery in the first native snapshot even when the HTML arrives in chunks.
    const expect = document.createElement("link");
    expect.rel = "expect";
    expect.href = "#projects";
    expect.setAttribute("blocking", "render");
    document.head.append(expect);
    document.addEventListener("DOMContentLoaded", () => requestAnimationFrame(() => {
      if (handledPhotos) return;
      handledPhotos = true;
      const windows = photoWindows();
      if (windows) document.dispatchEvent(new CustomEvent("gfg-photo-return", { detail: { frames: photoReturn.frames, windows } }));
    }), { once: true });
  }
  if (returning && !photoReturn) {
    revealReturn();
    // Account discovery may have replaced the history entry and its scroll offset.
    if (Number.isFinite(returning.y)) {
      const previousMode = history.scrollRestoration;
      history.scrollRestoration = "manual";
      const restore = () => scrollTo({ top: returning.y, behavior: "instant" });
      document.addEventListener("DOMContentLoaded", restore, { once: true });
      addEventListener("pageshow", () => requestAnimationFrame(() => {
        restore();
        history.scrollRestoration = previousMode;
      }), { once: true });
    }
  }

  addEventListener("pagereveal", event => {
    const transition = event.viewTransition;
    const restoredReturn = takeReturn();
    if (!transition) {
      if (restoredReturn) revealReturn();
      return;
    }
    // A cross-document transition can be skipped or superseded by another navigation.
    transition.ready.catch(() => {});
    root.classList.remove("contact-return");
    if (photoReturn && !handledPhotos) {
      handledPhotos = true;
      const windows = photoWindows();
      if (!windows) { transition.skipTransition(); return; }
      // Paint each original photograph once inside its travelling frame. Blending two
      // cropped snapshots here would briefly double the rider as the crop changes.
      const properties = [];
      windows.forEach((win, i) => {
        const image = win.firstElementChild, name = i === 0 ? "road" : "rider";
        for (const [key, value] of Object.entries({ photo: `url(${JSON.stringify(image.src)})`,
          from: photoReturn.frames[i].focus, to: image.dataset.focus || getComputedStyle(image).objectPosition })) {
          const property = `--${name}-${key}`;
          root.style.setProperty(property, value);
          properties.push(property);
        }
      });
      root.classList.add("photo-native");
      active = transition;
      transition.finished.then(() => {
        root.classList.remove("photo-native");
        for (const property of properties) root.style.removeProperty(property);
        if (active === transition) active = undefined;
      });
      return;
    }
    const from = route(window.navigation?.activation?.from?.url || document.referrer);
    const to = route(location.href);
    if (reduced.matches || !to || from === to || (to === "bio" && from !== "contact" && !returning && !restoredReturn)) {
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

  if (photoReturn || returning || route(document.referrer) === "contact" || !onBio ||
      location.hash || reduced.matches || performance.getEntriesByType("navigation")[0]?.type === "back_forward") return;
  root.classList.add("photo-wait");
  setTimeout(() => root.classList.remove("photo-wait"), 1800);
})();
