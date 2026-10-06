import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PointSequence } from '../src/sequence.js';
const ids=['point-0','point-1','point-2'];

test('sequence starts with only the first stable marker identity active',()=>{
  const sequence=new PointSequence(ids);
  assert.deepEqual(sequence.snapshot(),{activeIndex:0,completed:false,completedCount:0,total:3});
  assert.deepEqual(ids.map(id=>sequence.state(id)),['active','locked','locked']);
  assert.equal(sequence.activeId,'point-0');
});
test('native marker clicks must match the active id and cannot skip steps',()=>{
  const sequence=new PointSequence(ids);
  for(const id of ['point-2','point-1','popup-button',null,undefined,'unknown'])assert.equal(sequence.activate(id),false);
  assert.equal(sequence.activate('point-0'),true);
  assert.equal(sequence.activeIndex,1);
  assert.equal(sequence.activate('point-0'),false);
  assert.equal(sequence.activate('point-2'),false);
  assert.equal(sequence.activate('point-1'),true);
  assert.equal(sequence.activeId,'point-2');
});
test('the third marker completes the sequence and all later clicks are inert',()=>{
  const sequence=new PointSequence(ids);
  ids.forEach(id=>assert.equal(sequence.activate(id),true));
  assert.deepEqual(sequence.snapshot(),{activeIndex:null,completed:true,completedCount:3,total:3});
  assert.deepEqual(ids.map(id=>sequence.state(id)),['complete','complete','complete']);
  for(const id of ids)assert.equal(sequence.activate(id),false);
  assert.equal(sequence.activeId,null);
});
test('reset returns to the first point without changing marker identities',()=>{
  const sequence=new PointSequence(ids);
  ids.forEach(id=>sequence.activate(id));
  assert.deepEqual(sequence.reset(),{activeIndex:0,completed:false,completedCount:0,total:3});
  assert.equal(sequence.activeId,'point-0');
  assert.equal(sequence.state('unknown'),null);
  assert.deepEqual(sequence.ids,ids);
});
test('sequence snapshots cannot mutate the internal progress or input order',()=>{
  const input=[...ids],sequence=new PointSequence(input);
  input.reverse();
  const state=sequence.snapshot();state.completedCount=3;state.completed=true;
  assert.equal(sequence.activeId,'point-0');
  assert.equal(sequence.completedCount,0);
  assert.throws(()=>sequence.ids.reverse(),TypeError);
});
test('sequence rejects ambiguous, empty or duplicate marker identities',()=>{
  for(const input of [[],null,[''],['point-0','point-0'],[0,'point-1']])assert.throws(()=>new PointSequence(input),TypeError);
});

const boundary=JSON.parse(readFileSync(new URL('../assets/la-reina.geojson',import.meta.url),'utf8'));
test('packaged boundary identifies official La Reina and has a finite closed RFC 7946 ring',()=>{
  assert.equal(boundary.type,'FeatureCollection');
  assert.equal(boundary.features.length,1);
  const {properties,geometry}=boundary.features[0];
  assert.equal(properties.CUT_COM,'13113');
  assert.equal(properties.COMUNA,'La Reina');
  assert.equal(properties.original_crs,'EPSG:5360');
  assert.equal(properties.output_crs,'EPSG:4326');
  assert.equal(geometry.type,'Polygon');
  const ring=geometry.coordinates[0];
  assert.equal(ring.length,306);
  assert.deepEqual(ring[0],ring.at(-1));
  assert.ok(ring.every(([lng,lat])=>Number.isFinite(lng)&&Number.isFinite(lat)&&Math.abs(lng)<=180&&Math.abs(lat)<=90));
  const signedArea=ring.slice(0,-1).reduce((sum,[x,y],i)=>sum+x*ring[i+1][1]-ring[i+1][0]*y,0);
  assert.ok(signedArea>0,'exterior must be counterclockwise');
  assert.deepEqual(boundary.bbox,[Math.min(...ring.map(p=>p[0])),Math.min(...ring.map(p=>p[1])),Math.max(...ring.map(p=>p[0])),Math.max(...ring.map(p=>p[1]))]);
});
test('all three synthetic marker locations lie within the official commune ring',()=>{
  const ring=boundary.features[0].geometry.coordinates[0];
  const inside=([x,y])=>{
    let result=false;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const [xi,yi]=ring[i],[xj,yj]=ring[j];
      if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)result=!result;
    }
    return result;
  };
  for(const point of [[-70.5381,-33.4409],[-70.5321,-33.4453],[-70.5308,-33.4378]])assert.ok(inside(point));
});
