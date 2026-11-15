// Quick end-to-end check of the real data + slope + routing code, without the website.
// Run from the repo root:   node data-prep/check_route.mjs
import { readFileSync } from "node:fs";
import { gridBoundsLatLon } from "../web/src/routing/coordinates.js";
import { computeSlopeGrid } from "../web/src/routing/slope.js";
import { planRoute } from "../web/src/routing/planRoute.js";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const grid = read("../web/public/data/jezero_grid.json");
const meta = read("../web/public/data/jezero_grid_meta.json");

// 1. Slope grid
let t = performance.now();
const slope = computeSlopeGrid(grid, meta);
console.log("Slope grid: %d x %d, took %d ms", slope[0].length, slope.length, Math.round(performance.now() - t));
const counts = { empty: 0, under10: 0, from10to15: 0, over15: 0 };
let maxSlope = 0;
for (const row of slope) for (const s of row) {
  if (s == null) counts.empty++;
  else if (s < 10) counts.under10++;
  else if (s <= 15) counts.from10to15++;
  else counts.over15++;
  if (s != null && s > maxSlope) maxSlope = s;
}
const total = slope.length * slope[0].length;
for (const [k, v] of Object.entries(counts)) console.log("  %s: %s%%", k, ((100 * v) / total).toFixed(1));
console.log("  steepest slope in the grid: %s degrees", maxSlope.toFixed(1));

// 2. A few routes between points inside the study area
const b = gridBoundsLatLon(meta);
const at = (fx, fy) => ({ lat: b.south + fy * (b.north - b.south), lon: b.west + fx * (b.east - b.west) });
const pairs = [
  ["SW to NE", at(0.15, 0.15), at(0.85, 0.85)],
  ["W to E", at(0.1, 0.5), at(0.9, 0.5)],
  ["short hop", at(0.45, 0.45), at(0.55, 0.52)],
];
for (const [name, a, z] of pairs) {
  t = performance.now();
  let r;
  try { r = planRoute(a, z, grid, meta); } catch (e) { r = { error: "CRASH: " + e.message }; }
  const ms = Math.round(performance.now() - t);
  if (r.error) console.log("Route %s: ERROR (%s) in %d ms", name, r.error, ms);
  else console.log("Route %s: %s km, steepest %s deg, risk %s, %d cells, %d ms", name,
    r.distanceKm.toFixed(2), r.maxSlopeDeg.toFixed(1), r.riskLevel, r.cells.length, ms);
}
