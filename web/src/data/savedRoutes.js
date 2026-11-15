const KEY = "mars-nav:saved-routes:v1";
let sessionRoutes = [];
let sessionOnly = false;

const validCell = (cell) => Number.isInteger(cell?.row) && Number.isInteger(cell?.col) &&
  cell.row >= 0 && cell.col >= 0;

/** Stored entries contain endpoints; the route is recalculated against the current grid. */
export function isValidSavedRoute(route, meta) {
  return typeof route?.id === "string" && route.id.length > 0 &&
    typeof route.name === "string" && route.name.length > 0 &&
    validCell(route.start) && validCell(route.end) &&
    (!meta || [route.start, route.end].every((cell) =>
      cell.row < meta.height && cell.col < meta.width)) &&
    Number.isFinite(route.distanceKm) && route.distanceKm >= 0;
}

export function readSavedRoutes(meta) {
  if (sessionOnly) {
    return {
      routes: sessionRoutes.filter((route) => isValidSavedRoute(route, meta)),
      error: "Storage is unavailable. Your routes are saved for this session only.",
    };
  }
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (!Array.isArray(raw)) throw new Error("Invalid saved routes.");
    const routes = raw.filter((route) => isValidSavedRoute(route, meta));
    sessionRoutes = routes;
    return {
      routes,
      error: routes.length === raw.length ? "" : "Some saved routes are corrupt and could not be loaded.",
    };
  } catch {
    return {
      routes: sessionRoutes.filter((route) => isValidSavedRoute(route, meta)),
      error: "Saved routes could not be read. Routes remain available in this session.",
    };
  }
}

export function writeSavedRoutes(routes) {
  if (!Array.isArray(routes) || !routes.every((route) => isValidSavedRoute(route))) {
    return "The route could not be saved because its data is invalid.";
  }
  // Snapshot rather than retaining references the caller may mutate.
  sessionRoutes = JSON.parse(JSON.stringify(routes));
  try {
    localStorage.setItem(KEY, JSON.stringify(sessionRoutes));
    sessionOnly = false;
    return "";
  } catch {
    sessionOnly = true;
    return "Storage is unavailable. Your routes are saved for this session only.";
  }
}
