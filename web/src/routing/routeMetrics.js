const CLASSES = ["green", "yellow", "red"];
const SLOPE_THRESHOLD_EPSILON = 1e-12;
const classFor = (slope) => slope < 10 ? "green" : slope <= 15 + SLOPE_THRESHOLD_EPSILON ? "yellow" : "red";

/** Return route length, maximum slope, risk label, elevation profile, and class shares. */
export function computeRouteMetrics(grid, meta, slopeGrid, cells) {
  if (!Array.isArray(grid) || !grid.length || !Array.isArray(grid[0])) throw new TypeError("grid must be a non-empty array");
  const height = grid.length, width = grid[0].length;
  if (!Array.isArray(slopeGrid) || slopeGrid.length !== height ||
      !grid.every((row) => Array.isArray(row) && row.length === width) ||
      !slopeGrid.every((row) => Array.isArray(row) && row.length === width)) throw new TypeError("grid and slopeGrid must be rectangular and match");
  const dx = meta?.cell_size?.x, dy = meta?.cell_size?.y;
  if (!Number.isFinite(dx) || dx <= 0 || !Number.isFinite(dy) || dy <= 0) throw new TypeError("cell sizes must be positive numbers");
  if (!Array.isArray(cells) || !cells.length) throw new TypeError("cells must contain at least one route cell");

  let distanceM = 0, maxSlopeDeg = 0, totalAscentM = 0;
  const counts = { green: 0, yellow: 0, red: 0 }, elevationProfile = [];
  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i];
    if (!cell || !Number.isInteger(cell.row) || !Number.isInteger(cell.col) || cell.row < 0 || cell.row >= height || cell.col < 0 || cell.col >= width) throw new TypeError("route contains a cell outside the grid");
    const elevation = grid[cell.row][cell.col], slope = slopeGrid[cell.row][cell.col];
    if (!Number.isFinite(elevation) || !Number.isFinite(slope)) throw new TypeError("route cells need numeric elevation and slope values");
    if (i) {
      const prev = cells[i - 1], dr = cell.row - prev.row, dc = cell.col - prev.col;
      if (Math.abs(dr) > 1 || Math.abs(dc) > 1 || (!dr && !dc)) throw new TypeError("route steps must connect adjacent cells");
      distanceM += Math.hypot(dr * dy, dc * dx);
      totalAscentM += Math.max(0, elevation - grid[prev.row][prev.col]);
    }
    maxSlopeDeg = Math.max(maxSlopeDeg, slope);
    counts[classFor(slope)] += 1;
    elevationProfile.push({ distanceKm: distanceM / 1000, elevationM: elevation });
  }
  const share = (key) => Math.round(counts[key] / cells.length * 10000) / 100;
  return {
    cells,
    distanceKm: distanceM / 1000,
    totalAscentM,
    maxSlopeDeg,
    riskLevel: maxSlopeDeg > 20 ? "High" : maxSlopeDeg > 10 ? "Moderate" : "Low",
    elevationProfile,
    hazardShare: Object.fromEntries(CLASSES.map((key) => [key, share(key)])),
  };
}
