import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { latLonToCell, cellToLatLon, gridBoundsLatLon } from '../src/routing/coordinates.js';
import { computeSlopeGrid } from '../src/routing/slope.js';
import { demoTraverse, routeWithEngine } from '../src/routing/adapter.js';
import { normalizeConditions } from '../src/data/conditions.js';

const meta = JSON.parse(readFileSync(new URL('../public/data/jezero_grid_meta.json', import.meta.url)));
const grid = JSON.parse(readFileSync(new URL('../public/data/jezero_grid.json', import.meta.url)));

test('real grid matches metadata, coordinate centres round-trip including corners', () => {
  assert.equal(grid.length, meta.height);
  assert.ok(grid.every(row => row.length === meta.width));
  for (const cell of [{ row: 0, col: 0 }, { row: 499, col: 499 }, { row: 42, col: 234 }]) {
    assert.deepEqual(latLonToCell(cellToLatLon(cell, meta), meta), cell);
  }
  assert.equal(latLonToCell({ lat: 0, lon: 0 }, meta), null);
  assert.equal(latLonToCell({ lat: NaN, lon: 77 }, meta), null);
  assert.throws(() => cellToLatLon({ row: 500, col: 0 }, meta));
});

test('bounds follow north-up raster orientation and 8km projected extent', () => {
  const [[south, west], [north, east]] = gridBoundsLatLon(meta);
  const nw = cellToLatLon({ row: 0, col: 0 }, meta);
  const se = cellToLatLon({ row: 499, col: 499 }, meta);
  assert.ok(nw.lat > se.lat && nw.lon < se.lon);
  assert.ok(south < se.lat && north > nw.lat && west < nw.lon && east > se.lon);
  assert.ok(Math.abs((north - south) * Math.PI / 180 * 3396190 - 8000) < 0.001);
});

test('slope handles flat, grade, zero elevation, null and missing neighbours', () => {
  const small = { width: 3, height: 3, cell_size: { x: 1, y: 1 } };
  assert.deepEqual(computeSlopeGrid([[0, 0, 0], [0, 0, 0], [0, 0, 0]], small), [[0, 0, 0], [0, 0, 0], [0, 0, 0]]);
  const slope = computeSlopeGrid([[0, 1, 2], [0, 1, 2], [0, 1, 2]], small);
  assert.ok(slope.every(row => row.every(value => Math.abs(value - 45) < 1e-9)));
  assert.equal(computeSlopeGrid([[null]], { width: 1, height: 1, cell_size: { x: 1, y: 1 } })[0][0], null);
});

test('sample traverse uses adjacent real cells and matching summary/profile distances', () => {
  const slopes = computeSlopeGrid(grid, meta);
  const result = demoTraverse(grid, meta, { row: 140, col: 180 }, { row: 200, col: 260 }, slopes);
  assert.equal(result.cells.length, 141);
  assert.ok(Math.abs(result.distanceKm - 2.24) < 1e-9);
  assert.equal(result.elevationProfile.at(-1).distanceKm, result.distanceKm);
  assert.equal(result.elevationProfile[0].elevationM, grid[140][180]);
  for (let i = 1; i < result.cells.length; i++) {
    const a = result.cells[i - 1], b = result.cells[i];
    assert.equal(Math.abs(a.row - b.row) + Math.abs(a.col - b.col), 1);
  }
  assert.ok(Number.isFinite(result.maxSlopeDeg));
});

test('adapter accepts an asynchronous contributor contract without marking it demo', async () => {
  const start = { row: 140, col: 180 }, end = { row: 142, col: 183 };
  const fixture = demoTraverse(grid, meta, start, end);
  const result = await routeWithEngine(async (g, m, a, b) => {
    assert.equal(g, grid); assert.equal(m, meta);
    assert.deepEqual(a, start); assert.deepEqual(b, end);
    return fixture;
  }, grid, meta, start, end);
  assert.equal(result.demo, false);
  // This is a contract fixture, NOT an end-to-end real-routing test.
});

test('adapter handles thrown, rejected, returned, blocked and no-route errors', async () => {
  const start = { row: 140, col: 180 }, end = { row: 142, col: 183 };
  const engines = [
    [() => { throw new Error('Blocked cell'); }, /Blocked cell/],
    [async () => { throw { message: 'No route found' }; }, /No route found/],
    [() => ({ error: { message: 'Blocked destination' } }), /Blocked destination/],
    [() => ({ error: 'No route found' }), /No route found/],
    [() => ({ success: false, message: 'Engine unavailable' }), /Engine unavailable/],
    [() => ({ cells: [] }), /No route found/],
  ];
  for (const [engine, message] of engines) {
    await assert.rejects(() => routeWithEngine(engine, grid, meta, start, end), message);
  }
});

test('adapter rejects mismatched endpoints, invalid metrics and inconsistent profile distance', async () => {
  const start = { row: 140, col: 180 }, end = { row: 142, col: 183 };
  const fixture = demoTraverse(grid, meta, start, end);
  await assert.rejects(() => routeWithEngine(() => ({ ...fixture, cells: [end, start] }), grid, meta, start, end), /endpoints/);
  await assert.rejects(() => routeWithEngine(() => ({ ...fixture, distanceKm: NaN }), grid, meta, start, end), /invalid summary/);
  await assert.rejects(() => routeWithEngine(() => ({ ...fixture, distanceKm: 200 }), grid, meta, start, end), /do not agree/);
  await assert.rejects(() => routeWithEngine(null, grid, meta, start, start), /different/);
});

test('conditions preserve zero values and conservatively label unknown provenance as sample', () => {
  const normalized = normalizeConditions({ temperature_c: 0, pressure_pa: 0, sol: 0 });
  assert.equal(normalized.temperature, 0); assert.equal(normalized.pressure, 0); assert.equal(normalized.sol, 0);
  assert.equal(normalized.sample, true);
  assert.equal(normalizeConditions({ temperature_c: null }).temperature, null);
});
