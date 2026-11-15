// Task 3: convert between map coordinates (lat/lon) and elevation-grid cells.
//
// Conventions (confirmed from the DEM metadata, see docs/data-sources.md):
//   - Points are plain decimal degrees: { lat: 18.3, lon: 77.2 }
//   - Longitude is east-positive. Negative longitudes are accepted and wrapped
//     into 0..360.
//   - The DEM uses an Equirectangular projection on a Mars sphere (radius
//     3,396,190 m), central meridian 0, standard parallel 0. Because the
//     reference is a sphere, planetocentric and planetographic latitude are the
//     same thing here.
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
  const { x, y } = latLonToXY(point);
  const { xmin, ymin, xmax, ymax } = meta.bounds;
  if (x < xmin || x >= xmax || y <= ymin || y > ymax) return null;
  const col = Math.floor(((x - xmin) / (xmax - xmin)) * meta.width);
  const row = Math.floor(((ymax - y) / (ymax - ymin)) * meta.height);
  if (row < 0 || row >= meta.height || col < 0 || col >= meta.width) return null;
  return { row, col };
}

/**
 * Convert a grid cell back to a map coordinate (the cell centre).
 * @param {{row:number, col:number}} cell
 * @param {object} meta
 * @returns {{lat:number, lon:number}}
 */
export function cellToLatLon(cell, meta) {
  const { xmin, ymin, xmax, ymax } = meta.bounds;
  const x = xmin + ((cell.col + 0.5) / meta.width) * (xmax - xmin);
  const y = ymax - ((cell.row + 0.5) / meta.height) * (ymax - ymin);
  return xyToLatLon({ x, y });
}

/**
 * Lat/lon edges of the whole grid, handy for fitting the map view or drawing
 * the study-area rectangle.
 * @returns {{south:number, west:number, north:number, east:number}}
 */
export function gridBoundsLatLon(meta) {
  const sw = xyToLatLon({ x: meta.bounds.xmin, y: meta.bounds.ymin });
  const ne = xyToLatLon({ x: meta.bounds.xmax, y: meta.bounds.ymax });
  return { south: sw.lat, west: sw.lon, north: ne.lat, east: ne.lon };
}
