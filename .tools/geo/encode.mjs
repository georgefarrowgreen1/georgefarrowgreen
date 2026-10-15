// Write the data files: islands, and the elevation grid (0.5°, 150 m steps, run-length rows)
import fs from 'node:fs';
const [,, isl, elev, outI, outE] = process.argv;
const list = JSON.parse(fs.readFileSync(isl, 'utf8'));
fs.writeFileSync(outI, `/* Islands a pigeon can rest on: every island in Natural Earth's 10 m land
   (via world-atlas) of 3 to 150,000 km² that's out at sea, one per 40 km,
   [name, lat, lon], biggest first. Named from functions/_islands.js where
   one's within 250 km, else by the country it's off (or the sea it's in).
   Made by a one-off script; see the README. */
export const ISLES = ${JSON.stringify(list)};
`);
const g = new Int16Array(fs.readFileSync(elev).buffer.slice(0)), W = 720, H = 360, STEP_M = 150;
const rows = [];
for (let r = 0; r < H; r++) {
  const runs = []; let cur = -1, n = 0;
  for (let c = 0; c < W; c++) { const v = Math.min(35, Math.round(g[r * W + c] / STEP_M)); if (v === cur) n++; else { if (n) runs.push(cur.toString(36) + (n > 1 ? '.' + n.toString(36) : '')); cur = v; n = 1; } }
  runs.push(cur.toString(36) + (n > 1 ? '.' + n.toString(36) : ''));
  rows.push(runs.join(','));
}
fs.writeFileSync(outE, `/* The height of the land, every half degree: the average over each square, in
   steps of 150 m (35: 5,250 m or more), from the AWS Terrain Tiles (Terrarium,
   zoom 4; Mapzen's open terrain data). Rows run north to south, squares west
   to east from 180°W, as runs of "step (base 36).how many (base 36)".
   Made by a one-off script; see the README. */
export const STEP = 0.5, STEP_M = ${STEP_M};
export const DATA = ${JSON.stringify(rows.join(';'))};
`);
console.log(fs.statSync(outI).size, fs.statSync(outE).size);
