// Integration boundary: a contributor can add a module anywhere below routing/
// exporting findRoute (or a default function in findRoute.js/index.js).
// No UI component needs to change when the real implementation lands.
const modules = import.meta.env?.MODE
  ? import.meta.glob(['./**/*.js', '!./adapter.js', '!./coordinates.js', '!./slope.js']) : {};
let enginePromise;
async function getEngine() {
  if (!enginePromise) enginePromise = (async () => {
    for (const [path, load] of Object.entries(modules)) {
      const module = await load();
      if (typeof module.findRoute === 'function') return module.findRoute;
      if (/\/(findRoute|index)\.js$/.test(path) && typeof module.default === 'function') return module.default;
    }
    return null;
  })();
  return enginePromise;
}

export async function routingMode() { return await getEngine() ? 'real' : 'demo'; }

export async function calculateRoute(grid, meta, start, end, slopes) {
  return routeWithEngine(await getEngine(), grid, meta, start, end, slopes);
}

/** Pure integration seam, also exercised with async/error-producing test engines. */
export async function routeWithEngine(engine, grid, meta, start, end, slopes) {
  const valid = c => Number.isInteger(c?.row) && Number.isInteger(c?.col) && c.row >= 0 && c.row < meta.height &&
    c.col >= 0 && c.col < meta.width && Number.isFinite(grid[c.row]?.[c.col]);
  if (!valid(start) || !valid(end)) throw new Error('Choose endpoints on valid terrain inside the study area.');
  if (start.row === end.row && start.col === end.col) throw new Error('Choose a destination different from Start.');
  let result;
  try {
    result = engine ? await engine(grid, meta, start, end) : demoTraverse(grid, meta, start, end, slopes);
  } catch (error) {
    throw new Error(typeof error === 'string' ? error : error?.message || 'Route calculation failed. Try different endpoints.');
  }
  if (!result || result.error || result.success === false) {
    const error = result?.error;
    throw new Error(typeof error === 'string' ? error : error?.message || result?.message || 'No route found. Choose different endpoints.');
  }
  if (!Array.isArray(result.cells) || !result.cells.length) throw new Error('No route found. Choose different endpoints.');
  if (!result.cells.every(valid)) throw new Error('Routing returned a cell outside valid terrain.');
  const first = result.cells[0], last = result.cells.at(-1);
  if (first.row !== start.row || first.col !== start.col || last.row !== end.row || last.col !== end.col)
    throw new Error('Routing returned endpoints that do not match your selection.');
  if (!Number.isFinite(result.distanceKm) || result.distanceKm < 0 ||
      !Number.isFinite(result.maxSlopeDeg) || result.maxSlopeDeg < 0 ||
      !['Low', 'Moderate', 'High'].includes(result.riskLevel) ||
      !Array.isArray(result.elevationProfile) || result.elevationProfile.some((p, i, a) =>
        !Number.isFinite(p.distanceKm) || p.distanceKm < 0 || !Number.isFinite(p.elevationM) ||
        (i > 0 && p.distanceKm < a[i - 1].distanceKm))) {
    throw new Error('Routing returned an invalid summary or elevation profile.');
  }
  if (result.elevationProfile.length && Math.abs(result.elevationProfile.at(-1).distanceKm - result.distanceKm) > 0.01)
    throw new Error('Routing summary and elevation profile distances do not agree.');
  return { ...result, demo: !engine };
}

/**
 * Deliberately NOT a terrain-routing algorithm. A deterministic orthogonal
 * sample traverse (east/west first, then north/south) demonstrates the UI.
 * Distances, elevation profile and maximum slope come from its actual cells.
 * It does not avoid hazards and refuses no-data cells rather than bridging them.
 */
export function demoTraverse(grid, meta, start, end, slopes) {
  const cells = [{ ...start }];
  let { row, col } = start;
  while (col !== end.col) { col += Math.sign(end.col - col); cells.push({ row, col }); }
  while (row !== end.row) { row += Math.sign(end.row - row); cells.push({ row, col }); }
  if (cells.some(c => !Number.isFinite(grid[c.row]?.[c.col]))) throw new Error('Sample traverse crosses no-data terrain. Try different endpoints.');
  let distanceKm = 0, maxSlopeDeg = 0;
  const elevationProfile = cells.map((c, i) => {
    if (i) {
      const prev = cells[i - 1];
      const step = Math.hypot((c.col - prev.col) * meta.cell_size.x, (c.row - prev.row) * meta.cell_size.y);
      distanceKm += step / 1000;
      maxSlopeDeg = Math.max(maxSlopeDeg, Math.atan(Math.abs(grid[c.row][c.col] - grid[prev.row][prev.col]) / step) * 180 / Math.PI);
    }
    maxSlopeDeg = Math.max(maxSlopeDeg, slopes?.[c.row]?.[c.col] ?? 0);
    return { distanceKm, elevationM: grid[c.row][c.col] };
  });
  return { cells, distanceKm, maxSlopeDeg, riskLevel: maxSlopeDeg < 10 ? 'Low' : maxSlopeDeg <= 20 ? 'Moderate' : 'High', elevationProfile };
}
