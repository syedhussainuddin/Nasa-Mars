// Frontend-only state. Routing and DEM modules remain owned by the data team.
export function createInitialState() {
  return {
    view: "globe",
    panel: null,
    endpoints: { start: null, end: null },
    route: null,
    hazardsVisible: false,
    routeStatus: "idle",
    routeError: "",
    routeRequestId: 0,
    transition: null,
    transitionId: 0,
    viewports: {
      globe: { center: { lat: 0, lon: 0 }, distance: 3 },
      map: { center: { lat: 18.36, lon: 77.22 }, zoom: 11 },
    },
  };
}

const validPoint = (point) => Number.isFinite(point?.lat) &&
  Math.abs(point.lat) <= 90 && Number.isFinite(point?.lon);
const validRoute = (route) => !route?.error && Array.isArray(route?.cells) &&
  route.cells.length > 0 && Number.isFinite(route.distanceKm) && route.distanceKm >= 0;

function changeView(state, view) {
  if (!["globe", "map"].includes(view) || view === state.view) return state;
  const id = state.transitionId + 1;
  return {
    ...state,
    view,
    transitionId: id,
    transition: { id, from: state.view, to: view },
  };
}

/** A: home, B: planner, C: endpoints, D: map, E: calculated/saved. */
export function selectStage(state) {
  if (state.route || state.panel === "saved") return "E";
  if (state.view === "map") return "D";
  if (state.endpoints.start && state.endpoints.end) return "C";
  return state.panel === "planner" ? "B" : "A";
}

export function appReducer(state, action) {
  switch (action.type) {
    case "TOGGLE_PANEL":
      if (!["planner", "saved"].includes(action.panel)) return state;
      return { ...state, panel: state.panel === action.panel ? null : action.panel };
    case "SET_VIEW":
      return changeView(state, action.view);
    case "MAP_TOOL":
      return state.view === "globe"
        ? changeView(state, "map")
        : { ...state, hazardsVisible: !state.hazardsVisible };
    case "TRANSITION_COMPLETE":
      return state.transition?.id === action.id ? { ...state, transition: null } : state;
    case "UPDATE_VIEWPORT": {
      if (!["globe", "map"].includes(action.view) || !validPoint(action.viewport?.center)) return state;
      const viewport = action.viewport;
      if (action.view === "map" && (!Number.isFinite(viewport.zoom) || viewport.zoom < 0)) return state;
      if (action.view === "globe" && (!Number.isFinite(viewport.distance) || viewport.distance <= 0)) return state;
      return {
        ...state,
        viewports: { ...state.viewports, [action.view]: { ...viewport, center: { ...viewport.center } } },
      };
    }
    case "SELECT_ENDPOINT": {
      if (!validPoint(action.point)) return { ...state, routeError: "Choose a valid map coordinate." };
      const point = { ...action.point };
      const endpoints = !state.endpoints.start || state.endpoints.end
        ? { start: point, end: null }
        : { start: state.endpoints.start, end: point };
      return {
        ...state, endpoints, panel: "planner", route: null, routeStatus: "idle",
        routeError: "", routeRequestId: state.routeRequestId + 1,
      };
    }
    case "ROUTE_START":
      if (!state.endpoints.start || !state.endpoints.end) {
        return { ...state, routeError: "Choose both a start and a destination." };
      }
      return {
        ...state, route: null, routeStatus: "loading", routeError: "",
        routeRequestId: state.routeRequestId + 1,
      };
    case "ROUTE_SUCCESS":
      if (state.routeStatus !== "loading" || action.requestId !== state.routeRequestId) return state;
      if (!validRoute(action.route)) {
        return { ...state, route: null, routeStatus: "error", routeError: "The route result is invalid." };
      }
      return { ...state, route: action.route, panel: "planner", routeStatus: "ready", routeError: "" };
    case "ROUTE_ERROR":
      if (state.routeStatus !== "loading" || action.requestId !== state.routeRequestId) return state;
      return {
        ...state, route: null, routeStatus: "error",
        routeError: typeof action.error === "string" && action.error ? action.error : "No route could be calculated.",
      };
    case "RESTORE_ROUTE": {
      if (!validPoint(action.endpoints?.start) || !validPoint(action.endpoints?.end) || !validRoute(action.route)) {
        return { ...state, routeError: "This saved route is corrupt and could not be loaded." };
      }
      return changeView({
        ...state,
        endpoints: { start: { ...action.endpoints.start }, end: { ...action.endpoints.end } },
        route: action.route, panel: "planner", routeStatus: "ready", routeError: "",
        routeRequestId: state.routeRequestId + 1,
      }, "map");
    }
    default:
      return state;
  }
}
