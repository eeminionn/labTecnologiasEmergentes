import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyOkGeometry } from '../src/ok-geometry.js';
import { GestureEngine, classifyHand } from '../src/gestures.js';

// Independent kinematic fixtures: fixed bone lengths and explicit bends.
// They test geometry, not MediaPipe's accuracy or visibility under occlusion.
const axes = ['x', 'y', 'z'];
const copy = points => points.map(point => ({ ...point }));
const distance = (a, b) => Math.hypot(...axes.map(axis => a[axis] - b[axis]));
const radians = degrees => degrees * Math.PI / 180;

function setFinger(points, mcp, turns = [0, 0], lengths = [0.037, 0.026, 0.020]) {
  let direction = 0;
  for (let bone = 0; bone < 3; bone++) {
    if (bone > 0) direction += radians(turns[bone - 1]);
    const previous = points[mcp + bone];
    points[mcp + bone + 1] = { x: previous.x,
      y: previous.y + lengths[bone] * Math.cos(direction),
      z: previous.z + lengths[bone] * Math.sin(direction) };
  }
}

function pose(kind = 'ok', supportingTurns = [60, 50]) {
  const points = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  points[0] = { x: 0, y: 0, z: 0 };
  points[1] = { x: -0.025, y: 0.026, z: 0 };
  points[2] = { x: -0.041, y: 0.042, z: 0 };
  points[3] = { x: -0.042, y: 0.073, z: 0.008 };
  for (const [mcp, x, y] of [[5, -0.028, 0.073], [9, -0.010, 0.085],
    [13, 0.010, 0.080], [17, 0.030, 0.065]]) {
    points[mcp] = { x, y, z: 0 };
    const turns = kind === 'fist' ? [120, 90]
      : kind === 'neutral' ? [90, 40]
        : kind === 'point' && mcp !== 5 ? [120, 90]
          : kind === 'open' || kind === 'point' ? [0, 0]
            : mcp === 5 ? [105, 80] : supportingTurns;
    setFinger(points, mcp, turns);
  }
  points[4] = kind === 'ok' || kind === 'fist'
    ? { ...points[8], x: points[8].x - 0.012 }
    : { x: -0.067, y: 0.052, z: 0 };
  return points;
}

function transform(points, { pitch = 0, yaw = 0, roll = 0, scale = 1,
  translate = { x: 0, y: 0, z: 0 } } = {}) {
  return points.map(point => {
    const py = point.y * Math.cos(pitch) - point.z * Math.sin(pitch);
    const pz = point.y * Math.sin(pitch) + point.z * Math.cos(pitch);
    const yx = point.x * Math.cos(yaw) + pz * Math.sin(yaw);
    const yz = -point.x * Math.sin(yaw) + pz * Math.cos(yaw);
    return { x: (yx * Math.cos(roll) - py * Math.sin(roll)) * scale + translate.x,
      y: (yx * Math.sin(roll) + py * Math.cos(roll)) * scale + translate.y,
      z: yz * scale + translate.z };
  });
}

function cameraCoordinates(points, aspectRatio) {
  const image = points.map(point => ({ x: 0.5 + point.x / aspectRatio,
    y: 0.5 + point.y, z: (point.z - points[0].z) / aspectRatio }));
  const centroid = Object.fromEntries(axes.map(axis => [axis,
    points.reduce((sum, point) => sum + point[axis], 0) / points.length]));
  const world = points.map(point => Object.fromEntries(axes.map(axis => [axis, point[axis] - centroid[axis]])));
  const normalizedMetric = image.map(point => ({ x: point.x * aspectRatio,
    y: point.y, z: point.z * aspectRatio }));
  return { image, world, normalizedMetric };
}

test('OK accepts two positively supporting fingers with moderate bends', () => {
  const points = pose();
  setFinger(points, 17, [120, 90]);
  const result = classifyOkGeometry(points);
  assert.equal(result.valid, true);
  assert.equal(result.ok, true);
  assert.equal(result.otherSupporting, 2);
  assert.deepEqual(result.supporting, [true, true, false]);
  assert.ok(result.fingers[1].pipAngle < 155, 'does not require the previous nearly straight PIP');
  assert.ok(result.fingers[1].dipAngle < 145, 'does not require the previous nearly straight DIP');
});

test('rigid frontal/back/side rotations, metric units and translation preserve OK', () => {
  const original = pose();
  const baseline = classifyOkGeometry(original);
  for (const [pitch, yaw, roll] of [[0, 0, 0], [Math.PI / 2, 0, 0], [-Math.PI / 2, 0, 0],
    [0, Math.PI / 2, 0], [0, -Math.PI / 2, 0], [Math.PI, 0, 0], [1.1, -0.7, 1.9]]) {
    for (const scale of [0.001, 0.65, 1, 1.4, 1000]) {
      const result = classifyOkGeometry(transform(original, { pitch, yaw, roll, scale,
        translate: { x: scale * 3, y: scale * -2, z: scale * 4 } }));
      assert.equal(result.valid, true, `${pitch}/${yaw}/${roll}, scale=${scale}`);
      assert.equal(result.ok, true);
      assert.equal(result.otherSupporting, 3);
      assert.ok(Math.abs(result.pinchRatio - baseline.pinchRatio) < 1e-10);
    }
  }
});

test('world and aspect-corrected image XYZ give the same posture under foreshortening', () => {
  for (const aspect of [1, 4 / 3, 16 / 9, 9 / 16]) {
    for (const [pitch, yaw, roll] of [[Math.PI / 2, 0, 0], [0, Math.PI / 2, 0], [1.2, 0.8, 2.4]]) {
      const view = cameraCoordinates(transform(pose(), { pitch, yaw, roll }), aspect);
      const world = classifyOkGeometry(view.world);
      const fallback = classifyOkGeometry(view.normalizedMetric);
      assert.equal(world.ok, true);
      assert.equal(fallback.ok, true);
      assert.deepEqual(world.supporting, fallback.supporting);
      assert.ok(Math.abs(world.pinchRatio - fallback.pinchRatio) < 1e-12);
    }
  }
});

test('a single OK can hover a target in any view while two OK hands take exclusive zoom priority', () => {
  for (const world of [true, false]) for (const aspectRatio of [1, 16 / 9]) {
    for (const [pitch, yaw] of [[0, 0], [Math.PI / 2, 0], [-Math.PI / 2, 0], [0, Math.PI / 2]]) {
      const view = cameraCoordinates(transform(pose(), { pitch, yaw }), aspectRatio);
      const actor = { id: 'a', landmarks: view.image, ...(world ? { worldLandmarks: view.world } : {}) };
      const shape = classifyHand(actor, { aspectRatio });
      assert.equal(shape.ok, true);
      assert.equal(shape.point, false);
      const single = new GestureEngine({ aspectRatio });
      for (let time = 0; time <= 2200; time += 20) {
        const result = single.update([actor], time);
        assert.equal(result.events.length, 0);
        assert.ok(!result.mode.startsWith('click-'));
      }
      const hover = new GestureEngine({ aspectRatio });
      const context = { selectionTargetForHand: () => 'target' };
      const selected = [];
      for (let time = 0; time <= 2200; time += 20) selected.push(hover.update([actor], time, context));
      assert.equal(selected.flatMap(result => result.events).filter(event => event.type === 'click').length, 1);
      assert.equal(selected.at(-1).mode, 'click-confirmed');
      assert.deepEqual(selected[0].selectionCursor, { x: actor.landmarks[8].x, y: actor.landmarks[8].y });
      const pair = [-0.15, 0.15].map((x, index) => ({ ...actor, id: index ? 'b' : 'a',
        landmarks: actor.landmarks.map(p => ({ ...p, x: p.x + x })) }));
      const zoom = new GestureEngine({ aspectRatio });
      for (let time = 0; time < 180; time += 20) {
        const result = zoom.update(pair, time, context);
        assert.equal(result.navigationCandidateKind, 'zoom');
        assert.equal(result.events.length, 0);
      }
      const acquired = zoom.update(pair, 180, context);
      assert.equal(acquired.navigationKind, 'zoom');
      assert.equal(acquired.selectionHandId, null);
      assert.equal(acquired.selectionLiveCursor, null);
      const spread = pair.map((value, index) => ({ ...value,
        landmarks: value.landmarks.map(p => ({ ...p, x: p.x + (index ? 0.02 : -0.02) })) }));
      const result = zoom.update(spread, 200, context);
      assert.ok(result.events.some(event => event.type === 'zoom' && event.delta > 0));
      assert.ok(result.events.every(event => event.type === 'zoom'));
    }
  }
});

test('plausible thumb approach can close against a relatively straight index', () => {
  const points = pose('open');
  points[1] = { x: -0.024, y: 0.030, z: 0 };
  points[2] = { x: -0.043, y: 0.069, z: 0.010 };
  points[3] = { x: -0.035, y: 0.118, z: 0.008 };
  points[4] = { ...points[8], x: points[8].x - 0.005 };
  const result = classifyOkGeometry(points);
  assert.equal(result.valid, true);
  assert.equal(result.pinched, true);
  assert.equal(result.indexClosed, false);
  assert.equal(result.thumbOpposed, true);
  assert.equal(result.ok, true, 'does not impose a compulsory perfect index ring');
});

test('projected thumb-index overlap separated in depth is not a pinch', () => {
  const points = pose();
  points[4] = { ...points[8], z: points[8].z + 0.052 };
  assert.equal(points[4].x, points[8].x);
  assert.equal(points[4].y, points[8].y);
  for (const wasPinched of [false, true]) {
    const result = classifyOkGeometry(points, {}, wasPinched);
    assert.equal(result.valid, true);
    assert.equal(result.otherSupporting, 3);
    assert.equal(result.pinched, false);
    assert.equal(result.ok, false);
  }
});

test('gap hysteresis has distinct entry and release bounds without waiving posture', () => {
  const original = pose();
  const palm = classifyOkGeometry(original).palmSize;
  for (const [ratio, enter, release] of [[0.279, true, true], [0.281, false, true],
    [0.35, false, true], [0.399, false, true], [0.401, false, false]]) {
    const points = copy(original);
    points[4] = { ...points[8], x: points[8].x - ratio * palm };
    assert.equal(classifyOkGeometry(points).ok, enter, `entry ratio ${ratio}`);
    assert.equal(classifyOkGeometry(points, {}, true).ok, release, `release ratio ${ratio}`);
  }
  const fist = pose('fist');
  fist[4] = { ...fist[8], x: fist[8].x - 0.002 };
  assert.equal(classifyOkGeometry(fist, {}, true).pinched, true);
  assert.equal(classifyOkGeometry(fist, {}, true).ok, false);
});

test('fists, palms, pointing and resting hands do not establish OK under rotation', () => {
  for (const kind of ['fist', 'open', 'point', 'neutral']) {
    for (const [pitch, yaw, roll] of [[0, 0, 0], [Math.PI / 2, 0, 0],
      [0, -Math.PI / 2, 0], [1.4, 0.5, 2.1]]) {
      const result = classifyOkGeometry(transform(pose(kind), { pitch, yaw, roll }));
      assert.equal(result.valid, true, kind);
      assert.equal(result.ok, false, `${kind} ${pitch}/${yaw}/${roll}`);
    }
  }
});

test('thumb-index contact with two additional closed fingers is not OK', () => {
  const points = pose();
  setFinger(points, 13, [120, 90]);
  setFinger(points, 17, [120, 90]);
  const result = classifyOkGeometry(points);
  assert.equal(result.pinched, true);
  assert.equal(result.otherSupporting, 1);
  assert.equal(result.ok, false);
});

test('a claw with proximal ninety-degree bends cannot stand in for supporting fingers', () => {
  const points = pose('ok', [90, 0]);
  const result = classifyOkGeometry(points);
  assert.equal(result.valid, true);
  assert.equal(result.pinched, true);
  assert.equal(result.otherSupporting, 0);
  assert.equal(result.ok, false);
});

test('nearby outstretched tips outside the compact opposition area are insufficient', () => {
  const points = pose('open');
  setFinger(points, 5, [8, 0], [0.065, 0.060, 0.025]);
  points[2] = { x: -0.040, y: 0.086, z: 0 };
  points[3] = { x: -0.040, y: 0.153, z: 0.008 };
  points[4] = { ...points[8], x: points[8].x - 0.004 };
  const result = classifyOkGeometry(points);
  assert.equal(result.valid, true);
  assert.equal(result.pinched, true);
  assert.equal(result.otherSupporting, 3);
  assert.equal(result.indexClosed, false);
  assert.equal(result.thumbOpposed, false);
  assert.equal(result.ok, false);
});

test('non-finite, missing and collapsed inferred joints cannot supply positive evidence', () => {
  for (const broken of [null, [], pose().slice(0, 20),
    pose().map(point => ({ x: point.x, y: point.y })),
    pose().map((point, index) => index === 8 ? { ...point, z: NaN } : point)]) {
    const result = classifyOkGeometry(broken);
    assert.equal(result.valid, false);
    assert.equal(result.ok, false);
    assert.equal(result.pinched, false);
  }
  for (const index of [3, 6, 10, 14, 18]) {
    const points = pose();
    points[index] = { ...points[index - 1] };
    assert.equal(classifyOkGeometry(points).valid, false, `collapsed inferred bone at ${index}`);
    assert.equal(classifyOkGeometry(points).ok, false);
  }
  const collapsed = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  assert.equal(classifyOkGeometry(collapsed).valid, false);
});

test('a gross bone outlier or collinear palm is rejected rather than normalized into an OK', () => {
  const outlier = pose();
  outlier[11] = { x: 4, y: -5, z: 6 };
  assert.equal(classifyOkGeometry(outlier).valid, false);
  const overflow = pose();
  overflow[9] = { x: 1e308, y: 1e308, z: 1e308 };
  assert.equal(classifyOkGeometry(overflow).valid, false, 'finite inputs cannot overflow into a valid palm');
  const line = pose();
  for (const index of [0, 5, 17]) line[index] = { x: index * 0.001, y: 0, z: 0 };
  assert.equal(classifyOkGeometry(line).valid, false);
});

test('an unknown or invalid override cannot lower the safety of finite geometry checks', () => {
  for (const options of [{ pinchEnter: NaN }, { pinchExit: 0.20 }, { okBoneMinRatio: -1 },
    { okSupportingChainMinRatio: Infinity }, { okBoneMaxRatio: 0.001 }]) {
    const result = classifyOkGeometry(pose(), options);
    assert.equal(result.valid, false);
    assert.equal(result.ok, false);
  }
  assert.equal(classifyOkGeometry(pose(), { unrelatedRendererSetting: 100 }).ok, true);
});

test('synthetic occlusion cannot be repaired by inventing joint visibility', () => {
  const points = pose();
  // Flattening all depth while rotating side-on destroys genuine geometry.
  // With no usable XYZ evidence the classifier must not assume hidden bones.
  const side = transform(points, { pitch: Math.PI / 2 });
  const noDepth = side.map(point => ({ ...point, z: 0 }));
  assert.equal(classifyOkGeometry(noDepth).ok, false);
  assert.equal(classifyOkGeometry(side).ok, true);
  assert.ok(distance(side[9], side[10]) > 0);
});
