// The top of the page as it was last shown, put up the moment the page opens: its sky, the temperature, what it's
// doing and the day's high and low (app.js keepHero), while the app itself loads, a second or so on a phone, and draws
// it afresh. Only for the place that'll be showing, and only if it was shown in the last few hours: not a morning's
// temperature put up in the evening. (A plain script, run before the app's modules, with nothing of theirs.)
(() => {
  try {
    const read = (k) => JSON.parse(localStorage.getItem(k) || "null");
    const k = read("wx:hero"), places = read("wx:places"), cur = read("wx:cur");
    if (!k || !(Date.now() - k.at < 3 * 3600e3) || !Array.isArray(places) || !places.length) return;
    // (the place a shared link names, if it's opened from one: app.js start; else the one you were last on)
    const q = new URLSearchParams(location.search), lat = parseFloat(q.get("lat")), lon = parseFloat(q.get("lon"));
    const p = Number.isFinite(lat) && Number.isFinite(lon) ? places.find((x) => !x.gps && Math.abs(x.lat - lat) < 0.02 && Math.abs(x.lon - lon) < 0.02)
      : places[Math.min(Number.isInteger(cur) && cur > 0 ? cur : 0, places.length - 1)];
    if (!p || Math.abs(p.lat - k.lat) > 0.01 || Math.abs(p.lon - k.lon) > 0.01) return;
    const $ = (id) => document.getElementById(id);
    document.body.dataset.sky = k.sky;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", k.top);
    document.documentElement.style.backgroundColor = k.top;
    $("main").dataset.empty = "kept";
    $("place-name").textContent = p.name;
    const t = $("now-temp");
    t.textContent = k.temp; t.dataset.v = String(k.v); t.dataset.shown = "1";
    $("now-cond").textContent = k.cond;
    $("now-hl").textContent = k.hl;
  } catch (_) {}
})();
