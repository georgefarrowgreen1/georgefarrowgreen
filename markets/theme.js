// Light or Dark, as your account has it (app.js remembers it in this browser), set as the page is read, before it's first
// drawn, and the browser's bar with it. (Automatic needs nothing: the stylesheet follows the device. A file of its own:
// the page's rules run no script written in it)
try {
  const t = localStorage.getItem("markets:appearance");
  if (t === "light" || t === "dark") {
    document.documentElement.dataset.theme = t;
    for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.setAttribute("content", t === "dark" ? "#102238" : "#d2ebe3");
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
