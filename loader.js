// Set the initial paper colour before the document paints. A missing or delayed
// application bundle must never strand the visitor behind the opening.
(() => {
  if (location.hash || matchMedia("(prefers-reduced-motion: reduce)").matches ||
      performance.getEntriesByType("navigation")[0]?.type === "back_forward") return;
  const root = document.documentElement;
  root.classList.add("photo-wait");
  setTimeout(() => root.classList.remove("photo-wait"), 1800);
})();
