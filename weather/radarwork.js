// The radar's tiles smoothed off the page's own thread (radar.js), so the map keeps moving under a finger while they're
// worked out: rainmap.js rainValues on the codes about each tile, stitched together. → { vals } (handed back, not copied)
import { rainValues } from "./rainmap.js";

self.onmessage = ({ data: { src, x0, y0, span, look } }) => {
  const vals = rainValues(new Uint8ClampedArray(256 * 256 * 4), 256, src, x0, y0, span, look);
  self.postMessage({ vals }, [vals.buffer]);
};
