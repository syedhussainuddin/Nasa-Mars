import { computeSlopeGrid } from '../routing/slope.js';
import { createTerrainRaster, createSlopeRaster } from './rasters.js';

let cached;
export function loadGrid({ retry = false } = {}) {
  if (retry) cached = undefined;
  if (!cached) cached = Promise.all([
    fetchJson('jezero_grid.json'), fetchJson('jezero_grid_meta.json'),
  ]).then(([grid, meta]) => {
    if (!Number.isInteger(meta.height) || !Number.isInteger(meta.width) ||
        !(meta.cell_size?.x > 0) || !(meta.cell_size?.y > 0) ||
        grid.length !== meta.height || grid.some(row => !Array.isArray(row) || row.length !== meta.width ||
          row.some(v => v !== null && !Number.isFinite(v)))) {
      throw new Error('Terrain grid does not match its metadata.');
    }
    const slopes = computeSlopeGrid(grid, meta);
    return { grid, meta, slopes, terrainUrl: createTerrainRaster(grid, meta), slopeUrl: createSlopeRaster(slopes, meta) };
  }).catch(error => { cached = undefined; throw error; });
  return cached;
}

export async function fetchJson(file) {
  const response = await fetch(`${import.meta.env.BASE_URL}data/${file}`);
  if (!response.ok) throw new Error(`Could not load ${file} (${response.status}).`);
  return response.json();
}
