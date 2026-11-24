import './glass-ui.css';
import './companion-ui.css';
import { buildInvestmentSummary, UF_REFERENCE } from './investment-data.js';
import { renderPreviousSession } from './previous-session-view.js';
import { createRobberyShare } from './robbery-share-view.js';
import { createCompanionTerritoryMap } from './companion-territory-map.js';
import { renderCompanionResource } from './companion-resource-view.js';

const number = new Intl.NumberFormat('es-CL');
const money = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
const decimals = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inUF = pesos => `${decimals.format(pesos / UF_REFERENCE.pesos)} UF`;
const date = value => value ? new Intl.DateTimeFormat('es-CL', { timeZone: 'UTC' }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`)) : 'Por definir';
const agendaViews = new WeakMap();
const territorialViews = new WeakMap();
const percentages = new Intl.NumberFormat('es-CL', { style: 'percent', maximumFractionDigits: 1 });
const names = {
  security: ['robo', 'robos', 'Robos'],
  cameras: ['cámara', 'cámaras', 'Cámaras'],
  fixed: ['caseta', 'casetas', 'Casetas'],
  alarms: ['botón', 'botones', 'Botones de emergencia']
};
const agendaStatusLabels = { current: 'En curso', reviewed: 'Revisado', pending: 'Pendiente' };
const agendaPriorities = { urgente: 'Urgente', prioritario: 'Prioritario', programado: 'Programado' };
const countName = (count, kind) => names[kind]?.[count === 1 ? 0 : 1] || 'registros';
const formatCount = (count, kind) => `${number.format(count)} ${countName(count, kind)}`;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function metric(label, value, note) {
  const node = element('div', 'companion-metric');
  node.append(element('dt', null, label), element('dd', null, value));
  if (note) node.append(element('small', null, note));
  return node;
}

function fact(label, value) {
  const node = element('div', 'companion-fact');
  node.append(element('dt', null, label), element('dd', null, value));
  return node;
}

function card(title) {
  const node = element('section', 'companion-card');
  node.append(element('h2', null, title));
  return node;
}

function brand() {
  const logo = element('img', 'companion-logo');
  logo.src = '/brand/la-reina-logo.png';
  logo.alt = 'Municipalidad de La Reina';
  return logo;
}

function shell() {
  const main = element('div', 'companion-shell');
  const top = element('header', 'companion-topbar');
  top.append(element('strong', null, 'La Reina'), element('span', null, 'Concejo en perspectiva'));
  const content = element('div', 'companion-content');
  const heading = element('header', 'companion-heading');
  const title = element('h1');
  title.id = 'companion-title';
  heading.append(title);
  const subtitle = element('p', 'companion-subtitle');
  heading.append(subtitle);
  content.append(heading);
  main.append(top, content);
  return { main, content, title, subtitle };
}

function budgetChart(budget) {
  const section = element('section', 'companion-forecast-breakdown');
  section.append(element('h3', null, 'Distribución de la inversión'));
  const list = element('dl', 'companion-cost-chart');
  const largest = Math.max(1, ...budget.breakdown.map(item => item.value));
  for (const item of budget.breakdown) {
    const row = element('div', 'companion-cost-row');
    row.dataset.category = item.key;
    const label = element('dt', null, item.label);
    const value = element('dd', null, money.format(item.value));
    const track = element('div', 'companion-cost-track');
    track.setAttribute('aria-hidden', 'true');
    const fill = element('span');
    fill.style.width = `${item.value / largest * 100}%`;
    track.append(fill);
    row.append(label, value, track);
    list.append(row);
  }
  section.append(list);
  return section;
}

function delivery(budget) {
  const section = element('section', 'companion-forecast-delivery');
  section.append(element('h3', null, `Plazo estimado · ${number.format(budget.totalDays)} días hábiles`));
  const list = element('ol', 'companion-delivery');
  budget.timeline.forEach(step => {
    const row = element('li');
    row.append(element('span', null, step.label), element('strong', null, `${number.format(step.days)} días`));
    list.append(row);
  });
  section.append(list, element('p', 'companion-analysis-note', `${budget.lead} · ${budget.unit}`));
  return section;
}

function budgetFooter() {
  return element('p', 'companion-footnote',
    `IVA incluido · UF al ${date(UF_REFERENCE.date)} (SII)`);
}

function quadrantsLabel(ids = []) {
  return ids.length ? (ids.length === 1 ? 'Cuadrante ' : 'Cuadrantes ') + ids.join(', ') : '';
}

function robberyShare(security, area = security.areaLabel) {
  return createRobberyShare({ count: security.total, total: security.communeTotal, period: security.period, area });
}

function updateAgendaClock(view, agenda) {
  const remaining = Number.isFinite(agenda.remainingSeconds) ? agenda.remainingSeconds : 0;
  const seconds = Math.abs(Math.trunc(remaining));
  const value = `${remaining < 0 ? '−' : ''}${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const overtime = agenda.overtime || remaining < 0;
  view.timerValue.textContent = value;
  view.timerLabel.textContent = overtime ? 'Tiempo excedido' : 'Tiempo restante';
  view.timerState.textContent = agenda.running ? 'En curso' : 'En pausa';
  view.timer.dataset.overtime = String(Boolean(overtime));
  const duration = Number(agenda.durationSeconds);
  const proportion = duration > 0 ? Math.max(0, Math.min(1, remaining / duration)) : 0;
  view.timerFill.style.width = `${proportion * 100}%`;

  const notice = agenda.notice;
  const expiresAt = typeof notice?.expiresAt === 'string' ? Date.parse(notice.expiresAt) : notice?.expiresAt;
  const visible = Boolean(notice && Number.isFinite(expiresAt) && expiresAt > Date.now());
  view.notice.hidden = !visible;
  if (view.noticeId !== notice?.id) {
    clearTimeout(view.noticeTimeout);
    view.noticeId = notice?.id;
    if (visible) {
      view.noticeTitle.textContent = `Quedan ${notice.minutes} minutos`;
      view.noticeTopic.textContent = typeof notice.topic === 'string' ? notice.topic : notice.topic?.title || agenda.topic?.title || '';
      view.noticeTimeout = setTimeout(() => { view.notice.hidden = true; }, expiresAt - Date.now());
    }
  }
}

function agendaView(root, state) {
  const agenda = state.agenda || {};
  const topics = agenda.topics || [];
  const current = agenda.topic || topics[agenda.index] || {};
  const points = state.points || [];
  const { graphic } = state;
  const key = JSON.stringify({ index: agenda.index, topic: current, topics, points, graphic, selectedPointId: state.selectedPointId });
  const previous = agendaViews.get(root);
  if (previous?.key === key && previous.main.isConnected) {
    updateAgendaClock(previous, agenda);
    return;
  }
  clearTimeout(previous?.noticeTimeout);

  const view = shell();
  view.main.classList.add('companion-agenda');
  view.title.textContent = current.title || 'Temas del concejo';
  view.subtitle.textContent = current.description || '';
  const hero = element('section', 'companion-agenda-hero');
  const currentTopic = element('div', 'companion-agenda-position');
  currentTopic.append(element('span', null, 'Tema en curso'), element('strong', null, current.time || '—'));
  const schedulePosition = Number.isInteger(agenda.index) && topics.length ? `${agenda.index + 1} de ${topics.length}` : '';
  currentTopic.append(element('span', null, schedulePosition));
  const timer = element('div', 'companion-agenda-timer');
  const timerLabel = element('span', 'companion-timer-label');
  const timerValue = element('output', 'companion-timer-value');
  timerValue.setAttribute('aria-live', 'off');
  timerValue.setAttribute('aria-label', 'Cuenta regresiva del tema actual');
  const timerState = element('span', 'companion-timer-state');
  timer.append(timerLabel, timerValue, timerState);
  const timerTrack = element('div', 'companion-timer-track');
  timerTrack.setAttribute('aria-hidden', 'true');
  const timerFill = element('span');
  timerTrack.append(timerFill);
  hero.append(currentTopic, timer, timerTrack);

  const grid = element('div', 'companion-grid companion-agenda-grid');
  const schedule = card('Horario de la sesión');
  const list = element('ol', 'companion-agenda-list');
  topics.forEach((topic, index) => {
    const row = element('li');
    const status = topic.status || (index === agenda.index ? 'current' : index < agenda.index ? 'reviewed' : 'pending');
    row.dataset.status = status;
    if (index === agenda.index) row.setAttribute('aria-current', 'step');
    const time = element('time', null, topic.time);
    time.dateTime = topic.time || '';
    const name = element('span', 'companion-agenda-name', topic.title);
    if (agendaPriorities[topic.priority]) name.append(element('small', 'companion-agenda-priority', agendaPriorities[topic.priority]));
    row.append(time, name, element('small', 'companion-agenda-status', agendaStatusLabels[status] || status));
    list.append(row);
  });
  schedule.append(list);

  const themes = card('Temas en el mapa');
  const pointList = element('ol', 'companion-map-themes');
  points.forEach(point => {
    const row = element('li', 'companion-map-theme');
    row.dataset.category = point.category || '';
    if (point.id === state.selectedPointId) row.dataset.selected = 'true';
    const content = element('div');
    content.append(element('h3', null, point.title), element('p', null, point.description || ''));
    if (point.id === state.selectedPointId) content.append(element('small', 'companion-map-selected', 'Seleccionado en el mapa'));
    row.append(element('span', 'companion-theme-number', point.number), content);
    pointList.append(row);
  });
  themes.append(pointList);
  const context = element('div', 'companion-column');
  if (graphic?.title) {
    const section = card('Gráfico en pantalla');
    const position = Number.isInteger(graphic.index) && graphic.total > 0 ? ` · ${graphic.index + 1} de ${graphic.total}` : '';
    section.append(element('p', 'companion-graphic-name', graphic.title + position));
    if (graphic.takeaway) section.append(element('p', 'companion-secondary', graphic.takeaway));
    context.append(section);
  }
  context.append(themes);
  grid.append(schedule, context);
  const notice = element('aside', 'companion-agenda-notice');
  notice.setAttribute('role', 'status');
  notice.hidden = true;
  const noticeTitle = element('strong');
  const noticeTopic = element('span');
  notice.append(noticeTitle, noticeTopic);
  view.content.append(hero, grid);
  view.main.append(notice);
  root.replaceChildren(view.main);
  const refs = { ...view, key, timer, timerValue, timerLabel, timerState, timerFill, notice, noticeTitle, noticeTopic };
  agendaViews.set(root, refs);
  updateAgendaClock(refs, agenda);
}

function installationAreas(placements) {
  const groups = new Map();
  for (const { kind, quadrantId } of placements) {
    if (kind !== 'camera' && kind !== 'fixed') continue;
    const id = quadrantId || '';
    const counts = groups.get(id) || { camera: 0, fixed: 0 };
    counts[kind]++;
    groups.set(id, counts);
  }
  if (!groups.size) return null;
  const section = card('Cuadrantes de instalación');
  const list = element('dl', 'companion-installation-areas');
  const sorted = [...groups].sort(([left], [right]) => !left ? 1 : !right ? -1 : left.localeCompare(right, 'es-CL', { numeric: true }));
  const quantity = (count, singular, plural) => count ? number.format(count) + ' ' + (count === 1 ? singular : plural) : '';
  for (const [id, counts] of sorted.slice(0, 3)) {
    const label = id ? quadrantsLabel([id]) : 'Sin cuadrante asignado';
    const summary = [quantity(counts.camera, 'cámara', 'cámaras'), quantity(counts.fixed, 'caseta', 'casetas')].filter(Boolean).join(' · ');
    list.append(fact(label, summary));
  }
  section.append(list);
  if (sorted.length > 3) section.append(element('p', 'companion-analysis-note',
    `+${sorted.length - 3} cuadrantes en el mapa`));
  return section;
}

function forecastDetails(state) {
  const forecast = state.forecast || {};
  const placements = forecast.placements || [];
  const budget = buildInvestmentSummary(placements);
  const content = card('Presupuesto del escenario');
  content.classList.add('companion-forecast-details');
  if (forecast.error || forecast.ready === false) {
    content.append(element('p', null, forecast.error ? 'Proyección no disponible' : 'Preparando la estimación…'));
    return content;
  }
  const metrics = element('dl', 'companion-forecast-metrics');
  metrics.append(metric('Inversión inicial', money.format(budget.initial), inUF(budget.initial)),
    metric('Operación anual', money.format(budget.annualOperation), inUF(budget.annualOperation)),
    metric('Total del primer año', money.format(budget.firstYear), inUF(budget.firstYear)));
  content.append(element('p', 'companion-analysis-note',
    `${formatCount(budget.counts.camera, 'cameras')} · ${formatCount(budget.counts.fixed, 'fixed')}`), metrics);
  if (Number.isFinite(forecast.baselineTotal) && Number.isFinite(forecast.scenarioTotal)) {
    const comparison = element('section', 'companion-forecast-estimates');
    comparison.append(element('h3', null, 'Robos estimados en la comuna'));
    const totals = element('dl', 'companion-forecast-metrics');
    totals.append(metric(forecast.showAfter ? 'Antes' : 'Antes · En el mapa', number.format(Math.round(forecast.baselineTotal))),
      metric(forecast.showAfter ? 'Con inversión · En el mapa' : 'Con inversión', number.format(Math.round(forecast.scenarioTotal))),
      metric('Variación', percentages.format(forecast.reduction ? -forecast.reduction : 0)));
    comparison.append(totals);
    if (forecast.local?.id && Number.isFinite(forecast.local.baseline) && Number.isFinite(forecast.local.scenario)) {
      comparison.append(element('p', 'companion-analysis-note',
        `Consulta local en ${forecast.local.id} · ${number.format(Math.round(forecast.local.baseline))} antes y ${number.format(Math.round(forecast.local.scenario))} con inversión`));
    }
    content.append(comparison);
  }
  if (budget.quantity) {
    const grid = element('div', 'companion-forecast-grid');
    grid.append(budgetChart(budget), delivery(budget));
    content.append(grid, budgetFooter());
  }
  return content;
}

function resultsCard(layers, { compact = false } = {}) {
  const section = element('section', 'companion-results');
  section.setAttribute('aria-label', 'Resultados de la consulta');
  const results = element('div', 'companion-layer-results');
  results.dataset.count = String(layers.length);
  for (const { kind, title, summary = {}, ready, error, period, filterLabels = [], display, opacity } of layers) {
    const result = element('div', 'companion-layer-result');
    result.dataset.kind = kind;
    const main = element('div', 'companion-layer-result-main');
    const category = compact ? names[kind]?.[2] || title : title || names[kind]?.[2];
    main.append(element('h3', null, category || 'Registros'),
      element('strong', null, Number.isFinite(summary.total) && ready !== false && !error ? number.format(summary.total) : '—'));
    result.append(main);
    if (error || ready === false) result.append(element('p', 'companion-analysis-note', error || 'Cargando datos…'));
    else {
      if (period) result.append(element('p', 'companion-layer-period', period));
      const filters = [...filterLabels];
      if (display && !compact) filters.push(display);
      if (!compact && layers.length > 1 && Number.isFinite(opacity)) filters.push(`Visibilidad ${percentages.format(opacity)}`);
      if (filters.length) result.append(element('p', 'companion-analysis-note', filters.join(' · ')));
      const status = element('dl', 'companion-analysis-status');
      for (const [key, label] of [
        ['operational', 'Operativas'], ['maintenance', 'En mantención'], ['inactive', 'Inactivas'],
        ['monitoring', 'Monitoreando'], ['activations', 'Pulsaciones']
      ]) {
        if (Number.isFinite(summary[key])) status.append(fact(label, number.format(summary[key])));
      }
      if (status.childElementCount) result.append(status);
    }
    results.append(result);
  }
  section.append(results);
  return section;
}

function crossCard(cross, scopeCount, { compact = false } = {}) {
  if (!cross || !scopeCount) return null;
  const { primary, secondary, rows: selectedRows, withoutEquipment } = cross;
  const rows = selectedRows.slice(0, 3);
  if (withoutEquipment && !rows.some(row => row.id === withoutEquipment.id)) rows[rows.length - 1] = withoutEquipment;
  const section = element('section', 'companion-cross-summary');
  section.append(element('h2', null, 'Cruce por cuadrante'));
  const label = layer => names[layer.kind]?.[2] || layer.kind;
  if (cross.contextual) section.append(element('p', 'companion-cross-context',
    [label(secondary), secondary.period].filter(Boolean).join(' · ')));
  const robbery = primary.kind === 'security' ? primary : secondary.kind === 'security' ? secondary : null;
  const related = robbery === primary ? secondary : primary;
  const unmatched = robbery === primary ? cross.primaryUnmatched : cross.secondaryUnmatched;
  const located = robbery === primary ? cross.primaryLocated : cross.secondaryLocated;
  const text = element('p', 'companion-cross-finding');
  if (robbery && unmatched > 0 && located > 0) {
    text.append(element('strong', null, formatCount(unmatched, 'security')),
      ` (${percentages.format(unmatched / located)}) se ubican en cuadrantes sin ${countName(0, related.kind)} en la consulta.`);
  } else {
    text.append(element('strong', null, `${number.format(cross.sharedQuadrants)} de ${number.format(scopeCount)} cuadrantes`),
      ' tienen registros en ambas categorías.');
  }
  section.append(text);
  if (compact) return section;
  if (rows.length) {
    const table = element('table', 'companion-cross-table');
    table.setAttribute('aria-label', 'Recuentos por cuadrante');
    const header = element('tr');
    for (const name of ['Cuadrante', label(primary), label(secondary)]) {
      const heading = element('th', null, name);
      heading.scope = 'col';
      header.append(heading);
    }
    const thead = element('thead');
    thead.append(header);
    table.append(thead);
    const body = element('tbody');
    const axes = [['primary', primary.kind], ['secondary', secondary.kind]];
    const maxima = axes.map(([key]) => Math.max(1, ...rows.map(row => row[key])));
    for (const row of rows) {
      const tr = element('tr');
      if (row.id === withoutEquipment?.id) tr.dataset.priority = 'true';
      const heading = element('th', null, row.id);
      heading.scope = 'row';
      tr.append(heading);
      axes.forEach(([key, kind], index) => {
        const cell = element('td', 'companion-cross-value');
        cell.dataset.kind = kind;
        const fill = element('span');
        fill.setAttribute('aria-hidden', 'true');
        fill.style.width = `${100 * row[key] / maxima[index]}%`;
        cell.append(fill, element('strong', null, number.format(row[key])));
        tr.append(cell);
      });
      body.append(tr);
    }
    table.append(body);
    section.append(table);
  }
  if (rows.length || primary.unassignedTotal || secondary.unassignedTotal) {
    const notes = [rows.length ? 'Escala propia por columna.' : '',
      primary.unassignedTotal || secondary.unassignedTotal ? 'Solo registros con cuadrante.' : ''];
    section.append(element('p', 'companion-analysis-note', notes.filter(Boolean).join(' ')));
  }
  return section;
}

function patternsCard(layers) {
  const list = element('dl', 'companion-analysis-patterns');
  for (const { kind, breakdown = [], topQuadrants = [] } of layers) {
    const largest = group => breakdown.filter(item => item.group === group && item.total > 0)
      .sort((a, b) => b.total - a.total)[0];
    if (kind === 'security') {
      const hour = largest('Horario');
      const type = largest('Tipo de robo');
      if (hour) list.append(fact('Horario con más robos', `${hour.label} · ${number.format(hour.total)}`));
      if (type) list.append(fact('Tipo más frecuente', `${type.label} · ${number.format(type.total)}`));
    } else if (kind === 'cameras') {
      const type = largest('Tipo de cámara');
      if (type) list.append(fact('Tipo más frecuente', `${type.label} · ${number.format(type.total)}`));
    }
    if (topQuadrants[0]) {
      const { id, total } = topQuadrants[0];
      list.append(fact(`Mayor recuento de ${countName(0, kind)}`, `${id} · ${number.format(total)}`));
    }
  }
  return list.childElementCount ? list : null;
}

function sectorCard(sector, isPreview) {
  if (!sector || (isPreview ? !sector.quadrantIds?.length : !sector.security)) return null;
  const { security, cameras, resources = {} } = sector;
  const section = element('section', 'companion-local-detail');
  section.append(element('h2', null, isPreview ? quadrantsLabel(sector.quadrantIds) : 'Actividad reciente'));
  const facts = element('dl', 'companion-analysis-status');
  if (isPreview) {
    for (const [kind, detail] of [['security', security], ['cameras', cameras], ...Object.entries(resources)]) {
      if (detail) facts.append(fact(names[kind]?.[2] || 'Registros', number.format(detail.total)));
    }
  }
  if (security) {
    facts.append(fact('Últimos 7 días del período', number.format(security.last7Days ?? 0)));
    if (isPreview && security.communeTotal > 0) facts.append(fact('Del total comunal', percentages.format(security.total / security.communeTotal)));
    const week = security.last7DaysRange?.label;
    if (week) facts.append(fact('Período', week));
  }
  if (facts.childElementCount) section.append(facts);
  if (security?.lastIncident) {
    const last = security.lastIncident;
    const address = String(last.direccion || '').replace(' (numeración simulada)', '');
    section.append(element('p', 'companion-analysis-note',
      ['Último registro', date(last.fecha), last.hora, last.tipo_incidente, address].filter(Boolean).join(' · ')));
  }
  return section;
}

function territorialView(root, state) {
  let view = territorialViews.get(root);
  if (!view) {
    view = shell();
    view.main.classList.add('companion-territorial');
    view.subtitle.hidden = true;
    const layout = element('div', 'companion-territorial-layout');
    const aside = element('aside', 'companion-territorial-aside');
    const mapCard = element('section', 'companion-territory-card');
    mapCard.setAttribute('aria-labelledby', 'companion-territory-title');
    view.area = element('h2', 'companion-territory-area');
    view.area.id = 'companion-territory-title';
    view.area.setAttribute('aria-live', 'polite');
    const mapSlot = element('div', 'companion-territory-map-slot');
    view.map = createCompanionTerritoryMap();
    mapSlot.append(view.map.element);
    mapCard.append(view.area, mapSlot);
    view.context = element('div', 'companion-territorial-context');
    aside.append(mapCard, view.context);
    view.details = element('div', 'companion-territorial-details');
    view.details.setAttribute('role', 'region');
    view.details.setAttribute('aria-label', 'Resultados y cruces');
    layout.append(aside, view.details);
    view.content.append(layout);
    root.replaceChildren(view.main);
    territorialViews.set(root, view);
  }

  const { territory, insights, sector, overview } = state;
  const isForecast = state.mode === 'forecast';
  const ids = territory?.quadrantIds;
  const areaLabel = ids?.length && ids.length <= 4 ? quadrantsLabel(ids)
    : territory?.areaLabel || (ids === null ? 'Toda la comuna' : 'Sin cuadrantes seleccionados');
  if (view.area.textContent !== areaLabel) view.area.textContent = areaLabel;
  view.title.textContent = isForecast ? `Simular inversión · ${state.forecast?.year || 2027}` : 'Análisis territorial';
  view.main.dataset.mode = state.mode;
  view.map.update(territory || { quadrantIds: null, layers: [] });
  const { territory: mapData, ...detailsState } = state;
  const key = JSON.stringify([areaLabel, detailsState]);
  if (view.key === key) return;
  const details = document.createDocumentFragment();
  const context = document.createDocumentFragment();
  if (isForecast) {
    details.append(forecastDetails(state));
    const areas = installationAreas(state.forecast?.placements || []);
    if (areas) context.append(areas);
  } else {
    const resource = state.resource ? renderCompanionResource(state) : null;
    const results = state.layers?.length ? resultsCard(state.layers, { compact: Boolean(resource) }) : null;
    const cross = crossCard(insights?.cross, insights?.scopeCount, { compact: Boolean(resource) });
    if (resource) {
      details.append(resource);
      const side = element('section', 'companion-card companion-query-context');
      if (results) side.append(results);
      if (cross) side.append(cross);
      if (side.childElementCount) context.append(side);
    } else {
      const report = element('section', 'companion-card companion-analysis-report');
      const patterns = patternsCard(insights?.layers || []);
      const local = state.inspected ? sectorCard(sector, true) : sectorCard(overview, false);
      if (results) report.append(results);
      if (cross) report.append(cross);
      if (patterns) report.append(patterns);
      if (local) report.append(local);
      details.append(report);
      if (overview?.security && ids?.length) context.append(robberyShare(overview.security, areaLabel));
    }
  }
  view.context.replaceChildren(context);
  view.details.replaceChildren(details);
  view.key = key;
}

function disposeTerritorialView(root) {
  territorialViews.get(root)?.map.destroy();
  territorialViews.delete(root);
}
const isTerritorialMode = mode => ['forecast', 'resource', 'sector', 'summary'].includes(mode);

function idleView(root) {
  const idle = element('div', 'companion-idle');
  idle.append(brand());
  const caption = element('div', 'companion-idle-caption');
  caption.append(element('p', null, 'Concejo en perspectiva'));
  idle.append(caption);
  root.replaceChildren(idle);
}

export function renderCompanion(root, state = {}, { onCurrentSession } = {}) {
  if (!root) return;
  if (state.mode !== 'agenda') {
    const agenda = agendaViews.get(root);
    clearTimeout(agenda?.noticeTimeout);
    agendaViews.delete(root);
  }
  const territorial = isTerritorialMode(state.mode);
  if (!territorial) disposeTerritorialView(root);
  if (territorial) territorialView(root, state);
  else if (state.mode === 'agenda') agendaView(root, state);
  else if (state.mode === 'previous-session') renderPreviousSession(root, state.session, onCurrentSession);
  else idleView(root);
}

const root = document.getElementById('companion-root');
if (root) {
  let last = '';
  let channel;
  let focusCurrentSession = false;
  const onCurrentSession = () => {
    focusCurrentSession = true;
    if (window.desktop?.showCurrentSession) window.desktop.showCurrentSession();
    else channel?.postMessage({ type: 'current-session' });
  };
  const update = state => {
    const fingerprint = isTerritorialMode(state?.mode) ? null : JSON.stringify(state || {});
    if (fingerprint !== null && fingerprint === last) return;
    last = fingerprint;
    renderCompanion(root, state, { onCurrentSession });
    if (focusCurrentSession && state.mode !== 'previous-session') {
      const heading = root.querySelector('h1');
      if (heading) {
        focusCurrentSession = false;
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    }
  };
  update({ mode: 'idle' });
  window.addEventListener('pagehide', event => {
    if (!event.persisted) disposeTerritorialView(root);
  });
  window.addEventListener('mlr-companion-state', event => update(event.detail));
  if (window.desktop?.onCompanionState) {
    let eventReceived = false;
    window.desktop.onCompanionState(state => {
      eventReceived = true;
      update(state);
    });
    Promise.resolve(window.desktop.requestCompanionState?.()).then(state => {
      if (state && !eventReceived) update(state);
    });
  } else {
    const session = new URLSearchParams(location.search).get('session');
    if (!session) throw new Error('La ficha debe abrirse desde el mapa principal.');
    channel = new BroadcastChannel(`mlr-council-companion-${session}`);
    channel.addEventListener('message', event => {
      if (event.data?.type === 'state') update(event.data.state);
    });
    channel.postMessage({ type: 'ready' });
    window.addEventListener('pagehide', () => channel.close(), { once: true });
  }
}
