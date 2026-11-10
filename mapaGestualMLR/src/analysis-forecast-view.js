import './analysis-forecast-ui.css';
import { FORECAST_YEARS, FORECAST_ASSUMPTIONS, FORECAST_METHODS, FORECAST_REACH_METRES, readForecastArtifact, buildForecastSurface, forecastAt } from './analysis-forecast.js';

const counts = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 });
const percentage = new Intl.NumberFormat('es-CL', { style: 'percent', maximumFractionDigits: 2 });
const measures = { camera: 'Cámara monitoreada', fixed: 'Caseta con personal' };
const placementLimit = 24;

export function createForecastView(overlay, container, { map, signal, inside, onExit, renderSurface, renderPlacements }) {
  let model, loading, surface, selectedPoint, placing, serial = 0;
  let year = FORECAST_YEARS.find(value => Number(value) === 2027) ?? FORECAST_YEARS[0];
  let assumption = 'conservative', display = 'scenario', placements = [];

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
  function options(label, key, values, action) {
    const fieldset = element('fieldset', 'analysis-filter');
    const row = element('div', 'analysis-options forecast-options');
    const buttons = new Map(values.map(([value, label]) => [
      value, button(`${key}-${value}`, label, () => action(value))
    ]));
    row.append(...buttons.values());
    fieldset.append(element('legend', null, label), row);
    return { fieldset, buttons };
  }
  function markSelected(group, value) {
    for (const [key, choice] of group.buttons) choice.setAttribute('aria-pressed', String(key === value));
  }

  const panel = element('section', 'analysis-panel forecast-panel');
  panel.dataset.side = 'left';
  panel.setAttribute('aria-labelledby', 'forecast-title');
  panel.hidden = true;
  const title = element('h1', null, 'Simular futuro');
  title.id = 'forecast-title';
  title.tabIndex = -1;
  const heading = element('div', 'analysis-title-row');
  heading.append(title);
  const header = element('header', 'analysis-heading');
  const back = button('back', '← Histórico', onExit);
  header.append(back, heading, element('p', 'forecast-caption', 'Robos · entrenamiento con datos simulados'));

  const body = element('div', 'analysis-body');
  const loadStatus = element('p', 'forecast-caption', 'Cargando la proyección…');
  loadStatus.setAttribute('role', 'status');
  const controls = element('div', 'forecast-controls');
  controls.hidden = true;
  const years = options('Año de proyección', 'year', FORECAST_YEARS.map(value => [value, String(value)]), value => {
    year = value;
    redraw();
  });
  const displays = options('Ver en el mapa', 'display', [['baseline', 'Sin medidas'], ['scenario', 'Con medidas']], value => {
    display = value;
    redraw();
  });
  const devices = options('Agregar al escenario', 'add', Object.entries(measures), value => {
    placing = placing === value ? null : value;
    message.textContent = '';
    updatePlacementTools();
  });
  const assumptions = options('Supuesto de efecto', 'effect', [['none', 'Sin efecto'], ['conservative', 'Bajo'], ['illustrative', 'Alto']], value => {
    assumption = value;
    redraw();
  });
  const values = element('p', 'forecast-caption');
  const placementTools = element('div', 'forecast-placement-tools');
  const aimButton = button('aim-add', 'Colocar en la mira', () => {
    const point = map.screenToLocation(reticle.offsetLeft, reticle.offsetTop);
    if (point) addPlacement(point);
  });
  aimButton.hidden = true;
  const undo = button('undo', 'Deshacer última', () => {
    placements = placements.slice(0, -1);
    redraw();
    if (undo.disabled) devices.buttons.get(placing ?? 'camera').focus({ preventScroll: true });
  });
  const clear = button('clear', 'Quitar todas', () => {
    placements = [];
    message.textContent = 'Se quitaron las medidas del escenario.';
    redraw();
    devices.buttons.get(placing ?? 'camera').focus({ preventScroll: true });
  });
  placementTools.append(aimButton, undo, clear);
  const message = element('p', 'forecast-message');
  message.setAttribute('role', 'status');
  const legend = element('div', 'forecast-scale');
  legend.setAttribute('aria-label', 'Escala fija de intensidad estimada');
  const gradient = element('span', 'forecast-gradient');
  gradient.setAttribute('aria-hidden', 'true');
  legend.append(element('span', null, 'Menor'), gradient, element('span', null, 'Mayor'));

  const method = element('div', 'forecast-method');
  method.id = 'forecast-method-content';
  method.hidden = true;
  const methodToggle = button('method', 'Método y validación', () => {
    method.hidden = !method.hidden;
    methodToggle.setAttribute('aria-expanded', String(!method.hidden));
  });
  methodToggle.setAttribute('aria-expanded', 'false');
  methodToggle.setAttribute('aria-controls', method.id);
  const validation = element('p');
  method.append(validation, element('p', null,
    `La influencia supuesta cae con la distancia hasta ${FORECAST_REACH_METRES.camera} m para cámaras y ${FORECAST_REACH_METRES.fixed} m para casetas. Los efectos requieren validación con registros reales de La Reina.`));
  controls.append(years.fieldset, displays.fieldset, legend, devices.fieldset, placementTools, message,
    assumptions.fieldset, values, methodToggle, method);
  body.append(loadStatus, controls);
  panel.append(header, body);

  const readout = element('aside', 'forecast-readout');
  readout.hidden = true;
  readout.setAttribute('aria-label', 'Resultados de la simulación');
  const resultLabel = element('strong', 'forecast-result-label');
  const metrics = element('dl');
  const metricValues = ['Sin medidas', 'Con medidas', 'Variación'].map(label => {
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
    markSelected(devices, placing);
    reticle.hidden = aimButton.hidden = !armed;
    container.classList.toggle('forecast-placing', !panel.hidden && armed);
    aimButton.setAttribute('aria-label', armed ? `Colocar en la mira: ${measures[placing]}` : 'Colocar en la mira');
    if (armed && !message.textContent) message.textContent = 'Marca un punto en el mapa o usa la mira.';
  }
  function addPlacement(point) {
    if (!placing || !inside(point.lng, point.lat)) {
      message.textContent = 'Elige un punto dentro de La Reina.';
      return;
    }
    if (placements.length >= placementLimit) {
      message.textContent = `El escenario admite hasta ${placementLimit} medidas.`;
      return;
    }
    if (placements.some(item => Math.hypot(item.lat - point.lat, (item.lng - point.lng) * .83) < .00012)) {
      message.textContent = 'Ya hay una medida en ese punto.';
      return;
    }
    const returnFocus = document.activeElement === aimButton;
    placements.push({ id: String(++serial), kind: placing, lat: point.lat, lng: point.lng });
    selectedPoint = point;
    display = 'scenario';
    const added = measures[placing];
    placing = null;
    message.textContent = `${added} incorporada.`;
    redraw();
    if (returnFocus) devices.buttons.get(placements.at(-1).kind).focus({ preventScroll: true });
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
  function redraw() {
    if (!model || panel.hidden) return;
    surface = buildForecastSurface(model, { year, placements, assumption });
    const image = display === 'baseline' && placements.length
      ? buildForecastSurface(model, { year, assumption: 'none' })
      : surface;
    renderSurface(image);
    renderPlacements(placements.map(({ kind, ...point }) => ({
      ...point, id: `escenario-${point.id}`, kind, scenario: true,
      title: `Quitar ${measures[kind].toLowerCase()}`,
      address: `Medida ${point.id} del escenario`
    })));
    markSelected(years, year);
    markSelected(displays, display);
    markSelected(assumptions, assumption);
    updatePlacementTools();
    const effect = FORECAST_ASSUMPTIONS[assumption];
    values.textContent = `Máximo por medida · Cámara ${percentage.format(effect.camera)} · Caseta ${percentage.format(effect.fixed)}. Tope local combinado ${percentage.format(effect.cap)}.`;
    undo.disabled = clear.disabled = placements.length === 0;
    readout.hidden = false;
    updateReadout();
  }

  function inspect(point) {
    if (!surface || !point || !inside(point.lng, point.lat)) return;
    selectedPoint = point;
    updateReadout();
  }

  return {
    panel,
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
          model = readForecastArtifact(payload);
          const { metrics, selectedMethod, heldOutYear } = model.validation;
          validation.textContent = `Prueba con datos simulados de ${heldOutYear}. ${FORECAST_METHODS[selectedMethod]}: ${counts.format(metrics[selectedMethod].mae)} robos de error medio por celda. Red neuronal propia: ${counts.format(metrics.network.mae)}. La proyección usa el método con menor error en esta prueba.`;
          loadStatus.hidden = true;
          controls.hidden = false;
          redraw();
        })
        .catch(() => { if (!signal.aborted) loadStatus.textContent = 'No se pudo cargar la proyección. Vuelve al histórico para reintentar.'; })
        .finally(() => { loading = null; });
    },
    close() {
      panel.hidden = readout.hidden = true;
      placing = null;
      message.textContent = '';
      updatePlacementTools();
    },
    stopPlacing() {
      if (!placing) return false;
      const returnTo = devices.buttons.get(placing);
      const moveFocus = document.activeElement === aimButton;
      placing = null;
      message.textContent = '';
      updatePlacementTools();
      if (moveFocus) returnTo.focus({ preventScroll: true });
      return true;
    },
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
