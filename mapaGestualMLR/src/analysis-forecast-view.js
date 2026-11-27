import './analysis-forecast-ui.css';
import { FORECAST_YEARS, readForecastArtifact, buildForecastSurface, forecastAt,
  indexForecastAreas, summarizeForecastArea } from './analysis-forecast.js';
import { toggleAnalysisArea } from './analysis-quadrants.js';
import { assetUrl } from './asset-url.js';
import { HEAT_COLOR_STOPS } from './analysis-data.js';

const counts = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 });
const percentage = new Intl.NumberFormat('es-CL', { style: 'percent', maximumFractionDigits: 2 });
const measures = { camera: 'Cámara monitoreada', fixed: 'Caseta con personal' };
const toolIcons = {
  camera: 'M3 6h13v10H3zM16 9l5-3v10l-5-3M8 16v4m-4 0h8',
  fixed: 'M3 21h18M5 21V10l7-5 7 5v11M10 21v-6h4v6M12 5V2m0 1h5'
};
const [year] = FORECAST_YEARS;

function placementCursor(kind) {
  const color = kind === 'camera' ? '#006a85' : '#6e2663';
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="30" viewBox="0 0 34 30">'
    + '<rect x="9" y="2" width="23" height="22" rx="5" fill="' + color + '" stroke="white" stroke-width="1.5"/>'
    + '<path transform="translate(12 4) scale(.73)" d="' + toolIcons[kind] + '" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<circle cx="7" cy="23" r="5.5" fill="white" stroke="' + color + '" stroke-width="1.5"/>'
    + '<path d="M4.5 23h5M7 20.5v5" stroke="' + color + '" stroke-width="1.4" stroke-linecap="round"/></svg>';
  return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '") 7 23, crosshair';
}

export function createForecastView(overlay, container, {
  map, signal, inside, quadrantOf, units, normalizeArea, areaLabel,
  onExit, onScopeChange, renderSurface, renderPlacements, onChange = () => {}
}) {
  let model, loading, baselineSurface, surface, cellAreas, totals, selectedPoint, localReadout, placing, serial = 0;
  let showAfter = true, placements = [], includedPlacements = [];
  let scopeIds = null, scope = null, selectingScope = false;

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
  panel.dataset.theme = 'seguridad';
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
  const area = element('fieldset', 'analysis-filter forecast-area');
  const scopeLabel = element('p', 'analysis-spatial-context');
  scopeLabel.setAttribute('role', 'status');
  const scopeTrigger = button('area-edit', 'Elegir cuadrantes', () => setScopeEditing(!selectingScope), 'analysis-area-trigger');
  scopeTrigger.setAttribute('aria-expanded', 'false');
  const areaTools = element('div', 'forecast-area-tools');
  areaTools.id = 'forecast-area-tools';
  areaTools.hidden = true;
  scopeTrigger.setAttribute('aria-controls', areaTools.id);
  const scopeActions = element('div', 'analysis-area-actions');
  const whole = button('area-all', 'Toda la comuna', () => setScope(null), 'analysis-quadrant-reset');
  const empty = button('area-empty', 'Quitar selección', () => setScope([]), 'analysis-quadrant-reset');
  scopeActions.append(whole, empty);
  const scopeSelect = element('select');
  scopeSelect.id = 'forecast-area-select';
  scopeSelect.append(new Option('Elegir por código…', ''));
  const unitIDs = new Map();
  for (const unit of units) {
    const group = element('optgroup');
    group.label = `Unidad ${unit.label}`;
    unitIDs.set(unit.id, unit.children.map(child => child.id));
    group.append(new Option(`Toda la unidad ${unit.label}`, unit.id),
      ...unit.children.map(child => new Option(`Subcuadrante ${child.label}`, child.id)));
    scopeSelect.append(group);
  }
  const scopeField = element('label', 'forecast-scope-select');
  scopeField.append(element('span', null, 'Unidad o subcuadrante'), scopeSelect);
  const scopeToggle = button('area-toggle', 'Incluir', () => {
    const id = scopeSelect.value;
    if (id) toggleScope(unitIDs.get(id) ?? [id]);
  }, 'analysis-quadrant-reset');
  scopeToggle.disabled = true;
  scopeSelect.onchange = updateScopeChoice;
  const areaChoice = element('div', 'forecast-scope-choice');
  areaChoice.append(scopeField, scopeToggle);
  const areaAim = button('area-aim', 'Seleccionar cuadrante en la mira', () => {
    const point = map.screenToLocation(reticle.offsetLeft, reticle.offsetTop);
    const id = point && quadrantOf(point);
    if (id) toggleScope([id]);
  }, 'analysis-quadrant-reset');
  areaTools.append(scopeActions, areaChoice, areaAim);
  area.append(element('legend', null, 'Área de inversión'), scopeLabel, scopeTrigger, areaTools);
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
    if (selectingScope) setScopeEditing(false);
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
  const finish = button('finish', 'Dejar de agregar', stopPlacing);
  finish.hidden = true;
  const undo = button('undo', 'Deshacer última', () => {
    const last = includedPlacements.at(-1);
    if (last) placements = placements.filter(item => item !== last);
    message.textContent = 'Se retiró la última medida del área.';
    redraw();
    if (undo.disabled) deviceButtons.get(placing ?? 'camera').focus({ preventScroll: true });
  });
  const clear = button('clear', 'Quitar todas', () => {
    placements = placements.filter(point => !inScope(point.quadrantId));
    message.textContent = 'Se quitaron las medidas del área.';
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
  gradient.style.background = `linear-gradient(90deg, ${HEAT_COLOR_STOPS.map(({ value, color }) => `rgb(${color.join(',')}) ${value * 100}%`).join(', ')})`;
  legend.append(element('span', null, 'Menor'), gradient, element('span', null, 'Mayor'));

  controls.append(area, viewRow, legend, devices, placementTools, message);
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
  const outsideNote = element('small', 'forecast-outside-note');
  outsideNote.hidden = true;
  readout.append(resultLabel, metrics, resultNote, outsideNote);
  body.append(readout);
  const reticle = element('div', 'forecast-reticle');
  reticle.hidden = true;
  reticle.setAttribute('aria-hidden', 'true');
  overlay.append(panel, reticle);
  for (const event of ['pointerdown', 'mousedown', 'touchstart', 'click', 'dblclick', 'wheel']) {
    panel.addEventListener(event, input => input.stopPropagation());
  }

  const inScope = id => scope === null || scope.has(id);
  function updateScopeChoice() {
    const id = scopeSelect.value;
    scopeToggle.disabled = !id;
    const ids = unitIDs.get(id) ?? [id];
    scopeToggle.textContent = scope && ids.every(item => scope.has(item)) ? 'Quitar' : 'Incluir';
  }
  function updateScopeTools() {
    updateScopeChoice();
    scopeLabel.textContent = areaLabel(scopeIds);
    scopeTrigger.textContent = selectingScope ? 'Terminar selección' : 'Elegir cuadrantes';
    scopeTrigger.setAttribute('aria-expanded', String(selectingScope));
    areaTools.hidden = !selectingScope;
    whole.setAttribute('aria-pressed', String(scopeIds === null));
    empty.setAttribute('aria-pressed', String(scopeIds?.length === 0));
    container.classList.toggle('forecast-selecting', !panel.hidden && selectingScope);
    reticle.hidden = !selectingScope && !placing;
  }
  function setScopeEditing(value) {
    if (value && placing) stopPlacing();
    selectingScope = value;
    message.textContent = value ? 'Haz clic en el mapa para incluir o quitar cuadrantes.' : '';
    updateScopeTools();
    if (!panel.hidden) {
      if (value) {
        selectedPoint = null;
        if (updateReadout()) onChange(info());
      }
      onScopeChange();
    }
  }
  function setScope(ids) {
    const next = normalizeArea(ids);
    if (next === scopeIds || (next && scopeIds && next.join() === scopeIds.join())) return;
    scopeIds = next;
    scope = next && new Set(next);
    if (scope?.size === 0 && placing) stopPlacing();
    if (selectedPoint && !inScope(quadrantOf(selectedPoint))) selectedPoint = null;
    updateScopeTools();
    onScopeChange();
    redraw();
  }
  function toggleScope(ids) {
    setScope(toggleAnalysisArea(scopeIds, ids));
  }
  function updatePlacementTools() {
    const armed = Boolean(placing);
    for (const [kind, choice] of deviceButtons) choice.setAttribute('aria-pressed', String(kind === placing));
    aimButton.hidden = finish.hidden = !armed;
    reticle.hidden = !armed && !selectingScope;
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
    const id = quadrantOf(point);
    if (!id || !inScope(id)) {
      message.textContent = 'Elige un punto dentro del área seleccionada.';
      return;
    }
    if (placements.some(item => Math.hypot(item.lat - point.lat, (item.lng - point.lng) * .83) < .00012)) {
      message.textContent = 'Ya hay una medida en ese punto.';
      return;
    }
    placements.push({ id: String(++serial), kind: placing, lat: point.lat, lng: point.lng, quadrantId: id });
    selectedPoint = point;
    showAfter = true;
    const quantity = includedPlacements.length + 1;
    const plural = quantity === 1 ? 'medida en el área' : 'medidas en el área';
    message.textContent = `${counts.format(quantity)} ${plural}. Puedes seguir colocando ${placing === 'camera' ? 'cámaras' : 'casetas'}.`;
    redraw();
  }
  function updateReadout() {
    if (!surface) return false;
    const local = selectedPoint && forecastAt(surface, selectedPoint);
    const { baselineTotal, scenarioTotal, reduction } = totals ?? {};
    const label = `${areaLabel(scopeIds)} · ${year}`;
    if (resultLabel.textContent !== label) resultLabel.textContent = label;
    const variation = reduction > 0 ? `−${percentage.format(reduction)}` : '0 %';
    const values = totals ? [counts.format(baselineTotal), counts.format(scenarioTotal), variation] : ['—', '—', '—'];
    for (const [index, value] of values.entries()) {
      if (metricValues[index].textContent !== value) metricValues[index].textContent = value;
    }
    const note = totals ? 'Robos estimados en el área por año' : 'Selecciona al menos un subcuadrante.';
    if (resultNote.textContent !== note) resultNote.textContent = note;
    const outsideCount = placements.length - includedPlacements.length;
    outsideNote.hidden = !outsideCount;
    if (outsideCount) outsideNote.textContent = outsideCount === 1 ? '1 medida fuera del área se conserva.'
      : `${counts.format(outsideCount)} medidas fuera del área se conservan.`;
    const next = local ? { ...local, id: quadrantOf(selectedPoint) } : null;
    if (next && localReadout && Object.keys(next).every(key => next[key] === localReadout[key])) return false;
    const changed = Boolean(next || localReadout);
    localReadout = next;
    return changed;
  }
  function renderMap() {
    renderSurface(baselineSurface, surface, scopeIds, showAfter);
    const visiblePlacements = showAfter ? includedPlacements : [];
    renderPlacements(visiblePlacements.map(({ kind, ...point }) => ({
      ...point, id: `escenario-${point.id}`, kind, scenario: true,
      title: `Quitar ${measures[kind].toLowerCase()}`,
      address: `Medida ${point.id} del escenario`
    })));
    viewStatus.textContent = showAfter ? 'Con inversión' : 'Antes · sin medidas';
    viewToggle.textContent = showAfter ? 'Ver antes' : 'Ver con inversión';
    updateReadout();
    onChange(info());
  }
  function redraw() {
    if (!model || panel.hidden) return;
    includedPlacements = placements.filter(point => inScope(point.quadrantId));
    surface = includedPlacements.length
      ? buildForecastSurface(model, { year, placements: includedPlacements, assumption: 'illustrative' }) : baselineSurface;
    totals = scope?.size === 0 ? null : summarizeForecastArea(surface, scope, cellAreas);
    renderMap();
    updatePlacementTools();
    for (const choice of deviceButtons.values()) choice.disabled = scope?.size === 0;
    undo.disabled = clear.disabled = includedPlacements.length === 0;
    clear.textContent = scope === null ? 'Quitar todas' : 'Quitar del área';
    readout.hidden = false;
  }

  function inspect(point) {
    if (!surface || selectingScope) return;
    selectedPoint = point && inScope(quadrantOf(point)) && inside(point.lng, point.lat) ? point : null;
    if (updateReadout()) onChange(info());
  }

  function info() {
    return {
      year, showAfter, placements: includedPlacements.map(point => ({ ...point })),
      outsideCount: placements.length - includedPlacements.length,
      areaLabel: areaLabel(scopeIds),
      baselineTotal: totals?.baselineTotal ?? null,
      scenarioTotal: totals?.scenarioTotal ?? null,
      reduction: totals?.reduction ?? null,
      local: localReadout ?? null,
      ready: Boolean(model), error: loading ? '' : loadStatus.hidden ? '' : loadStatus.textContent
    };
  }

  return {
    panel,
    info,
    get active() { return !panel.hidden; },
    get isPlacing() { return Boolean(placing); },
    get isSelectingScope() { return selectingScope; },
    get scopeIds() { return scopeIds; },
    open(ids) {
      panel.hidden = false;
      scopeIds = ids;
      scope = ids && new Set(ids);
      selectedPoint = localReadout = null;
      updateScopeTools();
      if (model) { redraw(); return; }
      if (loading) return;
      loadStatus.hidden = false;
      loadStatus.textContent = 'Cargando la proyección…';
      loading = fetch(assetUrl('/analysis/pronostico-robos.json'), { signal })
        .then(response => {
          if (!response.ok) throw new Error('Archivo de proyección no disponible.');
          return response.json();
        })
        .then(payload => {
          const checkedModel = readForecastArtifact(payload);
          baselineSurface = buildForecastSurface(checkedModel, { year, assumption: 'none' });
          cellAreas = indexForecastAreas(checkedModel, quadrantOf);
          model = checkedModel;
          loadStatus.hidden = true;
          controls.hidden = false;
          redraw();
        })
        .catch(error => {
          if (signal.aborted) return;
          console.error('No se pudo cargar la proyección.',error);
          loadStatus.textContent = 'No se pudo cargar la proyección. Vuelve a Análisis e inténtalo otra vez.';
        })
        .finally(() => {
          loading = null;
          if(!signal.aborted&&!panel.hidden)onChange(info());
        });
    },
    close() {
      panel.hidden = readout.hidden = true;
      placing = null;
      setScopeEditing(false);
      updatePlacementTools();
    },
    cancel() {
      if (selectingScope) {
        setScopeEditing(false);
        scopeTrigger.focus({ preventScroll: true });
        return;
      }
      stopPlacing();
    },
    inspect,
    click(point) {
      if (!surface || !point) return;
      if (selectingScope) {
        const id = quadrantOf(point);
        if (id) toggleScope([id]);
      } else if (placing) addPlacement(point);
      else inspect(point);
    },
    remove(id) {
      const remaining = placements.filter(item => !inScope(item.quadrantId) || `escenario-${item.id}` !== id);
      if (remaining.length === placements.length) return;
      placements = remaining;
      message.textContent = 'Medida retirada del escenario.';
      redraw();
    },
    targets() {
      if (panel.hidden) return [];
      const outer = container.getBoundingClientRect();
      const panelBounds = panel.getBoundingClientRect();
      const scroll = body.getBoundingClientRect();
      return [...panel.querySelectorAll('button')].flatMap(node => {
        if (node.disabled || !node.getClientRects().length) return [];
        const rect = node.getBoundingClientRect();
        if (rect.top < panelBounds.top || rect.bottom > panelBounds.bottom
          || body.contains(node) && (rect.top < scroll.top || rect.bottom > scroll.bottom)) return [];
        return [{ id: node.id, x: rect.left + rect.width / 2 - outer.left, y: rect.top + rect.height / 2 - outer.top,
          width: rect.width, height: rect.height, element: node, priority: 25 }];
      });
    }
  };
}
