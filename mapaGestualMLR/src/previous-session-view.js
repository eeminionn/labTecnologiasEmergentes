import './previous-session-ui.css';

const renderedSessions = new WeakMap();
const number = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 });

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function minutes(value) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function sessionDate(value) {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date)
    : '';
}

function legend(label, className) {
  const item = element('span', 'previous-session-key');
  const swatch = element('i', className);
  swatch.setAttribute('aria-hidden', 'true');
  item.append(swatch, element('span', null, label));
  return item;
}

export function renderPreviousSession(root, session = {}) {
  const key = JSON.stringify(session);
  const previous = renderedSessions.get(root);
  if (previous?.key === key && previous.main.isConnected) return;

  const topics = Array.isArray(session.topics) ? session.topics : [];
  const total = Number.isFinite(session.durationMinutes)
    ? session.durationMinutes
    : topics.reduce((sum, topic) => sum + minutes(topic.actualMinutes), 0);
  const maximum = Math.max(40, ...topics.map(topic => Math.ceil(Math.max(minutes(topic.actualMinutes), minutes(topic.plannedMinutes)) / 10) * 10));
  const planned = [...new Set(topics.map(topic => minutes(topic.plannedMinutes)))];

  const main = element('div', 'companion-shell previous-session-view');
  const topbar = element('header', 'companion-topbar');
  topbar.append(element('strong', null, 'La Reina'), element('span', null, 'Concejo en perspectiva'));
  const content = element('div', 'companion-content');
  const heading = element('header', 'previous-session-heading');
  const headingText = element('div', 'companion-heading');
  headingText.append(element('p', 'companion-eyebrow', 'Uso del tiempo en el concejo'));
  const title = element('h1', null, session.title || 'Sesión pasada');
  title.id = 'companion-title';
  headingText.append(title, element('p', 'companion-subtitle', sessionDate(session.date)));
  const totalTime = element('dl', 'previous-session-total');
  totalTime.append(element('dt', null, 'Duración de la sesión'), element('dd', null, `${number.format(total)} min`));
  heading.append(headingText, totalTime);

  const figure = element('figure', 'companion-card previous-session-chart');
  figure.setAttribute('aria-labelledby', 'previous-session-chart-title');
  const caption = element('figcaption', 'previous-session-chart-heading');
  const chartTitle = element('h2', null, 'Tiempo dedicado a cada tema');
  chartTitle.id = 'previous-session-chart-title';
  const keys = element('div', 'previous-session-keys');
  keys.append(legend('Tiempo utilizado', 'previous-session-actual-key'), legend('Tiempo adicional', 'previous-session-overrun-key'));
  keys.append(legend(planned.length === 1 ? `${number.format(planned[0])} min previstos por tema` : 'Tiempo previsto', 'previous-session-planned-key'));
  keys.append(legend('Tiempo pendiente', 'previous-session-unused-key'));
  caption.append(chartTitle, keys);

  const axis = element('div', 'previous-session-axis');
  axis.setAttribute('aria-hidden', 'true');
  axis.append(element('span', null, 'Tema'));
  const ticks = element('div', 'previous-session-ticks');
  for (let value = 0; value <= maximum; value += 10) {
    const tick = element('span', null, value);
    tick.style.left = `${value / maximum * 100}%`;
    ticks.append(tick);
  }
  axis.append(ticks, element('span', 'previous-session-axis-unit', 'Minutos'));

  const list = element('ol', 'previous-session-rows');
  topics.forEach(topic => {
    const actual = minutes(topic.actualMinutes);
    const expected = minutes(topic.plannedMinutes);
    const difference = actual - expected;
    const row = element('li', 'previous-session-row');
    row.dataset.carryover = String(Boolean(topic.carryover));
    const topicTitle = element('div', 'previous-session-topic');
    topicTitle.append(element('strong', null, topic.title));
    const track = element('div', 'previous-session-track');
    track.setAttribute('aria-hidden', 'true');
    const actualBar = element('span', 'previous-session-actual');
    actualBar.style.width = `${Math.min(actual, expected) / maximum * 100}%`;
    track.append(actualBar);
    if (difference > 0) {
      const overrun = element('span', 'previous-session-overrun');
      overrun.style.left = `${expected / maximum * 100}%`;
      overrun.style.width = `${difference / maximum * 100}%`;
      track.append(overrun);
    }
    if (topic.carryover && actual < expected) {
      const unused = element('span', 'previous-session-unused');
      unused.style.left = `${actual / maximum * 100}%`;
      unused.style.width = `${(expected - actual) / maximum * 100}%`;
      track.append(unused);
    }
    const marker = element('span', 'previous-session-planned');
    marker.style.left = `${expected / maximum * 100}%`;
    track.append(marker);
    const value = element('div', 'previous-session-value');
    value.append(element('strong', null, `${number.format(actual)} min`));
    const delta = difference === 0 ? 'Según lo previsto' : `${difference > 0 ? '+' : '−'}${number.format(Math.abs(difference))} min`;
    value.append(element('small', null, topic.carryover ? `${number.format(actual)} de ${number.format(expected)} min` : delta));
    row.append(topicTitle, track, value);
    list.append(row);
  });
  figure.append(caption, axis, list);
  content.append(heading, figure);

  const carryover = topics.find(topic => topic.carryover);
  if (carryover) {
    const callout = element('aside', 'previous-session-carryover');
    const label = element('div');
    label.append(element('p', 'previous-session-carryover-label', 'Retomar con prioridad en esta sesión'), element('h2', null, session.carryoverTopic || carryover.title));
    const text = element('p');
    const pending = Math.max(0, minutes(carryover.plannedMinutes) - minutes(carryover.actualMinutes));
    text.append(element('strong', null, `${number.format(carryover.actualMinutes)} de ${number.format(carryover.plannedMinutes)} min. `));
    text.append(document.createTextNode(`El cierre de la sesión dejó ${number.format(pending)} min pendientes.`));
    callout.append(label, text);
    content.append(callout);
  }

  main.append(topbar, content);
  root.replaceChildren(main);
  renderedSessions.set(root, { key, main });
}
