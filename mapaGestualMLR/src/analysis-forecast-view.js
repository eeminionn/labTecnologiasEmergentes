import './analysis-forecast-ui.css';
import { FORECAST_YEARS, readForecastArtifact, buildForecastSurface, forecastAt } from './analysis-forecast.js';

const counts = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 });
const percentage = new Intl.NumberFormat('es-CL', { style: 'percent', maximumFractionDigits: 2 });
const measures = { camera: 'Cámara monitoreada', fixed: 'Caseta con personal' };
const [year] = FORECAST_YEARS;

export function createForecastView(overlay, container, { map, signal, inside, onExit, renderSurface, renderPlacements, onChange = () => {} }) {
  let model, loading, baselineSurface, surface, selectedPoint, placing, serial = 0;
  let showAfter = true, placements = [];

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function button(id, label, onClick, className) {
    const node = element('button', className, label);
    node.id = `forecast-${id}`;
    node.type = 'button';
    node.addEventListener('click', onClick);
    return node;
  }
  const panel = element('section', 'analysis-panel forecast-panel');
  panel.dataset.side = 'left';
  panel.setAttribute('aria-labelledby', 'forecast-title');
  panel.hidden = true;
  const title = element('h1', null, 'Simular inversión');
  title.id = 'forecast-title';
  title.tabIndex = -1;
  const heading = element('div', 'analysis-title-row');
  heading.append(title);
  const header = element('header', 'analysis-heading');
  const back = button('back', '← Histórico', onExit);
  header.append(back, heading, element('p', 'forecast-caption', `Robos · Proyección ${year} · Demostración`));

  const body = element('div', 'analysis-body');
  const loadStatus = element('p', 'forecast-caption', 'Cargando la proyección…');
  loadStatus.setAttribute('role', 'status');
  const controls = element('div', 'forecast-controls');
  controls.hidden = true;
  const viewStatus = element('span', 'forecast-view-status');
  viewStatus.setAttribute('role', 'status');
  const viewToggle = button('view-toggle', 'Ver antes', () => {
    showAfter = !showAfter;
    renderMap();
  });
  const viewRow = element('div', 'forecast-view-row');
  viewRow.append(viewStatus, viewToggle);
  const devices = element('fieldset', 'analysis-filter');
  const deviceRow = element('div', 'analysis-options forecast-options');
  const deviceButtons = new Map(Object.entries(measures).map(([kind, label]) => [kind, button(`add-${kind}`, label, () => {
    placing = placing === kind ? null : kind;
    message.textContent = '';
    updatePlacementTools();
  })]));
  deviceRow.append(...deviceButtons.values());
  devices.append(element('legend', null, 'Agregar al escenario'), deviceRow);
  const placementTools = element('div', 'forecast-placement-tools');
  const aimButton = button('aim-add', 'Colocar en la mira', () => {
    const point = map.screenToLocation(reticle.offsetLeft, reticle.offsetTop);
    if (point) addPlacement(point);
  });
  aimButton.hidden = true;
  const finish = button('finish', 'Terminar', stopPlacing);
  finish.hidden = true;
  const undo = button('undo', 'Deshacer última', () => {
    placements = placements.slice(0, -1);
    message.textContent = 'Se retiró la última medida.';
    redraw();
    if (undo.disabled) deviceButtons.get(placing ?? 'camera').focus({ preventScroll: true });
  });
  const clear = button('clear', 'Quitar todas', () => {
    placements = [];
    message.textContent = 'Se quitaron las medidas del escenario.';
    redraw();
    deviceButtons.get(placing ?? 'camera').focus({ preventScroll: true });
  });
  placementTools.append(aimButton, finish, undo, clear);
  const message = element('p', 'forecast-message');
  message.setAttribute('role', 'status');
  const legend = element('div', 'forecast-scale');
  legend.setAttribute('aria-label', 'Escala fija de intensidad estimada');
  const gradient = element('span', 'forecast-gradient');
  gradient.setAttribute('aria-hidden', 'true');
  legend.append(element('span', null, 'Menor'), gradient, element('span', null, 'Mayor'));

  controls.append(viewRow, legend, devices, placementTools, message);
  body.append(loadStatus, controls);
  panel.append(header, body);

  const readout = element('aside', 'forecast-readout');
  readout.hidden = true;
  readout.setAttribute('aria-label', 'Resultados de la simulación');
  const resultLabel = element('strong', 'forecast-result-label');
  const metrics = element('dl');
  const metricValues = ['Antes', 'Después simulado', 'Variación'].map(label => {
    const item = element('div');
    const value = element('dd', null, '—');
    item.append(element('dt', null, label), value);
    metrics.append(item);
    return value;
  });
  const resultNote = element('small');
  readout.append(resultLabel, metrics, resultNote);
  const reticle = element('div', 'forecast-reticle');
  reticle.hidden = true;
  reticle.setAttribute('aria-hidden', 'true');
  overlay.append(panel, readout, reticle);
  for (const node of [panel, readout]) {
    for (const event of ['pointerdown', 'mousedown', 'touchstart', 'click', 'dblclick', 'wheel']) {
      node.addEventListener(event, input => input.stopPropagation());
    }
  }

  function updatePlacementTools() {
    const armed = Boolean(placing);
    for (const [kind, choice] of deviceButtons) choice.setAttribute('aria-pressed', String(kind === placing));
    reticle.hidden = aimButton.hidden = finish.hidden = !armed;
    container.classList.toggle('forecast-placing', !panel.hidden && armed);
    aimButton.setAttribute('aria-label', armed ? `Colocar en la mira: ${measures[placing]}` : 'Colocar en la mira');
    if (armed && !message.textContent) message.textContent = 'Marca un punto en el mapa o usa la mira.';
  }
  function stopPlacing() {
    if (!placing) return false;
    const returnTo = deviceButtons.get(placing);
    const moveFocus = [aimButton, finish].includes(document.activeElement);
    placing = null;
    message.textContent = '';
    updatePlacementTools();
    if (moveFocus) returnTo.focus({ preventScroll: true });
    return true;
  }
  function addPlacement(point) {
    if (!placing || !inside(point.lng, point.lat)) {
      message.textContent = 'Elige un punto dentro de La Reina.';
      return;
    }
    if (placements.some(item => Math.hypot(item.lat - point.lat, (item.lng - point.lng) * .83) < .00012)) {
      message.textContent = 'Ya hay una medida en ese punto.';
      return;
    }
    placements.push({ id: String(++serial), kind: placing, lat: point.lat, lng: point.lng });
    selectedPoint = point;
    showAfter = true;
    const plural = placements.length === 1 ? 'medida agregada' : 'medidas agregadas';
    message.textContent = `${counts.format(placements.length)} ${plural}. Puedes seguir colocando ${placing === 'camera' ? 'cámaras' : 'casetas'}.`;
    redraw();
  }
  function updateReadout() {
    if (!surface) return;
    const local = selectedPoint && forecastAt(surface, selectedPoint);
    const baseline = local?.baseline ?? surface.baselineTotal;
    const scenario = local?.scenario ?? surface.scenarioTotal;
    const reduction = local?.reduction ?? surface.reduction;
    const label = local ? `Sector consultado · ${year}` : `La Reina · ${year}`;
    if (resultLabel.textContent !== label) resultLabel.textContent = label;
    const variation = reduction > 0 ? `−${percentage.format(reduction)}` : '0 %';
    for (const [index, value] of [counts.format(baseline), counts.format(scenario), variation].entries()) {
      if (metricValues[index].textContent !== value) metricValues[index].textContent = value;
    }
    const note = local ? 'Robos estimados en el sector por año' : 'Robos estimados en la comuna por año';
    if (resultNote.textContent !== note) resultNote.textContent = note;
  }
  function renderMap() {
    renderSurface(showAfter ? surface : baselineSurface);
    const visiblePlacements = showAfter ? placements : [];
    renderPlacements(visiblePlacements.map(({ kind, ...point }) => ({
      ...point, id: `escenario-${point.id}`, kind, scenario: true,
      title: `Quitar ${measures[kind].toLowerCase()}`,
      address: `Medida ${point.id} del escenario`
    })));
    viewStatus.textContent = showAfter ? 'Después · simulado' : 'Antes · sin medidas';
    viewToggle.textContent = showAfter ? 'Ver antes' : 'Ver después';
    onChange(info());
  }
  function redraw() {
    if (!model || panel.hidden) return;
    surface = placements.length ? buildForecastSurface(model, { year, placements, assumption: 'illustrative' }) : baselineSurface;
    renderMap();
    updatePlacementTools();
    undo.disabled = clear.disabled = placements.length === 0;
    readout.hidden = false;
    updateReadout();
  }

  function inspect(point) {
    if (!surface || !point || !inside(point.lng, point.lat)) return;
    selectedPoint = point;
    updateReadout();
  }

  function info() {
    return {
      year, showAfter, placements: placements.map(point => ({ ...point })),
      baselineTotal: surface?.baselineTotal ?? null,
      scenarioTotal: surface?.scenarioTotal ?? null,
      reduction: surface?.reduction ?? null,
      ready: Boolean(model), error: loading ? '' : loadStatus.hidden ? '' : loadStatus.textContent
    };
  }

  return {
    panel,
    info,
    get active() { return !panel.hidden; },
    get isPlacing() { return Boolean(placing); },
    open() {
      panel.hidden = false;
      if (model) { redraw(); return; }
      if (loading) return;
      loadStatus.hidden = false;
      loadStatus.textContent = 'Cargando la proyección…';
      loading = fetch('/analysis/pronostico-robos.json', { signal })
        .then(response => {
          if (!response.ok) throw new Error('Archivo de proyección no disponible.');
          return response.json();
        })
        .then(payload => {
          const checkedModel = readForecastArtifact(payload);
          baselineSurface = buildForecastSurface(checkedModel, { year, assumption: 'none' });
          model = checkedModel;
          loadStatus.hidden = true;
          controls.hidden = false;
          redraw();
        })
        .catch(() => { if (!signal.aborted) loadStatus.textContent = 'No se pudo cargar la proyección. Vuelve al histórico para reintentar.'; })
        .finally(() => {
          loading = null;
          if(!signal.aborted&&!panel.hidden)onChange(info());
        });
    },
    close() {
      panel.hidden = readout.hidden = true;
      placing = null;
      message.textContent = '';
      updatePlacementTools();
    },
    stopPlacing,
    inspect,
    click(point) {
      if (!surface || !point) return;
      if (placing) addPlacement(point);
      else inspect(point);
    },
    remove(id) {
      const remaining = placements.filter(item => `escenario-${item.id}` !== id);
      if (remaining.length === placements.length) return;
      placements = remaining;
      message.textContent = 'Medida retirada del escenario.';
      redraw();
    },
    targets() {
      if (panel.hidden) return [];
      const outer = container.getBoundingClientRect();
      const scroll = body.getBoundingClientRect();
      return [...panel.querySelectorAll('button')].flatMap(node => {
        if (node.disabled || !node.getClientRects().length) return [];
        const rect = node.getBoundingClientRect();
        if (body.contains(node) && (rect.top < scroll.top || rect.bottom > scroll.bottom)) return [];
        return [{ id: node.id, x: rect.left + rect.width / 2 - outer.left, y: rect.top + rect.height / 2 - outer.top,
          width: rect.width, height: rect.height, element: node, priority: 25 }];
      });
    }
  };
}
