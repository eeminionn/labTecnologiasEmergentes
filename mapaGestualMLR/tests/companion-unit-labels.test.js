import assert from 'node:assert/strict';
import test from 'node:test';
import { placeCompanionUnitNumber } from '../src/companion-unit-labels.js';

const frame = { width: 140, height: 110, halfWidth: 5, placed: [], resources: [], chrome: [], inside: () => true };
const rectangle = (left, top, right, bottom) => [
  { x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }
];

test('keeps a unit number anchored even when the polygon is too small for the text', () => {
  const point = placeCompanionUnitNumber([{ x: 50, y: 35 }], () => [], frame);
  assert.equal(point.x, 50);
  assert.equal(point.y, 35);
});

test('shows a unit that crosses the viewport but hides a fully offscreen or tangent unit', () => {
  const preferred = [{ x: -3, y: 30 }];
  const clipped = placeCompanionUnitNumber(preferred, () => [rectangle(-20, 25, 2, 40)], frame);
  assert.equal(clipped.x, 7);
  assert.equal(clipped.y, 32.5);
  assert.equal(placeCompanionUnitNumber(preferred, () => [rectangle(-20, 25, -2, 40)], frame), null);
  assert.equal(placeCompanionUnitNumber([], () => [rectangle(-20, 25, 0, 40)], frame), null);
});

test('moves an overlapping number a short distance without suppressing it', () => {
  const preferred = { x: 65, y: 35 };
  const placed = [{ ...preferred, halfWidth: 5, halfHeight: 7 }];
  const point = placeCompanionUnitNumber([preferred], () => [], { ...frame, placed });
  assert(point);
  assert(Math.abs(point.x - preferred.x) >= 12 || Math.abs(point.y - preferred.y) >= 16);
  assert(Math.hypot(point.x - preferred.x, point.y - preferred.y) <= 16);
});
