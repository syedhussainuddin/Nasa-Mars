/**
 * Local finite-difference slope estimate from elevation (metres).
 * Central differences inside the grid; one-sided differences at valid edges.
 * This is a derived terrain layer, not a NASA safety classification.
 */
export function computeSlopeGrid(grid, meta) {
  const { width, height, cell_size: size } = meta;
  const at = (r, c) => grid[r]?.[c] ?? null;
  return Array.from({ length: height }, (_, r) => Array.from({ length: width }, (_, c) => {
    const z = at(r, c);
    if (z === null) return null;
    const l = at(r, c - 1), right = at(r, c + 1), up = at(r - 1, c), down = at(r + 1, c);
    const dx = l !== null && right !== null ? (right - l) / (2 * size.x)
      : right !== null ? (right - z) / size.x : l !== null ? (z - l) / size.x : null;
    const dy = up !== null && down !== null ? (down - up) / (2 * size.y)
      : down !== null ? (down - z) / size.y : up !== null ? (z - up) / size.y : null;
    return dx === null || dy === null ? null : Math.atan(Math.hypot(dx, dy)) * 180 / Math.PI;
  }));
}
