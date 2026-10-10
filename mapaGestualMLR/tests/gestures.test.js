import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GestureEngine, OneEuroFilter, classifyHand, pointerReference } from '../src/gestures.js';

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
  if (pose === 'fist' || pose === 'point') {
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


function frames(engine, hands, from, until, step = 20, context = {}) {
  const results = [];
  for (let time = from; time <= until; time += step) results.push(engine.update(hands, time, context));
  return results;
}
const events = results => results.flatMap(result => result.events);
const clicks = results => events(results).filter(event => event.type === 'click');
const target = id => ({ selectionTargetForHand: () => id });
const leftTarget = { selectionTargetForHand: ({ pointer }) => pointer.x < 0.5 ? 'left' : null };
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
    if (pose === 'open') assert.equal(shape.open, true, 'image open feedback is preserved');
    if (pose === 'ok') assert.equal(shape.ok, false, 'a world fist cannot establish OK');
    assert.equal(shape.fist, false);
    assert.equal(shape.actionGeometryValid, false);
    const results = frames(new GestureEngine(), [value], 0, 2000);
    assert.equal(events(results).length, 0);
    assert.ok(results.every(result => result.cursor && result.pointers.length === 1));
  }
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

test('packaged fixtures distinguish index-only, historical thumb-out, OK and a fully closed fist', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/selection-poses.json', import.meta.url)));
  for (const [pose, field] of [['index', 'point'], ['ok', 'ok'], ['fist', 'fist']]) {
    const landmarks = fixture.poses[pose];
    assert.equal(landmarks.length, 21);
    assert.equal(classifyHand({ landmarks })[field], true, pose);
  }
  assert.equal(classifyHand({ landmarks: fixture.poses.point }).point, false, 'an outstretched thumb is not eligible');
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

test('a fist returning after its own invalid geometry reacquires pan without opening or inheriting motion', () => {
  for (const withCompanion of [false, true]) {
    const engine = new GestureEngine();
    const fist = hand('fist', { id: 'a', x: -0.17 });
    const buddy = hand('open', { id: 'b', x: 0.17 });
    const input = value => withCompanion ? [value, buddy] : [value];
    const acquired = frames(engine, input(fist), 0, 200).at(-1);
    engine.update(input({ ...fist, worldLandmarks: [] }), 220);
    const returning = translatedImage(fist, 0.04);
    const candidate = frames(engine, input(returning), 240, 400);
    assert.ok(candidate.every(result => result.navigationCandidateKind === 'pan'
      && result.mode === 'idle' && result.events.length === 0));
    assert.equal(engine.update(input(returning), 419).mode, 'idle');
    const reacquired = engine.update(input(returning), 420);
    assert.equal(reacquired.mode, 'navigate');
    assert.deepEqual(reacquired.navigationHandIds, acquired.navigationHandIds);
    assert.equal(reacquired.events.length, 0);
    const moved = engine.update(input(translatedImage(returning, 0.04)), 440);
    assert.ok(moved.events.some(event => event.type === 'pan' && event.dx > 0));
    assert.ok(moved.events.every(event => event.type === 'pan'));
  }
});

test('two matched hysteretic OK hands cancel selection for zoom and never retain its anchored halo', () => {
  const engine = new GestureEngine();
  const aPoint = hand('point', { id: 'a', x: -0.15 }), bNeutral = hand('neutral', { id: 'b', x: 0.15 });
  const palmSize = classifyHand(bNeutral).palmSize;
  bNeutral.landmarks[4] = { x: bNeutral.landmarks[8].x - palmSize * 0.20,
    y: bNeutral.landmarks[8].y, z: 0 };
  assert.equal(classifyHand(bNeutral).pinched, true);
  assert.equal(classifyHand(bNeutral).ok, false);
  frames(engine, [aPoint, bNeutral], 0, 200, 20, leftTarget);
  const a = hand('point', { id: 'a', x: -0.15 });
  const pending = frames(engine, [a, bNeutral], 220, 400, 20, leftTarget).at(-1);
  const b = hand('ok', { id: 'b', x: 0.15, pinchRatio: 0.35 });
  assert.equal(classifyHand(b).ok, false, 'entry threshold alone would not classify this frame');
  const aOK = hand('ok', { id: 'a', x: -0.15 });
  const zoomCandidate = engine.update([b, aOK], 420);
  assert.equal(zoomCandidate.mode, 'idle');
  assert.equal(zoomCandidate.navigationCandidateKind, 'zoom');
  assert.equal(zoomCandidate.selectionHandId, null);
  assert.equal(zoomCandidate.selectionCursor, null);
  assert.equal(zoomCandidate.events.length, 0);
  const aPointer = zoomCandidate.pointers.find(pointer => pointer.id === pending.selectionHandId);
  assert.deepEqual({ x: aPointer.x, y: aPointer.y }, classifyHand(aOK).pointer);
  assert.notDeepEqual({ x: aPointer.x, y: aPointer.y }, pending.selectionCursor);
  assert.equal(clicks(frames(engine, [b, aOK], 440, 600)).length, 0);
  const alone = frames(engine, [a], 620, 2400, 20, leftTarget);
  assert.ok(alone.every(result => result.mode === 'idle' && result.selectionBlockedReason === 'release-required'));
  assert.equal(clicks(alone).length, 0);
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
    const point = hand('point', { id: anonymous ? undefined : keep ? 'b' : 'a',
      x: 0.20 + (keep ? 0.15 : -0.15) });
    if (anonymous) delete point.id;
    const selection = frames(engine, [point], 680, 2280, 20, target('after-pan'));
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

test('one fist pans while a detected free hand stays open, in single OK or rests without contributing', () => {
  for (const pose of ['open', 'ok', 'neutral']) for (const reversed of [false, true]) {
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
    assert.ok(moved.cursor.x > result.cursor.x);
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
  const prior = engine.update([hand('point')], 0, target('selected'));
  const held = frames(engine, [hand('point')], 20, 500, 20, target('selected'));
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

test('unlabelled hands match spatially; a large relocation cancels navigation', () => {
  const engine = new GestureEngine();
  const anonymousPair = options => fistPair(options).map(value => { delete value.id; return value; });
  frames(engine, anonymousPair(), 0, 200);
  assert.equal(engine.update(anonymousPair({ x: 0.02 }), 220).events[0]?.type, 'pan');
  assert.equal(engine.update(anonymousPair({ x: -0.3 }), 240).events.length, 0);
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
  assert.ok(changed.cursor.y > first.cursor.y && changed.cursor.y < hand('neutral').landmarks[8].y,
    'without a target, the filtered index moves smoothly toward its new absolute position');
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
    const changed = engine.update([hand('open', shift)], 20);
    assert.deepEqual(changed.cursor, first.cursor);
    const raw = pointerReference(classifyHand(hand('open', shift)))[value.axis];
    const movement = value.edge === 0 ? Math.min(-0.005, -raw - 0.005) : Math.max(0.005, 1 - raw + 0.005);
    assert.ok(Math.abs(movement) < 0.135);
    const atEdge = hand('open', { ...shift, [value.axis]: shift[value.axis] + movement });
    const result = engine.update([atEdge], 40);
    assert.equal(result.cursor[value.axis], value.edge);
    assert.equal(result.pointers[0][value.axis], value.edge);
    assert.equal(engine.update([atEdge], 60).cursor[value.axis], value.edge);
    assert.equal(result.events.length, 0);
  }
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

test('selection is disabled without an explicit target hit test and starts fresh when one appears', () => {
  for (const pose of ['point', 'open', 'neutral', 'ok']) {
    const engine = new GestureEngine();
    const actor = hand(pose);
    const outside = frames(engine, [actor], 0, 2000);
    assert.equal(events(outside).length, 0);
    assert.ok(outside.every(result => result.selectionHandId === null && result.progress === 0));
    const empty = frames(engine, [actor], 2020, 2200, 20, target(null));
    assert.equal(events(empty).length, 0);
    const start = engine.update([actor], 2220, target('poi'));
    assert.equal(start.mode, 'click-pending');
    assert.equal(start.progress, 0);
    assert.equal(start.selectionTargetId, 'poi');
    assert.equal(clicks(frames(engine, [actor], 2240, 3700, 20, target('poi'))).length, 0);
    assert.equal(clicks([engine.update([actor], 3720, target('poi'))]).length, 1);
  }
});

test('bad, absent or throwing hit tests cannot start or inherit a selection clock', () => {
  for (const context of [{}, null, { selectionTargetForHand: 'poi' }, target(''), target(0),
    target(undefined), target({ id: 'poi' }), { selectionTargetForHand: () => { throw Error('unavailable'); } }]) {
    const engine = new GestureEngine();
    const actor = hand('open');
    assert.equal(events(frames(engine, [actor], 0, 2000, 20, context)).length, 0);
    assert.equal(engine.update([actor], 2020, context).selectionTargetId, null);
    const started = engine.update([actor], 2040, target('poi'));
    assert.equal(started.mode, 'click-pending');
    assert.equal(started.progress, 0);
  }
  const engine = new GestureEngine(), actor = hand('open');
  frames(engine, [actor], 0, 1480, 20, target('poi'));
  const unavailable = engine.update([actor], 1500, {});
  assert.equal(unavailable.events.length, 0);
  assert.equal(unavailable.resetSelection, true);
  assert.equal(unavailable.selectionHandId, null);
  assert.equal(engine.update([actor], 1520, target('poi')).progress, 0);
});

test('a new target anchors the current raw index rather than previous filtered or palm coordinates', () => {
  const engine = new GestureEngine();
  frames(engine, [hand('open')], 0, 200);
  const moved = hand('neutral', { x: 0.08 });
  const raw = classifyHand(moved).pointer;
  const result = engine.update([moved], 220, target('poi'));
  assert.equal(result.mode, 'click-pending');
  assert.equal(result.progress, 0);
  assert.deepEqual(result.cursor, raw);
  assert.deepEqual(result.selectionCursor, raw);
  assert.deepEqual(result.selectionLiveCursor, raw);
  assert.deepEqual({ x: result.pointers[0].x, y: result.pointers[0].y }, raw);
  assert.notDeepEqual(result.cursor, classifyHand(moved).center);
});

test('hover confirms exactly at 1500 ms, never at 1499, and never repeats in its retained target', () => {
  const engine = new GestureEngine(), actor = hand('open');
  const start = engine.update([actor], 0, target('poi'));
  assert.equal(events(frames(engine, [actor], 20, 1480, 20, target('poi'))).length, 0);
  const before = engine.update([actor], 1499, target('poi'));
  assert.equal(before.mode, 'click-pending');
  assert.equal(before.progress, 1499 / 1500);
  assert.equal(before.events.length, 0);
  const confirmed = engine.update([actor], 1500, target('poi'));
  assert.equal(confirmed.mode, 'click-confirmed');
  assert.equal(confirmed.progress, 1);
  assert.deepEqual(confirmed.events, [{ type: 'click', ...start.cursor }]);
  const still = frames(engine, [actor], 1520, 6000, 20, target('poi'));
  assert.equal(events(still).length, 0);
  assert.ok(still.every(result => result.mode === 'click-confirmed' && result.selectionTargetId === 'poi'));
});

test('target dwell and one-click confirmation use elapsed time at 15, 30 and 60 FPS', () => {
  for (const fps of [15, 30, 60]) {
    const engine = new GestureEngine(), actor = hand('neutral');
    const results = [];
    let confirmedAt = null;
    for (let frame = 0; frame <= fps * 3; frame++) {
      const timestamp = frame * 1000 / fps;
      const result = engine.update([actor], timestamp, target('poi'));
      results.push(result);
      if (result.events.length) confirmedAt = timestamp;
      if (timestamp < 1500) assert.equal(result.events.length, 0);
    }
    assert.equal(clicks(results).length, 1);
    assert.ok(confirmedAt >= 1500 && confirmedAt < 1500 + 1000 / fps + 1e-9);
    assert.ok(results.filter(result => result.mode === 'click-confirmed').every(result => result.progress === 1));
  }
});

test('posture, thumb motion and unusable world fingers do not interrupt a usable index over its target', () => {
  const engine = new GestureEngine();
  const initial = hand('open');
  const raw = initial.landmarks[8];
  const start = engine.update([initial], 0, target('poi'));
  const results = [];
  for (let time = 20; time <= 1500; time += 20) {
    const pose = time < 300 ? 'neutral' : time < 600 ? 'point' : time < 900 ? 'ok' : 'open';
    const actor = hand(pose);
    actor.landmarks[8] = { ...raw };
    if (time >= 900) actor.landmarks[4].x += 0.30;
    if (time >= 700) actor.worldLandmarks = [];
    const result = engine.update([actor], time, target('poi'));
    results.push(result);
    assert.equal(result.selectionHandId, start.selectionHandId);
    assert.deepEqual(result.selectionCursor, start.selectionCursor);
    assert.deepEqual(result.selectionLiveCursor, { x: raw.x, y: raw.y });
    assert.equal(result.resetSelection, false);
    assert.equal(result.progress, time / 1500);
  }
  assert.equal(clicks(results).length, 1);
  assert.ok(results.every(result => result.navigationKind === null));
});

test('malformed or contradictory world fingers do not veto image-index hover but cannot navigate', () => {
  for (const worldLandmarks of [[], null, Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: NaN })),
    cameraView('fist').worldLandmarks]) {
    const actor = { ...hand('point'), worldLandmarks };
    const shape = classifyHand(actor);
    assert.equal(shape.selectionTrackingValid, true);
    assert.equal(shape.actionGeometryValid, false);
    const results = frames(new GestureEngine(), [actor], 0, 1800, 20, target('poi'));
    assert.equal(clicks(results).length, 1);
    assert.ok(events(results).every(event => event.type === 'click'));
  }
});

test('a positively closed image fist cannot hover-select when its world result is unusable', () => {
  const fist = { ...hand('fist'), worldLandmarks: [] };
  assert.equal(classifyHand(fist).fist, false, 'unusable world cannot enable navigation');
  assert.equal(classifyHand(fist).selectionTrackingValid, false, 'positive image closure still reserves the hand');
  const results = frames(new GestureEngine(), [fist], 0, 2000, 20, target('poi'));
  assert.equal(events(results).length, 0);
  assert.ok(results.every(result => result.selectionHandId === null && result.navigationKind === null));
  const engine = new GestureEngine();
  const pair = [fist, hand('open', { id: 'b', x: 0.20 })];
  const selected = frames(engine, pair, 0, 1500, 20, target('other'));
  assert.equal(clicks(selected).length, 1, 'the reserved invalid fist cannot veto its usable companion');
  assert.equal(selected[0].pointers.find(pointer => pointer.id === selected[0].selectionHandId).handIndex, 1);
});

test('the raw index must stay in frame while unrelated clipped fingers do not veto hovering', () => {
  const clippedOther = hand('open');
  clippedOther.landmarks[12].x = 1.05;
  assert.equal(classifyHand(clippedOther).selectionTrackingValid, true);
  assert.equal(clicks(frames(new GestureEngine(), [clippedOther], 0, 1500, 20, target('edge'))).length, 1);
  for (const [axis, outside] of [['x', -0.001], ['x', 1.001], ['y', -0.001], ['y', 1.001]]) {
    const value = hand('open');
    value.landmarks[8][axis] = outside;
    const calls = [];
    const context = { selectionTargetForHand: args => { calls.push(args); return 'edge'; } };
    const results = frames(new GestureEngine(), [value], 0, 1600, 20, context);
    assert.equal(events(results).length, 0);
    assert.ok(results.every(result => result.selectionHandId === null));
    assert.ok(calls.every(args => args.pointer[axis] === (outside < 0 ? 0 : 1)));
    assert.ok(results.every(result => result.pointers[0][axis] === (outside < 0 ? 0 : 1)));
  }
});

test('live-index jitter is bounded from its fixed origin and does not leak into the anchored click', () => {
  for (const aspectRatio of [1, 16 / 9]) {
    const engine = new GestureEngine({ aspectRatio });
    const actor = hand('open');
    const start = engine.update([actor], 0, target('poi'));
    const results = [];
    for (let time = 20; time <= 1500; time += 20) {
      const moved = hand('open', { x: Math.sin(time / 150) * 0.045, y: Math.cos(time / 190) * 0.03 });
      const result = engine.update([moved], time, target('poi'));
      results.push(result);
      assert.deepEqual(result.selectionCursor, start.selectionCursor);
      assert.deepEqual(result.selectionLiveCursor, classifyHand(moved, { aspectRatio }).pointer);
      assert.equal(result.selectionHandId, start.selectionHandId);
    }
    assert.ok(results.some(result => Math.abs(result.selectionLiveCursor.x - start.cursor.x) > 0.04));
    assert.deepEqual(clicks(results), [{ type: 'click', ...start.cursor }]);
  }
});

test('leaving the motor drift bound resets an unfinished hold softly with a new full timer', () => {
  const engine = new GestureEngine();
  engine.update([hand('open')], 0, target('poi'));
  const movement = [];
  for (let frame = 1; frame <= 8; frame++) {
    movement.push(engine.update([hand('open', { x: frame * 0.02 })], frame * 20, target('poi')));
  }
  assert.equal(events(movement).length, 0);
  assert.equal(movement.at(-1).mode, 'idle');
  assert.equal(movement.at(-1).resetSelection, true);
  const actor = hand('open', { x: 0.16 });
  const restart = engine.update([actor], 180, target('poi'));
  assert.equal(restart.mode, 'click-pending');
  assert.equal(restart.progress, 0);
  assert.equal(restart.selectionBlockedReason, null);
  assert.deepEqual(restart.selectionCursor, classifyHand(actor).pointer);
  assert.equal(clicks(frames(engine, [actor], 200, 1660, 20, target('poi'))).length, 0);
  assert.equal(clicks([engine.update([actor], 1680, target('poi'))]).length, 1);
  const confirmedMotion = frames(engine, [hand('open')], 1700, 2200, 20, target('poi'));
  assert.equal(events(confirmedMotion).length, 0);
  assert.ok(confirmedMotion.every(result => result.mode === 'click-confirmed'));
});

test('leaving at the deadline cancels before clicking, and coming back starts at zero without a pose release', () => {
  const engine = new GestureEngine(), actor = hand('open');
  frames(engine, [actor], 0, 1480, 20, target('poi'));
  const exited = engine.update([actor], 1500, target(null));
  assert.equal(exited.events.length, 0);
  assert.equal(exited.resetSelection, true);
  const restart = engine.update([actor], 1520, target('poi'));
  assert.equal(restart.mode, 'click-pending');
  assert.equal(restart.progress, 0);
  assert.equal(clicks(frames(engine, [actor], 1540, 3000, 20, target('poi'))).length, 0);
  assert.equal(clicks([engine.update([actor], 3020, target('poi'))]).length, 1);
});

test('changing target before confirmation discards old time and anchors the live index for the new target', () => {
  const engine = new GestureEngine(), actor = hand('open');
  const old = engine.update([actor], 0, target('a'));
  frames(engine, [actor], 20, 1000, 20, target('a'));
  const moved = hand('open', { x: 0.04 });
  const current = engine.update([moved], 1020, target('b'));
  assert.equal(current.mode, 'click-pending');
  assert.equal(current.progress, 0);
  assert.equal(current.resetSelection, true);
  assert.equal(current.selectionTargetId, 'b');
  assert.equal(current.selectionHandId, old.selectionHandId);
  assert.deepEqual(current.selectionCursor, classifyHand(moved).pointer);
  assert.notDeepEqual(current.selectionCursor, old.selectionCursor);
  assert.equal(clicks(frames(engine, [moved], 1040, 2500, 20, target('b'))).length, 0);
  assert.deepEqual(engine.update([moved], 2520, target('b')).events, [{ type: 'click', ...current.cursor }]);
});

test('confirmation inhibits only its own target and target exit rearms after 120 ms even over another target', () => {
  for (const exitDuration of [100, 120]) {
    const engine = new GestureEngine(), actor = hand('open');
    assert.equal(clicks(frames(engine, [actor], 0, 1500, 20, target('a'))).length, 1);
    const next = engine.update([actor], 1520, target('b'));
    assert.equal(next.mode, 'click-pending');
    assert.equal(next.progress, 0);
    assert.equal(next.selectionTargetId, 'b');
    const outside = frames(engine, [actor], 1540, 1520 + exitDuration, 20, target('b'));
    assert.equal(events(outside).length, 0);
    // At 1640 the old ID has been absent exactly 120 ms. At 1620 it has
    // been absent only 100 ms; returning prevents that old destination repeat.
    const returning = engine.update([actor], 1540 + exitDuration, target('a'));
    if (exitDuration === 100) {
      assert.equal(returning.mode, 'idle');
      assert.equal(returning.selectionBlockedReason, 'release-required');
      assert.equal(clicks(frames(engine, [actor], 1660, 3400, 20, target('a'))).length, 0);
    } else {
      assert.equal(returning.mode, 'click-pending');
      assert.equal(returning.progress, 0);
      assert.equal(returning.selectionBlockedReason, null);
      assert.equal(clicks(frames(engine, [actor], 1680, 3140, 20, target('a'))).length, 0);
      assert.equal(clicks([engine.update([actor], 3160, target('a'))]).length, 1);
    }
  }
});

test('a different target can complete immediately after confirmation without hiding the hand or changing posture', () => {
  const engine = new GestureEngine(), actor = hand('neutral');
  assert.equal(clicks(frames(engine, [actor], 0, 1500, 20, target('a'))).length, 1);
  const second = engine.update([actor], 1520, target('b'));
  assert.equal(second.progress, 0);
  const history = frames(engine, [actor], 1540, 3000, 20, target('b'));
  assert.equal(events(history).length, 0);
  assert.deepEqual(engine.update([actor], 3020, target('b')).events, [{ type: 'click', ...second.cursor }]);
});

test('soft target cancellation restarts dwell while hard cancellation blocks only the interrupted destination', () => {
  for (const hard of [false, true]) {
    const engine = new GestureEngine(), actor = hand('open');
    frames(engine, [actor], 0, 200, 20, target('a'));
    engine.cancelClick(hard);
    const result = engine.update([actor], 220, target('a'));
    assert.equal(result.resetSelection, true);
    assert.equal(result.events.length, 0);
    assert.equal(result.mode, hard ? 'idle' : 'click-pending');
    assert.equal(result.selectionBlockedReason, hard ? 'release-required' : null);
    const other = engine.update([actor], 240, target('b'));
    assert.equal(other.mode, 'click-pending');
    assert.equal(other.progress, 0);
    assert.equal(other.selectionBlockedReason, null);
    assert.equal(clicks(frames(engine, [actor], 260, 1720, 20, target('b'))).length, 0);
    assert.equal(clicks([engine.update([actor], 1740, target('b'))]).length, 1);
  }
});

test('safety cancellation without a known target requires 120 ms of null hit tests, not a posture change', () => {
  const engine = new GestureEngine(), actor = hand('open');
  frames(engine, [actor], 0, 200);
  engine.cancelClick(true);
  const blocked = frames(engine, [actor], 220, 500, 20, target('poi'));
  assert.ok(blocked.every(result => result.mode === 'idle' && result.selectionBlockedReason === 'release-required'));
  frames(engine, [actor], 520, 620, 20, target(null));
  assert.equal(engine.update([actor], 640, target('poi')).selectionBlockedReason, 'release-required');
  frames(engine, [actor], 660, 780, 20, target(null));
  const restart = engine.update([actor], 800, target('poi'));
  assert.equal(restart.mode, 'click-pending');
  assert.equal(restart.progress, 0);
  assert.equal(restart.selectionBlockedReason, null);
  assert.equal(clicks(frames(engine, [actor], 820, 2280, 20, target('poi'))).length, 0);
  assert.equal(clicks([engine.update([actor], 2300, target('poi'))]).length, 1);
});

test('loss, frame gaps, identity changes and real index outliers cannot inherit or retry the same target until exit', () => {
  for (const interruption of ['loss', 'gap', 'identity', 'index', 'malformed']) {
    const engine = new GestureEngine(), actor = hand('open');
    const start = engine.update([actor], 0, target('poi'));
    frames(engine, [actor], 20, 200, 20, target('poi'));
    let returningAt = 240, returning = actor;
    if (interruption === 'loss') engine.update([], 220, target('poi'));
    if (interruption === 'gap') returningAt = 380;
    if (interruption === 'identity') returning = hand('open', { id: 'replacement' });
    if (interruption === 'index') {
      returning = hand('open');
      returning.landmarks[8].x += 0.24;
    }
    if (interruption === 'malformed') {
      const broken = hand('open'); broken.landmarks[8].x = NaN;
      engine.update([broken], 220, target('poi'));
    }
    const returnResult = engine.update([returning], returningAt, target('poi'));
    assert.notEqual(returnResult.selectionHandId, start.selectionHandId, interruption);
    assert.equal(returnResult.mode, 'idle', interruption);
    assert.equal(returnResult.selectionBlockedReason, 'release-required', interruption);
    assert.equal(clicks(frames(engine, [returning], returningAt + 20, returningAt + 1800, 20, target('poi'))).length, 0);
    frames(engine, [returning], returningAt + 1820, returningAt + 1940, 20, target(null));
    const restartAt = returningAt + 1960;
    const restart = engine.update([returning], restartAt, target('poi'));
    assert.equal(restart.mode, 'click-pending', interruption);
    assert.equal(restart.progress, 0, interruption);
    assert.equal(clicks(frames(engine, [returning], restartAt + 20, restartAt + 1480, 20, target('poi'))).length, 0);
    assert.equal(clicks([engine.update([returning], restartAt + 1500, target('poi'))]).length, 1);
  }
});

test('two OK zoom cancels target hover and requires a null target interval before single-hand selection', () => {
  const engine = new GestureEngine(), actor = hand('open', { x: -0.15 });
  const hovered = frames(engine, [actor], 0, 200, 20, target('poi')).at(-1);
  const acquisition = frames(engine, okPair(), 220, 380, 20, target('poi'));
  assert.ok(acquisition.every(result => result.selectionHandId === null && result.navigationCandidateKind === 'zoom'));
  assert.equal(events(acquisition).length, 0);
  assert.equal(engine.update(okPair(), 400, target('poi')).navigationKind, 'zoom');
  const remaining = hand('open', { x: -0.15 });
  const blocked = frames(engine, [remaining], 420, 2200, 20, target('poi'));
  assert.ok(blocked.every(result => result.mode === 'idle' && result.selectionBlockedReason === 'release-required'));
  assert.equal(events(blocked).length, 0);
  assert.equal(blocked[0].selectionHandId, hovered.selectionHandId);
  frames(engine, [remaining], 2220, 2340, 20, target(null));
  const restart = engine.update([remaining], 2360, target('poi'));
  assert.equal(restart.mode, 'click-pending');
  assert.equal(restart.progress, 0);
  assert.equal(clicks(frames(engine, [remaining], 2380, 3840, 20, target('poi'))).length, 0);
  assert.equal(clicks([engine.update([remaining], 3860, target('poi'))]).length, 1);
});

test('a blocked target cannot occupy an idle selection turn but a confirmed owner keeps its retained region', () => {
  const a = hand('open', { id: 'a', x: -0.15 }), b = hand('neutral', { id: 'b', x: 0.15 });
  const bothTargets = { selectionTargetForHand: ({ pointer }) => pointer.x < 0.5 ? 'a' : 'b' };
  const engine = new GestureEngine();
  const first = frames(engine, [a], 0, 200, 20, bothTargets).at(-1);
  engine.cancelClick(true);
  const second = engine.update([b, a], 220, bothTargets);
  assert.equal(second.mode, 'click-pending');
  assert.equal(second.selectionTargetId, 'b');
  assert.notEqual(second.selectionHandId, first.selectionHandId);
  assert.equal(second.progress, 0);
  const before = frames(engine, [a, b], 240, 1700, 20, bothTargets);
  assert.equal(events(before).length, 0);
  const confirmed = engine.update([a, b], 1720, bothTargets);
  assert.equal(confirmed.mode, 'click-confirmed');
  assert.equal(confirmed.selectionTargetId, 'b');
  assert.equal(confirmed.events.length, 1);
  const retained = frames(engine, [a, b], 1740, 3000, 20, bothTargets);
  assert.ok(retained.every(result => result.selectionHandId === second.selectionHandId
    && result.selectionTargetId === 'b' && result.mode === 'click-confirmed'));
  assert.equal(events(retained).length, 0);
});
