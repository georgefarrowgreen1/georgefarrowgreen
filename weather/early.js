// The sky the page opens on (styles.css body[data-sky]), set as the page is read, before it's first drawn: the one it
// showed a moment ago, if it was open in the last hour (app.js sky keeps it), else the time of day's, as the app has
// while a place's forecast comes (app.js go). So opening it at night doesn't show a grey day's sky first, for as long as
// the app takes to start, and then snap to the night's. (A file of its own: the page's rules run no script written in it)
try {
  const k = JSON.parse(localStorage.getItem("wx:sky") || "null"), h = new Date().getHours();
  document.body.dataset.sky = k && typeof k.sky === "string" && /^[a-z-]+$/.test(k.sky) && Date.now() - k.at < 3600e3 ? k.sky : h >= 7 && h < 19 ? "cloudy-day" : "cloudy-night";
} catch (_) {}
// And back from signing in on the account's page (#signin=…): the picture that page ended on, its sky and its dawn,
// there from the first frame too, till app.js has the sign-in and takes it on (arriveFrom)
if (/^#signin=/.test(location.hash)) {
  const a = document.createElement("div");
  a.className = "back-in"; a.id = "back-in"; a.setAttribute("aria-hidden", "true");
  document.body.append(a);
}
