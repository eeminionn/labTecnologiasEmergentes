import './council-timer.css';

const priorities = { urgente: 'Urgente', prioritario: 'Prioritario', programado: 'Programado' };

const topics = [
  {
    time: '09:00', priority: 'urgente', pointId: 'point-0',
    title: 'Anegamientos y drenaje',
    description: 'Sectores afectados, desvíos y limpieza de sumideros.'
  },
  {
    time: '09:20', priority: 'urgente',
    title: 'Cámaras y casetas de seguridad',
    description: 'Cobertura actual y sectores que requieren refuerzo.'
  },
  {
    time: '09:40', priority: 'prioritario', pointId: 'point-2',
    title: 'Congestión en hora punta',
    description: 'Cruces con demoras y alternativas de circulación.'
  },
  {
    time: '10:00', priority: 'prioritario',
    title: 'Iluminación en cruces peatonales',
    description: 'Cruces con baja visibilidad y luminarias por renovar.'
  },
  {
    time: '10:20', priority: 'programado',
    title: 'Sombra en recorridos peatonales',
    description: 'Tramos expuestos y ubicaciones para incorporar arbolado.'
  },
  {
    time: '10:40', priority: 'programado', pointId: 'point-1',
    title: 'Presupuesto y seguimiento de acuerdos',
    description: 'Recursos disponibles, compromisos y próximos plazos.'
  }
];

export function createCouncilAgenda(panel, { onChange = () => {} } = {}) {
  const list = panel.querySelector('#council-agenda-list');
  const time = panel.querySelector('#council-current-time');
  const priority = panel.querySelector('#council-current-priority');
  const title = panel.querySelector('#council-current-topic');
  const description = panel.querySelector('#council-current-description');
  const graphics = panel.querySelector('#map-graphics-shortcut');
  const previous = panel.querySelector('#council-agenda-prev');
  const next = panel.querySelector('#council-agenda-next');
  const progress = panel.querySelector('#council-agenda-progress');
  const timer = panel.querySelector('.council-topic-timer');
  const timerLabel = panel.querySelector('#council-timer-label');
  const timerValue = panel.querySelector('#council-timer-value');
  const timerToggle = panel.querySelector('#council-timer-toggle');
  const timerReset = panel.querySelector('#council-timer-reset');
  const timerFill = panel.querySelector('#council-timer-fill');
  const durations = topics.map((topic, index) => {
    const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
    const following = topics[index + 1];
    return (following ? minutes(following.time) - minutes(topic.time) : 20) * 60000;
  });
  const clocks = topics.map(() => ({ elapsedMs: 0, startedAt: null, paused: false }));
  let current = -1;

  function elapsed(clock, now = Date.now()) {
    return clock.elapsedMs + (clock.startedAt === null ? 0 : Math.max(0, now - clock.startedAt));
  }

  function getState() {
    const clock = clocks[current];
    const remainingMs = durations[current] - elapsed(clock);
    return {
      index: current,
      topic: { ...topics[current] },
      durationSeconds: durations[current] / 1000,
      remainingSeconds: Math.sign(remainingMs) * Math.ceil(Math.abs(remainingMs) / 1000),
      running: clock.startedAt !== null,
      overtime: remainingMs < 0,
    };
  }

  function updateTimer() {
    const state = getState();
    const seconds = Math.abs(state.remainingSeconds);
    const minutesText = String(Math.floor(seconds / 60)).padStart(2, '0');
    const secondsText = String(seconds % 60).padStart(2, '0');
    timerValue.textContent = `${state.remainingSeconds < 0 ? '−' : ''}${minutesText}:${secondsText}`;
    timerLabel.textContent = state.overtime ? 'Tiempo excedido' : 'Tiempo restante';
    timer.dataset.overtime = String(state.overtime);
    timerToggle.textContent = state.running ? 'Pausar' : 'Reanudar';
    timerToggle.setAttribute('aria-label', state.running ? 'Pausar tiempo del tema' : 'Reanudar tiempo del tema');
    timerFill.style.width = `${Math.max(0, Math.min(100, state.remainingSeconds / state.durationSeconds * 100))}%`;
    return state;
  }

  function announceChange() {
    const state = updateTimer();
    onChange(state);
    panel.dispatchEvent(new CustomEvent('council-agenda-change', { bubbles: true, detail: state }));
  }

  const choices = topics.map((topic, index) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'council-agenda-choice';
    const scheduledTime = document.createElement('time');
    scheduledTime.dateTime = topic.time;
    scheduledTime.textContent = topic.time;
    const name = document.createElement('span');
    name.className = 'council-agenda-name';
    name.textContent = topic.title;
    const state = document.createElement('small');
    state.className = 'council-agenda-choice-state';
    state.textContent = priorities[topic.priority];
    button.append(scheduledTime, name, state);
    button.addEventListener('click', () => select(index));
    item.append(button);
    list.append(item);
    return { button, state };
  });

  function revealCurrent() {
    if (!list.clientHeight) return;
    const row = choices[current].button.getBoundingClientRect();
    const viewport = list.getBoundingClientRect();
    if (row.top < viewport.top) list.scrollTop += row.top - viewport.top;
    else if (row.bottom > viewport.bottom) list.scrollTop += row.bottom - viewport.bottom;
  }

  function select(index) {
    const topic = topics[index];
    if (!topic || index === current) return;
    if (current >= 0) {
      clocks[current].elapsedMs = elapsed(clocks[current]);
      clocks[current].startedAt = null;
      choices[current].button.removeAttribute('aria-current');
      choices[current].state.textContent = priorities[topics[current].priority];
    }
    current = index;
    if (!clocks[current].paused) clocks[current].startedAt = Date.now();
    choices[index].button.setAttribute('aria-current', 'true');
    choices[index].state.textContent = 'En curso';
    time.dateTime = topic.time;
    time.textContent = topic.time;
    priority.dataset.priority = topic.priority;
    priority.textContent = priorities[topic.priority];
    title.textContent = topic.title;
    description.textContent = topic.description;
    graphics.hidden = topic.pointId !== 'point-0';
    progress.textContent = `${index + 1} de ${topics.length}`;
    previous.setAttribute('aria-disabled', String(index === 0));
    next.setAttribute('aria-disabled', String(index === topics.length - 1));
    revealCurrent();
    announceChange();
  }

  previous.addEventListener('click', () => select(current - 1));
  next.addEventListener('click', () => select(current + 1));
  timerToggle.addEventListener('click', () => {
    const clock = clocks[current];
    clock.elapsedMs = elapsed(clock);
    clock.paused = !clock.paused;
    clock.startedAt = clock.paused ? null : Date.now();
    announceChange();
  });
  timerReset.addEventListener('click', () => {
    const clock = clocks[current];
    clock.elapsedMs = 0;
    clock.startedAt = clock.paused ? null : Date.now();
    announceChange();
  });
  select(0);
  const interval = setInterval(updateTimer, 250);

  return {
    getState,
    destroy() { clearInterval(interval); },
    selectPoint: pointId => select(topics.findIndex(topic => topic.pointId === pointId)),
    focus() {
      revealCurrent();
      choices[current].button.focus({ preventScroll: true });
    }
  };
}
