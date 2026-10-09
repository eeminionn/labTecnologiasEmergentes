import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GestureEngine, OneEuroFilter, classifyHand, pointerReference } from '../src/gestures.js';
import { hoverTarget } from '../src/selection.js';

// Synthetic landmarks exercise the interpreter; they are not detector accuracy
// measurements. Camera recordings and user trials remain necessary for that.
function hand(pose = 'neutral', { id = 'a', x = 0, y = 0, angle = 0, scale = 1, pinchRatio = 0.15 } = {}) {
  const points = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.7, z: 0 }));
  points[0] = { x: 0.5, y: 0.72, z: 0 };
  points[1] = { x: 0.45, y: 0.67, z: 0 };
  points[2] = { x: 0.40, y: 0.64, z: 0 };
  points[3] = { x: 0.36, y: 0.61, z: 0 };
  points[4] = { x: 0.34, y: 0.60, z: 0 };
  const bases = [[0.43, 0.57], [0.49, 0.55], [0.55, 0.57], [0.61, 0.61]];
  bases.forEach(([bx, by], finger) => {
    const index = 5 + finger * 4;
    const extended = pose === 'open' || (pose === 'point' && finger === 0) || (pose === 'ok' && finger > 0);
    points[index] = { x: bx, y: by, z: 0 };
    points[index + 1] = { x: bx, y: by - (extended ? 0.08 : 0.055), z: 0 };
    points[index + 2] = { x: bx + (extended ? 0 : 0.01), y: by - (extended ? 0.14 : 0.045), z: 0 };
    points[index + 3] = { x: bx + (extended ? 0 : 0.02), y: by + (extended ? -0.19 : 0.015), z: 0 };
    if (pose === 'fist') {
      points[index + 1] = { x: bx, y: by - 0.065, z: -0.005 };
      points[index + 2] = { x: bx + 0.005, y: by - 0.030, z: -0.050 };
      points[index + 3] = { x: bx + 0.010, y: by + 0.025, z: -0.025 };
    }
  });
  if (pose === 'fist') {
    points[2] = { x: 0.44, y: 0.64, z: 0 };
    points[3] = { x: 0.48, y: 0.60, z: 0 };
    points[4] = { x: 0.53, y: 0.62, z: 0 };
  }
  if (pose === 'ok') {
    const palmSize = Math.hypot(points[5].x - points[17].x, points[5].y - points[17].y);
    points[4] = { x: points[8].x - pinchRatio * palmSize, y: points[8].y, z: 0 };
  }
  return {
    ...(id === undefined ? {} : { id }),
    landmarks: points.map(p => {
      const px = (p.x - 0.5) * scale;
      const py = (p.y - 0.6) * scale;
      return { x: 0.5 + x + px * Math.cos(angle) - py * Math.sin(angle),
        y: 0.6 + y + px * Math.sin(angle) + py * Math.cos(angle), z: p.z * scale };
    }),
  };
}

// A rigid XYZ rotation changes the camera projection without stretching bones.
// Normalized z has wrist origin/image-width units; world XYZ is in metres with
// its own hand-centred origin. These remain synthetic geometry, not recordings.
function cameraView(value, { pitch = 0, yaw = 0, roll = 0, aspectRatio = 1,
  world = true, metricScale = 0.45 } = {}) {
  const source = typeof value === 'string' ? hand(value) : value;
  const rotated = source.landmarks.map(point => {
    const x = point.x - 0.5, y = point.y - 0.6, z = point.z ?? 0;
    const py = y * Math.cos(pitch) - z * Math.sin(pitch);
    const pz = y * Math.sin(pitch) + z * Math.cos(pitch);
    const yx = x * Math.cos(yaw) + pz * Math.sin(yaw);
    const yz = -x * Math.sin(yaw) + pz * Math.cos(yaw);
    return { x: yx * Math.cos(roll) - py * Math.sin(roll),
      y: yx * Math.sin(roll) + py * Math.cos(roll), z: yz };
  });
  const centroid = rotated.reduce((sum, p) => ({ x: sum.x + p.x / 21,
    y: sum.y + p.y / 21, z: sum.z + p.z / 21 }), { x: 0, y: 0, z: 0 });
  return {
    ...(source.id === undefined ? {} : { id: source.id }),
    landmarks: rotated.map(p => ({ x: 0.5 + p.x / aspectRatio, y: 0.55 + p.y,
      z: (p.z - rotated[0].z) / aspectRatio })),
    ...(world ? { worldLandmarks: rotated.map(p => ({ x: (p.x - centroid.x) * metricScale,
      y: (p.y - centroid.y) * metricScale, z: (p.z - centroid.z) * metricScale })) } : {}),
  };
}

const translatedImage = (value, x, y = 0) => ({ ...value,
  landmarks: value.landmarks.map(point => ({ ...point, x: point.x + x, y: point.y + y })) });

const blendHand = (from, to, progress) => ({ id: from.id,
  landmarks: from.landmarks.map((point, index) => Object.fromEntries(['x', 'y', 'z']
    .map(axis => [axis, (point[axis] ?? 0) * (1 - progress) + (to.landmarks[index][axis] ?? 0) * progress]))) });

function frames(engine, hands, from, until, step = 20) {
  const results = [];
  for (let time = from; time <= until; time += step) results.push(engine.update(hands, time));
  return results;
}
const events = results => results.flatMap(result => result.events);
const clicks = results => events(results).filter(event => event.type === 'click');
function pointedEngine(options = {}) {
  const engine = new GestureEngine(options);
  frames(engine, [hand('point')], 0, 140);
  return engine;
}
function okPair({ x = 0, y = 0, separation = 0.30 } = {}) {
  return [hand('ok', { id: 'a', x: x - separation / 2, y }),
    hand('ok', { id: 'b', x: x + separation / 2, y })];
}
function fistPair({ x = 0, y = 0, separation = 0.30 } = {}) {
  return [hand('fist', { id: 'a', x: x - separation / 2, y }),
    hand('fist', { id: 'b', x: x + separation / 2, y })];
}
function navigationEngine(options = {}, pose = 'ok') {
  const engine = new GestureEngine(options);
  frames(engine, pose === 'fist' ? fistPair() : okPair(), 0, 200);
  return engine;
}

test('geometry recognizes poses under in-plane rotation, translation and size changes', () => {
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.7]) {
    for (const scale of [0.65, 1, 1.4]) {
      for (const pose of ['point', 'open', 'ok', 'fist']) {
        const shape = classifyHand(hand(pose, { angle, scale, x: 0.05, y: -0.08 }));
        assert.equal(shape[pose], true, `${pose}, angle=${angle}, scale=${scale}`);
      }
    }
  }
});

test('camera aspect correction preserves geometry and leaves output coordinates raw', () => {
  for (const aspectRatio of [4 / 3, 16 / 9, 9 / 16]) {
    for (const pose of ['point', 'open', 'ok', 'fist']) {
      const original = hand(pose, { angle: Math.PI / 4 });
      const projected = { ...original, landmarks: original.landmarks.map(p => ({
        x: 0.5 + (p.x - 0.5) / aspectRatio, y: p.y, z: p.z / aspectRatio,
      })) };
      const expected = classifyHand(original);
      const actual = classifyHand(projected, { aspectRatio });
      assert.equal(actual[pose], true);
      assert.ok(Math.abs(expected.pinchRatio - actual.pinchRatio) < 1e-12);
      assert.deepEqual(actual.pointer, { x: projected.landmarks[8].x, y: projected.landmarks[8].y });
      const result = new GestureEngine({ aspectRatio }).update([projected], 0);
      if (pose === 'point') assert.deepEqual(result.cursor, actual.pointer);
    }
  }
  assert.equal(classifyHand(hand(), { aspectRatio: 0 }), null);
  assert.throws(() => new GestureEngine({ aspectRatio: 0 }), RangeError);
});

test('fist requires four positively folded fingers and a compact adducted thumb', () => {
  const positive = classifyHand(hand('fist'));
  assert.equal(positive.fist, true);
  assert.deepEqual(positive.folded, [true, true, true, true]);
  assert.ok(!positive.ok && !positive.open && !positive.point);
  // Four non-extended fingers with an outstretched thumb are not a fist.
  const relaxed = classifyHand(hand('neutral'));
  assert.equal(relaxed.extended.some(Boolean), false);
  assert.equal(relaxed.fist, false);
  for (const pose of ['point', 'open', 'ok']) assert.equal(classifyHand(hand(pose)).fist, false, pose);
  for (const mcp of [5, 9, 13, 17]) {
    const partial = hand('fist');
    const open = hand('open');
    for (let index = mcp; index < mcp + 4; index++) partial.landmarks[index] = open.landmarks[index];
    assert.equal(classifyHand(partial).fist, false, `extended finger ${mcp}`);
  }
  const thumbOut = hand('fist');
  for (let index = 1; index <= 4; index++) thumbOut.landmarks[index] = hand('neutral').landmarks[index];
  assert.equal(classifyHand(thumbOut).fist, false);
});

test('a straight thumb IP can still form a fist with compact positive MCP flexion', () => {
  const value = hand('fist');
  value.landmarks[2] = { x: 0.44, y: 0.64, z: 0 };
  value.landmarks[3] = { x: 0.485, y: 0.62, z: 0 };
  value.landmarks[4] = { x: 0.53, y: 0.60, z: 0 };
  assert.equal(classifyHand(value).fist, true);
});

test('fist accepts rigid 3D front, back and side rotations in world or normalized XYZ', () => {
  for (const aspectRatio of [1, 4 / 3, 16 / 9, 9 / 16]) {
    for (const world of [true, false]) {
      for (const [pitch, yaw, roll] of [[0, 0, 0], [Math.PI / 2, 0, 0], [-Math.PI / 2, 0, 0],
        [0, Math.PI / 2, 0], [0, -Math.PI / 2, 0], [1.2, 0.7, 1.5]]) {
        const value = cameraView('fist', { pitch, yaw, roll, world, aspectRatio });
        const shape = classifyHand(value, { aspectRatio });
        assert.equal(shape.fist, true, `${pitch}, ${yaw}, ${roll}, aspect=${aspectRatio}, world=${world}`);
        assert.equal(shape.fistGeometrySource, world ? 'world' : 'normalized-3d');
        assert.equal(shape.actionGeometryValid, true);
        assert.deepEqual(shape.pointer, { x: value.landmarks[8].x, y: value.landmarks[8].y });
      }
    }
  }
});

test('foreshortened XY bones keep their 3D length; world evidence can resolve hidden fingers', () => {
  const value = cameraView('fist', { pitch: Math.PI / 2 });
  const imageShape = classifyHand({ landmarks: value.landmarks });
  const projectedBone = Math.hypot(value.landmarks[6].x - value.landmarks[5].x,
    value.landmarks[6].y - value.landmarks[5].y);
  assert.ok(projectedBone / imageShape.palmSize < 0.04, 'old projected minimum rejected this pose');
  assert.equal(imageShape.fist, true);
  // Explicit 3D inference remains available even when image joints overlap.
  for (const mcp of [5, 9, 13, 17]) {
    for (let index = mcp; index <= mcp + 3; index++) {
      value.landmarks[index] = { ...value.landmarks[mcp], z: 0 };
    }
  }
  value.landmarks[0].z = 0;
  const world = classifyHand(value);
  assert.equal(world.fist, true);
  assert.equal(world.fistGeometrySource, 'world');
  const unknown = classifyHand({ landmarks: value.landmarks });
  assert.equal(unknown.fist, false, 'collapsed XY without depth is not positive closure evidence');
});

test('world posture stays invariant to its metric scale and never uses camera aspect twice', () => {
  for (const aspectRatio of [4 / 3, 16 / 9]) {
    for (const metricScale of [0.25, 0.45, 0.70]) {
      const value = cameraView('fist', { pitch: Math.PI / 2, aspectRatio, metricScale });
      const shape = classifyHand(value, { aspectRatio });
      assert.equal(shape.fist, true);
      assert.equal(shape.fistGeometrySource, 'world');
      assert.deepEqual(shape.center, classifyHand({ landmarks: value.landmarks }, { aspectRatio }).center);
    }
  }
});

test('a compact straight thumb does not need a compulsory IP or MCP bend', () => {
  const value = hand('fist');
  for (let index = 1; index <= 4; index++) value.landmarks[index] = { x: 0.41 + index * 0.03, y: 0.615, z: 0 };
  for (const pitch of [0, Math.PI / 2, -Math.PI / 2]) {
    for (const world of [false, true]) assert.equal(classifyHand(cameraView(value, { pitch, world })).fist, true);
  }
});

test('DIP-straight claws are rejected while strongly retracted DIP-straight fists are allowed', () => {
  const claw = hand('fist'), closed = hand('fist');
  for (const mcp of [5, 9, 13, 17]) {
    const base = claw.landmarks[mcp];
    claw.landmarks[mcp + 1] = { x: base.x, y: base.y - 0.065, z: 0 };
    claw.landmarks[mcp + 2] = { x: base.x, y: base.y - 0.065, z: -0.050 };
    claw.landmarks[mcp + 3] = { x: base.x, y: base.y - 0.065, z: -0.075 };
    closed.landmarks[mcp + 1] = { x: base.x, y: base.y - 0.065, z: 0 };
    closed.landmarks[mcp + 2] = { x: base.x, y: base.y - 0.005, z: -0.010 };
    closed.landmarks[mcp + 3] = { x: base.x, y: base.y + 0.025, z: -0.015 };
  }
  for (const pitch of [0, Math.PI / 2, -Math.PI / 2]) {
    for (const world of [false, true]) {
      const negative = cameraView(claw, { pitch, world });
      assert.equal(classifyHand(negative).fist, false, `claw ${pitch}, world=${world}`);
      const positive = cameraView(closed, { pitch, world });
      assert.equal(classifyHand(positive).fist, true, `closed ${pitch}, world=${world}`);
      const engine = new GestureEngine();
      const pair = [translatedImage(negative, -0.15), { ...translatedImage(negative, 0.15), id: 'b' }];
      const idle = frames(engine, pair, 0, 200);
      idle.push(engine.update(pair.map(value => translatedImage(value, 0.04)), 220));
      assert.equal(events(idle).length, 0);
      assert.ok(idle.every(result => result.mode === 'idle' && result.pointers.length === 2));
    }
  }
});

test('open, pointing, OK, relaxed, thumbs-up, spread and partial poses are not 3D fists', () => {
  const thumbUp = hand('fist');
  thumbUp.landmarks[2] = { x: 0.42, y: 0.61, z: 0 };
  thumbUp.landmarks[3] = { x: 0.42, y: 0.50, z: 0 };
  thumbUp.landmarks[4] = { x: 0.42, y: 0.40, z: 0 };
  const spread = hand('fist');
  for (const [index, offset] of [[8, -0.12], [12, -0.04], [16, 0.04], [20, 0.12]]) spread.landmarks[index].x += offset;
  const partial = hand('fist'), open = hand('open');
  for (let index = 13; index <= 16; index++) partial.landmarks[index] = open.landmarks[index];
  for (const value of ['open', 'point', 'ok', 'neutral', thumbUp, spread, partial]) {
    for (const pitch of [0, Math.PI / 2, -Math.PI / 2]) {
      for (const world of [true, false]) {
        assert.equal(classifyHand(cameraView(value, { pitch, world })).fist, false);
      }
    }
  }
});

test('absent world data falls back explicitly; malformed world data blocks actions but keeps pointers', () => {
  const valid = cameraView('fist');
  const absent = { ...valid }; delete absent.worldLandmarks;
  assert.equal(classifyHand(absent).fistGeometrySource, 'normalized-3d');
  const nonfinite = valid.worldLandmarks.map(p => ({ ...p })); nonfinite[8].z = NaN;
  const missingZ = valid.worldLandmarks.map(({ x, y }) => ({ x, y }));
  const collapsed = valid.worldLandmarks.map(() => ({ x: 0, y: 0, z: 0 }));
  const brokenFinger = valid.worldLandmarks.map(p => ({ ...p })); brokenFinger[10] = { ...brokenFinger[9] };
  for (const worldLandmarks of [null, [], valid.worldLandmarks.slice(1), nonfinite, missingZ, collapsed, brokenFinger]) {
    const invalid = { ...valid, worldLandmarks };
    const shape = classifyHand(invalid);
    assert.equal(shape.fist, false);
    assert.equal(shape.fistGeometrySource, 'invalid-world');
    assert.equal(shape.actionGeometryValid, false);
    const engine = new GestureEngine();
    const results = frames(engine, [invalid, { ...translatedImage(valid, 0.20), id: 'b' }], 0, 600);
    assert.equal(events(results).length, 0);
    assert.ok(results.every(result => result.pointers.length === 2));
    assert.equal(results.at(-1).navigationKind, 'pan', 'the other valid fist can act independently');
    assert.deepEqual(results.at(-1).navigationHandIds, [results.at(-1).pointers[1].id]);
  }
});

test('contradictory positive image and world poses cannot drive map actions', () => {
  const closedWorld = cameraView('fist').worldLandmarks;
  for (const pose of ['point', 'open', 'ok']) {
    const value = { ...hand(pose), worldLandmarks: closedWorld };
    const shape = classifyHand(value);
    assert.deepEqual(shape.pointer, { x: value.landmarks[8].x, y: value.landmarks[8].y });
    if (pose !== 'ok') assert.equal(shape[pose], true, 'image pointing/open feedback is preserved');
    else assert.equal(shape.ok, false, 'a world fist cannot establish OK');
    assert.equal(shape.fist, false);
    assert.equal(shape.actionGeometryValid, false);
    const results = frames(new GestureEngine(), [value], 0, 2000);
    assert.equal(events(results).length, 0);
    assert.ok(results.every(result => result.cursor && result.pointers.length === 1));
  }
});

test('invalid world during a click cancels it and cannot resume unchanged OK', () => {
  const valid = cameraView('ok');
  const engine = new GestureEngine();
  frames(engine, [valid], 0, 1480);
  assert.equal(engine.update([{ ...valid, worldLandmarks: [] }], 1499).events.length, 0);
  assert.equal(clicks(frames(engine, [valid], 1500, 3500)).length, 0);
  frames(engine, [cameraView('open')], 3520, 3660);
  const retry = frames(engine, [valid], 3680, 5180);
  assert.equal(clicks(retry).length, 1);
});

test('packaged 3D views pan only from camera XY, preserve halos and never zoom', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/selection-poses.json', import.meta.url)));
  assert.deepEqual(fixture.handViews.map(value => value.name), ['cenital-dorso', 'frontal-nudillos', 'frontal-palma']);
  for (const view of fixture.handViews) {
    assert.equal(view.landmarks.length, 21);
    assert.equal(view.worldLandmarks.length, 21);
    assert.equal(view.landmarks[0].z, 0);
    const shape = classifyHand(view);
    assert.equal(shape.fist, true);
    assert.equal(shape.fistGeometrySource, 'world');
    const left = { ...translatedImage(view, -0.15), id: 'a' };
    const right = { ...translatedImage(view, 0.15), id: 'b' };
    const engine = new GestureEngine();
    const acquisition = frames(engine, [left, right], 0, 180);
    assert.equal(events(acquisition).length, 0);
    assert.equal(acquisition.at(-1).navigationKind, 'pan');
    for (const [index, value] of [left, right].entries()) {
      const knuckles = classifyHand(value).knuckles;
      assert.deepEqual({ x: acquisition[0].pointers[index].x, y: acquisition[0].pointers[index].y }, knuckles);
    }
    // World coordinates stay local/unchanged while the hands translate.
    const moved = engine.update([translatedImage(left, 0.04), translatedImage(right, 0.04)], 200);
    assert.ok(moved.events.length > 0);
    assert.ok(moved.events.every(event => event.type === 'pan' && event.dx > 0));
    assert.equal(moved.pointers.length, 2);
    const worldOrigin = [left, right].map((value, index) => ({ ...translatedImage(value, 0.04),
      worldLandmarks: value.worldLandmarks.map(p => ({ x: p.x + index, y: p.y - index * 2, z: p.z + index * 3 })) }));
    // Changing local world origin itself cannot become a camera pan/zoom.
    const settled = frames(engine, worldOrigin, 220, 600);
    assert.ok(events(settled).every(event => event.type === 'pan'));
    assert.equal(events(frames(engine, worldOrigin, 620, 900)).length, 0);
  }
});

test('claw, collapsed, implausibly short and clipped geometry cannot establish fists', () => {
  const values = [];
  const claw = hand('fist');
  for (const mcp of [5, 9, 13, 17]) {
    const pip = claw.landmarks[mcp + 1], dip = claw.landmarks[mcp + 2];
    claw.landmarks[mcp + 3] = { x: 2 * dip.x - pip.x, y: 2 * dip.y - pip.y, z: 2 * dip.z - pip.z };
  }
  values.push(claw);
  for (const mcp of [5, 9, 13, 17]) {
    const collapsed = hand('fist');
    for (let index = mcp + 1; index <= mcp + 3; index++) collapsed.landmarks[index] = { ...collapsed.landmarks[mcp] };
    values.push(collapsed);
    const short = hand('fist'), base = short.landmarks[mcp];
    for (let index = mcp + 1; index <= mcp + 3; index++) {
      const point = short.landmarks[index];
      short.landmarks[index] = { x: base.x + (point.x - base.x) * 0.01,
        y: base.y + (point.y - base.y) * 0.01, z: point.z * 0.01 };
    }
    values.push(short);
  }
  for (const index of [0, 4, 8, 12, 16, 20]) {
    const clipped = hand('fist');
    clipped.landmarks[index].y = index === 0 ? 1.001 : -0.001;
    values.push(clipped);
  }
  for (const value of values) {
    const shape = classifyHand(value);
    assert.ok(shape, 'hand still has a pointer');
    assert.equal(shape.fist, false);
    const engine = new GestureEngine();
    const pair = [value, { ...translatedImage(value, 0.18), id: 'b' }];
    const result = frames(engine, pair, 0, 600);
    assert.ok(result.every(frame => frame.mode === 'idle' && frame.pointers.length === 2));
    assert.equal(events(result).length, 0);
    const single = frames(new GestureEngine(), [value], 0, 600);
    assert.ok(single.every(frame => frame.mode !== 'navigate' && frame.pointers.length === 1));
    assert.equal(events(single).length, 0, 'an incomplete or implausible single fist cannot acquire pan');
  }
});

test('packaged selection fixtures identify point, OK and a fully closed fist', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/selection-poses.json', import.meta.url)));
  for (const pose of ['point', 'ok', 'fist']) {
    const landmarks = fixture.poses[pose];
    assert.equal(landmarks.length, 21);
    assert.equal(classifyHand({ landmarks })[pose], true, pose);
  }
});

test('initial OK can click after 1.5 seconds, including after empty startup frames', () => {
  const engine = new GestureEngine();
  frames(engine, [], 0, 200);
  const results = frames(engine, [hand('ok')], 220, 1720);
  assert.equal(results[0].mode, 'click-pending');
  assert.equal(results[0].progress, 0);
  assert.equal(clicks(results).length, 1);
  assert.equal(results.at(-1).mode, 'click-confirmed');
});

test('1499 ms cannot click; 1500 ms clicks once automatically without release', () => {
  const engine = new GestureEngine();
  const held = frames(engine, [hand('ok')], 0, 1480);
  const before = engine.update([hand('ok')], 1499);
  assert.equal(before.mode, 'click-pending');
  assert.equal(before.progress, 1499 / 1500);
  assert.equal(before.events.length, 0);
  const confirmed = engine.update([hand('ok')], 1500);
  assert.equal(confirmed.mode, 'click-confirmed');
  assert.equal(confirmed.progress, 1);
  assert.deepEqual(confirmed.events, [{ type: 'click', ...held[0].cursor }]);
  const sustained = frames(engine, [hand('ok')], 1520, 10000);
  assert.equal(events(sustained).length, 0);
  assert.ok(sustained.every(result => result.mode === 'click-confirmed'));
  const release = engine.update([hand('open')], 10020);
  assert.equal(release.events.length, 0);
  assert.deepEqual(release.cursor, confirmed.cursor);
});

test('point, palm and neutral targets stay anchored when fingers close into OK', () => {
  for (const pose of ['point', 'open', 'neutral']) {
    const engine = new GestureEngine();
    const target = frames(engine, [hand(pose, { x: -0.12, y: -0.10 })], 0, 140).at(-1).cursor;
    const hold = frames(engine, [hand('ok', { x: -0.12, y: -0.10 })], 160, 1660);
    assert.deepEqual(hold[0].cursor, target, pose);
    assert.ok(hold.every(result => Math.hypot(result.cursor.x - target.x, result.cursor.y - target.y) < 1e-12));
    assert.deepEqual(clicks(hold), [{ type: 'click', ...target }], pose);
  }
});

test('gradual pointing or open-to-OK closure preserves the original target before index retraction', () => {
  for (const pose of ['point', 'open']) for (const duration of [200, 600, 1000]) {
    const engine = new GestureEngine();
    const from = hand(pose), to = hand('ok');
    const before = frames(engine, [from], 0, 200).at(-1);
    const target = { id: 'original', x: before.cursor.x * 1000, y: before.cursor.y * 1000,
      width: 44, height: 44 };
    const results = [];
    let firstOK, firstPreparing;
    for (let elapsed = 20; elapsed <= duration; elapsed += 20) {
      const result = engine.update([blendHand(from, to, elapsed / duration)], 200 + elapsed);
      if (result.mode === 'click-preparing' && firstPreparing === undefined) firstPreparing = 200 + elapsed;
      if (result.mode === 'click-pending' && firstOK === undefined) firstOK = 200 + elapsed;
      if (result.mode === 'click-preparing') {
        assert.equal(result.progress, 0);
        assert.equal(result.events.length, 0);
        assert.equal(hoverTarget({ x: result.cursor.x * 1000, y: result.cursor.y * 1000 }, [target])?.id,
          'original', `${pose}, closing=${duration}`);
      }
      results.push(result);
    }
    assert.ok(firstPreparing < firstOK, `${pose}, closing=${duration}`);
    assert.equal(events(results).length, 0, 'preparation never produces a click');
    const atOK = results.find(result => result.mode === 'click-pending');
    assert.equal(atOK.progress, 0);
    assert.equal(hoverTarget({ x: atOK.cursor.x * 1000, y: atOK.cursor.y * 1000 }, [target])?.id, 'original');
    results.push(...frames(engine, [to], 220 + duration, firstOK + 1480));
    const deadline = engine.update([to], firstOK + 1500);
    assert.equal(deadline.mode, 'click-confirmed');
    assert.equal(deadline.events.length, 1);
    assert.equal(hoverTarget({ x: deadline.events[0].x * 1000, y: deadline.events[0].y * 1000 }, [target])?.id,
      'original');
    assert.equal(events(frames(engine, [to], firstOK + 1520, firstOK + 2100)).length, 0);
  }
});

test('a stationary thumb can receive a gradually curling index without losing the pointed target', () => {
  for (const vertical of [false, true]) for (const duration of [200, 600, 1000]) {
    for (const roll of [0, 0.8, 1.9]) for (const aspectRatio of [1, 4 / 3, 16 / 9]) {
      const start = hand('point');
      if (vertical) start.landmarks[4].x = start.landmarks[5].x;
      const finish = hand('ok');
      for (let index = 1; index <= 4; index++) finish.landmarks[index] = { ...start.landmarks[index] };
      finish.landmarks[8] = { x: start.landmarks[4].x + classifyHand(start).palmSize * 0.15,
        y: start.landmarks[4].y, z: 0 };
      const from = cameraView(start, { roll, aspectRatio, world: false });
      const to = cameraView(finish, { roll, aspectRatio, world: false });
      assert.equal(classifyHand(to, { aspectRatio }).ok, true);
      const engine = new GestureEngine({ aspectRatio });
      const initial = frames(engine, [from], 0, 200).at(-1);
      const target = { id: 'original', x: initial.cursor.x * 1000, y: initial.cursor.y * 1000,
        width: 44, height: 44 };
      const closure = [];
      let started;
      for (let elapsed = 20; elapsed <= duration; elapsed += 20) {
        const result = engine.update([blendHand(from, to, elapsed / duration)], 200 + elapsed);
        if (result.mode === 'click-pending' && started === undefined) started = 200 + elapsed;
        closure.push(result);
      }
      assert.equal(events(closure).length, 0);
      assert.ok(started, `vertical=${vertical}, duration=${duration}, roll=${roll}, aspect=${aspectRatio}`);
      const pending = closure.find(result => result.mode === 'click-pending');
      assert.equal(hoverTarget({ x: pending.cursor.x * 1000, y: pending.cursor.y * 1000 }, [target])?.id,
        'original', `vertical=${vertical}, duration=${duration}, roll=${roll}, aspect=${aspectRatio}`);
      const held = frames(engine, [to], 220 + duration, started + 1500);
      assert.equal(clicks(held).length, 1);
      assert.equal(hoverTarget({ x: clicks(held)[0].x * 1000, y: clicks(held)[0].y * 1000 }, [target])?.id,
        'original');
    }
  }
});

test('moving or flexing only the pointing index without thumb approach never prepares a click', () => {
  for (const motion of ['tip', 'curl', 'vertical']) for (const roll of [0, 0.8, 1.9]) {
    for (const aspectRatio of [1, 4 / 3, 16 / 9]) {
    const engine = new GestureEngine({ aspectRatio });
    const raw = hand('point');
    const from = cameraView(raw, { roll, aspectRatio, world: false });
    const initial = frames(engine, [from], 0, 200).at(-1);
    const results = [];
    for (let elapsed = 20; elapsed <= 600; elapsed += 20) {
      const progress = elapsed / 600;
      const moved = structuredClone(raw);
      if (motion === 'tip') moved.landmarks[8].x -= progress * 0.06;
      else for (let index = 5; index <= 8; index++) {
        const closed = hand('neutral').landmarks[index];
        moved.landmarks[index] = Object.fromEntries(['x', 'y', 'z'].map(axis =>
          [axis, raw.landmarks[index][axis] * (1 - progress) + closed[axis] * progress]));
        if (motion === 'vertical') moved.landmarks[index].x = raw.landmarks[index].x;
      }
      results.push(engine.update([cameraView(moved, { roll, aspectRatio, world: false })], 200 + elapsed));
    }
    assert.ok(results.every(result => result.mode !== 'click-preparing' && result.mode !== 'click-pending'));
    assert.equal(events(results).length, 0);
    assert.ok(Math.hypot((results.at(-1).cursor.x - initial.cursor.x) * aspectRatio,
      results.at(-1).cursor.y - initial.cursor.y) > 0.03);
    }
  }
});

test('discarding a private curling intent does not freeze, click or block a later valid OK', () => {
  for (const moved of [false, true]) {
    const engine = new GestureEngine();
    const from = hand('point'), neutral = hand('neutral');
    frames(engine, [from], 0, 200);
    const partial = blendHand(from, neutral, 0.5);
    const latent = engine.update([partial], 240);
    assert.ok(engine.tracks[0].clickIntent);
    assert.notEqual(latent.mode, 'click-preparing');
    assert.ok(latent.cursor.y > from.landmarks[8].y);
    let discarded;
    if (moved) discarded = engine.update([translatedImage(partial, 0.03)], 260);
    else {
      frames(engine, [partial], 260, 1420);
      discarded = engine.update([partial], 1440);
    }
    assert.notEqual(discarded.mode, 'click-preparing');
    assert.equal(discarded.resetSelection, true);
    assert.equal(discarded.selectionBlockedReason, null);
    assert.equal(discarded.events.length, 0);
    assert.equal(engine.tracks[0].clickIntent, null);
    const held = frames(engine, [hand('ok')], moved ? 280 : 1460, moved ? 2200 : 3380);
    assert.equal(held[0].mode, 'click-pending');
    assert.equal(held[0].progress, 0, 'private intent contributes no dwell time');
    assert.equal(clicks(held).length, 1);
  }
});

test('preparation expires without acting and a fresh aim cannot inherit its old target', () => {
  const engine = new GestureEngine();
  const from = hand('point'), to = hand('ok');
  const initial = frames(engine, [from], 0, 200).at(-1);
  const partial = blendHand(from, to, 0.2);
  const preparing = engine.update([partial], 240);
  assert.equal(preparing.mode, 'click-preparing');
  const expired = frames(engine, [partial], 260, 1420);
  assert.ok(expired.every(result => result.mode === 'click-preparing'));
  expired.push(engine.update([partial], 1440));
  assert.equal(events(expired).length, 0);
  assert.notEqual(expired.at(-1).mode, 'click-preparing', 'expires exactly 1200 ms after preparing begins');
  assert.equal(expired.at(-1).resetSelection, true);
  assert.equal(expired.at(-1).selectionBlockedReason, null);
  frames(engine, [partial], 1460, 1600);
  const newFrom = hand('point', { x: 0.12 });
  const newTo = hand('ok', { x: 0.12 });
  const fresh = frames(engine, [newFrom], 1620, 2220).at(-1);
  assert.ok(fresh.cursor.x > initial.cursor.x + 0.10);
  const closure = [];
  for (let elapsed = 20; elapsed <= 600; elapsed += 20) {
    closure.push(engine.update([blendHand(newFrom, newTo, elapsed / 600)], 2220 + elapsed));
  }
  const firstOK = closure.findIndex(result => result.mode === 'click-pending');
  assert.ok(firstOK >= 0);
  const started = 2240 + firstOK * 20;
  const held = frames(engine, [newTo], 2840, started + 1500);
  assert.equal(clicks(held).length, 1);
  assert.ok(clicks(held)[0].x > initial.cursor.x + 0.10);
});

test('assistance aborts are optional; only the participating track or geometry interruptions require release', () => {
  for (const reason of ['open', 'palm', 'loss', 'second', 'geometry', 'identity', 'gap']) {
    const engine = new GestureEngine();
    const from = hand('point'), to = hand('ok');
    frames(engine, [from], 0, 200);
    const partial = blendHand(from, to, 0.2);
    assert.equal(engine.update([partial], 240).mode, 'click-preparing');
    const time = reason === 'gap' ? 420 : 260;
    const invalid = reason === 'open' ? [from] : reason === 'palm' ? [translatedImage(partial, 0.03)]
      : reason === 'loss' ? [] : reason === 'second' ? [partial, hand('open', { id: 'b', x: 0.30 })]
        : reason === 'geometry' ? [{ ...partial, worldLandmarks: [] }]
          : reason === 'identity' ? [{ ...partial, id: 'replacement' }] : [partial];
    const cancelled = engine.update(invalid, time);
    if (reason === 'second') assert.equal(cancelled.mode, 'click-preparing');
    else assert.notEqual(cancelled.mode, 'click-preparing', reason);
    assert.equal(cancelled.events.length, 0, reason);
    const held = frames(engine, [reason === 'identity' ? { ...to, id: 'replacement' } : to], time + 20, time + 1900);
    const soft = reason === 'open' || reason === 'palm' || reason === 'second';
    assert.equal(clicks(held).length, soft ? 1 : 0, reason);
    assert.equal(held[0].mode, soft ? 'click-pending' : 'idle', reason);
    assert.equal(held[0].progress, 0, reason);
  }
});

test('one estimated MCP can deform during closure without vetoing a valid OK or moving its target', () => {
  for (const aspectRatio of [1, 16 / 9]) for (const world of [false, true]) {
    for (const deformation of [0.02, 0.03, 0.04]) {
      const engine = new GestureEngine({ aspectRatio });
      const from = cameraView('open', { aspectRatio, world });
      const target = frames(engine, [from], 0, 200).at(-1).cursor;
      const partial = cameraView(blendHand(hand('open'), hand('ok'), 0.3), { aspectRatio, world });
      assert.equal(engine.update([partial], 220).mode, 'click-preparing');
      const closed = cameraView('ok', { aspectRatio, world });
      closed.landmarks[5].x += deformation;
      assert.equal(classifyHand(closed, { aspectRatio }).ok, true);
      assert.equal(classifyHand(closed, { aspectRatio }).actionGeometryValid, true);
      const pending = engine.update([closed], 240);
      assert.equal(pending.mode, 'click-pending', `aspect=${aspectRatio}, world=${world}, MCP=${deformation}`);
      assert.deepEqual(pending.cursor, target);
      assert.equal(pending.progress, 0);
      assert.equal(pending.resetSelection, false);
      assert.equal(pending.selectionBlockedReason, null);
      const held = frames(engine, [closed], 260, 1720);
      assert.equal(clicks(held).length, 0);
      assert.deepEqual(engine.update([closed], 1740).events, [{ type: 'click', ...target }]);
      assert.equal(clicks(frames(engine, [closed], 1760, 2240)).length, 0);
    }
  }
});

test('a valid OK has priority over optional preparation stability and starts a complete new dwell', () => {
  const engine = new GestureEngine();
  const target = frames(engine, [hand('point')], 0, 200).at(-1).cursor;
  assert.equal(engine.update([blendHand(hand('point'), hand('ok'), 0.2)], 240).mode, 'click-preparing');
  // This exceeds the stricter preparation threshold, but remains inside the
  // established held-click drift bound. It is not a tracking discontinuity.
  const closed = hand('ok', { x: 0.03 });
  const pending = engine.update([closed], 260);
  assert.equal(pending.mode, 'click-pending');
  assert.equal(pending.progress, 0);
  assert.equal(pending.resetSelection, false);
  assert.deepEqual(pending.cursor, target);
  assert.equal(clicks(frames(engine, [closed], 280, 1740)).length, 0);
  assert.deepEqual(engine.update([closed], 1760).events, [{ type: 'click', ...target }]);
});

test('preparation expiring on the first valid OK frame starts fresh without an obsolete target or early click', () => {
  const engine = new GestureEngine();
  const from = hand('point'), to = hand('ok');
  const oldTarget = frames(engine, [from], 0, 200).at(-1).cursor;
  const partial = blendHand(from, to, 0.2);
  assert.equal(engine.update([partial], 240).mode, 'click-preparing');
  frames(engine, [partial], 260, 1420);
  const pending = engine.update([to], 1440);
  assert.equal(pending.mode, 'click-pending');
  assert.equal(pending.progress, 0);
  assert.equal(pending.resetSelection, true);
  assert.equal(pending.selectionBlockedReason, null);
  assert.deepEqual(pending.cursor, classifyHand(to).pointer);
  assert.ok(Math.hypot(pending.cursor.x - oldTarget.x, pending.cursor.y - oldTarget.y) > 0.10);
  assert.equal(clicks(frames(engine, [to], 1460, 2920)).length, 0);
  assert.equal(engine.update([to], 2939).events.length, 0);
  assert.deepEqual(engine.update([to], 2940).events, [{ type: 'click', ...pending.cursor }]);
});

test('discarding a stale public snapshot resets its locked cursor before a subsequent OK', () => {
  for (const translated of [false, true]) {
    const engine = new GestureEngine();
    const from = hand('point'), to = hand('ok');
    const oldTarget = frames(engine, [from], 0, 200).at(-1).cursor;
    const partial = blendHand(from, to, 0.2);
    assert.equal(engine.update([partial], 240).mode, 'click-preparing');
    let discarded, nextTime;
    if (translated) {
      discarded = engine.update([translatedImage(partial, 0.06)], 260);
      nextTime = 280;
    } else {
      frames(engine, [partial], 260, 1420);
      discarded = engine.update([partial], 1440);
      nextTime = 1460;
    }
    assert.equal(discarded.resetSelection, true);
    assert.equal(discarded.selectionBlockedReason, null);
    const latest = translated ? translatedImage(partial, 0.06) : partial;
    assert.deepEqual(discarded.cursor, classifyHand(latest).pointer);
    assert.ok(Math.hypot(discarded.cursor.x - oldTarget.x, discarded.cursor.y - oldTarget.y) > 0.025);
    const closed = translated ? translatedImage(to, 0.06) : to;
    const pending = engine.update([closed], nextTime);
    assert.equal(pending.mode, 'click-pending');
    assert.equal(pending.progress, 0);
    assert.deepEqual(pending.cursor, discarded.cursor, 'only the current, freshly displayed aim is inherited');
    assert.equal(clicks(frames(engine, [closed], nextTime + 20, nextTime + 1480)).length, 0);
    assert.deepEqual(engine.update([closed], nextTime + 1500).events, [{ type: 'click', ...pending.cursor }]);
  }
});

test('invalidating an unarmed UI preparation is soft, while explicit safety cancellation still requires release', () => {
  for (const requireRelease of [false, true]) {
    const engine = new GestureEngine();
    const oldTarget = frames(engine, [hand('point')], 0, 200).at(-1).cursor;
    const partial = blendHand(hand('point'), hand('ok'), 0.2);
    assert.equal(engine.update([partial], 240).mode, 'click-preparing');
    engine.cancelClick(requireRelease);
    const pending = engine.update([hand('ok')], 260);
    assert.equal(pending.mode, requireRelease ? 'idle' : 'click-pending');
    assert.equal(pending.selectionBlockedReason, requireRelease ? 'release-required' : null);
    if (!requireRelease) {
      assert.equal(pending.resetSelection, true, 'external assistance cancellation is signalled on the next result');
      assert.ok(pending.cursor.y > partial.landmarks[8].y
        && pending.cursor.y <= hand('ok').landmarks[8].y, 'filtered current tip replaces the locked UI anchor');
      assert.ok(Math.hypot(pending.cursor.x - oldTarget.x, pending.cursor.y - oldTarget.y) > 0.05);
      assert.equal(pending.progress, 0);
    }
    const held = frames(engine, [hand('ok')], 280, 1760);
    assert.equal(clicks(held).length, requireRelease ? 0 : 1);
  }
});

test('isolated MCP jitter during an active OK preserves its fixed target and full dwell', () => {
  const engine = pointedEngine({ aspectRatio: 16 / 9 });
  const target = engine.update([hand('ok')], 160).cursor;
  const results = [];
  for (let elapsed = 20; elapsed <= 1500; elapsed += 20) {
    const closed = hand('ok');
    closed.landmarks[5].x += elapsed % 60 === 0 ? 0.04 : 0.02;
    results.push(engine.update([closed], 160 + elapsed));
  }
  assert.ok(results.slice(0, -1).every(result => result.mode === 'click-pending'));
  assert.deepEqual(clicks(results), [{ type: 'click', ...target }]);
});

test('selection diagnostics report participating release or geometry blockers, while zoom keeps its action state', () => {
  const engine = navigationEngine();
  assert.equal(engine.update(okPair(), 220).selectionBlockedReason, null);
  const alone = frames(engine, [okPair()[0]], 240, 500);
  assert.ok(alone.every(result => result.mode === 'idle' && result.selectionBlockedReason === 'release-required'));
  assert.equal(clicks(alone).length, 0);
  frames(engine, [hand('open', { x: -0.15 })], 520, 660);
  const pending = engine.update([hand('ok', { x: -0.15 })], 680);
  assert.equal(pending.mode, 'click-pending');
  assert.equal(pending.selectionBlockedReason, null);
  const invalid = engine.update([{ ...hand('ok', { x: -0.15 }), worldLandmarks: [] }], 700);
  assert.equal(invalid.selectionBlockedReason, 'invalid-geometry');
  const returning = frames(engine, [hand('ok', { x: -0.15 })], 720, 2500);
  assert.ok(returning.every(result => result.selectionBlockedReason === 'release-required'));
  assert.equal(clicks(returning).length, 0);
});

test('a quiet-palm OK can finish its bounded finger closure while retaining the target and dwell', () => {
  const engine = pointedEngine();
  const anchor = engine.update([hand('ok')], 160).cursor;
  let closed;
  const results = [];
  for (let elapsed = 20; elapsed <= 200; elapsed += 20) {
    closed = hand('ok');
    for (const index of [4, 8]) closed.landmarks[index].y += elapsed / 200 * 0.10;
    for (const index of [6, 7]) closed.landmarks[index].y += elapsed / 200 * 0.03;
    results.push(engine.update([closed], 160 + elapsed));
  }
  assert.ok(results.every(result => result.mode === 'click-pending'));
  results.push(...frames(engine, [closed], 380, 1660));
  assert.deepEqual(clicks(results), [{ type: 'click', ...anchor }]);
});

test('slow accumulated palm translation cancels an OK even during closing settlement', () => {
  const engine = pointedEngine();
  engine.update([hand('ok')], 160);
  const moving = [];
  for (let elapsed = 20; elapsed <= 300; elapsed += 20) {
    moving.push(engine.update([hand('ok', { x: elapsed / 300 * 0.07 })], 160 + elapsed));
  }
  assert.ok(moving.some(result => result.mode === 'idle'));
  assert.equal(events(moving).length, 0);
  assert.equal(clicks(frames(engine, [hand('ok', { x: 0.07 })], 480, 2500)).length, 0);
});

test('finger settlement cannot exceed its cap or restart after the closing grace interval', () => {
  for (const late of [false, true]) {
    const engine = pointedEngine();
    engine.update([hand('ok')], 160);
    frames(engine, [hand('ok')], 180, late ? 480 : 240);
    const moved = hand('ok');
    for (const index of [4, 8]) moved.landmarks[index].y += late ? 0.07 : 0.13;
    const result = engine.update([moved], late ? 500 : 260);
    assert.equal(result.mode, 'idle');
    assert.equal(result.events.length, 0);
    assert.equal(clicks(frames(engine, [moved], late ? 520 : 280, 2200)).length, 0);
  }
});

test('pose changes and OK release preserve cursor continuity without a center flash', () => {
  const engine = new GestureEngine();
  const location = { x: -0.20, y: -0.20 };
  const target = engine.update([hand('point', location)], 0).cursor;
  assert.ok(Math.hypot(target.x - 0.5, target.y - 0.5) > 0.20);
  let previous = target;
  for (const [time, pose] of [[20, 'neutral'], [40, 'open'], [60, 'point']]) {
    const result = engine.update([hand(pose, location)], time);
    assert.ok(Math.hypot(result.cursor.x - 0.5, result.cursor.y - 0.5) > 0.20, pose);
    assert.equal(result.events.length, 0);
    previous = result.cursor;
  }
  const start = engine.update([hand('ok', location)], 80);
  assert.deepEqual(start.cursor, previous, 'closing index anchors the last displayed target');
  const hold = frames(engine, [hand('ok', location)], 100, 1580);
  assert.deepEqual(clicks(hold), [{ type: 'click', ...previous }]);
  const release = engine.update([hand('open', location)], 1600);
  assert.deepEqual(release.cursor, previous);
  const settled = frames(engine, [hand('open', location)], 1620, 1900);
  assert.equal(events(settled).length, 0);
  assert.deepEqual(settled.at(-1).cursor, classifyHand(hand('open', location)).pointer);
});

test('cancelClick blocks an invalidated target until a stable opening, without resetting cursor', () => {
  const engine = new GestureEngine();
  const target = engine.update([hand('open')], 0).cursor;
  const pending = frames(engine, [hand('ok')], 20, 1020);
  assert.equal(pending.at(-1).mode, 'click-pending');
  engine.cancelClick();
  const blocked = frames(engine, [hand('ok')], 1040, 5600);
  assert.ok(blocked.every(result => result.mode === 'idle'));
  assert.deepEqual(blocked[0].cursor, target);
  assert.deepEqual(blocked.at(-1).cursor, classifyHand(hand('ok')).pointer);
  assert.equal(clicks(blocked).length, 0);
  engine.update([hand('open')], 5620);
  assert.equal(clicks(frames(engine, [hand('ok')], 5640, 9000)).length, 0);
  frames(engine, [hand('neutral')], 9020, 9160);
  const retry = frames(engine, [hand('ok')], 9180, 12180);
  assert.equal(clicks(retry).length, 1);
});

test('ring progress advances from zero to one throughout the full 1.5 seconds', () => {
  const engine = new GestureEngine();
  const hold = frames(engine, [hand('ok')], 0, 1500, 25);
  for (const [time, progress] of [[0, 0], [375, 0.25], [750, 0.5], [1125, 0.75], [1500, 1]]) {
    const result = hold[time / 25];
    assert.equal(result.progress, progress);
    assert.deepEqual(result.cursor, hold[0].cursor);
    assert.equal(result.mode, time < 1500 ? 'click-pending' : 'click-confirmed');
  }
});

test('releasing early or exactly at the deadline never emits a click', () => {
  for (const releaseAt of [800, 1499, 1500]) {
    const engine = new GestureEngine();
    const held = frames(engine, [hand('ok')], 0, Math.floor((releaseAt - 1) / 20) * 20);
    assert.equal(clicks(held).length, 0);
    assert.equal(engine.update([hand('open')], releaseAt).events.length, 0);
  }
});

test('moving a pending pinch cancels the click until explicit release/rearm', () => {
  const engine = pointedEngine();
  frames(engine, [hand('ok')], 160, 400);
  assert.equal(engine.update([hand('ok', { x: 0.07 })], 420).mode, 'idle');
  const results = frames(engine, [hand('ok', { x: 0.07 })], 440, 3800);
  assert.equal(clicks(results).length, 0);
  assert.ok(results.every(result => result.mode === 'idle' && result.cursor));
  frames(engine, [hand('open', { x: 0.07 })], 3820, 3960);
  assert.equal(clicks(frames(engine, [hand('ok', { x: 0.07 })], 3980, 6980)).length, 1);
});

test('pinch hysteresis preserves a continuous noisy hold without release clicks', () => {
  const engine = pointedEngine();
  const results = [engine.update([hand('ok', { pinchRatio: 0.25 })], 160)];
  for (let time = 180; time <= 1660; time += 20) {
    results.push(engine.update([hand('ok', { pinchRatio: time % 40 === 0 ? 0.32 : 0.27 })], time));
  }
  assert.ok(results.slice(0, -1).every(result => result.mode === 'click-pending'));
  assert.equal(clicks(results).length, 1);
  const release = engine.update([hand('ok', { pinchRatio: 0.45 })], 1680);
  assert.equal(release.events.length, 0);
  assert.equal(clicks(frames(engine, [hand('ok', { pinchRatio: 0.25 })], 1700, 5000)).length, 0);
});

test('loss of tracking or invalid landmarks never releases a click', () => {
  for (const lost of [[], [{ landmarks: [] }], [{ landmarks: Array(21).fill({ x: NaN, y: 0 }) }]]) {
    const engine = pointedEngine();
    frames(engine, [hand('ok')], 160, 1640);
    const result = engine.update(lost, 1660);
    assert.equal(result.mode, 'idle');
    assert.equal(result.cursor, null);
    assert.equal(result.events.length, 0);
    const results = frames(engine, [hand('ok')], 1680, 5000);
    assert.equal(clicks(results).length, 0);
  }
});

test('a long inference pause cancels the hold and blocks unchanged OK, including exactly 180 ms', () => {
  for (const gap of [180, 500, 5000]) {
    const engine = pointedEngine();
    frames(engine, [hand('ok')], 160, 1460);
    const returning = frames(engine, [hand('ok')], 1460 + gap, 5060 + gap);
    assert.equal(clicks(returning).length, 0);
  }
});

test('folding the other fingers while still pinching is cancellation', () => {
  const engine = pointedEngine();
  frames(engine, [hand('ok')], 160, 420);
  const closed = hand('ok');
  const neutral = hand('neutral');
  for (let index = 9; index < 21; index++) closed.landmarks[index] = neutral.landmarks[index];
  assert.equal(engine.update([closed], 440).events.length, 0);
  assert.equal(clicks(frames(engine, [hand('ok')], 460, 3800)).length, 0);
});

test('two OK hands acquire navigation after dwell; order changes and removal never click', () => {
  const engine = pointedEngine();
  frames(engine, [hand('ok')], 160, 320);
  const pair = [hand('ok', { id: 'a', x: -0.15 }), hand('ok', { id: 'b', x: 0.15 })];
  const results = frames(engine, pair, 340, 560);
  assert.equal(results.at(-1).mode, 'navigate');
  assert.equal(events(results).length, 0);
  const spread = [hand('ok', { id: 'b', x: 0.23 }), hand('ok', { id: 'a', x: -0.23 })];
  results.push(...frames(engine, spread, 580, 660));
  assert.ok(events(results).some(event => event.type === 'zoom' && event.delta > 0));
  assert.equal(clicks(results).length, 0);
  const one = [hand('ok', { id: 'a', x: -0.23 })];
  results.push(...frames(engine, one, 680, 4400));
  results.push(engine.update([hand('point', { id: 'a', x: -0.23 })], 4420));
  assert.equal(clicks(results).length, 0);
});

test('a lost or changed navigation track restarts dwell without a pan or scale jump', () => {
  const engine = new GestureEngine();
  const pair = [hand('ok', { id: 'a', x: -0.15 }), hand('ok', { id: 'b', x: 0.15 })];
  frames(engine, pair, 0, 220);
  const changed = [hand('ok', { id: 'a', x: -0.15 }), hand('ok', { id: 'new', x: 0.22 })];
  const result = engine.update(changed, 240);
  assert.equal(result.mode, 'idle');
  assert.equal(result.progress, 0);
  assert.equal(result.events.length, 0);
  const restarted = frames(engine, changed, 260, 440);
  assert.equal(restarted.at(-1).mode, 'navigate');
  assert.equal(events(restarted).length, 0);
});

test('opposing fingertip outliers with unchanged palms and IDs cancel navigation safely', () => {
  for (const anonymous of [false, true]) {
    const pair = () => okPair().map(value => {
      if (anonymous) delete value.id;
      return value;
    });
    const engine = new GestureEngine();
    frames(engine, pair(), 0, 200);
    const outlier = pair();
    outlier.forEach((value, i) => {
      value.worldLandmarks = cameraView(value).worldLandmarks;
      const before = classifyHand(value);
      for (const index of [4, 8]) value.landmarks[index].x += i === 0 ? 0.30 : -0.30;
      const after = classifyHand(value);
      assert.equal(after.ok, true);
      assert.deepEqual(after.center, before.center);
    });
    const cancelled = engine.update(outlier, 220);
    assert.equal(cancelled.mode, 'idle');
    assert.equal(cancelled.events.length, 0);
    // Recovery must also reject the inverse jump back to normal positions.
    const recovered = frames(engine, pair(), 240, 660);
    assert.equal(recovered.at(-1).mode, 'navigate');
    assert.equal(events(recovered).length, 0);
    const moved = okPair({ x: 0.04 });
    if (anonymous) moved.forEach(value => { delete value.id; });
    assert.equal(engine.update(moved, 680).events.length, 0);
    const spread = okPair({ x: 0.04, separation: 0.42 });
    if (anonymous) spread.forEach(value => { delete value.id; });
    assert.equal(engine.update(spread, 700).events[0]?.type, 'zoom');
  }
});

test('filtered separation below the safe minimum cancels instead of taking log2', () => {
  const engine = navigationEngine();
  const crossing = okPair();
  crossing.forEach((value, i) => {
    value.worldLandmarks = cameraView(value).worldLandmarks;
    // Each jump is below the tracking cap. Raw separation stays above .10,
    // while the old-to-new filters temporarily bring the pinches too close.
    for (const index of [4, 8]) value.landmarks[index].x += i === 0 ? 0.21 : -0.21;
  });
  const raw = crossing.map(value => classifyHand(value));
  assert.ok(raw.every(shape => shape.ok));
  assert.ok(Math.abs(raw[0].pinch.x - raw[1].pinch.x) >= 0.10);
  const cancelled = engine.update(crossing, 220);
  assert.equal(cancelled.mode, 'idle');
  assert.equal(cancelled.events.length, 0);
  const recovered = frames(engine, okPair(), 240, 660);
  assert.equal(recovered.at(-1).mode, 'navigate');
  assert.equal(events(recovered).length, 0);
});

test('a neutral second hand entering or leaving does not cancel a participating OK or restart its deadline', () => {
  const engine = pointedEngine();
  const anchor = frames(engine, [hand('ok')], 160, 420)[0].cursor;
  const entering = engine.update([hand('ok'), hand('neutral', { id: 'b', x: 0.25 })], 440);
  assert.equal(entering.mode, 'click-pending');
  assert.equal(entering.progress, 280 / 1500);
  assert.deepEqual(entering.cursor, anchor);
  const results = frames(engine, [hand('ok')], 460, 3800);
  results.push(engine.update([hand('point')], 3820));
  assert.deepEqual(clicks(results), [{ type: 'click', ...anchor }]);
});

test('exactly one valid OK selects its own track with an open, pointing, neutral, fist or invalid companion', () => {
  const extras = [hand('open', { id: 'b', x: -0.15 }), hand('point', { id: 'b', x: -0.15 }),
    hand('neutral', { id: 'b', x: -0.15 }), hand('fist', { id: 'b', x: -0.15 }),
    { ...hand('ok', { id: 'b', x: -0.15 }), worldLandmarks: [] }, { id: 'b', landmarks: [] }];
  for (const extra of extras) for (const first of [false, true]) {
    const actor = hand('ok', { x: 0.15 });
    const input = first ? [actor, extra] : [extra, actor];
    const engine = new GestureEngine();
    const pending = engine.update(input, 0);
    const actorPointer = pending.pointers.find(pointer => pointer.handIndex === (first ? 0 : 1));
    assert.equal(pending.mode, 'click-pending');
    assert.equal(pending.selectionHandId, actorPointer.id);
    assert.equal(pending.navigationKind, null);
    assert.equal(pending.selectionBlockedReason, null);
    assert.deepEqual(pending.selectionCursor, classifyHand(actor).pointer);
    assert.deepEqual({ x: actorPointer.x, y: actorPointer.y }, pending.selectionCursor);
    assert.equal(clicks(frames(engine, input, 20, 1480)).length, 0);
    assert.equal(engine.update(input, 1499).events.length, 0);
    assert.deepEqual(engine.update(input, 1500).events, [{ type: 'click', ...pending.selectionCursor }]);
    assert.equal(events(frames(engine, input, 1520, 2200)).length, 0);
  }
});

test('anonymous participant identity, target and deadline survive free-hand entry, exit, replacement and model order changes', () => {
  const actor = hand('ok', { x: -0.12 }); delete actor.id;
  const start = hand('point', { x: -0.12 }); delete start.id;
  const engine = new GestureEngine();
  const target = frames(engine, [start], 0, 200).at(-1).cursor;
  const pending = engine.update([actor], 220);
  const actorId = pending.selectionHandId;
  for (let time = 240; time <= 1700; time += 20) {
    const buddy = hand(time < 700 ? 'open' : time < 1200 ? 'fist' : 'neutral', { x: 0.30 });
    delete buddy.id;
    if (time >= 1400) buddy.worldLandmarks = [];
    const present = time >= 400 && time < 600 || time >= 700 && time < 1600;
    const input = present ? time % 40 ? [buddy, actor] : [actor, buddy] : [actor];
    const result = engine.update(input, time);
    assert.equal(result.mode, 'click-pending', `time=${time}`);
    assert.equal(result.selectionHandId, actorId);
    assert.equal(result.progress, (time - 220) / 1500);
    assert.deepEqual(result.selectionCursor, target);
    assert.equal(result.events.length, 0);
  }
  assert.deepEqual(engine.update([actor], 1720).events, [{ type: 'click', ...target }]);
  assert.equal(clicks(frames(engine, [actor], 1740, 2400)).length, 0);
});

test('either visible hand retains its own pre-closure target, including a free index beside a stationary panning fist', () => {
  for (const companion of ['point', 'open', 'fist']) for (const duration of [200, 600, 1000]) {
    const engine = new GestureEngine();
    const buddy = hand(companion, { id: 'a', x: -0.15 });
    const from = hand('point', { id: 'b', x: 0.15 }), to = hand('ok', { id: 'b', x: 0.15 });
    const warm = frames(engine, [buddy, from], 0, 200).at(-1);
    const target = warm.pointers.find(pointer => pointer.handIndex === 1);
    const hitTarget = { id: 'original', x: target.x * 1000, y: target.y * 1000, width: 44, height: 44 };
    let firstOK;
    const closure = [];
    for (let elapsed = 20; elapsed <= duration; elapsed += 20) {
      const result = engine.update([buddy, blendHand(from, to, elapsed / duration)], 200 + elapsed);
      if (result.mode === 'click-pending' && firstOK === undefined) firstOK = 200 + elapsed;
      closure.push(result);
    }
    assert.ok(firstOK, `${companion}, duration=${duration}`);
    assert.equal(events(closure).length, 0);
    const pending = closure.find(result => result.mode === 'click-pending');
    assert.equal(pending.selectionHandId, target.id);
    assert.equal(pending.progress, 0);
    // A quiet aim can incorporate the first filtered approach samples; it must
    // remain on the original target rather than follow the retracting fingertip.
    assert.ok(Math.hypot(pending.selectionCursor.x - target.x,
      pending.selectionCursor.y - target.y) <= 0.012);
    assert.equal(hoverTarget({ x: pending.selectionCursor.x * 1000,
      y: pending.selectionCursor.y * 1000 }, [hitTarget])?.id, 'original');
    assert.equal(clicks(frames(engine, [buddy, to], duration + 220, firstOK + 1480)).length, 0);
    assert.deepEqual(engine.update([buddy, to], firstOK + 1500).events,
      [{ type: 'click', ...pending.selectionCursor }]);
  }
});

test('changing the selection actor starts a fresh full dwell and cannot transfer the previous target or cooldown', () => {
  const engine = new GestureEngine();
  const aOK = hand('ok', { id: 'a', x: -0.15 }), bPoint = hand('point', { id: 'b', x: 0.15 });
  const first = frames(engine, [aOK, bPoint], 0, 600).at(-1);
  const bTarget = first.pointers.find(pointer => pointer.handIndex === 1);
  const aOpen = hand('open', { id: 'a', x: -0.15 }), bOK = hand('ok', { id: 'b', x: 0.15 });
  const second = engine.update([aOpen, bOK], 620);
  assert.equal(second.mode, 'click-pending');
  assert.equal(second.selectionHandId, bTarget.id);
  assert.equal(second.progress, 0);
  assert.equal(second.resetSelection, true);
  assert.deepEqual(second.selectionCursor, { x: bTarget.x, y: bTarget.y });
  assert.notDeepEqual(second.selectionCursor, first.selectionCursor);
  assert.equal(clicks(frames(engine, [aOpen, bOK], 640, 2100)).length, 0);
  assert.equal(engine.update([aOpen, bOK], 2119).events.length, 0);
  assert.equal(engine.update([aOpen, bOK], 2120).events.length, 1);
  const bOpen = hand('open', { id: 'b', x: 0.15 });
  const retryA = engine.update([aOK, bOpen], 2140);
  assert.equal(retryA.mode, 'click-pending', 'A already opened stably while B held its own OK');
  assert.equal(retryA.progress, 0);
  assert.notEqual(retryA.selectionHandId, second.selectionHandId);
  assert.equal(clicks(frames(engine, [aOK, bOpen], 2160, 3620)).length, 0);
  assert.equal(engine.update([aOK, bOpen], 3640).events.length, 1);
});

test('a blocked companion can rearm while the other hand stays in OK after zoom', () => {
  const engine = navigationEngine();
  const a = okPair()[0], bOpen = hand('open', { id: 'b', x: 0.15 });
  const opened = frames(engine, [a, bOpen], 220, 400);
  assert.ok(opened.every(result => result.mode === 'idle' && result.selectionBlockedReason === 'release-required'));
  assert.equal(events(opened).length, 0);
  const aOpen = hand('open', { id: 'a', x: -0.15 }), b = okPair()[1];
  const pending = engine.update([aOpen, b], 420);
  assert.equal(pending.mode, 'click-pending');
  assert.equal(pending.progress, 0);
  assert.equal(pending.selectionHandId, pending.pointers.find(pointer => pointer.handIndex === 1).id);
  assert.equal(clicks(frames(engine, [aOpen, b], 440, 1900)).length, 0);
  assert.equal(engine.update([aOpen, b], 1920).events.length, 1);
});

test('losing a participant does not block an already tracked other hand from starting its own selection', () => {
  const engine = new GestureEngine();
  const a = hand('ok', { id: 'a', x: -0.15 }), bPoint = hand('point', { id: 'b', x: 0.15 });
  const held = frames(engine, [a, bPoint], 0, 600).at(-1);
  const bId = held.pointers.find(pointer => pointer.handIndex === 1).id;
  const orphan = engine.update([bPoint], 620);
  assert.equal(orphan.selectionHandId, bId);
  assert.equal(orphan.events.length, 0);
  const b = hand('ok', { id: 'b', x: 0.15 });
  const pending = engine.update([b], 640);
  assert.equal(pending.mode, 'click-pending');
  assert.equal(pending.progress, 0);
  assert.deepEqual(pending.selectionCursor, orphan.selectionCursor);
  assert.equal(clicks(frames(engine, [b], 660, 2120)).length, 0);
  assert.equal(engine.update([b], 2140).events.length, 1);
});

test('pan acquisition and incremental movement depend on participants, not the raw count or identity of a free hand', () => {
  const engine = new GestureEngine();
  const control = new GestureEngine();
  const a = x => hand('fist', { id: 'a', x });
  const initial = frames(engine, [a(-0.15)], 0, 200).at(-1);
  frames(control, [a(-0.15)], 0, 200);
  const actorId = initial.navigationHandIds[0];
  const buddy = hand('open', { id: 'b', x: 0.25 });
  const entered = engine.update([buddy, a(-0.11)], 220);
  assert.deepEqual(entered.events, control.update([a(-0.11)], 220).events);
  assert.equal(entered.mode, 'navigate');
  assert.deepEqual(entered.navigationHandIds, [actorId]);
  assert.ok(entered.events.some(event => event.type === 'pan' && event.dx > 0));
  const discarded = engine.update([{ id: 'b', landmarks: [] }, a(-0.11)], 240);
  assert.deepEqual(discarded.events, control.update([a(-0.11)], 240).events);
  assert.equal(discarded.mode, 'navigate');
  assert.equal(discarded.pointers[0].handIndex, 1);
  assert.deepEqual(discarded.navigationHandIds, [actorId]);
  const left = engine.update([a(-0.07)], 260);
  assert.deepEqual(left.events, control.update([a(-0.07)], 260).events);
  assert.equal(left.mode, 'navigate');
  assert.ok(left.events.some(event => event.type === 'pan' && event.dx > 0));
  const newBuddy = hand('neutral', { id: 'free-replacement', x: 0.25 });
  const changed = engine.update([a(-0.07), newBuddy], 280);
  assert.equal(changed.mode, 'navigate');
  assert.deepEqual(changed.events, control.update([a(-0.07)], 280).events,
    'only the participant filter may contribute its remaining physical movement');
  assert.deepEqual(changed.navigationHandIds, [actorId]);
});

test('invalid geometry cancels only its actor and a different valid OK can select without inheriting time', () => {
  const engine = new GestureEngine();
  const a = hand('ok', { id: 'a', x: -0.15 }), bPoint = hand('point', { id: 'b', x: 0.15 });
  const previous = frames(engine, [a, bPoint], 0, 400).at(-1);
  const target = previous.pointers.find(pointer => pointer.handIndex === 1);
  const invalidA = { ...a, worldLandmarks: [] }, b = hand('ok', { id: 'b', x: 0.15 });
  const pending = engine.update([invalidA, b], 420);
  assert.equal(pending.mode, 'click-pending');
  assert.equal(pending.selectionHandId, target.id);
  assert.equal(pending.progress, 0);
  assert.equal(pending.selectionBlockedReason, null);
  assert.equal(pending.pointers.find(pointer => pointer.handIndex === 0).actionGeometryValid, false);
  assert.deepEqual(pending.selectionCursor, { x: target.x, y: target.y });
  assert.equal(clicks(frames(engine, [invalidA, b], 440, 1900)).length, 0);
  assert.deepEqual(engine.update([invalidA, b], 1920).events, [{ type: 'click', x: target.x, y: target.y }]);
});

test('two matched hysteretic OK hands cancel selection for zoom and never retain its anchored halo', () => {
  const engine = new GestureEngine();
  const aPoint = hand('point', { id: 'a', x: -0.15 }), bNeutral = hand('neutral', { id: 'b', x: 0.15 });
  const palmSize = classifyHand(bNeutral).palmSize;
  bNeutral.landmarks[4] = { x: bNeutral.landmarks[8].x - palmSize * 0.20,
    y: bNeutral.landmarks[8].y, z: 0 };
  assert.equal(classifyHand(bNeutral).pinched, true);
  assert.equal(classifyHand(bNeutral).ok, false);
  frames(engine, [aPoint, bNeutral], 0, 200);
  const a = hand('ok', { id: 'a', x: -0.15 });
  const pending = frames(engine, [a, bNeutral], 220, 400).at(-1);
  const b = hand('ok', { id: 'b', x: 0.15, pinchRatio: 0.35 });
  assert.equal(classifyHand(b).ok, false, 'entry threshold alone would not classify this frame');
  const zoomCandidate = engine.update([b, a], 420);
  assert.equal(zoomCandidate.mode, 'idle');
  assert.equal(zoomCandidate.navigationCandidateKind, 'zoom');
  assert.equal(zoomCandidate.selectionHandId, null);
  assert.equal(zoomCandidate.selectionCursor, null);
  assert.equal(zoomCandidate.events.length, 0);
  const aPointer = zoomCandidate.pointers.find(pointer => pointer.id === pending.selectionHandId);
  assert.deepEqual({ x: aPointer.x, y: aPointer.y }, classifyHand(a).pointer);
  assert.notDeepEqual({ x: aPointer.x, y: aPointer.y }, pending.selectionCursor);
  assert.equal(clicks(frames(engine, [b, a], 440, 600)).length, 0);
  const alone = frames(engine, [a], 620, 2400);
  assert.ok(alone.every(result => result.mode === 'idle' && result.selectionBlockedReason === 'release-required'));
  assert.equal(clicks(alone).length, 0);
});

test('frontal and side-on 3D OK reaches selection dwell and zoom acquisition without projected finger lengths', () => {
  for (const aspectRatio of [1, 16 / 9]) for (const world of [true, false]) {
    for (const [pitch, yaw, roll] of [[Math.PI / 2, 0, 0], [-Math.PI / 2, 0, 0],
      [0, Math.PI / 2, 0], [0, -Math.PI / 2, 0], [1.2, 0.7, 1.5]]) {
      const actor = cameraView('ok', { pitch, yaw, roll, aspectRatio, world });
      const shape = classifyHand(actor, { aspectRatio });
      assert.equal(shape.ok, true);
      assert.equal(shape.actionGeometryValid, true);
      assert.equal(shape.okGeometrySource, world ? 'world' : 'normalized-3d');
      const engine = new GestureEngine({ aspectRatio });
      const pending = engine.update([actor], 0);
      assert.equal(pending.mode, 'click-pending');
      assert.deepEqual(pending.selectionCursor, shape.pointer);
      assert.equal(clicks(frames(engine, [actor], 20, 1480)).length, 0);
      assert.equal(engine.update([actor], 1499).events.length, 0);
      assert.deepEqual(engine.update([actor], 1500).events, [{ type: 'click', ...shape.pointer }]);
      assert.equal(events(frames(engine, [actor], 1520, 2000)).length, 0);

      const pair = [{ ...translatedImage(actor, -0.15), id: 'a' },
        { ...translatedImage(actor, 0.15), id: 'b' }];
      const zoom = new GestureEngine({ aspectRatio });
      const candidate = frames(zoom, pair, 0, 160);
      assert.ok(candidate.every(result => result.navigationCandidateKind === 'zoom'
        && result.selectionHandId === null && result.events.length === 0));
      const acquired = zoom.update(pair, 180);
      assert.equal(acquired.mode, 'navigate');
      assert.equal(acquired.navigationKind, 'zoom');
      assert.equal(acquired.selectionCursor, null);
      const wider = pair.map((value, index) => translatedImage(value, index ? 0.02 : -0.02));
      const moved = frames(zoom, wider, 200, 300);
      assert.ok(events(moved).some(event => event.type === 'zoom' && event.delta > 0));
      assert.ok(events(moved).every(event => event.type === 'zoom'));
    }
  }
});

test('an XY thumb-index overlap with positive depth separation cannot become a single or double OK action', () => {
  for (const world of [true, false]) {
    const raw = hand('ok');
    raw.landmarks[4] = { ...raw.landmarks[8], z: 0.10 };
    const value = cameraView(raw, { world });
    const shape = classifyHand(value);
    assert.equal(shape.actionGeometryValid, true);
    assert.equal(shape.ok, false);
    assert.equal(shape.pinched, false);
    assert.ok(shape.pinchRatio > 0.40);
    const single = frames(new GestureEngine(), [value], 0, 2000);
    assert.equal(events(single).length, 0);
    const second = { ...translatedImage(value, 0.20), id: 'b' };
    const pair = frames(new GestureEngine(), [value, second], 0, 2000);
    assert.equal(events(pair).length, 0);
    assert.ok(pair.every(result => result.mode !== 'navigate'));
  }
});

test('one moving palm, neutral, OK or pointing hand never pans or zooms', () => {
  for (const pose of ['open', 'neutral', 'ok', 'point']) {
    const engine = new GestureEngine();
    const results = [];
    for (let time = 0; time <= 600; time += 20) {
      results.push(engine.update([hand(pose, { x: time * 0.0001 })], time));
    }
    assert.ok(results.every(result => result.cursor), pose);
    assert.equal(events(results).length, 0, pose);
    assert.ok(results.every(result => result.mode !== 'navigate'), pose);
  }
});

test('one closed fist acquires pan after 180 ms in world or fallback front and top-down views', () => {
  for (const aspectRatio of [1, 16 / 9]) for (const world of [true, false]) {
    for (const [pitch, yaw] of [[0, 0], [Math.PI / 2, 0], [-Math.PI / 2, 0],
      [0, Math.PI / 2], [0, -Math.PI / 2]]) {
      const value = cameraView('fist', { pitch, yaw, aspectRatio, world });
      const engine = new GestureEngine({ aspectRatio });
      const candidate = frames(engine, [value], 0, 160);
      assert.ok(candidate.every(result => result.mode === 'idle' && result.pointers.length === 1));
      assert.ok(candidate.every(result => result.navigationCandidateKind === 'pan'
        && result.navigationHandIds.length === 0));
      assert.equal(engine.update([value], 179).mode, 'idle');
      const acquired = engine.update([value], 180);
      assert.equal(acquired.mode, 'navigate');
      assert.equal(acquired.navigationKind, 'pan');
      assert.equal(acquired.navigationCandidateKind, null);
      assert.deepEqual(acquired.navigationHandIds, [acquired.pointers[0].id]);
      assert.equal(acquired.events.length, 0);
      assert.deepEqual(acquired.cursor, classifyHand(value, { aspectRatio }).knuckles);
      const translated = translatedImage(value, 0.04 / aspectRatio, -0.02);
      const moved = frames(engine, [translated], 200, 320);
      assert.ok(events(moved).some(event => event.type === 'pan' && event.dx > 0 && event.dy < 0));
      assert.ok(events(moved).every(event => event.type === 'pan'));
      assert.ok(moved.every(result => result.mode === 'navigate' && result.navigationKind === 'pan'));
      assert.equal(clicks([...candidate, acquired, ...moved]).length, 0);
    }
  }
});

test('one-fist motion during acquisition establishes a new baseline instead of dragging on entry', () => {
  const engine = new GestureEngine();
  const acquisition = [];
  for (let time = 0; time <= 180; time += 20) {
    acquisition.push(engine.update([hand('fist', { x: time / 180 * 0.04 })], time));
  }
  assert.equal(events(acquisition).length, 0);
  assert.equal(acquisition.at(-1).mode, 'navigate');
  const moved = engine.update([hand('fist', { x: 0.08 })], 200);
  assert.ok(moved.events.some(event => event.type === 'pan' && event.dx > 0));
  assert.ok(moved.events.every(event => event.type === 'pan'));
});

test('opening a single fist clutches pan and a new fist needs another full acquisition', () => {
  const engine = new GestureEngine();
  frames(engine, [hand('fist')], 0, 200);
  assert.ok(engine.update([hand('fist', { x: 0.04 })], 220).events.length > 0);
  const opened = engine.update([hand('open', { x: 0.04 })], 240);
  assert.notEqual(opened.mode, 'navigate');
  assert.equal(opened.events.length, 0);
  frames(engine, [hand('open', { x: 0.04 })], 260, 380);
  const closed = hand('fist', { x: -0.02 });
  const acquisition = frames(engine, [closed], 400, 560);
  assert.ok(acquisition.every(result => result.mode === 'idle'));
  const acquired = engine.update([closed], 580);
  assert.equal(acquired.mode, 'navigate');
  assert.equal(events([...acquisition, acquired]).length, 0);
  assert.ok(engine.update([hand('fist', { x: 0.02 })], 600).events.some(event => event.type === 'pan'));
});

test('one-to-two and two-to-one fists reacquire with fresh baselines, including reordered or anonymous hands', () => {
  for (const anonymous of [false, true]) for (const keep of [0, 1]) {
    const pair = x => fistPair({ x }).map(value => {
      if (anonymous) delete value.id;
      return value;
    });
    const engine = new GestureEngine();
    frames(engine, [pair(0)[0]], 0, 200);
    assert.ok(engine.update([pair(0.04)[0]], 220).events.some(event => event.type === 'pan'));
    const two = pair(0.08).reverse();
    const enteringTwo = frames(engine, two, 240, 400);
    assert.ok(enteringTwo.every(result => result.mode === 'idle'));
    const acquiredTwo = engine.update(pair(0.08), 420);
    assert.equal(acquiredTwo.mode, 'navigate');
    assert.equal(events([...enteringTwo, acquiredTwo]).length, 0);
    assert.ok(engine.update(pair(0.12).reverse(), 440).events.some(event => event.type === 'pan'));
    const remaining = pair(0.16)[keep];
    const enteringOne = frames(engine, [remaining], 460, 620);
    assert.ok(enteringOne.every(result => result.mode === 'idle'));
    const acquiredOne = engine.update([remaining], 640);
    assert.equal(acquiredOne.mode, 'navigate');
    assert.equal(acquiredOne.navigationKind, 'pan');
    assert.equal(events([...enteringOne, acquiredOne]).length, 0);
    const moved = engine.update([pair(0.20)[keep]], 660);
    assert.ok(moved.events.some(event => event.type === 'pan' && event.dx > 0));
    assert.ok(moved.events.every(event => event.type === 'pan'));
    const ok = hand('ok', { id: anonymous ? undefined : keep ? 'b' : 'a',
      x: 0.20 + (keep ? 0.15 : -0.15) });
    if (anonymous) delete ok.id;
    const selection = frames(engine, [ok], 680, 2280);
    assert.equal(selection[0].mode, 'click-pending');
    assert.equal(selection[0].progress, 0, 'pan duration contributes no click dwell');
    assert.equal(clicks(selection).length, 1);
  }
});

test('single-fist pan and two-OK zoom switch only after acquiring the new hand-count and pose', () => {
  const engine = new GestureEngine();
  frames(engine, [hand('fist', { x: -0.15 })], 0, 200);
  const zoomAcquisition = frames(engine, okPair(), 220, 380);
  assert.ok(zoomAcquisition.every(result => result.mode === 'idle'));
  const zoom = engine.update(okPair(), 400);
  assert.equal(zoom.navigationKind, 'zoom');
  assert.equal(events([...zoomAcquisition, zoom]).length, 0);
  const scaling = engine.update(okPair({ separation: 0.40 }), 420);
  assert.ok(scaling.events.some(event => event.type === 'zoom'));
  assert.ok(scaling.events.every(event => event.type === 'zoom'));
  const single = hand('fist', { x: -0.20 });
  const panAcquisition = frames(engine, [single], 440, 600);
  assert.ok(panAcquisition.every(result => result.mode === 'idle'));
  const pan = engine.update([single], 620);
  assert.equal(pan.navigationKind, 'pan');
  assert.equal(events([...panAcquisition, pan]).length, 0);
  assert.ok(engine.update([hand('fist', { x: -0.16 })], 640).events.every(event => event.type === 'pan'));
});

test('single pan recovers from tracking, geometry, identity or timing interruptions without inheriting movement', () => {
  for (const reason of ['loss', 'geometry', 'identity', 'gap']) {
    const engine = new GestureEngine();
    frames(engine, [hand('fist')], 0, 200);
    assert.ok(engine.update([hand('fist', { x: 0.04 })], 220).events.length > 0);
    const replacement = reason === 'identity' ? 'new' : 'a';
    const returning = hand('fist', { id: replacement, x: 0.08 });
    let start = 240;
    if (reason === 'loss') { engine.update([], 240); start = 260; }
    if (reason === 'geometry') {
      const invalid = engine.update([{ ...returning, worldLandmarks: [] }], 240);
      assert.equal(invalid.selectionBlockedReason, 'invalid-geometry');
      start = 260;
    }
    if (reason === 'gap') start = 400;
    const acquisition = frames(engine, [returning], start, start + 160);
    assert.ok(acquisition.every(result => result.mode === 'idle'), reason);
    const acquired = engine.update([returning], start + 180);
    assert.equal(acquired.navigationKind, 'pan', reason);
    assert.equal(events([...acquisition, acquired]).length, 0, reason);
    const moved = engine.update([hand('fist', { id: replacement, x: 0.12 })], start + 200);
    assert.ok(moved.events.some(event => event.type === 'pan'), reason);
    assert.ok(moved.events.every(event => event.type === 'pan'), reason);
  }
});

test('a fist interrupting a pending or confirmed single OK pans but does not rearm its cancelled selection', () => {
  for (const confirmed of [false, true]) {
    const engine = pointedEngine();
    const until = confirmed ? 1660 : 600;
    const held = frames(engine, [hand('ok')], 160, until);
    assert.equal(clicks(held).length, confirmed ? 1 : 0);
    const start = until + 20;
    const panAcquisition = frames(engine, [hand('fist')], start, start + 180);
    assert.equal(panAcquisition.at(-1).navigationKind, 'pan');
    assert.equal(events(panAcquisition).length, 0);
    const moved = engine.update([hand('fist', { x: 0.04 })], start + 200);
    assert.ok(moved.events.some(event => event.type === 'pan'));
    const blocked = frames(engine, [hand('ok', { x: 0.04 })], start + 220, start + 1900);
    assert.ok(blocked.every(result => result.mode === 'idle' && result.selectionBlockedReason === 'release-required'));
    assert.equal(clicks(blocked).length, 0);
    frames(engine, [hand('open', { x: 0.04 })], start + 1920, start + 2060);
    const retry = frames(engine, [hand('ok', { x: 0.04 })], start + 2080, start + 3580);
    assert.equal(clicks(retry).length, 1);
  }
});

test('single-pan deltas exclude the smooth visual reference transition and keep jitter below the deadband', () => {
  const engine = new GestureEngine();
  const open = frames(engine, [hand('open')], 0, 200).at(-1);
  const curled = engine.update([hand('fist')], 220);
  assert.deepEqual(curled.pointers, open.pointers);
  const acquisition = frames(engine, [hand('fist')], 240, 400);
  assert.equal(acquisition.at(-1).navigationKind, 'pan');
  assert.equal(events(acquisition).length, 0, 'only the halo moves while the physical knuckles stay still');
  const moved = engine.update([hand('fist', { x: 0.02 })], 420);
  assert.ok(moved.cursor.y > acquisition.at(-1).cursor.y, 'visual reference is still converging');
  assert.ok(moved.events.some(event => event.type === 'pan' && event.dx > 0));
  assert.ok(moved.events.every(event => event.dy === 0), 'visual correction cannot contribute pan');
  const quiet = new GestureEngine();
  frames(quiet, [hand('fist')], 0, 200);
  const noise = [];
  for (let time = 220; time <= 800; time += 20) {
    noise.push(quiet.update([hand('fist', { x: time % 40 === 0 ? 0.0004 : -0.0004 })], time));
  }
  assert.ok(noise.every(result => result.navigationKind === 'pan'));
  assert.equal(events(noise).length, 0);
});

test('single-fist acquisition and exclusive pan are independent of 15, 30 or 60 FPS', () => {
  for (const fps of [15, 30, 60]) {
    const engine = new GestureEngine();
    const step = 1000 / fps;
    const initial = [];
    for (let frame = 0; frame <= Math.ceil(240 / step); frame++) {
      initial.push(engine.update([hand('fist')], frame * step));
    }
    const acquired = initial.findIndex(result => result.mode === 'navigate');
    assert.ok(acquired >= 0, `${fps} FPS`);
    assert.ok(acquired * step >= 180 && acquired * step < 180 + step, `${fps} FPS`);
    assert.equal(events(initial).length, 0);
    const startFrame = initial.length;
    const moved = [];
    for (let frame = startFrame; frame <= startFrame + 5; frame++) {
      moved.push(engine.update([hand('fist', { x: 0.04 })], frame * step));
    }
    assert.ok(events(moved).some(event => event.type === 'pan' && event.dx > 0), `${fps} FPS`);
    assert.ok(events(moved).every(event => event.type === 'pan'), `${fps} FPS`);
  }
});

test('initial single-fist pan cannot contribute navigation dwell to a subsequent 1500 ms single-OK selection', () => {
  const engine = new GestureEngine();
  frames(engine, [hand('fist')], 0, 200);
  assert.equal(engine.update([hand('fist', { x: 0.04 })], 220).navigationKind, 'pan');
  const closed = hand('ok', { x: 0.04 });
  const pending = engine.update([closed], 240);
  assert.equal(pending.mode, 'click-pending');
  assert.equal(pending.navigationKind, null);
  assert.equal(pending.navigationCandidateKind, null);
  assert.equal(pending.progress, 0);
  assert.equal(pending.selectionBlockedReason, null);
  assert.equal(clicks(frames(engine, [closed], 260, 1720)).length, 0);
  assert.equal(engine.update([closed], 1739).events.length, 0);
  assert.deepEqual(engine.update([closed], 1740).events, [{ type: 'click', ...pending.cursor }]);
  assert.equal(clicks(frames(engine, [closed], 1760, 2220)).length, 0);
});

test('two fists pan by common palm midpoint movement without changing zoom', () => {
  const engine = navigationEngine({}, 'fist');
  const results = frames(engine, fistPair({ x: 0.04, y: -0.02 }), 220, 340);
  const movements = events(results);
  assert.ok(movements.some(event => event.type === 'pan' && event.dx > 0 && event.dy < 0));
  assert.ok(movements.every(event => event.type === 'pan'));
  assert.equal(results.at(-1).mode, 'navigate');
  assert.equal(results.at(-1).navigationKind, 'pan');
});

test('two OK hands ignore common translation while retaining zoom mode', () => {
  const engine = navigationEngine();
  const results = frames(engine, okPair({ x: 0.06, y: -0.04 }), 220, 340);
  assert.equal(events(results).length, 0);
  assert.ok(results.every(result => result.mode === 'navigate' && result.navigationKind === 'zoom'));
});

test('fist separation never zooms; asymmetric motion only pans the palm midpoint', () => {
  const symmetric = navigationEngine({}, 'fist');
  assert.equal(events(frames(symmetric, fistPair({ separation: 0.42 }), 220, 340)).length, 0);
  const asymmetric = navigationEngine({}, 'fist');
  const pair = fistPair();
  pair[1] = hand('fist', { id: 'b', x: 0.23 });
  const results = frames(asymmetric, pair, 220, 340);
  assert.ok(events(results).some(event => event.type === 'pan' && event.dx > 0));
  assert.ok(events(results).every(event => event.type === 'pan'));
  assert.ok(results.every(result => result.navigationKind === 'pan'));
});

test('finger motion inside a closed fist cannot drag the map with a stationary palm', () => {
  const engine = navigationEngine({}, 'fist');
  const results = [];
  for (let time = 220; time <= 600; time += 20) {
    const pair = fistPair();
    for (const value of pair) value.landmarks[4].x += time % 40 ? 0.006 : -0.006;
    assert.ok(pair.every(value => classifyHand(value).fist));
    results.push(engine.update(pair, time));
  }
  assert.ok(results.every(result => result.mode === 'navigate' && result.navigationKind === 'pan'));
  assert.equal(events(results).length, 0);
});

test('navigation filters keep each hand identity through model order reversals', () => {
  for (const [pair, kind] of [[okPair, 'zoom'], [fistPair, 'pan']]) {
    for (const anonymous of [false, true]) {
      const engine = new GestureEngine();
      const results = [];
      for (let time = 0; time <= 800; time += 20) {
        const values = pair({ separation: 0.40 });
        if (anonymous) values.forEach(value => { delete value.id; });
        if (time % 40 === 0) values.reverse();
        const result = engine.update(values, time);
        if (time >= 180) assert.equal(result.navigationKind, kind);
        assert.equal(result.pointers.length, 2);
        results.push(result);
      }
      assert.equal(events(results).length, 0, `${kind}, anonymous=${anonymous}`);
    }
  }
});

test('symmetric separation zooms around the current midpoint without panning', () => {
  const engine = navigationEngine();
  const results = frames(engine, okPair({ separation: 0.42 }), 220, 340);
  assert.ok(events(results).length > 0);
  assert.ok(events(results).every(event => event.type === 'zoom' && event.delta > 0));
  for (const result of results) {
    for (const event of result.events) {
      assert.equal(event.x, result.cursor.x);
      assert.equal(event.y, result.cursor.y);
    }
  }
});

test('two OK hands translate and separate but only emit zoom at their current midpoint', () => {
  const engine = navigationEngine();
  const result = engine.update(okPair({ x: 0.06, y: 0.04, separation: 0.42 }), 220);
  assert.deepEqual(result.events.map(event => event.type), ['zoom']);
  const [zoom] = result.events;
  assert.ok(zoom.delta > 0);
  assert.equal(zoom.x, result.cursor.x);
  assert.equal(zoom.y, result.cursor.y);
});

test('two-hand poses without any fist or two OK hands never acquire navigation', () => {
  for (const poses of [['open', 'open'], ['neutral', 'neutral'], ['ok', 'open'], ['ok', 'point'],
    ['ok', 'neutral']]) {
    const engine = new GestureEngine();
    const results = [];
    for (let time = 0; time <= 600; time += 20) {
      results.push(engine.update(poses.map((pose, i) => hand(pose, {
        id: i === 0 ? 'a' : 'b', x: (i === 0 ? -0.15 : 0.15) + time * 0.0001,
      })), time));
    }
    assert.equal(events(results).length, 0, poses.join('/'));
    assert.ok(results.every(result => result.mode !== 'navigate'), poses.join('/'));
  }
});

test('one fist pans while a detected free hand stays open, points or rests without contributing', () => {
  for (const pose of ['open', 'point', 'neutral']) for (const reversed of [false, true]) {
    const engine = new GestureEngine();
    const pair = (fistX = -0.15, freeX = 0.15) => {
      const values = [hand('fist', { id: 'a', x: fistX }), hand(pose, { id: 'b', x: freeX })];
      return reversed ? values.reverse() : values;
    };
    const acquired = frames(engine, pair(), 0, 200).at(-1);
    const fistId = acquired.pointers[reversed ? 1 : 0].id;
    assert.equal(acquired.navigationKind, 'pan', pose);
    assert.equal(acquired.hands, 2);
    assert.equal(acquired.pointers.length, 2);
    assert.deepEqual(acquired.navigationHandIds, [fistId]);
    assert.deepEqual(acquired.cursor, classifyHand(hand('fist', { x: -0.15 })).knuckles);
    const freeMovement = frames(engine, pair(-0.15, 0.23), 220, 2200);
    assert.equal(events(freeMovement).length, 0, `${pose}: moving a free hand cannot pan, zoom or click`);
    assert.ok(freeMovement.every(result => result.navigationKind === 'pan'
      && result.navigationHandIds.length === 1 && result.navigationHandIds[0] === fistId));
    const moved = frames(engine, pair(-0.11, 0.23), 2220, 2300);
    assert.ok(events(moved).some(event => event.type === 'pan' && event.dx > 0));
    assert.ok(events(moved).every(event => event.type === 'pan'));
  }
});

test('pan reacquires when fist contributors change even though two tracked hands remain present', () => {
  const engine = new GestureEngine();
  const values = (aPose, bPose, aX = -0.15, bX = 0.15) => [
    hand(aPose, { id: 'a', x: aX }), hand(bPose, { id: 'b', x: bX }),
  ];
  const original = frames(engine, values('fist', 'open'), 0, 200).at(-1);
  const [aId, bId] = original.pointers.map(pointer => pointer.id);
  assert.deepEqual(original.navigationHandIds, [aId]);
  const replacement = values('open', 'fist');
  const replaceAcquisition = frames(engine, replacement, 220, 380);
  assert.ok(replaceAcquisition.every(result => result.mode === 'idle' && result.navigationCandidateKind === 'pan'
    && result.navigationHandIds.length === 0));
  const acquiredReplacement = engine.update(replacement.reverse(), 400);
  assert.deepEqual(acquiredReplacement.navigationHandIds, [bId]);
  assert.equal(events([...replaceAcquisition, acquiredReplacement]).length, 0);
  assert.ok(engine.update(values('open', 'fist', -0.15, 0.19), 420).events.some(event => event.type === 'pan'));
  const both = values('fist', 'fist', -0.15, 0.19);
  const addAcquisition = frames(engine, both, 440, 600);
  assert.ok(addAcquisition.every(result => result.mode === 'idle'));
  const acquiredBoth = engine.update(both, 620);
  assert.deepEqual(acquiredBoth.navigationHandIds, [aId, bId]);
  assert.equal(events([...addAcquisition, acquiredBoth]).length, 0);
  assert.ok(engine.update(values('fist', 'fist', -0.11, 0.23), 640).events.some(event => event.type === 'pan'));
  const remaining = values('open', 'fist', -0.11, 0.23);
  const removeAcquisition = frames(engine, remaining, 660, 820);
  assert.ok(removeAcquisition.every(result => result.mode === 'idle'));
  const acquiredRemaining = engine.update(remaining, 840);
  assert.deepEqual(acquiredRemaining.navigationHandIds, [bId]);
  assert.equal(events([...removeAcquisition, acquiredRemaining]).length, 0);
  const released = engine.update(values('open', 'open', -0.11, 0.23), 860);
  assert.equal(released.mode, 'idle');
  assert.equal(released.navigationKind, null);
  assert.deepEqual(released.navigationHandIds, []);
  const zoomAcquisition = frames(engine, values('ok', 'ok', -0.11, 0.23), 880, 1040);
  assert.ok(zoomAcquisition.every(result => result.mode === 'idle' && result.navigationCandidateKind === 'zoom'
    && result.navigationHandIds.length === 0));
  const zoom = engine.update(values('ok', 'ok', -0.11, 0.23), 1060);
  assert.equal(zoom.navigationKind, 'zoom');
  assert.deepEqual(zoom.navigationHandIds, [aId, bId]);
  assert.equal(events([...zoomAcquisition, zoom]).length, 0);
});

test('malformed geometry of a free hand does not stop or restart the valid participating fist', () => {
  const malformed = [
    { ...hand('open', { id: 'b', x: 0.15 }), worldLandmarks: [] },
    { id: 'b', landmarks: [] },
    { id: 'b', landmarks: Array.from({ length: 21 }, () => ({ x: NaN, y: 0.5, z: 0 })) },
  ];
  for (const invalid of malformed) {
    const engine = new GestureEngine();
    const pair = [hand('fist', { x: -0.15 }), hand('open', { id: 'b', x: 0.15 })];
    assert.equal(frames(engine, pair, 0, 200).at(-1).navigationKind, 'pan');
    const rejected = engine.update([pair[0], invalid], 220);
    assert.equal(rejected.mode, 'navigate');
    assert.equal(rejected.selectionBlockedReason, null);
    assert.deepEqual(rejected.navigationHandIds, [rejected.pointers[0].id]);
    assert.equal(rejected.events.length, 0);
    const recovery = frames(engine, pair, 240, 400);
    assert.ok(recovery.every(result => result.mode === 'navigate'));
    const acquired = engine.update(pair, 420);
    assert.equal(acquired.navigationKind, 'pan');
    assert.equal(events([...recovery, acquired]).length, 0);
    const moved = engine.update([hand('fist', { x: -0.11 }), pair[1]], 440);
    assert.ok(moved.events.some(event => event.type === 'pan'));
  }
});

test('opening either hand clutches navigation and reacquisition starts without jumps', () => {
  for (const openedIndex of [0, 1]) {
    const engine = navigationEngine();
    engine.update(okPair({ x: 0.04, separation: 0.36 }), 220);
    const released = okPair({ x: 0.04, separation: 0.36 });
    released[openedIndex] = hand('open', { id: openedIndex === 0 ? 'a' : 'b', x: openedIndex === 0 ? -0.14 : 0.22 });
    const clutch = engine.update(released, 240);
    assert.equal(clutch.mode, 'idle');
    assert.equal(clutch.events.length, 0);
    const repositioned = okPair({ x: -0.03, y: -0.03, separation: 0.24 });
    const readquire = frames(engine, repositioned, 260, 660);
    assert.equal(readquire.at(-1).mode, 'navigate');
    assert.equal(events(readquire).length, 0);
  }
});

test('a single hand cursor follows pose geometry without moving the map', () => {
  for (const [pose, key] of [['point', 'pointer'], ['ok', 'pointer'], ['open', 'pointer'],
    ['neutral', 'pointer'], ['fist', 'knuckles']]) {
    const engine = new GestureEngine();
    const value = hand(pose);
    const result = engine.update([value], 0);
    assert.deepEqual(result.cursor, classifyHand(value)[key]);
    assert.equal(result.events.length, 0);
    const moved = engine.update([hand(pose, { x: 0.02 })], 20);
    if (pose === 'ok') assert.deepEqual(moved.cursor, result.cursor);
    else assert.ok(moved.cursor.x > result.cursor.x);
    assert.equal(moved.events.length, 0);
  }
});

test('open, neutral, pointing and two OK hands track index tip 8 instead of palm or pinch', () => {
  for (const pose of ['open', 'neutral', 'point', 'ok']) {
    const engine = new GestureEngine();
    const pair = [hand(pose, { id: 'a', x: -0.15 }), hand(pose, { id: 'b', x: 0.15 })];
    const result = engine.update(pair, 0);
    for (let index = 0; index < 2; index++) {
      const shape = classifyHand(pair[index]);
      assert.deepEqual(pointerReference(shape), shape.pointer);
      assert.deepEqual({ x: result.pointers[index].x, y: result.pointers[index].y }, shape.pointer, pose);
      assert.notDeepEqual(shape.pointer, shape.center);
      assert.notDeepEqual(shape.pointer, shape.pinch);
    }
  }
});

test('knuckle and fingertip reference transitions have no first-frame jump and converge while still', () => {
  for (const count of [1, 2]) {
    const engine = new GestureEngine();
    const values = pose => Array.from({ length: count }, (_, index) => hand(pose,
      { id: index ? 'b' : 'a', x: count === 2 ? (index ? 0.15 : -0.15) : 0 }));
    const initial = frames(engine, values('open'), 0, 200).at(-1);
    const curled = engine.update(values('fist'), 220);
    assert.deepEqual(curled.pointers, initial.pointers);
    assert.equal(curled.events.length, 0);
    const closing = frames(engine, values('fist'), 240, 520);
    assert.equal(events(closing).length, 0);
    const closed = closing.at(-1);
    for (let index = 0; index < count; index++) {
      const shape = classifyHand(values('fist')[index]);
      assert.deepEqual({ x: closed.pointers[index].x, y: closed.pointers[index].y }, shape.knuckles);
      assert.deepEqual(pointerReference(shape), shape.knuckles);
      assert.notDeepEqual(shape.knuckles, shape.center, 'wrist is excluded from the visible knuckle reference');
    }
    const opened = engine.update(values('open'), 540);
    assert.deepEqual(opened.pointers, closed.pointers);
    let previous = opened;
    const opening = frames(engine, values('open'), 560, 840);
    for (const result of opening) {
      for (let index = 0; index < count; index++) {
        assert.ok(Math.hypot(result.pointers[index].x - previous.pointers[index].x,
          result.pointers[index].y - previous.pointers[index].y) < 0.022);
      }
      previous = result;
    }
    assert.equal(events(opening).length, 0);
    for (let index = 0; index < count; index++) {
      const point = classifyHand(values('open')[index]).pointer;
      assert.deepEqual({ x: previous.pointers[index].x, y: previous.pointers[index].y }, point);
    }
  }
});

test('two fist-to-OK shadows converge to both indices without causing acquisition or zoom jumps', () => {
  const engine = navigationEngine({}, 'fist');
  const prior = engine.update(fistPair(), 220);
  const change = engine.update(okPair(), 240);
  assert.deepEqual(change.pointers, prior.pointers);
  assert.equal(change.mode, 'idle');
  const transition = frames(engine, okPair(), 260, 540);
  assert.equal(events(transition).length, 0);
  assert.equal(transition.at(-1).navigationKind, 'zoom');
  for (let index = 0; index < 2; index++) {
    const pointer = classifyHand(okPair()[index]).pointer;
    assert.deepEqual({ x: transition.at(-1).pointers[index].x,
      y: transition.at(-1).pointers[index].y }, pointer);
  }
});

test('two OK hands discard a one-hand selection anchor and track both index tips without clicking', () => {
  const engine = new GestureEngine();
  const prior = engine.update([hand('open')], 0);
  const held = frames(engine, [hand('ok')], 20, 500);
  assert.deepEqual(held.at(-1).cursor, prior.cursor);
  const pair = [hand('ok'), hand('ok', { id: 'b', x: 0.30 })];
  const second = engine.update(pair, 520);
  assert.equal(second.mode, 'idle');
  assert.equal(second.events.length, 0);
  for (let index = 0; index < 2; index++) {
    const tip = classifyHand(pair[index]).pointer;
    assert.deepEqual({ x: second.pointers[index].x, y: second.pointers[index].y }, tip);
  }
  assert.notDeepEqual({ x: second.pointers[0].x, y: second.pointers[0].y }, prior.cursor);
  assert.equal(events(frames(engine, pair, 540, 2400)).length, 0);
  assert.equal(events(frames(engine, [pair[0]], 2420, 4300)).length, 0);
});

test('pointer reference transitions stay with each identity through input order swaps', () => {
  for (const anonymous of [false, true]) {
    const engine = new GestureEngine();
    const values = pose => (pose === 'fist' ? fistPair() : okPair()).map(value => {
      if (anonymous) delete value.id;
      return value;
    });
    const initial = frames(engine, values('fist'), 0, 200).at(-1);
    const transition = engine.update(values('ok'), 220);
    assert.deepEqual(transition.pointers, initial.pointers);
    const previous = new Map(transition.pointers.map(pointer => [pointer.id, pointer]));
    for (let time = 240; time <= 520; time += 20) {
      const pair = values('ok');
      if (time % 40 === 0) pair.reverse();
      const result = engine.update(pair, time);
      assert.equal(result.events.length, 0);
      for (const pointer of result.pointers) {
        const before = previous.get(pointer.id);
        assert.ok(before, 'each pointer keeps its own tracking identity');
        assert.ok(Math.hypot(pointer.x - before.x, pointer.y - before.y) < 0.022);
        previous.set(pointer.id, pointer);
      }
    }
    const final = engine.update(values('ok'), 540);
    for (let index = 0; index < 2; index++) {
      assert.equal(final.pointers[index].id, initial.pointers[index].id);
      const tip = classifyHand(values('ok')[index]).pointer;
      assert.deepEqual({ x: final.pointers[index].x, y: final.pointers[index].y }, tip);
    }
  }
});

test('a large legitimate curl into OK keeps its identity, previous index target and 1500 ms click', () => {
  for (const pose of ['open', 'point']) for (const scale of [1.1, 1.3]) {
    const engine = new GestureEngine();
    const before = engine.update([hand(pose, { scale })], 0);
    const held = frames(engine, [hand('ok', { scale })], 20, 1520);
    assert.ok(held.every(result => result.pointers[0].id === before.pointers[0].id));
    assert.ok(held.every(result => result.cursor.x === before.cursor.x && result.cursor.y === before.cursor.y));
    assert.deepEqual(clicks(held), [{ type: 'click', ...before.cursor }]);
    assert.equal(events(frames(engine, [hand('ok', { scale })], 1540, 3000)).length, 0);
  }
});

test('only moving an index in a resting hand moves its shadow and settles absolutely', () => {
  const engine = new GestureEngine();
  const resting = hand('neutral');
  const initial = engine.update([resting], 0);
  const moved = structuredClone(resting);
  moved.landmarks[8].x += 0.03;
  assert.deepEqual(classifyHand(moved).center, classifyHand(resting).center);
  const tracking = frames(engine, [moved], 20, 1000);
  assert.ok(tracking[0].cursor.x > initial.cursor.x);
  assert.ok(Math.abs(tracking.at(-1).cursor.x - moved.landmarks[8].x) < 1e-5);
  assert.ok(Math.abs(tracking.at(-1).cursor.y - moved.landmarks[8].y) < 1e-5);
  assert.equal(events(tracking).length, 0);
});

test('zoom uses index separation and midpoint, unaffected by thumb-only motion inside OK', () => {
  const engine = navigationEngine();
  const thumbs = okPair();
  thumbs[0].landmarks[4].x -= 0.016;
  thumbs[1].landmarks[4].x += 0.016;
  assert.ok(thumbs.every(value => classifyHand(value).ok));
  const thumbMotion = frames(engine, thumbs, 220, 500);
  assert.equal(events(thumbMotion).length, 0);
  const indices = thumbs.map((value, index) => translatedImage(value, index ? 0.03 : -0.03));
  const moved = engine.update(indices, 520);
  assert.equal(moved.navigationKind, 'zoom');
  assert.ok(moved.events.some(event => event.type === 'zoom' && event.delta > 0));
  const midpoint = { x: (indices[0].landmarks[8].x + indices[1].landmarks[8].x) / 2,
    y: (indices[0].landmarks[8].y + indices[1].landmarks[8].y) / 2 };
  for (const event of moved.events) {
    assert.equal(event.type, 'zoom');
    assert.ok(Math.hypot(event.x - midpoint.x, event.y - midpoint.y) < 1e-12);
  }
});

test('index outliers cannot bypass the pinch hysteresis continuity guard or create a zoom jump', () => {
  const engine = new GestureEngine();
  const pair = [hand('ok', { id: 'a', x: -0.15, scale: 2 }),
    hand('ok', { id: 'b', x: 0.15, scale: 2 })];
  const acquired = frames(engine, pair, 0, 200).at(-1);
  assert.equal(acquired.navigationKind, 'zoom');
  const outliers = structuredClone(pair);
  outliers.forEach((value, index) => {
    const sign = index ? -1 : 1;
    value.landmarks[8].x += sign * 0.24;
    value.landmarks[4].x += sign * 0.17;
    const original = classifyHand(pair[index]);
    const shape = classifyHand(value, undefined, true);
    assert.equal(shape.ok, true, 'continuing OK uses exit hysteresis');
    assert.ok(Math.hypot(shape.pinch.x - original.pinch.x, shape.pinch.y - original.pinch.y) < 0.22);
    assert.ok(Math.abs(shape.pointer.x - original.pointer.x) > 0.22);
  });
  const cancelled = engine.update(outliers, 220);
  assert.equal(cancelled.navigationKind, null);
  assert.equal(cancelled.events.length, 0);
  const recovered = frames(engine, pair, 240, 600);
  assert.equal(events(recovered).length, 0);
  assert.equal(recovered.at(-1).navigationKind, 'zoom');
});

test('each navigation mode needs 180 ms of two matching observed poses', () => {
  for (const [pair, kind] of [[okPair, 'zoom'], [fistPair, 'pan']]) {
    const engine = new GestureEngine();
    const initial = frames(engine, pair(), 0, 160);
    assert.equal(events(initial).length, 0);
    assert.ok(initial.every(result => result.mode === 'idle' && result.navigationKind === null));
    const before = engine.update(pair(), 179);
    assert.equal(before.mode, 'idle');
    const acquired = engine.update(pair(), 180);
    assert.equal(acquired.mode, 'navigate');
    assert.equal(acquired.navigationKind, kind);
    assert.equal(acquired.events.length, 0);
  }
});

test('resting two OK hands with small detector jitter do not move the map', () => {
  const engine = new GestureEngine();
  let seed = 42;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const results = [];
  for (let time = 0; time <= 3000; time += 1000 / 30) {
    results.push(engine.update([hand('ok', { id: 'a', x: -0.15 + (random() - 0.5) * 0.004,
      y: (random() - 0.5) * 0.004 }), hand('ok', { id: 'b', x: 0.15 + (random() - 0.5) * 0.004,
      y: (random() - 0.5) * 0.004 })], time));
  }
  assert.equal(results.at(-1).mode, 'navigate');
  assert.equal(events(results).length, 0);
  const intentional = engine.update(okPair({ separation: 0.40 }), 3020);
  assert.equal(intentional.events[0]?.type, 'zoom');
});

test('sub-deadband intentional movements accumulate instead of being discarded', () => {
  const engine = navigationEngine({}, 'fist');
  const results = [];
  for (let time = 220; time <= 620; time += 20) {
    results.push(engine.update(fistPair({ x: (time - 200) * 0.00005 }), time));
  }
  const movement = events(results).filter(event => event.type === 'pan');
  assert.ok(movement.length > 0);
  assert.ok(movement.every(event => event.dx > 0));
  assert.ok(movement.reduce((sum, event) => sum + event.dx, 0) > 0.01);
});

test('the same timed interaction clicks once at 15, 30 and 60 FPS', () => {
  for (const fps of [15, 30, 60]) {
    const engine = new GestureEngine();
    const results = [];
    const step = 1000 / fps;
    let started, fired;
    for (let time = 0; time < 4600; time += step) {
      const pose = time < 200 ? 'open' : time < 4000 ? 'ok' : 'open';
      if (pose === 'ok' && started === undefined) started = time;
      const result = engine.update([hand(pose)], time);
      if (result.events.some(event => event.type === 'click')) fired = time;
      results.push(result);
    }
    assert.equal(clicks(results).length, 1, `FPS=${fps}`);
    assert.ok(fired - started >= 1500 && fired - started <= 1500 + step + 1e-8, `duration FPS=${fps}`);
  }
});

test('two-hand acquisition and exclusive motion work at 15, 30 and 60 FPS', () => {
  for (const fps of [15, 30, 60]) {
    for (const [pair, kind] of [[fistPair, 'pan'], [okPair, 'zoom']]) {
    const engine = new GestureEngine();
    const step = 1000 / fps;
    const results = [];
    let acquiredAt;
    for (let time = 0; time <= 900; time += step) {
      const movement = Math.max(0, Math.min(1, (time - 400) / 300));
      const result = engine.update(pair({ x: movement * 0.06,
        y: movement * -0.03, separation: 0.30 + movement * 0.12 }), time);
      if (result.mode === 'navigate' && acquiredAt === undefined) acquiredAt = time;
      results.push(result);
    }
    assert.ok(acquiredAt >= 180 && acquiredAt <= 180 + step, `FPS=${fps}`);
    assert.ok(events(results).some(event => event.type === kind), `${kind} FPS=${fps}`);
    assert.ok(events(results).every(event => event.type === kind), `exclusive ${kind} FPS=${fps}`);
    assert.equal(clicks(results).length, 0, `click FPS=${fps}`);
    }
  }
});

test('occlusion cancels navigation; returning with both OK or one OK never jumps or clicks', () => {
  const engine = navigationEngine();
  engine.update(okPair({ x: 0.04, separation: 0.40 }), 220);
  const lost = engine.update([], 240);
  assert.equal(lost.cursor, null);
  assert.equal(lost.events.length, 0);
  const repositioned = okPair({ x: -0.04, y: -0.03, separation: 0.24 });
  const returning = frames(engine, repositioned, 260, 660);
  assert.equal(returning.at(-1).mode, 'navigate');
  assert.equal(events(returning).length, 0);
  const one = frames(engine, [repositioned[0]], 680, 940);
  one.push(engine.update([hand('point', { x: -0.16, y: -0.03 })], 960));
  assert.equal(events(one).length, 0);
  assert.ok(one.every(result => result.cursor));
});

test('identity replacement cannot inherit dwell or create a pan jump', () => {
  const engine = pointedEngine();
  frames(engine, [hand('ok')], 160, 420);
  const results = frames(engine, [hand('ok', { id: 'new' })], 440, 3800);
  results.push(engine.update([hand('point', { id: 'new' })], 3820));
  assert.equal(clicks(results).length, 0);
  engine.reset();
  frames(engine, okPair(), 0, 200);
  const changed = okPair({ x: 0.04 });
  changed[0].id = 'new';
  assert.equal(engine.update(changed, 220).events.length, 0);
});

test('unlabelled hands match spatially; a large relocation cancels navigation', () => {
  const engine = new GestureEngine();
  const anonymousPair = options => fistPair(options).map(value => { delete value.id; return value; });
  frames(engine, anonymousPair(), 0, 200);
  assert.equal(engine.update(anonymousPair({ x: 0.02 }), 220).events[0]?.type, 'pan');
  assert.equal(engine.update(anonymousPair({ x: -0.3 }), 240).events.length, 0);
});

test('stable open release permits another hold, while a brief release does not repeat', () => {
  const engine = pointedEngine();
  const first = frames(engine, [hand('ok')], 160, 1660);
  assert.equal(clicks(first).length, 1);
  engine.update([hand('open')], 1680);
  const brief = frames(engine, [hand('ok')], 1700, 5000);
  assert.equal(clicks(brief).length, 0);
  frames(engine, [hand('open')], 5020, 5160);
  const second = frames(engine, [hand('ok')], 5180, 6680);
  assert.equal(clicks(second).length, 1);
});

test('One Euro smooths static jitter and follows intentional motion', () => {
  const filter = new OneEuroFilter();
  assert.equal(filter.update(0.5, 0), 0.5);
  const smoothed = filter.update(0.51, 16);
  assert.ok(smoothed > 0.5 && smoothed < 0.51);
  let value;
  for (let time = 32; time <= 320; time += 16) value = filter.update(0.7, time);
  assert.ok(value > 0.69);
  filter.reset();
  assert.equal(filter.update(0.2, 400), 0.2);
});

test('invalid timestamps reset the interpreter; three hands produce no events', () => {
  const engine = pointedEngine();
  frames(engine, [hand('ok')], 160, 400);
  assert.equal(engine.update([hand('point')], NaN).events.length, 0);
  assert.equal(engine.update([hand('open'), hand('open', { id: 'b' }), hand('open', { id: 'c' })], 420).events.length, 0);
  assert.throws(() => new GestureEngine({ pinchExit: 0.1 }), RangeError);
  assert.throws(() => new GestureEngine({ clickDwellMs: -1 }), TypeError);
});

test('two geometrically valid hands always have independent pointers with stable IDs', () => {
  const engine = new GestureEngine();
  const left = hand('open', { id: 'a', x: -0.15 });
  const right = hand('neutral', { id: 'b', x: 0.15 });
  const first = engine.update([left, right], 0);
  assert.equal(first.pointers.length, 2);
  assert.equal(first.navigationKind, null);
  assert.equal(first.events.length, 0);
  assert.ok(first.pointers[0].x < first.pointers[1].x);
  const reversed = engine.update([right, left], 20);
  assert.deepEqual(reversed.pointers.map(({ handIndex, ...pointer }) => pointer),
    [...first.pointers].reverse().map(({ handIndex, ...pointer }) => pointer));
  assert.deepEqual(reversed.pointers.map(pointer => pointer.handIndex), [0, 1]);
  const ok = frames(engine, okPair(), 40, 240).at(-1);
  assert.equal(ok.pointers.length, 2);
  assert.equal(ok.mode, 'navigate');
  assert.ok(ok.pointers[0].x < ok.cursor.x && ok.pointers[1].x > ok.cursor.x);
  assert.notDeepEqual(ok.pointers[0], ok.pointers[1]);
  assert.deepEqual(engine.update([], 260).pointers, []);
});

test('single pointer agrees with cursor throughout pose changes, hold and confirmation', () => {
  const engine = new GestureEngine();
  const results = frames(engine, [hand('open')], 0, 140);
  results.push(...frames(engine, [hand('ok')], 160, 3400));
  results.push(...frames(engine, [hand('point')], 3420, 3580));
  for (const result of results) {
    assert.equal(result.pointers.length, 1);
    assert.deepEqual({ x: result.pointers[0].x, y: result.pointers[0].y }, result.cursor);
  }
  assert.equal(clicks(results).length, 1);
});

test('pointer filtering reduces jitter for both non-eligible hands without action colors', () => {
  const engine = new GestureEngine();
  const raw = [], filtered = [];
  for (let frame = 0; frame < 160; frame++) {
    const jitter = (frame % 2 === 0 ? 1 : -1) * 0.003;
    const values = [hand('open', { id: 'a', x: -0.15 + jitter }),
      hand('neutral', { id: 'b', x: 0.15 - jitter })];
    const result = engine.update(values, frame * 20);
    assert.equal(result.pointers.length, 2);
    assert.equal(result.navigationKind, null);
    assert.equal(result.events.length, 0);
    if (frame > 20) { raw.push(classifyHand(values[0]).pointer.x); filtered.push(result.pointers[0].x); }
  }
  const range = values => Math.max(...values) - Math.min(...values);
  assert.ok(range(filtered) < range(raw) / 2);
});

test('acquired pan and zoom retain their action colors even while stationary', () => {
  const pan = navigationEngine({}, 'fist');
  assert.equal(pan.update(fistPair(), 220).navigationKind, 'pan');
  assert.equal(pan.update(fistPair({ x: 0.05 }), 240).navigationKind, 'pan');
  assert.equal(frames(pan, fistPair({ x: 0.05 }), 260, 1000).at(-1).navigationKind, 'pan');
  const zoom = navigationEngine();
  assert.equal(zoom.update(okPair({ separation: 0.44 }), 220).navigationKind, 'zoom');
  assert.equal(frames(zoom, okPair({ separation: 0.44 }), 240, 1000).at(-1).navigationKind, 'zoom');
  assert.equal(zoom.update([hand('open', { x: -0.15 }), hand('open', { id: 'b', x: 0.15 })], 1020).navigationKind, null);
});

test('changing pan to zoom or zoom to pan restarts dwell and discards old movement', () => {
  for (const [from, to, oldKind, kind] of [[fistPair, okPair, 'pan', 'zoom'], [okPair, fistPair, 'zoom', 'pan']]) {
    const engine = new GestureEngine();
    frames(engine, from(), 0, 200);
    const moving = engine.update(from({ x: 0.04, separation: 0.38 }), 220);
    assert.equal(moving.navigationKind, oldKind);
    assert.ok(moving.events.some(event => event.type === oldKind));
    const newPose = to({ x: -0.04, y: -0.02, separation: 0.24 });
    const first = engine.update(newPose, 240);
    assert.equal(first.mode, 'idle');
    assert.equal(first.progress, 0);
    assert.equal(first.navigationKind, null);
    assert.equal(first.events.length, 0);
    const acquisition = frames(engine, newPose, 260, 400);
    acquisition.push(engine.update(newPose, 419));
    assert.ok(acquisition.every(result => result.mode === 'idle' && result.events.length === 0));
    const acquired = engine.update(newPose, 420);
    assert.equal(acquired.mode, 'navigate');
    assert.equal(acquired.navigationKind, kind);
    assert.equal(acquired.events.length, 0);
    assert.equal(events(frames(engine, newPose, 440, 700)).length, 0);
    const intentional = engine.update(to({ x: 0.01, y: 0.02, separation: 0.34 }), 720);
    assert.ok(intentional.events.length > 0);
    assert.ok(intentional.events.every(event => event.type === kind));
    assert.equal(intentional.pointers.length, 2);
  }
});

test('small navigation jitter keeps the acquired pose color without any map events', () => {
  for (const [pair, pose, kind] of [[fistPair, 'fist', 'pan'], [okPair, 'ok', 'zoom']]) {
    const engine = navigationEngine({}, pose);
    for (let frame = 0; frame < 120; frame++) {
      const jitter = (frame % 2 === 0 ? 1 : -1) * 0.001;
      const result = engine.update(pair({ x: jitter, separation: 0.30 + jitter }), 220 + frame * 20);
      assert.equal(result.navigationKind, kind);
      assert.equal(result.events.length, 0);
      assert.equal(result.pointers.length, 2);
    }
  }
});

test('index tracking recovers absolute tip coordinates without a palm excursion', () => {
  const engine = new GestureEngine();
  const first = engine.update([hand('point')], 0);
  const changed = engine.update([hand('neutral')], 20);
  assert.ok(changed.cursor.y > first.cursor.y && changed.cursor.y < hand('neutral').landmarks[8].y);
  let previous = changed.cursor;
  for (let step = 1; step <= 20; step++) {
    const result = engine.update([hand('neutral', { x: step * 0.01 })], 20 + step * 20);
    assert.ok(Math.hypot(result.cursor.x - previous.x, result.cursor.y - previous.y) < 0.055);
    previous = result.cursor;
  }
  const final = frames(engine, [hand('neutral', { x: 0.20 })], 440, 1000).at(-1);
  const absolute = classifyHand(hand('neutral', { x: 0.20 })).pointer;
  assert.ok(Math.hypot(final.cursor.x - absolute.x, final.cursor.y - absolute.y) < 0.0001);
  assert.deepEqual({ x: final.pointers[0].x, y: final.pointers[0].y }, final.cursor);
});

test('short moves to every camera edge consume temporary knuckle offsets without rebounding', () => {
  const cases = [
    { axis: 'x', edge: 0, start: 0.10 }, { axis: 'x', edge: 1, start: 0.95 },
    { axis: 'y', edge: 0, start: 0.10 }, { axis: 'y', edge: 1, start: 0.95 },
  ];
  for (const value of cases) {
    const engine = new GestureEngine();
    const shift = { scale: 0.25,
      [value.axis]: value.start - pointerReference(classifyHand(hand('fist', { scale: 0.25 })))[value.axis] };
    const first = engine.update([hand('fist', shift)], 0);
    assert.ok(Math.abs(first.cursor[value.axis] - value.start) < 1e-12);
    const changed = engine.update([hand('point', shift)], 20);
    assert.deepEqual(changed.cursor, first.cursor);
    const raw = pointerReference(classifyHand(hand('point', shift)))[value.axis];
    const movement = value.edge === 0 ? Math.min(-0.005, -raw - 0.005) : Math.max(0.005, 1 - raw + 0.005);
    assert.ok(Math.abs(movement) < 0.135);
    const atEdge = hand('point', { ...shift, [value.axis]: shift[value.axis] + movement });
    const result = engine.update([atEdge], 40);
    assert.equal(result.cursor[value.axis], value.edge);
    assert.equal(result.pointers[0][value.axis], value.edge);
    assert.equal(engine.update([atEdge], 60).cursor[value.axis], value.edge);
    assert.equal(result.events.length, 0);
  }
});

test('a stationary OK at the image edge preserves the previous target for all 1.5 seconds', () => {
  const engine = new GestureEngine();
  const x = -classifyHand(hand('ok')).pointer.x;
  const target = engine.update([hand('open', { x })], 0).cursor;
  const results = frames(engine, [hand('ok', { x })], 20, 1520);
  assert.deepEqual(clicks(results), [{ type: 'click', ...target }]);
  assert.ok(results.every(result => result.cursor.x === target.x && result.pointers[0].x === target.x));
});

test('two-to-one keeps the remaining pointer coherent and still reaches the camera border', () => {
  const engine = navigationEngine();
  const pair = engine.update(okPair(), 220);
  const one = engine.update([okPair()[0]], 240);
  assert.deepEqual(one.pointers[0], pair.pointers[0]);
  assert.equal(one.mode, 'idle');
  let atEdge;
  for (let step = 1; step <= 44; step++) {
    atEdge = engine.update([hand('ok', { x: -0.15 - step * 0.01 })], 240 + step * 20);
    assert.equal(atEdge.events.length, 0);
  }
  assert.equal(atEdge.cursor.x, 0);
  assert.equal(atEdge.pointers[0].x, 0);
});
