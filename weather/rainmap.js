// The radar's sums, kept apart from the map so they can be tested alone:
// the colours (RainViewer's Universal Blue, from their published table, so the
// legend and the forecast's frames match the radar's own), turning a rain rate
// into radar reflectivity (dBZ), the grid of points the forecast's frames are
// made from, painting a frame of them, and the timeline of frames; and the rain
// at a place over the next two hours from the radar, with the models' after it.

import { isWetCode } from "./codes.js";

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
// The colours as a ramp every quarter of a dB, -10 to 65: as the radar has them (soft 0), or each the
// average of its neighbours over about ±soft dB (in linear light), so even its jumps (blue to yellow) flow
const ramps = new Map();
export function ramp(snow, soft = 0) {
  const key = `${snow ? "s" : "r"}${soft}`;
  if (ramps.has(key)) return ramps.get(key);
  const t = snow ? FS : FR, n = (t.length - 1) * 4 + 1, out = new Uint8ClampedArray(n * 4);
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

// What's on the map at a time t (ms) between the frames, to the minute (radar.js draws it): between two of the radar's,
// the earlier carried on along the way the rain's going and the later brought back to meet it, each faded into the other
// as the minutes pass; after the latest, the latest carried on along its track to the minute (as its forecast frames
// are), fading a little the further ahead; the models', the quarter hours either side blended (and from the latest
// radar, faded into their first). src: { past: [{ time (s) }], drift: { vx, vy } (zoom-7 pixels a minute, or null: the
// pair's own, or none), driftOf(k): the rain's way between frames k and k + 1 where there's no drift, models: [{ t, k }]
// (the timeline's frames of the models', in order; none where the radar's carried on), model: { rain, snow } }.
// → [{ k (a radar frame), dx, dy (zoom-7 pixels it's moved), alpha }] and [{ rates, snow, alpha }] of the models'
export function partsAt(src, t) {
  const { past = [], models = [], model } = src, last = past.length ? past[past.length - 1].time * 1000 : null;
  const still = { vx: 0, vy: 0 };
  if (last != null && t <= last) {
    let k = 0;
    while (k < past.length - 2 && past[k + 1].time * 1000 <= t) k++;
    const ta = past[k].time * 1000, tb = past[k + 1] ? past[k + 1].time * 1000 : ta;
    if (tb <= ta || t <= ta) return [{ k, dx: 0, dy: 0, alpha: 1 }];
    if (t >= tb) return [{ k: k + 1, dx: 0, dy: 0, alpha: 1 }];
    const a = (t - ta) / (tb - ta), mins = (tb - ta) / 60e3, v = src.drift || src.driftOf?.(k) || still;
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
  let j = 0;
  while (j < models.length - 2 && models[j + 1].t <= t) j++;
  const A = models[j], B = models[j + 1];
  if (!B || t >= B.t) return [{ ...at(B || A), alpha: 1 }];
  const a = (t - A.t) / (B.t - A.t), ra = model.rain[A.k], rb = model.rain[B.k];
  return [{ rates: ra.map((r, p) => r + ((rb[p] ?? 0) - r) * a), snow: a < 0.5 ? model.snow[A.k] : model.snow[B.k], alpha: 1 }];
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
  const rate = (mmh, snow) => (snow ? (mmh < 1 ? 71 : mmh < 4 ? 73 : 75) : mmh < 2.5 ? 61 : mmh < 7.6 ? 63 : 65);
  return minutely.map((q) => {
    const lead = (q.t - offset * 1000 - at) / 60e3 + 7.5, near = steps.filter((s) => Math.abs(s.lead - lead) <= 7.5);
    if (!near.length) return q;
    const share = Math.min(...near.map((s) => s.seen)) < 0.5 ? 0 : lead <= 30 ? 1 : Math.max(0, 1 - (lead - 30) / 90);
    if (!share) return q;
    const mmh = near.reduce((a, s) => a + s.mmh, 0) / near.length, snow = near.some((s) => s.snow);
    const precip = Math.round((share * (mmh / 4) + (1 - share) * (q.precip ?? 0)) * 100) / 100;
    // (its weather: the models' where they say it's wet too, else the radar's rain or snow; dry, not the models' rain)
    const code = precip >= 0.05 ? (isWetCode(q.code) ? q.code : rate(precip * 4, snow)) : isWetCode(q.code) && share >= 0.5 ? 3 : q.code;
    return { ...q, precip, code, radar: share };
  });
}
