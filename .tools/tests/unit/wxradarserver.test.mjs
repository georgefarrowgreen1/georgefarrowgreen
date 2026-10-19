// The radar for the rain alerts on the server: reading a PNG without a canvas (functions/_png.js), the radar at a
// place worked out as the app does (weather/rainmap.js radarAt, with made-up tiles), and the server's reader of
// RainViewer (functions/_wxradar.js, against a stand-in for it).
import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateSync, crc32 } from "node:zlib";
import { readPng } from "../../../functions/_png.js";
import { radarForTick } from "../../../functions/_wxradar.js";
import { radarAt, pixelOf } from "../../../weather/rainmap.js";

// a PNG of w × h pixels (px(x, y) → [r, g, b, a]), each row filtered by the kind filter(y) gives (0 to 4), as an encoder
// would; RGB (ch 3) or RGBA (ch 4)
function png(w, h, px, { ch = 4, filter = () => 0 } = {}) {
  const img = new Uint8Array(w * h * ch);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) img.set(px(x, y).slice(0, ch), (y * w + x) * ch);
  const stride = w * ch, raw = Buffer.alloc(h * (stride + 1));
  const at = (y, x) => (y < 0 || x < 0 ? 0 : img[y * stride + x]);
  for (let y = 0; y < h; y++) {
    const f = filter(y); raw[y * (stride + 1)] = f;
    for (let x = 0; x < stride; x++) {
      const v = at(y, x), a = at(y, x - ch), b = at(y - 1, x), c = at(y - 1, x - ch);
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? b : c) : 0;
      raw[y * (stride + 1) + 1 + x] = (v - pred) & 255;
    }
  }
  const chunk = (type, data) => { const len = Buffer.alloc(4), crc = Buffer.alloc(4); len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data]))); return Buffer.concat([len, Buffer.from(type), data, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr.set([8, ch === 4 ? 6 : 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const colour = (x, y) => [(x * 7 + y * 3) & 255, (x * 13) & 255, (y * 29 + 5) & 255, (x + y) % 3 ? 255 : 0];

test("a PNG's pixels without a canvas: every kind of row filter, RGBA and RGB", async () => {
  const want = (w, h, ch) => { const o = new Uint8Array(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) o.set(ch === 4 ? colour(x, y) : [...colour(x, y).slice(0, 3), 255], (y * w + x) * 4); return o; };
  const a = await readPng(png(37, 23, colour, { filter: (y) => y % 5 }));
  assert.equal(a.width, 37); assert.equal(a.height, 23);
  assert.deepEqual(a.rgba, want(37, 23, 4), "None, Sub, Up, Average and Paeth rows all undone");
  const b = await readPng(png(19, 11, colour, { ch: 3, filter: (y) => (y * 3) % 5 }));
  assert.deepEqual(b.rgba, want(19, 11, 3), "RGB, given full alpha");
});
test("a PNG that isn't one, or isn't one it reads: nothing, rather than trouble", async () => {
  const good = png(8, 8, colour);
  assert.equal(await readPng(Buffer.from("not a png at all, really not")), null);
  assert.equal(await readPng(good.subarray(0, 40)), null, "cut short");
  assert.equal(await readPng(png(600, 4, colour), 512), null, "bigger than asked for");
  const broken = Buffer.from(good); broken[broken.length - 20] ^= 0xff;
  assert.equal(await readPng(broken), null, "its image data damaged");
  const paletted = Buffer.from(good); paletted[25] = 3;
  assert.equal(await readPng(paletted), null, "a palette image: not RainViewer's kind");
  // a little file that would unzip into a lot: read only as far as the image needs
  const huge = Buffer.from(png(4, 4, colour)), bomb = deflateSync(Buffer.alloc(50e6));
  const chunk = (type, data) => { const len = Buffer.alloc(4), crc = Buffer.alloc(4); len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data]))); return Buffer.concat([len, Buffer.from(type), data, crc]); };
  const big = Buffer.concat([huge.subarray(0, 33), chunk("IDAT", bomb), chunk("IEND", Buffer.alloc(0))]);
  const t0 = performance.now(), r = await readPng(big);
  assert.ok(r && r.width === 4 && performance.now() - t0 < 2000, "four by four, read without unzipping the rest");
});

// RainViewer's frames, the latest 12 minutes old: a block of 30 dBZ rain 40 pixels west of the place, coming east at 2
// pixels a minute (40 pixels a frame-pair, 20 minutes apart), on tiles of codes made here
const NOW = Date.UTC(2026, 9, 19, 12, 12);
const frames = { host: "https://tiles.test", radar: { past: Array.from({ length: 13 }, (_, k) => ({ time: (Date.UTC(2026, 9, 19, 12, 0) - (12 - k) * 600e3) / 1000, path: `/v2/radar/f${k}` })) } };
const LAT = 51.51, LON = -0.13, [PX, PY] = pixelOf(LAT, LON);
const blockAt = (k) => { const front = Math.round(PX) - 40 - 20 * (12 - k); return { x0: front - 60, x1: front, y0: Math.round(PY) - 60, y1: Math.round(PY) + 60 }; };
function tileOf(url, { seen = true } = {}) {
  const m = /\/(\d+)\/(\d+)\/\d+\/\d+_\d+\.png$/.exec(url), [x, y] = m ? [+m[1], +m[2]] : [0, 0], out = new Uint8Array(512 * 512);
  if (url.includes("/coverage/")) return seen ? out : out.fill(1);
  const f = /\/f(\d+)\//.exec(url), b = blockAt(+f[1]);
  for (let r = 0; r < 512; r++) for (let c = 0; c < 512; c++) { const X = x * 512 + c, Y = y * 512 + r; if (X >= b.x0 && X < b.x1 && Y >= b.y0 && Y < b.y1) out[r * 512 + c] = 41; }
  return out;
}
test("the radar at a place, as the app works it out: its track, and the rain coming", async () => {
  const asked = [];
  const r = await radarAt(LAT, LON, frames, async (url) => { asked.push(url); return tileOf(url); }, NOW);
  assert.equal(r.at, Date.UTC(2026, 9, 19, 12, 0));
  assert.equal(r.steps[0].lead, 10, "from now: 12 minutes after the frame, to the nearest five");
  const wet = r.steps.find((s) => s.mmh >= 0.2);
  assert.ok(wet && wet.lead >= 15 && wet.lead <= 25, `here about 20 minutes after the frame: ${wet?.lead}`);
  assert.ok(asked.some((u) => u.includes("/f10/")) && asked.some((u) => u.includes("/coverage/")), "the frame 20 minutes before, for the track, and the coverage");
  // where the radar doesn't see: nothing it says counts
  const blind = await radarAt(LAT, LON, frames, async (url) => tileOf(url, { seen: false }), NOW);
  assert.ok(blind.steps.every((s) => s.seen === 0));
  // no rain anywhere about: no need of the frame before
  const dry = [];
  await radarAt(LAT, LON, frames, async (url) => { dry.push(url); return url.includes("/coverage/") ? new Uint8Array(512 * 512) : new Uint8Array(512 * 512); }, NOW);
  assert.ok(!dry.some((u) => u.includes("/f10/")));
  assert.equal(await radarAt(LAT, LON, frames, async () => null, NOW), null, "a tile that doesn't come: no say");
  assert.equal(await radarAt(89, 0, frames, async (url) => tileOf(url), NOW), null, "nor so near a pole");
});

test("the server's reader of RainViewer: its own tiles only, each read once a tick", async () => {
  const real = globalThis.fetch, asked = [];
  // a stand-in for RainViewer: its list of frames (naming another tile server, and a frame with an odd address) and
  // its tiles as PNGs (codes 41: 30 dBZ, in the radar's own blue; coverage clear)
  const blue = [0x00, 0x55, 0x88, 0xff], pngs = new Map();
  const tilePng = (url) => {
    if (!pngs.has(url)) { const codes = tileOf(url); pngs.set(url, png(512, 512, (x, y) => (url.includes("/coverage/") ? [0, 0, 0, codes[y * 512 + x] ? 255 : 0] : codes[y * 512 + x] ? blue : [0, 0, 0, 0]))); }
    return pngs.get(url);
  };
  globalThis.fetch = async (url) => {
    asked.push(String(url));
    if (String(url).endsWith("/public/weather-maps.json")) return new Response(JSON.stringify({ ...frames, host: "https://elsewhere.example", radar: { past: [...frames.radar.past, { time: 1, path: "/v2/radar/../../x" }] } }), { status: 200 });
    if (String(url).startsWith("https://tilecache.rainviewer.com/")) return new Response(tilePng(String(url).replace("https://tilecache.rainviewer.com", "https://tiles.test")), { status: 200 });
    return new Response("no", { status: 404 });
  };
  try {
    const radar = radarForTick({}, NOW), [a, b] = await Promise.all([radar.at(LAT, LON), radar.at(LAT, LON + 0.01)]);
    assert.ok(a && b, "read");
    assert.ok(asked.every((u) => u.startsWith("https://api.rainviewer.com/") || u.startsWith("https://tilecache.rainviewer.com/")), "RainViewer's own tile server, not the one the list names");
    assert.ok(!asked.some((u) => u.includes("..")), "and not a frame with an odd address");
    const tiles = asked.filter((u) => u.includes(".png"));
    assert.equal(new Set(tiles).size, tiles.length, "each tile once, for both places");
    const wet = a.steps.find((s) => s.mmh >= 0.2);
    assert.ok(wet && wet.lead >= 15 && wet.lead <= 25, `the same say as the app's: here about 20 minutes after the frame (${wet?.lead})`);
    // the coverage is kept for the next tick
    asked.length = 0;
    await radarForTick({}, NOW + 600e3).at(LAT, LON);
    assert.ok(!asked.some((u) => u.includes("/coverage/")), "where the radar sees, kept between ticks");
    // RainViewer not answering: no say, and no trouble
    globalThis.fetch = async () => { throw new Error("down"); };
    assert.equal(await radarForTick({}, NOW).at(LAT, LON), null);
  } finally { globalThis.fetch = real; }
});
