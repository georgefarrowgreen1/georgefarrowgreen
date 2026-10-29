// A PDF, written here with no library: pages of text, shapes and JPEG pictures, for your data as a document
// (datapdf.js). The text is Helvetica, the font every PDF reader has, so nothing's embedded and it stays text you can
// select and search. What Helvetica can't show (anything outside Windows Latin 1: Polish place names, other alphabets,
// emoji) is drawn as a picture of itself by `raster`, when one's given (the page's canvas), or else stands as "?".
//
// Coordinates are points from the page's top left (PDF's own run up from the bottom left: turned round here), and a
// line of text sits on its baseline.

export const A4 = [595.28, 841.89];

// Helvetica's and Helvetica-Bold's widths (thousandths of the size) for each Windows Latin 1 byte, 32 to 255, from
// Adobe's AFM files (0: no character there)
const WIDTHS = [
  [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,556,556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500],
  [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,556,556,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556],
];
// the characters Windows Latin 1 puts at 128 to 159 (the rest of its top half is Latin 1's own)
const WIN = "€\0‚ƒ„…†‡ˆ‰Š‹Œ\0Ž\0\0‘’“”•–—˜™š›œ\0žŸ";
// Text as Windows Latin 1 bytes, or null if Helvetica can't show it (spaces of other widths, and a few dashes, as theirs)
export function ansi(s) {
  const out = [];
  for (const ch of String(s).replace(/[ -   \t]/g, " ").replace(/[‐‑−]/g, "-").replace(/[​-‍️]/g, "")) {
    const c = ch.codePointAt(0);
    if ((c >= 32 && c < 127) || (c >= 160 && c < 256)) out.push(c);
    else { const i = WIN.indexOf(ch); if (i < 0 || ch === "\0") return null; out.push(128 + i); }
  }
  return out;
}
const enc = new TextEncoder();
const n2 = (v) => (Math.round(v * 100) / 100).toString();
const rgb = (hex) => { const v = parseInt(String(hex).slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((x) => n2(x / 255)).join(" "); };
// a string in a content stream: bytes outside printable ASCII as octal, and ( ) \ escaped
const lit = (bytes) => "(" + bytes.map((b) => (b === 40 || b === 41 || b === 92 ? "\\" + String.fromCharCode(b) : b < 32 || b > 126 ? "\\" + b.toString(8).padStart(3, "0") : String.fromCharCode(b))).join("") + ")";
// text outside a content stream (the document's title and author): UTF-16, as PDF has it
const utf16 = (s) => "<FEFF" + [...String(s)].map((ch) => { const c = ch.codePointAt(0); return c > 0xffff ? [0xd800 + ((c - 0x10000) >> 10), 0xdc00 + ((c - 0x10000) & 0x3ff)] : [c]; }).flat().map((u) => u.toString(16).padStart(4, "0")).join("").toUpperCase() + ">";
// a JPEG's size and colours, from its frame header
function jpegInfo(b) {
  for (let i = 2; i + 9 < b.length;) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8], comps: b[i + 9] };
    i += 2 + len;
  }
  throw new Error("Not a JPEG.");
}
async function deflate(bytes) {
  if (typeof CompressionStream === "undefined") return null;
  try { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer()); } catch (_) { return null; }
}

export class PDF {
  constructor({ size = A4, title = "", author = "", lang = "en-GB", raster = null } = {}) {
    [this.W, this.H] = size; this.pages = []; this.images = []; this.meta = { title, author, lang }; this.raster = raster;
  }
  page() { const p = { ops: [], xo: new Set() }; this.pages.push(p); return p; }
  // how wide text is, in points
  measure(s, size, bold = false, spacing = 0) {
    const a = ansi(s);
    if (!a) return this.raster ? this.raster.measure(s, size, bold) : [...String(s)].length * size * 0.556;
    return (a.reduce((t, c) => t + WIDTHS[bold ? 1 : 0][c - 32], 0) * size) / 1000 + spacing * a.length;
  }
  // a line of text on its baseline at (x, y); bg is what's behind it (for one drawn as a picture)
  text(p, x, y, s, { size = 10, bold = false, color = "#000000", spacing = 0, bg = "#ffffff" } = {}) {
    if (!s) return;
    let a = ansi(s);
    if (!a && this.raster) {
      const r = this.raster.draw(s, size, bold, color, bg);
      return this.draw(p, this.rgb(r.rgb, r.w, r.h), x, y - r.ascent, r.width, r.height);
    }
    a ||= [...String(s)].map((ch) => ansi(ch)?.[0] ?? 63);
    // (letter spacing lasts until it's changed, from one piece of text to the next: set only when it does)
    const tc = (p.tc ?? 0) !== spacing ? `${n2(spacing)} Tc ` : "";
    p.tc = spacing;
    p.ops.push(`BT /F${bold ? 2 : 1} ${n2(size)} Tf ${rgb(color)} rg ${tc}1 0 0 1 ${n2(x)} ${n2(this.H - y)} Tm ${lit(a)} Tj ET`);
  }
  // a rectangle, rounded by r, filled and/or outlined
  rect(p, x, y, w, h, { fill, stroke, r = 0, lw = 0.75 } = {}) {
    p.ops.push(`${fill ? rgb(fill) + " rg " : ""}${stroke ? rgb(stroke) + " RG " + n2(lw) + " w " : ""}${this.#path(x, y, w, h, r)} ${fill && stroke ? "B" : fill ? "f" : "S"}`);
  }
  line(p, x1, y1, x2, y2, { color = "#000000", lw = 0.5 } = {}) {
    p.ops.push(`${rgb(color)} RG ${n2(lw)} w ${n2(x1)} ${n2(this.H - y1)} m ${n2(x2)} ${n2(this.H - y2)} l S`);
  }
  // a picture: a JPEG as it is, or rows of RGB (for text drawn as a picture of itself)
  jpeg(bytes) { const im = { kind: "jpeg", bytes, ...jpegInfo(bytes), n: this.images.length + 1 }; this.images.push(im); return im; }
  rgb(bytes, w, h) { const im = { kind: "rgb", bytes, w, h, comps: 3, n: this.images.length + 1 }; this.images.push(im); return im; }
  // ... placed in the box at (x, y), w by h; clipped to a rounded rectangle (r; w / 2 for a circle)
  draw(p, im, x, y, w, h, { r = 0 } = {}) {
    p.xo.add(im);
    p.ops.push(`q ${r ? this.#path(x, y, w, h, r) + " W n " : ""}${n2(w)} 0 0 ${n2(h)} ${n2(x)} ${n2(this.H - y - h)} cm /Im${im.n} Do Q`);
  }
  #path(x, y, w, h, r) {
    const Y = this.H - y - h;
    if (!r) return `${n2(x)} ${n2(Y)} ${n2(w)} ${n2(h)} re`;
    r = Math.min(r, w / 2, h / 2);
    const k = r * 0.5523, X2 = x + w, Y2 = Y + h;
    return [`${n2(x + r)} ${n2(Y)} m`, `${n2(X2 - r)} ${n2(Y)} l`, `${n2(X2 - r + k)} ${n2(Y)} ${n2(X2)} ${n2(Y + r - k)} ${n2(X2)} ${n2(Y + r)} c`,
      `${n2(X2)} ${n2(Y2 - r)} l`, `${n2(X2)} ${n2(Y2 - r + k)} ${n2(X2 - r + k)} ${n2(Y2)} ${n2(X2 - r)} ${n2(Y2)} c`, `${n2(x + r)} ${n2(Y2)} l`,
      `${n2(x + r - k)} ${n2(Y2)} ${n2(x)} ${n2(Y2 - r + k)} ${n2(x)} ${n2(Y2 - r)} c`, `${n2(x)} ${n2(Y + r)} l`, `${n2(x)} ${n2(Y + r - k)} ${n2(x + r - k)} ${n2(Y)} ${n2(x + r)} ${n2(Y)} c h`].join(" ");
  }

  // The file: its objects (the catalogue, the pages, the two fonts, the document's details, the pictures, then each
  // page and what's on it), their places in the file, and where to start
  async build(now = new Date()) {
    const objs = [];                  // [number, header text, stream bytes or null]
    const FONT = (name) => `<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`;
    const d = now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
    objs.push([3, FONT("Helvetica")], [4, FONT("Helvetica-Bold")],
      [5, `<< /Title ${utf16(this.meta.title)} /Author ${utf16(this.meta.author)} /Creator (inflite.ai) /Producer (inflite.ai) /CreationDate (D:${d}Z) >>`]);
    const base = 6;
    for (const im of this.images) {
      const z = im.kind === "rgb" ? await deflate(im.bytes) : null, data = z || im.bytes;
      const filter = im.kind === "jpeg" ? " /Filter /DCTDecode" : z ? " /Filter /FlateDecode" : "";
      objs.push([base + im.n - 1, `<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /Device${im.comps === 1 ? "Gray" : im.comps === 4 ? "CMYK" : "RGB"} /BitsPerComponent 8${filter}${im.comps === 4 ? " /Decode [1 0 1 0 1 0 1 0]" : ""} /Length ${data.length} >>`, data]);
    }
    const first = base + this.images.length, kids = [];
    for (const [i, p] of this.pages.entries()) {
      const pn = first + i * 2, raw = enc.encode(p.ops.join("\n")), z = await deflate(raw), data = z || raw;
      const xo = [...p.xo].map((im) => `/Im${im.n} ${base + im.n - 1} 0 R`).join(" ");
      objs.push([pn, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n2(this.W)} ${n2(this.H)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xo ? ` /XObject << ${xo} >>` : ""} >> /Contents ${pn + 1} 0 R >>`],
        [pn + 1, `<< /Length ${data.length}${z ? " /Filter /FlateDecode" : ""} >>`, data]);
      kids.push(`${pn} 0 R`);
    }
    objs.push([1, `<< /Type /Catalog /Pages 2 0 R /Lang (${this.meta.lang}) /ViewerPreferences << /DisplayDocTitle true >> >>`],
      [2, `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${kids.length} >>`]);
    objs.sort((a, b) => a[0] - b[0]);
    const parts = [enc.encode("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n")], at = [];
    let len = parts[0].length;
    const put = (b) => { parts.push(b); len += b.length; };
    for (const [num, head, stream] of objs) {
      at[num] = len;
      put(enc.encode(`${num} 0 obj\n${head}\n`));
      if (stream) { put(enc.encode("stream\n")); put(stream); put(enc.encode("\nendstream\n")); }
      put(enc.encode("endobj\n"));
    }
    const size = objs.length + 1, xref = len;
    put(enc.encode(`xref\n0 ${size}\n0000000000 65535 f \n` + at.slice(1).map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")
      + `trailer\n<< /Size ${size} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
    const out = new Uint8Array(len);
    let o = 0; for (const b of parts) { out.set(b, o); o += b.length; }
    return out;
  }
}

// Text set down a page, a line at a time: wrapped to a width, on to a new page when this one's full
export class Flow {
  constructor(pdf, { margin = [64, 54, 70, 54], onPage = null } = {}) {
    this.pdf = pdf; this.m = margin; this.onPage = onPage; this.page();
  }
  get left() { return this.m[3]; }
  get width() { return this.pdf.W - this.m[1] - this.m[3]; }
  get bottom() { return this.pdf.H - this.m[2]; }
  page() { this.p = this.pdf.page(); this.y = this.m[0]; this.onPage?.(this.p, this.pdf.pages.length, this); }
  // room for h more points here, or a new page
  room(h) { if (this.y + h > this.bottom) { this.page(); return false; } return true; }
  gap(h) { this.y += h; }
  // text broken into lines no wider than w (a word too long for one broken where it must)
  lines(s, w, size, bold = false) {
    const out = [];
    for (const para of String(s ?? "").split("\n")) {
      let line = "";
      for (const word of para.split(" ")) {
        const next = line ? line + " " + word : word;
        if (this.pdf.measure(next, size, bold) <= w) { line = next; continue; }
        if (line) out.push(line);
        line = word;
        while (this.pdf.measure(line, size, bold) > w && line.length > 1) {
          let k = line.length - 1;
          while (k > 1 && this.pdf.measure(line.slice(0, k), size, bold) > w) k--;
          out.push(line.slice(0, k)); line = line.slice(k);
        }
      }
      out.push(line);
    }
    return out;
  }
  // a paragraph
  para(s, { size = 10, bold = false, color = "#000000", lead = 1.45, x = this.left, w = this.width, after = 0, bg } = {}) {
    for (const l of this.lines(s, w, size, bold)) {
      this.room(size * lead);
      this.y += size * lead;
      this.pdf.text(this.p, x, this.y - size * (lead - 1) / 2 - size * 0.22, l, { size, bold, color, bg });
    }
    this.y += after;
  }
}
