/**
 * Stateful, local gesture interpreter for hand landmarks from an RGB camera.
 *
 * Input and output coordinates use the camera's original 0..1 image space.
 * Set aspectRatio = camera width / height for distance and joint geometry. The
 * renderer then orients cursor positions and pan deltas into the full map
 * viewport. Pan deltas follow the hand; the adapter chooses drag sign.
 * Zoom delta is in log2 units: +1 means twice the scale / one map zoom level.
 *
 * The thresholds below are experimental starting values, not measured accuracy
 * claims. Validate them with the actual camera, illumination and users before
 * any public deployment. Handedness scores are intentionally not consulted:
 * they describe left/right classification, not landmark quality.
 */

import { classifyOkGeometry } from './ok-geometry.js';
import { classifyPointGeometry } from './point-geometry.js';

export const DEFAULT_GESTURE_OPTIONS = Object.freeze({
  aspectRatio: 1, // Set from actual videoWidth / videoHeight.
  pinchEnter: 0.28, // Thumb-index distance divided by palm size.
  pinchExit: 0.40, // Wider release threshold prevents boundary chatter.
  clickDwellMs: 1500,
  rearmMs: 120,
  clickCooldownMs: 400,
  maxClickDrift: 0.15, // Bounded live index excursion from the fixed start, in camera metric units.
  navigationDwellMs: 180, // One/two fists acquire pan; two OK hands acquire zoom.
  maxFrameGapMs: 180, // A paused inference loop never counts as dwell.
  trackingJumpRadius: 0.22,
  ambiguousMatchMargin: 0.025,
  panDeadband: 0.003, // Accumulated camera-metric movement; suppress resting jitter.
  zoomDeadband: 0.008,
  zoomDistanceDeadband: 0.003, // Also reject tiny separation jitter at close range.
  zoomMinSeparation: 0.10,
  zoomGain: 1,
  cursorAnchorMaxAgeMs: 350, // Recent visual references can ease across pose changes.
  cursorTransitionMs: 300, // Reference changes converge even with a stationary hand.
  fistPipMaxAngle: 150, // Positive proximal curvature; DIP need not be visible.
  fistDipMaxAngle: 155, // Distal curvature OR strong compact/retracted closure.
  fistChainMaxRatio: 0.72, // MCP-tip chord / three-bone chain, all in 3D.
  fistTipBaseRatio: 0.90,
  fistTipPalmRatio: 1.10,
  fistTipRetractRatio: 1.10, // Tip-wrist / PIP-wrist, in the same 3D space.
  fistTipPlaneRatio: 0.45, // Reject a claw whose tips remain off the palm.
  fistStrongChainRatio: 0.45,
  fistStrongRetractRatio: 0.90,
  fistStrongTipPlaneRatio: 0.75, // Tolerate thickness with strong closure evidence.
  fistThumbPalmRatio: 0.85, // Compact/adducted thumb, without a compulsory bend.
  fistBoneMinRatio: 0.015, // Low 3D bound; projected XY bones may collapse.
  minCutoff: 1.4,
  beta: 6,
  derivativeCutoff: 1,
});

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const metricDistance = (a, b, aspectRatio) => Math.hypot((a.x - b.x) * aspectRatio, a.y - b.y);
const mean = (...points) => ({
  x: points.reduce((s, p) => s + p.x, 0) / points.length,
  y: points.reduce((s, p) => s + p.y, 0) / points.length,
});
const copy = p => ({ x: p.x, y: p.y });
const distance3D = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const subtract3D = (a, b) => [a.x - b.x, a.y - b.y, a.z - b.z];
const dot3D = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const cross3D = (a, b) => [a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mean3D = points => ({ x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
  y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
  z: points.reduce((sum, p) => sum + p.z, 0) / points.length });
const finiteWorld = points => Array.isArray(points) && points.length === 21
  && points.every(p => p && ['x', 'y', 'z'].every(axis => Number.isFinite(p[axis])));

function jointAngle(a, b, c) {
  const u = [a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0)];
  const v = [c.x - b.x, c.y - b.y, (c.z ?? 0) - (b.z ?? 0)];
  const lengths = Math.hypot(...u) * Math.hypot(...v);
  if (lengths < 1e-9) return 0;
  return Math.acos(clamp(u.reduce((s, value, i) => s + value * v[i], 0) / lengths, -1, 1)) * 180 / Math.PI;
}

function fingerExtended(points, mcp) {
  const [base, pip, dip, tip] = points.slice(mcp, mcp + 4);
  const proximalLength = distance(base, pip);
  return proximalLength > 0.003
    && jointAngle(base, pip, dip) >= 155
    && jointAngle(pip, dip, tip) >= 145
    && distance(base, tip) / proximalLength >= 1.7
    && distance(points[0], tip) > distance(points[0], pip) * 1.12;
}

function fingerClosure3D(points, mcp, center, palmSize, normal, settings) {
  const [base, pip, dip, tip] = points.slice(mcp, mcp + 4);
  const lengths = [distance3D(base, pip), distance3D(pip, dip), distance3D(dip, tip)];
  const plausible = lengths.every(length => length >= palmSize * settings.fistBoneMinRatio
    && length <= palmSize * 0.85);
  const chain = lengths.reduce((sum, length) => sum + length, 0);
  const chord = distance3D(base, tip) / chain;
  const pipAngle = jointAngle(base, pip, dip);
  const dipAngle = jointAngle(pip, dip, tip);
  const retraction = distance3D(points[0], tip) / distance3D(points[0], pip);
  const planeDistance = Math.abs(dot3D(subtract3D(tip, points[0]), normal)) / palmSize;
  const stronglyClosed = chord <= settings.fistStrongChainRatio
    && retraction <= settings.fistStrongRetractRatio;
  const nearPlane = planeDistance <= (stronglyClosed
    ? settings.fistStrongTipPlaneRatio : settings.fistTipPlaneRatio);
  // Positive 3D extension vetoes a fist even if image projection is tiny.
  const extended = plausible && pipAngle >= 155 && dipAngle >= 145 && chord >= 0.90
    && distance3D(points[0], tip) > distance3D(points[0], pip) * 1.12;
  const folded = plausible && Number.isFinite(chord) && Number.isFinite(retraction)
    && pipAngle <= settings.fistPipMaxAngle && chord <= settings.fistChainMaxRatio
    && (dipAngle <= settings.fistDipMaxAngle || stronglyClosed)
    && retraction <= settings.fistTipRetractRatio
    && distance3D(base, tip) <= palmSize * settings.fistTipBaseRatio
    && distance3D(center, tip) <= palmSize * settings.fistTipPalmRatio && nearPlane;
  return { plausible, extended, folded };
}

function fistGeometry(hand, normalized, settings) {
  const supplied = hand.worldLandmarks !== undefined;
  const source = supplied ? 'world' : 'normalized-3d';
  // World origin is local to each hand and its units are already metric. It
  // must never be aspect-corrected, translated into cursor space, or used to
  // measure the distance between two hands.
  if (supplied && !finiteWorld(hand.worldLandmarks)) return { source: 'invalid-world', valid: false };
  const points = supplied ? hand.worldLandmarks : normalized;
  const palmSize = Math.max(distance3D(points[0], points[9]), distance3D(points[5], points[17]));
  const normal = cross3D(subtract3D(points[5], points[0]), subtract3D(points[17], points[0]));
  const normalLength = Math.hypot(...normal);
  if (!Number.isFinite(palmSize) || palmSize < 1e-6 || normalLength < palmSize * palmSize * 0.01) {
    return { source: `invalid-${source}`, valid: false };
  }
  const unitNormal = normal.map(value => value / normalLength);
  const center = mean3D([0, 5, 9, 13, 17].map(index => points[index]));
  const fingers = [5, 9, 13, 17].map(mcp => fingerClosure3D(points, mcp, center, palmSize, unitNormal, settings));
  const thumbLengths = [distance3D(points[1], points[2]),
    distance3D(points[2], points[3]), distance3D(points[3], points[4])];
  const thumbPlausible = thumbLengths.every(length => length >= palmSize * settings.fistBoneMinRatio
    && length <= palmSize * 0.85);
  const plausible = fingers.every(finger => finger.plausible) && thumbPlausible;
  if (supplied && !plausible) return { source: 'invalid-world', valid: false };
  const thumbCompact = thumbPlausible && distance3D(points[4], center) <= palmSize * settings.fistThumbPalmRatio;
  return { source, valid: true, folded: fingers.map(finger => finger.folded),
    fist: fingers.every(finger => finger.folded && !finger.extended) && thumbCompact };
}

/** Rotation-invariant geometry; no image-up or left/right hand assumption. */
export function classifyHand(hand, options = DEFAULT_GESTURE_OPTIONS, wasPinched = false) {
  const settings = { ...DEFAULT_GESTURE_OPTIONS, ...options };
  if (!Number.isFinite(settings.aspectRatio) || settings.aspectRatio <= 0) return null;
  const points = hand?.landmarks;
  if (!Array.isArray(points) || points.length !== 21
    || points.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y)
      || (p.z !== undefined && !Number.isFinite(p.z)))) return null;

  // MediaPipe x and z use image-width units; convert both to image-height
  // units before comparing lengths/angles. Never distort output coordinates.
  const metricPoints = points.map(p => ({ x: p.x * settings.aspectRatio, y: p.y,
    z: (p.z ?? 0) * settings.aspectRatio }));
  const palmSize = Math.max(distance3D(metricPoints[0], metricPoints[9]), distance3D(metricPoints[5], metricPoints[17]));
  if (palmSize < 0.025 || palmSize > 0.65 * Math.max(1, settings.aspectRatio)) return null;
  const extended = [5, 9, 13, 17].map(mcp => fingerExtended(metricPoints, mcp));
  const center = mean(points[0], points[5], points[9], points[13], points[17]);
  const geometry = fistGeometry(hand, metricPoints, settings);
  const imageOkGeometry = classifyOkGeometry(metricPoints, settings, wasPinched);
  const okPoints = hand.worldLandmarks === undefined ? metricPoints : hand.worldLandmarks;
  const okGeometry = hand.worldLandmarks === undefined ? imageOkGeometry : classifyOkGeometry(okPoints, settings, wasPinched);
  const { pinchRatio, pinched, ok } = okGeometry;
  const imagePointGeometry = classifyPointGeometry(metricPoints, settings);
  const pointGeometry = hand.worldLandmarks === undefined ? imagePointGeometry
    : classifyPointGeometry(hand.worldLandmarks, settings);
  const imagePoint = imagePointGeometry.point;
  const imageOpen = extended.every(Boolean) && !imageOkGeometry.pinched;
  const imageFist = hand.worldLandmarks === undefined ? geometry
    : fistGeometry({ landmarks: points }, metricPoints, settings);
  const point = pointGeometry.point;
  const open = extended.every(Boolean) && !pinched;
  // A clipped finger cannot establish a fully closed fist. This rejects only
  // the action pose; its hand/pointer remains available at the image edges.
  const handInFrame = points.every(p => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
  const actionGeometryValid = okGeometry.valid && pointGeometry.valid && (hand.worldLandmarks === undefined
    || (geometry.valid && !(geometry.fist && (imageOkGeometry.ok || imagePoint || imageOpen
      || extended[0] || imagePointGeometry.fingers[0]?.extended))
      && !((ok || point) && imageFist.fist)
      && !(point && (extended.slice(1).some(Boolean)
        || imagePointGeometry.fingers.slice(1).some(finger => finger.extended)
        || imagePointGeometry.thumb?.extended))));
  return {
    center,
    pointer: copy(points[8]),
    selectionTrackingValid: points[8].x >= 0 && points[8].x <= 1 && points[8].y >= 0 && points[8].y <= 1
      && !imageFist.fist,
    thumb: copy(points[4]),
    knuckles: mean(points[5], points[9], points[13], points[17]),
    pinch: mean(points[4], points[8]),
    palmSize,
    pinchRatio,
    pinched,
    ok,
    point,
    open,
    fist: actionGeometryValid && geometry.valid && geometry.fist && !ok && !point && !open && handInFrame,
    fistGeometrySource: geometry.source,
    okGeometrySource: okGeometry.valid ? hand.worldLandmarks === undefined ? 'normalized-3d' : 'world'
      : hand.worldLandmarks === undefined ? 'invalid-normalized-3d' : 'invalid-world',
    pointGeometrySource: pointGeometry.valid ? hand.worldLandmarks === undefined ? 'normalized-3d' : 'world'
      : hand.worldLandmarks === undefined ? 'invalid-normalized-3d' : 'invalid-world',
    // An explicit closed 3D pose must not coexist with positive image-space
    // pointing/open/OK evidence from a mismatched result. Keep the pointer,
    // but cancel navigation rather than choosing one contradictory action pose.
    actionGeometryValid,
    extended,
    folded: geometry.folded || [false, false, false, false],
  };
}

/** Absolute camera reference for a visible halo; selection may anchor it. */
export function pointerReference(shape) {
  return copy(shape.fist ? shape.knuckles : shape.pointer);
}

const alpha = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));

/** One Euro filter: low jitter at rest, less lag during intentional movement. */
export class OneEuroFilter {
  constructor({ minCutoff = 1.4, beta = 6, derivativeCutoff = 1 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.derivativeCutoff = derivativeCutoff;
    this.reset();
  }

  reset() {
    this.time = null;
    this.raw = null;
    this.value = null;
    this.derivative = 0;
  }

  update(value, timestampMs) {
    if (this.time === null || timestampMs <= this.time) {
      this.time = timestampMs;
      this.raw = this.value = value;
      this.derivative = 0;
      return value;
    }
    const dt = (timestampMs - this.time) / 1000;
    const rawDerivative = (value - this.raw) / dt;
    this.derivative += alpha(this.derivativeCutoff, dt) * (rawDerivative - this.derivative);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.derivative);
    this.value += alpha(cutoff, dt) * (value - this.value);
    this.time = timestampMs;
    this.raw = value;
    return this.value;
  }
}

class PointFilter {
  constructor(options) {
    this.x = new OneEuroFilter(options);
    this.y = new OneEuroFilter(options);
  }

  update(point, timestampMs) {
    return { x: this.x.update(point.x, timestampMs), y: this.y.update(point.y, timestampMs) };
  }
}

/**
 * update([{ landmarks: [{x,y,z}, ...21], worldLandmarks?: [...21], id?: stableCameraId }],
 *        timestampMs, { selectionTargetForHand: ({trackId, handIndex, pointer}) => string|null })
 * -> { mode, cursor, selectionHandId, selectionCursor, selectionLiveCursor,
 *      selectionTargetId,
 *      pointers:[{id,handIndex,actionGeometryValid,x,y}], navigationKind,
 *      navigationHandIds, navigationCandidateKind, progress, events, hands }
 *
 * At most two hands are accepted. A usable index tip over a target clicks after
 * clickDwellMs, regardless of the other fingers or the index's posture. Without
 * the target callback, or when it returns null, selection does not accumulate.
 * The actual image-space index starts the dwell. A positively closed fist is
 * reserved for navigation; other fingers' invalid world geometry cannot veto
 * selection. Selection belongs to one tracked hand and one target; another hand
 * entering, leaving or changing pose cannot transfer its target or deadline.
 * Participant loss, a model pause or identity replacement requires target exit
 * before retrying the interrupted destination. Confirming blocks only that
 * hand's same target until it has left for rearmMs; a different target or hand
 * starts its own full dwell, without inheriting time. A target exit, replacement
 * or bounded live-index excursion resets an unfinished dwell without requiring
 * a pose change. Safety cancellation without a known destination requires a
 * stable null target before selecting again.
 * Visible pointers follow index tip 8, or the four MCP knuckles for a fist.
 * Any closed fist pans by its knuckles; two fists use their knuckle midpoint.
 * A detected free hand does not contribute to pan. Two valid OK hands zoom;
 * otherwise target hover takes priority over pan, including a single OK hover.
 * Changing participant identities restarts navigation acquisition; free hands
 * do not. Invalid geometry cannot act or veto another valid hand's action.
 * The navigation modes never emit each other's event. Open palms do not navigate.
 */
export class GestureEngine {
  constructor(options = {}) {
    this.options = { ...DEFAULT_GESTURE_OPTIONS, ...options };
    for (const [key, value] of Object.entries(this.options)) {
      if (!Number.isFinite(value) || value < 0) throw new TypeError(`Invalid gesture option: ${key}`);
    }
    if (this.options.pinchExit <= this.options.pinchEnter) {
      throw new RangeError('pinchExit must be greater than pinchEnter');
    }
    if (this.options.minCutoff <= 0 || this.options.derivativeCutoff <= 0) {
      throw new RangeError('Filter cutoffs must be positive');
    }
    if (this.options.aspectRatio <= 0) throw new RangeError('aspectRatio must be positive');
    this.reset();
  }

  reset() {
    this.lastTimestamp = null;
    this.tracks = [];
    this.nextTrackId = 1;
    this.hasObservedHand = false;
    this.selectionResetRequested = false;
    this.observedGeometryInvalid = false;
    this.selectionHandId = null;
    this.blockNewTracks = false;
    this.recoveryTargets = new Set();
    this.cancelInteraction();
  }

  cancelInteraction() {
    this.pendingClick = null;
    this.confirmedClick = null;
    this.navigationCandidate = null;
    this.navigation = null;
    this.selectionHandId = null;
  }

  /** UI target exits can restart dwell; safety cancellation requires target exit. */
  cancelClick(requireRelease = false) {
    const interaction = this.pendingClick || this.confirmedClick;
    const track = this.tracks.find(track => track.trackId === (interaction?.trackId ?? this.selectionHandId));
    this.pendingClick = null;
    this.confirmedClick = null;
    this.selectionResetRequested = true;
    if (!requireRelease) return;
    if (track && interaction) this.blockTrack(track, interaction.targetId);
    else {
      this.blockNewTracks = true;
      for (const current of this.tracks) this.blockTrack(current, null, true);
    }
  }

  blockTrack(track, targetId = track.selectionTargetId, requireEmpty = false) {
    if (requireEmpty || typeof targetId !== 'string') {
      track.blockUntilTargetExit = true;
      track.outsideAllSince = null;
    } else track.blockedTargets.set(targetId, null);
    track.clickBlocked = track.blockUntilTargetExit || track.blockedTargets.has(track.selectionTargetId);
  }

  rearmTrack(track, timestampMs) {
    const targetId = track.selectionTargetId;
    if (track.blockUntilTargetExit) {
      if (targetId !== null) track.outsideAllSince = null;
      else {
        if (track.outsideAllSince === null) track.outsideAllSince = timestampMs;
        if (timestampMs - track.outsideAllSince >= this.options.rearmMs) track.blockUntilTargetExit = false;
      }
    }
    for (const [blockedId, outsideSince] of track.blockedTargets) {
      if (targetId === blockedId) track.blockedTargets.set(blockedId, null);
      else if (outsideSince === null) track.blockedTargets.set(blockedId, timestampMs);
      else if (timestampMs - outsideSince >= this.options.rearmMs) track.blockedTargets.delete(blockedId);
    }
    track.clickBlocked = track.blockUntilTargetExit || track.blockedTargets.has(targetId);
  }

  rememberTrackingInterruption(interaction = this.pendingClick || this.confirmedClick) {
    if (interaction?.targetId) this.recoveryTargets.add(interaction.targetId);
    else if (this.hasObservedHand) this.blockNewTracks = true;
  }

  result(mode = 'idle', cursor = null, progress = 0, events = [], hands = this.tracks.length) {
    const selectionTrack = this.tracks.find(track => track.trackId === this.selectionHandId);
    const selectionCursor = selectionTrack && cursor ? copy(cursor) : null;
    const pointers = this.tracks.map(track => ({ id: track.trackId, handIndex: track.handIndex,
      actionGeometryValid: track.shape.actionGeometryValid,
      ...(selectionTrack === track && selectionCursor ? selectionCursor : track.visual.position) }));
    const result = { mode, cursor, pointers, navigationKind: mode === 'navigate' ? this.navigation.kind : null,
      selectionHandId: selectionTrack?.trackId ?? null, selectionCursor,
      selectionTargetId: selectionTrack?.selectionTargetId ?? null,
      selectionLiveCursor: selectionTrack ? { x: clamp(selectionTrack.shape.pointer.x, 0, 1),
        y: clamp(selectionTrack.shape.pointer.y, 0, 1) } : null,
      navigationCandidateKind: this.navigationCandidate?.kind ?? null,
      navigationHandIds: mode === 'navigate' ? [...this.navigation.handIds] : [],
      progress: clamp(progress, 0, 1), events, hands,
      resetSelection: this.selectionResetRequested,
      selectionBlockedReason: selectionTrack ? selectionTrack.clickBlocked ? 'release-required' : null
        : this.tracks.every(track => !track.shape.actionGeometryValid)
            && (this.observedGeometryInvalid || this.tracks.length > 0) ? 'invalid-geometry' : null };
    this.selectionResetRequested = false;
    return result;
  }

  matchHands(hands, timestampMs, context = {}) {
    const valid = hands.map((hand, rawIndex) => ({ hand, rawIndex, shape: classifyHand(hand, this.options) }))
      .filter(entry => entry.shape);
    if (valid.length > 2) return [];
    const oldTracks = this.tracks;
    const navigationIds = new Set((this.navigation || this.navigationCandidate)?.handIds || []);
    const candidates = [];
    valid.forEach((entry, newIndex) => {
      oldTracks.forEach((track, oldIndex) => {
        const explicitIds = entry.hand.id !== undefined && track.externalId !== undefined;
        if (explicitIds && entry.hand.id !== track.externalId) return;
        const separation = metricDistance(entry.shape.center, track.shape.center, this.options.aspectRatio);
        const pinchJump = metricDistance(entry.shape.pinch, track.shape.pinch, this.options.aspectRatio);
        const matchedShape = classifyHand(entry.hand, this.options, track.pinched);
        // A legitimate curl can move tip 8 substantially with a stable palm.
        // Check tip continuity within the same pose, not across that curl.
        const sameReference = ['fist', 'ok', 'point', 'open']
          .every(key => matchedShape[key] === track.shape[key]);
        const reference = entry.shape.fist ? 'knuckles' : 'pointer';
        const navigating = navigationIds.has(track.trackId);
        const pointerJump = navigating
          ? sameReference ? metricDistance(entry.shape[reference], track.shape[reference], this.options.aspectRatio) : 0
          : metricDistance(entry.shape.pointer, track.shape.pointer, this.options.aspectRatio);
        // A landmark outlier can move fingertips while leaving every palm
        // landmark/ID intact. Such a jump must not inherit live navigation or
        // enter its filters, where opposing jumps could collapse separation.
        if (separation <= this.options.trackingJumpRadius && (!navigating || pinchJump <= this.options.trackingJumpRadius)
          && pointerJump <= this.options.trackingJumpRadius) {
          candidates.push({ newIndex, oldIndex, separation });
        }
      });
    });
    candidates.sort((a, b) => a.separation - b.separation);
    const assignment = new Map();
    const usedOld = new Set();
    for (const match of candidates) {
      if (assignment.has(match.newIndex) || usedOld.has(match.oldIndex)) continue;
      // Crossing unlabelled hands must not silently swap a live gesture.
      const entry = valid[match.newIndex];
      const ambiguous = entry.hand.id === undefined && candidates.some(other =>
        other.newIndex === match.newIndex && other.oldIndex !== match.oldIndex
        && Math.abs(other.separation - match.separation) < this.options.ambiguousMatchMargin);
      if (ambiguous) continue;
      assignment.set(match.newIndex, oldTracks[match.oldIndex]);
      usedOld.add(match.oldIndex);
    }
    const matched = valid.map((entry, index) => {
      let track = assignment.get(index);
      const isNew = !track;
      if (!track) track = {
        trackId: this.nextTrackId++,
        externalId: entry.hand.id,
        pinched: false,
        clickBlocked: this.blockNewTracks,
        blockUntilTargetExit: this.blockNewTracks,
        outsideAllSince: null,
        blockedTargets: new Map([...this.recoveryTargets].map(targetId => [targetId, null])),
        selectionTargetId: null,
        cooldownUntil: 0,
        filters: Object.fromEntries(['pointer', 'pinch', 'center', 'knuckles']
          .map(key => [key, new PointFilter(this.options)])),
      };
      if (entry.hand.id !== undefined) track.externalId = entry.hand.id;
      track.isNew = isNew;
      track.handIndex = entry.rawIndex;
      track.shape = classifyHand(entry.hand, this.options, track.pinched);
      track.pinched = track.shape.pinched;
      track.filtered = Object.fromEntries(['pointer', 'pinch', 'center', 'knuckles']
        .map(key => [key, track.filters[key].update(track.shape[key], timestampMs)]));
      return track;
    });
    const callback = typeof context?.selectionTargetForHand === 'function' ? context.selectionTargetForHand : null;
    for (const track of matched) {
      let targetId = null;
      if (callback) {
        try {
          const resolved = callback({ trackId: track.trackId, handIndex: track.handIndex,
            pointer: { x: clamp(track.shape.pointer.x, 0, 1), y: clamp(track.shape.pointer.y, 0, 1) } });
          if (track.shape.selectionTrackingValid && typeof resolved === 'string' && resolved.length > 0) targetId = resolved;
        } catch { /* A missing/invalid hit test cannot contribute selection dwell. */ }
      }
      track.selectionTargetId = targetId;
      this.rearmTrack(track, timestampMs);
    }
    const isZoomFrame = matched.filter(track => track.shape.actionGeometryValid && track.shape.ok).length === 2;
    for (const track of matched) track.visual = this.handPointer(track, timestampMs, matched.length, !isZoomFrame);
    return matched;
  }

  setSelectionTrack(track) {
    const nextId = track?.trackId ?? null;
    if (this.selectionHandId !== null && this.selectionHandId !== nextId) this.selectionResetRequested = true;
    this.selectionHandId = nextId;
  }

  update(hands, timestampMs, context = {}) {
    this.observedGeometryInvalid = false;
    if (!Array.isArray(hands) || !Number.isFinite(timestampMs)) {
      this.rememberTrackingInterruption();
      this.cancelInteraction();
      this.tracks = [];
      this.lastTimestamp = null;
      return this.result();
    }
    if (this.lastTimestamp !== null
      && (timestampMs <= this.lastTimestamp || timestampMs - this.lastTimestamp >= this.options.maxFrameGapMs)) {
      this.rememberTrackingInterruption();
      this.cancelInteraction();
      this.tracks = [];
      this.selectionResetRequested = true;
    }
    this.lastTimestamp = timestampMs;
    const previousActor = this.pendingClick || this.confirmedClick;
    const previousSelectionId = this.selectionHandId;
    const previousParticipants = (this.navigation || this.navigationCandidate)?.handIds ?? [];
    this.tracks = this.matchHands(hands, timestampMs, context);
    const ids = new Set(this.tracks.map(track => track.trackId));
    const count = this.tracks.length;
    this.observedGeometryInvalid = count !== hands.length;
    if (count === 0 || hands.length > 2) {
      this.rememberTrackingInterruption(previousActor);
      this.cancelInteraction();
      this.selectionResetRequested = previousSelectionId !== null;
      return this.result();
    }
    const lostActor = previousActor && !ids.has(previousActor.trackId);
    const lostSelection = previousSelectionId !== null && !ids.has(previousSelectionId);
    const lostParticipant = previousParticipants.some(id => !ids.has(id));
    if (lostSelection || lostParticipant) {
      // A free hand may come and go; new identities cannot inherit an absent
      // actor's clock or repeat the same destination after a tracking break.
      this.rememberTrackingInterruption(previousActor);
      for (const track of this.tracks) if (track.isNew) {
        this.blockTrack(track, previousActor?.targetId, !previousActor?.targetId);
      }
      if (lostActor) { this.pendingClick = null; this.confirmedClick = null; }
      if (lostSelection) this.setSelectionTrack(null);
    }
    for (const track of this.tracks) {
      if (previousParticipants.includes(track.trackId) && !track.shape.actionGeometryValid) {
        this.blockTrack(track, null, true);
      }
    }
    this.hasObservedHand = true;
    const eligibleNavigation = this.tracks.filter(track => track.shape.actionGeometryValid);
    const okHands = eligibleNavigation.filter(track => track.shape.ok);
    if (okHands.length === 2) {
      if (this.pendingClick || this.confirmedClick) this.cancelClick(true);
      for (const track of okHands) this.blockTrack(track, null, true);
      this.setSelectionTrack(null);
      return this.updateNavigation(timestampMs, 'zoom', okHands);
    }
    // Normalized image tracking and the hit test supply selection eligibility.
    // Other fingers' world geometry and the old index-only classifier do not.
    const candidates = this.tracks.filter(track => track.shape.selectionTrackingValid
      && track.selectionTargetId !== null && !track.shape.fist);
    if (candidates.length) {
      const interaction = this.pendingClick || this.confirmedClick;
      // A confirmed owner remains selected inside its retained region. Without
      // a live hold, a blocked destination must not occupy the turn of another
      // hand which can begin an independent, complete dwell.
      const available = candidates.filter(track => !track.clickBlocked);
      const pool = available.length ? available : candidates;
      const selected = candidates.find(track => track.trackId === interaction?.trackId)
        || pool.find(track => track.trackId === this.selectionHandId)
        || pool.reduce((first, track) => track.trackId < first.trackId ? track : first);
      if (interaction && interaction.trackId !== selected.trackId) this.cancelClick(false);
      this.navigationCandidate = null;
      this.navigation = null;
      this.setSelectionTrack(selected);
      return this.updateSingleHand(timestampMs, selected);
    }
    if (this.pendingClick || this.confirmedClick) this.cancelClick(false);
    const fists = eligibleNavigation.filter(track => track.shape.fist);
    this.setSelectionTrack(null);
    if (fists.length) return this.updateNavigation(timestampMs, 'pan', fists);
    this.navigationCandidate = null;
    this.navigation = null;
    const visual = this.tracks[0]?.visual.position ?? null;
    return this.result('idle', visual);
  }

  updateNavigation(timestampMs, kind, contributors = this.tracks) {
    if (!kind) {
      this.navigationCandidate = null;
      this.navigation = null;
      return this.result();
    }
    const handIds = contributors.map(track => track.trackId).sort((a, b) => a - b);
    const contributorKey = handIds.join(',');
    const previous = this.navigation || this.navigationCandidate;
    if (previous?.kind !== kind || previous?.contributorKey !== contributorKey) {
      this.navigation = null;
      this.navigationCandidate = null;
    }
    const source = kind === 'pan' ? 'knuckles' : 'pointer';
    const rawPoints = contributors.map(track => track.shape[source]);
    const rawSeparation = kind === 'zoom' ? metricDistance(...rawPoints, this.options.aspectRatio) : null;
    if (kind === 'zoom' && (!Number.isFinite(rawSeparation) || rawSeparation < this.options.zoomMinSeparation)) {
      this.navigation = null;
      this.navigationCandidate = null;
      return this.result();
    }
    if (!this.navigationCandidate) {
      if (!this.navigation) {
        // Navigation filters are separate from visible pointer filters. Each
        // clutch/mode change starts from fresh geometry without moving halos.
        this.navigationCandidate = { since: timestampMs, kind, handIds, contributorKey,
          filters: new Map(contributors.map(track => [track.trackId, new PointFilter(this.options)])) };
      }
    }
    const state = this.navigation || this.navigationCandidate;
    // Model array order may reverse without replacing either tracked hand.
    const points = contributors.map(track => state.filters.get(track.trackId).update(track.shape[source], timestampMs));
    const cursor = mean(...points);
    const separation = kind === 'zoom' ? metricDistance(...points, this.options.aspectRatio) : null;
    // The single shadow retains its reference transition. Its visual correction
    // never becomes camera motion: pan uses only the separate knuckle baseline.
    const feedbackCursor = this.tracks.length === 1 ? this.tracks[0].visual.position : cursor;
    if (kind === 'zoom' && (!Number.isFinite(separation) || separation < this.options.zoomMinSeparation)) {
      this.navigation = null;
      this.navigationCandidate = null;
      return this.result();
    }
    if (this.navigation) {
      const events = [];
      if (kind === 'pan') {
        const dx = cursor.x - state.position.x;
        const dy = cursor.y - state.position.y;
        if (Math.hypot(dx * this.options.aspectRatio, dy) >= this.options.panDeadband) {
          events.push({ type: 'pan', dx, dy });
          state.position = cursor;
        }
      } else {
        const delta = Math.log2(separation / state.separation) * this.options.zoomGain;
        if (Math.abs(delta) >= this.options.zoomDeadband
          && Math.abs(separation - state.separation) >= this.options.zoomDistanceDeadband) {
          events.push({ type: 'zoom', delta, ...cursor });
          state.separation = separation;
        }
        state.position = cursor;
      }
      return this.result('navigate', feedbackCursor, 1, events);
    }
    const progress = (timestampMs - this.navigationCandidate.since) / this.options.navigationDwellMs;
    if (progress >= 1) {
      this.navigation = { ...this.navigationCandidate, separation, position: cursor };
      this.navigationCandidate = null;
      return this.result('navigate', feedbackCursor, 1);
    }
    return this.result('idle', feedbackCursor, progress);
  }

  handPointer(track, timestampMs, count, allowSelection = true) {
    const kind = track.shape.fist ? 'knuckles' : 'pointer';
    let source = track.filtered[kind];
    const previous = track.visual;
    const recent = previous && timestampMs >= previous.time
      && timestampMs - previous.time <= this.options.cursorAnchorMaxAgeMs;
    const hold = this.pendingClick || this.confirmedClick;
    const locked = allowSelection && hold?.trackId === track.trackId
      && track.shape.selectionTrackingValid && !track.shape.fist && track.selectionTargetId === hold.targetId;
    let transition = null;
    let edgeMotion = false;
    if (recent) {
      const sameReference = previous.kind === kind;
      edgeMotion = metricDistance(previous.center, track.shape.center, this.options.aspectRatio) > 1e-6
        || (sameReference && metricDistance(previous.rawSource, track.shape[kind], this.options.aspectRatio) > 1e-6);
      if (!sameReference || (previous.locked && !locked)) {
        // New references start at the previous displayed position. The short
        // correction decays with time, so still fingers reach absolute tip/MCP
        // coordinates without needing a palm excursion to consume an offset.
        track.filters[kind] = new PointFilter(this.options);
        source = track.filters[kind].update(track.shape[kind], timestampMs);
        track.filtered[kind] = source;
        // Two OK pointers start from index positions rather than inheriting
        // the UI target of a cancelled one-hand selection.
        if (!(count === 2 && !allowSelection && previous.locked && kind === 'pointer')) {
          transition = { since: timestampMs,
            offset: { x: previous.position.x - source.x, y: previous.position.y - source.y } };
        }
      } else transition = previous.transition;
    }
    const progress = transition && this.options.cursorTransitionMs > 0
      ? clamp((timestampMs - transition.since) / this.options.cursorTransitionMs, 0, 1) : 1;
    const correction = transition ? 1 - progress * progress * (3 - 2 * progress) : 0;
    const raw = track.shape[kind];
    const position = locked ? copy(hold.anchor) : {
      x: clamp(source.x + (transition?.offset.x || 0) * correction, 0, 1),
      y: clamp(source.y + (transition?.offset.y || 0) * correction, 0, 1),
    };
    // Moving to a camera edge reaches it exactly, even during a short reference
    // transition. An active selection keeps its target anchor instead.
    if (!locked) for (const axis of ['x', 'y']) {
      if ((edgeMotion || correction === 0 || transition?.offset[axis] === 0)
        && (raw[axis] <= 0 || raw[axis] >= 1)) {
        position[axis] = clamp(raw[axis], 0, 1);
        if (transition) transition.offset[axis] = 0;
      }
    }
    return { kind, source, transition: progress >= 1 ? null : transition, position,
      locked, rawSource: copy(raw), center: copy(track.shape.center), time: timestampMs };
  }

  updateSingleHand(timestampMs, track = this.tracks[0]) {
    const hand = track.shape;
    const cursor = copy(track.visual.position);
    const targetId = track.selectionTargetId;
    let hold = this.pendingClick || this.confirmedClick;
    if (hold && hold.targetId !== targetId) {
      this.cancelClick(false);
      hold = null;
    }
    if (hold) {
      if (this.confirmedClick) return this.result('click-confirmed', hold.anchor, 1);
      const movement = metricDistance(hand.pointer, hold.rawPointer, this.options.aspectRatio);
      if (movement > this.options.maxClickDrift) {
        this.cancelClick(false);
        return this.result('idle', cursor);
      }
      const progress = (timestampMs - hold.since) / this.options.clickDwellMs;
      if (progress >= 1 && timestampMs >= track.cooldownUntil) {
        this.pendingClick = null;
        this.confirmedClick = hold;
        this.blockTrack(track, targetId);
        track.cooldownUntil = timestampMs + this.options.clickCooldownMs;
        return this.result('click-confirmed', hold.anchor, 1, [{ type: 'click', ...hold.anchor }]);
      }
      return this.result('click-pending', hold.anchor, progress);
    }
    if (track.clickBlocked) return this.result('idle', cursor);
    this.pendingClick = {
      since: timestampMs,
      rawPointer: copy(hand.pointer),
      anchor: { x: clamp(hand.pointer.x, 0, 1), y: clamp(hand.pointer.y, 0, 1) },
      trackId: track.trackId,
      targetId,
    };
    track.visual.position = copy(this.pendingClick.anchor);
    track.visual.locked = true;
    return this.result('click-pending', this.pendingClick.anchor, 0);
  }
}
