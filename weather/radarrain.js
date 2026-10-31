// The radar's say on the rain here over the next two hours (rainAt), which the page wants as it opens, for the next
// few hours' words and chart (app.js); and what the radar card shares with it, so each is fetched and read once for
// both: RainViewer's list of frames, and its tiles read back into reflectivity. The card itself (radar.js: the map,
// its frames and their playback) is fetched only as it comes near (app.js radarLater).

import { decode, radarAt } from "./rainmap.js";

const FRAMES = "https://api.rainviewer.com/public/weather-maps.json";
// NATIVE: the radar's finest detail, as a zoom of 256-pixel tiles; SRC: the size of the tiles
// asked for (512, a zoom below, as fine as NATIVE's)
export const NATIVE = 7, SRC = 512;

// A radar tile's pixels, read back into reflectivity once (the last 120 kept). Asked for six at a time, the frame
// on show first; a tile that doesn't come isn't kept (it's asked for again next time it's wanted)
const codes = new Map(), asks = [];
let asking = 0;
function next() {
  while (asking < 6 && asks.length) {
    const k = Math.max(0, asks.findIndex((a) => a.shown()));
    const a = asks.splice(k, 1)[0];
    asking++;
    a.go();
  }
}
// (read back off the page's own thread where it can be: each tile handed to a thread of its own (radarwork.js) as a
// bitmap, its codes handed back, so the page isn't held up a tile at a time as it opens or the map's moved; here,
// where there's no such thread, or it won't start or can't read one)
let reader = null, reads = 0;
const reading = new Map();
function readerOf() {
  if (reader !== null) return reader;
  reader = false;
  if (typeof OffscreenCanvas === "undefined" || typeof createImageBitmap !== "function") return reader;
  try {
    const w = new Worker(new URL("./radarwork.js", import.meta.url), { type: "module" });
    w.onmessage = ({ data: { id, codes: got } }) => { const f = reading.get(id); reading.delete(id); f?.(got); };
    w.onerror = (e) => { e.preventDefault?.(); reader = false; try { w.terminate(); } catch (_) {} for (const f of reading.values()) f(null); reading.clear(); };
    reader = w;
  } catch (_) {}
  return reader;
}
export function tileCodes(url, shown = () => true) {
  if (codes.has(url)) return codes.get(url);
  const p = new Promise((ok) => {
    asks.push({ shown, go: () => {
      const img = new Image(), end = (v) => { asking--; ok(v); next(); };
      img.crossOrigin = "anonymous";
      const here = () => {
        try {
          const c = document.createElement("canvas"); c.width = c.height = SRC;
          const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0, SRC, SRC);
          end(decode(x.getImageData(0, 0, SRC, SRC).data));
        } catch (_) { end(null); }
      };
      img.onload = () => {
        const w = readerOf();
        if (!w) return here();
        createImageBitmap(img).then((bmp) => {
          // (its thread gone meanwhile: read here)
          if (reader !== w) { bmp.close(); return here(); }
          const id = ++reads;
          w.postMessage({ id, bmp, size: SRC }, [bmp]);
          reading.set(id, (got) => (got ? end(got) : here()));
        }).catch(here);
      };
      img.onerror = () => { if (codes.get(url) === p) codes.delete(url); end(null); };
      img.src = url;
    } });
    next();
  });
  codes.set(url, p);
  if (codes.size > 120) codes.delete(codes.keys().next().value);
  return p;
}
// (the tiles' readings let go, the radar put away: radar.js letGo; and with the app in the background, the card come
// yet or not, as they were when it came with the page: some megabytes a phone short of memory needn't keep)
export const forgetTiles = () => codes.clear();
if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") forgetTiles(); });

// RainViewer's list of frames, kept a few minutes (the card and the next hours' words both ask for it)
let frameList = null;
export function framesNow() {
  if (frameList && Date.now() - frameList.at < 3 * 60e3) return frameList.p;
  const p = fetch(FRAMES, { signal: AbortSignal.timeout(10000) }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`radar ${r.status}`))));
  frameList = { at: Date.now(), p };
  p.catch(() => { if (frameList?.p === p) frameList = null; });
  return p;
}
// The rain here over the next two hours, from the radar, for the next few hours' words and chart (app.js, with the
// models' after it: rainmap.js blend): rainmap.js radarAt, on the card's own tiles (kept, so it then has them to hand)
export async function rainAt(lat, lon) {
  return radarAt(lat, lon, await framesNow(), (url) => tileCodes(url), Date.now());
}
