import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraToMap } from '../src/mapping.js';

test('all four camera corners coincide with map corners despite legacy calibration', () => {
  for (const point of [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]) {
    assert.deepEqual(cameraToMap(point, {corners:[{x:.2,y:.2},{x:.8,y:.2},{x:.8,y:.8},{x:.2,y:.8}]}),point);
  }
});
test('landmarks slightly outside the camera are clamped to its map edge', () => {
  assert.deepEqual(cameraToMap({x:-.02,y:1.03}),{x:0,y:1});
  assert.deepEqual(cameraToMap({x:1.03,y:-.02}),{x:1,y:0});
});
test('orientation and mirroring preserve the complete camera extent', () => {
  assert.deepEqual(cameraToMap({x:0,y:0},{rotation:90}),{x:1,y:0});
  assert.deepEqual(cameraToMap({x:1,y:1},{rotation:90}),{x:0,y:1});
  assert.deepEqual(cameraToMap({x:0,y:1},{mirror:true}),{x:1,y:1});
  assert.deepEqual(cameraToMap({x:.2,y:.7},{rotation:180}),{x:.8,y:1-.7});
});
test('unknown or nonfinite positions cannot produce a cursor', () => {
  for(const point of [null,{x:NaN,y:.5},{x:.5,y:Infinity}])assert.equal(cameraToMap(point),null);
});
