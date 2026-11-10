// ==== InFlite motion: shared lifecycle ====
// Pause presentation motion before first paint and while the page is in the app
// switcher. This does not pause data, requests, navigation or authentication.
(() => {
  const doc = globalThis.document, root = doc?.documentElement;
  if (!root?.toggleAttribute || globalThis.__iflMotionReady) return;
  globalThis.__iflMotionReady = true;
  const sync = () => root.toggleAttribute("data-motion-paused", doc.visibilityState === "hidden");
  doc.addEventListener?.("visibilitychange", sync);
  globalThis.addEventListener?.("pagehide", () => root.toggleAttribute("data-motion-paused", true));
  globalThis.addEventListener?.("pageshow", sync);
  sync();
})();
// ==== End InFlite motion ====
// ==== InFlite page zoom: shared guard ====
// InFlite's page zoom policy. Runs before sign-in and independently of the menu.
// Components such as maps and photo viewers retain their own gesture handling.
(() => {
  if (globalThis.__iflZoomBlocked) return;
  globalThis.__iflZoomBlocked = true;
  for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
    document.addEventListener(type, (event) => event.preventDefault(), { passive: false });
  }
  document.addEventListener("touchmove", (event) => {
    if (event.touches?.length > 1) event.preventDefault();
  }, { passive: false });
})();
// ==== End InFlite page zoom ====
// The sky the page opens on (styles.css body[data-sky]), set as the page is read, before it's first drawn: the one it
// showed a moment ago, if it was open in the last hour (app.js sky keeps it), else the time of day's, as the app has
// while a place's forecast comes (app.js go). So opening it at night doesn't show a grey day's sky first, for as long as
// the app takes to start, and then snap to the night's. (A file of its own: the page's rules run no script written in it)
try {
  const k = JSON.parse(localStorage.getItem("wx:sky") || "null"), h = new Date().getHours();
  document.body.dataset.sky = k && typeof k.sky === "string" && /^[a-z-]+$/.test(k.sky) && Date.now() - k.at < 3600e3 ? k.sky : h >= 7 && h < 19 ? "cloudy-day" : "cloudy-night";
} catch (_) {}
// And back from signing in on the account's page (#signin=…): the picture that page ended on, its sky, its dawn and
// you (the initial and a small copy of your photo it sent in the #: f, p, the photo made a blob: here), there from the
// first frame too, till app.js has the sign-in and takes it on (arriveFrom, welcome)
if (/^#signin=/.test(location.hash)) {
  const a = document.createElement("div");
  a.className = "back-in"; a.id = "back-in"; a.setAttribute("aria-hidden", "true");
  try {
    const q = new URLSearchParams(location.hash.slice(1)), f = q.get("f") || "", p = q.get("p") || "";
    if ([...f].length === 1) {
      const av = document.createElement("span"), card = document.createElement("span");
      av.className = "back-in-av"; av.id = "back-in-av"; card.className = "back-in-card"; av.append(card, f);
      if (/^[A-Za-z0-9_-]{200,60000}$/.test(p)) {
        const bin = atob(p.replace(/-/g, "+").replace(/_/g, "/")), u = Uint8Array.from(bin, (c) => c.charCodeAt(0)), img = document.createElement("img");
        img.alt = ""; img.className = "loaded"; img.src = URL.createObjectURL(new Blob([u], { type: "image/jpeg" })); av.append(img);
      }
      a.append(av);
    }
  } catch (_) { /* no picture of you: the sky alone, and you once the sign-in's in */ }
  document.body.append(a);
}
