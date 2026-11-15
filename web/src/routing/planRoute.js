// The glue: takes two clicked map points and returns a route result (or an error).
// The frontend calls this after the user picks a start and an end.
//
//   const { grid, meta } = await loadGrid();
//   const result = planRoute(startLatLon, endLatLon, grid, meta);
//   if (result.error) { show result.error } else { draw result.cells, fill the summary box }
//
import { latLonToCell } from "./coordinates.js";
import { findRoute } from "./findRoute.js";

export function planRoute(startLatLon, endLatLon, grid, meta) {
  const start = latLonToCell(startLatLon, meta);
  const end = latLonToCell(endLatLon, meta);

  if (!start || !end) {
    return { error: "Please pick both points inside the outlined study area." };
  }
  if (grid[start.row][start.col] == null || grid[end.row][end.col] == null) {
    return { error: "One of the points has no elevation data. Try a different spot." };
  }

  const result = findRoute(grid, meta, start, end);
  if (!result || result.error) {
    const error = result?.error;
    return {
      error: (typeof error === "string" ? error : error?.message) ||
        "No route found between these points.",
    };
  }
  return { start, end, ...result };
}
