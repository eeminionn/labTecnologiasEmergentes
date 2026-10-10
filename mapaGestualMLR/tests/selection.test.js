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
test('index dwell retains the acquired target within its wider hold region',()=>{
  const feedback=new SelectionFeedback();
  feedback.update({x:130,y:180},'point',[a,b],viewport);
  const pending=feedback.update({x:130,y:180},'click-pending',[a,b],viewport);
  assert.deepEqual(pending.point,{x:120,y:180});
  const later=feedback.update({x:174,y:225},'click-pending',[a,b],viewport);
  assert.deepEqual(later.point,pending.point);
  assert.equal(later.target.id,a.id);
  assert.deepEqual(feedback.update({x:174,y:225},'click-confirmed',[a,b],viewport).point,pending.point);
});
test('empty space never accumulates dwell or falls back to canvas center',()=>{
  const feedback=new SelectionFeedback();
  const empty=feedback.update({x:80,y:90},'click-pending',[],viewport);
  assert.deepEqual(empty.point,{x:80,y:90});
  assert.equal(empty.cancel,true);
  assert.equal(feedback.held,null);
  assert.equal(feedback.update(a,'click-pending',[a],viewport).cancel,false);
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

test('an acquired target wins while the index trembles over an overlapping neighbour',()=>{
  const feedback=new SelectionFeedback();
  feedback.update(a,'click-pending',[a,b],viewport);
  for(const point of [{x:144,y:180},{x:173,y:225},{x:66,y:130}]){
    const result=feedback.update(point,'click-pending',[a,b],viewport);
    assert.equal(result.cancel,false);
    assert.equal(result.target.id,a.id);
    assert.deepEqual(result.point,{x:a.x,y:a.y});
  }
});

test('leaving the fixed generous region cancels even if the halo stays anchored',()=>{
  for(const point of [{x:179,y:180},{x:120,y:239},{x:60,y:180}]){
    const feedback=new SelectionFeedback();
    feedback.update(a,'click-pending',[a,b],viewport);
    assert.equal(feedback.update(point,'click-pending',[a,b],viewport).cancel,true);
  }
});

test('the tolerance is fixed at acquisition rather than following successive small movements',()=>{
  const feedback=new SelectionFeedback();feedback.update(a,'click-pending',[a],viewport);
  for(let dx=10;dx<=50;dx+=10)assert.equal(feedback.update({...a,x:a.x+dx},'click-pending',[a],viewport).cancel,false);
  assert.equal(feedback.update({...a,x:a.x+60},'click-pending',[a],viewport).cancel,true);
});

test('leaving on the exact completion frame cannot click the stale target',()=>{
  const feedback=new SelectionFeedback();feedback.update(a,'click-pending',[a],viewport);
  assert.equal(feedback.update({...a,x:a.x+59},'click-confirmed',[a],viewport).cancel,true);
});

test('an aborted hold releases the old target before acquiring a new one',()=>{
  const feedback=new SelectionFeedback();feedback.update(a,'click-pending',[a,b],viewport);
  feedback.reset();
  const next=feedback.update(b,'click-pending',[a,b],viewport);
  assert.equal(next.target.id,b.id);
  assert.deepEqual(next.point,{x:b.x,y:b.y});
});

test('a wider popup retains its own original bounds plus the same tremor padding',()=>{
  const target={...a,width:120,height:40},feedback=new SelectionFeedback();
  feedback.update(target,'click-pending',[target],viewport);
  assert.equal(feedback.update({...target,x:target.x+95},'click-pending',[target],viewport).cancel,false);
  assert.equal(feedback.update({...target,x:target.x+97},'click-pending',[target],viewport).cancel,true);
});

test('the target query uses the retained region without moving it or accumulating dwell',()=>{
  const feedback=new SelectionFeedback();
  assert.equal(feedback.retainedTargetId(a,[a],viewport),null);
  assert.equal(feedback.held,null);
  feedback.update(a,'click-pending',[a,b],viewport);
  for(const dx of [10,20,30,40,50])assert.equal(feedback.retainedTargetId({...a,x:a.x+dx},[a,b],viewport),a.id);
  assert.deepEqual(feedback.held.point,{x:a.x,y:a.y});
  assert.equal(feedback.retainedTargetId({...a,x:a.x+59},[a,b],viewport),null);
});

test('an unfinished target query rejects stale geometry before the completion frame',()=>{
  const feedback=new SelectionFeedback();feedback.update(a,'click-pending',[a],viewport);
  for(const targets of [[],[{...a,x:a.x+9}],[{...a,x:NaN}]])assert.equal(feedback.retainedTargetId(a,targets,viewport),null);
  assert.equal(feedback.retainedTargetId(a,[a],{...viewport,width:901}),null);
});

test('confirmed target identity persists after its point disappears until the live index exits',()=>{
  const feedback=new SelectionFeedback();feedback.update(a,'click-pending',[a],viewport);
  feedback.update(a,'click-confirmed',[a],viewport);
  const replacement={...a,id:'new-popup-button',priority:1};
  assert.equal(feedback.retainedTargetId(a,[replacement],viewport),a.id);
  assert.equal(feedback.retainedTargetId({...a,x:a.x+59},[replacement],viewport),null);
  feedback.reset();
  assert.equal(feedback.retainedTargetId(a,[replacement],viewport),null);
  assert.equal(hoverTarget(a,[replacement]).id,replacement.id);
});
