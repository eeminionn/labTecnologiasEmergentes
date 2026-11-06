import { createTrafficScene } from './traffic-scene.js';
import { TrafficSimulation, TRAFFIC_SCENARIOS } from './traffic-simulation.js';
import { DEFAULT_TRAFFIC_VEHICLES, MAX_TRAFFIC_VEHICLES, normalizeVehicleCount } from './traffic-vehicle-count.js';

const vehicleCountPreference = 'mlr.traffic.vehicle-count';

const descriptions = { punta: 'Avance lento y detenciones de muestra.', normal: 'Circulación fluida por el mismo sector.',
  madrugada: 'Mayor fluidez y escena nocturna.' };
const scenarios = Object.values(TRAFFIC_SCENARIOS).map(option => ({ ...option, description: descriptions[option.id] }));

function elapsedLabel(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

export async function createTrafficExperience(container, { notify = () => {}, onChange = () => {}, onExit = () => {},
  sceneUrl = '/traffic/scene.json', initialVehicleCount, persistVehicleCount = true } = {}) {
  let opened = true, destroyed = false, rendering = null, simulation = null, data = null, failure = '', frame = 0;
  let lastFrame = performance.now(), lastStatus = 0, guides = true, scenario = 'normal';
  let requestedVehicleCount = DEFAULT_TRAFFIC_VEHICLES;
  try {
    const stored = initialVehicleCount ?? (persistVehicleCount ? localStorage.getItem(vehicleCountPreference) : null);
    if (stored !== null && stored !== undefined) requestedVehicleCount = normalizeVehicleCount(stored);
  } catch { /* A session remains usable when local preference storage is unavailable. */ }
  const abort = new AbortController();
  const overlay = document.createElement('section'); overlay.className = 'traffic-experience';
  overlay.setAttribute('aria-label', 'Experiencias de tránsito en tres dimensiones');
  const stage = document.createElement('div'); stage.className = 'traffic-scene';
  Object.assign(stage.style, { position: 'absolute', inset: '0' });
  const toolbar = document.createElement('section'); toolbar.className = 'traffic-toolbar';
  toolbar.setAttribute('aria-label', 'Escenarios de tránsito');
  const context = document.createElement('section'); context.className = 'traffic-context';
  const eyebrow = document.createElement('p'); eyebrow.className = 'traffic-eyebrow'; eyebrow.textContent = 'LA REINA · EXPERIENCIAS';
  const title = document.createElement('h1'); title.className = 'traffic-title'; title.textContent = 'Tránsito en el barrio';
  const subtitle = document.createElement('p'); subtitle.className = 'traffic-subtitle'; subtitle.textContent = 'Preparando el sector…';
  const badge = document.createElement('span'); badge.className = 'traffic-status'; badge.textContent = 'Simulación';
  const scenarioButtons = document.createElement('div'); scenarioButtons.className = 'traffic-scenario-buttons';
  scenarioButtons.setAttribute('aria-label', 'Horario de la experiencia');
  const description = document.createElement('p'); description.className = 'traffic-note';
  const playback = document.createElement('div'); playback.className = 'traffic-playback';
  const density = document.createElement('div'); density.className = 'traffic-density';
  const densityHeading = document.createElement('div'); densityHeading.className = 'traffic-density-heading';
  const densityLabel = document.createElement('label'); densityLabel.htmlFor = 'traffic-vehicle-count'; densityLabel.textContent = 'Cantidad de autos';
  const countOutput = document.createElement('output'); countOutput.id = 'traffic-count-value'; countOutput.htmlFor = 'traffic-vehicle-count';
  countOutput.textContent = String(requestedVehicleCount);
  densityHeading.append(densityLabel, countOutput);
  const densityControl = document.createElement('div'); densityControl.className = 'traffic-density-control';
  const countInput = document.createElement('input'); countInput.type = 'range'; countInput.id = 'traffic-vehicle-count';
  countInput.min = '0'; countInput.max = String(MAX_TRAFFIC_VEHICLES); countInput.step = '1'; countInput.value = String(requestedVehicleCount);
  countInput.setAttribute('aria-label', 'Cantidad de autos'); countInput.disabled = true;
  const densityScale = document.createElement('div'); densityScale.className = 'traffic-density-scale'; densityScale.setAttribute('aria-hidden', 'true');
  for (const value of [0, 25, 50, 75, MAX_TRAFFIC_VEHICLES]) { const tick = document.createElement('span'); tick.textContent = String(value); densityScale.append(tick); }
  const densityNote = document.createElement('p'); densityNote.className = 'traffic-density-note'; densityNote.textContent = 'Preparando los autos…';
  const metrics = document.createElement('p'); metrics.className = 'traffic-time traffic-note'; metrics.setAttribute('aria-live', 'off');
  const sourceNote = document.createElement('p'); sourceNote.className = 'traffic-note';
  sourceNote.textContent = 'Calles reales. Casas y circulación de muestra.';
  const dockHeading = document.createElement('div'); dockHeading.className = 'traffic-dock-heading';
  const dockLabel = document.createElement('strong'); dockLabel.textContent = 'Horario de circulación';
  dockHeading.append(dockLabel, metrics);
  const controls = [];
  function button(parent, id, label, callback, className = '') {
    const element = document.createElement('button'); element.type = 'button'; element.id = id;
    element.textContent = label; element.className = className;
    element.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); callback(); });
    parent.append(element); controls.push(element); return element;
  }
  const fewerButton = button(densityControl, 'traffic-count-decrease', '−', () => setVehicleCount(requestedVehicleCount - 1));
  fewerButton.setAttribute('aria-label', 'Disminuir un auto');
  densityControl.append(countInput); controls.push(countInput);
  const moreButton = button(densityControl, 'traffic-count-increase', '+', () => setVehicleCount(requestedVehicleCount + 1));
  moreButton.setAttribute('aria-label', 'Aumentar un auto');
  for (const element of [fewerButton, moreButton]) element.disabled = true;
  countInput.addEventListener('input', () => setVehicleCount(countInput.value));
  density.append(densityHeading, densityControl, densityScale, densityNote);
  const scenarioElements = scenarios.map(option => {
    const element = button(scenarioButtons, `traffic-scenario-${option.id}`, option.label, () => setScenario(option.id), 'traffic-scenario');
    const time = document.createElement('small'); time.textContent = option.time; element.append(time);
    element.dataset.scenario = option.id; element.disabled = true; return element;
  });
  const pauseButton = button(playback, 'traffic-toggle', 'Pausar', () => setPaused(!simulation?.snapshot().paused));
  const resetButton = button(playback, 'traffic-reset', 'Reiniciar', reset);
  const homeButton = button(playback, 'traffic-home', 'Centrar vista', home);
  const guidesButton = button(playback, 'traffic-guides', 'Recorridos', () => {
    guides = !guides; rendering?.setGuides(guides); guidesButton.setAttribute('aria-pressed', String(guides)); emit('guides');
  });
  guidesButton.setAttribute('aria-pressed', 'true');
  const viewButton = button(playback, 'traffic-view', 'Vista 2D', () => setViewMode(rendering?.info().viewMode === '2d' ? '3d' : '2d'));
  viewButton.setAttribute('aria-label', 'Alternar vista del mapa entre dos y tres dimensiones');
  const backButton = button(context, 'traffic-exit', '← Volver al mapa', () => { close(); onExit(); }, 'traffic-exit');
  context.prepend(eyebrow, title, subtitle, badge, sourceNote);
  toolbar.append(dockHeading, scenarioButtons, density, playback, description);
  for (const element of [pauseButton, resetButton, homeButton, guidesButton, viewButton]) element.disabled = true;
  const credit = document.createElement('aside'); credit.className = 'traffic-legend traffic-credits';
  const attribution = document.createElement('a'); attribution.href = 'https://www.openstreetmap.org/copyright';
  attribution.target = '_blank'; attribution.rel = 'noreferrer'; attribution.textContent = '© OpenStreetMap contributors';
  credit.append(attribution, ' · Modelos: Kenney (CC0)');
  overlay.dataset.state = 'loading';
  overlay.append(stage, context, toolbar, credit); container.append(overlay);

  const fetchJSON = async url => {
    const response = await fetch(url, { signal: abort.signal });
    if (!response.ok) throw new Error('No se pudieron cargar los recursos de la experiencia.');
    return response.json();
  };
  const ready = (async () => {
    data = await fetchJSON(sceneUrl);
    const manifest = await fetchJSON(data.assetsManifest || '/traffic/models/assets-manifest.json');
    if (destroyed) return;
    simulation = new TrafficSimulation(data.routes); simulation.setVehicleCount(requestedVehicleCount); simulation.setScenario(scenario);
    await document.fonts.ready;
    rendering = await createTrafficScene(stage, data, manifest);
    if (destroyed) { rendering.dispose(); rendering = null; return; }
    subtitle.textContent = data.name || 'Sector de muestra de La Reina';
    for (const element of controls) element.disabled = false;
    rendering.setScenario(scenario); rendering.render(simulation.snapshot()); updateStatus();
    lastFrame = performance.now(); frame = requestAnimationFrame(tick); emit('ready');
  })().catch(error => {
    if (destroyed || error.name === 'AbortError') return;
    failure = error.message || 'No se pudo preparar la escena tridimensional.';
    subtitle.textContent = 'No se pudo cargar la experiencia'; description.textContent = failure;
    badge.textContent = 'Recursos no disponibles'; overlay.dataset.state = 'error'; notify(failure);
    throw error;
  });
  ready.catch(() => {});

  function updateStatus() {
    if (!simulation) return;
    const snapshot = simulation.snapshot(), option = scenarios.find(item => item.id === scenario);
    for (const element of scenarioElements) {
      const selected = element.dataset.scenario === scenario;
      element.dataset.active = String(selected); element.setAttribute('aria-pressed', String(selected));
    }
    description.textContent = option.description;
    pauseButton.textContent = snapshot.paused ? 'Reanudar' : 'Pausar';
    pauseButton.setAttribute('aria-pressed', String(snapshot.paused));
    const activeCount = snapshot.activeCount ?? snapshot.vehicles.length, queuedCount = snapshot.queuedCount ?? 0;
    metrics.textContent = `${activeCount} en el mapa · ${elapsedLabel(snapshot.elapsed)}`;
    countInput.value = String(snapshot.vehicleCount); countOutput.value = String(snapshot.vehicleCount);
    countInput.style.setProperty('--range-progress', `${snapshot.vehicleCount / MAX_TRAFFIC_VEHICLES * 100}%`);
    countInput.setAttribute('aria-valuetext', `${snapshot.vehicleCount} autos; ${activeCount} en el mapa${queuedCount ? ` y ${queuedCount} por ingresar` : ''}`);
    fewerButton.disabled = snapshot.vehicleCount === 0; moreButton.disabled = snapshot.vehicleCount === MAX_TRAFFIC_VEHICLES;
    densityNote.textContent = snapshot.vehicleCount === 0 ? 'Sin autos en la simulación.'
      : queuedCount ? `${activeCount} en el mapa · ${queuedCount} por ingresar cuando haya espacio.` : `${activeCount} en el mapa · Hasta ${MAX_TRAFFIC_VEHICLES} autos.`;
    overlay.dataset.state = snapshot.paused ? 'paused' : 'running'; overlay.dataset.scenario = scenario;
  }
  function tick(now) {
    if (destroyed || !opened) return;
    const delta = document.hidden ? 0 : Math.min(.1, Math.max(0, (now - lastFrame) / 1000)); lastFrame = now;
    simulation.update(delta); rendering.render(simulation.snapshot());
    if (now - lastStatus > 250) { updateStatus(); lastStatus = now; }
    frame = requestAnimationFrame(tick);
  }
  function info() {
    return { isOpen: opened && !destroyed, ready: !!rendering, error: failure, name: data?.name || '', centre: data?.center,
      ...simulation?.snapshot(), ...rendering?.info() };
  }
  function emit(reason) { onChange({ reason, ...info() }); }
  function setScenario(id) {
    if (!simulation || !scenarios.some(option => option.id === id)) return false;
    scenario = id; simulation.setScenario(id); rendering.setScenario(id); updateStatus(); emit('scenario'); return true;
  }
  function setPaused(value) { if (simulation) { simulation.setPaused(!!value); updateStatus(); emit('pause'); } }
  function setVehicleCount(value) {
    if (!simulation || destroyed) return false;
    requestedVehicleCount = normalizeVehicleCount(value); simulation.setVehicleCount(requestedVehicleCount);
    rendering?.render(simulation.snapshot()); updateStatus();
    if (persistVehicleCount) { try { localStorage.setItem(vehicleCountPreference, String(requestedVehicleCount)); } catch {} }
    emit('vehicle-count'); return true;
  }
  function reset() { if (simulation) { simulation.reset(); updateStatus(); emit('reset'); } }
  function home() { if (rendering) { rendering.home(); emit('home'); } }
  function setViewMode(value) {
    if (!rendering?.setViewMode || !['2d', '3d'].includes(value)) return false;
    rendering.setViewMode(value); viewButton.textContent = value === '2d' ? 'Vista 3D' : 'Vista 2D';
    viewButton.setAttribute('aria-pressed', String(value === '2d')); emit('view'); return true;
  }
  function setVisible(value) {
    if (destroyed) return;
    const next = !!value;
    if (opened === next) return;
    opened = next; overlay.hidden = !opened;
    cancelAnimationFrame(frame);
    if (opened && rendering) { rendering.resize(); lastFrame = performance.now(); frame = requestAnimationFrame(tick); }
    emit(opened ? 'open' : 'close');
  }
  function close() { setVisible(false); }
  function targets() {
    if (!opened || destroyed) return [];
    const box = container.getBoundingClientRect();
    return controls.filter(element => !element.disabled && element.getClientRects().length).flatMap(element => {
      const rect = element.getBoundingClientRect();
      // Each dwell zone clicks its own position on the native range. Registering
      // one target for the entire rail would always select its centre value.
      if (element === countInput) return Array.from({ length: 11 }, (_, index) => ({
        id: `traffic-count-${index * 10}`, x: rect.left + 10 + (rect.width - 20) * index / 10 - box.left,
        y: rect.top + rect.height / 2 - box.top, width: Math.max(32, (rect.width - 20) / 10), height: rect.height,
        element, priority: 20, value: index * 10
      }));
      return [{ id: element.id, x: rect.left + rect.width / 2 - box.left, y: rect.top + rect.height / 2 - box.top,
        width: rect.width, height: rect.height, element, priority: 20 }];
    });
  }
  const onContextError = event => { failure = event.detail; description.textContent = failure; notify(failure); };
  stage.addEventListener('traffic-render-error', onContextError);
  // Leaflet must not receive pointer events from the WebGL camera or its toolbar.
  for (const type of ['pointerdown', 'mousedown', 'touchstart', 'click', 'dblclick', 'wheel']) overlay.addEventListener(type, event => event.stopPropagation());
  return { ready, get isOpen() { return opened && !destroyed; },
    open() { setVisible(true); }, close, setVisible, setScenario, setPaused, setVehicleCount, reset, home, setViewMode, targets, info,
    pan(dx, dy) { if (opened) rendering?.pan(dx, dy); },
    zoom(delta, x, y) { if (opened) rendering?.zoom(delta, x, y); },
    destroy() {
      if (destroyed) return; opened = false; destroyed = true; cancelAnimationFrame(frame); abort.abort();
      stage.removeEventListener('traffic-render-error', onContextError); rendering?.dispose(); rendering = null; overlay.remove();
    }
  };
}
