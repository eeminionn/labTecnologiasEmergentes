import './council-opening.css';
import { attendanceSummary, createCouncilAttendance, councilDateLabel } from './council-attendance.js';
import { PREVIOUS_COUNCIL_SESSION } from './previous-council-session.js';

function element(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
}

export function createCouncilOpening(panel, topics, { onAttendanceChange, review, open, start, themes }) {
  const $ = id => panel.querySelector(`#${id}`);
  const previous = PREVIOUS_COUNCIL_SESSION;
  const attendance = createCouncilAttendance(previous.attendance);
  const roster = $('council-attendance-roster');
  const summary = $('council-attendance-status');
  const message = $('council-attendance-message');
  const guest = $('council-guest-name');
  const rows = new Map();

  $('council-review-date').textContent = councilDateLabel(previous.date);
  $('council-review-duration').textContent = `${previous.durationMinutes} min`;
  $('council-review-count').textContent = previous.topics.length;
  $('council-review-attendance').textContent = `${previous.attendance.filter(person => person.present).length} de ${previous.attendance.length}`;
  $('council-review-pending').textContent = previous.carryoverTopic;
  $('council-opening-date').textContent = councilDateLabel(attendance.date);
  $('council-opening-pending').textContent = previous.carryoverTopic;
  $('council-open-session').addEventListener('click', open);
  $('council-opening-back').addEventListener('click', review);
  $('council-start-agenda').addEventListener('click', start);

  for (const topic of topics) {
    const row = element('li', 'council-category-row');
    row.dataset.theme = topic.theme;
    const time = element('time', null, topic.time);
    time.dateTime = topic.time;
    row.append(time, element('span', null, topic.title), element('small', null, themes[topic.theme]));
    $('council-opening-topics').append(row);
  }

  function feedback(text) {
    message.hidden = !text;
    if (message.textContent !== text) message.textContent = text;
  }

  function saveFeedback(saved) {
    feedback(saved === false ? 'El registro no se pudo guardar en este dispositivo.' : '');
    renderRoster();
    onAttendanceChange();
  }

  function rowFor(person) {
    const row = element('li', 'council-attendance-row');
    const name = element('span', 'council-attendance-name', person.name);
    if (!person.fixed) name.append(element('small', null, 'Invitado'));
    const buttons = element('div', 'council-attendance-options');
    buttons.setAttribute('role', 'group');
    buttons.setAttribute('aria-label', `Asistencia de ${person.name}`);
    const actions = new Map();
    for (const [status, label] of [['present', 'Presente'], ['absent', 'Ausente']]) {
      const choice = element('button');
      choice.type = 'button';
      choice.dataset.status = status;
      const mark = element('span', 'council-attendance-mark', status === 'present' ? '✓' : '×');
      mark.setAttribute('aria-hidden', 'true');
      choice.append(mark, label);
      choice.addEventListener('click', () => saveFeedback(attendance.mark(person.name, status)));
      actions.set(status, choice);
      buttons.append(choice);
    }
    if (!person.fixed) {
      const remove = element('button', 'council-guest-remove', '×');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Quitar a ${person.name}`);
      remove.addEventListener('click', () => {
        guest.focus();
        saveFeedback(attendance.remove(person.name));
      });
      buttons.append(remove);
    }
    row.append(name, buttons);
    roster.append(row);
    return { row, actions };
  }

  function renderRoster() {
    const people = attendance.list();
    const names = new Set(people.map(person => person.name));
    for (const [name, { row }] of rows) {
      if (!names.has(name)) { row.remove(); rows.delete(name); }
    }
    for (const person of people) {
      if (!rows.has(person.name)) rows.set(person.name, rowFor(person));
      const { row, actions } = rows.get(person.name);
      row.dataset.status = person.status;
      for (const [status, button] of actions) button.setAttribute('aria-pressed', String(status === person.status));
    }
    const status = attendanceSummary(people);
    if (summary.textContent !== status) summary.textContent = status;
  }

  $('council-guest-form').addEventListener('submit', event => {
    event.preventDefault();
    const result = attendance.add(guest.value);
    if (result.error) { feedback(result.error); return; }
    guest.value = '';
    saveFeedback(result.saved);
    rows.get(result.name).actions.get('present').focus({ preventScroll: true });
    rows.get(result.name).row.scrollIntoView({ block: 'nearest' });
  });
  renderRoster();

  return {
    snapshot: () => ({ date: attendance.date, attendance: attendance.fixed(), pending: previous.carryoverTopic }),
  };
}
