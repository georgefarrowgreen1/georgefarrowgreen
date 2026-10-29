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
// Back from signing in on the account's page (#signin=…): the page's last picture, its sky and you, from the very first
// frame (styles.css html.arriving), until app.js puts up its own copy of it (arriving), as Chat's does. You: the
// initial and the small copy of your photo the page sent in the # (f, p), the photo made a blob: here
try {
  if (/^#signin=/.test(location.hash)) {
    const root = document.documentElement, q = new URLSearchParams(location.hash.slice(1)), f = q.get("f") || "", p = q.get("p") || "";
    root.classList.add("arriving");
    if (Array.from(f).length === 1 && !/[\s"'\\]/.test(f)) { root.style.setProperty("--arv-i", JSON.stringify(f)); root.classList.add("arv-face"); }
    if (/^[A-Za-z0-9_-]{200,60000}$/.test(p)) {
      const bin = atob(p.replace(/-/g, "+").replace(/_/g, "/")), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      window.arvPhoto = URL.createObjectURL(new Blob([u], { type: "image/jpeg" }));
      root.style.setProperty("--arv-p", `url("${window.arvPhoto}")`); root.style.setProperty("--arv-i", '""'); root.classList.add("arv-face");
    }
  }
} catch (_) { /* no picture of you: the sky alone */ }
// What's changed in your account since this phone's copy of it, asked for as the page is read: on its way while the
// app's code loads, not after (account.js me takes it up; app.js keeps the copy's time, fitness:meAt). Not when back
// from signing in: that's asked for otherwise.
try {
  if (!/^#signin=/.test(location.hash)) {
    const k = JSON.parse(localStorage.getItem("fitness:meAt") || "null"), since = k && Number.isFinite(k.at) ? Math.round(k.at) : null;
    // (given up on after 20 seconds: one that hangs mustn't hold up every later sync this session)
    const stop = new AbortController(); setTimeout(() => stop.abort(), 20000);
    window.fxEarly = { since, got: fetch(`/api/fitness/${since ? `me?since=${since}` : "me"}`, { credentials: "same-origin", signal: stop.signal }) };
    window.fxEarly.got.catch(() => {});   // (offline, or not taken up: no matter, it's asked again)
  }
} catch (_) {}
