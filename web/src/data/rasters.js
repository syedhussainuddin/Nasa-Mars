function raster(meta, color) {
  const canvas = document.createElement('canvas');
  canvas.width = meta.width;
  canvas.height = meta.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser does not support the terrain canvas.');
  const image = context.createImageData(meta.width, meta.height);
  for (let r = 0; r < meta.height; r++) for (let c = 0; c < meta.width; c++) {
    image.data.set(color(r, c), (r * meta.width + c) * 4);
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

export function createTerrainRaster(grid, meta) {
  let min = Infinity, max = -Infinity;
  for (const row of grid) for (const z of row) if (z !== null) { min = Math.min(min, z); max = Math.max(max, z); }
  return raster(meta, (r, c) => {
    const z = grid[r][c];
    if (z === null) return [21, 20, 23, 255];
    const t = (z - min) / (max - min || 1);
    const dx = ((grid[r]?.[c + 1] ?? z) - (grid[r]?.[c - 1] ?? z)) / (2 * meta.cell_size.x);
    const dy = ((grid[r + 1]?.[c] ?? z) - (grid[r - 1]?.[c] ?? z)) / (2 * meta.cell_size.y);
    const light = Math.max(0.38, Math.min(1.35, 0.9 - dx * 0.65 - dy * 0.45));
    return [Math.min(255, (112 + t * 100) * light), (55 + t * 70) * light, (36 + t * 46) * light, 255];
  });
}

export function createSlopeRaster(slopes, meta) {
  return raster(meta, (r, c) => {
    const slope = slopes[r][c];
    return slope === null ? [0, 0, 0, 0] : slope < 10 ? [67, 164, 111, 255]
      : slope <= 20 ? [245, 205, 72, 255] : [227, 74, 59, 255];
  });
}
