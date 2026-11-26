import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Map as MapLibreMap, MercatorCoordinate, setWorkerUrl, setWorkerCount } from 'maplibre-gl';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { disposal } from './traffic-geometry.js';
import { curvatureAt, localToLngLat, lngLatToLocal } from './traffic-map-coordinates.js';
import { createTrafficVehiclePool } from './traffic-vehicles.js';
import { assetUrl } from './asset-url.js';

// Vite emits the worker locally. Map data is the same OSM raster as Leaflet.
setWorkerUrl(mapWorkerUrl); setWorkerCount(1);
const ROOF_COLORS = [0x936a54, 0x707a7c, 0xa48b73];
const MODEL_LAYER = 'traffic-models', GUIDE_SOURCE = 'traffic-routes', GUIDE_LAYER = 'traffic-routes-line';
const GARDEN_SOURCE = 'traffic-gardens', GARDEN_LAYER = 'traffic-gardens-fill';

function glowTexture(beam = false) {
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = beam ? 256 : 128;
  const context = canvas.getContext('2d');
  if (beam) {
    const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, 'rgba(255,242,194,.34)'); gradient.addColorStop(.22, 'rgba(255,242,194,.2)');
    gradient.addColorStop(1, 'rgba(255,242,194,0)');
    context.filter = 'blur(6px)'; context.fillStyle = gradient;
    context.beginPath(); context.moveTo(47, 0); context.lineTo(81, 0); context.lineTo(126, 250); context.lineTo(2, 250); context.closePath(); context.fill();
  } else {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,232,173,.62)'); gradient.addColorStop(.25, 'rgba(255,232,173,.38)');
    gradient.addColorStop(.65, 'rgba(255,232,173,.13)'); gradient.addColorStop(1, 'rgba(255,232,173,0)');
    context.fillStyle = gradient; context.fillRect(0, 0, 128, 128);
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}
function contactShadowTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d'), gradient = context.createRadialGradient(32, 32, 2, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,.9)'); gradient.addColorStop(.5, 'rgba(255,255,255,.5)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)'); context.fillStyle = gradient; context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}
function timingSummary(values) {
  if (!values.length) return { count: 0, latest: 0, max: 0, p95: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  return { count: values.length, latest: values.at(-1), max: sorted.at(-1), p95: sorted[Math.ceil(sorted.length * .95) - 1] };
}
function cloneMaterial(source, nature = false) {
  const material = source.clone();
  if ('metalness' in material) material.metalness = 0;
  if ('roughness' in material) material.roughness = Math.max(.85, material.roughness);
  if (nature && /leaf|grass/i.test(material.name)) material.color?.setHex(/grass/i.test(material.name) ? 0x6c8d4e : 0x55784c);
  return material;
}
// Separate roof triangles instead of changing the shared atlas or façade.
function buildingParts(mesh, bounds, variant) {
  const geometry = mesh.geometry, positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal'), indices = geometry.index;
  if (!positions || Array.isArray(mesh.material)) return [{ geometry,
    material: Array.isArray(mesh.material) ? mesh.material.map(m => cloneMaterial(m)) : cloneMaterial(mesh.material) }];
  const roof = [], walls = [], world = mesh.matrixWorld;
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(world), p = new THREE.Vector3(), n = new THREE.Vector3();
  const height = bounds.max.y - bounds.min.y;
  for (let i = 0; i < (indices?.count || positions.count); i += 3) {
    const face = [0, 1, 2].map(offset => indices ? indices.getX(i + offset) : i + offset);
    let y = 0, upward = 0;
    for (const index of face) {
      p.fromBufferAttribute(positions, index).applyMatrix4(world); y += p.y / 3;
      if (normals) { n.fromBufferAttribute(normals, index).applyMatrix3(normalMatrix).normalize(); upward += n.y / 3; }
    }
    (normals && upward > .2 && y > bounds.min.y + height * .55 ? roof : walls).push(...face);
  }
  if (!roof.length) return [{ geometry, material: cloneMaterial(mesh.material) }];
  const parts = [];
  if (walls.length) {
    const wallGeometry = geometry.clone(); wallGeometry.clearGroups(); wallGeometry.setIndex(walls);
    parts.push({ geometry: wallGeometry, material: cloneMaterial(mesh.material) });
  }
  const roofGeometry = geometry.clone(); roofGeometry.clearGroups(); roofGeometry.setIndex(roof);
  parts.push({ geometry: roofGeometry, material: new THREE.MeshStandardMaterial({ color: ROOF_COLORS[variant], roughness: .95, metalness: 0 }) });
  return parts;
}

export async function createTrafficScene(host, data, manifest) {
  const origin = data.center;
  if (!Number.isFinite(origin?.lat) || !Number.isFinite(origin?.lng)) throw new Error('El sector no tiene un origen geográfico válido.');
  const bounds = data.bounds || { minX: -95, maxX: 95, minZ: -85, maxZ: 85 };
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ), mapView = data.mapView || {};
  const homeCentre = mapView.center || [origin.lng, origin.lat], homeZoom = Number(mapView.zoom) || 18.6;
  const homePitch = Number(mapView.pitch) || 52, homeBearing = Number(mapView.bearing) || 0;
  let disposed = false, night = false, guides = true, viewMode = '3d', renderer, layerAdded = false, contextLost = false;
  let latestSnapshot = null, rasterLoaded = false, styleReady = false, lastRenderTime = 0, layerError = '', settleWaitCleanup = null;
  const rasterTiles = new Set(), tileErrors = [], originalModels = [], templates = new Map();
  const renderDurations = [], renderIntervals = []; let previousRenderStart = 0;
  const buildingRecords = [], propRecords = [], scene = new THREE.Scene(), camera = new THREE.Camera();
  let vehiclePool = null, shadersPrepared = false;
  const nightDecor = new THREE.Group(); nightDecor.visible = false; scene.add(nightDecor);
  const hemisphere = new THREE.HemisphereLight(0xffffff, 0x9aa18e, 2.1); scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xfff6e7, 2.6); sun.position.set(-span * .45, span * .8, span * .3);
  sun.target.position.set(0, 0, 0); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.normalBias = .08;
  Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 1, far: span * 3 });
  sun.shadow.camera.updateProjectionMatrix(); scene.add(sun, sun.target);
  // A transparent shadow receiver preserves every pixel of the base map.
  const shadows = new THREE.Mesh(new THREE.PlaneGeometry(span * 3, span * 3), new THREE.ShadowMaterial({ opacity: .24, depthWrite: false }));
  shadows.rotation.x = -Math.PI / 2; shadows.position.y = .025; shadows.receiveShadow = true; shadows.renderOrder = 1; scene.add(shadows);

  const mapHost = document.createElement('div'); mapHost.className = 'traffic-map';
  Object.assign(mapHost.style, { position: 'absolute', inset: '0', background: 'transparent' }); host.append(mapHost);
  const lowerLeft = localToLngLat(bounds.minX - span * 2, bounds.maxZ + span * 2, origin);
  const upperRight = localToLngLat(bounds.maxX + span * 2, bounds.minZ - span * 2, origin);
  const map = new MapLibreMap({ container: mapHost, attributionControl: false, center: homeCentre,
    zoom: 18, pitch: 0, bearing: 0, minZoom: 16.5, maxZoom: 20.25, maxPitch: 65,
    maxBounds: [lowerLeft, upperRight], renderWorldCopies: false,
    pixelRatio: Math.min(1.5, window.devicePixelRatio || 1),
    canvasContextAttributes: { antialias: true, preserveDrawingBuffer: true, alpha: true },
    style: { version: 8, projection: { type: 'mercator' }, sources: {
      'osm-base': { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256,
        minzoom: 0, maxzoom: 19, attribution: '© OpenStreetMap contributors' }
    }, layers: [{ id: 'traffic-background', type: 'background', paint: { 'background-color': '#e9eeea' } }, { id: 'osm-base', type: 'raster', source: 'osm-base', paint: { 'raster-fade-duration': 0 } }] }
  });
  map.getCanvas().setAttribute('aria-label', 'Cartografía de OpenStreetMap con casas y vehículos tridimensionales');
  map.getCanvas().classList.add('traffic-canvas');
  const onError = event => {
    const message = event.error?.message || 'No se pudo cargar una tesela del mapa.';
    if (tileErrors.length < 12 && !tileErrors.includes(message)) tileErrors.push(message);
  };
  const onSource = event => {
    if (event.sourceId !== 'osm-base') return;
    if (event.tile?.state === 'loaded') {
      const coord = event.tile.tileID?.canonical || event.tile.tileID;
      rasterTiles.add(coord ? `${coord.z}/${coord.x}/${coord.y}` : `tile-${rasterTiles.size + 1}`); rasterLoaded = true;
    }
    if (event.isSourceLoaded && !tileErrors.length) rasterLoaded = true;
  };
  const onContextLost = event => { contextLost = true; event.preventDefault?.();
    host.dispatchEvent(new CustomEvent('traffic-render-error', { detail: 'La vista del sector perdió el contexto gráfico. Vuelve al mapa y abre Experiencias otra vez.' })); };
  map.on('error', onError); map.on('sourcedata', onSource); map.on('webglcontextlost', onContextLost);
  const stylePromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('No se pudo preparar la cartografía del sector.')), 12000);
    map.once('style.load', () => { clearTimeout(timeout); styleReady = true; resolve(); });
  }); stylePromise.catch(() => {});

  const loader = new GLTFLoader(), modelDefinitions = manifest.models || [], modelPromises = new Map();
  const getModel = async definition => {
    if (!definition?.url) throw new Error('Falta un modelo tridimensional del sector.');
    if (!modelPromises.has(definition.url)) modelPromises.set(definition.url, loader.loadAsync(assetUrl(definition.url)).then(gltf => {
      const model = gltf.scene;
      if (disposed) { disposal(model); throw new Error('La experiencia ya está cerrada.'); }
      model.updateMatrixWorld(true); originalModels.push(model); return model;
    }).catch(() => { throw new Error(`No se pudo cargar el modelo «${definition.label || definition.id}».`); }));
    return modelPromises.get(definition.url);
  };
  async function addStaticInstances(items, type, records) {
    const buckets = new Map();
    for (const [index, item] of items.entries()) {
      const definition = modelDefinitions.find(model => model.id === item.modelId && model.type === type), original = await getModel(definition);
      if (disposed) throw new Error('La experiencia ya está cerrada.');
      const modelBox = new THREE.Box3().setFromObject(original), size = modelBox.getSize(new THREE.Vector3()), centre = modelBox.getCenter(new THREE.Vector3());
      if (!(size.x > 0 && size.y > 0 && size.z > 0)) throw new Error('Un modelo no tiene dimensiones válidas.');
      const scale = Number(item.uniformScale) > 0 ? Number(item.uniformScale) : type === 'building'
        ? Math.min(Number(item.width) / size.x, Number(item.depth) / size.z, item.height > 0 ? Number(item.height) / size.y : Infinity)
        : (Number(item.height) || Number(definition.targetHeightM) || 2) / size.y;
      const scaleXZ = item.scaleXZ || [1, 1];
      const vectorScale = new THREE.Vector3(scale * (Number(scaleXZ[0]) || 1), scale, scale * (Number(scaleXZ[1]) || 1));
      if (![vectorScale.x, vectorScale.y, vectorScale.z].every(value => Number.isFinite(value) && value > 0)) throw new Error('La escala de un modelo no es válida.');
      const rotation = Number(item.rotation) || 0;
      const placement = new THREE.Matrix4().compose(new THREE.Vector3(item.position[0], .04, item.position[1]),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotation), vectorScale);
      const normalize = new THREE.Matrix4().makeTranslation(-centre.x, -modelBox.min.y, -centre.z), variant = type === 'building' ? index % ROOF_COLORS.length : 0;
      let meshIndex = 0;
      original.traverse(mesh => {
        if (!mesh.isMesh) return;
        const cacheKey = `${definition.id}:${variant}:${meshIndex++}`;
        let parts = templates.get(cacheKey);
        if (!parts) {
          parts = type === 'building' ? buildingParts(mesh, modelBox, variant) : [{ geometry: mesh.geometry,
            material: Array.isArray(mesh.material) ? mesh.material.map(m => cloneMaterial(m, true)) : cloneMaterial(mesh.material, true) }];
          templates.set(cacheKey, parts);
        }
        for (const [partIndex, part] of parts.entries()) {
          const key = `${cacheKey}:${partIndex}`;
          if (!buckets.has(key)) buckets.set(key, { part, matrices: [] });
          buckets.get(key).matrices.push(placement.clone().multiply(normalize).multiply(mesh.matrixWorld));
        }
      });
      records.push({ id: item.id, sourceBuildingId: item.sourceBuildingId, modelId: definition.id, scale, scaleXZ: [...scaleXZ],
        width: size.x * vectorScale.x, height: size.y * vectorScale.y, depth: size.z * vectorScale.z,
        rotation, position: [...item.position], sourceRenderedBounds: item.renderedBounds || null });
    }
    for (const { part, matrices } of buckets.values()) {
      if (disposed) throw new Error('La experiencia ya está cerrada.');
      const instances = new THREE.InstancedMesh(part.geometry, part.material, matrices.length);
      matrices.forEach((matrix, index) => instances.setMatrixAt(index, matrix)); instances.instanceMatrix.needsUpdate = true;
      instances.computeBoundingBox(); instances.computeBoundingSphere(); instances.castShadow = true; instances.receiveShadow = type !== 'building';
      instances.renderOrder = 10; scene.add(instances);
    }
  }
  function addStreetlightHalos() {
    const lights = propRecords.filter(record => modelDefinitions.find(model => model.id === record.modelId)?.propType === 'streetlight');
    if (!lights.length) return;
    const halo = glowTexture();
    for (const record of lights) {
      const group = new THREE.Group(); group.position.set(record.position[0], 0, record.position[1]); group.rotation.y = record.rotation;
      const lampZ = -record.depth * .38, lampY = record.height * .94;
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ map: halo, transparent: true,
        opacity: .52, depthWrite: false, toneMapped: false }));
      pool.rotation.x = -Math.PI / 2; pool.position.set(0, .09, lampZ); pool.renderOrder = 25;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(.14, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe9af, toneMapped: false }));
      bulb.position.set(0, lampY, lampZ);
      const bloom = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, transparent: true, opacity: .8, depthWrite: false, toneMapped: false }));
      bloom.position.copy(bulb.position); bloom.scale.set(1.1, 1.1, 1.1);
      group.add(pool, bulb, bloom); nightDecor.add(group);
    }
  }
  async function addVehicles() {
    vehiclePool = await createTrafficVehiclePool({ scene, definitions: modelDefinitions, getModel, cloneMaterial,
      beamTexture: glowTexture(true), contactTexture: contactShadowTexture(), isDisposed: () => disposed });
  }
  const mercator = MercatorCoordinate.fromLngLat([origin.lng, origin.lat], 0), curvature = curvatureAt(origin.lat), cosine = Math.cos(origin.lat * Math.PI / 180);
  const eastScale = 1 / (2 * Math.PI * curvature.primeVertical * cosine), southScale = 1 / (2 * Math.PI * curvature.meridional * cosine);
  // Local x/east,y/up,z/south maps to Mercator x/east,z/up,y/south.
  const worldMatrix = new THREE.Matrix4().set(eastScale, 0, 0, mercator.x, 0, 0, southScale, mercator.y,
    0, mercator.meterInMercatorCoordinateUnits(), 0, mercator.z, 0, 0, 0, 1);
  const customLayer = {
    id: MODEL_LAYER, type: 'custom', renderingMode: '3d',
    onAdd(_map, gl) {
      renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true, alpha: true });
      renderer.autoClear = false; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = .96; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      // Houses, trees and the light are static. Cache their shadow map once;
      // moving cars use a local contact decal rather than redrawing the barrio.
      renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
      // Compile even hidden pools, so the first slider change only uploads matrices.
      renderer.resetState();
      renderer.compileAsync(scene, camera).then(() => { shadersPrepared = true; if (!disposed) map.triggerRepaint(); })
        .catch(error => { if (!disposed) layerError = error.message; });
      renderer.resetState();
    },
    render(first, second) {
      if (disposed || !renderer || contextLost) return;
      const input = second || first, matrix = input.defaultProjectionData?.mainMatrix || input.modelViewProjectionMatrix || input;
      if (!matrix || matrix.length !== 16) return;
      const renderStart = performance.now();
      if (previousRenderStart) { renderIntervals.push(renderStart - previousRenderStart); if (renderIntervals.length > 120) renderIntervals.shift(); }
      previousRenderStart = renderStart;
      try {
        camera.projectionMatrix.fromArray(matrix).multiply(worldMatrix); camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
        renderer.resetState(); renderer.setViewport(0, 0, map.getCanvas().width, map.getCanvas().height);
        renderer.render(scene, camera); renderer.resetState(); lastRenderTime = performance.now();
      } catch (error) {
        if (!layerError) { layerError = error.message; host.dispatchEvent(new CustomEvent('traffic-render-error', { detail: 'No se pudo dibujar la escena tridimensional sobre el mapa.' })); }
      } finally {
        renderDurations.push(performance.now() - renderStart); if (renderDurations.length > 120) renderDurations.shift();
      }
    },
    onRemove() { renderer?.dispose(); renderer = null; }
  };
  const observer = new ResizeObserver(() => { if (!disposed) map.resize(); }); observer.observe(host);
  function dispose() {
    if (disposed) return; disposed = true; observer.disconnect(); settleWaitCleanup?.();
    map.off('error', onError); map.off('sourcedata', onSource); map.off('webglcontextlost', onContextLost);
    if (layerAdded && map.getLayer(MODEL_LAYER)) map.removeLayer(MODEL_LAYER);
    // MapLibre owns the shared context; Three must never force context loss.
    const pendingTemplates = { traverse(callback) { for (const parts of templates.values()) for (const part of parts) callback(part); } };
    disposal(scene, [...originalModels, pendingTemplates]); renderer?.dispose(); renderer = null; map.remove(); mapHost.remove();
  }
  function waitForMapIdle() {
    return new Promise(resolve => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true; clearTimeout(timeout); map.off('idle', onIdle); settleWaitCleanup = null; resolve();
      };
      const onIdle = () => { if (!map.isMoving() && shadersPrepared) finish(); };
      const timeout = setTimeout(finish, 3000);
      settleWaitCleanup = finish; map.on('idle', onIdle); map.triggerRepaint();
    });
  }
  try {
    if (!data.buildings?.length) throw new Error('El sector no contiene casas para esta experiencia.');
    await Promise.all([stylePromise, addStaticInstances(data.buildings, 'building', buildingRecords),
      addStaticInstances(data.props || [], 'prop', propRecords), addVehicles()]);
    if (disposed) throw new Error('La experiencia ya está cerrada.');
    addStreetlightHalos();
    const gardenRing = points => {
      if (!Array.isArray(points) || points.length < 3) return null;
      const ring = points.filter(point => Array.isArray(point) && point.length >= 2 && point.every(Number.isFinite))
        .map(([x, z]) => localToLngLat(x, z, origin));
      if (ring.length < 3) return null;
      if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) ring.push([...ring[0]]);
      return ring;
    };
    const gardens = (data.gardens || []).flatMap(garden => {
      const outer = gardenRing(garden.polygon || garden.points);
      if (!outer) return [];
      return [{ type: 'Feature', properties: { id: garden.id, note: garden.note || 'Paisajismo representativo' },
        geometry: { type: 'Polygon', coordinates: [outer, ...(garden.holes || []).map(gardenRing).filter(Boolean)] } }];
    });
    if (gardens.length) {
      map.addSource(GARDEN_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: gardens } });
      map.addLayer({ id: GARDEN_LAYER, type: 'fill', source: GARDEN_SOURCE,
        paint: { 'fill-color': '#9eaf91', 'fill-opacity': .6, 'fill-antialias': true } });
      map.addLayer({ id: 'traffic-gardens-edge', type: 'line', source: GARDEN_SOURCE,
        paint: { 'line-color': '#839779', 'line-opacity': .3, 'line-width': .6 } });
    }
    map.addSource(GUIDE_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: (data.routes || []).map(route => ({ type: 'Feature',
      properties: { id: route.id }, geometry: { type: 'LineString', coordinates: route.points.map(([x, z]) => localToLngLat(x, z, origin)) } })) } });
    map.addLayer({ id: GUIDE_LAYER, type: 'line', source: GUIDE_SOURCE, layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#006a85', 'line-width': 2.2, 'line-opacity': .72, 'line-dasharray': [2.5, 2] } });
    map.addLayer(customLayer); layerAdded = true;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    map.easeTo({ center: homeCentre, zoom: homeZoom, pitch: homePitch, bearing: homeBearing, duration: reduceMotion ? 0 : 1100,
      padding: { top: 65, bottom: 220, left: 0, right: 0 } });
    // Let MapLibre finish its camera transition and upload the first visible scene
    // before the controller enables gesture targets. Network delays remain bounded.
    await waitForMapIdle();
    if (disposed) throw new Error('La experiencia ya está cerrada.');
  } catch (error) { dispose(); throw error; }
  function syncVehicles(snapshot) { latestSnapshot = snapshot; vehiclePool?.sync(snapshot); }
  function render(snapshot) { if (!disposed) { syncVehicles(snapshot); map.triggerRepaint(); } }
  function setScenario(id) {
    if (disposed) return;
    night = id === 'madrugada'; hemisphere.intensity = night ? 1.3 : 2.1; hemisphere.color.setHex(night ? 0xb2c9df : 0xffffff); sun.intensity = night ? .8 : 2.6;
    if (map.getLayer('osm-base')) {
      map.setPaintProperty('osm-base', 'raster-brightness-max', night ? .78 : 1);
      map.setPaintProperty('osm-base', 'raster-saturation', night ? -.12 : 0);
      map.setPaintProperty('osm-base', 'raster-opacity', night ? .84 : 1);
      map.setPaintProperty('traffic-background', 'background-color', night ? '#153c4b' : '#e9eeea');
    }
    if (map.getLayer(GARDEN_LAYER)) {
      map.setPaintProperty(GARDEN_LAYER, 'fill-color', night ? '#6e887c' : '#9eaf91');
      map.setPaintProperty(GARDEN_LAYER, 'fill-opacity', night ? .5 : .6);
    }
    nightDecor.visible = night; vehiclePool?.setNight(night); map.triggerRepaint();
  }
  function home() { if (!disposed) map.jumpTo({ center: homeCentre, zoom: homeZoom, pitch: viewMode === '2d' ? 0 : homePitch, bearing: homeBearing,
    padding: { top: 65, bottom: 220, left: 0, right: 0 } }); }
  function pan(dx, dy) { if (!disposed) { map.stop(); map.panBy([-Number(dx || 0), -Number(dy || 0)], { duration: 0 }); } }
  function zoom(delta, x = host.clientWidth / 2, y = host.clientHeight / 2) {
    if (disposed) return; map.stop();
    map.zoomTo(Math.max(16.5, Math.min(20.25, map.getZoom() + Number(delta || 0))), { duration: 0, around: map.unproject([x, y]) });
  }
  function setViewMode(mode) { if (!['2d', '3d'].includes(mode) || disposed) return false;
    viewMode = mode; map.easeTo({ pitch: mode === '2d' ? 0 : homePitch, bearing: homeBearing, duration: 650 }); return true; }
  function setGuides(value) { guides = !!value;
    if (!disposed && map.getLayer(GUIDE_LAYER)) map.setLayoutProperty(GUIDE_LAYER, 'visibility', guides ? 'visible' : 'none'); }
  function info() {
    const center = map.getCenter(), target = lngLatToLocal(center.lng, center.lat, origin), vehicleState = vehiclePool.info();
    return { nightLightPools: nightDecor.children.length, headlightBeamMetres: 4, gardenCount: data.gardens?.length || 0, gardenStyle: 'paisajismo representativo', buildingCount: buildingRecords.length, propCount: propRecords.length, carModelCount: vehicleState.modelTypeCount,
      vehiclePoolCapacity: vehicleState.capacity, vehicleCount: vehicleState.targetCount, activeCount: vehicleState.activeCount, queuedCount: vehicleState.queuedCount,
      vehicleMeshCount: vehicleState.activeCount, renderedVehicleCount: vehicleState.activeCount,
      guideRoutes: data.routes.length, guidesVisible: guides, night, viewMode, portalFadeMetres: 8,
      scale: 2 ** (map.getZoom() - homeZoom), baseMap: 'OpenStreetMap',
      projection: 'mercator', originalCartography: true, rasterTilesLoaded: rasterLoaded, visibleTilesLoaded: map.areTilesLoaded(), cameraMoving: map.isMoving(),
      frameMs: timingSummary(renderDurations), frameGapMs: timingSummary(renderIntervals), rasterTileLoadCount: rasterTiles.size,
      tileErrors: tileErrors.length, tileErrorMessages: [...tileErrors], styleReady, shadersPrepared, lastRenderTime, renderError: layerError,
      zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing(),
      camera: { target: [target.x, 0, target.z], center: { lng: center.lng, lat: center.lat }, zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() },
      rendering: { calls: renderer?.info.render.calls || 0, triangles: renderer?.info.render.triangles || 0,
        buildingSelfShadows: false, shadowMode: 'static', dynamicVehicleShadows: false, vehicleInstancedBatches: vehicleState.drawBatches, staticInstancedMeshes: scene.children.filter(object => object.isInstancedMesh && !object.userData.trafficVehicleBatch).length },
      roadCount: data.roads?.length || 0, motorRoadCount: data.roads?.filter(road => road.motorVehicles !== false).length || 0,
      pathCount: data.roads?.filter(road => road.motorVehicles === false).length || 0, streetLabelCount: 0,
      bounds, buildings: buildingRecords, props: propRecords,
      vehicleModels: vehicleState.vehicleModels,
      models: vehicleState.vehicleModels.map(entry => ({ id: entry.modelId, scale: entry.scale })) };
  }
  return { render, pan, zoom, home, resize() { if (!disposed) map.resize(); }, setScenario, info, setGuides, setViewMode, dispose };
}
