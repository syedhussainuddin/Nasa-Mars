import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { computeSlopeGrid } from "../src/routing/slope.js";
import { planRoute } from "../src/routing/planRoute.js";
import { cellToLatLon } from "../src/routing/coordinates.js";
import {
  parseCoordinates, formatCoordinates, prepareEndpoints, endpointDetails,
  assertRouteResult, savedRouteEntry, upsertSavedRoute,
} from "../src/planner/plannerData.js";
import { elevationChart } from "../src/planner/elevationChart.js";
import { calculateRouteAsync } from "../src/planner/routeClient.js";
import { appReducer, createInitialState } from "../src/state/appState.js";
import { readSavedRoutes, writeSavedRoutes } from "../src/data/savedRoutes.js";

const json = async (name) => JSON.parse(await readFile(new URL(`../public/data/${name}`, import.meta.url), "utf8"));
const meta = await json("jezero_grid_meta.json"), grid = await json("jezero_grid.json");
const data = { meta, grid, slopeGrid: computeSlopeGrid(grid, meta) };
const start = cellToLatLon({ row: 250, col: 250 }, meta);
const end = cellToLatLon({ row: 250, col: 330 }, meta);
const drafts = { start: formatCoordinates(start), end: formatCoordinates(end) };

test("planner parses decimal degrees without accepting junk or silently coercing missing values", () => {
  const point = parseCoordinates("18.36, 77.22");
  assert.equal(point.lat, 18.36);
  assert.ok(Math.abs(point.lon - 77.22) < 1e-10);
  for (const text of ["", "18.36", "x, y", "91, 77", "18, 361", "18.36 437.22", "18, Infinity", "0x12, 77", "18, 77, 1"]) {
    assert.equal(parseCoordinates(text), null, text);
  }
  assert.equal(formatCoordinates(null), "");
});

test("endpoint validation yields cell-centred points and live elevation/slope details", () => {
  const result = prepareEndpoints(drafts, data);
  assert.equal(result.valid, true);
  assert.deepEqual(result.endpoints, { start, end });
  const detail = endpointDetails(result.endpoints.start, data);
  assert.equal(detail.elevationM, grid[250][250]);
  assert.equal(detail.slopeDeg, data.slopeGrid[250][250]);
  assert.deepEqual(detail.cell, { row: 250, col: 250 });
  assert.match(prepareEndpoints({ start: "", end: drafts.end }, data).errors.start, /Choose a start/);
  assert.match(prepareEndpoints({ start: "0,0", end: drafts.end }, data).errors.start, /Jezero/);
  assert.match(prepareEndpoints(drafts, null).errors.start, /Terrain/);
  const missing = { ...data, grid: grid.map((row) => [...row]) };
  missing.grid[250][250] = null;
  assert.match(prepareEndpoints(drafts, missing).errors.start, /no elevation/);
});

test("only complete real route results can become summaries and saved entries", () => {
  const route = assertRouteResult(planRoute(start, end, grid, meta));
  assert.ok(route.distanceKm > 1 && route.cells.length > 2);
  const entry = savedRouteEntry(route, meta);
  assert.equal(entry.id, "250:250-250:330");
  assert.equal(entry.distanceKm, route.distanceKm);
  assert.equal(upsertSavedRoute(upsertSavedRoute([], entry), entry).length, 1);
  assert.equal(savedRouteEntry(route, meta, "existing-id").id, "existing-id");
  assert.throws(() => assertRouteResult({ error: { code: "NO_ROUTE", message: "No traversable route." } }), /No traversable/);
  assert.throws(() => assertRouteResult({ ...route, elevationProfile: [] }), /incomplete/);
});

test("elevation charts handle flat/single-point/zero-distance data without NaN", () => {
  for (const profile of [
    [{ distanceKm: 0, elevationM: -4000 }],
    [{ distanceKm: 0, elevationM: -4000 }, { distanceKm: 1, elevationM: -4000 }],
    [{ distanceKm: 0, elevationM: -4000 }, { distanceKm: 0.2, elevationM: -3900 }, { distanceKm: 1, elevationM: -4010 }],
  ]) {
    const chart = elevationChart(profile);
    assert.ok(chart);
    assert.doesNotMatch(chart.path, /NaN|Infinity/);
    assert.equal(chart.xTicks[0].value, 0);
    assert.equal(chart.xTicks.at(-1).value, profile.at(-1).distanceKm);
    assert.ok(chart.yTicks.every((point) => Number.isFinite(point.y)));
  }
  assert.equal(elevationChart([]), null);
  assert.equal(elevationChart([{ distanceKm: 1, elevationM: null }]), null);
  assert.equal(elevationChart([{ distanceKm: 1, elevationM: 1 }, { distanceKm: 0, elevationM: 2 }]), null);
});

test("editing after a calculation clears route results and ignores stale worker/restoration results", () => {
  let state = createInitialState();
  state = appReducer(state, { type: "ROUTE_START", endpoints: { start, end } });
  const requestId = state.routeRequestId;
  state = appReducer(state, { type: "ROUTE_SUCCESS", requestId, route: planRoute(start, end, grid, meta) });
  assert.equal(state.plannerExpanded, true);
  assert.equal(state.view, "map");
  state = appReducer(state, { type: "EDIT_ENDPOINT", kind: "start", text: "invalid", point: null });
  assert.equal(state.route, null);
  assert.equal(state.endpoints.start, null);
  assert.equal(state.endpointDrafts.start, "invalid");
  assert.equal(state.plannerExpanded, true);
  assert.equal(appReducer(state, { type: "RESTORE_ROUTE", requestId, endpoints: { start, end }, route: {} }), state);
  const invalid = appReducer(state, { type: "VALIDATION_ERROR", errors: { start: "Invalid.", end: "" } });
  assert.equal(invalid.fieldErrors.start, "Invalid.");
  assert.equal(invalid.route, null);
});

test("already-aborted calculations do not create a worker", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(calculateRouteAsync(start, end, data, controller.signal), { name: "AbortError" });
});

test("quota failure keeps in-session routes even when storage reads still succeed", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true, value: { getItem: () => null, setItem: () => { throw new Error("Quota exceeded"); } },
  });
  try {
    const route = savedRouteEntry(planRoute(start, end, grid, meta), meta);
    assert.match(writeSavedRoutes([route]), /session only/);
    assert.deepEqual(readSavedRoutes(meta).routes, [route]);
    assert.match(readSavedRoutes(meta).error, /session only/);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
    else delete globalThis.localStorage;
  }
});
