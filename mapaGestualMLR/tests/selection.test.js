import test from 'node:test';
import assert from 'node:assert/strict';
import {hoverTarget,SelectionFeedback} from '../src/selection.js';
const viewport={width:900,height:600};
const a={id:'point-a',x:120,y:180,width:16,height:16};
const b={id:'point-b',x:144,y:180,width:16,height:16};
test('small visible points have a 44 px hit area and stable hover in overlaps',()=>{
  assert.equal(hoverTarget({x:141,y:180},[a])?.id,a.id);
  assert.equal(hoverTarget({x:144,y:180},[a]),null);
  assert.equal(hoverTarget({x:133,y:180},[a,b])?.id,b.id);
  assert.equal(hoverTarget({x:133,y:180},[a,b],a.id)?.id,a.id);
});
test('popup controls take priority over points behind them',()=>{
  const button={...a,id:'button',width:100,height:30,priority:1};
  assert.equal(hoverTarget({x:120,y:180},[a,button],a.id)?.id,button.id);
});
test('OK acquires the hovered point and locks it through progress and confirmation',()=>{
  const feedback=new SelectionFeedback();
  feedback.update({x:130,y:180},'point',[a,b],viewport);
  const pending=feedback.update({x:130,y:180},'click-pending',[a,b],viewport);
  assert.deepEqual(pending.point,{x:120,y:180});
  const later=feedback.update({x:450,y:300},'click-pending',[a,b],viewport);
  assert.deepEqual(later.point,pending.point);
  assert.equal(later.target.id,a.id);
  assert.deepEqual(feedback.update({x:450,y:300},'click-confirmed',[a,b],viewport).point,pending.point);
});
test('clicking an empty map area preserves that location and never uses canvas center',()=>{
  const feedback=new SelectionFeedback();
  assert.deepEqual(feedback.update({x:80,y:90},'click-pending',[],viewport).point,{x:80,y:90});
});
test('a disappearing or moving target and a resized viewport cancel an unfinished hold',()=>{
  for(const [targets,size] of [[[],viewport],[[{...a,x:150}],viewport],[[a],{...viewport,width:950}]]){
    const feedback=new SelectionFeedback();
    feedback.update(a,'click-pending',[a],viewport);
    assert.equal(feedback.update(a,'click-pending',targets,size).cancel,true);
  }
});
test('confirmation does not cancel when the popup changes layout; release frees target',()=>{
  const feedback=new SelectionFeedback();
  feedback.update(a,'click-pending',[a],viewport);
  feedback.update(a,'click-confirmed',[a],viewport);
  assert.equal(feedback.update(a,'click-confirmed',[],viewport).cancel,false);
  assert.deepEqual(feedback.update({x:400,y:200},'point',[a],viewport).point,{x:400,y:200});
});
test('a target disappearing on the exact completion frame cancels instead of clicking stale coordinates',()=>{
  const feedback=new SelectionFeedback();
  feedback.update(a,'click-pending',[a],viewport);
  assert.equal(feedback.update(a,'click-confirmed',[],viewport).cancel,true);
});
test('invalid coordinates of an acquired target cancel on the completion frame',()=>{
  for(const x of [NaN,Infinity]){
    const feedback=new SelectionFeedback();feedback.update(a,'click-pending',[a],viewport);
    assert.equal(feedback.update(a,'click-confirmed',[{...a,x}],viewport).cancel,true);
  }
});
test('browser viewport dimensions inherited from DOMRect do not cancel the hold',()=>{
  const rect=Object.create(viewport),feedback=new SelectionFeedback();
  assert.deepEqual({...rect},{});
  assert.equal(feedback.update(a,'click-pending',[a],rect).cancel,false);
  assert.equal(feedback.update(a,'click-pending',[a],rect).cancel,false);
  assert.equal(feedback.update(a,'click-confirmed',[a],rect).cancel,false);
});
