// The page for an address that isn't one (404.html): it says which address that was, and the photo fades in once it's
// there rather than appearing.
const where = document.getElementById("where");
const path = decodeURIComponentSafe(location.pathname);
if (path && path !== "/") where.textContent = location.host + path;
const img = document.querySelector(".bg img");
if (img.complete && img.naturalWidth) img.classList.add("loaded");
else img.addEventListener("load", () => img.classList.add("loaded"), { once: true });

function decodeURIComponentSafe(s) {
  try { return decodeURIComponent(s); } catch (_) { return s; }
}
