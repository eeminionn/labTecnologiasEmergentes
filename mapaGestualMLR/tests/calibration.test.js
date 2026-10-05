import test from 'node:test';
import assert from 'node:assert/strict';
import { orientation, homography, project } from '../src/calibration.js';
test('proyecta una mesa oblicua a las cuatro esquinas de pantalla',()=>{
  const corners=[{x:.2,y:.1},{x:.8,y:.2},{x:.9,y:.9},{x:.1,y:.8}];
  const matrix=homography(corners), targets=[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
  corners.forEach((p,i)=>{const v=project(p,matrix);assert.ok(Math.abs(v.x-targets[i].x)<1e-9);assert.ok(Math.abs(v.y-targets[i].y)<1e-9);});
});
test('rechaza mesa cruzada o demasiado pequeña',()=>{
  assert.throws(()=>homography([{x:0,y:0},{x:1,y:1},{x:1,y:0},{x:0,y:1}]));
  assert.throws(()=>homography([{x:0,y:0},{x:.01,y:0},{x:.01,y:.01},{x:0,y:.01}]));
});
test('orientación rotada y reflejada conserva esquinas',()=>{
  assert.deepEqual(orientation({x:.2,y:.3},90,true),{x:.7,y:.8});
  assert.deepEqual(orientation({x:.2,y:.3},180),{x:.8,y:.7});
});
