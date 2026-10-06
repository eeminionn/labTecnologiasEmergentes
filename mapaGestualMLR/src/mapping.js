import { orientation } from './calibration.js';

// The entire captured image always covers the entire map viewport. A previous
// table homography cannot crop, expand or offset this absolute mapping.
export function cameraToMap(point, { rotation = 0, mirror = false } = {}) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  const transformed = orientation(point, rotation, mirror);
  return { x: Math.min(1, Math.max(0, transformed.x)), y: Math.min(1, Math.max(0, transformed.y)) };
}
