import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CENTER, DEFAULT_DISTANCE, MIN_DISTANCE, MAX_DISTANCE, MAP_TRANSITION_DISTANCE,
  MARS_SITES, locationToVector, vectorToLocation, isSiteVisible, fieldOfView,
} from "../src/globe/globeMath.js";

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} should equal ${b}`);

test("globe vectors align with SphereGeometry UVs and east-positive longitude", () => {
  assert.deepEqual(locationToVector({ lat: 0, lon: 0 }), { x: 1, y: 0, z: -0 });
  close(locationToVector({ lat: 0, lon: 90 }).z, -1);
  close(locationToVector({ lat: 90, lon: 0 }).y, 1);
  for (const point of MARS_SITES) {
    const vector = locationToVector(point);
    close(Math.hypot(vector.x, vector.y, vector.z), 1);
    const restored = vectorToLocation(vector);
    close(restored.lat, point.lat);
    close(restored.lon, point.lon > 180 ? point.lon - 360 : point.lon);
  }
  assert.throws(() => vectorToLocation({ x: 0, y: 0, z: 0 }), /nonzero/);
});

test("all four specified sites are visible initially; back and perspective limb are hidden", () => {
  assert.deepEqual(MARS_SITES.map(({ name, lat, lon }) => [name, lat, lon]), [
    ["Opportunity", -1.95, 354.47], ["Mawrth Vallis", 24, 343],
    ["Viking 1", 22.27, 312.05], ["Pathfinder", 19.13, 332.18],
  ]);
  const camera = locationToVector(DEFAULT_CENTER, DEFAULT_DISTANCE);
  assert.ok(MARS_SITES.every((site) => isSiteVisible(locationToVector(site), camera)));
  assert.equal(isSiteVisible({ x: -1, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }), false);
  // Positive facing normal alone is insufficient at a perspective horizon.
  assert.equal(isSiteVisible(locationToVector({ lat: 0, lon: 80 }), { x: 3, y: 0, z: 0 }), false);
  assert.equal(isSiteVisible({ x: 1, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }), true);
});

test("default camera gives a 690px globe with sensible zoom/handoff limits", () => {
  const fov = fieldOfView(1024, 690);
  const focalLength = 1024 / (2 * Math.tan(fov * Math.PI / 360));
  close(2 * focalLength / Math.sqrt(DEFAULT_DISTANCE ** 2 - 1), 690);
  assert.ok(MIN_DISTANCE > 1 && MIN_DISTANCE < MAP_TRANSITION_DISTANCE);
  assert.ok(MAP_TRANSITION_DISTANCE < DEFAULT_DISTANCE && DEFAULT_DISTANCE < MAX_DISTANCE);
  assert.equal(MAP_TRANSITION_DISTANCE, 1.55);
});
