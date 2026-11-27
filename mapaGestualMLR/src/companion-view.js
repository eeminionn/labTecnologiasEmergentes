import { connectCompanionViewer } from './companion-channel.js';
import './glass-ui.css';
import './companion-ui.css';
import { assetUrl } from './asset-url.js';
import { buildInvestmentSummary } from './investment-data.js';
import { createUfReference, ufAmount, ufFootnote, updateUfReadouts } from './uf-reference.js';
import { renderPreviousSession } from './previous-session-view.js';
import { attendanceSummary, councilDateLabel } from './council-attendance.js';
import { COUNCIL_THEME_LABELS } from './map-topics.js';
import { createRobberyShare } from './robbery-share-view.js';
import { createCompanionTerritoryMap } from './companion-territory-map.js';
import { HEAT_COLOR_STOPS } from './analysis-data.js';
import { renderCompanionResource, renderCompanionResourceSelection } from './companion-resource-view.js';
import { chartTint } from './companion-chart-tint.js';
import { resolveCompanionRanking, sortCompanionQuadrants } from './companion-analysis-data.js';
import './companion-analysis-ui.css';

const number = new Intl.NumberFormat('es-CL');
const money = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
const ufReference = createUfReference();
const date = value => value ? new Intl.DateTimeFormat('es-CL', { timeZone: 'UTC' }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`)) : 'Por definir';
const agendaViews = new WeakMap();
const territorialViews = new WeakMap();
const percentages = new Intl.NumberFormat('es-CL', { style: 'percent', maximumFractionDigits: 1 });
const forecastPercentage = new Intl.NumberFormat('es-CL', { style: 'percent', maximumFractionDigits: 2 });
const densityNumber = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 });
const compactCount = new Intl.NumberFormat('es-CL', { notation: 'compact', maximumFractionDigits: 1 });
const names = {
  security: ['robo', 'robos', 'Robos'],
  cameras: ['cámara', 'cámaras', 'Cámaras'],
  fixed: ['caseta', 'casetas', 'Casetas'],
  alarms: ['botón', 'botones', 'Botones de emergencia']
};
const agendaStatusLabels = { current: 'En curso', next: 'Siguiente', reviewed: 'Revisado', pending: 'Pendiente' };
const agendaPriorities = { urgente: 'Urgente', prioritario: 'Prioritario', programado: 'Programado' };
const countName = (count, kind) => names[kind]?.[count === 1 ? 0 : 1] || 'registros';
const formatCount = (count, kind) => `${number.format(count)} ${countName(count, kind)}`;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function chartNumber(tag, value, format = number) {
  if (!Number.isFinite(value)) return element(tag, null, '—');
  const full = format.format(value);
  const label = value >= 1_000_000_000 ? compactCount.format(value)
    : format === densityNumber && value > 0 && value < .1 ? '< 0,1' : full;
  const result = element(tag, null, label);
  if (label !== full && value >= 1_000_000_000) {
    result.title = full;
    result.setAttribute('aria-label', full);
  }
  return result;
}

function metric(label, value, note, { emphasized = false } = {}) {
  const node = element('div', 'companion-metric');
  node.append(element('dt', null, label), element('dd', null, value));
  if (note) node.append(note);
  if (emphasized) node.dataset.emphasized = '';
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
  logo.src = assetUrl('/brand/la-reina-logo.png');
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

function forecastBars(rows) {
  const list = element('dl', 'companion-cost-chart');
  const largest = Math.max(1, ...rows.map(item => item.value));
  for (const { label, value, formatted, emphasized } of rows) {
    const row = element('div', 'companion-cost-row');
    if (emphasized) row.dataset.emphasized = '';
    const track = element('dd', 'companion-cost-track');
    track.setAttribute('aria-hidden', 'true');
    const fill = element('span');
    fill.style.width = `${value / largest * 100}%`;
    fill.style.setProperty('--chart-fill', chartTint(value, largest));
    track.append(fill);
    row.append(element('dt', null, label), element('dd', null, formatted), track);
    list.append(row);
  }
  return list;
}

function budgetChart(budget) {
  const section = element('section', 'companion-forecast-breakdown');
  section.append(element('h3', null, 'Distribución de la inversión'), forecastBars([...budget.breakdown]
    .sort((a, b) => b.value - a.value).map(item => ({ ...item, formatted: money.format(item.value) }))));
  return section;
}

function delivery(budget) {
  const section = element('section', 'companion-forecast-delivery');
  section.append(element('h3', null, `Plazo estimado · ${number.format(budget.totalDays)} días hábiles`),
    forecastBars(budget.timeline.map(({ label, days }) => ({ label, value: days, formatted: number.format(days) }))),
    element('p', 'companion-analysis-note companion-delivery-owner', `${budget.lead} · ${budget.unit}`));
  return section;
}

function quadrantsLabel(ids = []) {
  return ids.length ? (ids.length === 1 ? 'Cuadrante ' : 'Cuadrantes ') + ids.join(', ') : '';
}

function robberyShare(security, area = security.areaLabel) {
  return createRobberyShare({ count: security.total, total: security.communeTotal, period: security.period, area });
}

function updateAgendaClock(view, agenda) {
  const known = Number.isFinite(agenda.remainingSeconds);
  const remaining = known ? agenda.remainingSeconds : 0;
  const seconds = Math.abs(Math.trunc(remaining));
  const value = `${remaining < 0 ? '−' : ''}${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const overtime = agenda.overtime || remaining < 0;
  view.timerValue.textContent = known ? value : '—';
  view.timerLabel.textContent = known && overtime ? 'Tiempo excedido' : 'Tiempo restante';
  view.timerState.textContent = known ? agenda.running ? 'En curso' : 'En pausa' : 'Sin registro';
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
  const opening = agenda.phase === 'opening' ? agenda.opening : null;
  const current = agenda.topic || topics[agenda.index] || {};
  const points = state.points || [];
  const { graphic } = state;
  const key = JSON.stringify({ index: agenda.index, topic: current, topics, points, graphic, opening, selectedPointId: state.selectedPointId });
  const previous = agendaViews.get(root);
  if (previous?.key === key && previous.main.isConnected) {
    updateAgendaClock(previous, agenda);
    return;
  }
  clearTimeout(previous?.noticeTimeout);

  const view = shell();
  view.main.classList.add('companion-agenda');
  view.main.classList.toggle('companion-council-opening', Boolean(opening));
  view.title.textContent = current.title || 'Temas del concejo';
  view.subtitle.textContent = opening?.date ? councilDateLabel(opening.date) : current.description || '';
  const hero = element('section', 'companion-agenda-hero');
  const currentTopic = element('div', 'companion-agenda-position');
  const hasTopic = Number.isInteger(agenda.index) && agenda.index >= 0 && agenda.index < topics.length;
  currentTopic.append(element('span', null, opening ? 'Tiempo previsto' : hasTopic ? `Tema ${agenda.index + 1} de ${topics.length}` : 'Sin tema en curso'),
    element('strong', null, opening ? `${agenda.durationSeconds / 60} min` : current.time || '—'));
  const timer = element('div', 'companion-agenda-timer');
  const timerLabel = element('span', 'companion-timer-label');
  const timerValue = element('output', 'companion-timer-value');
  timerValue.setAttribute('aria-live', 'off');
  timerValue.setAttribute('aria-label', opening ? 'Cuenta regresiva de la apertura' : 'Cuenta regresiva del tema actual');
  const timerState = element('span', 'companion-timer-state');
  timer.append(timerLabel, timerValue, timerState);
  const timerTrack = element('div', 'companion-timer-track');
  timerTrack.setAttribute('aria-hidden', 'true');
  const timerFill = element('span');
  timerTrack.append(timerFill);
  hero.append(currentTopic, timer, timerTrack);

  const grid = element('div', 'companion-grid companion-agenda-grid');
  const schedule = card(opening ? 'Tabla de hoy' : 'Horario de la sesión');
  const list = element('ol', 'companion-agenda-list');
  topics.forEach((topic, index) => {
    const row = element('li');
    row.dataset.theme = topic.theme || '';
    const originalStatus = topic.status || (index === agenda.index ? 'current' : index < agenda.index ? 'reviewed' : 'pending');
    const status = originalStatus === 'pending' && hasTopic && index === agenda.index + 1 ? 'next' : originalStatus;
    row.dataset.status = status;
    if (agendaPriorities[topic.priority]) row.dataset.priority = topic.priority;
    if (index === agenda.index) row.setAttribute('aria-current', 'step');
    const time = element('time', null, topic.time);
    time.dateTime = topic.time || '';
    const name = element('span', 'companion-agenda-name', topic.title);
    if (!opening && topic.priority !== 'programado' && agendaPriorities[topic.priority]) {
      const priority = element('small', 'companion-agenda-priority', agendaPriorities[topic.priority]);
      if (topic.priority === 'urgente') priority.dataset.theme = 'seguridad';
      name.append(priority);
    }
    const contextLabel = opening ? COUNCIL_THEME_LABELS[topic.theme] || '' : agendaStatusLabels[status] || status;
    row.append(time, name, element('small', 'companion-agenda-status', contextLabel));
    list.append(row);
  });
  schedule.append(topics.length ? list : element('p', 'companion-secondary', 'No hay temas programados.'));

  const themes = card('Temas en el mapa');
  const pointList = element('ol', 'companion-map-themes');
  points.forEach(point => {
    const row = element('li', 'companion-map-theme');
    row.dataset.theme = point.category || '';
    if (point.id === state.selectedPointId) row.dataset.selected = 'true';
    const content = element('div');
    content.append(element('h3', null, point.title), element('p', null, point.description || ''));
    if (point.id === state.selectedPointId) content.append(element('small', 'companion-map-selected', 'Seleccionado en el mapa'));
    row.append(element('span', 'companion-theme-number', point.number), content);
    pointList.append(row);
  });
  if (points.length) themes.append(pointList);
  const context = element('div', 'companion-column');
  if (graphic?.title) {
    const section = card('Gráfico en pantalla');
    const position = Number.isInteger(graphic.index) && graphic.total > 0 ? ` · ${graphic.index + 1} de ${graphic.total}` : '';
    section.append(element('p', 'companion-graphic-name', graphic.title + position));
    if (graphic.takeaway) section.append(element('p', 'companion-secondary', graphic.takeaway));
    context.append(section);
  }
  if (opening) context.append(companionOpeningAttendance(opening));
  else if (points.length) context.append(themes);
  grid.append(schedule, context);
  const notice = element('aside', 'companion-agenda-notice');
  notice.dataset.theme = 'seguridad';
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

function companionOpeningAttendance(opening) {
  const roster = Array.isArray(opening.attendance) ? opening.attendance : [];
  const card = element('section', 'companion-card companion-opening-attendance');
  if (opening.pending) {
    const pending = element('div', 'companion-opening-pending');
    pending.append(element('small', null, 'Pendiente de la sesión pasada'), element('strong', null, opening.pending));
    card.append(pending);
  }
  const heading = element('h2', null, 'Asistencia');
  const summary = element('p', 'companion-secondary', attendanceSummary(roster));
  const names = element('ul', 'companion-opening-roster');
  names.setAttribute('aria-label', 'Asistencia de integrantes');
  for (const person of roster) {
    const row = element('li');
    row.dataset.attendance = person.status;
    const label = person.status === 'present' ? 'Presente' : person.status === 'absent' ? 'Ausente' : 'Sin marcar';
    row.append(element('strong', null, person.name), element('span', null, label));
    names.append(row);
  }
  card.append(heading, summary, names);
  return card;
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

function forecastEstimates(forecast) {
  const section = element('section', 'companion-forecast-estimates');
  section.dataset.theme = 'seguridad';
  const title = element('h3', null, 'Robos estimados en el área');
  const { baselineTotal: before, scenarioTotal: after } = forecast;
  if (![before, after].every(value => Number.isFinite(value) && value >= 0)) {
    section.append(title, element('p', 'companion-analysis-note', forecast.error ? 'Estimación no disponible.'
      : forecast.ready === false ? 'Preparando la estimación…' : 'Sin resultados disponibles.'));
    return section;
  }
  const delta = after - before;
  const change = before > 0 ? delta / before : null;
  const direction = delta < 0 ? '−' : '+';
  let variation = 'Sin variación';
  if (delta && !Number.isFinite(change)) {
    const count = Math.round(Math.abs(delta));
    variation = Math.abs(delta) < 1 ? 'Menos de 1 robo' : `${direction}${formatCount(count, 'security')}`;
  } else if (delta) {
    variation = Math.abs(change) < .0001 ? 'Menos de 0,01 %' : `${direction}${forecastPercentage.format(Math.abs(change))}`;
  }
  const heading = element('header', 'companion-forecast-estimates-header');
  const changeLabel = element('p', 'companion-forecast-variation');
  changeLabel.dataset.trend = delta > 0 ? 'increase' : delta < 0 ? 'decrease' : 'unchanged';
  changeLabel.append(element('strong', null, variation));
  if (delta) changeLabel.append(element('span', null, delta < 0 ? 'Disminución estimada' : 'Aumento estimado'));
  heading.append(title, changeLabel);
  section.append(heading, forecastBars([
    { label: 'Antes', value: before, formatted: number.format(Math.round(before)) },
    { label: 'Con inversión', value: after, formatted: number.format(Math.round(after)), emphasized: delta !== 0 },
  ]));
  if (forecast.local?.id && [forecast.local.baseline, forecast.local.scenario].every(Number.isFinite)) {
    section.append(element('p', 'companion-analysis-note companion-forecast-local',
      `Punto consultado · ${quadrantsLabel([forecast.local.id])}. ${number.format(Math.round(forecast.local.baseline))} antes y ${number.format(Math.round(forecast.local.scenario))} con inversión.`));
  }
  return section;
}

function forecastDetails(state) {
  const forecast = state.forecast || {};
  const placements = forecast.placements || [];
  const budget = buildInvestmentSummary(placements);
  const content = card('Presupuesto del escenario');
  content.classList.add('companion-forecast-details');
  content.dataset.theme = 'gobernanza';
  const metrics = element('dl', 'companion-forecast-metrics');
  metrics.append(metric('Inversión inicial', money.format(budget.initial), ufAmount(budget.initial)),
    metric('Operación anual', money.format(budget.annualOperation), ufAmount(budget.annualOperation)),
    metric('Total del primer año', money.format(budget.firstYear), ufAmount(budget.firstYear), { emphasized: true }));
  content.append(element('p', 'companion-analysis-note',
    `${formatCount(budget.counts.camera, 'cameras')} · ${formatCount(budget.counts.fixed, 'fixed')}`), metrics);
  content.append(forecastEstimates(forecast));
  if (budget.quantity) {
    const grid = element('div', 'companion-forecast-grid');
    grid.append(budgetChart(budget), delivery(budget));
    content.append(grid);
  }
  content.append(ufFootnote('IVA incluido'));
  return content;
}

function resultsCard(layers, { compact = false } = {}) {
  const section = element('section', 'companion-results');
  section.setAttribute('aria-label', 'Resultados de la consulta');
  const results = element('div', 'companion-layer-results');
  results.dataset.count = String(layers.length);
  for (const { kind, title, summary = {}, ready, error, period, filterLabels = [] } of layers) {
    const result = element('div', 'companion-layer-result');
    result.dataset.kind = kind;
    result.dataset.theme = 'seguridad';
    const main = element('div', 'companion-layer-result-main');
    const category = compact ? names[kind]?.[2] || title : title || names[kind]?.[2];
    main.append(element('h3', null, category || 'Registros'),
      chartNumber('strong', ready !== false && !error ? summary.total : null));
    result.append(main);
    if (error || ready === false) result.append(element('p', 'companion-analysis-note', error || 'Cargando datos…'));
    else {
      if (period) result.append(element('p', 'companion-layer-period', period));
      if (filterLabels.length) result.append(element('p', 'companion-analysis-note', filterLabels.join(' · ')));
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

function crossFinding(cross, scopeCount) {
  if (!cross || !scopeCount) return null;
  const { primary, secondary } = cross;
  const robbery = primary.kind === 'security' ? primary : secondary.kind === 'security' ? secondary : null;
  const related = robbery === primary ? secondary : primary;
  const unmatched = robbery === primary ? cross.primaryUnmatched : cross.secondaryUnmatched;
  const located = robbery === primary ? cross.primaryLocated : cross.secondaryLocated;
  const text = element('p', 'companion-cross-finding');
  if (robbery && unmatched > 0 && located > 0) {
    const share = unmatched / located;
    const portion = share < .001 ? '< 0,1 %' : percentages.format(share);
    text.append(chartNumber('strong', unmatched),
      ` ${countName(unmatched, 'security')} (${portion}) en subcuadrantes con 0 ${countName(0, related.kind)} en el inventario consultado.`);
  } else {
    text.append(element('strong', null, `${number.format(cross.sharedQuadrants)} de ${number.format(scopeCount)} subcuadrantes`),
      ' tienen registros en ambos conjuntos.');
  }
  const section = element('section', 'companion-cross-summary');
  section.dataset.theme = 'seguridad';
  if (cross.contextual) section.append(element('p', 'companion-cross-context',
    [names[secondary.kind]?.[2], secondary.period].filter(Boolean).join(' · ')));
  else if (cross.differentCutoffs) section.append(element('p', 'companion-cross-context', 'Las consultas tienen cortes distintos.'));
  section.append(text);
  return section;
}

function chartBar(value, maximum, family) {
  const track = element('span', 'companion-cross-track');
  track.setAttribute('aria-hidden', 'true');
  const fill = element('span');
  fill.style.width = `${maximum > 0 ? value / maximum * 100 : 0}%`;
  fill.style.setProperty('--chart-fill', chartTint(value, maximum, family));
  track.append(fill);
  return track;
}

const chartFamily = { security: 'rosado', cameras: 'azul', fixed: 'morado', alarms: 'rosado' };
const chartHeading = { security: 'Robos por horario', cameras: 'Cámaras por estado', fixed: 'Casetas por estado', alarms: 'Botones según su uso' };
const rankColumn = { security: 'Robos', cameras: 'Cámaras', fixed: 'Casetas', alarms: 'Botones' };

function breakdownCard(layer) {
  if (!layer?.ready) return null;
  const { kind, breakdown = [] } = layer;
  const group = kind === 'security' ? (breakdown.filter(row => row.group === 'Horario' && row.total > 0).length > 1 ? 'Horario' : 'Tipo de robo')
    : kind === 'alarms' ? 'Uso' : 'Estado';
  const rows = breakdown.filter(row => row.group === group && !row.unit);
  if (!rows.some(row => row.total > 0)) return null;
  if (group === 'Tipo de robo') rows.sort((a, b) => b.total - a.total);
  const section = card(group === 'Tipo de robo' ? 'Robos por tipo' : chartHeading[kind]);
  section.classList.add('companion-breakdown');
  section.dataset.kind = kind;
  const list = element('dl');
  const maximum = Math.max(...rows.map(row => row.total));
  for (const { label, total } of rows) {
    const row = element('div');
    row.append(element('dt', null, group === 'Horario' ? label.split(' · ')[0] : label.replace(/^Botones /, '')));
    const value = element('dd');
    value.append(chartBar(total, maximum, chartFamily[kind]), chartNumber('strong', total));
    row.append(value);
    list.append(row);
  }
  section.append(list);
  return section;
}

function rankingCard(source, settings, note) {
  const ranking = resolveCompanionRanking(source, settings);
  if (!ranking) return null;
  const { primary, secondary, robberyAxis } = source;
  const section = element('section', 'companion-territory-ranking');
  const heading = element('header', 'companion-rank-heading');
  const { rows, visibleRows, level, order, hasDensity, metric, ascending, first, last, total } = ranking;
  const orderLabel = ranking.options.find(([value]) => value === order)?.[1];
  const geography = level === 'unit' ? 'Unidades vecinales' : 'Subcuadrantes';
  heading.append(element('h2', null, secondary ? 'Cruce territorial' : 'Comparación territorial'),
    element('p', 'companion-rank-order', `${geography} · ${orderLabel}`));
  section.append(heading);
  if (note) section.append(note);

  const insight = element('p', 'companion-rank-insight');
  const table = element('table', 'companion-cross-table');
  table.setAttribute('aria-label', 'Totales y concentración media en el área consultada');
  const head = table.createTHead(), body = table.createTBody(), foot = table.createTFoot();
  const createHeader = (label, scope) => {
    const node = element('th', null, label);
    node.scope = scope;
    return node;
  };
  const description = element('p', 'companion-analysis-note');
  description.id = 'companion-rank-description';
  table.setAttribute('aria-describedby', description.id);
  section.append(insight, table);
  if (total > ranking.pageSize) section.append(element('p', 'companion-rank-range',
    `${number.format(first)}–${number.format(last)} de ${number.format(total)}`));
  section.append(description);

  const summaryAxes = [['primary', primary], ...(secondary ? [['secondary', secondary]] : [])];
  const columns = [
    ...summaryAxes.map(([key, layer]) => ({ key, name: rankColumn[layer.kind], kind: layer.kind, total: layer.locatedTotal })),
    ...(hasDensity ? [{ key: 'density', name: 'Robos/km²', kind: 'security', total: null }] : [])
  ];
  const maxima = columns.map(({ key }) => rows.reduce((max, row) => Math.max(max, row[key] ?? 0), 0));
  const header = element('tr');
  const label = level === 'unit' ? 'Unidad' : 'Subcuadrante';
  header.append(createHeader(label, 'col'));
  for (const { name, key, kind } of columns) {
    const th = createHeader(name, 'col');
    th.dataset.kind = kind;
    if (key === metric) th.setAttribute('aria-sort', ascending ? 'ascending' : 'descending');
    header.append(th);
  }
  if (metric === 'id') header.firstChild.setAttribute('aria-sort', 'ascending');
  head.append(header);
  for (const row of visibleRows) {
    const tr = element('tr');
    tr.append(createHeader(row.id, 'row'));
    for (const [index, { key, kind }] of columns.entries()) {
      const cell = element('td', 'companion-cross-value');
      const value = row[key];
      cell.append(chartNumber('strong', value, key === 'density' ? densityNumber : number));
      if (value !== null) cell.append(chartBar(value, maxima[index], chartFamily[kind]));
      tr.append(cell);
    }
    body.append(tr);
  }
  const totals = element('tr');
  totals.append(createHeader('Total del área', 'row'));
  for (const column of columns) totals.append(chartNumber('td', column.total));
  foot.append(totals);
  description.textContent = [hasDensity ? 'Robos/km² = total dividido por superficie.' : '',
    columns.length > 1 ? 'Cada columna usa su propia escala.' : '',
    summaryAxes.some(([, layer]) => layer.unassignedTotal) ? 'La tabla incluye los registros ubicados en un subcuadrante.' : ''].filter(Boolean).join(' ');
  description.hidden = !description.textContent;
  const most = hasDensity ? sortCompanionQuadrants(rows, { metric: robberyAxis })[0] : null;
  const dense = hasDensity ? sortCompanionQuadrants(rows, { metric: 'density' })[0] : null;
  insight.hidden = !(most && dense?.density > 0 && most.id !== dense.id);
  if (!insight.hidden) {
    insight.append(element('strong', null, `${label} ${most.id}`), ' · ', chartNumber('span', most[robberyAxis]),
      ' robos, mayor total. ', element('strong', null, `${label} ${dense.id}`), ' · ', chartNumber('span', dense.density, densityNumber),
      ' robos/km², mayor densidad media.');
  }
  return section;
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

function createForecastMapPair() {
  const pair = element('div', 'companion-forecast-map-pair');
  const grid = element('div', 'companion-forecast-map-grid');
  const maps = Object.fromEntries([
    ['before', 'Antes'], ['after', 'Con inversión']
  ].map(([key, label]) => {
    const figure = element('figure');
    figure.dataset.scenario = key;
    const caption = element('figcaption', null, label);
    const map = createCompanionTerritoryMap();
    const slot = element('div', 'companion-territory-map-slot');
    slot.append(map.element);
    figure.append(caption, slot);
    grid.append(figure);
    return [key, map];
  }));
  const legend = element('div', 'companion-forecast-map-legend');
  legend.setAttribute('role', 'img');
  legend.setAttribute('aria-label', 'Escala de concentración local común a ambos mapas, de baja a alta');
  const ramp = element('span', 'companion-forecast-map-ramp');
  ramp.style.background = `linear-gradient(90deg, ${HEAT_COLOR_STOPS.map(({ color, value }) =>
    `rgb(${color.join(',')}) ${value * 100}%`).join(', ')})`;
  legend.append(element('strong', null, 'Escala común'), element('span', null, 'Baja'), ramp, element('span', null, 'Alta'));
  pair.append(grid, legend);
  return {
    element: pair,
    update(territory) {
      const { before, after, ...scope } = territory ?? {};
      maps.before.update({ ...scope, layers: before ?? [] });
      maps.after.update({ ...scope, layers: after ?? [] });
      legend.hidden = !before?.length;
    },
    destroy() {
      for (const map of Object.values(maps)) map.destroy();
      pair.remove();
    }
  };
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
    view.mapCard = mapCard;
    view.mapSlot = element('div', 'companion-territory-map-slot');
    view.map = createCompanionTerritoryMap();
    view.mapSlot.append(view.map.element);
    mapCard.append(view.area, view.mapSlot);
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
  const areaLabel = !isForecast && ids?.length && ids.length <= 4 ? quadrantsLabel(ids)
    : territory?.areaLabel || (ids === null ? 'Toda la comuna' : 'Sin cuadrantes seleccionados');
  if (view.area.textContent !== areaLabel) view.area.textContent = areaLabel;
  view.title.textContent = isForecast ? `Simular inversión · ${state.forecast?.year || 2027}` : 'Análisis territorial';
  view.main.dataset.mode = state.mode;
  view.mapSlot.hidden = isForecast;
  if (isForecast) {
    if (!view.forecastMaps) {
      view.forecastMaps = createForecastMapPair();
      view.mapCard.append(view.forecastMaps.element);
    }
    view.forecastMaps.update(territory);
  } else {
    view.forecastMaps?.destroy();
    view.forecastMaps = null;
    view.map.update(territory || { quadrantIds: null, layers: [] });
  }
  const { territory: mapData, ...detailsState } = state;
  const key = JSON.stringify([areaLabel, detailsState]);
  if (view.key === key) return;
  const details = document.createDocumentFragment();
  const context = document.createDocumentFragment();
  if (isForecast) {
    details.append(forecastDetails(state));
    const areas = installationAreas(state.forecast?.placements || []);
    if (areas) context.append(areas);
  } else if (state.selectedResources?.length) {
    const periods = state.resourcePeriods ?? Object.fromEntries(
      (state.layers ?? []).map(layer => [layer.kind, layer.period])
    );
    if (state.selectedResources.length === 1) {
      const [resource] = state.selectedResources;
      const sheet = renderCompanionResource({ ...state, resource, period: periods[resource.kind] || state.period });
      if (sheet) details.append(sheet);
    } else {
      details.append(renderCompanionResourceSelection(state.selectedResources, periods));
    }
  } else {
    const resource = state.resource ? renderCompanionResource(state) : null;
    const results = state.layers?.length ? resultsCard(state.layers, { compact: Boolean(resource) }) : null;
    const cross = crossFinding(insights?.cross, insights?.scopeCount);
    if (resource) {
      details.append(resource);
      const side = element('section', 'companion-card companion-query-context');
      if (results) side.append(results);
      if (cross) side.append(cross);
      if (side.childElementCount) context.append(side);
    } else {
      const report = element('section', 'companion-card companion-analysis-report');
      const rankingSource = insights?.cross ?? insights?.ranking;
      const ranking = rankingCard(rankingSource, state.ranking, cross);
      const local = state.inspected ? sectorCard(sector, true) : null;
      if (results) report.append(results);
      if (ranking) report.append(ranking);
      details.append(report);
      if (local) {
        local.classList.add('companion-card');
        context.append(local);
      } else if (overview?.security && ids?.length) context.append(robberyShare(overview.security, areaLabel));
      else {
        const patterns = breakdownCard(insights?.layers?.[0]);
        if (patterns) context.append(patterns);
      }
    }
  }
  view.context.replaceChildren(context);
  view.details.replaceChildren(details);
  view.key = key;
}

function disposeTerritorialView(root) {
  const view = territorialViews.get(root);
  view?.map.destroy();
  view?.forecastMaps?.destroy();
  territorialViews.delete(root);
}
const isTerritorialMode = mode => ['forecast', 'resource', 'sector', 'summary'].includes(mode);

function idleView(root, showConnectionHelp = false) {
  const idle = element('div', 'companion-idle');
  idle.append(brand());
  const caption = element('div', 'companion-idle-caption');
  caption.append(element('p', null, 'Concejo en perspectiva'));
  if (showConnectionHelp) caption.append(element('p', 'companion-idle-note', 'Abre Información complementaria desde el mapa.'));
  idle.append(caption);
  root.replaceChildren(idle);
}

export function renderCompanion(root, state = {}) {
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
  else if (state.mode === 'previous-session') renderPreviousSession(root, state.session);
  else idleView(root);
  updateUfReadouts(root, ufReference.current());
}

const root = document.getElementById('companion-root');
if (root) {
  let last = '';
  const update = state => {
    const fingerprint = isTerritorialMode(state?.mode) ? null : JSON.stringify(state || {});
    if (fingerprint !== null && fingerprint === last) return;
    last = fingerprint;
    renderCompanion(root, state);
  };
  update({ mode: 'idle' });
  const refreshUf = (retry = false) => {
    updateUfReadouts(root, ufReference.current());
    void ufReference.refresh({ retry }).then(quote => updateUfReadouts(root, quote));
  };
  refreshUf();
  const ufTimer = setInterval(refreshUf, 60_000);
  window.addEventListener('online', () => refreshUf(true));
  window.addEventListener('pageshow', () => refreshUf());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshUf();
  });
  window.addEventListener('pagehide', event => {
    if (!event.persisted) {
      clearInterval(ufTimer);
      disposeTerritorialView(root);
    }
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
    const connection = connectCompanionViewer(update);
    if (connection?.embedded) document.body.classList.add('companion-embedded');
    if (!connection) idleView(root, true);
  }
}
