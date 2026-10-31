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
  // (an iPad with a trackpad or a mouse says its pointer is a fine one, but it's still touched: a Mac never is. And a big
  // Android tablet asking for the desktop site, as Chrome does on them: a Linux that's touched, and mostly by finger,
  // unlike a laptop with a touchscreen)
  var touched = navigator.maxTouchPoints > 1;
  var mobile = /iPhone|iPod|iPad|Android|Mobile/.test(ua) || (/Macintosh/.test(ua) && touched) || (/Linux/.test(ua) && touched && matchMedia("(pointer: coarse)").matches);
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
        // (on a signal that's stalled, given up on after 25 s, as any of the app's own asks is: the welcome says so, and
        // you can try again, rather than "Signing in…" for as long as the phone waits)
        var quit = window.AbortSignal && AbortSignal.timeout ? AbortSignal.timeout(25000) : undefined;
        window.arvSwap = { code: code[1], answer: fetch("/api/pigeon/handback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: code[1], verifier: k.word }), signal: quit })
          .then(function (r) { var json = /json/.test(r.headers.get("Content-Type") || ""); return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, json: json, d: d }; }); }) };
      }
    } catch (e) { /* the app asks itself, as before */ }
  }
  // Chat itself (app.js, and what it brings) not arriving, or stopping before it's up: rather than "Opening Chat…" for
  // ever (a Home Screen app has no reload of its own), what happened, and Try Again. Once it's up, anything that goes
  // wrong is app.js's to say (bootFail)
  if (mobile) {
    var stuck = function (lost) {
      var s = document.getElementById("screen"), l = s && s.firstElementChild;
      // (it's up: app.js has put its own screen in place of "Opening Chat…" (mount), whatever's still loading inside it.
      // Said already that it's taking a while, only its not arriving is said over that)
      if (!l || !(l.classList.contains("loading") || (lost && l.hasAttribute("data-early")))) return;
      root.classList.remove("arriving");                          // (never the account's page's sky over it)
      s.innerHTML = '<div class="bootfail" data-early role="alert"><div class="appicon"><svg viewBox="0 0 24 24" class="bird" aria-hidden="true"><use href="#bird-path"/></svg></div>'
        + (lost ? "<h1>Chat couldn’t open</h1><p>Part of it didn’t arrive, as can happen on a weak signal. Your messages are safe.</p>"
          : "<h1>Chat is taking a while</h1><p>It’s still opening. If nothing happens, try again.</p>")
        + '<button type="button" class="btn wide" id="bootretry">Try Again</button></div>';
      document.getElementById("bootretry").addEventListener("click", function () { location.reload(); });
    };
    // (a module that couldn't be fetched, or one it imports, says so on its script: caught on the way down, as it doesn't bubble)
    document.addEventListener("error", function (e) { var t = e.target; if (t && t.tagName === "SCRIPT" && t.type === "module") stuck(true); }, true);
    setTimeout(function () { stuck(false); }, 15000);
  }
})();
