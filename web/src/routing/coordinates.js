// Task 3: convert between map coordinates (lat/lon) and elevation-grid cells.
//
// Contract (from the PRD): coordinates are plain numeric decimal degrees,
//   { lat: 18.38, lon: 77.50 }
// Spherical Mars datum: planetocentric and planetographic latitudes coincide.
// Longitude is east-positive (0..360), as documented in docs/data-sources.md.
//
// The grid metadata comes from web/public/data/jezero_grid_meta.json
// (made by data-prep/crop_dem.py): meta.bounds {xmin,ymin,xmax,ymax} in metres,
// meta.width, meta.height. Row 0 is the NORTH edge, column 0 is the WEST edge.

export const MARS_RADIUS_M = 3396190;

const DEG = Math.PI / 180;

/** lat/lon (degrees) -> projected x/y (metres). */
export function latLonToXY({ lat, lon }) {
  const lon360 = ((lon % 360) + 360) % 360;
  return { x: MARS_RADIUS_M * lon360 * DEG, y: MARS_RADIUS_M * lat * DEG };
}

/** projected x/y (metres) -> lat/lon (degrees). */
export function xyToLatLon({ x, y }) {
  return { lat: y / MARS_RADIUS_M / DEG, lon: x / MARS_RADIUS_M / DEG };
}

/**
 * Convert a map coordinate to a grid cell.
 * @param {{lat:number, lon:number}} point
 * @param {object} meta  contents of jezero_grid_meta.json
 * @returns {{row:number, col:number} | null}  null if outside the grid
 */
export function latLonToCell(point, meta) {
  if (!Number.isFinite(point?.lat) || !Number.isFinite(point?.lon)) return null;
  const { radius, parallel, meridian } = projection(meta);
  const x = radius * (point.lon - meridian) * Math.PI / 180 * Math.cos(parallel);
  const y = radius * point.lat * Math.PI / 180;
  const { xmin, xmax, ymin, ymax } = meta.bounds;
  if (x < xmin || x >= xmax || y <= ymin || y > ymax) return null;
  const col = Math.floor((x - xmin) / meta.cell_size.x);
  const row = Math.floor((ymax - y) / meta.cell_size.y);
  return row >= 0 && row < meta.height && col >= 0 && col < meta.width
    ? { row, col } : null;
}

/**
 * Convert a grid cell back to a map coordinate (the cell centre).
 * @param {{row:number, col:number}} cell
 * @param {object} meta
 * @returns {{lat:number, lon:number}}
 */
export function cellToLatLon(cell, meta) {
  if (!Number.isInteger(cell?.row) || !Number.isInteger(cell?.col) ||
      cell.row < 0 || cell.col < 0 || cell.row >= meta.height || cell.col >= meta.width) {
    throw new Error('Cell is outside the study area.');
  }
  return projectedToLatLon(
    meta.bounds.xmin + (cell.col + 0.5) * meta.cell_size.x,
    meta.bounds.ymax - (cell.row + 0.5) * meta.cell_size.y, meta,
  );
}

function projection(meta) {
  const crs = meta.crs || '';
  if (!crs.includes('Equirectangular')) throw new Error('Unsupported terrain projection.');
  const radius = Number(crs.match(/SPHEROID\["[^"]+",([\d.]+)/)?.[1]);
  const parallel = Number(crs.match(/PARAMETER\["standard_parallel_1",([-\d.]+)/)?.[1] ?? 0) * Math.PI / 180;
  const meridian = Number(crs.match(/PARAMETER\["central_meridian",([-\d.]+)/)?.[1] ?? 0);
  if (!(radius > 0)) throw new Error('Mars radius is missing from terrain metadata.');
  return { radius, parallel, meridian };
}

function projectedToLatLon(x, y, meta) {
  const { radius, parallel, meridian } = projection(meta);
  return { lat: y / radius * 180 / Math.PI, lon: x / (radius * Math.cos(parallel)) * 180 / Math.PI + meridian };
}

/** Leaflet bounds at the outer edges, not the centres of corner cells. */
export function gridBoundsLatLon(meta) {
  const sw = projectedToLatLon(meta.bounds.xmin, meta.bounds.ymin, meta);
  const ne = projectedToLatLon(meta.bounds.xmax, meta.bounds.ymax, meta);
  return [[sw.lat, sw.lon], [ne.lat, ne.lon]];
}
