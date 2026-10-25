// The radar's tiles smoothed off the page's own thread (radar.js), so the map keeps moving under a finger while they're
// worked out: rainmap.js rainValues on the codes about each tile, stitched together. → { vals } (handed back, not copied)
// Or, on a thread of its own, a tile read back into reflectivity (radar.js tileCodes: its picture handed over as a
// bitmap): rainmap.js decode on its pixels. → { id, codes } (codes null where it can't be read here)
import { rainValues, decode } from "./rainmap.js";

self.onmessage = ({ data }) => {
  if (data.bmp) {
    const { id, bmp, size } = data;
    let codes = null;
    try {
      const x = new OffscreenCanvas(size, size).getContext("2d", { willReadFrequently: true });
      x.drawImage(bmp, 0, 0, size, size);
      codes = decode(x.getImageData(0, 0, size, size).data);
    } catch (_) {}
    bmp.close();
    self.postMessage({ id, codes }, codes ? [codes.buffer] : []);
    return;
  }
  const { src, x0, y0, span, look } = data;
  const vals = rainValues(new Uint8ClampedArray(256 * 256 * 4), 256, src, x0, y0, span, look);
  self.postMessage({ vals }, [vals.buffer]);
};
