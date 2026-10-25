// Building the page, and saying numbers as people say them: the account page's h() and icons, and Cadence's own.

// h("button.row.action", { type: "button", onclick }, ...children): an element, its classes, attributes and children
export function h(spec, props, ...kids) {
  const [tag, ...cls] = spec.split(".");
  const el = document.createElement(tag || "div");
  if (cls.length) el.className = cls.join(" ");
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "text") el.textContent = v;
    else if (k === "value" || k === "disabled" || k === "hidden" || k === "checked") el[k] = v;
    else if (k === "vars") for (const [n, x] of Object.entries(v)) el.style.setProperty(n, x);
    else el.setAttribute(k, v === true ? "" : v);
  }
  el.append(...kids.flat(Infinity).filter((x) => x != null && x !== false && x !== ""));
  return el;
}
// an SVG drawn from its markup (attributes only: the page's rules allow no style written in it)
export function svg(markup) {
  const t = document.createElement("template");
  t.innerHTML = markup.trim();
  return t.content.firstChild;
}

const ICONS = {
  chev: '<path d="M9.5 6l6 6-6 6"/>',
  back: '<path d="M14.5 6l-6 6 6 6"/>',
  x: '<path d="M7 7l10 10M17 7 7 17"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  download: '<path d="M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 19.5h14"/>',
  upload: '<path d="M12 15.5V4.5M7.5 9 12 4.5 16.5 9"/><path d="M4.5 14.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3"/>',
  inbox: '<path d="M4 13.5 6.2 6a2 2 0 0 1 1.9-1.5h7.8A2 2 0 0 1 17.8 6l2.2 7.5v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M4 13.5h4.5l1.2 2.2h4.6l1.2-2.2H20"/>',
  info: '<circle cx="12" cy="12" r="8.6"/><path d="M12 11v5.4"/><path d="M12 7.7v.1" stroke-width="2.8"/>',
  trash: '<path d="M4.5 7h15M10 11v6m4-6v6M6.5 7l.9 11.3a2 2 0 0 0 2 1.7h5.2a2 2 0 0 0 2-1.7L17.5 7M9.5 7V4.5h5V7"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  today: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  plan: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4M7.5 14h3M13.5 14h3M7.5 17.2h3"/>',
  bolt: '<path d="M13 3 5.5 13.2h5.6L10 21l8.5-11h-5.8z"/>',
  list: '<path d="M8.5 6.5h11M8.5 12h11M8.5 17.5h11"/><circle cx="4.6" cy="6.5" r="1"/><circle cx="4.6" cy="12" r="1"/><circle cx="4.6" cy="17.5" r="1"/>',
  ride: '<circle cx="6" cy="16" r="3.6"/><circle cx="18" cy="16" r="3.6"/><path d="M6 16l3.7-7h6.1L18 16M9.7 9 12.4 16H6M14.3 6.4h2.4"/>',
  run: '<circle cx="14.5" cy="4.6" r="1.8"/><path d="M8.5 10.2 11.6 8l3.1 1 1.8 3.2 2.6.6M11.6 8l-1.7 5.2 3.2 2.6-1.3 4.7M9.9 13.2l-2.3 3.1-3.3.3"/>',
  swim: '<circle cx="16.5" cy="7.3" r="1.9"/><path d="M3.5 18c1.4 0 2.1-1 3.5-1s2.1 1 3.5 1 2.1-1 3.5-1 2.1 1 3.5 1 2.1-1 3.5-1M5.5 14.2 10.3 10l3 2.6M9.4 8.6l3.9-1.8 3.7 5"/>',
  strength: '<path d="M6.5 8v8M17.5 8v8M3.8 10v4M20.2 10v4M6.5 12h11"/>',
  walk: '<circle cx="12.5" cy="4.6" r="1.8"/><path d="M10 21l2-6.2-2.5-2.3.8-4.2 3 2.3 2.7 1M10.3 8.3 7.6 9.5 6.8 13M12 14.8l2.6 2.5.9 3.7"/>',
  heart: '<path d="M12 20s-7.5-4.5-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.5 12 20 12 20z"/>',
  gauge: '<path d="M4.5 16.5a8 8 0 1 1 15 0"/><path d="M12 13l4-4.5"/>',
  mountain: '<path d="M3 19 9.5 8l3.8 6.2L15.5 11 21 19z"/>',
  scale: '<path d="M6.5 20h11a2 2 0 0 0 2-2.3l-1.2-8.5a2 2 0 0 0-2-1.7H7.7a2 2 0 0 0-2 1.7L4.5 17.7A2 2 0 0 0 6.5 20z"/><path d="M12 7.5V5M10 11.5l2 1.5"/>',
  ruler: '<path d="M3.5 15.5 15.5 3.5l5 5-12 12z"/><path d="m7.5 11.5 2 2m1-5 2 2m1-5 2 2"/>',
  contrast: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/>',
  person: '<circle cx="12" cy="8.6" r="3.9"/><path d="M4.6 20c1.2-3.6 4-5.6 7.4-5.6s6.2 2 7.4 5.6"/>',
  device: '<rect x="6" y="3" width="12" height="18" rx="3"/><path d="M9 7.5h6v5H9zM10 17h4"/>',
  usb: '<path d="M12 3v14M12 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 13l-4-2.5V8M12 15l4-2.5V9.5"/><rect x="6.5" y="6" width="3" height="2" rx=".5"/><circle cx="16" cy="8.3" r="1.2"/>',
  trainer: '<circle cx="8" cy="15.5" r="4"/><path d="M8 15.5h7.5l2.5-7h-5M13 8.5l-2.2 7M15.5 15.5 19 20H4"/>',
  sparkle: '<path d="M12 3.5l1.9 5.2 5.1 1.8-5.1 1.9-1.9 5.1-1.9-5.1-5.1-1.9 5.1-1.8z"/><path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
  swap: '<path d="M7 7.5h11.5L15 4M17 16.5H5.5L9 20"/>',
  wave: '<path d="M3 12h3l2.5-6 4 12 2.5-6H21"/>',
  file: '<path d="M7 3.5h7l4.5 4.5V20a.5.5 0 0 1-.5.5H7a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5z"/><path d="M14 3.5V8h4.5"/>',
  zip: '<path d="M7 3.5h7l4.5 4.5V20a.5.5 0 0 1-.5.5H7a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5z"/><path d="M11 4v2h1.5v2H11v2h1.5v2H11v3h1.5"/>',
  edit: '<path d="M4.5 19.5 5.3 15.6 15.8 5.1a2 2 0 0 1 2.8 0l.3.3a2 2 0 0 1 0 2.8L8.4 18.7z"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"/>',
  open: '<path d="M8 16 16 8M9.5 8H16v6.5"/>',
};
export function icon(name, size = 20, width = 2) {
  return svg(`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`);
}
export const sportIcon = (sport, size = 20) => icon({ ride: "ride", run: "run", swim: "swim", strength: "strength", walk: "walk", row: "wave" }[sport] || "bolt", size, 1.9);

// ---- numbers in words ----
export const U = { metric: true };
const pad = (n) => String(n).padStart(2, "0");
// a length of time: "45 min", "1 h 12 min", "3 h"
export function dur(secs) {
  const m = Math.round(secs / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
// short, for a row: "45 min", "1:12" (hours and minutes)
export const hm = (secs) => { const m = Math.round(secs / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)}:${pad(m % 60)}`; };
// as a clock: "1:12:30", "45:00"
export const clock = (secs) => { secs = Math.round(secs); const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60; return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`; };
// a step's length: "12:00", "30 s", "800 m"
export const stepLen = (s) => (s.secs != null ? (s.secs < 60 ? `${Math.round(s.secs)} s` : clock(s.secs)) : s.metres != null ? dist(s.metres, s.metres < 2000) : "");
export function dist(m, metres = false) {
  if (U.metric) return metres ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;
  return metres ? `${Math.round(m * 1.0936)} yd` : `${(m / 1609.344).toFixed(m < 16093 ? 2 : 1)} mi`;
}
export const distNum = (m) => (U.metric ? [(m / 1000).toFixed(m < 10000 ? 2 : 1), "km"] : [(m / 1609.344).toFixed(1), "mi"]);
export const height = (m) => (U.metric ? [Math.round(m).toLocaleString("en-GB"), "m"] : [Math.round(m * 3.2808).toLocaleString("en-GB"), "ft"]);
export const speed = (ms) => (U.metric ? [(ms * 3.6).toFixed(1), "km/h"] : [(ms * 2.2369).toFixed(1), "mph"]);
// a pace, from seconds a km (or a 100 m, for a swim)
export const pace = (secs, per = U.metric ? "/km" : "/mi") => `${Math.floor(secs / 60)}:${pad(Math.round(secs % 60))} ${per}`;
export const paceOf = (secsPerKm) => (U.metric ? secsPerKm : secsPerKm * 1.609344);
export const weight = (kg) => (U.metric ? `${kg.toFixed(1).replace(/\.0$/, "")} kg` : `${Math.round(kg * 2.2046)} lb`);

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// (the year said only when it isn't this one: a ride from 2019, a plan ending next January)
const yearOf = (d) => (d.getFullYear() === new Date().getFullYear() ? "" : ` ${d.getFullYear()}`);
export const dayLong = (t) => { const d = new Date(t); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}${yearOf(d)}`; };
export const dayShort = (t) => { const d = new Date(t); return `${DAYS[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}${yearOf(d)}`; };
export const dayName = (t) => DAYS[new Date(t).getDay()];
export const dayLetter = (t) => DAYS[new Date(t).getDay()].slice(0, 1);
export const dateShort = (t) => { const d = new Date(t); return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`; };
export const timeOf = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const plural = (n, one, many = one + "s") => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;
export const pct = (x) => `${Math.round(x * 100)}%`;
