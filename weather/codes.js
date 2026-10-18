// WMO weather codes (as Open-Meteo gives them): what each means, the icon it
// gets, and the kind of weather it is, for the insights to reason with.
//
// kind: clear, partly, cloudy, fog, drizzle, rain, showers, sleet, snow, storm
// wet:  0 dry, 1 light, 2 moderate, 3 heavy

const C = {
  0: ["Clear", "clear", 0], 1: ["Mostly Clear", "clear", 0], 2: ["Partly Cloudy", "partly", 0], 3: ["Overcast", "cloudy", 0],
  45: ["Fog", "fog", 0], 48: ["Freezing Fog", "fog", 0],
  51: ["Light Drizzle", "drizzle", 1], 53: ["Drizzle", "drizzle", 1], 55: ["Heavy Drizzle", "drizzle", 2],
  56: ["Freezing Drizzle", "sleet", 1], 57: ["Freezing Drizzle", "sleet", 2],
  61: ["Light Rain", "rain", 1], 63: ["Rain", "rain", 2], 65: ["Heavy Rain", "rain", 3],
  66: ["Freezing Rain", "sleet", 2], 67: ["Heavy Freezing Rain", "sleet", 3],
  71: ["Light Snow", "snow", 1], 73: ["Snow", "snow", 2], 75: ["Heavy Snow", "snow", 3], 77: ["Snow Grains", "snow", 1],
  80: ["Light Showers", "showers", 1], 81: ["Showers", "showers", 2], 82: ["Violent Showers", "showers", 3],
  85: ["Snow Showers", "snow", 1], 86: ["Heavy Snow Showers", "snow", 3],
  95: ["Thunderstorms", "storm", 2], 96: ["Thunderstorms with Hail", "storm", 3], 99: ["Severe Thunderstorms with Hail", "storm", 3],
};
export function codeInfo(code) {
  const c = C[code] || C[Math.round(code)] || ["Unknown", "cloudy", 0];
  return { label: c[0], kind: c[1], wet: c[2] };
}
export const label = (code, isDay = true) => {
  const l = codeInfo(code).label;
  return !isDay && (code === 0 || code === 1) ? (code === 0 ? "Clear" : "Mostly Clear") : l;
};
// the icon's name (icons.js): the Sun or the Moon by day or night
export function iconOf(code, isDay = true) {
  const { kind, wet } = codeInfo(code);
  switch (kind) {
    case "clear": return code === 1 ? (isDay ? "mostly-sun" : "mostly-moon") : isDay ? "sun" : "moon";
    case "partly": return isDay ? "partly-sun" : "partly-moon";
    case "cloudy": return "cloud";
    case "fog": return "fog";
    case "drizzle": return "drizzle";
    case "rain": return wet >= 3 ? "heavy-rain" : "rain";
    case "showers": return isDay ? "showers-sun" : "showers-moon";
    case "sleet": return "sleet";
    case "snow": return "snow";
    case "storm": return "storm";
  }
  return "cloud";
}
// how bad (for picking which weather "wins" a stretch of hours): higher is more notable
const RANK = { clear: 0, partly: 1, cloudy: 2, fog: 3, drizzle: 4, showers: 5, rain: 6, sleet: 7, snow: 8, storm: 9 };
export const rank = (code) => RANK[codeInfo(code).kind] ?? 2;
export const isWetCode = (code) => codeInfo(code).wet > 0;
export const isSnowCode = (code) => codeInfo(code).kind === "snow";
