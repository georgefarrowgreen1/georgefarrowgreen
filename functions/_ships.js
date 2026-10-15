/* ---------- shipping lanes ----------
   A standard pigeon can't fly an ocean (it would have to fly for days with
   nowhere to land), so on a crossing too long for island hopping it does what
   real pigeons sometimes do: it rides a ship. These are the world's main
   shipping lanes, as a network: ports, and points out at sea where the lanes
   turn (straits, canals and capes), joined where ships sail between them.
   [id, name (ports only; null at sea), lat, lon]. Lanes keep to open water
   (checked against the coastline: node .tools/geo/lanes.mjs). */
import { haversineKm } from "./_pigeon.js";

export const SHIP_KMH = 40;                 // a container ship's pace, about 22 knots
export const NODES = [
  // Europe
  ["SOU", "Southampton", 50.9, -1.4], ["RTM", "Rotterdam", 51.95, 4.1], ["LEH", "Le Havre", 49.48, 0.1], ["LIS", "Lisbon", 38.7, -9.2],
  ["ALG", "Algeciras", 36.13, -5.43], ["GOA", "Genoa", 44.4, 8.92], ["PIR", "Piraeus", 37.94, 23.63], ["REK", "Reykjavík", 64.15, -21.94],
  ["dov", null, 51.0, 1.5], ["eng", null, 49.8, -5.5], ["fin", null, 43.5, -10.5], ["gib", null, 35.95, -5.6], ["alb", null, 37.5, 2.0],
  ["sar", null, 38.5, 8.8], ["sic", null, 36.8, 11.8], ["kyt", null, 36.1, 23.2], ["crt", null, 34.6, 25.0],
  // the Middle East, India
  ["PSD", "Port Said", 31.26, 32.3], ["SUZ", "Suez", 29.95, 32.55], ["JED", "Jeddah", 21.48, 39.17], ["SLL", "Salalah", 16.94, 54.0],
  ["DXB", "Jebel Ali", 25.01, 55.06], ["BOM", "Mumbai", 18.95, 72.84], ["CMB", "Colombo", 6.95, 79.85],
  ["bab", null, 12.6, 43.3], ["adn", null, 12.5, 48.0], ["gua", null, 12.0, 52.0], ["hor", null, 26.6, 56.9], ["had", null, 22.4, 60.5],
  ["lak", null, 9.0, 74.5], ["don", null, 5.6, 80.6],
  // Asia
  ["SIN", "Singapore", 1.26, 103.84], ["HKG", "Hong Kong", 22.3, 114.17], ["SHA", "Shanghai", 30.6, 122.07], ["PUS", "Busan", 35.1, 129.04],
  ["YOK", "Yokohama", 35.45, 139.65], ["MNL", "Manila", 14.58, 120.97],
  ["mal", null, 6.3, 95.5], ["scs", null, 10.0, 112.0], ["tw", null, 24.5, 119.8], ["kyu", null, 31.0, 131.5],
  // Australia and New Zealand
  ["SYD", "Sydney", -33.85, 151.21], ["FRE", "Fremantle", -32.05, 115.74], ["AKL", "Auckland", -36.84, 174.77],
  ["ind", null, -20.0, 108.0], ["cba", null, -38.0, 135.0], ["bas", null, -39.5, 146.5], ["how", null, -38.0, 150.5],
  // the Pacific
  ["HNL", "Honolulu", 21.31, -157.87], ["np1", null, 44.0, 165.0], ["np2", null, 47.0, -150.0], ["jdf", null, 48.4, -124.8],
  // the Americas
  ["VAN", "Vancouver", 49.29, -123.11], ["LAX", "Los Angeles", 33.73, -118.26], ["BAL", "Balboa", 8.95, -79.57], ["COL", "Colón", 9.36, -79.9],
  ["MIA", "Miami", 25.77, -80.17], ["NYC", "New York", 40.67, -74.05], ["HAL", "Halifax", 44.64, -63.57], ["SAN", "Santos", -23.96, -46.3],
  ["BUE", "Buenos Aires", -34.6, -58.37],
  ["baj", null, 22.0, -111.5], ["mex", null, 13.5, -95.5], ["win", null, 20.0, -73.7], ["hat", null, 35.0, -74.5], ["nan", null, 40.5, -69.5],
  ["bah", null, -15.0, -37.5], ["brz", null, -7.5, -34.0], ["uru", null, -36.0, -54.0],
  // the Atlantic
  ["natl", null, 47.0, -35.0], ["azo", null, 38.5, -28.0], ["can", null, 28.0, -16.0],
  // Africa
  ["DKR", "Dakar", 14.68, -17.43], ["LOS", "Lagos", 6.43, 3.39], ["CPT", "Cape Town", -33.91, 18.43], ["DUR", "Durban", -29.87, 31.03],
  ["MOM", "Mombasa", -4.06, 39.67],
  ["pal", null, 4.0, -9.0], ["ang", null, -15.0, 8.0], ["cgh", null, -35.5, 18.5], ["moz", null, -22.0, 40.0], ["som", null, 2.0, 50.5],
  ["svc", null, 36.8, -9.2], ["omn", null, 18.5, 58.5], ["gulf", null, 26.3, 55.5], ["ms1", null, 4.0, 99.3], ["ms2", null, 2.2, 101.8],
  ["chn1", null, 21.8, 115.5], ["chn2", null, 27.5, 122.5], ["tsu", null, 34.0, 129.3], ["goto", null, 32.0, 128.8], ["shik", null, 32.5, 134.5],
  ["izu", null, 34.4, 139.4], ["tky", null, 34.8, 140.2], ["cal", null, 33.5, -120.5], ["leu", null, -35.0, 114.3], ["bcn", null, 30.0, -117.5],
  ["cri", null, 9.5, -87.0], ["pan1", null, 6.8, -81.0], ["pan2", null, 7.3, -79.5], ["nj", null, 39.5, -73.5], ["nyb", null, 40.3, -73.5],
  ["rey", null, 63.6, -23.5], ["gui", null, 9.0, -16.5], ["gha", null, 3.5, -2.0], ["agu", null, -36.5, 21.0], ["pe", null, -34.8, 27.0],
  ["ec", null, -32.5, 30.0], ["cdl", null, -14.0, 42.5], ["tz", null, -6.0, 40.5], ["cfr", null, -24.5, -42.0], ["abr", null, -19.5, -37.5], ["irl", null, 54.5, -12.5], ["irs", null, 51.0, -11.5], ["kag", null, 30.8, 129.8],
];
export const LANES = [
  "SOU-eng", "LEH-eng", "RTM-dov", "dov-eng", "eng-fin", "fin-LIS", "LIS-svc", "svc-gib", "ALG-gib", "gib-alb", "alb-GOA", "alb-sar", "sar-sic",
  "sic-crt", "sic-kyt", "kyt-PIR", "crt-PSD", "PSD-SUZ", "SUZ-JED", "JED-bab", "bab-adn", "adn-SLL", "adn-gua", "SLL-omn", "omn-had",
  "DXB-gulf", "gulf-hor", "hor-had", "had-gua", "had-BOM", "gua-BOM", "BOM-lak", "lak-don", "CMB-don", "don-mal", "mal-ms1", "ms1-ms2",
  "ms2-SIN", "SIN-scs", "scs-HKG", "scs-MNL", "HKG-chn1", "chn1-tw", "tw-chn2", "chn2-SHA", "SHA-PUS", "SHA-goto", "PUS-tsu", "tsu-goto",
  "goto-kag", "kag-kyu", "kyu-shik", "shik-izu", "izu-tky", "YOK-tky", "tky-np1", "np1-np2", "np2-jdf", "jdf-VAN", "np2-cal", "cal-LAX", "tky-HNL",
  "HNL-LAX", "HNL-jdf", "HNL-SYD", "HNL-AKL", "SYD-AKL", "SYD-how", "how-bas", "bas-cba", "cba-leu", "leu-FRE", "FRE-ind", "ind-don",
  "LAX-bcn", "bcn-baj", "baj-mex", "mex-cri", "cri-pan1", "pan1-pan2", "pan2-BAL", "BAL-COL", "COL-win", "win-hat", "MIA-hat", "hat-nj",
  "nj-nyb", "NYC-nyb", "nyb-nan", "nan-HAL", "nyb-natl", "HAL-natl", "natl-eng", "natl-rey", "REK-rey", "rey-irl", "irl-irs", "irs-eng", "nyb-azo", "azo-LIS",
  "azo-gib", "gib-can", "LIS-can", "can-DKR", "DKR-gui", "gui-pal", "pal-gha", "gha-LOS", "LOS-ang", "ang-CPT", "CPT-cgh", "cgh-agu",
  "agu-pe", "pe-ec", "ec-DUR", "DUR-moz", "moz-cdl", "cdl-tz", "tz-MOM", "MOM-som", "som-gua", "cgh-FRE", "cgh-SAN", "SAN-cfr",
  "cfr-abr", "abr-bah", "bah-brz", "brz-DKR", "BUE-uru", "uru-SAN",
];

const byId = new Map(NODES.map((n) => [n[0], n]));
const adj = new Map(NODES.map((n) => [n[0], []]));
for (const l of LANES) {
  const [a, b] = l.split("-"), A = byId.get(a), B = byId.get(b);
  const km = haversineKm(A[2], A[3], B[2], B[3]);
  adj.get(a).push([b, km]); adj.get(b).push([a, km]);
}
const PORTS = NODES.filter((n) => n[1]);
// the ports nearest a point (within `most` km), nearest first
export function portsNear(lat, lon, most = 900, n = 3) {
  return PORTS.map((p) => [p, haversineKm(lat, lon, p[2], p[3])]).filter(([, d]) => d <= most).sort((a, b) => a[1] - b[1]).slice(0, n);
}
// The way by sea from one port to another: [node, ...] and how far (km); null if none
export function lane(a, b) {
  const dist = new Map([[a, 0]]), prev = new Map(), done = new Set();
  for (;;) {
    let u = null, du = Infinity;
    for (const [k, d] of dist) if (!done.has(k) && d < du) { u = k; du = d; }
    if (u == null) return null;
    if (u === b) break;
    done.add(u);
    for (const [v, km] of adj.get(u)) if (!done.has(v) && du + km < (dist.get(v) ?? Infinity)) { dist.set(v, du + km); prev.set(v, u); }
  }
  const ids = [b]; while (ids[0] !== a) ids.unshift(prev.get(ids[0]));
  return { nodes: ids.map((id) => byId.get(id)), km: dist.get(b) };
}
