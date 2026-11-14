// Loads the elevation grid and its metadata once, then reuses them.
// Usage:  const { grid, meta } = await loadGrid();

let cache = null;

export async function loadGrid() {
  if (cache) return cache;
  const base = import.meta.env.BASE_URL || "/";
  const [gridRes, metaRes] = await Promise.all([
    fetch(base + "data/jezero_grid.json"),
    fetch(base + "data/jezero_grid_meta.json"),
  ]);
  if (!gridRes.ok || !metaRes.ok) {
    throw new Error("Could not load the elevation grid files.");
  }
  cache = { grid: await gridRes.json(), meta: await metaRes.json() };
  return cache;
}
