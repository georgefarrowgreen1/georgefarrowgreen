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
  if (m) m.setAttribute("content", dark ? "#1b2860" : "#dde3fb");
  // Chat is for phones and iPads. An iPad asks for desktop sites, calling
  // itself a Mac, but a Mac has no touchscreen. Anything else (a computer) is
  // shown a page saying Chat isn't available, and the app never starts.
  var ua = navigator.userAgent || "";
  // (and a big Android tablet asking for the desktop site, as Chrome does on them: a Linux that's touched)
  var mobile = /iPhone|iPod|iPad|Android|Mobile/.test(ua) || (/Macintosh|Linux/.test(ua) && navigator.maxTouchPoints > 1 && matchMedia("(pointer: coarse)").matches);
  if (!mobile) root.setAttribute("data-device", "computer");
  // back from signing in on the account's page (#signin=…): the page's last picture, its sky, its dawn and you, from
  // the very first frame (styles.css html.arriving), until app.js puts up its own copy (arriving). You: the initial
  // and a small copy of your photo the page sent in the # (f, p), the photo made a blob: here, as images are only ever
  // this site's or the phone's own
  else if (/^#signin=/.test(location.hash)) {
    root.classList.add("arriving");
    try {
      var q = new URLSearchParams(location.hash.slice(1)), f = q.get("f") || "", p = q.get("p") || "";
      if (Array.from(f).length === 1 && !/[\s"'\\]/.test(f)) { root.style.setProperty("--arv-i", JSON.stringify(f)); root.classList.add("arv-face"); }
      if (/^[A-Za-z0-9_-]{200,60000}$/.test(p)) {
        var bin = atob(p.replace(/-/g, "+").replace(/_/g, "/")), u = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        window.arvPhoto = URL.createObjectURL(new Blob([u], { type: "image/jpeg" }));
        root.style.setProperty("--arv-p", 'url("' + window.arvPhoto + '")'); root.style.setProperty("--arv-i", '""'); root.classList.add("arv-face");
      }
    } catch (e) { /* no picture of you: the sky alone */ }
    // and the code it brought swapped for Chat's sign-in straight away, with the word kept for it, rather than once
    // the app itself has come (app.js signInBack takes up the answer: arvSwap)
    try {
      var code = /^#signin=([A-Za-z0-9_-]{20,64})(?:&|$)/.exec(location.hash), k = JSON.parse(localStorage.getItem("inflight-signin") || "null");
      if (code && k && k.word && Date.now() - k.at < 30 * 60000 && window.fetch) {
        window.arvSwap = { code: code[1], answer: fetch("/api/pigeon/handback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: code[1], verifier: k.word }) })
          .then(function (r) { var json = /json/.test(r.headers.get("Content-Type") || ""); return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, json: json, d: d }; }); }) };
      }
    } catch (e) { /* the app asks itself, as before */ }
  }
})();
