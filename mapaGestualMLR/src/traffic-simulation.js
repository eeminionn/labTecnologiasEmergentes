import { planVehiclePhases, prepareJunction, vehicleOverlap } from './traffic-phase-plan.js';
import { DEFAULT_TRAFFIC_VEHICLES, MAX_TRAFFIC_VEHICLES, normalizeVehicleCount } from './traffic-vehicle-count.js';
// Metre-based illustrative movement. This is not a traffic forecasting model.
export { MAX_TRAFFIC_VEHICLES };
export const TRAFFIC_SCENARIOS = Object.freeze({
  punta: Object.freeze({ id: 'punta', label: 'Hora punta', time: '08:30', speedKmh: 12, pauseSeconds: 4.5, cycleSeconds: 13 }),
  normal: Object.freeze({ id: 'normal', label: 'Horario normal', time: '12:00', speedKmh: 28, pauseSeconds: 1.2, cycleSeconds: 16 }),
  madrugada: Object.freeze({ id: 'madrugada', label: 'Madrugada', time: '03:00', speedKmh: 36, pauseSeconds: 0, cycleSeconds: 16 })
});

export function createRouteSampler(route) {
  if (!route || !Array.isArray(route.points)) throw new Error('El recorrido no tiene coordenadas.');
  const points = route.points.map(point => {
    if (!Array.isArray(point) || point.length < 2 || !point.slice(0, 2).every(Number.isFinite)) throw new Error('Coordenadas de recorrido no válidas.');
    return point.slice(0, 2);
  }).filter((point, i, all) => !i || Math.hypot(point[0] - all[i - 1][0], point[1] - all[i - 1][1]) > .001);
  if (points.length < 2) throw new Error('El recorrido necesita dos puntos diferentes.');
  if (route.closed && Math.hypot(points[0][0] - points.at(-1)[0], points[0][1] - points.at(-1)[1]) > .001) points.push([...points[0]]);
  const segments = [];
  let length = 0, nearest = Infinity, stopDistance = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], distance = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segments.push({ a, b, start: length, distance, heading: Math.atan2(b[0] - a[0], b[1] - a[1]) });
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dz) / (distance * distance)));
    const radius = Math.hypot(a[0] + dx * t, a[1] + dz * t);
    if (radius < nearest) { nearest = radius; stopDistance = length + distance * t; }
    length += distance;
  }
  if (!(length > 1)) throw new Error('El recorrido es demasiado corto.');
  return {
    id: String(route.id), length, points, closed: route.closed === true,
    priority: route.fromBoundary === 'norte' ? 1 : 2,
    stopDistance: Number.isFinite(route.stopDistance) ? Math.max(0, Math.min(length, route.stopDistance)) : Math.max(0, stopDistance - 12),
    sample(distance) {
      const at = Math.max(0, Math.min(length, distance));
      let lo=0,hi=segments.length-1;
      while(lo<hi){const mid=(lo+hi)>>1;if(at<=segments[mid].start+segments[mid].distance)hi=mid;else lo=mid+1;}
      const segment = segments[lo];
      const t = Math.max(0, Math.min(1, (at - segment.start) / segment.distance));
      return { x: segment.a[0] + (segment.b[0] - segment.a[0]) * t, z: segment.a[1] + (segment.b[1] - segment.a[1]) * t, heading: segment.heading };
    }
  };
}

export class TrafficSimulation {
  constructor(routes) {
    if (!Array.isArray(routes) || !routes.length) throw new Error('No hay recorridos para la demostración.');
    this.routes = routes.map(createRouteSampler);
    if (new Set(this.routes.map(route => route.id)).size !== this.routes.length) throw new Error('Los recorridos necesitan nombres diferentes.');
    const junctions=prepareJunction(this.routes);
    this.routes.forEach((route,i)=>{route.junction=junctions[i];});
    this.scenario = 'normal'; this.paused = false; this.vehicleCount = DEFAULT_TRAFFIC_VEHICLES;
    this.reset();
  }
  createVehicle(index) {
    return { id: `auto-${index + 1}`, index, route: this.routes[index%this.routes.length], active:false,
      distance:0, speedMps:0, length:4.2, waiting:true, requestSince:null, queuedSince:this.queueSerial++ };
  }
  reset() {
    this.elapsed = 0; this.accumulator = 0; this.speedFactor = 0; this.queueSerial=0; this.junctionOwner=null;
    const phases=planVehiclePhases(this.routes,this.vehicleCount);
    this.vehicles = Array.from({length:this.vehicleCount},(_,i)=>{
      const vehicle=this.createVehicle(i);
      if(phases[i]!==null){vehicle.active=true;vehicle.distance=vehicle.route.length*phases[i];}
      Object.assign(vehicle,vehicle.route.sample(vehicle.distance));
      return vehicle;
    });
    return this.snapshot();
  }
  setVehicleCount(value) {
    value=normalizeVehicleCount(value);
    if(value===this.vehicleCount)return this.snapshot();
    if(value<this.vehicleCount){
      this.vehicles.length=value;
      if(this.junctionOwner && !this.vehicles.some(vehicle=>vehicle.id===this.junctionOwner))this.junctionOwner=null;
    } else for(let i=this.vehicleCount;i<value;i++)this.vehicles.push(this.createVehicle(i));
    this.vehicleCount=value;
    return this.snapshot();
  }
  setScenario(id) {
    if (!Object.hasOwn(TRAFFIC_SCENARIOS, id)) throw new Error('El escenario de tránsito no existe.');
    this.scenario = id;
    return this.reset();
  }
  setPaused(value) { this.paused = value === true; return this.snapshot(); }
  update(deltaSeconds) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new Error('El tiempo debe ser positivo y finito.');
    if (this.paused || deltaSeconds === 0) return this.snapshot();
    this.accumulator += Math.min(deltaSeconds, .5);
    const step = 1 / 60;
    while (this.accumulator + 1e-10 >= step) {
      this.advance(step); this.accumulator -= step;
    }
    this.accumulator = Math.max(0, this.accumulator);
    return this.snapshot();
  }
  collides(position,except=null) {
    return this.vehicles.some(vehicle=>vehicle.active && vehicle!==except && vehicleOverlap(position,vehicle));
  }
  admitWaiting() {
    const queue=this.vehicles.filter(vehicle=>!vehicle.active).sort((a,b)=>a.queuedSince-b.queuedSince);
    for(const vehicle of queue){
      const position=vehicle.route.sample(0);
      // Different routes can share their entrance; checking the actual geometry
      // prevents two admissions onto the same lane in the same fixed time step.
      if(this.collides(position))continue;
      vehicle.active=true;vehicle.distance=0;vehicle.speedMps=0;vehicle.requestSince=null;
      Object.assign(vehicle,position);
    }
  }
  reserveJunction() {
    const owner=this.vehicles.find(vehicle=>vehicle.id===this.junctionOwner && vehicle.active);
    if(owner && owner.route.junction && owner.distance<=owner.route.junction.end)return;
    this.junctionOwner=null;
    const candidates=this.vehicles.filter(vehicle=>vehicle.active && vehicle.route.junction
      && vehicle.distance>=vehicle.route.junction.start-.05 && vehicle.distance<vehicle.route.junction.start+.05);
    for(const vehicle of candidates)if(vehicle.requestSince===null)vehicle.requestSince=this.elapsed;
    candidates.sort((a,b)=>{
      // Zapiola has illustrative priority; a sustained wait eventually grants
      // Caracci a turn. This is a demonstration rule, not a signal-time model.
      const score=vehicle=>vehicle.route.priority+(this.elapsed-vehicle.requestSince)/8;
      return score(b)-score(a) || a.requestSince-b.requestSince || a.index-b.index;
    });
    if(candidates.length)this.junctionOwner=candidates[0].id;
  }
  advance(dt) {
    this.elapsed += dt;
    const settings = TRAFFIC_SCENARIOS[this.scenario];
    const stopped = settings.pauseSeconds > 0 && this.elapsed % settings.cycleSeconds >= settings.cycleSeconds-settings.pauseSeconds;
    const target = stopped ? 0 : 1;
    this.speedFactor += Math.max(-dt*1.5, Math.min(dt*.8, target-this.speedFactor));
    this.admitWaiting();this.reserveJunction();
    // Frontmost vehicles move first. Waiting followers then observe the updated
    // leader position, so a queue advances without alternating-frame chatter.
    const active=this.vehicles.filter(vehicle=>vehicle.active).sort((a,b)=>b.distance/b.route.length-a.distance/a.route.length || a.index-b.index);
    for(const vehicle of active){
      let desired=settings.speedKmh/3.6*this.speedFactor;
      const forwardX=Math.sin(vehicle.heading),forwardZ=Math.cos(vehicle.heading);
      let freeDistance=Infinity;
      for(const other of active){
        if(other===vehicle)continue;
        const dx=other.x-vehicle.x,dz=other.z-vehicle.z;
        if(Math.abs(dx)>30 || Math.abs(dz)>30 || Math.cos(other.heading-vehicle.heading)<.7)continue;
        const ahead=dx*forwardX+dz*forwardZ,lateral=Math.abs(dx*forwardZ-dz*forwardX);
        if(ahead>0 && lateral<1.5)freeDistance=Math.min(freeDistance,Math.max(0,ahead-6.2));
      }
      if(Number.isFinite(freeDistance))desired=Math.min(desired,freeDistance/.7,Math.sqrt(8*freeDistance));
      const zone=vehicle.route.junction;
      let stop=vehicle.route.length;
      if(zone && vehicle.distance<=zone.start && this.junctionOwner!==vehicle.id)stop=Math.min(stop,zone.start);
      const remaining=Math.max(0,stop-vehicle.distance);
      if(stop<vehicle.route.length)desired=Math.min(desired,Math.sqrt(8*remaining));
      const acceleration=desired>=vehicle.speedMps?2.2:5;
      const speed=vehicle.speedMps+Math.max(-acceleration*dt,Math.min(acceleration*dt,desired-vehicle.speedMps));
      const movement=Math.min(remaining,speed*dt,freeDistance);
      let nextDistance=vehicle.distance+movement,position=vehicle.route.sample(nextDistance);
      if(this.collides(position,vehicle)){
        // The oriented body envelope is the final safety bound at merges and
        // turns, independently of the simple following-speed approximation.
        let lo=vehicle.distance,hi=nextDistance;
        for(let i=0;i<8;i++){
          const middle=(lo+hi)/2;
          if(this.collides(vehicle.route.sample(middle),vehicle))hi=middle;else lo=middle;
        }
        nextDistance=lo;position=vehicle.route.sample(nextDistance);
      }
      vehicle.speedMps=(nextDistance-vehicle.distance)/dt;vehicle.distance=nextDistance;
      vehicle.waiting=vehicle.speedMps<.05;Object.assign(vehicle,position);
      if(vehicle.distance>=vehicle.route.length-1e-7){
        vehicle.active=false;vehicle.distance=0;vehicle.speedMps=0;vehicle.waiting=true;vehicle.requestSince=null;vehicle.queuedSince=this.queueSerial++;
        if(this.junctionOwner===vehicle.id)this.junctionOwner=null;
      }
    }
  }
  snapshot() {
    const settings = TRAFFIC_SCENARIOS[this.scenario],active=this.vehicles.filter(vehicle=>vehicle.active);
    return {
      scenario: this.scenario, label: settings.label, time: settings.time,
      paused: this.paused, elapsed: this.elapsed, vehicleCount:this.vehicleCount, activeCount:active.length,queuedCount:this.vehicleCount-active.length,
      speedKmh: settings.speedKmh, demonstration: true,
      vehicles: active.map(vehicle => ({
        id: vehicle.id, routeId: vehicle.route.id, x:vehicle.x,z:vehicle.z,heading:vehicle.heading,
        distance: vehicle.distance, routeLength: vehicle.route.length,
        speedMps: vehicle.speedMps, length: vehicle.length, waiting: vehicle.waiting
      }))
    };
  }
}
