/**
 * Stateful, local gesture interpreter for a top-down camera.
 *
 * Input and output coordinates use the camera's original 0..1 image space.
 * Set aspectRatio = camera width / height for distance and joint geometry. The
 * renderer then projects cursor positions and pan deltas into the calibrated
 * interaction area. Pan deltas follow the hand; the adapter chooses drag sign.
 * Zoom delta is in log2 units: +1 means twice the scale / one map zoom level.
 *
 * The thresholds below are experimental starting values, not measured accuracy
 * claims. Validate them with the actual camera, illumination and users before
 * any public deployment. Handedness scores are intentionally not consulted:
 * they describe left/right classification, not landmark quality.
 */

export const DEFAULT_GESTURE_OPTIONS = Object.freeze({
  aspectRatio: 1, // Set from actual videoWidth / videoHeight, before calibration.
  pinchEnter: 0.28, // Thumb-index distance divided by palm size.
  pinchExit: 0.40, // Wider release threshold prevents boundary chatter.
  clickDwellMs: 220,
  rearmMs: 120,
  clickCooldownMs: 400,
  maxClickDrift: 0.055, // Camera metric units, before homography.
  navigationDwellMs: 180, // Both hands in OK acquire pan and zoom together.
  maxFrameGapMs: 180, // A paused inference loop never counts as dwell.
  trackingJumpRadius: 0.22,
  ambiguousMatchMargin: 0.025,
  panDeadband: 0.003, // Accumulated camera-metric movement; suppress resting jitter.
  zoomDeadband: 0.008,
  zoomDistanceDeadband: 0.003, // Also reject tiny separation jitter at close range.
  zoomMinSeparation: 0.10,
  zoomGain: 1,
  pointAnchorMaxAgeMs: 350,
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
  const pinchRatio = distance(metricPoints[4], metricPoints[8]) / palmSize;
  const pinched = pinchRatio <= (wasPinched ? settings.pinchExit : settings.pinchEnter);
  const otherExtended = extended.slice(1).filter(Boolean).length;
  return {
    center: mean(points[0], points[5], points[9], points[13], points[17]),
    pointer: copy(points[8]),
    pinch: mean(points[4], points[8]),
    palmSize,
    pinchRatio,
    pinched,
    ok: pinched && otherExtended >= 2,
    point: extended[0] && otherExtended === 0 && !pinched,
    open: extended.every(Boolean) && !pinched,
    extended,
  };
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
 * -> { mode, cursor, progress, events, hands }
 *
 * At most two hands are accepted. A click needs: release/point to arm -> a stable
 * OK held for clickDwellMs -> an actual pinch release. Losing a hand, adding a
 * second hand, a model pause, or changing identity cancels pending actions.
 * Navigation requires two OK hands: midpoint motion pans, separation zooms.
 * A single hand only points/clicks; an open palm never moves the map.
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
    this.cancelInteraction();
  }

  cancelInteraction() {
    this.armed = false;
    this.rearmSince = null;
    this.pendingClick = null;
    this.navigationCandidate = null;
    this.navigation = null;
    this.lastPoint = null;
  }

  result(mode = 'idle', cursor = null, progress = 0, events = [], hands = this.tracks.length) {
    return { mode, cursor, progress: clamp(progress, 0, 1), events, hands };
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
        // A landmark outlier can move fingertips while leaving every palm
        // landmark/ID intact. Such a jump must not inherit live navigation or
        // enter its filters, where opposing jumps could collapse separation.
        if (separation <= this.options.trackingJumpRadius && pinchJump <= this.options.trackingJumpRadius) {
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
        filters: Object.fromEntries(['pointer', 'pinch', 'center'].map(key => [key, new PointFilter(this.options)])),
      };
      if (entry.hand.id !== undefined) track.externalId = entry.hand.id;
      track.shape = classifyHand(entry.hand, this.options, track.pinched);
      track.pinched = track.shape.pinched;
      track.filtered = Object.fromEntries(['pointer', 'pinch', 'center']
        .map(key => [key, track.filters[key].update(track.shape[key], timestampMs)]));
      return track;
    });
  }

  update(hands, timestampMs) {
    if (!Array.isArray(hands) || !Number.isFinite(timestampMs)) {
      this.reset();
      return this.result();
    }
    if (this.lastTimestamp !== null
      && (timestampMs <= this.lastTimestamp || timestampMs - this.lastTimestamp >= this.options.maxFrameGapMs)) {
      this.cancelInteraction();
      this.tracks = [];
      this.previousCount = 0;
      this.multiHandLock = false;
    }
    this.lastTimestamp = timestampMs;
    const oldIds = this.tracks.map(track => track.trackId).sort().join(',');
    this.tracks = this.matchHands(hands, timestampMs);
    const newIds = this.tracks.map(track => track.trackId).sort().join(',');
    const count = this.tracks.length;
    if (count === 0) {
      this.cancelInteraction();
      this.previousCount = 0;
      this.multiHandLock = false;
      return this.result();
    }
    if (oldIds !== newIds || count !== this.previousCount) this.cancelInteraction();
    this.previousCount = count;
    if (count === 2) {
      this.multiHandLock = true;
      return this.updateTwoHands(timestampMs);
    }
    return this.updateSingleHand(timestampMs);
  }

  updateTwoHands(timestampMs) {
    this.armed = false;
    this.rearmSince = null;
    this.pendingClick = null;
    this.lastPoint = null;
    const [a, b] = this.tracks;
    let separation = metricDistance(a.filtered.pinch, b.filtered.pinch, this.options.aspectRatio);
    const rawSeparation = metricDistance(a.shape.pinch, b.shape.pinch, this.options.aspectRatio);
    if (!a.shape.ok || !b.shape.ok || !Number.isFinite(rawSeparation)
      || rawSeparation < this.options.zoomMinSeparation
      || !Number.isFinite(separation) || separation < this.options.zoomMinSeparation) {
      this.navigationCandidate = null;
      this.navigation = null;
      return this.result();
    }
    let cursor = mean(a.filtered.pinch, b.filtered.pinch);
    if (this.navigation) {
      const dx = cursor.x - this.navigation.position.x;
      const dy = cursor.y - this.navigation.position.y;
      const delta = Math.log2(separation / this.navigation.separation) * this.options.zoomGain;
      const events = [];
      if (Math.hypot(dx * this.options.aspectRatio, dy) >= this.options.panDeadband) {
        events.push({ type: 'pan', dx, dy });
        this.navigation.position = cursor;
      }
      if (Math.abs(delta) >= this.options.zoomDeadband
        && Math.abs(separation - this.navigation.separation) >= this.options.zoomDistanceDeadband) {
        // Translate first, then scale around the current hand midpoint.
        events.push({ type: 'zoom', delta, ...cursor });
        this.navigation.separation = separation;
      }
      return this.result('navigate', cursor, 1, events);
    }
    if (!this.navigationCandidate) {
      this.navigationCandidate = { since: timestampMs };
      // Discard history from the clutch, then let the 180 ms dwell smooth any
      // jitter before capturing baselines. Old positions cannot pull the map
      // on reacquisition, nor can a single noisy activation frame set scale.
      for (const track of this.tracks) {
        track.filters.pinch = new PointFilter(this.options);
        track.filtered.pinch = track.filters.pinch.update(track.shape.pinch, timestampMs);
      }
      cursor = mean(a.filtered.pinch, b.filtered.pinch);
      separation = metricDistance(a.filtered.pinch, b.filtered.pinch, this.options.aspectRatio);
    }
    const progress = (timestampMs - this.navigationCandidate.since) / this.options.navigationDwellMs;
    if (progress >= 1) {
      this.navigation = { separation, position: cursor };
      this.navigationCandidate = null;
      return this.result('navigate', cursor, 1);
    }
    return this.result('idle', cursor, progress);
  }

  updateSingleHand(timestampMs) {
    const track = this.tracks[0];
    const hand = track.shape;
    const point = track.filtered.pointer;
    const pinch = track.filtered.pinch;
    const center = track.filtered.center;
    const cursor = hand.point ? point : hand.ok ? pinch : center;
    const released = hand.pinchRatio >= this.options.pinchExit;

    if (this.pendingClick) {
      const pending = this.pendingClick;
      if (hand.ok) {
        if (metricDistance(hand.pinch, pending.rawPinch, this.options.aspectRatio) > this.options.maxClickDrift) {
          this.pendingClick = null;
          this.armed = false;
          return this.result('idle', cursor);
        }
        const progress = (timestampMs - pending.since) / this.options.clickDwellMs;
        if (progress >= 1) pending.ready = true;
        return this.result('click-pending', pending.anchor, progress);
      }
      this.pendingClick = null;
      this.armed = false;
      this.rearmSince = null;
      // Require a positively observed mature OK frame. The release sample
      // cannot itself prove how long the pinch remained held between frames.
      const mature = pending.ready;
      // Folding the other fingers while pinched is cancellation, not release.
      const events = mature && released && !this.multiHandLock
        ? [{ type: 'click', ...pending.anchor }] : [];
      if (events.length) this.cooldownUntil = timestampMs + this.options.clickCooldownMs;
      return this.result(hand.point ? 'point' : 'idle', cursor, 0, events);
    }

    if (hand.open) {
      this.armed = false;
      this.rearmSince = null;
      this.lastPoint = null;
      return this.result('idle', cursor);
    }

    if (hand.ok) {
      this.rearmSince = null;
      if (this.armed && !this.multiHandLock && timestampMs >= this.cooldownUntil) {
        const recentPoint = this.lastPoint && timestampMs - this.lastPoint.time <= this.options.pointAnchorMaxAgeMs;
        this.pendingClick = {
          since: timestampMs,
          ready: false,
          rawPinch: copy(hand.pinch),
          // Retain the target selected with the index before curling it into OK.
          anchor: copy(recentPoint ? this.lastPoint.cursor : pinch),
        };
        this.armed = false;
        return this.result('click-pending', this.pendingClick.anchor, 0);
      }
      return this.result('idle', cursor);
    }

    if (released) {
      if (this.rearmSince === null) this.rearmSince = timestampMs;
      if (timestampMs - this.rearmSince >= this.options.rearmMs) {
        this.armed = true;
        this.multiHandLock = false;
      }
    } else {
      this.rearmSince = null;
    }
    if (hand.point) {
      this.lastPoint = { cursor: point, time: timestampMs };
      return this.result('point', point);
    }
    return this.result('idle', cursor);
  }
}
