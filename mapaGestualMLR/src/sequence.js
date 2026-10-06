// Only a click on the currently active marker can advance the ordered sequence.
// Marker identity is independent from screen position and popup button actions.
export class PointSequence {
  constructor(ids) {
    if (!Array.isArray(ids) || !ids.length || ids.some(id=>typeof id!=='string' || !id) || new Set(ids).size!==ids.length) {
      throw new TypeError('La secuencia necesita identificadores únicos.');
    }
    this.ids=Object.freeze([...ids]);
    this.reset();
  }
  get activeIndex(){return this.completedCount<this.ids.length?this.completedCount:null;}
  get completed(){return this.completedCount===this.ids.length;}
  get activeId(){return this.activeIndex===null?null:this.ids[this.activeIndex];}
  state(id) {
    const index=this.ids.indexOf(id);
    if(index<0)return null;
    return index<this.completedCount?'complete':index===this.activeIndex?'active':'locked';
  }
  activate(id) {
    if(id!==this.activeId || this.completed)return false;
    this.completedCount++;
    return true;
  }
  reset(){this.completedCount=0;return this.snapshot();}
  snapshot(){return {activeIndex:this.activeIndex,completed:this.completed,completedCount:this.completedCount,total:this.ids.length};}
}
