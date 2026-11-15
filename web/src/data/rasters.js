import { classFor } from "../routing/routeMetrics.js";

const SLOPE_COLORS = {
  green: [0, 200, 83, 255],
  yellow: [241, 199, 73, 255],
  red: [227, 74, 59, 255],
};

function raster(meta, color) {
  const canvas = document.createElement("canvas");
  canvas.width = meta.width;
  canvas.height = meta.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser does not support the terrain canvas.");
  const image = context.createImageData(meta.width, meta.height);
  for (let row = 0; row < meta.height; row += 1) {
    for (let col = 0; col < meta.width; col += 1) {
      image.data.set(color(row, col), (row * meta.width + col) * 4);
    }
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

/** Elevation tint with approximate hill shading; missing terrain stays transparent. */
export function createTerrainRaster(grid, meta) {
  let min = Infinity, max = -Infinity;
  for (const row of grid) for (const value of row) {
    if (Number.isFinite(value)) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }
  const neighbor = (row, col, fallback) =>
    Number.isFinite(grid[row]?.[col]) ? grid[row][col] : fallback;
  return raster(meta, (row, col) => {
    const z = grid[row][col];
    if (!Number.isFinite(z)) return [0, 0, 0, 0];
    const t = (z - min) / (max - min || 1);
    const dx = (neighbor(row, col + 1, z) - neighbor(row, col - 1, z)) / (2 * meta.cell_size.x);
    const dy = (neighbor(row + 1, col, z) - neighbor(row - 1, col, z)) / (2 * meta.cell_size.y);
    const light = Math.max(0.38, Math.min(1.35, 0.9 - dx * 0.65 - dy * 0.45));
    return [Math.min(255, (112 + t * 100) * light), (55 + t * 70) * light, (36 + t * 46) * light, 255];
  });
}

/** Uses the same 10°/15° thresholds as route metrics. Overlay opacity is set by the map. */
export function createSlopeRaster(slopeGrid, meta) {
  return raster(meta, (row, col) => {
    const slope = slopeGrid[row][col];
    return Number.isFinite(slope) ? SLOPE_COLORS[classFor(slope)] : [0, 0, 0, 0];
  });
}
