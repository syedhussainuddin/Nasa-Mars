import { latLonToCell, cellToLatLon } from "../routing/coordinates.js";
import { wrapLongitude } from "../map/mapHelpers.js";

export function formatCoordinates(point) {
  return point ? `${point.lat.toFixed(6)}, ${point.lon.toFixed(6)}` : "";
}

export function parseCoordinates(text) {
  const parts = String(text ?? "").trim().split(/[,\s]+/);
  const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
  if (parts.length !== 2 || !parts.every((part) => decimal.test(part))) return null;
  const [lat, lon] = parts.map(Number);
  if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon) || lon < -180 || lon > 360) return null;
  return { lat, lon: wrapLongitude(lon) };
}

export function endpointDetails(point, data) {
  if (!point || !data) return null;
  const cell = latLonToCell(point, data.meta);
  if (!cell || !Number.isFinite(data.grid[cell.row]?.[cell.col])) return null;
  return { cell, point: cellToLatLon(cell, data.meta), elevationM: data.grid[cell.row][cell.col], slopeDeg: data.slopeGrid[cell.row][cell.col] };
}

export function validateEndpoint(text, data, label) {
  if (!String(text ?? "").trim()) return { error: `Choose a ${label} point or enter its coordinates.` };
  const point = parseCoordinates(text);
  if (!point) return { error: "Enter latitude, longitude in decimal degrees (e.g. 18.36, 77.22)." };
  if (!data) return { error: "Terrain is not available. Reload the page and try again." };
  const cell = latLonToCell(point, data.meta);
  if (!cell) return { error: "Choose a point inside the outlined Jezero study area." };
  if (!Number.isFinite(data.grid[cell.row]?.[cell.col])) return { error: "This point has no elevation data. Choose another spot." };
  return { point: cellToLatLon(cell, data.meta), cell };
}

export function prepareEndpoints(drafts, data) {
  const start = validateEndpoint(drafts.start, data, "start");
  const end = validateEndpoint(drafts.end, data, "destination");
  return {
    endpoints: { start: start.point || null, end: end.point || null },
    errors: { start: start.error || "", end: end.error || "" },
    valid: !start.error && !end.error,
  };
}

/** Reject incomplete results before displaying or saving any metrics. */
export function assertRouteResult(result) {
  if (result?.error) throw new Error(typeof result.error === "string" ? result.error : result.error.message || "No route was found.");
  if (!Array.isArray(result?.cells) || !result.cells.length ||
      !Number.isFinite(result.distanceKm) || result.distanceKm < 0 ||
      !Number.isFinite(result.maxSlopeDeg) || !["Low", "Moderate", "High"].includes(result.riskLevel) ||
      !Array.isArray(result.elevationProfile) || result.elevationProfile.length !== result.cells.length ||
      !result.elevationProfile.every((point, index, points) =>
        Number.isFinite(point.distanceKm) && point.distanceKm >= 0 && Number.isFinite(point.elevationM) &&
        (!index || point.distanceKm >= points[index - 1].distanceKm))) {
    throw new Error("The route calculation returned incomplete data. Please try again.");
  }
  return result;
}

export function savedRouteEntry(route, meta, existingId) {
  const start = route.cells[0], end = route.cells.at(-1);
  const from = cellToLatLon(start, meta), to = cellToLatLon(end, meta);
  return {
    id: existingId || `${start.row}:${start.col}-${end.row}:${end.col}`,
    name: "Start → Dest",
    start: { ...start }, end: { ...end }, distanceKm: route.distanceKm,
    description: `${formatCoordinates(from)} → ${formatCoordinates(to)}`,
  };
}

export function upsertSavedRoute(routes, entry) {
  return [entry, ...routes.filter((route) => route.id !== entry.id)];
}
