// Applies this phone's appearance (Account → Appearance) before the page is
// drawn, so it never flashes the wrong colours. Light unless chosen otherwise.
(function () {
  var t = "light";
  try { t = localStorage.getItem("inflight-theme") || "light"; } catch (e) { /* storage blocked: stay light */ }
  if (t !== "dark" && t !== "auto") t = "light";
  var root = document.documentElement;
  root.setAttribute("data-theme", t);
  // the browser bar matches the page
  var dark = t === "dark" || (t === "auto" && window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
  var m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute("content", dark ? "#1c1c1f" : "#f2f2f7");
  // InFlight is for phones and iPads. An iPad asks for desktop sites, calling
  // itself a Mac, but a Mac has no touchscreen. Anything else (a computer) is
  // shown a page saying InFlight isn't available, and the app never starts.
  var ua = navigator.userAgent || "";
  var mobile = /iPhone|iPod|iPad|Android|Mobile/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (!mobile) root.setAttribute("data-device", "computer");
})();
