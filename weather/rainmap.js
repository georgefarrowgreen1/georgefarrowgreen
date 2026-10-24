// The radar's sums, kept apart from the map so they can be tested alone:
// the colours (RainViewer's Universal Blue, from their published table, to read
// their tiles back into rain; drawn again in the app's own, after Apple's Weather
// map: SHADES), turning a rain rate
// into radar reflectivity (dBZ), the grid of points the forecast's frames are
// made from, painting a frame of them, and the timeline of frames; and the rain
// at a place over the next two hours from the radar, with the models' after it.

import { isWetCode, wetAt } from "./codes.js";

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
// The colours it's drawn in, after Apple's Weather map: light rain a see-through blue, moderate purple, then pink and
// orange into heavy's yellow, extreme a pale yellow; snow in cyans to teal. Stops of dBZ: [r, g, b, alpha 0-1], filled
// in at every dB from -10 to 65 (as Universal Blue's table is, so they line up: ramp)
const SHADES = {
  // (sampled from Apple's own legend, light blue at the foot to pale yellow at the top, and laid along the dBZ: light
  // rain to 2.5 mm an hour, moderate to 10, heavy to 50, extreme beyond; a little see-through, as Apple's map draws it)
  rain: [[-10, 117, 194, 245, 0], [6, 117, 194, 245, 0], [10, 117, 194, 245, 0.3], [12.7, 103, 178, 245, 0.42], [15.5, 92, 163, 244, 0.52], [18.3, 84, 152, 245, 0.62],
    [21, 86, 141, 242, 0.68], [23.8, 104, 131, 235, 0.72], [26.5, 130, 120, 227, 0.76], [29.3, 162, 111, 221, 0.78], [31.4, 178, 118, 203, 0.8], [33.2, 188, 135, 178, 0.8],
    [35, 199, 154, 153, 0.8], [36.8, 208, 172, 130, 0.82], [38.6, 219, 192, 108, 0.84], [40.4, 231, 214, 91, 0.86], [42.1, 243, 235, 83, 0.88], [44, 255, 255, 85, 0.9],
    [47.9, 255, 255, 106, 0.9], [51.9, 255, 255, 155, 0.92], [55.8, 255, 255, 212, 0.94], [60, 255, 255, 244, 0.96], [65, 255, 255, 250, 0.96]],
  snow: [[-10, 150, 225, 240, 0], [-2, 150, 225, 240, 0], [0, 150, 225, 240, 0.45], [8, 120, 215, 238, 0.6], [15, 90, 205, 230, 0.72], [22, 60, 190, 222, 0.82],
    [30, 40, 175, 212, 0.9], [38, 28, 150, 198, 0.96], [45, 20, 135, 188, 1], [55, 16, 112, 170, 1], [65, 15, 95, 155, 1]],
};
const shades = (stops) => Array.from({ length: 76 }, (_, i) => {
  const d = i - 10, k = Math.max(1, stops.findIndex((s) => s[0] >= d)), [d0, ...a] = stops[k - 1], [d1, ...b] = stops[k], t = d1 > d0 ? Math.min(1, Math.max(0, (d - d0) / (d1 - d0))) : 0;
  return [0, 1, 2].map((j) => Math.round(a[j] + (b[j] - a[j]) * t)).concat(Math.round((a[3] + (b[3] - a[3]) * t) * 255));
});
const SHOWN = { rain: shades(SHADES.rain), snow: shades(SHADES.snow) };
// the colour it's drawn in at a reflectivity, [r, g, b, a] (0-255); null where it isn't drawn
export function shade(dbz, snow = false) {
  const c = SHOWN[snow ? "snow" : "rain"][Math.round(Math.min(65, Math.max(-10, dbz))) + 10];
  return c[3] ? c : null;
}
// the legend: what each band of colour means
export const LEGEND = [
  { label: "Drizzle", dbz: 12 }, { label: "Light", dbz: 20 }, { label: "Moderate", dbz: 28 },
  { label: "Heavy", dbz: 38 }, { label: "Very heavy", dbz: 47 }, { label: "Extreme", dbz: 58 },
].map((x) => ({ ...x, mmh: mmhOf(x.dbz) }));
export const MIN_RATE = 0.15, SOFT = 0.35;     // mm/h: lighter than MIN_RATE isn't drawn; up to SOFT it fades in

// Smoothing the radar's own tiles. RainViewer's free tiles stop at zoom 7, so closer in each of their pixels
// covers many of the screen's, and drawn as they are they're squares. Instead: read each pixel's colour back
// into reflectivity (Universal Blue at every dBZ, -10 to 65, rain then snow), blend those with a cubic
// B-spline (smooth, and never overshooting), and colour the blend: curved edges, and colours that flow.
const FULL_RAIN = "6361591466635a1969665c1e6c685d246f6b5f29726e612e75706234787364397c75653e7f786744827b6949857d6a4e88806c548b826d598e856f5e928871649e93756eaa9e7978b6a97e82c2b4828ccec08796d2c48ba0d6c88faadacc93b4ded097be88ddeeff6cd1ebff51c5e8ff36bae5ff1baee2ff00a3e0ff009ad5ff0091caff0088bfff007fb4ff0077aaff0070a3ff00699cff006295ff005b8eff005588ff005180ff004e78ff004a70ff004768ffffee00ffffe000ffffd200ffffc500ffffb700ffffaa00ffff9f00ffff9500ffff8b00ffff8100ffff4400fff23600ffe62800ffd91b00ffcd0d00ffc10000ffa80000ff8f0000ff760000ff5d0000ffffaaffffff9fffffff95ffffff8bffffff81ffffff77ffffff6cffffff62ffffff58ffffff4effffffffffff";
const FULL_SNOW = "cfffff00ceffff0ccdffff19ccffff26cbffff33cbffff3fcaffff4cc9ffff59c8ffff66c7ffff72c7ffff7fc6ffff8cc5ffff99c4ffffa5c3ffffb2c3ffffbfc2ffffccc1ffffd8c0ffffe5bffffff2bfffffffb8f8ffffb2f2ffffabebffffa5e5ffff9fdfffff98d8ffff92d2ffff8bcbffff85c5ffff7fbfffff78b8ffff72b2ffff6babffff65a5ffff5f9fffff5b9bffff5898ffff5595ffff5292ffff4f8fffff4b8bffff4888ffff4585ffff4282ffff3f7fffff3b7bffff3878ffff3575ffff3272ffff2f6fffff2b6bffff2868ffff2565ffff2262ffff1f5fffff1b5bffff1858ffff1555ffff1252ffff0f4fffff0c4bffff0948ffff0645ffff0242ffff003fffff003bffff0038ffff0035ffff0032ffff002fffff002bffff0028ffff0025ffff0022ffff001fffff";
const full = (s) => Array.from({ length: s.length / 8 }, (_, i) => [0, 2, 4, 6].map((j) => parseInt(s.slice(i * 8 + j, i * 8 + j + 2), 16)));
const FR = full(FULL_RAIN), FS = full(FULL_SNOW);
const pack = (r, g, b, a) => ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
// a pixel's code: 0 clear, 1-76 rain (dBZ + 11), 101-176 snow (dBZ + 111)
const CODE = new Map();
FR.forEach((c, i) => CODE.set(pack(...c), i + 1));
FS.forEach((c, i) => { if (!CODE.has(pack(...c))) CODE.set(pack(...c), i + 101); });
function nearest(r, g, b) {
  let best = 0, bd = Infinity;
  FR.forEach((c, i) => { const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2; if (d < bd) { bd = d; best = i + 1; } });
  return best;
}
// a tile's RGBA pixels → its codes (a Uint8Array, one a pixel)
export function decode(rgba) {
  const out = new Uint8Array(rgba.length / 4);
  for (let i = 0, o = 0; i < rgba.length; i += 4, o++) {
    if (rgba[i + 3] === 0) continue;
    const k = pack(rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]);
    let c = CODE.get(k);
    if (c === undefined) { c = nearest(rgba[i], rgba[i + 1], rgba[i + 2]); CODE.set(k, c); }
    out[o] = c;
  }
  return out;
}
// The colours as a ramp every quarter of a dB, -10 to 65 (the app's own: SHADES): as they are (soft 0), or each the
// average of its neighbours over about ±soft dB (in linear light), so they flow
const ramps = new Map();
export function ramp(snow, soft = 0) {
  const key = `${snow ? "s" : "r"}${soft}`;
  if (ramps.has(key)) return ramps.get(key);
  const t = snow ? SHOWN.snow : SHOWN.rain, n = (t.length - 1) * 4 + 1, out = new Uint8ClampedArray(n * 4);
  const lin = (v) => (v / 255) ** 2.2, gam = (v) => 255 * v ** (1 / 2.2);
  for (let q = 0; q < n; q++) {
    const d = q / 4;
    if (!soft) { out.set(t[Math.round(d)], q * 4); continue; }
    let r = 0, g = 0, b = 0, a = 0, w = 0;
    for (let i = Math.max(0, Math.floor(d - 2 * soft)); i <= Math.min(t.length - 1, Math.ceil(d + 2 * soft)); i++) {
      const k = Math.exp(-(((i - d) / soft) ** 2)), al = t[i][3] / 255;
      r += k * al * lin(t[i][0]); g += k * al * lin(t[i][1]); b += k * al * lin(t[i][2]); a += k * al; w += k;
    }
    out.set(a ? [gam(r / a), gam(g / a), gam(b / a), (255 * a) / w] : [0, 0, 0, 0], q * 4);
  }
  ramps.set(key, out);
  return out;
}
// Fill `out` (w × w RGBA) from the square of a tile's pixels starting at (x0, y0), `span` pixels across.
// code(x, y): the code of the pixel there (it may reach just past the tile, into its neighbours).
// look: { edge: [from, to] (how much of the blend must be rain for it to show, fading in between), soft (dB) }
const bspline = (t, w) => { const u = 1 - t; w[0] = (u * u * u) / 6; w[1] = (3 * t * t * t - 6 * t * t + 4) / 6; w[2] = (-3 * t * t * t + 3 * t * t + 3 * t + 1) / 6; w[3] = (t * t * t) / 6; return w; };
export function resample(out, w, code, x0, y0, span, look = { edge: [0.22, 0.45], soft: 0 }) {
  const wx = new Float64Array(4), wy = new Float64Array(4), rr = ramp(false, look.soft), rs = ramp(true, look.soft), [e0, e1] = look.edge;
  const cs = new Uint8Array(16);
  for (let y = 0; y < w; y++) {
    const sy = y0 + ((y + 0.5) * span) / w - 0.5, iy = Math.floor(sy);
    bspline(sy - iy, wy);
    for (let x = 0; x < w; x++) {
      const sx = x0 + ((x + 0.5) * span) / w - 0.5, ix = Math.floor(sx);
      bspline(sx - ix, wx);
      let cov = 0, sum = 0, snow = 0;
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
        const c = cs[j * 4 + i] = code(ix - 1 + i, iy - 1 + j);
        if (!c) continue;
        const k = wx[i] * wy[j];
        cov += k; sum += k * (c > 100 ? c - 111 : c - 11); if (c > 100) snow += k;
      }
      const o = (y * w + x) * 4;
      if (cov <= e0) { out[o + 3] = 0; continue; }
      const f = cov >= e1 ? 1 : ((cov - e0) / (e1 - e0)) ** 2 * (3 - 2 * (cov - e0) / (e1 - e0));
      const q = Math.round(Math.min(75, Math.max(0, sum / cov + 10)) * 4) * 4, t = snow > cov / 2 ? rs : rr;
      out[o] = t[q]; out[o + 1] = t[q + 1]; out[o + 2] = t[q + 2]; out[o + 3] = t[q + 3] * f;
    }
  }
  return out;
}

// The same smoothing kept as rain rather than colour, so two frames can be blended as rain is (radar.js, radarmix.js):
// for each pixel, how much of it the rain covers (c, 0 to 1: resample's edge, faded the same), its strength (x: dBZ + 10
// over 75, 0 to 1) and how much of it is snow (s, 0 to 1), each times c ("premultiplied": blending two frames, or a
// pixel with its neighbours, then blends the rain where it is) → R = x·c, G = c, B = s·c (×255), A = 255. colour()
// turns them into the radar's colours, as resample would have drawn them
//
// code: a function (x, y) → the code there, or (much the quicker) the codes about the square stitched into one array,
// { data, w, h, ox, oy } (data[(y - oy) * w + (x - ox)], nothing outside it): the same sums, each column's and row's
// weights worked out once, the codes read straight out (radar.js, off the page's own thread: radarwork.js)
export function rainValues(out, w, code, x0, y0, span, look = { edge: [0.22, 0.45], soft: 0 }) {
  if (typeof code !== "function") return rainValuesFrom(out, w, code, x0, y0, span, look);
  const wx = new Float64Array(4), wy = new Float64Array(4), [e0, e1] = look.edge;
  for (let y = 0; y < w; y++) {
    const sy = y0 + ((y + 0.5) * span) / w - 0.5, iy = Math.floor(sy);
    bspline(sy - iy, wy);
    for (let x = 0; x < w; x++) {
      const sx = x0 + ((x + 0.5) * span) / w - 0.5, ix = Math.floor(sx);
      bspline(sx - ix, wx);
      let cov = 0, sum = 0, snow = 0;
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
        const c = code(ix - 1 + i, iy - 1 + j);
        if (!c) continue;
        const k = wx[i] * wy[j];
        cov += k; sum += k * (c > 100 ? c - 111 : c - 11); if (c > 100) snow += k;
      }
      const o = (y * w + x) * 4;
      out[o + 3] = 255;
      if (cov <= e0) { out[o] = out[o + 1] = out[o + 2] = 0; continue; }
      const f = cov >= e1 ? 1 : ((cov - e0) / (e1 - e0)) ** 2 * (3 - 2 * (cov - e0) / (e1 - e0));
      const x01 = Math.min(75, Math.max(0, sum / cov + 10)) / 75;
      out[o] = Math.round(x01 * f * 255); out[o + 1] = Math.round(f * 255); out[o + 2] = snow > cov / 2 ? Math.round(f * 255) : 0;
    }
  }
  return out;
}
function rainValuesFrom(out, w, src, x0, y0, span, look) {
  const [e0, e1] = look.edge, { data, w: sw, h: sh, ox, oy } = src, t4 = new Float64Array(4);
  const cols = new Int32Array(w), cw = new Float64Array(w * 4), rows = new Int32Array(w), rw = new Float64Array(w * 4);
  for (let x = 0; x < w; x++) { const sx = x0 + ((x + 0.5) * span) / w - 0.5, ix = Math.floor(sx); bspline(sx - ix, t4); cols[x] = ix - 1 - ox; cw.set(t4, x * 4); }
  for (let y = 0; y < w; y++) { const sy = y0 + ((y + 0.5) * span) / w - 0.5, iy = Math.floor(sy); bspline(sy - iy, t4); rows[y] = iy - 1 - oy; rw.set(t4, y * 4); }
  for (let y = 0; y < w; y++) {
    const r0 = rows[y], y4 = y * 4;
    for (let x = 0; x < w; x++) {
      const c0 = cols[x], x4 = x * 4;
      let cov = 0, sum = 0, snow = 0;
      for (let j = 0; j < 4; j++) {
        const ry = r0 + j;
        if (ry < 0 || ry >= sh) continue;
        const at = ry * sw, wj = rw[y4 + j];
        for (let i = 0; i < 4; i++) {
          const cx = c0 + i;
          if (cx < 0 || cx >= sw) continue;
          const c = data[at + cx];
          if (!c) continue;
          const k = cw[x4 + i] * wj;
          cov += k; sum += k * (c > 100 ? c - 111 : c - 11); if (c > 100) snow += k;
        }
      }
      const o = (y * w + x) * 4;
      out[o + 3] = 255;
      if (cov <= e0) { out[o] = out[o + 1] = out[o + 2] = 0; continue; }
      const f = cov >= e1 ? 1 : ((cov - e0) / (e1 - e0)) ** 2 * (3 - 2 * (cov - e0) / (e1 - e0));
      const x01 = Math.min(75, Math.max(0, sum / cov + 10)) / 75;
      out[o] = Math.round(x01 * f * 255); out[o + 1] = Math.round(f * 255); out[o + 2] = snow > cov / 2 ? Math.round(f * 255) : 0;
    }
  }
  return out;
}
// The radar's colours by strength (x × 255, as rainValues keeps it), 256 of them, RGBA: rain's or snow's
const palettes = new Map();
export function palette(snow, soft = 0) {
  const key = `${snow ? "s" : "r"}${soft}`;
  if (palettes.has(key)) return palettes.get(key);
  const t = ramp(snow, soft), out = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) out.set(t.subarray(Math.round((i / 255) * 300) * 4, Math.round((i / 255) * 300) * 4 + 4), i * 4);
  palettes.set(key, out);
  return out;
}
// rainValues' pixels in the radar's colours (out: RGBA, as many) — the same sums radarmix.js's shader does
export function colour(vals, out, soft = 0) {
  const pr = palette(false, soft), ps = palette(true, soft);
  for (let o = 0; o < vals.length; o += 4) {
    const c = vals[o + 1];
    if (!c) { out[o + 3] = 0; continue; }
    const i = Math.round(Math.min(1, vals[o] / c) * 255) * 4, t = vals[o + 2] * 2 > c ? ps : pr;
    out[o] = t[i]; out[o + 1] = t[i + 1]; out[o + 2] = t[i + 2]; out[o + 3] = Math.round((t[i + 3] * c) / 255);
  }
  return out;
}

// How the rain is moving, from two frames of radar (tile codes, w × h, the older first): each boiled down
// to blocks of `cell` pixels (rain heavier than `min` dBZ, so drizzle and clutter don't steer it), then the
// shift, up to `reach` blocks each way, that lines them up best (normalised cross-correlation), refined to a
// fraction of a block. → { dx, dy (pixels, older to newer), score (0-1) }, or null with too little rain to go on
export function motion(older, newer, w, h, { cell = 6, reach = 9, min = 15 } = {}) {
  // (each pixel once, into the fine blocks; the coarse ones are four fine ones each)
  const col = new Int32Array(w); for (let x = 0; x < w; x++) col[x] = (x / cell) | 0;
  const boil = (codes) => {
    const W = Math.floor(w / cell), H = Math.floor(h / cell), out = new Float32Array(W * H);
    for (let y = 0; y < H * cell; y++) {
      const row = y * w, o = ((y / cell) | 0) * W;
      for (let x = 0; x < W * cell; x++) {
        const c = codes[row + x];
        if (c) { const d = c > 100 ? c - 111 : c - 11; if (d >= min) out[o + col[x]] += d - min + 1; }
      }
    }
    return { W, H, v: out };
  };
  const halve = (f) => {
    const W = f.W >> 1, H = f.H >> 1, out = new Float32Array(W * H);
    for (let y = 0; y < H * 2; y++) for (let x = 0; x < W * 2; x++) out[(y >> 1) * W + (x >> 1)] += f.v[y * f.W + x];
    return { W, H, v: out };
  };
  const count = (f) => { let n = 0; for (const x of f.v) if (x) n++; return n; };
  const score = (A, B, dx, dy) => {
    const { W, H } = A; let s = 0, a2 = 0, b2 = 0;
    for (let y = Math.max(0, -dy); y < Math.min(H, H - dy); y++) {
      const ra = y * W, rb = (y + dy) * W + dx;
      for (let x = Math.max(0, -dx); x < Math.min(W, W - dx); x++) { const a = A.v[ra + x], b = B.v[rb + x]; s += a * b; a2 += a * a; b2 += b * b; }
    }
    return a2 && b2 ? s / Math.sqrt(a2 * b2) : 0;
  };
  // coarse first (blocks twice the size), then the fine blocks around the best of those
  const A = boil(older), B = boil(newer), cA = halve(A), cB = halve(B);
  if (count(cA) < 6 || count(cB) < 6) return null;
  const r2 = Math.ceil(reach / 2);
  let c = { dx: 0, dy: 0, v: -1 };
  for (let dy = -r2; dy <= r2; dy++) for (let dx = -r2; dx <= r2; dx++) { const v = score(cA, cB, dx, dy); if (v > c.v) c = { dx, dy, v }; }
  const n = 5, at = new Float64Array(n * n);
  let best = { dx: 0, dy: 0, v: -1 };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const dx = c.dx * 2 + i - 2, dy = c.dy * 2 + j - 2, v = Math.abs(dx) <= reach && Math.abs(dy) <= reach ? score(A, B, dx, dy) : 0;
    at[j * n + i] = v;
    if (v > best.v) best = { dx, dy, v, i, j };
  }
  // a parabola through the best and its neighbours, each way: the shift to a fraction of a block
  const get = (i, j) => (i >= 0 && j >= 0 && i < n && j < n ? at[j * n + i] : best.v);
  const frac = (m, mid, p) => { const d = m - 2 * mid + p; return d < 0 ? Math.max(-0.5, Math.min(0.5, (m - p) / (2 * d))) : 0; };
  const fx = frac(get(best.i - 1, best.j), best.v, get(best.i + 1, best.j)), fy = frac(get(best.i, best.j - 1), best.v, get(best.i, best.j + 1));
  return { dx: (best.dx + fx) * cell, dy: (best.dy + fy) * cell, score: best.v };
}

// The grid the forecast's frames are made from: n × n points, about 220 km across (points about
// 28 km apart), around a place (rows from north to south, each from west to east)
export function grid(lat, lon, n = 9, halfLat = 1, maxLon = 4) {
  const halfLon = Math.min(maxLon, halfLat / Math.max(0.25, Math.cos((lat * Math.PI) / 180)));
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
      const near = Math.round(fy) * n + Math.round(fx), col = shade(dbzOf(v), !!(snow && snow[near]));
      if (!col) { buf[o + 3] = 0; continue; }
      buf[o] = col[0]; buf[o + 1] = col[1]; buf[o + 2] = col[2]; buf[o + 3] = v < SOFT ? Math.round(col[3] * ((v - MIN_RATE) / (SOFT - MIN_RATE))) : col[3];
    }
  }
  return buf;
}

// The timeline: the radar's frames (times in ms), then the forecast's that come after the latest of them,
// up to `ahead` from now. → { frames: [{ kind: "radar" | "model", t, k (its index in its own list) }], now: the latest radar frame's place }
export function timeline(radarTimes, modelTimes, now = Date.now(), ahead = 2 * 3600e3, hourTimes = []) {
  const frames = radarTimes.map((t, k) => ({ kind: "radar", t, k }));
  const last = frames.length ? frames[frames.length - 1].t : now - 10 * 60e3;
  modelTimes.forEach((t, k) => { if (t > last + 60e3 && t <= now + ahead) frames.push({ kind: "model", t, k }); });
  // then the models' hours, on from the end of those (split), to twelve hours or so ahead
  const split = frames.length ? frames[frames.length - 1].t : now;
  hourTimes.forEach((t, k) => { if (t > split + 60e3) frames.push({ kind: "hour", t, k }); });
  return { frames, now: Math.max(0, radarTimes.length - 1), split };
}

// What's on the map at a time t (ms) between the frames, to the minute (radar.js draws it): between two of the radar's,
// the earlier carried on along the way the rain's going and the later brought back to meet it, each faded into the other
// as the minutes pass; after the latest, the latest carried on along its track to the minute (as its forecast frames
// are), fading a little the further ahead; the models', the quarter hours either side blended (and from the latest
// radar, faded into their first). src: { past: [{ time (s) }], drift: { vx, vy } (the latest's way, zoom-7 pixels a
// minute, or null), driftOf(k): the rain's own way between frames k and k + 1 where it's known (else the latest's, or
// none), models: [{ t, k }]
// (the timeline's frames of the models', in order; none where the radar's carried on), model: { rain, snow } }; and
// after split (the end of those two hours), the models' hours (hourly: their frames; hours: { rain, snow }), blended
// from what was on show at split into the first of them, then hour into hour.
// → [{ k (a radar frame), dx, dy (zoom-7 pixels it's moved), alpha }] and [{ rates, snow, alpha }] of the models'
export function partsAt(src, t) {
  const { past = [], models = [], model, hourly = [], hours, split } = src, last = past.length ? past[past.length - 1].time * 1000 : null;
  const still = { vx: 0, vy: 0 };
  if (hourly.length && hours && split != null && t > split) {
    const H = hourly[0];
    if (t < H.t) {
      const a = Math.min(1, (t - split) / (H.t - split)), before = partsAt({ ...src, hourly: [] }, split).map((x) => ({ ...x, alpha: x.alpha * (1 - a) }));
      return [...before.filter((x) => x.alpha > 0), { rates: hours.rain[H.k], snow: hours.snow[H.k], alpha: a }];
    }
    return between(hourly, hours, t);
  }
  if (last != null && t <= last) {
    let k = 0;
    while (k < past.length - 2 && past[k + 1].time * 1000 <= t) k++;
    const ta = past[k].time * 1000, tb = past[k + 1] ? past[k + 1].time * 1000 : ta;
    if (tb <= ta || t <= ta) return [{ k, dx: 0, dy: 0, alpha: 1 }];
    if (t >= tb) return [{ k: k + 1, dx: 0, dy: 0, alpha: 1 }];
    const a = (t - ta) / (tb - ta), mins = (tb - ta) / 60e3, v = src.driftOf?.(k) || src.drift || still;
    return [{ k, dx: v.vx * mins * a, dy: v.vy * mins * a, alpha: 1 - a }, { k: k + 1, dx: -v.vx * mins * (1 - a), dy: -v.vy * mins * (1 - a), alpha: a }];
  }
  if (!models.length || !model) {
    if (last == null) return [];
    const lead = (t - last) / 60e3, v = src.drift || still;
    return [{ k: past.length - 1, dx: v.vx * lead, dy: v.vy * lead, alpha: 1 - 0.3 * Math.min(1, lead / 120) }];
  }
  const at = (m) => ({ rates: model.rain[m.k], snow: model.snow[m.k] });
  if (t <= models[0].t) {
    const a = last == null ? 1 : Math.max(0, Math.min(1, (t - last) / (models[0].t - last)));
    return [...(a < 1 ? [{ k: past.length - 1, dx: 0, dy: 0, alpha: 1 - a }] : []), ...(a > 0 ? [{ ...at(models[0]), alpha: a }] : [])];
  }
  return between(models, model, t);
}
// (the models' frames either side of t, their rates blended, snow where the nearer has it; past the last, the last)
function between(frames, series, t) {
  let j = 0;
  while (j < frames.length - 2 && frames[j + 1].t <= t) j++;
  const A = frames[j], B = frames[j + 1];
  if (!B || t >= B.t) return [{ rates: series.rain[(B || A).k], snow: series.snow[(B || A).k], alpha: 1 }];
  const a = Math.max(0, (t - A.t) / (B.t - A.t)), ra = series.rain[A.k], rb = series.rain[B.k];
  return [{ rates: ra.map((r, p) => r + ((rb[p] ?? 0) - r) * a), snow: a < 0.5 ? series.snow[A.k] : series.snow[B.k], alpha: 1 }];
}
// Web Mercator tiles: where a place is on zoom z's tiles (fractions of a tile, from the world's top left), and where a
// tile's top left corner is ([lat, lon])
export function tileOf(lat, lon, z) {
  const n = 2 ** z, la = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
  return [((lon + 180) / 360) * n, ((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2) * n];
}
export const cornerOf = (x, y, z) => { const n = 2 ** z; return [(Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI, (x / n) * 360 - 180]; };

// Where a place is on the radar's grid: zoom 7's pixels (256 to a tile), from the world's top left
export function pixelOf(lat, lon) {
  const world = 2 ** 7 * 256, la = (lat * Math.PI) / 180;
  return [((lon + 180) / 360) * world, ((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2) * world];
}
// A square of radar (or of where it sees) about a place, w of zoom 7's pixels across (768: about 550 km): the 512-pixel
// zoom-6 tiles it spans, each read back into codes (get(x, y) → a promise of them, or of null), laid side by side; null
// if one of them doesn't come
export const AROUND = 768;
export async function squareAt(lat, lon, get, w = AROUND) {
  const [px, py] = pixelOf(lat, lon), n = 64, S = 512, x0 = Math.round(px) - w / 2, y0 = Math.round(py) - w / 2;
  const want = [];
  for (let y = Math.floor(y0 / S); y <= Math.floor((y0 + w - 1) / S); y++) for (let x = Math.floor(x0 / S); x <= Math.floor((x0 + w - 1) / S); x++) want.push([x, y]);
  const tiles = await Promise.all(want.map(([x, y]) => (y < 0 || y >= n ? Promise.resolve(null) : get(((x % n) + n) % n, y))));
  if (tiles.some((t, i) => !t && want[i][1] >= 0 && want[i][1] < n)) return null;
  const out = new Uint8Array(w * w);
  want.forEach(([x, y], i) => {
    const t = tiles[i]; if (!t) return;
    for (let r = 0; r < S; r++) {
      const oy = y * S + r - y0; if (oy < 0 || oy >= w) continue;
      const a = Math.max(0, x0 - x * S), b = Math.min(S, x0 + w - x * S); if (b <= a) continue;
      out.set(t.subarray(r * S + a, r * S + b), oy * w + (x * S + a - x0));
    }
  });
  return out;
}
// How the rain's moving between two squares of radar `mins` minutes apart, in zoom 7's pixels a minute, or null with
// too little rain to tell
export function driftOf(older, newer, mins, w = AROUND) {
  const m = older && newer && mins > 0 ? motion(older, newer, w, w) : null;
  return m && m.score >= 0.35 ? { vx: m.dx / mins, vy: m.dy / mins } : null;
}
// The rain about a place in words, from the latest radar (codes, w × w about the place) and where it sees (cover, the
// same square: 0 where it sees): the nearest rain and how heavy, how far and which way, and with its track (drift: zoom
// 7's pixels a minute), which way it's going and when it might be here. "" where the radar doesn't see the place.
const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
const toward = (dx, dy) => COMPASS[Math.round(((Math.atan2(dx, -dy) * 180) / Math.PI + 360) / 45) % 8];
export function rainSaid(codes, cover, lat, drift = null, w = AROUND) {
  const c0 = w / 2, at = (x, y) => Math.round(y) * w + Math.round(x), kmPx = (40075 / 2 ** 15) * Math.cos((lat * Math.PI) / 180);
  if (!codes || !cover || cover[at(c0, c0)]) return "";
  // (every other pixel: the nearest rain of 15 dBZ or more, and the nearest place the radar doesn't see)
  let best = null, blind = Infinity;
  for (let y = 0; y < w; y += 2) for (let x = 0; x < w; x += 2) {
    const d = Math.hypot(x - c0, y - c0);
    if (cover[y * w + x]) { blind = Math.min(blind, d); continue; }
    const c = codes[y * w + x]; if (!c) continue;
    const dbz = c > 100 ? c - 111 : c - 11;
    if (dbz >= 15 && (!best || d < best.d)) best = { d, x: x - c0, y: y - c0, dbz, snow: c > 100 };
  }
  if (!best || best.d > blind) {
    const km = Math.min(c0, blind) * kmPx;
    return km < 20 ? "" : `No rain within about ${Math.round(km / 10) * 10} km.`;
  }
  const band = [...LEGEND].reverse().find((l) => best.dbz >= l.dbz)?.label || "Drizzle";
  const what = band === "Drizzle" ? (best.snow ? "Light snow" : "Drizzle") : `${band} ${best.snow ? "snow" : "rain"}`, km = best.d * kmPx;
  if (km < 3) return `${what} here now.`;
  let text = `${what} about ${km < 7.5 ? Math.round(km) : Math.round(km / 5) * 5} km to the ${toward(best.x, best.y)}`;
  const v = drift ? Math.hypot(drift.vx, drift.vy) : 0, kmh = v * kmPx * 60;
  if (kmh >= 5) {
    text += `, moving ${toward(drift.vx, drift.vy)} at about ${Math.round(kmh / 5) * 5} km/h`;
    // (how much of that is toward here: coming more or less this way, when it would be here at that pace)
    const closing = -(best.x * drift.vx + best.y * drift.vy) / (best.d * v);
    if (closing > 0.5) {
      const mins = (km / (kmh * closing)) * 60;
      if (mins < 180) text += `: it could be here in about ${mins < 60 ? `${Math.max(5, Math.round(mins / 5) * 5)} minutes` : mins < 90 ? "an hour" : `${Math.round(mins / 30) / 2} hours`}`;
    } else text += ", not this way";
  }
  return `${text}.`;
}
// The rain at a place over the next two hours from the radar, worked out the same way in the app (radar.js) and for
// the rain alerts on the server (functions/_wxradar.js): from RainViewer's list of frames (rv), a tile's codes by its
// address (get(url) → a promise of them, or of null), and the time now (ms). Where the radar sees (its coverage), its
// latest frame's rain carried on along its own track (from the frame 20 minutes before, asked for only when there's
// rain about) → { at (that frame's time, ms), steps (along, below) }, or null with no radar to go on
export async function radarAt(lat, lon, rv, get, now) {
  const host = rv?.host, past = rv?.radar?.past || [];
  if (Math.abs(lat) > 84 || !host || !past.length) return null;      // (off the map's square tiles, and no radar there)
  const frame = (fr) => (x, y) => get(`${host}${fr.path}/512/6/${x}/${y}/2/1_1.png`);
  const last = past[past.length - 1], at = last.time * 1000;
  const [codes, cover] = await Promise.all([squareAt(lat, lon, frame(last)), squareAt(lat, lon, (x, y) => get(`${host}/v2/coverage/0/512/6/${x}/${y}/0/0_0.png`))]);
  if (!codes || !cover) return null;
  let drift = null;
  if (past.length >= 3 && codes.some(Boolean)) { const a = past[past.length - 3]; drift = driftOf(await squareAt(lat, lon, frame(a)), codes, (last.time - a.time) / 60); }
  return { at, steps: along(codes, cover, AROUND, drift, Math.max(0, Math.round((now - at) / 300e3) * 5)) };
}

// The rain at a place over the next two hours, from the radar: the latest frame's (codes, w × w, the place at its
// middle) carried on along its track (drift: zoom-7 pixels a minute; null: left where it is), read over a circle about
// the place that widens the further ahead (how sure where it'll be: about 2 km across now, 20 km two hours on), every
// `step` minutes from `from` (minutes after the frame) to `until`. cover: where the radar sees, as codes of
// RainViewer's coverage over the same square (0 where it sees). → [{ lead (min), mmh (the circle's average rain where
// the radar sees), snow (most of that rain snow), seen (the share of the circle the radar sees) }]
export function along(codes, cover, w, drift, from = 0, until = 120, step = 5) {
  const out = [], mid = w / 2;
  for (let lead = from; lead <= until; lead += step) {
    const r = 3 + lead / 5, cx = mid - (drift ? drift.vx * lead : 0), cy = mid - (drift ? drift.vy * lead : 0);
    let n = 0, seen = 0, sum = 0, wet = 0, snow = 0;
    for (let y = Math.ceil(cy - r); y <= cy + r; y++) {
      const half = Math.sqrt(Math.max(0, r * r - (y - cy) ** 2));
      for (let x = Math.ceil(cx - half); x <= cx + half; x++) {
        n++;
        if (x < 0 || y < 0 || x >= w || y >= w || cover[y * w + x]) continue;
        seen++;
        const c = codes[y * w + x];
        if (!c) continue;
        const mmh = mmhOf(c > 100 ? c - 111 : c - 11);
        if (mmh < MIN_RATE) continue;
        sum += mmh; wet++; if (c > 100) snow++;
      }
    }
    out.push({ lead, mmh: seen ? sum / seen : 0, snow: wet > 0 && snow * 2 > wet, seen: n ? seen / n : 0 });
  }
  return out;
}

// The models' rain by the quarter hour (data.js: { t (wall time, its start), precip (mm in it), code }) with the
// radar's (along's steps, from a frame at `at`, real ms; offset: the place's, seconds) leading where it sees: the
// radar's alone for the first half hour, giving way to the models' by two hours on, as the rain it can see moves on
// and new rain the models foresee forms; where it can't see (more than half the circle out of its reach), the models'.
// Each quarter it had a say in carries `radar`, its share
export function blend(minutely, steps, at, offset = 0) {
  if (!steps?.length || !minutely?.length) return minutely;
  return minutely.map((q) => {
    const lead = (q.t - offset * 1000 - at) / 60e3 + 7.5, near = steps.filter((s) => Math.abs(s.lead - lead) <= 7.5);
    if (!near.length) return q;
    const share = Math.min(...near.map((s) => s.seen)) < 0.5 ? 0 : lead <= 30 ? 1 : Math.max(0, 1 - (lead - 30) / 90);
    if (!share) return q;
    const mmh = near.reduce((a, s) => a + s.mmh, 0) / near.length, snow = near.some((s) => s.snow);
    const precip = Math.round((share * (mmh / 4) + (1 - share) * (q.precip ?? 0)) * 100) / 100;
    // (its weather: the kind the models have it as where they say it's wet too, else the radar's rain or snow, as heavy
    // as it's falling (codes.js); dry, not the models' rain)
    const code = precip >= 0.05 ? wetAt(q.code, precip * 4, snow) : isWetCode(q.code) && share >= 0.5 ? 3 : q.code;
    return { ...q, precip, code, radar: share };
  });
}

// Temperature and wind over the map, as Apple's Weather map has them (radar.js, its layers): the models' values at the
// grid's points (above), eased between as the rain is, each in a colour for it; fading out at the grid's edges, where
// there's nothing further to say. Stops: [value, [r, g, b]] (temperature °C, wind km/h)
export const TEMP_STOPS = [[-25, [92, 52, 160]], [-15, [86, 92, 210]], [-5, [70, 145, 230]], [0, [96, 190, 236]], [5, [104, 210, 196]], [10, [126, 214, 120]],
  [15, [206, 222, 92]], [20, [246, 200, 70]], [25, [245, 154, 58]], [30, [236, 102, 58]], [35, [214, 58, 62]], [42, [158, 30, 76]]];
// (the wind in blues, as Apple's is: calm a deep blue, lighter as it strengthens, a gale near white)
export const WIND_STOPS = [[0, [26, 78, 152]], [10, [33, 96, 174]], [20, [44, 116, 194]], [35, [62, 142, 212]], [50, [94, 168, 224]], [70, [138, 196, 236]], [95, [188, 222, 246]], [130, [236, 246, 252]]];
// the colour for a value, between the stops either side of it
export function tint(v, stops) {
  if (!(v > stops[0][0])) return stops[0][1];
  for (let k = 1; k < stops.length; k++) {
    const [b, cb] = stops[k];
    if (v <= b) { const [a, ca] = stops[k - 1], f = (v - a) / (b - a); return ca.map((x, j) => Math.round(x + (cb[j] - x) * f)); }
  }
  return stops[stops.length - 1][1];
}
// a field's values at a time: each point's, between the hours either side (times: ms, one per hour; series: an array
// of the points' values for each)
// A value of the grid's (one a point, as the models give them) at a place: the four points about it blended; null outside
// the grid, or where those points have none
export function gridAt(g, vals, lat, lon) {
  const n = g.n, fy = ((g.north - lat) / (g.north - g.south)) * (n - 1), fx = ((lon - g.west) / (g.east - g.west)) * (n - 1);
  if (!vals || !(fx >= 0 && fy >= 0 && fx <= n - 1 && fy <= n - 1)) return null;
  const r = Math.min(n - 2, Math.floor(fy)), c = Math.min(n - 2, Math.floor(fx)), ty = fy - r, tx = fx - c;
  const a = vals[r * n + c], b = vals[r * n + c + 1], d = vals[(r + 1) * n + c], e = vals[(r + 1) * n + c + 1];
  if (a == null || b == null || d == null || e == null) return null;
  return (a * (1 - tx) + b * tx) * (1 - ty) + (d * (1 - tx) + e * tx) * ty;
}
export function fieldAt(times, series, t) {
  if (!times?.length) return null;
  if (t <= times[0]) return series[0];
  if (t >= times[times.length - 1]) return series[series.length - 1];
  let k = 1; while (times[k] < t) k++;
  const f = (t - times[k - 1]) / (times[k] - times[k - 1]), a = series[k - 1], b = series[k];
  return a.map((x, j) => (x == null || b[j] == null ? x ?? b[j] : x + (b[j] - x) * f));
}
// Paint a field into an RGBA buffer (w × h, over the grid's box on a Web Mercator map), as paint() does the rain
export function paintField(buf, w, h, g, values, stops, alpha = 140) {
  const yN = merc(g.north), yS = merc(g.south), n = g.n, edge = 0.1;
  for (let y = 0; y < h; y++) {
    const my = yN + ((yS - yN) * (y + 0.5)) / h, lat = (360 / Math.PI) * Math.atan(Math.exp(my)) - 90;
    const fy = Math.min(n - 1, Math.max(0, ((g.north - lat) / (g.north - g.south)) * (n - 1))), r0 = Math.min(n - 2, Math.floor(fy)), ty = ease(fy - r0);
    const vy = (y + 0.5) / h, ey = Math.min(1, Math.min(vy, 1 - vy) / edge);
    for (let x = 0; x < w; x++) {
      const fx = ((x + 0.5) / w) * (n - 1), c0 = Math.min(n - 2, Math.floor(fx)), tx = ease(fx - c0);
      const at = (r, c) => values[r * n + c] ?? 0;
      const v = (at(r0, c0) * (1 - tx) + at(r0, c0 + 1) * tx) * (1 - ty) + (at(r0 + 1, c0) * (1 - tx) + at(r0 + 1, c0 + 1) * tx) * ty;
      const vx = (x + 0.5) / w, e = Math.min(ey, Math.min(1, Math.min(vx, 1 - vx) / edge)), c = tint(v, stops), o = (y * w + x) * 4;
      buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2]; buf[o + 3] = Math.round(alpha * ease(e));
    }
  }
  return buf;
}
