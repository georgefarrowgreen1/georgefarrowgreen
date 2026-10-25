// The top of the page as it was last shown, put up the moment the page opens: its sky, the temperature, what it's
// doing, the day's high and low and its briefing (app.js keepHero), the place's name and its line in the bar and the
// saved places as dots, while the app itself loads, a second or so on a phone, and draws
// it afresh. Only for the place that'll be showing, and only if it was shown in the last few hours: not a morning's
// temperature put up in the evening. (A plain script, run before the app's modules, with nothing of theirs.)
(() => {
  try {
    const read = (k) => JSON.parse(localStorage.getItem(k) || "null");
    const k = read("wx:hero"), places = read("wx:places"), cur = read("wx:cur"), nn = read("wx:settings")?.notify || {};
    if (!k || !(Date.now() - k.at < 3 * 3600e3) || !Array.isArray(places) || !places.length) return;
    // (the place a shared link names, if it's opened from one, or My Location for one of its own notifications: app.js
    // start; else the one you were last on)
    const q = new URLSearchParams(location.search), lat = parseFloat(q.get("lat")), lon = parseFloat(q.get("lon"));
    const near = (x, d = 0.02) => Math.abs(x.lat - lat) < d && Math.abs(x.lon - lon) < d;
    const own = [...(Array.isArray(nn.places) ? nn.places : []), nn.brief].some((x) => x?.gps && near(x));
    const p = Number.isFinite(lat) && Number.isFinite(lon) ? places.find((x) => !x.gps && near(x)) || (own ? places.find((x) => x.gps && near(x, 0.2)) : null)
      : places[Math.min(Number.isInteger(cur) && cur > 0 ? cur : 0, places.length - 1)];
    if (!p || Math.abs(p.lat - k.lat) > 0.01 || Math.abs(p.lon - k.lon) > 0.01) return;
    const $ = (id) => document.getElementById(id);
    document.body.dataset.sky = k.sky;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", k.top);
    document.documentElement.style.backgroundColor = k.top;
    $("main").dataset.empty = "kept";
    // (all of it as the app will draw it, so nothing moves as it does: the place's name and the line under it in the bar
    // (app.js showPlace), the saved places as dots, this one lit (drawDots), and the briefing (hero))
    $("place-name").textContent = p.name;
    const sub = p.gps && p.name !== "My Location" ? "My Location" : p.approx ? "Roughly where you are" : p.region || "", btn = $("place-btn");
    $("place-sub").textContent = sub;
    btn.classList.toggle("no-sub", !sub); btn.classList.add("named");
    if (places.length > 1) {
      const dots = $("dots"), at = places.indexOf(p), here = '<svg class="g " viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 4 4 10.7l7 2.3 2.3 7z" fill="currentColor" stroke="none"/></svg>';
      dots.innerHTML = places.map((q, j) => `<i class="${[q.gps ? "gps" : "", j === at ? "on" : ""].join(" ").trim()}">${q.gps ? here : ""}</i>`).join("");
      dots.hidden = false;
    }
    const t = $("now-temp");
    t.textContent = k.temp; t.dataset.v = String(k.v); t.dataset.shown = "1";
    $("now-cond").textContent = k.cond;
    $("now-hl").textContent = k.hl;
    if (k.brief) {
      const [, lead, rest] = /^(.+?[.!?])\s+(?=[A-Z])(.*)$/s.exec(k.brief) || [, k.brief, ""], b = document.createElement("b"), brief = $("brief");
      b.textContent = lead;
      brief.replaceChildren(b, rest ? ` ${rest}` : "");
      brief.dataset.said = k.brief;
    }
  } catch (_) {}
})();
