// Average elevation per 0.5° square from AWS terrain tiles (Terrarium PNG, zoom 4).
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/');
const { PNG } = require('pngjs');
const Z = 4, N = 2 ** Z, STEP = 0.5, W = 360 / STEP, H = 180 / STEP;
const sum = new Float64Array(W * H), cnt = new Uint32Array(W * H);
const dir = process.argv[2]; fs.mkdirSync(dir, { recursive: true });
for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) {
  const f = `${dir}/${Z}-${x}-${y}.png`;
  if (!fs.existsSync(f)) {
    for (let k = 0; ; k++) { try { const r = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`); if (!r.ok) throw new Error(r.status); fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); break; } catch (e) { if (k > 4) throw e; await new Promise((z) => setTimeout(z, 2000)); } }
  }
  const png = PNG.sync.read(fs.readFileSync(f));
  for (let py = 0; py < 256; py++) {
    const my = (y * 256 + py + 0.5) / (N * 256), lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * my))) * 180) / Math.PI;
    const r = Math.floor((90 - lat) / STEP); if (r < 0 || r >= H) continue;
    for (let px = 0; px < 256; px++) {
      const lon = ((x * 256 + px + 0.5) / (N * 256)) * 360 - 180, c = Math.floor((lon + 180) / STEP) % W;
      const i = (py * 256 + px) * 4, e = png.data[i] * 256 + png.data[i + 1] + png.data[i + 2] / 256 - 32768;
      sum[r * W + c] += Math.max(0, e); cnt[r * W + c]++;
    }
  }
}
const out = new Int16Array(W * H);
for (let k = 0; k < W * H; k++) out[k] = cnt[k] ? Math.round(sum[k] / cnt[k]) : 0;
fs.writeFileSync(process.argv[3], Buffer.from(out.buffer));
const at = (lat, lon) => out[Math.floor((90 - lat) / STEP) * W + Math.floor((lon + 180) / STEP)];
console.log('Zurich', at(47.37, 8.54), 'Gotthard', at(46.56, 8.56), 'Matterhorn', at(45.98, 7.66), 'Lhasa', at(29.65, 91.1), 'Denver', at(39.74, -104.99), 'Aspen', at(39.19, -106.82), 'Paris', at(48.86, 2.35), 'Norway', at(61.5, 8.5));
