// Light or Dark, as chosen in Settings (app.js remembers it in this browser), set as the page is read, before it's first
// drawn, and the browser's bar with it. (Automatic needs nothing: the stylesheet follows the device. A file of its own:
// the page's rules run no script written in it)
try {
  const t = localStorage.getItem("fitness:appearance");
  if (t === "light" || t === "dark") {
    document.documentElement.dataset.theme = t;
    for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.setAttribute("content", t === "dark" ? "#24224f" : "#f8e2da");
  }
} catch (_) {}
