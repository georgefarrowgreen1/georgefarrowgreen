import { metresBetween } from "../../../fitness/routes-geometry.js";
import grid from "./settlement-grid.json" with { type: "json" };

const [west, south, east, north] = grid.bounds;
const [longitudeStep, latitudeStep] = grid.resolution;

// 0 for rural or unmapped, 1 for suburban up to 4 for an urban centre.
export function settlementDensity(longitude, latitude) {
  if (longitude < west || longitude >= east || latitude <= south || latitude > north) return 0;
  const row = grid.rows[Math.floor((north - latitude) / latitudeStep)];
  if (!row) return 0;
  const column = Math.floor((longitude - west) / longitudeStep);
  let low = 0, high = row.length / 3;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const index = middle * 3;
    if (column < row[index]) high = middle;
    else if (column >= row[index + 1]) low = middle + 1;
    else return row[index + 2];
  }
  return 0;
}

const distances = new WeakMap();

// Sample along the actual line, including long edges with few geometry points.
export function builtUpEdgeMetres([lon, lat], [nextLon, nextLat], metres) {
  const steps = Math.max(1, Math.ceil(metres / 250));
  let exposure = 0;
  for (let n = 0; n < steps; n++) {
    const t = (n + .5) / steps;
    exposure += settlementDensity(lon + (nextLon - lon) * t, lat + (nextLat - lat) * t);
  }
  return metres / steps * exposure / 4;
}

export function builtUpMetres(coords) {
  if (distances.has(coords)) return distances.get(coords);
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1], b = coords[i];
    total += builtUpEdgeMetres(a, b, metresBetween(a, b));
  }
  distances.set(coords, total);
  return total;
}
