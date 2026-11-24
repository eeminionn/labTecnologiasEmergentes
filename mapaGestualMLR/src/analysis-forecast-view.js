import './analysis-forecast-ui.css';
import { FORECAST_YEARS, readForecastArtifact, buildForecastSurface, forecastAt } from './analysis-forecast.js';

const counts = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 });
const percentage = new Intl.NumberFormat('es-CL', { style: 'percent', maximumFractionDigits: 2 });
const measures = { camera: 'Cámara monitoreada', fixed: 'Caseta con personal' };
const toolIcons = {
  camera: 'M3 6h13v10H3zM16 9l5-3v10l-5-3M8 16v4m-4 0h8',
  fixed: 'M3 21h18M5 21V10l7-5 7 5v11M10 21v-6h4v6M12 5V2m0 1h5'
};
const [year] = FORECAST_YEARS;

function placementCursor(kind) {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="30" viewBox="0 0 34 30">'
    + '<rect x="9" y="2" width="23" height="22" rx="5" fill="#00647c" stroke="white" stroke-width="1.5"/>'
    + '<path transform="translate(12 4) scale(.73)" d="' + toolIcons[kind] + '" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<circle cx="7" cy="23" r="5.5" fill="white" stroke="#00647c" stroke-width="1.5"/>'
    + '<path d="M4.5 23h5M7 20.5v5" stroke="#00647c" stroke-width="1.4" stroke-linecap="round"/></svg>';
  return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '") 7 23, crosshair';
}

export function createForecastView(overlay, container, { map, signal, inside, quadrantOf, onExit, renderSurface, renderPlacements, onChange = () => {} }) {
  let model, loading, baselineSurface, surface, selectedPoint, localReadout, placing, serial = 0;
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
  const back = button('back', '← Volver a Análisis', onExit);
  header.append(back, heading, element('p', 'forecast-caption', `Robos en La Reina · Proyección ${year}`));

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
  devices.append(element('legend', null, 'Agregar'), deviceRow);
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
  readout.setAttribute('aria-label', 'Resultados de la proyección');
  const resultLabel = element('strong', 'forecast-result-label');
  const metrics = element('dl');
  const metricValues = ['Antes', 'Con inversión', 'Variación'].map(label => {
    const item = element('div');
    const value = element('dd', null, '—');
    item.append(element('dt', null, label), value);
    metrics.append(item);
    return value;
  });
  const resultNote = element('small');
  readout.append(resultLabel, metrics, resultNote);
  body.append(readout);
  const reticle = element('div', 'forecast-reticle');
  reticle.hidden = true;
  reticle.setAttribute('aria-hidden', 'true');
  overlay.append(panel, reticle);
  for (const event of ['pointerdown', 'mousedown', 'touchstart', 'click', 'dblclick', 'wheel']) {
    panel.addEventListener(event, input => input.stopPropagation());
  }

  function updatePlacementTools() {
    const armed = Boolean(placing);
    for (const [kind, choice] of deviceButtons) choice.setAttribute('aria-pressed', String(kind === placing));
    reticle.hidden = aimButton.hidden = finish.hidden = !armed;
    container.classList.toggle('forecast-placing', !panel.hidden && armed);
    if (!panel.hidden && armed) container.style.setProperty('--forecast-cursor', placementCursor(placing));
    else container.style.removeProperty('--forecast-cursor');
    aimButton.setAttribute('aria-label', armed ? `Colocar en la mira: ${measures[placing]}` : 'Colocar en la mira');
    if (armed && !message.textContent) message.textContent = 'Marca un punto en el mapa.';
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
    placements.push({ id: String(++serial), kind: placing, lat: point.lat, lng: point.lng, quadrantId: quadrantOf(point) });
    selectedPoint = point;
    showAfter = true;
    const plural = placements.length === 1 ? 'medida agregada' : 'medidas agregadas';
    message.textContent = `${counts.format(placements.length)} ${plural}. Puedes seguir colocando ${placing === 'camera' ? 'cámaras' : 'casetas'}.`;
    redraw();
  }
  function updateReadout() {
    if (!surface) return false;
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
    const next = local ? { ...local, id: quadrantOf(selectedPoint) } : null;
    if (next && localReadout && Object.keys(next).every(key => next[key] === localReadout[key])) return false;
    const changed = Boolean(next || localReadout);
    localReadout = next;
    return changed;
  }
  function renderMap() {
    renderSurface(showAfter ? surface : baselineSurface);
    const visiblePlacements = showAfter ? placements : [];
    renderPlacements(visiblePlacements.map(({ kind, ...point }) => ({
      ...point, id: `escenario-${point.id}`, kind, scenario: true,
      title: `Quitar ${measures[kind].toLowerCase()}`,
      address: `Medida ${point.id} del escenario`
    })));
    viewStatus.textContent = showAfter ? 'Con inversión' : 'Antes · sin medidas';
    viewToggle.textContent = showAfter ? 'Ver antes' : 'Ver después';
    updateReadout();
    onChange(info());
  }
  function redraw() {
    if (!model || panel.hidden) return;
    surface = placements.length ? buildForecastSurface(model, { year, placements, assumption: 'illustrative' }) : baselineSurface;
    renderMap();
    updatePlacementTools();
    undo.disabled = clear.disabled = placements.length === 0;
    readout.hidden = false;
  }

  function inspect(point) {
    if (!surface || !point || !inside(point.lng, point.lat)) return;
    selectedPoint = point;
    if (updateReadout()) onChange(info());
  }

  function info() {
    return {
      year, showAfter, placements: placements.map(point => ({ ...point })),
      baselineTotal: surface?.baselineTotal ?? null,
      scenarioTotal: surface?.scenarioTotal ?? null,
      reduction: surface?.reduction ?? null,
      local: localReadout ?? null,
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
