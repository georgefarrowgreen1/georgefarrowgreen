// Only the path is part of the missing address. Queries and fragments can hold private details.
const year = document.getElementById("year");
year.textContent = String(new Date().getFullYear());

let path = location.pathname;
try { path = decodeURIComponent(path); } catch { /* Keep malformed escapes as typed. */ }
if (path && path !== "/") {
  const address = document.getElementById("where-path");
  document.getElementById("lost-note").textContent = "There’s no page at ";
  address.textContent = path;
  address.hidden = false;
}

const back = document.getElementById("back");
if (document.referrer && history.length > 1) {
  back.hidden = false;
  back.addEventListener("click", () => history.back());
}

for (const link of document.querySelectorAll("[data-quick-message]")) link.href = "/#contact";
const report = document.getElementById("report");
const source = document.referrer ? new URL(document.referrer) : null;
report.href = "/#contact=" + encodeURIComponent(location.host + path)
  + (source ? "|" + encodeURIComponent(source.origin + source.pathname) : "");

// Show one likely destination, including old app paths and common names for bio sections.
const places = [
  { words: ["photography", "photos", "gallery"], name: "Photography", href: "/#fi-photos" },
  { words: ["projects", "work"], name: "Selected projects", href: "/#projects" },
  { words: ["apps"], name: "Apps", href: "/#apps" },
  { words: ["details", "vcard"], name: "My details", href: "/#my-details" },
  { words: ["contact", "message", "email", "hello"], name: "Contact", href: "/contact/" },
  { words: ["weather", "forecast", "radar", "rain"], name: "Weather", href: "https://inflite.ai/weather/" },
  { words: ["inflight", "chat", "pigeon", "letters", "messages"], name: "Chat", href: "https://inflite.ai/chats/" },
  { words: ["account", "signin", "login", "profile", "settings"], name: "Your account", href: "https://inflite.ai/account/" },
  { words: ["fitness", "training", "rides", "workouts"], name: "Fitness", href: "https://inflite.ai/fitness/" },
  { words: ["markets", "finance", "stocks", "shares", "portfolio"], name: "Markets", href: "https://inflite.ai/markets/" }
];

function distance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + Number(a[i - 1] !== b[j - 1]));
    }
    previous = current;
  }
  return previous[b.length];
}

const word = (path.split("/").find(Boolean) || "").toLowerCase().replace(/\.html?$/, "").replace(/[^a-z]/g, "");
if (word.length >= 3) {
  let closest;
  let bestDistance = Infinity;
  for (const place of places) {
    for (const key of place.words) {
      const limit = key.length <= 5 ? 1 : 2;
      if (Math.abs(key.length - word.length) > limit) continue;
      const edits = distance(word, key);
      if (edits <= limit && edits < bestDistance) {
        closest = place;
        bestDistance = edits;
      }
    }
  }
  if (closest) {
    const link = document.getElementById("meant-row");
    link.textContent = closest.name;
    link.href = closest.href;
    document.getElementById("meant").hidden = false;
  }
}
