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

export function renderPreviousSession(root, session = {}, onCurrentSession) {
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
  const title = element('h1', null, session.title || 'Sesión pasada');
  title.id = 'companion-title';
  headingText.append(title, element('p', 'companion-subtitle', sessionDate(session.date)));
  heading.append(headingText);
  if (typeof onCurrentSession === 'function') {
    const next = element('button', 'primary previous-session-next', 'Ir a la sesión actual');
    next.type = 'button';
    next.addEventListener('click', onCurrentSession);
    heading.append(next);
  }

  const layout = element('div', 'previous-session-layout');
  const figure = element('figure', 'companion-card previous-session-chart');
  figure.setAttribute('aria-labelledby', 'previous-session-chart-title');
  const caption = element('figcaption', 'previous-session-chart-heading');
  const chartTitle = element('h2', null, 'Tiempo por tema');
  chartTitle.id = 'previous-session-chart-title';
  const totalTime = element('dl', 'previous-session-total');
  totalTime.append(element('dt', null, 'Duración de la sesión'), element('dd', null, `${number.format(total)} min`));
  caption.append(chartTitle, totalTime);
  const keys = element('div', 'previous-session-keys');
  keys.append(legend('Minutos usados', 'previous-session-actual-key'));
  keys.append(legend(planned.length === 1 ? `${number.format(planned[0])} min previstos por tema` : 'Minutos previstos', 'previous-session-planned-key'));
  caption.append(keys);

  const axis = element('div', 'previous-session-axis');
  axis.setAttribute('aria-hidden', 'true');
  axis.append(element('span', null, 'Tema'));
  const ticks = element('div', 'previous-session-ticks');
  for (let value = 0; value <= maximum; value += 10) {
    const tick = element('span', null, value);
    tick.style.left = `${value / maximum * 100}%`;
    ticks.append(tick);
  }
  axis.append(ticks, element('span', 'previous-session-axis-unit', 'Usados'));

  const list = element('ol', 'previous-session-rows');
  topics.forEach(topic => {
    const actual = minutes(topic.actualMinutes);
    const expected = minutes(topic.plannedMinutes);
    const row = element('li', 'previous-session-row');
    row.dataset.carryover = String(Boolean(topic.carryover));
    const topicTitle = element('div', 'previous-session-topic');
    topicTitle.append(element('strong', null, topic.title));
    const track = element('div', 'previous-session-track');
    track.setAttribute('aria-hidden', 'true');
    const actualBar = element('span', 'previous-session-actual');
    actualBar.style.width = `${actual / maximum * 100}%`;
    track.append(actualBar);
    const marker = element('span', 'previous-session-planned');
    marker.style.left = `${expected / maximum * 100}%`;
    track.append(marker);
    const value = element('div', 'previous-session-value');
    value.append(element('strong', null, `${number.format(actual)} min`));
    if (planned.length > 1) value.append(element('small', null, `${number.format(expected)} min previstos`));
    row.append(topicTitle, track, value);
    list.append(row);
  });
  figure.append(caption, axis, list);
  layout.append(figure);

  const carryover = topics.find(topic => topic.carryover);
  if (carryover) {
    const callout = element('aside', 'previous-session-carryover');
    const label = element('div');
    label.append(element('p', 'previous-session-carryover-label', 'Retomar con prioridad'), element('h3', null, session.carryoverTopic || carryover.title));
    const text = element('p', 'previous-session-carryover-time');
    const pending = Math.max(0, minutes(carryover.plannedMinutes) - minutes(carryover.actualMinutes));
    text.append(element('strong', null, `${number.format(carryover.actualMinutes)} de ${number.format(carryover.plannedMinutes)} min`));
    if (pending > 0) text.append(element('span', null, `${number.format(pending)} min pendientes`));
    callout.append(label, text);
    figure.append(callout);
  }

  const attendees = Array.isArray(session.attendance) ? session.attendance.filter(person => typeof person?.name === 'string' && person.name.trim()) : [];
  if (attendees.length) {
    layout.classList.add('has-attendance');
    const attendance = element('section', 'companion-card previous-session-attendance');
    attendance.setAttribute('aria-labelledby', 'previous-session-attendance-title');
    const attendanceHeading = element('header', 'previous-session-attendance-heading');
    const attendanceTitle = element('h2', null, 'Asistencia');
    attendanceTitle.id = 'previous-session-attendance-title';
    attendanceHeading.append(attendanceTitle);
    const groups = element('div', 'previous-session-attendance-groups');
    for (const { present, label, empty } of [
      { present: true, label: 'Presentes', empty: 'Sin asistentes' },
      { present: false, label: 'Ausentes', empty: 'Sin ausencias' },
      { present: undefined, label: 'Sin registro' }
    ]) {
      const people = attendees.filter(person => (typeof person.present === 'boolean' ? person.present : undefined) === present);
      if (!people.length && !empty) continue;
      const group = element('div', 'previous-session-attendance-group');
      group.dataset.present = String(present);
      const groupHeading = element('h3');
      groupHeading.append(element('span', null, label), ' ', element('span', null, number.format(people.length)));
      group.append(groupHeading);
      if (people.length) {
        const names = element('ul', 'previous-session-attendees');
        names.setAttribute('role', 'list');
        for (const person of people) {
          const row = element('li', 'previous-session-attendee', person.name);
          row.dataset.present = String(present);
          names.append(row);
        }
        group.append(names);
      } else {
        group.append(element('p', 'previous-session-attendance-empty', empty));
      }
      groups.append(group);
    }
    attendance.append(attendanceHeading, groups);
    layout.append(attendance);
  }

  content.append(heading, layout);
  main.append(topbar, content);
  root.replaceChildren(main);
  renderedSessions.set(root, { key, main });
}
