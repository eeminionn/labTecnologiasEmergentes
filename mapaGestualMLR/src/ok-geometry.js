/**
 * Positive OK evidence in one XYZ space: validated world landmarks, or image
 * XYZ after correcting x/z to the same units as y. No world/image distances
 * are mixed, and an XY overlap cannot substitute for thumb-index proximity.
 *
 * These ratios/angles are experimental prototype thresholds. They are not
 * accuracy measurements, nor evidence that an occluded joint is visible.
 * MediaPipe estimates depth from a monocular image; camera trials are needed.
 * https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js
 */
export const DEFAULT_OK_GEOMETRY_OPTIONS = Object.freeze({
  pinchEnter: 0.28,
  pinchExit: 0.40,
  okBoneMinRatio: 0.015,
  okBoneMaxRatio: 0.85,
  okSupportingPipMinAngle: 100,
  okSupportingDipMinAngle: 100,
  okSupportingChainMinRatio: 0.70,
  okSupportingRetractMinRatio: 1.02,
  okIndexJointMaxAngle: 160,
  okIndexChainMaxRatio: 0.92,
  okIndexTipBaseMaxRatio: 1.05,
  okThumbIndexBaseMaxRatio: 1.10,
  okThumbPalmMaxRatio: 1.35,
});

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const vector = (a, b) => [a.x - b.x, a.y - b.y, a.z - b.z];
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mean = points => Object.fromEntries(['x', 'y', 'z'].map(axis => [axis,
  points.reduce((sum, point) => sum + point[axis], 0) / points.length]));

function angle(a, b, c) {
  const u = vector(a, b), v = vector(c, b);
  const denominator = Math.hypot(...u) * Math.hypot(...v);
  if (!(denominator > 0)) return NaN;
  return Math.acos(Math.max(-1, Math.min(1, dot(u, v) / denominator))) * 180 / Math.PI;
}

function fingerEvidence(points, mcp, palmSize, settings) {
  const [base, pip, dip, tip] = points.slice(mcp, mcp + 4);
  const lengths = [distance(base, pip), distance(pip, dip), distance(dip, tip)];
  const plausible = lengths.every(length => length >= palmSize * settings.okBoneMinRatio
    && length <= palmSize * settings.okBoneMaxRatio);
  const chain = lengths.reduce((sum, length) => sum + length, 0);
  const chord = chain > 0 ? distance(base, tip) / chain : NaN;
  const pipAngle = angle(base, pip, dip), dipAngle = angle(pip, dip, tip);
  const pipWrist = distance(points[0], pip);
  const retraction = pipWrist > 0 ? distance(points[0], tip) / pipWrist : NaN;
  const supporting = plausible && pipAngle >= settings.okSupportingPipMinAngle
    && dipAngle >= settings.okSupportingDipMinAngle
    && chord >= settings.okSupportingChainMinRatio
    && retraction >= settings.okSupportingRetractMinRatio;
  return { plausible, supporting, pipAngle, dipAngle, chord, retraction };
}

const invalid = () => ({ valid: false, ok: false, pinched: false, pinchRatio: Infinity,
  palmSize: 0, otherSupporting: 0, supporting: [false, false, false],
  indexClosed: false, thumbOpposed: false, fingers: [] });

/**
 * Classify a 21-landmark pose without any image-up/handedness assumption.
 * `wasPinched` selects a wider release distance; it does not waive posture,
 * supporting-finger, finite-coordinate or plausible-bone requirements.
 * The caller still owns temporal acquisition, identity and click safeguards.
 */
export function classifyOkGeometry(pointsXYZ, options = {}, wasPinched = false) {
  const settings = { ...DEFAULT_OK_GEOMETRY_OPTIONS, ...options };
  if (!Array.isArray(pointsXYZ) || pointsXYZ.length !== 21
    || pointsXYZ.some(point => !point || !['x', 'y', 'z'].every(axis => Number.isFinite(point[axis])))
    || Object.keys(DEFAULT_OK_GEOMETRY_OPTIONS).some(key => !Number.isFinite(settings[key]) || settings[key] < 0)
    || settings.pinchExit <= settings.pinchEnter || settings.okBoneMaxRatio <= settings.okBoneMinRatio) {
    return invalid();
  }
  const points = pointsXYZ;
  const palmSize = Math.max(distance(points[0], points[9]), distance(points[5], points[17]));
  const palmNormal = cross(vector(points[5], points[0]), vector(points[17], points[0]));
  const normalLength = Math.hypot(...palmNormal);
  // Both tests are ratios: unit, scale, translation and rigid rotation do not
  // change the decision. A collapsed palm cannot provide positive geometry.
  if (!Number.isFinite(palmSize) || !(palmSize > 0) || !Number.isFinite(normalLength)
    || normalLength < palmSize * palmSize * 0.01) return invalid();
  const fingers = [5, 9, 13, 17].map(mcp => fingerEvidence(points, mcp, palmSize, settings));
  const thumbLengths = [distance(points[1], points[2]), distance(points[2], points[3]),
    distance(points[3], points[4])];
  const thumbPlausible = thumbLengths.every(length => length >= palmSize * settings.okBoneMinRatio
    && length <= palmSize * settings.okBoneMaxRatio);
  if (!thumbPlausible || fingers.some(finger => !finger.plausible)) return invalid();

  const pinchRatio = distance(points[4], points[8]) / palmSize;
  const pinched = pinchRatio <= (wasPinched ? settings.pinchExit : settings.pinchEnter);
  const supporting = fingers.slice(1).map(finger => finger.supporting);
  const otherSupporting = supporting.filter(Boolean).length;
  const index = fingers[0];
  // Curvature is one positive closure cue. A relatively straight index is
  // also allowed when a plausible thumb reaches it in compact opposition.
  const indexClosed = Math.min(index.pipAngle, index.dipAngle) <= settings.okIndexJointMaxAngle
    && index.chord <= settings.okIndexChainMaxRatio
    && distance(points[5], points[8]) <= palmSize * settings.okIndexTipBaseMaxRatio;
  const palmCenter = mean([0, 5, 9, 13, 17].map(index => points[index]));
  // Compact opposition is a geometric proxy, not an IP-bend requirement: a
  // fairly straight thumb can still close an OK ring against the index.
  const thumbOpposed = distance(points[4], points[5]) <= palmSize * settings.okThumbIndexBaseMaxRatio
    && distance(points[4], palmCenter) <= palmSize * settings.okThumbPalmMaxRatio;
  return { valid: true, ok: pinched && (indexClosed || thumbOpposed) && otherSupporting >= 2,
    pinched, pinchRatio, palmSize, otherSupporting, supporting, indexClosed, thumbOpposed, fingers };
}
