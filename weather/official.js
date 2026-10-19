// Official warnings (the server gathers them from each place's weather service: functions/_wxwarn.js), as the
// app says them: which are still in force, their colour and title, and when. Pure: no page, no network.
//
// A warning: { id, issuer, via, event, level (2 yellow, 3 amber or orange, 4 red), type, headline, text,
// instruction, impacts, onset, expires (ISO times), url, area }

// those not over yet (real time, ms)
export const inForce = (list, real = Date.now()) => (Array.isArray(list) ? list : []).filter((w) => w && Date.parse(w.expires) > real);

// its colour, in the issuer's own word where it gives one (the Met Office's amber is MeteoAlarm's orange)
export function colourOf(w) {
  const said = /^(yellow|amber|orange|red)\b/i.exec(w.event || "");
  if (said) return said[1].toLowerCase();
  if (w.level >= 4) return "red";
  return w.level === 3 ? (/met office/i.test(w.issuer || "") ? "amber" : "orange") : "yellow";
}
// its title: the issuer's name for it, less a colour the badge already says ("Yellow wind warning" → "Wind warning")
export function titleOf(w) {
  const t = String(w.event || "Weather warning").replace(/^(yellow|amber|orange|red)\s+/i, "");
  return t ? t[0].toUpperCase() + t.slice(1) : "Weather warning";
}
// a badge for it: its colour, for warnings that come in colours (the US's are named by kind instead)
export const badgeOf = (w) => (w.via === "MeteoAlarm" ? colourOf(w).replace(/^./, (c) => c.toUpperCase()) : null);

// when, on the place's clock (offset: seconds from UTC; now: the place's wall time): "Until 18:00", "Until
// tomorrow 06:00", "Tomorrow 09:00 to 18:00", "Wednesday 21:00 to Thursday 06:00"
export function spanOf(w, now, f, offset = 0) {
  const wall = (s) => (Number.isFinite(Date.parse(s)) ? Date.parse(s) + offset * 1000 : null);
  const a = wall(w.onset), b = wall(w.expires);
  const day = (t) => f.day(t, now), at = (t, ref) => (day(t) === day(ref) ? f.time(t) : `${day(t)} ${f.time(t)}`);
  const lower = (s) => s.replace(/^(Today|Tomorrow|Yesterday) /, (m) => m.toLowerCase());
  if (b == null) return a != null && a > now ? `From ${day(a)} ${f.time(a)}` : "In force";
  if (a == null || a <= now) return `Until ${lower(at(b, now))}`;
  return `${day(a)} ${f.time(a)} to ${lower(at(b, a))}`;
}

// a glyph for what it's about (MeteoAlarm's awareness types, else the words of its name)
const TYPES = { 1: "wind", 2: "ice", 3: "storm", 4: "fog", 5: "heat", 6: "cold", 7: "wind", 8: "flame", 9: "mountain", 10: "rain", 12: "rain", 13: "rain" };
export function glyphOf(w) {
  if (TYPES[w.type]) return TYPES[w.type];
  const e = String(w.event || "").toLowerCase();
  for (const [re, g] of [[/tornado|thunder|lightning/, "storm"], [/frost|freeze/, "frost"], [/snow|blizzard|winter|ice|sleet/, "snow"],
    [/hurricane|tropical|typhoon|wind|gale|storm/, "wind"], [/flood|rain/, "rain"], [/heat/, "heat"], [/cold|chill/, "cold"],
    [/fog|smoke|dust|visibility/, "fog"], [/fire|red flag/, "flame"], [/avalanche/, "mountain"]]) if (re.test(e)) return g;
  return "warning";
}

// The app's own warnings (worked out from the forecast: insights.js) that an official one says already, by their
// icons: an official wind warning in force or starting within a day and a half makes the app's "Gales" one needless
const SAYS = { wind: ["wind"], rain: ["rain"], storm: ["storm"], snow: ["snow", "ice"], ice: ["snow", "ice"], frost: ["frost"], fog: ["fog"], heat: ["heat"], cold: ["cold"] };
export function covered(list, real = Date.now()) {
  return new Set(inForce(list, real).filter((w) => !(Date.parse(w.onset) > real + 36 * 3600e3)).flatMap((w) => SAYS[glyphOf(w)] || []));
}
