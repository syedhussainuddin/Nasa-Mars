// Loads the elevation grid and its metadata once, then reuses them.
// Usage:  const { grid, meta } = await loadGrid();

import { computeSlopeGrid } from "../routing/slope.js";
import { createTerrainRaster, createSlopeRaster } from "./rasters.js";

let cache = null;

export async function fetchJson(filename) {
  const base = import.meta.env?.BASE_URL || "/";
  const response = await fetch(base + "data/" + filename);
  if (!response.ok) throw new Error(`Could not load ${filename} (${response.status}).`);
  return response.json();
}

async function loadGridData() {
  const [grid, meta] = await Promise.all([
    fetchJson("jezero_grid.json"),
    fetchJson("jezero_grid_meta.json"),
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

export async function loadGrid() {
  if (!cache) {
    // Share in-flight work as well as completed data. Failed loads can be retried.
    cache = loadGridData().catch((error) => {
      cache = null;
      throw error;
    });
  }
  return cache;
}
