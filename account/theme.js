// The account's appearance, Light or Dark as chosen (app.js theme() remembers it in this browser), set as the page is
// read, before it's first drawn, and the browser's bar with it: so the page doesn't open in the device's own colours,
// for as long as app.js takes to start, and then change. (Automatic needs nothing: the stylesheet follows the device.
// A file of its own: the page's rules run no script written in it)
try {
  const t = localStorage.getItem("acct:appearance");
  if (t === "light" || t === "dark") {
    document.documentElement.dataset.theme = t;
    for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.setAttribute("content", t === "dark" ? "#1b2860" : "#dde3fb");
  }
} catch (_) {}
