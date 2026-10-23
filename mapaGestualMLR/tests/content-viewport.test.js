import test from 'node:test';
import assert from 'node:assert/strict';
import { fitContentViewport, panContentViewport, zoomContentViewport } from '../src/content-viewport.js';

const landscape = () => fitContentViewport({ width: 1000, height: 600, imageWidth: 2400, imageHeight: 1500 });

test('fit displays a whole landscape page without cropping', () => {
  const view = landscape();
  assert.equal(view.scale, 1);
  assert.equal(view.imageWidth * view.fit, 960);
  assert.equal(view.imageHeight * view.fit, 600);
  assert.deepEqual({ x: view.x, y: view.y }, { x: 0, y: 0 });
});

test('zoom retains the selected location under the same anchor', () => {
  const before = landscape();
  const after = zoomContentViewport(before, 1, 650, 380);
  assert.equal(after.scale, 2);
  assert.equal(after.x, -150);
  assert.equal(after.y, -80);
  assert.equal((650 - 500 - after.x) / after.scale, 650 - 500);
  assert.equal((380 - 300 - after.y) / after.scale, 380 - 300);
});

test('pan cannot lose the graphic or reveal beyond its edge', () => {
  const zoomed = zoomContentViewport(landscape(), 1);
  const moved = panContentViewport(zoomed, 10000, -10000);
  assert.equal(moved.x, 460);
  assert.equal(moved.y, -300);
});

test('returning to full page resets offsets and never zooms below fit', () => {
  const moved = panContentViewport(zoomContentViewport(landscape(), 1), 120, 150);
  const fit = zoomContentViewport(moved, -10);
  assert.equal(fit.scale, 1);
  assert.equal(fit.x, 0);
  assert.equal(fit.y, 0);
});

test('portrait page and resized safe stage stay completely visible', () => {
  const view = fitContentViewport({ width: 600, height: 320, imageWidth: 2400, imageHeight: 1902 });
  assert.ok(view.imageWidth * view.fit <= view.width);
  assert.ok(view.imageHeight * view.fit <= view.height);
  assert.equal(view.y, 0);
  const zoomed = zoomContentViewport(view, 1);
  assert.equal(zoomed.scale, 2);
});
