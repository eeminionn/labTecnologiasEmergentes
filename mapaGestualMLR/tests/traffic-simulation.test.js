import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TrafficSimulation, createRouteSampler } from '../src/traffic-simulation.js';
import { vehicleOverlap } from '../src/traffic-phase-plan.js';

const routes = [
  { id: 'oriente', points: [[-120, 0], [0, 0], [120, 0]], stopDistance: 108 },
  { id: 'sur', points: [[20, -120], [20, 0], [20, 120]], stopDistance: 108 },
  { id: 'poniente', points: [[120, 16], [0, 16], [-120, 16]], stopDistance: 108 },
  { id: 'norte', points: [[-20, 120], [-20, 0], [-20, -120]], stopDistance: 108 },
  { id: 'curva', points: [[-120, -30], [-40, -30], [-10, -15], [-10, 100]], stopDistance: 108 }
];
test('Los recorridos usan metros y rumbo consistente con el eje sur de la escena', () => {
  const route = createRouteSampler(routes[0]);
  assert.equal(route.length, 240);
  assert.deepEqual(route.sample(120), { x: 0, z: 0, heading: Math.PI / 2 });
  assert.equal(createRouteSampler(routes[1]).sample(10).heading, 0);
});
test('La demostración mantiene cinco autos sobre sus recorridos durante varias vueltas', () => {
  const simulation = new TrafficSimulation(routes);
  simulation.setScenario('madrugada');
  const samplers = new Map(routes.map(route => [route.id, createRouteSampler(route)]));
  let state;
  for (let i = 0; i < 7200; i++) {
    state = simulation.update(1 / 60);
    for (const vehicle of state.vehicles) {
      const expected = samplers.get(vehicle.routeId).sample(vehicle.distance);
      assert.equal(vehicle.x, expected.x); assert.equal(vehicle.z, expected.z);
      assert.ok(vehicle.distance >= 0 && vehicle.distance < vehicle.routeLength);
    }
  }
  assert.equal(state.vehicles.length, 5);
  assert.ok(state.elapsed > 119);
});
test('Pausar congela la simulación y reanudar no salta tiempo', () => {
  const simulation = new TrafficSimulation(routes);
  simulation.update(.5); simulation.setPaused(true);
  const stopped = simulation.snapshot();
  assert.deepEqual(simulation.update(20), stopped);
  simulation.setPaused(false);
  assert.ok(simulation.update(.1).elapsed < stopped.elapsed + .11);
});
test('La integración es independiente de la frecuencia de presentación', () => {
  const a = new TrafficSimulation(routes), b = new TrafficSimulation(routes);
  for (let i = 0; i < 600; i++) a.update(1 / 60);
  for (let i = 0; i < 1200; i++) b.update(1 / 120);
  assert.deepEqual(a.snapshot(), b.snapshot());
});
test('Los escenarios tienen velocidades diferentes y el reinicio recupera la misma muestra', () => {
  const simulation = new TrafficSimulation(routes);
  simulation.setScenario('punta'); const initial = simulation.snapshot();
  for (let i = 0; i < 180; i++) simulation.update(1 / 60);
  assert.notDeepEqual(simulation.snapshot().vehicles, initial.vehicles);
  simulation.reset(); assert.deepEqual(simulation.snapshot(), initial);
  assert.ok(simulation.setScenario('normal').speedKmh > initial.speedKmh);
  assert.ok(simulation.setScenario('madrugada').speedKmh > simulation.setScenario('normal').speedKmh);
});
test('Se rechazan rutas y escenarios inválidos sin generar coordenadas no finitas', () => {
  assert.throws(() => createRouteSampler({ points: [[0, 0]] }));
  assert.throws(() => createRouteSampler({ points: [[0, 0], [NaN, 5]] }));
  const simulation = new TrafficSimulation(routes);
  assert.throws(() => simulation.setScenario('desconocido'));
  assert.throws(() => simulation.update(NaN));
});
test('Los cinco autos del sector real completan recorridos sin superponerse ni quedar bloqueados', () => {
  const data=JSON.parse(readFileSync(new URL('../public/traffic/scene.json',import.meta.url),'utf8'));
  for(const scenario of ['punta','normal','madrugada']){
    const simulation=new TrafficSimulation(data.routes);simulation.setScenario(scenario);
    const travelled=Array(5).fill(0);let closest=Infinity;
    for(let frame=0;frame<14400;frame++){
      const state=simulation.update(1/60);
      state.vehicles.forEach((vehicle,index)=>{
        travelled[Number(vehicle.id.split('-')[1])-1]+=vehicle.speedMps/60;
        for(let other=index+1;other<state.vehicles.length;other++)closest=Math.min(closest,Math.hypot(vehicle.x-state.vehicles[other].x,vehicle.z-state.vehicles[other].z));
      });
    }
    assert.ok(closest>2.8,`${scenario}: vehículos demasiado cercanos`);
    assert.ok(travelled.every(distance=>distance>350),`${scenario}: algún vehículo no circula`);
  }
});

const residentialRoutes=JSON.parse(readFileSync(new URL('../public/traffic/scene.json',import.meta.url),'utf8')).routes;
function assertPopulation(state) {
  assert.equal(state.activeCount,state.vehicles.length);
  assert.equal(state.activeCount+state.queuedCount,state.vehicleCount);
  assert.equal(new Set(state.vehicles.map(vehicle=>vehicle.id)).size,state.activeCount);
  for(const vehicle of state.vehicles){
    assert.ok(Number(vehicle.id.split('-')[1])<=state.vehicleCount);
    assert.ok([vehicle.x,vehicle.z,vehicle.heading,vehicle.distance,vehicle.speedMps].every(Number.isFinite));
    assert.ok(vehicle.distance>=0 && vehicle.distance<vehicle.routeLength);
  }
}
function assertSeparated(state) {
  for(let i=0;i<state.vehicles.length;i++)for(let j=i+1;j<state.vehicles.length;j++){
    assert.equal(vehicleOverlap(state.vehicles[i],state.vehicles[j],.3),false,
      `${state.vehicles[i].id}/${state.vehicles[j].id}, t=${state.elapsed}`);
  }
}
test('Cambiar cantidad conserva reloj, escenario, pausa y posiciones de los autos retenidos',()=>{
  const simulation=new TrafficSimulation(residentialRoutes);simulation.setScenario('punta');
  for(let i=0;i<180;i++)simulation.update(1/60);
  simulation.setPaused(true);const before=simulation.snapshot(),more=simulation.setVehicleCount(100);
  assert.deepEqual(more.vehicles,before.vehicles);
  assert.equal(more.elapsed,before.elapsed);assert.equal(more.scenario,before.scenario);assert.equal(more.paused,true);
  assert.equal(more.vehicleCount,100);assert.equal(more.queuedCount,100-more.activeCount);
  assert.deepEqual(simulation.update(10),more);
  const retained=more.vehicles.filter(vehicle=>Number(vehicle.id.split('-')[1])<=3);
  const less=simulation.setVehicleCount(3);assert.deepEqual(less.vehicles,retained);assertPopulation(less);
  assert.equal(less.elapsed,before.elapsed);assert.equal(less.scenario,'punta');assert.equal(less.paused,true);
  const reset=simulation.reset();assert.equal(reset.vehicleCount,3);assert.equal(reset.paused,true);assert.equal(reset.elapsed,0);
  const night=simulation.setScenario('madrugada');assert.equal(night.vehicleCount,3);assert.equal(night.paused,true);
});
test('Cero autos limpia las reservas y volver a aumentar admite IDs estables desde los bordes',()=>{
  const simulation=new TrafficSimulation(residentialRoutes);
  for(let frame=0;frame<3600 && !simulation.junctionOwner;frame++)simulation.update(1/60);
  assert.ok(simulation.junctionOwner);
  const elapsed=simulation.elapsed,empty=simulation.setVehicleCount(0);
  assert.equal(simulation.junctionOwner,null);assertPopulation(empty);assert.deepEqual(empty.vehicles,[]);assert.equal(empty.elapsed,elapsed);
  assert.ok(simulation.update(.1).elapsed>elapsed);
  assert.equal(simulation.setVehicleCount(100).activeCount,0);
  const entering=simulation.update(1/60);assert.ok(entering.activeCount>0 && entering.activeCount<100);assertPopulation(entering);assertSeparated(entering);
  assert.ok(entering.vehicles.every(vehicle=>/^auto-\d+$/.test(vehicle.id) && vehicle.distance<.01));
});
test('La cantidad usa los límites comunes y el reinicio mantiene una muestra grande acotada',()=>{
  const simulation=new TrafficSimulation(residentialRoutes);
  assert.equal(simulation.setVehicleCount(500).vehicleCount,100);
  const initial=simulation.reset();assert.ok(initial.activeCount>=30 && initial.queuedCount>0);assertPopulation(initial);assertSeparated(initial);
  assert.deepEqual(simulation.reset(),initial);
  assert.equal(simulation.setVehicleCount(-1).vehicleCount,0);
  assert.equal(simulation.setVehicleCount(12.8).vehicleCount,13);
  assert.equal(simulation.setVehicleCount(NaN).vehicleCount,5);
});
test('Cien autos forman colas, siguen avanzando y no se superponen en los tres horarios',()=>{
  for(const scenario of ['punta','normal','madrugada']){
    const simulation=new TrafficSimulation(residentialRoutes);simulation.setScenario(scenario);simulation.setVehicleCount(100);
    const seen=new Set();let maximumActive=0,travelled=0;
    for(let frame=0;frame<7200;frame++){
      const state=simulation.update(1/60);assertPopulation(state);assertSeparated(state);
      maximumActive=Math.max(maximumActive,state.activeCount);
      for(const vehicle of state.vehicles){seen.add(vehicle.id);travelled+=vehicle.speedMps/60;}
    }
    assert.ok(maximumActive>=30,`${scenario}: debe haber una cantidad visible considerable`);
    assert.ok(seen.size>40,`${scenario}: la cola exterior debe ir ingresando`);
    assert.ok(travelled>1000,`${scenario}: la muestra no debe quedar bloqueada`);
  }
});
test('Los cambios repetidos de cantidad no teletransportan autos retenidos ni introducen colisiones',()=>{
  const simulation=new TrafficSimulation(residentialRoutes);
  for(let change=0;change<80;change++){
    const count=(change*37)%101,before=simulation.snapshot();
    const retained=before.vehicles.filter(vehicle=>Number(vehicle.id.split('-')[1])<=count);
    const after=simulation.setVehicleCount(count);assert.deepEqual(after.vehicles,retained);assert.equal(after.elapsed,before.elapsed);assertPopulation(after);
    for(let frame=0;frame<60;frame++){const state=simulation.update(1/60);assertPopulation(state);assertSeparated(state);}
  }
});
test('No se inicia una muestra con vehículos circulando de frente por el mismo carril', () => {
  assert.throws(()=>new TrafficSimulation([
    {id:'ida',points:[[-120,0],[120,0]]},
    {id:'vuelta',points:[[120,0],[-120,0]]}
  ]),/separación|separados/);
});
