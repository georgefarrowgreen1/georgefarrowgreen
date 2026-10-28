// QR codes for Chat's add-a-friend links, made on the phone (no service
// sees them). Byte mode, error correction level M, versions 1 to 10: plenty
// for a link. After Project Nayuki's QR Code generator (MIT), cut down.

// [error-correction codewords per block, [[blocks, data codewords each], ...]] for level M
const BLOCKS = [null,
  [10, [[1, 16]]], [16, [[1, 28]]], [26, [[1, 44]]], [18, [[2, 32]]], [24, [[2, 43]]],
  [16, [[4, 27]]], [18, [[4, 31]]], [22, [[2, 38], [2, 39]]], [22, [[3, 36], [2, 37]]], [26, [[4, 43], [1, 44]]]];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

const mul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z; };
function divisor(degree) {
  const r = new Array(degree).fill(0); r[degree - 1] = 1; let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < r.length; j++) { r[j] = mul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
    root = mul(root, 2);
  }
  return r;
}
function remainder(data, div) {
  const r = div.map(() => 0);
  for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= mul(c, f); }); }
  return r;
}

// The QR code for some text, as rows of booleans (true = dark)
export function qr(text) {
  const bytes = [...new TextEncoder().encode(text)];
  let ver = 1;
  const capacity = (v) => BLOCKS[v][1].reduce((n, [b, d]) => n + b * d, 0);
  while (ver <= 10 && 4 + (ver < 10 ? 8 : 16) + bytes.length * 8 > capacity(ver) * 8) ver++;
  if (ver > 10) throw new Error("Too long for a QR code here.");
  // the bits: byte mode, length, data, then padding
  const bits = [], put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  put(4, 4); put(bytes.length, ver < 10 ? 8 : 16); for (const b of bytes) put(b, 8);
  const cap = capacity(ver) * 8;
  put(0, Math.min(4, cap - bits.length)); put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data = []; for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  // split into blocks, add error correction, interleave
  const [ecLen, groups] = BLOCKS[ver], div = divisor(ecLen), blocks = [];
  let k = 0; for (const [n, len] of groups) for (let i = 0; i < n; i++) { const d = data.slice(k, k + len); k += len; blocks.push({ d, e: remainder(d, div) }); }
  const words = [], most = Math.max(...blocks.map((b) => b.d.length));
  for (let i = 0; i < most; i++) for (const b of blocks) if (i < b.d.length) words.push(b.d[i]);
  for (let i = 0; i < ecLen; i++) for (const b of blocks) words.push(b.e[i]);

  const size = ver * 4 + 17, mods = Array.from({ length: size }, () => new Array(size).fill(false)), fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => { mods[y][x] = dark; fn[y][x] = true; };
  // timing, finders, alignment
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy; if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4); } };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const al = ALIGN[ver];
  for (let i = 0; i < al.length; i++) for (let j = 0; j < al.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const format = (mask) => {
    const d = (0 << 3) | mask; let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const b = ((d << 10) | r) ^ 0x5412, bit = (i) => ((b >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  format(0);                                                // (reserves the spots; drawn for real below)
  if (ver >= 7) {
    let r = ver; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const b = (ver << 12) | r;
    for (let i = 0; i < 18; i++) { const bit = ((b >>> i) & 1) !== 0, a = size - 11 + (i % 3), c = Math.floor(i / 3); set(a, c, bit); set(c, a, bit); }
  }
  // the data, zig-zagging up and down in pairs of columns from the right
  let n = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - v : v;
      if (!fn[y][x] && n < words.length * 8) { mods[y][x] = ((words[n >>> 3] >>> (7 - (n & 7))) & 1) !== 0; n++; }
    }
  }
  // try each mask; keep the one that's easiest to read (fewest long runs and blocks, balanced dark and light)
  const masks = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];
  const flip = (m) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && masks[m](x, y)) mods[y][x] = !mods[y][x]; };
  const penalty = () => {
    let p = 0, dark = 0;
    for (let y = 0; y < size; y++) for (const row of [true, false]) {
      let run = 1;
      for (let x = 1; x <= size; x++) {
        const a = row ? mods[y][x] : mods[x]?.[y], b = row ? mods[y][x - 1] : mods[x - 1][y];
        if (x < size && a === b) run++; else { if (run >= 5) p += run - 2; run = 1; }
      }
    }
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = mods[y][x]; if (c === mods[y][x + 1] && c === mods[y + 1][x] && c === mods[y + 1][x + 1]) p += 3; }
    for (const row of mods) for (const c of row) if (c) dark++;
    return p + Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
  };
  let best = 0, low = Infinity;
  for (let m = 0; m < 8; m++) { flip(m); format(m); const s = penalty(); if (s < low) { low = s; best = m; } flip(m); }
  flip(best); format(best);
  return mods;
}

// As an SVG (dark squares on a light square, with the quiet margin a scanner needs)
export function qrSvg(text, { dark = "#000", light = "#fff", title = "QR code" } = {}) {
  const m = qr(text), n = m.length, q = 4;
  let d = "";
  m.forEach((row, y) => row.forEach((on, x) => { if (on) d += `M${x + q} ${y + q}h1v1h-1z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 2 * q} ${n + 2 * q}" shape-rendering="crispEdges" role="img" aria-label="${title.replace(/[<>&"]/g, "")}"><title>${title.replace(/[<>&"]/g, "")}</title><rect width="100%" height="100%" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
}
