// The page for an address that isn't one (404.html): which address that was; the way back, if there's somewhere to go
// back to; where it was likely meant to go, when it's a near miss for somewhere that is; a way to say the link's broken;
// and the photo fading in once it's there rather than appearing.
const $ = (s) => document.querySelector(s);
const path = decodeSafe(location.pathname);

// the address, in a tag of its own (the path only: the site's own name in front of it says nothing)
if (path && path !== "/") { $("#where-path").textContent = path; $("#where").hidden = false; }

// back: only when they came from somewhere (a link that's broken), not when they typed it
if (document.referrer && history.length > 1) {
  const back = $("#back");
  back.hidden = false;
  back.addEventListener("click", () => history.back());
}

// "Did you mean": the first part of the address against the places there are, a slip of a letter or two allowed
const ACCOUNT = { key: "account", name: "Your account", about: "Sign in, your profile", href: "https://account.inflite.ai/", ic: "person" };
const INFLIGHT = { key: "inflight", name: "Chat", about: "Letters by pigeon", href: "https://chat.inflite.ai/", img: "/apps/inflight.png" };
const WEATHER = { key: "weather", name: "Weather", about: "Forecasts and radar", href: "https://weather.inflite.ai/", img: "/apps/weather.png" };
const FITNESS = { key: "fitness", name: "Fitness", about: "Training, using AI", href: "https://fitness.inflite.ai/", img: "/apps/fitness.png" };
const MARKETS = { key: "markets", name: "Markets", about: "Your money, said simply", href: "https://finance.inflite.ai/", img: "/apps/markets.png" };
const CONTACT = { key: "contact", name: "Get in touch", about: "Send me a message", href: "/#contact", ic: "mail" };
const PLACES = {
  weather: WEATHER, forecast: WEATHER, radar: WEATHER, rain: WEATHER,
  inflight: INFLIGHT, chat: INFLIGHT, pigeon: INFLIGHT, letters: INFLIGHT, messages: INFLIGHT,
  account: ACCOUNT, signin: ACCOUNT, login: ACCOUNT, profile: ACCOUNT, settings: ACCOUNT,
  fitness: FITNESS, training: FITNESS, rides: FITNESS, workouts: FITNESS,
  markets: MARKETS, finance: MARKETS, stocks: MARKETS, shares: MARKETS, portfolio: MARKETS,
  contact: CONTACT, message: CONTACT, email: CONTACT, hello: CONTACT,
};
const word = (path.split("/").find(Boolean) || "").toLowerCase().replace(/\.html?$/, "").replace(/[^a-z]/g, "");
let best = null, bestD = Infinity;
if (word.length >= 3) for (const [k, place] of Object.entries(PLACES)) {
  const d = distance(word, k), allow = k.length <= 5 ? 1 : 2;
  if (d <= allow && d < bestD) { best = place; bestD = d; }
}
if (best) {
  const row = $("#meant-row");
  row.href = best.href;
  row.append(
    best.img ? Object.assign(document.createElement("img"), { className: "appic", src: best.img, alt: "", width: 32, height: 32 }) : icon(best.ic),
    Object.assign(document.createElement("span"), { className: "tx", textContent: best.name }),
    Object.assign(document.createElement("span"), { className: "val", textContent: best.about }),
    chevron(),
  );
  $("#meant").hidden = false;
  // (and not twice: an app that's the answer isn't in the list below as well)
  document.querySelector(`.row[data-app="${best.key}"]`)?.remove();
  if (best.img) $("#apps-h").textContent = "Or open the other app";
}

// tell me: the home page's message sheet, opened with this address in it (and where the link was, if the browser says)
$("#report").href = "/#contact=" + encodeURIComponent(location.host + path) + (document.referrer ? "|" + encodeURIComponent(document.referrer) : "");

// the photo, fading in once it's there
const img = $(".bg img");
if (img.complete && img.naturalWidth) img.classList.add("loaded");
else img.addEventListener("load", () => img.classList.add("loaded"), { once: true });

function decodeSafe(s) { try { return decodeURIComponent(s); } catch (_) { return s; } }
// (the fewest letters changed, added or taken away to make one word the other)
function distance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
function svg(html, w = 18) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("width", w); s.setAttribute("height", w); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("fill", "none");
  s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", "2"); s.setAttribute("aria-hidden", "true");
  s.innerHTML = html;
  return s;
}
function icon(kind) {
  const box = document.createElement("span");
  box.className = "ic blue"; box.setAttribute("aria-hidden", "true");
  const s = svg(kind === "mail" ? '<rect x="3" y="5" width="18" height="14" rx="2.6"/><path d="m3.8 7 8.2 6 8.2-6"/>' : '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1.4-3.6 4.2-5.4 7.5-5.4s6.1 1.8 7.5 5.4"/>');
  s.setAttribute("stroke", "#fff");
  box.append(s);
  return box;
}
function chevron() {
  const s = svg('<path d="M9.5 6l6 6-6 6"/>', 16);
  s.setAttribute("class", "chev"); s.setAttribute("stroke-width", "2.4");
  return s;
}
