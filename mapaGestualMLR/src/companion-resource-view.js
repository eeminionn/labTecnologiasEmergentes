import { buildResourceSheet, UF_REFERENCE } from './investment-data.js';
import './companion-resource-ui.css';

const number = new Intl.NumberFormat('es-CL');
const money = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
const uf = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const shortDate = value => value.split('-').reverse().join('/');
const days = value => `${number.format(value)} ${value === 1 ? 'día' : 'días'}`;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function fact(label, value, className, note) {
  const node = element('div', className);
  const detail = element('dd');
  if (typeof value === 'string') detail.textContent = value;
  else detail.append(value);
  if (note) detail.append(element('small', null, note));
  node.append(element('dt', null, label), detail);
  return node;
}

function price(label, pesos) {
  return fact(label, money.format(pesos), 'companion-resource-price', `${uf.format(pesos / UF_REFERENCE.pesos)} UF`);
}

function datedFact(label, value, elapsed, className, comparison) {
  const date = value ? element('time', null, shortDate(value)) : 'Por confirmar';
  if (value) date.dateTime = value;
  const item = fact(label, date, className, Number.isInteger(elapsed) ? `${days(elapsed)} corridos` : '');
  if (comparison) {
    const { maximum, planned } = comparison;
    const track = element('span', 'companion-procurement-track');
    track.setAttribute('aria-hidden', 'true');
    const normal = element('span', 'companion-procurement-track-planned');
    normal.style.width = `${Math.min(elapsed, planned) / maximum * 100}%`;
    track.append(normal);
    if (elapsed > planned) {
      const extension = element('span', 'companion-procurement-track-overrun');
      extension.style.width = `${(elapsed - planned) / maximum * 100}%`;
      track.append(extension);
    }
    item.lastElementChild.append(track);
  }
  return item;
}

function procurementSection(procurement) {
  const late = procurement.delayDays > 0;
  const section = element('section', 'companion-procurement');
  section.setAttribute('aria-label', 'Licitación');
  section.dataset.status = late ? 'late' : procurement.delayDays === null ? 'unknown' : 'on-time';

  const heading = element('header', 'companion-procurement-heading');
  const title = element('div');
  title.append(element('p', 'companion-procurement-label', 'Licitación'),
    element('h3', null, procurement.name || 'Nombre por confirmar'));
  const status = element('p', 'companion-procurement-compliance');
  status.dataset.status = section.dataset.status;
  if (late) {
    const alert = element('span', 'companion-procurement-alert', '!');
    alert.setAttribute('aria-hidden', 'true');
    status.append(alert);
  }
  const label = late ? `Fuera de plazo · ${days(procurement.delayDays)} de atraso`
    : procurement.delayDays === null ? 'Plazo por confirmar' : 'En plazo';
  status.append(element('strong', null, label));
  heading.append(title, status);

  const identity = element('dl', 'companion-procurement-identity');
  identity.append(fact('ID de la licitación', procurement.id || 'Por confirmar'),
    fact('Encargado', procurement.lead || 'Por confirmar'));
  const dates = element('dl', 'companion-procurement-dates');
  const comparable = [procurement.plannedDays, procurement.elapsedDays].every(value => Number.isInteger(value) && value >= 0);
  const comparison = comparable ? {
    maximum: Math.max(1, procurement.plannedDays, procurement.elapsedDays),
    planned: procurement.plannedDays
  } : null;
  dates.append(datedFact('Cierre', procurement.close),
    datedFact('Entrega prometida', procurement.promisedDelivery, procurement.plannedDays, undefined, comparison),
    datedFact('Puesta en marcha real', procurement.operation, procurement.elapsedDays, 'companion-procurement-operation', comparison));
  section.append(heading, identity, dates);

  if (late || procurement.reason) {
    const reason = element('p', 'companion-procurement-reason');
    reason.append(element('strong', null, late ? 'Motivo del atraso' : 'Motivo'),
      element('span', null, procurement.reason || 'Por confirmar'));
    if (procurement.reasonSource) reason.title = procurement.reasonSource.label;
    section.append(reason);
  }
  return section;
}

export function renderCompanionResource(state) {
  const sheet = buildResourceSheet(state.kind || state.resource?.kind, state.resource, state);
  if (!sheet) return null;
  const section = element('section', 'companion-resource-details');
  section.dataset.theme = 'seguridad';
  const heading = element('header', 'companion-resource-heading');
  const title = element('h2', null, sheet.name);
  title.id = 'companion-resource-title';
  section.setAttribute('aria-labelledby', title.id);
  const status = sheet.state === 'Referencia territorial' ? 'En inventario' : sheet.state;
  const headerLine = element('div', 'companion-resource-title-row');
  headerLine.append(title);
  if (status) headerLine.append(element('span', 'companion-resource-status', status));
  const quadrantIds = state.sector?.quadrantIds;
  const location = element('p', 'companion-resource-address', sheet.address);
  const locationFacts = [
    quadrantIds?.length ? `${quadrantIds.length === 1 ? 'Cuadrante' : 'Cuadrantes'} ${quadrantIds.join(', ')}` : '',
    sheet.installed ? `Instalación ${shortDate(sheet.installed)}` : '',
    state.resource?.outsideArea ? 'Fuera del área seleccionada' : ''
  ].filter(Boolean);
  heading.append(headerLine, location);
  if (locationFacts.length) heading.append(element('p', 'companion-resource-location-facts', locationFacts.join(' · ')));

  const metrics = element('dl', 'companion-resource-metrics');
  metrics.append(price('Costo inicial estimado', sheet.budget.initial), price('Operación anual estimada', sheet.budget.annualOperation));
  if (sheet.activations !== null) {
    const usage = [sheet.period, sheet.rank ? `Puesto ${number.format(sheet.rank)}` : ''].filter(Boolean).join(' · ');
    metrics.append(fact('Pulsaciones', number.format(sheet.activations), null, usage));
  }
  section.append(heading, metrics, procurementSection(sheet.procurement));
  return section;
}
