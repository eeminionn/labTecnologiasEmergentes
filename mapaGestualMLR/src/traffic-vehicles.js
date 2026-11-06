import * as THREE from 'three';
import { MAX_TRAFFIC_VEHICLES, DEFAULT_TRAFFIC_VEHICLES, normalizeVehicleCount } from './traffic-vehicle-count.js';

const CAPACITY = MAX_TRAFFIC_VEHICLES;
const UP = new THREE.Vector3(0, 1, 0);

// A fixed shader variant lets each instance fade without recompiling a material.
function withInstanceOpacity(material, depthWrite = true) {
  material.transparent = true; material.forceSinglePass = true; material.depthWrite = depthWrite;
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute float trafficOpacity;\nvarying float vTrafficOpacity;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvTrafficOpacity = trafficOpacity;');
    shader.fragmentShader = 'varying float vTrafficOpacity;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vTrafficOpacity;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', '#include <alphatest_fragment>\nif (diffuseColor.a < 0.005) discard;');
  };
  material.customProgramCacheKey = () => 'traffic-instance-opacity-v1';
  return material;
}

function forwardAngle(axis, size) {
  const value = String(axis || '').toLowerCase().replace(/\s/g, '');
  if (value === '+x' || value === 'x') return -Math.PI / 2;
  if (value === '-x') return Math.PI / 2;
  if (value === '-z') return Math.PI;
  return value === '+z' || value === 'z' ? 0 : size.x > size.z ? -Math.PI / 2 : 0;
}

function makeBatch(geometry, material, capacity, parent, order, receivesShadow = false) {
  const ownedGeometry = geometry.clone();
  const opacity = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
  opacity.setUsage(THREE.DynamicDrawUsage); ownedGeometry.setAttribute('trafficOpacity', opacity);
  const mesh = new THREE.InstancedMesh(ownedGeometry, material, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.count = 0; mesh.visible = false;
  mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = receivesShadow; mesh.renderOrder = order;
  mesh.userData.trafficVehicleBatch = true; parent.add(mesh);
  return { mesh, opacity, used: 0 };
}

function writeInstance(batch, matrix, opacity) {
  const index = batch.used++;
  batch.mesh.setMatrixAt(index, matrix); batch.opacity.setX(index, opacity);
}

function commitBatch(batch) {
  batch.mesh.count = batch.used; batch.mesh.visible = batch.used > 0;
  batch.mesh.instanceMatrix.needsUpdate = true; batch.opacity.needsUpdate = true;
}

export async function createTrafficVehiclePool({ scene, definitions, getModel, cloneMaterial, beamTexture, contactTexture, isDisposed }) {
  const carDefinitions = definitions.filter(model => model.type === 'car');
  if (!carDefinitions.length) throw new Error('No hay modelos de automóviles para la demostración.');
  const originals = await Promise.all(carDefinitions.map(getModel));
  if (isDisposed()) throw new Error('La experiencia ya está cerrada.');
  const types = [], allBatches = [], nightGroup = new THREE.Group(); nightGroup.visible = false; scene.add(nightGroup);
  for (const [typeIndex, definition] of carDefinitions.entries()) {
    const original = originals[typeIndex], box = new THREE.Box3().setFromObject(original);
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const length = Number(definition.targetLengthM) || 4.2, scale = length / Math.max(size.x, size.z);
    const normalize = new THREE.Matrix4().compose(new THREE.Vector3(), new THREE.Quaternion().setFromAxisAngle(UP, forwardAngle(definition.forwardAxis, size)),
      new THREE.Vector3(scale, scale, scale)).multiply(new THREE.Matrix4().makeTranslation(-center.x, -box.min.y, -center.z));
    const dimensions = box.clone().applyMatrix4(normalize).getSize(new THREE.Vector3());
    const capacity = Math.floor((CAPACITY - 1 - typeIndex) / carDefinitions.length) + 1, batches = [];
    original.traverse(object => {
      if (!object.isMesh) return;
      const materials = Array.isArray(object.material) ? object.material.map(material => withInstanceOpacity(cloneMaterial(material)))
        : withInstanceOpacity(cloneMaterial(object.material));
      const batch = makeBatch(object.geometry, materials, capacity, scene, 20, true);
      batch.localMatrix = normalize.clone().multiply(object.matrixWorld); batches.push(batch); allBatches.push(batch);
    });
    types.push({ definition, scale, batches, dimensions: { width: dimensions.x, height: dimensions.y, depth: dimensions.z, length } });
  }
  const slots = Array.from({ length: CAPACITY }, (_, index) => ({ id: `auto-${index + 1}`, type: types[index % types.length] }));
  const contactGeometry = new THREE.PlaneGeometry(1, 1); contactGeometry.rotateX(-Math.PI / 2);
  const contact = makeBatch(contactGeometry, withInstanceOpacity(new THREE.MeshBasicMaterial({ map: contactTexture, color: 0x233039,
    opacity: .24, toneMapped: false }), false), CAPACITY, scene, 19); contactGeometry.dispose(); allBatches.push(contact);
  const beamGeometry = new THREE.PlaneGeometry(2.5, 4); beamGeometry.rotateX(-Math.PI / 2);
  const beam = makeBatch(beamGeometry, withInstanceOpacity(new THREE.MeshBasicMaterial({ map: beamTexture, opacity: .6, toneMapped: false }), false),
    CAPACITY, nightGroup, 25); beamGeometry.dispose(); allBatches.push(beam);
  const lampGeometry = new THREE.SphereGeometry(.11, 8, 5);
  const lamps = makeBatch(lampGeometry, withInstanceOpacity(new THREE.MeshBasicMaterial({ color: 0xfff5d2, toneMapped: false }), false),
    CAPACITY * 2, nightGroup, 24); lampGeometry.dispose(); allBatches.push(lamps);

  const vehicleMatrix = new THREE.Matrix4(), scratch = new THREE.Matrix4(), local = new THREE.Matrix4();
  const position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), unitScale = new THREE.Vector3(1, 1, 1);
  let active = [], targetCount = DEFAULT_TRAFFIC_VEHICLES, queuedCount = 0;
  function sync(snapshot) {
    allBatches.forEach(batch => { batch.used = 0; }); active = [];
    targetCount = normalizeVehicleCount(snapshot?.vehicleCount);
    const seen = new Set();
    for (const [index, vehicle] of (snapshot?.vehicles || []).slice(0, CAPACITY).entries()) {
      if (active.length >= targetCount) break;
      if (vehicle.active === false || vehicle.queued === true || !Number.isFinite(vehicle.x) || !Number.isFinite(vehicle.z)) continue;
      const numeric = Number(String(vehicle.id).replace(/^auto-/, ''));
      const slot = slots[Number.isInteger(numeric) && numeric >= 1 && numeric <= CAPACITY ? numeric - 1 : index];
      if (seen.has(slot.id)) continue; seen.add(slot.id);
      const type = slot.type, heading = Number(vehicle.heading) || 0;
      position.set(vehicle.x, .045, vehicle.z); quaternion.setFromAxisAngle(UP, heading); vehicleMatrix.compose(position, quaternion, unitScale);
      const distance = Number(vehicle.distance) || 0, routeLength = Number(vehicle.routeLength) || Infinity;
      const opacity = THREE.MathUtils.smoothstep(Math.min(distance, routeLength - distance), 0, 8);
      for (const batch of type.batches) writeInstance(batch, scratch.multiplyMatrices(vehicleMatrix, batch.localMatrix), opacity);
      local.makeScale(type.dimensions.width * 1.15, 1, type.dimensions.length * 1.05); local.setPosition(0, .012, 0);
      writeInstance(contact, scratch.multiplyMatrices(vehicleMatrix, local), opacity);
      local.makeTranslation(0, .07, type.dimensions.length / 2 + 2); writeInstance(beam, scratch.multiplyMatrices(vehicleMatrix, local), opacity);
      for (const x of [-.6, .6]) { local.makeTranslation(x, .6, type.dimensions.length / 2); writeInstance(lamps, scratch.multiplyMatrices(vehicleMatrix, local), opacity); }
      active.push({ id: vehicle.id || slot.id, modelId: type.definition.id, scale: type.scale, ...type.dimensions,
        forwardAxis: type.definition.forwardAxis, opacity });
    }
    queuedCount = Number.isFinite(snapshot?.queuedCount) ? snapshot.queuedCount : Math.max(0, targetCount - active.length);
    allBatches.forEach(commitBatch);
  }
  function info() {
    return { capacity: CAPACITY, targetCount, activeCount: active.length, queuedCount, modelTypeCount: types.length,
      drawBatches: allBatches.length, vehicleModels: active.map(record => ({ ...record })) };
  }
  return { sync, info, setNight(value) { nightGroup.visible = !!value; } };
}
