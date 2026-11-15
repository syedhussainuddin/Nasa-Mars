import { latLonToCell, cellToLatLon } from "../routing/coordinates.js";

export const MAP_EXIT_ZOOM = 3;
export const MAP_ENTRY_ZOOM = 4;
export const MAP_MAX_ZOOM = 17;
export const HANDOFF_DURATION_MS = 280;

export const wrapLongitude = (lon) => ((lon + 180) % 360 + 360) % 360 - 180;

/** Snap accepted endpoints to DEM cell centres so markers and route cells align. */
export function selectMapEndpoint(point, data) {
  if (!data) return { error: "Terrain is still loading. Please try again in a moment." };
  if (!Number.isFinite(point?.lat) || !Number.isFinite(point?.lon)) {
    return { error: "Choose a valid map coordinate." };
  }
  const normalized = { lat: point.lat, lon: wrapLongitude(point.lon) };
  const cell = latLonToCell(normalized, data.meta);
  if (!cell) return { error: "Please pick both points inside the outlined study area." };
  if (!Number.isFinite(data.grid[cell.row]?.[cell.col])) {
    return { error: "This point has no elevation data. Try a different spot." };
  }
  return { point: cellToLatLon(cell, data.meta), cell };
}

export function routeLatLngs(route, meta) {
  if (!route) return [];
  if (route.error || !Array.isArray(route.cells) || !route.cells.length) {
    throw new Error("The route has no valid map geometry.");
  }
  return route.cells.map((cell) => {
    const { lat, lon } = cellToLatLon(cell, meta);
    return [lat, lon];
  });
}

/** Route fits leave room for the header, panel, toolbar, and slope legend. */
export function routeFitOptions(panel, width = 1440, height = 1024) {
  return {
    paddingTopLeft: [panel ? Math.min(448, width * 0.4) : 60, Math.min(190, height * 0.25)],
    paddingBottomRight: [Math.min(130, width * 0.15), 70],
    maxZoom: MAP_MAX_ZOOM,
    animate: false,
  };
}

export function studyFitOptions(panel, width, height) {
  return { ...routeFitOptions(panel, width, height), maxZoom: 12 };
}

/** Don't zoom away from useful close-up hazard views; reveal distant/tiny coverage. */
export function needsStudyFocus({ centerInside, width, height }) {
  return !centerInside || width < 160 || height < 160;
}
