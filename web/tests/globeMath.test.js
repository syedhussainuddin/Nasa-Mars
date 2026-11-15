import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  DEFAULT_CENTER, DEFAULT_DISTANCE, MIN_DISTANCE, MAX_DISTANCE, MAP_TRANSITION_DISTANCE,
  locationToVector, vectorToLocation, isSiteVisible, fieldOfView,
} from "../src/globe/globeMath.js";
import { studySiteFromMetadata } from "../src/globe/studySite.js";
import { gridBoundsLatLon, latLonToCell } from "../src/routing/coordinates.js";

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} should equal ${b}`);
const meta = JSON.parse(await readFile(new URL("../public/data/jezero_grid_meta.json", import.meta.url), "utf8"));
const site = studySiteFromMetadata(meta);

test("globe vectors align with SphereGeometry UVs and east-positive longitude", () => {
  assert.deepEqual(locationToVector({ lat: 0, lon: 0 }), { x: 1, y: 0, z: -0 });
  close(locationToVector({ lat: 0, lon: 90 }).z, -1);
  close(locationToVector({ lat: 90, lon: 0 }).y, 1);
  for (const point of [site, { lat: -20, lon: 354.47 }]) {
    const vector = locationToVector(point);
    close(Math.hypot(vector.x, vector.y, vector.z), 1);
    const restored = vectorToLocation(vector);
    close(restored.lat, point.lat);
    close(restored.lon, point.lon > 180 ? point.lon - 360 : point.lon);
  }
  assert.throws(() => vectorToLocation({ x: 0, y: 0, z: 0 }), /nonzero/);
});

test("Jezero uses the actual study-area centre and is visible initially; back faces stay hidden", () => {
  const [[south, west], [north, east]] = gridBoundsLatLon(meta);
  assert.equal(site.id, "jezero-study-area");
  assert.equal(site.name, "Jezero Study Area");
  close(site.lat, (south + north) / 2);
  close(site.lon, (west + east) / 2);
  assert.ok(latLonToCell(site, meta));
  const camera = locationToVector(DEFAULT_CENTER, DEFAULT_DISTANCE);
  assert.ok(isSiteVisible(locationToVector(site), camera));
  assert.equal(isSiteVisible({ x: -1, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }), false);
  // Positive facing normal alone is insufficient at a perspective horizon.
  assert.equal(isSiteVisible(locationToVector({ lat: 0, lon: 80 }), { x: 3, y: 0, z: 0 }), false);
  assert.equal(isSiteVisible({ x: 1, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }), true);
});

test("invalid study metadata does not fabricate a Jezero marker", () => {
  assert.throws(() => studySiteFromMetadata({ ...meta, bounds: { ...meta.bounds, xmax: meta.bounds.xmin } }), /bounds are invalid/);
  assert.throws(() => studySiteFromMetadata({ ...meta, crs: "unsupported" }), /Unsupported/);
});

test("default camera gives a 690px globe with sensible zoom/handoff limits", () => {
  const fov = fieldOfView(1024, 690);
  const focalLength = 1024 / (2 * Math.tan(fov * Math.PI / 360));
  close(2 * focalLength / Math.sqrt(DEFAULT_DISTANCE ** 2 - 1), 690);
  assert.ok(MIN_DISTANCE > 1 && MIN_DISTANCE < MAP_TRANSITION_DISTANCE);
  assert.ok(MAP_TRANSITION_DISTANCE < DEFAULT_DISTANCE && DEFAULT_DISTANCE < MAX_DISTANCE);
  assert.equal(MAP_TRANSITION_DISTANCE, 1.55);
});
