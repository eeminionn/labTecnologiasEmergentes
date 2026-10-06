// Desktop adaptation of stable hover/selection: hit areas can be larger than
// the visible controls, and closing a pinch cannot steal the acquired target.
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
  constructor(){this.reset();}
  reset(){this.hoverId=null;this.held=null;}
  update(point,mode,targets,viewport) {
    if(!finitePoint(point)){const cancel=!!this.held;this.reset();return {point:null,target:null,cancel};}
    // Acquire at the beginning of the closing motion; the engine still emits
    // no action or dwell progress until it recognizes a completed OK.
    const holding=mode==='click-preparing' || mode==='click-pending' || mode==='click-confirmed';
    if(!holding){
      this.held=null;
      const target=hoverTarget(point,targets,this.hoverId);
      this.hoverId=target?.id||null;
      return {point,target,cancel:false};
    }
    if(!this.held){
      const target=hoverTarget(point,targets,this.hoverId);
      this.held={point:target?{x:target.x,y:target.y}:{...point},targetId:target?.id||null,viewport:{width:viewport.width,height:viewport.height},confirmed:false};
    }
    const held=this.held;
    const target=held.targetId?targets.find(t=>t.id===held.targetId):null;
    const cancel=!held.confirmed && (
      viewport.width!==held.viewport.width || viewport.height!==held.viewport.height
      || (held.targetId && (!finitePoint(target) || distance(target,held.point)>8)));
    if(mode==='click-confirmed' && !cancel)held.confirmed=true;
    return {point:held.point,target:target||null,cancel:!!cancel};
  }
}
