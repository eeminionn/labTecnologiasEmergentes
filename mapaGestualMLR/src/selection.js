// Acquire a visible target, then retain it inside a fixed, generous region.
// The live index is checked even while its halo and loading ring are anchored.
const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
export function hoverTarget(point,targets,previousId=null) {
  if(!finitePoint(point))return null;
  const candidates=targets.filter(target=>finitePoint(target)
    && Math.abs(point.x-target.x)<=Math.max(44,target.width||0)/2
    && Math.abs(point.y-target.y)<=Math.max(44,target.height||0)/2);
  // Popup buttons win over underlying map points. Retain the first hover in
  // overlapping areas until the pointer leaves it; do not flicker between POIs.
  const priority=Math.max(0,...candidates.map(t=>t.priority||0));
  const best=candidates.filter(t=>(t.priority||0)===priority);
  return best.find(t=>t.id===previousId)
    || best.sort((a,b)=>distance(point,a)-distance(point,b))[0] || null;
}

export class SelectionFeedback {
  constructor({holdPadding=36}={}){this.holdPadding=holdPadding;this.reset();}
  reset(){this.hoverId=null;this.held=null;}
  // Query the live index before the interpreter counts time. This does not
  // move the retained region, including after a click changes the popup/POI.
  retainedTargetId(point,targets,viewport) {
    const held=this.held;
    if(!held || !finitePoint(point)
      || viewport.width!==held.viewport.width || viewport.height!==held.viewport.height
      || Math.abs(point.x-held.point.x)>held.halfWidth
      || Math.abs(point.y-held.point.y)>held.halfHeight)return null;
    const target=targets.find(t=>t.id===held.targetId);
    if(!held.confirmed && (!finitePoint(target) || distance(target,held.point)>8))return null;
    return held.targetId;
  }
  update(point,mode,targets,viewport) {
    if(!finitePoint(point)){const cancel=!!this.held;this.reset();return {point:null,target:null,cancel};}
    const holding=mode==='click-pending' || mode==='click-confirmed';
    if(!holding){
      this.held=null;
      const target=hoverTarget(point,targets,this.hoverId);
      this.hoverId=target?.id||null;
      return {point,target,cancel:false};
    }
    if(!this.held){
      const target=hoverTarget(point,targets,this.hoverId);
      // No dwell may accumulate over empty space and finish immediately when
      // a target later appears underneath an already held index.
      if(!target)return {point:{...point},target:null,cancel:true};
      this.held={point:{x:target.x,y:target.y},targetId:target.id,
        halfWidth:Math.max(44,target.width||0)/2+this.holdPadding,
        halfHeight:Math.max(44,target.height||0)/2+this.holdPadding,
        viewport:{width:viewport.width,height:viewport.height},confirmed:false};
    }
    const held=this.held;
    const target=held.targetId?targets.find(t=>t.id===held.targetId):null;
    const cancel=!held.confirmed && (
      viewport.width!==held.viewport.width || viewport.height!==held.viewport.height
      || !finitePoint(target) || distance(target,held.point)>8
      || Math.abs(point.x-held.point.x)>held.halfWidth
      || Math.abs(point.y-held.point.y)>held.halfHeight);
    if(mode==='click-confirmed' && !cancel)held.confirmed=true;
    return {point:held.point,target:target||null,cancel:!!cancel};
  }
}
