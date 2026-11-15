// Frontend-only state. Routing and DEM modules remain owned by the data team.
import { DEFAULT_CENTER, DEFAULT_DISTANCE } from "../globe/globeMath.js";
import { MAP_ENTRY_ZOOM, MAP_EXIT_ZOOM } from "../map/mapHelpers.js";
import { formatCoordinates } from "../planner/plannerData.js";

export function createInitialState() {
  return {
    view: "globe",
    panel: null,
    endpoints: { start: null, end: null },
    endpointDrafts: { start: "", end: "" },
    fieldErrors: { start: "", end: "" },
    plannerExpanded: false,
    route: null,
    hazardsVisible: false,
    studyFocus: null,
    studyFocusId: 0,
    routeStatus: "idle",
    routeError: "",
    routeRequestId: 0,
    transition: null,
    transitionId: 0,
    viewports: {
      globe: { center: { ...DEFAULT_CENTER }, distance: DEFAULT_DISTANCE },
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
    case "LOCATE_STUDY_AREA":
      return {
        ...state, panel: "planner", studyFocusId: state.studyFocusId + 1,
        studyFocus: { id: state.studyFocusId + 1, reason: "planner" },
      };
    case "STUDY_FOCUS_COMPLETE":
      return state.studyFocus?.id === action.id ? { ...state, studyFocus: null } : state;
    case "MAP_TOOL":
      return state.view === "globe"
        ? changeView({
          ...state,
          viewports: {
            ...state.viewports,
            map: { ...state.viewports.map, zoom: Math.max(MAP_ENTRY_ZOOM, state.viewports.map.zoom) },
          },
        }, "map")
        : {
          ...state, hazardsVisible: !state.hazardsVisible,
          ...(!state.hazardsVisible ? {
            studyFocusId: state.studyFocusId + 1,
            studyFocus: { id: state.studyFocusId + 1, reason: "hazard" },
          } : { studyFocus: null }),
        };
    case "ENTER_MAP":
      if (state.view !== "globe" || !validPoint(action.viewport?.center) ||
          !Number.isFinite(action.viewport.distance) || action.viewport.distance <= 0) return state;
      return changeView({
        ...state,
        viewports: {
          ...state.viewports,
          globe: action.viewport,
          map: { center: { ...action.viewport.center }, zoom: MAP_ENTRY_ZOOM },
        },
      }, "map");
    case "EXIT_MAP":
      if (state.view !== "map" || !validPoint(action.viewport?.center) ||
          !Number.isFinite(action.viewport.zoom) || action.viewport.zoom > MAP_EXIT_ZOOM) return state;
      return changeView({
        ...state,
        viewports: {
          map: action.viewport,
          // Hysteresis: never restore the close-in camera that triggered entry.
          globe: { center: { ...action.viewport.center }, distance: Math.max(DEFAULT_DISTANCE, state.viewports.globe.distance) },
        },
      }, "globe");
    case "ENDPOINT_ERROR":
      return {
        ...state, panel: "planner",
        routeError: typeof action.error === "string" ? action.error : "This map point could not be selected.",
      };
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
    case "EDIT_ENDPOINT":
      if (!["start", "end"].includes(action.kind) || typeof action.text !== "string") return state;
      return {
        ...state,
        endpointDrafts: { ...state.endpointDrafts, [action.kind]: action.text },
        endpoints: { ...state.endpoints, [action.kind]: validPoint(action.point) ? action.point : null },
        fieldErrors: { ...state.fieldErrors, [action.kind]: "" },
        route: null, routeStatus: "idle", routeError: "", routeRequestId: state.routeRequestId + 1,
      };
    case "VALIDATION_ERROR":
      return {
        ...state, panel: "planner", route: null, routeStatus: "error", routeError: "",
        endpoints: action.endpoints || state.endpoints, fieldErrors: action.errors,
        routeRequestId: state.routeRequestId + 1,
      };
    case "CALCULATION_ERROR":
      return {
        ...state, route: null, routeStatus: "error",
        routeError: action.error || "No route could be calculated.",
        routeRequestId: state.routeRequestId + 1,
      };
    case "SELECT_ENDPOINT": {
      if (!validPoint(action.point)) return { ...state, routeError: "Choose a valid map coordinate." };
      const point = { ...action.point };
      const endpoints = !state.endpoints.start || state.endpoints.end
        ? { start: point, end: null }
        : { start: state.endpoints.start, end: point };
      return {
        ...state, endpoints, panel: "planner", route: null, routeStatus: "idle",
        endpointDrafts: { start: formatCoordinates(endpoints.start), end: formatCoordinates(endpoints.end) },
        fieldErrors: { start: "", end: "" },
        routeError: "", routeRequestId: state.routeRequestId + 1,
      };
    }
    case "ROUTE_START": {
      const endpoints = action.endpoints || state.endpoints;
      if (!validPoint(endpoints.start) || !validPoint(endpoints.end)) {
        return { ...state, routeError: "Choose both a start and a destination." };
      }
      return {
        ...state, route: null, routeStatus: "loading", routeError: "",
        endpoints, fieldErrors: { start: "", end: "" },
        endpointDrafts: { start: formatCoordinates(endpoints.start), end: formatCoordinates(endpoints.end) },
        panel: action.restoring ? "saved" : "planner",
        routeRequestId: state.routeRequestId + 1,
      };
    }
    case "ROUTE_SUCCESS":
      if (state.routeStatus !== "loading" || action.requestId !== state.routeRequestId) return state;
      if (!validRoute(action.route)) {
        return { ...state, route: null, routeStatus: "error", routeError: "The route result is invalid." };
      }
      return changeView({
        ...state, route: action.route, panel: "planner", plannerExpanded: true,
        routeStatus: "ready", routeError: "", studyFocus: null,
      }, "map");
    case "ROUTE_ERROR":
      if (state.routeStatus !== "loading" || action.requestId !== state.routeRequestId) return state;
      return {
        ...state, route: null, routeStatus: "error",
        routeError: typeof action.error === "string" && action.error ? action.error : "No route could be calculated.",
      };
    case "RESTORE_ROUTE": {
      if (action.requestId != null && (action.requestId !== state.routeRequestId || state.routeStatus !== "loading")) return state;
      if (!validPoint(action.endpoints?.start) || !validPoint(action.endpoints?.end) || !validRoute(action.route)) {
        return { ...state, routeError: "This saved route is corrupt and could not be loaded." };
      }
      return changeView({
        ...state,
        endpoints: { start: { ...action.endpoints.start }, end: { ...action.endpoints.end } },
        endpointDrafts: { start: formatCoordinates(action.endpoints.start), end: formatCoordinates(action.endpoints.end) },
        fieldErrors: { start: "", end: "" }, plannerExpanded: true, studyFocus: null,
        route: action.route, panel: "planner", routeStatus: "ready", routeError: "",
        routeRequestId: state.routeRequestId + 1,
      }, "map");
    }
    default:
      return state;
  }
}
