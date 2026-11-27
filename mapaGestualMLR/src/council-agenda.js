import './council-timer.css';
import { createCouncilOpening } from './council-opening.js';
import { COUNCIL_THEME_LABELS } from './map-topics.js';

const priorities = { urgente: 'Urgente', prioritario: 'Prioritario', programado: 'Programado' };
const openingTopic = {
  time: '09:00', title: 'Apertura de la sesión',
  description: 'Asistencia, pendientes y tabla de hoy.'
};
const openingDuration = 15 * 60000;

const topics = [
  {
    time: '09:15', priority: 'urgente', theme: 'seguridad',
    title: 'Robos por sector',
    description: 'Dónde se concentran los robos y qué sectores reúnen más casos.',
    analysisLayer: 'security', action: 'Consultar robos'
  },
  {
    time: '09:35', priority: 'urgente', theme: 'seguridad',
    title: 'Cámaras y casetas de seguridad',
    description: 'Comparar la cobertura con los robos para orientar refuerzos.',
    analysisLayer: 'cameras', action: 'Consultar cámaras'
  },
  {
    time: '09:55', priority: 'prioritario', theme: 'seguridad',
    title: 'Botones de emergencia',
    description: 'Revisar cuáles reciben más pulsaciones y dónde están.',
    analysisLayer: 'alarms', action: 'Consultar botones de emergencia'
  },
  {
    time: '10:10', priority: 'prioritario', theme: 'seguridad', pointId: 'point-0',
    title: 'Anegamientos y drenaje',
    description: 'Sectores afectados, desvíos y limpieza de sumideros.'
  },
  {
    time: '10:25', priority: 'prioritario', theme: 'gobernanza', pointId: 'point-1',
    title: 'Presupuesto y seguimiento de acuerdos',
    description: 'Retomar el pendiente de la sesión pasada y revisar los plazos.'
  },
  {
    time: '10:40', priority: 'programado', theme: 'territorio', pointId: 'point-2',
    title: 'Congestión en hora punta',
    description: 'Cruces con demoras y alternativas de circulación.'
  }
];

const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
const makeClock = duration => ({
  elapsedMs: 0, startedAt: null, paused: false, visited: false,
  lastRemainingMs: duration, notices: new Set(),
});

export function createCouncilAgenda(panel, { startup = true, onChange = () => {} } = {}) {
  const $ = id => panel.querySelector(`#${id}`);
  const list = $('council-agenda-list');
  const currentTopic = panel.querySelector('.council-agenda-current');
  const time = $('council-current-time');
  const priority = $('council-current-priority');
  const title = $('council-current-topic');
  const description = $('council-current-description');
  const graphics = $('map-graphics-shortcut');
  const analysis = $('map-analysis-shortcut');
  const previous = $('council-agenda-prev');
  const next = $('council-agenda-next');
  const progress = $('council-agenda-progress');
  const timer = panel.querySelector('.council-topic-timer');
  const timerLabel = $('council-timer-label');
  const timerValue = $('council-timer-value');
  const timerToggle = $('council-timer-toggle');
  const timerReset = $('council-timer-reset');
  const timerFill = $('council-timer-fill');
  const timerSeek = $('council-timer-seek');
  const reminder = document.getElementById('council-timer-notice');
  const reminderTitle = document.getElementById('council-timer-notice-title');
  const reminderTopic = document.getElementById('council-timer-notice-topic');
  const reminderClose = document.getElementById('council-timer-notice-close');
  const reviewPanel = $('council-review');
  const openingPanel = $('council-opening');
  const openingActions = $('council-opening-actions');
  const openingStep = $('council-opening-step');
  const startLabel = $('council-start-agenda-label');
  const editAttendance = $('council-edit-attendance');
  const agendaPanels = [panel.querySelector('.council-agenda-heading'), currentTopic, list, panel.querySelector('.council-agenda-nav')];
  const durations = topics.map((topic, index) => {
    const following = topics[index + 1];
    return (following ? minutes(following.time) - minutes(topic.time) : 20) * 60000;
  });
  const clocks = durations.map(makeClock);
  const openingClock = makeClock(openingDuration);
  const thresholds = [600000, 300000];
  let phase = startup ? 'previous' : 'agenda';
  let current = -1;
  let notice = null;
  let noticeSerial = 0;
  let publishedSecond;
  let publishedNotice;
  const opening = startup ? createCouncilOpening(panel, topics, {
    onAttendanceChange: () => announceChange(),
    review: reviewPrevious,
    open: openSession,
    start: startAgenda,
    themes: COUNCIL_THEME_LABELS,
  }) : null;

  function activeClock() { return phase === 'opening' ? openingClock : phase === 'agenda' ? clocks[current] : null; }
  function activeDuration() { return phase === 'opening' ? openingDuration : durations[current]; }
  function activeTopic() { return phase === 'opening' ? openingTopic : phase === 'agenda' ? topics[current] : null; }
  function elapsed(clock, now = Date.now()) {
    return clock.elapsedMs + (clock.startedAt === null ? 0 : Math.max(0, now - clock.startedAt));
  }
  function stopClock(clock) {
    if (!clock) return;
    clock.elapsedMs = elapsed(clock);
    clock.startedAt = null;
  }
  function resumeClock(clock) {
    if (!clock.paused) clock.startedAt = Date.now();
  }

  function getState(now = Date.now()) {
    const clock = activeClock();
    const remainingMs = clock ? activeDuration() - elapsed(clock, now) : null;
    return {
      phase,
      index: current,
      topic: activeTopic(),
      topics: topics.map((topic, index) => ({
        ...topic, status: index === current ? 'current' : clocks[index].visited ? 'reviewed' : 'pending',
      })),
      durationSeconds: clock ? activeDuration() / 1000 : null,
      remainingSeconds: clock ? Math.sign(remainingMs) * Math.ceil(Math.abs(remainingMs) / 1000) : null,
      running: clock?.startedAt != null,
      overtime: remainingMs < 0,
      notice: notice ? { ...notice } : null,
      ...(phase === 'opening' ? { opening: opening.snapshot() } : {}),
    };
  }

  function checkThresholds(now, rearm, clock) {
    const remainingMs = activeDuration() - elapsed(clock, now);
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
        topic: activeTopic().title, expiresAt: now + 8000,
      } : null;
    }
    if (remainingMs <= 0) notice = null;
    clock.lastRemainingMs = remainingMs;
  }

  function updateTimer({ rearm = false } = {}) {
    const now = Date.now();
    const clock = activeClock();
    if (!clock) return getState(now);
    checkThresholds(now, rearm, clock);
    const state = getState(now);
    const seconds = Math.abs(state.remainingSeconds);
    const minutesText = String(Math.floor(seconds / 60)).padStart(2, '0');
    const secondsText = String(seconds % 60).padStart(2, '0');
    const display = `${state.remainingSeconds < 0 ? '−' : ''}${minutesText}:${secondsText}`;
    if (timerValue.textContent !== display) timerValue.textContent = display;
    timerLabel.textContent = state.overtime ? 'Tiempo excedido' : 'Tiempo restante';
    timer.dataset.overtime = String(state.overtime);
    timerToggle.textContent = state.running ? 'Pausar' : 'Reanudar';
    const subject = phase === 'opening' ? 'de la apertura' : 'del tema';
    timerToggle.setAttribute('aria-label', `${state.running ? 'Pausar' : 'Reanudar'} tiempo ${subject}`);
    timerReset.setAttribute('aria-label', `Reiniciar tiempo ${subject}`);
    timerReset.title = `Reiniciar tiempo ${subject}`;
    timerSeek.setAttribute('aria-label', `Ajustar tiempo restante ${subject}`);
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

  function setPhase(nextPhase) {
    phase = nextPhase;
    reviewPanel.hidden = phase !== 'previous';
    openingPanel.hidden = phase !== 'opening';
    openingActions.hidden = phase !== 'opening';
    openingStep.hidden = current >= 0;
    startLabel.textContent = current >= 0 ? 'Retomar la tabla' : 'Comenzar la tabla';
    if (phase === 'opening') openingActions.prepend(timer);
    else panel.append(timer);
    agendaPanels.forEach(part => { part.hidden = phase !== 'agenda'; });
    timer.hidden = phase === 'previous';
    reminder.hidden = true;
    notice = null;
    timer.setAttribute('aria-label', phase === 'opening' ? 'Tiempo de apertura' : 'Tiempo del tema en curso');
    panel.setAttribute('aria-labelledby', phase === 'previous' ? 'council-review-title'
      : phase === 'opening' ? 'council-opening-title' : 'map-intro-title');
  }

  function reviewPrevious() {
    if (phase !== 'opening') return;
    stopClock(openingClock);
    setPhase('previous');
    $('council-review-title').focus({ preventScroll: true });
    announceChange();
  }

  function openSession() {
    if (!opening || phase === 'opening') return;
    if (phase === 'agenda') stopClock(clocks[current]);
    setPhase('opening');
    resumeClock(openingClock);
    $('council-opening-title').focus({ preventScroll: true });
    announceChange();
  }

  function startAgenda() {
    if (phase !== 'opening') return;
    stopClock(openingClock);
    setPhase('agenda');
    if (current < 0) select(0);
    else {
      resumeClock(clocks[current]);
      revealCurrent();
      announceChange();
    }
    title.focus({ preventScroll: true });
  }

  const choices = topics.map((topic, index) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'council-agenda-choice';
    button.dataset.theme = topic.theme;
    button.title = COUNCIL_THEME_LABELS[topic.theme];
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
    if (!list.clientHeight || current < 0) return;
    const row = choices[current].button.getBoundingClientRect();
    const viewport = list.getBoundingClientRect();
    if (row.top < viewport.top) list.scrollTop += row.top - viewport.top;
    else if (row.bottom > viewport.bottom) list.scrollTop += row.bottom - viewport.bottom;
  }

  function select(index) {
    const topic = topics[index];
    if (phase !== 'agenda' || !topic || index === current) return;
    if (current >= 0) {
      stopClock(clocks[current]);
      choices[current].button.removeAttribute('aria-current');
      choices[current].state.textContent = priorities[topics[current].priority];
    }
    current = index;
    clocks[current].visited = true;
    notice = null;
    resumeClock(clocks[current]);
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
    analysis.hidden = !topic.analysisLayer;
    if (topic.action) analysis.firstElementChild.textContent = topic.action;
    progress.textContent = `${index + 1} de ${topics.length}`;
    previous.setAttribute('aria-disabled', String(index === 0));
    next.setAttribute('aria-disabled', String(index === topics.length - 1));
    revealCurrent();
    announceChange();
  }

  previous.addEventListener('click', () => select(current - 1));
  next.addEventListener('click', () => select(current + 1));
  editAttendance.hidden = !opening;
  editAttendance.addEventListener('click', openSession);
  timerToggle.addEventListener('click', () => {
    const clock = activeClock();
    if (!clock) return;
    stopClock(clock);
    clock.paused = !clock.paused;
    resumeClock(clock);
    announceChange();
  });
  timerReset.addEventListener('click', () => {
    const clock = activeClock();
    if (!clock) return;
    clock.elapsedMs = 0;
    resumeClock(clock);
    clock.lastRemainingMs = activeDuration();
    clock.notices.clear();
    notice = null;
    announceChange();
  });
  timerSeek.addEventListener('input', () => {
    const clock = activeClock();
    if (!clock) return;
    clock.elapsedMs = activeDuration() - timerSeek.valueAsNumber * 1000;
    resumeClock(clock);
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
  setPhase(phase);
  if (phase === 'agenda') select(0);
  const interval = setInterval(() => {
    if (phase === 'previous') return;
    const state = updateTimer();
    if (state.remainingSeconds !== publishedSecond || (state.notice?.id ?? null) !== publishedNotice) publishState(state);
  }, 250);

  return {
    get phase() { return phase; },
    getState,
    destroy() { clearInterval(interval); },
    selectPoint: pointId => select(topics.findIndex(topic => topic.pointId === pointId)),
    focus() {
      if (current < 0) return;
      revealCurrent();
      choices[current].button.focus({ preventScroll: true });
    }
  };
}
