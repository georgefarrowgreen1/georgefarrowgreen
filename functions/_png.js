// A PNG's pixels on the server, where there's no canvas to draw one into: for the radar's tiles, which the rain
// alerts read as the app does (functions/_wxradar.js). Only what RainViewer's are: 8-bit RGBA (or RGB), not
// interlaced, no bigger than `most` pixels a side; each row's filter undone (all five kinds). Unzipped with the
// platform's own inflate, stopping at the size the image says it is, so a small file can't unpack into a huge one.
// → { width, height, rgba: Uint8Array } or null for anything else (or anything broken).

const SIG = [137, 80, 78, 71, 13, 10, 26, 10];

export async function readPng(bytes, most = 1024) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < 33 || SIG.some((v, i) => b[i] !== v)) return null;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength), idat = [];
  let w = 0, h = 0, depth = 0, type = 0, interlace = 0;
  for (let i = 8; i + 12 <= b.length;) {
    const n = view.getUint32(i), kind = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
    if (i + 12 + n > b.length) return null;
    if (kind === "IHDR") { w = view.getUint32(i + 8); h = view.getUint32(i + 12); depth = b[i + 16]; type = b[i + 17]; interlace = b[i + 20]; }
    else if (kind === "IDAT") idat.push(b.subarray(i + 8, i + 8 + n));
    else if (kind === "IEND") break;
    i += 12 + n;
  }
  const ch = type === 6 ? 4 : type === 2 ? 3 : 0;
  if (!ch || depth !== 8 || interlace || !w || !h || w > most || h > most || !idat.length) return null;
  const stride = w * ch, raw = await inflate(idat, h * (stride + 1));
  if (!raw) return null;
  // (RGBA rows are undone straight into place, each the row above's "up"; RGB's through a row of their own)
  const out = new Uint8Array(w * h * 4), none = new Uint8Array(stride), rgb = ch === 3 ? [new Uint8Array(stride), new Uint8Array(stride)] : null;
  let prev = none;
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = rgb ? rgb[y & 1] : out.subarray(y * stride, (y + 1) * stride);
    if (f === 0) cur.set(row);
    else if (f === 1) for (let x = 0; x < stride; x++) cur[x] = (row[x] + (x >= ch ? cur[x - ch] : 0)) & 255;
    else if (f === 2) for (let x = 0; x < stride; x++) cur[x] = (row[x] + prev[x]) & 255;
    else if (f === 3) for (let x = 0; x < stride; x++) cur[x] = (row[x] + (((x >= ch ? cur[x - ch] : 0) + prev[x]) >> 1)) & 255;
    else if (f === 4) for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, up = prev[x], c = x >= ch ? prev[x - ch] : 0, p = a + up - c;
      const pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
      cur[x] = (row[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c)) & 255;
    }
    else return null;
    if (rgb) for (let x = 0, o = y * w * 4; x < w; x++, o += 4) { out[o] = cur[x * 3]; out[o + 1] = cur[x * 3 + 1]; out[o + 2] = cur[x * 3 + 2]; out[o + 3] = 255; }
    prev = cur;
  }
  return { width: w, height: h, rgba: out };
}

// The image data unzipped (zlib's deflate), exactly `size` bytes of it, or null if there's less (or it's broken);
// more than that isn't read
async function inflate(parts, size) {
  try {
    const reader = new Blob(parts).stream().pipeThrough(new DecompressionStream("deflate")).getReader(), out = new Uint8Array(size);
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const take = Math.min(value.length, size - got);
      out.set(value.subarray(0, take), got); got += take;
      if (got >= size) { reader.cancel().catch(() => {}); break; }
    }
    return got === size ? out : null;
  } catch (_) { return null; }
}
