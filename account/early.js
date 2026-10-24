// Sent here by an app's Sign in (#signin=… or #join=…, with from=x,y,w,h,r: where its button was, and how round): the
// button, as glass, where it was, from the very first frame (styles.css html.from-app), so the page opens on what the
// app left in sight; app.js grows it into the sign-in card (fromButton). Nothing else here: the address is app.js's.
(function () {
  var m = /^#(signin|join)=(inflight|weather|home)(&|$)/.test(location.hash) && /[#&]from=(-?\d{1,5}),(-?\d{1,5}),(\d{1,5}),(\d{1,5}),(\d{1,4})(&|$)/.exec(location.hash);
  if (!m) return;
  var root = document.documentElement, n = ["x", "y", "w", "h", "r"];
  for (var i = 0; i < 5; i++) root.style.setProperty("--from-" + n[i], m[i + 1] + "px");
  root.classList.add("from-app");
})();
