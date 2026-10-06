/**
 * Stateful, local gesture interpreter for a top-down camera.
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

export const DEFAULT_GESTURE_OPTIONS = Object.freeze({
  aspectRatio: 1, // Set from actual videoWidth / videoHeight.
  pinchEnter: 0.28, // Thumb-index distance divided by palm size.
  pinchExit: 0.40, // Wider release threshold prevents boundary chatter.
  clickDwellMs: 1500,
  rearmMs: 120,
  clickCooldownMs: 400,
  maxClickDrift: 0.055, // Camera metric units, before orientation.
  clickAimDwellMs: 100, // A recent quiet pointer can preserve selection intent.
  clickAimRadius: 0.012,
  clickPrepareApproach: 0.08, // Positive reduction in thumb-index/palm ratio.
  clickPrepareTimeoutMs: 1200, // Preparing never counts toward the OK dwell.
  clickPalmStability: 0.018,
  clickClosureGraceMs: 300, // Bounded finger settlement while the palm stays still.
  clickClosureMaxDrift: 0.12,
  navigationDwellMs: 180, // Two fists acquire pan; two OK hands acquire zoom.
  maxFrameGapMs: 180, // A paused inference loop never counts as dwell.
  trackingJumpRadius: 0.22,
  ambiguousMatchMargin: 0.025,
  panDeadband: 0.003, // Accumulated camera-metric movement; suppress resting jitter.
  zoomDeadband: 0.008,
  zoomDistanceDeadband: 0.003, // Also reject tiny separation jitter at close range.
  zoomMinSeparation: 0.10,
  zoomGain: 1,
  cursorAnchorMaxAgeMs: 350, // Preserve the last single-hand target across poses.
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
  const palmSize = Math.max(distance(metricPoints[0], metricPoints[9]), distance(metricPoints[5], metricPoints[17]));
  if (palmSize < 0.025 || palmSize > 0.65 * Math.max(1, settings.aspectRatio)) return null;
  const extended = [5, 9, 13, 17].map(mcp => fingerExtended(metricPoints, mcp));
  const center = mean(points[0], points[5], points[9], points[13], points[17]);
  const lateralAxis = subtract3D(metricPoints[5], metricPoints[17]);
  const lateralLength = Math.hypot(...lateralAxis);
  const pinchRatio = distance(metricPoints[4], metricPoints[8]) / palmSize;
  const pinched = pinchRatio <= (wasPinched ? settings.pinchExit : settings.pinchEnter);
  const otherExtended = extended.slice(1).filter(Boolean).length;
  const geometry = fistGeometry(hand, metricPoints, settings);
  const ok = pinched && otherExtended >= 2;
  const point = extended[0] && otherExtended === 0 && !pinched;
  const open = extended.every(Boolean) && !pinched;
  // A clipped finger cannot establish a fully closed fist. This rejects only
  // the action pose; its hand/pointer remains available at the image edges.
  const handInFrame = points.every(p => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
  return {
    center,
    pointer: copy(points[8]),
    thumb: copy(points[4]),
    knuckles: mean(points[5], points[9], points[13], points[17]),
    palmAnchors: [0, 5, 9, 13, 17].map(index => copy(points[index])),
    indexCurl: jointAngle(metricPoints[5], metricPoints[6], metricPoints[7]),
    indexLateral: lateralLength > 1e-6
      ? dot3D(subtract3D(metricPoints[8], metricPoints[5]), lateralAxis.map(value => value / lateralLength)) : 0,
    pinch: mean(points[4], points[8]),
    palmSize,
    pinchRatio,
    pinched,
    ok,
    point,
    open,
    fist: geometry.valid && geometry.fist && !ok && !point && !open && handInFrame,
    fistGeometrySource: geometry.source,
    // An explicit closed 3D pose must not coexist with positive image-space
    // pointing/open/OK evidence from a mismatched result. Keep the pointer,
    // but cancel actions rather than choosing one contradictory pose.
    actionGeometryValid: hand.worldLandmarks === undefined
      || (geometry.valid && !(geometry.fist && (ok || point || open))),
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
 * update([{ landmarks: [{x,y,z}, ...21], id?: stableCameraId }], timestampMs)
 * -> { mode, cursor, pointers:[{id,x,y}], navigationKind, progress, events, hands }
 *
 * At most two hands are accepted. One stable OK clicks automatically after
 * clickDwellMs and remains click-confirmed until released, without repeating.
 * A recent quiet aim plus positive pinch approach preserves the target during
 * click-preparing, with zero progress/events; only valid OK starts the dwell.
 * Initial OK is allowed. Drift, loss, a second hand, a model pause or identity
 * replacement cancels the hold and requires a stable release before retrying.
 * Visible pointers follow index tip 8, or the four MCP knuckles for a fist.
 * Navigation requires two matching poses: fists pan by their knuckle midpoint;
 * OK hands zoom by index-tip separation. The modes never emit each other's event.
 * Changing pose restarts acquisition; a single fist/palm never moves the map.
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
    this.previousCount = 0;
    this.cooldownUntil = 0;
    this.multiHandLock = false;
    this.clickBlocked = false;
    this.hasObservedHand = false;
    this.selectionResetRequested = false;
    this.cancelInteraction();
  }

  cancelInteraction() {
    this.rearmSince = null;
    this.pendingClick = null;
    this.confirmedClick = null;
    this.preparingClick = null;
    for (const track of this.tracks) { track.clickAim = null; track.clickIntent = null; }
    this.navigationCandidate = null;
    this.navigation = null;
  }

  /** Armed clicks require release; unarmed assistance can be discarded safely. */
  cancelClick(requireRelease = false) {
    if (!requireRelease && !this.pendingClick && !this.confirmedClick
      && (this.preparingClick || this.tracks.some(track => track.clickIntent))) {
      this.discardClickAssistance();
      return;
    }
    this.pendingClick = null;
    this.confirmedClick = null;
    this.preparingClick = null;
    for (const track of this.tracks) { track.clickAim = null; track.clickIntent = null; }
    this.clickBlocked = true;
    this.rearmSince = null;
  }

  discardClickAssistance() {
    this.preparingClick = null;
    this.selectionResetRequested = true;
    for (const track of this.tracks) {
      track.clickAim = null;
      track.clickIntent = null;
      track.lastSingleCursor = null;
      // An abandoned snapshot cannot survive through the previous visible
      // cursor/history and become the anchor of the next valid OK.
      const kind = track.shape.fist ? 'knuckles' : 'pointer';
      track.filters[kind] = new PointFilter(this.options);
      const source = track.filters[kind].update(track.shape[kind], this.lastTimestamp);
      track.filtered[kind] = source;
      track.visual = { kind, source, position: { x: clamp(source.x, 0, 1), y: clamp(source.y, 0, 1) },
        transition: null, locked: false, rawSource: copy(track.shape[kind]),
        center: copy(track.shape.center), time: this.lastTimestamp };
    }
  }

  result(mode = 'idle', cursor = null, progress = 0, events = [], hands = this.tracks.length) {
    if (this.tracks.length === 1 && cursor) {
      this.tracks[0].lastSingleCursor = { position: copy(cursor), time: this.lastTimestamp };
    }
    const pointers = this.tracks.map(track => ({ id: track.trackId,
      ...(this.tracks.length === 1 && cursor ? cursor : track.visual.position) }));
    const result = { mode, cursor, pointers, navigationKind: mode === 'navigate' ? this.navigation.kind : null,
      progress: clamp(progress, 0, 1), events, hands,
      resetSelection: this.selectionResetRequested,
      selectionBlockedReason: this.tracks.some(track => !track.shape.actionGeometryValid) ? 'invalid-geometry'
        : this.tracks.length === 2 ? 'second-hand'
          : this.clickBlocked || this.multiHandLock ? 'release-required' : null };
    this.selectionResetRequested = false;
    return result;
  }

  matchHands(hands, timestampMs) {
    const valid = hands.map(hand => ({ hand, shape: classifyHand(hand, this.options) }))
      .filter(entry => entry.shape);
    if (valid.length > 2) return [];
    const oldTracks = this.tracks;
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
        const pointerJump = sameReference
          ? metricDistance(entry.shape[reference], track.shape[reference], this.options.aspectRatio) : 0;
        // A landmark outlier can move fingertips while leaving every palm
        // landmark/ID intact. Such a jump must not inherit live navigation or
        // enter its filters, where opposing jumps could collapse separation.
        if (separation <= this.options.trackingJumpRadius && pinchJump <= this.options.trackingJumpRadius
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
    return valid.map((entry, index) => {
      let track = assignment.get(index);
      if (!track) track = {
        trackId: this.nextTrackId++,
        externalId: entry.hand.id,
        pinched: false,
        filters: Object.fromEntries(['pointer', 'pinch', 'center', 'knuckles']
          .map(key => [key, new PointFilter(this.options)])),
      };
      if (entry.hand.id !== undefined) track.externalId = entry.hand.id;
      track.shape = classifyHand(entry.hand, this.options, track.pinched);
      track.pinched = track.shape.pinched;
      track.filtered = Object.fromEntries(['pointer', 'pinch', 'center', 'knuckles']
        .map(key => [key, track.filters[key].update(track.shape[key], timestampMs)]));
      track.visual = this.handPointer(track, timestampMs, valid.length);
      return track;
    });
  }

  update(hands, timestampMs) {
    if (!Array.isArray(hands) || !Number.isFinite(timestampMs)) {
      this.cancelInteraction();
      this.tracks = [];
      this.previousCount = 0;
      this.lastTimestamp = null;
      if (this.hasObservedHand) this.clickBlocked = true;
      return this.result();
    }
    if (this.lastTimestamp !== null
      && (timestampMs <= this.lastTimestamp || timestampMs - this.lastTimestamp >= this.options.maxFrameGapMs)) {
      this.cancelInteraction();
      this.tracks = [];
      this.previousCount = 0;
      if (this.hasObservedHand) this.clickBlocked = true;
    }
    this.lastTimestamp = timestampMs;
    const oldIds = this.tracks.map(track => track.trackId).sort().join(',');
    this.tracks = this.matchHands(hands, timestampMs);
    const newIds = this.tracks.map(track => track.trackId).sort().join(',');
    const count = this.tracks.length;
    if (count === 0) {
      this.cancelInteraction();
      this.previousCount = 0;
      if (this.hasObservedHand) this.clickBlocked = true;
      return this.result();
    }
    if (oldIds !== newIds || count !== this.previousCount) {
      this.cancelInteraction();
      if (this.hasObservedHand) this.clickBlocked = true;
    }
    this.hasObservedHand = true;
    this.previousCount = count;
    if (count === 2) {
      this.multiHandLock = true;
      return this.updateTwoHands(timestampMs);
    }
    return this.updateSingleHand(timestampMs);
  }

  updateTwoHands(timestampMs) {
    this.clickBlocked = true;
    this.rearmSince = null;
    this.pendingClick = null;
    this.confirmedClick = null;
    this.preparingClick = null;
    for (const track of this.tracks) { track.clickAim = null; track.clickIntent = null; }
    const [a, b] = this.tracks;
    const kind = !a.shape.actionGeometryValid || !b.shape.actionGeometryValid ? null
      : a.shape.fist && b.shape.fist ? 'pan' : a.shape.ok && b.shape.ok ? 'zoom' : null;
    if (!kind) {
      this.navigationCandidate = null;
      this.navigation = null;
      return this.result();
    }
    if ((this.navigation || this.navigationCandidate)?.kind !== kind) {
      this.navigation = null;
      this.navigationCandidate = null;
    }
    const source = kind === 'pan' ? 'knuckles' : 'pointer';
    const rawPoints = this.tracks.map(track => track.shape[source]);
    const rawSeparation = metricDistance(...rawPoints, this.options.aspectRatio);
    if (kind === 'zoom' && (!Number.isFinite(rawSeparation) || rawSeparation < this.options.zoomMinSeparation)) {
      this.navigation = null;
      this.navigationCandidate = null;
      return this.result();
    }
    if (!this.navigationCandidate) {
      if (!this.navigation) {
        // Navigation filters are separate from visible pointer filters. Each
        // clutch/mode change starts from fresh geometry without moving halos.
        this.navigationCandidate = { since: timestampMs, kind,
          filters: new Map(this.tracks.map(track => [track.trackId, new PointFilter(this.options)])) };
      }
    }
    const state = this.navigation || this.navigationCandidate;
    // Model array order may reverse without replacing either tracked hand.
    const points = this.tracks.map(track => state.filters.get(track.trackId).update(track.shape[source], timestampMs));
    const cursor = mean(...points);
    const separation = metricDistance(...points, this.options.aspectRatio);
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
      return this.result('navigate', cursor, 1, events);
    }
    const progress = (timestampMs - this.navigationCandidate.since) / this.options.navigationDwellMs;
    if (progress >= 1) {
      this.navigation = { ...this.navigationCandidate, separation, position: cursor };
      this.navigationCandidate = null;
      return this.result('navigate', cursor, 1);
    }
    return this.result('idle', cursor, progress);
  }

  handPointer(track, timestampMs, count) {
    const kind = track.shape.fist ? 'knuckles' : 'pointer';
    let source = track.filtered[kind];
    const previous = track.visual;
    const recent = previous && timestampMs >= previous.time
      && timestampMs - previous.time <= this.options.cursorAnchorMaxAgeMs;
    const hold = this.pendingClick || this.confirmedClick || this.preparingClick;
    const locked = count === 1 && hold?.trackId === track.trackId
      && (track.shape.ok || (hold === this.preparingClick && !track.shape.fist))
      && track.shape.actionGeometryValid;
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
        if (!(count === 2 && previous.locked && kind === 'pointer')) {
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
    // transition. A stationary held OK keeps its selection anchor instead.
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

  updateSingleHand(timestampMs) {
    const track = this.tracks[0];
    const hand = track.shape;
    let cursor = copy(track.visual.position);
    if (!hand.actionGeometryValid) {
      this.cancelClick(true);
      return this.result(hand.point ? 'point' : 'idle', cursor);
    }
    const released = hand.pinchRatio >= this.options.pinchExit;
    let intent = track.clickIntent;
    let preparation = this.preparingClick;
    const assistance = preparation || intent;
    let assistedAnchor = null;
    if (assistance) {
      const expired = timestampMs - assistance.since >= this.options.clickPrepareTimeoutMs;
      const movement = this.palmDrift(hand, assistance.rawPalm);
      const reversed = hand.pinchRatio > assistance.minimumRatio
        + this.options.pinchExit - this.options.pinchEnter;
      if (hand.ok && !expired && movement <= this.options.maxClickDrift) {
        // Assistance is optional. A valid OK has priority over the stricter
        // preparation stability/reversal checks and starts a fresh full dwell.
        assistedAnchor = copy(assistance.anchor);
      } else if (expired || movement > this.options.clickPalmStability || hand.fist || reversed) {
        this.discardClickAssistance();
        cursor = copy(track.visual.position);
        intent = preparation = null;
      } else {
        assistance.minimumRatio = Math.min(assistance.minimumRatio, hand.pinchRatio);
        if (preparation) return this.result('click-preparing', preparation.anchor);
      }
    }
    const hold = this.pendingClick || this.confirmedClick;
    if (hold) {
      if (hand.ok) {
        const palmMovement = this.palmDrift(hand, hold.rawPalm);
        const pinchMovement = metricDistance(hand.pinch, hold.rawPinch, this.options.aspectRatio);
        const closureMovement = metricDistance(hand.pinch, hold.initialPinch, this.options.aspectRatio);
        // Forming the ring articulates the tips even after OK first becomes
        // valid. Allow only a short, bounded settlement with fixed palm anchors
        // and a gap that is not reopening. Whole-hand drift never accumulates
        // into this allowance; its baseline remains the initial OK frame.
        const settling = !this.confirmedClick
          && timestampMs - hold.since <= this.options.clickClosureGraceMs
          && palmMovement <= this.options.clickPalmStability
          && closureMovement <= this.options.clickClosureMaxDrift
          && hand.pinchRatio <= hold.minimumRatio + 0.04;
        if (palmMovement > this.options.maxClickDrift
          || (timestampMs - hold.since <= this.options.clickClosureGraceMs
            && closureMovement > this.options.clickClosureMaxDrift)
          || (pinchMovement > this.options.maxClickDrift && !settling)) {
          this.cancelClick();
          return this.result('idle', cursor);
        }
        if (settling) hold.rawPinch = copy(hand.pinch);
        hold.minimumRatio = Math.min(hold.minimumRatio, hand.pinchRatio);
        if (this.confirmedClick) return this.result('click-confirmed', hold.anchor, 1);
        const progress = (timestampMs - hold.since) / this.options.clickDwellMs;
        if (progress >= 1 && timestampMs >= this.cooldownUntil) {
          this.pendingClick = null;
          this.confirmedClick = hold;
          this.clickBlocked = true;
          this.cooldownUntil = timestampMs + this.options.clickCooldownMs;
          return this.result('click-confirmed', hold.anchor, 1, [{ type: 'click', ...hold.anchor }]);
        }
        return this.result('click-pending', hold.anchor, progress);
      }
      this.pendingClick = null;
      this.confirmedClick = null;
      this.clickBlocked = true;
      this.rearmSince = null;
      // A release only cancels/starts rearming. It never emits a click.
    }

    if (hand.ok) {
      this.rearmSince = null;
      if (!this.clickBlocked && !this.multiHandLock) {
        const previous = track.lastSingleCursor;
        const recent = previous && timestampMs >= previous.time
          && timestampMs - previous.time <= this.options.cursorAnchorMaxAgeMs;
        this.pendingClick = {
          since: timestampMs,
          rawPinch: copy(hand.pinch),
          initialPinch: copy(hand.pinch),
          minimumRatio: hand.pinchRatio,
          rawPalm: hand.palmAnchors.map(copy),
          anchor: copy(assistedAnchor || (recent ? previous.position : cursor)),
          trackId: track.trackId,
        };
        this.preparingClick = null;
        track.clickAim = null;
        track.clickIntent = null;
        track.visual.position = copy(this.pendingClick.anchor);
        track.visual.locked = true;
        return this.result('click-pending', this.pendingClick.anchor, 0);
      }
      return this.result('idle', cursor);
    }

    if (released) {
      if (this.rearmSince === null) this.rearmSince = timestampMs;
      if (timestampMs - this.rearmSince >= this.options.rearmMs) {
        this.clickBlocked = false;
        this.multiHandLock = false;
      }
    } else {
      this.rearmSince = null;
    }
    if (!this.clickBlocked && !this.multiHandLock && !hand.fist) {
      const aim = track.clickAim;
      const palmStable = aim && this.palmDrift(hand, aim.rawPalm) <= this.options.clickPalmStability;
      const recent = aim && (intent || timestampMs - aim.lastSteady <= this.options.cursorAnchorMaxAgeMs);
      const approached = aim && aim.pinchRatio - hand.pinchRatio >= this.options.clickPrepareApproach;
      const thumbApproach = aim && metricDistance(hand.thumb, aim.thumb, this.options.aspectRatio) >= 0.004
        && metricDistance(hand.thumb, aim.pointer, this.options.aspectRatio)
          < metricDistance(aim.thumb, aim.pointer, this.options.aspectRatio) - 0.002;
      const curlingIndex = aim && hand.indexCurl < aim.indexCurl - 5;
      const lateralApproach = aim && hand.indexLateral > aim.indexLateral + 0.002;
      if (aim && timestampMs - aim.since >= this.options.clickAimDwellMs
        && recent && palmStable && approached) {
        // A stationary thumb can still receive a curling index. Keep that
        // intent privately until OK is valid; curling alone must not freeze a
        // normal pointing finger. Positive lateral approach can show preparing
        // earlier without waiting for the other fingers to finish extending.
        if (curlingIndex && !intent) {
          track.clickIntent = { since: timestampMs, anchor: copy(aim.anchor),
            rawPalm: aim.rawPalm.map(copy), minimumRatio: hand.pinchRatio };
        }
        if (thumbApproach || (curlingIndex && lateralApproach)) {
          const candidate = track.clickIntent;
          this.preparingClick = { since: candidate ? candidate.since : timestampMs, trackId: track.trackId,
            anchor: copy(candidate ? candidate.anchor : aim.anchor), rawPalm: aim.rawPalm.map(copy),
            minimumRatio: hand.pinchRatio };
          track.visual.position = copy(this.preparingClick.anchor);
          track.visual.locked = true;
          return this.result('click-preparing', this.preparingClick.anchor);
        }
      }
      const pointerSteady = aim
        && metricDistance(hand.pointer, aim.pointer, this.options.aspectRatio) <= this.options.clickAimRadius;
      if (!aim || !palmStable || !recent) {
        track.clickAim = { since: timestampMs, lastSteady: timestampMs, anchor: copy(cursor),
          pointer: copy(hand.pointer), thumb: copy(hand.thumb), pinchRatio: hand.pinchRatio,
          indexCurl: hand.indexCurl, indexLateral: hand.indexLateral, rawPalm: hand.palmAnchors.map(copy) };
      } else if (pointerSteady) {
        aim.lastSteady = timestampMs;
        aim.anchor = copy(cursor);
      }
    } else track.clickAim = null;
    return this.result(hand.point ? 'point' : 'idle', cursor);
  }

  palmDrift(hand, baseline) {
    const distances = hand.palmAnchors.map((point, index) =>
      metricDistance(point, baseline[index], this.options.aspectRatio)).sort((a, b) => a - b);
    // A single estimated MCP can deform while the hand closes. The median and
    // whole-palm centroid remain sensitive to accumulated hand translation,
    // with the original fixed baseline rather than a frame-to-frame reset.
    return Math.max(distances[2], metricDistance(mean(...hand.palmAnchors), mean(...baseline), this.options.aspectRatio));
  }
}
