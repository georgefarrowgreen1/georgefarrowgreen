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

  if (location.hash || matchMedia("(prefers-reduced-motion: reduce)").matches ||
      performance.getEntriesByType("navigation")[0]?.type === "back_forward") return;
  root.classList.add("photo-wait");
  setTimeout(() => root.classList.remove("photo-wait"), 1800);
})();
