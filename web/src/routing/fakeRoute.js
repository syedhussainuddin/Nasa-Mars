// TEMPORARY stand-in for Zayem's findRoute, so the whole app can be wired up
// before the real A* is ready. It draws a straight line between the two cells
// and fills in the same result shape the real one will return.

export function findRoute(grid, meta, start, end) {
  const cellM = meta.cell_size.x;
  const steps = Math.max(Math.abs(end.row - start.row), Math.abs(end.col - start.col), 1);

  const cells = [];
  for (let i = 0; i <= steps; i++) {
    cells.push({
      row: Math.round(start.row + ((end.row - start.row) * i) / steps),
      col: Math.round(start.col + ((end.col - start.col) * i) / steps),
    });
  }

  let distM = 0;
  let maxSlope = 0;
  const elevationProfile = [];
  for (let i = 0; i < cells.length; i++) {
    const z = grid[cells[i].row][cells[i].col];
    if (i > 0) {
      const a = cells[i - 1];
      const b = cells[i];
      const stepM = Math.hypot(b.row - a.row, b.col - a.col) * cellM;
      const prevZ = grid[a.row][a.col];
      distM += stepM;
      if (z != null && prevZ != null && stepM > 0) {
        maxSlope = Math.max(maxSlope, (Math.atan(Math.abs(z - prevZ) / stepM) * 180) / Math.PI);
      }
    }
    elevationProfile.push({ distanceKm: distM / 1000, elevationM: z });
  }

  const riskLevel = maxSlope > 20 ? "High" : maxSlope > 10 ? "Moderate" : "Low";
  return { cells, distanceKm: distM / 1000, maxSlopeDeg: maxSlope, riskLevel, elevationProfile };
}
