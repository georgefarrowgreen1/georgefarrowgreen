// The pictures in the site's emails (pigeon/mail/v2/), drawn at three times their size so they're sharp on any screen:
//   <app>-<icon>.png   the email's own tile (an iOS-style rounded square, a soft light at its top left, a glow below)
//                      with the app's icon as a badge on its corner, cut out round it, all one picture, as mail apps
//                      that can't place one thing over another (Gmail, Outlook) still show it whole, light or dark
//   g-<app>-<sym>.png  the small symbols beside an email's details, and in its pill, in the app's own colour
// Run from the repository: node .tools/tests/mailicons.mjs (needs this folder's Playwright and its Chromium)
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, existsSync } from 'fs';
const ROOT = new URL('../../', import.meta.url).pathname, OUT = `${ROOT}pigeon/mail/v2`;
mkdirSync(OUT, { recursive: true });
const png = (f) => 'data:image/png;base64,' + readFileSync(`${ROOT}${f}`).toString('base64');
const BIRD = 'M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z';
// symbols, on a 24-unit square: lines (or, for the bird, filled)
const SYM = {
  shield: '<path d="M12 3.2 19.5 6v5.6c0 4.7-3.2 7.9-7.5 9.2-4.3-1.3-7.5-4.5-7.5-9.2V6z"/><path d="m8.8 12 2.3 2.3 4.2-4.6"/>',
  key: '<circle cx="7.5" cy="15.5" r="4"/><path d="M10.4 12.6 20 3m-3.5 3.5 3 3m-5.5-.5 2 2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.6"/><path d="m3.8 7 8.2 6 8.2-6"/>',
  passkey: '<circle cx="9" cy="8" r="3.8"/><path d="M2.5 20.5c.4-3.6 3.2-6 6.5-6 1.3 0 2.5.3 3.5 1"/><circle cx="18" cy="13.5" r="2.6"/><path d="M18 16.1v5.4m0-2h2.2"/>',
  trash: '<path d="M4.5 7h15M10 11v6m4-6v6M6.5 7l.9 11.3a2 2 0 0 0 2 1.7h5.2a2 2 0 0 0 2-1.7L17.5 7M9.5 7V4.5h5V7"/>',
  friend: '<circle cx="10" cy="8" r="3.5"/><path d="M3.5 19.5c.8-3.4 3.4-5.3 6.5-5.3 1.4 0 2.6.3 3.7 1"/><path d="M18 14v6M15 17h6"/>',
  bird: `<path d="${BIRD}" fill="currentColor" stroke="none"/>`,
  person: '<circle cx="12" cy="8.6" r="3.9"/><path d="M4.6 20c1.2-3.6 4-5.6 7.4-5.6s6.2 2 7.4 5.6"/>',
  at: '<circle cx="12" cy="12" r="4"/><path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  route: '<circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M8.2 18H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.8"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  dot: '<circle cx="12" cy="12" r="3.2"/>',
};
// each app: its icon (the badge), the colour of its symbols, and its tiles (top and foot of the gradient)
const APPS = {
  account: { badge: png('account/icon-512.png'), ink: '#6a64f2',
    tiles: { shield: ['#8a93ff', '#5a4fe0'], key: ['#8a93ff', '#5a4fe0'], mail: ['#8a93ff', '#5a4fe0'], passkey: ['#8a93ff', '#5a4fe0'], trash: ['#ff8a7a', '#e5372c'] } },
  inflight: { badge: png('pigeon/icon-512.png'), ink: '#2b84ff',
    tiles: { bird: ['#3d9afe', '#0c71f1'], landed: ['#ffab31', '#ff8b02'], friend: ['#8886ff', '#514eda'], shield: ['#4ad471', '#29b951'], key: ['#3d9afe', '#0c71f1'] } },
};
const symOf = (icon) => (icon === 'landed' ? 'bird' : icon);
// the tile and its badge, on a 112-unit canvas (the tile 80 across, centred; the badge 30, ringed by a 3-unit gap)
function tileSvg(app, icon, [top, bot]) {
  const glow = bot;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="336" height="336" viewBox="0 0 112 112"><defs>
<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bot}"/></linearGradient>
<radialGradient id="l" cx=".25" cy="0" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient>
<mask id="cut"><rect width="112" height="112" fill="#fff"/><rect x="69" y="62" width="36" height="36" rx="11.5" fill="#000"/></mask>
<filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
<filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6"/></filter>
<clipPath id="bc"><rect x="72" y="65" width="30" height="30" rx="8.5"/></clipPath></defs>
<g mask="url(#cut)">
  <rect x="24" y="26" width="64" height="66" rx="18" fill="${glow}" opacity=".55" filter="url(#blur)"/>
  <rect x="16" y="10" width="80" height="80" rx="19" fill="url(#g)"/><rect x="16" y="10" width="80" height="80" rx="19" fill="url(#l)"/>
  <g transform="translate(35.4 29.4) scale(1.72)" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" color="#fff">${SYM[symOf(icon)]}</g>
</g>
<rect x="72" y="67" width="30" height="30" rx="8.5" fill="#140a5a" opacity=".35" filter="url(#soft)"/>
<image href="${APPS[app].badge}" x="72" y="65" width="30" height="30" clip-path="url(#bc)" preserveAspectRatio="xMidYMid slice"/>
</svg>`;
}
const symSvg = (sym, ink) => `<svg xmlns="http://www.w3.org/2000/svg" width="51" height="51" viewBox="0 0 24 24" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" color="${ink}">${SYM[sym]}</svg>`;

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined) });
const shoot = async (svg, w, file) => {
  const p = await b.newPage({ viewport: { width: w, height: w } });
  await p.setContent(`<body style="margin:0;background:transparent"><img style="display:block" width="${w}" height="${w}" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body>`);
  await p.waitForTimeout(80);
  await p.screenshot({ path: file, omitBackground: true });
  await p.close();
};
let n = 0;
for (const [app, a] of Object.entries(APPS)) {
  for (const [icon, colours] of Object.entries(a.tiles)) { await shoot(tileSvg(app, icon, colours), 336, `${OUT}/${app}-${icon}.png`); n++; }
  for (const sym of ['person', 'at', 'clock', 'pin', 'phone', 'key', 'grid', 'link', 'passkey', 'mail', 'lock', 'bird', 'route', 'star', 'dot']) { await shoot(symSvg(sym, a.ink), 51, `${OUT}/g-${app}-${sym}.png`); n++; }
}
await b.close();
console.log(`${n} pictures in pigeon/mail/v2`);
