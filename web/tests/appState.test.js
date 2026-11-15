import test from "node:test";
import assert from "node:assert/strict";
import { appReducer, createInitialState, selectStage } from "../src/state/appState.js";

const start = { lat: 18.36, lon: 77.22 };
const end = { lat: 18.37, lon: 77.23 };
const route = { cells: [{ row: 1, col: 1 }, { row: 1, col: 2 }], distanceKm: 0.016 };
const selectEndpoints = () => [start, end].reduce(
  (state, point) => appReducer(state, { type: "SELECT_ENDPOINT", point }), createInitialState(),
);

test("shell progresses through states A–E and toggles mutually exclusive panels", () => {
  let state = createInitialState();
  assert.equal(selectStage(state), "A");
  state = appReducer(state, { type: "TOGGLE_PANEL", panel: "planner" });
  assert.equal(selectStage(state), "B");
  for (const point of [start, end]) state = appReducer(state, { type: "SELECT_ENDPOINT", point });
  assert.equal(selectStage(state), "C");
  state = appReducer(state, { type: "MAP_TOOL" });
  assert.equal(selectStage(state), "D");
  assert.equal(state.view, "map");
  assert.equal(state.hazardsVisible, false);
  state = appReducer(state, { type: "MAP_TOOL" });
  assert.equal(state.hazardsVisible, true);
  state = appReducer(state, { type: "ROUTE_START" });
  assert.equal(state.routeStatus, "loading");
  state = appReducer(state, { type: "ROUTE_SUCCESS", requestId: state.routeRequestId, route });
  assert.equal(selectStage(state), "E");
  assert.equal(state.routeStatus, "ready");
  state = appReducer(state, { type: "TOGGLE_PANEL", panel: "saved" });
  assert.equal(state.panel, "saved");
  state = appReducer(state, { type: "TOGGLE_PANEL", panel: "saved" });
  assert.equal(state.panel, null);
  assert.equal(state.route, route);
});

test("view transitions preserve endpoints, route, panel, hazard setting, and viewports", () => {
  let state = selectEndpoints();
  state = appReducer(state, { type: "UPDATE_VIEWPORT", view: "map", viewport: { center: start, zoom: 14 } });
  state = appReducer(state, { type: "RESTORE_ROUTE", endpoints: { start, end }, route });
  state = appReducer(state, { type: "MAP_TOOL" });
  const saved = state;
  state = appReducer(state, { type: "SET_VIEW", view: "globe" });
  const transitionId = state.transition.id;
  assert.deepEqual(state.endpoints, saved.endpoints);
  assert.equal(state.route, route);
  assert.equal(state.panel, saved.panel);
  assert.equal(state.hazardsVisible, true);
  assert.deepEqual(state.viewports, saved.viewports);
  assert.equal(appReducer(state, { type: "TRANSITION_COMPLETE", id: transitionId - 1 }), state);
  state = appReducer(state, { type: "TRANSITION_COMPLETE", id: transitionId });
  assert.equal(state.transition, null);
  state = appReducer(state, { type: "SET_VIEW", view: "map" });
  assert.deepEqual(state.viewports.map, { center: start, zoom: 14 });
  assert.equal(appReducer(state, { type: "SET_VIEW", view: "map" }), state);
});

test("endpoint click cycle resets stale routes and invalidates pending results", () => {
  let state = selectEndpoints();
  state = appReducer(state, { type: "ROUTE_START" });
  const requestId = state.routeRequestId;
  const next = { lat: 18.38, lon: 77.24 };
  state = appReducer(state, { type: "SELECT_ENDPOINT", point: next });
  assert.deepEqual(state.endpoints, { start: next, end: null });
  assert.equal(state.route, null);
  assert.equal(state.routeStatus, "idle");
  assert.equal(appReducer(state, { type: "ROUTE_SUCCESS", requestId, route }), state);
  assert.equal(appReducer(state, { type: "ROUTE_ERROR", requestId, error: "Old request" }), state);
});

test("route validation and failure never produce partial results", () => {
  assert.match(appReducer(createInitialState(), { type: "ROUTE_START" }).routeError, /both/);
  assert.match(appReducer(createInitialState(), { type: "SELECT_ENDPOINT", point: { lat: 100, lon: 0 } }).routeError, /valid/);
  let state = appReducer(selectEndpoints(), { type: "ROUTE_START" });
  state = appReducer(state, { type: "ROUTE_ERROR", requestId: state.routeRequestId, error: "No traversable route." });
  assert.equal(state.route, null);
  assert.equal(state.routeStatus, "error");
  assert.equal(state.routeError, "No traversable route.");
  state = appReducer(state, { type: "ROUTE_START" });
  assert.equal(state.routeError, "");
  state = appReducer(state, { type: "ROUTE_SUCCESS", requestId: state.routeRequestId, route: { cells: [], distanceKm: 0 } });
  assert.equal(state.route, null);
  assert.equal(state.routeStatus, "error");
});

test("saved route restore enters map and planner; corrupt restore changes no existing route", () => {
  const endpoints = { start, end };
  const state = appReducer(createInitialState(), { type: "RESTORE_ROUTE", endpoints, route });
  assert.equal(state.view, "map");
  assert.equal(state.panel, "planner");
  assert.equal(state.route, route);
  assert.deepEqual(state.endpoints, endpoints);
  const corrupt = appReducer(state, { type: "RESTORE_ROUTE", endpoints, route: null });
  assert.equal(corrupt.route, route);
  assert.match(corrupt.routeError, /corrupt/);
});

test("invalid controls/viewports do not corrupt shell state; stale transitions are ignored", () => {
  const state = createInitialState();
  for (const action of [
    { type: "UNKNOWN" },
    { type: "TOGGLE_PANEL", panel: "other" },
    { type: "SET_VIEW", view: "other" },
    { type: "UPDATE_VIEWPORT", view: "other", viewport: {} },
    { type: "UPDATE_VIEWPORT", view: "map", viewport: { center: start, zoom: NaN } },
    { type: "UPDATE_VIEWPORT", view: "globe", viewport: { center: start, distance: -1 } },
  ]) assert.equal(appReducer(state, action), state);
  const map = appReducer(state, { type: "SET_VIEW", view: "map" });
  const globe = appReducer(map, { type: "SET_VIEW", view: "globe" });
  assert.equal(appReducer(globe, { type: "TRANSITION_COMPLETE", id: map.transition.id }), globe);
});
