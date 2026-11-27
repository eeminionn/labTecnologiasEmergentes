import './council-timer.css';

const priorities = { urgente: 'Urgente', prioritario: 'Prioritario', programado: 'Programado' };

const topics = [
  {
    time: '09:00', priority: 'urgente', theme: 'seguridad', pointId: 'point-0',
    title: 'Anegamientos y drenaje',
    description: 'Sectores afectados, desvíos y limpieza de sumideros.'
  },
  {
    time: '09:20', priority: 'urgente', theme: 'seguridad',
    title: 'Cámaras y casetas de seguridad',
    description: 'Cobertura actual y sectores que requieren refuerzo.'
  },
  {
    time: '09:40', priority: 'prioritario', theme: 'territorio', pointId: 'point-2',
    title: 'Congestión en hora punta',
    description: 'Cruces con demoras y alternativas de circulación.'
  },
  {
    time: '10:00', priority: 'prioritario', theme: 'territorio',
    title: 'Iluminación en cruces peatonales',
    description: 'Cruces con baja visibilidad y luminarias por renovar.'
  },
  {
    time: '10:20', priority: 'programado', theme: 'territorio',
    title: 'Sombra en recorridos peatonales',
    description: 'Tramos expuestos y ubicaciones para incorporar arbolado.'
  },
  {
    time: '10:40', priority: 'programado', theme: 'gobernanza', pointId: 'point-1',
    title: 'Presupuesto y seguimiento de acuerdos',
    description: 'Recursos disponibles, compromisos y próximos plazos.'
  }
];

export function createCouncilAgenda(panel, { onChange = () => {} } = {}) {
  const list = panel.querySelector('#council-agenda-list');
  const currentTopic = panel.querySelector('.council-agenda-current');
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
  const timerSeek = panel.querySelector('#council-timer-seek');
  const reminder = document.getElementById('council-timer-notice');
  const reminderTitle = document.getElementById('council-timer-notice-title');
  const reminderTopic = document.getElementById('council-timer-notice-topic');
  const reminderClose = document.getElementById('council-timer-notice-close');
  const durations = topics.map((topic, index) => {
    const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
    const following = topics[index + 1];
    return (following ? minutes(following.time) - minutes(topic.time) : 20) * 60000;
  });
  const clocks = durations.map(duration => ({
    elapsedMs: 0, startedAt: null, paused: false, visited: false,
    lastRemainingMs: duration, notices: new Set(),
  }));
  const thresholds = [600000, 300000];
  let current = -1;
  let notice = null;
  let noticeSerial = 0;
  let publishedSecond;
  let publishedNotice;

  function elapsed(clock, now = Date.now()) {
    return clock.elapsedMs + (clock.startedAt === null ? 0 : Math.max(0, now - clock.startedAt));
  }

  function getState(now = Date.now()) {
    const clock = clocks[current];
    const remainingMs = durations[current] - elapsed(clock, now);
    return {
      index: current,
      topic: { ...topics[current] },
      topics: topics.map((topic, index) => ({
        ...topic, status: index === current ? 'current' : clocks[index].visited ? 'reviewed' : 'pending',
      })),
      durationSeconds: durations[current] / 1000,
      remainingSeconds: Math.sign(remainingMs) * Math.ceil(Math.abs(remainingMs) / 1000),
      running: clock.startedAt !== null,
      overtime: remainingMs < 0,
      notice: notice ? { ...notice } : null,
    };
  }

  function checkThresholds(now, rearm) {
    const clock = clocks[current];
    const remainingMs = durations[current] - elapsed(clock, now);
    if (notice && now >= notice.expiresAt) notice = null;
    if (rearm && remainingMs > clock.lastRemainingMs) {
      for (const threshold of thresholds) if (remainingMs > threshold) clock.notices.delete(threshold);
      notice = null;
    }
    const crossed = thresholds.filter(threshold => clock.lastRemainingMs > threshold
      && remainingMs <= threshold && !clock.notices.has(threshold));
    if (crossed.length) {
      for (const threshold of crossed) clock.notices.add(threshold);
      notice = remainingMs > 0 ? {
        id: ++noticeSerial, minutes: Math.min(...crossed) / 60000,
        topic: topics[current].title, expiresAt: now + 8000,
      } : null;
    }
    if (remainingMs <= 0) notice = null;
    clock.lastRemainingMs = remainingMs;
  }

  function updateTimer({ rearm = false } = {}) {
    const now = Date.now();
    checkThresholds(now, rearm);
    const state = getState(now);
    const seconds = Math.abs(state.remainingSeconds);
    const minutesText = String(Math.floor(seconds / 60)).padStart(2, '0');
    const secondsText = String(seconds % 60).padStart(2, '0');
    timerValue.textContent = `${state.remainingSeconds < 0 ? '−' : ''}${minutesText}:${secondsText}`;
    timerLabel.textContent = state.overtime ? 'Tiempo excedido' : 'Tiempo restante';
    timer.dataset.overtime = String(state.overtime);
    timerToggle.textContent = state.running ? 'Pausar' : 'Reanudar';
    timerToggle.setAttribute('aria-label', state.running ? 'Pausar tiempo del tema' : 'Reanudar tiempo del tema');
    timerFill.style.width = `${Math.max(0, Math.min(100, state.remainingSeconds / state.durationSeconds * 100))}%`;
    timerSeek.max = String(state.durationSeconds);
    timerSeek.value = String(Math.max(0, state.remainingSeconds));
    timerSeek.setAttribute('aria-valuetext', `${minutesText}:${secondsText} ${state.overtime ? 'de tiempo excedido' : 'restantes'}`);
    if (notice && reminder.dataset.notice !== String(notice.id)) {
      reminderTitle.textContent = `Quedan ${notice.minutes} minutos`;
      reminderTopic.textContent = notice.topic;
      reminder.dataset.notice = String(notice.id);
    }
    reminder.hidden = !notice;
    return state;
  }

  function publishState(state) {
    publishedSecond = state.remainingSeconds;
    publishedNotice = state.notice?.id ?? null;
    onChange(state);
    panel.dispatchEvent(new CustomEvent('council-agenda-change', { bubbles: true, detail: state }));
  }

  function announceChange(options) {
    publishState(updateTimer(options));
  }

  const choices = topics.map((topic, index) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'council-agenda-choice';
    button.dataset.theme = topic.theme;
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
    clocks[current].visited = true;
    notice = null;
    if (!clocks[current].paused) clocks[current].startedAt = Date.now();
    choices[index].button.setAttribute('aria-current', 'true');
    currentTopic.dataset.theme = topic.theme;
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
    clock.lastRemainingMs = durations[current];
    clock.notices.clear();
    notice = null;
    announceChange();
  });
  timerSeek.addEventListener('input', () => {
    const clock = clocks[current];
    clock.elapsedMs = durations[current] - timerSeek.valueAsNumber * 1000;
    clock.startedAt = clock.paused ? null : Date.now();
    announceChange({ rearm: true });
  });
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'mousedown', 'click', 'dblclick', 'touchstart']) {
    timerSeek.addEventListener(type, event => {
      event.stopPropagation();
      if (type === 'pointerdown' && event.isTrusted) timerSeek.setPointerCapture(event.pointerId);
      if (type === 'pointerup' && timerSeek.hasPointerCapture(event.pointerId)) timerSeek.releasePointerCapture(event.pointerId);
    });
  }
  reminderClose.addEventListener('click', () => {
    notice = null;
    announceChange();
  });
  select(0);
  const interval = setInterval(() => {
    const state = updateTimer();
    if (state.remainingSeconds !== publishedSecond || (state.notice?.id ?? null) !== publishedNotice) publishState(state);
  }, 250);

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
