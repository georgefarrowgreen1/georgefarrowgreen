// Cities used to name a roost ("near Leeds") and as a fallback when a phone
// won't share its location. Coordinates are city centres, to 0.01°.
export const PLACES = [
  ["London", 51.51, -0.13], ["Manchester", 53.48, -2.24], ["Birmingham", 52.49, -1.89], ["Leeds", 53.80, -1.55],
  ["Liverpool", 53.41, -2.98], ["Newcastle", 54.98, -1.61], ["Bristol", 51.45, -2.59], ["Sheffield", 53.38, -1.47],
  ["Nottingham", 52.95, -1.15], ["Brighton", 50.82, -0.14], ["Southampton", 50.90, -1.40], ["Norwich", 52.63, 1.30],
  ["Cambridge", 52.21, 0.12], ["Oxford", 51.75, -1.26], ["Exeter", 50.72, -3.53], ["Plymouth", 50.38, -4.14],
  ["Cardiff", 51.48, -3.18], ["Swansea", 51.62, -3.94], ["Edinburgh", 55.95, -3.19], ["Glasgow", 55.86, -4.25],
  ["Aberdeen", 57.15, -2.09], ["Inverness", 57.48, -4.22], ["Belfast", 54.60, -5.93], ["Dublin", 53.35, -6.26],
  ["Cork", 51.90, -8.47], ["York", 53.96, -1.08], ["Leicester", 52.64, -1.13], ["Hull", 53.74, -0.33],
  ["Paris", 48.86, 2.35], ["Lyon", 45.76, 4.84], ["Marseille", 43.30, 5.37], ["Bordeaux", 44.84, -0.58],
  ["Amsterdam", 52.37, 4.90], ["Brussels", 50.85, 4.35], ["Berlin", 52.52, 13.40], ["Munich", 48.14, 11.58],
  ["Hamburg", 53.55, 9.99], ["Frankfurt", 50.11, 8.68], ["Zurich", 47.38, 8.54], ["Vienna", 48.21, 16.37],
  ["Prague", 50.08, 14.44], ["Warsaw", 52.23, 21.01], ["Copenhagen", 55.68, 12.57], ["Stockholm", 59.33, 18.07],
  ["Oslo", 59.91, 10.75], ["Helsinki", 60.17, 24.94], ["Reykjavík", 64.15, -21.94], ["Madrid", 40.42, -3.70],
  ["Barcelona", 41.39, 2.17], ["Lisbon", 38.72, -9.14], ["Rome", 41.90, 12.50], ["Milan", 45.46, 9.19],
  ["Athens", 37.98, 23.73], ["Istanbul", 41.01, 28.98], ["Budapest", 47.50, 19.04], ["Bucharest", 44.43, 26.10],
  ["Kyiv", 50.45, 30.52], ["Moscow", 55.76, 37.62], ["Cairo", 30.04, 31.24], ["Lagos", 6.52, 3.38],
  ["Nairobi", -1.29, 36.82], ["Johannesburg", -26.20, 28.05], ["Cape Town", -33.92, 18.42], ["Casablanca", 33.57, -7.59],
  ["Dubai", 25.20, 55.27], ["Tel Aviv", 32.09, 34.78], ["Mumbai", 19.08, 72.88], ["Delhi", 28.61, 77.21],
  ["Bengaluru", 12.97, 77.59], ["Singapore", 1.35, 103.82], ["Bangkok", 13.76, 100.50], ["Hong Kong", 22.32, 114.17],
  ["Shanghai", 31.23, 121.47], ["Beijing", 39.90, 116.40], ["Seoul", 37.57, 126.98], ["Tokyo", 35.68, 139.69],
  ["Osaka", 34.69, 135.50], ["Manila", 14.60, 120.98], ["Jakarta", -6.21, 106.85], ["Sydney", -33.87, 151.21],
  ["Melbourne", -37.81, 144.96], ["Brisbane", -27.47, 153.03], ["Perth", -31.95, 115.86], ["Auckland", -36.85, 174.76],
  ["New York", 40.71, -74.01], ["Boston", 42.36, -71.06], ["Washington", 38.91, -77.04], ["Chicago", 41.88, -87.63],
  ["Miami", 25.76, -80.19], ["Atlanta", 33.75, -84.39], ["Austin", 30.27, -97.74], ["Denver", 39.74, -104.99],
  ["Los Angeles", 34.05, -118.24], ["San Francisco", 37.77, -122.42], ["Seattle", 47.61, -122.33], ["Toronto", 43.65, -79.38],
  ["Montreal", 45.50, -73.57], ["Vancouver", 49.28, -123.12], ["Mexico City", 19.43, -99.13], ["Bogotá", 4.71, -74.07],
  ["Lima", -12.05, -77.04], ["São Paulo", -23.55, -46.63], ["Rio de Janeiro", -22.91, -43.17], ["Buenos Aires", -34.60, -58.38],
  ["Santiago", -33.45, -70.67],
];

export function nearestPlace(lat, lon) {
  const r = Math.PI / 180;
  let best = null, bestKm = Infinity;
  for (const [name, a, b] of PLACES) {
    const s = Math.sin((a - lat) * r / 2) ** 2 + Math.cos(lat * r) * Math.cos(a * r) * Math.sin((b - lon) * r / 2) ** 2;
    const km = 12742 * Math.asin(Math.sqrt(s));
    if (km < bestKm) { bestKm = km; best = name; }
  }
  return bestKm < 60 ? best : `near ${best}`;
}

// Locations are snapped to a 1-mile grid (about 1.6 km each way, anywhere on
// Earth): plenty for flight times, too coarse to find someone's street.
const MILE_DEG = 1.609344 / 111.32;            // degrees of latitude in a mile
export function snapToMile(lat, lon) {
  const la = Math.max(-90, Math.min(90, Math.round(lat / MILE_DEG) * MILE_DEG));
  const step = MILE_DEG / Math.max(Math.cos(la * Math.PI / 180), 0.01);
  let lo = Math.round(lon / step) * step; if (lo > 180) lo -= 360; if (lo < -180) lo += 360;
  return { lat: Math.round(la * 1e5) / 1e5, lon: Math.round(lo * 1e5) / 1e5 };
}
