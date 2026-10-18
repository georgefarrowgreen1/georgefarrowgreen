// The radar's sums, kept apart from the map so they can be tested alone:
// the colours (RainViewer's Universal Blue, from their published table, so the
// legend and the forecast's frames match the radar's own), turning a rain rate
// into radar reflectivity (dBZ), the grid of points the forecast's frames are
// made from, painting a frame of them, and the timeline of frames.

// Universal Blue: rain every 2 dBZ from -10 to 66, snow every 5 (hex RGBA)
const RAIN = "-10:63615914,-8:69665c1e,-6:6f6b5f29,-4:75706234,-2:7c75653e,0:827b6949,2:88806c54,4:8e856f5e,6:9e93756e,8:b6a97e82,10:cec08796,12:d6c88faa,14:ded097be,16:6cd1ebff,18:36bae5ff,20:00a3e0ff,22:0091caff,24:007fb4ff,26:0070a3ff,28:006295ff,30:005588ff,32:004e78ff,34:004768ff,36:ffe000ff,38:ffc500ff,40:ffaa00ff,42:ff9500ff,44:ff8100ff,46:f23600ff,48:d91b00ff,50:c10000ff,52:8f0000ff,54:5d0000ff,56:ff9fffff,58:ff8bffff,60:ff77ffff,62:ff62ffff,64:ff4effff,66:ffffffff";
const SNOW = "-10:cfffff00,-5:cbffff3f,0:c7ffff7f,5:c3ffffbf,10:bfffffff,15:9fdfffff,20:7fbfffff,25:5f9fffff,30:4f8fffff,35:3f7fffff,40:2f6fffff,45:1f5fffff,50:0f4fffff,55:003fffff,60:002fffff,65:001fffff";
const table = (s) => s.split(",").map((x) => { const [d, h] = x.split(":"); return [Number(d), [0, 2, 4, 6].map((i) => parseInt(h.slice(i, i + 2), 16))]; });
const RAIN_T = table(RAIN), SNOW_T = table(SNOW);

// rain rate (mm/h) → reflectivity (dBZ), by Marshall and Palmer's Z = 200 R^1.6
export const dbzOf = (mmh) => (mmh > 0 ? 10 * Math.log10(200 * mmh ** 1.6) : -99);
export const mmhOf = (dbz) => (10 ** (dbz / 10) / 200) ** (1 / 1.6);
// the colour for a reflectivity, [r, g, b, a] (0-255); null below the table (nothing to draw)
export function rgbaFor(dbz, snow = false) {
  const t = snow ? SNOW_T : RAIN_T;
  if (!(dbz >= t[0][0])) return null;
  let c = t[0][1];
  for (const [d, rgba] of t) { if (d > dbz) break; c = rgba; }
  return c;
}
export const hexFor = (dbz, snow = false) => { const c = rgbaFor(dbz, snow); return c ? `rgba(${c[0]},${c[1]},${c[2]},${(c[3] / 255).toFixed(2)})` : "transparent"; };
// the legend: what each band of colour means
export const LEGEND = [
  { label: "Drizzle", dbz: 12 }, { label: "Light", dbz: 20 }, { label: "Moderate", dbz: 28 },
  { label: "Heavy", dbz: 38 }, { label: "Very heavy", dbz: 47 }, { label: "Extreme", dbz: 58 },
].map((x) => ({ ...x, mmh: mmhOf(x.dbz) }));
export const MIN_RATE = 0.15, SOFT = 0.35;     // mm/h: lighter than MIN_RATE isn't drawn; up to SOFT it fades in

// The grid the forecast's frames are made from: n × n points, about 220 km across (points about
// 28 km apart), around a place (rows from north to south, each from west to east)
export function grid(lat, lon, n = 9, halfLat = 1) {
  const halfLon = Math.min(4, halfLat / Math.max(0.25, Math.cos((lat * Math.PI) / 180)));
  const north = Math.min(85, lat + halfLat), south = Math.max(-85, lat - halfLat), west = lon - halfLon, east = lon + halfLon;
  const lats = [], lons = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    lats.push(Math.round((north - ((north - south) * r) / (n - 1)) * 100) / 100);
    lons.push(Math.round((((west + ((east - west) * c) / (n - 1)) + 540) % 360 - 180) * 100) / 100);
  }
  return { n, lats, lons, north, south, west, east, id: `${lat.toFixed(1)},${lon.toFixed(1)}` };
}

// Paint one frame into an RGBA buffer (w × h, laid over the grid's box on a Web Mercator map):
// each pixel's rain rate is the blend of the four points around it (eased, so a lone wet point makes a
// round shower rather than a diamond), and the lightest rain fades out rather than ending in a ring.
// rates and snow: one per point.
const ease = (t) => t * t * (3 - 2 * t);
const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
export function paint(buf, w, h, g, rates, snow = null) {
  const yN = merc(g.north), yS = merc(g.south), n = g.n;
  for (let y = 0; y < h; y++) {
    const my = yN + ((yS - yN) * (y + 0.5)) / h, lat = (360 / Math.PI) * Math.atan(Math.exp(my)) - 90;
    const fy = Math.min(n - 1, Math.max(0, ((g.north - lat) / (g.north - g.south)) * (n - 1))), r0 = Math.min(n - 2, Math.floor(fy)), ty = ease(fy - r0);
    for (let x = 0; x < w; x++) {
      const fx = ((x + 0.5) / w) * (n - 1), c0 = Math.min(n - 2, Math.floor(fx)), tx = ease(fx - c0);
      const at = (r, c) => rates[r * n + c] || 0;
      const v = (at(r0, c0) * (1 - tx) + at(r0, c0 + 1) * tx) * (1 - ty) + (at(r0 + 1, c0) * (1 - tx) + at(r0 + 1, c0 + 1) * tx) * ty;
      const o = (y * w + x) * 4;
      if (v < MIN_RATE) { buf[o + 3] = 0; continue; }
      // snow where the nearest point says so
      const near = Math.round(fy) * n + Math.round(fx), col = rgbaFor(dbzOf(v), !!(snow && snow[near]));
      if (!col) { buf[o + 3] = 0; continue; }
      buf[o] = col[0]; buf[o + 1] = col[1]; buf[o + 2] = col[2]; buf[o + 3] = v < SOFT ? Math.round(col[3] * ((v - MIN_RATE) / (SOFT - MIN_RATE))) : col[3];
    }
  }
  return buf;
}

// The timeline: the radar's frames (times in ms), then the forecast's that come after the latest of them,
// up to `ahead` from now. → { frames: [{ kind: "radar" | "model", t, k (its index in its own list) }], now: the latest radar frame's place }
export function timeline(radarTimes, modelTimes, now = Date.now(), ahead = 2 * 3600e3) {
  const frames = radarTimes.map((t, k) => ({ kind: "radar", t, k }));
  const last = frames.length ? frames[frames.length - 1].t : now - 10 * 60e3;
  modelTimes.forEach((t, k) => { if (t > last + 60e3 && t <= now + ahead) frames.push({ kind: "model", t, k }); });
  return { frames, now: Math.max(0, radarTimes.length - 1) };
}
