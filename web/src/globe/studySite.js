import { gridBoundsLatLon } from "../routing/coordinates.js";

/** Use the supplied DEM footprint, not a hard-coded crater/landing location. */
export function studySiteFromMetadata(meta) {
  const [[south, west], [north, east]] = gridBoundsLatLon(meta);
  if (![south, west, north, east].every(Number.isFinite) || south >= north || west >= east) {
    throw new Error("The Jezero study-area bounds are invalid.");
  }
  return {
    id: "jezero-study-area",
    name: "Jezero Study Area",
    lat: (south + north) / 2,
    lon: (west + east) / 2,
  };
}
