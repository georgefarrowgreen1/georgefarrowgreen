// Back from signing in on the account's page (#signedin, and who you are: f, p): the picture that page ended on, and you
// in it, from the very first frame (styles.css html.back-on, back-face), till app.js takes it on (arriveFrom, arrive).
// Your photo, a small copy the page sent in the # (never sent to a server), is made a blob: here, as images are only
// ever the site's or the browser's own.
(function () {
  if (!/^#signedin(?![\w-])/.test(location.hash)) return;
  var root = document.documentElement;
  root.classList.add("back-on");
  try {
    var q = new URLSearchParams(location.hash.slice(1)), f = q.get("f") || "", p = q.get("p") || "";
    if (Array.from(f).length === 1 && !/[\s"'\\]/.test(f)) { root.style.setProperty("--back-i", JSON.stringify(f)); root.classList.add("back-face"); }
    if (/^[A-Za-z0-9_-]{200,60000}$/.test(p)) {
      var bin = atob(p.replace(/-/g, "+").replace(/_/g, "/")), u = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      window.backPhoto = URL.createObjectURL(new Blob([u], { type: "image/jpeg" }));
      root.style.setProperty("--back-p", 'url("' + window.backPhoto + '")'); root.style.setProperty("--back-i", '""'); root.classList.add("back-face");
    }
  } catch (e) { /* no picture of you: the sky alone, and you once the page knows who's signed in */ }
})();
