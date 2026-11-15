import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { cellToLatLon } from "../src/routing/coordinates.js";
import { selectMapEndpoint, routeLatLngs, routeFitOptions, studyFitOptions, needsStudyFocus, readMapInsets, wrapLongitude } from "../src/map/mapHelpers.js";
import { appReducer, createInitialState } from "../src/state/appState.js";
import { MAP_TRANSITION_DISTANCE } from "../src/globe/globeMath.js";

const meta = JSON.parse(await readFile(new URL("../public/data/jezero_grid_meta.json", import.meta.url), "utf8"));
const grid = JSON.parse(await readFile(new URL("../public/data/jezero_grid.json", import.meta.url), "utf8"));

test("map endpoint selection snaps cells, wraps longitude and rejects outside/missing terrain", () => {
  const cell = { row: 250, col: 250 };
  const point = cellToLatLon(cell, meta);
  const data = { grid, meta };
  assert.deepEqual(selectMapEndpoint(point, data), { point, cell });
  assert.deepEqual(selectMapEndpoint({ ...point, lon: point.lon + 360 }, data), { point, cell });
  assert.match(selectMapEndpoint(point, null).error, /loading/);
  assert.match(selectMapEndpoint({ lat: 0, lon: 0 }, data).error, /outlined study area/);
  assert.match(selectMapEndpoint({ lat: NaN, lon: 0 }, data).error, /valid/);
  const missing = { ...data, grid: grid.map((row) => [...row]) };
  missing.grid[cell.row][cell.col] = null;
  assert.match(selectMapEndpoint(point, missing).error, /no elevation/);
  assert.equal(wrapLongitude(354.47), -5.529999999999973);
});

test("map route geometry uses restored coordinate module and rejects invalid cells", () => {
  const cells = [{ row: 250, col: 250 }, { row: 251, col: 251 }];
  assert.deepEqual(routeLatLngs({ cells }, meta), cells.map((cell) => {
    const point = cellToLatLon(cell, meta);
    return [point.lat, point.lon];
  }));
  assert.deepEqual(routeLatLngs(null, meta), []);
  assert.throws(() => routeLatLngs({ cells: [] }, meta), /valid map geometry/);
  assert.throws(() => routeLatLngs({ cells: [{ row: 9999, col: 0 }] }, meta), /outside/);
  assert.ok(routeFitOptions("planner").paddingTopLeft[0] > routeFitOptions(null).paddingTopLeft[0]);
});

test("map/globe hysteresis preserves state and cannot immediately oscillate", () => {
  let state = createInitialState();
  state = appReducer(state, { type: "TOGGLE_PANEL", panel: "planner" });
  state = appReducer(state, { type: "SELECT_ENDPOINT", point: { lat: 18.36, lon: 77.22 } });
  const route = { cells: [{ row: 1, col: 1 }], distanceKm: 0 };
  state = { ...state, route, routeStatus: "ready" };
  const closeGlobe = { center: { lat: 18.37, lon: 77.23 }, distance: 1.4 };
  state = appReducer(state, { type: "ENTER_MAP", viewport: closeGlobe });
  assert.equal(state.view, "map");
  assert.equal(state.viewports.map.zoom, 4);
  assert.deepEqual(state.viewports.map.center, closeGlobe.center);
  state = appReducer(state, { type: "MAP_TOOL" });
  const before = state;
  assert.equal(appReducer(state, { type: "EXIT_MAP", viewport: { center: closeGlobe.center, zoom: 4 } }), state);
  state = appReducer(state, { type: "EXIT_MAP", viewport: { center: { lat: 20, lon: 80 }, zoom: 3 } });
  assert.equal(state.view, "globe");
  assert.ok(state.viewports.globe.distance > MAP_TRANSITION_DISTANCE);
  assert.deepEqual(state.viewports.globe.center, { lat: 20, lon: 80 });
  assert.deepEqual(state.endpoints, before.endpoints);
  assert.equal(state.panel, before.panel);
  assert.equal(state.hazardsVisible, true);
  assert.equal(state.route, route);
  state = appReducer(state, { type: "MAP_TOOL" });
  assert.equal(state.viewports.map.zoom, 4);
  assert.deepEqual(state.viewports.map.center, { lat: 20, lon: 80 });
});

test("hazards request visible Jezero coverage only when enabled; active map pin can locate again", () => {
  let state = appReducer(createInitialState(), { type: "MAP_TOOL" });
  state = appReducer(state, { type: "MAP_TOOL" });
  assert.equal(state.hazardsVisible, true);
  assert.equal(state.studyFocus.reason, "hazard");
  const firstId = state.studyFocus.id;
  state = appReducer(state, { type: "STUDY_FOCUS_COMPLETE", id: firstId });
  assert.equal(state.studyFocus, null);
  state = appReducer(state, { type: "LOCATE_STUDY_AREA" });
  assert.equal(state.panel, "planner");
  assert.equal(state.studyFocus.reason, "planner");
  const next = appReducer(state, { type: "LOCATE_STUDY_AREA" });
  assert.ok(next.studyFocus.id > state.studyFocus.id);
  assert.equal(next.panel, "planner");
  assert.equal(appReducer(next, { type: "STUDY_FOCUS_COMPLETE", id: firstId }), next);
  assert.equal(appReducer(next, { type: "MAP_TOOL" }).studyFocus, null);
});

test("coverage auto-focus reveals off-screen/tiny study areas but preserves useful close-ups", () => {
  assert.equal(needsStudyFocus({ centerInside: false, width: 500, height: 500 }), true);
  assert.equal(needsStudyFocus({ centerInside: true, width: 5, height: 5 }), true);
  assert.equal(needsStudyFocus({ centerInside: true, width: 400, height: 400 }), false);
  assert.equal(needsStudyFocus({ centerInside: true, width: 5000, height: 5000 }), false);
  assert.equal(studyFitOptions("planner", 1440, 1024).maxZoom, 12);
});

test("map padding uses actual tablet controls rather than desktop-width assumptions", () => {
  const bounds = {
    "#planner-panel": { right: 344, width: 320, height: 494 },
    ".conditions-header": { bottom: 142, width: 624, height: 118 },
    ".right-toolbar": { left: 960, width: 40, height: 150 },
    ".imagery-status": { top: 680, width: 280, height: 64 },
  };
  const root = { querySelector: (selector) => bounds[selector] ? { getBoundingClientRect: () => bounds[selector] } : null };
  const element = {
    closest: () => root,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 1024, bottom: 768 }),
  };
  const insets = readMapInsets(element, "planner");
  assert.deepEqual(insets, { left: 368, top: 165, right: 90, bottom: 104 });
  assert.deepEqual(routeFitOptions("planner", 1024, 768, insets).paddingTopLeft, [368, 165]);
  assert.deepEqual(studyFitOptions("planner", 1024, 768, insets).paddingBottomRight, [90, 104]);
  assert.equal(readMapInsets({ closest: () => null }, null), undefined);
});
