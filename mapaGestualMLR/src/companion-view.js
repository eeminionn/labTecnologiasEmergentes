import './glass-ui.css';
import './companion-ui.css';
import { buildInvestmentSummary, buildResourceSheet, UF_REFERENCE } from './investment-data.js';
import { renderPreviousSession } from './previous-session-view.js';
import { createRobberyShare } from './robbery-share-view.js';

const number = new Intl.NumberFormat('es-CL');
const money = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
const decimals = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inUF = pesos => `${decimals.format(pesos / UF_REFERENCE.pesos)} UF`;
const date = value => value ? new Intl.DateTimeFormat('es-CL', { timeZone: 'UTC' }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`)) : 'Por definir';
const agendaViews = new WeakMap();
const categoryCountLabels = {
  security: 'Robos registrados',
  cameras: 'Cámaras en la comuna',
  camera: 'Cámaras en la comuna',
  fixed: 'Puntos fijos de seguridad ciudadana',
  alarms: 'Botones de emergencia en la comuna',
};
const agendaStatusLabels = { current: 'En curso', reviewed: 'Revisado', pending: 'Pendiente' };

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
  const key = JSON.stringify({ index: agenda.index, topic: current, topics, points, selectedPointId: state.selectedPointId });
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
  const list = element('ol', 'companion-agenda-list');
  topics.forEach((topic, index) => {
    const row = element('li');
    const status = topic.status || (index === agenda.index ? 'current' : index < agenda.index ? 'reviewed' : 'pending');
    row.dataset.status = status;
    if (index === agenda.index) row.setAttribute('aria-current', 'step');
    const time = element('time', null, topic.time);
    time.dateTime = topic.time || '';
    row.append(time, element('span', 'companion-agenda-name', topic.title), element('small', 'companion-agenda-status', agendaStatusLabels[status] || status));
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
  grid.append(schedule, themes);
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

function forecastView(root, state) {
  const forecast = state.forecast || {};
  const placements = forecast.placements || [];
  const budget = buildInvestmentSummary(placements);
  const view = shell(state);
  view.title.textContent = state.title || `Refuerzo de seguridad ${forecast.year || 2027}`;
  view.subtitle.textContent = forecast.showAfter === false
    ? 'Vista anterior · presupuesto del escenario propuesto'
    : 'Cámaras y casetas incorporadas al escenario';
  if (forecast.error || forecast.ready === false) {
    const status = card(forecast.error ? 'Proyección no disponible' : 'Preparando la estimación');
    status.append(element('p', null, forecast.error ? 'No se pudo cargar la proyección del mapa.' : 'La ficha se actualizará al completar la carga.'));
    view.content.append(status);
    root.replaceChildren(view.main);
    return;
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
  if (!budget.quantity) view.content.append(element('p', 'companion-empty-note', 'El presupuesto se actualizará al incorporar cámaras o casetas en el mapa.'));
  view.content.append(hero, metrics, grid, budgetFooter());
  root.replaceChildren(view.main);
}

function resourceView(root, state) {
  const sheet = buildResourceSheet(state.kind || state.resource?.kind, state.resource, state);
  if (!sheet) return idleView(root);
  const view = shell(state);
  view.title.textContent = sheet.name;
  const quadrantLabel = quadrantsLabel(state.sector?.quadrantIds);
  view.subtitle.textContent = [sheet.address, quadrantLabel, state.resource?.outsideArea ? 'Fuera del área seleccionada' : ''].filter(Boolean).join(' · ');
  const hero = element('section', 'companion-investment');
  const status = element('dl', 'companion-quantities');
  status.append(metric('Estado del período', sheet.state));
  hero.append(investmentAmount('Costo inicial de referencia', sheet.budget.initial), status);
  const metrics = element('dl', 'companion-metrics');
  metrics.append(metric('Operación anual', money.format(sheet.budget.annualOperation), inUF(sheet.budget.annualOperation)));
  if (sheet.activations !== null) metrics.append(metric('Pulsaciones', number.format(sheet.activations), sheet.period));
  else metrics.append(metric('Instalación', sheet.installed ? date(sheet.installed) : `${sheet.budget.totalDays} días hábiles`, sheet.installed ? 'Fecha del inventario' : 'Plazo de referencia'));
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
  view.content.append(hero, metrics, grid);
  if (state.sector?.security && !state.resource?.outsideArea) view.content.append(robberyShare(state.sector.security, quadrantLabel || undefined));
  view.content.append(budgetFooter());
  root.replaceChildren(view.main);
}

function sectorView(root, state) {
  const sector = state.sector || {};
  const view = shell(state);
  const quadrants = sector.quadrantIds ?? [];
  const quadrantLabel = quadrantsLabel(quadrants);
  view.title.textContent = quadrants.length === 1 ? quadrantLabel : state.title || 'Cuadrantes seleccionados';
  view.subtitle.textContent = [quadrants.length > 1 ? quadrantLabel : '', state.period].filter(Boolean).join(' · ');
  const layers = state.layers || [];
  const content = element('div', layers.length > 1 ? 'companion-grid companion-quadrant-grid' : 'companion-column');
  for (const {kind, title, period} of layers) {
    const detail = kind === 'security' ? sector.security : kind === 'cameras' ? sector.cameras : sector.resources?.[kind];
    if (!detail) continue;
    const metrics = element('dl', 'companion-sector-metrics');
    if (kind === 'security') {
      const column = element('div', 'companion-column');
      const recent = card('Actividad reciente');
      metrics.append(metric('Últimos 7 días del período', number.format(detail.last7Days ?? 0), detail.last7DaysRange?.label));
      recent.append(metrics);
      if (detail.lastIncident) {
        const last = detail.lastIncident;
        recent.append(element('p', 'companion-secondary', `Último registro · ${date(last.fecha)} · ${last.hora}`),
          element('p', null, last.tipo_incidente),
          element('p', null, String(last.direccion || '').replace(' (numeración simulada)', '')));
      } else recent.append(element('p', 'companion-secondary', 'Sin registros para esta selección.'));
      column.append(robberyShare(detail, quadrantLabel || detail.areaLabel), recent);
      content.append(column);
      continue;
    }
    const section = card(title);
    if (period) section.append(element('p', 'companion-comparison-period', period));
    if (kind === 'cameras') {
      metrics.append(metric('Cámaras seleccionadas', number.format(detail.total)), metric('Operativas', number.format(detail.operational)),
        metric('En mantención', number.format(detail.maintenance)), metric('Inactivas', number.format(detail.inactive)));
    } else if (kind === 'fixed') {
      metrics.append(metric('Puntos fijos seleccionados', number.format(detail.total)), metric('Monitoreando', number.format(detail.monitoring)));
    } else {
      metrics.append(metric('Botones seleccionados', number.format(detail.total)), metric('Pulsaciones del período', number.format(detail.activations)));
    }
    section.append(metrics);
    content.append(section);
  }
  view.content.append(content);
  root.replaceChildren(view.main);
}

function summaryView(root, state) {
  const view = shell(state);
  view.title.textContent = state.title || 'Análisis territorial';
  view.subtitle.textContent = state.period || 'Selección del mapa';
  const layers = state.layers?.length ? state.layers : [state];
  const comparison = layers.length > 1;
  const selection = element('div', comparison ? 'companion-grid' : 'companion-summary');
  for (const layer of layers) {
    const summary = layer.summary || {};
    const metrics = element('dl', 'companion-sector-metrics');
    metrics.append(metric(categoryCountLabels[layer.kind] || 'Registros de la selección', number.format(summary.total ?? 0)));
    if (['cameras', 'camera'].includes(layer.kind)) {
      metrics.append(metric('Operativas', number.format(summary.operational ?? 0)));
      metrics.append(metric('En mantención', number.format(summary.maintenance ?? 0)));
      metrics.append(metric('Inactivas', number.format(summary.inactive ?? 0)));
    }
    if (Number.isFinite(summary.monitoring)) metrics.append(metric('Monitoreando', number.format(summary.monitoring)));
    if (Number.isFinite(summary.activations)) metrics.append(metric('Pulsaciones del período', number.format(summary.activations)));
    if (comparison) {
      const section = card(layer.title || 'Selección del mapa');
      if (layer.period) section.append(element('p', 'companion-comparison-period', layer.period));
      section.append(metrics);
      selection.append(section);
    } else selection.append(metrics);
  }
  view.content.append(selection);
  root.replaceChildren(view.main);
}

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
  if (state.mode === 'agenda') agendaView(root, state);
  else if (state.mode === 'previous-session') renderPreviousSession(root, state.session, onCurrentSession);
  else if (state.mode === 'forecast') forecastView(root, state);
  else if (state.mode === 'resource') resourceView(root, state);
  else if (state.mode === 'sector') sectorView(root, state);
  else if (state.mode === 'summary') summaryView(root, state);
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
    const fingerprint = JSON.stringify(state || {});
    if (fingerprint === last) return;
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
