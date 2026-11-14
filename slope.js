const RAD_TO_DEG = 180 / Math.PI;
const SLOPE_THRESHOLD_EPSILON = 1e-12;

function dimensions(grid, meta) {
  if (!Array.isArray(grid) || !grid.length || !Array.isArray(grid[0]) || !grid[0].length) throw new TypeError("grid must be a non-empty rectangular array");
  const height = grid.length, width = grid[0].length;
  if (!grid.every((row) => Array.isArray(row) && row.length === width)) throw new TypeError("grid rows must have the same width");
  const cellWidth = meta?.cell_size?.x, cellHeight = meta?.cell_size?.y;
  if (!Number.isFinite(cellWidth) || cellWidth <= 0 || !Number.isFinite(cellHeight) || cellHeight <= 0) throw new TypeError("meta.cell_size.x and meta.cell_size.y must be positive numbers");
  if ((meta.width != null && meta.width !== width) || (meta.height != null && meta.height !== height)) throw new TypeError("grid dimensions do not match metadata");
  return { width, height, cellWidth, cellHeight };
}

/** Central-difference slope in degrees; edges and cells with missing required neighbours are null. */
export function computeSlopeGrid(grid, meta) {
  const { width, height, cellWidth, cellHeight } = dimensions(grid, meta);
  const slopes = Array.from({ length: height }, () => Array(width).fill(null));
  for (let row = 1; row < height - 1; row += 1) {
    const north = grid[row - 1], current = grid[row], south = grid[row + 1], output = slopes[row];
    for (let col = 1; col < width - 1; col += 1) {
      const west = current[col - 1], east = current[col + 1], up = north[col], down = south[col];
      if (![current[col], west, east, up, down].every(Number.isFinite)) continue;
      const dzdx = (east - west) / (2 * cellWidth), dzdy = (up - down) / (2 * cellHeight);
      output[col] = Math.atan(Math.hypot(dzdx, dzdy)) * RAD_TO_DEG;
    }
  }
  return slopes;
}

/** Count finite slope cells and report the outline's green/yellow/red percentages. */
export function summarizeSlopeClasses(slopeGrid) {
  if (!Array.isArray(slopeGrid) || !slopeGrid.every(Array.isArray)) throw new TypeError("slopeGrid must be an array of rows");
  const counts = { green: 0, yellow: 0, red: 0 };
  let totalCells = 0;
  for (const row of slopeGrid) for (const slope of row) {
    if (!Number.isFinite(slope)) continue;
    totalCells += 1;
    if (slope < 10) counts.green += 1;
    else if (slope <= 15 + SLOPE_THRESHOLD_EPSILON) counts.yellow += 1;
    else counts.red += 1;
  }
  const pct = (count) => totalCells ? Math.round(count / totalCells * 10000) / 100 : 0;
  return { totalCells, counts, percentages: { green: pct(counts.green), yellow: pct(counts.yellow), red: pct(counts.red) } };
}
