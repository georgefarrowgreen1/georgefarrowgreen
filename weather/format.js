// Units and times, as you've chosen them (Settings). Everything is stored
// metric (°C, km/h, mm, hPa, m) and converted only when it's shown.
//
// Times are "wall ms": the forecast's local time read as if it were UTC, so a
// place's 3pm is 3pm wherever you're looking from (and the clocks changing
// partway through the fortnight is already in the forecast's own times).

export const HOUR = 3600e3, DAY = 864e5;
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// "2026-10-18T13:30" or "2026-10-18" → wall ms
export function parseWall(s) {
  if (typeof s !== "string") return NaN;
  const m = /^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d))?/.exec(s);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : NaN;
}
export const dayStart = (w) => Math.floor(w / DAY) * DAY;
export const keyOf = (w) => new Date(w).toISOString().slice(0, 10);
export const hourOf = (w) => new Date(w).getUTCHours();
export const nowWall = (offsetSec, real = Date.now()) => real + offsetSec * 1000;

export const DEFAULT_UNITS = { temp: "c", wind: "mph", precip: "mm", pressure: "hpa", clock: "24" };
const WIND = { kmh: [1, "km/h"], mph: [0.621371, "mph"], ms: [1 / 3.6, "m/s"], kn: [0.539957, "kn"] };

export function makeFormat(units = {}) {
  const U = { ...DEFAULT_UNITS, ...units };
  const tNum = (c) => (U.temp === "f" ? c * 9 / 5 + 32 : c);
  const [wk, wl] = WIND[U.wind] || WIND.mph;
  const two = (n) => String(n).padStart(2, "0");
  // a temperature, with a true minus sign below zero ("−3°", as print has it, not a hyphen)
  const deg = (v) => { const n = Math.round(v); return `${n < 0 ? "−" : ""}${Math.abs(n)}°`; };
  const f = {
    units: U,
    tempNum: (c) => (c == null || Number.isNaN(c) ? null : Math.round(tNum(c))),
    temp: (c) => (c == null || Number.isNaN(c) ? "–" : deg(tNum(c))),
    deg: (v) => deg(v),                                                     // (a number already in the units shown)
    deltaFine: (dc) => { const v = Math.abs(U.temp === "f" ? dc * 9 / 5 : dc); return `${v < 9.95 ? v.toFixed(1) : Math.round(v)}°`; },
    delta: (dc) => `${Math.round(Math.abs(U.temp === "f" ? dc * 9 / 5 : dc))}°`,
    windNum: (kmh) => (kmh == null ? null : Math.round(kmh * wk)),
    windUnit: wl,
    wind: (kmh) => (kmh == null ? "–" : `${Math.round(kmh * wk)} ${wl}`),
    precip: (mm) => {
      if (mm == null) return "–";
      if (U.precip === "in") { const i = mm / 25.4; return `${i < 0.005 ? "0" : i < 1 ? i.toFixed(2) : i.toFixed(1)} in`; }
      return `${mm < 0.05 ? "0" : mm < 10 ? (Math.round(mm * 10) / 10).toString() : Math.round(mm)} mm`;
    },
    snow: (cm) => (U.precip === "in" ? `${(cm / 2.54).toFixed(1)} in` : `${cm < 1 ? cm.toFixed(1) : Math.round(cm)} cm`),
    rate: (mmh) => (U.precip === "in" ? `${(mmh / 25.4).toFixed(2)} in/h` : `${mmh < 10 ? (Math.round(mmh * 10) / 10) : Math.round(mmh)} mm/h`),
    pressure: (hpa) => (hpa == null ? "–" : U.pressure === "inhg" ? `${(hpa * 0.02953).toFixed(2)} inHg` : U.pressure === "mmhg" ? `${Math.round(hpa * 0.750062)} mmHg` : `${Math.round(hpa)} hPa`),
    pressureDelta: (d) => (U.pressure === "inhg" ? `${Math.abs(d * 0.02953).toFixed(2)} inHg` : U.pressure === "mmhg" ? `${Math.abs(Math.round(d * 0.750062))} mmHg` : `${Math.abs(Math.round(d))} hPa`),
    dist: (m) => {
      if (m == null) return "–";
      if (U.wind === "mph") { const mi = m / 1609.34; return mi >= 10 ? `${Math.round(mi)} mi` : `${mi.toFixed(1)} mi`; }
      return m >= 10000 ? `${Math.round(m / 1000)} km` : `${(m / 1000).toFixed(1)} km`;
    },
    // 15:00 / 3pm; 15:30 / 3:30pm
    time: (w) => {
      if (w == null || Number.isNaN(w)) return "–";
      const d = new Date(w), h = d.getUTCHours(), m = d.getUTCMinutes();
      if (U.clock === "12") return !m && h % 12 === 0 ? (h ? "noon" : "midnight") : `${h % 12 || 12}${m ? ":" + two(m) : ""}${h < 12 ? "am" : "pm"}`;
      return `${two(h)}:${two(m)}`;
    },
    // a whole hour, short: 15 / 3pm
    hour: (w) => {
      const h = new Date(w).getUTCHours();
      return U.clock === "12" ? `${h % 12 || 12}${h < 12 ? "am" : "pm"}` : two(h);
    },
    dayName: (w) => DAYS[new Date(w).getUTCDay()],
    dayShort: (w) => DAYS[new Date(w).getUTCDay()].slice(0, 3),
    date: (w) => { const d = new Date(w); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; },
    dateLong: (w) => { const d = new Date(w); return `${d.getUTCDate()} ${MONTHS_LONG[d.getUTCMonth()]}`; },
    // "Today", "Tomorrow", "Saturday" (or "Sat 25 Oct" further than a week out)
    day: (w, now) => {
      const diff = Math.round((dayStart(w) - dayStart(now)) / DAY);
      if (diff === 0) return "Today";
      if (diff === 1) return "Tomorrow";
      if (diff === -1) return "Yesterday";
      if (diff > 1 && diff < 7) return DAYS[new Date(w).getUTCDay()];
      return `${DAYS[new Date(w).getUTCDay()].slice(0, 3)} ${f.date(w)}`;
    },
    // "this afternoon", "tonight", "tomorrow morning", "Saturday evening"
    when: (w, now) => {
      const h = new Date(w).getUTCHours(), diff = Math.round((dayStart(w) - dayStart(now)) / DAY);
      const part = h < 5 ? "night" : h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
      if (diff === 0) return part === "night" ? "early this morning" : part === "evening" ? "this evening" : `this ${part}`;
      if (diff === 1 && h < 5) return "overnight";
      const d = diff === 1 ? "tomorrow" : f.day(w, now);
      return part === "night" ? `${d} night` : `${d} ${part}`;
    },
    dur: (sec) => { const m = Math.round(sec / 60); return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m} min`; },
    pct: (p) => (p == null ? "–" : `${Math.round(p)}%`),
  };
  return f;
}

// compass point for a direction the wind blows FROM (degrees)
const POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const WORDS = { N: "north", NE: "north-east", E: "east", SE: "south-east", S: "south", SW: "south-west", W: "west", NW: "north-west" };
export const compass = (deg) => POINTS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
export const compassWord = (deg) => WORDS[["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(((deg % 360) + 360) % 360 / 45) % 8]];
// Beaufort scale, from km/h
const BFT = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118];
const BFT_NAMES = ["Calm", "Light air", "Light breeze", "Gentle breeze", "Moderate breeze", "Fresh breeze", "Strong breeze", "Near gale", "Gale", "Strong gale", "Storm", "Violent storm", "Hurricane force"];
export const beaufort = (kmh) => { let b = 0; while (b < BFT.length && kmh >= BFT[b]) b++; return { force: b, name: BFT_NAMES[b] }; };
