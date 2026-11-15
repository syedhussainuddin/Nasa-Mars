export const GLOBE_RADIUS = 1;
export const DEFAULT_DISTANCE = 3;
export const MIN_DISTANCE = 1.3;
export const MAX_DISTANCE = 6;
export const MAP_TRANSITION_DISTANCE = 1.55;
// Face Jezero initially so the only marker is immediately discoverable.
// Its precise position is derived separately from the current grid metadata.
export const DEFAULT_CENTER = { lat: 18.36, lon: 77.22 };

const RAD = Math.PI / 180;

/** SphereGeometry's UV seam is at ±180°; east-positive longitude uses -Z. */
export function locationToVector({ lat, lon }, radius = GLOBE_RADIUS) {
  const latitude = lat * RAD, longitude = lon * RAD;
  return {
    x: radius * Math.cos(latitude) * Math.cos(longitude),
    y: radius * Math.sin(latitude),
    z: -radius * Math.cos(latitude) * Math.sin(longitude),
  };
}

export function vectorToLocation({ x, y, z }) {
  const radius = Math.hypot(x, y, z);
  if (!(radius > 0)) throw new TypeError("A nonzero globe direction is required.");
  return {
    lat: Math.asin(Math.max(-1, Math.min(1, y / radius))) / RAD,
    lon: Math.atan2(-z, x) / RAD,
  };
}

/** Perspective horizon: the camera must lie above the site's tangent plane. */
export function isSiteVisible(point, camera) {
  return point.x * camera.x + point.y * camera.y + point.z * camera.z >
    point.x ** 2 + point.y ** 2 + point.z ** 2;
}

/** Apparent sphere diameter, including perspective rather than a flat disc approximation. */
export function fieldOfView(height, diameter, distance = DEFAULT_DISTANCE) {
  return 2 * Math.atan(height / (diameter * Math.sqrt(distance ** 2 - GLOBE_RADIUS ** 2))) / RAD;
}
