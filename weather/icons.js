// Icons, drawn here as SVG: the weather (in colour) and the app's own glyphs
// (one colour, the text's). Nothing is loaded from anywhere else.

const SUN = "#FFC53D", MOON = "#F4E7C1", CLOUD = "#EEF3F9", DARK = "#B4C0CF", STORM = "#8E9AAB", RAIN = "#5DB2FF", BOLT = "#FFD43B", SNOW = "#FFFFFF";
// (each part named, so the big icon at the top can move it: styles.css, .hero-icon)
const cloud = (fill = CLOUD, dx = 0, dy = 0, s = 1) =>
  `<g class="wi-cloud"><path transform="translate(${dx} ${dy}) scale(${s})" fill="${fill}" d="M19 47h28a10.5 10.5 0 0 0 1.6-20.9A14.5 14.5 0 0 0 21 23.2 12 12 0 0 0 19 47z"/></g>`;
const sun = (cx = 32, cy = 32, r = 11, rays = true) => {
  let s = `<circle class="wi-sun" cx="${cx}" cy="${cy}" r="${r}" fill="${SUN}"/>`;
  if (rays) s += '<g class="wi-rays">';
  if (rays) for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4, x1 = cx + Math.cos(a) * (r + 5), y1 = cy + Math.sin(a) * (r + 5), x2 = cx + Math.cos(a) * (r + 10), y2 = cy + Math.sin(a) * (r + 10);
    s += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${SUN}" stroke-width="3.5" stroke-linecap="round"/>`;
  }
  return rays ? `${s}</g>` : s;
};
const moon = (cx = 32, cy = 30, r = 15) => `<path class="wi-moon" fill="${MOON}" d="M${cx + r * 0.35} ${cy - r}a${r} ${r} 0 1 0 ${r * 0.65} ${r * 1.55}A${r * 0.95} ${r * 0.95} 0 0 1 ${cx + r * 0.35} ${cy - r}z"/>`;
const drops = (n, color = RAIN, y = 51, len = 7) => {
  const xs = n === 2 ? [27, 38] : n === 3 ? [23, 32, 41] : [20, 28, 36, 44];
  return `<g class="wi-drops">${xs.map((x) => `<line x1="${x}" y1="${y}" x2="${x - 3}" y2="${y + len}" stroke="${color}" stroke-width="3.2" stroke-linecap="round"/>`).join("")}</g>`;
};
const dots = (color = RAIN) => `<g class="wi-drops">${[23, 32, 41].map((x, i) => `<circle cx="${x - 1}" cy="${54 + (i % 2) * 4}" r="2.2" fill="${color}"/>`).join("")}</g>`;
const flakes = (xs = [24, 40], y = 55) => `<g class="wi-flakes">${xs.map((x) => `<g stroke="${SNOW}" stroke-width="2.4" stroke-linecap="round"><line x1="${x}" y1="${y - 5}" x2="${x}" y2="${y + 5}"/><line x1="${x - 4.3}" y1="${y - 2.5}" x2="${x + 4.3}" y2="${y + 2.5}"/><line x1="${x - 4.3}" y1="${y + 2.5}" x2="${x + 4.3}" y2="${y - 2.5}"/></g>`).join("")}</g>`;

const WEATHER = {
  sun: () => sun(),
  moon: () => moon(32, 32, 16),
  "mostly-sun": () => sun(26, 24, 10) + cloud(CLOUD, 14, 18, 0.62),
  "mostly-moon": () => moon(26, 22, 12) + cloud(CLOUD, 14, 18, 0.62),
  "partly-sun": () => sun(23, 22, 10) + cloud(CLOUD, 4, 6, 0.95),
  "partly-moon": () => moon(24, 20, 12) + cloud(CLOUD, 4, 6, 0.95),
  cloud: () => cloud(DARK, -6, -4, 0.9) + cloud(CLOUD, 4, 4, 0.95),
  fog: () => cloud(DARK, 0, -6) + `<g class="wi-fog">${[40, 47, 54].map((y, i) => `<line x1="${12 + i * 3}" y1="${y}" x2="${52 - i * 3}" y2="${y}" stroke="${CLOUD}" stroke-width="3.2" stroke-linecap="round"/>`).join("")}</g>`,
  drizzle: () => cloud(CLOUD, 0, -6) + dots(),
  rain: () => cloud(CLOUD, 0, -8) + drops(3),
  "heavy-rain": () => cloud(DARK, 0, -8) + drops(4, RAIN, 47, 11),
  "showers-sun": () => sun(22, 20, 9) + cloud(CLOUD, 4, -2, 0.9) + drops(2, RAIN, 49),
  "showers-moon": () => moon(23, 18, 11) + cloud(CLOUD, 4, -2, 0.9) + drops(2, RAIN, 49),
  sleet: () => cloud(CLOUD, 0, -8) + `<g class="wi-drops"><line x1="26" y1="50" x2="23" y2="58" stroke="${RAIN}" stroke-width="3.2" stroke-linecap="round"/></g>` + flakes([40], 54),
  snow: () => cloud(CLOUD, 0, -8) + flakes([24, 40], 53),
  storm: () => cloud(STORM, 0, -8) + `<path class="wi-bolt" fill="${BOLT}" d="M33 38l-9 13h7l-4 11 12-15h-7l4-9z"/>`,
};
export function weatherIcon(name, size = 32, label = "") {
  const body = (WEATHER[name] || WEATHER.cloud)();
  return `<svg class="wi" viewBox="0 0 64 64" width="${size}" height="${size}" ${label ? `role="img" aria-label="${label.replace(/"/g, "")}"` : 'aria-hidden="true"'}>${body}</svg>`;
}

// The Moon as it looks tonight: lit (0 to 1), waxing (lit on the right, in the north)
export function moonIcon(lit, waxing, size = 44, south = false) {
  const r = 20, c = 24, k = 1 - 2 * lit;            // the terminator's ellipse, from -1 (full) to 1 (new)
  const right = waxing !== south;
  // the lit part: half the disc on the lit side, plus or minus the terminator's half-ellipse
  const sweepOuter = right ? 1 : 0, rx = Math.abs(k) * r, sweepInner = (k > 0) === right ? 0 : 1;
  const d = `M${c} ${c - r}A${r} ${r} 0 0 ${sweepOuter} ${c} ${c + r}A${rx.toFixed(2)} ${r} 0 0 ${sweepInner} ${c} ${c - r}z`;
  return `<svg class="moonicon" viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true"><circle cx="${c}" cy="${c}" r="${r}" fill="#2a3346"/><path d="${d}" fill="${MOON}"/></svg>`;
}

// Glyphs (24×24, stroked in the text's colour)
const G = {
  pin: '<path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.3"/>',
  locate: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  arrow: '<path d="M5 12h13M13 6l6 6-6 6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  chevron: '<path d="M7 10l5 5 5-5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  umbrella: '<path d="M3 12a9 9 0 0 1 18 0z"/><path d="M12 12v7a2 2 0 0 0 4 0"/>',
  frost: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17l17.4-10"/><path d="M9 4l3 2 3-2M9 20l3-2 3 2"/>',
  ice: '<path d="M12 3l2.5 4.5L12 12 9.5 7.5zM4 20h16M7 16h10"/>',
  fog: '<path d="M4 9h16M3 13h18M5 17h14"/>',
  wind: '<path d="M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3M3 12h7"/>',
  rain: '<path d="M7 17a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.4 1.4A3.8 3.8 0 0 1 17 17"/><path d="M9 19l-1 2M13 19l-1 2M17 19l-1 2"/>',
  storm: '<path d="M7 16a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.4 1.4A3.8 3.8 0 0 1 17 16"/><path d="M12.5 13l-2.5 4h3l-2 4"/>',
  snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/>',
  heat: '<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/><path d="M12 11v6"/>',
  cold: '<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/><circle cx="12" cy="18" r="1.5" fill="currentColor"/>',
  uv: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M5 19l1.4-1.4M17.6 6.4L19 5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M5 19l1.4-1.4M17.6 6.4L19 5"/>',
  air: '<path d="M3 8h10a3 3 0 1 0-3-3M3 16h13a3 3 0 1 1-3 3"/><circle cx="19" cy="10" r="1.2" fill="currentColor"/><circle cx="16" cy="13" r="1" fill="currentColor"/>',
  pollen: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="19" r="1.6"/><circle cx="5" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/><circle cx="7" cy="7" r="1.3"/><circle cx="17" cy="17" r="1.3"/><circle cx="17" cy="7" r="1.3"/><circle cx="7" cy="17" r="1.3"/>',
  shirt: '<path d="M8 3l-5 3 2 4 2-1v12h10V9l2 1 2-4-5-3a4 4 0 0 1-8 0z"/>',
  commute: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M8 21l1.5-4M16 21l-1.5-4"/><circle cx="8.5" cy="14" r=".8" fill="currentColor"/><circle cx="15.5" cy="14" r=".8" fill="currentColor"/>',
  up: '<path d="M4 17l6-6 4 4 6-7"/><path d="M15 8h5v5"/>',
  down: '<path d="M4 7l6 6 4-4 6 7"/><path d="M15 16h5v-5"/>',
  equal: '<path d="M5 9h14M5 15h14"/>',
  chart: '<path d="M4 20V4M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.2" fill="currentColor"/><circle cx="15" cy="15" r="1.2" fill="currentColor"/><circle cx="15" cy="9" r="1.2" fill="currentColor"/><circle cx="9" cy="15" r="1.2" fill="currentColor"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16 10"/>',
  gauge: '<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-5"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.4 1.4A3.8 3.8 0 0 1 17 18z"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  sunset: '<path d="M3 18h18M6 14a6 6 0 0 1 12 0"/><path d="M12 3v4M9.5 5.5L12 3l2.5 2.5"/>',
  sunrise: '<path d="M3 18h18M6 14a6 6 0 0 1 12 0"/><path d="M12 8V3M9.5 5.5L12 8l2.5-2.5"/>',
  moon: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>',
  stars: '<path d="M9 3l1.5 3.5L14 8l-3.5 1.5L9 13l-1.5-3.5L4 8l3.5-1.5zM17 12l.9 2.1L20 15l-2.1.9L17 18l-.9-2.1L14 15l2.1-.9z"/>',
  run: '<circle cx="14" cy="4.5" r="1.8"/><path d="M8 21l3-6 3 2v5M7 11l3-3 4 1 2 4 3 1M11 15l-1-4"/>',
  walk: '<circle cx="12" cy="4.5" r="1.8"/><path d="M10 21l2-7 3 3v4M9 12l1.5-4 3 1 1.5 3 2 1M12 14l-1.5-6"/>',
  bike: '<circle cx="6" cy="16" r="4"/><circle cx="18" cy="16" r="4"/><path d="M6 16l4-8h5l3 8M10 8l2 8h-6M14 5h3"/>',
  drop: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  warning: '<path d="M10.3 4.2a2 2 0 0 1 3.4 0l7.6 13.1a2 2 0 0 1-1.7 3H4.4a2 2 0 0 1-1.7-3z"/><path d="M12 9.5v4.5M12 17v.5"/>',
  here: '<path d="M20 4 4 10.7l7 2.3 2.3 7z" fill="currentColor" stroke="none"/>',
  share: '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12l6-6"/><circle cx="15.5" cy="9" r="1" fill="currentColor"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>',
  flag: '<path d="M6 21V4M6 4h10l-2 4 2 4H6"/><path d="M4 21h6"/>',
  sail: '<path d="M12 3v14M12 4l7 12h-7M12 7l-6 9h6"/><path d="M3 19c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 6 0"/>',
  leaf: '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14z"/><path d="M5 19l7-7"/>',
  tennis: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6c3.5 3.5 3.5 9.3 0 12.8M18.4 5.6c-3.5 3.5-3.5 9.3 0 12.8"/>',
  mountain: '<path d="M3 20l6-10 4 6 3-4 5 8z"/><path d="M8 12l1 1 1-1"/>',
  flame: '<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-7 1.5 1 2 2.5 2 4 1-1.5 1-4 1-7z"/>',
  swim: '<circle cx="16" cy="6" r="1.8"/><path d="M4 13l5-3 3 2 4-3M3 18c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 6 0"/>',
  play: '<path d="M8 5l11 7-11 7z" fill="currentColor"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  shrink: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  out: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
};
export function glyph(name, size = 20, cls = "") {
  return `<svg class="g ${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${G[name] || G.info}</svg>`;
}
