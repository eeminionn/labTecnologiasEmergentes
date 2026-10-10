/**
 * Positive index-only posture in one XYZ space. The caller chooses validated
 * world landmarks, or image XYZ with x/z aspect-corrected only when world is
 * absent. An explicitly invalid world result must not fall back to image.
 *
 * These experimental ratios/angles test estimated geometry, not camera
 * accuracy or joint visibility. Monocular depth and hidden fingertips remain
 * estimates; no gesture is inferred from the absence of extension evidence.
 * https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js
 */
export const DEFAULT_POINT_GEOMETRY_OPTIONS = Object.freeze({
  pointBoneMinRatio: 0.015,
  pointBoneMaxRatio: 0.85,
  pointIndexPipMinAngle: 155,
  pointIndexDipMinAngle: 145,
  pointIndexChainMinRatio: 0.90,
  pointIndexRetractMinRatio: 1.12,
  pointFoldPipMaxAngle: 150,
  pointFoldDipMaxAngle: 155,
  pointFoldChainMaxRatio: 0.72,
  pointFoldRetractMaxRatio: 1.00,
  pointFoldTipBaseMaxRatio: 0.90,
  pointFoldTipPalmMaxRatio: 1.10,
  pointFoldTipPlaneMaxRatio: 0.45,
  pointStrongChainMaxRatio: 0.45,
  pointStrongRetractMaxRatio: 0.90,
  pointStrongTipPlaneMaxRatio: 0.75,
  pointThumbPalmMaxRatio: 0.85,
  pointThumbPlaneMaxRatio: 0.45,
  pointThumbLongitudinalMinRatio: 0.10,
  pointThumbLongitudinalMaxRatio: 1.10,
  pointThumbRadialMarginRatio: 0.15,
  pointThumbJointMaxAngle: 160,
  pointThumbAdductionMinRatio: 0.05,
});

const axes = ['x', 'y', 'z'];
const vector = (a, b) => axes.map(axis => a[axis] - b[axis]);
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const distance = (a, b) => Math.hypot(...vector(a, b));
const mean = points => Object.fromEntries(axes.map(axis => [axis,
  points.reduce((sum, point) => sum + point[axis], 0) / points.length]));

function angle(a, b, c) {
  const u = vector(a, b), v = vector(c, b);
  const denominator = Math.hypot(...u) * Math.hypot(...v);
  if (!(denominator > 0)) return NaN;
  return Math.acos(Math.max(-1, Math.min(1, dot(u, v) / denominator))) * 180 / Math.PI;
}

function fingerEvidence(points, mcp, palmSize, center, normal, settings) {
  const [base, pip, dip, tip] = points.slice(mcp, mcp + 4);
  const lengths = [distance(base, pip), distance(pip, dip), distance(dip, tip)];
  const plausible = lengths.every(length => length >= palmSize * settings.pointBoneMinRatio
    && length <= palmSize * settings.pointBoneMaxRatio);
  const chain = lengths.reduce((sum, length) => sum + length, 0);
  const chord = chain > 0 ? distance(base, tip) / chain : NaN;
  const pipAngle = angle(base, pip, dip), dipAngle = angle(pip, dip, tip);
  const pipWrist = distance(points[0], pip);
  const retraction = pipWrist > 0 ? distance(points[0], tip) / pipWrist : NaN;
  const planeRatio = Math.abs(dot(vector(tip, points[0]), normal)) / palmSize;
  const stronglyClosed = chord <= settings.pointStrongChainMaxRatio
    && retraction <= settings.pointStrongRetractMaxRatio;
  const extended = plausible && pipAngle >= settings.pointIndexPipMinAngle
    && dipAngle >= settings.pointIndexDipMinAngle
    && chord >= settings.pointIndexChainMinRatio
    && retraction >= settings.pointIndexRetractMinRatio;
  // A curled DIP may be hidden in a real closed hand. Strong contraction of
  // the whole chain can supply closure, but a straight distal claw cannot.
  const folded = plausible && pipAngle <= settings.pointFoldPipMaxAngle
    && chord <= settings.pointFoldChainMaxRatio
    && (dipAngle <= settings.pointFoldDipMaxAngle || stronglyClosed)
    && retraction <= settings.pointFoldRetractMaxRatio
    && distance(base, tip) <= palmSize * settings.pointFoldTipBaseMaxRatio
    && distance(center, tip) <= palmSize * settings.pointFoldTipPalmMaxRatio
    && planeRatio <= (stronglyClosed ? settings.pointStrongTipPlaneMaxRatio
      : settings.pointFoldTipPlaneMaxRatio);
  return { plausible, extended, folded, pipAngle, dipAngle, chord, retraction, planeRatio };
}

const invalid = () => ({ valid: false, point: false, palmSize: 0,
  indexExtended: false, otherRetracted: [false, false, false],
  thumbRetracted: false, fingers: [], thumb: null });

/**
 * `pointsXYZ` contains exactly 21 finite XYZ landmarks in coherent units.
 * Decisions do not depend on image-up, handedness, scale or rigid rotation.
 * Temporal dwell, actor identity, release and target feedback are owned by
 * the gesture engine; this function never starts or preserves a click.
 */
export function classifyPointGeometry(pointsXYZ, options = {}) {
  const settings = { ...DEFAULT_POINT_GEOMETRY_OPTIONS, ...options };
  if (!Array.isArray(pointsXYZ) || pointsXYZ.length !== 21
    || pointsXYZ.some(point => !point || !axes.every(axis => Number.isFinite(point[axis])))
    || Object.keys(DEFAULT_POINT_GEOMETRY_OPTIONS).some(key => !Number.isFinite(settings[key]) || settings[key] < 0)
    || Object.keys(DEFAULT_POINT_GEOMETRY_OPTIONS).some(key => key.endsWith('Angle') && settings[key] > 180)
    || settings.pointBoneMinRatio <= 0 || settings.pointBoneMaxRatio <= settings.pointBoneMinRatio
    || settings.pointIndexChainMinRatio > 1 || settings.pointFoldChainMaxRatio > 1
    || settings.pointStrongChainMaxRatio > settings.pointFoldChainMaxRatio
    || settings.pointThumbLongitudinalMaxRatio <= settings.pointThumbLongitudinalMinRatio) return invalid();

  const points = pointsXYZ;
  const palmSize = Math.max(distance(points[0], points[9]), distance(points[5], points[17]));
  const normal = cross(vector(points[5], points[0]), vector(points[17], points[0]));
  const normalLength = Math.hypot(...normal);
  if (!Number.isFinite(palmSize) || !(palmSize > 0) || !Number.isFinite(normalLength)
    || normalLength < palmSize * palmSize * 0.01) return invalid();
  const unitNormal = normal.map(value => value / normalLength);
  const knuckles = mean([5, 9, 13, 17].map(index => points[index]));
  const center = mean([0, 5, 9, 13, 17].map(index => points[index]));
  const longitudinal = vector(knuckles, points[0]);
  const longitudinalLength = Math.hypot(...longitudinal);
  if (!Number.isFinite(longitudinalLength) || longitudinalLength < palmSize * 0.01) return invalid();
  const unitLongitudinal = longitudinal.map(value => value / longitudinalLength);
  const lateral = vector(points[5], points[17]);
  const lateralAlong = dot(lateral, unitLongitudinal);
  const radial = lateral.map((value, index) => value - unitLongitudinal[index] * lateralAlong);
  const radialLength = Math.hypot(...radial);
  if (!Number.isFinite(radialLength) || radialLength < palmSize * 0.01) return invalid();
  const unitRadial = radial.map(value => value / radialLength);
  const fingers = [5, 9, 13, 17].map(mcp => fingerEvidence(points, mcp, palmSize, center, unitNormal, settings));
  const thumbLengths = [distance(points[1], points[2]), distance(points[2], points[3]),
    distance(points[3], points[4])];
  const thumbPlausible = thumbLengths.every(length => length >= palmSize * settings.pointBoneMinRatio
    && length <= palmSize * settings.pointBoneMaxRatio);
  // Keep independently plausible positive extension evidence even when
  // another finger is malformed. The complete posture still fails closed;
  // a partial image must not hide an obvious extra finger from a world veto.
  const anatomyValid = thumbPlausible && fingers.every(finger => finger.plausible);

  const thumbTip = vector(points[4], points[0]);
  const longitudinalRatio = dot(thumbTip, unitLongitudinal) / longitudinalLength;
  const radialTip = dot(thumbTip, unitRadial);
  const radialBounds = [5, 9, 13, 17].map(index => dot(vector(points[index], points[0]), unitRadial));
  const margin = palmSize * settings.pointThumbRadialMarginRatio;
  const planeRatio = Math.abs(dot(thumbTip, unitNormal)) / palmSize;
  const compact = distance(points[4], center) <= palmSize * settings.pointThumbPalmMaxRatio;
  const withinPalm = longitudinalRatio >= settings.pointThumbLongitudinalMinRatio
    && longitudinalRatio <= settings.pointThumbLongitudinalMaxRatio
    && radialTip >= Math.min(...radialBounds) - margin
    && radialTip <= Math.max(...radialBounds) + margin
    && planeRatio <= settings.pointThumbPlaneMaxRatio;
  const mcpAngle = angle(points[1], points[2], points[3]);
  const ipAngle = angle(points[2], points[3], points[4]);
  const radialCenter = dot(vector(center, points[0]), unitRadial);
  const radialBase = dot(vector(points[2], points[0]), unitRadial);
  const adductionRatio = (Math.abs(radialBase - radialCenter) - Math.abs(radialTip - radialCenter)) / palmSize;
  const adducted = adductionRatio >= settings.pointThumbAdductionMinRatio;
  // A naturally straight IP is allowed when the thumb crosses inward over
  // the palm. Compactness alone does not excuse a straight outward thumb.
  const flexed = Math.min(mcpAngle, ipAngle) <= settings.pointThumbJointMaxAngle;
  const straightOutside = mcpAngle >= 155 && ipAngle >= 155 && !adducted;
  const thumbChain = thumbLengths.reduce((sum, length) => sum + length, 0);
  const thumbChord = distance(points[1], points[4]) / thumbChain;
  const outward = longitudinalRatio > settings.pointThumbLongitudinalMaxRatio
    || radialTip < Math.min(...radialBounds) - margin
    || radialTip > Math.max(...radialBounds) + margin
    || planeRatio > settings.pointThumbPlaneMaxRatio;
  // A positive outward, almost straight chain is available to the caller as
  // a contradiction veto. `!thumbRetracted` alone is never such evidence.
  const thumbExtended = thumbPlausible && straightOutside && thumbChord >= 0.90 && outward;
  const thumbRetracted = thumbPlausible && compact && withinPalm && (flexed || adducted) && !straightOutside;
  const otherRetracted = fingers.slice(1).map(finger => finger.folded && !finger.extended);
  const indexExtended = fingers[0].extended;
  return { valid: anatomyValid,
    point: anatomyValid && indexExtended && otherRetracted.every(Boolean) && thumbRetracted,
    palmSize, indexExtended, otherRetracted, thumbRetracted, fingers,
    thumb: { plausible: thumbPlausible, compact, withinPalm, flexed, adducted,
      extended: thumbExtended, outward, chord: thumbChord,
      mcpAngle, ipAngle, longitudinalRatio, adductionRatio, planeRatio } };
}
