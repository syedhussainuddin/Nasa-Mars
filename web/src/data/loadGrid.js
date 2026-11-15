// Loads the elevation grid and its metadata once, then reuses them.
// Usage:  const { grid, meta } = await loadGrid();
//
// Inside the Vite website the base path is picked up automatically.
// Outside Vite (for example a plain test page) pass the folder that contains
// the "data" folder, like loadGrid("../web/public/").

let cache = null;

export async function loadGrid(base) {
  if (cache) return cache;
  let prefix = base;
  if (prefix === undefined) {
    prefix = (import.meta.env && import.meta.env.BASE_URL) || "/";
  }
  const [gridRes, metaRes] = await Promise.all([
    fetch(prefix + "data/jezero_grid.json"),
    fetch(prefix + "data/jezero_grid_meta.json"),
  ]);
  if (!gridRes.ok || !metaRes.ok) {
    throw new Error("Could not load the elevation grid files.");
  }
  cache = { grid: await gridRes.json(), meta: await metaRes.json() };
  return cache;
}
