import './glass-ui.css';
import './companion-ui.css';
import { buildInvestmentSummary, buildResourceSheet, UF_REFERENCE } from './investment-data.js';
import { renderPreviousSession } from './previous-session-view.js';
import { createRobberyShare } from './robbery-share-view.js';
import { createCompanionTerritoryMap } from './companion-territory-map.js';

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

function shell(state) {
  const main = element('div', 'companion-shell');
  const top = element('header', 'companion-topbar');
  top.append(element('strong', null, 'La Reina'), element('span', null, 'Concejo en perspectiva'));
  const content = element('div', 'companion-content');
  const heading = element('header', 'companion-heading');
  const eyebrow = state.mode === 'forecast' ? 'Plan de inversión' : state.mode === 'agenda' ? 'Sesión del concejo' : 'Ficha territorial';
  heading.append(element('p', 'companion-eyebrow', eyebrow));
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
  const section = card('Distribución de la inversión');
  const list = element('dl', 'companion-cost-chart');
  const largest = Math.max(1, ...budget.breakdown.map(item => item.value));
  for (const item of budget.breakdown) {
    const row = element('div', 'companion-cost-row');
    row.dataset.category = item.key;
    const label = element('dt', null, item.label);
    const value = element('dd', null, money.format(item.value));
    value.append(element('small', 'companion-breakdown-uf', inUF(item.value)));
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
  const section = card('Plazo de implementación');
  const total = element('p', 'companion-delivery-total');
  total.append(element('strong', null, number.format(budget.totalDays)), element('span', null, 'días hábiles estimados'));
  const list = element('ol', 'companion-delivery');
  budget.timeline.forEach((step, index) => {
    const row = element('li');
    row.append(element('span', 'companion-step-number', index + 1), element('span', null, step.label), element('strong', null, `${number.format(step.days)} días`));
    list.append(row);
  });
  section.append(total, list);
  return section;
}

function budgetFooter() {
  return element('p', 'companion-footnote',
    `Presupuesto referencial · IVA incluido · Unidad de Fomento (UF) al ${date(UF_REFERENCE.date)} · 1 UF = $${decimals.format(UF_REFERENCE.pesos)} · SII`);
}

function investmentAmount(label, pesos) {
  const amount = element('div', 'companion-investment-amount');
  amount.append(element('span', null, label), element('strong', 'companion-price', money.format(pesos)),
    element('span', 'companion-price-uf', inUF(pesos)));
  return amount;
}

function procurementCard(procurement) {
  const section = card(procurement.illustrative ? 'Licitación de referencia' : 'Licitación');
  section.classList.add('companion-procurement');
  const identity = element('dl', 'companion-procurement-identity');
  const procurementId = procurement.id?.startsWith('Ejemplo ') ? null : procurement.id;
  identity.append(fact('Nombre de la licitación', procurement.name || 'Por confirmar'),
    fact('ID de la licitación', procurementId || 'Por confirmar'),
    fact('Encargado', procurement.lead || 'Por confirmar'));
  const dates = element('dl', 'companion-procurement-dates');
  dates.append(fact('Cierre de la licitación', procurement.close ? date(procurement.close) : 'Por confirmar'),
    fact('Entrega prometida', procurement.promisedDelivery ? date(procurement.promisedDelivery) : 'Por confirmar'),
    fact('Puesta en marcha real', procurement.operation ? date(procurement.operation) : 'Por confirmar'));
  const compliance = element('div', 'companion-procurement-compliance');
  compliance.append(element('span', null, 'Cumplimiento'), element('strong', null, procurement.compliance));
  compliance.dataset.status = procurement.delayDays === null ? 'unknown' : procurement.delayDays > 0 ? 'late' : 'on-time';
  const durations = element('dl', 'companion-procurement-durations');
  const days = value => value === null ? 'Por confirmar' : `${number.format(value)} días`;
  const difference = procurement.delayDays === null ? 'Por confirmar'
    : procurement.delayDays > 0 ? `${number.format(procurement.delayDays)} días de atraso`
      : procurement.delayDays < 0 ? `${number.format(-procurement.delayDays)} días de adelanto` : 'Sin diferencia';
  durations.append(fact('Plazo comprometido', days(procurement.plannedDays)),
    fact('Plazo real', days(procurement.elapsedDays)), fact('Diferencia', difference));
  const reason = element('div', 'companion-procurement-reason');
  reason.append(element('h3', null, procurement.illustrative ? 'Motivo de referencia' : 'Motivo documentado'),
    element('p', null, procurement.reason || 'Por confirmar'));
  if (procurement.reasonSource) {
    reason.append(element('small', null, `Fuente · ${procurement.reasonSource.label}`));
  }
  section.append(identity, dates, compliance, durations,
    element('p', 'companion-procurement-note', 'Plazos en días corridos desde el cierre hasta la entrega operativa.'), reason);
  return section;
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

  const view = shell(state);
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
  const pending = topics.filter(topic => topic.status === 'pending');
  const reviewed = topics.filter(topic => topic.status === 'reviewed').length;
  const agendaCounts = element('dl', 'companion-agenda-counts');
  agendaCounts.append(fact('Revisados', `${reviewed} de ${topics.length}`), fact('Pendientes', pending.length));
  if (pending[0]) agendaCounts.append(fact('Siguiente pendiente', `${pending[0].time} · ${pending[0].title}`));
  schedule.append(agendaCounts);
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
  for (const [id, counts] of sorted) {
    const label = id ? quadrantsLabel([id]) : 'Sin cuadrante asignado';
    const summary = [quantity(counts.camera, 'cámara', 'cámaras'), quantity(counts.fixed, 'caseta', 'casetas')].filter(Boolean).join(' · ');
    list.append(fact(label, summary));
  }
  section.append(list);
  return section;
}

function forecastDetails(state) {
  const forecast = state.forecast || {};
  const placements = forecast.placements || [];
  const budget = buildInvestmentSummary(placements);
  const content = element('div', 'companion-column companion-forecast-details');
  if (forecast.error || forecast.ready === false) {
    const status = card(forecast.error ? 'Proyección no disponible' : 'Preparando la estimación');
    status.append(element('p', null, forecast.error ? 'No se pudo cargar la proyección del mapa.' : 'La ficha se actualizará al completar la carga.'));
    content.append(status);
    return content;
  }
  if (Number.isFinite(forecast.baselineTotal) && Number.isFinite(forecast.scenarioTotal)) {
    const comparison = card('Estimación para La Reina');
    comparison.append(element('p', 'companion-analysis-note', forecast.showAfter === false ? 'Mapa actual · Antes de invertir' : 'Mapa actual · Escenario de inversión'));
    const totals = element('dl', 'companion-metrics');
    totals.append(metric('Sin nuevas instalaciones', number.format(Math.round(forecast.baselineTotal))),
      metric('Con la inversión', number.format(Math.round(forecast.scenarioTotal))));
    if (Number.isFinite(forecast.reduction)) {
      const delta = forecast.scenarioTotal - forecast.baselineTotal;
      comparison.append(element('p', 'companion-analysis-note',
        `${delta < 0 ? '−' : delta > 0 ? '+' : ''}${number.format(Math.round(Math.abs(delta)))} robos en la estimación`));
    }
    comparison.append(totals);
    if (forecast.local?.id && Number.isFinite(forecast.local.baseline) && Number.isFinite(forecast.local.scenario)) {
      const local = element('dl', 'companion-analysis-status');
      local.append(fact(quadrantsLabel([forecast.local.id]),
        `${number.format(Math.round(forecast.local.baseline))} → ${number.format(Math.round(forecast.local.scenario))} robos estimados`));
      comparison.append(local);
    }
    content.append(comparison);
  }
  const hero = element('section', 'companion-investment');
  const quantities = element('dl', 'companion-quantities');
  quantities.append(metric('Cámaras nuevas', number.format(budget.counts.camera)), metric('Casetas nuevas', number.format(budget.counts.fixed)));
  hero.append(investmentAmount('Inversión inicial estimada', budget.initial), quantities);
  const metrics = element('dl', 'companion-metrics');
  metrics.append(metric('Operación anual', money.format(budget.annualOperation), inUF(budget.annualOperation)),
    metric('Total del primer año', money.format(budget.firstYear), inUF(budget.firstYear)));
  const grid = element('div', 'companion-grid');
  const first = element('div', 'companion-column');
  first.append(budgetChart(budget));
  const second = element('div', 'companion-column');
  const management = card('Gestión del proyecto');
  const facts = element('dl', 'companion-facts');
  facts.append(fact('Responsable', budget.lead), fact('Unidad a cargo', budget.unit), fact('Etapa', 'Planificación'), fact('Año de inversión', forecast.year || 2027));
  management.append(facts);
  const areas = installationAreas(placements);
  if (areas) second.append(areas);
  second.append(management, delivery(budget));
  grid.append(first, second);
  if (!budget.quantity) content.append(element('p', 'companion-empty-note', 'El presupuesto se actualizará al incorporar cámaras o casetas en el mapa.'));
  content.append(hero, metrics, grid, budgetFooter());
  return content;
}

function resourceFocus(state, sheet) {
  const heading = card(sheet.name);
  const quadrant = quadrantsLabel(state.sector?.quadrantIds);
  heading.append(element('p', 'companion-analysis-note',
    [sheet.address, quadrant, state.resource?.outsideArea ? 'Fuera del área seleccionada' : ''].filter(Boolean).join(' · ')));
  const facts = element('dl', 'companion-analysis-status');
  facts.append(fact('Estado del período', sheet.state));
  if (sheet.activations !== null) facts.append(fact('Pulsaciones', number.format(sheet.activations)));
  heading.append(facts);
  return heading;
}

function resourceDetails(sheet) {
  const content = element('div', 'companion-column companion-resource-details');
  const hero = element('section', 'companion-investment');
  hero.append(investmentAmount('Costo inicial de referencia', sheet.budget.initial));
  const metrics = element('dl', 'companion-metrics');
  metrics.append(metric('Operación anual', money.format(sheet.budget.annualOperation), inUF(sheet.budget.annualOperation)));
  metrics.append(metric('Instalación', sheet.installed ? date(sheet.installed) : `${sheet.budget.totalDays} días hábiles`, sheet.installed ? 'Fecha del inventario' : 'Plazo de referencia'));
  const grid = element('div', 'companion-grid');
  const first = budgetChart(sheet.budget);
  const second = element('div', 'companion-column');
  const management = card('Identificación y gestión');
  const facts = element('dl', 'companion-facts');
  facts.append(fact('Unidad a cargo', sheet.unit), fact('Equipamiento', sheet.type));
  if (sheet.id) facts.append(fact('ID del recurso', sheet.id));
  if (sheet.period) facts.append(fact('Período consultado', sheet.period));
  if (sheet.rank) facts.append(fact('Uso en la selección', `Puesto ${sheet.rank}`));
  management.append(facts);
  second.append(procurementCard(sheet.procurement), management);
  grid.append(first, second);
  content.append(hero, metrics, grid);
  content.append(budgetFooter());
  return content;
}

function resultsCard(layers) {
  const section = card(layers.length > 1 ? 'Resultados de la comparación' : 'Resultado de la consulta');
  const results = element('div', 'companion-layer-results');
  for (const { kind, title, summary = {}, ready, error, period, filterLabels = [], display, opacity } of layers) {
    const result = element('div', 'companion-layer-result');
    result.dataset.kind = kind;
    const main = element('div', 'companion-layer-result-main');
    main.append(element('h3', null, title || names[kind]?.[2] || 'Registros'),
      element('strong', null, Number.isFinite(summary.total) && ready !== false && !error ? number.format(summary.total) : '—'));
    result.append(main);
    if (error || ready === false) result.append(element('p', 'companion-analysis-note', error || 'Cargando datos…'));
    else {
      if (period) result.append(element('p', 'companion-layer-period', period));
      const filters = [...filterLabels];
      if (display) filters.push(display);
      if (layers.length > 1 && Number.isFinite(opacity)) filters.push(`Visibilidad ${percentages.format(opacity)}`);
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

function crossCard(cross, scopeCount) {
  if (!cross || !scopeCount) return null;
  const { primary, secondary, rows } = cross;
  const section = card('Cruce por cuadrante');
  const label = layer => names[layer.kind]?.[2] || layer.kind;
  if (cross.contextual || cross.differentCutoffs) {
    const context = element('p', 'companion-cross-context');
    context.append(element('span', null, [label(primary), primary.period].filter(Boolean).join(' · ')),
      element('span', null, [cross.contextual ? `${label(secondary)} de referencia` : label(secondary), secondary.period].filter(Boolean).join(' · ')));
    section.append(context);
  }
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
  if (cross.withoutEquipment && robbery) {
    const { id, primary: left, secondary: right } = cross.withoutEquipment;
    const count = robbery === primary ? left : right;
    section.append(element('p', 'companion-cross-priority',
      `${quadrantsLabel([id])} · ${formatCount(count, 'security')} en ese grupo`));
  }
  if (rows?.length) {
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
  const notes = [rows?.length ? 'Escala propia en cada columna.' : '', 'Coincidencia territorial según los filtros.'];
  if (primary.unassignedTotal || secondary.unassignedTotal) notes.push('Cruce limitado a registros con cuadrante.');
  section.append(element('p', 'companion-analysis-note', notes.filter(Boolean).join(' ')));
  return section;
}

function patternsCard(layers) {
  const populated = layers.filter(layer => layer.breakdown?.length || layer.topQuadrants?.length);
  if (!populated.length) return null;
  const section = card('Distribución de los registros');
  for (const { kind, breakdown = [], topQuadrants = [] } of populated) {
    const group = element('div', 'companion-pattern-layer');
    group.dataset.kind = kind;
    group.append(element('h3', null, names[kind]?.[2] || 'Registros'));
    const groups = new Map();
    for (const item of breakdown.filter(item => (kind === 'fixed' || item.group !== 'Estado') && item.unit !== 'pulsaciones')) {
      if (!groups.has(item.group)) groups.set(item.group, []);
      groups.get(item.group).push(item);
    }
    for (const [name, items] of groups) {
      const list = element('dl', 'companion-analysis-status');
      items.forEach(item => list.append(fact(item.label, number.format(item.total))));
      group.append(element('p', 'companion-pattern-group', name), list);
    }
    const top = topQuadrants[0];
    if (top) group.append(element('p', 'companion-pattern-peak', `Mayor recuento · ${quadrantsLabel([top.id])} · ${formatCount(top.total, kind)}`));
    section.append(group);
  }
  return section;
}

function sectorCard(sector, isPreview) {
  if (!sector || (isPreview ? !sector.quadrantIds?.length : !sector.security)) return null;
  const { security, cameras, resources = {} } = sector;
  const section = card(isPreview ? `En el mapa · ${quadrantsLabel(sector.quadrantIds)}` : 'Actividad reciente');
  const facts = element('dl', 'companion-analysis-status');
  if (isPreview) {
    for (const [kind, detail] of [['security', security], ['cameras', cameras], ...Object.entries(resources)]) {
      if (detail) facts.append(fact(names[kind]?.[2] || 'Registros', number.format(detail.total)));
    }
  }
  if (security) {
    facts.append(fact('Últimos 7 días del período', number.format(security.last7Days ?? 0)));
    if (isPreview && security.communeTotal > 0) facts.append(fact('Del total comunal', percentages.format(security.total / security.communeTotal)));
    if (security.last7DaysRange?.label) section.append(element('p', 'companion-analysis-note', security.last7DaysRange.label));
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
    view = shell({ mode: 'summary' });
    view.main.classList.add('companion-territorial');
    view.content.querySelector('.companion-eyebrow').remove();
    view.subtitle.hidden = true;
    const layout = element('div', 'companion-territorial-layout');
    const mapCard = element('section', 'companion-territory-card');
    mapCard.setAttribute('aria-labelledby', 'companion-territory-title');
    const mapHeading = element('header', 'companion-territory-heading');
    const mapTitle = element('h2', null, 'Área en el mapa');
    mapTitle.id = 'companion-territory-title';
    view.area = element('p', 'companion-territory-area');
    view.area.setAttribute('aria-live', 'polite');
    mapHeading.append(mapTitle, view.area);
    const mapSlot = element('div', 'companion-territory-map-slot');
    view.map = createCompanionTerritoryMap();
    mapSlot.append(view.map.element);
    mapCard.append(mapHeading, mapSlot);
    view.details = element('div', 'companion-territorial-details');
    view.details.setAttribute('role', 'region');
    view.details.setAttribute('aria-label', 'Resultados y cruces');
    view.details.tabIndex = 0;
    layout.append(mapCard, view.details);
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
  view.map.update(territory || { quadrantIds: null, layers: [] });
  const { territory: mapData, ...detailsState } = state;
  const key = JSON.stringify([areaLabel, detailsState]);
  if (view.key === key) return;
  const details = document.createDocumentFragment();
  if (isForecast) details.append(forecastDetails(state));
  else {
    if (state.layers?.length) details.append(resultsCard(state.layers));
    const sheet = state.resource ? buildResourceSheet(state.kind || state.resource.kind, state.resource, state) : null;
    const focus = state.inspected ? sectorCard(sector, true) : null;
    if (sheet) details.append(resourceFocus(state, sheet));
    else if (focus) details.append(focus);
    const cross = crossCard(insights?.cross, insights?.scopeCount);
    if (cross) details.append(cross);
    if (sheet) details.append(resourceDetails(sheet));
    if (overview?.security && ids?.length) details.append(robberyShare(overview.security, areaLabel));
    const latest = sheet ? sectorCard(sector, false) : !focus ? sectorCard(overview, false) : null;
    if (latest) details.append(latest);
    const patterns = patternsCard(insights?.layers || []);
    if (patterns) details.append(patterns);
  }

  const previousMode = view.mode;
  view.details.replaceChildren(details);
  if (previousMode && (previousMode === 'forecast') !== isForecast) view.details.scrollTop = 0;
  view.mode = state.mode;
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
