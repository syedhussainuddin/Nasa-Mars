import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { latLonToCell, cellToLatLon, gridBoundsLatLon } from "../src/routing/coordinates.js";
import { planRoute } from "../src/routing/planRoute.js";
import { computeSlopeGrid } from "../src/routing/slope.js";
import { classFor } from "../src/routing/routeMetrics.js";
import { normalizeConditions } from "../src/data/conditions.js";
import { readSavedRoutes, writeSavedRoutes } from "../src/data/savedRoutes.js";
import { GLOBAL_LAYERS, STUDY_AREA_LAYERS, latLonToTile } from "../src/data/wmts.js";

const json = async (name) => JSON.parse(await readFile(new URL(`../public/data/${name}`, import.meta.url), "utf8"));
const meta = await json("jezero_grid_meta.json");
const grid = await json("jezero_grid.json");
const sample = await json("conditions_sample.json");

test("restored coordinates match the real grid bounds and round-trip all cell centres", () => {
  const [[south, west], [north, east]] = gridBoundsLatLon(meta);
  assert.ok(south > 18.29 && north < 18.44);
  assert.ok(west > 77.15 && east < 77.30);
  assert.equal(meta.cell_size.x, 16);
  assert.equal(meta.cell_size.y, 16);
  for (let row = 0; row < meta.height; row += 1) {
    for (let col = 0; col < meta.width; col += 1) {
      const cell = { row, col };
      assert.deepEqual(latLonToCell(cellToLatLon(cell, meta), meta), cell);
    }
  }
  assert.equal(latLonToCell({ lat: south - 0.01, lon: west }, meta), null);
  assert.equal(latLonToCell({ lat: north + 0.01, lon: east }, meta), null);
  assert.equal(latLonToCell(null, meta), null);
  assert.equal(latLonToCell({ lat: NaN, lon: west }, meta), null);
  assert.throws(() => cellToLatLon({ row: -1, col: 0 }, meta), /outside/);
});

test("real route finder returns metrics on actual terrain; structured errors become strings", () => {
  const slopes = computeSlopeGrid(grid, meta);
  let pair;
  for (let row = 1; row < meta.height - 1 && !pair; row += 1) {
    for (let col = 1; col < meta.width - 2; col += 1) {
      if ([slopes[row][col], slopes[row][col + 1]].every((s) => Number.isFinite(s) && s <= 15)) {
        pair = [{ row, col }, { row, col: col + 1 }];
        break;
      }
    }
  }
  assert.ok(pair, "test dataset must have adjacent traversable cells");
  const result = planRoute(...pair.map((cell) => cellToLatLon(cell, meta)), grid, meta);
  assert.equal(result.error, undefined);
  assert.equal(result.cells.length, 2);
  assert.equal(result.distanceKm, 0.016);
  assert.equal(result.elevationProfile.length, 2);
  assert.ok(Number.isFinite(result.maxSlopeDeg));
  assert.equal(typeof result.riskLevel, "string");
  const blocked = planRoute(cellToLatLon({ row: 0, col: 0 }, meta), cellToLatLon(pair[1], meta), grid, meta);
  assert.equal(typeof blocked.error, "string");
  assert.equal(blocked.cells, undefined);
  assert.equal(typeof planRoute(null, null, grid, meta).error, "string");
});

test("missing elevation and disconnected traversable cells give displayable errors", () => {
  const small = {
    ...meta, width: 7, height: 7,
    bounds: { xmin: 0, ymin: 0, xmax: 112, ymax: 112 },
  };
  const data = Array.from({ length: 7 }, () => Array(7).fill(0));
  const start = cellToLatLon({ row: 1, col: 1 }, small);
  const end = cellToLatLon({ row: 5, col: 5 }, small);
  data[1][1] = null;
  assert.match(planRoute(start, end, data, small).error, /no elevation/);
  data[1][1] = 0;
  data[3].fill(null);
  const result = planRoute(start, end, data, small);
  assert.match(result.error, /No traversable route/);
  assert.equal(result.cells, undefined);
});

test("conditions use latest sol, mbar conversion and CO2 ideal-gas density", () => {
  const result = normalizeConditions(sample);
  assert.equal(result.sol, 104);
  assert.equal(result.temperatureC, -62);
  assert.equal(result.pressureMbar, 7.37);
  assert.ok(Math.abs(result.densityKgM3 - 737 / (191.2 * 211.15)) < 1e-12);
  assert.equal(result.radiation, 0.67);
  assert.equal(result.storm, "LOW");
  assert.equal(result.isSample, true);
  assert.deepEqual(normalizeConditions({ ...sample, readings: [...sample.readings].reverse() }), result);
  assert.throws(() => normalizeConditions({ readings: [] }), /No conditions/);
  assert.throws(() => normalizeConditions({ readings: [{ temperatureC: -273.15, pressurePa: 740 }] }), /invalid/);
});

test("saved routes round-trip, reject corruption, validate bounds, and survive unavailable storage", () => {
  const store = new Map();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, value),
    },
  });
  try {
    const route = { id: "route-1", name: "Start → Dest", start: { row: 1, col: 1 }, end: { row: 3, col: 3 }, distanceKm: 0.045 };
    assert.equal(writeSavedRoutes([route]), "");
    assert.deepEqual(readSavedRoutes(meta), { routes: [route], error: "" });
    const key = [...store.keys()][0];
    store.set(key, JSON.stringify([route, { ...route, start: { row: 1000, col: 1 } }, {}]));
    assert.deepEqual(readSavedRoutes(meta).routes, [route]);
    assert.match(readSavedRoutes(meta).error, /corrupt/);
    store.set(key, "{broken");
    assert.match(readSavedRoutes(meta).error, /could not be read/);
    assert.match(writeSavedRoutes([{}]), /invalid/);
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() { throw new Error("Storage disabled"); },
    });
    assert.match(writeSavedRoutes([route]), /session only/);
    assert.deepEqual(readSavedRoutes(meta).routes, [route]);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
    else delete globalThis.localStorage;
  }
});

test("imagery uses the specified stack, geographic matrix, and bounded Jezero overlays", () => {
  assert.deepEqual(GLOBAL_LAYERS.map((layer) => layer.minZoom), [0, 7, 10, 13]);
  assert.deepEqual(GLOBAL_LAYERS.map((layer) => layer.maxNativeZoom), [6, 9, 12, 17]);
  assert.ok(GLOBAL_LAYERS.every((layer) => layer.tileSize === 256 && !layer.zoomOffset));
  assert.equal(STUDY_AREA_LAYERS.length, 2);
  for (const layer of STUDY_AREA_LAYERS) {
    const [[south, west], [north, east]] = layer.bounds;
    assert.ok(south < north && west < east);
    assert.ok(layer.url.includes("default028mm"));
  }
  assert.deepEqual(latLonToTile({ lat: 0, lon: 0 }, 0), { x: 1, y: 0 });
  assert.deepEqual(latLonToTile({ lat: 18.4, lon: 77.25 }, 11), { x: 2926, y: 814 });
  assert.deepEqual(latLonToTile({ lat: -90, lon: 180 }, 2), { x: 0, y: 3 });
  assert.deepEqual(latLonToTile({ lat: 0, lon: 354.47 }, 6), latLonToTile({ lat: 0, lon: -5.53 }, 6));
  assert.throws(() => latLonToTile({ lat: 100, lon: 0 }, 2), /valid/);
  assert.deepEqual([9.99, 10, 15, 15.01].map(classFor), ["green", "yellow", "yellow", "red"]);
});
