// Bounded geometric placement for the initial demonstrative traffic sample.
// Runtime queues and right-of-way replace the former exponential phase solver.
import { MAX_TRAFFIC_VEHICLES } from './traffic-vehicle-count.js';
export function vehicleOverlap(a,b,margin=.35) {
  const dx=b.x-a.x,dz=b.z-a.z;
  if(Math.abs(dx)>7 || Math.abs(dz)>7)return false;
  const fa=[Math.sin(a.heading),Math.cos(a.heading)],ra=[Math.cos(a.heading),-Math.sin(a.heading)];
  const fb=[Math.sin(b.heading),Math.cos(b.heading)],rb=[Math.cos(b.heading),-Math.sin(b.heading)];
  const halfLengthA=(a.length??4.2)/2+margin,halfLengthB=(b.length??4.2)/2+margin;
  const halfWidth=1.1055+margin;
  for(const axis of [fa,ra,fb,rb]){
    const distance=Math.abs(dx*axis[0]+dz*axis[1]);
    const first=halfLengthA*Math.abs(fa[0]*axis[0]+fa[1]*axis[1])+halfWidth*Math.abs(ra[0]*axis[0]+ra[1]*axis[1]);
    const second=halfLengthB*Math.abs(fb[0]*axis[0]+fb[1]*axis[1])+halfWidth*Math.abs(rb[0]*axis[0]+rb[1]*axis[1]);
    if(distance>=first+second)return false;
  }
  return true;
}

/** Find the one shared crossing/merge area of this small demonstration. */
export function prepareJunction(routes) {
  const samples=routes.map(route=>{
    const steps=Math.ceil(route.length/2);
    return Array.from({length:steps+1},(_,i)=>({distance:route.length*i/steps,...route.sample(route.length*i/steps)}));
  });
  const extents=routes.map(()=>({start:Infinity,end:-Infinity}));
  for(let a=0;a<routes.length;a++)for(let b=a+1;b<routes.length;b++){
    let opposingSharedLength=0;
    for(const first of samples[a]){
      let opposing=false;
      for(const second of samples[b]){
        if(Math.abs(first.x-second.x)>6 || Math.abs(first.z-second.z)>6)continue;
        const alignment=Math.cos(first.heading-second.heading);
        // Reject routes that drive head-on along the same physical lane. A
        // normal pair of opposite lanes remains valid because it is 3 m apart.
        if(alignment<-.9 && Math.hypot(first.x-second.x,first.z-second.z)<1.25)opposing=true;
        // Following on the same lane is handled by queues, rather than making
        // the entire 190 m shared street an exclusive crossing reservation.
        if(alignment>.97 || !vehicleOverlap(first,second,.35))continue;
        extents[a].start=Math.min(extents[a].start,first.distance);extents[a].end=Math.max(extents[a].end,first.distance);
        extents[b].start=Math.min(extents[b].start,second.distance);extents[b].end=Math.max(extents[b].end,second.distance);
      }
      if(opposing)opposingSharedLength+=routes[a].length/(samples[a].length-1);
    }
    if(opposingSharedLength>12)throw new Error('Los recorridos no permiten una separación segura: circulan de frente por el mismo carril.');
  }
  return extents.map((range,i)=>Number.isFinite(range.start)?{
    start:Math.max(0,range.start-7),end:Math.min(routes[i].length,range.end+7)
  }:null);
}

export function planVehiclePhases(routes,count=5) {
  if(!Number.isInteger(count) || count<0 || count>MAX_TRAFFIC_VEHICLES)throw new RangeError(`La muestra admite entre 0 y ${MAX_TRAFFIC_VEHICLES} autos.`);
  const occupied=[],phases=[];
  for(let index=0;index<count;index++){
    const route=routes[index%routes.length],divisions=Math.max(12,Math.ceil(route.length/3));
    const preferred=Math.floor(((.09+index/Math.max(5,count))%1)*divisions);
    let phase=null;
    // At most ~65 positions per route, with no backtracking. Cars that do not
    // fit remain outside the visible area until an entrance becomes free.
    for(let offset=0;offset<divisions;offset++){
      const candidate=((preferred+offset)%divisions+.5)/divisions,distance=candidate*route.length;
      if(route.junction && distance>route.junction.start-4 && distance<route.junction.end+4)continue;
      const position=route.sample(distance);
      if(occupied.some(other=>vehicleOverlap(position,other)))continue;
      const crowded=occupied.some(other=>{
        const dx=other.x-position.x,dz=other.z-position.z;
        return Math.cos(other.heading-position.heading)>.8
          && Math.abs(dx*Math.cos(position.heading)-dz*Math.sin(position.heading))<1.5
          && Math.abs(dx*Math.sin(position.heading)+dz*Math.cos(position.heading))<7;
      });
      if(crowded)continue;
      phase=candidate;occupied.push(position);break;
    }
    phases.push(phase);
  }
  return phases;
}
