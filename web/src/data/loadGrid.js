// Loads the elevation grid and its metadata once, then reuses them.
// Usage:  const { grid, meta, slopeGrid, terrainRaster, slopeRaster } = await loadGrid();
//
// Inside the Vite website the base path is picked up automatically.
// Outside Vite (for example a plain static page) pass the folder that contains
// the "data" folder, like loadGrid("./web/public/").

import { computeSlopeGrid } from "../routing/slope.js";
import { createTerrainRaster, createSlopeRaster } from "./rasters.js";

let cache = null;

export async function fetchJson(filename, base) {
  const prefix = base ?? import.meta.env?.BASE_URL ?? "/";
  const response = await fetch(prefix + "data/" + filename);
  if (!response.ok) throw new Error(`Could not load ${filename} (${response.status}).`);
  return response.json();
}

async function loadGridData(base) {
  const [grid, meta] = await Promise.all([
    fetchJson("jezero_grid.json", base),
    fetchJson("jezero_grid_meta.json", base),
  ]);
  const slopeGrid = computeSlopeGrid(grid, meta);
  return {
    grid,
    meta,
    slopeGrid,
    terrainRaster: createTerrainRaster(grid, meta),
    slopeRaster: createSlopeRaster(slopeGrid, meta),
  };
}

export async function loadGrid(base) {
  if (!cache) {
    // Share in-flight work as well as completed data. Failed loads can be retried.
    cache = loadGridData(base).catch((error) => {
      cache = null;
      throw error;
    });
  }
  return cache;
}