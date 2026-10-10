import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classifyPointGeometry } from '../src/point-geometry.js';

// Independent articulated XYZ fixtures test classifier geometry, not physical
// MediaPipe accuracy, confidence, visibility or the quality of inferred depth.
const axes = ['x', 'y', 'z'];
const copy = points => points.map(point => ({ ...point }));
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

function pointPose() {
  const points = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  points[0] = { x: 0, y: 0, z: 0 };
  points[1] = { x: -0.028, y: 0.028, z: 0 };
  points[2] = { x: -0.034, y: 0.046, z: 0 };
  points[3] = { x: -0.021, y: 0.062, z: 0.005 };
  points[4] = { x: -0.003, y: 0.067, z: 0.005 };
  for (const [mcp, x, y] of [[5, -0.028, 0.073], [9, -0.010, 0.085],
    [13, 0.010, 0.080], [17, 0.030, 0.065]]) {
    points[mcp] = { x, y, z: 0 };
    setFinger(points, mcp, mcp === 5 ? [0, 0] : [110, 70]);
  }
  return points;
}

function transform(points, { pitch = 0, yaw = 0, roll = 0, scale = 1,
  mirror = 1, translate = { x: 0, y: 0, z: 0 } } = {}) {
  return points.map(point => {
    const px = point.x * mirror;
    const py = point.y * Math.cos(pitch) - point.z * Math.sin(pitch);
    const pz = point.y * Math.sin(pitch) + point.z * Math.cos(pitch);
    const yx = px * Math.cos(yaw) + pz * Math.sin(yaw);
    const yz = -px * Math.sin(yaw) + pz * Math.cos(yaw);
    return { x: (yx * Math.cos(roll) - py * Math.sin(roll)) * scale + translate.x,
      y: (yx * Math.sin(roll) + py * Math.cos(roll)) * scale + translate.y,
      z: yz * scale + translate.z };
  });
}

const rotations = [[0, 0, 0], [Math.PI / 2, 0, 0], [-Math.PI / 2, 0, 0],
  [0, Math.PI / 2, 0], [0, -Math.PI / 2, 0], [Math.PI, 0, 0], [1.1, -0.7, 1.9]];

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

test('only the index supplies positive extension while all four other fingers are retracted', () => {
  const result = classifyPointGeometry(pointPose());
  assert.equal(result.valid, true);
  assert.equal(result.point, true);
  assert.equal(result.indexExtended, true);
  assert.deepEqual(result.otherRetracted, [true, true, true]);
  assert.equal(result.thumbRetracted, true);
});

test('a natural slightly bent index remains extended without requiring perfectly straight joints', () => {
  const points = pointPose();
  setFinger(points, 5, [18, 10]);
  const result = classifyPointGeometry(points);
  assert.equal(result.point, true);
  assert.ok(result.fingers[0].pipAngle < 180);
  assert.ok(result.fingers[0].dipAngle < 180);
});

test('historical point with the compact fist thumb is an admissible smoke fixture', () => {
  const fixtures = JSON.parse(fs.readFileSync(new URL('./fixtures/selection-poses.json', import.meta.url), 'utf8')).poses;
  const points = copy(fixtures.point);
  for (let index = 1; index <= 4; index++) points[index] = { ...fixtures.fist[index] };
  assert.equal(classifyPointGeometry(points).point, true);
  assert.equal(classifyPointGeometry(fixtures.point).point, false, 'the original outward thumb is not index-only');
  assert.equal(classifyPointGeometry(fixtures.point).thumbRetracted, false);
  assert.equal(classifyPointGeometry(fixtures.point).thumb.extended, true);
});

test('frontal, overhead, back and side views preserve point under rigid rotation and metric scale', () => {
  const original = pointPose();
  for (const [pitch, yaw, roll] of rotations) {
    for (const scale of [0.001, 0.65, 1, 1.4, 1000]) {
      const result = classifyPointGeometry(transform(original, { pitch, yaw, roll, scale,
        translate: { x: scale * 3, y: scale * -2, z: scale * 4 } }));
      assert.equal(result.valid, true);
      assert.equal(result.point, true, `${pitch}/${yaw}/${roll}, scale=${scale}`);
    }
  }
});

test('left and right mirrored hands use the same anatomical rather than image-up criteria', () => {
  for (const [pitch, yaw, roll] of rotations) {
    for (const mirror of [-1, 1]) {
      assert.equal(classifyPointGeometry(transform(pointPose(), { pitch, yaw, roll, mirror })).point, true);
    }
  }
});

test('validated world and aspect-corrected fallback XYZ agree despite projected foreshortening', () => {
  for (const aspect of [1, 4 / 3, 16 / 9, 9 / 16]) {
    for (const [pitch, yaw, roll] of rotations) {
      const view = cameraCoordinates(transform(pointPose(), { pitch, yaw, roll }), aspect);
      const world = classifyPointGeometry(view.world);
      const fallback = classifyPointGeometry(view.normalizedMetric);
      assert.equal(world.point, true);
      assert.equal(fallback.point, true);
      assert.deepEqual(world.otherRetracted, fallback.otherRetracted);
      assert.ok(Math.abs(world.thumb.longitudinalRatio - fallback.thumb.longitudinalRatio) < 1e-10);
    }
  }
});

test('any additional extended middle, ring or pinky invalidates point in every view', () => {
  for (const [finger, mcp] of [[0, 9], [1, 13], [2, 17]]) {
    const points = pointPose();
    setFinger(points, mcp, [0, 0]);
    for (const [pitch, yaw, roll] of rotations) {
      const result = classifyPointGeometry(transform(points, { pitch, yaw, roll }));
      assert.equal(result.valid, true);
      assert.equal(result.indexExtended, true);
      assert.equal(result.otherRetracted[finger], false);
      assert.equal(result.point, false, `extra finger ${mcp}`);
    }
  }
});

test('an ambiguous partly bent extra finger is not silently treated as closed', () => {
  for (const mcp of [9, 13, 17]) {
    const points = pointPose();
    setFinger(points, mcp, [35, 25]);
    const result = classifyPointGeometry(points);
    assert.equal(result.valid, true);
    assert.equal(result.fingers[(mcp - 5) / 4].extended, false);
    assert.equal(result.fingers[(mcp - 5) / 4].folded, false);
    assert.equal(result.point, false);
  }
});

test('a malformed ring finger cannot hide positive middle-finger extension evidence', () => {
  const points = pointPose();
  setFinger(points, 9, [0, 0]);
  points[14] = { ...points[13] };
  for (const [pitch, yaw, roll] of rotations) {
    const result = classifyPointGeometry(transform(points, { pitch, yaw, roll }));
    assert.equal(result.valid, false);
    assert.equal(result.point, false);
    assert.equal(result.fingers[1].plausible, true);
    assert.equal(result.fingers[1].extended, true, 'positive extension remains available for contradiction veto');
    assert.equal(result.fingers[2].plausible, false);
    assert.equal(result.fingers[2].extended, false, 'a collapsed joint supplies no positive extension');
  }
});

test('thumb up is excluded even when the index remains extended and other fingers are closed', () => {
  const points = pointPose();
  points[2] = { x: -0.034, y: 0.058, z: 0 };
  points[3] = { x: -0.034, y: 0.083, z: 0 };
  points[4] = { x: -0.034, y: 0.108, z: 0 };
  for (const [pitch, yaw, roll] of rotations) {
    const result = classifyPointGeometry(transform(points, { pitch, yaw, roll }));
    assert.equal(result.valid, true);
    assert.equal(result.thumbRetracted, false);
    assert.equal(result.thumb.extended, true);
    assert.equal(result.point, false);
  }
});

test('a straight outward thumb cannot pass just because its short tip is near the palm', () => {
  const points = pointPose();
  points[1] = { x: -0.019, y: 0.046, z: 0 };
  points[2] = { x: -0.034, y: 0.046, z: 0 };
  points[3] = { x: -0.049, y: 0.046, z: 0 };
  points[4] = { x: -0.064, y: 0.046, z: 0 };
  const result = classifyPointGeometry(points);
  assert.equal(result.valid, true);
  assert.equal(result.thumb.compact, true, 'compactness alone is insufficient');
  assert.equal(result.thumbRetracted, false);
  assert.equal(result.thumb.extended, true);
  assert.equal(result.point, false);
});

test('another malformed finger cannot hide positive thumb extension, while a malformed thumb supplies none', () => {
  const points = pointPose();
  points[2] = { x: -0.034, y: 0.058, z: 0 };
  points[3] = { x: -0.034, y: 0.083, z: 0 };
  points[4] = { x: -0.034, y: 0.108, z: 0 };
  points[14] = { ...points[13] };
  for (const [pitch, yaw, roll] of rotations) {
    const result = classifyPointGeometry(transform(points, { pitch, yaw, roll }));
    assert.equal(result.valid, false);
    assert.equal(result.point, false);
    assert.equal(result.thumb.extended, true);
  }
  points[3] = { ...points[2] };
  const malformed = classifyPointGeometry(points);
  assert.equal(malformed.valid, false);
  assert.equal(malformed.point, false);
  assert.equal(malformed.thumb.plausible, false);
  assert.equal(malformed.thumb.extended, false);
  assert.equal(malformed.thumbRetracted, false);
});

test('a tucked thumb may have a straight IP when MCP flexion/adduction is positive', () => {
  const points = pointPose();
  points[3] = { x: -0.019, y: 0.061, z: 0.005 };
  points[4] = { x: -0.004, y: 0.076, z: 0.010 };
  const result = classifyPointGeometry(points);
  assert.ok(result.thumb.ipAngle > 179);
  assert.equal(result.thumb.adducted, true);
  assert.equal(result.thumbRetracted, true);
  assert.equal(result.point, true);
});

test('a naturally straight thumb adducted across the palm does not require an artificial joint bend', () => {
  const points = pointPose();
  for (const [index, x, y] of [[1, -0.055, 0.060], [2, -0.039, 0.064],
    [3, -0.023, 0.068], [4, -0.007, 0.072]]) points[index] = { x, y, z: 0 };
  const result = classifyPointGeometry(points);
  assert.ok(result.thumb.mcpAngle > 179);
  assert.ok(result.thumb.ipAngle > 179);
  assert.equal(result.thumb.flexed, false);
  assert.equal(result.thumb.adducted, true);
  assert.equal(result.thumb.extended, false);
  assert.equal(result.point, true);
});

test('fist, OK, V and open palm do not supply an index-only selection pose', () => {
  const fixtures = JSON.parse(fs.readFileSync(new URL('./fixtures/selection-poses.json', import.meta.url), 'utf8')).poses;
  const victory = pointPose();
  setFinger(victory, 9, [0, 0]);
  const palm = pointPose();
  for (const mcp of [5, 9, 13, 17]) setFinger(palm, mcp, [0, 0]);
  for (const points of [fixtures.fist, fixtures.ok, palm, victory]) {
    for (const [pitch, yaw, roll] of rotations) {
      assert.equal(classifyPointGeometry(transform(points, { pitch, yaw, roll })).point, false);
    }
  }
});

test('a curled index and a distal straight claw cannot establish selection', () => {
  const curled = pointPose();
  setFinger(curled, 5, [110, 70]);
  assert.equal(classifyPointGeometry(curled).point, false);
  const claw = pointPose();
  setFinger(claw, 9, [90, 0]);
  const result = classifyPointGeometry(claw);
  assert.equal(result.valid, true);
  assert.equal(result.otherRetracted[0], false);
  assert.equal(result.point, false);
});

test('a thumb extended in depth is not repaired by its projected overlap with the palm', () => {
  const points = pointPose();
  points[4] = { ...points[4], z: 0.050 };
  const result = classifyPointGeometry(points);
  assert.equal(result.valid, true);
  assert.equal(result.thumbRetracted, false);
  assert.equal(result.point, false);
});

test('invalid world-style arrays, missing inferred depth and collapsed joints fail closed', () => {
  for (const points of [null, [], pointPose().slice(0, 20),
    pointPose().map(point => ({ x: point.x, y: point.y })),
    pointPose().map((point, index) => index === 8 ? { ...point, z: NaN } : point),
    Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }))]) {
    const result = classifyPointGeometry(points);
    assert.equal(result.valid, false);
    assert.equal(result.point, false);
  }
  for (const index of [3, 6, 10, 14, 18]) {
    const points = pointPose();
    points[index] = { ...points[index - 1] };
    assert.equal(classifyPointGeometry(points).valid, false);
  }
});

test('joint outliers and finite-coordinate overflow cannot create plausible pointing anatomy', () => {
  for (const invalidPoint of [{ x: 4, y: -5, z: 6 }, { x: 1e308, y: 1e308, z: 1e308 }]) {
    const points = pointPose();
    points[9] = invalidPoint;
    assert.equal(classifyPointGeometry(points).valid, false);
    assert.equal(classifyPointGeometry(points).point, false);
  }
});

test('projected occlusion with no surviving depth does not invent positive closure', () => {
  const side = transform(pointPose(), { pitch: Math.PI / 2 });
  assert.equal(classifyPointGeometry(side).point, true);
  const flattened = side.map(point => ({ ...point, z: 0 }));
  assert.equal(classifyPointGeometry(flattened).point, false);
});

test('invalid threshold overrides fail closed and unrelated engine settings are ignored', () => {
  for (const options of [{ pointBoneMinRatio: 0 }, { pointBoneMaxRatio: 0.001 },
    { pointIndexPipMinAngle: NaN }, { pointIndexPipMinAngle: 181 },
    { pointFoldChainMaxRatio: 2 }, { pointThumbLongitudinalMaxRatio: 0.05 },
    { pointThumbAdductionMinRatio: -1 }]) {
    const result = classifyPointGeometry(pointPose(), options);
    assert.equal(result.valid, false);
    assert.equal(result.point, false);
  }
  assert.equal(classifyPointGeometry(pointPose(), { maxClickDrift: 0.15 }).point, true);
});
